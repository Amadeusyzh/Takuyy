---
layout: post
title: "高速な放射輝度場：グリッド、テンソル、ハッシュエンコーディング"
date: 2026-10-27 12:03:00+0900
description: "NeRF がなぜ遅いのか、そして明示的表現とハイブリッド表現がそれをどう解決したのかを解説します：Plenoxels、DVGO、TensoRF、Instant-NGP のマルチ解像度ハッシュエンコーディング（PyTorch コード付き）、Zip-NeRF、そして nerfstudio ツールボックス。"
categories: neural-rendering
tags: [instant-ngp, hash-encoding, plenoxels, tensorf, zip-nerf, nerfstudio]
series: neural-rendering
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 2 回]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})の NeRF は、1 シーンあたり丸 1 日の GPU 時間を必要とし、1 フレームのレンダリングにも数秒かかります。2021 年末から 2022 年にかけて、一連の論文が学習時間を数分に、Instant-NGP に至っては数秒にまで短縮しました。これらはいずれも NeRF のボリュームレンダリング方程式（volume rendering equation）を保ったまま、**場の保存方法**を変えています。すべてのサンプルが通過しなければならない 1 つの大きな MLP から、主に参照と補間で済む明示的なデータ構造へと移行したのです。この暗黙的（implicit）から明示的（explicit）への転換は、3D Gaussian Splatting（第 4 回）への架け橋となります。3DGS はこれを突き詰め、プリミティブ（primitive）そのものを明示的にしました。

## 前提知識

- ボリュームレンダリング、位置エンコーディング（positional encoding）、階層的サンプリング（hierarchical sampling）（第 2 回）。
- 三線形補間（trilinear interpolation）、球面調和関数（spherical harmonics）（基礎はここで復習し、第 4 回でさらに掘り下げます）、ハッシュ（hashing）。
- PyTorch。

## 1. NeRF はなぜ遅いのか

作業量を数えてみましょう。各レイに $64 + 192$ 個のサンプルを持つ 4096 本のレイからなる学習バッチは、約 100 万回の MLP 評価に相当します。$8\times256$ のトランク（幹）ネットワークの 1 回の順伝播評価にはおよそ $8 \times 256^2 \times 2 \approx 10^6$ FLOPs かかります。つまり順伝播だけで 1 イテレーションあたり約 $10^{12}$ FLOPs、それが 20 万イテレーション続きます。$800\times800$ のフレームを 1 枚レンダリングするだけでも、さらに $\sim 1.6\times10^8$ 回のネットワーク評価が必要です。

この方式を無駄の多いものにしている性質が 3 つあります。

1. **すべてのサンプルがネットワーク全体のコストを払う。** シーンの情報はすべて共有された MLP の重みに格納されているため、「この点の近くに関わるモデルの一部だけ」を評価する方法がありません。
2. **大半のサンプルは役に立たない。** 空の空間や遮蔽された空間が大部分を占めますが、層化サンプリング（stratified sampling）はそれらも評価してしまいます。階層的サンプリングは役立ちますが、それ自体に粗いネットワークの評価コストがかかります。
3. **大域的な重みは収束が遅い。** ある領域を更新すると関数全体が変化してしまい、大きな MLP 上の勾配降下には多数の小さなステップが必要です。

解決策はこれらの問題と 1 対 1 に対応します。特徴を**局所的に**保存し（グリッド、平面、ハッシュテーブル）、1 つのサンプルが少数のパラメータにしか触れないようにすること。占有構造（occupancy structure）で**空の空間をスキップ**し、透過率（transmittance）が無視できるほど小さくなったらレイを早期に打ち切ること。そして残りのネットワークを**極小**にすることです。

下の図は、これらの数値を並べて比較し（上）、2 つ目の問題をおもちゃのレイで示しています（下）。256 サンプルのうち、無視できない重みを持つのはごく一部だけです。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-nerf-cost.svg" localized="true" caption="上：NeRF の順伝播 FLOPs（対数スケール）。本節の数値から計算しています（$8\times256$ MLP の 1 回の評価、1 レイあたり 256 サンプルで 4096 レイのバッチ、$800\times800$ の 1 フレーム、20 万回の学習反復）。下：不透明な表面 1 つと薄い塊 1 つを持つおもちゃのレイを、256 点で一様にサンプリングしたもの。透過率 $T(t)$ は表面でゼロに落ち、重み $w_i>10^{-3}$ を持つのは赤い目盛り（256 個中 43 個）だけです。灰色の目盛りはどれもネットワーク評価 1 回分のコストを払っているのに、ほとんど寄与しません。" %}

便利なメンタルモデルとして、ハイブリッド放射輝度場（hybrid radiance field）は次のように書けます。

$$
(\sigma, \mathbf c)(\mathbf x, \mathbf d) = g_\phi\big(\, \operatorname{interp}(\mathcal G, \mathbf x),\ \mathbf d \,\big),
$$

ここで $\mathcal G$ は学習可能な特徴からなる何らかの明示的構造、$\operatorname{interp}$ は（三）線形補間による安価な参照、$g_\phi$ は小さなデコーダ、あるいはネットワークがまったくない場合もあります。

## 2. 純粋なグリッド：Plenoxels と DVGO

### 2.1 Plenoxels

**Plenoxels**（Fridovich-Keil、Yu ら、CVPR 2022）は、そもそもニューラルネットワークは必要なのかという問いを立てました。これは**疎なボクセルグリッド（sparse voxel grid）**の頂点に、密度と色を表す**球面調和関数（SH）**の係数を保存します。サンプルの値は周囲 8 頂点から三線形補間され、視点依存の色は SH から評価されます。

$$
\mathbf c(\mathbf x, \mathbf d) = \operatorname{sigmoid}\!\Big( \sum_{\ell=0}^{\ell_{\max}} \sum_{m=-\ell}^{\ell} \mathbf k_{\ell m}(\mathbf x)\, Y_{\ell m}(\mathbf d) \Big),
$$

次数は $\ell_{\max} = 2$（チャネルあたり 9 係数、頂点あたり 27 係数）です。レンダリングは NeRF の数値求積（quadrature）で行い、最適化はグリッドの値に対して直接行います。その際、**全変動（total variation）**正則化項

$$
\mathcal L_{TV} = \frac{1}{|\mathcal V|}\sum_{\mathbf v\in\mathcal V} \sqrt{\Delta_x^2(\mathbf v) + \Delta_y^2(\mathbf v) + \Delta_z^2(\mathbf v)}
$$

（隣接ボクセル間の差分）によって観測されていない領域のノイズを抑え、さらに粗から密（coarse-to-fine）へのアップサンプリングと空ボクセルの枝刈りを行います。論文では、同等の品質で NeRF より約 2 桁高速な最適化が報告されています。その主張、すなわち鍵となる要素はニューラルネットワークではなく**微分可能なボリュームレンダラ（differentiable volumetric renderer）**であるという考えは、まさに 3DGS が後に別のプリミティブで賭けたものです。Plenoxels は PlenOctrees（Yu ら、ICCV 2021）を土台にしています。PlenOctrees は SH を出力するよう学習した NeRF を八分木（octree）にベイク（bake）し、リアルタイムレンダリングを実現しました。

下の図は、この手法の 2 つの要素、すなわち 1 つのサンプルの三線形補間の重みと、空の空間を枝刈りした後に残るボクセルを示しています。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-trilinear-sparse.svg" caption="左：1 つのボクセル内での三線形補間。セル内の相対位置が (0.3, 0.65, 0.4) のサンプル $\mathbf x$ は、各頂点の値を重み $\prod_k (x_k \text{ または } 1-x_k)$ で受け取ります。各頂点の円の大きさと数字がその重みで、8 つの重みの和は 1 です。右：球面のまわりの $16^3$ グリッドで、表面が通過するボクセルだけを残したもの（4096 個中 680 個、17%。内部も空であることが見えるよう、くさび形に切り取っています）。これが Plenoxels で空のボクセルを枝刈りする考え方です。実際の手法は、はるかに高い解像度で疎なグリッドを保持します。" %}

### 2.2 DVGO

**DVGO**（Direct Voxel Grid Optimization；Sun ら、CVPR 2022）もグリッドを直接最適化しますが、小さなネットワークを残しています。密な**密度グリッド（density grid）**と**特徴グリッド（feature grid）**を持ち、補間された特徴（と視線方向）を浅い MLP でデコードします。その知見のうち 2 つは広く役立ちます。

- **事後活性化（post-activation）。** まず生のグリッド値を補間し、その後に密度の活性化（softplus、続いて $\alpha = 1 - e^{-\sigma\delta}$）を適用します。三線形補間された活性化前の値は単一ボクセル内に鋭い表面を表現できますが、活性化済みの密度を補間してもそれはできません。
- **悪いジオメトリに対する事前知識（prior）。** 直接最適化された密度グリッドはフローター（floater）を伴って過学習しやすいため、DVGO は密度を低めに初期化し、粗い段階では観測ビュー数に基づく学習率を用います。

下の図は、事後活性化の議論を 1 次元で再現したものです（演習 4 では自分で実装してもらいます）。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-post-activation.svg" caption="1 次元での DVGO の事後活性化。8 セルのグリッド（縦線が頂点）で、網掛けしたセルの内部 $x=0.56$ にある不透明な表面（点線が目標）を表現します。各方式の 9 個の頂点値は最小二乗でフィットしました。不透明度を補間する方式（オレンジ）や活性化済みの密度を補間する方式（青）はセル全体にわたって徐々に立ち上がることしかできませんが、生の値を補間してから活性化する方式（赤）は、ちょうど 0.56 に鋭い段差を置けます。活性化は softplus の後に $\alpha = 1-e^{-\sigma\delta}$（$\delta=1/64$）です。" %}

DVGO は、単一 GPU 上でゼロから約 15 分で NeRF に匹敵する品質に達すると報告しています。

純粋なグリッドの代償はメモリです。頂点あたり 28 個の float を持つ密な $512^3$ グリッドは 15 GB になります。そのため、疎な構造、枝刈り、因数分解が不可欠です。

## 3. 因数分解されたグリッド：TensoRF と K-Planes

**TensoRF**（Chen ら、ECCV 2022）は特徴グリッドを 4D テンソル（3 つの空間軸と特徴軸）とみなし、それを因数分解します。**CP 分解（CP decomposition）**では、密度はランク 1 成分の和になります。

$$
\sigma(\mathbf x) = \sum_{r=1}^{R} v^X_r(x)\, v^Y_r(y)\, v^Z_r(z),
$$

ここで $v_r$ は各軸に沿った学習可能な 1D ベクトルです。より表現力の高い**ベクトル–行列（vector–matrix, VM）**分解では、各 1D ベクトルを残り 2 軸上の 2D 行列と組み合わせます。

$$
\sigma(\mathbf x) = \sum_{r=1}^{R} \Big( v^X_r(x)\, M^{YZ}_r(y,z) + v^Y_r(y)\, M^{XZ}_r(x,z) + v^Z_r(z)\, M^{XY}_r(x,y) \Big).
$$

見た目（appearance）にも同じ因数分解を用いて特徴ベクトルを生成し、小さな MLP または SH でデコードします。メモリは $O(N^3)$ から $O(N^2)$（VM）または $O(N)$（CP）に減少します。論文では、4 MB 未満の CP モデルを 30 分未満で学習できたと報告されています。

下の図では、小さなボリュームに両方の分解をフィットさせて、そのトレードオフを確かめています。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-tensorf.svg" caption="実際のボリュームでの CP と VM の比較：傾けたトーラスの上に球を載せた形状を $32^3$ グリッドでサンプリングし、CP（交互最小二乗）と VM（3 つの項はそれぞれある展開（unfolding）におけるランク $R$ の行列なので、打ち切り SVD でフィット）で分解しました。左上：VM の 1 項、すなわち $x$ 方向のベクトルと $yz$ 平面上の行列の積。右上：パラメータ数に対する再構成 PSNR。破線は密なグリッドです。下：目標と、同程度の品質の 2 つの再構成の $z$ スライス。CP は 16 成分（1536 パラメータ）を必要としますが、VM は 2 成分（6336 パラメータ）で済みます。成分あたりでは VM のほうがはるかに表現力が高く、パラメータあたりでは、この滑らかなおもちゃのボリュームでは CP が非常にコンパクトです。" %}

**K-Planes**（Fridovich-Keil ら、CVPR 2023）は平面のアイデアを $d$ 次元へと拡張します。$d$ 次元の場を $\binom{d}{2}$ 枚の平面で表し、それらの補間特徴を**掛け合わせ**ます。動的シーン $(x, y, z, t)$ の場合、これは 6 枚の平面、すなわち 3 枚の空間平面（$xy, xz, yz$）と 3 枚の時空間平面（$xt, yt, zt$）を意味します。同じ因数分解平面のアイデアは、多くの動的 3DGS 手法の基盤にもなっています（例：4D Gaussian Splatting の HexPlane 変形場、第 5 回）。

## 4. Instant-NGP：マルチ解像度ハッシュエンコーディング

**Instant Neural Graphics Primitives**（Müller、Evans、Schied & Keller、ACM TOG / SIGGRAPH 2022）は、これらの手法の中で最も影響力のあるものです。NeRF の周波数エンコーディング（frequency encoding）を、学習可能でマルチ解像度のハッシュ化された特徴グリッドに置き換え、完全融合（fully fused）CUDA カーネルで実装することで、NeRF を数秒から数分で学習します。

### 4.1 エンコーディング

$L$ 個の解像度レベルを選びます。レベル $l$ のグリッド解像度は $N_{\min}$ と $N_{\max}$ の間で等比級数的に増加します。

$$
N_l = \big\lfloor N_{\min}\, b^{\,l} \big\rfloor,
\qquad
b = \exp\!\left( \frac{\ln N_{\max} - \ln N_{\min}}{L - 1} \right).
$$

各レベルは、次元 $F$ の特徴ベクトルを $T$ 個持つテーブルを 1 つ所有します。点 $\mathbf x\in[0,1]^d$ をエンコードするには、次のようにします。

1. 各レベルで $\mathbf x$ を $N_l$ 倍にスケールし、それを囲むセルの $2^d$ 個の整数コーナーを求めます。
2. 各コーナー $\mathbf i$ をテーブルのインデックスに写します。そのレベルのグリッド全体が収まる場合、つまり $(N_l+1)^d \le T$ ならば 1 対 1 の密なインデックスを使います。そうでなければ**空間ハッシュ（spatial hash）**
   $$
   h(\mathbf i) = \Big( \bigoplus_{k=1}^{d} i_k\, \pi_k \Big) \bmod T,
   \qquad \pi_1 = 1,\ \pi_2 = 2\,654\,435\,761,\ \pi_3 = 805\,459\,861,
   $$
   を使います。ここで $\oplus$ はビット単位の XOR です。
3. $2^d$ 個の特徴ベクトルを参照し、セル内の小数部分の位置を使ってそれらを補間します（$d=3$ では三線形補間）。
4. $L$ 個の補間済みベクトル（と、必要に応じて補助入力）を連結して $L\cdot F$ 次元のエンコーディングとし、極小の MLP に入力します。

論文の典型的な設定は $L = 16$、$F = 2$、$T = 2^{14}$ から $2^{24}$（例えば NeRF では $2^{19}$）、$N_{\min} = 16$ です。テーブルのエントリは $\mathcal U(-10^{-4}, 10^{-4})$ で初期化されます。

下の図は、4.4 節の 2 次元テストにおけるこれらのレベルを示しています。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-hash-levels.svg" caption="4.4 節の 2 次元テストの設定（$L=16$、$N$ は 16 から 512、$T=2^{15}$）の各レベルを、上の式で計算したもの。上：各レベルの頂点数（対数スケール）。緑のレベルはテーブルに収まり密なインデックスを使い、オレンジのレベル（$N=203$ 以上）はハッシュされます。左下：レベル 0、5、10 のグリッドをテスト画像の左下隅に重ねたもの。右下：最も細かいレベルでは 263169 個の頂点が 32768 個のスロットを共有します（1 スロットあたり平均 8 個で、すべてのスロットが使われます）。赤い点は、空間ハッシュによって丸で囲んだ頂点と同じスロットに送られる 9 個の頂点で、画像全体に擬似ランダムに散らばっています。" %}

### 4.2 ハッシュ衝突が問題にならない理由

細かいレベルではテーブルのエントリ数よりグリッド頂点数のほうがはるかに多いため、異なる頂点が同じスロットで衝突します。Instant-NGP は衝突をそのまま許し、次の 3 つの事実に頼ります。

- **勾配の平均化は重要なものを優先する。** 可視表面上の頂点と空の空間の頂点が共有するスロットは両方から勾配を受け取りますが、表面の頂点のほうがはるかに多く、大きな勾配を受け取ります（そのサンプルは大きな重み $w_i$ を持つため）。そのため、格納される特徴は表面に役立つものになります。
- **マルチ解像度による曖昧さ解消。** 粗いレベルには衝突がなく（密なインデックス）、2 つの点が細かいレベルの*すべて*で同時に衝突する可能性は非常に低いです。MLP は連結結果を見るので、両者を区別できます。
- **適応性がタダで手に入る。** 明示的な疎構造や枝刈りは不要で、テーブルの容量は詳細がある場所へと自然に振り向けられます。

$T$ はメモリと品質のトレードオフを明示的に調整するつまみです。論文では、品質が $\log T$ とともに向上し、やがて飽和することが示されています。

この調整つまみは 4.4 節の 2 次元テストではっきり見えます。そこでは $T$ を $2^{10}$ から $2^{19}$ まで変えた NumPy での再実行結果を図示しています。

### 4.3 システムの残りの部分

- **極小の MLP。** NeRF の場合、密度 MLP は 64 ニューロンの隠れ層を 1 つ持ち、16 個の値を出力します。その最初の値は対数密度（log-density）として解釈されます。色 MLP は 64 ニューロンの隠れ層を 2 つ持ち、これら 16 個の値と、次数 4 までの球面調和関数でエンコードした視線方向（16 係数）を入力とします。
- **占有グリッド（occupancy grid）。** マルチスケールの 2 値グリッドが、無視できない密度を持つセルをマークします。レイマーチング（ray marching）は空のセルをスキップし、透過率がしきい値を下回ると停止するため、ほとんどのレイはごく少数のサンプルしか評価しません。このグリッドは現在の密度から定期的に更新されます。
- **オプティマイザ。** Adam を $\beta_1 = 0.9$、$\beta_2 = 0.99$、$\epsilon = 10^{-15}$ で使います（多くのハッシュエントリはまれにしか小さな勾配を受け取らないため、極小の $\epsilon$ が重要です）。弱い L2 正則化は MLP の重みにのみ適用します。
- **完全融合 CUDA。** MLP は `tiny-cuda-nn` ライブラリで評価され、すべての層が 1 つのカーネルに融合されて、活性化はオンチップメモリ（on-chip memory）に保持されます。

下の図は、占有グリッドと早期終了がおもちゃのレイでどれだけ計算を節約するかを示しています。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-occupancy.svg" caption="2 つの塊を持つ 2 次元のおもちゃシーンでの空領域スキップ（empty-space skipping）。$32\times32$ の占有グリッドが、密度が 0.01 を超える 216 セル（紫）をマークします。シーン内に 487 個の一様サンプルを持つレイは、占有セル内のサンプルだけを評価し、透過率が $10^{-4}$ を下回ると停止します。実際に評価されるのは 37 サンプル（赤）だけで、すべて最初に当たる表面の付近にあります。" %}

同じエンコーディングはギガピクセル画像、符号付き距離関数（signed distance function）、ニューラル放射輝度キャッシュ（neural radiance cache）のフィッティングにも使えます。論文が「グラフィックスプリミティブ（graphics primitives）」と呼んでいるのはそのためです。

### 4.4 コード：PyTorch によるハッシュエンコーディング

以下は $d \le 3$ 向けの、読みやすさ重視（高速ではない）の PyTorch 実装と、2D ハッシュグリッドと隠れ層 1 つの MLP で $512\times512$ の画像をフィッティングするテストです。

```python
import math, torch, torch.nn as nn

PRIMES = [1, 2654435761, 805459861]        # from the Instant-NGP paper (pi_1 = 1)

class HashEncoding(nn.Module):
    """Multiresolution hash encoding (Mueller et al. 2022) for inputs in [0, 1]^D, D <= 3."""
    def __init__(self, D=3, L=16, F=2, log2_T=19, N_min=16, N_max=2048):
        super().__init__()
        self.D, self.L, self.F, self.T = D, L, F, 2 ** log2_T
        b = math.exp((math.log(N_max) - math.log(N_min)) / (L - 1))    # per-level growth factor
        self.register_buffer("res", torch.tensor([math.floor(N_min * b ** l) for l in range(L)]))
        # one table per level, initialised U(-1e-4, 1e-4) as in the paper
        self.tables = nn.Parameter(torch.empty(L, self.T, F).uniform_(-1e-4, 1e-4))
        # all 2^D corners of a cell as 0/1 offsets, shape (2^D, D)
        corners = torch.stack(torch.meshgrid(*[torch.arange(2)] * D, indexing="ij"), -1)
        self.register_buffer("corners", corners.reshape(-1, D))
        self.register_buffer("primes", torch.tensor(PRIMES[:D], dtype=torch.int64))

    def index(self, ic, l):
        """Grid vertex (..., D) at level l -> table index. Dense indexing where the grid fits."""
        n = int(self.res[l]) + 1                          # vertices per axis
        if n ** self.D <= self.T:                         # coarse level: 1:1 mapping, no collisions
            stride = torch.tensor([n ** k for k in range(self.D)], device=ic.device)
            return (ic * stride).sum(-1)
        h = ic[..., 0] * self.primes[0]
        for k in range(1, self.D):
            h = h ^ (ic[..., k] * self.primes[k])         # spatial hash: XOR of coordinate * prime
        return h & (self.T - 1)                           # mod T (T is a power of two)

    def forward(self, x):                                 # x: (B, D) in [0, 1]
        feats = []
        for l in range(self.L):
            xs = x * self.res[l]
            x0 = torch.floor(xs)
            w = xs - x0                                   # position inside the cell
            ic = x0.long()[:, None, :] + self.corners     # (B, 2^D, D) integer corners
            # (d-)linear interpolation weights of each corner
            cw = torch.where(self.corners.bool(), w[:, None, :], 1 - w[:, None, :]).prod(-1)
            f = self.tables[l][self.index(ic, l)]         # (B, 2^D, F)
            feats.append((cw[..., None] * f).sum(1))
        return torch.cat(feats, -1)                       # (B, L * F)
```

```python
torch.manual_seed(0)
# target: a 512x512 procedural image with sharp detail
n = 512
yy, xx = torch.meshgrid(torch.linspace(0, 1, n), torch.linspace(0, 1, n), indexing="ij")
img = torch.stack([0.5 + 0.5 * torch.sin(40 * xx * yy), ((xx * 16).floor() + (yy * 16).floor()) % 2,
                   0.5 + 0.5 * torch.cos(60 * (xx - 0.5) ** 2 + 60 * (yy - 0.5) ** 2)], -1)
coords, colors = torch.stack([xx, yy], -1).reshape(-1, 2), img.reshape(-1, 3)

enc = HashEncoding(D=2, L=16, F=2, log2_T=15, N_min=16, N_max=512)
mlp = nn.Sequential(nn.Linear(32, 64), nn.ReLU(), nn.Linear(64, 3))
opt = torch.optim.Adam([{"params": enc.parameters()}, {"params": mlp.parameters(), "weight_decay": 1e-6}],
                       lr=1e-2, betas=(0.9, 0.99), eps=1e-15)
for step in range(1001):
    idx = torch.randint(0, coords.shape[0], (2 ** 14,))
    loss = ((mlp(enc(coords[idx])) - colors[idx]) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
    if step % 250 == 0:
        with torch.no_grad():
            mse = ((mlp(enc(coords)) - colors) ** 2).mean()
        print(f"step {step:4d}  full-image PSNR {-10 * torch.log10(mse).item():.1f} dB")
```

CPU（シングルスレッド）上でも、これは数百ステップ以内に 40 dB を超えます（私たちの実行ではステップ 250 で 45.8 dB と出力されました）。最も細かいレベルではテーブルのエントリ数の約 8 倍の頂点があるにもかかわらずです。コードについて 2 点補足します。

- $511 \times 2\,654\,435\,761$ のような整数の積は `int64` に余裕で収まります。CUDA 実装はラップアラウンド（wrap-around）付きの `uint32` 演算を使うため、異なるハッシュ値になりますが、同様に良好に機能します。
- レベルに関するループは多数の小さなカーネルを起動します。実際の実装（[tiny-cuda-nn](https://github.com/NVlabs/tiny-cuda-nn)、あるいは nerfstudio や nerfacc にある純粋な PyTorch と相性の良い変種）では、すべてのレベルとコーナーを 1 つの融合カーネルで処理し、逆伝播を手書きしています。

下の図は、このテストを NumPy で再実行し、テーブルサイズも比較したものです。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-hash-fit.svg" caption="上の 2 次元テストを NumPy で再実装したもの（同じエンコーディング、MLP、Adam の設定とバッチサイズ。300 ステップ。PSNR は 1 つおきの画素で計算）。左上：$512\times512$ の目標画像。右上：$T=2^{15}$ で 300 ステップ後の再構成（46.0 dB。本文の PyTorch 版はステップ 250 で 45.8 dB を出力）。下：4 つのテーブルサイズにおける、ステップに対する PSNR。$T=2^{19}$ ではすべてのレベルが収まり衝突が一切ないので、$T=2^{15}$ との差がハッシュの代償です。$T=2^{10}$ と $2^{12}$ は 4.2 節で述べたメモリと品質の調整つまみを示しています。" %}

これを第 2 回の NeRF で使うには、サンプル位置を $[0,1]^3$ に正規化し（非有界シーンではシーン縮約（scene contraction）を用います）、`positional_encoding(x, L_x)` を `HashEncoding(D=3)(x)` に置き換え、MLP を幅 64 の隠れ層 1〜2 つに縮小します。

## 5. Zip-NeRF：アンチエイリアシングとグリッドの融合

グリッド手法は高速ですが、**エイリアシング（alias）**が生じます。ハッシュグリッドは点で問い合わせるため、Mip-NeRF の円錐に基づく事前フィルタリング（統合位置エンコーディング、integrated positional encoding）をそのまま適用できないのです。**Zip-NeRF**（Barron ら、ICCV 2023）は Mip-NeRF 360 と Instant-NGP 風のグリッドを組み合わせます。

- **マルチサンプリング（multisampling）。** 各円錐台（conical frustum）を、その内部にらせん状に配置した少数の点の集合で表し、それらの点のハッシュ特徴を平均することで、円錐台上での特徴の積分を近似します。
- **スケールを考慮した重み低減（scale-aware downweighting）。** セルサイズが円錐台のフットプリント（footprint）より小さいグリッドレベルからの特徴は減衰されます。解像度 $n$ のレベルの特徴は $\operatorname{erf}\!\big(1/\sqrt{8\sigma^2 n^2}\big)$ 倍されます。ここで $\sigma$ は円錐台のガウス分布の標準偏差です。これは IPE の $e^{-\sigma^2/2}$ 因子のソフト版です。
- **アンチエイリアス化されたレベル間損失（interlevel loss）**を提案ネットワーク（proposal network）と NeRF の間に導入し、Mip-NeRF 360 の提案監督で生じていた z 方向のエイリアシング（「バンディング」、banding）を取り除きます。

下の図は、最初の 2 つのアイデアを示しています。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/03-zipnerf.svg" caption="上：Zip-NeRF のマルチサンプリングの模式図。1 つのレイ区間に対応する円錐台（紫）を、その内部のらせん上の 6 点で表し、それらのハッシュ特徴を平均します。下：重み低減係数 $\mathrm{erf}(1/\sqrt{8\sigma^2 n^2})$ を $\sigma n$（グリッドセル単位で測った円錐台の標準偏差）の関数として描いたもの。オレンジの点は 2 次元テストの 16 レベル（$n$ は 16 から 512）で、フットプリントが $\sigma=1/64$ の場合です。粗いレベルはほぼそのまま通り、セルがフットプリントよりずっと小さいレベルは 0 近くまで減衰されます。" %}

論文では、Mip-NeRF 360 やグリッドベースのベースラインのいずれと比べても誤差率が 8%–77% 低く、学習は Mip-NeRF 360 より 24 倍高速であると報告されています。Zip-NeRF は Gaussian Splatting の時代に入ってからもしばらくの間、Mip-NeRF 360 ベンチマークにおける最も強力な品質の基準の一つであり続けました。

## 6. リアルタイムレンダリングのためのベイク

Instant-NGP のモデルでさえ、大きな画像ではインタラクティブ程度のフレームレートしか出ません。各ピクセルが依然としてレイをマーチングするからです。一連の研究は、学習済みの場をラスタライズ（rasterization）しやすいアセットへと**ベイク**します。小さな遅延デコーダを持つ疎グリッド（SNeRG、Hedman ら、ICCV 2021）、小さな視点依存シェーダを持つテクスチャ付きポリゴン（MobileNeRF、Chen ら、CVPR 2023）、Web 向けの省メモリなハイブリッドグリッド（MERF、Reiser ら、SIGGRAPH 2023）、そして SDF から得たメッシュ（BakedSDF、Yariv ら、SIGGRAPH 2023）です。これらはスマートフォン上でリアルタイムのフレームレートに達しますが、いずれも別途の最適化段階が必要で、しばしば品質を犠牲にします。3DGS（第 4 回）は、リアルタイムにラスタライズできる表現で直接学習することで、このトレードオフを解消しました。

## 7. ツール：nerfstudio とその仲間たち

これらのシステムをゼロから実装することはほとんどありません。**nerfstudio**（Tancik ら、SIGGRAPH 2023 カンファレンス論文）はモジュール式の PyTorch フレームワークで、共通のデータ形式、Web ビューア、COLMAP やスマートフォンの撮影アプリ向けのデータ処理ラッパー、エクスポートツールを備えています。デフォルト手法の **nerfacto** は、本記事と第 2 回のアイデアを組み合わせたものです。ハッシュグリッドエンコーディング、シーン縮約付きの提案ネットワーク、画像ごとの外観埋め込み（appearance embedding、NeRF-W 由来）、カメラ姿勢の最適化（camera pose refinement）です。

```bash
pip install nerfstudio
ns-download-data nerfstudio --capture-name=poster        # a sample capture
ns-train nerfacto --data data/nerfstudio/poster          # opens the web viewer
ns-render camera-path --load-config outputs/poster/nerfacto/<timestamp>/config.yml \
    --camera-path-filename camera_path.json --output-path renders/poster.mp4
```

`ns-process-data images --data <folder> --output-dir <out>` を使うと、自分の写真に対して COLMAP を実行できます。同じフレームワークは Gaussian Splatting も **splatfacto**（gsplat ライブラリ上に構築）として提供しており、第 6 回で使用します。その他の便利なツールとしては、[instant-ngp](https://github.com/NVlabs/instant-ngp)（オリジナル実装、GUI と VR モード付き）、[nerfacc](https://github.com/nerfstudio-project/nerfacc)（占有グリッドサンプリングを PyTorch ライブラリとして提供）、[tiny-cuda-nn](https://github.com/NVlabs/tiny-cuda-nn) があります。

## 試してみよう

「局所的で明示的なパラメータ + 安価なレンダラ」という高速な場のアイデアこそが、[インタラクティブラボ]({{ '/' | relative_url }}#lab)の Gaussian World デモをブラウザ上で可能にしているものです。各フレームでプリミティブをソートしてラスタライズするだけで、ネットワークの評価は一切ありません。第 4 回を読む前にラボを試し、そのフレームレートを、第 2 回のコードを使って自分のマシンで NeRF の 1 フレームを描くのにかかる時間と比べてみてください。

## 代表的な論文

| 論文 | 会議/論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| PlenOctrees for Real-time Rendering of Neural Radiance Fields (Yu et al.) | ICCV | 2021 | [arXiv](https://arxiv.org/abs/2103.14024) | SH 出力 + 八分木へのベイク、リアルタイム NeRF レンダリング |
| Plenoxels: Radiance Fields without Neural Networks (Fridovich-Keil, Yu et al.) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2112.05131) | 疎な SH ボクセルグリッド、MLP なし |
| Direct Voxel Grid Optimization (Sun et al.) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2111.11215) | 密度 + 特徴グリッド、事後活性化 |
| TensoRF: Tensorial Radiance Fields (Chen et al.) | ECCV | 2022 | [arXiv](https://arxiv.org/abs/2203.09517) | CP / VM テンソル分解 |
| Instant Neural Graphics Primitives with a Multiresolution Hash Encoding (Müller et al.) | ACM TOG (SIGGRAPH) | 2022 | [arXiv](https://arxiv.org/abs/2201.05989) | ハッシュグリッド + 融合された極小 MLP、秒単位の NeRF |
| K-Planes: Explicit Radiance Fields in Space, Time, and Appearance (Fridovich-Keil et al.) | CVPR | 2023 | [arXiv](https://arxiv.org/abs/2301.10241) | 静的・動的シーンのための平面因数分解 |
| Nerfstudio: A Modular Framework for Neural Radiance Field Development (Tancik et al.) | SIGGRAPH (Conf.) | 2023 | [arXiv](https://arxiv.org/abs/2302.04264) | 標準的なツールボックス、nerfacto |
| Zip-NeRF: Anti-Aliased Grid-Based Neural Radiance Fields (Barron et al.) | ICCV | 2023 | [arXiv](https://arxiv.org/abs/2304.06706) | ハッシュグリッドのアンチエイリアシング、品質の基準 |

## 学習リソース

- [Instant-NGP プロジェクトページ](https://nvlabs.github.io/instant-ngp/)と[コード](https://github.com/NVlabs/instant-ngp)。融合 MLP とエンコーディングについては [tiny-cuda-nn](https://github.com/NVlabs/tiny-cuda-nn)。
- [nerfstudio のドキュメント](https://docs.nerf.studio/)、特に各手法の構成要素を解説している「Nerfology」のページ。
- [Plenoxels (svox2)](https://github.com/sxyu/svox2)、[DVGO](https://github.com/sunset1995/DirectVoxGO)、[TensoRF](https://github.com/apchenstu/TensoRF) の公式コード。いずれも数千行程度で読みやすいです。
- [Zip-NeRF プロジェクトページ](https://jonbarron.info/zipnerf/)。
- グラフィックスのための球面調和関数：P.-P. Sloan, "Stupid Spherical Harmonics (SH) Tricks"（GDC 2008）、および R. Green, "Spherical Harmonic Lighting: The Gritty Details"（2003）。

## 演習

1. 密度と次数 2 の SH を float32 で持つ密な $256^3$ Plenoxels グリッドのメモリ量と、同じ解像度で軸あたり $R=16$ 成分を持つ TensoRF VM モデルのメモリ量を計算してください。
2. 2D テストのハッシュエンコーディングを第 2 回の周波数エンコーディング（`positional_encoding`、$L=10$）に置き換え、幅 128 の 4 層 MLP と組み合わせてください。30 dB に達するまでに何ステップ必要でしょうか。
3. 2D テストで `log2_T = 10`、次に `log2_T = 20` を設定し、テーブルサイズに対する PSNR をプロットしてください。どこで飽和するでしょうか。
4. DVGO 方式の事後活性化を 1D で実装してください。$[0,1]$ 上の 8 セルからなる生の密度グリッドを用い、活性化の前に補間するほうが、後に補間するよりも鋭い不透明度のステップを生み出せることを示してください。
5. `HashEncoding` を第 2 回の NeRF に組み込み、隠れ層 1 つの密度 MLP を使って、トイシーン上で PSNR あたりの学習速度を比較してください。

**次回：** [第 4 回]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})では、レイマーチングを完全に捨て去ります。3D Gaussian Splatting はシーンを数百万個の明示的な異方性ガウス分布で表現し、それらをリアルタイムにラスタライズします。
