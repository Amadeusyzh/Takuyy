---
layout: post
title: "Animation and characters: splines, rotations, skinning, IK, motion matching and learned motion"
date: 2026-10-27 09:09:00+0900
description: "Keyframe splines and arc length, slerp and squad, skeletons and forward kinematics, linear blend vs dual quaternion skinning, blendshapes, CCD and FABRIK, motion capture and SMPL, motion matching, physics-based characters trained with RL, and generative motion, with NumPy code."
categories: graphics
tags: [animation, splines, quaternions, skinning, inverse-kinematics, motion-matching, character-control]
series: graphics
series_order: 9
toc:
  sidebar: left
related_posts: false
---

## Why this matters

[Geometry processing]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) gave us meshes. This post makes them move. Character animation drives games, film, VR avatars and telepresence. The same mathematics now drives humanoid robots too. Joint hierarchies and forward kinematics are the [robot kinematics of embodied AI]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }}). Physics-based characters trained with [reinforcement learning]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }}) became the motion trackers that run on real humanoids in 2025-2026. And [avatars in XR]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }}) are skinned, retargeted characters.

We go from keyframes to learned motion. Splines interpolate values over time. Quaternions interpolate rotations. A skeleton and its skin deform a mesh. Inverse kinematics places hands and feet. Capture and retargeting bring in real motion, and data-driven, physics-based and generative methods produce new motion.

## Prerequisites

- Matrices, homogeneous transforms and quaternions, including slerp ([post 1]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})).
- Time integration and PD-like constraint forces ([post 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})).
- For the last sections: the basics of RL ([embodied AI 2]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})) and diffusion models ([world models 2]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})).

## 1. Keyframes and splines

An animator sets **keyframes**: values $p_i$ (a position, an angle, a blendshape weight) at times $t_i$. The computer fills in the frames between them, which is called **in-betweening**. Linear interpolation is continuous but has kinks: velocity jumps at every key, and motion looks robotic. Cubic splines fix this.

### Hermite curves

A cubic **Hermite** segment is fixed by its two end values $p_0, p_1$ and two end tangents (velocities) $m_0, m_1$. For a local parameter $t \in [0,1]$,

$$
p(t) = h_{00}(t)\,p_0 + h_{10}(t)\,m_0 + h_{01}(t)\,p_1 + h_{11}(t)\,m_1,
$$

with the **Hermite basis**

$$
h_{00} = 2t^3 - 3t^2 + 1,\quad h_{10} = t^3 - 2t^2 + t,\quad h_{01} = -2t^3 + 3t^2,\quad h_{11} = t^3 - t^2 .
$$

You can derive these. Write $p(t) = a t^3 + b t^2 + c t + d$ and impose $p(0)=p_0$, $p(1)=p_1$, $p'(0)=m_0$, $p'(1)=m_1$. That gives four linear equations for $a, b, c, d$; collect the coefficients of each input. **Worked example** (1D): $p_0 = 0$, $p_1 = 1$. With flat tangents $m_0 = m_1 = 0$, $p(0.5) = h_{01}(0.5) = -0.25 + 0.75 = 0.5$, an ease-in/ease-out curve. With $m_0 = 2$, add $h_{10}(0.5)\cdot 2 = 0.125 \cdot 2 = 0.25$, so $p(0.5) = 0.75$: the curve leaves faster and overshoots the straight line.

### The spline family

The members of the family differ in how they choose the tangents, or equivalently in which basis they use:

- **Bézier**: control points $c_0..c_3$, with $p(t) = \sum_k \binom{3}{k}(1-t)^{3-k}t^k c_k$. The curve passes through $c_0$ and $c_3$, and the tangents are $m_0 = 3(c_1 - c_0)$ and $m_1 = 3(c_3 - c_2)$. The animator drags the handles $c_1, c_2$ directly; this is the curve editor of every DCC tool.
- **Catmull–Rom** (Catmull and Rom 1974): a Hermite spline through every key, with automatic tangents $m_i = \frac{p_{i+1} - p_{i-1}}{2}$ (uniform key spacing). It interpolates and is $C^1$.
- **Uniform cubic B-spline**: segment $i$ blends four consecutive control points with the basis $b_0 = \frac{(1-t)^3}{6}$, $b_1 = \frac{3t^3 - 6t^2 + 4}{6}$, $b_2 = \frac{-3t^3 + 3t^2 + 3t + 1}{6}$, $b_3 = \frac{t^3}{6}$. It is $C^2$, so accelerations are continuous too, but it does not pass through its control points. It is the curve that [subdivision]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }}) converges to.

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

{% include blog_figure.liquid path="assets/img/blog/graphics/09-spline-family.svg" caption="Left: four interpolants built from the same seven points. Linear (dashed) has kinks; Catmull–Rom (purple) passes through every key smoothly; two cubic Béziers pass only through $P_0$, $P_3$ and $P_6$ and use the others as handles; the uniform cubic B-spline (green) is the smoothest but passes through none of them. Middle and right: the basis functions. The B-spline basis is non-negative and sums to 1, so the curve stays in the convex hull of its control points; the Hermite tangent bases $h_{10}$ and $h_{11}$ start and end at zero." %}

### Continuity: $C^1$ versus $G^1$

Where two segments meet, **$C^k$ continuity** means that the first $k$ derivatives with respect to the parameter agree. **Geometric continuity $G^1$** only asks that the tangent *directions* agree: the curve has no visible corner, but the speed can jump. For a path that an object follows over time, that difference matters. A $G^1$ joint looks smooth as a drawing but gives a velocity jump, which shows as a visible hitch in the motion. In the Bézier picture: $C^1$ needs $c_1' - c_3 = c_3 - c_2$ (handles collinear *and* of equal length), while $G^1$ only needs them collinear.

{% include blog_figure.liquid path="assets/img/blog/graphics/09-continuity.svg" caption="Two cubic Bézier segments meeting at $(3,0)$, with three choices for the first handle of the second segment. Red: not collinear, so the curve has a corner ($C^0$). Orange: collinear but shorter ($G^1$): the curve looks smooth, but the speed plot on the right jumps at $u=1$. Purple: mirrored handle ($C^1$): no jump. Only the purple version would move an object without a hitch." %}

### Arc-length reparameterization

The parameter $t$ of a spline is not distance. Equal steps in $t$ give unequal steps along the curve, so a camera or a character moving with uniform $t$ speeds up and slows down at random. The fix is to **reparameterize by arc length**

$$
s(t) = \int_0^t \lVert p'(u)\rVert\, du,
$$

and to move with uniform $s$ instead. There is rarely a closed form, so in practice we tabulate $s$ at many values of $t$ and invert the table by interpolation (or by Newton's method on $s(t) - s^* = 0$, using $s'(t) = \lVert p'(t)\rVert$):

```python
import numpy as np

def bezier(c, t):
    t = np.atleast_1d(t)[:, None]
    return (1 - t)**3 * c[0] + 3 * (1 - t)**2 * t * c[1] + 3 * (1 - t) * t**2 * c[2] + t**3 * c[3]

c = np.array([[0, 0], [0.3, 2.4], [3.4, 2.4], [4, 0]], float)
t_tab = np.linspace(0, 1, 2000)
pts = bezier(c, t_tab)
s_tab = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]   # s(t) table
L = s_tab[-1]

def point_at_distance(s):
    return bezier(c, np.interp(s, s_tab, t_tab))           # invert s(t) by interpolation

even = point_at_distance(np.linspace(0, L, 17))
gaps = np.linalg.norm(np.diff(even, axis=0), axis=1)
print(f"length {L:.3f}, gap spread {gaps.min():.3f}..{gaps.max():.3f}")   # nearly equal gaps
```

{% include blog_figure.liquid path="assets/img/blog/graphics/09-arc-length.svg" caption="Left: 17 points at uniform $t$ (orange circles) bunch up where the curve is slow, near the ends; 17 points at uniform arc length (purple squares, drawn slightly lower so both rows are visible) are evenly spaced. Right: the arc-length table $s(t)/L$; the thin lines show how each evenly spaced value of $s$ is mapped back to its $t$." %}

## 2. Rotations over time

[Post 1]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }}) introduced unit quaternions $q$ and **slerp**, the constant-speed great-circle interpolation between two orientations:

$$
\mathrm{slerp}(q_0, q_1; t) = q_0\,(q_0^{-1}q_1)^t = q_0 \exp\!\big(t \log(q_0^{-1} q_1)\big).
$$

Here, for a unit quaternion $q = (\cos\phi, \sin\phi\,\hat{\mathbf{n}})$, which rotates by $2\phi$ about $\hat{\mathbf{n}}$, the **logarithm** is the pure quaternion $\log q = (0, \phi\,\hat{\mathbf{n}})$, and $\exp$ is its inverse. Always pick the sign of $q_1$ that makes $q_0\cdot q_1 \ge 0$, because $q$ and $-q$ are the same rotation, and the wrong sign takes the long way round.

**nlerp** (normalized linear interpolation), $\frac{(1-t)q_0 + t q_1}{\lVert\cdot\rVert}$, follows the same great-circle path, but its speed is not constant: it is faster in the middle. It is cheap, commutative, and it blends more than two rotations easily. That is why skinning (Section 4) and animation blending use it, while slerp is used when constant speed matters.

### The exponential map and angular velocity

The logarithm turns a rotation into a vector: $\mathbf{r} = 2\log q$ is the **rotation vector** (axis times angle), the **exponential map** of $SO(3)$. Rotation vectors are a good place to do calculus. The angular velocity $\boldsymbol\omega$ of a moving orientation $q(t)$, in body coordinates, is

$$
(0, \boldsymbol\omega) = 2\,q^{-1}\dot q .
$$

For slerp, $q^{-1}\dot q = \log(q_0^{-1}q_1)$ is constant, so the angular velocity is constant, with magnitude equal to the total angle between the keys per unit time. It also lets us measure angular velocity from samples: $\lVert\boldsymbol\omega\rVert \approx 2\lVert\log(q(t)^{-1}q(t+\Delta t))\rVert / \Delta t$.

### Piecewise slerp is not $C^1$; squad is

Slerp through several keys $q_0, q_1, q_2, \dots$, one segment at a time, is the rotational analogue of linear interpolation. Inside each segment the angular velocity is constant, so it changes abruptly at every key, in both direction and magnitude. **Squad** (spherical quadrangle interpolation, Shoemake 1985) is the rotational analogue of a cubic Hermite or Bézier curve. It nests slerps the way de Casteljau's algorithm nests linear interpolations:

$$
\mathrm{squad}(q_i, q_{i+1}, s_i, s_{i+1}; h) = \mathrm{slerp}\big(\mathrm{slerp}(q_i, q_{i+1}; h),\ \mathrm{slerp}(s_i, s_{i+1}; h);\ 2h(1-h)\big),
$$

with inner control quaternions chosen so that the tangents match at each key:

$$
s_i = q_i \exp\!\Big(-\frac{\log(q_i^{-1}q_{i+1}) + \log(q_i^{-1}q_{i-1})}{4}\Big).
$$

Differentiating at $h = 0$ shows that the tangent at $q_i$ is $\frac12\big(\log(q_i^{-1}q_{i+1}) - \log(q_i^{-1}q_{i-1})\big)$, the same from both sides. That is the quaternion version of the Catmull–Rom tangent $\frac{p_{i+1}-p_{i-1}}{2}$, valid for uniformly spaced keys.

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

{% include blog_figure.liquid path="assets/img/blog/graphics/09-squad.svg" caption="Six key orientations $q_0..q_5$, shown by where each rotates the $z$ axis (black dots on the unit sphere). Left: piecewise slerp (orange) follows great-circle arcs with a corner at every key; squad (purple) passes through the same keys smoothly. Right: angular speed measured from the samples. Slerp's is constant within each interval and jumps at each key (dotted lines); squad's varies continuously through the keys." %}

In production, animation curves are often stored per channel. Euler angles are interpolated separately, which is simple but can gimbal-lock. Quaternion curves are usually resampled at every frame, and the engine nlerps between neighboring frames.

## 3. Skeletons and forward kinematics

A **skeleton** (rig) is a tree of joints. Each joint $j$ has a parent $p(j)$, a fixed **offset** $\mathbf{o}_j$ from its parent (the bone, in the parent's frame), and an animated **local rotation** $\mathbf{R}_j$ (plus a translation for the root, and sometimes a scale). Its local transform is

$$
\mathbf{T}_j^{\text{local}} = \begin{pmatrix}\mathbf{R}_j & \mathbf{o}_j\\ \mathbf{0}^\top & 1\end{pmatrix},
$$

and **forward kinematics** (FK) composes the transforms from the root down:

$$
\mathbf{G}_j = \mathbf{G}_{p(j)}\,\mathbf{T}_j^{\text{local}}, \qquad \mathbf{G}_{\text{root}} = \mathbf{T}_{\text{root}}^{\text{local}} .
$$

If joints are stored so that parents come before children, FK is a single loop. The **bind pose** (rest pose, often a T-pose or A-pose) is the pose in which the mesh was modeled; its global transforms $\mathbf{B}_j$ are stored, and their inverses $\mathbf{B}_j^{-1}$, the **inverse bind matrices**, map a vertex from model space into joint $j$'s local frame. This is the same chain of rigid transforms as a robot arm's kinematic chain in [embodied AI 1]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }}). The only difference is that a character's tree branches.

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

With the upper arm rotated by $-90^\circ$ about $y$ (pointing up) and the elbow bent by $90^\circ$ about $z$, the wrist ends up at $(0.18, 0.27, 1.95)$. The shoulder is at $(0.18, 0, 1.65)$, the elbow $0.3$ m above it, and the forearm points along $+y$. Check it by hand: it is three matrix products.

{% include blog_figure.liquid path="assets/img/blog/graphics/09-fk-skeleton.svg" caption="A 17-joint skeleton evaluated with `forward_kinematics`. Each joint draws its local frame ($x$ red, $y$ green, $z$ blue). Left: the bind pose, where all local rotations are the identity and every frame is aligned with the world. Right: a pose set by eleven local rotations. A rotation at the pelvis turns everything below it in the tree, and a knee rotation only moves the shin and foot." %}

## 4. Skinning

The mesh (the "skin") must follow the skeleton. Each vertex $\mathbf{v}$ is attached to a few joints with **skin weights** $w_{j} \ge 0$, $\sum_j w_j = 1$. Artists paint them, or tools compute them, for example from heat diffusion or bounded biharmonic weights.

### Linear blend skinning

**Linear blend skinning** (LBS, also called skeletal subspace deformation; an early form appears in Magnenat-Thalmann et al. 1988) transforms the vertex rigidly with each joint and averages the results:

$$
\mathbf{v}' = \sum_j w_j\, \mathbf{M}_j\,\mathbf{v}, \qquad \mathbf{M}_j = \mathbf{G}_j\,\mathbf{B}_j^{-1}.
$$

$\mathbf{M}_j$ is the **skinning matrix**: undo the bind pose, then apply the current pose. It is one matrix-vector product per influence, so it is cheap and maps well to a vertex shader. Most real-time characters use it.

```python
import numpy as np

def skin_lbs(V, W, Ms):
    """V: (n,3) rest vertices, W: (n,k) weights, Ms: k skinning matrices (4x4)."""
    Vh = np.c_[V, np.ones(len(V))]
    return sum(W[:, j:j + 1] * (Vh @ Ms[j].T)[:, :3] for j in range(len(Ms)))
```

### The candy-wrapper artifact

Averaging matrices is not averaging rotations. Twist a forearm: bone 0 stays still and bone 1 rotates by $\theta$ about the limb axis $x$. A vertex at radius $r$ with weights $w_0, w_1$ goes to

$$
\mathbf{v}' = w_0 \begin{pmatrix}x\\ y\\ z\end{pmatrix} + w_1\begin{pmatrix}x\\ y\cos\theta - z\sin\theta\\ y\sin\theta + z\cos\theta\end{pmatrix}.
$$

In the cross-section plane this is $r\,(w_0 + w_1 e^{i\theta})$ in complex notation, so the new radius is

$$
r' = r\sqrt{w_0^2 + w_1^2 + 2 w_0 w_1 \cos\theta} .
$$

With $w_0 = w_1 = \frac12$: $\theta = 90^\circ$ gives $r' = 0.71\,r$, and $\theta = 180^\circ$ gives $r' = 0$. The limb collapses to a point, like the twisted end of a candy wrapper. Bending causes the same kind of volume loss on the inside of elbows and knees. The cause is that a weighted average of rotation matrices is not a rotation: it contains a scale.

### Dual quaternion skinning

Kavan et al. (2008) blend **unit dual quaternions** instead. A dual quaternion $\hat q = q_r + \varepsilon q_d$, with $\varepsilon^2 = 0$, represents a rigid motion (rotation $q_r$, translation $\mathbf{t}$) when

$$
q_d = \tfrac12\,(0, \mathbf{t})\,q_r, \qquad \mathbf{t} = 2\,\big(q_d\, q_r^{*}\big)_{\text{vec}} .
$$

**Dual quaternion skinning** (DQS) blends the dual quaternions linearly, flipping the signs so that all $q_r$ are in the same hemisphere, and then normalizes by the real part:

$$
\hat b = \sum_j w_j \hat q_j, \qquad \hat q = \frac{\hat b}{\lVert b_r\rVert}, \qquad \mathbf{v}' = q_r\,\mathbf{v}\,q_r^{*} + \mathbf{t}.
$$

The result is always a rigid transform, so the twisted limb keeps its radius. It costs a bit more than LBS, and it can produce a slight bulge near bent joints. Many engines (Unity, Unreal, Maya) offer both.

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

{% include blog_figure.liquid path="assets/img/blog/graphics/09-lbs-dqs.svg" caption="A cylinder skinned to two bones (weights blend smoothly over $0.6\le x\le 1.4$), with the second bone twisted by $160^\circ$ about the limb axis. The stripes show the twist and the color shows radius over rest radius. LBS (left) pinches to a thin neck in the middle; DQS (middle) keeps the radius. Right: ring radius along the limb, with LBS exactly on the formula $\sqrt{w_0^2+w_1^2+2w_0w_1\cos\theta}$; the legend gives the enclosed volume relative to the rest shape." %}

The widget below shows the same thing in 2D for a bend and a twist.

{% include widget.liquid name="graphics-skinning" height="460" caption="A two-bone limb skinned with smooth weights around the joint. Drag the slider (or the end of the limb) to bend, or switch to twist mode for a flat ribbon twisted about its axis. Toggle LBS / DQS / both: the readout shows the minimum width of the skin near the joint relative to its rest width. LBS loses width as the angle grows, and in twist mode it collapses at 180°. DQS keeps the width." %}

### Corrective shapes and beyond

Neither method knows anatomy: muscles bulge, skin slides, elbows crease. Production rigs add **corrective blendshapes**: sculpted offsets that are triggered by joint angles. **Pose space deformation** (Lewis et al. 2000) interpolates such corrections over pose space with radial basis functions, and SMPL (Section 7) learns them from scans. Other approaches you will meet: delta mush (smooth, then reapply rest-pose details), implicit skinning (contact-aware), physics layers (jiggle, muscle simulation, cloth from [post 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})), and learned neural skinning.

## 5. Blendshapes and faces

Faces have few bones but rich deformation, so they are mostly animated with **blendshapes** (morph targets). The artist sculpts target meshes $\mathbf{b}_k$ (a smile, a blink, an open jaw) with the same vertex count as the neutral face $\mathbf{b}_0$, and the face is

$$
\mathbf{v}(\mathbf{w}) = \mathbf{b}_0 + \sum_k w_k\,(\mathbf{b}_k - \mathbf{b}_0) = \mathbf{b}_0 + \mathbf{D}\mathbf{w},
$$

a linear model in the weights $w_k$ (usually in $[0,1]$). This **delta** form makes the weights add: smile plus jaw-open is a smiling open mouth. Because the model is linear, solving for weights from tracked points (facial capture) is a small least-squares problem with bounds. Real rigs add **combination shapes**, correctives that turn on with products such as $w_i w_j$ when two targets interfere. The survey by Lewis et al. (2014) covers the theory and practice.

The standard vocabulary for targets is the **Facial Action Coding System** (FACS, Ekman and Friesen 1978). It decomposes expressions into anatomically based *action units* (AU12: lip corner puller, AU26: jaw drop, ...). Production face rigs are organized around FACS shapes. Apple's ARKit face tracking exposes around fifty named coefficients in the same spirit (`jawOpen`, `eyeBlinkLeft`, `mouthSmileLeft`, ...), and they have become a de facto interchange format for avatar faces in VR and streaming. Epic's MetaHuman is the high-end production example: a standardized face and body rig with joint-based controls plus corrective shapes, and MetaHuman Animator, which solves rig controls from captured video of a performer.

{% include blog_figure.liquid path="assets/img/blog/graphics/09-blendshapes.svg" caption="Delta blendshapes on a 2D face with two targets, a smile (lip corners up, eyes squint slightly) and jaw open (lower lip and chin down). From left to right: neutral, each target at full weight, a mix $(0.7, 0.6)$ that simply adds the two offsets, and an extrapolated smile at $w=1.5$, which shows why rigs clamp weights." %}

## 6. Character inverse kinematics

Animators and games constantly need the inverse problem: put the hand *here*, plant the foot *there*. [Embodied AI 1]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }}) derives the general Jacobian-based solvers (pseudo-inverse and damped least squares); here are the three methods that dominate character animation.

### Analytic two-bone IK

An arm or a leg (upper bone $l_1$, lower bone $l_2$) reaching a target at distance $d$ from the root is a triangle. The **law of cosines** gives the interior angle at the elbow or knee,

$$
\cos\gamma = \frac{l_1^2 + l_2^2 - d^2}{2 l_1 l_2}, \qquad \text{bend} = \pi - \gamma,
$$

and the angle between the upper bone and the target direction,

$$
\cos\alpha = \frac{l_1^2 + d^2 - l_2^2}{2 l_1 d}.
$$

The remaining freedom, rotation of the triangle about the root–target axis, is set by a **pole vector** (where the knee should point). **Worked example**: $l_1 = l_2 = 1$ and a target at $(1, 1)$, so $d = \sqrt2$. Then $\cos\gamma = (1 + 1 - 2)/2 = 0$, so $\gamma = 90^\circ$; and $\cos\alpha = (1 + 2 - 1)/(2\sqrt2) = 0.707$, so $\alpha = 45^\circ$. The upper bone points at $45^\circ - 45^\circ = 0^\circ$ (along $x$) and the lower bone straight up: $(1,0) + (0,1) = (1,1)$. If $d > l_1 + l_2$, clamp $d$ and the limb points straight at the target.

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

### CCD and FABRIK

For longer chains (spines, tails, fingers), iterative solvers are simpler than Jacobians and need no matrix inversion.

**Cyclic coordinate descent** (CCD; Wang and Chen 1991) visits the joints from the tip back to the root. At each joint it rotates by the angle that swings the end effector onto the line toward the target. Each step is optimal for one joint, and it converges quickly, but it tends to curl the tip joints first and can produce unnatural poses without joint limits.

**FABRIK** (Forward And Backward Reaching IK; Aristidou and Lasenby 2011) works on joint *positions*. The backward pass puts the end effector on the target and walks to the root, placing each joint at the correct bone length along the line to its previous position. The forward pass pins the root back in place and walks out to the tip the same way. There are no angles and no trigonometry, the motion spreads naturally along the chain, and constraints and multiple end effectors are easy to add.

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
```

{% include blog_figure.liquid path="assets/img/blog/graphics/09-ik-ccd-fabrik.svg" caption="The same four-bone chain (bone lengths 1, 0.8, 0.6, 0.4) reaching for the red star from the same start, after 1, 2, 3 and 20 iterations. CCD (left) swings the outer joints first; FABRIK (middle) distributes the motion along the whole chain. Right: end-effector error per iteration for both on a log scale. Both solvers converge here; how fast depends on the chain and the target." %}

{% include widget.liquid name="graphics-ik-chain" height="440" caption="CCD (purple) and FABRIK (orange) on the four-bone chain of the figure. Drag the red target with the mouse or a finger. The slider sets how many iterations are run from the gray rest pose, and the faint chains show the intermediate iterations. Try targets close to the root and at the edge of the reach circle, and compare how each solver bends the chain and how fast the error drops." %}

**Full-body IK** combines several effectors (two hands, two feet, a look-at for the head) with priorities, joint limits and balance (center of mass over the support polygon). Games use it for foot placement on uneven ground, hands on weapons and doors, and VR avatars. VR is the hard case: three tracked points (headset and two controllers) must produce a plausible whole body, which is underdetermined. Learned priors increasingly fill in the legs.

## 7. Motion capture and retargeting

Hand keying everything is expensive, so most realistic motion is **captured**:

- **Optical marker-based** systems (Vicon, OptiTrack) triangulate retroreflective markers seen by many infrared cameras. They give millimeter accuracy and are the studio standard, but need a stage and cleanup of occlusions and marker swaps.
- **Inertial (IMU) suits** (for example Xsens) integrate gyroscopes and accelerometers on each segment. They work anywhere, but drift in global position.
- **Markerless** capture estimates the body from ordinary video with learned pose estimators. Multi-view setups are now accurate enough for production previs, and monocular methods power the VideoMimic-style robot pipelines of Section 9.

Raw marker or keypoint data is fit to a body model. **SMPL** (Loper et al. 2015) is the standard in vision and learning. It is a skinned mesh whose rest shape and joint locations depend on shape parameters $\boldsymbol\beta$, with pose correctives that depend on the pose $\boldsymbol\theta$ (24 joints, axis-angle):

$$
M(\boldsymbol\beta, \boldsymbol\theta) = \mathrm{LBS}\big(\bar{\mathbf{T}} + B_S(\boldsymbol\beta) + B_P(\boldsymbol\theta),\ J(\boldsymbol\beta),\ \boldsymbol\theta,\ \mathcal{W}\big).
$$

Here $B_S$ is a linear blendshape space of body shapes learned from thousands of scans (Section 5's formula again), $B_P$ is a linear function of the rotation matrices that fixes LBS artifacts (Section 4's correctives, learned), $J$ regresses joint positions from the shaped mesh, and $\mathcal W$ are the skin weights. Everything is differentiable, which is why SMPL (and its successors with hands and faces, SMPL-X) is the output format of most human pose estimators and motion generators.

**Retargeting** transfers motion from one skeleton to another with different proportions, joint counts or rest poses. The basic recipe: map joints by name or semantics; express each source rotation relative to the source rest pose and apply it relative to the target rest pose; scale the root translation by the leg-length ratio; then run IK to restore contacts (feet on the floor, hands on props) that the proportion change broke. Retargeting human motion to **humanoid robots** adds joint limits, different joint axes and physical feasibility. GMR (Araújo et al., arXiv October 2025) shows that retargeting artifacts measurably hurt the RL motion trackers of Section 9 and proposes a cleaner general-purpose retargeter.

## 8. Data-driven animation

Given a large mocap database, how do we drive a game character from a joystick?

**Motion graphs** (Kovar, Gleicher and Pighin 2002) find frames in the database that are similar enough to blend between, add transitions there, and search the resulting graph for paths that follow a requested route. The graph has to be built offline, and responsiveness is limited by where the transitions are.

**Motion matching** (presented by Simon Clavet of Ubisoft at GDC 2016, used in *For Honor* and many games since) drops the graph. Every few frames (say every 0.1 s), build a query feature vector from the current pose and the desired future, and jump to the database frame whose features match best:

$$
i^* = \arg\min_i \sum_k \Big(\frac{f_{i,k} - q_k}{\sigma_k}\Big)^2 .
$$

The features are typically future root positions and directions at a few horizons (for example 0.33, 0.67 and 1 s, in the character's local frame), current foot positions and velocities, and the hip velocity. They are normalized by their standard deviations $\sigma_k$ and weighted by the designer. The pose then switches to the matched clip, and **inertialization** hides the discontinuity by decaying the offset between the old and new poses over a few frames. Search acceleration (KD-trees, bounding boxes, clustering) keeps this cheap.

```python
import numpy as np

def match(F, q, sigma, weights=None):
    """F: (N, d) database features, q: (d,) query. Returns best frame and all costs."""
    w = np.ones(F.shape[1]) if weights is None else weights
    cost = (w * ((F - q) / sigma) ** 2).sum(1)
    return int(np.argmin(cost)), cost
```

{% include blog_figure.liquid path="assets/img/blog/graphics/09-motion-matching.svg" caption="A toy motion-matching search over a synthetic 50 s locomotion database (random turning, walk and run speeds, 30 fps). Features: root positions 1/3, 2/3 and 1 s ahead in the local frame plus current speed. The query asks to run while turning left. Left: the database path (gray), the best-matching frame and its next second of motion (purple), and the desired future placed at that frame (orange): they line up. Middle: the cost of every frame, with the minimum marked. Right: all feature vectors projected on their first two principal components, colored by cost, with the query (star)." %}

**Learned motion matching** (Holden et al. 2020) keeps the behavior of motion matching but replaces the large database with small neural networks. A *decompressor* reconstructs poses from features plus a latent code, a *stepper* advances them in time, and a *projector* replaces the nearest-neighbor search. The memory footprint drops from hundreds of megabytes to a few, which matters on consoles. The **phase-functioned neural network** (PFNN, Holden et al. 2017) is an earlier neural controller: an MLP whose weights are a cyclic spline function of the gait phase. It is trained on terrain-annotated locomotion and maps user control plus terrain heights directly to the next pose.

## 9. Physics-based characters and the bridge to humanoid robots

Kinematic methods can produce motion that violates physics: feet slide, bodies float, and there are no reactions to pushes. **Physics-based characters** are simulated rigid-body skeletons, as in [post 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}). Their joints are driven by torques, usually from **PD controllers** that track target angles:

$$
\boldsymbol\tau = k_p(\mathbf{q}_{\text{target}} - \mathbf{q}) + k_d(\dot{\mathbf{q}}_{\text{target}} - \dot{\mathbf{q}}).
$$

PD alone tracks badly. It needs an error to produce a torque, so gravity makes the limbs sag and fast motions lag. Stiffer gains reduce the error but make the character rigid and the simulation stiff. Adding the reference motion's own inverse-dynamics torques as a feedforward term removes most of the error. A full character is underactuated, though: no motor pushes the root, and balance comes only through contacts. So the feedforward cannot be computed this way, and that is the job a learned policy takes over.

```python
import numpy as np

def pd_step(q, dq, q_ref, dq_ref, kp, kd):
    return kp * (q_ref - q) + kd * (dq_ref - dq)            # joint torques

# inside the simulation loop (see the figure script for the two-link pendulum dynamics):
#   tau = pd_step(q, dq, q_ref(t), dq_ref(t), kp, kd) [+ inverse-dynamics feedforward]
#   ddq = solve(M(q), Q(tau) - c(q, dq) - g(q));  dq += dt * ddq;  q += dt * dq
```

{% include blog_figure.liquid path="assets/img/blog/graphics/09-pd-tracking.svg" caption="A simulated two-link pendulum (1 kg point masses on 0.5 m links, under gravity) tracking a sinusoidal reference with joint PD control, critically damped-style gains $k_d = 2\sqrt{0.3\,k_p}$. Left: the elbow angle. With $k_p=20$ the arm sags and lags far behind; $k_p=500$ follows closely. Right: tracking error on a log scale. Adding the reference motion's inverse-dynamics torques as feedforward (green, only $k_p=100$) gives a smaller error than the stiffest pure PD." %}

**Learning the policy.** **DeepMimic** (Peng et al. 2018) trains a neural policy with RL (PPO) that outputs PD targets at 30 Hz. The reward is for imitating one reference clip: $r = w_p e^{-k_p\sum\lVert q - \hat q\rVert^2} + w_v e^{-k_v\sum\lVert\dot q - \dot{\hat q}\rVert^2} + w_e e^{-k_e\sum\lVert p_e - \hat p_e\rVert^2} + w_c e^{-k_c\lVert c - \hat c\rVert^2}$ (joint rotations, velocities, end effectors, center of mass). Two tricks made it work: reference state initialization (start episodes at random frames of the clip) and early termination (stop when the character falls). **AMP** (Peng et al. 2021) replaces the hand-made tracking reward with a GAN-style discriminator that tells the character's transitions apart from a motion dataset, so a task reward (go there) can be combined with "move like the data" without choosing clips. **ASE** (Peng et al. 2022) pre-trains a large latent skill space with adversarial and diversity objectives, so that high-level controllers only choose latents. **PHC** (Luo et al. 2023) is a single policy that tracks almost all of AMASS, recovers from falls, and drives avatars from video or VR input. **MaskedMimic** (Tessler et al. 2024) treats control as motion inpainting: one policy, trained by distilling a full-body tracker, accepts any subset of constraints (joint targets, VR head and hands, text, object goals). Follow-ups include **PARC** (Xu et al., SIGGRAPH 2025), which iterates a kinematic motion generator and a physics tracker to expand parkour data, and **MaskedManipulator** (Tessler et al., SIGGRAPH Asia 2025), which extends MaskedMimic to whole-body object manipulation.

**The bridge to humanoid robots (as of November 2026).** The same recipe moved to real hardware in 2024-2026: retarget human motion to the robot (Section 7), train a tracking policy in a massively parallel simulator ([embodied AI 3]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})) with domain randomization, and deploy it zero-shot.

- **H2O** (He et al., IROS 2024) and **HumanPlus** (Fu et al., CoRL 2024) used it for real-time teleoperation and shadowing of a human operator.
- **ASAP** (He et al., RSS 2025) learns a residual "delta action" model from real rollouts to close the sim-to-real gap for agile skills.
- **TWIST** (Ze et al., CoRL 2025) does whole-body teleoperation from mocap; **KungfuBot** (Xie et al., NeurIPS 2025) and **GMT** (Chen et al., arXiv June 2025) track highly dynamic and general motions.
- **VideoMimic** (Allshire et al., CoRL 2025) learns context-aware skills, such as climbing stairs or sitting down, from phone videos.
- **BeyondMimic** (Liao et al., arXiv August 2025) pairs a motion tracker with a guided diffusion policy.
- Scale is the 2026 theme. **SONIC** (Luo et al., *Science Robotics* 2026) scales a tracking controller to tens of millions of parameters and hundreds of hours of mocap. **SuperMimic** (Liao et al., accepted at CoRL 2026, arXiv October 2026) trains a tracker through one learned differentiable world model, and reports matching a large-compute RL baseline in hours on a single GPU.

The lesson for graphics: the character-animation stack is now part of robot learning, from skeletons and retargeting to PD tracking and imitation rewards.

## 10. Generative motion

Generative models now synthesize motion from text, music, audio or sparse constraints. The usual representation is a sequence of SMPL-style poses, often with redundant features (root velocity, joint positions, rotations, foot contacts). **HumanML3D** (Guo et al., CVPR 2022) is the standard text-to-motion benchmark: AMASS and HumanAct12 motions, each with several text descriptions.

- **MDM**, the Human Motion Diffusion Model (Tevet et al., ICLR 2023), is a transformer [diffusion model]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }}) that predicts the clean motion $\hat x_0$ instead of the noise. That allows geometric losses on positions, velocities and foot contact during training. It also supports inpainting (fill in the frames between keyframes, or the lower body given the upper) without retraining, which is in-betweening again, learned.
- **MoMask** (Guo et al., CVPR 2024) tokenizes motion with a residual vector-quantized autoencoder and generates tokens with masked transformers. It was a strong text-to-motion model of its year.
- **MotionLCM** (Dai et al., ECCV 2024) distills latent diffusion into a few-step consistency model for real-time, controllable generation.
- **MotionStreamer** (Xiao et al., ICCV 2025) generates motion as an online stream with a diffusion-based autoregressive model in a causal latent space.
- Scaling data and models. **Go to Zero** (Fan et al., arXiv July 2025) builds a million-sequence dataset for zero-shot generation; **HY-Motion 1.0** (Tencent Hunyuan, arXiv December 2025) scales flow-matching transformers to about a billion parameters; NVIDIA's **Kimodo** (Rempe et al., arXiv March 2026) trains a kinematic diffusion model on about 700 hours of optical mocap and controls it with text, keyframes, waypoints and paths.

Physics and generation are converging. BeyondMimic and MaskedMimic put generative models inside physics-based controllers, and PARC uses a physics tracker to clean up generated motion. The open problems are physical plausibility, contact with scenes and objects, long-horizon coherence, and evaluation: FID-style metrics on motion features correlate only loosely with what animators judge as good.

## Try it

- The skinning widget above: find the twist angle at which LBS has lost half the width, and compare it with the formula $r'/r = \lvert\cos(\theta/2)\rvert$ for equal weights.
- For IK by dragging, the [embodied AI 1]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }}) arm widget solves the Jacobian version of Section 6. The [home page lab]({{ '/' | relative_url }}#lab) cloth runs the physics of [post 7]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }}) that physics-based characters build on.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Catmull & Rom, *A class of local interpolating splines* | Computer Aided Geometric Design (Academic Press) | 1974 | (book chapter) | Interpolating splines with automatic tangents |
| Shoemake, *Animating rotation with quaternion curves* | SIGGRAPH | 1985 | [DOI](https://doi.org/10.1145/325165.325242) | Quaternions, slerp and squad for animation |
| Magnenat-Thalmann, Laperrière & Thalmann, *Joint-dependent local deformations for hand animation and object grasping* | Graphics Interface | 1988 | [DOI](https://doi.org/10.20380/GI1988.04) | Early skeleton-driven skin deformation |
| Wang & Chen, *A combined optimization method for solving the inverse kinematics problems of mechanical manipulators* | IEEE Trans. Robotics and Automation | 1991 | [DOI](https://doi.org/10.1109/70.86079) | Cyclic coordinate descent IK |
| Lewis, Cordner & Fong, *Pose space deformation* | SIGGRAPH | 2000 | [DOI](https://doi.org/10.1145/344779.344862) | Pose-driven corrective shapes |
| Kovar, Gleicher & Pighin, *Motion graphs* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566605) | Graph search over mocap transitions |
| Kavan, Collins, Žára & O'Sullivan, *Geometric skinning with approximate dual quaternion blending* | ACM TOG | 2008 | [DOI](https://doi.org/10.1145/1409625.1409627) | Dual quaternion skinning |
| Aristidou & Lasenby, *FABRIK* | Graphical Models | 2011 | [DOI](https://doi.org/10.1016/j.gmod.2011.05.003) | Position-based iterative IK |
| Lewis et al., *Practice and theory of blendshape facial models* | Eurographics STAR | 2014 | [DOI](https://doi.org/10.2312/egst.20141042) | Survey of facial blendshape rigs |
| Loper et al., *SMPL: A skinned multi-person linear model* | ACM TOG | 2015 | [DOI](https://doi.org/10.1145/2816795.2818013) | Learned body model; standard in vision |
| Clavet, *Motion Matching and The Road to Next-Gen Animation* | GDC talk | 2016 | [GDC Vault](https://gdcvault.com/play/1023280/Motion-Matching-and-The-Road) | Motion matching in production |
| Holden, Komura & Saito, *Phase-functioned neural networks for character control* | ACM TOG | 2017 | [DOI](https://doi.org/10.1145/3072959.3073663) | Neural locomotion controller |
| Peng, Abbeel, Levine & van de Panne, *DeepMimic* | ACM TOG (SIGGRAPH) | 2018 | [arXiv](https://arxiv.org/abs/1804.02717) | RL imitation of mocap clips |
| Holden, Kanoun, Perepichka & Popa, *Learned motion matching* | ACM TOG | 2020 | [DOI](https://doi.org/10.1145/3386569.3392440) | Motion matching with small networks |
| Peng et al., *AMP: Adversarial Motion Priors* | ACM TOG (SIGGRAPH) | 2021 | [arXiv](https://arxiv.org/abs/2104.02180) | Style rewards from a discriminator |
| Peng et al., *ASE: Adversarial Skill Embeddings* | ACM TOG (SIGGRAPH) | 2022 | [arXiv](https://arxiv.org/abs/2205.01906) | Reusable latent skill spaces |
| Guo et al., *Generating Diverse and Natural 3D Human Motions from Text* | CVPR | 2022 | [CVF](https://openaccess.thecvf.com/content/CVPR2022/html/Guo_Generating_Diverse_and_Natural_3D_Human_Motions_From_Text_CVPR_2022_paper.html) | HumanML3D benchmark |
| Tevet et al., *Human Motion Diffusion Model* | ICLR | 2023 | [arXiv](https://arxiv.org/abs/2209.14916) | Diffusion for text-to-motion |
| Luo et al., *Perpetual Humanoid Control for Real-time Simulated Avatars* | ICCV | 2023 | [arXiv](https://arxiv.org/abs/2305.06456) | Universal motion tracker with fall recovery |
| Guo et al., *MoMask* | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.00063) | Residual VQ + masked transformers |
| He et al., *H2O: Learning Human-to-Humanoid Real-Time Whole-Body Teleoperation* | IROS | 2024 | [arXiv](https://arxiv.org/abs/2403.04436) | Character tracking on a real humanoid |
| Fu et al., *HumanPlus* | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2406.10454) | Shadowing and imitation from humans |
| Tessler et al., *MaskedMimic* | ACM TOG (SIGGRAPH Asia) | 2024 | [arXiv](https://arxiv.org/abs/2409.14393) | Unified control as motion inpainting |
| He et al., *ASAP* | RSS | 2025 | [arXiv](https://arxiv.org/abs/2502.01143) | Sim-to-real alignment for agile humanoid skills |
| Xu et al., *PARC* | SIGGRAPH | 2025 | [arXiv](https://arxiv.org/abs/2505.04002) | Generator + physics tracker data augmentation |
| Ze et al., *TWIST* | CoRL | 2025 | [PMLR](https://proceedings.mlr.press/v305/ze25a.html) | Whole-body teleoperation by imitation |
| Allshire et al., *Visual Imitation Enables Contextual Humanoid Control* (VideoMimic) | CoRL | 2025 | [arXiv](https://arxiv.org/abs/2505.03729) | Humanoid skills from monocular video |
| Xie et al., *KungfuBot* | NeurIPS | 2025 | [arXiv](https://arxiv.org/abs/2506.12851) | Tracking highly dynamic human skills |
| Xiao et al., *MotionStreamer* | ICCV | 2025 | [arXiv](https://arxiv.org/abs/2503.15451) | Streaming text-to-motion |
| Tessler et al., *MaskedManipulator* | SIGGRAPH Asia | 2025 | [arXiv](https://arxiv.org/abs/2505.19086) | Whole-body manipulation for simulated characters |
| Liao et al., *BeyondMimic* | arXiv preprint (Aug 2025) | 2025 | [arXiv](https://arxiv.org/abs/2508.08241) | Motion tracking + guided diffusion on hardware |
| Araújo et al., *Retargeting Matters: General Motion Retargeting for Humanoid Motion Tracking* | arXiv preprint (Oct 2025) | 2025 | [arXiv](https://arxiv.org/abs/2510.02252) | Retargeting quality for robot trackers |
| Tencent Hunyuan, *HY-Motion 1.0* | arXiv preprint (Dec 2025) | 2025 | [arXiv](https://arxiv.org/abs/2512.23464) | Billion-parameter flow-matching text-to-motion |
| Luo et al., *SONIC: Supersizing Motion Tracking for Natural Humanoid Whole-Body Control* | Science Robotics | 2026 | [arXiv](https://arxiv.org/abs/2511.07820) | Scaling humanoid motion tracking |
| Rempe et al., *Kimodo* | arXiv preprint (Mar 2026) | 2026 | [arXiv](https://arxiv.org/abs/2603.15546) | Controllable motion diffusion at scale |
| Liao et al., *SuperMimic* | CoRL (accepted), arXiv Oct 2026 | 2026 | [arXiv](https://arxiv.org/abs/2610.28480) | Tracking via one differentiable world model |

## Learning resources

- Rick Parent, *Computer Animation: Algorithms and Techniques* (3rd ed.): splines, rotations, kinematics, skinning, motion capture.
- **GAMES105** (Libin Liu, in Chinese): fundamentals of character animation, from kinematics and motion matching to physics-based control and learning.
- Daniel Holden's blog [theorangeduck.com](https://theorangeduck.com/): clear, code-first articles on quaternions, spring dampers, inertialization and motion matching.
- Jason Gregory, *Game Engine Architecture*: the animation system chapter (skeletons, blend trees, compression), a bridge to the [graphics-engine track]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}).
- Code: [SMPL / SMPL-X](https://smpl-x.is.tue.mpg.de/), NVIDIA's [ProtoMotions](https://github.com/NVlabs/ProtoMotions) (MaskedMimic and other physics-based character methods), [MDM](https://github.com/GuyTevet/motion-diffusion-model).

## Exercises

1. Derive the Hermite basis from the four end conditions, and show that the uniform Catmull–Rom spline is $C^1$ but not $C^2$ at the keys.
2. Implement Newton's method for arc-length inversion, $t \leftarrow t - (s(t) - s^*)/\lVert p'(t)\rVert$, and compare its accuracy with the table lookup for the same number of curve evaluations.
3. Show that for two joints rotating about a common axis, DQS (with zero translation) reduces to normalized quaternion blending (nlerp), and that its rotation angle is not exactly $w_1\theta$. How large is the error at $w_1 = 0.25$, $\theta = 160^\circ$?
4. Add joint limits (an angle interval per joint) to CCD and FABRIK and compare the poses they reach for a target close to the root.
5. Extend the motion-matching toy with foot-position features from a synthetic gait phase and give them a large weight. How does the chosen frame change when the query asks to keep the current foot phase?

<details markdown="1"><summary>Hint for exercise 3</summary>

With $q_0 = 1$ and $q_1 = (\cos\frac\theta2, \sin\frac\theta2\,\hat x)$, the blend $w_0 + w_1 q_1$ has angle $2\,\mathrm{atan2}\big(w_1\sin\frac\theta2,\ w_0 + w_1\cos\frac\theta2\big)$. Compare with $w_1\theta$, which is what slerp would give.

</details>

<details markdown="1"><summary>Hint for exercise 4</summary>

In CCD, clamp each joint's angle right after its update. In FABRIK, after placing joint $i+1$, project the bone direction into the allowed cone (or angle interval in 2D) relative to the previous bone.

</details>

Next in the series: volumes and participating media ([graphics 10]({{ '/blog/2026/graphics-10-volumes-and-participating-media/' | relative_url }})).
