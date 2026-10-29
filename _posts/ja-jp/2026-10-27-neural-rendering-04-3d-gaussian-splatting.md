---
layout: post
title: "3D Gaussian Splatting 徹底解説"
date: 2026-10-27 12:04:00+0900
description: "3DGS の手法の全体像：ガウシアンのパラメータ、回転とスケールからの共分散、ヤコビ行列を用いた EWA 投影、0.3 のローパスフィルタ、タイルベースの微分可能ラスタライズ、アルファブレンディングと勾配、適応的密度制御、学習レシピを Python コード付きで解説します。"
categories: neural-rendering
tags: [3d-gaussian-splatting, ewa-splatting, differentiable-rendering, spherical-harmonics, pytorch]
series: neural-rendering
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 3 回]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})で放射輝度場は数分で学習できるようになりましたが、レンダリングでは依然としてボリューム中をレイマーチング（ray marching）し、1 ピクセルあたり多数のサンプルで特徴を参照していました。**3D Gaussian Splatting**（Kerbl, Kopanas, Leimkühler & Drettakis, ACM Transactions on Graphics 42(4), SIGGRAPH 2023）は表現そのものを変えました。シーンは数百万個の明示的で異方性（anisotropic）の 3D ガウシアンの集合であり、それぞれが位置、形状、不透明度（opacity）、視点依存の色を持ちます。画像はそれらを**ラスタライズ（rasterization）**することで生成されます。つまり、各ガウシアンを 2D の楕円に投影し、ソートし、アルファブレンディング（alpha blending）するのです。ラスタライザが微分可能であるため、ガウシアンは NeRF とまったく同じように写真から最適化されますが、その結果はリアルタイムの速度でレンダリングでき（論文では 1080p で 30 fps 以上と報告されています）、品質も最先端の水準です。

3DGS は今やフォトリアルなキャプチャにおける標準的な表現であり、第 5 回で扱う研究の大半、すなわち動的シーン、SLAM、フィードフォワード（feed-forward）再構成、生成、VR の基盤となっています。本記事では、この手法を端から端まで、すべての要素についてコード付きで解説します。

## 前提知識

- ボリュームレンダリング（volume rendering）とアルファ合成（alpha compositing）、特に $w_i = T_i \alpha_i$（第 2 回）。
- ピンホール投影（pinhole projection）とカメラの規約（第 1 回）。
- グラフィックスシリーズで扱ったラスタライズ、深度ソート（depth sorting）、GPU パイプライン。
- 多変量ガウス分布（multivariate Gaussian）、四元数（quaternion）、PyTorch の自動微分（autograd）。

## 1. 表現

シーンは $N$ 個のガウシアンの集合です。ガウシアン $i$ は次のものを持ちます。

| パラメータ | 記号 | 保存形式 | 活性化 | サイズ |
| --- | --- | --- | --- | --- |
| 平均（中心） | $\boldsymbol\mu_i \in \mathbb R^3$ | 生の値 | — | 3 |
| 回転 | $\mathbf q_i$ | 四元数 | 正規化 | 4 |
| スケール | $\mathbf s_i \in \mathbb R^3_{>0}$ | $\log \mathbf s_i$ | $\exp$ | 3 |
| 不透明度 | $o_i \in (0,1)$ | ロジット | sigmoid | 1 |
| 色 | SH 係数 $\mathbf k_i$ | 生の値 | SH 評価 $+\,0.5$、クランプ | $16\times 3 = 48$ |

つまりガウシアン 1 個あたり 59 個の浮動小数点数です。300〜600 万個のガウシアンからなる典型的な屋外シーンは、float32 の `.ply` として数百メガバイトから 1 ギガバイト超を占めます。圧縮がそれ自体ひとつの研究分野になっているのはこのためです（第 5 回）。

ガウシアンは空間中に密度を定義します。

$$
G_i(\mathbf x) = \exp\!\Big( -\tfrac12 (\mathbf x - \boldsymbol\mu_i)^\top \Sigma_i^{-1} (\mathbf x - \boldsymbol\mu_i) \Big),
$$

正規化定数はありません。ピーク値は 1 で、不透明度 $o_i$ によってスケールされます。NeRF と比べると次のようになります。

- **明示的（explicit）** です。レンダリング時にネットワークを評価することはありません。すべてのパラメータは勾配降下法で直接最適化されます。
- **疎で適応的** です。ガウシアンはコンテンツがある場所にのみ存在し、その数とサイズは学習中に適応的に変化します（第 6 節）。
- それでもなお **体積的でソフトな** 表現です。重なり合う半透明の塊がブレンドされるため、勾配の振る舞いが良好に保たれます。硬い表面や法線は存在しません。

### 1.1 回転とスケールからの共分散

共分散行列（covariance matrix）は対称半正定値（symmetric positive semi-definite）でなければなりませんが、$\Sigma$ の 6 つの成分に対して素朴に勾配降下を行うと、この制約が破られてしまいます。そこで 3DGS はガウシアンを楕円体としてパラメータ化します。スケーリング $S = \operatorname{diag}(s_x, s_y, s_z)$ の後に回転 $R(\mathbf q)$ を適用し、

$$
\Sigma = R\, S\, S^\top R^\top .
$$

とします。このように構成した $\Sigma$ はどれも有効であり、パラメータも直感的です。$\mathbf s$ は楕円体の主軸方向の標準偏差で、主軸は $R$ の各列です。単位四元数 $\mathbf q = (w, x, y, z)$ の回転行列は次のとおりです。

$$
R(\mathbf q) =
\begin{pmatrix}
1 - 2(y^2 + z^2) & 2(xy - wz) & 2(xz + wy) \\
2(xy + wz) & 1 - 2(x^2 + z^2) & 2(yz - wx) \\
2(xz - wy) & 2(yz + wx) & 1 - 2(x^2 + y^2)
\end{pmatrix}.
$$

四元数は順伝播の内部で正規化されるため、オプティマイザは $\mathbb R^4$ の中で自由にそれを動かせます。

```python
import numpy as np

def quat_to_rotmat(q):
    """Unit quaternion (w, x, y, z) -> 3x3 rotation matrix. q is normalized first."""
    w, x, y, z = q / np.linalg.norm(q)
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z),     2 * (x * z + w * y)],
        [2 * (x * y + w * z),     1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y),     2 * (y * z + w * x),     1 - 2 * (x * x + y * y)]])

def covariance_3d(q, log_scale):
    """Sigma = R S S^T R^T with S = diag(exp(log_scale)); always symmetric positive semi-definite."""
    R = quat_to_rotmat(q)
    M = R @ np.diag(np.exp(log_scale))
    return M @ M.T
```

`covariance_3d(q, np.log([0.3, 0.1, 0.02]))` の固有値は、任意の $\mathbf q$ に対してちょうど $0.3^2, 0.1^2, 0.02^2$ になります。手軽な単体テストです。

下の図は、このような楕円体を段階的に作っていきます。単位球をまず $S$ で引き伸ばし、次に $R(\mathbf q)$ で回転させます。色付きの矢印は $RS$ の列、つまり標準偏差でスケールされた主軸です。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-ellipsoid.svg" caption="3D ガウシアンの 1σ 等値面は、単位球を $RS$ で写した像です。左：単位球と基底ベクトル。中：$S$ が各軸を標準偏差 (0.9, 0.5, 0.25) まで引き伸ばします。右：$R(\mathbf q)$ がそれらを回転させます。下に表示した固有値は、四元数によらず正確にスケールの 2 乗になっています。" %}

### 1.2 球面調和関数による視点依存の色

色は方向の球面上の関数であり、実数の**球面調和関数（spherical harmonics）**で次数 3 まで展開されます。

$$
\mathbf c_i(\mathbf d) = \max\!\Big(0,\ \tfrac12 + \sum_{\ell=0}^{3}\sum_{m=-\ell}^{\ell} \mathbf k_{i,\ell m}\, Y_{\ell m}(\mathbf d)\Big),
\qquad
\mathbf d = \frac{\boldsymbol\mu_i - \mathbf o_{\text{cam}}}{\lVert \boldsymbol\mu_i - \mathbf o_{\text{cam}}\rVert},
$$

つまり色チャネルあたり $(3+1)^2 = 16$ 個の係数です。次数 0 は定数（$Y_{00} = \tfrac{1}{2\sqrt\pi} \approx 0.2821$）で、「拡散」色にあたります。次数 1〜3 は、ハイライトのような次第に鋭くなる視点依存の変化を加えます。方向はピクセルごとではなくガウシアンごと（カメラ中心からガウシアンの平均へ）である点に注意してください。以下の定数はリファレンス実装のもの（Plenoxels と PlenOctrees から受け継がれたもの）です。

図は、下の `sh_basis` とまったく同じ順序と符号規約で 16 個の基底関数を示しています。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-sh-basis.svg" caption="`sh_basis` の 16 個の実球面調和基底を方向の球面上に塗ったものです（赤が正、青が負、それぞれ自身の最大値で正規化。$z$ が上で、すべてのパネルで同じ視点）。$k$ は係数配列のインデックスで、行 $\ell$ には $2\ell+1$ 個の関数があります。次数が高いほど速く振動するため、より鋭い視点依存の効果を表現できます。" %}

```python
C0 = 0.28209479177387814
C1 = 0.4886025119029199
C2 = [1.0925484305920792, -1.0925484305920792, 0.31539156525252005,
      -1.0925484305920792, 0.5462742152960396]
C3 = [-0.5900435899266435, 2.890611442640554, -0.4570457994644658, 0.3731763325901154,
      -0.4570457994644658, 1.445305721320277, -0.5900435899266435]

def sh_basis(d, degree=3):
    """Real SH basis in the ordering/sign convention of the 3DGS code. d: (N, 3) unit vectors."""
    x, y, z = d[:, 0], d[:, 1], d[:, 2]
    out = [np.full_like(x, C0)]
    if degree > 0:
        out += [-C1 * y, C1 * z, -C1 * x]
    if degree > 1:
        xx, yy, zz, xy, yz, xz = x * x, y * y, z * z, x * y, y * z, x * z
        out += [C2[0] * xy, C2[1] * yz, C2[2] * (2 * zz - xx - yy), C2[3] * xz, C2[4] * (xx - yy)]
    if degree > 2:
        out += [C3[0] * y * (3 * xx - yy), C3[1] * xy * z, C3[2] * y * (4 * zz - xx - yy),
                C3[3] * z * (2 * zz - 3 * xx - 3 * yy), C3[4] * x * (4 * zz - xx - yy),
                C3[5] * z * (xx - yy), C3[6] * x * (xx - 3 * yy)]
    return np.stack(out, axis=-1)                   # (N, (degree + 1)^2)

def sh_to_rgb(sh, d, degree=3):
    """sh: (N, 16, 3) coefficients, d: (N, 3) unit view directions -> (N, 3) colours."""
    B = sh_basis(d, degree)                          # (N, K)
    rgb = np.einsum("nk,nkc->nc", B, sh[:, :B.shape[1]]) + 0.5
    return np.maximum(rgb, 0.0)
```

良い自己チェックとして、多数のランダムな単位ベクトルを生成し、$\frac{4\pi}{M}\sum_m B(\mathbf d_m)^\top B(\mathbf d_m) \approx I_{16}$（正規直交性）を確認してみてください。3DGS が書き出す `ply` ファイルは、次数 0 の係数を `f_dc_0..2` として、残りの 45 個を `f_rest_0..44` としてチャネル優先（channel-major）で保存します。RGB の色を DC 係数に変換するには $k_{00} = (c - 0.5)/C_0$ を使います。

各次数で何が得られるかを見るために、次の図では鋭いハイライトを持つ色に次数を上げながら球面調和関数を最小二乗でフィットし、ガウシアンの周りに置いたカメラに対して `sh_to_rgb` を評価しています。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-sh-view.svg" caption="1 つのガウシアンの視点依存の色。左：ガウシアンを囲む円上のカメラを上から見たもの（$y$ 軸は紙面の奥向き）。各点はそのカメラが次数 3 の球面調和関数で見る色で、灰色の矢印は視線方向 $\mathbf d$ です。右：目標の色（最上段）と、次数 0、1、3 の最小二乗フィットを、カメラの方位角 φ の関数として並べたもの。次数 0 は 1 つの拡散色、次数 1 はそれを傾けることしかできず、次数 3 でようやくハイライトが φ ≈ 60° 付近に局在し始めますが、まだ目標よりぼやけています。" %}

## 2. 投影：EWA スプラッティング

ラスタライズするには、各 3D ガウシアンを画像上の 2D ガウシアンにする必要があります。カメラの写像がアフィン（affine）であれば、これは厳密に行えます。ガウシアンのアフィン像はガウシアンだからです。透視投影はアフィンではないため、3DGS は **EWA スプラッティング**（EWA splatting）（Zwicker, Pfister, van Baar & Gross, IEEE TVCG 2002）に従い、投影をガウシアンの平均の周りで線形化します。

$W$ をワールドからカメラへの回転、$\mathbf t = W\boldsymbol\mu + \mathbf t_{cw}$ をカメラ座標系での平均とします。透視写像 $\phi(\mathbf t) = (f_x t_x/t_z + c_x,\ f_y t_y/t_z + c_y)$ のヤコビ行列（Jacobian）は

$$
J = \frac{\partial \phi}{\partial \mathbf t} =
\begin{pmatrix}
\dfrac{f_x}{t_z} & 0 & -\dfrac{f_x t_x}{t_z^2} \\[8pt]
0 & \dfrac{f_y}{t_z} & -\dfrac{f_y t_y}{t_z^2}
\end{pmatrix},
$$

であり、1 次のテイラー展開から**スクリーン空間の共分散（screen-space covariance）**が得られます。

$$
\Sigma' = J\, W\, \Sigma\, W^\top J^\top \in \mathbb R^{2\times 2},
$$

2D の平均は $\boldsymbol\mu' = \phi(\mathbf t)$ です。（論文では $3\times3$ のヤコビ行列で書いた後、3 行目と 3 列目を落としていますが、$2\times3$ の形と等価です。）この近似は小さなガウシアンに対しては非常に優れていますが、距離に比べて大きなガウシアンでは劣化します。これが一部のアーティファクトの原因となっており、後続の研究ではレイトレーシングや厳密な投影によってこれに対処しています。

下の図では、2.2 節の `project_gaussian`（`dilation=0`）を使って、具体的なガウシアンでこの線形化を確かめます。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-ewa.svg" caption="EWA 投影を実際に計算したもの。左：原点にある OpenCV カメラ（$x$ が右、$y$ が下、$z$ が前）、奥行き 1 に描いた画像平面、そして奥行き 3 にあるガウシアン（1σ のワイヤーフレームとサンプル）。投影された 1σ 楕円（オレンジ）を通る光線の錐が楕円体を包んでいます。右：ガウシアンの 20,000 個のサンプルをピンホールモデルで厳密に投影した点と、$\Sigma^{\prime} = JW\Sigma W^\top J^\top$ の 1σ、2σ、3σ 楕円（オレンジ）。破線の楕円は投影したサンプルの経験共分散の 3σ 等値線です。両者の差は数パーセントで、残る差は奥行きに対して大きいこのガウシアンの線形化誤差です。" %}

### 2.1 0.3 のローパスフィルタ

使用する前に、3DGS は小さな等方的な項を加えます。

$$
\Sigma'_{\text{2D}} = \Sigma' + 0.3\, I.
$$

EWA スプラッティングでは、スクリーン空間のフットプリント（footprint）をピクセル再構成フィルタ／ローパスフィルタ（low-pass filter）と畳み込むことで、スプラット（splat）がおよそ 1 ピクセルより小さくならないようにし、ガウシアンがサブピクセルサイズに投影されたときのエイリアシング（aliasing）や穴を防ぎます。$0.3 I$ を加えることは、まさに分散 0.3 ピクセル² のガウシアンとの畳み込みにあたります。これは問題の原因にもなります。この膨張はピクセル単位なので、ある解像度で最適化されたガウシアンを別の解像度でレンダリングすると、細すぎたり太すぎたりして見えます。これが Mip-Splatting（第 5 回）の背後にある主要な観察です。

下の図では、次節の `screen_extent` と `gaussian_alpha` を使って、この拡張の表と裏を数値的に示します。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-lowpass.svg" localized="true" caption="左：σ = 0.25 ピクセルのガウシアンをピクセル中心でサンプリングしながら、平均をサブピクセル単位で動かします。拡張がないと、ピクセル格子に落とすアルファの合計が 0.1 未満から約 0.7 の間で揺れ動き、動くスプラットは点滅します（エイリアシング）。$\Sigma^{\prime} + 0.3I$ にすると一定に保たれます。右：その代償。ある解像度で最適化したガウシアンは、その $s$ 倍の解像度では $\sqrt{s^2\sigma^2 + 0.3}$ の大きさで描かれますが、正しくは $s\sqrt{\sigma^2 + 0.3}$ です。小さなガウシアンは拡大すると細すぎ、縮小すると太すぎになります。" %}

### 2.2 コード：投影とピクセルごとのアルファ

```python
def project_gaussian(mu, Sigma, Rcw, tcw, fx, fy, cx, cy, W, H, dilation=0.3):
    """EWA projection of one 3D Gaussian (OpenCV camera: x right, y down, z forward).
    Returns the 2D mean (pixels), the 2x2 screen-space covariance and the depth."""
    t = Rcw @ mu + tcw                             # camera-space mean
    # clamp the point to a slightly enlarged frustum before linearizing (as the official code does)
    lim_x, lim_y = 1.3 * (W / 2) / fx, 1.3 * (H / 2) / fy
    tx = np.clip(t[0] / t[2], -lim_x, lim_x) * t[2]
    ty = np.clip(t[1] / t[2], -lim_y, lim_y) * t[2]
    tz = t[2]
    J = np.array([[fx / tz, 0.0, -fx * tx / tz**2],  # Jacobian of the perspective map at t
                  [0.0, fy / tz, -fy * ty / tz**2]])
    T = J @ Rcw                                     # world -> screen linearization
    cov2d = T @ Sigma @ T.T + dilation * np.eye(2)  # low-pass: at least ~one pixel wide
    mean2d = np.array([fx * t[0] / tz + cx, fy * t[1] / tz + cy])
    return mean2d, cov2d, tz

def screen_extent(cov2d):
    """Conic (inverse covariance) and a 3-sigma radius in pixels, used to find covered tiles."""
    a, b, c = cov2d[0, 0], cov2d[0, 1], cov2d[1, 1]
    det = a * c - b * b
    conic = np.array([c, -b, a]) / det             # entries of Sigma'^{-1}: (A, B, C)
    mid = 0.5 * (a + c)
    lam_max = mid + np.sqrt(max(0.1, mid * mid - det))
    return conic, int(np.ceil(3.0 * np.sqrt(lam_max)))

def gaussian_alpha(pix, mean2d, conic, opacity):
    """alpha = o * exp(-0.5 d^T Sigma'^{-1} d), clamped like the reference rasterizer."""
    d = pix - mean2d
    power = -0.5 * (conic[0] * d[..., 0]**2 + conic[2] * d[..., 1]**2) - conic[1] * d[..., 0] * d[..., 1]
    alpha = np.minimum(0.99, opacity * np.exp(np.minimum(power, 0.0)))
    return np.where(alpha < 1.0 / 255.0, 0.0, alpha)
```

`project_gaussian` は数値的に検証できます。$\mathcal N(\boldsymbol\mu, \Sigma)$ から多数の点をサンプリングし、ピンホールモデルで厳密に投影して、2D 点の経験共分散を `cov2d`（`dilation=0` とする）と比較します。深度 5 にある小さなガウシアンでは、両者はおよそ 3 桁一致します。$t_x/t_z$ を半画角の $1.3\times$ にクランプするのはリファレンスの CUDA コードに倣ったもので、画像のはるか外にあるガウシアンでヤコビ行列が発散するのを防ぎます。

下のウィジェットは、まさにこの投影（1.3 倍のクランプ付きの同じヤコビアン、同じ $0.3I$）を、回転・スケールできるガウシアンと、周りを回れるカメラで実行します。

{% include widget.liquid name="neural-rendering-splat" height="480" caption="画像をドラッグするとカメラがガウシアンの周りを回り、3D ビューをドラッグすると視点が回転します。スライダーで 3 つのスケールと回転を設定します（ヨー、ピッチ、ロールを四元数にまとめ、1.1 節の式で $R$ に変換します）。表示は得られた $\Sigma^{\prime}$、ヤコビアン $J$、3σ 半径です。オレンジの楕円は 3σ 等値線、破線の正方形はスプラットがどの 16 × 16 タイルにかかるかを決める箱です（3.2 節）。スケールの 1 つをごく小さくし、ガウシアンを真横から見て、ローパスを切ってみてください。スプラットは 1 ピクセルより細い線に潰れます。" %}

## 3. ラスタライズ

### 3.1 アルファブレンディング

ピクセル $\mathbf p$ について、それに重なるガウシアンを深度順に手前から奥へソートして取り出します。各ガウシアンは次の不透明度を寄与します。

$$
\alpha_i(\mathbf p) = o_i \exp\!\Big( -\tfrac12 (\mathbf p - \boldsymbol\mu'_i)^\top {\Sigma'_{\text{2D},i}}^{-1} (\mathbf p - \boldsymbol\mu'_i) \Big),
$$

そして色は NeRF の求積（quadrature）とまったく同じように合成されます。

$$
C(\mathbf p) = \sum_{i=1}^{N_{\mathbf p}} \mathbf c_i\, \alpha_i \prod_{j=1}^{i-1} (1 - \alpha_j) = \sum_i \mathbf c_i\, \alpha_i\, T_i .
$$

式は同一で、変わったのはサンプルがどこから来るかです。NeRF はレイに沿って点をサンプリングして場を評価しますが、3DGS はピクセルが重なるプリミティブ（primitive）をソート順に取り出します。この同一性があるからこそ、3DGS は NeRF のデータセット、損失関数、評価指標をそのまま再利用できるのです。

リファレンスのラスタライザは、3 つの数値的なルールを加えています。$\alpha$ は最大 0.99 にクランプされること、$\alpha < 1/255$ の寄与はスキップされること、そして $T$ が $10^{-4}$ を下回りそうになった時点でそのピクセルの処理を止めること（**早期終了**（early termination））です。

図は、重なり合う 3 つのスプラットについてこれを計算したものです。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-blending.svg" caption="3 つのスプラットの前から後ろへのブレンディングを、上のアルファの式とクランプ規則で白背景の上に計算したもの。上：合成画像。ラベルは各スプラットの奥行きなので、$i$ はそのままブレンド順でもあります。下：破線の行に沿って、3 つのスプラットの重み $\alpha T$ を積み上げ、最後に残って背景を透かす透過率を一番上に重ねたもの。どのピクセルでも合計はちょうど 1 になり、緑のスプラットが手前にある所ではまず緑が自分の取り分を取り、赤と青が寄与できる分が小さくなります。" %}

### 3.2 タイルベースのソート

素朴な実装ではピクセルごとにガウシアンをソートすることになり、コストが高すぎて現実的ではありません。3DGS は CUDA で書かれたタイル（tile）ベースのソフトウェアラスタライザを使います。

1. **前処理**（ガウシアン 1 個につき 1 スレッド）：ガウシアンを視錐台カリング（frustum culling）し（ニア平面、およびガードバンド（guard band）の外側）、$\boldsymbol\mu'$、$\Sigma'_{\text{2D}}$、コニック（conic）、SH の色、3$\sigma$ 半径を計算し、その半径が $16\times16$ の**タイル**をいくつ覆うかを数えます。
2. **キー付きの複製**：（ガウシアン、タイル）のペアごとに 1 つのエントリを出力します。64 ビットのキーを持ち、上位 32 ビットがタイルのインデックス、下位 32 ビットがビュー空間の深度です（浮動小数点数のビットパターンとして格納し、正の数であれば正しくソートされます）。
3. すべてのキーに対する **1 回のグローバルな基数ソート**（radix sort）（CUB の GPU 基数ソート）。ソート後、エントリはタイルごとにまとめられ、各タイル内では深度順に並びます。
4. **範囲の検出**：各タイルについて、ソート済みリスト内でそのエントリの開始位置と終了位置を求めます。
5. **ブレンド**（タイル 1 枚につき 1 スレッドブロック、ピクセル 1 つにつき 1 スレッド）：スレッドが協調してガウシアンのバッチを共有メモリに読み込み、各ピクセルはリストを手前から奥へたどりながら、飽和するまで色と $T$ を累積します。

ピクセルごとではなくタイルごとにソートするのは近似です。タイル内のすべてのピクセルがガウシアン中心の同じ深度順を使うため、カメラの移動に伴って順序が変わると「ポッピング（popping）」が生じることがあります。後続の研究（たとえば StopThePop, Radl et al., SIGGRAPH 2024）は、ピクセルごとにより正確にソートします。

図は、投影された 5 つのガウシアンについてこの管理の様子を示しています。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-tiles.svg" caption="`project_gaussian` で 128 × 80 の画像（16 × 16 タイル）に投影した 5 つのガウシアンのタイル割り当て。実線の楕円は 3σ 等値線です。破線の正方形は半幅が `screen_extent` の 3σ 半径に等しく、どのタイル（色付き）にエントリを作るかを決めます。タイル内の数字は、全体ソート後のそのタイルのリストを前から後ろへ並べたものです（奥行きは上部に表示）。正方形は保守的で、細長いガウシアン 1 は実際には届かない角のタイルにも登録されます。またタイル内のすべてのピクセルが同じ順序、たとえば 1, 5, 2, 4 をたどります。" %}

### 3.3 逆伝播と勾配

学習にはすべてのパラメータについての $\partial \mathcal L / \partial$ が必要です。ブレンディング段階の逆伝播は、同じタイルごとのリストを**奥から手前へ**たどります。（順伝播で保存しておいた）最終的な透過率 $T_{N+1}$ から出発し、除算 $T_i = T_{i+1}/(1-\alpha_i)$ によって各 $T_i$ を復元するため、ピクセルごとの中間値のリストを保存する必要はありません。$C = \sum_i \mathbf c_i \alpha_i T_i$ とし、$B_i = \sum_{j>i} \mathbf c_j \alpha_j T_j / T_{i+1}$ をガウシアン $i$ の背後に累積された（正規化された）色とすると、

$$
\frac{\partial C}{\partial \mathbf c_i} = \alpha_i T_i,
\qquad
\frac{\partial C}{\partial \alpha_i} = T_i\,\big(\mathbf c_i - B_i\big).
$$

直感的には、ガウシアン $i$ をより不透明にすると、その色が加わる一方で、背後にあるものが隠されます。$\partial/\partial\alpha_i$ から連鎖律によって、勾配は不透明度 $o_i$、コニック、2D 平均 $\boldsymbol\mu'_i$ へと流れ、さらに EWA 投影を通じて $\Sigma$、$\mathbf q$、$\mathbf s$、$\boldsymbol\mu$ へ、SH 評価を通じて係数へ（そして視線方向を介して $\boldsymbol\mu$ へも）流れます。リファレンス実装はこれらの導関数をすべて CUDA で手書きしています。自動微分フレームワーク（以下のコードのように）を使えば自動的に得られますが、はるかに遅くなります。

### 3.4 PyTorch による密な微分可能スプラッティングレンダラ

手法を具体的にするため、約 40 行の完全な微分可能レンダラを示します。タイルを省略し、すべてのピクセルですべてのガウシアンを評価しますが、$64\times64$ の画像と数百個のガウシアンであれば問題ありません。また、画像ごとに 1 回だけ深度でソートします（上と同じ近似です）。同じパラメータ化、EWA 投影、0.3 のローパスフィルタ、ブレンディングを使い、短く保つために SH の代わりに単純な RGB を使っています。

```python
import math, torch, torch.nn.functional as F

def quat_to_rotmat_t(q):
    q = F.normalize(q, dim=-1)
    w, x, y, z = q.unbind(-1)
    return torch.stack([1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
                        2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
                        2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)], -1).view(-1, 3, 3)

def render(params, Rcw, tcw, fx, fy, W, H, bg=1.0):
    """Dense differentiable splatting (no tiles): every Gaussian is evaluated at every pixel.
    params: dict with means (N,3), quats (N,4), log_scales (N,3), opacity_logits (N,), rgb_logits (N,3)."""
    mu = params["means"]
    t = mu @ Rcw.T + tcw                                         # camera space (OpenCV)
    tz = t[:, 2].clamp(min=1e-3)
    J = torch.zeros(len(mu), 2, 3)
    J[:, 0, 0], J[:, 0, 2] = fx / tz, -fx * t[:, 0] / tz**2
    J[:, 1, 1], J[:, 1, 2] = fy / tz, -fy * t[:, 1] / tz**2
    M = quat_to_rotmat_t(params["quats"]) * torch.exp(params["log_scales"])[:, None, :]   # R S
    Sigma = M @ M.transpose(1, 2)
    T = J @ Rcw
    cov = T @ Sigma @ T.transpose(1, 2) + 0.3 * torch.eye(2)    # EWA + low-pass
    mean2d = torch.stack([fx * t[:, 0] / tz + W / 2, fy * t[:, 1] / tz + H / 2], -1)
    conic = torch.linalg.inv(cov)                                # (N, 2, 2)
    ys, xs = torch.meshgrid(torch.arange(H) + 0.5, torch.arange(W) + 0.5, indexing="ij")
    pix = torch.stack([xs, ys], -1).reshape(-1, 2)              # (P, 2)
    d = pix[None] - mean2d[:, None]                              # (N, P, 2)
    power = -0.5 * torch.einsum("npi,nij,npj->np", d, conic, d)
    alpha = (torch.sigmoid(params["opacity_logits"])[:, None] * torch.exp(power)).clamp(max=0.99)
    alpha = alpha * (t[:, 2:3] > 0.2)                            # cull Gaussians behind the camera
    order = torch.argsort(tz)                                    # front to back
    alpha, rgb = alpha[order], torch.sigmoid(params["rgb_logits"])[order]
    trans = torch.cumprod(torch.cat([torch.ones_like(alpha[:1]), 1 - alpha[:-1]], 0), 0)
    w = alpha * trans                                            # (N, P): w_i = T_i alpha_i
    img = w.T @ rgb + (1 - w.sum(0))[:, None] * bg
    return img.reshape(H, W, 3)
```

## 4. 損失関数

3DGS は学習画像ごとに次を最小化します。

$$
\mathcal L = (1 - \lambda)\, \mathcal L_1 + \lambda\, \mathcal L_{\text{D-SSIM}},
\qquad \lambda = 0.2,
\qquad \mathcal L_{\text{D-SSIM}} = 1 - \operatorname{SSIM}(\hat I, I).
$$

L1 項は外れ値に頑健で、色を正確に保ちます。構造的類似度（structural similarity）の項は $11\times11$ のガウス窓で局所的な平均、分散、共分散を比較し、ぼけや構造に敏感です。NeRF の L2 損失と比べて、よりシャープな結果が得られます。

```python
def ssim(x, y, C1=0.01**2, C2=0.03**2):
    """SSIM with an 11x11 Gaussian window (sigma 1.5), images (H, W, 3) in [0, 1]."""
    g = torch.exp(-((torch.arange(11) - 5.0) ** 2) / (2 * 1.5**2)); g = g / g.sum()
    win = (g[:, None] * g[None, :]).expand(3, 1, 11, 11)
    x, y = x.permute(2, 0, 1)[None], y.permute(2, 0, 1)[None]
    f = lambda z: F.conv2d(z, win, padding=5, groups=3)
    mx, my = f(x), f(y)
    sxx, syy, sxy = f(x * x) - mx**2, f(y * y) - my**2, f(x * y) - mx * my
    s = ((2 * mx * my + C1) * (2 * sxy + C2)) / ((mx**2 + my**2 + C1) * (sxx + syy + C2))
    return s.mean()

def loss_fn(pred, gt, lam=0.2):
    return (1 - lam) * (pred - gt).abs().mean() + lam * (1 - ssim(pred, gt))
```

これで、ガウシアンを多視点画像にフィットさせることができます。150 個のガウシアンからなるランダムな「正解」の集合を作り、5 台のカメラからレンダリングし、ランダムに初期化した別の集合を Adam とパラメータごとの学習率で最適化します。

```python
torch.manual_seed(0)

def look_at_t(C, target=torch.zeros(3)):
    z = F.normalize(target - C, dim=0); x = F.normalize(torch.linalg.cross(torch.tensor([0., -1., 0.]), z), dim=0)
    R = torch.stack([x, torch.linalg.cross(z, x), z]); return R, -R @ C

def random_gaussians(n, spread):
    return {"means": (torch.rand(n, 3) - 0.5) * spread, "quats": torch.randn(n, 4),
            "log_scales": torch.full((n, 3), math.log(0.08)) + 0.3 * torch.randn(n, 3),
            "opacity_logits": torch.full((n,), 2.0), "rgb_logits": torch.randn(n, 3) * 2}

W = H = 64; fx = fy = 70.0
cams = [look_at_t(torch.tensor([3 * math.sin(a), -0.6, -3 * math.cos(a)])) for a in torch.linspace(-0.8, 0.8, 5)]
gt_scene = random_gaussians(150, 1.6)
with torch.no_grad():
    targets = [render(gt_scene, R, t, fx, fy, W, H) for R, t in cams]

model = {k: v.clone().requires_grad_(True) for k, v in random_gaussians(150, 1.6).items()}
model["opacity_logits"].data.fill_(-2.2)                       # sigmoid(-2.2) ~ 0.1, as in 3DGS
lrs = {"means": 1e-2, "quats": 1e-2, "log_scales": 5e-3, "opacity_logits": 5e-2, "rgb_logits": 2.5e-2}
opt = torch.optim.Adam([{"params": [model[k]], "lr": lr} for k, lr in lrs.items()], eps=1e-15)
for it in range(601):
    k = it % len(cams)
    pred = render(model, *cams[k], fx, fy, W, H)
    loss = loss_fn(pred, targets[k])
    opt.zero_grad(); loss.backward(); opt.step()
    if it % 150 == 0:
        with torch.no_grad():
            mse = torch.stack([((render(model, R, t, fx, fy, W, H) - g) ** 2).mean()
                               for (R, t), g in zip(cams, targets)]).mean()
        print(f"iter {it:4d}  loss {loss.item():.4f}  PSNR {-10 * torch.log10(mse).item():.1f} dB")
```

CPU の 1 スレッドで約 1 分で実行でき、学習視点の PSNR は 600 イテレーションで 12.0 dB から 33.2 dB まで上昇します（150 イテレーション後は 27.6 dB）。高密度化（densification）がないため、最初の 150 個のガウシアンを移動・変形することしかできません。実際の手法では、ガウシアンの数も変化させます。

## 5. 初期化

3DGS は、COLMAP がカメラを推定する際に生成した**疎な SfM 点群**（sparse SfM point cloud）から出発します（第 1 回）。点 1 つにつきガウシアンを 1 つ置き、

- 平均はその点の位置、SH の DC 成分はその点の色から設定します（高次の SH はゼロ）。
- 等方的なスケールは、最近傍 3 点までの平均距離に等しくします（対数で保存）。
- 回転は恒等回転、不透明度は 0.1 とします。

バウンディングボックス内でのランダムな初期化も合成シーンではうまくいきますが、現実の非有界（unbounded）なキャプチャでは目に見えて悪化します。良質な SfM 点は重要で、特に背景で効いてきます。

図は、おもちゃの点群から得られる初期スケールを示しています。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-init.svg" caption="SfM 点からの初期化（分かりやすさのため 2D の断面）。各点は、最も近い 3 点までの平均距離を半径とする等方的なガウシアンになります（色は対数スケール）。密にマッチした構造（楕円形の物体、上部の壁）は小さなガウシアンから始まり、孤立した背景の点は巨大なガウシアンから始まるため、最適化で縮小、分割、または枝刈りする必要があります。" %}

## 6. 適応的密度制御

初期の点は数が少なすぎ、分布も良くありません。100 イテレーションごとに（500 イテレーションのウォームアップ後、15,000 イテレーションまで）、3DGS は単純な信号を使ってガウシアンの集合を適応させます。それは、各ガウシアンの **2D 投影平均** に関する損失の勾配の大きさを、そのガウシアンが見えていた視点にわたって平均したものです。ビュー空間での位置勾配が大きいということは、オプティマイザがそのガウシアンを懸命に動かそうとしていることを意味し、これはまだうまく再構成されていない領域で起こります。平均値が $\tau_{\text{pos}} = 0.0002$ を超えるガウシアンについて、

- 小さなガウシアン（最大スケールがシーン範囲の 1% 未満）を**クローン（clone）**します。これは**再構成不足**（under-reconstruction）の状態、つまり小さなガウシアンが欠けているジオメトリを覆わなければならない状態です。コピーを 1 つ追加すると、オプティマイザがその後、勾配に沿って 2 つを引き離します。
- 大きなガウシアンを**分割（split）**します。これは**過剰再構成**（over-reconstruction）の状態、つまり 1 つの大きなガウシアンが分散の大きい領域を覆っている状態です。元のガウシアンは 2 つの新しいガウシアンに置き換えられ、その平均は元のガウシアンを確率密度関数（PDF）としてサンプリングされ、スケールは $\phi = 1.6$ で割られます。

同じステップで、不透明度が $\epsilon_\alpha = 0.005$ 未満のガウシアンと、（最初の不透明度リセット以降は）ワールド空間またはスクリーン空間で非常に大きいガウシアンを**枝刈り（prune）**します。

3000 イテレーションごとに、**不透明度リセット（opacity reset）**によってすべての不透明度を最大 0.01 に設定します。カメラの近くにあるフローター（floaters）は高密度化によって生き残りがちですが、リセット後、本当に必要なガウシアンはすぐに不透明度を取り戻し、それ以外は透明なまま残って枝刈りされます。これらの閾値で使われるシーンの「範囲」は、カメラ中心の分布の半径から計算されます。

次の 3 つの図は、これらの規則を実際に（小規模ながら）動かした結果です（コードは `bin/figures/neural-rendering/neural-rendering_04.py`）。NumPy で 2D ガウシアンを 64 × 64 の画像にフィットし、L1 損失、Adam、そして 3.3 節のブレンディングの導関数を使った解析的な勾配を用います。イテレーション 200 から 900 まで 100 回ごとに密度化し、イテレーション 700 で不透明度を 1 回リセットします。しきい値はこのおもちゃの問題に合わせており、最大スケールが 2 ピクセル以下なら複製、勾配のしきい値はこの損失の正規化で $6\times10^{-5}$ です。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-adc-events.svg" localized="true" caption="おもちゃの実行における個々の密度化ステップ。左：平均位置勾配が大きく、まだ小さいガウシアンは複製されます（オレンジ、2σ で描画）。中：勾配が大きい大きなガウシアンは分割されます（破線：取り除かれる親、実線：親からサンプリングされ 1.6 で縮小された 2 つの子）。右：不透明度リセットの後、不透明度が 0.005 未満のままのガウシアンは枝刈りされます（赤い×）。細い灰色の楕円は変更されなかったガウシアンです。" %}

3.4 節のパラメータ辞書に対して動作するコンパクトな実装を示します。

```python
def densify_and_prune(params, grad_accum, denom, extent, grad_thresh=2e-4,
                      percent_dense=0.01, min_opacity=0.005, n_split=2):
    """One adaptive density control step in the spirit of 3DGS.
    grad_accum: (N,) sum of view-space positional gradient norms; denom: (N,) number of views."""
    grads = grad_accum / denom.clamp(min=1)
    big_grad = grads >= grad_thresh
    max_scale = torch.exp(params["log_scales"]).max(-1).values
    clone = big_grad & (max_scale <= percent_dense * extent)    # under-reconstruction: copy
    split = big_grad & (max_scale > percent_dense * extent)     # over-reconstruction: split

    new = {k: [v.detach()] for k, v in params.items()}
    for k, v in params.items():                                  # clones are exact copies
        new[k].append(v.detach()[clone])
    # splits: sample n_split new means from the parent Gaussian, shrink scales by 1.6
    std = torch.exp(params["log_scales"].detach()[split]).repeat(n_split, 1)
    R = quat_to_rotmat_t(params["quats"].detach()[split]).repeat(n_split, 1, 1)
    offset = (R @ (torch.randn_like(std) * std)[..., None]).squeeze(-1)
    for k, v in params.items():
        child = v.detach()[split].repeat(n_split, *[1] * (v.dim() - 1))
        if k == "means":
            child = child + offset
        elif k == "log_scales":
            child = child - math.log(1.6)
        new[k].append(child)
    keep_parent = torch.cat([~split, torch.ones(int(clone.sum()) + n_split * int(split.sum()), dtype=torch.bool)])
    out = {k: torch.cat(v)[keep_parent] for k, v in new.items()}  # parents of splits are removed
    alive = torch.sigmoid(out["opacity_logits"]) > min_opacity   # prune transparent Gaussians
    return {k: v[alive].clone().requires_grad_(True) for k, v in out.items()}

def reset_opacity(params, value=0.01):
    """Every 3000 iterations: clamp opacities down so that floaters must 'earn' their opacity back."""
    with torch.no_grad():
        cap = torch.logit(torch.tensor(value))
        params["opacity_logits"].copy_(torch.minimum(params["opacity_logits"], cap))
```

実用上の細かい点が 2 つあります。ビュー空間の勾配は `loss.backward()` の後に 2D 平均から読み取ります（公式コードでは、スクリーン空間の平均を保持するダミーのテンソルに対して `retain_grad()` を呼び出すことで実現しています）。また、高密度化のたびに、オプティマイザの状態（Adam のモーメント）を新しいガウシアンの分だけ拡張し、削除されたガウシアンの分は除去しなければなりません。リファレンスコードはオプティマイザの状態テンソルをその場で編集することでこれを行っています。閾値ベースの高密度化はヒューリスティックであり、後続のいくつかの研究がこれを置き換えています。たとえば、ガウシアンを MCMC のサンプルとして扱い、固定の予算を用いる手法（3DGS-MCMC, NeurIPS 2024）があります。

おもちゃの実行全体を通して、画像に細部がある所でガウシアンが増え、それに伴って品質が上がります。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-adc-progress.svg" caption="ランダムな初期化（不透明度 0.1 の等方的なガウシアン 40 個）から終了までのおもちゃの実行。上：描画した画像とその PSNR。下：ガウシアンそのものを、色と不透明度で塗った 1σ 楕円として描いたもの。密度化によって細い線とリングに沿って多数の小さなガウシアンが集まり、平坦な領域には少数の大きなガウシアンが残ります。" %}

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/04-adc-curve.svg" localized="true" caption="おもちゃの実行中の PSNR（紫）とガウシアン数（オレンジの階段）。点線は密度化のステップで、その直後は新しいガウシアンが落ち着くまで PSNR が一時的に下がります。イテレーション 700 の不透明度リセットで画像は一瞬ほぼ透明になりますが、必要なガウシアンは数十イテレーションで不透明度を取り戻し、不要なものは次のステップで枝刈りされます。" %}

## 7. 学習レシピ

まとめると、リファレンス実装はバッチサイズ 1（イテレーションごとにランダムな学習画像 1 枚）で **30,000 イテレーション** 学習します。

| 構成要素 | リファレンスコードでの設定 |
| --- | --- |
| オプティマイザ | Adam、パラメータグループごとに別々の学習率 |
| 位置の学習率 | $1.6\times10^{-4}$ にシーン範囲を掛けた値から、30k イテレーションで $1.6\times10^{-6}$ まで指数的に減衰 |
| その他の学習率 | SH DC $2.5\times10^{-3}$（高次は $/20$）、不透明度 $0.05$（後のバージョンでは下げられている）、スケール $5\times10^{-3}$、回転 $10^{-3}$ |
| SH スケジュール | 次数 0 から始め、1000 イテレーションごとに次数を 1 つ上げて 3 まで |
| 高密度化 | 500 から 15,000 まで 100 イテレーションごと。不透明度リセットは 3000 ごと |
| 損失 | $0.8\,\mathcal L_1 + 0.2\,\mathcal L_{\text{D-SSIM}}$ |
| 背景 | 黒または白（合成データではランダム背景も選択可能） |

SH スケジュールは重要です。視点依存の係数が最初から自由だと、モデルはジオメトリの誤差を視点依存の色に「塗り込む」ことで説明できてしまい、学習視点からは正しく見えても、それ以外の視点からは誤って見えます。論文では、数分ですでに良好な品質が得られる 7,000 イテレーションの設定も報告されており、30k の完全な学習は 1 枚のハイエンド GPU で数十分かかります。結果として得られるガウシアンは通常 100 万個から数百万個です。

標準的なベンチマーク（Mip-NeRF 360、Tanks and Temples、Deep Blending）において、論文は Mip-NeRF 360 と同等かそれ以上の品質を、第 3 回の最速のグリッド手法に匹敵する学習時間で達成し、1080p でのリアルタイムレンダリングを実現したと報告しています。主な弱点は、次回で概観するように、メモリ量、レンダリング解像度が学習時と異なる場合のエイリアシング、画像としては十分でも正確な表面ではないジオメトリ、近似的なソートによるポッピング、そして良質な SfM が必要なことです。

## 8. 試してみよう：「ガウシアンワールド」デモ

ホームページの[インタラクティブラボ]({{ '/' | relative_url }}#lab)には **「ガウシアンワールド」** というタブがあります。約 20 万個の 3D ガウシアンでできた編集可能なオープンワールドで、依存ライブラリなしで WebGL 2 上で動作します。これは本記事の*レンダリング側の半分*を実装しています。

- 各ガウシアンは中心、回転フレーム、3 つのスケール、色、不透明度を持ち、その 3D 共分散は透視写像のヤコビ行列を通じてスクリーン空間の楕円へ投影されます（第 2 節）。頂点シェーダでは 2D 共分散に同じ $0.3$ の膨張を加えています。
- スプラットは毎フレーム深度ソートされ（タイルベースの基数ソートではなく、Web Worker 内での 16 ビットのカウンティングソート）、奥から手前へアルファ合成されます。乗算済みアルファ（premultiplied alpha）を用いれば、これは数学的に 3.1 節の手前から奥への和と同じです。
- デバッグビュー（「楕円体」「中心点」「重なり」「深度」）では、個々のガウシアン、その中心、各ピクセルに重なっているスプラットの数、深度を確認でき、公式の SIBR ビューアの楕円体モードによく似ています。

3DGS とは重要な点で異なります。**この中には学習されたものが何もありません。** ガウシアンは、キーワード駆動のジェネレータ（地形、湖、木、村、天候）によってテキストプロンプトから手続き的に生成されており、学習済みのテキストからワールドへの（text-to-world）モデルの代役を務めています。また、ベイクされた球面調和関数の放射輝度の代わりに、各ガウシアンはアルベド（albedo）と法線を持ち、GPU 上で一日の任意の時刻に合わせて**リライティング**（relighting）されます。スプラットしたシャドウマップによる太陽の影、風のアニメーション、季節の変化も備えています。地形のガウシアンは毎フレーム、編集可能なハイトフィールド（heightfield）から高さ、法線、マテリアルを導き直すため、ワールドを彫刻したりペイントしたりできます。キャプチャされた 3DGS シーンでは、第 5 回で扱うリライティングと編集の研究なしにはこうしたことはできません。その色にはキャプチャ時の照明がベイクされているからです。

このデモを使って直感を養いましょう。個々の楕円が見えるまでズームインし、細長いガウシアンがどのように表面に沿って並ぶかを観察し、ソート順の変化によって時折ポッピングが起こることに注目してください。これは 3.2 節で論じたのと同じアーティファクトです。

## 代表的な論文

| 論文 | 会議/論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Surface Splatting (Zwicker, Pfister, van Baar & Gross) | SIGGRAPH | 2001 | — | 楕円ガウススプラットによる点ベースレンダリング |
| EWA Splatting (Zwicker, Pfister, van Baar & Gross) | IEEE TVCG | 2002 | [DOI](https://doi.org/10.1109/TVCG.2002.1021576) | ローパスフィルタ付きのガウスカーネルの投影 |
| Plenoxels: Radiance Fields without Neural Networks (Fridovich-Keil, Yu et al.) | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2112.05131) | SH による色と明示的最適化、直接の前身 |
| 3D Gaussian Splatting for Real-Time Radiance Field Rendering (Kerbl et al.) | ACM TOG 42(4) / SIGGRAPH | 2023 | [arXiv](https://arxiv.org/abs/2308.04079) · [DOI](https://doi.org/10.1145/3592433) | 本記事で扱う手法 |
| gsplat: An Open-Source Library for Gaussian Splatting (Ye et al.) | arXiv | 2024 | [arXiv](https://arxiv.org/abs/2409.06765) | nerfstudio が使うモジュール化された CUDA ラスタライザ |
| 3D Gaussian Splatting as Markov Chain Monte Carlo (Kheradmand et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2404.09591) | クローン／分割ヒューリスティックの原理的な置き換え |
| 3D Gaussian Ray Tracing: Fast Tracing of Particle Scenes (Moenne-Loccoz et al.) | ACM TOG (SIGGRAPH Asia) | 2024 | [arXiv](https://arxiv.org/abs/2407.07090) | レイトレーシングされるガウシアン：歪んだカメラ、二次レイ |

## 学習リソース

- 公式の[プロジェクトページ](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/)と[コード](https://github.com/graphdeco-inria/gaussian-splatting)（PyTorch による学習、`diff-gaussian-rasterization` 内の CUDA ラスタライザ、SIBR ビューア）。`gaussian_model.py`、`train.py`、`forward.cu` / `backward.cu` を本記事と並べて読むのが、細部を学ぶ最良の方法です。
- [gsplat](https://github.com/nerfstudio-project/gsplat) とそのドキュメント。勾配の導出と、すっきりした Python のリファレンス実装が含まれています。
- [nerfstudio splatfacto](https://docs.nerf.studio/nerfology/methods/splat.html)。ドキュメントの充実した再実装です。
- M. Zwicker et al., "EWA Splatting"（2002）のリサンプリングフィルタ（resampling filter）に関する節。第 2 節の背後にある理論です。

## 演習

1. $\Sigma = R S S^\top R^\top$ が半正定値であり、その固有ベクトルが $R$ の各列であることを証明してください。
2. $u = f_x t_x / t_z$ と $v = f_y t_y/t_z$ を微分して $J$ を導出し、`project_gaussian` を有限差分で検証してください。
3. PyTorch レンダラで膨張を 0.3 から 0 に変えて $64\times64$ で学習し、次に $256\times256$ でレンダリングしてください（$f_x, f_y$ を 4 倍にします）。何が見えるでしょうか。また、0.3 の膨張はそれをどう変えるでしょうか。
4. レンダラに次数 1 の SH を追加してください。形状 `(N, 4, 3)` の `sh` を保存し、カメラ中心から各平均への視線方向で評価します。第 7 節の SH スケジュールで学習してください。
5. `densify_and_prune` を学習ループに組み込んでください。`mean2d.grad.norm(dim=-1)` を累積し（`mean2d.retain_grad()` を呼び出します）、100 イテレーションごとに高密度化し、オプティマイザを作り直して、最終的な PSNR を個数固定版と比較してください。

**次回：** [第 5 回]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})では、3DGS 以降に何が起きたかを概観します。アンチエイリアシング、表面、動的シーン、圧縮、SLAM、フィードフォワードモデル、生成、リライティング、物理、AR/VR です。
