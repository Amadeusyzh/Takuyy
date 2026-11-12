---
layout: post
title: "3D 表現：点、メッシュ、ボクセル、SDF、ニューラル場、ガウシアン"
date: 2026-10-27 11:08:00+0900
description: "同じ形状を 9 通りに保存します。奥行きマップと多平面画像、点群、メッシュ、ボクセルグリッドと八分木、符号付き距離場と TSDF、ニューラル場と 3D ガウシアン。表現間の変換、メモリと精度のスケーリング（1 つのトーラスで実測）、どのタスクにどれを選ぶか、そして PointNet とスパース畳み込みの概要を扱います。"
categories: 3d-vision
tags: [3d-representations, point-cloud, mesh, voxels, octree, sdf, tsdf, neural-fields, gaussian-splatting, multi-plane-images, pointnet, sparse-convolution]
series: 3d-vision
series_order: 8
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

第 1〜7 回では、さまざまな形で幾何を得てきました。[第 4 回]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})では疎な点を三角測量し、[第 5 回]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})ではカメラ姿勢付きの疎な点群を、[第 6 回]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})では地図を、[第 7 回]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})では姿勢付き画像から密な奥行きマップを作りました。これらを統合して表面にする（[第 9 回]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})）前に、メモリ上の「3D モデル」とは何なのかを決めなければなりません。

答えは 1 つではありません。経路を計画するロボットは「このセルは空いているか」を尋ねます。レンダラは「この光線はどんな色を見るか」を、物理エンジンは「表面までどれだけ離れていて、どの方向か」を尋ねます。ニューラルネットワークは畳み込める規則的な配列を求めます。どの問いも、ある表現では安く、別の表現では高くつきます。本記事では**1 つの形状**（トーラス）をよく使われるすべての表現に格納し、それぞれについてメモリ、精度、そして簡単に答えられる問いを測ります。読み終えるころには、習慣ではなく理由をもってタスクに合う表現を選べるようになるはずです。

長い記事です。第 2〜8 節はそれぞれ 1 つの系統を扱い、単独でも読めます。第 9〜11 節では変換、メモリと精度のトレードオフ、判断表によって表現どうしを比較します。第 12 節は 3D データ上の学習への短い入門です。

## 前提知識

- [第 1 回]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})のピンホールカメラ $P = K[R \mid \mathbf t]$、逆投影 $K^{-1}\tilde{\mathbf u}$、OpenCV のカメラ座標系。
- 奥行きマップとその生成方法：[第 7 回]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})。ここでは奥行きマップが奥行きを並べた画像であることだけを使います。
- [グラフィックス第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})程度のメッシュ、符号付き距離関数、マーチングキューブ。本記事では繰り返さずリンクします。
- 第 7・8 節では [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) と [3D ガウシアン・スプラッティング]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})の基礎があると役立ちますが、必須ではありません。
- Python、NumPy、SciPy。コードブロックは互いに依存しているので、1 つのファイルかノートブックで順に実行してください。すべて `bin/figures/3d-vision/vision3d_08.py` から抜き出したもので、このスクリプトがすべての図も描き、本文で引用する数値もすべて出力します。

## 1. 1 つの形状、たくさんの表現

### 1.1 表現を分類する 3 つの軸

どの 3D 表現も 3 つの選択をしています。

1. **陽的（explicit）か陰的（implicit）か。** 陽的表現は表面*上*にあるもの（点、三角形、ガウシアン）を列挙します。表面を直接たどれますが、「$\mathbf x$ は内側か」に答えるには探索が必要です。陰的表現は空間上の関数 $f(\mathbf x)$ を保存し、表面は $\\{\mathbf x : f(\mathbf x) = 0\\}$ のような等値集合です。内外判定は関数を 1 回評価するだけですが、表面を見つけるには探索（求根、マーチングキューブ）が必要です。
2. **表面（surface）か体積（volume）か。** メッシュや点群は境界だけを記述します。占有グリッド、SDF、密度場は、空の空間や内部を含む空間のすべての点を記述します。衝突判定、自由空間の推論、ボリュームレンダリングに必要なのは体積表現ですが、その代償はメモリです。体積は $N^3$ で増え、面積は $N^2$ でしか増えないからです。
3. **ワールド空間か画像空間か。** 奥行きマップや多平面画像は 1 台のカメラに結び付いています。安価でセンサと完全に一致しますが、そのカメラが見たものしか記述しません。

さらに 2 つの区別が繰り返し現れます。表現は**離散的**（グリッド、リスト）か**連続的**（補間したグリッドやニューラルネットワークのように、どこでも問い合わせられる関数）か。そして**構造化**（CNN が畳み込める規則的なグリッド）か**非構造化**（順序のない点の集合）か、です。

| 表現 | 陽的 / 陰的 | 表面 / 体積 | 自然な問い合わせ | 難しい問い合わせ |
| --- | --- | --- | --- | --- |
| 奥行きマップ $Z(u, v)$ | 陽的、画像空間 | 見えている表面 | 「画素 $(u, v)$ は何を見ているか」 | カメラが見ていないものすべて |
| 多平面画像 | 陽的、画像空間 | 視錐台内の体積 | 近くの視点のレンダリング | 大きな視点変化 |
| 点群 | 陽的 | 表面のサンプル | 「サンプルはどこにあるか」 | 内外判定、接続関係 |
| 三角形メッシュ | 陽的 | 表面 | ラスタライズ、面積計算、テクスチャ | 内外判定、トポロジー変化 |
| ボクセル占有 | 陰的、離散 | 体積 | 「セル $(i, j, k)$ は占有されているか」 | サブボクセル精度 |
| 八分木 | 陰的、離散、適応的 | 体積 | 同上（より少ないメモリで） | 木構造を変える更新 |
| SDF / TSDF グリッド | 陰的、サンプル | 体積（表面近くの帯） | $\mathbf x$ での距離と法線 | 薄い構造、鋭いエッジ |
| ニューラル場 | 陰的、連続 | 体積 | 任意の $\mathbf x$ での $f(\mathbf x)$、微分可能 | 高速な問い合わせ、編集 |
| 3D ガウシアン | 陽的、ソフト | 体積（密度） | ラスタライズ、微分可能 | はっきり定義された表面 |

### 1.2 本記事を通しての例：厳密な SDF を持つトーラス

表現を公平に比べるには、真の表面が厳密にわかっている形状が必要です。ここでは $z$ 軸まわりの**トーラス**（環の半径 $R = 1$、管の半径 $r = 0.4$、単位はメートルと考えてください）を使います。トーラスは良いテスト形状です。穴を持ち（種数 1 なので、そのメッシュのオイラー標数は $0$）、凸な領域と鞍形の領域の両方があり、符号付き距離が閉じた式で書けます。点 $\mathbf p = (x, y, z)$ に対し、$q = \sqrt{x^2 + y^2} - R$ を水平面内での環の円までの符号付き距離とします。環の円上の最近点までの距離は $\sqrt{q^2 + z^2}$ で、表面はその円のまわりの半径 $r$ の管なので、

$$
f(\mathbf p) = \sqrt{q^2 + z^2} - r, \qquad q = \sqrt{x^2 + y^2} - R .
$$

内側で $f < 0$、外側で $f > 0$、$\lvert f \rvert$ は表面までのユークリッド距離です。トーラスの面積は $4\pi^2 R r$、体積は $2\pi^2 R r^2$ です。

表面を**一様に**サンプリングする（誤差の測定に必要です）には、環を回る角 $\varphi$ と管を回る角 $\theta$ でパラメータ表示します：$\mathbf p = \big((R + r\cos\theta)\cos\varphi,\ (R + r\cos\theta)\sin\varphi,\ r\sin\theta\big)$。面積要素は $r(R + r\cos\theta)\,d\theta\,d\varphi$ で、管の外側（$\theta = 0$）のほうが内側より面積が大きくなります。$\theta$ を一様に引くと点が内側に偏るので、一様に引いた $\theta$ を $R + r\cos\theta$ に比例する確率で採用します（棄却サンプリング）。

```python
import numpy as np

R_MAJ, R_MIN = 1.0, 0.4          # torus around the z axis: ring radius R, tube radius r


def sdf_torus(p):
    """Exact signed distance to the torus (negative inside); p has shape (..., 3)."""
    q = np.hypot(p[..., 0], p[..., 1]) - R_MAJ     # distance from the ring circle, in its plane
    return np.hypot(q, p[..., 2]) - R_MIN


def sample_torus(n, rng):
    """n points uniformly distributed over the surface, with their exact unit normals."""
    phi = rng.uniform(0, 2 * np.pi, 4 * n)          # angle around the ring
    th = rng.uniform(0, 2 * np.pi, 4 * n)           # angle around the tube
    # the area element is r (R + r cos th) dth dphi, so accept th with probability ~ R + r cos th
    keep = rng.uniform(0, R_MAJ + R_MIN, 4 * n) < R_MAJ + R_MIN * np.cos(th)
    phi, th = phi[keep][:n], th[keep][:n]
    nrm = np.stack([np.cos(th) * np.cos(phi), np.cos(th) * np.sin(phi), np.sin(th)], -1)
    ring = np.stack([R_MAJ * np.cos(phi), R_MAJ * np.sin(phi), np.zeros_like(phi)], -1)
    return ring + R_MIN * nrm, nrm


AREA = 4 * np.pi ** 2 * R_MAJ * R_MIN
VOLUME = 2 * np.pi ** 2 * R_MAJ * R_MIN ** 2
rng = np.random.default_rng(0)
P_true, N_true = sample_torus(200_000, rng)
print("area %.4f  volume %.4f" % (AREA, VOLUME))
print("max |sdf| at the samples: %.1e" % np.abs(sdf_torus(P_true)).max())
```

出力：`area 15.7914  volume 3.1583` と `max |sdf| at the samples: 3.3e-16`。以下のすべての誤差測定では、この 200,000 個のサンプル `P_true` を厳密な表面の代わりに使います。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-overview.svg" localized="true" caption="同じトーラス（$R = 1$、$r = 0.4$）の 6 つの表現。点群：高さで色付けした一様な表面サンプル 3000 点。メッシュ：$24 \times 12$ のパラメータ格子、頂点 288 個、三角形 576 枚。ボクセル：$[-1.5, 1.5]^3$ 上の $16^3$ グリッドのうち中心が内側にあるセル（4096 個中 472 個）。SDF：平面 $z = 0$ 上の $f$（赤が内側、青が外側）、実線がゼロ等値線、破線が等値線 $f = 0.2$ と $0.4$。ガウシアン：表面サンプルに当てはめた異方性ガウシアン 100 個（第 8 節）を $1.5\sigma$ で描画。奥行きマップ：$160 \times 120$ のカメラから見たテーブル上のトーラス（第 2 節）。" %}

## 2. 画像空間の表現：奥行きマップと多平面画像

### 2.1 奥行き、距離、逆奥行き

**奥行きマップ**（depth map）は画素ごとに 1 つの数を保存します。どの規約かが重要です。「奥行き」と呼ばれる数が 3 種類あるからです。

- **$z$ 奥行き** $Z$：カメラ座標系での光軸方向の座標で、[第 1 回]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})の $\lambda\tilde{\mathbf u} = K[R \mid \mathbf t]\tilde{\mathbf X}$ における $\lambda = Z\_c$ です。奥行きカメラ、ステレオ（[第 7 回]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})）、ほとんどのデータセットはこれを保存します。
- **距離**（range）$\rho$：光線に沿ったカメラ中心から点までのユークリッド距離です。レイトレーサと LiDAR はこれを返し、光線の方向が単位長のときは光線パラメータ $t$ もこれになります。（元の NeRF のコードは光線の方向を正規化せず、その $z$ 成分が単位長なので、$t$ は $z$ 奥行きです。使うコードベースの規約を必ず確認してください。）$K^{-1}\tilde{\mathbf u}$ の第 3 成分は 1 なので点は $Z\,K^{-1}\tilde{\mathbf u}$ であり、$\rho = Z\,\lVert K^{-1}\tilde{\mathbf u}\rVert$ です。両者は主点で一致し、下のカメラでは画像の隅で 22.6% 異なります。
- **逆奥行き**（inverse depth、または**視差** disparity）$1/Z$：ステレオは基線長 $b$ のもとで視差 $d = f b / Z$ を測ります。多くのネットワークが逆奥行きを予測するのは、それが有界（無限遠でゼロ）で、誤差が $Z$ の誤差より一様に近いからです。

$Z$ と $\rho$ を混同すると平面が曲面に曲がります。画像中心付近では見逃しやすく、端では大きな誤差です。

### 2.2 逆投影：奥行きマップから点へ

奥行き $Z$ の画素 $\tilde{\mathbf u} = (u, v, 1)^\top$ について、第 1 回の投影を逆にたどると

$$
\mathbf X_c = Z\, K^{-1} \tilde{\mathbf u}, \qquad \mathbf X_w = R^\top(\mathbf X_c - \mathbf t),
$$

です（ワールドからカメラへの規約 $\mathbf X\_c = R\mathbf X\_w + \mathbf t$ を使います）。有効な画素がそれぞれ 1 つの 3D 点を与えるので、奥行きマップは近傍構造（画素格子）が既知の点群です。

**数値例。** $f\_x = f\_y = 140$、$(c\_x, c\_y) = (79.5, 59.5)$（$160 \times 120$ 画像の中心。第 1 回と同じく画素中心を整数座標とします）のとき、隅の画素 $(0, 0)$ は $K^{-1}\tilde{\mathbf u} = (-0.568, -0.425, 1)$、$\lVert K^{-1}\tilde{\mathbf u}\rVert = 1.2260$ です。そこでの奥行き $Z = 3$ m は距離 3.678 m、カメラ座標の点 $(-1.704, -1.275, 3)$ に対応します。

トーラスの奥行きマップは、SDF を**スフィアトレーシング**（sphere tracing、[グラフィックス第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})）して描画します。カメラ中心から各光線に沿って、現在の $f$ の値だけ進みます。$\lvert f \rvert$ は最も近い表面までの距離なので、その半径の球の中は空であり、表面を飛び越すことはありません。シーンを少し複雑にするため、トーラスを 4 m × 4 m の板の上に置き、シーンの SDF を 2 つの SDF の最小値とします。

```python
def look_at(C, target, up=(0.0, 0.0, 1.0)):
    """World-to-camera R, t (OpenCV: x right, y down, z forward) for a camera at C."""
    z = target - C; z = z / np.linalg.norm(z)
    x = np.cross(z, up); x = x / np.linalg.norm(x)
    y = np.cross(z, x)
    R = np.stack([x, y, z])                          # rows = camera axes in world coordinates
    return R, -R @ C


def render_depth(K, R, t, W, H, sdf, n_steps=96, s_max=10.0):
    """Depth map Z(u, v) by sphere tracing the SDF; inf where the ray misses."""
    u, v = np.meshgrid(np.arange(W, dtype=float), np.arange(H, dtype=float))
    rays = np.stack([u, v, np.ones_like(u)], -1) @ np.linalg.inv(K).T   # K^-1 (u, v, 1): z = 1
    d = rays @ R                                     # R^T * ray: directions in the world frame
    norm = np.linalg.norm(d, axis=-1, keepdims=True)
    d = d / norm
    C = -R.T @ t
    s = np.zeros((H, W))                             # distance travelled along each ray
    for _ in range(n_steps):
        s = s + sdf(C + s[..., None] * d)            # safe step: the SDF is 1-Lipschitz
    hit = np.abs(sdf(C + s[..., None] * d)) < 1e-4
    hit &= s < s_max
    return np.where(hit, s / norm[..., 0], np.inf), np.where(hit, s, np.inf)   # depth Z, range


def backproject(depth, K, R, t):
    """Pixels with finite depth -> world points: X_w = R^T (Z K^-1 (u, v, 1) - t)."""
    v, u = np.nonzero(np.isfinite(depth))
    Z = depth[v, u]
    Xc = (np.linalg.inv(K) @ np.stack([u, v, np.ones_like(u)])) * Z    # 3 x M, camera frame
    return (R.T @ (Xc - t[:, None])).T                                  # M x 3, world frame


def depth_normals(depth, K):
    """Camera-frame normals from a depth map: cross product of neighbouring 3D points."""
    H, W = depth.shape
    v, u = np.mgrid[0:H, 0:W]
    X = np.linalg.inv(K) @ np.stack([u.ravel(), v.ravel(), np.ones(H * W)])
    X = (X * depth.ravel()).T.reshape(H, W, 3)
    du = X[1:-1, 2:] - X[1:-1, :-2]                  # along +u (right)
    dv = X[2:, 1:-1] - X[:-2, 1:-1]                  # along +v (down)
    n = -np.cross(du, dv)                            # right x down points away: flip to the camera
    n = n / np.linalg.norm(n, axis=-1, keepdims=True)
    out_ = np.full((H, W, 3), np.nan)
    out_[1:-1, 1:-1] = n
    return out_
```

最後の関数は奥行きマップだけから法線を推定します。隣り合う画素から 2 つの接ベクトル（右隣と左隣の 3D 点の差、下隣と上隣の 3D 点の差）が得られ、その外積が表面に垂直です。OpenCV 座標系（$x$ 右、$y$ 下、$z$ 前）では「右 $\times$ 下」はカメラから遠ざかる向きなので、符号を反転します。次はシーン、カメラ、そして検証です。

```python
def sdf_box(p, c, half):
    """Exact SDF of an axis-aligned box with centre c and half-sizes half."""
    q = np.abs(p - c) - half
    return np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(q.max(-1), 0)


def sdf_scene(p):
    """The torus resting on a 4 m x 4 m slab (a table top)."""
    return np.minimum(sdf_torus(p), sdf_box(p, np.array([0, 0, -0.45]), np.array([2.0, 2.0, 0.05])))


W_IMG, H_IMG = 160, 120
K = np.array([[140.0, 0, 79.5], [0, 140.0, 59.5], [0, 0, 1]])
C_cam = np.array([0.6, -3.0, 1.8])
R_cam, t_cam = look_at(C_cam, np.zeros(3))
depth, rng_map = render_depth(K, R_cam, t_cam, W_IMG, H_IMG, sdf_scene)
pts = backproject(depth, K, R_cam, t_cam)
valid = np.isfinite(depth)
print("pixels hit: %d of %d, depth %.3f..%.3f m" % (valid.sum(), valid.size, depth[valid].min(), depth[valid].max()))
print("max |sdf| of back-projected points: %.1e" % np.abs(sdf_scene(pts)).max())
print("range / depth at the corner pixel: %.4f" % np.linalg.norm(np.linalg.inv(K) @ [0, 0, 1]))
with np.errstate(invalid="ignore"):
    nc = depth_normals(depth, K)                     # camera frame, NaN at the border and misses


def grad(f, p, e=1e-5):
    return np.stack([(f(p + e * d) - f(p - e * d)) / (2 * e) for d in np.eye(3)], -1)


v_, u_ = np.nonzero(valid)
n_true_c = np.full((H_IMG, W_IMG, 3), np.nan)
n_true_c[v_, u_] = grad(sdf_scene, pts) @ R_cam.T    # world -> camera: n_c = R n_w
ok = np.isfinite(nc).all(-1) & valid
ang = np.degrees(np.arccos(np.clip(np.sum(nc[ok] * n_true_c[ok], -1), -1, 1)))
print("normal error from depth: median %.2f deg, %.1f%% of pixels above 10 deg" % (np.median(ang), 100 * np.mean(ang > 10)))
print("float32 depth map: %.1f kB" % (W_IMG * H_IMG * 4 / 1000))
```

出力：

```text
pixels hit: 12065 of 19200, depth 2.288..5.115 m
max |sdf| of back-projected points: 7.7e-05
range / depth at the corner pixel: 1.2260
normal error from depth: median 0.02 deg, 2.7% of pixels above 10 deg
float32 depth map: 76.8 kB
```

逆投影した点はスフィアトレーシングの許容誤差の範囲で表面上にあります。法線はほぼどこでも正確ですが、2.7% の画素だけは例外で、それらはすべて**奥行きの不連続**の上にあります。トーラスの輪郭では左隣がトーラス上、右隣が背後のテーブル上にあり、外積は無意味な法線を返します。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-depth.svg" caption="左：テーブル上のトーラスの奥行きマップ $Z(u, v)$、$160 \times 120$ 画素、$f = 140$。白い画素は 10 m 以内に何も見ていません。中：隣接画素の外積で奥行きマップから推定した法線を色で表示（カメラ座標系）。黒い画素（有効画素の 2.7%）は誤差が 10° を超え、すべて奥行きの不連続上にあります。右：$\mathbf X\_w = R^\top(Z K^{-1}\tilde{\mathbf u} - \mathbf t)$ で逆投影した有効画素 12,065 個（5000 個を表示）と、カメラの視錐台と座標軸（$x$ 赤、$y$ 緑、$z$ 青）。点は遠くほど疎になります。各画素が覆う面積は $Z^2$ に比例するからです。" %}

実際の奥行きセンサでは不連続部分がさらに悪くなります。エッジをまたぐ ToF やストラクチャードライトの画素は、前景と背景の中間の奥行きを返すことが多く、逆投影すると宙に浮いた**フライングピクセル**（flying pixel）になります。近傍との奥行き差が大きい点や、推定法線が光線とほぼ直交する点を除けば、大半は取り除けます。

**コスト。** $W \times H$ 画素の float32 奥行きマップは $4WH$ バイト（ここでは 76.8 kB）、ミリメートル単位の 16 ビット奥行き画像はその半分です。長所は、センサが測ったものそのものであること、近傍が無料で得られること（画素格子）、2D CNN で直接処理できることです。短所は、1 つの視点しか記述せず、最初の表面の後ろには何もないことです。多視点システムが多数の奥行きマップを体積表現に統合する理由はここにあります（第 6 節と[第 9 回]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})）。

### 2.3 1 画素に複数の奥行き

奥行きマップは各光線上の*最初の*表面を保存します。より多くを保持する古典的な拡張が 2 つあります。

- **レイヤード奥行き画像**（layered depth image、LDI；Shade ら、1998）は画素ごとに短い（奥行き、色）サンプルのリストを保存します。最初の表面、その後ろの表面、という具合です。第 1 層の陰になっていたものが現れる場所でも、穴なしで近くの視点を描画できます。
- **多平面画像**（multi-plane image、MPI；Zhou ら、2018）は、参照カメラの固定奥行きに正対する $D$ 枚の平面を保存し、各平面が完全な RGBA 画像です。描画はアルファ合成だけなので CNN で予測しやすく、NeRF への足がかりの 1 つになりました。

### 2.4 多平面画像

平面は**逆奥行きで等間隔**に置きます。理由は視差です。カメラが横に $b$ 動くと、奥行き $d$ の点は $f b / d$ 画素ずれるので、$1/d$ で等間隔の平面は画素のずれでも等間隔になります。参照カメラから MPI を描画するには、「over」演算子で手前から奥へ平面を合成します。平面 $i$ のその画素での不透明度を $\alpha\_i$、色を $\mathbf c\_i$（平面 $0$ が最も手前）とすると

$$
\mathbf c = \sum_{i=0}^{D-1} \mathbf c_i\, \alpha_i \prod_{j<i} (1 - \alpha_j) .
$$

これは NeRF のボリュームレンダリングの求積（[ニューラルレンダリング第 2 回]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})）と同じで、サンプルが平面に固定されているだけです。**新しい視点**は、各平面を新しいカメラへ変換してから再び合成して描画します。参照座標系で奥行き $d$、法線 $\mathbf n$ の平面はホモグラフィを誘導します。参照カメラに対して $\mathbf X' = R\mathbf X + \mathbf t$ である新しいカメラについて、平面上の点は $\mathbf n^\top\mathbf X = d$ を満たすので $\mathbf t = \mathbf t\,\mathbf n^\top\mathbf X / d$ となり、

$$
\tilde{\mathbf u}' \sim K\Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)K^{-1}\tilde{\mathbf u} .
$$

これは[第 2 回]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})の平面ホモグラフィを 1 台ではなく 2 台のカメラから見たもので、[第 4 回]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})の 2 視点幾何で再び登場します。$\mathbf t\,\mathbf n^\top$ の項の符号は平面の式を $\mathbf n^\top\mathbf X = d$ と書くか $\mathbf n^\top\mathbf X + d = 0$ と書くかで変わるので、数値で確認してください。

```python
def mpi_planes(near, far, D):
    """D fronto-parallel planes, evenly spaced in inverse depth (disparity)."""
    return 1.0 / np.linspace(1.0 / near, 1.0 / far, D)


def composite(rgb, alpha):
    """Front-to-back 'over' compositing of D layers (index 0 = nearest)."""
    T = np.cumprod(np.concatenate([[1.0], 1.0 - alpha[:-1]]))   # transmittance in front of layer i
    w = T * alpha
    return (w[:, None] * rgb).sum(0), w


d_planes = mpi_planes(1.0, 100.0, 32)
print("plane depths:", np.round(d_planes[:4], 3), "...", np.round(d_planes[-3:], 1))
f_px, base = 500.0, 0.1
print("disparity step between planes: %.2f px" % (f_px * base * (1 / d_planes[0] - 1 / d_planes[1])))
c_ray, w_ray = composite(np.array([[1.0, 0, 0], [0, 1.0, 0], [0, 0, 1.0]]), np.array([0.3, 0.5, 1.0]))
print("composited colour:", c_ray, "weights:", w_ray)
```

出力：平面の奥行き `[1. 1.033 1.068 1.106] ... [13.5 23.8 100.]`、$f = 500$ px・基線 10 cm での平面間の視差の刻み `1.60 px`、不透明度 $0.3, 0.5, 1$ の 3 層に対する重み $0.3, 0.35, 0.35$。32 枚の平面の半分が最初の 2 m 以内にあります。逆奥行き間隔は視差の大きい場所に平面を割り当てるのです。

図では第 2.2 節の RGB-D 画像から小さな MPI を作ります。逆奥行きが平面 $i$ と $i+1$ の間にある画素は、平面 $i+1$ に $\alpha = 1$ で、平面 $i$ に $\alpha = w$（逆奥行きで平面 $i$ へ向かって進んだ割合）で、どちらもその画素の色で入れます。こうすると合成で参照画像が正確に再現されます。その後カメラを右へ 0.5 m 動かし、新しい光線をすべての平面と交差させて MPI を描画します。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-mpi.svg" caption="第 2.2 節の RGB-D 画像から作った 16 平面の MPI。平面は 2.2 m から 6 m まで逆奥行きで等間隔。2 枚目：チェッカーボード（透明）上の 4 枚の RGBA 平面。3 枚目：右に 0.5 m 動いたカメラから描画した MPI。マゼンタの画素（12.7%）はどの平面でも透明です。参照視点でトーラスに隠れていたテーブルの部分と、参照視野の外側の縦の帯です。それ以外では、レイトレーシングした画像（右）との平均色誤差は 0.006 で、差が 0.1 を超える画素は 1.7%。主にトーラスの輪郭沿いで、混ぜ合わせた 2 枚の平面がずれる場所です。" %}

マゼンタの穴は本質的な限界です。1 枚の RGB-D 画像から作った MPI には、参照カメラが見ていないものは何も含まれません。学習型の MPI は隠れた層にもっともらしい内容を予測し、それがステレオペアからの新視点合成で有用だった理由です。

## 3. 点群

### 3.1 点群とは

**点群**（point cloud）は集合 $\\{\mathbf p\_i\\}\_{i=1}^n$、$\mathbf p\_i \in \mathbb R^3$ で、色、強度（LiDAR）、法線 $\mathbf n\_i$、タイムスタンプなどの属性を持つことがよくあります。LiDAR、逆投影した奥行きマップ（第 2.2 節）、SfM（[第 5 回]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})）が生み出すのは点群です。次の 2 つの性質が、点群で行うすべてを形づくります。

- **集合**であること：点の順序は情報を持ちません。形状を記述すべき点群の関数は、並べ替えに対して不変でなければなりません（第 12 節）。
- **接続関係がない**こと：どの点が隣か、どちらが内側か、近い 2 点が同じ面上にあるのか近接した 2 枚の面（薄い壁の両面）上にあるのかは保存されていません。

メモリは float32 座標で $12n$ バイトに属性が加わります。サーフェル（surfel、surface element；Pfister ら、2000）は各点に法線と半径を加え、穴なしで描画できる小さな向き付き円盤にします。サーフェル地図は密な SLAM で使われます。

### 3.2 近傍、法線、ダウンサンプリング

ほとんどの点群アルゴリズムは**最近傍探索**から始まります。$k$ 個の最近点、または半径 $\varepsilon$ 以内のすべての点です。k-d 木（`scipy.spatial.cKDTree`、C++ では nanoflann）はおおむね対数時間で答えます。法線は近傍に平面を当てはめて（$3 \times 3$ の近傍共分散の PCA で最小固有ベクトル）推定し、その後向きをそろえます。導出は[グラフィックス第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})にあります。

生の点群は密すぎたり密度が不均一だったりするので、**ダウンサンプリング**します。

- **ボクセルグリッド・ダウンサンプリング**は、間隔 $s$ のグリッドの占有セルごとに 1 点（通常は重心）を残します。高速で、密度を間隔 $s$ でほぼ一様にします。
- **最遠点サンプリング**（farthest point sampling、FPS）は最初の点を任意に選び、その後はそれまでに選んだ点から最も遠い点を繰り返し選びます。結果は形状を均等に覆います。$m$ 個のサンプルに $O(nm)$ かかり、PointNet++ は局所領域の中心を選ぶのに使います（第 12 節）。

### 3.3 点群の評価：Chamfer 距離と F スコア

再構成 $A$ を参照 $B$（どちらも点集合）と比べるため、点から集合への距離 $d(\mathbf a, B) = \min\_{\mathbf b \in B}\lVert \mathbf a - \mathbf b\rVert$ を定義します。すると、

- **正確さ**（accuracy）は再構成が真値にどれだけ近いか、すなわち $\mathbf a \in A$ についての $d(\mathbf a, B)$ です。**完全さ**（completeness）は真値がどれだけ覆われているか、すなわち $\mathbf b \in B$ についての $d(\mathbf b, A)$ です。
- **Chamfer 距離**は両方向を平均します。規約はさまざま（2 方向の和か平均か、距離を 2 乗するか）なので、必ずどれを使ったかを明記してください。本記事では 2 方向の平均距離の平均を使います。

$$
\mathrm{CD}(A, B) = \frac12\Big(\frac{1}{\lvert A\rvert}\sum_{\mathbf a \in A} d(\mathbf a, B) + \frac{1}{\lvert B\rvert}\sum_{\mathbf b \in B} d(\mathbf b, A)\Big).
$$

- しきい値 $\tau$ での **F スコア**（Knapitsch ら、2017、Tanks and Temples ベンチマーク）は、適合率 $P(\tau)$（$A$ のうち $B$ から $\tau$ 以内にある割合）と再現率 $R(\tau)$（$B$ のうち $A$ から $\tau$ 以内にある割合）から $F = 2PR/(P + R)$ を報告します。Chamfer の平均と違って少数の遠いアウトライアに支配されず、問題が間違った点なのか欠けた点なのかを分けて示します。

```python
from scipy.spatial import cKDTree


def chamfer_fscore(A, B, tau):
    """Symmetric Chamfer distance and F-score at threshold tau between point sets A and B."""
    d_ab = cKDTree(B).query(A)[0]                    # every point of A to its nearest point in B
    d_ba = cKDTree(A).query(B)[0]
    precision = np.mean(d_ab < tau)                  # how much of A lies near B (accuracy)
    recall = np.mean(d_ba < tau)                     # how much of B is covered by A (completeness)
    f = 2 * precision * recall / max(precision + recall, 1e-12)
    return 0.5 * (d_ab.mean() + d_ba.mean()), precision, recall, f


ref = P_true                                          # 200k exact samples stand in for the surface
rng = np.random.default_rng(1)
cases = {
    "2k exact": sample_torus(2_000, rng)[0],
    "20k exact": sample_torus(20_000, rng)[0],
    "20k noisy": sample_torus(20_000, rng)[0] + rng.normal(0, 0.02, (20_000, 3)),
}
hole = sample_torus(20_000, rng)[0]
cases["20k, hole"] = hole[hole[:, 0] < 0.8]          # a scanner never saw the +x side
for name, A in cases.items():
    cd, p, r, f = chamfer_fscore(A, ref, tau=0.02)
    print("%-10s n=%6d  CD=%.4f  precision=%.3f recall=%.3f F=%.3f" % (name, len(A), cd, p, r, f))


def farthest_point_sampling(P, m, first=0):
    """Greedy FPS: each new sample is the point farthest from all samples chosen so far."""
    idx = np.zeros(m, dtype=int); idx[0] = first
    d = np.linalg.norm(P - P[first], axis=1)
    for i in range(1, m):
        idx[i] = np.argmax(d)
        d = np.minimum(d, np.linalg.norm(P - P[idx[i]], axis=1))
    return idx


cloud = sample_torus(20_000, np.random.default_rng(2))[0]
i_fps = farthest_point_sampling(cloud, 256)
i_rnd = np.random.default_rng(3).choice(len(cloud), 256, replace=False)
for name, idx in (("random", i_rnd), ("FPS", i_fps)):
    gap = cKDTree(cloud[idx]).query(cloud)[0]        # distance of every point to its nearest sample
    print("%-6s 256 samples: mean gap %.3f, largest gap %.3f" % (name, gap.mean(), gap.max()))
```

出力：

```text
2k exact   n=  2000  CD=0.0247  precision=1.000 recall=0.146 F=0.255
20k exact  n= 20000  CD=0.0092  precision=1.000 recall=0.795 F=0.886
20k noisy  n= 20000  CD=0.0184  precision=0.667 recall=0.538 F=0.596
20k, hole  n= 16116  CD=0.0399  precision=1.000 recall=0.643 F=0.783
random 256 samples: mean gap 0.118, largest gap 0.328
FPS    256 samples: mean gap 0.096, largest gap 0.193
```

表を行ごとに読みましょう。厳密なサンプルは適合率が完璧ですが、2000 点では表面の大部分がどのサンプルからも $\tau = 0.02$ より遠いため、再現率が低くなります。**疎だが正しい点群は不完全と判定される**のです。$\sigma = 0.02$ のノイズは適合率と再現率の両方を下げます。穴は再現率だけを下げますが、欠けた領域が大きな距離を生むため、Chamfer 距離はノイズのときより大きく増えます。最後の 2 行は、同じ 256 点で FPS が最大の隙間を 0.328 から 0.193 に減らすことを示しています。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-point-clouds.svg" localized="true" caption="左・中：20,000 個の表面サンプルからランダムに、および最遠点サンプリングで選んだ 256 点（赤）。灰色の点群は選ばれた最も近い点までの距離で濃淡を付けています（濃いほど隙間が大きい）。ランダムでは塊と穴ができ（最大の隙間 0.328）、FPS では均等に広がります（0.193）。右：200,000 個の参照サンプルに対する $\tau = 0.02$ での適合率・再現率・F スコア。厳密なサンプル 2000 点、厳密なサンプル 20,000 点、$\sigma = 0.02$ のガウスノイズを加えた 20,000 点、領域 $x > 0.8$ を取り除いた 20,000 点の 4 通り。" %}

## 4. メッシュ

### 4.1 構造とトポロジー

**三角形メッシュ**（triangle mesh）は頂点配列 $V \in \mathbb R^{n\_V \times 3}$ と頂点インデックスからなる面配列 $F \in \mathbb N^{n\_F \times 3}$ です（ハーフエッジ構造、多様体性、オイラー標数 $\chi = V - E + F$ は[グラフィックス第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})で扱いました）。点群と比べ、メッシュは**接続関係**を加え、それによってサンプル間に面が生まれます。面積を測り、穴なしでラスタライズし、パラメータ化してテクスチャを貼り、その上でシミュレーションできます。多くの再構成パイプラインの最終出力も、あらゆるゲームエンジンの入力もメッシュなのはそのためです。

代償は**トポロジー**です。メッシュは面のつながり方を固定します。2 つの塊を合体させたり穴を開けたりするにはメッシュを作り直す必要があります。だから形を自由に変える必要がある最適化手法（統合、ニューラル場）は陰関数で作業し、最後にマーチングキューブでメッシュを取り出すのです。

### 4.2 メッシュはどれだけ正確か

頂点が滑らかな曲面上にちょうど載っているメッシュは区分線形補間であり、その誤差は**矢高**（sagitta）です。半径 $\rho$ の円を横切る長さ $s$ の弦は、円弧から最大で

$$
\delta = \rho\big(1 - \cos(\Delta/2)\big) \approx \frac{s^2}{8\rho}, \qquad \Delta \text{ は弦の張る角}, \ s = 2\rho\sin(\Delta/2) \approx \rho\Delta
$$

だけ離れます。つまり誤差は辺の長さの **2 乗**で減ります。面積 $A$ の曲面を辺の長さ $s$ でメッシュ化すると三角形の数は $F \approx 2A/(\tfrac{\sqrt 3}{2}s^2) \propto s^{-2}$ なので、$\delta \propto F^{-1}$、つまり三角形の数を 2 倍にすると誤差は半分になります。トーラスを角度 $(\varphi, \theta)$ の $n \times m$ 格子でメッシュ化すると、最大のふくらみは外側の赤道（半径 $R + r$ の円を $n$ 本の弦に分割）と、半径 $r$ の管の円を $m$ 本の弦に分割したものから来ます：$\delta\_{\max} \lesssim (R + r)(1 - \cos\frac{\pi}{n}) + r(1 - \cos\frac{\pi}{m})$。

誤差を測るには**メッシュ上の一様サンプリング**も必要です。これはあらゆるベンチマークでメッシュを点群と比べる方法でもあります。面積に比例する確率で三角形を選び、$s, t$ を $[0, 1]$ の一様乱数として重心座標 $(1 - \sqrt{s},\ \sqrt{s}(1 - t),\ \sqrt{s}\,t)$ の点を取ります。平方根は、三角形が頂点付近で細くなることを補正します。

```python
def torus_mesh(n, m):
    """Triangle mesh of the torus: n segments around the ring, m around the tube."""
    PH, TH = np.meshgrid(2 * np.pi * np.arange(n) / n, 2 * np.pi * np.arange(m) / m, indexing="ij")
    rho = R_MAJ + R_MIN * np.cos(TH)
    V = np.stack([rho * np.cos(PH), rho * np.sin(PH), R_MIN * np.sin(TH)], -1).reshape(-1, 3)
    i, j = np.meshgrid(np.arange(n), np.arange(m), indexing="ij")
    a, b = i * m + j, (i + 1) % n * m + j            # the four corners of quad (i, j)
    c, d = (i + 1) % n * m + (j + 1) % m, i * m + (j + 1) % m
    F = np.concatenate([np.stack([a, b, c], -1).reshape(-1, 3), np.stack([a, c, d], -1).reshape(-1, 3)])
    return V, F


def sample_mesh(V, F, n, rng):
    """n points uniformly distributed over the mesh area (area-weighted face choice)."""
    A, B, C = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(B - A, C - A), axis=1)
    f = rng.choice(len(F), n, p=area / area.sum())
    s, t = np.sqrt(rng.uniform(size=n)), rng.uniform(size=n)   # sqrt makes it uniform in area
    return ((1 - s)[:, None] * A[f] + (s * (1 - t))[:, None] * B[f] + (s * t)[:, None] * C[f]), area.sum()


rng = np.random.default_rng(4)
for n, m in ((12, 6), (24, 12), (48, 24), (96, 48)):
    V, F = torus_mesh(n, m)
    S, area = sample_mesh(V, F, 200_000, rng)
    sag = (R_MAJ + R_MIN) * (1 - np.cos(np.pi / n)) + R_MIN * (1 - np.cos(np.pi / m))
    print("n=%2d m=%2d  V=%5d F=%5d  %6.1f kB  area err %+.2f%%  max dev %.4f (sag bound %.4f)  mean dev %.4f"
          % (n, m, len(V), len(F), (12 * len(V) + 12 * len(F)) / 1000, 100 * (area / AREA - 1),
             np.abs(sdf_torus(S)).max(), sag, np.abs(sdf_torus(S)).mean()))
V, F = torus_mesh(24, 12)
E = np.unique(np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1), axis=0)
print("Euler characteristic V - E + F = %d - %d + %d = %d" % (len(V), len(E), len(F), len(V) - len(E) + len(F)))
```

出力：

```text
n=12 m= 6  V=   72 F=  144     2.6 kB  area err -7.20%  max dev 0.0923 (sag bound 0.1013)  mean dev 0.0436
n=24 m=12  V=  288 F=  576    10.4 kB  area err -1.84%  max dev 0.0250 (sag bound 0.0256)  mean dev 0.0114
n=48 m=24  V= 1152 F= 2304    41.5 kB  area err -0.46%  max dev 0.0064 (sag bound 0.0064)  mean dev 0.0029
n=96 m=48  V= 4608 F= 9216   165.9 kB  area err -0.12%  max dev 0.0016 (sag bound 0.0016)  mean dev 0.0007
Euler characteristic V - E + F = 288 - 864 + 576 = 0
```

$n$ と $m$ を 2 倍にするたびに三角形は 4 倍、誤差は 4 分の 1 になり、矢高の予測どおりです。弦は曲面の内側を通るので、面積は常に小さめに出ます。オイラー標数はトーラスらしく 0 です。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-mesh.svg" caption="$12 \times 6$、$24 \times 12$、$48 \times 24$ 個の四角形（各 2 枚の三角形）からなるトーラスのメッシュ。各三角形の重心から真の表面までの距離で色付けしています。誤差は環の円が最大になる外側の赤道で最大です。右：面積で重み付けした 100,000 個のサンプルの最大偏差と三角形数 $F$ の関係（$6 \times 3$ から $192 \times 96$ まで）。破線は矢高による上界、点線は傾き $F^{-1}$。$F = 9216$（166 kB）で最大誤差は 0.0016、管の半径の 0.4% です。" %}

実用上の注意を 2 つ。**適応的メッシュ**は曲率の大きい所に小さな三角形、平らな所に大きな三角形を使います。$F^{-1}$ の法則は成り立ったまま定数が小さくなり、メッシュ簡略化（[グラフィックス第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})の二次誤差尺度）が実現しているのはこれです。また、再構成で得たメッシュが完璧なことはまれで、穴、反転した面、非多様体エッジ、自己交差があります。3D プリントやシミュレーションの前には、まず「水密性」（各エッジがちょうど 2 枚の面に共有されているか）を確認します。

## 5. ボクセル、占有グリッド、八分木

### 5.1 密な占有グリッド

バウンディングボックスを一辺 $h$ の立方体 $N^3$ 個に分け、それぞれに値を 1 つ保存します。**占有グリッド**（occupancy grid）では、その値は立方体が物体の内側にあるか（ロボティクスでは障害物に占有されているか）を表します。最も単純な規則は、中心が内側にある（$f(\mathbf c\_{ijk}) < 0$）ボクセルを占有とするものです。ボクセルは画素の 3D 版です。構造が規則的なので参照はインデックス計算 1 回、近傍は $(i \pm 1, j, k)$ で、3D CNN で畳み込めます。

```python
import itertools

LO, HI = -1.5, 1.5                                   # the cube that holds the torus


def grid_centres(N):
    h = (HI - LO) / N
    c = LO + h * (np.arange(N) + 0.5)
    return np.stack(np.meshgrid(c, c, c, indexing="ij"), -1), h


for N in (16, 32, 64, 128):
    X, h = grid_centres(N)
    occ = sdf_torus(X) < 0                           # occupancy: is the voxel centre inside?
    pad = np.pad(occ, 1)
    nb_empty = sum(~np.roll(pad, s, a)[1:-1, 1:-1, 1:-1] for a in range(3) for s in (-1, 1))
    surf = occ & (nb_empty > 0)                      # occupied with an empty face neighbour
    print("N=%3d  occupied %7d (%.2f%%)  surface %6d  volume err %+.2f%%  bits %7.1f kB  floats %8.1f kB"
          % (N, occ.sum(), 100 * occ.mean(), surf.sum(), 100 * (occ.sum() * h ** 3 / VOLUME - 1),
             N ** 3 / 8 / 1000, 4 * N ** 3 / 1000))
```

ループの出力：

```text
N= 16  occupied     472 (11.52%)  surface    312  volume err -1.49%  bits     0.5 kB  floats     16.4 kB
N= 32  occupied    3784 (11.55%)  surface   1408  volume err -1.28%  bits     4.1 kB  floats    131.1 kB
N= 64  occupied   30544 (11.65%)  surface   5928  volume err -0.39%  bits    32.8 kB  floats   1048.6 kB
N=128  occupied  245408 (11.70%)  surface  24144  volume err +0.04%  bits   262.1 kB  floats   8388.6 kB
```

観察が 2 つあります。第一に、**体積**は $N = 16$ でもよく推定できます（誤差 1.5%）。表面の両側の誤差が打ち消し合うからです。**表面**の位置は別問題で、ボクセルの境界は階段状であり、真の表面までの平均距離は $h/4$ をやや下回り、階段の角では最大でおよそ $0.8h$（高々 $\sqrt 3\, h/2$）です。誤差を半分にするには 8 倍のメモリが必要です（第 6 節で測ります）。第二に、表面ボクセルの数は $N^2$ で増え（1 行下るごとに 4 倍）、グリッドは $N^3$ で増えます。$N = 128$ では表面に触れるボクセルは 1% だけです。密なグリッドはメモリのほぼすべてを空の空間と内部に費やし、ビットの代わりに float32 の値を保存するとさらに 32 倍かかります。

### 5.2 確率的占有と対数オッズ

ロボットの地図は占有状態を確実には知りません。各ボクセルは占有されている確率 $p$ を保存し、センサの光線で更新します。光線が*終わる*ボクセルは「占有」の証拠、光線が*通過する*ボクセルは「空き」の証拠です。独立な観測についてのベイズ則は、**対数オッズ**（log-odds）$l = \log\frac{p}{1 - p}$ では足し算になります。

$$
l \leftarrow l + \log\frac{P(\text{occ} \mid z)}{1 - P(\text{occ} \mid z)} - l_0 ,
$$

ここで $l\_0$ は事前分布（$p = 0.5$ なら 0）です。センサモデル $P(\text{occ} \mid \text{hit}) = 0.7$、$P(\text{occ} \mid \text{pass}) = 0.4$ では、ヒット 1 回で $\log(0.7/0.3) = 0.847$、通過 1 回で $\log(0.4/0.6) = -0.405$ が加わります。$l$ をある区間（ここでは $[-2, 3.5]$）に制限しておくと、世界が変わったときに地図も変われます。第 5.3 節のコードブロックの最後の行は、3 回のヒットの後に 1 回の通過があった場合を出力します。

```text
hit  l = +0.847  p = 0.700
hit  l = +1.695  p = 0.845
hit  l = +2.542  p = 0.927
miss l = +2.136  p = 0.894
```

OctoMap（Hornung ら、2013）が八分木に保存しているのはまさにこの値です。

### 5.3 八分木：表面のある所にメモリを使う

**八分木**（octree）は 1 つの立方体から始め、必要な所だけ立方体を 8 つの子に分割します。表面の場合、「必要」とは表面がその立方体を通るかもしれないことです。SDF はこの問いにただで答えます。$\lvert f \rvert$ は距離なので、立方体の中心での $\lvert f(\mathbf c)\rvert$ が半対角線 $\sqrt 3\, h/2$ を超えれば、立方体の中に表面の点はありません。スフィアトレーシングを安全にするのと同じリプシッツの議論です。

```python
OFFS = np.array(list(itertools.product((-1, 1), repeat=3)), float)   # the 8 child directions


def octree_levels(sdf, max_depth):
    """Node count per level of an octree that only splits cells the surface may cross."""
    centres, half = np.zeros((1, 3)), (HI - LO) / 2
    counts = []
    for depth_ in range(max_depth + 1):
        counts.append(len(centres))
        if depth_ == max_depth:
            break
        # 1-Lipschitz SDF: if |f(centre)| > half-diagonal, the surface cannot enter the cell
        cross = np.abs(sdf(centres)) <= np.sqrt(3) * half
        centres = (centres[cross][:, None, :] + 0.5 * half * OFFS[None]).reshape(-1, 3)
        half = half / 2
    return counts


cnt = octree_levels(sdf_torus, 8)
print("octree nodes per level:", cnt)
print("total %d nodes vs %d dense voxels at 256^3 (%.2f%%)" % (sum(cnt), 256 ** 3, 100 * sum(cnt) / 256 ** 3))


def logodds(p):
    return np.log(p / (1 - p))


l_hit, l_miss = logodds(0.7), logodds(0.4)           # sensor model: P(occ | hit), P(occ | pass-through)
l = 0.0                                              # prior p = 0.5
for z in ("hit", "hit", "hit", "miss"):
    l = np.clip(l + (l_hit if z == "hit" else l_miss), -2.0, 3.5)
    print("%-4s l = %+.3f  p = %.3f" % (z, l, 1 / (1 + np.exp(-l))))
```

出力：各レベルのノード数 `[1, 8, 64, 256, 1664, 6784, 25728, 95936, 402176]`、合計 `532617 nodes vs 16777216 dense voxels at 256^3 (3.17%)`。レベル 5 以降、各レベルのノード数は前のレベルの約 4 倍で、8 倍ではありません。八分木は表面積とともに $4^L$ で増え、密なグリッドは体積とともに $8^L$ で増えます。木が深いほど、セル数の節約は大きくなります。

それが*バイト数*の節約になるかどうかは、密なセル 1 つのコストによります。ポインタベースのノードは数バイトを使います。ノードあたり 8 バイトとすると、レベル 7（$128^3$ グリッドと同じ解像度）までの八分木（130,441 ノード）は 1.04 MB で、ビット詰めの $128^3$ 占有グリッド（262 kB）の 4 倍ですが、$128^3$ の float32 グリッド（8.4 MB）の 8 分の 1 です。ロボットの地図はセルごとに浮動小数点の対数オッズを、TSDF は距離と重みを保存するので、本来必要になるグリッドと比べれば八分木はすぐに勝ち、その差はレベルが 1 つ深くなるごとに 2 倍に広がります。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-octree.svg" localized="true" caption="左：トーラスの断面 $y = 0$（半径 0.4 の 2 つの円板）の四分木（2D の八分木）。半対角線の判定で境界がセルに入りうるときだけ、深さ 6 まで分割しています。葉は 448 個で、$64^2 = 4096$ セルではありません。右：3D 八分木（深さ 8、最小セル $3/256 \approx 0.012$）の各レベルのノード数と、密なグリッドの $8^L$ セルの比較。八分木は面積の増え方である $4^L$ に従います。レベル 8 で 402,176 ノード対 1680 万セル。" %}

この節約には代償があります。参照は根からポインタをたどり（インデックス計算 1 回ではなく $L$ ステップ）、近傍を見つけるのが難しく、データの挿入で木の構造が変わることがあります。GPU のシステムはもっと平坦な方式を好むことが多く、**ボクセルハッシング**（voxel hashing；Nießner ら、2013）は観測された表面の近くにだけ小さな密なボクセルブロックを確保し、ブロック座標をキーとするハッシュテーブルで見つけます。参照は $O(1)$ のまま、メモリは表面に沿って使われ、間接参照が 1 段だけの八分木のようなものです。第 10 節でこの「疎ブロック」配置を測ります。

## 6. 符号付き距離場と TSDF

### 6.1 なぜ占有ではなく距離を保存するのか

SDF は各グリッド頂点に 1 ビットではなく符号付き距離 $f$ を保存します。距離のグリッドは、表面が 2 頂点の間に*あるかどうか*だけでなく、*どこにあるか*も教えてくれます。$f\_a < 0$ から $f\_b > 0$ へのエッジ上で、ゼロ点は割合 $t = f\_a/(f\_a - f\_b)$ の位置にあり、マーチングスクエアやマーチングキューブ（[グラフィックス第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})）とまったく同じです。頂点の間の場は**三重線形補間**で復元します。セル内の小数座標が $(\xi, \eta, \zeta) \in [0, 1]^3$、角の値が $f\_{abc}$（$a, b, c \in \\{0, 1\\}$）の点では

$$
\hat f = \sum_{a, b, c \in \{0, 1\}} f_{abc}\; \xi^{a}(1 - \xi)^{1-a}\, \eta^{b}(1 - \eta)^{1-b}\, \zeta^{c}(1 - \zeta)^{1-c} .
$$

滑らかな関数の線形補間の誤差は、$h^2$ と 2 階微分の積に比例します。距離場は勾配の方向には線形なので、誤差は表面の曲率だけから生じ、$\hat f$ のゼロ等値面はふつう真の表面からボクセルのごく一部しか離れません。**同じ $N^3$ グリッドからサブボクセル精度が得られる**のです。占有はこの情報を捨てるので、誤差は $h$ に比例します。

```python
def sdf_grid(N):
    """The SDF sampled at the (N+1)^3 vertices of an N^3 grid."""
    g = np.linspace(LO, HI, N + 1)
    return sdf_torus(np.stack(np.meshgrid(g, g, g, indexing="ij"), -1)), (HI - LO) / N


def trilinear(G, h, p):
    """Trilinear interpolation of grid values G at points p (M x 3)."""
    s = (p - LO) / h
    i = np.clip(np.floor(s).astype(int), 0, G.shape[0] - 2)
    f = s - i
    val = 0.0
    for c in itertools.product((0, 1), repeat=3):
        w = np.prod([f[:, k] if c[k] else 1 - f[:, k] for k in range(3)], axis=0)
        val = val + w * G[i[:, 0] + c[0], i[:, 1] + c[1], i[:, 2] + c[2]]
    return val


def zero_crossings(G, h):
    """Points where the field changes sign along grid edges: the vertices marching cubes places."""
    out_ = []
    for ax in range(3):
        f0 = np.take(G, np.arange(G.shape[ax] - 1), axis=ax)
        f1 = np.take(G, np.arange(1, G.shape[ax]), axis=ax)
        idx = np.argwhere((f0 < 0) != (f1 < 0))
        a, b = f0[tuple(idx.T)], f1[tuple(idx.T)]
        p = idx.astype(float)
        p[:, ax] += a / (a - b)                      # linear interpolation along the edge
        out_.append(LO + h * p)
    return np.concatenate(out_)


G16, h16 = sdf_grid(16)
x_q = np.array([[0.62, 0.05, 0.11]])
print("at", x_q[0], ": trilinear %.4f, exact %.4f" % (trilinear(G16, h16, x_q)[0], sdf_torus(x_q)[0]))
for N in (16, 32, 64, 128):
    G, h = sdf_grid(N)
    Z = zero_crossings(G, h)
    print("N=%3d  h=%.4f  crossings %6d  mean |sdf| %.5f  max %.5f  |f_hat| at true surface: mean %.5f"
          % (N, h, len(Z), np.abs(sdf_torus(Z)).mean(), np.abs(sdf_torus(Z)).max(),
             np.abs(trilinear(G, h, P_true)).mean()))
print("TSDF band: voxels with |sdf| < 3h at N=128: %.2f%% of the grid"
      % (100 * np.mean(np.abs(sdf_grid(128)[0]) < 3 * 3.0 / 128)))
```

出力：

```text
at [0.62 0.05 0.11] : trilinear -0.0001, exact -0.0063
N= 16  h=0.1875  crossings    720  mean |sdf| 0.00248  max 0.00914  |f_hat| at true surface: mean 0.00746
N= 32  h=0.0938  crossings   2664  mean |sdf| 0.00058  max 0.00266  |f_hat| at true surface: mean 0.00186
N= 64  h=0.0469  crossings  10392  mean |sdf| 0.00014  max 0.00067  |f_hat| at true surface: mean 0.00046
N=128  h=0.0234  crossings  42168  mean |sdf| 0.00004  max 0.00017  |f_hat| at true surface: mean 0.00012
TSDF band: voxels with |sdf| < 3h at N=128: 8.03% of the grid
```

ゼロ点（マーチングキューブが作る頂点）は $N = 16$ で真の表面から平均 0.00248 ずれ、これはボクセルの 1.3% です。$h$ を半分にするごとに誤差は約 4 分の 1 になります。逆に、真の表面上（厳密な $f$ がゼロの所）で補間場 $\hat f$ を評価すると、$N = 16$ で 0.00746 ずれ、これも $h^2$ で減ります。1 点だけの問い合わせでも同じ効果が見えます。管のすぐ内側の点で、間隔 $0.19$ の頂点の間を補間すると $0.006$ ずれます。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-sdf-vs-occupancy.svg" localized="true" caption="解像度 $16^3$ でのトーラスの断面 $y = 0$（半径 0.4 の 2 つの円板）。左：占有、すなわち中心が内側にあるボクセル。境界は階段状です。中：その平面の $17^2$ 個のグリッド頂点（点）でサンプルした SDF を双線形補間したもの。ゼロ等値線（橙）は真の円（破線、ほとんど隠れています）に重なります。右：3D での双方向の平均表面誤差とボクセル幅 $h$ の関係。占有は $h/5$ 付近、$0.17h$ から $0.22h$ の間にとどまり（$N = 16$ で 0.032、$N = 128$ で 0.0046）、補間した SDF は $h^2$ に従います（$N = 8$ で 0.020、$N = 128$ で 0.00008）。" %}

代償はメモリ（ボクセルあたり 1 ビットではなく頂点あたり 32 ビット）と 2 つの限界です。ボクセル約 2 つ分より**薄い構造**は消えることがあります。その内側に頂点が入らず、符号が一度も変わらないからです。**鋭いエッジや角**は丸まります。三重線形補間はセル内の折り目を表せないからです（デュアルコンタリングなどマーチングキューブの変種は勾配を保存してこれを解決します）。

SDF には実用上重要な利点がさらに 2 つあります。勾配が表面の法線 $\mathbf n = \nabla f / \lVert \nabla f\rVert$ で、表面上だけでなくどこでも得られます。また、ほぼいたるところで**アイコナール方程式**（eikonal equation）$\lVert\nabla f\rVert = 1$ を満たし、ニューラル SDF はこの制約を正則化に使います（第 7 節）。

### 6.2 切断 SDF

KinectFusion（Newcombe ら、2011）や、その基礎となった Curless と Levoy（1996）の体積的手法のように、SDF を奥行きマップから作るとき、表面までの真の距離はわかりません。わかるのは各カメラ光線に沿った**射影距離**、すなわち画素 $(u, v)$ に投影されるボクセル $\mathbf x$ についての $Z\_{\text{measured}}(u, v) - Z\_c(\mathbf x)$ だけです。これは表面の近くでしか符号付き距離のよい近似にならず、表面のずっと後ろでは無意味です（そこは観測されていません）。そこで値を**切断**します。

$$
\text{TSDF}(\mathbf x) = \mathrm{clamp}\Big(\frac{Z_{\text{measured}}(u, v) - Z_c(\mathbf x)}{\mu},\ -1,\ 1\Big),
$$

切断距離 $\mu$ は数ボクセルにとります。各ボクセルは重みも保存し、新しい奥行きマップは重み付き移動平均で統合します。統合は[第 7 回]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})で導出し、[第 9 回]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})でウィジェット付きで一通り動かします。（符号の規約はまちまちです。ここでは TSDF は表面の手前、つまり自由空間で正、表面の後ろで負で、外側で正の SDF と一致させています。）

切断はメモリにも影響します。情報を持つのは表面から $\mu$ 以内のボクセルだけなので、それだけを保存すればよいのです。トーラスでは $N = 128$ のとき、表面から $3h$ 以内のボクセルはグリッドの 8.03% です。ボクセルハッシングはまさにこの帯を $8^3$ ブロックで保存し、第 10 節でその効果を示します。

切断しない完全な距離場（ユークリッド SDF、**ESDF**）は動作計画が欲しがるものです。自由空間の任意の点から最も近い障害物までの距離が必要だからです。Voxblox（Oleynikova ら、2017）はドローンの経路計画のために、TSDF から ESDF を逐次的に構築します。

## 7. ニューラル場

### 7.1 空間の関数としてのネットワーク

**ニューラル場**（neural field）は、$f$ をグリッド上でサンプリングする代わりに、ネットワーク $f\_\theta : \mathbb R^3 \to \mathbb R$（あるいは占有、密度、色への写像）で表します。座標を入れると値が出てきます。主な系統は次のとおりです。

- **占有ネットワーク**（Occupancy Networks；Mescheder ら、2019）は $\mathbf x$ が内側にある確率を出力し、表面はその確率のしきい値 $\tau$（たとえば $0.5$）での等値面です。
- **DeepSDF**（Park ら、2019）は符号付き距離を出力します。形状ごとの潜在コード $\mathbf z$ でネットワークを条件付け、$f\_\theta(\mathbf x, \mathbf z)$ とすることで、1 つのネットワークがカテゴリ全体の形状を表し、新しい形状の当てはめは $\mathbf z$ の最適化だけで済みます。
- **NeRF**（Mildenhall ら、2020）は密度と視点依存の色を出力し、画像からのボリュームレンダリングで学習します（[ニューラルレンダリング第 2 回]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})）。その幾何は表面ではなく密度場で、[第 9 回]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})の NeuS 系の手法がそれを SDF に戻します。

共通点は、表現が**連続的**（任意の $\mathbf x$、任意の解像度で問い合わせ可能）で、$\mathbf x$ と $\theta$ の両方について**微分可能**（だからレンダラを通して当てはめられる）、そして**メモリが解像度に依存しない**（パラメータ数は出力解像度とともに増えない）ことです。

### 7.2 スペクトルバイアスと位置エンコーディング

素の多層パーセプトロンは関数を当てはめるとき、低周波を先に学び、高周波はとてもゆっくりしか学びません。これがニューラルネットワークの**スペクトルバイアス**（spectral bias；Rahaman ら、2019）です。形状では角が丸まり、細部が失われることを意味します。NeRF が使い、Tancik ら（2020）が分析した標準的な対処法は、入力の**位置エンコーディング**（positional encoding）をネットワークに与えることです。

$$
\gamma(\mathbf x) = \big(\mathbf x,\ \sin(2^0\pi\mathbf x),\ \cos(2^0\pi\mathbf x),\ \dots,\ \sin(2^{L-1}\pi\mathbf x),\ \cos(2^{L-1}\pi\mathbf x)\big),
$$

これで高周波が、低周波から組み立てるまでもなく入力として使えるようになります。

2D で試してみましょう。2D なら小さな NumPy ネットワークが数秒で学習できます。形状は歯が 16 本（角が 64 個）の歯車で、厳密な SDF は最も近い多角形の辺までの距離として計算し、符号は偶奇規則で決めます。ネットワークは 64 ユニットの ReLU 隠れ層 2 つを持ち、$[-1, 1]^2$ のランダムな点での SDF の平均 2 乗誤差を Adam で最小化します。逆伝播は手で書いているので、このコードは小さいながら完全なニューラル場です。

```python
def sdf_polygon(p, Vp):
    """Exact SDF of a closed polygon Vp (k x 2) at points p (M x 2); negative inside."""
    d = np.full(len(p), np.inf); inside = np.zeros(len(p), bool)
    for a, b in zip(Vp, np.roll(Vp, 1, axis=0)):
        e, w = b - a, p - a
        t = np.clip(w @ e / (e @ e), 0, 1)
        d = np.minimum(d, np.linalg.norm(w - t[:, None] * e, axis=1))
        crosses = (a[1] > p[:, 1]) != (b[1] > p[:, 1])                  # even-odd rule
        x_hit = a[0] + (p[:, 1] - a[1]) * e[0] / (e[1] + 1e-300)
        inside ^= crosses & (p[:, 0] < x_hit)
    return np.where(inside, -d, d)


a_g = 2 * np.pi * (np.arange(64) + 0.5) / 64          # a gear with 16 teeth: 64 corners
GEAR = np.stack([np.cos(a_g), np.sin(a_g)], 1) * np.where(np.arange(64) // 2 % 2, 0.62, 0.8)[:, None]


def encode(x, L):
    """NeRF-style positional encoding: x, sin(2^k pi x), cos(2^k pi x) for k < L."""
    feats = [x]
    for k in range(L):
        feats += [np.sin(2 ** k * np.pi * x), np.cos(2 ** k * np.pi * x)]
    return np.concatenate(feats, 1)


def train_field(L, width=64, steps=4000, batch=1024, lr=3e-3, seed=0):
    """f(x) = W3 relu(W2 relu(W1 enc(x) + b1) + b2) + b3, fitted to the SDF with Adam."""
    rng = np.random.default_rng(seed)
    dims = [2 + 4 * L, width, width, 1]
    params = []
    for i in range(3):
        params += [rng.normal(0, np.sqrt(2 / dims[i]), (dims[i], dims[i + 1])), np.zeros(dims[i + 1])]
    m = [np.zeros_like(q) for q in params]; v = [np.zeros_like(q) for q in params]
    for it in range(1, steps + 1):
        x = rng.uniform(-1, 1, (batch, 2))
        y = sdf_polygon(x, GEAR)[:, None]
        h0 = encode(x, L)
        z1 = h0 @ params[0] + params[1]; h1 = np.maximum(z1, 0)
        z2 = h1 @ params[2] + params[3]; h2 = np.maximum(z2, 0)
        pred = h2 @ params[4] + params[5]
        g = 2 * (pred - y) / batch                                     # d(MSE)/d(pred)
        g2 = (g @ params[4].T) * (z2 > 0); g1 = (g2 @ params[2].T) * (z1 > 0)
        grads = [h0.T @ g1, g1.sum(0), h1.T @ g2, g2.sum(0), h2.T @ g, g.sum(0)]
        a_t = lr * (0.05 ** (it / steps))                              # exponential decay to 5%
        for q, gq, mq, vq in zip(params, grads, m, v):                 # Adam
            mq *= 0.9; mq += 0.1 * gq; vq *= 0.999; vq += 0.001 * gq ** 2
            q -= a_t * (mq / (1 - 0.9 ** it)) / (np.sqrt(vq / (1 - 0.999 ** it)) + 1e-8)

    def f(x):
        h = np.maximum(encode(x, L) @ params[0] + params[1], 0)
        return (np.maximum(h @ params[2] + params[3], 0) @ params[4] + params[5])[:, 0]
    return f, sum(q.size for q in params)


g2d = np.linspace(-1, 1, 201)
XY = np.stack(np.meshgrid(g2d, g2d, indexing="xy"), -1).reshape(-1, 2)
SDF_GEAR = sdf_polygon(XY, GEAR)
band = np.abs(SDF_GEAR) < 0.05                       # points within 0.05 of the boundary


def report(name, pred, n_floats):
    err = np.abs(pred - SDF_GEAR)
    iou = np.mean((pred < 0) & (SDF_GEAR < 0)) / np.mean((pred < 0) | (SDF_GEAR < 0))
    print("%-14s %5d floats  mean |error| %.4f  near the boundary %.4f  IoU %.4f"
          % (name, n_floats, err.mean(), err[band].mean(), iou))


FIELDS = {}
for L in (0, 2, 6):
    f, n_par = train_field(L)
    FIELDS[L] = f
    report("MLP, L=%d" % L, f(XY), n_par)

from scipy.interpolate import RegularGridInterpolator

gn = np.linspace(-1, 1, 70)                          # 70 x 70 = 4900 floats, like the L=2 MLP
GN = np.stack(np.meshgrid(gn, gn, indexing="ij"), -1).reshape(-1, 2)
grid_f = RegularGridInterpolator((gn, gn), sdf_polygon(GN, GEAR).reshape(70, 70))
report("grid 70x70", grid_f(XY), 70 * 70)
```

出力：

```text
MLP, L=0        4417 floats  mean |error| 0.0107  near the boundary 0.0175  IoU 0.9056
MLP, L=2        4929 floats  mean |error| 0.0074  near the boundary 0.0074  IoU 0.9632
MLP, L=6        5953 floats  mean |error| 0.0098  near the boundary 0.0109  IoU 0.9435
grid 70x70      4900 floats  mean |error| 0.0007  near the boundary 0.0008  IoU 0.9952
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-neural-field.svg" localized="true" caption="歯が 16 本の歯車の 2D ニューラル SDF。Adam で 4000 ステップ学習。灰色：誤差 $\vert f\_\theta - f\vert$（黒は 0.04 以上）、黒線：真の輪郭、赤線：モデルのゼロ等値線。位置エンコーディングなし（$L = 0$）では歯が丸まります（境界付近の誤差 0.0175、IoU 0.906）。$L = 2$ の周波数帯で歯が現れ（0.0074、IoU 0.963）、$L = 6$ ではいたるところノイズが乗ります（0.0109）。右端：$L = 2$ のネットワークと同じ個数の値を持つ $70 \times 70$ の SDF グリッドを双線形補間したもの。10 倍正確です（0.0008、IoU 0.995）。" %}

教訓は 3 つで、すべて 3D にも当てはまります。

1. **スペクトルバイアスは実在します。** エンコーディングがないと、ネットワークは 4000 ステップで歯を描けません。
2. **周波数は多ければよいわけではありません。** $L = 6$ では形状に必要な周波数をはるかに超えるものが表現できます。各ステップで新しいランダムな点を引くので、これは固定した学習データへの過学習ではありません。4000 ステップという固定の予算の中では高周波成分が抑えられず、場全体にさざ波として残り、最適化そのものも難しくなります（演習 5）。そのため後続の手法は周波数帯を減らしたり、学習中に徐々に加えたり（coarse-to-fine）、SIREN の正弦関数（Sitzmann ら、2020）など別の活性化関数を使ったりします。
3. **小さなネットワーク 1 つは、形状 1 つを保存するコンパクトな方法ではありません。** 同じサイズの単純なグリッドのほうが 1 桁上です。ニューラル場が真価を発揮するのは別の場面です。場が高次元のとき（NeRF の 5 次元放射輝度）、潜在コード付きの 1 つのネットワークで多くの形状を表すとき（DeepSDF）、表現を微分可能レンダラ越しに当てはめる必要があるとき、そしてネットワークをグリッドと組み合わせるときです。Instant-NGP の多解像度ハッシュグリッド（[ニューラルレンダリング第 3 回]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})）のようなハイブリッドは特徴をグリッドに保存し、それをデコードするためだけに小さな MLP を使うので、グリッドの精度とネットワークの柔軟性を両立します。

ニューラル SDF では、素の回帰損失には学習点の外で $f\_\theta$ を距離にする力がありません。**アイコナール損失** $\mathbb E\_{\mathbf x}\big(\lVert\nabla\_{\mathbf x} f\_\theta(\mathbf x)\rVert - 1\big)^2$（IGR、Gropp ら、2020）がその制約を加えます。これにより、点上で $f\_\theta = 0$ という唯一のデータ項だけで、生の点群に SDF を当てはめることもできます。

## 8. 3D ガウシアン

### 8.1 プリミティブ

[3D ガウシアン・スプラッティング]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})（Kerbl ら、2023）はシーンを異方性ガウシアンの集合で表します。各ガウシアンは平均 $\boldsymbol\mu \in \mathbb R^3$、共分散 $\Sigma = R S S^\top R^\top$（回転 $R$ は単位四元数から、スケール $S = \mathrm{diag}(s\_1, s\_2, s\_3)$）、不透明度 $o$、球面調和関数による視点依存の色を持ちます。$\mathbf x$ での密度は

$$
G(\mathbf x) = o \, \exp\Big(-\tfrac12 (\mathbf x - \boldsymbol\mu)^\top \Sigma^{-1} (\mathbf x - \boldsymbol\mu)\Big)
$$

です。3 次の球面調和関数（色チャネルあたり 16 係数）では、1 つのガウシアンは $3 + 4 + 3 + 1 + 48 = 59$ 個の学習される浮動小数点数、236 バイトです。参照実装の PLY ファイルは未使用の法線フィールド 3 つも保存します。幾何だけなら 11 個です。実際のシーンでは数十万から数百万個のガウシアンを使います。

表現としてのガウシアンは点と体積の中間にあります。**陽的**（編集、カリング、ストリーミングできるリスト）、**ソフト**（それぞれが空間的な広がりを持つので穴なしで表面を覆う）、**微分可能**（勾配がすべてのパラメータに流れる）、**描画が速い**（レイマーチングではなく、投影してアルファブレンドする）です。欠けているのは、はっきり定義された表面です。シーンは密度であり、「表面」は累積不透明度が飽和する場所です。

### 8.2 幾何としてのガウシアン

ガウシアンが表面をどう記述するかを見るため、表面に直接当てはめてみましょう。単純な方法（そしてよく使われる初期化）は、表面サンプルを k-means でクラスタリングし、各クラスタにその点の標本平均と共分散を与えることです。（3DGS 自体はレンダリングを通してガウシアンを最適化します。クラスタリングは幾何を見るための最もわかりやすい方法にすぎません。）

```python
from scipy.cluster.vq import kmeans2


def fit_gaussians(P, k, seed=0):
    """k anisotropic Gaussians fitted to a point cloud: k-means, then each cluster's covariance."""
    mu, lab = kmeans2(P, k, minit="++", seed=seed)
    cov = np.stack([np.cov(P[lab == j].T) + 1e-6 * np.eye(3) for j in range(k)])
    w = np.bincount(lab, minlength=k) / len(P)
    return mu, cov, w


Pg = sample_torus(20_000, np.random.default_rng(5))[0]
mu_g, cov_g, w_g = fit_gaussians(Pg, 100)
evals, evecs = np.linalg.eigh(cov_g)                 # ascending: column 0 = thinnest axis
n_at_mu = grad(sdf_torus, mu_g)
cosang = np.abs(np.sum(evecs[:, :, 0] * n_at_mu, 1)) / np.linalg.norm(n_at_mu, axis=1)
ang_g = np.degrees(np.arccos(np.clip(cosang, -1, 1)))
flat = np.sqrt(evals[:, 0] / evals[:, 2])
print("thinnest axis vs surface normal: median %.1f deg, max %.1f deg" % (np.median(ang_g), ang_g.max()))
print("thickness / length sigma ratio: median %.3f" % np.median(flat))
print("centres inside the tube by: median %.4f" % np.median(-sdf_torus(mu_g)))
```

出力：`thinnest axis vs surface normal: median 1.6 deg, max 4.4 deg`、`thickness / length sigma ratio: median 0.140`、`centres inside the tube by: median 0.0171`。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-gaussians.svg" caption="左：20,000 個の表面サンプルに k-means で当てはめたガウシアン 100 個を $\pm 2\sigma$ で描画。表面に沿った平たい円盤になります。中：断面 $y = 0$ での混合密度の対数と真の管の円（破線）。密度は殻状で、隣の円盤が重なる所で最も厚くなります。右：各ガウシアンの最も薄い軸と、その中心での真の法線とのなす角。中央値 1.6°、最大 4.4°。厚さの中央値は長さの 0.14 倍です。" %}

ガウシアンは自ら表面に接する円盤に平たくなり、最も薄い軸が法線を向きます。ただし表面上にぴったりあるわけではありません。曲がったパッチ上の点の塊の平均は曲線の内側に来ます（ここでは中心が管の内側に中央値で 0.017 入っています）。メッシュの矢高と同じ効果です。この観察が表面志向の変種を生みました。**2D ガウシアン・スプラッティング**（Huang ら、2024）は法線がはっきり定義された平たい 2D ガウス円盤（サーフェル）を使い、奥行きと法線を一貫させ、表面を取り出せるようにしました。[ニューラルレンダリング第 5 回]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})でこれらを含む変種を概観しています。

ガウシアンからメッシュを得る最も一般的な方法は間接的です。多数の視点から奥行きマップを描画して TSDF に統合し（第 6.2 節）、マーチングキューブを実行します。第 9 節ですべての表現間の経路を挙げます。

## 9. 表現間の変換

実際のパイプラインは何度も変換します。奥行きマップから TSDF へ、TSDF からメッシュへ、評価のためにメッシュから点へ。どの変換にも標準的なアルゴリズムと、特有の情報の失い方があります。

| 変換 | 標準的な方法 | 失うもの・仮定するもの | このブログでの場所 |
| --- | --- | --- | --- |
| 奥行きマップ → 点 | 逆投影 $Z K^{-1}\tilde{\mathbf u}$ | 何も失わないが、フライングピクセルの除去が必要 | 第 2.2 節 |
| 奥行きマップ → TSDF | 射影切断距離、重み付き平均 | ボクセルより細かい細部。姿勢が必要 | [第 7 回]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})、[第 9 回]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) |
| SDF / TSDF / 占有 → メッシュ | マーチングキューブ（鋭い特徴にはデュアルコンタリング） | 鋭いエッジ、ボクセルより薄い特徴 | [グラフィックス第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) |
| ニューラル場 → メッシュ | グリッド上でサンプルしてマーチングキューブ | サンプリンググリッドより細かいものすべて | 第 7 節 |
| 点 → メッシュ | スクリーンド・ポアソン（向き付き法線が必要）、ボールピボット | 穴を滑らかな推測で埋める。法線が必要 | [グラフィックス第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})、[第 9 回]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) |
| メッシュ → 点 | 面積で重み付けしたサンプリング | 接続関係 | 第 4.2 節 |
| メッシュ → SDF | 最近点距離。符号は回転数か光線の交差の偶奇から | 水密なら何も失わない。そうでなければ符号が定まらない | 演習 4 |
| メッシュ / 点 → ボクセル | セルへのラスタライズまたは量子化 | $h$ より細かいものすべて | 第 5 節 |
| ガウシアン → メッシュ | 多視点から奥行きを描画、TSDF 統合、マーチングキューブ | ソフトで半透明な内容 | 第 8 節 |
| 任意 → 奥行きマップ | カメラからラスタライズまたはレイキャスト | 見えないものすべて | 第 2 節 |
| 任意 → ガウシアン | 点から初期化し、レンダリングで最適化 | 画像またはレンダラが必要 | [ニューラルレンダリング第 4 回]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) |

経験則が 2 つあります。**陰的表現への**変換（点 → SDF）には、元データに含まれていないかもしれない内外の判断が必要なので、法線、水密なメッシュ、あるいは追加の仮定が要ります。**離散表現への**変換（任意 → ボクセル）では、セルより細かいものはすべて永久に失われます。元のデータを残し、変換はできるだけ遅らせましょう。

## 10. メモリと精度

### 10.1 1 つの形状ですべての表現を測る

これで表現を 1 つのグラフに並べられます。各表現についてさまざまな解像度でメモリと**双方向の平均表面誤差**を計算します。その表現の表面から真の表面までの平均距離の半分と、真の表面からその表現の表面までの平均距離の半分の和です（第 3.3 節の Chamfer 距離ですが、表現が連続な表面を持つ場合はその表面で評価します）。点の「表面」は点そのもの、占有はボクセルの階段、SDF グリッドは補間場のゼロ等値面、メッシュは三角形です。メモリは float32 の座標と値、int32 のインデックス、ボクセルあたり 1 ビットで数えます。「疎な SDF」は、表面が横切るセルを含む $8^3$ ブロックだけを保存します。ボクセルハッシングと同じです。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-tradeoff.svg" localized="true" caption="トーラスについてのメモリと双方向平均表面誤差。点：厳密なサンプル 500〜50,000 点（誤差 0.044〜0.0044）。メッシュ：$8 \times 4$〜$128 \times 64$（0.093〜0.0004）。占有：$16^3$〜$128^3$ ビット（0.032〜0.0046）。密な SDF：float32 の $8^3$〜$128^3$ セル（0.020〜0.00008）。疎な SDF：同じ値を表面に触れる $8^3$ ブロックだけに保存したもので、$128^3$ で 8.6 MB ではなく 1.5 MB。両対数グラフでの傾きは、点 $-1/2$、占有 $-1/3$、密な SDF $-2/3$、メッシュ $-1$、疎な SDF は高解像度で $-1$ に近づきます（$N$ が小さいと $8^3$ ブロックが粗いため）。" %}

### 10.2 スケーリング則

両対数グラフ上でどの曲線も直線になり、その傾きは 2 つの事実、つまり誤差が解像度にどう依存するかとメモリが解像度にどう依存するかから決まります。$h$ を解像度（サンプル間隔、ボクセル幅、辺の長さ）、$M$ をメモリとします。

| 表現 | 誤差 | メモリ | メモリの関数としての誤差 |
| --- | --- | --- | --- |
| 点群 | 間隔、$\propto h$ | 曲面上のサンプル、$\propto h^{-2}$ | $\propto M^{-1/2}$ |
| 占有グリッド（密） | 階段、$\propto h$ | $\propto h^{-3}$ | $\propto M^{-1/3}$ |
| SDF グリッド（密） | 補間、$\propto h^2$ | $\propto h^{-3}$ | $\propto M^{-2/3}$ |
| SDF グリッド（疎な帯） | $\propto h^2$ | 表面近くの帯、$\propto h^{-2}$ | $\propto M^{-1}$ |
| 三角形メッシュ | 矢高、$\propto h^2$ | $\propto h^{-2}$ | $\propto M^{-1}$ |
| 八分木の占有 | $\propto h$ | $\propto h^{-2}$ | $\propto M^{-1/2}$ |

約 10 kB でグラフを読むと、メッシュ（$24 \times 12$、10.4 kB）の誤差は 0.011、密な SDF（$12^3$、8.8 kB）は 0.0085、占有（$32^3$ ビット 4.1 kB、$48^3$ 13.8 kB）は 0.018 と 0.013、1000 点（12 kB）は 0.031 です。約 150 kB では、疎な SDF（131 kB で 0.00054）とメッシュ（166 kB で 0.00072）が先頭で、密な SDF（144 kB で 0.0012）が続き、占有（111 kB で 0.0067）と点（120 kB で 0.0099）は 1 桁遅れます。一般化できる教訓は 2 つです。**解像度より補間**：サンプルあたりもう少し多く保存する（ビットではなく距離、点ではなく三角形）と、定数ではなく指数が変わります。**どこにでも保存するより表面の近くに保存**：疎な SDF とメッシュの傾きが最もよいのは、どちらも表面にだけメモリを使うからです。

これらの数値は滑らかな形状 1 つについてのものです。薄い部分や鋭いエッジのある形状では、低解像度で SDF と占有の曲線が平らになり（特徴が消える）、サンプルがちょうど表面上にある点やメッシュが相対的によく見えます。下のウィジェットで試してください。

### 10.3 試してみよう：1 つの形状、6 つの表現

ウィジェットはすべてが一度に見える 2D で動きますが、スケーリング則は同じです。3D では密なグリッドが $N$ の累乗を 1 つ余分に払います。

{% include widget.liquid name="3d-vision-representations" height="640" caption="100 mm の枠内の 2D 形状を、点、画素（占有）、四分木、SDF グリッド（マーチングスクエア付き）、多角形、ガウス混合として保存します。ボタンで表現を、スライダーで解像度を選びます。破線が真の境界です。パネルにはメモリ（float32 座標、画素あたり 1 ビット、四分木ノードあたり 8 バイト。このため小さなサイズでは四分木はビット詰めの画素グリッドに負けます。第 5.3 節参照）と、表現の境界と真の境界の間の双方向平均距離を表示します。プローブ（丸で囲んだ点）をドラッグすると、各表現がその点について何を言えるかがわかります。点は距離しか返せず、画素と四分木の葉は内か外かを、SDF は 4 つの節点から符号付き距離を補間し（破線の円の半径がその値）、多角形は半直線の交差を数え、ガウス混合は真の面積と一致するように選んだしきい値と密度を比べます。グラフは 6 つの表現すべてについて全範囲のメモリと誤差を描きます。点をタップするとその設定に移ります。細い輪を試してみてください。グリッドが 3.5 mm の壁を解像できるまで、占有と SDF の曲線は伸び悩みます。" %}

## 11. どのタスクにどの表現か

| タスク | 典型的な選択 | 理由 |
| --- | --- | --- |
| フレームごとのセンサデータ | 奥行きマップ、LiDAR 点群 | センサが測るものそのもので変換誤差がない |
| 疎な SfM / SLAM のランドマーク | 記述子付きの点群 | 特徴的な点だけを追跡する（[第 5 回]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})、[第 6 回]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})） |
| 実時間の密な統合（RGB-D） | ハッシュ化したボクセルブロック上の TSDF、サーフェル | ノイズの多い奥行きを逐次平均でき、メモリが有界 |
| ロボットのナビゲーションと衝突判定 | 占有八分木（OctoMap）、ESDF（Voxblox） | 空き・占有・未知、そしてプランナ向けの距離 |
| 描画、ゲーム、印刷向けの最終アセット | テクスチャ付きの水密な三角形メッシュ | どのエンジンもプリンタもメッシュを受け取る |
| 新視点合成 | 3D ガウシアン、NeRF 系の場、小さな基線なら MPI | 測光的な品質。微分可能レンダリングで当てはめる |
| 形状事前分布の学習、補完 | 潜在コード付きの SDF または占有場 | 連続な出力、任意の解像度、潜在空間での補間 |
| 3D 認識ネットワーク（検出、セグメンテーション） | 生の点（PointNet 系）、疎なボクセル（スパース畳み込み） | 並べ替え不変性。大部分が空の空間で効率的 |
| デバイス上の AR の遮蔽と物理 | 奥行きマップと粗いメッシュ | 更新が安く、遮蔽と衝突には十分（[第 10 回]({{ '/blog/2026/3d-vision-10-3d-vision-for-ar-vr/' | relative_url }})） |

順に問うべき質問：最も頻繁な問い合わせは何か（描画、内外判定、距離、最近傍）？作業中に形状のトポロジーは変わるか？勾配は必要か？最も細かい細部に比べてシーンはどれだけ大きいか？パイプラインの次の段は何を期待しているか？

## 12. 3D データ上の学習（概要）

### 12.1 PointNet：集合の関数

点群を入力とするネットワークは、点をどう並べ替えても同じ出力を返さなければなりません。**PointNet**（Qi ら、2017）はこれを最も単純な構造で実現します。各点に**同じ**小さな MLP $h$ を独立に適用し、その結果を**対称**関数、すなわち点にわたる要素ごとの最大値でまとめます。

$$
g(\{\mathbf p_1, \dots, \mathbf p_n\}) = \psi\Big(\max_{i} h(\mathbf p_i)\Big).
$$

ここで $\psi$ はプールしたベクトルに適用する 2 つ目の MLP です（論文では $\gamma$ と書かれていますが、第 7.2 節の位置エンコーディングとの衝突を避けるため名前を変えます）。最大値は順序を気にしないので、$g$ は構成上並べ替え不変です。最大値の $K$ 個のチャネルはそれぞれ 1 つの点に「勝ち取られる」ので、大域特徴を決めるのは高々 $K$ 個の点です。論文ではこれを**クリティカルポイント**（critical points）と呼び、他の点は削除したり少し動かしたりしても出力は変わりません。

```python
def pointnet_feature(P, Ws):
    """Shared per-point MLP (the same weights for every point), then max-pooling over points."""
    h = P
    for W_, b_ in Ws:
        h = np.maximum(h @ W_ + b_, 0)
    return h.max(axis=0), h.argmax(axis=0)          # global feature, which point won each channel


rng = np.random.default_rng(6)
Ws = [(rng.normal(0, 1, (3, 64)), rng.normal(0, 0.1, 64)),
      (rng.normal(0, 0.18, (64, 256)), rng.normal(0, 0.1, 256))]
cloud2 = sample_torus(2_000, rng)[0]
g1, winners = pointnet_feature(cloud2, Ws)
g2, _ = pointnet_feature(cloud2[rng.permutation(2_000)], Ws)
crit = np.unique(winners)
g3, _ = pointnet_feature(cloud2[crit], Ws)
print("permuted input, same feature:", np.allclose(g1, g2))
print("critical points: %d of 2000; feature from them alone equal: %s" % (len(crit), np.allclose(g1, g3)))
```

出力：`permuted input, same feature: True` と `critical points: 218 of 2000; feature from them alone equal: True`。重みがランダムでも、2000 点のうち 218 点だけで 256 次元の特徴がすべて決まります。学習した重みではクリティカルポイントが形状の骨格を描き、PointNet が点の欠落や摂動に強いのはこのためです。PointNet に欠けているのは**局所性**です。点とその近傍との関係を見る層がありません。**PointNet++**（Qi ら、2017）は PointNet を局所近傍に階層的に適用してこれを補います。近傍の中心は最遠点サンプリング（第 3.2 節）で選び、メンバーは半径探索で集めます。

### 12.2 スパース畳み込み

ボクセルは畳み込みが使える規則的な構造を与えますが、$256^3$ グリッド上の密な 3D CNN は計算のほぼすべてを空の空間に費やします（第 5.1 節）。**スパース畳み込み**（sparse convolution）はアクティブな（占有された）ボクセルだけをハッシュテーブルに保存し、そこでだけ畳み込みを計算します。ただし注意点があります。通常の畳み込みの出力は、カーネル内の入力が 1 つでもアクティブならアクティブになるので、アクティブ集合は層ごとに 1 ボクセルずつ**膨張**し、数層でデータはもう疎ではなくなります。**サブマニフォールド・スパース畳み込み**（submanifold sparse convolution；Graham ら、2018）は、もともとアクティブだったサイトでだけ出力を計算し、疎のパターンをネットワーク全体で固定します。Minkowski Engine（Choy ら、2019）はこれを 4 次元時空を含む任意の次元に一般化しました。

```python
from scipy import ndimage as ndi

X64, h64 = grid_centres(64)
active = np.abs(sdf_torus(X64)) < h64 / 2           # a thin shell of occupied voxels, like a scan
k3 = np.ones((3, 3, 3), bool)
counts_reg, a_ = [int(active.sum())], active
for layer in range(3):
    a_ = ndi.binary_dilation(a_, k3)                 # a regular sparse conv activates every site it touches
    counts_reg.append(int(a_.sum()))
print("active sites, regular sparse conv over 3 layers:", counts_reg)
print("submanifold sparse conv keeps %d; dense grid has %d" % (active.sum(), 64 ** 3))
```

出力：`active sites, regular sparse conv over 3 layers: [7120, 27776, 48360, 67224]` と `submanifold sparse conv keeps 7120; dense grid has 262144`。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/08-sparse-conv.svg" localized="true" caption="7120 個のアクティブなボクセルからなる殻（$64^3$ でのトーラスの表面。スキャンのようなもの）。左：$z = 0$ のすぐ上の断面。黒：入力、濃い橙：通常のスパース $3 \times 3 \times 3$ 畳み込み 1 層後にアクティブになるサイト、薄い橙：2 層後。右：層ごとのアクティブなサイト数。通常のスパース畳み込みは 1 層で 7120 から 27,776 に、3 層で 67,224 に増え、密な $64^3 = 262{,}144$ グリッドの 4 分の 1 になります。サブマニフォールド畳み込みはどの層でも 7120 のままです。" %}

点ベースと疎ボクセルベースのネットワークはその後、互いに近づいています。Point Transformer V3（Wu ら、2024）のような現在の点群バックボーンは、点を空間充填曲線に沿って直列化し、局所ウィンドウ内で注意を計算し、位置情報にはスパース畳み込みを使います。「点」と「ボクセル」の選択は、今では主に近傍探索のためのデータ構造の選択です。

## 試してみよう

- 第 10.3 節のウィジェットで、星形について各表現が誤差 0.5 mm に達する解像度を見つけ、メモリを比べてください。次に細い輪で繰り返してください。最初に破綻するのはどの表現で、なぜでしょうか。
- 粗い解像度の SDF 表示でプローブを境界の向こうへドラッグし、補間値が各セル内で線形に変わる様子を見てください。次にガウシアン表示で同じことをすると、密度は滑らかですが、その等値線は真の境界と正確には一致しません。
- ホームページの[インタラクティブ・ラボ]({{ '/' | relative_url }}#lab)には、3D ガウシアンのシーン（Gaussian World）と解析的形状のパストレーシングのシーンがあります。前者は第 8 節の表現の実働例で、後者はこのトーラスと同じく厳密な陰的形状を使っています。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Lorensen, Cline: Marching cubes | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37401.37422) | サンプルした任意の陰的場からのメッシュ抽出 |
| Curless, Levoy: A volumetric method for building complex models from range images | SIGGRAPH | 1996 | [DOI](https://doi.org/10.1145/237170.237269) | 距離画像からの累積重み付き符号付き距離。TSDF 統合の起源 |
| Shade, Gortler, He, Szeliski: Layered depth images | SIGGRAPH | 1998 | [DOI](https://doi.org/10.1145/280814.280882) | 画素あたり複数の奥行き。視差と遮蔽解除を扱う描画 |
| Pfister, Zwicker, van Baar, Gross: Surfels | SIGGRAPH | 2000 | [DOI](https://doi.org/10.1145/344779.344936) | 接続関係のない向き付き点プリミティブ |
| Newcombe et al.: KinectFusion | ISMAR | 2011 | [DOI](https://doi.org/10.1109/ISMAR.2011.6092378) | 奥行きカメラによる実時間の TSDF 統合と追跡 |
| Hornung et al.: OctoMap | Autonomous Robots | 2013 | [DOI](https://doi.org/10.1007/s10514-012-9321-0) | 八分木上の確率的占有。ロボット地図の標準 |
| Nießner, Zollhöfer, Izadi, Stamminger: Voxel hashing | ACM TOG (SIGGRAPH Asia) | 2013 | [DOI](https://doi.org/10.1145/2508363.2508374) | ハッシュテーブルで管理する疎な TSDF ブロック。任意の大きさのシーンに対応 |
| Qi, Su, Mo, Guibas: PointNet | CVPR | 2017 | [arXiv](https://arxiv.org/abs/1612.00593) | 生の点に対する並べ替え不変な学習 |
| Qi, Yi, Su, Guibas: PointNet++ | NeurIPS | 2017 | [arXiv](https://arxiv.org/abs/1706.02413) | FPS と球近傍による階層的な局所特徴 |
| Fan, Su, Guibas: A point set generation network | CVPR | 2017 | [arXiv](https://arxiv.org/abs/1612.00603) | 点群の予測。Chamfer 損失と EMD 損失を広めた |
| Knapitsch, Park, Zhou, Koltun: Tanks and Temples | ACM TOG | 2017 | [DOI](https://doi.org/10.1145/3072959.3073599) | 再構成の適合率・再現率・F スコア |
| Oleynikova et al.: Voxblox | IROS | 2017 | [arXiv](https://arxiv.org/abs/1611.03631) | 経路計画のため TSDF から ESDF を逐次構築 |
| Graham, Engelcke, van der Maaten: 3D semantic segmentation with submanifold sparse convolutional networks | CVPR | 2018 | [arXiv](https://arxiv.org/abs/1711.10275) | 疎のパターンを保つスパース畳み込み |
| Zhou et al.: Stereo magnification（多平面画像） | SIGGRAPH (ACM TOG) | 2018 | [arXiv](https://arxiv.org/abs/1805.09817) | CNN で MPI を予測する視点合成 |
| Mescheder et al.: Occupancy networks | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1812.03828) | 形状を分類器の決定境界として表す |
| Park et al.: DeepSDF | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1901.05103) | 潜在コードで形状カテゴリ全体を表すニューラル SDF |
| Choy, Gwak, Savarese: Minkowski CNNs | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1904.08755) | 一般化したスパース畳み込み（4 次元まで） |
| Rahaman et al.: On the spectral bias of neural networks | ICML | 2019 | [arXiv](https://arxiv.org/abs/1806.08734) | 素の MLP が低周波から学ぶ理由 |
| Gropp et al.: Implicit geometric regularization (IGR) | ICML | 2020 | [arXiv](https://arxiv.org/abs/2002.10099) | アイコナール損失。生の点群からの SDF |
| Mildenhall et al.: NeRF | ECCV | 2020 | [arXiv](https://arxiv.org/abs/2003.08934) | ボリュームレンダリングで学習する放射輝度場 |
| Tancik et al.: Fourier features | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.10739) | 座標ネットワークの位置エンコーディングの分析 |
| Sitzmann et al.: SIREN | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.09661) | 細部と微分を持つ場のための正弦活性化 |
| Müller et al.: Instant-NGP | SIGGRAPH (ACM TOG) | 2022 | [arXiv](https://arxiv.org/abs/2201.05989) | ハッシュグリッドの特徴と小さな MLP |
| Kerbl et al.: 3D Gaussian Splatting | SIGGRAPH (ACM TOG) | 2023 | [arXiv](https://arxiv.org/abs/2308.04079) | 陽的で微分可能な実時間シーン表現 |
| Huang et al.: 2D Gaussian Splatting | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2403.17888) | 法線と表面が明確な平たいガウスサーフェル |
| Wu et al.: Point Transformer V3 | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.10035) | 直列化した注意とスパース畳み込みによる点群ネットワーク |

## 学習リソース

- 本サイトの[グラフィックス第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})：メッシュ、陰的曲面、マーチングキューブ、ポアソン再構成。
- M. Botsch, L. Kobbelt, M. Pauly, P. Alliez, B. Lévy, *Polygon Mesh Processing*, A K Peters, 2010：メッシュ、変換、リメッシュ。
- Python での実験には [Open3D](https://www.open3d.org/)（点群、メッシュ、TSDF 統合、ボクセルダウンサンプリング）と [Trimesh](https://trimesh.org/)（メッシュの入出力、サンプリング、符号付き距離）。
- ロボット地図には [OctoMap](https://octomap.github.io/) と [Voxblox](https://github.com/ethz-asl/voxblox)、3D 深層学習には [MinkowskiEngine](https://github.com/NVIDIA/MinkowskiEngine) と [Pointcept](https://github.com/Pointcept/Pointcept)。
- Y. Xie ら、"Neural Fields in Visual Computing and Beyond"（Eurographics STAR 2022）とその[論文リスト](https://neuralfields.cs.brown.edu/)。ニューラル場の体系的なサーベイです。

## 演習

1. ある奥行きカメラは $z$ 奥行きをミリメートル単位の 16 ビット整数で返します。保存できる最大の奥行きはいくつで、1 m と 5 m での奥行き分解能はいくつですか。代わりに逆奥行き $1/Z$ を $2^{-10}$ m⁻¹ 刻みの 16 ビット整数で保存すると、1 m と 5 m での分解能はどう変わりますか。

   <details markdown="1"><summary>ヒント</summary>

   ミリメートル単位なら最大 65.535 m で、どの奥行きでも刻みは一様に 1 mm です。刻み $\delta = 2^{-10}$ m⁻¹ の逆奥行きでは、$dZ = Z^2\, d(1/Z)$ より奥行きの刻みは $Z^2\delta$ で、1 m で約 1 mm、5 m で約 24 mm です。逆奥行きは MPI の平面と同じく精度をカメラの近くに割り当て、ステレオの誤差（第 7 回）と合っています。
   </details>

2. `depth_normals` を拡張して、奥行きの不連続での法線を除外してください。4 近傍のいずれかとの奥行き差が数パーセントを超える画素を無効とします。第 2.2 節のシーンでは画素の何割が除かれますか。誤差 10° を超える法線をすべて捕まえられますか。

   <details markdown="1"><summary>ヒント</summary>

   `depth[1:-1, 2:]`、`depth[1:-1, :-2]`、`depth[2:, 1:-1]`、`depth[:-2, 1:-1]` を中心と比べ、相対差にしきい値を設けます。近傍が欠けている画素も除外します。テーブルを背景にしたトーラスの輪郭は 0.5 m 以上の段差なので捕まえやすいですが、穴の内縁でトーラスが光線とほぼ平行に曲がり去る所では、法線と光線のなす角の判定が必要です。
   </details>

3. 第 5.3 節の八分木の曲線の傾きを導いてください。面積 $A$ の曲面を一辺 $h = 3/2^L$ のセルで覆うと、レベル $L$ でおよそ何個のセルを曲面が横切りますか。$L = 8$ で出力された数と比べてください。

   <details markdown="1"><summary>ヒント</summary>

   約 $c \cdot A/h^2$ 個で、$c$ は曲面がセルをどう切るかによって 1 から 3 の間です。$A = 15.79$、$h = 3/256$ では $A/h^2 = 1.15 \times 10^5$ です。レベル 8 の 402,176 には、レベル 7 で横切られたセルの 8 個の子がすべて含まれており、横切られたものだけではありません。レベル 8 で横切られたセルだけを数えると、$A/h^2$ に小さな定数を掛けた値にずっと近くなります。
   </details>

4. 閉じた三角形メッシュまでの符号付き距離を計算する `mesh_sdf(V, F, p)` を書いてください。距離は最も近い三角形までの距離（点と三角形の距離）、符号は一般化回転数 $w(\mathbf p) = \frac{1}{4\pi}\sum\_f \Omega\_f(\mathbf p)$ から決めます。$\Omega\_f$ は $\mathbf p$ から見た三角形 $f$ の立体角です。$96 \times 48$ のメッシュで `sdf_torus` と比べてテストしてください。

   <details markdown="1"><summary>ヒント</summary>

   三角形 $\mathbf a, \mathbf b, \mathbf c$（$\mathbf p$ からの相対位置）の立体角は $2\,\mathrm{atan2}\big(\mathbf a \cdot (\mathbf b \times \mathbf c),\ abc + (\mathbf a\cdot\mathbf b)c + (\mathbf b\cdot\mathbf c)a + (\mathbf c\cdot\mathbf a)b\big)$ で、$a = \lVert\mathbf a\rVert$ などです（Van Oosterom と Strackee）。閉じて向きのそろったメッシュでは、内側で $w \approx 1$、外側で $0$ です。光線の交差の偶奇と違って、小さな穴のあるメッシュでも穏やかに劣化します。`sdf_torus` との差はおおむね矢高 0.0016 以内に収まるはずです。
   </details>

5. 第 7 節のニューラル場の実験を、$L = 6$ について学習率を小さくするかステップ数を増やして繰り返し、$L = 4$ も試してください。$L = 6$ のノイズは学習を増やすと消えますか。次にアイコナール罰則 $\lambda(\lVert\nabla\_{\mathbf x} f\_\theta\rVert - 1)^2$ を加えてください。NumPy のネットワークで $\nabla\_{\mathbf x} f\_\theta$ はどう計算しますか。

   <details markdown="1"><summary>ヒント</summary>

   本記事の準備中に星形の多角形で $L = 6$ の学習率を小さくしてみたところ、4000 ステップ以内では当てはめがむしろ悪くなりました。高周波の入力は当てはめにノイズを乗せるだけでなく、最適化そのものを難しくします。歯車でも同じか確かめてください。入力についての勾配は、出力からエンコーディングまで 1 の勾配を逆伝播し（重みの勾配と同じ連鎖律）、$\gamma$ のヤコビアン $\partial \sin(2^k\pi x)/\partial x = 2^k\pi\cos(2^k\pi x)$ を掛けます。アイコナール項自身の勾配には 2 階微分が必要になり、そこで自動微分フレームワークの出番になります。
   </details>

**次回：**[3D 再構成]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})：これらの表現を使って写真から表面へ進みます。古典的な SfM、MVS、統合、メッシュ化のパイプライン、ニューラル表面、そしてフィードフォワード型の 3D 基盤モデルです。
