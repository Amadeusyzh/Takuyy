---
layout: post
title: "世界シミュレーションとしての動画生成：Sora、Genie、GameNGen、そしてその先へ"
date: 2026-10-27 15:03:00+0900
description: "動画生成モデルはいかにしてインタラクティブな世界シミュレータになったのか：Sora の技術レポート、Genie 1-3、GameNGen、UniSim、GAIA-1、NVIDIA Cosmos、潜在行動モデル、そして記憶・一貫性・物理という未解決の課題。"
categories: world-models
tags: [world-models, video-generation, genie, sora, latent-actions]
series: world-models
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 1 回]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})では、世界モデルをタスクごとに学習される小さな学習型シミュレータとして紹介し、[第 2 回]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})では生成モデルの道具立てを整えました。2023 年から 2025 年にかけて、この 2 つの流れは合流しました。インターネット規模のデータで学習された動画生成モデルが**世界シミュレータ**（world simulator）として語られ、実際にそう使われるようになったのです。1 枚のフレームと行動の列を与えると、次に何が起こるかを描画してくれます。グラフィックスの研究者にとって、これは驚くべき転換です。*学習された*モデルが、ゲームエンジン全体（状態更新、物理、レンダリング）を一度に置き換えてしまうからです。本記事では主要なシステムを概観し、唯一の本当に新しい要素（ラベルなし動画から学習される**潜在行動**（latent actions））を説明し、これらのモデルにまだできないことについても正直に述べます。

## 前提知識

- 第 1 回と第 2 回の内容（RSSM と想像、トークナイザ、自己回帰 Transformer、潜在拡散、classifier-free guidance、DiT）。
- 動画テンソル $(T, H, W, C)$ と、ゲームループ（game loop）の考え方（入力、状態更新、描画）に慣れていること。

## 1. 動画予測から世界シミュレーションへ

動画モデルは、クリップ $x_{1:T}$ と条件 $c$（テキストや最初のフレーム）に対して $p_\theta(x_{1:T} \mid c)$ を学習します。**世界シミュレータ**にはさらに次のものが必要です。

1. **インタラクティブ性**（interactivity）：クリップ全体を一度に生成するのではなく、行動が届くたびに 1 フレームずつ進められる分解 $p_\theta(x_{t+1} \mid x_{\le t}, a_{\le t})$。
2. **制御可能性**（controllability）：行動が実際に結果を決めること（「左へ移動」の入力でキャラクターが左に動く）、そして行動空間が意味のあるものであること。
3. **一貫性と記憶**（consistency and memory）：視線をそらして戻しても世界が同じままであること、物体が存在し続けること、そして数百フレーム後にロールアウト（rollout）がノイズへとドリフトしないこと。
4. **もっともらしいダイナミクス**（plausible dynamics）：物体が対象ドメイン（ゲームのルールや現実の物理）と同じように落下し、衝突し、遮蔽し合うこと。
5. **速度**：インタラクションに使うにはリアルタイムで動く必要があり、典型的には毎秒 20-30 フレームです。

構造上いちばん重要なのは要件 1 です。図は、以下のすべての対話的モデルが回しているループを示しています。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-next-frame.svg" localized="true" width="85%" caption="対話的な次フレーム予測：モデルは直近 $N$ フレームと行動の窓を見て $x_{t+1}$ を生成し、それをコンテキストに追加すると同時に最も古いフレームが外れます。モデルが世界について「知っている」ことはすべてこの窓に収まらなければならず、自分の誤差は次のステップで入力として戻ってきます。" %}

以下の各システムは、これらのうち異なる部分集合を解決しています。簡潔に比較すると次のようになります。

| システム | 年 | ドメイン | 生成器 | 行動入力 | リアルタイムでインタラクティブか？ |
| --- | --- | --- | --- | --- | --- |
| GAIA-1 (Wayve) | 2023 | 運転 | トークナイザ + 自己回帰 Transformer + 動画拡散デコーダ | 自車の速度/曲率、テキスト | いいえ |
| UniSim (Google DeepMind et al.) | 2023 | ロボット、人間、ナビゲーション | 動画拡散 | テキストまたは低レベル制御 | いいえ |
| Sora (OpenAI) | 2024 | 汎用動画 | 時空間パッチ上の拡散 Transformer | なし（テキスト/画像/動画プロンプト） | いいえ |
| Genie (Google DeepMind) | 2024 | 2D プラットフォーマー、ロボット動画 | VQ トークナイザ + MaskGIT ダイナミクス | 学習された潜在行動 | いいえ（約 1 fps） |
| GameNGen (Google) | 2024 | DOOM | ファインチューニングした Stable Diffusion | キーボード操作 | はい、TPU 1 基で 20 fps |
| Genie 2 (Google DeepMind) | 2024 | 画像から生成する 3D 世界 | 自己回帰型潜在拡散 | キーボード/マウス | いいえ（研究用プロトタイプ） |
| Cosmos (NVIDIA) | 2025 | フィジカル AI（ロボット、運転） | 拡散および自己回帰の世界基盤モデル | ポストトレーニング経由 | モデルによる |
| Genie 3 (Google DeepMind) | 2025 | テキストから生成する汎用 3D 世界 | 非公開 | ナビゲーション + テキストによる「ワールドイベント」 | はい、720p で 24 fps（発表による） |

時間軸に並べると次のようになります（arXiv 投稿または公式発表の月）。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-timeline.svg" caption="本稿で扱うシステムの年表（DIAMOND（第 1 回）と Diffusion Forcing（6 節）も追加）。オレンジ：リアルタイムで対話可能、紫：行動条件付き、灰色：行動入力なし。約 2 年で、オフラインの行動条件付き動画予測からリアルタイムで遊べる世界にまで進みました。" %}

## 2. Sora：「世界シミュレータとしての動画生成モデル」

OpenAI が 2024 年 2 月に公開した技術レポート ["Video generation models as world simulators"](https://openai.com/index/video-generation-models-as-world-simulators/) は、Sora を高いレベルで説明しています（モデルや実装の詳細は明示的に省かれています）。

- **動画圧縮ネットワーク**（video compression network）が、生の動画を空間的にも時間的にも圧縮された潜在表現に写像します（第 2 回の第 6 節）。
- 潜在表現は**時空間パッチ**（spacetime patches）に切り分けられ、それが**拡散 Transformer**（diffusion Transformer）のトークンとして使われます（第 2 回の第 9 節）。モデルは可変長のパッチ集合を扱うため、すべてを固定の正方形に切り抜くのではなく、動画本来の**長さ・解像度・アスペクト比**のまま学習できます。
- 学習用動画は記述的なキャプション生成モデルで付け直され（DALL·E 3 の手法）、ユーザーの短いプロンプトは言語モデルによって拡張されます。

時空間パッチは 3D で見るのがいちばん分かりやすいでしょう。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-spacetime-patches.svg" width="75%" caption="$4 \times 4 \times 6$（時間、高さ、幅）の圧縮動画潜在を $2 \times 2 \times 2$ の時空間パッチに切り分け、少し離して描いたもの。色付きのブロック 1 つが 1 トークンになり、計 12 個です。長い・大きい・横長の動画ほどトークンが増えるだけなので、モデルは元の長さとアスペクト比のまま学習できます。（サイズは説明用で、レポートは Sora のパッチサイズを公表していません。）" %}

レポートの主張はタイトルそのものです。動画生成をスケールさせると**創発的なシミュレーション能力**（emergent simulation capabilities）が生まれるとし、カメラ移動に対する 3D 一貫性、長距離の首尾一貫性と物体の永続性（ときどき）、世界の状態を変える単純なインタラクション（画家が残す筆跡、ハンバーガーのかじり跡）、そして「デジタル世界のシミュレーション」（基本的な方策でプレイヤーを操作しながら Minecraft を描画できる）を挙げています。同じレポートには失敗例も挙げられています。ガラスが割れるといった多くの基本的なインタラクションの物理を正確にモデル化できず、食べるといったインタラクションが常に正しい状態変化をもたらすとは限りません。

Sora を世界モデルとして引用する際には、2 つの注意点を覚えておく価値があります。第一に、Sora は**行動条件付きではありません**（not action-conditioned）。制御入力で 1 ステップずつ進めることはできないので、「シーンの説明でプロンプトする」という弱い意味でのシミュレータにすぎません。第二に、根拠は**定性的**なもの（厳選されたサンプル）です。第 5 回では、こうした主張を検証し、物理の理解が限られていることを示したベンチマークを取り上げます。

## 3. Genie：ラベルなし動画からの生成的インタラクティブ環境

### 3.1 問題：インターネット動画には行動がない

$p(x_{t+1} \mid x_{\le t}, a_t)$ を学習するには行動ラベルが必要ですが、インターネット上のゲームプレイ動画や実世界の動画の大部分にはラベルがありません。**Genie**（Bruce et al., "Genie: Generative Interactive Environments", ICML 2024, [arXiv:2402.15391](https://arxiv.org/abs/2402.15391)）は、約 3 万時間の 2D プラットフォーマーのゲームプレイ動画から、**行動ラベルを一切使わずに**制御可能な世界モデルを学習します。11B パラメータのモデルは 3 つの部分からなります。

1. **時空間動画トークナイザ**（spatiotemporal video tokenizer）（空間アテンションと因果的な時間アテンションを交互に行う、メモリ効率のよい ST-Transformer を用いた VQ-VAE）。各フレームに対して離散トークン $z_t$ を生成します。
2. **潜在行動モデル**（latent action model, LAM）。連続する 2 フレーム間の離散的な行動 $\tilde a_t$ を推定します（第 3.2 節）。
3. **ダイナミクスモデル**（dynamics model）。MaskGIT 風の ST-Transformer で、過去のトークンと潜在行動から次フレームのトークンを予測します：$p(z_{t+1} \mid z_{\le t}, \tilde a_{\le t})$。

図は、3 つの部品が学習時とプレイ時にどうつながるかを示しています。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-genie.svg" localized="true" caption="Genie。学習（上）に必要なのは動画だけです。トークナイザがフレームをトークンに変え、潜在行動モデルが連続する 2 フレームからコード $\tilde a_t$ を推定し、ダイナミクスモデルが過去のトークンとコードから次フレームのトークンを予測するよう学習します。プレイ（下）：潜在行動モデルは使わず、ユーザーが各ステップで 8 個のコードから 1 つを選びます。" %}

推論時には LAM は捨てられます。ユーザー（またはエージェント）が各ステップで潜在行動の 1 つを選び、ダイナミクスモデルとトークナイザのデコーダが結果を描画します。Genie はスケッチや写真を含む、一度も見たことのない画像でプロンプトでき、それらをプレイ可能な 2D 世界に変えられます。同じレシピをロボット動画で学習すると、ロボットアームに対して一貫した潜在行動が学習されました。さらに論文では、エキスパート動画から推定した潜在行動を使えば、ごく少数のラベル付きサンプルで未知のゲームの方策を学習できることも示されています。

### 3.2 潜在行動モデル

LAM は、**中央に情報ボトルネック**（information bottleneck）を持つオートエンコーダです。エンコーダは過去のフレーム $x_{1:t}$ **と**次のフレーム $x_{t+1}$ を見て連続ベクトルを出力し、それはごく少数のコードのいずれかに量子化されます（Genie では $\lvert \mathcal{A} \rvert = 8$）。デコーダは、過去のフレームとそのコードだけから $x_{t+1}$ を再構成しなければなりません。

$$
\tilde a_t = \mathrm{VQ}\big(\mathrm{Enc}_\phi(x_{1:t}, x_{t+1})\big) \in \lbrace e_1, \dots, e_{\lvert\mathcal{A}\rvert} \rbrace,\qquad
\mathcal{L}_{\mathrm{LAM}} = \big\lVert x_{t+1} - \mathrm{Dec}_\psi(x_{1:t}, \tilde a_t) \big\rVert^2 + \mathcal{L}_{\mathrm{VQ}} .
$$

過去のフレームはデコーダに与えられているので、3 ビットのボトルネックを最も安上がりに使う方法は、**何が変化し、かつそれが過去から予測できないのか**を符号化することです。ゲームでは、それは主にプレイヤーの入力です。同じ原理は **LAPO**（Schmidt & Jiang, "Learning to Act without Actions", ICLR 2024, [arXiv:2312.10812](https://arxiv.org/abs/2312.10812)）にも現れます。LAPO は Procgen の動画から潜在行動の方策と世界モデルを復元し、ごく小さなラベル付きデータで潜在行動を実際の行動に対応付けます。より古い代替手法が **VPT**（Baker et al., NeurIPS 2022, [arXiv:2206.11795](https://arxiv.org/abs/2206.11795)）です。少量のラベル付き Minecraft プレイデータで逆ダイナミクスモデル（inverse dynamics model）を学習し、それを使って 7 万時間のインターネット動画に疑似ラベルを付けます。

図は、ボトルネックによってコードが「行動」を意味するようになる理由を示しています。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-lam.svg" localized="true" width="85%" caption="潜在行動モデル。エンコーダは過去と次のフレームを見ますが、デコーダに渡るのは 3 ビット（$\lvert\mathcal{A}\rvert = 8$ 個のコード）だけです。デコーダはもともと過去フレームを受け取っている（破線）ので、ボトルネックを通す価値があるのは、変化した部分のうち過去から予測できないもの、つまりゲームではほとんどがプレイヤーの入力です。" %}

潜在行動には既知の弱点があります。エージェントが引き起こしたのではない変化（カメラの揺れ、他のキャラクター）を捉えてしまうことがあり、ドメイン間で揃っておらず、小さな離散コードブックでは連続的な制御をうまく表現できません。第 8 節に実行可能なおもちゃの LAM があります。

### 3.3 Genie 2 と Genie 3

**Genie 2**（Google DeepMind ブログ、[2024 年 12 月](https://deepmind.google/discover/blog/genie-2-a-large-scale-foundation-world-model/)）は 3D へと移行しました。これは**自己回帰型潜在拡散モデル**（autoregressive latent diffusion model）と説明されています。フレームはオートエンコーダを通され、LLM のように因果マスクで学習された大規模な Transformer ダイナミクスモデルが、過去の潜在表現とキーボード/マウスの行動を条件として、拡散によって次の潜在フレームを生成します。行動の制御性を高めるために classifier-free guidance が使われています。1 枚の画像（たとえば Imagen 3 によるもの）でプロンプトすると、最大 1 分間一貫性を保つ世界を生成し、視界から外れたシーンの部分を記憶し、水、煙、重力、照明といった効果をモデル化します。DeepMind はこれを使って、SIMA エージェント用の評価環境を生成しました。

**Genie 3**（Google DeepMind ブログ、[2025 年 8 月](https://deepmind.google/discover/blog/genie-3-a-new-frontier-for-world-models/)）はテキストプロンプトから生成され、シリーズで初めて**リアルタイムでインタラクティブ**なモデルです。発表によれば、720p で毎秒 24 フレーム、数分間にわたる一貫性を実現しています。また、**プロンプト可能なワールドイベント**（promptable world events）も導入されました。これは実行中の世界を変えるテキスト指示（天候、新しい物体やキャラクター）です。発表には、エージェントの行動空間が限られていること、マルチエージェントのインタラクションが難しいこと、実在の場所や文字の描画が不正確であること、インタラクションの持続時間が限られていることなどの制約が挙げられています。発表時点では論文やアーキテクチャの詳細は公開されていないため、具体的な能力に関する主張はあくまで同社自身のものとして扱ってください。

*更新（2026 年 11 月）：* Genie 3 は 2026 年 1 月に **Project Genie** として一般に使えるようになり、**Genie 4** が 2026 年 10 月 27 日にリサーチプレビューとして発表され、ネイティブ音声と言語による操作が加わりました。本記事末尾の 2025〜2026 年の進展の節を参照してください。

## 4. GameNGen：ゲームエンジンとしての拡散モデル

**GameNGen**（Valevski et al., "Diffusion Models Are Real-Time Game Engines", ICLR 2025, [arXiv:2408.14837](https://arxiv.org/abs/2408.14837)）は、範囲は狭いものの鋭い問いを立てます。ニューラルネットワークは、複雑なゲームのゲームエンジン*そのもの*になれるのか、という問いです。GameNGen は TPU 1 基で、DOOM を毎秒 20 フレームでインタラクティブに、数分間にわたってシミュレートします。レシピは 2 段階からなります。

1. **データ**：強化学習エージェントが DOOM のプレイを学習し、そのすべての学習エピソード（多様なカバレッジをもたらす、序盤の下手なエピソードも含む）が（フレーム、行動）の系列として記録されます。
2. **モデル**：Stable Diffusion v1.4 を次フレーム予測器として転用します。テキスト条件は直近の行動の埋め込みに置き換えられ、過去のフレームはオートエンコーダで符号化されたうえで、ノイズの乗った潜在表現とチャネル方向に連結されます。

$$
p_\theta\big(x_{t+1} \mid x_{t-N+1:t},\ a_{t-N+1:t}\big)
$$

ここで $N$ はコンテキストに含まれる過去のフレームと行動の数です（論文では 64）。

決定的な工夫は**コンテキストのノイズ拡張**（noise augmentation of the context）です。学習時に、*条件として与える*フレームをランダムな強度のガウスノイズで劣化させ、その強度をモデルへの入力として与えます。これによりモデルは自身のコンテキスト中の誤差を補正することを学び、さもなければ数秒でロールアウトを破綻させてしまう自己回帰的なドリフトを止めます。著者らはさらに、HUD のアーティファクトを減らすために潜在デコーダをファインチューニングし、わずか 4 ステップの DDIM でサンプリングし、次フレームの PSNR が 29.4（非可逆 JPEG と同程度）であると報告しています。人間の評価者が実際のゲームとシミュレーションの短いクリップを見分ける精度は、偶然よりわずかに高い程度でした。

これらを組み合わせると、GameNGen の 1 回のデノイズは次のようになります。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-gamengen.svg" localized="true" caption="論文に記述された GameNGen：過去フレームを Stable Diffusion のオートエンコーダで符号化し、ランダムな強さ $\sigma$ のガウスノイズで汚し（$\sigma$ もモデルへの入力）、次フレームのノイズ付き潜在とチャネル方向に連結します。過去の行動の埋め込みが U-Net のテキスト条件の代わりになり、DDIM 4 ステップで $x_{t+1}$ を生成します。" %}

GameNGen の限界も同じくらい示唆に富んでいます。約 3 秒分の視覚的コンテキストしかないため、**長期記憶がありません**。画面に映っていないゲーム状態（どのエリアを訪れたかなど）は、HUD に表示される内容を通してしか保持されません。DIAMOND（第 1 回）も CS:GO で同様の結論に達しています。

図は、有限のコンテキスト窓が長期記憶の欠如を意味する理由を描いたものです。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-memory.svg" localized="true" width="85%" caption="ループ状の経路を歩く様子の俯瞰図。$t_1$ でエージェントは赤い目印を見ます。$t_2$ で再び同じ場所を向きますが、コンテキスト窓（オレンジの区間）は経路の最後の部分しか含まないため、モデルの入力にはその目印がどう見えたかを示すものが何もありません。モデルは想像し直すしかなく、結果が一致する保証はありません。" %}

## 5. 行動条件付きの実世界シミュレータ

### 5.1 UniSim

**UniSim**（Yang et al., "Learning Interactive Real-World Simulators", ICLR 2024 Outstanding Paper, [arXiv:2310.06114](https://arxiv.org/abs/2310.06114)）は実世界を対象としています。その洞察は、データセットごとに異なる種類の「行動」が含まれているという点です。画像キャプションデータのテキスト、ロボットデータのモーター指令、ナビゲーションデータのカメラ移動、人間の活動を記述した言語などです。UniSim はこれらすべてを、履歴と行動が与えられたときに次の動画セグメントを予測する 1 つの動画拡散モデルの条件として扱います。論文ではさらに、(a) 高レベルの視覚言語プランナーと (b) 低レベルの強化学習方策を完全にシミュレータ内だけで学習し、実ロボットへのゼロショット転移を示しています。これは、動画世界モデルが単にきれいな動画を作るためだけでなく、*学習用のシミュレータとして*使えることを最も明確に示した例です。

### 5.2 運転のための GAIA-1

**GAIA-1**（Hu et al., Wayve, [arXiv:2309.17080](https://arxiv.org/abs/2309.17080), 2023）は自動運転のための生成的世界モデルです。動画、テキスト、自車の行動がトークンに符号化され、自己回帰 Transformer の世界モデルが次の画像トークンを予測し（将来予測を次トークン予測として扱う）、別の動画拡散デコーダが高解像度のフレームを描画します。行動を条件とすることで反実仮想的な問い（「車が左にハンドルを切っていたら？」）を立てることができ、テキストプロンプトで天候や時間帯を変えることもできます。まれで危険なシナリオこそシミュレータが生成すべきものなので、運転は自然な応用先です。

*更新（2026 年 11 月）：* この系譜は GAIA-2（2025 年、複数カメラの潜在拡散）と GAIA-4（2026 年、閉ループのカメラとレーダーのシミュレーション）へと続き、Waymo は Genie 3 を土台に独自の運転世界モデルを構築しました。更新の節を参照してください。

### 5.3 NVIDIA Cosmos

**Cosmos**（NVIDIA, "Cosmos World Foundation Model Platform for Physical AI", [arXiv:2501.03575](https://arxiv.org/abs/2501.03575), 2025）は、世界モデルをフィジカル AI のための**基盤モデル**（foundation models）として位置付けています。このプラットフォームには、動画キュレーションのパイプライン、連続および離散の **Cosmos トークナイザ**、拡散型と自己回帰型の両方の事前学習済み**世界基盤モデル**（world foundation models）、ガードレール、そして汎用モデルをカメラ制御、ロボットマニピュレーション、自動運転に特化させるポストトレーニングの例が含まれています。モデルは NVIDIA Open Model License のもとで公開されています（[github.com/NVIDIA/Cosmos](https://github.com/NVIDIA/Cosmos)）。想定されているワークフローは「幅広い動画で一度事前学習し、自分のロボットや車でポストトレーニングする」というもので、LLM の適応方法とよく似ています。大規模なオープンの動画世界モデルで実験したいなら、Cosmos はよい出発点です。

*更新（2026 年 11 月）：* NVIDIA はその後、Cosmos-Predict2.5 と Transfer2.5（2025 年 10 月）、さらに推論と行動出力も行う mixture-of-transformers モデルである **Cosmos 3**（2026 年 6 月）を発表しました。更新の節を参照してください。

## 6. 自己回帰的な動画ロールアウトを安定させる

インタラクティブなモデルはすべてフレームごと（あるいはチャンクごと）に生成し、自身の出力を条件とするため、第 1 回で扱った誤差蓄積の問題に深刻な形で直面します。繰り返し目にすることになる手法は次のとおりです。

- **コンテキストのノイズ拡張**（context noise augmentation）（GameNGen、Genie 2 系のモデル）：劣化させたコンテキストで学習し、劣化の度合いをモデルに伝えます。
- **Diffusion Forcing**（Chen et al., NeurIPS 2024, [arXiv:2407.01392](https://arxiv.org/abs/2407.01392)）：学習時に系列中の各フレームに**独立したノイズレベル**を与えます。このように学習した因果モデルは、過去のフレームがクリーンまたはわずかにノイズを含む状態で次のフレームをデノイズでき、未来の不確実性を保ちつつ長いロールアウトを安定させます。さらに、プランニングのために未来の軌道全体に対するガイダンスも可能にします。
- **KV キャッシュ付きの因果アテンション**（causal attention with KV caching）により新しいフレームごとの計算量を一定にし、**ステップ蒸留**（step distillation）（少ステップまたは 1 ステップのサンプラ）でリアルタイムの速度を実現します。
- **記憶機構**（memory mechanisms）：より長いコンテキストウィンドウ、過去フレームの圧縮された記憶、カメラ姿勢によるフレームの検索、あるいはシーンの明示的な 3D 表現。最後の選択肢は、そのまま[第 4 回]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})につながります。

図のように、これらの方式の違いは、学習系列の各フレームにどのノイズレベルを与えるかだけです。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-diffusion-forcing.svg" localized="true" width="85%" caption="フレームごとのノイズレベル（白 = きれい、濃い色 = 純粋なノイズ、灰色 = 入力に含まれない）。系列全体の拡散はクリップ全体に 1 つのレベルを使い、次フレーム予測は過去をきれいなまま予測対象のフレームだけにノイズを加え、Diffusion Forcing はフレームごとに独立にレベルをサンプリングします。これによりサンプリング時に因果的な「ピラミッド」スケジュール（右下）が使え、各フレームは前のフレームより少し遅れてデノイズされるので、近い未来ほどはっきりします。" %}

## 7. まだ足りないもの

- **長期的な一貫性と記憶。** 2 回振り返ると部屋が変わってしまいます。ピクセル空間のモデルには、コンテキストウィンドウ以外に永続的な状態がありません。数分単位の一貫性は最先端の主張であり、数時間単位は未解決です。（*更新、2026 年 11 月：* 姿勢で索引付けした記憶を持つオープンなモデルが分単位の一貫性を報告するようになりました。時間単位の一貫性と画面外の動きは未解決のままです。更新の節を参照してください。）
- **物理。** Kang et al.（"How Far is Video Generation from World Model: A Physical Law Perspective", ICML 2025, [arXiv:2411.02385](https://arxiv.org/abs/2411.02385)）は、合成した 2D 物理データで動画拡散モデルを学習し、分布内ではほぼ完璧に汎化する一方、分布外では失敗することを見いだしました。モデルは法則を学ぶのではなく、**事例ベース**（case-based）の検索（最も近い学習例の模倣）のように振る舞うのです。Physics-IQ（Motamed et al., WACV 2026, [arXiv:2501.09038](https://arxiv.org/abs/2501.09038)）は、現在の動画モデルの物理理解は著しく限られており、視覚的なリアルさとは無関係であることを示しました。評価については第 5 回で改めて扱います。
- **制御可能性と行動空間。** あるゲームではキーボード操作、別のゲームでは潜在行動、また別の場所ではロボットの関節指令というように、共通の行動インターフェースが存在せず、これが転移を制限しています。
- **因果と相関。** 受動的な動画で学習したモデルは「傘が雨を引き起こす」と学習してしまうかもしれません。介入データ（行動）は役に立ちますが、ほとんどの動画には行動がありません。
- **計算量。** 高解像度でのリアルタイム生成には大がかりな蒸留と専用ハードウェアが必要で、学習予算はほとんどの研究室にとって手の届かないものです。
- **評価。** FVD や視覚品質の指標は、シミュレータがエージェントの学習に役立つかどうかについてほとんど何も教えてくれません（第 5 回）。

## 8. コード：おもちゃの潜在行動モデル

以下のスクリプトで、潜在行動のアイデアを具体的に確かめます。$12 \times 12$ のグリッド上を、1 つの点が 5 つの隠れた行動（静止、上、下、左、右）に従って動きます。8 通りの離散ボトルネックを持つ LAM を、**フレームのペア** $(x_t, x_{t+1})$ **だけで**学習し、その後、学習されたコードが隠れた行動と対応しているかを確認し、選んだコードを繰り返し入力して世界モデルを「プレイ」します。この小さな規模でも安定して学習できるよう、ボトルネックには Genie の VQ ではなく straight-through Gumbel-softmax を使い（どちらも勾配を保ったまま離散コードを与えます）、エンコーダはグローバルプーリング付きの畳み込みネットワーク、つまり平行移動不変なものにしています。CPU で 2 分ほどで実行できます。

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

torch.manual_seed(0)
G, K = 12, 8                                      # grid size, number of latent actions
MOVES = torch.tensor([[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]])   # stay, up, down, left, right

def render(pos):
    ys, xs = torch.meshgrid(torch.arange(G), torch.arange(G), indexing="ij")
    d2 = (ys[None] - pos[:, 0, None, None]) ** 2 + (xs[None] - pos[:, 1, None, None]) ** 2
    return torch.exp(-d2.float() / 0.5).reshape(len(pos), -1)

def sample_transitions(n):
    pos = torch.randint(1, G - 1, (n, 2))
    act = torch.randint(0, 5, (n,))
    nxt = (pos + MOVES[act]).clamp(0, G - 1)
    return render(pos), render(nxt), act

def mlp(i, o, h=256):
    return nn.Sequential(nn.Linear(i, h), nn.ReLU(), nn.Linear(h, h), nn.ReLU(), nn.Linear(h, o))

class ConvEncoder(nn.Module):
    """Translation-invariant: conv layers + global max pooling, so a code can only describe the motion."""
    def __init__(self):
        super().__init__()
        self.conv = nn.Sequential(nn.Conv2d(2, 32, 3, padding=1), nn.ReLU(), nn.Conv2d(32, 32, 3, padding=1), nn.ReLU())
        self.head = nn.Linear(32, K)

    def forward(self, x, x_next):
        h = self.conv(torch.stack([x, x_next], 1).view(-1, 2, G, G))
        return self.head(h.amax(dim=(2, 3)))

enc = ConvEncoder()
dec = mlp(G * G + K, G * G)
opt = torch.optim.Adam([*enc.parameters(), *dec.parameters()], lr=1e-3)
for step in range(3000):
    x, x_next, _ = sample_transitions(256)
    z = F.gumbel_softmax(enc(x, x_next), tau=1.0, hard=True)
    loss = F.mse_loss(dec(torch.cat([x, z], 1)), x_next) * 100
    opt.zero_grad(); loss.backward(); opt.step()
    if step % 1000 == 0:
        print(f"step {step}  loss {loss.item():.4f}")
with torch.no_grad():
    x, x_next, act = sample_transitions(5000)
    idx = enc(x, x_next).argmax(1)
    for a, name in enumerate(["stay", "up", "down", "left", "right"]):
        c = torch.bincount(idx[act == a], minlength=K)
        print(f"{name:>5}: code {c.argmax().item()}, purity {(c.max() / c.sum()).item():.2f}")
    right = torch.bincount(idx[act == 4], minlength=K).argmax()
    frame = render(torch.tensor([[6, 3]]))
    for t in range(4):
        frame = dec(torch.cat([frame, F.one_hot(right, K).float()[None]], 1))
        r, c = divmod(frame.argmax().item(), G)
        print(f"t={t + 1}: dot at row {r}, col {c}")
```

このおもちゃの例では、5 つの隠れた行動はたいてい高い純度で別々のコードに対応し、「右」のコードを繰り返し押すと点が 1 ステップごとに 1 マス右へ動きます。試してみるとよいこと：ランダムに動く、*制御されない* 2 つ目の点を追加し、コードがその動きまで符号化し始めるかどうかを確かめる（LAM の既知の失敗モード）。あるいはコードブックを 4 に縮小し、どの行動が統合されるかを見る。さらに、`ConvEncoder` を連結したフレームに対する MLP に置き換えてみてください。再構成損失は下がり続けますが、コードの純度は 0.2〜0.3 程度（ほぼチャンスレベル）まで落ちます。デコーダも現在の位置を見ているため、各コードの意味がグリッドの領域ごとに変わってしまえるからです。潜在行動が状態をまたいで一貫するのは、アーキテクチャや学習がそれを強制する場合だけであり、多様な動画で学習する LAM にとって実際の問題です。

同じシードで、このスクリプトと上で述べた MLP エンコーダ版を実行しました。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-lam-results.svg" caption="上：各隠れ行動の遷移が、学習された 8 個のコードにどう割り当てられたかの割合。並進不変な ConvEncoder では各行動が専用のコードを持ちます（平均純度 0.96、「down」は 2 つのコードに分かれる）。MLP エンコーダではコードが混ざり合います（平均純度 0.25、偶然に近い）。下：3 列目から「right」のコードを 4 回入力して ConvEncoder の世界モデルを「プレイ」した結果。点は 1 ステップに 1 マスずつ右へ動いて 7 列目に達し、その一方でデコーダの小さな誤差が背景ノイズとして蓄積していきます。" %}

## 2025〜2026 年の進展（2026 年 11 月時点）

この節では、本文の執筆後から 2026 年 11 月初めまでに起きたことを補足します。この時期、インタラクティブな動画世界モデルは急速に進歩しました。リアルタイム生成が当たり前になり、オープンなモデルが 2025 年のクローズドなデモに追いつき、関心は「見た目が正しいか」から「記憶しているか、エージェントが使えるか」へと移りました。各項目にはステータスを記しています。「プレプリント」はまだ学会や論文誌で発表されていない arXiv 論文、「発表」は企業のブログや製品ページを指し、その能力に関する記述は査読済みの結果ではなく企業自身の主張です。下のタイムラインには、この更新（および第 4 回・第 5 回の更新）で扱うすべてのシステムをまとめました。項目をタップすると、要約、ステータス、リンクが表示されます。

{% include widget.liquid name="world-models-timeline" height="560" caption="試してみましょう：第 3〜5 回の 2025〜2026 年の更新で扱った世界モデルの、絞り込み可能なタイムラインです。ボタンで種類を絞り込み、点をタップ（または矢印ボタンを使用）すると、2 行の要約、ステータス（塗りつぶしの点 = 論文、白抜きの点 = 企業の発表や製品）、リンクが表示されます。破線は 2026 年 11 月初めを示します。インタラクティブ動画の行が 2025 年半ばから密になり、評価の論文がおよそ 1 年遅れで続いていることに注目してください。" %}

### Google DeepMind：Genie 3 から Project Genie、Genie 4 へ

3.3 節では **Genie 3**（2025 年 8 月）を紹介しました。テキストプロンプトから世界を生成し、720p・毎秒 24 フレームで、数分間の一貫性と約 1 分の視覚的記憶を持つモデルです。2026 年 1 月、Google はこれを研究室の外で使えるようにしました。**Project Genie**（[Google ブログ、2026 年 1 月 29 日](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/)）は、Genie 3、画像モデル Nano Banana Pro、Gemini を組み合わせた実験的なウェブアプリです。最初は米国の成人の Google AI Ultra 加入者向けに提供され、1 回の生成は 60 秒に制限されています。2026 年 10 月 27 日には DeepMind が **Genie 4**（[DeepMind ブログ](https://deepmind.google/blog/genie-4-a-new-generation-of-world-simulation/)）を、信頼できるテスター向けのリサーチプレビューとして発表しました。発表では、ネイティブに生成される音声（出来事に反応する環境音、音楽、会話）、自然言語プロンプトによるリアルタイムの操作、物理と人物キャラクターのより良いシミュレーションが強調されています。Gemini モデルがシミュレーションを支えており、テキストのプロンプトを周囲のシーンに合わせて解釈し、入力と入力の間も世界を進行させ続けます。ブログには解像度、フレームレート、アーキテクチャの記載がなく、一貫性が保たれるのは*短いセッション*の間であり、長時間の実行や多数の編集の後にはずれが生じうると書かれています。第 7 節の言葉でいえば、最先端の主張はいまだに「数時間ではなく数分」です。Genie 3 はドメイン特化モデルの土台にもなりました。それが **Waymo World Model**（後述の自動運転の項）です。

### オープンなリアルタイム・インタラクティブモデル

学習者にとって 2025〜2026 年の最も重要な変化は、インタラクティブな世界モデルを自分で*動かせる*ようになったことです。オープンなモデルの多くは同じレシピに従っています。大規模な事前学習済みのテキスト・画像から動画への拡散モデル（多くは Wan。[第 2 回]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})を参照）から出発し、因果的にして行動条件を加えます。そのうえで、Self Forcing 型の目的関数で少ステップの自己回帰サンプラーに蒸留します（Self Forcing とその後継は第 2 回の更新で説明します）。

- **Matrix-Game 2.0**（He et al.、プレプリント、[arXiv:2508.13009](https://arxiv.org/abs/2508.13009)、2025 年 8 月）は、大規模なゲームと運転のデータで学習した、オープンソースでリアルタイム・ストリーミングの世界モデルです。因果的な少ステップ拡散の生徒モデルにキーボードとマウスの条件付けを組み合わせ、GameNGen の考え方（第 4 節）をオープンドメインの場面と長いストリームで成り立たせました。**Matrix-Game 3.0**（Wang et al.、プレプリント、[arXiv:2604.08995](https://arxiv.org/abs/2604.08995)、2026 年 4 月）は記憶を加えます。カメラ姿勢で過去のフレームを検索し、DMD で複数区間にわたって蒸留し、量子化と枝刈りした VAE デコーダでデコードを高速化します。5B モデルで 720p・最大 40 fps、1 分に及ぶ系列での記憶の一貫性が報告されています。
- **Hunyuan-GameCraft**（Li et al.、プレプリント、[arXiv:2506.17201](https://arxiv.org/abs/2506.17201)、2025 年 6 月）は、キーボードとマウスの入力を共通のカメラ運動空間に写し、学習時に複数の履歴条件を混ぜることで、長いゲーム風の動画が入力に反応し続けるようにします。**Yan**（Ye et al.、プレプリント、[arXiv:2508.08601](https://arxiv.org/abs/2508.08601)、2025 年 8 月）は、リアルタイムのシミュレーション、マルチモーダルな生成、実行中の世界のテキストによる編集という 3 つの部分からなるフレームワークです。
- **WorldPlay**（Sun et al.、プレプリント、[arXiv:2512.14614](https://arxiv.org/abs/2512.14614)、2025 年 12 月）は速度と記憶のトレードオフに取り組みます。行動を 2 通りに表現し、過去のフレームからコンパクトなコンテキスト記憶を再構成し、「context forcing」による蒸留を用います。720p を 24 fps でストリーミング生成し、長期的な幾何の一貫性が向上しています。**AlayaWorld**（プレプリント、[arXiv:2607.18367](https://arxiv.org/abs/2607.18367)、2026 年 7 月）は 24 fps の 15B 自己回帰動画 DiT です。コンテキストは「シンク」フレーム、圧縮された履歴、空間記憶、直近のフレームの 4 つから構成されます。蒸留により、各チャンクのサンプリングは約 30 ステップから 4 ステップに減ります。
- **LongLive**（Yang et al.、プレプリント、[arXiv:2509.22622](https://arxiv.org/abs/2509.22622)、2025 年 9 月）は行動条件付きではありませんが、長い動画で同じ仕組みを示しています。フレーム単位の自己回帰モデルで、生成中にユーザーがプロンプトを切り替えられます。1.3B モデルが H100 1 枚で 20.7 fps で動作し、最長 240 秒の動画を生成します。

### 記憶：最大の研究フロント

第 7 節では長期的な一貫性を最大の欠落として挙げましたが、2025〜2026 年の論文の多くはこれに取り組んでいます。図は基本的な予算の問題を示しています。過去の潜在フレームをすべてコンテキストに保持するモデルは、メモリとアテンションのコストがロールアウト長 $T$ とともに増えます。$W$ フレームのスライディングウィンドウは安価ですが、忘れてしまいます。一般的な折衷案は、ウィンドウを残したうえで*選ばれた* $K$ 枚の記憶フレーム（またはコンパクトな 3D 状態）を加えることです。こうするとコストは有界のまま、昔の場所を思い出すこともできます。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-update-memory.svg" width="85%" caption="24 fps の動画を時間方向に 4 倍圧縮（毎秒 6 潜在フレーム）したときの、コンテキストの大きさ $N_{ctx}$（潜在フレーム数、対数目盛）とロールアウト時間の関係です。完全なコンテキストは $O(T)$ で増え（赤）、2 分後には 720 フレームに達します。5 秒のスライディングウィンドウ（青の破線）は $W = 30$ で一定ですが、5 秒より前のものは何も見えません。ウィンドウに検索した $K = 16$ 枚の記憶フレームを加えたもの（緑）も 46 で一定で、しかも古い視点にアクセスできます。縦の破線は、Genie 3 について述べられている「約 1 分」の視覚的記憶です。" %}

記憶の設計は、暗黙的なものから明示的なものへとおおよそ 4 つの系統に分けられます。

1. **カメラ姿勢による過去フレームの検索。** *WorldMem*（Xiao et al.、プレプリント、[arXiv:2504.12369](https://arxiv.org/abs/2504.12369)）は過去のフレームを姿勢とタイムスタンプとともに保存し、関連するものにアテンションを向けます。*Context as Memory*（Yu et al.、SIGGRAPH Asia 2025、[arXiv:2506.03141](https://arxiv.org/abs/2506.03141)）は、カメラの視錐台が現在の視点と重なるフレームをコンテキストとして選びます。*VMem*（Li et al.、ICCV 2025、[arXiv:2506.18903](https://arxiv.org/abs/2506.18903)）はサーフェル（surfel）で過去の視点に索引を付けます。*ReWorld*（Chen et al.、プレプリント、[arXiv:2608.23565](https://arxiv.org/abs/2608.23565)、2026 年 8 月）は、有界の KV キャッシュと姿勢で索引付けしたランドマークバンクを保持します。4 ステップのサンプリングで 704x1280 の動画をストリーミングし、64 秒の往復の後でも出発地点の視点を再生成できます。World Labs の **RTFM**（[ブログ、2025 年 10 月](https://worldlabs.ai/blog/rtfm)）は、製品のリサーチプレビューで同じ原理を用いています。明示的な 3D はなく、姿勢付きのフレームが空間記憶として働き、近くのフレームがコンテキストに「入れ替え」（context juggling）られます。H100 1 枚でインタラクティブな速度で動作します。
2. **圧縮された再帰状態。** *Long-Context State-Space Video World Models*（Po et al.、プレプリント、[arXiv:2505.20171](https://arxiv.org/abs/2505.20171)）は、長期記憶にブロック単位の状態空間層を、細部に局所アテンションを使います。[第 1 回]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})の RSSM の考え方を動画の規模に広げたものです。
3. **長いコンテキストに対する学習されたスパースアテンション。** *Mixture of Contexts*（Cai et al.、プレプリント、[arXiv:2508.21058](https://arxiv.org/abs/2508.21058)）は、各クエリを長い履歴のうち関連する少数のチャンクにだけ振り分け、密なアテンションを避けます。
4. **明示的な 3D 記憶。** この系統のモデルはフレームを点群やガウシアンに逆投影し、その状態をレンダリングして条件として与えます。例としては第 4 回の更新で扱う GEN3C と Voyager、そしてガウシアン記憶が時間ではなく探索した場面の広さに応じて増える *L3G-World*（2026 年 10 月）があります。

2026 年の丁寧な研究 **Echo-Memory**（King et al.、プレプリント、[arXiv:2606.09803](https://arxiv.org/abs/2606.09803)、2026 年 6 月）は、共通のバックボーン上でこれらの選択肢を比較しています。生のコンテキストは強いベースラインであること、強い圧縮はある場所に戻るのに必要な手がかりを失うこと、オープンドメインで戻る能力が最も高かったのはブロック単位の状態空間再帰であることが示されました。この分野を整理したサーベイとして、*Towards Interactive Video World Modeling*（[arXiv:2606.01164](https://arxiv.org/abs/2606.01164)）と *The Past Frames the Future: Memory for Autoregressive Video Generation*（[arXiv:2609.28466](https://arxiv.org/abs/2609.28466)）があります。ただし、第 5 回の更新で扱う WRBench（2026 年 6 月）は、現在のモデルが*見えていない*出来事を進行させ続けないことを示しており、これらすべてに冷や水を浴びせる結果です。ある場所の見た目を覚えていることは、離れている間にそこで起きたことをシミュレーションすることと同じではありません。

### フィジカル AI の基盤モデルと汎用世界モデル

- **Cosmos の第 2・第 3 世代。** NVIDIA の *World Simulation with Video Foundation Models for Physical AI*（プレプリント、[arXiv:2511.00062](https://arxiv.org/abs/2511.00062)、2025 年 10 月）は Cosmos-Predict2.5 と Cosmos-Transfer2.5 を導入しました。フローベースの動画モデルがテキスト・画像・動画から世界への生成を統一し、Transfer モデルは深度、セグメンテーション、エッジなどの制御入力を加えます（Cosmos-Transfer1：[arXiv:2503.14492](https://arxiv.org/abs/2503.14492)）。Cosmos-Reason1（[arXiv:2503.15558](https://arxiv.org/abs/2503.15558)）は推論を担う視覚言語の部分です。2026 年 6 月 1 日、NVIDIA は **Cosmos 3**（[プレスリリース](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Launches-Cosmos-3-the-Open-Frontier-Foundation-Model-for-Physical-AI/default.aspx)）を発表しました。これはオープンな「オムニモデル」とされ、推論用 Transformer と生成エキスパートを組み合わせた mixture-of-transformers 構成で、テキスト、画像、動画、環境音、行動を理解・生成します。視覚言語モデル、世界モデル、あるいはロボット向けの「世界行動モデル」（world action model）のバックボーンとして使えます。NVIDIA は Physics-IQ を含む複数のリーダーボードでオープンモデル中 1 位だと述べていますが、独立した評価が出るまでは企業の主張として扱ってください。この設計は、5.3 節のシミュレータとしての役割と、[身体性 AI 第 5 回]({{ '/blog/2026/embodied-ai-05-vision-language-action-models/' | relative_url }})のプランナー・方策としての役割を一つにまとめるものです。
- **Runway GWM-1**（[Runway、2025 年 12 月 11 日](https://runway.com/research/introducing-runway-gwm-1)）は、動画モデル Gen-4.5 の上に構築された自己回帰型の世界モデルです。フレームごとに生成し、カメラ姿勢、ロボット指令、音声で制御できます。事後学習した 3 つの派生モデル（Worlds、Avatars、Robotics）があり、出力は 720p、動画は最長 2 分です。
- **Emu3.5**（Cui et al.、プレプリント、[arXiv:2510.26583](https://arxiv.org/abs/2510.26583)、2025 年 10 月）は、動画由来の長い系列を含むインターリーブされた視覚言語データで学習した、ネイティブなマルチモーダル次トークン予測モデルで、「世界の学習者」と位置づけられています。第 2 回の自己回帰の系統が、拡散と並んでいまも健在であることを示しています。

### 自動運転の世界モデル

自動運転は依然として最も成熟した産業応用です（5.2 節）。**GAIA-2**（Russell et al.、プレプリント、[arXiv:2503.20523](https://arxiv.org/abs/2503.20523)、2025 年 3 月）は、一貫した複数カメラの動画を生成する潜在拡散モデルで、自車の行動、他の交通参加者、天候、道路レイアウトで制御できます。Wayve の **GAIA-4**（[Wayve ブログ、2026 年 8 月 3 日](https://wayve.ai/thinking/gaia-4/)）は*閉ループ*のシミュレーションに進みました。記録されたセンサーログから場面を再構成し、運転方策をループの中に残すので、方策の判断が次に受け取るカメラ*とレーダー*の入力を変えます。反応型エージェントを有効にしない限り、他の道路利用者はログどおりの振る舞いを再生します。**Waymo World Model**（[Waymo ブログ、2026 年 2 月 6 日](https://waymo.com/blog/2026/02/the-waymo-world-model-a-new-frontier-for-autonomous-driving-simulation)）は Genie 3 を運転向けに事後学習したもので、カメラと LiDAR の両方の出力（4D 点群）を生成し、運転行動、シーンレイアウト、言語による制御を備えています。Waymo はこれを、まれで安全上重要な事象をシミュレーションするための道具として位置づけています。汎用の世界モデルがドメイン特化シミュレータの土台になった最も明確な例であり、5.3 節の「広く事前学習し、自分の車のデータで事後学習する」というワークフローそのものです。

### 「まだ足りないもの」で変わったこと

- **計算量とリアルタイム性：** 蒸留により、オープンなモデルでも 720p ではほぼ解決しました（GPU 1 枚で毎秒数十フレーム）。いま未解決なのは速度ではなく、長いストリームでの品質です。
- **記憶：** 分単位の一貫性は、最先端の主張だけでなくオープンなモデルの成果になりました。時間単位の一貫性と*永続的な動的状態*（画面外で続く出来事）は未解決のままです。
- **行動空間：** 依然として断片的です。探索型のモデルではカメラ姿勢が事実上の共通インターフェースとなり、ロボットのモデルは動画と行動の同時予測へ向かいました（第 1 回の更新を参照）。
- **物理と評価：** 物理のベンチマークは急増しましたが、最良のモデルでも満点にはほど遠い状況です（第 5 回の更新を参照）。

これらのモデルがゲームエンジンにどう組み込まれつつあるか（エンジン内のニューラルレンダリング、プレイ可能なニューラルゲーム、エンジン側のツール）は[グラフィックスエンジン第 6 回]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }})を、比較対象となる古典的なシミュレータ（Isaac、MuJoCo、Newton など）は[グラフィックスエンジン第 5 回]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})を参照してください。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | なぜ重要か |
| --- | --- | --- | --- | --- |
| Video Diffusion Models (Ho et al.) | NeurIPS | 2022 | [arXiv:2204.03458](https://arxiv.org/abs/2204.03458) | 動画向けの初期の拡散モデル |
| Video PreTraining (VPT): Learning to Act by Watching Unlabeled Online Videos (Baker et al.) | NeurIPS | 2022 | [arXiv:2206.11795](https://arxiv.org/abs/2206.11795) | 逆ダイナミクスによるインターネット動画への疑似ラベル付け |
| GAIA-1: A Generative World Model for Autonomous Driving (Hu et al.) | arXiv (Wayve tech report) | 2023 | [arXiv:2309.17080](https://arxiv.org/abs/2309.17080) | 行動とテキストで制御できるトークンベースの運転世界モデル |
| Learning Interactive Real-World Simulators (UniSim, Yang et al.) | ICLR | 2024 | [arXiv:2310.06114](https://arxiv.org/abs/2310.06114) | 異種の行動を統一し、動画シミュレータ内で方策を学習 |
| Learning to Act without Actions (LAPO, Schmidt, Jiang) | ICLR | 2024 | [arXiv:2312.10812](https://arxiv.org/abs/2312.10812) | 観測のみの動画から潜在行動の方策を学習 |
| Video generation models as world simulators (Sora, OpenAI) | technical report | 2024 | [openai.com](https://openai.com/index/video-generation-models-as-world-simulators/) | 時空間パッチの拡散 Transformer、「創発的シミュレーション」の主張 |
| Genie: Generative Interactive Environments (Bruce et al.) | ICML | 2024 | [arXiv:2402.15391](https://arxiv.org/abs/2402.15391) | 潜在行動によりラベルなし動画から制御可能な世界を生成 |
| Diffusion Forcing: Next-token Prediction Meets Full-Sequence Diffusion (Chen et al.) | NeurIPS | 2024 | [arXiv:2407.01392](https://arxiv.org/abs/2407.01392) | フレームごとのノイズレベルで長いロールアウトを安定化 |
| Genie 2: A large-scale foundation world model (Google DeepMind) | blog | 2024 | [deepmind.google](https://deepmind.google/discover/blog/genie-2-a-large-scale-foundation-world-model/) | 画像でプロンプトし、行動で制御できる 3D 世界 |
| Diffusion Models Are Real-Time Game Engines (GameNGen, Valevski et al.) | ICLR | 2025 | [arXiv:2408.14837](https://arxiv.org/abs/2408.14837) | リアルタイムの DOOM、コンテキストのノイズ拡張 |
| Cosmos World Foundation Model Platform for Physical AI (NVIDIA) | arXiv | 2025 | [arXiv:2501.03575](https://arxiv.org/abs/2501.03575) | オープンな世界基盤モデルとトークナイザ |
| Genie 3: A new frontier for world models (Google DeepMind) | blog | 2025 | [deepmind.google](https://deepmind.google/discover/blog/genie-3-a-new-frontier-for-world-models/) | リアルタイム、テキストプロンプト、プロンプト可能なワールドイベント |
| How Far is Video Generation from World Model: A Physical Law Perspective (Kang et al.) | ICML | 2025 | [arXiv:2411.02385](https://arxiv.org/abs/2411.02385) | 動画モデルは物理法則ではなく事例ごとに汎化する |
| GAIA-2: A Controllable Multi-View Generative World Model for Autonomous Driving (Russell et al.) | プレプリント | 2025 | [arXiv:2503.20523](https://arxiv.org/abs/2503.20523) | 豊富な制御を備えた複数カメラの運転世界モデル |
| WorldMem: Long-term Consistent World Simulation with Memory (Xiao et al.) | プレプリント | 2025 | [arXiv:2504.12369](https://arxiv.org/abs/2504.12369) | 姿勢付きの過去フレームの記憶バンク |
| Context as Memory (Yu et al.) | SIGGRAPH Asia | 2025 | [arXiv:2506.03141](https://arxiv.org/abs/2506.03141) | カメラ視錐台の重なりでコンテキストフレームを検索 |
| VMem: Consistent Interactive Video Scene Generation with Surfel-Indexed View Memory (Li et al.) | ICCV | 2025 | [arXiv:2506.18903](https://arxiv.org/abs/2506.18903) | 幾何で索引付けした視点記憶 |
| Long-Context State-Space Video World Models (Po et al.) | プレプリント | 2025 | [arXiv:2505.20171](https://arxiv.org/abs/2505.20171) | SSM の記憶と局所アテンション |
| Hunyuan-GameCraft (Li et al.) | プレプリント | 2025 | [arXiv:2506.17201](https://arxiv.org/abs/2506.17201) | 行動をカメラ空間に統一、混合履歴条件 |
| Matrix-Game 2.0 (He et al.) | プレプリント | 2025 | [arXiv:2508.13009](https://arxiv.org/abs/2508.13009) | オープンなリアルタイム・ストリーミング世界モデル |
| Yan: Foundational Interactive Video Generation (Ye et al.) | プレプリント | 2025 | [arXiv:2508.08601](https://arxiv.org/abs/2508.08601) | シミュレーション・生成・編集を一つの枠組みに |
| Mixture of Contexts for Long Video Generation (Cai et al.) | プレプリント | 2025 | [arXiv:2508.21058](https://arxiv.org/abs/2508.21058) | 長い履歴に対する学習されたスパースな振り分け |
| LongLive: Real-time Interactive Long Video Generation (Yang et al.) | プレプリント | 2025 | [arXiv:2509.22622](https://arxiv.org/abs/2509.22622) | 分単位・プロンプト切替可能なリアルタイム自己回帰動画 |
| World Simulation with Video Foundation Models for Physical AI (NVIDIA, Cosmos-Predict2.5) | プレプリント | 2025 | [arXiv:2511.00062](https://arxiv.org/abs/2511.00062) | 第 2 世代の Cosmos 世界シミュレータ |
| Emu3.5: Native Multimodal Models are World Learners (Cui et al.) | プレプリント | 2025 | [arXiv:2510.26583](https://arxiv.org/abs/2510.26583) | 世界の学習者としての次トークン・マルチモーダルモデル |
| RTFM: A Real-Time Frame Model (World Labs) | blog | 2025 | [worldlabs.ai](https://worldlabs.ai/blog/rtfm) | 姿勢付きフレームを空間記憶に、明示的 3D なし |
| Introducing Runway GWM-1 (Runway) | blog | 2025 | [runway.com](https://runway.com/research/introducing-runway-gwm-1) | Gen-4.5 に基づく汎用世界モデル群 |
| WorldPlay (Sun et al.) | プレプリント | 2025 | [arXiv:2512.14614](https://arxiv.org/abs/2512.14614) | 再構成コンテキスト記憶によるリアルタイム 720p |
| Project Genie (Google) | blog | 2026 | [blog.google](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/) | 一般公開プロトタイプとしての Genie 3 |
| The Waymo World Model (Waymo) | blog | 2026 | [waymo.com](https://waymo.com/blog/2026/02/the-waymo-world-model-a-new-frontier-for-autonomous-driving-simulation) | Genie 3 を事後学習したカメラ + LiDAR 運転シミュレータ |
| Matrix-Game 3.0 (Wang et al.) | プレプリント | 2026 | [arXiv:2604.08995](https://arxiv.org/abs/2604.08995) | 長期記憶を備えた 720p リアルタイムモデル |
| NVIDIA Launches Cosmos 3 (NVIDIA) | プレスリリース | 2026 | [nvidia.com](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Launches-Cosmos-3-the-Open-Frontier-Foundation-Model-for-Physical-AI/default.aspx) | オープンなオムニモデル：推論 + 生成 + 行動 |
| Echo-Memory: A Controlled Study of Memory in Action World Models (King et al.) | プレプリント | 2026 | [arXiv:2606.09803](https://arxiv.org/abs/2606.09803) | 記憶機構の公平な比較 |
| AlayaWorld (AlayaWorld Team) | プレプリント | 2026 | [arXiv:2607.18367](https://arxiv.org/abs/2607.18367) | 15B の長期インタラクティブモデル |
| GAIA-4 (Wayve) | blog | 2026 | [wayve.ai](https://wayve.ai/thinking/gaia-4/) | 閉ループのカメラ + レーダー運転シミュレーション |
| ReWorld: An Interactive World Model with Long-Horizon Memory (Chen et al.) | プレプリント | 2026 | [arXiv:2608.23565](https://arxiv.org/abs/2608.23565) | 有界キャッシュと姿勢索引付きランドマーク |
| Genie 4: A new generation of world simulation (Google DeepMind) | blog | 2026 | [deepmind.google](https://deepmind.google/blog/genie-4-a-new-generation-of-world-simulation/) | ネイティブ音声、言語による操作（リサーチプレビュー） |

## 学習リソース

- 上記の Sora レポートと Genie 2 / Genie 3 の発表は短いので全文を読む価値があります。できれば、それぞれの制約に関する節と並べて読むとよいでしょう。
- NVIDIA Cosmos のコードとモデル：[github.com/NVIDIA/Cosmos](https://github.com/NVIDIA/Cosmos)。
- DIAMOND のコードには、コンシューマ向け GPU 1 枚で動く、プレイ可能な Atari と CS:GO の世界モデルが含まれています：[github.com/eloialonso/diamond](https://github.com/eloialonso/diamond)。
- Diffusion Forcing のコード：[github.com/buoyancy99/diffusion-forcing](https://github.com/buoyancy99/diffusion-forcing)。
- 生成モデルの背景については、Lilian Weng の ["What are Diffusion Models?"](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/) と Stanford の [CS236](https://deepgenerativemodels.github.io/) を参照してください。

## 演習

1. おもちゃの LAM を実行してください。次に、行動とは無関係にランダムに動く 2 つ目の点を追加します。コードの純度はどう変わるでしょうか。純度を回復させる修正を提案してください（ヒント：デコーダに妨害物の情報を与える）。
2. LAM のデコーダを多ステップの世界モデルに変え、30 ステップのロールアウトを行ってください。点はくっきりしたままでしょうか。GameNGen 風のコンテキストのノイズ拡張（学習時に入力フレームにノイズを加え、ノイズレベルを渡す）を実装して比較してください。
3. GameNGen と、Sora 型のクリップ全体を扱う拡散で用いられる分解 $p(x_{1:T} \mid a_{1:T})$ を書き下してください。どちらがインタラクティブに使えるでしょうか。また、それぞれ何のために再学習が必要になるでしょうか。
4. Genie 3 の発表から主張を 1 つ選び、それを定量的に検証する実験（データ、指標、ベースライン）を設計してください。
5. （2025〜2026 年の更新）記憶の図の数値を使って、完全なコンテキストのモデルの 120 秒後の KV キャッシュの大きさを計算してください。各潜在フレームが 1,560 トークン、モデルが 30 層で、各層が幅 1,536 のキーとバリューを 16 ビット浮動小数点で保存するとします。$W + K = 46$ フレームの設計と比べてください。

<details markdown="1"><summary>ヒント</summary>

1 フレームあたり $1560 \times 30 \times 2 \times 1536 \times 2$ バイト $\approx 0.29$ GB です。完全なコンテキスト（720 フレーム）では約 207 GB となり、GPU 1 枚には収まりません。有界の設計（46 フレーム）なら約 13 GB です。更新で扱ったリアルタイムモデルがすべてコンテキストを有界にしているのはこのためです。

</details>

**次回：**[第 4 回]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})では、ピクセル空間のシミュレータに代わるアプローチ、すなわち明示的な 3D・4D 世界の生成を、スコア蒸留（score distillation）からガウシアンシーン生成器、World Labs の Marble まで見ていきます。
