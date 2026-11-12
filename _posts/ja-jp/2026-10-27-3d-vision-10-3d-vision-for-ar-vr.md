---
layout: post
title: "AR/VR のための 3D ビジョン：トラッキング、遅延、レジストレーション誤差"
date: 2026-10-27 11:10:00+0900
description: "「3D ビジョンの基礎」の最終回：VIO と地図によるインサイドアウト 6DoF トラッキング、モーション・トゥ・フォトン遅延と予測、後段リプロジェクション、レジストレーション誤差のバジェット、パススルーの再投影、ハンドトラッキングとアイトラッキング、平面とメッシュ、空間アンカーと再ローカライズ。"
categories: 3d-vision
tags: [ar, vr, mixed-reality, vio, latency, registration, passthrough, hand-tracking, eye-tracking, spatial-anchors]
series: 3d-vision
series_order: 10
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

このシリーズのこれまでの回は、どれもオフラインの問題を解いてきました。カメラを一度キャリブレーションする（[第 2 回]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})）、写真の集合から姿勢と点を復元する（[第 5 回]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})）、デプスを融合して曲面にする（[第 9 回]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }})）。AR や VR のヘッドセットはこれらを同時に、リアルタイムで、バッテリーで、しかも人間の視覚系を審判として実行します。中心となる要求は**レジストレーション**（registration、位置合わせ）です。現実の机の上に置いた仮想物体は、頭が毎秒 100 度で回っているあいだも、1 度よりずっと小さな誤差でその机の上にとどまらなければなりません。VR では同じ要求が「頭を回したときに世界が揺れてはいけない」という形で現れます。

この記事では、そのために何が必要かを説明します。誤差はもはやセンサー上の再投影ピクセルではなく、眼の位置での分角（arcminute）と、頭の動きからその動きを映す光子が出るまでのミリ秒で測られます。具体的な問いに答えるための小さな道具箱（数式とシミュレーション）を作っていきます。IMU だけではどれくらい速くドリフトするのか。20 ms の遅延はどれだけのコストで、予測でどれだけ取り戻せるのか。回転だけの再投影はなぜ近くの物体で破綻するのか。レジストレーション誤差のバジェットはどう積み上げるのか。眼の数センチ前にあるパススルーカメラはなぜ近くの物体をゆがめるのか。ヘッドセットの 2 台のカメラは指先をどこまで正確に三角測量できるのか。アイトラッカーはなぜ角膜反射を使うのか。そして、下にある地図が変わっても、空間アンカーはどうやってコンテンツをその場所に保つのか。

## 前提知識

- [第 1 回]({{ '/blog/2026/3d-vision-01-image-formation-and-camera-models/' | relative_url }})のカメラモデルと OpenCV の規約：$K$、$R$、$\mathbf t$、同次座標、回転ホモグラフィ、ローリングシャッター。
- [第 2 回]({{ '/blog/2026/3d-vision-02-camera-calibration/' | relative_url }})第 9 節のカメラ-IMU キャリブレーションと時刻オフセット。
- [第 3 回]({{ '/blog/2026/3d-vision-03-features-and-matching/' | relative_url }})の RANSAC、[第 4 回]({{ '/blog/2026/3d-vision-04-two-view-geometry/' | relative_url }})の三角測量とステレオデプス、[第 5 回]({{ '/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/' | relative_url }})の PnP。
- [第 6 回]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})のビジュアル慣性オドメトリ、キーフレーム、ループ閉じ込み。第 [7]({{ '/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/' | relative_url }}) 回から第 [9]({{ '/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/' | relative_url }}) 回のデプス計測と TSDF 融合。
- Python と NumPy。以下のコードはすべてそのまま実行でき、本文中の数値はその出力です。

## 1. レジストレーションの問題

### 1.1 座標系と変換の連鎖

ヘッドセットにはいくつもの剛体座標系があります。座標系 $B$ の座標を座標系 $A$ の座標に写す $4\times4$ の剛体変換を $T\_{AB}$ と書きます。つまり $\tilde{\mathbf X}\_A = T\_{AB}\tilde{\mathbf X}\_B$、$T\_{AC} = T\_{AB}T\_{BC}$ です。この記法では、第 1 回のワールドからカメラへの行列 $[R \mid \mathbf t]$ は $T\_{CW}$ です。座標系は次のとおりです。

- $W$：トラッキングシステムの**ワールド**（地図）座標系。重力にそろえ、$z$ 軸が上向き。
- $B$：ヘッドセットの**ボディ**座標系。実際には IMU。
- $C\_i$：**トラッキングカメラ**。通常は前方、側方、下方を向いた複数の広角・グローバルシャッターのモノクロカメラ。
- $E\_L, E\_R$：**眼**。正確には左右の画像を描画する仮想カメラで、位置は装着者の瞳孔間距離（IPD、平均約 63 mm）で決まります。
- $A$：**アンカー**（anchor）。現実の場所に固定した座標系で、仮想コンテンツをこれに取り付けます。

アンカー座標系で与えた仮想物体の点 $\mathbf X\_A$ は、左眼のディスプレイ上で

$$
\lambda\,\tilde{\mathbf u} = K_{E_L}\,\big[\,T_{E_L B}\; T_{BW}(t_{\text{photon}})\; T_{WA}\,\big]_{3\times4}\, \tilde{\mathbf X}_A
$$

の位置に現れます。$[\cdot]\_{3\times4}$ は上の 3 行を取り出す操作です。各因子にはそれぞれの誤差源があります。$K\_{E\_L}$ と $T\_{E\_L B}$ はディスプレイのキャリブレーションから（光学シースルーディスプレイでは、レンズの後ろで眼が実際にどこにあるかにも依存します）。$T\_{WA}$ は地図から。$T\_{BW}(t)$ は頭部姿勢の逆で、トラッキングから得られます。しかも必要なのは光がディスプレイを出る時刻 $t\_{\text{photon}}$ での値で、フレームを描画する時点ではそれは未来です。この記事の残りでは、これらの因子をひとつずつ見ていきます。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-frames.svg" caption="左：ワールド座標系 $W$（$z$ が上）、頭部姿勢 $T\_{WB}(t)$、机の上のアンカー $A$ と $T\_{WA}$、アンカー座標系で定義した 10 cm の仮想立方体。オレンジの線は左眼から立方体の角 $\mathbf X\_A$ への視線です。右：ボディ座標系 $B$ で見たヘッドセット。外向き・下向きに傾けた 2 台のトラッキングカメラ $C\_L$、$C\_R$（点線は光軸）と、63 mm 離れ $B$ の 6 cm 後方にある 2 つの描画用の眼 $E\_L$、$E\_R$。光学座標系はすべて OpenCV の軸（赤 $x$ が右、緑 $y$ が下、青 $z$ が前）です。" %}

### 1.2 レジストレーション誤差の測り方

自然な単位は**眼の位置での角度**、つまり仮想点が描かれた方向と本来あるべき方向とのなす角です。1 度は 60 分角（$60'$）です。視力が正常な人は約 1 分角の細部を見分けられ、1 度あたり $\rho$ 画素のディスプレイは $60/\rho$ 分角ごとに 1 画素を描きます。$\rho = 25$ px/° なら $2.4'$ です。角度 $\varepsilon$ を物体の距離 $d$ での横ずれに換算すると $\varepsilon d$（ラジアン×メートル）になります。

ほとんどの誤差源は 2 つの基本的な場合で説明できます。頭部姿勢の**回転**誤差 $\delta\theta$ は描画するすべての方向を $\delta\theta$ だけ回すので、角度誤差は距離によらず $\delta\theta$ です。**並進**誤差 $\delta\mathbf p$ は視点をずらし、距離 $d$ の点では角度誤差が $\delta p\_\perp / d$ になります。$\delta p\_\perp$ は $\delta\mathbf p$ の視線に垂直な成分です。したがって遠くのコンテンツでは回転誤差が、近くのコンテンツでは並進誤差が支配的です。$\delta\theta = 0.1°$ なら誤差はどこでも $6'$、$\delta p\_\perp = 2$ mm なら 0.5 m で $13.8'$、4 m で $1.7'$ です。

## 2. インサイドアウト 6DoF トラッキング

初期の VR システムは、部屋に固定したカメラやレーザースイープで外からヘッドセットを追跡していました。現在のヘッドセットは**インサイドアウト**で追跡します。ヘッドセットに載ったカメラが外の世界を見るのです。アルゴリズムは[第 6 回]({{ '/blog/2026/3d-vision-06-visual-slam/' | relative_url }})のビジュアル慣性オドメトリですが、特有の条件に合わせて作り込まれています。頭は速く動き、近くの壁や手が視野を覆うことが多く、遅延の予算は厳しいのです。得意・不得意が正反対の 2 つのセンサーを融合します。

### 2.1 IMU だけでは足りない理由

IMU は角速度 $\tilde{\boldsymbol\omega}$（ジャイロ）と比力 $\tilde{\mathbf f} = R\_{WB}^\top(\mathbf a - \mathbf g)$（加速度計）を約 1 kHz で測ります。これを積分する**ストラップダウン**（strapdown）方程式

$$
\begin{aligned}
R &\leftarrow R\,\operatorname{Exp}\big((\tilde{\boldsymbol\omega} - \mathbf b_g)\,\Delta t\big),\\
\mathbf v &\leftarrow \mathbf v + \big(R(\tilde{\mathbf f} - \mathbf b_a) + \mathbf g\big)\Delta t,\\
\mathbf p &\leftarrow \mathbf p + \mathbf v\,\Delta t,
\end{aligned}
$$

は、任意の時刻の姿勢をほとんど遅延なしに与えます。問題はバイアス $\mathbf b\_g$ と $\mathbf b\_a$ で、これらは決して正確にはわかりません。加速度計のバイアス誤差 $\delta b\_a$ は 2 回積分されて位置誤差 $\tfrac12 \delta b\_a t^2$ になります。ジャイロのバイアス誤差 $\delta b\_g$ は積分されて傾き誤差 $\delta b\_g t$ になり、傾いた分だけ積分器はわずかに違う向きに重力を差し引くので、$g\,\delta b\_g t$ の水平加速度が残ります。これを 2 回積分すると $\tfrac16 g\,\delta b\_g t^3$ です。次のコードは、実際には完全に静止しているヘッドセットを、MEMS 程度の例示的なバイアス誤差 0.01 m/s²（約 1 mg）と 0.1°/s で積分します。

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

90 Hz の 1 フレーム（11 ms）後の位置誤差は $0.6\ \mu$m、30 Hz のカメラ間隔（33 ms）後は加速度計バイアスで $5.4\ \mu$m、ジャイロバイアスで $0.1\ \mu$m です。無視できる大きさです。1 秒後にはそれぞれ 5.0 mm と 2.8 mm、10 秒後には 0.5 m と 2.85 m で、$\tfrac12 \delta b\_a t^2$ と $\tfrac16 g\,\delta b\_g t^3$ の法則どおりです。IMU は次の数十ミリ秒にとっては優れたセンサーですが、次の 1 分間にとっては役に立ちません。

### 2.2 カメラがドリフトを抑える

カメラは正反対の性質を持ちます。画像は地図のランドマークに対する絶対的な測定を与えます（ランドマークが見えているかぎりドリフトしません）が、毎秒 30〜60 回しか得られず、数十ミリ秒の露光と処理の遅延があり、速い動きによるブレや、暗い部屋・テクスチャのない部屋では失敗します。VIO は両者を組み合わせます。画像と画像のあいだは IMU が状態を伝播し、各画像がそれを補正し、フィルタはその過程でバイアスも推定します。これが $t^2$ と $t^3$ の増加を消すのです。1 次元のおもちゃモデルでこの仕組みを確かめましょう。状態は位置、速度、加速度計バイアスで、IMU が 1 kHz で予測し、ノイズ 1 mm のカメラによる位置観測が 33 ms ごとに届きます。

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

カメラ更新があれば誤差は RMS 0.366 mm（最悪 0.864 mm）にとどまり、フィルタはバイアスを $0.0100$ m/s² と、真値どおりに学習します。更新がなければ同じ IMU は 1 秒後に 3.0 mm、4 秒後に 72.5 mm ずれます。実際のヘッドセットの VIO は同じことを 6DoF で行い、マルチステート制約カルマンフィルタ（MSCKF、Mourikis と Roumeliotis 2007）か、IMU 事前積分を使うスライディングウィンドウ最適化（Forster ら 2017）を使います。どちらも第 6 回で説明しました。カメラ-IMU の外部パラメータと時刻オフセットもオンラインで推定し、第 2 回の工場キャリブレーションを精緻化します。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-imu-drift.svg" caption="左：静止したヘッドセットを IMU だけで積分したときの位置誤差（2.1 節のコード）。加速度計バイアス 0.01 m/s²（オレンジ）とジャイロバイアス 0.1°/s（紫）、両対数軸。点線と破線は $\tfrac12 b\_a t^2$ と $\tfrac16 g\,b\_g t^3$ で、縦線は 90 Hz の 1 フレーム、30 Hz のカメラ間隔、1 秒を示します。右：2.2 節の 1 次元おもちゃ VIO の 2.0〜2.5 s。誤差（紫）はカメラ更新（灰色の線、33 ms ごと）のたびに跳び、そのあいだはわずかにドリフトします。網掛けはフィルタ自身の $\pm2\sigma$ です。" %}

### 2.3 地図

VIO だけでもまだゆっくりドリフトします。重力まわりの回転（ヨー）と位置は慣性データからは観測できず、その誤差は移動距離とともに増えるからです。そこでヘッドセットは**地図**を持ちます。第 6 回の意味でのキーフレームと、その特徴点・3D 点です。地図には 3 つの役割があります。地図にある場所を再訪するとドリフトが補正されます（ループ閉じ込み）。空間アンカーは地図に取り付けられます（第 9 節）。そして地図を保存すれば次のセッションでそこに**再ローカライズ**でき、昨日置いたコンテンツが同じ場所に再び現れ、VR ヘッドセットのプレイエリアの境界も描き直さずに済みます。再ローカライズの仕組みには第 9 節で戻ります。

## 3. モーション・トゥ・フォトン遅延と予測

### 3.1 遅延はどこから来るか

**モーション・トゥ・フォトン遅延**（motion-to-photon latency）は、頭が動いてから、その動きを反映した光をディスプレイが出すまでの時間です。図は例示的な 90 Hz のパイプラインです。アプリケーションが予測された頭部姿勢を 2 ms で取得し、CPU でシミュレーションと描画コマンドの記録を行い、GPU が両眼の画像を描画し、コンポジタがレンズ歪みを補正し、ディスプレイが 1 リフレッシュ周期 11.1 ms をかけてフレームを 1 行ずつ走査出力します。アプリケーションが取得した姿勢だけを使うと、走査の中央までの遅延は 23.6 ms です。そのため現代のランタイムはどれも、走査出力の直前に頭部姿勢をもう一度取得し、完成した画像を補正します（3.4 節）。すると最後の姿勢サンプルから光子までは 8.1 ms しか残りません。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-m2p-timeline.svg" localized="true" caption="例示的な 90 Hz のフレーム。IMU は 1 kHz（目盛り）、トラッキングカメラは 30 Hz でサンプリングされます。アプリケーションは 2 ms で頭部姿勢を読み（オレンジの点）、GPU は 15 ms まで描画します。後段リプロジェクションは 17.5 ms で姿勢を読み直し（緑の点）、完成した画像を再投影します。ディスプレイは 20〜31.1 ms に走査出力する（青：時間に対する行）ので、中央の行の光子は 25.6 ms に出ます（赤い星）。後段リプロジェクションがなければ画像は 23.6 ms 古く、あれば 8.1 ms です。" %}

細かいことが 2 つ重要です。第一に、ディスプレイはローリングシャッターのカメラ（第 1 回 3.5 節）と同じく画像全体を一度に表示しません。下の行は上の行より最大 1 フレーム周期遅れて現れるので、ランタイムは画像の部分ごとに異なる姿勢を予測できます。第二に、各フレームをリフレッシュ周期のあいだずっと点灯させるディスプレイでは、動く物体を眼が追うとフレームが網膜上で尾を引きます。そのため VR ディスプレイは**低残光**（low persistence）で、各フレームを周期のごく一部だけ点灯させます。

アプリケーションとヘッドセットのランタイムをつなぐ標準 API である OpenXR では、この仕組みがフレームループに現れています。`xrWaitFrame` は `predictedDisplayTime` を返し、これはそのフレームが表示される区間の中央（図の赤い星）と規定されています。アプリケーションは `xrLocateViews` でその未来の時刻の眼の姿勢を問い合わせます。予測はランタイムが行い、アプリケーションは与えられた時刻を使うだけです。

### 3.2 遅延のコスト

描画器が $\Delta$ 秒前の頭のヨー角を使うと、描かれた世界は $\theta(t) - \theta(t - \Delta) \approx \omega\Delta$ だけ回転します。普通の振り向き $\omega = 100$°/s で遅延 $\Delta = 20$ ms なら $2° = 120'$、25 px/° のディスプレイで 50 画素です。予測がなければ、世界は頭の動きのたびに目に見えて遅れ、頭が止まると跳ね戻ります。Holloway（1997）は、光学シースルーシステムでは中程度の頭の速さでも、この誤差がほかのすべてのレジストレーション誤差を上回ることを示しました。

### 3.3 予測

対策は、姿勢を光子の時刻まで外挿することです。ジャイロは角速度を直接与え、ジャイロの微分は角加速度を与えるので、テイラー級数

$$
\hat\theta(t) = \theta(t-\Delta) + \omega(t-\Delta)\,\Delta + \tfrac12\,\alpha(t-\Delta)\,\Delta^2
$$

を第 1 項（予測なし）、第 2 項（**等速度**）、第 3 項（**等加速度**）で打ち切ることができます。打ち切り誤差の主要項はそれぞれ $\omega\Delta$、$\tfrac12\alpha\Delta^2$、$\tfrac16\dot\alpha\Delta^3$ です。高次ほど滑らかな動きには正確ですが、ノイズのある測定を微分することになります。$h$ 秒離れた 2 つのジャイロサンプルから推定した角加速度のノイズは約 $\sqrt2\,\sigma\_\omega/h$ で、予測ではさらに $\tfrac12\Delta^2$ が掛かります。3 つを比べるため、0.6 s で 60° 回る速い振り向きを、随意運動の滑らかな形である躍度最小（minimum-jerk）の速度プロファイルで作り、ジャイロに 1 サンプルあたり 0.2°/s の白色ノイズを加えます。

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

この振り向きのピーク角速度は 187.5°/s、ピーク角加速度は 962°/s² です。最大誤差（括弧内はジャイロノイズあり）は次のとおりです。

| 遅延 | 予測なし | 等速度 | 等加速度 |
| --- | --- | --- | --- |
| 10 ms | $112.5'$ | $2.9'$ ($3.1'$) | $0.4'$ ($0.9'$) |
| 20 ms | $224.8'$ | $11.5'$ ($12.1'$) | $2.1'$ ($3.6'$) |
| 40 ms | $448.7'$ | $46.0'$ ($46.7'$) | $12.5'$ ($15.3'$) |

教訓は 3 つです。予測の効果は絶大で、20 ms では $3.7°$ の誤差を 5 分の 1 度まで減らします。その残差は予測時間に対して**2 乗**（等速度）または**3 乗**（等加速度）で増えるので、予測時間を短くすることは予測器を改良するのと同じくらい価値があります。そしてノイズが高次の利得を食い、予測時間が長いほどその影響は大きくなります。現実の頭の動きは躍度最小曲線ほど滑らかではなく、動きの始まりと終わりで高次の予測器を最も損ないます。そのため実用的な予測器（LaValle ら 2014 は初期の民生用ヘッドセットの予測器を説明しています）は低次で、ジャイロをフィルタし、頭の速さに応じて外挿の度合いを調整します。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-prediction.svg" caption="左：60° の躍度最小の振り向きにおける $\Delta=20$ ms でのヨー誤差。予測なし（赤）、等速度（オレンジ）、等加速度（紫、ノイズなし。薄い線は 0.2°/s のジャイロノイズを加えたもの）。灰色の破線は頭の角速度（右軸、ピーク 187.5°/s）です。等速度予測は角加速度のピーク付近（約 130 ms と 470 ms）で、等加速度予測は躍度のピークで誤差が最大になります。右：ジャイロノイズありで、振り向き全体の最大誤差を遅延 $\Delta$ に対してプロットしたもの。点線は 25 px/° での 1 表示画素です。" %}

### 3.4 後段リプロジェクション

20 ms 以上先の予測は決して完璧にならないので、ランタイムは予測時間そのものも縮めます。予測姿勢でフレームを描画したあと、**後段リプロジェクション**（late warp。タイムワープ、リプロジェクションとも呼ばれます）が走査出力の数ミリ秒前に姿勢を取り直し、完成した画像をその姿勢へ変形します。van Waveren（2016）は、これを民生用ハードウェアで非同期に行い、アプリケーションがフレームを落としても毎リフレッシュで新しいワープが行われるようにする方法を説明しています。

**回転のみのワープ。** 描画から表示までに頭が回転 $R\_{\Delta}$（古いカメラから新しいカメラへ）だけをしたのなら、各画素は第 1 回の回転ホモグラフィで動きます。

$$
\tilde{\mathbf u}' \sim K\,R_{\Delta}\,K^{-1}\,\tilde{\mathbf u}
$$

デプスは不要で、画素あたりテクスチャ参照 1 回で済みます。回転に対しては厳密です。眼の並進 $\mathbf b$ に対しては、深さ $Z$ の点で視差 $f\,b\_\perp/Z$ 画素だけずれます。第 4 回の視差の式です。

**デプスを使うワープ。** 描画したデプスバッファがあれば、各画素を逆投影し、動かし、厳密に再投影できます。$\tilde{\mathbf u}' \sim K(R\_\Delta Z K^{-1}\tilde{\mathbf u} + \mathbf t\_\Delta)$ で、並進も扱えます。代償はディスオクルージョン（disocclusion）で、動いた眼から新たに見える背景は一度も描画されていないので、何らかの方法で埋める必要があります。

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

遅延のあいだに頭が 2° 回り 4 cm 動いた場合、回転のみのワープは 0.6 m の板で 20.07 px、2 m の柱で 5.88 px、4 m の壁で 3.06 px ずれ、$f b/Z$ = 20、6、3 px と一致します。次の図はこのシーンを描画したものです。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-timewarp.svg" caption="レイキャストしたおもちゃのシーン：4 m のチェッカー模様の壁、2 m のシアンの柱、0.6 m のオレンジの板。320×240 画素、$f=300$。(a) 古い頭部姿勢で描画したフレーム。(b) 新しい姿勢（右へ 2° 回転、右へ 4 cm 移動）での正解。(c) (a) を回転のみでワープしたもの：遠くの壁はほぼ正しいが、近くの板は真の輪郭（破線）より 20 px 遅れています。マゼンタの画素は古いフレームの外側です。(d) (a) をデプスでワープしたもの：板は輪郭に一致しますが、板がどいて現れた背景（右側のマゼンタの帯）は一度も描画されていません。画像全体で、(c) の後に誤っている画素は 26.1%、(d) の後は 1.1%（ほかに穴が 8.3%）です。" %}

実際のランタイムは両方を組み合わせます。毎フレーム回転ワープを行い、アプリケーションがデプスを提供したりフレームを落としたりしたときはデプスや動きベクトルを使って外挿し、穴は周囲の背景で簡単に埋めます。第 5 節では、パススルー映像がまったく同じ問題で、変換が違うだけだとわかります。

## 4. レジストレーション誤差のバジェット

### 4.1 視差誤差のひとつの公式

いくつかの誤差源は同じ幾何を共有しています。距離 $d$ の点の像が視点 $O'$ では正しく作られたのに、本当の眼 $O$ に対しては距離 $d\_0$（ディスプレイの焦点面、仮定した平面、無限遠）にあるかのように描かれたとします。$O'$ が $O$ から $\mathbf b$ だけずれていれば、眼での角度誤差は $b/d$ について 1 次の近似で

$$
\varepsilon \approx b_\perp \left|\frac1d - \frac1{d_0}\right|
$$

です。$b\_\perp$ は $\mathbf b$ の視線に垂直な成分です。$d = d\_0$ でゼロになり、近い点では $b\_\perp/d$ のように増えます。具体的には次の場合があります。

- **回転のみの後段リプロジェクション**：$\mathbf b$ は残りの遅延のあいだの頭の並進、$d\_0 = \infty$（3.4 節）。
- **光学シースルーディスプレイでの眼の位置の誤差**：$\mathbf b$ は仮定した眼の位置の誤差、$d\_0$ はディスプレイの焦点面（光学系が作る虚像）の距離。
- **深さを仮定したパススルー**：$\mathbf b$ はカメラから眼へのオフセット、$d\_0$ は仮定したシーンの深さ（第 5 節）。
- **トラッキングの並進誤差**：$\mathbf b = \delta\mathbf p$、$d\_0 = \infty$。

### 4.2 バジェットを積み上げる

レジストレーション誤差のバジェットは、各誤差源の 1σ の大きさと距離依存性を並べ、独立なものを二乗和平方根（RSS）で合成します。以下の値は、よく作り込まれた光学シースルーヘッドセットを想定した例示です。Holloway（1997）は手術計画システムについて、同じ分析をはるかに詳しく行いました。

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

遅延の $3'$ という枠は、第 3 節の等速度予測器を後段リプロジェクション後に残る 8 ms に適用した場合に相当します。その節の速い振り向きでも、8 ms での最大誤差は $1.85'$ です。出力（分角）は次のとおりです。

| 誤差源 | 0.3 m | 0.5 m | 1 m | 2 m | 4 m |
| --- | --- | --- | --- | --- | --- |
| トラッキング回転誤差（0.02°） | 1.20 | 1.20 | 1.20 | 1.20 | 1.20 |
| トラッキング並進誤差（1 mm） | 11.46 | 6.88 | 3.44 | 1.72 | 0.86 |
| 予測後の残留遅延 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| ディスプレイ較正（0.03°） | 1.80 | 1.80 | 1.80 | 1.80 | 1.80 |
| 眼の位置（2 mm、焦点面 2 m） | 19.48 | 10.31 | 3.44 | 0.00 | 1.72 |
| カメラ-IMU 時刻オフセット（0.5 ms） | 1.50 | 1.50 | 1.50 | 1.50 | 1.50 |
| **合計（RSS）** | **22.95** | **13.02** | **6.29** | **4.35** | **4.43** |
| 物体上での合計（mm） | 2.00 | 1.89 | 1.83 | 2.53 | 5.15 |
| 25 px/° での表示画素 | 9.56 | 5.43 | 2.62 | 1.81 | 1.85 |

このようなバジェットを読むと、どこに労力を注ぐべきかがわかります。手や道具がある腕の届く範囲（0.3〜0.5 m）では、並進型の誤差、つまり眼が本当はどこにあるか、頭が本当はどこにあるかが支配的です。2 m を超えると角度型の誤差（遅延、ディスプレイ較正、回転）が主役になります。ミリメートルで見た合計は 1 m まではほぼ一定で、その先は距離とともに増えます。同じ角度が物体上でより広い範囲を覆うからです。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-budget.svg" localized="true" caption="左：バジェットのコードの 6 つの寄与と RSS 合計（黒）を、仮想物体の距離に対して両対数で示したもの。並進型の項は $1/d$ で減り、眼の位置の項は 2 m の焦点面でゼロになってその先で再び増え、角度型の項は水平です。点線は 25 px/° での 1 表示画素です。右：同じ合計を物体上の横ずれ（mm）にしたもの。" %}

## 5. パススルー複合現実

**ビデオシースルー**（パススルー）ヘッドセットは、自分のカメラを通して現実世界を見せます。これで光学シースルーの問題（仮想コンテンツを不透明にでき、正しく遮蔽でき、2 つの世界の遅延と明るさが同じになる）は解消しますが、新しい問題が生じます。カメラは眼の位置にないのです。カメラは眼の数センチ前にあり、左右の間隔が IPD と違うことも多く、内部パラメータもレンズ歪みも異なります。各カメラの画像をそのまま片眼に見せると、世界は近く大きく、ずれて見え、頭を回すと間違った動き方をします。したがってパススルーは**新視点合成**（view synthesis）の問題、つまり厳しい遅延予算のもとでカメラ画像を眼の視点から描き直す問題です。

### 5.1 デプスを使う再投影

カメラ画素 $\tilde{\mathbf u}\_C$ にデプス $Z$ があれば、眼への再投影は 3.4 節のデプスワープを、カメラから眼への変換で行うことになります。

$$
\lambda\,\tilde{\mathbf u}_E = K_E\big(R_{EC}\,Z\,K_C^{-1}\tilde{\mathbf u}_C + \mathbf t_{EC}\big).
$$

画素ごとのデプスがなければ、最も簡単な近似はシーン全体が距離 $d\_0$ の平面上にあると仮定することです。このとき写像は平面誘導ホモグラフィ（第 4 回）になり、カメラ座標での平面 $\mathbf n^\top\mathbf X = d\_0'$ に対して $H = K\_E\big(R\_{EC} + \mathbf t\_{EC}\mathbf n^\top/d\_0'\big)K\_C^{-1}$ です。平面から外れた点には 4.1 節の視差誤差が生じ、$b\_\perp$ はカメラから眼へのオフセットです。次のコードは、眼の横 3.2 cm、前 7 cm にあるカメラについて、正面の点の厳密な誤差を計算します。

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

| 真の深さ $d$ | 1 m の平面 | 1 次の公式 | 2 m の平面 | 画素ごとのデプス、誤差 3% |
| --- | --- | --- | --- | --- |
| 0.3 m | $333.8'$ | $256.7'$ | $404.7'$ | $10.8'$ |
| 0.5 m | $127.9'$ | $110.0'$ | $191.7'$ | $6.4'$ |
| 1.0 m | $0.0'$ | $0.0'$ | $59.1'$ | $3.2'$ |
| 2.0 m | $57.0'$ | $55.0'$ | $0.0'$ | $1.6'$ |
| 5.0 m | $89.2'$ | $88.0'$ | $33.5'$ | $0.6'$ |

1 枚の平面が使えるのはその深さの近くだけです。1 m の平面では 30 cm の手が $5°$ 以上ずれ、手を伸ばしたカップをつかみ損ねるほどです。1 次の公式は近い点を最大 4 分の 1 ほど過小評価します。前方 7 cm のオフセットが 0.3 m に比べて小さくないからです。画素ごとのデプスを使うと、デプス誤差 $\sigma\_d$ に対して誤差は $b\_\perp\,\sigma\_d/d^2$ になり、誤差 3% なら 30 cm でも $10'$ 程度以下にとどまります。これがパススルーシステムがデプスを推定する理由です。Chaurasia ら（2020）は、ステレオカメラから専用ハードウェアで粗いデプスの代理を計算し、それを密にしてフィルタし、眼ごとにリアルタイムで描き直すモバイル向けパススルーシステムを説明しています。Xiao ら（2022）は手で設計した再構成を学習型の新視点合成ネットワークに置き換えました。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-passthrough.svg" caption="左：幾何の上面図。眼 $E$ が原点、カメラ $C$ は横 3.2 cm、前 7 cm。カメラは 0.45 m の点 $\mathbf X$ をシアンの光線上に見ます。平面 $d\_0=1$ m を仮定するとそれは $\mathbf X'$ に置かれ、眼は緑の線ではなく赤い線に沿ってそれを見るので $194'$ ずれます。右：正面の点の角度誤差を深さに対して示したもの。1 m、2 m、無限遠の平面、1 次の公式（点線）、スケール誤差 3% と 1% の画素ごとのデプス（緑、シアン）。水平の点線は 25 px/° での 1 画素です。" %}

### 5.2 遅延とパイプラインの残り

パススルー画像にも、カメラの露光から表示までの独自のモーション・トゥ・フォトン遅延があり、3.4 節の後段リプロジェクションの仕組みがそのまま当てはまります。カメラ画像には第 1 回のレンズモデル（パススルーカメラはたいてい広角です）、色と露出の処理、ディスプレイ光学系のための眼ごとの歪み補正も必要です。現実と仮想のコンテンツが同じ再投影を通るので、パススルーヘッドセットは、両方が本当の世界に対して少しずれていても、両者を互いに一致させておけます。光学シースルーヘッドセットではそれができません。現実世界は一切の遅延なしに眼に届くからです。

## 6. ハンドトラッキング

コントローラーは LED や独自のカメラと IMU を備えていますが、ハンドトラッキングはヘッドセットのトラッキングカメラでユーザーの手を直接見ることでそれを置き換えます。Han ら（2020）は民生用ヘッドセットのシステムを説明しています。検出ネットワークがモノクロの魚眼画像の中で手を見つけ、キーポイントネットワークが過去のフレームを利用して各ビューの 2D キーポイントを推定し、モデルあてはめの段階がすべてのビューのキーポイントを時間方向にも最もよく説明する運動学的な手の骨格の姿勢（関節角と手首の姿勢）を解きます。UmeTrack（Han ら 2022）はマルチビューの部分をエンドツーエンドにし、1 つのネットワークが複数のビューとフレームを受け取ってワールド座標の 3D 姿勢を直接出力します。MANO などの身体・手のモデルと、そのロボット遠隔操作への応用は[身体性 AI 第 6 回]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})で扱っています。

### 6.1 2 台のカメラで指先をどこまで正確に特定できるか

幾何は第 4 回の三角測量ですが、距離が近く基線が短い場合です。焦点距離 $f$、基線 $b$ の平行化ステレオでは視差から深さが $Z = fb/\delta$ と求まるので、視差の誤差 $\sigma\_\delta$ は $\sigma\_Z = Z^2\sigma\_\delta/(fb)$ を生みます。各キーポイントが各画像で独立なノイズ $\sigma$ を持てば $\sigma\_\delta = \sqrt2\,\sigma$ です。次のコードは DLT で三角測量し、数値ヤコビアン $J$ で画素ノイズを 1 次まで伝播させて $\Sigma\_X = J\,\sigma^2 J^\top$ とし、モンテカルロで確かめます。

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

$f = 280$ px、基線 10 cm、キーポイントノイズ 1 px では、深さの不確かさは 0.3 m で 4.55 mm、0.5 m で 12.63 mm、0.7 m で 24.75 mm で、$\sqrt2 Z^2/(fb)$ とモンテカルロの値（4.52、12.25、24.48 mm）に一致します。横方向は 1 桁よく、$\sigma\_x$ = 0.76、1.26、1.77 mm です。つまり指先は画像の方向にはよくわかり、深さ方向にはよくわかりません。それも、何かに触ろうと手を伸ばしたときにこそそうなります。実際のシステムは、ビューを増やし、手のモデルを使い（骨の長さが関節間のスケールを固定します）、時間方向にフィルタしてこれを緩和します。それが次の話題です。

### 6.2 ジッタと遅れ：1€ フィルタ

キーポイントのノイズはジッタになり、ボタンを押しにくくします。強いローパスフィルタはジッタを除きますが遅れを生み、手が重く感じられます。固定のカットオフでは両立できません。Casiez、Roussel、Vogel（2012）の **1€ フィルタ**は、カットオフ周波数が推定速度とともに上がる 1 次のローパスフィルタです：$f\_c = f\_{c,\min} + \beta\,\lvert\dot{\hat x}\rvert$。静止時はカットオフが低くジッタが抑えられ、速い動きではカットオフが上がって遅れが縮みます。

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

| フィルタ | 静止時のジッタ | 手を伸ばすあいだの最大誤差 |
| --- | --- | --- |
| 生データ | 1.95 mm | 4.3 mm |
| ローパス 1 Hz | 0.34 mm | 53.4 mm |
| ローパス 5 Hz | 0.79 mm | 18.6 mm |
| 1€（1 Hz、$\beta = 30$ s/m） | 0.46 mm | 10.5 mm |

1€ フィルタは 1 Hz フィルタのジッタ低減をほぼすべて保ちながら、手を伸ばすあいだの遅れは 5 分の 1 です。5 Hz フィルタにはどちらの指標でも勝っています。2 つのパラメータは著者の勧める順に調整します。まず静止時のジッタが許容できるように $f\_{c,\min}$ を決め、次に速い動きでの遅れが許容できるように $\beta$ を決めます。ピンチやつかむジェスチャーは、フィルタした指先間の距離から、ヒステリシス（閉じるときと開くときで異なるしきい値）を付けて検出し、状態がちらつかないようにします。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-hand.svg" localized="true" caption="左：10 cm 離れたステレオカメラ（$f=280$ px、シアンは視野）の上面図と、キーポイントノイズ 1 px で三角測量した点の 1σ 不確かさ楕円（3 倍に拡大）。楕円は視線方向に伸び、$Z^2$ で大きくなります。右：静止していた指先が 0.3 s で 10 cm 伸びる動きを、60 Hz、ノイズ 2 mm で測ったもの（灰色）と 3 つのフィルタの結果。凡例は静止時のジッタと手を伸ばすあいだの最大誤差です。" %}

## 7. アイトラッキング

ヘッドセットのアイトラッカーは左右の眼がどこを見ているかを推定し、インタラクション（見てピンチ）、**中心窩レンダリング**（foveated rendering。中心窩が向いている所だけをフル解像度で描く。Patney ら 2016 は周辺をどこまで粗くしても気づかれないかを調べました）、描画用の IPD の設定、可変焦点など視線に依存する光学系に使われます。その幾何はそれ自体が小さな 3D ビジョンの問題です。

### 7.1 瞳孔とグリント

各レンズのまわりの赤外 LED が眼を照らし、小さなカメラがたいてい下から斜めに眼を観察します。抽出する特徴は 2 つで、暗い楕円である**瞳孔中心**と、LED の角膜での鏡面反射である 1 つ以上の**グリント**（glint、角膜反射）です。角膜はおおよそ半径約 7.8 mm の球で、その中心は眼球の回転中心の約 5 mm 前にあります。眼が回ると瞳孔中心は角膜中心より大きな球面上を動き、グリントは固定された LED とカメラが決める反射点の近くにとどまります。**瞳孔中心角膜反射**（PCCR）法は、画像上でグリントから瞳孔中心へのベクトルを使います。その重要な性質は、ヘッドセットの小さなずれに強いことです。カメラが頭に対して並進すると瞳孔とグリントはほぼ同じだけ動くので、その差はそれぞれの動きよりずっと小さくしか変わりません。Guestrin と Eizenman（2006）が完全な 3D 理論を与えています。ここでは最も簡単な回帰型の版をシミュレーションします。

シミュレーションでは、モデル眼を原点に置き、カメラを眼の 15 mm 下、35 mm 前に置いて眼の中心に向け、LED をカメラの隣に置きます。グリントは、角膜球の法線が LED への方向とカメラへの方向を二等分する点として求めます。9 点キャリブレーション（注視目標は $\pm15°$）で、画像特徴から注視角への 2 次多項式をあてはめます。そして $\pm20°$ までの注視方向の格子で、特徴ノイズ 0.2 px、ヘッドセットを 0、0.5、1 mm 下にずらした条件で評価します。

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

| 特徴 | ずれなし | 0.5 mm のずれ | 1 mm のずれ |
| --- | --- | --- | --- |
| 瞳孔のみ | 0.33° | 3.18° | 6.42° |
| 瞳孔 − グリント（PCCR） | 0.48° | 0.71° | 1.24° |

（較正した $\pm15°$ の範囲での平均誤差。多項式が外挿になる $\pm20°$ の格子全体では、PCCR の平均は 0.63°、0.85°、1.32° で、最大 3.31° に達します。）

ずれがなければ瞳孔だけのほうが少しよい結果です。グリントを引くと、そのノイズと独自の非線形性が加わるからです。しかし 1 mm のずれ（ヘッドセットに何かが当たったり顔が動いたりすれば起こります）で、瞳孔だけの写像は 6 度以上の誤差になり、PCCR は約 1 度で済みます。PCCR でもずれに完全に不変ではありません。グリントは曲面での反射なので、瞳孔とまったく同じようには動かないからです。3D の角膜中心と瞳孔を復元するモデルベースの手法（Guestrin と Eizenman 2006）や学習型の手法はさらに先へ進みます。このおもちゃモデルが省いた、実際には重要な補正が 2 つあります。瞳孔は屈折する角膜を通して見えること、そして（中心窩を通る）**視軸**が光軸と数度ずれていることです。この個人ごとのずれはユーザーキャリブレーションが吸収します。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-eye.svg" localized="true" caption="左：9 つのキャリブレーション注視方向でシミュレーションしたアイカメラ画像。瞳孔中心（紫）、グリント（オレンジの×）、瞳孔-グリントベクトル（灰色）。薄い印はヘッドセットが 1 mm 下にずれた後の同じ注視方向で、瞳孔もグリントも約 17 px 上に動きますが、その差の変化ははるかに小さいことがわかります。右：較正した ±15° の範囲での平均視線誤差を、ずれの量に対して瞳孔のみと PCCR で比べたもの。" %}

中心窩レンダリングでは再び遅延が問題になります。サッカード（注視点のあいだの眼の速い跳躍）は毎秒数百度に達し、眼が着地する前に高解像度領域を動かさなければなりません。ホームページの [Interactive Lab]({{ '/' | relative_url }}#lab) には中心窩レンダリングのデモがあり、偏心度に応じて解像度をどこまで下げられるかを見ることができます。

## 8. シーン理解

コンテンツを適切に置く、仮想のボールを床で弾ませる、仮想物体を現実のソファの後ろに隠す。そのためにはヘッドセット自身の姿勢だけでなく、部屋のモデルが必要です。よく使われる 3 つのレベルがあります。

**平面。** 床、壁、机、天井は屋内シーンの大部分を占め、平面は推定するのも使うのも安価です。トラッカーは重力方向を与えるので、平面を水平面（法線が重力に平行：床、机、天井）と鉛直面（壁）に分けられ、探索も容易になります。主力は、デプスや三角測量した特徴から得た 3D 点に対する逐次 RANSAC です。最良の平面を見つけ、そのインライアを取り除き、繰り返します。

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

床（$\mathbf n = (0, 0, 1)$、インライア 3016 点）、2 枚の壁（$(1, 0, 0)$ と $(0, 1, 0)$、1996 点と 1473 点）、机の天板（$\mathbf n = (0.001, 0.001, 1)$、$d = 0.752$ m、605 点）が大きい順に見つかり、それぞれ RMS 残差はシミュレーションしたセンサーノイズに等しい 5.0〜5.1 mm です。510 点（雑多な物）が残ります。机は真値 0.75 m に対して 0.752 m に見つかります。実際のシステムでは、各平面をインライアの凸包やアルファシェイプで境界付けし、ユーザーが見回すにつれて時間方向に平面を統合し、地図が精緻化されるのに合わせて追跡します。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-planes.svg" caption="逐次 RANSAC 後の合成した部屋の隅の点群（ノイズ 5 mm）：床（緑）、壁 $x=0$（赤）、壁 $y=0$（青）、0.752 m の机の天板（オレンジ）。法線はいずれも部屋の内側に向けています。灰色の点は説明されない雑多な物です。" %}

**メッシュ。** デプスセンサーや密なステレオを持つヘッドセットは、第 7〜9 回のようにデプスを TSDF に融合し、マーチングキューブで三角形メッシュを取り出せます。解像度は数センチです。メッシュは物理（衝突）、現実物体による仮想物体の遮蔽、ナビゲーションに使われます。その解像度が遮蔽の境界を制限します。5 cm のボクセルでは手の輪郭に沿って仮想物体をきれいに切り抜けないので、手による遮蔽にはふつうハンドトラッカーのモデルを使います。

**セマンティクス。** 床、壁、ドア、机、ソファ、スクリーンといったラベルは、幾何をアプリケーションが推論できるものに変えます（「チェス盤を机の上に置く」「ドアの前には決してコンテンツを置かない」）。画像上で物体検出を行いメッシュに投影するのが 1 つの方法です。SceneScript（Avetisyan ら 2024）は示唆に富む別案で、一人称視点の動画から部屋のレイアウトと物体の構造化された記述をコマンド列（壁、ドア、窓、箱）として予測し、大規模な合成データセットで学習します。アプリケーションにとっては、このようにコンパクトで編集可能な表現のほうが密なメッシュより役立つことがあります。表現どうしのトレードオフ一般は[第 8 回]({{ '/blog/2026/3d-vision-08-3d-representations/' | relative_url }})で議論しました。

## 9. 空間アンカーと再ローカライズ

### 9.1 アンカーがある理由

各仮想物体をワールド座標 $\mathbf X\_W$ で保存するのは簡単です。問題は、トラッキングシステムのワールド座標系が固定されていないことです。ループ閉じ込みやバンドル調整で地図が補正されると、姿勢と点は蓄積したドリフトの分まで動きますが、ワールド座標で保存した物体は古い座標にとどまり、いまや間違った場所にあります。**空間アンカー**は、コンテンツの近くで地図に、ふつうは近くのキーフレームに取り付けた姿勢 $T\_{WA}$ です。コンテンツはアンカーに対する座標 $\mathbf X\_A$ で保存され、$T\_{WA}\mathbf X\_A$ に描画されます。地図が補正されるとアンカーはそのキーフレームとともに動き、コンテンツもいっしょに動きます。

残る誤差は**レバーアーム**です。アンカーの回転誤差 $\delta\theta$ は、アンカーから距離 $r$ にあるコンテンツを $\delta\theta\, r$ だけ動かすので、3 m 先で 0.5° なら 26 mm です。したがってアンカーは載せるコンテンツの近くに置くべきで、大きなシーンでは多数のアンカーを使うべきです。ARKit、ARCore、OpenXR のランタイム（たとえば `XR_MSFT_spatial_anchor` のようなベンダー拡張）が提供するアンカーは、まさにこの意味のアンカーです。

次のコードは 12 m × 6 m の長方形を、1 m あたり 0.3° の VIO 的な方位ドリフト付きで歩き、経路の 1 m 左に仮想物体を 9 か所置き、各物体を 2 通りに保存します。ワールド座標と、最寄りのアンカー（2 m ごとに 1 つのキーフレーム）に対する座標です。その後ループ閉じ込みとポーズグラフ最適化（第 6 回）がキーフレームの姿勢を補正します。ここでは寛大に、それが厳密になると仮定します。

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

ドリフトした地図はループを 1.19 m ずれて閉じます。ワールド座標で保存した物体は、本来の位置から 0.8 cm（1.25 m 歩いた後に配置）から 104.6 cm（29.25 m 歩いた後）までずれ、配置前に蓄積したドリフトとともに大きくなります。アンカー基準で保存した物体はどれも 0.42 cm のずれです。アンカーのキーフレームと配置位置のあいだの 0.75 m で蓄積したドリフトが、約 1.4 m のレバーアームに作用した分だけが残ります。

{% include blog_figure.liquid path="assets/img/blog/3d-vision/10-anchors.svg" localized="true" caption="アンカー実験の上面図。真のループ（黒）と、ループ閉じ込み前のドリフトした地図（オレンジの破線）。後者は出発点から 1.19 m ずれて終わります。星：9 つの物体の本来の位置。赤い×と矢印：ワールド座標で保存した物体の、地図補正後の位置で、最大 104.6 cm ずれます。緑の円：同じ物体を最寄りのアンカー（緑の四角、2 m ごと）基準で保存した結果で、いずれも 0.42 cm のずれで星に重なっています。" %}

### 9.2 再ローカライズと共有アンカー

保存したアンカーを新しいセッションや別のデバイスで見つけ直すには、ヘッドセットは**再ローカライズ**、つまり現在の画像から保存した地図の中での自分の姿勢を推定しなければなりません。標準的なパイプラインは階層的です（Sarlin ら 2019）。大域的な画像記述子（第 6 回の Bag of Visual Words や、NetVLAD のような学習型記述子）で地図の中の最も似たキーフレームを検索し、クエリ画像とそれらのキーフレームの局所特徴をマッチングして（第 3 回）地図点との 2D-3D 対応を得て、RANSAC 付きの PnP（第 5 回）で $T\_{CW}$ を解きます。現在のセッションの座標系 $W\_2$ と保存した地図の座標系 $W\_1$ が結び付けば、$T\_{W\_1A}$ として保存したアンカーは新しいセッションで

$$
T_{W_2A} = T_{W_2W_1}\,T_{W_1A}, \qquad T_{W_2W_1} = T_{W_2C}\,T_{CW_1}
$$

に現れます。$T\_{W\_2C}$ は現在のトラッキング姿勢、$T\_{CW\_1}$ は再ローカライズで得た姿勢で、どちらも同じ画像に対するものです。デバイス間でアンカーを共有するのも同じ仕組みです。各デバイスが共通の地図（「クラウドアンカー」ではサーバー上）で再ローカライズし、自分の変換を合成します。再ローカライズはセッション間の照明や家具の変化に耐えなければならず、そのためここでは学習型の特徴とマッチャー（第 3 回）が手作りの特徴にほぼ取って代わりました。

## 10. まとめて動かす

下のウィジェットは、第 2〜4 節の連鎖全体を 1 次元で動かします。頭が現実の箱の前で回転（ヨー）し、左右に揺れます。描画器は自分が知っている姿勢からその上に仮想の箱を描きます。遅延、予測器、後段リプロジェクション、位置のドリフト、物体の距離、ディスプレイの解像度を変えて、レジストレーション誤差を分角、表示画素、ミリメートルで観察してください。拡大パネルは箱の端と表示画素の格子を示します。

{% include widget.liquid name="3d-vision-motion-to-photon" height="640" caption="モーション・トゥ・フォトンの実験。描画器は $\Delta$ ms 前の頭部姿勢を使い、予測なし、等速度、等加速度で外挿します（ジャイロノイズ 0.2°/s、角加速度は 10 ms 離れたサンプルから）。後段リプロジェクションは光子の 5 ms 前に回転を取り直し、並進は $\Delta$ のままです。位置推定には、ゆっくりさまようドリフト（地図補正が 5 s の時定数で引き戻します）と姿勢のジッタが乗ります。オレンジ：誤差の回転成分、シアン：並進成分、黒：合計。試してみること：25 ms で予測を切る。後段リプロジェクションを有効にして物体を 0.3 m、次に 5 m に動かす。近くの物体でドリフトを大きくする。ディスプレイ解像度を上げて、同じ誤差がより多くの画素になるのを見る。ドラッグモードでは、ビューを左右にドラッグして自分で頭を回せます。" %}

この記事をまとめる工学的な指針をいくつか挙げます。

1. **眼の位置で、角度と時間で測る。** コンテンツが置かれる距離について、すべての誤差を眼での分角と表示画素に換算します。
2. **遅延は最大の生の誤差であり、予測と後段リプロジェクションは最大の対策である。** 予測時間を短くし（後段リプロジェクション）、予測器を低次に保ち、すべての姿勢のタイムスタンプを一貫させます。第 2 回のカメラ-IMU 時刻オフセットとディスプレイのタイミングは較正しなければなりません。
3. **近くのコンテンツは並進の問題である。** 腕の届く範囲では、眼と頭の位置の誤差が支配的です。光学シースルーでは眼の位置、パススルーではデプス、両方で位置トラッキングです。
4. **コンテンツは局所的にアンカーする。** コンテンツはワールド原点ではなく近くのアンカーに取り付け、再ローカライズを頑健にします。
5. **入力は適応的にフィルタする。** 手や眼の信号には、固定のローパスではなく速度に適応するフィルタが必要です。

## 試してみよう

- 上のウィジェット：$\Delta = 25$ ms と等速度予測から始め、「なし」に切り替えて生の遅延誤差を見てください。後段リプロジェクションを有効にして、近くと遠くの物体を比べてください。
- ホームページの [Interactive Lab]({{ '/' | relative_url }}#lab)：中心窩レンダリングのデモは、アイトラッカーが可能にする偏心度依存の解像度を示します。Gaussian World のデモは 3D ガウシアンのシーンを描画し、[ニューラルレンダリング第 6 回]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})の手順に従えばヘッドセットでも見られます。
- パススルー付きのヘッドセットを持っていれば、顔の 20 cm 前に手をかざし、遠くの背景に対する手の輪郭を見ながら横に動かしてください。次に腕を伸ばした位置で同じことをしてください。手が背景に「貼り付く」具合に違いがあれば、それが第 5 節の深さに依存する誤差です。

## 代表的な論文

| 論文 | 会議/論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| A survey of augmented reality (Azuma) | Presence | 1997 | [DOI](https://doi.org/10.1162/pres.1997.6.4.355) | AR を定義し、レジストレーションを中心問題と位置づけた |
| Registration error analysis for augmented reality (Holloway) | Presence | 1997 | [DOI](https://doi.org/10.1162/pres.1997.6.4.413) | 光学シースルーシステムのエンドツーエンドの誤差バジェット。遅延が支配的 |
| Single point active alignment method (SPAAM) for optical see-through HMD calibration for AR (Tuceryan, Navab) | ISAR | 2000 | — | ユーザー参加型のディスプレイ較正の古典 |
| General theory of remote gaze estimation using the pupil center and corneal reflections (Guestrin, Eizenman) | IEEE TBME | 2006 | [DOI](https://doi.org/10.1109/TBME.2005.863952) | PCCR アイトラッキングの背後にある 3D モデル |
| A multi-state constraint Kalman filter for vision-aided inertial navigation (Mourikis, Roumeliotis) | ICRA | 2007 | [DOI](https://doi.org/10.1109/ROBOT.2007.364024) | モバイル機器の VIO で広く使われるフィルタ設計 MSCKF |
| 1€ filter: a simple speed-based low-pass filter for noisy input in interactive systems (Casiez, Roussel, Vogel) | CHI | 2012 | [DOI](https://doi.org/10.1145/2207676.2208639) | 手やポインタの入力に使われる適応フィルタ |
| Head tracking for the Oculus Rift (LaValle, Yershova, Katsev, Antonov) | ICRA | 2014 | [DOI](https://doi.org/10.1109/ICRA.2014.6906608) | 民生用ヘッドセットの姿勢トラッキング、ドリフト補正、予測 |
| The asynchronous time warp for virtual reality on consumer hardware (van Waveren) | VRST | 2016 | [DOI](https://doi.org/10.1145/2993369.2993375) | アプリケーションのフレームレートから切り離した後段リプロジェクション |
| Towards foveated rendering for gaze-tracked virtual reality (Patney et al.) | SIGGRAPH Asia (ACM TOG) | 2016 | [DOI](https://doi.org/10.1145/2980179.2980246) | アイトラッキングで周辺の描画をどこまで粗くできるか |
| On-manifold preintegration for real-time visual-inertial odometry (Forster, Carlone, Dellaert, Scaramuzza) | IEEE T-RO | 2017 | [arXiv](https://arxiv.org/abs/1512.02363) | 最適化ベースの VIO のための IMU 事前積分 |
| A survey of calibration methods for optical see-through head-mounted displays (Grubert, Itoh, Moser, Swan) | IEEE TVCG | 2018 | [arXiv](https://arxiv.org/abs/1709.04299) | ディスプレイと眼の位置の較正手法のサーベイ |
| From coarse to fine: robust hierarchical localization at large scale (Sarlin, Cadena, Siegwart, Dymczyk) | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1812.03506) | 検索 + 局所マッチング + PnP の再ローカライズパイプライン |
| MEgATrack: monochrome egocentric articulated hand-tracking for virtual reality (Han et al.) | SIGGRAPH (ACM TOG) | 2020 | [DOI](https://doi.org/10.1145/3386569.3392452) | ヘッドセットのモノクロトラッキングカメラによるハンドトラッキング |
| Passthrough+: real-time stereoscopic view synthesis for mobile mixed reality (Chaurasia et al.) | I3D (PACMCGIT) | 2020 | [DOI](https://doi.org/10.1145/3384540) | モバイルヘッドセットでのデプスに基づくパススルー再投影 |
| Towards indistinguishable augmented reality: a survey on optical see-through head-mounted displays (Itoh, Langlotz, Sutton, Plopski) | ACM Computing Surveys | 2021 | [DOI](https://doi.org/10.1145/3453157) | 光学シースルーディスプレイの空間的・時間的・視覚的リアリズム |
| NeuralPassthrough: learned real-time view synthesis for VR (Xiao et al.) | SIGGRAPH | 2022 | [arXiv](https://arxiv.org/abs/2207.02186) | 学習型のパススルー新視点合成 |
| UmeTrack: unified multi-view end-to-end hand tracking for VR (Han et al.) | SIGGRAPH Asia | 2022 | [arXiv](https://arxiv.org/abs/2211.00099) | 複数ビュー・複数フレームからワールド座標の手の姿勢をエンドツーエンドで出力 |
| Project Aria: a new tool for egocentric multi-modal AI research (Engel et al.) | arXiv プレプリント | 2023 | [arXiv](https://arxiv.org/abs/2308.13561) | SLAM、アイトラッキング、公開データセットを備えた研究用メガネ型プラットフォーム |
| SceneScript: reconstructing scenes with an autoregressive structured language model (Avetisyan et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2403.13064) | 部屋のレイアウトと物体を構造化コマンド列として表現 |

## 学習リソース

- S. M. LaValle, *Virtual Reality*, Cambridge University Press, 2023。[著者のサイト](https://lavalle.pl/vr/)に無料のオンライン版があります。トラッキング、視覚的レンダリング、遅延、知覚の章があります。
- 上記の Azuma のサーベイと、[OpenXR 1.1 仕様](https://registry.khronos.org/OpenXR/specs/1.1-khr/html/xrspec.html)（フレームタイミング、空間、アンカー）。システム全体の見通しを得るのに役立ちます。
- このシリーズ第 6 回の VIO と、そこで取り上げたオープンソースの VIO（OpenVINS、VINS-Fusion、慣性モードの ORB-SLAM3）。記録データでインサイドアウトトラッキングを試せます。
- [Project Aria](https://www.projectaria.com/) のデータセットとツール。較正済みのカメラ、IMU、視線、SLAM 軌跡付きの一人称視点の記録が得られます。
- [1€ フィルタのページ](https://cristal.univ-lille.fr/~casiez/1euro)。多くの言語での実装があります。

## 演習

1. あるヘッドセットはキャリブレーション後に 0.02°/s のジャイロバイアスが残っており、暗い部屋でカメラトラッキングを失いました。ジャイロバイアスの項だけを数えると、IMU だけで位置誤差が 1 cm を超えるまで何秒もちますか。姿勢だけが 1° ドリフトするまでは何秒ですか。

   <details markdown="1"><summary>ヒント</summary>

   $b\_g = 3.49\times10^{-4}$ rad/s として $\tfrac16 g\,b\_g t^3 = 0.01$ m を解くと $t = (0.06/(9.81 \cdot 3.49\times10^{-4}))^{1/3} \approx 2.6$ s です。姿勢は $b\_g t$ でドリフトするので、1° には 50 s かかります。回転だけのトラッキングは位置のトラッキングよりずっと長くもちます。カメラトラッキングを失ったヘッドセットが 3DoF に切り替わるのはこのためです。
   </details>

2. 等速度予測器の打ち切り誤差の主要項 $\tfrac12\alpha\Delta^2$ を導き、3.3 節の表と照らし合わせてください。躍度最小の振り向きのどの時刻で最大になり、$\Delta = 20$ ms ではいくらを予測しますか。

   <details markdown="1"><summary>ヒント</summary>

   線形項のあとのテイラー剰余は $\tfrac12\alpha(\xi)\Delta^2$ です。躍度最小の角加速度 $A/T^2(60s - 180s^2 + 120s^3)$ は $s = (3 \mp \sqrt3)/6$、つまり 127 ms と 473 ms で極値 $962$°/s² をとります。$\tfrac12 \cdot 962 \cdot 0.02^2 = 0.192° = 11.5'$ で、表の値と一致します。
   </details>

3. あるパススルーヘッドセットのカメラは眼の 6 cm 前にあり、2 台の間隔は両眼より 1 cm 広く、1.5 m の平面を仮定して再投影します。1 次の公式で、正面 0.4 m の手と、横 20° で距離 0.4 m の点の誤差を計算してください。それぞれどのオフセット成分が効いていますか。

   <details markdown="1"><summary>ヒント</summary>

   正面では、片眼あたり 5 mm の横方向のオフセットだけが視線に垂直です：$0.005\,\lvert1/0.4 - 1/1.5\rvert = 9.2$ mrad $\approx 31.5'$（`passthrough_error` で `c = (0.005, 0, 0.06)` とすると $37.1'$）。横 20° では垂直成分が $0.005\cos20° \mp 0.06\sin20°$、つまりカメラ側で 15.8 mm、反対側で 25.2 mm となり、前方のオフセットが支配的になります。1 次の誤差は 1.7° と 2.6°、厳密な値は 2.0° と 3.2° です。
   </details>

4. 三角測量のコードを 4 台のカメラに拡張し（$x = \pm0.1$ m に外向きに 30° 傾けたカメラを 2 台追加）、0.5 m の指先の $\sigma\_z$ を計算してください。追加したビューの組はそれぞれどれだけ役立ちますか。同じ場所にカメラを増やすより、視線方向が広く分散しているほうが役立つのはなぜですか。

   <details markdown="1"><summary>ヒント</summary>

   $y$ 軸まわりの回転 $R$ で $P = K[R \mid -R\mathbf C]$ を作ります。`triangulate` はもともと任意の数のビューを受け付けます。深さの精度は光線どうしの角度（第 4 回の三角測量角）で決まるので、既存の光線をほぼ繰り返すビューより、離れた場所からのビューのほうが多く貢献します。
   </details>

5. アンカー実験で、アンカーの間隔を広げ（2 m ごとではなく 6 m ごと）、コンテンツを経路から 1 m ではなく 3 m 離して置いてください。コードを実行する前に、レバーアームの議論からアンカー基準の誤差を予想してください。

   <details markdown="1"><summary>ヒント</summary>

   アンカーのキーフレームと配置位置のあいだの方位ドリフトは、約 $0.3°/\text{m}$ にその間に歩いた距離（今度は最大 3 m）を掛けたもので、それがアンカーからコンテンツまでの距離程度のレバーアームに作用します。0.42 cm ではなく数センチの誤差が予想されます。コードの変更は `anchors = np.arange(0, n, 120)` と `offset = np.array([0.0, 3.0, 1.0])` です。
   </details>

## この先へ

これで **3D ビジョンの基礎**は最終回です。10 回をかけて、ピンホールカメラから、キャリブレーション、特徴、2 視点と多視点の幾何、SLAM、デプス、表現、再構成を経て、ここで、それらすべてをリアルタイムに人の眼の前に置くシステムまでたどりました。ここから続く 3 つのシリーズがあります。

- **ニューラルレンダリング**は、姿勢付きの画像からもう一度出発し、今度は放射輝度場と 3D ガウシアンを学習します。[カメラと多視点幾何]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})から始め（いまなら復習として読めます）、[シーンを撮影して VR で見る]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})で締めくくります。
- **世界モデル**は、3D の世界がどう変化するかを、画素、潜在空間、あるいは明示的な 3D でどう予測するかを問います。[世界モデルとは何か]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})から始めてください。
- **身体性 AI**は、このシリーズの知覚をロボットの制御ループに組み込みます。[ロボティクスの基礎]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})から始め、ヘッドセット、ハンドトラッキング、一人称視点データがロボット学習にどう生かされるかは[身体性 AI と XR・HCI の出会い]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})を参照してください。
