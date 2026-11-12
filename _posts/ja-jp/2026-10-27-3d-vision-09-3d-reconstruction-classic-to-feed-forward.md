---
layout: post
title: "3 次元再構成：古典的パイプラインからフィードフォワードモデルまで"
date: 2026-10-27 11:09:00+0900
description: "写真から表面へ：SfM、MVS、融合、メッシュ化からなる古典的パイプライン、TSDF 融合と Marching Cubes、スクリーン付きポアソン再構成、ニューラル表面（NeuS、Neuralangelo、2DGS）、フィードフォワード型の 3 次元基盤モデル（DUSt3R、MASt3R、VGGT と 2025〜2026 年の後継）、そして DTU、Tanks and Temples、ETH3D での再構成の評価方法を、各ステップの NumPy コード付きで解説します。"
categories: 3d-vision
tags: [3d-reconstruction, tsdf-fusion, marching-cubes, poisson-reconstruction, neus, dust3r, vggt, evaluation]
series: 3d-vision
series_order: 9
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

これまでの記事で部品を 1 つずつ用意してきました。[第 3 回]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})で対応点を見つけ、[第 4 回]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})で 2 視点から相対姿勢と深度を求め、[第 5 回]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})で Structure-from-Motion（SfM）によりすべてのカメラと疎な点群を復元し、[第 7 回]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})で画像ごとに密な深度マップを計算し、[第 8 回]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})で形状の保存方法を比較しました。この記事ではそれらを組み合わせ、利用者が本当に知りたい問いに答えます。**ある物体の写真（または深度動画）を撮ったとき、その表面をどうやって得るのか？**

答えは 3 つあり、登場した順に並べると次のようになります。**古典的パイプライン**は SfM、多視点ステレオ（multi-view stereo、MVS）、深度融合、メッシュ化を連結します。各段は理解の行き届いたアルゴリズムで、質のよい画像がたくさんあるときには、この連鎖が今でも最も正確な幾何を与えます。**ニューラル表面再構成**（NeuS、Neuralangelo、2D ガウシアンスプラッティング）は後半の 3 段を、微分可能レンダラを通した 1 回の最適化（符号付き距離場、または表面のようなガウシアンの最適化）に置き換えます。**フィードフォワード型の 3 次元基盤モデル**（DUSt3R、MASt3R、VGGT と、2024 年以降に現れた多くの後継）は最適化そのものを省きます。ネットワークを 1 回通すだけで、姿勢の分からない画像の集合がカメラと密な 3 次元点に変わります。

それぞれの答えの核心を、すべてを真値と照合できる小さな「平面国」（flatland）の世界で NumPy により実装します。TSDF 融合と Marching Squares、スクリーン付きポアソン再構成、NeuS のレンダリング重みと小さな NeuS の最適化、DUSt3R のポイントマップ（pointmap）の幾何とそこからの焦点距離と姿勢の復元、ペアごとの予測をつなぎ合わせる大域整列です。最後に再構成の評価方法を扱います。「見た目がよい」は測定ではないからです。

## 前提知識

- [第 1 回]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})のカメラモデル $\mathbf x \sim K(R\mathbf X + \mathbf t)$ と OpenCV のカメラ座標系（x が右、y が下、z が前）。
- SfM と MVS が出力するもの：カメラ姿勢と画像ごとの深度マップ（[第 5 回]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})、[第 7 回]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})）。まだ読んでいない場合は、[ニューラルレンダリングのカメラと多視点幾何の回]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})がコンパクトな代わりになります。
- 符号付き距離関数、メッシュ、陰関数曲面：[第 8 回]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})と[グラフィックス第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})。後者ではポアソン再構成と Marching Squares も導出しています。
- 第 6 節では [NeRF の回]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})のボリュームレンダリングの式 $C = \sum\_i T\_i \alpha\_i \mathbf c\_i$ を使います。
- 最小二乗法、SVD、疎な連立一次方程式（SciPy）、Adam による勾配降下。

**記法。** 世界の点を $\mathbf X$ と書き、カメラは $\mathbf X\_c = R\mathbf X + \mathbf t$ によって自分の座標系に移します。カメラ中心は $\mathbf C = -R^\top \mathbf t$ です。深度マップ $d(u)$ は画素 $u$ から見える表面の $z$ 座標（光線に沿った距離ではありません）を保存します。$f(\mathbf x)$ は符号付き距離関数（signed distance function、SDF）で、立体の内部で負、外部で正、$\lvert f\rvert$ が表面までの距離です。$f$ と紛らわしくならないよう、画素単位の焦点距離は $f\_x$ と書きます。

## 1. 再構成問題

### 1.1 再構成とは何か

「3 次元再構成」はいくつかの異なる出力を指しうるので、どれが欲しいのかをはっきりさせておくと役に立ちます。

- **カメラ**：各画像の内部パラメータ $K\_k$ と姿勢 $(R\_k, \mathbf t\_k)$。SfM の出力です。
- **点群**：疎なもの（SfM のトラック）または密なもの（融合した深度マップ）。法線や色を伴うこともあります。
- **表面**：ふつうは三角形メッシュで、理想的には水密（watertight、閉じていて内外がはっきりしている）、テクスチャ付きのこともあります。
- **場**：SDF、占有場、放射輝度場など。メッシュを保存する代わりに問い合わせて使います。
- **レンダリング可能なシーン**：NeRF や 3 次元ガウシアン。幾何ではなく画像のために最適化されています。

[第 8 回]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})でこれらの表現を比較しました。この記事はそれらを生み出すアルゴリズムの話で、主な目標は表面です。

### 1.2 古典的パイプライン

古典的パイプラインは段の連鎖で、各段の入力と出力が明確です。

| 段 | 入力 | 出力 | 扱う回 |
| --- | --- | --- | --- |
| 特徴とマッチング | 画像 | 対応点 | [第 3 回]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}) |
| Structure-from-Motion | 対応点 | カメラ $K, R, \mathbf t$ と疎な点 | [第 4〜5 回]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }}) |
| 多視点ステレオ | 画像とカメラ | 画像ごとの深度マップ（と法線マップ） | [第 7 回]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}) |
| 深度融合 | 深度マップとカメラ | 融合した点群、またはボリューム場 | 第 2 節 |
| メッシュ化 | 法線付きの点、または場 | 三角形メッシュ | 第 3、4 節 |
| テクスチャ付け | メッシュ、画像、カメラ | テクスチャアトラス | 第 4.4 節 |

この連鎖の長所は、各段に幾何学的な意味があり、単独で確認できることです。SfM の後には再投影誤差を、MVS の後には深度マップを、メッシュ化の前には融合した点群を見ることができます。短所は、誤差が前にしか流れないことです。SfM がわずかに誤ったカメラは食い違う深度マップを生み、融合はその食い違いを平均してぼやけた表面にし、メッシュ化はその理由を知りようがありません。第 6、7 節のニューラル手法とフィードフォワード手法は、ある意味で情報を後ろにも流そうとする試みです。

この記事では、これまでの回で扱っていない最後の 3 段にまず集中し、それから連鎖全体を置き換える手法に進みます。

### 1.3 平面国のテストベッド

すべてのステップを数値で確かめるために、2 次元の世界を使います。机を真上から見下ろしていると考えてください。世界は OpenCV の世界座標系の水平面 $(x, z)$ で（$y$ 軸は紙面の奥、下向き）、カメラは 3 次元の座標系の $x$ 軸（右）と $z$ 軸（前）を保ちます。画像は 160 画素の 1 行だけで、第 1 回のピンホールモデルは 1 次元減ります。

$$
u = f_x \frac{x_c}{z_c} + c_x, \qquad
K = \begin{pmatrix} f_x & c_x \\ 0 & 1 \end{pmatrix}, \qquad
\begin{pmatrix} x_c \\ z_c \end{pmatrix} = R \begin{pmatrix} x \\ z \end{pmatrix} + \mathbf t ,
$$

ここで $R$ は $2\times 2$ の回転行列です。シーンは正確な SDF のゼロ等値線で、半径 45 cm の円板、20° 回転した箱、そして厚さわずか 8 cm の細い棒からなります。棒は、各手法がどこまで細い構造を保てるかを試すためのものです。カメラは SDF をスフィアトレーシング（sphere tracing、[グラフィックス第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})のレイマーチング）し、各ヒット距離を $z$ 深度に変換し、$\sigma = 2$ cm のガウス雑音を加えて**深度スキャン**を作ります。これは民生用深度カメラの 2〜3 m でのおおよその雑音です。64 台のカメラが半径 2.6 m の円上に並び、それぞれ原点の周り 15 cm にずらした点を見ています。

```python
import numpy as np

W, FOC = 160, 160.0                 # a 1D image: 160 pixels, focal length 160 px
CX = (W - 1) / 2                    # principal point at the image centre (pixel centres at 0..W-1)


def sd_box(p, c, half, ang):
    """Signed distance to a box with centre c, half sizes `half`, rotated by `ang`."""
    ca, sa = np.cos(ang), np.sin(ang)
    d = p - c
    q = np.stack([ca * d[..., 0] + sa * d[..., 1], -sa * d[..., 0] + ca * d[..., 1]], -1)
    a = np.abs(q) - half
    return np.linalg.norm(np.maximum(a, 0), axis=-1) + np.minimum(a.max(-1), 0)


def scene_sdf(p):
    """Signed distance (m) to the flatland scene; p[..., :] = (x, z) world coordinates."""
    disk = np.linalg.norm(p - np.array([-0.55, 0.25]), axis=-1) - 0.45
    box = sd_box(p, np.array([0.5, -0.4]), np.array([0.45, 0.28]), np.deg2rad(20))
    bar = sd_box(p, np.array([0.45, 0.65]), np.array([0.38, 0.04]), np.deg2rad(-10))
    return np.minimum(np.minimum(disk, box), bar)


def look_at(C, target=(0.0, 0.0)):
    """World-to-camera (R, t) of a 2D camera at C looking at target (OpenCV: x right, z forward)."""
    fwd = np.asarray(target, float) - C
    fwd /= np.linalg.norm(fwd)
    R = np.array([[fwd[1], -fwd[0]],     # row 1: the camera x axis (right) in world coordinates
                  [fwd[0], fwd[1]]])     # row 2: the camera z axis (forward)
    return R, -R @ C


def render_depth(R, t, sigma=0.0, rng=None, max_range=8.0):
    """z-depth of every pixel by sphere tracing scene_sdf; NaN where the ray escapes."""
    C = -R.T @ t
    rays_c = np.stack([(np.arange(W) - CX) / FOC, np.ones(W)], 1)   # K^-1 (u, 1): z = 1
    norm = np.linalg.norm(rays_c, axis=1)
    dirs = (rays_c / norm[:, None]) @ R                              # R^T d for each ray
    s = np.zeros(W)
    for _ in range(200):
        dist = scene_sdf(C + s[:, None] * dirs)
        s = np.where(dist > 1e-6, s + dist, s)
    depth = np.where(s < max_range, s / norm, np.nan)                 # range -> z-depth
    if sigma > 0:
        depth = depth + sigma * rng.standard_normal(W)
    return depth


def orbit(n, radius=2.6, start=0.0, span=360.0, rng=None, jitter=0.0):
    """n cameras on a circle around the origin, looking at (a jittered point near) the origin."""
    step = span / n if span == 360 else span / max(n - 1, 1)
    cams = []
    for a in np.deg2rad(start + step * np.arange(n)):
        C = radius * np.array([np.cos(a), np.sin(a)])
        target = (0.0, 0.0) if rng is None else jitter * rng.standard_normal(2)
        cams.append(look_at(C, target))
    return cams


def backproject(R, t, depth):
    """World points of the valid pixels: X_w = R^T (d K^-1 (u, 1) - t)."""
    u = np.arange(W)
    pc = np.stack([(u - CX) / FOC * depth, depth], 1)
    ok = np.isfinite(depth)
    return (pc[ok] - t) @ R, ok


rng = np.random.default_rng(0)
cams = orbit(64, rng=rng, jitter=0.15)            # 64 cameras on a circle of radius 2.6 m
scans = [(R, t, render_depth(R, t, sigma=0.02, rng=rng)) for R, t in cams]
d0 = scans[0][2]
print("scan 0: %d of %d pixels hit, depth %.2f to %.2f m"
      % (np.isfinite(d0).sum(), W, np.nanmin(d0), np.nanmax(d0)))
X0, _ = backproject(*cams[0], render_depth(*cams[0]))
print("noise-free back-projection: max |sdf| = %.1e m" % np.abs(scene_sdf(X0)).max())
```

```text
scan 0: 104 of 160 pixels hit, depth 1.54 to 2.97 m
noise-free back-projection: max |sdf| = 1.6e-04 m
```

2 行目は幾何の確認です。雑音のない深度スキャンを $\mathbf X = R^\top(d\,K^{-1}(u, 1)^\top - \mathbf t)$ で逆投影すると、スフィアトレーサの許容誤差の範囲で表面上に乗ります。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-flatland.svg" localized="true" caption="平面国のテストベッド。左：シーン（灰色：円板、箱、細い棒）と周回する 64 台のカメラ。カメラ $k=8$（オレンジ）は 160 本の光線を出し（8 本に 1 本を描画）、赤い点はその雑音入りの逆投影深度です。右：この深度スキャンを画素 $u$ の関数として描いたもので、真値（黒）と $\sigma = 2$ cm の雑音入り計測値（赤）。160 画素のうち 137 画素が物体に当たり、深度は 1.57 m から 2.60 m です。段差は遮蔽境界で、光線がある物体から別の物体に移るところです。" %}

第 2〜4 節では、実際のシステムが RGB-D カメラや MVS の深度マップを使うのとまったく同じようにこれらのスキャンを使います。アルゴリズムに 2 次元特有のところはありません。画素 $u$ を $(u, v)$ に、正方形を立方体に置き換えれば 3 次元版になります。

## 2. 打ち切り符号付き距離関数によるボリューム融合

### 2.1 深度マップから符号付き距離へ

深度マップは、各画素の光線に沿って最初の表面がどこにあるかを教えてくれます。さらに、点群が忘れてしまう 2 つのことも伝えています。表面より**手前**の空間は空である（光線がそこを通った）こと、そして表面の**すぐ奥**はおそらく中身が詰まっていることです。1996 年に Curless と Levoy が提案し、2011 年に KinectFusion が実時間化したボリューム融合（volumetric fusion）は、まさにこの情報をボクセル格子に保存します。

中心が $\mathbf v$ のボクセルを 1 つ取ります。これをカメラ座標 $\mathbf v\_c = R\mathbf v + \mathbf t = (x\_c, z\_c)$ に変換し、画素 $u = \operatorname{round}(f\_x x\_c / z\_c + c\_x)$ に投影して、そこの深度 $d(u)$ を読みます。差

$$
\eta(\mathbf v) = d(u) - z_c
$$

は**射影的な符号付き距離**（projective signed distance）で、ボクセルが観測された表面より手前なら正、奥なら負、表面上ならゼロです。表面に垂直ではなく光軸に沿って測るので、表面を角度 $\theta$ で見るときは真の距離をおよそ $1/\cos\theta$ 倍に過大評価しますが、符号とゼロ交差は正しく、表面の抽出に必要なのはそれだけです。

### 2.2 打ち切りと移動平均

表面から遠いところでは、$\eta$ はほとんど情報を持ちません。表面の 1 m 手前のボクセルは空ですが、最も近い表面までの正確な距離は分かりません。この画素からは見えていない別の表面が、もっと近くにあるかもしれないからです。表面の奥についてはさらに分かりません。そもそも見えないからです。そこで**打ち切り**ます。打ち切り距離を $\mu$ として、

$$
\psi(\mathbf v) = \min\Big(1, \frac{\eta(\mathbf v)}{\mu}\Big)
\quad \eta(\mathbf v) > -\mu \text{ のとき}, \qquad \text{それ以外は更新しない。}
$$

表面より手前のボクセルは最大 1（「空き空間」）、表面の奥 $\mu$ 以内のボクセルは最小 $-1$ の値を受け取り、それより深いボクセルはそのままです。

各ボクセルは値 $F$ と重み $W$ を持ちます。値 $\psi\_k$、重み $w\_k$ のスキャン $k$ はそれらを次のように更新します。

$$
F \leftarrow \frac{W F + w_k \psi_k}{W + w_k}, \qquad W \leftarrow W + w_k .
$$

なぜ平均なのでしょうか。複数のスキャンが同じ表面点を独立な雑音で見ているとします。すると各 $\psi\_k$ は同じ符号付き距離の雑音入り測定で、重み付き二乗誤差を最小にする値

$$
E(F) = \sum_k w_k (F - \psi_k)^2 \quad\Longrightarrow\quad F = \frac{\sum_k w_k \psi_k}{\sum_k w_k}
$$

はそれらの重み付き平均です。上の更新はこの平均を逐次的に計算しているだけなので、ボクセルは個々のスキャンを覚えておく必要がありません。Curless と Levoy は、光線方向のガウス雑音のもとでこの場のゼロ等値面が距離データの最小二乗曲面になると論じています。$w\_k = 1/\sigma\_k^2$ とすれば最尤曲面です。$n$ 個の読みを平均すると雑音は $1/\sqrt n$ になり、これが安価な深度カメラから滑らかなモデルが得られる理由です。

### 2.3 計算例とコード

あるボクセルがカメラの 2.00 m 手前にあり、カメラはその奥の表面を 3 回、深度 2.03、1.98、2.05 m で観測したとします。$\mu = 6$ cm です。符号付き距離は $+3$、$-2$、$+5$ cm なので $\psi = 0.5$、$-0.333$、$0.833$ となり、3 回後の融合値はその平均 $0.333$、すなわち $\mu F = 2.0$ cm で、3 つの符号付き距離の平均にちょうど一致します。次のコードはこのボクセルを手で計算し、続いてスキャン全体を 2.5 cm ボクセルの $128 \times 128$ 格子に融合します。

```python
def make_grid(n=128, extent=1.6):
    """Voxel centres of an n x n grid over [-extent, extent]^2; grid[i, j] is (xs[j], xs[i])."""
    h = 2 * extent / n
    xs = -extent + h * (np.arange(n) + 0.5)
    X, Z = np.meshgrid(xs, xs)
    return xs, np.stack([X, Z], -1).reshape(-1, 2)


def tsdf_integrate(F, Wt, P, R, t, depth, mu, w_max=np.inf):
    """Fuse one depth scan into the TSDF values F and weights Wt of the voxel centres P."""
    pc = P @ R.T + t                                 # voxel centres in camera coordinates
    z = pc[:, 1]
    u = np.full(len(P), -1)
    front = z > 1e-6
    u[front] = np.round(FOC * pc[front, 0] / z[front] + CX).astype(int)   # nearest pixel
    ok = front & (u >= 0) & (u < W)
    sdf = np.full(len(P), np.nan)
    sdf[ok] = depth[u[ok]] - z[ok]                   # projective signed distance along the ray
    ok &= np.isfinite(sdf) & (sdf > -mu)             # skip voxels far behind the surface
    f = np.minimum(1.0, sdf[ok] / mu)                # truncate in front, normalize to [-1, 1]
    F[ok] = (Wt[ok] * F[ok] + f) / (Wt[ok] + 1.0)    # running weighted average
    Wt[ok] = np.minimum(Wt[ok] + 1.0, w_max)


def tsdf_fuse(scans, n=128, extent=1.6, mu=0.06):
    xs, P = make_grid(n, extent)
    F, Wt = np.ones(len(P)), np.zeros(len(P))
    for R, t, depth in scans:
        tsdf_integrate(F, Wt, P, R, t, depth, mu)
    return xs, F.reshape(n, n), Wt.reshape(n, n)


# one voxel 2.00 m in front of the camera, three depth readings of the surface behind it
F1, W1, mu = 1.0, 0.0, 0.06
for d in (2.03, 1.98, 2.05):
    f = min(1.0, (d - 2.00) / mu)
    F1, W1 = (W1 * F1 + f) / (W1 + 1), W1 + 1
    print("reading %.2f: f = %+.3f  ->  F = %+.3f, W = %d, mu F = %+.1f mm" % (d, f, F1, W1, 1000 * mu * F1))

for n_scans in (1, 4, 16, 64):
    xs, F, Wt = tsdf_fuse(scans[::64 // n_scans])
    print("%2d scans: %4.1f%% of the voxels observed" % (n_scans, 100 * np.mean(Wt > 0)))
```

```text
reading 2.03: f = +0.500  ->  F = +0.500, W = 1, mu F = +30.0 mm
reading 1.98: f = -0.333  ->  F = +0.083, W = 2, mu F = +5.0 mm
reading 2.05: f = +0.833  ->  F = +0.333, W = 3, mu F = +20.0 mm
 1 scans: 11.9% of the voxels observed
 4 scans: 46.6% of the voxels observed
16 scans: 89.1% of the voxels observed
64 scans: 93.2% of the voxels observed
```

`tsdf_integrate` は KinectFusion 系のシステムの心臓部で、ここではすべてのボクセルについてベクトル化しています。変換、投影、参照、差、打ち切り、平均です。これが何をしないかに注目してください。最も近い表面点を探すことも、メッシュを作ることもありません。どの演算も 1 つのボクセルと 1 つの画素だけで完結するので、GPU 上でカメラのフレームレートで動きます。観測済みボクセルの割合は約 93% で頭打ちになります。残りのボクセルは物体の内部、すべての表面より $\mu$ 以上奥にあり、どのカメラからも見えません。

### 2.4 場が収束する様子を見る

次の図は 1、4、16、64 回のスキャン後の場を示し、抽出した表面を真値と比べています（第 8 節の精度と完全性、つまり再構成から真値まで、真値から再構成までの平均距離を使います）。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-tsdf-fusion.svg" localized="true" caption="雑音入りスキャンの TSDF 融合（$\mu$ = 6 cm、ボクセル 2.5 cm）。左：1、4、16、64 回のスキャン後の融合値 $F$（青：空き空間、白：表面、赤：表面のすぐ奥、灰：未観測）、抽出したゼロ交差（黒）、使ったカメラの方向（紫）。右：抽出した曲線の精度と完全性。1 回のスキャンでは表面は正確（12.2 mm）でも不完全（327 mm）です。64 回後には両方とも 2.6〜2.7 mm に達し、1 回のスキャンの雑音 20 mm よりほぼ 1 桁小さくなります。" %}

2 つの点が目を引きます。完全性は新しい視点が新しい表面を明らかにするにつれて劇的に改善しますが、精度はゆっくり、おおよそ $1/\sqrt n$ で改善します（4 回で 9.2 mm、64 回で 2.6 mm。比は 3.5 倍で、16 倍の読みを平均したときに予想される 4 倍に近い値です。図は第 8 節のサンプリングした真値までの距離を測っているので、第 3 節のコードが正確な SDF で測った 64 回の値は 2.5 mm になります）。そして、どの物体の内部も灰色のままです。TSDF 融合は見ていないものを決して作り出しません。

ウィジェットで自分で試してみてください。シーンの周りでカメラをドラッグし、指を離すとスキャンします。「周回」ボタンは自動でスキャンします。スキャンが積み重なるにつれて雑音が減る様子を見たら、スライダーで壊してみましょう。雑音より小さい打ち切り距離や、棒より大きい打ち切り距離です。

{% include widget.liquid name="3d-vision-tsdf-fusion" height="720" caption="2 次元の TSDF 融合。シーンとカメラは本文と同じです（160 画素、$f\_x$ = 160 px）。図をドラッグするとカメラが動き（常に中心を向きます）、離すと 1 回スキャンします。「周回」でも構いません。色は $F$（または重み $W$）、黒い曲線は抽出した表面、緑の破線は真値です。表示値は、抽出した曲線の長さ重み付き平均 $\lvert f\rvert$（精度）と、真の表面のうちそこから 2 cm 以内にある割合（再現率）です。$\mu$ やボクセルサイズを変えると、それまでのスキャンをすべて融合し直します。" %}

### 2.5 打ち切り距離、ボクセルサイズ、重みの選び方

**打ち切り距離 $\mu$。** 打ち切り帯は雑音を含むだけの幅が必要です。そうでないと、表面近くのボクセルにとって、真の表面より $\mu$ 以上手前に落ちた読みは捨てられ、$\mu$ 以上奥に落ちた読みは $\psi = 1$ に切り詰められるだけなので、平均に偏りが生じます（演習 1）。同時に、細い構造を壊さない程度に狭くなければなりません。棒を両側から見てみましょう。上のカメラは「表面の奥」の値（$\psi < 0$）を上面から $\mu$ 下まで書き込み、$\mu$ が棒の厚さを超えると、その値は棒を突き抜けて棒の下の空き空間に入ります。下のカメラも同じように上向きに、棒の上の空き空間へ書き込みます。そこではこの負の値が、その側のカメラが書く小さな正の値と平均され、棒の近くでは負の値が勝ちます。ボクセルが一方の表面の奥にある距離の方が、もう一方の表面の手前にある距離より大きいからです。ゼロ交差は外側へ動き、棒は厚く、ぼやけて再構成され、本来の輪郭と合わなくなります。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-truncation.svg" localized="true" caption="打ち切り距離。左：64 回のスキャンすべてを $\mu$ = 4.5 cm で融合した細い棒（厚さ 8 cm）。抽出した表面（黒）は真値（緑の破線）に沿っています。中：$\mu$ = 15 cm では両側の値が重なり、負の帯が広がって棒が厚く再構成され、棒の真の輪郭のうち 2 cm 以内で復元されるのは 50.6% だけです。右：シーン全体の F 値と棒の再現率を $\mu$ に対して描いたもの（いずれも $\tau$ = 2 cm）。$\mu \approx \sigma$ より下では雑音が勝ちます（$\mu$ = 2 cm で F = 0.939）。3〜9 cm ではすべてうまくいき、12 cm で棒の再現率は 0.58、18 cm で 0.43 に落ちます。" %}

経験則は $\mu \approx 2\sigma$ から $4\sigma$ で、かつ気にしている最も薄い部分の厚さより小さくすることです。実際にはボクセル数個分がよく使われます。ステレオのように雑音が深度とともに増える場合（$\sigma\_z \propto z^2$、第 4 回）は、打ち切り距離も深度とともに大きくできます。

**ボクセルサイズ。** ボクセルは欲しい特徴より小さくなければなりませんが、融合した表面の雑音より小さくしても意味がありません。平面国の実験では、10 cm のボクセルは 8 cm の棒を完全に失い（F 値 0.788）、5 cm のボクセルですでに 0.997 に達し、2.5 cm（0.999）から 1.25 cm（0.997）に細かくしても何も得られません。残っている誤差は離散化ではなく雑音によるものだからです。

**メモリ。** 密な格子には $n^3$ 個のボクセルが必要です。$512^3$ 個のボクセルに 4 バイトの値と 4 バイトの重みを持たせると 1 GiB になり、そのほとんどは空き空間です。実用的なシステムは表面近くのボクセルだけを確保します。**ボクセルハッシング**（voxel hashing、Nießner ら、2013）は $8^3$ ボクセルの小さなブロックを、ブロック座標をキーとするハッシュテーブルに格納し、深度の読みがブロックの打ち切り帯に入ったときだけブロックを確保します。八分木や疎な格子（OpenVDB）は階層構造で同じことを行います。これらのデータ構造は第 8 回で扱いました。

**重み。** ここでは $w\_k = 1$ を使いました。よりよい選択は、読みをどれだけ信頼すべきかを表します。深度に依存する雑音には $w = 1/\sigma\_z^2(z)$、斜めからの観測には重みを下げる係数 $\cos\theta$、表面の奥で重みを徐々に下げるランプ（Curless と Levoy の元の方法）などです。KinectFusion はさらに $W$ に上限を設け、場が古いデータを忘れてシーンのゆっくりした変化に追従できるようにしています。

**色とその他。** 同じ移動平均で、ボクセルごとのどんな属性でも融合できます。色、意味ラベル、学習された特徴などです。KinectFusion のもう半分はトラッキングです。新しい深度フレームはそれぞれ、融合する前に現在のモデルをレイキャストしたものと ICP で位置合わせされ、これによって融合は SLAM システムになります（[第 6 回]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})）。

## 3. 場から表面へ：Marching Squares と Marching Cubes

融合した場はまだ表面ではありません。**Marching Squares**（2 次元）と **Marching Cubes**（3 次元、Lorensen と Cline、1987）は、セルごとに表面を見つけます。セルの各頂点を内部（$F < 0$）か外部かに分類し、辺に沿って符号が変わるところでは、その辺上の線形補間のゼロ交差に頂点を置きます。

$$
\mathbf p = \mathbf p_a + \frac{F_a}{F_a - F_b}\,(\mathbf p_b - \mathbf p_a),
$$

そして $2^4 = 16$ 通り（正方形）または $2^8 = 256$ 通り（立方体）の符号パターンの表に従って、セル内の頂点をつなぎます。表、曖昧な鞍点のケース、デュアルコンタリング（dual contouring）は[グラフィックス第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})で導出しました。ここでは融合にとって重要な 2 つの細部を加えます。

```python
def marching_squares(F, xs, valid=None, interp=True):
    """Zero crossings of F[i, j] (sampled at (xs[j], xs[i])) as an array of segments (m, 2, 2)."""
    v = [F[:-1, :-1], F[:-1, 1:], F[1:, 1:], F[1:, :-1]]          # corners c0..c3 of every cell
    lo = np.minimum(np.minimum(v[0], v[1]), np.minimum(v[2], v[3]))
    hi = np.maximum(np.maximum(v[0], v[1]), np.maximum(v[2], v[3]))
    cell = (lo < 0) & (hi >= 0)
    if valid is not None:                                           # all four corners observed
        cell &= valid[:-1, :-1] & valid[:-1, 1:] & valid[1:, 1:] & valid[1:, :-1]
    off = [(0, 0), (0, 1), (1, 1), (1, 0)]                          # (di, dj) of c0..c3
    segs = []
    for i, j in zip(*np.nonzero(cell)):
        val = [F[i + di, j + dj] for di, dj in off]
        pos = [np.array([xs[j + dj], xs[i + di]]) for di, dj in off]
        pts = {}
        for e in range(4):                                          # edge e joins corners e, e+1
            a, b = e, (e + 1) % 4
            if (val[a] < 0) != (val[b] < 0):
                s = val[a] / (val[a] - val[b]) if interp else 0.5
                pts[e] = pos[a] + s * (pos[b] - pos[a])
        if len(pts) == 2:
            segs.append(list(pts.values()))
        elif len(pts) == 4:                                         # saddle: decide by the centre
            if (np.mean(val) < 0) == (val[0] < 0):
                segs += [[pts[0], pts[1]], [pts[2], pts[3]]]
            else:
                segs += [[pts[3], pts[0]], [pts[1], pts[2]]]
    return np.array(segs).reshape(-1, 2, 2)


def sample_segments(segs, step=0.004):
    """Points along the segments, about `step` apart."""
    out = []
    for p, q in segs:
        k = max(1, int(np.ceil(np.linalg.norm(q - p) / step)))
        out.append(p + ((np.arange(k) + 0.5) / k)[:, None] * (q - p))
    return np.concatenate(out) if out else np.zeros((0, 2))


for n_scans in (1, 4, 16, 64):
    xs, F, Wt = tsdf_fuse(scans[::64 // n_scans])
    pts = sample_segments(marching_squares(F, xs, Wt > 0))
    print("%2d scans: mean distance of the extracted curve to the true surface %.1f mm"
          % (n_scans, 1000 * np.abs(scene_sdf(pts)).mean()))

for n in (16, 32, 64, 128, 256):
    xs, P = make_grid(n)
    G = scene_sdf(P).reshape(n, n)                    # exact SDF samples, no noise
    e = [1000 * np.abs(scene_sdf(sample_segments(marching_squares(G, xs, interp=i)))).mean()
         for i in (True, False)]
    print("h = %5.1f mm: interpolated %.3f mm, midpoint %.2f mm" % (3200 / n, e[0], e[1]))
```

```text
 1 scans: mean distance of the extracted curve to the true surface 12.2 mm
 4 scans: mean distance of the extracted curve to the true surface 9.2 mm
16 scans: mean distance of the extracted curve to the true surface 3.9 mm
64 scans: mean distance of the extracted curve to the true surface 2.5 mm
h = 200.0 mm: interpolated 9.941 mm, midpoint 37.72 mm
h = 100.0 mm: interpolated 3.699 mm, midpoint 17.90 mm
h =  50.0 mm: interpolated 0.667 mm, midpoint 7.84 mm
h =  25.0 mm: interpolated 0.176 mm, midpoint 4.10 mm
h =  12.5 mm: interpolated 0.045 mm, midpoint 2.20 mm
```

**細部 1：未観測のセルを飛ばす。** 未観測のボクセルは初期値（$F = 1$、$W = 0$）のままです。どの表面の奥にも負の値の帯があり、その帯の奥に $F = 1$ の未観測の内部があります。もう 1 つの符号変化、つまりすべての物体の内側 $\mu$ の位置に幻の表面ができてしまいます。4 つの頂点すべてで $W > 0$ のセルだけを抽出する `valid` マスクがこれを取り除きます。どの実装にも同等の判定が必要です。

**細部 2：補間する。** 2 番目のループでは、シーンの正確な SDF の上で、補間で置いた頂点と辺の中点に置いた頂点を比べています。補間した表面ははるかに正確で、ボクセルの大きさを半分にするたびに誤差は 1/2 ではなく約 1/4 になります。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-extraction.svg" localized="true" caption="正確な SDF の上での Marching Squares の頂点配置。左：$h$ = 20 cm の格子上の円板（青：内部の格子点、白抜き：外部）。辺の中点の頂点（オレンジの破線）は階段状になり、補間した頂点（紫）はほぼ円の上に乗ります。右：抽出した曲線の平均 $\lvert f\rvert$ をボクセルサイズに対して描いたもの。補間は 2 次精度（5、2.5、1.25 cm で 0.667、0.176、0.045 mm。半分にするごとに約 4 分の 1）、中点は 1 次精度にすぎません（7.84、4.10、2.20 mm。半分ずつ）。" %}

なぜ 2 次精度なのでしょうか。表面の近くでは、滑らかな $f$ は曲率の項を除けば線形です。$f(\mathbf p\_a + s\,\mathbf e) = f\_a + s\,\nabla f\cdot\mathbf e + O(s^2 h^2)$。線形補間は線形部分のゼロを正確に求めるので、誤差は $O(h^2)$ の剰余項だけですが、中点は最大 $h/2$ ずれることがあります。TSDF が「内部」か「外部」かだけでなく連続値を保存するのはこのためです。値がボクセル以下の情報を運び、Marching Cubes がそれを取り出します。

## 4. 点から水密な表面へ：ポアソン再構成

### 4.1 融合が向かないとき

TSDF 融合には元の深度マップとそのカメラが必要で、何かが観測された場所にしか表面を作りません。よくある 2 つの状況では別の方法が必要です。手元にあるのが法線付きの点群だけという場合があります。COLMAP の融合済み MVS 出力、LiDAR スキャン、ニューラル場からサンプルした点などです。また、物体の一部が一度も見えていなくても、3D プリント、物理シミュレーション、体積計算のために**水密な**メッシュが必要な場合もあります。

**ポアソン表面再構成**（Poisson surface reconstruction、Kazhdan、Bolitho、Hoppe、2006）が標準的な答えです。考え方は（[グラフィックス第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})で詳しく導出しています）次のとおりです。$\chi$ を立体の指示関数とします。その勾配は表面以外ではゼロで、表面では内向きです。したがって、サンプルの向き付き法線を滑らかにしたベクトル場 $\mathbf V$ は、この勾配の標本になっています。勾配が $\mathbf V$ に最もよく合う $\chi$ を求めます。

$$
\min_\chi \int \lVert \nabla\chi - \mathbf V \rVert^2 \, d\mathbf x
\quad\Longrightarrow\quad \Delta\chi = \nabla\cdot\mathbf V ,
$$

そして等値面を抽出します。解が大域的なので、穴は可能な限り滑らかな表面で埋められ、雑音は平均されます。

### 4.2 スクリーニング

素朴なポアソン再構成には弱点があります。勾配の項は差しか拘束しないので、法線が疎だったり矛盾していたりする領域で $\chi$ がデータから漂流し、表面が点から引き離されることがあります。**スクリーン付きポアソン再構成**（screened Poisson、Kazhdan と Hoppe、2013）は、入力点で $\chi$ が決まった値を取るよう求める項を加えます。$\chi$ を内部で約 $+\tfrac12$、外部で約 $-\tfrac12$ とすれば表面は $\chi = 0$ で、エネルギーは

$$
E(\chi) = \int \lVert \nabla\chi - \mathbf V \rVert^2 \, d\mathbf x + \alpha \sum_i \ell_i\, \chi(\mathbf p_i)^2 ,
$$

となります。$\ell\_i$ はサンプル $i$ が代表する曲線の長さ（3 次元では面積）、$\alpha$ はスクリーニングの強さです。格子上では $\nabla$ が疎な差分行列 $G$ に、サンプル位置での評価が疎な双線形補間行列 $B$ になり、$E$ の勾配をゼロとおくと疎で対称な正定値の連立方程式が 1 つ得られます。

$$
\big(G^\top G + \alpha\, B^\top L B\big)\,\boldsymbol\chi = G^\top \mathbf v, \qquad L = \operatorname{diag}(\ell_i).
$$

実際の実装は適応的な八分木の上でマルチグリッド法で解きますが、ここでの $128 \times 128$ の格子なら SciPy の疎な直接法で十分です。

### 4.3 コードと結果

今回はカメラが円周の 210° しか覆っていないので、シーンの一部は一度も見えません。向き付き点はスキャンそのものから作ります。各法線は最近傍 60 点の分散が最小の方向（Hoppe ら、1992）で、その点を見たカメラが向きを決めます。見えている表面はカメラの方を向いているはずだからです。センサ位置による向き付けは、生の点群に必要な全域木による伝播よりもずっと信頼できます。

```python
import scipy.sparse as sp
from scipy.sparse.linalg import spsolve
from scipy.spatial import cKDTree


def oriented_points(scans, k=60):
    """Merge the back-projected scans; PCA normals from k neighbours, flipped toward the camera
    that saw each point."""
    P, C = [], []
    for R, t, depth in scans:
        X, _ = backproject(R, t, depth)
        P.append(X)
        C.append(np.repeat((-R.T @ t)[None], len(X), 0))
    P, C = np.concatenate(P), np.concatenate(C)
    nb = cKDTree(P).query(P, k)[1]
    Q = P[nb] - P[nb].mean(1, keepdims=True)
    N = np.linalg.eigh(np.einsum("nki,nkj->nij", Q, Q))[1][:, :, 0]   # smallest eigenvector
    N *= np.sign(((C - P) * N).sum(1))[:, None]
    return P, N


def bilinear_matrix(P, xs):
    """Sparse B with B @ g.ravel() = bilinear interpolation of the node values g[i, j] at P."""
    n, h = len(xs), xs[1] - xs[0]
    fx = np.clip((P[:, 0] - xs[0]) / h, 0, n - 1 - 1e-9)
    fz = np.clip((P[:, 1] - xs[0]) / h, 0, n - 1 - 1e-9)
    j, i = np.floor(fx).astype(int), np.floor(fz).astype(int)
    a, b = fx - j, fz - i
    rows = np.repeat(np.arange(len(P)), 4)
    cols = np.stack([i * n + j, i * n + j + 1, (i + 1) * n + j, (i + 1) * n + j + 1], 1).ravel()
    vals = np.stack([(1 - a) * (1 - b), a * (1 - b), (1 - a) * b, a * b], 1).ravel()
    return sp.csr_matrix((vals, (rows, cols)), shape=(len(P), n * n))


def screened_poisson(P, N, xs, alpha=0.0, k=60):
    """Indicator chi (about +1/2 inside, -1/2 outside) whose gradient fits the splatted inward
    normals, screened toward chi = 0 at the points with weight alpha. Returns chi and the iso-value."""
    n, h = len(xs), xs[1] - xs[0]
    ell = 2 * cKDTree(P).query(P, k + 1)[0][:, -1] / k        # curve length each point stands for
    D = sp.diags([-np.ones(n - 1), np.ones(n - 1)], [0, 1], shape=(n - 1, n)) / h
    Gx, Gz = sp.kron(sp.identity(n), D).tocsr(), sp.kron(D, sp.identity(n)).tocsr()
    sig, tree = 1.5 * h, cKDTree(P)

    def splat(Q, comp):                                        # V = -sum ell_i N_i G_sig(x - p_i)
        V = np.zeros(len(Q))
        for q, nb in enumerate(tree.query_ball_point(Q, 4 * sig)):
            if nb:
                d2 = ((P[nb] - Q[q]) ** 2).sum(1)
                V[q] = -(ell[nb] * N[nb, comp] * np.exp(-d2 / (2 * sig ** 2))).sum() / (2 * np.pi * sig ** 2)
        return V
    vx = splat(np.stack(np.meshgrid(xs[:-1] + h / 2, xs), -1).reshape(-1, 2), 0)   # x-edge midpoints
    vz = splat(np.stack(np.meshgrid(xs, xs[:-1] + h / 2), -1).reshape(-1, 2), 1)   # z-edge midpoints
    B = bilinear_matrix(P, xs)
    A = (Gx.T @ Gx + Gz.T @ Gz) * h * h + alpha * (B.T @ sp.diags(ell) @ B) + 1e-9 * sp.identity(n * n)
    chi = spsolve(A.tocsc(), (Gx.T @ vx + Gz.T @ vz) * h * h).reshape(n, n)
    iso = 0.0 if alpha > 0 else np.average(B @ chi.ravel(), weights=ell)
    return chi, iso


arc = orbit(24, start=-60, span=210, rng=rng, jitter=0.15)      # cameras on 210 degrees only
arc_scans = [(R, t, render_depth(R, t, sigma=0.02, rng=rng)) for R, t in arc]
P_arc, N_arc = oriented_points(arc_scans)
xs, _ = make_grid(128)
for alpha in (0.0, 32.0):
    chi, iso = screened_poisson(P_arc, N_arc, xs, alpha)
    pts = sample_segments(marching_squares(chi - iso, xs))
    print("alpha = %4.1f: chi in [%+.2f, %+.2f], iso %.3f, mean |sdf| of the curve %.1f mm"
          % (alpha, chi.min(), chi.max(), iso, 1000 * np.abs(scene_sdf(pts)).mean()))
```

```text
alpha =  0.0: chi in [-0.62, +0.95], iso 0.276, mean |sdf| of the curve 60.5 mm
alpha = 32.0: chi in [-0.54, +0.54], iso 0.000, mean |sdf| of the curve 22.7 mm
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-poisson.svg" localized="true" caption="210° の円弧上の 24 回のスキャンからの再構成（紫：カメラの方向）。左：TSDF 融合は見えた部分だけを残し、円板の左下と箱の左側は開いたままです（灰：未観測）。中：素朴なポアソンはすべての穴を閉じますが、指示関数が漂流し（$-0.62$ から $+0.95$、等値 0.276）、箱の見えていない側が塊のように膨らみます。曲線の平均 $\lvert f\rvert$ は 60.5 mm です。右：スクリーン付きポアソン（$\alpha$ = 32）は $\chi$ を $\pm 0.54$ 以内に保ち、サンプル（赤）に沿い、穴をきつく閉じます（22.7 mm）。黄色の破線が真値です。" %}

この図はトレードオフをうまくまとめています。TSDF 融合は正直です。データのないところには表面がありません。ポアソンは完全です。常に閉じた表面を返し、データのないところでは最も滑らかな推測を返します。スクリーニングは推測をデータの近くにとどめますが、それでも推測であることに変わりはありません。評価指標がそれをどう扱うかは第 8 節で見ます。実際のパイプラインでは、ポアソンメッシュのうち支持の弱い部分、つまりサンプル密度の低い面を切り取ります（PoissonRecon のコードの `SurfaceTrimmer` ツールや、Open3D での密度のしきい値）。

### 4.4 その他のメッシュ化手法とテクスチャ付け

知っておくべき手法があと 2 系統あります。**可視性に基づく Delaunay メッシュ化**は OpenMVS や COLMAP の `delaunay_mesher` が使うもので、点を四面体分割し、カメラの視線（カメラから点への光線は空き空間しか通らない）を使ったグラフカットで各四面体を内部か外部かに分類します。鋭い細部を保ち、大規模な屋外シーンに強い手法です。**ボールピボッティング**（ball pivoting）は点の上でボールを転がし、同時に触れた 3 点をつなぎます。点を正確に補間しますが、サンプリングがボールより粗いところには穴が残ります。

最後に、見るためのメッシュには**テクスチャ**が必要です。各三角形はそれを最もよく見ている画像（近く、正面で、鮮明なもの）を選び、隣り合う三角形は継ぎ目を避けるために同じ画像を好み（ラベル上のマルコフ確率場）、残った露出の違いは大域的な色補正で目立たなくします。Waechter、Moehrle、Goesele（ECCV 2014）の手法がその例で、多くのオープンなパイプラインで使われています。

## 5. 実践での古典的パイプライン

COLMAP を使えば、画像からメッシュまでの連鎖全体がいくつかのコマンドで済みます（COLMAP のコマンドラインのドキュメントによるもので、この記事ではこのブロックを実行していません）。

```bash
colmap feature_extractor --database_path db.db --image_path images
colmap exhaustive_matcher --database_path db.db
mkdir sparse
colmap mapper --database_path db.db --image_path images --output_path sparse
colmap image_undistorter --image_path images --input_path sparse/0 --output_path dense --output_type COLMAP
colmap patch_match_stereo --workspace_path dense --workspace_format COLMAP --PatchMatchStereo.geom_consistency true
colmap stereo_fusion --workspace_path dense --workspace_format COLMAP --input_type geometric --output_path dense/fused.ply
colmap poisson_mesher --input_path dense/fused.ply --output_path dense/meshed-poisson.ply
colmap delaunay_mesher --input_path dense --output_path dense/meshed-delaunay.ply
```

各段はこのシリーズに対応しています。特徴とマッチング（第 3 回）、バンドル調整付きの逐次型 SfM（第 5 回。`glomap mapper` は大域型の代替）、歪み補正（第 1 回）、幾何的整合性付きの PatchMatch MVS（第 7 回）、融合、メッシュ化です。COLMAP の `stereo_fusion` は TSDF ではありません。複数の視点で深度と法線が一致する深度マップの画素をまとめて点にするもので、ボクセル格子では無駄が多い非有界の屋外シーンに向いています。これに対して Open3D は RGB-D 系列向けに TSDF 融合を提供しています。

この連鎖はどこで失敗するのでしょうか。ほとんど常に前段です。テクスチャのない壁、反射、繰り返し模様はマッチングを壊し、重なりの不足や純粋な回転は SfM を壊します（第 4 回でこれらの退化を説明しています）。そして少数の誤ったカメラが下流のすべてを汚染します。MVS も同じテクスチャのない領域や鏡面反射の領域で苦労し、融合した点群にはそこで穴や浮遊物が生じます。学習ベースの手法が狙うのはまさにこの隙間です。何百万枚もの画像で学習したネットワークは、壁や床や物体の形について、測光的整合性のスコアにはない事前知識を持っています。

## 6. ニューラル表面

### 6.1 NeRF の密度をそのまま使えないのはなぜか

NeRF（[ニューラルレンダリング第 2 回]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})）は、ボリュームレンダリングが画像を再現するように密度 $\sigma(\mathbf x)$ と色を当てはめます。ある密度レベルでメッシュを抽出することはできますが、結果はよくありません。測光的な損失のどこにも、密度が表面に集中することを求める要素がないからです。正しい色をレンダリングできる半透明の雲でも同じように良いので、等値面は雑音が多く、適切なしきい値も場所によって異なります。ニューラル表面手法は表現を変えます。定義上そのゼロ等値面が表面となる**符号付き距離関数** $f$ を保存し、そこから密度を導きます。問題はその導き方です。

### 6.2 SDF からレンダリング重みへ：偏りの問題

光線 $\mathbf r(t) = \mathbf o + t\,\mathbf d$ に沿って、ボリュームレンダリングは色を $C = \int w(t)\,\mathbf c(t)\,dt$ と表します。重みは $w(t) = T(t)\,\sigma(t)$、透過率は $T(t) = \exp(-\int\_0^t \sigma)$ です。重みには 2 つの性質が欲しいところです。

- **不偏**（unbiased）：光線が横切る表面について、$w$ が光線と表面の交点 $f(\mathbf r(t^\ast)) = 0$ でちょうどピークを持つこと。そうすればレンダリングされる深度と色が表面から来ます。
- **遮蔽を考慮する**（occlusion-aware）：光線が 2 つの表面に出会うとき、手前の表面が（ほぼ）すべての重みを得ること。

$\Phi\_s(x) = 1/(1 + e^{-sx})$ を鋭さ $s$ のシグモイド、$\phi\_s = \Phi\_s'$ をその導関数（ロジスティック密度、幅およそ $1/s$ の山）とします。素直な選択は**素朴な**密度 $\sigma(t) = \phi\_s(f(\mathbf r(t)))$ で、表面の近くで大きく、それ以外で小さくなります。これは不偏でしょうか。入射角 $\theta$ で出会う平面を考えると $f(\mathbf r(t)) = -c\,(t - t^\ast)$、$c = \cos\theta$ です。重みのピークは $w' = T(\sigma' - \sigma^2) = 0$、すなわち $\sigma' = \sigma^2$ のところです。$\Phi = \Phi\_s(f)$ とおくと $\sigma = s\Phi(1-\Phi)$、$\sigma' = -c\,s^2\Phi(1-\Phi)(1-2\Phi)$ なので、条件は次のようになります。

$$
c\,(2\Phi - 1) = \Phi(1-\Phi)
\quad\Longrightarrow\quad
\Phi^\ast = \frac{1 - 2c + \sqrt{4c^2 + 1}}{2},
\qquad
t_{\text{peak}} - t^\ast = -\frac{1}{s\,c}\,\ln\frac{\Phi^\ast}{1 - \Phi^\ast} .
$$

ピークは常に表面の**手前**にあります。正面（$c = 1$）では $\Phi^\ast = (\sqrt5 - 1)/2 = 0.618$（偶然にも黄金比です）で、偏りは $-0.481/s$ です。斜めになると偏りは $1/\cos\theta$ よりも速く大きくなり、$c \to 0$ では $\Phi^\ast \approx 1 - c$ なので偏りは $-\ln(1/c)/(s\,c)$ に近づきます。直観的には、光線がゼロ交差に達する前から密度が光を吸収し始めるので、$\sigma$ がピークに達したときには透過率がすでに下がっている、ということです。別の簡単な選択である正規化した山 $w = \phi\_s(f)/\int\phi\_s(f)$ は不偏ですが遮蔽を無視し、光線上のすべての表面が同じ重みを得てしまいます。

**NeuS**（Wang ら、2021）は両方の性質を持つ密度を導きます。まず平面で何が欲しいかを考えます。重みは山そのもの、$w(t) = c\,\phi\_s(f(\mathbf r(t)))$ であってほしく、これは $t^\ast$ でピークを持ちます。$\frac{d}{dt}\Phi\_s(f(\mathbf r(t))) = -c\,\phi\_s(f)$ なので、これは透過率がちょうど $T(t) = \Phi\_s(f(\mathbf r(t)))$ のときに成り立ちます。この透過率は表面のずっと手前（$f$ が大きな正の値）で 1 に近く、表面の奥で 0 に落ちます。透過率は $\sigma = -T'/T$ によって密度を決めるので、**不透明密度**（opaque density）が得られます。

$$
\rho(t) = \max\left( \frac{-\frac{d}{dt}\Phi_s\big(f(\mathbf r(t))\big)}{\Phi_s\big(f(\mathbf r(t))\big)},\; 0 \right),
$$

ゼロでの打ち切りは一般の場合のためのものです。光線が物体から出るとき $\Phi\_s$ は再び増え、式が負の密度を与えてしまうからです。2 つのサンプル $t\_i$ と $t\_{i+1}$ の間で $\rho$ を積分すると $\int \rho\,dt = -\ln(\Phi\_s(f\_{i+1}) / \Phi\_s(f\_i))$ なので、区間の不透明度は

$$
\alpha_i = 1 - \exp\Big(-\int_{t_i}^{t_{i+1}} \rho\,dt\Big) = \max\left( \frac{\Phi_s(f_i) - \Phi_s(f_{i+1})}{\Phi_s(f_i)},\; 0 \right),
$$

となり、あとはいつもの合成 $w\_i = T\_i\alpha\_i$、$T\_i = \prod\_{j<i}(1 - \alpha\_j)$ が引き受けます。鋭さ $s$ は学習されるパラメータです。学習の初期には $1/s$ が大きく重みが広がっていて最適化を助け、表面がはっきりするにつれて $s$ が大きくなります。

### 6.3 数値で確かめる

```python
def sigmoid(x):
    return 0.5 * (1 + np.tanh(0.5 * x))          # = 1 / (1 + exp(-x)), without overflow


def weights_from_alpha(alpha):
    """w_i = T_i alpha_i with T_i = prod_{j<i} (1 - alpha_j), the volume rendering weights."""
    T = np.concatenate([np.ones(alpha.shape[:-1] + (1,)), np.cumprod(1 - alpha, -1)[..., :-1]], -1)
    return T * alpha


def alpha_naive(f, s, dt):
    """Density sigma = phi_s(f), the logistic density of the SDF: alpha = 1 - exp(-sigma dt)."""
    phi = s * sigmoid(s * f) * (1 - sigmoid(s * f))
    return 1 - np.exp(-phi[..., :-1] * dt)


def alpha_neus(f, s):
    """NeuS: alpha_i = max((Phi_s(f_i) - Phi_s(f_{i+1})) / Phi_s(f_i), 0)."""
    Phi = sigmoid(s * f)
    return np.clip((Phi[..., :-1] - Phi[..., 1:]) / np.maximum(Phi[..., :-1], 1e-12), 0, 1)


t = np.linspace(0.0, 4.0, 8001)
dt, t_star, s = t[1] - t[0], 2.0, 20.0
for theta in (0, 60, 80):
    c = np.cos(np.deg2rad(theta))
    f = -c * (t - t_star)                        # SDF along a ray that meets a plane at t* = 2
    peak = {}
    for name, a in (("naive", alpha_naive(f, s, dt)), ("NeuS", alpha_neus(f, s))):
        peak[name] = t[np.argmax(weights_from_alpha(a))] + dt / 2 - t_star
    Phi = (1 - 2 * c + np.sqrt(4 * c * c + 1)) / 2           # the peak condition derived in 6.2
    print("theta = %2d deg: peak - t* = %+.4f (naive), %+.4f (NeuS); theory for naive %+.4f"
          % (theta, peak["naive"], peak["NeuS"], -np.log(Phi / (1 - Phi)) / (s * c)))
```

```text
theta =  0 deg: peak - t* = -0.0237 (naive), +0.0002 (NeuS); theory for naive -0.0241
theta = 60 deg: peak - t* = -0.0877 (naive), +0.0002 (NeuS); theory for naive -0.0881
theta = 80 deg: peak - t* = -0.5122 (naive), +0.0002 (NeuS); theory for naive -0.5124
```

素朴なピークは予測どおりの量だけ表面の手前にあり（実測 $-0.0237$、$-0.0877$、$-0.5122$ m に対して式は $-0.0241$、$-0.0881$、$-0.5124$ m。差は曲線のサンプリングの範囲内です）、NeuS のピークはどの角度でも表面上にあります（$+0.0002$ はサンプル間隔の半分です）。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-neus-weights.svg" localized="true" caption="1 本の光線に沿ったレンダリング重み $w(t)$、$s = 20$。左：$t^\ast = 2$ の平面を正面から（実線）と 60° で（破線）見たもの。素朴な重み（オレンジ）は表面の 2.4 cm と 8.8 cm 手前でピークを持ち、NeuS の重み（紫）は表面上でピークを持ちます。右：厚さ 30 cm の板の後ろ、$t = 3$ にもう 1 つの表面があります（緑：SDF $f(t)$、右軸）。素朴な密度は前面に 0.612、板の裏面に 0.237、隠れた表面に 0.094 の重みを与え、正規化した山 $\bar\phi\_s$（点線）は 3 か所に 0.33〜0.34 ずつ配ります。NeuS は前面に 0.950、裏面に 0.000、隠れた表面に 0.047 を与えます。これはちょうど、この $s$ で板を透過する光の量です。" %}

2 つ目のウィジェットでは $s$、角度、サンプル数を変えられます。$1/s$ がサンプル間隔よりずっと小さくならない限り、離散化した NeuS の重み（棒グラフ）はサンプルが少なくても表面を中心に保たれることに注目してください。そうでないときは重みがすべて 1 つの区間に落ちて表面の位置が量子化されます。NeuS が表面の近くに階層的にサンプルを追加するのはこのためです。

{% include widget.liquid name="3d-vision-neus-weights" height="520" caption="1 本の光線に沿って SDF から得られるレンダリング重み。平面 1 枚か、板とその奥の 2 つ目の表面を選びます。図をドラッグするか（左右：鋭さ $s$、上下：入射角 $\theta$）、スライダーを使ってください。オレンジ：素朴な密度 $\sigma = \phi\_s(f)$、紫：NeuS（いずれも 2000 サンプル）、棒：$n$ サンプルだけを使った NeuS。表示値は素朴なピークを第 6.2 節の閉じた形の偏りと比べ、両者の不透明度の合計を示します。" %}

### 6.4 アイコナール項と小さな NeuS

$f$ を出力するネットワークや格子は、自動的に距離関数になるわけではありません。**アイコナール**（eikonal）正則化項 $\mathcal L\_{\text{eik}} = \mathbb E\big[(\lVert\nabla f\rVert - 1)^2\big]$ は Gropp ら（IGR、2020）が陰関数曲面の学習に導入したもので、勾配の大きさを 1 に近づけます。真の SDF の勾配はほとんど至るところで単位長だからです。これがないと、$f$ は表面の近くで急になりすぎたり平らになりすぎたりし、$s$ と重みの山の幅の関係（単位勾配を前提としています）が崩れます。

手法全体の動きを見るために、次のブロックで平面国の NeuS を当てはめます。SDF は $96 \times 96$ の格子点に保存して双線形補間し（本物の MLP やハッシュ格子の代わりです）、各カメラは 1 画素おきに光線を出して 1.0〜4.2 m の間に 128 サンプルを取ります。損失はレンダリングした不透明度 $O = \sum\_i w\_i$ をシルエット（光線が何かに当たったか）と比べ、レンダリングした深度 $D = \sum\_i w\_i t\_i$ を真の距離と比べます。NeuS は色を主な信号とし、ここと同様のマスク項をオプションとして持ちます。平面国では深度を使うと例が短く済みます。勾配は手で書いています。レンダリング量 $Q = \sum\_k w\_k q\_k$ について $\partial Q/\partial\alpha\_k = T\_k(q\_k - A\_{k+1})$ で、$A\_k = \alpha\_k q\_k + (1 - \alpha\_k)A\_{k+1}$ はサンプル $k$ 以降からレンダリングされる値です。連鎖律はさらに $\alpha\_k = 1 - \Phi\_{k+1}/\Phi\_k$ と $\Phi\_k = \Phi\_s(f\_k)$（$s f\_k$ のシグモイド）を通って格子まで続きます。（有限差分による確認とは 6 桁まで一致します。）

```python
def neus_render(g, log_s, B, t_mid, n_samp, dO=None, dD=None):
    """Opacity O and depth D of every ray for the grid SDF g. With dO = dL/dO and dD = dL/dD,
    also return dL/dg and dL/dlog_s (backpropagation written out by hand)."""
    s = np.exp(log_s)
    f = (B @ g).reshape(-1, n_samp)                 # SDF at the samples of every ray
    Phi = sigmoid(s * f)
    ratio = Phi[:, 1:] / np.maximum(Phi[:, :-1], 1e-12)
    alpha = np.clip(1 - ratio, 0, 1)
    w = weights_from_alpha(alpha)
    O, D = w.sum(1), (w * t_mid).sum(1)
    if dO is None:
        return O, D, w
    # for C = sum_k w_k c_k:  dC/dalpha_k = T_k (c_k - A_{k+1}),  A_k = alpha_k c_k + (1 - alpha_k) A_{k+1}
    T = np.concatenate([np.ones((len(f), 1)), np.cumprod(1 - alpha, 1)[:, :-1]], 1)
    c = dO[:, None] + dD[:, None] * t_mid           # both outputs at once
    A, acc = np.zeros_like(alpha), np.zeros(len(f))
    for k in range(alpha.shape[1] - 1, -1, -1):
        A[:, k] = acc
        acc = alpha[:, k] * c[:, k] + (1 - alpha[:, k]) * acc
    g_alpha = T * (c - A) * (ratio < 1)             # no gradient where alpha was clipped to 0
    pk = np.maximum(Phi[:, :-1], 1e-12)
    dPhi = np.zeros_like(Phi)
    dPhi[:, :-1] += g_alpha * Phi[:, 1:] / pk ** 2  # alpha_k = 1 - Phi_{k+1} / Phi_k
    dPhi[:, 1:] -= g_alpha / pk
    dx = dPhi * Phi * (1 - Phi)                     # dL/d(s f)
    return O, D, w, B.T @ (dx * s).ravel(), (dx * f).sum() * s


def cell_gradient(n, h):
    """Sparse Cx, Cz: the gradient of a node grid at the (n-1)^2 cell centres."""
    D = sp.diags([-np.ones(n - 1), np.ones(n - 1)], [0, 1], shape=(n - 1, n)) / h
    M = sp.diags([0.5 * np.ones(n - 1), 0.5 * np.ones(n - 1)], [0, 1], shape=(n - 1, n))
    return sp.kron(M, D).tocsr(), sp.kron(D, M).tocsr()


def eikonal(g, Cx, Cz):
    """Mean of (|grad g| - 1)^2 over the cells, and its gradient with respect to g."""
    gx, gz = Cx @ g, Cz @ g
    nrm = np.sqrt(gx ** 2 + gz ** 2) + 1e-12
    r = nrm - 1
    return np.mean(r ** 2), Cx.T @ (2 * r / nrm / len(r) * gx) + Cz.T @ (2 * r / nrm / len(r) * gz)


def fit_neus(cams, n=96, n_samp=128, t_near=1.0, t_far=4.2, iters=800, lam_d=1.0, lam_e=0.3,
             lr=0.01, log_every=(0, 50, 200, 800)):
    # rays through every second pixel, with their true silhouette (hit or not) and range
    pts, m_gt, r_gt = [], [], []
    ts = np.linspace(t_near, t_far, n_samp)
    for R, t in cams:
        u = np.arange(0, W, 2)
        ray = np.stack([(u - CX) / FOC, np.ones(len(u))], 1)
        nrm = np.linalg.norm(ray, axis=1)
        d = render_depth(R, t)[u]
        dirs = (ray / nrm[:, None]) @ R
        pts.append(-R.T @ t + ts[None, :, None] * dirs[:, None, :])
        m_gt.append(np.isfinite(d)); r_gt.append(np.nan_to_num(d * nrm))
    pts = np.concatenate(pts).reshape(-1, 2)
    m_gt, r_gt = np.concatenate(m_gt), np.concatenate(r_gt)
    t_mid = 0.5 * (ts[1:] + ts[:-1])
    xs = np.linspace(-1.6, 1.6, n)                  # SDF values on the nodes of an n x n grid
    B = bilinear_matrix(pts, xs)
    Cx, Cz = cell_gradient(n, xs[1] - xs[0])
    GX, GZ = np.meshgrid(xs, xs)
    theta = [np.sqrt(GX ** 2 + GZ ** 2).ravel() - 1.0, np.array(np.log(10.0))]   # a circle, s = 10
    m1, m2 = [np.zeros_like(p) for p in theta], [np.zeros_like(p) for p in theta]
    log = {}
    for it in range(iters + 1):
        O, D, w = neus_render(theta[0], theta[1], B, t_mid, n_samp)
        loss_e, grad_e = eikonal(theta[0], Cx, Cz)
        loss = np.mean((O - m_gt) ** 2) + lam_d * np.mean((D - r_gt)[m_gt] ** 2) + lam_e * loss_e
        if it in log_every:
            log[it] = (theta[0].reshape(n, n).copy(), float(np.exp(theta[1])), loss)
            print("iter %4d: loss %.5f, s = %6.1f" % (it, loss, np.exp(theta[1])))
        if it == iters:
            break
        dO = 2 * (O - m_gt) / len(O)
        dD = lam_d * 2 * (D - r_gt) * m_gt / m_gt.sum()
        _, _, _, grad_g, grad_s = neus_render(theta[0], theta[1], B, t_mid, n_samp, dO, dD)
        for k, gr in enumerate((grad_g + lam_e * grad_e, np.array(grad_s))):   # Adam
            m1[k] = 0.9 * m1[k] + 0.1 * gr
            m2[k] = 0.999 * m2[k] + 0.001 * gr ** 2
            theta[k] = theta[k] - lr * m1[k] / (1 - 0.9 ** (it + 1)) / (np.sqrt(m2[k] / (1 - 0.999 ** (it + 1))) + 1e-8)
    return xs, theta[0].reshape(n, n), log


xs_n, g_fit, neus_log = fit_neus(orbit(24))
pts = sample_segments(marching_squares(g_fit, xs_n))
err = 1000 * np.abs(scene_sdf(pts))
print("NeuS zero level set: mean |sdf| %.1f mm, median %.1f mm" % (err.mean(), np.median(err)))
```

```text
iter    0: loss 0.60269, s =   10.0
iter   50: loss 0.20917, s =   15.0
iter  200: loss 0.02043, s =   43.3
iter  800: loss 0.00271, s =  223.0
NeuS zero level set: mean |sdf| 16.4 mm, median 8.0 mm
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-neus-fit.svg" localized="true" caption="$96 \times 96$ の SDF 格子を、24 台のカメラ（紫）の深度とシルエットに NeuS 流に当てはめたもの。色：$f$（赤が内部、青が外部）、黒：ゼロ等値線、黄色の破線：真値。半径 1 m の円、$s$ = 10 から始めます。Adam で 50 ステップ後には円がシルエットに向かって変形し始め、200 ステップ後には 3 つの物体が分かれ、800 ステップ後には学習された鋭さが $s$ = 223 まで大きくなり、ゼロ等値線から真の表面までの距離の中央値は 8.0 mm になります（平均は 16.4 mm。どの光線も見ない箱の内部の小さな偽の輪郭が平均を押し上げています）。" %}

図の推移はニューラル表面手法に典型的なものです。粗い形はすぐに現れ、表面が観測と整合するにつれて $s$ が大きくなり、細部は最後に現れます。どの光線にも拘束されない領域（ここでは物体の内部）は正則化項だけで決まるので、アイコナール項とよい初期化がとても重要になります。

### 6.5 Neuralangelo とガウシアンの道

MLP を使う NeuS は遅く、細部をならしてしまいます。**Neuralangelo**（Li ら、2023）は SDF を多重解像度ハッシュ格子（[高速な放射輝度場]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})）に格納し、大規模シーンでも細部に届くよう 2 つの変更を加えます。アイコナール項に必要な勾配を、学習中に刻み幅を小さくしていく**数値的な**有限差分で計算すること（ハッシュ格子の解析的勾配は 1 つのセルに局所的で雑音が多いためです）と、ハッシュの各レベルを**粗いものから細かいものへ**最適化することです。VolSDF（Yariv ら、2021）はこの系統のもう 1 つの古典で、密度を $-f$ のラプラス累積分布関数の定数倍として定義し、サンプリングによる不透明度の誤差の上界を与えます。

最新の表面手法は、ガウシアンスプラッティングから出発します。3 次元ガウシアンには光線に沿った深度がはっきり定まらないので、**2D ガウシアンスプラッティング**（2DGS、Huang ら、2024）は各プリミティブを向きを持つ円板に押しつぶして光線との交点を厳密にし、深度の歪み損失と法線の一貫性損失を加えます。**Gaussian Opacity Fields** はガウシアンから直接等値面を定義します。どちらも [3DGS のフロンティアの回]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})で説明しました。ここで重要なのは、2DGS がメッシュをどう取り出すかです。学習視点から深度マップをレンダリングし、**それを TSDF で融合し**、Marching Cubes を走らせます。この記事の第 2、3 節は、2024 年の手法の最終ステップそのものです。

## 7. フィードフォワード型の 3 次元基盤モデル

### 7.1 パイプラインから 1 つのネットワークへ

ここまでのすべては、シーンごとに、手で設計した目的関数（再投影誤差、測光的整合性、レンダリング損失）で最適化するものでした。2024 年、別の考え方が広がりました。**DUSt3R**（Wang ら、CVPR 2024）は多数の 3 次元データセットの混合で Transformer を学習し、既知の内部パラメータも姿勢もなしに 2 枚の画像を直接密な 3 次元幾何に写します。その後継は多視点を一度に扱い（VGGT）、マッチングを加え（MASt3R）、動画ストリームで動き（CUT3R とストリーミング版）、計量的なスケールを予測します（MapAnything、および Depth Anything 3 の計量モデル）。SfM が失敗したり何分もかかったりする、数枚の写真のカジュアルな撮影では、今やこれらのモデルの方がよい答えを出すことが多く、多くの NeRF や 3DGS のパイプラインがその出力で COLMAP を初期化したり置き換えたりしています。

### 7.2 DUSt3R：ポイントマップ

DUSt3R の鍵となる設計は出力です。深度（3 次元にするには内部パラメータが必要）でもカメラ（マッチングが必要）でもなく、**ポイントマップ**を予測します。$H \times W$ 画素の画像に対して、各画素に 3 次元点を割り当てる配列 $X \in \mathbb R^{H\times W\times 3}$ です。画像 1 と 2 を与えると、ネットワークは次を出力します。

- $X^{1,1}$：画像 1 に写る点を、**カメラ 1 の座標系**で表したもの。
- $X^{2,1}$：画像 2 に写る点を、**同じくカメラ 1 の座標系**で表したもの。
- 両者の信頼度マップ $C^{1,1}$ と $C^{2,1}$。

記法 $X^{n,m}$ は「画像 $n$ の画素、カメラ $m$ の座標」を意味します。2 つのポイントマップが同じ座標系にあるので、2 視点の相対的な幾何はその中に暗黙に含まれています。2 枚の画像で同じ表面点を見ている画素は、同じ 3 次元座標を得るのです。マッチング、相対姿勢、内部パラメータはすべてそこから読み取れます。

構造としては、2 枚の画像が共有の ViT エンコーダを通り、2 つのデコーダが各層でクロスアテンションにより情報を交換し、DPT 風の 2 つのヘッドがポイントマップと信頼度を回帰します。シーンのスケールは画像からは分からないので、回帰損失はスケールを正規化したポイントマップを比べます。真値を $\bar X$、有効な点の原点までの平均距離を $z$、$\bar z$ として、

$$
\ell_{\text{regr}}(v, i) = \Big\lVert \tfrac{1}{z} X^{v,1}_i - \tfrac{1}{\bar z}\bar X^{v,1}_i \Big\rVert,
\qquad
\mathcal L_{\text{conf}} = \sum_{v\in\{1,2\}} \sum_i C^{v,1}_i\, \ell_{\text{regr}}(v, i) - \beta \log C^{v,1}_i .
$$

信頼度の項によって、ネットワークは「分からない」（空、反射、遮蔽）と言えるようになりますが、代償があります。小さな $C$ は誤差の重みを下げる代わりに $-\beta\log C$ を払います。

3 次元のおもちゃのシーン（地面、2 つの箱、1 つの球）を、第 1 回の規約どおり OpenCV の軸を持つ $64 \times 48$ の 2 台のピンホールカメラで見て、ポイントマップから何が読み取れるかを確かめます。「ネットワーク」は模擬したもので、未知のスケールの真のポイントマップに 3 次元で 2% の雑音を加え、5% の外れ点を低い信頼度で返します。

**焦点距離。** 主点が画像中心にあり画素が正方形なら、各画素 $(u\_i, v\_i)$ とそのカメラ座標の 3 次元点 $(X\_i, Y\_i, Z\_i)$ は $(u\_i - c\_x, v\_i - c\_y) = f\_x\,(X\_i/Z\_i, Y\_i/Z\_i)$ を満たすはずです。DUSt3R は $\sum\_i C\_i\,\lVert (u\_i - c\_x, v\_i - c\_y) - f\_x (X\_i, Y\_i)/Z\_i \rVert$ を最小化して $f\_x$ を推定します。これは二乗しないロバストなコストで、Weiszfeld 法で解きます。重み $C\_i / r\_i$（$r\_i$ は現在の残差）による重み付き最小二乗を繰り返すのです。

**相対姿勢。** 画像を入れ替えてもう一度ネットワークを走らせると、画像 1 の点をカメラ 2 の座標系で表した $X^{1,2}$ が得られます。すると $X^{1,1}$ と $X^{1,2}$ は同じ点の 2 つの座標系での表現で、相似変換で結ばれており、Umeyama（Procrustes）の解が SVD 1 回で閉じた形でそれを求めます。回転は確定し、並進はスケールを除いて決まります。（$X^{2,1}$ に RANSAC 付きの PnP を使うのがもう 1 つの方法です。）

```python
H3, W3, F3 = 48, 64, 56.0                            # a small 64 x 48 pinhole camera
K3 = np.array([[F3, 0, (W3 - 1) / 2], [0, F3, (H3 - 1) / 2], [0, 0, 1]])


def sdf3(p):
    """A ground plane (y = 0.6; the OpenCV world has y down), two boxes and a ball."""
    def box(p, c, b):
        q = np.abs(p - c) - b
        return np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(q.max(-1), 0)
    ground = 0.6 - p[..., 1]
    b1 = box(p, np.array([-0.5, 0.25, 0.2]), np.array([0.35, 0.35, 0.35]))
    b2 = box(p, np.array([0.55, 0.35, -0.3]), np.array([0.25, 0.25, 0.4]))
    ball = np.linalg.norm(p - np.array([0.2, 0.2, 0.7]), axis=-1) - 0.4
    return np.minimum(np.minimum(ground, ball), np.minimum(b1, b2))


def look_at3(C, target=(0.0, 0.2, 0.0), down=(0.0, 1.0, 0.0)):
    """World-to-camera (R, t) with OpenCV axes: x right, y down, z forward."""
    z = np.asarray(target, float) - C
    z /= np.linalg.norm(z)
    x = np.cross(down, z)
    x /= np.linalg.norm(x)
    R = np.stack([x, np.cross(z, x), z])
    return R, -R @ C


def render_pointmap(R, t):
    """The pointmap X^{v,v}: per pixel, the 3D point in the camera's own frame (NaN for sky)."""
    v, u = np.mgrid[0:H3, 0:W3].astype(float)
    rays = np.stack([u, v, np.ones_like(u)], -1) @ np.linalg.inv(K3).T    # K^-1 (u, v, 1)
    dirs = rays / np.linalg.norm(rays, axis=-1, keepdims=True)
    C, dw = -R.T @ t, dirs @ R
    s = np.zeros((H3, W3))
    for _ in range(160):
        s += np.where(s < 12, sdf3(C + s[..., None] * dw), 0)
    X = s[..., None] * dirs
    X[s >= 12] = np.nan
    return X


def focal_from_pointmap(X, conf, iters=10):
    """argmin_f sum_i C_i || (u_i - c) - f (X_i, Y_i) / Z_i ||, by Weiszfeld (iteratively reweighted LS)."""
    v, u = np.mgrid[0:H3, 0:W3].astype(float)
    a = np.stack([u - (W3 - 1) / 2, v - (H3 - 1) / 2], -1).reshape(-1, 2)   # pixel minus centre
    b = (X[..., :2] / X[..., 2:]).reshape(-1, 2)
    ok = np.isfinite(b).all(1)
    a, b, c = a[ok], b[ok], conf.reshape(-1)[ok]
    f = (c * (a * b).sum(1)).sum() / (c * (b * b).sum(1)).sum()             # least squares
    for _ in range(iters):
        w = c / np.maximum(np.linalg.norm(a - f * b, axis=1), 1e-9)
        f = (w * (a * b).sum(1)).sum() / (w * (b * b).sum(1)).sum()
    return f


def umeyama(A, B, w=None):
    """Similarity (s, R, t) minimizing sum_i w_i || s R A_i + t - B_i ||^2."""
    w = np.ones(len(A)) if w is None else w
    w = w / w.sum()
    ma, mb = w @ A, w @ B
    A0, B0 = A - ma, B - mb
    U, S, Vt = np.linalg.svd((B0 * w[:, None]).T @ A0)
    E = np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))])
    R = U @ E @ Vt
    s = np.trace(np.diag(S) @ E) / (w @ (A0 ** 2).sum(1))
    return s, R, mb - s * R @ ma


def fake_network(X, scale, rng):
    """Stand-in for DUSt3R's output: unknown scale, 2% 3D noise, 5% wild points with low confidence."""
    r = np.linalg.norm(X, axis=-1, keepdims=True)
    Y = X + 0.02 * r * rng.standard_normal(X.shape)
    wild = rng.random(X.shape[:2]) < 0.05
    Y[wild] += 0.5 * r[wild] * rng.standard_normal((wild.sum(), 3))
    return scale * Y, np.where(wild, 1.1, 3.0)


rng = np.random.default_rng(1)
R1, t1 = look_at3(np.array([0.3, -1.4, -3.0]))
R2, t2 = look_at3(np.array([2.2, -1.2, -2.2]))
R21, t21 = R2 @ R1.T, t2 - R2 @ R1.T @ t1          # camera 1 -> camera 2
X11, X22 = render_pointmap(R1, t1), render_pointmap(R2, t2)
X21 = (X22 - t21) @ R21                             # image 2's points in camera 1's frame
X12 = X11 @ R21.T + t21                             # image 1's points in camera 2's frame
P11, C11 = fake_network(X11, 0.4, rng)
P12, C12 = fake_network(X12, 0.4, rng)
print("focal: true %.1f, least squares %.2f, Weiszfeld %.2f"
      % (F3, focal_from_pointmap(P11, C11, iters=0), focal_from_pointmap(P11, C11)))
ok = np.isfinite(P11).all(-1)
s_, R_, t_ = umeyama(P11[ok], P12[ok], (C11 * C12)[ok])
ang = np.degrees(np.arccos(np.clip((np.trace(R_ @ R21.T) - 1) / 2, -1, 1)))
cosd = t_ @ t21 / np.linalg.norm(t_) / np.linalg.norm(t21)
print("relative pose: rotation error %.2f deg, translation direction error %.1f deg"
      % (ang, np.degrees(np.arccos(cosd))))
```

```text
focal: true 56.0, least squares 12.38, Weiszfeld 55.08
relative pose: rotation error 0.85 deg, translation direction error 7.5 deg
```

通常の最小二乗による焦点距離は外れ点に台無しにされます（56 ではなく 12.38）。深度がゼロに近い誤った点は $X/Z$ が巨大になり、二乗コストを支配してしまうからです。Weiszfeld による推定は真値から 2% 以内です。回転は 1 度以内に収まります。並進の向きはそれほど正確ではありません（7.5°）。雑音を含む点そのものから推定しているうえ、シーンの深度に比べて基線が短いからで、第 4 回が 2 視点幾何で出会ったのと同じ条件の悪さです。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-pointmap.svg" localized="true" caption="3 次元のおもちゃのシーンのポイントマップ。左：2 台のカメラ（紫：1、オレンジ：2）と、それらが見る物体の点を上から見た図（地面は省略）。中：$X^{1,1}$ と $X^{2,1}$ を画像として表示したもの。カメラ 1 の座標系の $(X, Y, Z)$ を同じ色スケールで RGB に対応させています（白：空）。2 枚の画像が同じ表面を見ているところでは、画素の位置は違っても色が一致します。対応関係が表現に組み込まれているのです。右：模擬ネットワーク出力の焦点距離コストを $f\_x$ に対して描いたもの（各曲線をその最小値で割っています）。ロバストな L1 コストの最小は 55.1 px で真値（56、黒線）のすぐ隣、二乗コストは 5% の外れ点に 12.5 px まで引っ張られます。" %}

### 7.3 多視点：大域整列

DUSt3R は一度に 2 枚の画像しか見ません。$N$ 枚の画像に対しては多くのペア（グラフ $\mathcal E$ の辺）で走らせ、**大域整列**（global alignment）を解きます。各画像に世界ポイントマップ $\chi^v$ を、各ペアに相似変換 $(\sigma\_e, P\_e)$ を求め、世界に移した各ペアの予測が世界ポイントマップと一致するようにします。

$$
\min_{\chi, P, \sigma} \sum_{e \in \mathcal E} \sum_{v \in e} \sum_i C^{v,e}_i \,\big\lVert \chi^v_i - \sigma_e P_e X^{v,e}_i \big\rVert
\qquad\text{制約 } \prod_e \sigma_e = 1 .
$$

制約は全体のスケールを固定します（これがないとすべてがゼロに縮んでしまいます）。DUSt3R はこれを勾配降下で最適化し、$\chi^v$ を深度マップとカメラでパラメータ化するので、カメラが直接得られます。ここでのおもちゃ版は、二乗距離と交互の閉じた形のステップで、考え方を最も単純な形で残しています。世界ポイントマップを固定して各ペアの相似変換を Umeyama で当てはめ、相似変換を固定して各世界ポイントマップを変換後の予測の信頼度重み付き平均にし、スケールを正規化し直します。初期値は連鎖で作ります。最初のペアが世界を定め、それ以降のペアは配置済みの視点を介してつないでいきます。

```python
def global_align(edges, pm, conf, n_views, iters=30):
    """edges[e] = (a, b); pm[e] = (X^{a,e}, X^{b,e}), both in camera a's frame at an unknown scale;
    conf[e] = their confidences. Finds world pointmaps chi[v] and similarities (s_e, R_e, t_e) with
    chi[v] ~ s_e R_e X^{v,e} + t_e, under the gauge prod_e s_e = 1."""
    chi = [None] * n_views
    a, b = edges[0]
    chi[a], chi[b] = pm[0][0].copy(), pm[0][1].copy()    # pair 0 defines the initial world frame
    placed = {a, b}
    while len(placed) < n_views:                         # chain the other pairs onto it
        for e, (a, b) in enumerate(edges):
            if (a in placed) != (b in placed):
                k = 0 if a in placed else 1
                s, R, t = umeyama(pm[e][k], chi[edges[e][k]], conf[e][k])
                chi[edges[e][1 - k]] = s * pm[e][1 - k] @ R.T + t
                placed.add(edges[e][1 - k])
    chi_init, history = [c.copy() for c in chi], []
    for it in range(iters):
        sim = [umeyama(np.concatenate(pm[e]), np.concatenate([chi[a], chi[b]]), np.concatenate(conf[e]))
               for e, (a, b) in enumerate(edges)]       # step 1: every pair's similarity
        g = np.exp(np.mean([np.log(s) for s, _, _ in sim]))
        sim = [(s / g, R, t / g) for s, R, t in sim]     # gauge: geometric mean of the scales = 1
        num = [np.zeros_like(c) for c in chi]
        den = [np.zeros(len(c)) for c in chi]
        res = wsum = 0.0
        for e, (a, b) in enumerate(edges):               # step 2: average the aligned pointmaps
            s, R, t = sim[e]
            for k, v in enumerate((a, b)):
                Y = s * pm[e][k] @ R.T + t
                num[v] += conf[e][k][:, None] * Y
                den[v] += conf[e][k]
                res += (conf[e][k] * ((Y - chi[v] / g) ** 2).sum(1)).sum()
                wsum += conf[e][k].sum()
        chi = [num[v] / den[v][:, None] for v in range(n_views)]
        history.append(np.sqrt(res / wsum))
    return chi_init, chi, sim, history


def small_rotation(deg, rng):
    ax = rng.standard_normal(3)
    ax /= np.linalg.norm(ax)
    Kx = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
    th = np.deg2rad(deg)
    return np.eye(3) + np.sin(th) * Kx + (1 - np.cos(th)) * Kx @ Kx


rng = np.random.default_rng(2)
n_views = 8
cams3 = [look_at3(3.2 * np.array([np.cos(a), -0.4, np.sin(a)])) for a in np.deg2rad(-90 + 45 * np.arange(n_views))]
Xw = []                                              # world points of the valid pixels of each view
for R, t in cams3:
    X = render_pointmap(R, t)[::2, ::2].reshape(-1, 3)
    Xw.append((X[np.isfinite(X).all(1)] - t) @ R)
edges = [(k, (k + 1) % n_views) for k in range(n_views)] + [(k, (k + 2) % n_views) for k in range(n_views)]
pm, conf = [], []
for a, b in edges:                                   # simulated pairwise predictions
    Ra, ta = cams3[a]
    E = small_rotation(2.0, rng)                     # this pair's relative pose is 2 degrees off
    pair = []
    for Y in (Xw[a] @ Ra.T + ta, (Xw[b] @ Ra.T + ta) @ E.T):
        Y = Y + 0.01 * np.linalg.norm(Y, axis=1, keepdims=True) * rng.standard_normal(Y.shape)
        pair.append(Y)
    scale = rng.uniform(0.5, 2.0)                    # each pair has its own unknown scale
    pm.append((scale * pair[0], scale * pair[1]))
    conf.append((np.ones(len(pair[0])), np.ones(len(pair[1]))))
world_init, world, sim, history = global_align(edges, pm, conf, n_views)


def rms_to_truth(chi):
    A, B = np.concatenate(chi), np.concatenate(Xw)
    s, R, t = umeyama(A, B)                          # compare up to a similarity
    return np.sqrt(((s * A @ R.T + t - B) ** 2).sum(1).mean())


print("RMS error after chaining: %.3f m, after global alignment: %.3f m"
      % (rms_to_truth(world_init), rms_to_truth(world)))
```

```text
RMS error after chaining: 0.222 m, after global alignment: 0.078 m
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-global-alignment.svg" localized="true" caption="おもちゃのシーンを囲む 8 視点について、模擬した 16 個のペア予測を大域整列したもの（物体の点を上から見た図、色は視点）。各ペアはそれぞれランダムなスケール、1% の雑音、相対姿勢に 2° の誤差を持ちます。左：環状のペアの予測で、それぞれ自分の座標系とスケールのままです。中左：ペアを 1 つずつ連鎖させると姿勢誤差が積み重なり（真値への最良の相似変換の後で RMS 誤差 0.222 m）、箱と球がぼやけます。中右：大域整列は誤差をすべてのペアに分散させます（0.078 m）。右：30 回の反復での重み付き RMS 残差。2° の誤差はどの単一の世界とも両立しないので、横ばいになります。" %}

これは SLAM のループ閉じ込み（[第 6 回]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})）や大域型 SfM（第 5 回）と同じ話です。局所的な推定を連鎖させると誤差が積み重なり、すべての拘束にわたる大域的な最適化がそれを分散させます。これは DUSt3R のボトルネックでもあります。すべてのペアを使うとネットワークの実行回数は画像数の 2 乗で増え（より疎なペアのグラフは助けになりますが拘束が減ります）、最適化にも時間がかかります。次の世代はこれを取り除きました。

### 7.4 MASt3R：3 次元の上でのマッチング

**MASt3R**（Leroy、Cabon、Revaud、ECCV 2024）は、画素ごとに密な局所記述子を出力するヘッドを加え、対照的なマッチング損失で学習し、データが許す場合はポイントマップを計量的なスケールで学習します。画素のマッチは記述子空間での最近傍から得られ、高速な粗密の相互マッチング方式で精緻化され、ポイントマップだけから読み取ったマッチよりはるかに正確です。**MASt3R-SfM**（3DV 2025）はこれらのマッチの上に完全な SfM パイプラインを構築し、エンコーダの特徴で画像検索を行い、2 段階（3 次元マッチング、次に 2 次元再投影）の大域最適化を行います。純粋な回転やごく少数の画像のように、古典的な SfM が失敗する場合にも機能します。**MASt3R-SLAM**（CVPR 2025）は同じ事前知識を使い、約 15 フレーム毎秒の密な単眼 SLAM を実現しています。

### 7.5 VGGT：1 回のパスで多視点

**VGGT**（Wang ら、CVPR 2025 最優秀論文）は大きな Transformer で、1 枚から数百枚の画像を一度に受け取り、各画像についてカメラの内部・外部パラメータ、深度マップ、ポイントマップ、点追跡のための特徴を、後処理の最適化なしに予測します。構造は、パッチトークンの上で 2 種類のアテンションを交互に使います。各画像内の**フレームごとの**アテンションと、全画像にわたる**大域的な**アテンションで、これにより視点間で各層ごとに情報が交換されます。各画像にはさらにカメラトークンがあり、小さなヘッドがそこからカメラを回帰します。最初の画像が世界座標系を定めます。

論文の 2 つの発見は覚えておく価値があります。深度とカメラを予測して逆投影する方が、モデル自身の直接的なポイントマップヘッドよりも正確な 3 次元点を与えること。これは、分解された出力（深度とカメラ、第 1 回と第 7 回の古典的なパラメータ化）の方が生の点より学習しやすいことを示しています。そして、その予測が古典的なバンドル調整のよい初期値になり、バンドル調整でさらに改善することです。フィードフォワードと最適化は競合ではなく補完の関係にあります。

### 7.6 2025〜2026 年の後継（2026 年 11 月時点）

この分野は動きが速いので、次の表は各研究の状態（2026 年 11 月時点）のスナップショットです。論文や著者のリポジトリから採択先を確認できなかったものは、表にそう記しています。

| 研究 | 状態 | 考え方 |
| --- | --- | --- |
| Fast3R（Yang ら） | CVPR 2025 | DUSt3R を 1 回のパスで多視点に一般化。プロジェクトは 1000 枚以上の画像を報告し、大域整列は不要 |
| CUT3R（Wang ら） | CVPR 2025 | 新しい画像ごとに更新される永続的な状態を持つ再帰モデル。計量的なポイントマップをオンラインで出力 |
| MASt3R-SLAM（Murai ら） | CVPR 2025 | MASt3R の 2 視点の事前知識による実時間の密な SLAM |
| MonST3R（Zhang ら） | ICLR 2025 | 動的シーンのための時刻ごとのポイントマップ |
| StreamVGGT（Zhuo ら） | ICLR 2026（著者のリポジトリによる。arXiv 2025 年 7 月） | キーと値をキャッシュする因果的な VGGT。VGGT から蒸留し、ストリーミング入力に対応 |
| $\pi^3$（Wang ら） | ICLR 2026（著者のリポジトリによる） | 置換同変：参照視点なし。アフィン不変な姿勢とスケール不変な局所ポイントマップを予測 |
| MapAnything（Keetha ら） | 3DV 2026 | 画像と任意の追加入力（内部パラメータ、姿勢、深度）から計量的な再構成。出力は深度マップ、レイマップ、姿勢、計量スケールに分解 |
| Depth Anything 3（Lin ら） | arXiv プレプリント、2025 年 11 月（採択先は未確認） | 素の Transformer と単一の深度・レイの目標で、任意の枚数の視点（姿勢の有無を問わず）に対応 |
| LongStream（Cheng ら） | 2026 年。状態は未確認 | キーフレーム相対の姿勢と分離したスケールで、キロメートル規模の系列をストリーミング再構成 |

表には 3 つの流れが見て取れます。**出力のパラメータ化**は生のポイントマップから分解された出力（深度、レイまたはカメラ、スケール）へと移っており、VGGT の発見と呼応しています。**参照座標系**は取り除かれる（$\pi^3$）か相対的になっています（LongStream）。すべてを最初の画像に固定すると、長い入力や順序のない入力で不利になるからです。そして、メモリを有界に保つ**ストリーミング**版（CUT3R、StreamVGGT、LongStream、2026 年の多数のプレプリント）が、これらのモデルを SLAM のような状況に持ち込んでいます。

### 7.7 フィードフォワードモデルが与えるもの、与えないもの

これらのモデルは、数秒で、少数の画像から、キャリブレーションなしにカメラと密な幾何を与え、測光的整合性では手が出ないテクスチャのない領域も事前知識で埋めます。与えないのは保証です。学習データと似ていないシーンでは、ネットワークは自信満々に間違えることがありますし、スケールの質は計量的な学習データ次第で、高解像度の画像が多数ある大規模シーンでは、精度は今のところ丁寧に実行した COLMAP と MVS におおむね及びません。2026 年の現実的なレシピはハイブリッドです。フィードフォワードモデルで初期化し、バンドル調整（第 5 回）で精緻化し、表面が必要なら第 2〜6 節の最適化手法のいずれかを使います。

## 8. 評価

### 8.1 精度、完全性、F 値

再構成した表面 $\mathcal R$ と真の表面 $\mathcal G$ が、どちらも密にサンプルされているとします。2 つの距離が 2 つの異なる問いに答えます。

$$
\text{acc} = \frac{1}{\lvert\mathcal R\rvert}\sum_{\mathbf r\in\mathcal R} \min_{\mathbf g\in\mathcal G}\lVert\mathbf r - \mathbf g\rVert,
\qquad
\text{comp} = \frac{1}{\lvert\mathcal G\rvert}\sum_{\mathbf g\in\mathcal G} \min_{\mathbf r\in\mathcal R}\lVert\mathbf g - \mathbf r\rVert .
$$

**精度**（accuracy）は再構成したものが正しいかを、**完全性**（completeness）はすべてを再構成したかを問います。両者の平均が DTU で報告される **Chamfer 距離**です。平均距離は少数の遠い外れ値に敏感なので、Tanks and Temples と ETH3D は代わりにしきい値を使います。許容誤差 $\tau$ について、

$$
P(\tau) = \frac{\lvert\{\mathbf r \in\mathcal R: d(\mathbf r, \mathcal G) < \tau\}\rvert}{\lvert\mathcal R\rvert},
\qquad
R(\tau) = \frac{\lvert\{\mathbf g \in\mathcal G: d(\mathbf g, \mathcal R) < \tau\}\rvert}{\lvert\mathcal G\rvert},
\qquad
F(\tau) = \frac{2PR}{P + R} .
$$

適合率 $P$ はあるべきでない表面（浮遊物、勝手に埋めた部分）を罰し、再現率 $R$ は欠けた表面を罰し、調和平均 $F$ は両方が高いときだけ高くなります。

```python
def evaluate(rec, gt, tau):
    """Accuracy and completeness (mean distances), and precision, recall and F-score at tau."""
    d_rec = cKDTree(gt).query(rec)[0]            # reconstruction -> ground truth
    d_gt = cKDTree(rec).query(gt)[0]             # ground truth -> reconstruction
    P, R = (d_rec < tau).mean(), (d_gt < tau).mean()
    return dict(acc=d_rec.mean(), comp=d_gt.mean(), P=P, R=R, F=2 * P * R / max(P + R, 1e-12))


xs_f, Pf = make_grid(1600)                       # ground truth: the zero level set at 2 mm
gt = sample_segments(marching_squares(scene_sdf(Pf).reshape(1600, 1600), xs_f))
xs, F, Wt = tsdf_fuse(arc_scans)
recs = {"TSDF": sample_segments(marching_squares(F, xs, Wt > 0))}
for alpha in (0.0, 32.0):
    chi, iso = screened_poisson(P_arc, N_arc, xs, alpha)
    recs["Poisson a=%g" % alpha] = sample_segments(marching_squares(chi - iso, xs))
for name, rec in recs.items():
    for tau in (0.01, 0.02, 0.05):
        m = evaluate(rec, gt, tau)
        print("%-13s tau = %2.0f mm: acc %5.1f mm, comp %5.1f mm, P %.3f, R %.3f, F %.3f"
              % (name, 1000 * tau, 1000 * m["acc"], 1000 * m["comp"], m["P"], m["R"], m["F"]))
```

```text
TSDF          tau = 10 mm: acc   4.1 mm, comp  15.4 mm, P 0.935, R 0.853, F 0.892
TSDF          tau = 20 mm: acc   4.1 mm, comp  15.4 mm, P 0.978, R 0.887, F 0.930
TSDF          tau = 50 mm: acc   4.1 mm, comp  15.4 mm, P 0.999, R 0.913, F 0.954
Poisson a=0   tau = 10 mm: acc  60.5 mm, comp  34.1 mm, P 0.466, R 0.483, F 0.474
Poisson a=0   tau = 20 mm: acc  60.5 mm, comp  34.1 mm, P 0.628, R 0.637, F 0.633
Poisson a=0   tau = 50 mm: acc  60.5 mm, comp  34.1 mm, P 0.754, R 0.776, F 0.765
Poisson a=32  tau = 10 mm: acc  22.8 mm, comp  17.6 mm, P 0.738, R 0.759, F 0.748
Poisson a=32  tau = 20 mm: acc  22.8 mm, comp  17.6 mm, P 0.791, R 0.823, F 0.806
Poisson a=32  tau = 50 mm: acc  22.8 mm, comp  17.6 mm, P 0.870, R 0.903, F 0.886
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/09-fscore.svg" localized="true" caption="第 4 節の円弧からの再構成の評価。左の 2 枚：再構成した点を真値までの距離で色分けしたもので、灰色は 2 cm を超えて取りこぼした真の表面です。TSDF は見えていない側を取りこぼしますが、再構成した部分は正確です。スクリーン付きポアソンは穴を閉じますが、閉じた部分（黄色）は 40 mm 以上ずれています。右：適合率（破線）、再現率（点線）、F 値（実線）を $\tau$ に対して描いたもの。$\tau$ = 2 cm で TSDF は P = 0.978、R = 0.887、F = 0.930、スクリーン付きポアソンは P = 0.791、R = 0.823、F = 0.806 です。" %}

これらの数値は第 4 節のトレードオフを正確に表しています。スクリーン付きポアソンが埋めた穴は、2 cm の許容誤差では再現率を稼ぎません。推測した表面が 2 cm 以上ずれているからです。それでいて適合率は下がります。5 cm でも再現率（0.903）は TSDF（0.913）をわずかに下回ります。素朴なポアソンはずっと悪い結果です（2 cm で F = 0.633）。言い換えれば、水密なメッシュは製品としての要件であって品質の尺度ではありません。公平な比較では必ず $\tau$ を明記し、$P$ と $R$ の両方を報告します。

実際の評価には、おもちゃの例には不要ないくつかの手順が加わります。まず再構成を真値に**位置合わせ**し（与えられたカメラを使うか、スケールが未知の手法なら相似変換と ICP で）、真値が存在する領域に**切り出し**、真値を入力カメラから見える部分に制限します（そうしないと、見えていない部分を補完してしまう DUSt3R 系の手法が不当に有利または不利になります）。

### 8.2 ベンチマーク

| ベンチマーク | シーン | 真値 | 主な指標 |
| --- | --- | --- | --- |
| DTU（Aanæs ら、IJCV 2016） | 実験室内の卓上シーン 124 個、それぞれ 49 または 64 の校正済み視点、7 種類の照明 | 構造化光スキャン | 精度、完全性とその平均（Chamfer、mm 単位）。ニューラル表面の論文は物体マスク付きの 15 スキャンのサブセットで報告するのが普通 |
| Tanks and Temples（Knapitsch ら、ACM TOG 2017） | 大規模な屋内外のシーン、動画入力、intermediate と advanced の 2 組 | 産業用レーザースキャナ | シーンごとの $\tau$ での適合率、再現率、F 値 |
| ETH3D（Schöps ら、CVPR 2017） | 高解像度の一眼レフ画像とマルチカメラ動画、屋内外 | レーザースキャン | 複数の許容誤差での F1 スコア。2 cm が代表値としてよく使われる |

DTU はきれいで物体中心なので、ニューラル表面の標準になりました。Tanks and Temples と ETH3D は、現実の大きく雑然としたシーンでパイプライン全体を試します。フィードフォワードモデルは通常、予測したカメラの質でも評価されます。視点ペア間の相対回転と相対並進の角度誤差を、あるしきい値までの精度曲線の下の面積でまとめたもの（たとえば CO3D や RealEstate10K での AUC@30）と、相似変換で位置合わせした後のポイントマップや深度の精度です。

## 9. 手法の選び方

| 状況 | 2026 年の妥当な既定値 | 理由 |
| --- | --- | --- |
| RGB-D カメラ、実時間 | ボクセルハッシング付きの TSDF 融合（KinectFusion 系、Open3D） | 深度は与えられている。融合は局所的で頑健かつ高速 |
| 多数の写真、最高の精度 | COLMAP または GLOMAP、PatchMatch MVS、融合、ポアソンまたは Delaunay によるメッシュ化 | 各段が成熟しており、数千枚の画像まで拡張できる |
| 同上だが、速度より滑らかで精細な表面が大事 | COLMAP のカメラ上で Neuralangelo、2DGS、Gaussian Opacity Fields | 同時最適化により、テクスチャの弱い領域を滑らかな事前知識で埋める |
| 写真が少ない、カジュアルな撮影、カメラ未知 | VGGT、MASt3R(-SfM)、$\pi^3$、MapAnything、Depth Anything 3 の後にバンドル調整 | 事前知識が重なりやテクスチャの不足を補う。数分ではなく数秒 |
| 動画ストリーム、オンライン | MASt3R-SLAM、CUT3R、ストリーミング版 VGGT。保証が必要なら古典的な SLAM（第 6 回） | メモリが有界で、逐次的に出力 |
| 印刷やシミュレーション用の閉じたメッシュ | 向き付き点にスクリーン付きポアソン、その後に切り取り | 常に水密。スクリーニングでデータの近くに保たれる |

## 試してみよう

- 第 2 節の **TSDF ウィジェット**で、片側だけから 4 回スキャンし、「重みを表示」をオンにしてください。場が何も知らない場所が見えます。次に $\mu$ を 20 cm にして周回させると棒が膨らんで形を失いますが、スキャンし直さずに $\mu$ を下げるだけで元に戻ります。
- 第 6 節の **NeuS ウィジェット**で $\theta = 70°$ とし、$s$ を変えながら素朴なピークを理論値と比べてください。次に板に切り替え、$n$ を 16 に減らして $s$ を大きくしてみましょう。どの $s$ から、各表面が重みをすべて 1 つの区間に入れてしまい、その位置がサンプル間隔 1 つ分の精度でしかわからなくなるでしょうか。
- ホームページの[インタラクティブラボ]({{ '/' | relative_url }}#lab)には、3 次元ガウシアンスプラッティングのビューアである Gaussian World があります。2DGS や、[3DGS のフロンティアの回]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})のフィードフォワード型ガウシアン手法が生み出すのはこの表現です。
- 机の上の物体を 30 枚撮影して第 5 節の COLMAP コマンドを実行し、ポアソンと Delaunay のメッシュを比べてください。さらに、公式リポジトリからフィードフォワードモデルを 1 つ取ってきて、そのうち 5 枚で試してみましょう。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Marching cubes: a high resolution 3D surface construction algorithm (Lorensen, Cline) | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37401.37422) | 格子からの等値面抽出 |
| A volumetric method for building complex models from range images (Curless, Levoy) | SIGGRAPH | 1996 | [DOI](https://doi.org/10.1145/237170.237269) | 累積重み付き符号付き距離：TSDF 融合 |
| Poisson surface reconstruction (Kazhdan, Bolitho, Hoppe) | SGP | 2006 | [DOI](https://doi.org/10.2312/SGP/SGP06/061-070) | 向き付き点から水密な表面 |
| KinectFusion: real-time dense surface mapping and tracking (Newcombe et al.) | ISMAR | 2011 | [DOI](https://doi.org/10.1109/ISMAR.2011.6092378) | ICP トラッキング付きの実時間 TSDF 融合 |
| Screened Poisson surface reconstruction (Kazhdan, Hoppe) | ACM TOG | 2013 | [DOI](https://doi.org/10.1145/2487228.2487237) | サンプル位置での補間制約 |
| Real-time 3D reconstruction at scale using voxel hashing (Nießner et al.) | ACM TOG (SIGGRAPH Asia) | 2013 | [DOI](https://doi.org/10.1145/2508363.2508374) | ハッシュテーブルに格納する疎な TSDF ブロック |
| Large-scale data for multiple-view stereopsis (Aanæs et al.) | IJCV | 2016 | [DOI](https://doi.org/10.1007/s11263-016-0902-9) | DTU ベンチマーク |
| Pixelwise view selection for unstructured multi-view stereo (Schönberger et al.) | ECCV | 2016 | [DOI](https://doi.org/10.1007/978-3-319-46487-9_31) | COLMAP の MVS と深度マップ融合 |
| Tanks and Temples: benchmarking large-scale scene reconstruction (Knapitsch et al.) | ACM TOG | 2017 | [DOI](https://doi.org/10.1145/3072959.3073599) | パイプライン全体の F 値による評価 |
| A multi-view stereo benchmark with high-resolution images and multi-camera videos (Schöps et al.) | CVPR | 2017 | [CVF](https://openaccess.thecvf.com/content_cvpr_2017/html/Schops_A_Multi-View_Stereo_CVPR_2017_paper.html) | ETH3D ベンチマーク |
| Implicit geometric regularization for learning shapes (Gropp et al.) | ICML | 2020 | [arXiv](https://arxiv.org/abs/2002.10099) | アイコナール正則化 |
| NeuS: learning neural implicit surfaces by volume rendering for multi-view reconstruction (Wang et al.) | NeurIPS | 2021 | [arXiv](https://arxiv.org/abs/2106.10689) | 不偏で遮蔽を考慮する SDF のレンダリング |
| Volume rendering of neural implicit surfaces (Yariv et al.) | NeurIPS | 2021 | [arXiv](https://arxiv.org/abs/2106.12052) | VolSDF：SDF からラプラス CDF の密度 |
| Neuralangelo: high-fidelity neural surface reconstruction (Li et al.) | CVPR | 2023 | [arXiv](https://arxiv.org/abs/2306.03092) | 数値勾配を使うハッシュ格子 SDF |
| DUSt3R: geometric 3D vision made easy (Wang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.14132) | 画像ペアからのポイントマップ、大域整列 |
| Grounding image matching in 3D with MASt3R (Leroy et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2406.09756) | 3 次元モデル上の密なマッチングヘッド |
| 2D Gaussian splatting for geometrically accurate radiance fields (Huang et al.) | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2403.17888) | サーフェル。レンダリング深度の TSDF 融合でメッシュ |
| MASt3R-SfM: a fully-integrated solution for unconstrained structure-from-motion (Duisterhof et al.) | 3DV | 2025 | [arXiv](https://arxiv.org/abs/2409.19152) | MASt3R の上に構築した SfM |
| VGGT: visual geometry grounded transformer (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2503.11651) | 1 回のパスで多視点のカメラ、深度、点、追跡 |
| Fast3R: towards 3D reconstruction of 1000+ images in one forward pass (Yang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.13928) | 大域整列のいらない多視点 DUSt3R |
| Continuous 3D perception model with persistent state (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.12387) | CUT3R：再帰的なオンライン再構成 |
| MASt3R-SLAM: real-time dense SLAM with 3D reconstruction priors (Murai et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2412.12392) | SLAM システムの中のフィードフォワード事前知識 |
| $\pi^3$: permutation-equivariant visual geometry learning (Wang et al.) | ICLR（著者のリポジトリによる） | 2026 | [arXiv](https://arxiv.org/abs/2507.13347) | 参照視点なし |
| MapAnything: universal feed-forward metric 3D reconstruction (Keetha et al.) | 3DV | 2026 | [arXiv](https://arxiv.org/abs/2509.13414) | 計量的な出力、任意の幾何入力 |
| Depth Anything 3: recovering the visual space from any views (Lin et al.) | arXiv プレプリント（採択先は未確認） | 2025 | [arXiv](https://arxiv.org/abs/2511.10647) | 1 つの Transformer、深度・レイの目標 |
| LongStream: long-sequence streaming autoregressive visual geometry (Cheng et al.) | 状態は未確認 | 2026 | （リンク未確認） | キロメートル規模のストリーミング |

## 学習リソース

- R. Szeliski, *Computer Vision: Algorithms and Applications*, 第 2 版, 2022 の第 12 章（深度推定）と第 13 章（3 次元再構成：表面の表現、ボリューム融合、モデルベースの再構成）。個人利用なら [szeliski.org/Book](https://szeliski.org/Book/) で無料で読めます。
- COLMAP のドキュメント：[コマンドラインインターフェース](https://colmap.github.io/cli.html)と[チュートリアル](https://colmap.github.io/tutorial.html)。第 5 節の各コマンドが説明されています。
- [Open3D](https://www.open3d.org/)：RGB-D 系列の TSDF 融合、法線推定、ポアソン再構成を数回の呼び出しで行えます。[PoissonRecon](https://github.com/mkazhdan/PoissonRecon) はスクリーン付きポアソンのリファレンス実装で、切り取りツールも付いています。
- ニューラル手法とフィードフォワード手法のコード：[Totoro97/NeuS](https://github.com/Totoro97/NeuS)、[NVlabs/neuralangelo](https://github.com/NVlabs/neuralangelo)、[hbb1/2d-gaussian-splatting](https://github.com/hbb1/2d-gaussian-splatting)、[naver/dust3r](https://github.com/naver/dust3r)、[naver/mast3r](https://github.com/naver/mast3r)、[facebookresearch/vggt](https://github.com/facebookresearch/vggt)。
- ベンチマーク：[DTU robot image data](https://roboimagedata.compute.dtu.dk/)、[Tanks and Temples](https://www.tanksandtemples.org/)、[ETH3D](https://www.eth3d.net/)。

## 演習

1. 深度の読みが標準偏差 $\sigma\_k$ のガウス分布に従い、すべて打ち切り帯の内側にあるとき、重み $w\_k = 1/\sigma\_k^2$ の TSDF 更新がボクセルでの符号付き距離の最尤推定になることを示してください。一部の読みが帯の外側に落ちると、何がまずいでしょうか。

   <details markdown="1"><summary>ヒント</summary>

   $F$ の尤度は $\prod\_k \exp(-(F - \eta\_k)^2/(2\sigma\_k^2))$ です。その対数を最大化してください。表面をボクセルより $\mu$ 以上手前に置く読み（$\eta\_k < -\mu$）は飛ばされ、$\eta\_k > \mu$ の読みは切り詰められるので、残りは打ち切られた標本になります。表面上のボクセルでは飛ばされる読みはすべて負なので、平均は大きい側に偏り、融合された表面はカメラから遠ざかる方向へずれます。$\mu$ が $\sigma$ の何倍かでなければならないのはこのためです。
   </details>

2. `tsdf_integrate` の射影的な距離を、逆投影したスキャン点までの真の距離（スキャンのうちボクセルに最も近い点まで、符号は $\eta$ の符号）に置き換えてください。64 回のスキャンを両方の版で融合し、精度を比べてください。2 つの場はどこで最も異なり、それはゼロ交差に影響するでしょうか。

   <details markdown="1"><summary>ヒント</summary>

   各スキャンの逆投影点で `cKDTree` を作ります。2 つの場が最も異なるのは表面を斜めから見ているところ（そこでは射影的な距離が真の距離の約 $1/\cos\theta$ 倍になります）と深度の不連続の近くです。ゼロ交差はほとんど動きません。違いが効くのは打ち切り（射影的な帯は斜めの表面で実質的に薄くなります）と、スフィアトレーシングのように場の値を距離として使う手法です。
   </details>

3. 平面に対する素朴な密度の偏りを導出し、正面での値 $-0.481/s$ を確かめてください。入射角 60° で偏りを 1 mm 未満にするには $s$ はどれだけ必要でしょうか。それが実際には問題の解決にならないのはなぜでしょうか。

   <details markdown="1"><summary>ヒント</summary>

   第 6.2 節のように条件 $\sigma' = \sigma^2$ を使います。60° では $c = 0.5$、$\Phi^\ast = 0.707$、$\ln(\Phi^\ast/(1 - \Phi^\ast)) = 0.881$ なので偏りは $1.76/s$ で、$s > 1760$（1 m あたり）が必要です。これほど鋭い密度では重みが 1 mm 幅の帯に集中し、そこに落ちるサンプルがほとんどなくなって勾配が消えます。学習は小さな $s$ から始めなければならず、そのときこそ偏りが大きいのです。
   </details>

4. `fit_neus` を拡張し、アイコナール項を現在のゼロ等値線の近くだけで評価するか、物体の内部では重みを小さくしてください。箱の内部の偽の輪郭は消えるでしょうか。このことは、ニューラル SDF のどの部分がデータで拘束されているかについて何を教えてくれるでしょうか。

   <details markdown="1"><summary>ヒント</summary>

   光線の重みが飽和する前に光線が届かないセルは、レンダリング損失から勾配を受け取らず、正則化項だけで形作られます。至るところに課したアイコナール項はそれらをある距離関数に近づけますが、正しいものとは限りません。実際の実装の多くは、アイコナール項をバウンディングボリューム全体でサンプルし、内部が最初から負になるよう球で初期化しています。
   </details>

5. ポイントマップのコードで、Procrustes による姿勢を PnP に置き換えてください。$X^{2,1}$ をカメラ 1 の座標系での既知の 3 次元点、画像 2 の画素をその投影とみなし、RANSAC ループの中で $P$ の DLT によりカメラ 2 を求めます（PnP は第 5 回で扱います）。回転と並進の誤差を Procrustes の結果と比べてください。

   <details markdown="1"><summary>ヒント</summary>

   $3\times 4$ の DLT にはサンプルごとに 6 点が必要です。画像 2 の画素格子と既知の $K$（または Weiszfeld で推定した焦点距離）を使います。PnP は 2 つ目のポイントマップの雑音入り 3 次元点ではなく正確な 2 次元の画素位置を使うので、並進の向きはふつう改善します。DUSt3R の著者が両方の方法に触れているのはこのためです。
   </details>

6. 第 6.4 節の NeuS の再構成と、同じカメラによる 24 回のスキャンの TSDF 融合について、$\tau$ = 2 cm での精度、完全性、F 値を計算してください。どちらがより完全で、それはなぜでしょうか。

   <details markdown="1"><summary>ヒント</summary>

   `evaluate(sample_segments(marching_squares(g_fit, xs_n)), gt, 0.02)` と、`[(R, t, render_depth(R, t)) for R, t in orbit(24)]` に対する `tsdf_fuse` を使います。ここでは NeuS に雑音のない深度を与えたので、雑音のない TSDF とも比べてください。両者は同じ表面を見ています。違いは格子の解像度（3.4 cm と 2.5 cm）、NeuS の当てはめの内部の偽の輪郭、そしてアイコナール項による箱の角の平滑化から来ます。
   </details>

**次回：**[第 10 回]({{ '/blog/2026/3d-vision-10-3d-vision-for-ar-vr/' | relative_url }})でシリーズを締めくくり、AR/VR ヘッドセットの 3 次元ビジョンを扱います。インサイドアウトのトラッキング、シーン理解、空間アンカー、そして仮想物体がその場にとどまるかどうかを決める遅延の予算です。
