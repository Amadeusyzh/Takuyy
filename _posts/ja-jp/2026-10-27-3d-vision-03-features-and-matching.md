---
layout: post
title: "特徴とマッチング：コーナー、SIFT、RANSAC、学習型マッチャー"
date: 2026-10-27 11:03:00+0900
description: "2 枚の画像で同じ点を見つける方法：構造テンソルと Harris コーナー、スケール空間と SIFT、FAST/BRIEF/ORB、比率テスト、RANSAC とその後継（MSAC、LO-RANSAC、MAGSAC++）、SuperPoint、SuperGlue、LightGlue、LoFTR、RoMa、Lucas-Kanade と RAFT のオプティカルフロー、そしてマッチャーの評価法を、各ステップの NumPy コード付きで解説します。"
categories: 3d-vision
tags: [harris, sift, orb, feature-matching, ratio-test, ransac, superglue, lightglue, loftr, optical-flow]
series: 3d-vision
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 2 回]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})で、内部パラメータを信頼できるカメラが手に入りました。このシリーズでこの先扱う内容（第 4 回の相対姿勢と三角測量、第 5 回の Structure-from-Motion とバンドル調整、第 6 回の SLAM）は、すべて同じ種類の生データの上に成り立っています。それが**対応点**（correspondence）、つまり 2 枚の画像の中で同じ 3 次元点を写している画素のペアです。キャリブレーションでは、コーナー位置が既知の印刷ボードがありました。実際のシーンにはラベルがないので、異なる場所から、異なるスケールで、異なる照明のもとで撮られた画像の中から、コンピュータが自力で「同じ点」を見つけなければなりません。対応点がいくつ得られるか、どれだけ正確か、そのうちいくつが誤りかによって、再構成が成功するか、気づかないうちに失敗するかが決まります。

[ニューラルレンダリング第 1 回]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})では、このステップを 1 段落（「SIFT、比率テスト、RANSAC」）でまとめました。この記事ではその中身を開きます。真のホモグラフィ（homography）が既知の合成画像ペアを使い、各段階を NumPy でゼロから実装するので、すべての主張を数値で確かめられます。構造テンソルからコーナーを、スケール空間からブロブを求め、SIFT 記述子、バイナリ記述子、比率テスト付きの最近傍マッチング、RANSAC とその現代的な後継、2018 年以降にこのパイプラインの多くを置き換えた学習型マッチャー、そして最後に、動画の連続フレーム間のマッチングであるオプティカルフローを扱います。

これから組み立てるパイプラインは次のとおりです。

| 段階 | 答える問い | 古典的な答え | 学習による答え |
| --- | --- | --- | --- |
| 検出（detection） | どの画素なら別の画像で再び見つけられるか？ | Harris、Shi-Tomasi、DoG、FAST | SuperPoint、DISK、ALIKED |
| 記述（description） | 視点や照明の変化に耐える形で、キーポイントの近傍はどう見えるか？ | SIFT（浮動小数点 128 個）、ORB（256 ビット） | SuperPoint（浮動小数点 256 個）、学習型パッチ記述子 |
| マッチング（matching） | 画像 2 のどのキーポイントがこれに対応するか？ | 最近傍 + 比率テスト + 相互チェック | SuperGlue、LightGlue；検出器を使わない LoFTR、RoMa |
| 検証（verification） | どのマッチが 1 つの幾何モデルに合うか？ | RANSAC、MSAC、LO-RANSAC、MAGSAC++ | （今でも主に RANSAC） |

## 前提知識

- 画像勾配とガウス畳み込み（画像処理の入門講義程度、`scipy.ndimage`）。
- 2×2 対称行列の固有値、最小二乗法、SVD。
- [第 2 回]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})のホモグラフィと正規化 DLT、[第 1 回]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})の画素座標。
- RANSAC には基本的な確率（独立試行）、第 7 節には基本的な深層学習（CNN、アテンション）。

記法：画像は関数 $I(x, y)$ で、$x$ は右向き、$y$ は下向きとし、`img[y, x]` として $[0, 1]$ の値で格納します。$I_x = \partial I/\partial x$ と $I_y = \partial I/\partial y$ は偏微分、$\nabla I = (I_x, I_y)^\top$ は勾配です。$G_\sigma$ は標準偏差 $\sigma$ の 2 次元ガウス関数、$\ast$ は畳み込みを表します。

## 1. よい特徴とは

**局所特徴**（local feature）とは、点（多くの場合スケールと向きも伴う）と、その近傍を要約するベクトルである**記述子**（descriptor）の組です。特徴には次の性質が求められます。

- **再現性**（repeatable）：回転、スケール変化、ぼけ、ノイズ、照明変化があっても、検出器が両方の画像で同じ物理的な点に反応すること。
- **識別性**（distinctive）：その点の記述子が他のすべての点の記述子と異なり、最近傍探索で正しい相手が見つかること。
- **局所性**（local）：小さな近傍だけから計算され、ほかの場所の遮蔽や雑多な物の影響を受けないこと。
- **正確さ**（accurate）：サブピクセルで位置が決まること。三角測量の後には、1 画素の誤差がそのまま 3 次元の誤差になるからです。
- **効率**（efficient）：1 枚あたり数千個を、SLAM ではミリ秒単位で計算できること。

混同しやすい 2 つの言葉があります。検出器の出力が画像とともに変換されるとき（画像を 30° 回すとキーポイントも 30° 回り、検出スケールがズームに追従するとき）、その検出器は変換に対して**共変**（covariant）であるといいます。記述子の値が変わらないとき、それは**不変**（invariant）であるといいます。SIFT は共変な検出から不変な記述子を得ます。各キーポイントのスケールと向きを測り、その正規化された座標系でパッチを記述するのです。

どんな点ならこれらの要求を満たせるでしょうか。画像の小さな窓を 3 つ見てみましょう。**平坦**な領域では、窓をどの方向に動かしても何も変わりません。この点は再び見つけられません。**エッジ**上では、窓をエッジに沿って動かしても変化がありません。位置はエッジを横切る方向にしか決まりません（これが**開口問題**（aperture problem）で、第 8 節で再び登場します）。**コーナー**では、どの方向にずらしても中身が変わります。点は両方向に固定されます。次の節では、この観察を式にします。

### 1.1 答えが分かっているテスト画像ペア

各ステップを数値で確かめるには、真値が必要です。`make_scene` は、滑らかな背景の上に 120 個のランダムな長方形、円板、三角形を描きます。2 枚目の画像は、1 枚目を既知のホモグラフィ `H_true`（25° の回転、0.8 倍のスケール変化、平行移動とわずかな透視）で変換し、明るさとコントラストを変え、ノイズを加えたものです。平面シーンを撮った 2 枚の写真はまさにこの関係にあります（[第 2 回]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})）。したがって画像 1 のどの点 $\mathbf x$ についても、画像 2 での真の位置は `apply_h(H_true, x)` だと分かっています。以降のコード片はすべて、このコードの続きとして実行します。

```python
import numpy as np
from scipy import ndimage as ndi


def make_scene(h=240, w=320, n_shapes=120, seed=0):
    """A synthetic 'poster': random rectangles, disks and triangles on a smooth background."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    img = 0.5 + 0.15 * np.sin(xx / 37.0) * np.cos(yy / 23.0)
    for _ in range(n_shapes):
        kind, val = rng.integers(3), rng.uniform(0.0, 1.0)
        cx, cy, r = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(4, 22)
        if kind == 0:                                    # axis-aligned rectangle
            m = (abs(xx - cx) < r) & (abs(yy - cy) < r * rng.uniform(0.4, 1.0))
        elif kind == 1:                                  # disk
            m = (xx - cx) ** 2 + (yy - cy) ** 2 < r * r
        else:                                            # triangle = three half-planes
            a = rng.uniform(0, 2 * np.pi) + np.array([0.0, 2.1, 4.2])
            px, py = cx + r * np.cos(a), cy + r * np.sin(a)
            m = np.ones((h, w), bool)
            for i in range(3):
                j = (i + 1) % 3
                m &= (px[j] - px[i]) * (yy - py[i]) - (py[j] - py[i]) * (xx - px[i]) > 0
        img[m] = val
    return ndi.gaussian_filter(img, 0.7)


def warp_homography(img, H, shape):
    """out(x2) = img(H^-1 x2), bilinear; pixels that fall outside get 0.5 (gray)."""
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    p = np.linalg.inv(H) @ np.stack([xx.ravel(), yy.ravel(), np.ones(h * w)])
    return ndi.map_coordinates(img, [p[1] / p[2], p[0] / p[2]], order=1, cval=0.5).reshape(h, w)


def apply_h(H, p):
    q = np.c_[p, np.ones(len(p))] @ H.T
    with np.errstate(divide="ignore", invalid="ignore"):   # degenerate hypotheses -> inf / nan
        return q[:, :2] / q[:, 2:]


img = make_scene()                                       # 240 x 320, values in [0, 1]
# image 2: rotate by 25 deg, scale by 0.8 about the centre, add mild perspective, change
# brightness and contrast, add noise. H_true maps pixels of img to pixels of img2.
th, s, c = np.deg2rad(25), 0.8, np.array([160.0, 120.0])
A = s * np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
H_true = np.eye(3); H_true[:2, :2] = A; H_true[:2, 2] = c - A @ c + [10, -6]
H_true[2, :2] = [2e-4, -1e-4]
img2 = 0.85 * warp_homography(img, H_true, img.shape) + 0.1
img2 += np.random.default_rng(1).normal(0, 0.01, img.shape)
```

## 2. コーナー：構造テンソル、Harris、Shi-Tomasi

### 2.1 自己相関関数

ある点のまわりの窓を選ぶ重み $w(\mathbf x)$（標準偏差 $\sigma_i$ のガウス関数で、**積分スケール**（integration scale）と呼びます）を使い、窓を $(u, v)$ だけずらしたときの変化を測ります。

$$
E(u, v) = \sum_{\mathbf x} w(\mathbf x)\, \big[ I(x + u, y + v) - I(x, y) \big]^2 .
$$

$E$ は、窓とそれをずらしたコピーとの差の重み付き二乗和です。よい特徴では、どんなずれ $(u, v) \neq 0$ に対しても $E$ が大きくなります。つまり鋭いお椀の形です。下の図の下段は、テスト画像の実際の窓をずらして厳密に計算した $E(u, v)$ です。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-autocorrelation.svg" localized="true" caption="上：この記事を通して使う合成画像の 3 つの窓。オレンジの円はガウス窓（$\sigma_i = 2$ px、円の半径は $3\sigma_i$）です。下：最大 $\pm 6$ px のずれに対する自己相関 $E(u, v)$（3 つのパネルで同じカラースケール）と、白い破線で示した二次近似 $[u\ v]\,M\,[u\ v]^\top$ の等高線。平坦部：どこでも $E \approx 0$ で、$M$ の 2 つの固有値はともにゼロです。エッジ：エッジ方向に沿った谷。$\lambda_1 = 0.0298$、$\lambda_2 = 0.0005$。コーナー：お椀形。$\lambda_1 = 0.0245$、$\lambda_2 = 0.0129$。" %}

### 2.2 $E(u, v)$ から構造テンソルへ

小さなずれに対して 1 次のテイラー展開をすると $I(x + u, y + v) \approx I(x, y) + I_x u + I_y v$ です。これを代入すると、

$$
E(u, v) \approx \sum_{\mathbf x} w(\mathbf x)\, (I_x u + I_y v)^2
= \begin{pmatrix} u & v \end{pmatrix}
\underbrace{\sum_{\mathbf x} w(\mathbf x) \begin{pmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{pmatrix}}_{M}
\begin{pmatrix} u \\ v \end{pmatrix}.
$$

この $2\times 2$ の対称行列 $M$ が**構造テンソル**（structure tensor、2 次モーメント行列とも呼ばれます）です。局所的には $E$ は二次のお椀で、その形は $M$ だけで完全に決まります。固有分解を $M = \lambda_1 \mathbf e_1 \mathbf e_1^\top + \lambda_2 \mathbf e_2 \mathbf e_2^\top$、$\lambda_1 \geq \lambda_2 \geq 0$ と書きます（$M$ は外積 $\nabla I\, \nabla I^\top$ の重み付き和なので、どちらも非負です）。すると $\mathbf e_i$ 方向に長さ 1 だけずらしたときのコストは $E = \lambda_i$ です。

- **平坦**：$\lambda_1 \approx \lambda_2 \approx 0$。
- **エッジ**：$\lambda_1 \gg \lambda_2 \approx 0$。$\mathbf e_1$ はエッジを横切る向き。
- **コーナー**：$\lambda_1$ と $\lambda_2$ がともに大きい。

等高線 $[u\ v] M [u\ v]^\top = c$ は、$\mathbf e_i$ 方向の半軸が $\sqrt{c/\lambda_i}$ の楕円で、上の図の破線がそれです。実際には、微分は小さな**微分スケール**（differentiation scale）$\sigma_d$（ここでは 1 px）のガウス微分フィルタで計算し、$\mathbf x$ についての和は 3 枚の画像 $I_x^2$、$I_x I_y$、$I_y^2$ を $\sigma_i$ でガウスぼかしすることで求めます。

**計算例。** 一様な重みの窓を考え、その中の 10 画素が勾配 $(0.5, 0)$ の縦エッジ上に、10 画素が勾配 $(0, 0.5)$ の横エッジ上にあり、それ以外の勾配はゼロだとします（L 字形のコーナー）。すると $\sum I_x^2 = 10 \cdot 0.25 = 2.5$、$\sum I_y^2 = 2.5$、$\sum I_x I_y = 0$ なので $M = \mathrm{diag}(2.5, 2.5)$、$\lambda_1 = \lambda_2 = 2.5$ となり、コーナーです。横エッジを取り除くと $M = \mathrm{diag}(2.5, 0)$ で、エッジになります。コーナーを 45° 回すと、勾配は $(0.354, 0.354)$ と $(-0.354, 0.354)$ になるので $\sum I_x^2 = 20 \cdot 0.125 = 2.5$、$\sum I_y^2 = 2.5$ で、交差項の $+1.25$ と $-1.25$ は打ち消し合います。$M$ は変わりません。固有値に基づく検出器が回転不変である理由がここにあります。

### 2.3 Harris と Shi-Tomasi のスコア

Harris と Stephens（1988）は、固有値を明示的に計算せずに済む次の応答を使いました。

$$
R = \det M - k\, (\operatorname{tr} M)^2 = \lambda_1 \lambda_2 - k\, (\lambda_1 + \lambda_2)^2, \qquad k \in [0.04, 0.06].
$$

$R$ はコーナーでは大きな正の値、エッジでは負（そこでは $\lambda_1\lambda_2 \approx 0$）、平坦な領域では小さな値になります。上の計算例では、コーナーが $R = 6.25 - 0.05 \cdot 25 = 5.0$、エッジが $R = 0 - 0.05 \cdot 6.25 = -0.31$ です。では両者の境界は正確にどこにあるのでしょうか。$\lambda_2 = c\,\lambda_1$ と書くと $R = \lambda_1^2 \,[\,c - k (1 + c)^2\,]$ であり、これが正になるのは $k c^2 - (1 - 2k)\, c + k < 0$ のとき、すなわち

$$
\frac{\lambda_2}{\lambda_1} > c^\ast(k) = \frac{1 - 2k - \sqrt{1 - 4k}}{2k}, \qquad c^\ast(0.05) = 0.0557
$$

のときです。つまり $k = 0.05$ の Harris は、弱い方向の強さが強い方向の約 5.6% を超えた時点でその点をコーナーらしいとみなします。$k$ はこの比を調整するつまみです。Shi と Tomasi（1994）は、より直接的なスコア $\min(\lambda_1, \lambda_2) = \lambda_2$ を提案しました。これは第 8 節の追跡方程式の条件数から導かれたもので、小さい方の固有値が大きい点こそ追跡に向いている、というものです。どちらの場合も、その後に**非極大値抑制**（non-maximum suppression。$(2r+1)^2$ の近傍でスコアが最大の画素だけを残す）としきい値処理を行います。

```python
def structure_tensor(img, sigma_d=1.0, sigma_i=2.0):
    """Gaussian-derivative gradients, then Gaussian-weighted sums of their products."""
    Ix = ndi.gaussian_filter(img, sigma_d, order=(0, 1))   # d/dx (axis 1 = columns)
    Iy = ndi.gaussian_filter(img, sigma_d, order=(1, 0))   # d/dy (axis 0 = rows)
    Sxx = ndi.gaussian_filter(Ix * Ix, sigma_i)
    Sxy = ndi.gaussian_filter(Ix * Iy, sigma_i)
    Syy = ndi.gaussian_filter(Iy * Iy, sigma_i)
    return Sxx, Sxy, Syy


def harris(img, k=0.05, **kw):
    Sxx, Sxy, Syy = structure_tensor(img, **kw)
    det, tr = Sxx * Syy - Sxy ** 2, Sxx + Syy
    R = det - k * tr ** 2                                  # Harris-Stephens response
    lam_min = tr / 2 - np.sqrt((Sxx - Syy) ** 2 / 4 + Sxy ** 2)   # Shi-Tomasi score
    return R, lam_min


def nms_peaks(score, radius=4, rel_thresh=0.01, max_n=None):
    """Local maxima in a (2r+1)^2 window above rel_thresh * max, strongest first, as (x, y)."""
    peak = (score == ndi.maximum_filter(score, size=2 * radius + 1)) & (score > rel_thresh * score.max())
    ys, xs = np.nonzero(peak)
    order = np.argsort(-score[ys, xs])
    return np.stack([xs, ys], 1)[order][:max_n]


R, lam_min = harris(img)
corners = nms_peaks(R, radius=4, rel_thresh=0.01)
print("Harris corners:", len(corners), " strongest at (x, y) =", corners[0])
print("R > 0 (corner-like) pixels: %.1f%%   R < 0 (edge-like): %.1f%%"
      % (100 * np.mean(R > 1e-6), 100 * np.mean(R < -1e-6)))
```

```text
Harris corners: 121  strongest at (x, y) = [257 192]
R > 0 (corner-like) pixels: 7.9%   R < 0 (edge-like): 7.3%
```

図は検出結果と、下段に画像の全画素を $(\lambda_1, \lambda_2)$ 平面上の点として示したものです。エッジは $\lambda_1$ 軸に沿った長い腕を、コーナーは $R = 0$ の直線より上の点群をなしています。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-harris.svg" localized="true" caption="左上：合成画像の 121 個の Harris コーナー（赤い十字。$k = 0.05$、NMS 半径 4 px、しきい値 $0.01\,R_{\max}$）と 145 個の Shi-Tomasi コーナー（シアンの円。しきい値は最大の $\lambda_2$ の $0.05$ 倍）。右上：Harris 応答。$R > 0$（コーナー）は赤、$R < 0$（エッジ）は青で、図形の輪郭は青く、その角は赤くなっています。下：ランダムに選んだ 6000 画素の $(\lambda_1, \lambda_2)$ 平面上の位置。黒線 $\lambda_2 = 0.0557\,\lambda_1$ が $R = 0$、赤い破線が検出しきい値、シアンの点線が Shi-Tomasi のしきい値です。" %}

Harris コーナーは回転と明るさの一様な加算に対しては不変ですが、**スケール**には不変ではありません。遠くから見たコーナーは窓に収まりますが、同じコーナーを近くで見ると、ゆるやかに曲がったエッジのように見えます。第 3 節でこれを解決します。実用上の改良をいくつか挙げます。最大値のまわりでスコアを二次関数で近似してサブピクセル精度を得ること（あるいは OpenCV の `cornerSubPix`。窓内の勾配が、その点へ向かうベクトルと直交する位置を解きます）、適応的非極大値抑制でコーナーを画像全体に均等に散らすこと（SLAM のフロントエンドで重要です）、そして Shi-Tomasi を実装した OpenCV の `goodFeaturesToTrack` のように、コーナー間に最小距離を設けることです。

下のインタラクティブなウィジェットで、構造テンソルを体感できます。窓をコーナー、エッジ、平坦部の上にドラッグしてください。中央のプロットは窓の中の勾配 $(I_x, I_y)$ を示し、楕円が行列 $M$ を表します。右側のプロットは第 8 節の内容で、そこまで読めば意味が分かります。

{% include widget.liquid name="3d-vision-structure-tensor" height="470" caption="構造テンソルと Lucas-Kanade。オレンジの窓を画像（合成、160×100 px）の上でドラッグしてください。中央：窓内の各画素の勾配ベクトル（薄い点はその符号を反転したもの。$M$ は $\nabla I$ と $-\nabla I$ を区別できないため）と、半軸が $\sqrt{\lambda_1}$ と $\sqrt{\lambda_2}$ に比例する $M$ の楕円。コーナーでは太い楕円、エッジでは針のような楕円になり、平坦部では何も出ません。分類ラベルは $R$ の符号で決まり、「Harris 応答」にチェックを入れると画像全体を $R$ で色分けします。右：$(u, v)$（スライダー）だけずらした 2 枚目の画像に対する、各画素のフロー拘束 $I_x u + I_y v + I_t = 0$ を $(u, v)$ 平面の直線として表示します。赤い点が真の動き、緑の円が Lucas-Kanade の推定です。コーナーでは直線が 1 点で交わり、エッジでは平行になって、法線方向のフローしか決まりません。" %}

## 3. スケール空間と SIFT

### 3.1 スケール空間

同じ構造をどんな大きさで写っていても検出するには、画像をあらゆるスケールで見ます。画像の**ガウススケール空間**（Gaussian scale space）は、ぼかした画像の族

$$
L(\mathbf x; \sigma) = (G_\sigma \ast I)(\mathbf x), \qquad G_\sigma(\mathbf x) = \frac{1}{2\pi\sigma^2} e^{-\lVert\mathbf x\rVert^2 / 2\sigma^2}
$$

です。ぼかしはおよそ $\sigma$ より小さな細部を取り除きます。そしてガウス関数は、$\sigma$ を大きくしても新しい構造を決して生み出さない唯一のカーネルです（Koenderink 1984、Lindeberg 1994）。$L$ は熱（拡散）方程式を満たし、これをすぐ後で使います。

$$
\frac{\partial L}{\partial \sigma} = \sigma\, \nabla^2 L, \qquad \nabla^2 = \frac{\partial^2}{\partial x^2} + \frac{\partial^2}{\partial y^2}.
$$

### 3.2 自動スケール選択

画像を $a$ 倍に拡大して $I'(a\mathbf x) = I(\mathbf x)$ とすると、$L'(a\mathbf x; a\sigma) = L(\mathbf x; \sigma)$ となり、同じ構造がスケール $a\sigma$ に現れます。ところが空間微分には 1 回ごとに $1/a$ の因子がかかります。したがって $\sigma$ を掛けた微分、すなわち**スケール正規化微分**（scale-normalized derivative）$\sigma \partial_x$ は変わりません。Lindeberg（1998）はこれを規則にしました。構造の**特性スケール**（characteristic scale）とは、スケール正規化した微分応答がスケール方向に極値をとる $\sigma$ である、というものです。ブロブ（blob）に対して自然な応答は、スケール正規化ラプラシアン $\sigma^2 \nabla^2 L$ です。

**ガウスブロブでの導出。** 画像を大きさ $s$ の明るいブロブ $I(\mathbf x) = e^{-\lVert\mathbf x\rVert^2/2s^2}$ とします。2 つのガウス関数を畳み込むと分散が足し合わされるので、$L(\mathbf x; \sigma) = \frac{s^2}{s^2 + \sigma^2}\, e^{-\lVert\mathbf x\rVert^2 / 2(s^2 + \sigma^2)}$ です。$A e^{-r^2/2v}$ の中心でのラプラシアンは $-2A/v$ なので、ブロブの中心では

$$
\sigma^2 \nabla^2 L(\mathbf 0; \sigma) = -\frac{2\,\sigma^2 s^2}{(s^2 + \sigma^2)^2}
$$

となります。$t = \sigma^2$ で微分してゼロとおくと $(s^2 + t) - 2t = 0$ なので、大きさは $\sigma = s$ でピーク値 $1/2$ をとります。どれだけズームしても、検出器はちょうどブロブ自身の大きさを報告するのです。半径 $r$ の円板では、同じ実験で $\sigma = r/\sqrt 2$ にピークが出ます。因子 $\sigma^2$ がなければ、応答は $\sigma$ とともに減衰するだけで、毎回いちばん細かいスケールが選ばれてしまいます。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-scale-selection.svg" localized="true" caption="左：半径 $r = 3, 6, 12$ の明るい円板の中心でのスケール正規化ラプラシアン $-\sigma^2\nabla^2 L$。`scipy.ndimage.gaussian_laplace` を使い、$\sigma$ を 0.1 刻みで計算しました。ピークは $\sigma = 2.2, 4.2, 8.4$ にあり、$r/\sqrt 2 = 2.12, 4.24, 8.49$（点線）との差は刻み幅以内です。円板を 2 倍にすると、選ばれるスケールも 2 倍になります。右：大きさ $s = 6$ のガウスブロブ。数値計算の応答（紫）は閉じた式 $2\sigma^2 s^2/(s^2+\sigma^2)^2$（黒）と一致し、$\sigma = 6.0$ でピーク値 $1/2$ をとります。ガウス差分を $k - 1$ で割ったもの（オレンジ、$k = 2^{1/3}$）は同じ形をしていますが、$\sigma$ と $k\sigma$ を比べているため $\sigma = 5.3 \approx s/\sqrt k$ でピークになり、その値は 0.443 です。" %}

### 3.3 ガウス差分

多くのスケールで $\nabla^2 L$ を計算するのは高くつきます。Lowe の SIFT（2004）は、熱方程式から自然に出てくる安価な近似を使います。$\sigma$ についての差分をとると

$$
L(\mathbf x; k\sigma) - L(\mathbf x; \sigma) \approx (k\sigma - \sigma)\, \frac{\partial L}{\partial \sigma} = (k - 1)\, \sigma^2 \nabla^2 L
$$

です。隣り合う 2 つのスケールの**ガウス差分**（difference of Gaussians、DoG）は、極値の位置を動かさない定数因子 $k - 1$ を除けば、それ自体がスケール正規化ラプラシアンなのです。スケール空間は**オクターブ**（octave）単位で構成します。オクターブ内ではぼかしが $\sigma_0 2^{s/S}$ と等比的に増え（Lowe の論文では間隔数 $S = 3$、$\sigma_0 = 1.6$）、$\sigma$ が 2 倍になったところで画像を半分に間引いて次のオクターブを始めます。各オクターブでは $S + 3$ 枚のガウス画像から $S + 2$ 枚の DoG 画像を作ります。こうすると、上下に隣のレベルを持つ $S$ 枚のレベルで極値を探せます。

キーポイントとは、空間とスケールの $3 \times 3 \times 3$ ブロック内の 26 個の近傍すべてより DoG の値が大きい（または小さい）画素です。各候補はその後、次のように精密化され、ふるいにかけられます。

1. **サブピクセル・サブスケールの位置決め。** サンプルのまわりで $D$ を二次関数で近似します：$D(\mathbf z + \boldsymbol\delta) \approx D + \mathbf g^\top \boldsymbol\delta + \frac12 \boldsymbol\delta^\top H \boldsymbol\delta$。ここで $\mathbf z = (x, y, \sigma)$ で、勾配 $\mathbf g$ とヘッセ行列 $H$ は差分で求めます。極値は $\hat{\boldsymbol\delta} = -H^{-1}\mathbf g$ にあり、いずれかの成分が 0.5 を超えるなら、その極値は隣のサンプルに属します。
2. **低コントラスト。** $\lvert D(\hat{\mathbf z})\rvert = \lvert D + \frac12 \mathbf g^\top \hat{\boldsymbol\delta} \rvert$ がしきい値未満なら除きます（Lowe は $[0, 1]$ の画像に対して 0.03 を使いました）。
3. **エッジ。** DoG はエッジに沿っても強く反応しますが、そこではエッジ方向の位置が定まりません。$D$ の $2 \times 2$ の空間ヘッセ行列 $H_s$ の固有値を $\alpha = r\beta$ とすると、比 $(\operatorname{tr} H_s)^2/\det H_s = (r + 1)^2/r$ は $r$ とともに大きくなります。$(\operatorname{tr} H_s)^2 / \det H_s < (r_{\max} + 1)^2 / r_{\max}$ のときだけ点を残します。Lowe は $r_{\max} = 10$、つまり上限 12.1 を使いました。これも Harris の考え方で、構造テンソルの代わりにヘッセ行列に適用したものです。

```python
def build_dog(img, n_oct=4, S=3, sigma0=1.6, sigma_in=0.5):
    """Gaussian and difference-of-Gaussian pyramids: octave o has S+3 levels sigma0 * 2^(s/S)."""
    gauss, dogs = [], []
    base = ndi.gaussian_filter(img, np.sqrt(sigma0 ** 2 - sigma_in ** 2))
    for o in range(n_oct):
        sig = sigma0 * 2.0 ** (np.arange(S + 3) / S)
        L = np.stack([base] + [ndi.gaussian_filter(base, np.sqrt(s ** 2 - sigma0 ** 2)) for s in sig[1:]])
        gauss.append(L)
        dogs.append(L[1:] - L[:-1])        # S+2 DoG levels
        base = L[S][::2, ::2]              # blur 2*sigma0 here = sigma0 at half resolution
    return gauss, dogs


def detect_dog(dogs, S=3, sigma0=1.6, contrast=0.015, r_edge=10.0):
    """Scale-space extrema of the DoG, refined to sub-pixel, with low-contrast and edge rejection.
    Returns rows (x, y, sigma) in input-image pixels plus (octave, level)."""
    kps = []
    for o, D in enumerate(dogs):
        ext = (D == ndi.maximum_filter(D, size=3)) | (D == ndi.minimum_filter(D, size=3))
        ext &= np.abs(D) > 0.5 * contrast
        ext[[0, -1]] = False                                  # need a level above and below
        ext[:, :2] = ext[:, -2:] = False; ext[:, :, :2] = ext[:, :, -2:] = False
        for s, y, x in zip(*np.nonzero(ext)):
            c = D[s, y, x]
            g = 0.5 * np.array([D[s, y, x + 1] - D[s, y, x - 1],
                                D[s, y + 1, x] - D[s, y - 1, x],
                                D[s + 1, y, x] - D[s - 1, y, x]])
            dxx = D[s, y, x + 1] + D[s, y, x - 1] - 2 * c
            dyy = D[s, y + 1, x] + D[s, y - 1, x] - 2 * c
            dss = D[s + 1, y, x] + D[s - 1, y, x] - 2 * c
            dxy = 0.25 * (D[s, y + 1, x + 1] - D[s, y + 1, x - 1] - D[s, y - 1, x + 1] + D[s, y - 1, x - 1])
            dxs = 0.25 * (D[s + 1, y, x + 1] - D[s + 1, y, x - 1] - D[s - 1, y, x + 1] + D[s - 1, y, x - 1])
            dys = 0.25 * (D[s + 1, y + 1, x] - D[s + 1, y - 1, x] - D[s - 1, y + 1, x] + D[s - 1, y - 1, x])
            Hm = np.array([[dxx, dxy, dxs], [dxy, dyy, dys], [dxs, dys, dss]])
            try:
                off = -np.linalg.solve(Hm, g)                  # quadratic fit: x_hat = -H^-1 g
            except np.linalg.LinAlgError:
                continue
            if np.abs(off).max() > 0.5:                        # extremum belongs to a neighbour
                continue
            if abs(c + 0.5 * g @ off) < contrast:              # low contrast
                continue
            tr, det = dxx + dyy, dxx * dyy - dxy ** 2          # 2x2 spatial Hessian
            if det <= 0 or tr ** 2 * r_edge >= (r_edge + 1) ** 2 * det:   # edge-like
                continue
            sigma = sigma0 * 2 ** ((s + off[2]) / S)
            kps.append(((x + off[0]) * 2 ** o, (y + off[1]) * 2 ** o, sigma * 2 ** o, o, s))
    return kps


gauss, dogs = build_dog(img)
kps = detect_dog(dogs)
sig = np.array([k[2] for k in kps])
print("DoG keypoints:", len(kps), "  per octave:", np.bincount([k[3] for k in kps]))
print("sigma range: %.2f .. %.2f px" % (sig.min(), sig.max()))
```

```text
DoG keypoints: 139   per octave: [78 34 25  2]
sigma range: 1.80 .. 19.36 px
```

### 3.4 向きと SIFT 記述子

**向き。** 各キーポイントのまわりで、そのスケールにおいて、36 ビンの勾配方向ヒストグラムを作ります。重みは勾配の大きさと、標準偏差 $1.5\sigma$ のガウス関数です。最も高いピークが向き $\theta$ を与え、その 80% を超えるほかのピークはそれぞれ、その向きを持つ追加のキーポイントになります（私たちの画像では、139 か所が 183 個の向き付きキーポイントになりました）。ピークのまわりの 3 ビンに放物線を当てはめると、$\theta$ を 10° のビン幅より細かく求められます。

**記述子。** 正方形の窓を $\theta$ だけ回転させ、$\sigma$ に合わせて拡大縮小します。$4 \times 4$ 個のセルで、各セルの幅は $3\sigma$ です。各セルで、勾配方向（$\theta$ からの相対角）の 8 ビンのヒストグラムを、勾配の大きさと窓全体にかかるガウス関数で重み付けして累積します。これを連結すると $4 \times 4 \times 8 = 128$ 個の数になります。単位長に正規化し（コントラストに対する不変性）、各成分を 0.2 で頭打ちにして（非線形な照明変化や鏡面反射による少数の大きな勾配が支配しないように）、もう一度正規化します。この記述子は、エッジの向きの大まかな空間配置であり、セル内の小さなずれや小さな変形に強いのです。Lowe はさらに、境界効果を避けるため各サンプルを隣のセルとビンへ三線形補間で配分しています。私たちのコンパクト版では単純なビン割り当てを使います。

```python
def orientations(gx, gy, x, y, sigma, nbins=36, peak_ratio=0.8):
    """Dominant gradient directions (radians) in a Gaussian window of std 1.5*sigma around (x, y)."""
    r = int(round(4.5 * sigma))
    xi, yi = int(round(x)), int(round(y))
    y0, y1 = max(yi - r, 0), min(yi + r + 1, gx.shape[0])
    x0, x1 = max(xi - r, 0), min(xi + r + 1, gx.shape[1])
    yy, xx = np.mgrid[y0:y1, x0:x1]
    w = np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * (1.5 * sigma) ** 2))
    mag = np.hypot(gx[y0:y1, x0:x1], gy[y0:y1, x0:x1])
    ang = np.arctan2(gy[y0:y1, x0:x1], gx[y0:y1, x0:x1]) % (2 * np.pi)
    hist = np.bincount((ang / (2 * np.pi) * nbins).astype(int).ravel() % nbins,
                       weights=(w * mag).ravel(), minlength=nbins)
    hist = (np.roll(hist, 1) + 2 * hist + np.roll(hist, -1)) / 4          # smooth once
    out = []
    for i in range(nbins):
        l, c, rr = hist[i - 1], hist[i], hist[(i + 1) % nbins]
        if c > l and c > rr and c >= peak_ratio * hist.max():
            di = 0.5 * (l - rr) / (l - 2 * c + rr)                        # parabolic peak
            out.append(((i + 0.5 + di) / nbins * 2 * np.pi) % (2 * np.pi))
    return out


def sift_descriptor(gx, gy, x, y, sigma, theta, d=4, nb=8):
    """d x d cells x nb orientation bins over a window of d cells, each 3*sigma wide, rotated by theta."""
    n = 4 * d                                                # 16 x 16 samples
    u = ((np.arange(n) + 0.5) / n - 0.5) * d                 # sample coordinates in cell units
    U, V = np.meshgrid(u, u)
    c, s = np.cos(theta), np.sin(theta)
    X = x + 3 * sigma * (c * U - s * V)
    Y = y + 3 * sigma * (s * U + c * V)
    GX = ndi.map_coordinates(gx, [Y, X], order=1, mode="nearest")
    GY = ndi.map_coordinates(gy, [Y, X], order=1, mode="nearest")
    gu, gv = c * GX + s * GY, -s * GX + c * GY               # gradients in the keypoint frame
    mag = np.hypot(gu, gv) * np.exp(-(U ** 2 + V ** 2) / (2 * (d / 2) ** 2))
    ob = (np.arctan2(gv, gu) % (2 * np.pi) / (2 * np.pi) * nb).astype(int) % nb
    ci = np.clip((U + d / 2).astype(int), 0, d - 1)
    cj = np.clip((V + d / 2).astype(int), 0, d - 1)
    desc = np.zeros((d, d, nb))
    np.add.at(desc, (cj, ci, ob), mag)
    desc = desc.ravel() / (np.linalg.norm(desc) + 1e-12)
    desc = np.minimum(desc, 0.2)                              # damp large gradients (illumination)
    return desc / (np.linalg.norm(desc) + 1e-12)


def sift(img, n_oct=4, S=3):
    """Mini-SIFT: returns keypoints (x, y, sigma, theta) and 128-D descriptors."""
    gauss, dogs = build_dog(img, n_oct, S)
    grads = [[np.gradient(L) for L in G] for G in gauss]     # (d/dy, d/dx) of every level
    K, Dsc = [], []
    for x, y, sigma, o, s in detect_dog(dogs, S):
        gy, gx = grads[o][s]
        xo, yo, so = x / 2 ** o, y / 2 ** o, sigma / 2 ** o  # octave pixel units
        for th in orientations(gx, gy, xo, yo, so):
            K.append((x, y, sigma, th))
            Dsc.append(sift_descriptor(gx, gy, xo, yo, so, th))
    return np.array(K), np.array(Dsc)


kp1, d1 = sift(img)
print("keypoints with orientation:", len(kp1), " descriptor shape:", d1.shape)
```

```text
keypoints with orientation: 183  descriptor shape: (183, 128)
```

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-dog-sift.svg" caption="左：`sift(img)` が見つけた 183 個の向き付き DoG キーポイント。円の半径は $\sqrt2\,\sigma$（特性スケールが $\sigma$ の円板の半径）で、赤い線分が $\theta$ を示します。小さなキーポイントはコーナーや細い構造に、大きなものは図形全体に乗っています。中央：あるキーポイント（$\sigma = 3.89$ px、$\theta = 12°$）と、回転した $4 \times 4$ のグリッド（各セルの幅 $3\sigma$、オレンジ）。各セルの 8 本の赤いスポークは、そのセルの方向ヒストグラムを画像座標系で描いたものです。右：得られた 128 次元ベクトル。単位長で、最後の正規化の前に各成分を 0.2 で頭打ちにしています（最大成分 0.28、非ゼロ成分 61 個）。" %}

知っておきたい変種：**RootSIFT**（Arandjelović と Zisserman、CVPR 2012）は L1 正規化した SIFT ベクトルの要素ごとの平方根をとり、ユークリッド距離を Hellinger カーネルにします。コストがかからず、安定して効く改良です。**SURF**（Bay ら、ECCV 2006）は積分画像上のボックスフィルタでヘッセ行列を近似します。**KAZE/AKAZE** はガウスぼかしの代わりに非線形拡散を使い、スケールを通してエッジを鋭く保ちます。SIFT の特許は 2020 年に切れ、バージョン 4.4 以降 SIFT は OpenCV のメインモジュールに入っています。（GPU で計算する）SIFT は今でも COLMAP の既定の特徴です。

## 4. バイナリ特徴：FAST、BRIEF、ORB

SIFT は正確ですが、小さなプロセッサ上のリアルタイムシステムには遅すぎます。ORB-SLAM のフロントエンドである ORB（Rublee ら、ICCV 2011）は、2 つの高速な部品を組み合わせ、それぞれの弱点を補います。

**FAST**（Rosten と Drummond、ECCV 2006）は、候補 $\mathbf p$ のまわりの半径 3 の円上にある 16 画素を調べます。円上で連続する $n$ 個以上の画素がすべて $I(\mathbf p) + t$ より明るいか、すべて $I(\mathbf p) - t$ より暗ければ、その点はコーナーです（よく使われる FAST-9 では $n = 9$）。ほとんどの画素は 16 個のうち 2 から 4 個を見ただけで棄却できます。Rosten と Drummond は、テストの最適な順序を決める決定木まで学習しました。FAST には向きもスケールもなく、エッジ上でも反応するので、ORB は FAST の点を Harris 応答で順位付けして上位を残し、検出器を画像ピラミッド上で動かします（OpenCV の既定値は 8 レベル、倍率 1.2）。

**BRIEF**（Calonder ら、ECCV 2010）は、平滑化した $S \times S$ のパッチを $n_b = 256$ 個の二値テストで記述します。固定されたランダムなオフセット対のパターンについて、$I(\mathbf p + \mathbf a_k) < I(\mathbf p + \mathbf b_k)$ なら $k$ 番目のビットを 1 にします。最もよく働いた変種では、オフセットを $\mathcal N(0, S^2/25)$ から独立に引きます。マッチングには**ハミング距離**（Hamming distance）、つまり異なるビットの数を使います。これは XOR の後に popcount をとるだけで、64 ビットあたり 1、2 命令で済み、128 次元の浮動小数点の距離よりはるかに安価です。256 ビットの記述子は 32 バイトで、浮動小数点の SIFT 記述子の 512 バイトと比べて小さくなります。

BRIEF は回転不変ではありません。画像を回すと、各テストは別の画素を比べることになります。ORB は**輝度重心**（intensity centroid）で向きを測ります。キーポイントのまわりの円板上のパッチのモーメント $m_{pq} = \sum x^p y^q I(x, y)$ を使うと、角度

$$
\theta = \operatorname{atan2}(m_{01}, m_{10})
$$

はキーポイントからパッチの輝度重み付き中心へ向かいます。サンプリングの前にテストパターンを $\theta$ だけ回転させます（**steered BRIEF**）。ORB の論文はここで副作用に気づきました。パターンを回転補正すると、ビット同士の相関が強まり、平均が 0.5 から離れていくため、記述子の識別力が落ちるのです。そこで ORB は、ランダムなパターンの代わりに、学習用パッチ上で分散が大きく相関の小さい 256 組のテストを貪欲に選んだ **rBRIEF** を使います。

```python
def brief_pattern(n_bits=256, S=31, seed=0):
    """BRIEF test pairs (a_k, b_k), offsets drawn i.i.d. from N(0, S^2/25) inside an S x S patch."""
    rng = np.random.default_rng(seed)
    return np.clip(np.round(rng.normal(0, S / 5, (n_bits, 4))), -(S // 2), S // 2)


def ic_angle(img, x, y, r=15):
    """ORB orientation: direction from the keypoint to the intensity centroid of a disk."""
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    disk = xx ** 2 + yy ** 2 <= r * r
    I = ndi.map_coordinates(img, [y + yy[disk], x + xx[disk]], order=1)
    return np.arctan2(I @ yy[disk], I @ xx[disk])          # atan2(m01, m10)


def brief(img, pts, pattern, steer=False):
    """Bit k = [I(p + a_k) < I(p + b_k)] on a smoothed image, packed into bytes (256 bits = 32 B)."""
    sm = ndi.gaussian_filter(img, 2.0)
    out = []
    for x, y in pts:
        a, b = pattern[:, :2], pattern[:, 2:]
        if steer:                                           # rotate the pattern (steered BRIEF)
            c, s = np.cos(ic_angle(img, x, y)), np.sin(ic_angle(img, x, y))
            Rm = np.array([[c, -s], [s, c]])
            a, b = a @ Rm.T, b @ Rm.T
        Ia = ndi.map_coordinates(sm, [y + a[:, 1], x + a[:, 0]], order=1)
        Ib = ndi.map_coordinates(sm, [y + b[:, 1], x + b[:, 0]], order=1)
        out.append(np.packbits(Ia < Ib))
    return np.array(out)


def hamming(B1, B2):
    """All pairwise Hamming distances: XOR then popcount."""
    return np.unpackbits(B1[:, None] ^ B2[None], axis=2).sum(2)


# Harris corners of image 1 and their true positions in image 2 (25 deg rotation)
pts1 = nms_peaks(harris(img)[0], radius=6, rel_thresh=0.02).astype(float)
pts2 = apply_h(H_true, pts1)
ok = np.all((pts2 > 20) & (pts2 < [300, 220]), axis=1) & np.all((pts1 > 20) & (pts1 < [300, 220]), axis=1)
pts1, pts2 = pts1[ok], pts2[ok]
pat = brief_pattern()
for steer in (False, True):
    Hd = hamming(brief(img, pts1, pat, steer), brief(img2, pts2, pat, steer))
    same, diff = np.diag(Hd), Hd[~np.eye(len(Hd), dtype=bool)]
    correct = np.mean(np.argmin(Hd, axis=1) == np.arange(len(Hd)))
    print("steered=%-5s  Hamming true pairs %.0f, other pairs %.0f, NN correct %.0f%% (%d points)"
          % (steer, np.median(same), np.median(diff), 100 * correct, len(Hd)))
```

```text
steered=False  Hamming true pairs 45, other pairs 129, NN correct 48% (60 points)
steered=True   Hamming true pairs 23, other pairs 77, NN correct 65% (60 points)
```

出力には両方の効果が同時に表れています。2 枚の画像の間の 25° の回転と 0.8 倍のスケール変化のもとで、回転補正は真の対応のハミング距離の中央値を半分にし（256 ビット中 45 から 23 へ）、最近傍の正解率を 48% から 65% に上げます。ところが無関係な点同士の距離の中央値も、129（独立なランダムビットで期待される 128 にほぼ等しい値）から 77 に下がります。補正後のビットはもはや独立ではないのです。これがまさに rBRIEF の動機でした。残る誤りは主にスケール変化によるもので、この単一スケールのコードは無視していますが、ORB はピラミッドで対処しています。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-fast-brief.svg" localized="true" caption="左：合成画像のあるコーナーでの FAST のセグメントテスト（中心画素は緑、$t = 0.1$）。円上の 16 画素は、$I_p - t$ より暗ければ青、$I_p + t$ より明るければ赤、それ以外は黄色です。連続する 13 個の青い画素により、この点は FAST-9 のコーナーになります（画像内にある上位 40 個の Harris コーナーのうち、37 個すべてがテストに通ります）。中央：$31 \times 31$ のパッチ上の 256 組の BRIEF テストのうち 48 組。輝度重心の角度 $\theta = 45°$（オレンジの矢印）で回転補正しています。右：25° の回転のもとでの 60 個のコーナーについて、真の対応（緑）と無関係な点同士（赤）のハミング距離。破線は通常の BRIEF、実線は steered BRIEF です。" %}

## 5. 記述子のマッチング

### 5.1 最近傍と比率テスト

画像 1 の記述子 $\\{\mathbf d_i\\}$ と画像 2 の記述子 $\\{\mathbf d'_j\\}$ が与えられたとき、$i$ に対する素直なマッチは**最近傍** $j^\ast = \arg\min_j \lVert \mathbf d_i - \mathbf d'_j \rVert$ です。困るのは、どのキーポイントにも最近傍が存在することです。画像 2 にまったく写っていない点や、繰り返しテクスチャ上の点も含めてです。記述子によって識別性が大きく異なるため、距離の絶対的なしきい値はうまく働きません。

Lowe の**比率テスト**（ratio test）は、最良の距離 $d_1$ と 2 番目の距離 $d_2$ を比べ、

$$
\frac{d_1}{d_2} < \tau, \qquad \tau \approx 0.7 \text{ から } 0.8
$$

のときだけマッチを残します。直観的には、正しいマッチは誤った候補の中で最良のものよりはっきりよくなければならず、$d_2$ は記述子空間のこの辺りで誤った候補がどこまで近づけるかの見積もりになっている、ということです。繰り返し模様の上の曖昧な点では $d_1 \approx d_2$ となり、たまたま正しくても棄却されます。Lowe は自身のデータで、$\tau = 0.8$ により誤マッチの 90% が除かれ、正しいマッチの損失は 5% 未満だったと報告しています。

さらに 2 つのフィルタが標準的に使われます。逆方向でも $i$ が $j$ の最近傍であるときだけ $(i, j)$ を残す**相互最近傍**（mutual nearest neighbour、クロス）チェックと、1 対 1 のマッチの強制です。

```python
def match_descriptors(d1, d2, ratio=0.8, mutual=True):
    """Nearest neighbour in L2 with Lowe's ratio test and an optional mutual (cross) check."""
    D = np.sqrt(np.maximum((d1 ** 2).sum(1)[:, None] + (d2 ** 2).sum(1)[None] - 2 * d1 @ d2.T, 0))
    nn = np.argsort(D, axis=1)[:, :2]
    i = np.arange(len(d1))
    r = D[i, nn[:, 0]] / D[i, nn[:, 1]]                   # distance ratio d1 / d2
    keep = r < ratio
    if mutual:
        keep &= np.argmin(D, axis=0)[nn[:, 0]] == i       # j's nearest neighbour is i, too
    return np.stack([i[keep], nn[keep, 0]], 1), r


kp2, d2 = sift(img2)
m, ratio = match_descriptors(d1, d2)
err = np.linalg.norm(apply_h(H_true, kp1[m[:, 0], :2]) - kp2[m[:, 1], :2], axis=1)
print("keypoints: %d / %d   tentative matches: %d   correct (< 3 px): %d"
      % (len(kp1), len(kp2), len(m), (err < 3).sum()))
```

```text
keypoints: 183 / 146   tentative matches: 85   correct (< 3 px): 83
```

マッチは、真の位置 `apply_h(H_true, x)` から 3 px 以内に落ちれば正しいとみなします。単純な最近傍では 183 個のマッチのうち 91 個（50%）が正しく、比率テストと相互チェックを通すと 85 個が残り、そのうち 83 個（98%）が正しくなります。このトレードオフをより確実に見るため、下の図では 8 つのランダムなシーンをまとめています。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-matching.svg" localized="true" caption="上：合成画像とその変換コピーの間の最近傍マッチ 183 個すべてを、第 6 節の RANSAC の結果で色分けしたもの（緑：推定したホモグラフィのインライア、赤：アウトライア）。オレンジの四角形は、推定した $H$ で写した画像 1 の境界です。下（8 シーンの集計。最近傍マッチ 1382 個、うち正解 609 個）：左は正しいマッチと誤ったマッチの $d_1/d_2$ の分布、右はしきい値 $\tau$ に対する適合率と再現率（残った正しいマッチの割合）。$\tau = 0.8$ では適合率 94.3%、再現率 92.1%、相互チェックを加えると適合率 97.2%、再現率 90.8% になり、$\tau = 0.7$ では 98.9% と 87.5% です。" %}

### 5.2 規模を大きくする

総当たりのマッチングのコストは $O(N_1 N_2 D)$ です。SIFT 特徴が 8000 個ずつある 2 枚の画像では約 $8 \times 10^9$ 回の積和になり、GPU なら数ミリ秒ですが、CPU ではそうはいきません。CPU 上や大規模な画像集合では、**近似最近傍**（approximate nearest neighbour）探索を使います。ランダム化 kd 木や階層的 k-means 木（Muja と Lowe の FLANN ライブラリ）、直積量子化やグラフベースのインデックス（faiss ライブラリなど）です。Structure-from-Motion では、そもそもどの**画像ペア**をマッチングするかの方が大きな問題です。総当たりは画像数の二乗で増えるので、COLMAP は動画向けに逐次マッチングを、順序のない画像集合向けに語彙木検索を用意しています。後者では、まず量子化した視覚単語の袋（bag of visual words）で画像同士を比べます。

## 6. ロバスト推定：RANSAC とその後継

### 6.1 最小二乗法はなぜ失敗するのか

比率テストの後でも誤ったマッチは残ります。そして次回以降の幾何では、アウトライアを含む対応にモデル（ホモグラフィ、基礎行列や基本行列、カメラ姿勢）を当てはめる必要があります。最小二乗法は $\sum_i e_i^2$ を最小化するので、300 px ずれた 1 つのマッチが、3 px ずれた 10,000 個のマッチと同じだけ寄与します。最小二乗法の**崩壊点**（breakdown point）はゼロで、任意に悪い 1 点が推定を任意に遠くまで動かせるのです。最近傍マッチ 183 個すべて（半分は誤り）に正規化 DLT でホモグラフィを当てはめると、画像の角は本来の位置から最大 381 px も離れた場所へ写されます。

### 6.2 RANSAC

**RANSAC**（RANdom SAmple Consensus、ランダムサンプル・コンセンサス；Fischler と Bolles、1981）は問題を逆から見ます。全データに当てはめて祈るのではなく、できるだけ小さなランダム部分集合に当てはめ、それにいくつの点が同意するかを調べるのです。

1. $s$ 個の対応からなる**最小サンプル**（minimal sample）を引きます。モデルを決めるのに必要な最少数で、直線なら $s = 2$、ホモグラフィは 4、基本行列は 5、基礎行列は 7 または 8、2D-3D マッチからのカメラ姿勢（P3P）は 3 です。
2. サンプルに**仮説**（hypothesis）を当てはめます。
3. すべての対応の残差 $e_i$ と**コンセンサス集合**（consensus set）$\mathcal I = \\{ i : e_i < t \\}$ を計算します。
4. コンセンサス集合が最大の仮説を残し、これを $N$ 回繰り返します。
5. 最良の仮説のインライアすべてを使い、最小二乗法で（幾何モデルでは非線形最適化も加えて）モデルを推定し直します。

しきい値 $t$ はノイズの大きさから決めます。インライアの残差が各座標で標準偏差 $\sigma$ のガウス分布に従うなら、$e^2/\sigma^2$ はモデルの余次元を自由度とする $\chi^2$ 分布に従い、インライアの 95% を受け入れるしきい値は、点と直線の距離（直線、Sampson 距離を使う基礎行列）では $t^2 = 3.84\,\sigma^2$、2 次元の転送誤差（ホモグラフィ）では $t^2 = 5.99\,\sigma^2$ になります。Hartley と Zisserman の本に表があります。

### 6.3 サンプルは何回必要か

インライアの割合を $w$、アウトライア率を $\varepsilon = 1 - w$ とします。サンプルを独立に引くなら、$s$ 点のサンプルにアウトライアが含まれない確率は $w^s$ で、$N$ 個のサンプルがすべて汚染されている確率は $(1 - w^s)^N$ です。これを $1 - p$ 以下（$p$ は望む信頼度）にすることを要求すると、

$$
N = \left\lceil \frac{\log(1 - p)}{\log(1 - w^s)} \right\rceil
$$

が得られます。**計算例**：ホモグラフィ（$s = 4$）で半分のマッチが誤り（$w = 0.5$）、$p = 0.99$ なら $w^4 = 0.0625$ なので、反復回数は次のとおりです。

$$
N = \left\lceil \frac{\log 0.01}{\log 0.9375} \right\rceil = \left\lceil \frac{-4.605}{-0.0645} \right\rceil = \lceil 71.4 \rceil = 72
$$

$w^s$ は $s$ について指数的に小さくなるので、最小サンプルの大きさは極めて重要です。

```python
def ransac_iterations(eps, s, p=0.99):
    """Samples needed so that, with probability p, at least one of size s is outlier-free."""
    return int(np.ceil(np.log(1 - p) / np.log(1 - (1 - eps) ** s)))


print("outlier ratio:   " + "".join("%8.0f%%" % (100 * e) for e in (0.1, 0.3, 0.5, 0.7, 0.8)))
for s, name in [(2, "line"), (3, "P3P"), (4, "homography"), (5, "essential"), (7, "F 7-pt"), (8, "F 8-pt")]:
    print("s=%d %-11s" % (s, name) + "".join("%9d" % ransac_iterations(e, s) for e in (0.1, 0.3, 0.5, 0.7, 0.8)))
```

```text
outlier ratio:         10%      30%      50%      70%      80%
s=2 line               3        7       17       49      113
s=3 P3P                4       11       35      169      574
s=4 homography         5       17       72      567     2876
s=5 essential          6       26      146     1893    14389
s=7 F 7-pt             8       54      588    21055   359777
s=8 F 8-pt             9       78     1177    70188  1798893
```

アウトライアが 70% のとき、基本行列の 5 点法は 1893 回のサンプルで済みますが、8 点法では 70188 回必要です。これが**最小ソルバー**（minimal solver。5 点法、P3P ほか多数）に多くの研究が注がれてきた理由であり、比率テストのような優れた前処理が二重に効く理由でもあります。$\varepsilon$ が下がり、それに応じて $N$ が指数的に減るのです。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-ransac-iterations.svg" localized="true" caption="RANSAC が確率 $p = 0.99$ でアウトライアを含まない最小サンプルを少なくとも 1 つ引くのに必要なサンプル数 $N$ を、アウトライア率 $\varepsilon$ に対して、最小サンプルの大きさ $s = 2$（直線）から $s = 8$（基礎行列、8 点法）まで描いたもの。紫の点は計算例（$s = 4$、$\varepsilon = 0.5$、$N = 72$）です。縦軸は対数で、最小サンプルの点が 1 つ増えるごとに $N$ はおよそ $1/w$ 倍になります。" %}

インライアの割合は事前には分からないので、実装では**適応的**な規則を使います。$N = \infty$（または上限値）から始め、よりよい仮説が見つかるたびに $w$ をそのインライア率にして $N$ を計算し直します。最良モデルはよくなる一方なので、$N$ は減る一方です。次のコードは、半分が誤りである 183 個の最近傍マッチに対して、ホモグラフィを RANSAC で推定するものです。

```python
def normalize_pts(p):
    """Hartley normalization: centroid to the origin, mean distance sqrt(2)."""
    c = p.mean(0)
    s = np.sqrt(2) / np.mean(np.linalg.norm(p - c, axis=1))
    return (p - c) * s, np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])


def homography_dlt(p1, p2):
    """Normalized DLT (post 02): H with p2 ~ H p1 from n >= 4 correspondences."""
    q1, T1 = normalize_pts(p1)
    q2, T2 = normalize_pts(p2)
    A = []
    for (x, y), (u, v) in zip(q1, q2):
        A.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        A.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    H = np.linalg.svd(np.array(A))[2][-1].reshape(3, 3)
    H = np.linalg.inv(T2) @ H @ T1
    return H / H[2, 2]


def ransac_homography(p1, p2, thresh=3.0, conf=0.999, max_iter=10000, seed=0):
    """RANSAC with the adaptive stopping rule N = log(1-p) / log(1-w^4)."""
    rng = np.random.default_rng(seed)
    best, N, it = np.zeros(len(p1), bool), max_iter, 0
    while it < N:
        idx = rng.choice(len(p1), 4, replace=False)          # minimal sample
        H = homography_dlt(p1[idx], p2[idx])                 # hypothesis
        inl = np.linalg.norm(apply_h(H, p1) - p2, axis=1) < thresh   # consensus set
        if inl.sum() > best.sum():
            best = inl
            w = inl.mean()                                   # current inlier-ratio estimate
            N = min(max_iter, np.log(1 - conf) / np.log(max(1 - w ** 4, 1e-12)))
        it += 1
    H = homography_dlt(p1[best], p2[best])                   # refit on all inliers
    return H, np.linalg.norm(apply_h(H, p1) - p2, axis=1) < thresh, it


# plain nearest-neighbour matches (no ratio test): about half of them are wrong
m_nn, _ = match_descriptors(d1, d2, ratio=1.01, mutual=False)
p1, p2 = kp1[m_nn[:, 0], :2], kp2[m_nn[:, 1], :2]
H, inl, iters = ransac_homography(p1, p2)
box = np.array([[0, 0], [319, 0], [319, 239], [0, 239]], float)
print("matches %d, RANSAC inliers %d after %d iterations" % (len(p1), inl.sum(), iters))
print("corner error of H vs ground truth: %.2f px (max)"
      % np.linalg.norm(apply_h(H, box) - apply_h(H_true, box), axis=1).max())
H_ls = homography_dlt(p1, p2)                                # no robustness at all
print("corner error of plain least squares: %.0f px"
      % np.linalg.norm(apply_h(H_ls, box) - apply_h(H_true, box), axis=1).max())
```

```text
matches 183, RANSAC inliers 91 after 120 iterations
corner error of H vs ground truth: 0.40 px (max)
corner error of plain least squares: 381 px
```

この実行の経過を追ってみる価値があります。最初の仮説のインライアは 5、6、9、14 個でした。13 回目のサンプルで 37 個（$N$ は 4130 に低下）、49 回目で 82 個（$N = 168$）、107 回目で 89 個が見つかり、$p = 0.999$ に対して $N = 120$ となって、ループは 120 回目で止まります。その 89 個のインライアで当てはめ直すと、正しいマッチ 91 個すべてが回収され、最終的なホモグラフィは画像の角を真値から 0.40 px 以内に写します。下の図は、すべての仮説を描ける直線の場合で同じ過程を示したものです。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-ransac-steps.svg" caption="60 点に対する直線の RANSAC。インライア 36 点（ノイズ $\sigma = 1$）と一様なアウトライア 24 点、しきい値 $t = 2.5$（紫の帯）。赤い円が最小サンプル、緑が仮説から $t$ 以内の点です。サンプル 1（インライア 5 個）とサンプル 2（インライア 4 個）はアウトライアを含みます。サンプル 9 はアウトライアを含まず、35 個のインライアを集め、以後のどのサンプルもこれを超えません。右下：そのインライアに対する全最小二乗の当てはめ直し（紫。点線の真の直線に対する誤差 0.52 $\sigma$）と、全点に対する最小二乗（赤い破線、誤差 9.5 $\sigma$）。" %}

このウィジェットで RANSAC を自分で動かせます。アウトライア率を上げて、必要な $N$ が爆発するのを、特に円（$s = 3$）で確かめてください。しきい値をノイズより小さくすると、よい仮説がインライアを失う様子が見られます。

{% include widget.liquid name="3d-vision-ransac" height="560" caption="RANSAC の実験場。ノイズ $\sigma$ の直線または円から取った 100 点に、比率 $\varepsilon$ のアウトライアが加わっています。「1 ステップ」は最小サンプルを 1 つ引き（赤い円）、その仮説を $\pm t$ の帯（紫）とともに表示します。「実行」は $k \geq N$ になるまで続けます。ここで $N = \lceil\log(1-p)/\log(1-\hat w^s)\rceil$ は、それまでの最良モデルのインライア率 $\hat w$ を使います（$p = 0.99$）。緑：最良モデルの当てはめ直しとそのインライア、赤い破線：全点に対する最小二乗。グラフには各仮説のインライア数（点）、それまでの最良（緑）、真のインライア数（破線）、適応的な $N$（紫）、真の $\varepsilon$ に対する $N$（灰色）を示します。図の空いている所をタップするとアウトライアを追加、点をドラッグすると移動でき、MSAC への切り替えや LO の有効化もできます。" %}

### 6.4 インライアを数えるだけでなく

素朴な RANSAC にはいくつかの弱点があり、後続の一連の研究がそれを 1 つずつ直してきました。

**スコア。** インライアを数えるだけでは、どれだけよく当てはまっているかが無視されます。同じ点を帯の中に入れる仮説は、それらの点が帯の中心からどれだけ離れていても同点になります。**MSAC**（M-estimator SAC；Torr と Zisserman、2000）は、打ち切り二次損失で仮説を採点します。

$$
C = \sum_i \rho(e_i), \qquad \rho(e) = \min(e^2, t^2)
$$

インライアは残差の二乗を、アウトライアは定数を寄与します。同じ論文の **MLESAC** はさらに一歩進み、ガウス分布のインライアと一様分布のアウトライアの混合モデルの尤度を最大化します。RANSAC 自体は、$e < t$ で $\rho(e) = 0$、それ以外で定数という特別な場合です。

**式の楽観性。** 反復回数の式は、アウトライアを含まないサンプルなら必ず全インライアを集めるモデルが得られると仮定しています。ノイズのあるデータではこれは成り立ちません。たまたま近くにある 2 つのインライアが決める直線は、角度が大きくずれることがあります。Chum、Matas、Kittler（2003）は、実際の RANSAC が予測より多くのサンプルを必要とすることを観察し、**LO-RANSAC** を提案しました。新しい最良モデルが見つかるたびに**局所最適化**（local optimization）、たとえばそのインライアに対する反復最小二乗法（あるいはインライアから最小でない部分集合を引く内側の RANSAC）を走らせ、スコアがよくなれば結果を残すのです。新しい最良モデルが見つかるのはおよそ $\log N$ 回だけなので、LO のコストはわずかです。

```python
def fit_line(P):
    """Total least squares line {x : n.x = d}, |n| = 1."""
    c = P.mean(0)
    n = np.linalg.svd(P - c)[2][-1]
    return n, n @ c


def robust_line(P, t, iters, score="ransac", lo=False, seed=0):
    """RANSAC (inlier count) or MSAC (truncated quadratic) with optional local optimization."""
    rng = np.random.default_rng(seed)
    cost = lambda e: -(e < t).sum() if score == "ransac" else np.minimum(e ** 2, t ** 2).sum()
    best, best_c = None, np.inf
    for _ in range(iters):
        n, d = fit_line(P[rng.choice(len(P), 2, replace=False)])
        c = cost(np.abs(P @ n - d))
        if c < best_c and lo:                        # LO: polish every new best model
            for _ in range(5):
                inl = np.abs(P @ n - d) < t
                if inl.sum() < 3:
                    break
                n2, d2 = fit_line(P[inl])
                c2 = cost(np.abs(P @ n2 - d2))
                if c2 >= c:
                    break
                n, d, c = n2, d2, c2
        if c < best_c:
            best, best_c = (n, d), c
    n, d = best
    return fit_line(P[np.abs(P @ n - d) < t])        # final refit on the consensus set


def line_error(model, truth=(np.array([-0.6, 0.8]), 20.0)):
    """Largest distance between the two lines over x in [0, 100] (in units of the noise sigma = 1)."""
    (n, d), (n0, d0) = model, truth
    xs = np.array([0.0, 100.0])
    ys = (d0 - n0[0] * xs) / n0[1]                    # two points on the true line
    return np.abs(np.c_[xs, ys] @ n - d).max()


def make_line_data(n_pts, eps, rng, sigma=1.0):
    n0, d0 = np.array([-0.6, 0.8]), 20.0              # true line 0.8 y - 0.6 x = 20
    k = int(round(n_pts * (1 - eps)))
    x = rng.uniform(0, 100, k)
    P_in = np.c_[x, (d0 + 0.6 * x) / 0.8] + rng.normal(0, sigma, (k, 2))
    P_out = rng.uniform([0, 0], [100, 100], (n_pts - k, 2))
    return np.r_[P_in, P_out]


rng = np.random.default_rng(0)
eps, t = 0.6, 2.5
N = ransac_iterations(eps, 2)
errs = {k: [] for k in ("LS", "RANSAC", "MSAC", "LO-RANSAC")}
for trial in range(200):
    P = make_line_data(200, eps, rng)
    errs["LS"].append(line_error(fit_line(P)))
    errs["RANSAC"].append(line_error(robust_line(P, t, N, "ransac", seed=trial)))
    errs["MSAC"].append(line_error(robust_line(P, t, N, "msac", seed=trial)))
    errs["LO-RANSAC"].append(line_error(robust_line(P, t, N, "msac", lo=True, seed=trial)))
print("eps = %.1f, N = %d samples; median / 95th-percentile line error:" % (eps, N))
for k, v in errs.items():
    print("  %-10s %6.2f  %6.2f" % (k, np.median(v), np.percentile(v, 95)))
```

```text
eps = 0.6, N = 27 samples; median / 95th-percentile line error:
  LS           9.28   16.20
  RANSAC       0.33    1.57
  MSAC         0.34    1.57
  LO-RANSAC    0.28    0.59
```

式から得た反復回数（$\varepsilon = 0.6$ で $N = 27$）では、どのロバストな変種も中央値で最小二乗法より約 30 倍よい結果になります。最後に当てはめ直しを行うので、この単純な問題では RANSAC と MSAC はほぼ同じ振る舞いです。LO-RANSAC は主に**裾**を削ります。95 パーセンタイルの誤差は 1.57 から 0.59 に下がります。最良の仮説が質の悪い（ただしアウトライアを含まない）サンプルから来た試行が、局所最適化によって救われるからです。下の図は、すべてのアウトライア率でこの実験を繰り返し、式がどれほど楽観的かを直接示します。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-robust-variants.svg" localized="true" caption="左上：最小二乗、RANSAC（しきい値内で 0、外で定数。$t^2$ として描画）、MSAC（打ち切り二次）の損失 $\rho(e)$。下：直線の誤差（データ範囲内での当てはめた直線と真の直線の最大距離、ノイズ $\sigma$ 単位）をアウトライア率に対して描いたもの。各点 150 回の試行で、$N$ は $p = 0.99$ の式から取っています。実線は中央値、点線は 95 パーセンタイル。右上：$\varepsilon = 0.7$ で、$k$ 回のサンプル後の最良モデルの誤差が $1\sigma$ 未満になる確率（300 回の試行）と、式 $1 - (1 - w^2)^k$（破線）の比較。式が与える $N = 49$（点線）では、式が 0.99 を約束するのに対し、MSAC は 0.89、LO-RANSAC は 0.98 に達します。" %}

**さらなる改良**。現代のライブラリはこれらを組み合わせています。

- **PROSAC**（Chum と Matas、CVPR 2005）は、記述子のスコアが最もよいマッチ（たとえば比 $d_1/d_2$ が最も小さいもの）から先にサンプルし、候補の範囲を徐々に広げます。スコアに情報があれば、よいサンプルがずっと早く現れます。
- **退化**（degeneracy）。サンプルがアウトライアを含まなくても、誤ったモデルを決めてしまうことがあります。たとえば基礎行列のサンプルの 8 点のうち 7 点が 1 つの平面上にある場合です。DEGENSAC はこの場合を検出して対処します。
- **USAC**（Raguram ら、TPAMI 2013）は、これらの部品を組み合わせる枠組みです。誘導サンプリング、逐次検定（SPRT）による悪い仮説の早期棄却、退化チェック、局所最適化を備えています。
- **MAGSAC と MAGSAC++**（Barath ら、CVPR 2019 と CVPR 2020）は、最も調整の難しいパラメータであるしきい値 $t$ を取り除きます。MAGSAC++ は単一のノイズスケールを選ぶ代わりに、最大値 $\sigma_{\max}$ までのノイズスケールの範囲でモデルの質を周辺化します。これにより各点には、インライアかアウトライアかの硬い判定ではなく滑らかな重みが与えられ、その重みを使った反復再重み付け最小二乗法でモデルを磨き上げます。現在の多くのパイプラインで既定の選択肢になっており、OpenCV では `cv2.USAC_MAGSAC` として使えます。

## 7. 学習型の特徴とマッチャー

手作りのパイプラインは、予想のつく状況で失敗します。強い照明変化（昼と夜）、大きな視点変化、弱いテクスチャや繰り返しテクスチャ、そしてモーションブラーです。2018 年以降、パイプラインの各段階がデータから学習されるようになり、2026 年には、SfM や視覚的位置推定の研究システムの多くで学習型マッチャーが既定になっています。

### 7.1 学習型の検出器と記述子：SuperPoint とその後継

**SuperPoint**（DeTone、Malisiewicz、Rabinovich、CVPR Workshops 2018）は、1 回の順伝播で画像全体のキーポイントと記述子を計算する全畳み込みネットワークです。共有の VGG 風エンコーダが画像を 1/8 に縮め、**検出ヘッド**は $8 \times 8$ セルごとに 65 クラスの softmax（64 個の画素位置と「キーポイントなし」のダストビン（dustbin））を出力し、**記述子ヘッド**は 256 次元の記述子マップを出力して、それをキーポイントの位置で補間・正規化します。ラベルはどこから来るのでしょうか。検出器はまず、コーナーが既知の合成図形で学習されます（できたネットワークは MagicPoint と呼ばれます）。次に**ホモグラフィック適応**（Homographic Adaptation）で実画像にラベルを付けます。各画像を多数のランダムなホモグラフィで変形し、それぞれに検出器を走らせ、検出結果を元に戻して集計するのです。どの変形のもとでも安定して見つかる点がラベルになり、これは第 1 節で求めた再現性を直接学習させることになります。記述子は、既知のホモグラフィで関係づけられた画像ペア上で対照損失を使って学習されます。

後続の検出器と記述子は、学習信号と効率を変えてきました。**DISK**（Tyszkiewicz ら、NeurIPS 2020）はキーポイントの選択とマッチングを確率的な方策として扱い、正しいマッチの数を最大化するよう方策勾配で学習します。**ALIKED** は変形可能な記述子を低コストで加えました。**XFeat**（Potje ら、CVPR 2024）は CPU 上でリアルタイムに動くよう設計された軽量ネットワークです。

### 7.2 最適輸送としての学習型マッチング：SuperGlue

最近傍マッチングは記述子のペアを 1 つずつしか見ません。**SuperGlue**（Sarlin ら、CVPR 2020）は、両方の画像のすべてのキーポイントを一緒に見ます。アテンション型のグラフニューラルネットワークが、**自己アテンション**（同じ画像のキーポイント同士。点が自分の近傍を知る）と**交差アテンション**（2 枚の画像の間。点が相手を探す）を交互に行います。入力は記述子と、キーポイント位置の符号化です。その結果、画像 A の $M$ 個のキーポイントと画像 B の $N$ 個のキーポイントの間のスコア行列 $S_{ij}$ が得られます。

割り当ては**部分的**でなければなりません。各キーポイントは高々 1 回しかマッチせず、一部のキーポイント（遮蔽されたもの、もう一方の視野の外にあるもの）は何ともマッチしないからです。そこで SuperGlue は、学習されたスコア $\alpha$ を持つ**ダストビン**の行と列を追加し、拡大した $(M+1) \times (N+1)$ 行列のソフトな割り当て $P$ を求めます。実際の行と列はそれぞれ和が 1 で、ダストビンの行と列はそれぞれ最大 $N$ 点と $M$ 点を吸収します。これはエントロピー正則化された**最適輸送**（optimal transport）問題であり、**Sinkhorn アルゴリズム**で解けます。周辺分布の条件が満たされるまで、$e^{S}$ の行と列を交互にスケーリングするのです。対数領域では次のようになります。

$$
u_i \leftarrow \log a_i - \log \sum_j e^{Z_{ij} + v_j}, \qquad v_j \leftarrow \log b_j - \log \sum_i e^{Z_{ij} + u_i}, \qquad P_{ij} = e^{Z_{ij} + u_i + v_j}.
$$

どのステップも微分可能なので、マッチャー全体を、深度付きの姿勢既知画像から得た真の対応でエンドツーエンドに学習できます。

```python
from scipy.special import logsumexp


def sinkhorn_dustbin(S, alpha, iters=100):
    """SuperGlue's partial assignment: append a dustbin row and column with score alpha, then
    alternately normalize rows and columns in the log domain. Real rows/columns get mass 1,
    the dustbins get mass N and M, so every point can be matched at most once or not at all."""
    M, N = S.shape
    Z = np.full((M + 1, N + 1), float(alpha))
    Z[:M, :N] = S
    log_a = np.log(np.r_[np.ones(M), N])                  # row marginals
    log_b = np.log(np.r_[np.ones(N), M])                  # column marginals
    u, v = np.zeros(M + 1), np.zeros(N + 1)
    for _ in range(iters):
        u = log_a - logsumexp(Z + v[None, :], axis=1)
        v = log_b - logsumexp(Z + u[:, None], axis=0)
    return np.exp(Z + u[:, None] + v[None, :])


S = np.array([[12.0, 1.5, 0.6],     # A0 clearly matches B0
              [0.9, 7.8, 8.4],      # A1 is ambiguous between B1 and B2 ...
              [0.3, 1.2, 12.6],     # ... but B2 is clearly taken by A2
              [1.8, 2.7, 2.1]])     # A3 has no partner (occluded)
P = sinkhorn_dustbin(S, alpha=4.0)
np.set_printoptions(precision=2, suppress=True)
print(P)
print("row-wise argmax of S:", S.argmax(1), "  argmax of P (3 = dustbin):", P[:4].argmax(1))
```

```text
[[0.97 0.   0.   0.03]
 [0.   0.75 0.05 0.2 ]
 [0.   0.   0.94 0.06]
 [0.   0.02 0.   0.98]
 [0.03 0.23 0.01 2.73]]
row-wise argmax of S: [0 2 2 1]   argmax of P (3 = dustbin): [0 1 2 3]
```

このおもちゃの例は、行ごとの argmax ではできない 2 つのことを示しています。$A_1$ はわずかに $B_2$ を好みます（8.4 対 7.8）が、$B_2$ は明らかに $A_2$ のものです。各列は 1 回しか使えないので、輸送は $A_1$ を $B_1$ へ移します（0.75）。$A_3$ にはよい相手がいないので、その質量は $B_1$ との誤マッチを生む代わりにダストビンへ流れます（0.98）。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-sinkhorn.svg" caption="コード中のおもちゃのスコアに対する、ダストビン付きの Sinkhorn。左：ダストビンのスコア $\alpha = 4$（行と列 $\varnothing$）を加えた拡大スコア行列。中央：行と列を 1 回ずつ正規化した後の輸送計画 $P$。右：100 回の反復後。実際の行と列の和は 1、ダストビンの行の和は 3、列の和は 4（もう一方の画像のキーポイント数）です。シアンの枠は各行の最大値で、今や 1 対 1 になっています。$S_{12} > S_{11}$ にもかかわらず $A_1 \to B_1$ となり、$A_3 \to \varnothing$ です。" %}

### 7.3 LightGlue

**LightGlue**（Lindenberger、Sarlin、Pollefeys、ICCV 2023）は SuperGlue の設計を見直し、より速く、より正確で、学習しやすくしました。目立つアイデアが 2 つあります。1 つは**適応的**であることです。各層の後で小さなヘッドがマッチがすでに確かかどうかを予測し、簡単な画像ペア（重なりが大きく、変化が小さい）は数層で抜け出し、マッチできないと確信されたキーポイントは後の層から刈り込まれます。もう 1 つは、Sinkhorn の反復を、ペアごとの類似度と点ごとの**マッチ可能性**（matchability）スコアを組み合わせた、より軽い割り当てに置き換えたことです。著者らは、典型的な屋外条件で、密なマッチャー LoFTR に近い精度を約 8 倍の速度で達成したと報告しています。SuperPoint、DISK、ALIKED、さらには古典的な SIFT 特徴用の学習済み重みもあるので、LightGlue は既存の SIFT パイプラインを手軽に強化する手段になります。

### 7.4 検出器を使わないマッチングと密なマッチング：LoFTR、RoMa、その先

検出してから記述する方式は、検出器が反応しない場所で失敗します。白い壁、一様な床、繰り返しの多い建物の外壁などです。**検出器を使わない**（detector-free）マッチャーは検出器を省きます。**LoFTR**（Sun ら、CVPR 2021）は 1/8 と 1/2 の解像度で特徴マップを取り出し、両画像の粗い特徴マップを自己アテンションと交差アテンションを交互に使って変換し、すべての粗いセルを双方向 softmax（または最適輸送）でマッチさせ、各粗マッチを細かい特徴マップの小さな窓の中でサブピクセル精度まで精密化します。アテンションによって各セルが大域的な受容野を持つので、LoFTR は記述子だけでは曖昧になる弱テクスチャ領域でもマッチを見つけます。

**密な**（dense）マッチャーはさらに進んで、すべての画素についてワープ（マッチと確信度）を推定します。**RoMa**（Edstedt ら、CVPR 2024）は、粗くロバストなマッチには凍結した DINOv2 基盤モデルの特徴を、精密な精緻化には専用の畳み込みネットワークの特徴を組み合わせ、粗マッチをアンカー位置上の分類として扱います。これは回帰よりも多峰的な曖昧さをうまく扱えます。後継の **RoMa v2**（arXiv 2511.15706、2025 年 11 月。著者の大学の論文記録では ECCV 2026 掲載とされています）は、速度、メモリ、厳選した学習データの構成に重点を置いています。密なマッチャーは今日、難しい画像ペアに対して最もロバストな選択肢ですが、疎なマッチャーよりはるかにコストがかかります。

関連する 2 つの流れ（2026 年 11 月時点）：**MASt3R**（Leroy ら、ECCV 2024）は画像ペアに対して密な 3 次元ポイントマップを予測し、その 3 次元に根ざした空間でマッチングを行います。これはマッチングを第 9 回のフィードフォワード再構成モデルと直接結びつけます。**MatchAnything**（He ら、arXiv プレプリント 2501.07556、2025 年 1 月）は、合成したクロスモーダルな画像ペア（たとえば可視光と熱赤外、あるいは医用画像のモダリティ）で検出器を使わないマッチャーを事前学習します。

実践的には次のとおりです。速度やライセンスが重要で画像同士が似ているなら、SIFT や ORB で十分です。SuperPoint または ALIKED + LightGlue は、SfM や位置推定の強力な既定の選択です。LoFTR、RoMa とその後継は、難しいペアではコストに見合う価値があります。どれも最後にはロバスト推定器にかけます。学習型マッチャーはアウトライア率を下げますが、RANSAC の必要性をなくすわけではありません。

## 8. オプティカルフロー：時間方向のマッチング

### 8.1 輝度一定と開口問題

動画では連続するフレームの差は小さな動きであり、私たちはすべての画素について対応、すなわち**オプティカルフロー**（optical flow）$\mathbf d(\mathbf x) = (u, v)$ を求めたいのです。点は動いても明るさを保つと仮定します（**輝度一定**、brightness constancy）：$I_2(\mathbf x + \mathbf d) = I_1(\mathbf x)$。小さな $\mathbf d$ に対してテイラー展開すると

$$
I_x u + I_y v + I_t = 0, \qquad I_t = I_2(\mathbf x) - I_1(\mathbf x)
$$

となります。式は 1 本、未知数は 2 つです。各画素は $\mathbf d$ を $(u, v)$ 平面上の直線に制約するだけです。決まるのは勾配方向の成分、すなわち**法線方向フロー** $-I_t \nabla I / \lVert \nabla I \rVert^2$ だけです。これが第 1 節の開口問題を式で書いたものです。小さな開口を通して見ると、動くエッジは自分を横切る方向の動きしか明かさないのです。

### 8.2 Lucas-Kanade

Lucas と Kanade（1981）は、小さな窓の中で $\mathbf d$ が一定だと仮定し、積み重ねた拘束を最小二乗法で解きます。

$$
\min_{\mathbf d} \sum_{\mathbf x \in W} \big( \nabla I^\top \mathbf d + I_t \big)^2
\quad\Longrightarrow\quad
\underbrace{\sum_W \begin{pmatrix} I_x^2 & I_x I_y \\ I_x I_y & I_y^2 \end{pmatrix}}_{M}\, \mathbf d = -\sum_W \begin{pmatrix} I_x I_t \\ I_y I_t \end{pmatrix}.
$$

この行列は第 2 節と**同じ構造テンソル** $M$ です。コーナー検出とフロー推定は表裏一体なのです。$\mathbf d$ がよく決まるのはまさに $M$ の条件がよい場所であり、だからこそ追跡についての Shi と Tomasi の論文は "Good features to track" という題なのです。エッジ上では $M$ はほぼ特異で、窓を使っても法線方向のフローしか得られません。

線形化は小さな動きにしか成り立たないので、LK は**反復的に**（Gauss-Newton として）適用します。現在の推定で $I_2$ をワープし、更新量を解き、これを繰り返します。画像構造のスケールより大きな動きでは、線形化の点が誤った盆地に入ってしまうので、LK は画像ピラミッド上で**粗から密へ**実行します。動きが 4 分の 1 になる 1/4 解像度で推定し、2 倍して 1/2 解像度で精密化し、さらに 2 倍してフル解像度で精密化するのです（OpenCV にある Bouguet のピラミッド実装 `calcOpticalFlowPyrLK`）。ピラミッド LK で Shi-Tomasi コーナーをシーケンスにわたって追跡するのが **KLT トラッカー**で、今でも視覚慣性オドメトリのフロントエンドで使われています。前後方向チェック（フレーム 2 からフレーム 1 へ逆に追跡し、元に戻らない点を捨てる）で、失敗の大半を取り除けます。

```python
def lk_window(I, J, x, y, d0=(0.0, 0.0), half=7, iters=30):
    """Iterative Lucas-Kanade for the (2*half+1)^2 window at integer (x, y):
    find d with J(p + d) = I(p). Returns d and the eigenvalues of the 2x2 matrix M."""
    Iy, Ix = np.gradient(I)
    ys, xs = np.mgrid[y - half:y + half + 1, x - half:x + half + 1]
    gx, gy, T = Ix[ys, xs].ravel(), Iy[ys, xs].ravel(), I[ys, xs].ravel()
    M = np.array([[gx @ gx, gx @ gy], [gx @ gy, gy @ gy]])        # = structure tensor (box window)
    d = np.array(d0, float)
    for _ in range(iters):
        e = ndi.map_coordinates(J, [ys.ravel() + d[1], xs.ravel() + d[0]], order=1) - T
        step = np.linalg.solve(M, -np.array([gx @ e, gy @ e]))   # Gauss-Newton step
        d += step
        if np.linalg.norm(step) < 1e-3:
            break
    return d, np.linalg.eigvalsh(M)


def lk_pyramid(I, J, x, y, levels=3, **kw):
    """Coarse-to-fine LK: solve at 1/4 resolution, double, refine at 1/2, double, refine."""
    PI, PJ = [I], [J]
    for _ in range(levels - 1):
        PI.append(ndi.gaussian_filter(PI[-1], 1.0)[::2, ::2])
        PJ.append(ndi.gaussian_filter(PJ[-1], 1.0)[::2, ::2])
    d = np.zeros(2)
    for l in reversed(range(levels)):
        d, _ = lk_window(PI[l], PJ[l], int(round(x / 2 ** l)), int(round(y / 2 ** l)), d, **kw)
        if l > 0:
            d = 2 * d
    return d


I = ndi.gaussian_filter(img, 1.0)
pts = [(x, y) for x, y in nms_peaks(harris(I)[0], radius=6)[:25] if 30 < x < 290 and 30 < y < 210]
for true_d in ([0.6, -0.4], [5.3, -3.6], [12.0, 7.0]):         # pure translations, in pixels
    J = warp_homography(I, np.array([[1, 0, true_d[0]], [0, 1, true_d[1]], [0, 0, 1.0]]), I.shape)
    ok1 = sum(np.linalg.norm(lk_window(I, J, x, y)[0] - true_d) < 0.1 for x, y in pts)
    ok2 = sum(np.linalg.norm(lk_pyramid(I, J, x, y) - true_d) < 0.1 for x, y in pts)
    print("motion %-12s single-level LK %2d/%d, pyramidal LK %2d/%d within 0.1 px"
          % (true_d, ok1, len(pts), ok2, len(pts)))
```

```text
motion [0.6, -0.4]  single-level LK 20/20, pyramidal LK 20/20 within 0.1 px
motion [5.3, -3.6]  single-level LK 20/20, pyramidal LK 20/20 within 0.1 px
motion [12.0, 7.0]  single-level LK 14/20, pyramidal LK 20/20 within 0.1 px
```

私たちの合成画像は大きな一様な図形でできているので、単一レベルの収束域が異常に広くなっています（6 px の動きでも収束します）。自然で細かいテクスチャのある画像では、ふつう 1、2 画素程度です。下の図はこれを直接測ったものです。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/03-lucas-kanade.svg" localized="true" caption="上：真の動き $\mathbf d = (0.6, -0.4)$（赤い星）に対し、$15 \times 15$ の窓で勾配が最も強い 40 画素のフロー拘束 $I_x u + I_y v + I_t = 0$ を $(u, v)$ 平面の直線として描いたもの。コーナー（$\lambda_2/\lambda_1 = 0.54$）では直線が真値の近くで交わり、最小二乗解（緑の円）は 1 ステップで $(0.58, -0.43)$ になります。縦のエッジ（$\lambda_2/\lambda_1 = 0.004$）ではすべての直線が平行で、決まるのは法線方向フロー $(0.6, 0)$ だけであり、緑の破線上のどの点も同じようによく当てはまります。下：動きの大きさに対する、20 個のコーナーのうち LK が 0.1 px 以内に収束した割合。単一レベルの LK は 9 px までは完璧で、24 px では 35% まで落ちます。3 段のピラミッドは 19.5 px まで完璧なままです。" %}

### 8.3 Horn-Schunck から RAFT へ

Lucas-Kanade は**局所的**で、平坦な領域やエッジ上では失敗します。Horn と Schunck（1981）は、画像全体で輝度一定の誤差と滑らかさの項 $\alpha^2 \int (\lVert\nabla u\rVert^2 + \lVert\nabla v\rVert^2)$ の和を最小化することでフローを**大域的**にし、平坦な領域を周囲から埋めるようにしました。その後数十年にわたる変分法がこのエネルギーを改良してきました（ロバストな罰則、粗から密へのワーピング、大変位のマッチング項など）。

**RAFT**（Recurrent All-Pairs Field Transforms；Teed と Deng、ECCV 2020）は、このエネルギー最小化を学習された反復ソルバーに置き換えました。CNN が 1/8 解像度で両フレームの画素ごとの特徴を取り出し、**全ペア相関ボリューム**（all-pairs correlation volume）がフレーム 1 の全画素とフレーム 2 の全画素の内積を保持し（4 次元ボリュームで、大きな動きも見えるようにピラミッドにプールします）、畳み込み GRU がゼロのフローから始めて、現在の推定のまわりの相関を何度も参照しては更新量を予測します。展開された、学習による Gauss-Newton によく似ています。RAFT は Sintel と KITTI で最高性能を更新し、その後のフロー、ステレオ、追跡のネットワークの基盤になりました。**SEA-RAFT**（Wang、Lipson、Deng、ECCV 2024）は、混合ラプラス損失、初期フローの直接予測、剛体運動での事前学習によって、これをより単純で高速にしています。長距離の**点追跡**（point tracking）ネットワークは、この考え方を 2 フレームから動画全体へと拡張しています。

## 9. 特徴とマッチャーの評価

論文ではいくつかの指標が報告されますが、それぞれ測っているものが違います。

- **再現性**（repeatability）：両方の画像の対応する位置で検出されたキーポイントの割合（真の幾何で写した後に $\epsilon$ px 以内）。検出器だけを評価します。
- **マッチングスコア / 平均マッチング精度**（MMA@$\epsilon$）：（相互最近傍の）マッチのうち再投影誤差が $\epsilon$ 未満のものの割合を、$\epsilon$ = 1 から 10 px について描いたもの。真のホモグラフィが付いた平面シーンの集合である HPatches（Balntas ら、CVPR 2017）が標準的なベンチマークで、私たちのおもちゃの画像ペアはその縮小版です。
- **ホモグラフィ推定精度**：推定した $H$ が画像の角を真値から $\epsilon$ px 以内に写す画像ペアの割合（私たちの例では 0.40 px）、またはその曲線の下の面積。
- **相対姿勢の AUC**：3 次元シーンでは、RANSAC で $E$ を推定して回転と並進に分解し（第 4 回）、角度誤差の大きい方をとって、累積誤差曲線の 5°、10°、20° までの面積を報告します。データセットは MegaDepth（屋外）や ScanNet（屋内）などです。
- **下流の再構成**：Image Matching Challenge とそのベンチマーク（Jin ら、IJCV 2021）は、パイプライン全体が生み出すカメラ姿勢の精度で評価します。

Jin らは方法論上の重要な指摘をしました。ベースラインを適切に調整する（比率のしきい値、RANSAC の変種としきい値、特徴の数）と、それ以前の多くの「改良」が消えてしまい、注意深く設定すれば古典的な SIFT のパイプラインは依然として競争力があったのです。2 つのマッチャーを比べるときは、両方についてロバスト推定器を固定して調整し、実行時間も報告しましょう。

## 10. OpenCV による実践的な手順

ここまでの内容はすべて OpenCV にあり、実務ではそれを使うことになります。次のコードは、SIFT と ORB、比率テスト、MAGSAC++ で同じ実験を行います。

```python
import cv2          # pip install opencv-python  (SIFT is in the main package since 4.4)

u8 = lambda a: np.clip(a * 255, 0, 255).astype(np.uint8)
g1, g2 = u8(img), u8(img2)
for name, det, norm in [("SIFT", cv2.SIFT_create(), cv2.NORM_L2),
                        ("ORB", cv2.ORB_create(nfeatures=1000), cv2.NORM_HAMMING)]:
    k1, D1 = det.detectAndCompute(g1, None)
    k2, D2 = det.detectAndCompute(g2, None)
    knn = cv2.BFMatcher(norm).knnMatch(D1, D2, k=2)
    good = [m for m, n in knn if m.distance < 0.8 * n.distance]          # ratio test
    q1 = np.float32([k1[m.queryIdx].pt for m in good])
    q2 = np.float32([k2[m.trainIdx].pt for m in good])
    H, mask = cv2.findHomography(q1, q2, cv2.USAC_MAGSAC, 3.0, confidence=0.999, maxIters=10000)
    err = np.linalg.norm(apply_h(H, box) - apply_h(H_true, box), axis=1).max()
    print("%-4s %4d / %4d keypoints, %3d ratio-test matches, %3d MAGSAC++ inliers, corner error %.2f px"
          % (name, len(k1), len(k2), len(good), mask.sum(), err))
```

```text
SIFT  322 /  313 keypoints, 204 ratio-test matches, 187 MAGSAC++ inliers, corner error 0.36 px
ORB   759 /  864 keypoints, 336 ratio-test matches, 316 MAGSAC++ inliers, corner error 0.71 px
```

（この数値は私たちの環境の OpenCV 5.0 によるもので、別のバージョンでは少し違うかもしれません。）OpenCV の SIFT が私たちの版より多くのキーポイントを見つけるのは、主に最初に画像を 2 倍に拡大し、小さな特徴のオクターブが 1 つ増えるためです。実践上の助言をいくつか挙げます。

- **まず歪みを補正する**か、少なくとも幾何検証の前に第 2 回のキャリブレーションでキーポイント座標の歪みを補正してください。RANSAC のモデルはピンホールカメラを前提にしています。
- **特徴を散らす。** テクスチャのある 1 つの角に集中した大量のマッチは、幾何をあまり拘束しません。グリッドや適応的非極大値抑制を使いましょう。
- **比率 0.7 から 0.8、相互チェック、それから RANSAC**。よくキャリブレーションされた画像なら、しきい値は 1 から 3 px 程度です。しきい値を調整できないときは MAGSAC++ を選びましょう。
- **モデルだけでなくインライア数を確認する。** インライアが 15 から 30 個未満なら、残差がどうであれ、たいていモデルが誤っているか退化しています。
- **退化に注意する。** シーンが平面であったりカメラが回転しかしていなかったりすると、ホモグラフィは基礎行列と同じくらいよくマッチを説明します。その検出方法は第 4 回で説明します。
- 難しいペアでは、RANSAC の設定ではなくマッチャーを替えましょう（SuperPoint または ALIKED + LightGlue、あるいは密なマッチャー）。

## 試してみよう

- 第 2 節の**構造テンソルのウィジェット**で、Harris は「コーナー」と言うのに動きの推定がまだ悪い場所を探してください（ヒント：ノイズを加えて小さな窓を使います）。また、チェッカーボード上で、窓の大きさによってエッジかコーナーかが決まる場所も探してみてください。
- 第 6 節の **RANSAC のウィジェット**で $\varepsilon = 0.8$ にし、直線と円で必要なサンプル数を比べてください。次にしきい値をノイズよりずっと小さくして、最良モデルのインライア数が崩れる様子を見てください。
- ホームページの[インタラクティブラボ]({{ '/' | relative_url }}#lab)には、この話のレンダリング側（パストレーシング、ガウシアンスプラッティング）があります。このシリーズの次の回からは、ここで見つけた対応点を実際に使っていきます。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Random sample consensus (Fischler, Bolles) | Communications of the ACM | 1981 | [DOI](https://doi.org/10.1145/358669.358692) | RANSAC：最小サンプルに当てはめ、コンセンサスを数える |
| An iterative image registration technique with an application to stereo vision (Lucas, Kanade) | IJCAI | 1981 | — | Lucas-Kanade 法：画像窓上の Gauss-Newton |
| Determining optical flow (Horn, Schunck) | Artificial Intelligence | 1981 | [DOI](https://doi.org/10.1016/0004-3702(81)90024-2) | 滑らかさの事前分布を持つ大域的な変分オプティカルフロー |
| A combined corner and edge detector (Harris, Stephens) | Alvey Vision Conference | 1988 | [DOI](https://doi.org/10.5244/C.2.23) | 構造テンソルと Harris 応答 |
| Good features to track (Shi, Tomasi) | CVPR | 1994 | [DOI](https://doi.org/10.1109/CVPR.1994.323794) | 追跡から導かれた最小固有値の基準 |
| Feature detection with automatic scale selection (Lindeberg) | IJCV | 1998 | [DOI](https://doi.org/10.1023/A:1008045108935) | スケール正規化微分と特性スケール |
| MLESAC: a new robust estimator with application to estimating image geometry (Torr, Zisserman) | CVIU | 2000 | [DOI](https://doi.org/10.1006/cviu.1999.0832) | MSAC と MLESAC：インライア数よりよいスコア |
| Locally optimized RANSAC (Chum, Matas, Kittler) | DAGM | 2003 | [DOI](https://doi.org/10.1007/978-3-540-45243-0_31) | LO-RANSAC：新しい最良モデルを毎回磨く |
| Distinctive image features from scale-invariant keypoints (Lowe) | IJCV | 2004 | [DOI](https://doi.org/10.1023/B:VISI.0000029664.99615.94) | SIFT：DoG 検出器、128 次元記述子、比率テスト |
| Matching with PROSAC: progressive sample consensus (Chum, Matas) | CVPR | 2005 | [DOI](https://doi.org/10.1109/CVPR.2005.221) | マッチの質による誘導サンプリング |
| Machine learning for high-speed corner detection (Rosten, Drummond) | ECCV | 2006 | [DOI](https://doi.org/10.1007/11744023_34) | FAST |
| BRIEF: binary robust independent elementary features (Calonder et al.) | ECCV | 2010 | [DOI](https://doi.org/10.1007/978-3-642-15561-1_56) | 二値テストとハミング距離によるマッチング |
| ORB: an efficient alternative to SIFT or SURF (Rublee et al.) | ICCV | 2011 | [DOI](https://doi.org/10.1109/ICCV.2011.6126544) | 向き付き FAST + 回転 BRIEF、ORB-SLAM のフロントエンド |
| USAC: a universal framework for random sample consensus (Raguram et al.) | TPAMI | 2013 | [DOI](https://doi.org/10.1109/TPAMI.2012.257) | モジュール化された現代の RANSAC |
| HPatches: a benchmark and evaluation of handcrafted and learned local descriptors (Balntas et al.) | CVPR | 2017 | [arXiv](https://arxiv.org/abs/1704.05939) | 局所記述子の標準ベンチマーク |
| SuperPoint: self-supervised interest point detection and description (DeTone et al.) | CVPR Workshops | 2018 | [arXiv](https://arxiv.org/abs/1712.07629) | ホモグラフィック適応で学習するキーポイント |
| SuperGlue: learning feature matching with graph neural networks (Sarlin et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1911.11763) | アテンション + 最適輸送によるマッチング |
| MAGSAC++, a fast, reliable and accurate robust estimator (Barath et al.) | CVPR | 2020 | [arXiv](https://arxiv.org/abs/1912.05909) | ノイズスケールを周辺化した、しきい値不要のロバスト推定 |
| RAFT: recurrent all-pairs field transforms for optical flow (Teed, Deng) | ECCV | 2020 | [arXiv](https://arxiv.org/abs/2003.12039) | 全ペア相関 + 再帰的な更新 |
| DISK: learning local features with policy gradient (Tyszkiewicz et al.) | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.13566) | 強化学習でエンドツーエンドに学習する特徴 |
| Image matching across wide baselines: from paper to practice (Jin et al.) | IJCV | 2021 | [arXiv](https://arxiv.org/abs/2003.01587) | 姿勢に基づくベンチマーク。調整したベースラインが重要 |
| LoFTR: detector-free local feature matching with transformers (Sun et al.) | CVPR | 2021 | [arXiv](https://arxiv.org/abs/2104.00680) | 検出器を使わない粗密マッチング |
| LightGlue: local feature matching at light speed (Lindenberger et al.) | ICCV | 2023 | [arXiv](https://arxiv.org/abs/2306.13643) | 適応的で高速な SuperGlue の後継 |
| RoMa: robust dense feature matching (Edstedt et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2305.15404) | 基盤モデルの特徴を使う密なマッチング |
| XFeat: accelerated features for lightweight image matching (Potje et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2404.19174) | CPU 上でリアルタイムに動く学習型特徴 |
| SEA-RAFT: simple, efficient, accurate RAFT for optical flow (Wang et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2405.14793) | より速く単純な RAFT |
| RoMa v2: harder better faster denser feature matching (Edstedt et al.) | ECCV（著者の大学の記録による） | 2026 | [arXiv](https://arxiv.org/abs/2511.15706) | 厳選した学習データによる、より速い密なマッチング |

## 学習リソース

- R. Szeliski, *Computer Vision: Algorithms and Applications*, 第 2 版, 2022：第 7 章（特徴検出とマッチング）、第 8 章（RANSAC を含む画像の位置合わせ）、第 9 章（動き推定とオプティカルフロー）。個人利用なら [szeliski.org/Book](https://szeliski.org/Book/) で無料で読めます。
- R. Hartley, A. Zisserman, *Multiple View Geometry in Computer Vision*, 第 2 版, 2004、4.7 節（ロバスト推定、RANSAC の反復回数、$\chi^2$ しきい値）。
- D. Lowe の IJCV 論文はとても読みやすく、[著者による公開版](https://www.cs.ubc.ca/~lowe/papers/ijcv04.pdf)は第 3 節のよいお供になります。
- OpenCV：特徴関連のチュートリアル（`cv2.SIFT_create`、`cv2.ORB_create`、`cv2.BFMatcher`、`cv2.calcOpticalFlowPyrLK`）と、現代的な RANSAC のフラグを説明する [USAC チュートリアル](https://docs.opencv.org/5.0/tutorials/calib3d/usac.html)。
- コード：[cvg/LightGlue](https://github.com/cvg/LightGlue)（SuperPoint、DISK、ALIKED、SIFT + LightGlue）、[magicleap/SuperGluePretrainedNetwork](https://github.com/magicleap/SuperGluePretrainedNetwork)、[Parskatt/RoMa](https://github.com/Parskatt/RoMa)、[danini/magsac](https://github.com/danini/magsac)、[princeton-vl/RAFT](https://github.com/princeton-vl/RAFT)。
- ベンチマーク：[HPatches](https://github.com/hpatches) と、Jin らの [Image Matching Challenge](https://vision.uvic.ca/image-matching-challenge/)。

## 演習

1. Harris 応答が正になるのはちょうど $\lambda_2/\lambda_1 > c^\ast(k) = (1 - 2k - \sqrt{1 - 4k})/(2k)$ のときであることを示し、$k = 0.04$ と $k = 0.06$ に対する $c^\ast$ を計算してください。どちらの $k$ が厳しいでしょうか。

   <details markdown="1"><summary>ヒント</summary>

   $R$ に $\lambda_2 = c\lambda_1$ を代入して $\lambda_1^2 > 0$ で割ると、$R > 0 \iff kc^2 - (1-2k)c + k < 0$ です。判別式は $(1-2k)^2 - 4k^2 = 1 - 4k$ で、小さい方の根が $c^\ast$ です。$c^\ast(0.04) = 0.0436$、$c^\ast(0.06) = 0.0685$ となります。$k$ が大きいほど 2 番目の方向に強さを要求するので、より厳しくなります。
   </details>

2. 第 3.2 節のガウスブロブについて、DoG 応答 $L(\mathbf 0; k\sigma) - L(\mathbf 0; \sigma)$ を閉じた式で求め、$\sigma$ 方向の極値が $\sigma = s$ ではなく $\sigma = s/\sqrt k$ の近くにあることを示してください。この偏りはマッチングに影響するでしょうか。

   <details markdown="1"><summary>ヒント</summary>

   $L(\mathbf 0; \sigma) = s^2/(s^2 + \sigma^2)$ です。DoG は $\sigma$ と $k\sigma$ を比べるので、その間のスケール、おおよそ幾何平均 $\sqrt k\,\sigma$ でのラプラシアンを測っています。$\sqrt k\,\sigma = s$ とおくと $\sigma = s/\sqrt k$ で、$s = 6$ なら 5.35 となり、図の値（5.3）と一致します。この偏りはどの画像でも同じ定数倍なので、重要な量であるマッチした 2 つのキーポイントのスケールの比は影響を受けません。
   </details>

3. マッチャーが 2000 個のマッチを出し、アウトライアが 70%、仮説 1 つと検証に 0.2 ms かかるとします。$p = 0.99$ で、ホモグラフィ、5 点法の基本行列、8 点法の基礎行列について RANSAC の時間を見積もってください。比率テストでアウトライア率が 40% に下がると、どれだけ得をするでしょうか。

   <details markdown="1"><summary>ヒント</summary>

   表を使います。アウトライア 70% ではそれぞれ 567、1893、70188 回のサンプルなので、約 0.11 s、0.38 s、14 s です。アウトライア 40% では `ransac_iterations(0.4, s)` が 34、57、272 回を返し、3 つとも 0.06 s 未満です。$\varepsilon$ を下げる効果は、$s$ が大きいほど指数的に大きくなります。
   </details>

4. ミニ SIFT の回転不変性を確かめてください。合成画像を 0°、30°、60°、90° 回転させ（`warp_homography` を使います）、通常の記述子と、`sift` の中で $\theta$ を 0 に固定した記述子のそれぞれについて、比率テストを通ったマッチのうち正しいものの割合を測ってください。結果を説明してください。

   <details markdown="1"><summary>ヒント</summary>

   `orientations` のループの代わりに `sift_descriptor(..., 0.0)` を追加する `sift` のコピーを書き、`match_descriptors` と既知の回転で正しいマッチを数えます。私たちの結果では、向きを割り当てた場合の正しいマッチは 183/183、99/99、96/97、115/115、$\theta = 0$ では 139/139、0/1、0/4、1/1 でした。測った向きがないと記述子のグリッドは画像の軸にそろったままなので、90° の回転（各 8 ビンのヒストグラムを 2 ビンずらし、セルの位置も入れ替えます）でさえマッチを壊してしまいます。
   </details>

5. 単一レベルの `lk_window` に前後方向チェックを加えてください。各コーナーを $I$ から $J$ へ追跡し、四捨五入した終点から $J$ から $I$ へ逆に追跡して、0.5 px 以内に戻らなければそのコーナーを捨てます。第 8.2 節の 12 px の動きで、6 回の追跡失敗のうちいくつをこのチェックが捉え、正しい追跡をいくつ誤って捨てるでしょうか。それはなぜでしょうか。

   <details markdown="1"><summary>ヒント</summary>

   四捨五入で失ったサブピクセル分を忘れないでください。コーナーが戻る位置は $(x_i + d^b_x) - (x_i - x_e)$ です。ここで $x_e$ は前向きの終点、$x_i$ はそれを四捨五入したものです。窓が画像からはみ出す終点も飛ばします。私たちの結果では、チェックは 6 回の失敗をすべて捉えましたが、14 回の正しい追跡のうち 4 回も捨ててしまいました。逆向きの追跡も同じ約 14 px の動きに直面し、同じくらいの頻度で失敗するからです。このチェックが信頼できる警報になるのは、ピラミッドのようにその動きに対応できる方法で両方向を追跡するときだけです。
   </details>

**次回：**[第 4 回]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})では、これらの対応点を使って 2 視点の幾何を復元します。エピポーラ線、基本行列と基礎行列、相対姿勢、三角測量です。
