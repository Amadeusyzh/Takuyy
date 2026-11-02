---
layout: post
title: "ジオメトリ処理：メッシュ、曲率、平滑化、細分割、再構成"
date: 2026-10-27 09:08:00+0900
description: "メッシュ表現とハーフエッジ構造、コタンジェント・ラプラシアンによる離散曲率、平滑化、Loop 細分割、QEM 簡略化、Tutte パラメータ化、Marching Squares と Marching Cubes、ポアソン再構成を、すべて NumPy で実装します。"
categories: graphics
tags: [geometry-processing, meshes, laplacian, subdivision, simplification, marching-cubes, poisson]
series: graphics
series_order: 8
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[ラスタライズ]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})も[パストレーシング]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})も、三角形メッシュを与えられたものとして扱いました。この記事では、そのメッシュがどこから来て、どのように操作するのかを扱います。三角形メッシュは映画、ゲーム、CAD、3D スキャン、3D プリントの共通言語であり、今では 3D 生成の共通言語でもあります。スキャナやニューラルフィールドが出力するのは点や陰関数なので、それをメッシュに変換しなければなりません。アーティストのメッシュは平滑化し、細分化し、詳細度（LOD）のために簡略化し、テクスチャを貼るために展開する必要があります。ニューラル再構成（[ガウシアンからの表面]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})）の最後に使われるのも同じ道具、つまり Marching Cubes、ポアソン再構成、メッシュ簡略化です。

それぞれの道具を NumPy でゼロから作ります。ハーフエッジ構造、コタンジェント・ラプラシアンによる曲率、平滑化、Loop 細分割、二次誤差による簡略化、Tutte 埋め込み、Marching Squares と Marching Tetrahedra、スフィアトレーシング（sphere tracing）、ポアソン再構成です。

## 前提知識

- ベクトル、外積、行列、最小二乗法（[第 1 回]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})）。
- 三角形、重心座標、インデックス付きメッシュ（[第 2 回]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})）。
- 曲面上の微積分を少し：法線、勾配、ラプラシアン $\Delta f = \partial^2 f/\partial x^2 + \partial^2 f/\partial y^2$ の考え方。
- NumPy を使った Python。疎行列の線形代数は役に立ちますが必須ではありません。この記事の例はすべて密行列で扱える大きさです。

## 1. 形状の表現

3D 形状を保存する唯一最良の方法はありません。どの表現も、ある操作を安くし、別の操作を難しくします。

| 表現 | 保存するもの | 得意 | 苦手 |
| --- | --- | --- | --- |
| ポリゴンスープ（polygon soup） | 三角形のリスト。各三角形が自分の 3 頂点位置を持つ | 描画 | 隣接関係が必要な処理すべて |
| インデックス付きメッシュ（indexed mesh） | 頂点配列 $V \in \mathbb{R}^{n\times 3}$ + 面配列 $F \in \mathbb{N}^{m\times 3}$ | 描画、保存 | 隣接クエリ（追加の構造が必要） |
| ハーフエッジメッシュ（half-edge mesh） | インデックス付きメッシュ + 向き付き辺のレコード | 局所的な走査と編集 | 任意の非多様体入力 |
| 点群（point cloud） | サンプル点 $\mathbf{p}_i$、場合により法線 $\mathbf{n}_i$ | 計測（LiDAR、深度カメラ、SfM） | トポロジー、穴のない描画 |
| 陰関数 / SDF | 関数 $f:\mathbb{R}^3\to\mathbb{R}$、表面 $=\{f=0\}$ | 内外判定、ブーリアン演算、ブレンド | 描画に根の探索が必要、鋭い特徴 |
| ボクセル（voxels） | 格子上の $f$ または占有値 | 単純、GPU 向き | メモリが $N^3$ で増える |
| パラメトリック曲面（parametric） | パッチ $\mathbf{x}(u,v)$（Bézier、B スプライン、NURBS） | 厳密で滑らかな CAD 曲面 | パッチの接合、任意のトポロジー |

**インデックス付きメッシュ**は[第 2 回]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})でラスタライズしたものです。位置は一度だけ保存し、三角形はインデックスの三つ組です。これを処理する前に、トポロジーの概念が二つ必要です。

**多様体性（manifoldness）。** すべての点が円板のように見える近傍（境界上では半円板）を持つとき、メッシュは（2 次元）**多様体**です。三角形メッシュでは次の意味になります。すべての辺は 1 つか 2 つの三角形に属し（境界では 1 つ）、各頂点の周りの三角形は 1 つの扇形をなします。内部頂点では閉じた扇形、境界頂点では開いた扇形です。2 つの扇形が 1 点で接する「蝶ネクタイ」頂点や、3 つの三角形に共有される辺は非多様体です。以下のアルゴリズムの多くは、多様体で向きの揃ったメッシュ（外から見て各面が頂点を反時計回りに並べる）を仮定します。

**オイラー標数（Euler characteristic）。** 頂点数 $V$、辺数 $E$、面数 $F$ のメッシュについて

$$
\chi = V - E + F = 2 - 2g - b
$$

です。$g$ は種数（ハンドルの数）、$b$ は境界ループの数です。立方体は $8 - 12 + 6 = 2$（球面）です。三角形分割した $48\times 24$ のトーラス格子は $V = 1152$、$E = 3 \cdot 1152 = 3456$（各格子セルが横・縦・対角の辺を 1 本ずつ持つ）、$F = 2304$ なので $\chi = 0$（$g = 1$）です。オイラー標数は後で曲率コードの検証に使います。閉じた三角形メッシュについて便利な帰結があります。各面は 3 辺を持ち、各辺は 2 面に属するので $2E = 3F$ です。$\chi$ は小さいので $F \approx 2V$、$E \approx 3V$ となり、平均的な頂点の**価数**（valence、隣接頂点数）は 6 に近くなります。

## 2. ハーフエッジデータ構造

ジオメトリ処理の多くは局所的な問いを発します。「頂点 $i$ を囲む頂点はどれか」「この辺を共有する面はどれか」「境界に沿って歩く」。インデックス付きの面リストは、探索によってしか答えられません。**ハーフエッジ（half-edge）** 構造は各辺を向きごとに 2 回保存し、レコード同士をリンクすることで、あらゆる局所クエリを 1 ステップあたり定数時間にします。

各ハーフエッジ $h$ は次を保存します。

- `orig[h]`：始点の頂点
- `twin[h]`：同じ辺を逆向きに進むハーフエッジ
- `next[h]`：同じ面の次のハーフエッジ（反時計回り）
- `face[h]`：左側の面。境界ハーフエッジでは $-1$

他のすべてはここから導けます。$h$ の終点は `orig[twin[h]]`、三角形の中で一つ前のハーフエッジは `next[next[h]]` です。鍵となる走査は頂点の周りの回転です。$h$ が頂点 $v$ から出ているなら、`next[twin[h]]` も $v$ から出ていて、面が一つ先に進んでいます。以下は面リストから構造を作るコードです。境界ハーフエッジをループにつないでおくので、同じ回転が境界でも動きます。

```python
def build_halfedge(F):
    """Half-edge arrays from a face list: origin, twin, next, face (-1 for boundary)."""
    orig, face, nxt, index = [], [], [], {}
    for f, tri in enumerate(F):
        base = len(orig)
        for k in range(3):
            a, b = tri[k], tri[(k + 1) % 3]
            index[(a, b)] = base + k
            orig.append(a); face.append(f); nxt.append(base + (k + 1) % 3)
    twin = [-1] * len(orig)
    for (a, b), h in list(index.items()):
        if (b, a) in index:
            twin[h] = index[(b, a)]
        else:  # create the boundary half-edge b -> a
            g = len(orig)
            orig.append(b); face.append(-1); nxt.append(-1); twin.append(h)
            twin[h] = g
            index[(b, a)] = g
    out_boundary = {orig[h]: h for h in range(len(orig)) if face[h] == -1}
    for h in range(len(orig)):
        if face[h] == -1:
            nxt[h] = out_boundary[orig[twin[h]]]  # next boundary half-edge starts at our tip
    return dict(orig=orig, twin=twin, next=nxt, face=face)

def one_ring(he, h0):
    ring, h = [], h0
    while True:
        ring.append(h)
        h = he["next"][he["twin"][h]]
        if h == h0:
            return ring

F = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 5), (0, 5, 6)]   # a fan with one wedge missing
he = build_halfedge(F)
tip = lambda h: he["orig"][he["twin"][h]]
print(len(he["orig"]), "half-edges")                        # 22
print("one-ring of 0:", [tip(h) for h in one_ring(he, 0)])  # [1, 6, 5, 4, 3, 2]
b0 = he["face"].index(-1)
loop, h = [], b0
while True:
    loop.append(he["orig"][h]); h = he["next"][h]
    if h == b0: break
print("boundary loop:", loop)                               # [1, 0, 6, 5, 4, 3, 2]
```

この扇形は 7 頂点、11 辺、5 面です（$\chi = 1$：円板）。内部ハーフエッジ 15 本と境界ハーフエッジ 7 本で合計 22 本です。下の図は、同じコードでこれらのレコードを描いたものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-halfedge.svg" caption="`build_halfedge` で作った扇形のハーフエッジ構造。各矢印が 1 本のハーフエッジで、左側の面の少し内側に描いています。境界ハーフエッジ（オレンジ）は外側にあり、`next` で境界ループにつながっています。紫：`one_ring` がたどる頂点 0 の出るハーフエッジ（そのうち 1 本は境界ハーフエッジで、欠けたくさび形を回転が越えられるのはこのためです）。ラベルは 1 本のハーフエッジ $h$（0 から 1 へ）と、その `next`（黒）、`twin`（境界上）を示します。" %}

実用ライブラリ（OpenMesh、CGAL の `Surface_mesh`、geometry-central、Blender の BMesh）は同じ考え方を配列中の整数ハンドルで保存し、頂点ごとに「出るハーフエッジを 1 本」、面ごとに「ハーフエッジを 1 本」持たせます。リメッシュの三つの局所操作、辺の縮約（edge collapse）、辺の反転（edge flip）、辺の分割（edge split）は、数個のポインタの更新になります。

## 3. 離散微分幾何

滑らかな曲面では、曲率が曲面の曲がり方を表します。各点には二つの**主曲率（principal curvatures）** $\kappa_1, \kappa_2$ があります（法平面で切った曲線の曲率の最大と最小）。その平均 $H = (\kappa_1 + \kappa_2)/2$ が**平均曲率（mean curvature）**、積 $K = \kappa_1\kappa_2$ が**ガウス曲率（Gaussian curvature）**です。半径 $r$ の球面は $\kappa_1 = \kappa_2 = 1/r$ なので $H = 1/r$、$K = 1/r^2$ です。円柱は $K = 0$、鞍面は $K < 0$ です。メッシュは各三角形の内部で平らなので、曲率はすべて辺と頂点に集中します。離散微分幾何（discrete differential geometry）は、古典的な定理が厳密に成り立つようにメッシュ上の曲率を定義します。

### 頂点法線

面法線は $\mathbf{n}_f = (\mathbf{b}-\mathbf{a})\times(\mathbf{c}-\mathbf{a}) / \lVert\cdot\rVert$ で、正規化前の長さは三角形の面積の 2 倍です。頂点法線は隣接する面の法線の平均です。よく使う重みは三つあります。

- **一様**：$\sum_f \mathbf{n}_f$。曲面の三角形分割の仕方に依存します。
- **面積重み**：$\sum_f A_f \mathbf{n}_f$（正規化前の外積をそのまま足す）。安価で、通常のデフォルトです。
- **角度重み**：$\sum_f \theta_f \mathbf{n}_f$。$\theta_f$ はその頂点での面 $f$ の角です。平らな領域の三角形分割の仕方に依存しません（Thürmer と Wüthrich）。

### コタンジェント・ラプラシアン

**ラプラス–ベルトラミ作用素（Laplace–Beltrami operator）** $\Delta_S$ は、ラプラシアンを曲面上の関数に一般化したものです。位置関数 $\mathbf{x}$ そのものに作用させると曲率が得られます。

$$
\Delta_S \mathbf{x} = -2H\,\mathbf{n}.
$$

半径 $r$ の球面では、$\Delta_S\mathbf{x}$ は中心を向き、長さは $2/r$ です。したがって $\Delta_S$ を離散化できれば、**平均曲率法線（mean-curvature normal）** がおまけで手に入ります。

標準的な離散化は、各三角形上で線形な関数 $f$（有限要素法の「ハット」基底）について、ディリクレエネルギー $\frac12\int_S \lVert\nabla f\rVert^2$ を最小化することから得られます。頂点 $i,j,k$、内角 $\alpha_i, \alpha_j, \alpha_k$ の三角形 1 枚の中で、ハット関数の勾配を使って短い計算をすると

$$
\int_T \lVert\nabla f\rVert^2 = \tfrac12\big(\cot\alpha_k (f_i - f_j)^2 + \cot\alpha_i (f_j - f_k)^2 + \cot\alpha_j (f_k - f_i)^2\big)
$$

となり、各辺は*対角*のコタンジェントで重み付けされます。辺 $ij$ を共有する二つの三角形（対角 $\alpha_{ij}$ と $\beta_{ij}$）について足し合わせ、$f_i$ で微分すると、**コタンジェント・ラプラシアン（cotangent Laplacian）** が得られます（Pinkall と Polthier 1993、Meyer ら 2003）。

$$
(\mathbf{L}f)_i = \sum_{j \in N(i)} w_{ij}\,(f_j - f_i), \qquad w_{ij} = \tfrac12\big(\cot\alpha_{ij} + \cot\beta_{ij}\big).
$$

ここで $N(i)$ は頂点 $i$ の隣接頂点の集合です。ディリクレエネルギーの $f$ に関する勾配は $-\mathbf{L}f$ なので、$\mathbf{L}$ は負の半正定値です。また $\mathbf{L}$ は対称で、各行の和は 0 です。点ごとの値を得るには、頂点 $i$ に対応する面積 $A_i$ で割ります。隣接三角形の面積の 3 分の 1（**重心面積**）か、Meyer らによるより正確な**混合ボロノイ面積**です。すると

$$
\Delta_S\mathbf{x}_i \approx \frac{1}{A_i}\sum_{j} w_{ij}(\mathbf{x}_j - \mathbf{x}_i) = -2H_i\mathbf{n}_i, \qquad H_i = -\tfrac12\,(\Delta_S\mathbf{x}_i)\cdot\mathbf{n}_i
$$

となります。

**数値例。** 正三角形だけのメッシュではすべての角が $60^\circ$ で、$\cot 60^\circ = 1/\sqrt3 \approx 0.577$ なので、内部の辺はすべて $w_{ij} = \frac12(0.577 + 0.577) = 0.577$ です。完全に規則的なメッシュでは、コタンジェント・ラプラシアンは一様ラプラシアンの定数倍になります。不規則なメッシュでは両者が異なり、そこが要点です。一様（「アンブレラ」）ラプラシアン $\frac1{|N(i)|}\sum_j(\mathbf{x}_j-\mathbf{x}_i)$ は「隣接頂点の重心へのベクトル」にすぎません。*平ら*でも不規則な 1-リング近傍ではこれは 0 にならないので、これで平滑化すると頂点が接線方向に滑ります。コタンジェント版は、どんな平らな 1-リングでも厳密に 0 になります。曲がりだけを「見る」のです。下の図は同じ 1-リングで両者を比べたものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-cotan-weights.svg" caption="平らで不規則な 1-リング上のコタンジェント重み（`cotan_laplacian` で計算）。各スポーク $0j$ の色と太さが $w_{0j}$（スポーク上の数値）を表し、スポーク $0$–$1$ については二つの対角 $\alpha$ と $\beta$ を赤で示しています。薄紫：頂点 0 の重心面積。オレンジの矢印は一様ラプラシアン（4 倍に拡大）で、曲面は平らなのに横を向いています。タイトルにはコタンジェントの和 $\sum_j w_{0j}(\mathbf{x}_j-\mathbf{x}_0)$ が表示され、丸め誤差の範囲で 0 です。" %}

```python
import numpy as np

def corner_angles(V, F):
    t = V[F]
    ang = np.zeros(F.shape)
    for k in range(3):
        u, w = t[:, (k + 1) % 3] - t[:, k], t[:, (k + 2) % 3] - t[:, k]
        c = (u * w).sum(1) / (np.linalg.norm(u, axis=1) * np.linalg.norm(w, axis=1))
        ang[:, k] = np.arccos(np.clip(c, -1, 1))
    return ang

def cotan_laplacian(V, F):
    """Dense L with L[i, j] = (cot a_ij + cot b_ij) / 2 and rows summing to zero."""
    n, L = len(V), np.zeros((len(V), len(V)))
    ang = corner_angles(V, F)
    for k in range(3):
        i, j = F[:, (k + 1) % 3], F[:, (k + 2) % 3]      # edge opposite corner k
        w = 0.5 / np.tan(ang[:, k])
        np.add.at(L, (i, j), w); np.add.at(L, (j, i), w)
    L[np.diag_indices(n)] = -L.sum(1)
    return L

def vertex_areas(V, F):                                   # barycentric: 1/3 of incident areas
    t = V[F]
    A = 0.5 * np.linalg.norm(np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]), axis=1)
    out = np.zeros(len(V)); np.add.at(out, F.ravel(), np.repeat(A / 3, 3))
    return out
```

実際のメッシュでは疎行列（同じ三つ組から作る `scipy.sparse.coo_matrix`）を使ってください。密行列版は分かりやすさのためだけのものです。

注意点が二つあります。$90^\circ$ を超える角ではコタンジェントが負になるので、鈍角三角形を含むメッシュでは一部の重みが負になり、最大値原理が崩れます（平滑化した関数がオーバーシュートすることがあります）。内在的ドロネー三角形分割（Sharp、Soliman、Crane）は形状を変えずにこれを解決します。また、ほぼ退化した三角形では重みが発散するので、パイプラインの最初の段階は形の良い三角形へのリメッシュであることがよくあります。

### 角度欠損によるガウス曲率

ガウス曲率の離散形はさらに簡単です。内部頂点 $i$ の周りの三角形を平面に広げます。角の和 $\sum\theta$ がちょうど $2\pi$ なら、その頂点は平らです。**角度欠損（angle defect）**

$$
\delta_i = 2\pi - \sum_{f \ni i} \theta_f^{(i)}
$$

は頂点の面積内でのガウス曲率の積分なので、$K_i \approx \delta_i / A_i$ です。円錐の頂点では欠損が正、鞍点の頂点（角の和が $2\pi$ を超える）では負になります。境界頂点では代わりに $\pi - \sum\theta$ を使います。

**離散ガウス–ボネの定理（Gauss–Bonnet theorem）** は近似ではなく厳密に成り立ちます。

$$
\sum_i \delta_i = 2\pi\chi .
$$

数値例：正八面体の各頂点には正三角形の角が四つあるので、$\delta = 2\pi - 4\cdot\frac{\pi}{3} = \frac{2\pi}{3}$ で、6 頂点の和は $4\pi = 2\pi\cdot 2$ です。証明は数え上げだけです。各三角形の三つの角の和は $\pi$ なので $\sum_i\delta_i = 2\pi V - \pi F$ で、$2E = 3F$（つまり $F/2 = E - F$）を使うと $2\pi(V - E + F)$ になります。

```python
def gaussian_curvature(V, F):
    defect = np.full(len(V), 2 * np.pi)
    np.add.at(defect, F.ravel(), -corner_angles(V, F).ravel())
    return defect / vertex_areas(V, F), defect

def mean_curvature(V, F, normals):
    lap = (cotan_laplacian(V, F) @ V) / vertex_areas(V, F)[:, None]   # = -2 H n
    return -0.5 * (lap * normals).sum(1)
```

トーラスは、両方の曲率が閉じた式で分かるので理想的なテストです。管の半径を $r$、中心円の半径を $R$、管の周りの角度を $v$ とすると

$$
K(v) = \frac{\cos v}{r\,(R + r\cos v)}, \qquad H(v) = \frac{R + 2r\cos v}{2r\,(R + r\cos v)}
$$

です。外側の半分（$\cos v > 0$）は球面のようで $K > 0$、内側の半分は鞍面のようで $K < 0$ です。そして $\chi = 0$ なので、ガウス–ボネの定理によれば両者はちょうど打ち消し合わなければなりません。下の $48\times24$ のトーラスでは、すべての角度欠損の和は $-3\times10^{-13}$（丸め誤差）で、公式に対する点ごとの最大誤差は $K$ で $0.03$（$K$ の範囲は $-4.2$ から $1.8$）、$H$ で $0.006$（厳密な法線を使用）です。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-curvature.svg" caption="$48\times24$ のトーラス（$R=1$、$r=0.4$）上の離散曲率（上のコードで計算）。左：角度欠損によるガウス曲率。赤が $K>0$（外側）、青が $K<0$（穴の内側）です。中：コタンジェント・ラプラシアンによる平均曲率。右：管の 1 周に沿った値と厳密な式の比較（赤が $K$、青が $H$。点と四角が離散値、曲線が厳密な式）で、マーカーは曲線のすぐ近くに乗るはずです。タイトルにはすべての角度欠損の和が表示され、$\chi=0$ のときガウス–ボネの定理が要求するとおり、丸め誤差の範囲で 0 になります。" %}

## 4. 平滑化とフェアリング

スキャンしたメッシュにはノイズがあります。頂点位置をメッシュ上の信号とみなし、拡散 $\partial\mathbf{x}/\partial t = \Delta_S\mathbf{x}$ を適用します。$\Delta_S\mathbf{x} = -2H\mathbf{n}$ なので、これは各頂点を法線方向に、平均曲率に比例する速さで動かします。つまり**平均曲率流（mean curvature flow）** で、凹凸をならします。

### 陽的ラプラシアン平滑化と収縮

最も単純な離散化は、反復ごとに陽的オイラー法を 1 ステップ行うものです。

$$
\mathbf{x} \leftarrow \mathbf{x} + \lambda\,\mathbf{L}\mathbf{x}, \qquad 0 < \lambda \le 1
$$

（$\mathbf{L}$ は一様またはコタンジェント・ラプラシアンで、対角が $-1$ になるよう正規化します。）何が起きるかを見るため、形状を $\mathbf{L}$ の固有ベクトルで展開します。固有ベクトルはフーリエモードの役割を果たし、$\mathbf{L}\mathbf{e}_k = -\kappa_k\mathbf{e}_k$、「周波数」は $\kappa_k \ge 0$ です。頂点数 $n$ の閉多角形と一様ラプラシアンでは、モードは正弦と余弦で、$\kappa_k = 1 - \cos(2\pi k/n) \in [0, 2]$ です。1 回の反復はモード $k$ に**伝達関数（transfer function）**

$$
f(\kappa) = 1 - \lambda\kappa
$$

を掛けます。高周波（ノイズ、$\kappa$ が 2 に近い）は意図どおり強く減衰します。しかし定数でないすべてのモードが減衰し、全体の大きさを担う最低周波のモードも例外ではありません。円はモード $k=1$ で、反復のたびに少しずつ縮みます。十分長く続ければ、どんな閉じた形も 1 点に縮みます。これが**収縮（shrinkage）**です。

### Taubin の $\lambda\vert\mu$ 平滑化

Taubin（1995）は、$\lambda > 0$ の縮むステップと $\mu < -\lambda$ の膨らむステップを交互に行います。

$$
f(\kappa) = (1 - \lambda\kappa)(1 - \mu\kappa).
$$

この係数は小さい $\kappa$ では 1 に近く（形状は大きさを保つ）、大きい $\kappa$ では小さくなります（ノイズを除去）。つまりローパスフィルタです。$f$ が再び 1 を横切る**通過帯域周波数**は $k_{PB} = 1/\lambda + 1/\mu$ で、Taubin は $k_{PB} \approx 0.1$ を勧めています。$\lambda = 0.33$、$\mu = -0.34$ なら $k_{PB} = 3.03 - 2.94 = 0.09$ です。数値例：$\kappa = 1$（中間の周波数）で $f = 0.67 \times 1.34 = 0.90$、$\kappa = 2$（最もギザギザなモード）で $f = 0.34 \times 1.68 = 0.57$ です。一方、$\lambda = 0.5$ の陽的平滑化ではそれぞれ $0.5$ と $0$ です。$\kappa$ が $k_{PB}$ より小さいところでは $f$ がわずかに 1 を*上回る*ので、Taubin 平滑化は最低周波をわずかに増幅します。数十から数百回の反復向けで、数千回向けではありません。

### 陰的フェアリング

Desbrun ら（1999）は、[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})と同じく**陰的**（後退）オイラー法を使います。

$$
(\mathbf{I} - h\,\mathbf{L})\,\mathbf{x}' = \mathbf{x}, \qquad f(\kappa) = \frac{1}{1 + h\kappa}.
$$

無条件に安定なので、大きな 1 ステップ $h$ で多数の陽的な小ステップを置き換えられます。代償は疎な線形方程式の求解です。彼らはまた、コタンジェント・ラプラシアンこそがここでの正しい作用素であることを示しました。頂点を法線方向にだけ動かすからです。さらに体積を保つようにスケールし直します。

```python
import numpy as np

rng = np.random.default_rng(3)
n = 200
th = np.linspace(0, 2 * np.pi, n, endpoint=False)
r = 1 + 0.25 * np.cos(5 * th) + 0.04 * rng.standard_normal(n)
X0 = np.c_[r * np.cos(th), r * np.sin(th)]                  # a noisy closed curve
I = np.eye(n)
L = -I + 0.5 * (np.roll(I, 1, 1) + np.roll(I, -1, 1))       # uniform Laplacian of a polygon

def area(X):
    x, y = X[:, 0], X[:, 1]
    return 0.5 * abs(x @ np.roll(y, -1) - y @ np.roll(x, -1))

X, Y = X0.copy(), X0.copy()
for _ in range(1000):
    X = X + 0.5 * (L @ X)                                   # Laplacian smoothing
    Y = Y + 0.33 * (L @ Y); Y = Y - 0.34 * (L @ Y)          # Taubin lambda|mu
Z = np.linalg.solve(I - 25.0 * L, X0)                       # one implicit step
for name, S in [("laplacian", X), ("taubin", Y), ("implicit", Z)]:
    print(f"{name:9s} area ratio = {area(S) / area(X0):.3f}")
# laplacian area ratio = 0.593
# taubin    area ratio = 1.029
# implicit  area ratio = 0.949
```

曲線は 1 次元のメッシュなので、フィルタが形状に作用する様子を目で確かめられます。`L` をメッシュのラプラシアンに置き換えれば、同じコードが三角形メッシュでも動きます。

次の図は、同じノイズ入りの曲線に 3 種類のフィルタを適用した結果です。灰色が初期の曲線で、青緑・紫・赤の順に反復回数が多くなります（陰的の列ではステップ数が多くなります）。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-smoothing.svg" caption="スクリプトのノイズを含む五弁の曲線を平滑化したもの。陽的ラプラシアン平滑化（$\lambda=0.5$）は 10 回以内にノイズを消し、その後は花弁を消して曲線全体を縮め続けます。Taubin 平滑化はノイズを消しますが、花弁と大きさは保ちます。$h=25$ の陰的フェアリングは 1 ステップで強く平滑化します。右：初期値に対する囲まれた面積の比。ラプラシアンの曲線は下がり続け（1000 回後に 0.59）、Taubin の曲線は 1 付近にとどまって最後は 3% 上回ります。これは伝達関数が予言するわずかな低周波の増幅です。" %}

## 5. 細分割曲面

細分割（subdivision）は逆向きの操作です。粗い**制御メッシュ**から出発し、決まった局所的な平均化規則で面の分割と頂点の移動を繰り返して、滑らかな曲面を得ます。極限ではメッシュは滑らかな**極限曲面（limit surface）**に収束します。アーティストは軽いケージをモデリングし、レンダラが細分割します。

1 次元の場合ですべてが説明でき、下のウィジェットで試せます。**Chaikin** の角切りは、各辺 $\mathbf{p}\_i\mathbf{p}\_{i+1}$ を 2 点 $\frac34\mathbf{p}\_i + \frac14\mathbf{p}\_{i+1}$ と $\frac14\mathbf{p}\_i + \frac34\mathbf{p}\_{i+1}$ で置き換えます。極限は一様 2 次 B スプラインです。**3 次 B スプライン**法は辺の中点を挿入し、古い点を $\frac18(\mathbf{p}\_{i-1} + 6\mathbf{p}\_i + \mathbf{p}\_{i+1})$ へ動かします。どちらも**近似型（approximating）**で、曲線は制御点を通りません。Dyn、Levin、Gregory の **4 点法**は古い点を残し、$\frac{9}{16}(\mathbf{p}\_i + \mathbf{p}\_{i+1}) - \frac1{16}(\mathbf{p}\_{i-1} + \mathbf{p}\_{i+2})$ を挿入します。**補間型（interpolating）**で、極限は $C^1$ です。

{% include widget.liquid name="graphics-subdivision" height="460" caption="閉多角形の制御点（黒）をマウスまたは指でドラッグし、スキームを選んでレベルのスライダーを動かしてください。Chaikin と 3 次 B スプラインは角を切り落とし、制御点を通らない滑らかな曲線に近づきます。4 点法は制御点を通り、オーバーシュートすることがあります。表示は現在のレベルの点の数です。" %}

### Loop 細分割（三角形）

Loop（1987）は 4 次ボックススプラインを三角形メッシュに一般化しました。各ステップは辺ごとに**奇（odd）**頂点を 1 つ挿入して各三角形を 4 つに分け、古い**偶（even）**頂点を更新します。

- 内部辺 $ab$（対頂点 $c, d$）上の奇頂点：$\;\frac38(\mathbf{a}+\mathbf{b}) + \frac18(\mathbf{c}+\mathbf{d})$
- 価数 $k$、隣接頂点 $\mathbf{p}_j$ の偶頂点：$\;(1 - k\beta)\,\mathbf{v} + \beta\sum_j \mathbf{p}_j$、ただし
  $\beta = \frac1k\Big(\frac58 - \big(\frac38 + \frac14\cos\frac{2\pi}{k}\big)^2\Big)$

正則な価数 $k = 6$ では $\cos(\pi/3) = \frac12$ なので $\beta = \frac16(\frac58 - \frac14) = \frac1{16}$ です。頂点は自分自身の $\frac{10}{16}$ を保ち、各隣接頂点から $\frac1{16}$ ずつ受け取ります。**特異頂点（extraordinary vertices）**（$k \ne 6$）から離れたところでは極限曲面は $C^2$、特異頂点では $C^1$ です。境界と折り目では、境界曲線に沿って 1 次元の 3 次 B スプラインの規則を使います。

```python
from collections import defaultdict
import numpy as np

def loop_subdivide(V, F):
    """One step of Loop subdivision for a closed triangle mesh."""
    n = len(V)
    opp = defaultdict(list)                     # edge (a, b), a < b -> opposite vertices
    nbr = [set() for _ in range(n)]
    for f in F:
        for k in range(3):
            a, b, c = f[k], f[(k + 1) % 3], f[(k + 2) % 3]
            opp[(min(a, b), max(a, b))].append(c)
            nbr[a].add(b); nbr[b].add(a)
    newV = np.zeros((n + len(opp), 3))
    for i in range(n):                          # even vertices
        k = len(nbr[i])
        beta = (5 / 8 - (3 / 8 + np.cos(2 * np.pi / k) / 4) ** 2) / k
        newV[i] = (1 - k * beta) * V[i] + beta * V[list(nbr[i])].sum(0)
    eid = {}
    for m, ((a, b), cs) in enumerate(opp.items()):   # odd vertices
        eid[(a, b)] = n + m
        newV[n + m] = 3 / 8 * (V[a] + V[b]) + 1 / 8 * (V[cs[0]] + V[cs[1]])
    e = lambda a, b: eid[(min(a, b), max(a, b))]
    newF = []
    for a, b, c in F:
        ab, bc, ca = e(a, b), e(b, c), e(c, a)
        newF += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
    return newV, np.array(newF)

V = np.array([(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1.6), (0, 0, -1)], float)
F = np.array([(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)])
for level in range(3):
    V, F = loop_subdivide(V, F)
    print(level + 1, len(V), "vertices", len(F), "faces")   # 18/32, 66/128, 258/512
```

次の図のように、細分割のたびに面数は 4 倍になり、曲面は制御メッシュの内側へ縮みます。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-loop-subdivision.svg" caption="上の頂点を引き上げた八面体の Loop 細分割（`loop_subdivide` で計算）。各レベルで面の数は 4 倍になります。Loop は近似型なので、曲面は制御ケージ（破線：レベル 0 の八面体）の内側に縮み、すぐに滑らかになります。元の 6 頂点は価数 4 で、どのレベルでも特異頂点のままです。" %}

### Catmull–Clark（四角形）

Catmull と Clark（1978）は双 3 次 B スプラインを任意のトポロジーのメッシュに一般化しました。四角形主体のモデリングの標準です。1 ステップで次を作ります。

- 各面に**面点**：面の頂点の平均
- 各辺に**辺点**：両端点と隣接する二つの面点の平均
- 価数 $k$ の各旧頂点の新しい位置：$\;\frac{\mathbf{Q} + 2\mathbf{R} + (k-3)\mathbf{S}}{k}$。$\mathbf{Q}$ は隣接面点の平均、$\mathbf{R}$ は隣接辺の中点の平均、$\mathbf{S}$ は元の位置です。

1 ステップ後、すべての面は四角形になります。極限曲面は特異頂点（価数 $\ne 4$）で $C^1$、それ以外で $C^2$ です。Pixar の OpenSubdiv は Catmull–Clark（と Loop）曲面を GPU で評価し、DeRose、Kass、Truong は映画のキャラクターのためにセミシャープな折り目を加えました。Stam（1998）は、細分割行列の固有構造を使えば、細分割を一切行わずに任意のパラメータ値で極限曲面を厳密に評価できることを示しました。CAD では円錐曲線を厳密に表せる NURBS が好まれますが、キャラクターモデリングでは細分割曲面が主流です。

## 6. 二次誤差計量による簡略化

逆の問題は、100 万三角形のメッシュを、LOD、ストリーミング、衝突判定のために 1 万三角形に減らすことです。Garland と Heckbert（1997）は、**二次誤差計量（quadric error metrics, QEM）** を使った**辺の縮約**を標準にしました。縮約後の頂点 $\bar{\mathbf{v}}$ による誤差の増加が最小の辺 $(\mathbf{u}, \mathbf{w})$ を繰り返し縮約します。

誤差は、各頂点の周りの元の面の平面に対して測ります。平面は $\mathbf{n}^\top\mathbf{x} + d = 0$、$\lVert\mathbf{n}\rVert = 1$ です。同次座標 $\mathbf{p} = (\mathbf{n}, d)$、$\tilde{\mathbf{x}} = (\mathbf{x}, 1)$ を使うと、$\mathbf{x}$ から平面までの距離の 2 乗は

$$
(\mathbf{p}^\top\tilde{\mathbf{x}})^2 = \tilde{\mathbf{x}}^\top(\mathbf{p}\mathbf{p}^\top)\tilde{\mathbf{x}} = \tilde{\mathbf{x}}^\top\mathbf{K}_p\,\tilde{\mathbf{x}}
$$

です。ポイントは、多数の平面までの距離の 2 乗の*和*も一つの二次形式になることです。$\mathbf{Q}\_v = \sum_{p \ni v}\mathbf{K}\_p$ は対称な $4\times4$ 行列（10 個の数）です。$\mathbf{u}$ と $\mathbf{w}$ が合わさると、新しい二次形式は単に $\mathbf{Q}\_u + \mathbf{Q}\_w$ で、最適な位置は $\tilde{\mathbf{x}}^\top(\mathbf{Q}\_u+\mathbf{Q}\_w)\tilde{\mathbf{x}}$ を最小化します。$\mathbf{x}$ についての勾配を 0 とおくと、$3\times3$ の連立一次方程式になります。Garland と Heckbert の書き方では、$\mathbf{Q}$ の最終行を $(0,0,0,1)$ に置き換えて次を解きます。

$$
\begin{pmatrix} q_{11} & q_{12} & q_{13} & q_{14}\\ q_{12} & q_{22} & q_{23} & q_{24}\\ q_{13} & q_{23} & q_{33} & q_{34}\\ 0&0&0&1 \end{pmatrix}\tilde{\mathbf{x}} = \begin{pmatrix}0\\0\\0\\1\end{pmatrix}.
$$

行列が特異なら（平らな領域のように、平面がほぼすべて平行なとき）、両端点と中点のうち最良のものを選びます。

**数値例。** 立方体の角の頂点は平面 $x=0$、$y=0$、$z=0$ に接しています。$\mathbf{p}_1 = (1,0,0,0)$ などなので $\mathbf{Q} = \mathrm{diag}(1,1,1,0)$ となり、点の誤差は $x^2+y^2+z^2$ です。角そのものの誤差は 0 で、どんな移動にも距離の 2 乗のコストがかかります。平らな領域の頂点は平面を一つしか見ないので $\mathbf{Q} = \mathbf{p}\mathbf{p}^\top$ は階数 1 で、平面内の移動はコストがかかりません。だからこそ QEM は平らな領域から先に頂点を取り除き、角や折り目を残すのです。

アルゴリズム：

1. 各頂点の $\mathbf{Q}_v$ を計算します。
2. 各辺について最適な $\bar{\mathbf{v}}$ とそのコストを計算し、すべての辺を最小ヒープに入れます。
3. 最もコストの低い辺を取り出し、縮約が有効か確認し（下記）、$\mathbf{u}$ を $\bar{\mathbf{v}}$ へ動かし、$\mathbf{w}$ とその辺上の二つの三角形を削除し、$\mathbf{Q}_u \leftarrow \mathbf{Q}_u+\mathbf{Q}_w$ として、$\mathbf{u}$ の周りの辺の新しいコストをプッシュします。
4. 目標の面数になるまで繰り返します。

二つの有効性チェックがメッシュをきれいに保ちます。**リンク条件（link condition）**：$\mathbf{u}$ と $\mathbf{w}$ はちょうど二つの隣接頂点（その辺上の二つの三角形の頂点）を共有しなければなりません。そうでないと縮約で非多様体の辺ができます。そして**反転チェック**：縮約後に残る三角形の法線が裏返ってはいけません。

```python
import heapq
import numpy as np

def qem_simplify(V, F, target):
    V = V.copy(); F = [list(f) for f in F]; n = len(V)
    vf = [set() for _ in range(n)]                    # vertex -> incident faces
    for fi, f in enumerate(F):
        for v in f: vf[v].add(fi)
    Q = np.zeros((n, 4, 4))
    for f in F:
        a, b, c = V[f]
        nrm = np.cross(b - a, c - a); nrm /= np.linalg.norm(nrm)
        p = np.append(nrm, -nrm @ a)
        for v in f: Q[v] += np.outer(p, p)
    alive, ver = np.ones(n, bool), np.zeros(n, int)
    neighbors = lambda v: {w for fi in vf[v] for w in F[fi]} - {v}

    def best(u, w):
        Qs = Q[u] + Q[w]
        A = Qs.copy(); A[3] = [0, 0, 0, 1]
        if np.linalg.cond(A) < 1e8:
            x = np.linalg.solve(A, [0, 0, 0, 1.0])
        else:
            cands = [np.append(V[u], 1), np.append(V[w], 1), np.append((V[u] + V[w]) / 2, 1)]
            x = min(cands, key=lambda c: c @ Qs @ c)
        return float(x @ Qs @ x), x[:3]

    heap = []
    def push(u, w):
        cost, x = best(u, w)
        heapq.heappush(heap, (cost, u, w, ver[u], ver[w], tuple(x)))
    for u in range(n):
        for w in neighbors(u):
            if u < w: push(u, w)
    faces = len(F)
    while faces > target and heap:
        cost, u, w, vu, vw, x = heapq.heappop(heap)
        if not (alive[u] and alive[w]) or ver[u] != vu or ver[w] != vw:
            continue                                  # stale heap entry
        if len(neighbors(u) & neighbors(w)) != 2:
            continue                                  # link condition
        x, shared = np.array(x), vf[u] & vf[w]
        flip = False
        for fi in (vf[u] | vf[w]) - shared:           # normal flip check
            old = V[F[fi]]
            new = np.array([x if v in (u, w) else V[v] for v in F[fi]])
            n0 = np.cross(old[1] - old[0], old[2] - old[0])
            n1 = np.cross(new[1] - new[0], new[2] - new[0])
            if n0 @ n1 <= 0.1 * np.linalg.norm(n0) * np.linalg.norm(n1):
                flip = True; break
        if flip:
            continue
        V[u], Q[u] = x, Q[u] + Q[w]                   # collapse w into u
        for fi in shared:
            for v in F[fi]: vf[v].discard(fi)
            faces -= 1
        for fi in vf[w]:
            F[fi] = [u if v == w else v for v in F[fi]]; vf[u].add(fi)
        vf[w], alive[w] = set(), False
        ver[u] += 1                                   # invalidates old entries of u
        for nb in neighbors(u): push(u, nb)
    keep = sorted({fi for v in range(n) if alive[v] for fi in vf[v]})
    return V, np.array([F[fi] for fi in keep])
```

頂点ごとのバージョンカウンタ `ver` は、標準的な遅延削除のテクニックです。ヒープ内のエントリを更新する代わりに新しいエントリをプッシュし、取り出したときにプッシュ後に頂点が変化していたエントリは無視します。実用的な実装（meshoptimizer、PyMeshLab の二次誤差デシメーション、CGAL の `Surface_mesh_simplification`）は、UV や法線を考慮する属性付き二次形式、境界を守る平面、薄い部分の保護などを加えています。

次の図は、同じメッシュをだんだん少ない面数まで簡略化したとき、頂点がどこに残るかを示します。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-qem.svg" caption="`qem_simplify` による QEM 辺縮約。凹凸があり細長い球（1,280 面のアイコスフィア）を 400、150、60 面まで減らしています。強く曲がった領域ほど多くの頂点が残ります。そこで縮約すると、表面が多くの異なる平面から離れるからです。平らな領域が先に簡略化され、大きな三角形が残ります。" %}

## 7. パラメータ化

**パラメータ化（parameterization）**は曲面パッチを平面に写す操作 $\mathbf{x}_i \mapsto \mathbf{u}_i \in \mathbb{R}^2$ です。2D テクスチャを 3D 曲面に貼るため（[第 3 回]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})の UV）や、リメッシュやフィッティングを 2D で行うために使います。歪みなしに平らにできるのは可展面（ガウス曲率 0）だけなので、どの手法も何を保つかを選びます。角度（**等角**、conformal）、面積（**等積**、equiareal）、あるいはできるだけ剛性を保つかです。

### Tutte 埋め込み

Tutte（1963）はグラフについて驚くべき定理を証明し、Floater がそれをメッシュに持ち込みました。円板トポロジーのメッシュを取り、境界頂点を順番に凸多角形上に固定し、各内部頂点をその隣接頂点の凸結合の位置に置きます。

$$
\mathbf{u}_i = \sum_{j \in N(i)} \lambda_{ij}\,\mathbf{u}_j, \qquad \lambda_{ij} > 0, \quad \sum_j\lambda_{ij} = 1 .
$$

すると結果は正しい埋め込みになります。反転する三角形も重なる三角形もありません。計算としては疎な連立一次方程式を 1 回解くだけです：$\mathbf{L}\_{II}\mathbf{U}\_I = -\mathbf{L}\_{IB}\mathbf{U}\_B$（ラプラシアンの内部行。境界の位置は右辺に移します）。一様重みなら「重心」埋め込み、すなわち Tutte 埋め込みです。コタンジェント重みなら離散**調和写像（harmonic map）**で、メッシュの形をよりよく保ちますが、重みが負になるところで三角形が反転することがあります。Floater の**平均値座標（mean-value coordinates）**は、常に正で、しかも形状を考慮した重みを与えます。

```python
import numpy as np

def tutte(V, F, loop, L):
    """Pin the boundary `loop` to the unit circle (by arc length), solve for interior UVs.
    L: a Laplacian with positive off-diagonal weights (uniform or cotan) and rows summing to 0."""
    n = len(V)
    seg = np.linalg.norm(V[loop] - V[np.roll(loop, -1)], axis=1)
    t = 2 * np.pi * np.r_[0, np.cumsum(seg)[:-1]] / seg.sum()
    UV = np.zeros((n, 2))
    UV[loop] = np.c_[np.cos(t), np.sin(t)]
    inner = np.setdiff1d(np.arange(n), loop)
    UV[inner] = np.linalg.solve(L[np.ix_(inner, inner)], -L[np.ix_(inner, loop)] @ UV[loop])
    return UV
```

一様な重みでは `L` は $\mathbf{A}-\mathbf{D}$（$\mathbf{A}$ は隣接行列、$\mathbf{D}$ は価数の対角行列）で、コタンジェントの重みでは前節の `cotan_laplacian` です。次の図は、バンプのあるパッチでこの 2 つを比べたものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-tutte.svg" caption="こぶのある $16\times16$ の格子パッチ（左、オレンジはその境界）を、境界を弧長に従って単位円に固定して平らにしたもの。中：一様重みの Tutte 埋め込み。右：コタンジェント重みの調和写像。各三角形は面積比（2D/3D、どちらも正規化）の $\log_2$ で色分けしています。青い三角形は縮み、赤い三角形は大きくなっています。こぶは投影面積よりずっと大きな 3D 面積を持つため、どちらの写像でも圧縮されます。二つの重みが残りの歪みをどこに置くかを比べてください。各タイトルは、そのマップでの $\log_2$ 面積比の絶対値の最大値を示します。" %}

### LSCM と ARAP

境界を円に固定することが、歪みの大きな原因です。**最小二乗等角写像（least squares conformal maps, LSCM、Lévy ら 2002）**は境界を自由にします。各三角形で $u$ と $v$ の勾配が直交し長さが等しいとき、すなわち $\nabla v = \mathbf{n}\times\nabla u$（コーシー–リーマン方程式）のとき、写像は等角です。LSCM は三角形ごとの違反の 2 乗和を最小化します。これは二次エネルギーなので、解はやはり疎な連立一次方程式です。2 頂点を固定すれば相似変換の零空間が消えます。**ARAP パラメータ化**（Liu ら 2008）は、各三角形の 2D 像が 3D 三角形を回転したコピーであることを求めます。*局所*ステップ（三角形ごとに $2\times 2$ の SVD で最適な回転を求める。Sorkine と Alexa の ARAP 曲面モデリングと同じ）と、*大域*ステップ（固定のコタンジェント・ラプラシアン行列で疎な求解を 1 回）を交互に行い、角度と面積をできるだけ両方保ちます。実際のテクスチャアトラスでは、まず曲面をチャートに切り分け（シーム）、各チャートを LSCM か ARAP で平らにし、チャートをテクスチャに詰め込みます。Blender の「展開（Unwrap）」には「角度ベース（Angle Based）」と「等角（Conformal、LSCM）」の両方があります。

## 8. 陰関数曲面

陰関数曲面は、関数のゼロ集合 $S = \{\mathbf{x} : f(\mathbf{x}) = 0\}$ で、内部では $f < 0$ です。**符号付き距離関数（signed distance function, SDF）** はその特別な場合で、$\lvert f(\mathbf{x})\rvert = $ $S$ までの距離、したがってほとんど至るところで $\lVert\nabla f\rVert = 1$ です。SDF を使うと、いくつかの操作が簡単になります。

| 操作 | 式 |
| --- | --- |
| 球 / 円 | $f(\mathbf{x}) = \lVert\mathbf{x} - \mathbf{c}\rVert - r$ |
| 和、積 | $\min(f_1, f_2)$、$\;\max(f_1, f_2)$ |
| 差 | $\max(f_1, -f_2)$ |
| 滑らかな和 | $\mathrm{smin}_k(f_1, f_2) = f_2(1-h) + f_1 h - k\,h(1-h)$、$\;h = \mathrm{clamp}\big(\tfrac12 + \tfrac{f_2-f_1}{2k}, 0, 1\big)$ |
| オフセット / 丸め | $f - r$ |
| 法線 | $\mathbf{n} = \nabla f / \lVert\nabla f\rVert$ |

（min、max、滑らかな min の後の結果は厳密な SDF ではなく距離の上界にすぎませんが、下のスフィアトレーシングには安全に使えます。）DeepSDF、NeuS、Neuralangelo のようなニューラルフィールドは $f$ をネットワークで表しますが、この節の内容はすべてそのまま当てはまります。

### Marching Squares と Marching Cubes

メッシュを得るには、$f$ を格子上でサンプリングし、符号が変わる場所を探します。2D の **Marching Squares** は各セルを独立に処理します。4 つの角はそれぞれ内側か外側で、$2^4 = 16$ 通りです。両端の符号が異なる各辺上で、交点を線形補間で置きます。

$$
\mathbf{x} = \mathbf{x}_a + t(\mathbf{x}_b - \mathbf{x}_a), \qquad t = \frac{f_a}{f_a - f_b}.
$$

例えば $f_a = -0.2$、$f_b = 0.3$ なら $t = 0.2/0.5 = 0.4$ です。交点が 2 つのセルは線分 1 本になります。二つの**鞍点**ケース（対角の角が内側）は交点が 4 つで、組み合わせ方が 2 通りあります。セル中心で $f$ をサンプリングすれば、一貫して片方を選べます。

```python
import numpy as np

def marching_squares(f, xs, ys):
    G = f(np.stack(np.meshgrid(xs, ys, indexing="ij"), -1))
    segs = []
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            cx = [xs[i], xs[i + 1], xs[i + 1], xs[i]]        # corners counter-clockwise
            cy = [ys[j], ys[j], ys[j + 1], ys[j + 1]]
            v = [G[i, j], G[i + 1, j], G[i + 1, j + 1], G[i, j + 1]]
            pts = {}
            for e in range(4):                                # edge e joins corners e, e+1
                a, b = e, (e + 1) % 4
                if (v[a] < 0) != (v[b] < 0):
                    t = v[a] / (v[a] - v[b])
                    pts[e] = (cx[a] + t * (cx[b] - cx[a]), cy[a] + t * (cy[b] - cy[a]))
            if len(pts) == 2:
                segs.append(list(pts.values()))
            elif len(pts) == 4:                               # saddle: ask the cell centre
                c = f(np.array([(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2]))
                if (c < 0) == (v[0] < 0):                     # corners 0 and 2 connected
                    segs += [[pts[0], pts[1]], [pts[2], pts[3]]]
                else:
                    segs += [[pts[3], pts[0]], [pts[1], pts[2]]]
    return segs

circle = lambda p: np.hypot(p[..., 0], p[..., 1]) - 0.6
segs = marching_squares(circle, np.linspace(-1, 1, 12), np.linspace(-1, 1, 12))
print(len(segs), "segments")                                  # 24
```

次の図は、このコードを 2 次元 SDF に適用し、2 通りのセル数を比べたものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-marching-squares.svg" caption="左：2D の SDF（円と箱の滑らかな和）とその等値線。太線が $f=0$ です。中：$11\times11$ セルでの Marching Squares。青の塗りつぶし点が内側（$f<0$）、赤の白抜き点が外側、紫の線分が出力、灰色の破線が真のゼロ集合です。右：$35\times35$ セルでは、出力は見た目には正確です。曲線に沿った精度を決めるのは格子ではなく線形補間で、格子が決めるのはどの細部をそもそも解像できるかです。" %}

同じアルゴリズムをその場で動かせます。ウィジェットの SDF は 3 つの円の滑らかな和です。

{% include widget.liquid name="graphics-marching-squares" height="440" caption="動く SDF の上での Marching Squares。3 つの円の中心をマウスまたは指でドラッグし、セル数を変えてみてください。青い点は内側（$f<0$）、赤の白抜きの点は外側、紫の線分が出力、破線は細かい格子で求めた参照曲線です。線形補間のチェックを外すと交点がすべて辺の中点に置かれ、階段状になる様子が見えます。セルが非常に少ないと、円の塊の間の細いくびれが消えたりちぎれたりします。どの特徴をそもそも解像できるかは格子が決めるのです。" %}

**Marching Cubes**（Lorensen と Cline 1987）は同じ考え方の 3D 版です。8 つの角で $2^8 = 256$ 通り、対称性で 15 クラスに減り、それぞれを三角形のテーブルとして持ちます。元のテーブルには曖昧な面があり穴が残ることがあるため、後の版（漸近判定、Marching Cubes 33）がこれを修正しました。より単純な親戚の **Marching Tetrahedra** は各立方体を 6 つの四面体に分けます。四面体は対称性を除いて 3 通り（角 1 つが内側：三角形、2 つが内側：四角形、なし：何も出さない。3 つや 4 つが内側の場合はこれらの補集合です）しかないので曖昧さがなく、代わりに三角形が増えます。図でこれを使っているのは、アルゴリズム全体が図のスクリプトでわずか 25 行に収まるからです。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-marching-tets.svg" caption="SDF（トーラスと球の滑らかな和）を $26^3$ の格子点でサンプリングし、Marching Tetrahedra で抽出した 3D 等値面。各三角形は、曲面が横切るセル内の四面体 1 つから生まれます。陰影には三角形の法線を使っています。" %}

Marching Cubes は頂点を格子の辺上に置くので、鋭い特徴が丸まってしまいます。**デュアルコンタリング（dual contouring）**（Ju ら 2002）は、曲面が横切る各セルの*内部*に頂点を 1 つ置きます。位置は、交点とその法線（エルミートデータ）から作った QEF（二次誤差関数、quadratic error function。QEM と同じ二次形式の考え方）を最小化する点で、隣り合うセルの頂点同士をつなぎます。鋭い角や稜線を再現でき、適応的な八分木にも対応します。Neural Dual Contouring（Chen ら 2022）は、これらの頂点の置き場所を学習します。

### スフィアトレーシング

メッシュを経由せず、レイマーチング（ray marching）で SDF を直接描画することもできます。[第 5 回]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})のレイキャスティングの延長です。ある点での SDF の値は、表面を含まない球の半径なので、レイ $\mathbf{o} + t\mathbf{d}$ はその分だけ安全に進めます（Hart 1996）。

$$
t_{k+1} = t_k + f(\mathbf{o} + t_k\mathbf{d})
$$

$f < \varepsilon$（ヒット）または $t > t_{\max}$（ミス）で止めます。表面から遠ければステップは大きく、かすめるような角度ではとても小さくなります。これがこの手法の弱点です。Shadertoy 風のデモや多くのニューラルフィールドのレンダラは、このループの上に作られています。

次の図は、同じ SDF の中で 3 本の光線を追跡したものです。ステップ幅が表面までの距離に従って変わる様子に注目してください。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-sphere-tracing.svg" caption="黒い四角から Marching Squares の図の SDF に向けて飛ばした 3 本のスフィアトレーシングのレイ。各円の半径は現在の点での $f$ で、表面に接しても横切らないので、次の点はその円周上にあります。紫のレイは正面からヒットし、数ステップで済みます。オレンジのレイは浅い角度で箱の上面に近づくため、表面に沿って進むにつれてステップが小さくなります。緑のレイはミスして領域から出ていきます。凡例はステップ数です。" %}

## 9. 点からの再構成

スキャナ、深度カメラ、Structure from Motion のパイプライン（[ニューラルレンダリング第 1 回]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})）が出力するのは点であって、メッシュではありません。再構成は水密（watertight）な表面を復元します。

**法線推定。** 各点について $k$ 個の最近傍を取り、平面を当てはめます。法線は近傍の $3\times3$ 共分散行列の最小固有値に対応する固有ベクトルです（PCA、Hoppe ら 1992）。PCA が与えるのは向きではなく直線だけなので、法線をさらに一貫した**向き**に揃える必要があります。古典的には、近傍グラフの最小全域木に沿って伝播させ、隣と一致するように各法線を反転します。

**ポアソン再構成（Poisson reconstruction）**（Kazhdan、Bolitho、Hoppe 2006）。$\chi$ を立体の指示関数（内側 1、外側 0。前に出てきたオイラー標数とは無関係です）とします。その勾配は表面以外ではどこでも 0 で、表面上では内側を向きます。したがって、向き付き法線を滑らかにしたベクトル場 $\vec V$（外向き）は $-\nabla\chi$ のサンプルです。勾配が最もよく一致する $\chi$ を求めます。

$$
\min_\chi \int \lVert\nabla\chi + \vec V\rVert^2 \quad\Longrightarrow\quad \Delta\chi = -\nabla\cdot\vec V .
$$

これはポアソン方程式で、大域的で疎な、条件の良い連立一次方程式です。3D では適応的八分木上で解きます。表面は等値集合 $\chi = \bar\chi$（$\bar\chi$ は入力点での $\chi$ の平均）で、Marching Cubes で抽出します。解が大域的なので、データの穴は滑らかに埋まり、ノイズは平均化されます。**スクリーンド・ポアソン（screened Poisson）**（Kazhdan と Hoppe 2013）は項 $\alpha\sum_i\chi(\mathbf{p}_i)^2$ を加えて、ゼロ等値集合を点の方へ引き寄せます（$\chi$ は表面が 0 になるようずらします）。これで細部が多く残り、過度な平滑化を避けられます。MeshLab、Open3D、CloudCompare に入っているのはこの版です。

2D なら手法全体が 1 ページに収まります。周期的な格子を使えば、FFT でポアソン方程式を厳密に解けます。

```python
import numpy as np

rng = np.random.default_rng(7)
curve = lambda th: 0.55 + 0.13 * np.cos(3 * th) + 0.05 * np.sin(5 * th)
th = np.sort(rng.uniform(0, 2 * np.pi, 140))
P = np.c_[curve(th) * np.cos(th), curve(th) * np.sin(th)] + 0.008 * rng.standard_normal((140, 2))

# 1. PCA normals from the 8 nearest neighbours, oriented away from the centroid
D2 = ((P[:, None] - P[None]) ** 2).sum(-1)
N = np.array([np.linalg.eigh(np.cov(P[np.argsort(d)[:8]].T))[1][:, 0] for d in D2])
N *= np.sign(((P - P.mean(0)) * N).sum(1))[:, None]

# 2. splat the normals into a smooth vector field V on an M x M grid
M = 128
xs = np.linspace(-1, 1, M, endpoint=False); h = xs[1] - xs[0]
GX, GY = np.meshgrid(xs, xs, indexing="ij")
Vx, Vy = np.zeros((M, M)), np.zeros((M, M))
for p, n in zip(P, N):
    g = np.exp(-((GX - p[0]) ** 2 + (GY - p[1]) ** 2) / (2 * (2 * h) ** 2))
    Vx += n[0] * g; Vy += n[1] * g

# 3. solve lap(chi) = -div(V) with the FFT (5-point Laplacian eigenvalues)
div = (np.roll(Vx, -1, 0) - np.roll(Vx, 1, 0) + np.roll(Vy, -1, 1) - np.roll(Vy, 1, 1)) / (2 * h)
k = np.fft.fftfreq(M) * 2 * np.pi
lam = (2 * np.cos(k)[:, None] + 2 * np.cos(k)[None, :] - 4) / h ** 2
lam[0, 0] = 1.0
chi_hat = np.fft.fft2(-div) / lam; chi_hat[0, 0] = 0.0
chi = np.real(np.fft.ifft2(chi_hat))

# 4. iso-value = mean of chi at the samples; extract with marching squares
idx = np.clip(np.round((P + 1) / h).astype(int), 0, M - 1)
iso = chi[idx[:, 0], idx[:, 1]].mean()
print("iso-value", round(float(iso), 4))                     # 0.0485
```

重心を使って向きを決める技は、このような星形の形状でしか使えません。ここでは上で述べた全域木による伝播の代わりです。

次の図は、このコードの実行結果です。

{% include blog_figure.liquid path="assets/img/blog/graphics/08-poisson-2d.svg" caption="スクリプトによる 2D のポアソン再構成。左：ノイズを含む 140 個のサンプルとその PCA 法線。中：$\Delta\chi=-\nabla\cdot\vec V$ の解 $\chi$。外側で低く内側で高く、サンプルを通る等値線を白で示しています。右：その等値線（紫）と真の曲線（破線）。ランダムなサンプルがまばらな場所でも、閉じた滑らかな曲線になっています。" %}

### ニューラル陰関数曲面

多視点再構成は、今ではニューラルフィールドを経由することがよくあります。**NeuS**（Wang ら 2021）は表面を SDF ネットワークのゼロ等値集合として表し、ロジスティック関数で SDF を体積密度に変換します。この変換は、[NeRF 型のボリュームレンダリング]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})が表面で不偏になるように選ばれています。さらに **eikonal** 損失 $(\lVert\nabla f\rVert - 1)^2$ を加えて、$f$ を距離関数に保ちます。**Neuralangelo**（Li ら 2023）は多解像度ハッシュグリッド（[高速な輝度場]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})）を数値勾配と粗から密への学習と組み合わせ、大きなシーンに対応します。ガウシアンの側では、[2D Gaussian Splatting と Gaussian Opacity Fields]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }}) がスプラットを表面らしくしてからメッシュを抽出します。TSDF 融合と Marching Cubes を使うか、ガウシアンの中心で Marching Tetrahedra を行います。これらのパイプラインはどれも最後に第 8 節の抽出に行き着き、たいていは第 6 節の簡略化も使います。

より新しい方向として、フィールドを経由しない方法があります。自己回帰型 Transformer が、アーティストのようにトークンを一つずつ出してメッシュを生成します。MeshGPT（CVPR 2024）は三角形トークンの語彙を学習します。MeshAnything（ICLR 2025）、EdgeRunner（ICLR 2025）、Meshtron（2024 年 12 月のプレプリント）は、点群や画像を条件として、数千面のアーティスト風メッシュへと規模を広げました。こうした手法があるのは、Marching Cubes のメッシュが密で不規則なのに対し、アーティストやゲームエンジンにはコンパクトで構造の整ったトポロジーが必要だからです。

## 10. ツール

これらをすべて自分で書くことはまれです。標準的なライブラリは次のとおりです。

| ライブラリ | 言語 | 得意分野 |
| --- | --- | --- |
| [libigl](https://libigl.github.io/) | C++ ヘッダオンリー、Python バインディング | ラプラシアン、曲率、パラメータ化（LSCM、ARAP）、ブーリアン演算。この記事に近い行列スタイルの API |
| [CGAL](https://www.cgal.org/) | C++ | 頑健な厳密述語、ドロネー、簡略化、リメッシュ、ポアソン、ブーリアン演算 |
| [OpenMesh](https://www.graphics.rwth-aachen.de/software/openmesh/) | C++、Python | ハーフエッジデータ構造、デシメーション、細分割 |
| [geometry-central](https://geometry-central.net/) + [Polyscope](https://polyscope.run/) | C++、Python | 内在的三角形分割、DDG 作用素。手軽な 3D ビューア |
| [PyMeshLab](https://pymeshlab.readthedocs.io/) | Python | MeshLab の全フィルタ：スクリーンド・ポアソン、二次誤差デシメーション、クリーニング |
| [trimesh](https://trimesh.org/) | Python | 読み込み、修復、レイクエリ、ブーリアン演算、便利機能 |
| [Open3D](https://www.open3d.org/) | C++、Python | 点群、法線推定、ポアソン、TSDF 融合 |
| Blender（`bpy`、`bmesh`） | Python | モデリング操作、細分割、デシメーション、UV 展開をスクリプトから |

例えば Open3D なら、第 9 節は 3 回の呼び出し（法線推定、法線の向き付け、ポアソン再構成）で済みます。最初の 2 行はサンプルの点群を用意しているだけです。

```python
import open3d as o3d  # pip install open3d

mesh = o3d.io.read_triangle_mesh(o3d.data.BunnyMesh().path)          # downloads a sample
pcd = mesh.sample_points_poisson_disk(5000)
pcd.estimate_normals(o3d.geometry.KDTreeSearchParamKNN(knn=20))     # PCA normals
pcd.orient_normals_consistent_tangent_plane(15)                     # spanning-tree orientation
rec, density = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(pcd, depth=8)
print(rec)
```

## 試してみよう

- 上の細分割ウィジェットは、Loop と Catmull–Clark の 1 次元版を示しています。4 点法が鋭い制御点の角でオーバーシュートするのに対し、B スプライン系は制御多角形の内側にとどまることを比べてください。
- [ホームページのラボ]({{ '/' | relative_url }}#lab)はメッシュとガウシアンを描画します。Gaussian World タブの表現は、まさに第 9 節で表面を抽出する対象です。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Tutte, *How to draw a graph* | Proc. London Math. Soc. | 1963 | [DOI](https://doi.org/10.1112/plms/s3-13.1.743) | 凸結合による埋め込みは決して反転しない。Tutte パラメータ化の基礎 |
| Catmull & Clark, *Recursively generated B-spline surfaces on arbitrary topological meshes* | Computer-Aided Design | 1978 | [DOI](https://doi.org/10.1016/0010-4485(78)90110-0) | 四角形の細分割。映画のモデリングの標準 |
| Loop, *Smooth Subdivision Surfaces Based on Triangles* | 修士論文、ユタ大学 | 1987 | [MSR ページ](https://www.microsoft.com/en-us/research/publication/smooth-subdivision-surfaces-based-on-triangles/) | 正則領域で極限が $C^2$ の三角形細分割 |
| Lorensen & Cline, *Marching cubes: A high resolution 3D surface construction algorithm* | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37401.37422) | 格子からの等値面抽出 |
| Hoppe et al., *Surface reconstruction from unorganized points* | SIGGRAPH | 1992 | [DOI](https://doi.org/10.1145/133994.134011) | PCA 法線、MST による向き付け、点からの符号付き距離 |
| Pinkall & Polthier, *Computing discrete minimal surfaces and their conjugates* | Experimental Mathematics | 1993 | [DOI](https://doi.org/10.1080/10586458.1993.10504266) | コタンジェント公式 |
| Taubin, *A signal processing approach to fair surface design* | SIGGRAPH | 1995 | [DOI](https://doi.org/10.1145/218380.218473) | メッシュ平滑化をフィルタとして捉える。収縮しない $\lambda\vert\mu$ |
| Hart, *Sphere tracing* | The Visual Computer | 1996 | [DOI](https://doi.org/10.1007/s003710050084) | 距離関数の安全なレイマーチング |
| Garland & Heckbert, *Surface simplification using quadric error metrics* | SIGGRAPH | 1997 | [DOI](https://doi.org/10.1145/258734.258849) | QEM 辺縮約。今も標準のデシメーション |
| Desbrun, Meyer, Schröder & Barr, *Implicit fairing of irregular meshes using diffusion and curvature flow* | SIGGRAPH | 1999 | [DOI](https://doi.org/10.1145/311535.311576) | 陰的積分と、平滑化のためのコタンジェント・ラプラシアン |
| Lévy, Petitjean, Ray & Maillot, *Least squares conformal maps* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566590) | 自由境界の等角パラメータ化を 1 回の線形求解で |
| Ju, Losasso, Schaefer & Warren, *Dual contouring of Hermite data* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566586) | QEF 頂点による陰関数データからの鋭い特徴 |
| Meyer, Desbrun, Schröder & Barr, *Discrete differential-geometry operators for triangulated 2-manifolds* | VisMath (Springer) | 2003 | [DOI](https://doi.org/10.1007/978-3-662-05105-4_2) | 混合ボロノイ面積、曲率作用素 |
| Kazhdan, Bolitho & Hoppe, *Poisson surface reconstruction* | SGP | 2006 | [DOI](https://doi.org/10.2312/SGP/SGP06/061-070) | 再構成をポアソン問題として定式化 |
| Sorkine & Alexa, *As-rigid-as-possible surface modeling* | SGP | 2007 | [DOI](https://doi.org/10.2312/SGP/SGP07/109-116) | 局所/大域の回転フィッティング |
| Liu, Zhang, Xu, Gotsman & Gortler, *A local/global approach to mesh parameterization* | Computer Graphics Forum | 2008 | [DOI](https://doi.org/10.1111/j.1467-8659.2008.01290.x) | ARAP パラメータ化 |
| Kazhdan & Hoppe, *Screened Poisson surface reconstruction* | ACM TOG | 2013 | [DOI](https://doi.org/10.1145/2487228.2487237) | 点制約。実用で使われる版 |
| Wang et al., *NeuS* | NeurIPS | 2021 | [arXiv](https://arxiv.org/abs/2106.10689) | SDF + 不偏なボリュームレンダリングによる多視点の表面再構成 |
| Chen, Tagliasacchi, Funkhouser & Zhang, *Neural Dual Contouring* | ACM TOG (SIGGRAPH) | 2022 | [arXiv](https://arxiv.org/abs/2202.01999) | 学習によるデュアルコンタリング |
| Li et al., *Neuralangelo* | CVPR | 2023 | [arXiv](https://arxiv.org/abs/2306.03092) | シーン規模のハッシュグリッド型ニューラル曲面 |
| Siddiqui et al., *MeshGPT* | CVPR | 2024 | [DOI](https://doi.org/10.1109/CVPR52733.2024.01855) | メッシュをトークン列として扱う |
| Huang et al., *2D Gaussian Splatting for Geometrically Accurate Radiance Fields* | SIGGRAPH | 2024 | [DOI](https://doi.org/10.1145/3641519.3657428) | サーフェル型ガウシアンによる正確なメッシュ |
| Yu, Sattler & Geiger, *Gaussian Opacity Fields* | ACM TOG (SIGGRAPH Asia) | 2024 | [DOI](https://doi.org/10.1145/3687937) | Marching Tetrahedra によるガウシアンからのメッシュ抽出 |
| Chen et al., *MeshAnything* | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2406.10163) | 形状を条件とするアーティスト風メッシュ生成 |
| Tang et al., *EdgeRunner* | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2409.18114) | 自己回帰オートエンコーダによるコンパクトなメッシュのトークン化 |
| Hao et al., *Meshtron* | arXiv プレプリント（2024 年 12 月） | 2024 | [arXiv](https://arxiv.org/abs/2412.09548) | メッシュ生成を数万面規模へ |

## 学習リソース

- Botsch、Kobbelt、Pauly、Alliez、Lévy『*Polygon Mesh Processing*』（A K Peters/CRC、2010、[DOI](https://doi.org/10.1201/b10688)）：第 2〜7 節の教科書です。
- Keenan Crane『[*Discrete Differential Geometry: An Applied Introduction*](https://www.cs.cmu.edu/~kmcrane/Projects/DDG/)』（CMU 15-458/858 の講義ノートと講義動画）：コタンジェント・ラプラシアンと離散曲率の最も明快な導出です。
- **GAMES102**（劉利剛、中国語）：幾何モデリングと処理、スプライン、細分割、パラメータ化。
- [libigl チュートリアル](https://libigl.github.io/tutorial/)：この記事のすべての概念に短い C++/Python の例があります。
- ポアソン再構成のコードは Hoppe と Kazhdan のプロジェクトページに、実用的な簡略化には [meshoptimizer](https://github.com/zeux/meshoptimizer) があります。

## 演習

1. 境界の欠損 $\pi - \sum\theta$ を使って、境界のあるメッシュに対する離散ガウス–ボネの定理を証明してください。図のスクリプト（`bin/figures/graphics/graphics_08.py`）の `grid_patch` で数値的に確かめてください。
2. `mean_curvature` の重心面積を混合ボロノイ面積（Meyer ら：鈍角でない三角形ではボロノイ面積、それ以外では三角形の面積の半分または 4 分の 1）に置き換え、トーラスの厳密な曲率に対する誤差を比べてください。
3. 閉じた四角形メッシュに対する Catmull–Clark 細分割を実装し、立方体に適用してください。数レベル後、曲面は球からどれくらい離れているでしょうか。
4. `qem_simplify` に境界を保護する項を加えてください。各境界辺について、その辺を通り面に垂直な平面の二次形式を大きな重みで加えます。格子パッチを簡略化して境界を比べてください。
5. 2D ポアソンのコードを、片側のサンプルを半分取り除いて実行してください。隙間で再構成はどうなるでしょうか。また、大域的な求解がなぜそう振る舞うのでしょうか。

<details markdown="1"><summary>演習 3 のヒント</summary>

立方体を 6 枚の四角形として保存します。面点は面の中心です。辺点は 4 点の平均です。頂点の規則では立方体の角はすべて $k = 3$ なので $(\mathbf{Q} + 2\mathbf{R})/3$ です。極限曲面は球ではありません。中心から元の角の方向と面の中心の方向への距離を比べてください。

</details>

<details markdown="1"><summary>演習 5 のヒント</summary>

ポアソン方程式に湧き出し項があるのはサンプルのある場所だけです。隙間では $\chi$ は調和関数なので、等値線は両側をつなぐ最も滑らかな曲線で穴を閉じます。

</details>

次回：[アニメーションとキャラクター]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})。メッシュに骨格、スキンウェイト、動きが加わります。
