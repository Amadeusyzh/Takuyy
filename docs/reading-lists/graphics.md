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

## Chapter 12：可微渲染与逆向渲染（对应第 12 篇 graphics-12-differentiable-and-inverse-rendering）

阅读顺序建议：先读 SIGGRAPH 2020 课程建立“内部项 + 边界项”的整体框架，再按 光栅化 → 物理可微渲染 → 实践 → 体积/高斯 → 2024–2026 前沿 的顺序展开。状态核对截至 2026 年 11 月。

### 可微光栅化

| 论文 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Loper & Black, *OpenDR: An Approximate Differentiable Renderer* | ECCV | 2014 | [DOI](https://doi.org/10.1007/978-3-319-10584-0_11) | 第一个通用可微渲染器，图像空间近似导数 |
| Kato, Ushiku & Harada, *Neural 3D Mesh Renderer* | CVPR | 2018 | [arXiv](https://arxiv.org/abs/1711.07566) | 人为设计的光栅化反向梯度 |
| Liu et al., *Soft Rasterizer: A Differentiable Renderer for Image-based 3D Reasoning* | ICCV | 2019 | [arXiv](https://arxiv.org/abs/1904.01786) | 概率化的平滑光栅化，σ 控制模糊 |
| Laine et al., *Modular Primitives for High-Performance Differentiable Rendering*（nvdiffrast） | SIGGRAPH Asia / ACM TOG | 2020 | [arXiv](https://arxiv.org/abs/2011.03277) | 四个 GPU 原语，抗锯齿给出边缘梯度 |
| Ravi et al., *Accelerating 3D Deep Learning with PyTorch3D* | arXiv 技术报告 | 2020 | [arXiv](https://arxiv.org/abs/2007.08501) | PyTorch 中的可微网格/点云渲染 |

### 基于物理的可微渲染

| 论文 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Li et al., *Differentiable Monte Carlo Ray Tracing through Edge Sampling* | SIGGRAPH Asia / ACM TOG | 2018 | [DOI](https://doi.org/10.1145/3272127.3275109) | 边缘采样，主可见性与次级可见性的无偏梯度 |
| Loubet et al., *Reparameterizing Discontinuous Integrands for Differentiable Rendering* | SIGGRAPH Asia / ACM TOG | 2019 | [DOI](https://doi.org/10.1145/3355089.3356510) | 换元让不连续处随参数移动 |
| Zhang et al., *A Differential Theory of Radiative Transfer* | SIGGRAPH Asia / ACM TOG | 2019 | [DOI](https://doi.org/10.1145/3355089.3356522) | 辐射传输方程的微分理论 |
| Nimier-David et al., *Mitsuba 2: A Retargetable Forward and Inverse Renderer* | SIGGRAPH Asia / ACM TOG | 2019 | [DOI](https://doi.org/10.1145/3355089.3356498) | 可重定向的正向/逆向渲染器 |
| Zhang et al., *Path-Space Differentiable Rendering* | SIGGRAPH / ACM TOG | 2020 | [DOI](https://doi.org/10.1145/3386569.3392383) | 路径空间中的边界路径 |
| Nimier-David et al., *Radiative Backpropagation* | SIGGRAPH / ACM TOG | 2020 | [DOI](https://doi.org/10.1145/3386569.3392406) | 把梯度当作伴随光传输，无需记录计算图 |
| Bangaru, Li & Durand, *Unbiased Warped-Area Sampling for Differentiable Rendering* | SIGGRAPH Asia / ACM TOG | 2020 | [DOI](https://doi.org/10.1145/3414685.3417833) | 散度定理把边界积分化为面积分 |
| Vicini, Speierer & Jakob, *Path Replay Backpropagation* | SIGGRAPH / ACM TOG | 2021 | [DOI](https://doi.org/10.1145/3450626.3459804) | 线性时间、常数内存 |
| Jakob et al., *Dr.Jit: A Just-In-Time Compiler for Differentiable Rendering* | SIGGRAPH / ACM TOG | 2022 | [DOI](https://doi.org/10.1145/3528223.3530099) | Mitsuba 3 的 JIT 与自动微分后端 |
| Vicini, Speierer & Jakob, *Differentiable Signed Distance Function Rendering* | SIGGRAPH / ACM TOG | 2022 | [DOI](https://doi.org/10.1145/3528223.3530139) | SDF 的可微渲染 |

### 逆向渲染实践

| 论文 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Deschaintre et al., *Single-Image SVBRDF Capture with a Rendering-Aware Deep Network* | SIGGRAPH / ACM TOG | 2018 | [arXiv](https://arxiv.org/abs/1810.09718) | 单张闪光照片恢复 SVBRDF，渲染感知损失 |
| Azinović et al., *Inverse Path Tracing for Joint Material and Lighting Estimation* | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1903.07145) | 可微路径追踪联合估计材质与光源 |
| Nicolet, Jacobson & Jakob, *Large Steps in Inverse Rendering of Geometry* | SIGGRAPH Asia / ACM TOG | 2021 | [DOI](https://doi.org/10.1145/3478513.3480501) | 拉普拉斯重参数化，稳健的形状优化 |
| Munkberg et al., *Extracting Triangular 3D Models, Materials, and Lighting From Images*（nvdiffrec） | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2111.12503) | 联合恢复网格、PBR 材质和环境光 |

### 体积、高斯与 2024–2026 前沿

| 论文 | 出处 / 状态 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Radl et al., *StopThePop: Sorted Gaussian Splatting for View-Consistent Real-time Rendering* | SIGGRAPH / ACM TOG | 2024 | [arXiv](https://arxiv.org/abs/2402.00525) | 逐像素分层排序，减少 popping |
| Moenne-Loccoz et al., *3D Gaussian Ray Tracing: Fast Tracing of Particle Scenes* | SIGGRAPH Asia | 2024 | [arXiv](https://arxiv.org/abs/2407.07090) | 可微的高斯粒子光线追踪 |
| Mai et al., *EVER: Exact Volumetric Ellipsoid Rendering for Real-time View Synthesis* | arXiv 预印本 | 2024 | [arXiv](https://arxiv.org/abs/2410.01804) | 精确体积分，无 popping |
| Wu et al., *3DGUT: Enabling Distorted Cameras and Secondary Rays in Gaussian Splatting* | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2412.12507) | 无迹变换投影，支持畸变相机与次级光线 |
| Gu et al., *IRGS: Inter-Reflective Gaussian Splatting with 2D Gaussian Ray Tracing* | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2412.15867) | 考虑互反射的高斯逆向渲染 |
| Gu et al., *IRGS++* | arXiv 预印本（2026 年 7 月） | 2026 | [arXiv](https://arxiv.org/abs/2607.22780) | 扩展到金属材质，重要性采样与降噪 |
| Liu et al., *UTrice* | arXiv 预印本（2025 年 12 月） | 2025 | [arXiv](https://arxiv.org/abs/2512.04421) | 以三角形为基元的统一可微光追/光栅化 |
| Li et al., *PAC-NeRF* | ICLR | 2023 | [arXiv](https://arxiv.org/abs/2303.05512) | 辐射场 + 可微 MPM，从视频辨识材料参数 |
| Xie et al., *PhysGaussian* | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.12198) | 同一组高斯用于 MPM 模拟与渲染 |
| Jiang et al., *PhysTwin* | arXiv 预印本 | 2025 | [arXiv](https://arxiv.org/abs/2503.17973) | 弹簧-质点模型 + 高斯渲染，从稀疏视频重建可变形物体 |
| Liu et al., *MOSIV: Multi-Object System Identification from Videos* | ICLR | 2026 | [arXiv](https://arxiv.org/abs/2603.06022) | 多物体场景的可微模拟系统辨识 |
| Zeng et al., *RGB↔X* | SIGGRAPH | 2024 | [arXiv](https://arxiv.org/abs/2405.00666) | 材质与光照感知的扩散模型，分解与合成 |
| Liang et al., *DiffusionRenderer* | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2501.18590) | 视频扩散模型做逆向与正向渲染 |
| He et al., *UniRelight* | arXiv 预印本 | 2025 | [arXiv](https://arxiv.org/abs/2506.15673) | 联合学习反照率估计与重光照 |
| Xiao et al., *Relit-LiVE* | SIGGRAPH 2026（据 arXiv 备注） | 2026 | [arXiv](https://arxiv.org/abs/2605.06658) | 同时预测重光照帧与逐帧环境贴图 |

### 课程与代码

- Zhao, Jakob & Li, *Physics-Based Differentiable Rendering: A Comprehensive Introduction*（SIGGRAPH 2020 课程）：[课程主页](https://courses.shuangz.com/pbdr-course-sg20/)。
- Kato et al., *Differentiable Rendering: A Survey*：[arXiv 2006.12057](https://arxiv.org/abs/2006.12057)。
- [mitsuba-renderer/mitsuba3](https://github.com/mitsuba-renderer/mitsuba3)（最新版本 v3.9.0，2026 年 8 月）及其逆向渲染教程；[NVlabs/nvdiffrast](https://github.com/NVlabs/nvdiffrast)；[facebookresearch/pytorch3d](https://github.com/facebookresearch/pytorch3d)；[ShichenLiu/SoftRas](https://github.com/ShichenLiu/SoftRas)。
- 本文配套脚本 `bin/figures/graphics/graphics_12.py`（软光栅化、边缘采样、球体 BRDF 拟合三个 PyTorch 实验）。
