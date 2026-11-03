---
layout: post
title: "ボリュームと関与媒質：霧・煙・雲・空・肌"
date: 2026-10-27 09:10:00+0900
description: "消散係数とアルベド、Beer-Lambert 透過率、放射伝達方程式、位相関数とそのサンプリングコード、レイマーチング、delta / ratio tracking、ボリュームパストレーシング、OpenVDB、リアルタイムの霧・空・雲、表面下散乱、そして NeRF のアルファ合成が同じ積分の数値求積である理由。"
categories: graphics
tags: [volume-rendering, participating-media, phase-function, delta-tracking, subsurface-scattering, sky]
series: graphics
series_order: 10
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

これまでのシリーズでは、どのレイも真空中を進み、光と相互作用するのは表面だけでした。現実のシーンは**関与媒質**（participating media、光の輸送に関与するボリューム）に満ちています。霧、煙、炎、雲、空を色づける大気、濁った水、そして肌・大理石・牛乳の内部です。こうした媒質の中では、光は境界だけでなく*レイに沿ったあらゆる場所*で吸収・散乱されます。本章では、[第 04 回]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})のレンダリング方程式と[第 05 回]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})のモンテカルロの道具立てをボリュームへ拡張します。これはニューラルレンダリングの土台となる物理でもあります。[NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) のボリュームレンダリング積分も [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) のアルファブレンディングも、ここで導く内容の特殊な場合です（11 節）。

## 前提知識

- 放射輝度、BRDF、レンダリング方程式（[第 04 回]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})）。
- モンテカルロ積分、重点的サンプリング（importance sampling）、次イベント推定（next event estimation）、ロシアンルーレット（Russian roulette）。いずれも[第 05 回]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})で扱いました。
- 基本的な確率：指数分布、逆 CDF サンプリング、ポアソン過程（必要な箇所で復習します）。

## 1. 媒質の中で光に何が起こるか

微小な粒子の雲を細い光線束が通り抜ける様子を思い浮かべてください。短い距離 $dt$ の間に、光線束の光子数を変える過程が 4 つあります。前の 2 つは光子を取り除き、後の 2 つは光子を光線束に加えます。

1. **吸収**（absorption）：粒子が光子を飲み込み、そのエネルギーを熱に変えます。単位長さあたりの確率が**吸収係数**（absorption coefficient）$\sigma_a(\mathbf{x})$ で、単位は 1/m です。
2. **外向き散乱**（out-scattering）：粒子が光子を別の方向へ曲げ、光子は*この*光線束から出ていきます。単位長さあたりの確率は**散乱係数**（scattering coefficient）$\sigma_s(\mathbf{x})$ です。
3. **内向き散乱**（in-scattering）：他の光線束の光子が曲げられて、この光線束に*入って*きます。ヘッドライトが霧を照らすと霧が光って見えるのはこのためです。
4. **放射**（emission）：媒質そのものが発光します（炎や高温のガス）。放射される放射輝度を $L_e$ とします。

吸収と外向き散乱はどちらも光線束からエネルギーを取り除くので、まとめて**消散係数**（extinction coefficient、減衰係数とも）とします。

$$
\sigma_t = \sigma_a + \sigma_s .
$$

派生量が 2 つあり、あらゆる場面で使います。**単一散乱アルベド**（single-scattering albedo）$\rho = \sigma_s/\sigma_t \in [0,1]$ は、相互作用が吸収ではなく散乱である確率です。雲では $\rho \approx 0.99$ 以上、煤ではほぼ $0$ です。**平均自由行程**（mean free path）$1/\sigma_t$ は相互作用と相互作用の間の平均距離です。係数は「単位長さあたり」の量なので、値はシーンの単位に依存します。$\sigma_t = 0.05\ \text{m}^{-1}$ は薄い霧（平均自由行程 20 m）、$\sigma_t = 50\ \text{m}^{-1}$ は濃い雲（2 cm）です。

物理的には $\sigma = n\,C$、つまり粒子の数密度 $n$ と散乱断面積 $C$ の積です。レンダラーでは通常、**密度**場 $d(\mathbf{x})$ を保存し、マテリアルごとの係数を掛けて $\sigma_t(\mathbf{x}) = d(\mathbf{x})\,\sigma_t^{\text{mat}}$ とします。係数は波長に依存し得ます（ここでは RGB の 3 成分）。空が青い理由はここにあります（9 節）。

## 2. 透過率と Beer-Lambert の法則

### 2.1 導出

レイ $\mathbf{x}(t) = \mathbf{o} + t\boldsymbol{\omega}$ に沿って放射輝度 $L$ の光線束を追います。ここでは内向き散乱と放射は無視します。1 ステップ $dt$ の間に、光線束の割合 $\sigma_t\,dt$ が取り除かれます。

$$
dL = -\sigma_t(t)\,L\,dt
\quad\Longrightarrow\quad
\frac{dL}{L} = -\sigma_t(t)\,dt
\quad\Longrightarrow\quad
\ln L(t) - \ln L(0) = -\int_0^t \sigma_t(s)\,ds .
$$

指数をとると、生き残る割合、つまり**透過率**（transmittance）が得られます。

$$
T(t) = \frac{L(t)}{L(0)} = \exp\!\big(-\tau(t)\big),
\qquad
\tau(t) = \int_0^t \sigma_t(s)\,ds .
$$

$\tau$ は**光学的深さ**（optical depth、光学的厚さとも）です。レイが何個分の平均自由行程を横切ったかを数える無次元量です。**均質**（homogeneous）な媒質（$\sigma_t$ が一定）では $\tau = \sigma_t t$ となり、**Beer-Lambert の法則** $T = e^{-\sigma_t t}$ が得られます。

以降のすべてに効いてくる性質が 2 つあります。

- **乗法性**：光学的深さは足し算できるので、$T(0 \to b) = T(0 \to a)\,T(a \to b)$ が成り立ちます（$T(a \to b)$ はレイの $a$ から $b$ までの区間の透過率です）。これにより、レイに沿って進みながら $T$ を 1 ステップずつ更新できます。
- **順序に依存しない**：効くのは $\sigma_t$ の積分だけで、密度がレイ上のどこにあるかは関係ありません。

下の図のとおり、どの曲線も $d = 1/\sigma_t$ で $e^{-1}$ まで下がり、対数軸では直線になります。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-beer-lambert.svg" caption="4 つの消散係数に対する Beer-Lambert 透過率。(a) 線形軸：点は平均自由行程 1 つ分 d = 1/σt を示し、どの曲線もそこで e⁻¹ ≈ 0.37（破線）を通ります。(b) 対数軸：指数減衰は傾き −σt の直線になり、σt を 2 倍にすると傾きも 2 倍になります。" %}

**数値例。** $\sigma_t = 0.5\ \text{m}^{-1}$ の霧では、$d = 2$ m 進むと $T = e^{-1} = 0.368$、10 m 進むと $T = e^{-5} = 0.0067$ です。10 m 先の物体が見えなくなるのはこのためです。次に、$\sigma_t = 0.2, 1.0, 0.4$ の 1 m の区間 3 つからなる不均質なレイを考えます。$\tau = 0.2 + 1.0 + 0.4 = 1.6$ で、$T = e^{-1.6} = 0.202$ です。区間の順番を入れ替えても $T$ は変わりません。

### 2.2 不均質な媒質

煙や雲では $\sigma_t(\mathbf{x})$ が場所によって変わり、$\tau$ は数値的に評価するしかない積分になります。下の図は、山が 3 つある 1 次元の密度と、その光学的深さ、透過率を示します。$T$ の低下の大部分は山の中で起きます。*平均*の消散が同じ均質媒質は $T(10)$ で一致しますが、途中の経路は異なります。つまり密度を平均すると、光が*どこで*減衰するかという情報が失われます。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-heterogeneous-transmittance.svg" caption="不均質なレイ。(a) 山が 3 つある消散 σt(t)。破線は平均、点線は最大値（後で上界 majorant として使います）。(b) 透過率 T = e^−τ（紫）は密度の高い場所で階段状に下がります。光学的深さ τ(t)（灰、右軸）はその累積積分です。平均が同じ均質媒質の曲線（橙の破線）は終点 t = 10 で合流しますが、途中の経過は大きく異なります。" %}

```python
import numpy as np

def sigma_t(t):
    """Heterogeneous extinction along a ray of length 10 (1/m)."""
    return (0.1 + 1.0 * np.exp(-((t - 2.0) / 0.45) ** 2)
            + 0.6 * np.exp(-((t - 5.2) / 0.8) ** 2)
            + 1.6 * np.exp(-((t - 7.4) / 0.25) ** 2))

t = np.linspace(0.0, 10.0, 10001)
s = sigma_t(t)
tau = np.concatenate([[0.0], np.cumsum(0.5 * (s[1:] + s[:-1]) * np.diff(t))])  # trapezoid rule
T = np.exp(-tau)
print(f"tau(10) = {tau[-1]:.3f}, T(10) = {T[-1]:.4f}")   # tau(10) = 3.357, T(10) = 0.0348
print(np.exp(-(0.2 + 1.0 + 0.4)))                        # 0.2019, the three-segment example
```

ガウス型の山の積分はそれぞれ 振幅 × 幅 × $\sqrt{\pi}$ なので、正確な光学的深さは $1.0 + (0.45 + 0.48 + 0.40)\sqrt{\pi} = 3.357$ となり、数値求積と一致します。

## 3. 放射伝達方程式

4 つの過程をまとめましょう。$L(\mathbf{x}, \boldsymbol{\omega})$ を、点 $\mathbf{x}$ を方向 $\boldsymbol{\omega}$ に進む放射輝度とします。$\boldsymbol{\omega}$ に沿った単位長さあたりの $L$ の変化を表すのが**放射伝達方程式**（radiative transfer equation、RTE）です。

$$
(\boldsymbol{\omega}\cdot\nabla) L(\mathbf{x},\boldsymbol{\omega})
= \underbrace{-\sigma_t(\mathbf{x})\,L(\mathbf{x},\boldsymbol{\omega})}_{\text{absorption + out-scattering}}
+ \underbrace{\sigma_a(\mathbf{x})\,L_e(\mathbf{x},\boldsymbol{\omega})}_{\text{emission}}
+ \underbrace{\sigma_s(\mathbf{x}) \int_{S^2} p(\boldsymbol{\omega}', \boldsymbol{\omega})\, L(\mathbf{x},\boldsymbol{\omega}')\, d\boldsymbol{\omega}'}_{\text{in-scattering}} .
$$

$S^2$ は方向の球面、$\boldsymbol{\omega}'$ は入射光の進行方向です。**位相関数**（phase function）$p(\boldsymbol{\omega}', \boldsymbol{\omega})$（4 節）は、$\boldsymbol{\omega}'$ に進んでいた光が散乱後に $\boldsymbol{\omega}$ へ進む確率密度（ステラジアンあたり）で、表面における BRDF の役割を果たします。放射を $\sigma_a L_e$ と書くのは pbrt の慣習に従ったもので、よく吸収する媒質はよく放射もします。内向き散乱による放射輝度を次のように略記します。

$$
L_s(\mathbf{x},\boldsymbol{\omega}) = \int_{S^2} p(\boldsymbol{\omega}', \boldsymbol{\omega})\, L(\mathbf{x},\boldsymbol{\omega}')\, d\boldsymbol{\omega}' .
$$

### 3.1 積分形：ボリュームレンダリング方程式

RTE はレイに沿った 1 階の線形常微分方程式 $\frac{dL}{dt} = -\sigma_t L + q$ で、ソース項は $q = \sigma_a L_e + \sigma_s L_s$ です。$y' + a y = q$ を解くときと同じく積分因子 $e^{\tau}$ を使って解くと、**ボリュームレンダリング方程式**（volume rendering equation）が得られます。カメラが $\mathbf{o}$ から $\boldsymbol{\omega}$ の方向を見ていて、レイが距離 $d$ で表面に当たり、$\mathbf{x}_t = \mathbf{o} + t\boldsymbol{\omega}$ とすると（光はカメラに向かって方向 $-\boldsymbol{\omega}$ に進むので、左辺は $L(\mathbf{o}, -\boldsymbol{\omega})$ と書きます）、

$$
L(\mathbf{o}, -\boldsymbol{\omega}) =
\int_0^{d} T(t)\,\Big[\sigma_a(\mathbf{x}_t)\,L_e(\mathbf{x}_t) + \sigma_s(\mathbf{x}_t)\,L_s(\mathbf{x}_t, -\boldsymbol{\omega})\Big]\,dt
\;+\; T(d)\,L_{\text{surf}}(\mathbf{x}_d, -\boldsymbol{\omega}),
$$

です。ここで $T(t) = \exp(-\int_0^t \sigma_t\,ds)$ はカメラから測ります。読み方は次のとおりです。*目に届く光は、レイ上の各点で加わる光（それぞれがその点から目までの透過率で減衰したもの）の総和に、区間全体の透過率で減衰した背景表面の光を足したもの*です。Kajiya と Von Herzen（1984）がグラフィックスに導入し、Max（1995）が科学的ボリューム可視化で使われる光学モデルをまとめています。

先に名前を挙げておきたい特殊な場合が 2 つあります。

- **放射と吸収のみ**（$\sigma_s = 0$）：$L = \int T\,\sigma_a L_e\,dt + T(d)L_{\text{surf}}$。再帰がないので 1 パスで計算できます。これはまさに NeRF のモデルです（11 節）。
- **単一散乱**（single scattering）：$L_s$ を、光源から*直接*届き、**シャドウレイ**（shadow ray）の透過率で減衰した光だけで近似します。リアルタイムの霧や多くの空のモデルが計算しているのはこれです（5 節と 9 節）。

完全な方程式は $L_s$ の中に $L$ 自身を含むので再帰的です。これは**多重散乱**（multiple scattering）を表します。雲が灰色で輪郭の硬いものではなく、白く柔らかく見えるのは多重散乱のおかげです（7 節）。

## 4. 位相関数

### 4.1 直感と正規化

光子は散乱した後どこへ行くのでしょうか。どの向きでも統計的に同じ媒質（ランダムな向きの粒子）では、答えは入射の進行方向 $\boldsymbol{\omega}'$ と出射方向 $\boldsymbol{\omega}$ のなす**散乱角**（scattering angle）$\theta$ だけで決まります。つまり $p(\boldsymbol{\omega}', \boldsymbol{\omega}) = p(\cos\theta)$、$\cos\theta = \boldsymbol{\omega}'\cdot\boldsymbol{\omega}$ です。BRDF と違い、位相関数は確率密度なので積分すると 1 になります。

$$
\int_{S^2} p(\boldsymbol{\omega}'\cdot\boldsymbol{\omega})\,d\boldsymbol{\omega} = 2\pi\int_{-1}^{1} p(\mu)\,d\mu = 1, \qquad \mu = \cos\theta .
$$

エネルギーの損失はアルベドが担い、位相関数は担いません。最も単純なのは**等方**（isotropic）散乱 $p = 1/(4\pi)$ で、すべての方向が等しい確率です。

**平均余弦**（mean cosine）$g = \langle\cos\theta\rangle = 2\pi\int_{-1}^{1} \mu\, p(\mu)\,d\mu$ が形を要約します。$g>0$ は**前方散乱**（ほとんどの光子がほぼ直進する。雲や霧では $g \approx 0.8$-$0.9$）、$g<0$ は**後方散乱**、$g=0$ は平均的に等方であることを意味します。

### 4.2 Henyey-Greenstein

グラフィックスで最もよく使われるのは **Henyey-Greenstein**（HG）位相関数で、1941 年に星間塵のために提案されました。

$$
p_{HG}(\mu; g) = \frac{1}{4\pi}\,\frac{1-g^2}{\left(1+g^2-2g\mu\right)^{3/2}}, \qquad -1 < g < 1 .
$$

唯一のパラメータがちょうど平均余弦 $g$ なので、測定値へのフィットが簡単です。$g=0$ で等方になり、前方と後方の散乱の比は $p(1)/p(-1) = \big((1+g)/(1-g)\big)^3$ です。

**数値例**（$g = 0.6$）：$p(0) = \frac{1}{4\pi}\cdot\frac{0.64}{0.16^{3/2}}$ $= 0.0796 \cdot 0.64 / 0.064 = 0.796$、$p(\pi) = 0.0796 \cdot 0.64/2.56^{3/2} = 0.0124$ です。比は $64 = (1.6/0.4)^3$ です。等方散乱の $1/(4\pi) = 0.0796$ と比べてみてください。

下の図の左は $g$ ごとのローブの形、右は後で説明する方法でサンプリングした方向です。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-hg-lobes.svg" caption="Henyey-Greenstein のローブ。(a) g = −0.3 から 0.85 までの 4π·p(θ) を対数の半径で描いたもの。光は左から右へ進みます（黄色の矢印）。等方的な g = 0 の曲線は半径 1 の円です。正の g はローブを前方へ、負の g は後方へ伸ばします。(b) 下の逆 CDF で g = 0.7 に対してサンプリングした 500 方向を単位球面上に描いたもの。進行方向の周りに集まり、平均余弦は 0.7 に近くなります。" %}

**HG の重点的サンプリング。** パストレーサーでは、密度 $p$ に従って新しい方向を*サンプリング*する必要があります。方位角 $\phi$ は $[0, 2\pi)$ で一様です。$\mu$ については、周辺密度 $2\pi p(\mu)$ の CDF を逆にします（積分では $u = 1+g^2-2g\mu$ と置換します。練習 1 と同じ手法です）。

$$
P(\mu) = 2\pi\int_{-1}^{\mu} p_{HG}(\mu')\,d\mu'
= \frac{1-g^2}{2g}\left[\frac{1}{\sqrt{1+g^2-2g\mu}} - \frac{1}{1+g}\right].
$$

端点を確認します。$P(-1) = 0$ です。$\mu = 1$ では括弧の中が $\frac{1}{1-g} - \frac{1}{1+g} = \frac{2g}{1-g^2}$ となるので $P(1) = 1$ です。$[0,1)$ の一様乱数 $\xi$ に対して $P(\mu) = \xi$ と置いて解きます。

$$
\sqrt{1+g^2-2g\mu} = \frac{1-g^2}{1-g+2g\xi}
\quad\Longrightarrow\quad
\mu = \frac{1}{2g}\left[1 + g^2 - \left(\frac{1-g^2}{1-g+2g\xi}\right)^2\right] .
$$

$\vert g\vert \approx 0$ のときはゼロ除算を避けるため $\mu = 1-2\xi$ を使います。サンプルは $p$ そのものから引かれるので、パストレーシングの重み $p/\text{pdf}$ は 1 です。**数値例**：$g = 0.6$、$\xi = 0.5$ では $\frac{0.64}{1.0} = 0.64$、したがって $\mu = (1.36 - 0.4096)/1.2 = 0.792$ です。散乱した光子の半分は $37.6^\circ$ 未満しか曲がりません。

```python
import numpy as np

def hg(cos_t, g):
    return (1 - g * g) / (4 * np.pi * (1 + g * g - 2 * g * cos_t) ** 1.5)

def sample_hg(g, xi):
    """Inverse-CDF sample of cos(theta); theta is measured from the direction of travel."""
    if abs(g) < 1e-3:
        return 1 - 2 * xi
    s = (1 - g * g) / (1 - g + 2 * g * xi)
    return (1 + g * g - s * s) / (2 * g)

rng = np.random.default_rng(0)
g = 0.6
mu = sample_hg(g, rng.random(1_000_000))
print(mu.mean())           # ~0.600: the mean cosine of HG is exactly g
print(sample_hg(g, 0.5))   # 0.792 (median angle ~37.6 degrees)
m = (np.arange(200000) + 0.5) / 100000 - 1          # midpoints in (-1, 1)
print(2 * np.pi * np.sum(hg(m, g)) * (2 / 200000))  # ~1.0: normalized
```

符号の約束は典型的なバグの原因です。pbrt は $\boldsymbol{\omega}_o$ と $\boldsymbol{\omega}_i$ を*どちらも散乱点から外向き*にとって $\theta$ を測るので、ここで使っている進行方向の約束とは $g$ の符号が逆になります。どちらか一方に決め、非対称な $g$ でテストしましょう。

### 4.3 Rayleigh、Mie、Draine 関数

適切な位相関数は、粒子の大きさ $r$ と波長 $\lambda$ の比で決まります。

- **Rayleigh 散乱**（$r \ll \lambda$：空気分子）は $p_R(\mu) = \frac{3}{16\pi}(1+\mu^2)$ で前後対称、散乱係数は $\lambda^{-4}$ に比例します。青い光（約 440 nm）は赤い光（約 680 nm）の $(680/440)^4 \approx 5.7$ 倍散乱されます。
- **Mie 散乱**（$r \sim \lambda$：もや、霧、雲の水滴）には厳密だが複雑な解があります。非常に強い前方ピーク、広い側方領域、そして光輪（glory）や霧虹（fogbow）のような特徴を持ちます。レンダラーはこれを近似します。
- 手軽な近似は **HG の混合** $w\,p_{HG}(\mu; g_1) + (1-w)\,p_{HG}(\mu; g_2)$ で、強い前方ローブと弱い後方ローブを組み合わせます。混合も正規化されており、確率 $w$ でローブを選べばサンプリングできます。
- **Draine** 位相関数（Draine 2003）は HG にパラメータ $\alpha$ を 1 つ加えます。
  $p_D(\mu; g, \alpha) = p_{HG}(\mu; g)\,\frac{1+\alpha\mu^2}{1+\alpha(1+2g^2)/3}$。
  $\alpha = 0$ なら HG、$\alpha = 1$ なら Cornette-Shanks 関数です。Jendersie と d'Eon（2023）は、HG ローブと Draine ローブの混合を水滴の直径の関数として Lorenz-Mie 理論にフィットさせ、安価でサンプリング可能な霧・雲用の位相関数を得ました。フィットの式は論文と補足資料にあります。

下の図では、これらの位相関数を同じ図に描いて形を比べています。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-phase-functions.svg" caption="(a) 同じ対数半径の極座標プロットに描いた 4 つの位相関数（光は左から右）：Rayleigh（青、ピーナッツ形で対称）、g = 0.76 の HG（橙）、少し後方散乱を含む 2 ローブの HG 混合（緑）、そして HG に 1 + μ² の形を加えた α = 1 の Draine（赤）。(b) g = 0.6、−0.3、0 について、逆 CDF で引いた 200,000 個の cos θ のヒストグラムを正確な密度 2π p(cos θ) と重ねたもの（対数軸）。棒と曲線は一致し、サンプル平均は g と一致します。" %}

下のウィジェットで、これらの形を実際に確かめられます。プロット上をドラッグすると光の来る方向が変わり、$g$ のスライダーも動かせます。点はライブのサンプルです。上のサンプラー（Rayleigh と Draine では棄却サンプリング）で引いた 3 次元の単位ベクトルを画面に投影しています。

{% include widget.liquid name="graphics-phase-function" height="560" caption="位相関数エクスプローラー。極座標プロット上を（マウスや指で）ドラッグすると光の来る方向を設定でき、スライダーで g を設定します。紫のローブは進行方向の周りの p(θ)（破線の円は等方の 1/4π）、橙の点は紙面に投影した 3 次元のサンプル方向です。下の帯は cos θ のヒストグラムと正確な確率密度を比べています。対数表示をオンにして g = 0.9、次に g = −0.5、さらに Rayleigh を試してください。HG では測定した平均 cos θ が g に従い、Rayleigh では 0 付近にとどまります。" %}

## 5. レイマーチングによる単一散乱

### 5.1 アルゴリズム

ボリュームレンダリング方程式を評価する最も直接的な方法は、レイに沿ったリーマン和で、**レイマーチング**（ray marching）と呼ばれます。$[0, d]$ を長さ $\Delta t$ の $N$ 区間に分け、各区間でサンプル点 $\mathbf{x}_i$ を 1 つとります。累積の透過率 $T$ と累積の放射輝度 $L$ を保持します。

1. $\sigma_t(\mathbf{x}_i)$ と $\sigma_s(\mathbf{x}_i)$ を参照します。
2. **シャドウレイ**：$$\mathbf{x}_i$$ から光源へ向かってマーチングし、光源の透過率 $$T_\ell(\mathbf{x}_i) = e^{-\tau_\ell}$$ を求めます。
3. 単一散乱のソース項：$$S_i = p(\cos\theta)\,T_\ell(\mathbf{x}_i)\,L_{\text{light}}$$。$\theta$ は光の進行方向 $$-\boldsymbol{\omega}_\ell$$ とカメラへ向かう方向 $-\boldsymbol{\omega}$ のなす角で、$$\cos\theta = \boldsymbol{\omega}_\ell\cdot\boldsymbol{\omega}$$ です。
4. 加算して減衰させます。

$$
L \mathrel{+}= T\,\frac{\sigma_s}{\sigma_t}\,\big(1 - e^{-\sigma_t\Delta t}\big)\,S_i,
\qquad
T \mathrel{\ast}= e^{-\sigma_t\Delta t}.
$$

係数 $\frac{\sigma_s}{\sigma_t}(1 - e^{-\sigma_t\Delta t})$ は、係数が一定の区間における厳密な積分 $\int_0^{\Delta t}\sigma_s e^{-\sigma_t s}\,ds$ です。素朴なリーマン項 $\sigma_s\Delta t$ は $\sigma_t\Delta t > 1$ で 1 を超え、エネルギーを生み出してしまいます。この「エネルギー保存」形は、Hillaire（2015）がリアルタイムの霧で広めました。

**数値例。** $\sigma_t = 2$、$\sigma_s = 1.8$、$\Delta t = 0.1$、現在の $T = 0.7$、$S_i = 0.5$ の区間を考えます。$1 - e^{-0.2} = 0.1813$ なので、$L$ は $0.7 \times 0.9 \times 0.1813 \times 0.5 = 0.0571$ 増え、$T$ は $0.7\,e^{-0.2} = 0.573$ になります。素朴な項では $0.7 \times 1.8 \times 0.1 \times 0.5 = 0.063$ 加わり、約 10% 多すぎます。

下の図は、手続き的な雲でこの処理の幾何を示したものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-ray-march.svg" caption="手続き的な雲の中でのレイマーチング。(a) 密度の断面（青）。o から ω に進むカメラレイを長さ Δt の区間（目盛り）に分け、各区間にジッターをかけたサンプル（橙）を 1 つ置き、光源 ω_ℓ へシャドウレイ（黄色の破線）を飛ばします。(b) レイに沿った密度（紫の塗り）とカメラからの透過率 T(t)（黒）。レイが濃い物質を横切るたびに T が下がります。T ≈ 0 より先のサンプルは寄与しないので省略できます（早期終了）。" %}

### 5.2 コード

柔らかく揺らいだ球を描く単一散乱レンダラー全体が、約 40 行に収まります。

```python
import numpy as np

def density(p):
    """Soft sphere of radius ~1 with a sine 'noise'; sigma_t up to 4 per unit length."""
    r = np.linalg.norm(p, axis=-1)
    wobble = 0.15 * np.sin(5 * p[..., 0]) * np.sin(4 * p[..., 1] + 1) * np.sin(6 * p[..., 2])
    return 4.0 * np.clip((1.0 - r + wobble) / 0.3, 0.0, 1.0)

def hg(cos_t, g):
    return (1 - g * g) / (4 * np.pi * (1 + g * g - 2 * g * cos_t) ** 1.5)

def march(n_steps=64, n_shadow=16, jitter=True, res=96, albedo=0.9, g=0.5, seed=0):
    rng = np.random.default_rng(seed)
    light = np.array([0.6, 0.7, 0.4]); light /= np.linalg.norm(light)  # direction TO the light
    u = (np.arange(res) + 0.5) / res * 3.0 - 1.5                       # orthographic camera
    X, Y = np.meshgrid(u, -u)
    o = np.stack([X, Y, np.full_like(X, 2.0)], -1)
    w = np.array([0.0, 0.0, -1.0])                                      # looking down -z
    dt = 4.0 / n_steps
    offset = rng.random(X.shape) if jitter else np.full(X.shape, 0.5)
    phase = hg(w @ light, g)   # cos(theta) between light travel (-light) and view (-w)
    T, L = np.ones(X.shape), np.zeros(X.shape)
    for i in range(n_steps):
        x = o + ((i + offset) * dt)[..., None] * w
        sig = density(x)
        tau_l, h = np.zeros(X.shape), 2.0 / n_shadow
        for j in range(n_shadow):                                       # shadow ray
            tau_l += density(x + ((j + 0.5) * h) * light) * h
        T_seg = np.exp(-sig * dt)
        L += T * albedo * (1 - T_seg) * phase * np.exp(-tau_l)         # light radiance 1
        T *= T_seg
    return L, T

L, T = march()
img = 1 - np.exp(-(120.0 * L + 0.1 * T))     # exposure; dark background radiance 0.1
print(img.shape, round(float(T.min()), 4))    # (96, 96) 0.0011
import matplotlib.pyplot as plt
plt.imsave("sphere_volume.png", img, cmap="gray", vmin=0, vmax=1)
```

### 5.3 バンディング、ジッター、コスト

区間内のサンプル位置を固定すると（`jitter=False`）、すべてのピクセルが同じ深さで密度をサンプリングします。すると滑らかな密度勾配が**バンディング**（banding）、つまり毎フレーム同じ場所にとどまる等高線になります。下の図のようにとても柔らかい雲では淡いですが（(a)）、輪郭のはっきりした媒質やステップ数が少ない場合にははっきりした縞になります。開始オフセットをピクセルごとに（リアルタイムではフレームごとにも）**ジッター**（jittering）すると、この構造的な誤差がノイズに変わります。人の目はノイズのほうを許容しやすく、時間方向の蓄積やデノイザー（[第 06 回]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})を参照）で平均化して消せます。ブルーノイズのオフセットならさらに良くなります。コストはピクセルあたり $N_{\text{steps}} \times N_{\text{shadow}}$ 回の密度参照です。実用的なレンダラーは 3 つの方法でこれを減らします。$T < 10^{-3}$ での**早期終了**（early termination）、粗い占有グリッドによる**空領域スキップ**（empty-space skipping、8 節）、そして適応的なステップ幅です。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-cloud-render.svg" caption="図のスクリプトのレイマーチャーでレンダリングした手続き的な雲（球の和集合をバリューノイズの fBm で侵食し、96×56×72 のグリッドに格納したもの）。太陽は雲の右上の奥にあります。(a) 位置を固定した 8 ステップ：画像は滑らかに見えますが、誤差は構造化されており（暗い下側の縁に淡い階段状の等高線）、毎フレーム同じなので平均しても消えません。(b) 同じ 8 ステップでもピクセルごとにジッターをかけると、構造化された誤差がピクセルごとのノイズになり、時間方向の蓄積で取り除けます。(c) 96 ステップ、単一散乱のみ：太陽と反対側（左下）はとても暗くなります。そこへ光が届くには何度も跳ね返る必要があるからです。(d) 同じレンダリングに 7 節の多重散乱オクターブ近似を加えたもの：影の部分が柔らかな光で満たされ、本物の雲にずっと近づきます。" %}

## 6. 不偏な距離サンプリング：delta / ratio / residual tracking

レイマーチングは**バイアスがあります**（biased）。ステップ幅が有限だとリーマン和は真の積分に収束せず、サンプルの間にある細かな構造を見逃します。プロダクションのパストレーサーは代わりに、$\sigma_t$ の*点ごとの評価*だけを必要とする**不偏**（unbiased）なモンテカルロ法で透過率を推定し、衝突距離をサンプリングします。

### 6.1 均質媒質での自由行程サンプリング

均質媒質では、次の衝突までの距離は密度 $p(t) = \sigma_t e^{-\sigma_t t}$、つまり平均 $1/\sigma_t$ の指数分布に従います。CDF は $1 - e^{-\sigma_t t}$ で、これを逆にすると次が得られます。

$$
t = -\frac{\ln(1-\xi)}{\sigma_t}.
$$

たとえば $\sigma_t = 2$、$\xi = 0.5$ なら $t = \ln 2/2 = 0.347$ です。このようにサンプリングすると透過率の項が pdf と打ち消し合うので、パスのスループットは（アルベドを除いて）変わりません。難しいのは不均質な媒質で、$\int\sigma_t$ を閉じた形で逆にできません。

### 6.2 Delta（Woodcock）tracking

中性子輸送（Woodcock ら、1965）から来た技法は、**媒質を架空の「ヌル」粒子で満たして**均質にするというものです。レイに沿ってどこでも $\bar\sigma \ge \sigma_t(\mathbf{x})$ となる**上界**（majorant）を選び、ヌル係数を $\sigma_n = \bar\sigma - \sigma_t \ge 0$ と定義します。合わせた媒質の消散は一定値 $\bar\sigma$ になるので、上の式で仮の衝突（tentative collision）をサンプリングできます。仮の衝突のたびに、次のように判定します。

- 確率 $\sigma_t(\mathbf{x})/\bar\sigma$ で**本物**の衝突とし、停止します（吸収または散乱）。
- そうでなければ**ヌル**衝突で、光子は同じ方向にそのまま進み続けます。

**なぜ不偏か。** $[0, d]$ 上の仮の衝突は、レート $\bar\sigma$ のポアソン過程をなします。点の数 $n$ は平均 $\bar\sigma d$ のポアソン分布に従い、各点は一様に分布します。光子が区間を通り抜けるのはすべての点がヌルのときだけなので、

$$
P(\text{pass}) = \sum_{n=0}^{\infty} e^{-\bar\sigma d}\frac{(\bar\sigma d)^n}{n!}
\left(\frac{1}{d}\int_0^d \Big(1 - \frac{\sigma_t(s)}{\bar\sigma}\Big) ds\right)^{\!n}
= e^{-\bar\sigma d}\, e^{\int_0^d (\bar\sigma - \sigma_t)\,ds} = e^{-\tau(d)} .
$$

となります。したがって delta tracking は、平均がちょうど $T$ になる 2 値（0 か 1）の透過率推定を返します。分散はベルヌーイ変数の分散 $T(1-T)$ で、上界に依存しません。緩い上界はヌル衝突が増えて時間がかかるだけです。

### 6.3 Ratio tracking

透過率だけが必要なとき（たとえばシャドウレイ）は、最初の本物の衝突で終了すると情報を捨てることになります。**Ratio tracking**（Novák、Selle、Jarosz 2014）は区間の終わりまで*すべての*仮の衝突をたどり、それぞれでヌルである確率を掛け合わせます。

$$
\langle T\rangle = \prod_{i=1}^{n}\left(1 - \frac{\sigma_t(\mathbf{x}_i)}{\bar\sigma}\right).
$$

上の和から、その期待値もやはり $e^{-\tau}$ であることがわかります。分散はより小さく、上界を大きくするほどさらに下がり続けます。均質媒質では 2 次モーメントが $\sum_n e^{-\bar\sigma d}\frac{(\bar\sigma d)^n}{n!}(1-\sigma/\bar\sigma)^{2n} = e^{-2\sigma d + \sigma^2 d/\bar\sigma}$ なので、

$$
\mathrm{Var}\,\langle T\rangle = e^{-2\sigma d}\left(e^{\sigma^2 d/\bar\sigma} - 1\right) \xrightarrow{\ \bar\sigma\to\infty\ } 0 .
$$

**数値例**：$\sigma = 1$、$d = 1$ とすると $T = 0.368$ です。Delta tracking の分散は $0.368 \times 0.632 = 0.233$ です。$\bar\sigma = 2$ の ratio tracking では $e^{-2}(e^{0.5}-1) = 0.088$、$\bar\sigma = 4$ では $e^{-2}(e^{0.25}-1) = 0.038$ です。コストは平均 $\bar\sigma d$ 回の参照です。

### 6.4 Residual ratio tracking

**Residual ratio tracking**（同じく Novák ら 2014）は、消散を 2 つに分けます。光学的深さが解析的にわかる**制御**部分 $\sigma_c$（たとえばグリッドノード上の平均）と、残差 $\sigma_r = \sigma_t - \sigma_c$ です。

$$
\langle T\rangle = e^{-\sigma_c d}\prod_{i}\left(1 - \frac{\sigma_r(\mathbf{x}_i)}{\bar\sigma_r}\right),
$$

仮の点は残差の上界 $\bar\sigma_r \ge \vert\sigma_r\vert$ から生成します。確率的に推定するのは残差だけなので、制御部分が良ければ分散もコストも小さくなります。$\sigma_r<0$ の場所では因子が 1 を超えることがありますが、推定量は不偏のままです。

```python
import numpy as np
rng = np.random.default_rng(1)

def sigma_t(t):   # the same medium as in Section 2
    return (0.1 + 1.0 * np.exp(-((t - 2.0) / 0.45) ** 2)
            + 0.6 * np.exp(-((t - 5.2) / 0.8) ** 2)
            + 1.6 * np.exp(-((t - 7.4) / 0.25) ** 2))

SIGMA_BAR, D = 1.8, 10.0          # majorant >= max sigma_t (about 1.70)

def delta_tracking():
    t = 0.0
    while True:
        t -= np.log(1 - rng.random()) / SIGMA_BAR
        if t >= D:
            return 1.0                                  # passed the segment
        if rng.random() < sigma_t(t) / SIGMA_BAR:
            return 0.0                                  # real collision

def ratio_tracking():
    t, T = 0.0, 1.0
    while True:
        t -= np.log(1 - rng.random()) / SIGMA_BAR
        if t >= D:
            return T
        T *= 1 - sigma_t(t) / SIGMA_BAR

N = 20000
d = np.array([delta_tracking() for _ in range(N)])
r = np.array([ratio_tracking() for _ in range(N)])
print(f"exact {np.exp(-3.357364):.4f}")                       # 0.0348
print(f"delta {d.mean():.4f} +- {d.std() / np.sqrt(N):.4f}")
print(f"ratio {r.mean():.4f} +- {r.std() / np.sqrt(N):.4f}")  # same mean, much smaller error
```

下の図は、この媒質で 3 つの推定量を実行したものです。上界は最大消散の $1\times$ から $8\times$ まで変え、それぞれ 20,000 回推定しています。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-tracking-variance.svg" caption="2 節の媒質で 3 つの透過率推定量を実際に走らせたモンテカルロ実験（真の T = 0.0348）。(a) 1 回の推定の標準偏差と上界の関係。Delta tracking は上界がどれほど緩くてもベルヌーイの値 √(T(1−T))（点線）にとどまります。Ratio tracking はずっと低く、上界が大きくなるほど改善し続けます。平均消散を制御部分とする residual ratio tracking はさらに低くなります。(b) その代償：密度の参照回数は上界に比例して増えます（delta tracking は最初の本物の衝突で早く止まります）。" %}

下のウィジェットは、2 つの推定量の背後にある幾何を見せます。仮の衝突をそれぞれ軸から高さ $\xi\bar\sigma$ の位置に描くので、「確率 $\sigma_t/\bar\sigma$ で本物」は「点が密度曲線の下にある」と言い換えられます。つまりレイに沿った棄却サンプリングです。

{% include widget.liquid name="graphics-volume-tracking" height="520" caption="2 節の媒質での delta tracking と ratio tracking。上：delta tracking のウォーク 1 回分。仮の衝突を高さ ξσ̄ に描き、密度曲線より上の灰色の輪はヌル衝突、曲線より下の最初の赤い点は本物の衝突で、そこでウォークが終わります（推定値 0）。t = 10 に到達すれば推定値は 1 です。下：厳密な T(t)（黒）と ratio tracking のウォーク 1 回分（青）。各点で 1 − σt/σ̄ を掛けていきます。図をタップすると新しいレイになり、下の統計は何千回ものウォークを蓄積します。上界を上げてみてください。delta tracking の標準偏差は 0.18 付近のままですが、ratio tracking の標準偏差は小さくなり、どちらも参照回数の増加という代償を払います。" %}

### 6.5 ヌル散乱パス積分、そしてその先

Delta tracking と ratio tracking は、より大きな手法群の 2 つのメンバーです。Novák、Georgiev、Hanika、Jarosz（2018）は Eurographics の STAR（最先端レポート）でこれらを概観しました。各種の tracking、色付き媒質のためのスペクトル tracking（spectral tracking）、分解 tracking（decomposition tracking、Kutz ら 2017）、そして上界の選び方です。続いて Miller、Georgiev、Jarosz（2019）が**ヌル散乱パス積分定式化**（null-scattering path integral formulation）を示しました。ヌル衝突がパスの明示的な頂点になり、独自のパス空間測度を持ちます。これにより tracking 推定量を多重重点的サンプリング（MIS、[第 05 回]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})）と組み合わせられるようになりました。スペクトル MIS や双方向法も含みます。以前の tracking 推定量は pdf が計算できなかったため、これができませんでした。

## 7. 多重散乱を含むボリュームパストレーシング

ボリュームパストレーサーは、第 05 回の表面パストレーサーに、区間ごとの判断を 1 つ追加したものです。*パスは次の表面に当たるのか、それとも先に媒質内で衝突するのか？* delta tracking を使う場合は次のようになります。

1. 現在の頂点から方向に沿って delta tracking を行い、最初の本物の衝突を見つけます（あるいは表面に到達するか、外へ抜けます）。
2. 媒質内で本物の衝突が起きたら、確率 $\sigma_a/\sigma_t$ でパスは吸収されます（放射があれば加算します）。そうでなければ散乱します。同等のやり方として、スループットにアルベド $\rho$ を掛けて常に散乱させ、ロシアンルーレットで打ち切ることもできます。
3. **次イベント推定**：光源上の点をサンプリングし、そこまでの透過率を **ratio tracking** で推定して、$\text{throughput}\times\rho\times p(\cos\theta)$ $\times\, T_\ell\times L_{\text{light}}/\text{pdf}_{\text{light}}$ を加えます。
4. 位相関数から新しい方向をサンプリングし（HG のサンプリングなら重みは 1）、続けます。

下のコードはこれを核心だけに絞ったものです。光子が不均質なスラブに上から入り、delta tracking で本物の衝突を見つけ、HG サンプリングで新しい方向を選びます。出力は反射・透過・吸収の割合で、マテリアルの見た目のモデルが必要とする量です。

```python
import numpy as np
rng = np.random.default_rng(2)
SIGMA_BAR, ALBEDO, G, DEPTH = 1.8, 0.95, 0.7, 4.0

def sigma_t(p):   # slab 0 <= z <= 4, denser in a wavy layer around z = 2 (max exactly 1.8)
    return 1.0 + 0.8 * np.sin(2.0 * p[0]) * np.exp(-(p[2] - 2.0) ** 2)

def sample_hg(g, xi):
    if abs(g) < 1e-3:
        return 1 - 2 * xi
    s = (1 - g * g) / (1 - g + 2 * g * xi)
    return (1 + g * g - s * s) / (2 * g)

def scatter(w, g):
    cos_t = sample_hg(g, rng.random())
    sin_t = np.sqrt(max(0.0, 1 - cos_t * cos_t))
    phi = 2 * np.pi * rng.random()
    a = np.array([1.0, 0.0, 0.0]) if abs(w[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    u = np.cross(a, w); u /= np.linalg.norm(u)
    v = np.cross(w, u)
    return sin_t * np.cos(phi) * u + sin_t * np.sin(phi) * v + cos_t * w

def trace(max_bounces=1000):
    p, w = np.zeros(3), np.array([0.0, 0.0, 1.0])   # enter at the top, heading down (+z)
    for _ in range(max_bounces):
        while True:                                  # delta tracking to a REAL collision
            p = p - np.log(1 - rng.random()) / SIGMA_BAR * w
            if p[2] < 0:
                return "R"
            if p[2] > DEPTH:
                return "T"
            if rng.random() < sigma_t(p) / SIGMA_BAR:
                break
        if rng.random() > ALBEDO:                    # analog absorption
            return "A"
        w = scatter(w, G)
    return "A"

fates = [trace() for _ in range(5000)]
print({k: fates.count(k) / len(fates) for k in "RTA"})   # {'R': 0.2436, 'T': 0.4724, 'A': 0.284}
```

下の図のランダムウォークは、パスそのものを見せています。アルベドの高い媒質では光子が何十回も散乱します。そのため光は横に広がり、太陽が直接照らさない場所にも届きます。雲の図の (c) が暗すぎる物理的な理由はこれです。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-random-walk.svg" caption="厚さ 4 平均自由行程、アルベド 0.98 のスラブ内のランダムウォーク。光は上から入ります（黄色の矢印）。各図 24 本のパスを x-z 平面に投影し、結末で色分けしています：反射（橙）、透過（青）、吸収（灰）。タイトルの割合 R、T、A は 20,000 回のウォークから求めたものです（図は均質な媒質でアルベド 0.98 を使っており、上のコードとは設定が違うので数値も異なります）。等方散乱（左）では多くの光子が上から出ていきます。g = 0.85 の前方散乱（右）では光子がより深くまで運ばれ、透過が増えます。1 回の跳ね返りで方向が少ししか変わらないからです。" %}

**相似則とオクターブの技法。** 多重散乱を手頃なコストにする近似が 2 つあります。**相似則**（similarity relation）によれば、$(\sigma_s, g)$ の前方散乱媒質は、何度も跳ね返った後には、換算散乱係数 $\sigma_s' = \sigma_s(1-g)$ の等方媒質のように振る舞います。これは 10 節の拡散モデルで再び登場します。リアルタイムや映画でよく使われるヒューリスティック（Wrenninge、Kulla、Lundqvist による 2013 年の講演 *Oz: The Great and Volumetric*）は、消散・散乱・異方性を段階的に弱めた単一散乱の項を足し合わせて多重散乱を近似します。

$$
L_{ms} \approx \sum_{k=0}^{K-1} a^k\,\sigma_s\,p(\cos\theta;\, c^k g)\, e^{-b^k \tau_\ell},
\qquad a, b, c < 1 .
$$

ここで $a$ は散乱の寄与を、$b$ は光学的深さを（光がより深く届くように）、$c$ は異方性 $g$ を（より等方に近づくように）段階的に小さくします。$k=0$ は通常の単一散乱で、$k$ が大きいほど多く跳ね返った光を表します。雲の図の (d) は $a=b=c=\tfrac12$、$K=4$ を使っています。物理的に厳密ではありませんが、影の部分に光が漏れ込むという主な効果を捉えています。

## 8. データ構造：OpenVDB と NanoVDB

プロダクションのボリューム（爆発、雲、流体シミュレーション）は巨大で、しかも**疎**です。バウンディングボックスのほとんどは空です。密な $2048^3$ の float グリッドは 32 GB を必要とします。**OpenVDB**（Museth 2013）は、アクティブな領域だけを浅く深さ固定の木に格納します。標準的な構成は、ハッシュマップのルート、子を $32^3$ 個と $16^3$ 個持つ 2 段の内部ノード、そして $8^3$ ボクセルを持つリーフノードです。ビットマスクがアクティブな子を示すので参照は速く、ランダムアクセスは $O(1)$ です。アクセス経路をキャッシュすれば、コヒーレントなアクセスはさらに安くなります。

**NanoVDB**（Museth 2021）は、同じ木をポインタを持たない読み取り専用の連続バッファへ線形化したものです。そのため GPU にアップロードでき、CUDA、OptiX、HLSL、GLSL から走査できます。レンダリングで役立つ点として、木にはノードごとの最小値・最大値などの統計量も保存されています。これらは**局所的な上界**になります。delta tracking や ratio tracking は、全体の最大値 1 つではなく、ノードごとにタイトな $\bar\sigma$ を使えます。6 節の図が示したとおり、これは参照回数を直接減らします。空のノードは丸ごとスキップでき、これが 5 節の空領域スキップです。

## 9. リアルタイム：froxel フォグ、空、雲

### 9.1 Froxel ボリュメトリックフォグ

ゲームでは、すべてのピクセルについてすべての光源をマーチングすることはできません。**froxel** ベースのフォグ（Wronski 2014、SIGGRAPH Advances in Real-Time Rendering コースの *Volumetric Fog*。Hillaire 2015 が Frostbite で拡張）は、視錐台に沿った 3 次元テクスチャの中で処理します。froxel は視錐台のボクセル（frustum voxel）で、たとえばスクリーン空間の $160\times 90$ タイル × 64 深度スライスです。スライスは指数的な間隔 $z_k = z_n (z_f/z_n)^{k/N}$ で並べ、解像度が透視に沿うようにします。

1. **注入**（inject）：コンピュートシェーダーが各 froxel に $\sigma_s$、$\sigma_t$、放射を書き込みます（全体のフォグ、高さフォグ、局所的なフォグボリューム、パーティクル）。
2. **ライティング**：各 froxel ですべての光源の内向き散乱を合計します。可視性にはシャドウマップを、視線角には位相関数を使います。
3. **積分**：froxel の各列を手前から奥へたどり、5 節のエネルギー保存の区間公式で散乱光と透過率を累積します。
4. **適用**：深さ $z$ のピクセルをシェーディングするとき、$z$ における累積値 $(L_{\text{in}}, T)$ を取り出し、$T\,L_{\text{surface}} + L_{\text{in}}$ を出力します。半透明物体も同じものを参照できます。

グリッドが粗いので、froxel の位置を毎フレームジッターさせ、再投影した前フレームとブレンドします。[第 06 回]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})の TAA と同じ時間方向の再利用です。

### 9.2 空と大気

大気は球殻で、3 つの成分からなります。空気（Rayleigh、スケールハイト約 8 km）、エアロゾル（Mie、スケールハイト約 1.2 km）、そしてオゾン（純粋な吸収。薄明の空を青く保ちます）です。密度は高度 $h$ とともに指数的に減ります：$\sigma(h) = \sigma(0)\,e^{-h/H}$。各視線に沿った太陽光の単一散乱だけで、主な色はすでに説明できます。短い波長ほど強く散乱されるので、太陽から離れた空は青く見えます。日没が近づくと、私たちに届く光は非常に長い大気の中を通ってくるため、青い光は散乱されて失われ、橙と赤が残ります。

**数値例。** Hillaire（2020）が使っている海面での Rayleigh 係数 $\beta_R = (5.80, 13.56, 33.1)\times10^{-6}\ \text{m}^{-1}$（R, G, B）を使うと、天頂方向の光学的深さは $\beta_R H_R = (0.046, 0.108, 0.265)$ です。正午の直射日光は青の $e^{-0.265} = 77\%$ を保ちます。地平線方向では経路がおよそ 35 倍長くなり、青は $e^{-9.3}\approx 10^{-4}$ まで落ちますが、赤は約 $e^{-1.6} \approx 0.2$ 残ります。

下の図は、単一散乱の数値求積で、太陽高度に応じた空の色を計算したものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-rayleigh-sky.svg" caption="図のスクリプトで計算した単一散乱の空（Rayleigh + Mie + オゾン、球形の地球、各視線と各太陽光線に沿った数値求積）。各列が太陽高度、各行が視線の仰角で、(a) は太陽の方向、(b) は反対方向を見ています。太陽方向の周りの明るい Mie の輝き（(a) の対角線）、天頂に向かって深まる青、太陽が地平線に近づき沈むにつれて暗く赤くなる様子に注目してください。下の帯は太陽円盤からの直射光の色相（列ごとに正規化した T_sun）で、高度が高いと白、地平線付近では橙から赤になります。" %}

これをピクセルごと・フレームごとに計算するのは高価すぎますし、多重散乱も重要です（特に薄明時）。**Bruneton と Neyret（2008）**は、単一散乱と多重散乱を 4 次元のルックアップテーブル（高度、視線の天頂角、太陽の天頂角、視線と太陽のなす角）に事前計算し、散乱の次数を 1 つずつ加えていきます。**Hillaire（2020）**はより軽量で完全に動的な方式を提案し、現在 Unreal Engine で使われています。小さな透過率 LUT、多重散乱 LUT、低解像度のスカイビュー LUT（sky-view LUT）、そして空気遠近法（aerial perspective）用の froxel ボリュームを使います。多重散乱 LUT は 2 次以上の散乱を等方と仮定し、無限次までの和を幾何級数として閉じた形で求めます。どの LUT も毎フレーム再計算できるほど安いので、大気を実行時に変化させられます。

### 9.3 雲

リアルタイムの雲景は、Schneider による 2015 年の Advances 講演 *The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn* で大きく進みました。その要素は今では標準になっています。

- **モデリング**：低周波の 3 次元 Perlin-Worley ノイズが雲の形を決め、高周波の Worley ノイズが縁を侵食します。2 次元の**ウェザーマップ**（weather map）が被覆率と雲の種類を決め、種類ごとの高さ勾配が平らな雲底と盛り上がる雲頂を作ります。
- **ライティング**：太陽へ向かう Beer-Lambert 透過率、HG 位相関数（シルバーライニングのために 2 ローブにすることが多い）、そして太陽に面した縁をさらに暗くする「パウダー」（powder）効果です。薄い縁ではまだ内向き散乱の光が十分に蓄積していないからです。多重散乱は 7 節のマルチオクターブの技法で近似します。
- **パフォーマンス**：空の領域では大きなステップ、雲の中では小さなステップを使います。低解像度でレンダリングして時間方向に再投影し、毎フレーム一部のピクセルだけを更新します。早期終了も使います。

同じスタジオによる後の Nubis の講演群では、このシステムのその後の発展が紹介されています。中を飛び抜けられる雲やボクセルベースの雲のオーサリングなどです。

## 10. 表面下散乱

肌、大理石、ろう、牛乳、葉は**半透明**（translucent）です。光はある点から入り、内部で何度も散乱して、別の場所から出てきます。BRDF は入射点と出射点が同じだと仮定しています。一般的な記述は **BSSRDF**（双方向散乱面下反射率分布関数）$S(\mathbf{x}_i, \boldsymbol{\omega}_i; \mathbf{x}_o, \boldsymbol{\omega}_o)$ で、$\mathbf{x}_o$ から出る放射輝度を、*別の*点 $\mathbf{x}_i$ に届く光と結びつけます。

$$
L_o(\mathbf{x}_o, \boldsymbol{\omega}_o) = \int_A \int_{H^2} S(\mathbf{x}_i, \boldsymbol{\omega}_i; \mathbf{x}_o, \boldsymbol{\omega}_o)\, L_i(\mathbf{x}_i, \boldsymbol{\omega}_i)\,\cos\theta_i\, d\boldsymbol{\omega}_i\, dA(\mathbf{x}_i).
$$

### 10.1 拡散と双極子

濃くアルベドの高い媒質では、光が何度も散乱した結果、方向がほぼランダムになります。すると放射輝度はほぼ等方になり、RTE はフルエンス（fluence）に関する**拡散方程式**（diffusion equation）に簡略化されます。**Jensen、Marschner、Levoy、Hanrahan（2001）**は、半無限スラブについてこれを解きました。表面から深さ $z_r = 1/\sigma_t'$ の位置に正の点光源を、表面の上に負の鏡像光源を置いて境界条件を満たします。これが**双極子**（dipole）です。結果は、入射点から距離 $r$ の位置で出ていく光の割合を表す、放射状の**拡散反射プロファイル**（diffuse reflectance profile）$R_d(r)$ です。

$$
R_d(r) = \frac{\alpha'}{4\pi}\left[ z_r\,(1+\sigma_{tr} d_r)\,\frac{e^{-\sigma_{tr} d_r}}{d_r^3} + z_v\,(1+\sigma_{tr} d_v)\,\frac{e^{-\sigma_{tr} d_v}}{d_v^3}\right],
$$

ここで、換算係数は $\sigma_s' = \sigma_s(1-g)$ と $\sigma_t' = \sigma_a + \sigma_s'$、換算アルベドは $\alpha' = \sigma_s'/\sigma_t'$、実効輸送係数は $\sigma_{tr} = \sqrt{3\sigma_a\sigma_t'}$、光源の深さは $z_r = 1/\sigma_t'$ と $z_v = z_r(1+\tfrac{4}{3}A)$、距離は $d_{r,v} = \sqrt{r^2 + z_{r,v}^2}$ です。定数 $A = \frac{1+F_{dr}}{1-F_{dr}}$ は、境界での内部反射を拡散フレネル反射率 $F_{dr}$（相対屈折率 $\eta$ のフィット多項式）を通じて考慮します。

### 10.2 Burley の正規化拡散

Christensen と Burley（2015、Pixar テクニカルメモ）は、総当たりのモンテカルロシミュレーションで得たプロファイルが、2 つの指数関数の和で非常によくフィットできることに気づきました。Burley はこれを Disney BSDF で使いました。

$$
R(r) = A\,s\,\frac{e^{-s r} + e^{-s r/3}}{8\pi r}.
$$

$A$ は表面アルベド、$d = 1/s$ はユーザー向けの**散乱距離**（scattering distance）です。これは**正規化**されています：$\int_0^\infty R(r)\,2\pi r\,dr = \frac{A s}{4}\left(\frac{1}{s} + \frac{3}{s}\right) = A$ なので、アーティストは色 $A$ とぼかし半径 $d$ を独立に設定できます。さらに、$2\pi r R(r) = A\left[\tfrac14\,\tfrac{e^{-r/d}}{d} + \tfrac34\,\tfrac{e^{-r/(3d)}}{3d}\right]$ は 2 つの指数分布の混合です。そのため半径のサンプリングはとても簡単で、確率 $\tfrac14$ で $r = -d\ln\xi$、それ以外は $r = -3d\ln\xi$ とします。

```python
import numpy as np

def burley(r, A, d):
    return A * (np.exp(-r / d) + np.exp(-r / (3 * d))) / (8 * np.pi * d * r)

r = np.linspace(1e-6, 60.0, 600001)                         # mm
for A, d in [(0.8, 1.0), (0.55, 0.45), (0.4, 0.25)]:        # red spreads furthest in skin
    f = 2 * np.pi * r * burley(r, A, d)
    print(A, d, round(float(np.sum(0.5 * (f[1:] + f[:-1]) * np.diff(r))), 4))   # ~A

rng = np.random.default_rng(0)                              # sampling the radius
d, n = 1.0, 200000
xi, pick = rng.random(n), rng.random(n) < 0.25
radii = np.where(pick, -d * np.log(1 - xi), -3 * d * np.log(1 - xi))
print(radii.mean(), 0.25 * d + 0.75 * 3 * d)                 # both ~2.5
```

下の図の左が双極子プロファイル、右が Burley のプロファイルです。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-diffusion-profiles.svg" caption="拡散プロファイル。(a) 肌に似た RGB 係数（図のスクリプトに記載）での双極子 R_d(r) を両対数軸で描いたもの。最も吸収されにくい赤い光が最も遠くまで広がります。逆光の耳が赤く光り、肌が柔らかく見えるのはこのためです。(b) Burley の正規化プロファイルを放射方向の密度 2πr R(r) として 3 組の (A, d) で描いたもの。凡例には数値積分した面積を示しており、A に一致します。" %}

### 10.3 リアルタイムとプロダクション

- **分離可能な表面下散乱**（separable subsurface scattering、Jimenez ら 2015）は、SSS をスクリーン空間のポストプロセスとして行います。肌のピクセルの放射照度を拡散プロファイルでぼかし、2 次元カーネルを 2 回の 1 次元パス（水平、次に垂直）で近似します。分離可能なランク 1 近似です。カーネル半径は深度でスケールし、ワールド空間でのぼけの大きさを一定に保ちます。
- **ランダムウォーク SSS。** プロダクションのパストレーサー（たとえば Arnold、RenderMan、Blender Cycles）は今では、拡散近似を使わないモードを備えています。メッシュの境界の内側をボリュームとしてパストレースし、7 節と同じ delta tracking と位相関数サンプリングを使います。薄い形状、逆光、複雑な形を正しく扱えますが、コストは高くなります。

## 11. ニューラルレンダリングへ：アルファ合成は数値求積

**放射と吸収のみ**のボリュームレンダリング方程式をとり、放射色を $\mathbf{c}(\mathbf{x}, \boldsymbol{\omega})$ と書きます（$\sigma_a L_e$ を $\sigma\,\mathbf{c}$ にまとめます）。

$$
C = \int_0^{d} T(t)\,\sigma(t)\,\mathbf{c}(t)\,dt, \qquad T(t) = e^{-\int_0^t \sigma\,ds}.
$$

これが NeRF のレンダリング積分です。5 節のレイマーチャーと同じように評価してみましょう。レイを点 $t_i$ で間隔 $\delta_i$ に分割し、各区間で $\sigma$ と $\mathbf{c}$ が一定だと仮定します。区間 $i$ での厳密な積分は $T_i\,(1 - e^{-\sigma_i\delta_i})\,\mathbf{c}_i$ なので、

$$
\hat C = \sum_i T_i\,\alpha_i\,\mathbf{c}_i,
\qquad \alpha_i = 1 - e^{-\sigma_i \delta_i},
\qquad T_i = \prod_{j<i}(1 - \alpha_j).
$$

これは**手前から奥へのアルファ合成**（front-to-back alpha compositing）、つまり "over" 演算子です。NeRF の式は、5 節のエネルギー保存の区間規則で $\sigma_s/\sigma_t$ を放射色に置き換えたものにほかなりません。3D ガウシアンスプラッティングも同じ和を使いますが、各 $\alpha_i$ は密度のサンプルではなく、投影されたガウシアンから得ます。重み $w_i = T_i\alpha_i$ の和は $1 - T_N \le 1$ なので、深さ方向の確率分布のように振る舞います。NeRF の階層的サンプリングは、まさにこれを使って細かいサンプルを配置します。

**数値例。** $\sigma = (1, 3)$、$\delta = 0.5$、色 $c = (0.9, 0.2)$ の 2 サンプル：$\alpha = (0.393, 0.777)$、$T = (1, 0.607)$、$w = (0.393, 0.471)$ です。重みの和は $0.865 = 1 - e^{-2}$ で、ちょうど 1 から全体の透過率を引いた値になり、$\hat C = 0.9(0.393) + 0.2(0.471) = 0.448$ です。

```python
import numpy as np
sigma, delta, c = np.array([1.0, 3.0]), np.array([0.5, 0.5]), np.array([0.9, 0.2])
alpha = 1 - np.exp(-sigma * delta)
T = np.concatenate([[1.0], np.cumprod(1 - alpha)[:-1]])
w = T * alpha
print(alpha.round(4), T.round(4), w.round(4), w.sum().round(4), (w * c).sum().round(4))
# [0.3935 0.7769] [1.     0.6065] [0.3935 0.4712] 0.8647 0.4484
```

下の図は、2 節の媒質でこれを確かめたものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/10-quadrature.svg" caption="2 節の媒質でのアルファ合成を数値求積として見たもの。(a) 連続の重み T(t)σt(t)（紫）と 16 区間の離散的な重み T_iα_i/δ_i（棒）。棒は曲線に沿っており、最後の山が手前の山に遮られる効果も再現しています。(b) サンプル数 N を増やしたときの、描画色の厳密な積分に対する誤差。指数形 α = 1 − e^−σδ（エネルギー保存）はほぼ 2 次で収束します（点線 ∝ N⁻²）。素朴な α = σδ（1 で打ち切り）はどの区間でも不透明度を過大評価するため 1 次（∝ 1/N）でしか収束せず、N = 512 では誤差が数百倍大きくなります。" %}

本章の内容はすべてそのまま引き継がれます。透過率に基づくサンプリングは NeRF の重点的サンプリングに、空領域スキップは[高速な放射輝度場]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})の占有グリッドになります。バンディングとノイズのトレードオフは、NeRF が学習中にサンプル位置をジッターさせる理由です。

## 試してみよう

- 上の位相関数ウィジェット：HG、Draine、Rayleigh を比べ、サンプル平均が $g$ に収束する様子を見てください。
- [NeRF の記事]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})にあるボリュームレイのウィジェットは、1 本のレイに沿った放射・吸収の合成を見せてくれます。
- [Interactive Lab]({{ '/' | relative_url }}#lab) のパストレーサーは表面のパストレーサーです。7 節の delta tracking のループをその内側ループに加えるのは、WebGL の良い練習になります。

## 代表的な論文

| 論文 | 発表先 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Henyey & Greenstein, *Diffuse Radiation in the Galaxy* | Astrophysical Journal | 1941 | [DOI](https://doi.org/10.1086/144246) | 今もあらゆる場所で使われる 1 パラメータの位相関数 |
| Kajiya & Von Herzen, *Ray Tracing Volume Densities* | SIGGRAPH | 1984 | [DOI](https://doi.org/10.1145/964965.808594) | 放射伝達方程式とボリュームレイトレーシングをグラフィックスに導入 |
| Nishita, Sirai, Tadamura & Nakamae, *Display of the Earth Taking into Account Atmospheric Scattering* | SIGGRAPH | 1993 | [DOI](https://doi.org/10.1145/166117.166140) | 宇宙からも地上からも見られる、物理ベースの単一散乱の空 |
| Max, *Optical Models for Direct Volume Rendering* | IEEE TVCG | 1995 | [DOI](https://doi.org/10.1109/2945.468400) | 放射・吸収と散乱のモデル。NeRF のレンダリング積分の祖先 |
| Jensen, Marschner, Levoy & Hanrahan, *A Practical Model for Subsurface Light Transport* | SIGGRAPH | 2001 | [DOI](https://doi.org/10.1145/383259.383319) | 双極子 BSSRDF。半透明マテリアルを実用的にした |
| Draine, *Scattering by Interstellar Dust Grains. I. Optical and Ultraviolet* | Astrophysical Journal | 2003 | [DOI](https://doi.org/10.1086/379118) | 現代の Mie フィットで使われる Draine 位相関数を導入 |
| Bruneton & Neyret, *Precomputed Atmospheric Scattering* | CGF (EGSR) | 2008 | [DOI](https://doi.org/10.1111/j.1467-8659.2008.01245.x) | 4 次元ルックアップテーブルによるリアルタイムの多重散乱の空 |
| Museth, *VDB: High-Resolution Sparse Volumes with Dynamic Topology* | ACM TOG | 2013 | [DOI](https://doi.org/10.1145/2487228.2487235) | OpenVDB を支える疎なボリュームの形式 |
| Novák, Selle & Jarosz, *Residual Ratio Tracking for Estimating Attenuation in Participating Media* | ACM TOG (SIGGRAPH Asia) | 2014 | [DOI](https://doi.org/10.1145/2661229.2661292) | Ratio / residual ratio tracking：低分散で不偏な透過率 |
| Wronski, *Volumetric Fog: Unified Compute Shader-Based Solution to Atmospheric Scattering* | SIGGRAPH Advances in Real-Time Rendering | 2014 | [コースページ](https://advances.realtimerendering.com/s2014/index.html) | ゲームにおける froxel ベースのボリュメトリックフォグ |
| Schneider, *The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn* | SIGGRAPH Advances in Real-Time Rendering | 2015 | [コースページ](https://advances.realtimerendering.com/s2015/index.html) | リアルタイムのレイマーチング雲の手本 |
| Hillaire, *Towards Unified and Physically-Based Volumetric Lighting in Frostbite* | SIGGRAPH Advances in Real-Time Rendering | 2015 | [コースページ](https://advances.realtimerendering.com/s2015/index.html) | エネルギー保存の froxel 積分、統一された関与媒質 |
| Jimenez et al., *Separable Subsurface Scattering* | CGF | 2015 | [DOI](https://doi.org/10.1111/cgf.12529) | 分離可能カーネルによるリアルタイムのスクリーン空間 SSS |
| Christensen & Burley, *Approximate Reflectance Profiles for Efficient Subsurface Scattering* | Pixar Technical Memo 15-04 | 2015 | — | 正規化拡散：2 つの指数関数によるプロファイルで、サンプリングが容易 |
| Kutz, Habel, Li & Novák, *Spectral and Decomposition Tracking for Rendering Heterogeneous Volumes* | ACM TOG (SIGGRAPH) | 2017 | [DOI](https://doi.org/10.1145/3072959.3073665) | 色付き媒質のための tracking と制御 / 残差への分解 |
| Novák, Georgiev, Hanika & Jarosz, *Monte Carlo Methods for Volumetric Light Transport Simulation* | CGF (Eurographics STAR) | 2018 | [DOI](https://doi.org/10.1111/cgf.13383) | ボリュームのモンテカルロ法について読むべきサーベイ |
| Miller, Georgiev & Jarosz, *A Null-Scattering Path Integral Formulation of Light Transport* | ACM TOG (SIGGRAPH) | 2019 | [DOI](https://doi.org/10.1145/3306346.3323025) | パス空間でのヌル衝突。tracking 推定量の MIS |
| Hillaire, *A Scalable and Production Ready Sky and Atmosphere Rendering Technique* | CGF (EGSR) | 2020 | [DOI](https://doi.org/10.1111/cgf.14050) | 多重散乱を閉じた形で近似する、LUT ベースの動的な空 |
| Mildenhall et al., *NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis* | ECCV | 2020 | [arXiv](https://arxiv.org/abs/2003.08934) | 放射・吸収のボリュームレンダリングを微分可能なシーン表現として使用 |
| Museth, *NanoVDB: A GPU-Friendly and Portable VDB Data Structure for Real-Time Rendering and Simulation* | SIGGRAPH Talks | 2021 | [DOI](https://doi.org/10.1145/3450623.3464653) | GPU 上の VDB |
| Jendersie & d'Eon, *An Approximate Mie Scattering Function for Fog and Cloud Rendering* | SIGGRAPH Talks | 2023 | [DOI](https://doi.org/10.1145/3587421.3595409) | 水滴の Mie 理論にフィットさせた HG + Draine の混合 |

## 学習リソース

- Pharr、Jakob、Humphreys『Physically Based Rendering』第 4 版。[pbr-book.org](https://pbr-book.org/4ed/contents) で無料公開されています。第 11 章（ボリューム散乱）と第 14 章（ボリュームの光輸送）は、1〜7 節の内容をすべてヌル散乱パストレーシングで実装しています。
- Fong、Wrenninge、Kulla、Habel, *Production Volume Rendering*, SIGGRAPH 2017 コース（[DOI](https://doi.org/10.1145/3084873.3084907)）：映画のレンダラーが実際にボリュームをどう扱っているか。
- 上の Novák ら 2018 のサーベイは、tracking 推定量についての最良の単一の参考文献です。
- Sébastien Hillaire によるオープンソースの空のサンプル [UnrealEngineSkyAtmosphere](https://github.com/sebh/UnrealEngineSkyAtmosphere) と、Eric Bruneton の [precomputed_atmospheric_scattering](https://github.com/ebruneton/precomputed_atmospheric_scattering)。どちらもシェーダーコードが読みやすいです。
- [OpenVDB](https://github.com/AcademySoftwareFoundation/openvdb)（NanoVDB を含みます）と [Mitsuba 3](https://github.com/mitsuba-renderer/mitsuba3)。Mitsuba 3 のボリュームパストレーサーは通読できるほど短いです。
- [Scratchapixel](https://www.scratchapixel.com/) には、C++ コード付きのやさしい連載形式のボリュームレンダリング入門があります。

## 演習

1. HG 位相関数の平均余弦が $g$ であることを示してください。$2\pi\int\mu\,p_{HG}\,d\mu$ で $u = 1 + g^2 - 2g\mu$ と置換します。

   <details markdown="1"><summary>ヒント</summary>
   $\mu = (1+g^2-u)/(2g)$、$d\mu = -du/(2g)$ を代入すると、積分は $(1-g)^2$ から $(1+g)^2$ までの $\int u^{-3/2}du$ と $\int u^{-1/2}du$ の組み合わせになります。項を整理すると、ちょうど $g$ が残ります。
   </details>

2. 5 節の球のレイマーチャーに、早期終了（$T < 10^{-3}$）と、中心部で明るい放射項 $\sigma_a L_e$ を加えてください。`res=96` のとき、早期終了で密度の参照を何回節約できますか？

3. 2 ローブの HG 混合のサンプラー（確率 $w$ でローブを選んでからそれをサンプリング）を実装し、ヒストグラムで $w\,p_{HG}(g_1) + (1-w)\,p_{HG}(g_2)$ と一致することを確かめてください。

   <details markdown="1"><summary>ヒント</summary>
   混合密度は凸結合なので、「成分を選んでからサンプリングする」とちょうどその分布から引けます。pdf と関数が同一なので、重みの補正は不要です。
   </details>

4. ratio tracking のコードの全体的な上界を**区分的**な上界に置き換えてください。$[0, 10]$ を 10 セルに分け、各セルで $\sigma_t$ の最大値を使い、セル境界ごとに指数サンプリングをやり直します（指数分布の無記憶性によりこれは正しい手順です）。同じ分散で、全体の上界と参照回数を比べてください。

5. 均質媒質での ratio tracking の分散 $e^{-2\sigma d}(e^{\sigma^2 d/\bar\sigma} - 1)$ をポアソン和から導き、$\sigma = 1$、$d = 1$、$\bar\sigma \in \{1, 2, 4, 8\}$ のシミュレーションと照らし合わせてください。

   <details markdown="1"><summary>ヒント</summary>
   $E[\langle T\rangle^2] = \sum_n e^{-\bar\sigma d}\frac{(\bar\sigma d)^n}{n!}(1-\sigma/\bar\sigma)^{2n}$ $= \exp\big(-\bar\sigma d + \bar\sigma d (1-\sigma/\bar\sigma)^2\big)$。2 乗を展開し、$T^2 = e^{-2\sigma d}$ を引きます。
   </details>

次回は[リアルタイムレンダリングの技法]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }})です。ゲームが遅延シェーディング、ソフトシャドウ、アンビエントオクルージョン、反射、グローバルイルミネーション、トーンマッピングを 16 ms の 1 フレームにどう収めているかを扱います。
