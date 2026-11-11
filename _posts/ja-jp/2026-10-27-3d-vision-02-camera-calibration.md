---
layout: post
title: "カメラキャリブレーション：ホモグラフィ、Zhang の手法、そして結果をどこまで信じてよいか"
date: 2026-10-27 11:02:00+0900
description: "チェッカーボードからカメラの内部パラメータとレンズ歪みを推定します。平面ホモグラフィと正規化 DLT、Zhang の閉形式解、Levenberg-Marquardt による精密化、再投影誤差とパラメータの不確かさ、キャリブレーションターゲットとサブピクセルコーナー、ステレオ平行化、ハンドアイ AX = XB、カメラ-IMU キャリブレーションを、合成データ上の NumPy と OpenCV のコードとともに解説します。"
categories: 3d-vision
tags: [camera-calibration, homography, dlt, zhang-method, levenberg-marquardt, uncertainty, stereo-rectification, hand-eye, kalibr]
series: 3d-vision
series_order: 2
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 01 回]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})ではカメラモデルを書き下しました。ピンホール投影 $P = K[R \mid \mathbf t]$ に歪みの多項式を加えたものです。そこではすべての数値が与えられていました。しかし実際には、誰も $f_x$ や $k_1$ を手渡してはくれません。レンズには公称焦点距離がありますが、ピクセル単位の実効焦点距離はフォーカス位置、センサーの正確な位置、製造公差に左右されます。主点は画像中心から数十ピクセルずれていることがあり、安価な広角レンズの歪みは隅のピクセルを 30 ピクセル以上動かすことがあります。

**カメラキャリブレーション**（camera calibration）とは、これらの数値を測ることです。SfM、SLAM、ステレオ深度推定、AR の位置合わせ、ロボットの把持など、ほぼすべての 3D ビジョンのプロジェクトで最初に行う実験です。ここでの誤差は下流のすべてに広がります。焦点距離が 1% 長すぎれば、動くカメラから推定した奥行きはすべて約 1% 拡大されます。補正されていない歪みは直線を曲げ、エピポーラ幾何を壊します。本記事では標準的なパイプラインをゼロから組み立て、真値がわかっている合成データで動かし、OpenCV と照合したうえで、チュートリアルがたいてい飛ばしてしまう問いに答えます。*結果をどこまで信じてよいのか、そして画像のどこでなら信じてよいのか？*

## 前提知識

- 本シリーズ第 01 回：同次座標、$K$、$[R \mid \mathbf t]$、Brown-Conrady モデル、不動点反復による歪み補正。
- 線形最小二乗法と SVD：$\lVert\mathbf h\rVert = 1$ の制約下での $\min \lVert A\mathbf h\rVert$ の解は、最小特異値に対応する右特異ベクトルです。
- 勾配とヤコビ行列、少しの確率（ガウスノイズ、共分散）。
- Python、NumPy、SciPy。第 4〜8 節では OpenCV でも照合します（`pip install opencv-python`。以下の数値は OpenCV 4.10 によるものです）。すべてのコード片は**ひとつのスクリプト**を構成しています。順番に実行すれば、出力される数値はすべて本文と一致します。

## 1. キャリブレーション問題

### 1.1 何を、何から推定するのか

第 01 回のカメラモデルを、OpenCV の既定の 5 つの歪み係数とともに使います。カメラ座標系（OpenCV の規約：$x$ が右、$y$ が下、$z$ が前）の 3 次元点 $\mathbf X_c = (X_c, Y_c, Z_c)$ の正規化座標は $x = X_c/Z_c$、$y = Y_c/Z_c$ です。$r^2 = x^2 + y^2$ とすると、レンズはこれを

$$
\begin{aligned}
x_d &= x\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + 2p_1 xy + p_2 (r^2 + 2x^2),\\
y_d &= y\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + p_1 (r^2 + 2y^2) + 2p_2 xy,
\end{aligned}
$$

へ動かし、ピクセル座標は $u = f_x x_d + c_x$、$v = f_y y_d + c_y$ となります。したがって**内部パラメータ**（intrinsic parameters）は $\boldsymbol\theta = (f_x, f_y, c_x, c_y, k_1, k_2, p_1, p_2, k_3)$ の 9 つです。スキューはゼロと仮定します。これは現代のほぼすべてのセンサーで成り立ちます。

$\boldsymbol\theta$ は直接は測れません。*できる*のは、幾何形状が正確にわかっている物体をカメラに見せ、画像上でその点を検出し、見えているものを説明するのはどの $\boldsymbol\theta$ かを問うことです。印刷した**平面ターゲット**（planar target、多くはチェッカーボード）は、そのような物体のなかで最も安価です。ボード上のすべてのコーナーの位置は 1 mm 未満の精度でわかっており、コーナーはサブピクセル精度で簡単に検出できます。

ただし難点がひとつあります。各写真でボードがどこにあったかもわからないのです。画像 $i$ ごとにボードの姿勢 $(R_i, \mathbf t_i)$、つまり 6 つの未知数が増えます。コーナー数 $n$ のボードを $N$ 枚撮ると

$$
\underbrace{9}_{\boldsymbol\theta} + \underbrace{6N}_{\text{姿勢}} \text{ 個の未知数}, \qquad 2nN \text{ 個の観測 } (u, v).
$$

私たちのボード（$n = 54$）と $N = 12$ 枚の画像では、未知数 81 個に対して観測 1296 個と、十分に過剰決定です。しかし問題は非線形（回転、透視除算、歪みの多項式）なので、一度には解けません。Zhang（2000）による古典的な手順は 3 段階です。

1. 各画像について、ボード平面から画像への**ホモグラフィ**（homography）を推定する（線形、第 2 節）。
2. 歪みを無視して、ホモグラフィから $K$ と姿勢を**閉形式**（closed form）で求める（線形、第 3 節）。
3. 再投影誤差に対する**非線形最小二乗法**（nonlinear least squares）で、歪みを含むすべてを精密化する（第 4 節）。

その後に、結果を実用にするための部分、つまり**検証**が来ます（第 5 節）。

### 1.2 合成データセット

すべてのステップを真値と照合できるよう、実験をシミュレーションします。カメラは $640\times 480$ のセンサーで、$f_x = 600$、$f_y = 596$（わずかに正方形でない画素）、主点 $(322, 236)$ は中心から数ピクセルずれ、歪みは第 01 回の樽型歪み（$k_1 = -0.28$、$k_2 = 0.07$）に小さな接線方向成分を加えたものです。ボードは $9\times 6$ の内側コーナーで、マス目は 30 mm です。これを 12 の姿勢に置きます。正面向きが 3 つ（近いものと遠いものを含む）、ひとつの軸まわりに 35° 傾けたものが 4 つ、画像の四隅に寄せたものが 4 つ、光軸まわりに 40° 回したものが 1 つです。実際のコーナー検出器の精度は 0.数ピクセルなので、$\sigma = 0.3$ ピクセルのガウスノイズを加えます。

```python
import numpy as np

W, H = 640, 480
K_true = np.array([[600.0, 0.0, 322.0],
                   [0.0, 596.0, 236.0],
                   [0.0, 0.0, 1.0]])
dist_true = np.array([-0.28, 0.07, 0.0008, -0.0005, 0.0])   # k1, k2, p1, p2, k3 (OpenCV order)

# planar target: 9 x 6 inner corners, 30 mm squares, on the plane Z = 0 of the board frame
sq = 0.03
ii, jj = np.meshgrid(np.arange(6), np.arange(9), indexing="ij")
obj = np.stack([jj.ravel() * sq, ii.ravel() * sq, np.zeros(54)], axis=1)   # 54 x 3, metres

def rodrigues(r):
    """Axis-angle vector (3,) -> rotation matrix."""
    th = np.linalg.norm(r)
    if th < 1e-12:
        return np.eye(3)
    k = r / th
    Kx = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + np.sin(th) * Kx + (1 - np.cos(th)) * Kx @ Kx

def project(K, dist, R, t, X):
    """Board points X (N x 3) -> pixels (N x 2): pinhole + Brown-Conrady distortion."""
    Xc = X @ R.T + t
    x, y = Xc[:, 0] / Xc[:, 2], Xc[:, 1] / Xc[:, 2]
    k1, k2, p1, p2, k3 = dist
    r2 = x * x + y * y
    rad = 1 + k1 * r2 + k2 * r2**2 + k3 * r2**3
    xd = x * rad + 2 * p1 * x * y + p2 * (r2 + 2 * x * x)
    yd = y * rad + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y
    return np.stack([K[0, 0] * xd + K[0, 1] * yd + K[0, 2], K[1, 1] * yd + K[1, 2]], axis=1)

def board_pose(tilt_x, tilt_y, roll, centre):
    """Board-to-camera (R, t): rotate the board about its centre, then move the centre to `centre`."""
    d = np.deg2rad
    R = rodrigues([0, 0, d(roll)]) @ rodrigues([d(tilt_x), 0, 0]) @ rodrigues([0, d(tilt_y), 0])
    return R, np.asarray(centre, float) - R @ obj.mean(axis=0)

# twelve poses: (tilt about x, tilt about y, roll) in degrees, board centre in camera coordinates (m)
POSES = [(0, 0, 0, (0, 0, 0.55)), (0, 0, 0, (0, 0, 0.40)), (0, 0, 20, (0.06, 0.05, 0.80)),
         (0, 35, 0, (0, 0, 0.55)), (0, -35, 0, (0, 0, 0.55)), (35, 0, 0, (0, 0, 0.55)),
         (-35, 0, 0, (0, 0, 0.55)), (20, -25, 10, (-0.16, -0.115, 0.60)),
         (20, 25, -10, (0.16, -0.115, 0.60)), (-20, -25, -10, (-0.16, 0.115, 0.60)),
         (-20, 25, 10, (0.16, 0.115, 0.60)), (25, 20, 40, (0, 0, 0.50))]
views = [board_pose(*p) for p in POSES]

rng = np.random.default_rng(0)
sigma = 0.3                                         # corner-detection noise (px)
obs = [project(K_true, dist_true, R, t, obj) + rng.normal(0, sigma, (54, 2)) for R, t in views]
uv = np.concatenate(obs)
print(f"{len(uv)} corners, u in [{uv[:, 0].min():.0f}, {uv[:, 0].max():.0f}], "
      f"v in [{uv[:, 1].min():.0f}, {uv[:, 1].max():.0f}]")
```

```text
648 corners, u in [47, 596], v in [45, 427]
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-setup.svg" caption="合成実験。左：$\mathbf C$ にあるカメラの視錐台と、カメラ座標系での 12 のボード姿勢（$z$ を奥向き、$-y$ を上向きに描画）。右：画像上の 648 個のノイズ付きコーナーをビューごとに色分けし、各ボードの輪郭を描いたもの。ビュー 1〜3 は正面向き、4〜7 は $y$ 軸または $x$ 軸まわりに 35° 傾き、8〜11 は画像の四隅、12 は光軸まわりに 40° 回転しています。コーナーは $u \in [47, 596]$、$v \in [45, 427]$ を覆っており、画像全体をほぼ、しかし完全にではなく覆っています。" %}

## 2. ホモグラフィと DLT

### 2.1 平面からホモグラフィが生じる理由

ボード座標系をボード上に置くと、すべてのコーナーは $Z = 0$ となり、ボード座標は $(X, Y, 0)$ です。回転を列で $R = [\mathbf r_1\ \mathbf r_2\ \mathbf r_3]$ と書きます。コーナーの投影は（ここでは歪みを無視して）

$$
s \begin{pmatrix} u \\ v \\ 1 \end{pmatrix}
= K \begin{pmatrix} \mathbf r_1 & \mathbf r_2 & \mathbf r_3 & \mathbf t \end{pmatrix}
\begin{pmatrix} X \\ Y \\ 0 \\ 1 \end{pmatrix}
= \underbrace{K \begin{pmatrix} \mathbf r_1 & \mathbf r_2 & \mathbf t \end{pmatrix}}_{H}
\begin{pmatrix} X \\ Y \\ 1 \end{pmatrix}.
$$

$R$ の 3 列目は $Z = 0$ に掛かるので消えます。残るのは、同次のボード座標を同次のピクセル座標に写す $3\times 3$ 行列 $H$、すなわち**ホモグラフィ**（平面の射影変換、第 01 回 1.5 節）です。$H$ はスケールを除いてしか決まらない（係数 $s$ は奥行き）ので、自由度は 8 です。直線を直線に写すので、レンズに歪みがない限り、撮影したチェッカーボードの行と列はまっすぐなままです。

この式が平面キャリブレーションの核心です。$H$ は画像だけから測ることができ、そこには $K$、$\mathbf r_1$、$\mathbf r_2$、$\mathbf t$ が掛け合わされて含まれています。第 3 節でこれらを分離します。

### 2.2 直接線形変換（DLT）

$\tilde{\mathbf x} = (u, v, 1)^\top$、$\tilde{\mathbf X} = (X, Y, 1)^\top$ とし、$\mathbf h_1^\top, \mathbf h_2^\top, \mathbf h_3^\top$ を $H$ の**行**とします。「スケールを除いて等しい」とは $\tilde{\mathbf x} \times H\tilde{\mathbf X} = \mathbf 0$ のことです。$H\tilde{\mathbf X}$ の第 3 成分は $\mathbf h_3^\top\tilde{\mathbf X}$ なので、これで割ると

$$
u = \frac{\mathbf h_1^\top \tilde{\mathbf X}}{\mathbf h_3^\top \tilde{\mathbf X}}, \quad
v = \frac{\mathbf h_2^\top \tilde{\mathbf X}}{\mathbf h_3^\top \tilde{\mathbf X}}
\quad\Longrightarrow\quad
\begin{aligned}
\mathbf h_1^\top \tilde{\mathbf X} - u\, \mathbf h_3^\top \tilde{\mathbf X} &= 0,\\
\mathbf h_2^\top \tilde{\mathbf X} - v\, \mathbf h_3^\top \tilde{\mathbf X} &= 0.
\end{aligned}
$$

どちらの式も 9 つの要素 $\mathbf h = (h_{11}, h_{12}, \dots, h_{33})$ について**線形**です。各対応点が行列 $A$ の 2 行を与えます。

$$
\begin{pmatrix}
X & Y & 1 & 0 & 0 & 0 & -uX & -uY & -u \\
0 & 0 & 0 & X & Y & 1 & -vX & -vY & -v
\end{pmatrix} \mathbf h = \mathbf 0 .
$$

$n \ge 4$ 点（どの 3 点も同一直線上にない）があれば、これらを積み重ねて $2n\times 9$ の連立方程式 $A\mathbf h = \mathbf 0$ を得ます。ノイズがあると厳密解はないので、$\lVert\mathbf h\rVert = 1$（$\mathbf h = \mathbf 0$ を除くため）の制約下で**代数誤差**（algebraic error）$\lVert A\mathbf h\rVert$ を最小化します。解は $A$ の最小特異値に対応する右特異ベクトルです。アルゴリズムはこれで全部です。$A$ を作り、SVD を 1 回行うだけです。

### 2.3 正規化

$A$ の要素の大きさは大きく異なります。ボード座標は約 0.1 m、ピクセルは約 300 で、$uX$ のような積は両者を混ぜ合わせます。すると代数誤差は各方程式に非常に不均一な重みを与え、結果は単位や原点という恣意的な選択に依存してしまいます。Hartley（1997）の解決策は、両側にそれぞれ**相似変換**をかけることです。点の重心を原点に移し、原点からの平均距離が $\sqrt 2$ になるようにスケールします。ボード側を $T_1$、画像側を $T_2$ として、正規化した点の間で $\hat H$ を求め、最後に元に戻します。

$$
\hat{\mathbf x} = T_2\tilde{\mathbf x},\quad \hat{\mathbf X} = T_1\tilde{\mathbf X},\quad \hat{\mathbf x} \simeq \hat H \hat{\mathbf X}
\quad\Longrightarrow\quad H = T_2^{-1}\hat H\,T_1 .
$$

```python
def normalizing_transform(p):
    """Similarity T that moves the centroid to 0 and makes the mean distance sqrt(2)."""
    c = p.mean(axis=0)
    d = np.linalg.norm(p - c, axis=1).mean()
    k = np.sqrt(2) / d
    return np.array([[k, 0, -k * c[0]], [0, k, -k * c[1]], [0, 0, 1]])

def homography_dlt(X, x, normalize=True):
    """H (3 x 3, H[2,2] = 1) with x ~ H X, from N >= 4 plane points X (N x 2) and pixels x (N x 2)."""
    T1 = normalizing_transform(X) if normalize else np.eye(3)
    T2 = normalizing_transform(x) if normalize else np.eye(3)
    Xh = np.c_[X, np.ones(len(X))] @ T1.T
    xh = np.c_[x, np.ones(len(x))] @ T2.T
    A = []
    for (X_, Y_, _), (u, v, _) in zip(Xh, xh):
        A.append([X_, Y_, 1, 0, 0, 0, -u * X_, -u * Y_, -u])
        A.append([0, 0, 0, X_, Y_, 1, -v * X_, -v * Y_, -v])
    A = np.array(A)
    _, S, Vt = np.linalg.svd(A)
    Hn = Vt[-1].reshape(3, 3)                    # right singular vector of the smallest singular value
    Hm = np.linalg.inv(T2) @ Hn @ T1             # undo the normalization
    return Hm / Hm[2, 2], S

Hs = [homography_dlt(obj[:, :2], o)[0] for o in obs]
H0 = Hs[0]
pred = np.c_[obj[:, :2], np.ones(54)] @ H0.T
pred = pred[:, :2] / pred[:, 2:]
print("H for view 1:\n", np.array2string(H0, precision=2, suppress_small=True))
print("rms transfer error of view 1: %.2f px" % np.sqrt(((pred - obs[0]) ** 2).sum(1).mean()))
_, S_raw = homography_dlt(obj[:, :2], obs[0], normalize=False)
_, S_nrm = homography_dlt(obj[:, :2], obs[0], normalize=True)
print("condition number s1/s8: raw %.1e, normalized %.1e" % (S_raw[0] / S_raw[-2], S_nrm[0] / S_nrm[-2]))
```

```text
H for view 1:
 [[1077.98   -0.84  192.66]
 [   0.07 1071.88  155.63]
 [   0.     -0.      1.  ]]
rms transfer error of view 1: 0.62 px
condition number s1/s8: raw 3.3e+04, normalized 3.5e+00
```

**手計算による確認。** ビュー 1 は正面向きです。$R = I$、$\mathbf t = (-0.12, -0.075, 0.55)$ m（ボードの最初のコーナーは光軸から左に 12 cm、上に 7.5 cm、距離 55 cm）。すると $H = K[\mathbf e_1\ \mathbf e_2\ \mathbf t]$ で、$t_z = 0.55$ で割ると

$$
H = \begin{pmatrix} f_x/t_z & 0 & (f_x t_x + c_x t_z)/t_z \\ 0 & f_y/t_z & (f_y t_y + c_y t_z)/t_z \\ 0 & 0 & 1\end{pmatrix}
= \begin{pmatrix} 1090.9 & 0 & 191.1 \\ 0 & 1083.6 & 154.7 \\ 0 & 0 & 1 \end{pmatrix}.
$$

推定値の構造は正しいものの、対角成分は約 1.2% 小さくなっています。DLT に問題があるわけではありません。樽型歪みが外側のコーナーを中心へ引き寄せるのでボードが小さく*見え*、直線を直線に写すホモグラフィはこの曲がりを表現できないのです。下の図は、最も歪みの強いビューでのこの系統的なずれを示しています。歪みを含まない閉形式解には偏りが出る、という最初の警告です。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-homography.svg" caption="ホモグラフィはボード平面（左、単位 mm、$Z=0$）を画像に写します。右：ノイズなしのビュー 8（画像の左上隅）。最もよく当てはまる $H$ で写した格子（オレンジ、構成上すべて直線）と、真の歪んだコーナー（紫）と $H$ の予測との残差を 20 倍に拡大したもの。ずれはランダムではなく系統的で、RMS 0.78 ピクセル、最大 2.06 ピクセルです。ホモグラフィは直線を曲げられませんが、第 4 節の歪み項は曲げられます。" width="95%" %}

正規化で何が得られるのでしょうか。次の図の左は、ビュー 1 の $A$ の特異値です。正規化しないと 6 桁にわたって広がり、比 $s_1/s_8$（最大値と 2 番目に小さい値の比。$s_9$ が求めたい「零」方向です）は 3.5 ではなく $3.3\times 10^4$ になります。右は、ノイズレベルごとにノイズ付きで歪みのないボード 300 枚で DLT を実行した結果です。正直に言うと、よく散らばった 54 点と倍精度では、精度への影響は小さく数 % で、$\sigma = 3$ ピクセルでは 14%（ボード座標がメートル）と 20%（ミリメートル）まで大きくなります。正規化はコストがゼロで、結果を単位の選び方から独立にし、座標が 2 次の形で現れる場合（第 04 回の基礎行列）や点が少ない場合にははるかに重要になります。必ず行いましょう。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-normalization.svg" caption="左：ビュー 1 の $108\times 9$ の DLT 行列 $A$ の 9 つの特異値。Hartley の正規化なし（赤）とあり（青）。右：推定したホモグラフィの真のホモグラフィに対する RMS 誤差 $e_H$（歪みのないボード、300 回の試行の平均）とコーナーノイズ $\sigma$ の関係。正規化あり：$\sigma=1$ で 0.381 ピクセル、$\sigma=3$ で 1.142 ピクセル。正規化なしでは $\sigma=3$ のとき、ボード座標がメートルで 1.306 ピクセル、ミリメートルで 1.369 ピクセル。破線 $\sigma\sqrt{8/54}$ は 54 点に 8 パラメータを当てはめたときに期待される誤差です。" %}

## 3. Zhang の閉形式解

### 3.1 画像 1 枚につき 2 つの制約

ここからが鍵となる考え方です。$H$ を**列**で $H = [\mathbf h_1\ \mathbf h_2\ \mathbf h_3]$ と書きます。未知のスケール $\lambda$ に対して $H = \lambda K[\mathbf r_1\ \mathbf r_2\ \mathbf t]$ なので

$$
\mathbf r_1 = \tfrac{1}{\lambda} K^{-1}\mathbf h_1, \qquad \mathbf r_2 = \tfrac{1}{\lambda} K^{-1}\mathbf h_2 .
$$

姿勢については何もわかりませんが、$\mathbf r_1$ と $\mathbf r_2$ が回転行列の 2 列であること、つまり**直交**し**長さが等しい（1 である）**ことだけはわかっています。代入すると

$$
\mathbf r_1^\top \mathbf r_2 = 0 \;\Rightarrow\; \mathbf h_1^\top B\, \mathbf h_2 = 0, \qquad
\mathbf r_1^\top \mathbf r_1 = \mathbf r_2^\top \mathbf r_2 \;\Rightarrow\; \mathbf h_1^\top B\, \mathbf h_1 - \mathbf h_2^\top B\, \mathbf h_2 = 0,
\qquad B = K^{-\top}K^{-1}.
$$

姿勢が消えました。各画像は、内部パラメータだけに依存するひとつの対称行列 $B$ の要素について 2 つの方程式を与えます。（幾何学的には、$B$ は**絶対円錐曲線の像**（image of the absolute conic）で、第 01 回 1.6 節の消失点によるキャリブレーションの背後にあるものと同じです。直交する 2 つの消失方向 $\mathbf v_1, \mathbf v_2$ は $\mathbf v_1^\top B\,\mathbf v_2 = 0$ を満たします。ここでは $\mathbf h_1$ と $\mathbf h_2$ が*まさに*ボードの $X$ 軸と $Y$ 軸の消失点です。）

### 3.2 $B$ についての連立一次方程式

$B$ は対称なので、異なる要素は 6 つ、$\mathbf b = (B_{11}, B_{12}, B_{22}, B_{13}, B_{23}, B_{33})$ です。$\mathbf h_i^\top B\,\mathbf h_j$ を展開すると内積 $\mathbf v_{ij}^\top \mathbf b$ になり、

$$
\mathbf v_{ij} = \big(h_{1i}h_{1j},\; h_{1i}h_{2j} + h_{2i}h_{1j},\; h_{2i}h_{2j},\; h_{3i}h_{1j} + h_{1i}h_{3j},\; h_{3i}h_{2j} + h_{2i}h_{3j},\; h_{3i}h_{3j}\big)^\top,
$$

ここで $h_{ki}$ は第 $i$ 列の第 $k$ 要素です。画像 $i$ の 2 つの制約は行列 $V$ の 2 行になります。

$$
\begin{pmatrix} \mathbf v_{12}^\top \\ (\mathbf v_{11} - \mathbf v_{22})^\top \end{pmatrix} \mathbf b = \mathbf 0
\quad\text{（すべての画像について）}\quad\Longrightarrow\quad V\mathbf b = \mathbf 0 .
$$

$\mathbf b$ もまた最小特異値に対応する右特異ベクトルです。**数え上げ：**$\mathbf b$ はスケールを除いて 6 要素、つまり自由度 5（スキューを含む $K$ の 5 要素）です。画像 1 枚で 2 式なので、**少なくとも 3 枚**必要で、スキューゼロも課せば 2 枚で足ります。

### 3.3 $B$ から $K$ と姿勢へ

$B = K^{-\top}K^{-1}$（スケールを除いて）は対称正定値で、$K^{-1}$ は上三角行列です。したがって $B$ のコレスキー分解 $B = LL^\top$（$L$ は下三角）から $L^\top \propto K^{-1}$、すなわち $K \propto (L^\top)^{-1}$ が得られ、$K_{33}$ で割ります。（Zhang の論文は同じ結果を陽な式で書いています。）$\mathbf b$ の符号は任意なので、必要なら反転して $B$ を正定値にします。

$K$ がわかれば、各姿勢はそのホモグラフィから求まります。$\lambda = 1/\lVert K^{-1}\mathbf h_1\rVert$、$\mathbf r_1 = \lambda K^{-1}\mathbf h_1$、$\mathbf r_2 = \lambda K^{-1}\mathbf h_2$、$\mathbf r_3 = \mathbf r_1\times\mathbf r_2$、$\mathbf t = \lambda K^{-1}\mathbf h_3$ です。$\lambda$ の符号は、ボードがカメラの前方にある（$t_z > 0$）ように選びます。ノイズがあると $[\mathbf r_1\ \mathbf r_2\ \mathbf r_3]$ は厳密には回転行列にならないので、最も近い回転行列、つまり SVD $U\Sigma V^\top$ による $UV^\top$ で置き換えます。

```python
def v_ij(H, i, j):
    """Row vector with h_i^T B h_j = v_ij . b for b = (B11, B12, B22, B13, B23, B33)."""
    a, c = H[:, i], H[:, j]
    return np.array([a[0] * c[0], a[0] * c[1] + a[1] * c[0], a[1] * c[1],
                     a[2] * c[0] + a[0] * c[2], a[2] * c[1] + a[1] * c[2], a[2] * c[2]])

def zhang_intrinsics(Hs):
    """Closed-form K from >= 3 plane homographies (Zhang 2000)."""
    V = np.array([row for H in Hs for row in (v_ij(H, 0, 1), v_ij(H, 0, 0) - v_ij(H, 1, 1))])
    _, S, Vt = np.linalg.svd(V)
    b = Vt[-1]
    B = np.array([[b[0], b[1], b[3]], [b[1], b[2], b[4]], [b[3], b[4], b[5]]])
    if B[0, 0] < 0:                              # b is defined up to sign; B = K^-T K^-1 is pos. def.
        B = -B
    L = np.linalg.cholesky(B)                    # B = L L^T with L lower triangular, L^T ~ K^-1
    K = np.linalg.inv(L.T)
    return K / K[2, 2], S

def zhang_extrinsics(K, H):
    """Board pose (R, t) from K and the homography H ~ K [r1 r2 t]."""
    M = np.linalg.inv(K) @ H
    lam = 1.0 / np.linalg.norm(M[:, 0])
    if M[2, 2] < 0:                              # the board must be in front of the camera (t_z > 0)
        lam = -lam
    r1, r2, t = lam * M[:, 0], lam * M[:, 1], lam * M[:, 2]
    U, _, Vt = np.linalg.svd(np.c_[r1, r2, np.cross(r1, r2)])
    return U @ Vt, t                             # nearest rotation matrix (Frobenius norm)

K0, S_V = zhang_intrinsics(Hs)
print("closed-form K:\n", np.array2string(K0, precision=1, suppress_small=True))
print("singular values of V (smallest two): %.2e %.2e" % (S_V[-2], S_V[-1]))
poses0 = [zhang_extrinsics(K0, H) for H in Hs]
```

```text
closed-form K:
 [[618.9  -0.8 327.2]
 [  0.  618.6 237.9]
 [  0.    0.    1. ]]
singular values of V (smallest two): 2.96e+03 2.99e-01
```

閉形式解は数 % の範囲に収まります。$f_x$ は 600 ではなく 618.9（+3.2%）、$f_y$ は 596 ではなく 618.6（+3.8%）、主点は数ピクセルずれています。歪みを無視する以上、これがほぼ限界です。答えそのものではありませんが、非線形精密化のための優れた**初期値**であり、それこそが閉形式解の役割です。$V$ の最小特異値（0.30）と次の値（2960）の大きな差は、$\mathbf b$ がよく決まっていることを示しています。

### 3.4 閉形式解が失敗するとき：姿勢の多様性

3.1 節の制約は、ボードを**異なる向き**から見たときにだけ情報を持ちます。ボードを平行移動したり光軸まわりに回したりすると $\mathbf t$ と面内回転は変わりますが、加わる制約の組は以前と（ほぼ）同じです。Zhang の論文は極端な場合を証明しています。平行な平面の画像は独立な制約を加えません。Sturm と Maybank（1999）はこうした特異配置をすべて列挙しています。

これには物理的なわかりやすい理由があります。像面に平行で奥行き $Z$ のボードでは、コーナーの像は $u = f_x X/Z + c_x$ で、見えるのは比 $f_x/Z$ だけです。$f$ を 2 倍にし、すべてのボードを光軸に沿って 2 倍遠くに動かすと、まったく同じ画像が得られます（歪みがある場合は $k_1$ と $k_2$ がスケールし直されて補償します。演習 2）。ボードを傾けるとこの釣り合いが崩れます。ボードの手前側と奥側の奥行きが変わり、透視による短縮（foreshortening）が $f$ を単独で明らかにするからです。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-views-and-tilt.svg" caption="閉形式解のモンテカルロ実験（歪みのないカメラ、$\sigma = 0.3$ ピクセル、各点 200 回の試行、$f_x$ の相対誤差の中央値）。左：20〜45° のランダムな傾きのボード。誤差は $N=3$ ビューの 0.69% から $N=12$ の 0.24% に下がります。右：120° ずつ離れた軸まわりに同じ角度 $\theta$ だけ傾けた 3 枚のボード。ほぼ正面向きのボードは役に立ちません。$\theta = 2°$ で誤差 29.7%（このとき閉形式解は 2.5% の試行でそもそも失敗します。灰色の棒）、5° で 4.6%、10° で 1.4%。30° から 70° の間では誤差は約 0.3% で横ばいです。" %}

実用上のルール：ボードを複数の**異なる方向**に 30〜50° 傾け、距離を変えただけの正面向きの画像を無駄に撮らないことです。第 5 節のウィジェットでは、正面向きの 3 ビューだけを選んで手法が破綻するのを確かめられます。

## 4. 歪みを含めた非線形精密化

### 4.1 最尤推定は再投影誤差の最小二乗法

$\mathbf x_{ij}$ を画像 $i$ におけるコーナー $j$ の検出位置、$\pi(\boldsymbol\theta, R_i, \mathbf t_i, \mathbf X_j)$ を完全なカメラモデル（姿勢、投影、歪み、$K$）とします。検出誤差が各座標で標準偏差 $\sigma$ の独立なガウスノイズなら、すべての検出の尤度は

$$
p(\{\mathbf x_{ij}\} \mid \boldsymbol\theta, \{R_i, \mathbf t_i\}) \propto \prod_{i,j} \exp\!\Big(-\frac{\lVert \pi(\boldsymbol\theta, R_i, \mathbf t_i, \mathbf X_j) - \mathbf x_{ij}\rVert^2}{2\sigma^2}\Big),
$$

で、これを最大化することは**再投影誤差の二乗和**（sum of squared reprojection errors）

$$
E(\mathbf p) = \sum_{i=1}^N \sum_{j=1}^n \big\lVert \pi(\boldsymbol\theta, R_i, \mathbf t_i, \mathbf X_j) - \mathbf x_{ij} \big\rVert^2 = \lVert \mathbf r(\mathbf p)\rVert^2
$$

を最小化することと同じです。ここで $\mathbf p$ はすべての未知数を、$\mathbf r(\mathbf p) \in \mathbb R^{2nN}$ はすべての残差を並べたものです。これは「ゴールドスタンダード」（gold standard）のコストです。DLT の代数誤差と違って、ノイズが実際に生じるピクセル空間で誤差を測ります。

**回転のパラメータ化。** 回転行列は 9 要素ですが自由度は 3 です。各回転を**軸角ベクトル**（axis-angle）$\boldsymbol\omega \in \mathbb R^3$（向きが回転軸、長さが回転角）として保持し、Rodrigues の公式 $R = I + \sin\theta\,[\mathbf k]\_\times + (1-\cos\theta)[\mathbf k]\_\times^2$ で変換します。OpenCV も同じです（`rvec`）。したがって $\mathbf p$ の要素数は $9 + 6N$ です。

### 4.2 Gauss-Newton 法と Levenberg-Marquardt 法

現在の推定値のまわりで残差を線形化します。ヤコビ行列 $J = \partial\mathbf r/\partial\mathbf p$ を用いて $\mathbf r(\mathbf p + \boldsymbol\delta) \approx \mathbf r + J\boldsymbol\delta$ です。$\boldsymbol\delta$ について $\lVert\mathbf r + J\boldsymbol\delta\rVert^2$ を最小化するのは線形最小二乗問題で、勾配 $2J^\top(\mathbf r + J\boldsymbol\delta)$ をゼロとおくと **Gauss-Newton** ステップの**正規方程式**（normal equations）が得られます。

$$
J^\top J\,\boldsymbol\delta = -J^\top \mathbf r .
$$

Gauss-Newton 法は最小値の近くでは速く収束しますが、線形化の精度が悪い遠方では行き過ぎることがあります。**Levenberg-Marquardt** 法（LM）は減衰項を加え、

$$
\big(J^\top J + \lambda\,\mathrm{diag}(J^\top J)\big)\,\boldsymbol\delta = -J^\top \mathbf r ,
$$

$\lambda$ を適応的に調整します。ステップでコストが下がれば受け入れて $\lambda$ を小さくし（2 次モデルをより信頼し、Gauss-Newton に近づく）、下がらなければ棄却して $\lambda$ を大きくします（ステップを短くし、スケールした勾配降下に近づく）。Marquardt による $\mathrm{diag}(J^\top J)$ でのスケーリングは、減衰を各パラメータの単位から独立にします。$f_x \approx 600$ と $k_2 \approx 0.07$ が同じベクトルに入っているときには、これが重要です。

以下のコードは、遅いながらも完全なキャリブレーションです。閉形式による初期化（歪みはゼロから開始）、前進差分によるヤコビ行列、そして LM です。実際の実装（OpenCV、Ceres）は解析的な微分を使い疎性を利用しますが、計算している内容は同じです。

```python
def rvec_of(R):
    """Rotation matrix -> axis-angle vector (inverse of rodrigues for angles below pi)."""
    th = np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1))
    if th < 1e-12:
        return np.zeros(3)
    w = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
    return th * w / (2 * np.sin(th))

def pack(K, dist, poses):
    """Parameter vector: fx, fy, cx, cy, k1, k2, p1, p2, k3, then (rvec, t) per view."""
    return np.r_[K[0, 0], K[1, 1], K[0, 2], K[1, 2], dist,
                 np.concatenate([np.r_[rvec_of(R), t] for R, t in poses])]

def unpack(p):
    K = np.array([[p[0], 0, p[2]], [0, p[1], p[3]], [0, 0, 1]])
    return K, p[4:9], [(rodrigues(q[:3]), q[3:]) for q in p[9:].reshape(-1, 6)]

def residuals(p, observations):
    K, dist, poses = unpack(p)
    return np.concatenate([(project(K, dist, R, t, obj) - o).ravel()
                           for (R, t), o in zip(poses, observations)])

def jacobian(f, p, r0, eps=1e-6):
    """Forward-difference Jacobian (fine here; real solvers use analytic derivatives)."""
    J = np.empty((len(r0), len(p)))
    for k in range(len(p)):
        dp = np.zeros_like(p)
        dp[k] = eps * max(1.0, abs(p[k]))
        J[:, k] = (f(p + dp) - r0) / dp[k]
    return J

def levenberg_marquardt(f, p, iters=100, lam=1e-3, tol=1e-12):
    r = f(p)
    log = [(r @ r, lam)]
    for _ in range(iters):
        J = jacobian(f, p, r)
        A, g = J.T @ J, J.T @ r
        while True:
            step = np.linalg.solve(A + lam * np.diag(np.diag(A)), -g)
            r_new = f(p + step)
            if r_new @ r_new < r @ r:             # accept: trust the Gauss-Newton model more
                break
            lam *= 4                              # reject: damp harder, towards gradient descent
            if lam > 1e10:                        # no step lowers the cost: we are at the minimum
                return p, jacobian(f, p, r), log
        converged = (r @ r - r_new @ r_new) < tol * (r @ r)
        p, r, lam = p + step, r_new, lam / 3
        log.append((r @ r, lam))
        if converged:
            break
    return p, jacobian(f, p, r), log

def calibrate(observations, fix_k3=False):
    """Zhang's closed form, then LM on intrinsics, distortion and poses (optionally with k3 = 0)."""
    Hs = [homography_dlt(obj[:, :2], o)[0] for o in observations]
    K0, _ = zhang_intrinsics(Hs)
    p0 = pack(K0, np.zeros(5), [zhang_extrinsics(K0, H) for H in Hs])
    free = np.ones(len(p0), bool)
    free[8] = not fix_k3

    def f(q):                                     # residuals as a function of the free parameters
        p = p0.copy()
        p[free] = q
        return residuals(p, observations)

    q, J, log = levenberg_marquardt(f, p0[free])
    p = p0.copy()
    p[free] = q
    return p, J, free, log

p_opt, J, free, log = calibrate(obs)
n_corners = sum(len(o) for o in obs)
for it in (0, 1, 2, 3, len(log) - 1):
    print("iteration %2d: rms %.4f px" % (it, np.sqrt(log[it][0] / n_corners)))
print("fx fy cx cy:", np.round(p_opt[:4], 2))
print("k1 k2 p1 p2 k3:", np.round(p_opt[4:9], 4))
```

```text
iteration  0: rms 4.0605 px
iteration  1: rms 2.7048 px
iteration  2: rms 0.4239 px
iteration  3: rms 0.4047 px
iteration 11: rms 0.4036 px
fx fy cx cy: [601.06 596.97 325.19 235.49]
k1 k2 p1 p2 k3: [-0.2806  0.0914  0.     -0.0005 -0.0526]
```

（`fix_k3` オプションとマスク `free` で $k_3 = 0$ に固定でき、5.3 節で使います。）初期の RMS 誤差 4.06 ピクセルから、2 回の反復で 0.42 ピクセルになり、11 回で 0.4036 ピクセルに収束します。$K$ の推定値は真値から 1〜3 ピクセル以内、$k_1 = -0.2806$ は $-0.28$ から 0.3% 以内です。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-lm.svg" caption="左：解における $1296\times 81$ のヤコビ行列の疎性パターン（黒 = 非ゼロ）。最初の 9 列（内部パラメータ、赤線の左）はすべての残差に関わります。$f_x$ と $c_x$ は $u$ の行だけに、$f_y$ と $c_y$ は $v$ の行だけに関わるので縞模様になります。6 列ずつの姿勢ブロックは自分のビューの 108 個の残差にしか関わりません。ブロック対角の「矢じり」構造です。右：私たちのデータでの LM。RMS 再投影誤差は 2 回の反復で 4.06 ピクセル（閉形式解、歪みなし）から 0.42 ピクセルに下がり、$\sqrt 2\,\sigma = 0.42$（点線）をわずかに下回る 0.4036 ピクセルに落ち着きます。すべてのステップが受け入れられたので、減衰 $\lambda$（オレンジ、右軸）は反復ごとに 1/3 になっています。" %}

ヤコビ行列の矢じり構造は覚えておく価値があります。画像が数千枚になると姿勢ブロックが支配的になり、ソルバーはまず**シューア補行列**（Schur complement）でそれらを消去し、共有パラメータについての小さな連立方程式だけを残します。これはまさにバンドル調整を実行可能にする技法です（[第 05 回]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})）。キャリブレーションは、3 次元構造が既知の小さなバンドル調整*そのもの*なのです。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-residuals.svg" caption="648 個すべてのコーナーの再投影残差（検出されたコーナーからモデルの予測へ向かう矢印）。(a) 閉形式解の後、歪みモデルなし：一貫した放射状のパターンで、RMS 4.06 ピクセル、画像の隅では最大 12.7 ピクセル。8 倍に拡大。(b) 歪みを含めた LM の後：構造は残っておらず、RMS 0.40 ピクセル。100 倍に拡大。ランダムに見える残差はよいモデルの必要条件（十分条件ではない）であり、パターンが残っていればモデルに何かが欠けています。" %}

### 4.3 OpenCV との照合

`cv2.calibrateCamera` は同じパイプライン（Zhang の初期化、その後 LM）を実装しています。同じ検出結果を与えれば、同じ答えを返すはずです。

```python
import cv2

obj_pts = [obj.astype(np.float32)] * len(obs)
img_pts = [o.astype(np.float32).reshape(-1, 1, 2) for o in obs]
rms, K_cv, d_cv, rvecs, tvecs, std_int, std_ext, per_view = cv2.calibrateCameraExtended(
    obj_pts, img_pts, (W, H), None, None)
print("OpenCV: rms %.4f px" % rms)
print("  fx fy cx cy:", np.round([K_cv[0, 0], K_cv[1, 1], K_cv[0, 2], K_cv[1, 2]], 2))
print("  k1 k2 p1 p2 k3:", np.round(d_cv.ravel(), 4))
print("  std of fx fy cx cy:", np.round(std_int.ravel()[:4], 3))
r = residuals(p_opt, obs)
print("ours:   rms %.4f px (same definition: sqrt(sum |e|^2 / #corners))" % np.sqrt(r @ r / n_corners))
```

```text
OpenCV: rms 0.4036 px
  fx fy cx cy: [601.06 596.97 325.19 235.49]
  k1 k2 p1 p2 k3: [-0.2806  0.0914  0.     -0.0005 -0.0526]
  std of fx fy cx cy: [1.897 1.877 2.363 1.959]
ours:   rms 0.4036 px (same definition: sqrt(sum |e|^2 / #corners))
```

表示されたすべての桁が一致します。OpenCV が返す「RMS」の定義に注意してください。*コーナーごと*（座標ごとではなく）の二乗誤差和の平方根です。最後の行の標準偏差が次の節の主題です。

## 5. キャリブレーションはどれくらい良いのか

### 5.1 RMS 再投影誤差がわかること、わからないこと

誰もが RMS 誤差を報告し、誰もが「0.40 ピクセル」を「0.4 ピクセルの精度」と読みたくなります。しかしそれはパラメータの精度でも、後で計算するものの精度でもありません。当てはめた**後**に残った部分の大きさであり、その期待値はノイズで決まります。

$$
\mathbb E\big[\text{RMS}^2\big] = \frac{2\sigma^2 (2M - P)}{2M}, \qquad M = nN \text{ 個のコーナー},\ P = 9 + 6N \text{ 個のパラメータ}.
$$

（$2M$ 個の座標はそれぞれ分散 $\sigma^2$ を持ち、$P$ 個のパラメータの当てはめがそのうち $P$ 個の自由度を吸収します。）私たちの場合 $\sqrt{2\cdot 0.09\cdot 1215/1296} = 0.411$ ピクセルで、実際は 0.404 でした。つまり完璧なキャリブレーションの RMS はゼロでは*なく* $\sqrt 2\,\sigma$ 程度であり、悪いキャリブレーションでも RMS が低いことがあります。

- 画像が少ないと、余分なパラメータがノイズに当てはまります（過学習）。RMS は下がり、精度も下がります。
- RMS はコーナーがあった場所の誤差しか測りません。ボードがすべて画像中央にあれば、画像の隅は純粋な外挿です（5.3 節）。
- 誤ったモデル（たとえば歪み項が少なすぎる）は、RMS が $\sqrt 2\,\sigma$ を上回ること、*そして*残差に構造が現れること（上の図の (a)）として現れます。

逆に、この式からノイズの推定値 $\hat\sigma^2 = \lVert\mathbf r\rVert^2/(2M - P)$ が得られ、次に使います。

### 5.2 パラメータの不確かさ：$\Sigma = \sigma^2 (J^\top J)^{-1}$

解 $\hat{\mathbf p}$ の近くでは、残差は摂動に対して線形です。$\mathbf r(\hat{\mathbf p} + \boldsymbol\delta) \approx \hat{\mathbf r} + J\boldsymbol\delta$。では、検出のノイズ $\boldsymbol\varepsilon$ が変わると推定値はどう動くでしょうか。線形化した問題の最小二乗解は $\boldsymbol\delta = -(J^\top J)^{-1}J^\top\boldsymbol\varepsilon$ です。$\mathrm{Cov}(\boldsymbol\varepsilon) = \sigma^2 I$ とすると

$$
\Sigma_{\mathbf p} = \mathrm{Cov}(\boldsymbol\delta) = (J^\top J)^{-1}J^\top(\sigma^2 I)J(J^\top J)^{-1} = \sigma^2 (J^\top J)^{-1}.
$$

これはガウスノイズのもとでの推定値の共分散（1 次近似）です。対角成分は各パラメータの標準偏差を与え、非対角成分はどのパラメータ同士がトレードオフの関係にあるかを示します。最後の LM 反復で $J$ はすでに手元にあるので、ほとんどコストはかかりません。OpenCV では `calibrateCameraExtended` の `stdDeviationsIntrinsics` がこれです。

```python
def covariance(p, J, free, observations):
    """Linearized covariance sigma^2 (J^T J)^-1 of all parameters (zero rows for fixed ones)."""
    r = residuals(p, observations)
    sigma2 = r @ r / (J.shape[0] - J.shape[1])    # unbiased noise variance per coordinate
    Cov = np.zeros((len(p), len(p)))
    Cov[np.ix_(free, free)] = sigma2 * np.linalg.inv(J.T @ J)
    return Cov, np.sqrt(sigma2)

Cov, sigma_hat = covariance(p_opt, J, free, obs)
std = np.sqrt(np.diag(Cov))
truth = np.r_[K_true[0, 0], K_true[1, 1], K_true[0, 2], K_true[1, 2], dist_true]
print("sigma_hat = %.3f px (true %.1f)" % (sigma_hat, sigma))
for k, name in enumerate(["fx", "fy", "cx", "cy", "k1", "k2", "p1", "p2", "k3"]):
    print("%-2s %9.4f +- %.4f  (true %8.4f, error %+.1f sigma)"
          % (name, p_opt[k], std[k], truth[k], (p_opt[k] - truth[k]) / std[k]))
corr = Cov[:9, :9] / np.outer(std[:9], std[:9])
print("corr(fx, fy) = %.2f  corr(k1, k2) = %.2f  corr(k2, k3) = %.2f" % (corr[0, 1], corr[4, 5], corr[5, 8]))
```

```text
sigma_hat = 0.295 px (true 0.3)
fx  601.0563 +- 1.8972  (true 600.0000, error +0.6 sigma)
fy  596.9735 +- 1.8765  (true 596.0000, error +0.5 sigma)
cx  325.1882 +- 2.3631  (true 322.0000, error +1.3 sigma)
cy  235.4898 +- 1.9589  (true 236.0000, error -0.3 sigma)
k1   -0.2806 +- 0.0104  (true  -0.2800, error -0.1 sigma)
k2    0.0914 +- 0.0564  (true   0.0700, error +0.4 sigma)
p1    0.0000 +- 0.0003  (true   0.0008, error -2.3 sigma)
p2   -0.0005 +- 0.0003  (true  -0.0005, error -0.1 sigma)
k3   -0.0526 +- 0.0949  (true   0.0000, error -0.6 sigma)
corr(fx, fy) = 0.99  corr(k1, k2) = -0.95  corr(k2, k3) = -0.98
```

読み方：

- どの推定値も共分散が予言する範囲にあります。誤差は標準偏差の 0.1〜1.3 倍で、ひとつだけ 2.3 倍（$p_1$）です。パラメータが 9 つあれば、そのうちひとつが $2\sigma$ を超えることは約 3 回に 1 回起こります（$1 - 0.954^9 \approx 0.35$）。
- $f_x$ は $\pm 1.9$ ピクセル（0.3%）、主点は $\pm 2$ ピクセルの精度です。小さなボードで 12 枚撮った場合としては典型的な値です。画像あたりのコーナー数、画像枚数を増やし、ノイズを減らせば、これらの値はおおよそ $1/\sqrt{\text{データ量}}$ で小さくなります。
- $f_x$ と $f_y$ の相関は 99% です。両者の*比*（画素の縦横比）はどちらか単独よりはるかに正確にわかります。両者はボードまでの距離と一緒に動きます。3.4 節の $f/Z$ の曖昧さです。
- $k_2$ と $k_3$ の相関は $-98\%$ です。観測した半径の範囲では、$k_2 r^4$ と $k_3 r^6$ はほとんど同じに見えます。個々の係数はよく決まりません（$k_3 = -0.05 \pm 0.09$）が、それらが表す歪み*関数*はデータの範囲内ではよく決まっています。

この線形の式は正しいのでしょうか。力ずくで確かめることができます。新しいノイズでキャリブレーション全体を 200 回やり直し、ばらつきを見るのです。

```python
rng_mc = np.random.default_rng(1)
clean = [project(K_true, dist_true, R, t, obj) for R, t in views]
est = []
for trial in range(200):
    pts = [(c + rng_mc.normal(0, sigma, c.shape)).astype(np.float32).reshape(-1, 1, 2) for c in clean]
    _, Kt, dt, _, _ = cv2.calibrateCamera(obj_pts, pts, (W, H), None, None)
    est.append([Kt[0, 0], Kt[1, 1], Kt[0, 2], Kt[1, 2], *dt.ravel()[:5]])
est = np.array(est)
print("Monte Carlo std   fx fy cx cy:", np.round(est[:, :4].std(axis=0), 2))
print("predicted std     fx fy cx cy:", np.round(std[:4], 2))
print("Monte Carlo std   k1 k2 k3:", np.round(est[:, [4, 5, 8]].std(axis=0), 4))
print("predicted std     k1 k2 k3:", np.round(std[[4, 5, 8]], 4))
```

```text
Monte Carlo std   fx fy cx cy: [1.85 1.84 2.36 2.15]
predicted std     fx fy cx cy: [1.9  1.88 2.36 1.96]
Monte Carlo std   k1 k2 k3: [0.01   0.0546 0.0923]
predicted std     k1 k2 k3: [0.0104 0.0564 0.0949]
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-uncertainty.svg" caption="新しいノイズによる 200 回の完全なキャリブレーション（灰色の点）、真値（赤い星）、1 回分の推定値（オレンジのひし形）、そしてその 1 回の $\sigma^2(J^\top J)^{-1}$ から得た 1$\sigma$ と 2$\sigma$ の楕円（真値を中心に描画）。左：$f_x$ 対 $f_y$、相関 0.99（モンテカルロでは 0.989）。右：$k_2$ 対 $k_3$、相関 $-0.98$（モンテカルロでは $-0.978$）。1 回のキャリブレーションからの予測は、すべてのパラメータについてモンテカルロのばらつきと約 10% 以内で一致します。" %}

予測したばらつきとシミュレーションのばらつきは約 10% 以内で一致します。つまり、モデルが正しく、ノイズがおおよそ独立なガウスであれば、1 回のキャリブレーションが自分自身の不確かさを教えてくれるのです。（検出器に系統誤差がある場合や、ボードが平らでない場合、この式は楽観的すぎます。）

### 5.3 パラメータからピクセルへ：画像のどこでモデルを信じてよいか

12 個の標準偏差は解釈しにくく、相関があるので誤解も招きます。$k_2$ が補償してくれるなら、大きな $\sigma_{k_3}$ も無害です。本当に知りたいのは、**あるピクセルを自分のキャリブレーションで光線に変換し、その光線を投影し直したとき、そのピクセルはどれだけずれうるのか**ということです。これが*投影の不確かさ*（projection uncertainty）で、AprilCal（Richardson ら 2013）や `mrcal` ツールキットの背後にある考え方です。

ピクセル $\mathbf u$ を、推定した $\hat{\boldsymbol\theta}$ で正規化光線 $\mathbf q$ へ歪み補正します。ここで内部パラメータを摂動させると、再投影されたピクセルは $G\,\delta\boldsymbol\theta$ だけ動きます。ただし $G = \partial\pi(\boldsymbol\theta, \mathbf q)/\partial\boldsymbol\theta$（$2\times 9$ 行列）です。その共分散は $G\,\Sigma_{\boldsymbol\theta}\,G^\top$ で、$\Sigma_{\boldsymbol\theta}$ は $\Sigma_{\mathbf p}$ の $9\times 9$ の内部パラメータブロックです。

微妙な点がひとつあります。$c_x$ が 1 ピクセル変わると*すべての*ピクセルが約 1 ピクセル動き、大きな誤差に見えますが、これはカメラを $1/f$ ラジアン回転させたのとほぼ同じ効果です。カメラの向きはそもそもキャリブレーションでは決まらず（ボードに対して相対的にしか定義されません）、次に行うこと（姿勢推定、三角測量）はすべてそのような回転を吸収してしまいます。そこで測る前に、摂動のうち全光線の小さな回転で説明できる部分を画像全体で取り除きます（最小二乗による射影）。`mrcal` はこの結合をより丁寧に扱っていますが、この簡略版はコードを短く保ちます。

```python
def project_ray(theta, q):
    """Pixels of normalized rays q = (x, y) (N x 2) under intrinsics theta = (fx, fy, cx, cy, k1..k3)."""
    K = np.array([[theta[0], 0, theta[2]], [0, theta[1], theta[3]], [0, 0, 1]])
    return project(K, theta[4:9], np.eye(3), np.zeros(3), np.c_[q, np.ones(len(q))])

def undistort(theta, uv, iters=50):
    """Pixels -> normalized rays by fixed-point iteration (post 01, section 3.2); NaN if it diverges."""
    q = np.c_[(uv[:, 0] - theta[2]) / theta[0], (uv[:, 1] - theta[3]) / theta[1]]
    with np.errstate(all="ignore"):
        for _ in range(iters):
            d = project_ray(theta, q)
            q = q + np.c_[(uv[:, 0] - d[:, 0]) / theta[0], (uv[:, 1] - d[:, 1]) / theta[1]]
        bad = np.linalg.norm(project_ray(theta, q) - uv, axis=1) > 1e-3
    q[bad] = np.nan
    return q

def projection_std(theta, Cov9, uv, eps=1e-6):
    """Per-pixel RMS error (px) of re-projecting the rays of uv when theta ~ N(theta_hat, Cov9),
    after removing the part of the error that a small rotation of the whole camera explains."""
    q = undistort(theta, uv)
    ok = ~np.isnan(q[:, 0])
    q = q[ok]
    base = project_ray(theta, q)
    G = np.empty((len(q), 2, 9))                  # d pixel / d theta
    for k in range(9):
        dt = np.zeros(9)
        dt[k] = eps * max(1.0, abs(theta[k]))
        G[:, :, k] = (project_ray(theta + dt, q) - base) / dt[k]
    A = np.empty((len(q), 2, 3))                  # d pixel / d (small rotation of the rays)
    for k in range(3):
        w = np.zeros(3)
        w[k] = eps
        Xr = np.c_[q, np.ones(len(q))] @ rodrigues(w).T
        A[:, :, k] = (project_ray(theta, Xr[:, :2] / Xr[:, 2:]) - base) / eps
    G, A = G.reshape(-1, 9), A.reshape(-1, 3)
    G = G - A @ np.linalg.lstsq(A, G, rcond=None)[0]    # project out the rotation directions
    out = np.full(len(uv), np.nan)
    out[ok] = np.sqrt(np.einsum("nk,kl,nl->n", G, Cov9, G).reshape(-1, 2).sum(axis=1))
    return out

gu, gv = np.meshgrid(np.linspace(4, W - 4, 81), np.linspace(4, H - 4, 61))   # an 8 px grid
grid = np.c_[gu.ravel(), gv.ravel()]
centre, corner = 30 * 81 + 40, 0                  # indices of (320, 240) and (4, 4) in the grid
central = [0, 1, 2, 3, 4, 5, 6, 11]               # views 1-7 and 12 keep the board near the centre
for label, idx, fix in (("all 12 views", range(12), False), ("central views", central, False),
                        ("central, k3 = 0", central, True)):
    ob = [obs[i] for i in idx]
    p_s, J_s, free_s, _ = calibrate(ob, fix_k3=fix)
    Cov_s, _ = covariance(p_s, J_s, free_s, ob)
    m = projection_std(p_s[:9], Cov_s[:9, :9], grid)
    print("%-16s k3 = %+.2f +- %.2f   std at centre %.2f px, at corner %.2f px"
          % (label, p_s[8], np.sqrt(Cov_s[8, 8]), m[centre], m[corner]))
```

```text
all 12 views     k3 = -0.05 +- 0.09   std at centre 0.09 px, at corner 2.97 px
central views    k3 = -1.42 +- 4.50   std at centre 0.40 px, at corner nan px
central, k3 = 0  k3 = +0.00 +- 0.00   std at centre 0.23 px, at corner 13.51 px
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-projection-uncertainty.svg" caption="投影の不確かさ $\sigma_{\mathrm{proj}}$（対数カラースケール、等高線は 0.2 ピクセルと 1 ピクセル、点は使用したコーナー）。(a) 12 ビューすべて：中心で 0.09 ピクセル、画像の大部分で 1 ピクセル未満、どのボードも届かなかった極端な隅 (4, 4) で 3 ピクセル。(b) 中央の 8 ビュー（1〜7 と 12、コーナーは中心から最大 208 ピクセル）のみ：$k_3 = -1.42 \pm 4.50$ で、データの外側では当てはめた多項式が折り返すため、画像の隅の近く（斜線部）ではモデルを逆変換することすらできません。(c) 同じビューで $k_3$ を 0 に固定：モデルは有効なままですが、隅では 13.5 ピクセルの不確かさ。(d) 3 つのマップを中心から隅への対角線に沿って見たもの。" width="92%" %}

これが本記事で最も役に立つ図です。コーナーで覆われた領域の内側では、3 つのキャリブレーションはどれも良好です。外側ではモデルは**外挿**しており、不確かさは歪み多項式の $r$ の高次のべきとともに増えます。教訓は 2 つです。

- **画像全体をコーナーで覆うこと。**特に歪みが最も大きい画面の隅と縁です。そうしなくても RMS 誤差は警告してくれません。キャリブレーション (b) の RMS は 0.414 ピクセルで、(a) の 0.404 ピクセルとほとんど同じです。
- **データが支えられないパラメータを推定しないこと。**中央のビューだけで $k_3$ を自由にすると、画像の内側で折り返す多項式ができてしまいます。通常のレンズでは $k_3 = 0$ に固定する（OpenCV：`cv2.CALIB_FIX_K3`）のが定番の対処法ですが、本当の解決策はよりよいカバー範囲です。

### 5.4 試してみよう：ボードの姿勢を選ぶ

このウィジェットは、同じカメラ、ボード、12 の姿勢（放射方向の 2 係数 $k_1, k_2$ のみ）に対して、2〜5 節のパイプライン全体をブラウザで実行します。3D ビューまたは画像内のボードをタップしてビューを追加・削除し、推定値、その標準偏差、投影の不確かさマップがどう反応するかを見てください。試してみること：

- 既定の状態（ビュー 1 と傾けた 4 ビュー 4〜7）から始め、隅のビュー 8〜11 を加えます。画像の隅の不確かさと $\sigma_{k_2}$ が急激に下がります。
- 正面向きのビュー 1〜3 だけを選びます。閉形式解が失敗し、$\sigma_{f_x}$ は約 1000 ピクセルまで跳ね上がります。これが $f/Z$ の曖昧さです。
- ノイズを大きくします。すべての $\sigma$ がノイズ $\sigma$ に比例して大きくなり、RMS は $\sqrt 2\,\sigma$ に従います。

{% include widget.liquid name="3d-vision-calibration" height="760" caption="キャリブレーション実験室。ボードの番号は本文の 12 の姿勢に対応します。表は真値、$\sigma^2(J^\top J)^{-1}$ による推定値 $\pm 1\sigma$、そして $\sigma$ を対数スケールで表すバー（大きいときは赤）を示します。画像の背景のマップは 5.3 節の投影の不確かさです（対数スケール 0.05〜10 ピクセル、灰色は当てはめたモデルが折り返す領域）。" %}

## 6. キャリブレーションターゲットとコーナー検出

### 6.1 チェッカーボードのコーナーとサブピクセル精密化

チェッカーボードのコーナーは **X 字型の交点**（X-junction）です。4 つのマスが接し、輝度は鞍点状（点のまわりに明・暗・明・暗）になっています。`cv2.findChessboardCorners`（あるいはより頑健な `findChessboardCornersSB`）のような検出器がボードを見つけ、約 1 ピクセルの精度でコーナー位置を返します。キャリブレーションを成り立たせる精度は、**サブピクセル精密化**（subpixel refinement）から来ます。

`cv2.cornerSubPix` の背後にある考え方は、美しい幾何学的事実です。$\mathbf p$ を真のコーナー、$\mathbf q$ をその近くの任意のピクセルとします。$\mathbf q$ が一様なマスの内部にあれば、画像勾配 $\mathbf g_{\mathbf q}$ はゼロです。$\mathbf q$ が 2 つのマスの間のエッジ上にあれば、勾配はエッジに垂直で、エッジは $\mathbf p$ を通るので、$\mathbf q - \mathbf p$ はエッジに*沿って*います。いずれにしても

$$
\mathbf g_{\mathbf q}^\top(\mathbf q - \mathbf p) = 0 \quad \text{（コーナー近くのすべての } \mathbf q \text{ について）}.
$$

窓 $W$ でこれらの二乗和をとり、$\mathbf p$ について微分してゼロとおくと、$2\times 2$ の連立一次方程式

$$
\Big(\sum_{\mathbf q\in W} \mathbf g_{\mathbf q}\mathbf g_{\mathbf q}^\top\Big)\,\mathbf p = \sum_{\mathbf q\in W} \mathbf g_{\mathbf q}\mathbf g_{\mathbf q}^\top\,\mathbf q
$$

が得られます。これを解き、窓を新しい $\mathbf p$ の位置に移して繰り返します。左辺の行列は Harris 検出器の構造テンソル（structure tensor）で、[第 03 回]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})で再び登場します。コーナーでは勾配が 2 方向を向くので、この行列は良条件です。

```python
from scipy.ndimage import gaussian_filter, sobel

def render_corner(c, a1, a2, n=31, ss=8, blur=1.0, noise=0.02, seed=3):
    """n x n image of a checkerboard X-junction at subpixel position c; edges at angles a1, a2 (rad).
    Each pixel integrates ss x ss samples; then optical blur and sensor noise."""
    g = (np.arange(n * ss) + 0.5) / ss - 0.5                 # sample positions, pixel centres at 0..n-1
    X, Y = np.meshgrid(g, g)
    s1 = np.sign(-np.sin(a1) * (X - c[0]) + np.cos(a1) * (Y - c[1]))
    s2 = np.sign(-np.sin(a2) * (X - c[0]) + np.cos(a2) * (Y - c[1]))
    img = 0.5 + 0.4 * s1 * s2                                 # dark 0.1, bright 0.9
    img = img.reshape(n, ss, n, ss).mean(axis=(1, 3))
    img = gaussian_filter(img, blur)
    return img + np.random.default_rng(seed).normal(0, noise, img.shape)

def saddle_pixel(img):
    """Integer corner: the most negative Hessian determinant (an X-junction is a saddle)."""
    sm = gaussian_filter(img, 1.5)
    Iyy, Ixx = np.gradient(np.gradient(sm, axis=0), axis=0), np.gradient(np.gradient(sm, axis=1), axis=1)
    Ixy = np.gradient(np.gradient(sm, axis=0), axis=1)
    det = Ixx * Iyy - Ixy**2
    det[:4], det[-4:], det[:, :4], det[:, -4:] = 0, 0, 0, 0
    y, x = np.unravel_index(np.argmin(det), det.shape)
    return np.array([x, y], float)

def refine_corner(img, p, half=5, iters=10):
    """Subpixel corner: every gradient near the corner is orthogonal to (q - p), so
    sum_q g g^T (q - p) = 0 -> solve the 2 x 2 system for p and repeat (cv2.cornerSubPix's idea)."""
    gx, gy = sobel(img, axis=1) / 8, sobel(img, axis=0) / 8
    track = [p.copy()]
    for _ in range(iters):
        xi, yi = int(round(p[0])), int(round(p[1]))
        ys, xs = np.mgrid[yi - half:yi + half + 1, xi - half:xi + half + 1]
        w = np.exp(-((xs - p[0])**2 + (ys - p[1])**2) / (2 * (half / 2)**2))
        Gx, Gy = gx[ys, xs] * w, gy[ys, xs] * w
        A = np.array([[(Gx * gx[ys, xs]).sum(), (Gx * gy[ys, xs]).sum()],
                      [(Gy * gx[ys, xs]).sum(), (Gy * gy[ys, xs]).sum()]])
        bvec = np.array([(Gx * gx[ys, xs] * xs + Gx * gy[ys, xs] * ys).sum(),
                         (Gy * gx[ys, xs] * xs + Gy * gy[ys, xs] * ys).sum()])
        p = np.linalg.solve(A, bvec)
        track.append(p.copy())
    return p, np.array(track)

c_true = np.array([15.37, 14.62])
img = render_corner(c_true, np.deg2rad(20), np.deg2rad(115))
p_int = saddle_pixel(img)
p_sub, track = refine_corner(img, p_int)
print("true %s  integer %s (error %.2f px)  refined %s (error %.3f px)" % (
    c_true, p_int, np.linalg.norm(p_int - c_true), np.round(p_sub, 3), np.linalg.norm(p_sub - c_true)))
cv_sub = cv2.cornerSubPix(img.astype(np.float32), p_int.astype(np.float32).reshape(1, 1, 2), (5, 5), (-1, -1),
                          (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 1e-4)).ravel()
print("cv2.cornerSubPix %s (error %.3f px)" % (np.round(cv_sub, 3), np.linalg.norm(cv_sub - c_true)))
```

```text
true [15.37 14.62]  integer [15. 15.] (error 0.53 px)  refined [15.373 14.668] (error 0.048 px)
cv2.cornerSubPix [15.398 14.644] (error 0.037 px)
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-subpixel.svg" caption="レンダリングしたコーナーでのサブピクセル精密化（エッジの向きは 20° と 115°、ピクセルあたり 8×8 のスーパーサンプリング、1 ピクセルの光学的ぼけ、2% のノイズ）。左：画像、窓内の勾配（青い矢印、エッジに垂直）、真のコーナー $\mathbf p^\ast=(15.37, 14.62)$、整数精度の鞍点検出 $\mathbf p_0$、$\mathbf p_{10}$ までの精密化の経路。右：誤差は約 4 回の反復で 0.53 ピクセルから 0.048 ピクセルに下がります。OpenCV の `cornerSubPix` は同じ画像で 0.037 ピクセルに達します。" %}

### 6.2 どのターゲットを使うか

| ターゲット | 検出方法 | 長所 | 短所 |
| --- | --- | --- | --- |
| チェッカーボード | X 字型交点のコーナー、勾配によるサブピクセル化 | コーナーが最も正確、どこでも使える | ボード全体が見えている必要がある（コーナーを個別に識別できない）。対称なボード（$n_x$、$n_y$ がともに奇数またはともに偶数）は向きが曖昧になる |
| 円形グリッド | ブロブの重心 | ぼけに強い | 投影された円の重心は、円の中心の投影では*ない*（透視と歪みで偏る。Heikkilä と Silvén 1997 がこれを補正） |
| ChArUco | 白いマスに ArUco マーカーを入れたチェッカーボード | 各コーナーに ID があるので部分的な可視や遮蔽でも使え、画像の隅まで埋められる | 印刷品質が必要。マーカーはデコードできるだけ大きくなければならない |
| AprilGrid（Kalibr） | AprilTag のグリッド。タグのコーナーを点とする | ID が一意で検出が頑健、Kalibr の既定のターゲット | コーナーはタグの角なので、X 字型交点よりやや精度が劣る |

識別可能なコーナーだけが部分的な可視でも使えるので、今日の単眼キャリブレーションでは **ChArUco** が最良の既定の選択です。ボードを画像の隅まで押し込むことができ、5.3 節で見たとおりそれが最も重要だからです。どれを使う場合でも、硬く**平らな**基材（ガラス、アルミ複合板）に印刷し、プリンタを信用せずにノギスでマスの大きさを**実測**してください。ボードの 1% のスケール誤差は $K$ を変えません（ボードまでの距離に吸収されます）が、キャリブレーションから計算するすべての計量的な量（ステレオの基線長、ハンドアイの並進）はその誤差を受け継ぎます。

## 7. ステレオキャリブレーションと平行化

### 7.1 2 台のカメラを一緒にキャリブレーションする

ステレオリグは、相対姿勢が固定された 2 台のカメラです。カメラ 1 で座標 $\mathbf X_1$ の点は、カメラ 2 では $\mathbf X_2 = R\mathbf X_1 + \mathbf t$ です。画像 $i$ で両方のカメラがボードを見ていて、ボードの姿勢がそれぞれ $(R_{1i}, \mathbf t_{1i})$ と $(R_{2i}, \mathbf t_{2i})$ なら、ボード上のすべての点について

$$
\mathbf X_2 = R_{2i}\mathbf X_b + \mathbf t_{2i} = R(R_{1i}\mathbf X_b + \mathbf t_{1i}) + \mathbf t
\;\Longrightarrow\;
R = R_{2i}R_{1i}^\top,\quad \mathbf t = \mathbf t_{2i} - R\,\mathbf t_{1i}.
$$

画像ごとにひとつの推定値が得られます。それらを平均して初期値とし、両カメラの内部パラメータ、$(R, \mathbf t)$、画像ごとのボード姿勢ひとつについて同時に LM を行います（2 台目のカメラのボード姿勢はここから*導かれる*ので、2 台のカメラが結びつけられます）。これが `cv2.stereoCalibrate` です。私たちの 2 台目のカメラは 12 cm 右にあり、8° 内向きに傾いていて、内部パラメータとレンズが少し異なります。

```python
# a second camera 12 cm to the right, toed in by 8 degrees (about y), with 2 degrees of tilt and 4 of roll
K2_true = np.array([[605.0, 0, 318.0], [0, 601.0, 242.0], [0, 0, 1]])
dist2_true = np.array([-0.26, 0.06, 0.0, 0.0, 0.0])
R_s = rodrigues(np.deg2rad([2.0, 8.0, 4.0]))            # camera-1 coordinates -> camera-2 coordinates
t_s = -R_s @ np.array([0.12, 0.0, 0.0])                  # camera-2 centre at (0.12, 0, 0) in camera 1
rng2 = np.random.default_rng(2)
both, obs_l, obs_r = [], [], []
for i, (R, t) in enumerate(views):
    uv2 = project(K2_true, dist2_true, R_s @ R, R_s @ t + t_s, obj)
    if (uv2 > 5).all() and (uv2[:, 0] < W - 5).all() and (uv2[:, 1] < H - 5).all():
        both.append(i)
        obs_l.append(obs[i])
        obs_r.append(uv2 + rng2.normal(0, sigma, uv2.shape))
print("views seen by both cameras:", [i + 1 for i in both])

f32 = lambda pts: [p.astype(np.float32).reshape(-1, 1, 2) for p in pts]
objs = [obj.astype(np.float32)] * len(both)
_, K1c, d1c, _, _ = cv2.calibrateCamera(objs, f32(obs_l), (W, H), None, None)
_, K2c, d2c, _, _ = cv2.calibrateCamera(objs, f32(obs_r), (W, H), None, None)
for name, flag in (("intrinsics fixed", cv2.CALIB_FIX_INTRINSIC), ("joint", cv2.CALIB_USE_INTRINSIC_GUESS)):
    rms_s, K1s, d1s, K2s, d2s, R_est, T_est, E, F = cv2.stereoCalibrate(
        objs, f32(obs_l), f32(obs_r), K1c.copy(), d1c.copy(), K2c.copy(), d2c.copy(), (W, H), flags=flag)
    ang = np.rad2deg(np.linalg.norm(cv2.Rodrigues(R_est @ R_s.T)[0]))
    print("%-16s rms %.3f px, rotation error %.2f deg, baseline %.2f mm (true 120)"
          % (name, rms_s, ang, 1000 * np.linalg.norm(T_est)))

R1, R2, P1, P2, Q, _, _ = cv2.stereoRectify(K1s, d1s, K2s, d2s, (W, H), R_est, T_est, alpha=0)
yl = cv2.undistortPoints(f32([obs_l[0]])[0], K1s, d1s, R=R1, P=P1).reshape(-1, 2)
yr = cv2.undistortPoints(f32([obs_r[0]])[0], K2s, d2s, R=R2, P=P2).reshape(-1, 2)
print("first shared view: mean |v_l - v_r| before %.2f px, after rectification %.3f px"
      % (np.abs(obs_l[0][:, 1] - obs_r[0][:, 1]).mean(), np.abs(yl[:, 1] - yr[:, 1]).mean()))
print("rectified baseline from P2: %.2f mm" % (-1000 * P2[0, 3] / P2[0, 0]))
```

```text
views seen by both cameras: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
intrinsics fixed rms 0.426 px, rotation error 0.76 deg, baseline 119.77 mm (true 120)
joint            rms 0.415 px, rotation error 0.07 deg, baseline 120.04 mm (true 120)
first shared view: mean |v_l - v_r| before 20.69 px, after rectification 0.326 px
rectified baseline from P2: 120.04 mm
```

回転誤差を見てください。各カメラの内部パラメータを別々にキャリブレーションして固定すると 0.76°、すべてを同時に精密化すると 0.07° です。理由は 5.3 節で見た結合です。主点の誤差は、そのカメラの小さな回転のように見えます。内部パラメータを固定すると、相対回転が両カメラの主点誤差を吸収しなければなりません。同時に推定すれば、共有された観測がそれらを押さえ込みます。これはステレオ深度にとって大問題です。相対ヨー角の 0.76° の誤差は、すべてのピクセルで視差を $f\cdot 0.0133 \approx 8$ ピクセルずらします。

### 7.2 平行化

対応点が**同じ画像の行**にあれば、ステレオマッチング（[第 04 回]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})）はずっと簡単になります。平行化（rectification）は、両カメラを*仮想的に*回転させる（新しい画像を撮るのではなく、再サンプリングするだけ）ことでこれを実現します。両者を同じ方向に向かせ、像面を一致させ、$x$ 軸を基線に平行にするのです。Fusiello、Trucco、Verri（2000）に従い、カメラ 1 の座標系で

$$
\mathbf e_1 = \frac{\mathbf C_2}{\lVert\mathbf C_2\rVert},\quad
\mathbf e_2 = \frac{\mathbf z\times\mathbf e_1}{\lVert\mathbf z\times\mathbf e_1\rVert},\quad
\mathbf e_3 = \mathbf e_1\times\mathbf e_2,\qquad
R_{\text{rect}} = \begin{pmatrix}\mathbf e_1^\top\\ \mathbf e_2^\top\\ \mathbf e_3^\top\end{pmatrix},
$$

とします。ここで $\mathbf C_2 = -R^\top\mathbf t$ は 2 台目のカメラの中心、$\mathbf z = (0,0,1)$ は元の光軸です。カメラ 1 を $R_{\text{rect}}$、カメラ 2 を $R_{\text{rect}}R^\top$ で回転させ、両方に同じ新しい内部パラメータ行列 $K_n$ を与えます。ピクセルは、光線へ歪み補正し、光線を回転し、$K_n$ で投影することで写されます。歪みのない画像なら、これはホモグラフィ $K_n R_{\text{rect},i} K_i^{-1}$ です。`cv2.stereoRectify` はこれらの回転と新しい投影行列を返し、`cv2.initUndistortRectifyMap` がそれを `cv2.remap` 用のルックアップテーブルに変換します。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-rectification.svg" caption="ビュー 12 の平行化。私たちの NumPy のキャリブレーションで計算しました（ステレオ姿勢はビューごとの姿勢の平均から。回転誤差 0.74°、基線長 119.40 mm）。(a) 左と (b) 右の生画像。(b) の曲線は左画像の外側の 4 コーナーのエピポーラ曲線（各コーナーの左カメラでの光線を右カメラに投影したもの）です。傾いており、レンズ歪みのためにわずかに曲がっています。(c)、(d) 平行化の後、対応する各組は 1 本の水平線上にあります。平均の垂直方向のずれは 20.71 ピクセルから 0.40 ピクセル、つまり検出ノイズの大きさにまで下がります。" %}

## 8. ハンドアイキャリブレーション：$AX = XB$

ロボットアームに付けたカメラは、それがグリッパーに対してどこにあるか、つまり固定の変換 $X = T_{gc}$（グリッパー座標系でのカメラの姿勢）がわかって初めて役に立ちます。これは定規では測れないので、キャリブレーションするしかありません。アームを $n$ か所のステーションに動かします。各ステーションでロボットはベース座標系 $\lbrace b\rbrace$ でのグリッパー姿勢 $T_{bg,i}$ を報告し、カメラは固定されたターゲットを見てその姿勢 $T_{ct,i}$ を報告します（ボードでの PnP による。第 05 回）。ターゲットは動かないので、任意の 2 つのステーション $i$、$j$ について

$$
T_{bg,i}\,X\,T_{ct,i} = T_{bt} = T_{bg,j}\,X\,T_{ct,j}
\;\Longrightarrow\;
\underbrace{T_{bg,j}^{-1}T_{bg,i}}_{A}\;X = X\;\underbrace{T_{ct,j}\,T_{ct,i}^{-1}}_{B}.
$$

$A$ はステーション間のグリッパーの運動、$B$ はカメラの運動で、$X$ が両者を結びつけます。回転と並進に分けると

$$
R_A R_X = R_X R_B, \qquad (R_A - I)\,\mathbf t_X = R_X \mathbf t_B - \mathbf t_A .
$$

**回転（Park と Martin 1994）。** $R_A = R_X R_B R_X^\top$ は、$R_A$ と $R_B$ が 2 つの座標系で見た同じ回転であることを意味するので、それらの軸角ベクトルは $\boldsymbol\alpha = R_X\boldsymbol\beta$（$\boldsymbol\alpha = \log R_A$、$\boldsymbol\beta = \log R_B$）で結ばれます。複数の運動があれば、$R_X$ は各 $\boldsymbol\beta$ を $\boldsymbol\alpha$ に最もよく揃える回転であり、これは SVD 1 回で解ける直交プロクラステス問題です。**並進。** $R_X$ がわかれば、2 番目の式は $\mathbf t_X$ について線形です。すべての運動について積み重ね、最小二乗法で解きます。

```python
def se3(R, t):
    T = np.eye(4)
    T[:3, :3], T[:3, 3] = R, t
    return T

def log_so3(R):
    return rvec_of(R)                                     # the axis-angle vector is the SO(3) logarithm

def hand_eye_park_martin(As, Bs):
    """Solve A_i X = X B_i (4 x 4 rigid motions) for X: rotation by Park & Martin (1994), then translation."""
    alpha = np.array([log_so3(A[:3, :3]) for A in As])  # rotation axes * angles of the gripper motions
    beta = np.array([log_so3(B[:3, :3]) for B in Bs])   # ... and of the camera motions; alpha_i = R_X beta_i
    U, _, Vt = np.linalg.svd(beta.T @ alpha)            # orthogonal Procrustes (Kabsch)
    D = np.diag([1, 1, np.linalg.det(Vt.T @ U.T)])
    R_X = Vt.T @ D @ U.T
    C = np.vstack([A[:3, :3] - np.eye(3) for A in As])  # (R_A - I) t_X = R_X t_B - t_A
    d = np.concatenate([R_X @ B[:3, 3] - A[:3, 3] for A, B in zip(As, Bs)])
    return se3(R_X, np.linalg.lstsq(C, d, rcond=None)[0])

rng3 = np.random.default_rng(4)
X_true = se3(rodrigues(np.deg2rad([5.0, -10.0, 90.0])), np.array([0.05, -0.03, 0.08]))   # camera in gripper
T_bt = se3(np.eye(3), np.array([0.6, 0.0, 0.0]))                                      # target in base
T_bg, T_ct = [], []
for i in range(10):                                         # ten gripper stations looking at the target
    R_g = rodrigues(np.deg2rad(rng3.uniform(-30, 30, 3))) @ rodrigues([0, np.pi, 0])
    Tg = se3(R_g, np.array([0.6, 0.0, 0.45]) + rng3.uniform(-0.1, 0.1, 3))
    Tc = np.linalg.inv(Tg @ X_true) @ T_bt                  # target pose seen by the camera (PnP in practice)
    noise = se3(rodrigues(np.deg2rad(rng3.normal(0, 0.05, 3))), rng3.normal(0, 0.0005, 3))
    T_bg.append(Tg)
    T_ct.append(Tc @ noise)
As = [np.linalg.inv(T_bg[j]) @ T_bg[i] for i in range(10) for j in range(i + 1, 10)]
Bs = [T_ct[j] @ np.linalg.inv(T_ct[i]) for i in range(10) for j in range(i + 1, 10)]
X = hand_eye_park_martin(As, Bs)
err_R = np.rad2deg(np.linalg.norm(log_so3(X[:3, :3] @ X_true[:3, :3].T)))
print("ours:   rotation error %.3f deg, translation error %.2f mm"
      % (err_R, 1000 * np.linalg.norm(X[:3, 3] - X_true[:3, 3])))
R_cv, t_cv = cv2.calibrateHandEye([T[:3, :3] for T in T_bg], [T[:3, 3] for T in T_bg],
                                  [T[:3, :3] for T in T_ct], [T[:3, 3] for T in T_ct],
                                  method=cv2.CALIB_HAND_EYE_PARK)
print("OpenCV: rotation error %.3f deg, translation error %.2f mm"
      % (np.rad2deg(np.linalg.norm(log_so3(R_cv @ X_true[:3, :3].T))), 1000 * np.linalg.norm(t_cv.ravel() - X_true[:3, 3])))
```

```text
ours:   rotation error 0.042 deg, translation error 0.73 mm
OpenCV: rotation error 0.042 deg, translation error 0.73 mm
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/02-hand-eye.svg" caption="左：設定。ロボットのベース $\lbrace b\rbrace$、4 つのグリッパーのステーション（太い座標軸）、同じ $X$ で各ステーションに取り付けられたカメラ（細い座標軸、オレンジの連結線）、固定されたターゲット $\lbrace t\rbrace$。右：100 回の試行での $X$ の誤差の中央値（カメラからターゲットへの姿勢に軸ごとに 0.05° と 0.5 mm のノイズ）とステーション数 $n$ の関係。すべての組を使用。実線：一般的な回転。回転誤差は 0.16°（$n=3$）から 0.04°（$n=20$）へ、並進誤差は 1.8 mm から 0.5 mm へ下がります。破線：すべての回転が同じ鉛直軸まわり。このとき $X$ のその軸まわりの回転は観測できず、ステーションをいくら増やしても誤差は約 90° と 100 mm 以上にとどまります。" %}

破線は古典的な失敗例を示しています。運動には**少なくとも 2 つの平行でない軸**まわりの回転が含まれていなければなりません。手首を 1 つの軸まわりにしか回さないロボット（あるいは床の上を走る移動ロボット）は、この方法ではハンドアイ変換をキャリブレーションできません。ほかの解法（Tsai と Lenz 1989、Daniilidis の双対四元数 1999。いずれも `cv2.calibrateHandEye` で使えます）は回転と並進の重み付けが異なりますが、どれもこの多様性を必要とします。変種として、カメラが世界に固定されグリッパー上のターゲットを見る場合（「アイ・トゥ・ハンド」、eye-to-hand）も役割を入れ替えて同じ式が成り立ちます。ターゲットの姿勢も同時に推定すると $AX = YB$ になります（`cv2.calibrateRobotWorldHandEye`）。

## 9. カメラ-IMU キャリブレーション

視覚慣性オドメトリ（[第 06 回]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})）や、すべての AR/VR ヘッドセットは、カメラと IMU（ジャイロスコープと加速度計）を融合しています。融合には、カメラの内部パラメータに加えて 3 つのキャリブレーション結果が必要です。

- IMU とカメラの間の**外部パラメータ**の変換 $T_{CI}$。
- 両者のクロックの**時間オフセット** $t_d$。画像のカメラタイムスタンプは、通常は露光の瞬間ではありません。
- IMU のノイズモデル（ジャイロと加速度計のノイズ密度とバイアスのランダムウォーク）。通常は長時間の静止記録から事前に測ります（アラン分散）。

**時間オフセットがなぜ重要か、数値で見てみましょう。** 頭を $\omega = 2$ rad/s（約 115°/s、ふつうの首振り）で回すとします。$t_d = 5$ ms のクロックのずれは、カメラが実際に向いていた方向から IMU が $\omega t_d = 0.01$ rad ずれた方向を想定していることを意味します。私たちのカメラでは画像中心付近で $f\,\omega\,t_d = 600 \times 0.01 = 6$ ピクセル、コーナー検出器のノイズの 15 倍です。ヘッドセットでは、仮想物体が現実世界に対して目に見えて泳ぐことになります。

**Kalibr のやり方**（Furgale、Rehder、Siegwart 2013）。センサーリグを AprilGrid の前で 1〜2 分振り、すべての回転軸と加速度軸を励起します。IMU の軌跡は $SE(3)$ 上の**連続時間 B スプライン**（continuous-time B-spline）でモデル化されるので、任意の時刻での姿勢、角速度、加速度を評価できます。そして 1 つの大きな非線形最小二乗問題で、スプライン、$T_{CI}$、$t_d$、重力、IMU のバイアスを同時に推定します。残差は、（ずらした）画像時刻でのグリッドのコーナーの再投影誤差、ジャイロの残差（測定値からスプラインの角速度を引いたもの）、加速度計の残差（測定値からスプラインの加速度と重力を引いたもの）で、それぞれノイズで重み付けされます。時間オフセットを推定可能にしているのは連続時間の表現です。ずれ $t_d$ は、画像の残差をスプライン上のどこで評価するかを動かすだけだからです。論文は、時間オフセットを IMU のサンプリング周期の数分の 1 の精度で推定できたと報告しています。実際には、まず `kalibr_calibrate_cameras` を実行し、次にノイズパラメータを書いた `imu.yaml` とともに `kalibr_calibrate_imu_camera` を実行します。Rehder ら（2016）はツールボックスを複数の IMU と IMU の内部パラメータに拡張しました。ローリングシャッターのカメラ（第 01 回 3.5 節）では、さらに画像の行とともに増える時間オフセットが必要です。

## 10. 実践チェックリスト

1. **まず光学系を固定する。** フォーカス、ズーム、絞りは内部パラメータを変えます。使うときの状態に設定し、リングをテープで固定しましょう。オートフォーカスと電子手ぶれ補正はオフにします。
2. **よいターゲットを使う。** 平らで硬く、マスの大きさを実測し、作業距離で画像のかなりの部分を占める大きさにします。可能なら ChArUco を使います。
3. **多様な姿勢を集める。** 15〜40 枚。異なる軸まわりに 30〜50° の傾き、画面のすべての隅とすべての縁へのボードの配置、作業距離の前後での距離の幅。モーションブラーを避けます（静止させるか、露光を短くする）。
4. **レンズに合ったモデルを選ぶ。** 通常のレンズは $(k_1, k_2, p_1, p_2)$、$k_3$ はカバー範囲が十分なときだけ加え、広角レンズには有理モデルや魚眼モデル（第 01 回）を使います。最高の精度が必要なら、数千のパラメータを持つ汎用モデルもあります（Schöps ら 2020）。
5. **RMS だけでなく残差を確認する。** RMS が検出器の $\sqrt 2\,\sigma$ に近い（典型的には 0.1〜0.5 ピクセル）、残差の図に空間的なパターンがない、特定の画像だけ誤差が大きいことがない（あれば除いて再キャリブレーション）。
6. **不確かさを見る。** $\sigma^2(J^\top J)^{-1}$ からの標準偏差、可能なら投影の不確かさマップ。マップが悪いところで画像を追加します。
7. **取り置いたデータで検証する。** 一部の画像でキャリブレーションし、残りの画像で再投影誤差を計算します（姿勢は PnP で推定し直す）。過学習したモデルは取り置き誤差がずっと大きくなります。
8. **状況が変わったら再キャリブレーションする。** 温度、衝撃、レンズ交換は内部パラメータを動かし、リグの外部パラメータはドリフトします。多くの製品は SLAM の中でオンラインに再キャリブレーションしています。

## 試してみよう

5.4 節のウィジェットが本記事の体験パートです。ホームページの[インタラクティブラボ]({{ '/' | relative_url }}#lab)は同じモデルの順方向を見せてくれます。どのデモもピンホールカメラで 3D コンテンツを投影しており、中心窩レンダリングのデモは、表示システムもまたキャリブレーションされていることを思い出させてくれます。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| An Algorithm for Least-Squares Estimation of Nonlinear Parameters (Marquardt) | J. SIAM | 1963 | [DOI](https://doi.org/10.1137/0111030) | あらゆるキャリブレーションソルバーの背後にある減衰の仕組み |
| A versatile camera calibration technique for high-accuracy 3D machine vision metrology using off-the-shelf TV cameras and lenses (Tsai) | IEEE J. Robotics and Automation | 1987 | [DOI](https://doi.org/10.1109/JRA.1987.1087109) | 放射歪みを含む古典的な 2 段階キャリブレーション |
| A new technique for fully autonomous and efficient 3D robotics hand/eye calibration (Tsai & Lenz) | IEEE Trans. Robotics and Automation | 1989 | [DOI](https://doi.org/10.1109/70.34770) | 最初の実用的な $AX = XB$ ソルバー |
| Robot sensor calibration: solving AX = XB on the Euclidean group (Park & Martin) | IEEE Trans. Robotics and Automation | 1994 | [DOI](https://doi.org/10.1109/70.326576) | リー群の視点、回転の閉形式最小二乗解 |
| In Defense of the Eight-Point Algorithm (Hartley) | TPAMI | 1997 | [DOI](https://doi.org/10.1109/34.601246) | 線形推定のための座標正規化 |
| A four-step camera calibration procedure with implicit image correction (Heikkilä & Silvén) | CVPR | 1997 | [DOI](https://doi.org/10.1109/CVPR.1997.609468) | 放射・接線方向の歪み、歪み補正の逆モデル、円の中心の偏りの補正 |
| On plane-based camera calibration: a general algorithm, singularities, applications (Sturm & Maybank) | CVPR | 1999 | [HAL](https://hal.archives-ouvertes.fr/inria-00525681) | 平面ベースのキャリブレーションとその退化配置 |
| Hand-eye calibration using dual quaternions (Daniilidis) | IJRR | 1999 | [DOI](https://doi.org/10.1177/02783649922066213) | 回転と並進を同時に解く |
| A Flexible New Technique for Camera Calibration (Zhang) | TPAMI | 2000 | [DOI](https://doi.org/10.1109/34.888718) | 本記事のチェッカーボード手法 |
| A compact algorithm for rectification of stereo pairs (Fusiello, Trucco & Verri) | Machine Vision and Applications | 2000 | [DOI](https://doi.org/10.1007/s001380050120) | 7.2 節の平行化 |
| AprilTag: A robust and flexible visual fiducial system (Olson) | ICRA | 2011 | [DOI](https://doi.org/10.1109/ICRA.2011.5979561) | AprilGrid ターゲットで使われるマーカー |
| Unified temporal and spatial calibration for multi-sensor systems (Furgale, Rehder & Siegwart) | IROS | 2013 | [DOI](https://doi.org/10.1109/IROS.2013.6696514) | Kalibr：時間オフセットを含む連続時間のカメラ-IMU キャリブレーション |
| AprilCal: Assisted and repeatable camera calibration (Richardson, Strom & Olson) | IROS | 2013 | [DOI](https://doi.org/10.1109/IROS.2013.6696595) | 投影の不確かさから次のボード姿勢を提案する |
| Automatic generation and detection of highly reliable fiducial markers under occlusion (Garrido-Jurado et al.) | Pattern Recognition | 2014 | [DOI](https://doi.org/10.1016/j.patcog.2014.01.005) | ArUco マーカー、ChArUco ボードの基礎 |
| Extending Kalibr: Calibrating the extrinsics of multiple IMUs and of individual axes (Rehder et al.) | ICRA | 2016 | [DOI](https://doi.org/10.1109/ICRA.2016.7487628) | 複数 IMU と IMU の内部パラメータのキャリブレーション |
| Why Having 10,000 Parameters in Your Camera Model Is Better Than Twelve (Schöps et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1912.02908) | 汎用カメラモデルとパラメトリックモデルの偏り |
| GeoCalib: Learning Single-image Calibration with Geometric Optimization (Veicht et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2409.06704) | ターゲットなしで 1 枚の画像から内部パラメータと重力方向を推定 |

## 学習リソース

- R. Hartley、A. Zisserman、*Multiple View Geometry in Computer Vision*、第 2 版、Cambridge University Press、2004。第 4 章（DLT、正規化、ゴールドスタンダードのコスト）と第 7〜8 章（カメラ行列の推定、絶対円錐曲線の像）。
- R. Szeliski、*Computer Vision: Algorithms and Applications*、第 2 版、[szeliski.org/Book](https://szeliski.org/Book/) で無料公開。キャリブレーションと非線形最小二乗法の節。
- OpenCV のチュートリアル：[カメラキャリブレーション](https://docs.opencv.org/4.8.0/d4/d94/tutorial_camera_calibration.html)、[ChArUco の検出](https://docs.opencv.org/4.x/df/d4a/tutorial_charuco_detection.html)、[ArUco と ChArUco によるキャリブレーション](https://docs.opencv.org/4.x/da/d13/tutorial_aruco_calibration.html)。
- [mrcal](https://mrcal.secretsauce.net/uncertainty.html)：投影の不確かさとモデル差分についての優れたドキュメントを持つキャリブレーションツールキット。
- [Kalibr](https://github.com/ethz-asl/kalibr) とその[カメラ-IMU キャリブレーションの wiki](https://github.com/ethz-asl/kalibr/wiki/camera-imu-calibration)。
- [puzzlepaint/camera_calibration](https://github.com/puzzlepaint/camera_calibration)：Schöps らの汎用モデルのキャリブレーションツール。[cvg/GeoCalib](https://github.com/cvg/GeoCalib)：ターゲット不要の単一画像キャリブレーション。
- Bouguet の Camera Calibration Toolbox for Matlab。OpenCV のキャリブレーションコードの祖先で、そのドキュメントは今でもわかりやすい段階的なチュートリアルです。

## 演習

1. **スキューがゼロなら 2 枚で足りる。** 制約 $B_{12} = 0$（スキューがゼロなら $K^{-\top}K^{-1}$ の $B_{12} = 0$）を $V$ の追加の行として加え、ビュー 4 と 6 だけでキャリブレーションしてください。3 ビューの閉形式解と比較しましょう。

   <details markdown="1"><summary>ヒント</summary>

   $V$ に行 $(0, 1, 0, 0, 0, 0)$ を追加します（ほかの行とスケールが合うように重み付けする）。2 ビューで $2\cdot 2 + 1 = 5$ 式となり、$\mathbf b$ の自由度 5 に対応します。誤差は 3 ビューのときより明らかに大きくなり、2 つのビューが同じ軸まわりに傾いていれば完全に失敗するはずです。
   </details>

2. **正面向きのビューが失敗する正確な理由。** 像面に平行なボードについて、変換 $(f_x, f_y) \to \alpha (f_x, f_y)$、すべてのビューで $t_{z,i} \to \alpha t_{z,i}$、$k_1 \to \alpha^2 k_1$、$k_2 \to \alpha^4 k_2$ がどの画像も変えないことを示してください。これは $J^\top J$ について何を予言しますか。

   <details markdown="1"><summary>ヒント</summary>

   正面向きのボード（光軸まわりの回転のみ）では、すべてのコーナーの奥行きが $t_z$ なので、$x = (t_z \text{ に依存しない量})/t_z$ です。$t_z$ を $\alpha$ 倍すると $x$、$y$、$r$ はすべて $1/\alpha$ 倍になります。すると上記のスケーリングのもとで $f x(1 + k_1 r^2 + k_2 r^4)$ は変わりません。厳密解の 1 パラメータ族があるということは $J$ に零ベクトルがあるということなので、$J^\top J$ は特異で、予測される $\sigma_{f_x}$ は無限大です。ウィジェットは（丸め誤差のために有限の）巨大な値を表示します。
   </details>

3. **取り置きデータによる検証。** ビュー 1〜7 と 12 でキャリブレーションし、内部パラメータを固定したまま PnP（`cv2.solvePnP`）でビュー 8〜11 の姿勢を推定して、その再投影誤差を計算してください。$k_3$ を固定した場合も繰り返します。どちらのキャリブレーションがよく汎化しますか。取り置き誤差は投影の不確かさマップと一致しますか。

   <details markdown="1"><summary>ヒント</summary>

   取り置いたコーナーは、図 (b) で不確かさが大きいか未定義の領域にちょうど位置しています。したがって $k_3$ を自由にしたモデルでは数ピクセルの取り置き誤差、$k_3 = 0$ ではそれより小さい誤差が予想され、学習に使ったビューでは約 0.4 ピクセルです。
   </details>

4. **解析的なヤコビ行列。** 前進差分の `jacobian` を、`project` の $f_x, f_y, c_x, c_y$（簡単）と $k_1, k_2$（$r^2$ を通した連鎖律）についての解析的な微分で置き換えてください。数値的なものと照合し、両者の計算時間を比べましょう。

   <details markdown="1"><summary>ヒント</summary>

   $\partial u/\partial f_x = x_d$、$\partial u/\partial c_x = 1$、$\partial u/\partial k_1 = f_x\, x\, r^2$、$\partial u/\partial k_2 = f_x\, x\, r^4$。$v$ も同様です。数値的なヤコビ行列との相対差は $10^{-5}$ 程度になるはずです。
   </details>

5. **時間オフセット。** あるヘッドセットのカメラは 30 Hz、IMU は 1000 Hz です。キャリブレーション中、最大 3 rad/s で回転させます。時間オフセットの誤差が画像中心（$f = 450$ ピクセル）で生む誤差を 0.5 ピクセル未満にしたい場合、$t_d$ はどれだけ正確にわかっている必要がありますか。

   <details markdown="1"><summary>ヒント</summary>

   画像のずれは約 $f\,\omega\,\delta t_d$ なので、$\delta t_d < 0.5/(450\cdot 3) \approx 0.37$ ms、IMU のサンプリング周期の約 3 分の 1 です。時間オフセットをタイムスタンプから読むのではなく、キャリブレーションの一部として推定する理由がここにあります。
   </details>

**次回：**[特徴点とマッチング]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})。助けてくれるチェッカーボードがないときに、任意の画像の間で点を見つけて対応づける方法です。
