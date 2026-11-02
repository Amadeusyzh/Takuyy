
const currentUrl = window.location.href;
const siteUrl = "https://amadeusyzh.github.io";
let updatedUrl = currentUrl.replace("https://amadeusyzh.github.io/Takuyy", "");
if (currentUrl.length == updatedUrl.length && currentUrl.startsWith("http://127.0.0.1")) {
  const otherSiteUrl = siteUrl.replace("localhost", "127.0.0.1");
  updatedUrl = currentUrl.replace(otherSiteUrl + "/Takuyy", "");
}
if ("zh-cn".length > 0) {
  updatedUrl = updatedUrl.replace("/zh-cn", "");
}
// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-关于",
    title: "关于",
    section: "导航菜单",
    handler: () => {
      window.location.href = "/Takuyy/zh-cn/";
    },
  },{id: "nav-论文",
          title: "论文",
          description: "按时间倒序排列。* 表示共同第一作者。",
          section: "导航菜单",
          handler: () => {
            window.location.href = "/Takuyy/zh-cn/publications/";
          },
        },{id: "nav-博客",
          title: "博客",
          description: "研究笔记、论文阅读与学习记录。",
          section: "导航菜单",
          handler: () => {
            window.location.href = "/Takuyy/zh-cn/blog/";
          },
        },{id: "nav-简历",
          title: "简历",
          description: "点击右侧按钮下载 PDF 版本。",
          section: "导航菜单",
          handler: () => {
            window.location.href = "/Takuyy/zh-cn/cv/";
          },
        },{id: "post-论文速递-2026-年-10-11-月-图形学-引擎-神经渲染-世界模型-具身智能与-xr",
        
          title: "论文速递｜2026 年 10–11 月：图形学、引擎、神经渲染、世界模型、具身智能与 XR",
        
        description: "论文速递第 01 期：2026 年 10 月 1 日至 11 月 2 日首次发布的 42 篇经过核实的论文，分六个类别，每篇说明它做什么、怎么做、新在哪里，以及与计算机图形学的联系。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/paper-digest-01-2026-oct-nov/";
          
        },
      },{id: "post-学习路线-从计算机图形学到-3d-高斯泼溅-世界模型与具身智能",
        
          title: "学习路线：从计算机图形学到 3D 高斯泼溅、世界模型与具身智能",
        
        description: "这个博客的地图：五个系列加一个按日期更新的论文速递专栏，按顺序学习，以及每个阶段要掌握什么。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/roadmap-01-learning-roadmap/";
          
        },
      },{id: "post-具身智能遇上-xr-与-hci-作为数据-操作者与伙伴的人",
        
          title: "具身智能遇上 XR 与 HCI：作为数据、操作者与伙伴的人",
        
        description: "人体动作捕捉与可穿戴传感、第一人称数据（Ego4D、Project Aria）、用于机器人数据采集的 VR/AR 遥操作、人机交互、数字孪生与混合现实界面，以及具身智能、世界模型、AR/VR、HCI 与图形学交汇处的研究机会。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/";
          
        },
      },{id: "post-视觉-语言-动作模型-rt-2-openvla-pi0-gr00t-与-gemini-robotics",
        
          title: "视觉-语言-动作模型：RT-2、OpenVLA、pi0、GR00T 与 Gemini Robotics",
        
        description: "机器人基础模型是如何构建的：从 RT-1、RT-2 到 Octo、OpenVLA、pi0/pi0.5、GR00T N1 和 Gemini Robotics；动作分词与流匹配动作头、跨本体训练、评测，以及世界模型如何进入机器人学习。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/embodied-ai-05-vision-language-action-models/";
          
        },
      },{id: "post-模仿学习-行为克隆-dagger-act-与-diffusion-policy",
        
          title: "模仿学习：行为克隆、DAgger、ACT 与 Diffusion Policy",
        
        description: "从示范中学习机器人技能：协变量偏移与 DAgger、基于 Transformer 的动作分块（ACT/ALOHA）、Diffusion Policy、遥操作与 UMI 数据采集、大规模跨本体数据集，附一个可运行的扩散策略训练示例。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/embodied-ai-04-imitation-learning/";
          
        },
      },{id: "post-具身智能的仿真平台-mujoco-isaac-habitat-maniskill-genesis",
        
          title: "具身智能的仿真平台：MuJoCo、Isaac、Habitat、ManiSkill、Genesis",
        
        description: "机器人仿真器到底在计算什么（动力学、接触、渲染、传感器），当今主要平台与基准一览，可微与 GPU 并行仿真，以及一个上手的 MuJoCo/MJX 示例。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/embodied-ai-03-simulation-platforms/";
          
        },
      },{id: "post-面向机器人的强化学习-从-mdp-到-ppo-sac-与仿真到现实",
        
          title: "面向机器人的强化学习：从 MDP 到 PPO、SAC 与仿真到现实",
        
        description: "MDP、价值函数、策略梯度、PPO 与 SAC、奖励设计、域随机化，以及让仿真到现实 RL 成为主流的腿式运动成果，附一个紧凑的 PyTorch PPO 实现。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/";
          
        },
      },{id: "post-机器人学基础-位姿变换-运动学-控制与规划",
        
          title: "机器人学基础：位姿变换、运动学、控制与规划",
        
        description: "SE(3)、正/逆运动学、雅可比矩阵、动力学初探、PID 与阻抗控制、A*/RRT 规划，附三连杆机械臂的 NumPy 代码。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/embodied-ai-01-robotics-foundations/";
          
        },
      },{id: "post-预测-而非生成-jepa-世界模型的评估与开放问题",
        
          title: "预测，而非生成？JEPA、世界模型的评估与开放问题",
        
        description: "LeCun 的自主机器智能之路、I-JEPA、V-JEPA 与 V-JEPA 2，预测式与生成式之争，世界模型如何评估（物理、可控性、规划），以及通向具身智能的开放问题。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/world-models-05-jepa-evaluation-and-open-problems/";
          
        },
      },{id: "post-显式世界-3d-与-4d-世界生成",
        
          title: "显式世界：3D 与 4D 世界生成",
        
        description: "生成显式的 3D 与 4D 世界：分数蒸馏（DreamFusion、VSD）、多视角扩散、基于修复与深度的场景生长（Text2Room、LucidDreamer、WonderJourney、WonderWorld）、高斯场景生成、4D 生成、World Labs 的 Marble，以及与像素空间视频世界模型之间的权衡。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/world-models-04-3d-and-4d-world-generation/";
          
        },
      },{id: "post-视频生成即世界模拟-sora-genie-gamengen-及其后",
        
          title: "视频生成即世界模拟：Sora、Genie、GameNGen 及其后",
        
        description: "视频生成器如何成为可交互的世界模拟器：Sora 技术报告、Genie 1-3、GameNGen、UniSim、GAIA-1、NVIDIA Cosmos、潜在动作模型，以及记忆、一致性与物理方面的开放问题。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/world-models-03-video-world-simulators/";
          
        },
      },{id: "post-生成式工具箱-vae-tokenizer-transformer-扩散模型与流匹配",
        
          title: "生成式工具箱：VAE、tokenizer、Transformer、扩散模型与流匹配",
        
        description: "构成现代世界模型的生成模型：VAE 与 ELBO、VQ-VAE tokenizer、自回归 Transformer、DDPM、score/SDE 视角、DDIM、潜在扩散、无分类器引导、流匹配与 DiT，并附可运行的 PyTorch 代码。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/world-models-02-generative-modeling-foundations/";
          
        },
      },{id: "post-什么是世界模型-从-dyna-到-dreamer-与-muzero",
        
          title: "什么是世界模型？从 Dyna 到 Dreamer 与 MuZero",
        
        description: "世界模型的定义与发展历史：MDP、基于模型的强化学习、Ha &amp; Schmidhuber 的 World Models、PlaNet、Dreamer V1-V3 与 MuZero，并附带 PyTorch 实现的 RSSM 与想象推演。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/world-models-01-what-is-a-world-model/";
          
        },
      },{id: "post-ai-遇见图形引擎-神经渲染-生成式内容与神经游戏引擎",
        
          title: "AI 遇见图形引擎：神经渲染、生成式内容与神经游戏引擎",
        
        description: "截至 2026 年 11 月，神经网络在游戏引擎中辅助或取代了哪些部分：DLSS/FSR/XeSS 超分与帧生成、神经材质与纹理压缩、引擎中的高斯泼溅、生成式 3D 资产、编辑器中的 LLM 智能体、GameNGen 与 Genie 等神经游戏引擎，以及作为世界模型和机器人数据工厂的引擎。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-engine-06-ai-meets-graphics-engines/";
          
        },
      },{id: "post-物理与仿真引擎-从游戏物理到机器人模拟器",
        
          title: "物理与仿真引擎：从游戏物理到机器人模拟器",
        
        description: "拆开物理引擎的一步：粗测阶段、GJK 与 EPA、接触流形、PGS/TGS/soft step/XPBD 求解器、关节体；再看 Isaac、MuJoCo、Newton、Genesis 如何把引擎变成机器人模拟器，以及 OpenUSD 与域随机化。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-engine-05-physics-and-simulation-engines/";
          
        },
      },{id: "post-走进生产级引擎-unreal-engine-5-unity-6-godot-4-bevy-及其他",
        
          title: "走进生产级引擎：Unreal Engine 5、Unity 6、Godot 4、Bevy 及其他",
        
        description: "现代引擎如何解决那些最难的问题：Nanite 的簇层级与 LOD 切割、Lumen 的表面缓存与距离场追踪、虚拟阴影贴图、时间上采样、Unity 的渲染图与 GPU Resident Drawer、Godot 的 RenderingDevice、Bevy 的提取阶段，以及如何阅读它们的源码。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-engine-04-inside-production-engines/";
          
        },
      },{id: "post-动手实现一个迷你引擎-浏览器中的-webgpu-gltf-pbr-阴影与-ecs",
        
          title: "动手实现一个迷你引擎：浏览器中的 WebGPU、glTF、PBR、阴影与 ECS",
        
        description: "一篇动手教程：用 JavaScript 和 WGSL 写出一个小而完整的真实引擎，包含固定时间步长循环、资源管理器、glTF 2.0 加载器、轨道相机、PBR 着色器、阴影贴图、极简 ECS、渲染通道列表、GPU 时间戳和调试界面，并附 Vulkan/C++ 与 Rust/wgpu 的对照说明。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-engine-03-build-a-mini-engine/";
          
        },
      },{id: "post-现代-gpu-api-与渲染图",
        
          title: "现代 GPU API 与渲染图",
        
        description: "引擎如何与 GPU 打交道：显式 API（Vulkan、D3D12、Metal、WebGPU）、内存与同步、一个最小的 WebGPU 程序、带可运行玩具编译器的渲染图、前向/延迟/分簇光照、可见性缓冲、带 HZB 剔除和 meshlet 的 GPU 驱动渲染，以及 GPU 调试。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/";
          
        },
      },{id: "post-游戏引擎解剖-主循环-数据-ecs-任务系统与工具",
        
          title: "游戏引擎解剖：主循环、数据、ECS、任务系统与工具",
        
        description: "游戏引擎由什么构成：分层架构、游戏主循环与固定时间步长、帧预算、面向数据设计、ECS、场景图与空间结构、任务系统以及资产管线，配有可运行代码和实测图。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-engine-01-anatomy-of-an-engine/";
          
        },
      },{id: "post-从手机拍摄到-vr-3d-高斯泼溅动手实践教程",
        
          title: "从手机拍摄到 VR：3D 高斯泼溅动手实践教程",
        
        description: "一套实用的分步工作流：拍摄照片或视频，运行 COLMAP，用官方代码、gsplat 或 nerfstudio splatfacto 训练 3DGS，清理并导出 .ply，再在网页和 VR 头显中查看，并附常见失败模式及其解决方法。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/neural-rendering-06-capture-to-vr-tutorial/";
          
        },
      },{id: "post-超越-3dgs-高斯泼溅前沿地图",
        
          title: "超越 3DGS：高斯泼溅前沿地图",
        
        description: "对 3D 高斯泼溅之后各方向的结构化综述：抗锯齿、表面、动态场景、压缩、SLAM、前馈重建、生成、重光照、物理、语义以及 AR/VR，给出每个方向的核心思想与代表性论文。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/neural-rendering-05-3dgs-frontiers/";
          
        },
      },{id: "post-3d-高斯泼溅完全解析",
        
          title: "3D 高斯泼溅完全解析",
        
        description: "完整的 3DGS 方法：高斯参数、由旋转与缩放构造协方差、基于雅可比矩阵的 EWA 投影、0.3 低通滤波、基于图块的可微光栅化、α 混合与梯度、自适应密度控制以及训练配方，附 Python 代码。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/neural-rendering-04-3d-gaussian-splatting/";
          
        },
      },{id: "post-快速辐射场-网格-张量与哈希编码",
        
          title: "快速辐射场：网格、张量与哈希编码",
        
        description: "NeRF 为什么慢，显式与混合表示又是如何解决这一问题的：Plenoxels、DVGO、TensoRF、Instant-NGP 的多分辨率哈希编码（附 PyTorch 代码）、Zip-NeRF 以及 nerfstudio 工具箱。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/neural-rendering-03-fast-radiance-fields/";
          
        },
      },{id: "post-nerf-神经辐射场与可微体渲染",
        
          title: "NeRF：神经辐射场与可微体渲染",
        
        description: "体渲染方程及其数值求积、位置编码、NeRF 的 MLP、分层采样与光度损失，附一个最小的 PyTorch NeRF 实现，以及后续工作 Mip-NeRF、Mip-NeRF 360 和 NeRF in the Wild。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/neural-rendering-02-nerf/";
          
        },
      },{id: "post-相机与多视图几何-从像素到位姿",
        
          title: "相机与多视图几何：从像素到位姿",
        
        description: "针孔相机、内参与外参、镜头畸变、对极几何、八点算法、三角化、光束法平差、基于 COLMAP 的运动恢复结构以及多视图立体，附 NumPy 代码。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/";
          
        },
      },{id: "post-2026-年图形学研究前沿-siggraph-siggraph-asia-与最新预印本在做什么",
        
          title: "2026 年图形学研究前沿：SIGGRAPH、SIGGRAPH Asia 与最新预印本在做什么",
        
        description: "按主题梳理、逐条核实的 2026 年图形学研究地图（SIGGRAPH 2026、SIGGRAPH Asia 2026、EGSR、I3D、SCA 与 arXiv 预印本），附四个反复出现的思想背后的数学，以及一个交互式浏览器。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-13-research-frontiers-2026/";
          
        },
      },{id: "post-可微渲染与逆向渲染-穿过像素的梯度",
        
          title: "可微渲染与逆向渲染：穿过像素的梯度",
        
        description: "为什么图像的梯度很难求（可见性会产生狄拉克 δ），软光栅化器、nvdiffrast、边缘采样、重参数化与路径空间方法如何解决这个问题，Mitsuba 3，逆向渲染的实践，以及三个可以运行的 PyTorch 实验。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-12-differentiable-and-inverse-rendering/";
          
        },
      },{id: "post-实时渲染技术-g-buffer-软阴影-ao-反射-实时全局光照与色调映射",
        
          title: "实时渲染技术：G-buffer、软阴影、AO、反射、实时全局光照与色调映射",
        
        description: "16 ms 一帧背后的算法：延迟着色与八面体法线编码、分簇光源剔除、级联与软阴影（PCSS、VSM、EVSM）、SSAO/HBAO/GTAO 及其地平线积分、Hi-Z 屏幕空间反射、光照贴图、SH 辐照度探针、DDGI 与体素锥追踪、时间域历史校正、HDR 色调映射与 sRGB 曲线，以及如何思考 GPU 性能。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-11-real-time-rendering-techniques/";
          
        },
      },{id: "post-体积与参与介质-雾-烟-云-天空与皮肤",
        
          title: "体积与参与介质：雾、烟、云、天空与皮肤",
        
        description: "消光系数与反照率、Beer-Lambert 透射率、辐射传输方程、相函数及其采样代码、光线步进、delta 与 ratio tracking、体积路径追踪、OpenVDB、实时雾/天空/云、次表面散射，以及为什么 NeRF 的 alpha 合成就是同一积分的数值求积。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-10-volumes-and-participating-media/";
          
        },
      },{id: "post-动画与角色-样条-旋转-蒙皮-ik-运动匹配与学习型运动",
        
          title: "动画与角色：样条、旋转、蒙皮、IK、运动匹配与学习型运动",
        
        description: "关键帧样条与弧长、slerp 与 squad、骨架与正向运动学、线性混合蒙皮与对偶四元数蒙皮、混合形状、CCD 与 FABRIK、动作捕捉与 SMPL、运动匹配、用强化学习训练的物理角色，以及生成式运动，配有 NumPy 代码。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-09-animation-and-characters/";
          
        },
      },{id: "post-几何处理-网格-曲率-平滑-细分与重建",
        
          title: "几何处理：网格、曲率、平滑、细分与重建",
        
        description: "网格表示与半边结构、用余切拉普拉斯计算离散曲率、平滑、Loop 细分、QEM 简化、Tutte 参数化、Marching Squares 与 Marching Cubes，以及泊松重建，全部用 NumPy 实现。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-08-geometry-processing/";
          
        },
      },{id: "post-基于物理的模拟-粒子-布料-pbd-与-xpbd",
        
          title: "基于物理的模拟：粒子、布料、PBD 与 XPBD",
        
        description: "时间积分器、质点-弹簧布料、基于位置的动力学（PBD）以及 XPBD 的完整推导，附 NumPy 布料求解器，并概览刚体与粒子流体。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-07-physically-based-simulation/";
          
        },
      },{id: "post-实时光线追踪-rt-硬件-降噪-restir-与神经缓存",
        
          title: "实时光线追踪：RT 硬件、降噪、ReSTIR 与神经缓存",
        
        description: "游戏如何在每像素一个样本下做路径追踪：加速结构与 RT Core、混合管线、时间复用、à-trous/SVGF 降噪、ReSTIR 重采样、TAA、DLSS 与神经辐射缓存。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-06-real-time-ray-tracing/";
          
        },
      },{id: "post-光线追踪与路径追踪-从求交到无偏全局光照",
        
          title: "光线追踪与路径追踪：从求交到无偏全局光照",
        
        description: "光线-球体求交与 Möller-Trumbore 算法、基于 SAH 的 BVH、蒙特卡洛积分、重要性采样、俄罗斯轮盘赌、次事件估计与多重重要性采样，最后实现一个紧凑的 NumPy 路径追踪器。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-05-ray-and-path-tracing/";
          
        },
      },{id: "post-基于物理的渲染-辐射度量学-渲染方程与-ggx",
        
          title: "基于物理的渲染：辐射度量学、渲染方程与 GGX",
        
        description: "从瓦特到辐亮度，渲染方程、BRDF 的性质、GGX 微表面模型、金属度-粗糙度工作流与 split-sum 基于图像的光照，并配有数值验证和 GLSL 着色器。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-04-physically-based-rendering/";
          
        },
      },{id: "post-着色与纹理-光照模型-法线贴图-纹理过滤与阴影",
        
          title: "着色与纹理：光照模型、法线贴图、纹理过滤与阴影",
        
        description: "Lambert、Phong 与 Blinn-Phong，平面/Gouraud/Phong 着色，UV 与切线空间，Mipmap 与各向异性过滤，以及带偏移和 PCF 的阴影映射，附 NumPy 与 GLSL 代码。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-03-shading-and-textures/";
          
        },
      },{id: "post-光栅化-从三角形到像素",
        
          title: "光栅化：从三角形到像素",
        
        description: "MVP 管线、逐步推导透视投影矩阵、裁剪、边函数、透视校正插值、z-buffer 与抗锯齿，并用 NumPy 实现一个完整的软件光栅化器。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-02-rasterization/";
          
        },
      },{id: "post-图形学路线图与数学工具箱",
        
          title: "图形学路线图与数学工具箱",
        
        description: "计算机图形学从这里一路通向神经渲染的路线，以及你首先需要的线性代数：向量、齐次坐标、旋转、坐标空间与法线变换。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-01-roadmap-and-math/";
          
        },
      },{id: "post-你好-世界",
        
          title: "你好，世界",
        
        description: "个人网站上线了。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/hello-world/";
          
        },
      },{id: "news-个人网站上线了-欢迎看看我的博客",
          title: '个人网站上线了，欢迎看看我的博客。',
          description: "",
          section: "动态",},{
        id: 'social-cv',
        title: 'CV',
        section: '社交账号',
        handler: () => {
          window.open("/Takuyy/assets/pdf/zh-cn//assets/pdf/[LANG]/cv.pdf", "_blank");
        },
      },{
        id: 'social-github',
        title: 'GitHub',
        section: '社交账号',
        handler: () => {
          window.open("https://github.com/Amadeusyzh", "_blank");
        },
      },{
        id: 'social-rss',
        title: 'RSS Feed',
        section: '社交账号',
        handler: () => {
          window.open("/Takuyy/feed.xml", "_blank");
        },
      },{
        id: 'social-scholar',
        title: 'Google Scholar',
        section: '社交账号',
        handler: () => {
          window.open("https://scholar.google.com/citations?user=8wyZlsEAAAAJ", "_blank");
        },
      },{
          id: 'lang-en-us',
          title: 'en-us',
          section: '语言',
          handler: () => {
            window.location.href = "/Takuyy" + updatedUrl;
          },
        },{
          id: 'lang-ja-jp',
          title: 'ja-jp',
          section: '语言',
          handler: () => {
            window.location.href = "/Takuyy/ja-jp" + updatedUrl;
          },
        },{
      id: 'light-theme',
      title: '浅色主题',
      description: '切换为浅色主题',
      section: '主题',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: '深色主题',
      description: '切换为深色主题',
      section: '主题',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: '系统默认主题',
      description: '跟随系统主题',
      section: '主题',
      handler: () => {
        setThemeSetting("system");
      },
    },];
