# 图形引擎（graphics-engine）阅读清单

## 05-06

对应文章：`graphics-engine-05-physics-and-simulation-engines`（物理与仿真引擎）、`graphics-engine-06-ai-meets-graphics-engines`（AI 遇见图形引擎）。产品版本与状态均为截至 2026 年 11 月的情况。

### 阶段 1：碰撞检测与约束求解（第 05 篇）

| 论文 / 资料 | 发表 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| Gilbert, Johnson & Keerthi, A fast procedure for computing the distance between complex objects in three-dimensional space | IEEE J. Robotics and Automation | 1988 | https://doi.org/10.1109/56.2083 | GJK 算法原始论文 |
| van den Bergen, Proximity Queries and Penetration Depth Computation on 3D Game Objects | GDC | 2001 | （无可靠链接） | 提出 EPA 求穿透深度 |
| Catto, Iterative Dynamics | GDC | 2005 | https://box2d.org/files/ErinCatto_IterativeDynamics_GDC2005.pdf | 顺序冲量、累积截断与热启动 |
| Catto, Solver2D（博客） | box2d.org | 2024 | https://box2d.org/posts/2024/02/solver2d/ | 在同一组场景上比较 PGS、TGS、soft step、XPBD 等 8 种求解器 |
| Macklin et al., Small Steps in Physics Simulation | SCA | 2019 | https://doi.org/10.1145/3309486.3340247 | 子步优于迭代 |
| Macklin et al., Non-Smooth Newton Methods for Deformable Multi-Body Dynamics | ACM TOG | 2019 | https://arxiv.org/abs/1907.04587 | 接触、摩擦与可变形体的牛顿型求解 |
| Müller et al., Detailed Rigid Body Simulation with Extended Position Based Dynamics | CGF | 2020 | https://doi.org/10.1111/cgf.14105 | XPBD 用于刚体与关节 |
| Featherstone, Rigid Body Dynamics Algorithms | Springer | 2008 | https://doi.org/10.1007/978-1-4899-7560-7 | 降维坐标、ABA/CRBA/RNEA |

书籍：Ericson《Real-Time Collision Detection》；van den Bergen《Collision Detection in Interactive 3D Environments》；Millington《Game Physics Engine Development》。
代码：Box2D v3（MIT，C17）、Jolt Physics（MIT）、PhysX 5（BSD-3）、Rapier（Apache-2.0）。

### 阶段 2：作为机器人模拟器的引擎（第 05 篇）

| 论文 / 资料 | 发表 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| Todorov, Erez & Tassa, MuJoCo: A physics engine for model-based control | IROS | 2012 | https://doi.org/10.1109/IROS.2012.6386109 | 广义坐标 + 凸接触 |
| Dosovitskiy et al., CARLA: An Open Urban Driving Simulator | CoRL | 2017 | https://arxiv.org/abs/1711.03938 | 基于 Unreal 的驾驶模拟器（0.10 迁移到 UE 5.5） |
| Juliani et al., Unity: A General Platform for Intelligent Agents | arXiv | 2018 | https://arxiv.org/abs/1809.02627 | Unity ML-Agents |
| Puig et al., Habitat 3.0 | ICLR | 2024 | https://arxiv.org/abs/2310.13724 | 人形化身与人在回路 |
| Tao et al., ManiSkill3 | RSS 2025（演示） | 2025 | https://arxiv.org/abs/2410.00425 | GPU 并行仿真与渲染 |
| Zakka et al., MuJoCo Playground | arXiv | 2025 | https://arxiv.org/abs/2502.08844 | MJX 环境 + sim-to-real |
| Mittal et al., Isaac Lab | arXiv | 2025 | https://arxiv.org/abs/2511.04831 | Isaac Lab 设计 |
| Newton（Linux 基金会项目） | 公告 | 2025 | https://github.com/newton-physics/newton | NVIDIA + Google DeepMind + Disney Research，基于 Warp 与 OpenUSD |
| Genesis | 代码仓库 | 2024 | https://github.com/Genesis-Embodied-AI/Genesis | 多求解器 GPU 仿真平台（无论文） |

### 阶段 3：OpenUSD 与合成数据（第 05 篇）

| 论文 / 资料 | 发表 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| OpenUSD 文档与术语表（LIVRPS / LIVERPS） | openusd.org | — | https://openusd.org/release/glossary.html | 组合弧强度顺序 |
| UsdPhysics 模式概览 | openusd.org | — | https://openusd.org/release/api/usd_physics_page_front.html | 刚体、碰撞体、关节、关节体 |
| AOUSD Core Specification 1.0 | Linux Foundation | 2025 | https://www.linuxfoundation.org/press/alliance-for-openusd-announces-core-specification-1.0-the-universal-language-for-building-3d-worlds | 首个规范性 USD 定义 |
| Tobin et al., Domain Randomization for Transferring Deep Neural Networks from Simulation to the Real World | IROS | 2017 | https://arxiv.org/abs/1703.06907 | 域随机化 |
| Tremblay et al., Training Deep Networks with Synthetic Data: Bridging the Reality Gap by Domain Randomization | CVPR Workshops | 2018 | https://arxiv.org/abs/1804.06516 | 检测任务的随机化合成数据 |

### 阶段 4：引擎中的神经渲染（第 06 篇）

| 论文 / 资料 | 发表 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| Müller et al., Real-time Neural Radiance Caching for Path Tracing | ACM TOG（SIGGRAPH） | 2021 | https://arxiv.org/abs/2106.12372 | 在线训练的神经辐射缓存 |
| Vaidyanathan et al., Random-Access Neural Compression of Material Textures | ACM TOG（SIGGRAPH） | 2023 | https://arxiv.org/abs/2305.17105 | 0.2-1.0 BPPC 神经纹理压缩 |
| Zeltner et al., Real-Time Neural Appearance Models | ACM TOG（SIGGRAPH） | 2024 | https://research.nvidia.com/labs/rtr/neural_appearance_models/ | 着色器内的神经分层材质 |
| DLSS 4.5 / FSR Redstone / XeSS 3 官方说明 | 厂商 | 2025-2026 | 见第 06 篇正文链接 | 超分与多帧生成现状 |
| Microsoft：Shader Model 6.9 与 cooperative vectors | DirectX 博客 | 2025 | https://devblogs.microsoft.com/directx/shader-model-6-9-and-the-future-of-cooperative-vector/ | cooperative vectors 改由 SM 6.10 LinAlg 取代 |
| KHR_gaussian_splatting | Khronos | 2026 | https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_gaussian_splatting/README.md | glTF 高斯泼溅扩展 |

### 阶段 5：生成式内容、智能体与神经游戏引擎（第 06 篇）

| 论文 / 资料 | 发表 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| Xiang et al., Structured 3D Latents for Scalable and Versatile 3D Generation (TRELLIS) | CVPR | 2025 | https://arxiv.org/abs/2412.01506 | 开放图像到 3D |
| TRELLIS.2 | arXiv | 2025 | https://arxiv.org/abs/2512.14692 | O-Voxel，4B 模型 |
| Hunyuan3D 2.0 / 2.1 | arXiv | 2025 | https://arxiv.org/abs/2501.12202 ; https://arxiv.org/abs/2506.15442 | 形状 + PBR 纹理 |
| SAM 3D | arXiv | 2025 | https://arxiv.org/abs/2511.16624 | 单图 3D 物体与人体 |
| Tevet et al., Human Motion Diffusion Model | ICLR | 2023 | https://arxiv.org/abs/2209.14916 | 文本到动作 |
| Model Context Protocol 规范 | Anthropic / MCP | 2024-2025 | https://modelcontextprotocol.io/specification/2025-11-25 | 编辑器智能体的工具协议 |
| Alonso et al., DIAMOND | NeurIPS | 2024 | https://arxiv.org/abs/2405.12399 | 扩散世界模型（Atari、CS:GO） |
| Valevski et al., Diffusion Models Are Real-Time Game Engines (GameNGen) | ICLR | 2025 | https://arxiv.org/abs/2408.14837 | 可玩 DOOM |
| Kanervisto et al., World and Human Action Models towards gameplay ideation (WHAM) | Nature | 2025 | https://doi.org/10.1038/s41586-025-08600-3 | Muse |
| Genie 3 / Genie 4 | DeepMind 博客 | 2025 / 2026 | https://deepmind.google/discover/blog/genie-3-a-new-frontier-for-world-models/ ; https://deepmind.google/blog/genie-4-a-new-generation-of-world-simulation/ | 720p/24 fps 可提示世界；Genie 4 研究预览 |
| Matrix-Game 2.0 / 3.0 | arXiv | 2025 / 2026 | https://arxiv.org/abs/2508.13009 ; https://arxiv.org/abs/2604.08995 | 开放实时交互世界模型 |
| Hunyuan-GameCraft / -2 | arXiv | 2025 | https://arxiv.org/abs/2506.17201 ; https://arxiv.org/abs/2511.23429 | 游戏视频训练的交互模型 |
| Yan | arXiv | 2025 | https://arxiv.org/abs/2508.08601 | 1080p / 60 fps |
| HY-World 1.5 (WorldPlay) | arXiv | 2025 | https://arxiv.org/abs/2512.14614 | 长时程记忆 |
| Hafner, Yan & Lillicrap, Training Agents Inside of Scalable World Models (Dreamer 4) | arXiv | 2025 | https://arxiv.org/abs/2509.24527 | 在世界模型中训练智能体 |
| Agarwal et al., Cosmos World Foundation Model Platform for Physical AI | arXiv | 2025 | https://arxiv.org/abs/2501.03575 | 物理 AI 世界基础模型 |
| Cosmos-Predict2.5 / Transfer2.5 | arXiv | 2025 | https://arxiv.org/abs/2511.00062 | sim2real 外观迁移 |
| Kim et al., Cosmos Policy | arXiv | 2026 | https://arxiv.org/abs/2601.16163 | 视频世界模型微调为机器人策略 |
