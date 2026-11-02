---
layout: post
title: "アニメーションとキャラクター：スプライン、回転、スキニング、IK、モーションマッチング、学習ベースのモーション"
date: 2026-10-27 09:09:00+0900
description: "キーフレームのスプラインと弧長、slerp と squad、骨格と順運動学、線形ブレンドスキニングとデュアルクォータニオン・スキニング、ブレンドシェイプ、CCD と FABRIK、モーションキャプチャと SMPL、モーションマッチング、強化学習で訓練する物理ベースのキャラクター、生成的モーションを NumPy のコードとともに解説します。"
categories: graphics
tags: [animation, splines, quaternions, skinning, inverse-kinematics, motion-matching, character-control]
series: graphics
series_order: 9
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[ジオメトリ処理]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})でメッシュが手に入りました。この記事ではそれを動かします。キャラクターアニメーションは、ゲーム、映画、VR アバター、テレプレゼンスを支えています。同じ数学が、今ではヒューマノイドロボットも動かしています。関節の階層と順運動学は、[エンボディード AI のロボット運動学]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})そのものです。[強化学習]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})で訓練した物理ベースのキャラクターは、2025〜2026 年に実機のヒューマノイドで動くモーショントラッカーになりました。そして [XR のアバター]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})は、スキニングされ、リターゲットされたキャラクターです。

キーフレームから学習ベースのモーションまでを順にたどります。スプラインは値を時間方向に補間し、クォータニオンは回転を補間します。骨格とスキンがメッシュを変形し、逆運動学が手足を配置します。キャプチャとリターゲティングが実際の動きを取り込み、データ駆動・物理ベース・生成的な手法が新しい動きを作ります。

## 前提知識

- 行列、同次変換、slerp を含むクォータニオン（[第 1 回]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})）。
- 時間積分と、PD に似た拘束力（[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})）。
- 最後の数節では、強化学習の基礎（[エンボディード AI 第 2 回]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})）と拡散モデル（[世界モデル第 2 回]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})）。

## 1. キーフレームとスプライン

アニメーターは**キーフレーム（keyframes）**、つまり時刻 $t_i$ での値 $p_i$（位置、角度、ブレンドシェイプの重み）を設定します。その間のフレームはコンピュータが埋めます。これを**中割り（in-betweening）**と呼びます。線形補間は連続ですが折れ目があります。速度がキーごとに跳び、動きがロボットのように見えます。3 次スプラインがこれを解決します。

### エルミート曲線

3 次の**エルミート（Hermite）**区間は、両端の値 $p_0, p_1$ と両端の接線（速度）$m_0, m_1$ で決まります。局所パラメータ $t \in [0,1]$ について

$$
p(t) = h_{00}(t)\,p_0 + h_{10}(t)\,m_0 + h_{01}(t)\,p_1 + h_{11}(t)\,m_1
$$

で、**エルミート基底**は

$$
h_{00} = 2t^3 - 3t^2 + 1,\quad h_{10} = t^3 - 2t^2 + t,\quad h_{01} = -2t^3 + 3t^2,\quad h_{11} = t^3 - t^2
$$

です。これは自分で導出できます。$p(t) = a t^3 + b t^2 + c t + d$ と書き、$p(0)=p_0$、$p(1)=p_1$、$p'(0)=m_0$、$p'(1)=m_1$ を課します。$a, b, c, d$ についての 4 本の連立一次方程式になるので、解いたあと $p_0, p_1, m_0, m_1$ ごとに項をまとめると、それぞれの係数が上の 4 つの基底関数になります。**数値例**（1 次元）：$p_0 = 0$、$p_1 = 1$ とします。平らな接線 $m_0 = m_1 = 0$ なら $p(0.5) = h_{01}(0.5) = -0.25 + 0.75 = 0.5$ で、イーズイン・イーズアウトの曲線です。$m_0 = 2$ なら $h_{10}(0.5)\cdot 2 = 0.125 \cdot 2 = 0.25$ が加わって $p(0.5) = 0.75$ になります。曲線はより速く出発し、直線を上回ります。

### スプラインの仲間たち

仲間同士の違いは接線の選び方、言い換えればどの基底を使うかです。

- **ベジェ（Bézier）**：制御点 $c_0..c_3$ で $p(t) = \sum_k \binom{3}{k}(1-t)^{3-k}t^k c_k$。曲線は $c_0$ と $c_3$ を通り、接線は $m_0 = 3(c_1 - c_0)$、$m_1 = 3(c_3 - c_2)$ です。アニメーターはハンドル $c_1, c_2$ を直接ドラッグします。どの DCC ツールにもあるカーブエディタです。
- **Catmull–Rom**（Catmull と Rom 1974）：すべてのキーを通るエルミートスプラインで、接線は自動的に $m_i = \frac{p_{i+1} - p_{i-1}}{2}$（キーが等間隔の場合）。補間型で $C^1$ です。
- **一様 3 次 B スプライン**：区間 $i$ は、連続する 4 つの制御点を基底 $b_0 = \frac{(1-t)^3}{6}$、$b_1 = \frac{3t^3 - 6t^2 + 4}{6}$、$b_2 = \frac{-3t^3 + 3t^2 + 3t + 1}{6}$、$b_3 = \frac{t^3}{6}$ で混ぜます。$C^2$ なので加速度も連続ですが、制御点は通りません。[細分割]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})が収束する先の曲線です。

```python
import numpy as np

def hermite(p0, p1, m0, m1, t):
    t = t[:, None]
    h00, h10 = 2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t
    h01, h11 = -2 * t**3 + 3 * t**2, t**3 - t**2
    return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1

def catmull_rom(P, n=40):
    Q = np.vstack([P[:1], P, P[-1:]])                       # duplicate the end points
    t = np.linspace(0, 1, n)
    return np.vstack([hermite(Q[i], Q[i + 1], (Q[i + 1] - Q[i - 1]) / 2, (Q[i + 2] - Q[i]) / 2, t)
                      for i in range(1, len(Q) - 2)])

keys = np.array([[0, 0], [1, 1.6], [2.2, 1.9], [3, 0.6], [4.2, 0.2], [5, 1.5], [6.2, 1.8]])
curve = catmull_rom(keys)
print(curve.shape, curve[0], curve[-1])                     # starts and ends on the keys
```

下の図は、同じ 7 つのキー（上のコードの `keys`）を 4 種類の曲線で結び、2 つの基底関数の族もあわせて示したものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-spline-family.svg" caption="左：同じ 7 点から作った 4 種類の補間。線形（破線）には折れ目があります。Catmull–Rom（紫）はすべてのキーを滑らかに通ります。2 本の 3 次ベジェ（オレンジ）は $P_0$、$P_3$、$P_6$ だけを通り、残りをハンドルとして使います。一様 3 次 B スプライン（緑）は最も滑らかですが、どの点も通りません。中と右：基底関数。B スプライン基底は非負で和が 1 なので、曲線は制御点の凸包の中にとどまります。エルミートの接線基底 $h_{10}$ と $h_{11}$ は両端で 0 です。" %}

### 連続性：$C^1$ と $G^1$

二つの区間がつながる点で、**$C^k$ 連続**とはパラメータについての 1 階から $k$ 階までの導関数が一致することです。**幾何学的連続性 $G^1$** は接線の*向き*が一致することしか求めません。曲線に見た目の角はありませんが、速さは跳ぶことがあります。物体が時間とともにたどる経路では、この違いが効いてきます。$G^1$ の接合は絵としては滑らかでも速度が跳ぶので、動きの中では目に見えるつっかかりになります。ベジェで言えば、1 本目の制御点を $c_0..c_3$、2 本目の最初の制御点（ハンドル）を $c_1'$ とし、接合点は $c_3$ です。$C^1$ には $c_1' - c_3 = c_3 - c_2$（ハンドルが一直線上にあり、*かつ*同じ長さ）が必要ですが、$G^1$ は一直線上にあるだけで十分です。下の図では $c_1'$ を 3 通りに置いて比べています。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-continuity.svg" caption="$(3,0)$ でつながる 2 本の 3 次ベジェ。2 本目の最初のハンドルを 3 通りに選んでいます。赤：一直線上にないので曲線に角ができます（$C^0$）。オレンジ：一直線上だが短い（$G^1$）。曲線は滑らかに見えますが、右の速さのグラフは $u=1$ で跳びます。紫：鏡映したハンドル（$C^1$）で、跳びはありません。物体をつっかかりなしに動かせるのは紫だけです。" %}

### 弧長による再パラメータ化

スプラインのパラメータ $t$ は距離ではありません。$t$ の等間隔は曲線上では不等間隔になるので、一様な $t$ で動くカメラやキャラクターはでたらめに加速・減速します。解決策は**弧長による再パラメータ化（arc-length reparameterization）**

$$
s(t) = \int_0^t \lVert p'(u)\rVert\, du
$$

を行い、一様な $s$ で動かすことです。閉じた式はめったにないので、実際には多くの $t$ で $s$ の表を作り、補間で逆引きします（または $s'(t) = \lVert p'(t)\rVert$ を使い、$s(t) - s^* = 0$ にニュートン法を適用します）。

```python
import numpy as np

def bezier(c, t):
    t = np.atleast_1d(t)[:, None]
    return (1 - t)**3 * c[0] + 3 * (1 - t)**2 * t * c[1] + 3 * (1 - t) * t**2 * c[2] + t**3 * c[3]

c = np.array([[0, 0], [0.1, 0.5], [2.2, 3.2], [4, 0]], float)       # short first handle: slow start
t_tab = np.linspace(0, 1, 2000)
pts = bezier(c, t_tab)
s_tab = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]   # s(t) table
L = s_tab[-1]

def point_at_distance(s):
    return bezier(c, np.interp(s, s_tab, t_tab))           # invert s(t) by interpolation

even = point_at_distance(np.linspace(0, L, 17))
gaps = np.linalg.norm(np.diff(even, axis=0), axis=1)
print(f"length {L:.3f}, gap spread {gaps.min():.3f}..{gaps.max():.3f}")   # length 5.304, gap spread 0.330..0.331
```

下の図は、同じ曲線上で一様な $t$ で点を取った場合と、一様な弧長で取った場合の間隔の違いを示しています。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-arc-length.svg" caption="左：一様な $t$ でとった 17 点（オレンジの丸）は、最初のハンドルが短く曲線の動きが遅い始点付近で密集し、動きが速い終点付近でまばらになります（間隔は 0.13 から 0.63）。一様な弧長でとった 17 点（紫の四角。両方が見えるよう少し下にずらしています）は等間隔です（どれも 0.33）。右：弧長の表 $s(t)/L$。細い線は、等間隔の各 $s$ がどの $t$ に戻されるかを示します。" %}

## 2. 時間とともに変わる回転

[第 1 回]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})では単位クォータニオン $q$ と **slerp**、つまり二つの姿勢の間を大円に沿って等速で補間する方法を紹介しました。

$$
\mathrm{slerp}(q_0, q_1; t) = q_0\,(q_0^{-1}q_1)^t = q_0 \exp\!\big(t \log(q_0^{-1} q_1)\big).
$$

ここで、$\hat{\mathbf{n}}$ 周りに $2\phi$ 回転する単位クォータニオン $q = (\cos\phi, \sin\phi\,\hat{\mathbf{n}})$ の**対数**は純クォータニオン $\log q = (0, \phi\,\hat{\mathbf{n}})$ で、$\exp$ はその逆です。$q$ と $-q$ は同じ回転なので、常に $q_0\cdot q_1 \ge 0$ となる符号の $q_1$ を選びます。符号を間違えると遠回りになります。

**nlerp**（正規化線形補間）$\frac{(1-t)q_0 + t q_1}{\lVert\cdot\rVert}$ は同じ大円をたどりますが、速さは一定ではなく、中間で速くなります。安価で可換で、3 つ以上の回転も簡単に混ぜられます。そのためスキニング（第 4 節）やアニメーションのブレンドでは nlerp を使い、等速が重要なときに slerp を使います。

### 指数写像と角速度

対数は回転をベクトルに変えます。$\mathbf{r} = 2\log q$ は**回転ベクトル**（軸 × 角度）で、$SO(3)$ の**指数写像（exponential map）**です。回転ベクトルは微積分をするのに適した場所です。動く姿勢 $q(t)$ の角速度 $\boldsymbol\omega$（物体座標系）は

$$
(0, \boldsymbol\omega) = 2\,q^{-1}\dot q
$$

です。slerp では $q^{-1}\dot q = \log(q_0^{-1}q_1)$ が定数なので角速度は一定で、その大きさはキー間の総回転角を時間で割ったものです。サンプルから角速度を測ることもできます：$\lVert\boldsymbol\omega\rVert \approx 2\lVert\log(q(t)^{-1}q(t+\Delta t))\rVert / \Delta t$。

### 区分的 slerp は $C^1$ ではない、squad は $C^1$

複数のキー $q_0, q_1, q_2, \dots$ を区間ごとに slerp するのは、線形補間の回転版です。各区間の中では角速度が一定なので、キーごとに向きも大きさも急に変わります。**squad**（spherical quadrangle interpolation、Shoemake 1985）は 3 次エルミートやベジェ曲線の回転版です。de Casteljau のアルゴリズムが線形補間を入れ子にするように、slerp を入れ子にします。

$$
\mathrm{squad}(q_i, q_{i+1}, s_i, s_{i+1}; h) = \mathrm{slerp}\big(\mathrm{slerp}(q_i, q_{i+1}; h),\ \mathrm{slerp}(s_i, s_{i+1}; h);\ 2h(1-h)\big)
$$

内側の制御クォータニオンは、各キーで接線が一致するように選びます。

$$
s_i = q_i \exp\!\Big(-\frac{\log(q_i^{-1}q_{i+1}) + \log(q_i^{-1}q_{i-1})}{4}\Big).
$$

$h = 0$ で微分すると、$q_i$ での接線は $\frac12\big(\log(q_i^{-1}q_{i+1}) - \log(q_i^{-1}q_{i-1})\big)$ となり、両側から同じです。これは Catmull–Rom の接線 $\frac{p_{i+1}-p_{i-1}}{2}$ のクォータニオン版で、キーが等間隔のときに成り立ちます。

```python
import numpy as np

def qmul(a, b):
    w1, x1, y1, z1 = a; w2, x2, y2, z2 = b
    return np.array([w1*w2 - x1*x2 - y1*y2 - z1*z2, w1*x2 + x1*w2 + y1*z2 - z1*y2,
                     w1*y2 - x1*z2 + y1*w2 + z1*x2, w1*z2 + x1*y2 - y1*x2 + z1*w2])
def qconj(q): return q * np.array([1, -1, -1, -1])
def qexp(v):
    a = np.linalg.norm(v)
    return np.array([1.0, 0, 0, 0]) if a < 1e-12 else np.r_[np.cos(a), np.sin(a) * v / a]
def qlog(q):
    s = np.linalg.norm(q[1:])
    return np.zeros(3) if s < 1e-12 else np.arctan2(s, q[0]) * q[1:] / s

def slerp(q0, q1, t):
    if q0 @ q1 < 0: q1 = -q1                                 # shortest arc
    return qmul(q0, qexp(t * qlog(qmul(qconj(q0), q1))))

def squad_controls(Q):                                       # keys must be sign-consistent
    S = [Q[0]]
    for i in range(1, len(Q) - 1):
        qi = qconj(Q[i])
        S.append(qmul(Q[i], qexp(-(qlog(qmul(qi, Q[i + 1])) + qlog(qmul(qi, Q[i - 1]))) / 4)))
    return S + [Q[-1]]

def squad(q0, q1, s0, s1, h):
    return slerp(slerp(q0, q1, h), slerp(s0, s1, h), 2 * h * (1 - h))

rv = [(0, 0, 0), (0.9, 0.2, 0), (0.7, 1.1, 0.3), (-0.2, 1.4, 0.6)]   # rotation vectors (rad)
Q = [qexp(0.5 * np.array(r, float)) for r in rv]                       # q = exp(r / 2)
S = squad_controls(Q)
print(squad(Q[1], Q[2], S[1], S[2], 0.0), Q[1])                       # squad hits the keys
```

下の図は、区分的 slerp と squad を単位球上で比べ、両者の角速さも描いています。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-squad.svg" caption="6 つのキー姿勢 $q_0..q_5$ を、それぞれが $z$ 軸を回す先（単位球上の黒点）で表しています。左：区分的 slerp（オレンジ）は大円弧をたどり、キーごとに角があります。squad（紫）は同じキーを滑らかに通ります。右：サンプルから測った角速さ。slerp の角速さは各区間で一定で、キー（点線）ごとに跳びます。ここでは大きさの跳びは小さく、より大きな断絶は回転軸の急な変化で、左図の角として見えます。squad の角速さは変動が大きいものの連続で、回転軸も滑らかに向きを変えます。" %}

実務では、アニメーションカーブはチャンネルごとに保存されることがよくあります。オイラー角は別々に補間され、単純ですがジンバルロックが起こりえます。クォータニオンのカーブは通常フレームごとに再サンプリングされ、エンジンは隣接フレーム間を nlerp します。

## 3. 骨格と順運動学

**骨格（skeleton）**（リグ）は関節の木構造です。各関節 $j$ は親 $p(j)$、親からの固定**オフセット** $\mathbf{o}_j$（親の座標系で表した骨）、アニメーションされる**局所回転** $\mathbf{R}_j$ を持ちます（ルートには並進、場合によってはスケールもあります）。局所変換は

$$
\mathbf{T}_j^{\text{local}} = \begin{pmatrix}\mathbf{R}_j & \mathbf{o}_j\\ \mathbf{0}^\top & 1\end{pmatrix}
$$

で、**順運動学（forward kinematics, FK）**はルートから下へ変換を合成します。

$$
\mathbf{G}_j = \mathbf{G}_{p(j)}\,\mathbf{T}_j^{\text{local}}, \qquad \mathbf{G}_{\text{root}} = \mathbf{T}_{\text{root}}^{\text{local}} .
$$

関節を親が子より先に来る順で保存しておけば、FK は 1 本のループです。**バインドポーズ（bind pose）**（レストポーズ。T ポーズや A ポーズが多い）はメッシュをモデリングしたときの姿勢です。その大域変換 $\mathbf{B}_j$ を保存しておき、その逆行列 $\mathbf{B}_j^{-1}$、すなわち**逆バインド行列（inverse bind matrices）**で、頂点をモデル空間から関節 $j$ の局所座標系へ写します。これは[エンボディード AI 第 1 回]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})のロボットアームの運動学的連鎖と同じ剛体変換の連鎖です。違いはキャラクターの木が枝分かれすることだけです。

```python
import numpy as np

def rot(axis, deg):
    a = np.deg2rad(deg); c, s = np.cos(a), np.sin(a)
    return {"x": np.array([[1, 0, 0], [0, c, -s], [0, s, c]]),
            "y": np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]),
            "z": np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])}[axis]

# name, parent, offset in the parent's frame (z up, metres); parents come first
skel = [("pelvis", -1, (0, 0, 1.0)), ("spine", 0, (0, 0, 0.22)), ("chest", 1, (0, 0, 0.25)),
        ("l_shoulder", 2, (0.18, 0, 0.18)), ("l_elbow", 3, (0.3, 0, 0)), ("l_wrist", 4, (0.27, 0, 0))]

def forward_kinematics(skel, local_rot):
    G = []
    for j, (_, parent, off) in enumerate(skel):
        T = np.eye(4); T[:3, :3] = local_rot[j]; T[:3, 3] = off
        G.append(T if parent < 0 else G[parent] @ T)
    return G

pose = [np.eye(3) for _ in skel]
pose[3] = rot("y", -90)                                     # raise the upper arm
pose[4] = rot("z", 90)                                      # bend the elbow
for (name, _, _), g in zip(skel, forward_kinematics(skel, pose)):
    print(f"{name:10s}", np.round(g[:3, 3], 3))
```

上腕を $y$ 周りに $-90^\circ$ 回して（上向き）、肘を $z$ 周りに $90^\circ$ 曲げると、手首は $(0.18, 0.27, 1.95)$ に来ます。肩は $(0.18, 0, 1.65)$、肘はその $0.3$ m 上で、前腕は $+y$ を向きます。手計算で確かめられます。$\mathbf{R}_y(-90^\circ)$ は $+x$ を $+z$ に回すので、肘は肩の真上 $0.3$ m にあります。$\mathbf{R}_y(-90^\circ)\mathbf{R}_z(90^\circ)$ は $+x$ を $+y$ に回すので、手首は肘から $+y$ 方向に $0.27$ m の位置です。下の図は、17 関節すべてをそなえた骨格を、バインドポーズとポーズを付けた状態で示したものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-fk-skeleton.svg" caption="`forward_kinematics` で評価した 17 関節の骨格。各関節に座標系の 3 軸（$x$ 赤、$y$ 緑、$z$ 青。$\mathbf{G}_j$ の列）を描いています。左：バインドポーズ。局所回転はすべて単位行列で、どの座標系もワールドと揃っています。右：11 個の局所回転で作ったポーズ。骨盤の回転は木の下にあるすべてを回し、膝の回転はすねと足だけを動かします。" %}

## 4. スキニング

メッシュ（「スキン」）は骨格に追従しなければなりません。各頂点 $\mathbf{v}$ は、**スキンウェイト（skin weights）** $w_{j} \ge 0$、$\sum_j w_j = 1$ でいくつかの関節に結び付けられます。ウェイトはアーティストが描くか、熱拡散や有界双調和重みなどからツールが計算します。

### 線形ブレンドスキニング

**線形ブレンドスキニング（linear blend skinning, LBS）**は、骨格部分空間変形とも呼ばれ（初期の形は Magnenat-Thalmann ら 1988）、頂点を各関節で剛体変換し、その結果を平均します。

$$
\mathbf{v}' = \sum_j w_j\, \mathbf{M}_j\,\mathbf{v}, \qquad \mathbf{M}_j = \mathbf{G}_j\,\mathbf{B}_j^{-1}.
$$

$\mathbf{M}_j$ は**スキニング行列**で、バインドポーズを元に戻してから現在のポーズを適用します。影響する関節 1 つにつき行列とベクトルの積 1 回なので安価で、頂点シェーダにもよく合います。ほとんどのリアルタイムキャラクターはこれを使っています。

```python
import numpy as np

def skin_lbs(V, W, Ms):
    """V: (n,3) rest vertices, W: (n,k) weights, Ms: k skinning matrices (4x4)."""
    Vh = np.c_[V, np.ones(len(V))]
    return sum(W[:, j:j + 1] * (Vh @ Ms[j].T)[:, :3] for j in range(len(Ms)))
```

### キャンディラッパー・アーティファクト

行列の平均は回転の平均ではありません。前腕をねじってみます。骨 0 は止まったまま、骨 1 が肢の軸 $x$ 周りに $\theta$ だけ回ります。半径 $r$、ウェイト $w_0, w_1$ の頂点は

$$
\mathbf{v}' = w_0 \begin{pmatrix}x\\ y\\ z\end{pmatrix} + w_1\begin{pmatrix}x\\ y\cos\theta - z\sin\theta\\ y\sin\theta + z\cos\theta\end{pmatrix}
$$

に移ります。断面内では複素数表記で $r\,(w_0 + w_1 e^{i\theta})$ なので、新しい半径は

$$
r' = r\sqrt{w_0^2 + w_1^2 + 2 w_0 w_1 \cos\theta}
$$

です。$w_0 = w_1 = \frac12$ のとき、$\theta = 90^\circ$ で $r' = 0.71\,r$、$\theta = 180^\circ$ で $r' = 0$ になります。キャンディの包み紙のねじった端のように、肢が 1 点に潰れます。曲げでも、肘や膝の内側で同じような体積の減少が起きます。原因は、回転行列の重み付き平均が回転ではなく、スケールを含んでしまうことです。

### デュアルクォータニオン・スキニング

Kavan ら（2008）は、代わりに**単位デュアルクォータニオン（dual quaternions）**をブレンドします。デュアルクォータニオン $\hat q = q_r + \varepsilon q_d$（$\varepsilon^2 = 0$）は、

$$
q_d = \tfrac12\,(0, \mathbf{t})\,q_r, \qquad \mathbf{t} = 2\,\big(q_d\, q_r^{*}\big)_{\text{vec}}
$$

のとき剛体運動（回転 $q_r$、並進 $\mathbf{t}$）を表します。**デュアルクォータニオン・スキニング（dual quaternion skinning, DQS）**は、すべての $q_r$ が同じ半球に入るよう符号を反転してからデュアルクォータニオンを線形にブレンドし、実部のノルムで正規化します。

$$
\hat b = \sum_j w_j \hat q_j, \qquad \hat q = \frac{\hat b}{\lVert b_r\rVert}, \qquad \mathbf{v}' = q_r\,\mathbf{v}\,q_r^{*} + \mathbf{t}.
$$

結果は常に剛体変換なので、ねじった肢でも半径が保たれます。LBS より少し高価で、曲げた関節の近くでわずかに膨らむことがあります。Maya や Blender などの一般的なツールは LBS と DQS の両方を用意しています（Blender では後者を「ボリュームを保持」と呼びます）。

```python
import numpy as np   # uses qmul / qconj from Section 2

def rotate(q, v): return qmul(qmul(q, np.r_[0, v]), qconj(q))[1:]

def skin_dqs(V, W, qs, ts):
    """qs: unit quaternions (w,x,y,z), ts: translations, one per joint (skinning transforms)."""
    dq = [(q, 0.5 * qmul(np.r_[0, t], q)) for q, t in zip(qs, ts)]
    out = np.zeros_like(V)
    for i, v in enumerate(V):
        br, bd = np.zeros(4), np.zeros(4)
        for j, (qr, qd) in enumerate(dq):
            s = 1.0 if qr @ dq[0][0] >= 0 else -1.0        # same hemisphere
            br += W[i, j] * s * qr; bd += W[i, j] * s * qd
        n = np.linalg.norm(br)
        qr, qd = br / n, bd / n
        out[i] = rotate(qr, v) + 2 * qmul(qd, qconj(qr))[1:]
    return out
```

下の図では、2 本の骨にスキニングした円柱の 2 本目の骨を $160^\circ$ ねじり、LBS と DQS を比べます。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-lbs-dqs.svg" caption="2 本の骨にスキニングした円柱（ウェイトは $0.6\le x\le 1.4$ で滑らかに切り替わる）。2 本目の骨を肢の軸周りに $160^\circ$ ねじっています。縞模様がねじれを、色がレスト時に対する半径の比を示します。LBS（左）は中央が細くくびれ、DQS（中）は半径を保ちます。右：肢に沿ったリングの半径。LBS は式 $\sqrt{w_0^2+w_1^2+2w_0w_1\cos\theta}$ にぴったり乗ります。凡例はレスト形状に対する体積の比です。" %}

下のウィジェットは、曲げとねじりで同じことを 2D で示します。

{% include widget.liquid name="graphics-skinning" height="460" caption="関節の周りに滑らかなウェイトでスキニングした 2 本の骨の肢です。スライダー（または肢の先端）をドラッグして曲げるか、ねじりモードに切り替えて、軸周りにねじれる平たいリボンを見てください。LBS / DQS / 両方を切り替えると、関節付近のスキンの最小幅とレスト時の幅の比が表示されます。LBS は角度とともに細くなり、ねじりモードでは 180° で潰れます。DQS は幅を保ちます。" %}

### 補正シェイプとその先

どちらの手法も解剖学を知りません。筋肉は膨らみ、皮膚は滑り、肘にはしわが寄ります。プロダクションのリグは**補正ブレンドシェイプ（corrective blendshapes）**、つまり関節角度で発動する彫刻されたオフセットを加えます。**ポーズ空間変形（pose space deformation）**（Lewis ら 2000）はこうした補正を放射基底関数でポーズ空間上に補間し、SMPL（第 7 節）はスキャンからそれを学習します。ほかに出会う手法として、delta mush（平滑化してからレストポーズの細部を戻す）、陰的スキニング（接触を考慮）、物理レイヤー（揺れ、筋肉シミュレーション、[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})の布）、学習ベースのニューラルスキニングがあります。

## 5. ブレンドシェイプと顔

顔は骨が少ないのに変形が豊かなので、主に**ブレンドシェイプ（blendshapes）**（モーフターゲット、morph targets）でアニメーションします。アーティストは、ニュートラルな顔 $\mathbf{b}_0$ と頂点数が同じターゲットメッシュ $\mathbf{b}_k$（笑顔、まばたき、口を開ける）を彫刻し、顔は

$$
\mathbf{v}(\mathbf{w}) = \mathbf{b}_0 + \sum_k w_k\,(\mathbf{b}_k - \mathbf{b}_0) = \mathbf{b}_0 + \mathbf{D}\mathbf{w}
$$

となります。重み $w_k$（通常 $[0,1]$）についての線形モデルです。この**差分（delta）**形式では重みが足し算できます。笑顔と口開きを足せば、笑いながら口を開けた顔になります。モデルが線形なので、追跡した点から重みを求める（フェイシャルキャプチャ）のは、範囲制約付きの小さな最小二乗問題です。実際のリグでは**組み合わせシェイプ（combination shapes）**も加えます。二つのターゲットが干渉するときに $w_i w_j$ のような積で発動する補正です。Lewis ら（2014）のサーベイが理論と実践を扱っています。

ターゲットの標準的な語彙は**顔面動作符号化システム（Facial Action Coding System, FACS）**（Ekman と Friesen 1978）です。表情を解剖学に基づく*アクションユニット*（AU12：口角を引き上げる、AU26：顎を下げる、…）に分解します。プロダクションの顔リグは FACS シェイプを中心に組まれています。Apple の ARKit のフェイストラッキングは同じ考え方で約 50 個の名前付き係数（`jawOpen`、`eyeBlinkLeft`、`mouthSmileLeft`、…）を提供し、VR や配信でのアバターの顔の事実上の交換形式になっています。Epic の MetaHuman はハイエンドな実例です。関節ベースのコントロールと補正シェイプからなる標準化された顔と体のリグがあり、MetaHuman Animator は演者を撮影した映像からリグのコントロール値を解きます。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-blendshapes.svg" caption="2D の顔での差分ブレンドシェイプ。ターゲットは笑顔（口角が上がり、目がわずかに細まる）と口開き（下唇と顎が下がる）の 2 つです。左から：ニュートラル、各ターゲットを重み 1 で、二つのオフセットを足しただけの混合 $(0.7, 0.6)$、そして $w=1.5$ に外挿した笑顔。最後の例は、リグが重みを制限する理由を示しています。" %}

## 6. キャラクターの逆運動学

アニメーターやゲームは、逆の問題を絶えず必要とします。手を*ここ*に置き、足を*そこ*に着けたいのです。[エンボディード AI 第 1 回]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})ではヤコビアンに基づく一般的なソルバ（擬似逆行列と減衰最小二乗法）を導出しました。ここでは、キャラクターアニメーションで主流の 3 つの手法を紹介します。

### 解析的な 2 ボーン IK

腕や脚（上の骨 $l_1$、下の骨 $l_2$）が根元から距離 $d$ の目標に届こうとするとき、三角形ができます。**余弦定理**から肘や膝の内角

$$
\cos\gamma = \frac{l_1^2 + l_2^2 - d^2}{2 l_1 l_2}, \qquad \text{曲げ角} = \pi - \gamma
$$

と、上の骨と目標方向のなす角

$$
\cos\alpha = \frac{l_1^2 + d^2 - l_2^2}{2 l_1 d}
$$

が得られます。残る自由度、つまり根元と目標を結ぶ軸の周りの三角形の回転は、**ポールベクトル（pole vector）**（膝が向くべき方向）で決めます。**数値例**：$l_1 = l_2 = 1$、目標 $(1, 1)$ なので $d = \sqrt2$ です。すると $\cos\gamma = (1 + 1 - 2)/2 = 0$ で $\gamma = 90^\circ$、$\cos\alpha = (1 + 2 - 1)/(2\sqrt2) = 0.707$ で $\alpha = 45^\circ$ です。目標の方向は $45^\circ$ なので、上の骨は $45^\circ - 45^\circ = 0^\circ$（$x$ 方向）を向き、下の骨は真上を向きます：$(1,0) + (0,1) = (1,1)$。$d > l_1 + l_2$ なら $d$ をクランプし、肢はまっすぐ目標を指します。

```python
import numpy as np

def two_bone_ik(target, l1, l2):
    """Planar two-bone IK (elbow bending counter-clockwise). Returns (shoulder, elbow) angles."""
    d = np.clip(np.linalg.norm(target), abs(l1 - l2) + 1e-9, l1 + l2 - 1e-9)
    gamma = np.arccos((l1**2 + l2**2 - d**2) / (2 * l1 * l2))
    alpha = np.arccos((l1**2 + d**2 - l2**2) / (2 * l1 * d))
    return np.arctan2(target[1], target[0]) - alpha, np.pi - gamma

a1, a2 = two_bone_ik(np.array([1.0, 1.0]), 1.0, 1.0)
print(np.degrees([a1, a2]))                                 # [ 0. 90.]
```

### CCD と FABRIK

もっと長い連鎖（背骨、しっぽ、指）では、反復ソルバのほうがヤコビアンより単純で、逆行列も要りません。

**巡回座標降下法（cyclic coordinate descent, CCD）**（Wang と Chen 1991）は、先端から根元へ順に関節を訪れます。各関節で、エンドエフェクタが目標へ向かう直線上に来るような角度だけ回します。各ステップは 1 関節については最適で、収束も速いのですが、先端の関節から先に丸まりやすく、関節制限がないと不自然な姿勢になりがちです。

**FABRIK**（Forward And Backward Reaching IK、Aristidou と Lasenby 2011）は関節の*位置*を直接扱います。後ろ向きのパスでは、エンドエフェクタを目標に置き、根元へ向かって進みながら、各関節を元の位置への直線上で骨の長さの距離に置きます。前向きのパスでは、根元を元の位置に戻し、同じやり方で先端まで進みます。角度も三角関数もなく、動きは連鎖全体に自然に分散し、制約や複数のエンドエフェクタも簡単に追加できます。

```python
import numpy as np

def fabrik(P, lengths, target, iters=10):
    P = P.copy(); base = P[0].copy()
    for _ in range(iters):
        P[-1] = target                                       # backward pass
        for i in reversed(range(len(lengths))):
            d = P[i] - P[i + 1]
            P[i] = P[i + 1] + lengths[i] * d / np.linalg.norm(d)
        P[0] = base                                          # forward pass
        for i in range(len(lengths)):
            d = P[i + 1] - P[i]
            P[i + 1] = P[i] + lengths[i] * d / np.linalg.norm(d)
    return P

lengths = np.array([1.0, 0.8, 0.6, 0.4])
P0 = np.c_[np.r_[0, np.cumsum(lengths)], np.zeros(5)]      # straight chain along x
P = fabrik(P0, lengths, np.array([0.6, 1.9]))
print(np.linalg.norm(P[-1] - [0.6, 1.9]), np.linalg.norm(np.diff(P, axis=0), axis=1))
# 5.5e-10 [1.  0.8 0.6 0.4]: on target, bone lengths kept
```

下の図は、CCD と FABRIK が同じ初期姿勢から同じ目標へ、反復ごとに手を伸ばしていく様子です。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-ik-ccd-fabrik.svg" caption="同じ 4 本の骨の連鎖（骨の長さ 1、0.8、0.6、0.4）が、同じ初期姿勢から赤い星に手を伸ばす様子。反復 1、2、3、20 回後を示しています（灰色は初期姿勢で、色が濃いほど後の反復です）。CCD（左）は外側の関節から先に振ります。FABRIK（中）は動きを連鎖全体に分散させます。右：両者の反復ごとのエンドエフェクタ誤差（対数目盛）。FABRIK は 1 回目の反復後にずっと近づいていますが、反復 4 回目あたりからは CCD のほうが速く下がります。ここではどちらも収束しますが、速さは連鎖と目標によって変わります。" %}

{% include widget.liquid name="graphics-ik-chain" height="440" caption="図と同じ 4 本の骨の連鎖で動く CCD（紫）と FABRIK（オレンジ）。赤い目標をマウスまたは指でドラッグしてください。スライダーで灰色のレストポーズから何回反復するかを決め、薄い連鎖が途中の反復を示します。根元に近い目標や到達円の縁の目標を試し、各ソルバが連鎖をどう曲げるか、誤差がどれだけ速く減るかを比べてください。" %}

**全身 IK（full-body IK）**は、複数のエフェクタ（両手、両足、頭の注視）を、優先度、関節制限、バランス（重心が支持多角形の上にあること）と組み合わせます。ゲームでは、でこぼこの地面への足の接地、武器やドアへの手の配置、VR アバターに使われます。VR は難しいケースです。3 つの追跡点（ヘッドセットと 2 つのコントローラ）からもっともらしい全身を作る必要があり、これは劣決定問題です。脚は、学習した事前分布で補うことが増えています。

## 7. モーションキャプチャとリターゲティング

すべてを手でキーフレーム付けするのは高くつくので、リアルな動きの多くは**キャプチャ**されます。

- **光学式マーカー**のシステム（Vicon、OptiTrack）は、多数の赤外線カメラに映る再帰反射マーカーを三角測量します。ミリメートル精度でスタジオの標準ですが、撮影ステージと、遮蔽やマーカーの入れ替わりの修正作業が必要です。
- **慣性式（IMU）スーツ**（例：Xsens）は、各部位のジャイロと加速度計を積分します。どこでも使えますが、大域位置がドリフトします。
- **マーカーレス**キャプチャは、学習した姿勢推定器で普通の映像から体を推定します。多視点の構成はプロダクションのプリビズに使えるほど正確になり、単眼の手法は第 9 節の VideoMimic のようなロボット向けパイプラインを支えています。

生のマーカーやキーポイントのデータは人体モデルに当てはめます。**SMPL**（Loper ら 2015）はビジョンと機械学習の標準です。スキニングされたメッシュで、レスト形状と関節位置は形状パラメータ $\boldsymbol\beta$ に、ポーズ補正はポーズ $\boldsymbol\theta$（24 関節、軸角表現）に依存します。

$$
M(\boldsymbol\beta, \boldsymbol\theta) = \mathrm{LBS}\big(\bar{\mathbf{T}} + B_S(\boldsymbol\beta) + B_P(\boldsymbol\theta),\ J(\boldsymbol\beta),\ \boldsymbol\theta,\ \mathcal{W}\big).
$$

ここで $B_S$ は数千のスキャンから学習した体形の線形ブレンドシェイプ空間（第 5 節の式の再登場）、$B_P$ は LBS のアーティファクトを補正する回転行列の線形関数（学習した第 4 節の補正シェイプ）、$J$ は変形後のメッシュから関節位置を回帰し、$\mathcal W$ はスキンウェイトです。すべてが微分可能なので、SMPL（と手や顔を加えた後継の SMPL-X）は、ほとんどの人体姿勢推定器やモーション生成器の出力形式になっています。

**リターゲティング（retargeting）**は、プロポーション、関節数、レストポーズが異なる別の骨格へ動きを移します。基本的な手順は次のとおりです。関節を名前か意味で対応付ける。各ソース回転をソースのレストポーズに対する相対回転として表し、ターゲットのレストポーズに対して適用する。ルートの並進を脚の長さの比でスケールする。そしてプロポーションの変化で崩れた接触（床の上の足、小道具を持つ手）を IK で戻す。人間の動きを**ヒューマノイドロボット**にリターゲットするには、関節制限、関節軸の違い、物理的な実現可能性も考える必要があります。GMR（Araújo ら、arXiv 2025 年 10 月）は、リターゲティングのアーティファクトが第 9 節の強化学習モーショントラッカーをはっきり劣化させることを示し、よりクリーンな汎用リターゲッタを提案しています。

## 8. データ駆動アニメーション

大きなモーションキャプチャのデータベースがあるとして、ゲームのキャラクターをジョイスティックでどう動かせばよいでしょうか。

**モーショングラフ（motion graphs）**（Kovar、Gleicher、Pighin 2002）は、データベース内でブレンドできるほど似ているフレームを探してそこに遷移を加え、得られたグラフ上で指定ルートに沿う経路を探索します。グラフはオフラインで作る必要があり、応答性は遷移の位置に制限されます。

**モーションマッチング（motion matching）**（Ubisoft の Simon Clavet が GDC 2016 で発表し、『フォーオナー』（*For Honor*）やその後の多くのゲームで使われています）はグラフを捨てます。数フレームごと（たとえば 0.1 秒ごと）に、現在のポーズと望む未来からクエリ特徴ベクトルを作り、特徴が最もよく一致するデータベースのフレームへ飛びます。

$$
i^* = \arg\min_i \sum_k \Big(\frac{f_{i,k} - q_k}{\sigma_k}\Big)^2 .
$$

ここで $f_{i,k}$ はデータベースの第 $i$ フレームの第 $k$ 特徴、$q_k$ はクエリの対応する成分です。特徴は通常、いくつかの時間幅（たとえばキャラクターの局所座標系で 0.33、0.67、1 秒後）での未来のルート位置と向き、現在の足の位置と速度、腰の速度です。標準偏差 $\sigma_k$ で正規化し、デザイナーが重みを付けます。ポーズは一致したクリップに切り替わり、**慣性化（inertialization）**が新旧のポーズのずれを数フレームかけて減衰させて不連続を隠します。探索の高速化（KD 木、バウンディングボックス、クラスタリング）で計算は安く抑えられます。

```python
import numpy as np

def match(F, q, sigma, weights=None):
    """F: (N, d) database features, q: (d,) query. Returns best frame and all costs."""
    w = np.ones(F.shape[1]) if weights is None else weights
    cost = (w * ((F - q) / sigma) ** 2).sum(1)
    return int(np.argmin(cost)), cost
```

下の図は、この探索を合成データベース上で実行し、「走りながら左に曲がる」クエリに対してどのフレームが選ばれるかを示します。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-motion-matching.svg" caption="合成した 50 秒の移動データベース（ランダムな旋回、歩きと走りの速さ、30 fps）でのおもちゃのモーションマッチング探索。特徴は局所座標系での 1/3、2/3、1 秒後のルート位置と現在の速さです。クエリは「左に曲がりながら走る」です。左：データベースの経路（灰色）、最もよく一致したフレームとその後 1 秒の動き（紫）、そのフレームに置いた望む未来（オレンジ）。両者は重なっています（そのフレームの周囲 12 m を拡大）。中：全フレームのコストと、最小値の印。右：全特徴ベクトルを第 1・第 2 主成分に射影し、コストで色付けしたもの。星がクエリで、最良一致（丸）のすぐ隣にあります。" %}

**学習型モーションマッチング（learned motion matching）**（Holden ら 2020）は、モーションマッチングの振る舞いを保ちつつ、大きなデータベースを小さなニューラルネットワークで置き換えます。*デコンプレッサ（decompressor）*が特徴と潜在コードからポーズを復元し、*ステッパ（stepper）*が時間方向に進め、*プロジェクタ（projector）*が最近傍探索を置き換えます。メモリ使用量は数百 MB から数 MB に減り、これはゲーム機では重要です。**位相関数ニューラルネットワーク（phase-functioned neural network, PFNN）**（Holden ら 2017）はそれ以前のニューラルコントローラです。重みが歩行位相の周期的なスプライン関数になっている MLP で、地形の注釈付きの移動データで訓練され、ユーザー入力と地形の高さから次のポーズを直接出力します。

## 9. 物理ベースのキャラクターとヒューマノイドロボットへの橋

運動学的な手法は、物理に反する動きを生むことがあります。足が滑る、体が浮く、押されても反応しない、といったことです。**物理ベースのキャラクター（physics-based characters）**は、[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})と同じくシミュレートされた剛体の骨格です。関節はトルクで駆動され、トルクは通常、目標角度を追従する **PD 制御器**から来ます。

$$
\boldsymbol\tau = k_p(\mathbf{q}_{\text{target}} - \mathbf{q}) + k_d(\dot{\mathbf{q}}_{\text{target}} - \dot{\mathbf{q}}).
$$

PD だけでは追従がうまくいきません。トルクを出すには誤差が必要なので、重力で肢が垂れ、速い動きには遅れが出ます。ゲインを硬くすれば誤差は減りますが、キャラクターがこわばり、シミュレーションも硬くなります。参照モーション自体の逆動力学トルクをフィードフォワード項として加えると、誤差の大部分が消えます。ただし完全なキャラクターは劣駆動です。ルートを押すモーターはなく、バランスは接触を通してしか得られません。そのためフィードフォワードはこの方法では計算できず、そこを学習した方策が引き受けます。

```python
import numpy as np

def pd_step(q, dq, q_ref, dq_ref, kp, kd):
    return kp * (q_ref - q) + kd * (dq_ref - dq)            # joint torques

# inside the simulation loop (see the figure script for the two-link pendulum dynamics):
#   tau = pd_step(q, dq, q_ref(t), dq_ref(t), kp, kd) [+ inverse-dynamics feedforward]
#   ddq = solve(M(q), Q(tau) - c(q, dq) - g(q));  dq += dt * ddq;  q += dt * dq
```

下の図は、このループで 2 リンク振り子に正弦波の参照を追従させ、ゲイン $k_p$ とフィードフォワードの違いを比べたものです。

{% include blog_figure.liquid path="assets/img/blog/graphics/09-pd-tracking.svg" caption="シミュレートした 2 リンク振り子（0.5 m のリンクの先に 1 kg の質点、重力あり）が、関節 PD 制御で正弦波の参照を追従する様子。ゲインは臨界減衰に近い $k_d = 2\sqrt{0.3\,k_p}$ です。左：肘の角度。$k_p=20$ では腕が垂れて大きく遅れ、$k_p=500$ ではよく追従します。右：追従誤差（対数目盛）。参照モーションの逆動力学トルクをフィードフォワードとして加えると（緑、$k_p=100$ のみ）、最も硬い純粋な PD より誤差が小さくなります。" %}

**方策の学習。** **DeepMimic**（Peng ら 2018）は、30 Hz で PD 目標を出力するニューラル方策を強化学習（PPO）で訓練します。報酬は一つの参照クリップの模倣に対して与えます：

$$
\begin{aligned}
r ={}& w_p e^{-k_p\sum\lVert q - \hat q\rVert^2} + w_v e^{-k_v\sum\lVert\dot q - \dot{\hat q}\rVert^2}\\
&+ w_e e^{-k_e\sum\lVert p_e - \hat p_e\rVert^2} + w_c e^{-k_c\lVert c - \hat c\rVert^2}
\end{aligned}
$$

4 つの項は、クリップの関節回転、関節速度、エンドエフェクタ位置、重心に一致することへの報酬です。ハット付きの量は参照クリップの値、$w$ は各項の重み、$k$ は指数部のスケール係数です（ここでの $k_p$、$k_v$ は上の PD ゲインとは無関係です）。うまくいった鍵は二つの工夫です。参照状態初期化（エピソードをクリップのランダムなフレームから始める）と早期終了（キャラクターが転んだら止める）です。**AMP**（Peng ら 2021）は手作りの追従報酬を GAN 型の識別器に置き換えます。識別器はキャラクターの状態遷移とモーションデータセットの遷移を見分けます。これで、クリップを選ばなくても、タスク報酬（あそこへ行け）と「データのように動け」を組み合わせられます。**ASE**（Peng ら 2022）は、敵対的な目的と多様性の目的で大きな潜在スキル空間を事前学習し、上位のコントローラは潜在変数を選ぶだけで済むようにします。**PHC**（Luo ら 2023）は単一の方策で AMASS のほぼすべてを追従し、転倒から回復し、映像や VR の入力からアバターを動かします。**MaskedMimic**（Tessler ら 2024）は制御をモーションのインペインティングとして扱います。全身トラッカーを蒸留して訓練した一つの方策が、任意の制約の部分集合（関節目標、VR の頭と両手、テキスト、物体の目標）を受け付けます。後続研究には、運動学的なモーション生成器と物理トラッカーを交互に回してパルクールのデータを増やす **PARC**（Xu ら、SIGGRAPH 2025）や、MaskedMimic を全身での物体操作に広げた **MaskedManipulator**（Tessler ら、SIGGRAPH Asia 2025）があります。

**ヒューマノイドロボットへの橋（2026 年 11 月時点）。** 同じレシピが 2024〜2026 年に実機へ移りました。人間の動きをロボットにリターゲットし（第 7 節）、大規模並列シミュレータ（[エンボディード AI 第 3 回]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})）でドメインランダム化を使って追従方策を訓練し、ゼロショットで実機に載せます。

- **H2O**（He ら、IROS 2024）と **HumanPlus**（Fu ら、CoRL 2024）は、これを人間のオペレータのリアルタイム遠隔操作とシャドーイングに使いました。
- **ASAP**（He ら、RSS 2025）は実機の実行データから残差の「デルタ行動」モデルを学習し、俊敏なスキルの sim-to-real ギャップを埋めます。
- **TWIST**（Ze ら、CoRL 2025）はモーションキャプチャからの全身遠隔操作を行い、**KungfuBot**（Xie ら、NeurIPS 2025）と **GMT**（Chen ら、arXiv 2025 年 6 月）は非常に動的な動きや汎用的な動きを追従します。
- **VideoMimic**（Allshire ら、CoRL 2025）はスマートフォンの映像から、階段を上る、座るといった周囲の状況に応じたスキルを学びます。
- **BeyondMimic**（Liao ら、arXiv 2025 年 8 月）はモーショントラッカーとガイド付き拡散方策を組み合わせます。
- 2026 年のテーマは規模です。**SONIC**（Luo ら、*Science Robotics* 2026）は追従コントローラを数千万パラメータ、数百時間のモーションキャプチャへと拡大しました。**SuperMimic**（Liao ら、CoRL 2026 採択、arXiv 2026 年 10 月）は学習した一つの微分可能な世界モデルを通してトラッカーを訓練し、単一 GPU で数時間のうちに大規模計算の強化学習ベースラインに並ぶと報告しています。

グラフィックスにとっての教訓は、骨格とリターゲティングから PD 追従と模倣報酬まで、キャラクターアニメーションの技術スタックが今やロボット学習の一部になっているということです。

## 10. 生成的モーション

生成モデルは今や、テキスト、音楽、音声、まばらな制約から動きを合成します。よく使う表現は SMPL 風のポーズ列で、冗長な特徴（ルート速度、関節位置、回転、足の接地）を含むことが多いです。**HumanML3D**（Guo ら、CVPR 2022）はテキストからモーションへの標準ベンチマークで、AMASS と HumanAct12 の動きにそれぞれ複数のテキスト記述が付いています。

- **MDM**（Human Motion Diffusion Model、Tevet ら、ICLR 2023）は Transformer の[拡散モデル]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})で、ノイズではなくきれいなモーション $\hat x_0$ を予測します。そのため訓練中に、位置、速度、足の接地に幾何学的な損失をかけられます。再訓練なしでインペインティング（キーフレーム間のフレームを埋める、上半身から下半身を補う）もでき、これは学習による中割りそのものです。
- **MoMask**（Guo ら、CVPR 2024）は残差ベクトル量子化オートエンコーダでモーションをトークン化し、マスク付き Transformer でトークンを生成します。その年の強力なテキストからモーションへのモデルでした。
- **MotionLCM**（Dai ら、ECCV 2024）は潜在拡散を少ステップの一貫性モデルに蒸留し、リアルタイムで制御可能な生成を実現します。
- **MotionStreamer**（Xiao ら、ICCV 2025）は、因果的な潜在空間での拡散ベースの自己回帰モデルで、モーションをオンラインのストリームとして生成します。
- データとモデルの規模拡大。**Go to Zero**（Fan ら、arXiv 2025 年 7 月）はゼロショット生成のために 100 万シーケンス規模のデータセットを作りました。**HY-Motion 1.0**（Tencent Hunyuan、arXiv 2025 年 12 月）はフローマッチングの Transformer を約 10 億パラメータに拡大しました。NVIDIA の **Kimodo**（Rempe ら、arXiv 2026 年 3 月）は約 700 時間の光学式モーションキャプチャで運動学的な拡散モデルを訓練し、テキスト、キーフレーム、経由点、経路で制御します。

物理と生成は収束しつつあります。BeyondMimic と MaskedMimic は生成モデルを物理ベースのコントローラの中に入れ、PARC は物理トラッカーで生成されたモーションを整えます。未解決の問題は、物理的なもっともらしさ、シーンや物体との接触、長時間の一貫性、そして評価です。モーション特徴に対する FID 風の指標は、アニメーターが良いと判断するものとは緩やかにしか相関しません。

## 試してみよう

- 上のスキニングのウィジェットで、LBS の幅が半分になるねじれ角を探し、等しい重みのときの式 $r'/r = \lvert\cos(\theta/2)\rvert$ と比べてください。
- ドラッグで IK を試すなら、[エンボディード AI 第 1 回]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})のアームのウィジェットが第 6 節のヤコビアン版を解きます。[ホームページのラボ]({{ '/' | relative_url }}#lab)の布は、物理ベースのキャラクターの土台である[第 7 回]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})の物理で動いています。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Catmull & Rom, *A class of local interpolating splines* | Computer Aided Geometric Design (Academic Press) | 1974 | （書籍の章） | 接線を自動で決める補間スプライン |
| Shoemake, *Animating rotation with quaternion curves* | SIGGRAPH | 1985 | [DOI](https://doi.org/10.1145/325165.325242) | アニメーションのためのクォータニオン、slerp、squad |
| Magnenat-Thalmann, Laperrière & Thalmann, *Joint-dependent local deformations for hand animation and object grasping* | Graphics Interface | 1988 | [DOI](https://doi.org/10.20380/GI1988.04) | 初期の骨格駆動のスキン変形 |
| Wang & Chen, *A combined optimization method for solving the inverse kinematics problems of mechanical manipulators* | IEEE Trans. Robotics and Automation | 1991 | [DOI](https://doi.org/10.1109/70.86079) | 巡回座標降下法による IK |
| Lewis, Cordner & Fong, *Pose space deformation* | SIGGRAPH | 2000 | [DOI](https://doi.org/10.1145/344779.344862) | ポーズ駆動の補正シェイプ |
| Kovar, Gleicher & Pighin, *Motion graphs* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566605) | モーションキャプチャの遷移上のグラフ探索 |
| Kavan, Collins, Žára & O'Sullivan, *Geometric skinning with approximate dual quaternion blending* | ACM TOG | 2008 | [DOI](https://doi.org/10.1145/1409625.1409627) | デュアルクォータニオン・スキニング |
| Aristidou & Lasenby, *FABRIK* | Graphical Models | 2011 | [DOI](https://doi.org/10.1016/j.gmod.2011.05.003) | 位置ベースの反復 IK |
| Lewis et al., *Practice and theory of blendshape facial models* | Eurographics STAR | 2014 | [DOI](https://doi.org/10.2312/egst.20141042) | 顔のブレンドシェイプリグのサーベイ |
| Loper et al., *SMPL: A skinned multi-person linear model* | ACM TOG | 2015 | [DOI](https://doi.org/10.1145/2816795.2818013) | 学習した人体モデル。ビジョンの標準 |
| Clavet, *Motion Matching and The Road to Next-Gen Animation* | GDC 講演 | 2016 | [GDC Vault](https://gdcvault.com/play/1023280/Motion-Matching-and-The-Road) | プロダクションでのモーションマッチング |
| Holden, Komura & Saito, *Phase-functioned neural networks for character control* | ACM TOG | 2017 | [DOI](https://doi.org/10.1145/3072959.3073663) | ニューラルな移動コントローラ |
| Peng, Abbeel, Levine & van de Panne, *DeepMimic* | ACM TOG (SIGGRAPH) | 2018 | [arXiv](https://arxiv.org/abs/1804.02717) | 強化学習によるモーションキャプチャの模倣 |
| Holden, Kanoun, Perepichka & Popa, *Learned motion matching* | ACM TOG | 2020 | [DOI](https://doi.org/10.1145/3386569.3392440) | 小さなネットワークによるモーションマッチング |
| Peng et al., *AMP: Adversarial Motion Priors* | ACM TOG (SIGGRAPH) | 2021 | [arXiv](https://arxiv.org/abs/2104.02180) | 識別器によるスタイル報酬 |
| Peng et al., *ASE: Adversarial Skill Embeddings* | ACM TOG (SIGGRAPH) | 2022 | [arXiv](https://arxiv.org/abs/2205.01906) | 再利用可能な潜在スキル空間 |
| Guo et al., *Generating Diverse and Natural 3D Human Motions from Text* | CVPR | 2022 | [CVF](https://openaccess.thecvf.com/content/CVPR2022/html/Guo_Generating_Diverse_and_Natural_3D_Human_Motions_From_Text_CVPR_2022_paper.html) | HumanML3D ベンチマーク |
| Tevet et al., *Human Motion Diffusion Model* | ICLR | 2023 | [arXiv](https://arxiv.org/abs/2209.14916) | テキストからモーションへの拡散モデル |
| Luo et al., *Perpetual Humanoid Control for Real-time Simulated Avatars* | ICCV | 2023 | [arXiv](https://arxiv.org/abs/2305.06456) | 転倒から回復する汎用モーショントラッカー |
| Guo et al., *MoMask* | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.00063) | 残差 VQ + マスク付き Transformer |
| He et al., *H2O: Learning Human-to-Humanoid Real-Time Whole-Body Teleoperation* | IROS | 2024 | [arXiv](https://arxiv.org/abs/2403.04436) | 実機ヒューマノイドでのキャラクター追従 |
| Fu et al., *HumanPlus* | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2406.10454) | 人間のシャドーイングと模倣 |
| Tessler et al., *MaskedMimic* | ACM TOG (SIGGRAPH Asia) | 2024 | [arXiv](https://arxiv.org/abs/2409.14393) | 統一的な制御をモーションのインペインティングとして |
| He et al., *ASAP* | RSS | 2025 | [arXiv](https://arxiv.org/abs/2502.01143) | 俊敏なヒューマノイドスキルの sim-to-real 整合 |
| Xu et al., *PARC* | SIGGRAPH | 2025 | [arXiv](https://arxiv.org/abs/2505.04002) | 生成器 + 物理トラッカーによるデータ拡張 |
| Ze et al., *TWIST* | CoRL | 2025 | [PMLR](https://proceedings.mlr.press/v305/ze25a.html) | 模倣による全身遠隔操作 |
| Allshire et al., *Visual Imitation Enables Contextual Humanoid Control* (VideoMimic) | CoRL | 2025 | [arXiv](https://arxiv.org/abs/2505.03729) | 単眼映像からのヒューマノイドスキル |
| Xie et al., *KungfuBot* | NeurIPS | 2025 | [arXiv](https://arxiv.org/abs/2506.12851) | 非常に動的な人間のスキルの追従 |
| Xiao et al., *MotionStreamer* | ICCV | 2025 | [arXiv](https://arxiv.org/abs/2503.15451) | ストリーミング型のテキストからモーション |
| Tessler et al., *MaskedManipulator* | SIGGRAPH Asia | 2025 | [arXiv](https://arxiv.org/abs/2505.19086) | シミュレートされたキャラクターの全身操作 |
| Liao et al., *BeyondMimic* | arXiv プレプリント（2025 年 8 月） | 2025 | [arXiv](https://arxiv.org/abs/2508.08241) | 実機でのモーション追従 + ガイド付き拡散 |
| Araújo et al., *Retargeting Matters: General Motion Retargeting for Humanoid Motion Tracking* | arXiv プレプリント（2025 年 10 月） | 2025 | [arXiv](https://arxiv.org/abs/2510.02252) | ロボットトラッカーにとってのリターゲティング品質 |
| Tencent Hunyuan, *HY-Motion 1.0* | arXiv プレプリント（2025 年 12 月） | 2025 | [arXiv](https://arxiv.org/abs/2512.23464) | 10 億パラメータのフローマッチングによるテキストからモーション |
| Luo et al., *SONIC: Supersizing Motion Tracking for Natural Humanoid Whole-Body Control* | Science Robotics | 2026 | [arXiv](https://arxiv.org/abs/2511.07820) | ヒューマノイドのモーション追従の規模拡大 |
| Rempe et al., *Kimodo* | arXiv プレプリント（2026 年 3 月） | 2026 | [arXiv](https://arxiv.org/abs/2603.15546) | 大規模で制御可能なモーション拡散 |
| Liao et al., *SuperMimic* | CoRL（採択）、arXiv 2026 年 10 月 | 2026 | [arXiv](https://arxiv.org/abs/2610.28480) | 一つの微分可能な世界モデルによる追従学習 |

## 学習リソース

- Rick Parent『*Computer Animation: Algorithms and Techniques*』（第 3 版）：スプライン、回転、運動学、スキニング、モーションキャプチャ。
- **GAMES105**（劉利斌、中国語）：運動学やモーションマッチングから物理ベースの制御と学習まで、キャラクターアニメーションの基礎。
- Daniel Holden のブログ [theorangeduck.com](https://theorangeduck.com/)：クォータニオン、スプリングダンパー、慣性化、モーションマッチングについての、コード中心で明快な記事。
- Jason Gregory『*Game Engine Architecture*』：アニメーションシステムの章（骨格、ブレンドツリー、圧縮）。[グラフィックスエンジンのシリーズ]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})への橋渡しです。
- コード：[SMPL / SMPL-X](https://smpl-x.is.tue.mpg.de/)、NVIDIA の [ProtoMotions](https://github.com/NVlabs/ProtoMotions)（MaskedMimic などの物理ベースキャラクター手法）、[MDM](https://github.com/GuyTevet/motion-diffusion-model)。

## 演習

1. 4 つの端点条件からエルミート基底を導出し、一様 Catmull–Rom スプラインがキーで $C^1$ だが $C^2$ ではないことを示してください。
2. 弧長の逆引きのためのニュートン法 $t \leftarrow t - (s(t) - s^*)/\lVert p'(t)\rVert$ を実装し、曲線の評価回数を揃えたうえで表引きと精度を比べてください。
3. 共通の軸周りに回る 2 関節では、DQS（並進 0）が正規化クォータニオンのブレンド（nlerp）に帰着し、その回転角がちょうど $w_1\theta$ にはならないことを示してください。$w_1 = 0.25$、$\theta = 160^\circ$ で誤差はどれくらいでしょうか。
4. CCD と FABRIK に関節制限（関節ごとの角度区間）を加え、根元に近い目標に対して到達する姿勢を比べてください。
5. モーションマッチングのおもちゃに、合成した歩行位相から作る足の位置の特徴を加え、大きな重みを付けてください。クエリが現在の足の位相を保つよう求めるとき、選ばれるフレームはどう変わるでしょうか。

<details markdown="1"><summary>演習 3 のヒント</summary>

$q_0 = 1$、$q_1 = (\cos\frac\theta2, \sin\frac\theta2\,\hat x)$ とすると、ブレンド $w_0 + w_1 q_1$ の回転角は $2\,\mathrm{atan2}\big(w_1\sin\frac\theta2,\ w_0 + w_1\cos\frac\theta2\big)$ です。slerp が与える $w_1\theta$ と比べてください。

</details>

<details markdown="1"><summary>演習 4 のヒント</summary>

CCD では、各関節を更新した直後にその角度をクランプします。FABRIK では、関節 $i+1$ を置いた後、骨の向きを一つ前の骨に対する許容円錐（2D では角度区間）に射影します。

</details>

シリーズの次回：ボリュームと関与媒質（[グラフィックス第 10 回]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }})）。
