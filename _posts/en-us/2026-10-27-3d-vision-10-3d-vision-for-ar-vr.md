---
layout: post
title: "3D vision for AR/VR: tracking, latency and registration error"
date: 2026-10-27 11:10:00+0900
description: "The last post of 3D Vision Fundamentals: inside-out 6DoF tracking with VIO and maps, motion-to-photon latency and prediction, late-stage reprojection, registration error budgets, passthrough reprojection, hand and eye tracking, planes and meshes, spatial anchors and relocalization."
categories: 3d-vision
tags: [ar, vr, mixed-reality, vio, latency, registration, passthrough, hand-tracking, eye-tracking, spatial-anchors]
series: 3d-vision
series_order: 10
toc:
  sidebar: left
related_posts: false
---

## Why this matters

Every post of this series has solved an offline problem: calibrate a camera once ([post 02]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})), recover poses and points from a photo collection ([post 05]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})), fuse depth into a surface ([post 09]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})). An AR or VR headset runs all of them at once, in real time, on a battery, with a person's visual system as the judge. Its central requirement is **registration**: a virtual object placed on a real table must stay on that table, to a fraction of a degree, while the head turns at a hundred degrees per second. In VR the same requirement appears as "the world must not swim when I turn my head".

This post explains what that takes. The errors are no longer measured in reprojection pixels on a sensor but in arcminutes at the eye and in milliseconds between a head movement and the photons that show it. We will build a small toolkit of formulas and simulations that answer concrete questions: how fast does an IMU alone drift, how much does 20 ms of latency cost and how much of it prediction wins back, why rotation-only reprojection fails for near objects, how to add up a registration error budget, why passthrough cameras that sit a few centimetres in front of the eyes distort near objects, how precisely a pair of headset cameras can triangulate a fingertip, why eye trackers use corneal reflections, and how spatial anchors keep content in place when the map underneath them changes.

## Prerequisites

- Camera models and the OpenCV conventions of [post 01]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }}): $K$, $R$, $\mathbf t$, homogeneous coordinates, the rotation homography, rolling shutter.
- Camera-IMU calibration and its time offset, from section 9 of [post 02]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }}).
- RANSAC from [post 03]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }}); triangulation and stereo depth from [post 04]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }}); PnP from [post 05]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }}).
- Visual-inertial odometry, keyframes and loop closure from [post 06]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }}); depth sensing and TSDF fusion from posts [07]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}) to [09]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}).
- Python with NumPy. Every snippet below runs as is; the numbers in the text are its output.

## 1. The registration problem

### 1.1 Frames and the transform chain

A headset carries several rigid frames. We write $T\_{AB}$ for the $4\times4$ rigid transform that maps coordinates in frame $B$ to frame $A$, so that $\tilde{\mathbf X}\_A = T\_{AB}\tilde{\mathbf X}\_B$ and $T\_{AC} = T\_{AB}T\_{BC}$. In this notation the world-to-camera matrix $[R \mid \mathbf t]$ of post 01 is $T\_{CW}$. The frames are:

- $W$, the **world** (or map) frame of the tracking system, gravity-aligned with $z$ up;
- $B$, the **body** frame of the headset, in practice the IMU;
- $C\_i$, the **tracking cameras**, usually several wide-angle, global-shutter grayscale cameras pointing forward, sideways and down;
- $E\_L, E\_R$, the **eyes**, or more precisely the virtual cameras that render the left and right images; their position depends on the wearer's interpupillary distance (IPD), about 63 mm on average;
- $A$, an **anchor**: a frame attached to a real place, to which virtual content is attached.

A point $\mathbf X\_A$ of a virtual object, given in its anchor frame, appears in the left eye's display at

$$
\lambda\,\tilde{\mathbf u} = K_{E_L}\,\big[\,T_{E_L B}\; T_{BW}(t_{\text{photon}})\; T_{WA}\,\big]_{3\times4}\, \tilde{\mathbf X}_A ,
$$

where $[\cdot]\_{3\times4}$ keeps the top three rows. Each factor has its own source of error. $K\_{E\_L}$ and $T\_{E\_L B}$ come from display calibration (and, for an optical see-through display, from where the eye really is behind the lens). $T\_{WA}$ comes from the map. $T\_{BW}(t)$, the inverse of the head pose, comes from tracking, and it is needed at the instant $t\_{\text{photon}}$ when the light leaves the display, which is in the future when the frame is rendered. The rest of the post goes through these factors one by one.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-frames.svg" caption="Left: the world frame $W$ ($z$ up), the head pose $T\_{WB}(t)$, a table anchor $A$ with $T\_{WA}$, and a 10 cm virtual cube defined in the anchor frame; the orange line is the left eye's line of sight to the cube corner $\mathbf X\_A$. Right: the headset in its body frame $B$, with two outward- and downward-tilted tracking cameras $C\_L$, $C\_R$ (dotted: optical axes) and the two render eyes $E\_L$, $E\_R$ 63 mm apart, 6 cm behind $B$. All optical frames use the OpenCV axes (red $x$ right, green $y$ down, blue $z$ forward)." %}

### 1.2 Measuring registration error

The natural unit is the **angle at the eye** between where a virtual point is drawn and where it should be. One degree is 60 arcminutes ($60'$). A person with normal visual acuity resolves details of about one arcminute, and a display with $\rho$ pixels per degree draws one pixel every $60/\rho$ arcminutes; at $\rho = 25$ px/° that is $2.4'$. Converting an angle $\varepsilon$ into a lateral offset at the object's distance $d$ gives $\varepsilon d$ (radians times metres).

Two elementary cases cover most error sources. A **rotation** error $\delta\theta$ of the head pose rotates every rendered direction by $\delta\theta$: the angular error is $\delta\theta$, the same for every distance. A **translation** error $\delta\mathbf p$ shifts the viewpoint; for a point at distance $d$ the angular error is $\delta p\_\perp / d$, where $\delta p\_\perp$ is the component of $\delta\mathbf p$ perpendicular to the line of sight. So rotation errors dominate for far content and translation errors for near content. With $\delta\theta = 0.1°$ the error is $6'$ everywhere; with $\delta p\_\perp = 2$ mm it is $13.8'$ at 0.5 m and $1.7'$ at 4 m.

## 2. Inside-out 6DoF tracking

Early VR systems tracked the headset from outside, with cameras or laser sweeps fixed in the room. Current headsets track **inside-out**: the cameras on the headset look at the world. The algorithm is the visual-inertial odometry of [post 06]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }}), engineered for one particular regime: a fast-moving head, near walls and hands that often fill the view, and a hard latency budget. Two sensors with opposite strengths are fused.

### 2.1 Why the IMU alone is not enough

The IMU measures angular velocity $\tilde{\boldsymbol\omega}$ (gyroscope) and specific force $\tilde{\mathbf f} = R\_{WB}^\top(\mathbf a - \mathbf g)$ (accelerometer) at around a kilohertz. Integrating them, the **strapdown** equations

$$
\begin{aligned}
R &\leftarrow R\,\operatorname{Exp}\big((\tilde{\boldsymbol\omega} - \mathbf b_g)\,\Delta t\big),\\
\mathbf v &\leftarrow \mathbf v + \big(R(\tilde{\mathbf f} - \mathbf b_a) + \mathbf g\big)\Delta t,\\
\mathbf p &\leftarrow \mathbf p + \mathbf v\,\Delta t,
\end{aligned}
$$

give the pose at any instant, with almost no delay. The trouble is the biases $\mathbf b\_g$ and $\mathbf b\_a$, which are never known exactly. An accelerometer bias error $\delta b\_a$ integrates twice into a position error $\tfrac12 \delta b\_a t^2$. A gyro bias error $\delta b\_g$ integrates into a tilt error $\delta b\_g t$; the tilt makes the integrator subtract gravity in a slightly wrong direction, which leaves a horizontal acceleration of $g\,\delta b\_g t$, and integrating that twice gives $\tfrac16 g\,\delta b\_g t^3$. The snippet integrates a headset that is in fact perfectly still, with illustrative MEMS-scale bias errors of 0.01 m/s² (about 1 mg) and 0.1°/s:

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

After one 90 Hz frame (11 ms) the position error is $0.6\ \mu$m, after one 30 Hz camera interval (33 ms) $5.4\ \mu$m from the accelerometer bias and $0.1\ \mu$m from the gyro bias: negligible. After one second it is 5.0 mm and 2.8 mm, and after ten seconds 0.5 m and 2.85 m, exactly the $\tfrac12 \delta b\_a t^2$ and $\tfrac16 g\,\delta b\_g t^3$ laws. The IMU is an excellent sensor for the next few tens of milliseconds and a useless one for the next minute.

### 2.2 Cameras bound the drift

Cameras have the opposite profile. A camera image gives an absolute measurement against the landmarks of the map (no drift while the landmarks are visible), but only 30 to 60 times per second, with tens of milliseconds of exposure and processing delay, and it fails under fast motion blur or in a dark or textureless room. VIO combines the two: the IMU propagates the state between images, each image corrects it, and the filter estimates the biases on the way, which is what removes the $t^2$ and $t^3$ growth. A one-dimensional toy shows the mechanism. The state is position, velocity and accelerometer bias; the IMU predicts at 1 kHz; a camera position fix with 1 mm noise arrives every 33 ms.

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

With camera updates the error stays at 0.366 mm RMS (0.864 mm at worst) and the filter learns the bias, $0.0100$ m/s², the true value to four digits. Without them the same IMU is 3.0 mm off after one second and 72.5 mm after four. Real headset VIO does this in 6DoF with a multi-state constraint Kalman filter (MSCKF, Mourikis and Roumeliotis 2007) or a sliding-window optimizer with IMU preintegration (Forster et al. 2017), both explained in post 06; it also estimates the camera-IMU extrinsics and time offset online, refining the factory calibration of post 02.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-imu-drift.svg" caption="Left: position error of pure IMU integration for a headset at rest (snippet of section 2.1), with an accelerometer bias of 0.01 m/s² (orange) and a gyro bias of 0.1°/s (purple), on log-log axes. The dotted and dashed lines are $\tfrac12 b\_a t^2$ and $\tfrac16 g\,b\_g t^3$; the vertical lines mark one 90 Hz frame, one 30 Hz camera interval and one second. Right: the 1D toy VIO of section 2.2 between 2.0 and 2.5 s. The error (purple) jumps at each camera update (gray lines, every 33 ms) and drifts slightly in between; the shaded band is the filter's own $\pm2\sigma$." %}

### 2.3 Maps

VIO alone still drifts slowly: gravity makes roll and pitch observable, but the global position and the rotation about gravity (yaw) are not observable from camera and IMU data, so their errors grow with distance travelled. Headsets therefore keep a **map**: keyframes with their features and 3D points, in the sense of post 06. The map serves three purposes. Revisiting a mapped place corrects the drift (loop closure). It is what spatial anchors attach to (section 9). And if it is saved, the next session can **relocalize** in it, so content placed yesterday reappears in the same place, and the play-area boundary of a VR headset does not have to be drawn again. Section 9 returns to how relocalization works.

## 3. Motion-to-photon latency and prediction

### 3.1 Where the latency comes from

**Motion-to-photon latency** is the time between a head movement and the moment the display emits light that reflects it. The figure shows an illustrative 90 Hz pipeline. The application samples the predicted head pose (here at 2 ms), simulates and records draw commands on the CPU, the GPU renders both eye views, the compositor applies lens-distortion correction, and the display scans the frame out row by row over one refresh period of 11.1 ms. If the head pose were used only from the application's sample, the latency to the middle of the scan-out would be 23.6 ms. Headset runtimes therefore re-sample the head pose just before scan-out and corrects the finished image (section 3.4); then only 8.1 ms remain between the last pose sample and the photons.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-m2p-timeline.svg" localized="true" caption="An illustrative 90 Hz frame. The IMU is sampled at 1 kHz (ticks), the tracking cameras at 30 Hz. The application reads the head pose at 2 ms (orange dot) and the GPU renders until 15 ms; the late-warp stage reads the pose again at 17.5 ms (green dot) and re-projects the finished image. The display scans out from 20 to 31.1 ms (blue: row against time), so the photons of the middle row leave at 25.6 ms (red star). Without late warp the image is 23.6 ms old; with it, 8.1 ms." %}

Two details matter. First, the display, like a rolling-shutter camera (post 01, section 3.5), does not show the whole image at once: the bottom rows appear up to a frame period after the top rows, so a runtime can predict a different pose for different parts of the image. Second, a display that keeps each frame lit for the whole refresh period smears it across the retina while the eye tracks a moving object; VR displays therefore use **low persistence**, lighting each frame only for a short fraction of the period.

In OpenXR, the standard API between applications and headset runtimes, this machinery is visible in the frame loop: `xrWaitFrame` returns a `predictedDisplayTime`, the runtime's prediction of when the frame will be displayed (the red star of the figure stands for this instant), and the application asks `xrLocateViews` for the eye poses at that future time. The runtime performs the prediction; the application only has to use the time it is given.

### 3.2 The cost of latency

If the renderer uses the head yaw from $\Delta$ seconds ago, the drawn world is rotated by $\theta(t) - \theta(t - \Delta) \approx \omega\Delta$. For an ordinary head turn at $\omega = 100$°/s, a latency of $\Delta = 20$ ms gives $2° = 120'$: fifty display pixels at 25 px/°. Without prediction, the world visibly lags behind every head movement and springs back when the head stops. In Holloway's (1997) analysis of an optical see-through system, this delay error was the largest single source of registration error, even at moderate head speeds.

### 3.3 Prediction

The fix is to extrapolate the pose to the photon time. The gyro gives the angular velocity directly and the derivative of the gyro gives the angular acceleration, so the Taylor series

$$
\hat\theta(t) = \theta(t-\Delta) + \omega(t-\Delta)\,\Delta + \tfrac12\,\alpha(t-\Delta)\,\Delta^2
$$

can be truncated after the first term (no prediction), the second (**constant velocity**) or the third (**constant acceleration**). The truncation errors are, to leading order, $\omega\Delta$, $\tfrac12\alpha\Delta^2$ and $\tfrac16\dot\alpha\Delta^3$. Higher orders are more accurate for smooth motion but differentiate noisy measurements: the acceleration estimated from two gyro samples $h$ seconds apart has a noise of about $\sqrt2\,\sigma\_\omega/h$, multiplied by $\tfrac12\Delta^2$ in the prediction. To compare the three, take a fast 60° head turn in 0.6 s with a minimum-jerk profile, the smooth shape of voluntary movements, and give the gyro 0.2°/s of white noise per sample:

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

The turn peaks at 187.5°/s and 962°/s². The maximum errors, without and (in parentheses) with gyro noise, are:

| Latency | none | constant velocity | constant acceleration |
| --- | --- | --- | --- |
| 10 ms | $112.5'$ | $2.9'$ ($3.1'$) | $0.4'$ ($0.9'$) |
| 20 ms | $224.8'$ | $11.5'$ ($12.1'$) | $2.1'$ ($3.6'$) |
| 40 ms | $448.7'$ | $46.0'$ ($46.7'$) | $12.5'$ ($15.3'$) |

Three lessons. Prediction is enormously effective: at 20 ms it reduces a $3.7°$ error to a fifth of a degree. Its residual grows **quadratically** (constant velocity) or roughly **cubically** (constant acceleration; the angular acceleration estimated over the last 10 ms adds a quadratic part) with the horizon, so shortening the horizon is worth as much as improving the predictor. And noise eats into the gain of higher orders, more so at longer horizons; real head motion is also less smooth than a minimum-jerk curve, which hurts the higher-order predictor most at the start and end of a movement. Practical predictors therefore keep the order low, filter the gyro and keep the horizon short; LaValle et al. (2014) describe the orientation tracking and prediction of an early consumer headset.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-prediction.svg" caption="Left: yaw error during the 60° minimum-jerk turn at $\Delta=20$ ms for no prediction (red), constant velocity (orange) and constant acceleration (purple, noise-free; the faint trace adds 0.2°/s gyro noise); the dashed gray curve is the head rate (right axis, peak 187.5°/s). The velocity predictor errs most where the acceleration peaks, near 130 and 470 ms; the acceleration predictor where the jerk peaks. Right: maximum error over the turn against the latency $\Delta$, with gyro noise. The dotted line is one display pixel at 25 px/°." %}

### 3.4 Late-stage reprojection

Prediction over 20 ms or more is never perfect, so runtimes also shorten the horizon: after the frame is rendered with the predicted pose, a **late warp** (called timewarp or reprojection) re-samples the pose a few milliseconds before scan-out and warps the finished image to it. Van Waveren (2016) describes how this is done asynchronously on consumer hardware, so that a fresh warp happens every refresh even when the application misses its frame.

**Rotation-only warp.** If the head only rotated by $R\_{\Delta}$ (new camera from old) between rendering and display, every pixel moves by the rotation homography of post 01:

$$
\tilde{\mathbf u}' \sim K\,R_{\Delta}\,K^{-1}\,\tilde{\mathbf u},
$$

which needs no depth and costs one texture lookup per pixel. It is exact for rotation. For a translation $\mathbf b$ of the eye it is wrong by the parallax $f\,b\_\perp/Z$ pixels for a point at depth $Z$, the disparity formula of post 04.

**Depth-based warp.** With the rendered depth buffer each pixel can be unprojected, moved and reprojected exactly, $\tilde{\mathbf u}' \sim K(R\_\Delta Z K^{-1}\tilde{\mathbf u} + \mathbf t\_\Delta)$, which handles translation too. The price is disocclusion: background that the moved eye can now see was never rendered, and it must be filled in somehow.

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

For a head movement of 2° and 4 cm during the latency, the rotation-only warp is off by 20.07 px on a plate 0.6 m away, 5.88 px on a pillar at 2 m and 3.06 px on the wall at 4 m, matching $f b/Z$ = 20, 6 and 3 px. The next figure renders this scene.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-timewarp.svg" caption="A ray-cast toy scene: a checkered wall at 4 m, a cyan pillar at 2 m and an orange plate at 0.6 m, 320×240 pixels, $f=300$. (a) The frame rendered at the old head pose. (b) The truth at the new pose, 2° to the right and 4 cm to the right. (c) The rotation-only warp of (a): the far wall is nearly right, but the near plate lags 20 px behind its true outline (dashed); magenta pixels lie outside the old frame. (d) The depth-based warp of (a): the plate lands on its outline, but the background it uncovers (magenta strip to its right) was never rendered. In the full image 26.1% of the pixels are wrong after (c), against 1.1% (plus 8.3% holes) after (d)." %}

In practice runtimes combine both ideas: a rotational warp for every frame, depth-based or motion-vector-based extrapolation when the application provides depth or misses frames, and simple hole filling from the neighbouring background. Section 5 will show that passthrough video is exactly the same problem with a different transform.

## 4. Registration error budgets

### 4.1 One formula for parallax errors

Several error sources share one geometry. Suppose an image of a point at distance $d$ is formed correctly from a viewpoint $O'$, but the point is drawn for the true eye $O$ as if it lay at distance $d\_0$ (on a display focal plane, on an assumed plane, at infinity). If $O'$ is displaced from $O$ by $\mathbf b$, the angular error at the eye is, to first order in $b/d$,

$$
\varepsilon \approx b_\perp \left|\frac1d - \frac1{d_0}\right| ,
$$

with $b\_\perp$ the component of $\mathbf b$ perpendicular to the line of sight. It vanishes when $d = d\_0$ and grows like $b\_\perp/d$ for near points. The cases are:

- **rotation-only late warp**: $\mathbf b$ is the head translation during the residual latency, $d\_0 = \infty$ (section 3.4);
- **eye position error in an optical see-through display**: $\mathbf b$ is the error in the assumed eye position, $d\_0$ the distance of the display's focal plane, the virtual image the optics form;
- **passthrough with an assumed depth**: $\mathbf b$ is the camera-to-eye offset, $d\_0$ the assumed scene depth (section 5);
- **tracking translation error**: $\mathbf b = \delta\mathbf p$, $d\_0 = \infty$.

### 4.2 Adding up a budget

A registration error budget lists every source with its 1σ size and its distance dependence and combines the independent ones by root sum of squares (RSS). The values below are illustrative for a well-engineered optical see-through headset; Holloway (1997) did the same analysis for a surgical planning system in much more detail.

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

The $3'$ allowance for latency corresponds to the velocity predictor of section 3 over the 8 ms left after a late warp: for the fast turn of that section its maximum error at 8 ms is $1.85'$. The output, in arcminutes:

| Source | 0.3 m | 0.5 m | 1 m | 2 m | 4 m |
| --- | --- | --- | --- | --- | --- |
| tracking rotation (0.02°) | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 |
| tracking translation (1 mm) | 11.46 | 6.88 | 3.44 | 1.72 | 0.86 |
| latency after prediction | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| display calibration (0.03°) | 1.80 | 1.80 | 1.80 | 1.80 | 1.80 |
| eye position (2 mm, focal plane 2 m) | 19.48 | 10.31 | 3.44 | 0.00 | 1.72 |
| camera-IMU time offset (0.5 ms) | 1.50 | 1.50 | 1.50 | 1.50 | 1.50 |
| **total (RSS)** | **22.95** | **13.02** | **6.29** | **4.35** | **4.43** |
| total at the object (mm) | 2.00 | 1.89 | 1.83 | 2.53 | 5.15 |
| display pixels at 25 px/° | 9.56 | 5.43 | 2.62 | 1.81 | 1.85 |

Reading a budget like this tells you where to spend effort. At arm's length (0.3 to 0.5 m), where hands and tools are, the translation-type errors dominate: where the eye really is and where the head really is. Beyond 2 m the angle-type errors take over (latency, display calibration, rotation). The total in millimetres is nearly constant up to 1 m, then grows with distance: a constant angle covers more of the object.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-budget.svg" localized="true" caption="Left: the six contributions of the budget snippet and their RSS total (black) against the distance of the virtual object, log-log. Translation-type terms fall like $1/d$; the eye-position term vanishes at the 2 m focal plane and comes back beyond it; the angle-type terms are flat. The dotted line is one display pixel at 25 px/°. Right: the same total as a lateral offset at the object, in millimetres." %}

## 5. Passthrough mixed reality

A **video see-through** (passthrough) headset shows the real world through its cameras. This removes the problems of optical see-through (virtual content can be opaque and correctly occluded, and both worlds have the same latency and brightness) but adds a new one: the cameras are not where the eyes are. They sit several centimetres in front of the eyes, often at a different lateral spacing, with different intrinsics and lens distortion. Showing each camera image directly to an eye would make the world look closer, larger, and shifted, and would make it move wrongly when the head turns. Passthrough is therefore a **view synthesis** problem: re-render the camera images from the eye viewpoints, under a tight latency budget.

### 5.1 Reprojection with depth

With a depth $Z$ for camera pixel $\tilde{\mathbf u}\_C$, the reprojection to the eye is the depth-based warp of section 3.4 with the camera-to-eye transform:

$$
\lambda\,\tilde{\mathbf u}_E = K_E\big(R_{EC}\,Z\,K_C^{-1}\tilde{\mathbf u}_C + \mathbf t_{EC}\big).
$$

If no per-pixel depth is available, the simplest approximation assumes the whole scene lies on a plane at distance $d\_0$; then the mapping becomes a plane-induced homography (post 04), $H = K\_E\big(R\_{EC} + \mathbf t\_{EC}\mathbf n^\top/d\_0'\big)K\_C^{-1}$ for the plane $\mathbf n^\top\mathbf X = d\_0'$ in camera coordinates. Points off the plane get the parallax error of section 4.1, with $b\_\perp$ the camera-to-eye offset. The snippet computes the exact error for a camera 3.2 cm to the side of and 7 cm in front of the eye, for points straight ahead:

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

| True depth $d$ | plane at 1 m | first-order formula | plane at 2 m | per-pixel depth, 3% error |
| --- | --- | --- | --- | --- |
| 0.3 m | $333.8'$ | $256.7'$ | $404.7'$ | $10.8'$ |
| 0.5 m | $127.9'$ | $110.0'$ | $191.7'$ | $6.4'$ |
| 1.0 m | $0.0'$ | $0.0'$ | $59.1'$ | $3.2'$ |
| 2.0 m | $57.0'$ | $55.0'$ | $0.0'$ | $1.6'$ |
| 5.0 m | $89.2'$ | $88.0'$ | $33.5'$ | $0.6'$ |

A single plane is acceptable only near its depth: the hand at 30 cm is more than $5°$ off with a 1 m plane, enough to miss a cup you reach for. The first-order formula underestimates near points by up to a quarter because the 7 cm forward offset is not small compared with 0.3 m. Per-pixel depth turns the error into $b\_\perp\,\sigma\_d/d^2$ for a depth error $\sigma\_d$: with a 3% error it stays near or below $10'$ even at 30 cm. This is why passthrough systems estimate depth: Chaurasia et al. (2020) describe a mobile passthrough system that computes a coarse depth proxy from the stereo cameras on dedicated hardware and densifies, filters and re-renders it per eye in real time; Xiao et al. (2022) replace the hand-designed reconstruction with a learned view-synthesis network.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-passthrough.svg" caption="Left: top view of the geometry, eye $E$ at the origin, camera $C$ 3.2 cm to the side and 7 cm in front. The camera sees the point $\mathbf X$ at 0.45 m along the cyan ray; assuming the plane $d\_0=1$ m puts it at $\mathbf X'$, which the eye sees along the red line instead of the green one, $194'$ off. Right: the angular error for points straight ahead against their depth, for planes at 1 m and 2 m and at infinity, the first-order formula (dotted), and per-pixel depth with 3% and 1% scale error (green, cyan). The dotted horizontal line is one pixel at 25 px/°." %}

### 5.2 Latency and the rest of the pipeline

The passthrough image has a motion-to-photon latency of its own, from camera exposure to display, and the late-warp machinery of section 3.4 applies to it as well. The camera images also need the lens model of post 01 (passthrough cameras are usually wide-angle), colour and exposure processing, and per-eye undistortion for the display optics. Because real and virtual content go through the same reprojection, a passthrough headset can keep them consistent with each other even where both are slightly wrong with respect to the true world; an optical see-through headset cannot, since the real world reaches the eye without any delay.

## 6. Hand tracking

Controllers carry LEDs or their own cameras and IMUs; hand tracking replaces them with the headset's tracking cameras looking at the user's hands. Han et al. (2020) describe the system of a consumer headset: a detection network finds the hands in the monochrome fisheye images, a keypoint network estimates 2D hand keypoints in each view using the previous frames, and a model-fitting stage solves for the pose of a kinematic hand skeleton (joint angles plus wrist pose) that best explains the keypoints of all views over time. UmeTrack (Han et al. 2022) makes the multi-view part end-to-end: one network takes several views and frames and directly outputs the 3D pose in world coordinates. Body and hand models such as MANO, and their use for robot teleoperation, are covered in [embodied AI post 6]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }}).

### 6.1 How well can two cameras locate a fingertip?

The geometry is the triangulation of post 04, but at close range and with a short baseline. For a rectified pair with focal length $f$ and baseline $b$, depth from disparity is $Z = fb/\delta$, so a disparity error $\sigma\_\delta$ gives $\sigma\_Z = Z^2\sigma\_\delta/(fb)$. If each keypoint has independent noise $\sigma$ in each image, $\sigma\_\delta = \sqrt2\,\sigma$. The snippet triangulates by DLT and propagates the pixel noise to first order, $\Sigma\_X = J\,\sigma^2 J^\top$, with a numerical Jacobian $J$, then checks it by Monte Carlo:

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

With $f = 280$ px, a 10 cm baseline and 1 px keypoint noise, the depth uncertainty is 4.55 mm at 0.3 m, 12.63 mm at 0.5 m and 24.75 mm at 0.7 m, matching $\sqrt2 Z^2/(fb)$ and the Monte Carlo values (4.52, 12.25, 24.48 mm). Laterally the point is $2Z/b$ times better, 6 to 14 times here: $\sigma\_x \approx Z\sigma/(\sqrt2 f)$ = 0.76, 1.26, 1.77 mm. A fingertip is therefore known well in the image directions and poorly in depth, exactly when the hand is stretched out to touch something. Real systems reduce this with more views, with the hand model (bone lengths fix the scale between joints) and with temporal filtering, which is the next topic.

### 6.2 Jitter against lag: the 1€ filter

Keypoint noise turns into jitter, which makes buttons hard to press; a strong low-pass filter removes jitter but adds lag, which makes the hand feel heavy. A fixed cutoff cannot satisfy both. The **1€ filter** of Casiez, Roussel and Vogel (2012) is a first-order low-pass filter whose cutoff frequency grows with the estimated speed: $f\_c = f\_{c,\min} + \beta\,\lvert\dot{\hat x}\rvert$, where $\beta$ turns a speed in m/s into hertz and so has the unit 1/m. At rest the cutoff is low and jitter is suppressed; during a fast movement it rises and the lag shrinks.

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

| Filter | jitter at rest | max error during the reach |
| --- | --- | --- |
| raw | 1.95 mm | 4.3 mm |
| low-pass 1 Hz | 0.34 mm | 53.4 mm |
| low-pass 5 Hz | 0.79 mm | 18.6 mm |
| 1€ (1 Hz, $\beta = 30$ m⁻¹) | 0.46 mm | 10.5 mm |

The 1€ filter keeps almost all of the jitter reduction of the 1 Hz filter and lags five times less during the reach; it beats the 5 Hz filter on both counts. The two parameters are tuned as the authors suggest: first $f\_{c,\min}$ for acceptable jitter at rest, then $\beta$ for acceptable lag in fast motion. Pinch and grab gestures are then detected from distances between filtered fingertips, with hysteresis (different thresholds for closing and opening) so that the state does not flicker.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-hand.svg" localized="true" caption="Left: top view of a stereo pair 10 cm apart ($f=280$ px, cyan: fields of view) and the 1σ uncertainty ellipses, magnified three times, of points triangulated with 1 px keypoint noise. The ellipses stretch along the viewing rays and grow like $Z^2$. Right: a fingertip at rest, then a 10 cm reach in 0.3 s, measured at 60 Hz with 2 mm noise (gray), and three filters; the legend gives the jitter at rest and the largest error during the reach." %}

## 7. Eye tracking

An eye tracker in a headset estimates where each eye looks, for interaction (look and pinch), for **foveated rendering** (render full resolution only where the fovea points; Patney et al. 2016 study how much the periphery can be coarsened without being noticed), for setting the rendering IPD, and for varifocal or other gaze-dependent optics. The geometry is a small 3D vision problem of its own.

### 7.1 Pupil and glint

Infrared LEDs around each lens illuminate the eye, and a small camera observes it, usually from below at an oblique angle. Two features are extracted: the **pupil centre**, a dark ellipse, and one or more **glints**, the specular reflections of the LEDs on the cornea. The cornea is approximately a sphere of radius about 7.8 mm whose centre is about 5 mm in front of the eye's centre of rotation; as the eye rotates, the pupil centre moves along a larger sphere than the corneal centre does, and the glint stays near the reflection point that the fixed LED and camera define. The **pupil-centre corneal-reflection** (PCCR) method uses the vector from the glint to the pupil centre in the image. Its key property is robustness to small slips of the headset: a translation of the camera relative to the head moves the pupil and the glint by nearly the same amount, so their difference changes much less than either. Guestrin and Eizenman (2006) give the full 3D theory; here we simulate the simplest regression-based version.

The simulation places a model eye at the origin, a camera 15 mm below and 35 mm in front of it looking at the eye's centre, and an LED next to the camera. The glint is found where the corneal sphere's normal bisects the directions to the LED and to the camera. A 9-point calibration (gaze targets at $\pm15°$) fits a second-order polynomial from the image feature to the gaze angles. We then evaluate on a grid of gaze directions out to $\pm20°$, with 0.2 px feature noise, after sliding the headset down by 0, 0.5 and 1 mm.

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

| Feature | no slip | 0.5 mm slip | 1 mm slip |
| --- | --- | --- | --- |
| pupil only | 0.33° | 3.18° | 6.42° |
| pupil − glint (PCCR) | 0.48° | 0.71° | 1.24° |

(Mean error inside the calibrated $\pm15°$ field. Over the whole $\pm20°$ grid, where the polynomial extrapolates, the PCCR means are 0.63°, 0.85° and 1.32°, with maxima up to 3.31°.)

Without slip the pupil alone is slightly better, because subtracting the glint adds its noise and its own nonlinearity. But a slip of one millimetre, which happens whenever the headset is bumped or the face moves, costs the pupil-only mapping more than six degrees, and PCCR only about one. Even PCCR is not slip-invariant, because the glint is a reflection on a curved surface and does not move exactly like the pupil; model-based methods that reconstruct the 3D corneal centre and pupil (Guestrin and Eizenman 2006) and learned methods go further. Two corrections our toy omits matter in practice: the pupil is seen through the refracting cornea, and the **visual axis** (through the fovea) differs from the optical axis by a few degrees, a per-person offset that the user calibration absorbs.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-eye.svg" localized="true" caption="Left: the simulated eye-camera image for the nine calibration gaze directions: pupil centres (purple), glints (orange crosses) and the pupil-glint vectors (gray). The faint markers are the same gaze directions after the headset slid down by 1 mm: pupil and glint both move up by about 17 px, while their difference changes much less. Right: mean gaze error inside the calibrated ±15° field against the slip, for the pupil alone and for PCCR." %}

For foveated rendering, latency matters again: saccades, the fast jumps of the eye between fixations, reach several hundred degrees per second, and the high-resolution region must reach the new gaze point soon after the eye lands, while visual sensitivity is still reduced after the saccade (saccadic suppression); otherwise the coarse periphery becomes visible. The [Interactive Lab]({{ '/' | relative_url }}#lab) on the home page has a foveated rendering demo in which you can see how the resolution can fall with eccentricity.

## 8. Scene understanding

To place content sensibly, to let a virtual ball bounce off the floor, or to hide a virtual object behind a real sofa, the headset needs a model of the room, not only its own pose. Three levels are common.

**Planes.** Floors, walls, tables and ceilings cover most of an indoor scene, and a plane is cheap to estimate and to use. The tracker provides gravity, which splits planes into horizontal ones (normal parallel to gravity: floor, tables, ceiling) and vertical ones (walls), and makes the search easier. The workhorse is RANSAC on 3D points from depth or from triangulated features, run sequentially: find the best plane, remove its inliers, repeat.

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

The floor ($\mathbf n = (0, 0, 1)$, 3016 inliers), the two walls ($(1, 0, 0)$ and $(0, 1, 0)$ with 1996 and 1473 inliers) and the table top ($\mathbf n = (0.001, 0.001, 1)$, $d = 0.752$ m, 605 inliers) come out in order of size, each with an RMS residual of 5.0 to 5.1 mm, the simulated sensor noise; 510 points (the clutter) remain. The table is found at 0.752 m for a true 0.75 m. A real system also bounds each plane by the convex hull or alpha shape of its inliers, merges planes over time as the user looks around, and tracks them as the map is refined.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-planes.svg" caption="The synthetic room-corner point cloud (5 mm noise) after sequential RANSAC: floor (green), wall $x=0$ (red), wall $y=0$ (blue) and table top at 0.752 m (orange), each with its normal oriented towards the room; the gray points are unexplained clutter." %}

**Meshes.** A headset with a depth sensor, or with dense stereo, can fuse depth into a TSDF and extract a triangle mesh with marching cubes, as in posts 07 to 09, at a resolution of a few centimetres. The mesh serves physics (collisions), occlusion of virtual objects by real ones, and navigation. Its resolution limits occlusion edges: a 5 cm voxel cannot cut a virtual object cleanly along the edge of a hand, which is why hand occlusion usually uses the hand tracker's model instead.

**Semantics.** Labels such as floor, wall, door, table, couch and screen turn geometry into something an application can reason about ("put the chessboard on a table", "never put content in front of a door"). Object detection on the images, projected onto the mesh, is one approach. SceneScript (Avetisyan et al. 2024) is an instructive alternative: from an egocentric video it predicts a structured description of the room's layout and objects as a sequence of commands (walls, doors, windows, boxes), trained on a large synthetic dataset. For applications, such a compact, editable representation can be more useful than a dense mesh. Platforms expose such results as **semantic anchors**: ARKit's plane anchors carry a classification (wall, floor, ceiling, table, seat, window, door), and Meta's scene API represents walls, the floor, tables and couches as anchors with semantic labels, so an application can attach content to "the table" instead of to raw coordinates; section 9 explains how anchors keep it there. [Post 08]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }}) discussed the trade-offs between representations in general.

## 9. Spatial anchors and relocalization

### 9.1 Why anchors exist

It would be simple to store each virtual object by its world coordinates $\mathbf X\_W$. The problem is that the world frame of a tracking system is not fixed: when the map is corrected by a loop closure or by bundle adjustment, poses and points move by up to the accumulated drift, and every object stored in world coordinates stays at its old coordinates, now in the wrong place. A **spatial anchor** is a pose $T\_{WA}$ attached to the map near the content, typically to a nearby keyframe. Content is stored relative to the anchor, $\mathbf X\_A$, and rendered at $T\_{WA}\mathbf X\_A$. When the map is corrected, the anchor moves with its keyframe, and the content moves with it.

The error that remains is the **lever arm**: an anchor rotation error $\delta\theta$ moves content at distance $r$ from the anchor by $\delta\theta\, r$, so 0.5° at 3 m is 26 mm. Anchors should therefore sit close to the content they hold, and large scenes should use many anchors. ARKit, ARCore and OpenXR runtimes (for example through vendor extensions such as `XR_MSFT_spatial_anchor`) expose anchors in exactly this sense.

The snippet walks a 12 m × 6 m rectangle with a VIO-like heading drift of 0.3° per metre, places a virtual object one metre to the left of the path at nine places, and stores each object twice: in world coordinates and relative to the nearest anchor (one keyframe every 2 m). Then a loop closure and pose-graph optimization (post 06) correct the keyframe poses; we assume, generously, that they become exact.

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

The drifting map closes the loop 1.19 m off. Objects stored in world coordinates end up between 0.8 cm (placed after 1.25 m of walking) and 104.6 cm (after 29.25 m) from where they belong, growing with the drift accumulated before they were placed. Objects stored relative to their anchor are all off by 0.42 cm: only the drift accumulated over the 0.75 m between the anchor's keyframe and the placement, acting on a lever arm of about 1.07 m, remains: a heading error that grows evenly along a straight stretch acts like one rotation about the middle of the stretch, which is $\sqrt{0.375^2 + 1^2} \approx 1.07$ m from the object, and $0.225° \approx 3.9$ mrad times 1.07 m is 4.2 mm.

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-anchors.svg" localized="true" caption="Top view of the anchor experiment. The true loop (black) and the drifting map before loop closure (orange dashed), which ends 1.19 m from its start. Stars: where the nine objects belong. Red crosses and arrows: objects stored in world coordinates, after the map has been corrected, up to 104.6 cm off. Green circles: the same objects stored relative to the nearest anchor (green squares, one every 2 m), each 0.42 cm off and hidden under its star." %}

### 9.2 Relocalization and shared anchors

To find a saved anchor again in a new session, or on another device, the headset must **relocalize**: estimate its pose in the saved map from its current images. The standard pipeline is hierarchical (Sarlin et al. 2019): retrieve the most similar keyframes of the map with a global image descriptor (a bag of visual words as in post 06, or a learned descriptor such as NetVLAD), match local features between the query image and those keyframes (post 03), which gives 2D-3D correspondences with the map points, and solve PnP with RANSAC (post 05) for $T\_{CW}$. Once the current session's frame $W\_2$ and the saved map's frame $W\_1$ are related, an anchor saved as $T\_{W\_1A}$ appears in the new session at

$$
T_{W_2A} = T_{W_2W_1}\,T_{W_1A}, \qquad T_{W_2W_1} = T_{W_2C}\,T_{CW_1},
$$

where $T\_{W\_2C}$ is the current tracking pose and $T\_{CW\_1}$ the relocalized one, both for the same image. Sharing anchors between devices works the same way: each device relocalizes in a common map (on a server for "cloud anchors") and composes its own transform. Relocalization must cope with changes in lighting and furniture between sessions, which is one reason why learned features and matchers (post 03) are widely used for it.

## 10. Putting it together

The widget below runs the whole chain of sections 2 to 4 in one dimension. A head turns (yaw) and sways sideways in front of a real box; a virtual box is drawn over it from the pose the renderer knows. Change the latency, the predictor, the late warp, the position drift, the object distance and the display resolution, and watch the registration error in arcminutes, in display pixels and in millimetres. The zoom panel shows the edge of the box with the display pixel grid.

{% include widget.liquid name="3d-vision-motion-to-photon" height="640" caption="Motion-to-photon lab. The renderer uses the head pose from $\Delta$ ms ago, extrapolated with no prediction, constant velocity or constant acceleration (gyro noise 0.2°/s, acceleration from samples 10 ms apart). Late warp re-samples the rotation 5 ms before the photons; translation still uses $\Delta$. The position estimate carries a slowly wandering drift (map corrections pull it back with a 5 s time constant) and pose jitter. Orange: rotation part of the error; cyan: translation part; black: total. Things to try: switch the predictor off at 25 ms; enable late warp and move the object to 0.3 m, then to 5 m; raise the drift with a near object; raise the display resolution and see how the same error becomes more pixels. In drag mode, drag the view left and right to turn the head yourself." %}

A few engineering rules summarize the post:

1. **Measure at the eye, in angle and time.** Convert every error into arcminutes at the eye for the distances your content lives at, and into display pixels.
2. **Latency is the largest raw error; prediction and late warp are the largest fixes.** Keep the prediction horizon short (late warp), keep the predictor low-order, and make sure that every pose is time-stamped consistently: the camera-IMU time offset of post 02 and the display timing must be calibrated.
3. **Near content is a translation problem.** Within arm's length, errors in where the eye and the head are dominate: eye position for optical see-through, depth for passthrough, position tracking for both.
4. **Anchor content locally.** Attach content to anchors near it, not to the world origin, and relocalize robustly.
5. **Filter input adaptively.** Hand and eye signals need speed-adaptive filtering, not a fixed low-pass.

## Try it

- The widget above: start at $\Delta = 25$ ms with the constant-velocity predictor, then switch to "none" to see the raw latency error; turn on late warp and compare near and far objects.
- The [Interactive Lab]({{ '/' | relative_url }}#lab) on the home page: the foveated rendering demo shows the eccentricity-dependent resolution that an eye tracker enables, and the Gaussian World demo renders a 3D Gaussian scene that you can also view in a headset by following [neural rendering post 6]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }}).
- If you have a headset with passthrough, hold your hand 20 cm in front of your face and move it sideways while looking at its edge against a far background; then do the same with a hand at arm's length. Any difference in how well the hand "sticks" to the background is the depth-dependent error of section 5.

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| A survey of augmented reality (Azuma) | Presence | 1997 | [DOI](https://doi.org/10.1162/pres.1997.6.4.355) | Defines AR and frames registration as its central problem |
| Registration error analysis for augmented reality (Holloway) | Presence | 1997 | [DOI](https://doi.org/10.1162/pres.1997.6.4.413) | End-to-end error budget of an optical see-through system; latency dominates |
| Single point active alignment method (SPAAM) for optical see-through HMD calibration for AR (Tuceryan, Navab) | ISAR | 2000 | — | The classic user-in-the-loop display calibration |
| General theory of remote gaze estimation using the pupil center and corneal reflections (Guestrin, Eizenman) | IEEE TBME | 2006 | [DOI](https://doi.org/10.1109/TBME.2005.863952) | The 3D model behind PCCR eye tracking |
| A multi-state constraint Kalman filter for vision-aided inertial navigation (Mourikis, Roumeliotis) | ICRA | 2007 | [DOI](https://doi.org/10.1109/ROBOT.2007.364024) | The MSCKF, a filter design widely used for VIO on mobile devices |
| 1€ filter: a simple speed-based low-pass filter for noisy input in interactive systems (Casiez, Roussel, Vogel) | CHI | 2012 | [DOI](https://doi.org/10.1145/2207676.2208639) | The adaptive filter used for hand and pointer input |
| Head tracking for the Oculus Rift (LaValle, Yershova, Katsev, Antonov) | ICRA | 2014 | [DOI](https://doi.org/10.1109/ICRA.2014.6906608) | Orientation tracking, drift correction and prediction in a consumer headset |
| The asynchronous time warp for virtual reality on consumer hardware (van Waveren) | VRST | 2016 | [DOI](https://doi.org/10.1145/2993369.2993375) | Late-stage reprojection decoupled from the application's frame rate |
| Towards foveated rendering for gaze-tracked virtual reality (Patney et al.) | SIGGRAPH Asia (ACM TOG) | 2016 | [DOI](https://doi.org/10.1145/2980179.2980246) | How far peripheral rendering can be coarsened with eye tracking |
| On-manifold preintegration for real-time visual-inertial odometry (Forster, Carlone, Dellaert, Scaramuzza) | IEEE T-RO | 2017 | [arXiv](https://arxiv.org/abs/1512.02363) | IMU preintegration for optimization-based VIO |
| A survey of calibration methods for optical see-through head-mounted displays (Grubert, Itoh, Moser, Swan) | IEEE TVCG | 2018 | [arXiv](https://arxiv.org/abs/1709.04299) | Overview of display and eye-position calibration |
| From coarse to fine: robust hierarchical localization at large scale (Sarlin, Cadena, Siegwart, Dymczyk) | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1812.03506) | Retrieval + local matching + PnP, the relocalization pipeline |
| MEgATrack: monochrome egocentric articulated hand-tracking for virtual reality (Han et al.) | SIGGRAPH (ACM TOG) | 2020 | [DOI](https://doi.org/10.1145/3386569.3392452) | Hand tracking from a headset's monochrome tracking cameras |
| Passthrough+: real-time stereoscopic view synthesis for mobile mixed reality (Chaurasia et al.) | I3D (PACMCGIT) | 2020 | [DOI](https://doi.org/10.1145/3384540) | Depth-based passthrough reprojection on a mobile headset |
| Towards indistinguishable augmented reality: a survey on optical see-through head-mounted displays (Itoh, Langlotz, Sutton, Plopski) | ACM Computing Surveys | 2021 | [DOI](https://doi.org/10.1145/3453157) | Spatial, temporal and visual realism of OST displays |
| NeuralPassthrough: learned real-time view synthesis for VR (Xiao et al.) | SIGGRAPH | 2022 | [arXiv](https://arxiv.org/abs/2207.02186) | Learned passthrough view synthesis |
| UmeTrack: unified multi-view end-to-end hand tracking for VR (Han et al.) | SIGGRAPH Asia | 2022 | [arXiv](https://arxiv.org/abs/2211.00099) | End-to-end multi-view, multi-frame hand pose in world space |
| Project Aria: a new tool for egocentric multi-modal AI research (Engel et al.) | arXiv preprint (August 2023) | 2023 | [arXiv](https://arxiv.org/abs/2308.13561) | A research glasses platform with SLAM, eye tracking and open datasets |
| SceneScript: reconstructing scenes with an autoregressive structured language model (Avetisyan et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2403.13064) | Room layout and objects as a structured command sequence |

Status as of November 2026: every entry is a peer-reviewed publication except Project Aria, which is an arXiv preprint.

## Learning resources

- S. M. LaValle, *Virtual Reality*, Cambridge University Press, 2023; a free online version is on the [author's site](https://lavalle.pl/vr/). Chapters on tracking, visual rendering, latency and perception.
- R. Azuma's survey above and the [OpenXR 1.1 specification](https://registry.khronos.org/OpenXR/specs/1.1-khr/html/xrspec.html) (frame timing, spaces and anchors) for the system view.
- Post 06 of this series for VIO, and the open-source VIO systems it discusses (OpenVINS, VINS-Fusion, ORB-SLAM3 in inertial mode) to experiment with inside-out tracking on recorded data.
- The [Project Aria](https://www.projectaria.com/) datasets and tools, which provide egocentric recordings with calibrated cameras, IMUs, eye gaze and SLAM trajectories.
- The [1€ filter page](https://cristal.univ-lille.fr/~casiez/1euro) with implementations in many languages.

## Exercises

1. A headset has a residual gyro bias of 0.02°/s after calibration and loses its camera tracking in a dark room. How long can it run on the IMU alone before the position error exceeds 1 cm, counting only the gyro-bias term? How long for orientation alone to drift by 1°?

   <details markdown="1"><summary>Hint</summary>

   Solve $\tfrac16 g\,b\_g t^3 = 0.01$ m with $b\_g = 3.49\times10^{-4}$ rad/s: $t = (0.06/(9.81 \cdot 3.49\times10^{-4}))^{1/3} \approx 2.6$ s. Orientation drifts by $b\_g t$, so 1° takes 50 s. Rotation-only tracking survives much longer than position tracking, which is why headsets fall back to 3DoF when camera tracking is lost.
   </details>

2. Derive the leading truncation error $\tfrac12\alpha\Delta^2$ of the constant-velocity predictor and check it against the table of section 3.3: at what time of the minimum-jerk turn is it largest, and what does it predict for $\Delta = 20$ ms?

   <details markdown="1"><summary>Hint</summary>

   The Taylor remainder after the linear term is $\tfrac12\alpha(\xi)\Delta^2$. The minimum-jerk acceleration $A/T^2(60s - 180s^2 + 120s^3)$ peaks at $s = (3 \mp \sqrt3)/6$, i.e. 127 and 473 ms, with $962$°/s²; $\tfrac12 \cdot 962 \cdot 0.02^2 = 0.192° = 11.5'$, the tabulated value.
   </details>

3. A passthrough headset has its cameras 6 cm in front of the eyes and 1 cm further apart than the eyes. It reprojects with a plane at 1.5 m. Using the first-order formula, compute the error for a hand at 0.4 m straight ahead and for a point at 0.4 m that is 20° to the side. Which offset component matters in each case?

   <details markdown="1"><summary>Hint</summary>

   Straight ahead, only the lateral 5 mm per eye is perpendicular to the line of sight: $0.005\,\lvert1/0.4 - 1/1.5\rvert = 9.2$ mrad $\approx 31.5'$ (`passthrough_error` with `c = (0.005, 0, 0.06)` gives $37.1'$). At 20° to the side the perpendicular offset is $0.005\cos20° \mp 0.06\sin20°$, that is 15.8 mm on the camera's side and 25.2 mm on the other side: the forward offset now dominates. The first-order errors are 1.7° and 2.6°; the exact ones are 2.0° and 3.2°.
   </details>

4. Extend the triangulation snippet to four cameras (add two cameras at $x = \pm0.1$ m tilted 30° outwards) and compute $\sigma\_z$ for a fingertip at 0.5 m. How much does each pair of extra views help, and why does a wider spread of viewing directions help more than more cameras at the same place?

   <details markdown="1"><summary>Hint</summary>

   Build $P = K[R \mid -R\mathbf C]$ with $R$ a rotation about $y$; `triangulate` already accepts any number of views. Depth precision depends on the angle between the rays (the triangulation angle of post 04), so views from further apart add more than views that nearly repeat an existing ray.
   </details>

5. In the anchor experiment, move the anchors further apart (every 6 m instead of 2 m) and place content 3 m from the path instead of 1 m. Predict the anchor-relative error from the lever-arm argument before running the code.

   <details markdown="1"><summary>Hint</summary>

   The heading drift between the anchor keyframe and the placement is about $0.3°/\text{m}$ times the distance walked between them (now up to 3.25 m), and it acts on a lever arm of roughly the distance from the middle of that stretch to the content. For 2.75 m of walking and content 3 m from the path that is $0.825° \approx 14.4$ mrad times about 3.3 m, or 4.8 cm; over all nine objects the code gives 1.2 to 5.8 cm instead of 0.42 cm. The code changes are `anchors = np.arange(0, n, 120)` and `offset = np.array([0.0, 3.0, 1.0])`.
   </details>

## Where to go next

This is the last post of **3D Vision Fundamentals**. Over ten posts we went from the pinhole camera to calibration, features, two-view and multi-view geometry, SLAM, depth, representations, reconstruction and, here, the real-time system that puts all of them in front of a person's eyes. Three series continue from here:

- **Neural rendering** starts again from posed images, now to learn radiance fields and 3D Gaussians: begin with [cameras and multi-view geometry]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }}), which you can now read as a review, and end with [capturing a scene and viewing it in VR]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }}).
- **World models** ask how a system can predict how a 3D world evolves, in pixels, latents or explicit 3D: start with [what is a world model]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }}).
- **Embodied AI** puts the perception of this series in a robot's control loop: start with [robotics foundations]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }}), and see [embodied AI meets XR and HCI]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }}) for how headsets, hand tracking and egocentric data feed robot learning.
