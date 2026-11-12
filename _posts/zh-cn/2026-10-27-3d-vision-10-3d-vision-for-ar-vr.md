---
layout: post
title: "面向 AR/VR 的三维视觉：跟踪、延迟与配准误差"
date: 2026-10-27 11:10:00+0900
description: "「三维视觉基础」的最后一篇：基于 VIO 与地图的 inside-out 6DoF 跟踪、运动到光子延迟与预测、后期重投影、配准误差预算、透视（passthrough）重投影、手部与眼动追踪、平面与网格、空间锚点与重定位。"
categories: 3d-vision
tags: [ar, vr, mixed-reality, vio, latency, registration, passthrough, hand-tracking, eye-tracking, spatial-anchors]
series: 3d-vision
series_order: 10
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

本系列此前的每一篇都在解决离线问题：把相机标定一次（[第 02 篇]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})），从一组照片中恢复位姿和三维点（[第 05 篇]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})），把深度融合成曲面（[第 09 篇]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})）。AR 或 VR 头显要把这些同时做完：实时、靠电池供电、并且由人的视觉系统来打分。它的核心要求是**配准**（registration）：放在真实桌面上的虚拟物体，必须在头部以每秒上百度的速度转动时，仍以远小于一度的误差留在那张桌子上。在 VR 中，同样的要求表现为「转头时世界不能晃」。

这篇文章说明做到这一点需要什么。误差不再用传感器上的重投影像素来衡量，而是用眼睛处的角分（arcminute）以及从头部运动到显示出该运动的光子之间的毫秒数来衡量。我们会搭建一套小工具——公式和仿真——来回答具体问题：仅靠 IMU 漂移有多快？20 ms 延迟代价多大，预测又能挽回多少？为什么只做旋转的重投影对近处物体失效？如何累加配准误差预算？为什么位于眼睛前方几厘米的透视相机会让近处物体变形？头显上的一对相机能把指尖三角化到多精确？眼动追踪为什么要利用角膜反射？当底层地图变化时，空间锚点如何让内容留在原处？

## 前置知识

- [第 01 篇]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})的相机模型与 OpenCV 约定：$K$、$R$、$\mathbf t$、齐次坐标、旋转单应、卷帘快门。
- [第 02 篇]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})第 9 节的相机-IMU 标定及其时间偏移。
- [第 03 篇]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})的 RANSAC；[第 04 篇]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})的三角化与双目深度；[第 05 篇]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})的 PnP。
- [第 06 篇]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})的视觉惯性里程计、关键帧与回环；第 [07]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}) 至 [09]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) 篇的深度感知与 TSDF 融合。
- Python 与 NumPy。下面每段代码都可直接运行，正文中的数字就是它的输出。

## 1. 配准问题

### 1.1 坐标系与变换链

头显上有好几个刚体坐标系。我们用 $T\_{AB}$ 表示把坐标从坐标系 $B$ 变换到坐标系 $A$ 的 $4\times4$ 刚体变换，于是 $\tilde{\mathbf X}\_A = T\_{AB}\tilde{\mathbf X}\_B$，且 $T\_{AC} = T\_{AB}T\_{BC}$。按这个记法，第 01 篇的世界到相机矩阵 $[R \mid \mathbf t]$ 就是 $T\_{CW}$。这些坐标系是：

- $W$：跟踪系统的**世界**（或地图）坐标系，与重力对齐，$z$ 轴向上；
- $B$：头显的**机体**（body）坐标系，实际上就是 IMU；
- $C\_i$：**跟踪相机**，通常是几台广角、全局快门的灰度相机，分别朝前、朝侧面和朝下；
- $E\_L, E\_R$：**眼睛**，更准确地说是渲染左右眼图像的虚拟相机；其位置取决于佩戴者的瞳距（IPD），平均约 63 mm；
- $A$：**锚点**（anchor），固定在某个真实位置上的坐标系，虚拟内容挂在它上面。

在锚点坐标系中给出的虚拟物体上的一点 $\mathbf X\_A$，出现在左眼显示中的位置是

$$
\lambda\,\tilde{\mathbf u} = K_{E_L}\,\big[\,T_{E_L B}\; T_{BW}(t_{\text{photon}})\; T_{WA}\,\big]_{3\times4}\, \tilde{\mathbf X}_A ,
$$

其中 $[\cdot]\_{3\times4}$ 表示取前三行。每个因子都有自己的误差来源。$K\_{E\_L}$ 和 $T\_{E\_L B}$ 来自显示标定（对光学透视显示而言，还取决于眼睛实际位于镜片后的哪里）。$T\_{WA}$ 来自地图。$T\_{BW}(t)$ 是头部位姿的逆，来自跟踪；而且需要的是光离开显示器的时刻 $t\_{\text{photon}}$ 的值——在渲染这一帧时，那还是未来。本文其余部分将逐一讨论这些因子。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-frames.svg" caption="左：世界坐标系 $W$（$z$ 向上）、头部位姿 $T\_{WB}(t)$、桌面上的锚点 $A$ 及 $T\_{WA}$，以及在锚点坐标系中定义的 10 cm 虚拟立方体；橙色线是左眼看向立方体角点 $\mathbf X\_A$ 的视线。右：头显在其机体坐标系 $B$ 中的样子，两台向外、向下倾斜的跟踪相机 $C\_L$、$C\_R$（点线：光轴），以及相距 63 mm、位于 $B$ 后方 6 cm 的两只渲染眼 $E\_L$、$E\_R$。所有光学坐标系都采用 OpenCV 轴向（红 $x$ 向右，绿 $y$ 向下，蓝 $z$ 向前）。" %}

### 1.2 如何度量配准误差

最自然的单位是**眼睛处的角度**：虚拟点被画出的方向与它应在的方向之间的夹角。1 度等于 60 角分（$60'$）。视力正常的人能分辨约 1 角分的细节；每度 $\rho$ 像素的显示器每 $60/\rho$ 角分画一个像素，$\rho = 25$ px/° 时是 $2.4'$。把角度 $\varepsilon$ 换算成物体所在距离 $d$ 处的横向偏移，就是 $\varepsilon d$（弧度乘米）。

两种基本情形覆盖了大多数误差来源。头部位姿的**旋转**误差 $\delta\theta$ 会把所有渲染方向都旋转 $\delta\theta$：角度误差就是 $\delta\theta$，与距离无关。**平移**误差 $\delta\mathbf p$ 会移动视点；对距离 $d$ 处的点，角度误差为 $\delta p\_\perp / d$，其中 $\delta p\_\perp$ 是 $\delta\mathbf p$ 垂直于视线的分量。所以远处内容以旋转误差为主，近处内容以平移误差为主。$\delta\theta = 0.1°$ 时，误差处处为 $6'$；$\delta p\_\perp = 2$ mm 时，0.5 m 处为 $13.8'$，4 m 处为 $1.7'$。

## 2. Inside-out 6DoF 跟踪

早期 VR 系统从外部跟踪头显，用固定在房间里的相机或激光扫描。现在的头显采用 **inside-out** 跟踪：头显上的相机看外部世界。算法就是[第 06 篇]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})的视觉惯性里程计，只是针对一种特殊工况做了工程化：头部快速运动，近处的墙和手常常占满视野，而且延迟预算很紧。系统融合两种优缺点相反的传感器。

### 2.1 为什么仅靠 IMU 不够

IMU 以约 1 kHz 的频率测量角速度 $\tilde{\boldsymbol\omega}$（陀螺仪）和比力 $\tilde{\mathbf f} = R\_{WB}^\top(\mathbf a - \mathbf g)$（加速度计）。对它们积分，即**捷联**（strapdown）方程

$$
\begin{aligned}
R &\leftarrow R\,\operatorname{Exp}\big((\tilde{\boldsymbol\omega} - \mathbf b_g)\,\Delta t\big),\\
\mathbf v &\leftarrow \mathbf v + \big(R(\tilde{\mathbf f} - \mathbf b_a) + \mathbf g\big)\Delta t,\\
\mathbf p &\leftarrow \mathbf p + \mathbf v\,\Delta t,
\end{aligned}
$$

可以几乎无延迟地给出任意时刻的位姿。麻烦在于零偏 $\mathbf b\_g$ 和 $\mathbf b\_a$，它们永远无法精确知道。加速度计零偏误差 $\delta b\_a$ 经两次积分变成位置误差 $\tfrac12 \delta b\_a t^2$。陀螺零偏误差 $\delta b\_g$ 积分成倾斜误差 $\delta b\_g t$；倾斜使积分器在略有偏差的方向上扣除重力，留下 $g\,\delta b\_g t$ 的水平加速度，再积分两次得到 $\tfrac16 g\,\delta b\_g t^3$。下面的代码对一个实际上完全静止的头显做积分，零偏误差取示意性的 MEMS 量级：0.01 m/s²（约 1 mg）和 0.1°/s：

```python
import numpy as np

def skew(w):
    return np.array([[0, -w[2], w[1]], [w[2], 0, -w[0]], [-w[1], w[0], 0]])

def so3_exp(w):
    """Rodrigues: rotation vector (3,) -> rotation matrix."""
    th = np.linalg.norm(w)
    if th < 1e-12:
        return np.eye(3) + skew(w)
    A = skew(w / th)
    return np.eye(3) + np.sin(th) * A + (1 - np.cos(th)) * A @ A

def dead_reckon(T, dt, b_g, b_a):
    """Strapdown integration for a headset that is really at rest (world z up).
    The gyro reads b_g, the accelerometer reads the specific force -g plus b_a."""
    g = np.array([0.0, 0.0, -9.81])
    R, v, p = np.eye(3), np.zeros(3), np.zeros(3)
    out = []
    for _ in range(int(round(T / dt))):
        a = R @ (-g + b_a) + g            # acceleration the integrator believes in (world)
        p = p + v * dt + 0.5 * a * dt**2
        v = v + a * dt
        R = R @ so3_exp(b_g * dt)
        out.append(p.copy())
    return np.array(out)

dt = 1e-3
P_a = dead_reckon(10.0, dt, np.zeros(3), np.array([0.0, 0.01, 0.0]))       # accelerometer bias
P_g = dead_reckon(10.0, dt, np.array([np.deg2rad(0.1), 0, 0]), np.zeros(3))  # gyro bias about x
for t in (0.011, 0.033, 0.1, 1.0, 10.0):
    k = int(round(t / dt)) - 1
    print(f"t = {t:6.3f} s: accel bias {np.linalg.norm(P_a[k]) * 1e3:10.4f} mm,"
          f" gyro bias {np.linalg.norm(P_g[k]) * 1e3:10.4f} mm")
```

一个 90 Hz 帧（11 ms）之后，位置误差为 $0.6\ \mu$m；一个 30 Hz 相机间隔（33 ms）之后，加速度计零偏贡献 $5.4\ \mu$m，陀螺零偏贡献 $0.1\ \mu$m——可以忽略。1 秒后分别是 5.0 mm 和 2.8 mm，10 秒后是 0.5 m 和 2.85 m，正好符合 $\tfrac12 \delta b\_a t^2$ 与 $\tfrac16 g\,\delta b\_g t^3$ 的规律。IMU 对接下来几十毫秒是极好的传感器，对接下来一分钟则毫无用处。

### 2.2 相机约束漂移

相机正好相反。一幅图像给出相对于地图路标的绝对测量（只要路标可见就不漂移），但每秒只有 30 到 60 次，带有几十毫秒的曝光与处理延迟，而且在快速运动模糊、黑暗或无纹理的房间里会失效。VIO 把两者结合起来：IMU 在两帧图像之间传播状态，每幅图像对其进行校正，滤波器顺便估计零偏——正是这一点消除了 $t^2$ 与 $t^3$ 的增长。一个一维玩具模型可以展示这一机制。状态是位置、速度和加速度计零偏；IMU 以 1 kHz 预测；每 33 ms 到来一次噪声为 1 mm 的相机位置观测。

```python
import numpy as np

def vio_1d(T=4.0, dt=1e-3, cam_every=33, b_a=0.01, sa=2e-3, sc=1e-3, seed=1):
    """1D toy VIO. State x = [p, v, b] (position, velocity, accelerometer bias).
    The IMU (1 kHz) propagates the state; a camera position fix (every cam_every ms, std sc)
    corrects it. True motion: head sway p(t) = 5 cm * sin(2 pi 0.5 t)."""
    rng = np.random.default_rng(seed)
    n = int(round(T / dt))
    t = np.arange(1, n + 1) * dt
    w = 2 * np.pi * 0.5
    p_true, a_true = 0.05 * np.sin(w * t), -0.05 * w**2 * np.sin(w * t)
    x = np.array([0.0, 0.05 * w, 0.0])            # starts with the right velocity, unknown bias
    Pc = np.diag([1e-6, 1e-4, 1e-4])
    F = np.array([[1, dt, -0.5 * dt**2], [0, 1, -dt], [0, 0, 1]])
    Gq = np.array([0.5 * dt**2, dt, 0.0])
    Q = np.outer(Gq, Gq) * sa**2 / dt + np.diag([0, 0, 1e-10])
    H = np.array([[1.0, 0, 0]])
    est, sig = np.empty(n), np.empty(n)
    for k in range(n):
        a_meas = a_true[k] + b_a + sa / np.sqrt(dt) * rng.standard_normal()
        x = F @ x + np.array([0.5 * dt**2, dt, 0]) * a_meas      # predict with the IMU
        Pc = F @ Pc @ F.T + Q
        if (k + 1) % cam_every == 0:                               # camera update
            z = p_true[k] + sc * rng.standard_normal()
            S = H @ Pc @ H.T + sc**2
            Kg = Pc @ H.T / S
            x = x + (Kg * (z - x[0])).ravel()
            Pc = (np.eye(3) - Kg @ H) @ Pc
        est[k], sig[k] = x[0], np.sqrt(Pc[0, 0])
    return t, p_true, est, sig, x

t, p, est, sig, x = vio_1d()
e = (est - p)[t > 2.0] * 1e3
print(f"VIO after 2 s: RMS {np.sqrt(np.mean(e**2)):.3f} mm, max {np.abs(e).max():.3f} mm,"
      f" bias estimate {x[2]:.4f} m/s^2")
t2, p2, est2, _, _ = vio_1d(cam_every=10**9)                    # never update: IMU only
print(f"IMU only: {abs(est2 - p2)[999] * 1e3:.1f} mm after 1 s, {abs(est2 - p2)[-1] * 1e3:.1f} mm after 4 s")
```

有相机更新时，误差保持在 RMS 0.366 mm（最差 0.864 mm），滤波器也学到了零偏 $0.0100$ m/s²，四位有效数字内与真值一致。没有相机更新时，同一个 IMU 1 秒后偏差 3.0 mm，4 秒后偏差 72.5 mm。真实头显的 VIO 在 6DoF 中做同样的事，用的是多状态约束卡尔曼滤波器（MSCKF，Mourikis 与 Roumeliotis 2007）或带 IMU 预积分的滑动窗口优化（Forster 等 2017），两者在第 06 篇中都有讲解；它还会在线估计相机-IMU 外参和时间偏移，细化第 02 篇的出厂标定。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-imu-drift.svg" caption="左：静止头显纯 IMU 积分的位置误差（第 2.1 节代码），加速度计零偏 0.01 m/s²（橙）、陀螺零偏 0.1°/s（紫），双对数坐标。点线和虚线分别是 $\tfrac12 b\_a t^2$ 和 $\tfrac16 g\,b\_g t^3$；竖线标出一个 90 Hz 帧、一个 30 Hz 相机间隔和一秒。右：第 2.2 节一维玩具 VIO 在 2.0 到 2.5 s 之间的情况。误差（紫）在每次相机更新时跳变（灰线，每 33 ms 一次），其间轻微漂移；阴影带是滤波器自身的 $\pm2\sigma$。" %}

### 2.3 地图

单靠 VIO 仍会缓慢漂移：重力使横滚和俯仰可观，但全局位置和绕重力轴的旋转（偏航）无法从相机与 IMU 数据中观测到，其误差随行走距离增长。因此头显会维护一张**地图**：第 06 篇意义上的关键帧及其特征和三维点。地图有三个用途。重访已建图的地方可以校正漂移（回环）。空间锚点挂在地图上（第 9 节）。如果把地图保存下来，下一次会话就能在其中**重定位**，于是昨天放置的内容会出现在同一位置，VR 头显的游玩区边界也不必重新画一遍。第 9 节会回到重定位的原理。

## 3. 运动到光子延迟与预测

### 3.1 延迟从哪里来

**运动到光子延迟**（motion-to-photon latency）是从头部运动到显示器发出反映该运动的光之间的时间。下图是一个示意性的 90 Hz 流水线。应用在 2 ms 处采样预测的头部位姿，在 CPU 上做模拟并记录绘制命令，GPU 渲染两只眼的视图，合成器做镜片畸变校正，显示器在一个 11.1 ms 的刷新周期内逐行扫描输出这一帧。如果只用应用采样到的头部位姿，到扫描中点的延迟为 23.6 ms。因此头显运行时通常会在扫描输出前重新采样头部位姿，并修正已完成的图像（第 3.4 节）；这样，最后一次位姿采样到光子之间只剩 8.1 ms。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-m2p-timeline.svg" localized="true" caption="一个示意性的 90 Hz 帧。IMU 以 1 kHz 采样（刻度），跟踪相机以 30 Hz 采样。应用在 2 ms 读取头部位姿（橙点），GPU 渲染到 15 ms；后期重投影阶段在 17.5 ms 再次读取位姿（绿点）并重投影已完成的图像。显示器在 20 到 31.1 ms 扫描输出（蓝：行号随时间），所以中间一行的光子在 25.6 ms 发出（红星）。没有后期重投影时图像已经过去 23.6 ms；有了它是 8.1 ms。" %}

有两个细节很重要。第一，显示器和卷帘快门相机（第 01 篇第 3.5 节）一样，并不同时显示整幅图像：底部的行比顶部的行最多晚一个帧周期出现，所以运行时可以为图像的不同部分预测不同的位姿。第二，如果显示器在整个刷新周期内都点亮同一帧，当眼睛追随运动物体时，这一帧会在视网膜上拖出模糊；因此 VR 显示器采用**低余辉**（low persistence），每帧只在周期中的一小段时间内点亮。

在应用与头显运行时之间的标准 API OpenXR 中，这套机制体现在帧循环里：`xrWaitFrame` 返回 `predictedDisplayTime`，即运行时预测的该帧显示时刻（图中的红星代表这一时刻），应用再用 `xrLocateViews` 查询那个未来时刻的眼睛位姿。预测由运行时完成；应用只需使用它给出的时间。

### 3.2 延迟的代价

如果渲染器使用 $\Delta$ 秒之前的头部偏航角，画出的世界就旋转了 $\theta(t) - \theta(t - \Delta) \approx \omega\Delta$。普通转头时 $\omega = 100$°/s，延迟 $\Delta = 20$ ms 就是 $2° = 120'$：在 25 px/° 下是五十个显示像素。没有预测时，世界会明显地落后于每一次头部运动，并在头停下时弹回。在 Holloway（1997）对一套光学透视系统的分析中，即使在中等头速下，这种延迟误差也是最大的单一配准误差来源。

### 3.3 预测

解决办法是把位姿外推到光子时刻。陀螺直接给出角速度，陀螺读数的导数给出角加速度，于是泰勒级数

$$
\hat\theta(t) = \theta(t-\Delta) + \omega(t-\Delta)\,\Delta + \tfrac12\,\alpha(t-\Delta)\,\Delta^2
$$

可以在第一项（无预测）、第二项（**恒速度**）或第三项（**恒加速度**）之后截断。截断误差的主项分别是 $\omega\Delta$、$\tfrac12\alpha\Delta^2$ 和 $\tfrac16\dot\alpha\Delta^3$。高阶预测对平滑运动更准，但要对含噪测量求导：由相隔 $h$ 秒的两个陀螺样本估计的角加速度，噪声约为 $\sqrt2\,\sigma\_\omega/h$，在预测中还要乘以 $\tfrac12\Delta^2$。为了比较三者，取一次 0.6 s 内完成 60° 的快速转头，速度曲线为最小加加速度（minimum-jerk）形状——自主运动的平滑形状，并给陀螺加上每个样本 0.2°/s 的白噪声：

```python
import numpy as np

A_TURN, T_TURN = 60.0, 0.6             # a 60 degree turn in 0.6 s

def min_jerk(t, A, T):
    """Minimum-jerk head turn of amplitude A (deg) and duration T (s): angle, rate, acceleration."""
    s = np.clip(t / T, 0, 1)
    th = A * (10 * s**3 - 15 * s**4 + 6 * s**5)
    om = A / T * (30 * s**2 - 60 * s**3 + 30 * s**4)
    al = A / T**2 * (60 * s - 180 * s**2 + 120 * s**3)
    return th, om, al

def predict(t, lat, mode, gyro_noise=0.0, h=0.01, rng=None):
    """Yaw the renderer uses at photon time t, from IMU data that is lat seconds old.
    The orientation itself is assumed exact; the gyro rate has white noise (deg/s)."""
    th, om, _ = min_jerk(t - lat, A_TURN, T_TURN)
    if rng is not None:
        om = om + gyro_noise * rng.standard_normal(np.shape(t))
    if mode == "none":
        return th
    if mode == "velocity":
        return th + om * lat
    _, om_old, _ = min_jerk(t - lat - h, A_TURN, T_TURN)       # rate h seconds earlier
    if rng is not None:
        om_old = om_old + gyro_noise * rng.standard_normal(np.shape(t))
    return th + om * lat + 0.5 * (om - om_old) / h * lat**2    # constant acceleration

t = np.arange(0, 1.0, 1e-3)
truth, om, al = min_jerk(t, A_TURN, T_TURN)
print(f"peak rate {om.max():.1f} deg/s, peak acceleration {np.abs(al).max():.0f} deg/s^2")
rng = np.random.default_rng(0)
for lat in (0.010, 0.020, 0.040):
    row = []
    for mode in ("none", "velocity", "acceleration"):
        e = 60 * np.abs(predict(t, lat, mode) - truth)                   # arcmin
        en = 60 * np.abs(predict(t, lat, mode, 0.2, rng=rng) - truth)    # with gyro noise
        row.append(f"{mode} {e.max():.1f}' ({en.max():.1f}')")
    print(f"{lat * 1e3:.0f} ms: " + ", ".join(row))
```

这次转头的峰值角速度为 187.5°/s，峰值角加速度为 962°/s²。最大误差（括号内为有陀螺噪声时）如下：

| 延迟 | 无预测 | 恒速度 | 恒加速度 |
| --- | --- | --- | --- |
| 10 ms | $112.5'$ | $2.9'$ ($3.1'$) | $0.4'$ ($0.9'$) |
| 20 ms | $224.8'$ | $11.5'$ ($12.1'$) | $2.1'$ ($3.6'$) |
| 40 ms | $448.7'$ | $46.0'$ ($46.7'$) | $12.5'$ ($15.3'$) |

三点结论。预测效果巨大：在 20 ms 时，它把 $3.7°$ 的误差降到五分之一度。其残差随预测时长按**平方**（恒速度）或大致按**立方**（恒加速度；由最近 10 ms 估计的角加速度会带来一个平方项）增长，所以缩短预测时长与改进预测器同样有价值。噪声会侵蚀高阶预测的收益，时长越长越明显；真实头部运动也没有最小加加速度曲线那么平滑，这在运动开始和结束时对高阶预测器的伤害最大。因此实用的预测器保持低阶、对陀螺做滤波，并让预测时长尽量短；LaValle 等（2014）描述了早期一款消费级头显的姿态跟踪与预测。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-prediction.svg" caption="左：60° 最小加加速度转头期间，$\Delta=20$ ms 时的偏航误差：无预测（红）、恒速度（橙）、恒加速度（紫，无噪声；浅色曲线为加入 0.2°/s 陀螺噪声后的结果）；灰色虚线是头部角速度（右轴，峰值 187.5°/s）。恒速度预测器在角加速度峰值附近（约 130 ms 与 470 ms）误差最大，恒加速度预测器在加加速度峰值处误差最大。右：含陀螺噪声时，整个转头过程的最大误差随延迟 $\Delta$ 的变化。点线为 25 px/° 下的一个显示像素。" %}

### 3.4 后期重投影

20 ms 或更长时间的预测永远不可能完美，所以运行时还会缩短预测时长：帧用预测位姿渲染完之后，**后期重投影**（late warp，又称 timewarp 或 reprojection）在扫描输出前几毫秒重新采样位姿，并把已完成的图像变换到新位姿。van Waveren（2016）描述了如何在消费级硬件上异步地完成这一步，使得即使应用错过了一帧，每次刷新也都有新的重投影。

**仅旋转重投影。** 如果在渲染与显示之间头部只旋转了 $R\_{\Delta}$（从旧相机到新相机），每个像素都按第 01 篇的旋转单应移动：

$$
\tilde{\mathbf u}' \sim K\,R_{\Delta}\,K^{-1}\,\tilde{\mathbf u},
$$

它不需要深度，每个像素只需一次纹理查找。对旋转它是精确的。对眼睛的平移 $\mathbf b$，深度为 $Z$ 的点会差出视差 $f\,b\_\perp/Z$ 像素，也就是第 04 篇的视差公式。

**基于深度的重投影。** 借助渲染出的深度缓冲，每个像素都可以反投影、移动、再精确投影：$\tilde{\mathbf u}' \sim K(R\_\Delta Z K^{-1}\tilde{\mathbf u} + \mathbf t\_\Delta)$，平移也能处理。代价是去遮挡（disocclusion）：移动后的眼睛现在能看到的背景从未被渲染过，必须以某种方式填补。

```python
import numpy as np

def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

f, W, H = 300.0, 320, 240
K = np.array([[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]])
R_w1, C1 = rot_y(np.deg2rad(2.0)), np.array([0.04, 0.0, 0.0])   # turned 2 deg right, moved 4 cm
R_10, t_10 = R_w1.T, -R_w1.T @ C1                                # old camera -> new camera
Hrot = K @ R_10 @ np.linalg.inv(K)                                # rotation-only reprojection
for name, X in (("plate", [0.0, 0.05, 0.6]), ("pillar", [0.65, 0.0, 2.0]), ("wall", [-1.0, 0.0, 4.0])):
    X = np.array(X)
    u_true = K @ (R_10 @ X + t_10); u_true = u_true[:2] / u_true[2]
    u_rot = Hrot @ (K @ X); u_rot = u_rot[:2] / u_rot[2]
    print(f"{name:6s} Z = {X[2]:.1f} m: rotation-only warp is off by {np.linalg.norm(u_true - u_rot):5.2f} px"
          f"  (f b / Z = {f * 0.04 / X[2]:5.2f} px)")
```

在延迟期间头部转动 2° 并移动 4 cm 时，仅旋转重投影在 0.6 m 处的平板上偏差 20.07 px，在 2 m 处的柱子上偏差 5.88 px，在 4 m 处的墙上偏差 3.06 px，与 $f b/Z$ = 20、6、3 px 一致。下图渲染了这个场景。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-timewarp.svg" caption="一个光线投射的玩具场景：4 m 处的棋盘格墙、2 m 处的青色柱子和 0.6 m 处的橙色平板，320×240 像素，$f=300$。(a) 在旧头部位姿渲染的帧。(b) 新位姿（向右转 2°、向右移 4 cm）下的真值。(c) 对 (a) 做仅旋转重投影：远处的墙几乎正确，但近处的平板比其真实轮廓（虚线）落后 20 px；品红色像素位于旧帧之外。(d) 对 (a) 做基于深度的重投影：平板落在轮廓上，但它让出来的背景（右侧的品红条带）从未被渲染。整幅图像中，(c) 之后有 26.1% 的像素是错的，(d) 之后为 1.1%（另有 8.3% 的空洞）。" %}

实际运行时会组合这两种思路：每帧都做旋转重投影；当应用提供深度或掉帧时，做基于深度或运动矢量的外推；再用相邻背景做简单的空洞填补。第 5 节会说明，透视视频是同一个问题，只是变换不同。

## 4. 配准误差预算

### 4.1 视差误差的统一公式

若干误差来源共享同一种几何。设距离 $d$ 处一点的图像在视点 $O'$ 上被正确地形成，但为真实的眼睛 $O$ 画出时，却当作它位于距离 $d\_0$ 处（显示焦平面上、某个假设平面上、无穷远处）。若 $O'$ 相对 $O$ 偏移 $\mathbf b$，则眼睛处的角度误差在 $b/d$ 的一阶近似下为

$$
\varepsilon \approx b_\perp \left|\frac1d - \frac1{d_0}\right| ,
$$

其中 $b\_\perp$ 是 $\mathbf b$ 垂直于视线的分量。当 $d = d\_0$ 时误差为零，对近处的点则像 $b\_\perp/d$ 一样增长。具体情形有：

- **仅旋转的后期重投影**：$\mathbf b$ 是残余延迟期间的头部平移，$d\_0 = \infty$（第 3.4 节）；
- **光学透视显示中的眼睛位置误差**：$\mathbf b$ 是假设的眼睛位置的误差，$d\_0$ 是显示焦平面（光学系统形成的虚像）的距离；
- **假设深度的透视显示**：$\mathbf b$ 是相机到眼睛的偏移，$d\_0$ 是假设的场景深度（第 5 节）；
- **跟踪平移误差**：$\mathbf b = \delta\mathbf p$，$d\_0 = \infty$。

### 4.2 累加预算

配准误差预算列出每个误差来源的 1σ 大小及其与距离的关系，并把相互独立的项按平方和开根（RSS）合成。下面的数值是对一台工程上做得很好的光学透视头显的示意；Holloway（1997）对一套手术规划系统做了更详细的同类分析。

```python
import numpy as np

ARCMIN = 60 * 180 / np.pi            # radians -> arcminutes

def parallax(b, d, d0=np.inf):
    """Angular error (rad) of a point at depth d when the image is formed for depth d0
    from a viewpoint displaced by b perpendicular to the line of sight."""
    return b * np.abs(1 / d - 1 / d0)

def budget(d):
    """1-sigma contributions in arcminutes for a virtual object at distance d (metres).
    Illustrative values for a well-engineered optical see-through headset."""
    return {
        "tracking rotation (0.02 deg)": np.full_like(d, 0.02 * 60),
        "tracking translation (1 mm)": parallax(1e-3, d) * ARCMIN,
        "latency after prediction": np.full_like(d, 3.0),
        "display calibration (0.03 deg)": np.full_like(d, 0.03 * 60),
        "eye position (2 mm, focal plane 2 m)": parallax(2e-3, d, 2.0) * ARCMIN,
        "camera-IMU time offset (0.5 ms at 50 deg/s)": np.full_like(d, 0.5e-3 * 50 * 60),
    }

d = np.array([0.3, 0.5, 1.0, 2.0, 4.0])
B = budget(d)
for name, v in B.items():
    print(f"{name:45s}" + "".join(f"{x:7.2f}" for x in v))
total = np.sqrt(sum(v**2 for v in B.values()))
print(f"{'total (root sum of squares), arcmin':45s}" + "".join(f"{x:7.2f}" for x in total))
print(f"{'total at the object, mm':45s}" + "".join(f"{x:7.2f}" for x in total / ARCMIN * d * 1e3))
print(f"{'display pixels at 25 px/deg':45s}" + "".join(f"{x:7.2f}" for x in total / 60 * 25))
```

延迟一项给出 $3'$ 的余量，对应第 3 节的恒速度预测器在后期重投影后剩下的 8 ms 上的表现：对那一节的快速转头，8 ms 时的最大误差为 $1.85'$。输出（单位：角分）：

| 来源 | 0.3 m | 0.5 m | 1 m | 2 m | 4 m |
| --- | --- | --- | --- | --- | --- |
| 跟踪旋转（0.02°） | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 |
| 跟踪平移（1 mm） | 11.46 | 6.88 | 3.44 | 1.72 | 0.86 |
| 预测后的残余延迟 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| 显示标定（0.03°） | 1.80 | 1.80 | 1.80 | 1.80 | 1.80 |
| 眼睛位置（2 mm，焦平面 2 m） | 19.48 | 10.31 | 3.44 | 0.00 | 1.72 |
| 相机-IMU 时间偏移（0.5 ms） | 1.50 | 1.50 | 1.50 | 1.50 | 1.50 |
| **总计（RSS）** | **22.95** | **13.02** | **6.29** | **4.35** | **4.43** |
| 物体处的总误差（mm） | 2.00 | 1.89 | 1.83 | 2.53 | 5.15 |
| 25 px/° 下的显示像素 | 9.56 | 5.43 | 2.62 | 1.81 | 1.85 |

读这样的预算能告诉你该把精力花在哪里。在手臂距离（0.3 到 0.5 m），也就是手和工具所在的地方，平移类误差占主导：眼睛究竟在哪里、头究竟在哪里。超过 2 m 后，角度类误差（延迟、显示标定、旋转）接管。以毫米计的总误差在 1 m 以内几乎不变，之后随距离增大：同样的角度覆盖了物体上更大的范围。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-budget.svg" localized="true" caption="左：预算代码中的六项贡献及其 RSS 总和（黑）随虚拟物体距离的变化，双对数坐标。平移类项按 $1/d$ 下降；眼睛位置项在 2 m 焦平面处为零，超过后又回升；角度类项是水平线。点线是 25 px/° 下的一个显示像素。右：同一总误差换算为物体处的横向偏移（毫米）。" %}

## 5. 透视（passthrough）混合现实

**视频透视**（video see-through，passthrough）头显通过自己的相机显示真实世界。这消除了光学透视的问题（虚拟内容可以不透明并被正确遮挡，两个世界的延迟和亮度相同），却带来一个新问题：相机不在眼睛的位置。它们位于眼睛前方几厘米，左右间距往往与瞳距不同，内参和镜头畸变也不同。如果把每台相机的图像直接显示给一只眼，世界会显得更近、更大、发生偏移，并且转头时会以错误的方式移动。因此透视本质上是一个**视图合成**（view synthesis）问题：在严格的延迟预算内，从眼睛的视点重新渲染相机图像。

### 5.1 借助深度的重投影

若相机像素 $\tilde{\mathbf u}\_C$ 有深度 $Z$，到眼睛的重投影就是第 3.4 节的深度重投影，只是换成相机到眼睛的变换：

$$
\lambda\,\tilde{\mathbf u}_E = K_E\big(R_{EC}\,Z\,K_C^{-1}\tilde{\mathbf u}_C + \mathbf t_{EC}\big).
$$

如果没有逐像素深度，最简单的近似是假设整个场景位于距离 $d\_0$ 的平面上；此时映射变为平面诱导单应（第 04 篇）：对相机坐标中的平面 $\mathbf n^\top\mathbf X = d\_0'$，$H = K\_E\big(R\_{EC} + \mathbf t\_{EC}\mathbf n^\top/d\_0'\big)K\_C^{-1}$。不在平面上的点会产生第 4.1 节的视差误差，其中 $b\_\perp$ 为相机到眼睛的偏移。下面的代码对一台位于眼睛侧方 3.2 cm、前方 7 cm 的相机，计算正前方各点的精确误差：

```python
import numpy as np

ARCMIN = 60 * 180 / np.pi

def passthrough_error(X_e, c, d0=None, depth_scale=1.0):
    """Angular error (arcmin) at the eye (origin of the eye frame, OpenCV axes) when a point
    X_e seen by a camera centred at c is reprojected to the eye. The camera is a rotation-free
    offset of the eye here, so camera coordinates are X_e - c. The reprojection either assumes
    a fronto-parallel plane at depth d0 (measured from the eye), or uses the true depth times
    depth_scale."""
    Xc = X_e - c                                   # the point in the camera frame
    ray = Xc / Xc[2]                               # normalized camera ray (x, y, 1) = K^-1 u
    Z = d0 - c[2] if d0 is not None else Xc[2] * depth_scale
    X_rec = c + Z * ray                            # back-projected point, in the eye frame
    a, b = X_e / np.linalg.norm(X_e), X_rec / np.linalg.norm(X_rec)
    return np.arccos(np.clip(a @ b, -1, 1)) * ARCMIN

c = np.array([0.032, 0.0, 0.07])                    # camera 3.2 cm to the side, 7 cm in front
for d in (0.3, 0.5, 1.0, 2.0, 5.0):
    X = np.array([0.0, 0.0, d])                    # a point straight ahead of the eye
    e1 = passthrough_error(X, c, d0=1.0)
    e2 = passthrough_error(X, c, d0=2.0)
    e3 = passthrough_error(X, c, depth_scale=1.03)  # per-pixel depth, 3% too far
    approx = 0.032 * abs(1 / d - 1 / 1.0) * ARCMIN
    print(f"d = {d:3.1f} m: plane at 1 m {e1:6.1f}' (first order {approx:6.1f}'), "
          f"plane at 2 m {e2:6.1f}', depth +3% {e3:5.1f}'")
```

| 真实深度 $d$ | 1 m 平面 | 一阶公式 | 2 m 平面 | 逐像素深度，3% 误差 |
| --- | --- | --- | --- | --- |
| 0.3 m | $333.8'$ | $256.7'$ | $404.7'$ | $10.8'$ |
| 0.5 m | $127.9'$ | $110.0'$ | $191.7'$ | $6.4'$ |
| 1.0 m | $0.0'$ | $0.0'$ | $59.1'$ | $3.2'$ |
| 2.0 m | $57.0'$ | $55.0'$ | $0.0'$ | $1.6'$ |
| 5.0 m | $89.2'$ | $88.0'$ | $33.5'$ | $0.6'$ |

单一平面只在其深度附近可用：用 1 m 平面时，30 cm 处的手偏差超过 $5°$，足以让你伸手时抓不到杯子。一阶公式对近处的点低估多达四分之一，因为 7 cm 的前向偏移相对 0.3 m 并不小。逐像素深度把误差变成 $b\_\perp\,\sigma\_d/d^2$（$\sigma\_d$ 为深度误差）：3% 的误差下，即使在 30 cm 处误差也在 $10'$ 左右或更小。这就是透视系统要估计深度的原因：Chaurasia 等（2020）描述了一套移动端透视系统，它在专用硬件上从双目相机计算粗略的深度代理，再加密、滤波并为每只眼实时重渲染；Xiao 等（2022）用学习式视图合成网络取代了手工设计的重建。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-passthrough.svg" caption="左：几何关系的俯视图，眼睛 $E$ 位于原点，相机 $C$ 在侧方 3.2 cm、前方 7 cm。相机沿青色光线看到 0.45 m 处的点 $\mathbf X$；假设平面 $d\_0=1$ m 会把它放到 $\mathbf X'$，眼睛于是沿红线而非绿线看它，偏差 $194'$。右：正前方各点的角度误差随深度的变化：1 m、2 m 和无穷远平面，一阶公式（点线），以及尺度误差为 3% 和 1% 的逐像素深度（绿、青）。水平点线为 25 px/° 下的一个像素。" %}

### 5.2 延迟与流水线的其他部分

透视图像也有自己的运动到光子延迟，从相机曝光到显示；第 3.4 节的后期重投影机制同样适用。相机图像还需要第 01 篇的镜头模型（透视相机通常是广角）、颜色与曝光处理，以及针对显示光学的逐眼去畸变。由于真实内容与虚拟内容经过同一次重投影，透视头显可以让两者彼此保持一致，即使二者相对真实世界都略有偏差；光学透视头显做不到这一点，因为真实世界不经任何延迟直接到达眼睛。

## 6. 手部追踪

手柄带有 LED 或自己的相机与 IMU；手部追踪则用头显的跟踪相机直接看用户的手来取代手柄。Han 等（2020）描述了一款消费级头显中的系统：检测网络在单色鱼眼图像中找到手，关键点网络利用之前的帧估计每个视图中的二维手部关键点，模型拟合阶段再求解运动学手部骨架的姿态（关节角加腕部位姿），使其在时间上最好地解释所有视图中的关键点。UmeTrack（Han 等 2022）把多视图部分做成端到端：一个网络接收多个视图和多帧，直接输出世界坐标系中的三维姿态。MANO 等人体与手部模型及其在机器人遥操作中的应用，见[具身智能第 6 篇]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})。

### 6.1 两台相机能把指尖定位得多准？

几何就是第 04 篇的三角化，只是距离很近、基线很短。对焦距 $f$、基线 $b$ 的校正双目，由视差求深度为 $Z = fb/\delta$，所以视差误差 $\sigma\_\delta$ 带来 $\sigma\_Z = Z^2\sigma\_\delta/(fb)$。若每个关键点在每幅图像中有独立噪声 $\sigma$，则 $\sigma\_\delta = \sqrt2\,\sigma$。下面的代码用 DLT 三角化，并用数值雅可比 $J$ 把像素噪声一阶传播为 $\Sigma\_X = J\,\sigma^2 J^\top$，再用蒙特卡洛验证：

```python
import numpy as np

def triangulate(us, Ps):
    """Linear (DLT) triangulation of one point from pixels us[i] seen by cameras Ps[i] (3x4)."""
    A = []
    for (u, v), P in zip(us, Ps):
        A += [u * P[2] - P[0], v * P[2] - P[1]]
    X = np.linalg.svd(np.array(A))[2][-1]
    return X[:3] / X[3]

def project(P, X):
    x = P @ np.append(X, 1.0)
    return x[:2] / x[2]

def cov_triangulated(X, Ps, sigma_px, eps=1e-6):
    """First-order covariance of the triangulated point: Sigma = J diag(sigma^2) J^T,
    with J the numerical Jacobian of triangulate() with respect to all pixel coordinates."""
    z = np.concatenate([project(P, X) for P in Ps])
    J = np.zeros((3, z.size))
    for j in range(z.size):
        dz = np.zeros(z.size); dz[j] = eps
        J[:, j] = (triangulate((z + dz).reshape(-1, 2), Ps)
                   - triangulate((z - dz).reshape(-1, 2), Ps)) / (2 * eps)
    return J @ J.T * sigma_px**2

f, b = 280.0, 0.10                        # focal length (px) and baseline (m) of the stereo pair
K = np.array([[f, 0, 320], [0, f, 240], [0, 0, 1]])
Ps = [K @ np.c_[np.eye(3), [b / 2, 0, 0]], K @ np.c_[np.eye(3), [-b / 2, 0, 0]]]  # centres x = -+b/2
rng = np.random.default_rng(0)
for Z in (0.3, 0.5, 0.7):
    X = np.array([0.0, 0.1, Z])           # a fingertip 10 cm below eye level
    sx, sy, sz = np.sqrt(np.diag(cov_triangulated(X, Ps, 1.0))) * 1e3
    mc = np.array([triangulate([project(P, X) + rng.normal(0, 1.0, 2) for P in Ps], Ps)
                   for _ in range(2000)])
    print(f"Z = {Z:.1f} m: sigma_x {sx:.2f}, sigma_y {sy:.2f}, sigma_z {sz:.2f} mm"
          f" (sqrt(2) Z^2/(f b) = {np.sqrt(2) * Z**2 / (f * b) * 1e3:.2f}), Monte Carlo {mc[:, 2].std() * 1e3:.2f} mm")
```

在 $f = 280$ px、10 cm 基线、1 px 关键点噪声下，深度不确定度在 0.3 m 处为 4.55 mm，0.5 m 处为 12.63 mm，0.7 m 处为 24.75 mm，与 $\sqrt2 Z^2/(fb)$ 及蒙特卡洛结果（4.52、12.25、24.48 mm）一致。横向精度高 $2Z/b$ 倍，这里是 6 到 14 倍：$\sigma\_x \approx Z\sigma/(\sqrt2 f)$ = 0.76、1.26、1.77 mm。因此指尖在图像方向上定位得很准，在深度方向上很差——而这恰恰发生在手伸出去触碰东西的时候。真实系统通过更多视图、手部模型（骨长固定了关节间的尺度）和时间滤波来缓解，这就是下一个话题。

### 6.2 抖动与滞后：1€ 滤波器

关键点噪声会变成抖动，让按钮难以按准；强低通滤波能去除抖动却带来滞后，让手感变得沉重。固定截止频率无法两全。Casiez、Roussel 与 Vogel（2012）的 **1€ 滤波器**是一个截止频率随估计速度增大的一阶低通滤波器：$f\_c = f\_{c,\min} + \beta\,\lvert\dot{\hat x}\rvert$，其中 $\beta$ 把 m/s 的速度换算成赫兹，因此单位是 1/m。静止时截止频率低、抖动被抑制；快速运动时截止频率升高、滞后缩小。

```python
import numpy as np

def alpha(cutoff, dt):
    """Smoothing factor of a first-order low-pass filter with this cutoff frequency (Hz)."""
    tau = 1.0 / (2 * np.pi * cutoff)
    return 1.0 / (1.0 + tau / dt)

def one_euro(x, dt, min_cutoff=1.0, beta=0.0, d_cutoff=1.0):
    """1-euro filter (Casiez et al. 2012): the cutoff grows with the filtered speed."""
    y, dy = np.empty_like(x), 0.0
    y[0] = x[0]
    for k in range(1, len(x)):
        d = (x[k] - y[k - 1]) / dt                      # raw speed estimate
        dy = dy + alpha(d_cutoff, dt) * (d - dy)        # smoothed speed
        a = alpha(min_cutoff + beta * abs(dy), dt)      # adaptive cutoff
        y[k] = y[k - 1] + a * (x[k] - y[k - 1])
    return y

dt = 1 / 60.0                                           # hand tracking at 60 Hz
t = np.arange(0, 3, dt)
s = np.clip((t - 1.0) / 0.3, 0, 1)
truth = 0.10 * (10 * s**3 - 15 * s**4 + 6 * s**5)       # 10 cm reach in 0.3 s, rest before/after
meas = truth + 0.002 * np.random.default_rng(3).standard_normal(t.size)   # 2 mm keypoint noise
rest, move = t < 1.0, (t >= 1.0) & (t < 1.5)
for name, y in [("raw", meas), ("low-pass 1 Hz", one_euro(meas, dt, 1.0, 0.0)),
                ("low-pass 5 Hz", one_euro(meas, dt, 5.0, 0.0)),
                ("1-euro (1 Hz, beta 30)", one_euro(meas, dt, 1.0, 30.0))]:
    jitter = np.std(y[rest][20:] - truth[rest][20:]) * 1e3
    lag = np.abs(y[move] - truth[move]).max() * 1e3
    print(f"{name:24s} jitter at rest {jitter:5.2f} mm   max error while moving {lag:5.1f} mm")
```

| 滤波器 | 静止时的抖动 | 伸手过程中的最大误差 |
| --- | --- | --- |
| 原始 | 1.95 mm | 4.3 mm |
| 低通 1 Hz | 0.34 mm | 53.4 mm |
| 低通 5 Hz | 0.79 mm | 18.6 mm |
| 1€（1 Hz，$\beta = 30$ m⁻¹） | 0.46 mm | 10.5 mm |

1€ 滤波器几乎保留了 1 Hz 滤波器全部的去抖效果，而伸手过程中的滞后小了五倍；它在两项指标上都胜过 5 Hz 滤波器。两个参数按作者建议的顺序调节：先调 $f\_{c,\min}$ 使静止抖动可接受，再调 $\beta$ 使快速运动的滞后可接受。捏合、抓取等手势再根据滤波后指尖之间的距离来检测，并带有迟滞（闭合与张开用不同阈值），避免状态闪烁。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-hand.svg" localized="true" caption="左：相距 10 cm 的双目相机（$f=280$ px，青色为视场）的俯视图，以及在 1 px 关键点噪声下三角化各点的 1σ 不确定度椭圆（放大三倍）。椭圆沿视线方向拉长，并按 $Z^2$ 增大。右：指尖先静止，然后在 0.3 s 内伸出 10 cm，以 60 Hz、2 mm 噪声测量（灰），以及三种滤波器的结果；图例给出静止时的抖动和伸手过程中的最大误差。" %}

## 7. 眼动追踪

头显中的眼动追踪器估计每只眼在看哪里，用于交互（看 + 捏）、**注视点渲染**（foveated rendering：只在中央凹所指之处以全分辨率渲染；Patney 等 2016 研究了周边可以降低多少而不被察觉）、设置渲染瞳距，以及变焦或其他依赖注视的光学系统。它的几何本身就是一个小型三维视觉问题。

### 7.1 瞳孔与角膜反射点

每个镜片周围的红外 LED 照亮眼睛，一台小相机从下方斜着观察。提取两种特征：**瞳孔中心**（一个暗椭圆）以及一个或多个**角膜反射点**（glint），即 LED 在角膜上的镜面反射。角膜近似为半径约 7.8 mm 的球，球心位于眼球旋转中心前方约 5 mm；眼球转动时，瞳孔中心沿着比角膜球心更大的球面运动，而角膜反射点停留在固定的 LED 与相机所决定的反射位置附近。**瞳孔中心-角膜反射**（PCCR）方法使用图像中从角膜反射点指向瞳孔中心的向量。它的关键性质是对头显轻微滑动的鲁棒性：相机相对头部平移时，瞳孔和反射点移动的量几乎相同，所以二者之差的变化远小于各自的变化。Guestrin 与 Eizenman（2006）给出了完整的三维理论；这里我们仿真最简单的回归式版本。

仿真把模型眼放在原点，相机位于眼睛下方 15 mm、前方 35 mm，朝向眼球中心，LED 紧挨着相机。角膜反射点取在角膜球面法线平分指向 LED 与指向相机方向的位置。9 点标定（注视目标在 $\pm15°$）拟合一个从图像特征到注视角的二阶多项式。然后在 $\pm20°$ 的注视方向网格上评估，特征噪声 0.2 px，头显向下滑动 0、0.5 和 1 mm。

```python
import numpy as np

R_CORNEA, D_CORNEA, D_PUPIL = 7.8e-3, 5.3e-3, 9.5e-3   # model eye (m): cornea radius, distances
                                                         # of cornea centre and pupil centre from
                                                         # the eye's centre of rotation
CAM_EYE = np.array([0.0, 0.015, 0.035])                  # eye camera: 15 mm below, 35 mm in front
LED_EYE = np.array([-0.012, 0.015, 0.035])               # IR LED next to it
_z = -CAM_EYE / np.linalg.norm(CAM_EYE)                  # the camera looks at the eye centre
_x = np.cross([0.0, 1.0, 0.0], _z); _x /= np.linalg.norm(_x)
R_CAM = np.stack([_x, np.cross(_z, _x), _z])             # rows: camera axes in the eye frame
K_EYE = np.array([[600.0, 0, 200], [0, 600.0, 200], [0, 0, 1]])

def look(yaw, pitch):
    """Optical axis for gaze angles in degrees (eye frame: x right, y down, z forward)."""
    h, v = np.deg2rad(yaw), np.deg2rad(pitch)
    return np.array([np.sin(h) * np.cos(v), -np.sin(v), np.cos(h) * np.cos(v)])

def glint(c, cam, led, iters=30):
    """Point on the corneal sphere (centre c) that reflects the LED into the camera:
    there the surface normal bisects the directions to the LED and to the camera."""
    q = c + R_CORNEA * (cam - c) / np.linalg.norm(cam - c)
    for _ in range(iters):
        n = (led - q) / np.linalg.norm(led - q) + (cam - q) / np.linalg.norm(cam - q)
        q = c + R_CORNEA * n / np.linalg.norm(n)
    return q

def eye_image(yaw, pitch, slip=np.zeros(3)):
    """Pixels of the pupil centre and the glint. slip translates the headset (camera and LED)
    relative to the eye after calibration; the camera does not rotate."""
    cam, led = CAM_EYE + slip, LED_EYE + slip
    a = look(yaw, pitch)
    uv = []
    for X in (D_PUPIL * a, glint(D_CORNEA * a, cam, led)):   # pupil (refraction ignored), glint
        x = K_EYE @ (R_CAM @ (X - cam))
        uv.append(x[:2] / x[2])
    return uv

def feature(yaw, pitch, mode, slip=np.zeros(3), noise=0.0, rng=None):
    p, g = eye_image(yaw, pitch, slip)
    if rng is not None:
        p, g = p + noise * rng.standard_normal(2), g + noise * rng.standard_normal(2)
    return p - g if mode == "pccr" else p

def poly2(f):
    x, y = f
    return np.array([1, x, y, x * y, x * x, y * y])

def calibrate(mode, targets):
    F = np.array([poly2(feature(h, v, mode)) for h, v in targets])
    return np.linalg.lstsq(F, np.array(targets, float), rcond=None)[0]   # 6 x 2

targets = [(h, v) for v in (-15, 0, 15) for h in (-15, 0, 15)]
grid = [(h, v) for v in np.linspace(-20, 20, 9) for h in np.linspace(-20, 20, 9)]
inner = np.array([abs(h) <= 15 and abs(v) <= 15 for h, v in grid])
rng = np.random.default_rng(0)
for mode in ("pupil", "pccr"):
    Cf = calibrate(mode, targets)
    for slip_mm in (0.0, 0.5, 1.0):
        slip = np.array([0.0, slip_mm * 1e-3, 0.0])      # the headset slides down
        err = np.array([np.hypot(*(poly2(feature(h, v, mode, slip, 0.2, rng)) @ Cf - (h, v)))
                        for h, v in grid])
        print(f"{mode:5s} slip {slip_mm:.1f} mm: mean {err[inner].mean():.2f} deg inside +-15,"
              f" {err.mean():.2f} over +-20, max {err.max():.2f}")
```

| 特征 | 无滑动 | 滑动 0.5 mm | 滑动 1 mm |
| --- | --- | --- | --- |
| 仅瞳孔 | 0.33° | 3.18° | 6.42° |
| 瞳孔 − 反射点（PCCR） | 0.48° | 0.71° | 1.24° |

（表中为标定范围 $\pm15°$ 内的平均误差。在整个 $\pm20°$ 网格上，多项式需要外推，PCCR 的平均误差为 0.63°、0.85° 和 1.32°，最大可达 3.31°。）

无滑动时仅用瞳孔略好，因为减去反射点会叠加它的噪声和它自身的非线性。但一毫米的滑动——头显被碰一下或面部肌肉一动就会发生——会让仅瞳孔映射的误差超过六度，而 PCCR 只有约一度。即使 PCCR 也不是对滑动完全不变的，因为反射点是曲面上的反射，移动方式与瞳孔并不完全相同；重建三维角膜中心与瞳孔的基于模型的方法（Guestrin 与 Eizenman 2006）以及学习式方法更进一步。我们的玩具模型省略了两项实际上很重要的修正：瞳孔是透过折射的角膜被看到的；以及**视轴**（经过中央凹）与光轴相差几度，这一因人而异的偏移由用户标定吸收。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-eye.svg" localized="true" caption="左：九个标定注视方向下仿真的眼部相机图像：瞳孔中心（紫）、角膜反射点（橙色叉）以及瞳孔-反射点向量（灰）。浅色标记是头显下滑 1 mm 后相同注视方向的结果：瞳孔和反射点都上移约 17 px，而二者之差变化小得多。右：标定范围 ±15° 内的平均注视误差随滑动量的变化，分别为仅瞳孔与 PCCR。" %}

对注视点渲染而言，延迟再次变得重要：扫视（saccade，眼睛在注视点之间的快速跳动）可达每秒数百度，高分辨率区域必须在眼睛落定后很快到达新的注视点，赶在扫视之后视觉敏感度仍然降低的时段内（扫视抑制，saccadic suppression）完成，否则粗糙的周边画面就会被看到。首页的 [Interactive Lab]({{ '/' | relative_url }}#lab) 有一个注视点渲染演示，可以看到分辨率如何随离心率下降。

## 8. 场景理解

为了合理地放置内容、让虚拟球从地板上弹起、或把虚拟物体藏在真实沙发后面，头显需要房间的模型，而不只是自身的位姿。常见的有三个层次。

**平面。** 地板、墙、桌面和天花板覆盖了室内场景的大部分，平面的估计和使用都很廉价。跟踪器提供重力方向，它把平面分为水平面（法线平行于重力：地板、桌面、天花板）和竖直面（墙），也让搜索更容易。主力方法是对来自深度或三角化特征的三维点做顺序 RANSAC：找到最好的平面，去掉其内点，重复。

```python
import numpy as np

def make_room(rng, noise=0.005):
    """Synthetic depth-sensor points of a room corner (world: z up, metres):
    floor, two walls, a table top 0.75 m high, plus clutter."""
    def patch(n, f):
        u, v = rng.random(n), rng.random(n)
        return f(u, v)
    parts = [
        patch(3000, lambda u, v: np.c_[3 * u, 3 * v, 0 * u]),                       # floor z = 0
        patch(2000, lambda u, v: np.c_[0 * u, 3 * u, 2.5 * v]),                     # wall x = 0
        patch(1500, lambda u, v: np.c_[3 * u, 0 * u, 2.5 * v]),                     # wall y = 0
        patch(600, lambda u, v: np.c_[1.4 + 1.0 * u, 1.2 + 0.6 * v, 0.75 + 0 * u]),  # table top
        patch(500, lambda u, v: np.c_[3 * u, 3 * v, 2.0 * rng.random(u.size)]),     # clutter
    ]
    P = np.vstack(parts)
    return P + noise * rng.standard_normal(P.shape)

def fit_plane(P):
    """Least-squares plane n.x = d through points P (n = smallest singular vector)."""
    c = P.mean(axis=0)
    n = np.linalg.svd(P - c)[2][-1]
    return n, n @ c

def ransac_plane(P, thr, iters, rng):
    best = None
    for _ in range(iters):
        a, b, c = P[rng.choice(len(P), 3, replace=False)]
        n = np.cross(b - a, c - a)
        if np.linalg.norm(n) < 1e-9:
            continue
        n /= np.linalg.norm(n)
        inl = np.abs(P @ n - n @ a) < thr
        if best is None or inl.sum() > best.sum():
            best = inl
    n, d = fit_plane(P[best])                      # refine on the inliers
    return n, d, np.abs(P @ n - d) < thr

def extract_planes(P, rng, viewpoint=np.array([1.5, 1.5, 1.6]), up=np.array([0.0, 0.0, 1.0])):
    remaining = np.arange(len(P))
    planes = []
    for _ in range(6):
        n, d, inl = ransac_plane(P[remaining], 0.015, 200, rng)
        if inl.sum() < 300:
            break
        if n @ viewpoint - d < 0:                  # orient the normal towards the viewer
            n, d = -n, -d
        c = abs(n @ up)
        kind = "horizontal" if c > np.cos(np.deg2rad(5)) else "vertical" if c < np.sin(np.deg2rad(5)) else "slanted"
        planes.append((n + 0.0, d, remaining[inl], kind))
        remaining = remaining[~inl]
    return planes, remaining

rng = np.random.default_rng(0)
P = make_room(rng)
planes, rest = extract_planes(P, rng)
for k, (n, d, idx, kind) in enumerate(planes):
    rms = np.sqrt(np.mean((P[idx] @ n - d) ** 2)) * 1e3
    print(f"plane {k}: n = {np.round(n, 3) + 0.0}, d = {0.0 if abs(d) < 5e-4 else d:6.3f} m,"
          f" {len(idx)} inliers, RMS {rms:.1f} mm, {kind}")
print(f"{len(rest)} points left")
```

地板（$\mathbf n = (0, 0, 1)$，3016 个内点）、两面墙（$(1, 0, 0)$ 与 $(0, 1, 0)$，1996 和 1473 个内点）和桌面（$\mathbf n = (0.001, 0.001, 1)$，$d = 0.752$ m，605 个内点）按大小依次被找到，每个的 RMS 残差为 5.0 到 5.1 mm，即仿真的传感器噪声；剩下 510 个点（杂物）。桌面被估计在 0.752 m 处，真值为 0.75 m。实际系统还会用内点的凸包或 alpha 形状界定每个平面，在用户环顾四周时随时间合并平面，并在地图细化时跟踪它们。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-planes.svg" caption="顺序 RANSAC 之后的合成房间角落点云（5 mm 噪声）：地板（绿）、墙 $x=0$（红）、墙 $y=0$（蓝）和位于 0.752 m 的桌面（橙），各自的法线都朝向房间内侧；灰色点是无法解释的杂物。" %}

**网格。** 带深度传感器或稠密双目的头显，可以像第 07 至 09 篇那样把深度融合进 TSDF 并用移动立方体提取三角网格，分辨率为几厘米。网格用于物理（碰撞）、真实物体对虚拟物体的遮挡以及导航。其分辨率限制了遮挡边缘：5 cm 的体素无法沿手的边缘干净地切开虚拟物体，因此手部遮挡通常改用手部追踪器的模型。

**语义。** 地板、墙、门、桌子、沙发、屏幕之类的标签把几何变成应用可以推理的东西（「把棋盘放在桌上」「永远不要把内容放在门前」）。在图像上做物体检测再投影到网格上是一种做法。SceneScript（Avetisyan 等 2024）是一个很有启发的替代方案：它从第一人称视频中预测房间布局和物体的结构化描述，形式是一串命令（墙、门、窗、盒子），在大规模合成数据集上训练。对应用而言，这种紧凑、可编辑的表示可能比稠密网格更有用。平台会把这类结果以**语义锚点**（semantic anchor）的形式提供：ARKit 的平面锚点带有分类（墙、地板、天花板、桌子、座椅、窗、门），Meta 的场景 API 把墙、地板、桌子、沙发表示为带语义标签的锚点，于是应用可以把内容挂在「那张桌子」上，而不是挂在原始坐标上；第 9 节解释锚点如何让内容留在原处。[第 08 篇]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})一般性地讨论了各种表示之间的取舍。

## 9. 空间锚点与重定位

### 9.1 为什么需要锚点

用世界坐标 $\mathbf X\_W$ 存储每个虚拟物体会很简单。问题在于跟踪系统的世界坐标系并不固定：当地图通过回环或光束法平差得到校正时，位姿和点会移动，幅度可达累积漂移；而用世界坐标存储的物体仍留在旧坐标上，如今已在错误的位置。**空间锚点**是附着在地图上、靠近内容的一个位姿 $T\_{WA}$，通常挂在附近的某个关键帧上。内容相对锚点存储为 $\mathbf X\_A$，并在 $T\_{WA}\mathbf X\_A$ 处渲染。地图校正时，锚点随其关键帧移动，内容也随之移动。

剩下的误差是**力臂**（lever arm）效应：锚点的旋转误差 $\delta\theta$ 会让距锚点 $r$ 处的内容移动 $\delta\theta\, r$，所以 3 m 处的 0.5° 就是 26 mm。因此锚点应靠近它所承载的内容，大场景应使用许多锚点。ARKit、ARCore 以及 OpenXR 运行时（例如通过 `XR_MSFT_spatial_anchor` 等厂商扩展）提供的锚点正是这个意义上的锚点。

下面的代码沿 12 m × 6 m 的矩形行走，带有每米 0.3° 的类 VIO 航向漂移，在九个位置于路径左侧一米处放置虚拟物体，并把每个物体存两份：世界坐标，以及相对最近锚点（每 2 m 一个关键帧）的坐标。然后回环与位姿图优化（第 06 篇）校正关键帧位姿；我们宽松地假设它们变得完全准确。

```python
import numpy as np

def se2(x, y, th):
    c, s = np.cos(th), np.sin(th)
    return np.array([[c, -s, x], [s, c, y], [0, 0, 1.0]])

def walk(rect=(12.0, 6.0), step=0.05, yaw_drift_deg_per_m=0.3):
    """Poses along a rectangular loop: the true path and the path odometry reports with a
    small heading drift per metre walked (2D, world z up)."""
    W, H = rect
    corners = [(0, 0), (W, 0), (W, H), (0, H), (0, 0)]
    true, odo = [], []
    T_odo = se2(0, 0, 0)
    for (x0, y0), (x1, y1) in zip(corners[:-1], corners[1:]):
        L = np.hypot(x1 - x0, y1 - y0)
        th = np.arctan2(y1 - y0, x1 - x0)
        for s in np.arange(0, L, step):
            T = se2(x0 + s * np.cos(th), y0 + s * np.sin(th), th)
            if true:
                dT = np.linalg.inv(true[-1]) @ T                 # true relative motion
                d = np.hypot(dT[0, 2], dT[1, 2])
                dyaw = np.arctan2(dT[1, 0], dT[0, 0]) + np.deg2rad(yaw_drift_deg_per_m) * d
                T_odo = T_odo @ se2(dT[0, 2], dT[1, 2], dyaw)
            true.append(T); odo.append(T_odo.copy())
    return np.array(true), np.array(odo)

true, odo = walk()
n = len(true)
print(f"{n} poses; loop end error before loop closure: {np.hypot(*odo[-1][:2, 2]):.2f} m")
place = np.arange(25, n, 80)                               # where the user placed content
offset = np.array([0.0, 1.0, 1.0])                         # 1 m to the left, in the body frame
content_true = np.array([true[i] @ offset for i in place])
content_map = np.array([odo[i] @ offset for i in place])   # where the drifting map put it
anchors = np.arange(0, n, 40)                              # a keyframe anchor every 2 m
nearest = np.array([anchors[np.argmin(np.abs(anchors - i))] for i in place])
local = np.array([np.linalg.inv(odo[a]) @ c for a, c in zip(nearest, content_map)])   # X_A
# loop closure + pose-graph optimisation: assume it recovers the true keyframe poses
anchor_pos = np.array([true[a] @ l for a, l in zip(nearest, local)])
world_err = np.linalg.norm(content_map[:, :2] - content_true[:, :2], axis=1)
anchor_err = np.linalg.norm(anchor_pos[:, :2] - content_true[:, :2], axis=1)
for i, g, a in zip(place, world_err, anchor_err):
    print(f"placed after {i * 0.05:5.2f} m: world coordinates {g * 100:6.1f} cm, anchor-relative {a * 100:5.2f} cm")
```

漂移的地图在回到起点时偏差 1.19 m。以世界坐标存储的物体，最终离应在位置 0.8 cm（行走 1.25 m 后放置）到 104.6 cm（行走 29.25 m 后放置）不等，随放置前累积的漂移增长。相对锚点存储的物体偏差全部是 0.42 cm：只剩下锚点关键帧与放置位置之间 0.75 m 内累积的漂移，作用在约 1.07 m 的力臂上：沿一段直线均匀增长的航向误差，效果相当于绕这段路中点的一次旋转，而中点到物体的距离是 $\sqrt{0.375^2 + 1^2} \approx 1.07$ m；$0.225° \approx 3.9$ mrad 乘以 1.07 m 正是 4.2 mm。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-anchors.svg" localized="true" caption="锚点实验的俯视图。真实环路（黑）与回环前漂移的地图（橙色虚线），后者终点离起点 1.19 m。星号：九个物体应在的位置。红叉与箭头：以世界坐标存储的物体在地图校正后的位置，偏差最大 104.6 cm。绿圈：相同物体相对最近锚点（绿色方块，每 2 m 一个）存储的结果，每个偏差 0.42 cm，几乎与星号重合。" %}

### 9.2 重定位与共享锚点

要在新会话或另一台设备上重新找到保存的锚点，头显必须**重定位**：根据当前图像估计自己在保存的地图中的位姿。标准流程是分层的（Sarlin 等 2019）：用全局图像描述子（如第 06 篇的视觉词袋，或 NetVLAD 等学习式描述子）检索地图中最相似的关键帧；在查询图像与这些关键帧之间匹配局部特征（第 03 篇），得到与地图点的 2D-3D 对应；再用 RANSAC 求解 PnP（第 05 篇）得到 $T\_{CW}$。一旦当前会话的坐标系 $W\_2$ 与保存的地图坐标系 $W\_1$ 建立联系，保存为 $T\_{W\_1A}$ 的锚点在新会话中就位于

$$
T_{W_2A} = T_{W_2W_1}\,T_{W_1A}, \qquad T_{W_2W_1} = T_{W_2C}\,T_{CW_1},
$$

其中 $T\_{W\_2C}$ 是当前的跟踪位姿，$T\_{CW\_1}$ 是重定位得到的位姿，二者对应同一幅图像。设备之间共享锚点也是同样的道理：每台设备都在一张公共地图中重定位（「云锚点」的地图放在服务器上），再组合出自己的变换。重定位必须应对两次会话之间光照和家具的变化，这也是学习式特征与匹配器（第 03 篇）在重定位中被广泛使用的原因之一。

## 10. 综合起来

下面的小组件在一维中运行第 2 至 4 节的完整链条。头部在一个真实盒子前转动（偏航）并左右摇摆；渲染器根据它所知道的位姿把虚拟盒子画在上面。改变延迟、预测器、后期重投影、位置漂移、物体距离和显示分辨率，观察以角分、显示像素和毫米计的配准误差。放大面板显示盒子边缘以及显示像素网格。

{% include widget.liquid name="3d-vision-motion-to-photon" height="640" caption="运动到光子实验。渲染器使用 $\Delta$ ms 之前的头部位姿，用无预测、恒速度或恒加速度外推（陀螺噪声 0.2°/s，角加速度由相隔 10 ms 的样本求得）。后期重投影在光子发出前 5 ms 重新采样旋转；平移仍使用 $\Delta$。位置估计带有缓慢游走的漂移（地图校正以 5 s 的时间常数把它拉回）和位姿抖动。橙：误差的旋转部分；青：平移部分；黑：总误差。可以尝试：在 25 ms 时关闭预测；打开后期重投影，把物体移到 0.3 m，再移到 5 m；对近处物体加大漂移；提高显示分辨率，看同样的误差变成更多像素。拖动模式下，左右拖动视图即可自己转头。" %}

几条工程准则总结全文：

1. **在眼睛处、用角度和时间度量。** 对内容所在的各个距离，把每项误差换算成眼睛处的角分和显示像素。
2. **延迟是最大的原始误差；预测和后期重投影是最大的修正。** 缩短预测时长（后期重投影），保持预测器为低阶，并确保每个位姿的时间戳一致：第 02 篇的相机-IMU 时间偏移和显示时序都必须标定。
3. **近处内容是平移问题。** 在手臂距离内，眼睛和头部位置的误差占主导：光学透视看眼睛位置，透视显示看深度，二者都看位置跟踪。
4. **在局部锚定内容。** 把内容挂在附近的锚点上，而不是世界原点，并做到鲁棒的重定位。
5. **自适应地滤波输入。** 手和眼的信号需要随速度自适应的滤波，而不是固定的低通。

## 动手试试

- 上面的小组件：从 $\Delta = 25$ ms 和恒速度预测器开始，再切换到「无」，看原始的延迟误差；打开后期重投影，比较近处和远处的物体。
- 首页的 [Interactive Lab]({{ '/' | relative_url }}#lab)：注视点渲染演示展示了眼动追踪所支持的、随离心率变化的分辨率；Gaussian World 演示渲染一个三维高斯场景，按照[神经渲染第 6 篇]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})的步骤也可以在头显中观看。
- 如果你有带透视功能的头显，把手放在脸前 20 cm，一边侧向移动一边盯着它的边缘与远处背景的关系；再把手伸到手臂距离重复一次。手「贴合」背景的程度若有差别，那就是第 5 节中与深度相关的误差。

## 代表性论文

| 论文 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| A survey of augmented reality (Azuma) | Presence | 1997 | [DOI](https://doi.org/10.1162/pres.1997.6.4.355) | 定义了 AR，并把配准列为其核心问题 |
| Registration error analysis for augmented reality (Holloway) | Presence | 1997 | [DOI](https://doi.org/10.1162/pres.1997.6.4.413) | 光学透视系统的端到端误差预算；延迟占主导 |
| Single point active alignment method (SPAAM) for optical see-through HMD calibration for AR (Tuceryan, Navab) | ISAR | 2000 | — | 经典的用户参与式显示标定 |
| General theory of remote gaze estimation using the pupil center and corneal reflections (Guestrin, Eizenman) | IEEE TBME | 2006 | [DOI](https://doi.org/10.1109/TBME.2005.863952) | PCCR 眼动追踪背后的三维模型 |
| A multi-state constraint Kalman filter for vision-aided inertial navigation (Mourikis, Roumeliotis) | ICRA | 2007 | [DOI](https://doi.org/10.1109/ROBOT.2007.364024) | MSCKF，移动设备 VIO 中广泛使用的滤波框架 |
| 1€ filter: a simple speed-based low-pass filter for noisy input in interactive systems (Casiez, Roussel, Vogel) | CHI | 2012 | [DOI](https://doi.org/10.1145/2207676.2208639) | 用于手部和指针输入的自适应滤波器 |
| Head tracking for the Oculus Rift (LaValle, Yershova, Katsev, Antonov) | ICRA | 2014 | [DOI](https://doi.org/10.1109/ICRA.2014.6906608) | 消费级头显中的姿态跟踪、漂移校正与预测 |
| The asynchronous time warp for virtual reality on consumer hardware (van Waveren) | VRST | 2016 | [DOI](https://doi.org/10.1145/2993369.2993375) | 与应用帧率解耦的后期重投影 |
| Towards foveated rendering for gaze-tracked virtual reality (Patney et al.) | SIGGRAPH Asia (ACM TOG) | 2016 | [DOI](https://doi.org/10.1145/2980179.2980246) | 借助眼动追踪，周边渲染可以降低到什么程度 |
| On-manifold preintegration for real-time visual-inertial odometry (Forster, Carlone, Dellaert, Scaramuzza) | IEEE T-RO | 2017 | [arXiv](https://arxiv.org/abs/1512.02363) | 基于优化的 VIO 中的 IMU 预积分 |
| A survey of calibration methods for optical see-through head-mounted displays (Grubert, Itoh, Moser, Swan) | IEEE TVCG | 2018 | [arXiv](https://arxiv.org/abs/1709.04299) | 显示与眼睛位置标定方法综述 |
| From coarse to fine: robust hierarchical localization at large scale (Sarlin, Cadena, Siegwart, Dymczyk) | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1812.03506) | 检索 + 局部匹配 + PnP 的重定位流程 |
| MEgATrack: monochrome egocentric articulated hand-tracking for virtual reality (Han et al.) | SIGGRAPH (ACM TOG) | 2020 | [DOI](https://doi.org/10.1145/3386569.3392452) | 用头显的单色跟踪相机做手部追踪 |
| Passthrough+: real-time stereoscopic view synthesis for mobile mixed reality (Chaurasia et al.) | I3D (PACMCGIT) | 2020 | [DOI](https://doi.org/10.1145/3384540) | 移动头显上基于深度的透视重投影 |
| Towards indistinguishable augmented reality: a survey on optical see-through head-mounted displays (Itoh, Langlotz, Sutton, Plopski) | ACM Computing Surveys | 2021 | [DOI](https://doi.org/10.1145/3453157) | 光学透视显示的空间、时间与视觉真实感 |
| NeuralPassthrough: learned real-time view synthesis for VR (Xiao et al.) | SIGGRAPH | 2022 | [arXiv](https://arxiv.org/abs/2207.02186) | 学习式透视视图合成 |
| UmeTrack: unified multi-view end-to-end hand tracking for VR (Han et al.) | SIGGRAPH Asia | 2022 | [arXiv](https://arxiv.org/abs/2211.00099) | 多视图、多帧端到端输出世界坐标系中的手部姿态 |
| Project Aria: a new tool for egocentric multi-modal AI research (Engel et al.) | arXiv 预印本（2023 年 8 月） | 2023 | [arXiv](https://arxiv.org/abs/2308.13561) | 带 SLAM、眼动追踪与公开数据集的研究用眼镜平台 |
| SceneScript: reconstructing scenes with an autoregressive structured language model (Avetisyan et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2403.13064) | 把房间布局与物体表示为结构化命令序列 |

状态（截至 2026 年 11 月）：除 Project Aria 仍是 arXiv 预印本外，表中各项均为经过同行评审的正式发表论文。

## 学习资源

- S. M. LaValle，*Virtual Reality*，Cambridge University Press，2023；[作者网站](https://lavalle.pl/vr/)上有免费在线版。涵盖跟踪、视觉渲染、延迟与感知等章节。
- 上面 Azuma 的综述，以及 [OpenXR 1.1 规范](https://registry.khronos.org/OpenXR/specs/1.1-khr/html/xrspec.html)（帧时序、空间与锚点），用于建立系统层面的认识。
- 本系列第 06 篇关于 VIO 的内容，以及其中讨论的开源 VIO 系统（OpenVINS、VINS-Fusion、惯性模式的 ORB-SLAM3），可在录制数据上试验 inside-out 跟踪。
- [Project Aria](https://www.projectaria.com/) 的数据集与工具，提供带标定相机、IMU、眼动注视和 SLAM 轨迹的第一人称录制数据。
- [1€ 滤波器主页](https://cristal.univ-lille.fr/~casiez/1euro)，有多种语言的实现。

## 练习

1. 某头显标定后的残余陀螺零偏为 0.02°/s，在黑暗房间里丢失了相机跟踪。只计陀螺零偏一项，仅靠 IMU 能运行多久，位置误差才超过 1 cm？仅姿态漂移 1° 又需要多久？

   <details markdown="1"><summary>提示</summary>

   用 $b\_g = 3.49\times10^{-4}$ rad/s 解 $\tfrac16 g\,b\_g t^3 = 0.01$ m：$t = (0.06/(9.81 \cdot 3.49\times10^{-4}))^{1/3} \approx 2.6$ s。姿态以 $b\_g t$ 漂移，漂 1° 需要 50 s。仅旋转跟踪比位置跟踪能坚持久得多，这就是头显在丢失相机跟踪时退回 3DoF 的原因。
   </details>

2. 推导恒速度预测器截断误差的主项 $\tfrac12\alpha\Delta^2$，并与第 3.3 节的表格对照：在最小加加速度转头的哪个时刻它最大？对 $\Delta = 20$ ms 它预测的值是多少？

   <details markdown="1"><summary>提示</summary>

   线性项之后的泰勒余项为 $\tfrac12\alpha(\xi)\Delta^2$。最小加加速度的角加速度 $A/T^2(60s - 180s^2 + 120s^3)$ 在 $s = (3 \mp \sqrt3)/6$ 即 127 ms 和 473 ms 处取极值 $962$°/s²；$\tfrac12 \cdot 962 \cdot 0.02^2 = 0.192° = 11.5'$，与表中数值一致。
   </details>

3. 某透视头显的相机位于眼睛前方 6 cm，两台相机的间距比两眼宽 1 cm，重投影时假设 1.5 m 处的平面。用一阶公式计算正前方 0.4 m 处的手，以及位于侧方 20°、距离 0.4 m 的点的误差。两种情况下分别是哪个偏移分量起作用？

   <details markdown="1"><summary>提示</summary>

   正前方时，只有每只眼 5 mm 的横向偏移垂直于视线：$0.005\,\lvert1/0.4 - 1/1.5\rvert = 9.2$ mrad $\approx 31.5'$（用 `passthrough_error` 且 `c = (0.005, 0, 0.06)` 得到 $37.1'$）。在侧方 20° 时，垂直分量为 $0.005\cos20° \mp 0.06\sin20°$，在相机一侧为 15.8 mm，另一侧为 25.2 mm：此时前向偏移占主导。一阶误差为 1.7° 和 2.6°，精确值为 2.0° 和 3.2°。
   </details>

4. 把三角化代码扩展到四台相机（在 $x = \pm0.1$ m 处再加两台向外倾斜 30° 的相机），计算 0.5 m 处指尖的 $\sigma\_z$。每增加一对视图有多大帮助？为什么视线方向分布更广比在相同位置增加相机更有用？

   <details markdown="1"><summary>提示</summary>

   用绕 $y$ 轴的旋转 $R$ 构造 $P = K[R \mid -R\mathbf C]$；`triangulate` 本来就接受任意数量的视图。深度精度取决于光线之间的夹角（第 04 篇的三角化角），因此来自更远处的视图比几乎重复已有光线的视图贡献更大。
   </details>

5. 在锚点实验中，把锚点间距拉大（每 6 m 而不是每 2 m 一个），并把内容放在离路径 3 m 而不是 1 m 处。运行代码前，先用力臂的论证预测相对锚点存储时的误差。

   <details markdown="1"><summary>提示</summary>

   锚点关键帧与放置位置之间的航向漂移约为 $0.3°/\text{m}$ 乘以二者之间走过的距离（现在最多 3.25 m），它作用的力臂大致等于这段路的中点到内容的距离。例如走了 2.75 m、内容离路径 3 m 时，误差约为 $0.825° \approx 14.4$ mrad 乘以约 3.3 m，即 4.8 cm；九个物体在代码中的误差为 1.2 到 5.8 cm，而不是 0.42 cm。代码改动为 `anchors = np.arange(0, n, 120)` 和 `offset = np.array([0.0, 3.0, 1.0])`。
   </details>

## 接下来去哪里

这是**三维视觉基础**的最后一篇。十篇文章里，我们从针孔相机出发，经过标定、特征、两视图与多视图几何、SLAM、深度、表示、重建，最后到这里——把这一切实时呈现在人眼前的系统。有三个系列可以接着读：

- **神经渲染**再次从带位姿的图像出发，这一次是学习辐射场和三维高斯：从[相机与多视图几何]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})开始（现在可以当作复习来读），以[采集场景并在 VR 中观看]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})结束。
- **世界模型**探讨系统如何预测三维世界的演化，无论是在像素、隐空间还是显式三维中：从[什么是世界模型]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})开始。
- **具身智能**把本系列的感知放进机器人的控制回路：从[机器人学基础]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})开始，并阅读[具身智能与 XR、HCI 的交汇]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})，了解头显、手部追踪和第一人称数据如何为机器人学习提供养料。
