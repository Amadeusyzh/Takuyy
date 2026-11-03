---
layout: post
title: "リアルタイムレンダリングの技法：G-buffer、ソフトシャドウ、AO、反射、リアルタイム GI、トーンマッピング"
date: 2026-10-27 09:11:00+0900
description: "16 ms の 1 フレームを支えるアルゴリズム：遅延シェーディングと八面体法線エンコード、クラスター化ライトカリング、カスケードとソフトシャドウ（PCSS、VSM、EVSM）、SSAO/HBAO/GTAO と地平線積分、Hi-Z スクリーン空間反射、ライトマップ、SH 放射照度プローブ、DDGI とボクセルコーントレーシング、時間方向の履歴補正、HDR トーンマッピングと sRGB カーブ、そして GPU 性能の考え方。"
categories: graphics
tags: [real-time, deferred-shading, shadows, ambient-occlusion, global-illumination, tone-mapping]
series: graphics
series_order: 11
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

60 fps のゲームでは 1 フレームあたり **16.7 ms**、120 fps ならわずか 8.3 ms しかありません。この予算でジオメトリ、影、ライティング、反射、間接光、半透明、ポストプロセス、UI のすべてをまかなう必要があります。[第 03 回]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})では基本的なシャドウマップと PCF を備えたフォワードレンダラーを作り、[第 06 回]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})ではハードウェアレイトレーシング、デノイズ、ReSTIR、TAA、学習ベースのアップスケーリングを加えました。本章はその間を埋めます。扱うのは*ラスタライズ時代*の古典的な技法で、現代のどのエンジンもいまだに、しばしばレイトレーシングと並べて実行しています。焦点は**アルゴリズムとその数学**です。エンジンがそれらをレンダーグラフ（render graph）や GPU 駆動パイプラインにどう組み込むかは [graphics-engine 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}) のテーマです。Unreal Engine 5 の Nanite、Lumen、仮想シャドウマップがそれらをどうまとめているかは [graphics-engine 04]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}) で扱います。

## 前提知識

- ラスタライズのパイプライン、深度バッファ、バイアスと PCF 付きのシャドウマップ（[第 02 回]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})、[第 03 回]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})）。
- 放射輝度、放射照度、レンダリング方程式、メタリック・ラフネスの BRDF（[第 04 回]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})）。
- 時間方向の蓄積、再投影、TAA の基礎（[第 06 回]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})）。
- 5.4 節では[第 10 回]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }})のアルファ合成を使います。

## 1. 遅延レンダリングの 1 フレームを解剖する

### 1.1 フォワードと遅延

**フォワード**（forward）レンダラーは、三角形をラスタライズしながらそのフラグメントをシェーディングします。各フラグメントですべての光源をループします。コストはおおよそ（シェーディングされるフラグメント数、オーバードローを含む）×（光源数）です。**遅延**（deferred）レンダラー（Saito と Takahashi による 1990 年の「G-buffer」のアイデア）は、フレームを 2 つに分けます。

1. **ジオメトリパス**：不透明なジオメトリをすべて 1 回ラスタライズし、シェーディングへの*入力*を複数のレンダーターゲット、つまり **G-buffer** に書き込みます。アルベド、法線、ラフネス、メタリック、深度などです。この時点ではライティングは行いません。
2. **ライティングパス**：各ピクセルで G-buffer を読み、第 04 回の BRDF で各光源の寄与を加算します。

シェーディングのコストは（ピクセル数）×（ピクセルあたりの光源数）になり、オーバードロー（overdraw）に依存しなくなります。マテリアルと光源も切り離されます。代償はメモリ帯域と、いくらかの柔軟性です。

| | フォワード | 遅延 |
| --- | --- | --- |
| オーバードローのコスト | 層ごとにシェーディングを繰り返す（深度プリパスが有効） | 繰り返すのは G-buffer の書き込みだけ |
| 多数の光源 | カリングなしでは高価 | 自然に扱え、タイル / クラスターカリングで安価 |
| 半透明 | 自然に扱える | 別のフォワードパスが必要 |
| MSAA | 安価 | 高価（サンプルごとに G-buffer）。エンジンは代わりに TAA を使う |
| マテリアルの多様性 | 任意のシェーダー | G-buffer に保存できる内容に制限される |
| 帯域 | 低い | 高い：複数の全画面ターゲットを書いて読む |

下の図は、小さなシーンでこの 2 つのパスを実行した例です。(a)〜(e) がジオメトリパスの書き込む内容、(f) がライティングパスの結果です。

{% include blog_figure.liquid path="assets/img/blog/graphics/11-gbuffer.svg" caption="図のスクリプトで作った本物の G-buffer：市松模様の平面上の 3 つの球を NumPy でレイキャストしたもの。(a) アルベド、(b) ワールド法線（色で表示）、(c) ビュー空間の深度（対数グレースケール：近いほど暗く、遠いほど明るい）、(d) 八面体エンコードで 2 チャンネルに詰めた法線、(e) 赤がラフネス、緑がメタリック（金色の球はメタル）、(f) 遅延ライティングパス：(a)〜(e) だけを読み、第 04 回の GGX BRDF で 3 つの点光源をピクセルごとにシェーディングしたもの。" %}

**典型的なレイアウト。** エンジンは G-buffer をぎりぎりまで詰め込みます。よくある構成は、32 ビットのターゲット 4 枚と深度です。RGBA8 にアルベドと AO、RGB10A2 か RG16 に法線、RGBA8 にラフネス・メタリック・マテリアル ID、RG16F にモーションベクトルを入れます。**数値例**：1920 × 1080 では $2.07\text{M px} \times 16\ \text{B} = 33\ \text{MB}$ をジオメトリパスで書き、ライティングパスで読み戻します。60 fps ではライティングの仕事をする前から約 4 GB/s です。G-buffer のサイズが 1 ビット単位で争われるのはこのためです。

### 1.2 八面体法線エンコード

単位法線の自由度は 2 なので、float を 3 つ保存するのは無駄です。**八面体エンコード**（octahedral encoding、Cigolle ら 2014 のサーベイ）は、球面を八面体 $\vert x\vert + \vert y\vert + \vert z\vert = 1$ に射影し、下半分（$z<0$）を正方形の四隅へ外向きに折り返します。

$$
(u, v) = \begin{cases} (x', y') & z' \ge 0\\ \big((1-\vert y'\vert)\,\mathrm{sgn}\,x',\ (1-\vert x'\vert)\,\mathrm{sgn}\,y'\big) & z' < 0 \end{cases},
\qquad (x',y',z') = \frac{\mathbf{n}}{\vert x\vert+\vert y\vert+\vert z\vert}.
$$

この写像は連続で、正方形 $[-1,1]^2$ をほぼ一様に埋め、わずかな命令でデコードできます。

```python
import numpy as np

def sgn(x):
    return np.where(x >= 0, 1.0, -1.0)

def oct_encode(n):
    n = n / np.abs(n).sum(-1, keepdims=True)
    x, y, z = n[..., 0], n[..., 1], n[..., 2]
    u = np.where(z < 0, (1 - np.abs(y)) * sgn(x), x)
    v = np.where(z < 0, (1 - np.abs(x)) * sgn(y), y)
    return np.stack([u, v], -1)

def oct_decode(e):
    x, y = e[..., 0], e[..., 1]
    z = 1 - np.abs(x) - np.abs(y)
    t = np.clip(-z, 0, None)                  # fold the corners back to z < 0
    n = np.stack([x - t * sgn(x), y - t * sgn(y), z], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)

n = np.array([0.3, -0.5, -0.81]); n /= np.linalg.norm(n)
e = oct_encode(n)
q = np.round(e * 32767) / 32767               # store as two 16-bit snorm values
err = np.degrees(np.arccos(np.clip(oct_decode(q) @ n, -1, 1)))
print(e, err)                                 # error well below 0.01 degrees
```

下の図の (a) がこの写像を描いたもの、(b) が量子化後の各種法線エンコードの角度誤差を比べたものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/11-octahedral.svg" caption="(a) 八面体マップ：正方形の各点は単位法線にデコードされます（色で表示）。内側のひし形が上半球 z > 0、四隅が折り返された下半球です。(b) 200,000 個のランダムな法線を量子化したときの最大角度誤差と総ビット数の関係。同じビット数なら八面体 (u, v) は球面座標とほぼ同じ精度（球面座標のほうがわずかに良い）ですが、エンコードにもデコードにも三角関数が要りません。量子化した xyz の 3 チャンネルでは同程度の誤差に約 50% 多いビットが必要です。" %}

### 1.3 タイル化とクラスター化によるライトカリング

ピクセルごとに*すべての*光源をループする方法は、数百個の光源にはスケールしません。点光源やスポットライトには有限の到達範囲があります。半径 $r_\ell$ の球で、その外側では寄与が無視できます。**タイルシェーディング**（tiled shading）は画面をタイル（例：16 × 16 ピクセル）に分け、タイルごとに光源リストを作ります。リストに入るのは、光源の球がタイルの部分視錐台（タイルの最小 / 最大深度で区切ったもの）と重なる光源で、シェーディングではそのリストだけをループします。**クラスターシェーディング**（clustered shading、Olsson、Billeter、Assarsson 2012）は深度方向にも分割します。これにより、前景と背景にまたがるタイルが両方の光源を集めてしまう「深度不連続」の問題を避けられます。スライスは指数的に並べ、透視投影でもクラスターがほぼ立方体に保たれるようにします。

$$
z_k = z_n \left(\frac{z_f}{z_n}\right)^{k/S},
\qquad
k(z) = \left\lfloor S\,\frac{\ln(z/z_n)}{\ln(z_f/z_n)} \right\rfloor .
$$

**数値例**：$z_n = 0.1$、$z_f = 1000$、$S = 24$ スライスとします。深度 $z = 10$ のピクセルはスライス $\lfloor 24 \cdot \ln 100/\ln 10^4\rfloor = \lfloor 24 \cdot 0.5\rfloor = 12$ に入ります。ピクセルからクラスターを引くには、除算 2 回と対数 1 回で済みます。光源リストは毎フレーム GPU 上で 1 回作ります。各光源の球を各クラスターのバウンディングボックスと判定します。

下の図は、ランダムな点光源のシーンでこの割り当てを実際に行った結果です。

{% include blog_figure.liquid path="assets/img/blog/graphics/11-clusters.svg" caption="計算で求めたクラスター化された光源の割り当て。(a) 16 × 9 タイルと指数間隔の 16 深度スライスに分けた視錐台（灰色の輪郭、手前の部分のみ）と 30 個の点光源（黄色の球）。各点は少なくとも 1 つの光源に触れるクラスターで、色は光源の数を表します。(b) 上から見た図：各セルは、その列（y 方向のタイル全体）での最大光源数で色分けしています。赤い円は光源の到達範囲です。ほとんどのクラスターはごく少数の光源しか見ないので、ピクセルごとのループが安く済みます。" %}

クラスターグリッドがレンダーグラフの中でどう作られ使われるか、また forward+ や可視性バッファ（visibility buffer）のレンダラーが同じリストをどう使うかは [graphics-engine 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}) で扱います。

## 2. 基本を超えた影

第 03 回では 1 枚のシャドウマップ、バイアス、PCF を扱いました。残る問題は 3 つです。広い視距離での**解像度**、遮蔽物からの距離とともに広がる**柔らかい半影**（penumbra）、そしてアクネ（acne）を出さない**フィルタリング**です。

### 2.1 カスケードシャドウマップと分割方式

平行光源（太陽）に 1 枚のシャドウマップで 200 m の視距離をカバーさせると、1 ピクセルが数ミリしかないカメラ近くでも、数メートルある遠方でも、テクセルの大きさは同じになります。その結果が**透視エイリアシング**（perspective aliasing）で、近くの影がブロック状になります。**カスケードシャドウマップ**（cascaded shadow maps、CSM。parallel-split shadow maps、Zhang ら 2006）は、視錐台を $N$ 個の深度区間 $[z_i, z_{i+1}]$ に切り、それぞれにそのスライスにぴったり合わせたシャドウマップを割り当てます。

分割点はどこに置けばよいでしょうか。シャドウテクセルの足跡とスクリーンピクセルの足跡の比を考えます。$[z_i, z_{i+1}]$ を覆うカスケードの幅は $z_{i+1}$ における視錐台の幅に等しいので、テクセルの大きさは $z_{i+1}$ に比例します。一方、深度 $z$ でのピクセルの足跡は $z$ に比例します。解像度が等しければ比はおよそ $z_{i+1}/z$ で、各カスケードの手前端で最悪になります。最悪値をすべてのカスケードで等しくすると**対数**分割になり、最悪値はどのカスケードでも $(z_f/z_n)^{1/N}$ です。**一様**分割は遠方で解像度を無駄にし、手前のカスケードを不足させます。**実用分割方式**（practical split scheme）は、パラメータ $\lambda$ で 2 つを混ぜます。

$$
z_i^{\log} = z_n\Big(\frac{z_f}{z_n}\Big)^{i/N},\qquad
z_i^{\text{uni}} = z_n + (z_f - z_n)\frac{i}{N},\qquad
z_i = \lambda\, z_i^{\log} + (1-\lambda)\, z_i^{\text{uni}} .
$$

純粋な対数分割では最初のカスケードがとても小さくなり、カメラ近くのディテールは非常に良い反面、カスケードの切り替えが頻繁になります。**数値例**：$z_n = 0.1$、$z_f = 200$、$N = 4$ とします。対数分割は $0.669, 4.47, 29.9$、一様分割は $50.1, 100, 150$ で、$\lambda = 0.9$ なら $5.61, 14.0, 41.9$ です。

```python
import numpy as np

def csm_splits(n, f, N, lam):
    i = np.arange(N + 1) / N
    return lam * n * (f / n) ** i + (1 - lam) * (n + (f - n) * i)

for lam in [0.0, 0.5, 0.9, 1.0]:
    print(lam, np.round(csm_splits(0.1, 200.0, 4, lam), 3))
# 0.9 -> [  0.1    5.61   14.03   41.92  200.  ]
```

下の図の (a) は 4 通りの λ での分割点、(b) は各深度でのテクセルとピクセルの足跡の比です。

{% include blog_figure.liquid path="assets/img/blog/graphics/11-csm-splits.svg" caption="n = 0.1、f = 200、4 カスケードでの分割。(a) λ を 0（一様）から 1（対数）まで変えたときの 4 つの深度区間を対数軸で示し、分割深度を書き込んだもの。(b) テクセルとピクセルの足跡の比 z_{i+1}/z のビュー深度に沿った変化（各カスケード内で手前端の最大値から奥端の 1 まで下がります）。一様分割（λ = 0）では z = 0.1 で約 500、1 m でもまだ約 50 になり、対数分割（λ = 1）では最大値がどこでも (f/n)^{1/4} ≈ 6.7 で、λ = 0.9 はその折衷です。" %}

プロダクションでの細部は 3 つあります。**安定化**（stabilization）は、各カスケードの投影をテクセル単位にスナップし、サイズを一定に保つことで、カメラが動いても影がちらつかないようにします。カスケード境界での**ブレンド**（blending）は、目に見える継ぎ目を隠します。**サンプル分布シャドウマップ**（sample distribution shadow maps、Lauritzen、Salvi、Lefohn 2011）は、深度バッファを読んで、実際に見えている深度範囲にカスケードを合わせます。

### 2.2 PCF とパーセンテージクローサーソフトシャドウ

PCF（Reeves、Salesin、Cook 1987。第 03 回）は、複数の深度比較の*結果*を平均して、硬いエッジを傾斜に変えます。傾斜の幅を決めるのはカーネルで、シーンではありません。本物の半影は面光源から生じ、遮蔽物と受光面の距離とともに広がります。ポールの影は根元ではシャープで、先端ではぼやけます。

**PCSS**（percentage-closer soft shadows、Fernando 2005）は、ピクセルごとに 3 ステップで半影を推定します。

1. **ブロッカー探索**：探索領域の中で、受光点より光源に近いシャドウマップ深度を平均し、$d_{\text{blocker}}$ を求めます。
2. **半影の推定**：幅 $w_{\text{light}}$ の光源、ブロッカー、受光面の相似三角形から求めます。
   $$ w_{\text{penumbra}} = \frac{(d_{\text{receiver}} - d_{\text{blocker}})\, w_{\text{light}}}{d_{\text{blocker}}} . $$
3. **PCF**：幅が $w_{\text{penumbra}}$ に比例するカーネルでフィルタリングします。

**数値例**：幅 0.5 m の光源、光源から 8 m のブロッカー、10 m の受光面では $w_p = 2 \times 0.5/8 = 0.125$ m です。ブロッカーを光源から 4 m に動かすと、半影は $6 \times 0.5/4 = 0.75$ m に広がります。

```glsl
uniform sampler2D uShadowDepth;   // distance from the light, normalized to [0,1]
uniform float uLightSizeUV;       // light width / shadow frustum width
uniform float uNear;              // light near plane, same normalization
const int N = 16;
uniform vec2 uPoisson[N];         // Poisson-disk offsets in the unit disk

float pcss(vec2 uv, float dReceiver) {
    // 1. blocker search
    float searchR = uLightSizeUV * (dReceiver - uNear) / dReceiver;
    float sum = 0.0; int count = 0;
    for (int i = 0; i < N; ++i) {
        float d = texture(uShadowDepth, uv + uPoisson[i] * searchR).r;
        if (d < dReceiver) { sum += d; ++count; }
    }
    if (count == 0) return 1.0;                        // nothing in front: fully lit
    float dBlocker = sum / float(count);
    // 2. penumbra width by similar triangles
    float wPenumbra = (dReceiver - dBlocker) * uLightSizeUV / dBlocker;
    // 3. PCF with that kernel
    float lit = 0.0;
    for (int i = 0; i < N; ++i) {
        float d = texture(uShadowDepth, uv + uPoisson[i] * wPenumbra).r;
        lit += (dReceiver - 0.002 <= d) ? 1.0 : 0.0;
    }
    return lit / float(N);
}
```

下の図の (a) は半影の幅の式をブロッカーまでの距離に対して描いたもの、(b) は直線エッジのブロッカーについて、PCSS と固定カーネルの PCF を正確な結果と比べたものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/11-pcss.svg" caption="(a) 3 つの光源サイズについて、PCSS の半影幅とブロッカー・受光面間の距離の関係（受光面は光源から 10 単位）。最初はゆっくり増え、ブロッカーが光源に近づくと急激に大きくなります。(b) 高さ h = 2（青）と h = 6（赤）の直線状のブロッカーが落とす影の境界での可視度：幅 1 単位の光源が見える割合の厳密値（太く淡い線）、両方の傾斜を再現する PCSS（点線）、h によらず同じ幅 0.4 の傾斜になる固定カーネルの PCF（破線）。" %}

### 2.3 分散シャドウマップとモーメントシャドウマップ

PCF は事前フィルタリングができません。深度マップをぼかすことはできないのです。「深度を平均してから比較する」のと「比較してから平均する」のは別物だからです。**分散シャドウマップ**（variance shadow maps、VSM。Donnelly と Lauritzen 2006）は、深度の 1 次と 2 次の**モーメント**（moments）$M_1 = E[z]$、$M_2 = E[z^2]$ を保存します。モーメントならミップマップ、分離可能なぼかし、異方性フィルタリングでフィルタ*できます*。参照時には、フィルタ領域での平均を $\mu = M_1$、分散を $\sigma^2 = M_2 - M_1^2$ とします。片側の**チェビシェフ（Cantelli）不等式**が、深度が $t$ 以上である割合、つまり深度 $t$ の受光点を遮蔽*しない*割合を上から抑えます。

$$
P(z \ge t) \;\le\; p_{\max}(t) = \frac{\sigma^2}{\sigma^2 + (t-\mu)^2}, \qquad t > \mu .
$$

VSM は $p_{\max}$ を可視度として使います。平面の受光面の手前に平面の遮蔽物が 1 枚ある場合、この上界は厳密です。**数値例**：カーネルの半分が深度 0.3、半分が 0.7 なら、$\mu = 0.5$、$\sigma^2 = 0.04$ です。2 枚目の面のすぐ後ろ $t = 0.7$ の受光点では $p_{\max} = 0.04/(0.04+0.04) = 0.5$ で、まさに正解です。$t = 0.9$ では真の値は 0 ですが、$p_{\max} = 0.04/(0.04+0.16) = 0.2$ になります。これが**光の漏れ**（light bleeding）です。2 つの遮蔽物が重なると分散が大きくなり、上界が緩くなります。

```python
import numpy as np

def chebyshev(m1, m2, t):
    var = np.maximum(m2 - m1 * m1, 1e-6)
    return np.where(t <= m1, 1.0, var / (var + (t - m1) ** 2))

def evsm(z, t, c=10.0):
    """Exponential VSM: Chebyshev on warped depths exp(c z) and -exp(-c z), take the min."""
    p, n = np.exp(c * z), -np.exp(-c * z)
    return np.minimum(chebyshev(p.mean(), (p * p).mean(), np.exp(c * t)),
                      chebyshev(n.mean(), (n * n).mean(), -np.exp(-c * t)))

z = np.array([0.3, 0.7])                    # depths inside the filter kernel
for t in [0.7, 0.9]:
    print(t, chebyshev(z.mean(), (z * z).mean(), t), evsm(z, t))
# VSM: 0.5 at t = 0.7 (exact), 0.2 at t = 0.9 (bleeding); EVSM is far lower at 0.9
```

対策は次のとおりです。

- **光漏れの軽減**は、$p_{\max}$ を再マッピングして小さい値を 0 にします。代わりに半影が暗くなります。
- **指数シャドウマップ**（ESM、Annen ら 2008）は $e^{cz}$ を保存します。
- **指数分散シャドウマップ**（EVSM、Lauritzen による層状・ワープ VSM の研究から）は、ワープしたモーメント $e^{cz}$ と $-e^{-cz}$ のそれぞれにチェビシェフ不等式を適用し、小さいほうの上界を採ります。ワープによって遮蔽物の深度が受光点に対して圧縮されるので、上界がずっとタイトになります。
- **モーメントシャドウマップ**（moment shadow maps、Peters と Klein 2015）は 4 つのモーメントを保存し、それと矛盾しない最もタイトな分布を再構成します（ハンバーガーのモーメント問題）。これで光漏れはほぼなくなります。

下の図の (a) は上の数値例の真の割合、VSM の上界、EVSM を並べたもの、(b) は光漏れの様子です。

{% include blog_figure.liquid path="assets/img/blog/graphics/11-vsm-chebyshev.svg" caption="(a) フィルタ領域の深度の半分が 0.3、半分が 0.7 のときの、真の割合 P(z ≥ t)（黒の階段）、VSM のチェビシェフ上界（橙）、c = 10 の EVSM（緑）。上界は t = 0.7 で真の値に接しますが、その後ろでは高いままです。(b) 帯の上での光漏れ：深度マップでは、左にブロッカー A（z = 0.2、薄紫の領域）、中央にブロッカー B（z = 0.5）、右に受光面そのもの（z = t = 0.6）があります。真の PCF 可視度（黒）は A と B の下ではどこでも 0 で、フィルタ（半幅 0.08）が x = 0.75 の B の端に触れるところで初めて上がります。一方、VSM はフィルタが A と B の両方にまたがる場所（x = 0.45 付近）で光を漏らします。EVSM はそのほとんどを抑えます。" %}

### 2.4 コンタクトシャドウと仮想シャドウマップ

良いシャドウマップでも、小さなスケールの遮蔽は見逃します。カップとテーブルの接地部分や、しわなどです。**コンタクトシャドウ**（contact shadows）は、各ピクセルから光源へ向かって*スクリーン空間で*深度バッファの中を数ステップ進み、短い距離のうちにレイが表面の裏に入ったらそのピクセルを影とします。スクリーン空間反射（4 節）と同じマーチャーで、レイが短いだけです。反対の極端が**仮想シャドウマップ**（virtual shadow maps）です。光源ごとに巨大なシャドウテクスチャ（例：$16\text{k}\times16\text{k}$）を 1 枚使い、見えているピクセルが必要とする場所にだけページ単位で疎に割り当てます。平行光源にはクリップマップの階層を使います。Unreal Engine 5 ではカスケードに取って代わっており、[graphics-engine 04]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}) で扱います。

## 3. アンビエントオクルージョン

### 3.1 定義

くぼみにある点に届く環境光は、近くのジオメトリによって減ります。**アンビエントオクルージョン**（ambient occlusion、AO）は、法線まわりの半球のうち、半径 $R$ 以内で遮られて*いない*部分の割合をコサインで重み付けしたものです。

$$
A(\mathbf{p}) = \frac{1}{\pi}\int_{\Omega} V(\mathbf{p}, \boldsymbol{\omega})\,(\mathbf{n}\cdot\boldsymbol{\omega})\, d\boldsymbol{\omega},
$$

ここで、$\mathbf{p}$ から方向 $\boldsymbol{\omega}$ へのレイが $R$ 以内で抜ければ $V = 1$ です。$1/\pi$ は、何も遮らないときに $A = 1$ となるよう正規化しています。環境光や間接拡散光に $A$ を掛けるのは近似にすぎません。遮蔽物自身も光を反射するからです。それでも AO は、リアルタイムレンダリングで物体を「接地」させる最も効果的な単一の効果です。

### 3.2 SSAO と HBAO

**SSAO**（Mittring 2007、CryEngine 2）は、深度バッファだけから遮蔽を推定します。各ピクセルの周囲、半径 $R$ 以内にランダムな 3 次元サンプル点をいくつかとり、画面に射影して、保存された深度の*奥*にあるものを数えます。後の変種では、法線方向の半球でサンプリングし、ピクセルごとのランダム回転（ノイズ）の後にバイラテラルブラーをかけ、遠くの前景物体が背景を暗くしないよう範囲チェックを加えています。

**HBAO**（Bavoil、Sainz、Dimitrov 2008）は、深度バッファを高さ場として解釈し直します。スクリーン空間のいくつかの方向について外へ向かってマーチングし、高さ場が見える最も高い仰角、つまり**地平線角**（horizon angle）を見つけます。地平線より下はすべて遮蔽され、上はすべて開いているので、方向ごとに 1 回マーチングするだけで、多数の独立な可視判定の代わりになります。

### 3.3 GTAO：地平線積分を解く

**GTAO**（Jimenez、Wu、Pesce、Jarabo 2016）は、AO の積分をまさにこのスライスの形で書き、コサインの重みを解析的に積分します。半球を、スクリーン平面内のスライス角 $\phi \in [0, \pi)$ と、スライス内での法線からの角度 $\theta \in [-\pi/2, \pi/2]$ でパラメータ化します。法線が視点を向いている単純な場合を考えると、$d\boldsymbol{\omega} = \vert\sin\theta\vert\, d\theta\, d\phi$ で、

$$
A = \frac{1}{\pi}\int_0^{\pi}\!\int_{-\pi/2}^{\pi/2} V(\phi,\theta)\,\cos\theta\,\vert\sin\theta\vert\, d\theta\, d\phi .
$$

各スライスで見えている範囲は 2 本の地平線の間、$\theta \in [-h_1, h_2]$ です（$h_{1,2}$ は法線から測ります）。接平面からの仰角を $e = \pi/2 - h$ とすると、内側の積分は初等的です。

$$
\int_0^{h}\cos\theta\sin\theta\,d\theta = \frac{\sin^2 h}{2}
\quad\Longrightarrow\quad
a(\phi) = \frac{\sin^2 h_1 + \sin^2 h_2}{2} = \frac{\cos^2 e_1 + \cos^2 e_2}{2},
\qquad A = \frac{1}{\pi}\int_0^{\pi} a(\phi)\,d\phi .
$$

確認：遮蔽物がなければ $e_1 = e_2 = 0$ で、$a = 1$、$A = 1$ です。**数値例**：地平線が $e_1 = 30^\circ$、$e_2 = 10^\circ$ なら $a = (0.75 + 0.970)/2 = 0.860$ です。論文はこれを、法線がスライス内で傾いている場合へ一般化し（投影した法線の角度が閉じた形に入ります）、明るい色の表面で AO を明るくする安価なマルチバウンス補正を加えています。各ピクセルは 1〜2 枚のスライスを使い、ピクセルごと・フレームごとにランダムに回転させ、ノイズは空間方向と時間方向で取り除きます。

```python
import numpy as np

def horizon_ao(h, R=0.08, steps=12, slices=4, rng=None):
    """GTAO-style AO on a height field h (n x n over [0,1]^2), normal assumed +z."""
    n = h.shape[0]
    u = (np.arange(n) + 0.5) / n
    X, Y = np.meshgrid(u, u)
    def look(x, y):
        i = np.clip((y * n).astype(int), 0, n - 1); j = np.clip((x * n).astype(int), 0, n - 1)
        return h[i, j]
    rot = rng.random(h.shape) if rng is not None else 0.0
    A = np.zeros_like(h)
    for k in range(slices):
        phi = np.pi * (k + rot) / slices
        a = 0.0
        for s in (1, -1):                               # the two sides of the slice
            e = np.zeros_like(h)
            for j in range(1, steps + 1):
                r = R * j / steps
                dh = look(X + s * r * np.cos(phi), Y + s * r * np.sin(phi)) - h
                e = np.maximum(e, np.arctan2(dh, r))    # horizon elevation
            a = a + 0.5 * np.cos(e) ** 2
        A += a
    return A / slices

xx, yy = np.meshgrid(np.linspace(0, 1, 128), np.linspace(0, 1, 128))
hill = 0.2 * np.exp(-((xx - 0.5) ** 2 + (yy - 0.5) ** 2) / 0.02)
ao = horizon_ao(hill)
print(ao.min().round(3), ao.max().round(3))           # 0.753 1.0: dark ring at the hill's foot, 1.0 on flat ground
```

下の図は、スライス積分を実際の高さ場に適用したものです。(a) は 1 枚のスライス、(b)〜(d) はモンテカルロ推定と地平線の形のノイズを比べています。

{% include blog_figure.liquid path="assets/img/blog/graphics/11-ao-horizon.svg" caption="高さ場（丘、箱、穴）でのアンビエントオクルージョン。(a) 点 p を通る 1 枚のスライス：マーチャーは両側で高さ場をサンプリングし（点）、最も高い仰角、つまり地平線 e₁ と e₂ を残します。スライスの見えている割合は ½(cos²e₁ + cos²e₂) です。(b) ピクセルあたり 8 本のコサイン重み付きレイによるモンテカルロ推定は非常にノイジーです。(c) 64 本で改善しますが、まだ粒状です。(d) 4 スライス（各スライスの両側で 12 ステップ）だけでピクセルごとにランダム回転させた地平線の形は、すでに (c) より誤差が小さくなります。RMSE は 64 スライスの地平線法を基準に測っています。" %}

## 4. スクリーン空間反射

**スクリーン空間反射**（screen-space reflections、SSR）は、すでにシェーディング済みのフレームを反射光の供給源として再利用します。光沢のある表面を持つ各ピクセルで、次のようにします。

1. 深度からビュー空間の位置を復元し、視線ベクトルを法線で反射させます：$\mathbf{r} = \mathbf{v} - 2(\mathbf{v}\cdot\mathbf{n})\mathbf{n}$。
2. 反射レイを**スクリーン空間で**、深度バッファの中を 1 ステップずつ、レイの深度が保存された深度より奥に入るまでマーチングします。
3. レイが表面から**厚み** $\Delta$ 以内にあればヒットとします。深度バッファには最も手前の表面しか入っていないので、厚みの判定がなければどの物体も無限に奥行きがあるように見えてしまいます。
4. ヒット位置の前フレームの色（再投影したもの）を返し、画面の端に近いほどフェードさせます。

McGuire と Mara（2014）は、$1/z$（透視投影の下でスクリーン空間で線形）を補間する DDA で、スクリーン空間をマーチングする方法を示しました。3 次元でステップしてカメラ近くを過剰にサンプリングするのではなく、各ピクセルをちょうど 1 回ずつ訪れます。

**階層的 Z トレーシング。** ステップ幅 $\Delta x$ の線形マーチングは、ステップ数が多くなるか、薄い物体を飛び越えてしまうかのどちらかです。**Hi-Z ピラミッド**は、レベル $L$ に $2^L \times 2^L$ ピクセルでの*最小*深度（最も手前の表面）を保存します。トレーサーはこの四分木の中をレイに沿って進みます。粗いセルを抜けるまでレイがそのセルの最も手前の深度より手前にあれば、セル全体を飛ばして 1 レベル上がります。そうでなければ、レイがその深度に達する位置まで進み、1 レベル下がって細かくします。ヒットはレベル 0 で判定します。コストは進んだ距離に対して対数的になります。Uludag の章 *Hi-Z Screen-Space Cone-Traced Reflections*（GPU Pro 5、2014）が、これを SSR で広めました。図を再現する 1 次元版を示します。深度バッファは 64 ピクセルで、地面の深度は 0.9、柱（x = 20〜23、深度 0.55）と箱（x = 40〜51、深度 0.62）があります。レイは x = 4、深度 0.3 から出発し、1 ピクセル進むごとに深度が 0.009 増えるので、柱の手前を通り過ぎて箱の前面に当たります。

```python
import numpy as np

zbuf = np.full(64, 0.9); zbuf[20:24] = 0.55; zbuf[40:52] = 0.62     # 1D depth buffer
pyr = [zbuf]
while len(pyr[-1]) > 1:
    pyr.append(pyr[-1].reshape(-1, 2).min(axis=1))                  # min-depth pyramid

def hiz_trace(x0, z0, slope, pyr, thickness=0.05, max_iter=64):
    lvl, x = 0, x0
    for it in range(max_iter):
        size = 2 ** lvl
        cell = int(x // size)
        if cell * size >= len(pyr[0]):
            return None, it                            # left the screen
        x_exit = (cell + 1) * size
        zmin = pyr[lvl][cell]
        if z0 + (x_exit - x0) * slope < zmin:          # in front of the whole cell: skip, go coarser
            x, lvl = x_exit, min(lvl + 1, len(pyr) - 1)
        else:
            x = max(x, x0 + (zmin - z0) / slope)       # advance to where the ray reaches zmin
            if lvl == 0:
                if z0 + (x - x0) * slope - zmin <= thickness:
                    return x, it                       # hit
                x = x_exit                             # passed behind a thin object
            else:
                lvl -= 1                               # refine
    return None, max_iter

print(hiz_trace(4.0, 0.3, 0.009, pyr))   # (40, 12): hits the front of the box at x = 40 after 12 iterations
```

{% include blog_figure.liquid path="assets/img/blog/graphics/11-ssr-march.svg" caption="1 次元の深度バッファでのスクリーン空間レイマーチング（灰色：保存された深度より奥のシーン。カメラは上側）。(a) 7 ピクセル刻みの線形マーチング（点）：x = 39 ではまだ箱の手前にいて、次のステップの x = 46 では箱の前面より奥に入っているため、ヒット（星）を見つけるにはこの 2 点の間での二分探索による細分化が必要です。ステップが大きい、あるいは物体が薄いと、ヒットを見逃してしまいます。(b) 階層的 Z：色付きの棒は各ピラミッドレベルで訪れた最小深度セルです。レイは粗いレベルで大きな空のセルを飛ばし、箱の近くでだけ細かくします。" %}

**失敗するケース**は、深度バッファがカメラから見えるものの 1 層にすぎないことから生じます。

- 画面の外へ出るレイやカメラの方を向くレイは、何も見つけられません。
- カメラに背を向けた表面や、他の物体の陰に隠れた表面は、そもそもバッファにありません。
- 薄い物体は、厚みの値によって、見逃されるか、引き伸ばされて汚れます。

そのためエンジンは、SSR をフォールバックとブレンドします。反射プローブや、第 06 回のようなハードウェアでトレースしたレイです。粗い表面では広いコーンを使うか、ピクセルごとに GGX ローブを重点的サンプリングして、結果を空間方向と時間方向にフィルタリングします。

## 5. リアルタイムのグローバルイルミネーション

直接光は簡単なほうの半分です。間接光（壁での跳ね返り、色のにじみ、室内の天空光）こそが画像を本物らしくします。リアルタイム GI は、完全な事前計算から完全な動的処理までのスペクトルです。

### 5.1 ライトマップ

**ライトマップ**（light maps）は、静的な表面への入射放射照度を、重なりのない 2 つ目の UV レイアウトに事前計算します。オフラインのパストレーサー（第 05 回のような）や GPU ベイカーを使います。実行時にはテクスチャを 1 回引くだけで、ほぼコストなしに完璧な柔らかい間接光が得られます。法線マップを効かせるために、ベイカーは*方向付きの*放射照度を保存します。テクセルごとに主方向、低次の SH、または H 基底（H-basis）です。限界は、ジオメトリと光源が静的であること、メモリ、そしてベイク時間です。

### 5.2 放射照度プローブと球面調和関数

動的な物体や、ライトマップが現実的でないシーンのために、エンジンは空間に**プローブ**（probes）を配置します。各プローブは、あらゆる方向から届く放射照度 $E(\mathbf{n})$ をコンパクトに保存します。拡散放射照度は方向に対して非常に滑らかです。放射輝度をクランプしたコサインで畳み込んだものだからです。**球面調和関数**（spherical harmonics、SH）がその自然な基底になります。

**実球面調和関数** $Y_{lm}$ は、球面上の関数の正規直交基底です。バンド $l = 0, 1, 2, \dots$ ごとに $2l+1$ 個の関数があり、$l$ を角周波数とするフーリエ級数のようなものです。$l \le 2$ のバンドで 9 個の関数になります。単位ベクトル $(x, y, z)$ に対するデカルト座標での形は次のとおりです。

$$
\begin{aligned}
Y_{00} &= 0.282095, \qquad (Y_{1,-1}, Y_{10}, Y_{11}) = 0.488603\,(y,\ z,\ x),\\
(Y_{2,-2}, Y_{2,-1}, Y_{21}) &= 1.092548\,(xy,\ yz,\ xz),\quad Y_{20} = 0.315392\,(3z^2-1),\quad Y_{22} = 0.546274\,(x^2-y^2).
\end{aligned}
$$

環境の放射輝度 $L(\boldsymbol{\omega})$ を基底に**射影**すると係数が得られます（正規直交性により、ただの内積になります）。

$$
L_{lm} = \int_{S^2} L(\boldsymbol{\omega})\,Y_{lm}(\boldsymbol{\omega})\,d\boldsymbol{\omega},
\qquad L(\boldsymbol{\omega}) \approx \sum_{l\le l_{\max}}\sum_m L_{lm} Y_{lm}(\boldsymbol{\omega}).
$$

**畳み込みによる放射照度。** 放射照度 $E(\mathbf{n}) = \int L(\boldsymbol{\omega})\max(0, \mathbf{n}\cdot\boldsymbol{\omega})\,d\boldsymbol{\omega}$ は、クランプしたコサインとの畳み込みです。Funk-Hecke の定理により、回転対称なカーネルとの畳み込みは、各バンドを定数倍するだけです。Ramamoorthi と Hanrahan（2001）がその係数を求めました。

$$
E(\mathbf{n}) = \sum_{l,m} \hat A_l\, L_{lm}\, Y_{lm}(\mathbf{n}),
\qquad \hat A_0 = \pi,\quad \hat A_1 = \frac{2\pi}{3},\quad \hat A_2 = \frac{\pi}{4},\quad \hat A_3 = 0,\quad \hat A_4 = -\frac{\pi}{24},\ \dots
$$

係数は急速に減衰します（$l > 1$ の奇数の $l$ ではゼロ、偶数の $l$ では $l^{-5/2}$ のように減衰）。だからこそ、鋭い太陽がある環境でも、**色チャンネルあたり 9 個の係数**で放射照度を平均数パーセント以内で再現できます。放射輝度そのものには、はるかに多くのバンドが必要です。

```python
import numpy as np

def sh9(d):
    x, y, z = d[..., 0], d[..., 1], d[..., 2]
    return np.stack([0.282095 * np.ones_like(x),
                     0.488603 * y, 0.488603 * z, 0.488603 * x,
                     1.092548 * x * y, 1.092548 * y * z, 0.315392 * (3 * z * z - 1),
                     1.092548 * x * z, 0.546274 * (x * x - y * y)], -1)

A_HAT = np.array([np.pi] + [2 * np.pi / 3] * 3 + [np.pi / 4] * 5)

def project(radiance_fn, n_theta=256, n_phi=512):
    th = (np.arange(n_theta) + 0.5) / n_theta * np.pi
    ph = (np.arange(n_phi) + 0.5) / n_phi * 2 * np.pi
    PH, TH = np.meshgrid(ph, th)
    d = np.stack([np.sin(TH) * np.cos(PH), np.sin(TH) * np.sin(PH), np.cos(TH)], -1)
    dw = np.sin(TH) * (np.pi / n_theta) * (2 * np.pi / n_phi)      # solid angle of each cell
    return np.einsum("ij,ijk->k", radiance_fn(d) * dw, sh9(d))

def irradiance(coef, n):
    return sh9(n) @ (A_HAT * coef)

c = project(lambda d: np.ones(d.shape[:-1]))                      # constant sky, L = 1
print(c[0].round(4), irradiance(c, np.array([0.0, 0.0, 1.0])).round(4))   # 3.5449 3.1416 (= pi)
c = project(lambda d: (d[..., 2] > 0).astype(float))              # sky above, black below
for nz in [1.0, 0.0, -1.0]:
    n = np.array([np.sqrt(1 - nz * nz), 0.0, nz])
    print(nz, irradiance(c, n).round(4), round(np.pi * (1 + nz) / 2, 4))   # matches pi(1+n_z)/2
```

2 つのチェックには厳密な答えがあります。一定の環境 $L = 1$ では $L_{00} = 4\pi \cdot 0.282095 = 3.5449$ となり、どの法線でも $E = \pi$ です。白い上半球では $E(\mathbf{n}) = \pi(1 + n_z)/2$ です。これは $n_z$ について線形なので、$l \le 1$ のバンドですでに厳密に再現できます。

下の図は、空のグラデーション、暗い地面、小さく明るい太陽を持つ環境について、正確な放射照度と次数を上げていく SH 近似を比べたものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/11-sh-irradiance.svg" caption="空のグラデーション、暗い地面、小さく明るい太陽からなる環境の SH 放射照度を緯度経度マップで示したもの（θ が縦、φ が横）。(a) 放射輝度（対数スケール）：太陽は小さな点です。(b) 総当たりの積分で求めた厳密な放射照度：広く滑らかなローブです。(c)〜(e) バンド l ≤ 0、1、2（係数 1、4、9 個）での SH 近似：l ≤ 2 は (b) と見分けがつきません。(f) 相対 RMS 誤差：放射照度の誤差は急速に下がり、l = 3 は何も加えません（Â₃ = 0 のため）。一方、同じ次数でも放射輝度そのものはまだ大きくずれています。" %}

下のウィジェットで実際に操作できます。左の球は空・地面・円盤状の太陽の厳密な放射照度で、右の球はその SH 近似で照らされています。下には環境とその SH 再構成が同じ次数で表示されており、*放射照度*よりずっと低い次数で*放射輝度*にリンギングやにじみが出ることがわかります。

{% include widget.liquid name="graphics-sh-lighting" height="560" caption="SH ライティング。キャンバス上を（マウスや指で）ドラッグすると太陽が動きます。SH の次数 l_max（0〜3）と太陽の角半径（全パワーは一定）を選べます。左：厳密な放射照度、右：l_max までのバンドによる SH 放射照度。下：環境の放射輝度とその SH 再構成。次数 2 では 2° の太陽でも 2 つの球の差は数パーセント以内ですが、再構成した環境はリンギングを伴うぼやけた塊です。Â₃ = 0 なので、次数 3 にしても球は何も変わりません。" %}

**実践でのプローブ。** プローブはグリッド状に、あるいは手作業で配置します。シェーディングする点は近くのプローブを補間し（グリッドならトライリニア補間）、チャンネルあたり 9 回の積和で $E(\mathbf{n})$ を評価します。実行時に更新するプローブなら、光源が変わったときに再ライティングできます。典型的な失敗は**光漏れ**で、壁の外のプローブが部屋の中を照らしてしまいます。

### 5.3 DDGI：レイトレースする放射照度プローブ

**Dynamic Diffuse Global Illumination**（DDGI。Majercik、Guertin、Nowrouzezahrai、McGuire 2019）は、プローブグリッドを完全に動的にし、光漏れにも強くします。

- 毎フレーム、各プローブは決まった本数のレイを（ハードウェアで）トレースしてヒット点をシェーディングします。このときヒット点での前フレームのプローブ放射照度も使うので、バウンスがフレームを重ねるごとに蓄積します。
- 結果は、プローブごとの小さな**八面体**放射照度テクスチャ（1.2 節）に、ヒステリシス（hysteresis、指数移動平均）付きでブレンドされます。
- 各プローブは、方向ごとにジオメトリまでの**距離**の平均と 2 乗平均も保存します。シェーディング時には **チェビシェフ判定**（2.3 節の VSM と同じ不等式）で、シェーディング点から遮蔽されていそうなプローブの重みを下げます。これで壁越しの光漏れのほとんどを防げます。

### 5.4 ボクセルコーントレーシング

**ボクセルコーントレーシング**（voxel cone tracing、Crassin ら 2011）は、まずシーンを 3 次元テクスチャ（元論文ではスパースボクセル八分木）にボクセル化し、不透明度と直接光による出射放射輝度を保存して、3 次元のミップピラミッドを作ります。表面上の点から出る開き角 $\alpha$ の**コーン**は、その軸に沿ってステップしながらトレースします。距離 $t$ でのコーンの直径は $d = 2t\tan(\alpha/2)$ なので、トレーサーはボクセルサイズが一致するミップレベル $\log_2(d/v_0)$ をサンプリングし、色と不透明度を手前から奥へ蓄積します。これはまさに[第 10 回]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }})のアルファ合成です。数本の太いコーンで拡散 GI を、1 本の細いコーンで光沢反射を集めます。代償はボクセル化のコスト、メモリ、そして粗いミップレベルで薄い壁を光が漏れることです。

### 5.5 SDF とサーフェスキャッシュによる GI、そして ReSTIR GI

さらに 2 つの系統が現在のエンジンを動かしています。

- メッシュの**符号付き距離場**（signed distance fields、SDF）を使うと、GI や影のための高速なソフトウェアレイマーチングができます。**サーフェスキャッシュ**（surface cache）は、メッシュの周りの簡略化された「カード」（cards）にライティングを保存します。この 2 つが Unreal Engine 5 の Lumen の中核で、[graphics-engine 04]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}) で説明しています。
- ハードウェアレイトレーシングがあれば、**ReSTIR GI** がピクセルとフレームをまたいで 1 バウンスの間接パスをリサンプリングします。[第 06 回]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})で説明したとおりです。

## 6. 時間方向の再利用を深く

第 06 回では TAA と時間方向の蓄積を紹介しました。本章のほとんどの効果（SSAO、SSR、PCSS、ボリュメトリックフォグ、プローブ）は、今では少ないサンプル数で*ノイジーに*レンダリングし、前のフレームを再利用してきれいにしています。そこで、この仕組みを正確に述べておきます。

1. **再投影。** ワールド位置 $\mathbf{x}$（深度から求める）のピクセルの、前フレームでの位置は、前フレームのビュー・射影行列を使って $$\mathbf{p}_{t-1} = P_{t-1}V_{t-1}\mathbf{x}$$ です。動く物体では、代わりにジオメトリパスで**モーションベクトル**（motion vector）のターゲットを書き、ピクセルごとのスクリーン空間の変位を保存します。
2. **ディスオクルージョン**（disocclusion）。$$\mathbf{p}_{t-1}$$ での前フレームの深度や法線が一致しない（あるいは $$\mathbf{p}_{t-1}$$ が画面外）なら、その履歴は別の表面のものなので捨てる必要があります。そのピクセルは、高いブレンド重みで蓄積をやり直します。
3. **蓄積。** $c_t = \alpha\,x_t + (1-\alpha)\,c_{t-1}$、つまり指数移動平均です。重みはおよそ $1/\alpha$ フレームで減衰し、平衡状態でのノイズの分散は $(2-\alpha)/\alpha$ フレームの単純平均と同じです。$\alpha = 0.1$ なら 19 フレームです。
4. **履歴の補正。** 照明の変化や不完全な再投影は、古い履歴を残し、ゴースト（ghosting）として現れます。近傍の**クランプ**（第 06 回）は、履歴を現在の 3 × 3 近傍の最小・最大ボックスに制限します。**分散クリッピング**（variance clipping、Salvi 2016）は、代わりに近傍の平均と標準偏差から $\mu \pm \gamma\sigma$ のボックスを作ります。通常は輝度と色度が無相関になる YCoCg 色空間で行います。そして各チャンネルを独立にクランプする代わりに、$\mu$ へ向かう直線に沿って履歴を*クリップ*します。これで色ずれを防げます。近傍がノイジーなときは、この統計的なボックスのほうが最小・最大ボックスよりタイトです。

```python
import numpy as np

def variance_clip(history, neigh, gamma=1.0):
    """history: (3,) colour; neigh: (k, 3) current-frame neighbourhood (YCoCg recommended)."""
    mu, sigma = neigh.mean(0), neigh.std(0)
    half = gamma * sigma + 1e-6
    d = history - mu
    t = np.max(np.abs(d) / half)            # > 1 means outside the box
    return history if t <= 1 else mu + d / t   # move toward mu until on the box surface

neigh = np.array([[0.4, 0, 0], [0.5, 0, 0], [0.6, 0, 0]] * 3)
print(variance_clip(np.array([0.9, 0.0, 0.0]), neigh))   # [0.5816 0. 0.]  (= 0.5 + 1 sigma)
```

## 7. HDR、露出、トーンマッピング

### 7.1 線形 HDR ワークフロー

ライティングは**線形**の放射測定単位で計算しなければなりません。値は影の中の $10^{-3}$ から太陽円盤の $10^{5}$ まで広がり、浮動小数点（RGBA16F）のターゲットに保存します。sRGB で作られたテクスチャは読み込み時に線形にデコードします（第 03 回）。最終画像はディスプレイの範囲に収める必要があり、それには 3 つのステップが必要です。

1. **露出**（exposure）：$2^{EV}$ を掛けて、シーンの中間グレーが 0.18 付近に来るようにします。**自動露出**は、対数平均輝度 $\bar L = \exp\big(\tfrac{1}{N}\sum\ln(\delta + L_i)\big)$（Reinhard ら 2002。$L_i$ は $i$ 番目のピクセルの輝度、$N$ はピクセル数、$\delta$ は $\ln 0$ を避けるための小さな定数）か、最も暗い数パーセントと最も明るい数パーセントを無視した輝度ヒストグラムを計算します。そして目のように、時間をかけて滑らかに順応させます。
2. **トーンマッピング**（tone mapping）：$[0, \infty)$ を $[0, 1)$ に圧縮するカーブです。ハイライトには緩やかなショルダー（shoulder）を、必要なら影にはトウ（toe）を持たせます。
3. **出力エンコード**：SDR ディスプレイには sRGB の伝達関数、HDR10 には PQ を使います。

### 7.2 トーンマッピング演算子

- **Reinhard**：$y = x/(1+x)$、最も単純な演算子です。*拡張*形 $y = x(1 + x/L_w^2)/(1+x)$ は、指定した白色点 $L_w$ を 1 に写します。**数値例**：中間グレー $0.18 \mapsto 0.153$。
- **フィルミック（Hable、*Uncharted 2*）**：トウとショルダーを持つ有理関数のカーブで、
  $f(x) = \frac{x(Ax + CB) + DE}{x(Ax+B) + DF} - \frac{E}{F}$、
  を $f(W)$ で正規化します（元の講演では入力にあらかじめ露出バイアス 2.0 も掛けており、下のコードと図にはそれが含まれています）。定数は $A=0.15$、$B=0.50$、$C=0.10$、$D=0.20$、$E=0.02$、$F=0.30$、白色点は $W = 11.2$ です。
- **ACES**：Academy Color Encoding System は、映画のための参照レンダリング変換と出力変換を定めています。ゲームでは Narkowicz（2016）による 1 行のフィット $y = \frac{x(2.51x + 0.03)}{x(2.43x + 0.59) + 0.14}$ をチャンネルごとに適用することが多いです。コントラストは強いですが、明るい飽和色は色相がずれて彩度が落ちます（飽和したオレンジは黄色に寄ります）。各チャンネルが別々に飽和するからです。**数値例**：$0.18 \mapsto 0.267$。
- **AgX**（Blender 4.0 でビュー変換として導入）は、慎重に選んだ、わずかに彩度を落とした作業空間でカーブを適用します。そのため非常に明るい飽和した光源が、純色に張り付くのではなく、滑らかに白へ移っていきます。
- **Khronos PBR Neutral**（2024 年公開）は製品の可視化のために設計されています。中立的な照明の下でマテリアルがアルベドどおりに見えるよう、約 0.8 までベースカラーに手を付けず、ハイライトだけを圧縮して白へ向けて彩度を落とします。

```python
import numpy as np

def reinhard(x): return x / (1 + x)

def hable(x):
    A, B, C, D, E, F, W = 0.15, 0.50, 0.10, 0.20, 0.02, 0.30, 11.2
    f = lambda v: (v * (A * v + C * B) + D * E) / (v * (A * v + B) + D * F) - E / F
    return f(2.0 * x) / f(W)                   # 2.0 = exposure bias used in the original talk

def aces_fit(x):
    return np.clip(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)

def srgb_encode(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * x ** (1 / 2.4) - 0.055)

for f in (reinhard, hable, aces_fit):
    print(f.__name__, np.round(srgb_encode(f(np.array([0.18, 1.0, 4.0, 16.0]))), 3))
print(round(float(srgb_encode(0.18)) * 255))   # 118: middle grey in 8-bit sRGB
```

下の図は、これらの演算子のグレー入力に対する応答を、(a) 線形軸、(b) sRGB エンコード後の対数軸で並べたものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/11-tonemap-curves.svg" caption="グレー入力に対するトーンマッピングカーブ。(a) 線形軸：クランプ（点線）は 1 を超える値をすべて切り捨て、Reinhard はゆっくり 1 に近づき、拡張 Reinhard は L_w = 4 で 1 に達します。Hable と ACES フィットはトウと急な中間調を持ち、PBR Neutral は約 0.8 までは恒等写像（から小さなオフセット 0.04 を引いたもの）に沿い、その後ショルダーに入ります。(b) 同じカーブを sRGB エンコードし、シーン輝度 5 桁にわたる対数軸で描いたもの。点線は中間グレー 0.18 を示します。中間グレー付近のコントラストが最も強いのは ACES フィットで、ハイライトのディテールを最も残すのは Reinhard です。" %}

下のウィジェットは、6 つの色相がそれぞれ 12 段にわたって明るくなる HDR テストチャートに、これらの演算子を適用します。飽和した色が明るくなるにつれてどうなるかを見てください。

{% include widget.liquid name="graphics-tonemap" height="440" caption="トーンマッピングエクスプローラー。チャートの各行は 1 つの色相で、中間グレーの 6 段下から 6 段上まで（左から右へ）変化します。スライダーで露出（EV）を、メニューで演算子を選びます。下のカーブは、グレー入力に対する演算子の応答です（破線：単純なクランプ）。クランプ（色相が黄色やシアンに急に張り付く）、ACES フィット（強いコントラスト、明るい赤や青の色相ずれ）、PBR Neutral（色が保たれ、その後なめらかに白へ移る）を比べてみてください。" %}

### 7.3 sRGB の伝達関数と HDR 出力

ディスプレイや 8 ビット画像は光に対して線形ではありません。**sRGB** エンコード（保存や SDR 出力に使う「OETF」）は

$$
V = \begin{cases} 12.92\,L & L \le 0.0031308\\ 1.055\,L^{1/2.4} - 0.055 & L > 0.0031308 \end{cases},
$$

で、線形のトウとべき乗カーブをつないだものです。この組み合わせは $L^{1/2.2}$ に近いですが、同じではありません。目的は知覚的なものです。目は*相対的な*変化に敏感なので、暗部ではコード値を密に並べるべきです。8 ビットの線形エンコードではコード値のほとんどがハイライトに費やされ、影の中で目に見えるバンディングが出ます。**数値例**：中間グレー 0.18 は $V = 1.055 \cdot 0.18^{1/2.4} - 0.055 = 0.461$、つまり 255 中の 118 にエンコードされます。線形で保存すると 46 です。

下の図の (a) は sRGB カーブと純粋なべき乗の比較、(b) は 8 ビットのリニアと sRGB のコードの相対ステップ幅の比較です。

{% include blog_figure.liquid path="assets/img/blog/graphics/11-srgb.svg" caption="(a) sRGB エンコードのカーブを、純粋な 2.2 乗および恒等写像と比べたもの。挿入図は 0.0031308 以下の線形区間で、0 での傾きが無限大になるのを防いでいます。(b) 隣り合う 8 ビットコード間の相対的な刻み ΔL/L：線形エンコードでは暗部で 10〜100% の刻み（目に見えるバンディング）になり、sRGB では範囲の大部分で数パーセント以内に収まります（点線は参考の 1%）。" %}

**線形ワークフロー**の規則は次のとおりです。

- フィルタリングとライティングの前に sRGB テクスチャをデコードします（`*_SRGB` フォーマットなら GPU が行います）。
- ライティングとブレンドは線形空間で行います。
- トーンマッピングも線形空間で行います。
- エンコードは最後に 1 回だけ行うか、`*_SRGB` のレンダーターゲットに書いてハードウェアにエンコードさせます。

sRGB 空間でブレンドしたり、カーブを 2 回適用したりすると、典型的な「暗すぎて彩度が高すぎる」見た目になります。

**HDR 出力**は最後のステップを置き換えます。**HDR10** は **PQ** 伝達関数（SMPTE ST 2084）を使います。これは最大 10,000 cd/m² までの*絶対*輝度をエンコードし、広い **Rec. 2020** 原色と組み合わせてチャンネルあたり 10 ビットで表します。レンダラーは 1.0 ではなく、ディスプレイの実際のピーク輝度（よくあるのは 600〜1500 nit）に向けてトーンマッピングします。作業原色（多くは Rec. 709/sRGB、ときに ACEScg のような広い空間）から Rec. 2020 へ変換し、UI は「ペーパーホワイト」（paper white）の輝度で合成します。Windows の scRGB（sRGB 原色の線形 FP16 で、1 を超える値を許す）は、PQ エンコードを OS に任せる別のスワップチェーン形式です。

## 8. 性能の考え方

何が*可能*かはアルゴリズムが決めますが、それが 16 ms に収まるかどうかは GPU の使い方で決まります。

- **帯域と ALU（ルーフライン、roofline）。** あるパスの算術強度（転送 1 バイトあたりの FLOP 数）が、GPU のピーク演算性能とピーク帯域の比より低ければ**帯域律速**、高ければ**演算律速**です。**数値例**：20 TFLOP/s、500 GB/s の仮想的な GPU（境目は 40 FLOP/バイト）を考えます。1080p の全画面パスでピクセルあたり 16 バイトを読み 100 FLOP を行うなら、算術強度は約 6 FLOP/バイトなので帯域律速で、少なくとも $33\ \text{MB}/500\ \text{GB/s} \approx 66\ \mu s$ かかります。G-buffer の読み込みを半分にすれば効きますが、計算を最適化しても効きません。
- **オーバードロー。** シェーディングした後に上書きされるフラグメントは無駄な仕事です。手前から奥へのソート、深度プリパス、遅延シェーディング、可視性バッファ（[graphics-engine 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})）はどれもこれに対処します。
- **占有率（occupancy）とレイテンシの隠蔽。** GPU は、常駐する多数の warp / wave を切り替えることでメモリのレイテンシを隠します。レジスタや共有メモリを多く使うシェーダーでは常駐できる wave が減り、ストールが表に出ます。光源やサンプルの大きなループ、大きなローカル配列、分岐の発散がよくある原因です。
- **解像度とレート。** 多くの効果（AO、SSR、ボリュメトリックフォグ、雲）は半分や 4 分の 1 の解像度で実行し、深度を考慮したフィルタでアップサンプリングします。可変レートシェーディングと時間方向のアップスケーリング（第 06 回）は、これをさらに推し進めます。
- **推測せず計測する。** **RenderDoc**（オープンソースでクロス API のフレームキャプチャ。すべてのドローコール、テクスチャ、パイプラインステートを調べられる）、**PIX**（Windows と Xbox の Direct3D 12 用で、GPU タイミングと占有率を表示）、**NVIDIA Nsight Graphics**（ハードウェアカウンタ。「GPU Trace」でどのユニットがボトルネックかを示す）、さらに AMD の Radeon GPU Profiler や Xcode の Metal ツールがあります。自分のエンジンでは各パスをタイムスタンプクエリで囲んでおくと、性能の劣化がすぐに見えます。

## 試してみよう

- 上の 2 つのウィジェット：SH ライティング（2° の太陽で、次数 1、次に 2 を試す）とトーンマッピング（露出を +3 EV まで上げ、クランプ、次に PBR Neutral で比べる）。
- [Interactive Lab]({{ '/' | relative_url }}#lab) のパストレーサーは収束した正解を見せてくれます。本章の近似はどれも、そのわずかな時間でそれを真似ようとしているのです。

## 代表的な論文

| 論文 | 発表先 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Reeves, Salesin & Cook, *Rendering Antialiased Shadows with Depth Maps* | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37401.37435) | パーセンテージクローサーフィルタリング（PCF） |
| Saito & Takahashi, *Comprehensible Rendering of 3-D Shapes* | SIGGRAPH | 1990 | [DOI](https://doi.org/10.1145/97880.97901) | 遅延シェーディングの背後にある G-buffer のアイデア |
| Ramamoorthi & Hanrahan, *An Efficient Representation for Irradiance Environment Maps* | SIGGRAPH | 2001 | [DOI](https://doi.org/10.1145/383259.383317) | 9 個の SH 係数で拡散ライティングを再現 |
| Sloan, Kautz & Snyder, *Precomputed Radiance Transfer for Real-Time Rendering in Dynamic, Low-Frequency Lighting Environments* | SIGGRAPH | 2002 | [DOI](https://doi.org/10.1145/566570.566612) | 影と相互反射を含む、SH ベースの事前計算された輸送 |
| Reinhard, Stark, Shirley & Ferwerda, *Photographic Tone Reproduction for Digital Images* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566575) | 対数平均のキー、Reinhard 演算子 |
| Fernando, *Percentage-Closer Soft Shadows* | SIGGRAPH Sketches | 2005 | [DOI](https://doi.org/10.1145/1187112.1187153) | ブロッカー探索と半影の推定 |
| Donnelly & Lauritzen, *Variance Shadow Maps* | I3D | 2006 | [DOI](https://doi.org/10.1145/1111411.1111440) | モーメントとチェビシェフ不等式によるフィルタ可能な影 |
| Zhang, Sun, Xu & Lun, *Parallel-Split Shadow Maps for Large-Scale Virtual Environments* | VRCIA | 2006 | [DOI](https://doi.org/10.1145/1128923.1128975) | カスケードと実用分割方式 |
| Mittring, *Finding Next Gen: CryEngine 2* | SIGGRAPH Courses | 2007 | [DOI](https://doi.org/10.1145/1281500.1281671) | スクリーン空間アンビエントオクルージョンを導入 |
| Annen, Mertens, Seidel, Flerackers & Kautz, *Exponential Shadow Maps* | Graphics Interface | 2008 | [GI](https://graphicsinterface.org/proceedings/gi2008/gi2008-20) | フィルタ可能な影のための指数ワープ |
| Bavoil, Sainz & Dimitrov, *Image-Space Horizon-Based Ambient Occlusion* | SIGGRAPH Talks | 2008 | [DOI](https://doi.org/10.1145/1401032.1401061) | 深度バッファからの地平線角 |
| Lauritzen, Salvi & Lefohn, *Sample Distribution Shadow Maps* | I3D | 2011 | [DOI](https://doi.org/10.1145/1944745.1944761) | 見えている深度範囲にカスケードを合わせる |
| Crassin, Neyret, Sainz, Green & Eisemann, *Interactive Indirect Illumination Using Voxel Cone Tracing* | CGF (PG) | 2011 | [DOI](https://doi.org/10.1111/j.1467-8659.2011.02063.x) | ボクセルのミップピラミッドでのコーントレースによるリアルタイム GI |
| Olsson, Billeter & Assarsson, *Clustered Deferred and Forward Shading* | HPG | 2012 | [DOI](https://doi.org/10.2312/EGGH/HPG12/087-096) | 数千の光源のための 3 次元ライトクラスター |
| Cigolle, Donow, Evangelakos, Mara, McGuire & Meyer, *A Survey of Efficient Representations for Independent Unit Vectors* | JCGT | 2014 | [JCGT](https://jcgt.org/published/0003/02/01/) | 八面体法線エンコードとその誤差解析 |
| McGuire & Mara, *Efficient GPU Screen-Space Ray Tracing* | JCGT | 2014 | [JCGT](https://jcgt.org/published/0003/04/04/) | SSR のための透視補正された DDA マーチング |
| Peters & Klein, *Moment Shadow Mapping* | I3D | 2015 | [DOI](https://doi.org/10.1145/2699276.2699277) | 4 つのモーメントで光漏れを大幅に削減 |
| Jimenez, Wu, Pesce & Jarabo, *Practical Realtime Strategies for Accurate Indirect Occlusion* | Activision Tech. Report ATVI-TR-16-01 | 2016 | [レポート](https://research.activision.com/publications/archives/atvi-tr-16-01practical-realtime-strategies-for-accurate-indirect-occlusion) | GTAO：解析的な地平線積分、マルチバウンス AO |
| Majercik, Guertin, Nowrouzezahrai & McGuire, *Dynamic Diffuse Global Illumination with Ray-Traced Irradiance Fields* | JCGT | 2019 | [JCGT](https://jcgt.org/published/0008/02/01/) | チェビシェフ可視判定付きの DDGI プローブ |

論文はないものの影響の大きい講演や仕様もあります。Salvi の *An Excursion in Temporal Supersampling*（GDC 2016、分散クリッピングを導入）、Hable の *Uncharted 2: HDR Lighting*（GDC 2010、フィルミックカーブ）、Narkowicz の [ACES filmic tone mapping curve](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/)（2016）、そして [Khronos PBR Neutral](https://github.com/KhronosGroup/ToneMapping) の仕様（2024）です。

## 学習リソース

- Akenine-Möller、Haines、Hoffman ら『Real-Time Rendering』第 4 版（2018）：影、AO、グローバルイルミネーション、トーンマッピングの章があり、参考文献も網羅的です。
- **GAMES202**（Lingqi Yan）：高品質なリアルタイムレンダリング。影（PCSS、VSM、MSM）、SH による環境ライティング、SSAO/SSDO/SSR、リアルタイム GI を扱います。講義は中国語、スライドは英語です。
- SIGGRAPH **Advances in Real-Time Rendering** コースのアーカイブ [advances.realtimerendering.com](https://advances.realtimerendering.com/)：本章の技法の多くは、エンジンチームによってここで最初に発表されました。
- [LearnOpenGL](https://learnopengl.com/)：遅延シェーディング、SSAO、HDR、PBR の章がわかりやすく、コード付きです。
- Google の [Filament のドキュメント](https://google.github.io/filament/Filament.html)：プロダクション品質の PBR エンジンの設計ノートで、露出、トーンマッピング、イメージベースドライティングを含みます。
- [RenderDoc](https://renderdoc.org/)：フレームをキャプチャして、実際のゲームや自分のレンダラーのフレーム構造を学べます。

## 演習

1. コサイン重み付きの AO の定義から GTAO のスライス積分 $a = \tfrac12(\cos^2 e_1 + \cos^2 e_2)$ を導き、3 節の高さ場で、4、16、64 サンプルのモンテカルロ推定と数値的に比べてください。

   <details markdown="1"><summary>ヒント</summary>
   スライス座標では $d\boldsymbol{\omega} = \vert\sin\theta\vert\,d\theta\,d\phi$ なので、重みは $\cos\theta\vert\sin\theta\vert = \tfrac12\vert\sin 2\theta\vert$ です。両側で 0 から $h_i = \pi/2 - e_i$ まで積分します。
   </details>

2. $n = 0.05$、$f = 500$、$N = 4$ カスケードのとき、最初のカスケードが 2 m で終わる $\lambda$ を求めてください。各カスケードでの最悪のテクセル / ピクセル比はいくつですか？

3. カーネルの割合 $f$ を覆う深度 $z_1$ の平面遮蔽物が 1 枚と、深度 $t$ の受光平面（カーネルの残り）がある場合、VSM の上界が厳密であることを示してください。次に、遮蔽物が 2 枚のときにどこで破綻するかを示してください。

   <details markdown="1"><summary>ヒント</summary>
   深度 $z_1$（割合 $f$）と $t$（割合 $1-f$）について $\mu$ と $\sigma^2$ を計算し、$\sigma^2/(\sigma^2 + (t-\mu)^2)$ に代入すると $1-f$ になります。遮蔽物が 2 枚だと深度の分布は 3 つの離散値（遮蔽物 1、遮蔽物 2、受光面）からなり、2 つのモーメントだけではもう決まらないため、上界が緩くなります。
   </details>

4. SH のコードを $l \le 4$ のバンド（係数 25 個、$\hat A_4 = -\pi/24$ を使用）に拡張し、半径 1° の太陽がある環境で放射照度の誤差がどれだけ下がるかを測ってください。チャンネルあたり 16 個多い係数に見合いますか？

5. 履歴の色が飽和した赤で、現在の近傍が灰青色のとき、YCoCg と RGB の両方で分散クリッピングを実装してください。クリップ後の色を比べ、違いを説明してください。

   <details markdown="1"><summary>ヒント</summary>
   RGB では、チャンネル同士の相関が強い空間で軸に平行なボックスになるので、近傍に一度も現れなかった色まで含んでしまいます。YCoCg は輝度と色度の相関をなくすので、ボックスが近傍により密着します。
   </details>

次回は[微分可能レンダリングと逆レンダリング]({{ '/blog/2026/graphics-12-differentiable-and-inverse-rendering/' | relative_url }})です。これまでに作ってきたすべてを通して勾配をとる方法と、それによってレンダリングが最適化問題に変わる仕組みを扱います。
