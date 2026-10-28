---
layout: post
title: "物理ベースレンダリング：放射測定、レンダリング方程式、GGX"
date: 2026-10-27 09:04:00+0900
description: "ワットから放射輝度へ。レンダリング方程式、BRDF の性質、GGX マイクロファセットモデル、メタリック・ラフネスのワークフロー、split-sum によるイメージベースドライティングを、数値検証と GLSL シェーダー付きで解説します。"
categories: graphics
tags: [pbr, radiometry, rendering-equation, brdf, microfacet, ggx, ibl]
series: graphics
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## なぜ重要なのか

[前回]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})は Lambert、Phong、Blinn-Phong で表面をシェーディングしました。これらのモデルはそれらしく見えますが、パラメータ（「光沢度」の指数やスペキュラー色）には物理的な意味がなく、エネルギーも保存しません。そのため、ある照明で調整したアセットが別の照明では不自然に見えます。**物理ベースレンダリング（physically based rendering, PBR）** は、これらを測定可能な量で置き換えます。放射輝度、物理法則に従う反射関数、そしてどんな照明下でも一貫して振る舞う少数のマテリアルパラメータです。この記事はシリーズの理論的な中核です。ここで定義するレンダリング方程式こそ、[次回]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})のパストレーサーが解く方程式であり、NeRF や 3D Gaussian Splatting などのニューラルレンダリングが近似している画像形成モデルでもあります。

## 前提知識

- [第 1 回]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})のベクトル、内積、局所座標系。[第 3 回]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})のハーフベクトルと法線マップ。
- 球座標での二重積分。
- 基礎的な確率（期待値、確率密度）。split-sum の節の理解に役立ちます。

## 1. 放射測定：光を測る

レンダリングとは、光のエネルギーがシーンの中をどう移動するかのシミュレーションです。そこでまず単位が必要になります。ここでは光を幾何光学（geometric optics）で扱います。光は直進し、回折や干渉などの波動効果は無視します。

### 立体角

平面角は弧の長さを半径で割ったものです。**立体角（solid angle）** は、方向の集合が単位球面上で占める面積で、単位はステラジアン（sr）です。全球は $4\pi$ sr、半球は $2\pi$ sr です。球座標（法線からの極角 $\theta$、方位角 $\phi$）では、微小立体角は

$$
d\omega = \sin\theta \, d\theta \, d\phi
$$

です。距離 $r$ にある面積 $dA$ の小さな面素が、視線に対して法線の角度 $\theta'$ をなすとき、その面素が張る立体角は

$$
d\omega = \frac{dA \cos\theta'}{r^2}
$$

です。この恒等式を使うと、方向についての積分と表面についての積分を行き来できます。レンダリング方程式の面積形式を書くときと、次回の光源サンプリングで再び使います。

シェーディングのいたるところに現れる便利な積分があります。

$$
\int_{\Omega} \cos\theta \, d\omega = \int_0^{2\pi}\!\!\int_0^{\pi/2} \cos\theta \sin\theta \, d\theta\, d\phi = \pi .
$$

この $\pi$ こそ、Lambert BRDF が $\rho$ ではなく $\rho/\pi$ になる理由です。

### 放射束、放射照度、放射強度、放射輝度

| 量 | 記号 | 定義 | 単位 |
| --- | --- | --- | --- |
| 放射束（パワー）（radiant flux） | $\Phi$ | 単位時間あたりのエネルギー | W |
| 放射照度（入射、irradiance）/ 放射発散度（出射、radiant exitance） | $E$, $M$ | $d\Phi / dA$ | W m$^{-2}$ |
| 放射強度（radiant intensity） | $I$ | $d\Phi / d\omega$ | W sr$^{-1}$ |
| 放射輝度（radiance） | $L$ | $\dfrac{d^2\Phi}{dA\,\cos\theta\,d\omega}$ | W m$^{-2}$ sr$^{-1}$ |

**放射輝度**は、カメラの画素や目が実際に測る量です。単位*投影*面積・単位立体角あたりのパワーです。次の 2 つの性質により、レイに載せる量として最適です。

1. 真空中では、放射輝度は**レイに沿って一定**です。センサーを壁から遠ざけると、各画素が見る壁の面積は大きくなりますが、その面積が張る立体角は小さくなり、2 つの効果が打ち消し合います。レイトレーシングがパスに沿って放射輝度の値をそのまま運べるのはこのためです。
2. 他のすべての量は放射輝度の積分です。たとえば法線 $n$ の点における放射照度は

$$
E(x) = \int_{\Omega} L_i(x,\omega_i) \cos\theta_i \, d\omega_i
$$

です。$\cos\theta_i$ は Lambert の余弦則です。かすめる角度で届く光束は、より広い面積に広がります。

強度 $I$ の**点光源**から距離 $r$ の点では、放射照度は $E = I\cos\theta / r^2$ になります（逆二乗則）。この記事の最後のシェーダーにある `E = I * NoL / dist2` がこの行です。なお、リアルタイムエンジンの「ライト色 × 強度」は通常まさにこの $I$ であり、ワットの代わりに測光単位（カンデラ）を使うこともあります。

## 2. BRDF

ある点に届いた光は、反射されるか、透過するか、吸収されます。不透明な表面では、**双方向反射率分布関数（bidirectional reflectance distribution function, BRDF）** が、方向 $\omega_i$ から届く放射照度のうちどれだけが $\omega_o$ 方向への放射輝度として反射されるかを表します。

$$
f_r(x, \omega_i, \omega_o) = \frac{dL_o(x,\omega_o)}{dE_i(x,\omega_i)} = \frac{dL_o(x,\omega_o)}{L_i(x,\omega_i)\cos\theta_i \, d\omega_i} \quad [\text{sr}^{-1}].
$$

物理的にもっともらしい BRDF は 3 つの性質を満たします。

- **非負性（positivity）**：$f_r \ge 0$。
- **Helmholtz の相反性（reciprocity）**：$f_r(\omega_i,\omega_o) = f_r(\omega_o,\omega_i)$。光の経路はどちらの向きにもたどれます。双方向アルゴリズムはこれに依存しています。
- **エネルギー保存（energy conservation）**：すべての出射方向について、**方向アルベド（directional albedo）** が 1 以下です。

$$
\rho(\omega_o) = \int_{\Omega} f_r(\omega_i,\omega_o)\cos\theta_i \, d\omega_i \le 1 .
$$

Lambert BRDF $f_r = \rho/\pi$ では $\rho(\omega_o) = (\rho/\pi)\cdot\pi = \rho$ となるので、アルベドが $\rho \le 1$ であればエネルギーは保存されます。これに対し古典的な Phong モデルは、パラメータによっては相反性とエネルギー保存の両方を破ります。正規化 Blinn-Phong ローブ $\frac{s+8}{8\pi}(n\cdot h)^s$ は初期の対処法でした（『Real-Time Rendering』参照）が、マイクロファセット理論は原理に基づいた答えを与えます。

一般化として、BTDF は透過を、BSDF は反射と透過の両方を表し、BSSRDF は光がある点から入って別の点から出ることを許します（肌、大理石、牛乳の表面下散乱）。

## 3. レンダリング方程式

BRDF の定義から、**反射方程式（reflection equation）** がすぐに得られます。すべての入射方向からの反射放射輝度を足し合わせるだけです。これに自己発光を加えたものが**レンダリング方程式（rendering equation）** です。Kajiya（SIGGRAPH 1986）がグラフィックスに導入し、同じ年に Immel、Cohen、Greenberg も同じ方程式を提案しました。

$$
L_o(x,\omega_o) = L_e(x,\omega_o) + \int_{\Omega} f_r(x,\omega_i,\omega_o)\, L_i(x,\omega_i)\, \cos\theta_i \, d\omega_i .
$$

難しいのは、$L_i$ が与えられていない点です。真空中では、$\omega_i$ から $x$ に届く放射輝度は、そのレイが最初に当たる表面点から出ていく放射輝度、すなわち $L_i(x,\omega_i) = L_o(\mathrm{trace}(x,\omega_i), -\omega_i)$ です。未知の $L$ が両辺に現れるので、これは第 2 種の Fredholm 積分方程式です。

Kajiya は**3 点（面積）形式**で書きました。$d\omega = dA\cos\theta'/r^2$ を使うと、方向の代わりにシーンのすべての表面 $M$ で積分できます。

$$
L_o(x' \to x) = L_e(x' \to x) + \int_{M} f_r(x'' \to x' \to x)\, L_o(x'' \to x')\, G(x'', x')\, dA(x''),
$$

$$
G(x'',x') = V(x'',x')\,\frac{\cos\theta''\cos\theta'}{\lVert x''-x'\rVert^2}.
$$

ここで $V$ は 0 か 1 をとる可視性項です。面積形式は、次回の光源サンプリング（next-event estimation）の自然な出発点になります。

積分を線形な輸送作用素 $\mathcal{T}$ で書くと、方程式は $L = L_e + \mathcal{T}L$ となり、その解は Neumann 級数

$$
L = L_e + \mathcal{T}L_e + \mathcal{T}^2L_e + \cdots
$$

です。各項がバウンス 1 回分に対応します。$L_e$ は直接見える光源、$\mathcal{T}L_e$ は直接照明、それより高次の項は間接照明（大域照明）です。ラスタライズと局所シェーディングモデルの組み合わせは最初の 2 項しか計算しません。パストレーサーはモンテカルロ積分で級数全体を推定します。

## 4. マイクロファセット理論

現実の表面は、画素より小さく光の波長より大きいスケールで粗くなっています。マイクロファセット理論（microfacet theory）は、そのような表面を、向きが統計的に分布した多数の小さな完全鏡面（マイクロファセット）としてモデル化します。この微細表面が光を観察者へどう反射するかは、3 つの要素で記述されます。

- $D(m)$：**法線分布関数（normal distribution function, NDF）**。マイクロファセット法線 $m$ の密度です。
- $F(\omega, m)$：滑らかな各マイクロファセットの **Fresnel** 反射率。
- $G_2(\omega_i,\omega_o,m)$：**マスキング・シャドウイング関数（masking-shadowing function）**。光源と観察者の両方から見えるマイクロファセットの割合です。

### Cook-Torrance スペキュラー BRDF

$\omega_i$ からの光を $\omega_o$ へ鏡面反射できるのは、法線がハーフベクトル $h = (\omega_i+\omega_o)/\lVert\omega_i+\omega_o\rVert$ に一致するマイクロファセットだけです。Walter ら（EGSR 2007）に従うと、マクロな BRDF は、各ファセットの寄与を投影面積と可視性で重み付けして積分したものです。

$$
f_r(\omega_i,\omega_o) = \int_{\Omega} \frac{\lvert \omega_i\cdot m\rvert}{\lvert \omega_i\cdot n\rvert}\, f_\mu(\omega_i,\omega_o,m)\, \frac{\lvert \omega_o\cdot m\rvert}{\lvert \omega_o\cdot n\rvert}\, G_2(\omega_i,\omega_o,m)\, D(m)\, d\omega_m .
$$

完全鏡面のマイクロファセットでは、$f_\mu$ は $\omega_o$ に関するデルタ分布です。これを $m$ に関するデルタに変換するには、ハーフベクトル写像のヤコビアンが必要です。

$$
\left\lVert \frac{\partial \omega_h}{\partial \omega_o} \right\rVert = \frac{1}{4\,\lvert \omega_o\cdot h\rvert}.
$$

これにより $f_\mu = F(\omega_i,m)\,\delta_\omega(m,h) / (4(\omega_i\cdot h)^2)$ が得られます。代入して $\omega_i\cdot h = \omega_o\cdot h$ を使うと、積分はつぶれて次の形になります。

$$
f_{\text{spec}}(\omega_i,\omega_o) = \frac{F(\omega_i,h)\; G_2(\omega_i,\omega_o,h)\; D(h)}{4\,\lvert n\cdot\omega_i\rvert\,\lvert n\cdot\omega_o\rvert}.
$$

これが **Cook-Torrance** の形です（Cook と Torrance は TOG 1982 で Beckmann NDF と V 字溝の $G$ を使いました）。分母の $4$ はヤコビアンから来るもので、恣意的な正規化定数ではありません。分母の 2 つのコサインは、微細表面とマクロ表面の投影面積の換算から来ています。リアルタイムのコードでは、$G_2$ と分母をまとめて**可視性項（visibility term）** $V = G_2 / (4\lvert n\cdot\omega_i\rvert\lvert n\cdot\omega_o\rvert)$ とすることがよくあります。

### NDF は正規化されていなければならない

$D$ は*面積*の密度です。すべてのマイクロファセットをマクロ表面へ投影した面積はマクロ面積に等しくなければならないので、次の正規化条件が得られます。

$$
\int_{\Omega} D(m)\,(n\cdot m)\, d\omega_m = 1 .
$$

### GGX / Trowbridge-Reitz

今日もっとも広く使われている NDF は、Trowbridge と Reitz（JOSA 1975）が楕円体のマイクロファセットについて導いたもので、Walter ら（2007）がグラフィックス向けに再発見し、**GGX** と名付けました。

$$
D_{\text{GGX}}(h) = \frac{\alpha^2}{\pi\left((n\cdot h)^2(\alpha^2-1)+1\right)^2}.
$$

$\alpha$ はラフネスです。$\alpha\to 0$ で $D$ はデルタ（鏡面）に近づきます。$\alpha=1$ では $D = 1/\pi$ となり、マイクロファセット法線は一様に分布します。ガウス分布に似た Beckmann 分布と比べると、GGX はピークが鋭く**裾が長い**ため、実測マテリアルに見られる「明るいハイライトと柔らかいハロー」が生まれます。

ヘアライン加工の金属のような異方性表面では、接空間成分 $h_x,h_y,h_z$ とラフネス $\alpha_x,\alpha_y$ を使って次のように書きます。

$$
D(h) = \frac{1}{\pi\,\alpha_x\alpha_y\left(\frac{h_x^2}{\alpha_x^2}+\frac{h_y^2}{\alpha_y^2}+h_z^2\right)^2}.
$$

### Smith のマスキング・シャドウイング

Heitz（JCGT 2014）は、整合的なマスキング関数が NDF と微細表面の形状に関する仮定によって決まることを示しました。**Smith** の仮定（高さと法線が無相関）のもとで、方向 $\omega$ のマスキング関数は

$$
G_1(\omega,m) = \frac{\chi^+(\omega\cdot m)}{1+\Lambda(\omega)},
\qquad
\Lambda_{\text{GGX}}(\omega) = \frac{-1+\sqrt{1+\alpha^2\tan^2\theta}}{2}
$$

です。$\chi^+$ は引数が正なら 1、それ以外なら 0 です。これは NDF と整合しています。つまり、マイクロファセットの可視投影面積は常にマクロ表面の投影面積に等しくなります。

$$
\int_{\Omega} G_1(\omega,m)\,\max(0,\omega\cdot m)\, D(m)\, d\omega_m = n\cdot\omega .
$$

マスキング（視線側）とシャドウイング（光源側）を $G_2$ にまとめる方法は、よく使われるものが 2 つあります。

- **分離型（separable）**：$G_2 = G_1(\omega_i)\,G_1(\omega_o)$。2 つの事象を独立とみなすので、遮蔽を過大評価します。
- **高さ相関型（height-correlated）**：$G_2 = \dfrac{1}{1+\Lambda(\omega_i)+\Lambda(\omega_o)}$。表面の高い位置にあるマイクロファセットほど、見えていてかつ照らされている可能性が高くなります。Heitz はより正確なこちらの形を推奨しており、計算コストはほぼ同じです。

$\Lambda_{\text{GGX}}$ を高さ相関型の $G_2$ に代入し、$4(n\cdot\omega_i)(n\cdot\omega_o)$ で割ると、コンパクトな可視性項が得られます（Filament をはじめ多くのエンジンで使われています）。

$$
V(\omega_i,\omega_o) = \frac{0.5}{(n\cdot\omega_i)\sqrt{(n\cdot\omega_o)^2(1-\alpha^2)+\alpha^2} + (n\cdot\omega_o)\sqrt{(n\cdot\omega_i)^2(1-\alpha^2)+\alpha^2}} .
$$

導出は、$\tan^2\theta = (1-\cos^2\theta)/\cos^2\theta$ と書くと $1+\Lambda = \frac{1}{2}\left(1+\sqrt{\cos^2\theta(1-\alpha^2)+\alpha^2}/\cos\theta\right)$ となるので、これを整理するだけです。

### Fresnel と Schlick 近似

滑らかな界面が反射する光の割合は、かすめる角度に近づくほど大きくなります。つや消しの床でさえ、床に沿って見ると鏡のようになります。厳密な Fresnel 方程式は複素屈折率と偏光に依存します。Schlick（Computer Graphics Forum 1994）は次の近似を提案しました。

$$
F(\omega,h) \approx F_0 + (1-F_0)\,(1-\omega\cdot h)^5 .
$$

$F_0$ は垂直入射での反射率です。空気中にある屈折率 $\eta$ の誘電体では

$$
F_0 = \left(\frac{\eta-1}{\eta+1}\right)^2
$$

なので、ガラスやほとんどのプラスチック（$\eta\approx 1.5$）では $F_0 = 0.04$、水（$\eta\approx 1.33$）では約 $0.02$ になります。金属の $F_0$ は高く、波長によって変化します。金や銅の反射に色がついているのはこのためです。

## 5. 数値で数式を確かめる

シェーダーを書く前に、正規化の恒等式を確かめ、**ホワイトファーネステスト（white furnace test）** を行いましょう。ファーネステストでは、放射輝度 1 の一様な環境の中に表面を置き、$F=1$ とします。このとき反射される放射輝度は方向アルベドに等しくなります。完璧なスペキュラーモデルなら、どのラフネスでもちょうど 1 を返すはずです。

```python
import numpy as np

def D_ggx(cos_h, alpha):
    """GGX / Trowbridge-Reitz NDF, isotropic. cos_h = n.h"""
    a2 = alpha * alpha
    d = cos_h * cos_h * (a2 - 1.0) + 1.0
    return a2 / (np.pi * d * d)

def Lambda_ggx(cos_v, alpha):
    """Smith Lambda for GGX: (-1 + sqrt(1 + alpha^2 tan^2 theta)) / 2"""
    tan2 = (1.0 - cos_v * cos_v) / (cos_v * cos_v)
    return 0.5 * (-1.0 + np.sqrt(1.0 + alpha * alpha * tan2))

def G1(cos_v, alpha):
    return 1.0 / (1.0 + Lambda_ggx(cos_v, alpha))

def G2_correlated(cos_l, cos_v, alpha):
    return 1.0 / (1.0 + Lambda_ggx(cos_l, alpha) + Lambda_ggx(cos_v, alpha))

# Midpoint quadrature grid over the upper hemisphere (theta, phi)
nt, nphi = 2048, 512
theta = (np.arange(nt) + 0.5) * (0.5 * np.pi / nt)
phi = (np.arange(nphi) + 0.5) * (2.0 * np.pi / nphi)
T, P = np.meshgrid(theta, phi, indexing="ij")
dw = np.sin(T) * (0.5 * np.pi / nt) * (2.0 * np.pi / nphi)   # d(omega) = sin(theta) dtheta dphi
dirs = np.stack([np.sin(T) * np.cos(P), np.sin(T) * np.sin(P), np.cos(T)], axis=-1)

print("1) projected-area normalization  int D(h) (n.h) dw_h  (should be 1)")
for alpha in [0.05, 0.2, 0.5, 1.0]:
    print(f"   alpha={alpha:4.2f}: {np.sum(D_ggx(np.cos(T), alpha) * np.cos(T) * dw):.5f}")

print("2) visible-normal normalization  int G1(v) <v.h> D(h) dw_h  vs  n.v")
alpha = 0.5
for theta_v in [0.0, 0.6, 1.2]:
    v = np.array([np.sin(theta_v), 0.0, np.cos(theta_v)])
    vh = np.clip(dirs @ v, 0.0, None)
    lhs = G1(np.cos(theta_v), alpha) * np.sum(vh * D_ggx(np.cos(T), alpha) * dw)
    print(f"   theta_v={theta_v:.1f}: lhs={lhs:.5f}  n.v={np.cos(theta_v):.5f}")

print("3) white furnace: directional albedo of the specular lobe with F = 1")
def spec_albedo(theta_v, alpha, correlated=True):
    v = np.array([np.sin(theta_v), 0.0, np.cos(theta_v)])
    l = dirs                                  # integrate over incident directions
    cos_l, cos_v = l[..., 2], np.cos(theta_v)
    h = l + v
    h /= np.linalg.norm(h, axis=-1, keepdims=True)
    D = D_ggx(h[..., 2], alpha)
    G = G2_correlated(cos_l, cos_v, alpha) if correlated else G1(cos_l, alpha) * G1(cos_v, alpha)
    f = D * G / (4.0 * cos_l * cos_v)         # Cook-Torrance with F = 1
    return np.sum(f * cos_l * dw)

for alpha in [0.1, 0.3, 0.6, 1.0]:
    a = [spec_albedo(t, alpha) for t in (0.0, 1.0, 1.4)]
    print(f"   alpha={alpha:3.1f}: E(theta_v=0, 1.0, 1.4) = " + ", ".join(f"{x:.3f}" for x in a))
print("   separable G at alpha=1.0, theta_v=1.4:", f"{spec_albedo(1.4, 1.0, correlated=False):.3f}")
```

出力（実行時間は約 2 秒）：

```text
1) projected-area normalization  int D(h) (n.h) dw_h  (should be 1)
   alpha=0.05: 1.00002
   alpha=0.20: 1.00000
   alpha=0.50: 1.00000
   alpha=1.00: 1.00000
2) visible-normal normalization  int G1(v) <v.h> D(h) dw_h  vs  n.v
   theta_v=0.0: lhs=1.00000  n.v=1.00000
   theta_v=0.6: lhs=0.82534  n.v=0.82534
   theta_v=1.2: lhs=0.36236  n.v=0.36236
3) white furnace: directional albedo of the specular lobe with F = 1
   alpha=0.1: E(theta_v=0, 1.0, 1.4) = 0.988, 0.973, 0.894
   alpha=0.3: E(theta_v=0, 1.0, 1.4) = 0.877, 0.826, 0.850
   alpha=0.6: E(theta_v=0, 1.0, 1.4) = 0.592, 0.634, 0.781
   alpha=1.0: E(theta_v=0, 1.0, 1.4) = 0.307, 0.434, 0.672
   separable G at alpha=1.0, theta_v=1.4: 0.525
```

これらのアルベドは、可視法線をサンプリングする独立したモンテカルロ推定（Heitz 2018）でも確認し、小数第 3 位まで一致しました。ここから 2 つの教訓が得られます。

- NDF と Smith の $G_1$ は厳密に整合しているので、このモデルがエネルギーを*生み出す*ことは決してありません。
- しかし高いラフネスではエネルギーを**失います**。$\alpha=1$ では最大 70% です。失われるのはマイクロファセット間で 2 回以上バウンスする光で、単一散乱モデルはこれを無視しています。そのため粗い金属は暗くレンダリングされすぎます。エネルギー補償の手法（Kulla と Conty、"Revisiting Physically Based Shading at Imageworks"、SIGGRAPH 2017 コース；Turquin 2019）は、`spec_albedo` のような表から事前計算した多重散乱ローブを足し戻します。分離型の $G_2$ はさらに多くのエネルギーを失います（最後の行で 0.525 対 0.672）。

## 6. メタリック・ラフネスのワークフロー

アーティストに屈折率を入力させるべきではありません。Burley による Disney の "principled" BRDF（SIGGRAPH 2012 コース）と、Karis による Unreal Engine 4 への適用（SIGGRAPH 2013 コース）は、小さく直感的なパラメータセットを普及させ、それは現在 glTF 2.0 で標準化されています。

| パラメータ | 範囲 | 意味 |
| --- | --- | --- |
| `baseColor` | RGB、$[0,1]$ | 誘電体ではアルベド、金属では $F_0$ |
| `metallic` | $[0,1]$、ほぼ常に 0 か 1 | 導体か誘電体か |
| `roughness` | $[0,1]$ | *知覚的*ラフネス $r$、$\alpha = r^2$ |

マテリアルは 2 つの物理的なケースの混合です。

- **誘電体**（プラスチック、木、肌）：$F_0=0.04$ の白いスペキュラーローブと、アルベド `baseColor` のディフューズローブ。
- **金属**：自由電子が屈折した光をほぼ即座に吸収するので、**ディフューズローブはありません**。`baseColor` は色つきの $F_0$ になります。

コードでは次のようになります。

$$
F_0 = \mathrm{lerp}(0.04,\ \text{baseColor},\ \text{metallic}), \qquad c_{\text{diff}} = (1-\text{metallic})\,\text{baseColor},
$$

$$
f_r = \underbrace{(1-F)\,\frac{c_{\text{diff}}}{\pi}}_{\text{diffuse}} + \underbrace{D\,V\,F}_{\text{specular}} .
$$

係数 $(1-F)$ は、すでにスペキュラーとして反射されたエネルギーをディフューズローブから除くための安価な方法です。これは近似であり、より丁寧なレイヤーモデルではスペキュラーアルベドを使います。ラフネスを二乗する（$\alpha=r^2$）とスライダーが知覚的に線形になります。Burley は、これをしないと見た目の変化の大半がスライダーの低い側に詰め込まれてしまうことを観察しました。

実践上のルールが 2 つあります。`baseColor` のテクスチャは sRGB で保存されているので、ライティングの前にリニアへデコードしなければなりません。また、すべてのライティング計算はリニアな HDR 値で行い、トーンマッピングは最後に適用します。

## 7. イメージベースドライティングと split-sum 近似

点光源は話の一部にすぎません。現実の環境はあらゆる方向から物体を光で取り囲んでおり、通常は HDR 環境マップ $L_{\text{env}}(\omega)$ として記録されます。すると 1 画素をシェーディングするには、反射積分全体が必要になります。

$$
L_o(\omega_o) = \int_{\Omega} f_r(\omega_i,\omega_o)\, L_{\text{env}}(\omega_i)\cos\theta_i\, d\omega_i .
$$

毎フレーム、画素ごとに数百サンプルで評価するのは高すぎます。

**ディフューズ部分。** Lambert ローブでは $L_o = \frac{c_{\text{diff}}}{\pi}E(n)$ であり、法線だけに依存します。環境ごとに一度、**放射照度マップ（irradiance map）** $E(n)/\pi$ を事前計算します。実際には 9 個の球面調和関数（spherical harmonics）係数（Ramamoorthi と Hanrahan、SIGGRAPH 2001）か、小さなキューブマップとして保存します。

**スペキュラー部分。** スペキュラー積分は $\omega_o$、$n$、ラフネス、$F_0$ に依存し、表にするには次元が多すぎます。Karis（2013）は、重点サンプリングしたモンテカルロ推定量から出発し、それを 2 つの和の積に分割します。

$$
\frac{1}{N}\sum_{k=1}^{N} \frac{L_{\text{env}}(\omega_k)\, f_r(\omega_k,\omega_o)\cos\theta_k}{p(\omega_k)}
\;\approx\;
\left(\frac{1}{N}\sum_{k=1}^{N} L_{\text{env}}(\omega_k)\right)
\left(\frac{1}{N}\sum_{k=1}^{N}\frac{f_r(\omega_k,\omega_o)\cos\theta_k}{p(\omega_k)}\right).
$$

1. **プリフィルタ環境マップ（pre-filtered environment map）。** 1 つ目の因子は、GGX ローブで畳み込んだ環境です。Karis は $\cos\theta_k$ で重み付けしており、そのほうが良い結果になります。反射方向 $r$ だけに依存させるため、$n = \omega_o = r$ と仮定します。ラフネスのレベルごとに 1 枚のキューブマップを mip チェーンに格納します。mip 0 は鋭い鏡面、最後の mip はもっともぼけたローブです。この仮定により、かすめる角度で見られる引き伸ばされたハイライトが失われます。これがこの手法の主な目に見えるアーティファクトです。
2. **環境 BRDF（environment BRDF）。** 2 つ目の因子は、白色光のもとでのスペキュラー方向アルベドです。Schlick の Fresnel を使うと、$F_0$ を積分の外に出せます。

$$
\int_{\Omega} f_r\cos\theta_i\, d\omega_i = F_0 \underbrace{\int_{\Omega} \frac{f_r}{F}\left(1-(1-\omega_o\cdot h)^5\right)\cos\theta_i\, d\omega_i}_{A} \; + \; \underbrace{\int_{\Omega} \frac{f_r}{F}(1-\omega_o\cdot h)^5\cos\theta_i\, d\omega_i}_{B} .
$$

$A$ と $B$ は $(n\cdot\omega_o,\ \text{roughness})$ だけに依存するので、小さな 2 チャンネルの 2 次元ルックアップテーブル（lookup table, LUT）に収まります。実行時のスペキュラー IBL は `prefiltered(r, roughness) * (F0 * A + B)` だけです。

以下は LUT を NumPy で積分するコードです。GPU のベイク用シェーダーとまったく同じように GGX NDF を重点サンプリングします。$p(h) = D(h)(n\cdot h)$、$p(\omega_i) = p(h)/(4\,\omega_o\cdot h)$ なので、重みの中で NDF が打ち消されます。

```python
import numpy as np

def lambda_ggx(c, alpha):
    return 0.5 * (-1.0 + np.sqrt(1.0 + alpha**2 * (1.0 - c * c) / (c * c)))

def hammersley(n):
    i = np.arange(n, dtype=np.uint32)
    b = i.copy()                                   # radical inverse base 2 (bit reversal)
    b = ((b << 16) | (b >> 16)).astype(np.uint32)
    b = (((b & 0x55555555) << 1) | ((b & 0xAAAAAAAA) >> 1)).astype(np.uint32)
    b = (((b & 0x33333333) << 2) | ((b & 0xCCCCCCCC) >> 2)).astype(np.uint32)
    b = (((b & 0x0F0F0F0F) << 4) | ((b & 0xF0F0F0F0) >> 4)).astype(np.uint32)
    b = (((b & 0x00FF00FF) << 8) | ((b & 0xFF00FF00) >> 8)).astype(np.uint32)
    return (i + 0.5) / n, b * 2.3283064365386963e-10

def integrate_brdf(n_dot_v, roughness, n=4096):
    """Split-sum LUT entry (A, B): int f*cos = F0 * A + B for a Schlick-Fresnel GGX lobe."""
    alpha = roughness * roughness                  # perceptual roughness -> alpha
    v = np.array([np.sqrt(1.0 - n_dot_v**2), 0.0, n_dot_v])
    u1, u2 = hammersley(n)
    # sample h proportional to D(h) (n.h)  (GGX NDF importance sampling)
    cos_h = np.sqrt((1.0 - u1) / (1.0 + (alpha**2 - 1.0) * u1))
    sin_h = np.sqrt(1.0 - cos_h**2)
    phi = 2.0 * np.pi * u2
    h = np.stack([sin_h * np.cos(phi), sin_h * np.sin(phi), cos_h], axis=-1)
    v_dot_h = h @ v
    l = 2.0 * v_dot_h[:, None] * h - v             # reflect v about h
    n_dot_l = l[:, 2]
    ok = n_dot_l > 0.0
    nl, vh, nh = n_dot_l[ok], v_dot_h[ok], cos_h[ok]
    G2 = 1.0 / (1.0 + lambda_ggx(nl, alpha) + lambda_ggx(n_dot_v, alpha))
    # f*cos/pdf with pdf(l) = D (n.h) / (4 v.h):  D cancels
    w = G2 * vh / (nh * n_dot_v)
    fc = (1.0 - vh) ** 5
    return np.sum((1.0 - fc) * w) / n, np.sum(fc * w) / n

if __name__ == "__main__":
    for r in [0.25, 0.5, 1.0]:
        for nv in [0.1, 0.5, 1.0]:
            A, B = integrate_brdf(nv, r)
            print(f"roughness={r:4.2f} n.v={nv:3.1f}  A={A:.3f} B={B:.3f}  A+B={A+B:.3f}")
```

```text
roughness=0.25 n.v=0.1  A=0.510 B=0.391  A+B=0.901
roughness=0.25 n.v=0.5  A=0.955 B=0.033  A+B=0.988
roughness=0.25 n.v=1.0  A=0.996 B=0.000  A+B=0.996
roughness=0.50 n.v=0.1  A=0.747 B=0.140  A+B=0.887
roughness=0.50 n.v=0.5  A=0.834 B=0.022  A+B=0.857
roughness=0.50 n.v=1.0  A=0.916 B=0.000  A+B=0.916
roughness=1.00 n.v=0.1  A=0.737 B=0.024  A+B=0.760
roughness=1.00 n.v=0.5  A=0.448 B=0.003  A+B=0.451
roughness=1.00 n.v=1.0  A=0.307 B=0.000  A+B=0.307
```

$A+B$ は $F_0=1$ のときのファーネスアルベドで、第 5 節の数値積分と一致します。ラフネス 1、$n\cdot v = 1$ ではどちらも 0.307 です。滑らかな表面では、Fresnel による増分 $B$ がかすめる角度で大きくなることに注目してください。これが現実の物体の輪郭に見える明るい縁です。Karis のオリジナルのコードは、IBL に $k=\alpha/2$ の Schlick-GGX 近似の $G$ を使っているので、その LUT はこの高さ相関版とは少し異なります。$G$ を 1 つ選び、解析的なライトと LUT の両方で同じものを使いましょう。

## 8. 完全な GLSL 実装

以下のフラグメントシェーダーは、ここまでの内容をすべて実装しています。GGX、高さ相関型 Smith の可視性項、Schlick の Fresnel、メタリック・ラフネスのパラメータ化、逆二乗則に従う点光源、そして split-sum IBL です。GLSL 3.30 としてコンパイルできます（バージョン行を変えて `precision highp float;` を加えれば、WebGL 2 の GLSL ES 3.00 としてもコンパイルできます）。

```glsl
#version 330 core
// Metallic-roughness PBR: GGX + height-correlated Smith + Schlick, plus split-sum IBL.
in vec3 vWorldPos;
in vec3 vNormal;
out vec4 fragColor;

uniform vec3  uCamPos;
uniform vec3  uBaseColor;     // linear RGB
uniform float uMetallic;      // 0 = dielectric, 1 = metal
uniform float uRoughness;     // perceptual roughness in [0, 1]
uniform int   uNumLights;
uniform vec3  uLightPos[4];
uniform vec3  uLightIntensity[4];   // radiant intensity I (W/sr), RGB
uniform samplerCube uIrradianceMap; // E(n)/pi, i.e. cosine-convolved radiance
uniform samplerCube uPrefilterMap;  // GGX-prefiltered radiance, roughness -> mip
uniform sampler2D   uBrdfLut;       // (A, B) indexed by (n.v, roughness)
uniform float uMaxMip;

const float PI = 3.14159265359;

float D_GGX(float NoH, float a) {
    float a2 = a * a;
    float d = NoH * NoH * (a2 - 1.0) + 1.0;
    return a2 / (PI * d * d);
}

// V = G2 / (4 NoL NoV) with the height-correlated Smith G2 for GGX
float V_SmithGGXCorrelated(float NoV, float NoL, float a) {
    float a2 = a * a;
    float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
    float gl = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
    return 0.5 / (gv + gl);
}

vec3 F_Schlick(float VoH, vec3 F0) {
    return F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
}

void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(uCamPos - vWorldPos);
    float NoV = max(dot(n, v), 1e-4);
    float a = max(uRoughness * uRoughness, 1e-3);   // alpha = roughness^2
    vec3 F0 = mix(vec3(0.04), uBaseColor, uMetallic);
    vec3 diffuseColor = (1.0 - uMetallic) * uBaseColor;

    vec3 Lo = vec3(0.0);
    for (int i = 0; i < 4; ++i) {
        if (i >= uNumLights) break;
        vec3 toLight = uLightPos[i] - vWorldPos;
        float dist2 = dot(toLight, toLight);
        vec3 l = toLight * inversesqrt(dist2);
        vec3 h = normalize(v + l);
        float NoL = max(dot(n, l), 0.0);
        if (NoL <= 0.0) continue;
        float NoH = max(dot(n, h), 0.0);
        float VoH = max(dot(v, h), 0.0);

        vec3  F = F_Schlick(VoH, F0);
        vec3  spec = D_GGX(NoH, a) * V_SmithGGXCorrelated(NoV, NoL, a) * F;
        vec3  diff = (1.0 - F) * diffuseColor / PI;
        vec3  E = uLightIntensity[i] * NoL / dist2;  // irradiance from a point light
        Lo += (diff + spec) * E;
    }

    // image-based lighting (split sum)
    vec3 r = reflect(-v, n);
    vec3 prefiltered = textureLod(uPrefilterMap, r, uRoughness * uMaxMip).rgb;
    vec2 AB = texture(uBrdfLut, vec2(NoV, uRoughness)).rg;
    vec3 specIBL = prefiltered * (F0 * AB.x + AB.y);
    vec3 diffIBL = diffuseColor * texture(uIrradianceMap, n).rgb;
    Lo += diffIBL + specIBL;

    fragColor = vec4(Lo, 1.0);   // linear HDR; tone map + sRGB encode in a later pass
}
```

細部についての注意：

- `a` は $10^{-3}$ でクランプしています。$\alpha=0$ では NDF が点光源には決して当たらないデルタになり、`V` はゼロ除算になります。
- 解析的なライトは $f_r \cdot E$（$E = I\cos\theta/r^2$）として評価します。これはデルタ光源によってレンダリング方程式の積分がつぶれた結果であり、PBR シェーダーに「$\pi$ を掛ける」ような帳尻合わせの係数がない理由でもあります。
- ラフネスを mip レベルへ線形に対応させるのはもっとも単純な選択です。エンジンでは、プリフィルタのベイク方法に合わせた非線形の対応をよく使います。
- 実用的なエンジンでは、法線マップ（第 3 回）、アンビエントオクルージョンとスペキュラーオクルージョン、そして第 5 節の多重散乱補償を加えることになります。

## 試してみよう

[ホームページのラボ]({{ '/' | relative_url }}#lab)にあるパストレーサーは、まさにこの GGX マイクロファセット BRDF を可視法線サンプリング（Heitz 2018）とともに使っています。球をクリックして選択し、次のことを試してください。

- **diffuse**、**plastic**、**metal** のプリセットを切り替えます。プラスチックは色つきのディフューズの上に $F_0=0.04$ の白いローブを重ね、金属はディフューズローブを持たず反射自体に色がつきます。
- **roughness** スライダーをドラッグします。$\alpha$ が大きくなるとハイライトは広く暗くなります。$D$ の積分は一定のまま広がるからです。**mirror** は $\alpha\to 0$ の極限です。
- **glass** と **frosted** を試します。すりガラスは、マイクロファセット理論における粗い*透過*のケースです（Walter ら 2007）。
- 壁の前にある粗い金属球を見てください。予想より少し暗く見えるはずです。これが第 5 節で測った単一散乱によるエネルギー損失です。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Kajiya, *The Rendering Equation* | SIGGRAPH | 1986 | [DOI](https://doi.org/10.1145/15922.15902) | レンダリングアルゴリズムを 1 つの積分方程式の解として統一し、パストレーシングを提案 |
| Cook & Torrance, *A Reflectance Model for Computer Graphics* | ACM TOG 1(1) | 1982 | [DOI](https://doi.org/10.1145/357290.357293) | 現在も使われる $DFG/(4\cos\cos)$ のマイクロファセット BRDF |
| Trowbridge & Reitz, *Average irregularity representation of a rough surface for ray reflection* | JOSA | 1975 | — | 現在 GGX と呼ばれる分布の起源 |
| Schlick, *An Inexpensive BRDF Model for Physically-based Rendering* | Computer Graphics Forum 13(3) | 1994 | [DOI](https://doi.org/10.1111/1467-8659.1330233) | $(1-\cos)^5$ の Fresnel 近似 |
| Walter, Marschner, Li & Torrance, *Microfacet Models for Refraction through Rough Surfaces* | EGSR | 2007 | [DOI](https://doi.org/10.2312/EGWR/EGSR07/195-206) | GGX、一般的なマイクロファセットの導出、粗い透過 |
| Burley, *Physically-Based Shading at Disney* | SIGGRAPH コース | 2012 | [ページ](https://disneyanimation.com/publications/physically-based-shading-at-disney) | 原理に基づくアーティスト向けパラメータ、$\alpha = r^2$ |
| Karis, *Real Shading in Unreal Engine 4* | SIGGRAPH コース | 2013 | [コースページ](https://blog.selfshadow.com/publications/s2013-shading-course/) | リアルタイムのメタリック・ラフネスモデルと split-sum IBL |
| Heitz, *Understanding the Masking-Shadowing Function in Microfacet-Based BRDFs* | JCGT 3(2) | 2014 | [JCGT](https://jcgt.org/published/0003/02/03/) | Smith の $G_1$ と高さ相関型 $G_2$ を厳密に導出 |
| Heitz, *Sampling the GGX Distribution of Visible Normals* | JCGT 7(4) | 2018 | [JCGT](https://jcgt.org/published/0007/04/01/) | 低分散な GGX サンプリング。現代のあらゆるパストレーサーで使用 |
| Kulla & Conty, *Revisiting Physically Based Shading at Imageworks* | SIGGRAPH コース | 2017 | — | 多重散乱のためのエネルギー補償 |

## 学習リソース

- **GAMES101**（Lingqi Yan）の放射測定、レンダリング方程式、マテリアルの回：[コースページ](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html)。**GAMES202** はリアルタイム PBR マテリアル、split sum、多重散乱補償を扱います：[コースページ](https://sites.cs.ucsb.edu/~lingqi/teaching/games202.html)。
- **Physically Based Rendering: From Theory to Implementation**（PBRT 第 4 版、オンラインで無料）：放射測定は第 4 章、[マイクロファセット理論は 9.6 節](https://pbr-book.org/4ed/Reflection_Models/Roughness_Using_Microfacet_Theory)。
- **Real-Time Rendering** 第 4 版の第 9 章（物理ベースシェーディング）と第 10 章（局所照明と IBL）：[realtimerendering.com](https://www.realtimerendering.com/)。
- **LearnOpenGL** の PBR の章。動作する完全な実装です：[Theory](https://learnopengl.com/PBR/Theory) と [Specular IBL](https://learnopengl.com/PBR/IBL/Specular-IBL)。
- Google の **Filament** ドキュメント。導出が丁寧でとても明快なエンジンのドキュメントです：[Physically Based Rendering in Filament](https://google.github.io/filament/Filament.md.html)。
- **Berkeley CS184** の放射測定とマテリアルモデルの講義：[cs184.eecs.berkeley.edu](https://cs184.eecs.berkeley.edu/)。

## 演習

1. $\int_\Omega D_{\text{GGX}}(m)(n\cdot m)\,d\omega_m = 1$ を解析的に示してください。ヒント：$u = \cos^2\theta$ と置換します。
2. `D_ggx` を異方性の形に拡張し、$\alpha_x=0.2$、$\alpha_y=0.6$ で正規化を数値的に確かめてください。
3. Schlick の Fresnel とプラスチックのマテリアル（ディフューズ $\rho=1$ とスペキュラー $F_0=0.04$）でファーネステストを行ってください。$(1-F)$ による結合を使うと、かすめる角度で合計アルベドは 1 を超えるでしょうか。使わない場合はどうでしょうか。
4. `integrate_brdf` で $32\times 32$ の split-sum LUT 全体をベイクして PNG として保存し、LearnOpenGL の LUT と比べてください。$G$ の選び方による違いを説明してください。
5. （発展）Kulla-Conty のエネルギー補償を実装してください。`spec_albedo` で $E(\mu)$ を表にし、そのコサイン重み付き平均 $E_{\text{avg}} = 2\int_0^1 E(\mu)\,\mu\,d\mu$ を計算し、ローブ $f_{\text{ms}} = \frac{(1-E(\mu_o))(1-E(\mu_i))}{\pi(1-E_{\text{avg}})}$ を加えます。ファーネステストが 1 を返すようになったか確認してください。

**次回：** [第 5 回]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})では近似をやめ、モンテカルロ・パストレーシングでレンダリング方程式を解きます。重点サンプリング、next-event estimation、多重重点サンプリングを扱います。
