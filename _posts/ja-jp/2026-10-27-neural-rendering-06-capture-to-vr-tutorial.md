---
layout: post
title: "スマホ撮影から VR まで：3D Gaussian Splatting ハンズオンチュートリアル"
date: 2026-10-27 12:06:00+0900
description: "実践的なステップバイステップのワークフローです：写真や動画を撮影し、COLMAP を実行し、公式コード、gsplat、または nerfstudio の splatfacto で 3DGS を学習させ、.ply をクリーンアップしてエクスポートし、Web と VR ヘッドセットで表示します。よくある失敗パターンとその対処法も紹介します。"
categories: neural-rendering
tags: [3d-gaussian-splatting, tutorial, colmap, gsplat, nerfstudio, webxr, vr]
series: neural-rendering
series_order: 6
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

5 回分の理論も、自分のシーンを撮影して探索してみるまではあまり役に立ちません。このチュートリアルでは、1 枚のコンシューマ向け GPU でパイプライン（pipeline）全体を通して実行します。**撮影 → 姿勢推定（COLMAP）→ 学習（3DGS）→ クリーンアップとエクスポート → ブラウザと VR での表示**です。各ステップは理論と対応しています。[第 1 回]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})のカメラモデルと SfM、[第 4 回]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})の最適化、そして[第 5 回]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})のアンチエイリアシングと VR に関する考慮事項です。何かがうまくいかないとき（そして必ず何かはうまくいきません）、末尾の失敗パターン表が、どの考え方に立ち返るべきかを教えてくれます。

ツールはすぐに変わります。以下のコマンドは COLMAP、公式 3DGS リポジトリ、gsplat、nerfstudio の現在のソースと照らし合わせて確認しました。お使いのバージョンでフラグの名前が変わっている場合は、`--help` が正解です。

## 前提条件

- CUDA 対応の NVIDIA GPU（小さなシーンを解像度を下げて扱うなら 8 GB の VRAM で十分です。フル解像度の屋外シーンなら 24 GB あれば余裕があります）、Linux または Windows。
- PyTorch と CUDA を備えた Python 3.10 以上、`conda` または `venv`、`ffmpeg`、そして COLMAP（ビルド済みバイナリまたは CUDA ビルド）。
- スマートフォンまたはカメラ。任意：WebXR 対応のヘッドセット（たとえば Chromium ベースのブラウザを搭載したスタンドアロン型ヘッドセット）。

## 1. 撮影

撮影の品質は、どんなハイパーパラメータよりも結果を大きく左右します。3DGS には、**シャープで、互いに重なり合い、露出が一貫した多数のビュー**が必要です。しかも、レンダリングしたいすべての表面が複数の方向から見えていなければなりません。

**やるべきこと：**

- **露出、ホワイトバランス、フォーカスを固定する**（「AE/AF ロック」やマニュアル／プロモードを使います）。フレーム間で露出が変わると、オプティマイザにはマテリアルが変わったように見えてしまいます。
- **カメラを回転させるだけでなく、移動させる。** SfM とスプラッティングには視差（parallax）が必要です。物体の周りを歩いたり、部屋の中を歩き回ったりしてください。1 か所に立ったまま回転するだけでは奥行きが得られません。
- **重なりはたっぷりと：** 新しい写真はそれぞれ、直前の写真と内容のおよそ 60〜80% を共有するようにします。
- 物体の場合：高さを変えて 2〜3 周の**周回撮影**（orbit）を行います（例：目の高さ、上から、低い位置から）。物体が画面のかなりの部分を占めるようにしてください。部屋の場合：壁沿いに内側を向いて 1 周歩き、続いて外側を向いてもう 1 周歩きます。
- **照明は均一に。** 曇りの日の自然光や拡散した室内照明が理想的です。強い影やハイライトはモデルに焼き込まれてしまいます。
- 典型的な枚数：物体や小さな部屋なら **100〜300 枚**、より大きなシーンなら数百枚です。

**避けるべきこと：** モーションブラー（十分な光と速いシャッタースピードを使うか、動画ではなく写真を撮る）、動く人や物体、鏡、ガラスや非常に光沢のある表面、テクスチャのない大きな壁、そしてデジタルズーム。超広角レンズや魚眼レンズも使えますが、COLMAP で適切なカメラモデルを選び、歪み補正（undistortion）を行う必要があります。

**写真の代わりに動画を使う。** 動画は手軽ですが、各フレームにはより多くのモーションブラーと圧縮劣化が含まれます。利用できる最高の解像度とフレームレートで録画し、ゆっくり動き、1 秒あたり 2〜3 フレームを抽出してください。

```bash
mkdir -p scene/input
ffmpeg -i capture.mp4 -qscale:v 1 -qmin 1 -vf "fps=2" scene/input/%04d.jpg
```

その後、明らかにぶれているフレームを削除します。手早く順位付けする方法として、ラプラシアンの分散（variance of the Laplacian、シャープネスのスコア）があります。

```python
import sys, glob
import cv2

paths = sorted(glob.glob(sys.argv[1] + "/*.jpg"))
scores = []
for p in paths:
    g = cv2.imread(p, cv2.IMREAD_GRAYSCALE)
    scores.append((cv2.Laplacian(g, cv2.CV_64F).var(), p))
scores.sort()
print("blurriest 10% (consider deleting):")
for s, p in scores[: max(1, len(scores) // 10)]:
    print(f"{s:8.1f}  {p}")
```

## 2. COLMAP によるカメラ姿勢の推定

ここで第 1 回のインクリメンタル（incremental）SfM を実行します。公式 3DGS リポジトリは次のディレクトリ構成を前提としています。

```text
scene/
  input/          your photos (distorted, any camera model)
  images/         undistorted images            <- created below
  sparse/0/       cameras.bin images.bin points3D.bin (PINHOLE)  <- created below
```

### 2.1 個々のステップ

```bash
cd scene
mkdir -p distorted/sparse

# 1. SIFT features; one shared camera for all images, OPENCV model (k1, k2, p1, p2)
colmap feature_extractor \
    --database_path distorted/database.db \
    --image_path input \
    --ImageReader.single_camera 1 \
    --ImageReader.camera_model OPENCV \
    --FeatureExtraction.use_gpu 1

# 2. Matching: exhaustive for < ~500 images; use sequential_matcher for video frames
colmap exhaustive_matcher \
    --database_path distorted/database.db \
    --FeatureMatching.use_gpu 1

# 3. Incremental SfM (registration, triangulation, bundle adjustment)
colmap mapper \
    --database_path distorted/database.db \
    --image_path input \
    --output_path distorted/sparse

# 4. Undistort to an ideal PINHOLE camera, as required by the 3DGS rasterizer
colmap image_undistorter \
    --image_path input \
    --input_path distorted/sparse/0 \
    --output_path . \
    --output_type COLMAP

# the undistorter writes sparse/*.bin; the 3DGS loader expects sparse/0/
mkdir -p sparse/0 && mv sparse/*.bin sparse/0/
```

注意点：

- **最近の COLMAP リリースではオプション名が変わりました。** 現在の COLMAP は `--FeatureExtraction.use_gpu` と `--FeatureMatching.use_gpu` を使いますが、古いリリース（および、いまだに `--SiftExtraction.use_gpu` / `--SiftMatching.use_gpu` を渡している公式 3DGS の `convert.py`）は古い名前を使います。`convert.py` が最初のステップで未知のオプションのエラーで失敗する場合、原因はこれです。上のコマンドを手で実行するか、`convert.py` 内の 2 つのオプション名を書き換えてください。
- すべての画像がズーム固定の 1 台のカメラで撮影されている場合は `single_camera 1` が適切です。複数のカメラが混在する場合は外してください。
- CPU のみのマシンでは、`use_gpu` オプションを 0 にします。動作はしますが、遅くなるだけです。
- 大規模な撮影には、**大域的 SfM**（global SfM）がより高速な代替手段です。COLMAP には現在 `global_mapper` コマンド（第 1 回の GLOMAP のアプローチ）が同梱されています。COLMAP のドキュメントでは、まずデータベースのコピーに対して `view_graph_calibrator` を実行することが推奨されています。単体の [GLOMAP](https://github.com/colmap/glomap) も同じデータベースを読み込みます。

1 行で済ませたい場合は、公式リポジトリのスクリプトがステップ 1〜4 を代わりに実行してくれます（先に写真を `scene/input` に置いてください）。

```bash
python convert.py -s scene            # add --resize to also create 1/2, 1/4, 1/8 images
```

### 2.2 学習前に再構成を確認する

ここでの 5 分が、後の何時間もの節約になります。

```bash
colmap model_analyzer --path sparse/0
colmap gui --import_path sparse/0 --database_path distorted/database.db --image_path images
```

確認すべき点は次のとおりです。**ほぼすべての画像が登録されていること**（COLMAP がシーンを複数のモデルに分割した場合、`distorted/sparse/1`、`2`、… が存在し、撮影のどこかで重なりが不足しています）、**平均再投影誤差（reprojection error）がおよそ 1 px 未満であること**、そして点群とカメラの軌跡が実際のシーンらしく見えることです。カメラが欠けている場合は、パラメータを調整するのではなく、隙間をつなぐ写真を追加してください。

## 3. 学習

3 つの実装から 1 つを選びます。どれも互換性のある `.ply` ファイルを出力します。

### 3.1 公式 INRIA コード

```bash
git clone https://github.com/graphdeco-inria/gaussian-splatting --recursive
cd gaussian-splatting
conda env create --file environment.yml
conda activate gaussian_splatting

python train.py -s ../scene -m output/scene            # 30k iterations by default
python train.py -s ../scene -m output/scene_eval --eval # hold out every 8th image for testing
python render.py -m output/scene_eval                   # render train/test views
python metrics.py -m output/scene_eval                  # PSNR, SSIM, LPIPS
```

`train.py` の便利なオプション（すべて `arguments/__init__.py` にあります）：

| オプション | 効果 |
| --- | --- |
| `-r 2` / `-r 4` | 1/2 または 1/4 の解像度で学習する（幅が 1.6K ピクセルを超える画像は自動的に縮小されます） |
| `--data_device cpu` | VRAM が足りない場合に画像を CPU メモリに置く |
| `--iterations 7000` | 手早いプレビュー。デフォルトでは 7k と 30k で保存されます |
| `--densify_grad_threshold 0.0002` | 第 4 回の $\tau_{\text{pos}}$。大きくするとガウシアンが少なくなります |
| `--antialiasing` | 単純な膨張の代わりに Mip-Splatting の 2D Mip フィルタ（第 5 回）を使う |
| `--train_test_exp` | 露出が変化する撮影に対する画像ごとの露出補正 |
| `--white_background` | 白背景の合成シーン向け |

学習済みモデルは `output/scene/point_cloud/iteration_30000/point_cloud.ply` にあります。リポジトリには SIBR リアルタイムビューア（`SIBR_gaussianViewer_app -m output/scene`）と、学習の様子をライブで見られるネットワークビューアも含まれています。

### 3.2 gsplat

[gsplat](https://github.com/nerfstudio-project/gsplat) はより高速でメモリ使用量も少なく、第 5 回の各種変種をオプションとして提供しています。

```bash
pip install gsplat
git clone https://github.com/nerfstudio-project/gsplat && cd gsplat/examples
pip install -r requirements.txt --no-build-isolation

# the classic recipe (DefaultStrategy: clone / split / prune)
python simple_trainer.py default --data_dir ../../scene --data_factor 1 \
    --result_dir results/scene --save_ply

# 3DGS-MCMC densification with a fixed Gaussian budget, and anti-aliased rasterization
python simple_trainer.py mcmc --data_dir ../../scene --data_factor 1 \
    --result_dir results/scene_mcmc --antialiased --save_ply
```

`--data_factor 4` は 1/4 に縮小された画像を読み込みます（`images_4/` フォルダが必要で、これは `convert.py --resize` で作成されます）。`.ply` ファイルは `results/<name>/ply/point_cloud_<step>.ply` に出力され、学習中はブラウザビューア（Viser）が動作します。

### 3.3 nerfstudio splatfacto

[nerfstudio](https://docs.nerf.studio/) は COLMAP と学習を 2 つのコマンドにまとめており、最も使いやすいビューアを備えています。

```bash
pip install nerfstudio
ns-process-data images --data scene/input --output-dir scene_ns     # or: ns-process-data video --data capture.mp4 ...
ns-train splatfacto --data scene_ns                                  # 'splatfacto-big' for higher quality
ns-export gaussian-splat --load-config outputs/scene_ns/splatfacto/<timestamp>/config.yml \
    --output-dir exports/splat
```

Splatfacto は gsplat の上に構築されています。なお、`ns-export gaussian-splat` はスプラットモデルにしか使えず、`nerfacto` のような NeRF 手法には使えません。

### 3.4 期待される結果

学習時の PSNR とガウシアンの数を観察してください。数は 15k イテレーションで高密度化（densification）が止まるまで急速に増え、その後は横ばいになります。部屋や屋外シーンでは、100 万から数百万個のガウシアンが典型的です。7k イテレーションのプレビューで、たいていその撮影がうまくいっているかどうかがわかります。テストビューの PSNR が学習時の PSNR を大きく下回る場合、モデルは少なすぎる、あるいは似すぎたビューに過学習しています。もっと撮影してください。

## 4. `.ply` の確認、クリーンアップ、変換

3DGS の `.ply` は、頂点ごとに追加のプロパティを持つ点群です。`x y z`、`nx ny nz`（未使用）、`f_dc_0..2`（0 次の SH）、`f_rest_0..44`（高次の SH）、`opacity`（ロジット）、`scale_0..2`（対数）、`rot_0..3`（四元数 $w, x, y, z$、正規化されていない）です。次のスクリプトは統計情報を表示し、最もよくあるゴミを取り除きます。ほぼ透明なガウシアン、少数の巨大な塊、そして遠く離れた外れ値です。

```python
import sys
import numpy as np
from plyfile import PlyData, PlyElement

def load_3dgs_ply(path):
    v = PlyData.read(path)["vertex"].data
    xyz = np.stack([v["x"], v["y"], v["z"]], -1)
    opacity = 1.0 / (1.0 + np.exp(-v["opacity"]))                      # stored as logits
    scales = np.exp(np.stack([v[f"scale_{i}"] for i in range(3)], -1))   # stored as log-scales
    dc = np.stack([v[f"f_dc_{i}"] for i in range(3)], -1)
    rgb = np.clip(0.5 + 0.28209479177387814 * dc, 0, 1)                 # degree-0 SH -> base colour
    return v, xyz, opacity, scales, rgb

def clean(v, xyz, opacity, scales, min_opacity=0.02, max_scale_pct=99.5, keep_radius_pct=99.0):
    """Drop nearly transparent Gaussians, the largest 'blobs', and far-away outliers."""
    center = np.median(xyz, 0)
    dist = np.linalg.norm(xyz - center, axis=1)
    keep = (opacity > min_opacity)
    keep &= scales.max(1) < np.percentile(scales.max(1), max_scale_pct)
    keep &= dist < np.percentile(dist, keep_radius_pct)
    return v[keep], keep

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    v, xyz, opacity, scales, rgb = load_3dgs_ply(src)
    print(f"{len(xyz):,} Gaussians, SH rest coeffs: {sum(n.startswith('f_rest') for n in v.dtype.names)}")
    print("median opacity %.3f, median max-scale %.4f" % (np.median(opacity), np.median(scales.max(1))))
    print("bounding box:", xyz.min(0).round(2), xyz.max(0).round(2))
    kept, mask = clean(v, xyz, opacity, scales)
    print(f"kept {mask.sum():,} / {len(mask):,}")
    PlyData([PlyElement.describe(kept, "vertex")], text=False).write(dst)
```

```bash
pip install plyfile
python clean_ply.py output/scene/point_cloud/iteration_30000/point_cloud.ply scene_clean.ply
```

自動クリーンアップは大雑把な道具であり、パーセンタイルはあくまで出発点です。精密な編集（ボックスへのクロップ、フローター（floaters）の手作業での削除、シーンを正立させる回転）には、PlayCanvas によるオープンソースのブラウザエディタ **SuperSplat**（[superspl.at](https://superspl.at/)）を使ってください。`.ply` をページにドラッグし、ガウシアンを選択して削除してから、`.ply` または圧縮形式でエクスポートします。圧縮形式は通常、生の `.ply` より数倍小さくなり、これは Web や VR にとって重要です。

## 5. Web で表示する

3DGS ファイルを表示できるオープンソースの WebGL レンダラはいくつかあります。ここでは **Spark** を使います。これは World Labs による three.js レンダラで、`.ply`、`.spz`、`.splat`、`.ksplat`、`.sog` を読み込め、スプラットと通常の three.js メッシュを混在させることができます。次の内容を `index.html` として `scene_clean.ply` と同じ場所に保存してください。

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style> body { margin: 0; } </style>
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
        "@sparkjsdev/spark": "https://sparkjs.dev/releases/spark/2.4.0/spark.module.js"
      }
    }
  </script>
</head>
<body>
<script type="module">
  import * as THREE from "three";
  import { OrbitControls } from "three/addons/controls/OrbitControls.js";
  import { VRButton } from "three/addons/webxr/VRButton.js";
  import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 1000);
  camera.position.set(0, 1.6, 3);

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;                          // WebXR: stereo rendering in a headset
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  scene.add(new SparkRenderer({ renderer }));

  const splat = new SplatMesh({ url: "scene_clean.ply" });
  splat.quaternion.set(1, 0, 0, 0);                    // COLMAP is y-down: rotate 180 deg about x
  splat.position.set(0, 1.2, 0);                       // put the scene around eye height
  scene.add(splat);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, 0);
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
</script>
</body>
</html>
```

フォルダを HTTP で配信します（ブラウザは `file://` からのモジュール読み込みをブロックします）。

```bash
python -m http.server 8000      # then open http://localhost:8000
```

回転の行は重要です。COLMAP と 3DGS は $y$ が下向きの OpenCV の規約（第 1 回）を使いますが、three.js は $y$ が上向きです。three.js の成分順での四元数 $(x, y, z, w) = (1, 0, 0, 0)$ は、$x$ 軸まわりの 180° 回転です。それでもシーンが傾いている場合、それは COLMAP のワールド座標系が任意であるためです（第 1 回、ゲージ自由度（gauge freedom））。SuperSplat で一度まっすぐに直すか、各カメラの上方向ベクトルの平均として上方向を推定してください。

ほかにも知っておくとよいビューアがあります。PlayCanvas エンジンと SuperSplat 自身の公開機能（共有可能なビューアページを作成します）、three.js 向けの [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D)、オリジナルの WebGL ビューア [antimatter15/splat](https://github.com/antimatter15/splat)、そしてデスクトップ向けの公式 SIBR ビューアです。

## 6. VR で表示する

上のページはすでに VR に対応しています。`renderer.xr.enabled` と、`VRButton` が提供する **Enter VR** ボタンによって WebXR セッションが開始され、three.js はヘッドセットのトラッキングされた姿勢を使って、片目ごとに 1 回ずつシーンをレンダリングします。スタンドアロン型ヘッドセットで使うには、次のようにします。

1. **HTTPS で配信するか、ポートフォワーディングを使う。** WebXR にはセキュアコンテキスト（secure context）が必要です。`localhost` はセキュアとみなされるので、最も簡単なのはヘッドセットを USB で接続してポートを転送し（たとえば Android ベースのヘッドセットなら `adb reverse tcp:8000 tcp:8000`）、ヘッドセットのブラウザで `http://localhost:8000` を開く方法です。あるいは、フォルダを任意の HTTPS 静的ホスティング（GitHub Pages でも可）に置いてください。
2. **スケールと原点に注意する。** SfM の単位は任意です（第 1 回）。部屋がドールハウスや大聖堂のように見える場合は、既知の距離を使って `SplatMesh` を一様にスケーリングし（`splat.scale.setScalar(k)`）、`local-floor` 参照空間で床が $y = 0$ に来るように配置してください。
3. **予算を守る。** スタンドアロン型ヘッドセットは、モバイル GPU で 2 つのビューを 72〜90 Hz でレンダリングします。Spark のドキュメントでは、WebXR 向けにはおよそ 50 万〜75 万スプラットの予算が目安とされており、デスクトップの数百万と比べてかなり少なくなっています。予算付きの学習（gsplat の `mcmc`、たとえばその `--strategy.cap_max` オプション）、高密度化のしきい値の引き上げ、SuperSplat での間引きによって数を減らし、圧縮ファイルを優先して使いましょう。
4. **ポッピングとエイリアシングを減らす。** 頭の動きによって、ソートによるポッピング（popping）とエイリアシング（aliasing）が目立つようになります。撮影時とは異なる距離からシーンを見る予定があるなら、`--antialiasing`（公式コード）または `--antialiased`（gsplat）を付けて学習してください。

Spark には、コントローラやハンドトラッキングによる移動に対応した独自の WebXR ヘルパー（`SparkXr`）も含まれており、SuperSplat で公開したビューアは AR と VR の両方で WebXR をサポートしています。ネイティブエンジン向けには、コミュニティのプラグインによって Unity や Unreal でも Gaussian Splat を扱えます。VR で頼りにする前に、シングルパスステレオ（single-pass stereo）に対応しているかを確認してください。

## 7. よくある失敗パターン

| 症状 | 考えられる原因 | 対処法 |
| --- | --- | --- |
| COLMAP が画像の一部しか登録しない、または複数のモデルになる | 重なりの欠落、繰り返し模様やテクスチャのない領域 | 隙間をつなぐ写真を追加する。動画には `sequential_matcher` を使う。`global_mapper` を試す。空や動く物体をマスクする |
| `convert.py` が特徴抽出で失敗する | COLMAP のオプション名の変更（`SiftExtraction.*` → `FeatureExtraction.*`） | 2.1 節のコマンドを実行するか、`convert.py` を書き換える |
| 学習がメモリ不足でクラッシュする | ピクセルまたはガウシアンが多すぎる | `-r 2`、`--data_device cpu`、`--densify_grad_threshold` を上げる、またはガウシアン数に上限を設けた gsplat を使う |
| カメラの近くにフローターが出る | カメラ前方の空間に制約がなく、領域ごとのビューが少ない | ビューを増やす。不透明度リセットに任せる。SuperSplat で削除する。利用可能なら深度正則化を使う |
| 全体的にぼやける | モーションブラー、ピンぼけ、不正確な姿勢 | ぶれたフレームを削除する。再投影誤差を確認する。フォーカスを固定する |
| 色のちらつきや「まだら」な露出 | 自動露出やホワイトバランスが変化した | 露出を固定する。`--train_test_exp`（公式）またはアピアランス埋め込み（appearance embeddings、splatfacto） |
| ズームイン・ズームアウト時に針状のスパイクやちらつきが出る | エイリアシング（第 5 回） | `--antialiasing` / `--antialiased`。撮影距離から大きく外れた位置でのレンダリングを避ける |
| 撮影位置からは良好だが、その間の位置では崩れる | ビューが似すぎている（視差がない）、または SH による「塗り込み」 | カメラをもっと動かす。より多様な視点から撮影する |
| 鏡や窓が穴や第 2 の部屋のように見える | 3DGS では説明できない視点依存の効果 | 想定どおりの挙動。そうした表面はマスクするか避ける。反射は未解決の研究課題 |
| ビューアでシーンが傾いている、または上下逆になる | SfM の座標系が任意であること、y 下向きの規約 | $x$ まわりに 180° 回転する。SuperSplat でまっすぐに直す |
| VR でスケールがおかしい | SfM のスケールは任意 | 実測した基準距離でスケーリングする |

## 8. この先へ

- **きちんと評価する。** `--eval` を使い、学習ビューではなく、取り分けておいたビューで PSNR / SSIM / LPIPS を報告してください（第 2 回）。
- **第 5 回の変種を試す。** メッシュ向けの 2DGS（gsplat には `simple_trainer_2dgs.py` が同梱されています）、MCMC 高密度化、Web 向けの圧縮。
- **インタラクティブにする。** スプラットを three.js のメッシュと組み合わせて UI や物理を実現したり、VR-GS のようにセグメンテーションしてユーザーが物体を操作できるようにしたりしましょう。
- **最適化の代わりにフィードフォワードを使う。** 疎な写真や姿勢情報のない写真には、第 5 回のフィードフォワード（feed-forward）モデルを試し、自分で最適化した結果と比較してみてください。

## 試してみよう

最初の撮影の前に、[インタラクティブラボ]({{ '/' | relative_url }}#lab)の「ガウシアンワールド」デモを開き、「楕円体」と「重なり」のビューに切り替えてみてください。うまく分布したガウシアンの集合がどのように見えるか、そして VR の 1 フレームがどれだけのオーバードロー（overdraw）を負担しなければならないかがわかります。これらは、3 節と 6 節で調整することになるのと同じ量です。

## 代表的な論文とツール

| 論文／ツール | 会議/論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Structure-from-Motion Revisited (COLMAP, Schönberger & Frahm) | CVPR | 2016 | [CVF](https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html) | 本チュートリアルの姿勢推定ステップ |
| Global Structure-from-Motion Revisited (GLOMAP, Pan et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2407.20219) | 大規模な撮影向けの高速な大域的 SfM |
| 3D Gaussian Splatting for Real-Time Radiance Field Rendering (Kerbl et al.) | ACM TOG / SIGGRAPH | 2023 | [arXiv](https://arxiv.org/abs/2308.04079) | 本記事で学習させる手法 |
| Nerfstudio (Tancik et al.) | SIGGRAPH (Conf.) | 2023 | [arXiv](https://arxiv.org/abs/2302.04264) | データ処理、splatfacto、ビューア |
| gsplat: An Open-Source Library for Gaussian Splatting (Ye et al.) | arXiv | 2024 | [arXiv](https://arxiv.org/abs/2409.06765) | MCMC とアンチエイリアシングを備えた高速なトレーナ |
| Mip-Splatting (Yu et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.16493) | VR で `--antialiasing` が重要な理由 |
| 3D Gaussian Splatting as Markov Chain Monte Carlo (Kheradmand et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2404.09591) | VR 向けサイズのモデルのための予算付き高密度化 |
| VR-GS (Jiang et al.) | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2401.16663) | インタラクティブなガウシアン VR システムの完成形 |

## 学習リソース

- [COLMAP のドキュメント](https://colmap.github.io/)：チュートリアル、コマンドラインインタフェース、FAQ（難しいデータセットへのヒントを含む）。
- [公式 3DGS リポジトリ](https://github.com/graphdeco-inria/gaussian-splatting)：自分のシーンの処理とビューアに関する README の各節。
- [gsplat のドキュメント](https://docs.gsplat.studio/)と、その `examples/` フォルダ。
- [nerfstudio のドキュメント](https://docs.nerf.studio/)。データ撮影ガイドや [splatfacto](https://docs.nerf.studio/nerfology/methods/splat.html) を含みます。
- [Spark](https://github.com/sparkjsdev/spark) とそのサンプル、[SuperSplat](https://github.com/playcanvas/supersplat)、[WebXR Device API](https://immersive-web.github.io/webxr/)、そして three.js の WebXR サンプル。

## 演習

1. 同じ物体を 2 回撮影してください。1 回は自動露出で、もう 1 回は露出を固定して撮影します。両方を学習させ、テスト PSNR と見た目のアーティファクトを比較してください。
2. `-r 4` とフル解像度でそれぞれ学習させ、どちらもブラウザでフル解像度で表示してください。`--antialiasing` の有無でも比較します。違いを第 5 回の考え方で説明してください。
3. `clean_ply.py` と SuperSplat を使って、モデルを 50 万ガウシアン未満に削減してください。削減前後のヘッドセットでのフレームレートを測定します。
4. `images.bin` を読み込み（たとえば `pycolmap` を使って）、カメラからシーンの上方向ベクトルを推定する小さなスクリプトを書いてください。それを使って、Web ビューアでモデルを自動的にまっすぐにします。
5. シーン内の既知の距離（テーブルの長さなど）を測り、それが正しくなるように VR のスケールを設定してください。ヘッドセットの中で自分の手を使って確かめましょう。

これでニューラルレンダリングトラックの最終回となります。ワールドモデルと身体性 AI のシリーズはこの上に積み上げられています。ロボットのためのガウシアン地図、生成されたガウシアンワールド、そしてカメラが見るであろうものをレンダリングするシミュレータです。
