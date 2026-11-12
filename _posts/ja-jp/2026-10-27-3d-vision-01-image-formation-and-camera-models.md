---
layout: post
title: "画像形成とカメラモデル：射影幾何、ピンホール、レンズ、座標系の約束事"
date: 2026-10-27 11:01:00+0900
description: "「3D ビジョンの基礎」シリーズ第 1 回：同次座標、無限遠点と消失点、ピンホールカメラ P = K[R|t] とその RQ 分解、Brown-Conrady と Kannala-Brandt の歪み、ローリングシャッター、そして OpenCV・OpenGL・COLMAP・NeRF の座標系の変換方法を扱います。"
categories: 3d-vision
tags: [projective-geometry, pinhole-camera, camera-matrix, lens-distortion, fisheye, rolling-shutter, coordinate-conventions]
series: 3d-vision
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

コンピュータグラフィックスはシーンから画像へ向かいます。形状とカメラが分かっていて、画素を計算します。3D ビジョンは逆向きで、画像から形状へ戻ります。カメラはどこにあったのか、世界はどんな形なのか、各画素はどれだけ遠いのか。この逆問題のどの段階も、カメラが 3D の点をどのように画素へ変換するかを正確に記述したモデルから始まります。モデルが少しでも間違っていると（歪みの項を一つ忘れる、軸を一本反転させる、半画素ずれる）、その誤差は後段のすべてに引き継がれます。キャリブレーション、マッチング、三角測量、SLAM、NeRF、そして 3D ガウシアンスプラッティング（3D Gaussian Splatting）です。

この記事では、そのモデルを基礎から組み立てます。まず射影幾何（projective geometry）から始めます。この代数の中では「平行線は地平線で交わる」が厳密な命題になります。次にピンホールカメラ $P = K[R \mid \mathbf t]$ を組み立て、それを再び分解する方法を学びます。続いて、実際のカメラがピンホールから外れる要因であるレンズ歪み（lens distortion）、魚眼光学系、ローリングシャッター（rolling shutter）を扱います。最後に OpenCV、OpenGL、COLMAP、NeRF の座標系の約束事を整理します。これらは、ここまでのすべてを合わせたよりも多くの気づきにくいバグを生みます。

### このシリーズの対象読者

**3D ビジョンの基礎**は、線形代数、微積分、Python、機械学習の基礎は身につけているものの、多視点幾何を体系的に学んだことのない意欲的な読者のための、ゼロからの学習コースです。各記事は同じ順序で一つの考え方を組み立てます。図による直観、一歩ずつ導く数式、数値を使った小さな計算例、それを再現する実行可能な NumPy コード、そして結果を空間の中で見せる図やインタラクティブなウィジェットです。NeRF、ガウシアンスプラッティング、SLAM、ロボティクス、AR/VR に取り組んでいて、COLMAP の姿勢をブラックボックスとして使ってきた方には、このシリーズがその箱を開けます。

このシリーズは[グラフィックスシリーズ]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})（シーンから画像へ）と[ニューラルレンダリングシリーズ]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})（画像から放射輝度場へ）の間に位置します。ニューラルレンダリングの第 1 回はカメラ、エピポーラ幾何、バンドル調整、COLMAP を手短に概観しました。このシリーズでは、それぞれの話題をゆっくり深く扱います。

### シリーズの地図

| # | 記事 | 読み終えるとできること |
| --- | --- | --- |
| 01 | [画像形成とカメラモデル]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})（本記事） | どんなカメラモデルでも書き下し、分解し、変換できる |
| 02 | [カメラキャリブレーション]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }}) | Zhang の手法で $K$ と歪みを推定し、結果の良し悪しを判断できる |
| 03 | [特徴点とマッチング]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}) | 画像間で点を検出・記述し、ロバストに対応付けられる |
| 04 | [2 視点幾何]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }}) | 2 枚の画像から相対姿勢と奥行きを復元できる |
| 05 | [多視点幾何とバンドル調整]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }}) | Structure-from-Motion を組み立てて最適化できる |
| 06 | [Visual SLAM]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }}) | カメラをリアルタイムに追跡し、ループを閉じられる |
| 07 | [奥行き推定と多視点ステレオ]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}) | 姿勢付き画像を密な奥行きに変換できる |
| 08 | [3D 表現]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }}) | 点群、メッシュ、ボクセル、SDF、ニューラル場、ガウシアンを使い分けられる |
| 09 | [3D 再構成：古典からフィードフォワードまで]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) | 写真から表面へ、最適化でも 1 回のネットワーク推論でも到達できる |
| 10 | [AR/VR のための 3D ビジョン]({{ '/blog/2026/3d-vision-10-3d-vision-for-ar-vr/' | relative_url }}) | ヘッドセットのトラッキング、遅延、位置合わせ誤差を理解できる |

## 前提知識

- 線形代数：行列の積、逆行列、行列式、直交行列、外積、そして QR 分解（その鏡像である RQ 分解を使います）。
- 回転と剛体変換。[グラフィックスの数学編]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})で回転行列とクォータニオンを、[Embodied AI の第 1 回]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})で $SE(3)$ を扱っています。
- あると役立つもの（必須ではありません）：[ラスタライゼーション]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})の透視投影行列。
- NumPy と SciPy が使える Python。以下のコードはすべてそのまま実行でき、本文で引用する数値はその出力です。

## 1. 射影幾何：画像形成の言語

カメラは 3D の世界を 2D の画像へ写します。長さ、角度、平行性は保たれません。線路は収束し、円は楕円になります。保たれるのは、直線が直線のままであること（理想的なレンズの場合）と、直線上の点が直線上にとどまることです。射影幾何はまさにこれらの性質だけを残す幾何であり、その代数である同次座標（homogeneous coordinates）がカメラを一つの行列に変えます。

### 1.1 平面の同次座標

平面上の点 $(x, y)$ は、$\lambda \neq 0$ の任意の 3 次元ベクトル $\tilde{\mathbf x} = (\lambda x, \lambda y, \lambda)^\top$ で表されます。0 でない定数倍はすべて同じ点を表し、$\tilde{\mathbf x} \sim \lambda \tilde{\mathbf x}$ と書きます。元に戻すには最後の座標で割ります：$(x_1, x_2, x_3) \mapsto (x_1/x_3,\, x_2/x_3)$。

次の図の上半分の絵を覚えておいてください。同次ベクトルはそれぞれ $\mathbb R^3$ の**原点を通る光線**であり、通常の点はその光線が平面 $w = 1$ と交わる位置です。このような光線全体の集合が**射影平面**（projective plane）$\mathbb P^2$ です。これはすでにカメラになっています。目を原点に、画像を平面 $w=1$ に置けば、目を通る光線一本一本が一つの像点です。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-projective-plane.svg" width="75%" caption="上：原点を通る光線としての射影平面。黒い光線は $(x,y,1)$ とその定数倍 $\lambda(x,y,1)$ をすべて含み、それらは一つの点です。平面 $w=1$ 上の 2 本の平行線 $\mathbf m_1$（橙）と $\mathbf m_2$（シアン）は、原点を通る平面（影付きの扇形）に対応します。2 つの平面は赤い光線 $(8,4,0)^\top$ で交わります。これは $w=0$ 内にあり、決して $w=1$ に届きません。平行線が交わる無限遠点です。下：1.2 節の計算。$\mathbf a,\mathbf b$ を通る $\mathbf l_1$ と $\mathbf c,\mathbf d$ を通る $\mathbf l_2$ は $\mathbf x\sim(2.5,2,1)$ で交わり、平行線 $x-2y+1=0$ と $x-2y-3=0$ は $(8,4,0)$、つまり矢印で示した方向 $(2,1)$ で交わります。" %}

### 1.2 直線、結ぶことと交わること

直線 $ax + by + c = 0$ は 3 次元ベクトル $\mathbf l = (a, b, c)^\top$ で、これもスケールの違いを除いて定まります。点が直線上にあるのは、次の式が成り立つときに限ります。

$$
\mathbf l^\top \tilde{\mathbf x} = a x_1 + b x_2 + c x_3 = 0 .
$$

この一つの双線形方程式から、とても便利な二つの構成が得られます。2 点 $\tilde{\mathbf a}$ と $\tilde{\mathbf b}$ を通る直線は $\mathbf l^\top \tilde{\mathbf a} = \mathbf l^\top \tilde{\mathbf b} = 0$ を満たさなければならないので、$\mathbf l$ は両方のベクトルに直交し、外積がちょうどそれを与えます。

$$
\mathbf l = \tilde{\mathbf a} \times \tilde{\mathbf b}, \qquad \text{なぜなら } (\tilde{\mathbf a}\times\tilde{\mathbf b})^\top \tilde{\mathbf a} = 0 .
$$

役割を入れ替えた同じ議論により、2 直線の交点は $\tilde{\mathbf x} = \mathbf l_1 \times \mathbf l_2$ です。点と直線はこれらの式に対称に現れます（これを**双対性**、duality と呼びます）。点についての命題には必ず直線についての双子の命題があります。

**計算例。** $\mathbf a = (1,1)$、$\mathbf b = (4,3)$、$\mathbf c = (1,3)$、$\mathbf d = (4,1)$ とします。すると $\mathbf l_1 = \tilde{\mathbf a} \times \tilde{\mathbf b} = (-2, 3, -1)$ で、これは直線 $-2x + 3y - 1 = 0$ です（確認：$-2 + 3 - 1 = 0$、$-8 + 9 - 1 = 0$）。同様に $\mathbf l_2 = (2, 3, -11)$ です。交点は $\mathbf l_1 \times \mathbf l_2 = (-30, -24, -12) \sim (2.5, 2, 1)$、つまり点 $(2.5, 2)$ です。

```python
import numpy as np

def hom(p):                      # Euclidean -> homogeneous
    return np.append(np.asarray(p, float), 1.0)

def dehom(x):                    # homogeneous -> Euclidean (needs x[-1] != 0)
    return x[:-1] / x[-1]

a, b = hom([1, 1]), hom([4, 3])
c, d = hom([1, 3]), hom([4, 1])
l1 = np.cross(a, b)              # line through a and b
l2 = np.cross(c, d)              # line through c and d
x = np.cross(l1, l2)             # intersection of the two lines
print("l1 =", l1, " l2 =", l2)
print("x  =", x, "->", dehom(x))
print("incidence:", l1 @ x, l2 @ x)

# two parallel lines x - 2y + 1 = 0 and x - 2y - 3 = 0
m1, m2 = np.array([1.0, -2.0, 1.0]), np.array([1.0, -2.0, -3.0])
print("parallel lines meet at", np.cross(m1, m2))   # last entry 0: a point at infinity
# the line through two points at infinity is the line at infinity
print("line at infinity:", np.cross([2.0, 1.0, 0.0], [1.0, 0.0, 0.0]))
```

出力：`l1 = [-2. 3. -1.]`、`l2 = [2. 3. -11.]`、`x = [-30. -24. -12.] -> [2.5 2.]`、接続の確認は `0.0 0.0`、平行線は `[8. 4. 0.]` で交わり、無限遠直線は `[0. 0. -1.]` です。

### 1.3 無限遠点と無限遠直線

面白いのはコードの最後の 2 行です。2 本の平行線 $ax + by + c_1 = 0$ と $ax + by + c_2 = 0$ はユークリッド平面では交わりませんが、その外積はきちんと定義されます。

$$
(a, b, c_1) \times (a, b, c_2) = (c_2 - c_1)\,(b, -a, 0) \sim (b, -a, 0).
$$

結果は $x_3 = 0$ です。これは**無限遠点**（point at infinity、理想点とも呼びます）で、$(b, -a)$ は 2 本の直線に共通の方向です。図の上半分では、$w = 0$ の平面内にあって決して $w = 1$ に届かない光線がこれに当たります。すべての無限遠点は $x_3 = 0$、すなわち $(0, 0, 1)\,\tilde{\mathbf x} = 0$ を満たすので、一本の直線上に並びます。これが**無限遠直線**（line at infinity）$\mathbf l_\infty = (0, 0, 1)^\top$ です（コードは $(0, 0, -1)$ と出力しましたが、同じ直線です）。

これは記法上のトリックではありません。画像の中では、カメラがその方向に対してちょうど垂直に向いていない限り、方向の無限遠点は実在する有限の画素になります。平行線の像が収束する**消失点**（vanishing point）です。1.6 節でこれを計算します。

### 1.4 射影空間 $\mathbb P^3$

同じ構成を 1 次元上げると**射影 3 次元空間**になります。3D の点 $(X, Y, Z)$ はスケールを除いて $\tilde{\mathbf X} = (X, Y, Z, 1)^\top$ と書かれ、無限遠点 $(d_x, d_y, d_z, 0)^\top$ は 3D の方向、平面 $\boldsymbol\pi^\top \tilde{\mathbf X} = 0$ は 4 次元ベクトル $\boldsymbol\pi = (n_x, n_y, n_z, -d)^\top$（単位法線 $\mathbf n$、原点からの距離 $d$）です。すべての無限遠点は**無限遠平面** $\boldsymbol\pi_\infty = (0, 0, 0, 1)^\top$ の上にあります。点 $(\mathbf X, 1)$ と方向 $(\mathbf d, 0)$ の区別はグラフィックスで見たものと同じです。平行移動は点を動かしますが、方向は動かしません。

### 1.5 射影変換とその階層

平面の**射影変換**（projective transformation、ホモグラフィ、homography）は、同次座標の点に作用する任意の正則な $3 \times 3$ 行列 $H$ です：$\tilde{\mathbf x}' = H \tilde{\mathbf x}$。自由度は $8$ です（9 個の要素から全体のスケールを除く）。射影変換は直線を直線へ写します。$\mathbf l^\top \tilde{\mathbf x} = 0$ ならば

$$
\mathbf l'^\top \tilde{\mathbf x}' = 0 \quad\text{ただし}\quad \mathbf l' = H^{-\top} \mathbf l ,
$$

です。$(H^{-\top}\mathbf l)^\top H \tilde{\mathbf x} = \mathbf l^\top H^{-1} H \tilde{\mathbf x} = 0$ だからです。点は $H$ で、直線は逆転置で変換されます。グラフィックスにおける法線ベクトルの変換規則と同じです。

$H$ を制限すると、入れ子になった群の族が得られます。小さい群ほど多くの性質を保ちます。

| 群 | 行列の形 | 自由度 | 保たれるもの |
| --- | --- | --- | --- |
| ユークリッド $SE(2)$ | $\begin{pmatrix} R & \mathbf t \\\\ \mathbf 0^\top & 1 \end{pmatrix}$ | 3 | 長さ、角度、面積 |
| 相似 $\mathrm{Sim}(2)$ | $\begin{pmatrix} sR & \mathbf t \\\\ \mathbf 0^\top & 1 \end{pmatrix}$ | 4 | 角度、長さの比 |
| アフィン $\mathrm{Aff}(2)$ | $\begin{pmatrix} A & \mathbf t \\\\ \mathbf 0^\top & 1 \end{pmatrix}$ | 6 | 平行性、面積比、無限遠直線 |
| 射影 $PGL(3)$ | $\begin{pmatrix} A & \mathbf t \\\\ \mathbf v^\top & v \end{pmatrix}$ | 8 | 共線性、接続関係、複比 |

射影とアフィンを分けるのは最下行の $\mathbf v^\top$ です。アフィン変換は無限遠点 $(d_1, d_2, 0)$ を別の無限遠点へ写すので、平行線は平行のままです。$\mathbf v \neq \mathbf 0$ の射影変換では第 3 座標が $v\_1 d\_1 + v\_2 d\_2$ になり、ただ一つの方向を除いて 0 ではありません。方向が有限の点になり、平行線はそこで交わるようになります。（例外は無限遠に残るただ一つの方向で、$\mathbf l_\infty$ の像の上にあります。右下の要素 $v$ はふつう 1 に正規化しますが、0 になることもあるので、一般形では残しておきます。）

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-transform-hierarchy.svg" caption="同じ $3\times 3$ の格子（点線の正方形、薄い灰色の線）と円を、各群の一つの変換で写したもの。群名の後の数字は自由度です。$\mathrm{SE}(2)$ は 25° 回転して平行移動し、$\mathrm{Sim}(2)$ は代わりに −25° 回転し、0.65 倍に縮小して平行移動します。アフィン変換はせん断を含むので円は楕円になりますが、赤い線同士は平行のままです。射影変換（最下行 $(0.2, 0.25, 1)$）だけが、平行線の各族を有限の点に収束させます（破線の延長）。赤い族は $H(1,0,0)^\top$ に、青い族は $H(0,1,0)^\top$ に収束します。" %}

ホモグラフィは抽象的な概念にとどまりません。ピンホールカメラで撮った平面の画像は、平面そのものとホモグラフィで結ばれます。同じ平面を写した 2 枚の画像（あるいは光学中心まわりに回転するカメラで撮った 2 枚の画像）もホモグラフィで結ばれます。第 2 回では、これを使ってチェッカーボードの画像からカメラをキャリブレーションします。

### 1.6 消失点、地平線、そしてそれらによるキャリブレーション

これで線路が収束する理由を説明できます。2 節を先取りして、カメラを $P = K[R \mid \mathbf t]$ とします。点 $\mathbf A$ を通り方向 $\mathbf d$ をもつ 3D の直線は $\mathbf X(\lambda) = \mathbf A + \lambda \mathbf d$ です。同次座標では

$$
P \begin{pmatrix} \mathbf A + \lambda\mathbf d \\ 1 \end{pmatrix}
= P \begin{pmatrix} \mathbf A \\ 1 \end{pmatrix} + \lambda\, P \begin{pmatrix} \mathbf d \\ 0 \end{pmatrix}
\;\xrightarrow{\;\lambda\to\infty\;}\; \sim P \begin{pmatrix} \mathbf d \\ 0 \end{pmatrix} = K R\,\mathbf d .
$$

したがって方向 $\mathbf d$ の**消失点**は

$$
\mathbf v = K R\, \mathbf d .
$$

です。これは $\mathbf A$ に依存しません。方向 $\mathbf d$ をもつすべての直線は同じ像点に収束します。$\mathbf t$ にも依存しません。カメラを平行移動しても消失点は決して動かないので、ドライブ中に月がついてくるように見えるのです。世界座標軸の消失点は $P$ の最初の 3 列です。

単位法線 $\mathbf n$ をもつ平面は $\mathbf d \perp \mathbf n$ となるすべての方向を含み、それらの消失点は**消失線**（vanishing line）

$$
\mathbf l = K^{-\top} R\, \mathbf n
$$

を埋め尽くします。$\mathbf l^\top \mathbf v = \mathbf n^\top R^\top K^{-1} K R\,\mathbf d = \mathbf n^\top \mathbf d = 0$ だからです。地面の場合、この直線が**地平線**（horizon）です。

**消失点によるキャリブレーション。** 画素を逆投影すると、カメラ座標系での光線の方向が得られます：$\mathbf r = K^{-1}\tilde{\mathbf x}$。スキューが 0、画素が正方形、主点 $\mathbf c$ が既知と仮定します（この仮定は後で緩めます）。すると $K^{-1}(u, v, 1)^\top = \big((u - c_x)/f,\ (v - c_y)/f,\ 1\big)^\top$ であり、**直交する**世界の方向の消失点 $\mathbf v_1, \mathbf v_2$ は直交する光線を与えます。

$$
\frac{(\mathbf v_1 - \mathbf c)\cdot(\mathbf v_2 - \mathbf c)}{f^2} + 1 = 0
\quad\Longrightarrow\quad
f = \sqrt{-(\mathbf v_1 - \mathbf c)\cdot(\mathbf v_2 - \mathbf c)} .
$$

互いに直交する 3 方向（箱の稜、建物の X、Y、Z）があれば、このような式が 3 つ得られます。そのうち 2 つを引き算すると $(\mathbf v_1 - \mathbf c)\cdot(\mathbf v_2 - \mathbf v_3) = 0$ となり、主点は三角形 $\mathbf v_1\mathbf v_2\mathbf v_3$ の $\mathbf v_1$ からの垂線上にあります。対称性から、3 本の垂線すべての上にあります。**主点は消失点の三角形の垂心です**。Caprile と Torre（1990）がキャリブレーションに用いた古典的な結果です。

```python
import numpy as np

def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])

def rot_z(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])

def camera_R(yaw, pitch, roll=0.0):
    """World-to-camera rotation. World: X east, Y north, Z up. Camera (OpenCV): x right,
    y down, z forward. yaw > 0 turns left, pitch > 0 looks up, roll > 0 turns the image
    clockwise. With all three zero the camera looks north with a level horizon."""
    R0 = np.array([[1.0, 0, 0], [0, 0, -1], [0, 1, 0]])   # rows: camera axes in world coordinates
    return rot_z(roll).T @ rot_x(-pitch) @ R0 @ rot_z(yaw).T

f, W, H = 800.0, 1280, 720
K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
R = camera_R(np.deg2rad(30), np.deg2rad(-15))     # turned 30 deg left, looking 15 deg down

V = K @ R                     # column i = vanishing point of world axis i (homogeneous)
vx, vy, vz = (V[:, i] / V[2, i] for i in range(3))
print("v_X =", vx[:2].round(1), " v_Y =", vy[:2].round(1), " v_Z =", vz[:2].round(1))

horizon = np.linalg.inv(K).T @ R @ np.array([0, 0, 1.0])   # vanishing line of the ground plane
print("horizon passes through v_X, v_Y:", np.allclose([horizon @ vx, horizon @ vy], 0))

# focal length from two orthogonal vanishing points (square pixels, zero skew, known c)
c = np.array([W / 2, H / 2])
f_est = np.sqrt(-(vx[:2] - c) @ (vy[:2] - c))
print("f from (v_X, v_Y):", f_est.round(3))

# with three finite vanishing points, c is the orthocentre of their triangle
A = np.array([vy[:2] - vz[:2], vx[:2] - vz[:2]])
b = np.array([(vy[:2] - vz[:2]) @ vx[:2], (vx[:2] - vz[:2]) @ vy[:2]])
print("orthocentre:", np.linalg.solve(A, b).round(3))
```

出力は $\mathbf v_X = (-794.5, 145.6)$、$\mathbf v_Y = (1118.2, 145.6)$、$\mathbf v_Z = (640, 3345.6)$ です。3 つのうち 2 つは $1280\times 720$ の画像の外にありますが、これは普通のことです。像平面はセンサーよりずっと広がっています。地平線は $\mathbf v_X$ と $\mathbf v_Y$ を通り（`True`）、焦点距離はちょうど $800.0$ と復元され、垂心は $(640, 360)$、すなわち主点です。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-vanishing-points.svg" caption="コードのシーン：地面の格子と 4 つの箱を、左に 30° 向き下に 15° 傾いたカメラで見たもの（$f=800$、黒枠が $1280\times720$ の画像）。左：世界の $X$ 方向の稜（赤）は $\mathbf v_X=(-794.5,145.6)$ に、$Y$ 方向の稜（緑）は $\mathbf v_Y=(1118.2,145.6)$ に収束し、どちらも地平線（紫、$v=145.6$）上にあります。カメラが下を向いているので、鉛直の稜（青）は下方へ、画面のはるか下の $v=3346$ にある $\mathbf v_Z$ へ収束します。右：3 つの消失点の三角形。3 本の垂線（破線）は主点 $\mathbf c=(640,360)$ で交わります。" %}

下のウィジェットで試してみてください。カメラを水平にする（ピッチ 0）と何が起きるかに注目してください。鉛直の稜は画像上で平行になり、$\mathbf v_Z$ は無限遠へ移ります。残る 2 つの消失点からは $f$ は求まりますが、主点全体は求まりません。

{% include widget.liquid name="3d-vision-vanishing-points" height="720" caption="箱のシーンの消失点。ビューをドラッグするとカメラが回ります（左右はヨー、上下はピッチ）。スライダーも使えます。濃い長方形が画像で、ビューの残りは延長された像平面です。読み取り欄には各 $\mathbf v_i = KR\,\mathbf e_i$ が同次形式で表示されます。無限遠にある消失点は第 3 座標が 0 です。$\mathbf v_X$ と $\mathbf v_Y$ から復元した焦点距離を真の値と比べ、消失点の三角形の垂線が主点で交わる様子を観察してください。" %}

## 2. ピンホールカメラ

### 2.1 中心投影

カメラ中心を原点に置き、$+z$ の方向を見るとします。OpenCV にならい、カメラ座標系は $x$ が右、$y$ が**下**、$z$ が前です（他の約束事は 4 節で扱います）。この座標系の点 $\mathbf X_c = (X, Y, Z)$ と中心を光線で結ぶと、その光線は平面 $z = 1$（**正規化画像平面**、normalized image plane）と、相似三角形により次の位置で交わります。

$$
x = \frac{X}{Z}, \qquad y = \frac{Y}{Z} .
$$

実際のピンホールカメラは、穴の後ろ距離 $F$ の位置に倒立像を作ります。中心の前に仮想的な像平面を置けば、他は何も変えずに反転だけを取り除けます。同次座標では投影は線形です。

$$
Z \begin{pmatrix} x \\ y \\ 1 \end{pmatrix} = \begin{pmatrix} 1 & 0 & 0 & 0 \\ 0 & 1 & 0 & 0 \\ 0 & 0 & 1 & 0 \end{pmatrix}
\begin{pmatrix} X \\ Y \\ Z \\ 1 \end{pmatrix} = [I \mid \mathbf 0]\, \tilde{\mathbf X}_c .
$$

奥行きは失われます。光線 $\lambda \mathbf X_c$ 上のすべての点が同じ $(x, y)$ に落ちます。それを取り戻すことが、このシリーズの残りすべての目的です。

### 2.2 内部パラメータ：メートルから画素へ

センサーが測るのは正規化座標ではなく画素です。焦点距離 $F$（mm）のレンズと、一辺 $p$（mm）の正方形画素を考えると、正規化座標 $x$ は光軸から $F x$ mm、すなわち $F x / p$ 画素の位置に対応します。光軸の画素位置を加えると

$$
u = f_x\, x + s\, y + c_x, \qquad v = f_y\, y + c_y, \qquad
K = \begin{pmatrix} f_x & s & c_x \\ 0 & f_y & c_y \\ 0 & 0 & 1 \end{pmatrix},
$$

となり、次の 5 つの**内部パラメータ**（intrinsic parameters）が現れます。

- $f_x = F / p_x$ と $f_y = F / p_y$：画素単位の焦点距離。画素が正方形でない場合や、画像が異方的にリサンプリングされた場合にだけ異なります。
- $(c_x, c_y)$：**主点**（principal point）。光軸がセンサーと交わる位置で、画像中心に近いものの、ちょうど中心にあることはまれです。
- $s$：**スキュー**（skew）。センサーの軸が直交していない場合だけ 0 でない値をとります。現代のカメラではほぼすべて $0$ ですが、トリミングされた画像や、せん断を含む補正を受けた画像では注意してください。

すると $\tilde{\mathbf u} \sim K \mathbf x$ であり、逆向きの**逆投影**（back-projection）は $K^{-1}\tilde{\mathbf u}$、つまり画素の光線の方向です。水平画角は画像の幅 $W$ から求まります。主点が中央にあれば $\theta_x = 2\arctan\\!\big(W / (2 f_x)\big)$ です。

**計算例。** 焦点距離 $F = 4.0$ mm のレンズと画素ピッチ $1.6\ \mu$m のセンサーなら $f = 4.0 / 0.0016 = 2500$ 画素です。$(c_x, c_y) = (2000, 1500)$ の $4000 \times 3000$ 画像では、水平画角は $2\arctan(2000/2500) = 77.3°$ です。点 $\mathbf X_c = (0.5, -0.2, 4.0)$ m は $(x, y) = (0.125, -0.05)$ となり、$u = 2500 \cdot 0.125 + 2000 = 2312.5$、$v = 2500 \cdot (-0.05) + 1500 = 1375$ に写ります。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-intrinsics.svg" caption="各内部パラメータが、同じチェッカーボード（10 cm の正方形 8×6 個、距離 1.2 m、25° 回転）の 640×480 画像（紫の枠）中の像に与える影響。赤い十字は主点です。大きな $f$ は主点を中心に拡大し、$f_y=0.8f_x$ は縦方向に押しつぶし、$(c_x,c_y)$ を動かすと形を変えずに画像が平行移動します。スキュー $s=150$ は各行を $y$ に比例して横にずらします。最後のパネルは $K$ を変えずにカメラを回転させたもの（$R$ は外部パラメータ）で、ボードの透視の様子が変わります。これは $K$ をどう変えても作り出せません。" %}

図の最後のパネルは大切な教訓を含んでいます。$K$ を変えることは画像の 2D アフィン変形（最下行が $(0, 0, 1)$ のホモグラフィ）にすぎず、画像の枠内に入る範囲を除けば、どの 3D 点が同じ光線上に並ぶか、どの面がどの面を隠すかは決して変わりません。透視そのものを変えるのは姿勢の変化です。

### 2.3 外部パラメータ：カメラはどこにあるか

世界の点がカメラ座標で与えられることはまれです。**外部パラメータ**（extrinsics）は世界からカメラへの剛体変換

$$
\mathbf X_c = R\, \mathbf X_w + \mathbf t
$$

で、回転 $R \in SO(3)$（自由度 3）と並進 $\mathbf t$（自由度 3）からなります。$R$ の各行は、カメラの $x$、$y$、$z$ 軸を世界座標で表したものと読めます。**カメラ中心**はカメラの原点に写る世界の点で、$R\mathbf C + \mathbf t = \mathbf 0$ より $\mathbf C = -R^\top \mathbf t$ です。$\mathbf t$ はカメラの位置*ではなく*、カメラ座標系で表した世界の原点であることに注意してください。$\mathbf t$ と $\mathbf C$ の混同は、姿勢に関する最もよくあるバグの一つです。もう一つの大きな種類である座標規約の取り違えは 4 節で扱います。

### 2.4 カメラ行列 $P = K[R \mid \mathbf t]$ とその中身

3 つの段階をつなげると、完全なピンホールカメラになります。

$$
\lambda \begin{pmatrix} u \\ v \\ 1 \end{pmatrix} = K \,[R \mid \mathbf t] \begin{pmatrix} \mathbf X_w \\ 1 \end{pmatrix} = P\,\tilde{\mathbf X}_w,
\qquad \lambda = Z_c \;(\text{奥行き}).
$$

$P$ は自由度 11（12 個の要素からスケールを除く）の $3\times 4$ 行列で、内部パラメータが 5、外部パラメータが 6 です。逆に、左の $3\times 3$ ブロック $M$ が正則な $3\times 4$ 行列はどれも有限射影カメラであり、$K$、$R$、$\mathbf t$ に分解し直せます（2.5 節）。$P = [M \mid \mathbf p_4]$ と書き、各行を $\mathbf p^{1\top}, \mathbf p^{2\top}, \mathbf p^{3\top}$ とします。$P$ からは多くの幾何を直接読み取れます。

- **カメラ中心。** $P\tilde{\mathbf C} = \mathbf 0$：中心は $P$ の右零ベクトルで、$\mathbf C = -M^{-1}\mathbf p_4$ です。像をもたない唯一の点です。
- **列。** 最初の 3 列は $P(\mathbf e_i, 0)^\top$、すなわち世界の $X$、$Y$、$Z$ 軸の消失点です（1.6 節）。4 列目は世界の原点の像です。
- **行は平面。** $\mathbf p^{1\top}\tilde{\mathbf X} = 0$ は $u \cdot \lambda = 0$ を意味し、中心を通って画像の列 $u = 0$ に写る平面です。同様に $\mathbf p^{2}$ は画像の行 $v = 0$ の平面、$\mathbf p^{3}$ は中心を通り像平面に平行な**主平面**（principal plane）で、奥行き $0$ の点、つまり無限遠に写る点の集合です。
- **主軸。** $M$ の第 3 行 $\mathbf m^3$ は主平面の法線なので、光軸の方向を向きます。$P$ はスケール（符号を含む）を除いてしか定まらないので、視線方向は $\det(M)\,\mathbf m^3$ です。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-camera-matrix.svg" caption="次のコードのカメラ。$\mathbf C=(1,-0.6,-3)$ から世界の原点（軸 $X$、$Y$、$Z$。OpenCV の世界は $y$ が下向きなので、図では $-Y$ を上に描いています）を見ています。紫の四角形は奥行き 1 の位置の画像矩形です。赤い平面は $\mathbf p^{1\top}\mathbf X=0$、すなわち $\mathbf C$ と画像の左端 $u=0$ を通る平面、緑の平面は上端 $v=0$ を通る $\mathbf p^{2\top}\mathbf X=0$、青い平面は主平面 $\mathbf p^{3\top}\mathbf X=0$（奥行き 0）です。矢印は主軸 $\mathbf m^3=(-0.311,0.186,0.932)$ です。スクリプトは、描いた各平面上のすべての点が $P$ の対応する行を 0 にすることを assert で確認しています。" %}

### 2.5 $P$ を分解する：RQ 分解

手元に $P$ しかないことはよくあります。DLT による推定（第 2 回）、データセット、あるいは OpenGL エンジンから得た場合です。$K$、$R$、$\mathbf t$ を取り出すには左のブロックに注目します。$M = K R$ は上三角行列と直交行列の積です。これはまさに **RQ 分解**で、よく知られた QR 分解の鏡像です。分解は符号を除いて一意です。$D = \mathrm{diag}(\pm1, \pm1, \pm1)$ を挟んで $M = (KD)(DR)$ としても、$D^2 = I$ なので正しい分解になります。そこで $K$ の対角成分が正になるように符号を固定します。もう一つ注意点があります。$P$ はスケールを除いてしか分からず、そのスケールは負かもしれません。$\det M < 0$ なら $\det R = -1$、つまり鏡映が得られてしまうので、まず $P$ の符号を反転します。最後に $\mathbf p_4 = K\mathbf t$ から $\mathbf t$ を求め、$K_{33} = 1$ となるよう $K$ を正規化します。

```python
import numpy as np
from scipy.linalg import rq

def decompose_P(P):
    """Split a 3x4 camera matrix (known only up to scale and sign) into K, R, t and C."""
    P = P if np.linalg.det(P[:, :3]) > 0 else -P   # det(M) > 0  <=>  det(R) = +1
    K, R = rq(P[:, :3])                            # M = K R, K upper triangular, R orthogonal
    S = np.diag(np.sign(np.diag(K)))               # S @ S = I: flip signs so diag(K) > 0
    K, R = K @ S, S @ R
    t = np.linalg.solve(K, P[:, 3])                # p4 = K t (before rescaling K)
    K = K / K[2, 2]
    C = -R.T @ t                                   # camera centre, also the null vector of P
    return K, R, t, C

# a ground-truth camera: 640x480, fx = 800, fy = 780, skew 2, looking at the origin from C
K_true = np.array([[800.0, 2.0, 330.0], [0, 780.0, 245.0], [0, 0, 1]])
C_true = np.array([1.0, -0.6, -3.0])
z = -C_true / np.linalg.norm(C_true)                       # forward: towards the origin
x = np.cross(z, [0, -1.0, 0]); x /= np.linalg.norm(x)     # right ("up" is -y in OpenCV)
R_true = np.stack([x, np.cross(z, x), z])                 # rows: camera axes in world coordinates
t_true = -R_true @ C_true
P = -3.7 * K_true @ np.c_[R_true, t_true]                 # arbitrary (negative) scale

K, R, t, C = decompose_P(P)
print("K =\n", K.round(4))
print("R error:", np.abs(R - R_true).max(), " det R:", np.linalg.det(R).round(6))
print("C =", C.round(6), " P @ [C, 1] =", (P @ np.append(C, 1)).round(9))
print("principal axis m3 =", R[2].round(4))
```

任意の係数 $-3.7$ を掛けていても、分解は $K$ を正確に返し（`[[800, 2, 330], [0, 780, 245], [0, 0, 1]]`）、$R$ は $2\times10^{-16}$ 以内の誤差で $\det R = 1$、中心は $(1, -0.6, -3)$ で $P\tilde{\mathbf C} = \mathbf 0$、主軸は $(-0.3107, 0.1864, 0.9321)$ で、構成どおり $\mathbf C$ から原点へ向いています。符号の処理を省くと、焦点距離が負の $K$ や、行列式が $-1$ の「回転」が得られます。どちらも他のツールから書き出された行列を扱うと実際に起こります。

### 2.6 透視が弱まるとき：アフィンカメラ

シーンの奥行きの幅が距離に比べて小さい場合（望遠撮影、衛星画像）、すべての点の奥行きはほぼ $Z \approx Z_0$ となり、投影はほぼ線形になります：$u \approx (f/Z_0) X + c_x$。この**弱透視**（weak perspective）カメラ、より一般には**アフィンカメラ**（affine camera）では、$P$ の最下行が $(0, 0, 0, 1)$ です。平行線は平行のままで、有限の消失点は存在しません。古典的な Structure-from-Motion の因子分解法の背後にあるカメラモデルであり、便利な警告サインにもなります。シーンの平行線の像がほとんど収束しない（すべての消失点が画像のはるか外にある）なら、ビューはアフィンに近く、奥行きを拘束する透視の手がかりは弱くなります。

## 3. レンズ歪み

### 3.1 Brown-Conrady モデル

実際のレンズはピンホールではありません。特に広角レンズは、画像の端近くの直線を曲げます。Conrady（1919）と Brown（1966）による標準的なモデルは、OpenCV や COLMAP の `OPENCV` カメラで使われており、$K$ を掛ける前に**正規化**座標 $(x, y) = (X/Z, Y/Z)$ に非線形写像を施します。

$$
\begin{aligned}
x_d &= x\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + 2p_1 xy + p_2 (r^2 + 2x^2),\\
y_d &= y\,(1 + k_1 r^2 + k_2 r^4 + k_3 r^6) + p_1 (r^2 + 2y^2) + 2p_2 xy,
\end{aligned}
\qquad r^2 = x^2 + y^2,
$$

その後 $u = f_x x_d + s\, y_d + c_x$、$v = f_y y_d + c_y$ とします。**放射方向**（radial）の項 $k_i$ は光軸まわりに回転対称なレンズを表し、$k_1 < 0$ は**樽型**歪み（点が中心へ引き寄せられる）、$k_1 > 0$ は**糸巻き型**歪みです。**接線方向**（tangential）の項 $p_1, p_2$ は、センサーに対してわずかに偏心または傾いたレンズを表します。OpenCV の完全なモデルは、有理式の放射因子（$k_4$ から $k_6$）、薄いプリズムの項、センサーの傾きを加えて、合計 14 個の係数をもちます。多くのキャリブレーションでは $(k_1, k_2, p_1, p_2)$ だけを使い、強い広角レンズの場合にだけ $k_3$ を加えます。[ニューラルレンダリングの第 1 回]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})では樽型と糸巻き型が格子をどう歪めるかを示しました。ここでは、このモデルを使うときに本当に重要な性質を見ていきます。

**多項式が信頼できるのはキャリブレーションした範囲の中だけです。** 放射方向のプロファイル $r_d = r(1 + k_1 r^2 + k_2 r^4)$ を見てください。樽型歪みでは、これはいずれ増加をやめて折り返します。すると 2 本の異なる光線が同じ画素に写り、モデルは逆変換できなくなります。$k_1 = -0.4$（$k_2 = 0$）の場合、折り返しは $dr_d/dr = 1 + 3k_1 r^2 = 0$、すなわち $r = 1/\sqrt{1.2} = 0.913$ で起こり、画角にすると $\arctan(0.913) = 42.4°$ です。それより広い画角のレンズはこの係数ではそもそも表現できず、データの範囲を超えて外挿したキャリブレーションは、画像の隅でこのような振る舞いを起こすことがあります。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-distortion-radial.svg" caption="左：放射方向のプロファイル $r_d(r)$。歪みがなければ（灰）$r_d=r$ です。紫の曲線は次のコードのレンズ（$k_1=-0.28$、$k_2=0.07$）で、全範囲で単調です。$k_1=-0.4$（赤）は $r=0.913$ で折り返し、その先ではモデルは意味をもちません。$k_1=+0.2$（青）は糸巻き型です。点線は $f=600$ の 640×480 画像の隅 $r=0.667$ を示します。右：そのレンズの 3 点について、コードの不動点法による歪み補正の誤差を反復回数 $n$ に対して示したもの。収束は線形（対数軸で直線）で、中心から遠い点ほど遅くなります（$r=0.18$、$0.63$、$0.89$）。" %}

### 3.2 点の歪み補正と画像の歪み補正

「歪み補正（undistort）」には異なる 2 つの操作があり、モデルを逆向きに使います。

**点**（幾何計算に使う特徴点の位置）：観測されるのは歪んだ $(x_d, y_d)$ で、必要なのは理想的な $(x, y)$、つまり上の写像の逆です。これは閉じた形では書けません。単純な不動点反復がよく機能します。$(x, y) = (x_d, y_d)$ から始め、現在の推定値で放射因子と接線方向のずれを計算し、それらを固定して順方向の式を $(x, y)$ について解きます。OpenCV の点の歪み補正も同じ種類の反復を使っています。

```python
import numpy as np

def distort(x, y, k1=0.0, k2=0.0, p1=0.0, p2=0.0, k3=0.0):
    """Brown-Conrady (OpenCV order k1, k2, p1, p2, k3) on normalized coordinates."""
    r2 = x * x + y * y
    radial = 1 + k1 * r2 + k2 * r2**2 + k3 * r2**3
    xd = x * radial + 2 * p1 * x * y + p2 * (r2 + 2 * x * x)
    yd = y * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y
    return xd, yd

def undistort(xd, yd, iters=20, **coef):
    """Invert distort() by fixed-point iteration: x = (x_d - tangential(x)) / radial(x)."""
    x, y = xd, yd                                      # initial guess: no distortion
    for _ in range(iters):
        r2 = x * x + y * y
        radial = 1 + coef.get("k1", 0) * r2 + coef.get("k2", 0) * r2**2 + coef.get("k3", 0) * r2**3
        dx, dy = distort(x, y, p1=coef.get("p1", 0), p2=coef.get("p2", 0))
        x = (xd - (dx - x)) / radial                   # dx - x is the tangential part
        y = (yd - (dy - y)) / radial
    return x, y

coef = dict(k1=-0.28, k2=0.07, p1=0.001, p2=-0.0005)   # a wide-angle lens (illustrative values)
x0, y0 = 0.50, 0.38                   # near the corner of a 640 x 480 image with f = 600
xd, yd = distort(x0, y0, **coef)
for n in (1, 2, 5, 10, 20):
    xu, yu = undistort(xd, yd, iters=n, **coef)
    print(f"{n:2d} iterations: error {np.hypot(xu - x0, yu - y0):.2e}")
print("distorted:", round(xd, 4), round(yd, 4), " shift in pixels at f = 600:",
      round(600 * np.hypot(xd - x0, yd - y0), 1))
```

このレンズは画像の隅に近い点を $37.4$ 画素動かし、$(0.4502, 0.3427)$ へ移します。1、2、5、10、20 回の反復後の補正誤差は、それぞれ $1.2\times10^{-2}$、$2.3\times10^{-3}$、$1.7\times10^{-5}$、$4.9\times10^{-9}$、$5.2\times10^{-16}$ で、1 ステップごとにほぼ一定の割合で減ります。$f = 600$ では 5 回の反復で $10^{-2}$ 画素が残ります。多くの用途には十分ですが、強いレンズの外側の隅には不十分です。固定の反復回数を信用するより、残差を確認するほうが得策です。

**画像**（ピンホールを仮定するアルゴリズム、たとえばオリジナルの 3DGS ラスタライザのためにピンホール画像を用意する場合）：*出力*（補正後）画像の各画素について、撮影画像のどこから来たかを計算してそこをサンプリングします。これに必要なのは**順方向**のモデル `distort` だけなので、画像の歪み補正は高速かつ正確です（`cv2.initUndistortRectifyMap` の後に `cv2.remap`）。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-distortion-image.svg" caption="コードのレンズを $f=600$ の 640×480 画像に適用したもの。(a) 平らなチェッカーボード（40 画素の正方形）を撮影した合成画像。樽型歪みで外側の正方形が曲がっています。これを描画するには逆モデル、つまり画素ごとに `undistort` が必要です。(b) 順方向モデルだけで計算した補正画像。出力画素をそれぞれ歪ませ、撮影画像 (a) のその位置をサンプリングします。正方形は再び正方形になります。(c) 画素単位の変位 $f\,\Vert\mathbf x_d-\mathbf x\Vert$ と 2、5、10、20、30 画素の等高線。隅では 44.8 画素に達し、バツ印はコードの点（37.4 画素）です。" %}

実用上の帰結が一つあります。樽型歪みでは、補正画像の隅は撮影画像の*内側*から来ており、撮影画像の隅は補正画像の*外側*に写ります。トリミングする（出力画素がすべて有効）か、入力画素をすべて残す（黒い縁が出る）かを選ぶ必要があります。`cv2.getOptimalNewCameraMatrix` はまさにこのトレードオフを `alpha` パラメータで指定でき、補正画像用の新しい $K$ を返します。

### 3.3 魚眼レンズと Kannala-Brandt モデル

ピンホールは、光軸から角度 $\theta$ の光線を画像上の半径 $r = f\tan\theta$ に写します。$\theta \to 90°$ でこれは発散します。$f = 300$ 画素なら、60°、80°、89° の光線は中心からそれぞれ 520、1701、17187 画素の位置に落ちます。どんなセンサーもこの方法で 180° の視野を収められず、$\tan\theta$ を多項式で補正しても解決しません。魚眼レンズは別の**射影関数** $r(\theta)$ に基づいて設計されています。

| 射影 | $r(\theta)$ | 典型的な用途 |
| --- | --- | --- |
| 透視（ピンホール） | $f\tan\theta$ | 通常のレンズ。非常に広い画角には不向き |
| 等距離射影 | $f\theta$ | 多くの魚眼レンズ。半径が角度に比例 |
| 等立体角射影 | $2f\sin(\theta/2)$ | 等面積の魚眼 |
| 立体射影 | $2f\tan(\theta/2)$ | 局所的な形を保つ（等角） |
| 正射影 | $f\sin\theta$ | 180° まで |

Kannala と Brandt（2006）は、これらのどれでも、またその中間にある実際のレンズでも、角度の奇数次多項式で表すことを提案しました。

$$
r(\theta) = f\,\theta_d, \qquad \theta_d = \theta\,(1 + k_1\theta^2 + k_2\theta^4 + k_3\theta^6 + k_4\theta^8),
\qquad \theta = \operatorname{atan2}\!\big(\sqrt{X^2 + Y^2},\, Z\big),
$$

画素は $u = f_x\,\theta_d \cos\varphi + c_x$、$v = f_y\,\theta_d \sin\varphi + c_y$ で、方位角 $\varphi = \operatorname{atan2}(Y, X)$ は変わりません。これは OpenCV の `cv::fisheye` モジュールと COLMAP の `OPENCV_FISHEYE` カメラのモデルです。うまく機能する理由は 2 つあります。第一に、$\tan\theta$ ではなく $\theta$ の多項式なので、90° やそれ以上でも有限のままです。第二に、$\theta = \operatorname{atan2}(\rho, Z)$ を $X/Z$ からではなく 3D の光線から計算するので、像平面の後ろにある $Z \le 0$ の光線も扱えます。ピンホールモデルではそもそも表現できない光線です。ただしこれは式の性質であって、すべての実装の性質ではありません。OpenCV の `cv::fisheye` の関数は正規化座標 $(X/Z, Y/Z)$ を入力として $\theta = \arctan r$ を計算し、COLMAP の魚眼モデルも同様に $Z$ で割って $Z \le 0$ の点を棄却します。したがってこれらのライブラリでは、このモデルはカメラ前方の光線（180° 未満の視野）しか扱えません。より広角のレンズでは、下のコードのように光線から `atan2` で投影してください。

```python
import numpy as np

def project_kb(Xc, K, k):
    """Kannala-Brandt / OpenCV fisheye: r_d = theta (1 + k1 theta^2 + ... + k4 theta^8)."""
    rho = np.hypot(Xc[:, 0], Xc[:, 1])
    theta = np.arctan2(rho, Xc[:, 2])                  # angle to the optical axis, also > 90 deg
    t2 = theta**2
    theta_d = theta * (1 + k[0] * t2 + k[1] * t2**2 + k[2] * t2**3 + k[3] * t2**4)
    phi = np.arctan2(Xc[:, 1], Xc[:, 0])               # the azimuth is unchanged
    xd, yd = theta_d * np.cos(phi), theta_d * np.sin(phi)
    return np.c_[K[0, 0] * xd + K[0, 1] * yd + K[0, 2], K[1, 1] * yd + K[1, 2]]

# a 190-degree equisolid lens r = 2 f sin(theta / 2), fitted by the 4 KB coefficients
f = 300.0
theta = np.linspace(0, np.deg2rad(95), 200)
r_true = 2 * f * np.sin(theta / 2)
A = f * np.stack([theta**3, theta**5, theta**7, theta**9], 1)   # r = f (theta + k1 theta^3 + ...)
k = np.linalg.lstsq(A, r_true - f * theta, rcond=None)[0]
print("k =", k.round(6))
print(f"max fit error: {np.abs(f * theta + A @ k - r_true).max():.1e} px")
print("pinhole radius at 60/80/89 deg:", (f * np.tan(np.deg2rad([60, 80, 89]))).round(0))

# a ray 95 degrees off the axis (behind the plane Z = 0) still lands in the image
K = np.array([[f, 0, 640.0], [0, f, 480.0], [0, 0, 1]])
X = np.array([[np.sin(np.deg2rad(95)), 0.0, np.cos(np.deg2rad(95))]])
print("pixel of a ray at 95 deg:", project_kb(X, K, k).round(1))
```

$r = f(\theta + k_1\theta^3 + \dots)$ は $k_i$ について線形なので、レンズの曲線への当てはめは線形最小二乗問題になります。等立体角レンズの場合、当てはめは $k = (-0.041667, 0.000521, -0.000003, 0)$ を与え、0 から 95° での最大誤差は $6.2\times10^{-9}$ 画素です。これは表示された桁の範囲で $2\sin(\theta/2) = \theta - \theta^3/24 + \theta^5/1920 - \dots$ のテイラー係数そのものです。Kannala-Brandt はレンズの射影関数を打ち切ったテイラー級数なのです。光軸から 95° 離れた光線（$Z < 0$）は画素 $(1082.4, 480.0)$ に写ります。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-fisheye-models.svg" caption="左：5 つの射影関数。縦軸は $r/f$、横軸は画角 $\theta$ です。ピンホール $f\tan\theta$ は 90° で発散し（点線）、魚眼のモデルは有限のままです。正射影は 90° で終わります。右：4 係数の Kannala-Brandt による当てはめの最大誤差（コードの最小二乗、$f=300$、0 から 95°）。等立体角レンズは $6.2\times10^{-9}$ 画素、正射影は $6.1\times10^{-6}$ 画素、立体射影は $6.3\times10^{-3}$ 画素です。立体射影のテイラー級数は収束が遅いためです。いずれも実際のキャリブレーションのノイズよりはるかに小さい値です。" %}

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-fisheye-room.svg" caption="6 面の壁に色の異なるチェッカーボードを貼った立方体の中心にカメラを置き、各画素を逆投影して 420×420 のセンサーに描画したもの。90° のピンホール（$f=210$）は正面の壁をちょうど写します。150° のピンホール（$f=56$）は側面の壁も写しますが、それを大きく引き伸ばします。$r=f\tan\theta$ はセンサーの大部分を外側の角度に費やし、正面の壁は小さな正方形に縮みます。180° の等距離魚眼（$f=134$、$r=f\theta$）はセンサーを角度に均等に割り当て、イメージサークルの中に 5 面の壁を写します。まっすぐな稜は曲線になります。" %}

射影モデルがそろったところで、下のウィジェットでここまでの内容をすべて組み合わせます。内部パラメータ、2 つの歪みモデル、チェッカーボードの画像、そして 3D での実際の視野です。

{% include widget.liquid name="3d-vision-camera-model" height="900" caption="インタラクティブなカメラモデル。内部パラメータと歪み係数を動かし、12×9 のチェッカーボードの 640×480 画像を観察してください。橙の破線の輪郭は、同じ $K$ の純粋なピンホールで写した同じボードです。3D ビュー（広い画面では左、スマートフォンでは上）の紫の視錐台は、現在のモデルが実際に見ている視野で、画像の境界を逆投影して求めています（Brown-Conrady は不動点反復、Kannala-Brandt はニュートン法）。「樽型」のプリセットで $k_1$ をさらに負にして、多項式が折り返す所でボードの一部が消えるのを確かめ、次に「魚眼」のプリセットに切り替えて水平画角が 180° を超え、カメラがわずかに後ろまで見えることを確かめてください。" %}

### 3.4 その他の広角モデルと汎用モデル

選択肢は Kannala-Brandt だけではありません。**統一カメラモデル**（unified camera model。Geyer と Daniilidis が ECCV 2000 でカタディオプトリックカメラのために提案し、Mei と Rives が ICRA 2007 で歪み項と平面ターゲットによるキャリブレーションを加えたもの）は、まず点を単位球に投影し、次に光軸に沿ってずらした点から透視投影します。反射鏡を使うカタディオプトリックカメラも扱えます。**ダブルスフィア**モデル（double sphere、Usenko、Demmel、Cremers、3DV 2018）は 2 つの球を使い、広画角レンズに同程度によく当てはまり、しかも閉じた形の逆変換をもちます。投影と逆投影が何百万回も実行されるビジュアルオドメトリでは、これが重要です。Devernay と Faugeras（2001）は、最初に述べた性質、すなわちピンホールカメラは直線を直線に写すという性質を使い、キャリブレーションターゲットなしで歪みを推定しました。反対の極には**汎用**（generic）カメラモデルがあり、パラメトリックな形を捨てて光線方向の密な格子を保持します。Schöps ら（CVPR 2020）は、数千のパラメータをもつこのようなモデルが、通常の 12 個のパラメータより明らかに正確に実際のレンズをキャリブレーションできると論じています。これらのモデルの推定方法は第 2 回で扱います。

### 3.5 ローリングシャッター

ほとんどの CMOS センサーは全行を同時には露光しません。**ローリングシャッター**は画像を 1 行ずつ読み出すので、行 $v$ が撮影される時刻は

$$
t(v) = t_0 + \frac{v}{H}\,\tau
$$

です。$\tau$ はフレームの読み出し時間（典型的には数ミリ秒から数十ミリ秒）です。読み出し中にカメラが動くと、各行はわずかに異なる姿勢から撮影されます：$\mathbf X_c(v) = R(t(v))\,\mathbf X_w + \mathbf t(t(v))$。パンすると鉛直な構造物が傾き、振動で物体が揺れ（「こんにゃく現象」）、高速で回るプロペラは曲がった羽根になります。幾何学的には、画像はもはや中心投影ではありません。Meingast、Geyer、Sastry（2005）がこのモデルを詳しく解析しています。

点が現れる行は姿勢に依存し、姿勢は行に依存するので、投影は陰的な方程式になります：$v = \pi_v\big(P(t(v))\,\tilde{\mathbf X}\big)$。動きが中程度なら、不動点反復で数ステップのうちに解けます。

```python
import numpy as np

def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

f, W, H = 1000.0, 1920, 1080
K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
readout = 0.030                       # seconds from the first to the last row
omega = np.deg2rad(60.0)              # pan rate (rad/s) about the camera y axis

def project_rs(X, iters=10):
    """Rolling-shutter projection of one world point: row v is exposed at t = readout * v / H,
    so the pixel must satisfy v = proj_v(R(t(v)) X). Solve by fixed-point iteration."""
    v = H / 2
    for _ in range(iters):
        t = readout * v / H
        x = K @ (rot_y(-omega * t) @ X)          # camera turned by omega * t
        u, v = x[0] / x[2], x[1] / x[2]
    return u, v

# a vertical pole 5 m ahead, from 2.5 m above to 2.5 m below the optical axis
for Y in (-2.5, 0.0, 2.5):
    X = np.array([0.0, Y, 5.0])
    u_gs = (K @ X)[0] / 5.0                     # global shutter (t = 0 for every row)
    u, v = project_rs(X)
    print(f"Y = {Y:+.1f} m: row {v:7.1f}, u_global = {u_gs:.1f}, u_rolling = {u:.1f}")
print(f"rotation during readout: {np.rad2deg(omega * readout):.2f} deg = {f * np.tan(omega * readout):.1f} px at the centre")
```

読み出し 30 ms で、毎秒 60° という穏やかな速さで右にパンすると、グローバルシャッターなら $u = 960$ に写る鉛直なポールは、行 40 で $u = 958.8$、行 540 で $944.3$、行 $1040.2$ で $929.7$ に現れます。1000 行で 29 画素傾くわけです。読み出し全体の間にカメラは $1.80°$ 回転し、これは画像中心で $31.4$ 画素に相当します。$31.4 \cdot 1000/1080 = 29.1$ 画素で、傾きと一致します。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-rolling-shutter.svg" caption="左：1920×1080 画像（$f=1000$、読み出し 30 ms）に写る、前方 8 m の 7 本の鉛直なポール。グローバルシャッター（灰）と、毎秒 60°（紫）および 240°（橙）で右にパンしたときのローリングシャッターです。後で露光される行ほど、シーンがより左に見えます。右：コードのポールのグローバルシャッター画像に対する水平変位。縦軸は行（右の縦軸はその行の露光時刻）で、毎秒 60、120、240° の場合です。行 40 と行 1040 の間で、ポールはそれぞれ 29.1、58.3、117.3 画素傾きます。変位は行の露光時刻にほぼ比例して増えます。" %}

数画素の系統誤差でも姿勢推定には偏りが生じるので、カメラが速く動く場面ではローリングシャッターが重要になります。スマートフォン、ドローン、頭部装着カメラなどです。ローリングシャッターを考慮したバンドル調整（Hedborg ら、CVPR 2012）は、動画における運動の連続性を利用します。各行の姿勢を隣り合うフレームの姿勢の間で補間するので、古典的なバンドル調整に比べて増えるパラメータは 6 個だけです。視覚慣性システムは IMU を使ってフレーム内の動きを予測します。トラッキング用カメラにグローバルシャッターのセンサーがよく使われる理由の一つがこれです。

## 4. 座標系の約束事

ここまではすべて OpenCV のカメラ座標系を使ってきました。他のソフトウェアは別の座標系を使っており、変換せずに混ぜたパイプラインは、間違っているのにもっともらしく見える結果をしばしば出します。この節は、何度も見返すことになるリファレンスです。

### 4.1 カメラ座標系

| 約束事 | $x$ | $y$ | $z$ | カメラの向き | 使っているもの |
| --- | --- | --- | --- | --- | --- |
| OpenCV / COLMAP | 右 | 下 | 前 | $+z$ | OpenCV、COLMAP、3DGS（内部）、ROS の光学座標系 |
| OpenGL / Blender / NeRF | 右 | 上 | 後ろ | $-z$ | OpenGL、Blender、NeRF の `transforms.json`、nerfstudio |
| LLFF | 下 | 右 | 後ろ | $-z$ | LLFF と前向き（forward-facing）NeRF シーンの `poses_bounds.npy` |
| PyTorch3D | 左 | 上 | 前 | $+z$ | PyTorch3D のカメラ |

{% include blog_figure.liquid path="assets/img/blog/3d-vision/01-conventions.svg" width="80%" caption="紙面の奥を向いた 1 台の物理的なカメラ（紫の画像矩形）を、4 つの約束事で記述したもの。4 つの座標系はいずれも右手系で、違いはカメラのどの軸を $x$、$y$、$z$ と呼ぶかだけです。OpenCV と OpenGL の変換では $y$ と $z$ が反転し、LLFF は列を（下、右、後ろ）の順に並べ、PyTorch3D は OpenCV に対して $x$ と $y$ を反転します。" %}

4 つとも右手系なので、どの変換もカメラ自身の軸の回転です。カメラから世界への行列に右から（あるいは世界からカメラへの行列に左から）固定の行列を掛けます。OpenCV から OpenGL へは $\mathrm{diag}(1, -1, -1)$ です。**世界**座標系は別の独立した選択です。Blender や多くのロボティクスのソフトウェアは $Z$ が上向きです。ROS（REP 103）は機体に $x$ 前、$y$ 左、$z$ 上を使い、カメラには OpenCV の軸をもつ別の `_optical` 座標系を用意しています。COLMAP の世界座標系は、再構成がたまたま生み出したものです。

### 4.2 姿勢：世界からカメラか、カメラから世界か

姿勢はどちらの向きでも保存できます。

$$
T_{w2c} = \begin{pmatrix} R & \mathbf t \\ \mathbf 0^\top & 1 \end{pmatrix},
\qquad
T_{c2w} = T_{w2c}^{-1} = \begin{pmatrix} R^\top & \mathbf C \\ \mathbf 0^\top & 1 \end{pmatrix}, \quad \mathbf C = -R^\top\mathbf t .
$$

$T_{c2w}$ の各列は世界座標で表したカメラの軸とカメラ中心であり、シーンにカメラを配置するのに便利なので、NeRF 系のデータセットは $T_{c2w}$ を保存します。COLMAP の `images.txt` は $T_{w2c}$ を、単位クォータニオン `QW QX QY QZ`（スカラーが先頭、Hamilton の約束事）と並進 `TX TY TZ` で保存します。クォータニオンの順序もそれ自体が落とし穴です。SciPy の `Rotation.from_quat` はデフォルトでスカラーが最後の $(x, y, z, w)$ を期待し、Eigen の `Quaternion(w, x, y, z)` コンストラクタはスカラーが先頭の引数を取りますが、内部の係数はスカラーが最後の順で保存します。

### 4.3 画素と画像座標

画素の格子にさえ約束事があります。OpenCV では整数座標が画素の**中心**で、左上の画素の中心が $(0, 0)$ です。COLMAP は画像の原点を左上の**角**に置くので、左上の画素の中心は $(0.5, 0.5)$ となり、同じレンズでも $c_x^{\text{COLMAP}} = c_x^{\text{OpenCV}} + 0.5$ です。OpenGL のウィンドウ座標は左下から始まって $y$ が上向きで、正規化デバイス座標は $-1$ から $1$ までです。こうした半画素のずれや反転は簡単な目視確認では見えず、系統的なサブピクセル誤差や、上下が反転した画像として表れます。

### 4.4 コード：COLMAP から NeRF と OpenGL への変換

以下のコードは COLMAP の画像 1 枚（クォータニオン、並進、`PINHOLE` の内部パラメータ）を取り、OpenCV と OpenGL のカメラから世界への行列を作り、$K$ を再現する OpenGL の投影行列を作って、両方の経路が世界の点を同じ画素に写すことを確認します。この OpenGL の行列は[ラスタライゼーション]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})の視錐台行列を $f_x, f_y, c_x, c_y$ で表したものです。$(x, y, z)\_{\text{CV}} = (x, -y, -z)\_{\text{GL}}$ を $u = f_x x/z + s\,y/z + c_x$ に代入し、$u \in [0, W]$ を $x_{\text{ndc}} \in [-1, 1]$ に、$v \in [0, H]$ を $y_{\text{ndc}} \in [1, -1]$ に写せば導けます。

```python
import numpy as np

def qvec2rotmat(q):
    """COLMAP quaternion (QW, QX, QY, QZ) -> rotation matrix (Hamilton convention)."""
    w, x, y, z = q / np.linalg.norm(q)
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])

CV_TO_GL = np.diag([1.0, -1.0, -1.0, 1.0])   # flip the camera's y and z axes

def colmap_to_c2w(qvec, tvec, convention="opencv"):
    """images.txt stores world-to-camera; NeRF-style loaders want camera-to-world."""
    R = qvec2rotmat(qvec)
    c2w = np.eye(4)
    c2w[:3, :3], c2w[:3, 3] = R.T, -R.T @ tvec      # columns: camera axes and centre in world
    return c2w @ CV_TO_GL if convention == "opengl" else c2w

def gl_projection(K, W, H, near, far):
    """OpenGL clip matrix that reproduces the pinhole K (pixel origin at the image corner,
    pixel centres at +0.5, as in COLMAP) for a camera looking down -z with y up."""
    fx, s, cx, fy, cy = K[0, 0], K[0, 1], K[0, 2], K[1, 1], K[1, 2]
    return np.array([
        [2 * fx / W, -2 * s / W, 1 - 2 * cx / W, 0],
        [0, 2 * fy / H, 2 * cy / H - 1, 0],
        [0, 0, -(far + near) / (far - near), -2 * far * near / (far - near)],
        [0, 0, -1, 0]])

# one COLMAP image: quaternion, translation and a PINHOLE camera 1600 x 1200
qvec, tvec = np.array([0.95, 0.10, -0.25, 0.05]), np.array([0.3, -0.2, 2.5])
K = np.array([[1450.0, 0, 801.5], [0, 1450.0, 598.0], [0, 0, 1]])
W, H = 1600, 1200
Xw = np.array([0.4, -0.3, 1.2, 1.0])                 # a world point (homogeneous)

# (1) OpenCV/COLMAP route: world -> camera -> K
R = qvec2rotmat(qvec)
xc = R @ Xw[:3] + tvec
u_cv = (K @ xc)[:2] / xc[2]

# (2) OpenGL route: inverse of the OpenGL camera-to-world, projection, divide, viewport
c2w_gl = colmap_to_c2w(qvec, tvec, "opengl")
clip = gl_projection(K, W, H, 0.1, 100.0) @ np.linalg.inv(c2w_gl) @ Xw
ndc = clip[:3] / clip[3]
u_gl = np.array([(ndc[0] + 1) * W / 2, (1 - ndc[1]) * H / 2])   # y_ndc points up, v down

print("OpenCV pixel:", u_cv.round(4), " OpenGL pixel:", u_gl.round(4))
print("camera centre:", c2w_gl[:3, 3].round(4), " looks along:", (-c2w_gl[:3, 2]).round(4))

# (3) LLFF's poses_bounds.npy stores camera-to-world columns as [down, right, backwards]
c2w_cv = colmap_to_c2w(qvec, tvec)[:3]                                  # [right, down, forward | C]
llff = np.c_[c2w_cv[:, 1], c2w_cv[:, 0], -c2w_cv[:, 2], c2w_cv[:, 3]]   # [down, right, back | C]
nerf = np.c_[llff[:, 1], -llff[:, 0], llff[:, 2], llff[:, 3]]           # [right, up, back | C]
print("LLFF reordered equals the OpenGL c2w:", np.allclose(nerf, c2w_gl[:3]))
```

どちらの経路も画素 $(849.0957, 306.4640)$ を与え、表示された桁はすべて一致します。カメラ中心は $(-1.4913, -0.1826, -2.0304)$ で、OpenGL の約束事ではカメラは $-z$、すなわち世界の方向 $(0.4962, 0.1688, 0.8517)$ を向いています。最後の行は NeRF の LLFF ローダーが行う列の並べ替え、（下、右、後ろ）から（右、上、後ろ）への変換を実行し、同じ OpenGL のカメラから世界への行列が得られることを確認しています（`True`）。

### 4.5 デバッグのチェックリスト

あるツールの姿勢が別のツールで正しく見えないときは：

1. **カメラを描く。** すべてのカメラ中心とその視線方向を、疎な点群と一緒にプロットします。カメラがシーンと反対を向いていれば $z$ が反転しています。シーンが鏡像になっていれば、どこかで 1 本の軸だけが反転している、つまり行列式が $-1$ になっています。
2. **既知の点を投影する。** 3D の点と、それが写る画素が分かっているものを使い、処理全体がそれを 1 画素以内で再現するか確認します。OpenCV の約束事では奥行き $Z_c$ は正でなければなりません。
3. **姿勢の向きを確認する。** すべてのカメラ中心が原点付近に固まったり、予想される軌跡の鏡像になったりする場合、$\mathbf C = -R^\top\mathbf t$ の代わりに $\mathbf t$ を、あるいは $T_{c2w}$ の代わりに $T_{w2c}$ を使っている可能性が高いです。
4. **クォータニオンの順序**（スカラーが先頭か最後か）と、もしあればオイラー角の約束事を確認する。
5. **主点を確認する。** 画像サイズと整合しているか、半画素の約束事を含めて確認し、キャリブレーション後に画像がリサイズされていないかも確かめます（$f_x, f_y, c_x, c_y$ はすべて画像とともにスケールします）。
6. **歪みモデルを確認する。** データが歪みありでキャリブレーションされているのにレンダラーがピンホールを仮定しているなら、3DGS の前処理と同じように、先に画像の歪みを補正します。

## 試してみよう

- 上の 2 つのウィジェット：消失点とそれによるキャリブレーション、そして Brown-Conrady と Kannala-Brandt の歪みを含む完全なカメラモデル。
- ホームページの[インタラクティブラボ]({{ '/' | relative_url }}#lab)は理想的なピンホールカメラで描画しています。Gaussian World のデモは、画素単位の焦点距離 $f = (H/2)/\tan(\theta_y/2)$ で各ガウシアンを投影します。これは 2.2 節の画角の関係を縦方向に適用したものです。周回や歩行で変わるのは $R$ と $\mathbf t$ だけです。
- スマートフォンで建物を撮影し、互いに垂直な 2 組の稜の消失点を直線の交点として求め、1.6 節の式でカメラの画素単位の焦点距離を推定してみましょう。EXIF の 35 mm 換算焦点距離 $F_{35}$ と比べます。横向きで幅 $W$ 画素の画像なら $f \approx F_{35}\, W / 36\,\text{mm}$ です。

## 代表的な論文

| 論文 | 会議/論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Decentering distortion of lenses (Brown) | Photogrammetric Engineering | 1966 | — | OpenCV が使う放射方向と接線方向の歪みモデル |
| Using vanishing points for camera calibration (Caprile, Torre) | IJCV | 1990 | [DOI](https://doi.org/10.1007/BF00127813) | 消失点からの内部パラメータ推定、垂心の性質 |
| A flexible new technique for camera calibration (Zhang) | TPAMI | 2000 | [DOI](https://doi.org/10.1109/34.888718) | チェッカーボードによるキャリブレーション、第 2 回の土台 |
| A unifying theory for central panoramic systems and practical implications (Geyer, Daniilidis) | ECCV | 2000 | [DOI](https://doi.org/10.1007/3-540-45053-X_29) | 中心射影カタディオプトリックカメラの統一球面モデル |
| Straight lines have to be straight (Devernay, Faugeras) | Machine Vision and Applications | 2001 | [DOI](https://doi.org/10.1007/PL00013269) | 直線のまっすぐさから歪みを推定、ターゲット不要 |
| Geometric models of rolling-shutter cameras (Meingast, Geyer, Sastry) | arXiv プレプリント | 2005 | [arXiv](https://arxiv.org/abs/cs/0503076) | 動くローリングシャッターカメラの投影方程式 |
| A generic camera model and calibration method for conventional, wide-angle, and fish-eye lenses (Kannala, Brandt) | TPAMI | 2006 | [DOI](https://doi.org/10.1109/TPAMI.2006.153) | OpenCV と COLMAP が採用する角度の多項式による魚眼モデル |
| Single view point omnidirectional camera calibration from planar grids (Mei, Rives) | ICRA | 2007 | [DOI](https://doi.org/10.1109/ROBOT.2007.364084) | 統一球面モデルに歪みを加え、平面ターゲットでキャリブレーションする。魚眼とカタディオプトリックカメラに使われる |
| Rolling shutter bundle adjustment (Hedborg, Forssén, Felsberg, Ringaby) | CVPR | 2012 | [DOI](https://doi.org/10.1109/CVPR.2012.6247831) | ローリングシャッター動画のバンドル調整。行ごとの姿勢をフレーム間で補間 |
| Structure-from-Motion revisited (Schönberger, Frahm) | CVPR | 2016 | [CVF](https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html) | COLMAP。多くのデータセットがそのカメラモデルと約束事を受け継いでいる |
| The double sphere camera model (Usenko, Demmel, Cremers) | 3DV | 2018 | [arXiv](https://arxiv.org/abs/1807.08957) | 閉じた形の逆変換をもつ広角モデルと、モデル間の比較 |
| Local light field fusion (Mildenhall et al.) | SIGGRAPH (ACM TOG) | 2019 | [arXiv](https://arxiv.org/abs/1905.00889) | 前向き NeRF シーンが使う `poses_bounds.npy` 形式 |
| Why having 10,000 parameters in your camera model is better than twelve (Schöps et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1912.02908) | 汎用の密なカメラモデルの方が正確にキャリブレーションできる |

## 学習リソース

- R. Hartley、A. Zisserman、*Multiple View Geometry in Computer Vision*、第 2 版、Cambridge University Press、2004。第 2、3 章（2D と 3D の射影幾何）、第 6 章（カメラモデル）、第 8 章（消失点と単視点幾何）が本記事の 1、2 節の標準的な参考書です。
- R. Szeliski、*Computer Vision: Algorithms and Applications*、第 2 版、2022、第 2 章（画像形成）。個人利用なら [szeliski.org/Book](https://szeliski.org/Book/) で無料で読めます。
- OpenCV のドキュメント：[calib3d モジュール](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html)（ピンホールと Brown-Conrady モデル）と [fisheye モジュール](https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html)（Kannala-Brandt）。
- COLMAP のドキュメント：[出力形式](https://colmap.github.io/format.html)（`cameras.txt`、`images.txt`）とカメラモデルの一覧。
- 約束事のリファレンス：[nerfstudio のデータの約束事](https://docs.nerf.studio/quickstart/data_conventions.html)と [PyTorch3D のカメラ座標系](https://pytorch3d.org/docs/cameras)。

## 演習

1. 鉛直線 $x = 1$ と $x = 3$ の交点、および無限遠点 $(1, 0, 0)$ と $(0, 1, 0)$ を通る直線を同次座標で計算し、両方の結果を解釈してください。

   <details markdown="1"><summary>ヒント</summary>

   2 本の直線は $(1, 0, -1)$ と $(1, 0, -3)$ で、外積は $(0, 2, 0) \sim (0, 1, 0)$、すなわち鉛直方向の無限遠点です。$(1,0,0)$ と $(0,1,0)$ を通る直線はその外積 $(0, 0, 1) = \mathbf l_\infty$ です。
   </details>

2. スキュー 0、正方形画素のカメラでは、互いに直交する 3 方向の消失点がなす三角形の垂心が主点であることを示してください。カメラが水平で $\mathbf v_Z$ が無限遠にあるとき、何を復元できますか。

   <details markdown="1"><summary>ヒント</summary>

   3 組について直交条件 $(\mathbf v_i - \mathbf c)\cdot(\mathbf v_j - \mathbf c) = -f^2$ を書き、そのうち 2 つを引き算します。$\mathbf v_Z = (a, b, 0)$ が無限遠にあるとき、その光線 $K^{-1}\mathbf v_Z = (a/f, b/f, 0)$ は $\mathbf v_X$ の光線と直交しなければならないので $(\mathbf v_X - \mathbf c)\cdot(a, b) = 0$、つまり主点は地平線上にあります。すると $(\mathbf v_X - \mathbf c)\cdot(\mathbf v_Y - \mathbf c) = -f^2$ を満たす $(\mathbf c, f)$ には 1 パラメータの自由度が残ります。$f$ を決めるには、$c_x$ が画像中心にある（ウィジェットのように）といった仮定がもう一つ必要です。
   </details>

3. SciPy を使わずに `np.linalg.qr` で RQ 分解を自分で実装し、`decompose_P` の中で `scipy.linalg.rq` と比較してください。

   <details markdown="1"><summary>ヒント</summary>

   $J$ を反対角線に 1 が並ぶ交換行列とします。`Q, U = np.linalg.qr((J @ M).T)` を計算すると、$K = J U^\top J$ は上三角、$R = J Q^\top$ は直交行列で、$KR = M$ です。符号は `decompose_P` と同じように処理します。
   </details>

4. $k_1 = -0.4$ だけをもつ Brown-Conrady モデルが表現できる最大の画角（全角、正方形画素、主点は中央）はいくつですか。$k_1 = -0.28$、$k_2 = 0.07$ についても求めてください。

   <details markdown="1"><summary>ヒント</summary>

   モデルは $1 + 3k_1 r^2 + 5k_2 r^4 = 0$ で折り返します。$k_1 = -0.4$ では $r = 0.913$、半角 $42.4°$、全角 $84.8°$ です。2 つ目のレンズでは、$s = r^2$ の 2 次式 $0.35 s^2 - 0.84 s + 1$ は実根をもたないので決して折り返しません（ただし、キャリブレーションした範囲のはるか外での精度は別の問題です）。
   </details>

5. 角速度 $\omega$ でパンするときの、鉛直線のローリングシャッターによる傾きの 1 次近似式を導き、コードと照らし合わせてください。読み出し 30 ms、$f = 1000$ で、フレーム全体での傾きを 2 画素未満に抑えるには、パンの速さはどこまで許されますか。

   <details markdown="1"><summary>ヒント</summary>

   画像中心付近では小さな回転 $\delta$ で画像はおよそ $f\delta$ 動き、行 $v$ は $\tau v/H$ だけ遅れて露光されるので、変位は $\Delta u(v) \approx f\,\omega\,\tau\,v/H$ です。フレーム全体では毎秒 60° のとき $f\omega\tau = 1000 \cdot 1.047 \cdot 0.03 = 31.4$ 画素で、出力と一致します。2 画素未満にするには $\omega < 2/(1000 \cdot 0.03)$ rad/s、つまり毎秒約 3.8° が必要です。
   </details>

6. OpenGL の約束事によるカメラから世界への行列を含む NeRF の `transforms.json` を受け取り、OpenCV の世界からカメラへの行列を必要とする 3DGS を学習させたいとします。変換を書き、両方で同じ点を投影して確かめてください。

   <details markdown="1"><summary>ヒント</summary>

   $T_{w2c}^{\text{CV}} = \big(T_{c2w}^{\text{GL}}\,\mathrm{diag}(1,-1,-1,1)\big)^{-1}$ です。4.4 節の投影の確認を逆向きに使ってください。JSON の画角または焦点距離も、実際の画像サイズに対する画素単位の $f_x, f_y$ に換算する必要があります。
   </details>

**次回：** [カメラキャリブレーション]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})：チェッカーボードの画像から $K$ と歪み係数を推定する方法と、その結果が信頼できるかどうかを判断する方法を扱います。
