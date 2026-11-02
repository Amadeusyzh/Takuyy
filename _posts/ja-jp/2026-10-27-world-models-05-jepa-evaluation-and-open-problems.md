---
layout: post
title: "生成ではなく予測を？JEPA、世界モデルの評価、そして未解決の課題"
date: 2026-10-27 15:05:00+0900
description: "LeCun が示す自律的機械知能への道、I-JEPA、V-JEPA と V-JEPA 2、予測型対生成型の論争、世界モデルの評価方法（物理、制御可能性、プランニング）、そして身体性AI へとつながる未解決の課題。"
categories: world-models
tags: [world-models, jepa, self-supervised-learning, evaluation, planning]
series: world-models
series_order: 5
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 3 回]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})と[第 4 回]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})では、ピクセル、トークン、あるいは明示的な 3D シーンを*生成する*世界モデルを扱いました。シリーズ最終回となる本記事では、それに対する最も有力な反対の立場を取り上げます。すなわち、知的なエージェントの世界モデルは**抽象的な表現空間で予測**すべきであり、すべてのピクセルを再構成する必要はない、という考え方です。これが Yann LeCun の結合埋め込み予測アーキテクチャ（joint-embedding predictive architecture, JEPA）の背後にあるアイデアです。続いて、この分野のすべての研究者が答えなければならない問い、**世界モデルが良いものかどうかをどうやって知るのか**を考えます。最後に未解決の課題を挙げ、次のシリーズである身体性AI（embodied AI）への橋渡しをします。

## 前提知識

- 本シリーズの第 1〜4 回、特に[第 1 回]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})での Dreamer と MuZero の対比（すべてを再構成するか、重要なものだけを予測するか）。
- 自己教師あり学習（self-supervised learning）の基礎：シャムネットワーク（Siamese networks）、対照学習（contrastive learning）、表現の崩壊（representation collapse）の問題、指数移動平均（exponential moving average, EMA）によるターゲットネットワーク。

## 1. LeCun の「A Path Towards Autonomous Machine Intelligence」

2022 年 6 月、LeCun は長いポジションペーパー（position paper）[「A Path Towards Autonomous Machine Intelligence」](https://openreview.net/forum?id=BZ5a1r-kVsf)（バージョン 0.9.2、OpenReview にて公開）を発表しました。この論文は、微分可能なモジュールからなる認知アーキテクチャ（cognitive architecture）を提案しています。

| モジュール | 役割 |
| --- | --- |
| コンフィギュレータ（Configurator） | 目の前のタスクに合わせて他のモジュールを設定する（実行制御） |
| 知覚（Perception） | センサーから世界の現在の状態を推定する |
| 世界モデル（World model） | 将来の世界の状態を予測し（想像した複数の行動系列について行うこともある）、欠けている情報を補完する |
| コスト（Cost） | 変更不可能な**内在的コスト**（intrinsic cost。「痛み」や好奇心のような動因）と、将来の内在的コストを予測する学習可能な**クリティック**（critic） |
| 短期記憶（Short-term memory） | 過去の状態と予測された状態、およびそれらのコストを保存する |
| アクター（Actor） | 行動系列を提案する |

エージェントは 2 つのモードで行動できます。**モード 1** は反応的なモードで、知覚の結果がそのまま方策に入力されます。**モード 2** は熟慮的なプランニングで、アクターが行動系列を提案し、世界モデルがそれを展開し、コストモジュールが予測された状態を評価し、総コストを最小化するように勾配降下や探索で行動を最適化します。これはモデル予測制御（model-predictive control, MPC）によく似ています。Dreamer が想像をアクターへ蒸留するのと同様に、モード 2 の結果はモード 1 の方策へ蒸留できます。

図は 6 つのモジュールとモード 2 のループを配置したものです。

{% include blog_figure.liquid path="assets/img/blog/world-models/05-architecture.svg" localized="true" width="85%" caption="LeCun が提案したアーキテクチャ。知覚モジュールが現在の状態 $s_0$ を推定し、アクターが行動系列を提案し、世界モデルが将来の状態 $\hat s_k$ を予測し、コストモジュールがそれを評価し、短期記憶が状態とコストを保持します。モード 2 では行動を総コストに対して最適化します（赤の破線）。これは学習したモデルを使ったモデル予測制御です。コンフィギュレータ（点線）は課題に合わせて全モジュールを設定します。" %}

この論文の中心的な技術的主張は、*世界モデルをどのように学習すべきか*に関するものです。世界は部分的にしか予測できません。風に揺れる木の葉 1 枚 1 枚の正確な位置は予測できないのです。ピクセルを出力しなければならない生成モデルは、そうした無関係なランダム性をすべてモデル化するか、それを平均化する（ぼやける）かのどちらかを強いられます。LeCun はその代わりに、両立する組 $(x, y)$ に低いエネルギーを与えるよう学習される**エネルギーベースモデル**（energy-based models）を提唱します。ここで $x$ は観測された過去、$y$ は未来です。さらに、予測不可能な詳細を捨てられる**学習された表現空間の中で**予測を行うことを主張しています。

### 1.1 JEPA

**結合埋め込み予測アーキテクチャ**は $x$ と $y$ の両方を符号化し、$x$ の埋め込みから $y$ の*埋め込み*を予測します。必要に応じて、$x$ からは決まらない部分を表す潜在変数 $z$（あるいは行動 $a$）を加えます。

$$
s_x = \mathrm{Enc}_x(x),\qquad s_y = \mathrm{Enc}_y(y),\qquad
E(x, y, z) = D\big(s_y,\ \mathrm{Pred}(s_x, z)\big).
$$

生成モデルと並べると、違いは損失をどこで計算するかにあります。

{% include blog_figure.liquid path="assets/img/blog/world-models/05-jepa-vs-generative.svg" localized="true" caption="左：生成型の予測器は $\hat y$ をデコードし、観測空間でペナルティを受けるため、$y$ のすべてのピクセルを扱わなければなりません。右：JEPA は $y$ もエンコードし、その表現 $s_y$ を予測します。ターゲットエンコーダは通常、勾配を受け取らない EMA コピーで、潜在変数 $z$ によって予測器は複数のありうる未来を表現できます。エンコーダが捨てた $y$ の細部は予測する必要がありません。" %}

危険なのは**表現の崩壊**です。エンコーダが定数を出力すると、どの組に対してもエネルギーがゼロになってしまいます。これを防ぐ手法は 2 つのグループに分かれます。

エネルギーの観点からは、目標と失敗モードの両方が見えてきます。

{% include blog_figure.liquid path="assets/img/blog/world-models/05-energy.svg" caption="左：固定した文脈 $x$ に対し、予測器の $z \in [-1, 1]$ での出力が両立しうる未来の弧（オレンジ、点は $z = -1, 0, 1$）を描くときの、2 次元のターゲット表現 $y$ 上のエネルギー。弧全体でエネルギーはゼロで、そこから離れるほど大きくなるので、複数の未来が同時に「正しい」ことがありえます。右：エンコーダが崩壊（定数出力）すると、両立するペアにもしないペアにもエネルギーは至る所でゼロになり、何の情報も持ちません。" %}

- **対照的**（contrastive）手法は、両立しない組（負例）のエネルギーを押し上げます。LeCun は、これらの手法は表現の次元に対してスケールしにくいと主張しています。
- **正則化型 / 非対照的**（regularized / non-contrastive）手法は、$s_y$ の情報量を制限するか、表現が広がった状態を保つようにします。例としては VICReg（分散・不変性・共分散正則化、variance-invariance-covariance regularization）や、BYOL の**非対称**（asymmetric）な設計があります。BYOL ではターゲットエンコーダがオンラインエンコーダの EMA コピーであり、勾配を受け取りません。

**階層型 JEPA**（hierarchical JEPA, H-JEPA）は JEPA を積み重ね、上位の階層ほどより抽象的な表現でより遠い未来を予測するようにします。これにより階層的プランニング（hierarchical planning）が可能になると考えられています。

このポジションペーパーは研究プログラムであり、実験ではありません。以下に紹介する Meta の論文群が、その具体的な実装です。

## 2. I-JEPA：画像領域の表現を予測する

**I-JEPA**（Assran et al., "Self-Supervised Learning from Images with a Joint-Embedding Predictive Architecture", CVPR 2023, [arXiv:2301.08243](https://arxiv.org/abs/2301.08243)）は、このアイデアを単一の画像に適用したもので、人手で設計したデータ拡張を一切使いません。

1. パッチ（patch）からなる大きな**ターゲットブロック**（target blocks）をいくつかと、大きな**コンテキストブロック**（context block）を 1 つサンプリングします（コンテキストブロックからはターゲット領域を取り除きます）。
2. コンテキストエンコーダ（ViT）$f_\theta$ は、見えているコンテキストパッチだけを処理します。
3. ターゲットエンコーダ $f_{\bar\theta}$ は画像*全体*を処理し、ターゲット位置における出力トークンがターゲット表現となります。
4. 幅の狭い ViT の**予測器**（predictor）$g_\phi$ は、コンテキストトークンと、あるターゲットブロックの位置埋め込みを持つマスクトークンを受け取り、そのブロックの表現を予測します。

図は、I-JEPA 論文に記載された範囲でサンプリングした 3 組のマスクです。

{% include blog_figure.liquid path="assets/img/blog/world-models/05-ijepa-masks.svg" caption="$16 \times 16$ のパッチグリッド（224 px 入力の ViT-H/14）上の I-JEPA マスク。ターゲットブロック 4 つ（色付きの枠）は画像の 0.15-0.2 のスケールでアスペクト比 0.75-1.5、コンテキストブロック 1 つ（青）は 0.85-1.0 のスケールで、そこからターゲット領域が取り除かれます。予測器は青いパッチだけから、各枠内のターゲットエンコーダのトークンを出力しなければなりません。" %}

損失は表現空間における L2 距離で、$M$ 個のターゲットブロック $B_i$ にわたって平均をとります。

$$
\mathcal{L} = \frac{1}{M}\sum_{i=1}^{M} \sum_{j \in B_i} \big\lVert \hat s_{y}(j) - s_{y}(j) \big\rVert_2^2 ,
$$

ターゲットエンコーダはコンテキストエンコーダの EMA、すなわち $\bar\theta \leftarrow m\,\bar\theta + (1 - m)\,\theta$ であり、勾配は流れ込みません。**マスキング戦略**（masking strategy）が決定的に重要であることがわかりました。ターゲットは意味的になるだけの大きさが必要で、コンテキストは情報量が多く、空間的に分散している必要があります。MAE（He et al., CVPR 2022）のようなピクセル再構成手法と比べて、I-JEPA はより少ない計算量で、より意味的な既製の特徴（線形プローブ（linear probing）の性能が高い）を学習しました。

## 3. V-JEPA と V-JEPA 2：動画理解からプランニングへ

### 3.1 V-JEPA

**V-JEPA**（Bardes et al., "Revisiting Feature Prediction for Learning Visual Representations from Video", TMLR 2024, [arXiv:2404.08471](https://arxiv.org/abs/2404.08471)）は、このレシピを動画に拡張したものです。時空間マスク（マスク領域が時間方向にも広がるため、モデルは隣接フレームからコピーできません）と、特徴空間での L1 損失を用います。テキスト、負例、事前学習済み画像エンコーダ、ピクセル再構成のいずれも使わずに約 200 万本の公開動画で学習し、その凍結した特徴は Something-Something v2 のような動きが中心のタスクで特に強力でした。また論文では、特徴予測のほうがピクセル予測よりもラベル効率が高いと報告されています。

後続の研究（Garrido et al., "Intuitive physics understanding emerges from self-supervised pretraining on natural videos", 2025, [arXiv:2502.11831](https://arxiv.org/abs/2502.11831)）は、発達心理学の**期待違反**（violation-of-expectation）パラダイムを用いました。同じ動画の物理的に可能なバージョンと不可能なバージョンを見せ、モデルの「驚き」、すなわち表現空間での予測誤差を測定するのです。V-JEPA のモデルは IntPhys、GRASP、InfLevel において不可能な事象に対して一貫してより大きく驚いた一方、同じ研究で評価されたピクセル生成型の動画モデルやマルチモーダル LLM はチャンスレベルに近い性能でした。著者らは、すべての直感物理（intuitive physics）の性質がうまく学習されるわけではないことも指摘しています。

### 3.2 V-JEPA 2 と V-JEPA 2-AC

**V-JEPA 2**（Assran et al., "V-JEPA 2: Self-Supervised Video Models Enable Understanding, Prediction and Planning", 2025, [arXiv:2506.09985](https://arxiv.org/abs/2506.09985)）は、この手法を 100 万時間を超えるインターネット動画と画像にスケールさせ、世界モデルに欠けていた要素である**行動**を加えました。

1. **行動なしの事前学習**（action-free pre-training）：インターネット動画でエンコーダと予測器を事前学習します（大規模な V-JEPA の目的関数）。
2. **行動条件付きの事後学習**（action-conditioned post-training）：エンコーダを凍結し、62 時間未満のラベルなしロボット動画（DROID データセット由来）で新しい予測器 **V-JEPA 2-AC** を学習します。この予測器は、現在の表現、ロボットのエンドエフェクタ（end-effector）の状態、および行動から、次のフレームの表現を予測します。
3. **プランニング**：ゴール画像が与えられると、ロボットはそれを符号化し、各ステップで（クロスエントロピー法（cross-entropy method, CEM）によって）予測される最終表現がゴール表現に L1 距離で最も近くなる行動系列を探索し、最初の行動を実行して再計画します（MPC）。

$$
a^\ast_{1:H} = \arg\min_{a_{1:H}} \Big\lVert \hat s_{H}(s_0, a_{1:H}) - s_{\mathrm{goal}} \Big\rVert_1, \qquad \hat s_{k} = P_\phi(\hat s_{k-1}, a_k).
$$

論文では、学習データに含まれていない 2 つのラボで、Franka アームを使い、画像のゴールだけからゼロショット（zero-shot）のピックアンドプレースを実現したと報告されています。これは現時点で最も完成された形の JEPA プログラムです。主に受動的な動画から学習した世界モデルを、少量のインタラクションデータで制御に適応させ、潜在空間でのプランニングに用いているのです。

*更新（2026 年 11 月）：* V-JEPA 2.1（2026 年 3 月）は密な特徴を加え、実ロボットの把持で V-JEPA 2-AC より 20 ポイント高い成功率を報告しています。LeWorldModel（2026 年 3 月）は JEPA の世界モデルをピクセルからエンドツーエンドで学習します。本記事末尾の 2025〜2026 年の進展の節を参照してください。

図は同じ手順を玩具的な 2 次元潜在空間で実行したもので、L1 目的関数の等高線はひし形になります。

{% include blog_figure.liquid path="assets/img/blog/world-models/05-latent-planning.svg" caption="上の目的関数による玩具的な潜在空間プランニング。予測器は $\hat s_k = \hat s_{k-1} + a_k$（行動の各成分は $\pm 0.45$ にクリップ）で、状態は灰色の円盤に入れません。灰色のひし形はゴール（星）までの L1 距離の等高線です。左：$H = 8$ 個の行動に対する CEM（サンプル 200、エリート 20、反復 8 回）は、ゴールから L1 距離 0.23 で終わります。右：MPC は最初の行動だけを実行して再計画し、25 ステップ後にはゴールから 0.15 です。" %}

### 3.3 関連する潜在空間プランナー

- **DINO-WM**（Zhou et al., ICML 2025, [arXiv:2411.04983](https://arxiv.org/abs/2411.04983)）は、事前学習済みの DINOv2 のパッチ特徴を凍結し、オフラインの軌道で潜在ダイナミクスモデル（latent dynamics model）だけを学習します。MPC による画像ゴールへのプランニングは、複数の操作タスクやナビゲーションタスクでゼロショットで機能します。良い凍結済み視覚表現と小さな予測器があれば十分な場合があることを示しており、「ピクセルではなく特徴を予測する」という見方を強く支持する論拠となっています。
- **Navigation World Models**（Bar et al., CVPR 2025, [arXiv:2412.03572](https://arxiv.org/abs/2412.03572)）は、同じ研究グループから出た生成型の対抗例です。10 億パラメータの条件付き拡散 Transformer（conditional diffusion Transformer）が、過去のフレームとナビゲーション行動から将来の一人称視点（egocentric）の*フレーム*を予測し、候補軌道をシミュレートしてランク付けすることでプランニングに使われます。

## 4. 予測型対生成型の論争

| 観点 | 生成型（ピクセル / トークン） | 予測型（JEPA 型の潜在空間） |
| --- | --- | --- |
| 学習信号 | 観測を再構成または生成する | ターゲット表現に一致させる |
| 予測不可能な詳細 | モデル化する（拡散）か平均化する（ぼやける）必要がある | エンコーダが捨てられる |
| 崩壊のリスク | なし（ピクセルが表現をつなぎ止める） | 現実的にある。EMA、勾配停止、分散正則化が必要 |
| 出力を目で確認できるか | はい：ロールアウトを見ることができる | いいえ：プローブや別のデコーダが必要 |
| 人間向けシミュレータ / データ生成としての利用 | 自然（Genie、Cosmos） | 直接には使えない |
| 予測 1 回あたりの計算量 | 大きい（多数のノイズ除去ステップ、多数のピクセル） | 小さい（コンパクトな空間での順伝播 1 回） |
| 表現が学習するもの | 描画に必要なすべて（テクスチャや照明を含む） | 予測可能で、視点や時間をまたいで共有されるもの |
| 代表的なシステム | Dreamer（再構成あり）、GameNGen、Genie、Sora、NWM | MuZero（価値等価）、TD-MPC2、I-JEPA、V-JEPA 2-AC、DINO-WM |

この論争を公平に保つために、いくつか注意すべき点があります。

- **境界はあいまいです。** 潜在拡散モデル（latent diffusion models）は学習された潜在空間で生成を行い、そのオートエンコーダはすでに知覚できない詳細を捨てています。Dreamer はピクセルを再構成しますが、コンパクトな潜在空間でプランニングします。JEPA 型のモデルも、可視化のためにデコーダと組み合わせることができます。
- **用途によります。** 目的が人間向けのシミュレータ（ゲーム、VR、コンテンツ制作、合成データ）であれば、ピクセルこそが製品です。目的が制御であれば、MuZero、TD-MPC2、DINO-WM、V-JEPA 2-AC からの証拠は、再構成は不要であり、むしろ有害な可能性すらあることを示唆しています。
- **崩壊は再構成しないことの代償です。** 非生成型の世界モデルはどれも、表現の情報量を保つ仕組みを必要とします。報酬や価値の予測（MuZero）、EMA ターゲット（I-JEPA）、凍結した事前学習済みエンコーダ（DINO-WM）、あるいは明示的な分散正則化（VICReg）です。

### 4.1 コード：崩壊と、EMA ターゲットがそれを防ぐ仕組み

以下のトイ例で、崩壊の問題を具体的に体験できます。「観測」は周波数と位相がランダムな 1 次元信号 $\sin(\omega u + \varphi)$ で、コンテキスト $x$ は信号の前半、ターゲット $y$ は後半です。JEPA は $x$ の埋め込みから $y$ の埋め込みを予測します。3 つのバリエーションを比較し、バッチ内における埋め込みの次元ごとの標準偏差（ゼロに近ければ崩壊を意味します）と、埋め込みに対する線形プローブが隠れた周波数 $\omega$ をどれだけうまく復元できるかを報告します。

```python
import copy
import torch
import torch.nn as nn
import torch.nn.functional as F

torch.manual_seed(0)
L, D = 32, 16                                   # half-signal length, embedding size

def batch(n):
    omega = torch.rand(n, 1) * 2.5 + 0.5        # hidden factor we hope to recover
    phi = torch.rand(n, 1) * 6.283
    u = torch.arange(2 * L).float()[None]
    s = torch.sin(omega * u * 0.25 + phi) + 0.05 * torch.randn(n, 2 * L)
    return s[:, :L], s[:, L:], omega             # context x, target y, hidden omega

def encoder():
    return nn.Sequential(nn.Linear(L, 128), nn.ReLU(), nn.Linear(128, D))

def train(variant, steps=3000):
    enc = encoder()
    pred = nn.Sequential(nn.Linear(D, 128), nn.ReLU(), nn.Linear(128, D))
    target = copy.deepcopy(enc).requires_grad_(False)
    opt = torch.optim.Adam([*enc.parameters(), *pred.parameters()], lr=1e-3)
    for _ in range(steps):
        x, y, _ = batch(256)
        s_x = enc(x)
        if variant == "shared, no stop-grad":
            s_y = enc(y)                          # gradients flow into the target branch
        else:
            with torch.no_grad():
                s_y = target(y)                   # EMA target, stop-gradient
        loss = F.mse_loss(pred(s_x), s_y)
        if variant == "EMA + variance reg.":     # VICReg-style hinge on the per-dim std
            loss = loss + F.relu(1 - s_x.std(0)).mean()
        opt.zero_grad(); loss.backward(); opt.step()
        with torch.no_grad():                     # EMA update of the target encoder
            for p_t, p in zip(target.parameters(), enc.parameters()):
                p_t.mul_(0.99).add_(0.01 * p)
    return enc

def evaluate(enc):
    with torch.no_grad():
        x, _, omega = batch(4000)
        s = enc(x)
        feats = torch.cat([s, torch.ones(len(s), 1)], 1)
        w = torch.linalg.lstsq(feats[:3000], omega[:3000]).solution
        res = omega[3000:] - feats[3000:] @ w
        r2 = 1 - res.pow(2).mean() / omega[3000:].var()
    return s.std(0).mean().item(), r2.item()

for variant in ["shared, no stop-grad", "EMA target", "EMA + variance reg."]:
    std, r2 = evaluate(train(variant))
    print(f"{variant:>22}: embedding std {std:.4f}, linear-probe R^2 for omega {r2:.2f}")
```

エンコーダを共有し、両方の枝に勾配を流すと、損失をゼロにする最も簡単な方法はすべてを同じ点に写すことになり、埋め込みの標準偏差はゼロへと縮んでいきます。非対称な EMA ターゲットはこのダイナミクスを遅らせ、分散項は崩壊を明示的に排除します。各バリエーションが $\omega$ についての情報をどれだけ保っているかを比べてみてください。正確な数値はシードやステップ数に依存しますが、それ自体が 1 つの教訓です。崩壊は損失関数の性質であるだけでなく、学習の*ダイナミクス*なのです。

上のスクリプトを実行し、学習中の埋め込みの広がりも記録しました。

{% include blog_figure.liquid path="assets/img/blog/world-models/05-collapse.svg" caption="崩壊の玩具実験の出力。上：学習中の $s_x$ の次元ごとの標準偏差の平均（対数軸）。下：1500 個の埋め込みの第 1・第 2 主成分を、隠れた周波数 $\omega$ で色分けしたもの。エンコーダを共有し勾配停止を使わないと、広がりは 0.002 まで縮み、線形プローブは $\omega$ について何も復元できません（$R^2 = 0.01$）。EMA ターゲットは埋め込みを広げたまま保ち（$R^2 = 0.82$）、分散ヒンジ項は広がりをさらに大きくしますが、この実行では $R^2$ は変わりません。" %}

## 5. 世界モデルはどのように評価されるのか

広く受け入れられた単一のベンチマークは存在しません。次の 5 つの問いに分けて考えると役立ちます。

おおまかな見取り図として、図はこのシリーズで扱った 3 種類の世界モデルが、これら 5 つの問いでどこに強み・弱みを持ちやすいかを示しています。

{% include blog_figure.liquid path="assets/img/blog/world-models/05-eval-radar.svg" localized="true" width="75%" caption="定性的な目安であり、実測スコアではありません。第 4 回のトレードオフ表と本稿の 3 節・5 節に基づく私たちの読みです。ピクセル動画モデルは見た目が最も良い一方で記憶と物理は限られ、明示的な 3D 世界は構造上一貫していますがダイナミクスと行動にはシミュレータが必要です。JEPA 型の潜在モデルは見る対象となる出力がありません（その軸は 0）が、プランニングには安価で有効です。" %}

### 5.1 見た目は正しいか？（知覚的品質）

フレーム単位の FID、動画単位の **FVD**（フレシェ動画距離、Fréchet video distance）、そして **VBench**（Huang et al., CVPR 2024, [arXiv:2311.17982](https://arxiv.org/abs/2311.17982)）のような評価スイートがあります。VBench は動画の品質を、被写体の一貫性、動きの滑らかさ、美的品質といった次元に分解します。これらは必要ですが弱い指標です。モデルは物理法則に反していても高いスコアを得られるからです。

### 5.2 物理法則に従っているか？

- **期待違反**：IntPhys（Riochet et al.）、GRASP、InfLevel は、モデルが不可能な事象に「驚く」かどうかをテストします（3.1 節）。
- **Physion**（Bear et al., NeurIPS 2021 Datasets and Benchmarks, [arXiv:2106.08261](https://arxiv.org/abs/2106.08261)）：衝突、積み重ね、転がり、布のかぶさり（draping）などを含むシミュレーションシーンで 2 つの物体が接触するかどうかを予測するもので、比較用に人間のデータも提供されています。
- **Physics-IQ**（Motamed et al., WACV 2026, [arXiv:2501.09038](https://arxiv.org/abs/2501.09038)）：物理現象の実写動画を用います。モデルは冒頭部分を見てその続きを生成しなければならず、その続きは、動きがどこで、いつ、どれだけ起こるかという点で実際の未来と比較されます。主要な発見は、現在の動画生成モデルの物理的理解は大きく限られており、それは視覚的リアリズムでは説明できないというものです。
- Kang et al.（ICML 2025, [arXiv:2411.02385](https://arxiv.org/abs/2411.02385)）のような**統制された合成データによる研究**は、分布内、組み合わせ的、分布外の汎化を切り分けます（第 3 回）。

### 5.3 行動に反応するか？（制御可能性）

インタラクティブな世界モデルは、行動に*意味を持たせ*なければなりません。Genie はこれを $\Delta_t\mathrm{PSNR}$ で測定します。実際の動画から推定した潜在行動で生成したフレームと、ランダムにサンプリングした行動で生成したフレームを、それぞれ実際のフレームと比較し、その PSNR の差をとるものです。モデルが行動を無視していれば、この差はゼロになります。他によく使われる確認方法として、実データで逆ダイナミクスモデル（inverse dynamics model）を学習し、生成されたフレームから指令した行動を復元できるかを調べる方法や、結果として得られるカメラやエージェントの姿勢の誤差を測る方法があります。

### 5.4 時間的に一貫しているか？（記憶）

再訪テスト：ある場所から離れ、同じ経路を通って戻ってきて、同じ場所の 2 つのビューを比較します（PSNR/LPIPS、または特徴マッチング）。ループクロージャ（loop closure）や、生成された動画からの 3D 再構成（SfM を実行して再投影誤差を見る）によって幾何学的な一貫性をテストします。明示的な 3D 世界（第 4 回）は、静的なコンテンツについては構造上これらのテストに合格します。

### 5.5 役に立つか？（下流タスク）

結局のところ世界モデルは道具であり、最良の評価はそれによって何が可能になるかです。

- **プランニングの成功率**：モデルを使ってプランニングしたときのゴール到達率（DINO-WM、V-JEPA 2-AC、NWM）。
- **想像の中での方策学習**：モデルの中だけで学習したエージェントを実環境で評価したときの収益（Dreamer、DIAMOND、UniSim）。
- **方策評価**：モデルの*中*での各方策の成功率は、実世界での試行と同じ順位を与えるでしょうか。方策を正しく順位付けできるモデルは、たとえ生成する動画が不完全でも、高価なロボット評価を置き換えられます。
- **データ生成**：モデルが生成した合成データで学習すると、下流の知覚システムや自動運転システムが改善するでしょうか（Cosmos や GAIA-1 のユースケース）。

任意のフレーム生成器を差し込めるように書いた、制御可能性指標の最小限のスケッチを示します。

```python
import torch

def psnr(a, b, max_val=1.0):
    mse = torch.mean((a - b) ** 2, dim=tuple(range(1, a.dim())))
    return 10 * torch.log10(max_val ** 2 / mse.clamp(min=1e-10))

def delta_psnr(model, frames, actions, sample_random_actions, t):
    """Genie-style controllability: PSNR with inferred/true actions minus PSNR with random actions.
    frames: [B, T, C, H, W] real video in [0, 1]; model(context, actions) -> predicted frames [B, t, C, H, W]."""
    ctx = frames[:, :1]
    pred_true = model(ctx, actions[:, :t])
    pred_rand = model(ctx, sample_random_actions(actions[:, :t]))
    target = frames[:, t]
    return (psnr(pred_true[:, -1], target) - psnr(pred_rand[:, -1], target)).mean()

# toy check with a "model" that shifts the first frame by the action (perfectly controllable)
def toy_model(ctx, acts):
    out, f = [], ctx[:, 0]
    for k in range(acts.shape[1]):
        f = torch.stack([torch.roll(fi, shifts=int(a), dims=-1) for fi, a in zip(f, acts[:, k])])
        out.append(f)
    return torch.stack(out, 1)

B, T = 8, 5
acts = torch.randint(-2, 3, (B, T))
first = torch.rand(B, 1, 1, 16, 16)
frames = torch.cat([first, toy_model(first, acts)], 1)             # ground-truth video
rand = lambda a: torch.randint(-2, 3, a.shape)
print("delta PSNR (controllable model):", delta_psnr(toy_model, frames, acts, rand, t=T).item())
print("delta PSNR (model that ignores actions):",
      delta_psnr(lambda c, a: c.repeat(1, a.shape[1], 1, 1, 1), frames, acts, rand, t=T).item())
```

制御可能なトイモデルは大きな正の $\Delta\mathrm{PSNR}$ を得ます（真の行動での完全な予測は `1e-10` の下限でクランプされるため、値は大きいものの有限です）。一方、行動を無視するモデルはちょうどゼロになります。

図は、玩具例の 1 サンプルについて、この指標が何を比べているかを示しています。

{% include blog_figure.liquid path="assets/img/blog/world-models/05-delta-psnr.svg" caption="玩具チェックの 1 サンプル。真の行動を与えると、制御可能なモデルは実フレームを正確に再現します（PSNR は MSE の下限 $10^{-10}$ に達して 100 dB）。ランダムな行動ではテクスチャが誤った位置にずれます（7.3 dB）。行動を無視するモデルはどちらの場合も最初のフレームを返すので、2 つの PSNR は等しく $\Delta\mathrm{PSNR} = 0$ になります。" %}

## 6. 未解決の課題と研究の方向性

1. **記憶と永続性。** 1 時間見続けた世界を、世界モデルはどのように記憶すべきでしょうか。候補としては、圧縮を伴うより長いコンテキスト、姿勢による検索、明示的な 3D/4D 状態（第 4 回）、あるいは学習された潜在マップがあります。
2. **物理的・因果的なグラウンディング（grounding）。** 動画データが示すのは相関であり、物理には介入が必要です。有望な要素としては、ロボットやシミュレータからのインタラクションデータ、物理ベースの帰納バイアス（粒子、PhysGaussian のようにシミュレータをループに組み込むこと）、そして分布外の法則を試す評価が挙げられます。
3. **共通の行動インタフェース。** キーボード入力、潜在行動、エンドエフェクタの変位、言語。異なる身体（embodiment）の間で転移できる世界モデルには、データセットをまたいで同じ意味を持つ行動が必要です。潜在行動モデル（latent action models、第 3 回）はその出発点です。
4. **不確実性。** 自信満々だが誤っているモデルに対してプランニングするのは危険です（第 1 回で述べたモデルの悪用（model exploitation））。大規模な動画モデルにおいて、スケールした較正済みの認識的不確実性（epistemic uncertainty）はほとんど未解決です。
5. **予測ターゲットの選択。** ピクセル、潜在トークン、自己教師あり特徴、それともタスクに関わる量でしょうか。ハイブリッドな目的関数（たとえば JEPA 型の潜在ダイナミクスモデルに、確認用の軽量なデコーダを加えたもの）はまだ十分に探究されていません。
6. **有用性を予測できる評価。** 視覚的品質ではなく、下流のプランニングや方策評価の性能と相関するベンチマークが必要です。
7. **効率。** 単一のデバイス上でのリアルタイム・高解像度・長期間の生成。ここはグラフィックスの知識（詳細度制御（level of detail）、キャッシュ、中心窩レンダリング（foveation）、明示的なプリミティブ）が貢献できる領域でもあります。
8. **マルチエージェントと社会的な世界。** 現在のほとんどのモデルは制御可能なエージェントを 1 つだけシミュレートしており、独自の目標を持つ他のエージェントはノイズとして扱われています。

グラフィックス、XR/HCI、身体性AI の交差点にいる研究者にとっては、項目 1、5、7 が特に自然なテーマです。明示的な表現、知覚を考慮したレンダリング、そして人間をループに含めた（humans in the loop）インタラクティブな評価です。

## 7. 身体性AI への橋渡し

世界モデルが最も重要になるのは、行動が物理世界で結果をもたらす場面です。このブログの次のシリーズである[身体性AI（Embodied AI）]({{ '/blog/category/embodied-ai/' | relative_url }})では、ロボティクスの基礎とシミュレーションから始め、その後ロボットの側から本シリーズのアイデアに立ち返ります。すなわち、sim-to-real 転移（sim-to-real transfer）のためのシミュレータとしての世界モデル、方策の評価器としての世界モデル、（V-JEPA 2-AC や DINO-WM のような）プランナーとしての世界モデル、そして視覚・言語・行動モデル（vision-language-action models）の内部にある「想像」としての世界モデルです。

## 2025〜2026 年の進展（2026 年 11 月時点）

この節では、2025 年半ばから 2026 年 11 月初めまでの JEPA と評価に関する研究を補足し、明確にラベル付けした公開された主張の一覧も加えます。すべての研究は 2026 年 11 月に arXiv のページまたは公式記事で確認しました。「プレプリント」はまだ学会や論文誌で発表されていないものです。タイムラインのウィジェット（「JEPA」と「評価」で絞り込み）にすべての項目が載っています。

{% include widget.liquid name="world-models-timeline" height="560" caption="試してみましょう：「JEPA」と「評価」のボタンでこの記事の項目を表示し、点をタップすると要約、ステータス、リンクが表示されます。2026 年に評価の論文が集中していることに注目してください。ベンチマークは、それが測るシステムからおよそ 1 年遅れてやってきます。" %}

### V-JEPA 2 以後の JEPA の系譜

- **V-JEPA 2.1**（Mur-Labadia et al.、プレプリント、[arXiv:2603.14482](https://arxiv.org/abs/2603.14482)、2026 年 3 月）は、V-JEPA 2 の既知の弱点に取り組みます。その特徴は全体的な理解には強い一方、位置ごとの*密な*タスクには弱いというものでした。解決策は、密な予測損失を加え、画像と動画で同時に学習することです。論文では、より良い密な特徴と、1B から 2B パラメータへのスケーリングが報告されています。3.2 節に関係する点として、実ロボットでの把持成功率が V-JEPA 2-AC より 20 ポイント高いことも報告されています。操作は物体が*どこにあるか*に依存し、場面に何があるかだけでは決まらないので、密な特徴はプランニングにとって重要です。
- **LeJEPA**（Balestriero and LeCun、プレプリント、[arXiv:2511.08544](https://arxiv.org/abs/2511.08544)、2025 年 11 月）は、4.1 節の崩壊の問題に理論から取り組みます。論文は、下流の予測リスクを最小にする埋め込みの分布は**等方的なガウス分布**（isotropic Gaussian）だと論じ、その分布を **SIGReg**（Sketched Isotropic Gaussian Regularization）で課します。埋め込みのバッチをランダムな方向 $u$ に射影し、各 1 次元射影 $u^\top z$ が標準正規分布からどれだけ離れているかを、1 変数の統計的検定で罰するのです。分布はそのすべての 1 次元射影によって一意に決まる（Cramér-Wold の定理）ので、十分な数のランダム射影を合わせれば分布全体が目標に近づきます。これにより、崩壊のおもちゃの実験で必要だったヒューリスティクスが不要になります。EMA の教師も stop-gradient も要らず、トレードオフのハイパーパラメータは 1 つだけです。4.1 節の VICReg と比べてみてください。VICReg が最初の 2 つのモーメント（分散と共分散）しか合わせないのに対し、SIGReg はサンプルした各方向で分布全体を合わせます。
- **LeWorldModel**（Maes et al.、プレプリント、[arXiv:2603.19312](https://arxiv.org/abs/2603.19312)、2026 年 3 月）は、同じ考え方を*世界モデル*に適用します。生のピクセルからエンドツーエンドで学習する JEPA で、損失項は 2 つだけなので、損失のハイパーパラメータは 6 個から 1 個に減ります。約 1500 万パラメータで、GPU 1 枚で数時間で学習でき、大規模な事前学習済みエンコーダに基づく世界モデルより最大 48 倍速くプランニングできると報告されています。それまでの潜在空間のプランナー（DINO-WM、3.3 節）は、エンドツーエンドの JEPA 学習が不安定だったため、凍結した基盤エンコーダに頼っていました。LeWorldModel は、もうその松葉杖は要らないと主張しています。
- **VL-JEPA**（Chen et al.、プレプリント、[arXiv:2512.10942](https://arxiv.org/abs/2512.10942)、2025 年 12 月）は、JEPA の原理を視覚言語に持ち込みます。トークンを生成するのではなく、目標テキストの連続的な*埋め込み*を予測し、必要なときだけテキストにデコードします。統制された比較では、学習可能なパラメータが 50% 少ないにもかかわらず、トークン空間のベースラインを上回りました。
- **DINO-world**（Baldassarre et al.、プレプリント、[arXiv:2507.19468](https://arxiv.org/abs/2507.19468)、2025 年 7 月）は、第 4 節の 2 つの陣営の中間に位置します。凍結した DINOv2 エンコーダの特徴空間で将来のフレームを予測する汎用の動画世界モデルで、ピクセルでもゼロから学習した潜在表現でもない「中間の」ターゲットを使います。

**予測型と生成型の論争**（第 4 節）は終わっていませんが、論点は変わりました。潜在空間での予測は、安定したより簡単な学習レシピ（LeJEPA、LeWorldModel）と密な特徴（V-JEPA 2.1）を手に入れました。一方、生成型の動画モデルはリアルタイムで制御可能になり（第 3 回の更新）、Cosmos 3 のような最大級の産業モデルは、推論モデルと生成器を 1 つのシステムに組み合わせています。

### 評価：「見た目が正しいか」から「役に立つか」へ

第 5 節では評価を 5 つの問いに分けました。2025〜2026 年のベンチマークの多くは 5.2（物理）、5.3（制御）、5.4（記憶）を対象とし、最初の閉ループのベンチマークは 5.5 を対象としています。図は、各ベンチマークを明示的に測っている問いに対応づけたものです。

{% include blog_figure.liquid path="assets/img/blog/world-models/05-update-benchmarks.svg" width="85%" caption="各ベンチマークが、その要旨によれば第 5 節の 5 つの問い（列 5.1 品質、5.2 物理、5.3 制御、5.4 記憶、5.5 有用性）のどれを明示的に採点しているかを示します。塗りつぶしの点は名前の付いた評価次元、白抜きの点は部分的なもの（WorldModelBench のテキスト指示への追従、WorldScore の「ダイナミクス」）です。破線より上は 2024〜2025 年、下は 2026 年のベンチマークです。物理（5.2 列）は混み合っていますが、記憶と有用性はそれぞれ 2 つしかありません。" %}

**物理（5.2）。** *WorldModelBench*（Li et al.、プレプリント、[arXiv:2502.20694](https://arxiv.org/abs/2502.20694)）は、動画生成器を世界モデルとして、指示への追従と物理への忠実さで評価し、微調整した視覚言語モデルを判定者に使います。*VideoPhy-2*（Bansal et al.、プレプリント、[arXiv:2503.06800](https://arxiv.org/abs/2503.06800)）は、行動を中心とした物理的常識に焦点を当てます。*IntPhys 2*（Bordes et al.、プレプリント、[arXiv:2506.09849](https://arxiv.org/abs/2506.09849)）は、期待違反のテスト（5.2 節）を複雑な合成シーンに持ち込み、モデルの成績がチャンスレベルに近いことを報告しています。*World Models' Last Exam in Physics*（Gao et al.、プレプリント、[arXiv:2610.08791](https://arxiv.org/abs/2610.08791)、2026 年 10 月）は、力学、光学、流体、熱、電磁気、表面張力にわたる 40 の測定ベースのタスクを使います。各タスクは開始画像とプロンプトを物理的な基準と組み合わせるので、参照動画は要りません。8 つの動画生成器・1,280 本の動画で、最高得点は 100 点中 57.76 でした。

**制御（5.3）。** *WorldScore*（Duan et al.、ICCV 2025、[arXiv:2504.00983](https://arxiv.org/abs/2504.00983)）は、世界生成を指定されたカメラ経路に沿った「次のシーンの生成」の連続とみなし、制御可能性、品質、ダイナミクスを採点します。*WorldMark*（Xu et al.、プレプリント、[arXiv:2604.21686](https://arxiv.org/abs/2604.21686)、2026 年 4 月）は、第 6 節の「共通の行動インターフェースがない」という問題を評価の面で解決します。モデルごとのアダプタで同じ WASD 型の入力を 10 個の対話型モデルに渡し、500 のケースで評価します。制御工学的な指標（方向の正確さ、応答遅延、動きの安定性）を加え、最も速く応答するモデルほど不安定なことが多いと報告しています。

**記憶と永続的な状態（5.4）。** *WBench*（Ying et al.、プレプリント、[arXiv:2605.25874](https://arxiv.org/abs/2605.25874)、2026 年 5 月）は複数ターンのベンチマークで、289 のケース、1,058 の対話ターン、22 の自動サブ指標により、品質、設定と対話への追従、一貫性、物理を評価します。20 のモデルのうち、すべての次元で首位のものはありませんでした。*WRBench*（"Current World Models Lack a Persistent State Core"、Lu et al.、プレプリント、[arXiv:2606.20545](https://arxiv.org/abs/2606.20545)、2026 年 6 月）は、カメラの動きを使って進行中の出来事を*隠し*、見えていない間にそれが進み続けたかを調べます。23 のモデルの 9,600 本の動画で、モデルはたいてい出来事を離れたときの状態から再開し、先に進めませんでした。これは 5.4 節の再訪テストをより鋭くしたものです。見た目を覚えていることは、状態をシミュレーションすることと同じではありません。

**有用性（5.5）。** *World-in-World*（Zhang et al.、ICLR 2026 口頭発表、[arXiv:2510.18135](https://arxiv.org/abs/2510.18135)）は、世界モデルを身体性エージェントとの閉ループに置き、視覚的な品質ではなくタスクの成功で採点します。*WorldArena 2.0*（Li et al.、プレプリント、[arXiv:2605.17912](https://arxiv.org/abs/2605.17912)、2026 年 5 月）は、身体性の世界モデルのベンチマークを、視触覚入力、強化学習の環境として使う世界モデル、複数のシミュレーション上・実機のロボットへと広げています。閉ループのスコアこそ、第 6 節の 6 項目めが求めていた「有用性を予測する評価」です。

補完的な調査として、*Video models are zero-shot learners and reasoners*（Wiedemer et al.、プレプリント、[arXiv:2509.20328](https://arxiv.org/abs/2509.20328)）は、Veo 3 を学習していない知覚、モデリング、操作、推論のタスクで試し、LLM が言語でそうなったように、動画モデルが汎用の視覚基盤モデルになりうると論じています。

### 研究所やスタートアップによる公開の主張（企業の声明であり、査読されていません）

以下は公式発表に含まれる主張です。独立に検証されたからではなく、見かけたときに見分けられるように挙げています。

- **Google DeepMind、Genie 4**（[2026 年 10 月 27 日](https://deepmind.google/blog/genie-4-a-new-generation-of-world-simulation/)）：Genie 3 より優れた物理と人物キャラクター、ネイティブ音声、リアルタイムの言語による操作。ベンチマークの表、解像度、フレームレートは公表されていません。
- **NVIDIA、Cosmos 3**（[2026 年 6 月 1 日](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Launches-Cosmos-3-the-Open-Frontier-Foundation-Model-for-Physical-AI/default.aspx)）：複数の世界生成リーダーボード（Physics-IQ を含む）、行動方策のリーダーボード、視覚理解のリーダーボードでオープンモデル中 1 位。
- **World Labs、Atlas**（[2026 年 9 月 1 日](https://worldlabs.ai/blog/atlas)）：5 つの動画モデルとの比較で、人間の評価者が 75%〜94% の割合で Atlas を好み、記事の図では 3D 再構成の誤差がベースラインより小さい。
- **Wayve、GAIA-4**（[2026 年 8 月 3 日](https://wayve.ai/thinking/gaia-4/)）：GAIA をシーン再構成向けに学習したことで、記録された世界を保つ忠実度が 2.5 倍に向上。
- **AMI Labs。** 2025 年 12 月、Yann LeCun は新しい世界モデルのスタートアップ Advanced Machine Intelligence（AMI Labs）を自ら会長として立ち上げることを認めました（[TechCrunch、2025 年 12 月 19 日](https://techcrunch.com/2025/12/19/yann-lecun-confirms-his-new-world-model-startup-reportedly-seeks-5b-valuation)）。掲げる目標は LLM に代わる世界モデルで、第 1 節のポジションペーパーと同じ方向です。2026 年 11 月時点で、公開された技術的成果はありません。

### 第 5 節と第 6 節で変わったこと

- 未解決の課題 1（記憶）は、動画世界モデルの主要な研究フロントになりました（第 3 回の更新）。一方で WRBench は、*動的な*永続性がまだ欠けていることを示しました。
- 未解決の課題 3（共通の行動インターフェース）は、評価ではアダプタによって部分的に回避され（WorldMark）、ロボットでは動画と行動の同時予測モデルによって取り組まれています（第 1 回の更新）。
- 未解決の課題 6（有用性を予測する評価）には、最初の閉ループのベンチマーク（World-in-World、WorldArena 2.0）が登場しました。そのスコアがタスクやロボットをまたいで相関するかどうかが次の問いです。
- 全体を把握するためのサーベイとポジションペーパーとして、*A Definition and Roadmap for World Models*（Chen et al.、[arXiv:2607.06401](https://arxiv.org/abs/2607.06401)）と *A Tutorial on World Models and Physical AI*（Oh、[arXiv:2606.12783](https://arxiv.org/abs/2606.12783)）があります。どちらも 2026 年のプレプリントです。

JEPA 型と生成型の世界モデルがロボットの中でどう使われるかは[身体性 AI シリーズ]({{ '/blog/category/embodied-ai/' | relative_url }})で、エンジンやシミュレータがこれらのベンチマークの依拠する正解データとしてどう機能するかは[グラフィックスエンジン第 5 回]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})で扱います。

## 代表的な論文

| 論文 | 発表先 | 年 | リンク | なぜ重要か |
| --- | --- | --- | --- | --- |
| A Path Towards Autonomous Machine Intelligence (LeCun) | OpenReview (position paper) | 2022 | [OpenReview](https://openreview.net/forum?id=BZ5a1r-kVsf) | モジュール型アーキテクチャ、エネルギーベースモデル、JEPA |
| Bootstrap Your Own Latent (BYOL, Grill et al.) | NeurIPS | 2020 | [arXiv:2006.07733](https://arxiv.org/abs/2006.07733) | EMA ターゲットネットワークにより負例なしで崩壊を回避 |
| VICReg: Variance-Invariance-Covariance Regularization for Self-Supervised Learning (Bardes, Ponce, LeCun) | ICLR | 2022 | [arXiv:2105.04906](https://arxiv.org/abs/2105.04906) | 崩壊を防ぐ明示的な正則化 |
| Masked Autoencoders Are Scalable Vision Learners (MAE, He et al.) | CVPR | 2022 | [arXiv:2111.06377](https://arxiv.org/abs/2111.06377) | JEPA が異を唱えるピクセル再構成のベースライン |
| Self-Supervised Learning from Images with a Joint-Embedding Predictive Architecture (I-JEPA, Assran et al.) | CVPR | 2023 | [arXiv:2301.08243](https://arxiv.org/abs/2301.08243) | 画像のための特徴予測 |
| Revisiting Feature Prediction for Learning Visual Representations from Video (V-JEPA, Bardes et al.) | TMLR | 2024 | [arXiv:2404.08471](https://arxiv.org/abs/2404.08471) | 動画のための特徴予測 |
| Intuitive physics understanding emerges from self-supervised pretraining on natural videos (Garrido et al.) | arXiv | 2025 | [arXiv:2502.11831](https://arxiv.org/abs/2502.11831) | 期待違反パラダイムによる V-JEPA の評価 |
| V-JEPA 2: Self-Supervised Video Models Enable Understanding, Prediction and Planning (Assran et al.) | arXiv | 2025 | [arXiv:2506.09985](https://arxiv.org/abs/2506.09985) | ゼロショットのロボットプランニングのための行動条件付き潜在世界モデル |
| DINO-WM: World Models on Pre-trained Visual Features enable Zero-shot Planning (Zhou et al.) | ICML | 2025 | [arXiv:2411.04983](https://arxiv.org/abs/2411.04983) | 凍結した DINOv2 特徴上でのプランニング |
| Navigation World Models (Bar et al.) | CVPR | 2025 | [arXiv:2412.03572](https://arxiv.org/abs/2412.03572) | ナビゲーションのプランニングのための生成型（拡散）世界モデル |
| Physion: Evaluating Physical Prediction from Vision in Humans and Machines (Bear et al.) | NeurIPS Datasets and Benchmarks | 2021 | [arXiv:2106.08261](https://arxiv.org/abs/2106.08261) | 人間のデータを伴う物理予測ベンチマーク |
| VBench: Comprehensive Benchmark Suite for Video Generative Models (Huang et al.) | CVPR | 2024 | [arXiv:2311.17982](https://arxiv.org/abs/2311.17982) | 多次元的な動画品質評価 |
| Do generative video models understand physical principles? (Physics-IQ, Motamed et al.) | WACV | 2026 | [arXiv:2501.09038](https://arxiv.org/abs/2501.09038) | 視覚的リアリズムは物理的理解を意味しない |
| WorldModelBench: Judging Video Generation Models As World Models (Li et al.) | プレプリント | 2025 | [arXiv:2502.20694](https://arxiv.org/abs/2502.20694) | 指示への追従と物理への忠実さ |
| VideoPhy-2: A Challenging Action-Centric Physical Commonsense Evaluation in Video Generation (Bansal et al.) | プレプリント | 2025 | [arXiv:2503.06800](https://arxiv.org/abs/2503.06800) | 行動中心の物理的常識 |
| WorldScore: A Unified Evaluation Benchmark for World Generation (Duan et al.) | ICCV | 2025 | [arXiv:2504.00983](https://arxiv.org/abs/2504.00983) | カメラ指定の次シーン生成 |
| IntPhys 2: Benchmarking Intuitive Physics Understanding In Complex Synthetic Environments (Bordes et al.) | プレプリント | 2025 | [arXiv:2506.09849](https://arxiv.org/abs/2506.09849) | 複雑なシーンでの期待違反テスト |
| Back to the Features: DINO as a Foundation for Video World Models (Baldassarre et al.) | プレプリント | 2025 | [arXiv:2507.19468](https://arxiv.org/abs/2507.19468) | 凍結した DINOv2 特徴空間での予測 |
| Video models are zero-shot learners and reasoners (Wiedemer et al.) | プレプリント | 2025 | [arXiv:2509.20328](https://arxiv.org/abs/2509.20328) | 学習していない視覚タスクで Veo 3 を調査 |
| World-in-World: World Models in a Closed-Loop World (Zhang et al.) | ICLR（口頭発表） | 2026 | [arXiv:2510.18135](https://arxiv.org/abs/2510.18135) | 閉ループ・タスク成功による評価 |
| LeJEPA: Provable and Scalable Self-Supervised Learning Without the Heuristics (Balestriero, LeCun) | プレプリント | 2025 | [arXiv:2511.08544](https://arxiv.org/abs/2511.08544) | SIGReg が EMA と stop-gradient を置き換える |
| VL-JEPA: Joint Embedding Predictive Architecture for Vision-language (Chen et al.) | プレプリント | 2025 | [arXiv:2512.10942](https://arxiv.org/abs/2512.10942) | トークンではなくテキスト埋め込みを予測 |
| LeWorldModel: Stable End-to-End Joint-Embedding Predictive Architecture from Pixels (Maes et al.) | プレプリント | 2026 | [arXiv:2603.19312](https://arxiv.org/abs/2603.19312) | エンドツーエンドの JEPA 世界モデル、損失は 2 項 |
| V-JEPA 2.1: Unlocking Dense Features in Video Self-Supervised Learning (Mur-Labadia et al.) | プレプリント | 2026 | [arXiv:2603.14482](https://arxiv.org/abs/2603.14482) | 密な特徴、ロボット把持の改善 |
| WorldMark: A Unified Benchmark Suite for Interactive Video World Models (Xu et al.) | プレプリント | 2026 | [arXiv:2604.21686](https://arxiv.org/abs/2604.21686) | アダプタで制御を統一、制御指標 |
| WorldArena 2.0 (Li et al.) | プレプリント | 2026 | [arXiv:2605.17912](https://arxiv.org/abs/2605.17912) | 身体性・マルチプラットフォームの世界モデルベンチマーク |
| WBench: A Comprehensive Multi-turn Benchmark for Interactive Video World Model Evaluation (Ying et al.) | プレプリント | 2026 | [arXiv:2605.25874](https://arxiv.org/abs/2605.25874) | 複数ターンの対話型評価 |
| Current World Models Lack a Persistent State Core (WRBench, Lu et al.) | プレプリント | 2026 | [arXiv:2606.20545](https://arxiv.org/abs/2606.20545) | 画面外の動きがシミュレーションされない |
| World Models' Last Exam in Physics (Gao et al.) | プレプリント | 2026 | [arXiv:2610.08791](https://arxiv.org/abs/2610.08791) | 測定ベースの物理タスク |

## 学習リソース

- コード：[I-JEPA](https://github.com/facebookresearch/ijepa)、[V-JEPA](https://github.com/facebookresearch/jepa)、[V-JEPA 2](https://github.com/facebookresearch/vjepa2)、[直感物理の評価](https://github.com/facebookresearch/jepa-intuitive-physics)、[DINO-WM](https://github.com/gaoyuezhou/dino_wm)、[Physics-IQ ベンチマーク](https://github.com/google-deepmind/physics-IQ-benchmark)。
- LeCun のポジションペーパー自体は長いですが読みやすく、アーキテクチャとエネルギーベースモデルに関する節が中核です。
- 自己教師あり学習の背景知識には、Balestriero et al., "A Cookbook of Self-Supervised Learning"（2023）と、S. Prince の *Understanding Deep Learning* の該当する章（[udlbook.github.io/udlbook](https://udlbook.github.io/udlbook/)）がおすすめです。
- 論争の生成型の側については、Stanford の [CS236](https://deepgenerativemodels.github.io/) を参照してください。

## 演習

1. 崩壊のトイ例で EMA を取り除いてください（毎ステップ、オンラインエンコーダの重みをターゲットにコピーしますが、勾配停止は維持します）。崩壊するでしょうか。このことから、予測器と EMA それぞれの役割について何がわかるでしょうか。
2. $\mathrm{Pred}(s_x)$ から $y$ を再構成するデコーダを追加し、同時に学習してください（生成的な補助損失）。デコーダの有無で線形プローブの $R^2$ を比較してください。再構成が役立つのはどのような場合で、害になるのはどのような場合だと予想されますか。
3. V-JEPA 2-AC のプランニングの目的関数を CEM ループ（サンプリング、予測器による展開、ゴール埋め込みへの L1 距離によるスコア付け、再フィッティング）として書いてください。第 1 回の CEM の説明を再利用してかまいません。
4. 動画世界モデルのための再訪一貫性の指標を設計してください。カメラの経路、比較に使う指標、そしてズルをして満点をとれてしまうベースラインを明記してください。そのズルをどのように排除しますか。
5. 第 6 節から未解決の課題を 1 つ選び、半ページの研究提案を書いてください。仮説、最小限の実験、そしてそれをどう評価するかを含めてください。
6. （2025〜2026 年の更新）4.1 節の崩壊のおもちゃの実験で、完全に崩壊したエンコーダはすべての入力を同じベクトル $c$ に写します。このとき各 1 次元射影 $u^\top z$ がどうなるか、そして SIGReg 型の罰則（各射影を $\mathcal{N}(0, 1)$ と比べる）がなぜ大きくなるかを説明してください。次に、埋め込みが 1 つの方向 $e_1$ に沿ってしか変化しない「次元の崩壊」を考えます。どのランダムな方向 $u$ がそれを検出し、なぜ十分な数のランダムな方向があれば必ず検出できるのでしょうか。

<details markdown="1"><summary>ヒント</summary>

完全な崩壊では、どの射影も定数 $u^\top c$、つまり分散ゼロの点質量になり、どの $u$ でも単位ガウスから遠く離れます。次元の崩壊では、$u^\top z = (u^\top e_1)\, z_1$ の分散は $(u^\top e_1)^2 \operatorname{Var}(z_1)$ です。高次元ではほとんどのランダムな $u$ でこれはゼロに近いので、大半の方向でほぼ定数の射影が見え、罰せられます。Cramér-Wold の定理により、すべての 1 次元射影が $\mathcal{N}(0,1)$ に一致すれば、分布はちょうど $\mathcal{N}(0, I)$ になります。

</details>

**次回：** 本記事は世界モデルシリーズの最終回です。続きは[身体性AI（Embodied AI）]({{ '/blog/category/embodied-ai/' | relative_url }})シリーズへどうぞ。基礎に立ち返りたい場合は[第 1 回]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})に戻ってください。
