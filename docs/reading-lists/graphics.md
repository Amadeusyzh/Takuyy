# 阅读清单：从零开始的计算机图形学（graphics）

对应博客系列 `graphics`（7 篇）。按学习阶段组织；每篇论文给出会议/期刊、年份、链接和一句话说明。
链接均已核实；无法核实链接的条目只给出标题、作者、出处和年份。

## 阶段 0：总览与数学工具（对应第 01 篇）

| 论文 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Sutherland, *Sketchpad: A man-machine graphical communication system* | MIT 博士论文（剑桥技术报告 UCAM-CL-TR-574 重印） | 1963 | [report](https://www.cl.cam.ac.uk/techreports/UCAM-CL-TR-574.html) | 交互式计算机图形学的起点 |
| Blinn & Newell, *Clipping Using Homogeneous Coordinates* | SIGGRAPH | 1978 | [SIGGRAPH history](https://history.siggraph.org/?p=103260) | 为什么要在透视除法之前、在 4D 裁剪空间里裁剪 |
| Shoemake, *Animating Rotation with Quaternion Curves* | SIGGRAPH | 1985 | [DOI](https://doi.org/10.1145/325165.325242) | 把四元数和 slerp 引入图形学 |
| Grassia, *Practical Parameterization of Rotations Using the Exponential Map* | Journal of Graphics Tools 3(3) | 1998 | [DOI](https://doi.org/10.1080/10867651.1998.10487493) | 旋转向量（指数映射）的用法与奇异性处理 |
| Kavan et al., *Geometric Skinning with Approximate Dual Quaternion Blending* | ACM TOG 27(4) | 2008 | [DOI](https://doi.org/10.1145/1409625.1409627) | 对偶四元数蒙皮，解决“糖纸”伪影 |
| Zhou et al., *On the Continuity of Rotation Representations in Neural Networks* | CVPR | 2019 | — | 神经网络中旋转表示的连续性（6D 表示） |

## 阶段 1：光栅化管线（对应第 02 篇）

| 论文 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Sutherland & Hodgman, *Reentrant Polygon Clipping* | Communications of the ACM 17(1) | 1974 | [DOI](https://doi.org/10.1145/360767.360802) | 逐平面裁剪多边形，至今仍是标准做法 |
| Catmull, *A Subdivision Algorithm for Computer Display of Curved Surfaces* | 犹他大学博士论文 | 1974 | — | 提出 z-buffer（以及纹理映射） |
| Pineda, *A Parallel Algorithm for Polygon Rasterization* | SIGGRAPH | 1988 | [SIGGRAPH history](https://history.siggraph.org/?p=119557) | 边函数（edge function），现代硬件光栅化的基础 |
| Heckbert & Moreton, *Interpolation for Polygon Texture Mapping and Shading* | State of the Art in Computer Graphics (Springer) | 1991 | — | 透视校正插值的清晰推导 |
| Akeley, *RealityEngine Graphics* | SIGGRAPH | 1993 | [SIGGRAPH history](https://history.siggraph.org/?p=118597) | 硬件多重采样抗锯齿，MSAA 的前身 |
| Olano & Greer, *Triangle Scan Conversion using 2D Homogeneous Coordinates* | Graphics Hardware | 1997 | [DOI](https://doi.org/10.1145/258694.258723) | 用齐次边函数免去显式裁剪 |
| Laine & Karras, *High-Performance Software Rasterization on GPUs* | HPG | 2011 | [DOI](https://doi.org/10.1145/2018323.2018337) | 用 CUDA 实现完整软件管线，看清硬件在做什么 |
| Laine et al., *Modular Primitives for High-Performance Differentiable Rendering*（nvdiffrast） | ACM TOG 39(6) / SIGGRAPH Asia | 2020 | [arXiv](https://arxiv.org/abs/2011.03277) | 可微光栅化，用于逆渲染与学习 |
| Kerbl et al., *3D Gaussian Splatting for Real-Time Radiance Field Rendering* | ACM TOG 42(4) / SIGGRAPH | 2023 | [arXiv](https://arxiv.org/abs/2308.04079) | 面向高斯的分块光栅化器，通向神经渲染的桥梁 |

## 阶段 2：着色与纹理（对应第 03 篇）

| 论文 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Gouraud, *Continuous Shading of Curved Surfaces* | IEEE Trans. Computers | 1971 | [DOI](https://doi.org/10.1109/T-C.1971.223313) | 插值顶点颜色的平滑着色 |
| Catmull, *A Subdivision Algorithm for Computer Display of Curved Surfaces* | 犹他大学博士论文 | 1974 | — | 提出纹理映射与 z-buffer |
| Phong, *Illumination for Computer Generated Pictures* | Communications of the ACM | 1975 | [DOI](https://doi.org/10.1145/360825.360839) | 环境光 + 漫反射 + 高光模型；逐像素插值法线 |
| Blinn, *Models of Light Reflection for Computer Synthesized Pictures* | SIGGRAPH | 1977 | [PDF (Microsoft Research)](https://www.microsoft.com/en-us/research/wp-content/uploads/1977/01/p192-blinn.pdf) | 半程向量高光；把 Torrance-Sparrow 微表面模型引入图形学 |
| Blinn, *Simulation of Wrinkled Surfaces* | SIGGRAPH | 1978 | [SIGGRAPH history](https://history.siggraph.org/?p=103267) | 凹凸贴图：扰动法线而不是几何 |
| Williams, *Casting Curved Shadows on Curved Surfaces* | SIGGRAPH | 1978 | [SIGGRAPH history](https://history.siggraph.org/?p=120268) | 阴影贴图（shadow mapping）算法 |
| Williams, *Pyramidal Parametrics* | SIGGRAPH | 1983 | — | Mipmap 与三线性过滤 |
| Reeves, Salesin & Cook, *Rendering Antialiased Shadows with Depth Maps* | SIGGRAPH | 1987 | [Pixar Graphics](https://graphics.pixar.com/library/ShadowMaps) | 百分比渐近过滤（PCF） |
| Donnelly & Lauritzen, *Variance Shadow Maps* | I3D | 2006 | — | 基于深度矩、可过滤的阴影贴图 |
| Mikkelsen, *Simulation of Wrinkled Surfaces Revisited* | 哥本哈根大学硕士论文 | 2008 | — | MikkTSpace 切线空间标准的基础 |

## 阶段 3：基于物理的渲染（对应第 04 篇）

| 论文 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Kajiya, *The Rendering Equation* | SIGGRAPH | 1986 | [DOI](https://doi.org/10.1145/15922.15902) | 渲染方程，统一各种渲染算法，并提出路径追踪 |
| Cook & Torrance, *A Reflectance Model for Computer Graphics* | ACM TOG 1(1) | 1982 | [DOI](https://doi.org/10.1145/357290.357293) | 沿用至今的 $DFG/(4\cos\cos)$ 微表面 BRDF |
| Trowbridge & Reitz, *Average Irregularity Representation of a Rough Surface for Ray Reflection* | JOSA | 1975 | — | 今天称为 GGX 的分布的来源 |
| Schlick, *An Inexpensive BRDF Model for Physically-based Rendering* | Computer Graphics Forum 13(3) | 1994 | [DOI](https://doi.org/10.1111/1467-8659.1330233) | $(1-\cos)^5$ Fresnel 近似 |
| Walter et al., *Microfacet Models for Refraction through Rough Surfaces* | EGSR | 2007 | [DOI](https://doi.org/10.2312/EGWR/EGSR07/195-206) | GGX、通用微表面推导、粗糙透射 |
| Burley, *Physically-Based Shading at Disney* | SIGGRAPH Course | 2012 | [page](https://disneyanimation.com/publications/physically-based-shading-at-disney) | 面向美术的 principled 参数化，$\alpha = r^2$ |
| Karis, *Real Shading in Unreal Engine 4* | SIGGRAPH Course | 2013 | [course page](https://blog.selfshadow.com/publications/s2013-shading-course/) | 实时 metallic-roughness 模型与 split-sum IBL |
| Heitz, *Understanding the Masking-Shadowing Function in Microfacet-Based BRDFs* | JCGT 3(2) | 2014 | [JCGT](https://jcgt.org/published/0003/02/03/) | 严格推导 Smith $G_1$ 与高度相关的 $G_2$ |
| Kulla & Conty, *Revisiting Physically Based Shading at Imageworks* | SIGGRAPH Course | 2017 | — | 多次散射的能量补偿 |

## 阶段 4：光线追踪与路径追踪（对应第 05 篇）

| 论文 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Whitted, *An Improved Illumination Model for Shaded Display* | Communications of the ACM | 1980 | [DOI](https://doi.org/10.1145/358876.358882) | 递归光线追踪：阴影、反射、折射 |
| Cook, Porter & Carpenter, *Distributed Ray Tracing* | SIGGRAPH | 1984 | [DOI](https://doi.org/10.1145/800031.808590) | 在镜头、时间、面积上分布光线：软阴影、景深、运动模糊 |
| Goldsmith & Salmon, *Automatic Creation of Object Hierarchies for Ray Tracing* | IEEE CG&A | 1987 | [DOI](https://doi.org/10.1109/MCG.1987.276983) | 基于表面积代价的 BVH |
| MacDonald & Booth, *Heuristics for Ray Tracing Using Space Subdivision* | The Visual Computer | 1990 | — | 形式化表面积启发式（SAH） |
| Veach & Guibas, *Optimally Combining Sampling Techniques for Monte Carlo Rendering* | SIGGRAPH | 1995 | [DOI](https://doi.org/10.1145/218380.218498) | 多重重要性采样（MIS），balance / power heuristic |
| Möller & Trumbore, *Fast, Minimum Storage Ray-Triangle Intersection* | Journal of Graphics Tools | 1997 | [DOI](https://doi.org/10.1080/10867651.1997.10487468) | 标准的光线-三角形求交 |
| Veach, *Robust Monte Carlo Methods for Light Transport Simulation* | 斯坦福博士论文 | 1997 | [project page](https://graphics.stanford.edu/papers/veach_thesis/) | 路径空间表述、MIS、BDPT、MLT |
| Heitz, *Sampling the GGX Distribution of Visible Normals* | JCGT 7(4) | 2018 | [JCGT](https://jcgt.org/published/0007/04/01/) | 精确、廉价的 GGX 可见法线（VNDF）采样 |

## 阶段 5：实时光线追踪（对应第 06 篇）

| 论文 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Talbot, Cline & Egbert, *Importance Resampling for Global Illumination* | EGSR | 2005 | [DOI](https://doi.org/10.2312/EGWR/EGSR05/139-146) | 把 RIS 引入渲染，ReSTIR 背后的估计器 |
| Dammertz et al., *Edge-Avoiding À-Trous Wavelet Transform for Fast Global Illumination Filtering* | HPG | 2010 | [DOI](https://doi.org/10.2312/EGGH/HPG10/067-075) | G-buffer 引导的小波滤波，多数实时降噪器的基础 |
| Karis, *High Quality Temporal Supersampling* | SIGGRAPH Advances in Real-Time Rendering Course | 2014 | — | 普及了抖动 TAA 与邻域裁剪 |
| Schied et al., *Spatiotemporal Variance-Guided Filtering*（SVGF） | HPG | 2017 | [DOI](https://doi.org/10.1145/3105762.3105770) | 时间矩 → 方差 → 自适应 à-trous；实时 1 spp 路径追踪 |
| Bitterli et al., *Spatiotemporal Reservoir Resampling for Real-Time Ray Tracing with Dynamic Direct Lighting*（ReSTIR） | ACM TOG 39(4) / SIGGRAPH | 2020 | [DOI](https://doi.org/10.1145/3386569.3392481) | RIS + 蓄水池 + 时空复用，支持百万光源 |
| Ouyang et al., *ReSTIR GI: Path Resampling for Real-Time Path Tracing* | HPG / Computer Graphics Forum 40(8) | 2021 | [DOI](https://doi.org/10.1111/cgf.14378) | 把 ReSTIR 推广到间接光照 |
| Müller et al., *Real-time Neural Radiance Caching for Path Tracing* | ACM TOG 40(4) / SIGGRAPH | 2021 | [arXiv](https://arxiv.org/abs/2106.12372) | 在线训练的 MLP 辐射缓存，通向神经渲染 |
| Lin et al., *Generalized Resampled Importance Sampling: Foundations of ReSTIR* | ACM TOG 41(4) / SIGGRAPH | 2022 | [DOI](https://doi.org/10.1145/3528223.3530158) | GRIS：跨域复用与相关样本的严格理论 |
| Wyman et al., *A Gentle Introduction to ReSTIR: Path Reuse in Real-time* | SIGGRAPH Courses | 2023 | [DOI](https://doi.org/10.1145/3587423.3595511) | ReSTIR 理论与实践的最佳教程 |

## 阶段 6：基于物理的模拟（对应第 07 篇）

| 论文 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Monaghan, *Smoothed Particle Hydrodynamics* | Annu. Rev. Astron. Astrophys. | 1992 | [DOI](https://doi.org/10.1146/annurev.aa.30.090192.002551) | SPH 经典综述 |
| Baraff & Witkin, *Large Steps in Cloth Simulation* | SIGGRAPH | 1998 | [DOI](https://doi.org/10.1145/280814.280821) | 隐式欧拉 + 共轭梯度模拟刚硬布料 |
| Stam, *Stable Fluids* | SIGGRAPH | 1999 | [DOI](https://doi.org/10.1145/311535.311548) | 无条件稳定的网格流体 |
| Müller, Charypar & Gross, *Particle-Based Fluid Simulation for Interactive Applications* | SCA | 2003 | [EG DL](https://diglib.eg.org/handle/10.2312/SCA.SCA03.154-159) | 把 SPH 带入交互式图形学 |
| Müller et al., *Position Based Dynamics* | J. Vis. Commun. Image Represent. | 2007 | [DOI](https://doi.org/10.1016/j.jvcir.2007.01.005) | 在位置上做约束投影，无条件稳定 |
| Macklin & Müller, *Position Based Fluids* | ACM TOG / SIGGRAPH | 2013 | [DOI](https://doi.org/10.1145/2461912.2461984) | PBD 中的密度约束，实时不可压缩流体 |
| Bender et al., *A Survey on Position-Based Simulation Methods in Computer Graphics* | Computer Graphics Forum | 2014 | [DOI](https://doi.org/10.1111/cgf.12346) | PBD 家族方法综述 |
| Macklin, Müller & Chentanez, *XPBD: Position-Based Simulation of Compliant Constrained Dynamics* | MIG | 2016 | [DOI](https://doi.org/10.1145/2994258.2994272) | 柔度 + 拉格朗日乘子：刚度与迭代次数无关 |
| Macklin et al., *Small Steps in Physics Simulation* | SCA | 2019 | [DOI](https://doi.org/10.1145/3309486.3340247) | 多个子步、每步一次迭代，胜过多次迭代 |
| Müller et al., *Detailed Rigid Body Simulation with Extended Position Based Dynamics* | SCA / Computer Graphics Forum | 2020 | [DOI](https://doi.org/10.1111/cgf.14105) | 用 XPBD 处理刚体、关节与接触 |

## 课程

- **GAMES101：现代计算机图形学入门**（闫令琪）：[课程主页](https://sites.cs.ucsb.edu/~lingqi/teaching/games101.html)。变换、光栅化、着色、光线追踪、路径追踪。
- **GAMES202：高质量实时渲染**（闫令琪）：[课程主页](https://sites.cs.ucsb.edu/~lingqi/teaching/games202.html)。实时阴影、PBR、split sum、实时光追与降噪。
- **GAMES103：基于物理的计算机动画入门**（王华民）：刚体、质点弹簧、PBD、流体。
- **Berkeley CS184/284A**：[cs184.eecs.berkeley.edu](https://cs184.eecs.berkeley.edu/)。光栅化器、PathTracer、布料模拟三个大作业。
- **Stanford CS148**：入门级图形学课程，范围相近、节奏更缓。

## 书籍

- Pharr, Jakob, Humphreys, *Physically Based Rendering: From Theory to Implementation*（PBRT，第 4 版，免费在线）：[pbr-book.org](https://pbr-book.org/)。
- Akenine-Möller et al., *Real-Time Rendering*（第 4 版）：[realtimerendering.com](https://www.realtimerendering.com/)。
- Shirley et al., *Ray Tracing in One Weekend* 系列（免费）：[raytracing.github.io](https://raytracing.github.io/)。
- Robert Bridson, *Fluid Simulation for Computer Graphics*（CRC Press）。
- *Ray Tracing Gems* I / II（NVIDIA 免费电子书）。

## 在线教程

- **Scratchapixel**：[scratchapixel.com](https://www.scratchapixel.com/)。
- **LearnOpenGL**：[learnopengl.com](https://learnopengl.com/)（含 PBR 与 IBL 章节）。
- **Filament 文档**：[Physically Based Rendering in Filament](https://google.github.io/filament/Filament.md.html)。
- **Ten Minute Physics**（Matthias Müller）：[布料一课](https://matthias-research.github.io/pages/tenMinutePhysics/14-cloth.html)。
- **3Blue1Brown, Essence of Linear Algebra**：[系列](https://www.3blue1brown.com/topics/linear-algebra)。

## 开源代码

- [ssloy/tinyrenderer](https://github.com/ssloy/tinyrenderer)：约 500 行 C++ 的软件光栅化器教程。
- [smallpt](https://www.kevinbeason.com/smallpt/)：99 行 C++ 的全局光照路径追踪器。
- [NVIDIA-RTX/NRD](https://github.com/NVIDIA-RTX/NRD)（实时降噪器）、[NVIDIA-RTX/RTXDI](https://github.com/NVIDIA-RTX/RTXDI)（生产级 ReSTIR）。
- [InteractiveComputerGraphics/PositionBasedDynamics](https://github.com/InteractiveComputerGraphics/PositionBasedDynamics)、[NVIDIA/warp](https://github.com/NVIDIA/warp)、[taichi-dev/taichi](https://github.com/taichi-dev/taichi)、[google-deepmind/mujoco](https://github.com/google-deepmind/mujoco)。
- 本站首页实验室（Lab）：GPU 路径追踪器（GGX、NEE+MIS、à-trous 降噪）与 XPBD 布料，源码见 `assets/js/lab-pathtracer.js`、`assets/js/lab.js`。

## 2026 研究前沿（对应第 13 篇 graphics-13-research-frontiers-2026）

截至 2026 年 11 月 2 日。状态：已发表 = 已在 2026 年召开的会议上发表或已刊出；已接收 = SIGGRAPH Asia 2026（2026 年 12 月 1-4 日，吉隆坡）待发表；预印本 = 仅 arXiv。每条均已对照 arXiv 摘要页、Crossref DOI 记录或官方项目页核实。完整数据（含主题、月份、前置章节）见 `bin/figures/graphics/data/13-frontiers.json`。

| 论文 | 出处 | 状态 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Xu et al., *A Generalizable Light Transport 3D Embedding for Global Illumination* | SIGGRAPH 2026 Conference Papers | 已发表 | [arXiv](https://arxiv.org/abs/2510.18189) | 点云 Transformer 嵌入 + 交叉注意力预测全局光照 |
| Attimont et al., *Gaussian Light Transport* | SIGGRAPH Asia 2026 | 已接收 | [arXiv](https://arxiv.org/abs/2609.11430) | 用高斯混合求解渲染方程残差，实时显示 |
| Shi et al., *Spatio-Temporal Control Variates with ReSTIR for Real-Time Rendering* | SIGGRAPH 2026 Conference Papers | 已发表 | [DOI](https://doi.org/10.1145/3799902.3811113) | ReSTIR 中的控制变量，消除彩色噪声 |
| Kim et al., *ToF ReSTIR* | ACM TOG 45(4) | 已发表 | [arXiv](https://arxiv.org/abs/2605.11536) | 保持光程的 shift mapping，用于飞行时间渲染 |
| Klepikov et al., *Neural Caching of Prefiltered Radiance for Specular Lighting* | arXiv | 预印本 | [arXiv](https://arxiv.org/abs/2610.11702) | 预滤波辐射度的神经缓存 + split sum |
| Weier et al., *Beyond Positional Encoding: A 5D Spatio-Directional Hash Encoding* | arXiv | 预印本 | [arXiv](https://arxiv.org/abs/2603.05079) | 方向 + 空间的 5D 哈希编码，用于神经路径引导 |
| Poirier-Ginter et al., *GRay: Ray Tracing 3D Gaussians Near the Speed of Splats* | I3D 2026 (PACMCGIT 9(1)) | 已发表 | [arXiv](https://arxiv.org/abs/2606.30869) | 快速高斯光线追踪 |
| Rijsdijk et al., *Gaussian Point Splatting* | ACM TOG 45(4) | 已发表 | [DOI](https://doi.org/10.1145/3811272) | 无需排序的随机点泼溅，超大场景 |
| Tojo et al., *Inverse Rendering for Modeling with Line Primitives* | SIGGRAPH Asia 2026 (ACM TOG) | 已接收 | [arXiv](https://arxiv.org/abs/2609.00625) | 线段图元的可微光栅化，适合毛发与织物 |
| Belcour, *Neural Texture Compression using Hypernetworks* | EGSR 2026 | 已发表 | [arXiv](https://arxiv.org/abs/2606.26913) | 超网络直接预测潜变量与解码器权重 |
| De Oliveira et al., *A Hybrid Neural-Microfacet BRDF Model for Real-Time Rendering* | EGSR 2026 (CGF) | 已发表 | [arXiv](https://arxiv.org/abs/2608.09604) | GGX + 小网络修正 |
| Youwang et al., *Extracting Neural Materials from Images* | arXiv | 预印本 | [arXiv](https://arxiv.org/abs/2606.26715) | 前馈预测 + 可微路径追踪细化神经材质 |
| Liu et al., *B-repLer: Language-guided Editing of CAD Models* | SIGGRAPH 2026 Conference Papers | 已发表 | [arXiv](https://arxiv.org/abs/2508.10201) | 无建模历史的 B-rep 文本编辑 |
| Kong et al., *SQuadGen: Generating Simple Quad Layouts via Chart Distance Fields* | ACM TOG 45(4) | 已发表 | [arXiv](https://arxiv.org/abs/2604.27329) | 在图表距离场上做扩散，生成简洁四边形布局 |
| Yang et al., *SAND: Spatially Adaptive Network Depth for Fast Sampling of Neural Implicit Surfaces* | ACM TOG 45(4) | 已发表 | [arXiv](https://arxiv.org/abs/2604.25936) | 提前退出的 MLP，加速神经 SDF 查询 |
| Feng et al., *Points as Tori: Fast Pointwise Signed Distance for Point Clouds* | ACM TOG 45(4) | 已发表 | [DOI](https://doi.org/10.1145/3811385) | 每点拟合圆环，闭式 SDF 混合 |
| Dodik et al., *Iskra: A System for Inverse Geometry Processing* | ACM TOG 45(4) | 已发表 | [arXiv](https://arxiv.org/abs/2602.12105) | 为现有几何求解器自动生成伴随 |
| Tang et al., *YASPS: A Symbolic Framework for Extensible, High-Performance IPC Simulation* | ACM TOG 45(4) | 已发表 | [arXiv](https://arxiv.org/abs/2605.23088) | 符号能量 + JIT 生成 CUDA 的 IPC |
| Mahmoud et al., *Locality-Aware Automatic Differentiation on the GPU for Mesh-Based Computations* | ACM TOG 45(4) | 已发表 | [arXiv](https://arxiv.org/abs/2509.00406) | 逐单元前向自动微分，GPU 上组装稀疏 Hessian |
| Quan et al., *DiffSurFlow* | ACM TOG 45(4) | 已发表 | [DOI](https://doi.org/10.1145/3811337) | 流图上的代理梯度，可微流体优化 |
| Gong et al., *Learnable Persistent Wrinkle Formation in Cloth Simulation* | SIGGRAPH Asia 2026 | 已接收 | [arXiv](https://arxiv.org/abs/2609.13707) | 实测织物数据拟合弹塑性布料模型 |
| Pei et al., *Curly Hair Simulation using Curly Finite Elements* | arXiv | 预印本 | [arXiv](https://arxiv.org/abs/2607.22103) | 带解析波纹/螺旋细节的杆单元 |
| Feng et al., *MPM Lite: Linear Kernels and Integration without Particles* | arXiv | 预印本 | [arXiv](https://arxiv.org/abs/2602.07853) | 固定积分点 + 线性核的隐式 MPM |
| Zhao et al., *ARDY* | ACM TOG 45(4) | 已发表 | [arXiv](https://arxiv.org/abs/2607.08741) | 实时可控的自回归运动扩散 |
| Shi et al., *GPC: Large-Scale Generative Pretraining for Transferable Motor Control* | SIGGRAPH 2026 Conference Papers | 已发表 | [arXiv](https://arxiv.org/abs/2606.29148) | 运动码本 + RL + GPT 式预训练 |
| Choi et al., *InstantMimic* | SIGGRAPH Asia 2026 Conference Papers | 已接收 | [arXiv](https://arxiv.org/abs/2609.09821) | 全 GPU 执行流，数秒学会物理技能 |
| Hong et al., *Skinned Motion Retargeting via Artifact-driven Kinematic Prior Refinement* | SIGGRAPH Asia 2026 (Journal Track) | 已接收 | [arXiv](https://arxiv.org/abs/2609.06517) | 用蒙皮网格上的穿插修正重定向 |
| Iñesta et al., *Generalized Audio-Driven Synthesis of Precise Drummer Motion* | SCA 2026（最佳论文） | 已发表 | [arXiv](https://arxiv.org/abs/2608.19055) | 由真实音频生成精确的鼓手动作 |
| Javanmardi et al., *Multi-View Face and Gesture Animation with Dynamic Gaussians* | SCA 2026 (CGF 45(8)) | 已发表 | [arXiv](https://arxiv.org/abs/2608.04722) | 面部 + 手部 + 上半身网格上的高斯化身 |
| Zhou et al., *HoloPathTracer* | ACM TOG 45(4) | 已发表 | [arXiv](https://arxiv.org/abs/2606.14173) | 路径追踪同时求解光传输与波传播，生成全息图 |
| Chen et al., *HoOPOE: A Holography-Optimized Perceptual ObjectivE function* | SIGGRAPH Asia 2026 | 已接收 | [arXiv](https://arxiv.org/abs/2610.17474) | 针对全息散斑的感知损失 |
| Kam et al., *Dichoptic Foveation* | SIGGRAPH 2026 Conference Papers | 已发表 | [arXiv](https://arxiv.org/abs/2609.16385) | 双眼分别处理的注视点渲染感知模型 |
| Chen et al., *PAColorHolo* | ACM TOG 45(2) | 已发表 | [arXiv](https://arxiv.org/abs/2601.14766) | 全息显示的感知色彩管理 |
| Kleinbeck et al., *Hybrid Foveated Path Tracing with Peripheral Gaussians for Immersive Anatomy* | IEEE VR 2026 | 已发表 | [arXiv](https://arxiv.org/abs/2601.22026) | 注视区路径追踪 + 周边高斯 |
| Cocco et al., *AtomSlicer* | ACM TOG 45(4) | 已发表 | [DOI](https://doi.org/10.1145/3811363) | 等厚非平面切片与连续刀路 |
| Mitra et al., *Surface Power Diagrams for Knit Singularity Placement* | ACM TOG 45(4) | 已发表 | [DOI](https://doi.org/10.1145/3811401) | 曲面幂图放置针织奇异点 |
| Han et al., *IsoGami: Rigid-Deployable Kirigami Materials From Isohedral Tilings* | SIGGRAPH 2026 Conference Papers | 已发表 | [DOI](https://doi.org/10.1145/3799902.3811127) | 单自由度可展开剪纸 |
| Huang et al., *Shellular Metamaterial Design via Compact Electric Potential Parametrization* | SIGGRAPH 2026 Conference Papers | 已发表 | [arXiv](https://arxiv.org/abs/2511.04025) | 电荷参数化 + GPU 均匀化的壳超材料设计 |
| Cao et al., *Learning Sewing Patterns via Latent Flow Matching of Implicit Fields* | SIGGRAPH 2026 Conference Papers | 已发表 | [arXiv](https://arxiv.org/abs/2601.17740) | 隐式场潜空间中的流匹配生成版型 |
| Wang et al., *Nexus: Native Mesh Generation with Diffusion* | ACM TOG 45(4) | 已发表 | [arXiv](https://arxiv.org/abs/2607.13563) | 直接扩散顶点与连接关系 |
| Yan et al., *Generative 3D Gaussians with Learned Density Control* | SIGGRAPH 2026 Conference Papers | 已发表 | [arXiv](https://arxiv.org/abs/2605.16355) | 学习八叉树密度控制高斯数量 |
| Wu et al., *CasLayout* | ACM TOG 45(4) | 已发表 | [arXiv](https://arxiv.org/abs/2604.27361) | 四级级联扩散生成室内布局 |
| Zhang et al., *SIMART* | SIGGRAPH 2026 Conference Papers | 已发表 | [arXiv](https://arxiv.org/abs/2603.23386) | 多模态大模型把整体网格拆成可仿真的铰接资产 |
| Wu et al., *R-DMesh: Video-Guided 3D Animation via Rectified Dynamic Mesh Flow* | SIGGRAPH 2026 Conference Papers | 已发表 | [arXiv](https://arxiv.org/abs/2605.13838) | 视频驱动的网格动画（含起始姿态校正） |
| Wang et al., *GaussiAnimate: Rig Animatable Categories with Level of Dynamics* | SIGGRAPH Asia 2026 | 已接收 | [arXiv](https://arxiv.org/abs/2604.08547) | 4D 序列压缩为自由骨骼，再做运动匹配 |

跟踪渠道：[Ke-Sen Huang 论文列表](https://kesen.realtimerendering.com/)、[ACM TOG](https://dl.acm.org/journal/tog)、[arXiv cs.GR](https://arxiv.org/list/cs.GR/recent)、[Eurographics 数字图书馆](https://diglib.eg.org/)。
