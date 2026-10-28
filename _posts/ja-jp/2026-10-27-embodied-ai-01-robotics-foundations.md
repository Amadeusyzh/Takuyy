---
layout: post
title: "ロボティクスの基礎：座標変換、運動学、制御、計画"
date: 2026-10-27 18:01:00+0900
description: "SE(3)、順・逆運動学、ヤコビアン、動力学の概観、PID とインピーダンス制御、A*/RRT による計画を、3 リンクアームの NumPy コード付きで解説します。"
categories: embodied-ai
tags: [robotics, kinematics, control, motion-planning]
series: embodied-ai
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## なぜ重要なのか

身体性 AI（embodied AI）は、物理世界の中で身体を動かさなければならない AI の一分野です。最近のロボット学習の論文には
「方策」（policy）、「アクションチャンク」（action chunk）、「エンドエフェクタの差分」（end-effector delta）といった言葉が
並びますが、そのすべての下には古典的なロボティクスの層が積み重なっています。座標系、運動学、動力学、低レベル制御器、
そして計画器です。7 次元のエンドエフェクタ指令を出力する Vision-Language-Action モデルも、その指令を 1 kHz で関節トルクに
変換し、関節限界や自己干渉を避けてくれる仕組みがなければ役に立ちません。

本記事は **身体性 AI** シリーズの第 1 回で、深層学習・グラフィックス・世界モデルは知っているもののロボティクスの経験は
少ない読者に向けて、この層をコンパクトに一巡りします。グラフィックスの経験があれば、すでに半分は知っています。
ロボットアームは剛体変換からなるシーングラフ（scene graph）であり、逆運動学はアニメーターがキャラクターリグで解いている
問題そのものです。

**前提知識**

- 線形代数：行列、回転、最小二乗法、特異値分解（SVD）。
- 微積分：偏微分、連鎖律。
- Python と NumPy。
- あると便利（必須ではない）：グラフィックスの授業で習う同次座標。

## 1. 剛体変換と SE(3)

### 回転：SO(3)

基準座標系に対する剛体の姿勢は回転行列 $R \in \mathbb{R}^{3\times3}$ で表され、その各列は物体の座標軸を基準座標系で
表したものです。回転行列は**特殊直交群**（special orthogonal group）をなします。

$$
SO(3) = \{ R \in \mathbb{R}^{3\times 3} \;:\; R^\top R = I,\; \det R = 1 \}.
$$

SO(3) は 3 次元の多様体であってベクトル空間ではありません。2 つの回転を足しても回転にはなりません。よく使われる
パラメータ表現には、オイラー角（最小表現だが「ジンバルロック」で特異）、単位クォータニオン（4 つの数、二重被覆、
特異点なし。シミュレータやゲームエンジンの標準）、そして単位軸 $\hat\omega$ と角度 $\theta$ による
**軸角・指数座標**（axis-angle / exponential coordinates）$\omega\theta$ があります。

ベクトル $\omega = (\omega_1, \omega_2, \omega_3)$ に対して歪対称行列を

$$
[\omega] = \begin{bmatrix} 0 & -\omega_3 & \omega_2 \\ \omega_3 & 0 & -\omega_1 \\ -\omega_2 & \omega_1 & 0 \end{bmatrix},
\qquad [\omega]\,v = \omega \times v
$$

と定義します。行列指数関数は軸角を回転に写します（Rodrigues の公式）。

$$
R = e^{[\hat\omega]\theta} = I + \sin\theta\,[\hat\omega] + (1-\cos\theta)\,[\hat\omega]^2 .
$$

歪対称行列の集合は**リー代数**（Lie algebra）$\mathfrak{so}(3)$、すなわち単位元における SO(3) の接空間です。角速度は
ここに住んでいます。$R(t)$ を軌道とすると、$\dot R R^\top = [\omega_s]$ が固定（空間）座標系での角速度、
$R^\top \dot R = [\omega_b]$ が物体座標系での角速度を与えます。

### 剛体運動：SE(3)

位置 $p$ と姿勢 $R$ を合わせた完全な位置姿勢（pose）は同次変換です。

$$
T = \begin{bmatrix} R & p \\ 0 & 1 \end{bmatrix} \in SE(3), \qquad
T^{-1} = \begin{bmatrix} R^\top & -R^\top p \\ 0 & 1 \end{bmatrix}.
$$

これはグラフィックスの 4x4 モデル行列そのものです。多くのバグを防ぐ記法として、$T_{ab}$ を「座標系 $a$ で表した座標系 $b$ の
位置姿勢」と書きましょう。すると合成はドミノのようにつながります。

$$
T_{ac} = T_{ab}\,T_{bc}, \qquad p_a = T_{ab}\, p_b \;\text{(in homogeneous coordinates)}.
$$

ロボットの「シーングラフ」全体（ワールド、ベース、各リンク、カメラ、グリッパ、物体）は、こうした変換の木構造です。
たとえばハンドアイキャリブレーション（hand-eye calibration）は、固定の変換 $T_{\text{gripper},\text{camera}}$ を推定する問題です。

### ツイストとスクリュー

剛体の速度は**ツイスト**（twist）$\mathcal{V} = (\omega, v) \in \mathbb{R}^6$ で、
$[\mathcal{V}] = \begin{bmatrix}[\omega] & v\\0&0\end{bmatrix} \in \mathfrak{se}(3)$ と書きます。Chasles の定理によれば、
あらゆる剛体運動はある軸まわりの回転とその軸に沿った並進の組み合わせ、すなわち**スクリュー運動**（screw motion）です。
指数写像 $T = e^{[\mathcal{S}]\theta}$ は単位スクリュー軸 $\mathcal{S}$ と距離 $\theta$ を SE(3) の元に変換します。これが
*Modern Robotics* 全体で使われる指数積（product of exponentials, PoE）公式の基礎です。ツイストの双対は**レンチ**（wrench）
$\mathcal{F} = (m, f)$（モーメントと力）で、仕事率は $\mathcal{F}^\top\mathcal{V}$ です。

学習を研究する人がなぜ気にすべきなのでしょうか。行動空間（action space）が位置姿勢だからです。ネットワークで回転を
予測するには表現を選ぶ必要があります。オイラー角には不連続性があり、クォータニオンには $q \equiv -q$ の曖昧さがあります。
Zhou ら（CVPR 2019）は、連続な 6 次元表現（$R$ の 2 列を予測して直交化し直すもの）のほうが回帰しやすいことを示しました。
多くの方策（たとえば第 4 回の Diffusion Policy）がこれを使っています。

## 2. 順運動学

シリアルマニピュレータ（serial manipulator）は、関節でつながれたリンクの鎖で、関節は通常、回転関節（R）か直動関節（P）
です。**関節構成**（configuration）は関節変数のベクトル $q \in \mathbb{R}^n$ で、そのすべての集合を構成空間（C-space）と
呼びます。**順運動学**（forward kinematics, FK）は $q$ をエンドエフェクタの位置姿勢に写します。

$$
T_{0n}(q) = T_{01}(q_1)\,T_{12}(q_2)\cdots T_{n-1,n}(q_n).
$$

### Denavit-Hartenberg パラメータ

Denavit と Hartenberg（1955）は、座標系をうまく配置すれば各リンクの変換は 4 つの数で済むことを示しました。
**標準 DH 記法**では $z_i$ 軸を関節 $i+1$ の軸とし、

$$
T_{i-1,i} = \mathrm{Rot}_z(\theta_i)\,\mathrm{Trans}_z(d_i)\,\mathrm{Trans}_x(a_i)\,\mathrm{Rot}_x(\alpha_i)
= \begin{bmatrix}
\cos\theta_i & -\sin\theta_i\cos\alpha_i & \sin\theta_i\sin\alpha_i & a_i\cos\theta_i\\
\sin\theta_i & \cos\theta_i\cos\alpha_i & -\cos\theta_i\sin\alpha_i & a_i\sin\theta_i\\
0 & \sin\alpha_i & \cos\alpha_i & d_i\\
0&0&0&1
\end{bmatrix}
$$

となります。

| パラメータ | 意味 |
| --- | --- |
| $a_i$ | リンク長：$x_i$ 方向に測った $z_{i-1}$ と $z_i$ の距離 |
| $\alpha_i$ | リンクのねじれ角：$x_i$ まわりに $z_{i-1}$ から $z_i$ へ回る角度 |
| $d_i$ | リンクオフセット：$z_{i-1}$ 方向の距離（直動関節では変数） |
| $\theta_i$ | $z_{i-1}$ まわりの関節角（回転関節では変数） |

注意：**修正 DH**（modified DH、Craig）記法もあり、たとえば Franka Emika のドキュメントで使われています。4 つの基本変換の
順序が異なるため、両者を混ぜるのは典型的なバグの原因です。実際にはロボットは URDF や MJCF ファイル（第 3 回）で記述され、
関節ごとに完全な変換が保存されており、Pinocchio、Drake、MuJoCo、PyBullet などのライブラリが FK を計算してくれます。
それでも DH は構造を明示してくれ、多くの教科書やデータシートが運動学をこの形で示すので、知っておく価値があります。

### 平面 3 リンクアームを NumPy で

平面アームではすべての $\alpha_i = d_i = 0$ なので、各 DH 変換は $q_i$ の回転の後に新しい $x$ 軸方向へ $a_i$ 並進するだけです。
絶対角を $c_i = q_1 + \dots + q_i$ とすると、エンドエフェクタは

$$
p_x = \sum_i a_i\cos c_i,\qquad p_y = \sum_i a_i \sin c_i,\qquad \phi = c_n
$$

です。

```python
import numpy as np

def dh(a, alpha, d, theta):
    """Standard DH transform: Rot_z(theta) Trans_z(d) Trans_x(a) Rot_x(alpha)."""
    ct, st, ca, sa = np.cos(theta), np.sin(theta), np.cos(alpha), np.sin(alpha)
    return np.array([[ct, -st * ca,  st * sa, a * ct],
                     [st,  ct * ca, -ct * sa, a * st],
                     [0.0,     sa,       ca,      d],
                     [0.0,    0.0,      0.0,    1.0]])

LINKS = np.array([1.0, 0.8, 0.5])          # link lengths of a planar 3R arm

def fk(q, links=LINKS):
    """Forward kinematics: returns the 4x4 pose of the end effector and all joint positions."""
    T = np.eye(4)
    pts = [T[:3, 3].copy()]
    for a, theta in zip(links, q):
        T = T @ dh(a, 0.0, 0.0, theta)     # planar arm: alpha = d = 0
        pts.append(T[:3, 3].copy())
    return T, np.array(pts)

def task(q):
    """Task-space coordinates x = (px, py, phi) of the end effector."""
    T, _ = fk(q)
    return np.array([T[0, 3], T[1, 3], np.arctan2(T[1, 0], T[0, 0])])
```

`pts` にはすべての関節位置が入っているので、matplotlib でアームを描くにはこれだけで十分です。

## 3. ヤコビアンと微分運動学

FK は非線形ですが、その微分は関節速度について線形です。

$$
\dot x = J(q)\,\dot q, \qquad J(q) = \frac{\partial x}{\partial q} \in \mathbb{R}^{m\times n}.
$$

平面アーム（$m = n = 3$）では、上の和を微分すれば各列が簡単に求まります。

$$
J_{1i} = -\sum_{k\ge i} a_k \sin c_k,\qquad J_{2i} = \sum_{k\ge i} a_k\cos c_k, \qquad J_{3i} = 1 .
$$

一般の空間アームでは、点 $o_{i-1}$ を通る単位軸 $z_{i-1}$（いずれもベース座標系）をもつ回転関節 $i$ の
**幾何ヤコビアン**（geometric Jacobian）の列は

$$
J_i = \begin{bmatrix} z_{i-1}\times(o_n - o_{i-1}) \\ z_{i-1}\end{bmatrix}
$$

で、上が並進速度、下が角速度です。直動関節は $(z_{i-1}, 0)$ を与えます。（*Modern Robotics* では同じ内容を、スクリュー軸から
作る空間ヤコビアンと物体ヤコビアンで表します。）

ヤコビアンは局所的な振る舞いのほぼすべてを教えてくれます。

- **特異姿勢**（singularity）：$\operatorname{rank} J < m$ となるところでは、エンドエフェクタはある運動方向を失います
  （伸び切った腕はそれ以上外へ動けません）。その近くでは、わずかなデカルト空間の運動に巨大な関節速度が必要になります。
- **可操作度**（manipulability）：吉川の可操作度 $w = \sqrt{\det(JJ^\top)}$ は速度楕円体
  $\lbrace J\dot q : \lVert\dot q\rVert \le 1 \rbrace$ の体積で、楕円体の軸は $J$ の SVD から得られます。
- **静力学**：仮想仕事の原理により、エンドエフェクタのレンチ $\mathcal{F}$ には関節トルク $\tau = J^\top(q)\,\mathcal{F}$ が
  必要です。この 1 行が力制御とインピーダンス制御の基礎です。
- **冗長性**（redundancy）：$n > m$（たとえば 6 次元の位置姿勢に対する 7 自由度アーム）ならヌル空間があり、関節運動
  $(I - J^+J)\,z$ は手を動かさずに肘を動かします。

手で書いたヤコビアンは必ず有限差分で確認しましょう。

```python
def jacobian(q, links=LINKS):
    """Analytic Jacobian d(px, py, phi)/dq of the planar arm."""
    c = np.cumsum(q)                        # absolute link angles
    J = np.zeros((3, len(q)))
    for i in range(len(q)):
        J[0, i] = -np.sum(links[i:] * np.sin(c[i:]))
        J[1, i] = np.sum(links[i:] * np.cos(c[i:]))
        J[2, i] = 1.0
    return J

q = np.array([0.3, -0.5, 0.8])
eps = 1e-6
J_num = np.stack([(task(q + eps * np.eye(3)[i]) - task(q - eps * np.eye(3)[i])) / (2 * eps)
                  for i in range(3)], axis=1)
print("Jacobian error:", np.abs(J_num - jacobian(q)).max())   # ~1e-10
```

## 4. 逆運動学

**逆運動学**（inverse kinematics, IK）は $$x(q) = x^{\ast}$$ を満たす $q$ を求める問題です。解は存在しないことも、有限個のことも、
無限にあることもあります。

### 解析的 IK

単純な、あるいは特別に設計されたアームには閉形式の解があります。$(p_x, p_y)$ に到達する平面 2 リンクアームでは、
余弦定理から

$$
\cos q_2 = \frac{p_x^2 + p_y^2 - a_1^2 - a_2^2}{2a_1a_2},\qquad
q_2 = \pm\arccos(\cdot),\qquad
q_1 = \operatorname{atan2}(p_y, p_x) - \operatorname{atan2}(a_2\sin q_2,\; a_1 + a_2\cos q_2)
$$

が得られます。$\pm$ が「肘上」と「肘下」を選び、$\lvert\cos q_2\rvert > 1$ なら解はありません。**球面手首**（spherical wrist、
最後の 3 軸が 1 点で交わる）をもつ産業用 6 自由度アームは、位置の問題と姿勢の問題に分離でき（Pieper の条件）、
最大 8 組の解析解をもちます。IKFast（OpenRAVE）のようなツールはこうしたソルバを自動生成します。

### 数値的 IK：ニュートン法、ヤコビアン転置、擬似逆行列

一般のアームでは反復計算をします。現在の $q$ のまわりで線形化すると $$x^{\ast} - x(q) \approx J\,\Delta q$$ です。選択肢は次のとおりです。

- **ヤコビアン転置**：$\Delta q = \alpha J^\top e$。計算が安く、$\tfrac12\lVert e\rVert^2$ に対して常に降下方向ですが、遅いです。
- **擬似逆行列（ガウス・ニュートン）**：横長の $J$ に対して $\Delta q = J^+ e$、$J^+ = J^\top(JJ^\top)^{-1}$。解の近くでは速いですが、
  $J^+$ に $1/\sigma_i$ の項があるため特異姿勢の近くで発散します。
- **減衰最小二乗法**（damped least squares, DLS、Levenberg-Marquardt）：
  $\lVert J\Delta q - e\rVert^2 + \lambda^2\lVert\Delta q\rVert^2$ を最小化すると

$$
\Delta q = J^\top\left(JJ^\top + \lambda^2 I\right)^{-1} e
= \sum_i \frac{\sigma_i}{\sigma_i^2 + \lambda^2}\, v_i u_i^\top e
$$

となります。

SVD の形を見ると、DLS が頑健な理由がわかります（Nakamura と Hanafusa 1986、Wampler 1986）。$\sigma_i \gg \lambda$ の方向は
擬似逆行列のように振る舞い、$\sigma_i \to 0$ の方向は発散せずにゼロへ減衰されます。代償は収束の遅さと小さなバイアスです。

```python
def wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi

def ik_dls(x_goal, q0, lam=0.05, iters=200, tol=1e-6):
    """Damped least-squares IK: dq = J^T (J J^T + lam^2 I)^-1 e."""
    q = q0.astype(float).copy()
    for k in range(iters):
        e = x_goal - task(q)
        e[2] = wrap(e[2])                   # angle error must be wrapped
        if np.linalg.norm(e) < tol:
            break
        J = jacobian(q)
        dq = J.T @ np.linalg.solve(J @ J.T + lam**2 * np.eye(3), e)
        q += dq
    return q, k, np.linalg.norm(e)

x_goal = np.array([1.2, 0.9, np.pi / 4])
q_sol, n, err = ik_dls(x_goal, np.zeros(3))
print(np.round(q_sol, 4), n, err)           # converges in ~8 iterations, residual ~1e-7
print(np.round(task(q_sol), 4))             # [1.2, 0.9, 0.7854]

# unreachable target (total reach is 2.3): with lam=0.5 the arm stretches toward it,
# residual 0.7 = the best achievable. With lam=0.05 the iteration oscillates near the singularity.
q_far, n, err = ik_dls(np.array([3.0, 0.0, 0.0]), np.array([0.1, 0.1, 0.1]), lam=0.5, iters=500)
print(err)                                  # 0.7
```

最後の呼び出しを `lam=0.05` にして試してみてください。伸び切ったアームは特異姿勢にあり、減衰の弱いステップが行き過ぎるため、
反復はさまよい続け、残差は数単位にもなります。実用的な IK ソルバは、DLS に適応的な減衰、ステップ幅の制限、関節限界、
ヌル空間での副次目標を組み合わせます。現代的な定式化では、制御周期ごとに小さな**二次計画問題**（quadratic program, QP）、
たとえば「関節の位置・速度制限のもとでタスク誤差を最小化する」問題を、Pink、mink、Drake などのライブラリで解きます。

## 5. 動力学をちょっとだけ

運動学は力を無視しています。$n$ 関節の剛体系の運動方程式は

$$
M(q)\,\ddot q + C(q,\dot q)\,\dot q + g(q) = \tau + J(q)^\top \mathcal{F}_{\text{ext}}
$$

です。ここで $M(q)$ は対称正定値の**慣性行列**（mass matrix）、$C\dot q$ はコリオリ力と遠心力の項、$g(q)$ は重力項、$\tau$ は
関節トルク、$$\mathcal{F}_{\text{ext}}$$ は外部レンチ（接触力など）です。これらはラグランジアン
$L = \tfrac12 \dot q^\top M(q)\dot q - V(q)$ のオイラー・ラグランジュ方程式から得られます。標準的な問題は 2 つです。

- **逆動力学**（inverse dynamics）：$q, \dot q, \ddot q$ から $\tau$ を求める。再帰的ニュートン・オイラー法（RNEA）で $O(n)$ です。
- **順動力学**（forward dynamics）：$\tau$ から $\ddot q = M^{-1}(\tau - C\dot q - g)$ を求める。多関節体アルゴリズム（ABA）も
  $O(n)$ です（Featherstone 2008）。

制御設計を可能にする構造的な性質が 2 つあります。$M(q)$ が正定値であること、そして $C$ を適切に選ぶと $\dot M - 2C$ が
歪対称になること（受動性、passivity）です。接触、摩擦、アクチュエータの制限があると実際の動力学ははるかに難しくなります。
それは第 3 回で扱う物理エンジンの仕事です。

## 6. 制御

制御器は目標軌道をトルクに変換します。ロボット上では通常 0.5〜1 kHz で動き、学習された方策はその上で 5〜50 Hz で動きます。
方策がどの層に指令を出しているか（関節位置目標、関節速度、エンドエフェクタの位置姿勢、トルク）を把握することは、
シミュレーションから実機への転移にとって非常に重要です。

### PID と重力補償付き PD

主力は各関節の PID 制御です。

$$
\tau = K_p\, e + K_i \int_0^t e\, dt' - K_d\,\dot q, \qquad e = q_{\text{ref}} - q .
$$

比例項はばね、微分項はダンパとして働き、積分項は重力のような一定外乱による定常偏差を取り除きます。モデルをもっとうまく
使う方法が**重力補償付き PD**、$\tau = K_p e - K_d\dot q + g(q)$ で、一定の目標に対して大域的漸近安定です（Takegaki と
Arimoto 1981）。1 関節の振り子で違いがはっきりわかります。

```python
import numpy as np

# 1-DoF pendulum joint: I*qdd + b*qd + m*g*l*sin(q) = tau
I, b, m, g, l = 0.5, 0.1, 1.0, 9.81, 0.5
dt, T = 1e-3, 3.0

def simulate(Kp, Kd, Ki, gravity_comp, q_ref=np.pi / 3):
    q, qd, integ = 0.0, 0.0, 0.0
    for _ in range(int(T / dt)):
        e = q_ref - q
        integ += e * dt
        tau = Kp * e - Kd * qd + Ki * integ
        if gravity_comp:
            tau += m * g * l * np.sin(q)      # feed-forward model term
        qdd = (tau - b * qd - m * g * l * np.sin(q)) / I
        qd += qdd * dt                        # semi-implicit Euler
        q += qd * dt
    return q_ref - q

print("PD only        error %.4f rad" % simulate(20, 3, 0, False))   # 0.1861
print("PID            error %.4f rad" % simulate(20, 3, 30, False))  # 0.0000
print("PD + gravity   error %.4f rad" % simulate(20, 3, 0, True))    # -0.0001
```

純粋な PD では、ばねが重さを支えなければならないため約 0.19 rad 垂れ下がります。積分項か重力モデルがこの誤差を消します。
脚ロボットの RL 方策（第 2 回）は、ほとんどの場合トルクを直接出すのではなく、このような PD ループへ**関節位置目標**を
出力します。そのため PD ゲインも「行動空間」の一部になります。

### 計算トルク法と操作空間制御

モデルが十分に良ければ、非線形な動力学を打ち消して線形な誤差ダイナミクスを課すことができます（**計算トルク法**、
computed torque、つまりフィードバック線形化）。

$$
\tau = M(q)\left(\ddot q_{\text{ref}} + K_d\dot e + K_p e\right) + C\dot q + g .
$$

Khatib の**操作空間法**（operational-space formulation、1987）はこれをタスク空間で行います。タスク空間の慣性
$\Lambda(q) = (J M^{-1} J^\top)^{-1}$ を使うと、エンドエフェクタは質量 $\Lambda$ の物体のように振る舞い、

$$
\tau = J^\top\left(\Lambda\,\ddot x_{\text{cmd}} + \mu + p\right) + \left(I - J^\top \bar J^{\top}\right)\tau_0,
\qquad \bar J = M^{-1}J^\top\Lambda
$$

となります。$\mu, p$ はタスク空間のコリオリ項と重力項、$\tau_0$ は動力学的に整合したヌル空間に射影された副次目標
（たとえば肘を休止姿勢の近くに保つ）です。

### インピーダンス制御

Hogan の**インピーダンス制御**（impedance control、1985）は位置を硬く追従しようとはせず、エンドエフェクタを目標のまわりで
質量・ばね・ダンパ系のように振る舞わせます。

$$
\Lambda_d\,\ddot{\tilde x} + D_d\,\dot{\tilde x} + K_d\,\tilde x = \mathcal{F}_{\text{ext}},\qquad \tilde x = x - x_d .
$$

最も単純な実装では目標慣性を無視し、静力学の関係 $\tau = J^\top\mathcal{F}$ を使って
$\tau = J^\top\left(K_d (x_d - x) - D_d\,\dot x\right) + g(q)$ を出力します。剛性が低ければ柔らかく安全な接触（拭き取り、
挿入、人との相互作用）が、剛性が高ければ正確な追従が得られます。学習されたマニピュレーション方策の多くは、10〜20 Hz で
目標位置姿勢 $x_d$ を 1 kHz のデカルト空間インピーダンス制御器に送ります。剛性まで予測するもの（「可変インピーダンス」、
variable impedance）もあります。

## 7. 動作計画

動作計画は、C-space の中で $q_{\text{start}}$ から $q_{\text{goal}}$ までの衝突のない経路を見つけます。作業空間の障害物は
関節空間では複雑な「C 障害物」になるので、計画器は自由空間を明示的に作るのではなく、衝突判定器（FK を計算してメッシュ同士の
判定を行うもので、レイトレーシングと同じ BVH の仕組みを使います）に問い合わせます。

### グラフ探索：A*

離散化された C-space（グリッドやラティス）上で、**A\***（Hart、Nilsson、Raphael 1968）は $f(n) = g(n) + h(n)$、つまり
これまでのコストと残りコストのヒューリスティック推定の和の順にノードを展開します。$h$ が**許容的**（admissible、決して過大
評価しない）なら A\* は最適経路を返し、さらに**無矛盾**（consistent、$$h(n) \le c(n,n') + h(n')$$）なら、どのノードも再展開する
必要がありません。Dijkstra 法は $h = 0$ の A\* です。グリッドは次元に対して指数的に大きくなるため、A\* は 2 次元・3 次元の
移動ロボット、足場計画、離散ラティスに使われ、7 自由度アームには使われません。

### サンプリングベースの計画：PRM、RRT、RRT\*

サンプリングベースの計画器は離散化を避けます。**PRM**（Kavraki ら 1996）は衝突のない構成を多数サンプルし、近いもの同士を
つないで、クエリにはグラフ探索で答えます。**RRT**（LaValle 1998）はスタートから木を成長させます。$x_{\text{rand}}$ をサンプルし、
木の中で最も近いノードを見つけ、サンプルに向かって一定距離進み、そのエッジに衝突がなければ新しいノードを追加します。
この手続きのボロノイバイアスが、木を未探索の空間へ引っ張ります。RRT は**確率的完全**（経路が存在すれば見つかる確率が 1 に
近づく）ですが、最適ではありません。**RRT\***（Karaman と Frazzoli 2011）は 2 つのステップを加えます。縮小していく半径
$r_n \propto (\log n / n)^{1/d}$ の中で最良の親を選ぶことと、新しいノードを経由するように近傍を**つなぎ替える**（rewire）
ことで、これにより漸近的最適性が得られます。

```python
import numpy as np

rng = np.random.default_rng(0)
OBST = [(np.array([0.5, 0.5]), 0.2), (np.array([0.25, 0.8]), 0.12)]   # circles (center, radius)

def free(p):
    return all(np.linalg.norm(p - c) > r for c, r in OBST)

def edge_free(a, b, n=20):
    return all(free(a + t * (b - a)) for t in np.linspace(0, 1, n))

def rrt(start, goal, step=0.05, iters=5000, goal_bias=0.1):
    nodes, parent = [start], [-1]
    for _ in range(iters):
        x_rand = goal if rng.random() < goal_bias else rng.random(2)   # sample in [0,1]^2
        i = int(np.argmin([np.linalg.norm(n - x_rand) for n in nodes]))
        d = x_rand - nodes[i]
        x_new = nodes[i] + d * min(1.0, step / (np.linalg.norm(d) + 1e-12))  # steer
        if not edge_free(nodes[i], x_new):
            continue
        nodes.append(x_new); parent.append(i)
        if np.linalg.norm(x_new - goal) < step and edge_free(x_new, goal):
            nodes.append(goal); parent.append(len(nodes) - 2)
            path, j = [], len(nodes) - 1
            while j != -1:
                path.append(nodes[j]); j = parent[j]
            return np.array(path[::-1]), len(nodes)
    return None, len(nodes)

path, n = rrt(np.array([0.1, 0.1]), np.array([0.9, 0.9]))
print(f"tree size {n}, path waypoints {len(path)}, "
      f"length {np.sum(np.linalg.norm(np.diff(path, axis=0), axis=1)):.3f}")
```

点ではなく 3 リンクアームのために計画するには、サンプル空間を $[-\pi,\pi]^3$ に、`free(q)` を「リンクの FK を計算して各線分を
障害物と判定する」ものに置き換えます。RRT の経路はギザギザなので、実際のシステムではショートカットと平滑化を行い、
速度・加速度制限のもとで時間パラメータ化します（例：TOPP-RA）。CHOMP（Ratliff ら 2009）や TrajOpt（Schulman ら 2013）の
ような**軌道最適化**（trajectory optimization）手法は、軌道全体を滑らかさと衝突コストについて最適化します。NVIDIA cuRobo の
ような GPU 並列の計画器は、計画時間をミリ秒単位にまで縮めています。

### 学習はどこに入ってくるか

| 古典的なブロック | 学習による置き換え・拡張（以降の記事） |
| --- | --- |
| 手設計の制御器 | PD 目標を出力する RL 方策（第 2 回） |
| 解析モデル | ドメインランダム化付きシミュレータ、または学習された世界モデル（第 3 回、第 5 回） |
| 計画器 + コスト関数 | デモンストレーションを模倣する方策、例：ACT、Diffusion Policy（第 4 回） |
| コードで書くタスク仕様 | VLA モデルへの言語指示（第 5 回） |

学習によって下位の層がなくなることはほとんどありません。OpenVLA や pi0 の方策も、目標を IK ソルバとインピーダンス制御器や
PD 制御器に送っています。これらの層を理解していることが、「シミュレーションでは動くのに実機では震える」方策をデバッグする
方法です。

## 試してみよう

ホームページの **[Lab]({{ '/' | relative_url }}#lab)** には XPBD の布のデモがあります。位置ベース動力学は位置を射影することで
拘束を解きますが、これは上の IK の反復がアームを「目標に届く」という拘束に射影するのとよく似ています。布の粒子をドラッグ
することは、文字どおり非常に冗長な鎖の IK 問題です。`ik_dls` を JavaScript に移植して、canvas 上で 3 リンクアームの先端を
ドラッグできるようにするのは良い練習になります。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Denavit and Hartenberg, *A kinematic notation for lower-pair mechanisms based on matrices* | J. Applied Mechanics | 1955 | [DOI](https://doi.org/10.1115/1.4011045) | DH 記法 |
| Hart, Nilsson, Raphael, *A formal basis for the heuristic determination of minimum cost paths* | IEEE Trans. SSC | 1968 | [DOI](https://doi.org/10.1109/TSSC.1968.300136) | A* 探索 |
| Hogan, *Impedance control: an approach to manipulation, Part I* | J. Dyn. Sys., Meas., Control | 1985 | [DOI](https://doi.org/10.1115/1.3140702) | インピーダンス制御 |
| Nakamura and Hanafusa, *Inverse kinematic solutions with singularity robustness for robot manipulator control* | J. Dyn. Sys., Meas., Control | 1986 | - | 減衰最小二乗 IK |
| Khatib, *A unified approach for motion and force control of robot manipulators: the operational space formulation* | IEEE J. Robotics and Automation | 1987 | [DOI](https://doi.org/10.1109/JRA.1987.1087068) | 操作空間制御 |
| Kavraki et al., *Probabilistic roadmaps for path planning in high-dimensional configuration spaces* | IEEE Trans. Robotics and Automation | 1996 | [DOI](https://doi.org/10.1109/70.508439) | PRM |
| LaValle, *Rapidly-exploring random trees: a new tool for path planning* | Tech. report, Iowa State | 1998 | - | RRT |
| Karaman and Frazzoli, *Sampling-based algorithms for optimal motion planning* | IJRR | 2011 | [arXiv](https://arxiv.org/abs/1105.1186) | RRT\*、PRM\*、漸近的最適性 |
| Schulman et al., *Finding locally optimal, collision-free trajectories with sequential convex optimization* | RSS | 2013 | [PDF](https://www.roboticsproceedings.org/rss09/p31.pdf) | TrajOpt |
| Zhou et al., *On the continuity of rotation representations in neural networks* | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1812.07035) | 多くの方策が使う 6 次元回転表現 |

## 学習リソース

- K. Lynch、F. Park『*Modern Robotics: Mechanics, Planning, and Control*』（Cambridge University Press, 2017）。無料の PDF、動画、
  コードが[書籍ページ](https://hades.mech.northwestern.edu/index.php/Modern_Robotics)にあります。第 3〜6 章と第 8〜11 章が、
  スクリュー理論を使って本記事の内容を詳しく扱っています。
- R. Tedrake『[*Robotic Manipulation*](https://manipulation.csail.mit.edu)』と
  『[*Underactuated Robotics*](https://underactuated.csail.mit.edu)』。実行可能な Drake のノートブック付きの MIT の講義ノートです。
- S. LaValle『[*Planning Algorithms*](https://lavalle.pl/planning/)』（Cambridge, 2006）。オンラインで無料公開されています。
- R. Featherstone『*Rigid Body Dynamics Algorithms*』（Springer, 2008）。RNEA/ABA について。
- B. Siciliano、L. Sciavicco、L. Villani、G. Oriolo『*Robotics: Modelling, Planning and Control*』（Springer, 2009）。
- コード：[Pinocchio](https://github.com/stack-of-tasks/pinocchio)（高速な剛体動力学）、
  [Drake](https://drake.mit.edu)、[OMPL](https://ompl.kavrakilab.org)（サンプリングベースの計画器）、
  [Peter Corke の Robotics Toolbox for Python](https://github.com/petercorke/robotics-toolbox-python)。

## 演習

1. 上の 2 リンクの解析的 IK を実装し、`fk` で両方の肘の解を確かめましょう。
2. DH 表で与えられた 3 次元アームの幾何ヤコビアンを書き、有限差分で検証しましょう。平面アームの可操作度
   $\sqrt{\det JJ^\top}$ を作業空間上にプロットしましょう。
3. `ik_dls` に関節限界を加えましょう。まずクランプで、次に関節を可動域の中央へ押すヌル空間項で。ランダムな目標に到達できる
   頻度を比べましょう。
4. 振り子の例を $M(q)$ をもつ 2 リンクアームに拡張し、リンク質量に 10% の誤差があるときの PD、PID、計算トルク法を比べましょう。
5. `rrt` を RRT\*（親の選択とつなぎ替え）に改造し、経路長をサンプル数に対してプロットしましょう。

**次回：**[ロボットのための強化学習]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})。
制御器は設計するものから、学習するものへと変わります。
