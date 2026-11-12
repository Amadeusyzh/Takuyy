---
layout: post
title: "奥行き推定とマルチビューステレオ：センサー、平面掃引、PatchMatch、学習型 MVS、単眼深度"
date: 2026-10-27 11:07:00+0900
description: "姿勢付き画像から密な奥行きへ：奥行き・距離・視差、ステレオ、構造化光、Time-of-Flight、LiDAR の各センサー、コストボリュームによる平面掃引ステレオ、傾いた平面を使う PatchMatch マルチビューステレオ、MVSNet と soft-argmin、MiDaS から Depth Anything、メトリック深度モデルまでの単眼深度推定、TSDF による奥行き統合を、各ステップの NumPy コード付きで解説します。"
categories: 3d-vision
tags: [depth-estimation, multi-view-stereo, plane-sweep, patchmatch, mvsnet, monocular-depth, tsdf, time-of-flight, structured-light]
series: 3d-vision
series_order: 7
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 5 回]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})を終えた時点で、私たちは大量の写真からすべてのカメラ（$K$、$R$、$\mathbf t$）と、特徴トラック 1 本につき 1 点の疎な点群を復元できます。[第 6 回]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})は同じことをリアルタイムで行います。しかし数千個の点は表面ではありません。ロボットはその上で把持を計画できず、AR ヘッドセットは仮想物体をその後ろに隠せず、3D アーティストはそれをメッシュにできません。本記事は「カメラが分かっている」と「形状が分かっている」の間を埋めます。問いは**すべての画素**について一つです。この画素が見ている表面はどれだけ遠いのか。

答え方は三つあり、それぞれを実装します。

1. 能動センサーで**測る**：構造化光プロジェクター、Time-of-Flight（ToF）カメラ、LiDAR。
2. 姿勢付きの複数画像から**密に三角測量する**：平面掃引ステレオ（plane-sweep stereo）、PatchMatch マルチビューステレオ（multi-view stereo、MVS）、そして MVSNet などの学習型版。
3. 何百万ものシーンを見てきたネットワークで **1 枚の画像から推測する**：単眼深度推定（MiDaS、Depth Anything、メトリック深度モデル）。

最後に、多数の視点からの多数の奥行きマップを**打ち切り符号付き距離関数**（truncated signed distance function、TSDF）で一つの整合したモデルに統合します。以降のすべての話題がこれを土台にしています。[第 8 回]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})の 3D 表現、[第 9 回]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})の復元パイプライン、NeRF や 3D Gaussian Splatting の学習に使う奥行き事前分布、そして[第 10 回]({{ '/blog/2026/3d-vision-10-3d-vision-for-ar-vr/' | relative_url }})の AR ヘッドセットのシーンメッシュです。

[ニューラルレンダリング第 1 回]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})はマルチビューステレオを一段落で説明しています。本記事ではそれを開き、正確な真値を持つ合成シーンですべてのアルゴリズムを実行し、どの主張にも数字を添えます。

## 前提知識

- [第 1 回]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})のピンホールカメラ $\tilde{\mathbf x} \sim K(R\mathbf X + \mathbf t)$、同次座標、OpenCV のカメラ座標系（x 右、y 下、z 前）。
- [第 2 回]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})のホモグラフィと、キャリブレーションボードが誘導する平面ホモグラフィ。
- [第 3 回]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})のパッチ類似度と開口問題。
- [第 4 回]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})のエピポーラ幾何、平行化ステレオ、視差、セミグローバルマッチング。必要な部分は簡単に振り返ります。
- 5、6 節では深層学習の基礎（CNN、softmax、回帰損失）。

**記法。** これまでと同様、世界点 $\mathbf X$ はカメラ座標 $\mathbf X\_c = R\mathbf X + \mathbf t$ に、さらに画素 $\tilde{\mathbf x} \sim K\mathbf X\_c$（$\tilde{\mathbf x} = (x, y, 1)^\top$）に写ります。1 枚の画像を**参照視点**（reference view、添字 r）と呼んでその奥行きマップを求め、残りを**ソース視点**（source view、添字 s）と呼びます。$z$ は奥行き（$\mathbf X\_c$ の第 3 成分）、$w = 1/z$ は逆奥行き、$D$ は奥行き仮説の数、$\mathbf n$ は平面の法線、$d$ は平面のオフセットです。

## 1. 奥行きマップとは

### 1.1 奥行き、距離、視差、逆奥行き

**奥行きマップ**（depth map）は画素ごとに一つの数を持ちます。よく使われる数は三種類あり、混同は古典的なバグです。

- **z 奥行き** $z$：3D 点の光軸方向の座標。OpenCV、COLMAP、ほとんどのデータセットとネットワークが保存するのはこれです。
- **距離**（range）$\rho$：カメラ中心から画素の光線に沿って点までのユークリッド距離。LiDAR と一部の ToF カメラは距離を出力します。
- **視差**（disparity）$\delta$：焦点距離 $f$、基線長 $B$ の平行化ステレオ対での水平方向の画素ずれ $\delta = fB/z$。**逆奥行き** $w = 1/z$ に比例します。

逆投影は z 奥行きマップを 3D 点に変えます。画素 $\tilde{\mathbf x}$ を通る光線は $\mathbf r = K^{-1}\tilde{\mathbf x}$ で、$K^{-1}$ は $(x, y, 1)$ を第 3 成分が 1 のベクトルに写すので、奥行き $z$ の点は単に

$$
\mathbf X_c = z\,K^{-1}\tilde{\mathbf x}, \qquad \rho = \lVert \mathbf X_c \rVert = z\,\lVert K^{-1}\tilde{\mathbf x} \rVert .
$$

係数 $\lVert K^{-1}\tilde{\mathbf x}\rVert = \sqrt{1 + ((x - c\_x)/f\_x)^2 + ((y - c\_y)/f\_y)^2}$ は主点で 1 になり、隅に向かって大きくなります。テスト用カメラ（$160 \times 120$ 画素、$f = 150$）では隅の画素で $\sqrt{1 + (79.5/150)^2 + (59.5/150)^2} = 1.1993$、つまり距離と z 奥行きが 20% 違います。距離画像を z 奥行きとして扱うと、あらゆる平面がお椀状に曲がります。

このコードは 1.2 節のテストシーン（`K`、`Z_gt`、`R_ref`、`t_ref`）を使います。記事のコードを順に実行するときは、先に 1.2 節のシーンのコードブロックを実行してください。

```python
def backproject(depth, K):
    """z-depth map (H, W) -> 3D points (H, W, 3) in the camera frame: X = z K^-1 (x, y, 1)."""
    h, w = depth.shape
    ys, xs = np.mgrid[0:h, 0:w]
    rays = np.stack([xs, ys, np.ones_like(xs)], -1) @ np.linalg.inv(K).T   # rays with z = 1
    return rays * depth[..., None]


X_cam = backproject(Z_gt, K)
rng_len = np.linalg.norm(X_cam, axis=-1)                 # distance along the ray ("range")
print("pixel (0, 0):   z = %.3f m, range = %.3f m, ratio %.4f"
      % (Z_gt[0, 0], rng_len[0, 0], rng_len[0, 0] / Z_gt[0, 0]))
print("pixel (80, 60): z = %.3f m, range = %.3f m" % (Z_gt[60, 80], rng_len[60, 80]))
X_world = (X_cam - t_ref) @ R_ref                        # X = R^T (X_c - t), row-wise
print("lowest floor point: world y = %.3f m (the floor is y = 1.2)" % X_world[..., 1].max())
```

出力：`pixel (0, 0): z = 6.119 m, range = 7.339 m, ratio 1.1993`、`pixel (80, 60): z = 6.663 m, range = 6.664 m`（主点 $(79.5, 59.5)$ のすぐ隣では両者が一致）、そして `lowest floor point: world y = 1.200 m`。逆投影した点はちょうど床面に乗っており、座標規約のよい確認になります。

### 1.2 テストシーン

本記事のすべてのアルゴリズムは、小さな NumPy レイキャスターで描画した同じ合成シーンで動きます。テクスチャ付きの床から 1.8 m の高さにあるカメラが、6.5 m 先のテクスチャ付きの壁を見ています。手前には箱と球があります。壁には意図的に難しい領域を二つ置きました。テクスチャのまったくない**灰色のポスター**と、周期 0.3 m の**縦縞**です。すべての表面はランバート面（どの方向から見ても同じ明るさ）なので、ステレオの「光度一貫性」の仮定が厳密に成り立ちます。各画像には $\sigma = 0.01$ のガウスノイズを加えます。

参照カメラ（$160 \times 120$ 画素、$f = 150$ px、水平画角約 56°）が見る奥行きは 2.93 m から 6.73 m です。4 台のソースカメラがその周りにあり、すべて同じ点を見ています。右 0.40 m、左 0.25 m、上 0.30 m、下 0.28 m（わずかな横方向のずれ付き）です。コードは長いですが素直です。自分で本記事を実行したい場合は開いてください。

<details markdown="1"><summary>シーンとレンダラー（NumPy）</summary>

```python
import numpy as np
from scipy import ndimage as ndi

W, H, F = 160, 120, 150.0                       # image size and focal length (pixels)
K = np.array([[F, 0, (W - 1) / 2], [0, F, (H - 1) / 2], [0, 0, 1.0]])
LIGHT = np.array([-0.4, -0.7, -0.6]) / np.linalg.norm([-0.4, -0.7, -0.6])
_lat = np.random.default_rng(7).uniform(0, 1, (64, 64))


def value_noise(u, v):
    """Random texture in [0, 1]: 3 octaves of bilinearly interpolated lattice noise."""
    out = np.zeros_like(u)
    for freq, amp in ((3.0, 0.3), (8.0, 0.35), (18.0, 0.35)):
        x, y = u * freq, v * freq
        x0, y0 = np.floor(x), np.floor(y)
        fx, fy = x - x0, y - y0
        i, j = x0.astype(int) % 64, y0.astype(int) % 64
        a, b = _lat[j, i], _lat[j, (i + 1) % 64]
        c, d = _lat[(j + 1) % 64, i], _lat[(j + 1) % 64, (i + 1) % 64]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy)
    return np.clip(0.5 + 2.0 * (out - 0.5), 0.0, 1.0)              # stretch the contrast


def look_at(C, target, up=(0.0, -1.0, 0.0)):
    """World-to-camera R, t (OpenCV axes: x right, y down, z forward) of a camera at C."""
    z = np.asarray(target, float) - C
    z /= np.linalg.norm(z)
    x = np.cross(z, up)
    x /= np.linalg.norm(x)
    R = np.stack([x, np.cross(z, x), z])
    return R, -R @ C


def wall_albedo(P):
    a = 0.15 + 0.8 * value_noise(0.5 * P[:, 0] + 3.1, 0.5 * P[:, 1] + 5.3)
    poster = (P[:, 0] > 0.2) & (P[:, 0] < 2.2) & (P[:, 1] > -1.8) & (P[:, 1] < -0.7)
    a[poster] = 0.62                                               # textureless poster
    st = (P[:, 0] > -3.0) & (P[:, 0] < -1.1) & (P[:, 1] > -1.8) & (P[:, 1] < -0.4)
    a[st] = 0.3 + 0.4 * (np.sin(2 * np.pi * P[st, 0] / 0.3) > 0)   # vertical stripes
    return a


def intersect(o, d):
    """Ray-cast the scene from o along unit directions d (N, 3): distance, normal, albedo."""
    n = len(d)
    t, nrm, alb = np.full(n, np.inf), np.zeros((n, 3)), np.zeros(n)

    def hit(tc, normal, albedo):
        m = (tc > 1e-6) & (tc < t)
        P = o + tc[m, None] * d[m]
        t[m] = tc[m]
        nrm[m] = normal(P) if callable(normal) else normal
        alb[m] = albedo(P)

    with np.errstate(divide="ignore", invalid="ignore"):
        hit((6.5 - o[2]) / d[:, 2], np.array([0, 0, -1.0]), wall_albedo)        # wall z = 6.5
        hit((1.2 - o[1]) / d[:, 1], np.array([0, -1.0, 0]),                     # floor y = 1.2
            lambda P: 0.2 + 0.7 * value_noise(0.5 * P[:, 0] + 11.0, 0.5 * P[:, 2]))
        lo, hi = np.array([-1.6, 0.2, 3.2]), np.array([-0.5, 1.2, 4.3])         # box
        t1, t2 = (lo - o) / d, (hi - o) / d
        tn, tf = np.minimum(t1, t2).max(1), np.maximum(t1, t2).min(1)

        def box_normal(P):
            q = (P - (lo + hi) / 2) / ((hi - lo) / 2)
            k = np.abs(q).argmax(1)
            N = np.zeros_like(P)
            N[np.arange(len(P)), k] = np.sign(q[np.arange(len(P)), k])
            return N
        hit(np.where((tn < tf) & (tn > 0), tn, np.inf), box_normal,
            lambda P: 0.15 + 0.8 * value_noise(P[:, 0] + P[:, 2] + 20.0, P[:, 1] + 0.6 * P[:, 2]))
        c, r = np.array([1.0, 0.4, 3.6]), 0.8                                   # sphere
        b = d @ (o - c)
        disc = b * b - ((o - c) @ (o - c) - r * r)
        hit(np.where(disc > 0, -b - np.sqrt(np.abs(disc)), np.inf), lambda P: (P - c) / r,
            lambda P: 0.2 + 0.75 * value_noise(1.2 * np.arctan2(P[:, 0] - c[0], P[:, 2] - c[2]) + 30.0,
                                               1.5 * P[:, 1]))
    return t, nrm, alb


def render(R, t, ss=3, noise=0.01, seed=0):
    """Image and z-depth (H, W) of the camera X_c = R X + t; Lambertian, 3x3 supersampled."""
    C = -R.T @ t
    ys, xs = (np.mgrid[0:H * ss, 0:W * ss] + 0.5) / ss - 0.5
    rays = np.linalg.inv(K) @ np.stack([xs.ravel(), ys.ravel(), np.ones(xs.size)])
    d = (R.T @ rays).T
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    tt, nrm, alb = intersect(C, d)
    shade = alb * (0.35 + 0.65 * np.clip(nrm @ LIGHT, 0, 1))
    img = shade.reshape(H, ss, W, ss).mean((1, 3))
    img += np.random.default_rng(seed).normal(0, noise, img.shape)
    depth = (rays[2] * tt / np.linalg.norm(rays, axis=0)).reshape(H * ss, W * ss)  # z = t cos
    return img, depth[ss // 2::ss, ss // 2::ss]                  # depth at pixel centres


TARGET = np.array([0.0, 0.4, 4.5])
C_ref = np.array([0.0, -0.6, 0.0])              # reference camera, 1.8 m above the floor
R_ref, t_ref = look_at(C_ref, TARGET)
I_ref, Z_gt = render(R_ref, t_ref, seed=0)
OFFSETS = [(0.40, 0.0, 0.0), (-0.25, 0.0, 0.0), (0.05, -0.30, 0.0), (-0.10, 0.28, 0.0)]
src = []                                        # (image, R, t) of the 4 source views
for i, off in enumerate(OFFSETS):
    R_s, t_s = look_at(C_ref + off, TARGET)
    src.append((render(R_s, t_s, seed=i + 1)[0], R_s, t_s))
print("depth range of the reference view: %.2f .. %.2f m" % (Z_gt.min(), Z_gt.max()))
```

</details>

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-depth-and-points.svg" caption="テストシーン。(a) 参照画像：テクスチャ付きの床、箱、球、壁。左上が縦縞、右上が平坦なポスター。(b) その真の z 奥行き。2.93 m（黄、床の最下行）から 6.73 m（暗色、壁の隅）まで。(c) $\mathbf X = R^\top(z K^{-1}\tilde{\mathbf x} - \mathbf t)$ で逆投影した奥行きマップを別の角度から見たもの。紫の視錐台が参照カメラです。箱と球の後ろの空いたくさび形は、このカメラから見えない部分です。奥行きマップは 2.5D 表現であり、画素ごとに表面は一つだけで、その後ろには何もありません。" %}

この図は忘れやすい点を示しています。一つの視点からの奥行きマップは **2.5D** です。別の場所から見ると、隠れていた所はすべて穴になります。その穴を埋めるにはさらに多くの視点が必要で、だから 7 節で奥行きマップを統合します。

### 1.3 逆奥行きが自然な変数である理由

ステレオが測るのは画素のずれで、画素のずれは逆奥行きに比例します：$\delta = fB\,w$。$z = fB/\delta$ を微分すると、視差誤差 $\sigma\_\delta$ による一次の奥行き誤差は

$$
\sigma_z = \left\lvert \frac{\partial z}{\partial \delta} \right\rvert \sigma_\delta = \frac{fB}{\delta^2}\,\sigma_\delta = \frac{z^2}{fB}\,\sigma_\delta .
$$

奥行き誤差は距離の**2 乗**で増え、$w$ の誤差は定数 $\sigma\_\delta/(fB)$ です。ここから三つの帰結が得られ、どれも後で再び登場します。

- **仮説は $z$ ではなく $w$ で等間隔にとる**：$w$ の等間隔はエピポーラ線上の等しい画素間隔です。
- **相対誤差を報告する**：たとえば $\lvert \hat z - z^\ast\rvert / z^\ast$。5 cm の絶対誤差は 10 m では優秀でも 50 cm ではひどいものです。
- **学習では逆奥行き（または視差）を回帰する**：誤差が等分散に近く、無限遠の点も有限の値 $w = 0$ になります。SLAM も同じ理由でこのパラメータ化を使います（[第 6 回]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})）。

## 2. 奥行きセンサー

画像から奥行きを計算する前に、ハードウェアがどう奥行きを測るかを見ておきます。奥行きセンサーはどれも、**三角測量**装置（ステレオと同じく二つの視点）か **Time-of-Flight** 装置（時計）のどちらかです。本節の最後の図が、それぞれに数字を与えます。

### 2.1 パッシブステレオ

キャリブレーション済みの 2 台のカメラを、エピポーラ線が画像の行になるよう平行化すると（[第 4 回]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})）、$z = fB/\delta$ が得られます。上の誤差式は設計の指針になります。

```python
def stereo_depth_sigma(Z, f, B, sigma_d):
    """First-order depth noise of a rectified stereo pair: Z = f B / d -> dZ = Z^2 / (f B) dd."""
    return Z ** 2 / (f * B) * sigma_d


for B in (0.05, 0.12):
    print("B = %.2f m:" % B, ", ".join("Z = %g m -> %.1f cm" % (Z, 100 * stereo_depth_sigma(Z, 600, B, 0.2))
                                       for Z in (1, 2, 5)))
```

$f = 600$ px、マッチング精度 0.2 px のとき、基線長 5 cm では 1、2、5 m で `0.7 cm, 2.7 cm, 16.7 cm`、12 cm では `0.3 cm, 1.1 cm, 6.9 cm` です。基線を広げると線形に良くなり、距離は 2 乗で悪化させます。広い基線の代償は、隠れの増加と視点間の見え方の大きな違いで、どちらもマッチングを難しくします。

パッシブステレオは屋外、日光の下、遠距離でも動き、カメラ 2 台だけで済みます。失敗するのはまさにマッチングが失敗する場所です。テクスチャのない壁、繰り返し模様、反射、暗闇。能動センサーは自前の光を持ち込んでこれを解決します。

### 2.2 構造化光とアクティブステレオ

ステレオ対のカメラ 1 台を**プロジェクター**に置き換えます。プロジェクターは「逆向きのカメラ」で、カメラと同じく内部パラメータと姿勢を持ちますが、光線は入ってくるのではなく出ていきます。あるカメラ画素を照らしたのがプロジェクターのどの列 $u\_p$ かが分かれば、その画素の光線と列 $u\_p$ に対応するプロジェクターの平面は一つの 3D 点で交わります。これは三角測量であり、テクスチャのない表面ではパッシブステレオに解けない対応問題を、投影パターンが解いてくれます。

「どの列か」を光でどう符号化するか。主に三つの方式があります。

- **単一ショットの疑似ランダムパターン。** 固定の赤外ドットパターン（スペックル）が小さな窓ごとに固有のテクスチャを与えるので、白い壁でも普通のブロックマッチングが働きます。初代 Kinect はこの方式で、多くの「アクティブステレオ」モジュールもパッシブステレオ対にこのようなプロジェクターを加えています。パターンがテクスチャを足し、2 台のカメラがステレオを行います。
- **2 値（グレイコード）パターン。** $\lceil \log\_2 N \rceil$ 枚の白黒縞画像を投影します。ある画素で観測した明暗の並びが、その列の 2 進符号です。グレイコード（Gray code）は隣り合う列で 1 ビットしか違わないので、縞の境界で 1 ビットを読み違えても誤差は高々 1 列です。
- **位相シフト**（phase shifting）。正弦波の縞パターンを既知の位相だけずらして何度か投影します。各画素は $I\_k = A + B\cos(\varphi + \delta\_k)$ を観測します。$A$ は環境光とオフセット、$B$ は変調振幅、$\varphi$ はプロジェクターの列を符号化した未知の位相です。三つのシフト $\delta = -2\pi/3, 0, +2\pi/3$ では

$$
I_1 - I_3 = \sqrt 3\,B\sin\varphi, \qquad 2I_2 - I_1 - I_3 = 3B\cos\varphi
\quad\Longrightarrow\quad
\varphi = \operatorname{atan2}\!\big(\sqrt 3\,(I_1 - I_3),\; 2I_2 - I_1 - I_3\big).
$$

（$\cos(\varphi \pm 2\pi/3)$ を加法定理で展開すれば二つの恒等式を確かめられます。）環境光 $A$ も、$B$ に含まれる表面の反射率も消えます。位相は画素ごとに、サブ画素精度で、マッチング窓なしに測れます。

```python
def phase_from_three(I1, I2, I3):
    """Three fringe images shifted by -120, 0, +120 degrees -> wrapped phase in [0, 2 pi)."""
    return np.arctan2(np.sqrt(3) * (I1 - I3), 2 * I2 - I1 - I3) % (2 * np.pi)


period = 16.0                                   # projector pixels per fringe
u_proj = np.array([37.0])                       # the projector column that lit this camera pixel
phi = 2 * np.pi * u_proj / period
I1, I2, I3 = (0.5 + 0.4 * np.cos(phi + s) for s in (-2 * np.pi / 3, 0.0, 2 * np.pi / 3))
phi_hat = phase_from_three(I1, I2, I3)
print("decoded phase %.4f rad -> column %.2f + k * %g" % (phi_hat[0], phi_hat[0] / (2 * np.pi) * period, period))
```

出力：`decoded phase 1.9635 rad -> column 5.00 + k * 16`。位相は $2\pi$ を法としてしか分かりません。37 列目と 5、21、53 列目は同じに見えます。この**位相の曖昧さ**は、位相シフトを粗いグレイコード（$k$ を与える）と組み合わせるか、周期の長い縞をもう一組使って解消します。産業用 3D スキャナーはこの方式で動き、DTU MVS ベンチマークの参照スキャンも構造化光スキャナーで取得されています。

構造化光は近距離で非常に高精度ですが、環境光と競合します。日光は赤外パターンをかき消すので、この種のセンサーは主に屋内用です。

### 2.3 Time-of-Flight

**Time-of-Flight（ToF）**センサーは、光が表面に届いて戻るまでの時間を測ります：$d = c\,\Delta t/2$。光は速く、奥行き 1 mm は往復 $2 \times 0.001/c = 6.7$ ps です。これを測れるようにする設計が二つあります。

- **直接 ToF（dToF）** は個々のレーザーパルスを単一光子アバランシェダイオード（SPAD）で計時し、到着時刻のヒストグラムを作ります。ほとんどの LiDAR、そして一部のスマートフォンやタブレットに内蔵された LiDAR センサーは dToF です。
- **間接 ToF（iToF、AMCW すなわち振幅変調連続波とも）** は照明を周波数 $f$（数十 MHz）で変調し、戻ってきた波と 4 つのずらした参照信号との相関をとって、戻り波の**位相遅れ** $\varphi = 4\pi f d / c$ を測ります。4 つの相関サンプルは $Q\_k = B + A\cos(\varphi - k\pi/2)$ なので

$$
\varphi = \operatorname{atan2}(Q_1 - Q_3,\; Q_0 - Q_2), \qquad A = \tfrac12\sqrt{(Q_1 - Q_3)^2 + (Q_0 - Q_2)^2}, \qquad d = \frac{c\,\varphi}{4\pi f}.
$$

位相シフトと同じく、オフセット $B$（環境光）は消えます。振幅 $A$ は無料の信頼度です。暗い表面や遠い表面は戻る光が少なく、位相がノイジーになります。

```python
c_light = 299_792_458.0


def tof_samples(d, f_mod, A=1.0, B=2.0, sigma=0.0, rng=None):
    """Four correlation samples of an AMCW ToF pixel at phase offsets 0, 90, 180, 270 degrees."""
    phi = 4 * np.pi * f_mod * d / c_light                      # round-trip phase delay
    Q = B + A * np.cos(phi[None] - np.arange(4)[:, None] * np.pi / 2)        # shape (4, n)
    if sigma:
        Q = Q + rng.normal(0, sigma, Q.shape)
    return Q


def tof_decode(Q, f_mod):
    phi = np.arctan2(Q[1] - Q[3], Q[0] - Q[2]) % (2 * np.pi)
    amp = 0.5 * np.hypot(Q[1] - Q[3], Q[0] - Q[2])
    return c_light * phi / (4 * np.pi * f_mod), amp            # distance modulo c / (2 f)


def unwrap_two(d1, d2, f1, f2, max_range):
    """Pick the wrap counts (n1, n2) whose candidate distances agree best."""
    r1, r2 = c_light / (2 * f1), c_light / (2 * f2)
    best = (np.inf, None)
    for n1 in range(int(max_range / r1) + 1):
        for n2 in range(int(max_range / r2) + 1):
            e = abs((d1 + n1 * r1) - (d2 + n2 * r2))
            if e < best[0]:
                best = (e, 0.5 * (d1 + n1 * r1 + d2 + n2 * r2))
    return best[1]


f1, f2 = 80e6, 100e6
print("unambiguous ranges: %.3f m and %.3f m" % (c_light / (2 * f1), c_light / (2 * f2)))
d_true = np.array([5.3])
d1, a1 = tof_decode(tof_samples(d_true, f1), f1)
d2, a2 = tof_decode(tof_samples(d_true, f2), f2)
print("wrapped: %.4f m at 80 MHz, %.4f m at 100 MHz, amplitude %.2f" % (d1[0], d2[0], a1[0]))
print("unwrapped: %.4f m" % unwrap_two(d1[0], d2[0], f1, f2, max_range=7.49))
```

位相は $c/(2f)$ ごとに折り返します。80 MHz と 100 MHz では `unambiguous ranges: 1.874 m and 1.499 m` です。5.3 m の表面は `1.5526 m` と `0.8031 m` に見えます。どちらも単独では役に立ちませんが、7.49 m 以下で両方と矛盾しない距離は一つだけで、探索は `unwrapped: 5.3000 m` を見つけます。組み合わせた曖昧さのない範囲は $c/(2\gcd(f\_1, f\_2)) = c/(2 \cdot 20\ \text{MHz}) = 7.49$ m です。高い周波数ほど位相分解能が細かく、低い周波数ほど測定範囲が長くなります。実際の iToF カメラは 2 つか 3 つの周波数を組み合わせます。

ToF には固有の失敗モードがあります。**マルチパス**（部屋の隅のように、光が戻る前に別の表面で反射すること）は遅れたコピーを足して位相を偏らせます。**フライングピクセル**は奥行きの境界で前景と背景の光が混ざり、その中間に現れます。4 つのサンプルの間の動きも位相を壊します。

### 2.4 LiDAR

**LiDAR** は走査する dToF 測距器です。回転式のマルチビーム、MEMS ミラー、光フェーズドアレイ、あるいはシーン全体を一度に照らすフラッシュ LiDAR などがあります。画像の画素ごとの z 奥行きではなく、既知のビーム方向に沿った**距離**を、数十から数百メートルでセンチメートル級の精度で返します。FMCW LiDAR はパルスを計時する代わりにレーザー周波数をチャープし、ドップラーシフトから視線方向の速度も測ります。

LiDAR と本シリーズをつなぐ点が二つあります。第一に、LiDAR をカメラと一緒に使うには、LiDAR-カメラ間の外部パラメータで点をカメラ座標系に変換し、$K$ で投影します（[第 1 回]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})）。結果は**疎な**奥行き画像で、値のある画素は数パーセントしかないこともよくあります。**デプス補完**（depth completion）ネットワークは画像を手がかりにそれを密にします。第二に、2 つのセンサー間の外部キャリブレーションは[第 2 回]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})の意味でのキャリブレーション問題で、通常は両方から見えるターゲットで解きます。

### 2.5 センサーの比較

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-sensors.svg" localized="true" caption="(a) $f=600$ px、$\sigma_d = 0.2$ px のときのステレオ奥行きノイズ $\sigma_Z = Z^2\sigma_d/(fB)$。コードの数値です（$B = 5$ cm で 2 m と 5 m に 2.7 cm と 16.7 cm、$B = 12$ cm で 1.1 cm と 6.9 cm）。(b) 間接 ToF：復号した距離は $c/(2f)$ ごとに折り返します。80 MHz（橙）で 1.874 m、100 MHz（青）で 1.499 m。破線が真値です。$d = 5.3$ m（点線）で、折り返した二つの値 1.55 m と 0.80 m と矛盾しない 7.49 m 以下の距離は一つだけです。(c) 位相シフト：プロジェクターの列に沿った 3 枚の縞画像 $I_k$（上）と復号した折り返し位相（下）。周期 16 px ののこぎり波です。点は 37 列目で、5 + 2 x 16 と復号されます。" %}

| センサー | 原理 | 典型的な長所 | 典型的な失敗モード |
| --- | --- | --- | --- |
| パッシブステレオ | 三角測量、カメラ 2 台 | 屋外、広い基線で遠距離、安価 | テクスチャのない面や繰り返し面、暗闇。誤差 $\propto z^2$ |
| アクティブステレオ / 構造化光 | 三角測量、プロジェクター + カメラ | テクスチャのない面、密、近距離で高精度 | 日光、光沢面や暗い面、範囲は投影パワーで制限 |
| 間接 ToF | 変調光の位相 | 密、小型、計算が少ない | マルチパス、フライングピクセル、位相の折り返し、日光 |
| 直接 ToF / LiDAR | パルスの計時 | 遠距離、精度がほぼ距離によらない、暗闇でも動作 | 疎、高価（走査）、雨や霧、黒い面や鏡面 |

完璧なセンサーはありません。そしてどれも同じ種類の出力を出します。ノイズ、穴、外れ値を含む奥行きマップです。7 節ではそうした奥行きマップの統合法を示します。その前に、普通の画像から奥行きを計算しましょう。

## 3. 平面掃引ステレオとコストボリューム

### 3.1 アイデア：平面でシーンを掃引する

平行化した 2 視点ステレオ（[第 4 回]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})）は画像の行に沿って探索します。視点が 3 つ以上ある場合や平行化されていない場合、一つの平行化は存在しません。**平面掃引**（Collins、1996）は、任意の数のキャリブレーション済み視点で使える形でこの探索を一般化します。

1. 参照カメラの前に平面の族を選びます。通常は**正対平面**（fronto-parallel）$z = z\_i$、$i = 1, \dots, D$ です。
2. 各平面について、シーン全体がその平面上にあるかのように、各ソース画像を参照視点へ**ワープ**します。
3. ワープした各画像と参照画像を、画素ごとに小さな窓で比較します。シーンが実際にその平面上（または近く）にある所ではワープ画像が参照と一致し、それ以外では一致しません。
4. 比較結果が**コストボリューム**（cost volume）$C(x, y, i)$ になります。各画素で最もコストの低い平面がその奥行きです。

最初の図は一つの画素の幾何を示します。仮説 $z\_i$ は画素の光線上の点で、それぞれがソース視点のその画素の**エピポーラ線**上のどこかに投影されます。平面の掃引は平行化ステレオとまったく同じエピポーラ線上の探索で、それを 3D で表現したものです。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-sweep-geometry.svg" localized="true" caption="球上の画素 $(120, 60)$ の平面掃引の幾何。(a) 参照カメラ座標系の上面図（行 $y = 60$、灰色はその行の真の表面点）。64 枚の平面 $z = 1/w_i$ のうち 3 枚に 1 枚を描いています（色は近い紫から遠い黄へ）。仮説は黒い光線上の点で、色付きの線がそれらをソースカメラ $\mathbf C_1$ と結びます。赤い星が真の表面点です。平面は $1/z$ で等間隔なので、カメラの近くで密になります。(b) 同じ仮説を平面誘導ホモグラフィ $H_i\tilde{\mathbf x}$ でソース視点 1 に投影したもの。エピポーラ線上に今度は等間隔に並び、最も近い平面から最も遠い平面まで 17.1 px、隣どうしは 0.27 px 離れています。" %}

### 3.2 平面が誘導するホモグラフィ

「シーンが平面上にあるかのように」ワープするにはどうするか。参照カメラ座標で平面を $\mathbf n^\top\mathbf X = d$（単位法線 $\mathbf n$、オフセット $d > 0$）と書きます。$(R, \mathbf t)$ が参照座標をソース座標に写すとします：$\mathbf X\_s = R\mathbf X + \mathbf t$。カメラの世界からカメラへの姿勢がそれぞれ $(R\_r, \mathbf t\_r)$、$(R\_s, \mathbf t\_s)$ なら

$$
R = R_s R_r^\top, \qquad \mathbf t = \mathbf t_s - R\,\mathbf t_r .
$$

平面上の点では $\mathbf n^\top\mathbf X / d = 1$ なので、$\mathbf t$ にこの係数を掛けても何も変わりません。

$$
\mathbf X_s = R\mathbf X + \mathbf t\,\frac{\mathbf n^\top\mathbf X}{d} = \Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)\mathbf X .
$$

これで $\mathbf X$ から $\mathbf X\_s$ への写像は線形になりました。$\mathbf X = z K\_r^{-1}\tilde{\mathbf x}\_r$ と $\tilde{\mathbf x}\_s \sim K\_s\mathbf X\_s$ を代入すると、未知の $z$ は単なるスケール係数で、同次座標はそれを無視します。

$$
\tilde{\mathbf x}_s \sim H\,\tilde{\mathbf x}_r, \qquad H = K_s\Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)K_r^{-1} .
$$

これは第 2 回でカメラのキャリブレーションに使った平面から画像へのホモグラフィと同じもので、今度は 2 枚の画像の間に働きます。（平面を $\mathbf n^\top\mathbf X + d = 0$ と書いて $R - \mathbf t\mathbf n^\top/d$ を得る文献もあり、ニューラルレンダリング第 1 回もそうです。$d$ の符号が逆なだけで同じ式です。）正対平面では $\mathbf n = (0, 0, 1)^\top$、$d = z\_i$ です。

**検算：平行化ステレオ。** ソースカメラを同じ向きのまま右に $B$ だけ置きます：$R = I$、$\mathbf t = (-B, 0, 0)^\top$、$K\_s = K\_r = K$。すると $R + \mathbf t\mathbf n^\top/z = I - (B/z)\,\mathbf e\_x\mathbf e\_z^\top$ で、$\tilde{\mathbf x} = (x, y, 1)^\top$ に対してホモグラフィは $x\_s = x - fB/z$、$y\_s = y$ を与えます。視差 $\delta = fB/z$ だけの水平移動です。平面掃引は平行化ステレオを特殊な場合として含んでいます。

### 3.3 奥行き仮説のサンプリング

上の図がすでに答えています。**逆奥行き** $w\_i$ で等間隔な平面は、エピポーラ線上に等間隔の点を生みます。画素のずれは $w$ のアフィン関数だからです（平行化の場合は厳密に、それ以外は近似的に）。$z$ で等間隔にすると、平面の大半が遠方（隣どうしが 1 画素未満しか離れない所）で無駄になり、カメラの近くに隙間が残ります。私たちの掃引は $z = 2.5$ m から $8$ m まで、$w$ で等間隔な $D = 64$ 枚の平面を使います。図の球上の画素では、ソース視点 1 で 17.1 px にわたり、隣どうしは 0.27 px です。画素の何分の一かの間隔がちょうどよく、粗いと真の対応を飛ばし、細かいと時間を無駄にするだけです。

### 3.4 マッチングコスト

参照窓とワープしたソース窓をどう比べるか。候補は[第 3 回]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})と同じです。

- **SAD / SSD**（差の絶対値または 2 乗の和）：最も単純ですが、カメラ間の明るさの違いに敏感です。
- **NCC**（正規化相互相関）：各窓の平均を引き、標準偏差で割り、積の平均をとります。平均 $\mu$、分散 $\sigma^2$ の窓 $\mathbf a$、$\mathbf b$ について

$$
\mathrm{NCC}(\mathbf a, \mathbf b) = \frac{\frac1m\sum_k (a_k - \mu_a)(b_k - \mu_b)}{\sqrt{\sigma_a^2\,\sigma_b^2}} \in [-1, 1] .
$$

  ゲインとオフセットの変化（$b \mapsto \alpha b + \beta$、$\alpha > 0$）に不変で、だからほとんどの MVS システムが使います。コストには $1 - \mathrm{NCC} \in [0, 2]$ を使い、平坦な窓がゼロ除算ではなく 1 に近いコスト（「情報なし」）になるよう、各分散に小さな $\varepsilon$ を足します。
- **Census**：窓内の各画素を中心と比較してビットを保存し、異なるビットの数（ハミング距離）を数えます。任意の単調な明るさ変化に頑健で、SGM ベースのハードウェアステレオでよく使われます。

窓の大きさはトレードオフです。大きな窓はより多くの画素を平均するのでコストのノイズが減り、弱いテクスチャでも働きますが、窓全体が平面上にあることも仮定します。奥行きの境界では大きな窓が前景と背景にまたがり、たいていテクスチャの強い前景が勝ちます。奥行きの境界は外側に**太ります**（fattening）。傾いた表面では正対した窓の形が間違っています。4 節でこれを直します。

### 3.5 平面掃引のコード

```python
def relative_pose(R_r, t_r, R_s, t_s):
    """(R, t) that map reference-camera coordinates to source-camera coordinates."""
    R = R_s @ R_r.T
    return R, t_s - R @ t_r


def plane_homography(K_r, K_s, R, t, n, d):
    """Reference pixels -> source pixels for the plane n^T X = d (X in reference coordinates)."""
    return K_s @ (R + np.outer(t, n) / d) @ np.linalg.inv(K_r)


def warp(img, Hm):
    """For every reference pixel x, sample img at Hm x (bilinear). NaN where it falls outside."""
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    p = Hm @ np.stack([xs.ravel(), ys.ravel(), np.ones(H * W)])
    out = ndi.map_coordinates(img, [p[1] / p[2], p[0] / p[2]], order=1, cval=np.nan)
    return out.reshape(H, W)


def ncc_cost(a, b, r=2, eps=1e-5):
    """1 - NCC over (2r+1) x (2r+1) windows, per pixel: 0 = perfect match, 2 = worst.
    Windows that touch a NaN of b (outside the source image) get the worst cost."""
    box = lambda x: ndi.uniform_filter(x, 2 * r + 1, mode="nearest")
    outside = np.isnan(b)
    b = np.where(outside, 0.0, b)
    ma, mb = box(a), box(b)
    va, vb, cab = box(a * a) - ma ** 2, box(b * b) - mb ** 2, box(a * b) - ma * mb
    cost = 1 - cab / np.sqrt((np.maximum(va, 0) + eps) * (np.maximum(vb, 0) + eps))
    return np.where(box(outside.astype(float)) > 1e-6, 2.0, cost)


def plane_sweep(I_ref, R_ref, t_ref, views, z_near=2.5, z_far=8.0, D=64, r=2):
    """Cost volume C[view, plane, y, x] for fronto-parallel planes, uniform in 1/z."""
    inv_z = np.linspace(1 / z_near, 1 / z_far, D)
    n = np.array([0.0, 0.0, 1.0])                       # planes z = const in the reference frame
    C = np.empty((len(views), D, H, W))
    for j, (I_s, R_s, t_s) in enumerate(views):
        R, t = relative_pose(R_ref, t_ref, R_s, t_s)
        for i, w in enumerate(inv_z):
            C[j, i] = ncc_cost(I_ref, warp(I_s, plane_homography(K, K, R, t, n, 1 / w)), r)
    return inv_z, C


def wta(inv_z, cost):
    """Winner-take-all over the planes, refined by a parabola through 3 costs; returns z."""
    i = cost.argmin(0)
    ic = np.clip(i, 1, len(inv_z) - 2)
    c0, c1, c2 = (np.take_along_axis(cost, (ic + o)[None], 0)[0] for o in (-1, 0, 1))
    den = c0 - 2 * c1 + c2
    off = np.where((i == ic) & (den > 1e-9), 0.5 * (c0 - c2) / np.maximum(den, 1e-9), 0.0)
    return 1 / np.interp(ic + np.clip(off, -0.5, 0.5), np.arange(len(inv_z)), inv_z)


def depth_errors(z, z_gt):
    e = np.abs(z - z_gt) / z_gt
    return "AbsRel %.3f, |e| < 1%%: %4.1f%%, |e| < 5%%: %4.1f%%" % (
        e.mean(), 100 * np.mean(e < 0.01), 100 * np.mean(e < 0.05))


inv_z, C = plane_sweep(I_ref, R_ref, t_ref, src)          # C: (4 views, 64 planes, H, W)
z_one = wta(inv_z, C[0])                                   # only source view 1 (index 0)
z_mean = wta(inv_z, C.mean(0))                             # average of the 4 views
z_best2 = wta(inv_z, np.sort(C, 0)[:2].mean(0))            # best 2 of 4 views, per pixel and plane
for name, z in (("view 1 only", z_one), ("mean of 4", z_mean), ("best 2 of 4", z_best2)):
    print("%-12s %s" % (name, depth_errors(z, Z_gt)))
```

三つの細部に触れておきます。`ncc_cost` はすべての窓和をボックスフィルターで計算するので、窓の大きさによらず平面 1 枚あたり画像サイズの演算が数回で済みます。`wta` は勝った平面を、$i-1, i, i+1$ のコストを通る放物線の頂点で精密化します。コストが $c\_0, c\_1, c\_2$ なら放物線の最小はオフセット $\tfrac12(c\_0 - c\_2)/(c\_0 - 2c\_1 + c\_2)$ にあり、3 回の参照でサブ平面精度が得られます。そしてコストボリュームは視点を分けたまま `C[view, plane, y, x]` で保持します。3.7 節で見るように、どう組み合わせるかが重要だからです。

次の図はワープの様子です。各平面について、その平面の近くにあるシーンの部分が参照画像とそろい、差分画像がそこで暗くなります。それ以外は明るいままです。平面を掃引すると、この「ピントの合った」帯が近くの床から遠くの壁へ移動し、カメラのフォーカスリングによく似ています。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-sweep-warps.svg" caption="1 行目：参照画像と、右に 0.40 m の位置で撮ったソース視点 1。2 行目以降：左は 1 枚の平面（$z = 3.3$、$4.6$、$6.6$ m）のホモグラフィで参照視点にワープしたソース視点 1、右はその参照画像との差の絶対値です。シアンの輪郭は真の奥行きが平面から 3% 以内の画素で、そこでは差が暗く（そろっている）、それ以外では明るくなります。3.3 m では箱の正面、球上の輪の部分、手前の床の帯が、4.6 m では床の帯が、6.6 m では壁がそろいます。画像の縁の空白の帯は、ソース視点 1 の外に出る画素です。" %}

### 3.6 コスト曲線を読む

コストボリュームは画素ごとに見るのが最も分かりやすいです。下の図は 4 つのプローブ画素の $C(z)$ を、視点ごと（細線）と集約後（太線）で示します。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-cost-curves.svg" localized="true" caption="4 つのプローブ画素について、64 枚の平面に沿ったコスト曲線 $1 - \mathrm{NCC}$（5x5 窓）。ソース視点ごとに細線 1 本、黒は「4 つ中ベスト 2」の集約。赤の破線が真の奥行き、黒い三角が推定値です。A：テクスチャのある壁。どの視点にも深く狭い最小が一つあり、推定 6.36 m（真値 6.35 m）。B：平坦なポスター。どの曲線も 1 付近の平らなノイズで、最小は 6.21 m ではなく 4.58 m に落ちます。C：縦縞。水平基線の視点 1 と 2 は異なる奥行きに周期的な最小を持ちます。基線がほぼ垂直な視点 3 はエピポーラ線に沿ってほとんど変化を見ず（どの奥行きでもコストが低い）、視点 4 は幅の広い曲線を与えます。集約は曖昧で、推定は 6.12 m（真値 6.25 m）。D：箱の隣の壁の画素で、視点 2 からは隠れています（青、真値でのコストが高い）が他の視点からは見えます。ベスト 2 は 6.62 m（真値 6.66 m）、4 視点すべての平均は 5.29 m を与えます。" %}

どのプローブも教訓になります。

- **A（テクスチャ）**：理想的な場合。どの視点でも正しい場所に鋭く一意な最小があります。
- **B（テクスチャなし）**：マッチングするものがありません。2 つのノイズ窓の NCC はランダムなので、「最良」の平面もランダムです。局所的なコストではどうにもならず、ポスター周囲のテクスチャのある領域から奥行きを伝える事前知識（滑らかさ、3.8 節；平面、4 節）か、能動的な光（2.2 節）が必要です。
- **C（繰り返しテクスチャ）**：周期 $p$ 画素の縞は $p$ ずらすと自分自身と一致するので、一つの視点には同じくらい良い最小がいくつもあります。**基線の異なる**視点はこれらのエイリアスを異なる奥行きに置き、真の奥行きだけがすべての視点で最小になります。これが**マルチベースラインステレオ**（multiple-baseline stereo）の考え方で（Okutomi と Kanade、1993）、彼らは逆距離上で複数の基線の SSD 曲線を足し合わせました。エピポーラ線が縞**に沿って**走る視点は一定の模様を見るだけで情報を持ちません。第 3 回の開口問題の別の姿です。
- **D（隠れ）**：視点 2（0.25 m 左）からはこの画素の表面点が箱に隠れているので、視点 2 は壁と箱を比べてしまい、真の奥行きで高いコストを出します。この外れ値を平均に入れると最小が動き、最悪の視点を無視すれば保たれます。

### 3.7 多数の視点：集約と隠れ

視点ごとのコスト $C\_j(x, y, i)$ をどう組み合わせるか。私たちのシーンでは、出力が答えを示しています。

```
view 1 only  AbsRel 0.079, |e| < 1%: 52.3%, |e| < 5%: 78.3%
mean of 4    AbsRel 0.047, |e| < 1%: 65.5%, |e| < 5%: 82.8%
best 2 of 4  AbsRel 0.034, |e| < 1%: 67.9%, |e| < 5%: 90.5%
```

視点を増やすと良くなり、**ロバストな集約**はさらに良くします。画素と平面ごとに $N$ 視点中ベスト $k$ 個の平均をとると（Kang、Szeliski、Chai（2001）の視点部分集合の選択と同じ考え方です）、各点は少なくとも $k$ 個の視点から見えていると仮定し、残りは隠れている可能性があるとして捨てることになります。プローブ D では 4 視点の平均が 5.29 m、ベスト 2 が 6.62 m を与えます。実用システムはさらに進んでいます。COLMAP（Schönberger ら、2016）は各ソース視点が各画素を見ている確率を奥行きと同時に推定し、三角測量の角度でも視点を重み付けします（角度が小さすぎると奥行き分解能がなく、大きすぎると見え方が違いすぎます）。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-sweep-result.svg" localized="true" caption="5x5 の NCC 窓と放物線による精密化を用いた平面掃引の奥行きマップ。(a) 真値。(b) ソース視点 1 のみ：ポスターと縦縞にノイズのブロックがあり、右端には画素が視点 1 の外に出る帯があります。(c) 画素と平面ごとに 4 視点中ベスト 2：真の奥行きから 1% 以内の画素が 68%、5% 以内が 90%。(d) (c) の相対誤差（5% で打ち切り）。残る誤差はテクスチャのないポスター、奥行きの境界（箱と球の輪郭の前景の太り）、画像の縁に集中し、テクスチャのある表面ではほとんど 1% 未満です。" %}

(d) の誤差マップは局所ステレオの典型的な姿です。テクスチャでは良好、ポスターでは誤り、そしてすべての奥行き境界の周りに明るい**ハロー**があります。そこでは 5x5 の窓が前景と背景を混ぜています。

### 3.8 コストボリュームの正則化

ここまでは各画素が単独で決めていました（勝者総取り、winner-take-all、WTA）。ポスターと境界での誤差には**文脈**が必要です。隣り合う画素はたいてい似た奥行きを持ちます。文脈を取り入れる古典的な方法は三つです。

- **コスト集約**：各コストスライスを空間的にフィルタリングします。ボックスやガウシアン、あるいは画像のエッジをまたいで平均しないエッジ保存フィルター（バイラテラルフィルターやガイデッドフィルター）を使うと太りが減ります。
- **大域最適化**：奥行きマップ全体で $E(\mathbf z) = \sum\_p C\_p(z\_p) + \lambda\sum\_{p \sim q} V(z\_p, z\_q)$ を最小化します。$V$ は隣接画素間の滑らかさのペナルティです。グラフカットや確率伝搬で近似的に解きます。
- **セミグローバルマッチング（SGM）**（Hirschmüller、2008）、[第 4 回]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})で説明しました。大域問題の 1 次元版を 8 または 16 方向に沿って動的計画法で厳密に解き、結果を足し合わせます。平面掃引のボリュームを含め、どんなコストボリュームにも使えます。

学習型 MVS（5 節）はこの三つを、コストボリュームの正則化の仕方をデータから学ぶ 3D CNN で置き換えます。

### 3.9 試してみよう：自分で平面を掃引する

このウィジェットは、似たシーン（参照視点 1 つとソース視点 1 つを JavaScript で再描画）に対して本節の平面掃引をブラウザで実行します。グラフ上をドラッグするかスライダーで平面を動かし、画像のどの部分がそろうかを見てください。試してほしいこと：

- **|差分|** を表示して近くから遠くへ掃引すると、暗い帯が画像の下端（手前の床）から壁へ移動します。
- プローブを箱、ポスター、縦縞に置きます（プローブのボタンを押してから画像をタップ）。鋭い最小、平らな曲線、周期的な最小を比べましょう。
- **WTA 奥行き** に切り替え、窓を 3x3 から 9x9 に変えます。テクスチャのある表面のノイズは減りますが、境界は太ります。グラフの下の精度の行に注目してください。
- **基線長** を変えると、縦縞のエイリアスが別の奥行きに移ります（5x5 窓では、基線 0.5 m でたまたま縦縞のプローブが正しい奥行きになります）。基線が短いとどの最小も幅が広がります（奥行き分解能が下がる）。

{% include widget.liquid name="3d-vision-plane-sweep" height="760" caption="リアルタイムの平面掃引ステレオ。左：3 つのプローブ画素のある参照画像。右：現在の平面のホモグラフィでワープしたソース視点、差の絶対値、この平面での全画素のコスト、または勝者総取りの奥行きマップ。シアンの輪郭は真の奥行きが平面から 3% 以内の画素です。グラフ：各プローブのコストを奥行き（$1/z$ で等間隔）に対して示し、紫の線が現在の平面、破線が真の奥行き、三角が WTA の推定です。" %}

## 4. PatchMatch マルチビューステレオ

### 4.1 掃引の二つの問題

平面掃引には二つの組み込みの限界があります。

1. **計算量。** すべての画素で $D$ 枚すべての平面を評価します。4K 解像度で $D = 256$ なら、ソース視点 1 つあたり 20 億回の窓比較になり、その大半は明らかに間違った奥行きのためです。
2. **正対の偏り。** どの窓も、表面がカメラに正対しているかのようにワープされます。傾いた表面（床、道路、斜めから見た建物の正面）では窓の中で真の奥行きが変わるので、最良の平面でも部分的にしか一致しません。私たちの床がそれを示しています。1% 以内の画素は全体で 68% なのに、床では 51% だけです。

**PatchMatch**（Barnes ら、2009、画像編集用）が一つ目の問題を解き、**傾いた平面**を使うステレオ版（Bleyer、Rhemann、Rother、2011）が二つ目を解きます。

### 4.2 PatchMatch の考え方

PatchMatch は一つの観察に基づきます。**良い仮説は空間的にまとまっている**。ある画素の奥行き（と向き）が正しければ、隣の画素のそれもほぼ同じでしょう。アルゴリズムは 3 ステップだけです。

1. **ランダム初期化。** 各画素にランダムな仮説を与えます。ここでは奥行き（$w$ で一様）と法線です。
2. **伝播。** 画素を順に訪れ、各画素に隣の仮説を試させ、コストが下がれば採用します。
3. **ランダムな精密化。** 現在の仮説をランダムにずらし、ずらす幅を反復ごとに縮め、良くなれば採用します。

なぜランダム初期化でうまくいくのか。領域ごとに**一つ**の幸運な画素があればよいからです。逆奥行きが真値の ±1% 以内なら「良い」仮説とします。5 m の表面（$w = 0.2$）では幅 0.004 の区間で、全範囲は $1/2.5 - 1/8 = 0.275$ なので、ランダムな推測が良い確率は $p = 0.0145$ です。同じ表面上の $20 \times 20$ の領域では、400 画素のうち少なくとも一つが良い推測から始まる確率は

$$
1 - (1 - p)^{400} = 1 - 0.9855^{400} \approx 1 - e^{-5.84} = 0.997 .
$$

あとは伝播が数回の掃引でその画素の仮説を領域全体に広げます。精密化は幸運な推測の 1% を超えて精度を磨きます。（傾いた平面では法線もおおよそ正しい必要があるので $p$ は下がりますが、精密化のステップと多数の隣接画素がそれを補います。）

### 4.3 傾いたサポート窓

各画素 $p$ は平面を持つようになります。奥行き $z\_p$ と法線 $\mathbf n\_p$ です。平面は逆投影点 $\mathbf X\_p = z\_p K^{-1}\tilde{\mathbf x}\_p$ を通るので、オフセットは $d\_p = \mathbf n\_p^\top\mathbf X\_p$ です。$p$ の窓のすべての画素は、**$p$ 自身の**ホモグラフィ

$$
H_p = K_s\Big(R + \frac{\mathbf t\,\mathbf n_p^\top}{d_p}\Big)K_r^{-1}
$$

でソース視点へワープされます。こうして窓はカメラに正対するのではなく表面に沿います。床の上の窓は床の一片としてワープされます。（私たちのコードはすべての法線をカメラ側に向けるので、3.2 節の $d > 0$ と違って $d\_p < 0$ になります。これは問題になりません。$\mathbf n$ を反転すると $d$ も反転し、$\mathbf t\mathbf n^\top/d$ は変わらないからです。）

伝播にはもう一つ式が必要です。画素 $p$ が隣の画素 $q$ の平面 $(\mathbf n\_q, \mathbf X\_q)$ を借りるとき、$p$ で試す奥行きは、$p$ の光線 $\mathbf r\_p = K^{-1}\tilde{\mathbf x}\_p$ がその平面と交わる所です：$\mathbf n\_q^\top(z\,\mathbf r\_p) = \mathbf n\_q^\top\mathbf X\_q$、したがって

$$
z = \frac{\mathbf n_q^\top\mathbf X_q}{\mathbf n_q^\top\mathbf r_p} .
$$

傾いた表面ではこれが奥行きを単にコピーするのではなく正しく外挿します。

### 4.4 伝播の順序と並列化

Bleyer らは逐次的に伝播します。偶数回目は画像を左上から右下へ（情報は右と下へ流れる）、奇数回目は逆順に走査します。これは本質的に逐次的です。**Gipuma**（Galliani、Lasinger、Schindler、2015）は**赤黒の市松模様**で PatchMatch を大規模並列にしました。画素をチェス盤のように塗り分け、まず黒い隣接画素からすべての赤い画素を同時に更新し、次にすべての黒い画素を更新します。各更新は距離 1 とそれより遠い隣接画素を使うので（私たちは 4 方向で距離 1 と 3 を使います）、半ステップごとに情報は数画素進みます。ACMM（Xu と Tao、2019）はどの隣接画素をサンプルするかを適応的に選び、低テクスチャ領域のためにマルチスケールの幾何的整合性を加えています。同じ赤黒方式のおかげで、私たちの NumPy 版も速く動きます。画素の半分が一度のベクトル化された呼び出しで更新されるからです。

### 4.5 PatchMatch のコード

```python
Kinv = np.linalg.inv(K)
WIN = np.array([(dx, dy) for dy in range(-2, 3) for dx in range(-2, 3)], float)   # 5 x 5 window
NEIGH = [(-1, 0), (1, 0), (0, -1), (0, 1), (-3, 0), (3, 0), (0, -3), (0, 3)]


def plane_cost(z, nrm, xs, ys, I_ref, views, k=2):
    """Best-k mean of 1 - NCC for pixel (xs, ys) carrying the plane through depth z with normal
    nrm; every window pixel is warped by its own plane-induced homography."""
    q = np.stack([xs[:, None] + WIN[:, 0], ys[:, None] + WIN[:, 1]], -1)          # (M, 25, 2)
    a = ndi.map_coordinates(I_ref, [q[..., 1].ravel(), q[..., 0].ravel()], order=1,
                            mode="nearest").reshape(q.shape[:2])
    X = z[:, None] * (np.stack([xs, ys, np.ones_like(xs)], 1) @ Kinv.T)            # 3D point
    d = np.sum(nrm * X, 1)                                                          # n^T X = d
    qh = np.concatenate([q, np.ones(q.shape[:2] + (1,))], -1)
    costs = []
    for I_s, R_s, t_s in views:
        R, t = relative_pose(R_ref, t_ref, R_s, t_s)
        Hm = K @ (R + t[:, None] * nrm[:, None, :] / d[:, None, None]) @ Kinv      # (M, 3, 3)
        p = np.einsum("mij,mkj->mki", Hm, qh)
        b = ndi.map_coordinates(I_s, [(p[..., 1] / p[..., 2]).ravel(), (p[..., 0] / p[..., 2]).ravel()],
                                order=1, cval=np.nan).reshape(q.shape[:2])
        bad = np.isnan(b).any(1)
        a0 = a - a.mean(1, keepdims=True)
        b = np.where(bad[:, None], 0.0, b)                                  # cost 2 below anyway
        b0 = b - b.mean(1, keepdims=True)
        ncc = (a0 * b0).mean(1) / np.sqrt(((a0 ** 2).mean(1) + 1e-5) * ((b0 ** 2).mean(1) + 1e-5))
        costs.append(np.where(bad, 2.0, 1 - ncc))
    return np.sort(np.array(costs), 0)[:k].mean(0)


def facing(nrm, rays):
    nrm = nrm / np.linalg.norm(nrm, axis=1, keepdims=True)
    return np.where(np.sum(nrm * rays, 1, keepdims=True) > 0, -nrm, nrm)   # point at the camera


def patchmatch(I_ref, views, iters=6, z_near=2.5, z_far=8.0, slanted=True, seed=0, history=None):
    """Multi-view PatchMatch with red-black propagation (Gipuma-style); returns z, normals, cost."""
    rng = np.random.default_rng(seed)
    ys, xs = (g.ravel().astype(float) for g in np.mgrid[0:H, 0:W])
    rays = np.stack([xs, ys, np.ones_like(xs)], 1) @ Kinv.T
    w = rng.uniform(1 / z_far, 1 / z_near, H * W)                   # 1. random inverse depth
    N = facing(rng.normal(size=(H * W, 3)), rays) if slanted else np.tile([0, 0, -1.0], (H * W, 1))
    cost = plane_cost(1 / w, N, xs, ys, I_ref, views)
    dw, dn = (1 / z_near - 1 / z_far) / 4, 0.3                       # refinement step sizes
    for it in range(iters + 1):
        if history is not None:
            history.append((1 / w).reshape(H, W).copy())
        if it == iters:
            break
        for color in (0, 1):                                          # red-black halves
            sel = np.nonzero((xs + ys) % 2 == color)[0]
            xi, yi = xs[sel].astype(int), ys[sel].astype(int)
            cands = []
            for dx, dy in NEIGH:                                      # 2. propagation
                j = np.clip(yi + dy, 0, H - 1) * W + np.clip(xi + dx, 0, W - 1)
                # the neighbour's plane, intersected with this pixel's ray: z = n^T X_j / n^T r
                z = np.sum(N[j] * rays[j], 1) / w[j] / np.sum(N[j] * rays[sel], 1)
                ok = (z > 0.9 * z_near) & (z < 1.1 * z_far)
                cands.append((np.where(ok, 1 / np.where(ok, z, 1.0), w[j]), N[j]))
            # 3. random refinement: perturb the depth, and (if slanted) the normal
            cands.append((np.clip(w[sel] + rng.uniform(-dw, dw, len(sel)), 1 / z_far, 1 / z_near), N[sel]))
            if slanted:
                cands.append((w[sel], facing(N[sel] + rng.normal(0, dn, (len(sel), 3)), rays[sel])))
            for cw, cn in cands:
                c = plane_cost(1 / cw, cn, xs[sel], ys[sel], I_ref, views)
                upd = c < cost[sel]                                   # keep the better plane
                better = sel[upd]
                w[better], N[better], cost[better] = cw[upd], cn[upd], c[upd]
        dw, dn = dw / 2, dn / 2
    return (1 / w).reshape(H, W), N.reshape(H, W, 3), cost.reshape(H, W)


pm_hist = []
z_pm, N_pm, cost_pm = patchmatch(I_ref, src, history=pm_hist)
for it, z in enumerate(pm_hist):
    print("PatchMatch iteration %d: %s" % (it, depth_errors(z, Z_gt)))
pm_hist_fp = []
z_pm_fp = patchmatch(I_ref, src, slanted=False, history=pm_hist_fp)[0]   # fronto-parallel planes only
floor = np.abs(X_world[..., 1] - 1.2) < 1e-6                         # pixels that see the floor
for name, z in (("sweep, best 2", z_best2), ("PatchMatch slanted", z_pm), ("PatchMatch fronto", z_pm_fp)):
    e = np.abs(z - Z_gt) / Z_gt
    print("%-19s floor: |e| < 1%%: %4.1f%%   all: %s" % (name, 100 * np.mean(e[floor] < 0.01), depth_errors(z, Z_gt)))
```

出力が反復の経過を語っています。

```
PatchMatch iteration 0: AbsRel 0.365, |e| < 1%:  1.8%, |e| < 5%:  8.9%
PatchMatch iteration 1: AbsRel 0.080, |e| < 1%: 20.1%, |e| < 5%: 64.9%
PatchMatch iteration 2: AbsRel 0.043, |e| < 1%: 49.5%, |e| < 5%: 88.6%
PatchMatch iteration 3: AbsRel 0.040, |e| < 1%: 60.9%, |e| < 5%: 89.2%
PatchMatch iteration 4: AbsRel 0.039, |e| < 1%: 64.5%, |e| < 5%: 89.5%
PatchMatch iteration 5: AbsRel 0.039, |e| < 1%: 66.2%, |e| < 5%: 89.5%
PatchMatch iteration 6: AbsRel 0.039, |e| < 1%: 66.8%, |e| < 5%: 89.5%
sweep, best 2       floor: |e| < 1%: 51.2%   all: AbsRel 0.034, |e| < 1%: 67.9%, |e| < 5%: 90.5%
PatchMatch slanted  floor: |e| < 1%: 59.4%   all: AbsRel 0.039, |e| < 1%: 66.8%, |e| < 5%: 89.5%
PatchMatch fronto   floor: |e| < 1%: 46.3%   all: AbsRel 0.039, |e| < 1%: 63.4%, |e| < 5%: 89.1%
```

純粋なノイズ（偶然 1% 以内に入った画素は 1.8%）から始めて、1 回の反復で画素の 65% が 5% 以内に入り、2 回で奥行きマップはほぼ収束します。傾いた平面を使うと床の画素の 59.4% が 1% 以内に入ります。正対平面に限った PatchMatch では 46.3%、64 枚の平面掃引では 51.2% です。全体では PatchMatch は掃引と同等で（1% 以内がそれぞれ 66.8% と 67.9%）、画素あたりのコスト評価回数もほぼ同じです。ここでは 1 + 6 x 10 = 61 回、掃引は 64 枚です。違いは計算量の伸び方です。掃引の計算量は平面の数とともに増えますが PatchMatch は増えず、PatchMatch の奥行きは平面に量子化されず連続です。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-patchmatch.svg" localized="true" caption="テストシーンでの PatchMatch MVS（4 視点中ベスト 2、5x5 窓、赤黒伝播）。ランダム初期化後の奥行き（反復 0：1% 以内の画素は 2%）、1、2、6 回の反復後（20%、50%、67%）。左下：推定した法線を色で表示（x、-y、-z を RGB に対応）。床は緑、カメラに正対する面は青紫、球は滑らかな色の変化になります。弱いテクスチャでは法線はノイジーなままです。5x5 窓は向きより奥行きをずっと強く拘束するからです。右下：反復ごとの 1% 以内の画素の割合。実線は全画素、破線は床、紫は傾いた平面、橙は正対平面のみ。点線は平面掃引です。" %}

### 4.6 1 枚の奥行きマップから多数へ：COLMAP など

COLMAP（Schönberger ら、2016）のような実用 MVS システムは、**すべての**画像を参照視点として PatchMatch を走らせ、三つの要素を加えます。

- **画素ごとの視点選択**：私たちの固定の「ベスト 2」規則ではなく、確率モデルで各画素をどのソース視点が見ているかを推定します。
- **幾何的整合性**：2 回目のパスで、仮説を他の視点の奥行きマップとの一致度でも評価します（隣の視点に投影し、そこの奥行きを読み、投影し直して出発画素との距離を測る）。
- **フィルタリングと統合**：光度的または幾何的な整合性の低い画素を捨て、すべての視点で残った奥行きを一つの点群にまとめます（7.1 節）。

以前の MVS は別の道をとっていました。PMVS（Furukawa と Ponce、2010）は疎な対応から出発し、拡張とフィルタリングで小さな向き付きパッチの集合を育てました。ボリューム法はボクセルを削ったりラベル付けしたりしました。奥行きマップベースの PatchMatch が実用で勝ったのは、並列化しやすく、何千枚もの高解像度画像にスケールするからです。

## 5. 学習型マルチビューステレオ

### 5.1 MVSNet：ネットワークとしての平面掃引

手作りの MVS は光度一貫性が弱い所、つまり低テクスチャ、反射、細い構造で苦労します。**MVSNet**（Yao ら、2018）は平面掃引の幾何を保ったまま、残りのすべてを学習します。そのパイプラインは 3 節と一対一に対応します。

1. **特徴抽出。** 共有の 2D CNN が $N$ 枚の画像それぞれを、1/4 解像度で $C$ チャネル（論文では 32）の特徴マップにします。生の輝度ではなく学習した特徴をマッチングすることが最初の利得です。
2. **微分可能なホモグラフィワープ。** 各ソース特徴マップを、3.2 節とまったく同じホモグラフィ $H\_i$ で参照視点の $D$ 枚の正対平面にワープします。微分可能な双線形サンプリングを使います。
3. **分散コストボリューム。** 各平面で、$N$ 個の特徴ボリューム $\mathbf V\_1, \dots, \mathbf V\_N$（参照を含む）をチャネルごとの分散 $\mathbf C = \frac1N\sum\_j(\mathbf V\_j - \bar{\mathbf V})^2$ で結合します。特徴が一致する所では分散が小さくなります。私たちの「ベスト 2」と違い、分散は任意の $N$ で使えます。
4. **正則化。** 3D U-Net が $C \times D \times H/4 \times W/4$ のボリュームを処理して平面と画素ごとにスコアを出し、$i$ 方向の softmax で**確率ボリューム** $P\_i(x, y)$ に変えます。これが SGM や大域最適化の代わりで、ネットワークはテクスチャのない領域に情報を伝える方法を学びます。
5. **奥行きの回帰。** 奥行きは平面にわたる期待値 $\hat z = \sum\_i P\_i\,z\_i$（soft-argmin）です。MVSNet は平面を奥行きで等間隔に取ります。下のコードのように逆奥行きで等間隔に取るなら、代わりに $w$ の期待値を取ります。小さな 2D ネットワークが参照画像を使って奥行きマップを精緻化し、学習では初期と精緻化後の両方の奥行きマップについて、真の奥行き（DTU の構造化光スキャンからレンダリング）に対する L1 損失を最小化します。

弱点はメモリです。$1600 \times 1200$ の画像では、1/4 解像度のボリュームは $D = 192$ 枚の平面で $400 \times 300 \times 192 \times 32 \approx 7.4 \times 10^8$ 要素、32 ビット浮動小数点で約 3 GB になり、3D U-Net の中間ボリュームにはさらにその数倍が必要です。後続研究の大半はこの数字をめぐるものです。

### 5.2 Soft-argmin：サブ画素で微分可能、ただし落とし穴あり

勝者総取りは微分できません。ステレオ用の GC-Net（Kendall ら、2017）と MVSNet は、それを softmax の下での期待値で置き換えます。

$$
P_i = \frac{\exp(-C_i/\tau)}{\sum_k \exp(-C_k/\tau)}, \qquad \hat w = \sum_i P_i\,w_i .
$$

分布が単峰で鋭ければ、$\hat w$ は最小のサブ平面推定になります。そうでなければ期待値は山と山の**間**、どの平面も支持しない奥行きに落ちます。手作りのコストボリュームでこれを試せます。温度 $\tau$ が、ネットワークにとっての学習の役割を演じます。

```python
def soft_argmin(inv_z, cost, tau=0.05):
    """Expected inverse depth under P(plane) = softmax(-cost / tau), as in GC-Net and MVSNet."""
    logit = -cost / tau
    P = np.exp(logit - logit.max(0))
    P /= P.sum(0)
    return 1 / np.tensordot(inv_z, P, 1), P


agg = np.sort(C, 0)[:2].mean(0)
step = inv_z[0] - inv_z[1]                                           # plane spacing in 1/z
i_gt = (inv_z[0] - 1 / Z_gt) / step                                  # true plane index (real)
inlier = np.abs(agg.argmin(0) - i_gt) <= 2                           # WTA within 2 planes
for name, z in (("integer WTA", 1 / inv_z[agg.argmin(0)]), ("WTA + parabola", z_best2),
                ("soft-argmin tau=0.05", soft_argmin(inv_z, agg, 0.05)[0]),
                ("soft-argmin tau=0.01", soft_argmin(inv_z, agg, 0.01)[0])):
    err = ((inv_z[0] - 1 / z) / step - i_gt)[inlier]                 # error in plane spacings
    print("%-21s RMS error %.3f planes" % (name, np.sqrt(np.mean(err ** 2))))
print("pixels with WTA within 2 planes: %.1f%%" % (100 * inlier.mean()))
```

勝者総取りが真値から 2 平面以内に入る 88.4% の画素で、RMS 誤差は整数 WTA が `0.611` 平面、放物線付きが `0.535`、$\tau = 0.05$ の soft-argmin が `1.566`、$\tau = 0.01$ で `0.705` です。幅の広い手作りのコスト曲線では、soft-argmin は普通の WTA より**悪く**なります。遠くの「少しだけ悪い」平面の確率質量が平均を引っ張るからです。分布が鋭いときにしか働かず、ネットワークはそれを鋭くすることを学ばなければなりません。MVSNet の L1 損失は期待値にしか作用しないので、平均がたまたま正しい二峰の $P$ をそれだけでは排除できません。そのため R-MVSNet は真の平面に対するクロスエントロピー損失で $P$ を直接学習し、ほかの手法はピーク周りの窓の中だけで期待値を取ります。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-soft-argmin.svg" localized="true" caption="(a) プローブ A のベスト 2 コスト（黒）と、$\tau=0.05$（橙）と $\tau=0.01$（紫）の softmax 確率。この曲線には綺麗な最小が一つだけあります。整数の argmin は 6.43 m の平面で、soft-argmin は平面の間を補間します。6.31 m（$\tau=0.05$、手前の平面へ裾を引く広い分布）と 6.34 m（$\tau=0.01$）で、真値は 6.35 m です。(b) 視点 1 だけで見たプローブ C：範囲の手前端（2.5 m）、3.5 m 付近、6.1 m 付近に三つの最小（真値 6.25 m、破線）。argmin は間違った最小を選びます（3.54 m）。$\tau = 0.05$ の soft-argmin は山の間の 3.87 m、どの平面も支持しない奥行きに落ち、$\tau=0.01$ では 2.5 m の山に少し引かれて 3.48 m です。(c) WTA が 2 平面以内に入る 88% の画素での、平面間隔を単位とした RMS 誤差：整数 WTA 0.61、放物線付き WTA 0.53、soft-argmin 1.57（$\tau=0.05$）と 0.70（$\tau=0.01$）。" %}

### 5.3 スケールさせる工夫と、ステレオの系譜

MVSNet 以降の主な研究の流れです（いずれも下の論文表で確認済み）。

- **再帰的な正則化。** R-MVSNet（Yao ら、2019）は 3D CNN の代わりに畳み込み GRU でコストボリュームを奥行きスライス 1 枚ずつ処理し、メモリが $D$ とともに増えないようにしました。
- **粗から密へのカスケード。** CasMVSNet（Gu ら、2020）は低解像度で奥行き範囲全体の粗いコストボリュームを作り、次に高解像度で前段の推定の周りに狭いボリュームを作ります。同じ奥行き精度がずっと少ない平面で得られます。
- **学習型 PatchMatch。** PatchmatchNet（Wang ら、2021）は 4 節をネットワークにしました。学習した適応的な伝播と評価を粗から密へ反復し、完全なコストボリュームを必要としません。

2 視点ステレオのネットワークは並行した道をたどりました。GC-Net が 3D CNN のコストボリュームと soft-argmin を導入し、RAFT-Stereo（Lipson ら、2021）は 3D CNN を、全ペア相関ピラミッドに駆動される視差場の再帰的更新で置き換え（第 3 回の RAFT のステレオ版）、FoundationStereo（Wen ら、CVPR 2025）は凍結した単眼深度モデル（Depth Anything V2）の特徴をマッチング用の特徴に取り込んでゼロショットで汎化します。学習型ステレオと MVS は単眼深度からますます多くを借りるようになっており、それが次節の話題です。

学習型 MVS もまだ**既知のカメラ**を必要とします。DUSt3R、VGGT、Depth Anything 3（Lin ら、arXiv 2025 年 11 月、ICLR 2026）などのフィードフォワード 3D モデルは、姿勢のない画像から奥行きとカメラ姿勢を同時に予測します。これらは[第 9 回]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})の主題です。

## 6. 単眼深度推定

### 6.1 1 枚では足りない理由、それでもうまくいく理由

1 枚の画像からは、奥行きは原理的に曖昧です。シーン全体をカメラ中心を基準に $s$ 倍すると、各点 $\mathbf X\_c$ は $s\mathbf X\_c$ になり、$K(s\mathbf X\_c) \sim K\mathbf X\_c$ は同じ画素に投影されます。ドールハウスと本物の家が同じ写真になりえます。さらに悪いことに、焦点距離が奥行きと結びついています。奥行き $z$ にある高さ $h$ の物体の像の高さは $fh/z$ なので、長いレンズと遠い物体は同じに見えます。

それでも人は片目で奥行きを判断します。世界は任意ではないからです。見慣れた物の大きさ、平行線の透視（第 1 回の消失点）、テクスチャの勾配、隠れの順序、陰影、かすみ、ぼけ。十分な画像で学習したネットワークは同じ手がかりを学びます。追加情報なしに学べないのは全体のスケール（とカメラが未知なら焦点距離）です。そのため単眼深度モデルには二種類あります。未知のスケールとシフトを除いて奥行きを予測する**相対**（アフィン不変）モデルと、メートル単位で予測し、何らかの方法でカメラを解決しなければならない**メトリック**モデルです。

### 6.2 スケール不変な損失

初期の深層単眼深度ネットワークの一つである Eigen、Puhrsch、Fergus（2014）は、全体のスケールを無視する損失を導入しました。$n$ 画素について $g\_i = \log\hat z\_i - \log z\_i^\ast$ とすると

$$
D(\hat{\mathbf z}, \mathbf z^\ast) = \frac1n\sum_i g_i^2 - \frac{\lambda}{n^2}\Big(\sum_i g_i\Big)^2 .
$$

$\lambda = 1$ ではこれは $g$ の分散で、$\hat{\mathbf z}$ を任意の $s$ 倍すると各 $g\_i$ に $\log s$ が足されるだけなので、分散は変わりません。論文は絶対精度と相対精度の折衷として $\lambda = 0.5$ を使いました。6.4 節のコードがこの不変性を数値で確かめています：`si_log: 0.00035, after doubling the depth: 0.00035`。

### 6.3 データセットを混ぜる：アフィン不変な逆奥行き（MiDaS）

**多数の**データセットで同時に学習するには、スケール不変だけでは足りません。ステレオ映画や Web のステレオ画像は、未知の基線と未知のオフセット（カメラの輻輳）を含む視差を与え、レーザースキャンはメトリックな奥行きを、Structure-from-Motion はスケール不定の奥行きを与えます。MiDaS（Ranftl ら、arXiv 2019、TPAMI 2022）はこれらをすべて両立させました。**未知のスケールとシフトを除いた逆奥行き**を予測し、損失を計算する前に位置合わせします。予測 $\mathbf p$ と目標の逆奥行き $\mathbf w^\ast$ について

$$
(s, t) = \arg\min_{s, t}\sum_i \big(s\,p_i + t - w_i^\ast\big)^2 ,
$$

これは線形最小二乗問題で、正規方程式から閉じた形の解が得られます。

$$
\begin{pmatrix} \sum_i p_i^2 & \sum_i p_i \\ \sum_i p_i & n \end{pmatrix}
\begin{pmatrix} s \\ t \end{pmatrix}
=
\begin{pmatrix} \sum_i p_i w_i^\ast \\ \sum_i w_i^\ast \end{pmatrix},
$$

その後で残差 $s\,p\_i + t - w\_i^\ast$ にペナルティを課します（MiDaS はそのロバストなトリム版と、鋭いエッジのための勾配一致項を使います）。なぜ逆奥行きか。最大のデータ源である視差データは逆奥行きのアフィン関数であり、$w$ のアフィンモデルこそ未知の基線とオフセットが生むものだからです。DPT（Ranftl ら、2021）は CNN のバックボーンを Vision Transformer に置き換えました。そのデコーダーは Depth Anything をはじめ多くの後続モデルで使われています。

### 6.4 相対モデルを使う：実践での位置合わせ

少数のメトリックなアンカーがあれば、相対予測はメトリック深度になります。LiDAR の点、スケールの分かった SfM の点、床の高さ、ステレオ対などです。下のコードは、相対ネットワークを真の逆奥行きのアフィン関数に、空間的に相関した滑らかな誤差と画素ノイズを加えたものとして模擬し（実際のネットワークの誤差も似ています。物体の上では滑らかで、境界で大きい）、位置合わせします。

```python
def align_scale_shift(pred, target, mask):
    """Least-squares s, t with s * pred + t ~ target on the mask (MiDaS-style alignment)."""
    A = np.stack([pred[mask], np.ones(mask.sum())], 1)
    s, t = np.linalg.lstsq(A, target[mask], rcond=None)[0]
    return s, t


def depth_metrics(z, z_gt):
    ratio = np.maximum(z / z_gt, z_gt / z)
    return dict(AbsRel=np.mean(np.abs(z - z_gt) / z_gt), RMSE=np.sqrt(np.mean((z - z_gt) ** 2)),
                delta1=np.mean(ratio < 1.25))


def fmt(m):
    return "AbsRel %.4f, RMSE %.3f m, delta1 %.3f" % (m["AbsRel"], m["RMSE"], m["delta1"])


def si_log(z, z_gt, lam=1.0):
    """Scale-invariant log error of Eigen et al. (2014); lam = 1 ignores any global scale."""
    g = np.log(z) - np.log(z_gt)
    return np.mean(g ** 2) - lam * np.mean(g) ** 2


rng = np.random.default_rng(3)
smooth = ndi.gaussian_filter(rng.normal(size=(H, W)), 12)
smooth /= smooth.std()
# a stand-in for a relative-depth network: affine in inverse depth, plus smooth and pixel errors
pred = 1.7 / Z_gt + 0.25 + 0.006 * smooth + rng.normal(0, 0.003, (H, W))
everything = np.ones((H, W), bool)
s, t = align_scale_shift(pred, 1 / Z_gt, everything)
z_al = 1 / (s * pred + t)
print("scale-and-shift: s = %.4f, t = %.4f; %s" % (s, t, fmt(depth_metrics(z_al, Z_gt))))
k_med = np.median(Z_gt * pred)                                       # scale only: z = k / pred
print("scale only:      k = %.4f;           %s" % (k_med, fmt(depth_metrics(k_med / pred, Z_gt))))
print("si_log: %.5f, after doubling the depth: %.5f" % (si_log(z_al, Z_gt), si_log(2 * z_al, Z_gt)))
anchor_rel = {}
for n_anchor in (3, 10, 30, 100, 1000):                              # sparse metric anchors
    vals = []
    for trial in range(50):
        m = np.zeros(H * W, bool)
        m[rng.choice(H * W, n_anchor, replace=False)] = True
        s_, t_ = align_scale_shift(pred, 1 / Z_gt, m.reshape(H, W))
        zz = 1 / np.maximum(s_ * pred + t_, 1e-3)
        vals.append(depth_metrics(zz, Z_gt)["AbsRel"])
    anchor_rel[n_anchor] = (np.median(vals), np.percentile(vals, 90))
    print("%4d anchors: median AbsRel %.4f, 90th percentile %.4f" % (n_anchor, *anchor_rel[n_anchor]))
```

当てはめた `s = 0.5876, t = -0.1476` は、模擬したアフィン写像の正確な逆 $1/1.7 = 0.5882$ と $-0.25/1.7 = -0.1471$ に近く、`AbsRel 0.0144, RMSE 0.105 m, delta1 1.000` を与えます。シフトを無視してスケールだけを合わせると（$z = k/p$、$k$ は中央値）`AbsRel 0.1205, RMSE 0.751 m` で、8 倍悪くなります。モデルの出力がアフィン不変なときによくある誤りです。疎なアンカーでは、ランダムな 3 点で AbsRel の中央値は 0.0189 ですが裾が悪く（90 パーセンタイル 0.0677）、10 点で 0.0154（0.0180）、30 点で全 19,200 画素と同等（0.0148 対 0.0144）になります。未知数が二つなのでアンカーは少なくてよいのですが、散らばっている必要があります。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-mono-align.svg" localized="true" caption="(a) 模擬した相対深度の予測 $p$ と真の逆奥行き：ばらつきのあるアフィン関係で、当てはめた直線は $w = 0.588\,p - 0.148$。(b) スケールとシフトで位置合わせした後の相対奥行き誤差（AbsRel 0.0144）。残るのは予測誤差の滑らかな低周波成分で、どんな大域的な位置合わせでも取り除けません。(c) $n$ 個のランダムなメトリックアンカーで位置合わせした後の AbsRel（各 50 回の試行、中央値と 90 パーセンタイル）。点線は全画素での位置合わせ（灰、0.0144）とスケールのみの位置合わせ（赤、0.1205）。" %}

**評価指標。** 単眼深度の論文は **AbsRel** $= \frac1n\sum\lvert\hat z - z^\ast\rvert/z^\ast$、メートル単位の **RMSE**、そしてしきい値精度 **$\delta\_1$**（$\max(\hat z/z^\ast, z^\ast/\hat z) < 1.25$ を満たす画素の割合。しきい値 $1.25^2$、$1.25^3$ の $\delta\_2$、$\delta\_3$ もあります）を報告します。相対モデルでは、これらの指標は上の位置合わせの後で計算します。$\delta\_1$ がいかに甘いかに注意してください。AbsRel が 8 倍悪いスケールのみの結果でも、$\delta\_1 = 0.991$ です。

### 6.5 自己教師あり学習と基盤モデル

真の奥行きは高価です。**自己教師あり**手法は奥行きラベルのない動画やステレオ対で学習します。あるフレームの奥行き（とカメラの動き）を予測し、3.2 節の再投影（平面の代わりに画素ごとの奥行きを使う）で隣のフレームをワープし、光度誤差を最小化します。Monodepth2（Godard ら、2019）は、ソースフレームにわたる画素ごとの最小（隠れに対する私たちのベスト k と同じ考え方）と静止画素の自動マスクで、これを頑健にしました。

最近の飛躍は規模から来ました。**Depth Anything**（Yang ら、CVPR 2024）は、150 万枚のラベル付き画像に加え、教師モデルで疑似ラベルを付けた約 6,200 万枚のラベルなし画像で DPT 型のモデルを学習しました。強いデータ拡張と、凍結した DINOv2 エンコーダーへの特徴整合損失を使っています。**Depth Anything V2**（NeurIPS 2024）は教師モデルの実ラベル画像を精密な合成ラベル画像に置き換え、細部を鋭くしました。**Marigold**（Ke ら、CVPR 2024）は別の道をとりました。Stable Diffusion の画像生成器を微調整し、画像を条件としてアフィン不変な奥行きマップを「生成」させ、生成器が持つシーンの事前知識を利用します。**Video Depth Anything**（Chen ら、CVPR 2025）は時空間ヘッドを加え、長い動画で一貫した奥行きを出します。

### 6.6 メトリック深度とカメラの問題

メートル単位で予測するには、6.1 節の $f$-$z$ の曖昧さのため、モデルはカメラを知る必要があります。2024-2025 年世代のメトリックモデルはこれをさまざまに扱います。

- **正準カメラ。** Metric3D（Yin ら、ICCV 2023）と Metric3D v2（Hu ら、TPAMI 2024）はすべての学習画像（またはそのラベル）を正準の焦点距離に変換し、「高さ 50 画素の車」が常に同じ奥行きを意味するようにします。テスト時には既知の焦点距離で予測を元に戻します。
- **カメラを予測する。** UniDepth（Piccinelli ら、CVPR 2024）は専用モジュールでカメラ光線を予測し、それを条件に奥行きを出します。Depth Pro（Bochkovskii ら、ICLR 2025）は焦点距離そのものを推定し、1 秒未満で鋭いメトリック深度を生成します。
- **奥行きではなく幾何を予測する。** MoGe（Wang ら、CVPR 2025）はアフィン不変な 3D 点マップ（奥行きと光線を一緒に）を予測し、小さな最適化で焦点距離とシフトを復元します。

メトリック単眼深度は今や、ほとんどどこでも事前知識として使えるほど良くなりました。MVS や SLAM の初期化、センサー奥行きの穴埋め、NeRF や Gaussian Splatting の教師、ロボットへの最初の幾何の推測です。それでも学習による推測であることに変わりはありません。近距離ではキャリブレーション済みのステレオ対より誤差が大きく、珍しいシーン（鏡、絵画、ミニチュア模型）では自信満々に間違えることがあります。上の位置合わせのように幾何的な測定と組み合わせれば、両方の良いところを得られます。

## 7. 奥行きの統合

### 7.1 多数の奥行きマップから一つのモデルへ

MVS は画像ごとに 1 枚の奥行きマップを、深度カメラは毎秒 30 枚を出します。それらは重なり合い、ノイズのため少しずつ食い違い、外れ値を含みます。統合はそれらを一つの整合したモデルにします。COLMAP が使う最も単純な統合は点の上で行います。

1. **各奥行きマップを整合性でフィルタリング**：画素の 3D 点を隣の視点に投影し、そこで隣の奥行きを読み、逆投影し、最初の視点に投影し直します。1 画素程度以内に戻り、奥行きが 1% 程度以内で一致すれば、その画素はその隣と整合しています。2 つか 3 つ以上の隣と整合する画素を残します。
2. すべての視点で残った点を**併合**し、複数の視点で同じ画素に投影される点は平均します。

結果は密な点群です。表面を得るには（そしてノイズを正しく平均するには）、ボリューム表現が必要です。

### 7.2 打ち切り符号付き距離関数

Curless と Levoy（1996）は、距離画像を**ボクセルグリッド**で統合することを提案しました。各ボクセル中心 $\mathbf v$ に、最も近い表面までの**符号付き距離**を保存します。手前（自由空間）は正、後ろ（内部）は負、表面上でゼロです。各奥行きマップはカメラの視線方向に沿った**射影的な**符号付き距離を寄与します。$\mathbf v$ を奥行きマップに投影して画素 $\mathbf x(\mathbf v)$ とボクセル自身の奥行き $z(\mathbf v)$ を得れば

$$
\mathrm{sdf}(\mathbf v) = z_{\text{meas}}\big(\mathbf x(\mathbf v)\big) - z(\mathbf v),
\qquad
\mathrm{tsdf}(\mathbf v) = \operatorname{clamp}\!\big(\mathrm{sdf}(\mathbf v)/\mu,\, -1,\, 1\big).
$$

二つの規則が頑健さを生みます。**$\pm\mu$ での打ち切り**：表面から遠い所では射影的な距離は意味を持たない（最も近い表面までではなく光線に沿って測っている）ので、遠く手前のボクセルは単に「自由」（+1）とし、測った表面より $\mu$ 以上後ろのボクセルは**まったく更新しません**。表面の後ろに何があるかは見えないからです。すべての奥行きマップでの**重み付き平均**：

$$
T_{k}(\mathbf v) = \frac{W_{k-1}(\mathbf v)\,T_{k-1}(\mathbf v) + w_k\,\mathrm{tsdf}_k(\mathbf v)}{W_{k-1}(\mathbf v) + w_k},
\qquad W_k = W_{k-1} + w_k .
$$

距離を平均するのが正しい理由：各光線上の奥行きノイズがガウス分布なら、多数の観測からの表面位置の最尤推定は（重み付き）平均であり、平均した距離関数のゼロ交差がまさにその平均です。重み $w\_k$ には信頼度を込められます。斜めからの観測、遠距離、ToF の振幅が低いときは小さくします。表面は $T$ の**ゼロ等値面**で、マーチングキューブ（[グラフィックス第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})で導出）で取り出すか、レイキャストで直接描画します。

**KinectFusion**（Newcombe ら、2011）はこれを GPU でリアルタイムにしました。新しい奥行きフレームを、現在の TSDF をレイキャストしたものに ICP で位置合わせし（トラッキング）、それから統合します（マッピング）。密なグリッドはほとんどのボクセルが空なので無駄が多く、**ボクセルハッシング**（Nießner ら、2013）は表面の近くにだけ小さなボクセルブロックを割り当ててハッシュテーブルで索引付けし、部屋規模や建物規模の統合を可能にしました。密なグリッド、八分木、ハッシュ、その他の表現の間のトレードオフは[第 8 回]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})の主題です。

### 7.3 2D の TSDF 統合をコードで

平均の効果を見るため、2D シーン（円板と正方形）のノイズを含む 1D 奥行きスキャンを、シーンの周りを回るカメラで撮って統合します。ノイズは距離とともに増え、$\sigma = 2\ \text{mm} + 5\ \text{mm}\cdot z^2$（$z$ はメートル）で、ステレオや構造化光のセンサーに似せています。

```python
def sdf_scene(p):
    """2D scene: a disk and a square. Negative inside, positive outside."""
    d_disk = np.linalg.norm(p - [0.45, 0.35], axis=-1) - 0.55
    q = np.abs(p - [-0.5, -0.4]) - 0.4
    d_box = np.linalg.norm(np.maximum(q, 0), axis=-1) + np.minimum(q.max(-1), 0)
    return np.minimum(d_disk, d_box)


def camera_axes(ang):
    return np.array([np.cos(ang), np.sin(ang)]), np.array([np.sin(ang), -np.cos(ang)])  # fwd, right


def scan(pos, ang, n=96, fov=np.deg2rad(60), rng=None):
    """1D depth camera at pos looking along ang: z-depth of n pixels (sphere tracing), with noise
    sigma = 2 mm + 5 mm * z^2 that grows with distance like a stereo or structured-light sensor."""
    fwd, right = camera_axes(ang)
    f = (n / 2) / np.tan(fov / 2)
    u = (np.arange(n) + 0.5 - n / 2) / f
    dirs = fwd + u[:, None] * right                                  # z-component 1 along fwd
    z = np.zeros(n)
    for _ in range(200):
        z += sdf_scene(pos + z[:, None] * dirs) / np.linalg.norm(dirs, axis=1)
    z[z > 6] = np.nan                                                # missed everything
    return z + rng.normal(0, 0.002 + 0.005 * z ** 2)


def integrate(T, Wt, grid, pos, ang, z_meas, fov=np.deg2rad(60), mu=0.08):
    """KinectFusion-style update of the TSDF T and weights Wt (arrays over grid points)."""
    n = len(z_meas)
    fwd, right = camera_axes(ang)
    f = (n / 2) / np.tan(fov / 2)
    d = grid - pos
    z, x = d @ fwd, d @ right
    u = np.floor(f * x / np.maximum(z, 1e-9) + n / 2).astype(int)   # pixel of each grid point
    ok = (z > 1e-3) & (u >= 0) & (u < n)
    zm = z_meas[np.clip(u, 0, n - 1)]
    sdf = zm - z                                                     # projective signed distance
    ok &= np.isfinite(zm) & (sdf > -mu)                              # skip far behind the surface
    tsdf = np.clip(sdf / mu, -1.0, 1.0)
    T[ok] = (Wt[ok] * T[ok] + tsdf[ok]) / (Wt[ok] + 1)               # running weighted average
    Wt[ok] += 1


def zero_crossings(T, Wt, xs):
    """Surface points: linear interpolation where T changes sign between observed neighbours."""
    pts = []
    for axis in (0, 1):
        a, b = (T, np.roll(T, -1, axis))
        wa, wb = Wt, np.roll(Wt, -1, axis)
        m = (a * b < 0) & (wa > 0) & (wb > 0)
        if axis == 0:
            m[-1, :] = False
        else:
            m[:, -1] = False
        iy, ix = np.nonzero(m)
        frac = a[m] / (a[m] - b[m])
        px, py = xs[ix], xs[iy]
        h = xs[1] - xs[0]
        pts.append(np.stack([px + (axis == 1) * frac * h, py + (axis == 0) * frac * h], 1))
    return np.concatenate(pts)


def scan_points(pos, ang, z, fov=np.deg2rad(60)):
    """The 2D points measured by one scan."""
    fwd, right = camera_axes(ang)
    n = len(z)
    u = (np.arange(n) + 0.5 - n / 2) / ((n / 2) / np.tan(fov / 2))
    ok = np.isfinite(z)
    return pos + z[ok, None] * (fwd + u[ok, None] * right)


xs_g = np.linspace(-1.5, 1.5, 201)
grid = np.stack(np.meshgrid(xs_g, xs_g), -1).reshape(-1, 2)          # (x, y) of every cell
rng = np.random.default_rng(5)
T, Wt = np.ones(len(grid)), np.zeros(len(grid))
n_scans, poses, tsdf_err = 36, [], {}
for k in range(n_scans):
    th = 2 * np.pi * k / n_scans
    pos = 2.0 * np.array([np.cos(th), np.sin(th)])                   # on a circle of radius 2 m
    ang = th + np.pi + rng.uniform(-0.1, 0.1)                        # look back at the origin
    z_meas = scan(pos, ang, rng=rng)
    integrate(T, Wt, grid, pos, ang, z_meas)
    poses.append((pos, ang, z_meas))
    if k + 1 in (1, 2, 4, 8, 16, 36):
        P = zero_crossings(T.reshape(201, 201), Wt.reshape(201, 201), xs_g)
        tsdf_err[k + 1] = np.sqrt(np.mean(sdf_scene(P) ** 2))
raw = np.concatenate([scan_points(*p) for p in poses])
print("raw points: RMS distance to the surface %.2f mm" % (1000 * np.sqrt(np.mean(sdf_scene(raw) ** 2))))
print("fused TSDF:", ", ".join("%d scans %.2f mm" % (k, 1000 * v) for k, v in tsdf_err.items()))
```

出力：生の測定点の真の表面までの RMS 距離は `14.02 mm` です。統合した TSDF のゼロ等値線の RMS 誤差は、1 スキャン後に `15.36 mm`、2、4、8、16 スキャン後に `12.11`、`11.33`、`10.32`、`8.31 mm`、36 スキャンすべての後に `4.41 mm` です。各表面点を見るスキャンの数が増え、平均がノイズをおおむねその数の平方根に反比例して減らします。36 スキャン後、表面上のボクセルが更新された回数の中央値は 10 で、$14.0/\sqrt{10} = 4.4$ mm です。（1 スキャン後の誤差がそのスキャン自身の点の 13.1 mm をわずかに上回るのは、1.5 cm のグリッドとゼロ交差の線形補間が少し誤差を足すためです。）

{% include blog_figure.liquid path="assets/img/blog/3d-vision/07-tsdf.svg" localized="true" caption="2D の TSDF 統合（点線の 3 m 四方に 201 x 201 のグリッド、打ち切り $\mu = 8$ cm）。(a) 右のカメラ（橙の三角、細い橙の光線、黒い測定点）からの 1 回のスキャン。TSDF は観測された自由空間で +1（青）、測った表面でゼロを横切り、そのすぐ後ろで赤になります。それより後ろや視野の外は更新されません。破線の輪郭が真のシーンです。(b) 半径 2 m の円上からの 36 スキャンの後（カメラは 3 台に 1 台を橙の三角で表示）：ゼロ等値線（紫、白い遷移帯の下）が両方の物体を囲んで閉じます。(c) 取り出したゼロ交差の真の表面までの RMS 距離を統合したスキャン数に対して示したもの。15.4 mm から 4.4 mm へ下がり、生の点は 14.0 mm です。" %}

### 7.4 TSDF 統合の限界

TSDF 統合は頑健で単純なので、今もあらゆる深度カメラの SDK に入っています。その限界が次の回々の動機になります。一様なグリッドはメモリを浪費するか細部をぼかします。打ち切り幅より薄い構造（椅子の脚、ケーブル）は、反対側から見ると平均で消えてしまいます。一方の側の「後ろ」がもう一方の側の「手前」を上書きするからです。統合は正確な既知の姿勢を仮定し、姿勢誤差は表面をにじませます（[第 6 回]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})の SLAM のループクロージャーは後から TSDF を変形させます）。そして幾何だけを保存し、見え方や視点依存の効果は保存しません。[第 8 回]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})は TSDF をメッシュ、点群、ニューラル場、ガウシアンと比較し、[第 9 回]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})には対話的な TSDF 統合ウィジェットと完全な復元パイプラインがあります。

## 8. 奥行きと MVS の評価

**奥行きマップ**は、より良いセンサーによる真値と画素ごとに比べて評価します。AbsRel、RMSE、$\delta\_1$（6.4 節）、誤差がしきい値以下の画素の割合（私たちの「1% 以内」）、ステレオでは **bad-$\tau$ 率**（視差誤差が $\tau$ 画素を超える画素の割合）です。古典的なベンチマーク：Middlebury（構造化光の真値を持つ高解像度の屋内ステレオで、Scharstein と Szeliski（2002）の分類に沿って構成）、KITTI（自動運転、疎な LiDAR 真値）、NYU Depth v2（屋内の Kinect）、ETH3D。

**MVS の復元**は点群として参照スキャンと比較し、適合率と再現率に相当する二つの数で評価します。**精度**（accuracy）は各復元点から参照までの距離（点は正しいか）、**完全性**（completeness）は各参照点から復元までの距離（表面は覆われているか）です。Tanks and Temples（Knapitsch ら、2017）はこれらを距離しきい値 $\tau$ での **F スコア**にまとめます。適合率 $P(\tau)$ は参照から $\tau$ 以内にある復元点の割合、再現率 $R(\tau)$ は復元から $\tau$ 以内にある参照点の割合で、$F = 2PR/(P + R)$ です。主な MVS ベンチマークは DTU（Jensen ら、2014：ロボットアームに載せたカメラで撮影した卓上の物体と、構造化光の参照スキャン）、ETH3D（Schöps ら、2017：レーザースキャン付きの高解像度の屋内外シーン）、Tanks and Temples（大規模な屋内外シーン）です。指標が何を評価するかに注意してください。不確かな点を消せば精度は上げられるので、必ず両方の数を見ましょう。

## 9. 実践的な指針

- **ハードウェアを選べて、屋内で近距離：** 能動センサー（構造化光か iToF）を使い、TSDF で統合すれば完了です。部屋の隅のマルチパスと、黒い物や光沢のある物に注意。
- **屋外や遠距離：** $\sigma\_z = z^2\sigma\_\delta/(fB)$ から基線を選んだステレオ、予算があれば LiDAR。
- **写真からのオフライン復元：** SfM（[第 5 回]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})）、次に COLMAP の PatchMatch MVS（似た学習データがあれば学習型 MVS モデル）、幾何的フィルタリング、統合、メッシュ化（[第 9 回]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})）。
- **画像が 1 枚しかないとき、または事前知識が必要なとき：** 最新の単眼モデル。相対モデルに手持ちのメトリックアンカーへのスケールとシフトの位置合わせを組み合わせるか、正しい内部パラメータでメトリックモデルを使います。
- **常に：** 距離ではなく z 奥行きを保存し（あるいは明記し）、無効な画素は NaN か 0 とマスクで保持し、逆奥行きでサンプルして回帰し、相対誤差を報告し、境界とテクスチャのない領域を目で確かめます。平均誤差はそれらを隠すからです。

## 試してみよう

- 3.9 節の**平面掃引ウィジェット**で、プローブをポスターに置き、すべての窓サイズと両方のコストを試してください。どの設定でもはっきりした最小は出ません。次に縦縞のプローブが正しい奥行きになる基線を探し、なぜそれが動くのかを 3.6 節で説明してください。
- 同じウィジェットで、3x3 と 9x9 の窓での WTA の精度を比べ、箱と球の近くの奥行きマップを見て、大きな窓がどこで損をするかを確かめましょう。
- ホームページの[インタラクティブラボ]({{ '/' | relative_url }}#lab)はレンダリング側を見せてくれます。その Gaussian World デモは、奥行きマップや MVS が初期化を助ける種類の表現からシーンを描画します。

## 代表的な論文

| 論文 | 会議/論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| A multiple-baseline stereo (Okutomi, Kanade) | TPAMI | 1993 | [DOI](https://doi.org/10.1109/34.206955) | 逆奥行き上で複数基線の SSD を足し、繰り返し模様の曖昧さを除く |
| A space-sweep approach to true multi-image matching (Collins) | CVPR | 1996 | [DOI](https://doi.org/10.1109/CVPR.1996.517097) | 平面掃引 |
| A volumetric method for building complex models from range images (Curless, Levoy) | SIGGRAPH | 1996 | [DOI](https://doi.org/10.1145/237170.237269) | 重み付き平均による TSDF 統合 |
| Handling occlusions in dense multi-view stereo (Kang, Szeliski, Chai) | CVPR | 2001 | [DOI](https://doi.org/10.1109/CVPR.2001.990462) | 隠れに対するシフト可能な窓と画素ごとの視点部分集合 |
| A taxonomy and evaluation of dense two-frame stereo correspondence algorithms (Scharstein, Szeliski) | IJCV | 2002 | [DOI](https://doi.org/10.1023/A:1014573219977) | マッチングコスト、集約、最適化、精密化。Middlebury ベンチマーク |
| Stereo processing by semiglobal matching and mutual information (Hirschmüller) | TPAMI | 2008 | [DOI](https://doi.org/10.1109/TPAMI.2007.1166) | SGM |
| PatchMatch: a randomized correspondence algorithm for structural image editing (Barnes et al.) | ACM TOG (SIGGRAPH) | 2009 | [DOI](https://doi.org/10.1145/1531326.1531330) | ランダム初期化、伝播、ランダム探索 |
| Accurate, dense, and robust multiview stereopsis (Furukawa, Ponce) | TPAMI | 2010 | [DOI](https://doi.org/10.1109/TPAMI.2009.161) | PMVS、パッチベースの MVS |
| PatchMatch stereo: stereo matching with slanted support windows (Bleyer, Rhemann, Rother) | BMVC | 2011 | [DOI](https://doi.org/10.5244/C.25.14) | PatchMatch で求める画素ごとの傾いた平面 |
| Structured-light 3D surface imaging: a tutorial (Geng) | Advances in Optics and Photonics | 2011 | [DOI](https://doi.org/10.1364/AOP.3.000128) | 構造化光の符号化方式のサーベイ |
| KinectFusion: real-time dense surface mapping and tracking (Newcombe et al.) | ISMAR | 2011 | [DOI](https://doi.org/10.1109/ISMAR.2011.6092378) | ICP トラッキング付きのリアルタイム TSDF 統合 |
| Real-time 3D reconstruction at scale using voxel hashing (Nießner et al.) | ACM TOG (SIGGRAPH Asia) | 2013 | [DOI](https://doi.org/10.1145/2508363.2508374) | ハッシュテーブルに格納した疎な TSDF ブロック |
| Large scale multi-view stereopsis evaluation (Jensen et al.) | CVPR | 2014 | [DOI](https://doi.org/10.1109/CVPR.2014.59) | DTU MVS ベンチマーク |
| Depth map prediction from a single image using a multi-scale deep network (Eigen, Puhrsch, Fergus) | NeurIPS | 2014 | [arXiv](https://arxiv.org/abs/1406.2283) | 初期の深層単眼深度推定。スケール不変損失 |
| Massively parallel multiview stereopsis by surface normal diffusion (Galliani, Lasinger, Schindler) | ICCV | 2015 | [DOI](https://doi.org/10.1109/ICCV.2015.106) | Gipuma：GPU 上の赤黒 PatchMatch |
| Pixelwise view selection for unstructured multi-view stereo (Schönberger et al.) | ECCV | 2016 | [DOI](https://doi.org/10.1007/978-3-319-46487-9_31) | COLMAP MVS：奥行き、法線、視点選択の同時推定 |
| End-to-end learning of geometry and context for deep stereo regression (Kendall et al.) | ICCV | 2017 | [arXiv](https://arxiv.org/abs/1703.04309) | GC-Net：3D CNN のコストボリュームと soft-argmin |
| A multi-view stereo benchmark with high-resolution images and multi-camera videos (Schöps et al.) | CVPR | 2017 | [DOI](https://doi.org/10.1109/CVPR.2017.272) | ETH3D |
| Tanks and Temples: benchmarking large-scale scene reconstruction (Knapitsch et al.) | ACM TOG (SIGGRAPH) | 2017 | [DOI](https://doi.org/10.1145/3072959.3073599) | 復元の適合率、再現率、F スコア |
| MVSNet: depth inference for unstructured multi-view stereo (Yao et al.) | ECCV | 2018 | [arXiv](https://arxiv.org/abs/1804.02505) | 分散コストボリュームによる学習型平面掃引 |
| Recurrent MVSNet for high-resolution multi-view stereo depth inference (Yao et al.) | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1902.10556) | GRU による正則化、メモリが $D$ に依存しない |
| Digging into self-supervised monocular depth estimation (Godard et al.) | ICCV | 2019 | [arXiv](https://arxiv.org/abs/1806.01260) | Monodepth2 |
| Multi-scale geometric consistency guided multi-view stereo (Xu, Tao) | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1904.08103) | ACMM：適応的な市松模様の伝播、マルチスケールの整合性 |
| Cascade cost volume for high-resolution multi-view stereo and stereo matching (Gu et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1912.06378) | CasMVSNet：粗から密への奥行き範囲 |
| Towards robust monocular depth estimation: mixing datasets for zero-shot cross-dataset transfer (Ranftl et al.) | TPAMI | 2022 | [arXiv](https://arxiv.org/abs/1907.01341) | MiDaS：混合データでのアフィン不変な逆奥行きの学習 |
| Vision transformers for dense prediction (Ranftl, Bochkovskiy, Koltun) | ICCV | 2021 | [arXiv](https://arxiv.org/abs/2103.13413) | DPT |
| PatchmatchNet: learned multi-view patchmatch stereo (Wang et al.) | CVPR | 2021 | [arXiv](https://arxiv.org/abs/2012.01411) | 学習型の反復 PatchMatch |
| RAFT-Stereo: multilevel recurrent field transforms for stereo matching (Lipson, Teed, Deng) | 3DV | 2021 | [arXiv](https://arxiv.org/abs/2109.07547) | 相関ピラミッド上の再帰的ステレオ |
| Depth Anything: unleashing the power of large-scale unlabeled data (Yang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2401.10891) | 6,200 万枚の疑似ラベル画像からの相対深度 |
| Repurposing diffusion-based image generators for monocular depth estimation (Ke et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.02145) | Marigold |
| UniDepth: universal monocular metric depth estimation (Piccinelli et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2403.18913) | 自己プロンプト型カメラモジュールによるメトリック深度 |
| Metric3D v2: a versatile monocular geometric foundation model (Hu et al.) | TPAMI | 2024 | [arXiv](https://arxiv.org/abs/2404.15506) | メトリック深度と法線のための正準カメラ空間 |
| Depth Anything V2 (Yang et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2406.09414) | 合成ラベルの教師モデル、より細かな細部 |
| Depth Pro: sharp monocular metric depth in less than a second (Bochkovskii et al.) | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2410.02073) | 焦点距離推定付きのゼロショットメトリック深度 |
| MoGe: unlocking accurate monocular geometry estimation for open-domain images (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2410.19115) | アフィン不変な点マップ |
| FoundationStereo: zero-shot stereo matching (Wen et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.09898) | 単眼基盤モデルの事前知識を使うステレオ |
| Video Depth Anything: consistent depth estimation for super-long videos (Chen et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.12375) | 時間的に一貫した動画の奥行き |
| Depth Anything 3: recovering the visual space from any views (Lin et al.) | ICLR | 2026 | [arXiv](https://arxiv.org/abs/2511.10647) | 任意枚数の視点から奥行きと姿勢を出す一つの Transformer（arXiv 2025 年 11 月） |

2026 年 11 月時点の状況：すべての項目は記載の会議・論文誌で発表済みです。Depth Anything 3 は 2025 年 11 月に arXiv で公開され、ICLR 2026 で発表されました。

## 学習リソース

- R. Szeliski『Computer Vision: Algorithms and Applications』第 2 版、2022：第 12 章（奥行き推定：ステレオ、平面掃引、MVS、単眼深度）と第 13 章（TSDF 統合を含む 3D 復元）。個人利用なら [szeliski.org/Book](https://szeliski.org/Book/) で無料です。
- Y. Furukawa、C. Hernández『Multi-View Stereo: A Tutorial』Foundations and Trends in Computer Graphics and Vision、2015：光度一貫性の尺度、奥行きマップベースの MVS、統合と評価をコンパクトにまとめています。
- R. Hartley、A. Zisserman『Multiple View Geometry in Computer Vision』第 2 版、2004、13.1 節（平面が誘導するホモグラフィ）。
- M. Hansard、S. Lee、O. Choi、R. Horaud『Time-of-Flight Cameras: Principles, Methods and Applications』Springer、2012。ToF センサーの物理とキャリブレーション。
- コード：[COLMAP](https://github.com/colmap/colmap)（PatchMatch MVS と統合）、[OpenMVS](https://github.com/cdcseacave/openMVS)、[Open3D](https://github.com/isl-org/Open3D)（`ScalableTSDFVolume` による TSDF 統合）、[MVSNet](https://github.com/YoYo000/MVSNet)、[CasMVSNet](https://github.com/alibaba/cascade-stereo)、[PatchmatchNet](https://github.com/FangjinhuaWang/PatchmatchNet)、[Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2)、[Depth Pro](https://github.com/apple/ml-depth-pro)、[UniDepth](https://github.com/lpiccinelli-eth/UniDepth)。
- ベンチマーク：[Middlebury stereo](https://vision.middlebury.edu/stereo/)、[ETH3D](https://www.eth3d.net/)、[Tanks and Temples](https://www.tanksandtemples.org/)。

## 演習

1. 純粋な回転（$\mathbf t = \mathbf 0$）だけで関係する 2 台のカメラでは、平面誘導ホモグラフィが平面によらないことを示してください。回転するカメラでの平面掃引ステレオにとって、これは何を意味しますか。[第 4 回]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})の退化とどう結びつきますか。

   <details markdown="1"><summary>ヒント</summary>

   $\mathbf t = \mathbf 0$ では項 $\mathbf t\mathbf n^\top/d$ が消え、どの平面でも $H = K\_s R K\_r^{-1}$ です。すべての仮説が同じワープを生み、どのコスト曲線も平らで、奥行きは観測できません。これが純回転の退化で、基線がなければ視差も三角測量もありません。実際には、MVS には十分な三角測量角を持つ視点が必要だということで、視点選択がほぼ重複した視点を捨てるのはそのためです。
   </details>

2. 平行化の場合 $x\_s = x - fB/z$ です。私たちの掃引は $z\_n$ と $z\_f$ の間で $1/z$ に等間隔な $D$ 枚の平面を使います。隣り合う仮説の画素間隔を導き、$f = 600$ px、$B = 0.12$ m、$z\_n = 0.5$ m、$z\_f = 10$ m のとき間隔が 0.5 px になる $D$ を選んでください。$z$ で等間隔にサンプルする場合、間隔をどこでも 0.5 px 未満に保つには何枚の平面が必要でしょうか。

   <details markdown="1"><summary>ヒント</summary>

   視差の範囲は $fB(1/z\_n - 1/z\_f) = 72 \cdot 1.9 = 136.8$ px なので、$w$ で等間隔な平面は $136.8/(D - 1)$ px 離れます。$D = 275$ で 0.5 px です。$z$ で等間隔なら、最悪の間隔は $z\_n$ で生じ、そこでは $\lvert\partial\delta/\partial z\rvert = fB/z\_n^2 = 288$ px/m です。0.5 px の刻みには $\Delta z = 1.74$ mm が必要なので、$9.5/0.00174 \approx 5500$ 枚、20 倍です。
   </details>

3. `ncc_cost` を $1 - \mathrm{NCC}$ の代わりに SAD を返すよう変更し、ソース視点 1 を 0.8 倍して 0.1 を足し（露出の異なる 2 台のカメラの間のようなゲインとオフセットの変化）、視点 1 だけで掃引をやり直してください。明るさの変化の有無で SAD と NCC の精度を比べましょう。

   <details markdown="1"><summary>ヒント</summary>

   戻り値を `box(np.abs(a - b))` に置き換え（範囲外の判定は残す）、`src[0]` に `(0.8 * I + 0.1, R, t)` を適用します。1% 以内の画素の割合は、NCC が変化の有無にかかわらず 52.3%、SAD は変化なしで 57.7%（ノイズだけのこのシーンでは SAD がわずかに良い）、変化ありで 32.5% でした。NCC は各窓の平均を引いて標準偏差で割るので構成上影響を受けず、SAD は今やいたる所で異なる窓を比べています。
   </details>

4. 平面掃引に**幾何的整合性フィルター**を加えてください。ソース視点 1 を 2 番目の参照として奥行きマップを計算し（カメラの役割を入れ替える）、参照画素の 3D 点を視点 1 に投影した先の画素の奥行きを逆投影して戻したとき、出発画素から 1 px 以内に戻る場合だけその参照画素を残します。どの画素が除かれ、残った画素の精度はどう変わりますか。

   <details markdown="1"><summary>ヒント</summary>

   `backproject`、`relative_pose`、$K$ で点を視点 1 に写し、丸めた画素で視点 1 の奥行きを読み、3D に逆投影し、相対姿勢の逆で参照に戻します。私たちの実行では、このチェックで画素の 80.9% が残り、そのうち 61.5% が 1% 以内（フィルター前 52.3%）、90.2% が 5% 以内（フィルター前 78.3%）でした。ポスターの約半分（ランダムな奥行きが二つの視点で一致するのは偶然だけ）と、視点 1 から見えない右端の帯の大部分が除かれます。視点が多ければ、そのうち 2 つか 3 つとの一致を要求することで、はるかに多くの外れ値を除けます。穴はその後、他の視点との統合で埋まります。
   </details>

5. TSDF の実験では、今は統合の重みがすべて 1 です。それを、センサーのノイズモデル $\sigma(z) = 0.002 + 0.005z^2$ による $w = 1/\sigma(z)^2$ に置き換えてください。36 スキャン後の誤差は変わりますか。次に打ち切り $\mu$ を 2 倍の 16 cm にし、また 1/4 の 2 cm に下げてみてください。細い部分とノイズはどうなりますか。

   <details markdown="1"><summary>ヒント</summary>

   `integrate` の中でグリッド点ごとの重み `w` $= 1/\sigma(z\_m)^2$ を計算し、更新に使います：`T = (Wt * T + w * tsdf) / (Wt + w)` と `Wt += w`（`ok` の要素のみ）。結果は 4.41 mm ではなく 4.36 mm で、ほとんど変わりません。この実験ではどのカメラも物体からほぼ同じ距離にあり、重みがみな似ているからです。逆分散重み付け（ガウス測定の最尤な組み合わせ）は、スキャンが同じ表面を大きく異なる距離から見るときに効きます。$\mu = 2$ cm では誤差が 12.9 mm に上がります。カメラから遠い所では更新される帯がノイズとほとんど同じ幅しかなく、ゼロ交差が偽の断片に砕けます。$\mu = 16$ cm では 10.1 mm に上がります。帯が正方形の角や円板と正方形の間の 10 cm の隙間といったシーンの特徴より広くなり、一方の表面の測定がもう一方のボクセルにあふれ出すからです。
   </details>

**次回：**[第 8 回]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})では、奥行きが得られた後に何を保存するかを考えます。点群、メッシュ、ボクセル、符号付き距離場、ニューラル場、3D ガウシアン、そしてそれらの間の変換です。
