# 论文速递阅读清单（paper-digest）

每期速递的论文清单。所有条目均于编写当日在 arXiv 摘要页核对过标题、第一作者、首次提交日期和备注栏；
状态以编写日期为准（“预印本”= arXiv 备注未注明会议/期刊）。完整数据见
`bin/figures/paper-digest/data/NN-papers.json`。

## 第 01 期：2026 年 10 月 1 日 – 11 月 2 日（编写于 2026-11-02）

对应文章：`_posts/*/2026-11-02-paper-digest-01-2026-oct-nov.md`

### 1. 图形学

- Tabula Rasa: Monte Carlo estimation of unit-variance noise with controlled spatio-temporal correlation — SIGGRAPH Asia 2026 — 2026-10-08 — https://arxiv.org/abs/2610.11653 — 用 sketching 生成单位方差、时空相关可控的噪声
- DiffGIPC: Differentiable Mixed-Coordinate Contact Dynamics on GPU — 预印本 — 2026-10-13 — https://arxiv.org/abs/2610.19091 — 仿射体 + FEM 的可微 IPC
- Neuroll: Real-Time Neural Strand-Based Hair Simulation via Simulator-in-the-Loop Unrolling — 预印本 — 2026-10-03 — https://arxiv.org/abs/2610.04689 — 仿真器在环训练的神经头发积分器
- PhysSkin++: Real-Time and Generalizable Physics-Based Animation via Self-Supervised Neural Skinning — 预印本 — 2026-10-19 — https://arxiv.org/abs/2610.26067 — 前馈预测神经蒙皮子空间
- Total Deformation-based MPM for Perfectly Elastic Solid Simulation with Strong Deformations — 预印本 — 2026-10-27 — https://arxiv.org/abs/2610.36945 — 避免数值断裂的弹性 MPM
- Walk on Multiscale Media: Compiling Editable and Composable Transport Medium Prefabs for Monte Carlo PDE Solvers — 预印本 — 2026-10-24 — https://arxiv.org/abs/2610.35952 — WoS 的介质预制件
- Dynamic Skinning: Kinematics-Driven Cartoon Effects for Articulated Characters — IEEE TVCG 2026 — 2026-10-29 — https://arxiv.org/abs/2610.40976 — 运动学驱动的闭式次级运动

### 2. 图形引擎与实时

- Windfoil: Closed-Form Coverage for Real-Time and Differentiable Vector Graphics — 预印本 — 2026-10-01 — https://arxiv.org/abs/2610.02468 — WebGPU 闭式覆盖率
- SteadySplats: Resampling of Low-Variance Gaussians for High-Fidelity Stochastic Rendering — 预印本 — 2026-10-04 — https://arxiv.org/abs/2610.05576 — 无排序随机透明 3DGS
- Real-time Rendering of Pre-integrated Neural Emitters — 预印本 — 2026-10-05 — https://arxiv.org/abs/2610.06762 — 神经发光场（NEF）
- Masking Judder in Foveated Rendering with Phase-Shifted Noise — 预印本 — 2026-10-07 — https://arxiv.org/abs/2610.10811 — 相位偏移 Gabor 噪声掩盖抖动
- Neural Caching of Prefiltered Radiance for Specular Lighting — 预印本 — 2026-10-08 — https://arxiv.org/abs/2610.11702 — split-sum + NRC
- A Hybrid and Hierarchical Ray Tracing Method for Efficient 3D Gaussian Rendering — 预印本 — 2026-10-09 — https://arxiv.org/abs/2610.13498 — H2-Ray 软硬件协同设计
- Geometric Queries on Tessellation-Free Displaced Surfaces — 预印本 — 2026-10-15 — https://arxiv.org/abs/2610.21584 — 仿射高度平面层次结构

### 3. 神经渲染

- X-Splat: Unified Gaussian Splatting for Joint RGB and X-ray 3D Reconstruction — SIGGRAPH Asia 2026 — 2026-10-16 — https://arxiv.org/abs/2610.23237
- SwitchSplat: Learning Discrete Object States from Casually Captured Scenes — SIGGRAPH Asia 2026 — 2026-10-17 — https://arxiv.org/abs/2610.24812
- Holo4D: Holistic 4D Reconstruction as Geometric Control for Video Diffusion — NeurIPS 2026 — 2026-10-18 — https://arxiv.org/abs/2610.25276
- RealMe: Immersive Volumetric Video from Minimal Captures — SIGGRAPH Asia 2026 — 2026-10-21 — https://arxiv.org/abs/2610.30023
- RADIANT: Object-Centric Feed-Forward Global Illumination — 预印本 — 2026-10-23 — https://arxiv.org/abs/2610.32075 — 形状因子注意力
- FL4N: Feed-forward Latent Model for 4D Novel View Synthesis — 预印本 — 2026-10-26 — https://arxiv.org/abs/2610.35854
- LucidLyra: Feed-Forward Generative 3D Scene Reconstruction and Joint Understanding via Multi-Task Distillation — 预印本 — 2026-10-29 — https://arxiv.org/abs/2610.40495

### 4. 世界模型

- Orbia: Do Generated Videos Form a Consistent 3D World? — 技术报告 — 2026-10-14 — https://arxiv.org/abs/2610.20693 — 3D 一致性基准
- Matrix-Game 4.0: Harnessing Video Models for Real-Time Playable Game Worlds — 预印本 — 2026-10-20 — https://arxiv.org/abs/2610.27999 — 引擎 + 视频渲染器
- Rethinking Video Autoencoders for Interactive World Models — 预印本 — 2026-10-21 — https://arxiv.org/abs/2610.30129 — CADRE
- World-in-Context: Interactive Video World Modeling with In-Context Conditioning — 预印本 — 2026-10-23 — https://arxiv.org/abs/2610.33169
- BoxWorld: Let World Engines Control and Video Generators Render — 预印本 — 2026-10-26 — https://arxiv.org/abs/2610.36371
- SWIM: Learning What Matters from Behaviors for JEPA World Models — 预印本 — 2026-10-27 — https://arxiv.org/abs/2610.36662
- L3G-World: Real-Time Infinite World Generation with Latent 3D Gaussian Memory — 预印本 — 2026-10-29 — https://arxiv.org/abs/2610.40614 — 潜特征高斯记忆

### 5. 具身智能

- Splat2Act: From Captured Scenes to Personalized VLA Manipulation — 预印本 — 2026-10-09 — https://arxiv.org/abs/2610.13945
- Learning Adaptable Dexterous Skills via Hybrid Dexterous Mimicking — 预印本 — 2026-10-20 — https://arxiv.org/abs/2610.28628 — AdaDex
- SuperMimic: Scaling Humanoid Whole-Body Control with One Differentiable World Model — CoRL 2026（口头报告）— 2026-10-20 — https://arxiv.org/abs/2610.28480
- HyperDrone: Simulation-to-Reality Transfer at Millions of Frames per Second — CoRL 2026 — 2026-10-20 — https://arxiv.org/abs/2610.28950
- Real2Sem2Real: 3D Semantic Augmentations for Robot Learning from a Single Human RGB Demonstration — 预印本 — 2026-10-20 — https://arxiv.org/abs/2610.28880
- Zero-HLM: Generalizable Humanoid Loco-Manipulation without Real Robot Data — 预印本 — 2026-10-26 — https://arxiv.org/abs/2610.35075
- TAPESTRY: A Single Backbone for Video Generation and Robot Control — CoRL 2026 — 2026-10-27 — https://arxiv.org/abs/2610.36823

### 6. HCI / XR

- HoOPOE: A Holography-Optimized Perceptual ObjectivE function — SIGGRAPH Asia 2026 — 2026-10-12 — https://arxiv.org/abs/2610.17474
- FlowAvatar: Real-Time Full-Body Avatars from Sparse Egocentric Inputs on Consumer XR Devices — IEEE ISMAR 2026 — 2026-10-12 — https://arxiv.org/abs/2610.16277
- SplatXR: A Toolkit for Multi-Layered Extended Reality via On-Headset 3D Gaussian Splatting — UIST 2026 — 2026-10-19 — https://arxiv.org/abs/2610.26338
- V-JEPA Hand: Simple, Accurate and Fast 3D Hand and Camera Trajectory Recovery from Egocentric Videos — 预印本 — 2026-10-19 — https://arxiv.org/abs/2610.26780
- Bringing physics-based controller policies to virtual reality — 预印本 — 2026-10-19 — https://arxiv.org/abs/2610.26278
- GenXR-Bench: Benchmarking Coding Agents for Interactive XR Development — 预印本 — 2026-10-21 — https://arxiv.org/abs/2610.29014
- DomeGS: Perceptually Consistent Background Completion for Unbounded 3D Gaussian Splatting in Virtual Reality — 预印本 — 2026-10-27 — https://arxiv.org/abs/2610.37172

### 已核实但未收录的候选（可供下期参考）

- CompMVR（SIGGRAPH Asia 2026）— https://arxiv.org/abs/2610.32800
- EgoACT（NeurIPS 2026）— https://arxiv.org/abs/2610.27946
- WMEval — https://arxiv.org/abs/2610.33894
- GameVerse（NeurIPS 2026）— https://arxiv.org/abs/2610.37257
- Hy-Nomas（技术报告）— https://arxiv.org/abs/2610.36729
- HumanoidNDM（CoRL 2026）— https://arxiv.org/abs/2610.34126
- RiCo（刚体神经仿真）— https://arxiv.org/abs/2610.12333
- GraftRay — https://arxiv.org/abs/2610.37036
- Budgeted-GS — https://arxiv.org/abs/2610.03162
- SemEllipsoid（语义感知的椭球形状抽象，2026-10-30）— https://arxiv.org/abs/2610.42145
- Altered Visual Hand Feedback in VR（特发性震颤探索性研究，2026-10-30）— https://arxiv.org/abs/2610.41496

（2026-11-02 复查：arXiv API 中 cs.GR 在 10 月 30 日至 11 月 2 日只有上面两篇新提交，均未达到收录标准，所以本期实际覆盖到 10 月 29 日。）
