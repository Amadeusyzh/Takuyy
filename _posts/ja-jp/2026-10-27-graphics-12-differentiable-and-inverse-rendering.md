---
layout: post
title: "微分可能レンダリングと逆レンダリング：ピクセルを通る勾配"
date: 2026-10-27 09:12:00+0900
description: "画像の勾配が難しい理由（可視性がディラックのデルタを生む）、ソフトラスタライザ、nvdiffrast、エッジサンプリング、再パラメータ化、パス空間の手法がそれをどう解決するか、Mitsuba 3、逆レンダリングの実際、そして実行できる 3 つの PyTorch 実験を解説します。"
categories: graphics
tags: [differentiable-rendering, inverse-rendering, soft-rasterizer, edge-sampling, mitsuba, pytorch]
series: graphics
series_order: 12
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

ここまでの記事はすべて*順方向*でした。シーン（ジオメトリ、マテリアル、光源、カメラ）が与えられたとき、[ラスタライゼーション]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})や[パストレーシング]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})で画像を生成する、というものです。一方、3D ビジョンの多くの問題は逆向きです。手元にあるのは写真で、欲しいのはシーンです。**逆レンダリング**（inverse rendering）は、画像から形状、マテリアル、照明、カメラを復元する問題です。そのもっとも一般的な方法は、レンダラーを**微分可能**（differentiable）にし、レンダリング結果が写真に一致するまで勾配降下法でシーンを調整することです。これはまさに [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }}) や [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }}) の根底にあるエンジンであり、この章は古典的なグラフィックスからニューラルレンダリングのシリーズへの橋渡しになります。

難しさの所在は意外なほど限定的です。色に関する微分は簡単ですが、*物がどこにあるか*に関する微分は、不連続な可視性にぶつかります。この章の大部分は、この 1 つの問題と、人々が見つけてきた半ダースほどの巧妙な回避策についてです。

## 前提知識

- [物理ベースレンダリング]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})のレンダリング方程式と BRDF、および[パストレーシング]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})のモンテカルロ積分。
- [第 2 回]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})の三角形のラスタライズとカバレッジ（被覆率）。
- 連鎖律、勾配降下法、Adam、および基本的な PyTorch（`requires_grad`、`backward`）。
- 「ステップ関数の微分」としてのディラックのデルタ $\delta(x)$：$\frac{d}{dx}H(x) = \delta(x)$。ここで $H$ はヘヴィサイドのステップ関数（$H(x)=1$ は $x>0$ のとき、それ以外は $0$）で、$\int g(x)\,\delta(x-a)\,dx = g(a)$ が成り立ちます。

## 1. 順方向レンダリングと逆レンダリング

シーンをパラメータベクトル $\theta$ で書きます。頂点位置、テクセルごとの BRDF パラメータ、光源の強度、カメラの姿勢などです。レンダラーは $\theta$ を画像 $I = R(\theta) \in \mathbb{R}^{P}$（$P$ はピクセル数かける色チャンネル数）に写す関数 $R$ です。目標となる写真 $I^\star$ が与えられたとき、逆レンダリングは次を解きます。

$$
\theta^\star = \arg\min_\theta \; \mathcal{L}\big(R(\theta), I^\star\big) + \mathcal{R}(\theta),
$$

ここで $\mathcal{L}$ は画像の損失（たとえば平均二乗誤差 $\frac{1}{P}\lVert R(\theta)-I^\star \rVert^2$）、$\mathcal{R}$ は事前知識（滑らかな表面、もっともらしいマテリアル）を符号化する正則化項です。これは**合成による解析**（analysis-by-synthesis）です。画像を合成することによって、その画像を説明するわけです。勾配降下法に必要なのは次の量です。

$$
\frac{\partial \mathcal{L}}{\partial \theta} = \Big(\frac{\partial I}{\partial \theta}\Big)^{\!\top} \frac{\partial \mathcal{L}}{\partial I},
$$

ベクトル $\partial\mathcal{L}/\partial I$（ピクセルごとに 1 つの数）は簡単に計算できます。難しいことはすべてヤコビアン（Jacobian）$\partial I/\partial\theta$ にありますが、これを陽に組み立てることはありません。リバースモード微分（reverse-mode differentiation）が、$\partial\mathcal{L}/\partial I$ にこれをその場で掛けてくれるからです。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-pipeline.svg" localized="true" caption="合成による解析のループ。順方向パスでは現在のシーンパラメータ $\theta$ をレンダリングして写真と比較します。逆方向パス（赤の破線）では $\partial\mathcal{L}/\partial\theta$ をレンダラーを通して逆向きに伝え、オプティマイザが $\theta$ を更新できるようにします。" %}

**何が復元できるか。** 十分な枚数のビューと優れたレンダラーがあれば、4 つのグループすべてが復元できます。形状（頂点、符号付き距離場、密度）、マテリアル（アルベド、粗さ、法線マップ、空間的に変化する完全な BRDF、すなわち SVBRDF）、照明（環境マップ、点光源）、そしてカメラ（姿勢、内部パラメータ）です。

**何が復元できないか（少なくとも 1 枚の画像からは）。** 逆レンダリングには*曖昧性*が満ちています。つまり、異なるシーンが同じピクセルを生み出すのです。

- *アルベドと光の強度*：光を 2 倍にしてアルベドを半分にしても、拡散反射の画像は同じです。
- *形状とシェーディング*：上から照らされた出っ張りは、下から照らされたくぼみと同じに見えます（陰影からの形状復元における浮き彫りの曖昧性、bas-relief ambiguity）。
- *粗さと光源の大きさ*：ぼやけたハイライトは、小さな光源の下の粗い表面かもしれませんし、大きな光源の下のつるつるした表面かもしれません。
- *テクスチャとジオメトリ*：描かれた影は、1 つのビューからは本物の影と区別できません。

ビューを増やすこと、既知の照明、そして事前知識（正則化項 $\mathcal{R}$ や学習された事前分布）が、こうした曖昧さの決着をつけます。このリストは覚えておいてください。最適化が「失敗」したとき、同じ曖昧性の族の別のメンバーを見つけていることがよくあります。

## 2. 画像の勾配

### シェーディングパラメータは簡単

1 つの光源の下にある拡散面の 1 ピクセルを考えます。$I = \frac{\rho}{\pi} E \max(0, \mathbf{n}\cdot\mathbf{l})$ で、$\rho$ はアルベド、$E$ は放射照度、$\mathbf{n}$ は法線、$\mathbf{l}$ は光の方向です。このとき $\partial I/\partial\rho = \frac{E}{\pi}\max(0,\mathbf{n}\cdot\mathbf{l})$ となり、滑らかでよく定義された数になります。マイクロファセット BRDF 内の粗さ、光の強度、テクセルの値についても同様です。これらのパラメータは点の*明るさ*を変えるだけで、ピクセルが*どの点*を見るかは決して変えません。シェーダーに対する通常の自動微分（automatic differentiation, autodiff）で正しい勾配が得られ、7.3 節ではまさにこの方法でアルベドと粗さをフィッティングします。

### ジオメトリは不連続性を生む

では、ジオメトリを動かしてみましょう。ピクセルの値は、ピクセルのフットプリント上でのシーンの積分です（[第 2 回]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})のボックスフィルタ）。被写体のシルエットがフットプリントを横切る場所で、被積分関数が跳びます。1 次元で計算してみましょう。

**1 次元の例。** ピクセルを区間 $[0,1]$ とします。位置 $\theta$ にあるエッジの左側ではシーンの値が $f_{\rm in}$（物体）、右側では $f_{\rm out}$（背景）です。シーンは次のように書けます。

$$
f(x,\theta) = f_{\rm out} + (f_{\rm in} - f_{\rm out})\,H(\theta - x),
$$

真のピクセル値は、ピクセル上でのその平均です。

$$
I(\theta) = \int_0^1 f(x,\theta)\,dx = f_{\rm out} + (f_{\rm in} - f_{\rm out})\,\theta \qquad (0 \le \theta \le 1).
$$

これは完全に滑らかなランプ（傾斜）で、微分は $dI/d\theta = f\_{\rm in}-f\_{\rm out}$ です。今度は、代わりに積分記号の*内側*で微分してみます。

$$
\frac{dI}{d\theta} = \int_0^1 \frac{\partial f}{\partial\theta}\,dx = (f_{\rm in}-f_{\rm out})\int_0^1 \delta(\theta - x)\,dx = f_{\rm in}-f_{\rm out}.
$$

答えは同じですが、それが*どこから*来たかに注目してください。微分のすべてが、ただ 1 点 $x=\theta$、すなわちエッジに集中しています。ところがレンダラーは解析的に積分せず、**サンプリング**します。サンプル点 $x_k$ で $f$ を評価して平均を取るのです。

$$
\hat I(\theta) = \frac{1}{N}\sum_{k=1}^{N} f(x_k, \theta).
$$

各項は $\theta$ のステップ関数なので、$\hat I$ は階段状になります。その微分は、$N$ 個の点 $\theta = x_k$ を除いてどこでもゼロで、その点では無限大です。自動微分は $\hat I$ を計算するコードを微分するため、**ちょうどゼロ**を返します。サンプル点の 1 つがちょうどエッジ上に載る確率はゼロなので、デルタには決して「当たらない」からです。一言で言えば、被積分関数が不連続なとき、*推定値の微分は微分の推定値ではない*のです。

**具体的な数値。** $f_{\rm in}=0.8$、$f_{\rm out}=0.2$、$\theta=0.3$、そして $x_k = 0.125, 0.375, 0.625, 0.875$ の $N=4$ 個の層化サンプルとします。

- 厳密：$I = 0.2 + 0.6\cdot 0.3 = 0.38$、$dI/d\theta = 0.6$。
- サンプリング：エッジの左にあるのは $x_1 = 0.125$ だけなので、$\hat I = (0.8 + 3\cdot 0.2)/4 = 0.35$ となり、自動微分は $0$ を返します。
- サンプリングしたピクセルに対するステップ幅 $h$ の有限差分（finite difference, FD）：$h=0.01$ ではどのサンプルもエッジを越えないので FD は $0$ です。$h=0.1$ ではエッジが $x_2=0.375$ を通過して $\hat I$ が $0.5$ に跳ね、FD は $(0.5-0.35)/0.1 = 1.5$ となり、真値の 2.5 倍です。

```python
import torch

f_in, f_out = 0.8, 0.2
xs = (torch.arange(4) + 0.5) / 4                      # 4 stratified sample positions in [0, 1]

def pixel_sampled(theta):                             # what a renderer computes
    H = (torch.sign(theta - xs) + 1) / 2              # Heaviside H(theta - x); d sign/dx = 0 in PyTorch
    return (f_in * H + f_out * (1 - H)).mean()

def pixel_exact(theta):                               # the area integral, valid for 0 <= theta <= 1
    return f_in * theta + f_out * (1 - theta)

theta = torch.tensor(0.3, requires_grad=True)
for name, f in (("exact", pixel_exact), ("sampled", pixel_sampled)):
    I = f(theta)
    (g,) = torch.autograd.grad(I, theta)
    print(f"{name:8s} I = {I.item():.3f}  autodiff dI/dtheta = {g.item():.3f}")
for h in (0.01, 0.1):
    with torch.no_grad():
        fd = (pixel_sampled(theta + h) - pixel_sampled(theta)) / h
    print(f"FD of sampled pixel, h = {h}: {fd.item():.3f}")
```

```text
exact    I = 0.380  autodiff dI/dtheta = 0.600
sampled  I = 0.350  autodiff dI/dtheta = 0.000
FD of sampled pixel, h = 0.01: 0.000
FD of sampled pixel, h = 0.1: 1.500
```

次の図は、同じ関数を $\theta$ の全範囲にわたって示したものです。左は、厳密なランプ、1 サンプルのステップ（ピクセル中心をサンプリングする古典的なラスタライザ）、そして 4 サンプルの階段です。右はそれらの微分で、厳密なボックス、1 サンプルのピクセルのディラックのデルタ、自動微分が返すゼロの線、そしてスパイク状の FD です。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-edge-coverage.svg" caption="エッジが $\theta$ にある 1 次元のピクセル $[0,1]$（網掛け）（ここでは $f_{\rm in}=1$、$f_{\rm out}=0$）。左：面積積分はランプになり、点サンプリングはステップになります。右：厳密な微分はピクセル上で高さ 1 のボックスです。1 サンプルのピクセルはそのサンプル位置にディラックのデルタ（矢印）を持ち、サンプリング版を自動微分すると点線のゼロの線になり、4 サンプルの階段の有限差分（図では $h=0.1$）は、エッジがサンプルを横切るたびに幅 $h$、高さ $0.25/h=2.5$ のボックスになります。" %}

### 一般則：内部項と境界項

2 次元では、同じ計算が**レイノルズの輸送定理**（Reynolds transport theorem、動く領域に対するライプニッツの法則）になります。ピクセル $P$ の面積を $\lvert P\rvert$、値を $I = \frac{1}{\lvert P\rvert}\int_P f(\mathbf{x},\theta)\,d\mathbf{x}$ とし、$f$ が曲線 $\Gamma(\theta)$（シルエットのエッジ）をまたいで跳ぶとします。$\Gamma$ 上の点で、$\mathbf{n}$ を単位法線、$f^{-}$ を $\mathbf{n}$ が指す向きの逆側（物体の内側）の値、$f^{+}$ をもう一方の側の値、$\mathbf{v} = \partial\mathbf{x}_\Gamma/\partial\theta$ を $\theta$ が変化したときの境界点の速度とします。すると次が成り立ちます。

$$
\frac{dI}{d\theta} = \underbrace{\frac{1}{\lvert P\rvert}\int_P \frac{\partial f}{\partial\theta}\,d\mathbf{x}}_{\text{interior term}} \; + \; \underbrace{\frac{1}{\lvert P\rvert}\int_{\Gamma\cap P} \big(f^{-}-f^{+}\big)\,(\mathbf{v}\cdot\mathbf{n})\,d\ell}_{\text{boundary term}}.
$$

内部項は、シェーダー（シェーディング、テクスチャ、光源）の自動微分が与えてくれるものです。境界項は、それが取りこぼすものです。値の跳びに、エッジが法線方向に動く速さを掛け、ピクセル内にあるエッジの部分に沿って積分したものです。導出の概略はこうです。小さなステップ $\delta\theta$ の間に、エッジは幅 $(\mathbf{v}\cdot\mathbf{n})\,\delta\theta$ の細い帯を掃きます。この帯の中で値は $f^{+}$ から $f^{-}$ に変わるので、積分値はエッジの単位長さあたり $(f^{-}-f^{+})(\mathbf{v}\cdot\mathbf{n})\,\delta\theta$ だけ変化します。次の図の左のパネルがその帯を示し、右のパネルは、単位ピクセルを横切る直線エッジ $\mathbf{n}\cdot\mathbf{x}=\theta$（$\mathbf{v}\cdot\mathbf{n}=1$、$f^{-}-f^{+}=1$）について、この式を数値的に確かめています。被覆された面積の微分は、ピクセル内にあるエッジの長さ $\ell(\theta)$ に等しくなります。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-reynolds.svg" caption="左：エッジ $\mathbf{n}\cdot\mathbf{x}=\theta$ が $\delta\theta$ だけ動くと、被覆された領域（紫）は面積がおよそ $\ell\,\delta\theta$ の帯（オレンジ）の分だけ増えます。右：単位ピクセルの被覆面積 $A(\theta)$（多角形クリッピングで計算）、その有限差分による微分（太いオレンジ）、そしてクリップされたエッジの長さ $\ell(\theta)$（破線）。後の 2 つは一致しており、これがレイノルズの輸送定理の境界項です。" %}

下のウィジェットで、これをピクセルごとに確かめられます。$8\times 8$ のグリッド上でエッジをドラッグしてください。中央のパネルには、選んだレンダラー（ピクセルあたり 1 から 64 サンプル、または厳密な面積）の有限差分勾配が、右のパネルには境界項、つまり各ピクセル内のエッジの長さが表示されます。

{% include widget.liquid name="graphics-edge-gradient" height="440" caption="紫の点をドラッグするとエッジが動き、リングをドラッグすると回転します。スライダーでレンダラー（ピクセルあたりのサンプル数、または厳密な面積）と有限差分のステップ幅 $h$ を選びます。ピクセルあたり 1 サンプルで $h$ が小さいと、ほとんどすべてのピクセルの FD 勾配は 0 で、ゼロでないわずかなものは非常に大きくなります。厳密な面積カバレッジでは、FD マップは $h \to 0$ で境界項に収束し、合計 $\Sigma$ が一致します。" %}

### 有限差分とエッジサンプリング

有限差分はパラメータごとに追加のレンダリングが 1 回必要なので、数百万のパラメータにはスケールしませんし、1 次元の例が示したようにノイズも大きくなります。境界項は、より良い推定量である**エッジサンプリング**（edge sampling）を示唆します。シルエット上にランダムな点 $\mathbf{x}_k$ を密度 $p(\mathbf{x}_k)$ で選び（エッジに沿って一様なら $p = 1/\text{length}$）、両側の値を調べ、$(f^{-}-f^{+})(\mathbf{v}\cdot\mathbf{n})/p$ を平均します。画像全体にわたる損失では、各エッジサンプルは、それが落ちたピクセルに、そのピクセルの $\partial\mathcal{L}/\partial I$ で重み付けされて寄与します。

両方を測ってみましょう。$32\times 32$ の画像に、目標の円板に重ねた半径 $r$ のハードな円板があり、ピクセルあたり 16 個のジッタ付きサンプルでレンダリングします。各手法で $\partial\mathcal{L}/\partial r$ を 300 回推定します。基準値は、400,000 個の求積点で評価した境界積分です。下の図では、オレンジと紫の点群が赤い破線のまわりにどれだけ散らばっているかを比べてください。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-fd-vs-edge.svg" caption="円板の実験における $\partial\mathcal{L}/\partial r$ の推定値（対称対数軸。赤の破線は基準値、黒いバーは平均）。有限差分（オレンジ）は 2 回のレンダリングで同じランダムサンプルを使っており、$h$ が大きいと滑らかですが偏りがあり、$h$ が小さいと偏りはありませんがノイズが非常に大きくなります。2 回のレンダリングの間で変化するサンプルがごくわずかだからです（$h=0.01$ では符号が逆の推定値さえ出ます）。円周上の $M$ 点によるエッジサンプリング（紫）は基準値を中心とし、そのばらつきはおおよそ $1/\sqrt{M}$ のように縮みます。右：相対 RMSE（有限差分は $h=1, 0.1, 0.01$ で 0.80、0.26、0.96、エッジサンプリングは $M=16, 64, 256$ で 0.67、0.32、0.18）。コストにも注意してください。有限差分はパラメータごとに 2 回のレンダリングが必要ですが、エッジサンプリングは 1 回ですべてのパラメータの勾配が得られます。" %}

## 3. 微分可能ラスタライゼーション

ラスタライザは、ピクセル中心で z バッファを使って可視性を解決します。上で見た 1 サンプルの場合です。それでも有用な勾配を得る主な方法を、おおよそ歴史順に 5 つのシステムで見ていきます。

**OpenDR**（Loper and Black, ECCV 2014）は、最初の汎用的な「近似微分可能レンダラー」でした。順方向パスでは通常のラスタライザをそのまま使い、画像空間のフィルタ（レンダリング画像の有限差分）でピクセル値の画像位置に関する微分を近似し、それを射影された頂点位置の微分と連鎖させます。計算コストが低く、SMPL のような人体モデルを画像にフィッティングするのにうまく機能しました。

**Neural 3D Mesh Renderer**（NMR; Kato, Ushiku and Harada, CVPR 2018）も、ハードな順方向パスはそのまま残しつつ、逆方向パスを*定義*します。頂点を $\Delta x$ だけ動かすとピクセルの色が $\Delta I$ だけ変わるなら、そのピクセルに勾配 $\Delta I/\Delta x$ を割り当てます。これは線形補間なので、エッジがまだ届いていないピクセルでさえ信号を受け取ります。これは設計された勾配であり、どの関数の微分でもありませんが、メッシュ教師ありの単一画像からの 3D 再構成を実用的なものにしました。

**Soft Rasterizer**（SoftRas; Liu, Li, Chen and Li, ICCV 2019）は、順方向パスそのものを滑らかになるように変更します。各三角形 $j$ は、すべてのピクセル $i$ に次の確率で影響を与えます。

$$
D_j^i = \operatorname{sigmoid}\!\Big(\delta_j^i\,\frac{d^2(i,j)}{\sigma}\Big),
$$

ここで $d(i,j)$ はピクセル中心から三角形の境界までの距離、$\delta_j^i$ は内側で $+1$、外側で $-1$、$\sigma$（正規化デバイス座標の 2 乗単位）はぼかしの量を制御します。シルエットは $1-\prod\_j(1-D\_j^i)$ で、色は重み $w\_j^i \propto D\_j^i \exp(z\_j^i/\gamma)$（正規化された逆深度 $z$、温度 $\gamma$）に背景項を加えてブレンドされます。これはハードな z テストの代わりに深度に関するソフトマックスを使うものです。$\sigma,\gamma \to 0$ では通常のラスタライザになり、$\sigma>0$ ではエッジ付近のすべてのピクセルがゼロでない勾配を持ちます。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-softras-sigma.svg" caption="$64\times64$ 画像（正規化座標 $[-1,1]$）における 1 つの三角形の SoftRas 確率マップ $D(x)$。$\sigma$ の 4 つの値について示します。上：$\sigma$ が大きくなると、ハードなシルエット（シアンの輪郭）は溶けて滑らかな盛り上がりになり、その勾配はエッジから遠いピクセルにも届きます。下：点線に沿ったプロファイル。$\sigma=10^{-5}$ では遷移がピクセル（$2/64$）より狭くなるため、勾配はまたほとんどどこでも消えます。" %}

この図は、管理しなければならないトレードオフを示しています。$\sigma$ が大きいと長距離の勾配が得られますが、画像はぼやけて、鮮明な目標には合わせられません。$\sigma$ が小さいと正確ですが、勾配はエッジからせいぜい 1 ピクセル程度の範囲にしか届きません。通常の対策は、7 節で使うように、最適化の間に $\sigma$ を大きな値から小さな値へ**アニーリング**（anneal）することです。

**nvdiffrast**（Laine, Hellsten, Karras, Seol, Lehtinen and Aila; ACM TOG 39(6), SIGGRAPH Asia 2020）は、順方向パスを鮮明に保つ別の道を取ります。レンダリングを 4 つのモジュール式 GPU プリミティブに分割します。*rasterize*（ピクセルごとの三角形 ID と重心座標）、*interpolate*（頂点属性）、*texture*（ミップマップによるフィルタ付きテクスチャ参照）、*antialias* です。最初の 3 つは、三角形の内部にあるすべてのものに関して通常の意味で微分可能で、これが内部項をカバーします。境界項は *antialias* から得られます。隣り合う 2 つのピクセルがシルエットのエッジをまたいで異なる三角形を見ている場所では、2 つのピクセル中心を結ぶ線分とエッジが交わる位置を求め、2 つの色を比例配分でブレンドします。このブレンドの重みは頂点位置に連続的に依存するので、その微分は境界項の安価な近似になります。nvdiffrast は OpenGL 経由で GPU のハードウェアラスタライザを使う（あるいは独自の高速な CUDA ラスタライザを使う）ため、高解像度で数百万の三角形をレンダリングでき、メッシュベースの逆レンダリング（たとえば 5 節の nvdiffrec）の主力になりました。

**PyTorch3D**（Ravi et al., 2020）は、Meta による微分可能な 3D 演算子のライブラリです。そのメッシュラスタライザは、`blur_radius` 内にあるピクセルごとの最も近い $K$ 個の面を保持し、そのシェーダー（`SoftSilhouetteShader`、`SoftPhongShader`）がそれらを SoftRas 流にブレンドします。微分可能な点群レンダラーもあります。Python で微分可能ラスタライゼーションを試すのに最も手軽な場所です。

## 4. 物理ベースの微分可能レンダリング

パストレーサーは、各ピクセルを光路 $\bar{x}$（カメラ、バウンス、バウンス、光源）にわたる積分として計算します。

$$
I = \int_{\Omega} f(\bar{x};\theta)\,d\mu(\bar{x}),
$$

これは[第 5 回]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})のパス積分で、$\Omega$ はすべての光路の集合、$\mu$ はその上の測度です。可視性は、一次シルエットだけでなく、影、反射、間接光といった*すべての*バウンスに現れるので、境界項は今や多くの種類の不連続性の上に存在します。物理ベースの微分可能レンダリング（physically based differentiable rendering, PBDR）は、この設定でレイノルズの式の両方の項を推定します。この分野を特徴づけるアイデアは 4 つあります。

**エッジサンプリング**（Li, Aittala, Durand and Lehtinen, SIGGRAPH Asia 2018）は、2 節のように境界項を直接推定します。一次可視性ではスクリーン空間のシルエットエッジ上の点をサンプリングし、二次可視性（影、間接光）ではシェーディング点から見たシルエットエッジを、三角形のエッジに対する階層構造を使って関連するものを探しながらサンプリングします。不偏ですが、シルエットの探索は高価で、陰関数曲面には拡張できません。

**再パラメータ化**（reparameterization; Loubet, Holzschuch and Jakob, SIGGRAPH Asia 2019）は、陽なエッジを避けます。積分変数を $\mathbf{x} = T(\mathbf{u},\theta)$ と変換して、不連続性が $\theta$ と*一緒に動く*ようにすれば、$\mathbf{u}$ 空間では不連続性は固定され、被積分関数の微分はふたたび通常の微分になります。Loubet らは、近くの不連続性がどう動くかを（いくつかの補助レイから）推定し、$T$ を方向の小さな回転で近似します。これにより、低分散でわずかに偏りのある勾配が得られます。

**Warped-area sampling**（Bangaru, Li and Durand, SIGGRAPH Asia 2020）は、同じアイデアを不偏にします。発散定理を使って、境界積分を、不連続性上で境界の速度と一致する滑らかなワープ場の発散の*面積*積分として書き直します。面積積分はまさにモンテカルロが得意とするものなので、エッジを見つける必要はありません。

**パス空間微分可能レンダリング**（path-space differentiable rendering, PSDR; Zhang, Miller, Yan, Gkioulekas and Zhao, SIGGRAPH 2020）は、放射輸送の微分理論（Zhang et al., SIGGRAPH Asia 2019）に基づいて、パス積分そのものを微分します。境界項は*境界パス*、すなわち 1 つの頂点がシルエットエッジ上にある光路にわたる積分になり、これは双方向および多方向の戦略でサンプリングできます。これにより、複雑な光輸送（コースティクス、相互反射）の勾配が実用的になりました。

### メモリ：放射逆伝播とパスリプレイ

リバースモードの自動微分は、順方向パスのすべての演算を「テープ」に記録します。数百万本のパスが数回のバウンスを持つパストレーサーでは、これは数ギガバイトに達します。**放射逆伝播**（radiative backpropagation; Nimier-David, Speierer, Ruiz and Jakob, SIGGRAPH 2020）は、勾配それ自体が光輸送の問題であることに着目します。ピクセルの勾配 $\partial\mathcal{L}/\partial I$ が「随伴放射輝度（adjoint radiance）」としてカメラから放射され、2 回目の輸送パスが、その随伴放射輝度が微分可能なパラメータに出会った場所に勾配を堆積させます。テープは不要です。弱点は、いくつかの項が各頂点での入射放射輝度を必要とし、これを再推定するため、長いパスでは 2 乗の時間がかかることです。

**パスリプレイ逆伝播**（path replay backpropagation, PRB; Vicini, Speierer and Jakob, SIGGRAPH 2021）は、随伴パスで*同じ*パス（同じ乱数）を再生することでこれを解決し、各頂点で必要な放射輝度が逐次的に得られるようにします。時間は線形、メモリは一定です。PRB が扱うのは内部項で、Mitsuba は可視性のためにこれを再パラメータ化と組み合わせます（`prb_reparam` インテグレーター）。

### Mitsuba 3 と Dr.Jit

**Mitsuba 3**（EPFL の Realistic Graphics Lab により 2022 年に公開。最新リリースは 2026 年 8 月の v3.9.1）は、**Dr.Jit**（Jakob, Speierer, Roussel and Vicini, SIGGRAPH 2022）の上に構築された研究用レンダラーです。Dr.Jit は、レンダラーの Python/C++ コードを CPU（LLVM）または GPU（CUDA/OptiX）向けの大きな融合カーネルにトレースする JIT コンパイラで、それらのカーネルのフォワードモードおよびリバースモード微分を実装しています。完全な逆レンダリングのループは数行に収まります。公式チュートリアルの構成に倣った次の例は、コーネルボックスの壁の色を復元します。

```python
import drjit as dr
import mitsuba as mi

mi.set_variant("llvm_ad_rgb")                       # or "cuda_ad_rgb" on an NVIDIA GPU
scene = mi.load_dict(mi.cornell_box())
img_ref = mi.render(scene, spp=256)                 # the "photograph"

params = mi.traverse(scene)
key = "red.reflectance.value"
params[key] = mi.Color3f(0.1, 0.2, 0.9)             # wrong initial guess
params.update()

opt = mi.ad.Adam(lr=0.05)
opt[key] = params[key]
params.update(opt)
for it in range(50):
    img = mi.render(scene, params, spp=4, seed=it)  # differentiable render
    loss = dr.mean(dr.square(img - img_ref))
    dr.backward(loss)                               # radiative backprop / PRB under the hood
    opt.step()
    opt[key] = dr.clip(opt[key], 0.0, 1.0)
    params.update(opt)
print(params[key])     # about [0.60, 0.041, 0.017]; true wall: [0.570, 0.043, 0.044]
```

その前身である Mitsuba 2（Nimier-David, Vicini, Zeltner and Jakob, SIGGRAPH Asia 2019）がリターゲット可能な設計を導入し、Mitsuba 3 は、はるかに高速な Dr.Jit バックエンドと、PRB、再パラメータ化された可視性、微分可能な符号付き距離関数（Vicini, Speierer and Jakob, SIGGRAPH 2022）のためのインテグレーターを加えました。

## 5. 逆レンダリングの実際

**SVBRDF の取得。** 平らな素材の数枚の写真から、空間的に変化する BRDF（テクセルごとのアルベド、粗さ、法線、スペキュラ）を復元することは、古典的な逆レンダリングの課題です。Deschaintre et al.（SIGGRAPH 2018）は、1 枚のフラッシュ写真からこれらのマップを予測するネットワークを訓練し、予測されたマップと真のマップを多数の光源の下でレンダリングして比較する*レンダリングを意識した*損失を用いました。その後、最適化ベースの手法が、微分可能なシェーダーでそうした予測を洗練させます。

**照明とマテリアルの同時推定。** 逆パストレーシング（inverse path tracing; Azinović et al., CVPR 2019）は、微分可能なパストレーサーで部屋全体のマテリアルと発光体を最適化します。nvdiffrec（Munkberg et al., CVPR 2022）は、nvdiffrast を使って、多視点写真から三角形メッシュ（微分可能なマーチングテトラヘドラ層を通じて）、PBR テクスチャ、環境光を同時に復元するので、結果はそのままゲームエンジンに取り込めます。

**形状最適化と「Large Steps」。** 生の頂点位置を勾配降下法で最適化すると、メッシュが絡まりがちです。シルエットの勾配はまばらでノイズが多く、隣り合う頂点がまったく異なる更新を受け取るため、三角形が反転したり自己交差したりします。Nicolet, Jacobson and Jakob（「Large Steps in Inverse Rendering of Geometry」, SIGGRAPH Asia 2021）は、頂点 $\mathbf{x}$ を次のように再パラメータ化します。

$$
\mathbf{u} = (\mathbf{I} + \lambda \mathbf{L})\,\mathbf{x},
$$

ここで $\mathbf{L}$ はメッシュのラプラシアン（Laplacian）、$\lambda$ は平滑化の重みで、$\mathbf{x}$ の代わりに $\mathbf{u}$ を最適化します。$\mathbf{M} = \mathbf{I}+\lambda\mathbf{L}$（対称）とおくと、連鎖律から $\nabla\_{\mathbf{u}} = \mathbf{M}^{-1}\nabla\_{\mathbf{x}}$ となるので、$\mathbf{u}$ に対する勾配ステップ $\Delta\mathbf{u} = -\eta\,\nabla_{\mathbf{u}}\mathcal{L}$（$\eta$ はステップ幅）は頂点を次のように動かします。

$$
\Delta\mathbf{x} = \mathbf{M}^{-1}\Delta\mathbf{u} = -\eta\,(\mathbf{I}+\lambda\mathbf{L})^{-2}\,\nabla_{\mathbf{x}}\mathcal{L}.
$$

$\mathbf{L}$ の固有基底（固有値 $\mu_k \ge 0$。小さい $\mu_k$ は滑らかな低周波の形状）では、モード $k$ のステップは $1/(1+\lambda\mu_k)^2$ 倍されます。滑らかな変形はほとんどそのまま通り、高周波のノイズは強く減衰されます。これはソボレフ流の前処理（preconditioner）であり、メッシュを壊さずに*大きな*ステップを取れるようにします。（論文では、パラメータごとのスケーリングが平滑化を打ち消さないように Adam も修正しています。）下のおもちゃの例では、この考え方を、100 個の頂点からなる閉じた 2 次元曲線に適用します。この曲線は 5 枚の花びらを持つ花に成長すべきもので、勾配はステップごとにランダムな 30 % の頂点にしか届かず、ノイズも含みます。これは実際のシルエット勾配とよく似ています。結果は下の図のとおりです。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-large-steps.svg" caption="形状最適化のおもちゃの例（100 頂点の閉曲線。開始：点線の円、目標：破線の花、同じノイズ入りでまばらな勾配でステップ幅 $\eta=0.3$ の 300 ステップ）。左：素朴な勾配降下法ではノイズが曲線に沿って蓄積し、頂点が曲線に沿って流れて密集します。100 本の辺のうち 32 本で角度の向きが逆になり（隣り合う頂点の角度の順序が逆転）、多角形が自分自身の上に折れ重なります。中：$\lambda=5$ の Large Steps の更新 $(\mathbf{I}+\lambda\mathbf{L})^{-2}g$ は曲線を滑らかに保ちます。右：反復ごとの平均半径誤差。最後の 50 ステップでは、素朴な更新は約 0.016 で止まり、Large Steps は約 0.008 に達します。" %}

**粗から密へ、そして局所最小値。** ジオメトリの関数としての損失は、平坦な高原（プラトー）と局所最小値に満ちています。レンダリングされた物体が目標とまったく重ならないと、ハードなレンダラーの勾配はゼロです（少し動かしても何も変わりません）。目標に似た物体が 2 つあると、モデルは間違ったほうに固定されることがあります。図は円板について、この両方の効果を計算しています。標準的な対策は次のとおりです。

- 最初は順方向モデルを滑らかにする：SoftRas の $\sigma$ を大きくする、あるいは損失にガウスぼかしをかけた画像や画像ピラミッドを使い、時間とともに鮮明にしていきます。
- 良い初期値から始める（ビジュアルハル、粗い再構成、ネットワークの予測）。
- 粗いジオメトリを先に最適化する（低解像度、少ない頂点数。その後リメッシュと細分割）。
- 正則化する：ラプラシアンの滑らかさ、法線の一貫性、エッジ長の項、あるいは Large Steps のパラメータ化。
- 多数のビューを使う。これにより多くの曖昧性と局所最小値が一度に取り除かれます。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-loss-landscape.svg" caption="左：円板（半径 6 px。目標は 32 px の位置が中心）の水平位置に対する損失。各曲線はその最大値で正規化しています。ハードな損失は、2 つの円板が重なる網掛けの帯の外側では平坦で、勾配のないプラトーです。より大きな $\sigma$ でのソフトレンダリング、あるいは両方の画像をぼかすと、盆地が広がります。右：目標が左に大きな円板、右に小さな円板（点線）を含むときの、半径 6.5 の円板の 2 次元位置 $(c\_x,c\_y)$ に対するソフトな損失（$\sigma=1.5$、色が濃いほど低い）。2 回の Adam の実行（点：開始、星：終了、白とオレンジ）は異なる盆地に落ち着き、右の小さい円板で止まるオレンジのものは局所最小値です。" %}

## 6. ボリュームとスプラット：可視性を回避する

NeRF と 3D Gaussian Splatting は、エッジサンプリングをまったく使わないのに、なぜ画像からこれほど安定して最適化できるのでしょうか。それは、ハードな表面を**半透明のボリューム**に置き換えており、その可視性が滑らかだからです。

[NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})のボリュームレンダリングでは、ピクセルは次のようになります。

$$
C = \int_{t_n}^{t_f} T(t)\,\sigma(t)\,\mathbf{c}(t)\,dt, \qquad T(t) = \exp\!\Big(-\int_{t_n}^{t}\sigma(s)\,ds\Big),
$$

ここで $\sigma$ は密度、$\mathbf{c}$ は色、$T$ は透過率です。$\sigma$ がネットワークの重みやグリッド値の滑らかな関数なら、$C$ もそうです。遮蔽物は突然現れるのではなく、その光学的深さが連続的に増えていきます。可視性は積分の指数関数になり、これはきれいに微分できます。下の左のパネルは、不透明なボックスとガウス密度のかたまりがレイを横切って滑るときの、ピクセル値を比べています。

[3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})では、各ガウシアンは、射影された中心からのオフセットが $\mathbf{d}$ のピクセルに $\alpha\_i = o\_i \exp\\!\big(-\tfrac12 \mathbf{d}^\top \Sigma\_i'^{-1}\mathbf{d}\big)$ を寄与します（不透明度 $o_i$、2 次元共分散 $\Sigma_i'$）。ピクセルは前から後ろへの合成 $C = \sum\_i \mathbf{c}\_i\,\alpha\_i \prod\_{j<i}(1-\alpha\_j)$ です。すべての $\alpha_i$ は平均、共分散、不透明度の滑らかな関数なので、勾配は境界項なしにそれらすべてに届きます。

**なお不連続のまま残るもの。**

- *ソート*：3DGS は、各レイに沿った個々の寄与の真の深度ではなく、ガウシアンの*中心*の深度で（タイルごとに）ソートします。カメラが動いて、重なり合う 2 つのガウシアンの順序が入れ替わると、合成結果が跳びます。これが「ポッピング」（popping）アーティファクトで、勾配が無視する $\theta$ における不連続性でもあります（下の右のパネル）。
- *打ち切り*：ガウシアンは約 3 標準偏差で打ち切られ、不透明度のしきい値を下回るものはスキップされるため、小さな跳びが生じます。
- *最終的なハードな表面*：オプティマイザが密度を非常に鋭くする（不透明な表面）と、滑らかさはまた失われます。

StopThePop（Radl et al., SIGGRAPH 2024）はポッピングを減らすためにピクセルごとに階層的にソートし、3D Gaussian ray tracing と EVER（8 節）は、レイに沿ってボリュームを正しい順序で、あるいは厳密に評価します。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-volume-vs-splat.svg" caption="左：遮蔽物がレイを横切って滑るときのピクセル値。黒線：不透明なボックスはステップ（微分はデルタ関数）になります。紫の実線：ガウス密度のかたまりは、よく定義された微分（紫の破線、スケーリング済み）を持つ滑らかな曲線 $e^{-\tau(p)}$ になります。右：縦軸はピクセルの赤チャンネルです。重なり合う 2 つのガウシアン（色は赤と黒、それぞれ $\alpha=0.7$）を通るレイで、カメラが回転すると深度の順序が入れ替わります。赤線：中心深度でソートした合成は $\beta=0$ で 0.21 から 0.70 へ跳び（ポッピング）、青線：レイに沿ってボリュームを厳密に積分すると連続的に変化します。" %}

## 7. ハンズオン：PyTorch による 3 つの実験

3 つの実験はすべて CPU で数秒で動きます。`bin/figures/graphics/graphics_12.py` には同じコードが入っており、図もこれで作りました。共通の設定は、ピクセル単位の $64\times64$ 画像で、ピクセル $(i,j)$ の中心は $(j+0.5,\,i+0.5)$ です。

```python
import torch

H = W = 64
ys, xs = torch.meshgrid(torch.arange(H) + 0.5, torch.arange(W) + 0.5, indexing="ij")

def coverage(cx, cy, r, ss=8):
    """Hard disc, area-averaged with ss x ss stratified samples per pixel (no gradients)."""
    o = (torch.arange(ss) + 0.5) / ss - 0.5
    oy, ox = torch.meshgrid(o, o, indexing="ij")
    px, py = xs[..., None, None] + ox, ys[..., None, None] + oy
    return (((px - cx) ** 2 + (py - cy) ** 2) < r ** 2).float().mean(dim=(-1, -2))
```

### 7.1 ソフトラスタライザでシルエットをフィッティングする

未知数は円板の $\theta = (c\_x, c\_y, r)$ で、目標はハードな円板です。ソフトレンダラーは、ステップ $H(r-d)$ を $\operatorname{sigmoid}((r-d)/\sigma)$ に置き換えます。ここで $d$ はピクセル中心から $(c\_x,c\_y)$ までの距離です。これは SoftRas の 1 次元版で、SoftRas の 2 乗距離の代わりに符号付き距離を使っています。$\sigma$ は 3 ピクセルから 0.5 ピクセルまで幾何級数的にアニーリングします。

```python
def render_soft(p, sigma):
    d = torch.sqrt((xs - p[0]) ** 2 + (ys - p[1]) ** 2 + 1e-12)
    return torch.sigmoid((p[2] - d) / sigma)

T = coverage(40.0, 26.0, 12.0)                      # target image
p = torch.tensor([30.0, 36.0, 7.0], requires_grad=True)
opt = torch.optim.Adam([p], lr=0.5)
iters = 150
for it in range(iters):
    sigma = 3.0 * (0.5 / 3.0) ** (it / (iters - 1))  # anneal: blurry -> sharp
    loss = ((render_soft(p, sigma) - T) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
    with torch.no_grad():
        p[2].clamp_(min=0.5)
print(p.detach())                                   # tensor([39.9993, 26.0007, 11.9902]); target (40, 26, 12)
```

### 7.2 エッジサンプリング勾配を持つハードラスタライザ

今度は、順方向パスではハードでスーパーサンプリングされたレンダラーをそのまま使い、その逆方向パスを境界項で手書きします。円板の境界は $\mathbf{x}(\phi) = (c\_x,c\_y) + r(\cos\phi,\sin\phi)$ で、外向き法線は $\mathbf{n} = (\cos\phi,\sin\phi)$ です。$\mathbf{x}(\phi)$ を微分すると法線方向の速度 $\mathbf{v}\cdot\mathbf{n}$ が得られます。$c_x$ については $\cos\phi$、$c_y$ については $\sin\phi$、$r$ については $1$ です。$f^{-}-f^{+} = 1$ で、ピクセルの面積を 1 とすると、境界項は次のようになります。

$$
\frac{\partial\mathcal{L}}{\partial\theta} = \oint \frac{\partial\mathcal{L}}{\partial I_{j(\mathbf{x})}}\,(\mathbf{v}\cdot\mathbf{n})\,d\ell \;\approx\; \frac{2\pi r}{M}\sum_{k=1}^{M} \frac{\partial\mathcal{L}}{\partial I_{j(\mathbf{x}_k)}}\,(\mathbf{v}\cdot\mathbf{n})_k ,
$$

ここで $j(\mathbf{x})$ は $\mathbf{x}$ を含むピクセル、$\phi_k$ は $[0,2\pi)$ 上で一様です。係数 $2\pi r/M$ はサンプルあたりの弧長、すなわち $1/(M p)$ です。

```python
class HardDiscEdgeSampled(torch.autograd.Function):
    @staticmethod
    def forward(ctx, p, n_edge):
        ctx.save_for_backward(p)
        ctx.n_edge = n_edge
        return coverage(*p.tolist(), ss=4)           # hard forward pass

    @staticmethod
    def backward(ctx, grad_img):                     # grad_img = dL/dI, shape (H, W)
        (p,) = ctx.saved_tensors
        cx, cy, r = p
        phi = torch.rand(ctx.n_edge) * 2 * torch.pi
        nx, ny = torch.cos(phi), torch.sin(phi)      # outward normal at each edge sample
        i = (cy + r * ny).floor().long()
        j = (cx + r * nx).floor().long()
        ok = (i >= 0) & (i < H) & (j >= 0) & (j < W)
        g = torch.zeros(ctx.n_edge)
        g[ok] = grad_img[i[ok], j[ok]]               # times (f_in - f_out) = 1
        w = 2 * torch.pi * r / ctx.n_edge            # arc length per sample
        return torch.stack([(g * nx).sum(), (g * ny).sum(), g.sum()]) * w, None

p = torch.tensor([30.0, 36.0, 7.0], requires_grad=True)
opt = torch.optim.Adam([p], lr=0.5)
for it in range(150):
    loss = ((HardDiscEdgeSampled.apply(p, 256) - T) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
print(p.detach())                    # e.g. tensor([40.0112, 26.0081, 12.0141]); varies with the seed
```

3 つ目の実行では、ハードなレンダラーを `(torch.sign(p[2] - d) + 1) / 2` で素朴に微分します。すると勾配はちょうどゼロになり、Adam はまったく動きません（下の図の右側の灰色の線）。

{% include blog_figure.liquid path="assets/img/blog/graphics/12-silhouette-fit.svg" caption="7 節の 2 つの最適化。同じ開始点（黒い点）から目標の円板（灰色）へ。左：$\sigma$ を 3 から 0.5 px までアニーリングしたソフトラスタライザ。円は反復 0、10、25、50、150 を示し（濃いほど後）、黒い線は中心の軌跡です。中：エッジサンプリング勾配を持つハードラスタライザ（$M=256$）。右：両者の反復ごとの*真の*画像損失（ハードな円板、ピクセルあたり 64 サンプル）に、素朴なハード + 自動微分の実行を加えたもの。この実行は勾配がゼロなので平坦なままです。" %}

注目すべき点：ソフトの実行は滑らかに動きますが、損失をぼかした画像で測っているため、最後に $\sigma$ を縮める必要があります。エッジサンプリングの実行は鮮明な画像の厳密な勾配に従いますが、勾配はモンテカルロ推定なので、経路はぶれ、損失は $M$ とともに縮むノイズの下限で頭打ちになります。目標とほとんど重ならない開始位置も含めて、実際に試してみてください。

{% include widget.liquid name="graphics-silhouette-fit" height="440" caption="7.1 節と 7.2 節の $32\times32$ 画像でのライブ版。勾配（$\sigma$ を指定したソフトラスタライザ、$M$ サンプルのハード + エッジサンプリング、素朴なハード + 自動微分）を選び、画像上をドラッグして開始円板を置き、Run を押します。曲線には各手法の直近の実行が残り、常に真のハードな損失で測定されます。目標から遠くから開始してみてください。小さな $\sigma$ は止まってしまい、大きな $\sigma$ ならまだ見つけられます。エッジサンプリングは、円板が目標とまったく重ならない場合には円板を縮めます（得られる唯一の境界信号は、円板が背景を覆っているということだからです）。" %}

### 7.3 球のアルベドと粗さをフィッティングする

シェーディングパラメータには可視性の問題がないので、素朴な自動微分でうまくいきます。球を正射影でレンダリングします（カメラは $+z$ にあって $-z$ を向き、単位円板の内側で法線は $\mathbf{n} = (x, y, \sqrt{1-x^2-y^2})$）。光源は放射照度 $E$ の平行光源が 1 つです。BRDF は、ランバートに、[第 4 回]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})の Cook-Torrance GGX スペキュラを加えたものです。

$$
f_r = \frac{\boldsymbol{\rho}}{\pi} + \frac{D(\mathbf{h})\,G(\mathbf{l},\mathbf{v})\,F(\mathbf{v},\mathbf{h})}{4\,(\mathbf{n}\cdot\mathbf{l})(\mathbf{n}\cdot\mathbf{v})}, \qquad L_o = f_r\,E\,\max(0,\mathbf{n}\cdot\mathbf{l}) + 0.05\,\boldsymbol{\rho},
$$

GGX 分布 $D$（$\alpha = $ roughness$^2$）、Smith のマスキング $G = G\_1(\mathbf{l})G\_1(\mathbf{v})$、$F_0 = 0.04$ の Schlick フレネル、そして小さな環境光項を使います。未知数は RGB のアルベド $\boldsymbol{\rho}$ と粗さで、シグモイドで範囲内に収めます。下のコードがフィッティングの全体で、コードの後の図がその収束の様子を示します。

```python
import torch

def sphere_setup(res=64):
    c = (torch.arange(res) + 0.5) / res * 2 - 1
    y, x = torch.meshgrid(-c, c, indexing="ij")            # row 0 is the top (y = +1)
    mask = (x ** 2 + y ** 2) < 1
    z = torch.sqrt(torch.clamp(1 - x ** 2 - y ** 2, min=0))
    return torch.stack([x, y, z], -1) * mask[..., None], mask   # normal = 0 outside the disc

def shade(n, mask, albedo, rough, light=(-0.4, 0.5, 0.75), E=3.0):
    l = torch.tensor(light); l = l / l.norm()
    v = torch.tensor([0.0, 0.0, 1.0])
    h = (l + v) / (l + v).norm()
    nl = (n @ l).clamp(min=0)[..., None]
    nv = (n @ v).clamp(min=1e-4)[..., None]
    nh = (n @ h).clamp(min=0)[..., None]
    a2 = (rough ** 2) ** 2                                 # alpha = rough^2
    D = a2 / (torch.pi * (nh ** 2 * (a2 - 1) + 1) ** 2)
    G1 = lambda c: 2 * c / (c + torch.sqrt(a2 + (1 - a2) * c ** 2))
    F = 0.04 + 0.96 * (1 - (h @ v)) ** 5
    spec = D * G1(nl.clamp(min=1e-4)) * G1(nv) * F / (4 * nl.clamp(min=1e-4) * nv)
    return ((albedo / torch.pi + spec) * E * nl + 0.05 * albedo) * mask[..., None]

n, mask = sphere_setup()
target = shade(n, mask, torch.tensor([0.80, 0.35, 0.20]), torch.tensor(0.35))
a_raw = torch.zeros(3, requires_grad=True)                 # albedo starts at 0.5 gray
r_raw = torch.tensor(1.2, requires_grad=True)              # roughness starts near 0.8
opt = torch.optim.Adam([a_raw, r_raw], lr=0.05)
for it in range(200):
    albedo, rough = torch.sigmoid(a_raw), 0.05 + 0.95 * torch.sigmoid(r_raw)
    loss = ((shade(n, mask, albedo, rough) - target) ** 2).mean()
    opt.zero_grad(); loss.backward(); opt.step()
print(torch.sigmoid(a_raw).detach(), (0.05 + 0.95 * torch.sigmoid(r_raw)).item())
# tensor([0.8000, 0.3500, 0.2000]) 0.35000815987586975
```

{% include blog_figure.liquid path="assets/img/blog/graphics/12-brdf-fit.svg" caption="既知の光源の下での球のアルベドと粗さのフィッティング。上：反復 0、25、200 でのレンダリングと目標（表示ガンマ 2.2）。下：Adam の反復ごとの 3 つのアルベドチャンネルと粗さ（実線）を真値（破線）と比べたもの、および損失（凡例の $\rho$ は紫色の粗さを表し、本文のアルベドではない点に注意）。アルベドは広い拡散領域によって決まり、粗さはハイライトの形と大きさだけで決まります。" %}

何がこれを簡単にしたかに注目してください。既知の光源が 1 つ、既知の形状、そして正しい形式のマテリアルモデルです。光の強度も自由パラメータにすると、1 節の最初の曖昧性に出会います（試してみてください。光とアルベドの積は復元されますが、それぞれの因子は復元されません）。

## 8. 研究の方向性、2024 年から 2026 年

2026 年 11 月時点で、特に活発な方向が 3 つあります。以下の状況は arXiv または出版社で確認したものです。

**ガウスプリミティブの微分可能レンダリングとレイトレーシング。** Gaussian splatting のラスタライザは近似的にソートするため、二次レイを追えません。*3D Gaussian Ray Tracing*（Moenne-Loccoz et al., SIGGRAPH Asia 2024）は、境界メッシュのプロキシを通じてハードウェアレイトレーシングで粒子をトレースし、各レイに沿って正しい順序で処理し、すべてを微分可能に保ちます。*3DGUT*（Wu et al., CVPR 2025）は代わりにアンセンテッド変換（unscented transform）を使って、歪んだカメラを通してガウシアンを射影し、ラスタライゼーションの枠組みの中で二次レイを可能にします。*EVER*（Mai et al., arXiv preprint 2410.01804, 2024）は、密度が一定の楕円体を*厳密な*ボリューム積分でレンダリングし、構成上ポッピングを取り除きます。逆レンダリングの側では、*IRGS*（Gu et al., CVPR 2025）が、微分可能な 2D ガウシアンのレイトレーシングを使って、マテリアルと照明を復元する際の相互反射を考慮しており、その後継の *IRGS++*（arXiv preprint 2607.22780, 2026 年 7 月）は、重点サンプリングとデノイズによって金属にまで拡張しています。*UTrice*（Liu et al., arXiv preprint 2512.04421, 2025 年 12 月）は、三角形そのものをプリミティブとして、単一の微分可能なレイトレーサーとラスタライザで使います。

**物理とレンダリングの結合。** 微分可能なシミュレータ（[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})）が生成したジオメトリを微分可能なレンダラーが画像化するなら、勾配は動画のピクセルから物理パラメータへ逆向きに流れます。これが動画からの*システム同定*（system identification）です。*PAC-NeRF*（Li et al., ICLR 2023）は、放射輝度場を微分可能な物質点法（material point method, MPM）と結合して、多視点動画からマテリアルパラメータを推定します。*PhysGaussian*（Xie et al., CVPR 2024）は、同じガウシアンを MPM シミュレーションとレンダリングの両方に使います。*PhysTwin*（Jiang et al., arXiv preprint 2503.17973, 2025）は、ガウシアンでレンダリングされるバネ-質点モデルを、変形物体のまばらな動画にフィッティングします。*MOSIV*（Liu et al., ICLR 2026）は、微分可能なシミュレータを通じて、複数物体のシーンでの物体ごとのマテリアルパラメータを同定します。

**生成事前分布による逆レンダリング。** 1 枚の画像は絶望的なほど曖昧なので（1 節）、最近の研究では、手作りの正則化項を、合成レンダリングで訓練した拡散モデルに置き換えています。*RGB↔X*（Zeng et al., SIGGRAPH 2024）は、マテリアルと照明を考慮した拡散モデルによって、画像をアルベド、法線、粗さ、金属性、照明に分解し、それらのチャンネルから画像を合成し直します。*DiffusionRenderer*（Liang et al., CVPR 2025）は、動画拡散モデルで逆レンダリングと順レンダリングを行い、実写動画のリライティングとマテリアル編集を可能にします。*UniRelight*（He et al., arXiv preprint 2506.15673, 2025）は、アルベド推定とリライティングを同時に学習し、*Relit-LiVE*（Xiao et al., arXiv 2605.06658。arXiv のコメントによれば SIGGRAPH 2026 採択）は、リライトされたフレームをフレームごとの環境マップとともに予測します。これらが提起する未解決の問いは、「マテリアルがどう見えるかを知っている」生成事前分布を、ビュー間の一貫性を保証する物理ベースの微分可能レンダラーとどう組み合わせるか、ということです。

## 9. まとめ

- 逆レンダリングは、シーンパラメータに関して画像損失を最小化します。難しいのは $\partial I/\partial\theta$ です。
- シェーディングパラメータの微分は滑らかです。ジオメトリと可視性は被積分関数を不連続にするので、画像の微分には**境界項**（レイノルズの輸送）が含まれ、サンプリングされたレンダラーの自動微分はそれを完全に取りこぼします。
- ラスタライザは、順方向パスを滑らかにする（SoftRas、PyTorch3D）、逆方向パスを設計する（OpenDR、NMR）、あるいはアンチエイリアスを通じて境界項を近似する（nvdiffrast）のいずれかを行います。
- 物理ベースの微分可能レンダラーは、エッジサンプリング、再パラメータ化、warped-area sampling、あるいはパス空間サンプリングで境界項を推定し、放射逆伝播とパスリプレイで巨大なテープを避けます。Mitsuba 3 と Dr.Jit はこれらすべてをまとめて提供します。
- 実際には、成功は初期化、粗から密へのスケジュール、正則化（Large Steps）にかかっています。
- ボリュームとガウシアンは可視性を滑らかにします。これが NeRF や 3DGS がうまく最適化できる大きな理由で、残るのはソートと打ち切りです。

## 代表的な論文

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Loper & Black, *OpenDR: An Approximate Differentiable Renderer* | ECCV | 2014 | [DOI](https://doi.org/10.1007/978-3-319-10584-0_11) | 画像空間の微分近似を用いた、最初の汎用的な微分可能レンダラー |
| Kato, Ushiku & Harada, *Neural 3D Mesh Renderer* | CVPR | 2018 | [arXiv](https://arxiv.org/abs/1711.07566) | メッシュ再構成のための、手で設計したラスタライゼーション勾配 |
| Li, Aittala, Durand & Lehtinen, *Differentiable Monte Carlo Ray Tracing through Edge Sampling* | SIGGRAPH Asia (TOG) | 2018 | [DOI](https://doi.org/10.1145/3272127.3275109) | 一次・二次可視性に対する初の不偏な勾配 |
| Liu, Li, Chen & Li, *Soft Rasterizer* | ICCV | 2019 | [arXiv](https://arxiv.org/abs/1904.01786) | 確率的で完全に滑らかなラスタライゼーション |
| Loubet, Holzschuch & Jakob, *Reparameterizing Discontinuous Integrands for Differentiable Rendering* | SIGGRAPH Asia (TOG) | 2019 | [DOI](https://doi.org/10.1145/3355089.3356510) | エッジをサンプリングする代わりに、不連続性をパラメータとともに動かす |
| Nimier-David et al., *Mitsuba 2: A Retargetable Forward and Inverse Renderer* | SIGGRAPH Asia (TOG) | 2019 | [DOI](https://doi.org/10.1145/3355089.3356498) | 自動微分を備えた、リターゲット可能な研究用レンダラー |
| Zhang et al., *Path-Space Differentiable Rendering* | SIGGRAPH (TOG) | 2020 | [DOI](https://doi.org/10.1145/3386569.3392383) | 境界項を境界パスにわたる積分として扱う |
| Nimier-David et al., *Radiative Backpropagation* | SIGGRAPH (TOG) | 2020 | [DOI](https://doi.org/10.1145/3386569.3392406) | 勾配を随伴光輸送として計算し、テープが不要 |
| Bangaru, Li & Durand, *Unbiased Warped-Area Sampling for Differentiable Rendering* | SIGGRAPH Asia (TOG) | 2020 | [DOI](https://doi.org/10.1145/3414685.3417833) | 発散定理による不偏な境界項 |
| Laine et al., *Modular Primitives for High-Performance Differentiable Rendering* (nvdiffrast) | SIGGRAPH Asia (TOG) | 2020 | [arXiv](https://arxiv.org/abs/2011.03277) | アンチエイリアスに基づくエッジ勾配を持つ、高速な GPU ラスタライゼーション |
| Ravi et al., *Accelerating 3D Deep Learning with PyTorch3D* | arXiv | 2020 | [arXiv](https://arxiv.org/abs/2007.08501) | PyTorch の微分可能なメッシュおよび点群レンダラー |
| Vicini, Speierer & Jakob, *Path Replay Backpropagation* | SIGGRAPH (TOG) | 2021 | [DOI](https://doi.org/10.1145/3450626.3459804) | 線形時間・定数メモリの微分可能パストレーシング |
| Nicolet, Jacobson & Jakob, *Large Steps in Inverse Rendering of Geometry* | SIGGRAPH Asia (TOG) | 2021 | [DOI](https://doi.org/10.1145/3478513.3480501) | 頑健な形状最適化のためのラプラシアン再パラメータ化 |
| Jakob, Speierer, Roussel & Vicini, *Dr.Jit: A Just-In-Time Compiler for Differentiable Rendering* | SIGGRAPH (TOG) | 2022 | [DOI](https://doi.org/10.1145/3528223.3530099) | Mitsuba 3 の基盤となる JIT／自動微分エンジン |
| Munkberg et al., *Extracting Triangular 3D Models, Materials, and Lighting From Images* (nvdiffrec) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2111.12503) | nvdiffrast によるメッシュ・マテリアル・光源の同時復元 |
| Moenne-Loccoz et al., *3D Gaussian Ray Tracing* | SIGGRAPH Asia (TOG) | 2024 | [arXiv](https://arxiv.org/abs/2407.07090) | ガウス粒子の微分可能なレイトレーシング |
| Liang et al., *DiffusionRenderer* | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.18590) | 動画拡散事前分布による逆レンダリングと順レンダリング |

## 学習リソース

- Shuang Zhao, Wenzel Jakob and Tzu-Mao Li, [*Physics-Based Differentiable Rendering: A Comprehensive Introduction*](https://courses.shuangz.com/pbdr-course-sg20/)（SIGGRAPH 2020 コース）：2 節と 4 節の理論を深く解説しており、スライドと動画があります。
- Kato et al., [*Differentiable Rendering: A Survey*](https://arxiv.org/abs/2006.12057)（2020）：メッシュ、ボクセル、点群、陰関数の微分可能レンダラーの概観。
- [Mitsuba 3](https://github.com/mitsuba-renderer/mitsuba3) と、そのドキュメントにある逆レンダリングのチュートリアル（勾配ベースの最適化のチュートリアルから始め、次に形状とコースティクスの最適化へ）。
- 微分可能ラスタライゼーションには [nvdiffrast](https://github.com/NVlabs/nvdiffrast) と [PyTorch3D](https://github.com/facebookresearch/pytorch3d)、元のソフトラスタライザのコードには [SoftRas](https://github.com/ShichenLiu/SoftRas)。
- Tzu-Mao Li の博士論文 *Differentiable Visual Computing*（MIT, 2019）は、エッジサンプリングと微分可能な画像処理への、読みやすい長編の入門です。
- ニューラルレンダリングのシリーズは、6 節が終わったところから続きます：[NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})と [3D Gaussian Splatting]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})。

## 演習

1. **境界項を手計算する。** 単位ピクセルを、エッジ $x\cos\varphi + y\sin\varphi = \theta$（$\varphi = 45^\circ$、$\theta = 0.5$）が横切っています。内側（$\mathbf{n}\cdot\mathbf{x}<\theta$）の値は 1、外側は 0 です。被覆面積 $A$ と $dA/d\theta$ を計算し、エッジ勾配ウィジェットで確かめてください。

   <details markdown="1"><summary>ヒント</summary>
   この直線は $(0.707, 0)$ と $(0, 0.707)$ を通るので、被覆された領域は 2 辺が $0.707$ の直角三角形で、$A = 0.25$ です。ピクセル内のエッジの長さは $\ell = 0.707\sqrt2 = 1$ なので、$dA/d\theta = \ell = 1$ です（確認：この角度では $A(\theta) = \theta^2$ で、$2\theta = 1$）。
   </details>

2. **有限差分のバイアス。** 1 次元の例で $N$ 個の層化サンプルがあるとき、前進差分は、一様ランダムなエッジ位置 $\theta$ について平均する（ピクセルの両端は無視する）と真の微分に等しい一方で、固定した $\theta$ では $0$ と $(f\_{\rm in}-f\_{\rm out})/(Nh)$ の倍数の値しか取らないことを示してください。これは、SGD の中で FD 勾配を使うことについて何を意味しますか。

   <details markdown="1"><summary>ヒント</summary>
   各サンプルは、ちょうど $(\theta, \theta+h]$ の中にあるときに $(f\_{\rm in}-f\_{\rm out})/N$ の跳びを寄与し、そのとき差分商は $(f\_{\rm in}-f\_{\rm out})/(Nh)$ になります。$N$ 個の層化サンプルは $1/N$ 間隔なので、一様ランダムな $\theta$（$h \le 1/N$）に対してこれが起こる確率は $h$ ではなく $Nh$ です。したがって平均は $f\_{\rm in}-f\_{\rm out}$ となり、推定量は $\theta$ について平均すれば不偏ですが、2 次モーメントは $(f\_{\rm in}-f\_{\rm out})^2/(Nh)$ なので、分散は $1/(Nh)$ のように大きくなります。
   </details>

3. **三角形のエッジサンプリング。** `HardDiscEdgeSampled` を、頂点 $\mathbf{p}\_0,\mathbf{p}\_1,\mathbf{p}\_2$ を持つ三角形に拡張してください。エッジ $ab$ 上の点 $\mathbf{x} = (1-t)\mathbf{p}\_a + t\,\mathbf{p}\_b$ について、$\mathbf{p}_a$ の各座標に関する $\mathbf{v}\cdot\mathbf{n}$ はいくらですか。

   <details markdown="1"><summary>ヒント</summary>
   $\partial\mathbf{x}/\partial\mathbf{p}_a = (1-t)\mathbf{I}$ なので、$\mathbf{p}_a$ の $x$ 座標に関する法線方向の速度は $(1-t)\,n_x$、$y$ 座標については $(1-t)\,n_y$ です。$t$ は一様にサンプリングし、エッジは長さに比例してサンプリングします。
   </details>

4. **曖昧性を実際に見る。** 球の実験（7.3）で、光の放射照度 $E$ を 3 つ目の未知数にしてください。どの量が収束し、どの量がドリフトしますか。2 つ目の光の方向、または $E$ に対する事前分布を加えて、繰り返してください。

5. **Large Steps。** 2 次元曲線のおもちゃの例で、$\lambda \in \\{0, 1, 5, 20\\}$ を変化させ、300 ステップ後の最終誤差をプロットしてください。$\lambda$ が非常に大きいと、5 枚の花びらのフィッティングが遅くなるのはなぜですか。（閉路グラフのラプラシアンの固有値 $\mu_k = 2-2\cos(2\pi k/N)$ を使ってください。）

シリーズの次回：[2026 年の研究フロンティア]({{ '/blog/2026/graphics-13-research-frontiers-2026/' | relative_url }})。今年の SIGGRAPH、SIGGRAPH Asia、その他のグラフィックス関連の学会で発表された内容を巡るツアーです。
