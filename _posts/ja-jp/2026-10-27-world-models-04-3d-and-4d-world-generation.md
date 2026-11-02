---
layout: post
title: "明示的な世界：3D・4D 世界生成"
date: 2026-10-27 15:04:00+0900
description: "明示的な 3D・4D 世界の生成：スコア蒸留（DreamFusion、VSD）、マルチビュー拡散、インペインティングと深度によるシーン拡張（Text2Room、LucidDreamer、WonderJourney、WonderWorld）、ガウシアンによるシーン生成、4D 生成、World Labs の Marble、そしてピクセル空間の動画世界モデルとのトレードオフを解説します。"
categories: world-models
tags: [world-models, 3d-generation, score-distillation, gaussian-splatting, 4d-generation]
series: world-models
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 3 回]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})の動画世界シミュレータは、世界全体をネットワークとそのコンテキストウィンドウ（context window）の中に暗黙的に保持しています。だからこそ、背後にあるものを忘れてしまうのです。これと正反対の設計では、メッシュ（mesh）、NeRF、3D ガウシアンの集合などの**明示的な 3D（または 4D）表現**（explicit 3D/4D representation）を保持し、生成モデルはそれを*作成*したり*拡張*したりするためだけに使います。いったん世界が 3D として存在すれば、古典的なレンダラーがマルチビュー一貫性（multi-view consistency）を保証してくれます。オブジェクト単位で編集でき、スマートフォンや VR ヘッドセット上でリアルタイムに動かすことができ、物理エンジンに渡すこともできます。[ニューラルレンダリングと 3DGS シリーズ]({{ '/blog/category/neural-rendering/' | relative_url }})から来た読者にとって、本記事はそのシリーズと世界モデルが出会う場所です。表現はすでにおなじみのものであり、新しい問いは、それをテキストや 1 枚の画像からどう*生成*するかです。

## 前提知識

- 拡散モデル、classifier-free ガイダンス（classifier-free guidance）、DDIM（[第 2 回]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})）。
- 輝度場（radiance field）と 3D ガウシアン・スプラッティング（3D Gaussian Splatting；Kerbl et al., SIGGRAPH 2023 / ACM TOG 42(4)）：微分可能レンダリング（differentiable rendering）$x = g(\theta, \text{camera})$。
- ピンホールカメラモデル（pinhole camera model）：内部パラメータ $K$、カメラからワールドへの姿勢 $[R \mid t]$、深度を用いた逆投影（unprojection）。

## 1. 根本的な難しさ：インターネット規模の 3D データが存在しない

キャプション付きの画像や動画は何十億とありますが、3D アセットは数百万個しかなく、大規模で高品質な 3D シーンとなるとごくわずかです。そのため、本記事のどの手法も 2D 事前分布（2D prior；画像または動画の拡散モデル）を**借用**し、それを 3D へと持ち上げ（lift）ます。主な戦略は 4 つあります。

| 戦略 | アイデア | 例 | 速度 |
| --- | --- | --- | --- |
| スコア蒸留（score distillation） | 3D 表現のすべてのレンダリングが 2D 拡散モデルのもとで尤もらしく見えるように、その 3D 表現を最適化する | DreamFusion, Magic3D, ProlificDreamer, DreamGaussian | アセットあたり数分〜数時間 |
| マルチビュー生成（multi-view generation）+ 再構成 | 3D を意識した拡散モデルで一貫した複数の視点画像を生成し、それから再構成する | Zero-1-to-3, MVDream, CAT3D | 約 1 分 |
| フィードフォワード（feed-forward）3D | 大規模ネットワークが画像から 3D 表現を直接出力する | LRM とその後継 | 数秒 |
| シーン拡張（scene growing；インペインティング inpainting + 深度） | 現在のシーンを新しいカメラからレンダリングし、穴を 2D モデルでインペイントし、単眼深度で 3D に持ち上げて融合する | Text2Room, LucidDreamer, WonderJourney, WonderWorld | シーンあたり数秒〜数時間 |

オブジェクトは主に最初の 3 つで扱われます。一方、**シーンや世界**は無限に広がり、部屋スケールのレイアウトを必要とするため、主に 4 つ目の戦略か、これらすべてを組み合わせたシステム（Marble、第 6 節）で扱われます。

## 2. スコア蒸留サンプリング（score distillation sampling, SDS）

### 2.1 導出

**DreamFusion**（Poole et al., ICLR 2023, [arXiv:2209.14988](https://arxiv.org/abs/2209.14988)）は、ランダムなカメラからのレンダリング $x = g(\theta)$ が、プロンプト $y$ を与えた凍結済みのテキスト画像拡散モデル $\hat\epsilon_\phi(x_t; y, t)$ からのサンプルのように見えるよう、NeRF のパラメータ $\theta$ を最適化します。自然な発想は、拡散モデルの学習損失をネットワークではなく*画像*について最小化することです。

$$
\mathcal{L}_{\mathrm{diff}}(\theta) = \mathbb{E}_{t,\epsilon}\Big[w(t)\,\big\lVert \hat\epsilon_\phi(\alpha_t x + \sigma_t \epsilon;\ y, t) - \epsilon \big\rVert^2\Big], \qquad x = g(\theta).
$$

この勾配には U-Net のヤコビアン（Jacobian）$\partial \hat\epsilon_\phi / \partial x_t$ が含まれますが、これは計算コストが高く、論文によればうまく機能しません。これを取り除くと **SDS 勾配**が得られます。

$$
\nabla_\theta \mathcal{L}_{\mathrm{SDS}} = \mathbb{E}_{t,\epsilon}\Big[w(t)\,\big(\hat\epsilon_\phi(x_t;\ y, t) - \epsilon\big)\,\frac{\partial x}{\partial \theta}\Big].
$$

直感的には次のとおりです。レンダリングにノイズを加え、拡散モデルにどのノイズが「見える」かを尋ね、残差 $(\hat\epsilon - \epsilon)$ が小さくなる方向にレンダリングを押し動かします。論文では、これがノイズを加えたレンダリングの分布 $q(x_t \mid x = g(\theta))$ とモデルのノイズ付き周辺分布 $p_\phi(x_t \mid y)$ との間の KL ダイバージェンス（KL divergence）の重み付き和の勾配であることが示されています。$\hat\epsilon_\phi \approx -\sigma_t \nabla \ln p_t$（第 2 回の第 5.3 節）なので、SDS はノイズレベルについて平均した、ノイズ付きレンダリングの対数密度に対する勾配上昇です。つまり **モードシーキング**（mode seeking）なのです。

図は SDS の 1 ステップをたどったものです。

{% include blog_figure.liquid path="assets/img/blog/world-models/04-sds-loop.svg" localized="true" caption="SDS の 1 回の更新：ランダムなカメラからシーンを描画し、描画結果にランダムなレベル $t$ のノイズを加え、固定したテキスト条件付き拡散モデルにノイズを予測させ、残差 $w(t)(\hat\epsilon_\phi - \epsilon)$ を微分可能レンダラ経由で $\theta$ に戻します（赤）。拡散モデルは一切更新されず、そのヤコビアンも計算されません。" %}

### 2.2 実用上の帰結

- DreamFusion は鮮明な結果を得るために非常に大きな classifier-free ガイダンスの重み（$w = 100$）を用いました。これがモードシーキングと組み合わさることで、SDS アセットに典型的な**彩度過多で過度に平滑化された**（over-saturated, over-smoothed）見た目と、シード間の多様性の低さが生じます。
- 2D 事前分布には 3D 上の同一性という概念がないため、各視点がオブジェクトの「典型的な」視点のように見えようとします。その結果、顔がいくつもできてしまうことがあります（**Janus 問題**、Janus problem）。視点に依存したプロンプト（"front view"、"back view"）は助けになりますが、3D を意識した事前分布（第 3 節）のほうがより根本的に解決します。
- **Magic3D**（Lin et al., CVPR 2023）は、粗から密へ（coarse-to-fine）のスケジュールでこれを高速化します（まず粗いニューラル場を作り、次にテクスチャ付きメッシュを高解像度で潜在拡散の事前分布を使って最適化します）。
- **ProlificDreamer**（Wang et al., NeurIPS 2023）は**変分スコア蒸留**（variational score distillation, VSD）を提案しています。3D シーンを確率変数として扱い、SDS 残差のノイズ $\epsilon$ を、現在のレンダリングの分布を追跡するよう LoRA でファインチューニングした 2 つ目の拡散モデルの予測に置き換えます。

$$
\nabla_\theta \mathcal{L}_{\mathrm{VSD}} = \mathbb{E}_{t,\epsilon,c}\Big[w(t)\,\big(\hat\epsilon_{\phi}(x_t;\ y, t) - \hat\epsilon_{\mathrm{lora}}(x_t;\ y, t, c)\big)\,\frac{\partial x}{\partial \theta}\Big],
$$

  ここで $c$ はカメラです。この手法は通常のガイダンス重み（例えば 7.5）で機能し、はるかに精細で多様な結果を生み出します。
- **DreamGaussian**（Tang et al., ICLR 2024）と **GaussianDreamer**（Yi et al., CVPR 2024）は NeRF を 3D ガウシアンに置き換えます。これによりレンダリングが大幅に高速化し、デンシフィケーション（densification）がジオメトリを成長させる自然な手段になります。DreamGaussian は約 2 分でテクスチャ付きメッシュを生成します。

### 2.3 動かせるトイ例：SDS はモードシーキングである

以下のスクリプトは、8 個のガウス分布の混合（第 2 回とまったく同じ）で小さな 2D 拡散モデルを学習し、続いて 512 個の自由な 2D 点を「シーン」$\theta$、恒等写像を「レンダラー」$g$ とみなして、SDS で最適化します。最適化された点の広がりを、実際のサンプルの広がりと比べてみてください。

```python
import math
import torch
import torch.nn as nn

torch.manual_seed(0)
T = 1000
betas = torch.linspace(1e-4, 0.02, T)
alpha_bar = torch.cumprod(1 - betas, dim=0)
ang = torch.arange(8).float() * (2 * math.pi / 8)
CENTERS = 2.0 * torch.stack([torch.cos(ang), torch.sin(ang)], dim=1)

def sample_data(n):
    return CENTERS[torch.randint(0, 8, (n,))] + 0.1 * torch.randn(n, 2)

def temb(t, dim=32):
    freqs = torch.exp(-math.log(10000.0) * torch.arange(dim // 2) / (dim // 2))
    a = t.float()[:, None] * freqs[None]
    return torch.cat([torch.sin(a), torch.cos(a)], 1)

net = nn.Sequential(nn.Linear(34, 256), nn.SiLU(), nn.Linear(256, 256), nn.SiLU(),
                    nn.Linear(256, 256), nn.SiLU(), nn.Linear(256, 2))
eps_model = lambda x, t: net(torch.cat([x, temb(t)], 1))

# 1) "pretrain" the 2D prior with the DDPM loss
opt = torch.optim.Adam(net.parameters(), lr=1e-3)
for step in range(4000):
    x0, t = sample_data(512), torch.randint(0, T, (512,))
    eps = torch.randn_like(x0)
    ab = alpha_bar[t][:, None]
    loss = ((eps_model(ab.sqrt() * x0 + (1 - ab).sqrt() * eps, t) - eps) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
net.requires_grad_(False)

# 2) score distillation: theta are free parameters, "rendering" x = g(theta) = theta
theta = (0.5 * torch.randn(512, 2)).requires_grad_(True)
opt = torch.optim.Adam([theta], lr=1e-2)
for step in range(2000):
    t_max = int(980 - 930 * step / 2000)                      # anneal the noise level from high to low
    t = torch.randint(20, t_max, (512,))
    eps = torch.randn_like(theta)
    ab = alpha_bar[t][:, None]
    with torch.no_grad():
        x_t = ab.sqrt() * theta + (1 - ab).sqrt() * eps
        grad = eps_model(x_t, t) - eps                       # w(t) = 1
    opt.zero_grad()
    theta.grad = grad                                         # SDS: skip the network Jacobian
    opt.step()

def spread(x):
    d = torch.cdist(x, CENTERS)
    idx = d.argmin(1)
    return (x - CENTERS[idx]).norm(dim=1).mean().item(), idx.unique().numel()

with torch.no_grad():
    s_real, m_real = spread(sample_data(512))
    s_sds, m_sds = spread(theta)
print(f"real data : mean distance to nearest mode {s_real:.3f}, modes covered {m_real}/8")
print(f"SDS points: mean distance to nearest mode {s_sds:.3f}, modes covered {m_sds}/8")
```

SDS の点は、実際のサンプルよりもモード中心にずっと近いところに落ち着きます。各点は分布の広がりを再現するのではなく、近くの密度のピークへと登っていくのです。3D では、これがまさに SDS アセットの過度に平滑化された「平均的に見える」テクスチャに相当します。（どのモードがカバーされるかは初期化に依存します。各粒子は単に最も近い丘を登るだけだからです。）`grad` の中の $\epsilon$ を、現在の粒子で学習した 2 つ目のモデルの予測に置き換えれば、トイ版の VSD になります。ループ内のノイズスケジュールが**アニーリング**されている点にも注意してください。毎ステップ $t$ を全範囲から一様にサンプリングすると、高ノイズの項が支配的になります。大きな $t$ でのノイズ付き周辺分布はデータ平均のまわりの単一の塊なので、粒子はモードではなく円の中心へと引き寄せられてしまいます（試してみてください）。ProlificDreamer の 2 段階の時間スケジュールのように最適化中に最大タイムステップを下げていけば、まず大まかな配置が決まり、その後に細部が整います。

このスクリプトと、$t$ を一様にサンプリングする変種を実行すると次のようになります（各パネルの数値：最も近いモードまでの平均距離と、カバーしたモード数）。

{% include blog_figure.liquid path="assets/img/blog/world-models/04-sds-toy.svg" width="85%" caption="学習済みの玩具事前分布で 512 個の自由な 2 次元点に SDS をかけた結果。アニーリングするスケジュールでは、点はまずリングを作り、それからモードに登っていき、モード中心からの平均距離は 0.062 と実サンプルの広がり（0.121）の半分になります。これがモード探索です。$t$ を全範囲から一様に引くと、高ノイズの項が点を中心へ引き続けるため、点はより小さな円の上で止まります（平均半径は 2 ではなく 1.53）。" %}

## 3. 3D を意識した事前分布：マルチビュー拡散とフィードフォワードモデル

2D 事前分布に 3D の認識が欠けていることと格闘する代わりに、3D データでファインチューニングしてカメラを理解させることができます。

- **Zero-1-to-3**（Liu et al., ICCV 2023）は Stable Diffusion をファインチューニングし、入力画像と相対的なカメラ変換が与えられたときにオブジェクトの新規視点を合成できるようにします。SDS の事前分布として使うと、Janus 問題が大きく軽減されます。
- **MVDream**（Shi et al., ICLR 2024）はビュー間アテンション（cross-view attention）を用いて複数の視点を同時に生成するため、各視点が互いに一貫します。
- **CAT3D**（Gao et al., NeurIPS 2024）は、マルチビュー拡散モデルを使って 1 枚または数枚の画像から*シーン*の一貫した新規視点を多数生成し、そこから NeRF に似た表現を約 1 分で再構成します。
- **LRM**（Hong et al., ICLR 2024）は、1 枚の画像を数秒でトライプレーン（triplane）NeRF に変換する大規模な Transformer で、大規模な 3D オブジェクトデータセットで学習されています。多くの後続研究は 3D ガウシアンを直接出力します。
- **DUSt3R**（Wang et al., CVPR 2024）のような姿勢不要の再構成（pose-free reconstruction）は、カメラが未知のまま画像ペアから密な 3D ポイントマップ（point map）を予測します。これにより、生成した画像を共通の 3D 座標系へ持ち上げるのが容易になります。

一般的な教訓は、**データのある 2D で生成し、一貫性が必要な 3D で再構成する**ということです。シーン生成器もこのように動作します。

*更新（2026 年 11 月）：* DUSt3R の後継（VGGT、π³、MapAnything、Depth Anything 3）は、多数の視点のカメラと幾何を 1 回で予測できるようになり、2025〜2026 年のいくつかの生成器は動画モデルの潜在表現から 3D ガウシアンや三角形を直接デコードします。本記事末尾の 2025〜2026 年の進展の節を参照してください。

## 4. 反復的なインペインティングと持ち上げによるシーン生成

### 4.1 ループ

**Text2Room**（Höllein et al., ICCV 2023, [arXiv:2303.11989](https://arxiv.org/abs/2303.11989)）は、テキストだけから部屋スケールのテクスチャ付きメッシュを初めて生成しました。その後のほとんどのシーン生成器に共通するループは次のとおりです。

1. 新しいカメラ姿勢から現在のシーンを**レンダリング**します。既存のジオメトリで覆われていないピクセルがマスク $M$ を形成します。
2. テキスト条件付きの 2D インペインティングモデル（inpainting model；Stable Diffusion inpainting）でマスク領域を**インペイント**します。
3. 単眼深度ネットワーク（monocular depth network）で新しい画像の**深度を推定**します。
4. 既知のピクセル上で、予測された深度を既存ジオメトリの深度に**位置合わせ**します（単眼深度はスケールとシフトの不定性を除いてしか定義されません）。
5. 新しいピクセルを 3D に**逆投影**し、シーンに**融合**します（Text2Room ではメッシュ、後の研究では点やガウシアン）。

サイクルとして描くと次のようになります。

{% include blog_figure.liquid path="assets/img/blog/world-models/04-scene-loop.svg" localized="true" width="75%" caption="Text2Room、LucidDreamer、WonderJourney、WonderWorld に共通するシーン成長ループ。各回で、新しいカメラから見えるのにシーンがまだ覆っていない領域にジオメトリを追加します。追加したものはシーンに残るので、以降の視点は構造上それと一貫します。" %}

Text2Room はこれを、慎重に選んだカメラ軌道で部屋のレイアウトを作る*生成*段階と、残った穴を埋めるための追加の視点を選ぶ*補完*段階に分けています。視点の選択は重要で、軌道が悪いと深度の不連続部分で引き伸ばされたジオメトリが生じます。

### 4.2 幾何とコード

深度の位置合わせは、既知ピクセルの集合 $\mathcal{K}$ 上の最小二乗問題です。

$$
(s^\ast, b^\ast) = \arg\min_{s, b} \sum_{p \in \mathcal{K}} \big(s\, \hat d_p + b - d_p\big)^2,
$$

その後、位置合わせ済みの深度 $d = s^\ast \hat d + b^\ast$ を持つピクセル $(u, v)$ は、次のようにワールド座標へ逆投影されます。

$$
X_{\mathrm{world}} = R\, \big(d\, K^{-1} [u, v, 1]^\top\big) + t .
$$

```python
import numpy as np

rng = np.random.default_rng(0)
H, W = 48, 64
K = np.array([[60.0, 0, W / 2], [0, 60.0, H / 2], [0, 0, 1]])

# ground-truth depth of a tilted plane (stands in for the true scene)
v, u = np.mgrid[0:H, 0:W]
d_true = 3.0 + 0.02 * u + 0.01 * v

# monocular depth = unknown affine transform of the truth + noise (relative depth)
d_mono = (d_true - 1.2) / 2.5 + 0.01 * rng.standard_normal((H, W))

# pixels already covered by the existing scene (left half) have known depth
known = u < W // 2
A = np.stack([d_mono[known], np.ones(known.sum())], axis=1)
s, b = np.linalg.lstsq(A, d_true[known], rcond=None)[0]
d_aligned = s * d_mono + b
print(f"scale {s:.3f}, shift {b:.3f}; error on NEW pixels: "
      f"{np.abs(d_aligned - d_true)[~known].mean():.4f} (unaligned {np.abs(d_mono - d_true)[~known].mean():.3f})")

def unproject(depth, K, R=np.eye(3), t=np.zeros(3), mask=None):
    """Lift pixels to world-space points: X = R (d K^-1 [u, v, 1]) + t."""
    vv, uu = np.mgrid[0:depth.shape[0], 0:depth.shape[1]]
    pix = np.stack([uu, vv, np.ones_like(uu)], axis=-1).reshape(-1, 3).astype(float)
    rays = pix @ np.linalg.inv(K).T                 # camera-space rays with z = 1
    pts = rays * depth.reshape(-1, 1)
    pts = pts @ R.T + t
    return pts if mask is None else pts[mask.reshape(-1)]

new_points = unproject(d_aligned, K, mask=~known)   # only the inpainted (new) region
print("new points:", new_points.shape, "z range:", new_points[:, 2].min().round(2), new_points[:, 2].max().round(2))
```

実際のパイプラインでは、位置合わせを領域ごとに行ったり、既知の深度を条件とする深度補完ネットワーク（depth completion network）を使ったりすることがよくあります。単一の大域的なアフィンフィッティングでは、誤った深度の*形状*を修正できないためです。WonderWorld（後述）は、その手法を**ガイド付き深度拡散**（guided depth diffusion）と呼んでいます。

図はこのスクリプトが計算する内容を示しています。

{% include blog_figure.liquid path="assets/img/blog/world-models/04-depth-align.svg" width="75%" caption="上：既知のピクセルでは、シーンの深度は単眼予測のアフィン関数です。最小二乗で $s = 2.47$、$b = 1.23$（真値は 2.5 と 1.2）が求まり、新しいピクセルの誤差は 2.99 から 0.021 に下がります。下：カメラ座標系に逆投影した点（OpenCV の慣習で $z$ が前方、$y$ が下向き。図では $-y$ を上に描画）。整列した新しい点（オレンジ）は既存の平面（青）につながりますが、整列していない点（灰色）はカメラの約 1 単位手前に浮いてしまいます。" %}

### 4.3 メッシュからガウシアンへ、部屋から旅へ

- **LucidDreamer**（Chung et al., [arXiv:2311.13384](https://arxiv.org/abs/2311.13384), 2023；後に IEEE TVCG に掲載）は、「夢見る」ステップ（新しい視点からのインペインティング + 深度推定）と、新しい点を既存の点群に統合する「位置合わせ」ステップを実行し、その点群で **3D ガウシアン・スプラッティング**を初期化して、生成した画像上で最適化します。入力はテキスト、RGB、RGB-D のいずれでもよく、結果はドメインを問わずリアルタイムにレンダリングできるシーンになります。（Liang et al., CVPR 2024 による同名のテキストから 3D オブジェクトを生成する手法と混同しないでください。）
- **WonderJourney**（Yu et al., CVPR 2024, [arXiv:2312.03884](https://arxiv.org/abs/2312.03884)）は、画像またはテキストから出発して、多様でありながらつながった 3D シーンの長い連なりをたどる*旅*を生成します。大規模言語モデル（large language model）が次のシーンの説明を書き、視覚モジュールがインペインティングと深度を使ってそれを点群として構築し、視覚言語モデル（vision-language model）が各結果にアーティファクトがないかをチェックして、必要なら再生成を指示します。
- **WonderWorld**（Yu et al., CVPR 2025, [arXiv:2406.09394](https://arxiv.org/abs/2406.09394)）はこれを**インタラクティブ**にしました。ユーザーがカメラを動かし、何が現れるべきかを入力すると、単一の A6000 GPU 上で 10 秒以内に新しいつながったシーンが生成されます。単一視点と少しの最適化だけで済むジオメトリベースの初期化である **FLAGS**（fast layered Gaussian surfels、高速レイヤードガウシアンサーフェル）、ディスオクルージョン（disocclusion）に対処するためのレイヤーごとの生成、そして一貫した深度のためのガイド付き深度拡散を用いています。著者らは、シーンには前向きの面しかないため、見ることのできる範囲が限られると述べています。

この系統の手法は、第 3 回のインタラクティブな動画世界モデルに最も近い明示的な対応物です。カメラとテキストによって駆動され、探索に応じて世界を広げていきますが、広がっていくのは**永続的な 3D アセット**（persistent 3D asset）です。

## 5. 4D：時間を加える

4D の世界とは、3D 表現にダイナミクス（dynamics）を加えたものです。よく使われる表現は 2 つあります。**動的 NeRF**（dynamic NeRF；時間を条件とする場）と、**変形可能な 3D ガウシアン**（deformable 3D Gaussians）です。後者では、正準空間のガウシアンが変形場 $\Delta\mu, \Delta q, \Delta s = D_\psi(\mu, t)$ によって動かされます（4D Gaussian Splatting、Wu et al., CVPR 2024, [arXiv:2310.08528](https://arxiv.org/abs/2310.08528) がその例で、撮影された動的シーンをリアルタイムにレンダリングします）。

時間を縦軸にとると、変形可能なガウスのシーンは次のように見えます。

{% include blog_figure.liquid path="assets/img/blog/world-models/04-4d-gaussians.svg" width="75%" caption="2 次元空間 + 時間での変形可能なガウス：同じ 10 個の正準ガウスを $t = 0, 0.5, 1$ に描き、曲線はその中心 $\mu + \Delta\mu(\mu, t)$ の軌跡です。ここでの変形は学習済みの $D_\psi$ の代わりに手で書いた渦と並進で、各ガウスを回転もさせます。任意の時刻 $t$ を描画するには、変形してから通常どおりスプラッティングします。" %}

生成ではやはり事前分布を借用しますが、今度は**動画**拡散モデルも含まれます。

- **MAV3D**（Singer et al., ICML 2023, [arXiv:2301.11280](https://arxiv.org/abs/2301.11280)）は最初のテキストから 4D への手法で、テキスト動画モデルからの SDS で動的 NeRF を最適化します。
- **4D-fy**（Bahmani et al., CVPR 2024, [arXiv:2311.17984](https://arxiv.org/abs/2311.17984)）はあるトレードオフに注目しています。画像モデルは良好な見た目と 3D 構造を与えますが動きを与えず、動画モデルは動きを与えますが見た目と構造は弱くなります。**ハイブリッド SDS**（hybrid SDS）は、両方の種類の事前分布（さらに 3D を意識した事前分布）からの勾配を交互に用います。
- **Align Your Gaussians**（Ling et al., CVPR 2024, [arXiv:2312.13763](https://arxiv.org/abs/2312.13763)）は、変形場を持つ動的な 3D ガウシアンを用い、テキスト画像・テキスト動画・マルチビューの各拡散モデルからのフィードバックを組み合わせ、自己回帰的な方式でより長いシーケンスをつなげます。
- **ダイナミクスモデルとしての物理。** 動画モデルから動きを蒸留する代わりに、それをシミュレーションすることもできます。**PhysGaussian**（Xie et al., CVPR 2024, [arXiv:2311.12198](https://arxiv.org/abs/2311.12198)）はガウシアンを連続体の粒子として扱い、物質点法（material point method, MPM）で時間積分するため、同じプリミティブがシミュレーションとレンダリングの両方に使われます。これは「動画モデルは物理を知らない」という指摘に対する、明示的な世界からの答えです。

## 6. World Labs の Marble と製品化された世界生成器

World Labs は 2025 年 9 月に **Marble** を限定ベータとして公開し、[2025 年 11 月 12 日](https://www.worldlabs.ai/blog/marble-world-model)に一般提供を開始しました。Marble はフレームをその場で生成するのではなく、テキスト、画像、動画、あるいは大まかな 3D レイアウトから**永続的でダウンロード可能な 3D 世界**を生成します。発表記事によれば、Marble の世界で最も忠実度の高い表現はガウシアンスプラットであり、世界はメッシュとしてもエクスポートできます（物理用の低忠実度のコライダーメッシュと、高品質なメッシュ）。**Chisel** という実験的なエディタでは、単純な形状やインポートしたアセットで構造を大まかに配置し、見た目をモデルに埋めてもらうことができます。モデルを説明する技術論文はなく、内部の仕組みは公開されていません。

*更新（2026 年 11 月）：* World Labs はその後、World API（2026 年 1 月）とウェブレンダラー Spark 2.0（2026 年 4 月）を追加し、2026 年 9 月には将来の Marble を支えるマルチモーダルモデル **Atlas** を発表しました。更新の節を参照してください。

Marble が参照点として有用なのは、明示的なルートをエンドツーエンドで体現しているからです。生成によってアセット（スプラット + メッシュ）が作られ、それが通常のグラフィックスやゲームのツールで利用されます。一方、ピクセル空間のルート（Genie 3）が生み出すのは、モデルが動いている間だけ存在する*体験*です。

## 7. トレードオフ：ピクセル vs. 明示的な 3D/4D

| 基準 | ピクセル空間の動画世界モデル（第 3 回） | 明示的な 3D / 4D 世界 |
| --- | --- | --- |
| マルチビュー一貫性 | 学習による近似的なもので、時間とともに劣化する | 静的なコンテンツについてはレンダラーが保証する |
| 記憶 / 永続性 | コンテキストウィンドウに制限される | 表現*そのもの*が記憶である |
| ダイナミクス、エージェント、エフェクト | 豊富で、動画から学習される（水、煙、キャラクター） | 難しい：4D 生成か明示的なシミュレータが必要 |
| 物理 | 暗黙的で、分布外ではしばしば誤る | 物理エンジンに接続できる（メッシュ、ガウシアン上の MPM）が、材質を推定する必要がある |
| 編集可能性 | プロンプトやワールドイベント経由で、精密ではない | オブジェクト単位の編集、スカルプト、再ライティング、エンジンへのエクスポート |
| 実行時のレンダリングコスト | フレームごとに大規模ネットワーク（GPU/TPU） | ラスタライズまたはスプラッティングで、一般向けハードウェアや VR 上でリアルタイム |
| コンテンツの汎用性 | 動画で見たものなら何でも | 主に静的なシーン。無限に広がるコンテンツや動的なコンテンツはより難しい |
| 行動に対するインタラクティブ性 | ネイティブ（行動で条件付け） | アセットの周りにゲームエンジンやシミュレータが必要 |

この表の核心は、世界の状態がどこにあるかです。

{% include blog_figure.liquid path="assets/img/blog/world-models/04-explicit-vs-pixel.svg" localized="true" width="85%" caption="状態がどこにあるか。ピクセル空間のモデルでは状態は直近フレームの窓だけで、各フレームは大規模なネットワークが生成するため、再訪した場所は再生成され、変わりうります。明示的な世界では状態は永続的なプリミティブの集合で、安価なレンダラが任意のカメラから描画でき、編集や物理はその状態に直接作用します。" %}

2 つのルートは収束しつつあります。動画モデルは一貫性を高めるために明示的な 3D 信号（カメラ軌道、点群、深度）で条件付けされるようになり、明示的なパイプラインは事前分布として動画モデルをますます利用するようになっています（CAT3D 方式のマルチビュー生成、4D-fy）。有望な研究の方向性の 1 つは**ハイブリッド世界モデル**（hybrid world model）です。明示的で永続的な 3D/4D 状態を学習済みのダイナミクスで更新し、スプラッティングか、明示的な状態では表現できないエフェクトのための生成的な「ニューラルレンダラー」（neural renderer）でレンダリングする、というものです。

## 8. 試してみよう：編集可能な明示的な世界

[ホームページのラボ]({{ '/' | relative_url }}#lab)にある **Gaussian World** タブは、明示的なルートを示すトイ例です。その世界は約 200,000 個の 3D ガウシアンでできており、3DGS のパイプライン（EWA 投影、深度ソート、アルファ合成）でレンダリングされます。プロンプトを入力するかプリセットを選んだら、地形を彫刻し、材質を塗り、オブジェクトを配置・消去し、谷を水で満たし、時刻を変え、一人称視点で歩き回ることができます。

正直に述べておくべき注意点が 2 つあります。第一に、生成器は**学習ではなく手続き的**なものです。キーワード駆動のプログラムがプロンプトを読み取り、地形、湖、森、村を構築します。実際のシステムでは、第 4 節のシーン生成器のような学習済みモデルに置き換えることになるでしょう。第二に、そのダイナミクス（風、季節、再ライティング）は手書きのシェーダーであり、学習されたものではありません。このデモがよく示しているのは、明示的なルートの*利点*です。すべての編集は局所的かつ永続的で、どの視点から見てもすぐに一貫しており、しかもレンダリングはブラウザ上でリアルタイムに動きます。これこそ、ピクセル空間の世界モデルが苦手とする点です。

デモに似た静的な例で、編集が局所的である理由を示します。

{% include blog_figure.liquid path="assets/img/blog/world-models/04-terrain-edit.svg" caption="3200 個のガウススプラットでできた手続き的な地形（高さは正弦波のオクターブの和、高さで色分け）と、ガウス状の盛り上がりを加える彫刻編集の前後。変わるのはブラシ付近の 334 個のスプラット（赤、10%）だけで、それ以外の部分、したがってそれをどの視点から見た結果も、まったく元のままです。" %}

## 2025〜2026 年の進展（2026 年 11 月時点）

この節では、2025 年から 2026 年 11 月初めまでの 3D・4D 世界生成を扱います。最大のポイントは、第 7 節の予測が予想より早く現実になったことです。2 つの路線は合流しました。動画モデルが幾何を出力するようになり、明示的な生成器は動画モデルをエンジンとして使うようになりました。もう一つの変化は、**フィードフォワード再構成**（feed-forward reconstruction）が両者の橋渡しを担えるほど良くなったことです。ステータスの表記は第 3 回の更新と同じ規則に従います。「プレプリント」はまだ学会や論文誌で発表されていないもの、企業の記事は発表です。インタラクティブなタイムライン（「3D/4D 生成」で絞り込み）に以下のすべての研究が載っています。

{% include widget.liquid name="world-models-timeline" height="560" caption="試してみましょう：「3D/4D 生成」ボタンをタップしてこの記事の項目だけを表示し、点をタップすると要約、ステータス、リンクが表示されます。塗りつぶしの点は論文、白抜きの点は企業の発表や製品です。「対話型動画」の行と日付を比べると、明示的な記憶を持つ動画モデルが、高速なフィードフォワード 3D 生成器のすぐ後に現れていることが分かります。" %}

### フィードフォワード幾何がバックボーンに

第 3 節は DUSt3R で終わりました。カメラが未知のまま画像ペアから点マップを予測する手法です。2025 年、この考え方は汎用の**フィードフォワード幾何モデル**へと拡大しました。その出力は、シーン生成器が生成したピクセルを永続的な 3D 状態に変えるために必要なものそのものです。

- **VGGT**（Wang et al.、CVPR 2025、[arXiv:2503.11651](https://arxiv.org/abs/2503.11651)）は、1 枚から数百枚の視点を受け取り、カメラ、深度マップ、点マップ、点の軌跡を 1 回の順伝播で予測する 1 つの大きな Transformer です。テスト時の最適化は不要です。
- **π³**（Wang et al.、プレプリント、[arXiv:2507.13347](https://arxiv.org/abs/2507.13347)）はネットワークを置換同変（permutation-equivariant）にし、どの入力視点も基準フレームとして特別扱いしません。**MapAnything**（Keetha et al.、3DV 2026、[arXiv:2509.13414](https://arxiv.org/abs/2509.13414)）は*メトリック*な幾何を予測し、内部パラメータ、姿勢、深度といった追加入力を任意で使えます。**Depth Anything 3**（Lin et al.、プレプリント、[arXiv:2511.10647](https://arxiv.org/abs/2511.10647)）は、任意枚数の視点から深度マップとレイマップを予測する素朴な Transformer で一貫した幾何が得られることを示しました。

これが世界生成にとって重要なのは、4.2 節の深度の位置合わせ（単眼深度を既存のシーンに合わせる処理）を、生成したすべての視点について一貫したカメラと幾何を一度に返す 1 回のネットワーク呼び出しで置き換えられるからです。**Gen3R**（Huang et al.、プレプリント、[arXiv:2601.04090](https://arxiv.org/abs/2601.04090)、2026 年 1 月）はさらに一歩進みます。VGGT を改変して、事前学習済み動画拡散モデルの外観の潜在表現と整合した*幾何の潜在表現*を出力させます。こうして生成器は RGB 動画と同時に、カメラ、深度、点群を出力します。生成と再構成が 1 つのモデルになったのです。

### 動画の事前知識から数秒で 3D ガウシアンへ

第 3 節の「2D で生成し、3D で再構成する」という教訓は、高速な 1 パスのパイプラインになりました。

- **Stable Virtual Camera**（Zhou et al.、プレプリント、[arXiv:2503.14489](https://arxiv.org/abs/2503.14489)）は汎用の新規視点拡散モデルです。任意枚数の入力視点と目標カメラを受け取り、長いカメラ経路に沿って一貫した視点を生成します。CAT3D の考え方をオープンなモデルにしたものといえます。
- **GEN3C**（Ren et al.、CVPR 2025、[arXiv:2503.03751](https://arxiv.org/abs/2503.03751)）は **3D キャッシュ**、つまり予測した深度から逆投影した点群を保持します。指定されたカメラ経路に沿ってキャッシュをレンダリングし、その結果を動画生成の条件にします。これにより正確なカメラ制御と一貫性が得られます。第 4 節のループを動画モデルの中に入れたものです。
- **Bolt3D**（Szymanowicz et al.、ICCV 2025、[arXiv:2503.14445](https://arxiv.org/abs/2503.14445)）は、シーンのガウシアン「splatter image」を数秒で直接生成する潜在拡散モデルで、シーンごとの最適化は不要です。
- **Lyra**（Bahmani et al.、プレプリント、[arXiv:2509.19296](https://arxiv.org/abs/2509.19296)）は、カメラ制御可能な動画拡散モデルを、動画の潜在表現から 3D ガウシアンを出力するデコーダへ自己蒸留します。そのため多視点の学習データが要らず、同じ手法は動的（4D）シーンにも拡張できます。**FlashWorld**（Li et al.、プレプリント、[arXiv:2510.13678](https://arxiv.org/abs/2510.13678)）は、多視点指向の生成の品質を 3D 指向の生成器に蒸留し、3D ガウシアンのシーンを数秒で直接生成します。
- **FLAT**（Kupyn et al.、プレプリント、[arXiv:2606.24876](https://arxiv.org/abs/2606.24876)、2026 年 6 月）は、ガウシアンではなく**三角形スプラット**（triangle splats）を動画拡散の潜在表現から 1 パスで直接デコードします。より高い幾何精度が報告されており、短い後処理でゲームエンジンが使える不透明な表現が得られます。半透明のガウシアンと違い、不透明な三角形は通常のラスタライザ（[グラフィックス第 2 回]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})）や物理エンジンにそのまま組み込めるので、これは重要です。

### パノラマ先行の世界生成器

2025 年のもう一つのレシピは、まず **360° パノラマ**を生成し（パノラマなら周囲全体が一度に決まるため）、それを 3D に持ち上げるものです。

- **HunyuanWorld 1.0**（HunyuanWorld Team、プレプリント、[arXiv:2507.21809](https://arxiv.org/abs/2507.21809)、2025 年 7 月）は、テキストや画像からパノラマの代理表現を生成し、それを意味的なレイヤー（空、背景、物体）に分解します。各レイヤーを 3D に持ち上げてメッシュとして書き出すので、世界を標準的なツールで探索・編集できます。**HunyuanWorld-Voyager**（Huang et al.、プレプリント、[arXiv:2506.04225](https://arxiv.org/abs/2506.04225)）は、ユーザーのカメラ経路に沿って RGB *と深度*の動画を同時に生成し、ワールドキャッシュを保持します。これにより、直接的な 3D 再構成を使って場面を広範囲に拡張できます。
- **Matrix-3D**（Yang et al.、技術レポート、[arXiv:2508.08086](https://arxiv.org/abs/2508.08086)）は、軌跡に沿ってパノラマ動画を生成し、高速なフィードフォワードモデルか最適化で 3D を再構成します。
- **HY-World 2.0**（Team HY-World、プレプリント、[arXiv:2604.14268](https://arxiv.org/abs/2604.14268)、2026 年 4 月）は、再構成・生成・シミュレーションを統合しています。4 段階のパイプラインでテキストや 1 枚の画像からナビゲーション可能な 3DGS の世界を生成し、多視点入力にはフィードフォワード再構成モデル WorldMirror 2.0 を使います。著者はこれを*オフライン*の世界モデルと位置づけ、Marble に匹敵する結果を報告していますが、この比較は著者自身によるものです。

### プラットフォームになった Marble と Atlas

第 6 節では Marble の一般公開（2025 年 11 月 12 日）を紹介しました。2026 年の展開は、世界生成器がインフラになっていく好例です。出典はすべて World Labs の記事です。

- **World API**（[2026 年 1 月 21 日](https://worldlabs.ai/blog/announcing-the-world-api)）は、世界生成をプログラムから使えるようにします。
- **Spark 2.0**（[2026 年 4 月 14 日](https://worldlabs.ai/blog/spark-2.0)）は、大規模な 3DGS の世界をブラウザでストリーミングする World Labs のウェブレンダラーです。ガウシアンスプラットは研究上の表現にとどまらず、配信フォーマットになりました（[ニューラルレンダリング第 4 回]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})と比べてみてください）。
- **Atlas**（[2026 年 9 月 1 日](https://worldlabs.ai/blog/atlas)）は、一部のパートナーに早期アクセスで提供されている新しいモデルです。テキスト、画像、動画、3D でゼロから事前学習した、マルチモーダルな自己回帰拡散 Transformer と説明されています。入力画像はそれぞれ共有の空間コンテキストの中で 3D 姿勢に固定されます。モデルはカメラ制御された動画（記事によれば最長 1 分・1440p）、パノラマ、明示的な点群やガウシアンスプラットを生成します。World Labs は Atlas が将来の Marble を支えると述べています。構造的には、Atlas は第 7 節のハイブリッドそのものです。姿勢付きフレーム（第 3 回の RTFM のように）に、明示的な 3D 出力（Marble のように）を組み合わせています。
- 2026 年 9 月 28 日、World Labs は [AMD への合流](https://worldlabs.ai/blog/amd-announcement)を発表しました。World Labs はロボット学習のための世界生成についても書いており（"Building Worlds That Train Robots"、2026 年 7 月）、この記事を身体性 AI のためのシミュレーション（[グラフィックスエンジン第 5 回]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})）につないでいます。

### 4D と物体

- **4DNeX**（Chen et al.、プレプリント、[arXiv:2508.13154](https://arxiv.org/abs/2508.13154)）は、フィードフォワードの画像から 4D へのモデルです。動画拡散モデルを微調整して、各フレームで RGB と XYZ 点マップを出力させます。これは動的な点群やガウシアンに直接変換できる「6D 動画」です。第 5 節のシーンごとの SDS 最適化と比べてみてください。
- **Aether**（Aether Team、プレプリント、[arXiv:2503.18945](https://arxiv.org/abs/2503.18945)）は、合成データで 1 つの幾何を意識したモデルを学習し、4D 再構成、行動条件付きの動画予測、ゴール条件付きの視覚的計画という 3 つの仕事をこなします。4D 生成器が[第 1 回]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})の意味での世界モデルを兼ねられることを示しています。
- **SAM 3D**（SAM 3D Team、プレプリント、[arXiv:2511.16624](https://arxiv.org/abs/2511.16624)）は、1 枚の自然画像から物体（形状、テクスチャ、配置）を再構成します。物体単位の 3D が「ただで」手に入れば、シーン生成器は 1 枚の融合した表面ではなく、分離・編集できる物体で世界を満たせます。

### 対話的生成の記憶としての明示的 3D

2026 年で最も興味深い進展は、この記事と第 3 回を結びつけるものです。**L3G-World**（Choi et al.、プレプリント、[arXiv:2610.40614](https://arxiv.org/abs/2610.40614)、2026 年 10 月）は**潜在 3D ガウシアン記憶**を保持します。フィードフォワードの更新器は新しい幾何が必要な場所にだけガウシアンを追加し、記憶を条件とする動画拡散 Transformer がそこから次のフレームを描画します。そのため、おもちゃの図が示すように、記憶はストリームの長さではなく*探索した場面*に応じて増えます。これまでで最も効率的な 3D 記憶のベースラインと比べて、3D プリミティブが最大 38.6 分の 1 になり、9 fps のリアルタイム生成ができると報告されています。

{% include blog_figure.liquid path="assets/img/blog/world-models/04-update-memory-growth.svg" width="85%" caption="40 秒探索し、既に見た空間を通って 40 秒戻り（灰色の帯、↺）、再び探索する歩行での、記憶の増え方のおもちゃの比較です。すべての潜在フレーム（毎秒 6 枚、各 5 万個のガウシアン）を逆投影すると、記憶は $O(T)$ で増え（赤）、3600 万個のプリミティブに達します。新しい幾何だけを追加すると（ここでは探索中は各フレームの 25%、戻る間はゼロ）、記憶は探索した面積 $O(\lvert A\rvert)$ に応じて増え（緑）、戻る間は平らなままです。これが L3G-World の背後にあるスケーリングの議論です。数値は説明用であり、論文からのものではありません。" %}

### 第 7 節で変わったこと

- **永続性と動的変化。** 明示的な記憶が対話型動画モデルの*内部*で使われるようになりました（GEN3C、Voyager、L3G-World）。そのため、トレードオフ表の「記憶」の行は、もはや 2 つの列をそれほどはっきりとは分けません。
- **速度。** フィードフォワードのデコーダにより、1 枚の画像から 3D シーンまでが数分（CAT3D）から数秒（Bolt3D、FlashWorld）になりました。
- **エンジン対応。** 出力形式は、エンジンがそのまま使えるものに近づいています。メッシュ（HunyuanWorld 1.0）、三角形スプラット（FLAT）、ストリーミング可能なスプラット（Spark 2.0）です。スプラットや生成アセットが実際のエンジンにどう入るかは[グラフィックスエンジン第 6 回]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})を参照してください。
- **未解決の点。** 生成された世界の多くはいまも静的です。物理的に意味のある材質、関節を持つ物体、エージェントはまれで、上記のどのシステムも、その世界がエージェントの学習に*役立つ*かどうかの評価を公開していません（最初の閉ループのベンチマークは第 5 回の更新で扱います）。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | なぜ重要か |
| --- | --- | --- | --- | --- |
| DreamFusion: Text-to-3D using 2D Diffusion (Poole et al.) | ICLR | 2023 | [arXiv:2209.14988](https://arxiv.org/abs/2209.14988) | スコア蒸留サンプリング |
| Magic3D: High-Resolution Text-to-3D Content Creation (Lin et al.) | CVPR | 2023 | [arXiv:2211.10440](https://arxiv.org/abs/2211.10440) | メッシュを用いた粗から密への SDS |
| ProlificDreamer: High-Fidelity and Diverse Text-to-3D Generation with Variational Score Distillation (Wang et al.) | NeurIPS | 2023 | [arXiv:2305.16213](https://arxiv.org/abs/2305.16213) | VSD が彩度過多と多様性の低さを解消 |
| Zero-1-to-3: Zero-shot One Image to 3D Object (Liu et al.) | ICCV | 2023 | [arXiv:2303.11328](https://arxiv.org/abs/2303.11328) | カメラ条件付きの新規視点拡散 |
| Text2Room: Extracting Textured 3D Meshes from 2D Text-to-Image Models (Höllein et al.) | ICCV | 2023 | [arXiv:2303.11989](https://arxiv.org/abs/2303.11989) | インペインティング + 深度による部屋スケールのシーン拡張 |
| Text-To-4D Dynamic Scene Generation (MAV3D, Singer et al.) | ICML | 2023 | [arXiv:2301.11280](https://arxiv.org/abs/2301.11280) | 初のテキストから 4D、動画モデルからの SDS |
| 3D Gaussian Splatting for Real-Time Radiance Field Rendering (Kerbl et al.) | SIGGRAPH / ACM TOG | 2023 | [arXiv:2308.04079](https://arxiv.org/abs/2308.04079) | 現在ほとんどの生成器がターゲットとする明示的表現 |
| MVDream: Multi-view Diffusion for 3D Generation (Shi et al.) | ICLR | 2024 | [arXiv:2308.16512](https://arxiv.org/abs/2308.16512) | 複数視点の同時生成 |
| LRM: Large Reconstruction Model for Single Image to 3D (Hong et al.) | ICLR | 2024 | [arXiv:2311.04400](https://arxiv.org/abs/2311.04400) | フィードフォワードな画像から 3D |
| DreamGaussian: Generative Gaussian Splatting for Efficient 3D Content Creation (Tang et al.) | ICLR | 2024 | [arXiv:2309.16653](https://arxiv.org/abs/2309.16653) | ガウシアンによる高速な SDS |
| LucidDreamer: Domain-free Generation of 3D Gaussian Splatting Scenes (Chung et al.) | arXiv / IEEE TVCG | 2023 | [arXiv:2311.13384](https://arxiv.org/abs/2311.13384) | 3DGS へのシーン拡張 |
| WonderJourney: Going from Anywhere to Everywhere (Yu et al.) | CVPR | 2024 | [arXiv:2312.03884](https://arxiv.org/abs/2312.03884) | LLM が計画する、つながった 3D シーンの連なり |
| 4D-fy: Text-to-4D Generation Using Hybrid Score Distillation Sampling (Bahmani et al.) | CVPR | 2024 | [arXiv:2311.17984](https://arxiv.org/abs/2311.17984) | 4D のために画像と動画の事前分布を組み合わせる |
| Align Your Gaussians: Text-to-4D with Dynamic 3D Gaussians and Composed Diffusion Models (Ling et al.) | CVPR | 2024 | [arXiv:2312.13763](https://arxiv.org/abs/2312.13763) | テキストから 4D のための動的ガウシアン |
| PhysGaussian: Physics-Integrated 3D Gaussians for Generative Dynamics (Xie et al.) | CVPR | 2024 | [arXiv:2311.12198](https://arxiv.org/abs/2311.12198) | 同じガウシアンをシミュレーションしてレンダリング |
| CAT3D: Create Anything in 3D with Multi-View Diffusion Models (Gao et al.) | NeurIPS | 2024 | [arXiv:2405.10314](https://arxiv.org/abs/2405.10314) | シーンのためのマルチビュー拡散 + 再構成 |
| WonderWorld: Interactive 3D Scene Generation from a Single Image (Yu et al.) | CVPR | 2025 | [arXiv:2406.09394](https://arxiv.org/abs/2406.09394) | インタラクティブで 10 秒未満のシーン生成 |
| VGGT: Visual Geometry Grounded Transformer (Wang et al.) | CVPR | 2025 | [arXiv:2503.11651](https://arxiv.org/abs/2503.11651) | 多視点からカメラ・深度・点をフィードフォワードで予測 |
| GEN3C: 3D-Informed World-Consistent Video Generation with Precise Camera Control (Ren et al.) | CVPR | 2025 | [arXiv:2503.03751](https://arxiv.org/abs/2503.03751) | 3D キャッシュで動画モデルを条件付け |
| Bolt3D: Generating 3D Scenes in Seconds (Szymanowicz et al.) | ICCV | 2025 | [arXiv:2503.14445](https://arxiv.org/abs/2503.14445) | ガウシアンシーンの直接的な潜在拡散 |
| Stable Virtual Camera: Generative View Synthesis with Diffusion Models (Zhou et al.) | プレプリント | 2025 | [arXiv:2503.14489](https://arxiv.org/abs/2503.14489) | オープンな汎用新規視点拡散 |
| Aether: Geometric-Aware Unified World Modeling (Aether Team) | プレプリント | 2025 | [arXiv:2503.18945](https://arxiv.org/abs/2503.18945) | 4D 再構成・予測・計画を 1 つのモデルで |
| Voyager: Long-Range and World-Consistent Video Diffusion for Explorable 3D Scene Generation (Huang et al.) | プレプリント | 2025 | [arXiv:2506.04225](https://arxiv.org/abs/2506.04225) | ワールドキャッシュ付きの RGB-D 動画 |
| π³: Permutation-Equivariant Visual Geometry Learning (Wang et al.) | プレプリント | 2025 | [arXiv:2507.13347](https://arxiv.org/abs/2507.13347) | 基準視点のいらないフィードフォワード幾何 |
| HunyuanWorld 1.0 (HunyuanWorld Team) | プレプリント | 2025 | [arXiv:2507.21809](https://arxiv.org/abs/2507.21809) | パノラマ先行・レイヤー化・メッシュ出力可能な世界 |
| Matrix-3D: Omnidirectional Explorable 3D World Generation (Yang et al.) | 技術レポート | 2025 | [arXiv:2508.08086](https://arxiv.org/abs/2508.08086) | パノラマ動画から 3D 再構成へ |
| 4DNeX: Feed-Forward 4D Generative Modeling Made Easy (Chen et al.) | プレプリント | 2025 | [arXiv:2508.13154](https://arxiv.org/abs/2508.13154) | 画像から RGB + XYZ 動画（4D）へ |
| MapAnything: Universal Feed-Forward Metric 3D Reconstruction (Keetha et al.) | 3DV | 2026 | [arXiv:2509.13414](https://arxiv.org/abs/2509.13414) | 任意の追加入力を使えるメトリック幾何 |
| Lyra: Generative 3D Scene Reconstruction via Video Diffusion Model Self-Distillation (Bahmani et al.) | プレプリント | 2025 | [arXiv:2509.19296](https://arxiv.org/abs/2509.19296) | 動画モデルを 3DGS デコーダへ蒸留 |
| FlashWorld: High-quality 3D Scene Generation within Seconds (Li et al.) | プレプリント | 2025 | [arXiv:2510.13678](https://arxiv.org/abs/2510.13678) | 3D 指向の直接的なガウシアン生成 |
| Marble: A Multimodal World Model (World Labs) | blog | 2025 | [worldlabs.ai](https://worldlabs.ai/blog/marble-world-model) | 製品化された明示的世界生成器 |
| Depth Anything 3: Recovering the Visual Space from Any Views (Lin et al.) | プレプリント | 2025 | [arXiv:2511.10647](https://arxiv.org/abs/2511.10647) | 素朴な Transformer、深度 + レイ、任意の視点 |
| SAM 3D: 3Dfy Anything in Images (SAM 3D Team) | プレプリント | 2025 | [arXiv:2511.16624](https://arxiv.org/abs/2511.16624) | 1 枚画像からの物体再構成 |
| Gen3R: 3D Scene Generation Meets Feed-Forward Reconstruction (Huang et al.) | プレプリント | 2026 | [arXiv:2601.04090](https://arxiv.org/abs/2601.04090) | 動画の潜在表現と整合した幾何の潜在表現 |
| HY-World 2.0 (Team HY-World) | プレプリント | 2026 | [arXiv:2604.14268](https://arxiv.org/abs/2604.14268) | 3DGS 世界の再構成・生成・シミュレーション |
| FLAT: Feedforward Latent Triangle Splatting (Kupyn et al.) | プレプリント | 2026 | [arXiv:2606.24876](https://arxiv.org/abs/2606.24876) | 動画の潜在表現からエンジン対応の三角形スプラット |
| Atlas: A World Model for Spatial Intelligence (World Labs) | blog | 2026 | [worldlabs.ai](https://worldlabs.ai/blog/atlas) | 姿勢付き画像コンテキストと明示的 3D 出力 |
| L3G-World: Real-Time Infinite World Generation with Latent 3D Gaussian Memory (Choi et al.) | プレプリント | 2026 | [arXiv:2610.40614](https://arxiv.org/abs/2610.40614) | 場面の広さに応じて増えるガウシアン記憶 |

## 学習リソース

- [threestudio](https://github.com/threestudio-project/threestudio) フレームワークは、DreamFusion、Magic3D、ProlificDreamer、Zero-1-to-3 ガイダンスをはじめ、多くの SDS の変種を 1 つのコードベースに実装しています。実験を始めるには最も手早い方法です。
- コード付きのプロジェクトページ：[Text2Room](https://github.com/lukasHoel/text2room)、[LucidDreamer](https://luciddreamer-cvlab.github.io/)、[WonderJourney](https://kovenyu.com/wonderjourney/)、[WonderWorld](https://kovenyu.com/WonderWorld/)、[4DGaussians](https://github.com/hustvl/4DGaussians)。
- World Labs の [Marble](https://www.worldlabs.ai/blog/marble-world-model) に関するブログ記事では、製品とそのエクスポート形式が説明されています。
- 3DGS とカメラの背景については本ブログのニューラルレンダリングシリーズを、拡散モデルについては[第 2 回]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})と Lilian Weng の[拡散モデルの記事](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/)を参照してください。

## 演習

1. $\mathcal{L}_{\mathrm{diff}}$ を連鎖律で微分して SDS 勾配を導出し、取り除かれる項を特定してください。U-Net のヤコビアンについてどのような仮定を置けば、取り除かれた項は期待値の意味で消えるでしょうか。
2. SDS のトイ例で、`eps_model(x_t, t) - eps` に 5 および 20 を掛けて、classifier-free ガイダンスに似たスケールを加えてください。広がりとモードのカバー率はどう変化しますか。これを DreamFusion のアセットの彩度過多と関連付けてください。
3. トイ例を VSD に変えてください。現在の粒子 `theta` 上で 2 つ目の小さなデノイザーをオンラインで学習し、`eps` の代わりにその予測を使います。広がりは実データの広がりに近づくでしょうか。
4. 深度位置合わせのスクリプトで、平面のシーンを段差状の不連続を持つシーンに置き換え、単眼深度を真値の非線形関数にしてください。大域的なアフィンフィッティングはどこで失敗し、局所的なフィッティングはどう役立つでしょうか。
5. 第 7 節のトレードオフ表から 1 行を選び、その行について両方の列の長所を兼ね備えたハイブリッドシステムを設計してください。その学習データはどのようなものになるでしょうか。
6. （2025〜2026 年の更新）記憶の増え方のおもちゃのモデルで、歩行のうち戻っている時間の割合を（3 分の 1 ではなく）$r$、探索中の各フレームに占める新しい幾何の割合を $f$ とします。$N_{\text{frame}}(T)$ と $N_{\text{extent}}(T)$、およびその比を書いてください。$f = 0.25$、$r = 1/3$ のとき 120 秒後の比はいくつになり、L3G-World が 3D 記憶のベースラインに対して報告している最大 38.6 分の 1 という削減と比べてどうでしょうか。

<details markdown="1"><summary>ヒント</summary>

$N_{\text{frame}} = cT$、$N_{\text{extent}} = c f (1 - r) T$ なので、比は $1 / (f(1-r))$ で、$f = 0.25$、$r = 1/3$ では $6$ です。より大きな削減には、より小さな $f$（ゆっくりしたカメラの動きのようにフレーム間の重なりが大きい場合）か、より多くの戻りが必要です。論文のベースラインは既に枝刈りされた別の 3D 記憶なので、数値を直接比較することはできません。

</details>

**次回：** [第 5 回]({{ '/blog/2026/world-models-05-jepa-evaluation-and-open-problems/' | relative_url }})では生成から一歩引いて、JEPA と予測型・生成型をめぐる議論、世界モデルの評価方法、そして身体性 AI（embodied AI）へとつながる未解決問題を扱います。
