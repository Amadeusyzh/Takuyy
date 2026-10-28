---
layout: post
title: "カメラと多視点幾何：ピクセルから姿勢へ"
date: 2026-10-27 12:01:00+0900
description: "ピンホールカメラ、内部パラメータと外部パラメータ、レンズ歪み、エピポーラ幾何、8点アルゴリズム、三角測量、バンドル調整、COLMAP による Structure-from-Motion、多視点ステレオを NumPy コード付きで解説します。"
categories: neural-rendering
tags: [camera-model, epipolar-geometry, structure-from-motion, colmap, bundle-adjustment, multi-view-stereo]
series: neural-rendering
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## なぜ重要なのか

グラフィックスシリーズでは、3D シーンから画像を作る流れを扱いました。幾何、マテリアル、カメラが既知で、そこからピクセルを計算したのです。ニューラルレンダリング（neural rendering）は、このパイプラインを**逆向き**に実行します。与えられるのは写真で、求めたいのは、同じカメラからレンダリングしたときにそれらの写真を再現する 3D 表現です。NeRF と 3D Gaussian Splatting（3DGS）はどちらも、すべての学習画像に正確なカメラが付随していることを前提としています。つまり内部パラメータ（intrinsics：焦点距離、主点、歪み）と、共通のワールド座標系における姿勢（pose）です。これらのカメラはほぼ必ず **Structure-from-Motion（SfM）**、典型的には COLMAP から得られ、3DGS に至っては SfM の疎な点群を初期値として使います。

したがって、放射輝度場（radiance field）を最適化する前に、カメラが 3D を 2D にどのように写すのか、2 枚のビューが互いにどう拘束し合うのか、そして数百枚のビューをどのように同時に解くのかを理解しておく必要があります。本記事は、シリーズの残りで使う多視点幾何のツールキットです。

## 前提知識

- 線形代数：回転、同次座標（homogeneous coordinates）、SVD、最小二乗法。
- グラフィックスシリーズで扱ったカメラ行列と射影行列（ラスタライズにおけるビュー変換と射影変換）。
- NumPy。バンドル調整のコード例では SciPy も使います。

## 1. ピンホールカメラ

### 1.1 投影

理想的なピンホールカメラ（pinhole camera）は、中心投影（central projection）によって 3D 点を画像平面に写します。ワールド座標の点を同次座標で $\tilde{\mathbf X} = (X, Y, Z, 1)^\top$ と書きます。カメラはまず剛体変換（**外部パラメータ（extrinsics）**）でこれを自身の座標系に移し、次に**内部パラメータ**で投影してピクセルに変換します。

$$
\lambda \begin{pmatrix} u \\ v \\ 1 \end{pmatrix}
= \underbrace{\begin{pmatrix} f_x & s & c_x \\ 0 & f_y & c_y \\ 0 & 0 & 1 \end{pmatrix}}_{K}
\underbrace{\begin{pmatrix} R & \mathbf t \end{pmatrix}}_{3\times 4}
\begin{pmatrix} X \\ Y \\ Z \\ 1 \end{pmatrix},
\qquad P = K\,[R \mid \mathbf t].
$$

ここで $\lambda$ はカメラ座標系における点の深度なので、$u = f_x\, X_c/Z_c + c_x$、$v = f_y\, Y_c/Z_c + c_y$ となります（スキュー $s = 0$ とします。これは現代のほぼすべてのセンサーで成り立ちます）。$3\times 4$ 行列 $P$ は**射影行列（projection matrix）**で、自由度は 11（12 個の要素からスケールを除いたもの）です。内訳は内部パラメータが 5、外部パラメータが 6 です。

- $f_x, f_y$ はピクセル単位の焦点距離です。物理的な焦点距離 $F$ に対して $f_x = F / \text{pixel width}$ となります。水平画角（field of view）を $\theta_x$、画像幅を $W$ とすると、$f_x = \frac{W}{2\tan(\theta_x/2)}$ です。
- $(c_x, c_y)$ は**主点（principal point）**で、光軸が画像を貫く位置です。通常は画像中心に近い値になります。

### 1.2 外部パラメータ、カメラ中心、座標系の規約

$[R \mid \mathbf t]$ は**ワールドからカメラへ**の写像です：$\mathbf X_c = R\mathbf X_w + \mathbf t$。カメラ中心は原点に写される点であり、$\mathbf C = -R^\top \mathbf t$ です。多くのニューラルレンダリングのコードベースでは、代わりにその逆行列、すなわち**カメラからワールドへ（camera-to-world）**の行列

$$
T_{c2w} = \begin{pmatrix} R^\top & \mathbf C \\ \mathbf 0^\top & 1 \end{pmatrix},
$$

を保存します。その各列は、ワールド座標で表したカメラの右/下/前方向の軸とカメラの位置です。広く使われている軸の規約は 2 つあり、これらを混同することはこの分野で最もよくあるバグです。

| 規約 | $x$ | $y$ | カメラの視線方向 | 使用例 |
| --- | --- | --- | --- | --- |
| OpenCV / COLMAP | 右 | 下 | $+z$ | COLMAP、OpenCV、3DGS（内部） |
| OpenGL / Blender | 右 | 上 | $-z$ | オリジナル NeRF の `transforms.json`、Blender、nerfstudio |

両者の変換は、$T_{c2w}$ の右から $\mathrm{diag}(1, -1, -1, 1)$ を掛けるだけです（カメラの $y$ 軸と $z$ 軸を反転）。COLMAP 自体は、画像ごとにワールドからカメラへのクォータニオン `QW QX QY QZ` と並進 `TX TY TZ` を保存しています。

### 1.3 レンズ歪み

実際のレンズは直線を曲げてしまいます。標準的な Brown–Conrady モデル（OpenCV や COLMAP の `OPENCV` カメラで使われています）は、内部パラメータを適用する前の正規化画像座標 $x = X_c/Z_c$、$y = Y_c/Z_c$ に作用します。$r^2 = x^2 + y^2$ として、

$$
\begin{aligned}
x_d &= x\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + 2p_1 xy + p_2 (r^2 + 2x^2),\\
y_d &= y\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + p_1 (r^2 + 2y^2) + 2p_2 xy,
\end{aligned}
$$

その後 $u = f_x x_d + c_x$、$v = f_y y_d + c_y$ とします。$k_i$ の項は**放射方向（radial）**の歪み（$k_1<0$ で樽型、$k_1>0$ で糸巻き型）で、$p_1, p_2$ はレンズがセンサーと完全に平行でないことによる**接線方向（tangential）**の歪みです。魚眼レンズには別のモデルが必要です（COLMAP の `OPENCV_FISHEYE`。多項式補正付きの等距離射影です）。

オリジナルの 3DGS ラスタライザは歪みのないピンホールカメラしかサポートしていません。そのため前処理スクリプトでは COLMAP の `image_undistorter` を実行し、`PINHOLE` 画像で学習します。この点はチュートリアル（第 6 回）で再び登場します。

内部パラメータと歪みは**キャリブレーション（calibration）**によって推定します。古典的な方法では、平面のチェッカーボードをさまざまな向きからカメラに見せ、$K$ と歪み係数を閉形式で求めたあと非線形最適化で精密化します（Zhang, 2000）。これは `cv2.calibrateCamera` が実装している方法です。SfM はシーンからこれらを自己キャリブレーション（self-calibrate）することもできます。

### 1.4 コード：点の投影

次のコードは、点群を見る 2 台のカメラを構築し、（オプションで歪みを含めて）点を投影します。本記事の残りでもこれを再利用します。

```python
import numpy as np

def look_at(C, target, up=np.array([0.0, -1.0, 0.0])):
    """World-to-camera (R, t) in the OpenCV convention: x right, y down, z forward."""
    z = target - C; z /= np.linalg.norm(z)
    x = np.cross(up, z); x /= np.linalg.norm(x)
    y = np.cross(z, x)
    R = np.stack([x, y, z])          # rows are the camera axes in world coordinates
    t = -R @ C
    return R, t

def project(K, R, t, X, dist=None):
    """Project Nx3 world points to Nx2 pixels; dist = (k1, k2, p1, p2, k3) or None."""
    Xc = X @ R.T + t                 # world -> camera
    x, y = Xc[:, 0] / Xc[:, 2], Xc[:, 1] / Xc[:, 2]   # normalized image plane
    if dist is not None:
        k1, k2, p1, p2, k3 = dist
        r2 = x * x + y * y
        radial = 1 + k1 * r2 + k2 * r2**2 + k3 * r2**3
        x, y = (x * radial + 2 * p1 * x * y + p2 * (r2 + 2 * x * x),
                y * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y)
    u = K[0, 0] * x + K[0, 1] * y + K[0, 2]
    v = K[1, 1] * y + K[1, 2]
    return np.stack([u, v], axis=1), Xc[:, 2]

W, H, fov = 640, 480, np.deg2rad(60)
f = W / (2 * np.tan(fov / 2))
K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])

rng = np.random.default_rng(0)
X = rng.uniform(-1, 1, size=(200, 3))                     # points around the origin
R1, t1 = look_at(np.array([0.0, -0.5, -4.0]), np.zeros(3))
R2, t2 = look_at(np.array([2.0, -0.8, -3.5]), np.zeros(3))
x1, d1 = project(K, R1, t1, X)
x2, d2 = project(K, R2, t2, X)
print("all in front:", (d1 > 0).all() and (d2 > 0).all())
```

`look_at` が "up" $=(0,-1,0)$ を使っているのは、OpenCV の規約では画像の $y$ 軸が下向きだからです。

## 2. 2 つのビュー：エピポーラ幾何

### 2.1 エピポーラ拘束

2 台のカメラが同じ 3D 点 $\mathbf X$ を観測し、それぞれピクセル $\mathbf x_1$ と $\mathbf x_2$ に写っているとします。2 つのカメラ中心と $\mathbf X$ は 1 つの平面、すなわち**エピポーラ平面（epipolar plane）**を張ります。この平面は各画像と直線で交わり、これが**エピポーラ線（epipolar line）**です。したがって $\mathbf x_1$ が与えられれば、対応点 $\mathbf x_2$ は画像 2 上の既知の直線上にあるはずです。2 つのカメラ中心を結ぶ直線（**ベースライン（baseline）**）が画像を貫く点を**エピポール（epipole）**と呼びます。

代数的には、相対姿勢を $\mathbf X_2 = R\,\mathbf X_1 + \mathbf t$（カメラ 1 の座標からカメラ 2 の座標へ）とし、$\hat{\mathbf x}_i = K_i^{-1}\tilde{\mathbf x}_i$ を正規化（キャリブレーション済み）同次座標とします。ベクトル $\hat{\mathbf x}_2$、$\mathbf t$、$R\hat{\mathbf x}_1$ は同一平面上にあるので、そのスカラー三重積は 0 になります。

$$
\hat{\mathbf x}_2^\top\, [\mathbf t]_\times R\, \hat{\mathbf x}_1 = 0,
\qquad
E = [\mathbf t]_\times R,
\qquad
[\mathbf t]_\times = \begin{pmatrix} 0 & -t_z & t_y \\ t_z & 0 & -t_x \\ -t_y & t_x & 0 \end{pmatrix}.
$$

$E$ は**基本行列（essential matrix）**です（Longuet-Higgins, 1981）。ピクセル座標では、同じ拘束は次のように書けます。

$$
\tilde{\mathbf x}_2^\top F\, \tilde{\mathbf x}_1 = 0,
\qquad
F = K_2^{-\top} E\, K_1^{-1},
$$

ここで $F$ は**基礎行列（fundamental matrix）**です。$F\tilde{\mathbf x}_1$ は画像 2 におけるエピポーラ線、$F^\top \tilde{\mathbf x}_2$ は画像 1 における直線であり、エピポールは零空間ベクトル $F\mathbf e_1 = 0$、$F^\top \mathbf e_2 = 0$ です。

役に立つ事実：

- $F$ はランク 2 で、自由度は 7 です（9 個の要素から、スケールと $\det F = 0$ の分を引いたもの）。
- $E$ の自由度は 5 です（回転 3 + $\mathbf t$ の向き 2。並進のスケールは 2 枚の画像からは**観測できません**）。2 つの非零特異値は等しく、$\mathrm{svd}(E) = (\sigma, \sigma, 0)$ となります。

### 2.2 （正規化）8 点アルゴリズム

各対応点の組は、$F$ の 9 個の要素に関する線形方程式を 1 つ与えます。$\tilde{\mathbf x}_1 = (u_1, v_1, 1)$、$\tilde{\mathbf x}_2 = (u_2, v_2, 1)$ と書くと、

$$
\tilde{\mathbf x}_2^\top F \tilde{\mathbf x}_1 = (\tilde{\mathbf x}_2 \otimes \tilde{\mathbf x}_1)^\top \operatorname{vec}(F) = 0,
$$

なので、$N \ge 8$ 組の対応点を積み重ねると $A\,\operatorname{vec}(F) = \mathbf 0$（$A \in \mathbb R^{N\times 9}$）が得られます。$\lVert \operatorname{vec}(F)\rVert = 1$ のもとでの最小二乗解は、$A$ の最小特異値に対応する右特異ベクトルです。その後、$F$ の最小特異値を 0 にしてランク 2 を強制します。

これをピクセル座標にそのまま適用すると条件が非常に悪くなります。$A$ の要素は 1 から $10^5$ までの範囲にわたるからです。Hartley（1997）は、各画像の点を平行移動・スケーリングして重心を原点に、原点からの平均距離を $\sqrt 2$ にするだけで、線形アルゴリズムが反復法に匹敵する精度になることを示しました。正規化座標で $\hat F$ を解き、その後 $F = T_2^\top \hat F T_1$ として正規化を元に戻します。

```python
def normalize(pts):
    """Hartley normalization: centroid to origin, mean distance sqrt(2)."""
    c = pts.mean(0)
    s = np.sqrt(2) / np.linalg.norm(pts - c, axis=1).mean()
    T = np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])
    ph = np.c_[pts, np.ones(len(pts))] @ T.T
    return ph, T

def eight_point(x1, x2):
    """Fundamental matrix with x2^T F x1 = 0 from N >= 8 correspondences (Nx2 pixels)."""
    p1, T1 = normalize(x1)
    p2, T2 = normalize(x2)
    # each row is kron(p2, p1) so that A @ vec(F) = p2^T F p1
    A = np.einsum("ni,nj->nij", p2, p1).reshape(-1, 9)
    F = np.linalg.svd(A)[2][-1].reshape(3, 3)
    U, S, Vt = np.linalg.svd(F)              # enforce rank 2
    F = U @ np.diag([S[0], S[1], 0]) @ Vt
    F = T2.T @ F @ T1                        # undo the normalization
    return F / np.linalg.norm(F)

noise = rng.normal(scale=0.5, size=x1.shape)                # 0.5 px of noise
F = eight_point(x1 + noise, x2)
h1, h2 = np.c_[x1, np.ones(len(x1))], np.c_[x2, np.ones(len(x2))]
Fx1, Ftx2 = h1 @ F.T, h2 @ F
sampson = np.sum(h2 * Fx1, 1) ** 2 / (Fx1[:, 0]**2 + Fx1[:, 1]**2 + Ftx2[:, 0]**2 + Ftx2[:, 1]**2)
print("mean Sampson distance (px):", np.sqrt(sampson).mean())   # ~0.05 px
```

最後に表示される **Sampson 距離（Sampson distance）**は、対応点のエピポーラ拘束に対する幾何学的距離の一次近似であり、RANSAC の内部で使われる標準的な残差です。

実際には、対応点は特徴マッチング（SIFT、あるいは SuperPoint + LightGlue のような学習ベースのマッチャー）から得られ、多数の外れ値（outlier）を含みます。そのため $F$ や $E$ は **RANSAC** の中で推定します。ランダムに選んだ最小サンプルにモデルを当てはめ、Sampson 距離でインライア（inlier）を数え、最良のものを残すという操作を繰り返すのです。内部パラメータが既知の場合は、$E$ に対する最小の**5 点**ソルバー（Nistér, TPAMI 2004）を使います。サンプルあたりの点数が少ないほど、RANSAC の必要反復回数が指数的に減るからです。

### 2.3 $E$ からの姿勢の復元

$E = K_2^\top F K_1$ とその SVD $E = U\,\mathrm{diag}(1,1,0)\,V^\top$ から、4 つの候補姿勢が得られます。

$$
R \in \{U W V^\top,\; U W^\top V^\top\},\quad \mathbf t \in \{+\mathbf u_3, -\mathbf u_3\},\qquad
W = \begin{pmatrix} 0 & -1 & 0 \\ 1 & 0 & 0 \\ 0 & 0 & 1 \end{pmatrix},
$$

ここで $\mathbf u_3$ は $U$ の最後の列です（$U$、$V$ の符号はどちらも行列式が $+1$ になるように固定します）。三角測量した点が両方のカメラの前方に来る候補は 1 つだけなので（**チェイラリティ（cheirality）**チェック）、各候補で三角測量して数を数えます。これが `cv2.recoverPose` の処理内容です。

## 3. 三角測量

2 つ（以上）の射影行列 $P_i$ と観測 $\mathbf x_i = (u_i, v_i)$ が与えられたとき、**直接線形変換（direct linear transform, DLT）**は $\tilde{\mathbf x}_i \times P_i \tilde{\mathbf X} = \mathbf 0$ という事実を利用します。$P_i$ の第 $k$ 行を $\mathbf p_i^{k\top}$ と書くと、各ビューは独立な方程式を 2 本ずつ与えます。

$$
\begin{pmatrix}
u_1 \mathbf p_1^{3\top} - \mathbf p_1^{1\top} \\
v_1 \mathbf p_1^{3\top} - \mathbf p_1^{2\top} \\
u_2 \mathbf p_2^{3\top} - \mathbf p_2^{1\top} \\
v_2 \mathbf p_2^{3\top} - \mathbf p_2^{2\top}
\end{pmatrix} \tilde{\mathbf X} = \mathbf 0 .
$$

ここでも最小特異値に対応する右特異ベクトルを取り、非同次化します。DLT が最小化するのは代数的誤差です。統計的に最適な解は再投影誤差（reprojection error）を最小化するものであり、それはいずれにせよバンドル調整が行うことです。2 本の光線の間の**三角測量角（triangulation angle）**が小さいと、三角測量は悪条件になります。わずかなピクセル誤差で点が光線に沿って大きく動いてしまうのです。そのため COLMAP は、最小角度（デフォルトで 1.5 度）を満たす点だけを受け入れ、再投影誤差の大きい点を棄却します。

```python
def triangulate(P1, P2, x1, x2):
    """Linear (DLT) triangulation. P1, P2: 3x4 projection matrices; x1, x2: Nx2 pixels."""
    Xs = []
    for (u1, v1), (u2, v2) in zip(x1, x2):
        A = np.stack([u1 * P1[2] - P1[0], v1 * P1[2] - P1[1],
                      u2 * P2[2] - P2[0], v2 * P2[2] - P2[1]])
        Xh = np.linalg.svd(A)[2][-1]
        Xs.append(Xh[:3] / Xh[3])
    return np.array(Xs)

def pose_from_essential(E, K, x1, x2):
    """Pick the (R, t) among the four decompositions of E that puts points in front of both cameras."""
    U, _, Vt = np.linalg.svd(E)
    if np.linalg.det(U) < 0: U = -U
    if np.linalg.det(Vt) < 0: Vt = -Vt
    Wm = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]])
    P1 = K @ np.c_[np.eye(3), np.zeros(3)]
    best = None
    for R in (U @ Wm @ Vt, U @ Wm.T @ Vt):
        for t in (U[:, 2], -U[:, 2]):
            P2 = K @ np.c_[R, t]
            Xt = triangulate(P1, P2, x1, x2)
            n_front = ((Xt[:, 2] > 0) & ((Xt @ R.T + t)[:, 2] > 0)).sum()
            if best is None or n_front > best[0]:
                best = (n_front, R, t, Xt)
    return best[1:]

E = K.T @ F @ K
R, t, Xt = pose_from_essential(E, K, x1, x2)
R_true = R2 @ R1.T                       # ground-truth relative pose camera 1 -> camera 2
t_true = t2 - R_true @ t1
cos = np.clip((np.trace(R.T @ R_true) - 1) / 2, -1, 1)
print("rotation error (deg):", np.rad2deg(np.arccos(cos)))                 # ~0.16
print("translation direction cos:", t @ t_true / np.linalg.norm(t_true))   # ~0.9999
# Xt is in camera-1 coordinates with |t| = 1: compare after fixing the unknown scale
print("3D error:", np.abs(Xt * np.linalg.norm(t_true) - (X @ R1.T + t1)).mean())
```

0.5 ピクセルのノイズのもとで、相対回転は 1 度未満の誤差で復元でき、構造は**全体のスケールを除いて**復元できます。このスケールの曖昧性は本質的なものです。画像だけから得られる SfM 再構成は、相似変換（回転、並進、スケール。自由度 7）を除いてしか定まりません。これがいわゆる**ゲージ自由度（gauge freedom）**です。COLMAP のモデルの単位が任意であるのも、NeRF/3DGS のコードがシーンを正規化するのもこのためです（たとえば 3DGS はカメラ中心の広がりから「カメラ範囲（camera extent）」を計算し、学習率や高密度化（densification）のしきい値の設定に使います）。

## 4. バンドル調整

2 視点幾何は出発点を与えてくれます。**バンドル調整（bundle adjustment, BA）**は、総再投影誤差を最小化することで、すべてのカメラと点を同時に精密化します。

$$
\min_{\{K_i, R_i, \mathbf t_i\},\,\{\mathbf X_j\}}
\sum_{(i,j)\in\mathcal O} \rho\!\left( \big\lVert \pi(K_i, R_i, \mathbf t_i, \mathbf X_j) - \mathbf x_{ij} \big\rVert^2 \right),
$$

ここで $\mathcal O$ は観測の集合（点 $j$ が画像 $i$ で見えている）、$\pi$ は（歪みを含む）投影、$\rho$ は外れ値の重みを下げる Huber や Cauchy などのロバスト損失（robust loss）です。この名前は、各カメラから出る光線の「束（bundle）」を、点で交わるまで調整することに由来します。

BA は非線形最小二乗問題であり、**Gauss–Newton** 法や **Levenberg–Marquardt（LM）**法で解きます。LM は各ステップで次を解きます。

$$
(J^\top J + \mu D)\,\delta = -J^\top \mathbf r ,
$$

ここで $J$ はヤコビアン（Jacobian）、$\mathbf r$ は残差、$\mu$ はダンピング係数です。BA を数千枚の画像にスケールさせる鍵は**疎性（sparsity）**です。各残差は 1 台のカメラと 1 つの点にしか依存しません。未知数を（カメラ、点）の順に並べると、正規方程式の行列はブロック構造

$$
\begin{pmatrix} B & C \\ C^\top & P \end{pmatrix}\begin{pmatrix} \delta_c \\ \delta_p\end{pmatrix} = \begin{pmatrix} \mathbf g_c \\ \mathbf g_p \end{pmatrix},
$$

を持ちます。ここで $P$ は $3\times 3$ ブロック（点ごとに 1 つ）からなるブロック対角行列です。**シューア補行列（Schur complement）**で点を消去すると、はるかに小さな「縮約カメラ系（reduced camera system）」$(B - C P^{-1} C^\top)\,\delta_c = \mathbf g_c - C P^{-1}\mathbf g_p$ が残り、その後は各点を独立に更新できます。Ceres Solver（COLMAP が使用）などのライブラリは、これをロバスト損失や自動微分（automatic differentiation）とともに実装しています。全体像については Triggs らの "Bundle Adjustment — A Modern Synthesis"（1999）を参照してください。

SciPy による小さな BA で、先ほどの 2 視点再構成を精密化してみます（カメラは軸角 + 並進で表します）。

```python
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix

def rodrigues(r):
    """Axis-angle (3,) -> rotation matrix."""
    th = np.linalg.norm(r)
    if th < 1e-12: return np.eye(3)
    k = r / th
    Kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + np.sin(th) * Kx + (1 - np.cos(th)) * Kx @ Kx

def axis_angle(R):
    th = np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1))
    if th < 1e-12: return np.zeros(3)
    return th / (2 * np.sin(th)) * np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])

def ba_residuals(params, n_cams, n_pts, cam_idx, pt_idx, obs, K):
    cams = params[:n_cams * 6].reshape(n_cams, 6)            # [axis-angle | t] per camera
    pts = params[n_cams * 6:].reshape(n_pts, 3)
    res = np.empty((len(obs), 2))
    for c in range(n_cams):
        m = cam_idx == c
        uv, _ = project(K, rodrigues(cams[c, :3]), cams[c, 3:], pts[pt_idx[m]])
        res[m] = uv - obs[m]
    return res.ravel()

def ba_sparsity(n_cams, n_pts, cam_idx, pt_idx):
    """Each residual touches 6 camera parameters and 3 point coordinates."""
    A = lil_matrix((2 * len(cam_idx), 6 * n_cams + 3 * n_pts), dtype=int)
    i = np.arange(len(cam_idx))
    for k in range(6):
        A[2 * i, 6 * cam_idx + k] = 1; A[2 * i + 1, 6 * cam_idx + k] = 1
    for k in range(3):
        A[2 * i, 6 * n_cams + 3 * pt_idx + k] = 1; A[2 * i + 1, 6 * n_cams + 3 * pt_idx + k] = 1
    return A

obs = np.r_[x1 + noise, x2]                                   # the same noisy observations
cam_idx = np.r_[np.zeros(len(X), int), np.ones(len(X), int)]
pt_idx = np.r_[np.arange(len(X)), np.arange(len(X))]
x0 = np.r_[np.zeros(6), axis_angle(R), t, Xt.ravel()]          # camera 1 = identity
args = (2, len(X), cam_idx, pt_idx, obs, K)
print("RMS before:", np.sqrt(np.mean(ba_residuals(x0, *args) ** 2)))   # ~0.47 px
sol = least_squares(ba_residuals, x0, jac_sparsity=ba_sparsity(2, len(X), cam_idx, pt_idx),
                    x_scale="jac", method="trf", loss="linear", args=args)
print("RMS after: ", np.sqrt(np.mean(sol.fun ** 2)))                   # ~0.16 px
```

残差は約 0.47 px（DLT/8 点アルゴリズムによる解）から約 0.16 px まで下がります。実際のシステムでは、問題を良設定にするためにゲージを固定します（たとえば最初のカメラとスケールを固定します）。ここでは信頼領域（trust-region）ソルバーが平坦な方向に沿って動くだけで、害はありません。

## 5. Structure-from-Motion と COLMAP

**Structure-from-Motion** は、順序のない画像集合からカメラ姿勢（運動）と疎な点群（構造）を復元します。Photo Tourism（Snavely et al., SIGGRAPH 2006）のような初期の大規模システムは、インターネット上の写真からランドマークを再構成しました。**COLMAP**（Schönberger & Frahm, "Structure-from-Motion Revisited", CVPR 2016）は、ニューラルレンダリングのデータセットにおける事実上の標準となったオープンソースのインクリメンタル（incremental）SfM システムです。

### 5.1 インクリメンタルなパイプライン

1. **特徴抽出（feature extraction）。** すべての画像でキーポイント（keypoint）と記述子（descriptor）を検出し（COLMAP は GPU 上で SIFT を使います）、EXIF から内部パラメータを読み取るか推測します。
2. **マッチング（matching）。** 小規模な集合では総当たりマッチング、動画では逐次マッチング、大規模な集合ではボキャブラリツリー（vocabulary tree）による検索を使います。
3. **幾何検証（geometric verification）。** 画像ペアごとに RANSAC で $F$、$E$、またはホモグラフィ（homography）を推定し、インライアのマッチだけを残します。結果は**シーングラフ（scene graph）**で、画像がノード、検証済みのペアがエッジです。
4. **初期化（initialization）。** ベースラインが広く、よく接続されたペアを選び、$E$ から相対姿勢を復元して三角測量します。
5. **画像登録（image registration）。** **次善ビュー（next best view）**（すでに三角測量された点を多く見ており、かつそれらの点が画像内で良好に空間分布している未登録画像）を繰り返し選び、RANSAC の中で **PnP**（Perspective-n-Point）を用いて 2D–3D 対応からその姿勢を推定します。
6. **三角測量。** COLMAP のロバストな多視点三角測量で、新たに登録された画像が見ている新しい点を三角測量します。
7. **バンドル調整。** 登録のたびに局所 BA を、モデルが大きく成長するたびに大域 BA を実行し、その後再投影誤差の大きい観測を除去して再三角測量します。

CVPR 2016 の論文の貢献は、まさにステップ 3 と 5–7 をロバストかつ完全にすることにあります。ペアの幾何を分類する幾何検証戦略（たとえば純粋な回転や透かしのようなマッチの検出）、次善ビューのスコア、ロバストな三角測量、そして BA / 再三角測量 / フィルタリングの反復ループです。

別のアプローチとして**大域的 SfM（global SfM）**があります。画像を 1 枚ずつ追加するのではなく、まずすべての回転を、次にすべての位置を一度に推定します。GLOMAP（Pan et al., ECCV 2024）はこれを再検討し、COLMAP と同等の精度をはるかに高速に達成したと報告しています。また COLMAP のデータベースを直接読み込むので、同じワークフローにそのまま組み込めます。

### 5.2 COLMAP から得られるもの

疎なモデルは 3 つのファイル（バイナリ `.bin` またはテキスト `.txt`）からなります。

- `cameras.txt`：カメラモデルごとに 1 行。例：`1 PINHOLE 1600 1200 1450.2 1450.2 800 600`（`CAMERA_ID MODEL WIDTH HEIGHT PARAMS[]`）。
- `images.txt`：画像ごとに、ワールドからカメラへの姿勢 `QW QX QY QZ TX TY TZ`、カメラ ID、ファイル名があり、続く行に 2D キーポイントとそれが観測する 3D 点の ID が並びます。
- `points3D.txt`：点ごとに、位置、色、再投影誤差、そして**トラック（track）**（どの画像のどのキーポイントがその点を観測しているか）。

NeRF のローダーは `images.txt` をカメラからワールドへの行列に変換します。3DGS はさらに `points3D` を読み込み、疎な点ごとに 1 つのガウシアンを生成します。必ず行うべき簡単な健全性チェックがあります。COLMAP が報告する**平均再投影誤差**が約 1 px 未満であること、そしてほぼすべての画像が単一のモデルに登録されていることです。

## 6. 多視点ステレオ

SfM の点は疎で、特徴的な模様がある場所にしか存在しません。**多視点ステレオ（multi-view stereo, MVS）**は、既知となったカメラを使って再構成を密にします。古典的な定式化では、各参照画像について**深度マップ（depth map）**を推定します。各ピクセルについて、近傍ビューとの測光的一貫性（photo-consistency）を最大化する深度（多くの場合は法線も）を探索し、すべての深度マップを統合して密な点群を作り、必要に応じてメッシュを生成します（たとえばポアソン表面再構成（Poisson surface reconstruction））。

- **平面掃引（plane sweeping）**は、カメラに正対する（fronto-parallel）一連の深度平面を試します。ホモグラフィ $H = K_s (R - \mathbf t \mathbf n^\top / d) K_r^{-1}$ によってソース画像を各平面にワープし、パッチを比較します（NCC）。
- **PatchMatch ステレオ（PatchMatch stereo）**は、良い深度/法線の仮説を隣接ピクセル間で伝播させ、ランダムな精密化を組み合わせます。総当たり探索よりはるかに低コストです。COLMAP の MVS（Schönberger et al., "Pixelwise View Selection for Unstructured Multi-View Stereo", ECCV 2016）は、ピクセルごとのソースビュー選択と幾何的一貫性を加えることで、非構造化の写真集合でも機能するようにしています。
- **学習ベースの MVS（learned MVS）**、たとえば MVSNet（Yao et al., ECCV 2018）は、CNN 特徴を微分可能なホモグラフィでワープしてコストボリューム（cost volume）を構築し、3D 畳み込みで正則化します。

なぜニューラルレンダリングのシリーズでこれを気にするのでしょうか。それは、NeRF と 3DGS が**微分可能レンダラーを備えた MVS** とみなせるからです。パッチをマッチングする代わりに、レンダリング結果がすべての画像を再現するようにボリューム表現を最適化するのです。MVS の深度は、両者の幾何的な事前情報や初期値としても広く使われています。

### 6.1 フィードフォワード型の幾何推定

2024 年以降、画像から直接幾何を回帰するネットワークがこの状況を変えつつあります。DUSt3R（Wang et al., CVPR 2024）は、内部パラメータが未知のまま画像ペアに対してピクセルごとの**ポイントマップ（pointmap）**を予測します。MASt3R（Leroy et al., ECCV 2024）はその上に密なマッチング特徴を加えます。VGGT（Wang et al., CVPR 2025）は、多数のビューに対してカメラ、深度マップ、ポイントマップ、トラックを 1 回の順伝播で予測します。これらは COLMAP が失敗するような疎な撮影や気軽な撮影の姿勢推定にますます使われるようになっており、第 5 回のフィードフォワード型 3DGS 手法に直接つながります。

## 試してみよう

[インタラクティブラボ]({{ '/' | relative_url }}#lab)の Gaussian World デモは、まさに第 1 節の投影モデルを使って各ガウシアンを画面上に配置しています。ビュー行列、透視除算、そして画角から導かれる焦点距離です。一人称視点で歩き回るとき、あなたは $R$ と $\mathbf t$ を変えているのです。第 4 回では、この投影の同じヤコビアンが 3D ガウシアンを 2D の楕円に変える仕組みを説明します。

## 代表的な論文

| 論文 | 会議/論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| A computer algorithm for reconstructing a scene from two projections (Longuet-Higgins) | Nature | 1981 | — | 基本行列と 8 点法のアイデアを導入 |
| In Defense of the Eight-Point Algorithm (Hartley) | TPAMI | 1997 | — | 座標の正規化によって線形手法を高精度にした |
| A Flexible New Technique for Camera Calibration (Zhang) | TPAMI | 2000 | [DOI](https://doi.org/10.1109/34.888718) | OpenCV で使われているチェッカーボードキャリブレーション |
| Bundle Adjustment — A Modern Synthesis (Triggs et al.) | Vision Algorithms Workshop (LNCS) | 1999 | — | BA のための疎な非線形最小二乗法の定番文献 |
| An Efficient Solution to the Five-Point Relative Pose Problem (Nistér) | TPAMI | 2004 | — | RANSAC 内で使われる $E$ の最小ソルバー |
| Photo Tourism: Exploring Photo Collections in 3D (Snavely et al.) | SIGGRAPH | 2006 | — | インターネット規模の SfM。現代のパイプラインの祖先 |
| Structure-from-Motion Revisited (Schönberger & Frahm) | CVPR | 2016 | [CVF](https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html) | COLMAP の SfM。NeRF/3DGS の標準的な姿勢の入手元 |
| Pixelwise View Selection for Unstructured Multi-View Stereo (Schönberger et al.) | ECCV | 2016 | [DOI](https://doi.org/10.1007/978-3-319-46487-9_31) | COLMAP の PatchMatch MVS |
| MVSNet: Depth Inference for Unstructured Multi-view Stereo (Yao et al.) | ECCV | 2018 | [arXiv](https://arxiv.org/abs/1804.02505) | 学習ベースのコストボリューム MVS |
| DUSt3R: Geometric 3D Vision Made Easy (Wang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.14132) | 姿勢不要のポイントマップ回帰 |
| Grounding Image Matching in 3D with MASt3R (Leroy et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2406.09756) | DUSt3R の上に構築した密なマッチング |
| Global Structure-from-Motion Revisited (GLOMAP, Pan et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2407.20219) | 高速な大域的 SfM。COLMAP 互換 |
| VGGT: Visual Geometry Grounded Transformer (Wang et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2503.11651) | 多数のビューに対するカメラ + 深度 + 点のフィードフォワード推定 |

## 学習リソース

- R. Hartley and A. Zisserman, *Multiple View Geometry in Computer Vision*, 2nd ed., Cambridge University Press, 2004。第 1–4 節のすべての内容についての定番の参考書です。
- R. Szeliski, *Computer Vision: Algorithms and Applications*, 2nd ed.。[szeliski.org/Book](https://szeliski.org/Book/) で無料公開されています（画像形成、SfM、深度推定の章）。
- Stanford [CS231A: Computer Vision, From 3D Perception to 3D Reconstruction and Beyond](https://web.stanford.edu/class/cs231a/)：カメラモデル、エピポーラ幾何、SfM に関する講義ノート。
- [COLMAP のドキュメント](https://colmap.github.io/)と[ソースコード](https://github.com/colmap/colmap)。出力形式やカメラモデルの説明を含みます。[GLOMAP](https://github.com/colmap/glomap)。
- [Ceres Solver](http://ceres-solver.org/) のバンドル調整に関するチュートリアル。
- OpenCV のカメラキャリブレーションと `calib3d` モジュールのドキュメント（`calibrateCamera`、`findEssentialMat`、`recoverPose`、`triangulatePoints`）。

## 演習

1. $E = [\mathbf t]\_\times R$ の特異値が $(\lVert\mathbf t\rVert, \lVert\mathbf t\rVert, 0)$ であることを示してください。ヒント：$[\mathbf t]\_\times$ の特異値は $(\lVert\mathbf t\rVert, \lVert\mathbf t\rVert, 0)$ であり、$R$ は直交行列です。
2. `eight_point` から Hartley 正規化を取り除き、ピクセルノイズに対する Sampson 誤差をプロットしてください。どの程度悪化するでしょうか。
3. 合成画像に放射方向の歪み（$k_1 = -0.2$）を加え、それをモデル化せずにパイプラインを実行して、再構成された点がどのように曲がるかを観察してください。その後、$k_1$ をバンドル調整のパラメータとして追加してください。
4. `triangulate` を $N$ ビューに拡張し、点ごとに三角測量角を計算してください。1.5° 未満の点は棄却します。
5. テーブル上の物体を撮影した 30–50 枚の写真で COLMAP を実行し、GUI で `cameras.txt`、`images.txt`、再投影誤差を確認してください。

**次回：**キャリブレーション済みのカメラが手に入ったので、[第 2 回]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})では微分可能なボリュームレンダリングによって画像をニューラル放射輝度場に変えます。
