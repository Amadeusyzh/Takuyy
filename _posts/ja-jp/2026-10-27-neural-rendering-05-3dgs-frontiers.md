---
layout: post
title: "3DGS の先へ：Gaussian Splatting 研究フロンティアの地図"
date: 2026-10-27 12:05:00+0900
description: "3D Gaussian Splatting 以降に登場した研究の体系的なサーベイです：アンチエイリアシング、表面、動的シーン、圧縮、SLAM、フィードフォワード再構成、生成、リライティング、物理、セマンティクス、AR/VR について、各方向の核となるアイデアと代表的な論文を紹介します。"
categories: neural-rendering
tags: [3d-gaussian-splatting, survey, mip-splatting, 2dgs, 4dgs, slam, feed-forward, text-to-3d, physgaussian, vr]
series: neural-rendering
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 4 回]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})ではオリジナルの 3DGS 手法を扱いました。発表から 1 年も経たないうちに数百もの後続研究が現れ、現在ではガウシアンは新規視点合成（novel view synthesis）をはるかに超えた用途で使われています。ロボットの地図として、フィードフォワード（feed-forward）モデルや生成モデルの出力として、シミュレーションの粒子として、そして Web や VR ビューアのコンテンツ形式としてです。本記事は網羅的なリストではなく、**地図**です。各方向について、素の 3DGS のどの制約に取り組んでいるのか、核となる技術的アイデア（多くの場合は 1 つの式）、そして最初に読むべき 2〜3 本の代表的な論文を説明します。さらに知りたい場合は、シリーズ末尾のリーディングリストを活用してください。

この分野を整理する便利な方法は、論文が 3DGS パイプライン（pipeline）のどの部分を変更しているかで分類することです。

| パイプラインの段階 | 変更される部分 | 本記事で扱う方向 |
| --- | --- | --- |
| プリミティブ | 形状、次元、属性 | 表面（2D／平たいガウシアン）、動的（4D）、セマンティクス、リライティング |
| 投影とラスタライズ | フィルタリング、ソート、レイトレーシング | アンチエイリアシング、ポッピング、レイトレースされるガウシアン |
| 最適化 | 高密度化、正則化項、損失 | MCMC 高密度化、表面正則化、圧縮 |
| パラメータの出どころ | シーンごとの最適化 vs ネットワーク | SLAM、フィードフォワード再構成、生成 |
| その後に起こること | シミュレーション、編集、表示 | 物理、AR/VR |

下の図は同じ表を地図として描き、各段階の下に本記事で扱う代表的な論文を並べたものです。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-taxonomy.svg" localized="true" caption="3DGS パイプラインの 5 つの段階（左、上から下）と、それぞれを変更する後続研究です。右下の節番号は、本記事のどこで扱うかを示します。" %}

## 前提知識

- 3DGS 手法の全体：共分散、EWA 投影、ブレンディング、密度制御（第 4 回）。
- NeRF の後続研究（Mip-NeRF、NeRF-W；第 2 回）、および K-Planes（第 3 回）。
- SLAM とフィードフォワードモデルについて：カメラ姿勢（第 1 回）と、Transformer／拡散モデル（diffusion model）の基礎。

## 1. アンチエイリアシング：Mip-Splatting

**問題。** 3DGS はスクリーン空間で固定の $0.3\,I$ の膨張（dilation）を加えます（第 4 回の 2.1 節）。ある解像度で学習してずっと高い解像度でレンダリングする（ズームイン）と、学習時にサブピクセルだったガウシアンが細く高周波なアーティファクトになります。低い解像度でレンダリングする（ズームアウト）と、膨張は正規化なしにエネルギーを加えるため、すべてが太く明るすぎるように見えてしまいます。

**核となるアイデア。** **Mip-Splatting**（Yu, Chen, Huang, Sattler & Geiger, CVPR 2024）は 2 つのフィルタを使います。

- **3D 平滑化フィルタ**（3D smoothing filter）は、学習視点の最大サンプリングレートに基づいて各ガウシアンの周波数を制限します。ガウシアン $k$ について、それが見える学習カメラ $n$ にわたって $\hat\nu_k = \max_n f_n / d_{k,n}$（ピクセル単位の焦点距離を深度で割ったもの）とします。ガウシアンを分散 $s/\hat\nu_k^2$ の等方性（isotropic）ガウシアンと畳み込み、積分が保たれるように不透明度を再スケールします。

$$
\Sigma_k \leftarrow \Sigma_k + \frac{s}{\hat\nu_k^{2}}\, I,
\qquad
o_k \leftarrow o_k \sqrt{\frac{\lvert \Sigma_k \rvert}{\lvert \Sigma_k + \frac{s}{\hat\nu_k^{2}} I \rvert}} .
$$

  このフィルタはガウシアンの一部となるため、どの視点からも一貫して適用され、データが裏付けられる以上にガウシアンが細くなるのを防ぎます。
- **2D Mip フィルタ**（2D Mip filter）は、膨張を 1 ピクセルのボックスフィルタ（box filter）を近似する正規化ガウシアンで置き換えます。すなわち $\Sigma'_{2D} = \Sigma' + sI$ とし、$o$ に $\sqrt{\lvert\Sigma'\rvert / \lvert \Sigma' + sI\rvert}$ を掛けます。これによりズームアウト時のピクセル面積にわたる積分を模擬します。

下の図は、学習解像度でのフットプリント（footprint）が 0.2 画素しかない小さなガウシアン 1 個について、下のコードと同じ $s = 0.2$（3D）と $s = 0.1$（2D）で両方のフィルタを計算したものです。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-mip-footprint.svg" localized="true" caption="(a) 学習時に幅 0.2 画素だったガウシアンを縮小（m < 1）・拡大（m > 1）して描画したときの画面上のサイズ。+0.3 I の膨張（赤）では、縮小しても約 0.55 画素より小さくならず、拡大すると元のガウシアンと同じ細さになります。Mip-Splatting（青）は縮小時に 1 画素の箱型フィルタに近づき、拡大時も学習時のサンプリングレートが許す以上には細くなりません。(b) 膨張はエネルギーも増やします（m = 1 で 8.5 倍、縮小するとさらに大きい）。縮小した 3DGS の描画が太く明るく見えるのはこのためで、正規化された 2D Mip フィルタはこれを 1 に保ちます。" %}

```python
import numpy as np

def max_sampling_rate(means, cams):
    """nu_k = max over training cameras that see Gaussian k of focal / depth (pixels per world unit)."""
    nu = np.zeros(len(means))
    for R, t, f, W, H in cams:
        Xc = means @ R.T + t
        z = Xc[:, 2]
        u, v = f * Xc[:, 0] / np.maximum(z, 1e-6) + W / 2, f * Xc[:, 1] / np.maximum(z, 1e-6) + H / 2
        visible = (z > 0.2) & (u >= 0) & (u < W) & (v >= 0) & (v < H)
        nu = np.where(visible, np.maximum(nu, f / np.maximum(z, 1e-6)), nu)
    return nu

def smooth_3d(Sigma, opacity, nu, s=0.2):
    """Mip-Splatting 3D smoothing: convolve each Gaussian with an isotropic Gaussian of
    variance s / nu^2 and rescale opacity so that the integral stays the same."""
    add = (s / np.maximum(nu, 1e-6) ** 2)[:, None, None] * np.eye(3)
    Sigma_f = Sigma + add
    scale = np.sqrt(np.linalg.det(Sigma) / np.linalg.det(Sigma_f))
    return Sigma_f, opacity * scale

def mip_filter_2d(cov2d, opacity, s=0.1):
    """Replace 3DGS's '+0.3 I' dilation by a normalized 2D filter approximating a 1-pixel box."""
    cov_f = cov2d + s * np.eye(2)
    return cov_f, opacity * np.sqrt(np.linalg.det(cov2d) / np.linalg.det(cov_f))
```

Mip-Splatting は、Mip-NeRF の積分位置エンコーディング（integrated positional encoding）の 3DGS 版です。どちらの場合も、点サンプルをフットプリントを考慮してローパスされたサンプルに置き換えています。計算コストは低く、gsplat ではオプションとして実装されています。撮影時とは異なる解像度でレンダリング結果を見る場合（VR ではそれが普通です）は、常に有効化を検討するとよいでしょう。

## 2. 表面とジオメトリ

**問題。** 3DGS が最適化するのは見た目であり、ジオメトリではありません。そのガウシアンは体積的な塊で、レイに沿った深度はうまく定義されず、法線は存在しません。不透明度に対してマーチングキューブ法（marching cubes）でメッシュを抽出すると、ノイズが多くでこぼこした表面になります。ロボティクス、物理、編集のいずれも表面を必要とします。

**核となるアイデア。**

- **SuGaR**（Guédon & Lepetit, CVPR 2024）は、ガウシアンが平たくなり表面上にうまく分布するよう促す正則化項を加えます。これにより表面付近の密度を SDF のような関数で近似できるようになります。次にレベルセット（level set）上のサンプルからポアソン再構成（Poisson reconstruction）でメッシュを抽出し、新しいガウシアンをメッシュの三角形に結び付けて共同で洗練することで、編集やアニメーションが可能なハイブリッド表現を得ます。
- **2D Gaussian Splatting**（Huang, Yu, Chen, Geiger & Gao, SIGGRAPH 2024）は、各プリミティブを向きを持つ平面ディスク（**サーフェル**、surfel）に縮退させます。これは 2 つの接ベクトル $\mathbf t_u, \mathbf t_v$ と 2 つのスケール $s_u, s_v$ を持ちます。ディスク上の点は $P(u,v) = \mathbf p_k + s_u \mathbf t_u u + s_v \mathbf t_v v$、法線は $\mathbf t_u \times \mathbf t_v$ であり、EWA の線形化の代わりに、各ピクセルのレイをディスクの平面と厳密に**交差**させることで、透視的に正しく視点に一貫した深度を得ます。2 つの正則化項がジオメトリを意識させます。1 つは各レイに沿って重みを集中させる深度歪み損失（depth-distortion loss、Mip-NeRF 360 由来）、もう 1 つはスプラットの法線をレンダリングされた深度マップから計算した法線に揃える法線一貫性損失（normal-consistency loss）です。メッシュはレンダリングした深度の TSDF 統合によって抽出します。
- **Gaussian Opacity Fields**（GOF）（Yu, Sattler & Geiger, ACM TOG / SIGGRAPH Asia 2024）は、レイとガウシアンの交差を通じて 3D ガウシアンから直接連続的な不透明度場を定義し、ガウシアンから導かれるグリッド上でマーチングテトラヘドラ法（marching tetrahedra）によって表面をレベルセットとして抽出します。これにより非有界なシーンを扱え、解像度をディテールに適応させられます。

下の図はこの違いを具体的に示します。2 台のカメラが、1 つのプリミティブ上の同じ点を見ています。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-surfel-vs-ellipsoid.svg" caption="左：薄い 3D ガウシアンでは、レイ上の深度はガウシアンがそのレイに沿って最大になる点で取ります（閉形式 $t^* = \mathbf d^\top\Sigma^{-1}(\boldsymbol\mu-\mathbf o) / \mathbf d^\top\Sigma^{-1}\mathbf d$）。オレンジとシアンのカメラから同じ点を狙ったレイは、異なる 3D 点で最大になり（黒い線分）、深度が視点に依存します。右：接ベクトル $s_u\mathbf t_u$、$s_v\mathbf t_v$ と法線 $\mathbf n$ をもつ 2DGS のサーフェル。各レイはその平面と厳密に交差させるので、2 台のカメラは同じ点を得ます。" %}

一般的な教訓は次のとおりです。ジオメトリが必要なら、深度と法線がきちんと定義されるプリミティブ（平たいガウシアンやディスク）を選び、幾何的な正則化を加えること。2DGS 風のサーフェルは、マッピングやロボティクスのパイプラインで一般的な選択肢になっています。

## 3. 動的シーン

**問題。** 3DGS は静的なシーンを前提としています。動く人や物体、変形するシーンでは、多視点動画、さらには単眼動画から、一貫性を保ちながら時間とともにガウシアンを変化させる必要があります。

下の図は、これがプリミティブ自体にとって何を意味するかを示します。各ガウシアンは同一性を保ったまま、時間とともに軌跡をたどります。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-dynamic-trajectories.svg" caption="正準空間（canonical space）のガウシアンにおもちゃの変形場（曲がっていく柱）を適用した例です。曲線は中心の軌跡で、t = 0（紫）から t = 0.5（黄）まで色分けしています。楕円体は同じガウシアンの t = 0、0.25、0.5 での姿で、局所的な変形に合わせて回転しています。フレームごとの追跡はこれらの位置と回転を直接最適化し、変形ネットワークは (x, t) から予測します。" %}

主に 4 つの設計があります。

1. **フレームごとの追跡。** **Dynamic 3D Gaussians**（Luiten, Kopanas, Leibe & Ramanan, 3DV 2024）は、色、不透明度、サイズを固定し、各ガウシアンの位置と回転を時間ステップごとに最適化します。その際、近傍間に**局所剛性**（local rigidity）の正則化項を課します。副産物として、対応点やオプティカルフローの教師なしに、シーンのあらゆる要素の密な 6 自由度（6-DoF）追跡が得られます。
2. **正準空間 + 変形ネットワーク。** **Deformable 3D Gaussians**（Yang et al., CVPR 2024）は、正準空間（canonical space）でガウシアンを学習し、時刻 $t$ においてそれらを変形させる MLP $\mathcal F_\theta(\gamma(\mathbf x), \gamma(t)) \mapsto (\delta\mathbf x, \delta\mathbf r, \delta\mathbf s)$ を学習します。学習には単眼動画を用います。
3. **正準空間 + 因数分解された場。** **4D Gaussian Splatting**（Wu et al., CVPR 2024）は、MLP を HexPlane 風の分解（第 3 回の K-Planes と同様に、$xy, xz, yz, xt, yt, zt$ 上の 6 枚の特徴平面）と小さなデコーダで置き換えます。これはより高速でコンパクトであり、論文ではリアルタイムレンダリング（合成データで $800\times800$ において 82 fps）が報告されています。
4. **ネイティブな 4D プリミティブ。** "Real-time Photorealistic Dynamic Scene Representation and Rendering with 4D Gaussian Splatting"（Yang et al., ICLR 2024）では、各プリミティブは $(x, y, z, t)$ 上のガウシアンです。時刻 $t$ でのレンダリングではそれを $t$ で**条件付け**し、平均が時間に対して線形に動き、不透明度が時間方向の周辺分布で変調される 3D ガウシアンを得ます。

$$
\boldsymbol\mu_{xyz\mid t} = \boldsymbol\mu_{1:3} + \Sigma_{1:3,4}\,\Sigma_{4,4}^{-1}(t - \mu_4),
\qquad
\Sigma_{xyz\mid t} = \Sigma_{1:3,1:3} - \Sigma_{1:3,4}\,\Sigma_{4,4}^{-1}\,\Sigma_{4,1:3},
\qquad
p(t) \propto \exp\!\Big(-\tfrac{(t-\mu_4)^2}{2\Sigma_{4,4}}\Big).
$$

```python
def slice_4d(mu4, Sigma4, t):
    """Condition a 4D (x, y, z, t) Gaussian on time t: returns the 3D mean, 3D covariance and the
    temporal marginal p(t) (unnormalized), as in native 4D Gaussian splatting."""
    S11, S12, S22 = Sigma4[:3, :3], Sigma4[:3, 3], Sigma4[3, 3]
    mu3 = mu4[:3] + S12 / S22 * (t - mu4[3])
    Sigma3 = S11 - np.outer(S12, S12) / S22
    p_t = np.exp(-0.5 * (t - mu4[3]) ** 2 / S22)
    return mu3, Sigma3, p_t
```

下の図は、$x$ と $t$ が相関した 4D ガウシアンに `slice_4d` を適用したものです。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-4d-slice.svg" caption="上：x と t の相関が 0.9 の 4D ガウシアンの $(x,t)$ 周辺分布。色付きの横線がスライスする時刻です。下：`slice_4d` で得た 1 次元のスライス。平均は破線に沿って線形に動き（速度 $\Sigma_{x,t}/\Sigma_{t,t}$）、条件付きの幅は一定（周辺分布の 0.6 に対して 0.26）で、ピーク $p(t)$ は $\mu_t = 0.5$ から離れると弱まります。つまりプリミティブは現れ、動き、消えていきます。" %}

関連する設計として、多項式による運動と回転、時間方向の放射基底（radial-basis）不透明度、SH の代わりのニューラル特徴を用いる **Spacetime Gaussians**（Li et al., CVPR 2024）や、関節構造やリグを持つモデルがあります。後者の例である **GaussianAvatars**（Qian et al., CVPR 2024）は、パラメトリックな顔モデルの三角形にガウシアンを取り付け、表情や頭部姿勢でそれらを直接駆動できるようにしています。単眼での動的再構成は依然として困難です。1 台の動くカメラでは速い非剛体運動を拘束できないため、優れたシステムは基盤モデル（foundation model）から得られる深度、オプティカルフロー、点の軌跡などの事前知識を加えています。

## 4. 圧縮と効率化

**問題。** 3DGS のシーンは数百 MB から 1 GB 以上になることも多く、その大部分は 48 個の SH 係数で占められ、冗長なガウシアンも多数含まれます。これはストリーミング、モバイル、VR には大きすぎます。

下の図は、非圧縮の float32 属性でそのバイトがどこに使われているかを数えたものです。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-memory.svg" localized="true" caption="上：float32 でのガウシアン 1 個あたりのバイト数（平均 3、スケール 3、クォータニオン 4、不透明度 1、さらに次数 L の SH 係数 3(L+1)^2 個）。次数 3 では 48 個の SH 係数が 236 バイト中 192 バイトを占めるため、SH をより低い次数へ蒸留する効果が大きいのです。下：ファイルサイズはガウシアン数に比例して増え、約 420 万個で 1 GB を超えます。" %}

手法の道具箱を、おおよそ積極性の順に並べると次のようになります。

- **重要度による枝刈り。** 各ガウシアンが学習視点にどれだけ寄与するか（例えば全ピクセルにわたって累積した $\alpha_i T_i$）でスコアを付け、最も役に立たないものを取り除きます。**LightGaussian**（Fan et al., NeurIPS 2024）は、このような枝刈りを低次数への **SH 蒸留**（SH distillation）およびベクトル量子化（vector quantization）と組み合わせ、より高いフレームレートとともに平均約 15 倍の圧縮を報告しています。
- **学習されるマスクとコードブック。** **Compact 3D Gaussian Representation**（Lee et al., CVPR 2024）は、学習中にガウシアンを取り除くマスクを学習し、視点依存の色をガウシアンごとの SH ではなくハッシュグリッドに格納し、ジオメトリ属性をベクトル量子化します。
- **構造化されたアンカー。** **Scaffold-GS**（Lu et al., CVPR 2024）は、特徴を持つ疎なアンカー（anchor）点を保存し、視線方向と距離で条件付けた小さな MLP で局所的なガウシアンをその場でデコードします。よりコンパクトで、視点依存の効果に対しても頑健です。
- **エントロピー符号化。** **HAC**（Chen et al., ECCV 2024）は Scaffold-GS を土台とし、二値化したハッシュグリッドをコンテキストとして用いてアンカー属性の分布をモデル化し、エントロピー符号化（entropy coding）を行います。素の 3DGS に比べて 75 倍以上のサイズ削減が報告されています。

実用的なフォーマットもこれに続いています。SuperSplat や Spark などのビューアは、オリジナルの `.ply` に加えて圧縮フォーマット（例えば SPZ や SOG）を読み込めます。速度面での主な工夫は、ガウシアン数を減らすこと（MCMC 方式の予算、枝刈り）、SH 次数を下げること、そしてラスタライザでの負荷分散を改善することです。

## 5. レンダリングの品質と正確さ

いくつかの論文はレンダラそのものの制約を修正しています。

- **ポッピング（popping）。** タイルごとにガウシアン中心でソートすると、回転時に順序が急に入れ替わります。**StopThePop**（Radl et al., ACM TOG / SIGGRAPH 2024）は、階層的なラスタライザでピクセルごとのソートを近似し、追加コストは平均約 4% にとどまります。さらに一貫性を強制することでガウシアン数を半分にできることも示しています。これは頭の回転が絶えず起こる VR で最も重要になります。
- **レイトレーシング。** **3D Gaussian Ray Tracing**（Moenne-Loccoz et al., SIGGRAPH Asia 2024）は、ガウシアンを BVH 内のバウンディングプリミティブで包み、ハードウェアレイトレーシングでレイを追跡します。これにより、歪みのあるカメラ（魚眼、ローリングシャッター）、反射や影のための二次レイ、そしてレイごとの厳密な順序付けが可能になりますが、多少の速度低下を伴います。
- **高密度化（densification）。** **3D Gaussian Splatting as Markov Chain Monte Carlo**（Kheradmand et al., NeurIPS 2024）は、ガウシアンをサンプル、更新を確率的勾配ランジュバン動力学（stochastic gradient Langevin dynamics）として解釈します。クローン／分割のヒューリスティクスを、「死んだ」ガウシアンの再配置と固定予算に置き換えることで、初期化に対してより頑健になります。

## 6. SLAM：地図としてのガウシアン

**問題。** ロボットやヘッドセットは、姿勢が未知のまま、フレームのストリームから*オンラインで*自己位置推定と地図作成を行う必要があります。古典的な密な SLAM は TSDF ボリューム、サーフェル、ニューラル場を使いますが、ガウシアンはフォトリアルかつ微分可能な地図を提供し、任意の姿勢から数ミリ秒でレンダリングできます。

**核となるアイデア。** **トラッキング**（tracking）と**マッピング**（mapping）を交互に行います。トラッキングでは地図を固定し、入力フレームと地図のレンダリング結果との間の測光（および深度）誤差を最小化して現在のカメラ姿勢を最適化します。マッピングでは姿勢を固定してキーフレーム上でガウシアンを最適化し、同時に地図が不完全な場所に新しいガウシアンを追加します。微分可能なラスタライズにより、どちらのステップも勾配ベースで行えます。

下の図は、このループをおもちゃの例で実行したときの上面図です。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-slam.svg" localized="true" caption="おもちゃの SLAM 実行の上面図（x が右、z が前方）。カメラ（オレンジの四角、視錐台は時刻で色分け）が部屋を横切ります。壁の各点は初めて地図に加わった時刻で色分けされ、灰色の点はまだ見えていません。トラッキングは固定した地図に対して新しい姿勢を推定し、マッピングは描画したシルエットが低い所にガウシアンを追加するので、地図はスイープに沿って広がっていきます。" %}

- **SplaTAM**（Keetha et al., CVPR 2024）は RGB-D 入力を対象とします。**シルエット**（silhouette、累積不透明度）をレンダリングして現在の地図がどのピクセルを説明できているかを把握し、そのピクセルだけをトラッキングに使います。そしてシルエットの値が低い場所や、地図の手前に新しいジオメトリが現れた場所で高密度化を行います。ガウシアンは等方的で視点に依存しない簡略版を用います。
- **Gaussian Splatting SLAM / MonoGS**（Matsuki, Murai, Kelly & Davison, CVPR 2024）は、**単眼**（monocular）カメラで動作する初めての手法です（RGB-D にも拡張できます）。リー群（Lie group）$SE(3)$ 上でカメラ姿勢に関するレンダリングの解析的なヤコビ行列を導出し、安定した逐次マッピングのためにガウシアンが等方的であり続けるよう正則化し、キーフレームのウィンドウを管理します。

身体性 AI（embodied AI）にとって、これは重要な架け橋です。ガウシアンの地図は、自己位置推定用の地図であると同時に、ロボットのカメラのためのフォトリアルなシミュレータでもあり、さらにセマンティック特徴を加えれば（10 節）、問い合わせ可能なシーン表現にもなります。

## 7. フィードフォワード再構成

**問題。** シーンごとの最適化には数分かかり、姿勢付きの多数の視点が必要です。ネットワークが 1 回の順伝播で、少数の画像からガウシアンを予測できないでしょうか。

**核となるアイデア。** **ピクセル整列ガウシアン**（pixel-aligned Gaussians）を予測します。各入力視点の各ピクセルについて、ネットワークはそのピクセルのレイに沿った深度（したがって 3D の平均）、共分散、不透明度、色を出力します。学習には大規模な多視点データセットを用い、取り置いたターゲット視点上で 3DGS と同じレンダリング損失を使います。

下の図は、1 枚の入力視点についてピクセル整列ガウシアンの幾何を示します。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-pixel-aligned.svg" caption="左：12 x 9 の入力画像の各画素 (u, v) がレイを飛ばし、予測された深度 $z_{uv}$ によって $z_{uv}K^{-1}(u,v,1)^\top$ にガウシアンが置かれます。オレンジは球面上、青はその後ろの壁の上です。右：球面上の 1 画素について、pixelSplat 風の深度ビン（depth bucket）上の分布の例。壁の位置に小さな第 2 のピークがあり、平均は回帰ではなくこの分布からサンプリングされます。" %}

- **pixelSplat**（Charatan, Li, Tagliasacchi & Sitzmann, CVPR 2024）は、**画像ペア**からシーンを再構成します。エピポーラ Transformer（epipolar transformer）がスケールの曖昧さを解消し、ネットワークは深度を直接回帰する代わりに、深度ビン上の確率分布を予測してそこからガウシアンの平均をサンプリングします。再パラメータ化トリック（reparameterization trick）を用いることで、勾配が確率へと流れるようにしています。
- **MVSplat**（Chen et al., ECCV 2024）は、ガウシアン中心の位置を特定するために**平面掃引コストボリューム**（plane-sweep cost volume、第 1 回の多視点ステレオを学習化したもの）を構築します。より幾何的なアプローチであり、pixelSplat の 10 分の 1 のパラメータ数で 2 倍以上高速に動作すると報告されています。
- **大規模再構成モデル**（large reconstruction model）の系譜は、Transformer でこれをスケールアップします。**LRM**（Hong et al., ICLR 2024）は、約 100 万個の物体で学習した 5 億パラメータの Transformer で、単一画像からトライプレーン（triplane）NeRF を予測します。**GS-LRM**（Zhang et al., ECCV 2024）は姿勢付き画像をパッチに分割（patchify）し、すべてのトークンに対して Transformer を実行して、ピクセルごとのガウシアンをデコードします。**LGM**（Tang et al., ECCV 2024）は、（多視点拡散モデルで生成した）4 枚の視点を非対称な U-Net で数秒のうちにガウシアンへ変換します。

姿勢不要（pose-free）の変種は、これらのアイデアを DUSt3R/MASt3R/VGGT 風のジオメトリネットワーク（第 1 回）と組み合わせ、姿勢情報のない写真をそのままスプラットに変換します。フィードフォワード再構成は、3D ワールド生成を構築する方法としてもますます使われるようになっています。生成器が画像や動画を生成し、再構成ネットワークがそれらをガウシアンへと持ち上げるのです。

## 8. 生成：テキストや画像からガウシアンへ

**問題。** 撮影データなしで 3D コンテンツを作成すること。

**核となるアイデア 1：スコア蒸留。** DreamFusion（第 2 回）は、3D 表現 $\theta$ を最適化し、そのレンダリング $\mathbf x = g(\theta)$ が固定されたテキストから画像への拡散モデル $\hat{\boldsymbol\epsilon}_\phi$ にとってもっともらしく見えるようにします。そのために用いるのが**スコア蒸留サンプリング**（score distillation sampling、SDS）の勾配です。

$$
\nabla_\theta \mathcal L_{\text{SDS}} = \mathbb E_{t, \boldsymbol\epsilon}\Big[ w(t)\,\big(\hat{\boldsymbol\epsilon}_\phi(\mathbf x_t; y, t) - \boldsymbol\epsilon\big)\, \frac{\partial \mathbf x}{\partial \theta} \Big],
$$

ここで $\mathbf x_t$ はノイズレベル $t$ でノイズを加えたレンダリング、$y$ はプロンプトです。$\theta$ としてのガウシアンは NeRF よりはるかに高速です。**DreamGaussian**（Tang et al., ICLR 2024）は、段階的な高密度化を行いながらガウシアン上で SDS を実行し、その後テクスチャ付きメッシュを抽出して UV テクスチャを洗練することで、数分でアセットを生成します。**GaussianDreamer**（Yi et al., CVPR 2024）は、3D 拡散モデルの粗い出力でガウシアンを初期化し、2D 拡散で洗練することで、3D の一貫性と 2D のディテールを両立させます。

**核となるアイデア 2：視点を生成してから再構成する。** 多視点拡散モデルが一貫した視点の集合を生成し、フィードフォワードモデル（LGM、GS-LRM、7 節）がそれをガウシアンに変換します。こちらのほうが高速で、SDS の過飽和も避けられます。さらにシーンにも拡張できます。動画やパノラマの生成器の後に再構成を行うことで、探索可能なガウシアンの世界が得られます。これは World Labs の Marble などのプロダクトの背後にあるアイデアであり、ホームページの「ガウシアンワールド」デモはこれを手続き的に模倣しています。

## 9. リライティングとインバースレンダリング

**問題。** 3DGS は撮影時のライティングを SH の色に焼き込んでしまうため、撮影した物体を新しい照明下に置くことができません。しかしそれこそが AR やコンテンツ制作で必要とされることです。

**核となるアイデア。** 各ガウシアンに**物理ベースの属性**（physically based attributes：法線、アルベド、ラフネス、メタリック）を与え、ライティングを明示的にモデル化（環境マップと可視性）したうえで、微分可能なシェーディングモデルでレンダリングします。本質的には PBR の記事で扱った BRDF の仕組みであり、ガウシアンごと、あるいは遅延（deferred）パスでピクセルごとに評価します。難しいのは法線（ガウシアンには法線がないため、最短軸やレンダリングした深度から導出します）と可視性です。

- **Relightable 3D Gaussians**（Gao et al., ECCV 2024）は、各ガウシアンに法線、BRDF パラメータ、入射光を付与し、物理ベースの微分可能レンダリングでそれらを分解します。可視性はガウシアン上の BVH を用いた**点ベースのレイトレーシング**（point-based ray tracing）で計算し、影を伴うリライティングを可能にしています。
- **GS-IR**（Liang et al., CVPR 2024）は、レンダリングした深度で法線を正則化し、間接照明を近似するために**遮蔽をボリュームに焼き込み**（bake occlusion）、未知の照明下でジオメトリ、マテリアル、ライティングを復元します。

「ガウシアンワールド」デモは逆のアプローチを取っています。そのガウシアンは写真から逆推定されたものではなく、アルベドと法線を持った状態で生成されているため、構成上、1 日のどの時間帯にもリライティングできます。

## 10. 物理、セマンティクス、編集

**物理。** ガウシアンは粒子なので、シミュレーションできます。**PhysGaussian**（Xie et al., CVPR 2024）は、各ガウシアンを物質点法（Material Point Method、MPM）による連続体シミュレーションの粒子として扱います。材料が局所的な変形勾配（deformation gradient）$\mathbf F$ で変形すると、共分散もそれに応じて変形し、

$$
\Sigma_t = \mathbf F_t\, \Sigma_0\, \mathbf F_t^\top ,
$$

SH 係数は $\mathbf F_t$ の回転成分によって回転されます。これにより、メッシュに変換することなく「見たものがそのままシミュレーションされる」ことになります。**VR-GS**（Jiang et al., SIGGRAPH 2024）は、**XPBD**（extended position-based dynamics、拡張位置ベース動力学）でシミュレーションされる四面体ケージ（tetrahedral cage）にガウシアンを埋め込み、リアルタイムな操作を可能にするインタラクティブな VR システムを構築しています。セグメンテーション、インペインティング（inpainting）、影にも対応しています。[インタラクティブラボ]({{ '/' | relative_url }}#lab)の XPBD 布シミュレーションのデモも、同じ系統のソルバを使っています。

下の図は、曲げとせん断の変形を受けるガウシアンの列にこの規則を適用したものです。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/05-physgaussian.svg" caption="左：変形前の格子上のガウシアン（2 シグマの楕円）。右：曲げとせん断の変形 $\phi$ を受けた後の同じガウシアン。各中心は $\phi$ で移動し、各共分散はその中心で計算した $\mathbf F = \partial\phi/\partial\mathbf x$ により $\mathbf F\Sigma_0\mathbf F^\top$ になるので、楕円は格子線と一緒に伸びて回転します。" %}

**セマンティクス。** ガウシアンに特徴を付与すると、シーンに問い合わせができるようになります。**LangSplat**（Qin et al., CVPR 2024）は、SAM の階層的なマスクで整理した CLIP の言語特徴を、シーン固有のオートエンコーダ（autoencoder）を通じてガウシアンごとの潜在特徴に蒸留します。これにより、NeRF ベースの言語場よりはるかに高速に、オープン語彙（open-vocabulary）の 3D クエリ（「マグカップはどこ？」）が可能になります。これはロボットが指示を 3D 地図に接地（grounding）させるために使える表現です。

**編集。** ガウシアンは明示的なので、選択、削除、変換、合成が簡単に行えます。SuperSplat などのツールはこれらをインタラクティブに提供しています。拡散モデルに導かれる編集手法では、テキストの指示で見た目やジオメトリを変更できます。

## 11. AR と VR

**ガウシアンが XR に向いている理由。** シンプルなラスタライザでフォトリアルな撮影結果を高フレームレートでレンダリングでき、ブラウザやスタンドアロン型ヘッドセットで動作し、メッシュ化やテクスチャのベイクも必要ありません。

**XR を難しくしているもの。**

- **フレーム予算。** モバイル GPU で片目あたり 72〜120 Hz のステレオレンダリングを行うと、ソートに加えて数百万個のガウシアンを処理するための時間は数ミリ秒しか残りません。そのため圧縮やガウシアン数の予算（4 節）、詳細度（level of detail）付きのストリーミングが不可欠です。Spark（World Labs）などの Web レンダラは、今ではデスクトップ、モバイル、VR にわたって、大規模なスプラットシーンを詳細度付きでストリーミングしています。
- **アーティファクトがより目立つ。** 絶え間ない頭の動きの下でのポッピング（5 節）、撮影時よりも視聴者が近づいたときのエイリアシング（1 節）、そして両目の間で一貫しない深度は、いずれも没入感を損ないます。Mip フィルタリングと一貫したソートが役立ちます。
- **フォービエイテッドレンダリング（foveated rendering）。** 周辺視野ではより少ない、あるいはより大きなガウシアンをレンダリングすることで、視力の低下を利用します。根底にあるアイデアについては、ラボのフォービエイテッドレンダリングのデモを参照してください。
- **インタラクションとリライティング。** 撮影した部屋に仮想物体を置くには、一貫したライティング（9 節）、正確な深度による遮蔽（2 節）、そして物理（10 節）が必要です。VR-GS はこれらを組み合わせた好例です。

HCI との境界領域の研究では、VR におけるスプラットの知覚的品質指標、数百万個のソフトなプリミティブを選択・編集するためのインタラクション手法、そして良好なカバレッジを得られるようユーザーを導く撮影インタフェース（第 6 回）などが未解決の課題です。

## 試してみよう

[インタラクティブラボ]({{ '/' | relative_url }}#lab)は本記事のいくつかの節と関係しています。ガウシアンワールド（レンダリング、および手続き的な代替による生成：8 節、リライティング可能なガウシアン：9 節）、XPBD 布シミュレーション（VR-GS が使う物理手法の系統：10 節）、フォービエイテッドレンダリング（11 節）です。

## 代表的な論文

| 論文 | 会議/論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Mip-Splatting: Alias-free 3D Gaussian Splatting (Yu et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.16493) | 3D 平滑化 + 2D Mip フィルタ |
| SuGaR: Surface-Aligned Gaussian Splatting (Guédon & Lepetit) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.12775) | メッシュ抽出とメッシュに結び付いたガウシアン |
| 2D Gaussian Splatting for Geometrically Accurate Radiance Fields (Huang et al.) | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2403.17888) | レイとスプラットの厳密な交差を持つサーフェル |
| Gaussian Opacity Fields (Yu, Sattler & Geiger) | ACM TOG (SIGGRAPH Asia) | 2024 | [arXiv](https://arxiv.org/abs/2404.10772) | 非有界シーンにおけるレベルセット表面 |
| Dynamic 3D Gaussians (Luiten et al.) | 3DV | 2024 | [arXiv](https://arxiv.org/abs/2308.09713) | フレームごとのガウシアン、密な追跡 |
| Deformable 3D Gaussians (Yang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2309.13101) | 正準空間 + 変形 MLP |
| 4D Gaussian Splatting for Real-Time Dynamic Scene Rendering (Wu et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2310.08528) | HexPlane による変形場 |
| Real-time Photorealistic Dynamic Scene Representation and Rendering with 4D Gaussian Splatting (Yang et al.) | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2310.10642) | 時間でスライスするネイティブな 4D プリミティブ |
| Spacetime Gaussian Feature Splatting (Li et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.16812) | 時間方向の不透明度、多項式による運動 |
| GaussianAvatars (Qian et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.02069) | 顔モデルにリグされたガウシアン |
| LightGaussian (Fan et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2311.17245) | 枝刈り + SH 蒸留 + 量子化 |
| Compact 3D Gaussian Representation for Radiance Field (Lee et al.) | CVPR | 2024 | [CVF](https://openaccess.thecvf.com/content/CVPR2024/papers/Lee_Compact_3D_Gaussian_Representation_for_Radiance_Field_CVPR_2024_paper.pdf) | 学習されるマスク、グリッドによる色、コードブック |
| Scaffold-GS (Lu et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.00109) | アンカーベースの構造化ガウシアン |
| HAC: Hash-grid Assisted Context for 3DGS Compression (Chen et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2403.14530) | アンカーのエントロピー符号化 |
| StopThePop (Radl et al.) | ACM TOG (SIGGRAPH) | 2024 | [arXiv](https://arxiv.org/abs/2402.00525) | 視点に一貫したソート、ポッピングなし |
| 3D Gaussian Ray Tracing (Moenne-Loccoz et al.) | ACM TOG (SIGGRAPH Asia) | 2024 | [arXiv](https://arxiv.org/abs/2407.07090) | BVH によるガウシアンのレイトレーシング |
| 3D Gaussian Splatting as Markov Chain Monte Carlo (Kheradmand et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2404.09591) | 原理に基づく高密度化 |
| SplaTAM (Keetha et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.02126) | RGB-D ガウシアン SLAM |
| Gaussian Splatting SLAM (Matsuki et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.06741) | 単眼ガウシアン SLAM |
| pixelSplat (Charatan et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.12337) | 画像ペアからのフィードフォワードなガウシアン |
| MVSplat (Chen et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2403.14627) | コストボリュームに基づくフィードフォワードなガウシアン |
| LRM: Large Reconstruction Model for Single Image to 3D (Hong et al.) | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2311.04400) | 大規模な Transformer による画像から 3D への変換 |
| GS-LRM (Zhang et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2404.19702) | Transformer からピクセルごとのガウシアンへ |
| LGM: Large Multi-View Gaussian Model (Tang et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2402.05054) | 多視点拡散 + U-Net でガウシアンへ |
| DreamGaussian (Tang et al.) | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2309.16653) | ガウシアン上の SDS、アセットあたり数分 |
| GaussianDreamer (Yi et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2310.08529) | 3D 拡散による初期化 + 2D 拡散による洗練 |
| Relightable 3D Gaussians (Gao et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2311.16043) | BRDF 分解 + 点ベースのレイトレーシング |
| GS-IR: 3D Gaussian Splatting for Inverse Rendering (Liang et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.16473) | 法線、焼き込んだ遮蔽、マテリアル |
| PhysGaussian (Xie et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.12198) | ガウシアンの MPM シミュレーション |
| VR-GS (Jiang et al.) | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2401.16663) | VR におけるインタラクティブで物理を考慮したガウシアン |
| LangSplat (Qin et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.16084) | ガウシアン上のオープン語彙言語場 |

## 学習リソース

- 上記のほとんどの論文の公式コードは、それぞれの arXiv ページからリンクされています。[gsplat](https://github.com/nerfstudio-project/gsplat) は、そのうちのいくつか（Mip-Splatting のフィルタ、MCMC 高密度化、2DGS のラスタライズ）を 1 つの API の背後に実装しています。
- ニュースサイト [radiancefields.com](https://radiancefields.com/) は、Gaussian Splatting の新しい論文、ツール、プロダクトを追いかけています。
- 本サイトのリポジトリにあるリーディングリスト `docs/reading-lists/neural-rendering.md` は、論文を段階ごとに分類しています。
- 9〜10 節のグラフィックスの背景については、グラフィックスシリーズの PBR とシミュレーションの記事を参照してください。

## 演習

1. 共分散 $\Sigma$（ピーク 1、不透明度 $o$）のガウシアンを分散 $v$ の正規化された等方性ガウシアンと畳み込むと、共分散 $\Sigma + vI$、ピーク $o\sqrt{\lvert\Sigma\rvert/\lvert\Sigma+vI\rvert}$ のガウシアンになることを示してください。これが Mip-Splatting における不透明度の再スケーリングです。
2. `slice_4d` を数値的に検証してください。ランダムな 4D ガウシアンからサンプリングし、$\lvert t - t_0\rvert < \varepsilon$ を満たすサンプルを残して、その平均と共分散を式と比較します。
3. 第 4 回の PyTorch レンダラで、`+ 0.3 * I` の膨張を `mip_filter_2d` に置き換え、学習解像度の $0.5\times$ と $4\times$ でレンダリング結果を比較してください。
4. 第 4 回のレンダラを使って SplaTAM 風のトラッキングステップを組み立ててください。ガウシアンを固定し、カメラの回転（軸角表現）と並進を学習可能にして、摂動させた姿勢からレンダリングしたターゲット画像に対する L1 を最小化します。
5. 方向を 1 つ選び、その代表的な論文 2 本を読んでください。それぞれがどのような問題を解決しているか、その鍵となる式、そして失敗例を 1 つ、半ページの要約にまとめてください。

**次回：** [第 6 回]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})は実践編です。自分でシーンを撮影し、COLMAP を実行し、スプラットを学習させて、Web と VR で見てみます。
