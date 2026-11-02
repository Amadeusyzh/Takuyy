---
layout: post
title: "グラフィックス研究のフロンティア 2026：SIGGRAPH、SIGGRAPH Asia と最新プレプリントの動向"
date: 2026-10-27 09:13:00+0900
description: "2026 年のグラフィックス研究（SIGGRAPH 2026、SIGGRAPH Asia 2026、EGSR、I3D、SCA、arXiv プレプリント）を、一次情報で確認しながらトピック別にまとめた地図です。繰り返し現れる 4 つのアイデアの数学と、インタラクティブなエクスプローラーも収録しています。"
categories: graphics
tags: [research, siggraph, survey, rendering, simulation, gaussian-splatting, holography]
series: graphics
series_order: 13
toc:
  sidebar: left
related_posts: false
---

## この回の読み方

これまでの 12 回では基礎を扱ってきました。[ベクトルと変換]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})に始まり、[パストレーシング]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})、[シミュレーション]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})、[ジオメトリ処理]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})、[微分可能レンダリング]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})までです。この回はこれまでと性格が異なり、**2026 年 11 月時点**で研究がどこまで進んでいるかを示す、日付つきの地図です。時間とともに古くなりますが、それが狙いです。学んできたアイデアが現在どのように押し広げられているかを示すスナップショットとして、そして、いまなら読める論文のリストとして読んでください。

この回の構成は次のとおりです。

- **8 つのトピック節**：各節で 5～6 件の研究を取り上げ、その分野がどこへ向かっているかを短くまとめます。各研究について、タイトル（arXiv ページ、DOI、プロジェクトページへのリンク付き）、筆頭著者、発表先と**状態**、月、そして問題設定・鍵となるアイデア・土台となる過去の回を数文で紹介します。
- **4 つの「ひとつのアイデアを深掘り」ボックス**：多くの論文に繰り返し現れるアイデアを、導出し、計算し、図にします。取り上げるのは、光線に沿った 3D ガウシアンの応答のピーク、制御変量（control variates）、IPC の接触バリア、位相のみのホログラムです。
- **インタラクティブなエクスプローラー**：同じリストを収めています。さらに、**分野横断のトレンド**の節と、自分で**グラフィックス研究を追いかける方法**の節があります。

状態は、このブログの規則に従って厳密に記します。

- **発表済み**：すでに開催された 2026 年の会議（たとえば 2026 年 7 月の SIGGRAPH 2026。論文は ACM TOG 45(4) または SIGGRAPH 2026 Conference Papers）で発表されたもの、またはジャーナルの号として刊行されたもの。
- **採択済み / 発表予定**：まだ開催されていない会議に採択されたもの。2026 年 11 月 2 日時点では、主に **SIGGRAPH Asia 2026**（2026 年 12 月 1～4 日、クアラルンプール）を指します。
- **プレプリント**：arXiv のみで、著者が発表先を示していないもの。プレプリントは査読を受けていないため、主張はより慎重に扱ってください。

すべての項目は一次情報で確認しています。arXiv のアブストラクトページ（タイトル、著者、コメント、ジャーナル参照）、DOI の Crossref レコード、または公式プロジェクトページです。arXiv のコメントと DOI のレコードが食い違う場合は、DOI のレコードを優先しました。要約中の数値は著者自身の主張であり、私が再現した結果ではありません。選択は私によるもので、幅広さと、このシリーズの学習者が追いかけやすい論文を重視しており、ランキングではありません。優れた論文の多くが含まれていません。

## 前提知識

- このシリーズの第 1～7 回。第 8～12 回は、ジオメトリ、アニメーション、微分可能レンダリングの節で役に立ちます。
- ニューラルの節では、[3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})と、[拡散モデルとフローマッチング]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})の基礎。
- コード片や図のスクリプト（`bin/figures/graphics/graphics_13.py`）を実行する場合は、NumPy を使える Python 環境。

## 1. 2026 年のカレンダー

グラフィックス研究は、いくつかの会議を中心に流れています。二大会議は **ACM SIGGRAPH**（北米、夏）と **SIGGRAPH Asia**（冬）です。これらの技術論文は、ジャーナル **ACM Transactions on Graphics（TOG）** か、**Conference Papers** のプロシーディングスのどちらかに掲載されます。その周囲に、ヨーロッパや専門分野の会議があります。**Eurographics**（論文は Computer Graphics Forum、CGF に掲載）、**EGSR**（レンダリング）、**HPG**（高性能グラフィックス）、**I3D**（インタラクティブ 3D とゲーム。論文は PACMCGIT、すなわち Proceedings of the ACM on Computer Graphics and Interactive Techniques に掲載）、**SCA**（アニメーションとシミュレーション）、**SGP**（ジオメトリ処理）、**Pacific Graphics** です。さらに、cs.GR カテゴリの **arXiv プレプリント**として最初に、あるいはそれだけで公開される研究も増えています。

| 会議 | 2026 年の日程 | 開催地 | 2026 年 11 月 2 日時点の状況 |
| --- | --- | --- | --- |
| Eurographics 2026 | 5 月 4～8 日 | ドイツ、アーヘン | 開催済み（CGF 45(2)） |
| I3D 2026 | 5 月 13～15 日 | アメリカ、サンフランシスコ | 開催済み（PACMCGIT 9(1)） |
| EGSR 2026 | 7 月 1～3 日 | フランス、ボルドー | 開催済み |
| SGP 2026 | 7 月 1～3 日 | スイス、ベルン | 開催済み |
| SCA 2026 | 7 月 8～10 日 | スペイン、バルセロナ | 開催済み（CGF 45(8)） |
| HPG 2026 | 7 月 17～19 日 | アメリカ、ロサンゼルス | 開催済み |
| SIGGRAPH 2026 | 7 月 19～23 日 | アメリカ、ロサンゼルス | 開催済み（ACM TOG 45(4) と Conference Papers） |
| Pacific Graphics 2026 | 10 月 | シンガポール | 開催済み |
| SIGGRAPH Asia 2026 | 12 月 1～4 日 | マレーシア、クアラルンプール | 開催前。採択論文が arXiv に公開され始めています |

{% include blog_figure.liquid path="assets/img/blog/graphics/13-venue-timeline.svg" caption="2026 年の各会議を月の軸（1 = 1 月）上に示した図です。塗りつぶしの棒はすでに開催された会議、斜線の棒（12 月の SIGGRAPH Asia）はこれからの会議です。赤い破線は今日、つまり 2026 年 11 月 2 日で、影つきの帯はこの回が対象とする 6 月から 11 月の arXiv プレプリントの期間です。太字の数字は、この回の研究のうち各会議に由来するものの件数です。SIGGRAPH 2026 が最多で、SIGGRAPH Asia 2026 の論文もすでにプレプリントとして見えています。" %}

このタイムラインは、この回の構成の理由を説明しています。SIGGRAPH 2026 の論文は 7 月に刊行されているため、最も確かな層です。SIGGRAPH Asia 2026 の論文は採択済みですが、会議は 1 か月先なので、著者による arXiv 版を通じて知ることになります。プレプリントは最も新しく、最も不確実です。

{% include blog_figure.liquid path="assets/img/blog/graphics/13-topic-status.svg" localized="true" caption="この回の 45 件の研究を、トピックと状態で分けた図です。緑：発表済み、青：採択済み / 発表予定（すべて SIGGRAPH Asia 2026）、オレンジ：プレプリントです。幾何とモデリング、およびファブリケーションとデザインは、ここではすべて SIGGRAPH 2026 の論文です。一方、光輸送とレンダリング、およびシミュレーションにはプレプリントが最も多く含まれます。これは分野の実態であると同時に、私の選択の反映でもあります。" %}

{% include blog_figure.liquid path="assets/img/blog/graphics/13-months.svg" localized="true" caption="同じ研究を月別に示した図です（会議論文は開催月、プレプリントは arXiv の月）。7 月の山は SIGGRAPH、EGSR、SCA によるもので、12 月は SIGGRAPH Asia です。破線は今日を表します。" %}

## 2. 一覧を探索する

下のエクスプローラーには、この回のすべての研究が収められています。行がトピック、列が 2026 年の月です。色がトピックを、形が状態を表します。塗りつぶしの円は発表済み、輪は採択済み / 発表予定、ひし形はプレプリントです。

<div id="fw-i18n" hidden data-all="すべて" data-topic="トピック" data-status="状態" data-published="発表済み" data-accepted="採択済み / 発表予定" data-preprint="プレプリント" data-hint="点またはタイトルをタップしてください。" data-count="{m} 件中 {n} 件" data-jump="本文のこの項目へ移動" data-today="今日" data-t-light="光輸送" data-t-neural="ニューラル表現" data-t-geometry="幾何" data-t-simulation="シミュレーション" data-t-animation="アニメーション" data-t-imaging="ディスプレイ" data-t-fabrication="ファブリケーション" data-t-generative="生成"></div>

{% include widget.liquid name="graphics-frontiers-explorer" height="640" caption="ボタンでトピックと状態を絞り込み、点（またはその下のリストのタイトル）をタップすると、その研究の要約、リンク、土台となる回が表示されます。キーボードでは、グラフにフォーカスして左右の矢印キーで、絞り込まれた研究を順に移動できます。赤い破線は 2026 年 11 月 2 日です。" %}

## 3. 光輸送とレンダリング

これまでの回の[パストレーサー]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})と [ReSTIR]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})は、どちらもモンテカルロ推定量です。レンダリング研究のほとんどは、次の 2 つのどちらかに関わっています。それらの推定量の分散を下げること、あるいは計算の一部を、評価がより安価な学習済みまたはフィットしたモデルで置き換えることです。2026 年には、どちらにも優れた例があります。

### ひとつのアイデアを深掘り：制御変量

**直観。** 積分 $I = \int f$ を推定しなければならないとき、$f$ に似ていて、積分 $G = \int g$ が正確にわかっている関数 $g$ があるなら、*差* $f - g$ だけをモンテカルロで推定し、あとから $G$ を足し戻します。差は小さくて滑らかなので、その推定ははるかにノイズが少なくなります。

**数式。** 領域（ここでは $[0,1]$）から一様に引いた $N$ 個のサンプル $X_i$ を使うと、係数 $\beta$ の制御変量推定量は次のようになります。

$$
\hat I_{\text{CV}} = \frac{1}{N}\sum_{i=1}^{N}\bigl[f(X_i) - \beta\, g(X_i)\bigr] + \beta\,G .
$$

$\mathbb E[g(X)] = G$ なので、これはどんな $\beta$ に対しても不偏です。分散は

$$
\operatorname{Var}[\hat I_{\text{CV}}] = \frac{1}{N}\left(\sigma_f^2 - 2\beta\,\operatorname{Cov}(f,g) + \beta^2\sigma_g^2\right),
$$

で、$\beta$ についての放物線になります。微分をゼロとおくと $\beta^* = \operatorname{Cov}(f,g)/\sigma_g^2$ が得られ、これを代入し戻すと $\operatorname{Var} = \sigma_f^2(1-\rho^2)/N$ となります。ここで $\rho$ は $f(X)$ と $g(X)$ の相関係数です。$g$ が $f$ によく追従するほど $\rho^2$ は 1 に近づき、より多くの分散が消えます。

**具体例。** $[0,1]$ 上の $f(x) = e^x$（$I = e-1 \approx 1.71828$）と $g(x) = 1 + x$（$G = 1.5$）を考えます。すると $\sigma_f^2 = \frac{e^2-1}{2} - (e-1)^2 \approx 0.24204$、$\sigma_g^2 = 1/12$、$\operatorname{Cov}(f,g) = \mathbb E[xe^x] - \tfrac12(e-1) = 1 - 0.85914 = 0.14086$ です。したがって $\beta^* \approx 1.690$、$\rho^2 \approx 0.9837$ になります。サンプル数 $N = 8$ のとき、通常の推定量の標準偏差は $\sqrt{0.24204/8} \approx 0.174$、制御変量推定量は $\sqrt{0.24204 \cdot 0.0163/8} \approx 0.022$ です。同じサンプル数で、分散がおよそ 60 分の 1 になります。

{% include blog_figure.liquid path="assets/img/blog/graphics/13-control-variate.svg" caption="左：被積分関数 $f(x)=e^x$ と、フィットした $\beta\approx1.69$ でスケールした制御変量 $\beta g(x)$。モンテカルロに残されるのは、両者の間の細い灰色の隙間だけです。右：各 $N=8$ サンプルによる独立な推定 4000 回のヒストグラム。通常の推定（紫）は破線の真値のまわりに大きく広がり、制御変量による推定（オレンジ）は細いスパイクになります。凡例の標準偏差は、上の具体例と一致します。" %}

レンダリングでは、$g$ がおもちゃの多項式であることはありません。隣接ピクセルや前フレームで見えている色（下の ReSTCV）、フィットした照明モデル、あるいはニューラルネットワークの予測（ニューラル制御変量の研究系統）になりえます。推定量も、それが効く理由も、上で見たものとまったく同じです。

### 論文

**[A Generalizable Light Transport 3D Embedding for Global Illumination](https://arxiv.org/abs/2510.18189)**：Bing Xu ら、*SIGGRAPH 2026 Conference Papers*、発表済み、2026 年 7 月。大域照明（global illumination, GI）のための学習ベースの近道の多くは、いまもパストレーサーやラスタライズされた照明バッファを入力として必要とします。この研究では、トランスフォーマーがシーンそのもの、すなわち幾何とマテリアルを持つ点群を 3D 埋め込み（embedding）にエンコードします。レンダリング時には、クロスアテンション（cross-attention）で近傍の埋め込み点を集めることで、クエリ点の照明を予測します。この埋め込みは、シーンをまたいで汎化し、ほかのレンダリングタスクにも適応できることを目指しています。[第 4 回]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})のレンダリング方程式と、[第 5 回]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})の GI の問題を土台にしています。
{: #fw-lt-embedding}

**[Gaussian Light Transport](https://arxiv.org/abs/2609.11430)**（[プロジェクト](https://patrick-attimont.com/projects/gaussian-light-transport/)）：Patrick Attimont ら、*SIGGRAPH Asia 2026 (Conference Track)*、採択済み、2026 年 12 月。GI の視点に依存しない部分を、位置・方向・法線・マテリアルにわたるガウシアンの混合として表現します。そのパラメータは、混合がレンダリング方程式を満たすようにフィットされます。つまり、Neural Radiosity の考え方に沿って、混合と輸送作用素を 1 回適用した結果との残差を最小化します。カリングの段階でフィットを扱いやすく保ち、混合の評価はリアルタイム表示に十分な速さです。この論文が興味深いのは、[3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})でおなじみのガウシアンというプリミティブを、写真へのフィットではなく、光輸送そのものを解くために使っている点です。[第 4 回]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})を土台にしています。
{: #fw-gaussian-lt}

**[Spatio-Temporal Control Variates with ReSTIR for Real-Time Rendering](https://doi.org/10.1145/3799902.3811113)**（[プロジェクト](https://hercier.github.io/restcv/)）：Zhong Shi ら、*SIGGRAPH 2026 Conference Papers*、発表済み、2026 年 7 月。ReSTIR は、輝度のようなスカラーのターゲットで選ばれたサンプルを 1 ピクセルあたり 1 つだけ保持します。そのため、色の異なる光源があるシーンでは、サンプル数が少ないときに色ノイズが現れます。この論文は制御変量、つまり上で導いた推定量そのものを加えます。隣接ピクセルや過去のフレームから蓄積した色の推定値を $g$ として使い、リザーバのサンプルは差だけを推定します。著者らは、わずかなコストで、色の分散がより低く安定したと報告しています。[第 6 回]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})の RIS とリザーバの仕組みを、直接拡張したものです。
{: #fw-restcv}

**[ToF ReSTIR: Time-of-Flight Rendering with Spatio-temporal Reservoir Resampling](https://arxiv.org/abs/2605.11536)**：Juhyeon Kim ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。飛行時間（time-of-flight）センサー（ライダー、ゲーテッドカメラ）は、光がどれだけ届くかだけでなく、いつ届くかも記録します。ReSTIR が隣接ピクセルのパスを再利用するとき、再利用されたパスは一般に光路長が異なるため、時間の制約が破れてしまいます。この論文は光路長を尊重するシフトマッピング（shift mapping）を設計し、過渡応答（transient）レンダリングや時間ゲートつきレンダリングでも、時空間的な再利用がインタラクティブな速度で働くようにします。[第 6 回]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})の「シフトマップ + ヤコビアン」という見方が、いかに柔軟になったかを示しており、ロボットや自動車向けのセンサーのシミュレーションにとって重要です。
{: #fw-tof-restir}

**[Neural Caching of Prefiltered Radiance for Specular Lighting](https://arxiv.org/abs/2610.11702)**：Dmitrii Klepikov ら、arXiv プレプリント、2026 年 10 月。ニューラル放射輝度キャッシュ（オンラインで学習され、間接光を保持するネットワーク。[第 6 回]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})）は、拡散光はうまく扱えますが、鋭いスペキュラーローブは苦手です。このプレプリントは、キャッシュを反射方向でインデックスし、ラフネスで*プリフィルタした*放射輝度で学習します。そのうえで、[第 4 回]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})のイメージベースドライティングでおなじみのスプリットサム近似（split-sum approximation）により、キャッシュを事前計算した BRDF テーブルと組み合わせます。著者らは、テストシーンで標準的なキャッシュよりもスペキュラーの品質が向上したと報告しています。
{: #fw-prefiltered-nrc}

**[Beyond Positional Encoding: A 5D Spatio-Directional Hash Encoding](https://arxiv.org/abs/2603.05079)**：Philippe Weier ら、arXiv プレプリント、2026 年 3 月。高速な放射輝度場の背後にあるエンコーディングである多重解像度ハッシュグリッド（[ニューラルレンダリング第 3 回]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})）は、位置に対してはよく働きますが、球面上の方向に対してはうまく働きません。この論文は、方向のための階層的な測地線グリッドを作り、空間のハッシュグリッドと組み合わせて 1 つの 5D エンコーディングにします。主な応用は、ニューラルな**パスガイディング**（path guiding）です。これは、光がどこから来るかを学習し、[第 5 回]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})のパストレーサーが重要な方向をより多くサンプリングするようにするものです。著者らは、同じサンプル数で分散が下がったと報告しています。
{: #fw-hash-5d}

**今後の方向性。** 3 つの方向が目立ちます。第 1 に、ReSTIR 系は、制御変量、パスガイディング、新しいシフトマッピングなど、古典的なモンテカルロの道具を取り込み続けています。第 2 に、「レンダラーの内部のニューラル」は具体的になりつつあります。汎用の MLP の代わりに、ひとつの部分問題に合わせたキャッシュ、エンコーディング、埋め込みが使われます。第 3 に、ガウシアンというプリミティブが、シーン表現から光輸送そのものへと広がっています。スペクトルやボリュームの輸送は[ボリューム編]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }})で、リアルタイム GI のシステムは[第 11 回]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }})で扱っています。

## 4. ニューラル・ハイブリッド表現

3D Gaussian Splatting（3DGS）は、何百万もの柔らかく視点依存の楕円体を、標準的なシーン表現にしました。2026 年の論文は、それらにグラフィックスらしい問いを投げかけます。*レイトレーシング*できるか。ソートをやめられるか。髪にはどのプリミティブが向くか。並行して、ニューラルネットワークがリアルタイムエンジンのマテリアルとテクスチャのパイプラインに入り込んでいます。

### ひとつのアイデアを深掘り：光線が 3D ガウシアンと出会う場所

3DGS のラスタライズは、各ガウシアンを 2D の楕円に投影します（[ニューラルレンダリング第 4 回]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})）。一方、レイトレーシングでは光線に沿って各ガウシアンを評価するため、歪んだカメラ、反射、二次レイを扱えます。ガウシアンのレイトレーサーが必ず答えなければならない問いは、*この光線に沿って、このガウシアンはどこで最も寄与し、その大きさはどれだけか*というものです。

**数式。** 平均 $\boldsymbol\mu$、共分散 $\Sigma$ のガウシアンの密度は $G(\mathbf x) = \exp\left(-\tfrac12 q(\mathbf x)\right)$ で、$q(\mathbf x) = (\mathbf x-\boldsymbol\mu)^\top\Sigma^{-1}(\mathbf x-\boldsymbol\mu)$ は二乗マハラノビス距離（Mahalanobis distance）です。光線 $\mathbf x(t) = \mathbf o + t\mathbf d$ 上では、$q$ は $t$ の 2 次式になります。

$$
q(t) = (\mathbf o + t\mathbf d - \boldsymbol\mu)^\top \Sigma^{-1} (\mathbf o + t\mathbf d - \boldsymbol\mu),
\qquad
\frac{dq}{dt} = 2\,\mathbf d^\top\Sigma^{-1}(\mathbf o + t\mathbf d - \boldsymbol\mu).
$$

微分をゼロとおくとピークが得られます。

$$
t^* = \frac{\mathbf d^\top\Sigma^{-1}(\boldsymbol\mu - \mathbf o)}{\mathbf d^\top\Sigma^{-1}\mathbf d},
\qquad
G_{\max} = \exp\!\left(-\tfrac12\, q(t^*)\right).
$$

$t^*$ は、通常の距離で $\boldsymbol\mu$ に最も近い光線上の点では*ありません*。ガウシアンの計量、つまり短い軸方向に空間を引き伸ばす計量で、最も近い点です。

**具体例。** $\boldsymbol\mu = \mathbf 0$、$\Sigma = \operatorname{diag}(4,1,1)$（標準偏差 2, 1, 1）、$\mathbf o = (-4,-1,0)$、$\mathbf d = (1,1,0)/\sqrt2$ とします。すると $\Sigma^{-1} = \operatorname{diag}(0.25,1,1)$、$\mathbf d^\top\Sigma^{-1}(\boldsymbol\mu-\mathbf o) = (0.25\cdot4 + 1)/\sqrt2 = 1.4142$、$\mathbf d^\top\Sigma^{-1}\mathbf d = 0.625$ なので、$t^* = 2.263$ です。その点は $(-2.4, 0.6, 0)$ で、$q = 0.25\cdot5.76 + 0.36 = 1.8$ となり、$G_{\max} = e^{-0.9} = 0.407$ です。ユークリッド距離で最も近い点（$t = \mathbf d\cdot(\boldsymbol\mu-\mathbf o) = 3.536$）では、$G = e^{-1.406} = 0.245$ にとどまります。

```python
import numpy as np

Sigma = np.diag([4.0, 1.0, 1.0]); Si = np.linalg.inv(Sigma)
mu = np.zeros(3)
o = np.array([-4.0, -1.0, 0.0]); d = np.array([1.0, 1.0, 0.0]) / np.sqrt(2)

t_star = d @ Si @ (mu - o) / (d @ Si @ d)
x = o + t_star * d - mu
print(t_star, np.exp(-0.5 * x @ Si @ x))      # 2.2627..., 0.4066...

t_e = d @ (mu - o)                             # closest point in Euclidean distance
y = o + t_e * d - mu
print(t_e, np.exp(-0.5 * y @ Si @ y))          # 3.5355..., 0.2451...
```

{% include blog_figure.liquid path="assets/img/blog/graphics/13-gaussian-ray.svg" caption="左：回転した異方的な 3D ガウシアン（その 1 シグマの楕円体）と、オフセットを増やしていく 3 本の平行な光線。四角が各光線の原点、点がそのピーク点 $t^*$ を示します。右：各光線に沿った応答 $G(\mathbf o+t\mathbf d)$ を、数式から計算したもの。各曲線は $t$ についての 1 次元ガウシアンで、その最大値は $t^*$（破線）にあります。ピークに記された値が $G_{\max}$ で、光線が短い軸に沿って通るため、オフセットとともに急速に小さくなります。" %}

同じ計算を 2 次元で試してみましょう。ウィジェットの初期状態は上の数値例そのもの（$\sigma_x = 2$、$\sigma_y = 1$、$\mathbf o = (-4,-1)$、方向 $(1,1)/\sqrt2$）なので、表示は $t^* = 2.26$、$G = 0.407$、ユークリッド距離での最近点は $t = 3.54$、$G = 0.245$ になります。

<div id="gr-i18n" hidden data-drag="四角（光線の始点）か丸（方向）をドラッグしてください。スライダーでガウシアンを回転・伸縮できます。" data-rot="回転" data-peak="ピーク" data-eucl="最近点" data-reset="リセット"></div>

{% include widget.liquid name="graphics-gaussian-ray" height="470" caption="紫：ピーク $t^*$ で、光線がガウシアンの等値楕円（紫の破線）に接する点です。灰色：通常の距離での最近点で、光線が平均を中心とする円（灰色の破線）に接する点です。下のグラフは光線に沿った $G$ です。ガウシアンを回転・伸縮させると 2 点が離れていく様子がわかります。一般には 2 点は異なり、一致するのは等方的なガウシアン、主軸に平行な光線、平均を通る光線といった特別な場合だけです。" %}

ガウシアンのレイトレーサーは、各ガウシアンを BVH 内の境界プロキシ（たとえば引き伸ばした正二十面体）で包み（[第 5 回]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})）、光線に沿ったヒットを集め、それぞれについて $G_{\max}$ と不透明度を評価し、ボリュームレンダリングとまったく同じように、奥行き順にアルファ合成します。以下の論文は、これを高速にすること、およびその代替手段についてのものです。

### 論文

**[GRay: Ray Tracing 3D Gaussians Near the Speed of Splats](https://arxiv.org/abs/2606.30869)**：Yohan Poirier-Ginter ら、*I3D 2026 (PACMCGIT 9(1))*、発表済み、2026 年 5 月。レイトレーシングされたガウシアンは、広角カメラや二次レイなど、ラスタライズにはできない効果を扱えますが、これまではスプラッティングよりずっと低速でした。GRay は、より高速なガウシアンのレイトレーサーです。この論文はまた、密な初期化が生むような、非常に多くの小さなガウシアンをシーンが含む場合には、レイトレーシングのほうがラスタライズより*スケールしやすい*と主張しています。著者らは、従来の 3DGRT より、レンダリングも最適化も数倍高速だと報告しています。[第 5 回]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})の BVH の内容を [3DGS]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})と結びつけます。
{: #fw-gray}

**[Gaussian Point Splatting](https://doi.org/10.1145/3811272)**（[プロジェクト](https://jorisar.nl/gaussian_point_splatting/)）：Joris Rijsdijk ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。標準的な 3DGS は、ガウシアンを奥行きでソートし、タイルごとにブレンドしなければならず、巨大なシーンへのスケーリングに難があります。この手法は代わりに、見えているガウシアンから、ピクセルサイズの*不透明な*点をランダムに引き、64 ビットのアトミックな深度テストで書き込みます。これは衝突の補正を伴う確率的な透明度（stochastic transparency）の一種です。ソートがないためコストの増え方が緩やかで、プロジェクトページでは、1 台の GPU で数億個のガウシアンがインタラクティブな速度で表示されています。[第 2 回]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})の可視性と z バッファの考え方を、スプラッティングに結びつけます。
{: #fw-gps}

**[Inverse Rendering for Modeling with Line Primitives](https://arxiv.org/abs/2609.00625)**（[プロジェクト](https://kenji-tojo.github.io/sa26-line-primitives/)）：Kenji Tojo ら、*SIGGRAPH Asia 2026 (ACM TOG)*、採択済み、2026 年 12 月。髪、毛皮、布はふわふわしています。サーフェスでは表現できず、ボリュームのガウシアンでは多くのプリミティブを費やします。この論文は、そうしたシーンを明示的な線分として再構成し、アンチエイリアシングのためにサブピクセルのグリッド上でラスタライズします。確率的な微分可能ラスタライザが、位置、属性、さらには接続関係に対する勾配を与えます。内容に合わせてプリミティブを選ぶ好例であり、[第 12 回]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})の勾配の道具を使っています。
{: #fw-line-primitives}

**[Neural Texture Compression using Hypernetworks](https://arxiv.org/abs/2606.26913)**：Laurent Belcour、*EGSR 2026*、発表済み、2026 年 7 月。ニューラルテクスチャ圧縮は、マテリアルのテクスチャを、小さな潜在グリッドと小さなデコーダネットワークとして保存します。多くの手法はマテリアルごとに個別の最適化を走らせる必要があり、コンテンツパイプラインが遅くなります。ここでは、ひとつの*ハイパーネットワーク*（hypernetwork、別のネットワークの重みを出力するネットワーク）が、入力テクスチャから直接、潜在変数とデコーダの重みの両方を予測します。著者は、マテリアルごとの最適化に近い品質と、複数のデコーダや超解像への拡張を報告しています。[第 3 回]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})のテクスチャパイプラインを土台にしています。
{: #fw-ntc-hyper}

**[A Hybrid Neural-Microfacet BRDF Model for Real-Time Rendering](https://arxiv.org/abs/2608.09604)**（[プロジェクト](https://ubisoft-laforge.github.io/world/hybridrdf)）：Louis De Oliveira ら、*EGSR 2026 (CGF)*、発表済み、2026 年 7 月。解析的なマイクロファセット BRDF は安価ですが、測定されたマテリアルへのフィットは完全ではありません。純粋なニューラル BRDF はよくフィットしますが、評価のコストが高くなります。このハイブリッドは、GGX マイクロファセットモデル（[第 4 回]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})）を保ったまま、その出力を補正する小さなネットワークを加えます。同じメモリ量で、著者らは従来のニューラルモデルより測定データへのフィットが良く、オーバーヘッドも控えめだと報告しています。解析的な部分がおなじみの構造（と重要度サンプリング）を保ち、ネットワークは残差だけを学習します。
{: #fw-hybrid-brdf}

**[Extracting Neural Materials from Images](https://arxiv.org/abs/2606.26715)**（[プロジェクト](https://nvlabs.github.io/neumatex/)）：Kim Youwang ら、arXiv プレプリント、2026 年 6 月。ニューラルマテリアルは、[第 4 回]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})のベースカラー / ラフネス / メタリックのパラメータより表現力が高いものの、写真からの復元は困難です。この手法はまず、フィードフォワードネットワークでアルベド、スペキュラーの潜在変数、不確実性マップを予測します。次に、微分可能パストレーサー（[第 12 回]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})）を通したテスト時最適化でそれらを洗練し、不確実性を使って正則化の強さを決めます。「学習した事前分布 + 物理ベースの洗練」というテンプレートになっています。
{: #fw-neumatex}

**今後の方向性。** ガウシアンは、グラフィックスパイプラインの第一級のプリミティブになりつつあります。レイトレーシングされ、ソート不要になり、あるいは線のようなより適したプリミティブに置き換えられます。視覚の側については[3DGS フロンティア編]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})が扱っています。エンジンの内部では、ニューラルな構成要素が*ハイブリッド*として入ってきています。古典的な構造（マイクロファセット BRDF、ブロック圧縮テクスチャ）に学習した補正を加えることで、性能を予測可能に保てます。[AI を扱うエンジン編]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})では、これらの構成要素が製品にどう入っていくかを追っています。

## 5. 幾何とモデリング

[ジオメトリ処理の回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})では、メッシュ、離散微分幾何、リメッシュ、陰関数サーフェスを扱いました。2026 年の幾何研究は、それらを使って 2 つのことをしています。専門家が必要だった作業（四角形レイアウト、CAD の編集）を学習で自動化すること、そして、幾何アルゴリズムを微分可能にしたり大幅に高速化したりするシステムを作ることです。

**[B-repLer: Language-guided Editing of CAD Models](https://arxiv.org/abs/2508.10201)**（[プロジェクト](https://yilinliu77.github.io/brepler.github.io/)）：Yilin Liu ら、*SIGGRAPH 2026 Conference Papers*、発表済み、2026 年 7 月。CAD モデルは境界表現（boundary representation, B-rep）、すなわち辺に沿って貼り合わされたトリムされたパラメトリックサーフェスとして保存されます。テキストによる編集には通常、構築履歴が必要ですが、それはしばしば失われています。B-repLer は、テキストの指示を、学習された潜在空間における B-rep そのものの編集に対応づけます。学習には、CAD ツールとマルチモーダル言語モデルで作った大規模なペアデータセットを使います。角柱状の形から自由曲面の B スプライン形状まで、履歴のない部品で動作します。[第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})のサーフェス表現を土台にしています。
{: #fw-brepler}

**[SQuadGen: Generating Simple Quad Layouts via Chart Distance Fields](https://arxiv.org/abs/2604.27329)**（[プロジェクト](https://youkang-kong.github.io/squadgen/)）：Youkang Kong ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。アーティストは、エッジループが少なく整った四角形メッシュを求めますが、自動の四角形リメッシュは複雑なレイアウトを生みがちです。この手法は、離散的な接続関係を予測する代わりに、サーフェス上に定義された連続的なフィールド、すなわちチャート距離場（chart distance field）で拡散モデルを学習し、そこからレイアウトを取り出します。著者らはさらに、ループを意識した単純さの指標を定義し、大規模なレイアウトのデータセットを収集しています。[第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})のリメッシュを土台にしています。
{: #fw-squadgen}

**[SAND: Spatially Adaptive Network Depth for Fast Sampling of Neural Implicit Surfaces](https://arxiv.org/abs/2604.25936)**：Chuanxiang Yang ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。ニューラルな符号付き距離場（signed distance field, SDF）は、サーフェスから遠い点や単純な領域では精度がずっと低くて済むにもかかわらず、あらゆるクエリにネットワーク全体で答えます。SAND は、MLP の隠れ層に早期終了（early-exit）の出力を取り付け、位置ごとに、評価をどの深さまで進める必要があるかを予測します。これにより、スフィアトレーシングとサーフェス抽出が高速化されます。古典的なレベルオブディテールの考え方を、[第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})と [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})のニューラルフィールドに適用したものです。
{: #fw-sand}

**[Points as Tori: Fast Pointwise Signed Distance for Point Clouds](https://doi.org/10.1145/3811385)**（[プロジェクト](https://nzfeng.github.io/research/PointsAsTori/index.html)）：Nicole Feng ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。向きつきの点群から符号付き距離を計算するには、通常、グリッドか大域的な求解が必要です。ここでは、各点に、事前学習されたネットワークで近傍にフィットさせた小さなトーラスを割り当てます。トーラスの符号付き距離は閉じた形で書け、点ごとの距離はカーネル平均でブレンドされるため、評価に離散化がまったく要りません。そのため、オフセットやブーリアン演算を、生のスキャンデータに直接適用できます。[第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})の陰関数サーフェスの考え方の巧みな応用です。
{: #fw-tori}

**[Iskra: A System for Inverse Geometry Processing](https://arxiv.org/abs/2602.12105)**：Ana Dodik ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。多くの幾何アルゴリズム（平均曲率流、パラメータ化、As-Rigid-As-Possible 変形）は、局所-大域（local-global）や ADMM ソルバーのような、高速な専用の反復法で解かれます。それらを*通して*最適化するには、通常、自動微分フレームワークで書き直すことになり、速度が失われます。Iskra は既存のソルバーをそのまま使い、随伴法（adjoint method）で後ろ向きパスを自動生成し、機械学習フレームワークにも接続できます。[第 12 回]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})の微分可能レンダリングの、幾何版にあたります。
{: #fw-iskra}

**今後の方向性。** 学習は、生の三角形ではなく、アーティストに向き合う幾何の*構造*（四角形のループ、CAD の特徴、縫製パネル）を対象にしています。同時に、システム面の工夫（随伴法、適応的な評価、閉形式の局所プリミティブ）が、古典的なジオメトリ処理を高速かつ微分可能に保ち、学習のループの中に組み込めるようにしています。

## 6. 物理ベースシミュレーション

[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})では、XPBD の布ソルバーを作り、剛体と流体を概観しました。2026 年の研究は、頑健性（決して破綻しない接触）、GPU 上での性能、そしてシミュレーション全体を通した勾配に向かっています。

### ひとつのアイデアを深掘り：IPC の接触バリア

Incremental Potential Contact（IPC）は、物体が決して互いに貫通しないことを保証します。そのために、時間ステップのエネルギーにバリアを加えます。このバリアは、2 つのプリミティブ（点-三角形または辺-辺）の間の距離 $d$ がゼロに近づくと際限なく大きくなり、活性化距離 $\hat d$ を超えると消えます。

$$
b(d) =
\begin{cases}
-(d-\hat d)^2 \ln\!\left(\dfrac{d}{\hat d}\right), & 0 < d < \hat d,\\[4pt]
0, & d \ge \hat d .
\end{cases}
$$

性質を確かめましょう。$b(\hat d) = 0$ かつ $b'(\hat d) = 0$ なので、バリアは滑らかに立ち上がります。$d \to 0$ では $-\ln(d/\hat d) \to \infty$ となるため、有効な状態から始まるラインサーチのどのステップも、$d = 0$ を越えることはできません。反発力は

$$
-b'(d) = 2(d-\hat d)\ln\!\left(\frac{d}{\hat d}\right) + \frac{(d-\hat d)^2}{d}.
$$

です。$\hat d = 1$ として数値で見ると、$b(0.5) = 0.25\ln 2 = 0.173$、$b(0.1) = 0.81\ln 10 = 1.865$、$b(0.01) = 0.9801\ln 100 = 4.513$ です。エネルギーは対数的にしか増えませんが、力は $\hat d^2/d$ のように増えます。

```python
import numpy as np

def barrier(d, dhat):
    return np.where(d < dhat, -(d - dhat) ** 2 * np.log(d / dhat), 0.0)

print(barrier(np.array([0.01, 0.1, 0.5, 2.0]), 1.0))   # about [4.513 1.865 0.173 0.]
```

{% include blog_figure.liquid path="assets/img/blog/graphics/13-ipc-barrier.svg" caption="左：2 通りの活性化距離 $\hat d$（点線）に対する IPC バリア $b(d)$。$\hat d$ を超えると厳密にゼロで、$\hat d$ で滑らかにつながり、$d\to0$ で際限なく増大します。右：反発力 $-b'(d)$ で、おおよそ $\hat d^2/d$ のように増えます。$\hat d$ を小さくすると、物体は互いを感じる前により近づけますが、その代償として問題が硬くなります。" %}

XPBD による貫通拘束の射影と比べると、バリアは接触を、滑らかな（硬いとはいえ）エネルギーに変え、ニュートン法で最小化できるようにします。その代償は、1 ステップあたり多数の接触ペアを伴う非線形求解であり、2026 年の研究の多くが GPU ソルバーとコード生成に向かっているのはそのためです。

### 論文

**[YASPS: A Symbolic Framework for Extensible, High-Performance IPC Simulation](https://arxiv.org/abs/2605.23088)**：Xuan Tang ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。高速な IPC ソルバーは通常、エネルギーとプリミティブの種類ごとに手書きされるため、新しいマテリアルや接触モデルを試すには GPU コードの書き直しが必要になります。YASPS は、ユーザーがエネルギーを記号的に記述できるようにし、ヘッセ行列のスパース性と圧縮レイアウトを自動で導出し、CUDA カーネルを JIT コンパイルします。例として、布、剛体と変形体の混合、ケージベースの変形が示されています。[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})を土台とし、[物理エンジン]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})とも関連します。
{: #fw-yasps}

**[Locality-Aware Automatic Differentiation on the GPU for Mesh-Based Computations](https://arxiv.org/abs/2509.00406)**：Ahmed H. Mahmoud ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。汎用の自動微分フレームワークは大域的な計算グラフを構築し、メッシュのエネルギーが、それぞれ少数の頂点にしか触れない小さな項の和であることを無視します。このシステムは、各要素をレジスタと共有メモリの中で前向きモードで微分し、勾配、疎なヤコビ行列、ヘッセ行列を GPU 上で直接組み立てます。その結果、布や弾性体のニュートン型ソルバーが、汎用のテンソルフレームワークより書きやすく、かつ高速になります。[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})と[第 12 回]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})に関連します。
{: #fw-mesh-ad}

**[DiffSurFlow: Efficient and Robust Differentiable Fluid Optimization via Surrogate Strategy on Flow Map](https://doi.org/10.1145/3811337)**（[プロジェクト](https://illusionarydream.github.io/DiffSurFlowPage/)）：Yuhao Quan ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。長い流体シミュレーションを微分すること（たとえば煙を目標の形に誘導するため）は、時間もメモリも高くつきます。著者らは、フローマップ（flow map）を介した時間ステップ間のつながりが、勾配の大部分を担っていることに着目しました。そのつながりを保ち、冗長な随伴計算を刈り込む代理勾配（surrogate gradient）を構築しています。これにより、逆向きの流体設計が安価で頑健になります。[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})の流体を、[第 12 回]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})の随伴法の考え方で拡張したものです。
{: #fw-diffsurflow}

**[Learnable Persistent Wrinkle Formation in Cloth Simulation](https://arxiv.org/abs/2609.13707)**：Deshan Gong ら、*SIGGRAPH Asia 2026*、採択済み、2026 年 12 月。実際の布は、着用や折りたたみのあとにもしわが残ります。これは弾塑性の効果であり、標準的な布のモデル（[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})の弾性バネや拘束のようなもの）では捉えられません。著者らは、100 種類を超える布を、繰り返しの負荷と除荷のもとで測定しました。そして、摩擦を含む微分可能な弾塑性の布モデルを、随伴法を使って測定曲線にフィットさせています。これによりシミュレートされた衣服は、現実的な永続的なしわを保てます。
{: #fw-wrinkles}

**[Curly Hair Simulation using Curly Finite Elements](https://arxiv.org/abs/2607.22103)**：Xinming Pei ら、arXiv プレプリント、2026 年 7 月。巻き毛や波打つ髪では、ストランド全体の動きが細かならせんや波と結合するため、多数の小さなロッド（rod）セグメントで解像するのはコストが高くなります。このプレプリントは、各ストランドを、要素が解析的な波またはらせんのディテールを持つロッドとしてモデル化します。曲げが波を、ねじりがらせんを駆動し、エネルギーの分割によって伸び、座屈、曲げを分離します。衝突には粗いプロキシと解析的なディテールを使い、ガイドストランドから密な髪へと補間します。[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})のロッドと拘束のモデルを拡張するものです。
{: #fw-curly-hair}

**[MPM Lite: Linear Kernels and Integration without Particles](https://arxiv.org/abs/2602.07853)**：Xiang Feng ら、arXiv プレプリント、2026 年 2 月。マテリアルポイント法（material point method, MPM）は、粒子とグリッドを組み合わせて、雪、砂など大変形する材料をシミュレートします（[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})）。陰的 MPM では、幅の広いカーネルで多数の粒子にわたって力を積分するため、1 回の求解が高価になります。MPM Lite は、粒子の状態を、ボクセルの六面体メッシュ上の固定された求積点に、コンパクトな線形カーネルで再サンプリングするため、力の計算と時間積分は粒子に一切触れません。その結果、標準的な非線形ソルバーと前処理で動作する、有限要素法に似たインクリメンタルポテンシャル形式が得られます。
{: #fw-mpm-lite}

**今後の方向性。** シミュレーションは*ソフトウェア基盤*へと変わりつつあります。記号的なエネルギー、コード生成、GPU 上の局所性を意識した自動微分です。測定データ（布の試験）と随伴法が、マテリアルモデルを手作業で調整する代わりにフィットさせるために使われています。同じソルバーはロボットシミュレータの内部にもあり、この節が[身体性 AI のシミュレーションプラットフォーム]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})とつながっているのはそのためです。

## 7. アニメーションとキャラクター

[アニメーションの回]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})では、スキニング、IK、モーションマッチング、物理ベースのキャラクターを扱いました。2026 年には、世界モデルの背後にある学習手法（拡散、自己回帰トランスフォーマー、大規模な事前学習）がキャラクターアニメーションに到達し、GPU シミュレーションによって、物理ベースのスキルを安価に学習できるようになっています。

**[ARDY: Autoregressive Diffusion with Hybrid Representation for Interactive Human Motion Generation](https://arxiv.org/abs/2607.08741)**：Kaifeng Zhao ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。オフラインのテキストからモーションへのモデルは制御しやすい一方、インタラクションには遅すぎます。オンラインのモデルは、制御と長距離の一貫性を失います。ARDY は、明示的なルート特徴と潜在的な身体埋め込みの上で、可変長の履歴を持つ 2 段階の自己回帰拡散トランスフォーマーにより、モーションをストリーミング生成します。運動学的な制約と新しいテキストプロンプトを、リアルタイムでその場で受け付けます。[第 9 回]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})と[拡散の基礎]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})を土台にしています。
{: #fw-ardy}

**[GPC: Large-Scale Generative Pretraining for Transferable Motor Control](https://arxiv.org/abs/2606.29148)**：Yi Shi ら、*SIGGRAPH 2026 Conference Papers*、発表済み、2026 年 7 月。物理ベースのキャラクターは通常、タスクごとに 1 つずつ学習され、コントローラは転用できません。GPC は、有限スカラー量子化（finite scalar quantization）を使ってモーションコードの離散的な語彙を学習し、同時に、コードをシミュレーション中の関節アクションに変換する強化学習のポリシーも学習します。そのうえで、GPT 型のトランスフォーマーが次のコードを予測するように学習されます。その結果、新しいタスクに適応できる、事前学習済みの生成的コントローラが得られます。これは、キャラクター向けの「基盤モデル」のレシピです。[ロボットのための強化学習]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})に関連します。
{: #fw-gpc}

**[InstantMimic: A High Performance System for Learning Physics-based Skills in Seconds](https://arxiv.org/abs/2609.09821)**：Ikjun Choi ら、*SIGGRAPH Asia 2026 Conference Papers*、採択済み、2026 年 12 月。GPU 物理を使っても、モーションクリップを模倣するようキャラクターを訓練するには、ソルバーの外側のオーバーヘッド（断片化したカーネルや CPU-GPU 間の通信）にハードウェアの多くが無駄に使われます。InstantMimic は、シミュレーション、環境ロジック、ポリシーの推論と更新を、GPU ネイティブな単一の実行フローで走らせます。著者らは、スキル 1 つあたり数秒の訓練時間を報告しており、これにより自動ハイパーパラメータ探索のようなことも現実的になります。[第 9 回]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})と[シミュレーションプラットフォーム]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})のシステム面にあたります。
{: #fw-instantmimic}

**[Skinned Motion Retargeting via Artifact-driven Kinematic Prior Refinement](https://arxiv.org/abs/2609.06517)**：Seokhyeon Hong ら、*SIGGRAPH Asia 2026 (Journal Track)*、採択済み、2026 年 12 月。リターゲティングは、アニメーションを、スケルトンや体型の異なるキャラクターに移すもので、ニューラルなリターゲティングは自己貫通（腕が胴体を突き抜けるなど）を残しがちです。この手法は、スケルトン間のモーション埋め込みを持つトランスフォーマーのオートエンコーダを学習します。洗練の段階では、*スキニングされたメッシュ*上で貫通を検出し、モーションから頂点へのヤコビアンを通して、それをモーションの補正に変換します。[第 9 回]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})のスキニングと IK を土台にしています。
{: #fw-retarget}

**[Generalized Audio-Driven Synthesis of Precise Drummer Motion](https://arxiv.org/abs/2608.19055)**：Álvaro G. Iñesta ら、*SCA 2026 (Best Paper)*、発表済み、2026 年 7 月。ドラム演奏には正確なタイミングとスティックの位置取りが求められ、従来の音声からモーションへの手法は、モーションマッチングや MIDI 入力に頼っていたため、実際の録音には汎化しにくいものでした。この拡散モデルは、スケルトンの整合性とスティックの精度という 2 つの損失を使います。専用に作ったデータセットで、実環境（in-the-wild）の音声向けの拡張を加えて学習されています。この論文はまた、打撃の正確さと音声-モーションの相関のための指標も提案しています。[第 9 回]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})を土台にしています。
{: #fw-drummer}

**[Multi-View Face and Gesture Animation with Dynamic Gaussians](https://arxiv.org/abs/2608.04722)**：Alireza Javanmardi ら、*SCA 2026 (CGF 45(8))*、発表済み、2026 年 7 月。アバターシステムは、頭部だけ（手は無視）か、全身だけ（顔や指のディテールは失われる）のどちらかを捉えがちです。このパイプラインは、顔と手を別々にモデル化し、パラメトリックな上半身メッシュと融合させ、見た目のためにメッシュに 3D ガウシアンを取り付けます。著者らはさらに、表情とジェスチャーを制御した、多視点の上半身キャプチャのデータセットも公開しています。[第 9 回]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})のスキニングされたメッシュを、[ガウシアンアバター]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})と組み合わせています。
{: #fw-face-gesture}

**今後の方向性。** キャラクターアニメーションは、大規模モデルのレシピに収束しつつあります。モーションをトークン化し、事前学習し、そのうえでテキスト、音声、制約を条件づけます。物理は、非常に高速な GPU シミュレータ上の強化学習を通じて入ってきます。古典的な道具（スキニングのヤコビアン、モーションマッチング）は、学習済みモデルの上の洗練と制御の層として生き残っています。

## 8. イメージングとディスプレイ

この節は AR と VR にとって重要です。ヘッドセットは、人間の視覚系によって消費される出力を持つレンダリングシステムなので、ディスプレイの光学と知覚がレンダリング問題の一部になります。光の*波面*を再現するため、本当のピント手がかりを示せるホログラフィックなニアアイディスプレイは、2026 年の強いテーマでした。

### ひとつのアイデアを深掘り：Gerchberg-Saxton による位相のみのホログラム

**直観。** ホログラフィックディスプレイは、空間光変調器（spatial light modulator, SLM）を使います。これは、コヒーレントなレーザー光をプログラム可能な位相 $\varphi$ だけ遅らせることができるものの、振幅は変えられないピクセルのスクリーンです。最も単純な（遠方場の）構成では、観察者に見える像は、SLM を出る場のフーリエ変換です。したがって、フーリエ変換が指定された*振幅* $A$ を持つような位相パターンが必要であり、像面の位相は自由に選べます。

**数式。** $\mathcal F$ を 2 次元フーリエ変換として、$\lvert\mathcal F\{e^{i\varphi}\}\rvert \approx A$ としたいとします。Gerchberg-Saxton 法は、2 つの面を交互に行き来し、それぞれの面で既知のことを課します。

$$
\varphi^{(k)} = \arg \mathcal F^{-1}\!\left\{A\,e^{i\psi^{(k-1)}}\right\},
\qquad
\psi^{(k)} = \arg \mathcal F\!\left\{e^{i\varphi^{(k)}}\right\}.
$$

最初のステップは、SLM での位相を保ち、SLM が位相しか表示できないので振幅を 1 にします。2 番目のステップは、像での位相を保ち、振幅を目標で置き換えます。各ステップは、その面で既知のことへの射影です。これが Gerchberg と Saxton（1972）のアルゴリズムで、今日の最適化ベースのホログラム生成の祖先です。

```python
import numpy as np

def gerchberg_saxton(A, iters, seed=0):
    psi = np.random.default_rng(seed).uniform(0, 2 * np.pi, A.shape)   # image-plane phase
    for _ in range(iters):
        phi = np.angle(np.fft.ifft2(A * np.exp(1j * psi)))   # phase-only SLM pattern
        R = np.fft.fft2(np.exp(1j * phi))                    # what the viewer sees
        psi = np.angle(R)
    return phi, np.abs(R) ** 2
```

{% include blog_figure.liquid path="assets/img/blog/graphics/13-hologram-gs.svg" caption="128 × 128 のターゲット（リングと十字）に対する、実際の Gerchberg-Saxton の実行結果。上段：ターゲットの強度 $\lvert A\rvert^2$、最終的な位相のみの SLM パターン $\varphi$（$-\pi$ から $\pi$ までの周期的なカラーマップ）、そして反復ごとの相対誤差（対数スケール）。下段：1 回、5 回、60 回の反復後に再構成された強度。形は 1 回の反復で現れますが、スペックルだらけです。誤差は最初の数回の反復で急速に下がり、その後は横ばいになって、スペックルが残ります。そのスペックルを取り除き、人が見るのと同じ形で評価することが、以下のホログラフィー論文の主題です。" %}

実際のシステムでは、近接場の伝搬（角スペクトル法）、3D コンテンツ、カメラで較正された光学系が加わり、Gerchberg-Saxton は損失に対する勾配降下法に置き換えられます。だからこそ、*損失の選択*（HoOPOE）と*光輸送*モデルの選択（HoloPathTracer）が研究課題になります。

### 論文

**[HoloPathTracer: Fast and Accurate Wave Path Tracing for Holography](https://arxiv.org/abs/2606.14173)**：Wenbin Zhou ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。計算機合成ホログラムは通常 2 段階で作られます。放射輝度（画像やレイヤー）をレンダリングし、そこから波を伝搬させます。この分割は、奥行きと視点の連続性を失い、光沢面や鏡のような面の扱いも不得手です。HoloPathTracer は、モンテカルロパストレーシングを使って、レンダリング方程式と波動伝搬の積分をまとめて解きます。パスを再利用して、複数の時間多重の位相ホログラムを安価に生成します。ハードウェアでの結果は、正しいデフォーカス、視点依存の見た目、反射を示しています。これは[パストレーシング]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})を波動光学に持ち込んだもので、[XR]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})のディスプレイを狙っています。
{: #fw-holopathtracer}

**[HoOPOE: A Holography-Optimized Perceptual ObjectivE function](https://arxiv.org/abs/2610.17474)**：Ethan Chen ら、*SIGGRAPH Asia 2026*、採択済み、2026 年 12 月。実際の SLM 上のホログラムにはスペックル（上の図に見える粒状のノイズ）が現れ、通常の画像の損失は、それが人にどれだけ見えるかを反映しません。著者らは、時空間周波数と色に対する人間の感度に基づき、ホログラフィー向けにパラメータを調整した損失を構築しています。3D シーンのホログラムを対象にしたユーザースタディでは、参加者は、これで最適化した結果を、次善の損失で最適化した結果より好みました。勾配ベースのホログラムパイプラインであれば、どれでも採用できます。知覚を考慮したレンダリングと、[XR]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})につながります。
{: #fw-hoopoe}

**[Dichoptic Foveation](https://arxiv.org/abs/2609.16385)**：Henry Kam ら、*SIGGRAPH 2026 Conference Papers*、発表済み、2026 年 7 月。フォビエイテッドレンダリング（foveated rendering）は、目の感度が低い周辺部で品質を下げるもので、通常は両目で同じように行います。この研究は、周辺部で左右の目に*異なる*周波数成分を見せ、一方の像をぼかし他方をシャープにして、脳が 2 つをどう融合するかを VR ヘッドセットで測定します。測定値は just-objectionable-difference（JOD）のスケールに変換され、知覚モデルでフィットされ、フォビエイテッドな 360 度動画に適用されます。このサイトの[ラボ]({{ '/' | relative_url }}#lab)のフォビエーションに両眼の手がかりを加え、[XR レンダリング]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})にもつながります。
{: #fw-dichoptic}

**[PAColorHolo: A Perceptually-Aware Color Management Framework for Holographic Displays](https://arxiv.org/abs/2601.14766)**：Chun Chen ら、*ACM TOG 45(2)*、発表済み、2026 年 3 月。ホログラフィックディスプレイは赤、緑、青のレーザーを混ぜるもので、*見た目に*正しい色を再現するのは意外に困難です。このフレームワークは、色空間変換、照明の適応制御、キャリブレーションで使うカメラの色応答のニューラルモデルを組み合わせています。シミュレーション、光学プロトタイプ、ユーザースタディで検証されています。カラーマネジメントは、[第 3 回]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})のシェーディングに始まる色のパイプラインの、ディスプレイ側の終端です。
{: #fw-pacolorholo}

**[Hybrid Foveated Path Tracing with Peripheral Gaussians for Immersive Anatomy](https://arxiv.org/abs/2601.22026)**：Constantin Kleinbeck ら、*IEEE VR 2026*、発表済み、2026 年 3 月。VR での医療ボリュームデータのパストレーシングは見た目が優れていますが、ヘッドセットには遅すぎます。一方、事前計算されたガウシアンスプラットは高速ですが、あらかじめ準備しておく必要があります。このシステムは、視線領域だけをパストレーシングし、周辺部では、素早く再構築され、中心窩のレンダリングから洗練されるガウシアン近似を表示します。奥行きに基づくリプロジェクションが遅延を隠します。[リアルタイムパストレーシング]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})と [3DGS]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})を、視線に連動する形で組み合わせています。
{: #fw-hybrid-foveated}

**今後の方向性。** ヘッドセット向けのレンダリングは、*知覚駆動かつ光学を意識したもの*になりつつあります。人間の視覚をモデルにした損失、両眼や視線に連動したレンダリング、物理ベースの波動光学です。AR/VR と HCI の研究者にとって、これらの論文はグラフィックスとユーザースタディの橋渡しになります。

## 9. ファブリケーションとデザイン

形状、シミュレーション、最適化のためのグラフィックス手法は、物理的な物体、すなわち 3D プリントされた部品、ニット、キリガミ、衣服の設計にも使われます。この節の研究はすべて SIGGRAPH 2026 の論文です。

**[AtomSlicer: Constant-Thickness Field-Aligned Non-Planar Slicing and Continuous Toolpaths for FFF](https://doi.org/10.1145/3811363)**（[プロジェクト](https://xavierchermain.github.io/publications/atom-slicer)）：Giovanni Cocco ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。フィラメント（FFF）プリンターは、通常、平らな層を印刷します。多軸プリンターは曲がった層に沿うことができ、強度と表面の品質が向上しますが、層はほぼ一定の厚さを保ち、ノズルは衝突を避けなければなりません。この手法は、部品上の向きと方向のフィールドから、各層内で連続し、層をまたいでもできる限り連続する、非平面の層とツールパスを構築します。また、設計が製造できない場合にはそれを報告します。[第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})のサーフェス上のフィールドを土台にしています。
{: #fw-atomslicer}

**[Surface Power Diagrams for Knit Singularity Placement](https://rahulmitra.xyz/projects/powerknit/)**（DOI [10.1145/3811401](https://doi.org/10.1145/3811401)）：Rahul Mitra ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。3D 形状を編み機で編むには「ニットグラフ」が必要で、その特異点（段が始まる、終わる、合流する場所）は慎重に配置しなければなりません。この論文は、パワーダイアグラム（power diagram、重み付きボロノイ図）を、修正した測地線の熱カーネルによって曲面メッシュに一般化します。Lloyd 型の反復で特異点を配置し、らせんのないニットグラフをより確実に得るための順序制約を加えます。試作されたサンプルで結果が示されています。[第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})の測地線とボロノイの考え方を土台にしています。
{: #fw-powerknit}

**[IsoGami: Rigid-Deployable Kirigami Materials From Isohedral Tilings](https://thomaszewski.com/projects/isogami/index.html)**（DOI [10.1145/3799902.3811127](https://doi.org/10.1145/3799902.3811127)）：Guo Han ら、*SIGGRAPH 2026 Conference Papers*、発表済み、2026 年 7 月。キリガミは、シートに切り込みを入れて、新しい形に展開できるようにします。*剛体展開可能*（rigid-deployable）な設計は、どのタイルも曲げることなく、単一の動きで開きます。この手法は、平面の等面タイリング（isohedral tiling）を、関節のトポロジーとタイルの形を変えながら系統的に探索します。リンク機構の解析によって、自由度がちょうど 1 の設計だけを残し、その展開をシミュレートします。インタラクティブなブラウザと 3D プリントされた試作品が論文に付属します。[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})の、力学を拘束で捉える見方に関連します。
{: #fw-isogami}

**[Shellular Metamaterial Design via Compact Electric Potential Parametrization](https://arxiv.org/abs/2511.04025)**：Tianyi Huang ら、*SIGGRAPH 2026 Conference Papers*、発表済み、2026 年 7 月。シェルベースのメタマテリアル、すなわち周期的な薄肉構造は、低密度でも強い一方、設計が難しく評価も高価です。ここでは、設計を数十個の電荷で記述し、それらが作る電位からシェルの形状を導きます。GPU 上の均質化（homogenization）パイプラインが、有効な弾性特性を素早く計算します。これらを合わせることで、目標の剛性に対するインタラクティブな設計と逆設計が可能になり、印刷した試作品で検証されています。陰関数サーフェス（[第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})）と弾性（[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})）を使っています。
{: #fw-shellular}

**[Learning Sewing Patterns via Latent Flow Matching of Implicit Fields](https://arxiv.org/abs/2601.17740)**：Cong Cao ら、*SIGGRAPH 2026 Conference Papers*、発表済み、2026 年 7 月。衣服は、縫い合わされた平らなパネルから作られ、パネルの数、形、縫い目は大きく異なるため、パターンの生成は厄介です。各パネルは、その境界の符号付き距離場と、縫い目の端点の符号なし距離場として、微分可能なメッシュ化を伴う潜在空間の中でエンコードされます。フローマッチングのモデルがパネルの集合を生成し、別のモジュールが縫い合わせを予測します。応用として、画像からのパターン推定、補完、フィット直しがあります。[第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})の陰関数フィールドを、[フローマッチング]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})と組み合わせています。
{: #fw-sewing}

**今後の方向性。** 計算によるデザインは、「与えられた設計をシミュレートする」ことから、「設計空間を探索または生成する」ことへと移り続けています。タイリング、電荷配置、パターンの潜在空間などです。それをインタラクティブにしているのは、GPU による高速な評価（均質化、シミュレーション）です。

## 10. 3D/4D 生成コンテンツ

3D の生成モデルは、世界モデルの側から[3D・4D 世界生成]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})で扱いました。グラフィックスの会議が加えるのは、制作現場が必要とするものです。トポロジーの良いネイティブなメッシュ、制御可能なガウシアン、部屋を尊重するレイアウト、シミュレーションやアニメーションが可能なアセットです。

**[Nexus: Native Mesh Generation with Diffusion](https://arxiv.org/abs/2607.13563)**：Hanxiao Wang ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。ほとんどのメッシュ生成器は、三角形をトークンとして自己回帰的に 1 つずつ出力するか、まずフィールドを生成してからメッシュを抽出するかのどちらかです。どちらもトポロジーに苦労します。Nexus は、*頂点*を、粗から細へのスパースな八分木ボクセルとして直接拡散させます。2 つ目の拡散モデルが頂点ごとの埋め込みを生成し、そこから接続関係がデコードされます。著者らは、自己回帰型や 2 段階型のベースラインより良い結果と、ブラインドの調査での 3D 実務者による支持を報告しています。メッシュ（[第 8 回]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})）を土台にしています。
{: #fw-nexus}

**[Generative 3D Gaussians with Learned Density Control](https://arxiv.org/abs/2605.16355)**：Runjie Yan ら、*SIGGRAPH 2026 Conference Papers*、発表済み、2026 年 7 月。生成的なガウシアンのモデルは、通常、プリミティブを固定グリッドや固定サイズの配列に置くため、空の領域や単純な領域に予算が無駄に使われます。ここでは、ガウシアンの中心が、八分木上の学習可能な密度からサンプリングされ、レンダリングによる教師で学習されます。潜在拡散モデルが、1 枚の画像からその表現を生成します。Sobol 列に基づくトークンのアンカリング手法が、拡散の学習を高速化します。プリミティブの数は、生成時に選べます。[3DGS]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})の高密度化の問題を、[拡散]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})と結びつけます。
{: #fw-triposplat}

**[CasLayout: Cascaded 3D Layout Diffusion for Indoor Scene Synthesis with Implicit Relation Modeling](https://arxiv.org/abs/2604.27361)**：Yingrui Wu ら、*SIGGRAPH 2026 (ACM TOG 45(4))*、発表済み、2026 年 7 月。生成された部屋は、壁、ドア、窓と、家具間のもっともらしい関係を尊重しなければならず、すべての物体間の密な関係グラフはノイズを加えてしまいます。この手法は、4 つの条件つき拡散段階を走らせます。物体の数とカテゴリ、サイズ、潜在的な関係、そして最後に向きつきバウンディングボックスで、建築が制約として与えられます。疎な関係グラフが制御を与えます。言語モデルと視覚言語モデルを使った、ゼロショットの画像からシーンへの生成もサポートしています。[3D 世界生成]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})に関連します。
{: #fw-caslayout}

**[SIMART: Decomposing Monolithic Meshes into Sim-ready Articulated Assets via MLLM](https://arxiv.org/abs/2603.23386)**（[プロジェクト](https://simart-mllm.github.io/)）：Chuanrui Zhang ら、*SIGGRAPH 2026 Conference Papers*、発表済み、2026 年 7 月。ロボットのシミュレータには、関節を持つ物体（扉のある戸棚、スライドする引き出し）が必要ですが、スキャンされた、あるいは生成されたメッシュは単一の塊です。SIMART は、ひとつのマルチモーダル大規模言語モデル（MLLM）を使って、メッシュをパーツに分割し、*同時に*その関節も予測することで、段階をまたいだ誤差の蓄積を避けます。スパースな 3D VQ-VAE が、トークン数を扱いやすい範囲に保ちます。論文では、ロボットシミュレーションでそのアセットを実演しています。これは、[身体性 AI のシミュレータ]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})と[エンジン]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})のためのアセット生成です。
{: #fw-simart}

**[R-DMesh: Video-Guided 3D Animation via Rectified Dynamic Mesh Flow](https://arxiv.org/abs/2605.13838)**（[プロジェクト](https://r-dmesh.github.io/)）：Zijie Wu ら、*SIGGRAPH 2026 Conference Papers*、発表済み、2026 年 7 月。ユーザーの静的なメッシュを、参照動画に従ってアニメーションさせる処理は、メッシュの初期ポーズが動画と異なると破綻します。VAE が入力を、基本メッシュ、相対モーション、開始ポーズを揃える学習済みの*補正*（rectification）オフセットに分解します。そのうえで、動画を条件とする rectified-flow の拡散トランスフォーマーが、メッシュのアニメーションを生成します。著者らは、50 万本を超えるシミュレートされたメッシュ系列のデータセットを構築しており、これはリターゲティングや 4D 生成もサポートします。[第 9 回]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})と [4D 生成]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})を土台にしています。
{: #fw-rdmesh}

**[GaussiAnimate: Rig Animatable Categories with Level of Dynamics](https://arxiv.org/abs/2604.08547)**：Jiaxin Wang ら、*SIGGRAPH Asia 2026*、採択済み、2026 年 12 月。ガウシアンやメッシュの系列として保存された動的な 4D キャプチャは、新しいポーズで再アニメーションするのが困難です。この手法は、系列を、スキニングウェイトつきの自由形式のボーンに圧縮し、正準形状から曲率に基づくスケルトンを抽出します。学習を使わない、パーツごとのモーションマッチングの段階が、既存のモーションを検索してブレンドし、新しいモーションを合成します。テンプレートが不要で、トポロジーの変化も扱えます。[第 9 回]({{ '/blog/2026/graphics-09-animation-and-characters/' | relative_url }})のスキニングとモーションマッチングを、[3DGS フロンティア]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})の動的ガウシアンと結びつけます。
{: #fw-gaussianimate}

**今後の方向性。** 「きれいな物体を生成する」ことから、「*使える*アセットを生成する」ことへと移りつつあります。トポロジーの良いネイティブなメッシュ、予算を制御できるプリミティブ、制約つきの部屋、そして関節があり、リギングされ、シミュレーションの準備が整った物体です。グラフィックスの会議は、生成モデルを、出力でパイプラインに何ができるかによって評価します。

## 11. 分野横断のトレンド

{% include blog_figure.liquid path="assets/img/blog/graphics/13-trend-map.svg" localized="true" caption="トレンドマップ：各線は、この回のトピック（左）を、その研究のひとつの前提知識を教えるブログの回（右）に結びます。線が太いほど研究の数が多いことを示します。G = グラフィックス、NR = ニューラルレンダリング、WM = 世界モデル、EA = 身体性 AI、GE = グラフィックスエンジンで、その後に回の番号が続きます。右側のノードの大きさは、リンクの総数です。シミュレーション（G07）、ジオメトリ処理（G08）、アニメーション（G09）が最もよく使われる基礎で、ほとんどすべてのトピックがグラフィックスのシリーズの外にも届いています。" %}

8 つの節を通して見ると、同じいくつかの力が繰り返し現れています。

1. **どこにでもあるニューラルなプリミティブ、ただしハイブリッドとして。** ガウシアンは、いまやレイトレーシングされ（GRay）、点としてスプラットされ（Gaussian Point Splatting）、光輸送の基底として使われ（Gaussian Light Transport）、アバターのメッシュに取り付けられます。ネットワークは、古典的なモデルへの*補正*として入ります。GGX BRDF にネットワークを加えたもの、ブロック圧縮テクスチャにデコーダを加えたもの、ReSTIR の推定量に制御変量を加えたものです。古典的な構造が、コストと振る舞いを予測可能に保ちます。
2. **微分可能性は基盤である。** Iskra（幾何ソルバー）、局所性を意識した自動微分（メッシュのエネルギー）、DiffSurFlow（流体）、随伴法でフィットされたしわのモデル、線プリミティブのラスタライザは、いずれも勾配を、論文ごとに導出し直すものではなく、システムが提供するものとして扱っています。これは、[第 12 回]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})のプログラムを、シミュレーションと幾何に持ち込んだものです。
3. **シェーダーとソルバーの中の機械学習。** ニューラルキャッシュ、ハイパーネットワークでデコードされるテクスチャ、ハイブリッド BRDF は、最新の GPU のテンソルハードウェア上で、ピクセルごとにリアルタイムで動くよう設計されています。[エンジンシリーズ]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})では、これらの構成要素が製品のエンジンにどう入るかを追っています。
4. **生成的事前分布が物理的制約と出会う。** 拡散とフローマッチングは、いまや四角形レイアウト、縫製パターン、メッシュ、部屋、モーションを生成しており、グラフィックスが加える価値は制約にあります。トポロジー、物理的な妥当性、縫い目、運動学、シミュレーションへの準備です。
5. **シミュレーションとレンダリングが収束し、どちらも身体性 AI を支える。** ToF ReSTIR はセンサーをシミュレートし、SIMART はシミュレーションに使えるアセットを作り、InstantMimic と GPC は物理ベースのスキルを大規模に訓練し、GPU の接触ソルバーはロボットシミュレータの中核です。これは、[世界モデル]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})や[身体性 AI]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})、そして[物理エンジン]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})への橋渡しです。
6. **知覚がレンダリングの一部になる。** 両眼分離（dichoptic）フォビエーション、ホログラフィー向けの知覚的な損失、知覚に基づくカラーマネジメントは、人間の視覚系をパイプラインの最終段として扱っています。これは、AR/VR システムを作るすべての人にとって重要なテーマです。

## 12. グラフィックス研究の追い方

この分野の動きは速いですが、情報源は安定しています。実践的な手順は次のとおりです。

- **Ke-Sen Huang の論文リスト**（[kesen.realtimerendering.com](https://kesen.realtimerendering.com/)）は、主要な会議ごとに、論文のタイトルと、著者のページ、PDF、動画、コードへのリンクを、公開されるたびに集めています。執筆時点では、SIGGRAPH、SIGGRAPH Asia（条件つき採択の論文）、Eurographics、I3D の 2026 年のページがあります。これが唯一最良の入り口です。
- **ACM TOG と ACM Digital Library**（[dl.acm.org/journal/tog](https://dl.acm.org/journal/tog)）で決定版を確認します。SIGGRAPH のジャーナルトラックの論文は各巻の 4 号に、SIGGRAPH Asia のものは 6 号に掲載され、カンファレンストラックの論文は別のプロシーディングスに掲載されます。**Crossref**（`api.crossref.org/works/<doi>`）は、DOI の発表先、巻、日付を確認する手軽でオープンな方法です。
- **arXiv cs.GR**（[arxiv.org/list/cs.GR/recent](https://arxiv.org/list/cs.GR/recent)）：「コメント」欄を読んでください。著者は通常そこに「Accepted to SIGGRAPH Asia 2026」と書き、そうした記載がなければ*プレプリント*です。関連研究は cs.CV や cs.LG にも現れます。
- **Eurographics Digital Library**（[diglib.eg.org](https://diglib.eg.org/)）で、CGF、EGSR、SCA、SGP、HPG の論文を確認します。
- **Technical Papers Fast Forward と動画。** SIGGRAPH と SIGGRAPH Asia は、それぞれ、全論文がごく短い紹介を行うファストフォワードのセッションで始まり、ほとんどの論文には補足動画があります。それらを見るのが、会議全体を俯瞰する最速の方法です。公式サイトは [s2026.siggraph.org](https://s2026.siggraph.org/) と [asia.siggraph.org/2026](https://asia.siggraph.org/2026/) です。
- **コース。** SIGGRAPH のコース（たとえば、長く続く *Physically Based Shading* や *Advances in Real-Time Rendering* のシリーズで、[blog.selfshadow.com](https://blog.selfshadow.com/) からリンクされています）は教えることを目的に書かれており、このブログから論文への最良の橋渡しです。
- **オープンソースのコード。** 多くの論文は、プロジェクトページから GitHub のリポジトリにリンクしています。月に 1 本、論文のコードを動かすほうが、10 本を流し読みするより多くを学べます。
- **輪読会。** ファストフォワードのセッションを週に 1 つ選び、論文を 1 本一緒に読み、図を 1 つ再現してみてください。この回の「ひとつのアイデアを深掘り」ボックスは、目指すべき深さの例です。

## 代表的な論文

この回の断面として、トピックごとに 1～2 件を挙げます。すべての項目について、2026 年 11 月時点の状態を併記しています。

| 論文 | 発表先 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Shi et al., *Spatio-Temporal Control Variates with ReSTIR for Real-Time Rendering* | SIGGRAPH 2026 Conference Papers | 2026 | [DOI](https://doi.org/10.1145/3799902.3811113) | ReSTIR の内部での制御変量。色ノイズを除去 |
| Kim et al., *ToF ReSTIR* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2605.11536) | 飛行時間レンダリングのための、光路長を考慮した再利用 |
| Poirier-Ginter et al., *GRay: Ray Tracing 3D Gaussians Near the Speed of Splats* | I3D 2026 (PACMCGIT 9(1)) | 2026 | [arXiv](https://arxiv.org/abs/2606.30869) | 高速なガウシアンのレイトレーシング |
| Rijsdijk et al., *Gaussian Point Splatting* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [DOI](https://doi.org/10.1145/3811272) | 巨大なシーンのための、ソート不要の確率的スプラッティング |
| Kong et al., *SQuadGen* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2604.27329) | チャート距離場上の拡散で、整った四角形レイアウトを生成 |
| Dodik et al., *Iskra: A System for Inverse Geometry Processing* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2602.12105) | 既存の幾何ソルバーのための自動的な随伴法 |
| Tang et al., *YASPS* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2605.23088) | 記号的で JIT コンパイルされる GPU 版 IPC |
| Zhao et al., *ARDY* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2607.08741) | リアルタイムで制御可能な自己回帰モーション拡散 |
| Zhou et al., *HoloPathTracer* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2606.14173) | ホログラムのためにパストレーシングと波動伝搬をまとめて解く |
| Kam et al., *Dichoptic Foveation* | SIGGRAPH 2026 Conference Papers | 2026 | [arXiv](https://arxiv.org/abs/2609.16385) | フォビエイテッド VR のための両眼の知覚モデル |
| Cocco et al., *AtomSlicer* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [DOI](https://doi.org/10.1145/3811363) | 多軸印刷のための、一定厚さの非平面スライシング |
| Wang et al., *Nexus: Native Mesh Generation with Diffusion* | ACM TOG 45(4) (SIGGRAPH 2026) | 2026 | [arXiv](https://arxiv.org/abs/2607.13563) | 頂点と接続関係を直接拡散させる |
| Zhang et al., *SIMART* | SIGGRAPH 2026 Conference Papers | 2026 | [arXiv](https://arxiv.org/abs/2603.23386) | 単一のメッシュから、シミュレーションに使える関節つきアセットを生成 |
| Attimont et al., *Gaussian Light Transport* | SIGGRAPH Asia 2026 (発表予定) | 2026 | [arXiv](https://arxiv.org/abs/2609.11430) | レンダリング方程式のソルバーとしてのガウシアン混合 |

## 学習リソース

- [Ke-Sen Huang の論文リスト](https://kesen.realtimerendering.com/)：SIGGRAPH、SIGGRAPH Asia、Eurographics、I3D の 2026 年のページ。
- [ACM Transactions on Graphics](https://dl.acm.org/journal/tog)と [Eurographics Digital Library](https://diglib.eg.org/)。
- [arXiv cs.GR の最新リスト](https://arxiv.org/list/cs.GR/recent)。
- SIGGRAPH 2026 の[技術論文プログラム](https://s2026.siggraph.org/program/technical-papers/)と、SIGGRAPH Asia 2026 の[技術論文ページ](https://asia.siggraph.org/2026/program/technical-papers/)。
- 4 つの「ひとつのアイデアを深掘り」ボックスについて：モンテカルロの分散低減については Veach の博士論文と PBRT（[pbr-book.org](https://pbr-book.org/)）、Li et al., *Incremental Potential Contact*（ACM TOG 39(4), 2020, [DOI](https://doi.org/10.1145/3386569.3392425)）、ホログラフィーについては Goodman, *Introduction to Fourier Optics*。
- 図のスクリプト `bin/figures/graphics/graphics_13.py` とデータファイル `bin/figures/graphics/data/13-frontiers.json`。論文が刊行されたら JSON を更新してスクリプトを再実行してください。エクスプローラーのウィジェットも同じフィールドを使っています。

## 演習

1. **制御変量。** 具体例で、$g(x) = 1+x$ を $g(x) = 1 + x + x^2/2$（$e^x$ の 2 次のテイラー多項式）に置き換えてください。$G$、$\beta^*$、分散の減少を、解析的に、または NumPy で計算してください。

   <details markdown="1"><summary>ヒント</summary>
   $G = 1 + \tfrac12 + \tfrac16 = 5/3$、$\sigma_g^2 \approx 0.1889$、$\operatorname{Cov}(f,g) \approx 0.2136$（$\mathbb E[x^2e^x] = e-2$ を使います）なので、$\beta^* \approx 1.131$、$\rho^2 \approx 0.9981$ です。残差の分散は $1+x$ の場合の約 9 分の 1、通常のモンテカルロのおよそ 500 分の 1 になります。
   </details>

2. **光線に沿ったガウシアン。** $q(t)$ が $t$ の下に凸な 2 次式であること、および $q(t^*) = q(0) - \frac{(\mathbf d^\top\Sigma^{-1}(\boldsymbol\mu-\mathbf o))^2}{\mathbf d^\top\Sigma^{-1}\mathbf d}$ であることを証明してください。そのうえで、コード片を使って数値的に確かめてください。

   <details markdown="1"><summary>ヒント</summary>
   $q(t) = a t^2 - 2bt + c$ と書きます。ここで $a = \mathbf d^\top\Sigma^{-1}\mathbf d > 0$、$b = \mathbf d^\top\Sigma^{-1}(\boldsymbol\mu-\mathbf o)$、$c = q(0)$ です。平方完成してください。
   </details>

3. **IPC バリア。** $b$ が $d = \hat d$ で 2 回連続微分可能であることを示してください。$d \to \hat d$ の下側からの極限で $b'$ と $b''$ を計算し、上側の値 $0$ と比較します。ニュートン法にとって、なぜこれが問題になるのでしょうか。

   <details markdown="1"><summary>ヒント</summary>
   $u = d - \hat d$ とすると、$b = -u^2\ln(1 + u/\hat d)$ です。対数を展開すると、$u = 0$ の近くで $b \approx -u^3/\hat d$ となるので、$b'$ と $b''$ はどちらも下側から 0 に向かい、バリアは $C^2$ です。ニュートン法はヘッセ行列を使うため、ペアが活性集合に入るときに $b''$ が飛ぶと、反復は停滞したり振動したりするでしょう。
   </details>

4. **ホログラフィー。** Gerchberg-Saxton のコード片を、好きなターゲットに対して 1、5、20、100 回の反復で実行し、誤差をプロットしてください。次に、ランダムな初期位相の代わりに*一定の*初期位相を使ってください。何が起こり、なぜランダムな位相が役に立つのでしょうか。

   <details markdown="1"><summary>ヒント</summary>
   位相が一定のとき、$\mathcal F^{-1}\{A\}$ はエネルギーのほとんどを、SLM の少数の低周波のピクセルに集めます。振幅を 1 に強制するとそのスペクトルが平坦になり、強いハイパスフィルタのように働きます。主にターゲットのエッジだけが残り、反復は停滞しがちです。ランダムな位相はエネルギーを SLM 全体に均等に広げるので、位相のみという制約による情報の損失が小さくなります。その代償がスペックルです。
   </details>

5. **分野を追いかける。** Ke-Sen Huang の SIGGRAPH Asia 2026 のページを開き、この回に含まれていない論文を 2 本選んで、arXiv または Crossref でその状態を確認し、トピック、月、土台となる回とともに `13-frontiers.json` に追加してください。図のスクリプトを再実行し、エクスプローラーを確認してください。

このグラフィックスのシリーズは、ひとまずこの回で締めくくりです。ここから先は、[グラフィックスエンジンのシリーズ]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})がこれらのアイデアがどのようにソフトウェアになるかを示し、[世界モデル]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})と[身体性 AI]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})のシリーズが、グラフィックスが学習するエージェントと出会う場所を示します。
