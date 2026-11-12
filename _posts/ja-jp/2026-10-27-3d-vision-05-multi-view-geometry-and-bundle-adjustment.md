---
layout: post
title: "多視点幾何とバンドル調整：PnP、Structure-from-Motion と Schur 補行列"
date: 2026-10-27 11:05:00+0900
description: "2 視点から多視点へ：P3P・EPnP・RANSAC によるカメラの位置決め（resectioning）、バンドル調整のゼロからの導出（ヤコビアン、疎な正規方程式、Schur 補行列、Levenberg-Marquardt、ゲージの自由度、ロバストカーネル）、COLMAP 型のインクリメンタル SfM、回転平均と GLOMAP 型の全体位置推定によるグローバル SfM、そしてスケールの不定性。すべて合成シーン上で動く NumPy コード付きです。"
categories: 3d-vision
tags: [pnp, p3p, epnp, bundle-adjustment, schur-complement, structure-from-motion, colmap, glomap, rotation-averaging, gauge-freedom]
series: 3d-vision
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 04 回]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})では、キャリブレーション済みの 2 台のカメラの相対姿勢を求め、両方から見える点を三角測量しました。実際の再構成では画像が数十枚、数千枚、ときには数百万枚あります。すべての写真を**一つの**共通座標系に置き、すべての 3D 点がそれを見るすべての画像と整合し、しかもそれが誤対応や悪い初期値やドリフトに耐えなければなりません。この記事はそれを実現する三つの道具を扱います。

1. **カメラの位置決め（camera resectioning、PnP）**：既にある 3D 点との 2D-3D 対応から、新しいカメラの姿勢を求めます。
2. **バンドル調整（bundle adjustment、BA）**：すべてのカメラとすべての点を同時に調整し、各光線がその画素を通るようにします。Structure-from-Motion（SfM）、SLAM、キャリブレーション（[第 02 回]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})で触れたとおり、ターゲットが既知の小さな BA です）の主力であり、NeRF や 3D Gaussian Splatting が学習に使うカメラ姿勢もこれから得られます。
3. それらを使う **SfM パイプライン**：画像を 1 枚ずつ追加して再構成を育てる**インクリメンタル（incremental）** SfM（COLMAP）と、すべての回転と位置を一度に推定する**グローバル（global）** SfM（GLOMAP）です。

[ニューラルレンダリング第 1 回]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})では BA と COLMAP を 1 節で概観しました。ここではすべてを導出し、NumPy で実装し、真値がわかっている合成シーンで動かして、どの主張にも数値の裏付けを付けます。第 3 節で作るバンドル調整器は 60 行ほどで、Schur 補行列を使い、ロバストカーネルに対応します。COLMAP の中で Ceres Solver が実行しているのと同じアルゴリズムで、違いは何十年分の工学的な作り込みだけです。

## 前提知識

- [第 01 回]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})：ピンホールカメラ $\mathbf x \sim K[R \mid \mathbf t]\mathbf X$、ワールドからカメラへの姿勢、カメラ中心 $\mathbf C = -R^\top\mathbf t$、OpenCV の座標系（$x$ 右、$y$ 下、$z$ 前）。
- [第 02 回]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})：最尤推定としての再投影誤差、Gauss-Newton と Levenberg-Marquardt、回転ベクトルと Rodrigues の公式、共分散 $\sigma^2(J^\top J)^{-1}$。
- [第 03 回]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})：対応点、RANSAC と必要なサンプル数。
- [第 04 回]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})：基本行列（essential matrix）、正の深度チェック（cheirality check）付きの分解、三角測量。ここではそれらの簡潔版を導出なしで再利用します。
- 線形代数：ブロック行列、固有ベクトル、SVD。Python と NumPy、SciPy。すべてのコードは**一つのスクリプト**になっていて、順に実行すると表示される数値はすべて本文と一致します。

**記法。** カメラの番号を $i = 1, \dots, m$、点の番号を $j = 1, \dots, n$ とします。カメラ $i$ のワールドからカメラへの姿勢を $(R\_i, \mathbf t\_i)$ とし、ワールド点 $\mathbf X\_j$ のカメラ座標は $\mathbf X\_{c} = R\_i\mathbf X\_j + \mathbf t\_i$ です。すべてのカメラは既知の $K$（第 02 回でキャリブレーション済み）を共有します。$\pi(\cdot)$ はカメラ座標を画素に写す関数で、$\pi(X, Y, Z) = (f\_x X/Z + c\_x,\ f\_y Y/Z + c\_y)$ です。集合 $\mathcal O$ はカメラ $i$ が点 $j$ を画素 $\mathbf x\_{ij}$ で観測した組 $(i, j)$ の集まりで、$L = \vert\mathcal O\vert$ は観測の数です。ワールド座標系も $y$ が下向きなので、「上」は $-y$ です。

## 1. 2 視点から多視点へ

### 1.1 未知数、測定、ゲージ

求めたいものと手元にあるものを数えてみましょう。各カメラには姿勢パラメータが 6 個（回転 3、並進 3）、各点には座標が 3 個あります。各観測は 2 個の数を与えます。したがって

$$
\underbrace{6m + 3n}_{\text{unknowns}} \quad\text{versus}\quad \underbrace{2L}_{\text{measurements}} .
$$

ただし落とし穴があります。画像だけでは、ワールド原点がどこにあるか、座標軸がどちらを向くか、シーンがどれだけ大きいかはわかりません。再構成全体をまとめて平行移動・回転・拡大縮小しても、どの画像も変わりません（第 3.7 節で証明します）。これは同じくらい良い解からなる 7 パラメータの族です。並進 3、回転 3、スケール 1 です。この自由度を**ゲージ（gauge）**と呼びます。したがって画像が実際に決められる量は $6m + 3n - 7$ 個です。2 視点で $n$ 点なら測定は $2 \cdot 2n$ 個、未知数は $12 + 3n - 7$ 個で、$n \ge 5$ が必要になります。第 04 回の 5 点問題です。

### 1.2 この記事を通じた例

第 2 節と第 3 節で使うシーンを一つ作ります。地面と二つの箱の上にある 120 点を、5 m 先の円弧上に並んだ 8 台のカメラで観測します。$f = 500$ px、画像は $640\times480$ です。すべての観測に $\sigma = 0.5$ px のガウスノイズを加えます。第 02 回の合成キャリブレーションと同じ設定ですが、今度は 3D 点も未知です。

```python
import numpy as np

def skew(v):
    return np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])

def rodrigues(w):
    """Axis-angle vector -> rotation matrix (as in post 02)."""
    th = np.linalg.norm(w)
    if th < 1e-12:
        return np.eye(3) + skew(w)
    k = skew(np.asarray(w, float) / th)
    return np.eye(3) + np.sin(th) * k + (1 - np.cos(th)) * k @ k

def look_at(C, target=(0.0, 0.0, 0.0)):
    """World-to-camera (R, t) of a camera at C looking at target. World and camera are
    OpenCV-style (y down), so the world 'up' direction is -y."""
    z = np.asarray(target, float) - C
    z /= np.linalg.norm(z)
    x = np.cross(z, [0.0, -1.0, 0.0]); x /= np.linalg.norm(x)
    R = np.stack([x, np.cross(z, x), z])          # rows: camera axes in world coordinates
    return R, -R @ C

def project(K, R, t, X):
    """World points X (N x 3) -> pixels (N x 2) and depths (N,)."""
    Xc = X @ R.T + t
    return (Xc[:, :2] / Xc[:, 2:]) @ K[:2, :2].T + K[:2, 2], Xc[:, 2]

def box_points(lo, hi, n, rng):
    """n random points on the surface of an axis-aligned box."""
    lo, hi = np.asarray(lo, float), np.asarray(hi, float)
    P = rng.uniform(lo, hi, (n, 3))
    axis = rng.integers(0, 3, n)
    side = rng.integers(0, 2, n)
    P[np.arange(n), axis] = np.where(side == 1, hi[axis], lo[axis])
    return P

rng = np.random.default_rng(5)
W, H = 640, 480
K = np.array([[500.0, 0, 320], [0, 500.0, 240], [0, 0, 1]])
X_true = np.vstack([                          # world y points down: the ground is y = 0
    np.c_[rng.uniform(-2, 2, 40), np.zeros(40), rng.uniform(-2, 2, 40)],    # ground
    box_points([-1.3, -1.0, -0.6], [-0.3, 0.0, 0.4], 40, rng),              # low box
    box_points([0.3, -1.6, -0.9], [1.3, 0.0, 0.1], 40, rng)])               # tall box
cams_true = [look_at(5.0 * np.array([np.sin(a), -0.4, -np.cos(a)]), (0, -0.5, 0))
             for a in np.deg2rad(np.linspace(-60, 60, 8))]

sigma = 0.5                                   # pixel noise
obs = []                                      # (camera i, point j, observed pixel)
for i, (R, t) in enumerate(cams_true):
    uv, depth = project(K, R, t, X_true)
    for j in range(len(X_true)):
        if depth[j] > 0 and 0 <= uv[j, 0] < W and 0 <= uv[j, 1] < H:
            obs.append((i, j, uv[j] + rng.normal(0, sigma, 2)))
cam_idx = np.array([o[0] for o in obs]); pt_idx = np.array([o[1] for o in obs])
uv_obs = np.array([o[2] for o in obs])
m, n, L = len(cams_true), len(X_true), len(obs)
print(f"{m} cameras, {n} points, {L} observations")
print(f"unknowns 6m + 3n = {6 * m + 3 * n}, residuals 2L = {2 * L}, gauge 7")
```

```text
8 cameras, 120 points, 960 observations
unknowns 6m + 3n = 408, residuals 2L = 1920, gauge 7
```

未知数は 408 個（そのうち 401 個が決定可能）、測定は 1920 個で、5 倍近い過剰決定です。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-scene.svg" caption="この記事を通じた例。左：地面（灰）、低い箱（橙）、高い箱（紫）の上の 120 点と、中心から 5 m、地面から 2 m の高さの円弧上にある 8 台のカメラ。すべて $(0,-0.5,0)$ を向いています。赤い破線はカメラ 4 の 3 本の光線です。右：カメラ 4 の観測、0.5 px のノイズを含む 120 画素。丸で囲んだ点は第 2.3 節の P3P の例で使う 3 点です。" %}

### 1.3 この先の流れ

多視点の再構成は鶏と卵の問題です。カメラが既知なら点を三角測量でき（第 04 回）、点が既知ならカメラを位置決めできます（第 2 節）。どちらも単独なら簡単です。両方を同時に解くのは大規模な非線形最小二乗問題、つまりバンドル調整（第 3 節）で、良い初期値が必要です。SfM パイプラインは、カメラを 1 台ずつ追加して再構成を育てるか（第 4 節）、すべての回転を求めてからすべての位置を求めるか（第 5 節）によって、その初期値を作ります。第 6 節では、どのパイプラインも画像だけからは復元できない唯一の量、スケールを扱います。

## 2. カメラの位置決め：Perspective-n-Point

### 2.1 問題

**Perspective-n-Point（PnP）**：既知の $n$ 個の 3D 点 $\mathbf X\_j$（ワールド座標）、新しい画像でのそれらの画素 $\mathbf x\_j$、内部パラメータ $K$ が与えられたとき、姿勢 $(R, \mathbf t)$ を求めます。インクリメンタル SfM では新しい画像はこうしてモデルに加わります。AR やロボティクスでは、デバイスはこうして地図に対して自己位置を推定し直します。第 02 回ではキャリブレーションボードの姿勢がこれでした。

各対応は 2 本の方程式を与え、姿勢の未知数は 6 個なので、**3 点**が最小です。3 点では有限個、最大 4 個の解があり、4 点目が正しいものを選びます。点が多いときは最小二乗の意味で最良の解を求め、誤対応が混じるときは RANSAC が必要です。

画素を**方位ベクトル（bearing vector）**、つまりカメラ座標系での単位方向に変換しておくと便利です：$\mathbf f = K^{-1}\tilde{\mathbf x} / \lVert K^{-1}\tilde{\mathbf x}\rVert$。方位ベクトルは点の方向を知っていますが、距離は知りません。

### 2.2 線形な方法：DLT

最も簡単な方法は姿勢の構造を無視します。$P\_n = [R \mid \mathbf t]$ を未知数 12 個の一般の $3\times4$ 行列として扱います。$\mathbf X$ と正規化画像点 $(x, y)$ の各対応は 2 本の線形方程式を与えます。第 02 回のホモグラフィの DLT とまったく同じで、次元が一つ上がっただけです：

$$
x\,(\mathbf p^{3\top}\tilde{\mathbf X}) - \mathbf p^{1\top}\tilde{\mathbf X} = 0, \qquad y\,(\mathbf p^{3\top}\tilde{\mathbf X}) - \mathbf p^{2\top}\tilde{\mathbf X} = 0 .
$$

ここで $\mathbf p^{k\top}$ は $P\_n$ の各行です。6 点で 12 本の方程式になり、最小二乗解は最小の右特異ベクトルです。その後、左の $3\times3$ ブロックを SVD で最も近い回転行列に射影し、その特異値でスケールを決めます。DLT は簡単で任意の $n \ge 6$ に使えますが、自由度が 6 しかないところで 11 個を推定するのでノイズが余分な 5 個に漏れ、しかも画素ではなく代数的誤差を最小化します。

### 2.3 3 点：P3P

**幾何。** 未知のカメラ中心を $\mathbf C$、$\mathbf C$ から 3 点までの未知の距離を $s\_1, s\_2, s\_3$ とします。2 本の方位ベクトルのなす角は画像からわかり（$\cos\theta\_{jk} = \mathbf f\_j^\top\mathbf f\_k$）、2 点間の距離 $d\_{jk}$ は地図からわかります。すると三角形 $\mathbf C, \mathbf X\_j, \mathbf X\_k$ は**余弦定理**を満たします：

$$
s_j^2 + s_k^2 - 2 s_j s_k \cos\theta_{jk} = d_{jk}^2, \qquad (j,k) \in \{(2,3), (1,3), (1,2)\}.
$$

3 個の距離についての 3 本の 2 次方程式です。辺を $a = d\_{23}$、$b = d\_{13}$、$c = d\_{12}$、それぞれに対する角を $\alpha = \theta\_{23}$、$\beta = \theta\_{13}$、$\gamma = \theta\_{12}$ と名付けます。これは Haralick ら（1994）がレビューした、Grunert による 1841 年の定式化です。

**消去。** $s\_2 = u\, s\_1$、$s\_3 = v\, s\_1$ とおきます。各方程式は $s\_1^2$ と何かの積になり、二つずつ割ると $s\_1$ が消えます：

$$
\begin{aligned}
b^2 (u^2 + v^2 - 2uv\cos\alpha) &= a^2 (1 + v^2 - 2v\cos\beta), \\
b^2 (1 + u^2 - 2u\cos\gamma) &= c^2 (1 + v^2 - 2v\cos\beta).
\end{aligned}
$$

1 本目から 2 本目を引くと $u^2$ が消え、$u$ について*線形*な式が残ります：

$$
u = \frac{(a^2 - c^2)(1 + v^2 - 2v\cos\beta) - b^2 (v^2 - 1)}{2b^2(\cos\gamma - v\cos\alpha)} = \frac{N(v)}{D(v)} .
$$

$u = N/D$ を 2 本目に代入して $D^2$ を掛けると、$v$ の 4 次多項式、**P3P の 4 次方程式**が得られます。正の実根それぞれから $u$ が決まり、次に $s\_1 = b / \sqrt{1 + v^2 - 2v\cos\beta}$、そしてカメラ座標系での 3 点 $s\_k\mathbf f\_k$ が決まります。

**点から姿勢へ：絶対姿勢（absolute orientation）。** これで同じ 3 点の座標が二つの座標系（ワールドとカメラ）で得られたので、その間の剛体運動を求めます。点集合 $\mathbf A\_k$ と $\mathbf B\_k$ に対する最小二乗の回転には古典的な SVD 解があります（Kabsch、Horn、梅山）。両方の点集合を中心化し、相互共分散 $M = \sum (\mathbf B\_k - \bar{\mathbf B})(\mathbf A\_k - \bar{\mathbf A})^\top = U\Sigma V^\top$ を作って $R = U\,\mathrm{diag}(1, 1, \det UV^\top)\,V^\top$、$\mathbf t = \bar{\mathbf B} - R\bar{\mathbf A}$ とします。行列式の項は鏡映を防ぎます。

多項式の計算は NumPy に任せるので、コードは導出を 1 行ずつなぞります：

```python
def absolute_orientation(A, B):
    """R, t minimizing sum |R A_k + t - B_k|^2 (Kabsch / Horn), A and B are N x 3."""
    a, b = A.mean(0), B.mean(0)
    U, _, Vt = np.linalg.svd((B - b).T @ (A - a))
    D = np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))])
    R = U @ D @ Vt
    return R, b - R @ a

def p3p(Xw, f):
    """Grunert's P3P. Xw: 3 world points (3 x 3); f: their unit bearing vectors in the
    camera frame (3 x 3). Returns up to 4 candidate poses (R, t) with X_c = R X_w + t."""
    a = np.linalg.norm(Xw[1] - Xw[2]); b = np.linalg.norm(Xw[0] - Xw[2]); c = np.linalg.norm(Xw[0] - Xw[1])
    ca, cb, cg = f[1] @ f[2], f[0] @ f[2], f[0] @ f[1]      # cosines of the angles between rays
    P = np.polynomial.polynomial                             # coefficient arrays, lowest power first
    # with s2 = u s1 and s3 = v s1, two of the cosine-law equations give u = N(v) / D(v)
    N = (a * a - c * c) * np.array([1, -2 * cb, 1]) - b * b * np.array([-1, 0, 1])
    D = 2 * b * b * np.array([cg, -ca])
    # substitute into b^2 (1 + u^2 - 2 u cos(gamma)) = c^2 (1 + v^2 - 2 v cos(beta)), times D^2
    quartic = P.polyadd(b * b * P.polysub(P.polyadd(P.polymul(D, D), P.polymul(N, N)),
                                          2 * cg * P.polymul(N, D)),
                        -c * c * P.polymul([1, -2 * cb, 1], P.polymul(D, D)))
    poses = []
    for v in P.polyroots(quartic):
        if abs(v.imag) > 1e-8 or v.real <= 0:
            continue
        v = v.real
        u = P.polyval(v, N) / P.polyval(v, D)
        if u <= 0:
            continue
        s1 = b / np.sqrt(1 + v * v - 2 * v * cb)            # distance of point 1 from the centre
        Xc = np.array([s1, u * s1, v * s1])[:, None] * f    # the three points in the camera frame
        poses.append(absolute_orientation(Xw, Xc))
    return poses, quartic

def bearings(K, uv):
    """Pixels -> unit ray directions in the camera frame."""
    r = np.c_[uv, np.ones(len(uv))] @ np.linalg.inv(K).T
    return r / np.linalg.norm(r, axis=1, keepdims=True)

R0, t0 = cams_true[3]
sel = [17, 87, 8]                                           # two ground points, one on the tall box
uv3, _ = project(K, R0, t0, X_true[sel])
poses, quartic = p3p(X_true[sel], bearings(K, uv3))
print("quartic coefficients (v^0..v^4):", quartic.round(3))
uv4 = project(K, R0, t0, X_true[[60]])[0]                  # a fourth point decides
for R, t in poses:
    e4 = np.linalg.norm(project(K, R, t, X_true[[60]])[0] - uv4)
    print("centre", (-R.T @ t).round(3), " |R - R_true| = %.1e" % np.linalg.norm(R - R0),
          " 4th point off by %.1f px" % e4)
print("true centre", (-R0.T @ t0).round(3))
```

```text
quartic coefficients (v^0..v^4): [ -27.431  123.357 -194.301  128.036  -30.045]
centre [-2.331 -0.82  -3.445]  |R - R_true| = 8.2e-01  4th point off by 88.1 px
centre [-0.745 -2.    -4.944]  |R - R_true| = 1.2e-13  4th point off by 0.0 px
centre [ 1.851  2.126 -2.851]  |R - R_true| = 1.9e+00  4th point off by 208.5 px
centre [ 1.179 -2.008 -0.678]  |R - R_true| = 1.8e+00  4th point off by 199.7 px
true centre [-0.745 -2.    -4.944]
```

この 3 点の組には実数解が**四つ**あります。一つは機械精度で真のカメラです。残りも 3 点問題の正真正銘の厳密解で、どれも 3 点を観測どおりの画素に見るカメラを置きます。一つは地面の下（$y = +2.1$、床下から上を見上げる位置）にさえあります。4 点目を使えば曖昧さはすぐに消えます。誤った姿勢で投影すると、その点は観測画素から 88〜209 px ずれます。RANSAC の中では、誤った姿勢はインライアをほとんど得ないので、別のチェックすら不要です。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-p3p.svg" caption="カメラ 4 から見た 3 点（地面に 2 点、高い箱に 1 点）の P3P。左：$\mathbf X\_1,\mathbf X\_2,\mathbf X\_3$ を観測どおりの角度で見る四つのカメラ中心 $\mathbf C^{(1)}$〜$\mathbf C^{(4)}$。$\mathbf C^{(2)}$ が真のカメラで、$\mathbf C^{(3)}$ は床下にあります。右：コードの 4 次多項式 $q(v)$ と四つの正の実根 $v=0.522$、$0.846$、$1.285$、$1.608$。根の一つ一つが候補解に対応します。実根の個数は、3 点を通る「危険円柱」（danger cylinder）に対してカメラがどこにあるかで決まります。Gao ら（2003）がすべての場合を分類しています。" %}

Kneip ら（2011）や Lambda Twist（Persson と Nordberg、2018）などの現代的な P3P ソルバーは、同じ解をより安定かつ高速に計算します。Lambda Twist は 4 次方程式を完全に避けています。違いは数値計算の面にあり、何を計算するかは同じです。

### 2.4 多数の点：EPnP

$n \gg 3$ のときは、すべての点を使った一つの姿勢を $O(n)$ の時間で求めたいところです。**EPnP**（Lepetit、Moreno-Noguer、Fua、2009）は巧妙な変数変換でこれを実現します。ワールド座標系に四つの**制御点** $\mathbf c\_1, \dots, \mathbf c\_4$ を選びます（点群の重心とその三つの主方向）。各ワールド点はそれらのアフィン結合で表せます：

$$
\mathbf X_j = \sum_{k=1}^4 \alpha_{jk}\mathbf c_k, \qquad \sum_k \alpha_{jk} = 1 ,
$$

重み $\alpha\_{jk}$ は一度計算すれば済みます。剛体運動はアフィン結合を保つので、カメラ座標系でも**同じ**重みが成り立ちます：$\mathbf X\_j^c = \sum\_k \alpha\_{jk}\mathbf c\_k^c$。未知数はカメラ座標系での四つの制御点の 12 個の座標になります。投影の条件 $x\_j = X\_j^c / Z\_j^c$ は $X\_j^c - x\_j Z\_j^c = 0$ となり、これらについて線形です：

$$
\sum_{k=1}^4 \alpha_{jk}\,(c_{k,x}^c - x_j\,c_{k,z}^c) = 0, \qquad \sum_{k=1}^4 \alpha_{jk}\,(c_{k,y}^c - y_j\,c_{k,z}^c) = 0 .
$$

すべての点を積み重ねると、$2n \times 12$ の行列 $M$ について $M\mathbf v = \mathbf 0$ となります。解は $M$ の零空間ベクトルで、スケールを除いて決まります。スケールは制御点どうしの距離が保たれるという条件から決まります。論文はノイズのために零空間が実質 2〜4 次元になる場合も扱っていますが、コードは最も簡単な、零空間ベクトルが一つの場合だけを実装しています。最後に絶対姿勢で $(R, \mathbf t)$ を得ます。

```python
def epnp(Xw, uv, K):
    """EPnP with the single-null-vector solution (the paper's N = 1 case)."""
    cw = Xw.mean(0)                                          # control points: centroid ...
    U, S, Vt = np.linalg.svd(Xw - cw, full_matrices=False)
    C = np.vstack([cw, cw + (S[:, None] / np.sqrt(len(Xw))) * Vt])   # ... plus principal axes
    alpha = np.linalg.solve(np.vstack([C.T, np.ones(4)]), np.vstack([Xw.T, np.ones(len(Xw))])).T
    xn = (uv - K[:2, 2]) / np.diag(K)[:2]                    # normalized image coordinates
    M = np.zeros((2 * len(Xw), 12))
    for k in range(4):                                       # x c_z - c_x = 0, y c_z - c_y = 0, summed
        M[0::2, 3 * k] = alpha[:, k]; M[0::2, 3 * k + 2] = -alpha[:, k] * xn[:, 0]
        M[1::2, 3 * k + 1] = alpha[:, k]; M[1::2, 3 * k + 2] = -alpha[:, k] * xn[:, 1]
    v = np.linalg.svd(M)[2][-1].reshape(4, 3)                # camera-frame control points, up to scale
    dc = [np.linalg.norm(v[i] - v[j]) for i in range(4) for j in range(i)]
    dw = [np.linalg.norm(C[i] - C[j]) for i in range(4) for j in range(i)]
    Xc = alpha @ (v * (np.dot(dc, dw) / np.dot(dc, dc)))     # scale from the control-point distances
    if np.mean(Xc[:, 2]) < 0:
        Xc = -Xc                                              # points must be in front of the camera
    return absolute_orientation(Xw, Xc)

def dlt_pnp(Xw, uv, K):
    """Linear DLT for P = K[R|t] (post 02's DLT, one dimension up), then project onto SO(3)."""
    xn = (uv - K[:2, 2]) / np.diag(K)[:2]
    A = []
    for (X, Y, Z), (x, y) in zip(Xw, xn):
        A.append([X, Y, Z, 1, 0, 0, 0, 0, -x * X, -x * Y, -x * Z, -x])
        A.append([0, 0, 0, 0, X, Y, Z, 1, -y * X, -y * Y, -y * Z, -y])
    Pn = np.linalg.svd(np.array(A))[2][-1].reshape(3, 4)     # normalized [R|t] up to scale
    U, S, Vt = np.linalg.svd(Pn[:, :3])
    s = np.sign(np.linalg.det(U @ Vt))
    return s * U @ Vt, s * Pn[:, 3] / S.mean()

def pose_error(R, t, R0, t0):
    """Rotation error (deg) and camera-centre error."""
    ang = np.degrees(np.arccos(np.clip((np.trace(R @ R0.T) - 1) / 2, -1, 1)))
    return ang, np.linalg.norm(R.T @ t - R0.T @ t0)

rng_pnp = np.random.default_rng(0)
R0, t0 = cams_true[5]
uv_clean, _ = project(K, R0, t0, X_true)
for s_px in (0.5, 2.0):
    uvn = uv_clean + rng_pnp.normal(0, s_px, uv_clean.shape)
    for name, solver in (("DLT ", dlt_pnp), ("EPnP", epnp)):
        e = pose_error(*solver(X_true, uvn, K), R0, t0)
        print(f"sigma {s_px} px, {name}: rotation {e[0]:.3f} deg, centre {e[1]:.4f}")
```

```text
sigma 0.5 px, DLT : rotation 0.063 deg, centre 0.0089
sigma 0.5 px, EPnP: rotation 0.041 deg, centre 0.0061
sigma 2.0 px, DLT : rotation 0.552 deg, centre 0.0673
sigma 2.0 px, EPnP: rotation 0.585 deg, centre 0.0682
```

ここではどちらの線形手法も 1 度の数分の一の精度です。それは 120 点が多いからです。第 2.5 節の図の左半分は、点が少ない場合に何が起きるかを示しています。

### 2.5 精密化と RANSAC

どちらの線形手法も、本当に気にしている誤差、つまり画素単位の再投影誤差を最小化してはいません。そこで本格的なパイプラインはどれも、最後に次の式について数回の Gauss-Newton 反復を行います：

$$
\min_{R,\mathbf t} \sum_j \big\lVert \pi(R\mathbf X_j + \mathbf t) - \mathbf x_j\big\rVert^2 ,
$$

点は固定したままです。これを**運動のみのバンドル調整（motion-only BA）**と呼びます。画素の姿勢に関する微分が必要で、それは第 3.3 節できちんと導出します。下の関数 `project_jac` は既にそれを計算しています。アウトライアがあるときは、P3P を RANSAC（第 03 回、$s = 3$）の中で動かします。3 対応をサンプリングし、最大四つの姿勢を計算し、それぞれのインライアを数え、最良のものを残し、すべてのインライアで当てはめ直します。

```python
def project_jac(K, R, t, X):
    """Pixels of X (N x 3) and their Jacobians w.r.t. the pose update (N x 2 x 6) and X (N x 2 x 3).
    Pose update: R <- exp([dw]x) R, t <- exp([dw]x) t + dt, i.e. Xc <- Xc + dw x Xc + dt."""
    Xc = X @ R.T + t
    x, y, z = Xc.T
    fx, fy = K[0, 0], K[1, 1]
    dpi = np.zeros((len(X), 2, 3))                           # d pixel / d Xc
    dpi[:, 0, 0] = fx / z; dpi[:, 0, 2] = -fx * x / z**2
    dpi[:, 1, 1] = fy / z; dpi[:, 1, 2] = -fy * y / z**2
    dXc_dw = -np.array([skew(p) for p in Xc])                # d (dw x Xc) / d dw = -[Xc]x
    J_pose = np.concatenate([dpi @ dXc_dw, dpi], axis=2)
    J_point = dpi @ R
    uv = (Xc[:, :2] / Xc[:, 2:]) @ K[:2, :2].T + K[:2, 2]
    return uv, J_pose, J_point

def refine_pose(R, t, Xw, uv, K, iters=10):
    """Gauss-Newton on the reprojection error of one camera (points fixed): motion-only BA."""
    for _ in range(iters):
        pred, Jp, _ = project_jac(K, R, t, Xw)
        r = (pred - uv).ravel()
        J = Jp.reshape(-1, 6)
        d = np.linalg.solve(J.T @ J, -J.T @ r)
        dR = rodrigues(d[:3])
        R, t = dR @ R, dR @ t + d[3:]
    return R, t

def ransac_pnp(Xw, uv, K, thresh=2.0, p=0.99, max_iters=1000, rng=np.random.default_rng(1)):
    f = bearings(K, uv)
    best, best_inl, N, k = None, np.zeros(len(uv), bool), max_iters, 0
    while k < N:
        k += 1
        sample = rng.choice(len(uv), 3, replace=False)
        for R, t in p3p(Xw[sample], f[sample])[0]:          # up to 4 hypotheses per sample
            pred, depth = project(K, R, t, Xw)
            inl = (np.linalg.norm(pred - uv, axis=1) < thresh) & (depth > 0)
            if inl.sum() > best_inl.sum():
                best, best_inl = (R, t), inl
                w = inl.mean()                                # adaptive stopping (post 03)
                N = min(max_iters, int(np.ceil(np.log(1 - p) / np.log(1 - w**3))))
    R, t = best
    for _ in range(2):                                       # refit on all inliers, re-score
        R, t = refine_pose(R, t, Xw[best_inl], uv[best_inl], K)
        pred, depth = project(K, R, t, Xw)
        best_inl = (np.linalg.norm(pred - uv, axis=1) < thresh) & (depth > 0)
    return (R, t), best_inl, k

uvn = uv_clean + rng_pnp.normal(0, 1.0, uv_clean.shape)
bad = rng_pnp.random(len(uvn)) < 0.4                         # 40% gross outliers
uvn[bad] = rng_pnp.uniform([0, 0], [W, H], (bad.sum(), 2))
(R, t), inl, k = ransac_pnp(X_true, uvn, K)
e = pose_error(R, t, R0, t0)
print(f"RANSAC: {k} samples, {inl.sum()} inliers (true {(~bad).sum()}), "
      f"wrongly accepted {np.sum(inl & bad)}, rotation {e[0]:.3f} deg, centre {e[1]:.4f}")
e = pose_error(*epnp(X_true, uvn, K), R0, t0)
print(f"EPnP on all points: rotation {e[0]:.1f} deg, centre {e[1]:.2f}")
```

```text
RANSAC: 116 samples, 62 inliers (true 67), wrongly accepted 0, rotation 0.223 deg, centre 0.0127
EPnP on all points: rotation 40.4 deg, centre 3.38
```

対応の 40% をランダムな画素に置き換えると、全点に対する EPnP は役に立ちません。40° と 3.4 m ずれます。P3P-RANSAC は 116 回のサンプリングで 62 個のインライアを見つけます。$\sigma = 1$ px なら 2 px の閾値は真のインライアの $1 - e^{-2} = 86\%$、つまり 67 個のうち約 58 個を残すので、取りこぼしはありません。アウトライアは一つも受け入れず、精密化した姿勢の誤差は $0.22°$ です。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-pnp.svg" caption="左：シーンのカメラ 6 について、200 回の試行での回転誤差の中央値を画素ノイズ $\sigma$ に対して示したもの。実線は全 $n=120$ 点、破線はランダムな 12 点。EPnP は DLT よりわずかに良く、再投影誤差の Gauss-Newton 精密化（EPnP+GN）はどの設定でも EPnP より 2.2〜3.5 倍正確です（120 点、$\sigma=1$ px でそれぞれ 0.28°、0.22°、0.09°）。右：信頼度 99% に必要な RANSAC のサンプル数 $N=\log 0.01/\log(1-(1-\varepsilon)^s)$、$s=3$（P3P）、4、6（DLT）。丸は我々の `ransac_pnp` が実際に引いたサンプル数の平均（各 20 回）で、$\varepsilon=0.2$、0.4、0.6、0.7 でそれぞれ 28、54、230、629 です。$s=3$ の曲線より上にあるのは、適応的な停止則がそれまでの最良モデルのインライア率を使い、それが真の値より低いからです（ノイズで一部のインライアが閾値の外に押し出されます）。" %}

実際にはライブラリを呼びます。OpenCV の `solvePnP` と `solvePnPRansac` は P3P、EPnP、SQPnP などを提供し、その後 `solvePnPRefineLM` で精密化できます。焦点距離も未知の場合には焦点距離未知の最小ソルバーがあり、カメラリグには複数の中心から出る光線を扱う一般化版があります。

## 3. バンドル調整

### 3.1 コスト

バンドル調整は再投影誤差を最小化することで、すべてのカメラとすべての点を同時に推定します：

$$
E(\{R_i, \mathbf t_i\}, \{\mathbf X_j\}) = \sum_{(i,j)\in\mathcal O} \rho\Big(\big\lVert \mathbf r_{ij} \big\rVert^2\Big), \qquad \mathbf r_{ij} = \pi(R_i\mathbf X_j + \mathbf t_i) - \mathbf x_{ij}.
$$

$\rho(s) = s$ で画素ノイズが独立なガウス分布なら、第 02 回の第 4.1 節と同じ議論により、これは最尤推定です。$s$ よりゆっくり増加する**ロバストカーネル（robust kernel）** $\rho$ は誤対応の影響を抑えます（第 3.8 節）。名前は写真測量に由来します。各カメラは光線の**束**（bundle）を放ち、すべての光線がその点を通るまで束を調整するのです。

第 02 回のキャリブレーションは、点（ボード）が既知で内部パラメータが未知のバンドル調整でした。PnP の精密化は、カメラ 1 台で点を固定したバンドル調整です。ここではカメラも点も自由で、それが問題の大きさ、構造、ゲージを生みます。

### 3.2 パラメータ化

**点**は普通の 3 次元ベクトルです。非常に遠い点（地平線近く）は $\mathbf X$ を巨大にし、条件を悪くします。そのときは逆深度や同次座標によるパラメータ化が良く、SLAM システムが使っています。ここではそれは扱いません。

**回転**には注意が必要です。$R$ には 9 個の成分がありますが、自由度は 3 です。第 02 回はカメラごとに回転ベクトルを保存しました。ここでは現代的なソルバーのやり方を使います。$R$ は行列のまま保持し、**更新量**だけを、左から掛ける小さな回転 $\delta\boldsymbol\omega \in \mathbb R^3$ としてパラメータ化します：

$$
R \leftarrow \exp([\delta\boldsymbol\omega]_\times)\,R, \qquad \mathbf t \leftarrow \exp([\delta\boldsymbol\omega]_\times)\,\mathbf t + \delta\mathbf t ,
$$

ここで $\exp([\delta\boldsymbol\omega]\_\times)$ は Rodrigues の公式、$[\cdot]\_\times$ は外積行列です。この更新はカメラの座標系全体を回転させてから平行移動するもので、$SE(3)$ 上の左摂動です（リー群については[身体性 AI 第 1 回]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})を参照）。$\delta\boldsymbol\omega$ は常に小さいので特異点がありません。こうして各カメラは反復ごとに 6 個の数 $\delta\mathbf c\_i = (\delta\boldsymbol\omega\_i, \delta\mathbf t\_i)$ を持ちます。

### 3.3 1 つの観測のヤコビアン

Gauss-Newton には、各観測について 2 次元残差の 6 個のカメラパラメータと 3 個の点座標に関する微分が必要です。連鎖律で二つに分けます。

**画素のカメラ座標に関する微分。** $\mathbf X\_c = (X, Y, Z)$、$\pi = (f\_x X/Z + c\_x, f\_y Y/Z + c\_y)$ とすると：

$$
\frac{\partial \pi}{\partial \mathbf X_c} = \begin{pmatrix} f_x/Z & 0 & -f_x X/Z^2 \\ 0 & f_y/Z & -f_y Y/Z^2 \end{pmatrix}.
$$

3 列目は、点をカメラから遠ざけると画素が主点に向かって引き寄せられることを表しています。

**カメラ座標の更新量に関する微分。** 1 次の近似で $\exp([\delta\boldsymbol\omega]\_\times) \approx I + [\delta\boldsymbol\omega]\_\times$ なので、更新によって点のカメラ座標は

$$
\mathbf X_c \;\leftarrow\; (I + [\delta\boldsymbol\omega]_\times)(R\mathbf X + \mathbf t) + \delta\mathbf t = \mathbf X_c + \delta\boldsymbol\omega \times \mathbf X_c + \delta\mathbf t = \mathbf X_c - [\mathbf X_c]_\times\,\delta\boldsymbol\omega + \delta\mathbf t
$$

になります（$\mathbf a \times \mathbf b = -\mathbf b \times \mathbf a$ を使いました）。よって $\partial\mathbf X\_c/\partial\delta\boldsymbol\omega = -[\mathbf X\_c]\_\times$、$\partial\mathbf X\_c/\partial\delta\mathbf t = I$ です。点については $\partial\mathbf X\_c/\partial\mathbf X = R$ です。まとめると

$$
J_{c,ij} = \frac{\partial \pi}{\partial \mathbf X_c}\begin{pmatrix} -[\mathbf X_c]_\times & I \end{pmatrix} \in \mathbb R^{2\times 6},
\qquad
J_{p,ij} = \frac{\partial \pi}{\partial \mathbf X_c}\, R_i \in \mathbb R^{2\times 3}.
$$

これはまさに第 2.5 節の `project_jac` の二つの出力です。この上に何かを組み立てる前に、有限差分と比べておきましょう。この習慣は手書きのヤコビアンのバグをほとんど捕まえてくれます。

```python
R0, t0 = cams_true[3]
Xs = X_true[:5]
_, Jp, Jx = project_jac(K, R0, t0, Xs)
eps = 1e-6
num_pose = np.zeros((5, 2, 6)); num_pt = np.zeros((5, 2, 3))
for k in range(6):
    d = np.zeros(6); d[k] = eps
    dR = rodrigues(d[:3])
    num_pose[:, :, k] = (project(K, dR @ R0, dR @ t0 + d[3:], Xs)[0] - project(K, R0, t0, Xs)[0]) / eps
for k in range(3):
    d = np.zeros(3); d[k] = eps
    num_pt[:, :, k] = (project(K, R0, t0, Xs + d)[0] - project(K, R0, t0, Xs)[0]) / eps
print("max |analytic - numeric|: pose %.1e, point %.1e (largest entry %.0f)"
      % (np.abs(Jp - num_pose).max(), np.abs(Jx - num_pt).max(), np.abs(Jp).max()))
```

```text
max |analytic - numeric|: pose 1.7e-04, point 1.1e-05 (largest entry 548)
```

一致の度合いは有限差分そのものの誤差程度（成分は最大 548、差は $2\times10^{-4}$ 未満）なので、式は正しいとわかります。Ceres などのライブラリは自動微分も提供しますが、性能が重要なコードではこのような解析的ヤコビアンが今も一般的です。

### 3.4 正規方程式とその構造

すべてのカメラの更新を $\delta\mathbf c \in \mathbb R^{6m}$、すべての点の更新を $\delta\mathbf p \in \mathbb R^{3n}$ に積み重ねます。残差 $\mathbf r\_{ij}$ はカメラ 1 台と点 1 個にしか依存しないので、全体のヤコビアン $J$ におけるその行ブロックには、非ゼロのブロックがちょうど二つ、$J\_{c,ij}$ と $J\_{p,ij}$ しかありません。したがって Gauss-Newton の正規方程式 $J^\top J\,\boldsymbol\delta = -J^\top\mathbf r$（第 02 回）は次のブロック形になります：

$$
\begin{pmatrix} B & E \\ E^\top & C \end{pmatrix}
\begin{pmatrix} \delta\mathbf c \\ \delta\mathbf p \end{pmatrix}
= -\begin{pmatrix} \mathbf g_c \\ \mathbf g_p \end{pmatrix},
$$

ここで

$$
B_i = \sum_{j:(i,j)\in\mathcal O} J_{c,ij}^\top J_{c,ij}, \quad
C_j = \sum_{i:(i,j)\in\mathcal O} J_{p,ij}^\top J_{p,ij}, \quad
E_{ij} = J_{c,ij}^\top J_{p,ij}, \quad
\mathbf g_{c,i} = \sum_j J_{c,ij}^\top \mathbf r_{ij}, \quad
\mathbf g_{p,j} = \sum_i J_{p,ij}^\top \mathbf r_{ij}.
$$

二つのカメラや二つの点にまたがる残差はないので、$B$ は $6\times6$ ブロックのブロック対角行列、$C$ は点ごとの $3\times3$ ブロックのブロック対角行列です。カメラと点を結び付けるのは $E$ だけで、そのブロック $E\_{ij}$ はカメラ $i$ が点 $j$ を見ているときだけ非ゼロです。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-sparsity.svg" caption="第 4 節の廊下シーン（カメラ 30 台、点は 4 個に 1 個：208 点、2260 観測）の真値におけるバンドル調整の構造。左：ヤコビアン $J$（$4520\times804$、非ゼロ 0.93%）。各 2 行には、赤線の左に $2\times6$ のカメラブロック、右に $2\times3$ の点ブロックが一つずつあります。中央：$H=J^\top J$（$804\times804$、非ゼロ 12.3%）とそのブロック。$B$（ブロック対角、カメラ）、$C$（ブロック対角、点）と結合部 $E$。$E$ の帯は、どのカメラがどの点を見ているかを示します（点は $x$ で並べ替え、カメラは $x$ 方向に進みます）。右：縮約カメラ系 $S=B-EC^{-1}E^\top$（$180\times180$）を $6\times6$ ブロックの $30\times30$ の格子として描き、二つのカメラが共有する点の数で濃淡を付けたもの。ブロック $(i,k)$ はカメラ $i$ と $k$ が共通の点を見ているときだけ非ゼロです。遠くの点は長い区間で見えるので、ここでは 900 ブロック中 832 ブロックです。" %}

### 3.5 Schur 補行列

点のブロック $C$ は系の大部分（未知数 $3n$ 個、しばしば数百万）を占めますが、逆行列は簡単です。$n$ 個の独立な $3\times3$ 行列だからです。**Schur 補行列（Schur complement）**はこれを利用します。系を二つのブロック行に分けて書きます：

$$
B\,\delta\mathbf c + E\,\delta\mathbf p = -\mathbf g_c, \qquad E^\top\delta\mathbf c + C\,\delta\mathbf p = -\mathbf g_p .
$$

2 本目を点について解いて $\delta\mathbf p = C^{-1}(-\mathbf g\_p - E^\top\delta\mathbf c)$ とし、1 本目に代入します：

$$
\underbrace{\big(B - E\,C^{-1}E^\top\big)}_{S}\;\delta\mathbf c = -\mathbf g_c + E\,C^{-1}\mathbf g_p .
$$

この**縮約カメラ系（reduced camera system）**の未知数は $6m$ 個だけです。これを解いたら、各点は**後退代入**で独立に更新されます：$\delta\mathbf X\_j = C\_j^{-1}\big(-\mathbf g\_{p,j} - \sum\_i E\_{ij}^\top\delta\mathbf c\_i\big)$。近似は一切ありません。結果は全体系の Gauss-Newton ステップと厳密に一致します。それでいて計算量は劇的に変わります。インターネット写真の典型的な再構成で $m = 1000$ 台のカメラと $n = 200\,000$ 点があれば、未知数は $606\,000$ 個です。密に解くのは絶望的ですが、Schur 補行列を使えば $6000\times6000$ の系と、20 万個の $3\times3$ 行列の逆行列計算が残るだけです。写真測量ではバンドル調整の初期からこの縮約が使われ、それ以来あらゆる BA ソルバーの中核になっています（Triggs ら 2000、Lourakis と Argyros 2009）。

Levenberg-Marquardt は、消去の前に第 02 回のダンピング $\lambda\,\mathrm{diag}$ を $B$ と $C$ の対角に加えます。構造は変わりません。もう一つの細部として、カメラ 1 の 6 個の未知数を $S$ から取り除いてカメラ 1 を固定します。これで 7 個のゲージ自由度のうち 6 個が固定されます。7 個目のスケールが害にならない理由は第 3.7 節で説明します。以下がバンドル調整器の全体です：

```python
def robust_weight(s, kernel, delta):
    """rho(s) and w = rho'(s) for squared residual norms s (Ceres-style kernels)."""
    if kernel == "l2":
        return s, np.ones_like(s)
    if kernel == "huber":
        r = np.sqrt(s)
        return (np.where(r <= delta, s, 2 * delta * r - delta**2),
                np.where(r <= delta, 1.0, delta / np.maximum(r, 1e-12)))
    if kernel == "cauchy":
        return delta**2 * np.log1p(s / delta**2), 1.0 / (1.0 + s / delta**2)

def residuals(cams, X, obs_set):
    ci, pj, uv = obs_set
    r = np.zeros_like(uv)
    for i, (R, t) in enumerate(cams):
        sel = ci == i
        r[sel] = project(K, R, t, X[pj[sel]])[0] - uv[sel]
    return r

def ba_cost(cams, X, obs_set, kernel="l2", delta=1.0):
    r = residuals(cams, X, obs_set)
    return robust_weight((r * r).sum(1), kernel, delta)[0].sum()

def ba_step(cams, X, obs_set, lam, fixed, kernel="l2", delta=1.0):
    """One damped Gauss-Newton step: build the normal equations block by block,
    eliminate the points with the Schur complement, solve for the cameras, back-substitute."""
    ci, pj, uv = obs_set
    m, n = len(cams), len(X)
    Jc = np.zeros((len(ci), 2, 6)); Jx = np.zeros((len(ci), 2, 3)); r = np.zeros((len(ci), 2))
    for i, (R, t) in enumerate(cams):
        sel = ci == i
        pred, Jc[sel], Jx[sel] = project_jac(K, R, t, X[pj[sel]])
        r[sel] = pred - uv[sel]
    w = robust_weight((r * r).sum(1), kernel, delta)[1]      # IRLS weight of each observation
    B = np.zeros((m, 6, 6)); gc = np.zeros((m, 6))          # camera blocks  B_i = sum J_c^T J_c
    C = np.zeros((n, 3, 3)); gp = np.zeros((n, 3))          # point blocks   C_j = sum J_x^T J_x
    np.add.at(B, ci, np.einsum("k,kai,kaj->kij", w, Jc, Jc))
    np.add.at(gc, ci, np.einsum("k,kai,ka->ki", w, Jc, r))
    np.add.at(C, pj, np.einsum("k,kai,kaj->kij", w, Jx, Jx))
    np.add.at(gp, pj, np.einsum("k,kai,ka->ki", w, Jx, r))
    E = np.zeros((m, 6, n, 3))                               # coupling blocks E_ij = J_c^T J_x
    E[ci, :, pj, :] = np.einsum("k,kai,kaj->kij", w, Jc, Jx) # (stored densely here for clarity)
    B += lam * np.einsum("kii->ki", B)[:, :, None] * np.eye(6)   # Marquardt damping
    C += lam * np.einsum("kii->ki", C)[:, :, None] * np.eye(3)
    Cinv = np.linalg.inv(C)                                  # n independent 3 x 3 inverses
    E = E.reshape(6 * m, 3 * n)
    ECinv = np.einsum("ajk,jkl->ajl", E.reshape(6 * m, n, 3), Cinv).reshape(6 * m, 3 * n)
    S = -ECinv @ E.T                                         # S = B - E C^-1 E^T
    for i in range(m):
        S[6 * i:6 * i + 6, 6 * i:6 * i + 6] += B[i]
    b = -gc.ravel() + ECinv @ gp.ravel()                     # b = -g_c + E C^-1 g_p
    free = np.ones(6 * m, bool)
    for i in fixed:
        free[6 * i:6 * i + 6] = False                       # hold these cameras still
    dc = np.zeros(6 * m)
    dc[free] = np.linalg.solve(S[np.ix_(free, free)], b[free])
    dX = -gp - (E.T @ dc).reshape(n, 3)                      # back-substitution, point by point:
    dX = np.einsum("kij,kj->ki", Cinv, dX)                   # dX_j = C_j^-1 (-g_pj - sum_i E_ij^T dc_i)
    new_cams = []
    for (R, t), d in zip(cams, dc.reshape(m, 6)):
        dR = rodrigues(d[:3])
        new_cams.append((dR @ R, dR @ t + d[3:]))
    return new_cams, X + dX, S

def bundle_adjust(cams, X, obs_set, fixed=(0,), iters=50, lam=1e-3, kernel="l2", delta=1.0):
    """Levenberg-Marquardt on the (robust) reprojection error, as in post 02."""
    cost = ba_cost(cams, X, obs_set, kernel, delta)
    log = [(cost, lam)]
    for it in range(iters):
        while True:
            new_cams, new_X, S = ba_step(cams, X, obs_set, lam, fixed, kernel, delta)
            new_cost = ba_cost(new_cams, new_X, obs_set, kernel, delta)
            if new_cost < cost:
                break
            lam *= 4                                         # reject: damp harder
            if lam > 1e10:
                return cams, X, log
        done = cost - new_cost < 1e-10 * cost
        cams, X, cost, lam = new_cams, new_X, new_cost, lam / 3
        log.append((cost, lam))
        if done:
            break
    return cams, X, log

obs_all = (cam_idx, pt_idx, uv_obs)
rng_init = np.random.default_rng(3)                           # a perturbed start:
cams0 = [cams_true[0]]                                       # rotations off by ~2 deg,
for R, t in cams_true[1:]:                                   # centres and points by ~0.15
    dR = rodrigues(rng_init.normal(0, np.deg2rad(2.0), 3))
    Cc = -R.T @ t + rng_init.normal(0, 0.15, 3)
    cams0.append((dR @ R, -(dR @ R) @ Cc))
X0 = X_true + rng_init.normal(0, 0.15, X_true.shape)

cams_ba, X_ba, log = bundle_adjust(cams0, X0, obs_all)
S = ba_step(cams_ba, X_ba, obs_all, 0.0, (0,))[2]
print("normal equations %d x %d, Schur complement %d x %d" % (6 * m + 3 * n, 6 * m + 3 * n, *S.shape))
for it in (0, 1, 2, 3, len(log) - 1):
    print("iteration %2d: rms %.4f px  lambda %.1e" % (it, np.sqrt(log[it][0] / L), log[it][1]))
dof = 2 * L - (6 * m + 3 * n - 7)
print("expected rms at the optimum: sigma * sqrt(dof / L) = %.4f px" % (sigma * np.sqrt(dof / L)))
print("rms with the true cameras and points: %.4f px" % np.sqrt(ba_cost(cams_true, X_true, obs_all) / L))
```

```text
normal equations 408 x 408, Schur complement 48 x 48
iteration  0: rms 46.8114 px  lambda 1.0e-03
iteration  1: rms 2.3807 px  lambda 3.3e-04
iteration  2: rms 0.6302 px  lambda 1.1e-04
iteration  3: rms 0.6283 px  lambda 3.7e-05
iteration  6: rms 0.6283 px  lambda 1.4e-06
expected rms at the optimum: sigma * sqrt(dof / L) = 0.6289 px
rms with the true cameras and points: 0.7070 px
```

（読みやすさのため結合ブロックは密に保存しています。$\vert\mathcal O\vert \ll mn$ の場合、実際のソルバーは非ゼロの $E\_{ij}$ だけを保存します。）真のシーンから出発し、各カメラを約 2° 回転させ、各カメラ中心と各点を約 15 cm 動かします。このときの RMS 再投影誤差は 47 px です。2 回の反復で 0.63 px になり、6 回後にはコストはもう変わりません。

0.6283 px は正しい答えでしょうか。最小二乗問題の最適点では、残差はモデルがノイズに当てはめるのに使った自由度の分だけ小さくなります：$\mathbb E\,\lVert\mathbf r\rVert^2 = \sigma^2(2L - p)$、有効パラメータ数は $p = 6m + 3n - 7 = 401$ です。ここでの RMS は観測あたりの長さ $\sqrt{\lVert\mathbf r\rVert^2/L}$ なので、期待値は $\sigma\sqrt{(2L - p)/L} = 0.6289$ px で、測定値は 0.6283 px です。自由度を何も当てはめていない真のシーンは $\sigma\sqrt2 = 0.707$ px を与えます。最適点が真値*より低い*のは推定量が正しく収束したしるしで、過学習が悪さをしたわけではありません。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-ba.svg" caption="この記事を通じた例のバンドル調整。左：LM の反復 $k$ ごとの RMS 再投影誤差（紫、左軸）：46.81、2.38、0.63 px のあと、期待値 0.629 px（点線）で平坦になります。ダンピング $\lambda$（橙、右軸）はすべてのステップが採用されたので毎回 1/3 になります。中央と右：相似変換で真値（灰）に合わせた推定（紫）の上面図（$x$ 対 $z$）。赤線は各推定点を真の位置に結びます。$k=0$ ではカメラ中心と点の RMS 3D 誤差は 0.26 と 0.25、BA 後は 0.0047 と 0.0043 で、10 m のシーンで 2〜5 mm です。" %}

### 3.6 結果はどれくらい正確か

再構成を真値と比べるには、まずゲージを取り除く必要があります。推定を真値に最もよく重ねる相似変換（回転、並進、スケール）を求め、残った誤差を測ります。閉形式解は梅山（1991）によるもので、第 2.3 節の絶対姿勢にスケールを加えたものです。

```python
def umeyama(A, B):
    """Similarity (s, R, t) minimizing sum |s R A_k + t - B_k|^2 (Umeyama 1991)."""
    a, b = A.mean(0), B.mean(0)
    U, D, Vt = np.linalg.svd((B - b).T @ (A - a) / len(A))
    S = np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))])
    R = U @ S @ Vt
    s = np.trace(np.diag(D) @ S) / ((A - a) ** 2).sum(1).mean()
    return s, R, b - s * R @ a

def centres(cams):
    return np.array([-R.T @ t for R, t in cams])

def errors(cams, X):
    """Camera-centre and point RMSE after aligning (cameras + points) to the truth."""
    s, Ra, ta = umeyama(np.vstack([centres(cams), X]), np.vstack([centres(cams_true), X_true]))
    ec = centres(cams) @ (s * Ra).T + ta - centres(cams_true)
    ex = X @ (s * Ra).T + ta - X_true
    return np.sqrt((ec**2).sum(1).mean()), np.sqrt((ex**2).sum(1).mean())

print("start: centre RMSE %.4f, point RMSE %.4f" % errors(cams0, X0))
print("after BA: centre RMSE %.4f, point RMSE %.4f" % errors(cams_ba, X_ba))
```

```text
start: centre RMSE 0.2641, point RMSE 0.2518
after BA: centre RMSE 0.0047, point RMSE 0.0043
```

誤差は 55〜60 分の 1 になり、約 4〜5 mm です。これはよくある質問への答えでもあります。BA に完璧な初期値は要りませんが、収束域の中の初期値は必要です。第 4 節では、パイプラインがそのような初期値をどう作るかを見ます。

下のウィジェットで自分で試してみてください。より小さなシーン（カメラ 6 台、42 点）で同じアルゴリズムをブラウザ上で実行します。

{% include widget.liquid name="3d-vision-bundle-adjustment" height="760" caption="Levenberg-Marquardt を 1 ステップずつ進めるバンドル調整。本文のアルゴリズム（第 3.3 節のヤコビアン、カメラ 1 を固定した Schur 補行列、後退代入、Marquardt のダンピング）を、カメラ 6 台と 42 点に適用します。3D ビューでは真値が灰色、自由なスケールを取り除いた推定が青（カメラ）と紫（点）で、赤線は点の誤差です。ドラッグで回転できます。画像には選んだカメラの観測（点）、現在の予測（紫の ×）、その間の残差が表示されます。初期誤差を大きくしてみてから、アウトライアをオンにして L2、Huber、Cauchy の各カーネルを比べてください。アウトライアが 15% あると L2 は残差の大きな誤った答えに収束しますが、Cauchy はシーンを復元します。グラフの破線は最適点で期待される RMS $\sigma\sqrt{(2L-p)/L}$ です。" %}

### 3.7 ゲージの自由度

**ゲージが存在する理由。** ワールドの任意の相似変換 $\mathbf X \mapsto sQ\mathbf X + \mathbf d$（回転 $Q$、スケール $s > 0$、並進 $\mathbf d$）を考え、各カメラを $R\_i' = R\_i Q^\top$、$\mathbf t\_i' = s\mathbf t\_i - R\_i Q^\top\mathbf d$ に変えます。すると

$$
R_i'(sQ\mathbf X_j + \mathbf d) + \mathbf t_i' = sR_i\mathbf X_j + R_iQ^\top\mathbf d + s\mathbf t_i - R_iQ^\top\mathbf d = s\,(R_i\mathbf X_j + \mathbf t_i).
$$

カメラ座標は $s$ 倍されますが、投影 $\pi$ は $Z$ で割るので $s$ は打ち消されます。どの画素も変わりません。コストは 7 次元の方向の族に沿って厳密に平坦です。

**ソルバーから見えるもの。** 最適点で $J$ は 7 次元の零空間を持ち、$J^\top J$ は 7 個のゼロ固有値を持ちます：

```python
def full_jacobian(cams, X, obs_set):
    ci, pj, _ = obs_set
    J = np.zeros((2 * len(ci), 6 * len(cams) + 3 * len(X)))
    for i, (R, t) in enumerate(cams):
        sel = np.flatnonzero(ci == i)
        _, Jc, Jx = project_jac(K, R, t, X[pj[sel]])
        for k, o in enumerate(sel):
            J[2 * o:2 * o + 2, 6 * i:6 * i + 6] = Jc[k]
            J[2 * o:2 * o + 2, 6 * len(cams) + 3 * pj[o]:6 * len(cams) + 3 * pj[o] + 3] = Jx[k]
    return J

J = full_jacobian(cams_ba, X_ba, obs_all)
ev = np.linalg.eigvalsh(J.T @ J)
print("J is %d x %d, rank %d" % (*J.shape, np.linalg.matrix_rank(J)))
print("eigenvalues of J^T J: 7 smallest all below %.0e, then %.0f, %.0f, ..., largest %.1e"
      % (np.abs(ev[:7]).max(), ev[7], ev[8], ev[-1]))
```

```text
J is 1920 x 408, rank 401
eigenvalues of J^T J: 7 smallest all below 5e-09, then 2359, 5140, ..., largest 3.4e+07
```

ランクは $408 - 7 = 401$ で、7 番目と 8 番目の固有値の間には 11 桁以上の差があります。素朴な Gauss-Newton は特異行列の逆を求めようとしてしまいます。標準的な対処法は四つあります：

1. **パラメータを固定する。** カメラを 1 台固定し（6 自由度）、スケールのためにもう一つの数、たとえば二つのカメラ中心の距離や 2 台目のカメラの座標の一つを固定します。COLMAP は 1 台目のカメラの姿勢と、2 台目のカメラ位置の座標の一つを固定します。
2. **ダンピングに任せる。** LM の $\lambda\,\mathrm{diag}$ は系を可逆にし、それが生むステップは平坦な方向の成分を持ちません。その方向に進んでもコストが下がらないからです。我々のソルバーはカメラ 1 を固定し、スケールはダンピングに任せています。
3. **最小拘束または内部拘束。** ゲージをちょうど取り除く拘束、たとえば点の重心と平均距離の固定を加えるか、擬似逆行列で解きます。写真測量ではフリーネットワーク調整（free-network adjustment）と呼びます。
4. **事前情報。** GPS の位置、IMU の重力方向、既知の基線長は、本物の情報でゲージの一部または全部を固定します。

**不確かさにとって重要です。** 第 02 回の第 5 節では $\sigma^2(J^\top J)^{-1}$ から不確かさを読み取りました。BA ではこの行列は存在しません。共分散はゲージを選んで初めて定義され、選んだゲージに依存します。「カメラ 7 の不確かさは 3 cm」という言葉の意味は、カメラ 1 を固定した場合と重心を固定した場合とで異なります。不確かさはゲージと一緒に報告するか、カメラ間の距離のようなゲージに依存しない量を計算しましょう。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-gauge.svg" caption="左：BA の解における $J^\top J$ の 408 個の固有値を並べたもの。最初の 7 個（赤）は $5\times10^{-9}$ 未満で数値的にゼロ、8 番目は 2359 です。右：解を異なる方向に $\alpha$ だけ動かしたときの RMS 再投影誤差。シーン全体の拡大縮小（$s=e^{0.7\alpha}$、0.50 から 2.0）や鉛直軸まわりの最大 $\pm 34°$ の回転では RMS は厳密に 0.628 px のままです。これらはゲージの運動です。最小の非ゼロ固有値の固有ベクトル $\mathbf v\_8$（最も弱い本物の方向）に沿った単位ステップでは 1.65 px、$\mathbf v\_{41}$（$\lambda=20974$）に沿っては 4.47 px に上がります。" %}

### 3.8 ロバストカーネル

残差 50 px の誤対応 1 個は二乗コストに $2500$ を加えます。$0.5$ px の良い観測 $10\,000$ 個分です。最小二乗はこの 1 項を減らすために再構成全体をゆがめます。RANSAC は BA の前に誤対応の大部分を取り除きますが、必ず一部は生き残ります。繰り返しテクスチャ、動く物体、誤った三角測量などです。**ロバストカーネル**は $s = \lVert\mathbf r\rVert^2$ を、大きな残差に対してゆっくり増加する関数 $\rho(s)$ に置き換えます。スケールを $\delta$（px）とすると、最もよく使われるのは次の二つです：

$$
\rho_{\text{Huber}}(s) = \begin{cases} s & \sqrt s \le \delta \\ 2\delta\sqrt s - \delta^2 & \sqrt s > \delta \end{cases},
\qquad
\rho_{\text{Cauchy}}(s) = \delta^2\log\Big(1 + \frac{s}{\delta^2}\Big).
$$

Huber はゼロ付近で 2 次、$\delta$ を超えると線形です。凸なので局所解を増やしませんが、大きな残差は一定の力で引っ張り続けます。Cauchy は対数的にしか増えないので 50 px のアウトライアはほとんど効きませんが、コストはもう凸ではなく、まずまずの初期値が必要です。

**ソルバーでの使い方：IRLS。** $\rho(\lVert\mathbf r\rVert^2)$ の勾配は $2\rho'(s)\,J^\top\mathbf r$ で、各残差を $w = \rho'(s)$ で重み付けした普通の最小二乗コストの勾配です。そのためロバストな問題は**重み付き**最小二乗問題の列として解けます。現在の残差から重みを計算し、$J^\top WJ$ と $J^\top W\mathbf r$ で Gauss-Newton を 1 ステップ進め、これを繰り返します。これが**反復重み付き最小二乗法（iteratively reweighted least squares、IRLS）**で、重みは `robust_weight` が返す値です。Huber は閾値内で $w = 1$、外で $\delta/\lVert\mathbf r\rVert$、Cauchy は $w = 1/(1 + s/\delta^2)$ です。（Triggs らは $\rho$ の曲率も残す改良を述べており、Ceres はそれを実装しています。）観測の 5% を 10〜60 px ずらし、同じ初期値から各カーネルで BA を実行します：

```python
rng_out = np.random.default_rng(7)
uv_bad = uv_obs.copy()
bad_obs = rng_out.random(L) < 0.05                           # 5% of the observations are wrong:
nb = bad_obs.sum()                                           # bad matches 10-60 px away
uv_bad[bad_obs] += rng_out.uniform(10, 60, (nb, 2)) * rng_out.choice([-1, 1], (nb, 2))
obs_bad = (cam_idx, pt_idx, uv_bad)
print("outlier observations:", bad_obs.sum())
for kernel in ("l2", "huber", "cauchy"):
    c, X_, log_ = bundle_adjust(cams0, X0, obs_bad, kernel=kernel, delta=1.0)
    r = np.linalg.norm(residuals(c, X_, obs_bad), axis=1)
    print("%-6s centre RMSE %.4f, point RMSE %.4f, median inlier residual %.3f px, %d iterations"
          % (kernel, *errors(c, X_), np.median(r[~bad_obs]), len(log_) - 1))
```

```text
outlier observations: 51
l2     centre RMSE 0.0816, point RMSE 0.0717, median inlier residual 1.952 px, 6 iterations
huber  centre RMSE 0.0049, point RMSE 0.0048, median inlier residual 0.520 px, 13 iterations
cauchy centre RMSE 0.0043, point RMSE 0.0045, median inlier residual 0.489 px, 30 iterations
```

$L\_2$ では 51 個の悪い観測がカメラ中心を 8 cm ずらし、その誤差をすべての良い観測に押し付けます（それらの残差の中央値は約 0.5 ではなく 1.95 px）。Huber と Cauchy はどちらもアウトライアなしの場合の精度（4.7 mm）までシーンを復元し、良い観測も再び半画素程度に当てはまります。Cauchy は非凸カーネルの常として反復回数が多くなります。$\delta$ の実用的な選び方は、想定されるインライアのノイズの 2〜3 倍です。COLMAP が使う Ceres は、Huber、soft $L\_1$、Cauchy ほか数種類の損失関数を提供しています。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-robust.svg" caption="左：$\delta=1$ px のときのカーネル $\rho$ を残差の長さの関数として描いたもの。中央：IRLS の重み $w=\rho'$。$L\_2$ はすべての残差を完全に信頼し、Huber は $\delta/\lVert\mathbf r\rVert$、Cauchy は $1/(1+\lVert\mathbf r\rVert^2/\delta^2)$ で重みを下げるので、10 px のアウトライアの重みはそれぞれ 0.1 と 0.01 です。右：同じ初期値からの BA 後のカメラ中心の RMSE。アウトライアなし（灰、$L\_2$）で 0.0047、アウトライア 5% では $L\_2$ が 0.0816、Huber が 0.0049、Cauchy が 0.0043 です。" %}

### 3.9 大規模化

我々のソルバーは $S$ を密に作り、密な分解で解きます。$O(m^3)$ で、数百台のカメラなら問題ありません。実際のシステムはさらに先へ進みます：

- **$S$ の疎 Cholesky 分解。** ほとんどのカメラ対が点を共有しない（疎構造の図の白いブロック）とき $S$ は疎です。疎直接法ソルバー（Ceres は CHOLMOD を使います）は、フィルインを減らす並べ替えを使って分解します。
- **反復 Schur（iterative Schur）。** 非常に大きな問題では $S$ をそもそも作りません。共役勾配法が $B$、$E$、$C^{-1}$ との積だけを使って $S\delta\mathbf c = \mathbf b$ を解き、ブロック Jacobi の前処理を使います。Agarwal ら（2010）は "Bundle Adjustment in the Large" データセットでこうした非厳密 Newton 法を調べ、Wu ら（2011）はマルチコア CPU と GPU で動かしました。
- **局所 BA。** インクリメンタル SfM と SLAM は、各ステップの後に最近変化したカメラとその点だけを、周囲のカメラを固定して最適化し、全体の BA はときどきしか実行しません。
- **内部パラメータと歪み**は共有パラメータの第 3 のブロックとして加えられます。第 02 回のキャリブレーションのヤコビアンの矢じり型構造そのものです。

よく使われるライブラリは Ceres Solver（COLMAP）、g2o、GTSAM（因子グラフ。[第 06 回]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})の言語です）です。

## 4. インクリメンタル Structure-from-Motion

### 4.1 パイプライン

**インクリメンタル SfM** は 2 視点から始め、画像を 1 枚ずつ加えながら BA を実行します。Photo Tourism（Snavely ら 2006）がインターネット写真でこれを有名にし、COLMAP（Schönberger と Frahm 2016）が最も広く使われている現代的な形です。手順は次のとおりです：

1. **対応探索。** 各画像で特徴を抽出し、画像対をマッチングします（[第 03 回]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})）。**幾何学的検証（geometric verification）**では、RANSAC のもとで対応が基礎行列・基本行列・ホモグラフィのいずれかと整合する画像対だけを残します（第 04 回）。結果が**シーングラフ（scene graph）**（ビューグラフ）で、画像がノード、検証済みの画像対がエッジです。対応は画像対をまたいで連結され、3D 点 1 個につき 1 本の**トラック（track）**になります。
2. **初期化。** 良い画像対を選び、相対姿勢を推定し（第 04 回）、三角測量して 2 視点の BA を実行します。
3. **画像の登録。** 既に再構成された点を多く見る次の画像を選び、RANSAC 内の PnP と運動のみの精密化で位置決めします（第 2 節）。
4. **三角測量。** 新しい画像によって、十分な角度で 2 台以上の登録済みカメラから見えるようになったトラックを三角測量します。
5. 影響を受けた部分の**バンドル調整**（局所 BA）と、ときどき全体の BA（大域 BA）。
6. **フィルタリング。** 再投影誤差の大きい観測と三角測量角の小さすぎる点を取り除き、三角測量し直します。追加できる画像がなくなるまで 3 から繰り返します。

### 4.2 おもちゃのインクリメンタル SfM

ドリフトを見せるために設計した新しいシーンで、手順 2〜5 を実装します。30 台のカメラが廊下を 20 m 進み、それぞれ 4〜12 m 先の点を横向きに見ます。ノイズは 1 px です。各カメラはシーンの一部分しか見ないので、情報はカメラからカメラへ受け渡されなければなりません。まず第 04 回の 2 視点の道具を簡潔に：

```python
def essential_8pt(f1, f2):
    """Linear 8-point estimate of E (f2^T E f1 = 0) from unit bearings, projected to rank 2."""
    A = np.einsum("ni,nj->nij", f2, f1).reshape(-1, 9)
    U, _, Vt = np.linalg.svd(np.linalg.svd(A)[2][-1].reshape(3, 3))
    return U @ np.diag([1.0, 1.0, 0.0]) @ Vt

def triangulate(poses, f):
    """Multi-view DLT: poses [(R, t)], f the matching bearings (one per view)."""
    A = []
    for (R, t), b in zip(poses, f):
        P = np.c_[R, t]
        A += [b[0] * P[2] - b[2] * P[0], b[1] * P[2] - b[2] * P[1]]
    Xh = np.linalg.svd(np.array(A))[2][-1]
    return Xh[:3] / Xh[3]

def pose_from_E(E, f1, f2):
    """The four (R, t) of E; keep the one that puts most points in front of both cameras."""
    U, _, Vt = np.linalg.svd(E)
    U, Vt = U * np.sign(np.linalg.det(U)), Vt * np.sign(np.linalg.det(Vt))
    Wm = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1.0]])
    best, best_n = None, -1
    for R in (U @ Wm @ Vt, U @ Wm.T @ Vt):
        for t in (U[:, 2], -U[:, 2]):
            Xs = np.array([triangulate([(np.eye(3), np.zeros(3)), (R, t)], [a, b]) for a, b in zip(f1, f2)])
            n_front = np.sum((Xs[:, 2] > 0) & ((Xs @ R.T + t)[:, 2] > 0))   # cheirality
            if n_front > best_n:
                best, best_n = (R, t), n_front
    return best
```

次にパイプライン本体です。次の視点は、再構成済みの点を最も多く見る未登録のカメラです。登録には EPnP と精密化を使います（ここにはアウトライアがないので RANSAC は省きます）。光線のなす角が 2° 以上で再投影誤差が 4 px 以内なら新しい点を三角測量し、指定があれば登録のたびに Huber カーネル付きの BA を実行します：

```python
rng_c = np.random.default_rng(11)
Xw_c = np.c_[rng_c.uniform(-4, 26, 900), rng_c.uniform(-1.5, 1.5, 900), rng_c.uniform(4, 12, 900)]
cams_c = []                                                  # 30 cameras walking along x,
for k in range(30):                                         # looking at points 4-12 m away
    R = rodrigues([0, np.deg2rad(rng_c.normal(0, 4)), 0])
    cams_c.append((R, -R @ np.array([0.7 * k, 0, 0])))
obs_c = {}                                                   # (i, j) -> observed pixel
for i, (R, t) in enumerate(cams_c):
    uv, depth = project(K, R, t, Xw_c)
    for j in np.flatnonzero((depth > 0) & (uv[:, 0] >= 0) & (uv[:, 0] < W) & (uv[:, 1] >= 0) & (uv[:, 1] < H)):
        obs_c[i, j] = uv[j] + rng_c.normal(0, 1.0, 2)
print("corridor: %d cameras, %d points, %d observations" % (len(cams_c), len(Xw_c), len(obs_c)))

def obs_arrays(reg, pts):
    """Observations among registered cameras and triangulated points, re-indexed for BA."""
    ci = {c: k for k, c in enumerate(reg)}; pj = {p: k for k, p in enumerate(pts)}
    keys = [(i, j) for (i, j) in obs_c if i in ci and j in pj]
    return (np.array([ci[i] for i, _ in keys]), np.array([pj[j] for _, j in keys]),
            np.array([obs_c[k] for k in keys]))

def incremental_sfm(init=(0, 4), use_ba=True, min_angle=2.0):
    i0, i1 = init
    common = [j for j in range(len(Xw_c)) if (i0, j) in obs_c and (i1, j) in obs_c]
    f0 = bearings(K, np.array([obs_c[i0, j] for j in common]))
    f1 = bearings(K, np.array([obs_c[i1, j] for j in common]))
    poses = {i0: (np.eye(3), np.zeros(3)), i1: pose_from_E(essential_8pt(f0, f1), f0, f1)}
    points, order = {}, [i0, i1]

    def add_points():
        for j in range(len(Xw_c)):
            if j in points:
                continue
            seen = [i for i in poses if (i, j) in obs_c]
            if len(seen) < 2:
                continue
            f = [bearings(K, obs_c[i, j][None])[0] for i in seen]
            X = triangulate([poses[i] for i in seen], f)
            rays = [poses[i][0].T @ fi for i, fi in zip(seen, f)]           # world-frame rays
            angle = max(np.degrees(np.arccos(np.clip(a @ b, -1, 1))) for a in rays for b in rays)
            ok = angle >= min_angle
            for i in seen:
                uv, d = project(K, *poses[i], X[None])
                ok &= d[0] > 0 and np.linalg.norm(uv[0] - obs_c[i, j]) < 4.0
            if ok:
                points[j] = X

    def run_ba():
        reg, pts = list(poses), list(points)
        cams, X, _ = bundle_adjust([poses[i] for i in reg], np.array([points[j] for j in pts]),
                                   obs_arrays(reg, pts), fixed=(0,), kernel="huber", delta=2.0)
        poses.update(zip(reg, cams)); points.update(zip(pts, X))

    add_points()
    if use_ba:
        run_ba()
    while len(poses) < len(cams_c):
        counts = {i: sum((i, j) in obs_c for j in points) for i in range(len(cams_c)) if i not in poses}
        i = max(counts, key=counts.get)                    # next view: sees most 3D points
        js = [j for j in points if (i, j) in obs_c]
        Xw = np.array([points[j] for j in js]); uv = np.array([obs_c[i, j] for j in js])
        R, t = epnp(Xw, uv, K)
        poses[i] = refine_pose(R, t, Xw, uv, K)
        order.append(i)
        add_points()
        if use_ba:
            run_ba()                                        # COLMAP: local BA here, global BA now and then
    return poses, points, order

def trajectory_errors(poses):
    """Centre errors after aligning the initial pair (gauge of the reconstruction) to the truth."""
    est = np.array([-poses[i][0].T @ poses[i][1] for i in range(len(cams_c))])
    tru = np.array([-R.T @ t for R, t in cams_c])
    R0 = cams_c[0][0]                                       # camera 0 defines the frame,
    s = np.linalg.norm(tru[4] - tru[0]) / np.linalg.norm(est[4])   # the initial baseline the scale
    aligned = (s * est - cams_c[0][1]) @ R0                 # camera-0 frame -> world: R0^T (X - t0)
    return np.linalg.norm(aligned - tru, axis=1), aligned

runs = {}
for use_ba in (False, True):
    runs[use_ba] = poses, points, order = incremental_sfm(use_ba=use_ba)
    err, _ = trajectory_errors(poses)
    print("BA %-5s: %d points, order %s..., centre error at cameras 0, 10, 20, 29: %s m"
          % (use_ba, len(points), order[:8], err[[0, 10, 20, 29]].round(3)))
```

```text
corridor: 30 cameras, 900 points, 9203 observations
BA False: 806 points, order [0, 4, 3, 5, 7, 8, 10, 6]..., centre error at cameras 0, 10, 20, 29: [0.    0.096 0.511 1.202] m
BA True : 826 points, order [0, 4, 3, 5, 7, 8, 10, 6]..., centre error at cameras 0, 10, 20, 29: [0.    0.007 0.024 0.044] m
```

誤差は再構成自身が定める座標系で測ります。カメラ 0 を真の姿勢に置き、スケールはカメラ 0 からカメラ 4 への初期基線で決めます。BA なしでは、各登録はその位置決めに使った点の誤差を引き継ぎ、それらの点はそれを三角測量したカメラの誤差を引き継ぎます。誤差は積み重なり、20 m 進むと最後のカメラは 1.2 m ずれます。画像ごとに BA を行うと、すべての観測がすべてのパラメータを一緒に拘束し、最後のカメラのずれは 4.4 cm、27 倍良くなります。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-incremental.svg" localized="true" caption="廊下シーンでのおもちゃのインクリメンタル SfM（0.7 m おきに 30 台のカメラ、4〜12 m 先の 900 点、ノイズ 1 px）。左：カメラ中心の上面図（$z$ 軸は約 10 倍に引き伸ばしています）。再構成はカメラ 0 に固定し、カメラ 4 までの初期基線でスケールを決めています。BA なし（橙）では回転誤差が軌跡を曲げ、スケール誤差が引き伸ばし、最後のカメラは 1.20 m ずれます。画像ごとに BA を行うと（紫）真値（黒）の上にとどまります。右上：カメラごとの中心誤差（対数目盛、カメラ 29 で 1.202 m 対 0.044 m）。右下：局所スケール、つまり隣り合うカメラ間の推定距離と真の距離の比。BA なしでは終点で 1.09 までドリフトし（1 ステップでは最大 1.19）、BA ありでは 1 から 1% 以内にとどまります。" %}

### 4.3 COLMAP がうまくやっていること、各ステップが重要な理由

おもちゃは骨組みを示しました。COLMAP を実際の写真コレクションで頑健にしている細部は知っておく価値があります。再構成が失敗したときに回すつまみでもあるからです。

**初期画像対の選択。** 最初の対は座標系とスケールを決め、残りすべての土台になるので、信頼できなければなりません。検証済みの対応が多く、*しかも*基線が広い必要があります。対応がホモグラフィでも基本行列と同じくらいよく説明される画像対は悪い選択です。純粋な回転（基線がなく奥行きもない、第 04 回）か、ほぼ平面のシーンで、基本行列がうまく決まりません。廊下シーンの最初の版では、すべての点が 8 m 先の厚さ 2 m の薄い層にありました。そのとき対 (0, 4) の線形 8 点法の推定は並進方向が 65° ずれ、再構成は失敗しました。点を 4〜12 m に広げると解決しました。COLMAP はシーングラフの密につながった部分にある、検証済み対応の多い画像対を好み、2 視点幾何のステップでホモグラフィと基本行列のインライアを比べて、平面的な対や純粋な回転の対に印を付けます。

**次の最良視点（next best view）の選択。** 少数の点や偏った点に対して画像を登録すると姿勢の拘束が弱く、早い段階の誤りは後から取り返しにくくなります。COLMAP は候補画像を、見える 3D 点の数だけでなく、多重解像度の格子を使って点が画像全体にどれだけ均等に広がっているかでも評価します。画像全体に広がった点のほうが姿勢をよく拘束します。

**ロバストな三角測量。** トラックには誤対応が含まれることがあります。COLMAP は各トラックを観測の対に対する RANSAC で三角測量し、三角測量角（既定値 1.5°。[ニューラルレンダリング第 1 回]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})で見たとおり、これより小さいと深度誤差が急増します）と正の深度（すべてのカメラで深度が正）を確認します。

**局所 BA と大域 BA。** 各登録の後、COLMAP は新しい画像と最もつながりの強い近傍に対して BA を行い、モデルが一定の割合だけ成長したら大域 BA を行います。そして再投影誤差の大きい観測を取り除いて三角測量し直し、以前の誤差で失われたトラックを回復します。

**失敗のパターン。** インクリメンタル SfM は逐次的なので、結果が順序に依存し、早期の誤りが伝播します。ループの閉じない長い鎖ではドリフトが蓄積します。対称的・反復的な構造（そっくりな二つのファサード、ドームの内側と外側）は、誤っているのに幾何学的には整合した登録を生むことがあります。また BA を繰り返すので計算量は画像数に対して線形より速く増えます。Wu（2013）は主要なステップを線形時間に近く保つ方法を示しました。

## 5. グローバル Structure-from-Motion

### 5.1 考え方

**グローバル SfM** は逐次的な成長を避けます。シーングラフから検証済みの各画像対の相対姿勢 $(R\_{ij}, \hat{\mathbf t}\_{ij})$、つまり第 04 回の回転と並進の*方向*（長さは未知）を取り出し、すべてのカメラを一度に解きます：

1. **回転平均（rotation averaging）**：すべての相対回転と整合する絶対回転 $R\_i$ を求めます。
2. **並進平均（translation averaging）**（または全体位置推定、global positioning）：相対方向と整合する位置を求めます。
3. すべてのトラックを三角測量し、大域 BA を**1 回**実行します。

すべての画像が同じように扱われ、間違えうる順序もなく、高価な BA は何百回ではなく 1 回だけです。代償はロバスト性です。誤った相対姿勢がわずかにあるだけで解全体が台無しになりうるので、ロバストな平均化が欠かせません。

### 5.2 回転平均

ワールドからカメラへの回転を使うと、カメラ $i$ からカメラ $j$ への相対回転は $R\_{ij} = R\_j R\_i^\top$ です。これはカメラ $i$ の座標をカメラ $j$ の座標に写します。測定された $R\_{ij}$ のそれぞれが方程式なので、ビューグラフに $\vert\mathcal E\vert$ 本のエッジ、未知の回転が $m$ 個あれば問題は過剰決定で、3 自由度のゲージ（全体の回転）を持ちます。**弦距離（chordal）**のコストは不整合をフロベニウスノルムで測ります：

$$
\min_{R_1,\dots,R_m \in SO(3)} \sum_{(i,j)\in\mathcal E} \lVert R_j - R_{ij}R_i\rVert_F^2 .
$$

**スペクトル法による解。** 回転は直交行列なので $\lVert R\_j - R\_{ij}R\_i\rVert\_F^2 = 6 - 2\,\mathrm{tr}(R\_j^\top R\_{ij} R\_i)$ となり、コストの最小化は $\sum \mathrm{tr}(R\_j^\top R\_{ij}R\_i)$ の最大化と同じです。未知数を $3m\times3$ の行列 $Q = (R\_1; R\_2; \dots; R\_m)$ に積み、測定を対称な $3m\times3m$ 行列 $G$ に入れます。$G$ のブロック $(j, i)$ は $R\_{ij}$、ブロック $(i, j)$ は $R\_{ij}^\top$ です。すると目的関数は（係数 2 を除いて）$\mathrm{tr}(Q^\top G Q)$ になります。ここで緩和を行います。すべての回転が満たす拘束 $Q^\top Q = mI$ だけを残し、残りは忘れます。この拘束のもとで $\mathrm{tr}(Q^\top GQ)$ を最大にするものは $G$ の**上位 3 個の固有ベクトル**が張る空間です（レイリー商を 3 次元まとめて考えたもの）。最後に、固有ベクトル行列の各 $3\times3$ ブロックを SVD で最も近い回転に射影します。測定が整合していれば、$G$ は（欠けたエッジを除いて）ちょうどランク 3 の行列 $QQ^\top$ で、緩和は厳密です。Moulon ら（2013）はこの種の固有値ソルバーで大域的な回転を求めました。我々は各ブロック行をそのエッジ数で正規化します。

**IRLS によるロバスト化。** 誤った相対回転が一つあると、たとえば繰り返しのあるファサードから、90° ずれることがあります。スペクトル法は最小二乗法なので、その誤差を全員に分散させてしまいます。BA と同様に反復します。解いて、各エッジの残差角を測り、残差の大きいエッジの重みを下げ（スケール 5° の Cauchy 重み）、もう一度解きます。Chatterjee と Govindu（2013）は大規模問題でこのやり方（$L\_1$ 解から始めて IRLS）を広めました。理論の文献としては Hartley ら（2013）が標準です。

ビューグラフをシミュレートします。この記事の例のまわりの円上に 40 台のカメラを置き、それぞれを 45° 以内の隣とつなぎ（200 本のエッジ）、相対回転に 1.5° のノイズを加え、その 8% を誤った回転に置き換えます（実際のパイプラインでは第 04 回の基本行列の分解から得られます。シミュレートするのは実行を短くするためです）。

```python
def rot_angle(R):
    return np.degrees(np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1)))

rng_g = np.random.default_rng(21)
mg = 40                                                      # 40 cameras on a full circle
cams_g = [look_at(5.0 * np.array([np.sin(a), -0.4, -np.cos(a)]), (0, -0.5, 0))
          for a in np.linspace(0, 2 * np.pi, mg, endpoint=False)]
edges, R_rel = [], []
for i in range(mg):
    for j in range(i + 1, mg):
        if min(j - i, mg - (j - i)) <= 5:                  # neighbours up to 45 deg apart
            Rij = cams_g[j][0] @ cams_g[i][0].T              # R_ij = R_j R_i^T maps frame i to frame j
            if rng_g.random() < 0.08:                        # 8% of the pairs are simply wrong
                Rij = rodrigues(rng_g.normal(0, 1, 3)) @ Rij
            else:
                Rij = rodrigues(rng_g.normal(0, np.deg2rad(1.5), 3)) @ Rij
            edges.append((i, j)); R_rel.append(Rij)
print("%d cameras, %d relative rotations" % (mg, len(edges)))
```

```text
40 cameras, 200 relative rotations
```

```python
def project_so3(M):
    U, _, Vt = np.linalg.svd(M)
    return U @ np.diag([1, 1, np.sign(np.linalg.det(U @ Vt))]) @ Vt

def rotation_averaging(m, edges, R_rel, iters=0, scale_deg=5.0):
    """Spectral relaxation of the chordal cost, then optional IRLS with Cauchy weights."""
    w = np.ones(len(edges))
    for it in range(iters + 1):
        G = np.zeros((3 * m, 3 * m)); deg = np.zeros(m)
        for (i, j), Rij, wk in zip(edges, R_rel, w):
            G[3 * j:3 * j + 3, 3 * i:3 * i + 3] = wk * Rij       # block (j, i) should be R_j R_i^T
            G[3 * i:3 * i + 3, 3 * j:3 * j + 3] = wk * Rij.T
            deg[[i, j]] += wk
        G = G / np.repeat(deg, 3)[:, None]                    # normalize each block row by its degree
        vals, vecs = np.linalg.eig(G)
        V = vecs[:, np.argsort(-vals.real)[:3]].real         # top 3 eigenvectors ~ [R_1; ...; R_m] O
        if np.sum([np.linalg.det(V[3 * k:3 * k + 3]) for k in range(m)]) < 0:
            V[:, 0] *= -1                                    # remove a global reflection
        Rs = [project_so3(V[3 * k:3 * k + 3]) for k in range(m)]
        res = np.array([rot_angle(Rs[j] @ Rs[i].T @ Rij.T) for (i, j), Rij in zip(edges, R_rel)])
        w = 1.0 / (1.0 + (res / scale_deg) ** 2)             # Cauchy IRLS weights for the next round
    return Rs, res

def chain_rotations(m, edges, R_rel):
    """Naive alternative: walk a spanning tree from camera 0 and compose relative rotations."""
    Rs = {0: np.eye(3)}
    while len(Rs) < m:
        for (i, j), Rij in zip(edges, R_rel):
            if i in Rs and j not in Rs:
                Rs[j] = Rij @ Rs[i]
            elif j in Rs and i not in Rs:
                Rs[i] = Rij.T @ Rs[j]
    return [Rs[k] for k in range(m)]

def rotation_errors(Rs):
    """Per-camera errors (deg) after removing the global rotation gauge."""
    O = project_so3(sum(Ri.T @ Rt for Ri, Rt in zip(Rs, (c[0] for c in cams_g))))
    return np.array([rot_angle(Ri @ O @ Rt.T) for Ri, (Rt, _) in zip(Rs, cams_g)])

for name, Rs in (("spanning tree", chain_rotations(mg, edges, R_rel)),
                 ("spectral L2", rotation_averaging(mg, edges, R_rel)[0]),
                 ("spectral + IRLS", rotation_averaging(mg, edges, R_rel, iters=10)[0])):
    e = rotation_errors(Rs)
    print("%-16s median %.2f deg, max %.2f deg" % (name, np.median(e), e.max()))
```

```text
spanning tree    median 5.13 deg, max 57.41 deg
spectral L2      median 4.48 deg, max 10.05 deg
spectral + IRLS  median 0.90 deg, max 1.78 deg
```

全域木に沿って回転を連結する方法（インクリメンタルな方法が暗に行っていること）の良し悪しは、たまたま使ったエッジ次第です。木の中に誤ったエッジが一つあると、その先のすべてが 57° ずれます。スペクトル $L\_2$ 解はすべてのエッジを使うので壊滅的に誤るカメラはありませんが、15 本の誤ったエッジが 4.5° の誤差を全体に広げます。10 回の重み付け直しでそれらが孤立し、誤差の中央値は 0.9° に下がります。カメラあたり 10 個の測定を平均すると、1.5° の個々の測定のどれよりも正確な結果が得られるのです。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-rotation-averaging.svg" localized="true" caption="40 台のカメラと 200 個の相対回転（うち 15 個が誤り）での回転平均。左：全体回転のゲージを取り除いた後のカメラごとの回転誤差（対数目盛）。全域木：中央値 5.1°、最大 57°。スペクトル $L\_2$：中央値 4.5°、最大 10°。スペクトル法と IRLS：中央値 0.90°、最大 1.8°。右：IRLS 後の各エッジの残差。正しい対（紫）は 5.4° 未満、誤った対（赤）は 32.6° 超なので、Cauchy 重み（破線、右軸）がきれいに分離します。" %}

### 5.3 並進平均

すべての $R\_i$ がわかれば、各画像対は一方のカメラ中心から他方への方向を与えます。$\mathbf X^{(j)} = R\_{ij}\mathbf X^{(i)} + \mathbf t\_{ij}$ と $\mathbf t\_k = -R\_k\mathbf C\_k$ から $\mathbf t\_{ij} = -R\_j(\mathbf C\_j - \mathbf C\_i)$ となるので、測定された単位ベクトル $\hat{\mathbf t}\_{ij}$ はワールド座標系での方向を決めます：

$$
\mathbf d_{ij} = -R_j^\top\hat{\mathbf t}_{ij}, \qquad \mathbf C_j - \mathbf C_i = \lambda_{ij}\,\mathbf d_{ij}, \quad \lambda_{ij} > 0 \text{ unknown}.
$$

最も簡単なソルバーは $\mathbf d\_{ij}\times(\mathbf C\_j - \mathbf C\_i) = \mathbf 0$ と書きます。これはカメラ中心について線形で、（$\mathbf C\_1 = \mathbf 0$ と固定してから）同次系を SVD で解きます。並進平均をグローバル SfM の難所にしている問題が二つあります。**長さ**：外積の形は各エッジを未知の長さで重み付けするので、長い基線が支配的になります。LUD（Özyeşil と Singer 2015）などの手法は $\lambda\_{ij} \ge 1$ の拘束付きで $\min\sum\lVert\mathbf C\_j - \mathbf C\_i - \lambda\_{ij}\mathbf d\_{ij}\rVert$ を解き、BATA（Zhuang ら 2018）は基線長に鈍感な双線形・角度ベースのコストを使います。**退化**：カメラが一直線に並ぶ（車が通りを走る）と、方向だけでは位置が決まりません。すべての方向が平行なので、どんな間隔でも当てはまるからです。平行剛性（parallel rigidity）の理論が、問題が適切に定まる条件を特徴付けます。誤った方向もよくあり、1DSfM（Wilson と Snavely 2014）は問題をまず多数の 1 次元の直線に射影してそれらを取り除きます。

### 5.4 全体位置推定：GLOMAP

GLOMAP（Pan、Baráth、Pollefeys、Schönberger、ECCV 2024）は画像対の方向そのものを使いません。回転平均の後には、各観測についてワールドの向きでの視線 $\mathbf v\_{ij} = R\_i^\top\mathbf f\_{ij}$ がわかっています（$\mathbf f\_{ij}$ は画素の方位ベクトル）。そこでカメラ中心 $\mathbf C\_i$ と点 $\mathbf X\_j$ を**一緒に**推定し、各光線がそのカメラからその点を向くように求めます：

$$
\min_{\{\mathbf C_i\}, \{\mathbf X_j\}, \{d_{ij}\}} \sum_{(i,j)\in\mathcal O} \rho\Big(\big\lVert \mathbf v_{ij} - d_{ij}\,(\mathbf X_j - \mathbf C_i) \big\rVert\Big), \qquad d_{ij} \ge 0 .
$$

スカラー $d\_{ij}$ が未知の距離を吸収し（最終的には逆深度に近くなります）、拘束 $d\_{ij} \ge 0$ が正の深度を保証し、残差は有界です。最良の $d\_{ij}$ に対して残差は $\mathbf v\_{ij}$ と $\mathbf C\_i$ から $\mathbf X\_j$ への方向とのなす角の正弦（点がカメラの後ろにあるときは 1）に等しいので、誤った観測のコストはせいぜい定数です。並進平均と比べると、拘束は画像対ではなく多数の画像にわたるトラックから来るので数がはるかに多く、基線長の問題は消え、点が広がっていればカメラの直線運動も退化しなくなります。目的関数は射影的ではなく双線形で、GLOMAP の論文は**ランダムな**初期値から収束すると報告しています。この主張を、40 台のカメラの円で、第 5.2 節で平均した回転と、この記事の例の 120 点の 0.5 px ノイズ付き画素を使って、SciPy の上下限付き最小二乗で確かめます：

```python
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix

Rs_avg, res = rotation_averaging(mg, edges, R_rel, iters=10)
Og = project_so3(sum(Ri.T @ Rt for Ri, (Rt, _) in zip(Rs_avg, cams_g)))
Rs_avg = [Ri @ Og for Ri in Rs_avg]                           # express in the true frame, for plotting
obs_g = []
for i, (R, t) in enumerate(cams_g):
    uv, depth = project(K, R, t, X_true)
    for j in np.flatnonzero(depth > 0):
        f = bearings(K, (uv[j] + rng_g.normal(0, 0.5, 2))[None])[0]
        obs_g.append((i, j, Rs_avg[i].T @ f))                # the ray in world orientation
gi = np.array([o[0] for o in obs_g]); gj = np.array([o[1] for o in obs_g])
v = np.array([o[2] for o in obs_g]); Lg = len(obs_g)

def positioning_residuals(z):
    Cg, Xg, dg = z[:3 * mg].reshape(-1, 3), z[3 * mg:3 * (mg + n)].reshape(-1, 3), z[3 * (mg + n):]
    return (v - dg[:, None] * (Xg[gj] - Cg[gi])).ravel()     # v_ij - d_ij (X_j - c_i)

sparsity = lil_matrix((3 * Lg, 3 * (mg + n) + Lg), dtype=int)
for k in range(Lg):
    for a in range(3):
        sparsity[3 * k + a, 3 * gi[k] + a] = 1
        sparsity[3 * k + a, 3 * mg + 3 * gj[k] + a] = 1
        sparsity[3 * k + a, 3 * (mg + n) + k] = 1
z0 = np.r_[np.random.default_rng(0).uniform(-1, 1, 3 * (mg + n)), np.ones(Lg)]   # random start
lo = np.r_[np.full(3 * (mg + n), -np.inf), np.zeros(Lg)]     # d_ij >= 0
sol = least_squares(positioning_residuals, z0, jac_sparsity=sparsity, bounds=(lo, np.inf),
                    loss="soft_l1", f_scale=0.1, x_scale="jac")
Cg = sol.x[:3 * mg].reshape(-1, 3); Xg = sol.x[3 * mg:3 * (mg + n)].reshape(-1, 3)
Ctrue_g = np.array([-R.T @ t for R, t in cams_g])
s, Ra, ta = umeyama(np.vstack([Cg, Xg]), np.vstack([Ctrue_g, X_true]))
err_c = np.linalg.norm(Cg @ (s * Ra).T + ta - Ctrue_g, axis=1)
err_x = np.linalg.norm(Xg @ (s * Ra).T + ta - X_true, axis=1)
print("%d observations, %d function evaluations; after a similarity alignment: centre error "
      "median %.3f, max %.3f; point error median %.3f" % (Lg, sol.nfev, np.median(err_c), err_c.max(), np.median(err_x)))
```

```text
4800 observations, 51 function evaluations; after a similarity alignment: centre error median 0.063, max 0.140; point error median 0.006
```

$2\times2\times2$ の立方体から一様に引いた位置から出発して、51 回の関数評価でカメラの円が中央値 6.3 cm、点が 6 mm の精度で復元されます。残るカメラ誤差の大部分は 0.9° の回転誤差によるもので（5 m 先で $0.9° \approx 8$ cm）、回転も精密化する最後の大域 BA がそれを取り除きます。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/05-global-positioning.svg" caption="ランダムな初期値からの全体位置推定：ソルバーの関数評価 $n\_{\mathrm{eval}}$ 回後のカメラ中心（三角形、円上の番号で色分け）と点（灰）の上面図（$x$ 対 $z$）。各パネルは独自の縮尺です（スケールはゲージの自由度）。タイトルの $\tilde e$ は、真値に相似変換で合わせた後のカメラ中心誤差の中央値で、円の半径は 5 m です。最初（ランダム、$\tilde e=5.07$）と 3、8、15 回の評価後はカメラはまだばらばらですが、色が並び始めます。25 回後には輪ができあがり（$\tilde e=1.27$）、収束時（51 回）には円とその順序が復元されて $\tilde e=0.06$ になります。" %}

GLOMAP は、COLMAP のインクリメンタルなマッパーと同等以上の精度で、桁違いに高速だと報告しています。COLMAP 4.0 以降、`global_mapper` コマンドとして COLMAP の一部になっています（2026 年 11 月時点）。COLMAP のドキュメントは、良い焦点距離の事前情報に依存すること、アウトライアに対してインクリメンタルなマッパーより頑健でない場合があることを注意しています。

### 5.5 どちらを使うか

| | インクリメンタル（COLMAP） | グローバル（GLOMAP、OpenMVG、Theia） |
| --- | --- | --- |
| 順序 | 1 枚ずつ | 全画像を一度に |
| BA | 画像ごと（局所）と定期的（大域） | 最後に 1 回（＋いくつかの精密化） |
| ロバスト性 | 高い：各ステップが検証され、悪い画像は単に登録されない | ロバストな平均化次第；誤った画像対が全体を壊しうる |
| ドリフト | 鎖に沿って蓄積し、BA で補正 | 誤差はグラフ全体に均等に分散 |
| 速度 | 画像が多いと遅い（BA の繰り返し） | はるかに速い |
| 向いている用途 | 難しい、順序のないインターネット写真；NeRF/3DGS データセットの基準 | 大規模でよくつながった撮影（動画、ドローン、スキャン） |

いまやフィードフォワードのネットワークがカメラを得る第三の道です。VGGSfM（CVPR 2024）は学習したトラックと微分可能な BA を中心に微分可能な SfM パイプラインを構築し、VGGT（CVPR 2025）は多数の画像に対してカメラ、深度、点マップを 1 回の順伝播で予測します。2026 年 11 月時点で、これらは高速で頑健な初期化手段であり、VGGT 自身のコードも後段の BA による精密化をオプションとして提供しています。精度についての最終的な決め手は、依然としてこの記事の幾何です。これらのモデルは[第 09 回]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})で扱います。

## 6. スケールの不定性

### 6.1 画像はメートルを知らない

第 3.7 節のゲージにはスケールが含まれます。画像だけから作った再構成は建物とその模型を区別できません。すべての点とすべての並進を拡大縮小しても画素は一つも変わらないからです：

```python
for s_ in (0.1, 1.0, 37.0):
    cams_s = [(R, s_ * t) for R, t in cams_ba]              # scale every translation ...
    print("scale %5.1f: rms %.6f px" % (s_, np.sqrt(ba_cost(cams_s, s_ * X_ba, obs_all) / L)))  # ... and every point

def drift_scale(poses):
    """Ratio of estimated to true distance between consecutive cameras (initial baseline = 1)."""
    est = np.array([-poses[i][0].T @ poses[i][1] for i in range(len(cams_c))])
    tru = np.array([-R.T @ t for R, t in cams_c])
    s = np.linalg.norm(tru[4] - tru[0]) / np.linalg.norm(est[4] - est[0])
    return s * np.linalg.norm(np.diff(est, axis=0), axis=1) / np.linalg.norm(np.diff(tru, axis=0), axis=1)

for use_ba in (False, True):
    ratio = drift_scale(runs[use_ba][0])
    print("BA %-5s: local scale at steps 1, 15, 28: %s" % (use_ba, ratio[[0, 14, 27]].round(3)))
```

```text
scale   0.1: rms 0.628297 px
scale   1.0: rms 0.628297 px
scale  37.0: rms 0.628297 px
BA False: local scale at steps 1, 15, 28: [1.009 1.028 1.094]
BA True : local scale at steps 1, 15, 28: [0.999 1.    1.   ]
```

10 分の 1 のシーンでも 37 倍のシーンでも、RMS は 6 桁まで同じです。そのため COLMAP のモデルの単位は任意で、NeRF や 3DGS のコードは学習前にカメラ中心の広がりでシーンを正規化します。

### 6.2 スケールドリフト

一つの大域最適化ではスケールは 1 個の数です。逐次的な処理では、スケールは毎ステップ推定し直されます。新しく三角測量された点や新しく登録されたカメラは、それを計算するのに使った点のスケールを少しの誤差とともに引き継ぎます。その誤差はランダムウォークします。コードの後半は廊下の再構成で**局所スケール**、つまり隣り合うカメラ間の推定距離と真の距離の比を測っています。BA なしでは廊下の終点で 1.09 に達し（インクリメンタルの図のとおり、1 ステップでは 1.19 にもなります）、地図の遠い端が 9% 大きくなります。画像ごとに BA を行うと 1.00 のままです。単眼のビジュアルオドメトリや SLAM も同じ**スケールドリフト（scale drift）**に悩まされ、まさにそのために[第 06 回]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})のループ閉じ込みは剛体運動ではなく相似変換（$\mathrm{Sim}(3)$）の上で最適化されます。

### 6.3 メートル単位のスケールを得る

スケールは画像の外か、事前知識から持ってくるしかありません：

- **既知の距離**：シーン内のスケールバー、キャリブレーションボードやマーカー、大きさのわかっている物体。距離が一つあればモデル全体のスケールが決まります。
- **ステレオリグ**：[第 02 回]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})の第 7 節でキャリブレーションした基線は、すべてのフレームで既知の距離です。
- **IMU**：加速度計はメートル単位の加速度を測るので、視覚慣性オドメトリではスケールが可観測になります（[第 06 回]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})）。
- **GNSS などの位置の事前情報**はモデルを地理座標系に合わせ、7 個のゲージパラメータをすべて固定します。
- **深度センサーとメートル深度ネットワーク**（[第 07 回]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})）は一部の画素にメートル単位の深度を与え、そこからスケールが決まります。

## 7. 実践チェックリスト

SfM の結果がおかしく見えるときは、次の順で確認します：

1. **登録された画像。** ほぼすべての画像が一つのモデルに入っていますか。小さなモデルがいくつもできるのはシーングラフがつながっていないからです。すき間を埋める画像を足すか、マッチングを改善しましょう。
2. **平均再投影誤差。** 内部パラメータが正しい良い画像なら約 1 px 未満です。それより大きいときは、内部パラメータや歪みモデルの誤り（第 02 回）やローリングシャッター（第 01 回）がよくある原因です。
3. **トラック長と三角測量角。** 2 枚の画像からごく小さい角度でしか見えない点が多いなら、幾何が弱い状態です。視差を大きく取って撮影しましょう。
4. **カメラを見る。** カメラ中心と視線方向を描きます（第 01 回第 4.5 節のデバッグチェックリスト）。シーンの一部が重複したり鏡像になったりしていれば、対称な構造による誤登録が疑われます。
5. **スケールとゲージ。** モデルには任意の相似変換が含まれることを忘れずに。形の比較は生の座標ではなく、梅山の位置合わせの後で行います。
6. **内部パラメータ。** 画像ごとに焦点距離と歪みを BA で精密化させるなら、それを拘束する十分な視点があることを確認しましょう。同じカメラの画像は内部パラメータを共有させます。

## 試してみよう

- 第 3.6 節のバンドル調整ウィジェット：LM が収束する様子を見て、アウトライアで壊し、ロバストカーネルで直してみましょう。
- ホームページの [Gaussian World デモ]({{ '/' | relative_url }}#lab)は、この記事で推定するのと同じ種類のカメラ姿勢から 3D ガウシアンを描画しています。
- 物体のまわりを歩きながら撮った 30〜50 枚の写真で COLMAP を実行してみましょう。`colmap mapper` と `colmap global_mapper`（COLMAP 4.0 以降）を比べ、ログで登録の順序と再投影誤差を見てください。

## 代表的な論文

| 論文 | 会議/論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Random sample consensus (Fischler, Bolles) | Communications of the ACM | 1981 | [DOI](https://doi.org/10.1145/358669.358692) | まさにこの問題、ランドマークからのカメラ姿勢のために導入された RANSAC |
| Review and analysis of solutions of the three point perspective pose estimation problem (Haralick, Lee, Ottenberg, Nölle) | IJCV | 1994 | [DOI](https://doi.org/10.1007/BF02028352) | Grunert の P3P とその後継、および数値解析 |
| Bundle adjustment — a modern synthesis (Triggs, McLauchlan, Hartley, Fitzgibbon) | Vision Algorithms: Theory and Practice (LNCS 1883) | 2000 | [DOI](https://doi.org/10.1007/3-540-44480-7_21) | BA の決定版：コスト関数、疎性、ゲージ、ロバスト性 |
| Complete solution classification for the perspective-three-point problem (Gao, Hou, Tang, Cheng) | TPAMI | 2003 | [DOI](https://doi.org/10.1109/TPAMI.2003.1217599) | P3P の解が 1、2、3、4 個になる条件 |
| Photo tourism: exploring photo collections in 3D (Snavely, Seitz, Szeliski) | SIGGRAPH (ACM TOG) | 2006 | [DOI](https://doi.org/10.1145/1141911.1141964) | インターネット写真でのインクリメンタル SfM |
| EPnP: an accurate O(n) solution to the PnP problem (Lepetit, Moreno-Noguer, Fua) | IJCV | 2009 | [DOI](https://doi.org/10.1007/s11263-008-0152-6) | 制御点で PnP を点数に対して線形にする |
| SBA: a software package for generic sparse bundle adjustment (Lourakis, Argyros) | ACM TOMS | 2009 | [DOI](https://doi.org/10.1145/1486525.1486527) | Schur 補行列を使う疎な LM のライブラリ |
| Building Rome in a day (Agarwal, Snavely, Simon, Seitz, Szeliski) | ICCV | 2009 | [DOI](https://doi.org/10.1109/ICCV.2009.5459148) | クラスタでの都市規模の SfM |
| Bundle adjustment in the large (Agarwal, Snavely, Seitz, Szeliski) | ECCV | 2010 | [DOI](https://doi.org/10.1007/978-3-642-15552-9_3) | 非厳密 Newton と反復 Schur ソルバー；BAL ベンチマーク |
| A novel parametrization of the perspective-three-point problem (Kneip, Scaramuzza, Siegwart) | CVPR | 2011 | [DOI](https://doi.org/10.1109/CVPR.2011.5995464) | 姿勢を直接求める P3P ソルバー |
| Multicore bundle adjustment (Wu, Agarwal, Curless, Seitz) | CVPR | 2011 | [DOI](https://doi.org/10.1109/CVPR.2011.5995552) | マルチコア CPU と GPU での BA |
| Rotation averaging (Hartley, Trumpf, Dai, Li) | IJCV | 2013 | [DOI](https://doi.org/10.1007/s11263-012-0601-0) | 単一および多数の回転平均の理論 |
| Efficient and robust large-scale rotation averaging (Chatterjee, Govindu) | ICCV | 2013 | [CVF](https://openaccess.thecvf.com/content_iccv_2013/html/Chatterjee_Efficient_and_Robust_2013_ICCV_paper.html) | $L\_1$ の後に IRLS、誤った対に頑健 |
| Global fusion of relative motions for robust, accurate and scalable structure from motion (Moulon, Monasse, Marlet) | ICCV | 2013 | [CVF](https://openaccess.thecvf.com/content_iccv_2013/html/Moulon_Global_Fusion_of_2013_ICCV_paper.html) | スペクトル法で回転を求めるグローバル SfM（OpenMVG） |
| Towards linear-time incremental structure from motion (Wu) | 3DV | 2013 | [DOI](https://doi.org/10.1109/3DV.2013.25) | インクリメンタル SfM を O(n) に近づける（VisualSFM） |
| Robust global translations with 1DSfM (Wilson, Snavely) | ECCV | 2014 | [プロジェクト](https://research.cs.cornell.edu/1dsfm) | 誤った並進方向の除去 |
| Robust camera location estimation by convex programming (Özyeşil, Singer) | CVPR | 2015 | [CVF](https://openaccess.thecvf.com/content_cvpr_2015/html/Ozyesil_Robust_Camera_Location_2015_CVPR_paper.html) | LUD：ロバストな凸並進平均、平行剛性 |
| Structure-from-Motion revisited (Schönberger, Frahm) | CVPR | 2016 | [CVF](https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html) | COLMAP のインクリメンタルパイプライン |
| Baseline desensitizing in translation averaging (Zhuang, Cheong, Lee) | CVPR | 2018 | [arXiv](https://arxiv.org/abs/1901.00643) | BATA：双線形・角度ベースのコスト |
| Lambda Twist: an accurate fast robust perspective three point (P3P) solver (Persson, Nordberg) | ECCV | 2018 | [ECVA](https://www.ecva.net/papers/eccv_2018/papers_ECCV/html/Mikael_Persson_Lambda_Twist_An_ECCV_2018_paper.php) | 4 次方程式を使わない高速で安定な P3P |
| Pixel-perfect structure-from-motion with featuremetric refinement (Lindenberger et al.) | ICCV | 2021 | [arXiv](https://arxiv.org/abs/2108.08291) | 密な学習特徴でキーポイントと BA を精密化 |
| VGGSfM: visual geometry grounded deep structure from motion (Wang, Karaev, Rupprecht, Novotny) | CVPR | 2024 | [CVF](https://openaccess.thecvf.com/content/CVPR2024/html/Wang_VGGSfM_Visual_Geometry_Grounded_Deep_Structure_From_Motion_CVPR_2024_paper.html) | 微分可能な BA を備えた完全に微分可能な SfM |
| Global structure-from-motion revisited (Pan, Baráth, Pollefeys, Schönberger) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2407.20219) | GLOMAP：カメラと点の同時全体位置推定 |
| VGGT: visual geometry grounded transformer (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2503.11651) | フィードフォワードでカメラ・深度・点を予測；後段の BA はオプション |

## 学習リソース

- R. Hartley、A. Zisserman、*Multiple View Geometry in Computer Vision*、第 2 版、2004：第 7 章（カメラ行列の推定）、第 18 章（N 視点の計算法、バンドル調整を含む）、付録 A6（反復推定、疎な Levenberg-Marquardt）。
- R. Szeliski、*Computer Vision: Algorithms and Applications*、第 2 版、2022、第 11 章（Structure from motion と SLAM）：バンドル調整、疎性の利用、グローバル SfM の節。[szeliski.org/Book](https://szeliski.org/Book/) で無料で読めます。
- B. Triggs ら、"Bundle adjustment — a modern synthesis"（上表）：長いですが、ゲージの自由度とロバストなコストについては一本で読める最良の文献です。[HAL](https://hal.archives-ouvertes.fr/inria-00548290v1) に無料の版があります。
- [Ceres Solver](http://ceres-solver.org/)：バンドル調整のチュートリアルと BAL の問題。[BAL データセット](https://grail.cs.washington.edu/projects/bal/)。
- [COLMAP のドキュメント](https://colmap.github.io/)（チュートリアル、インクリメンタルとグローバルのマッパー）と [GLOMAP](https://github.com/colmap/glomap)。
- OpenCV：[Perspective-n-Point による姿勢計算](https://docs.opencv.org/4.x/d5/d1f/calib3d_solvePnP.html)（solvePnP の各手法、RANSAC、精密化）。

## 演習

1. **P3P の解の個数。** P3P の例のカメラを直線に沿って動かし、各位置で 4 次方程式の正の実根を数えましょう。個数はどこで変わりますか。（Gao ら 2003 が完全な分類を与えています。）

   <details markdown="1"><summary>ヒント</summary>

   `look_at` で作ったカメラに対して `p3p` と `project(K, R, t, X_true[sel])` を再利用します。解の個数は二つの実根が合体するとき（4 次多項式がゼロに接するとき）に変わります。これはカメラが 3 点を通る「危険円柱」を横切るときに起こり、そこでは問題の条件も悪くなります。
   </details>

2. **手で Schur。** カメラ 1 台と点 2 個について $H$ を $12\times12$ のブロック行列として書き、Schur 補行列のステップが全体系に対する `np.linalg.solve(H, -g)` と等しいことを数値的に確かめましょう。

   <details markdown="1"><summary>ヒント</summary>

   `full_jacobian` で $J$ を作り、$H = J^\top J + \lambda\,\mathrm{diag}(J^\top J)$、$\mathbf g = J^\top\mathbf r$ とします。`ba_step` が返すステップ（`fixed=()`）と比べます。カメラ 1 台でもゲージがあるので、$\lambda > 0$ にしておきます。
   </details>

3. **共分散の中のゲージ。** カメラ中心の共分散を $\sigma^2(J^\top J)^{+}$（擬似逆行列）と、カメラ 1 とスケールを固定した $\sigma^2(J\_f^\top J\_f)^{-1}$ から計算しましょう。それぞれのゲージで「不確か」なのはどのカメラですか。

   <details markdown="1"><summary>ヒント</summary>

   カメラ 1 を固定すると、ゲージが座標系の不確かさをすべて他のカメラに押し付けるので、不確かさはカメラ 1 からの距離とともに増えます。擬似逆行列はそれを均等に分配します（最小ノルムのゲージ）。カメラ間の距離の分散はどちらでも同じです。
   </details>

4. **ロバスト BA を壊す。** コード 9 のアウトライア率を 5% から 20%、40% に上げましょう。Huber はいつ失敗しますか。Cauchy はいつ失敗し、より良い初期値（小さい摂動）は役に立ちますか。

   <details markdown="1"><summary>ヒント</summary>

   Huber の影響は有界ですがゼロではないので、偏りはおおよそアウトライア率とともに増えます。Cauchy の影響はゼロに近づきますが、コストが非凸なので、アウトライアが多く初期値が悪いと誤った極小に捕まることがあります。ウィジェットで同じことを対話的に試せます。
   </details>

5. **並進平均。** 40 台のカメラの円で、回転は厳密、方向に 1° のノイズを加えて、第 5.3 節の線形手法（$\mathbf d\_{ij}\times(\mathbf C\_j - \mathbf C\_i) = \mathbf 0$）を実装しましょう。次にすべてのカメラを一直線上に置きます。何が起きますか。第 5.4 節の全体位置推定にこの問題がないのはなぜですか。

   <details markdown="1"><summary>ヒント</summary>

   $\mathbf C\_1 = \mathbf 0$ と固定し、積み重ねた $3\vert\mathcal E\vert\times3(m-1)$ の系の最小右特異ベクトルを取ります。直線上ではすべての $\mathbf d\_{ij}$ が平行で、カメラのどんな間隔もすべての拘束を満たし、零空間が大きくなります。点とカメラを結ぶ光線は直線の外にある点から来るので、間隔を決めることができます。
   </details>

**次回：**[ビジュアル SLAM]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})：同じ最適化を動くカメラの上でリアルタイムに実行します。キーフレーム、因子グラフ、ループ閉じ込み、IMU を扱います。
