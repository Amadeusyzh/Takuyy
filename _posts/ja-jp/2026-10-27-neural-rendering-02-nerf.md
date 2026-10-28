---
layout: post
title: "NeRF：ニューラル放射輝度場と微分可能なボリュームレンダリング"
date: 2026-10-27 12:02:00+0900
description: "ボリュームレンダリング方程式とその数値求積、位置エンコーディング、NeRF の MLP、階層的サンプリングと光度損失を解説し、最小限の PyTorch NeRF 実装と、後続研究の Mip-NeRF、Mip-NeRF 360、NeRF in the Wild を紹介します。"
categories: neural-rendering
tags: [nerf, volume-rendering, positional-encoding, pytorch, mip-nerf]
series: neural-rendering
series_order: 2
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 1 回]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})では、写真からキャリブレーション済みのカメラを復元しました。NeRF（Mildenhall et al., ECCV 2020）はその次の問いに答えます。それらのカメラと画像が与えられたとき、どのような 3D 表現ならそれらを再びレンダリングできるのか、という問いです。その答えが**ニューラル放射輝度場**（neural radiance field）です。これは 3D 点と視線方向を密度と色に写像する小さな MLP で、古典的な**ボリュームレンダリング**（volume rendering）によってレンダリングされます。すべてのステップが微分可能なので、シーン全体を光度損失（photometric loss）と勾配降下だけでフィッティングできます。

NeRF は、このシリーズのほぼすべての内容の概念的な祖先です。高速なグリッドベースの場（第 3 回）はそのレンダリング方程式を保ったまま MLP を置き換え、3D Gaussian Splatting（第 4 回）は同じアルファ合成の式を保ったまま、レイマーチング（ray marching）をラスタライズ（rasterization）に置き換えます。第 2 節の数値求積（quadrature）を理解することが、本記事で最も重要なポイントです。

## 前提知識

- カメラ、内部パラメータ（intrinsics）、カメラからワールドへの（camera-to-world）行列（第 1 回）。
- グラフィックスシリーズで扱ったレイトレーシング（ray tracing）とモンテカルロ推定（Monte Carlo estimation）、放射輝度（radiance）の概念。
- PyTorch：`nn.Module`、自動微分（autograd）、Adam。

## 1. 放射輝度場としてのシーン

NeRF は静的なシーンを連続関数

$$
F_\Theta : (\mathbf x, \mathbf d) \mapsto (\mathbf c, \sigma),
$$

として表現します。ここで $\mathbf x \in \mathbb R^3$ は位置、$\mathbf d$ は単位視線方向、$\mathbf c \in [0,1]^3$ は方向 $\mathbf d$ に放射される RGB の放射輝度、$\sigma \ge 0$ は**体積密度**（volume density）です。体積密度とは、レイが $\mathbf x$ で止められる微分確率であり、長さの逆数の単位を持ちます。$\Theta$ は MLP の重みです。

重要なモデリング上の選択が 2 つあります。

1. **密度は位置のみに依存する。** 幾何形状はどの視点から見ても同じでなければなりません。そうでなければ、ネットワークは各学習ビューに異なる表面を置くという「ズル」ができてしまいます。色は $\mathbf x$ と $\mathbf d$ の両方に依存するため、場は鏡面ハイライト（specular highlight）やその他の視点依存（view-dependent）の効果を再現できます。
2. **明示的な表面はない。** メッシュ（mesh）も法線もなく、あるのは柔らかな密度場だけです。表面は $\sigma$ が大きくなるところに現れます。これこそがこの表現を最適化しやすくしている点です。勾配は単一の交点だけでなく、レイ上のすべてのサンプルに流れます。

照明モデルもありません。$\mathbf c$ は照明が「焼き込まれた」出射放射輝度です。グラフィックスシリーズの言葉で言えば、NeRF は BRDF と光源ではなく、$L_o(\mathbf x, \omega_o)$ を直接学習します。そのため、追加の工夫なしには NeRF をリライティング（relighting）することはできません。

## 2. ボリュームレンダリング

### 2.1 連続方程式

カメラ中心からピクセルを通るレイ $\mathbf r(t) = \mathbf o + t\mathbf d$ を飛ばし、近端と遠端の境界を $t_n, t_f$ とします。放射–吸収モデル（emission–absorption model、散乱なし。Max, 1995、Kajiya & Von Herzen, 1984）のもとで、期待される色は

$$
C(\mathbf r) = \int_{t_n}^{t_f} T(t)\, \sigma(\mathbf r(t))\, \mathbf c(\mathbf r(t), \mathbf d)\, dt,
\qquad
T(t) = \exp\!\left( -\int_{t_n}^{t} \sigma(\mathbf r(s))\, ds \right).
$$

となります。$T(t)$ は**透過率**（transmittance）で、レイが吸収されずに $t_n$ から $t$ まで進む確率です。積 $T(t)\sigma(t)$ はレイがちょうど $t$ で終端する確率密度なので、$C$ は終端点における色の期待値になります。これからは深度の推定値 $\int T\sigma\, t\, dt$ と、不透明度（opacity）$1 - T(t_f)$ も得られます。

### 2.2 数値求積：積分からアルファ合成へ

$N$ 個のサンプル $t_1 < \dots < t_N$ で場を評価し、$\delta_i = t_{i+1} - t_i$ とします。区間 $[t_i, t_{i+1}]$ 上で $\sigma$ と $\mathbf c$ がそれぞれ定数 $\sigma_i$ と $\mathbf c_i$ であると仮定します。この区間上では、$t_i$ からの透過率は $e^{-\sigma_i (t - t_i)}$ のように減衰するので、区間の寄与は

$$
\int_{t_i}^{t_{i+1}} T(t)\sigma_i \mathbf c_i\, dt
= T_i\, \mathbf c_i \int_0^{\delta_i} \sigma_i e^{-\sigma_i s}\, ds
= T_i \left(1 - e^{-\sigma_i \delta_i}\right) \mathbf c_i,
$$

となります。ここで $T_i = T(t_i) = \exp(-\sum_{j<i} \sigma_j \delta_j)$ です。区間の**不透明度** $\alpha_i = 1 - e^{-\sigma_i\delta_i}$ を定義すると、NeRF の推定量が得られます。

$$
\hat C(\mathbf r) = \sum_{i=1}^{N} w_i\, \mathbf c_i,
\qquad
w_i = T_i\, \alpha_i,
\qquad
T_i = \prod_{j=1}^{i-1} (1 - \alpha_j).
$$

これはまさに、グラフィックスシリーズで扱った "over" 演算子による前から後ろへの**アルファ合成**（alpha compositing）です。各サンプルはまだ見えている部分のうち割合 $\alpha_i$ を覆い、$T_i$ はその手前に残っている可視度です。この式を覚えておいてください。第 4 回では、3D Gaussian Splatting がソートされたガウス分布を*まったく同じ*式で合成します。違いは、$\alpha_i$ が $\sigma_i\delta_i$ からではなく、投影された 2D ガウス分布から得られる点だけです。

実用上の細かい点をいくつか挙げます。

- 重みは $\sum_i w_i = 1 - T_{N+1} \le 1$ を満たします。残りはレイが抜け出る確率であり、$(1-\sum_i w_i)\,\mathbf c_{\text{bg}}$ を加えることで背景色を合成できます（Blender の合成シーンでは白を使います）。
- レイの方向が正規化されていない場合は、密度がワールド単位になるように $\delta_i$ に $\lVert \mathbf d \rVert$ を掛けます。
- 最後の区間は巨大な値（$10^{10}$）に設定し、最後のサンプルが残りをすべて吸収するようにします。
- サンプルは**層化**（stratified）されます：$t_i \sim \mathcal U\!\left[t_n + \tfrac{i-1}{N}(t_f - t_n),\, t_n + \tfrac{i}{N}(t_f - t_n)\right]$。イテレーションごとに位置をジッターさせることで、MLP は固定グリッドではなく連続的な位置の集合を見ることになり、サンプル位置へのエイリアシング（aliasing）を避けられます。

## 3. 位置エンコーディング

$(x, y, z, \theta, \phi)$ をそのまま入力とする素朴な MLP では、ぼやけた結果になります。ニューラルネットワークは低周波の関数に偏る性質（**スペクトルバイアス**、spectral bias）を持つため、細かなテクスチャや鋭いエッジの学習は非常に遅くなります。NeRF は各入力座標 $p$ を、まず固定の**位置エンコーディング**（positional encoding）で写像します。

$$
\gamma(p) = \big( \sin(2^0\pi p), \cos(2^0\pi p), \sin(2^1\pi p), \cos(2^1\pi p), \dots, \sin(2^{L-1}\pi p), \cos(2^{L-1}\pi p) \big),
$$

位置には $L = 10$（入力はおおよそ $[-1,1]$ に正規化）、方向には $L = 4$ を用います。オリジナルのコードでは生の入力 $p$ も連結し、係数 $\pi$ は省略しています。どちらの変種でも機能します。Tancik et al.（NeurIPS 2020）は、これがなぜうまくいくのかを説明しました。ニューラルタンジェントカーネル（neural tangent kernel）の観点から見ると、フーリエ特徴写像（Fourier feature mapping）はネットワークの実効カーネルを、周波数によって帯域幅が決まる定常カーネルに変えるため、高周波の細部が学習可能になります。周波数が多すぎるとノイズの多い過学習した結果になります。エンコーディングは帯域幅のつまみなのです。

## 4. ネットワーク構造

論文の MLP は次のとおりです。

- 幅 256、ReLU の全結合層 8 層で、入力は $\gamma(\mathbf x)$（生の入力を含めて 63 個の数値）です。$\gamma(\mathbf x)$ を 5 層目に再び連結する**スキップ接続**（skip connection）を持ちます。
- $\sigma$（$\sigma\ge 0$ となるよう ReLU を通す）と 256 次元の特徴ベクトルを出力する線形ヘッド。
- 特徴は $\gamma(\mathbf d)$（27 個の数値）と連結され、幅 128 の層を 1 つ通った後、シグモイドによる RGB 出力が続きます。

この構造によって、1 つ目のモデリング上の選択が強制されます。$\sigma$ は方向を見る前に計算されるのです。

## 5. 階層的サンプリング

一様なサンプルでは、評価の大半が空の空間や遮蔽された領域に浪費されます。NeRF は**2 つ**のネットワークを学習します。

1. $N_c = 64$ 個の層化サンプルで評価される**粗い**（coarse）ネットワーク。その重み $w_i$ はレイに沿った区分定数の PDF $\hat w_i = w_i / \sum_j w_j$ を形成します。
2. この PDF から**逆変換サンプリング**（inverse transform sampling）によって $N_f = 128$ 個の追加サンプルを引きます（$u\sim\mathcal U[0,1)$ を引き、$u$ を含む CDF のビンを見つけ、その中で線形補間します）。これはパストレーシングの記事で BRDF に用いた重点的サンプリング（importance sampling）と同じ考え方です。
3. **細かい**（fine）ネットワークが、ソートされた $N_c + N_f$ 個すべてのサンプルで評価され、最終的な色を生成します。

両方のネットワークが教師信号を受けるため、粗いネットワークは有用な PDF を出し続けます。後の研究（Mip-NeRF 360）では、粗い NeRF を、細かいネットワークの重みの上界を与えるためだけに学習される小さな「提案」（proposal）ネットワークに置き換えました。

## 6. 学習

すべての学習ピクセルからランダムにサンプリングしたレイのバッチ $\mathcal R$ に対して、損失は

$$
\mathcal L = \sum_{\mathbf r \in \mathcal R} \Big( \big\lVert \hat C_c(\mathbf r) - C(\mathbf r) \big\rVert_2^2 + \big\lVert \hat C_f(\mathbf r) - C(\mathbf r) \big\rVert_2^2 \Big).
$$

です。論文では 4096 本のレイからなるバッチ、学習率を $5\times 10^{-4}$ から $5\times 10^{-5}$ まで指数的に減衰させる Adam、そして 10 万〜30 万イテレーションを用いており、1 シーンあたり NVIDIA V100 1 枚でおよそ 1〜2 日かかりました。$800\times800$ の画像を 1 枚レンダリングするには $800^2 \times (64 + 192) \approx 1.6\times 10^8$ 回の MLP 評価が必要です。これが NeRF のレンダリングに 1 フレームあたり数秒かかる理由であり、次回の記事が存在する理由でもあります。

評価には、ホールドアウトしたビュー（held-out views）上での **PSNR**（$[0,1]$ の画像に対して $-10\log_{10}\mathrm{MSE}$）、**SSIM**、**LPIPS**（学習された知覚的距離）を用います。標準的なデータセットは 8 つの Blender 合成シーン（360° レンダリング、$800\times800$）と前方撮影（forward-facing）の LLFF データです。後者に対して NeRF は空間を**正規化デバイス座標**（normalized device coordinates、NDC）に変換し、有界でない深度を有限の区間に写像します。

## 7. PyTorch による最小限の NeRF

以下のコードは、完全で自己完結した NeRF です。レイ生成、位置エンコーディング、論文の MLP、層化サンプリングと階層的サンプリング、そしてボリュームレンダリングを含みます。オリジナルの構造に忠実に従いつつ、読みやすさを保っています。

### 7.1 レイ

```python
import torch, torch.nn as nn, torch.nn.functional as F

def get_rays(H, W, focal, c2w):
    """Rays for every pixel. c2w: 4x4 camera-to-world in the OpenGL/NeRF convention
    (x right, y up, camera looks along -z). Returns origins and directions, (H, W, 3)."""
    j, i = torch.meshgrid(torch.arange(H, dtype=torch.float32),
                          torch.arange(W, dtype=torch.float32), indexing="ij")
    dirs = torch.stack([(i + 0.5 - W / 2) / focal,
                        -(j + 0.5 - H / 2) / focal,
                        -torch.ones_like(i)], dim=-1)
    rays_d = dirs @ c2w[:3, :3].T                      # rotate into world space
    rays_o = c2w[:3, 3].expand(rays_d.shape)
    return rays_o, rays_d
```

マイナス記号は、NeRF の `transforms.json` が用いる OpenGL のカメラ規約に由来します（第 1 回の表を参照）。画像の行は下向きに増加する一方でカメラの $y$ は上を向き、カメラは $-z$ 方向を見ています。COLMAP（OpenCV）の姿勢を使う場合は、両方のマイナス記号を取り除きます。

### 7.2 エンコーディングとネットワーク

```python
def positional_encoding(x, n_freqs, include_input=True):
    """gamma(p) = (sin(2^k pi p), cos(2^k pi p)), k = 0..L-1, applied per coordinate."""
    freqs = 2.0 ** torch.arange(n_freqs, dtype=x.dtype, device=x.device) * torch.pi
    xb = x[..., None, :] * freqs[:, None]              # (..., L, D)
    enc = torch.cat([torch.sin(xb), torch.cos(xb)], dim=-1).flatten(-2)
    return torch.cat([x, enc], dim=-1) if include_input else enc

class NeRF(nn.Module):
    """The original architecture: 8x256 trunk with a skip at layer 5, density head,
    then a 128-wide branch that also sees the encoded view direction."""
    def __init__(self, L_x=10, L_d=4, width=256, depth=8, skip=4):
        super().__init__()
        self.L_x, self.L_d, self.skip = L_x, L_d, skip
        in_x, in_d = 3 + 6 * L_x, 3 + 6 * L_d
        self.trunk = nn.ModuleList(
            [nn.Linear(in_x, width)] +
            [nn.Linear(width + (in_x if i == skip else 0), width) for i in range(1, depth)])
        self.sigma = nn.Linear(width, 1)
        self.feat = nn.Linear(width, width)
        self.rgb = nn.Sequential(nn.Linear(width + in_d, width // 2), nn.ReLU(),
                                 nn.Linear(width // 2, 3), nn.Sigmoid())

    def forward(self, x, d):
        ex = positional_encoding(x, self.L_x)
        ed = positional_encoding(F.normalize(d, dim=-1), self.L_d)
        h = ex
        for i, layer in enumerate(self.trunk):
            if i == self.skip:
                h = torch.cat([h, ex], dim=-1)         # skip connection
            h = F.relu(layer(h))
        sigma = F.softplus(self.sigma(h) - 1.0).squeeze(-1)  # density: position only (paper: ReLU)
        rgb = self.rgb(torch.cat([self.feat(h), ed], dim=-1))
        return rgb, sigma
```

$L_x = 10$ のとき位置エンコーディングは $3 + 60 = 63$ 次元、$L_d = 4$ のとき方向エンコーディングは $3 + 24 = 27$ 次元となり、論文と一致します。ここでは密度に ReLU ではなくシフトした softplus を使っています。ReLU だと、運の悪い初期化によって いたるところで $\sigma = 0$ となり、密度ヘッドに勾配がまったく届かなくなることがあるためです（オリジナルのコードは学習中に生の密度へノイズを加えることでこれを緩和しており、Mip-NeRF は softplus に切り替えました）。

### 7.3 サンプリングとレンダリング

```python
def stratified_samples(near, far, n_rays, n_samples, perturb=True):
    """t_i = near + (far - near) * (i + u_i) / N with u_i ~ U[0, 1)."""
    bins = torch.linspace(0.0, 1.0, n_samples + 1)[:-1].expand(n_rays, n_samples)
    u = torch.rand(n_rays, n_samples) if perturb else torch.full((n_rays, n_samples), 0.5)
    return near + (far - near) * (bins + u / n_samples)

def volume_render(rgb, sigma, t, rays_d, white_bkgd=False):
    """Quadrature of the volume rendering integral.
    rgb: (R, N, 3), sigma: (R, N), t: (R, N) sample distances along each ray."""
    delta = t[..., 1:] - t[..., :-1]
    delta = torch.cat([delta, torch.full_like(delta[..., :1], 1e10)], dim=-1)
    delta = delta * rays_d.norm(dim=-1, keepdim=True)        # distances in world units
    alpha = 1.0 - torch.exp(-sigma * delta)                   # opacity of each segment
    # T_i = prod_{j<i} (1 - alpha_j): exclusive cumulative product
    trans = torch.cumprod(torch.cat([torch.ones_like(alpha[..., :1]),
                                     1.0 - alpha + 1e-10], dim=-1), dim=-1)[..., :-1]
    weights = alpha * trans                                   # w_i = T_i * alpha_i
    color = (weights[..., None] * rgb).sum(dim=-2)
    depth = (weights * t).sum(dim=-1)
    acc = weights.sum(dim=-1)                                 # 1 - final transmittance
    if white_bkgd:
        color = color + (1.0 - acc[..., None])
    return color, depth, acc, weights

def sample_pdf(bins, weights, n_samples, deterministic=False):
    """Inverse-transform sampling of the piecewise-constant PDF given by `weights`
    on the intervals `bins` (R, N+1). Returns (R, n_samples) new sample positions."""
    weights = weights + 1e-5                                  # avoid NaNs on empty rays
    pdf = weights / weights.sum(dim=-1, keepdim=True)
    cdf = torch.cumsum(pdf, dim=-1)
    cdf = torch.cat([torch.zeros_like(cdf[..., :1]), cdf], dim=-1)   # (R, N+1)
    if deterministic:
        u = torch.linspace(0.0, 1.0, n_samples).expand(cdf.shape[0], n_samples).contiguous()
    else:
        u = torch.rand(cdf.shape[0], n_samples)
    idx = torch.searchsorted(cdf, u, right=True)
    below = (idx - 1).clamp(min=0)
    above = idx.clamp(max=cdf.shape[-1] - 1)
    cdf_b, cdf_a = cdf.gather(-1, below), cdf.gather(-1, above)
    bin_b, bin_a = bins.gather(-1, below), bins.gather(-1, above)
    denom = torch.where(cdf_a - cdf_b < 1e-5, torch.ones_like(cdf_a), cdf_a - cdf_b)
    return bin_b + (u - cdf_b) / denom * (bin_a - bin_b)

def render_rays(coarse, fine, rays_o, rays_d, near, far, n_coarse=64, n_fine=128, perturb=True):
    R = rays_o.shape[0]
    t_c = stratified_samples(near, far, R, n_coarse, perturb)
    x_c = rays_o[:, None] + rays_d[:, None] * t_c[..., None]
    rgb_c, sig_c = coarse(x_c, rays_d[:, None].expand_as(x_c))
    col_c, _, _, w_c = volume_render(rgb_c, sig_c, t_c, rays_d)
    # hierarchical sampling: draw fine samples where the coarse weights are large
    mids = 0.5 * (t_c[:, 1:] + t_c[:, :-1])
    t_f = sample_pdf(mids, w_c[:, 1:-1].detach(), n_fine, deterministic=not perturb)
    t_all, _ = torch.sort(torch.cat([t_c, t_f], dim=-1), dim=-1)
    x_f = rays_o[:, None] + rays_d[:, None] * t_all[..., None]
    rgb_f, sig_f = fine(x_f, rays_d[:, None].expand_as(x_f))
    col_f, depth_f, acc_f, _ = volume_render(rgb_f, sig_f, t_all, rays_d)
    return col_c, col_f, depth_f
```

間違えやすい細部が 2 つあります。累積積は**排他的**（exclusive、$T_1 = 1$）でなければならないため、先頭に 1 を付け加え、最後の要素を捨てています。また、粗いネットワークの重みは再サンプリングの前に**切り離され**（detach）ます。細かいサンプルの位置については微分を通しません。

### 7.4 トイシーンでの学習

すべてを自己完結させるため、正解シーン（柔らかな色付きの球）を解析的に作成し、同じ数値求積でその小さなビューを 20 枚レンダリングして、それらに NeRF をフィッティングします。実際のデータセットを使う場合は、代わりに `transforms.json` から画像と `transform_matrix` のエントリを読み込みます。

```python
import math
torch.manual_seed(0)

def pose_spherical(theta, phi, radius):
    """Camera on a sphere looking at the origin (OpenGL convention), like the NeRF synthetic data."""
    th, ph = math.radians(theta), math.radians(phi)
    C = torch.tensor([radius * math.cos(ph) * math.sin(th), radius * math.sin(ph),
                      radius * math.cos(ph) * math.cos(th)])
    back = C / C.norm()                                  # camera +z points away from the target
    right = torch.linalg.cross(torch.tensor([0.0, 1.0, 0.0]), back); right = right / right.norm()
    up = torch.linalg.cross(back, right)
    c2w = torch.eye(4); c2w[:3, 0], c2w[:3, 1], c2w[:3, 2], c2w[:3, 3] = right, up, back, C
    return c2w

# ground-truth "scene": a soft sphere with a colour gradient, rendered by the same quadrature
def gt_field(x, d):
    sigma = 30.0 * torch.sigmoid(20.0 * (0.6 - x.norm(dim=-1)))
    rgb = 0.5 + 0.5 * torch.tanh(2.0 * x)
    return rgb, sigma

H = W = 32; focal = 40.0; near, far = 2.0, 6.0
images, poses = [], []
for k in range(20):
    c2w = pose_spherical(18.0 * k, -30.0 + 3.0 * k, 4.0)
    o, d = get_rays(H, W, focal, c2w)
    o, d = o.reshape(-1, 3), d.reshape(-1, 3)
    t = stratified_samples(near, far, o.shape[0], 256, perturb=False)
    x = o[:, None] + d[:, None] * t[..., None]
    rgb, sig = gt_field(x, d)
    images.append(volume_render(rgb, sig, t, d)[0]); poses.append((o, d))

rays_o = torch.cat([p[0] for p in poses]); rays_d = torch.cat([p[1] for p in poses])
target = torch.cat(images)
# a smaller network than the paper's so that this runs on a CPU in a few minutes
coarse, fine = NeRF(L_x=6, L_d=2, width=64, depth=4), NeRF(L_x=6, L_d=2, width=64, depth=4)
opt = torch.optim.Adam(list(coarse.parameters()) + list(fine.parameters()), lr=1e-3)
for step in range(1001):
    idx = torch.randint(0, rays_o.shape[0], (512,))
    col_c, col_f, _ = render_rays(coarse, fine, rays_o[idx], rays_d[idx], near, far, 32, 32)
    loss = F.mse_loss(col_c, target[idx]) + F.mse_loss(col_f, target[idx])
    opt.zero_grad(); loss.backward(); opt.step()
    if step % 250 == 0:
        psnr = -10.0 * torch.log10(F.mse_loss(col_f, target[idx]))
        print(f"step {step:4d}  loss {loss.item():.4f}  PSNR(fine) {psnr.item():.1f} dB")
```

4 コアの CPU で約 1 分半かかります。学習バッチ上で表示される PSNR は約 7 dB から始まり、250 ステップで 19.9 dB、750 ステップで 30.6 dB、1000 ステップで 35.5 dB に達します。まず球の幾何が現れ、その後に色のグラデーションが現れます。実際の NeRF と同様に、この玩具モデルも密度がほぼ一様なうちは立ち上がりが遅く、完全な $8\times256$ のネットワークを CPU で使うとこの停滞期がずっと長く続きます。そのため玩具実験では `depth=4` と `width=64` を使っています。

ここから本物の NeRF に進むには、フルサイズのネットワークと $L_x = 10$、$N_c = 64$、$N_f = 128$、4096 本のレイからなるバッチ、学習率スケジュール、GPU を使い、ホールドアウトしたビューは `torch.no_grad()` のもとでチャンクに分けてレンダリングします。

## 8. 後続研究

NeRF は何千もの論文を生み出しました。以下の 3 つの後続研究は、NeRF の最も目立つ失敗モードに対処し、3DGS で再び登場するアイデアを導入しています。

### 8.1 Mip-NeRF：コーンによるアンチエイリアシング

NeRF は無限に細いレイを点でサンプリングするため、あるピクセルが 3D 点の周囲 1 ミリメートルを覆う場合でも 1 メートルを覆う場合でも、その点はまったく同じようにエンコードされます。そのため、複数の解像度の画像で学習する（あるいは学習時と異なる距離からレンダリングする）と、エイリアシングやぼけが生じます。**Mip-NeRF**（Barron et al., ICCV 2021）はピクセルごとに**コーン**（cone）を飛ばし、それを円錐台（conical frustum）に分割して、各円錐台を平均 $\boldsymbol\mu$、共分散 $\Sigma$ のガウス分布で近似します。そして、そのガウス分布上での位置エンコーディングの*期待値*、すなわち**積分位置エンコーディング**（integrated positional encoding、IPE）をエンコードします。$x\sim\mathcal N(\mu, \sigma^2)$ に対して

$$
\mathbb E[\sin(x)] = \sin(\mu)\, e^{-\sigma^2/2},
\qquad
\mathbb E[\cos(x)] = \cos(\mu)\, e^{-\sigma^2/2},
$$

となるので、周期が円錐台のフットプリントより小さい周波数は滑らかに減衰します。これはミップマッピングと同様のプレフィルタリング（prefiltering）です。これにより、単一の MLP がすべてのスケールでシーンを表現できます。「点をガウス分布のフットプリントで置き換え、ローパスフィルタをかける」という同じアイデアは、Mip-Splatting（第 5 回）で再び登場します。

### 8.2 Mip-NeRF 360：境界のないシーン

環境全体を撮影した実データには、あらゆる距離のコンテンツが含まれます。**Mip-NeRF 360**（Barron et al., CVPR 2022）は、空間全体を半径 2 の球に写像する**シーン縮約**（scene contraction）

$$
\operatorname{contract}(\mathbf x) =
\begin{cases}
\mathbf x & \lVert \mathbf x\rVert \le 1, \\[2pt]
\left(2 - \dfrac{1}{\lVert \mathbf x\rVert}\right)\dfrac{\mathbf x}{\lVert \mathbf x\rVert} & \lVert \mathbf x\rVert > 1,
\end{cases}
$$

と、NeRF の重みの上界を与えるよう「オンライン蒸留」（online distillation）で学習される小さな**提案 MLP**（proposal MLP、粗いネットワークを置き換える）、そして各レイに沿った重みがコンパクトになるよう促してフローター（floater）を除去する**歪み損失**（distortion loss）を導入しました。その 9 つの境界のないシーン（bicycle、garden、stump、room、counter、kitchen、bonsai など）からなるデータセットは標準的なベンチマークであり、3DGS もこれで結果を報告しています。

### 8.3 NeRF in the Wild

インターネット上の写真コレクションは NeRF の仮定を破ります。露出、ホワイトバランス、天候は写真ごとに異なり、観光客も動き回ります。**NeRF-W**（Martin-Brualla et al., CVPR 2021）は次のものを追加しました。

- 色の分岐に入力される、学習された画像ごとの**外観埋め込み**（appearance embedding）$\boldsymbol\ell^{(a)}_i$。幾何形状を共有したまま、光度的な変動を吸収します。
- 独自の密度、色、レイごとの**不確実性**（uncertainty）$\beta$ を持ち、画像ごとの一時的埋め込みで条件付けられた**一時的**（transient）ヘッド。これにより遮蔽物はシーンに焼き込まれるのではなく、説明として除外されます。損失は $\frac{\lVert C - \hat C\rVert^2}{2\beta^2} + \log\beta^2$ に、一時的な密度に対するスパース性の項を加えたものになります。

画像ごとの外観埋め込みは今でも標準的なテクニックであり、nerfstudio の `nerfacto` やいくつかの 3DGS の変種で使われています。

### 8.4 その他の方向性（概要）

- **表面：** NeuS（Wang et al., NeurIPS 2021）は、密度を符号付き距離関数（signed distance function）と不偏な重み関数で置き換え、きれいなメッシュを得ます。
- **生成：** DreamFusion（Poole et al., ICLR 2023）は、レンダリング結果が 2D のテキストから画像への拡散モデルにとってもっともらしく見えるように NeRF を最適化します（スコア蒸留サンプリング、score distillation sampling）。これがテキストから 3D（text-to-3D）の出発点です。
- **速度：** グリッド、ハッシュエンコーディング、ベイク（第 3 回）、そして最終的にはガウス分布（第 4 回）。

## 試してみよう

[インタラクティブラボ]({{ '/' | relative_url }}#lab)には NeRF は含まれていませんが、Gaussian World デモはスプラットを、第 2.2 節とまったく同じ重み $w_i = T_i\alpha_i$ で合成しています。違いは、レイに沿ってサンプリングする代わりにピクセルごとにソートしている点だけです。第 4 回を読みながらそのデバッグビューを使い、両者のつながりを確かめてみてください。

## 代表的な論文

| 論文 | 会議/論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Optical Models for Direct Volume Rendering (Max) | IEEE TVCG | 1995 | — | レンダリング方程式の背後にある放射–吸収モデル |
| NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis (Mildenhall et al.) | ECCV | 2020 | [arXiv](https://arxiv.org/abs/2003.08934) | 本記事で扱う手法 |
| Fourier Features Let Networks Learn High Frequency Functions in Low Dimensional Domains (Tancik et al.) | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.10739) | 位置エンコーディングがなぜ機能するかを説明 |
| NeRF in the Wild (Martin-Brualla et al.) | CVPR | 2021 | [arXiv](https://arxiv.org/abs/2008.02268) | 外観埋め込みと一時的な物体 |
| Mip-NeRF: A Multiscale Representation for Anti-Aliasing Neural Radiance Fields (Barron et al.) | ICCV | 2021 | [arXiv](https://arxiv.org/abs/2103.13415) | コーントレーシングと積分位置エンコーディング |
| NeuS: Learning Neural Implicit Surfaces by Volume Rendering (Wang et al.) | NeurIPS | 2021 | [arXiv](https://arxiv.org/abs/2106.10689) | 表面のための SDF ベースのボリュームレンダリング |
| Mip-NeRF 360: Unbounded Anti-Aliased Neural Radiance Fields (Barron et al.) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2111.12077) | 縮約、提案ネットワーク、標準ベンチマーク |
| DreamFusion: Text-to-3D using 2D Diffusion (Poole et al.) | ICLR | 2023 | [arXiv](https://arxiv.org/abs/2209.14988) | スコア蒸留：テキストから NeRF を生成 |

## 学習リソース

- [NeRF プロジェクトページ](https://www.matthewtancik.com/nerf)と、[github.com/bmild/nerf](https://github.com/bmild/nerf) にあるオリジナルの TensorFlow コード。忠実な PyTorch 移植版は [yenchenlin/nerf-pytorch](https://github.com/yenchenlin/nerf-pytorch) です。
- [nerfstudio](https://docs.nerf.studio/)。第 3 回と第 6 回で使うフレームワークで、`vanilla-nerf`、`mipnerf`、`nerfacto` のきれいな実装があります。
- 第 2 節のグラフィックス面については、Scratchapixel のボリュームレンダリングのレッスン。
- Brown 大学の [neural fields](https://neuralfields.cs.brown.edu/) サーベイとデータベース（Xie et al., "Neural Fields in Visual Computing and Beyond", Eurographics STAR 2022）。
- 深層学習の背景知識（MLP、最適化）については Stanford CS231N。

## 演習

1. 重み $w_i = T_i\alpha_i$ の和が $1 - \prod_{i}(1-\alpha_i)$ になることを示してください。残りの部分は物理的に何を意味するでしょうか。
2. トイ実験で位置エンコーディングを取り除き（`L_x = 0`）、同じステップ数の後の PSNR を比較してください。次に `L_x = 16` を試してください。
3. `render_rays` から期待深度を返し、トイシーンの深度マップをレンダリングしてください。画像中心での値は $4 - 0.6 = 3.4$ に近いでしょうか。
4. 学習中に層化サンプリングを固定の中点（`perturb=False`）に置き換えてください。異なる解像度でレンダリングすると、どのようなアーティファクトが現れるでしょうか。
5. 対角ガウス分布に対する積分位置エンコーディングを実装し、それが $\mathbf x$ のサンプルにわたる $\gamma(\mathbf x)$ のモンテカルロ平均に等しいことを数値的に確かめてください。

**次回：** NeRF は学習に 1 日、1 フレームのレンダリングに数秒かかります。[第 3 回]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})では、明示的なグリッドとハッシュエンコーディングによって、放射輝度場が数分で学習できるようになった方法を紹介します。
