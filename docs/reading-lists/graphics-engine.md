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
