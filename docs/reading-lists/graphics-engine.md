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
