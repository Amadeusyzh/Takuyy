---
layout: post
title: "レイトレーシングとパストレーシング：交差判定から不偏なグローバルイルミネーションまで"
date: 2026-10-27 09:05:00+0900
description: "レイと球の交差判定と Möller-Trumbore 法、SAH による BVH、モンテカルロ積分、重点的サンプリング、ロシアンルーレット、次イベント推定と MIS を学び、最後にコンパクトな NumPy パストレーサーを実装します。"
categories: graphics
tags: [ray-tracing, path-tracing, monte-carlo, bvh, importance-sampling, mis]
series: graphics
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[前回の記事]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})ではレンダリング方程式を書き下し、物理ベースの BRDF を構築しましたが、ラスタライザと同じように少数の点光源に対してしか評価しませんでした。レンダリング方程式は*すべての*入射方向にわたる積分であり、各方向から届く光そのものが、また別のレンダリング方程式の解になっています。**パストレーシング**（path tracing）は、この再帰的な積分をモンテカルロサンプリングで直接解きます。ランダムなレイを飛ばし、跳ね返りながら追跡し、その結果を平均するのです。パストレーシングはオフラインの映画レンダリングを支える基準アルゴリズムであり、リアルタイム手法（次回）が近似しようとする「正解」であり、微分可能レンダリングやニューラルレンダリングが逆に解こうとする順モデルでもあります。

本記事では、レイとプリミティブの交差判定、加速構造、モンテカルロ推定量、パストレーシングを実用的にする分散低減の技法、そして最後に約 130 行のベクトル化された NumPy パストレーサーまで、すべての部品をゼロから組み立てます。

## 前提知識

- ベクトル、内積と外積、正規直交基底（[第 1 回]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})）。
- 放射輝度、立体角、レンダリング方程式、BRDF と GGX マイクロファセットモデル（[第 4 回]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})）。
- 基礎的な確率論：確率変数、期待値、分散、確率密度関数（probability density function、pdf）。
- Python と NumPy。

## 1. レイとカメラ

レイ（ray）は半直線 $\mathbf{r}(t) = \mathbf{o} + t\,\mathbf{d}$、$t > 0$ で、原点 $\mathbf{o}$ と単位方向 $\mathbf{d}$ を持ちます。ラスタライゼーションは「この三角形はどのピクセルを覆うか？」を問い、レイトレーシングはその逆、「このピクセルはどの表面を見ているか？」を問います。$\mathbf{e}$ に置かれ、$-z$ 方向を向き、垂直画角が $\phi$ のピンホールカメラでは、$W \times H$ 画像のピクセル $(i, j)$ を通るレイ（ピクセル内のランダムなオフセット $\xi \in [0,1)^2$ を加えると、アンチエイリアシングが無料で得られます）は次のとおりです。

$$
x = \frac{2(i+\xi_x)}{W} - 1,\qquad y = 1 - \frac{2(j+\xi_y)}{H},\qquad
\mathbf{d} = \operatorname{normalize}\!\left(x \tan\tfrac{\phi}{2}\,a,\; y \tan\tfrac{\phi}{2},\; -1\right),
$$

ここで $a = W/H$ はアスペクト比です（正方形の画像を使うので $a = 1$）。Turner Whitted の 1980 年のレイトレーサーはこのようなレイを追跡し、各交点で影のレイ、反射レイ、屈折レイを再帰的に生成しました。これでシャープな鏡面と硬い影は得られますが、ソフトシャドウ、光沢反射、カラーブリーディング（color bleeding）は得られません。それらには方向にわたる積分が必要であり、それこそが本記事の残りのテーマです。

下の図は、第 7 節の Cornell box に対して $5\times5$ の小さな画像のレイを描いたもので、各レイは実際に当たった面で終わっています。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-camera-rays.svg" caption="$\mathbf{e}=(0,0,3.9)$ にある画角 40° のピンホールカメラの一次レイ（y 軸が上、$-z$ 方向を向く）。各レイは目の前 1 単位にある紫の画像面の画素中心を通り、最初の交点（黒い点）で止まります。交点は第 7 節の交差判定コードで計算しています。" %}

## 2. レイとプリミティブの交差判定

### 球

レイを $\lVert \mathbf{x} - \mathbf{c} \rVert^2 = r^2$ に代入します。$\mathbf{oc} = \mathbf{o} - \mathbf{c}$、$\lVert \mathbf{d} \rVert = 1$ とすると、

$$
t^2 + 2\,b\,t + c' = 0,\qquad b = \mathbf{oc}\cdot\mathbf{d},\quad c' = \mathbf{oc}\cdot\mathbf{oc} - r^2,\qquad
t = -b \pm \sqrt{b^2 - c'} .
$$

判別式が負ならば交差しません。小さい方の正の解を採用し、大きい方だけが正ならば、レイは球の内部から出発しています（屈折で起こります）。

下の図は、球の外から出る 3 つの場合と、球の内側から出る 1 本のレイを示します。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-ray-sphere.svg" caption="左：半径 $r$ の球に対する 4 本のレイ。右：各レイの二次式 $t^2+2bt+c'$。その根が交点までの距離です。青は正の根が 2 つ（入る点と出る点）、緑は球に接し（重根）、灰色はゼロにならず（判別式が負で交差なし）、オレンジのレイは球の内側から出るので近い根が負（白抜きの点）で、遠い根だけが有効です。" %}

### 三角形：Möller-Trumbore 法

三角形 $(\mathbf{v}_0, \mathbf{v}_1, \mathbf{v}_2)$ の内部の点は $(1-u-v)\mathbf{v}_0 + u\mathbf{v}_1 + v\mathbf{v}_2$ と書け、重心座標（barycentric coordinates）は $u, v \ge 0$、$u + v \le 1$ を満たします（[第 2 回]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})と同じ座標です）。これをレイ上の点と等しいとおくと、$(t, u, v)$ についての $3 \times 3$ 連立一次方程式が得られます。$\mathbf{e}_1 = \mathbf{v}_1 - \mathbf{v}_0$、$\mathbf{e}_2 = \mathbf{v}_2 - \mathbf{v}_0$、$\mathbf{T} = \mathbf{o} - \mathbf{v}_0$ とすると、

$$
\begin{bmatrix} -\mathbf{d} & \mathbf{e}_1 & \mathbf{e}_2 \end{bmatrix}
\begin{bmatrix} t \\ u \\ v \end{bmatrix} = \mathbf{T}.
$$

クラメルの公式とスカラー三重積の恒等式 $\det[\mathbf{a}\ \mathbf{b}\ \mathbf{c}] = (\mathbf{a}\times\mathbf{b})\cdot\mathbf{c}$ を使うと、Möller-Trumbore の公式（1997）になります。$\mathbf{P} = \mathbf{d}\times\mathbf{e}_2$、$\mathbf{Q} = \mathbf{T}\times\mathbf{e}_1$ として、

$$
\det = \mathbf{e}_1\cdot\mathbf{P},\qquad
u = \frac{\mathbf{T}\cdot\mathbf{P}}{\det},\qquad
v = \frac{\mathbf{d}\cdot\mathbf{Q}}{\det},\qquad
t = \frac{\mathbf{e}_2\cdot\mathbf{Q}}{\det}.
$$

このアルゴリズムは平面方程式の事前計算を必要とせず、$u$ や $v$ が三角形の外に出た時点で早期に打ち切れます。$\det$ がほぼゼロならレイは三角形と平行です。返される $u, v$ は、交点で法線や UV を補間するときの重みそのものです。

下の図は、後のコードと同じテスト用のレイを使っています。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-moller-trumbore.svg" caption="コードのテストケースでの Möller-Trumbore：$\mathbf{o}=(0.2,0.3,-1)$ から $+z$ 方向に出たレイは、三角形 $\mathbf{v}_0=(0,0,0)$, $\mathbf{v}_1=(1,0,0)$, $\mathbf{v}_2=(0,1,0)$ と $t=1$、$(u,v)=(0.2,0.3)$ で交差します。交点は三角形を 3 つに分け、その面積が重心座標の重みです：赤（$\mathbf{v}_1$ の対辺側）が $u$、緑（$\mathbf{v}_2$ の対辺側）が $v$、青が $1-u-v$。右：同じ交点を $(u,v)$ パラメータ領域で見たもの。破線のレイは $u+v>1$ なので外れます。" %}

```python
import numpy as np

def ray_sphere(o, d, c, r):
    """Smallest t > eps of o + t d hitting the sphere (|d| = 1), or inf."""
    oc = o - c
    b = np.dot(oc, d)                    # half of the usual 'b'
    disc = b * b - (np.dot(oc, oc) - r * r)
    if disc < 0:
        return np.inf
    s = np.sqrt(disc)
    for t in (-b - s, -b + s):           # near root first, then far root (ray starts inside)
        if t > 1e-6:
            return t
    return np.inf

def moller_trumbore(o, d, v0, v1, v2, eps=1e-9):
    """Ray vs many triangles. v0, v1, v2: (N, 3). Returns t, u, v (t = inf on miss)."""
    e1, e2 = v1 - v0, v2 - v0
    p = np.cross(d, e2)                  # P = D x E2
    det = np.sum(e1 * p, axis=1)
    ok = np.abs(det) > eps               # ray parallel to the triangle plane
    inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
    s = o - v0                           # T = O - V0
    u = np.sum(s * p, axis=1) * inv
    q = np.cross(s, e1)                  # Q = T x E1
    v = (q @ d) * inv
    t = np.sum(e2 * q, axis=1) * inv
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > eps)
    return np.where(hit, t, np.inf), u, v

if __name__ == "__main__":
    o, d = np.array([0.2, 0.3, -1.0]), np.array([0.0, 0.0, 1.0])
    v0 = np.array([[0, 0, 0], [0, 0, 2.0]]); v1 = np.array([[1, 0, 0], [1, 0, 2.0]]); v2 = np.array([[0, 1, 0], [0, 1, 2.0]])
    t, u, v = moller_trumbore(o, d, v0, v1, v2)
    print(t, u, v)                       # [1. 3.] [0.2 0.2] [0.3 0.3]
    print(ray_sphere(np.zeros(3), d, np.array([0, 0, 5.0]), 1.0))  # 4.0
    print(ray_sphere(np.zeros(3), d, np.zeros(3), 1.0))            # 1.0 (from inside)
```

## 3. 加速構造：BVH と SAH

すべてのレイをすべての三角形と判定すると、レイ 1 本あたり $O(N)$ のコストがかかります。映画の 1 フレームには数百万の三角形と数十億本のレイがあります。**バウンディングボリューム階層**（bounding volume hierarchy、BVH）は二分木で、各ノードはその下にあるすべてのプリミティブを囲む軸平行バウンディングボックス（axis-aligned bounding box、AABB）を保持します。ボックスに当たらないレイはその部分木全体をスキップできるので、よく構築された木ではトラバーサルはおおよそ $O(\log N)$ になります。

下の図は、後の SAH コードで 2 次元のおもちゃのシーンに構築した BVH と、それをたどる 1 本のレイです。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-bvh.svg" caption="上：24 個の箱に対する SAH BVH（葉サイズ 2、後のコードで構築）。輪郭は木の深さで色分けしており、濃い色（根）から薄い色（深い階層）へ変わります。下：同じ木。紫のレイを `traverse` と同じ手順でたどると、塗りつぶしたノードはレイが入った箱、白抜きのノードはスラブ判定で棄却された箱、薄いノードは一度も判定されなかった箱です。最も近い交点（オレンジの箱）が見つかるまでに訪れるのは 25 ノード中 5 つだけです。" %}

**レイとボックスの判定（スラブ法）。** AABB は 3 枚のスラブ $l_k \le x_k \le h_k$ の共通部分です。レイがスラブ $k$ の中にあるのは $t \in [\min(t_{0k}, t_{1k}), \max(t_{0k}, t_{1k})]$ の区間で、$t_{0k} = (l_k - o_k)/d_k$、$t_{1k} = (h_k - o_k)/d_k$ です。最大の進入時刻が最小の退出時刻以下であるとき、かつそのときに限り、レイはボックスに当たります。$1/d_k$ を前計算しておけば数回の積和で済み、軸に平行なレイは IEEE の無限大がうまく処理してくれます。

**どう分割するか：表面積ヒューリスティック（surface area heuristic、SAH）。** 凸体 $A$ の内部にある凸体 $B$ について、$A$ に当たる一様ランダムな直線が $B$ にも当たる確率は表面積の比 $SA(B)/SA(A)$ です（積分幾何学の古典的な結果）。Goldsmith と Salmon（1987）、MacDonald と Booth（1990）はこれを使って、ノード $P$ を子 $L$ と $R$ に分割したときの期待コストを見積もりました。

$$
C(L, R) = C_{\text{trav}} + \frac{SA(L)}{SA(P)}\,N_L\,C_{\text{isect}} + \frac{SA(R)}{SA(P)}\,N_R\,C_{\text{isect}},
$$

これを、$P$ を葉のまま残すコスト $N_P\,C_{\text{isect}}$ と比較します。ビルダーは各軸に沿ってプリミティブの重心をソートし、前方・後方の累積バウンディングボックスですべての分割位置を走査して、最良の分割で再帰します。実用的なビルダーはソートの代わりに重心を 16〜32 個のビン（bin）に振り分け、並列に（あるいは線形 BVH で GPU 上に）構築し、SIMD ユニットに合わせてより幅の広い木（子が 4〜8 個）を使います。ハードウェアレイトレーシング（次回）は、固定機能回路による BVH トラバーサルです。

上のおもちゃのシーンの根ノードでは、スイープの結果は次のようになります。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-sah-cost.svg" caption="24 個の箱を重心で $x$（上）と $y$（下）に沿って並べたときの、すべての分割候補の SAH コスト $C(L,R)$（$C_{\text{trav}}=C_{\text{isect}}=1$）。端に近い分割はほとんどの要素を片側に置くので、葉のコスト（破線、24）に近くなります。構築器は全体の最小値（オレンジの星：$y$ に沿って 11 個と 13 個に分ける分割、コスト約 10.4）を選びます。" %}

```python
import numpy as np

def sah_split(lo, hi, cent, c_trav=1.0, c_isect=1.0):
    """Best SAH split of the primitives with bounds lo/hi (N,3) and centroids cent (N,3).
    Sweeps all N-1 split positions along each axis. Returns (cost, axis, order, k):
    the left child holds order[:k]."""
    n = len(cent)
    def area(l, h):
        e = np.maximum(h - l, 0)
        return 2 * (e[..., 0] * e[..., 1] + e[..., 1] * e[..., 2] + e[..., 2] * e[..., 0])
    parent = area(lo.min(0), hi.max(0))
    best = (c_isect * n, None, None, None)          # cost of making a leaf
    for axis in range(3):
        order = np.argsort(cent[:, axis])
        l, h = lo[order], hi[order]
        # prefix bounds (left side) and suffix bounds (right side)
        a_left = area(np.minimum.accumulate(l), np.maximum.accumulate(h))[:-1]
        a_right = area(np.minimum.accumulate(l[::-1])[::-1], np.maximum.accumulate(h[::-1])[::-1])[1:]
        k = np.arange(1, n)
        cost = c_trav + c_isect * (a_left * k + a_right * (n - k)) / parent
        i = np.argmin(cost)
        if cost[i] < best[0]:
            best = (cost[i], axis, order, i + 1)
    return best

def build(lo, hi, idx, leaf_size=2):
    """Recursive SAH BVH. Node = dict with box and either children or primitive ids."""
    node = {"lo": lo[idx].min(0), "hi": hi[idx].max(0)}
    if len(idx) <= leaf_size:
        node["prims"] = idx; return node
    cost, axis, order, k = sah_split(lo[idx], hi[idx], 0.5 * (lo[idx] + hi[idx]))
    if axis is None:                                 # leaf is cheaper than any split
        node["prims"] = idx; return node
    node["kids"] = (build(lo, hi, idx[order[:k]], leaf_size), build(lo, hi, idx[order[k:]], leaf_size))
    return node

def hit_box(o, inv_d, lo, hi, t_max):
    """Slab test: does the ray enter [lo, hi] before t_max?"""
    t0, t1 = (lo - o) * inv_d, (hi - o) * inv_d
    t_near = np.max(np.minimum(t0, t1)); t_far = np.min(np.maximum(t0, t1))
    return t_near <= t_far and t_far > 0 and t_near < t_max

def traverse(node, o, d, isect):
    """Closest hit. isect(prims, o, d) -> array of t. Uses a stack, nearest-so-far culling."""
    inv_d = 1.0 / np.where(d == 0, 1e-12, d)
    best_t, best_i, stack = np.inf, -1, [node]
    while stack:
        nd = stack.pop()
        if not hit_box(o, inv_d, nd["lo"], nd["hi"], best_t):
            continue
        if "prims" in nd:
            t = isect(nd["prims"], o, d)
            j = np.argmin(t)
            if t[j] < best_t:
                best_t, best_i = t[j], nd["prims"][j]
        else:
            stack.extend(nd["kids"])
    return best_t, best_i

if __name__ == "__main__":
    from mt import moller_trumbore
    rng = np.random.default_rng(1)
    n = 2000                                        # random small triangles in a cube
    v0 = rng.uniform(-1, 1, (n, 3)); v1 = v0 + rng.normal(0, 0.05, (n, 3)); v2 = v0 + rng.normal(0, 0.05, (n, 3))
    lo = np.minimum(np.minimum(v0, v1), v2); hi = np.maximum(np.maximum(v0, v1), v2)
    root = build(lo, hi, np.arange(n))
    isect = lambda p, o, d: moller_trumbore(o, d, v0[p], v1[p], v2[p])[0]
    for _ in range(200):
        o = rng.uniform(-2, 2, 3); d = rng.normal(size=3); d /= np.linalg.norm(d)
        t_bvh, i_bvh = traverse(root, o, d, isect)
        t_all = isect(np.arange(n), o, d)
        assert np.isclose(t_bvh, t_all.min()) or (np.isinf(t_bvh) and np.isinf(t_all.min()))
    print("BVH matches brute force")
```

`mt.py` と同じディレクトリで実行してください。テストでは 200 本のランダムなレイについて、BVH の結果を総当たりと比較します。

## 4. 解くべき積分

第 4 回のレンダリング方程式を思い出しましょう。

$$
L_o(\mathbf{x}, \omega_o) = L_e(\mathbf{x}, \omega_o) + \int_{\Omega} f_r(\mathbf{x}, \omega_i, \omega_o)\, L_i(\mathbf{x}, \omega_i)\, \cos\theta_i\, d\omega_i ,
$$

ここで $L_i(\mathbf{x}, \omega_i) = L_o(\mathbf{x}', -\omega_i)$ であり、$\mathbf{x}'$ は $\mathbf{x}$ から方向 $\omega_i$ に飛ばしたレイが最初に当たる表面です。再帰を展開すると、放射輝度はあらゆる長さのパスにわたる和になります。放出された光、1 回反射した光、2 回反射した光、という具合です。Kajiya（1986）はこの方程式を、その最初の汎用モンテカルロソルバーであるパストレーシングとともに導入しました。被積分関数は不連続（可視性）で高次元（バウンスごとに 2 次元）、しかも閉じた形の解がないため、モンテカルロ法が自然な道具になります。

## 5. モンテカルロ積分

$I = \int f(x)\,dx$ を推定するには、$f \ne 0$ のところで正となる pdf $p$ から $X_1, \dots, X_N$ を抽出し、平均をとります。

$$
\hat{I}_N = \frac{1}{N}\sum_{k=1}^{N} \frac{f(X_k)}{p(X_k)},\qquad
\mathbb{E}[\hat{I}_N] = I,\qquad
\operatorname{Var}[\hat{I}_N] = \frac{1}{N}\left(\int \frac{f(x)^2}{p(x)}\,dx - I^2\right).
$$

この推定量は有効な任意の $p$ について**不偏**（unbiased）であり、標準偏差は次元によらず $1/\sqrt{N}$ で減少します。これがパス空間で数値求積法に勝る理由です。問題は定数で、ノイズを半分にするにはサンプルが $4\times$ 必要です。したがって勝負どころは**一定のサンプル数で分散を下げること**であり、その最大の手段が $p$ の選び方です。$p \propto f$ なら分散はゼロになります。$f$ を正確に知ることはできません（未知の $L_i$ を含むため）が、既知の部分、つまりコサイン項、BRDF、光源に比例するように $p$ を作ることはできます。

次の図は、後のコード片で使う放射照度の積分で $1/\sqrt{N}$ の法則を目に見える形にしたものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-mc-convergence.svg" caption="サンプル数を増やしたときの、$E=\int L\cos\theta\,d\omega=\pi/2$（後のコード片）の累積推定値 $\hat I_N$ の誤差。細い線は 8 回の個別の実行、太い線は 400 回の実行の RMSE です。両対数グラフではどちらの手法も $1/\sqrt{N}$ の傾き（破線）に沿って下がります。重点的サンプリングは傾きを変えず、線全体を下に平行移動させるだけです。$N=64$（点線）での RMSE は一様サンプリングで 0.23、コサインサンプリングで 0.12 です。" %}

**コサイン重み付き半球サンプリング。** ランバート（Lambertian）面では $f_r = \rho/\pi$ で、被積分関数は $\cos\theta$ を含みます。$p(\omega) = \cos\theta/\pi$ でサンプリングすると両方が打ち消されます。

$$
\frac{f_r\,L_i\cos\theta}{p} = \frac{(\rho/\pi)\,L_i\cos\theta}{\cos\theta/\pi} = \rho\,L_i .
$$

サンプリングには CDF の逆関数を使います。一様乱数 $u_1, u_2$ に対して $\cos\theta = \sqrt{1-u_1}$、$\phi = 2\pi u_2$ とします。同値な方法として、単位円板上の一様な点（$r = \sqrt{u_1}$）を取り、それを半球に持ち上げても構いません（Malley の方法）。次のコードは、同じサンプル数で一様サンプリングとコサイン重み付きサンプリングを使い、放射照度の積分を推定します。

```python
import numpy as np
rng = np.random.default_rng(0)

# Irradiance E = int_H L(w) cos(theta) dw with a "sky" that is brighter near the zenith:
# L(w) = cos(theta)^2 (exact answer: 2*pi/4 = pi/2)
L = lambda cos_t: cos_t ** 2
exact, N, trials = np.pi / 2, 64, 2000

# (a) uniform hemisphere sampling: cos(theta) = u, pdf = 1 / (2 pi)
u = rng.random((trials, N))
est_uniform = np.mean(L(u) * u / (1 / (2 * np.pi)), axis=1)

# (b) cosine-weighted sampling: cos(theta) = sqrt(u), pdf = cos(theta) / pi
c = np.sqrt(rng.random((trials, N)))
est_cosine = np.mean(L(c) * c / (c / np.pi), axis=1)

for name, e in [("uniform", est_uniform), ("cosine", est_cosine)]:
    print(f"{name:8s} mean {e.mean():.4f} (exact {exact:.4f})  std {e.std():.4f}")
```

出力（64 サンプル、2000 試行）：どちらの平均も $\pi/2 \approx 1.5708$ に一致しますが、標準偏差は約 $0.22$ から $0.11$ に下がります。ノイズをタダで半分にできることは、サンプルを $4\times$ に増やすことと同じ価値があります。

下の図は、2 つのサンプラーがどこに方向を置くかと、その結果としての推定値のばらつきを示します。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-hemisphere-sampling.svg" caption="上：法線 $\mathbf{n}$ を上にした局所座標系での、一様な半球サンプリング（オレンジ）とコサイン重み付きサンプリング（青）の各 350 方向。コサインサンプリングは $\cos\theta$ もこの空も大きい法線付近に方向を集め、地平線付近にはほとんど無駄にしません。下：コード片の 2000 個の推定値（$N=64$）のヒストグラム。どちらも $\pi/2$ を中心とし（不偏）、コサインの方は幅が半分です（標準偏差 0.11 対 0.22）。" %}

### 可視法線による GGX の重点的サンプリング

光沢のある表面では BRDF のローブが被積分関数を支配します。GGX の法線分布 $D(\mathbf{m})$ から直接サンプリングすると、視点から背を向けたマイクロファセットにサンプルを無駄遣いしてしまいます。Heitz（2018）は、**可視法線分布**（distribution of visible normals、VNDF）

$$
D_{\omega_o}(\mathbf{m}) = \frac{G_1(\omega_o)\,\max(0, \omega_o\cdot\mathbf{m})\,D(\mathbf{m})}{\cos\theta_o},
$$

を厳密かつ安価にサンプリングする方法を示しました。その根拠は、GGX が引き伸ばされた楕円体の法線分布であるという事実です。視線方向を、楕円体が半球になる配置へと引き伸ばし、その投影面積（見えない側の半分が押しつぶされた円板）をサンプリングし、元に戻します。サンプリングした $\mathbf{m}$ について $\omega_o$ を反射すると $\omega_i$ が得られ、反射のヤコビアン $1/(4\,\omega_o\cdot\mathbf{m})$ から立体角に関する pdf が得られます。

$$
p(\omega_i) = \frac{D_{\omega_o}(\mathbf{m})}{4\,(\omega_o\cdot\mathbf{m})} = \frac{G_1(\omega_o)\,D(\mathbf{m})}{4\cos\theta_o}.
$$

Cook-Torrance BRDF $f_r = F\,D\,G_2 / (4\cos\theta_o\cos\theta_i)$ に対しては、サンプルの重みが単純に $f_r\cos\theta_i / p = F\,G_2/G_1$ となり、これは $F$ に近く、グレージング角でも発散しません。次のコードで、サンプラーを解析的な pdf と照合します。

```python
import numpy as np

def sample_ggx_vndf(ve, ax, ay, u1, u2):
    """Heitz 2018: sample a microfacet normal from the GGX distribution of visible
    normals. ve: unit view direction in the local frame (z = macro normal)."""
    vh = np.array([ax * ve[0], ay * ve[1], ve[2]]); vh /= np.linalg.norm(vh)  # stretch
    lensq = vh[0] ** 2 + vh[1] ** 2
    t1 = np.array([-vh[1], vh[0], 0.0]) / np.sqrt(lensq) if lensq > 0 else np.array([1.0, 0, 0])
    t2 = np.cross(vh, t1)
    r, phi = np.sqrt(u1), 2 * np.pi * u2                       # uniform point on a disk
    p1, p2 = r * np.cos(phi), r * np.sin(phi)
    s = 0.5 * (1 + vh[2])
    p2 = (1 - s) * np.sqrt(1 - p1 * p1) + s * p2               # squash to the visible part
    nh = p1 * t1 + p2 * t2 + np.sqrt(max(0.0, 1 - p1 * p1 - p2 * p2)) * vh
    ne = np.array([ax * nh[0], ay * nh[1], max(0.0, nh[2])])   # unstretch
    return ne / np.linalg.norm(ne)

def ggx_D(m_z, a):
    return a * a / (np.pi * (m_z ** 2 * (a * a - 1) + 1) ** 2)

def smith_G1(v_z, a):
    tan2 = (1 - v_z ** 2) / v_z ** 2
    return 2 / (1 + np.sqrt(1 + a * a * tan2))

def pdf_reflect(v, l, a):
    """Solid-angle pdf of l = reflect(-v, m) with m ~ D_v:  G1(v) D(m) / (4 v_z)."""
    m = (v + l) / np.linalg.norm(v + l, axis=-1, keepdims=True)
    return smith_G1(v[2], a) * ggx_D(m[..., 2], a) / (4 * v[2])

if __name__ == "__main__":
    rng = np.random.default_rng(0)
    a, v = 0.3, np.array([np.sin(1.0), 0.0, np.cos(1.0)])     # view 57 degrees off the normal
    n = 100_000
    m = np.array([sample_ggx_vndf(v, a, a, rng.random(), rng.random()) for _ in range(n)])
    l = 2 * (m @ v)[:, None] * m - v                           # mirror v about m
    # P(l_z > 0.8) from the sampler vs. integrating the analytic pdf with uniform directions
    p_sampled = np.mean(l[:, 2] > 0.8)
    u = rng.normal(size=(n, 3)); u /= np.linalg.norm(u, axis=1, keepdims=True); u[:, 2] = np.abs(u[:, 2])
    p_analytic = np.mean((u[:, 2] > 0.8) * pdf_reflect(v, u, a)) * 2 * np.pi
    print(f"P(l_z > 0.8): sampled {p_sampled:.4f}, analytic {p_analytic:.4f}")
```

どちらの確率もおよそ $0.211$ になります。

下の図はこの実行のサンプルを描いたもので、その後のウィジェットでは 3 つのサンプラーを自分で比べられます。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-ggx-vndf.svg" caption="左：視線方向 $\omega_o$ が法線から 57° のときに `sample_ggx_vndf`（$\alpha=0.3$）が生成した 250 個のマイクロファセット法線 $\mathbf{m}$（シアン）と、反射後の方向 $\omega_i$（オレンジ）。後者は反対側の鏡面方向のまわりにローブを作ります。右：20,000 個のサンプル方向の $\cos\theta_i$ の分布は、方位角で積分した解析的な pdf $G_1 D/(4\cos\theta_o)$ と一致します。反射方向の約 9% は地平線より下になり、捨てられます（重み 0）。" %}

{% include widget.liquid name="graphics-hemisphere-mc" height="420" caption="インタラクティブ：サンプリング手法と被積分関数を選びます。各点は 1 つのサンプル方向で、色は真の値に対する重み $f/p$ の大きさです（青：小、オレンジ：大）。一様サンプリングとコサインサンプリングはなめらかな空には向いていますが、細い GGX ローブでは失敗します。GGX VNDF サンプリングはその逆です。棒グラフは現在の N での 3 手法の相対 RMSE です。半球をドラッグすると回転できます。" %}

## 6. パストレーシング

各バウンスで 1 サンプルのモンテカルロ推定を適用すると、1 ピクセルに対するパストレーシングの推定量が得られます。スループット（throughput）$\boldsymbol{\beta} = 1$ のカメラレイから始めて、

1. 交点 $\mathbf{x}$ を求め、$\boldsymbol{\beta}\, L_e$ を加算します。
2. $\omega_i \sim p$ をサンプリングし、$\boldsymbol{\beta} \mathrel{\leftarrow} \boldsymbol{\beta}\, f_r \cos\theta_i / p(\omega_i)$ と更新します。
3. $\mathbf{x}$ から方向 $\omega_i$ へ続けます。

各ピクセルでこのようなパスを多数平均します。次の 3 つの技法が、この素朴な版を実用的なレンダラーに変えます。

### ロシアンルーレット

固定の深さでパスを打ち切るとバイアス（エネルギーの損失）が生じます。代わりに**ロシアンルーレット**（Russian roulette）を使い、数回のバウンスの後は確率 $q$ で続行して $q$ で割ります。

$$
\hat{L}' = \begin{cases} \hat{L}/q & \text{with probability } q \\ 0 & \text{otherwise}\end{cases}
\qquad\Rightarrow\qquad \mathbb{E}[\hat{L}'] = \hat{L}.
$$

これは不偏ですが分散を増やすので、$q$ はそのパスがまだどれだけ寄与しうるかを反映させるべきです。よく使われるのは $q = \operatorname{clamp}(\max_c \beta_c, 0.05, 0.95)$ です。暗いパスは早く終わり、明るいパスは生き残ります。

下の図は、厳密な値がわかっているおもちゃのパスでこれを確かめたものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-russian-roulette.svg" caption="ホワイトファーネス（white furnace）のおもちゃモデル：各バウンスのアルベドは $a=0.73$ で、毎回 1 単位の光を加えるので、パスの値は $\sum_k a^k = 1/(1-a)\approx 3.704$ です。左：固定の最大深さでパスを打ち切ると $a^D/(1-a)$ だけ低く偏ります。本文のコードと同じく 3 回目のバウンスから $q=\operatorname{clamp}(\beta,0.05,0.95)$ を使うロシアンルーレットは正しい平均を与えます（200,000 本のパスで 3.697）。右：ルーレットのパスが生き残るバウンス数。ほとんどは 3 回目で止まり、10 回以上続くものもわずかにあります。" %}

### 次イベント推定

BSDF サンプリングだけでは、パスはたまたま発光体に当たったときにしか光を集められません。光源が小さいとそれはまれで、画像はファイアフライ（fireflies）だらけになり、点光源ではまったく起こりません。**次イベント推定**（next-event estimation、NEE）は、各バウンスで光源上の点 $\mathbf{y}$ を直接サンプリングし、シャドウレイを追跡します。光源の面積 $A$ 上の積分として書くと、直接照明は

$$
L_{\text{dir}}(\mathbf{x}, \omega_o) = \int_A f_r(\mathbf{x}, \omega_i, \omega_o)\,L_e(\mathbf{y}, -\omega_i)\,V(\mathbf{x}, \mathbf{y})\,\frac{\cos\theta_x\cos\theta_y}{\lVert \mathbf{x}-\mathbf{y} \rVert^2}\,dA_y ,
$$

ここで $V$ は 2 値の可視性、$\theta_y$ は光源側の角度です。面積上の一様サンプリング $p_A = 1/A$ では、推定量は $f_r L_e V \cos\theta_x\cos\theta_y\,A / \lVert \mathbf{x}-\mathbf{y}\rVert^2$ です。これを BSDF サンプリングと比較するには、2 つの pdf を同じ測度で表す必要があります。面積から立体角への変数変換は $d\omega = \cos\theta_y\,dA/\lVert \mathbf{x}-\mathbf{y}\rVert^2$ なので、

$$
p_\omega(\omega_i) = p_A\,\frac{\lVert \mathbf{x}-\mathbf{y}\rVert^2}{\cos\theta_y}.
$$

NEE を加えた場合、BSDF でサンプリングしたレイが後で光源に当たったときにその発光を再び数えてはいけません。さもないと直接光が二重に数えられます。最も簡単な対処は、BSDF レイが当たった発光を無視することです（カメラから直接見えるものと、完全鏡面のバウンスの後は除きます。NEE はそれらを扱えないからです）。より良い対処が MIS です。

下の図は、シーンの 2 次元断面で 1 本のパスを追い、NEE が各頂点で加えるシャドウレイを示します。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-path-nee.svg" caption="第 7 節の Cornell box の平面 $x=0$ 内のカメラパス（カメラは右の $z=3.9$、光源は天井、2 つの球は断面の輪郭）。各頂点 $\mathbf{x}_k$ で NEE は光源上の点をランダムに選び（オレンジの点）、シャドウレイを飛ばします。黄色のレイは光源に届き、$f_r L_e V\cos\theta_x\cos\theta_y A/\lVert\mathbf{x}-\mathbf{y}\rVert^2$ を加えます。$\mathbf{x}_3$ からの破線は球に遮られます（$V=0$）。紫の線分は BSDF サンプリングによるパスの続きです。方向は見やすさのために手で選びましたが、交点と可視性は計算した値です。" %}

### 多重重点的サンプリング

光源サンプリングは小さな光源と粗い表面に強く、BSDF サンプリングは大きな光源と光沢面に強い手法です。後者の場合、光源上のランダムな点が狭いローブの中に入ることはほとんどないからです。どちらも常に勝つわけではありません。Veach と Guibas（1995）は、複数の手法を 1 つの不偏推定量にまとめる方法、**多重重点的サンプリング**（multiple importance sampling、MIS）を示しました。手法 $i$ から $n_i$ 個のサンプル $X_{i,j}$ を取り、$f \ne 0$ のところで総和が 1 になる重み $w_i$ を使うと、

$$
\hat{I} = \sum_{i}\frac{1}{n_i}\sum_{j=1}^{n_i} w_i(X_{i,j})\,\frac{f(X_{i,j})}{p_i(X_{i,j})},\qquad
w_i^{\text{balance}}(x) = \frac{n_i\,p_i(x)}{\sum_k n_k\,p_k(x)},\qquad
w_i^{\text{power}}(x) = \frac{\left(n_i\,p_i(x)\right)^2}{\sum_k \left(n_k\,p_k(x)\right)^2}.
$$

直観的には、各サンプルは*その点で*自分の手法がどれだけ優れているかに応じて重み付けされます。光源サンプリングの pdf が高いところではそのサンプルが支配し、BSDF の pdf が高いところでは BSDF のサンプルが支配します。Veach はバランスヒューリスティック（balance heuristic）があらゆる重み付けの中でほぼ最適であることを証明しました。パワーヒューリスティック（power heuristic、$\beta = 2$）は実践では通常わずかに優れています。各バウンスで光源サンプル 1 つと BSDF サンプル 1 つ（$n_i = 1$）を使うパストレーサーでは、

- NEE サンプル：重み $w_l = p_l^2/(p_l^2 + p_b^2)$。ここで $p_b$ はその光源方向に対する BSDF の pdf です。
- 光源に当たった BSDF サンプル：重み $w_b = p_b^2/(p_b^2 + p_l^2)$。ここで $p_l$ はその方向に対する光源の pdf（立体角測度）です。


下の図は、これらの重みと、それが 1 次元のおもちゃの問題で何をもたらすかを示します。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-mis.svg" caption="上：光源サンプル 1 つ（$w_l$、実線）と BSDF サンプル 1 つ（$w_b$、破線）に対するバランスヒューリスティックとパワーヒューリスティックの重みを $p_l/p_b$ の関数として描いたもの。パワーヒューリスティックの方が、よい手法へ鋭く切り替わります。下：幅 $s$ のガウス型 BSDF ローブと光源の窓の積という 1 次元のおもちゃの積分を 2 サンプルで推定した結果。細いローブ（光沢）では BSDF サンプリング、広いローブ（粗い面）では光源サンプリングが有利で、MIS はどちらがよいかを事前に知らなくても、常によい方に近い性能を保ちます。" %}

### プログレッシブな蓄積

パストレーサーは本質的に**プログレッシブ**（progressive）です。1 フレームごとにピクセルあたり 1 サンプルをレンダリングし、移動平均 $\bar{I}_s = \bar{I}_{s-1} + (I_s - \bar{I}_{s-1})/s$ を保持します。画像は最初はノイズだらけで、$1/\sqrt{s}$ で収束します。カメラやシーンが変わると蓄積はやり直しになります（リアルタイムでは再投影してブレンドします。次回を参照）。

下の図は、次の節の NumPy レンダラーでこの収束を示したものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-spp.svg" caption="第 7 節のパストレーサーによるプログレッシブな蓄積（100 x 100 ピクセル、MIS、最大 6 バウンス）：ピクセルあたり 1、4、16、256 サンプル後の累積平均。サンプル数を 4 倍にするごとにノイズは半分になります。ノイズが消えるにつれて、ソフトシャドウ、赤と緑のカラーブリーディング、間接光だけで照らされた天井が現れてきます。" %}

## 7. コンパクトな NumPy パストレーサー

以下のレンダラーは、2 つの拡散反射球と長方形の面光源を持つコーネルボックスに対して、ここまでの内容をすべて組み合わせたものです。*パスについて*ベクトル化されており、各バウンスで生存しているすべてのレイをすべての物体と一度に交差判定します。外れたパス、光源に当たったパス、ロシアンルーレットで打ち切られたパスはブールマスクで取り除きます（`pix` は生き残った各パスが属するピクセルを覚えています）。表面はランバート面でコサイン重み付きサンプリングを使い、各バウンスでパワーヒューリスティックの MIS 重みを付けた NEE を行い、BSDF サンプリングで光源に当たった場合には相補的な重みを与えます。

```python
import numpy as np

W, H, SPP, MAX_DEPTH = 160, 160, 64, 6
rng = np.random.default_rng(0)

def normalize(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)

# Scene: quads (corner p, edges u, v) and spheres (center, radius).
# Each object has an albedo and an emission. The box spans [-1, 1]^3.
quads, spheres = [], []
def quad(p, u, v, albedo, emit=(0, 0, 0)):
    quads.append((np.array(p, float), np.array(u, float), np.array(v, float),
                  np.array(albedo, float), np.array(emit, float)))
white, red, green = (0.73, 0.73, 0.73), (0.65, 0.05, 0.05), (0.12, 0.45, 0.15)
quad((-1, -1, -1), (2, 0, 0), (0, 0, 2), white)          # floor
quad((-1, 1, -1), (0, 0, 2), (2, 0, 0), white)           # ceiling
quad((-1, -1, -1), (0, 2, 0), (2, 0, 0), white)          # back wall
quad((-1, -1, -1), (0, 0, 2), (0, 2, 0), red)            # left wall
quad((1, -1, -1), (0, 2, 0), (0, 0, 2), green)           # right wall
quad((-0.25, 0.999, -0.25), (0.5, 0, 0), (0, 0, 0.5), (0, 0, 0), (17, 12, 4))  # light (faces -y)
spheres.append((np.array([-0.45, -0.6, -0.3]), 0.4, np.array(white), np.zeros(3)))
spheres.append((np.array([0.45, -0.65, 0.3]), 0.35, np.array([0.8, 0.6, 0.2]), np.zeros(3)))
LIGHT = 5                                                # index of the light quad
lp, lu, lv = quads[LIGHT][:3]
l_n = normalize(np.cross(lu, lv)); l_area = np.linalg.norm(np.cross(lu, lv))
albedo = np.array([q[3] for q in quads] + [s[2] for s in spheres])
emission = np.array([q[4] for q in quads] + [s[3] for s in spheres])

def intersect(o, d):
    """Nearest hit for N rays: returns t (inf on miss), object id, geometric normal."""
    n = len(o)
    t_best = np.full(n, np.inf); obj = np.full(n, -1); nrm = np.zeros((n, 3))
    for i, (p, u, v, _, _) in enumerate(quads):
        qn = normalize(np.cross(u, v))
        denom = d @ qn
        with np.errstate(divide="ignore", invalid="ignore"):
            t = ((p - o) @ qn) / denom
        x = o + t[:, None] * d - p
        a, b = x @ u / (u @ u), x @ v / (v @ v)
        ok = (np.abs(denom) > 1e-9) & (t > 1e-4) & (t < t_best) & (a >= 0) & (a <= 1) & (b >= 0) & (b <= 1)
        t_best[ok], obj[ok], nrm[ok] = t[ok], i, qn
    for j, (c, r, _, _) in enumerate(spheres):
        oc = o - c
        b = np.sum(oc * d, axis=1); disc = b * b - (np.sum(oc * oc, axis=1) - r * r)
        s = np.sqrt(np.maximum(disc, 0))
        t = np.where(-b - s > 1e-4, -b - s, -b + s)
        ok = (disc > 0) & (t > 1e-4) & (t < t_best)
        t_best[ok], obj[ok] = t[ok], len(quads) + j
        nrm[ok] = (o[ok] + t[ok, None] * d[ok] - c) / r
    return t_best, obj, nrm

def onb(n):
    """Orthonormal basis (t, b) around unit normals n (Duff et al. 2017)."""
    s = np.where(n[:, 2] >= 0, 1.0, -1.0)
    a = -1.0 / (s + n[:, 2]); b = n[:, 0] * n[:, 1] * a
    t = np.stack([1 + s * n[:, 0] ** 2 * a, s * b, -s * n[:, 0]], 1)
    bb = np.stack([b, s + n[:, 1] ** 2 * a, -n[:, 1]], 1)
    return t, bb

def cosine_sample(n):
    u1, u2 = rng.random(len(n)), rng.random(len(n))
    r, phi = np.sqrt(u1), 2 * np.pi * u2
    t, b = onb(n)
    return (r * np.cos(phi))[:, None] * t + (r * np.sin(phi))[:, None] * b + np.sqrt(1 - u1)[:, None] * n

def render_sample():
    # pinhole camera at z = 3.9 looking down -z, 40 degree vertical field of view
    jx, jy = rng.random((H, W)), rng.random((H, W))
    px = (np.arange(W)[None, :] + jx) / W * 2 - 1
    py = 1 - (np.arange(H)[:, None] + jy) / H * 2
    th = np.tan(np.radians(20))
    d = normalize(np.stack([px * th, py * th, -np.ones_like(px)], -1).reshape(-1, 3))
    o = np.tile([0.0, 0.0, 3.9], (len(d), 1))
    L, beta = np.zeros_like(d), np.ones_like(d)
    pix = np.arange(len(d))                  # which pixel each live path belongs to
    prev_pdf = np.zeros(len(d))              # solid-angle pdf of the last BSDF sample
    for depth in range(MAX_DEPTH):
        t, obj, n = intersect(o, d)
        alive = obj >= 0
        o, d, t, obj, n, beta, pix, prev_pdf = (a[alive] for a in (o, d, t, obj, n, beta, pix, prev_pdf))
        if len(o) == 0:
            break
        x = o + t[:, None] * d
        # 1) emission found by BSDF sampling, MIS-weighted against light sampling
        hit_l = (obj == LIGHT) & (d @ l_n < 0)
        if depth == 0:
            w = np.ones(hit_l.sum())
        else:
            cos_l = -(d[hit_l] @ l_n)
            pl = t[hit_l] ** 2 / (cos_l * l_area)
            w = prev_pdf[hit_l] ** 2 / (prev_pdf[hit_l] ** 2 + pl ** 2)   # power heuristic
        np.add.at(L, pix[hit_l], beta[hit_l] * emission[obj[hit_l]] * w[:, None])
        keep = obj != LIGHT                  # paths stop at the light
        x, d, obj, n, beta, pix = x[keep], d[keep], obj[keep], n[keep], beta[keep], pix[keep]
        n = np.where((np.sum(n * d, 1) < 0)[:, None], n, -n)   # face the incoming ray
        a = albedo[obj]
        # 2) next-event estimation: one point on the area light, shadow ray
        y = lp + rng.random((len(x), 1)) * lu + rng.random((len(x), 1)) * lv
        to_l = y - x; dist2 = np.sum(to_l ** 2, 1); dist = np.sqrt(dist2); wi = to_l / dist[:, None]
        cos_s, cos_l = np.sum(n * wi, 1), -(wi @ l_n)
        ok = (cos_s > 0) & (cos_l > 0)
        ts, _, _ = intersect(x[ok] + 1e-4 * n[ok], wi[ok])
        vis = np.zeros(len(x), bool); vis[ok] = ts >= dist[ok] - 1e-3
        pl = dist2 / np.maximum(cos_l, 1e-8) / l_area         # light pdf in solid angle
        pb = np.maximum(cos_s, 0) / np.pi                     # BSDF (cosine) pdf
        wl = pl ** 2 / (pl ** 2 + pb ** 2)
        contrib = beta * (a / np.pi) * emission[LIGHT] * (np.maximum(cos_s, 0) * wl / pl)[:, None]
        np.add.at(L, pix[vis], contrib[vis])
        # 3) continue the path by cosine-weighted BSDF sampling: f*cos/pdf = albedo
        d = cosine_sample(n); o = x + 1e-4 * n
        prev_pdf = np.sum(n * d, 1) / np.pi
        beta = beta * a
        # 4) Russian roulette after a few bounces (unbiased: divide by survival prob.)
        if depth >= 2:
            q = np.clip(beta.max(1), 0.05, 0.95)
            survive = rng.random(len(q)) < q
            beta[survive] /= q[survive, None]
            o, d, beta, pix, prev_pdf = o[survive], d[survive], beta[survive], pix[survive], prev_pdf[survive]
    return L.reshape(H, W, 3)

if __name__ == "__main__":
    accum = np.zeros((H, W, 3))
    for s in range(1, SPP + 1):              # progressive accumulation: running mean
        accum += (render_sample() - accum) / s
    img = np.clip(accum, 0, 1) ** (1 / 2.2)
    with open("cornell.ppm", "wb") as f:
        f.write(f"P6 {W} {H} 255\n".encode())
        f.write((img * 255 + 0.5).astype(np.uint8).tobytes())
    print("mean radiance", accum.mean(axis=(0, 1)))
```

160 x 160 ピクセル、ピクセルあたり 64 サンプル、最大 6 バウンスの設定で、CPU 1 コアで約 9 秒かかり、`cornell.ppm` を出力します（どの画像ビューアでも開けますし、`python -c "from PIL import Image; Image.open('cornell.ppm').save('cornell.png')"` で変換もできます）。球の下のソフトシャドウ、床と球に映る赤と緑のカラーブリーディング、そして間接光だけで照らされたやや暗い天井が見えるはずです。MIS の実装を確かめる良い方法があります。重みを「BSDF のみ」（$w_b = 1$、$w_l = 0$）と「NEE のみ」（$w_b = 0$、$w_l = 1$）に置き換えてみてください。3 つの版はすべて同じ平均画像に収束しなければならず、違うのはノイズだけです。このシーンでは 3 つの版の平均がモンテカルロのノイズの範囲内で一致し、BSDF のみの画像は目に見えてノイズが多くなります。

下の図は、まさにこの健全性チェックを実行したものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/05-estimators.svg" caption="上のレンダラーでピクセルあたり 16 サンプルとした、第 6 節の 3 つの推定量：BSDF サンプリングのみ、NEE のみ、パワーヒューリスティックによる MIS（右下：参照用の 256 spp の MIS）。光源が小さいので BSDF のみのサンプリングはほとんど役に立たず（多くのパスは光源に当たらない）、NEE と MIS はすでにきれいです。数字は 256 spp（48 x 48 ピクセル）での各推定量の平均放射輝度で、3 つともモンテカルロのノイズの範囲で同じ値に収束します。" %}

自然な拡張としては、第 5 節の VNDF サンプラーを使った GGX マテリアル、第 3 節の BVH を使った三角形メッシュ、被写界深度のための薄レンズカメラ（円板状の絞り上でレイの原点をサンプリングし、焦点面に向ける）があります。

## 試してみよう：ラボのパストレーサー

ホームページには同じアルゴリズムの GPU 版があります。[ラボを開いて]({{ '/' | relative_url }}#lab)パストレーサーのタブを選んでください。WebGL 2 のフラグメントシェーダーで 1 フレームにピクセルあたり 1 サンプルを計算し、プログレッシブに蓄積します。マテリアルは GGX BRDF と Heitz の可視法線サンプリングを使い、ガラスは厳密な誘電体のフレネル項を使います。**サンプリング**の切り替えは、第 6 節の 3 つの推定量をそのまま切り替えます。

- **BSDF**：光源サンプリングなし。BSDF でサンプリングしたレイがたまたま発光体に当たったときだけ光を集め、そのときの重みは 1 です。
- **NEE**：不透明な表面でのバウンスごとに、天井の光源上のランダムな点へシャドウレイを 1 本飛ばします。BSDF でサンプリングしたバウンスの後に発光体に当たった場合は、二重計上を避けるため重み 0 になります。カメラから直接見える光源やガラス越しに見える光源は、引き続き重み 1 で数えられます。デモは屈折を鏡面（デルタ）イベントとして扱い、NEE はそれを通過するパスをサンプリングできないからです。
- **MIS**：両方を使い、パワーヒューリスティックで組み合わせます。光源の pdf は $\lVert \mathbf{x}-\mathbf{y}\rVert^2/(\cos\theta_y A)$ で、まさに上の変換そのものです。

やってみる価値のある実験：

1. **光源サイズ**を最小までドラッグします。デモは光源の全パワーを一定に保つので、面積が小さくなると放射輝度が大きくなります。BSDF モードでは画像がファイアフライに溶けていきますが、NEE と MIS はきれいなままです。
2. 小さな鏡面球（GGX の粗さが非常に小さく、ローブが極めて狭い）を見ながら、光源を大きくします。今度は NEE が苦手な側になります。光源サンプルがローブに入ることはほとんどないので、NEE モードでは鏡に映る光源の像が暗くまだらになりますが、BSDF サンプリングは簡単にそれを見つけます。別の物体を選び、**粗さ**を変えながら**金属**プリセットも試してみてください。MIS はどこでもより良い手法に追従します。
3. **反射回数**を 1 にしてから増やしていきます。間接光（カラーブリーディング、照らされた天井）が現れる様子を見てください。デモは 3 回目のバウンスから、私たちのコードと同じく $q = \operatorname{clamp}(\max_c\beta_c, 0.05, 0.95)$ のロシアンルーレットを適用します。
4. **絞り**を大きくし、ダブルクリックでピントを合わせます。薄レンズカメラは積分の次元が 1 つ増えるだけなので、ほとんどコストをかけずに被写界深度が得られます。

デモには速度のために意図的に*バイアスのある*処理が 2 つあります。非常に明るい間接サンプルをクランプすること（ファイアフライクランプ）と、操作中は法線・深度・アルベドのバッファ（「アルベド」「法線」「深度」ビュー）に導かれたエッジ保存型 à-trous ウェーブレットデノイザーで画像をフィルタリングすることです。デノイズは次回扱います。

## 基本的なパストレーサーの先へ

光が狭い経路を通ってしかカメラに届かない場合、単方向パストレーシングは苦戦します。ガラス越しのコースティクス（caustics）や、ドアの隙間から照らされたシーンなどです。**双方向パストレーシング**（bidirectional path tracing、Lafortune と Willems 1993、Veach と Guibas 1994）はカメラと光源の両方からサブパスを追跡して接続し、すべての組み合わせを MIS で重み付けします。**メトロポリス光輸送**（Metropolis light transport、Veach と Guibas 1997）は寄与の大きいパスを変異させます。**パスガイディング**（path guiding、例えば Müller らの 2017 年の "Practical Path Guiding"）はレンダリング中に入射放射輝度の分布を学習してそこからサンプリングするもので、後で出会うニューラル手法の直接の祖先です。理論については、Veach の博士論文がいまでも最良の単一の参考文献です。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Whitted, "An Improved Illumination Model for Shaded Display" | Communications of the ACM | 1980 | [DOI](https://doi.org/10.1145/358876.358882) | 再帰的レイトレーシング：影、反射、屈折 |
| Cook, Porter, Carpenter, "Distributed Ray Tracing" | SIGGRAPH | 1984 | [DOI](https://doi.org/10.1145/800031.808590) | レンズ・時間・面積にレイを分布：ソフトシャドウ、被写界深度、モーションブラー |
| Kajiya, "The Rendering Equation" | SIGGRAPH | 1986 | [DOI](https://doi.org/10.1145/15922.15902) | レンダリング方程式と最初のパストレーサー |
| Goldsmith, Salmon, "Automatic Creation of Object Hierarchies for Ray Tracing" | IEEE CG&A | 1987 | [DOI](https://doi.org/10.1109/MCG.1987.276983) | 表面積に基づくコストモデルを持つバウンディングボリューム階層 |
| MacDonald, Booth, "Heuristics for Ray Tracing Using Space Subdivision" | The Visual Computer | 1990 | （リンクなし） | 表面積ヒューリスティックを定式化 |
| Veach, Guibas, "Optimally Combining Sampling Techniques for Monte Carlo Rendering" | SIGGRAPH | 1995 | [DOI](https://doi.org/10.1145/218380.218498) | 多重重点的サンプリング、バランス／パワーヒューリスティック |
| Möller, Trumbore, "Fast, Minimum Storage Ray-Triangle Intersection" | Journal of Graphics Tools | 1997 | [DOI](https://doi.org/10.1080/10867651.1997.10487468) | 標準的なレイと三角形の交差判定 |
| Veach, "Robust Monte Carlo Methods for Light Transport Simulation" | 博士論文、Stanford | 1997 | [プロジェクトページ](https://graphics.stanford.edu/papers/veach_thesis/) | パス空間による定式化、MIS、BDPT、MLT |
| Heitz, "Sampling the GGX Distribution of Visible Normals" | JCGT 7(4) | 2018 | [論文](https://jcgt.org/published/0007/04/01/) | 厳密で安価な GGX の VNDF サンプリング |

## 学習リソース

- **PBRT**：Pharr、Jakob、Humphreys『Physically Based Rendering: From Theory to Implementation』。[pbr-book.org](https://pbr-book.org/) で無料公開されています。形状、BVH、モンテカルロ、光輸送の章は、本記事の内容に対する決定版の参考文献です。
- **Ray Tracing in One Weekend** シリーズ（Peter Shirley ほか）、[raytracing.github.io](https://raytracing.github.io/) で無料：週末で C++ のレイトレーサーを作り、続編で BVH、テクスチャ、モンテカルロを加えます。
- **Scratchapixel**（[scratchapixel.com](https://www.scratchapixel.com/)）：レイと三角形の交差判定、加速構造、モンテカルロについての詳しいレッスン。
- **GAMES101**（Lingqi Yan、[講義ページ](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html)）：第 13〜16 回で Whitted レイトレーシング、BVH、放射測定、パストレーシングを課題付きで扱います。
- **Berkeley CS184**（[cs184.eecs.berkeley.edu](https://cs184.eecs.berkeley.edu/)）："PathTracer" プロジェクトで BVH、直接照明、グローバルイルミネーションを順を追って実装します。Stanford CS148 も入門レベルでレイトレーシングを扱います。
- **smallpt**（Kevin Beason、[kevinbeason.com/smallpt](https://www.kevinbeason.com/smallpt/)）：99 行の C++ で書かれたグローバルイルミネーションのパストレーサー。
- 『Real-Time Rendering』（Akenine-Möller ほか、第 4 版）のレイトレーシングの章は、次回への橋渡しになります。

## 演習

1. モンテカルロ推定量が不偏であることを証明し、分散の式を導いてください。次に、$p \propto \lvert f \rvert$ が分散を最小にすることを示してください。
2. $p(\theta, \phi) = \cos\theta\sin\theta/\pi$ の周辺 CDF と条件付き CDF を逆変換して、コサイン重み付きサンプリングの式 $\cos\theta = \sqrt{1-u_1}$、$\phi = 2\pi u_2$ を導いてください。
3. NumPy パストレーサーに GGX の金属球を追加し、BSDF サンプリングに `sample_ggx_vndf` を使い、両方の MIS 重みで対応する pdf を使ってください。BSDF のみ、NEE のみ、MIS の 3 つの画像が同じ平均に収束することを確認してください。
4. 三角形メッシュ（例えば OBJ ファイル）を読み込み、SAH BVH を構築し、レイ 1 本あたりのボックス判定と三角形判定の回数が三角形数とともにどう増えるかを測ってください。「中央値分割」のビルダーと比較してください。
5. ラボで、NEE 単独の方が BSDF 単独よりノイズが多くなる設定を見つけ、2 つの pdf を使って理由を説明してください。

**次回：**[リアルタイムレイトレーシング]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})。ハードウェアによる BVH トラバーサル、デノイズ（à-trous、SVGF）、ReSTIR、ニューラル放射キャッシュ、つまりピクセルあたり 1 サンプルでこの画像を毎秒 60 フレームで得る方法です。
