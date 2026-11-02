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

## Chapters 08-09（第 08 篇几何处理、第 09 篇动画与角色）

### 第 08 篇：几何处理

| 论文 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Tutte, *How to draw a graph* | Proc. London Math. Soc. | 1963 | [DOI](https://doi.org/10.1112/plms/s3-13.1.743) | 凸组合嵌入不翻转，Tutte 参数化的基础 |
| Catmull & Clark, *Recursively generated B-spline surfaces on arbitrary topological meshes* | Computer-Aided Design | 1978 | [DOI](https://doi.org/10.1016/0010-4485(78)90110-0) | 四边形细分 |
| Loop, *Smooth Subdivision Surfaces Based on Triangles* | 硕士论文，犹他大学 | 1987 | [MSR](https://www.microsoft.com/en-us/research/publication/smooth-subdivision-surfaces-based-on-triangles/) | 三角形细分 |
| Lorensen & Cline, *Marching cubes: A high resolution 3D surface construction algorithm* | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37401.37422) | 等值面提取 |
| Hoppe et al., *Surface reconstruction from unorganized points* | SIGGRAPH | 1992 | [DOI](https://doi.org/10.1145/133994.134011) | PCA 法线与 MST 定向 |
| Pinkall & Polthier, *Computing discrete minimal surfaces and their conjugates* | Experimental Mathematics | 1993 | [DOI](https://doi.org/10.1080/10586458.1993.10504266) | 余切公式 |
| Taubin, *A signal processing approach to fair surface design* | SIGGRAPH | 1995 | [DOI](https://doi.org/10.1145/218380.218473) | λ\|μ 无收缩平滑 |
| Hart, *Sphere tracing* | The Visual Computer | 1996 | [DOI](https://doi.org/10.1007/s003710050084) | SDF 光线步进 |
| Garland & Heckbert, *Surface simplification using quadric error metrics* | SIGGRAPH | 1997 | [DOI](https://doi.org/10.1145/258734.258849) | QEM 边坍缩 |
| Desbrun et al., *Implicit fairing of irregular meshes using diffusion and curvature flow* | SIGGRAPH | 1999 | [DOI](https://doi.org/10.1145/311535.311576) | 隐式光顺 + 余切拉普拉斯 |
| Lévy et al., *Least squares conformal maps for automatic texture atlas generation* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566590) | LSCM |
| Ju et al., *Dual contouring of Hermite data* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566586) | 对偶轮廓，保留尖锐特征 |
| Meyer et al., *Discrete differential-geometry operators for triangulated 2-manifolds* | VisMath (Springer) | 2003 | [DOI](https://doi.org/10.1007/978-3-662-05105-4_2) | 混合 Voronoi 面积与曲率算子 |
| Kazhdan, Bolitho & Hoppe, *Poisson surface reconstruction* | SGP | 2006 | [DOI](https://doi.org/10.2312/SGP/SGP06/061-070) | 泊松重建 |
| Sorkine & Alexa, *As-Rigid-As-Possible Surface Modeling* | SGP | 2007 | [DOI](https://doi.org/10.2312/SGP/SGP07/109-116) | ARAP 局部/全局 |
| Liu et al., *A local/global approach to mesh parameterization* | Computer Graphics Forum | 2008 | [DOI](https://doi.org/10.1111/j.1467-8659.2008.01290.x) | ARAP 参数化 |
| Kazhdan & Hoppe, *Screened Poisson surface reconstruction* | ACM TOG | 2013 | [DOI](https://doi.org/10.1145/2487228.2487237) | 屏蔽泊松 |
| Wang et al., *NeuS* | NeurIPS | 2021 | [arXiv](https://arxiv.org/abs/2106.10689) | SDF + 体渲染 |
| Chen et al., *Neural Dual Contouring* | ACM TOG (SIGGRAPH) | 2022 | [arXiv](https://arxiv.org/abs/2202.01999) | 学习型对偶轮廓 |
| Li et al., *Neuralangelo* | CVPR | 2023 | [arXiv](https://arxiv.org/abs/2306.03092) | 哈希网格神经表面 |
| Siddiqui et al., *MeshGPT* | CVPR | 2024 | [DOI](https://doi.org/10.1109/CVPR52733.2024.01855) | 网格 token 序列生成 |
| Huang et al., *2D Gaussian Splatting* | SIGGRAPH | 2024 | [DOI](https://doi.org/10.1145/3641519.3657428) | 面元高斯、精确网格 |
| Yu, Sattler & Geiger, *Gaussian Opacity Fields* | ACM TOG (SIGGRAPH Asia) | 2024 | [DOI](https://doi.org/10.1145/3687937) | 从高斯提取网格 |
| Chen et al., *MeshAnything* | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2406.10163) | 类美术网格生成 |
| Tang et al., *EdgeRunner* | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2409.18114) | 紧凑网格 token 化 |
| Hao et al., *Meshtron* | arXiv 预印本（2024-12） | 2024 | [arXiv](https://arxiv.org/abs/2412.09548) | 大规模网格生成 |

书籍与课程：Botsch et al., *Polygon Mesh Processing*（[DOI](https://doi.org/10.1201/b10688)）；Keenan Crane, [Discrete Differential Geometry](https://www.cs.cmu.edu/~kmcrane/Projects/DDG/)；GAMES102（刘利刚）；[libigl 教程](https://libigl.github.io/tutorial/)。

### 第 09 篇：动画与角色

| 论文 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Catmull & Rom, *A class of local interpolating splines* | Computer Aided Geometric Design (Academic Press) | 1974 | 书籍章节 | Catmull–Rom 样条 |
| Shoemake, *Animating rotation with quaternion curves* | SIGGRAPH | 1985 | [DOI](https://doi.org/10.1145/325165.325242) | slerp 与 squad |
| Magnenat-Thalmann et al., *Joint-dependent local deformations for hand animation and object grasping* | Graphics Interface | 1988 | [DOI](https://doi.org/10.20380/GI1988.04) | 早期骨架驱动蒙皮 |
| Wang & Chen, *A combined optimization method for solving the inverse kinematics problems of mechanical manipulators* | IEEE T-RA | 1991 | [DOI](https://doi.org/10.1109/70.86079) | CCD |
| Lewis, Cordner & Fong, *Pose space deformation* | SIGGRAPH | 2000 | [DOI](https://doi.org/10.1145/344779.344862) | 姿态驱动修正形状 |
| Kovar, Gleicher & Pighin, *Motion graphs* | ACM TOG (SIGGRAPH) | 2002 | [DOI](https://doi.org/10.1145/566654.566605) | 运动图 |
| Kavan et al., *Geometric skinning with approximate dual quaternion blending* | ACM TOG | 2008 | [DOI](https://doi.org/10.1145/1409625.1409627) | DQS |
| Aristidou & Lasenby, *FABRIK* | Graphical Models | 2011 | [DOI](https://doi.org/10.1016/j.gmod.2011.05.003) | 基于位置的 IK |
| Lewis et al., *Practice and theory of blendshape facial models* | Eurographics STAR | 2014 | [DOI](https://doi.org/10.2312/egst.20141042) | 混合形状综述 |
| Loper et al., *SMPL* | ACM TOG | 2015 | [DOI](https://doi.org/10.1145/2816795.2818013) | 参数化人体模型 |
| Clavet, *Motion Matching and The Road to Next-Gen Animation* | GDC | 2016 | [GDC Vault](https://gdcvault.com/play/1023280/Motion-Matching-and-The-Road) | 运动匹配 |
| Holden et al., *Phase-functioned neural networks for character control* | ACM TOG | 2017 | [DOI](https://doi.org/10.1145/3072959.3073663) | PFNN |
| Peng et al., *DeepMimic* | ACM TOG (SIGGRAPH) | 2018 | [arXiv](https://arxiv.org/abs/1804.02717) | 强化学习模仿动捕 |
| Holden et al., *Learned motion matching* | ACM TOG | 2020 | [DOI](https://doi.org/10.1145/3386569.3392440) | 学习型运动匹配 |
| Peng et al., *AMP* | ACM TOG (SIGGRAPH) | 2021 | [arXiv](https://arxiv.org/abs/2104.02180) | 对抗运动先验 |
| Peng et al., *ASE* | ACM TOG (SIGGRAPH) | 2022 | [arXiv](https://arxiv.org/abs/2205.01906) | 技能嵌入 |
| Guo et al., *Generating Diverse and Natural 3D Human Motions from Text* | CVPR | 2022 | [CVF](https://openaccess.thecvf.com/content/CVPR2022/html/Guo_Generating_Diverse_and_Natural_3D_Human_Motions_From_Text_CVPR_2022_paper.html) | HumanML3D |
| Tevet et al., *Human Motion Diffusion Model* | ICLR | 2023 | [arXiv](https://arxiv.org/abs/2209.14916) | MDM |
| Luo et al., *Perpetual Humanoid Control* | ICCV | 2023 | [arXiv](https://arxiv.org/abs/2305.06456) | PHC |
| Guo et al., *MoMask* | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2312.00063) | 残差 VQ |
| He et al., *H2O* | IROS | 2024 | [arXiv](https://arxiv.org/abs/2403.04436) | 人形机器人遥操作 |
| Fu et al., *HumanPlus* | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2406.10454) | 影子跟随 |
| Tessler et al., *MaskedMimic* | ACM TOG (SIGGRAPH Asia) | 2024 | [arXiv](https://arxiv.org/abs/2409.14393) | 运动补全式控制 |
| He et al., *ASAP* | RSS | 2025 | [arXiv](https://arxiv.org/abs/2502.01143) | 仿真到现实对齐 |
| Xu et al., *PARC* | SIGGRAPH | 2025 | [arXiv](https://arxiv.org/abs/2505.04002) | 生成器 + 物理跟踪器 |
| Ze et al., *TWIST* | CoRL | 2025 | [PMLR](https://proceedings.mlr.press/v305/ze25a.html) | 全身遥操作 |
| Allshire et al., *VideoMimic* | CoRL | 2025 | [arXiv](https://arxiv.org/abs/2505.03729) | 从视频学人形技能 |
| Xie et al., *KungfuBot* | NeurIPS | 2025 | [arXiv](https://arxiv.org/abs/2506.12851) | 高动态动作跟踪 |
| Xiao et al., *MotionStreamer* | ICCV | 2025 | [arXiv](https://arxiv.org/abs/2503.15451) | 流式文本到运动 |
| Tessler et al., *MaskedManipulator* | SIGGRAPH Asia | 2025 | [arXiv](https://arxiv.org/abs/2505.19086) | 全身操作 |
| Liao et al., *BeyondMimic* | arXiv 预印本（2025-08） | 2025 | [arXiv](https://arxiv.org/abs/2508.08241) | 跟踪 + 引导扩散 |
| Araújo et al., *Retargeting Matters (GMR)* | arXiv 预印本（2025-10） | 2025 | [arXiv](https://arxiv.org/abs/2510.02252) | 人形重定向 |
| Tencent Hunyuan, *HY-Motion 1.0* | arXiv 预印本（2025-12） | 2025 | [arXiv](https://arxiv.org/abs/2512.23464) | 流匹配文本到运动 |
| Luo et al., *SONIC* | Science Robotics | 2026 | [arXiv](https://arxiv.org/abs/2511.07820) | 大规模动作跟踪 |
| Rempe et al., *Kimodo* | arXiv 预印本（2026-03） | 2026 | [arXiv](https://arxiv.org/abs/2603.15546) | 可控运动扩散 |
| Liao et al., *SuperMimic* | CoRL 2026（已接收），arXiv 2026-10 | 2026 | [arXiv](https://arxiv.org/abs/2610.28480) | 可微世界模型训练跟踪 |

书籍与课程：Rick Parent, *Computer Animation*；GAMES105（刘利斌）；Daniel Holden 博客 [theorangeduck.com](https://theorangeduck.com/)；代码 [ProtoMotions](https://github.com/NVlabs/ProtoMotions)、[MDM](https://github.com/GuyTevet/motion-diffusion-model)。
## Chapters 10-11（第 10 篇：体积与参与介质；第 11 篇：实时渲染技术）

### 阶段 9：体积与参与介质（对应第 10 篇）

| 论文 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Henyey & Greenstein, *Diffuse Radiation in the Galaxy* | Astrophysical Journal | 1941 | [DOI](https://doi.org/10.1086/144246) | 单参数 HG 相函数 |
| Kajiya & Von Herzen, *Ray Tracing Volume Densities* | SIGGRAPH | 1984 | [DOI](https://doi.org/10.1145/964965.808594) | 把辐射传输方程引入图形学 |
| Nishita et al., *Display of the Earth Taking into Account Atmospheric Scattering* | SIGGRAPH | 1993 | [DOI](https://doi.org/10.1145/166117.166140) | 基于物理的单次散射天空 |
| Max, *Optical Models for Direct Volume Rendering* | IEEE TVCG | 1995 | [DOI](https://doi.org/10.1109/2945.468400) | 发射-吸收模型，NeRF 渲染积分的前身 |
| Jensen et al., *A Practical Model for Subsurface Light Transport* | SIGGRAPH | 2001 | [DOI](https://doi.org/10.1145/383259.383319) | 偶极子 BSSRDF |
| Draine, *Scattering by Interstellar Dust Grains. I.* | Astrophysical Journal | 2003 | [DOI](https://doi.org/10.1086/379118) | Draine 相函数 |
| Bruneton & Neyret, *Precomputed Atmospheric Scattering* | CGF (EGSR) | 2008 | [DOI](https://doi.org/10.1111/j.1467-8659.2008.01245.x) | 4D 查找表的多次散射天空 |
| Museth, *VDB: High-Resolution Sparse Volumes with Dynamic Topology* | ACM TOG | 2013 | [DOI](https://doi.org/10.1145/2487228.2487235) | OpenVDB |
| Novák, Selle & Jarosz, *Residual Ratio Tracking for Estimating Attenuation in Participating Media* | ACM TOG | 2014 | [DOI](https://doi.org/10.1145/2661229.2661292) | ratio / residual ratio tracking |
| Wronski, *Volumetric Fog* | SIGGRAPH Advances | 2014 | [课程页面](https://advances.realtimerendering.com/s2014/index.html) | froxel 体积雾 |
| Schneider, *The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn* | SIGGRAPH Advances | 2015 | [课程页面](https://advances.realtimerendering.com/s2015/index.html) | 实时体积云 |
| Hillaire, *Towards Unified and Physically-Based Volumetric Lighting in Frostbite* | SIGGRAPH Advances | 2015 | [课程页面](https://advances.realtimerendering.com/s2015/index.html) | 能量守恒的 froxel 积分 |
| Jimenez et al., *Separable Subsurface Scattering* | CGF | 2015 | [DOI](https://doi.org/10.1111/cgf.12529) | 屏幕空间可分离 SSS |
| Christensen & Burley, *Approximate Reflectance Profiles for Efficient Subsurface Scattering* | Pixar Tech. Memo 15-04 | 2015 | — | 归一化扩散剖面 |
| Kutz et al., *Spectral and Decomposition Tracking for Rendering Heterogeneous Volumes* | ACM TOG | 2017 | [DOI](https://doi.org/10.1145/3072959.3073665) | 谱 tracking 与分解 tracking |
| Fong et al., *Production Volume Rendering* | SIGGRAPH Courses | 2017 | [DOI](https://doi.org/10.1145/3084873.3084907) | 电影级体积渲染实践 |
| Novák et al., *Monte Carlo Methods for Volumetric Light Transport Simulation* | CGF (EG STAR) | 2018 | [DOI](https://doi.org/10.1111/cgf.13383) | 体积蒙特卡洛综述（首选） |
| Miller, Georgiev & Jarosz, *A Null-Scattering Path Integral Formulation of Light Transport* | ACM TOG | 2019 | [DOI](https://doi.org/10.1145/3306346.3323025) | 空散射路径积分 |
| Hillaire, *A Scalable and Production Ready Sky and Atmosphere Rendering Technique* | CGF (EGSR) | 2020 | [DOI](https://doi.org/10.1111/cgf.14050) | 动态 LUT 天空 |
| Museth, *NanoVDB* | SIGGRAPH Talks | 2021 | [DOI](https://doi.org/10.1145/3450623.3464653) | GPU 上的 VDB |
| Jendersie & d'Eon, *An Approximate Mie Scattering Function for Fog and Cloud Rendering* | SIGGRAPH Talks | 2023 | [DOI](https://doi.org/10.1145/3587421.3595409) | HG + Draine 拟合 Mie |

### 阶段 10：实时渲染技术（对应第 11 篇）

| 论文 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Reeves, Salesin & Cook, *Rendering Antialiased Shadows with Depth Maps* | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37401.37435) | PCF |
| Saito & Takahashi, *Comprehensible Rendering of 3-D Shapes* | SIGGRAPH | 1990 | [DOI](https://doi.org/10.1145/97880.97901) | G-buffer |
| Ramamoorthi & Hanrahan, *An Efficient Representation for Irradiance Environment Maps* | SIGGRAPH | 2001 | [DOI](https://doi.org/10.1145/383259.383317) | 9 个 SH 系数的辐照度 |
| Sloan, Kautz & Snyder, *Precomputed Radiance Transfer* | SIGGRAPH | 2002 | [DOI](https://doi.org/10.1145/566570.566612) | PRT |
| Reinhard et al., *Photographic Tone Reproduction for Digital Images* | ACM TOG | 2002 | [DOI](https://doi.org/10.1145/566654.566575) | Reinhard 色调映射 |
| Fernando, *Percentage-Closer Soft Shadows* | SIGGRAPH Sketches | 2005 | [DOI](https://doi.org/10.1145/1187112.1187153) | PCSS |
| Donnelly & Lauritzen, *Variance Shadow Maps* | I3D | 2006 | [DOI](https://doi.org/10.1145/1111411.1111440) | VSM |
| Zhang et al., *Parallel-Split Shadow Maps for Large-Scale Virtual Environments* | VRCIA | 2006 | [DOI](https://doi.org/10.1145/1128923.1128975) | 级联阴影与实用切分 |
| Mittring, *Finding Next Gen: CryEngine 2* | SIGGRAPH Courses | 2007 | [DOI](https://doi.org/10.1145/1281500.1281671) | SSAO |
| Annen et al., *Exponential Shadow Maps* | Graphics Interface | 2008 | [GI](https://graphicsinterface.org/proceedings/gi2008/gi2008-20) | ESM |
| Bavoil, Sainz & Dimitrov, *Image-Space Horizon-Based Ambient Occlusion* | SIGGRAPH Talks | 2008 | [DOI](https://doi.org/10.1145/1401032.1401061) | HBAO |
| Lauritzen, Salvi & Lefohn, *Sample Distribution Shadow Maps* | I3D | 2011 | [DOI](https://doi.org/10.1145/1944745.1944761) | SDSM |
| Crassin et al., *Interactive Indirect Illumination Using Voxel Cone Tracing* | CGF (PG) | 2011 | [DOI](https://doi.org/10.1111/j.1467-8659.2011.02063.x) | 体素锥追踪 |
| Olsson, Billeter & Assarsson, *Clustered Deferred and Forward Shading* | HPG | 2012 | [DOI](https://doi.org/10.2312/EGGH/HPG12/087-096) | 分簇着色 |
| Cigolle et al., *A Survey of Efficient Representations for Independent Unit Vectors* | JCGT | 2014 | [JCGT](https://jcgt.org/published/0003/02/01/) | 八面体法线编码 |
| McGuire & Mara, *Efficient GPU Screen-Space Ray Tracing* | JCGT | 2014 | [JCGT](https://jcgt.org/published/0003/04/04/) | SSR 的 DDA 步进 |
| Peters & Klein, *Moment Shadow Mapping* | I3D | 2015 | [DOI](https://doi.org/10.1145/2699276.2699277) | 矩阴影贴图 |
| Jimenez et al., *Practical Realtime Strategies for Accurate Indirect Occlusion* | Activision TR | 2016 | [报告](https://research.activision.com/publications/archives/atvi-tr-16-01practical-realtime-strategies-for-accurate-indirect-occlusion) | GTAO |
| Majercik et al., *Dynamic Diffuse Global Illumination with Ray-Traced Irradiance Fields* | JCGT | 2019 | [JCGT](https://jcgt.org/published/0008/02/01/) | DDGI |

无论文的重要演讲与规范：Salvi, *An Excursion in Temporal Supersampling*（GDC 2016，方差裁剪）；Hable, *Uncharted 2: HDR Lighting*（GDC 2010）；Narkowicz, [ACES filmic tone mapping curve](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/)（2016）；[Khronos PBR Neutral](https://github.com/KhronosGroup/ToneMapping)（2024）。

代码：[sebh/UnrealEngineSkyAtmosphere](https://github.com/sebh/UnrealEngineSkyAtmosphere)、[ebruneton/precomputed_atmospheric_scattering](https://github.com/ebruneton/precomputed_atmospheric_scattering)、[AcademySoftwareFoundation/openvdb](https://github.com/AcademySoftwareFoundation/openvdb)（含 NanoVDB）、[mitsuba-renderer/mitsuba3](https://github.com/mitsuba-renderer/mitsuba3)、[RenderDoc](https://renderdoc.org/)。
