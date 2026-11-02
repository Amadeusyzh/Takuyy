---
layout: post
title: "ゲームエンジンの解剖：ループ、データ、ECS、ジョブ、ツール"
date: 2026-10-27 13:01:00+0900
description: "ゲームエンジンは何でできているか：レイヤー構造、ゲームループと固定タイムステップ、フレーム予算、データ指向設計、ECS、シーングラフと空間構造、ジョブシステム、アセットパイプラインを、実行できるコードと実測した図で解説します。"
categories: graphics-engine
tags: [game-engine, game-loop, fixed-timestep, data-oriented-design, ecs, job-system, scene-graph]
series: graphics-engine
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[グラフィックスシリーズ]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})では、1 枚の画像がどう作られるか（ラスタライズ、シェーディング、パストレーシング）を説明しました。ゲームやシミュレータは毎秒 60 枚以上の画像を作りながら、物理のシミュレーション、アニメーションと音の再生、入力の読み取り、ディスクからのアセットのストリーミングをこなし、しかもユーザーへの応答性を保たなければなりません。これらすべてをまとめるソフトウェアが**エンジン**（engine）です。エンジンは仮想世界の**シミュレータ**（simulator）でもあります。そのためこのシリーズは、グラフィックスやニューラルレンダリングから[世界モデル]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})や[身体性 AI]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})への橋渡しになります。ロボットはエンジンの中で訓練され、ニューラルネットワークはエンジンの部品を置き換え始めています。

### このシリーズの対象と道のり

このシリーズは、グラフィックスシリーズのレンダリングの基礎を知っている（あるいは必要に応じて調べる）読者が、リアルタイムシステムがどう設計・構築されるかを理解し、AI とエンジンが出会うところまで進むためのものです。ある程度のプログラミング経験が必要です。エンジンのコードを読むには C++ が役立ちますが、本記事の例はすべて Python か JavaScript です。

| 記事 | テーマ |
| --- | --- |
| 01（本記事） | エンジンの解剖：レイヤー、ゲームループ、データ指向設計、ECS、シーングラフ、ジョブ、アセット |
| [02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}) | 現代の GPU API（Vulkan、D3D12、Metal、WebGPU）、同期、レンダーグラフ、GPU 駆動レンダリング |
| [03]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }}) | WebGPU でミニエンジンを作る：ループ、リソース、glTF、カメラ、PBR、影、ECS、プロファイリング |
| [04]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}) | 商用エンジンの内部：Unreal Engine 5、Unity 6、Godot 4、Bevy |
| [05]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }}) | 物理・シミュレーションエンジン、ロボットシミュレータとしてのエンジン、OpenUSD と合成データ |
| [06]({{ '/blog/2026/graphics-engine-06-ai-meets-graphics-engines/' | relative_url }}) | AI とエンジン：エンジン内のニューラルレンダリングとガウシアンスプラット、生成アセット、ニューラルゲームエンジン |

## 前提知識

- Python と NumPy。簡単な C 風のコードが読めること。
- ベクトルと行列。$3\times 3$ の同次座標による 2D 変換を含みます（[グラフィックス 01]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})）。
- $\ddot{x} = a(x)$ の数値積分法の考え方（[グラフィックス 07]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}) の 2 節）。本記事でも半陰的（シンプレクティック）オイラー法を使います。

## 1. エンジンとは何か

エンジンは三つの部分からなります。

1. **ランタイム**（runtime）：ゲームと一緒に出荷され、毎フレーム動くコード（描画、物理、アニメーション、オーディオ、入力、ネットワーク、ゲームプレイ）。
2. **ツール**（tools）：コンテンツ制作者が毎日使うエディタ、インポータ、プロファイラ、デバッガ、レベルデザイン用 UI。
3. **パイプライン**（pipeline）：元のアセット（FBX や glTF のメッシュ、PSD のテクスチャ、WAV の音声）を、プラットフォームごとのコンパクトなランタイム形式にオフラインで変換する仕組み。

初心者は一つ目だけを思い浮かべがちです。しかし商用エンジンではツールとパイプラインがコードの少なくとも半分を占め、チームの作業速度を左右します（8 節）。

ランタイムは**レイヤー**（layer）で構成されます（図 1）。各レイヤーは自分より下のレイヤーしか呼び出せません。**プラットフォーム層**（platform layer）は OS、ファイルシステム、スレッド、GPU API を隠蔽します。**コア層**（core）は数学、メモリアロケータ、コンテナ、ログ、ジョブシステムを提供します。**リソース層**（resource layer）は各アセットの場所を把握し、ロードし、ストリーミングで出し入れします。その上に大きなサブシステム（描画、物理、アニメーション、オーディオ、入力とネットワーク）があり、さらに上に**ゲームプレイ層**（gameplay layer：エンティティ、スクリプト、AI、UI）、最上部にゲームそのものがあります。Gregory の『Game Engine Architecture』はまさにこのレイヤー順に構成されており、この分野の標準的な参考書です。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-layers.svg" localized="true" caption="典型的なエンジンのレイヤー構造のランタイム（左）と、それをオフラインで扱うエディタとツール（右）。依存は下向きだけです。描画はコア層とリソース層を使えますが、コア層が描画を呼ぶことはありません。この規則のおかげで、エンジンの移植はプラットフォーム層の書き換えだけで済みます。" %}

この「下向きにしか依存しない」規則は机上の話ではありません。この規則があるからこそ、プラットフォーム層だけを書き直して新しいゲーム機に対応したり、レンダラを外してサーバー上でヘッドレスに動かしたり、物理ライブラリを差し替えたりできます。[身体性 AI 03]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }}) のロボットシミュレータにも同じ規則があります。そこでは「ゲーム」層が学習スクリプトで、描画は完全にオフにできます。

## 2. ゲームループ

どのエンジンも中心にループを持っています。

```python
while running:
    process_input()
    update(dt)        # simulate the world forward by dt seconds
    render()          # draw the current state
```

面白いのは、`dt` をいくつにすべきかという問題です。

### 可変タイムステップ

最も単純なのは、直前のフレームにかかった時間を測ってそれを `dt` にする方法です。どんなマシンにも適応しますが、シミュレーション結果がフレームレートに依存してしまいます。初速 $v_0 = 5$ m/s、重力 $g = 9.81$ m/s$^2$ のジャンプを半陰的オイラー法で積分してみます。

$$
v_{n+1} = v_n - g\,\Delta t, \qquad y_{n+1} = y_n + v_{n+1}\,\Delta t .
$$

厳密な最高点の高さは $v_0^2 / (2g) = 1.274$ m です。離散解の最高点はおよそ $v_0 \Delta t / 2$ だけ低くなります。最初の位置更新の時点で、すでに減った速度を使うからです。30 fps（$\Delta t = 33$ ms）では約 8 cm、144 fps では約 2 cm 低くなります。速いマシンのプレイヤーほど高く跳べるわけです。これはレベルデザインの問題であり、すべてのマシンが同じ結果を出さなければならないネットワークゲームでは致命的です。図 3（左）に三つの軌道を示します。

もう一つの問題があります。バネや接触のような硬い力は、ステップが十分小さいときだけ安定です（[グラフィックス 07]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}) でシンプレクティックオイラー法の限界 $\omega\Delta t \le 2$ を導きました）。OS のページングやレベルのロードなどで 1 フレームが長くなると、この限界を超えてシミュレーションが発散することがあります。限界内でも長いステップは大きな誤差を生みます。図 3（右）のバネのエネルギーは本来厳密に一定のはずですが、$\Delta t$ を揺らぐフレーム時間にすると大きく振れ、長いフレームのたびに跳ねます。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-timestep.svg" caption="左：同じジャンプを dt = フレーム時間として 30、60、144 fps で積分した結果。凡例はそれぞれの最高点の高さで、フレームレートが低いほど低く跳びます。右：フレーム時間が揺らぐときの摩擦のないバネ（1.5 Hz）。可変ステップ（赤）のエネルギー比は大きく振れ、長いフレームで跳ねます。アキュムレータ付きの固定 120 Hz ステップ（青）は 1 付近の狭い帯に収まります。" %}

### アキュムレータ付き固定タイムステップ

標準的な解決策は Glenn Fiedler の記事「Fix Your Timestep!」（2004）で広まったもので、**シミュレーション時間をフレーム時間から切り離す**ことです。物理は常に固定サイズ $\Delta t$（例えば 1/60 や 1/120 s）のステップで進みます。各フレームで実際に経過した時間を**アキュムレータ**（accumulator）に足し、入るだけの固定ステップを実行します。

$$
A \leftarrow A + t_\text{frame}, \qquad
n = \left\lfloor A / \Delta t \right\rfloor, \qquad
A \leftarrow A - n\,\Delta t .
$$

残り $A \in [0, \Delta t)$ は、現実には経過したもののシミュレーションではまだ進めていない時間です。図 4 はフレーム時間が揺らぐ実行例です。1 ステップも進まないフレームもあれば、3 ステップ進むフレームもあります。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-accumulator.svg" caption="物理ステップ 120 Hz（上段の破線）での、揺らぐ 30 フレームにわたるアキュムレータ。上：フレーム時間。中：そのフレームで実行した固定ステップ数（DT より短いフレームではしばしば 0、長いフレームでは 2 や 3）。下：補間に使う残りの割合 alpha = A/DT。" %}

最新の物理状態をそのまま描画すると、新しい不具合が出ます。物理が 50 Hz、ディスプレイが 60 Hz だとしましょう。6 表示フレームは 0.1 s で、その間にちょうど 5 物理ステップが起こるので、6 フレームに 1 回はまったく動きません。これが目に見える**ジャダー**（judder、図 5 の赤）です。対策は、直近二つの物理状態を次の重みで混ぜて描画することです。

$$
\alpha = A / \Delta t, \qquad x_\text{shown} = (1-\alpha)\,x_\text{prev} + \alpha\, x_\text{curr} .
$$

これは 1 ステップ前の状態を、ちょうど正しいサブステップの位相で表示することになるので、動きは滑らかになります（青）。代償は最大 1 物理ステップ分の遅延の増加です。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-interpolation.svg" caption="物理 50 Hz、表示 60 Hz、1 m/s で動く物体。左：画面上の位置。補間なし（赤）では、階段に 6 フレームごとの平らな段ができます。右：フレームあたりの変位。補間なしでは 20 mm と 0 mm が交互に現れ、補間あり（青）では最初のフレーム以降は一定の 16.7 mm（破線）です。" %}

以下は、固定ステップ、アキュムレータ、補間、そしてフレーム時間のクランプをすべて備えた実行可能なループです。クランプは**死のスパイラル**（spiral of death：遅いフレームが多くのステップを要求し、そのステップが次のフレームをさらに遅くする）を防ぎます。

```python
import random
import time

DT = 1 / 120               # fixed physics step (s)
MAX_FRAME = 0.25           # clamp: never simulate more than 0.25 s per frame
K = 40.0                   # spring stiffness (mass 1)

def physics_step(s, dt):   # semi-implicit Euler on x'' = -K x
    v = s["v"] - K * s["x"] * dt
    return {"x": s["x"] + v * dt, "v": v}

def render(x):             # stand-in for drawing
    pass

prev = curr = {"x": 1.0, "v": 0.0}
acc = 0.0
t_last = time.perf_counter()
t_end = t_last + 2.0
while (now := time.perf_counter()) < t_end:
    frame = min(now - t_last, MAX_FRAME)
    t_last = now
    acc += frame
    while acc >= DT:
        prev, curr = curr, physics_step(curr, DT)
        acc -= DT
    alpha = acc / DT
    render((1 - alpha) * prev["x"] + alpha * curr["x"])
    time.sleep(random.uniform(0.004, 0.030))   # pretend the frame took a while

E = 0.5 * curr["v"] ** 2 + 0.5 * K * curr["x"] ** 2
print(f"energy after 2 s: {E:.3f} (start 20.000)")
```

スリープの長さがどう変わっても、表示されるエネルギーは 20 に近いままです。物理は常に $\Delta t = 1/120$ s しか見ないからです。図 5 のジャダーの実験は、整数の時間単位で正確に再現できます（1 単位 = 1/300 s なので、60 Hz の 1 フレームは 5 単位、50 Hz の 1 ステップは 6 単位です）。

```python
FRAME, STEP = 5, 6                    # units of 1/300 s
acc, x_prev, x = 0, 0.0, 0.0
steps, raw, lerp = [], [], []
last_raw = last_lerp = 0.0
for frame in range(12):
    acc += FRAME
    n = 0
    while acc >= STEP:
        x_prev, x = x, x + STEP / 300  # constant speed 1 m/s
        acc -= STEP
        n += 1
    shown = x_prev + (acc / STEP) * (x - x_prev)
    steps.append(n)
    raw.append(round(x - last_raw, 4))
    lerp.append(round(shown - last_lerp, 4))
    last_raw, last_lerp = x, shown
print("steps per frame :", steps)
print("raw  dx (m)     :", raw)
print("lerp dx (m)     :", lerp)
```

```text
steps per frame : [0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1]
raw  dx (m)     : [0.0, 0.02, 0.02, 0.02, 0.02, 0.02, 0.0, 0.02, 0.02, 0.02, 0.02, 0.02]
lerp dx (m)     : [0.0, 0.0133, 0.0167, 0.0167, 0.0167, 0.0167, 0.0167, 0.0167, 0.0167, 0.0167, 0.0167, 0.0167]
```

なぜ特に物理が固定ステップを必要とするのでしょうか。理由は三つあります。**安定性**（ステップが常に硬さの限界より小さい）、**決定性**（同じ入力からビット単位で同じ結果が出る。ロックステップ方式のマルチプレイ、リプレイ、自動テストがこれに依存します）、そして**調整のしやすさ**（グラフィックス 07 の XPBD のような拘束ソルバでは、硬さがステップに依存します）。そのため多くのエンジンはループを分けています。Unity は物理用の `FixedUpdate` とフレームごとの処理用の `Update` を持ち、Unreal の Chaos 物理は固定ステップモードで動かせます。ロボットシミュレータは常に固定ステップです。500 Hz で学習した制御器には 500 Hz を見せなければならないからです。

### 試してみよう

このウィジェットは、摩擦のないバネで三つの方式を並べて動かします。揺らぎを大きくしてヒッチのボタンを押すと、可変ステップのボール（赤）は長いフレームのたびにエネルギーが跳ねます。物理レートを 20 Hz まで下げると、オレンジのボール（固定ステップ、最新状態を描画）は目に見えて飛び飛びに動き、青のボール（固定ステップ、補間）は滑らかなまま、破線の厳密解にわずかな遅れで追従します。

{% include widget.liquid name="graphics-engine-fixed-timestep" height="440" caption="スライダー：フレーム時間の揺らぎ（16.7 ms を中心に 0-40 ms）と物理レート（10-240 Hz）。ボタンで 200 ms のフレームを 1 回挿入します。どのボールでも横にドラッグすると、新しい振幅で再スタートします。下のグラフは、直近 10 s の可変ステップ（赤）と固定ステップ（青）のエネルギー比 E/E0 で、本来は 1 のままのはずです。" %}

### フレームペーシング、V-sync、入力遅延

ディスプレイは一定の **vsync** 間隔で更新されます。V-sync がオンなら、完成したフレームは次の vsync まで待ってから表示され、1 回逃すと丸々 1 間隔遅れます。そのため 60 Hz のディスプレイで 15 ms と 18 ms のフレームが交互に来るゲームでは、16.7 ms 表示されるフレームと 33.3 ms 表示されるフレームが混ざります。この**不均一なペーシング**（frame pacing）は、安定した 30 fps よりも悪く見えます。V-sync をオフにすれば待ちはなくなりますが、画面の上半分が一つのフレーム、下半分が次のフレームになる**ティアリング**（tearing）が起こります。可変リフレッシュレートのディスプレイ（G-Sync、FreeSync）は、逆にディスプレイの側がフレームを待ちます。

**入力遅延**（input latency）は、ボタンを押してからその効果を示す最初の光子が出るまでの時間です。これはパイプライン全体で積み上がります。入力は CPU フレームの最初にサンプリングされ、そのフレームがシミュレートされ、GPU 用に記録され、描画され、最後にスキャンアウトされます。図 2 は典型的なパイプライン化されたエンジンで、遅延は 3 vsync 間隔、60 Hz で 50 ms です。エンジンは、入力をできるだけ遅くサンプリングする、先行してキューに積めるフレーム数を制限する、そしてベンダーの低遅延モード（NVIDIA Reflex など）で CPU のペースを調整して GPU キューを短く保つ、といった方法で遅延を減らします。

## 3. フレーム予算：CPU と GPU の並列動作

60 Hz では各フレームを $1000/60 = 16.7$ ms 以内に、90 Hz（典型的な VR）では 11.1 ms 以内に、120 Hz では 8.3 ms 以内に終える必要があります。これが**フレーム予算**（frame budget）で、各サブシステムはその一部を割り当てられます（例えばアニメーション 2 ms、物理 3 ms、描画コマンドの発行 4 ms）。

ただし CPU と GPU は交代で動くわけではなく、**別々のフレームを並列に**処理します（図 2）。GPU がフレーム $N$ を描画している間に、CPU のレンダースレッドはフレーム $N+1$ のコマンドを記録し、メインスレッドはフレーム $N+2$ をシミュレートします。スループットは各段の合計ではなく最も遅い段で決まります。プロファイリングで最初に「CPU ボトルネックか、GPU ボトルネックか」を問うのはこのためです。一方、遅延は各段の合計です。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-frame-timeline.svg" caption="パイプライン化されたフレーム。箱の中の数字はフレーム番号です。フレーム 0 はメインスレッドでシミュレートされ（10 ms）、次の間隔でレンダースレッドが記録し（6 ms）、GPU が描画し（12 ms）、その次の vsync（破線）で表示されます。どの段も 16.7 ms に収まるので 60 fps が出ますが、各フレームは入力から光子まで 3 間隔（50 ms）かかります。" %}

CPU が GPU より先に進めるようにするには、フレームごとのデータ（ユニフォームバッファ、コマンドバッファ）を、同時に処理中（in flight）になりうるフレームの数だけ用意する必要があります。さらにフェンス（fence）で、GPU がまだ読んでいるコピーを CPU が上書きしないようにします。これは[第 02 回]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})のテーマです。

## 4. データ指向設計

### なぜメモリレイアウトが支配的なのか

現代の CPU コアは 1 ナノ秒に何回も浮動小数点演算ができますが、メインメモリからのロードには 100 ns のオーダーの時間がかかります。この差を埋めるのがキャッシュです。キャッシュは 64 バイトの**キャッシュライン**（cache line）単位でデータを運び、ハードウェアプリフェッチャは線形なアクセスパターンを検出して次のラインを先に取ってきます。Drepper の「What Every Programmer Should Know About Memory」（2007）が詳しく述べているように、その結果、実行する命令の数よりも*データをメモリにどう並べるか*のほうが重要になることがよくあります。**データ指向設計**（data-oriented design、DOD）は、ゲーム業界では Mike Acton の CppCon 2014 の基調講演で広く知られるようになりました。オブジェクトからではなく、データとそのアクセスパターンから設計を始める考え方です。

### AoS と SoA

各エンティティが 16 個の float フィールド（位置、速度、体力、質量、色、UV、フラグ）を持つとします。合計 64 バイトで、ちょうど 1 キャッシュラインです。移動システムが読むのは位置と速度だけ、つまりエンティティあたり 24 バイトです。

- **構造体の配列**（array of structures、AoS）：`Entity entities[N]`。反復するとどのラインも丸ごとロードされ、64 バイト中 40 バイトが無駄になります。
- **配列の構造体**（structure of arrays、SoA）：`float px[N], py[N], ..., vz[N]`。移動システムは密な 6 本の配列をストリーミングで読むので、ロードしたバイトはすべて使われ、ループはそのまま SIMD レーンに対応します。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-cache-lines.svg" caption="同じエンティティの二つのレイアウト。長方形一つが 4 バイトの float、1 行が 64 バイトのキャッシュライン 1 本です。上（AoS）：各ラインに 1 エンティティが入り、移動システムが使うのは色の付いた 6 フィールド、つまりロードしたバイトの 37.5 % だけです。下（SoA）：各ラインに 16 エンティティの同じフィールドが入り、ロードしたバイトはすべて使われます。" %}

NumPy のマイクロベンチマークで、これを測定できます。NumPy の構造化配列は AoS レイアウト（エンティティごとに 64 バイトのレコード 1 個）で、`aos["px"]` はそれに対するストライド付きのビューです。別々の配列は SoA です。

```python
import timeit
import numpy as np

FIELDS = ["px", "py", "pz", "vx", "vy", "vz", "hp", "mass",
          "r", "g", "b", "a", "u", "v", "w", "flags"]
N = 1_000_000
aos = np.zeros(N, dtype=[(f, np.float32) for f in FIELDS])   # 64 B per entity
soa = {f: np.zeros(N, np.float32) for f in FIELDS}            # one array per field
dt = np.float32(1 / 60)

def update_aos():
    for c in "xyz":
        aos["p" + c] += aos["v" + c] * dt

def update_soa():
    for c in "xyz":
        soa["p" + c] += soa["v" + c] * dt

for f in (update_aos, update_soa):
    t = min(timeit.repeat(f, number=10, repeat=5)) / 10
    print(f"{f.__name__}: {t * 1e3:.2f} ms ({t / N * 1e9:.2f} ns per entity)")
```

図 7 は、図のスクリプトを実行したときに四つの配列サイズで測った時間で、各ペアの上に高速化率を記しています。数値はマシンによって変わります。差が生じるのは、AoS 配列をストライドで 1 回なめるたびに、各レコードの 64 バイトすべてがキャッシュを通過するからです。小さな配列はキャッシュに収まるのでペナルティは最小ですが、100 万エンティティでは AoS 配列は 64 MB になり、メインメモリからストリーミングするしかありません。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-aos-soa-bench.svg" caption="更新 p += v dt（x、y、z）のエンティティあたりの時間。AoS レイアウト（赤）と SoA レイアウト（青）を、図を生成したマシンで timeit を使って測りました。太字のラベルは SoA の高速化率です。正確な値は CPU とメモリに依存しますが、SoA レイアウトがエンティティあたりに触れるのは 64 バイトではなく 24 バイトです。" %}

DOD は SoA だけではありません。ほかにも、仮想関数を 1 回ずつ呼ぶのではなくまとめてバッチ処理する、ホットなデータとコールドなデータを分ける、ポインタを配列のインデックスで置き換える、データをソートやグループ化して一つのループが分岐なしに一種類のものだけを扱うようにする、といった習慣があります。これらの習慣を標準にするアーキテクチャが、エンティティ・コンポーネント・システムです。

## 5. エンティティ・コンポーネント・システム（ECS）

従来のエンジンは、継承（`GameObject -> Actor -> Pawn -> Character`）や、ゲームオブジェクトに付けるコンポーネントオブジェクト（Unity の初期の `MonoBehaviour`）でオブジェクトをモデル化していました。どちらもデータをヒープ上に散らばらせます。**ECS**（Entity Component System）は世界を三つの概念に分けます。

- **エンティティ**（entity）：ただの ID です（整数で、古いハンドルを検出するための世代カウンタが付くことが多い）。
- **コンポーネント**（component）：振る舞いを持たない純粋なデータです。例：`Position`、`Velocity`、`Health`。
- **システム**（system）：あるコンポーネントの組を持つすべてのエンティティに対して実行される関数です。例：`(Position, Velocity)` に対する `movement`。

**クエリ**（query）は、システムが読み書きするコンポーネントを宣言します。ストレージはクエリを速くしなければならず、主な設計は二つあります（図 8）。

**アーキタイプテーブル**（archetype table。Unity Entities、Bevy のデフォルトの table ストレージ、flecs）。コンポーネント型の集合がまったく同じエンティティは一つの**アーキタイプ**（archetype）を作ります。各アーキタイプはコンポーネントごとに 1 列を持つ SoA レイアウトのテーブルです。クエリは一致するテーブルだけを訪れて列をストリーミングで読むので、反復には理想的です。Unity Entities はアーキタイプを 16 KiB のチャンクに格納し、1 チャンクには最大 128 エンティティが入ります。代償は構造の変更です。コンポーネントを追加・削除すると、そのエンティティの行が別のテーブルへ移動します。

**スパースセット**（sparse set。EnTT と、Bevy のオプションの `SparseSet` ストレージ）。コンポーネント型ごとにプールを持ちます。プールは、詰めて並べたコンポーネントの密な配列（dense）と、エンティティ ID を dense のインデックスへ対応付ける疎な配列（sparse）からなります。コンポーネントの追加・削除は $O(1)$ で、触るのは一つのプールだけですが、複数のコンポーネントにまたがるクエリでは一つのプールを反復して他のプールを引く必要があり、局所性が下がります。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-ecs-storage.svg" caption="上：三つのアーキタイプテーブル。クエリ (Position, Velocity) は A1 と A2（紫の列）に一致して A3 をスキップするので、移動システムは密な列のペアを二つストリーミングで読みます。下：同じ Velocity のデータをスパースセットで持った場合。エンティティ ID で引く sparse 配列が、詰めて並べた dense 配列を指します（ダッシュはコンポーネントなし）。Velocity の追加・削除はこのプールしか触りません。" %}

以下は約 50 行の最小限のアーキタイプ ECS（Python）です。実際の実装では列を型付きの連続配列に格納し、クエリ結果をキャッシュしますが、構造は同じです。

```python
class Archetype:
    def __init__(self, key):
        self.key = key                          # frozenset of component names
        self.entities = []                      # row -> entity id
        self.columns = {name: [] for name in key}

    def add_row(self, eid, comps):
        self.entities.append(eid)
        for name in self.key:
            self.columns[name].append(comps[name])
        return len(self.entities) - 1

    def remove_row(self, row):
        """Swap-remove: move the last row into the hole. Returns the moved entity (or None)."""
        last = len(self.entities) - 1
        moved = self.entities[last] if row != last else None
        for col in [self.entities, *self.columns.values()]:
            col[row] = col[last]
            col.pop()
        return moved


class World:
    def __init__(self):
        self.archetypes = {}                    # key -> Archetype
        self.where = {}                         # entity id -> (archetype, row)
        self.next_id = 0

    def _arch(self, key):
        if key not in self.archetypes:
            self.archetypes[key] = Archetype(key)
        return self.archetypes[key]

    def spawn(self, **comps):
        eid, self.next_id = self.next_id, self.next_id + 1
        arch = self._arch(frozenset(comps))
        self.where[eid] = (arch, arch.add_row(eid, comps))
        return eid

    def get(self, eid, name):
        arch, row = self.where[eid]
        return arch.columns[name][row]

    def add(self, eid, **new):
        """Structural change: move the entity to the archetype with more components."""
        arch, row = self.where[eid]
        comps = {n: arch.columns[n][row] for n in arch.key} | new
        moved = arch.remove_row(row)
        if moved is not None:
            self.where[moved] = (arch, row)
        target = self._arch(frozenset(comps))
        self.where[eid] = (target, target.add_row(eid, comps))

    def query(self, *names):
        need = set(names)
        return [a for a in self.archetypes.values() if need <= a.key]


def movement(world, dt):                        # a system
    for arch in world.query("pos", "vel"):
        P, V = arch.columns["pos"], arch.columns["vel"]
        for i in range(len(arch.entities)):
            P[i][0] += V[i][0] * dt
            P[i][1] += V[i][1] * dt


world = World()
a = world.spawn(pos=[0.0, 0.0], vel=[1.0, 0.0])
b = world.spawn(pos=[5.0, 5.0], vel=[0.0, -1.0], hp=100)
c = world.spawn(pos=[2.0, 1.0])                 # static: no velocity
movement(world, 0.5)
movement(world, 0.5)
world.add(c, vel=[0.0, 2.0])                    # c changes archetype
movement(world, 0.5)
for e in (a, b, c):
    print(e, world.get(e, "pos"), sorted(world.where[e][0].key))
print(len(world.archetypes), "archetypes")
```

```text
0 [1.5, 0.0] ['pos', 'vel']
1 [5.0, 3.5] ['hp', 'pos', 'vel']
2 [2.0, 2.0] ['pos', 'vel']
3 archetypes
```

エンティティ `c` が `{pos, vel}` テーブルに入ったのは 3 回目のステップからなので、移動量は $2 \times 0.5 = 1$ です。`{pos}` テーブルは空になっても残っています。（辞書の `|` によるマージには Python 3.9 以降が必要です。）

**スケジューリング**（scheduling）。各システムは何を読み書きするかを宣言しているので、エンジンはシステムを自動的に並列実行できます。二つのシステムが衝突するのは、一方が書くコンポーネントを他方が読むか書くときだけです。Bevy はまさにシステムのシグネチャからこの種のスケジュールを組み立てます。構造を変えるシステム（エンティティの生成、コンポーネントの追加）は、操作を**コマンド**（command）として記録し、同期点でまとめて適用するのが普通です。実行中のクエリの下でテーブルが変わらないようにするためです。

良いアーキテクチャは ECS だけではありません。Unreal はアクターとコンポーネントを使い、群衆向けの ECS として Mass フレームワークを持っています。Godot はノードツリーを使います。しかし ECS の背後にあるデータ指向の考え方は、あらゆる現代エンジンのホットループに現れます。Overwatch チームの GDC 2017 の講演は、出荷されたゲームでの ECS の姿を知るのに良い資料で、ECS がネットコードをどう単純にしたかも語られています。

## 6. シーングラフ、トランスフォーム、空間構造

### トランスフォーム階層

多くの物体は親に対して相対的に動きます。腕に対する手、戦車に対する砲塔、車に対するカメラなどです。**トランスフォーム階層**（transform hierarchy）は各ノードにローカル変換 $L$ を持ち、ワールド変換はルートからの経路上の積になります。

$$
M_\text{hand} = L_\text{root}\, L_\text{arm}\, L_\text{hand} .
$$

2D の同次行列を使います。

$$
L = \begin{pmatrix} \cos\theta & -\sin\theta & t_x \\ \sin\theta & \cos\theta & t_y \\ 0 & 0 & 1 \end{pmatrix}
$$

ルートを $(2, 1)$ に $20°$ 回転して置き、腕をローカル $(1.5, 0)$ に $40°$ 回転、手をローカル $(1.2, 0)$ に $-30°$ 回転で置きます。手のワールド原点は

$$
(2,1) + 1.5\,(\cos 20°, \sin 20°) + 1.2\,(\cos 60°, \sin 60°) = (4.010,\ 2.552)
$$

です。手のオフセットを適用する時点で、腕の座標系はすでに $20° + 40° = 60°$ 回転しているからです。ルートを回すと子孫すべてが動きます（図 9）。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-transform-hierarchy.svg" caption="3 ノードの階層。各ノードのローカル x 軸（赤）と y 軸（緑）をワールド位置に描き、計算したワールド座標を添えています。破線で薄い方：ルートを 20° から 30° に回したあとの姿で、腕と手はローカル変換を変えずに付いていきます。" %}

ほとんどの物体が静止しているとき、毎フレームすべてのワールド行列を再計算するのは無駄です。**ダーティフラグ**（dirty flag）がこれを解決します。ローカル変換を変えるとそのノードとサブツリーにダーティの印を付け、ワールド行列は読まれたときにだけ再計算します。

```python
import numpy as np

recomputed = 0

def T2(tx, ty, deg):
    a = np.radians(deg)
    return np.array([[np.cos(a), -np.sin(a), tx], [np.sin(a), np.cos(a), ty], [0.0, 0.0, 1.0]])

class Node:
    def __init__(self, local, parent=None):
        self.local, self.parent, self.children = local, parent, []
        self.dirty, self._world = True, None
        if parent:
            parent.children.append(self)

    def set_local(self, local):
        self.local = local
        stack = [self]
        while stack:                      # mark the whole subtree dirty
            n = stack.pop()
            n.dirty = True
            stack.extend(n.children)

    def world(self):
        global recomputed
        if self.dirty:
            parent_world = self.parent.world() if self.parent else np.eye(3)
            self._world = parent_world @ self.local
            self.dirty = False
            recomputed += 1
        return self._world

root = Node(T2(2.0, 1.0, 20))
arm = Node(T2(1.5, 0.0, 40), root)
hand = Node(T2(1.2, 0.0, -30), arm)
for label, action in [("first read", None), ("second read", None), ("after root moves", 30)]:
    if action is not None:
        root.set_local(T2(2.0, 1.0, action))
    recomputed = 0
    x, y = hand.world()[:2, 2]
    print(f"{label:17s}: hand at ({x:.3f}, {y:.3f}), recomputed {recomputed} matrices")
```

```text
first read       : hand at (4.010, 2.552), recomputed 3 matrices
second read      : hand at (4.010, 2.552), recomputed 0 matrices
after root moves : hand at (3.709, 2.878), recomputed 3 matrices
```

ECS では同じ考え方をデータ指向で実現します。`Parent` と `LocalTransform` のコンポーネントを持たせ、あるシステムがトポロジカル順に `GlobalTransform` を伝播させます（Bevy も Unity Entities もそうしています）。

### カリングとクエリのための空間構造

シーングラフが答えるのは「何が何に付いているか」です。別の問いとして「何が何の近くにあるか」があります。どの物体がカメラの視錐台の中にあるか、どの物体の組が衝突しうるか、このレイは何に当たるか、といった問いです。すべての物体を線形に走査すると、クエリ 1 回が $O(n)$ です。**空間構造**（spatial structure）がこれを減らします。

- **一様グリッド**（uniform grid）は物体をセルにハッシュします。単純で、物体が均一に分布し大きさが似ているときに非常に優秀なので、パーティクルシステムや衝突のブロードフェーズでよく使われます。
- **八分木**（octree、2D では四分木）は空間を適応的に分割し、大きな静的ワールドに向いています。
- **バウンディングボリューム階層**（bounding volume hierarchy、BVH）は物体をバウンディングボックスの木にまとめます（Goldsmith と Salmon、1987）。レイトレーシング（[グラフィックス 05]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})）を支える構造であり、物体が動いたあとにボックスを合わせ直す（refit）のが安いので、カリングや動的なシーンにも向いています。

BVH による視錐台カリング（frustum culling）では、まずルートのボックスを視錐台の平面と比べます。どれか一つの平面の完全に外側にあるボックスは、サブツリーごと棄却されます。そうでなければ子に再帰します。図 10 は実際の 2D での実行結果です。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-bvh-culling.svg" caption="中央値分割の BVH（葉は最大 4 ボックス）による 200 個のボックスの視錐台カリング。青いくさび形：カメラの 2D 視錐台。紫の枠：テストされた BVH ノードで、くさびの外にあるサブツリーは 1 回のテストで丸ごと棄却されます。オレンジのボックスがカリングテストを通過したものです。タイトルにはボックステストの回数を示しています（総当たりなら 200 回）。" %}

## 7. 並行処理：ジョブ、タスクグラフ、ファイバー

ゲーム機やデスクトップの CPU には 8 から 16 以上のハードウェアスレッドがあり、1 フレームには互いに独立した仕事が何百もあります。初期のマルチコア対応エンジンは、サブシステムごとに専用スレッド（物理スレッド、オーディオスレッド）を割り当てていました。しかしスレッドごとの負荷が偏るため、うまくスケールしません。現代のエンジンは**ジョブシステム**（job system）を使います。固定数のワーカースレッド（普通はコアごとに 1 本）のプールがキューから小さなジョブを取り出して実行し、暇なワーカーは忙しいワーカーから仕事を盗みます（**ワークスティーリング**、work stealing。Blumofe と Leiserson が 1999 年に解析しました）。

ジョブには依存関係があります（スキニングの前にアニメーション、コマンド記録の前にカリング）。そのため 1 フレームは**タスクグラフ**（task graph）、つまり DAG になります。$P$ 個のワーカーでどれだけ速く実行できるかは、二つの量で制限されます。全**仕事量** $W$（全ジョブの時間の合計）と**クリティカルパス** $C$（最長の依存の連鎖）です。どんなスケジュールでも少なくとも

$$
T_P \ \ge\ \max\!\left(C,\ \frac{W}{P}\right)
$$

かかります。貪欲な**リストスケジューリング**（list scheduling）は、この下界の 2 倍以内に収まることが保証されています（Graham の上界、$T_P \le W/P + C$）。終点までの残り経路が最長のジョブを優先すると、たいていはずっと良い結果になります。以下は 12 個のジョブからなるおもちゃのフレームを 30 行でスケジュールする例です。

```python
import heapq

JOBS = {  # name: (duration in ms, dependencies)
    "input": (1, []),
    "anim_a": (3, ["input"]),
    "anim_b": (3, ["input"]),
    "physics": (4, ["input"]),
    "gameplay": (2, ["physics"]),
    "skinning": (2, ["anim_a", "anim_b"]),
    "particles": (3, ["physics"]),
    "audio": (2, ["gameplay"]),
    "cull": (2, ["gameplay", "skinning"]),
    "build_1": (2, ["cull"]),
    "build_2": (2, ["cull", "particles"]),
    "submit": (1, ["build_1", "build_2"]),
}

def schedule(jobs, workers):
    children = {n: [] for n in jobs}
    for n, (_, deps) in jobs.items():
        for d in deps:
            children[d].append(n)
    prio = {}
    def bottom(n):                       # longest path from n to the end, including n
        if n not in prio:
            prio[n] = jobs[n][0] + max((bottom(c) for c in children[n]), default=0)
        return prio[n]
    for n in jobs:
        bottom(n)
    missing = {n: len(deps) for n, (_, deps) in jobs.items()}
    ready = [n for n in jobs if missing[n] == 0]
    free, running, t, log = list(range(workers)), [], 0, []
    while ready or running:
        ready.sort(key=lambda n: (-prio[n], n))   # most critical first
        free.sort()
        while ready and free:
            n, w = ready.pop(0), free.pop(0)
            heapq.heappush(running, (t + jobs[n][0], w, n))
            log.append((n, w, t, t + jobs[n][0]))
        t = running[0][0]                         # jump to the next completion
        while running and running[0][0] == t:
            _, w, n = heapq.heappop(running)
            free.append(w)
            for c in children[n]:
                missing[c] -= 1
                if missing[c] == 0:
                    ready.append(c)
    return t, log

for p in (1, 2, 3, 4):
    print(p, "workers: makespan", schedule(JOBS, p)[0], "ms")
```

```text
1 workers: makespan 27 ms
2 workers: makespan 15 ms
3 workers: makespan 12 ms
4 workers: makespan 12 ms
```

下界を確かめましょう。$W = 27$ ms、$C = 12$ ms（input、physics、gameplay、cull、build、submit）です。ワーカー 2 個では下界は $\max(12, 13.5) = 13.5$ ms で、スケジューラは 15 ms を達成します。3 個からはクリティカルパスが限界になり、4 個目のワーカーはアイドル時間を増やすだけです（図 11）。このフレームを速くするには、コアを増やすのではなくクリティカルパスを短くする必要があります。例えば物理をアイランドに分割します。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/01-job-graph.svg" caption="上：コードのジョブ DAG で、赤が 12 ms のクリティカルパスです。下：リストスケジューラが 4 ワーカーで作ったガントチャート。所要時間はクリティカルパスと等しく、ワーカー 2 は半分の時間が空き、ワーカー 3 には一つもジョブが回ってきません。このフレームではコアを増やしても役に立たないのです。" %}

次のウィジェットは同じスケジューラを動かします。ワーカー数を変え、優先度を単純な宣言順に切り替え、物理を並列な 2 ms のアイランド二つに分割してみてください。物理の連鎖は短くなりますが、クリティカルパスは 12 ms から 11 ms にしか縮みません。今度はアニメーションの連鎖（input、anim、skinning、cull、build、submit）がフレームを制限するからです。

{% include widget.liquid name="graphics-engine-job-scheduler" height="360" caption="12 個のジョブを P 個のワーカーでスケジュールします。赤い枠がクリティカルパス、緑の破線が下界 max(C, W/P) で、スケジュールが下界に達すると所要時間が緑で表示されます。P = 2 で二つの優先度を比べ、それから物理の分割にチェックを入れてみてください。" %}

**ファイバー**（fiber）。別のジョブを待たなければならないジョブ（例えば、サブジョブの結果を待つ `cull`）は、ワーカースレッドをブロックしてしまいます。Naughty Dog のエンジンはこれを**ファイバー**で解決しました。Christian Gyrling の GDC 2015 の講演「Parallelizing the Naughty Dog Engine Using Fibers」で詳しく紹介されています。ファイバーは独自のスタックを持つ軽量なユーザー空間の実行コンテキストです。アトミックなカウンタを待つジョブは自分のファイバーを眠らせ、ワーカースレッドは OS のコンテキストスイッチなしに別のファイバーへ切り替わります。同じ講演では、エンジンがフレームを重ねる方法も説明されています。あるフレームのゲームロジックが動いている間に前のフレームの描画処理が進む、図 2 のパイプライン化です。

**メインスレッドとレンダースレッド。** ジョブシステムを持つエンジンでも、いくつかの専用スレッドは残します。Unreal にはゲームスレッド、シーンを描画コマンドに変換するレンダースレッド、GPU API とやり取りする RHI スレッドがあります。シミュレーションとコマンド記録を分けると両者を別々のフレームで重ねられますが、間で受け渡すデータのコピーやダブルバッファリングが必要になります。

## 8. アセット、シリアライズ、ホットリロード、エディタ

アーティストは編集しやすい形式で制作します。FBX、glTF、USD、PSD、高解像度の EXR、WAV などです。一方ランタイムが欲しいのはロードしやすい形式です。GPU 圧縮テクスチャ（デスクトップでは BC1-7、モバイルでは ASTC）、シェーダが読むレイアウトそのままの頂点バッファ、LOD やメッシュレットに分割したメッシュ、そしてすべてを少ない I/O 要求で読めるように詰め込んだ大きなアーカイブです。**アセットパイプライン**（asset pipeline）がこの変換を行います。

1. **インポート**（import）：元ファイルをエンジン非依存の表現に解析し、各アセットに安定した ID（GUID）を割り当てます。
2. **クック**（cook。build や bake とも呼びます）：一つのターゲットプラットフォーム向けに変換します。テクスチャ圧縮、メッシュ最適化、組み合わせごとのシェーダコンパイル、ライティングやナビメッシュのベイクなどです。ゲーム全体のクックには何時間もかかることがあるため、結果はコンテンツのハッシュでキャッシュします。
3. **パッケージ**（package）：クック済みアセットをアーカイブにまとめ、一緒にロードされるものがディスク上で隣り合うように並べます。
4. **ストリーミング**（stream）：実行時にプレイヤーの移動に合わせて、メモリ予算の範囲内で、フレームを止めずにバックグラウンドでアセットをロード・アンロードします。

**シリアライズ**（serialization）は、オブジェクトをバイト列にして、また元に戻します。エンジンは通常、自身の型をリフレクションします（Unreal は C++ のマクロ、Unity は属性とソースジェネレータ、Bevy は derive マクロ）。こうすると一つの型記述から、保存、ロード、ネットワークでの複製、エディタのプロパティパネルをすべて駆動できます。**ホットリロード**（hot reload）は、ゲームの実行中に変更されたアセットを再インポートしたり、シェーダやスクリプトを再コンパイルしたりして、その場で差し替えます。数分かかる「変更・ビルド・実行」のサイクルが数秒になるので、チームはこれを非常に重視します。

だからこそ、**エディタとツールはエンジンの半分**なのです。100 人のアーティストのチームにとっては、レンダラが 10 % 速いことより、変更が 2 分ではなく 2 秒で見えるパイプラインのほうが重要です。[第 04 回]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})でエンジンを比べるときは、描画と同じくらい注意深くツールを比べてください。

## 9. エンジンの学び方

本物のエンジンを読むのが一番速い学び方です。ただし、問いを持って読むことが条件です。読むのに向いたコードベースを挙げます。

- **Godot**（C++、MIT ライセンス）：エディタ、ノードベースのシーン、Vulkan・D3D12・Metal のレンダラを備えた、完全で読みやすいエンジンです。`main/main.cpp` から始め、1 フレームの流れ（`Main::iteration`）を追ってください。
- **Bevy**（Rust、MIT/Apache ライセンス）：ECS を中心に据えた現代的なエンジンです。`bevy_ecs` は、アーキタイプテーブル、スパースセット、クエリ、並列スケジューリングのコンパクトな参照実装です。
- **Piccolo**（C++、MIT ライセンス）：GAMES104 の講義のために作られた小さな教育用エンジンです。レイヤー構造のランタイムは 1 節とほぼ一対一に対応します。
- **EnTT** と **flecs**：単体の ECS ライブラリで、スパースセットとアーキタイプのストレージを比べるのに向いています。

プロジェクトのはしご（各段は週末 1、2 回分）：

1. 補間付きの固定タイムステップループと、跳ねるボールのシーン（本記事）。
2. システムを三つ持つ最小限の ECS と、各システムの所要時間を表示するプロファイラのオーバーレイ。
3. ダーティフラグ付きのトランスフォーム階層と、BVH による視錐台カリング。
4. ワークスティーリングのスレッドプールを持つジョブシステム。そのうえで 2 段目のシステムをジョブに書き換えます。
5. レンダーグラフを持つ WebGPU レンダラ（[第 02 回]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})と[第 03 回]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})）。
6. アセットパイプライン：glTF をインポートし、バイナリ形式にクックし、ファイルが変わったらホットリロードします。

## 代表的な論文

エンジンアーキテクチャは論文よりも書籍や講演で記録されていることが多いため、表には両方を含めています。

| 論文 | 会議・論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Goldsmith & Salmon, *Automatic Creation of Object Hierarchies for Ray Tracing* | IEEE CG&A | 1987 | [DOI](https://doi.org/10.1109/MCG.1987.276983) | バウンディングボリューム階層の自動構築。BVH カリングとレイトレーシングの基礎 |
| Blumofe & Leiserson, *Scheduling Multithreaded Computations by Work Stealing* | J. ACM | 1999 | [DOI](https://doi.org/10.1145/324133.324234) | ワークスティーリング型ジョブシステムの理論的基盤 |
| Fiedler, *Fix Your Timestep!* | Gaffer on Games（記事） | 2004 | [リンク](https://gafferongames.com/post/fix_your_timestep/) | 補間付きアキュムレータ。ゲームループの定番の参考資料 |
| Drepper, *What Every Programmer Should Know About Memory* | Red Hat 技術報告 | 2007 | [PDF](https://people.freebsd.org/~lstewart/articles/cpumemory.pdf) | キャッシュ、プリフェッチ、メモリレイアウトの詳細な解説 |
| Acton, *Data-Oriented Design and C++* | CppCon（基調講演） | 2014 | [isocpp](https://isocpp.org/blog/2015/01/cppcon-2014-data-oriented-design-and-c-mike-acton) | DOD をゲームプログラミングの主流にした講演 |
| Gyrling, *Parallelizing the Naughty Dog Engine Using Fibers* | GDC | 2015 | [GDC Vault](https://gdcvault.com/play/1022186) | AAA エンジンにおけるファイバーベースのジョブシステムとフレームの重ね合わせ |
| Ford, *Overwatch Gameplay Architecture and Netcode* | GDC | 2017 | [GDC Vault](https://gdcvault.com/play/1024001) | 出荷タイトルにおける ECS と、それがネットワーク設計に与えた影響 |

## 学習リソース

- Jason Gregory『Game Engine Architecture』第 3 版（CRC Press、2018）。[書籍サイト](https://www.gameenginebook.com/)では 2 巻構成の第 4 版も告知されています。Naughty Dog のエンジニアによる標準的な教科書です。
- Robert Nystrom『[Game Programming Patterns](https://gameprogrammingpatterns.com/)』（オンラインで無料）。Game Loop、Update Method、Component、Data Locality、Dirty Flag、Spatial Partition の各章が本記事とよく対応しています。
- Richard Fabian『[Data-Oriented Design](https://www.dataorienteddesign.com/dodbook/)』（オンラインで無料）。
- Akenine-Möller ほか『[Real-Time Rendering](https://www.realtimerendering.com/)』第 4 版（2018）。エンジンの描画側を扱います。
- **GAMES104（现代游戏引擎：从入门到实践）**：現代のゲームエンジンについての中国語の無料講義（[講義ページ](https://games104.boomingtech.com/)）で、教育用エンジン [Piccolo](https://github.com/BoomingTech/Piccolo) が付いています。
- コード：[Godot](https://github.com/godotengine/godot)、[Bevy](https://github.com/bevyengine/bevy)、[EnTT](https://github.com/skypjack/entt)、[flecs](https://github.com/SanderMertens/flecs)。

## 演習

1. 半陰的オイラー法のジャンプでは、離散的な最高点が $h_\Delta = \frac{v_0^2}{2g} - \frac{v_0\Delta t}{2} + O(\Delta t^2)$ になることを示し、図 3 の凡例と照らし合わせてください。
2. 固定タイムステップのループから `MAX_FRAME` のクランプを外し、`physics_step` をわざと遅くしてください（`DT = 1/120` のまま、関数内で 10 ms スリープ）。アキュムレータとフレーム時間はどうなりますか。死のスパイラルを説明してください。
3. Python の ECS に `remove(eid, name)` と `despawn(eid)` を追加し、エンティティ ID に世代カウンタを付けて、古いハンドルを検出できるようにしてください。
4. `schedule` の優先度を先着順（`ready` を名前だけでソート）に変え、ワーカー 2、3、4 個での所要時間をクリティカルパス優先の場合と比べてください。
5. ダーティフラグの再帰を、「親が子より前」に並べたノードのフラットな配列で置き換え、1 回のループで全ワールド行列を更新してください。大きな階層でこれが速いのはなぜですか。

<details markdown="1"><summary>ヒント</summary>

1. 位置を足し合わせます：$y_n = \sum_{k=1}^{n} (v_0 - g k\Delta t)\Delta t$ を $n$ について最大化します（$n^\ast \approx v_0/(g\Delta t)$）。
2. 各フレームで、計算しきれる以上のステップが必要になるので、そのフレームが長くなり、次のフレームはさらに多くのステップを必要とします。アキュムレータは際限なく増えます。
4. `physics` とアニメーションのジョブのどちらが先に始まるかで、クリティカルパスが遅れるかどうかが決まります。
5. フラットなループでは、直前に書いたばかりの親の行列を読むので、アクセスが順次的でキャッシュに優しく、再帰のオーバーヘッドもありません。

</details>

次回：[第 02 回]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})では描画層の下に降りて、明示的な GPU API、同期、レンダーグラフを扱います。
