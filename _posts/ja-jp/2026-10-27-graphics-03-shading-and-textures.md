---
layout: post
title: "シェーディングとテクスチャ：ライティングモデル、法線マップ、フィルタリング、シャドウ"
date: 2026-10-27 09:03:00+0900
description: "Lambert・Phong・Blinn-Phong、フラット／Gouraud／Phong シェーディング、UV と接空間、ミップマップと異方性フィルタリング、バイアスと PCF を用いたシャドウマッピングを NumPy と GLSL のコードで解説します。"
categories: graphics
tags: [shading, blinn-phong, normal-mapping, texture-filtering, mipmap, shadow-mapping, glsl]
series: graphics
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[前回の記事]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})では三角形をピクセルに変換しました。覆われた各ピクセルについて、ラスタライザはパースペクティブ補正された補間属性（位置、法線、UV）を渡してくれます。今回はその次の問い、**そのピクセルは何色であるべきか？** に答えます。古典的な局所照明（local illumination）モデル（Lambert、Phong、Blinn-Phong）を組み立て、テクスチャがそれらに空間的に変化する入力（アルベド、法線）をどう与えるか、エイリアシングを起こさずにテクスチャをサンプリングする方法（ミップマップ、トライリニア・異方性フィルタリング）、そして最初の非局所的な効果である影をシャドウマッピング（shadow mapping）で加える方法を学びます。これらの「経験的」モデルこそ、物理ベースレンダリング（PBR、[次回]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})）が物理で置き換える対象であり、ここで扱う概念（接空間の座標系、ミップレベル、深度比較、G-buffer）はすべて PBR、レイトレーシング、さらにはニューラルレンダリングにも引き継がれます。

## 前提知識

- 内積と外積、そして法線が逆転置行列で変換される理由（[第 01 回]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})）。
- MVP パイプライン、重心座標、パースペクティブ補正補間、頂点／フラグメントシェーダの役割分担（[第 02 回]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})）。
- NumPy。GLSL を少し知っていると役立ちますが、以下のシェーダにはすべてコメントを付けています。

## 1. シェーディングに使うベクトル

局所シェーディングでは、1 つの表面上の点 $\mathbf{p}$ といくつかの**単位**ベクトルだけを見ます。これらはすべて同じ空間（ワールド空間またはビュー空間）で表す必要があります。空間を混ぜることは、最もよくあるシェーディングのバグです。

| 記号 | 意味 |
| --- | --- |
| $\mathbf{n}$ | $\mathbf{p}$ における表面法線 |
| $\mathbf{l}$ | $\mathbf{p}$ から光源**へ向かう**方向 |
| $\mathbf{v}$ | $\mathbf{p}$ から視点**へ向かう**方向 |
| $\mathbf{r}$ | $\mathbf{n}$ に関する $\mathbf{l}$ の鏡面反射方向 |
| $\mathbf{h}$ | $\mathbf{l}$ と $\mathbf{v}$ の間のハーフベクトル（half vector） |

いずれも表面から*離れる*向きです。平行光源では $\mathbf{l}$ は定数です。$\mathbf{x}_L$ にある点光源では $\mathbf{l} = (\mathbf{x}_L - \mathbf{p})/\lVert\mathbf{x}_L - \mathbf{p}\rVert$ となり、受け取る強度は距離 $d$ に対して $1/d^2$ で減衰します。

## 2. 局所照明モデル

### 2.1 Lambert：拡散反射

完全につや消しの（拡散、diffuse）表面は入射光をあらゆる方向へ均等に散乱するため、その明るさは $\mathbf{v}$ に依存しません。依存するのは、どれだけの光を*受け取る*かです。断面積 $A$ の光束が法線と角度 $\theta$ をなして表面に当たると、面積 $A/\cos\theta$ に広がるので、単位面積あたりのエネルギーは $\cos\theta = \mathbf{n}\cdot\mathbf{l}$ に比例します（Lambert の余弦則）。クランプすることで裏側からの光を除きます。

$$
L_\text{diffuse} = k_d \, I_L \, \max(0,\ \mathbf{n}\cdot\mathbf{l})
$$

ここで $k_d$ は拡散色（アルベド、albedo）、$I_L$ は光源の強度です。PBR では物理的に正しい拡散 BRDF が $k_d/\pi$ であることを見ますが、ここではその $\pi$ を光源の単位に含めています。

### 2.2 Phong：鏡面方向まわりのハイライトローブ

光沢のある表面には、視点とともに動くハイライトが加わります。Phong（1975）はそれを鏡面反射方向まわりのローブ（lobe）としてモデル化しました。

$$
\mathbf{r} = 2(\mathbf{n}\cdot\mathbf{l})\,\mathbf{n} - \mathbf{l},
$$

これは $\mathbf{l}$ を $\mathbf{n}$ 方向の成分 $(\mathbf{n}\cdot\mathbf{l})\mathbf{n}$ と接線方向の残りに分解し、残りを反転させることで得られます。Phong 反射モデル全体は次のとおりです。

$$
L = k_a I_a + k_d I_L \max(0,\ \mathbf{n}\cdot\mathbf{l}) + k_s I_L \max(0,\ \mathbf{r}\cdot\mathbf{v})^{s},
$$

環境光項 $k_a I_a$ はすべての間接光を大まかな定数で代用したもの、$k_s$ は鏡面反射色、$s$ は**光沢度**（shininess）です。$s$ が大きいほどハイライトは鋭く小さくなります。

### 2.3 Blinn-Phong：ハーフベクトル

Blinn（1977）は $\mathbf{r}\cdot\mathbf{v}$ を $\mathbf{n}\cdot\mathbf{h}$ に置き換えました。

$$
\mathbf{h} = \frac{\mathbf{l} + \mathbf{v}}{\lVert\mathbf{l} + \mathbf{v}\rVert}, \qquad
L_\text{spec} = k_s I_L \max(0,\ \mathbf{n}\cdot\mathbf{h})^{s'} .
$$

直観的には、$\mathbf{h}$ は小さな鏡が $\mathbf{l}$ をちょうど $\mathbf{v}$ へ反射するために必要な向きです。$\mathbf{n}\cdot\mathbf{h}$ は実際の法線がその理想的な鏡の向きにどれだけ近いかを測ります。これはまさに次回の**マイクロファセット**（microfacet）理論の考え方で、そこでは $\mathbf{h}$ がマイクロファセット法線に、$(\mathbf{n}\cdot\mathbf{h})^{s'}$ が法線分布関数になります。

Blinn-Phong が好まれる理由は次のとおりです。

1. **安い**：平行光源と遠方の視点では、$\mathbf{h}$ が物体全体で一定になります。
2. **振る舞いが良い**：$\mathbf{r}$ と $\mathbf{v}$ のなす角が $90^\circ$ を超えると $\mathbf{r}\cdot\mathbf{v}$ は負になり、粗い（$s$ が小さい）表面ではグレージング角でハイライトが急に切れてしまいます。一方 $\mathbf{n}\cdot\mathbf{h}$ は、$\mathbf{l}$ と $\mathbf{v}$ がどちらも表面の上側にある限り正のままです。
3. **測定データに近い**：実際の表面と同様、グレージング角でハイライトが引き伸ばされます。

2 つの指数は同じではありません。$\mathbf{v}$ が $\mathbf{n}$ と $\mathbf{l}$ の張る平面内にあるとき、$\mathbf{n}$ と $\mathbf{h}$ のなす角は、$\mathbf{r}$ と $\mathbf{v}$ のなす角 $\alpha$ のちょうど半分です。$\ln\cos x \approx -x^2/2$ を使うと、

$$
(\cos\tfrac{\alpha}{2})^{s'} \approx e^{-s'\alpha^2/8}, \qquad (\cos\alpha)^{s} \approx e^{-s\alpha^2/2}
\quad\Rightarrow\quad s' \approx 4s .
$$

後のために一言：このままのモデルはエネルギー保存を満たしません（$s$ を大きくするとハイライトが小さくなり、*合計*でも暗くなります）。リアルタイムレンダリングでよく使われる対処は、鏡面項に近似的な正規化係数 $(s'+8)/(8\pi)$ を掛けることです。PBR ではこれをきちんと扱います。

以下の NumPy コードは球の上で Lambert + Phong / Blinn-Phong を評価し、PPM 画像を書き出します（任意の画像ビューアで開けます）。$s' = 4s$ とすると 2 枚の画像はほぼ同じになり、上の導出が確かめられます（平均輝度 0.418 対 0.416）。

```python
import numpy as np

def normalize(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)

def shade(n, l, v, model="blinn", kd=0.8, ks=0.5, shininess=32.0, ka=0.05):
    """n, l, v: (..., 3) unit vectors pointing away from the surface."""
    ndotl = np.clip(np.sum(n * l, -1), 0.0, None)
    diffuse = kd * ndotl                                   # Lambert
    if model == "phong":
        r = 2.0 * np.sum(n * l, -1, keepdims=True) * n - l  # mirror l about n
        spec = np.clip(np.sum(r * v, -1), 0.0, None) ** shininess
    else:                                                  # Blinn-Phong
        h = normalize(l + v)
        spec = np.clip(np.sum(n * h, -1), 0.0, None) ** shininess
    spec = np.where(ndotl > 0.0, spec, 0.0)                # no highlight on the back side
    return ka + diffuse + ks * spec

# Render a unit sphere seen by an orthographic camera looking down -z.
W = H = 256
y, x = np.mgrid[1:-1:H*1j, -1:1:W*1j]
inside = x**2 + y**2 < 1.0
z = np.sqrt(np.clip(1.0 - x**2 - y**2, 0.0, None))
n = np.stack([x, y, z], -1)                    # the normal of a unit sphere is its position
l = normalize(np.array([1.0, 1.0, 1.0]))       # directional light
v = np.array([0.0, 0.0, 1.0])                  # orthographic viewer

for model, s in [("phong", 16.0), ("blinn", 64.0)]:
    img = np.where(inside, shade(n, l, v, model, shininess=s), 0.0)
    rgb = (np.clip(img, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)   # crude gamma
    with open(f"sphere_{model}.ppm", "wb") as f:
        f.write(b"P6 %d %d 255\n" % (W, H))
        f.write(np.repeat(rgb[..., None], 3, -1).tobytes())
    print(model, "max", img.max().round(3), "mean", img[inside].mean().round(3))
```

## 3. シェーディング頻度：フラット、Gouraud、Phong シェーディング

照明*モデル*は $(\mathbf{n},\mathbf{l},\mathbf{v})$ から色を計算する方法を、シェーディング*頻度*はそれを**どこで**評価するかを決めます。Phong 反射モデルと Phong シェーディング（補間方法）を混同しないでください。同じ論文から生まれたものですが、互いに独立した選択です。

| 手法 | 評価する場所 | 使う法線 | 長所 | 短所 |
| --- | --- | --- | --- | --- |
| フラット（flat） | 三角形ごとに 1 回 | 面法線 | 安い、意図的なポリゴン調 | 曲面がカクカクに見える |
| Gouraud（1971） | 頂点ごと、色を補間 | 頂点法線 | 安く滑らか | 三角形内部のハイライトが消えたりにじんだりする；マッハバンド |
| Phong シェーディング（1975） | ピクセルごと | 補間した頂点法線を**再正規化** | ハイライトが正しい | フラグメントの計算が増える（今日では無視できる） |

現代の GPU ではピクセル単位のシェーディングが標準です。頂点シェーダが法線を出力し、ラスタライザがそれを（パースペクティブ補正つきで）補間し、フラグメントシェーダが再正規化します。単位ベクトルの線形補間は長さが 1 より短くなるからです。

法線を持たないメッシュの**頂点法線**は、通常、隣接する面の法線を平均して求めます。三角形の面積による重み付けはタダで手に入ります。2 辺の外積の長さが面積のちょうど 2 倍だからです。

```python
import numpy as np

def vertex_normals(P, F):
    """P: (V,3) positions, F: (T,3) triangle indices -> (V,3) area-weighted normals."""
    e1 = P[F[:, 1]] - P[F[:, 0]]
    e2 = P[F[:, 2]] - P[F[:, 0]]
    fn = np.cross(e1, e2)                 # length = 2 * triangle area -> area weighting for free
    N = np.zeros_like(P)
    for k in range(3):
        np.add.at(N, F[:, k], fn)         # scatter-add each face normal to its 3 vertices
    return N / np.linalg.norm(N, axis=1, keepdims=True)

def vertex_tangents(P, UV, F, N):
    """Per-vertex tangent frame (T.xyz, handedness w) from positions and UVs."""
    e1 = P[F[:, 1]] - P[F[:, 0]]
    e2 = P[F[:, 2]] - P[F[:, 0]]
    d1 = UV[F[:, 1]] - UV[F[:, 0]]
    d2 = UV[F[:, 2]] - UV[F[:, 0]]
    det = d1[:, 0] * d2[:, 1] - d2[:, 0] * d1[:, 1]
    r = 1.0 / np.where(np.abs(det) < 1e-12, 1e-12, det)
    t = (e1 * d2[:, 1:2] - e2 * d1[:, 1:2]) * r[:, None]   # dP/du
    b = (e2 * d1[:, 0:1] - e1 * d2[:, 0:1]) * r[:, None]   # dP/dv
    T = np.zeros_like(P); B = np.zeros_like(P)
    for k in range(3):
        np.add.at(T, F[:, k], t)
        np.add.at(B, F[:, k], b)
    T = T - N * np.sum(N * T, 1, keepdims=True)            # Gram-Schmidt against N
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    w = np.sign(np.sum(np.cross(N, T) * B, 1))             # +1 or -1 (mirrored UVs)
    return T, w

# A unit quad in the xy-plane with a standard UV layout
P  = np.array([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], float)
UV = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], float)
F  = np.array([[0, 1, 2], [0, 2, 3]])
N = vertex_normals(P, F)
T, w = vertex_tangents(P, UV, F, N)
print("N", N[0], "T", T[0], "w", w[0])        # expect N=(0,0,1), T=(1,0,0), w=+1
UVm = UV.copy(); UVm[:, 0] = 1 - UVm[:, 0]   # mirror the texture horizontally
print("mirrored w", vertex_tangents(P, UVm, F, N)[1][0])   # expect -1
```

2 つ目の関数は接線を計算します。これは第 6 節で使います。面ごとのデータなしにシェーダ内でフラットシェーディングを行いたい場合は、補間された位置のスクリーン空間微分が三角形の平面を張ることを利用できます。

```glsl
#version 330 core
in vec3 vWorldPos;
out vec4 fragColor;
uniform vec3 uLightDir;
void main() {
    // flat shading without per-face data: the screen-space derivatives of the
    // position span the triangle's plane, so their cross product is the face normal
    vec3 Nf = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    fragColor = vec4(vec3(max(dot(Nf, normalize(uLightDir)), 0.0)), 1.0);
}
```

## 4. テクスチャと UV マッピング

実際の表面は点ごとに変化します。$k_d$ を頂点ごとに持つ代わりに画像、つまり**テクスチャ**（texture）に格納し、各頂点に**テクスチャ座標** $(u,v)\in[0,1]^2$ を与えます。テクスチャマッピングは Catmull が 1974 年の博士論文で導入しました。今日のテクスチャにはアルベド、法線、ラフネス、メタルネス、アンビエントオクルージョン、ディスプレイスメントなどが格納されます。

- **UV マッピング（パラメータ化、parameterization）**は 3 次元の表面から 2 次元のテクスチャ正方形への写像です。閉じた曲面を平面に展開するには**シーム（seam）に沿って切る**必要があり、アーティストやツール（xatlas、Blender の UV 展開）は伸びや歪みを最小化します。シーム上の頂点は複製され、それぞれ異なる UV を持ちます。
- UV は他の属性と同じく三角形上で補間されますが、**必ず**パースペクティブ補正補間を使わなければなりません（[第 02 回]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})）。アフィン補間では大きな三角形の上でテクスチャが泳いだり曲がったりします。
- **ラップモード**（wrap mode）は $[0,1]$ の外側の扱いを決めます。リピート（タイリング）、エッジへのクランプ、ミラーリピートなどです。
- **テクセル中心**：幅 $W$ のテクスチャのテクセル（texel）$i$ は $[i, i+1)/W$ を覆い、その中心は $(i + 0.5)/W$ にあります。$u$ を連続的なテクセル空間に写すと $x = uW - 0.5$ です。この $0.5$ を忘れると、すべてのテクスチャが半テクセルずれます。
- **色空間**：アルベドテクスチャは通常 sRGB で保存されており、ライティングの前にリニアへデコードする必要があります（`SRGB8_ALPHA8` などのフォーマットでは GPU が自動で行います）。法線やラフネスなどのデータテクスチャはリニアです。

## 5. テクスチャフィルタリング

1 ピクセルがちょうど 1 テクセルに対応することはまれです。2 つの場合があります。

- **拡大**（magnification）：1 テクセルが多数のピクセルを覆う（クローズアップ）。*補間*が必要です。
- **縮小**（minification）：1 ピクセルが多数のテクセルを覆う（遠くの床）。ピクセルのフットプリント（footprint）上で*平均*を取る必要があり、そうしないとエイリアシング、つまりモアレやちらつきが生じます。第 02 回のギザギザのエッジと同じサンプリングの問題です。

### 5.1 ニアレストとバイリニア

ニアレスト（nearest）はサンプル点を含むテクセルを選ぶので、ブロック状に見えます。**バイリニア**（bilinear）フィルタリングは最も近い 4 つのテクセル中心をブレンドします。$x = uW - 0.5$、$y = vH - 0.5$、$x_0 = \lfloor x\rfloor$、$f_x = x - x_0$（$y_0$、$f_y$ も同様）とすると、

$$
T(u,v) = (1-f_y)\big[(1-f_x)\,T_{x_0,y_0} + f_x\,T_{x_0+1,y_0}\big] + f_y\big[(1-f_x)\,T_{x_0,y_0+1} + f_x\,T_{x_0+1,y_0+1}\big].
$$

### 5.2 ミップマップ

実行時にピクセルごとに数百のテクセルを平均するのは遅すぎます。Williams（1983）は**ミップマップ**（mipmap、ラテン語の *multum in parvo*「小さなものの中に多くを」に由来）を事前計算することを提案しました。これはピラミッド構造で、レベル $k+1$ はレベル $k$ を各方向に 1/2 にダウンサンプリングしたものです。追加のメモリは

$$
\frac14 + \frac1{16} + \frac1{64} + \dots = \frac13,
$$

つまりミップマップ付きテクスチャは元の $4/3$ のメモリで済みます。レベルを選ぶには、1 ピクセル進むと何テクセル分進むかを見積もります。GPU は $2\times2$ の**クアッド**（quad）単位でピクセルをシェーディングするので、隣り合うピクセル間で $(u,v)$ の差分を取れます（GLSL では `dFdx`、`dFdy`）。$u, v$ をテクセル単位にスケールすると、

$$
\rho = \max\!\left(\sqrt{\left(\tfrac{\partial u}{\partial x}\right)^2 + \left(\tfrac{\partial v}{\partial x}\right)^2},\ \sqrt{\left(\tfrac{\partial u}{\partial y}\right)^2 + \left(\tfrac{\partial v}{\partial y}\right)^2}\right),
\qquad \lambda = \log_2 \rho .
$$

レベル $\lambda$ では 1 テクセルがおよそ 1 ピクセル幅になるので、1 回のバイリニア参照がフットプリント上の平均の近似になります。$\lambda < 0$ は拡大を意味します（レベル 0 を使います）。

### 5.3 トライリニアフィルタリング

最も近い整数レベルを選ぶだけでは、$\lambda$ が整数をまたぐ場所に目に見える境目が出ます。**トライリニア**（trilinear）フィルタリングはレベル $\lfloor\lambda\rfloor$ と $\lfloor\lambda\rfloor + 1$ でそれぞれバイリニア参照を行い、重み $\lambda - \lfloor\lambda\rfloor$ で線形にブレンドします。1 サンプルあたり 8 テクセルです。以下のコードはミップピラミッドを構築し、細かいチェッカーボードをミップマップなしとありでサンプリングした結果を比較します。ミップマップなしでは一見ランダムな 0/1 のパターン（標準偏差 0.48）になります。これがエイリアシングです。トライリニアフィルタリングは正しい平均の灰色 0.5 を返します。

```python
import numpy as np

def build_mips(tex):
    """tex: (S,S,C), S a power of two -> [level 0, level 1, ...], each level half the size."""
    levels = [tex]
    while levels[-1].shape[0] > 1:
        t = levels[-1]                                       # 2x2 box filter
        levels.append(0.25 * (t[0::2, 0::2] + t[1::2, 0::2] + t[0::2, 1::2] + t[1::2, 1::2]))
    return levels

def bilinear(tex, u, v):
    """Repeat wrapping; u, v arrays in UV units; texel centers sit at (i + 0.5) / size."""
    h, w = tex.shape[:2]
    x = u * w - 0.5
    y = v * h - 0.5
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx = (x - x0)[..., None]
    fy = (y - y0)[..., None]
    x0, y0 = x0 % w, y0 % h
    x1, y1 = (x0 + 1) % w, (y0 + 1) % h
    top = tex[y0, x0] * (1 - fx) + tex[y0, x1] * fx
    bot = tex[y1, x0] * (1 - fx) + tex[y1, x1] * fx
    return top * (1 - fy) + bot * fy

def mip_lod(size, dudx, dvdx, dudy, dvdy):
    """Derivatives in UV units per pixel (what dFdx/dFdy return in a shader)."""
    rho = np.maximum(np.hypot(dudx, dvdx), np.hypot(dudy, dvdy)) * size   # texels per pixel
    return np.log2(np.maximum(rho, 1e-8))

def trilinear(mips, u, v, lod):
    lod = np.clip(lod, 0, len(mips) - 1)
    l0 = np.floor(lod).astype(int)
    l1 = np.minimum(l0 + 1, len(mips) - 1)
    t = (lod - l0)[..., None]
    out = np.zeros(u.shape + mips[0].shape[2:])
    for L in range(len(mips)):                # simple, not fast: blend the two nearest levels
        s = bilinear(mips[L], u, v)
        out += np.where((l0 == L)[..., None], (1 - t) * s, 0.0)
        out += np.where((l1 == L)[..., None], t * s, 0.0)
    return out

# Checkerboard texture, 256 x 256, 8 x 8 texel squares
S = 256
i, j = np.mgrid[0:S, 0:S]
tex = (((i // 8) + (j // 8)) % 2).astype(float)[..., None]
mips = build_mips(tex)
print(len(mips), "levels; memory overhead", sum(m.size for m in mips[1:]) / tex.size)

# A row of 64 screen pixels that covers the texture 7.3 times: ~29 texels per pixel
u = (np.arange(64) + 0.5) / 64 * 7.3
v = np.full_like(u, 0.3)
du = np.full_like(u, 7.3 / 64)                # du/dx; the other derivatives are zero
zero = np.zeros_like(u)
lod = mip_lod(S, du, zero, zero, zero)
point = bilinear(tex, u, v)[:, 0]
filt = trilinear(mips, u, v, lod)[:, 0]
print("lod %.2f" % lod[0])                    # log2(29.2) = 4.87
print("no mipmap : mean %.3f std %.3f" % (point.mean(), point.std()))   # random-looking 0/1 pattern
print("trilinear: mean %.3f std %.3f" % (filt.mean(), filt.std()))     # ~0.5 grey, as it should be
```

### 5.4 異方性フィルタリング

ミップマップは、テクスチャ空間でのピクセルのフットプリントが正方形だと仮定しています。グレージング角で見た床では、それは細長い楕円になります。つまり一方のスクリーン軸に沿った $\rho$ が他方よりずっと大きくなります。等方的なミップマップは大きい方を使うしかないので、もう一方の方向でテクスチャがぼやけます。**異方性フィルタリング**（anisotropic filtering）は、より細かいレベルでフットプリントの長軸に沿って複数回プローブします。よく使われる定式化（OpenGL の異方性フィルタリング拡張のもの）は

$$
N = \min\!\left(\left\lceil \frac{\rho_{\max}}{\rho_{\min}} \right\rceil,\ N_{\max}\right), \qquad \lambda = \log_2\frac{\rho_{\max}}{N},
$$

で、長軸に沿った $N$ 個のトライリニアサンプルを平均します。$N_{\max}$ はゲームの設定メニューにある「16x」です。総和面積テーブル（summed-area table、Crow 1984）や EWA フィルタリング（Greene と Heckbert 1986）は、より高品質な代替手段です。楕円加重平均（elliptical weighted average）の考え方は、3D ガウシアンをスプラットする際に再び登場します。

OpenGL ではこれらの選択はサンプラの状態として設定します。

```c
glBindTexture(GL_TEXTURE_2D, tex);
glGenerateMipmap(GL_TEXTURE_2D);                                   // build the pyramid
glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR); // trilinear
glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);               // bilinear
glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
glTexParameterf(GL_TEXTURE_2D, GL_TEXTURE_MAX_ANISOTROPY, 16.0f);  // core in GL 4.6 (EXT before)
```

## 6. 法線マッピングと接空間

### 6.1 バンプマッピングから法線マップへ

ジオメトリは高価です。細かなディテール（傷、毛穴、レンガの目地）は主に**シェーディング**の変化を通じて効いてきますが、シェーディングは法線で決まります。Blinn（1978）は**バンプマッピング**（bump mapping）を提案しました。粗い表面はそのままに、高さ場 $h(u,v)$ で変位したかのように法線を摂動させるのです。正規直交な接線 $\mathbf{T}$、従接線 $\mathbf{B}$、法線 $\mathbf{N}$ を持つ局所的に平らな表面では、変位した表面 $\mathbf{p} + h\,\mathbf{N}$ の法線は 1 次近似で

$$
\mathbf{n}' \propto \mathbf{N} - \frac{\partial h}{\partial u}\,\mathbf{T} - \frac{\partial h}{\partial v}\,\mathbf{B}
$$

となります。**法線マップ**（normal map）は、この $\mathbf{n}'$ を各テクセルについて事前計算し RGB テクスチャに格納したものにすぎず、通常はハイポリのスカルプトからローポリのメッシュへベイク（bake）して作ります。$[-1,1]$ の成分は色 $c = (\mathbf{n}+1)/2$ として符号化されます。平らな部分は $(0.5, 0.5, 1)$ になるので、接空間法線マップは水色に見えるのです。

### 6.2 接空間

格納される法線は**接空間**（tangent space）、つまり局所座標系 $(\mathbf{T}, \mathbf{B}, \mathbf{N})$ で表されます。ここで $\mathbf{T}$ は表面上で $u$ が増える方向、$\mathbf{B}$ は $v$ が増える方向を向きます。これによりマップはメッシュの姿勢や変形に依存しなくなり、タイリングや複数メッシュでの再利用も可能になります。シェーダでは、行列 $\text{TBN} = [\mathbf{T}\ \mathbf{B}\ \mathbf{N}]$（列として並べる）が接空間のベクトルをワールド空間へ変換します。

$$
\mathbf{n}_\text{world} = \operatorname{normalize}\big(\text{TBN}\,(2\mathbf{c} - 1)\big).
$$

**$\mathbf{T}$ と $\mathbf{B}$ の導出。** 頂点位置 $\mathbf{p}_0,\mathbf{p}_1,\mathbf{p}_2$、UV $(u_i, v_i)$ を持つ三角形について、$\mathbf{E}_1 = \mathbf{p}_1 - \mathbf{p}_0$、$\mathbf{E}_2 = \mathbf{p}_2 - \mathbf{p}_0$、$\Delta u_1 = u_1 - u_0$ などとします。平らな三角形の上では $\mathbf{T} = \partial\mathbf{p}/\partial u$ と $\mathbf{B} = \partial\mathbf{p}/\partial v$ は定数なので、

$$
\begin{bmatrix} \mathbf{E}_1 & \mathbf{E}_2 \end{bmatrix}
= \begin{bmatrix} \mathbf{T} & \mathbf{B} \end{bmatrix}
\begin{bmatrix} \Delta u_1 & \Delta u_2 \\ \Delta v_1 & \Delta v_2 \end{bmatrix}
\quad\Rightarrow\quad
\begin{bmatrix} \mathbf{T} & \mathbf{B} \end{bmatrix}
= \frac{1}{\Delta u_1 \Delta v_2 - \Delta u_2 \Delta v_1}
\begin{bmatrix} \mathbf{E}_1 & \mathbf{E}_2 \end{bmatrix}
\begin{bmatrix} \Delta v_2 & -\Delta u_2 \\ -\Delta v_1 & \Delta u_1 \end{bmatrix}.
$$

三角形ごとの結果を（法線と同様に）頂点に累積し、Gram-Schmidt で $\mathbf{T}$ を $\mathbf{N}$ に直交させます：$\mathbf{T} \leftarrow \operatorname{normalize}(\mathbf{T} - (\mathbf{N}\cdot\mathbf{T})\mathbf{N})$。そして**利き手**（handedness）の符号 $w = \operatorname{sign}((\mathbf{N}\times\mathbf{T})\cdot\mathbf{B})$ だけを保存し、シェーダ内で $\mathbf{B} = w\,(\mathbf{N}\times\mathbf{T})$ を再構成します。UV がミラーされている場所では $w = -1$ になります（アーティストはテクスチャ領域を節約するために UV をミラーします）。第 3 節の `vertex_tangents` はまさにこれを実装し、両方のケースを確認しています。

実践上の落とし穴：

- **ベイカーとレンダラは同じ接線基底を使わなければなりません**。そうしないとライティングに継ぎ目が出ます。事実上の標準は MikkTSpace（Mikkelsen 2008）で、Blender、Unity、Unreal、glTF が採用しています。
- **緑チャンネルの規約**：OpenGL 形式のマップは $+Y$ が上、DirectX 形式は $-Y$ です。凹凸が反転して見えたら緑チャンネルを反転してください。
- **座標系の変換**：$\mathbf{T}$ と $\mathbf{B}$ は表面上の*方向*なのでモデル行列で変換し、$\mathbf{N}$ は逆転置行列で変換します（第 01 回）。非一様スケールの下では両者が異なるため、下の頂点シェーダでは再直交化しています。

## 7. シャドウマッピング

ここまではすべて**局所的**でした。点の色はその点自身と光源だけで決まります。影は、*他の*ジオメトリが光を遮るかどうかで決まります。Williams（1978）は、「$\mathbf{p}$ は光源から見えるか？」は可視性の問題であり、z-buffer がすでにそれに答えている、ただし別のカメラから見ているだけだ、と気づきました。

### 7.1 2 パスのアルゴリズム

1. **シャドウパス**（shadow pass）：光源からシーンを描画します（平行光源なら正射影、スポットライトなら透視投影）。深度バッファだけを使います。結果の $D(s,t)$ が**シャドウマップ**（shadow map）で、各光線に沿った最も近い表面の深度です。
2. **メインパス**（main pass）：シェーディングする各点を同じ光源行列で変換し、同次座標 $w$ で割り、NDC を $[0,1]$ に写します。光源空間での深度 $z$ が格納された深度との比較テストに通れば、その点は照らされています。

$$
\mathbf{q} = P_L V_L\,\mathbf{p}_{\text{world}}, \qquad
(s, t, z) = \tfrac12\,\frac{(q_x, q_y, q_z)}{q_w} + \tfrac12, \qquad
z - b \le D(s, t),
$$

ここで $b$ は小さな**バイアス**（bias）です。点光源にはキューブマップ（6 枚のシャドウマップ）を使います。

### 7.2 シャドウアクネとバイアス

バイアスがないと、照らされた表面が偽の影の縞模様、**シャドウアクネ**（shadow acne）で覆われます。シャドウマップはテクセルの*中心*でしか深度を保存しません。1 テクセルは受け手の表面上で幅 $w$ のフットプリントを覆います。受け手が光に対して角度 $\theta$ だけ傾いていると（$\cos\theta = \mathbf{n}\cdot\mathbf{l}$）、そのフットプリント内で深度が $w\tan\theta$ だけ変化するので、テクセル中心より奥にあるおよそ半分の点が、自分自身の表面との比較に失敗します。深度の量子化もさらに誤差を加えます。そこで標準的なバイアスは

$$
b = b_0 + b_s \tan\theta, \qquad \tan\theta = \frac{\sqrt{1 - (\mathbf{n}\cdot\mathbf{l})^2}}{\mathbf{n}\cdot\mathbf{l}},
$$

となります。定数部分と**傾斜スケール**（slope-scaled）部分の和です（GPU はシャドウパスでの `glPolygonOffset(factor, units)` によって直接サポートしています）。バイアスが大きすぎると逆のアーティファクト、**ピーターパンニング**（Peter Panning）が起きます。接触領域が照らされていると判定されるため、影が投影元から離れてしまうのです。他の対策としては、**法線オフセット**（normal offset、参照点を $\mathbf{n}$ 方向にテクセルの数分の一だけずらす）、裏面をシャドウマップに描画する、光源の視錐台を絞って深度精度を上げる、などがあります。

### 7.3 Percentage-Closer Filtering（PCF）

シャドウマップのテクセルはスクリーンのピクセルより大きいことが多く、影の輪郭がギザギザになります。深度マップを単純にバイリニアフィルタリングすることはできません。投影元と受け手の深度を平均しても何の意味もない深度になるだけで、比較結果は二値のままです。Reeves、Salesin、Cook（1987）は順序を入れ替えるべきだと気づきました。**先に比較し、その二値の結果をフィルタリングする**のです。

$$
V(\mathbf{p}) = \frac{1}{\lvert K\rvert} \sum_{\boldsymbol{\delta} \in K} \big[\, z - b \le D\big((s,t) + \boldsymbol{\delta}\big) \big],
$$

ここで $K$ はオフセットのカーネル（例えば $3\times3$ テクセル）、$[\cdot]$ は真なら 1、偽なら 0 です。$V \in [0,1]$ は近傍のうち照らされている割合で、アンチエイリアスされた柔らかく見える輪郭が得られます。ハードウェアもこれをサポートしています。`GL_TEXTURE_COMPARE_MODE = GL_COMPARE_REF_TO_TEXTURE` と `sampler2DShadow` を使うと、1 回の `texture()` 呼び出しで 4 回の比較を行い、そのバイリニア加重平均を返します。

以下のトイ例は、傾いた地面（傾き 0.4）の上にある球のシャドウマップを描画し、アーティファクトを正確に測定します。ニアレスト参照でバイアスなしの場合、照らされているはずの地面の**ちょうど 50%** が偽の影になります。理由は上で述べたとおりです。0.002 の定数バイアスは最悪の場合の誤差 $\tfrac{w}{2}\tan\theta = 0.0156 \cdot 0.4 = 0.00625$ より小さく、部分的にしか効きません。傾斜スケールのバイアス $w\tan\theta$ はアクネを完全に取り除きます。0.5 という巨大な定数バイアスはアクネを取り除きますが、接触領域付近で真の影の 10.9% を「失い」ます（ピーターパンニング。他の行の 2〜4% は主に影の縁のエイリアシングで、これは PCF が対処する問題です）。最後に、$3\times3$ の PCF カーネルは 1 テクセル遠くまで届くので、同じバイアスではアクネが再び現れます。**バイアスはカーネル半径に応じて大きくする必要があります**。

```python
import numpy as np

# Scene: a tilted ground y = 0.4 x and a sphere above it, lit by a directional
# light pointing straight down (-y). Light space: (x, z) -> shadow-map texel,
# depth = distance below the light plane y = 2.
R, SLOPE, Y0 = 64, 0.4, 2.0
C, RAD = np.array([0.0, 0.45, 0.0]), 0.3

def surface_height(x, z):
    """Height of the first surface the light sees above (x, z)."""
    y = SLOPE * x
    d2 = (x - C[0])**2 + (z - C[2])**2
    cap = C[1] + np.sqrt(np.clip(RAD**2 - d2, 0, None))
    return np.where(d2 < RAD**2, np.maximum(y, cap), y)

# Pass 1: render the shadow map (depth from the light at each texel center)
texel = 2.0 / R
centers = -1 + (np.arange(R) + 0.5) * texel
X, Z = np.meshgrid(centers, centers, indexing="xy")
shadow_map = (Y0 - surface_height(X, Z)).astype(np.float32)

def visibility(px, pz, depth, bias, pcf=0):
    """Fraction of (2*pcf+1)^2 shadow-map tests that the receiver passes."""
    ix = np.floor((px + 1) / texel).astype(int)
    iz = np.floor((pz + 1) / texel).astype(int)
    lit = np.zeros_like(depth)
    for dz in range(-pcf, pcf + 1):
        for dx in range(-pcf, pcf + 1):
            m = shadow_map[np.clip(iz + dz, 0, R - 1), np.clip(ix + dx, 0, R - 1)]
            lit += depth <= m + bias          # compare first, then average (PCF)
    return lit / (2 * pcf + 1)**2

# Pass 2: shade ground points on a finer grid than the shadow map
g = -1 + (np.arange(512) + 0.5) * (2.0 / 512)
PX, PZ = np.meshgrid(g, g, indexing="xy")
depth = Y0 - SLOPE * PX
r = np.hypot(PX - C[0], PZ - C[2])
far_lit = r > RAD + 3 * texel          # clearly outside the shadow (ignore the aliased rim)
in_shadow = r < RAD

cos_t = 1.0 / np.sqrt(1 + SLOPE**2)            # n . l for the tilted ground
tan_t = np.sqrt(1 - cos_t**2) / cos_t          # = SLOPE
for name, bias in [("no bias", 0.0), ("const 0.002", 0.002),
                   ("slope-scaled", 1.0 * texel * tan_t), ("const 0.5", 0.5)]:
    vis = visibility(PX, PZ, depth, bias)
    acne = np.mean(vis[far_lit] < 1)       # lit points wrongly in shadow
    lost = np.mean(vis[in_shadow] == 1)    # shadowed points wrongly lit
    print(f"{name:13s} bias={bias:.4f}  acne {acne:6.1%}  lost shadow {lost:6.1%}")

# PCF: a 3x3 kernel reaches one texel further, so the slope bias must grow with it
for bias in [1.0 * texel * tan_t, 2.0 * texel * tan_t]:
    vis = visibility(PX, PZ, depth, bias, pcf=1)
    print("PCF 3x3 bias=%.4f  acne %5.1f%%  penumbra pixels %5.2f%%" % (
        bias, 100 * np.mean(vis[far_lit] < 1), 100 * np.mean((vis > 0) & (vis < 1))))
img = (255 * (0.15 + 0.85 * vis)).astype(np.uint8)
with open("shadow_pcf.pgm", "wb") as f:
    f.write(b"P5 512 512 255\n" + img.tobytes())
```

出力：

```text
no bias       bias=0.0000  acne  50.0%  lost shadow   2.0%
const 0.002   bias=0.0020  acne  37.5%  lost shadow   2.4%
slope-scaled  bias=0.0125  acne   0.0%  lost shadow   3.9%
const 0.5     bias=0.5000  acne   0.0%  lost shadow  10.9%
PCF 3x3 bias=0.0125  acne  49.1%  penumbra pixels 48.41%
PCF 3x3 bias=0.0250  acne   0.0%  penumbra pixels  3.91%
```

基本的なシャドウマップの先には、カスケードシャドウマップ（cascaded shadow maps、大きな屋外シーンの深度範囲ごとに複数のマップを使う）、分散シャドウマップ（variance shadow maps、Donnelly と Lauritzen 2006。深度のモーメントを保存するので、マップをフィルタリング*できる*）、そして遮蔽物までの距離を推定して PCF カーネルの大きさを変え、接触部分で硬くなるソフトシャドウを生成する PCSS（Fernando 2005）などがあります。物理的には、ソフトシャドウは面光源から生じ、パストレーシングはそれを自然に扱えます（[第 05 回]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})）。

## 8. GLSL でまとめる

頂点シェーダは位置を変換し、TBN 座標系を構築し、光源のクリップ空間での位置を計算します。フラグメントシェーダはアルベドと法線マップをサンプリングし、Blinn-Phong を評価して、直接光に PCF の可視性を掛けます。シャドウパス自体は深度だけを書き出すごく簡単なシェーダで、`gl_Position = uLightViewProj * uModel * vec4(aPos, 1.0)` を出力します。

```glsl
#version 330 core
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aTangent;   // xyz = tangent, w = handedness (+1 / -1)
layout(location = 3) in vec2 aUV;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform mat3 uNormalMatrix;   // transpose(inverse(mat3(uModel))), see post 01
uniform mat4 uLightViewProj;  // light's view-projection, used for shadow mapping

out vec3 vWorldPos;
out vec2 vUV;
out mat3 vTBN;
out vec4 vLightClip;

void main() {
    vec4 world = uModel * vec4(aPos, 1.0);
    vec3 N = normalize(uNormalMatrix * aNormal);
    vec3 T = normalize(mat3(uModel) * aTangent.xyz);
    T = normalize(T - dot(T, N) * N);              // Gram-Schmidt: keep T perpendicular to N
    vec3 B = cross(N, T) * aTangent.w;
    vWorldPos = world.xyz;
    vUV = aUV;
    vTBN = mat3(T, B, N);                          // columns: tangent-space -> world
    vLightClip = uLightViewProj * world;
    gl_Position = uProj * uView * world;
}
```

```glsl
#version 330 core
in vec3 vWorldPos;
in vec2 vUV;
in mat3 vTBN;
in vec4 vLightClip;

uniform sampler2D uAlbedo;     // sRGB texture, decoded to linear by the sampler
uniform sampler2D uNormalMap;  // tangent-space normal, OpenGL (Y+) convention
uniform sampler2D uShadowMap;  // depth from the light, in [0,1]
uniform vec3 uLightDir;        // unit vector from the surface toward the light
uniform vec3 uLightColor;
uniform vec3 uCamPos;
uniform float uShininess;      // Blinn-Phong exponent
uniform float uSpecular;       // k_s

out vec4 fragColor;

float shadowPCF(vec4 lightClip, float ndotl) {
    vec3 p = lightClip.xyz / lightClip.w * 0.5 + 0.5;   // NDC -> [0,1] texture/depth space
    if (p.z > 1.0) return 1.0;                          // beyond the light's far plane
    vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
    float tanTheta = sqrt(max(1.0 - ndotl * ndotl, 0.0)) / max(ndotl, 1e-3);
    float bias = clamp(0.0005 + 0.001 * tanTheta, 0.0, 0.01);  // constant + slope-scaled
    float lit = 0.0;
    for (int y = -1; y <= 1; ++y)
        for (int x = -1; x <= 1; ++x) {
            float d = texture(uShadowMap, p.xy + vec2(x, y) * texel).r;
            lit += (p.z - bias <= d) ? 1.0 : 0.0;          // compare, then average
        }
    return lit / 9.0;
}

void main() {
    vec3 albedo = texture(uAlbedo, vUV).rgb;
    vec3 nTangent = texture(uNormalMap, vUV).xyz * 2.0 - 1.0;  // [0,1] -> [-1,1]
    vec3 N = normalize(vTBN * nTangent);
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 H = normalize(L + V);

    float ndotl = max(dot(N, L), 0.0);
    float spec = ndotl > 0.0 ? pow(max(dot(N, H), 0.0), uShininess) : 0.0;
    float vis = shadowPCF(vLightClip, ndotl);

    vec3 ambient = 0.03 * albedo;
    vec3 color = ambient + vis * uLightColor * (albedo * ndotl + uSpecular * spec);
    fragColor = vec4(color, 1.0);   // linear; let an sRGB framebuffer encode it
}
```

注目すべき細部が 3 つあります。ライティングは**リニア**な色空間で行うこと（アルベドはサンプラが sRGB からデコードし、フレームバッファが再エンコードする）、$\mathbf{n}\cdot\mathbf{l} \le 0$ のときは光源に背を向けた面にハイライトが出ないよう鏡面項を 0 にすること、そして $\tan\theta \to \infty$ となるグレージング角で発散しないようバイアスをクランプすることです。

## 試してみよう

[ホームページのラボ]({{ '/' | relative_url }}#lab)にあるパストレーサーには**アルベド**と**法線**の表示モードがあります。これらの画像は **G-buffer** です。ディファードレンダラが最初のパスで保存するピクセルごとの入力（テクスチャの色とシェーディング法線）そのものであり、その後この記事のモデルでライティングされます。またデノイザはそれらをエッジ保存のガイドとして使います。**最終**表示と比べてみてください。「アルベド × $\mathbf{n}\cdot\mathbf{l}$」で説明できないもの（ソフトシャドウ、色のにじみ、光沢反射）こそが、このシリーズの残りの記事のテーマです。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Gouraud, *Continuous Shading of Curved Surfaces* | IEEE Trans. Computers | 1971 | [DOI](https://doi.org/10.1109/T-C.1971.223313) | 頂点色の補間による滑らかなシェーディング |
| Catmull, *A Subdivision Algorithm for Computer Display of Curved Surfaces*（博士論文、ユタ大学） | 学位論文 | 1974 | | テクスチャマッピングと z-buffer を導入 |
| Phong, *Illumination for Computer Generated Pictures* | Communications of the ACM | 1975 | [DOI](https://doi.org/10.1145/360825.360839) | 環境光 + 拡散 + 鏡面のモデル；ピクセルごとの法線補間 |
| Blinn, *Models of Light Reflection for Computer Synthesized Pictures* | SIGGRAPH | 1977 | [PDF（Microsoft Research）](https://www.microsoft.com/en-us/research/wp-content/uploads/1977/01/p192-blinn.pdf) | ハーフベクトルによる鏡面反射；Torrance-Sparrow のマイクロファセットモデルを CG に導入 |
| Blinn, *Simulation of Wrinkled Surfaces* | SIGGRAPH | 1978 | [SIGGRAPH history](https://history.siggraph.org/?p=103267) | バンプマッピング：ジオメトリではなく法線を摂動 |
| Williams, *Casting Curved Shadows on Curved Surfaces* | SIGGRAPH | 1978 | [SIGGRAPH history](https://history.siggraph.org/?p=120268) | シャドウマッピングのアルゴリズム |
| Williams, *Pyramidal Parametrics* | SIGGRAPH | 1983 | | ミップマップとトライリニアフィルタリング |
| Reeves, Salesin, Cook, *Rendering Antialiased Shadows with Depth Maps* | SIGGRAPH | 1987 | [Pixar Graphics](https://graphics.pixar.com/library/ShadowMaps) | Percentage-Closer Filtering |
| Donnelly, Lauritzen, *Variance Shadow Maps* | I3D | 2006 | | 深度モーメントによるフィルタリング可能なシャドウマップ |
| Mikkelsen, *Simulation of Wrinkled Surfaces Revisited*（修士論文、コペンハーゲン大学） | 学位論文 | 2008 | | MikkTSpace 接線規格の基礎 |

## 学習リソース

- **GAMES101**（Lingqi Yan）、第 7〜9 回：シェーディング、テクスチャマッピングとフィルタリング：[講義ページ](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html)。**GAMES202** ではリアルタイムシャドウ（PCF、PCSS、VSM）を詳しく扱います。
- **LearnOpenGL**、*Lighting*、*Advanced Lighting → Normal Mapping*、*Shadow Mapping* の各章：[learnopengl.com](https://learnopengl.com/)。この記事の最も実践的な副読本です。
- **Berkeley CS184** と **Stanford CS148** は、プログラミング課題つきでテクスチャフィルタリングとシェーディングを扱います。
- **Scratchapixel**：[scratchapixel.com](https://www.scratchapixel.com/)。第一原理から書かれたシェーディングとテクスチャリングのレッスンがあります。
- **Real-Time Rendering** 第 4 版（Akenine-Möller ほか）、第 5 章（シェーディングの基礎）、第 6 章（テクスチャリング）、第 7 章（影）：[realtimerendering.com](https://www.realtimerendering.com/)。

## 演習

1. $\mathbf{v}$ が $\mathbf{n}$ と $\mathbf{l}$ の張る平面内にあるとき、$\mathbf{n}$ と $\mathbf{h}$ のなす角が $\mathbf{r}$ と $\mathbf{v}$ のなす角の半分であることを示してください。次に $s=16$ の Phong と $s'=16, 64$ の Blinn-Phong を描画し、$\mathbf{l} = (1, 0, 0.1)$ のようなグレージングな光の方向でハイライトを比較してください。
2. 球のレンダラに Gouraud シェーディングを追加してください。粗い UV 球メッシュの頂点で照明モデルを評価し、重心座標で色を補間します。ハイライトはどこでおかしくなるでしょうか？
3. 第 5 節のテクスチャフィルタリングのコードを使い、$\partial u/\partial x = 8/64$、$\partial v/\partial y = 1/64$ のフットプリントに対する異方性フィルタリングを実装して、$v$ 方向のシャープさを通常のトライリニアフィルタリングと比べてください。
4. バンプマッピングの式を使って高さ場 $h(u,v) = 0.05\sin(20u)$ から法線マップを生成し、`vertex_tangents` で得た TBN を使って平らな四角形をシェーディングしてください。
5. シャドウのトイ例の $3\times3$ ボックス PCF をポアソンディスク（Poisson disk）カーネルに置き換え、レシーバー平面深度バイアス（receiver-plane depth bias、スクリーン空間微分からカーネル内での深度の変化を推定する）を実装して、カーネルに合わせてバイアスを大きくする必要がないようにしてください。

**次回：**[物理ベースレンダリング]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})。放射測定によってこれらの経験則がレンダリング方程式になり、$\mathbf{n}\cdot\mathbf{h}$ は GGX マイクロファセット分布になります。
