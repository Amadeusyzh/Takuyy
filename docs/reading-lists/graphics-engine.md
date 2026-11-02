# 阅读清单：图形引擎：学习与开发（graphics-engine）

对应博客系列 `graphics-engine`（6 篇）。按篇目分节；每个条目给出出处、年份、链接和一句话说明。
链接均已核实（2026 年 11 月）；无法核实链接的条目只给出标题、作者、出处和年份。
各篇作者在自己的小节下追加条目。

## 01-02

对应第 01 篇（引擎解剖：主循环、面向数据设计、ECS、任务系统、资源管线）和第 02 篇（现代 GPU API、同步、渲染图、GPU 驱动渲染）。

### 书籍

| 书名 | 作者 | 出版 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| *Game Engine Architecture*, 3rd ed. | Jason Gregory | CRC Press, 2018 | [书籍网站](https://www.gameenginebook.com/) | 引擎架构的标准教材，按分层运行时组织；网站已预告两卷本第 4 版 |
| *Real-Time Rendering*, 4th ed. | Akenine-Möller, Haines, Hoffman, Pesce, Iwanicki, Hillaire | A K Peters/CRC Press, 2018 | [realtimerendering.com](https://www.realtimerendering.com/) | 实时渲染百科：管线、分块/分簇着色、加速结构 |
| *Game Programming Patterns* | Robert Nystrom | 2014（免费在线） | [gameprogrammingpatterns.com](https://gameprogrammingpatterns.com/) | Game Loop、Component、Data Locality、Dirty Flag、Spatial Partition 等模式 |
| *Data-Oriented Design* | Richard Fabian | 2018（免费在线） | [dataorienteddesign.com](https://www.dataorienteddesign.com/dodbook/) | 面向数据设计的系统性介绍 |
| *What Every Programmer Should Know About Memory* | Ulrich Drepper | Red Hat 技术报告, 2007 | [PDF](https://people.freebsd.org/~lstewart/articles/cpumemory.pdf) | 缓存、预取、内存布局；理解 AoS/SoA 的基础 |

### 课程

| 课程 | 讲授方 | 链接 | 说明 |
| --- | --- | --- | --- |
| GAMES104 现代游戏引擎：从入门到实践 | Booming Tech（课程主页未列出讲师姓名） | [课程主页](https://games104.boomingtech.com/) | 中文引擎课程，覆盖分层架构、渲染、动画、物理、工具链；配套 Piccolo 引擎 |
| WebGPU Fundamentals | 社区教程 | [webgpufundamentals.org](https://webgpufundamentals.org/) | 从零学习 WebGPU（第 02、03 篇的基础） |
| Learn Wgpu | 社区教程（Rust） | [sotrh.github.io/learn-wgpu](https://sotrh.github.io/learn-wgpu/) | 用 Rust 的 wgpu 学习同一套 API |
| Vulkan Guide | 社区教程（C++20、Vulkan 1.3） | [vkguide.dev](https://vkguide.dev/) | 从零写一个现代 Vulkan 引擎 |

### 开源引擎与库

| 项目 | 语言 / 协议 | 链接 | 说明 |
| --- | --- | --- | --- |
| Godot | C++ / MIT | [GitHub](https://github.com/godotengine/godot) | 完整可读的引擎与编辑器；从 `main/main.cpp` 的 `Main::iteration` 跟踪一帧 |
| Bevy | Rust / MIT 或 Apache-2.0 | [GitHub](https://github.com/bevyengine/bevy) | ECS 优先；`bevy_ecs` 默认用 Table（原型表）存储，可选 SparseSet |
| Piccolo | C++ / MIT | [GitHub](https://github.com/BoomingTech/Piccolo) | GAMES104 的教学引擎，分层清晰 |
| EnTT | C++ / MIT | [GitHub](https://github.com/skypjack/entt) | 基于稀疏集（sparse set）的 ECS 库 |
| flecs | C / MIT | [GitHub](https://github.com/SanderMertens/flecs) | 基于原型（archetype/SoA）存储的 ECS 库 |
| meshoptimizer | C++ / MIT | [GitHub](https://github.com/zeux/meshoptimizer) | 网格优化与 meshlet 构建 |
| niagara | C++ / MIT | [GitHub](https://github.com/zeux/niagara) | 直播中编写的小型 GPU 驱动 Vulkan 渲染器（meshlet、遮挡剔除） |

### 演讲与论文

| 标题 | 出处 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Goldsmith & Salmon, *Automatic Creation of Object Hierarchies for Ray Tracing* | IEEE CG&A 7(5) | 1987 | [DOI](https://doi.org/10.1109/MCG.1987.276983) | 自动构建 BVH；剔除与光线求交的基础 |
| Deering et al., *The Triangle Processor and Normal Vector Shader* | SIGGRAPH | 1988 | [DOI](https://doi.org/10.1145/54852.378468) | 早期硬件延迟着色 |
| Saito & Takahashi, *Comprehensible Rendering of 3-D Shapes* | SIGGRAPH | 1990 | [DOI](https://doi.org/10.1145/97880.97901) | 提出 G-buffer |
| Greene, Kass & Miller, *Hierarchical Z-Buffer Visibility* | SIGGRAPH | 1993 | [DOI](https://doi.org/10.1145/166117.166147) | 层次 Z 缓冲，HZB 遮挡剔除的源头 |
| Blumofe & Leiserson, *Scheduling Multithreaded Computations by Work Stealing* | J. ACM 46(5) | 1999 | [DOI](https://doi.org/10.1145/324133.324234) | 工作窃取调度的理论基础 |
| Fiedler, *Fix Your Timestep!* | Gaffer on Games（文章） | 2004 | [链接](https://gafferongames.com/post/fix_your_timestep/) | 累加器 + 插值的固定时间步长 |
| Harada, McKee & Yang, *Forward+: Bringing Deferred Lighting to the Next Level* | Eurographics 短论文 | 2012 | [DOI](https://doi.org/10.2312/conf/EG2012/short/005-008) | 分块光源列表 + 前向渲染 |
| Olsson, Billeter & Assarsson, *Clustered Deferred and Forward Shading* | HPG | 2012 | [DOI](https://doi.org/10.2312/EGGH/HPG12/087-096) | 三维分簇光源剔除 |
| Burns & Hunt, *The Visibility Buffer: A Cache-Friendly Approach to Deferred Shading* | JCGT 2(2) | 2013 | [JCGT](https://jcgt.org/published/0002/02/04/) | 可见性缓冲 |
| Acton, *Data-Oriented Design and C++* | CppCon 主题演讲 | 2014 | [isocpp](https://isocpp.org/blog/2015/01/cppcon-2014-data-oriented-design-and-c-mike-acton) | 面向数据设计在游戏业的代表性演讲 |
| Gyrling, *Parallelizing the Naughty Dog Engine Using Fibers* | GDC | 2015 | [GDC Vault](https://gdcvault.com/play/1022186) | 基于纤程的任务系统与帧重叠 |
| Haar & Aaltonen, *GPU-Driven Rendering Pipelines* | SIGGRAPH Advances in Real-Time Rendering | 2015 | [课程页面](https://advances.realtimerendering.com/s2015/index.html) | GPU 剔除 + 间接绘制 |
| Wihlidal, *Optimizing the Graphics Pipeline with Compute* | GDC | 2016 | [GDC Vault](https://gdcvault.com/play/1023109) | 计算着色器做簇/三角形剔除 |
| O'Donnell, *FrameGraph: Extensible Rendering Architecture in Frostbite* | GDC | 2017 | [GDC Vault](https://www.gdcvault.com/play/1024612) | 渲染图（帧图）设计的源头 |
| Ford, *Overwatch Gameplay Architecture and Netcode* | GDC | 2017 | [GDC Vault](https://gdcvault.com/play/1024001) | 已发售游戏中的 ECS |
| Arntzen, *Render graphs and Vulkan — a deep dive* | 博客 | 2017 | [themaister.net](https://themaister.net/blog/2017/08/15/render-graphs-and-vulkan-a-deep-dive/) | 渲染图、屏障与异步计算的实现细节 |
| Kubisch, *Introduction to Turing Mesh Shaders* | NVIDIA 技术博客 | 2018 | [链接](https://developer.nvidia.com/blog/introduction-turing-mesh-shaders) | 网格着色器入门 |
| Karis, Stubbe & Wihlidal, *Nanite: A Deep Dive* | SIGGRAPH Advances in Real-Time Rendering | 2021 | [课程页面](https://advances.realtimerendering.com/s2021/index.html) | 簇层次、可见性缓冲、软件光栅化 |

另：SIGGRAPH “Advances in Real-Time Rendering in Games” 课程的历年资料汇总在 [advances.realtimerendering.com](https://advances.realtimerendering.com/)，GDC 演讲在 [GDC Vault](https://gdcvault.com/)。

### API 与工具文档

| 名称 | 链接 | 说明 |
| --- | --- | --- |
| WebGPU 规范（W3C，候选推荐草案） | [w3.org/TR/webgpu](https://www.w3.org/TR/webgpu/) | WebGPU 的权威定义 |
| D3D12 Work Graphs 正式发布（2024 年 3 月） | [DirectX 开发者博客](https://devblogs.microsoft.com/directx/d3d12-work-graphs/) | 着色器启动着色器；mesh nodes 仍为预览（以官方状态为准） |
| VK_EXT_mesh_shader（2022 年 8 月） | [Khronos 公告](https://www.khronos.org/news/permalink/khronos-releases-vulkan-mesh-shader-pipeline-extension) | 跨厂商的 Vulkan 网格着色器 |
| Unreal Render Dependency Graph | [Epic 文档](https://dev.epicgames.com/documentation/en-us/unreal-engine/render-dependency-graph-in-unreal-engine) | UE 的渲染图 |
| Unity URP Render Graph | [Unity 文档](https://docs.unity.com/en-us/engine/6000.0/manual/render-pipelines/universal-render-pipeline/customizing-urp/render-graph) | Unity 6 的渲染图系统 |
| RenderDoc / PIX / Nsight Graphics | [RenderDoc](https://renderdoc.org/) · [PIX](https://devblogs.microsoft.com/pix/) · [Nsight](https://developer.nvidia.com/nsight-graphics) | 帧捕获、计时与硬件计数器 |
## 03-04

对应文章：`graphics-engine-03-build-a-mini-engine`（动手实现迷你引擎）与 `graphics-engine-04-inside-production-engines`（走进生产级引擎）。版本信息截至 2026 年 11 月。

### 迷你引擎：WebGPU、glTF、PBR、阴影（03）

| 论文 / 资料 | 发表 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| Williams, *Casting Curved Shadows on Curved Surfaces* | SIGGRAPH | 1978 | https://doi.org/10.1145/965139.807402 | 阴影贴图的起点 |
| Reeves, Salesin & Cook, *Rendering Antialiased Shadows with Depth Maps* | SIGGRAPH | 1987 | https://doi.org/10.1145/37402.37435 | PCF（百分比渐近过滤） |
| Cook & Torrance, *A Reflectance Model for Computer Graphics* | ACM TOG | 1982 | https://doi.org/10.1145/357290.357293 | 微表面镜面反射模型 |
| Walter et al., *Microfacet Models for Refraction through Rough Surfaces* | EGSR | 2007 | https://doi.org/10.2312/EGWR/EGSR07/195-206 | GGX 分布 |
| Karis, *Real Shading in Unreal Engine 4* | SIGGRAPH course | 2013 | https://blog.selfshadow.com/publications/s2013-shading-course/ | metallic-roughness 工作流（glTF 采用） |
| Donnelly & Lauritzen, *Variance Shadow Maps* | I3D | 2006 | https://doi.org/10.1145/1111411.1111440 | 可滤波阴影贴图 |
| Zhang et al., *Parallel-Split Shadow Maps for Large-scale Virtual Environments* | VRCIA | 2006 | https://doi.org/10.1145/1128923.1128975 | 级联阴影的思想来源 |
| Lauritzen, Salvi & Lefohn, *Sample Distribution Shadow Maps* | I3D | 2011 | https://doi.org/10.1145/1944745.1944761 | 按屏幕深度分布拟合级联 |
| O'Donnell, *FrameGraph: Extensible Rendering Architecture in Frostbite* | GDC | 2017 | https://www.gdcvault.com/play/1024612/FrameGraph-Extensible-Rendering-Architecture-in | 渲染图（render graph）设计 |

规范与工具：WebGPU https://www.w3.org/TR/webgpu/ ，WGSL https://www.w3.org/TR/WGSL/ ，glTF 2.0 https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html ，glTF 示例资产 https://github.com/KhronosGroup/glTF-Sample-Assets ，RenderDoc https://renderdoc.org/ ，Dawn 调试说明（RenderDoc 抓取 Chrome）https://dawn.googlesource.com/dawn/+/HEAD/docs/dawn/debugging.md ，WebGPU Inspector https://github.com/brendan-duncan/webgpu_inspector 。

教程与书：WebGPU Fundamentals https://webgpufundamentals.org/ ，Learn Wgpu https://sotrh.github.io/learn-wgpu/ ，Vulkan Tutorial https://vulkan-tutorial.com/ ，Filament PBR 文档 https://google.github.io/filament/Filament.md.html ，Fiedler《Fix Your Timestep!》https://gafferongames.com/post/fix_your_timestep/ ，Nystrom《Game Programming Patterns》https://gameprogrammingpatterns.com/ ，Gregory《Game Engine Architecture》第 3 版（CRC Press, 2018）。

### 生产级引擎：Nanite、Lumen、VSM、Unity、Godot、Bevy（04）

| 论文 / 资料 | 发表 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| Hoppe, *Progressive Meshes* | SIGGRAPH | 1996 | https://doi.org/10.1145/237170.237216 | 连续 LOD |
| Garland & Heckbert, *Surface Simplification Using Quadric Error Metrics* | SIGGRAPH | 1997 | https://doi.org/10.1145/258734.258849 | QEM 简化误差 |
| Cignoni et al., *Batched Multi Triangulation* | IEEE Visualization | 2005 | https://doi.org/10.1109/VISUAL.2005.1532797 | 边界一致的 patch DAG，Nanite 的前身 |
| Burns & Hunt, *The Visibility Buffer* | JCGT | 2013 | https://jcgt.org/published/0002/02/04/paper.pdf | 可见性缓冲 |
| Karis, Stubbe & Wihlidal, *A Deep Dive into Nanite Virtualized Geometry* | SIGGRAPH Advances | 2021 | https://advances.realtimerendering.com/s2021/index.html | 簇 DAG、LOD 切割、软件光栅化 |
| Wright, Narkowicz & Kelly, *Lumen: Real-time Global Illumination in Unreal Engine 5* | SIGGRAPH Advances | 2022 | https://advances.realtimerendering.com/s2022/index.html | 表面缓存、距离场追踪、屏幕探针 |
| Hart, *Sphere Tracing* | The Visual Computer | 1996 | https://doi.org/10.1007/s003710050084 | SDF 光线步进 |
| Crassin et al., *Interactive Indirect Illumination Using Voxel Cone Tracing* | CGF | 2011 | https://doi.org/10.1111/j.1467-8659.2011.02063.x | 体素锥追踪（Godot VoxelGI 的思路） |
| Majercik et al., *Dynamic Diffuse Global Illumination with Ray-Traced Irradiance Fields* | JCGT | 2019 | http://jcgt.org/published/0008/02/01/ | DDGI 探针 |
| Fernando et al., *Adaptive Shadow Maps* | SIGGRAPH | 2001 | https://doi.org/10.1145/383259.383302 | 自适应阴影贴图，VSM 的祖先 |
| Lefohn, Sengupta & Owens, *Resolution-Matched Shadow Maps* | ACM TOG | 2007 | https://doi.org/10.1145/1289603.1289611 | 按需分配阴影页 |
| Karis, *High Quality Temporal Supersampling* | SIGGRAPH Advances | 2014 | https://advances.realtimerendering.com/s2014/index.html | TAA / TSR 的基础 |
| Bitterli et al., *Spatiotemporal Reservoir Resampling (ReSTIR)* | ACM TOG | 2020 | https://doi.org/10.1145/3386569.3392481 | 多光源重采样 |
| Lagarde & de Rousiers, *Moving Frostbite to Physically Based Rendering* | SIGGRAPH course | 2014 | https://blog.selfshadow.com/publications/s2014-shading-course/ | 生产环境中的 PBR |

官方文档：Nanite https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine ，Lumen 技术细节 https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine ，Virtual Shadow Maps https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-shadow-maps-in-unreal-engine ，TSR https://dev.epicgames.com/documentation/en-us/unreal-engine/temporal-super-resolution-in-unreal-engine ，World Partition https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine ，UE 5.8 发布说明 https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes ；Unity URP Render Graph https://docs.unity.com/en-us/engine/6000.3/manual/render-pipelines/universal-render-pipeline/customizing-urp/render-graph/introduction ，Unity 渲染管线 2026 战略 https://unity.com/topics/render-pipelines-strategy-for-2026 ；Godot 渲染器概览 https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html ，Godot GI https://docs.godotengine.org/en/stable/tutorials/3d/global_illumination/introduction_to_global_illumination.html ；Bevy ExtractSchedule https://docs.rs/bevy_render/latest/bevy_render/struct.ExtractSchedule.html 。

源码：Godot https://github.com/godotengine/godot （`servers/rendering/renderer_rd/`），Bevy https://github.com/bevyengine/bevy （`crates/bevy_render`），O3DE https://github.com/o3de/o3de ，Filament https://github.com/google/filament ，Falcor https://github.com/NVIDIAGameWorks/Falcor ，RTX Remix https://github.com/NVIDIAGameWorks/rtx-remix ，meshoptimizer https://github.com/zeux/meshoptimizer 。
