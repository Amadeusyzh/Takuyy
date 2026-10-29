---
layout: post
title: "模倣学習：行動クローニング、DAgger、ACT、Diffusion Policy"
date: 2026-10-27 18:04:00+0900
description: "デモンストレーションからロボットのスキルを学ぶ：共変量シフトと DAgger、Transformer によるアクションチャンキング（ACT/ALOHA）、Diffusion Policy、遠隔操作と UMI によるデータ収集、大規模なクロスエンボディメントデータセットを、実行可能な拡散方策の学習例とともに解説します。"
categories: embodied-ai
tags: [imitation-learning, behavior-cloning, diffusion-policy, act, datasets]
series: embodied-ai
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## なぜ重要なのか

RL（第 2 回）には報酬と大量の試行が必要です。GPU シミュレータで歩行を学ぶには問題ありませんが、シャツをたたんだりケーブルを
差し込んだりするには苦痛です。**模倣学習**（imitation learning, IL）は報酬を省きます。人がタスクを実演し、ロボットは観測を実演の
行動へ写す方策を学びます。2023 年以降、**アクションチャンキング**（action chunking）と**生成的な行動モデル**（拡散とフローマッチング）
という 2 つのアイデアによって、IL は数十回のデモだけで、繊細で接触の多いマニピュレーションをこなせるようになりました。これらは
現在の Vision-Language-Action モデル（第 5 回）の行動ヘッドでもあります。本記事では IL を基礎から組み立て、最後に動作する
Diffusion Policy の学習ループを示します。[前回]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})の
シミュレータは、実機に触れる前にこれを練習する場所です。

**前提知識**

- PyTorch による教師あり学習、第 2 回の RL の記法（$\pi$、軌道、ホライズン $T$）。
- DDPM レベルの拡散モデル（順方向のノイズ付加、ノイズ予測）。世界モデルとニューラルレンダリングのシリーズでも扱います。
- 第 1 回の行動空間の議論（関節目標とエンドエフェクタ目標、インピーダンス制御）。

## 1. 行動クローニングと共変量シフト

エキスパート方策 $\pi^{\ast}$ によるデモ $\mathcal{D} = \lbrace(o_i, a_i)\rbrace$ が与えられたとき、**行動クローニング**（behavior cloning, BC）は
最尤推定で方策をフィットします。

$$
\theta^{\ast} = \arg\max_\theta \sum_{(o,a)\in\mathcal{D}} \log \pi_\theta(a \mid o).
$$

分散を固定したガウス方策なら、これは単なる MSE 回帰です。BC は最も古いロボット学習の手法であり（1988 年の ALVINN は小さな
ニューラルネットワークでカメラ画像から車両を運転しました）、今でも大半のマニピュレーションシステムの土台です。BC には古典的な
失敗モードが 2 つあります。

### 共変量シフトと誤差の累積

BC はエキスパートの状態分布 $d_{\pi^{\ast}}$ で学習しますが、テスト時のロボットは自分自身の分布 $d_{\pi_\theta}$ の状態を訪れます。
小さなミスで、どのデモにも含まれない状態へ移り、そこでさらに大きなミスをし、それが繰り返されます。Ross と Bagnell（2010）は
これを定式化しました。学習した方策がエキスパートの状態で確率 $\epsilon$ で誤るとき、ホライズン $T$ にわたる期待コストは $O(\epsilon T^2)$
で増えうる一方、自分自身の状態分布で学習した学習器は $O(\epsilon T)$ を達成できます。

小さな実験でこの効果が目に見えます。点が一定の速さで前進しながら横方向の位置 $y$ を操作して正弦波の経路をたどります。専門家は単純なフィードバック則、学習者は専門家の状態・行動ペアに当てはめた放射基底関数（RBF）回帰器です。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-covariate-shift.svg" caption="経路追従のおもちゃのタスクでの行動クローニングと DAgger。10 本の専門家デモはきれいで（灰色の帯：デモがカバーする状態）、運用時にはより大きな外乱が加わります。上：通常の BC（赤）は帯の中にいる間はうまく動きますが、外乱で帯の外に押し出されると行動が意味をなさなくなり、そのまま経路から離れていきます。DAgger で学習者自身が訪れた状態に専門家のラベルを付けると、方策（青）は専門家と同じように復帰します。下：20 回のロールアウトの平均追従誤差。BC は平均 0.131 で専門家の 0.029 の 4.5 倍ですが、DAgger を 1 回反復しただけで専門家と同じ水準になります。" %}

### DAgger

**DAgger**（Dataset Aggregation、Ross、Gordon、Bagnell、AISTATS 2011）は、学習器が訪れた状態についてエキスパートに問い合わせることで
分布のずれを修正します。

1. エキスパートのデモ $\mathcal{D}$ で $\pi_1$ を学習する。
2. $i = 1, 2, \dots$ について：$\pi_i$ を（必要ならエキスパートと混ぜて）実行して状態を集め、エキスパートに $a = \pi^{\ast}(s)$ でラベル付けして
   もらい、$\mathcal{D} \leftarrow \mathcal{D} \cup \lbrace(s, \pi^{\ast}(s))\rbrace$ と集約し、$\pi_{i+1}$ を再学習する。

DAgger には no-regret の保証と $O(\epsilon T)$ の上界がありますが、人間の操作者に任意の状態をラベル付けしてもらうのは不自然です。
実用的な変種では、ロボットが失敗しそうなときだけ人が**介入**します（HG-DAgger、多くの実システムでの介入データ）。あるいは、
シミュレータ内の特権方策をエキスパートとして使います。これは第 2 回の教師・生徒蒸留そのものです。共変量シフトへの他の対策としては、
デモ中にノイズを注入してデータに回復行動を含める（DART）、観測を拡張する、そして実践で最も効果的な、**アクションチャンク**を予測する
（第 2 節）ことがあります。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-dagger-loop.svg" localized="true" caption="DAgger のループ。通常の行動クローニングに欠けているのは右の列、つまり現在の方策を実行し、方策が実際に訪れた状態に専門家がラベルを付け、それをデータセットに加える手順です。" %}

### 多峰性

人は同じタスクを異なる方法で解きます。障害物を左から回るか右から回るか、マグカップを取っ手でつかむか縁でつかむか。MSE で最適な
予測はモードの**平均**であり、それはまさに失敗する行動（障害物にまっすぐ突っ込む）かもしれません。対策は表現力の高い行動分布です。
カテゴリ出力による離散化された行動（RT-1、第 5 回）、混合ガウス（robomimic の BC-RNN-GMM）、エネルギーベースモデル（Implicit BC）、
k-means の「行動ビン」とオフセット（Behavior Transformers）、VAE（ACT）、そして拡散モデルやフローモデル（Diffusion Policy）です。
本記事の最後のコードでは、MSE の BC が障害物の上に潰れる一方で、拡散方策は両方のモードを保つ様子を示します。

図は 6 節で学習するおもちゃの問題でこれを示しています。デモは障害物を左右どちらかから回り込みますが、MSE 回帰は 2 つを平均してしまいます。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-multimodal.svg" caption="左：`make_demos` による 60 本のデモのチャンク（灰）、学習済み Diffusion Policy からサンプルした 40 本のチャンク（紫）、MSE 行動クローニングの予測（赤）。観測はすべて原点です。右：チャンク中央での横方向のずれ。デモと拡散モデルのサンプルはどちらも約 $\pm 0.5$ の二峰性ですが、MSE の予測は 2 つの峰の平均である $y = 0.02$ に位置し、ちょうど障害物にぶつかる唯一の場所になっています。" %}

## 2. Transformer によるアクションチャンキング（ACT / ALOHA）

Zhao ら（RSS 2023）は、低コストな双腕の遠隔操作システム **ALOHA**（人が小さな 2 本の「リーダー」アームを動かし、2 本の「フォロワー」
アームがその関節位置をなぞる）と、**ACT**（Action Chunking with Transformers）を開発しました。ACT は、半透明の調味料カップを開ける、
電池を差し込むといったタスクを、約 10 分間のデモから 80〜90% の成功率で学習しました。鍵となるアイデアは次のとおりです。

- **アクションチャンキング。** 1 ステップごとに 1 つの行動を予測する代わりに、次の $k$ 個の行動 $a_{t:t+k}$（例：50 Hz で $k = 100$ 個の
  関節目標）を予測します。チャンク化によって実効的なホライズンが $1/k$ になるため、誤差が累積する機会が減ります。また、一時停止の
  ような時間的に相関した振る舞いも表現できます。これは 1 ステップの方策が苦手とするものです。
- **時間的アンサンブル**（temporal ensembling）。毎ステップ方策に問い合わせると、重なり合うチャンクが得られます。ACT は現在の時刻に
  対するすべての予測を指数重み $w_i = \exp(-m\, i)$（$i = 0$ が最も古い予測）で平均し、遅れなく動きを滑らかにします。
- **CVAE による学習。** Transformer エンコーダがデモのチャンクを潜在的なスタイル変数 $z$ に圧縮し、デコーダ（複数カメラの ResNet 画像
  特徴と関節状態に対する Transformer）が $z$ を与えられてチャンクを予測します。テスト時には $z$ を事前分布の平均にします。目的関数は
  再構成誤差（L1）と KL 項です。
- **関節空間の行動**と位置制御器を使うことで、6 自由度の ALOHA アームでの IK や特異姿勢の問題を避けています。

**Mobile ALOHA**（Fu ら CoRL 2024）はこのシステムを移動台車に載せ、静的な ALOHA のデータとの共同学習（co-training）が移動
マニピュレーションを改善することを示しました。**ALOHA Unleashed**（Zhao ら CoRL 2024）はデータ収集の規模を拡大し、拡散ベースの
方策で靴ひもを結ぶ、シャツをハンガーに掛けるといったタスクをこなしました。

時間アンサンブルは時間軸の上で見るといちばん分かりやすいです。下のおもちゃの例では、各チャンクは理想的な行動に、チャンクに沿って大きくなる誤差を加えたものです（学習した方策と同じように）。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-temporal-ensembling.svg" caption="上：毎ステップ、$k = 10$ 個の将来の行動からなるチャンクを予測します（色は予測した時刻）。$t = 30$ では 10 個の異なるチャンクがそのステップの予測を含んでいます（赤い点）。下：各チャンクを最後まで実行して 10 ステップごとに計画し直す方式（橙）はチャンクの境目ごとに跳びますが、時間アンサンブル（紫）は重なった予測を重み $w_i = e^{-0.1 i}$（$i = 0$ が最も古い予測）で平均します。隣り合うステップ間の平均変化は 0.124 で、理想の 0.117 に近く、単純なチャンク実行では 0.172 です。" %}

## 3. Diffusion Policy

Chi ら（RSS 2023）は、行動系列の条件付き分布を**ノイズ除去拡散モデル**でモデル化しました。方策の 1 ステップはガウスノイズから始まり、
直近の観測を条件として、それを反復的にノイズ除去して行動チャンクにします。4 つのベンチマークの 12 タスクで、従来の最先端手法より
成功率を平均 46.9% 改善しました。

### 定式化

$A^0_t \in \mathbb{R}^{T_p\times d_a}$ を $T_p$ 個の将来の行動からなるチャンク、$O_t$ を直近 $T_o$ 個の観測とします。DDPM の順過程は
スケジュール $\bar\alpha_k$ に従ってノイズを加えます。

$$
A^k_t = \sqrt{\bar\alpha_k}\,A^0_t + \sqrt{1-\bar\alpha_k}\,\epsilon, \qquad \epsilon\sim\mathcal{N}(0, I).
$$

ネットワーク $\epsilon_\theta$ はそのノイズを予測するように学習します。

$$
\mathcal{L}(\theta) = \mathbb{E}_{k,\,\epsilon,\,(O_t, A^0_t)\sim\mathcal{D}}\left[\left\lVert \epsilon - \epsilon_\theta\!\left(A^k_t,\, k,\, O_t\right)\right\rVert^2\right].
$$

推論時には $A^K_t \sim \mathcal{N}(0, I)$ から始め、各逆ステップは

$$
A^{k-1}_t = \frac{1}{\sqrt{\alpha_k}}\left(A^k_t - \frac{\beta_k}{\sqrt{1-\bar\alpha_k}}\,\epsilon_\theta(A^k_t, k, O_t)\right) + \sigma_k z, \qquad z\sim\mathcal{N}(0, I)
$$

で、$\beta_k = 1-\alpha_k$、$\sigma_k^2 = \beta_k$ です。$\epsilon_\theta$ は（スケールを除いて）スコア $\nabla_A \log p(A \mid O)$ なので、サンプリングは
行動の対数密度に対するノイズ付きの勾配上昇です。そのため複数のモードや、高次元で時間的に一貫した行動系列を自然に表現できます。

行動チャンクに対する前向き過程は簡単に思い描けます。チャンクの各経由点が原点に向かって縮められ、ガウスノイズでぼかされて、最後には軌跡の痕跡がなくなります。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-diffusion-forward.svg" caption="おもちゃの問題の 40 本のデモチャンク（各 8 経由点）に DDPM の前向き過程 $A^k = \sqrt{\bar\alpha_k}A^0 + \sqrt{1-\bar\alpha_k}\,\epsilon$ を、6 節のコードのコサインスケジュールで適用したもの。$k = 20$ では 2 種類の軌跡がまだ見え、$k = 50$ ではほぼ消え、$k = 100$ ではチャンクは純粋なノイズです。下：スケジュールの信号係数とノイズ係数。" %}

### 重要な設計上の選択

- **後退ホライズン**（receding horizon）。$T_p$ ステップ（例：16）を予測し、最初の $T_a$ ステップ（例：8）だけを実行して、新しい観測
  （$T_o = 2$ フレーム）から計画し直します。チャンクの実行は時間的一貫性を、再計画は反応性をもたらします。
- **同時モデル化ではなく条件付け。** 観測はノイズ除去器の条件として与えられ（1 次元の時間方向 CNN U-Net では FiLM 層で、Transformer
  版ではクロスアテンションで）、一緒にノイズ除去されることはありません。そのため視覚エンコーダはノイズ除去ステップごとではなく、
  方策ステップごとに 1 回だけ実行されます。
- **エンドエフェクタ空間での位置制御**のほうが、彼らの実験では速度制御よりうまくいきました。絶対的な目標は累積的なドリフトの影響を
  受けにくいからです。
- **高速なサンプリング。** 学習は 100 ステップの DDPM で行い、推論は約 10 ステップの DDIM で行えます。後続の研究では、実時間の速度に
  到達するために拡散を**フローマッチング**（flow matching、pi0、第 5 回）や一貫性蒸留に置き換えています。

拡張には、点群を条件とする **3D Diffusion Policy**（Ze ら RSS 2024）や、拡張されたジャーナル版（Chi ら IJRR 2024）があります。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-receding-horizon.svg" caption="上の値での後退ホライズン実行。$t = 0$ で方策は直近 $T_o = 2$ 個の観測（シアン）を見て $T_p = 16$ 個の行動を予測しますが、実行するのは最初の $T_a = 8$ 個（濃い紫）だけです。$t = 8$ で再び観測して新しいチャンクを予測し、古いチャンクの未実行の後半は捨てます。" %}

## 4. デモンストレーションの収集

本当のボトルネックはデータです。よく使われるインターフェースは次のとおりです。

| インターフェース | 例 | 利点 | 欠点 |
| --- | --- | --- | --- |
| ダイレクトティーチング（kinesthetic teaching） | 柔らかく制御したアームを手で押す | 直感的、追加のハードウェア不要 | 人がカメラに映る、片腕のみ |
| リーダー・フォロワーアーム | ALOHA、GELLO | 低遅延、双腕、関節空間、バックドライブ性による力の感触 | ロボット専用のハードウェア |
| VR / AR 遠隔操作 | Quest や Vision Pro のハンドトラッキング、Open-TeleVision | 没入感、多指ハンド、遠隔地から | リターゲティング、遅延、触覚がない（第 6 回） |
| スペースマウス / スマートフォン | robomimic、RoboTurk | 安価でスケールしやすい | 遅く、器用なタスクは難しい |
| ハンドヘルドグリッパ | UMI | ロボット不要、実環境でのデータ | 姿勢推定とエンボディメントの一致が必要 |
| 人の動画 | Ego4D、EgoMimic | 巨大な規模 | 行動がない、エンボディメントのギャップ（第 6 回） |

**UMI**（Universal Manipulation Interface、Chi ら RSS 2024）は、手首に GoPro を取り付けた手持ち式の 3D プリントのグリッパです。魚眼レンズと
側面のミラーが広く暗黙的にステレオな視野を与え、視覚慣性 SLAM がグリッパの 6 自由度の軌道を復元し、方策のインターフェースはデータ
収集時と展開時の遅延の違いを考慮しています。手持ちのデバイスとロボットとで観測（手首カメラ）と行動（エンドエフェクタの位置姿勢、
グリッパの開き幅）が同じなので、キッチンや公園で集めたデータが実際のアームに転移します。**データのインターフェースとロボットの
インターフェースを同一にする**という原則は、身体性 AI 全体で繰り返し現れます。

アーキテクチャよりも重要な実践的なコツ：デモを行う人の一貫性、校正されたカメラ、同期したタイムスタンプ、（計測された状態ではなく）
制御器の実際の目標値の記録、そして意図的に回復行動を収集することです。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-data-pipeline.svg" localized="true" caption="デモ収集のパイプライン。どのインターフェースでも、記録器は同期した観測と実際に指令した行動を一定の周期で保存します。UMI の原則は図のいちばん下の一文です。データ側とロボット側が同じ観測空間と行動空間を共有していれば、そのデータセットで直接ロボットの方策を学習できます。" %}

## 5. 大規模データセットとクロスエンボディメント学習

単一の研究室のデータセットは数百から数万エピソードです。研究室やロボットをまたいでデータを集めることは、ロボティクス版のウェブ
規模の事前学習です。

- **Open X-Embodiment**（ICRA 2024）：21 機関の共同研究で、22 種類のロボットのデータセットを、527 のスキル（160,266 のタスク）を
  含む RLDS 形式に統一しました。この混合データで学習した RT-1-X と RT-2-X は単一ロボットの方策を上回り、著者らの評価では RT-2-X は
  創発的なスキルで RT-2 の約 3 倍の成功率を示しました。
- **BridgeData V2**（CoRL 2023）：低コストな WidowX アームによる、多様な環境での卓上マニピュレーション。事前学習と評価でよく使われます。
- **DROID**（RSS 2024）：564 のシーンで Franka アームを使って集めた 7.6 万件の遠隔操作軌道（約 350 時間）。シーンの多様性を最大化する
  ため多くの機関が収集しました。
- **LeRobot**（Hugging Face）：ACT、Diffusion Policy、VLA モデル（SmolVLA や pi0 を含む）を実装した PyTorch ライブラリとデータ形式、
  そして低コストなアームで記録されたコミュニティのデータセットのハブです。

クロスエンボディメント学習には固有の問題があります。行動空間をどう揃えるか（エンドエフェクタの差分か関節か）、異なるカメラ構成を
どう扱うか、データセットにどう重みを付けるか。第 5 回では、VLA モデルがこれらにどう答えているかを見ます。

## 6. 実行可能な Diffusion Policy の学習ステップ

次のスクリプトは、多峰性を浮き彫りにするトイ問題で Diffusion Policy の核心部分を実装したものです。デモは原点の近くから始まり、
障害物を避けるために左または右に曲がりながら前進します。8 ステップの行動チャンクに対して、コサイン DDPM スケジュールでノイズ予測
ネットワークを学習し、比較のために MSE の行動クローニングモデルも学習します。ノイズ除去器は小さな MLP です（論文では 1 次元の時間方向
U-Net または Transformer を使います）が、学習ステップとサンプラは本物です。CPU で約 30 秒で動きます。

```python
import math
import torch
import torch.nn as nn
import torch.nn.functional as F

torch.manual_seed(0)
H, A, O = 8, 2, 2          # action horizon (chunk length), action dim, observation dim
K = 100                    # diffusion steps

# ---- toy demonstrations: from the start, go around an obstacle either left OR right ----
def make_demos(n):
    obs = torch.randn(n, O) * 0.05                       # start position near the origin
    side = torch.randint(0, 2, (n, 1)).float() * 2 - 1   # -1 = left, +1 = right (multimodal!)
    t = torch.linspace(0, 1, H)
    x = t.expand(n, H)                                   # move forward in x
    y = side * torch.sin(math.pi * t) * 0.5              # bend left or right in y
    act = torch.stack([x, y], -1) + obs[:, None, :]      # [n, H, 2] chunk of future waypoints
    return obs, act

# ---- noise schedule (DDPM, cosine) ----
s = 0.008
f = torch.cos((torch.arange(K + 1) / K + s) / (1 + s) * math.pi / 2) ** 2
alpha_bar = (f / f[0])[1:]                               # \bar{alpha}_k, k = 1..K
alphas = alpha_bar / torch.cat([torch.ones(1), alpha_bar[:-1]])
betas = (1 - alphas).clamp(max=0.999)

class NoisePredictor(nn.Module):
    """eps_theta(a_k, k, o): an MLP over the flattened action chunk (a 1-D U-Net in the paper)."""
    def __init__(self, hidden=256):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(H * A + O + 32, hidden), nn.Mish(),
                                 nn.Linear(hidden, hidden), nn.Mish(),
                                 nn.Linear(hidden, H * A))
    def forward(self, a_noisy, k, obs):
        freqs = torch.exp(torch.arange(16) * (-math.log(1000.0) / 16))
        emb = k[:, None].float() * freqs[None]                     # sinusoidal step embedding
        emb = torch.cat([emb.sin(), emb.cos()], -1)
        x = torch.cat([a_noisy.flatten(1), obs, emb], -1)
        return self.net(x).view(-1, H, A)

def train_step(model, opt, obs, act):
    """One Diffusion Policy training step: predict the noise added to an action chunk."""
    B = act.shape[0]
    k = torch.randint(0, K, (B,))                                   # random diffusion step
    eps = torch.randn_like(act)
    ab = alpha_bar[k].view(B, 1, 1)
    a_noisy = ab.sqrt() * act + (1 - ab).sqrt() * eps               # forward process q(a_k | a_0)
    loss = F.mse_loss(model(a_noisy, k, obs), eps)
    opt.zero_grad(); loss.backward(); opt.step()
    return loss.item()

@torch.no_grad()
def sample(model, obs):
    """DDPM reverse process: start from Gaussian noise, denoise K times."""
    a = torch.randn(obs.shape[0], H, A)
    for k in reversed(range(K)):
        kk = torch.full((obs.shape[0],), k)
        eps = model(a, kk, obs)
        a = (a - betas[k] / (1 - alpha_bar[k]).sqrt() * eps) / alphas[k].sqrt()
        if k > 0:
            a = a + betas[k].sqrt() * torch.randn_like(a)
    return a

if __name__ == "__main__":
    model = NoisePredictor()
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-6)
    bc = nn.Sequential(nn.Linear(O, 256), nn.Mish(), nn.Linear(256, H * A))   # MSE baseline
    opt_bc = torch.optim.Adam(bc.parameters(), lr=1e-3)
    for it in range(3000):
        obs, act = make_demos(256)
        loss = train_step(model, opt, obs, act)
        l_bc = F.mse_loss(bc(obs).view(-1, H, A), act)
        opt_bc.zero_grad(); l_bc.backward(); opt_bc.step()
        if it % 1000 == 0:
            print(f"it {it}: diffusion loss {loss:.4f}, BC loss {l_bc.item():.4f}")
    obs = torch.zeros(1000, O)
    mid_dp = sample(model, obs)[:, H // 2, 1]           # lateral offset in the middle of the chunk
    with torch.no_grad():
        mid_bc = bc(obs).view(-1, H, A)[:, H // 2, 1]
    print("diffusion: fraction left %.2f, right %.2f, mean |y| %.3f" %
          ((mid_dp < -0.25).float().mean(), (mid_dp > 0.25).float().mean(), mid_dp.abs().mean()))
    print("MSE BC:    mean y %.3f (collapses to the average, i.e. into the obstacle)" % mid_bc.mean())
```

出力：

```text
it 0: diffusion loss 1.0366, BC loss 0.2291
it 1000: diffusion loss 0.0401, BC loss 0.0542
it 2000: diffusion loss 0.0299, BC loss 0.0547
diffusion: fraction left 0.56, right 0.43, mean |y| 0.484
MSE BC:    mean y 0.022 (collapses to the average, i.e. into the obstacle)
```

`sample` の途中のチャンクを記録すると、2 つのモードがノイズから現れてくる様子が分かります。

{% include blog_figure.liquid path="assets/img/blog/embodied-ai/04-diffusion-reverse.svg" caption="上で学習したモデルの逆過程（同じコードとシードで約 20 秒で再学習）。原点で 60 サンプルを示し、各チャンクは最終的に選んだ側で色分けしています。左右の選択は $k = 15$ の時点ですでに見えており、最後の数ステップはノイズを取り除くだけです。$k = 0$ ではサンプルは 2 本のデモの経路に収束し（この 400 サンプルでは左 56%、右 44%）、MSE のベースライン（赤）は真ん中をまっすぐ突き抜けます。" %}

拡散方策はデモとほぼ同じ 50/50 の割合で両方のモードをサンプルし、チャンク中央での横方向のずれは真の値
$0.5 \sin(\pi \cdot 4/7) \approx 0.49$ に近くなります。一方、MSE の BC は $y \approx 0$、つまり障害物をまっすぐ突き抜けると予測します。
その損失も約 0.055 で頭打ちになりますが、これはちょうど平均している 2 つのモードの分散程度です。これを本物の方策にするには、`obs` を
ResNet や ViT の画像特徴（ランダムクロップの拡張とともにエンドツーエンドで学習）に置き換え、時間方向の U-Net を使い、行動を $[-1, 1]$ に
正規化し、評価には重みの指数移動平均を使い、後退ホライズンのループで各サンプルチャンクの最初の $T_a$ 個の行動を実行します。
LeRobot の実装がよい参考になります。

## 7. 単純な模倣の先へ

- **逆強化学習と敵対的模倣。** デモを説明する報酬を復元してから、それを最適化します。**GAIL**（Ho と Ermon 2016）は、エキスパートと
  方策の状態・行動ペアを見分ける識別器を学習し、それを報酬として使います。キャラクターアニメーションの敵対的モーション事前分布も
  同じ考え方です。
- **オフライン RL** は固定データセット上で報酬を使い、デモを行った人を超えることを目指します。
- **プレイデータと言語からの学習。** 構造化されていない遠隔操作の「プレイ」（play）データにゴールや言語指示を再ラベル付けし（CALVIN）、
  言語条件付きの方策を学習します。これが IL から VLA モデルへの一歩です。

## 試してみよう

ホームページのデモはどれも模倣学習器ではありませんが、**[Lab]({{ '/' | relative_url }}#lab)** の布のデモは良い思考実験になります。
マウスで布をドラッグすることは、変形物体のマニピュレーション軌道の「デモ」です。マウスの経路と粒子の位置を記録すれば、布をたたむ
方策の学習に使うのとまさに同じ $(o_t, a_t)$ のペアが得られます。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Pomerleau, *ALVINN: an autonomous land vehicle in a neural network* | NeurIPS | 1988 | [Paper](https://proceedings.neurips.cc/paper/1988/hash/812b4ba287f5ee0bc9d43bbf5bbe87fb-Abstract.html) | 最初のニューラルな行動クローニング |
| Ross, Gordon, Bagnell, *A reduction of imitation learning and structured prediction to no-regret online learning* | AISTATS | 2011 | [arXiv](https://arxiv.org/abs/1011.0686) | DAgger、共変量シフト |
| Ho and Ermon, *Generative adversarial imitation learning* | NeurIPS | 2016 | [arXiv](https://arxiv.org/abs/1606.03476) | GAIL |
| Ho, Jain, Abbeel, *Denoising diffusion probabilistic models* | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.11239) | DDPM、Diffusion Policy の基礎 |
| Mandlekar et al., *What matters in learning from offline human demonstrations for robot manipulation* | CoRL | 2021 | [arXiv](https://arxiv.org/abs/2108.03298) | robomimic、丁寧な BC の研究 |
| Florence et al., *Implicit behavioral cloning* | CoRL | 2021 | [arXiv](https://arxiv.org/abs/2109.00137) | 多峰性のためのエネルギーベース方策 |
| Shafiullah et al., *Behavior Transformers: cloning k modes with one stone* | NeurIPS | 2022 | [arXiv](https://arxiv.org/abs/2206.11251) | 離散化した多峰性の行動 |
| Zhao et al., *Learning fine-grained bimanual manipulation with low-cost hardware* | RSS | 2023 | [arXiv](https://arxiv.org/abs/2304.13705) | ALOHA と ACT |
| Chi et al., *Diffusion Policy: visuomotor policy learning via action diffusion* | RSS | 2023 | [arXiv](https://arxiv.org/abs/2303.04137) | 拡散による行動ヘッド |
| Walke et al., *BridgeData V2: a dataset for robot learning at scale* | CoRL | 2023 | [arXiv](https://arxiv.org/abs/2308.12952) | 広く使われるデータセット |
| Open X-Embodiment Collaboration, *Open X-Embodiment: robotic learning datasets and RT-X models* | ICRA | 2024 | [arXiv](https://arxiv.org/abs/2310.08864) | クロスエンボディメントのデータ |
| Chi et al., *Universal Manipulation Interface: in-the-wild robot teaching without in-the-wild robots* | RSS | 2024 | [arXiv](https://arxiv.org/abs/2402.10329) | 手持ち式のデータ収集 |
| Khazatsky et al., *DROID: a large-scale in-the-wild robot manipulation dataset* | RSS | 2024 | [arXiv](https://arxiv.org/abs/2403.12945) | 多様な大規模データセット |
| Ze et al., *3D Diffusion Policy* | RSS | 2024 | [arXiv](https://arxiv.org/abs/2403.03954) | 点群による条件付け |
| Fu, Zhao, Finn, *Mobile ALOHA* | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2401.02117) | 移動双腕の模倣、共同学習 |
| Zhao et al., *ALOHA Unleashed: a simple recipe for robot dexterity* | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2410.13126) | 双腕の器用さのスケーリング |

## 学習リソース

- [LeRobot](https://github.com/huggingface/lerobot)：データセット、ACT・Diffusion Policy・VLA の実装、低コストなアーム向けのチュートリアル。
- [Diffusion Policy のコードとプロジェクトページ](https://diffusion-policy.cs.columbia.edu/)（Colab ノートブック付き）。
- [ACT / ALOHA のコード](https://github.com/tonyzhaozh/act)と [UMI のプロジェクトページ](https://umi-gripper.github.io)。
- [robomimic](https://robomimic.github.io)：オフライン模倣のベンチマークと参照実装。
- R. Tedrake『[*Robotic Manipulation*](https://manipulation.csail.mit.edu)』の模倣学習の章。
- S. Levine、CS 285 の模倣学習と DAgger の講義。

## 演習

1. 誤差の累積を再現しましょう。正弦波を追従する 1 次元の点のノイズのないデモで MSE の BC を学習し、小さな観測ノイズを加えて実行し、
   誤差をホライズンに対してプロットします。次に、スクリプトで書いたエキスパートを使って DAgger を加えましょう。
2. 拡散のスクリプトで MLP を FiLM 条件付きの 1 次元畳み込み U-Net に置き換え、$H = 16$ でのサンプルの質を比べましょう。
3. 10 ステップの DDIM サンプリングを実装し、左右の割合と軌道の質がどう変わるかを測りましょう。
4. 拡散の目的関数をフローマッチングに置き換えましょう。$t\sim U(0,1)$ をサンプルし、$A^t = (1-t)\epsilon + t A^0$ として速度 $A^0 - \epsilon$ を
   回帰し、サンプリングでは 10 ステップのオイラー法で ODE を積分します。
5. 拡散サンプラの上に ACT 流の時間的アンサンブル（毎ステップ問い合わせ、重なった予測を指数重みで平均）を実装し、後退ホライズン実行と
   滑らかさを比べましょう。

**次回：**[Vision-Language-Action モデル]({{ '/blog/2026/embodied-ai-05-vision-language-action-models/' | relative_url }})。
模倣学習が基盤モデルと出会います。
