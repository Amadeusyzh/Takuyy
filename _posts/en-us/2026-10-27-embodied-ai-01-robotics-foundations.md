---
layout: post
title: "Robotics foundations: transforms, kinematics, control and planning"
date: 2026-10-27 18:01:00+0900
description: "SE(3), forward and inverse kinematics, Jacobians, a first look at dynamics, PID and impedance control, and A*/RRT planning, with NumPy code for a 3-link arm."
categories: embodied-ai
tags: [robotics, kinematics, control, motion-planning]
series: embodied-ai
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## Why this matters

Embodied AI is the part of AI that has to move a body through the physical world. Modern robot learning
papers talk about "policies", "action chunks" and "end-effector deltas", but underneath every one of them
sits a stack of classical robotics: coordinate frames, kinematics, dynamics, low-level controllers and
planners. A Vision-Language-Action model that outputs a 7-D end-effector command is useless unless
something converts that command into joint torques at 1 kHz without hitting joint limits or itself.

This first post of the **Embodied AI** track is a compact tour of that stack, written for readers who
know deep learning, graphics and world models but have little robotics background. If you have done
graphics you already know half of it: a robot arm is a scene graph of rigid transforms, and inverse
kinematics is the same problem that animators solve for character rigs.

**Prerequisites**

- Linear algebra: matrices, rotations, least squares, the SVD.
- Calculus: partial derivatives, the chain rule.
- Python and NumPy.
- Helpful but optional: homogeneous coordinates from a graphics course.

## 1. Rigid-body transforms and SE(3)

### Rotations: SO(3)

The orientation of a rigid body relative to a reference frame is a rotation matrix $R \in \mathbb{R}^{3\times3}$
whose columns are the body's axes expressed in the reference frame. Rotation matrices form the
**special orthogonal group**

$$
SO(3) = \{ R \in \mathbb{R}^{3\times 3} \;:\; R^\top R = I,\; \det R = 1 \}.
$$

SO(3) is a 3-dimensional manifold, not a vector space: you cannot add two rotations and get a rotation.
Common parameterizations are Euler angles (minimal but singular at "gimbal lock"), unit quaternions
(4 numbers, double cover, no singularities, the standard in simulators and game engines), and the
**axis-angle / exponential coordinates** $\omega\theta$ with unit axis $\hat\omega$ and angle $\theta$.

For a vector $\omega = (\omega_1, \omega_2, \omega_3)$ define the skew-symmetric matrix

$$
[\omega] = \begin{bmatrix} 0 & -\omega_3 & \omega_2 \\ \omega_3 & 0 & -\omega_1 \\ -\omega_2 & \omega_1 & 0 \end{bmatrix},
\qquad [\omega]\,v = \omega \times v .
$$

The matrix exponential maps axis-angle to a rotation (Rodrigues' formula):

$$
R = e^{[\hat\omega]\theta} = I + \sin\theta\,[\hat\omega] + (1-\cos\theta)\,[\hat\omega]^2 .
$$

The set of skew-symmetric matrices is the **Lie algebra** $\mathfrak{so}(3)$, the tangent space of SO(3)
at the identity. Angular velocity lives there: if $R(t)$ is a trajectory, then $\dot R R^\top = [\omega_s]$
gives the angular velocity in the fixed (space) frame and $R^\top \dot R = [\omega_b]$ in the body frame.

### Rigid motions: SE(3)

A full pose (position $p$ and orientation $R$) is a homogeneous transform

$$
T = \begin{bmatrix} R & p \\ 0 & 1 \end{bmatrix} \in SE(3), \qquad
T^{-1} = \begin{bmatrix} R^\top & -R^\top p \\ 0 & 1 \end{bmatrix}.
$$

This is exactly the 4x4 model matrix from graphics. Notation that saves a lot of bugs: write $T_{ab}$ for
"the pose of frame $b$ expressed in frame $a$". Then composition chains like dominoes,

$$
T_{ac} = T_{ab}\,T_{bc}, \qquad p_a = T_{ab}\, p_b \;\text{(in homogeneous coordinates)}.
$$

The robot's whole "scene graph" (world, base, links, camera, gripper, object) is a tree of such transforms.
Hand-eye calibration, for example, is the problem of estimating the fixed $T_{\text{gripper},\text{camera}}$.

### Twists and screws

The velocity of a rigid body is a **twist** $\mathcal{V} = (\omega, v) \in \mathbb{R}^6$, with
$[\mathcal{V}] = \begin{bmatrix}[\omega] & v\\0&0\end{bmatrix} \in \mathfrak{se}(3)$. Chasles' theorem says
every rigid motion is a rotation about an axis combined with a translation along it, a **screw motion**,
and the exponential map $T = e^{[\mathcal{S}]\theta}$ turns a unit screw axis $\mathcal{S}$ and a distance
$\theta$ into an element of SE(3). This is the foundation of the product-of-exponentials (PoE) formula
used throughout *Modern Robotics*. The dual of a twist is a **wrench** $\mathcal{F} = (m, f)$ (moment and
force); power is $\mathcal{F}^\top\mathcal{V}$.

Why care as a learning person? Because action spaces are poses. Predicting a rotation with a network
means choosing a representation: Euler angles have discontinuities, quaternions have the $q \equiv -q$
ambiguity, and Zhou et al. (CVPR 2019) showed that a continuous 6-D representation (two columns of $R$,
re-orthonormalized) is easier to regress. Many policies (e.g. Diffusion Policy in post 4) use it.

## 2. Forward kinematics

A serial manipulator is a chain of links connected by joints, usually revolute (R) or prismatic (P).
The **configuration** is the vector of joint values $q \in \mathbb{R}^n$; the set of all configurations is
the configuration space (C-space). **Forward kinematics** (FK) maps $q$ to the end-effector pose:

$$
T_{0n}(q) = T_{01}(q_1)\,T_{12}(q_2)\cdots T_{n-1,n}(q_n).
$$

### Denavit-Hartenberg parameters

Denavit and Hartenberg (1955) showed that by placing frames cleverly, each link transform needs only four
numbers. In the **standard DH convention** the $z_i$ axis is the axis of joint $i+1$ and

$$
T_{i-1,i} = \mathrm{Rot}_z(\theta_i)\,\mathrm{Trans}_z(d_i)\,\mathrm{Trans}_x(a_i)\,\mathrm{Rot}_x(\alpha_i)
= \begin{bmatrix}
\cos\theta_i & -\sin\theta_i\cos\alpha_i & \sin\theta_i\sin\alpha_i & a_i\cos\theta_i\\
\sin\theta_i & \cos\theta_i\cos\alpha_i & -\cos\theta_i\sin\alpha_i & a_i\sin\theta_i\\
0 & \sin\alpha_i & \cos\alpha_i & d_i\\
0&0&0&1
\end{bmatrix}.
$$

| Parameter | Meaning |
| --- | --- |
| $a_i$ | link length: distance between $z_{i-1}$ and $z_i$ along $x_i$ |
| $\alpha_i$ | link twist: angle from $z_{i-1}$ to $z_i$ about $x_i$ |
| $d_i$ | link offset: distance along $z_{i-1}$ (variable for a prismatic joint) |
| $\theta_i$ | joint angle about $z_{i-1}$ (variable for a revolute joint) |

Beware: there is also a **modified DH** convention (Craig), used e.g. in Franka Emika's documentation,
with a different order of the four elementary transforms. Mixing the two is a classic source of bugs.
In practice robots are described with URDF or MJCF files (post 3) that store a full transform per joint,
and libraries such as Pinocchio, Drake, MuJoCo or PyBullet compute FK for you. DH is still worth knowing
because it makes the structure explicit and is how most textbooks and datasheets present kinematics.

### A planar 3-link arm in NumPy

For a planar arm, every $\alpha_i = d_i = 0$, so each DH transform is a rotation by $q_i$ followed by a
translation $a_i$ along the new $x$ axis. With absolute angles $c_i = q_1 + \dots + q_i$, the end effector is

$$
p_x = \sum_i a_i\cos c_i,\qquad p_y = \sum_i a_i \sin c_i,\qquad \phi = c_n .
$$

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

`pts` gives every joint position, which is all you need to draw the arm with matplotlib.

## 3. Jacobians and differential kinematics

FK is nonlinear, but its derivative is linear in the joint velocities:

$$
\dot x = J(q)\,\dot q, \qquad J(q) = \frac{\partial x}{\partial q} \in \mathbb{R}^{m\times n}.
$$

For our planar arm ($m = n = 3$) the columns are easy to derive by differentiating the sums above:

$$
J_{1i} = -\sum_{k\ge i} a_k \sin c_k,\qquad J_{2i} = \sum_{k\ge i} a_k\cos c_k, \qquad J_{3i} = 1 .
$$

For a general spatial arm, the **geometric Jacobian** column of a revolute joint $i$ with unit axis $z_{i-1}$
through point $o_{i-1}$ (both in the base frame) is

$$
J_i = \begin{bmatrix} z_{i-1}\times(o_n - o_{i-1}) \\ z_{i-1}\end{bmatrix},
$$

stacking linear velocity over angular velocity; a prismatic joint contributes $(z_{i-1}, 0)$.
(*Modern Robotics* writes the same thing with space and body Jacobians built from screw axes.)

The Jacobian tells you almost everything about local behaviour:

- **Singularities**: where $\operatorname{rank} J < m$ the end effector loses a direction of motion (a fully
  stretched arm cannot move further outward). Near them, small Cartesian motions require huge joint speeds.
- **Manipulability**: Yoshikawa's measure $w = \sqrt{\det(JJ^\top)}$, the volume of the velocity ellipsoid
  $\lbrace J\dot q : \lVert\dot q\rVert \le 1 \rbrace$, whose axes come from the SVD of $J$.
- **Statics**: by the principle of virtual work, a wrench $\mathcal{F}$ at the end effector requires joint
  torques $\tau = J^\top(q)\,\mathcal{F}$. This one line is the basis of force and impedance control.
- **Redundancy**: if $n > m$ (e.g. a 7-DoF arm for a 6-D pose) there is a null space; joint motions
  $(I - J^+J)\,z$ move the elbow without moving the hand.

Always test a hand-written Jacobian against finite differences:

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

## 4. Inverse kinematics

**Inverse kinematics** (IK) asks for $q$ such that $x(q) = x^\*$. It can have zero, finitely many, or
infinitely many solutions.

### Analytic IK

For simple or specially designed arms there are closed-form solutions. For a planar 2-link arm reaching
$(p_x, p_y)$, the law of cosines gives

$$
\cos q_2 = \frac{p_x^2 + p_y^2 - a_1^2 - a_2^2}{2a_1a_2},\qquad
q_2 = \pm\arccos(\cdot),\qquad
q_1 = \operatorname{atan2}(p_y, p_x) - \operatorname{atan2}(a_2\sin q_2,\; a_1 + a_2\cos q_2),
$$

with the $\pm$ selecting "elbow up" or "elbow down", and no solution when $\lvert\cos q_2\rvert > 1$.
Industrial 6-DoF arms with a **spherical wrist** (last three axes intersecting) decouple into a position
problem and an orientation problem (Pieper's criterion) and have up to 8 analytic solutions. Tools such
as IKFast (OpenRAVE) generate these solvers automatically.

### Numerical IK: Newton, Jacobian transpose, pseudoinverse

For general arms we iterate. Linearize around the current $q$: $x^\* - x(q) \approx J\,\Delta q$. Options:

- **Jacobian transpose**: $\Delta q = \alpha J^\top e$. Cheap, always a descent direction for
  $\tfrac12\lVert e\rVert^2$, but slow.
- **Pseudoinverse (Gauss-Newton)**: $\Delta q = J^+ e$ with $J^+ = J^\top(JJ^\top)^{-1}$ for a wide $J$.
  Fast near a solution but explodes near singularities because $J^+$ has $1/\sigma_i$ terms.
- **Damped least squares (DLS, Levenberg-Marquardt)**: minimize
  $\lVert J\Delta q - e\rVert^2 + \lambda^2\lVert\Delta q\rVert^2$, giving

$$
\Delta q = J^\top\left(JJ^\top + \lambda^2 I\right)^{-1} e
= \sum_i \frac{\sigma_i}{\sigma_i^2 + \lambda^2}\, v_i u_i^\top e .
$$

The SVD form shows why DLS is robust (Nakamura and Hanafusa 1986; Wampler 1986): directions with
$\sigma_i \gg \lambda$ behave like the pseudoinverse, while directions with $\sigma_i \to 0$ are damped to zero
instead of blowing up. The price is slower convergence and a small bias.

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

Try the last call with `lam=0.05`: the iterate wanders around with a residual of several units, because
the stretched-out arm is singular and lightly-damped steps overshoot. Production IK solvers combine
DLS with adaptive damping, step-size limits, joint limits and secondary objectives in the null space;
the modern formulation is a small **quadratic program** (QP) per control tick, e.g. "minimize task error
subject to joint position and velocity limits", solved by libraries such as Pink, mink or Drake.

## 5. A short look at dynamics

Kinematics ignores forces. The equations of motion of an $n$-joint rigid-body system are

$$
M(q)\,\ddot q + C(q,\dot q)\,\dot q + g(q) = \tau + J(q)^\top \mathcal{F}_{\text{ext}},
$$

with the symmetric positive-definite **mass matrix** $M(q)$, Coriolis and centrifugal terms $C\dot q$,
gravity $g(q)$, joint torques $\tau$ and external wrenches $\mathcal{F}_{\text{ext}}$ (e.g. contacts). They come
from the Euler-Lagrange equations with Lagrangian $L = \tfrac12 \dot q^\top M(q)\dot q - V(q)$.
Two standard problems:

- **Inverse dynamics**: given $q, \dot q, \ddot q$, compute $\tau$. The recursive Newton-Euler algorithm
  (RNEA) does this in $O(n)$.
- **Forward dynamics**: given $\tau$, compute $\ddot q = M^{-1}(\tau - C\dot q - g)$. The articulated-body
  algorithm (ABA) is also $O(n)$ (Featherstone 2008).

Two structural facts make control design possible: $M(q)$ is positive definite, and with a suitable choice
of $C$ the matrix $\dot M - 2C$ is skew-symmetric (passivity). Contacts, friction and actuator limits make
real dynamics much harder; that is the job of the physics engines in post 3.

## 6. Control

The controller turns a desired trajectory into torques, typically at 0.5 to 1 kHz on the robot, while a
learned policy runs at 5 to 50 Hz on top of it. Knowing which layer your policy commands (joint position
targets, joint velocities, end-effector poses, torques) matters a lot for sim-to-real.

### PID and PD with gravity compensation

The workhorse is PID on each joint:

$$
\tau = K_p\, e + K_i \int_0^t e\, dt' - K_d\,\dot q, \qquad e = q_{\text{ref}} - q .
$$

The proportional term acts as a spring, the derivative term as a damper, and the integral term removes
steady-state error caused by constant disturbances such as gravity. A better use of a model is
**PD plus gravity compensation**, $\tau = K_p e - K_d\dot q + g(q)$, which for a constant target is globally
asymptotically stable (Takegaki and Arimoto 1981). A one-joint pendulum makes the difference visible:

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

Plain PD sags by about 0.19 rad because the spring must hold up the weight; the integral term or the
gravity model removes the error. Legged-robot RL policies (post 2) almost always output **joint position
targets** to such a PD loop instead of raw torques; the PD gains then become part of the "action space".

### Computed torque and operational-space control

If the model is good, cancel the nonlinear dynamics and impose linear error dynamics
(**computed torque**, or feedback linearization):

$$
\tau = M(q)\left(\ddot q_{\text{ref}} + K_d\dot e + K_p e\right) + C\dot q + g .
$$

Khatib's **operational-space formulation** (1987) does the same in task space. With the task-space
inertia $\Lambda(q) = (J M^{-1} J^\top)^{-1}$ the end effector behaves like a body of mass $\Lambda$, and

$$
\tau = J^\top\left(\Lambda\,\ddot x_{\text{cmd}} + \mu + p\right) + \left(I - J^\top \bar J^{\top}\right)\tau_0,
\qquad \bar J = M^{-1}J^\top\Lambda,
$$

where $\mu, p$ are the task-space Coriolis and gravity terms and $\tau_0$ is a secondary objective
projected into the dynamically consistent null space (e.g. keep the elbow near a rest pose).

### Impedance control

Hogan's **impedance control** (1985) does not try to track a position stiffly; it makes the end effector
behave like a mass-spring-damper around a target:

$$
\Lambda_d\,\ddot{\tilde x} + D_d\,\dot{\tilde x} + K_d\,\tilde x = \mathcal{F}_{\text{ext}},\qquad \tilde x = x - x_d .
$$

The simplest implementation ignores the desired inertia and commands
$\tau = J^\top\left(K_d (x_d - x) - D_d\,\dot x\right) + g(q)$, using the static relation $\tau = J^\top\mathcal{F}$.
Low stiffness gives compliant, safe contact (wiping, insertion, human interaction); high stiffness
gives accurate tracking. Many learned manipulation policies output a target pose $x_d$ at 10 to 20 Hz to a
Cartesian impedance controller running at 1 kHz; some also predict the stiffness ("variable impedance").

## 7. Motion planning

Planning finds a collision-free path in C-space from $q_{\text{start}}$ to $q_{\text{goal}}$. Obstacles in the
workspace become complicated "C-obstacles" in joint space, so planners query a collision checker
(which runs FK and mesh-mesh tests, the same BVH machinery as in ray tracing) instead of building the
free space explicitly.

### Graph search: A*

On a discretized C-space (grid or lattice), **A\*** (Hart, Nilsson and Raphael 1968) expands nodes in order of
$f(n) = g(n) + h(n)$, cost-so-far plus a heuristic estimate of cost-to-go. If $h$ is **admissible**
(never overestimates) A\* returns an optimal path; if it is also **consistent**
($h(n) \le c(n,n') + h(n')$) no node needs to be re-expanded. Dijkstra is A\* with $h = 0$. Grids scale
exponentially with dimension, so A\* is used for mobile robots in 2-D/3-D, footstep planning and
discretized lattices, not for 7-DoF arms.

### Sampling-based planning: PRM, RRT, RRT\*

Sampling-based planners avoid discretization. **PRM** (Kavraki et al. 1996) samples many collision-free
configurations, connects nearby ones and answers queries with graph search. **RRT** (LaValle 1998)
grows a tree from the start: sample $x_{\text{rand}}$, find the nearest tree node, step a fixed distance toward
the sample, and add the new node if the edge is collision free. The Voronoi bias of this procedure pulls
the tree into unexplored space. RRT is **probabilistically complete** (it finds a path with probability
approaching 1 if one exists) but not optimal. **RRT\*** (Karaman and Frazzoli 2011) adds two steps,
choosing the best parent within a shrinking radius $r_n \propto (\log n / n)^{1/d}$ and **rewiring** neighbours
through the new node, which makes it asymptotically optimal.

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

To plan for the 3-link arm instead of a point, replace the sample space by $[-\pi,\pi]^3$ and `free(q)` by
"FK the links and test each segment against the obstacles". RRT paths are jagged, so real systems
shortcut and smooth them, then time-parameterize them under velocity and acceleration limits
(e.g. TOPP-RA). **Trajectory optimization** methods such as CHOMP (Ratliff et al. 2009) and TrajOpt
(Schulman et al. 2013) instead optimize a whole trajectory for smoothness plus collision cost, and
GPU-parallel planners like NVIDIA cuRobo bring planning times to milliseconds.

### Where learning enters

| Classical block | Learned replacement or augmentation (later posts) |
| --- | --- |
| Hand-designed controller | RL policy that outputs PD targets (post 2) |
| Analytic model | Simulator with domain randomization, or a learned world model (posts 3, 5) |
| Planner + cost function | Policy imitating demonstrations, e.g. ACT, Diffusion Policy (post 4) |
| Task specification in code | Language instruction to a VLA model (post 5) |

Learning rarely removes the lower layers: an OpenVLA or pi0 policy still sends targets to an IK solver and an
impedance or PD controller. Understanding those layers is how you debug a policy that "works in sim but jitters
on the robot".

## Try it

The home page **[Lab]({{ '/' | relative_url }}#lab)** has an XPBD cloth demo. Position-based dynamics solves
constraints by projecting positions, much like the IK iterations above project an arm onto the "reach the
target" constraint; dragging a cloth particle is literally an IK problem for a very redundant chain.
A good exercise is to port `ik_dls` to JavaScript and drag the end effector of a 3-link arm on a canvas.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Denavit and Hartenberg, *A kinematic notation for lower-pair mechanisms based on matrices* | J. Applied Mechanics | 1955 | [DOI](https://doi.org/10.1115/1.4011045) | The DH convention |
| Hart, Nilsson, Raphael, *A formal basis for the heuristic determination of minimum cost paths* | IEEE Trans. SSC | 1968 | [DOI](https://doi.org/10.1109/TSSC.1968.300136) | A* search |
| Hogan, *Impedance control: an approach to manipulation, Part I* | J. Dyn. Sys., Meas., Control | 1985 | [DOI](https://doi.org/10.1115/1.3140702) | Impedance control |
| Nakamura and Hanafusa, *Inverse kinematic solutions with singularity robustness for robot manipulator control* | J. Dyn. Sys., Meas., Control | 1986 | - | Damped least-squares IK |
| Khatib, *A unified approach for motion and force control of robot manipulators: the operational space formulation* | IEEE J. Robotics and Automation | 1987 | [DOI](https://doi.org/10.1109/JRA.1987.1087068) | Operational-space control |
| Kavraki et al., *Probabilistic roadmaps for path planning in high-dimensional configuration spaces* | IEEE Trans. Robotics and Automation | 1996 | [DOI](https://doi.org/10.1109/70.508439) | PRM |
| LaValle, *Rapidly-exploring random trees: a new tool for path planning* | Tech. report, Iowa State | 1998 | - | RRT |
| Karaman and Frazzoli, *Sampling-based algorithms for optimal motion planning* | IJRR | 2011 | [arXiv](https://arxiv.org/abs/1105.1186) | RRT\*, PRM\*, asymptotic optimality |
| Schulman et al., *Finding locally optimal, collision-free trajectories with sequential convex optimization* | RSS | 2013 | [PDF](https://www.roboticsproceedings.org/rss09/p31.pdf) | TrajOpt |
| Zhou et al., *On the continuity of rotation representations in neural networks* | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1812.07035) | The 6-D rotation representation used by many policies |

## Learning resources

- K. Lynch and F. Park, *Modern Robotics: Mechanics, Planning, and Control* (Cambridge University Press, 2017),
  free PDF, videos and code on the [book page](https://hades.mech.northwestern.edu/index.php/Modern_Robotics).
  Chapters 3 to 6 and 8 to 11 cover this post in depth with screw theory.
- R. Tedrake, [*Robotic Manipulation*](https://manipulation.csail.mit.edu) and
  [*Underactuated Robotics*](https://underactuated.csail.mit.edu), MIT course notes with runnable Drake notebooks.
- S. LaValle, [*Planning Algorithms*](https://lavalle.pl/planning/) (Cambridge, 2006), free online.
- R. Featherstone, *Rigid Body Dynamics Algorithms* (Springer, 2008), for RNEA/ABA.
- B. Siciliano, L. Sciavicco, L. Villani, G. Oriolo, *Robotics: Modelling, Planning and Control* (Springer, 2009).
- Code: [Pinocchio](https://github.com/stack-of-tasks/pinocchio) (fast rigid-body dynamics),
  [Drake](https://drake.mit.edu), [OMPL](https://ompl.kavrakilab.org) (sampling-based planners),
  [Peter Corke's Robotics Toolbox for Python](https://github.com/petercorke/robotics-toolbox-python).

## Exercises

1. Implement the analytic 2-link IK above and check both elbow solutions with `fk`.
2. Write the geometric Jacobian for a 3-D arm given by a DH table and verify it with finite differences.
   Plot the manipulability $\sqrt{\det JJ^\top}$ of the planar arm over its workspace.
3. Add joint limits to `ik_dls` by clamping, then by a null-space term that pushes joints to the middle of
   their range. Compare how often each version reaches random targets.
4. Extend the pendulum example to a 2-link arm with $M(q)$ and compare PD, PID and computed torque under a
   10% error in the link masses.
5. Turn `rrt` into RRT\* (choose-parent and rewire) and plot path length versus number of samples.

**Next:** [Reinforcement learning for robots]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }}),
where controllers stop being designed and start being learned.
