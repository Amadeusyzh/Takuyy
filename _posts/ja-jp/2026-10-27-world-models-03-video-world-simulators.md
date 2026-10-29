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

### 5.3 NVIDIA Cosmos

**Cosmos**（NVIDIA, "Cosmos World Foundation Model Platform for Physical AI", [arXiv:2501.03575](https://arxiv.org/abs/2501.03575), 2025）は、世界モデルをフィジカル AI のための**基盤モデル**（foundation models）として位置付けています。このプラットフォームには、動画キュレーションのパイプライン、連続および離散の **Cosmos トークナイザ**、拡散型と自己回帰型の両方の事前学習済み**世界基盤モデル**（world foundation models）、ガードレール、そして汎用モデルをカメラ制御、ロボットマニピュレーション、自動運転に特化させるポストトレーニングの例が含まれています。モデルは NVIDIA Open Model License のもとで公開されています（[github.com/NVIDIA/Cosmos](https://github.com/NVIDIA/Cosmos)）。想定されているワークフローは「幅広い動画で一度事前学習し、自分のロボットや車でポストトレーニングする」というもので、LLM の適応方法とよく似ています。大規模なオープンの動画世界モデルで実験したいなら、Cosmos はよい出発点です。

## 6. 自己回帰的な動画ロールアウトを安定させる

インタラクティブなモデルはすべてフレームごと（あるいはチャンクごと）に生成し、自身の出力を条件とするため、第 1 回で扱った誤差蓄積の問題に深刻な形で直面します。繰り返し目にすることになる手法は次のとおりです。

- **コンテキストのノイズ拡張**（context noise augmentation）（GameNGen、Genie 2 系のモデル）：劣化させたコンテキストで学習し、劣化の度合いをモデルに伝えます。
- **Diffusion Forcing**（Chen et al., NeurIPS 2024, [arXiv:2407.01392](https://arxiv.org/abs/2407.01392)）：学習時に系列中の各フレームに**独立したノイズレベル**を与えます。このように学習した因果モデルは、過去のフレームがクリーンまたはわずかにノイズを含む状態で次のフレームをデノイズでき、未来の不確実性を保ちつつ長いロールアウトを安定させます。さらに、プランニングのために未来の軌道全体に対するガイダンスも可能にします。
- **KV キャッシュ付きの因果アテンション**（causal attention with KV caching）により新しいフレームごとの計算量を一定にし、**ステップ蒸留**（step distillation）（少ステップまたは 1 ステップのサンプラ）でリアルタイムの速度を実現します。
- **記憶機構**（memory mechanisms）：より長いコンテキストウィンドウ、過去フレームの圧縮された記憶、カメラ姿勢によるフレームの検索、あるいはシーンの明示的な 3D 表現。最後の選択肢は、そのまま[第 4 回]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})につながります。

図のように、これらの方式の違いは、学習系列の各フレームにどのノイズレベルを与えるかだけです。

{% include blog_figure.liquid path="assets/img/blog/world-models/03-diffusion-forcing.svg" localized="true" width="85%" caption="フレームごとのノイズレベル（白 = きれい、濃い色 = 純粋なノイズ、灰色 = 入力に含まれない）。系列全体の拡散はクリップ全体に 1 つのレベルを使い、次フレーム予測は過去をきれいなまま予測対象のフレームだけにノイズを加え、Diffusion Forcing はフレームごとに独立にレベルをサンプリングします。これによりサンプリング時に因果的な「ピラミッド」スケジュール（右下）が使え、各フレームは前のフレームより少し遅れてデノイズされるので、近い未来ほどはっきりします。" %}

## 7. まだ足りないもの

- **長期的な一貫性と記憶。** 2 回振り返ると部屋が変わってしまいます。ピクセル空間のモデルには、コンテキストウィンドウ以外に永続的な状態がありません。数分単位の一貫性は最先端の主張であり、数時間単位は未解決です。
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

**次回：**[第 4 回]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})では、ピクセル空間のシミュレータに代わるアプローチ、すなわち明示的な 3D・4D 世界の生成を、スコア蒸留（score distillation）からガウシアンシーン生成器、World Labs の Marble まで見ていきます。
