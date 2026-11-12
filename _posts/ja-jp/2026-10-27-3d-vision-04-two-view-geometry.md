---
layout: post
title: "2 視点幾何：エピポーラ拘束、相対姿勢、三角測量とステレオ"
date: 2026-10-27 11:04:00+0900
description: "3D ビジョンの基礎 第 4 回：エピポーラ拘束、基本行列と基礎行列、正規化 8 点・7 点・5 点アルゴリズム、E の分解とチラリティ（cheirality）検査、中点法・線形・最適三角測量、純回転と平面の退化、そしてステレオ：平行化、視差と奥行き、ブロックマッチングとセミグローバルマッチング。"
categories: 3d-vision
tags: [epipolar-geometry, essential-matrix, fundamental-matrix, eight-point-algorithm, relative-pose, triangulation, stereo-matching, sgm]
series: 3d-vision
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 03 回]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})は対応点のリストで終わりました。ある画像の画素 $\mathbf x\_1$ と別の画像の画素 $\mathbf x\_2$ が同じシーン点だ、という組です。本稿ではこの組を幾何に変えます。静止したシーンの 2 枚の画像は 1 つの $3\times 3$ 行列で結ばれており、その行列からカメラがどう動いたかを復元し、さらに対応点の 3 次元位置を求めることができます。これは「画像から幾何へ戻る」問題の最小の完全な例であり、より大きなシステムはすべてこの上に作られています。Structure-from-Motion（SfM）は良い画像ペア 1 組から初期化し、Visual SLAM は 2 フレームから地図を立ち上げ、ステレオカメラは同時刻に撮った 2 枚の画像から深度マップを計算します。

本稿ではこの流れを一通りたどります。まず幾何です。一方の画像の点が、もう一方の画像での対応を**直線**上に制限する理由（**エピポーラ拘束**、epipolar constraint）と、それを表す 2 つの行列、校正済みカメラの**基本行列**（essential matrix）$E$ と画素座標の**基礎行列**（fundamental matrix）$F$ です。次に推定です。正規化 8 点アルゴリズム、7 点・5 点の最小解法、RANSAC によるロバストな当てはめを扱います。続いてその成果として、4 重の曖昧さを持つ $E$ からの相対姿勢と、点を**三角測量**（triangulation）する 3 つの方法を見ます。これらすべてが破綻する配置（純回転、平面シーン）も調べます。最後に**平行化されたステレオ**（rectified stereo）に特化します。ここではマッチングが画像の行に沿った 1 次元探索になり、真値が分かっている合成ステレオペアの上でブロックマッチングとセミグローバルマッチングを一から実装します。

[ニューラルレンダリング第 1 回]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})では、エピポーラ幾何、8 点アルゴリズム、三角測量を手短に紹介しました。本稿では各ステップをゆっくり進め、そこで結論だけ述べた内容を導出し、扱わなかった内容を補います。最小解法、誤差の尺度、最適三角測量、退化、密なステレオです。

## 前提知識

- [第 01 回]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})のピンホールカメラ $P = K[R \mid \mathbf t]$、同次座標、$\mathbb P^2$ の点と直線。その規約を全編で使います。OpenCV のカメラ座標系（$x$ 右、$y$ 下、$z$ 前）、画素は $\tilde{\mathbf x} = (u, v, 1)^\top$、2 点を通る直線は $\mathbf l = \tilde{\mathbf a}\times\tilde{\mathbf b}$、点が直線上にある条件は $\mathbf l^\top\tilde{\mathbf x} = 0$ です。
- [第 02 回]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})第 2 節のホモグラフィと正規化 DLT、および第 7 節のステレオ平行化。
- [第 03 回]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})第 6 節の RANSAC とその反復回数。
- 線形代数：SVD、零空間、ランク、外積、回転行列。
- Python、NumPy、SciPy。本稿のコードはすべて順番に実行すると 1 つのスクリプトになり、本文の数値はすべてそれが出力したものです。

## 1. 2 台のカメラと 1 つの点

### 1.1 記法と本稿を通しての例

世界座標系をカメラ 1 に置きます。3 次元点はカメラ 1 で座標 $\mathbf X\_1$、カメラ 2 で

$$
\mathbf X_2 = R\,\mathbf X_1 + \mathbf t
$$

を持ちます。これは第 02 回のステレオ校正と同じ規約です。したがって 2 台のカメラは

$$
P_1 = K_1\,[I \mid \mathbf 0], \qquad P_2 = K_2\,[R \mid \mathbf t]
$$

であり、カメラ 2 の中心はカメラ 1 の座標で $\mathbf C\_2 = -R^\top\mathbf t$ です（第 01 回 2.3 節：$\mathbf t$ はカメラ 2 の位置ではありません）。カメラ $i$ の画素 $\tilde{\mathbf x}\_i = (u\_i, v\_i, 1)^\top$ の**正規化座標**は

$$
\hat{\mathbf x}_i = K_i^{-1}\tilde{\mathbf x}_i = (x_i,\ y_i,\ 1)^\top
$$

で、その画素の光線がそのカメラの平面 $z = 1$ と交わる点です。$\hat{\mathbf x}\_i$ は方向でもあります。カメラ $i$ の座標系で、画素の光線は $\lbrace \lambda\,\hat{\mathbf x}\_i : \lambda > 0\rbrace$ であり、$\lambda$ が奥行きです。

本稿を通しての例は、$640\times 480$、$f = 500$ px（水平画角 65°）のカメラで 2 回撮影したものです。カメラ 2 は右に 80 cm、下に 10 cm、前に 30 cm の位置にあり、左に 10°、上に 3° 向いています。画像 1 のランダムな画素に、2〜8 m のランダムな奥行きで 240 点を置き、カメラ 2 からも見える最初の 200 点を残します。

```python
import numpy as np

np.set_printoptions(precision=4, suppress=True)


def rot(axis, deg):
    """Rotation by deg degrees about the x, y or z axis."""
    a = np.deg2rad(deg)
    c, s = np.cos(a), np.sin(a)
    i, j = {"x": (1, 2), "y": (2, 0), "z": (0, 1)}[axis]
    R = np.eye(3)
    R[i, i], R[j, j], R[i, j], R[j, i] = c, c, -s, s
    return R


def skew(v):
    """The cross-product matrix [v]_x, with skew(v) @ w == np.cross(v, w)."""
    return np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])


def hom(x):
    """N x 2 points -> N x 3 homogeneous points (u, v, 1)."""
    return np.c_[x, np.ones(len(x))]


def project(K, R, t, X):
    """Points X (N x 3, camera-1 frame) -> pixels (N x 2) of the camera with X_c = R X + t."""
    p = (X @ R.T + t) @ K.T
    return p[:, :2] / p[:, 2:]


W, H = 640, 480
K = np.array([[500.0, 0.0, 320.0], [0.0, 500.0, 240.0], [0.0, 0.0, 1.0]])
R = rot("y", 10) @ rot("x", -3)            # camera 2 turns 10 deg to the left and 3 deg up
C2 = np.array([0.8, 0.1, 0.3])             # its centre in camera-1 coordinates (metres)
t = -R @ C2                                # so that X2 = R X1 + t

rng = np.random.default_rng(0)
uv = rng.uniform([20, 20], [W - 20, H - 20], (240, 2))           # random pixels of image 1 ...
Z = rng.uniform(2.0, 8.0, 240)                                   # ... at random depths
X = (hom(uv) @ np.linalg.inv(K).T) * Z[:, None]                  # back-projected, camera-1 frame
x2 = project(K, R, t, X)
keep = np.all((x2 > 0) & (x2 < [W, H]), axis=1)                  # keep what camera 2 also sees
X, x2 = X[keep][:200], x2[keep][:200]
x1 = project(K, np.eye(3), np.zeros(3), X)                       # pixels in image 1
print(len(X), "points;  t =", t, " |t| =", round(np.linalg.norm(t), 4))
```

```text
200 points;  t = [-0.839  -0.1156 -0.151 ]  |t| = 0.8602
```

基線長は $\lVert\mathbf t\rVert = \lVert\mathbf C\_2\rVert = 0.86$ m です。$\mathbf t = (-0.839, -0.116, -0.151)$ は $-R\,\mathbf C\_2$、つまり 2 台目のカメラから見た 1 台目のカメラ中心であることに注意してください。

### 1.2 エピポーラ平面、エピポール、エピポーラ線

シーン点 $\mathbf X$ を 1 つ取ります。2 つのカメラ中心 $\mathbf C\_1$、$\mathbf C\_2$ と $\mathbf X$ は 3 点なので 1 つの平面を張ります。これが $\mathbf X$ の**エピポーラ平面**（epipolar plane）です。重要なものはすべてこの平面上にあります。

- $\mathbf C\_1$ から $\mathbf X$ を通る光線、したがって像点 $\mathbf x\_1$；
- $\mathbf C\_2$ から $\mathbf X$ を通る光線、したがって $\mathbf x\_2$；
- **基線**（baseline）、すなわち直線 $\mathbf C\_1\mathbf C\_2$。

エピポーラ平面は各画像平面と直線で交わります。これが**エピポーラ線**（epipolar line）$\mathbf l\_1$ と $\mathbf l\_2$ です。ここで推論を逆にします。$\mathbf x\_1$ しか分からないとしましょう。$\mathbf X$ の奥行きは分からないので、$\mathbf X$ は $\mathbf x\_1$ の光線上のどこにあってもかまいません。しかし光線全体がエピポーラ平面に含まれる（平面は光線と基線で張られる）ので、$\mathbf X$ がどこにあっても、そのカメラ 2 での像は $\mathbf l\_2$ 上にあります。**一方の画像の点は、もう一方の画像での対応を直線上に制限します。** これがエピポーラ拘束で、対応探索を 2 次元から 1 次元に減らします。

$\mathbf X$ が動くと、そのエピポーラ平面は本のページが背表紙の周りでめくれるように基線の周りで回転します。どのエピポーラ平面も基線を含むので、画像 2 のエピポーラ線はすべて、基線が画像平面 2 を貫く点を通ります。これが**エピポール**（epipole）$\mathbf e\_2$ で、$\mathbf C\_1$ のカメラ 2 での像です。同様に、$\mathbf C\_2$ のカメラ 1 での像 $\mathbf e\_1$ は画像 1 のすべてのエピポーラ線上にあります。1 枚の画像のエピポーラ線は、エピポールを通る**直線束**（pencil）をなします。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-epipolar-geometry.svg" caption="上：3 次元で見た本稿の例（カメラ 1 は紫、カメラ 2 は青、画像矩形は奥行き 0.9 m に描画、黒い線分が基線）。3 つのシーン点（オレンジ、赤、シアン）はそれぞれ 2 つのカメラ中心とエピポーラ三角形を張り、各三角形はその点のエピポーラ線（太い線分）に沿って両方の画像矩形を切ります。点の投影はその線上にあります。下：同じ直線を画素座標で、640×480 の画枠の外まで延長したもの。画像 1 ではすべてエピポール $\mathbf e\_1=(1653, 407)$（$\mathbf C\_2$ の像）で交わり、画像 2 ではさらに右の $\mathbf e\_2=(3099, 623)$ で交わります。カメラ 2 が主に横に動いたため、両エピポールとも画枠のはるか外にあります。" %}

図では、どちらのエピポールも画像の右のずっと遠くにあります。これは典型的です。横方向が主の運動では基線が画像平面とほぼ平行になり、遠くで画像平面を貫きます。他の場合は 3.3 節で見ます。

## 2. 基本行列

### 2.1 共面性から $E$ へ

図を方程式に変えましょう。カメラ 2 の座標系で考えます。エピポーラ平面内に、$\mathbf C\_2$（この座標系の原点）から出る 3 つのベクトルがあります。

1. $\mathbf x\_2$ の光線。方向は $\hat{\mathbf x}\_2$；
2. 基線。$\mathbf C\_2$ から $\mathbf C\_1$ へ向かい、カメラ 1 の中心はカメラ 2 の座標で $R\,\mathbf 0 + \mathbf t = \mathbf t$；
3. $\mathbf C\_1$ を通る $\mathbf x\_1$ の光線。その方向 $\hat{\mathbf x}\_1$ はカメラ 1 の座標で与えられ、カメラ 2 では $R\,\hat{\mathbf x}\_1$ になります。

3 つのベクトルが共面であるのは、スカラー三重積が 0 のときに限ります。

$$
\hat{\mathbf x}_2 \cdot \big(\mathbf t \times R\,\hat{\mathbf x}_1\big) = 0 .
$$

$\mathbf t$ との外積を行列積 $\mathbf t\times\mathbf a = [\mathbf t]\_\times\mathbf a$ で書くと、

$$
[\mathbf t]_\times = \begin{pmatrix} 0 & -t_3 & t_2 \\ t_3 & 0 & -t_1 \\ -t_2 & t_1 & 0 \end{pmatrix},
$$

条件は双線形形式になります。

$$
\boxed{\;\hat{\mathbf x}_2^\top E\, \hat{\mathbf x}_1 = 0, \qquad E = [\mathbf t]_\times R .\;}
$$

$E$ が**基本行列**で、1981 年に Longuet-Higgins が導入しました。$E$ は相対姿勢だけに依存し、シーンにも内部パラメータにも依存しません。

もう 1 つ、より代数的な導き方も一度見ておく価値があります。奥行きがどこへ消えるかが分かるからです。$\mathbf X\_1 = \lambda\_1\hat{\mathbf x}\_1$ をカメラ 2 に投影すると $\lambda\_2\hat{\mathbf x}\_2 = \lambda\_1 R\,\hat{\mathbf x}\_1 + \mathbf t$ です。両辺と $\mathbf t$ の外積を取り（最後の項が消える）、さらに $\hat{\mathbf x}\_2$ との内積を取ります（$\hat{\mathbf x}\_2\cdot(\mathbf t\times\hat{\mathbf x}\_2) = 0$ なので左辺が消える）。

$$
0 = \lambda_1\,\hat{\mathbf x}_2^\top [\mathbf t]_\times R\,\hat{\mathbf x}_1 .
$$

未知の奥行き $\lambda\_1, \lambda\_2$ は消え、2 つの像点の間だけの拘束が残りました。これが、3 次元構造を知る*前に* 2 視点幾何を推定できる理由です。

### 2.2 $E$ の性質

**自由度は 5。** $E$ には 9 個の成分がありますが、回転（3 パラメータ）と並進（3 パラメータ）から作られ、方程式 $\hat{\mathbf x}\_2^\top E\hat{\mathbf x}\_1 = 0$ は同次です。$E$（したがって $\mathbf t$）をスケールしても何も変わりません。したがって $E$ の自由度は $3 + 3 - 1 = 5$ で、**基線の長さは 2 枚の画像からは復元できません**。2 倍の大きさのシーンを 2 倍離れた 2 台のカメラで見ると、まったく同じ画像が得られます。5.4 節でこの話に戻ります。

**特異値は $(\sigma, \sigma, 0)$。** $E^\top E = R^\top [\mathbf t]\_\times^\top [\mathbf t]\_\times R$ です。任意のベクトル $\mathbf a$ について $[\mathbf t]\_\times^\top [\mathbf t]\_\times\mathbf a = -\mathbf t\times(\mathbf t\times\mathbf a) = \lVert\mathbf t\rVert^2\mathbf a - (\mathbf t^\top\mathbf a)\,\mathbf t$ なので $[\mathbf t]\_\times^\top[\mathbf t]\_\times = \lVert\mathbf t\rVert^2 I - \mathbf t\mathbf t^\top$ となり、その固有値は $\lVert\mathbf t\rVert^2$、$\lVert\mathbf t\rVert^2$（$\mathbf t$ に垂直な方向）と $0$（$\mathbf t$ の方向）です。回転 $R$ による相似変換は固有値を変えません。よって $E$ の特異値は $(\lVert\mathbf t\rVert, \lVert\mathbf t\rVert, 0)$ です。**$E$ はランク 2 で、2 つの非零特異値が等しい。** 逆に、特異値が $(\sigma, \sigma, 0)$ の $3\times 3$ 行列はすべて $[\mathbf t]\_\times R$ と分解できます（5.1 節で因子を構成します）。

**3 次の拘束。** 特異値の条件は SVD を使わずに、$E$ の成分についての多項式方程式として書けます。

$$
\det E = 0, \qquad 2\,EE^\top E - \operatorname{tr}(EE^\top)\,E = 0 .
$$

2 つ目を確かめるには $E = U\operatorname{diag}(\sigma\_1, \sigma\_2, \sigma\_3)V^\top$ と書きます。すると $EE^\top E = U\operatorname{diag}(\sigma\_i^3)V^\top$、$\operatorname{tr}(EE^\top) = \sum\_j\sigma\_j^2$ なので、この行列方程式は各 $i$ について $\sigma\_i\,(2\sigma\_i^2 - \sum\_j\sigma\_j^2) = 0$ を意味します。$(\sigma, \sigma, 0)$ なら $\sigma(2\sigma^2 - 2\sigma^2) = 0$ と $0 = 0$ です。4.4 節の 5 点アルゴリズムが解くのは、この 9 個の 3 次方程式です。

次のコードで、本稿の例について 3 つの主張をすべて確かめます。

```python
E = skew(t) @ R
Kinv = np.linalg.inv(K)
n1, n2 = hom(x1) @ Kinv.T, hom(x2) @ Kinv.T          # normalized coordinates (x, y, 1)
print("max |n2^T E n1|    : %.1e" % np.abs(np.sum(n2 * (n1 @ E.T), axis=1)).max())
print("singular values of E:", np.linalg.svd(E)[1])
print("2EE^TE - tr(EE^T)E : %.1e" % np.abs(2 * E @ E.T @ E - np.trace(E @ E.T) * E).max())
```

```text
max |n2^T E n1|    : 2.2e-16
singular values of E: [0.8602 0.8602 0.    ]
2EE^TE - tr(EE^T)E : 2.2e-16
```

どの対応点も機械精度で拘束を満たし、特異値は $(0.8602, 0.8602, 0)$ で $0.8602 = \lVert\mathbf t\rVert$、3 次の拘束も成り立っています。

## 3. 基礎行列

### 3.1 $E$ から $F$ へ

マッチングで得られるのは画素であって、正規化座標ではありません。$\hat{\mathbf x}\_i = K\_i^{-1}\tilde{\mathbf x}\_i$ を基本行列の拘束に代入すると

$$
\tilde{\mathbf x}_2^\top F\,\tilde{\mathbf x}_1 = 0, \qquad F = K_2^{-\top} E\,K_1^{-1} = K_2^{-\top}[\mathbf t]_\times R\,K_1^{-1}
$$

となります。$F$ が**基礎行列**です。同じエピポーラ幾何を画素単位で表したもので、$K\_1$ や $K\_2$ を知らなくても画素の対応から推定できます。内部パラメータが分かっていれば $E = K\_2^\top F K\_1$ で戻れます。

$F$ には幾何を直接説明するもう 1 つの形があります。$\tilde{\mathbf x}\_1$ の光線上、奥行き $\lambda\_1$ の点の像を書くと

$$
\lambda_2\tilde{\mathbf x}_2 = K_2(\lambda_1 R K_1^{-1}\tilde{\mathbf x}_1 + \mathbf t) = \lambda_1\,H_\infty\tilde{\mathbf x}_1 + \mathbf e_2,
\qquad H_\infty = K_2 R K_1^{-1},\quad \mathbf e_2 = K_2\mathbf t .
$$

$\lambda\_1$ が 0 から $\infty$ まで動くと、像は $\mathbf e\_2$（奥行き 0：カメラ 1 の中心の像）から $H\_\infty\tilde{\mathbf x}\_1$（奥行き無限大：その光線の消失点、第 01 回 1.6 節）まで動きます。エピポーラ線はこの 2 点を通る直線 $\mathbf l\_2 = \mathbf e\_2\times H\_\infty\tilde{\mathbf x}\_1$ なので、

$$
F = [\mathbf e_2]_\times H_\infty = [K_2\mathbf t]_\times K_2 R K_1^{-1}
$$

であり、これは最初の式とスケールを除いて一致します（恒等式 $[K\mathbf a]\_\times K = \det(K)\,K^{-\top}[\mathbf a]\_\times$ による）。この形は第 7 節の退化を説明するのに使います。また下のエピポーラウィジェットが描くのはまさに、エピポールから消失点までの線分と、その間の奥行きの目盛りです。

**自由度。** $F$ には 9 成分があり、スケールで 1、拘束 $\det F = 0$ でさらに 1 減ります（$[\mathbf e\_2]\_\times$ がランク 2 なので $F$ もランク 2）。**自由度は 7** です。$E$ より 2 つ多いのは、内部パラメータを知らない代償です。$F$ にはもはや等しい 2 つの特異値は要求されません。

### 3.2 画素座標でのエピポーラ線とエピポール

拘束から次のことが読み取れます。

- $\mathbf l\_2 = F\tilde{\mathbf x}\_1$ は画像 2 における $\tilde{\mathbf x}\_1$ のエピポーラ線です。$\tilde{\mathbf x}\_2^\top\mathbf l\_2 = 0$ は第 01 回の点と直線の接続条件です。
- $\mathbf l\_1 = F^\top\tilde{\mathbf x}\_2$ は画像 1 における $\tilde{\mathbf x}\_2$ のエピポーラ線です。
- $\mathbf e\_1$ はすべての $\mathbf l\_1$ 上にあります。すべての $\tilde{\mathbf x}\_2$ について $\mathbf e\_1^\top F^\top\tilde{\mathbf x}\_2 = 0$ なので $F\mathbf e\_1 = \mathbf 0$ です。エピポールは $F$ の**右零ベクトル**で、同様に $F^\top\mathbf e\_2 = \mathbf 0$、左零ベクトルです。
- 画素 $(u, v)$ と直線 $(a, b, c)$ の距離は $\lvert au + bv + c\rvert / \sqrt{a^2 + b^2}$ です。

**計算例。** 点 $\mathbf X = (0.5, -0.4, 5.0)$ m は $\mathbf x\_1 = (370, 200)$ と $\mathbf x\_2 = (375.76, 213.05)$ に投影されます。画像 2 でのエピポーラ線は、$a^2 + b^2 = 1$ となるようスケールすると $-0.1488\,u + 0.9889\,v - 154.77 = 0$ です。確認：$-0.1488\cdot 375.76 + 0.9889\cdot 213.05 - 154.77 = -55.91 + 210.68 - 154.77 = 0.00$。

```python
F = Kinv.T @ E @ Kinv
F = F / np.linalg.norm(F)


def null_vector(A):
    """Unit vector v minimizing |A v| (the last right singular vector)."""
    return np.linalg.svd(A)[2][-1]


e1 = null_vector(F)                          # F e1 = 0
e2 = null_vector(F.T)                        # F^T e2 = 0
print("e1 =", e1[:2] / e1[2], " C2 seen by camera 1:", project(K, np.eye(3), np.zeros(3), C2[None])[0])
print("e2 =", e2[:2] / e2[2], " C1 seen by camera 2:", project(K, R, t, np.zeros((1, 3)))[0])


def point_line_distance(l, x):
    """Distance (pixels) of pixel x (2,) from the homogeneous line l = (a, b, c)."""
    return abs(l @ np.append(x, 1.0)) / np.hypot(l[0], l[1])


Xp = np.array([0.5, -0.4, 5.0])               # one point, camera-1 frame
p1 = project(K, np.eye(3), np.zeros(3), Xp[None])[0]
p2 = project(K, R, t, Xp[None])[0]
l2 = F @ np.append(p1, 1.0)                  # epipolar line of p1 in image 2
l1 = F.T @ np.append(p2, 1.0)                # epipolar line of p2 in image 1
print("p1 =", p1, " p2 =", p2)
print("l2 =", l2 / np.hypot(*l2[:2]), " distance of p2: %.1e px" % point_line_distance(l2, p2))
print("l2 passes through e2:", abs(l2 @ e2) < 1e-12, "; l1 through e1:", abs(l1 @ e1) < 1e-12)
print("rank of F:", np.linalg.matrix_rank(F), " singular values:", np.linalg.svd(F)[1])
```

```text
e1 = [1653.3333  406.6667]  C2 seen by camera 1: [1653.3333  406.6667]
e2 = [3098.6624  622.7506]  C1 seen by camera 2: [3098.6624  622.7506]
p1 = [370. 200.]  p2 = [375.7571 213.0501]
l2 = [  -0.1488    0.9889 -154.7698]  distance of p2: 3.0e-14 px
l2 passes through e2: True ; l1 through e1: True
rank of F: 2  singular values: [1.     0.0014 0.    ]
```

$F$ の零ベクトルは相手カメラの中心の投影と一致し、両エピポールはエピポーラ線上にあり、$F$ はランク 2 です。特異値 $(1, 0.0014, 0)$ は $E$ と違って大きく不揃いです。画素単位では 1 と 500 程度のスケールが混在するからです。

### 3.3 運動が直線束に与える影響

エピポーラ線の並び方から、カメラがどう動いたかが分かります。

- **横方向の並進**（$R = I$、$\mathbf t$ が光軸に垂直、ここでは $x$ 方向）：基線が両方の画像平面と平行なので、エピポールは無限遠点 $\mathbf e = (1, 0, 0)^\top$ になり、エピポーラ線は平行で水平です。これは平行化されたステレオの幾何で、第 8 節で扱います。
- **前進**（$R = I$、$\mathbf t$ が $z$ 方向）：基線は光軸そのもので、エピポールは主点となり、すべてのエピポーラ線がそこを通ります。カメラが前進すると点はエピポールから放射状に遠ざかります。エピポールは**拡大焦点**（focus of expansion）、つまり進行方向の点です。
- **一般の純並進**（$R = I$、$K\_1 = K\_2$）：$F$ は $[\mathbf e]\_\times$ に比例する歪対称行列になり、$\mathbf x\_1$、$\mathbf x\_2$、エピポールは共線です。各点は自分のエピポーラ線に沿って滑ります。（演習 1。）
- **回転を含む場合**、$\mathbf x\_2$ はやはり自分のエピポーラ線上にありますが、$\mathbf x\_1$ とエピポールを結ぶ直線上にはもうありません。回転が $H\_\infty$ によって点をさらに動かすからです。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-motions.svg" caption="画像 2 のエピポーラ線 $F\tilde{\mathbf x}\_1$：奥行き 3–7 m の 14 点と、カメラ 2 の 3 種類の運動。紫の塗りつぶし：$\mathbf x\_2$。矢印付きのオレンジの白抜き：その点の画像 1 での位置。左：横方向の並進 $\mathbf C\_2=(0.5,0,0)$ m。エピポールは無限遠点 $(1,0,0)^\top$ で、エピポーラ線は水平、各点は自分の線に沿って滑ります。中：前進 $\mathbf C\_2=(0,0,0.9)$ m。すべての線がエピポール $\mathbf e\_2=(320,240)$（拡大焦点）を通り、点はそこから放射状に遠ざかります。右：本稿の例（並進と回転）。線ははるか右の $\mathbf e\_2=(3099,623)$ に収束します。" %}

### 3.4 試してみよう：エピポーラウィジェット

下のウィジェットは本稿の例で、2 つのライブビューと上面図を持ちます。ビュー 1 のオレンジの点をドラッグしてください。ビュー 2 では、対応点はオレンジの直線上にしかありません。線上の点は、選んだ画素の光線が奥行き 1、2、4、8 m で写る位置です。白抜きの丸は $H\_\infty\tilde{\mathbf x}\_1$（奥行き無限大）、黒い四角はエピポール（奥行き 0）です。次にカメラ 2 を動かしましょう。「前進」プリセットではエピポールが画像の中に入ってくるのが見え、「純回転」プリセットでは直線が 1 点に縮退します。

{% include widget.liquid name="3d-vision-epipolar" height="900" caption="エピポーラ幾何エクスプローラ。本文のカメラ（$f=500$ px、640×480）を使います。ビュー 1 のオレンジの点をドラッグするか、上面図をドラッグしてカメラ 2 を動かしてください。スライダーで $\mathbf C\_2$、カメラ 2 のヨー角とピッチ角、緑の 3 次元点の光線上の奥行きを設定できます。水色の線は $\mathbf e\_1$ と $\mathbf e\_2$ を通るエピポーラ線の束です。表示欄には $F/\lVert F\rVert$、両エピポール、$\mathbf l\_2=F\tilde{\mathbf x}\_1$、および検算値 $\tilde{\mathbf x}\_2^\top F\tilde{\mathbf x}\_1\approx 0$ が出ます。" %}

## 4. 対応点から $F$ と $E$ を推定する

### 4.1 線形 8 点アルゴリズム

各対応 $\tilde{\mathbf x}\_1 = (u\_1, v\_1, 1)$、$\tilde{\mathbf x}\_2 = (u\_2, v\_2, 1)$ は、$F$ の成分について**線形**な方程式を 1 つ与えます。

$$
\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1 = \sum_{i,j}(\tilde{\mathbf x}_2)_i\,(\tilde{\mathbf x}_1)_j\,F_{ij}
= (\tilde{\mathbf x}_2\otimes\tilde{\mathbf x}_1)^\top\mathbf f = 0 .
$$

ここで $\mathbf f$ は $F$ の行を並べたベクトル、$\otimes$ はクロネッカー積で、計画行列の 1 行は $(u\_2u\_1, u\_2v\_1, u\_2, v\_2u\_1, v\_2v\_1, v\_2, u\_1, v\_1, 1)$ です。$N$ 個の対応を積み重ねると $A\mathbf f = \mathbf 0$、$A\in\mathbb R^{N\times 9}$ となります。$F$ はスケールを除いて 8 個の未知数を持つので $N \ge 8$ 点で決まります。点が多くノイズがある場合は $\lVert\mathbf f\rVert = 1$ の下で $\lVert A\mathbf f\rVert$ を最小化し、その解は最小特異値に対応する右特異ベクトルです。第 02 回の DLT と同じです。

線形解は $\det F = 0$ を無視します。ノイズのあるデータではフルランクになり、エピポーラ線が 1 点を通らなくなります。エピポールが存在しないのです。対処法は、$F$ をフロベニウスノルムで最も近いランク 2 行列に置き換えることで、Eckart-Young の定理により最小特異値を 0 にすればよいことが分かります。

$$
F = U\operatorname{diag}(s_1, s_2, s_3)V^\top \;\longrightarrow\; F' = U\operatorname{diag}(s_1, s_2, 0)V^\top .
$$

### 4.2 正規化

生の画素で書くと、$A$ の列の大きさはまちまちです。$u\_2u\_1 \approx 10^5$ なのに最後の列は 1 です。大きな成分の小さなノイズが小さな成分をかき消し、最小特異ベクトルが不安定になります。Hartley の 1997 年の論文（"In defense of the eight-point algorithm"）は、簡単な 1 ステップでこれが解決することを示しました。各画像の点を平行移動・スケールし、重心が原点、原点からの平均距離が $\sqrt 2$ になるようにします。この座標で $\hat F$ を解き、$F = T\_2^\top\hat F T\_1$ で元に戻します（$\tilde{\mathbf x}\_2^\top F\tilde{\mathbf x}\_1 = (T\_2\tilde{\mathbf x}\_2)^\top\hat F(T\_1\tilde{\mathbf x}\_1)$ だから）。第 02 回でホモグラフィに使ったのと同じ正規化です。

データのノイズとは独立に推定の質を測るため、**エピポーラ誤差**を使います。*ノイズなし*の点 $\mathbf x\_2$ と、ノイズなしの $\mathbf x\_1$ から得た推定エピポーラ線 $F\tilde{\mathbf x}\_1$ との平均距離です。

```python
def normalize_points(x):
    """Hartley normalization: centroid to the origin, mean distance sqrt(2)."""
    c = x.mean(axis=0)
    s = np.sqrt(2) / np.linalg.norm(x - c, axis=1).mean()
    T = np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])
    return hom(x) @ T.T, T


def eight_point(x1, x2, normalize=True, rank2=True):
    """F with x2^T F x1 = 0 from N >= 8 correspondences (N x 2 pixels)."""
    if normalize:
        q1, T1 = normalize_points(x1)
        q2, T2 = normalize_points(x2)
    else:
        q1, q2, T1, T2 = hom(x1), hom(x2), np.eye(3), np.eye(3)
    A = np.einsum("ni,nj->nij", q2, q1).reshape(-1, 9)     # row n = kron(q2_n, q1_n)
    Fq = null_vector(A).reshape(3, 3)
    if rank2:                                              # closest rank-2 matrix (Frobenius)
        U, S, Vt = np.linalg.svd(Fq)
        Fq = U @ np.diag([S[0], S[1], 0.0]) @ Vt
    Fx = T2.T @ Fq @ T1                                    # undo the normalization
    return Fx / np.linalg.norm(Fx)


def sampson(F, x1, x2):
    """Sampson distance (pixels): first-order distance of each correspondence to x2^T F x1 = 0."""
    h1, h2 = hom(x1), hom(x2)
    Fx1, Ftx2 = h1 @ F.T, h2 @ F
    num = np.sum(h2 * Fx1, axis=1)
    den = Fx1[:, 0] ** 2 + Fx1[:, 1] ** 2 + Ftx2[:, 0] ** 2 + Ftx2[:, 1] ** 2
    return np.abs(num) / np.sqrt(den)


def epipolar_error(Fest, x1, x2):
    """Mean distance of the true points x2 from the estimated lines Fest x1 (noise-free x1, x2)."""
    l = hom(x1) @ Fest.T
    return np.mean(np.abs(np.sum(l * hom(x2), axis=1)) / np.hypot(l[:, 0], l[:, 1]))


rng = np.random.default_rng(1)
for sigma in (0.5, 1.0, 2.0):
    err = {"raw": [], "normalized": []}
    for trial in range(200):
        y1 = x1 + rng.normal(0, sigma, x1.shape)
        y2 = x2 + rng.normal(0, sigma, x2.shape)
        err["raw"].append(epipolar_error(eight_point(y1, y2, normalize=False), x1, x2))
        err["normalized"].append(epipolar_error(eight_point(y1, y2), x1, x2))
    print("sigma = %.1f px: epipolar error raw %.3f px, normalized %.3f px"
          % (sigma, np.median(err["raw"]), np.median(err["normalized"])))

A_raw = np.einsum("ni,nj->nij", hom(x2), hom(x1)).reshape(-1, 9)
A_nrm = np.einsum("ni,nj->nij", normalize_points(x2)[0], normalize_points(x1)[0]).reshape(-1, 9)
for name, A in (("raw", A_raw), ("normalized", A_nrm)):
    s = np.linalg.svd(A)[1]
    print("%-10s s1/s8 = %.3g" % (name, s[0] / s[7]))
```

```text
sigma = 0.5 px: epipolar error raw 0.390 px, normalized 0.109 px
sigma = 1.0 px: epipolar error raw 1.393 px, normalized 0.221 px
sigma = 2.0 px: epipolar error raw 5.544 px, normalized 0.438 px
raw        s1/s8 = 9e+04
normalized s1/s8 = 13.2
```

$\sigma = 1$ px では、生の画素によるアルゴリズムのエピポーラ線は本来の位置から 1.39 px、正規化版は 0.22 px ずれます。6 倍の差で、$\sigma = 2$ px では 13 倍に広がります。比 $s\_1/s\_8$ がその理由を示しています。$A$ の最大特異値と 8 番目の特異値（非零であるべき最後のもの）の比が $9\times 10^4$ から 13 に縮み、ノイズが零ベクトルを乱しにくくなります。正規化のコストは $3\times 3$ 行列 2 つだけです。必ず行いましょう。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-eight-point.svg" caption="左：画像 1 の真のエピポール $\mathbf e\_1=(1653,407)$（黒い四角）付近のエピポーラ線 $F^\top\tilde{\mathbf x}\_2$。2 px のノイズを加えたデータでの正規化 8 点推定です。ランク 2 化をしないと（オレンジ）、線は 2 本ずつ異なる点で交わり（オレンジの小点、$u=1490$ から $1643$ まで散らばる）、エピポールが存在しません。ランク 2 化すると（紫）、すべて 1 点、推定エピポール $(1534,390)$ を通ります。中：100 回の試行でのエピポーラ誤差の中央値とノイズ $\sigma$ の関係。生の画素（$\tilde{\mathbf x}$）と正規化座標（$T\tilde{\mathbf x}$）の比較で、$\sigma=1$ では 1.36 対 0.22 px、$\sigma=4$ では 20.4 対 0.93 px。右：最初の 7 点に対する 7 点アルゴリズムの 3 次式 $\det(\alpha F\_1+(1-\alpha)F\_2)$。3 つの実根が 3 つの候補行列を与え、真の $F$ は $\alpha=-0.68$（緑）だけです。" %}

中央の図の右端、4 px ノイズの場合は特殊ではありません。ピラミッドの粗い階層でのキーポイント誤差はこの程度です。

### 4.3 7 点と 3 次方程式

$F$ の自由度は 7 なので、7 個の対応で足りるはずです。RANSAC では最小サンプルが 1 点減るごとに効果が指数的に効いてきます（第 03 回 6.3 節）。7 行しかないとき、$A$ は 2 つの行列 $F\_1, F\_2$ が張る 2 次元の零空間を持ち、線形方程式の解はすべて $F = \alpha F\_1 + (1 - \alpha)F\_2$（スケールを除く）です。ここでランク条件を課します。

$$
\det\big(\alpha F_1 + (1 - \alpha)F_2\big) = 0 .
$$

$3\times 3$ 行列式は成分の 3 次式なので、これは **$\alpha$ の 3 次方程式**で、実根は 1 つか 3 つです。各実根は、7 点すべてに厳密に当てはまるランク 2 の基礎行列を 1 つ与えます。7 点だけではそれらを区別できず、RANSAC では各候補をすべての対応で評価します。コードでは 4 つの $\alpha$ で行列式を評価して 3 次式の係数を求めています。4 点あれば 3 次式はちょうど決まります。

```python
def seven_point(x1, x2):
    """All real fundamental matrices through exactly 7 correspondences (1 or 3 solutions)."""
    q1, T1 = normalize_points(x1)
    q2, T2 = normalize_points(x2)
    A = np.einsum("ni,nj->nij", q2, q1).reshape(-1, 9)     # 7 x 9: a 2-dimensional null space
    Vt = np.linalg.svd(A)[2]
    F1, F2 = Vt[-1].reshape(3, 3), Vt[-2].reshape(3, 3)
    a = np.array([-1.0, 0.0, 1.0, 2.0])                    # det(a F1 + (1 - a) F2) is a cubic in a:
    d = [np.linalg.det(ai * F1 + (1 - ai) * F2) for ai in a]
    coef = np.polyfit(a, d, 3)                             # four samples determine it exactly
    sols = []
    for r in np.roots(coef):
        if abs(r.imag) < 1e-8:
            Fr = T2.T @ (r.real * F1 + (1 - r.real) * F2) @ T1
            sols.append(Fr / np.linalg.norm(Fr))
    return sols, coef


sols, coef = seven_point(x1[:7], x2[:7])
print("cubic coefficients:", coef)
for Fs in sols:
    print("root: max Sampson distance over all 200 points %.2g px, |F - F_true| = %.2g"
          % (sampson(Fs, x1, x2).max(), min(np.linalg.norm(Fs - F), np.linalg.norm(Fs + F))))
```

```text
cubic coefficients: [ 0.0135 -0.0217 -0.0232 -0.0014]
root: max Sampson distance over all 200 points 62 px, |F - F_true| = 0.035
root: max Sampson distance over all 200 points 1.8e-12 px, |F - F_true| = 1.6e-15
root: max Sampson distance over all 200 points 32 px, |F - F_true| = 0.11
```

最初の 7 点では 3 次式に 3 つの実根があります。2 番目の根は真の $F$ を $10^{-15}$ の精度で再現し、200 点すべてに当てはまります。残りの 2 つは 7 つのサンプル点には完璧に合いますが、他の点では 32 px と 62 px ずれています。

### 4.4 5 点：校正済みの最小問題

$K$ が分かっている場合（SfM や SLAM ではこれが普通です）、正規化座標から $E$ を推定し、未知数は 5 つだけになります。このとき 5 個の対応で十分で、第 03 回の RANSAC の表がその利点を示しています。外れ値 70% では、8 点アルゴリズムの 70188 サンプルに対して 1893 サンプルで済みます。このアルゴリズムは難しいことで有名ですが、考え方は 7 点の場合と同じです。

1. 9 個の未知数に対する 5 本の方程式 $\hat{\mathbf x}\_2^\top E\hat{\mathbf x}\_1 = 0$ は、**4 次元の零空間**を残します。$E = xX + yY + zZ + W$ で、$X, Y, Z, W$ は基底行列、$x, y, z$ は未知のスカラーです（$W$ の係数を 1 に固定するとスケールが決まる）。
2. これを 2.2 節の 10 本の 3 次方程式（$\det E = 0$ と $2EE^\top E - \operatorname{tr}(EE^\top)E = 0$ の 9 成分）に代入すると、$x, y, z$ についての 3 次の多項式方程式が 10 本得られます。
3. この多項式系を解きます。Nistér（2004）はガウス・ジョルダン消去で変数を消去し、10 次の 1 変数多項式に帰着させました。Stewénius、Engels、Nistér（2006）はグレブナー基底と固有値問題を使いました。いずれにせよ**解は最大 10 個**（複素解は捨てる）で、実解はそれぞれ基本行列であり、残りの対応で評価します。

次のコードは 1 つ目のステップを確かめ、2 つ目がなぜ必要かを示します。

```python
A5 = np.einsum("ni,nj->nij", n2[:5], n1[:5]).reshape(-1, 9)   # 5 calibrated correspondences
basis = np.linalg.svd(A5)[2][5:]                                # 4 x 9 null-space basis
e_true = E.ravel() / np.linalg.norm(E)
print("null-space dimension:", basis.shape[0],
      " distance of the true E from it: %.1e" % np.linalg.norm(e_true - basis.T @ (basis @ e_true)))
rng = np.random.default_rng(2)
Er = (basis.T @ rng.normal(size=4)).reshape(3, 3)              # a random member of the null space
print("random member: singular values", np.linalg.svd(Er / np.linalg.norm(Er))[1])
```

```text
null-space dimension: 4  distance of the true E from it: 1.2e-15
random member: singular values [0.9374 0.3466 0.033 ]
```

真の $E$ は 4 次元の零空間に含まれます（距離 $10^{-15}$）が、この空間からランダムに取った要素の特異値は $(0.94, 0.35, 0.03)$ です。5 本のエピポーラ方程式は満たしますが、基本行列ではありません。3 次の拘束が、本当に基本行列である少数の要素を選び出します。実用のコード（OpenCV の `findEssentialMat`、PoseLib、COLMAP）は完全なソルバを実装しています。5 点法には速さ以外にも実用上の利点があります。8 点アルゴリズムと違い、すべての点が平面上にあっても有限個の解を返すのです（第 7 節）。

### 4.5 どの誤差を最小化するか

8 点アルゴリズムが最小化するのは**代数誤差** $\sum\_i(\tilde{\mathbf x}\_{2i}^\top F\tilde{\mathbf x}\_{1i})^2$ で、幾何学的な意味のない量です。座標をスケールしたり $F$ を定数倍したりすると値が変わります。RANSAC でインライアを判定したり $F$ を精密化したりするには、画素単位の距離が必要です。よく使われるものが 3 つあります。

**対称エピポーラ距離。** $\mathbf x\_2$ と $F\tilde{\mathbf x}\_1$ の距離に、$\mathbf x\_1$ と $F^\top\tilde{\mathbf x}\_2$ の距離を加えたもの：

$$
d_{\text{sym}}^2 = \frac{(\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1)^2}{(F\tilde{\mathbf x}_1)_1^2 + (F\tilde{\mathbf x}_1)_2^2} + \frac{(\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1)^2}{(F^\top\tilde{\mathbf x}_2)_1^2 + (F^\top\tilde{\mathbf x}_2)_2^2} .
$$

**ゴールドスタンダード（再投影）誤差。** 拘束を*厳密に*満たす最も近い点の組 $(\hat{\mathbf x}\_1, \hat{\mathbf x}\_2)$ を求め、$\lVert\mathbf x\_1 - \hat{\mathbf x}\_1\rVert^2 + \lVert\mathbf x\_2 - \hat{\mathbf x}\_2\rVert^2$ を測ります。ガウス性の画素ノイズの下では、これが最尤基準です。最も近い組を求めることは、6.3 節の最適三角測量そのものです。

**Sampson 距離。** 探索の要らない、ゴールドスタンダードの 1 次近似です。対応の 4 つの座標を $\mathbf p = (u\_1, v\_1, u\_2, v\_2)$ とまとめ、$\varepsilon(\mathbf p) = \tilde{\mathbf x}\_2^\top F\tilde{\mathbf x}\_1$ とします。$\varepsilon(\mathbf p + \boldsymbol\delta) = 0$ となる最小の補正 $\boldsymbol\delta$ を探します。線形化すると $\varepsilon(\mathbf p + \boldsymbol\delta) \approx \varepsilon + \nabla\varepsilon^\top\boldsymbol\delta$ で、これを 0 にする最小の $\boldsymbol\delta$ は勾配方向を向き、長さは $\lvert\varepsilon\rvert/\lVert\nabla\varepsilon\rVert$ です。勾配は簡単で、$\partial\varepsilon/\partial u\_1 = (F^\top\tilde{\mathbf x}\_2)\_1$、$\partial\varepsilon/\partial v\_1 = (F^\top\tilde{\mathbf x}\_2)\_2$、$\partial\varepsilon/\partial u\_2 = (F\tilde{\mathbf x}\_1)\_1$、$\partial\varepsilon/\partial v\_2 = (F\tilde{\mathbf x}\_1)\_2$ です。したがって

$$
d_{\text{Sampson}}^2 = \frac{(\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1)^2}{(F\tilde{\mathbf x}_1)_1^2 + (F\tilde{\mathbf x}_1)_2^2 + (F^\top\tilde{\mathbf x}_2)_1^2 + (F^\top\tilde{\mathbf x}_2)_2^2} .
$$

これが上のコードの `sampson` 関数です。拘束は $\mathbf p$ の 4 次元空間から 1 次元を取り除くので、各座標に標準偏差 $\sigma$ のガウスノイズを持つインライアでは $d\_{\text{Sampson}}^2/\sigma^2$ がおよそ自由度 1 の $\chi^2$ 分布に従い、95% のインライア閾値は $d^2 < 3.84\,\sigma^2$ です。第 03 回の表にある値です。

### 4.6 ロバスト推定

実際の対応には外れ値が含まれ、誤った対応が 1 つあるだけで最小二乗解は台無しになります。標準的な手順は、7 点ソルバ（$E$ なら 5 点ソルバ）を使う RANSAC で、残差に Sampson 距離、第 03 回の適応的な反復回数を使い、最後にコンセンサス集合で当てはめ直すものです。200 個の対応のうち 80 個（40%）の $\mathbf x\_2$ をランダムな画素に置き換えます。

```python
def ransac_fundamental(x1, x2, thresh, p=0.99, max_iters=10000, seed=0):
    """Robust F: seven-point hypotheses, Sampson inliers, adaptive iteration count, final 8-point."""
    rng = np.random.default_rng(seed)
    best = np.zeros(len(x1), bool)
    n_needed, k = max_iters, 0
    while k < n_needed:
        idx = rng.choice(len(x1), 7, replace=False)
        for Fh in seven_point(x1[idx], x2[idx])[0]:
            inl = sampson(Fh, x1, x2) < thresh
            if inl.sum() > best.sum():
                best = inl
                w = inl.mean()
                n_needed = min(max_iters, int(np.ceil(np.log(1 - p) / np.log(1 - w ** 7))))
        k += 1
    for _ in range(3):                    # refit on the consensus set, re-collect the inliers
        Fb = eight_point(x1[best], x2[best])
        best = sampson(Fb, x1, x2) < thresh
    return eight_point(x1[best], x2[best]), best, k


rng = np.random.default_rng(3)
sigma = 0.5
y1 = x1 + rng.normal(0, sigma, x1.shape)
y2 = x2 + rng.normal(0, sigma, x2.shape)
wrong = rng.choice(200, 80, replace=False)                       # 40% of the matches are wrong
y2[wrong] = rng.uniform([0, 0], [W, H], (80, 2))
is_out = np.zeros(200, bool)
is_out[wrong] = True
thresh = np.sqrt(3.84) * sigma                                  # 95% of inliers pass
F_all = eight_point(y1, y2)
F_rs, inl, iters = ransac_fundamental(y1, y2, thresh)
print("8-point on all matches: epipolar error %.2f px" % epipolar_error(F_all, x1, x2))
print("RANSAC: %d iterations, %d inliers (%d true inliers missed, %d outliers kept), error %.3f px"
      % (iters, inl.sum(), (~inl & ~is_out).sum(), (inl & is_out).sum(), epipolar_error(F_rs, x1, x2)))
```

```text
8-point on all matches: epipolar error 20.85 px
RANSAC: 783 iterations, 110 inliers (10 true inliers missed, 0 outliers kept), error 0.184 px
```

全対応に 8 点アルゴリズムを使うとエピポーラ誤差は 21 px で、役に立ちません。RANSAC は 120 個の真のインライアのうち 110 個を見つけ、外れ値は 1 つも含まず、エピポーラ誤差は 0.18 px です。必要なサンプル数は 783 で、式 $\log(1-p)/\log(1-w^7)$ が真のインライア率 $w = 0.6$ について予測する 163 より多くなっています。適応的な回数はその時点で最良のモデルのインライア率を使いますが、ノイズのある 7 点から当てはめた仮説はインライアの一部しか集められないからです。これは第 03 回で論じた式の楽観性であり、最後の当てはめ直しループがある理由でもあります。取りこぼした 10 個のインライア（8%）は、95% 閾値で予想される損失より少し多い程度です。

## 5. $E$ からの相対姿勢

### 5.1 $E$ の分解：4 つの解

$E$（5 点アルゴリズムから、あるいは $K\_2^\top F K\_1$ として）が与えられたとき、$E \sim [\mathbf t]\_\times R$ となる $R$ と $\mathbf t$ を求めます。SVD が閉形式で答えを与えます。

$$
W = \begin{pmatrix} 0 & -1 & 0 \\ 1 & 0 & 0 \\ 0 & 0 & 1 \end{pmatrix}, \qquad
Z = \begin{pmatrix} 0 & 1 & 0 \\ -1 & 0 & 0 \\ 0 & 0 & 0 \end{pmatrix}
$$

と定めると、$W$ は $z$ 軸周りの 90° 回転で、$ZW = \operatorname{diag}(1, 1, 0)$、$ZW^\top = -\operatorname{diag}(1, 1, 0)$ です。

**歪対称の部分。** $\mathbf u\_3 = \mathbf t/\lVert\mathbf t\rVert$ とし、右手系の正規直交基底 $U = (\mathbf u\_1, \mathbf u\_2, \mathbf u\_3)$ に補完します。すると $\mathbf u\_3\times\mathbf u\_1 = \mathbf u\_2$、$\mathbf u\_3\times\mathbf u\_2 = -\mathbf u\_1$、$\mathbf u\_3\times\mathbf u\_3 = \mathbf 0$ で、これはこの基底でちょうど行列 $-Z$ です。つまり $[\mathbf t]\_\times = -\lVert\mathbf t\rVert\,UZU^\top$ です。

**分解。** $E = U\operatorname{diag}(1, 1, 0)V^\top$（特異値が 1 になるようスケール）なら

$$
UZU^\top\cdot UWV^\top = UZWV^\top = U\operatorname{diag}(1,1,0)V^\top = E,
\qquad
UZU^\top\cdot UW^\top V^\top = -E .
$$

どちらの回転も符号を除いて $E$ を再現し、$E$ はもともとスケールしか決まらないので、どちらも有効です。並進は $E^\top$ の零方向（$\mathbf t^\top[\mathbf t]\_\times = \mathbf 0$ だから）、つまり $\pm\mathbf u\_3$ で、符号は分かりません。したがって**候補は 4 つ**です。

$$
(R, \mathbf t) \in \big\lbrace (UWV^\top, \mathbf u_3),\ (UWV^\top, -\mathbf u_3),\ (UW^\top V^\top, \mathbf u_3),\ (UW^\top V^\top, -\mathbf u_3)\big\rbrace .
$$

ただし $U$ と $V$ の符号は $\det U = \det V = +1$ となるように選びます（そうしないと $UWV^\top$ が鏡映になる）。

これらは何を意味するでしょうか。$\mathbf t$ の反転は、基線に沿ってどちらのカメラが「前」にあるかを入れ替えます。**基線の反転**（baseline reversal）です。2 つの回転の違いは $UW^\top V^\top(UWV^\top)^\top = UW^{\top 2}U^\top = U\operatorname{diag}(-1,-1,1)U^\top$、すなわち基線 $\mathbf u\_3$ 周りの 180° 回転です。これが**ねじれ対**（twisted pair）で、カメラ 2 が基線の周りで回されて反対側を向いています。4 つとも代数的には完璧で、決めるのは幾何です。

### 5.2 チラリティ：点はカメラの前にあるべき

4 つの配置のうち、シーンを両方のカメラの前（奥行きが正、**チラリティ**（cheirality）条件）に置くのは 1 つだけです。そこで各候補で対応点を三角測量し（第 6 節）、両方のカメラで奥行きが正になる点の数を数えます。ノイズのないデータでは数は全か無かで、ノイズや外れ値があれば最大の候補を選びます。

```python
def decompose_essential(E):
    """The four (R, t) with E ~ [t]_x R and |t| = 1."""
    U, _, Vt = np.linalg.svd(E)
    if np.linalg.det(U) < 0:
        U = -U
    if np.linalg.det(Vt) < 0:
        Vt = -Vt
    Wm = np.array([[0.0, -1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]])
    Ra, Rb, u3 = U @ Wm @ Vt, U @ Wm.T @ Vt, U[:, 2]
    return [(Ra, u3), (Ra, -u3), (Rb, u3), (Rb, -u3)]


def triangulate_dlt(P1, P2, x1, x2):
    """Linear triangulation of N correspondences; returns N x 3 points."""
    A = np.stack([x1[:, :1] * P1[2] - P1[0], x1[:, 1:] * P1[2] - P1[1],
                  x2[:, :1] * P2[2] - P2[0], x2[:, 1:] * P2[2] - P2[1]], axis=1)   # N x 4 x 4
    Xh = np.linalg.svd(A)[2][:, -1]
    return Xh[:, :3] / Xh[:, 3:]


def relative_pose(E, K, x1, x2, verbose=False):
    """Pick the decomposition of E that puts the most points in front of both cameras."""
    P1 = K @ np.c_[np.eye(3), np.zeros(3)]
    best = None
    for Rc, tc in decompose_essential(E):
        Xc = triangulate_dlt(P1, K @ np.c_[Rc, tc], x1, x2)
        n_front = np.sum((Xc[:, 2] > 0) & ((Xc @ Rc.T + tc)[:, 2] > 0))
        if verbose:
            print("  candidate: %3d of %d points in front of both cameras" % (n_front, len(x1)))
        if best is None or n_front > best[0]:
            best = (n_front, Rc, tc, Xc)
    return best[1], best[2], best[3]


def rotation_angle(Ra, Rb):
    """Angle (degrees) of the rotation Ra Rb^T."""
    return np.rad2deg(np.arccos(np.clip((np.trace(Ra @ Rb.T) - 1) / 2, -1, 1)))


def direction_angle(a, b):
    """Angle (degrees) between two vectors."""
    return np.rad2deg(np.arccos(np.clip(a @ b / np.linalg.norm(a) / np.linalg.norm(b), -1, 1)))


E_est = K.T @ F_rs @ K                       # same K in both cameras
R_est, t_est, X_est = relative_pose(E_est, K, y1[inl], y2[inl], verbose=True)
print("rotation error %.3f deg, translation direction error %.3f deg"
      % (rotation_angle(R_est, R), direction_angle(t_est, t)))
scale = np.linalg.norm(t)                    # unknown from images; borrowed from the ground truth
print("3D error after fixing the scale: %.4f m (median)"
      % np.median(np.linalg.norm(X_est * scale - X[inl], axis=1)))
```

```text
  candidate:   0 of 110 points in front of both cameras
  candidate:   0 of 110 points in front of both cameras
  candidate: 110 of 110 points in front of both cameras
  candidate:   0 of 110 points in front of both cameras
rotation error 0.118 deg, translation direction error 0.461 deg
3D error after fixing the scale: 0.0307 m (median)
```

$K$ が既知なので、$E$ は 4.6 節のロバストな $F$ から作ります。ちょうど 1 つの候補だけが 110 個のインライアすべてを両方のカメラの前に置きます。回転は 0.12°、並進の方向は 0.46° の精度で復元されます。3 次元点は $\lVert\mathbf t\rVert = 1$ となる単位で得られ、真の基線長を借りると、2〜8 m の奥行きで誤差の中央値は 3.1 cm です。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-four-poses.svg" caption="本稿の例の真の $E$ の 4 つの分解を上から見た図（$z$ は右、$x$ は下。原点のカメラ 1 は紫、候補のカメラ 2 は青で、どちらも視線方向を描画）。星はその候補で三角測量した点 $(0.5,-0.4,5.0)$ です。点がカメラの前にあれば光線を緑の実線、後ろにあれば赤の破線で描きます。タイトルは 200 点のうち両方のカメラで奥行きが正の点の数です。整合するのは 4 番目の候補だけ（200/200）で、他はカメラ 1 の後ろ、カメラ 2 の後ろ、または両方の後ろに点を置きます。" %}

### 5.3 姿勢の精密化

線形の手順（8 点、ランク 2 への射影、$E = K^\top F K$、SVD）は幾何学的な誤差を一度も最小化しておらず、5 つで足りるところを 7 つのパラメータで推定しています。短い非線形最適化で両方を解決できます。回転を回転ベクトル（3 つの数）、$\mathbf t$ の方向を 2 つの球面角（2 つの数）でパラメータ化し、Levenberg-Marquardt（第 02 回 4.2 節）で Sampson 距離を最小化します。このパラメータ化により、$E$ は自動的に基本行列の多様体上に留まります。

```python
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation


def pose_to_F(params, K):
    """Five pose parameters (rotation vector, two angles of the unit t) -> F."""
    Rp = Rotation.from_rotvec(params[:3]).as_matrix()
    th, ph = params[3:]
    tp = np.array([np.sin(th) * np.cos(ph), np.sin(th) * np.sin(ph), np.cos(th)])
    Ki = np.linalg.inv(K)
    return Ki.T @ skew(tp) @ Rp @ Ki, Rp, tp


def refine_pose(R0, t0, K, x1, x2):
    t0 = t0 / np.linalg.norm(t0)
    p0 = np.r_[Rotation.from_matrix(R0).as_rotvec(), np.arccos(t0[2]), np.arctan2(t0[1], t0[0])]
    res = least_squares(lambda p: sampson(pose_to_F(p, K)[0], x1, x2), p0, method="lm")
    return pose_to_F(res.x, K)[1:]


R_ref, t_ref = refine_pose(R_est, t_est, K, y1[inl], y2[inl])
print("refined: rotation error %.3f deg, translation direction error %.3f deg"
      % (rotation_angle(R_ref, R), direction_angle(t_ref, t)))
```

```text
refined: rotation error 0.102 deg, translation direction error 0.385 deg
```

回転誤差は 0.118° から 0.102° に、並進方向の誤差は 0.46° から 0.39° に下がります。線形推定がすでに良かったので改善は小さめですが、もっと難しいデータ（点が少ない、画角が狭い）では精密化の効果が大きくなります。実際のシステムでは、このステップはバンドル調整（bundle adjustment、[第 05 回]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})）に吸収され、姿勢と 3 次元点が同時に精密化されます。

### 5.4 誰にも見えないスケール

$\lVert\mathbf t\rVert$ は真値から借りなければなりませんでした。2 枚の画像は相対姿勢と構造を**相似変換を除いて**しか決めません。世界全体の回転と並進（カメラ 1 を原点に置くことで固定した）と、全体のスケールが 1 つ残ります。単眼 SLAM でスケールのドリフトが起こるのも、COLMAP のモデルが任意の単位になるのもこのためです。スケールは外から持ってくる必要があります。基線が校正されたステレオカメラ（第 8 節）、IMU（[第 06 回]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})）、大きさの分かっている物体、あるいは学習によるメトリック深度の事前知識（[第 07 回]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})）です。

## 6. 三角測量

2 台のカメラと 1 つの対応が与えられたとき、3 次元点はどこにあるでしょうか。ノイズがなければ 2 本の逆投影光線は交わります。ノイズがあると、互いに近くを通っても交わらない**ねじれの位置**の直線になり、「交点」を定義し直す必要があります。標準的な 3 つの答えは、何を最小化するかが違います。

### 6.1 中点法

最も直感的な答えは、2 本の光線の間の最短線分を求め、その中点を取ることです。カメラ 1 の座標で、光線は $a\,\mathbf d\_1$（$\mathbf C\_1 = \mathbf 0$ から）と $\mathbf C\_2 + b\,\mathbf d\_2$ で、$\mathbf d\_1 = K^{-1}\tilde{\mathbf x}\_1$、$\mathbf d\_2 = R^\top K^{-1}\tilde{\mathbf x}\_2$（カメラ 2 の方向をカメラ 1 に回転したもの）です。$a$ と $b$ について $\lVert a\mathbf d\_1 - \mathbf C\_2 - b\mathbf d\_2\rVert^2$ を最小化すると、微分から $2\times 2$ の正規方程式が得られます。

$$
\begin{pmatrix} \mathbf d_1^\top\mathbf d_1 & -\mathbf d_1^\top\mathbf d_2 \\ \mathbf d_1^\top\mathbf d_2 & -\mathbf d_2^\top\mathbf d_2 \end{pmatrix}
\begin{pmatrix} a \\ b \end{pmatrix} =
\begin{pmatrix} \mathbf d_1^\top\mathbf C_2 \\ \mathbf d_2^\top\mathbf C_2 \end{pmatrix},
\qquad
\hat{\mathbf X} = \tfrac12\big(a\mathbf d_1 + \mathbf C_2 + b\mathbf d_2\big).
$$

計算は軽く、両方のカメラが同程度の距離から点を見ている場合にはよく働きます。弱点は、ノイズが**画素**にあるのに**3 次元**の距離を最小化することです。1 cm のずれは、1 m 先のカメラにとっては大きな画素誤差ですが、5 m 先のカメラにとっては小さな誤差です。また校正済みの光線が必要なので、射影的な復元では使えません。

### 6.2 線形（DLT）三角測量

[ニューラルレンダリング第 1 回]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})（第 3 節）の線形法は $\tilde{\mathbf x}\_i\times P\_i\tilde{\mathbf X} = \mathbf 0$ を使います。$\mathbf p\_i^{k\top}$ を $P\_i$ の第 $k$ 行とすると、各ビューから $(u\_i\mathbf p\_i^{3\top} - \mathbf p\_i^{1\top})\tilde{\mathbf X} = 0$ と $(v\_i\mathbf p\_i^{3\top} - \mathbf p\_i^{2\top})\tilde{\mathbf X} = 0$ の 2 本の方程式が得られ、4 本を SVD で解きます。何を最小化しているのでしょうか。1 本目の方程式の残差は $\mathbf p\_i^{3\top}\tilde{\mathbf X}\,u\_i - \mathbf p\_i^{1\top}\tilde{\mathbf X} = \lambda\_i\,(u\_i - \hat u\_i)$ で、$\lambda\_i = \mathbf p\_i^{3\top}\tilde{\mathbf X}$ はカメラ $i$ での点の奥行き、$\hat u\_i$ は再投影です。つまり DLT は**奥行きで重み付けした画素誤差**を最小化します。遠いカメラの方程式ほど重く、誤差は近いカメラの画像に押しやられます。中点法と同じ偏りが、別の経路で生じているのです。

### 6.3 最適三角測量

統計的に正しい答えは再投影誤差

$$
\min_{\mathbf X}\ \lVert\mathbf x_1 - \pi_1(\mathbf X)\rVert^2 + \lVert\mathbf x_2 - \pi_2(\mathbf X)\rVert^2
$$

を最小化するもので、ガウス性の画素ノイズの下での最尤推定です。Hartley と Sturm（1997）は、これを反復なしで厳密に求める方法を見つけました。鍵は、3 次元点ではなく補正後の像点の上で探索することです。エピポーラ拘束を厳密に満たす組 $(\hat{\mathbf x}\_1, \hat{\mathbf x}\_2)$ は必ず交わる光線に逆投影されるので、問題は次と同値です。

$$
\min\ \lVert\mathbf x_1 - \hat{\mathbf x}_1\rVert^2 + \lVert\mathbf x_2 - \hat{\mathbf x}_2\rVert^2 \quad\text{subject to}\quad \hat{\mathbf x}_2^\top F\hat{\mathbf x}_1 = 0 .
$$

対応点は対応するエピポーラ線上にあります。そこで画像 1 のエピポーラ線束を 1 つの数 $\tau$ でパラメータ化します。画像 2 の対応する線は $F$ から決まります。与えられた直線上で最良の $\hat{\mathbf x}\_i$ は $\mathbf x\_i$ から下ろした垂線の足なので、コストは $\tau$ だけの関数 $d\_1(\tau)^2 + d\_2(\tau)^2$ になります。具体的には：

1. 両画像を平行移動して $\mathbf x\_1$ と $\mathbf x\_2$ を原点に置き、エピポールが $u$ 軸上の $(1, 0, f\_1)$ と $(1, 0, f\_2)$ に来るよう回転します。すると $F$ は自由な成分が $a, b, c, d$ の 4 つだけの特別な形になります。
2. 画像 1 でエピポールと点 $(0, \tau, 1)$ を通る直線の、原点からの距離の 2 乗は $d\_1^2 = \tau^2/(1 + f\_1^2\tau^2)$ です。画像 2 の相手の直線では $d\_2^2 = (c\tau + d)^2/\big((a\tau + b)^2 + f\_2^2(c\tau + d)^2\big)$ です。
3. $d\_1^2 + d\_2^2$ の導関数を 0 とおいて分母を払うと、$\tau$ の **6 次多項式**が得られます。

   $$
   g(\tau) = \tau\big((a\tau+b)^2 + f_2^2(c\tau+d)^2\big)^2 - (ad - bc)(1 + f_1^2\tau^2)^2(a\tau+b)(c\tau+d) .
   $$

4. その実根と $\tau\to\infty$ でコストを評価して最小のものを残し、垂線の足を $\hat{\mathbf x}\_1, \hat{\mathbf x}\_2$ とし、元の座標に戻して（今度は厳密に交わる）光線の交点を求めます。

結果は**射影不変**です。中点法や DLT と違い、座標の選び方に依存しません。後に Lindstrom の "Triangulation made easy"（CVPR 2010）が、6 次多項式を解かずに同じ最適解に達する短い反復法を示し、より高速な代替としてよく使われています。

```python
def triangulate_midpoint(K, R, t, x1, x2):
    """Midpoint of the shortest segment between the two back-projected rays (camera-1 frame)."""
    Ki = np.linalg.inv(K)
    d1 = hom(x1) @ Ki.T                       # ray directions from C1 = 0
    d2 = hom(x2) @ Ki.T @ R                   # ray directions of camera 2, rotated into frame 1
    c2 = -R.T @ t                             # camera-2 centre
    # minimize |a d1 - (c2 + b d2)|^2 over the ray parameters a, b (2 x 2 normal equations)
    d11, d12, d22 = (d1 * d1).sum(1), (d1 * d2).sum(1), (d2 * d2).sum(1)
    r1, r2 = d1 @ c2, d2 @ c2
    den = d11 * d22 - d12 ** 2
    a = (r1 * d22 - r2 * d12) / den
    b = (r1 * d12 - r2 * d11) / den
    return 0.5 * (a[:, None] * d1 + c2 + b[:, None] * d2)


def optimal_correction(F, x1, x2):
    """Hartley-Sturm: the closest pair (x1', x2') with x2'^T F x1' = 0, for one correspondence."""
    T1 = np.array([[1, 0, -x1[0]], [0, 1, -x1[1]], [0, 0, 1.0]])   # move both points to the origin
    T2 = np.array([[1, 0, -x2[0]], [0, 1, -x2[1]], [0, 0, 1.0]])
    Fm = np.linalg.inv(T2).T @ F @ np.linalg.inv(T1)
    e1, e2 = null_vector(Fm), null_vector(Fm.T)
    e1, e2 = e1 / np.hypot(e1[0], e1[1]), e2 / np.hypot(e2[0], e2[1])
    R1 = np.array([[e1[0], e1[1], 0], [-e1[1], e1[0], 0], [0, 0, 1]])   # epipoles to (1, 0, f)
    R2 = np.array([[e2[0], e2[1], 0], [-e2[1], e2[0], 0], [0, 0, 1]])
    Fm = R2 @ Fm @ R1.T
    f1, f2 = e1[2], e2[2]
    a, b, c, d = Fm[1, 1], Fm[1, 2], Fm[2, 1], Fm[2, 2]
    # epipolar lines through (0, t, 1) in image 1; g(t) = 0 at the stationary points of the cost
    P = np.polynomial.polynomial
    atb, ctd = np.array([b, a]), np.array([d, c])
    q = P.polyadd(P.polymul(atb, atb), f2 ** 2 * P.polymul(ctd, ctd))
    g = P.polysub(P.polymul([0, 1], P.polymul(q, q)),
                  (a * d - b * c) * P.polymul(P.polymul([1, 0, f1 ** 2], [1, 0, f1 ** 2]),
                                              P.polymul(atb, ctd)))
    cands = [r.real for r in P.polyroots(g) if abs(r.imag) < 1e-9]
    cost = lambda s: s ** 2 / (1 + f1 ** 2 * s ** 2) + (c * s + d) ** 2 / ((a * s + b) ** 2 + f2 ** 2 * (c * s + d) ** 2)
    s = min(cands, key=cost)
    if cost(s) > 1 / f1 ** 2 + c ** 2 / (a ** 2 + f2 ** 2 * c ** 2):   # the asymptote s -> infinity
        s = 1e12
    l1 = np.array([s * f1, 1, -s])
    l2 = np.array([-f2 * (c * s + d), a * s + b, c * s + d])
    foot = lambda l: np.array([-l[0] * l[2], -l[1] * l[2], l[0] ** 2 + l[1] ** 2])   # nearest point to 0
    y1 = np.linalg.inv(T1) @ R1.T @ foot(l1)
    y2 = np.linalg.inv(T2) @ R2.T @ foot(l2)
    return y1[:2] / y1[2], y2[:2] / y2[2]


def triangulate_optimal(K, R, t, x1, x2):
    """Correct each pair onto the epipolar constraint, then intersect the (now meeting) rays."""
    Ki = np.linalg.inv(K)
    Fm = Ki.T @ skew(t) @ R @ Ki
    pairs = [optimal_correction(Fm, a, b) for a, b in zip(x1, x2)]
    c1, c2 = np.array([p[0] for p in pairs]), np.array([p[1] for p in pairs])
    return triangulate_dlt(K @ np.c_[np.eye(3), np.zeros(3)], K @ np.c_[R, t], c1, c2)



def reprojection_rms(K, R, t, Xe, x1, x2):
    """RMS reprojection residual (pixels) in image 1 and in image 2."""
    r1 = project(K, np.eye(3), np.zeros(3), Xe) - x1
    r2 = project(K, R, t, Xe) - x2
    return np.sqrt(np.mean(np.sum(r1 ** 2, 1))), np.sqrt(np.mean(np.sum(r2 ** 2, 1)))


# a second pair: points 1-2 m from camera 1, camera 2 about 4-5 m away, turned 40 degrees
Ra, Ca = rot("y", 40), np.array([3.0, 0.0, -2.0])
ta = -Ra @ Ca
rng = np.random.default_rng(5)
uv = rng.uniform([200, 150], [440, 330], (200, 2))
Xa = (hom(uv) @ np.linalg.inv(K).T) * rng.uniform(1.0, 2.0, 200)[:, None]
configs = {"main pair": (R, t, X), "asymmetric": (Ra, ta, Xa)}

results = {}
for name, (Rp, tp, Xq) in configs.items():
    a1, a2 = project(K, np.eye(3), np.zeros(3), Xq), project(K, Rp, tp, Xq)
    P1, P2 = K @ np.c_[np.eye(3), np.zeros(3)], K @ np.c_[Rp, tp]
    stats = {"midpoint": [], "DLT": [], "optimal": []}
    for trial in range(20):
        o1 = a1 + rng.normal(0, 1.0, a1.shape)          # 1 px of noise in both images
        o2 = a2 + rng.normal(0, 1.0, a2.shape)
        for method, Xe in (("midpoint", triangulate_midpoint(K, Rp, tp, o1, o2)),
                           ("DLT", triangulate_dlt(P1, P2, o1, o2)),
                           ("optimal", triangulate_optimal(K, Rp, tp, o1, o2))):
            stats[method].append(reprojection_rms(K, Rp, tp, Xe, o1, o2)
                                 + (np.sqrt(np.mean(np.sum((Xe - Xq) ** 2, 1))),))
    results[name] = stats
    print(name)
    for method, v in stats.items():
        m1, m2, m3 = np.mean(v, axis=0)
        print("  %-8s residual image 1: %.3f px, image 2: %.3f px, total %.3f px; 3D RMS error %.1f mm"
              % (method, m1, m2, np.hypot(m1, m2), 1000 * m3))
```

```text
main pair
  midpoint residual image 1: 0.700 px, image 2: 0.746 px, total 1.023 px; 3D RMS error 114.1 mm
  DLT      residual image 1: 0.700 px, image 2: 0.741 px, total 1.019 px; 3D RMS error 113.6 mm
  optimal  residual image 1: 0.740 px, image 2: 0.695 px, total 1.016 px; 3D RMS error 113.6 mm
asymmetric
  midpoint residual image 1: 1.694 px, image 2: 0.519 px, total 1.772 px; 3D RMS error 16.0 mm
  DLT      residual image 1: 1.685 px, image 2: 0.521 px, total 1.764 px; 3D RMS error 16.0 mm
  optimal  residual image 1: 0.299 px, image 2: 0.941 px, total 0.988 px; 3D RMS error 15.5 mm
```

2 つの配置は異なる結果を示します。主ペアでは両方のカメラが同程度の距離から点を見ており、3 つの方法の差は 1% 以内です。**非対称ペア**では、点はカメラ 1 から 1〜2 m、カメラ 2 から 4〜5 m の位置にあります。中点法と DLT は残差のほとんどを画像 1 に押し込みます（1.69 px 対 0.52 px）。3 次元距離や奥行きで重み付けした誤差を測るため、画素の意味では近いカメラを信用しないのです。最適三角測量はノイズモデルが求めるとおりに補正を配分し、合計 RMS は 0.988 px です。この数には意味があります。観測座標は 4 つ、未知数は 3 つなので、正しいモデルの残差の 2 乗は自由度 1 で期待値 $\sigma^2$ を持ちます。$\sigma = 1$ px なら合計 RMS は約 1 px になるはずで、実際そうなっています。線形法は 1.76 px を報告します。残差が大きく膨らむため、1 px のノイズに合わせた判定（4.5 節の 95% 閾値）では本当のインライアの多くが棄却されてしまいます。3 次元精度の差はそれより小さい（16.0 mm 対 15.5 mm）ので、バンドル調整の初期値としてはどの方法でも構いませんが、SfM システムのように再投影誤差でインライアを*判定する*なら、最適法（または Lindstrom の方法）を使いましょう。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-triangulation.svg" caption="上：非対称ペアのノイズを含む 1 つの対応（1 px ノイズ）を、観測点（黒い十字）の周り ±3 px に拡大したもの。左が画像 1、右が画像 2。紫の線は対応するエピポーラ線の組で、Hartley-Sturm 法は補正後の点（緑）をこの上に置きます。中点法（シアンの三角）と DLT（オレンジの四角）の再投影はほぼ重なり、画像 1 に 1.83 px と 1.81 px、画像 2 に 0.57 px と 0.58 px の残差（合計 1.92 px と 1.90 px）を残します。一方、最適推定は 0.32 px と 1.04 px、合計 1.09 px です。下：画像ごとの RMS 残差（棒）と合計（菱形）を 200 点 × 20 回の試行で平均したもの。破線は 1 px ノイズでの合計の期待値です。左：主ペア、3 つが一致。右：非対称ペア。" %}

### 6.4 三角測量した奥行きの精度は？

最適な三角測量でも幾何の限界は超えられません。1 画素の誤差は光線を約 $\sigma/f$ の角度だけ傾け、点はもう一方の光線に沿って、その角度を光線間の**三角測量角**の正弦で割った分だけ動きます。奥行き $Z$ の点を、視線方向にほぼ垂直な基線 $b$ から見ると、三角測量角は約 $b/Z$ なので、奥行き誤差はおよそ

$$
\delta Z \approx \frac{Z^2}{f\,b}\,\delta d
$$

です。ここで $\delta d$ は 2 枚の画像間の画素差の誤差です。**奥行き誤差は距離の 2 乗で増え**、基線と焦点距離が大きいほど小さくなります。[ニューラルレンダリング第 1 回]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})には、小さな角度で三角測量誤差が急増する様子の図があります。8.2 節では、平行化したステレオペアについてこの式を厳密に導き、その量子化セルを描きます。

## 7. 退化した配置

8 点アルゴリズムは、8 個の対応で $F$ が一意に決まることを必要とします。これを不可能にするよくある状況が 2 つあり、しかも珍しい例外ではありません。三脚の上でパンするカメラ、その場で向きを変えるスマートフォン、平地の上を飛ぶドローン、壁や机に向けたカメラなどです。

### 7.1 純回転

カメラが回転するだけなら $\mathbf t = \mathbf 0$ で、$E = [\mathbf 0]\_\times R = 0$ です。基線もエピポーラ平面もエピポーラ線もありません。すべての点が、奥行きによらず同じホモグラフィで写ります。

$$
\tilde{\mathbf x}_2 \sim H_\infty\tilde{\mathbf x}_1 = K_2 R K_1^{-1}\tilde{\mathbf x}_1 .
$$

パノラマ合成はこれを使っています。奥行きはまったく復元できません。光線上のすべての点が、どちらの画像でも同じ画素に写るからです。一方、回転は完全に決まっており、$K$ が既知なら $H\_\infty$ から読み取れます。

### 7.2 平面シーン

すべての点が平面 $\mathbf n^\top\mathbf X\_1 = d$（単位法線 $\mathbf n$、距離 $d > 0$、カメラ 1 の座標）上にあれば、どの点でも $\mathbf n^\top\mathbf X\_1/d = 1$ なので

$$
\mathbf X_2 = R\mathbf X_1 + \mathbf t\,\frac{\mathbf n^\top\mathbf X_1}{d} = \Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)\mathbf X_1 ,
\qquad
H = K_2\Big(R + \frac{\mathbf t\,\mathbf n^\top}{d}\Big)K_1^{-1} .
$$

平面の 2 枚の画像は、この**平面誘導ホモグラフィ**（plane-induced homography）で結ばれます。第 02 回で平面が校正ボードだったときと同じものです。なぜこれで 8 点アルゴリズムが破綻するのでしょうか。任意のベクトル $\mathbf e$ について、行列 $F' = [\mathbf e]\_\times H$ は平面のすべての対応を満たします。

$$
\tilde{\mathbf x}_2^\top[\mathbf e]_\times H\tilde{\mathbf x}_1 \sim \tilde{\mathbf x}_2^\top[\mathbf e]_\times\tilde{\mathbf x}_2 = \tilde{\mathbf x}_2\cdot(\mathbf e\times\tilde{\mathbf x}_2) = 0 .
$$

真の $F = [\mathbf e\_2]\_\times H$ はこの族の一員です（3.1 節で $H\_\infty$ の代わりに $H$ を使ったもの。両者の差の項は $[\mathbf e\_2]\_\times$ で消える）。しかしデータからはそれを選び出せません。解は **3 次元**の線形族をなすので、$A$ の零特異値は 1 つではなく 3 つになります。純回転も $H = H\_\infty$ として同じ話です。

### 7.3 データで確かめる

```python
def make_pair(R, C2, plane=None, n_pts=200, seed=6):
    """Correspondences for camera 2 = (R, C2); points at random depths or on a plane n.X = 1."""
    rng = np.random.default_rng(seed)
    uv = rng.uniform([20, 20], [W - 20, H - 20], (n_pts, 2))
    rays = hom(uv) @ np.linalg.inv(K).T
    depth = rng.uniform(2.0, 8.0, n_pts) if plane is None else 1.0 / (rays @ plane)
    Xs = rays * depth[:, None]
    return uv, project(K, R, -R @ C2, Xs)


scenes = {
    "general": make_pair(R, C2),
    "planar": make_pair(R, C2, plane=np.array([0.05, -0.03, 0.2])),   # the plane Z = 5 - 0.25 X + 0.15 Y
    "rotation": make_pair(R, np.zeros(3)),
}
for name, (a, b) in scenes.items():
    q1, q2 = normalize_points(a)[0], normalize_points(b)[0]
    s = np.linalg.svd(np.einsum("ni,nj->nij", q2, q1).reshape(-1, 9))[1]
    print("%-8s smallest singular values of A: %s" % (name, np.array2string(s[-4:] / s[0], precision=2)))

rng = np.random.default_rng(7)
for name in ("general", "planar"):
    a, b = scenes[name]
    a, b = a + rng.normal(0, 1.0, a.shape), b + rng.normal(0, 1.0, b.shape)
    Fn = eight_point(a, b)
    Rn, tn, _ = relative_pose(K.T @ Fn @ K, K, a, b)
    print("%-8s 8-point with 1 px noise: rotation error %5.2f deg, translation error %5.1f deg"
          % (name, rotation_angle(Rn, R), direction_angle(tn, t)))
```

```text
general  smallest singular values of A: [0.2  0.09 0.08 0.  ]
planar   smallest singular values of A: [0.2 0.  0.  0. ]
rotation smallest singular values of A: [0.2 0.  0.  0. ]
general  8-point with 1 px noise: rotation error  0.14 deg, translation error   0.1 deg
planar   8-point with 1 px noise: rotation error  5.93 deg, translation error  92.3 deg
```

一般のシーンでは $A$ の零特異値はちょうど 1 つ、平面と純回転では 3 つです。1 px のノイズがあると、8 点アルゴリズムは一般のシーンで姿勢を 0.14° と 0.1° まで復元しますが、平面では族の中でたまたまノイズに最もよく合う要素を返し、「復元した」並進は 92° ずれます。ランダムな方向です。

### 7.4 退化の検出と対処

退化とはまさに**ホモグラフィ**が対応を説明できる場合なので、実用的な検査は両方のモデルを当てはめて比べることです。簡単な方法は、同じ信頼度（95%）で各モデルが受け入れる対応の数を数えることです（ホモグラフィの転送誤差 $\lVert\mathbf x\_2 - H\mathbf x\_1\rVert$ には両画像のノイズが入るので、閾値は $\sqrt{2\cdot 5.99}\,\sigma$）。

```python
def homography_dlt(x1, x2):
    """Normalized DLT for x2 ~ H x1 (as in post 02)."""
    q1, T1 = normalize_points(x1)
    q2, T2 = normalize_points(x2)
    z = np.zeros_like(q1)
    A = np.r_[np.c_[z, -q1 * q2[:, 2:], q1 * q2[:, 1:2]], np.c_[q1 * q2[:, 2:], z, -q1 * q2[:, :1]]]
    Hm = np.linalg.inv(T2) @ null_vector(A).reshape(3, 3) @ T1
    return Hm / Hm[2, 2]


def transfer(Hm, x):
    p = hom(x) @ Hm.T
    return p[:, :2] / p[:, 2:]


def inlier_ratio(x1, x2, sigma):
    """(# homography inliers) / (# fundamental-matrix inliers), both at 95% of the inliers."""
    Fm, Hm = ransac_fundamental(x1, x2, np.sqrt(3.84) * sigma)[0], homography_dlt(x1, x2)
    n_F = np.sum(sampson(Fm, x1, x2) < np.sqrt(3.84) * sigma)
    n_H = np.sum(np.linalg.norm(transfer(Hm, x1) - x2, axis=1) < np.sqrt(2 * 5.99) * sigma)
    return n_H / n_F


scenes["small baseline"] = make_pair(R, 0.03 * C2 / np.linalg.norm(C2))   # 3 cm instead of 86 cm
for name, (a, b) in scenes.items():
    r = inlier_ratio(a + rng.normal(0, 1.0, a.shape), b + rng.normal(0, 1.0, b.shape), 1.0)
    print("%-15s H/F inlier ratio %.2f" % (name, r))
```

```text
general         H/F inlier ratio 0.03
planar          H/F inlier ratio 0.98
rotation        H/F inlier ratio 0.98
small baseline  H/F inlier ratio 0.93
```

一般のシーンでは、ホモグラフィが説明する対応は $F$ の 3% にすぎませんが、平面と回転では 98% です。実用上重要なのは最後の行です。**小さな基線は退化に近い**のです。カメラが 3 cm しか動かないと、近い点と遠い点の視差がノイズを下回り、ホモグラフィが対応の 93% を説明します。次の図の右側は基線を変えて調べたものです。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-degeneracy.svg" caption="左：正規化 8 点行列 $A$ の 9 つの特異値 $s\_k$ すべて（ノイズなし、$s\_1$ に対する比。0 は $10^{-17}$ に描画）。一般のシーン（紫）、平面シーン（オレンジ）、純回転（青）。一般のシーンでは零特異値が 1 つ、退化した場合は 3 つで、解が 3 次元の族をなします。右：ホモグラフィのインライア数と基礎行列のインライア数の比を基線 $\lVert\mathbf C\_2\rVert$ に対して描いたもの（1 px ノイズ、5 シーンの平均）。ランダムな奥行き（紫）と平面（オレンジ）。一般のシーンでは比が 3 cm で 0.92、8 cm で 0.58、86 cm で 0.02 と下がり、平面ではどの基線でもほぼ 1 のままです。" %}

システムによって対処の仕方は異なります。

- **SLAM の初期化**は両方のモデルを当てはめて選びます。ORB-SLAM（Mur-Artal ら、2015）は打ち切った $\chi^2$ 残差で各モデルを採点し、$S\_H/(S\_H + S\_F) > 0.45$ ならホモグラフィを選び、シーンが平面ならそれを姿勢に分解します。どちらのモデルも決め手に欠ければ、視差が大きくなるのを待ちます。Torr の **GRIC** 基準は、モデルの複雑さに情報量規準のペナルティを課して同じ比較を行います。
- **SfM** は、対応がホモグラフィで説明できる画像ペアを平面またはパノラマとして区別し、そこから復元を初期化することを避けます。
- **ロバスト推定**：シーンが平面でなくても、支配的な平面が RANSAC をだますことがあります。主にその平面から引いたサンプルは誤った $F$ を与えますが、それでも多くのインライアを集めるからです。DEGENSAC（Chum、Werner、Matas、2005）は、7 点のうち 5 点以上がホモグラフィで結ばれたサンプルを検出し、モデルを修復します。
- **校正済みカメラ**では 5 点ソルバを使います。8 点アルゴリズムと違い、平面シーンでも有限個の姿勢候補を与えます。

純回転では、どんな方法でも奥行きは復元できません。正しい対応は、ホモグラフィから $R$ を推定し、並進が生じるのを待つことです。

## 8. ステレオ：平行化、視差、奥行き

ここまでカメラはたまたまある場所にありました。**ステレオカメラ**は 2 台目のカメラを 1 台目の隣に固定し、このペアを一度だけ校正します（第 02 回第 7 節）。すると $F$ は前もって分かっており、問いは「幾何はどうなっているか」から「各画素の奥行きはいくらか」に変わります。密なマッチングを実用的にする技法が平行化です。

### 8.1 平行化された幾何は特別な $F$

2 台のカメラが同じ $K$、同じ向きを持ち、カメラ 2 がカメラ 1 の $x$ 軸に沿って基線長 $b$ だけずれているとします。$R = I$、$\mathbf t = (-b, 0, 0)$ です。するとエピポールは無限遠点 $\mathbf e = (1, 0, 0)^\top$ となり、

$$
F \sim [\mathbf e]_\times = \begin{pmatrix} 0 & 0 & 0 \\ 0 & 0 & -1 \\ 0 & 1 & 0 \end{pmatrix},
\qquad
\tilde{\mathbf x}_2^\top F\tilde{\mathbf x}_1 = v_1 - v_2 = 0 .
$$

**エピポーラ線は画像の行で、対応点は同じ $v$ を持ちます。** 平行化は 2 台のカメラを仮想的に回転させて、任意の校正済みペアをこの形にします。第 02 回で導きました（Fusiello-Trucco-Verri の構成）。本稿の言葉で言えば、平行化は 2 枚の画像にホモグラフィ $H\_1, H\_2$ を施し、新しいペアの基礎行列は $H\_2^{-\top}FH\_1^{-1}$ になります。$\tilde{\mathbf x}\_2^\top F\tilde{\mathbf x}\_1 = (H\_2\tilde{\mathbf x}\_2)^\top H\_2^{-\top}FH\_1^{-1}(H\_1\tilde{\mathbf x}\_1)$ だからです。ペアが平行化されているのは、この行列が $[\mathbf e]\_\times$ に比例するときに限ります。本稿の例で確かめましょう。

```python
def rectify_rotation(R, t):
    """Fusiello-style rectifying rotation (post 02): new x axis along the baseline."""
    c2 = -R.T @ t                                   # camera-2 centre in camera-1 coordinates
    r1 = c2 / np.linalg.norm(c2)
    r2 = np.cross([0.0, 0.0, 1.0], r1)
    r2 /= np.linalg.norm(r2)
    return np.array([r1, r2, np.cross(r1, r2)])


Rr = rectify_rotation(R, t)
H1 = K @ Rr @ np.linalg.inv(K)                     # image 1 -> rectified image 1
H2 = K @ Rr @ R.T @ np.linalg.inv(K)               # image 2 -> rectified image 2
F_rect = np.linalg.inv(H2).T @ F @ np.linalg.inv(H1)
print("F_rect / |F_rect| =\n", np.round(F_rect / np.linalg.norm(F_rect), 4) + 0.0)
r1, r2 = transfer(H1, x1), transfer(H2, x2)
print("max |v1 - v2| after rectification: %.2e px" % np.abs(r1[:, 1] - r2[:, 1]).max())
disp = r1[:, 0] - r2[:, 0]                          # disparity d = u1 - u2
b = np.linalg.norm(t)                               # baseline
Z_rect = (X @ Rr.T)[:, 2]                           # depth in the rectified camera-1 frame
print("disparity range %.1f to %.1f px;  max |f b / d - Z| = %.2e m"
      % (disp.min(), disp.max(), np.abs(K[0, 0] * b / disp - Z_rect).max()))
```

```text
F_rect / |F_rect| =
 [[ 0.      0.      0.    ]
 [ 0.      0.      0.7071]
 [ 0.     -0.7071  0.    ]]
max |v1 - v2| after rectification: 2.27e-13 px
disparity range 48.6 to 268.2 px;  max |f b / d - Z| = 2.04e-14 m
```

変換後の $F$ は $-[\mathbf e]\_\times/\sqrt 2$ で、対応点は $10^{-13}$ px の精度で同じ行にあり、水平方向のずれから計算した奥行き（次節）は真の奥行きと $10^{-14}$ m の精度で一致します。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-rectification.svg" caption="上：本稿の例の画像 1 と画像 2、5 組の対応（色付きの点）とそのエピポーラ線。灰色の点は 200 点すべて。線は傾いており、はるか右のエピポールに向かって収束します。下：平行化ホモグラフィ $H\_1=KR\_{\text{rect}}K^{-1}$ と $H\_2=KR\_{\text{rect}}R^\top K^{-1}$ を施すと、画像の境界は紫の四角形になり、エピポーラ線はすべて水平になり、各対応は両画像で同じ行に並びます。$u$ 方向の大きなずれが視差で、86 cm の基線と 2〜8 m の奥行きでは 49〜268 px です。" %}

校正がなくても、$F$ だけから平行化は可能ですが、ホモグラフィはもはや一意ではありません。Hartley（1999）は、画像中心付近で剛体運動に近いホモグラフィで $\mathbf e\_2$ を無限遠に送り、$F$ と両立する族の中から水平視差を最小にする $H\_1$ を選びます。Loop と Zhang（1999）は射影歪みを最小にする組を選びます。OpenCV の `stereoRectifyUncalibrated` は Hartley の方法に従います。結果の画像は校正済みの平行化より歪みが大きく、これもステレオカメラを校正すべき理由の 1 つです。

### 8.2 視差と奥行き

$P\_1 = K[I \mid \mathbf 0]$、$P\_2 = K[I \mid -b\,\mathbf e\_x]$ の平行化ペアでは、点 $(X, Y, Z)$ は次のように投影されます。

$$
u_1 = f\frac{X}{Z} + c_x, \qquad u_2 = f\frac{X - b}{Z} + c_x, \qquad v_1 = v_2 = f\frac{Y}{Z} + c_y .
$$

**視差**（disparity）は水平方向のずれ $d = u\_1 - u\_2 = fb/Z$ なので、

$$
Z = \frac{f\,b}{d}, \qquad X = \frac{b\,(u_1 - c_x)}{d}, \qquad Y = \frac{b\,(v_1 - c_y)}{d} .
$$

OpenCV はこの 3 式を、`stereoRectify` が返す $4\times 4$ の再投影行列 $Q$ にまとめています。奥行きは視差に反比例し、近い点ほど視差が大きく、無限遠の点は $d = 0$ です。微分すると、視差の誤差 $\delta d$ は

$$
\delta Z = \Big\lvert\frac{\partial Z}{\partial d}\Big\rvert\,\delta d = \frac{fb}{d^2}\,\delta d = \frac{Z^2}{f\,b}\,\delta d
$$

を生みます。6.4 節の式で、今度は 1 次の範囲で厳密です。$f = 500$ px、$b = 0.12$ m、マッチング精度 1/4 画素なら、5 m での奥行き誤差は $25/60\cdot 0.25$ m $= 10.4$ cm、10 m ではその 4 倍です。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-depth-uncertainty.svg" caption="左：誤差が奥行きとともに増える理由を、画素がとても大きいおもちゃの平行化ペアで示したもの（$f=6$、$b=1.5$。細い線は各カメラの画素境界）。セルは、同じ左画素と視差 2〜8 の右画素が共通に見る領域です。整数視差 $d$ は、点が奥行き $fb/(d+1)$ と $fb/(d-1)$ の間にあることしか教えてくれず、$d=8$ の 1.00–1.29 から $d=2$ の 3–9 まで広がります。右：$f=500$ px、$\delta d=0.25$ px での $\delta Z=Z^2\delta d/(fb)$ を 3 つの基線について描いたもの。5 m での誤差は 20.8、10.4、4.2 cm です。" %}

ここから生じるトレードオフは、ステレオ設計全体を貫いています。基線を長くすると遠距離の精度は上がりますが、近距離での 2 つのビューの重なりが減り、遮蔽が増え、2 つのビューの違いが大きくなるのでマッチングも難しくなります。車載ステレオの基線は通常数十センチ、スマートフォンや小型機器のコンパクトなステレオカメラは数センチで、上の式から、後者が精度よく測れる範囲は数メートル以内に限られます。

### 8.3 合成ステレオペア

密なマッチングを調べるには、**すべての画素で視差が分かっている**ペアが必要です。レイキャスティングで 1 組作ります。$240\times 180$ の平行化ペアで、$f = 200$ px、$b = 0.12$ m、傾いた壁、床、テクスチャのある箱、2 値模様の傾いたパネル、そしてほとんどテクスチャのない箱（センサノイズ 1.5 に対して振幅 4 階調）が写っています。同じ 3 次元シーンから両方のビューを描画すれば、真の視差 $fb/Z$ と遮蔽が自然に得られます。

```python
from scipy.ndimage import map_coordinates, uniform_filter

SW, SH, sf, sb = 240, 180, 200.0, 0.12          # image size, focal length (px), baseline (m)
scx, scy = (SW - 1) / 2, (SH - 1) / 2
lattice = np.random.default_rng(8).uniform(0, 1, (6, 64, 64))


def noise(s, t, k, cell):
    """Smooth value noise on surface coordinates (s, t) in metres: lattice k, cell size in metres."""
    return map_coordinates(lattice[k], [t / cell, s / cell], order=3, mode="grid-wrap")


# each surface: normal n and offset c of the plane n.P = c, optional X and Y limits, texture of P
SURFACES = [
    ((0.25, 0, 1), 3.4, None, lambda P: 85 + 70 * noise(P[0], P[1], 0, 0.06) + 30 * noise(P[0], P[1], 1, 0.015)),
    ((0, 1, 0), 0.55, None, lambda P: 90 + 90 * noise(P[0], P[2], 2, 0.05)),                  # floor
    ((0, 0, 1), 1.5, ((-0.75, -0.25), (-0.15, 0.55)), lambda P: 60 + 150 * noise(P[0], P[1], 3, 0.02)),
    ((-0.9, 0, 1), 1.73, ((0.15, 0.6), (-0.35, 0.3)), lambda P: 40 + 180 * (noise(P[0], P[1], 4, 0.03) > 0.5)),
    ((0, 0, 1), 1.1, ((-0.05, 0.3), (0.2, 0.55)), lambda P: 200 + 4 * noise(P[0], P[1], 5, 0.05)),   # no texture
]


def cast(cam_x, u, v):
    """Shade and depth Z of the first surface hit by the rays of pixels (u, v), camera at (cam_x, 0, 0)."""
    d = np.stack([(u - scx) / sf, (v - scy) / sf, np.ones_like(u)])     # ray directions with d_z = 1
    depth, shade = np.full(u.shape, np.inf), np.zeros(u.shape)
    for n, c, lim, tex in SURFACES:
        n = np.array(n, float)
        lam = (c - n[0] * cam_x) / np.tensordot(n, d, 1)                 # ray parameter = depth Z
        P = np.array([cam_x, 0.0, 0.0])[:, None, None] + lam * d
        hit = (lam > 0) & (lam < depth)
        if lim is not None:
            hit &= (P[0] >= lim[0][0]) & (P[0] <= lim[0][1]) & (P[1] >= lim[1][0]) & (P[1] <= lim[1][1])
        depth = np.where(hit, lam, depth)
        shade = np.where(hit, tex(P), shade)
    return shade, depth


def render(cam_x, ss=2):
    """Image (ss x ss supersampled) and per-pixel depth of the camera at (cam_x, 0, 0)."""
    u, v = np.meshgrid(np.arange(SW, dtype=float), np.arange(SH, dtype=float))
    offs = (np.arange(ss) + 0.5) / ss - 0.5
    img = sum(cast(cam_x, u + dx, v + dy)[0] for dy in offs for dx in offs) / ss ** 2
    return img, cast(cam_x, u, v)[1]


left, depth_l = render(0.0)
right, depth_r = render(sb)
rng = np.random.default_rng(9)
left = left + rng.normal(0, 1.5, left.shape)            # sensor noise (grey levels 0..255)
right = right + rng.normal(0, 1.5, right.shape)
gt = sf * sb / depth_l                                  # true disparity of every left pixel
gt_r = sf * sb / depth_r
xm = np.arange(SW)[None, :] - np.round(gt).astype(int)  # column of the match in the right image
valid = xm >= 0
occluded = valid & (np.abs(np.take_along_axis(gt_r, np.clip(xm, 0, SW - 1), 1) - gt) > 1.0)
mask = valid & ~occluded                                # pixels whose match is visible
print("disparity %.1f to %.1f px; %.1f%% of the pixels are occluded or leave the right image"
      % (gt.min(), gt.max(), 100 * (1 - mask.mean())))
```

```text
disparity 6.0 to 21.8 px; 7.1% of the pixels are occluded or leave the right image
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-stereo-pair.svg" caption="合成した平行化ペア：左画像 $I\_L$、右画像 $I\_R$（カメラが右に 12 cm 動いたので、すべてが左にずれ、近い物体ほど大きくずれる）、そして各左画素の真の視差 $d^\ast$。奥の壁の 6.0 px から手前の箱の 21.8 px まで。灰色：右画像に対応を持たない 7.1% の左画素で、遮蔽されているか（各箱のすぐ左の帯。右カメラからは見えない）、視野の外（左端）です。" %}

遮蔽された帯は一見の価値があります。どれも前景物体の左側にあります。右カメラはより右にあるので、物体の右端の向こうは見えても、左端の向こうは見えません。そこではどんなマッチング法も正しい視差を求められず、せいぜい検出できるだけです。

### 8.4 ブロックマッチング

最も簡単な密な方法は窓を比較します。各左画素と各候補視差 $d$ について、左画像の $(x, y)$ の周りの窓と右画像の $(x - d, y)$ の周りの窓の**マッチングコスト**を計算し、コストが最小の視差を取ります（「勝者総取り」、winner takes all、WTA）。よく使うコストは次のとおりです。

- **SAD / SSD**：絶対差または二乗差の和。高速ですが、2 台のカメラ間の明るさやコントラストの違いに敏感です。
- **NCC**：正規化相互相関。窓のゲインとバイアスに不変ですが、計算は重くなります。
- **Census**（Zabih と Woodfill、1994）：各画素を、どの近傍がそれより暗いかを表すビット列に置き換え、ビット列をハミング距離で比べます。あらゆる単調な明るさの変化に不変で、2 台のカメラの輝度特性が異なる場合の標準的な選択です。

すべての画素と視差で $C(x, y, d)$ を計算したものが**コストボリューム**（cost volume）で、$D\times H\times W$ の配列です。ボックスフィルタを使えば、各窓のコストは $O(1)$ で求まります。WTA の視差は整数なので、$d - 1$、$d$、$d + 1$ のコストを通る放物線で精密化します。頂点は

$$
d^\ast = d + \frac{c_{d-1} - c_{d+1}}{2\,(c_{d-1} - 2c_d + c_{d+1})}
$$

にあります。

```python
DMAX = 32                                               # disparities 0..31


def cost_volume_sad(L, Rimg, win):
    """C[d, y, x] = mean |L(x, y) - R(x - d, y)| over a win x win window."""
    C = np.empty((DMAX, SH, SW))
    for d in range(DMAX):
        diff = np.full((SH, SW), 255.0)                 # no match possible left of column d
        diff[:, d:] = np.abs(L[:, d:] - Rimg[:, :SW - d])
        C[d] = uniform_filter(diff, win, mode="nearest")
    return C


def wta(C):
    """Winner-take-all disparity with parabola subpixel refinement."""
    d = np.argmin(C, axis=0)
    dc = np.clip(d, 1, DMAX - 2)
    c0, c1, c2 = (np.take_along_axis(C, (dc + k)[None], 0)[0] for k in (-1, 0, 1))
    den = c0 - 2 * c1 + c2
    off = np.where((d == dc) & (den > 0), 0.5 * (c0 - c2) / np.where(den > 0, den, 1.0), 0.0)
    return d + off


def bad_pixels(D, thresh=1.0, margin=6):
    """Percentage of visible pixels (away from the border) whose disparity is off by more than thresh."""
    m = mask.copy()
    m[:margin], m[-margin:], m[:, :margin], m[:, -margin:] = False, False, False, False
    return 100 * np.mean(np.abs(D - gt)[m] > thresh)


for win in (3, 7, 15):
    D = wta(cost_volume_sad(left, right, win))
    print("SAD %2dx%-2d: bad pixels (error > 1 px) %.1f%%" % (win, win, bad_pixels(D)))
```

```text
SAD  3x3 : bad pixels (error > 1 px) 10.4%
SAD  7x7 : bad pixels (error > 1 px) 9.4%
SAD 15x15: bad pixels (error > 1 px) 12.0%
```

窓の大きさはトレードオフです。小さな窓（3×3）は判別に必要なテクスチャを含まず、10.4% の画素が誤り、ごま塩ノイズのように散らばってテクスチャの弱い箱を覆います。大きな窓（15×15）はより多くのテクスチャを集めて無地の箱のより多くの部分を復元します（それでも全部ではありません）が、奥行きの不連続の近くでは前景と背景の両方の画素を含み、テクスチャの強い前景がたいてい勝ちます。物体が窓の半分だけ太るのです。この**前景の膨張**（foreground fattening）で誤差は 12.0% に上がります。次の図が示すように、どこでも通用する窓の大きさはありません。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-block-matching.svg" caption="上：3×3、7×7、15×15 の窓による SAD ブロックマッチングの視差マップと、SAD 5×5 にセミグローバルマッチング（8.5 節）を加えた結果。色の尺度は真値と同じです。下：誤差が 1 px を超える画素を赤で示し（灰色：見える対応がない）、可視画素での誤り画素率は 10.4%、9.4%、12.0%、4.9% です。小さな窓は無地の箱で失敗して誤差をあちこちにばらまき、大きな窓は箱のより多くを復元するものの各物体を窓の半分だけ太らせます。SGM は縁を保ち、無地の箱の大部分も正しく求めますが、残りの誤差は 4 方向実装に特有の横縞になります。" %}

### 8.5 セミグローバルマッチング

ブロックマッチングは各画素を独立に決めます。本当に欲しいのは、**データに忠実**で、少数の跳びを除いて**滑らか**な視差マップです。エネルギーとして書くと

$$
E(D) = \sum_{\mathbf p} C(\mathbf p, D_{\mathbf p})
+ \sum_{\mathbf p}\sum_{\mathbf q\in\mathcal N(\mathbf p)} \Big( P_1\,[\lvert D_{\mathbf p} - D_{\mathbf q}\rvert = 1] + P_2\,[\lvert D_{\mathbf p} - D_{\mathbf q}\rvert > 1] \Big)
$$

で、$[\cdot]$ は条件が成り立てば 1、そうでなければ 0 です。小さなペナルティ $P\_1$ は視差が 1 画素ずつ変わる傾いた面を許し、大きなペナルティ $P\_2$ は本当の跳びを高価にしつつ可能にします。2 次元格子上で $E$ を最小化するのは一般に NP 困難です。しかし**1 本の 1 次元経路**に沿ってなら、動的計画法で厳密に解けます。古典的な走査線ステレオです。Hirschmüller の**セミグローバルマッチング**（semi-global matching、SGM；CVPR 2005、TPAMI 2008）は、この動的計画法を複数の方向 $\mathbf r$（左から右、右から左、上から下など）に沿って実行し、結果を足し合わせます。方向 $\mathbf r$ に沿って視差 $d$ で画素 $\mathbf p$ に到達するコストは

$$
L_{\mathbf r}(\mathbf p, d) = C(\mathbf p, d) + \min\Big( L_{\mathbf r}(\mathbf p - \mathbf r, d),\
L_{\mathbf r}(\mathbf p - \mathbf r, d \pm 1) + P_1,\
\min_k L_{\mathbf r}(\mathbf p - \mathbf r, k) + P_2 \Big) - \min_k L_{\mathbf r}(\mathbf p - \mathbf r, k)
$$

です。同じ視差で続けるならコストなし、1 だけ変えるなら $P\_1$、どこへでも跳ぶなら $P\_2$ です。直前の最小値を引いても argmin は変わらず、数値が有界に保たれます。集約コストは $S(\mathbf p, d) = \sum\_{\mathbf r} L\_{\mathbf r}(\mathbf p, d)$ で、視差はその WTA です。こうして各画素はすべての経路に沿って遠くから証拠を受け取ります。テクスチャの弱い領域はテクスチャのある縁の視差を受け継ぐことができ、一方で本当の奥行きの段差では、データ項がはっきり反対するので、固定の代価 $P\_2$ を払って視差が変わります。

方法を完成させるアイデアがあと 2 つあります。**左右整合性チェック**（left-right consistency check）は右画像を基準に 2 枚目の視差マップを計算し、2 つの視差が食い違う画素を無効にします。遮蔽された画素の「対応」は別の表面なので、このチェックに通りません。本稿のコードでは右画像のコストを計算し直す必要はなく、右画素 $x$ の視差 $d$ でのコストは左のコストの $x + d$ の位置にあります。Hirschmüller のマッチングコストは**相互情報量**（mutual information）に基づいていて輝度の違いに対応できますが、census やブロックのコストもよく代わりに使われます。OpenCV の `StereoSGBM` は小さなブロックでマッチングし、既定では 5 方向（`MODE_HH` では 8 方向）に沿って集約します。ドキュメントは、絶対差の（平均ではなく）和に対して $P\_1 = 8\cdot\text{channels}\cdot\text{blockSize}^2$、$P\_2 = 32\cdot\text{channels}\cdot\text{blockSize}^2$ を勧めています。

```python
def aggregate_path(C, P1, P2, reverse):
    """One SGM path along the first axis of C (steps, D, other):
    L(p, d) = C(p, d) + min(L(p-r, d), L(p-r, d-1) + P1, L(p-r, d+1) + P1, min_k L(p-r, k) + P2) - min_k L(p-r, k)."""
    C = C[::-1] if reverse else C
    L = np.empty_like(C)
    L[0] = C[0]
    inf = np.full((1, C.shape[2]), np.inf)
    for i in range(1, len(C)):
        prev = L[i - 1]                                    # (D, other)
        m = prev.min(axis=0)
        step = np.minimum(np.vstack([prev[1:], inf]), np.vstack([inf, prev[:-1]])) + P1
        L[i] = C[i] + np.minimum(np.minimum(prev, step), m + P2) - m
    return L[::-1] if reverse else L


def sgm(C, P1=2.0, P2=16.0):
    """Sum of the left/right and up/down path costs (Hirschmueller uses 8 or 16 paths)."""
    Cy = np.transpose(C, (1, 0, 2))                        # (y, d, x): scan down or up
    Cx = np.transpose(C, (2, 0, 1))                        # (x, d, y): scan right or left
    S = sum(np.transpose(aggregate_path(Cy, P1, P2, r), (1, 0, 2)) for r in (False, True))
    return S + sum(np.transpose(aggregate_path(Cx, P1, P2, r), (1, 2, 0)) for r in (False, True))


C5 = cost_volume_sad(left, right, 5)
D_sgm = wta(sgm(C5))
print("SAD 5x5 + SGM: bad pixels %.1f%%" % bad_pixels(D_sgm))

# right-image disparities from the same costs: C_R(x, d) = C(x + d, d)
C5_r = np.full_like(C5, 255.0)
for d in range(DMAX):
    C5_r[d, :, :SW - d] = C5[d, :, d:]
D_r = wta(sgm(C5_r))
xr = np.clip(np.round(np.arange(SW)[None, :] - D_sgm).astype(int), 0, SW - 1)
consistent = np.abs(D_sgm - np.take_along_axis(D_r, xr, 1)) <= 1.0
print("left-right check rejects %.1f%% of pixels, %.0f%% of the occluded ones;"
      " bad pixels among the kept ones: %.1f%%"
      % (100 * (1 - consistent.mean()), 100 * (~consistent)[occluded].mean(),
         100 * np.mean((np.abs(D_sgm - gt) > 1)[mask & consistent])))
```

```text
SAD 5x5 + SGM: bad pixels 4.9%
left-right check rejects 8.7% of pixels, 84% of the occluded ones; bad pixels among the kept ones: 2.3%
```

5×5 の SAD コストで、SGM は最良のブロックマッチングの誤差を 9.4% から 4.9% へ半減させます。続く左右整合性チェックは全画素の 8.7% を除去し、その中には本当に遮蔽された画素の 84% が含まれます。残った画素での誤り画素は 2.3% です。次の図は、集約が画像の 1 行に沿ってコストボリュームに何をするかを示しています。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/04-sgm.svg" caption="左：行 $y=145$ に沿ったコストボリュームの断面（暗いほど低コスト。各列はその 95 パーセンタイルでスケール）。上は集約前（5×5 SAD コスト $C$）、下は SGM 集約後（$S$）。白線：真の視差。シアンの点：各列の argmin。集約前の argmin は無地の箱（$x\approx 110$–$175$、真の $d=21.8$）と遮蔽の帯でさまよいますが、集約後は箱の中で最小値がおおむね真の視差に沿い、テクスチャのある領域は変わりません。右：左右整合性チェック後の SGM 視差マップ。灰色の画素は除去されたもの（各物体の左の遮蔽帯と、散発的な失敗）。破線は左の図の行を示します。" %}

### 8.6 試してみよう：ステレオマッチング実験室

このウィジェットはブラウザで同じ種類のシーンを描画し（200×150 px）、ブロックマッチングまたは SGM を実行します。画素を選ぶと、そのコストを視差の関数として表示し、SGM では集約後の曲線も描きます。

{% include widget.liquid name="3d-vision-stereo-matching" height="620" caption="ステレオマッチング実験室。左：左画像。中央：計算した視差（灰色：左右整合性チェックで除外）。右：誤差が 1 px を超える画素を赤で表示（濃い灰色：見える対応がない）。どの画像でもタップまたはドラッグで画素を選ぶと、窓のコスト $C(d)$（オレンジ）、SGM で集約したコスト $S(d)$（紫、スケール済み）、真の視差（破線）がグラフに出ます。スライダーで窓の大きさ、$P\_1$、$P\_2$、無地の箱のテクスチャ、画像ノイズを変えられます。テクスチャかノイズを変えると画像を描き直します。" %}

試してほしいこと：ブロックマッチングで無地の箱をタップし、3×3 と 11×11 の窓を比べてください。コスト曲線は平らでノイズの多い形から、はっきりした谷に変わります。箱のテクスチャを 0 にして比べると、ブロックマッチングは箱の大部分を誤りますが、SGM はその大部分を正しく求めます。縁の視差が経路に沿って内側へ伝わるからです。残りは縞状に失敗します。次にテクスチャを 6 に戻して $P\_2$ を 120 まで上げると、跳びが非常に高価になるため集約が物体の境界を越えて視差を引きずり、誤差は縁に沿って、とりわけデータ項が弱くて抵抗できない無地の箱で増えます。

### 8.7 手作りのステレオを超えて

ブロックマッチングと SGM は、挙動が予測可能で専用ハードウェア上で高速なため、今も多くのカメラやロボットで動いています。2010 年代半ばからは、学習ベースの手法がステレオのベンチマークで首位に立っています。GC-Net（Kendall ら、ICCV 2017）は学習した特徴からコストボリュームを作り、SGM の代わりに 3D 畳み込みで正則化し、微分可能な soft argmin でサブピクセルの視差を読み出しました。RAFT-Stereo（Lipson、Teed、Deng、3DV 2021）は第 03 回の再帰的なオプティカルフローネットワーク RAFT を平行化ペアに適用しました。FoundationStereo（Wen ら。2026 年 11 月時点で CVPR 2025 に発表済み）は約 100 万組の合成ペアで学習し、凍結した単眼深度モデルを事前知識として使い、実ベンチマークにゼロショットで汎化します。本節の構造、すなわち視差上のコストボリューム、集約、読み出しは、これらすべてに残っています。[第 07 回]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }})では、コストボリュームを 3 視点以上に一般化し（平面掃引とマルチビューステレオ）、単眼深度推定も扱います。

## 試してみよう

- **エピポーラウィジェット**（3.4 節）で「前進」プリセットを選び、点をビュー 1 の中心に向かってドラッグしてください。点がちょうど主点にあるとき、エピポーラ線はどこにあり、それはなぜでしょうか。次に「ステレオ」プリセットを選び、どの奥行きでも線が点の行に留まることを確かめましょう。
- 同じエピポーラウィジェットで奥行きスライダーを 0.5 m と 20 m にし、緑の点が線上のどこに来るかを見てください。次に上面図で基線をとても小さくすると、奥行きの目盛りが密集します。7.4 節の退化に近い状態を内側から見たものです。
- **ステレオマッチング実験室**（8.6 節）で、テクスチャ 6 で窓を 3×3 から 15×15 まで大きくしながら、ブロックマッチングが無地の箱をどう扱うか、大きな窓が物体の境界で何を犠牲にするかを観察し、それから左右整合性チェックをオンにして、どの画素が除かれるかを見てください。
- ホームページの[インタラクティブラボ]({{ '/' | relative_url }}#lab)ではレンダリング側を見られます。ガウシアンスプラッティングのデモは、本稿のような姿勢付き画像から作られるシーンの典型です。

## 代表的な論文

| 論文 | 会議/論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| A computer algorithm for reconstructing a scene from two projections (Longuet-Higgins) | Nature | 1981 | [DOI](https://doi.org/10.1038/293133a0) | 基本行列と線形 8 点アルゴリズム |
| Non-parametric local transforms for computing visual correspondence (Zabih, Woodfill) | ECCV | 1994 | — | ロバストなマッチングコストとしての census 変換 |
| In defense of the eight-point algorithm (Hartley) | TPAMI | 1997 | [DOI](https://doi.org/10.1109/34.601246) | 座標の正規化で線形アルゴリズムが高精度に |
| Triangulation (Hartley, Sturm) | CVIU | 1997 | [DOI](https://doi.org/10.1006/cviu.1997.0547) | 6 次多項式による最適な 2 視点三角測量 |
| The problem of degeneracy in structure and motion recovery from uncalibrated image sequences (Torr, Fitzgibbon, Zisserman) | IJCV | 1999 | — | 純回転と平面シーン、その検出 |
| Theory and practice of projective rectification (Hartley) | IJCV | 1999 | — | $F$ だけからの平行化 |
| Computing rectifying homographies for stereo vision (Loop, Zhang) | CVPR | 1999 | — | 歪みを最小にする平行化 |
| A taxonomy and evaluation of dense two-frame stereo correspondence algorithms (Scharstein, Szeliski) | IJCV | 2002 | [DOI](https://doi.org/10.1023/A:1014573219977) | コスト、集約、最適化、精密化；Middlebury ベンチマーク |
| An efficient solution to the five-point relative pose problem (Nistér) | TPAMI | 2004 | [DOI](https://doi.org/10.1109/TPAMI.2004.17) | RANSAC で使う校正済みの最小解法 |
| Two-view geometry estimation unaffected by a dominant plane (Chum, Werner, Matas) | CVPR | 2005 | — | DEGENSAC |
| Recent developments on direct relative orientation (Stewénius, Engels, Nistér) | ISPRS J. Photogrammetry and Remote Sensing | 2006 | — | グレブナー基底による 5 点ソルバ |
| Stereo processing by semiglobal matching and mutual information (Hirschmüller) | TPAMI | 2008 | [DOI](https://doi.org/10.1109/TPAMI.2007.1166) | SGM |
| Triangulation made easy (Lindstrom) | CVPR | 2010 | — | 高速な反復型の最適三角測量 |
| ORB-SLAM: a versatile and accurate monocular SLAM system (Mur-Artal, Montiel, Tardós) | IEEE T-RO | 2015 | [arXiv](https://arxiv.org/abs/1502.00956) | 地図の初期化でホモグラフィか基礎行列かを選ぶ |
| End-to-end learning of geometry and context for deep stereo regression (Kendall et al.) | ICCV | 2017 | [arXiv](https://arxiv.org/abs/1703.04309) | 学習したコストボリューム、3D 畳み込みと soft argmin |
| RAFT-Stereo: multilevel recurrent field transforms for stereo matching (Lipson, Teed, Deng) | 3DV | 2021 | [arXiv](https://arxiv.org/abs/2109.07547) | ステレオのための再帰的な精密化 |
| FoundationStereo: zero-shot stereo matching (Wen et al.) | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.09898) | 大規模な合成データでの学習と単眼深度の事前知識 |

## 学習リソース

- R. Hartley、A. Zisserman『Multiple View Geometry in Computer Vision』第 2 版、2004：第 9 章（エピポーラ幾何と基礎行列）、第 10 章（カメラと構造の復元）、第 11 章（$F$ の計算。7 点アルゴリズムと Sampson 距離を含む）、第 12 章（三角測量）。
- Y. Ma、S. Soatto、J. Košecká、S. Sastry『An Invitation to 3-D Vision』、2004：第 5、6 章（校正済みおよび未校正の 2 視点からの復元）。$E$ の分解の丁寧な証明があります。
- R. Szeliski『Computer Vision: Algorithms and Applications』第 2 版、2022：第 11 章（2 フレームの方法を含む Structure from Motion）と第 12 章（深度推定：平行化、マッチングコスト、SGM）。[szeliski.org/Book](https://szeliski.org/Book/) で無料で読めます。
- OpenCV calib3d：`findFundamentalMat`、`findEssentialMat`、`recoverPose`、`triangulatePoints`、`stereoRectify`、`stereoRectifyUncalibrated`、`StereoBM`、`StereoSGBM`（[ドキュメント](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html)）。
- コード：[PoseLib](https://github.com/PoseLib/PoseLib)（5 点・7 点を含む最小解法）、[COLMAP](https://github.com/colmap/colmap)（SfM の中での 2 視点幾何の推定）。
- ベンチマーク：[Middlebury stereo](https://vision.middlebury.edu/stereo/)、[KITTI stereo](https://www.cvlibs.net/datasets/kitti/eval_scene_flow.php?benchmark=stereo)、[ETH3D](https://www.eth3d.net/)。

## 演習

1. 同じ $K$ を持つ 2 台のカメラの間が純並進なら、$F$ が歪対称で、$\mathbf x\_1$、$\mathbf x\_2$、エピポールが共線であることを示してください。これは画像中の点の動きについて何を意味するでしょうか。

   <details markdown="1"><summary>ヒント</summary>

   $R = I$ とすると、3.1 節の恒等式から $F = K^{-\top}[\mathbf t]\_\times K^{-1} \sim [K\mathbf t]\_\times$ で、これは歪対称であり、$\mathbf e = K\mathbf t$ です。すると $\tilde{\mathbf x}\_2^\top[\mathbf e]\_\times\tilde{\mathbf x}\_1 = \det(\tilde{\mathbf x}\_2, \mathbf e, \tilde{\mathbf x}\_1) = 0$ で、3 点は共線です。各点はエピポールと自分を結ぶ直線に沿って、エピポールに近づくか遠ざかる（拡大焦点）ように動きます。運動の図の左と中央のとおりです。
   </details>

2. $2MM^\top M - \operatorname{tr}(MM^\top)M = 0$ を満たす $3\times 3$ 行列 $M \ne 0$ の特異値が $(\sigma, \sigma, 0)$ であること、したがってこの 3 次の拘束が基本行列を特徴づけることを証明してください。

   <details markdown="1"><summary>ヒント</summary>

   SVD を使うと方程式は $i = 1, 2, 3$ について $\sigma\_i(2\sigma\_i^2 - s) = 0$、ただし $s = \sigma\_1^2 + \sigma\_2^2 + \sigma\_3^2$ になります。非零の $\sigma\_i$ はすべて $\sigma\_i^2 = s/2$ を満たします。3 つとも非零なら $s = 3s/2$ で $s = 0$ となり不可能です。1 つだけ非零なら $\sigma\_1^2 = \sigma\_1^2/2$ で不可能です。したがってちょうど 2 つが非零で等しくなります。
   </details>

3. 分解で得られる 2 つの回転が基線周りの 180° 回転だけ異なることを示し、ねじれ対では、真の姿勢で両カメラの前にある点が両方のカメラの前に来ることはありえない理由を図で説明してください。

   <details markdown="1"><summary>ヒント</summary>

   $R\_b R\_a^\top = UW^\top V^\top VW^\top U^\top = U(W^\top)^2U^\top = U\operatorname{diag}(-1,-1,1)U^\top$ で、$\mathbf u\_3 = \mathbf t/\lVert\mathbf t\rVert$ 周りの $\pi$ 回転です。カメラ 2 を基線周りに 180° 回すと、エピポーラ平面に対する視線方向が逆になり、$\mathbf x\_2$ の光線は基線の反対側へ出ます。すると 2 本の光線はどちらかのカメラの後ろで交わります（4 つの姿勢の図の各パネルと比べてください）。
   </details>

4. $f = 700$ px、$b = 12$ cm のステレオカメラで、マッチング精度は 0.2 px です。相対奥行き誤差 $\delta Z/Z$ が 5% に達する距離はいくらでしょうか。50 m で 5% にするには基線をどれだけ長くする必要があるでしょうか。

   <details markdown="1"><summary>ヒント</summary>

   $\delta Z/Z = Z\,\delta d/(fb)$。これを 0.05 とおくと $Z = 0.05\cdot 700\cdot 0.12/0.2 = 21$ m。$Z = 50$ m なら $b = Z\,\delta d/(0.05 f) = 50\cdot 0.2/35 = 0.29$ m です。
   </details>

5. `sgm` に 4 つの斜め方向を加えて 8 経路に拡張し、4 経路版と誤り画素率および横縞を比べてください。次に census コスト（5×5 窓、ハミング距離）を実装し、右画像だけに 1.2 倍の明るさのゲインをかけたうえで SAD と比べてください。

   <details markdown="1"><summary>ヒント</summary>

   斜めの経路は $(x, y), (x+1, y+1), \dots$ と進み、漸化式は同じで、直前の画素は $(x-1, y-1)$ です。ベクトル化する 1 つの方法は、画像を 1 行ずつ処理し、`prev` を 1 つ前の行を 1 列ずらしたものから取ることです（空いた列は元のコスト $C$ で埋める）。census では、各画素の 24 個の近傍を中心と比べてビットを整数に詰め、XOR したコードの異なるビット数を参照表で数えます。ゲインはすべての絶対差を変えますが census のビットは 1 つも変えないので、SAD は悪化し census は悪化しないはずです。
   </details>

**次回：** [第 05 回]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})では 2 視点から多視点へ進みます。PnP によるカメラの位置推定、逐次型と大域型の Structure-from-Motion、そしてすべてのカメラと点を同時に精密化するバンドル調整です。本稿の相対姿勢と三角測量は、最終的にそこへ流れ込みます。
