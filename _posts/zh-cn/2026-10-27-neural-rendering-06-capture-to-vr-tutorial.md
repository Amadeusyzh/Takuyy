---
layout: post
title: "从手机拍摄到 VR：3D 高斯泼溅动手实践教程"
date: 2026-10-27 12:06:00+0900
description: "一套实用的分步工作流：拍摄照片或视频，运行 COLMAP，用官方代码、gsplat 或 nerfstudio splatfacto 训练 3DGS，清理并导出 .ply，再在网页和 VR 头显中查看，并附常见失败模式及其解决方法。"
categories: neural-rendering
tags: [3d-gaussian-splatting, tutorial, colmap, gsplat, nerfstudio, webxr, vr]
series: neural-rendering
series_order: 6
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

在你亲手采集并探索过一个属于自己的场景之前，前面五篇的理论价值有限。本教程在一块消费级 GPU 上走完整条流水线（pipeline）：**采集 → 位姿（COLMAP）→ 训练（3DGS）→ 清理与导出 → 在浏览器和 VR 中查看。** 每一步都与理论相对应：[第 1 篇]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})中的相机模型和 SfM，[第 4 篇]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})中的优化，以及[第 5 篇]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})中的抗锯齿和 VR 相关问题。当出现问题时（而问题总会出现），文末的失败模式表会告诉你应该回头复习哪些思想。

下图就是本教程的地图：六个阶段、每个阶段使用的工具，以及每个阶段交给下一阶段的文件。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/06-pipeline.svg" localized="true" caption="整个工作流程一览。每个方框对应本文的一节（§1 到 §6）；彩色等宽字体那一行是该阶段产出的文件，也正是下一阶段读取的输入。" %}

工具变化得很快。下面的命令已对照 COLMAP、官方 3DGS 仓库、gsplat 和 nerfstudio 的当前源码检查过；如果你所用版本中某个参数已被重命名，请以 `--help` 为准。

## 前置条件

- 一块支持 CUDA 的 NVIDIA GPU（在降低分辨率的情况下，8 GB 显存足以处理小场景；处理全分辨率的室外场景时 24 GB 比较宽裕），Linux 或 Windows 系统。
- Python 3.10+，并装有 PyTorch 和 CUDA，`conda` 或 `venv`，`ffmpeg`，以及 COLMAP（预编译二进制或 CUDA 版本）。
- 一部手机或相机。可选：一台支持 WebXR 的头显（例如带有基于 Chromium 的浏览器的一体机头显）。

## 1. 采集

采集质量对结果的影响比任何超参数都大。3DGS 需要**大量清晰、相互重叠、曝光一致的视图**，并且你想渲染的每个表面都要从多个方向被看到。

**应该做：**

- **锁定曝光、白平衡和对焦**（使用“AE/AF 锁定”或手动/专业相机模式）。对优化器来说，帧与帧之间曝光的变化看起来就像材质发生了变化。
- **移动相机，而不只是旋转它。** SfM 和泼溅都需要视差（parallax）：绕着物体走一圈，或在房间中穿行。在一个点上原地旋转得不到任何深度信息。
- **重叠要充分：** 每张新照片应与上一张共享大约 60–80% 的内容。
- 对于物体：在不同高度上做两到三次**环绕拍摄**（orbit）（例如平视、从上方、从低处），并让物体占据画面的相当一部分。对于房间：沿着墙面朝内走一圈，然后再朝外走第二圈。
- **光照要均匀。** 阴天的日光或漫射的室内照明最为理想；硬阴影和高光会被“烘焙”进模型。
- 典型规模：一个物体或一个小房间需要 **100–300 张照片**；更大的场景需要几百张。

下面两张图用一个“桌上的球”的玩具采集，把前几条规则具体化。在第一张图中，如果一个表面点被两张拍摄方向相差至少 5° 的照片看到，就可以被三角化（第 1 篇），我们称它被覆盖。三圈环绕覆盖了全部可见表面；原地旋转什么也覆盖不了，因为所有光线都从同一点出发；单条直线只覆盖它正对的那一面。第二张图对同一个玩具场景（房间里的一个球，假设水平视场角为 60°）做光线投射，测量每张照片有多少内容会在下一张中再次出现。当环绕半径 r = 2 时，60–80% 的规则对应约 11°–22° 的步长，即每圈约 16–33 张照片；两三圈再加上难免要删掉的废片，就落在上面所说的 100–300 张范围内。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/06-capture-paths.svg" localized="true" caption="球的玩具采集（z 轴朝上）：左，在低、平视、高三个位置各环绕一圈、每圈 40 张；中，在一个点上原地摇摄 40 张；右，沿一条直线拍 40 张。紫色点可以三角化（被两张光线方向相差至少 5° 的照片看到），灰色点不行；百分比是被覆盖的比例。" %}

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/06-overlap.svg" localized="true" caption="环绕拍摄时相邻照片之间的重叠比例，通过对一个玩具房间做光线投射计算得到（视场角 60°），共三种环绕半径（r = 2 约为物体半径的三倍）。阴影带是推荐的 60–80%；底部的横条标出落在该区间内的步长角，顶部坐标轴把步长换算成每圈的照片数。" %}

**避免：** 运动模糊（使用充足的光线和较快的快门，或者用拍照代替录像）、移动的人和物体、镜子、玻璃和非常光亮的表面、大面积无纹理的墙壁，以及数码变焦。超广角和鱼眼镜头也可以用，但需要在 COLMAP 中选择正确的相机模型并进行去畸变（undistortion）。

**用视频代替照片。** 视频很方便，但每一帧都有更多的运动模糊和压缩损失。请以可用的最高分辨率和帧率录制，缓慢移动，并每秒抽取 2–3 帧：

```bash
mkdir -p scene/input
ffmpeg -i capture.mp4 -qscale:v 1 -qmin 1 -vf "fps=2" scene/input/%04d.jpg
```

然后删除明显模糊的帧。一种快速给它们排序的方法是拉普拉斯算子的方差（variance of the Laplacian，一种清晰度评分）：

```python
import sys, glob
import cv2

paths = sorted(glob.glob(sys.argv[1] + "/*.jpg"))
scores = []
for p in paths:
    g = cv2.imread(p, cv2.IMREAD_GRAYSCALE)
    scores.append((cv2.Laplacian(g, cv2.CV_64F).var(), p))
scores.sort()
print("blurriest 10% (consider deleting):")
for s, p in scores[: max(1, len(scores) // 10)]:
    print(f"{s:8.1f}  {p}")
```

下图展示了这个脚本在一段合成视频上的结果：一个带纹理的场景，60 帧（以每秒 2 帧抽取的 30 秒），相机随机抖动。评分使用与 `cv2.Laplacian` 默认孔径相同的 3×3 拉普拉斯核。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/06-blur-score.svg" caption="60 帧合成视频的清晰度评分 Var(∇²I)。红色柱是脚本打印出的最模糊的 10%，它们恰好就是模拟运动模糊最强的那 6 帧。上方：最清晰、中位数和最模糊的帧（局部裁剪）及其评分。" %}

## 2. 用 COLMAP 估计相机位姿

现在我们运行第 1 篇中的增量式 SfM。官方 3DGS 仓库要求如下目录结构：

```text
scene/
  input/          your photos (distorted, any camera model)
  images/         undistorted images            <- created below
  sparse/0/       cameras.bin images.bin points3D.bin (PINHOLE)  <- created below
```

### 2.1 各个步骤

```bash
cd scene
mkdir -p distorted/sparse

# 1. SIFT features; one shared camera for all images, OPENCV model (k1, k2, p1, p2)
colmap feature_extractor \
    --database_path distorted/database.db \
    --image_path input \
    --ImageReader.single_camera 1 \
    --ImageReader.camera_model OPENCV \
    --FeatureExtraction.use_gpu 1

# 2. Matching: exhaustive for < ~500 images; use sequential_matcher for video frames
colmap exhaustive_matcher \
    --database_path distorted/database.db \
    --FeatureMatching.use_gpu 1

# 3. Incremental SfM (registration, triangulation, bundle adjustment)
colmap mapper \
    --database_path distorted/database.db \
    --image_path input \
    --output_path distorted/sparse

# 4. Undistort to an ideal PINHOLE camera, as required by the 3DGS rasterizer
colmap image_undistorter \
    --image_path input \
    --input_path distorted/sparse/0 \
    --output_path . \
    --output_type COLMAP

# the undistorter writes sparse/*.bin; the 3DGS loader expects sparse/0/
mkdir -p sparse/0 && mv sparse/*.bin sparse/0/
```

说明：

- **近期的 COLMAP 版本更改了选项名称。** 当前的 COLMAP 使用 `--FeatureExtraction.use_gpu` 和 `--FeatureMatching.use_gpu`；较旧的版本（以及官方 3DGS 的 `convert.py`，它仍然传入 `--SiftExtraction.use_gpu` / `--SiftMatching.use_gpu`）使用旧名称。如果 `convert.py` 在第一步就因为未知选项而报错，原因就在这里：手动运行上面的命令，或者修改 `convert.py` 中的这两个选项名。
- 当所有图像都来自同一台固定变焦的相机时，`single_camera 1` 是正确的；如果混用了多台相机，就去掉它。
- 在只有 CPU 的机器上，把 `use_gpu` 选项设为 0。这样也能运行，只是更慢。
- 对于大规模采集，**全局 SfM**（global SfM）是一种更快的替代方案。COLMAP 现在自带 `global_mapper` 命令（即第 1 篇中 GLOMAP 的方法）；COLMAP 文档建议先在数据库的副本上运行 `view_graph_calibrator`。独立的 [GLOMAP](https://github.com/colmap/glomap) 读取的也是同一个数据库。

如果你更喜欢一行命令搞定，官方仓库的脚本会替你完成第 1–4 步（先把照片放进 `scene/input`）：

```bash
python convert.py -s scene            # add --resize to also create 1/2, 1/4, 1/8 images
```

### 2.2 训练前检查重建结果

在这里花五分钟，可以省下之后的好几个小时：

```bash
colmap model_analyzer --path sparse/0
colmap gui --import_path sparse/0 --database_path distorted/database.db --image_path images
```

需要检查的是：**几乎所有图像都已注册**（如果 COLMAP 把场景拆成了多个模型，就会出现 `distorted/sparse/1`、`2`……，说明采集在某处缺乏重叠）、**平均重投影误差（reprojection error）低于约 1 px**，以及点云和相机轨迹看起来与你的场景相符。如果有相机缺失，应补拍能衔接空缺的照片，而不是去调参数。

接下来的两张图用玩具数据展示健康的结果和最常见的失败是什么样子。第一张是一个小型合成重建：两圈共 42 台相机，特征点位置加上 0.5 px 的噪声，所有被至少 3 张图像看到的点都用线性方法三角化（第 1 篇）。它的平均重投影误差是 0.61 px，低于 1 px 的经验标准。第二张说明 COLMAP 为什么会把一次采集拆成多个模型：如果没有照片衔接空缺，空缺两侧的图像就没有共同内容，共视图（co-visibility graph）分裂成两个连通分量，增量式 SfM 只能得到 `sparse/0` 和 `sparse/1`。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/06-colmap-sparse.svg" localized="true" caption="一个玩具稀疏模型：围绕底座上的球的两圈相机视锥（红色），以及按观测图像数着色的三角化点。右：所有观测的重投影误差直方图，黑线为均值，红色虚线为 1 px 阈值。" %}

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/06-registration-gap.svg" caption="沿着一面墙行走（俯视图，墙位于 y = 0），在距墙 2 m 处每 0.25 m 拍一张，视场角 60°。上：约 3 m 没有拍照，比单张照片 2.3 m 的覆盖宽度还宽，于是图像分成两组（sparse/0 和 sparse/1）。下：补上衔接照片后只有一个模型。右：图像 i 和 j 之间共享墙面点的比例；两个分离的方块意味着两个模型。" %}

## 3. 训练

从三种实现中任选其一。它们生成的 `.ply` 文件是相互兼容的。

### 3.1 官方 INRIA 代码

```bash
git clone https://github.com/graphdeco-inria/gaussian-splatting --recursive
cd gaussian-splatting
conda env create --file environment.yml
conda activate gaussian_splatting

python train.py -s ../scene -m output/scene            # 30k iterations by default
python train.py -s ../scene -m output/scene_eval --eval # hold out every 8th image for testing
python render.py -m output/scene_eval                   # render train/test views
python metrics.py -m output/scene_eval                  # PSNR, SSIM, LPIPS
```

`train.py` 的常用选项（均来自 `arguments/__init__.py`）：

| 选项 | 作用 |
| --- | --- |
| `-r 2` / `-r 4` | 以 1/2 或 1/4 分辨率训练（宽度超过 1.6K 像素的图像会被自动缩小） |
| `--data_device cpu` | 显存不足时把图像保存在 CPU 内存中 |
| `--iterations 7000` | 快速预览；默认设置会在 7k 和 30k 次迭代时保存 |
| `--densify_grad_threshold 0.0002` | 即第 4 篇中的 $\tau_{\text{pos}}$；调高它可以得到更少的高斯 |
| `--antialiasing` | 使用 Mip-Splatting 的 2D Mip 滤波器（第 5 篇）代替普通的膨胀 |
| `--train_test_exp` | 针对存在曝光变化的采集进行逐图像曝光补偿 |
| `--white_background` | 用于白色背景的合成场景 |

训练好的模型位于 `output/scene/point_cloud/iteration_30000/point_cloud.ply`。该仓库还包含 SIBR 实时查看器（`SIBR_gaussianViewer_app -m output/scene`）以及一个可以实时观察训练过程的网络查看器。

### 3.2 gsplat

[gsplat](https://github.com/nerfstudio-project/gsplat) 速度更快、内存占用更少，并把第 5 篇中的各种变体作为选项提供。

```bash
pip install gsplat
git clone https://github.com/nerfstudio-project/gsplat && cd gsplat/examples
pip install -r requirements.txt --no-build-isolation

# the classic recipe (DefaultStrategy: clone / split / prune)
python simple_trainer.py default --data_dir ../../scene --data_factor 1 \
    --result_dir results/scene --save_ply

# 3DGS-MCMC densification with a fixed Gaussian budget, and anti-aliased rasterization
python simple_trainer.py mcmc --data_dir ../../scene --data_factor 1 \
    --result_dir results/scene_mcmc --antialiased --save_ply
```

`--data_factor 4` 读取缩小为 1/4 的图像（它需要一个 `images_4/` 文件夹，可由 `convert.py --resize` 生成）。`.ply` 文件会保存到 `results/<name>/ply/point_cloud_<step>.ply`，训练期间还会运行一个浏览器查看器（Viser）。

### 3.3 nerfstudio splatfacto

[nerfstudio](https://docs.nerf.studio/) 把 COLMAP 和训练封装成两条命令，并且拥有最友好的查看器：

```bash
pip install nerfstudio
ns-process-data images --data scene/input --output-dir scene_ns     # or: ns-process-data video --data capture.mp4 ...
ns-train splatfacto --data scene_ns                                  # 'splatfacto-big' for higher quality
ns-export gaussian-splat --load-config outputs/scene_ns/splatfacto/<timestamp>/config.yml \
    --output-dir exports/splat
```

Splatfacto 基于 gsplat 构建。注意，`ns-export gaussian-splat` 只适用于泼溅模型，不适用于 `nerfacto` 等 NeRF 方法。

### 3.4 预期结果

观察训练 PSNR 和高斯的数量。数量会快速增长，直到第 15k 次迭代时致密化（densification）停止，之后保持不变；对于一个房间或室外场景，一百万到几百万个高斯是常见的。7k 次迭代的预览通常就能告诉你这次采集是否可行。如果测试视图的 PSNR 远低于训练 PSNR，说明模型对数量太少或过于相似的视图过拟合了：请补拍更多视图。

## 4. 检查、清理和转换 `.ply`

3DGS 的 `.ply` 是一个带有额外逐顶点属性的点云：`x y z`、`nx ny nz`（未使用）、`f_dc_0..2`（0 阶 SH）、`f_rest_0..44`（高阶 SH）、`opacity`（logit）、`scale_0..2`（对数）、`rot_0..3`（四元数 $w, x, y, z$，未归一化）。下面的脚本会打印统计信息，并移除最常见的垃圾：几乎透明的高斯、少数巨大的团块以及远处的离群点。

以这种方式存储时，每个高斯都占用固定数量的 32 位浮点数，如下图所示；这就是压缩对网页和 VR 如此重要的原因。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/06-ply-layout.svg" localized="true" caption="3DGS .ply 中每个高斯的存储布局：62 个 float32 = 248 字节，所以一百万个高斯在压缩前约占 248 MB。右列是加载器对每个存储字段施加的激活（不透明度 logit 用 sigmoid，对数尺度用 exp，四元数做归一化，基础颜色为 0.5 + C0·f_dc）。" %}

```python
import sys
import numpy as np
from plyfile import PlyData, PlyElement

def load_3dgs_ply(path):
    v = PlyData.read(path)["vertex"].data
    xyz = np.stack([v["x"], v["y"], v["z"]], -1)
    opacity = 1.0 / (1.0 + np.exp(-v["opacity"]))                      # stored as logits
    scales = np.exp(np.stack([v[f"scale_{i}"] for i in range(3)], -1))   # stored as log-scales
    dc = np.stack([v[f"f_dc_{i}"] for i in range(3)], -1)
    rgb = np.clip(0.5 + 0.28209479177387814 * dc, 0, 1)                 # degree-0 SH -> base colour
    return v, xyz, opacity, scales, rgb

def clean(v, xyz, opacity, scales, min_opacity=0.02, max_scale_pct=99.5, keep_radius_pct=99.0):
    """Drop nearly transparent Gaussians, the largest 'blobs', and far-away outliers."""
    center = np.median(xyz, 0)
    dist = np.linalg.norm(xyz - center, axis=1)
    keep = (opacity > min_opacity)
    keep &= scales.max(1) < np.percentile(scales.max(1), max_scale_pct)
    keep &= dist < np.percentile(dist, keep_radius_pct)
    return v[keep], keep

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    v, xyz, opacity, scales, rgb = load_3dgs_ply(src)
    print(f"{len(xyz):,} Gaussians, SH rest coeffs: {sum(n.startswith('f_rest') for n in v.dtype.names)}")
    print("median opacity %.3f, median max-scale %.4f" % (np.median(opacity), np.median(scales.max(1))))
    print("bounding box:", xyz.min(0).round(2), xyz.max(0).round(2))
    kept, mask = clean(v, xyz, opacity, scales)
    print(f"kept {mask.sum():,} / {len(mask):,}")
    PlyData([PlyElement.describe(kept, "vertex")], text=False).write(dst)
```

```bash
pip install plyfile
python clean_ply.py output/scene/point_cloud/iteration_30000/point_cloud.ply scene_clean.ply
```

下图在一个合成点云上原样运行这个 `clean()`（使用默认阈值）：一个物体、相机附近一圈很淡的漂浮物、少数巨大的团块，以及散落在远处的高斯。注意，两个百分位数测试总会移除 0.5% 和 1% 的高斯，即使模型完美无缺；这也是下文说自动清理“粗糙”的原因之一。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/06-clean.svg" localized="true" caption="在 19,280 个高斯的玩具点云上运行 clean()（俯视图）。红色：因不透明度 ≤ 0.02 被移除（漂浮物环）；橙色：尺度位于最大的 0.5%；蓝色：到中位数中心的距离位于最远的 1%（大多在绘图窗口之外）。右：三个量及其阈值，计数为对数坐标。最终保留 18,375 个高斯。" %}

自动清理是一种粗糙的工具；这些百分位数只是起点。对于精确的编辑（裁剪到一个包围盒、手动删除漂浮物（floaters）、把场景旋转摆正），请使用 **SuperSplat**，它是 PlayCanvas 开源的浏览器编辑器，地址是 [superspl.at](https://superspl.at/)：把 `.ply` 拖到页面上，选中并删除高斯，然后导出 `.ply` 或某种压缩格式。压缩格式通常比原始 `.ply` 小好几倍，这对网页和 VR 很重要。

## 5. 在网页上查看

有好几个开源 WebGL 渲染器可以显示 3DGS 文件；我们使用 **Spark**，它是 World Labs 推出的一个 three.js 渲染器，可以读取 `.ply`、`.spz`、`.splat`、`.ksplat` 和 `.sog`，并能把泼溅与普通的 three.js 网格混合在一起。把下面的内容保存为 `index.html`，放在 `scene_clean.ply` 旁边：

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style> body { margin: 0; } </style>
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
        "@sparkjsdev/spark": "https://sparkjs.dev/releases/spark/2.4.0/spark.module.js"
      }
    }
  </script>
</head>
<body>
<script type="module">
  import * as THREE from "three";
  import { OrbitControls } from "three/addons/controls/OrbitControls.js";
  import { VRButton } from "three/addons/webxr/VRButton.js";
  import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 1000);
  camera.position.set(0, 1.6, 3);

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;                          // WebXR: stereo rendering in a headset
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  scene.add(new SparkRenderer({ renderer }));

  const splat = new SplatMesh({ url: "scene_clean.ply" });
  splat.quaternion.set(1, 0, 0, 0);                    // COLMAP is y-down: rotate 180 deg about x
  splat.position.set(0, 1.2, 0);                       // put the scene around eye height
  scene.add(splat);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, 0);
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
</script>
</body>
</html>
```

通过 HTTP 提供这个文件夹（浏览器会阻止从 `file://` 加载模块）：

```bash
python -m http.server 8000      # then open http://localhost:8000
```

旋转那一行很重要：COLMAP 和 3DGS 使用 $y$ 轴朝下的 OpenCV 约定（第 1 篇），而 three.js 使用 $y$ 轴朝上。按 three.js 的分量顺序，四元数 $(x, y, z, w) = (1, 0, 0, 0)$ 表示绕 $x$ 轴旋转 180°。如果场景仍然是倾斜的，那是因为 COLMAP 的世界坐标系是任意的（第 1 篇，规范自由度（gauge freedom））：在 SuperSplat 中把它摆正一次即可，或者用各相机“上”向量的平均值来估计向上方向。

下图把这个旋转应用到一个以类似 COLMAP 的坐标系表示的玩具场景上，其中重力沿 $+y$ 方向。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/06-y-down-to-y-up.svg" localized="true" caption="左：在 y 朝下坐标系中重建的小房子，用 three.js 的坐标轴（y 朝上，z 指向观察者）显示时是倒过来的，采集相机的图像向下轴 y_cam 指向上方。右：绕 x 轴旋转 180°（即矩阵 diag(1, −1, −1)）之后，地面（橙色）回到下方，y_cam 指向下方，与真实世界一致。" %}

其他值得了解的查看器：PlayCanvas 引擎和 SuperSplat 自带的发布功能（可以生成一个可分享的查看器页面）、用于 three.js 的 [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D)、最初的 WebGL 查看器 [antimatter15/splat](https://github.com/antimatter15/splat)，以及桌面端的官方 SIBR 查看器。

## 6. 在 VR 中查看

上面的页面已经支持 VR：`renderer.xr.enabled` 加上 `VRButton` 提供的 **Enter VR** 按钮会启动一个 WebXR 会话，three.js 则利用头显跟踪到的位姿为每只眼睛各渲染一次场景。要在一体机头显上使用它：

1. **通过 HTTPS 提供页面，或使用端口转发。** WebXR 需要安全上下文（secure context）。`localhost` 被视为安全的，所以最简单的办法是用 USB 连接头显并转发端口（例如，对于基于 Android 的头显，使用 `adb reverse tcp:8000 tcp:8000`），然后在头显浏览器中打开 `http://localhost:8000`。也可以把文件夹托管到任意 HTTPS 静态托管服务上（GitHub Pages 就可以）。
2. **注意尺度和原点。** SfM 的单位是任意的（第 1 篇）。如果房间看起来像个玩具屋或一座大教堂，就利用一段已知距离对 `SplatMesh` 做均匀缩放（`splat.scale.setScalar(k)`），并调整其位置，使得在 `local-floor` 参考空间下地面位于 $y = 0$。
3. **遵守预算。** 一体机头显要在移动 GPU 上以 72–90 Hz 渲染两个视图。Spark 的文档建议 WebXR 的预算大约为五十万到七十五万个泼溅点，而桌面端则是数百万个。可以通过带预算的训练（gsplat 的 `mcmc`，例如通过其 `--strategy.cap_max` 选项）、提高致密化阈值，或在 SuperSplat 中抽稀来减少数量，并优先使用压缩文件。
4. **减少跳变和走样。** 头部运动会暴露排序造成的跳变（popping）和走样（aliasing）。如果你会在与采集时不同的距离上观看场景，请使用 `--antialiasing`（官方代码）或 `--antialiased`（gsplat）进行训练。

尺度错误为什么如此明显，见下图。两只眼睛对应的相机相隔一个瞳距（interpupillary distance, IPD），成年人平均约 63 mm，大脑根据两条视线之间的夹角来判断深度。把场景缩放 $k$ 倍，等价于把你的瞳距缩放 $1/k$ 倍：一个小了四倍的场景，其视差是真实场景的四倍，看起来就像一个微缩模型（上面第 2 点）。

{% include blog_figure.liquid path="assets/img/blog/neural-rendering/06-vr-stereo.svg" localized="true" caption="左：俯视图，两只眼睛（L、R）相距 63 mm，注视深度为 z 的一点；两条视线的夹角就是视差 δ = 2 arctan(IPD / 2z)。右：δ 随真实深度的变化，分别对应尺度正确的泼溅模型、缩小为 0.25 倍的模型（玩偶屋：一切看起来又近又小）和放大 4 倍的模型（大教堂）。" %}

Spark 还自带 WebXR 辅助工具（`SparkXr`），支持手柄和手部追踪移动；SuperSplat 发布的查看器也支持 AR 和 VR 模式下的 WebXR。对于原生引擎，社区插件已经把高斯泼溅带进了 Unity 和 Unreal；在依赖它们做 VR 之前，请确认它们支持单通道立体渲染（single-pass stereo）。

## 7. 常见失败模式

| 症状 | 可能原因 | 解决方法 |
| --- | --- | --- |
| COLMAP 只注册了部分图像，或生成了多个模型 | 重叠存在空缺，存在重复或无纹理的区域 | 补拍衔接照片；视频使用 `sequential_matcher`；尝试 `global_mapper`；遮罩掉天空或移动物体 |
| `convert.py` 在特征提取阶段失败 | COLMAP 选项被重命名（`SiftExtraction.*` → `FeatureExtraction.*`） | 运行第 2.1 节的命令，或修改 `convert.py` |
| 训练因显存不足而崩溃 | 像素或高斯过多 | `-r 2`、`--data_device cpu`、调高 `--densify_grad_threshold`，或使用带高斯上限的 gsplat |
| 相机附近出现漂浮物 | 相机前方的空间缺乏约束，每个区域的视图太少 | 增加视图；依靠不透明度重置；在 SuperSplat 中删除；如有条件可使用深度正则化 |
| 处处模糊 | 运动模糊、对焦错误、位姿不准 | 删除模糊帧；检查重投影误差；锁定对焦 |
| 颜色闪烁或曝光“斑驳” | 自动曝光或白平衡发生了变化 | 锁定曝光；`--train_test_exp`（官方）或外观嵌入（appearance embeddings，splatfacto） |
| 放大或缩小时出现针状尖刺或闪烁 | 走样（第 5 篇） | `--antialiasing` / `--antialiased`；避免在远超采集距离的位置渲染 |
| 在采集位置看效果很好，在其间位置却崩坏 | 视图过于相似（没有视差）或 SH“涂画” | 更多地移动相机；采集更多样化的视点 |
| 镜子和窗户看起来像洞或第二个房间 | 3DGS 无法解释的视角相关效果 | 属于预期现象；遮罩或避开这类表面；反射仍是一个开放的研究问题 |
| 场景在查看器中倾斜或上下颠倒 | SfM 坐标系是任意的，且采用 y 轴朝下约定 | 绕 $x$ 轴旋转 180°；在 SuperSplat 中摆正 |
| VR 中尺度不对 | SfM 的尺度是任意的 | 按实测的参考距离进行缩放 |

## 8. 下一步

- **正确地评估。** 使用 `--eval`，并在留出的视图上报告 PSNR / SSIM / LPIPS（第 2 篇），而不是在训练视图上。
- **尝试第 5 篇中的变体。** 用 2DGS 得到网格（gsplat 自带 `simple_trainer_2dgs.py`）、MCMC 致密化、面向网页的压缩。
- **让它可以交互。** 把泼溅与 three.js 网格结合起来实现 UI 和物理，或者对其进行分割，让用户可以操作物体，就像 VR-GS 那样。
- **用前馈代替优化。** 对于稀疏或没有位姿的照片，试试第 5 篇中的前馈（feed-forward）模型，并与你优化得到的结果进行比较。

## 动手试试

在第一次采集之前，打开[交互实验室]({{ '/' | relative_url }}#lab)中的“高斯世界”演示，切换到“椭球”和“重叠热图”视图：它们展示了分布良好的一组高斯是什么样子，以及一帧 VR 画面需要为多少重叠绘制（overdraw）付出代价，这正是你将在第 3 节和第 6 节中调节的量。

## 代表性论文与工具

| 论文 / 工具 | 会议/期刊 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Structure-from-Motion Revisited (COLMAP, Schönberger & Frahm) | CVPR | 2016 | [CVF](https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html) | 本教程中的位姿估计步骤 |
| Global Structure-from-Motion Revisited (GLOMAP, Pan et al.) | ECCV | 2024 | [arXiv](https://arxiv.org/abs/2407.20219) | 面向大规模采集的快速全局 SfM |
| 3D Gaussian Splatting for Real-Time Radiance Field Rendering (Kerbl et al.) | ACM TOG / SIGGRAPH | 2023 | [arXiv](https://arxiv.org/abs/2308.04079) | 我们训练的方法 |
| Nerfstudio (Tancik et al.) | SIGGRAPH (Conf.) | 2023 | [arXiv](https://arxiv.org/abs/2302.04264) | 数据处理、splatfacto 和查看器 |
| gsplat: An Open-Source Library for Gaussian Splatting (Ye et al.) | arXiv | 2024 | [arXiv](https://arxiv.org/abs/2409.06765) | 支持 MCMC 和抗锯齿的快速训练器 |
| Mip-Splatting (Yu et al.) | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.16493) | 为什么 `--antialiasing` 在 VR 中很重要 |
| 3D Gaussian Splatting as Markov Chain Monte Carlo (Kheradmand et al.) | NeurIPS | 2024 | [arXiv](https://arxiv.org/abs/2404.09591) | 带预算的致密化，得到适合 VR 规模的模型 |
| VR-GS (Jiang et al.) | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2401.16663) | 一个完整的交互式高斯 VR 系统 |

## 学习资源

- [COLMAP 文档](https://colmap.github.io/)：教程、命令行接口、FAQ（包括处理困难数据集的技巧）。
- [官方 3DGS 仓库](https://github.com/graphdeco-inria/gaussian-splatting)：README 中关于处理自己的场景以及查看器的章节。
- [gsplat 文档](https://docs.gsplat.studio/)及其 `examples/` 文件夹。
- [nerfstudio 文档](https://docs.nerf.studio/)，包括数据采集指南和 [splatfacto](https://docs.nerf.studio/nerfology/methods/splat.html)。
- [Spark](https://github.com/sparkjsdev/spark) 及其示例；[SuperSplat](https://github.com/playcanvas/supersplat)；[WebXR Device API](https://immersive-web.github.io/webxr/) 以及 three.js 的 WebXR 示例。

## 练习

1. 对同一个物体采集两次：一次使用自动曝光，一次锁定曝光。分别训练，并比较测试 PSNR 和视觉伪影。
2. 分别用 `-r 4` 和全分辨率训练，然后在浏览器中以全分辨率查看两者，并比较使用与不使用 `--antialiasing` 的情况。用第 5 篇的概念描述其中的差异。
3. 使用 `clean_ply.py` 和 SuperSplat 把你的模型精简到 50 万个高斯以下；测量精简前后在头显中的帧率。
4. 编写一个小脚本，读取 `images.bin`（例如使用 `pycolmap`），并根据相机估计场景的向上向量；用它在网页查看器中自动摆正模型。
5. 测量场景中一段已知的距离（比如桌子的长度），并设置 VR 尺度使其正确；在头显中用你的双手进行检验。

这是神经渲染方向的最后一篇。世界模型和具身智能系列都建立在它的基础上：用于机器人的高斯地图、生成的高斯世界，以及渲染出相机所见画面的仿真器。
