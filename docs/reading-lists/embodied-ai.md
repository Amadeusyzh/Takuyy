# 具身智能（Embodied AI）阅读清单

对应博客系列 `embodied-ai`（6 篇）。按学习阶段组织：每个阶段先读带 ★ 的论文，再按兴趣扩展。
链接均已核对（arXiv / DOI / 官方页面）；无法确认链接的条目只给出处，不给链接。

- 第 1 篇：机器人学基础 → 阶段 1
- 第 2 篇：面向机器人的强化学习 → 阶段 2
- 第 3 篇：仿真平台 → 阶段 3
- 第 4 篇：模仿学习 → 阶段 4
- 第 5 篇：视觉-语言-动作模型 → 阶段 5、6
- 第 6 篇：具身智能 × XR 与 HCI → 阶段 7

---

## 阶段 1：机器人学基础（位姿、运动学、控制、规划）

| 论文 | 会议/期刊 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| A Kinematic Notation for Lower-Pair Mechanisms Based on Matrices（Denavit & Hartenberg） | J. Applied Mechanics | 1955 | [DOI](https://doi.org/10.1115/1.4011045) | DH 参数约定的出处 |
| A Formal Basis for the Heuristic Determination of Minimum Cost Paths（Hart, Nilsson, Raphael） | IEEE Trans. SSC | 1968 | [DOI](https://doi.org/10.1109/TSSC.1968.300136) | A* 搜索 |
| ★ Impedance Control: An Approach to Manipulation, Part I（Hogan） | J. Dyn. Sys., Meas., Control | 1985 | [DOI](https://doi.org/10.1115/1.3140702) | 阻抗控制，接触任务与学习策略的底层接口 |
| Inverse Kinematic Solutions with Singularity Robustness for Robot Manipulator Control（Nakamura & Hanafusa） | J. Dyn. Sys., Meas., Control | 1986 | — | 阻尼最小二乘（奇异鲁棒）IK |
| ★ A Unified Approach for Motion and Force Control of Robot Manipulators: The Operational Space Formulation（Khatib） | IEEE J. Robotics and Automation | 1987 | [DOI](https://doi.org/10.1109/JRA.1987.1087068) | 操作空间控制 |
| Probabilistic Roadmaps for Path Planning in High-Dimensional Configuration Spaces（Kavraki et al.） | IEEE Trans. Robotics and Automation | 1996 | [DOI](https://doi.org/10.1109/70.508439) | PRM |
| Rapidly-Exploring Random Trees: A New Tool for Path Planning（LaValle） | Tech. report, Iowa State | 1998 | — | RRT |
| ★ Sampling-based Algorithms for Optimal Motion Planning（Karaman & Frazzoli） | IJRR | 2011 | [arXiv](https://arxiv.org/abs/1105.1186) | RRT*/PRM*，渐近最优 |
| Finding Locally Optimal, Collision-Free Trajectories with Sequential Convex Optimization（Schulman et al.） | RSS | 2013 | [PDF](https://www.roboticsproceedings.org/rss09/p31.pdf) | TrajOpt 轨迹优化 |
| On the Continuity of Rotation Representations in Neural Networks（Zhou et al.） | CVPR | 2019 | [arXiv](https://arxiv.org/abs/1812.07035) | 6D 旋转表示，网络预测位姿的首选 |

**书与课程**

- ★ K. Lynch & F. Park, *Modern Robotics*（免费 PDF + 视频 + 代码）：https://hades.mech.northwestern.edu/index.php/Modern_Robotics
- R. Tedrake, *Robotic Manipulation*：https://manipulation.csail.mit.edu ；*Underactuated Robotics*：https://underactuated.csail.mit.edu
- S. LaValle, *Planning Algorithms*（免费）：https://lavalle.pl/planning/
- R. Featherstone, *Rigid Body Dynamics Algorithms*（Springer, 2008）
- Siciliano et al., *Robotics: Modelling, Planning and Control*（Springer, 2009）

**代码**：Pinocchio（https://github.com/stack-of-tasks/pinocchio）、Drake（https://drake.mit.edu）、OMPL（https://ompl.kavrakilab.org）、
Robotics Toolbox for Python（https://github.com/petercorke/robotics-toolbox-python）

---

## 阶段 2：强化学习与仿真到现实

| 论文 | 会议/期刊 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| Human-level Control through Deep Reinforcement Learning（Mnih et al.） | Nature | 2015 | [DOI](https://doi.org/10.1038/nature14236) | DQN |
| Trust Region Policy Optimization（Schulman et al.） | ICML | 2015 | [arXiv](https://arxiv.org/abs/1502.05477) | TRPO |
| ★ High-Dimensional Continuous Control Using Generalized Advantage Estimation（Schulman et al.） | ICLR | 2016 | [arXiv](https://arxiv.org/abs/1506.02438) | GAE |
| End-to-End Training of Deep Visuomotor Policies（Levine et al.） | JMLR | 2016 | [arXiv](https://arxiv.org/abs/1504.00702) | 从像素到力矩 |
| ★ Proximal Policy Optimization Algorithms（Schulman et al.） | arXiv | 2017 | [arXiv](https://arxiv.org/abs/1707.06347) | PPO，大规模并行仿真的默认算法 |
| ★ Domain Randomization for Transferring Deep Neural Networks from Simulation to the Real World（Tobin et al.） | IROS | 2017 | [arXiv](https://arxiv.org/abs/1703.06907) | 视觉域随机化 |
| Sim-to-Real Transfer of Robotic Control with Dynamics Randomization（Peng et al.） | ICRA | 2018 | [arXiv](https://arxiv.org/abs/1710.06537) | 动力学随机化 |
| Asymmetric Actor Critic for Image-Based Robot Learning（Pinto et al.） | RSS | 2018 | [arXiv](https://arxiv.org/abs/1710.06542) | 特权评论家 |
| ★ Soft Actor-Critic: Off-Policy Maximum Entropy Deep RL with a Stochastic Actor（Haarnoja et al.） | ICML | 2018 | [arXiv](https://arxiv.org/abs/1801.01290) | SAC |
| Soft Actor-Critic Algorithms and Applications（Haarnoja et al.） | arXiv | 2018 | [arXiv](https://arxiv.org/abs/1812.05905) | 自动温度，真实 Minitaur 约两小时学会行走 |
| DeepMimic: Example-Guided Deep RL of Physics-Based Character Skills（Peng et al.） | ACM TOG (SIGGRAPH) | 2018 | [arXiv](https://arxiv.org/abs/1804.02717) | 动作模仿奖励，图形学与 RL 的桥梁 |
| Learning Dexterous In-Hand Manipulation（OpenAI et al.） | IJRR | 2020 | [arXiv](https://arxiv.org/abs/1808.00177) | 灵巧手 + 大范围域随机化 |
| Solving Rubik's Cube with a Robot Hand（OpenAI et al.） | arXiv | 2019 | [arXiv](https://arxiv.org/abs/1910.07113) | 自动域随机化（ADR） |
| ★ Learning Agile and Dynamic Motor Skills for Legged Robots（Hwangbo et al.） | Science Robotics | 2019 | [DOI](https://doi.org/10.1126/scirobotics.aau5872) | 执行器网络 + ANYmal 仿真到现实 |
| ★ Learning Quadrupedal Locomotion over Challenging Terrain（Lee et al.） | Science Robotics | 2020 | [DOI](https://doi.org/10.1126/scirobotics.abc5986) | 教师-学生蒸馏 |
| RMA: Rapid Motor Adaptation for Legged Robots（Kumar et al.） | RSS | 2021 | [arXiv](https://arxiv.org/abs/2107.04034) | 在线自适应 |
| ★ Learning to Walk in Minutes Using Massively Parallel Deep RL（Rudin et al.） | CoRL | 2021 | [arXiv](https://arxiv.org/abs/2109.11978) | legged_gym，GPU 并行 PPO |
| Learning Robust Perceptive Locomotion for Quadrupedal Robots in the Wild（Miki et al.） | Science Robotics | 2022 | [arXiv](https://arxiv.org/abs/2201.08117) | 外部感知 + 本体感觉融合 |
| Champion-Level Drone Racing Using Deep Reinforcement Learning（Kaufmann et al.） | Nature | 2023 | [DOI](https://doi.org/10.1038/s41586-023-06419-4) | RL 击败人类冠军 |
| Eureka: Human-Level Reward Design via Coding Large Language Models（Ma et al.） | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2310.12931) | LLM 写奖励 |
| Real-World Humanoid Locomotion with Reinforcement Learning（Radosavovic et al.） | Science Robotics | 2024 | [arXiv](https://arxiv.org/abs/2303.03381) | 人形机器人 Transformer 策略 |

**书与课程**：★ Sutton & Barto, *Reinforcement Learning: An Introduction*（http://incompleteideas.net/book/the-book-2nd.html）；
★ OpenAI Spinning Up（https://spinningup.openai.com）；UC Berkeley CS 285（Sergey Levine）

**代码**：CleanRL（https://github.com/vwxyzjn/cleanrl）、Stable-Baselines3（https://github.com/DLR-RM/stable-baselines3）、
legged_gym（https://github.com/leggedrobotics/legged_gym）、rsl_rl（https://github.com/leggedrobotics/rsl_rl）

---

## 阶段 3：仿真平台、可微仿真与基准

| 论文 | 会议/期刊 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| ★ MuJoCo: A Physics Engine for Model-Based Control（Todorov, Erez, Tassa） | IROS | 2012 | [DOI](https://doi.org/10.1109/IROS.2012.6386109) | MuJoCo |
| Convex and Analytically-Invertible Dynamics with Contacts and Constraints: Theory and Implementation in MuJoCo（Todorov） | ICRA | 2014 | [DOI](https://doi.org/10.1109/ICRA.2014.6907751) | 凸软接触模型 |
| ★ XPBD: Position-Based Simulation of Compliant Constrained Dynamics（Macklin, Müller, Chentanez） | MIG | 2016 | [DOI](https://doi.org/10.1145/2994258.2994272) | 主页布料演示所用方法 |
| AI2-THOR: An Interactive 3D Environment for Visual AI（Kolve et al.） | arXiv | 2017 | [arXiv](https://arxiv.org/abs/1712.05474) | 早期可交互室内环境 |
| ★ Habitat: A Platform for Embodied AI Research（Savva et al.） | ICCV | 2019 | [arXiv](https://arxiv.org/abs/1904.01201) | 高速照片级具身仿真 |
| Meta-World（Yu et al.） | CoRL | 2019 | [arXiv](https://arxiv.org/abs/1910.10897) | 50 个桌面任务 |
| DiffTaichi: Differentiable Programming for Physical Simulation（Hu et al.） | ICLR | 2020 | [arXiv](https://arxiv.org/abs/1910.00935) | 可微仿真语言 |
| SAPIEN: A SimulAted Part-based Interactive ENvironment（Xiang et al.） | CVPR | 2020 | [arXiv](https://arxiv.org/abs/2003.08515) | 铰接物体 |
| RLBench（James et al.） | RA-L | 2020 | [arXiv](https://arxiv.org/abs/1909.12271) | 100 个带示范的任务 |
| robosuite（Zhu et al.） | arXiv | 2020 | [arXiv](https://arxiv.org/abs/2009.12293) | 模块化操作框架 |
| ★ Isaac Gym: High Performance GPU-Based Physics Simulation for Robot Learning（Makoviychuk et al.） | NeurIPS D&B | 2021 | [arXiv](https://arxiv.org/abs/2108.10470) | 端到端 GPU 仿真 |
| Brax（Freeman et al.） | NeurIPS D&B | 2021 | [arXiv](https://arxiv.org/abs/2106.13281) | JAX 可微物理 |
| Habitat 2.0（Szot et al.） | NeurIPS | 2021 | [arXiv](https://arxiv.org/abs/2106.14405) | 家庭重排 |
| CALVIN（Mees et al.） | RA-L | 2022 | [arXiv](https://arxiv.org/abs/2112.03227) | 长时程语言条件操作 |
| Accelerated Policy Learning with Parallel Differentiable Simulation（SHAC, Xu et al.） | ICLR | 2022 | [arXiv](https://arxiv.org/abs/2204.07137) | 可微仿真 + 截断 + 评论家 |
| BEHAVIOR-1K（Li et al.） | CoRL | 2022 | — | 1000 种家庭活动（CoRL 版本见 PMLR 205；2024 扩展版另有 arXiv 2403.09227） |
| ManiSkill2（Gu et al.） | ICLR | 2023 | [arXiv](https://arxiv.org/abs/2302.04659) | 可泛化操作基准 |
| Orbit（Mittal et al.） | RA-L | 2023 | [arXiv](https://arxiv.org/abs/2301.04195) | Isaac Lab 前身 |
| ★ LIBERO（Liu et al.） | NeurIPS D&B | 2023 | [arXiv](https://arxiv.org/abs/2306.03310) | VLA 微调评测的标准 |
| Habitat 3.0（Puig et al.） | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2310.13724) | 人、化身与机器人 |
| ★ Evaluating Real-World Robot Manipulation Policies in Simulation（SimplerEnv, Li et al.） | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2405.05941) | 仿真-现实相关性 |
| ManiSkill3（Tao et al.） | RSS (demo) | 2025 | [arXiv](https://arxiv.org/abs/2410.00425) | GPU 并行仿真 + 渲染 |
| MuJoCo Playground（Zakka et al.） | RSS (demo) | 2025 | [arXiv](https://arxiv.org/abs/2502.08844) | MJX 环境与 sim2real 配方 |
| Isaac Lab: A GPU-Accelerated Simulation Framework for Multi-Modal Robot Learning（Mittal et al.） | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2511.04831) | Isaac Lab 设计 |

**文档与代码**：MuJoCo 文档（https://mujoco.readthedocs.io ，含 MJX、Python 绑定）、MuJoCo Menagerie（https://github.com/google-deepmind/mujoco_menagerie）、
MuJoCo Warp（https://github.com/google-deepmind/mujoco_warp）、Isaac Lab（https://github.com/isaac-sim/IsaacLab）、
ManiSkill（https://github.com/haosulab/ManiSkill）、Habitat-Lab（https://github.com/facebookresearch/habitat-lab）、
Genesis（https://genesis-embodied-ai.github.io）、Newton（https://github.com/newton-physics/newton）

**接触力学补充**：D. Stewart, "Rigid-body dynamics with friction and impact", SIAM Review 2000（互补问题视角）

---

## 阶段 4：模仿学习与数据

| 论文 | 会议/期刊 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| ALVINN: An Autonomous Land Vehicle in a Neural Network（Pomerleau） | NeurIPS | 1988 | [Paper](https://proceedings.neurips.cc/paper/1988/hash/812b4ba287f5ee0bc9d43bbf5bbe87fb-Abstract.html) | 最早的神经网络行为克隆 |
| ★ A Reduction of Imitation Learning and Structured Prediction to No-Regret Online Learning（DAgger, Ross et al.） | AISTATS | 2011 | [arXiv](https://arxiv.org/abs/1011.0686) | 协变量偏移与 DAgger |
| Generative Adversarial Imitation Learning（Ho & Ermon） | NeurIPS | 2016 | [arXiv](https://arxiv.org/abs/1606.03476) | GAIL |
| Denoising Diffusion Probabilistic Models（Ho et al.） | NeurIPS | 2020 | [arXiv](https://arxiv.org/abs/2006.11239) | DDPM |
| What Matters in Learning from Offline Human Demonstrations for Robot Manipulation（robomimic, Mandlekar et al.） | CoRL | 2021 | [arXiv](https://arxiv.org/abs/2108.03298) | 细致的 BC 实证研究 |
| Implicit Behavioral Cloning（Florence et al.） | CoRL | 2021 | [arXiv](https://arxiv.org/abs/2109.00137) | 能量模型策略 |
| Behavior Transformers: Cloning k Modes with One Stone（Shafiullah et al.） | NeurIPS | 2022 | [arXiv](https://arxiv.org/abs/2206.11251) | 离散化多模态动作 |
| Flow Matching for Generative Modeling（Lipman et al.） | ICLR | 2023 | [arXiv](https://arxiv.org/abs/2210.02747) | 流匹配（pi0 动作头的基础） |
| ★ Learning Fine-Grained Bimanual Manipulation with Low-Cost Hardware（ACT/ALOHA, Zhao et al.） | RSS | 2023 | [arXiv](https://arxiv.org/abs/2304.13705) | 动作分块 + 时间集成 |
| ★ Diffusion Policy: Visuomotor Policy Learning via Action Diffusion（Chi et al.） | RSS | 2023 | [arXiv](https://arxiv.org/abs/2303.04137) | 扩散动作头（扩展版 IJRR 2024） |
| BridgeData V2（Walke et al.） | CoRL | 2023 | [arXiv](https://arxiv.org/abs/2308.12952) | WidowX 多环境数据 |
| ★ Open X-Embodiment: Robotic Learning Datasets and RT-X Models | ICRA | 2024 | [arXiv](https://arxiv.org/abs/2310.08864) | 22 种机器人、21 家机构 |
| ★ Universal Manipulation Interface（UMI, Chi et al.） | RSS | 2024 | [arXiv](https://arxiv.org/abs/2402.10329) | 手持夹爪采集野外数据 |
| DROID: A Large-Scale In-The-Wild Robot Manipulation Dataset（Khazatsky et al.） | RSS | 2024 | [arXiv](https://arxiv.org/abs/2403.12945) | 7.6 万条轨迹，564 个场景 |
| 3D Diffusion Policy（Ze et al.） | RSS | 2024 | [arXiv](https://arxiv.org/abs/2403.03954) | 点云条件 |
| Mobile ALOHA（Fu, Zhao, Finn） | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2401.02117) | 移动双臂 + 联合训练 |
| ALOHA Unleashed（Zhao et al.） | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2410.13126) | 扩大双臂灵巧数据规模 |

**代码与资源**：★ LeRobot（https://github.com/huggingface/lerobot）、Diffusion Policy（https://diffusion-policy.cs.columbia.edu/）、
ACT（https://github.com/tonyzhaozh/act）、UMI（https://umi-gripper.github.io）、robomimic（https://robomimic.github.io）

---

## 阶段 5：视觉-语言-动作模型（VLA）

| 论文 | 会议/期刊 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| Do As I Can, Not As I Say（SayCan, Ahn et al.） | CoRL | 2022 | [arXiv](https://arxiv.org/abs/2204.01691) | LLM 规划 + 价值函数落地 |
| A Generalist Agent（Gato, Reed et al.） | TMLR | 2022 | [arXiv](https://arxiv.org/abs/2205.06175) | 单一 Transformer 多任务 |
| ★ RT-1: Robotics Transformer for Real-World Control at Scale（Brohan et al.） | RSS | 2023 | [arXiv](https://arxiv.org/abs/2212.06817) | 13 万回合、700+ 任务 |
| VIMA: Robot Manipulation with Multimodal Prompts（Jiang et al.） | ICML | 2023 | [arXiv](https://arxiv.org/abs/2210.03094) | 多模态提示 |
| PaLM-E: An Embodied Multimodal Language Model（Driess et al.） | ICML | 2023 | [arXiv](https://arxiv.org/abs/2303.03378) | 传感器 token 注入 LLM |
| ★ RT-2: Vision-Language-Action Models Transfer Web Knowledge to Robotic Control（Brohan et al.） | CoRL | 2023 | [arXiv](https://arxiv.org/abs/2307.15818) | 第一个 VLA，动作即文本 token |
| RoboCat（Bousmalis et al.） | TMLR | 2023 | [arXiv](https://arxiv.org/abs/2306.11706) | 跨本体自我改进 |
| ★ Octo: An Open-Source Generalist Robot Policy | RSS | 2024 | [arXiv](https://arxiv.org/abs/2405.12213) | 开放通用策略，扩散头 |
| ★ OpenVLA: An Open-Source Vision-Language-Action Model（Kim et al.） | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2406.09246) | 开放 7B VLA |
| RDT-1B: A Diffusion Foundation Model for Bimanual Manipulation（Liu et al.） | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2410.07864) | 扩散 Transformer VLA |
| ★ π0: A Vision-Language-Action Flow Model for General Robot Control（Black et al.） | RSS | 2025 | [arXiv](https://arxiv.org/abs/2410.24164) | 流匹配动作专家 |
| FAST: Efficient Action Tokenization for Vision-Language-Action Models（Pertsch et al.） | RSS | 2025 | [arXiv](https://arxiv.org/abs/2501.09747) | DCT + BPE 动作分词 |
| Fine-Tuning Vision-Language-Action Models: Optimizing Speed and Success（OpenVLA-OFT, Kim et al.） | RSS | 2025 | [arXiv](https://arxiv.org/abs/2502.19645) | 更好的微调配方 |
| GR00T N1: An Open Foundation Model for Generalist Humanoid Robots（NVIDIA） | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2503.14734) | 双系统，人形机器人 |
| Gemini Robotics: Bringing AI into the Physical World | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2503.20020) | Gemini 2.0 VLA + ER 模型 |
| ★ π0.5: A Vision-Language-Action Model with Open-World Generalization | CoRL | 2025 | [arXiv](https://arxiv.org/abs/2504.16054) | 异构数据联合训练，进入陌生家庭 |
| SmolVLA（Shukor et al.） | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2506.01844) | 小型开放 VLA |
| Gemini Robotics 1.5 | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2510.03342) | 先思考再行动，运动迁移 |

**代码**：OpenVLA（https://github.com/openvla/openvla）、openpi（https://github.com/Physical-Intelligence/openpi）、
Octo（https://github.com/octo-models/octo）、Isaac GR00T（https://github.com/NVIDIA/Isaac-GR00T）、
Open X-Embodiment（https://robotics-transformer-x.github.io）

**课程**：Stanford CS 224R、CMU 16-831

---

## 阶段 6：世界模型 × 机器人学习

| 论文 | 会议/期刊 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| ★ DayDreamer: World Models for Physical Robot Learning（Wu et al.） | CoRL | 2022 | [arXiv](https://arxiv.org/abs/2206.14176) | 真实机器人上的 Dreamer |
| Video PreTraining (VPT)（Baker et al.） | NeurIPS | 2022 | [arXiv](https://arxiv.org/abs/2206.11795) | 用逆动力学给无标签视频打动作标签 |
| Mastering Diverse Domains through World Models（DreamerV3, Hafner et al.） | Nature 2025（期刊版题为 *Mastering diverse control tasks through world models*） | 2023/2025 | [arXiv](https://arxiv.org/abs/2301.04104) | 通用世界模型 RL |
| ★ Learning Universal Policies via Text-Guided Video Generation（UniPi, Du et al.） | NeurIPS | 2023 | [arXiv](https://arxiv.org/abs/2302.00111) | 视频生成即规划 |
| ★ Learning Interactive Real-World Simulators（UniSim, Yang et al.） | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2310.06114) | 动作条件视频仿真器 |
| Unleashing Large-Scale Video Generative Pre-training for Visual Robot Manipulation（GR-1, Wu et al.） | ICLR | 2024 | [arXiv](https://arxiv.org/abs/2312.13139) | 视频预训练 → 动作 |
| Genie: Generative Interactive Environments（Bruce et al.） | ICML | 2024 | [arXiv](https://arxiv.org/abs/2402.15391) | 从视频学潜在动作 |
| Cosmos World Foundation Model Platform for Physical AI（NVIDIA） | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2501.03575) | 面向物理 AI 的世界基础模型 |
| ★ V-JEPA 2: Self-Supervised Video Models Enable Understanding, Prediction and Planning（Assran et al.） | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2506.09985) | 隐空间规划，零样本抓放 |

（视频世界模型、JEPA 与评测的完整清单见 `docs/reading-lists/world-models.md`。）

---

## 阶段 7：具身智能 × XR / HCI / 图形学

| 论文 | 会议/期刊 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| 1€ Filter: A Simple Speed-Based Low-Pass Filter for Noisy Input in Interactive Systems（Casiez, Roussel, Vogel） | CHI | 2012 | — | 追踪输入去抖的标准方法 |
| ★ Legibility and Predictability of Robot Motion（Dragan, Lee, Srinivasa） | HRI | 2013 | [DOI](https://doi.org/10.1109/HRI.2013.6483603) | 可读的机器人意图 |
| ★ SMPL: A Skinned Multi-Person Linear Model（Loper et al.） | ACM TOG (SIGGRAPH Asia) | 2015 | [DOI](https://doi.org/10.1145/2816795.2818013) | 标准人体模型 |
| Embodied Hands: Modeling and Capturing Hands and Bodies Together（MANO, Romero et al.） | ACM TOG (SIGGRAPH Asia) | 2017 | [arXiv](https://arxiv.org/abs/2201.02610) | 标准手部模型 |
| Deep Imitation Learning for Complex Manipulation Tasks from Virtual Reality Teleoperation（Zhang et al.） | ICRA | 2018 | [arXiv](https://arxiv.org/abs/1710.04615) | VR 遥操作采集示范 |
| AMASS: Archive of Motion Capture as Surface Shapes（Mahmood et al.） | ICCV | 2019 | [arXiv](https://arxiv.org/abs/1904.03278) | 统一的人体运动数据 |
| ★ Ego4D: Around the World in 3,000 Hours of Egocentric Video（Grauman et al.） | CVPR | 2022 | [arXiv](https://arxiv.org/abs/2110.07058) | 3,670 小时第一人称视频 |
| R3M: A Universal Visual Representation for Robot Manipulation（Nair et al.） | CoRL | 2022 | [arXiv](https://arxiv.org/abs/2203.12601) | 人类视频预训练视觉表征 |
| Holo-Dex: Teaching Dexterity with Immersive Mixed Reality（Arunachalam et al.） | ICRA | 2023 | [arXiv](https://arxiv.org/abs/2210.06463) | MR 灵巧手遥操作 |
| AnyTeleop（Qin et al.） | RSS | 2023 | [arXiv](https://arxiv.org/abs/2307.04577) | 通用视觉遥操作 |
| Virtual, Augmented, and Mixed Reality for Human-Robot Interaction: A Survey and Virtual Design Element Taxonomy（Walker et al.） | ACM THRI | 2023 | [arXiv](https://arxiv.org/abs/2202.11249) | VAM-HRI 综述 |
| ★ Project Aria: A New Tool for Egocentric Multi-Modal AI Research | arXiv | 2023 | [arXiv](https://arxiv.org/abs/2308.13561) | 研究用眼镜 |
| Aria Digital Twin（Pan et al.） | ICCV | 2023 | [arXiv](https://arxiv.org/abs/2306.06362) | 第一人称数字孪生 |
| MimicPlay（Wang et al.） | CoRL | 2023 | [arXiv](https://arxiv.org/abs/2302.12422) | 从人类游玩学规划 |
| Ego-Exo4D（Grauman et al.） | CVPR | 2024 | [arXiv](https://arxiv.org/abs/2311.18259) | 第一/第三人称同步视角 |
| DexCap（Wang et al.） | RSS | 2024 | [arXiv](https://arxiv.org/abs/2403.07788) | 动捕手套 → 机器人手 |
| RialTo: Reconciling Reality through Simulation（Torne et al.） | RSS | 2024 | [arXiv](https://arxiv.org/abs/2403.03949) | 现实-仿真-现实数字孪生 |
| H2O（He et al.） | IROS | 2024 | [arXiv](https://arxiv.org/abs/2403.04436) | 人到人形的实时全身遥操作 |
| HumanPlus（Fu et al.） | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2406.10454) | 单 RGB 相机影随 + 模仿 |
| OmniH2O（He et al.） | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2406.08858) | VR/RGB 人形遥操作与学习 |
| ★ Open-TeleVision: Teleoperation with Immersive Active Visual Feedback（Cheng et al.） | CoRL | 2024 | [arXiv](https://arxiv.org/abs/2407.01512) | 立体 + 主动相机 XR 遥操作 |
| GELLO（Wu et al.） | IROS | 2024 | [arXiv](https://arxiv.org/abs/2309.13037) | 低成本主臂 |
| SplatSim（Qureshi et al.） | arXiv | 2024 | [arXiv](https://arxiv.org/abs/2409.10161) | 3DGS 照片级仿真 |
| RoboGSim（Li et al.） | arXiv | 2024 | [arXiv](https://arxiv.org/abs/2411.11839) | Real2Sim2Real 高斯泼溅仿真器 |
| Bunny-VisionPro（Ding et al.） | IROS | 2025 | [arXiv](https://arxiv.org/abs/2407.03162) | Vision Pro 双臂灵巧遥操作 |
| ★ EgoMimic: Scaling Imitation Learning via Egocentric Video（Kareer et al.） | ICRA | 2025 | [arXiv](https://arxiv.org/abs/2410.24221) | 把人当作另一种本体 |
| Real-is-Sim（Abou-Chakra et al.） | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2504.03597) | 动态数字孪生 |
| EgoDex（Hoque et al.） | ICLR | 2026 | [arXiv](https://arxiv.org/abs/2505.11709) | Vision Pro 829 小时手部追踪数据 |

**资源**：Project Aria（https://www.projectaria.com）、Ego4D（https://ego4d-data.org）、SMPL（https://smpl.is.tue.mpg.de）、
MANO（https://mano.is.tue.mpg.de）、AMASS（https://amass.is.tue.mpg.de）、AnyTeleop（https://yzqin.github.io/anyteleop/）
会议：ACM/IEEE HRI（及 VAM-HRI workshop）、ACM CHI、UIST、IEEE VR、ISMAR

---

## 建议的学习顺序（约 8–10 周）

1. 第 1–2 周：*Modern Robotics* 第 3–6、8–11 章 + 第 1 篇代码；自己实现 DLS IK 与 RRT*。
2. 第 3–4 周：Spinning Up + PPO/SAC 论文；在 MuJoCo Playground 或 Isaac Lab 里训练一个四足行走策略（第 2、3 篇）。
3. 第 5–6 周：ACT、Diffusion Policy、UMI；用 LeRobot 在仿真（如 ALOHA sim / LIBERO）里复现一个任务（第 4 篇）。
4. 第 7–8 周：RT-2、OpenVLA、pi0、pi0.5；用 openpi 或 LeRobot 在 LIBERO 上微调一个 VLA（第 5 篇）。
5. 第 9–10 周：Open-TeleVision、EgoMimic、Aria 数据；搭一个用头显采集示范的小系统，并做一个小型用户研究（第 6 篇）。
