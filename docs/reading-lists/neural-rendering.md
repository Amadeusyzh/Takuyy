# 阅读清单：神经渲染与 3D 高斯泼溅（neural-rendering）

本清单配合博客系列「神经渲染与 3D 高斯泼溅」（`_posts/*/2026-10-27-neural-rendering-0*.md`）使用。
按学习阶段组织；每篇论文给出会议/期刊、年份、链接和一句话说明。论文标题保留英文。
所有 arXiv 编号与 DOI 均已核对；没有可靠链接的经典文献只列出处，不给链接。

建议路线：阶段 0 → 1 → 2 → 3 → 4 依次读，阶段 5 按兴趣挑方向，阶段 6 边做边查。

---

## 阶段 0：相机模型与多视图几何（对应第 1 篇）

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| A computer algorithm for reconstructing a scene from two projections (Longuet-Higgins) | Nature | 1981 | — | 本质矩阵与八点法的起点 |
| In Defense of the Eight-Point Algorithm (Hartley) | TPAMI | 1997 | — | 坐标归一化让线性八点法变得精确 |
| A Flexible New Technique for Camera Calibration (Zhang) | TPAMI | 2000 | https://doi.org/10.1109/34.888718 | 棋盘格标定，OpenCV 的标定方法 |
| Bundle Adjustment — A Modern Synthesis (Triggs et al.) | Vision Algorithms Workshop (LNCS) | 1999 | — | 光束法平差的系统综述：稀疏性、Schur 补、鲁棒核 |
| An Efficient Solution to the Five-Point Relative Pose Problem (Nistér) | TPAMI | 2004 | — | 已知内参时的最小解，RANSAC 标配 |
| Photo Tourism: Exploring Photo Collections in 3D (Snavely et al.) | SIGGRAPH | 2006 | — | 互联网照片的大规模 SfM |
| Structure-from-Motion Revisited (Schönberger & Frahm) | CVPR | 2016 | https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html | COLMAP 增量式 SfM，NeRF/3DGS 的位姿来源 |
| Pixelwise View Selection for Unstructured Multi-View Stereo (Schönberger et al.) | ECCV | 2016 | https://doi.org/10.1007/978-3-319-46487-9_31 | COLMAP 的 PatchMatch 多视图立体 |
| MVSNet: Depth Inference for Unstructured Multi-view Stereo (Yao et al.) | ECCV | 2018 | https://arxiv.org/abs/1804.02505 | 可微单应变换 + 代价体的学习式 MVS |
| DUSt3R: Geometric 3D Vision Made Easy (Wang et al.) | CVPR | 2024 | https://arxiv.org/abs/2312.14132 | 无需位姿与内参的点图回归 |
| Grounding Image Matching in 3D with MASt3R (Leroy et al.) | ECCV | 2024 | https://arxiv.org/abs/2406.09756 | 在 DUSt3R 上加入稠密匹配 |
| Global Structure-from-Motion Revisited (Pan et al., GLOMAP) | ECCV | 2024 | https://arxiv.org/abs/2407.20219 | 全局 SfM，精度接近 COLMAP 且快得多 |
| VGGT: Visual Geometry Grounded Transformer (Wang et al.) | CVPR | 2025 | https://arxiv.org/abs/2503.11651 | 一次前向同时预测相机、深度、点图与轨迹 |

## 阶段 1：NeRF 与体渲染（对应第 2 篇）

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Ray Tracing Volume Densities (Kajiya & Von Herzen) | SIGGRAPH | 1984 | — | 体密度光线追踪的经典 |
| Optical Models for Direct Volume Rendering (Max) | IEEE TVCG | 1995 | — | 发射-吸收模型，NeRF 渲染方程的来源 |
| NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis (Mildenhall et al.) | ECCV | 2020 | https://arxiv.org/abs/2003.08934 | 神经辐射场的奠基之作 |
| Fourier Features Let Networks Learn High Frequency Functions in Low Dimensional Domains (Tancik et al.) | NeurIPS | 2020 | https://arxiv.org/abs/2006.10739 | 从 NTK 角度解释位置编码 |
| NeRF in the Wild (Martin-Brualla et al.) | CVPR | 2021 | https://arxiv.org/abs/2008.02268 | 外观嵌入与瞬态物体建模 |
| Mip-NeRF: A Multiscale Representation for Anti-Aliasing Neural Radiance Fields (Barron et al.) | ICCV | 2021 | https://arxiv.org/abs/2103.13415 | 锥体追踪与积分位置编码（IPE） |
| NeuS: Learning Neural Implicit Surfaces by Volume Rendering for Multi-view Reconstruction (Wang et al.) | NeurIPS | 2021 | https://arxiv.org/abs/2106.10689 | 基于 SDF 的体渲染，得到干净网格 |
| Mip-NeRF 360: Unbounded Anti-Aliased Neural Radiance Fields (Barron et al.) | CVPR | 2022 | https://arxiv.org/abs/2111.12077 | 场景收缩、提议网络、畸变损失；标准基准 |
| DreamFusion: Text-to-3D using 2D Diffusion (Poole et al.) | ICLR | 2023 | https://arxiv.org/abs/2209.14988 | 分数蒸馏采样（SDS），文本生成 3D 的起点 |

## 阶段 2：快速辐射场（对应第 3 篇）

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| PlenOctrees for Real-time Rendering of Neural Radiance Fields (Yu et al.) | ICCV | 2021 | https://arxiv.org/abs/2103.14024 | 球谐输出 + 八叉树烘焙，实时渲染 |
| Plenoxels: Radiance Fields without Neural Networks (Fridovich-Keil, Yu et al.) | CVPR | 2022 | https://arxiv.org/abs/2112.05131 | 稀疏球谐体素网格，不需要 MLP |
| Direct Voxel Grid Optimization (Sun et al.) | CVPR | 2022 | https://arxiv.org/abs/2111.11215 | 密度网格 + 特征网格，后激活插值 |
| TensoRF: Tensorial Radiance Fields (Chen et al.) | ECCV | 2022 | https://arxiv.org/abs/2203.09517 | CP / VM 张量分解 |
| Instant Neural Graphics Primitives with a Multiresolution Hash Encoding (Müller et al.) | ACM TOG (SIGGRAPH) | 2022 | https://arxiv.org/abs/2201.05989 | 多分辨率哈希编码 + 小型融合 MLP |
| K-Planes: Explicit Radiance Fields in Space, Time, and Appearance (Fridovich-Keil et al.) | CVPR | 2023 | https://arxiv.org/abs/2301.10241 | 平面分解，静态与动态统一 |
| Nerfstudio: A Modular Framework for Neural Radiance Field Development (Tancik et al.) | SIGGRAPH (Conf.) | 2023 | https://arxiv.org/abs/2302.04264 | 常用工具链，nerfacto / splatfacto |
| Zip-NeRF: Anti-Aliased Grid-Based Neural Radiance Fields (Barron et al.) | ICCV | 2023 | https://arxiv.org/abs/2304.06706 | 哈希网格的抗锯齿，质量标杆 |
| 烘焙路线：SNeRG (ICCV 2021)、MobileNeRF (CVPR 2023)、MERF (SIGGRAPH 2023)、BakedSDF (SIGGRAPH 2023) | — | — | — | 把训练好的场烘焙成可光栅化资产（只列出处） |

## 阶段 3：3D 高斯泼溅（对应第 4 篇）

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Surface Splatting (Zwicker et al.) | SIGGRAPH | 2001 | — | 椭圆高斯点渲染 |
| EWA Splatting (Zwicker, Pfister, van Baar & Gross) | IEEE TVCG | 2002 | https://doi.org/10.1109/TVCG.2002.1021576 | 高斯核投影与低通滤波，3DGS 投影公式的来源 |
| 3D Gaussian Splatting for Real-Time Radiance Field Rendering (Kerbl et al.) | ACM TOG 42(4) / SIGGRAPH | 2023 | https://arxiv.org/abs/2308.04079 ；https://doi.org/10.1145/3592433 | 本系列核心方法 |
| gsplat: An Open-Source Library for Gaussian Splatting (Ye et al.) | arXiv | 2024 | https://arxiv.org/abs/2409.06765 | 模块化 CUDA 光栅化库 |
| 3D Gaussian Splatting as Markov Chain Monte Carlo (Kheradmand et al.) | NeurIPS | 2024 | https://arxiv.org/abs/2404.09591 | 用 MCMC 视角替代克隆/分裂启发式 |
| StopThePop: Sorted Gaussian Splatting for View-Consistent Real-time Rendering (Radl et al.) | ACM TOG (SIGGRAPH) | 2024 | https://arxiv.org/abs/2402.00525 | 近似逐像素排序，消除跳变 |
| 3D Gaussian Ray Tracing: Fast Tracing of Particle Scenes (Moenne-Loccoz et al.) | ACM TOG (SIGGRAPH Asia) | 2024 | https://arxiv.org/abs/2407.07090 | BVH 光线追踪高斯，支持畸变相机与二次光线 |

## 阶段 4：3DGS 前沿（对应第 5 篇）

### 4.1 抗锯齿与表面

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Mip-Splatting: Alias-free 3D Gaussian Splatting (Yu et al.) | CVPR | 2024 | https://arxiv.org/abs/2311.16493 | 3D 平滑滤波 + 2D Mip 滤波 |
| SuGaR: Surface-Aligned Gaussian Splatting (Guédon & Lepetit) | CVPR | 2024 | https://arxiv.org/abs/2311.12775 | 表面对齐正则 + 网格提取 |
| 2D Gaussian Splatting for Geometrically Accurate Radiance Fields (Huang et al.) | SIGGRAPH | 2024 | https://arxiv.org/abs/2403.17888 | 面元（surfel）+ 精确光线求交 |
| Gaussian Opacity Fields (Yu, Sattler & Geiger) | ACM TOG (SIGGRAPH Asia) | 2024 | https://arxiv.org/abs/2404.10772 | 不透明度场的水平集表面 |

### 4.2 动态场景与人体

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Dynamic 3D Gaussians (Luiten et al.) | 3DV | 2024 | https://arxiv.org/abs/2308.09713 | 逐帧高斯 + 局部刚性，稠密跟踪 |
| Deformable 3D Gaussians (Yang et al.) | CVPR | 2024 | https://arxiv.org/abs/2309.13101 | 规范空间 + 形变 MLP |
| 4D Gaussian Splatting for Real-Time Dynamic Scene Rendering (Wu et al.) | CVPR | 2024 | https://arxiv.org/abs/2310.08528 | HexPlane 形变场 |
| Real-time Photorealistic Dynamic Scene Representation and Rendering with 4D Gaussian Splatting (Yang et al.) | ICLR | 2024 | https://arxiv.org/abs/2310.10642 | 原生 4D 高斯，按时间条件化切片 |
| Spacetime Gaussian Feature Splatting (Li et al.) | CVPR | 2024 | https://arxiv.org/abs/2312.16812 | 时间不透明度 + 多项式运动 |
| GaussianAvatars (Qian et al.) | CVPR | 2024 | https://arxiv.org/abs/2312.02069 | 绑定到参数化人脸模型的高斯 |

### 4.3 压缩与效率

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| LightGaussian (Fan et al.) | NeurIPS | 2024 | https://arxiv.org/abs/2311.17245 | 剪枝 + 球谐蒸馏 + 量化 |
| Compact 3D Gaussian Representation for Radiance Field (Lee et al.) | CVPR | 2024 | https://openaccess.thecvf.com/content/CVPR2024/papers/Lee_Compact_3D_Gaussian_Representation_for_Radiance_Field_CVPR_2024_paper.pdf | 可学习掩码 + 网格颜色 + 码本 |
| Scaffold-GS (Lu et al.) | CVPR | 2024 | https://arxiv.org/abs/2312.00109 | 锚点结构化高斯 |
| HAC: Hash-grid Assisted Context for 3D Gaussian Splatting Compression (Chen et al.) | ECCV | 2024 | https://arxiv.org/abs/2403.14530 | 哈希网格上下文熵编码 |

### 4.4 SLAM、前馈重建与生成

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| SplaTAM (Keetha et al.) | CVPR | 2024 | https://arxiv.org/abs/2312.02126 | RGB-D 高斯 SLAM，轮廓引导跟踪 |
| Gaussian Splatting SLAM (Matsuki et al.) | CVPR | 2024 | https://arxiv.org/abs/2312.06741 | 单目高斯 SLAM（MonoGS） |
| pixelSplat (Charatan et al.) | CVPR | 2024 | https://arxiv.org/abs/2312.12337 | 从图像对前馈预测高斯 |
| MVSplat (Chen et al.) | ECCV | 2024 | https://arxiv.org/abs/2403.14627 | 代价体引导的前馈高斯 |
| LRM: Large Reconstruction Model for Single Image to 3D (Hong et al.) | ICLR | 2024 | https://arxiv.org/abs/2311.04400 | 大规模 Transformer 单图到 3D |
| GS-LRM (Zhang et al.) | ECCV | 2024 | https://arxiv.org/abs/2404.19702 | Transformer 输出逐像素高斯 |
| LGM: Large Multi-View Gaussian Model (Tang et al.) | ECCV | 2024 | https://arxiv.org/abs/2402.05054 | 多视图扩散 + U-Net 生成高斯 |
| DreamGaussian (Tang et al.) | ICLR | 2024 | https://arxiv.org/abs/2309.16653 | 在高斯上做 SDS，几分钟出资产 |
| GaussianDreamer (Yi et al.) | CVPR | 2024 | https://arxiv.org/abs/2310.08529 | 3D 扩散初始化 + 2D 扩散细化 |

### 4.5 重光照、物理、语义与 AR/VR

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Relightable 3D Gaussians (Gao et al.) | ECCV | 2024 | https://arxiv.org/abs/2311.16043 | BRDF 分解 + 点云光线追踪可见性 |
| GS-IR: 3D Gaussian Splatting for Inverse Rendering (Liang et al.) | CVPR | 2024 | https://arxiv.org/abs/2311.16473 | 法线正则 + 烘焙遮挡的逆渲染 |
| PhysGaussian (Xie et al.) | CVPR | 2024 | https://arxiv.org/abs/2311.12198 | 高斯作为 MPM 粒子的物理仿真 |
| VR-GS (Jiang et al.) | SIGGRAPH | 2024 | https://arxiv.org/abs/2401.16663 | VR 中可交互、物理感知的高斯系统（XPBD） |
| LangSplat (Qin et al.) | CVPR | 2024 | https://arxiv.org/abs/2312.16084 | CLIP 语言特征蒸馏到高斯，开放词汇查询 |

## 阶段 5：实践（对应第 6 篇）

按「采集 → COLMAP → 训练 → 清理导出 → 网页/VR 查看」的顺序：

- COLMAP 文档：https://colmap.github.io/ ；源码：https://github.com/colmap/colmap ；GLOMAP：https://github.com/colmap/glomap
- 官方 3DGS 代码：https://github.com/graphdeco-inria/gaussian-splatting ；项目主页：https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/
- gsplat：https://github.com/nerfstudio-project/gsplat ；文档：https://docs.gsplat.studio/
- nerfstudio：https://docs.nerf.studio/ ；splatfacto：https://docs.nerf.studio/nerfology/methods/splat.html
- 网页查看与编辑：Spark https://github.com/sparkjsdev/spark ；SuperSplat https://github.com/playcanvas/supersplat ；GaussianSplats3D https://github.com/mkkellogg/GaussianSplats3D ；antimatter15/splat https://github.com/antimatter15/splat
- WebXR 规范：https://immersive-web.github.io/webxr/

注意：新版 COLMAP 把 `--SiftExtraction.use_gpu` / `--SiftMatching.use_gpu` 改名为 `--FeatureExtraction.use_gpu` / `--FeatureMatching.use_gpu`，官方 3DGS 的 `convert.py` 仍使用旧名，需手动修改或按第 6 篇逐条执行命令。

---

## 课程、书籍与代码

**书籍**

- R. Hartley & A. Zisserman, *Multiple View Geometry in Computer Vision*, 2nd ed., Cambridge University Press, 2004 —— 多视图几何的标准参考书。
- R. Szeliski, *Computer Vision: Algorithms and Applications*, 2nd ed.（免费在线）：https://szeliski.org/Book/
- M. Pharr, W. Jakob, G. Humphreys, *Physically Based Rendering*（PBRT，免费在线）—— 体渲染与重要性采样的图形学背景。

**课程**

- Stanford CS231A（3D 视觉：相机模型、对极几何、SfM）：https://web.stanford.edu/class/cs231a/
- Stanford CS231N（深度学习基础）。
- GAMES101 / GAMES202（图形学基础与实时渲染，中文）。

**代码与教程**

- NeRF 官方代码：https://github.com/bmild/nerf ；PyTorch 复现：https://github.com/yenchenlin/nerf-pytorch
- Instant-NGP：https://github.com/NVlabs/instant-ngp ；tiny-cuda-nn：https://github.com/NVlabs/tiny-cuda-nn ；nerfacc：https://github.com/nerfstudio-project/nerfacc
- Plenoxels（svox2）：https://github.com/sxyu/svox2 ；DVGO：https://github.com/sunset1995/DirectVoxGO ；TensoRF：https://github.com/apchenstu/TensoRF
- 神经场综述与数据库（Neural Fields in Visual Computing and Beyond, Eurographics STAR 2022）：https://neuralfields.cs.brown.edu/
- Ceres Solver（光束法平差）：http://ceres-solver.org/
- 新闻与论文追踪：https://radiancefields.com/

**本站交互演示**：主页「交互实验室」中的「高斯世界」（3DGS 渲染管线：EWA 投影、深度排序、alpha 合成；程序化生成并可重光照，非训练得到）、XPBD 布料、注视点渲染。
