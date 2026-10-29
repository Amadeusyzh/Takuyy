---
layout: post
title: "生成モデルの道具箱：VAE、トークナイザ、トランスフォーマー、拡散モデル、フローマッチング"
date: 2026-10-27 15:02:00+0900
description: "現代の世界モデルを構成する生成モデル：VAE と ELBO、VQ-VAE トークナイザ、自己回帰トランスフォーマー、DDPM、スコア/SDE の視点、DDIM、潜在拡散、classifier-free guidance、フローマッチング、DiT を、実行可能な PyTorch コードとともに解説します。"
categories: world-models
tags: [world-models, vae, vq-vae, diffusion, flow-matching, dit]
series: world-models
series_order: 2
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 1 回]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }}) で見た世界モデル（world model）は、タスクごとに訓練される小さなネットワークでした。VAE と RNN の組み合わせや、RSSM です。今日の動画ベースの世界シミュレータ（Sora、Genie、GameNGen、Cosmos；[第 3 回]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})）や 3D 世界生成器（[第 4 回]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})）は、同じ少数の生成モデルの構成要素から組み立てられています。ピクセルを圧縮する **オートエンコーダ（autoencoder）またはトークナイザ（tokenizer）** と、圧縮された系列をモデル化する **系列モデル（sequence model）**（自己回帰トランスフォーマー、拡散モデルまたはフローモデルで、通常はトランスフォーマーをバックボーンとします）です。本記事では各構成要素を丁寧に導出し、世界モデルの論文を曖昧な理解のまま読み流すことなく読み解き、拡散モデルをゼロから実装できるようになることを目指します。

## 前提知識

- 本シリーズの第 1 回（RSSM は系列版の VAE です）。
- 確率：ガウス分布、KL ダイバージェンス（KL divergence）、ベイズの定理（Bayes' rule）、イェンセンの不等式（Jensen's inequality）。
- PyTorch の基礎。コードは CPU で動作します。

## 1. 問題設定と全体像

サンプル $x \sim p_{\mathrm{data}}(x)$（画像、動画クリップ、トークン列）が観測されており、そこから **サンプリング** でき、多くの場合は何らかの $c$（テキスト、過去のフレーム、行動）で **条件付け** でき、ときには **評価** もできるモデル $p_\theta(x)$ が欲しいとします。モデルの系統ごとにトレードオフは異なります。

| 系統 | サンプリング | 尤度 | 世界モデルにおける典型的な役割 |
| --- | --- | --- | --- |
| VAE | デコーダを 1 回通すだけ | 下界（ELBO） | フレームを潜在変数に圧縮する（Ha & Schmidhuber の V、潜在拡散のオートエンコーダ） |
| VQ-VAE / トークナイザ | （トークン上の事前分布が必要） | - | フレームをトランスフォーマー用の離散トークンに変換する（IRIS、GAIA-1、Genie） |
| 自己回帰トランスフォーマー | 逐次的、1 トークンずつ | 厳密 | 次トークン予測によるダイナミクス（GAIA-1、Genie） |
| 拡散 / スコアモデル | 反復的なノイズ除去（数十ステップ） | 下界 / ODE | フレームおよび動画の生成（Sora、GameNGen、DIAMOND、Cosmos） |
| フローマッチング / Rectified Flow | ODE の積分（数ステップから数十ステップ） | ODE 経由 | 現代の画像・動画バックボーン（Stable Diffusion 3、多くの動画モデル） |

ここでは GAN は省略します。GAN は補助的な損失（VQGAN）としては今も登場しますが、世界モデルの中核になることはまれです。

## 2. 変分オートエンコーダ

### 2.1 ELBO

潜在変数モデル（latent-variable model）は、単純な事前分布 $p(z) = \mathcal{N}(0, I)$ を用いて $p_\theta(x) = \int p_\theta(x \mid z)\, p(z)\, dz$ と書けます。この積分は計算困難なので、エンコーダ $q_\phi(z \mid x)$ を導入してイェンセンの不等式を適用します。

$$
\ln p_\theta(x) = \ln \mathbb{E}_{q_\phi(z\mid x)}\left[\frac{p_\theta(x\mid z)\,p(z)}{q_\phi(z\mid x)}\right]
\;\ge\; \underbrace{\mathbb{E}_{q_\phi(z\mid x)}\big[\ln p_\theta(x\mid z)\big] - \mathrm{KL}\big(q_\phi(z\mid x)\,\Vert\,p(z)\big)}_{\mathrm{ELBO}(x;\,\theta,\phi)}.
$$

ギャップはちょうど $\mathrm{KL}(q_\phi(z \mid x) \Vert p_\theta(z \mid x))$ なので、証拠下界（evidence lower bound, ELBO）を最大化すると、データへのフィットと同時に、エンコーダが真の事後分布を近似するようにもなります。対角ガウス分布のエンコーダ $q_\phi(z \mid x) = \mathcal{N}(\mu, \mathrm{diag}\,\sigma^2)$ を用いると、KL 項は閉形式で書けます。

$$
\mathrm{KL}\big(\mathcal{N}(\mu, \mathrm{diag}\,\sigma^2)\,\Vert\,\mathcal{N}(0, I)\big) = \frac{1}{2}\sum_{j}\left(\mu_j^2 + \sigma_j^2 - 1 - \ln \sigma_j^2\right).
$$

### 2.2 再パラメータ化トリック

$z$ のサンプリングを通して逆伝播するために、$\epsilon \sim \mathcal{N}(0, I)$ として $z = \mu_\phi(x) + \sigma_\phi(x) \odot \epsilon$ と書きます。これでランダム性は入力側に移り、勾配は $\mu$ と $\sigma$ を通って流れます。同じトリック（再パラメータ化トリック, reparameterization trick）は Dreamer の行動や確率的状態にも使われています（第 1 回）。

図は、乱数がどこに置かれ、勾配がどの経路を通るかを示しています。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-reparam.svg" localized="true" width="85%" caption="再パラメータ化：エンコーダは $\mu$ と $\sigma$ を出力し、ノイズ $\epsilon$ は外部からの入力として入り（破線）、$z = \mu + \sigma \odot \epsilon$ はこの 3 つの決定論的な関数になります。そのため再構成損失をエンコーダについて微分できます（赤い矢印）。" %}

### 2.3 VAE の得意なことと苦手なこと

ガウス型デコーダでは $-\ln p_\theta(x \mid z)$ は L2 損失になり、不確実性について平均を取ってしまうため、**ぼやけた（blurry）** サンプルが生成されます。KL を $\beta$ で重み付けすること（$\beta$-VAE）で、再構成とより規則的な潜在空間とのトレードオフを取れます。デコーダが強すぎると $z$ を無視してしまうことがあります（**事後分布の崩壊, posterior collapse**）。現代のシステムでは、VAE が生成器そのものになることはまれです。代わりに **知覚的圧縮器（perceptual compressor）** として使われます。これは KL の重みを小さくし、知覚損失と敵対的損失を加えた畳み込みオートエンコーダで、$256 \times 256 \times 3$ の画像をたとえば $32 \times 32 \times 4$ の潜在変数に写像し、その上で拡散モデルが動作します（第 6 節）。

KL と再構成のトレードオフを描ける潜在空間で確かめるため、16 ピクセルの玩具「画像」（それぞれ位置 $c$ と幅がランダムなガウス状の山を 1 つ含む）で、2 次元潜在変数の小さな VAE を $\beta = 1$ と $\beta = 0.05$ の 2 通りで学習しました。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-vae-latent.svg" caption="テスト入力 70 個に対するエンコーダの事後分布 $q_\phi(z\mid x)$。点が平均、楕円が 1 標準偏差、色が真の山の位置です。破線と点線の円は事前分布 $\mathcal{N}(0, I)$ の 1 および 2 標準偏差の等高線です。$\beta = 1$ では事後分布は広く、事前分布の内側にとどまります（KL 4.4 nats）。$\beta = 0.05$ では点にまで縮み（KL 8.2 nats）、再構成は良くなりますが、ほぼ決定論的なオートエンコーダのように振る舞います。どちらでも、位置は潜在空間に沿って滑らかに変化しています。" %}

## 3. VQ-VAE と視覚トークナイザ

**VQ-VAE**（van den Oord et al., NeurIPS 2017）は潜在変数を **離散** にします。エンコーダはベクトルのグリッド $z_e(x)$ を出力し、それぞれのベクトルは学習されたコードブック（codebook）$\lbrace e_k \rbrace_{k=1}^{K}$ の中で最も近いエントリに置き換えられます。

$$
z_q(x) = e_{k^\ast}, \qquad k^\ast = \arg\min_k \lVert z_e(x) - e_k \rVert_2 .
$$

argmin には勾配がないため、デコーダの勾配はそのままエンコーダへコピーされます（コードでは $z_q = z_e + \mathrm{sg}(z_q - z_e)$）。損失は次のとおりです。

$$
\mathcal{L} = -\ln p(x \mid z_q(x)) + \lVert \mathrm{sg}[z_e(x)] - e \rVert_2^2 + \beta\, \lVert z_e(x) - \mathrm{sg}[e] \rVert_2^2 ,
$$

ここで第 2 項はコードブックのベクトルをエンコーダ出力に近づけ、第 3 項（**コミットメント損失（commitment loss）**、論文では $\beta = 0.25$）はエンコーダを選ばれたコードの近くに保ちます。多くの実装では、コードブックの項を指数移動平均（exponential moving average）による更新に置き換えています。

2 次元なら量子化のステップをそのまま描けます。各コードブックベクトルが 1 つのボロノイ領域を受け持ちます。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-vq-voronoi.svg" width="75%" caption="$K = 12$ 個のベクトルからなるコードブック（星印）。2 次元のエンコーダ出力（灰色：リングと中央の塊）上で VQ 損失のコードブック項によって学習しました。色付きの領域は argmin のボロノイ領域で、領域内のすべての $z_e$ はその領域のコードに置き換えられます（オレンジの矢印）。デコーダが見るのはこの 12 個の星だけ、つまり各位置で 12 種類のトークンのいずれかです。" %}

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class VectorQuantizer(nn.Module):
    def __init__(self, num_codes=512, dim=64, beta=0.25):
        super().__init__()
        self.codebook = nn.Embedding(num_codes, dim)
        self.codebook.weight.data.uniform_(-1 / num_codes, 1 / num_codes)
        self.beta = beta

    def forward(self, z_e):                       # z_e: [..., dim]
        flat = z_e.reshape(-1, z_e.shape[-1])
        d = (flat.pow(2).sum(1, keepdim=True)     # squared distances to every code
             - 2 * flat @ self.codebook.weight.t()
             + self.codebook.weight.pow(2).sum(1))
        idx = d.argmin(1)
        z_q = self.codebook(idx).view_as(z_e)
        loss = F.mse_loss(z_q, z_e.detach()) + self.beta * F.mse_loss(z_e, z_q.detach())
        z_q = z_e + (z_q - z_e).detach()          # straight-through estimator
        return z_q, idx.view(z_e.shape[:-1]), loss

vq = VectorQuantizer()
z_q, tokens, loss = vq(torch.randn(2, 16, 16, 64))   # a 16x16 grid of tokens per image
print(tokens.shape, loss.item())
```

離散トークンは画像を「文」に変え、トランスフォーマーが交差エントロピーでモデル化できるようにします。**VQGAN**（Esser et al., CVPR 2021）は知覚損失とパッチ GAN 損失を加え、小さなトークングリッドでもシャープな画像にデコードできるようにしました。動画の場合、トークナイザは因果的な 3D 畳み込みやトランスフォーマーを用いて空間 *と* 時間を圧縮します。MAGVIT-v2（Yu et al., ICLR 2024）はコードブックの探索を **ルックアップフリー量子化（lookup-free quantization）** に置き換えました（各潜在チャネルが $\pm 1$ に量子化されるため、「コードブック」は暗黙的になり、非常に大きくできます）。また NVIDIA の Cosmos トークナイザは連続版と離散版の両方を提供しています。GAIA-1 や Genie はこうした動画トークナイザの上に構築されています。

## 4. 自己回帰トランスフォーマー

トークン列上の任意の分布は、連鎖律（chain rule）によって次のように分解できます。

$$
p_\theta(x_1, \dots, x_N) = \prod_{i=1}^{N} p_\theta(x_i \mid x_{\lt i}).
$$

**因果的アテンションマスク（causal attention mask）** を持つデコーダのみのトランスフォーマーは、訓練中に $N$ 個の条件付き分布をすべて並列に計算し（**教師強制, teacher forcing**）、損失は交差エントロピーの総和 $-\sum_i \ln p_\theta(x_i \mid x_{\lt i})$ です。世界モデルでは、系列はフレームのトークンと行動を交互に並べたもの、たとえば `[frame_1 tokens][a_1][frame_2 tokens][a_2]...` となり、次フレームのトークンの予測が過去のフレームと行動に条件付けられるようにします。

図は、4 トークンのフレーム 3 枚と行動 2 つを交互に並べた系列に対する因果マスクです。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-ar-mask.svg" width="70%" caption="因果的アテンションマスク：行 $i$ は列 $j \le i$ にだけ注意できます（トークンの種類で色分け、灰色はマスク）。強調した行は $a_2$ の位置で、その出力は前の 2 フレームと 2 つの行動からフレーム 3 の最初のトークンを予測します。教師強制では 14 行すべてが 1 回の並列計算で求まります。" %}

実用上の問題が 2 つあります。

- **サンプリングコスト**：$16 \times 16$ トークンのフレームを生成するには 256 回の逐次ステップが必要です。**MaskGIT**（Chang et al., CVPR 2022）はその代わりに、ランダムにマスクされたトークンを予測する *双方向* トランスフォーマーを訓練し、最も確信度の高い予測を残していくことで、約 8〜16 回の並列的な改善ステップでフレームをデコードします。Genie のダイナミクスモデルはこの方式のデコードを用いています。
- **露出バイアス（exposure bias）/ ドリフト**：訓練中のモデルは常に正解データに条件付けられますが、テスト時には自分自身のサンプルに条件付けられるため、長いロールアウトの中で誤差が累積します。これは第 1 回で扱った誤差累積の問題の系列モデル版であり、長期的な動画世界モデルすべてにとって中心的な難しさです。

## 5. 拡散モデル

### 5.1 順過程

**ノイズ除去拡散確率モデル（denoising diffusion probabilistic models, DDPM**；Ho, Jain, Abbeel, NeurIPS 2020。Sohl-Dickstein et al., ICML 2015 を基盤とする）は、分散スケジュール $\beta_1, \dots, \beta_T$ に従ってガウスノイズを徐々に加える固定されたマルコフ連鎖を定義します。

$$
q(x_t \mid x_{t-1}) = \mathcal{N}\big(x_t;\ \sqrt{1-\beta_t}\, x_{t-1},\ \beta_t I\big).
$$

$\alpha_t = 1 - \beta_t$、$\bar\alpha_t = \prod_{s=1}^{t} \alpha_s$ とすると、ガウス分布の合成により、任意のステップへ直接ジャンプするための閉形式が得られます。

$$
q(x_t \mid x_0) = \mathcal{N}\big(x_t;\ \sqrt{\bar\alpha_t}\, x_0,\ (1-\bar\alpha_t) I\big)
\quad\Longleftrightarrow\quad
x_t = \sqrt{\bar\alpha_t}\, x_0 + \sqrt{1-\bar\alpha_t}\, \epsilon,\ \ \epsilon \sim \mathcal{N}(0, I).
$$

$T$ が大きく、スケジュールが適切であれば、$\bar\alpha_T \approx 0$ となり、$x_T$ は本質的に純粋なノイズになります。

図は、この閉形式を 10 節の 2 次元玩具データ（8 個のガウス分布の混合）に、同じ線形スケジュールで適用したものです。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-forward.svg" width="85%" caption="1500 個のサンプルに対する順過程 $x_t = \sqrt{\bar\alpha_t}\,x_0 + \sqrt{1-\bar\alpha_t}\,\epsilon$（色は混合成分。$t$ は 10 節のコードと同じ 0 始まりのステップ）。クラスタはまずぼやけ、次に原点に向かって縮みながら合流します。$t = 400$（$\bar\alpha_t = 0.19$）では成分が重なり合い、$t = 999$ では点群は $\mathcal{N}(0, I)$ と区別できません。" %}

{% include blog_figure.liquid path="assets/img/blog/world-models/02-schedule.svg" width="85%" caption="線形スケジュール $\beta_t \in [10^{-4}, 0.02]$、$T = 1000$ における閉形式の 2 つの係数。信号とノイズの重みは $t \approx 259$ で交差し、そこで SN 比 $\bar\alpha_t / (1-\bar\alpha_t)$ が 1 になります。最後は $\bar\alpha_T \approx 4 \times 10^{-5}$ です。縦線は前の図のスナップショットの時刻です。" %}

### 5.2 逆過程と損失

$p(x_T) = \mathcal{N}(0, I)$ から始まる逆向きの連鎖 $p_\theta(x_{t-1} \mid x_t) = \mathcal{N}(x_{t-1};\ \mu_\theta(x_t, t),\ \sigma_t^2 I)$ を学習します。VAE の場合と同様に（順過程が固定されたエンコーダの役割を果たします）、負の ELBO はステップごとの KL 項に分解されます。

$$
-\ln p_\theta(x_0) \le \mathbb{E}_q\Big[\underbrace{\mathrm{KL}(q(x_T\mid x_0)\,\Vert\,p(x_T))}_{\text{constant}} + \sum_{t=2}^{T} \mathrm{KL}\big(q(x_{t-1}\mid x_t, x_0)\,\Vert\,p_\theta(x_{t-1}\mid x_t)\big) - \ln p_\theta(x_0\mid x_1)\Big].
$$

鍵となる事実は、**$x_0$ に条件付けた** 順過程の事後分布が、計算可能なガウス分布になることです（ガウス分布に対するベイズの定理）。

$$
q(x_{t-1} \mid x_t, x_0) = \mathcal{N}\big(x_{t-1};\ \tilde\mu_t(x_t, x_0),\ \tilde\beta_t I\big),\quad
\tilde\mu_t = \frac{\sqrt{\bar\alpha_{t-1}}\,\beta_t}{1-\bar\alpha_t}\, x_0 + \frac{\sqrt{\alpha_t}\,(1-\bar\alpha_{t-1})}{1-\bar\alpha_t}\, x_t,\quad
\tilde\beta_t = \frac{1-\bar\alpha_{t-1}}{1-\bar\alpha_t}\,\beta_t .
$$

$x_0 = (x_t - \sqrt{1-\bar\alpha_t}\,\epsilon)/\sqrt{\bar\alpha_t}$ を代入すると $\tilde\mu_t = \frac{1}{\sqrt{\alpha_t}}\big(x_t - \frac{\beta_t}{\sqrt{1-\bar\alpha_t}}\,\epsilon\big)$ が得られます。したがって、ネットワークにノイズを予測させ、$\mu_\theta(x_t, t) = \frac{1}{\sqrt{\alpha_t}}\big(x_t - \frac{\beta_t}{\sqrt{1-\bar\alpha_t}}\,\epsilon_\theta(x_t, t)\big)$ とするのが自然です。分散の等しい 2 つのガウス分布間の KL は、平均間の二乗距離をスケールしたものなので、次のようになります。

$$
\mathrm{KL}_t = \frac{\beta_t^2}{2\sigma_t^2\, \alpha_t\, (1-\bar\alpha_t)}\, \big\lVert \epsilon - \epsilon_\theta(x_t, t)\big\rVert^2 + \text{const}.
$$

Ho らは、実際には重みを取り除いたほうがうまくいくことを発見し、有名な **単純化損失（simple loss）** を導きました。

$$
\mathcal{L}_{\mathrm{simple}}(\theta) = \mathbb{E}_{x_0,\ t \sim \mathcal{U}\lbrace 1..T\rbrace,\ \epsilon}\Big[\big\lVert \epsilon - \epsilon_\theta\big(\sqrt{\bar\alpha_t}\,x_0 + \sqrt{1-\bar\alpha_t}\,\epsilon,\ t\big)\big\rVert^2\Big].
$$

したがって訓練は、画像、ランダムな時刻、ランダムなノイズを選び、画像を劣化させ、そのノイズを回帰するだけです。祖先サンプリング（ancestral sampling）では、$\sigma_t^2 = \beta_t$ または $\tilde\beta_t$ として、$t = T$ から $1$ まで $x_{t-1} = \mu_\theta(x_t, t) + \sigma_t z$ を実行します。

10 節とまったく同じ方法で学習したネットワークで逆向きの連鎖を実行すると、次のようになります。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-reverse.svg" width="85%" caption="10 節のノイズ予測 MLP（4000 ステップ学習）による祖先的 DDPM サンプリング（1000 ステップ）。1500 個のサンプルのスナップショットで、十字は真のモードです。最初の数百ステップでは目に見える変化はなく、$t \approx 150$ あたりでリングが現れ、モードが分かれるのは最後の 50 ステップです。$t = 0$ ではサンプルの 98.5% があるモードから 0.5 以内にあり、8 個のモードすべてがカバーされています。" %}

等価な **パラメータ化（parameterization）** もよく使われます。$x_0$ を直接予測するものや、「速度（velocity）」$v = \sqrt{\bar\alpha_t}\,\epsilon - \sqrt{1-\bar\alpha_t}\,x_0$ を予測するものです（後者はスケジュールの両端でうまく振る舞うため、多くの動画モデルで使われています）。

### 5.3 スコアの視点と SDE

なぜノイズの予測がうまくいくのでしょうか。**Tweedie の公式（Tweedie's formula）** によれば、$x_t = \sqrt{\bar\alpha_t} x_0 + \sqrt{1-\bar\alpha_t}\,\epsilon$ に対して、ノイズの事後平均はノイズの乗った周辺分布の **スコア（score）** と結びついています。

$$
\nabla_{x_t} \ln p_t(x_t) = -\frac{\mathbb{E}[\epsilon \mid x_t]}{\sqrt{1-\bar\alpha_t}}
\qquad\Rightarrow\qquad
s_\theta(x_t, t) := -\frac{\epsilon_\theta(x_t, t)}{\sqrt{1-\bar\alpha_t}} \approx \nabla_{x_t} \ln p_t(x_t).
$$

ノイズ予測損失は（重み付けを除けば）**ノイズ除去スコアマッチング（denoising score matching）**（Vincent, 2011）であり、デノイザは各ノイズレベルでデータの方向を指す勾配場を推定しています（Song & Ermon の NCSN, NeurIPS 2019）。

2 次元の玩具データでは、ノイズを加えた各周辺分布の真のスコアが閉形式で分かるので、学習済みデノイザをそれと照らし合わせられます。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-score-field.svg" width="85%" caption="矢印は学習済みネットワークの $-\epsilon_\theta(x_t, t)$（上）と、厳密な $-\mathbb{E}[\epsilon \mid x_t] = \sqrt{1-\bar\alpha_t}\,\nabla \ln p_t$（下）の向きを示します。灰色の点は $x_t$ のサンプルです。$t$ が小さいと場は最も近いモードを指し、$t$ が大きいとノイズの乗った周辺分布は 1 つの塊になり、場はその中心を指します。学習した向きと厳密な向きの平均コサイン類似度は $t = 30$、200、600 でそれぞれ 0.94、0.97、0.99 です。" %}

Song ら（ICLR 2021）は連続時間で両方の視点を統一しました。順方向の **確率微分方程式（stochastic differential equation, SDE）** $dx = f(x, t)\,dt + g(t)\,dw$ はデータをノイズへと拡散させます。DDPM は **分散保存（variance-preserving）** SDE $dx = -\tfrac{1}{2}\beta(t)\,x\,dt + \sqrt{\beta(t)}\,dw$ の離散化です。Anderson の定理により、この過程は次の **逆時間 SDE（reverse SDE）** に従って時間を逆向きに進みます。

$$
dx = \big[f(x, t) - g(t)^2\, \nabla_x \ln p_t(x)\big]\,dt + g(t)\,d\bar w,
$$

さらに、同じ周辺分布 $p_t$ を持つ決定論的な **確率フロー ODE（probability-flow ODE）** が存在します。

$$
\frac{dx}{dt} = f(x, t) - \frac{1}{2}\, g(t)^2\, \nabla_x \ln p_t(x).
$$

スコアを $s_\theta$ で置き換えれば、任意の SDE ソルバや ODE ソルバでサンプリングできます。ODE の視点は、はるかに少ないステップ数のサンプラーが存在する理由を説明し、厳密な尤度を与え、さらに拡散モデルをフローマッチングへと結びつけます（第 8 節）。

{% include widget.liquid name="world-models-diffusion-explorer" height="560" caption="試してみましょう：スライダーで $t$ を変えます。順方向モードではサンプルに固定の $\epsilon$ でノイズを加え、逆方向モードでは 500 個のノイズサンプルを決定論的 DDIM（100 ステップ）でデノイズし、最終的に行き着くモードで色分けします。矢印は現在の $t$ における厳密なスコアの向きです。黒いプローブをドラッグすると、黒い矢印が $-\mathbb{E}[\epsilon \mid x_t]$（0.5 倍）、オレンジの曲線がプローブから $t = 0$ までの確率フロー経路を示します。" %}

### 5.4 DDIM：高速な決定論的サンプリング

**DDIM**（Song, Meng, Ermon, ICLR 2021）は、訓練損失が周辺分布 $q(x_t \mid x_0)$ にしか依存しないことに着目し、同じ周辺分布を持つ任意の非マルコフ過程を使ってよいことを指摘しました。その更新式は、まずクリーンなサンプルを予測し、次にそれをノイズレベル $t-1$ まで再びノイズ化します。

$$
\hat x_0 = \frac{x_t - \sqrt{1-\bar\alpha_t}\,\epsilon_\theta(x_t, t)}{\sqrt{\bar\alpha_t}},\qquad
x_{t-1} = \sqrt{\bar\alpha_{t-1}}\,\hat x_0 + \sqrt{1-\bar\alpha_{t-1}-\sigma_t^2}\;\epsilon_\theta(x_t, t) + \sigma_t z .
$$

$\sigma_t = 0$ のときサンプラーは決定論的になり（確率フロー ODE の離散化）、時刻の部分列（たとえば 1000 ステップ中の 50 ステップ）上で動作し、各ノイズベクトルを一意のサンプルに写像するため、反転（inversion）や補間が可能になります。$\eta = 1$ として $\sigma_t = \eta\sqrt{\tilde\beta_t}$ とすると DDPM が再現されます。

図では、2 つのサンプラーを同じ 4 つのノイズベクトルから出発させています。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-ddim-vs-ddpm.svg" caption="学習済み玩具モデルによる、ノイズ（丸）からサンプル（四角）までの軌道。左：DDPM の祖先的サンプリングは 1000 ステップの毎回で新しいノイズを注入するため、経路はさまよい、関係のないモードに行き着きます。右：$\eta = 0$ の DDIM は 50 ステップで滑らかな決定論的経路をたどるので、各ノイズベクトルにはちょうど 1 つのサンプルが対応します。2000 サンプル中 94.9% があるモードから 0.5 以内に入り、8 個のモードすべてがカバーされます。" %}

## 6. 潜在拡散

$256 \times 256 \times 3$ のピクセル上で拡散を実行するのは、動画はもちろんのこと、それだけでもコストが高く、しかも画像のビットの大部分は知覚できない細部です。**潜在拡散（latent diffusion）**（Rombach et al., CVPR 2022；Stable Diffusion の基礎）は、オートエンコーダ（KL または VQ による正則化と、知覚損失 + GAN 損失を持つ $\mathcal{E}, \mathcal{D}$）を一度だけ訓練し、$z = \mathcal{E}(x)$ の上で拡散を実行します。

$$
\mathcal{L}_{\mathrm{LDM}} = \mathbb{E}_{\mathcal{E}(x),\,c,\,\epsilon,\,t}\Big[\big\lVert \epsilon - \epsilon_\theta(z_t, t, \tau_\theta(c))\big\rVert^2\Big],
$$

ここで $\tau_\theta(c)$ は条件（たとえばクロスアテンションを通して与えられるテキスト）をエンコードします。ほぼすべての動画世界モデルはこの意味での潜在モデルです。Sora の「時空間パッチ（spacetime patches）」は圧縮された動画潜在表現のパッチであり、GameNGen は Stable Diffusion v1.4 をファインチューニングしています。

図はデータの流れをまとめたものです。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-latent-diffusion.svg" localized="true" caption="潜在拡散：一度だけ学習して固定したオートエンコーダ（$\mathcal{E}$、$\mathcal{D}$）が $256 \times 256 \times 3$ の画像を $32 \times 32 \times 4$ の潜在変数（数値の数は 48 分の 1）に写します。拡散のステップはすべて潜在変数上で行い、条件は $\tau_\theta$ を通して注入します。ピクセルに戻すのは最後の潜在変数だけです。" %}

## 7. Classifier-free guidance

条件付き拡散モデルは、弱い条件を無視してしまうことがよくあります。**Classifier-free guidance**（Ho & Salimans, NeurIPS 2021 workshop）は、1 つのネットワークを条件付きと無条件の両方で訓練し（約 10〜20% の確率で $c$ をヌルトークン $\varnothing$ に置き換えます）、サンプリング時には次のように外挿します。

$$
\tilde\epsilon_\theta(x_t, c) = \epsilon_\theta(x_t, \varnothing) + w\,\big(\epsilon_\theta(x_t, c) - \epsilon_\theta(x_t, \varnothing)\big).
$$

（$w = 1$ は通常の条件付きサンプリングです。元の論文では、$w^\prime = w - 1$ として同じものを $(1+w^\prime)\,\epsilon(c) - w^\prime\,\epsilon(\varnothing)$ と書いています。）スコアの言葉で言えば、$\nabla \ln p(c \mid x) = \nabla \ln p(x \mid c) - \nabla \ln p(x)$ であることから、ガイダンスは鋭くされた分布からサンプリングしていることになります。

$$
\nabla_x \ln \tilde p(x \mid c) = \nabla_x \ln p(x) + w\, \nabla_x \ln p(c \mid x) \;\propto\; \text{score of } p(x)\, p(c \mid x)^{w}.
$$

$w$ を大きくすると、条件によく合致する一方で多様性の低いサンプルが得られます。行動条件付きの世界モデルでは、同じトリックが **行動**（あるいは過去のフレーム）に適用されます。GameNGen などは、モデルがプレイヤーの入力により忠実に従うようにガイダンスを用いています。

8 個のガウス分布の玩具データでは、条件付きスコア（1 つの成分）と無条件スコア（混合全体）がどちらも厳密に分かるので、図はネットワーク誤差抜きでガイダンスの効果を示しています。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-cfg.svg" caption="厳密なスコアによる classifier-free guidance（クラス = 混合成分、DDIM 200 ステップ、全パネルで同じ 600 個のノイズベクトル）。上：クラス 0（紫、右）とクラス 3（オレンジ、左上）のサンプル。下：クラス 0 の拡大図で、破線の円は真のクラスの 2 標準偏差です。$w = 1$ はクラスを正確に再現します。$w = 3$ と $w = 7$ ではサンプルがずっと狭くなると同時に、他のクラスから遠ざかる方向へ押し出され、実データの外に出ます（平均のずれ 0.16 と 0.33）。ガイダンスは多様性を、やがては忠実度をも代償にして「そのクラスらしさ」を得ているのです。" %}

## 8. フローマッチングと Rectified Flow

拡散モデルの ODE の視点は、より単純なレシピを示唆します。ノイズをデータへと輸送する速度場を直接学習すればよいのです。**フローマッチング（flow matching）**（Lipman et al., ICLR 2023）と **Rectified Flow**（Liu, Gong, Liu, ICLR 2023）は、ノイズサンプル $x_0 \sim \mathcal{N}(0, I)$ とデータサンプル $x_1$ の間の直線補間を用います。

$$
x_t = (1-t)\,x_0 + t\,x_1,\qquad \frac{dx_t}{dt} = x_1 - x_0,\qquad t \in [0, 1].
$$

**条件付きフローマッチング（conditional flow matching）** の損失は、ネットワークをこのペアごとの速度に回帰させます。

$$
\mathcal{L}_{\mathrm{CFM}}(\theta) = \mathbb{E}_{t,\,x_0,\,x_1}\Big[\big\lVert v_\theta(x_t, t) - (x_1 - x_0)\big\rVert^2\Big].
$$

各目標値は特定の 1 ペアの速度ですが、最小化解は条件付き期待値 $v^\ast(x, t) = \mathbb{E}[x_1 - x_0 \mid x_t = x]$ であり、これはちょうど、その ODE $dx/dt = v^\ast(x, t)$ が $\mathcal{N}(0, I)$ を $p_{\mathrm{data}}$ へと輸送する **周辺（marginal）** 速度場になっています。条件付き目的関数と周辺目的関数の勾配は一致します。サンプリングは $t = 0$ から $1$ までの通常の ODE 積分（Euler 法または Heun 法）です。

図は、同じノイズ点とデータ点のペアについて、2 つの方法のペアごとの経路を比べたものです。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-flow-vs-diffusion.svg" caption="同じ 10 組の（ノイズ, データ）ペア。黒い点がノイズ、四角がデータです（2 つのタイトルでは命名の慣習が逆である点に注意）。左：$t = 999$ から $0$ までたどったガウス拡散の補間は弧になり、点は 50 ステップごとです。右：フローマッチングの補間は一定速度で進む直線分です（点は等間隔の時刻）。これらは回帰の目標として使う条件付き経路であり、サンプラーが積分する周辺 ODE は、異なるペアが交差するところで曲がります（下のウィジェットで試してください）。" %}

注意点：

- 慣習は論文によって異なります。Rectified Flow や Stable Diffusion 3 では、データを $t = 0$、ノイズを $t = 1$ に置きます。数式を写す前に、各論文の定義を確認してください。
- ガウス拡散は、曲がった補間経路（$t$ と $1-t$ の代わりに $\sqrt{\bar\alpha_t}$ と $\sqrt{1-\bar\alpha_t}$）を持つ特殊ケースです。$x_t$ が与えられれば、フローモデルの速度と拡散モデルの $\epsilon$ は互いに線形変換の関係にあります。
- Rectified Flow の **リフロー（reflow）** 手順は、（ノイズ、生成サンプル）のペアで再訓練することで軌道をさらにまっすぐにし、非常に少ないステップ数でのサンプリングを可能にします。
- Esser et al., "Scaling Rectified Flow Transformers for High-Resolution Image Synthesis"（ICML 2024）は、トランスフォーマーをバックボーンとする Rectified Flow がうまくスケールすることを示しました。最近の多くの動画モデルはフローマッチングで訓練されています。

実際に重要なのは、ソルバーのステップがどれだけ少なくて済むかです。図は、玩具混合分布の厳密な周辺場をごく少数の等間隔ステップで積分したものです。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-few-step.svg" width="85%" caption="厳密な場の上で $N$ ステップのソルバーを走らせた後の 1500 サンプルの終点。拡散には DDIM（$\eta = 0$、等間隔の時刻）、フローマッチングには Euler 法を使っています。1 ステップではどちらもデータの平均、つまり 1 回で出せる最良の推測に落ちます。4 ステップではフローマッチングがすでにサンプルの 89% をモードの近くに置くのに対し、DDIM は 14% です。16 ステップでは両者は近くなります（100% と 98%）。正確な数値は時間グリッドに依存しますが、この差こそがフローモデルが少ステップのサンプリングで好まれる理由です。" %}

{% include widget.liquid name="world-models-flow-paths" height="560" caption="試してみましょう：黒いノイズサンプルをドラッグします。細い曲線は拡散（オレンジ、DDIM）とフローマッチング（紫、Euler）の厳密な ODE 経路で、点は等間隔の時刻にあるので速さが分かります。太い破線は同じソルバーを $N$ ステップ（スライダー）だけ使ったもの、四角はその終点です。2 本の厳密な経路は同じデータ点で終わります。ガウス経路では 2 つの ODE は空間と時間のスケール変換（$x_{\mathrm{fm}} = x_{\mathrm{vp}} / (\sqrt{\bar\alpha_t} + \sqrt{1-\bar\alpha_t})$）だけが異なるからです。違うのは経路に沿った速さであり、それが $N$ ステップのソルバーが最も近いモードにどこまで近づけるかを決めます。" %}

## 9. 拡散トランスフォーマー（DiT）

デノイザはもともと U-Net でした。**DiT**（Peebles & Xie, ICCV 2023）は、これを潜在パッチ上の素の Vision Transformer に置き換えました。潜在表現を $p \times p$ のパッチに切り分け、線形埋め込みを行い、トランスフォーマーブロックで処理し、パッチを元に戻してノイズ（と分散）を予測します。時刻とクラスの条件は **適応的レイヤー正規化（adaptive layer norm）** を通して入力されます。小さな MLP が条件をブロックごとのスケールとシフトのパラメータに写像し、**adaLN-Zero** 変種ではさらにゼロで初期化されたゲートにも写像することで、各ブロックが恒等写像から始まるようにします。この論文は、モデルを深く / 広くしたりパッチサイズを小さくしたりして計算量（Gflops）を増やすにつれて、サンプルの品質が着実に向上することを示しています。DiT-XL/2 はクラス条件付き ImageNet 256x256 で FID 2.27 を達成しました。

図は、DiT の中での 1 回のデノイズステップをたどったものです。

{% include blog_figure.liquid path="assets/img/blog/world-models/02-dit.svg" caption="DiT：ノイズの乗った潜在変数を $p \times p$ のパッチに切り分け（ここでは $8 \times 8$ の潜在変数を $p = 2$ で 16 トークンに）、位置埋め込みを加えて $N$ 個の Transformer ブロックで処理します。時刻とクラスは adaLN-Zero を通して入ります。MLP がブロックごとのスケール $\gamma$、シフト $\beta$、ゼロ初期化されたゲート $\alpha$ を生成します。出力トークンはパッチを元の配置に戻され（unpatchify）、予測ノイズ（と分散）になります。$p$ を半分にするとトークン数は 4 倍になります。" %}

これが世界モデルにとって重要な理由：トランスフォーマーは動画を単にパッチのより長い系列として扱います。Sora のレポートはまさにこれ、すなわち圧縮された動画潜在表現の **時空間パッチ** 上の拡散トランスフォーマーを、さまざまな長さ、解像度、アスペクト比の動画で訓練したものを記述しています。行動や過去のフレームによる条件付けは、「トークンを増やす」か「adaLN の入力を増やす」ことになります。

## 10. コード：PyTorch による最小限の DDPM（とフローマッチング）

以下のスクリプトは、8 個のガウス分布からなる 2 次元の混合分布でノイズ予測 MLP を訓練し、DDPM の祖先サンプリング（1000 ステップ）と DDIM（50 ステップ）の両方でサンプリングします。ノート PC の CPU で約 1 分で実行できます。2 次元のトイ問題は拡散モデルの実装をデバッグする最良の方法です。サンプルがモードの上に落ちているかどうかをすぐに確認できるからです。

```python
import math
import torch
import torch.nn as nn

torch.manual_seed(0)

def sample_data(n):
    """Mixture of 8 Gaussians on a circle of radius 2."""
    k = torch.randint(0, 8, (n,))
    ang = k.float() * (2 * math.pi / 8)
    centers = 2.0 * torch.stack([torch.cos(ang), torch.sin(ang)], dim=1)
    return centers + 0.1 * torch.randn(n, 2)

# ---- noise schedule (DDPM linear schedule) ----
T = 1000
betas = torch.linspace(1e-4, 0.02, T)
alphas = 1.0 - betas
alpha_bar = torch.cumprod(alphas, dim=0)

def time_embedding(t, dim=32):
    """Sinusoidal embedding of integer timesteps t in [0, T)."""
    half = dim // 2
    freqs = torch.exp(-math.log(10000.0) * torch.arange(half) / half)
    args = t.float()[:, None] * freqs[None]
    return torch.cat([torch.sin(args), torch.cos(args)], dim=1)

class Denoiser(nn.Module):
    def __init__(self, hidden=256):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(2 + 32, hidden), nn.SiLU(),
            nn.Linear(hidden, hidden), nn.SiLU(),
            nn.Linear(hidden, hidden), nn.SiLU(),
            nn.Linear(hidden, 2))

    def forward(self, x, t):
        return self.net(torch.cat([x, time_embedding(t)], dim=1))

model = Denoiser()
opt = torch.optim.Adam(model.parameters(), lr=1e-3)

# ---- training: L_simple ----
for step in range(4000):
    x0 = sample_data(512)
    t = torch.randint(0, T, (512,))
    eps = torch.randn_like(x0)
    ab = alpha_bar[t][:, None]
    xt = ab.sqrt() * x0 + (1 - ab).sqrt() * eps
    loss = ((model(xt, t) - eps) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
    if step % 1000 == 0:
        print(f"step {step:4d}  loss {loss.item():.4f}")

@torch.no_grad()
def ddpm_sample(n):
    x = torch.randn(n, 2)
    for t in reversed(range(T)):
        tt = torch.full((n,), t)
        eps = model(x, tt)
        mean = (x - betas[t] / (1 - alpha_bar[t]).sqrt() * eps) / alphas[t].sqrt()
        x = mean + (betas[t].sqrt() * torch.randn_like(x) if t > 0 else 0)
    return x

@torch.no_grad()
def ddim_sample(n, steps=50, eta=0.0):
    ts = torch.linspace(T - 1, 0, steps).long()
    x = torch.randn(n, 2)
    for i, t in enumerate(ts):
        ab = alpha_bar[t]
        ab_prev = alpha_bar[ts[i + 1]] if i + 1 < steps else torch.tensor(1.0)
        eps = model(x, torch.full((n,), int(t)))
        x0_hat = (x - (1 - ab).sqrt() * eps) / ab.sqrt()
        sigma = eta * ((1 - ab_prev) / (1 - ab) * (1 - ab / ab_prev)).sqrt()
        x = ab_prev.sqrt() * x0_hat + (1 - ab_prev - sigma ** 2).sqrt() * eps + sigma * torch.randn_like(x)
    return x

def mode_coverage(x):
    """Fraction of samples within 0.5 of a mode, and how many of the 8 modes are hit."""
    ang = torch.arange(8).float() * (2 * math.pi / 8)
    centers = 2.0 * torch.stack([torch.cos(ang), torch.sin(ang)], dim=1)
    d = torch.cdist(x, centers)
    near = d.min(dim=1).values < 0.5
    return near.float().mean().item(), d.argmin(dim=1)[near].unique().numel()

for name, xs in [("DDPM 1000 steps", ddpm_sample(2000)), ("DDIM 50 steps", ddim_sample(2000))]:
    frac, modes = mode_coverage(xs)
    print(f"{name}: {100 * frac:.1f}% of samples near a mode, {modes}/8 modes covered")
```

**フローマッチング** に切り替える場合、変わるのは訓練の目標値とサンプラーだけです。`Denoiser` を再利用します（時刻の入力は $t \in [0, 1]$ を 1000 倍したものになり、同じ正弦波埋め込みがそのまま使えます）。

```python
fm = Denoiser()
opt = torch.optim.Adam(fm.parameters(), lr=1e-3)
for step in range(4000):
    x1 = sample_data(512)                       # data at t = 1
    x0 = torch.randn_like(x1)                   # noise at t = 0
    t = torch.rand(512)
    xt = (1 - t)[:, None] * x0 + t[:, None] * x1
    loss = ((fm(xt, t * 1000) - (x1 - x0)) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()

@torch.no_grad()
def fm_sample(n, steps=50):
    x = torch.randn(n, 2)
    for i in range(steps):                      # explicit Euler from t = 0 to 1
        t = torch.full((n,), i / steps)
        x = x + fm(x, t * 1000) / steps
    return x

frac, modes = mode_coverage(fm_sample(2000))
print(f"Flow matching 50 Euler steps: {100 * frac:.1f}% near a mode, {modes}/8 modes covered")
```

（`time_embedding` は `.float()` を呼ぶだけなので、浮動小数点の時刻も受け付けます。）試してみるとよいこと：DDIM とフローマッチングでいくつかのサンプルの軌道をプロットし、どれだけまっすぐかを比較する。クラスラベルと classifier-free guidance を追加する。MLP を 2 つの「トークン」上の小さなトランスフォーマーに置き換える。

## 11. 各要素は世界モデルにどう対応するか

| システム | 圧縮器 | ダイナミクス / 生成器 | 条件付け |
| --- | --- | --- | --- |
| World Models (2018) | VAE | MDN-RNN | 行動 |
| DreamerV3 | （RSSM のエンコーダ） | カテゴリカル潜在変数を持つ RSSM | 行動 |
| IRIS (2023) | 離散オートエンコーダ | 自己回帰トランスフォーマー | 行動トークン |
| GAIA-1 (2023) | 画像トークナイザ | 自己回帰トランスフォーマー + 動画拡散デコーダ | 動画、テキスト、行動 |
| Genie (2024) | 時空間 VQ トークナイザ | MaskGIT 方式のダイナミクストランスフォーマー | 学習された潜在行動 |
| GameNGen (2024) | Stable Diffusion のオートエンコーダ | 潜在拡散（SD v1.4 をファインチューニング） | 過去のフレーム + 行動 |
| Sora (2024) | 動画圧縮ネットワーク | 時空間パッチ上の拡散トランスフォーマー | テキスト、画像、動画 |
| Cosmos (2025) | Cosmos トークナイザ | 拡散型および自己回帰型の世界基盤モデル | テキスト、動画、（事後訓練による）行動 |

第 3 回では、これらの動画世界シミュレータの中身を見ていきます。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | 重要な理由 |
| --- | --- | --- | --- | --- |
| Auto-Encoding Variational Bayes (Kingma, Welling) | ICLR | 2014 | [arXiv:1312.6114](https://arxiv.org/abs/1312.6114) | VAE、ELBO、再パラメータ化 |
| Neural Discrete Representation Learning (VQ-VAE, van den Oord et al.) | NeurIPS | 2017 | [arXiv:1711.00937](https://arxiv.org/abs/1711.00937) | 離散潜在変数 / 視覚トークン |
| Taming Transformers for High-Resolution Image Synthesis (VQGAN, Esser et al.) | CVPR | 2021 | [arXiv:2012.09841](https://arxiv.org/abs/2012.09841) | 知覚損失 + GAN のトークナイザ、トランスフォーマーによる事前分布 |
| MaskGIT: Masked Generative Image Transformer (Chang et al.) | CVPR | 2022 | [arXiv:2202.04200](https://arxiv.org/abs/2202.04200) | トークンの並列デコード |
| Deep Unsupervised Learning using Nonequilibrium Thermodynamics (Sohl-Dickstein et al.) | ICML | 2015 | [arXiv:1503.03585](https://arxiv.org/abs/1503.03585) | 拡散モデルの起源 |
| Generative Modeling by Estimating Gradients of the Data Distribution (NCSN, Song, Ermon) | NeurIPS | 2019 | [arXiv:1907.05600](https://arxiv.org/abs/1907.05600) | スコアベース生成モデル |
| Denoising Diffusion Probabilistic Models (Ho, Jain, Abbeel) | NeurIPS | 2020 | [arXiv:2006.11239](https://arxiv.org/abs/2006.11239) | 単純なノイズ予測損失 |
| Score-Based Generative Modeling through Stochastic Differential Equations (Song et al.) | ICLR | 2021 | [arXiv:2011.13456](https://arxiv.org/abs/2011.13456) | SDE / 確率フロー ODE による統一 |
| Denoising Diffusion Implicit Models (DDIM, Song, Meng, Ermon) | ICLR | 2021 | [arXiv:2010.02502](https://arxiv.org/abs/2010.02502) | 高速な決定論的サンプリング |
| High-Resolution Image Synthesis with Latent Diffusion Models (Rombach et al.) | CVPR | 2022 | [arXiv:2112.10752](https://arxiv.org/abs/2112.10752) | 学習された潜在空間での拡散 |
| Classifier-Free Diffusion Guidance (Ho, Salimans) | NeurIPS Workshop | 2021 | [arXiv:2207.12598](https://arxiv.org/abs/2207.12598) | 分類器を用いないガイダンス |
| Elucidating the Design Space of Diffusion-Based Generative Models (EDM, Karras et al.) | NeurIPS | 2022 | [arXiv:2206.00364](https://arxiv.org/abs/2206.00364) | ノイズレベル、前処理（preconditioning）、サンプラーの明快なパラメータ化 |
| Flow Matching for Generative Modeling (Lipman et al.) | ICLR | 2023 | [arXiv:2210.02747](https://arxiv.org/abs/2210.02747) | 連続フローのシミュレーション不要な訓練 |
| Flow Straight and Fast: Rectified Flow (Liu, Gong, Liu) | ICLR | 2023 | [arXiv:2209.03003](https://arxiv.org/abs/2209.03003) | まっすぐな経路、リフロー |
| Scalable Diffusion Models with Transformers (DiT, Peebles, Xie) | ICCV | 2023 | [arXiv:2212.09748](https://arxiv.org/abs/2212.09748) | トランスフォーマーによるデノイザ、adaLN-Zero、スケーリング |
| Scaling Rectified Flow Transformers for High-Resolution Image Synthesis (Esser et al.) | ICML | 2024 | [arXiv:2403.03206](https://arxiv.org/abs/2403.03206) | Rectified Flow + トランスフォーマーの大規模化（SD3） |
| Language Model Beats Diffusion: Tokenizer is Key to Visual Generation (MAGVIT-v2, Yu et al.) | ICLR | 2024 | [arXiv:2310.05737](https://arxiv.org/abs/2310.05737) | ルックアップフリー量子化による動画トークナイザ |

## 学習リソース

- Lilian Weng, ["What are Diffusion Models?"](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/)（2021、その後も更新あり）：DDPM、スコアの視点、DDIM、ガイダンスを 1 つの記事で最も明快に導出しています。
- S. Prince, *Understanding Deep Learning*（MIT Press, 2023）の VAE、正規化フロー（normalizing flows）、拡散モデルの章：[udlbook.github.io/udlbook](https://udlbook.github.io/udlbook/) で PDF が無料公開されています。
- Stanford の [CS236: Deep Generative Models](https://deepgenerativemodels.github.io/)（講義ノートと講義）。
- 実運用品質のスケジューラとパイプラインには Hugging Face の [diffusers](https://github.com/huggingface/diffusers)、また Meta の [flow_matching](https://github.com/facebookresearch/flow_matching) ライブラリ。

## 演習

1. 独立なガウス分布の和がガウス分布であることを用いて、$q(x_t \mid x_0) = \mathcal{N}(\sqrt{\bar\alpha_t}x_0, (1-\bar\alpha_t)I)$ を帰納法で証明してください。
2. ベイズの定理 $q(x_{t-1} \mid x_t, x_0) \propto q(x_t \mid x_{t-1})\, q(x_{t-1} \mid x_0)$ から、平方完成によって $\tilde\mu_t$ と $\tilde\beta_t$ を導出してください。
3. DDPM のスクリプトで、DDIM を 10、50、200 ステップ、および $\eta \in \lbrace 0, 1 \rbrace$ で比較してください。ステップ数を減らしたとき、どちらが先に劣化するでしょうか。
4. クラスラベル（モードのインデックス）を追加し、15% のラベルドロップアウトで訓練してください。classifier-free guidance を実装し、$w \in \lbrace 1, 3, 7 \rbrace$ についてサンプルをプロットしてください。各モードの広がりはどうなるでしょうか。
5. 線形経路 $x_t = (1-t)x_0 + t x_1$ について、速度予測器 $v_\theta$ とノイズ予測器が $\hat\epsilon = x_t - t\,v_\theta(x_t, t)$ という関係にあることを示してください。

**次回：** [第 3 回]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }}) では、これらの道具を使って動画ベースの世界シミュレータを構築します。Sora、Genie 1-3、GameNGen、UniSim、GAIA-1、Cosmos です。
