# 世界模型（World Models）阅读清单

对应博客系列 `world-models`（5 篇）。按学习阶段组织：每个阶段先读标 ★ 的论文。论文标题保留英文；链接均已核对（arXiv / DOI / 官方页面）。无法确认链接的条目只给出处。

## 阶段 0：基础与背景

| 论文 / 资料 | 出处 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| Reinforcement Learning: An Introduction (2nd ed.)，第 8 章 Planning and Learning | 书（Sutton & Barto） | 2018 | [incompleteideas.net](http://incompleteideas.net/book/the-book-2nd.html) | MDP、Dyna、模型式强化学习的标准入门 |
| ★ Dyna, an integrated architecture for learning, planning, and reacting (Sutton) | SIGART Bulletin 2(4) | 1991 | （无链接） | "在模型生成的模拟经验上学习"的原型 |
| ★ Auto-Encoding Variational Bayes (Kingma, Welling) | ICLR | 2014 | [arXiv:1312.6114](https://arxiv.org/abs/1312.6114) | VAE、ELBO、重参数化技巧 |
| Understanding Deep Learning (S. Prince) | 书（MIT Press） | 2023 | [udlbook](https://udlbook.github.io/udlbook/) | VAE、流模型、扩散模型章节非常清楚，免费 PDF |

## 阶段 1：模型式强化学习与潜在动力学（系列第 1 篇）

| 论文 | 出处 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| ★ World Models / Recurrent World Models Facilitate Policy Evolution (Ha, Schmidhuber) | NeurIPS | 2018 | [arXiv:1803.10122](https://arxiv.org/abs/1803.10122) | V-M-C 分解；在"梦境"中训练策略 |
| Deep RL in a Handful of Trials using Probabilistic Dynamics Models (PETS) | NeurIPS | 2018 | [arXiv:1805.12114](https://arxiv.org/abs/1805.12114) | 概率集成 + MPC，处理认知不确定性 |
| When to Trust Your Model: Model-Based Policy Optimization (MBPO) | NeurIPS | 2019 | [arXiv:1906.08253](https://arxiv.org/abs/1906.08253) | 短分支推演，缓解误差累积 |
| ★ Learning Latent Dynamics for Planning from Pixels (PlaNet) | ICML | 2019 | [arXiv:1811.04551](https://arxiv.org/abs/1811.04551) | 提出 RSSM，在潜空间用 CEM 规划 |
| ★ Dream to Control: Learning Behaviors by Latent Imagination (Dreamer) | ICLR | 2020 | [arXiv:1912.01603](https://arxiv.org/abs/1912.01603) | 想象中的 actor-critic，λ-回报，穿过动力学反传 |
| Mastering Atari with Discrete World Models (DreamerV2) | ICLR | 2021 | [arXiv:2010.02193](https://arxiv.org/abs/2010.02193) | 类别潜变量、KL 平衡 |
| ★ Mastering diverse control tasks through world models (DreamerV3) | Nature 640 | 2025 | [doi:10.1038/s41586-025-08744-2](https://doi.org/10.1038/s41586-025-08744-2) | 一套超参数通吃 150+ 任务；symlog、two-hot、free bits（预印本 [arXiv:2301.04104](https://arxiv.org/abs/2301.04104)） |
| ★ Mastering Atari, Go, Chess and Shogi by Planning with a Learned Model (MuZero) | Nature 588 | 2020 | [arXiv:1911.08265](https://arxiv.org/abs/1911.08265) | 价值等价模型 + MCTS，不重建观测 |
| Transformers are Sample-Efficient World Models (IRIS) | ICLR | 2023 | [arXiv:2209.00588](https://arxiv.org/abs/2209.00588) | 离散 token + Transformer 作为世界模型 |
| TD-MPC2: Scalable, Robust World Models for Continuous Control | ICLR | 2024 | [arXiv:2310.16828](https://arxiv.org/abs/2310.16828) | 无解码器潜空间 MPC，多任务扩展 |
| Diffusion for World Modeling: Visual Details Matter in Atari (DIAMOND) | NeurIPS | 2024 | [arXiv:2405.12399](https://arxiv.org/abs/2405.12399) | 扩散模型作动力学；可玩的 CS:GO 模型 |

## 阶段 2：生成模型工具箱（系列第 2 篇）

| 论文 | 出处 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| ★ Neural Discrete Representation Learning (VQ-VAE) | NeurIPS | 2017 | [arXiv:1711.00937](https://arxiv.org/abs/1711.00937) | 离散潜变量 / 视觉 token |
| Taming Transformers for High-Resolution Image Synthesis (VQGAN) | CVPR | 2021 | [arXiv:2012.09841](https://arxiv.org/abs/2012.09841) | 感知 + GAN 损失的 tokenizer |
| MaskGIT: Masked Generative Image Transformer | CVPR | 2022 | [arXiv:2202.04200](https://arxiv.org/abs/2202.04200) | 并行掩码解码（Genie 的动力学模型沿用） |
| Language Model Beats Diffusion: Tokenizer is Key to Visual Generation (MAGVIT-v2) | ICLR | 2024 | [arXiv:2310.05737](https://arxiv.org/abs/2310.05737) | 无查表量化（LFQ）视频 tokenizer |
| Deep Unsupervised Learning using Nonequilibrium Thermodynamics | ICML | 2015 | [arXiv:1503.03585](https://arxiv.org/abs/1503.03585) | 扩散模型的起源 |
| Generative Modeling by Estimating Gradients of the Data Distribution (NCSN) | NeurIPS | 2019 | [arXiv:1907.05600](https://arxiv.org/abs/1907.05600) | 基于分数的生成模型 |
| ★ Denoising Diffusion Probabilistic Models (DDPM) | NeurIPS | 2020 | [arXiv:2006.11239](https://arxiv.org/abs/2006.11239) | 噪声预测的简单损失 |
| ★ Score-Based Generative Modeling through Stochastic Differential Equations | ICLR | 2021 | [arXiv:2011.13456](https://arxiv.org/abs/2011.13456) | SDE / 概率流 ODE 统一视角 |
| ★ Denoising Diffusion Implicit Models (DDIM) | ICLR | 2021 | [arXiv:2010.02502](https://arxiv.org/abs/2010.02502) | 确定性快速采样 |
| Elucidating the Design Space of Diffusion-Based Generative Models (EDM) | NeurIPS | 2022 | [arXiv:2206.00364](https://arxiv.org/abs/2206.00364) | 噪声参数化、预条件与采样器的清晰设计 |
| ★ High-Resolution Image Synthesis with Latent Diffusion Models | CVPR | 2022 | [arXiv:2112.10752](https://arxiv.org/abs/2112.10752) | 在学到的潜空间里做扩散（Stable Diffusion） |
| Classifier-Free Diffusion Guidance | NeurIPS Workshop | 2021 | [arXiv:2207.12598](https://arxiv.org/abs/2207.12598) | 无分类器引导 |
| ★ Flow Matching for Generative Modeling | ICLR | 2023 | [arXiv:2210.02747](https://arxiv.org/abs/2210.02747) | 无需模拟的连续流训练 |
| Flow Straight and Fast: Rectified Flow | ICLR | 2023 | [arXiv:2209.03003](https://arxiv.org/abs/2209.03003) | 直线路径与 reflow |
| ★ Scalable Diffusion Models with Transformers (DiT) | ICCV | 2023 | [arXiv:2212.09748](https://arxiv.org/abs/2212.09748) | Transformer 去噪器、adaLN-Zero、可扩展性 |
| Scaling Rectified Flow Transformers for High-Resolution Image Synthesis (SD3) | ICML | 2024 | [arXiv:2403.03206](https://arxiv.org/abs/2403.03206) | 整流流 + Transformer 的规模化 |

## 阶段 3：视频世界模拟器（系列第 3 篇）

| 论文 / 报告 | 出处 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| Video Diffusion Models | NeurIPS | 2022 | [arXiv:2204.03458](https://arxiv.org/abs/2204.03458) | 早期视频扩散模型 |
| Video PreTraining (VPT): Learning to Act by Watching Unlabeled Online Videos | NeurIPS | 2022 | [arXiv:2206.11795](https://arxiv.org/abs/2206.11795) | 逆动力学模型给网络视频打伪动作标签 |
| GAIA-1: A Generative World Model for Autonomous Driving | arXiv（Wayve 技术报告） | 2023 | [arXiv:2309.17080](https://arxiv.org/abs/2309.17080) | token 化的驾驶世界模型，可用动作与文本控制 |
| ★ Learning Interactive Real-World Simulators (UniSim) | ICLR | 2024 | [arXiv:2310.06114](https://arxiv.org/abs/2310.06114) | 统一异构动作；在视频模拟器中训练策略并迁移到真机 |
| Learning to Act without Actions (LAPO) | ICLR | 2024 | [arXiv:2312.10812](https://arxiv.org/abs/2312.10812) | 只用视频学潜在动作策略 |
| ★ Video generation models as world simulators (Sora) | OpenAI 技术报告 | 2024 | [openai.com](https://openai.com/index/video-generation-models-as-world-simulators/) | 时空 patch 上的扩散 Transformer；"涌现模拟能力"的说法 |
| ★ Genie: Generative Interactive Environments | ICML | 2024 | [arXiv:2402.15391](https://arxiv.org/abs/2402.15391) | 无动作标签视频 + 潜在动作模型 → 可控世界 |
| Diffusion Forcing: Next-token Prediction Meets Full-Sequence Diffusion | NeurIPS | 2024 | [arXiv:2407.01392](https://arxiv.org/abs/2407.01392) | 每帧独立噪声水平，稳定长时推演 |
| Genie 2: A large-scale foundation world model | Google DeepMind 博客 | 2024 | [deepmind.google](https://deepmind.google/discover/blog/genie-2-a-large-scale-foundation-world-model/) | 单图提示、动作可控的 3D 世界 |
| ★ Diffusion Models Are Real-Time Game Engines (GameNGen) | ICLR | 2025 | [arXiv:2408.14837](https://arxiv.org/abs/2408.14837) | 实时 DOOM；上下文噪声增强 |
| Cosmos World Foundation Model Platform for Physical AI | arXiv（NVIDIA） | 2025 | [arXiv:2501.03575](https://arxiv.org/abs/2501.03575) | 开放的世界基础模型与 tokenizer |
| Genie 3: A new frontier for world models | Google DeepMind 博客 | 2025 | [deepmind.google](https://deepmind.google/discover/blog/genie-3-a-new-frontier-for-world-models/) | 实时、文本提示、可提示的世界事件 |
| How Far is Video Generation from World Model: A Physical Law Perspective | ICML | 2025 | [arXiv:2411.02385](https://arxiv.org/abs/2411.02385) | 视频模型按"案例"而非物理定律泛化 |

## 阶段 4：显式 3D / 4D 世界生成（系列第 4 篇）

| 论文 | 出处 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| 3D Gaussian Splatting for Real-Time Radiance Field Rendering | SIGGRAPH / ACM TOG 42(4) | 2023 | [arXiv:2308.04079](https://arxiv.org/abs/2308.04079) | 大多数场景生成方法的目标表示 |
| ★ DreamFusion: Text-to-3D using 2D Diffusion | ICLR | 2023 | [arXiv:2209.14988](https://arxiv.org/abs/2209.14988) | 分数蒸馏采样（SDS） |
| Magic3D: High-Resolution Text-to-3D Content Creation | CVPR | 2023 | [arXiv:2211.10440](https://arxiv.org/abs/2211.10440) | 由粗到细的 SDS |
| ★ ProlificDreamer (Variational Score Distillation) | NeurIPS | 2023 | [arXiv:2305.16213](https://arxiv.org/abs/2305.16213) | VSD 缓解过饱和与多样性不足 |
| Zero-1-to-3: Zero-shot One Image to 3D Object | ICCV | 2023 | [arXiv:2303.11328](https://arxiv.org/abs/2303.11328) | 相机条件的新视角扩散 |
| MVDream: Multi-view Diffusion for 3D Generation | ICLR | 2024 | [arXiv:2308.16512](https://arxiv.org/abs/2308.16512) | 多视角联合生成 |
| LRM: Large Reconstruction Model for Single Image to 3D | ICLR | 2024 | [arXiv:2311.04400](https://arxiv.org/abs/2311.04400) | 前馈式单图到 3D |
| DreamGaussian: Generative Gaussian Splatting for Efficient 3D Content Creation | ICLR | 2024 | [arXiv:2309.16653](https://arxiv.org/abs/2309.16653) | 高斯表示下的快速 SDS |
| CAT3D: Create Anything in 3D with Multi-View Diffusion Models | NeurIPS | 2024 | [arXiv:2405.10314](https://arxiv.org/abs/2405.10314) | 多视角扩散 + 重建生成场景 |
| ★ Text2Room: Extracting Textured 3D Meshes from 2D Text-to-Image Models | ICCV | 2023 | [arXiv:2303.11989](https://arxiv.org/abs/2303.11989) | 修补 + 深度的房间级场景生长 |
| LucidDreamer: Domain-free Generation of 3D Gaussian Splatting Scenes (Chung et al.) | arXiv / IEEE TVCG | 2023 | [arXiv:2311.13384](https://arxiv.org/abs/2311.13384) | 场景生长 + 3DGS 优化 |
| WonderJourney: Going from Anywhere to Everywhere | CVPR | 2024 | [arXiv:2312.03884](https://arxiv.org/abs/2312.03884) | LLM 规划的连贯 3D 场景序列 |
| ★ WonderWorld: Interactive 3D Scene Generation from a Single Image | CVPR | 2025 | [arXiv:2406.09394](https://arxiv.org/abs/2406.09394) | 10 秒内交互式生成场景（FLAGS） |
| Text-To-4D Dynamic Scene Generation (MAV3D) | ICML | 2023 | [arXiv:2301.11280](https://arxiv.org/abs/2301.11280) | 首个文本到 4D |
| 4D Gaussian Splatting for Real-Time Dynamic Scene Rendering | CVPR | 2024 | [arXiv:2310.08528](https://arxiv.org/abs/2310.08528) | 变形场驱动的动态高斯 |
| 4D-fy: Text-to-4D Generation Using Hybrid Score Distillation Sampling | CVPR | 2024 | [arXiv:2311.17984](https://arxiv.org/abs/2311.17984) | 图像先验与视频先验混合 SDS |
| Align Your Gaussians: Text-to-4D with Dynamic 3D Gaussians and Composed Diffusion Models | CVPR | 2024 | [arXiv:2312.13763](https://arxiv.org/abs/2312.13763) | 动态高斯 + 组合扩散反馈 |
| PhysGaussian: Physics-Integrated 3D Gaussians for Generative Dynamics | CVPR | 2024 | [arXiv:2311.12198](https://arxiv.org/abs/2311.12198) | 同一组高斯既模拟（MPM）又渲染 |
| Marble（World Labs） | 产品发布博客 | 2025 | [worldlabs.ai](https://www.worldlabs.ai/blog/marble-world-model) | 可下载的持久 3D 世界（高斯点 + 网格），无技术论文 |

## 阶段 5：JEPA、评测与开放问题（系列第 5 篇）

| 论文 | 出处 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| ★ A Path Towards Autonomous Machine Intelligence (LeCun) | OpenReview 立场论文 | 2022 | [OpenReview](https://openreview.net/forum?id=BZ5a1r-kVsf) | 模块化架构、能量模型、JEPA |
| Bootstrap Your Own Latent (BYOL) | NeurIPS | 2020 | [arXiv:2006.07733](https://arxiv.org/abs/2006.07733) | EMA 目标网络，无负样本也不坍缩 |
| VICReg | ICLR | 2022 | [arXiv:2105.04906](https://arxiv.org/abs/2105.04906) | 显式防坍缩正则 |
| Masked Autoencoders Are Scalable Vision Learners (MAE) | CVPR | 2022 | [arXiv:2111.06377](https://arxiv.org/abs/2111.06377) | 像素重建基线 |
| ★ Self-Supervised Learning from Images with a Joint-Embedding Predictive Architecture (I-JEPA) | CVPR | 2023 | [arXiv:2301.08243](https://arxiv.org/abs/2301.08243) | 图像上的特征预测 |
| Revisiting Feature Prediction for Learning Visual Representations from Video (V-JEPA) | TMLR | 2024 | [arXiv:2404.08471](https://arxiv.org/abs/2404.08471) | 视频上的特征预测 |
| Intuitive physics understanding emerges from self-supervised pretraining on natural videos | arXiv | 2025 | [arXiv:2502.11831](https://arxiv.org/abs/2502.11831) | 期望违背范式评测 V-JEPA |
| ★ V-JEPA 2: Self-Supervised Video Models Enable Understanding, Prediction and Planning | arXiv | 2025 | [arXiv:2506.09985](https://arxiv.org/abs/2506.09985) | 动作条件潜在世界模型，零样本机器人规划 |
| ★ DINO-WM: World Models on Pre-trained Visual Features enable Zero-shot Planning | ICML | 2025 | [arXiv:2411.04983](https://arxiv.org/abs/2411.04983) | 冻结 DINOv2 特征上的规划 |
| Navigation World Models | CVPR | 2025 | [arXiv:2412.03572](https://arxiv.org/abs/2412.03572) | 生成式（扩散）导航世界模型 |
| Physion: Evaluating Physical Prediction from Vision in Humans and Machines | NeurIPS Datasets & Benchmarks | 2021 | [arXiv:2106.08261](https://arxiv.org/abs/2106.08261) | 带人类对照的物理预测基准 |
| VBench: Comprehensive Benchmark Suite for Video Generative Models | CVPR | 2024 | [arXiv:2311.17982](https://arxiv.org/abs/2311.17982) | 多维视频质量评测 |
| ★ Do generative video models understand physical principles? (Physics-IQ) | WACV | 2026 | [arXiv:2501.09038](https://arxiv.org/abs/2501.09038) | 视觉逼真不等于理解物理 |
| IntPhys（Riochet et al.） | arXiv / 基准 | 2018 | （无链接） | 直觉物理的期望违背基准 |

## 课程、书籍与博客

- Stanford CS236: Deep Generative Models — [deepgenerativemodels.github.io](https://deepgenerativemodels.github.io/)
- S. Prince, *Understanding Deep Learning* — [udlbook.github.io/udlbook](https://udlbook.github.io/udlbook/)
- Lilian Weng, "What are Diffusion Models?" — [lilianweng.github.io](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/)
- Ha & Schmidhuber 的交互式文章 — [worldmodels.github.io](https://worldmodels.github.io/)
- Sutton & Barto, *Reinforcement Learning: An Introduction* — [incompleteideas.net](http://incompleteideas.net/book/the-book-2nd.html)

## 代码

- DreamerV3（官方 JAX）：[github.com/danijar/dreamerv3](https://github.com/danijar/dreamerv3)
- TD-MPC2：[github.com/nicklashansen/tdmpc2](https://github.com/nicklashansen/tdmpc2)
- DIAMOND（可玩的 Atari / CS:GO 世界模型）：[github.com/eloialonso/diamond](https://github.com/eloialonso/diamond)
- Diffusion Forcing：[github.com/buoyancy99/diffusion-forcing](https://github.com/buoyancy99/diffusion-forcing)
- NVIDIA Cosmos：[github.com/NVIDIA/Cosmos](https://github.com/NVIDIA/Cosmos)
- Hugging Face diffusers：[github.com/huggingface/diffusers](https://github.com/huggingface/diffusers)；Meta flow_matching：[github.com/facebookresearch/flow_matching](https://github.com/facebookresearch/flow_matching)
- threestudio（SDS 系方法合集）：[github.com/threestudio-project/threestudio](https://github.com/threestudio-project/threestudio)
- Text2Room：[github.com/lukasHoel/text2room](https://github.com/lukasHoel/text2room)；4DGaussians：[github.com/hustvl/4DGaussians](https://github.com/hustvl/4DGaussians)
- I-JEPA / V-JEPA / V-JEPA 2：[ijepa](https://github.com/facebookresearch/ijepa)、[jepa](https://github.com/facebookresearch/jepa)、[vjepa2](https://github.com/facebookresearch/vjepa2)；直觉物理评测：[jepa-intuitive-physics](https://github.com/facebookresearch/jepa-intuitive-physics)
- DINO-WM：[github.com/gaoyuezhou/dino_wm](https://github.com/gaoyuezhou/dino_wm)
- Physics-IQ：[github.com/google-deepmind/physics-IQ-benchmark](https://github.com/google-deepmind/physics-IQ-benchmark)

## 建议学习路线

1. 第 1 周：Sutton & Barto 第 8 章 → Ha & Schmidhuber → PlaNet → Dreamer（跑一遍系列第 1 篇的代码）。
2. 第 2 周：VAE → VQ-VAE → DDPM → DDIM → 分数 SDE → LDM → CFG → Flow Matching → DiT（自己实现系列第 2 篇的 2D 扩散与流匹配）。
3. 第 3 周：Genie → GameNGen → UniSim → Diffusion Forcing → Cosmos；精读 Sora 报告与 Genie 2/3 博客的局限部分。
4. 第 4 周：DreamFusion → ProlificDreamer → Text2Room → LucidDreamer → WonderWorld → 4D-fy / AYG → PhysGaussian。
5. 第 5 周：LeCun 立场论文 → I-JEPA → V-JEPA → V-JEPA 2 → DINO-WM；评测方面读 Physion、Physics-IQ、Kang et al.。

## 2025-2026（世界模型系列第 1-5 篇的 2025–2026 年更新，截至 2026 年 11 月）

状态说明：“预印本”= 尚未在会议/期刊发表的 arXiv 论文；“公告”= 公司博客或新闻稿（其中的能力描述为公司自述）。所有条目已于 2026 年 11 月对照 arXiv 页面或官方文章核实。★ = 推荐优先阅读。

### 模型式强化学习、智能体与机器人世界模型（第 1 篇）

| 论文 / 报告 | 状态 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| DreamGen: Unlocking Generalization in Robot Learning through Video World Models | 预印本 | 2025 | [arXiv:2505.12705](https://arxiv.org/abs/2505.12705) | 用视频世界模型生成“神经轨迹”训练机器人策略 |
| ★ Training Agents Inside of Scalable World Models (Dreamer 4) | 预印本 | 2025 | [arXiv:2509.24527](https://arxiv.org/abs/2509.24527) | shortcut forcing 视频世界模型；纯离线想象强化学习拿到 Minecraft 钻石 |
| Ctrl-World: A Controllable Generative World Model for Robot Manipulation | 预印本 | 2025 | [arXiv:2510.10125](https://arxiv.org/abs/2510.10125) | 在想象中评估并改进通用机器人策略 |
| World Action Models are Zero-shot Policies (DreamZero) | 预印本 | 2026 | [arXiv:2602.15922](https://arxiv.org/abs/2602.15922) | 视频扩散骨干上的视频-动作联合预测策略 |
| Fast-WAM: Do World Action Models Need Test-time Future Imagination? | 预印本 | 2026 | [arXiv:2603.16666](https://arxiv.org/abs/2603.16666) | 训练时用视频监督、推理时不生成未来帧 |
| From World Models to World Action Models: A Concise Tutorial for Robotics | 预印本 | 2026 | [arXiv:2607.00836](https://arxiv.org/abs/2607.00836) | WAM 入门教程 |
| World-Action Models for Robot Learning and Control: A Survey | 预印本 | 2026 | [arXiv:2609.16074](https://arxiv.org/abs/2609.16074) | WAM 综述 |

### 生成骨干：因果少步视频扩散（第 2 篇）

| 论文 / 报告 | 状态 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| One Step Diffusion via Shortcut Models | arXiv | 2024 | [arXiv:2410.12557](https://arxiv.org/abs/2410.12557) | 以步长为条件的少步采样（Dreamer 4 的基础之一） |
| From Slow Bidirectional to Fast Autoregressive Video Diffusion Models (CausVid) | CVPR | 2025 | [arXiv:2412.07772](https://arxiv.org/abs/2412.07772) | 双向教师 → 因果少步学生（DMD） |
| History-Guided Video Diffusion | ICML | 2025 | [arXiv:2502.06764](https://arxiv.org/abs/2502.06764) | 对历史帧施加引导的 Diffusion Forcing Transformer |
| Wan: Open and Advanced Large-Scale Video Generative Models | 预印本 | 2025 | [arXiv:2503.20314](https://arxiv.org/abs/2503.20314) | 许多开源世界模型的骨干 |
| MAGI-1: Autoregressive Video Generation at Scale | 预印本 | 2025 | [arXiv:2505.13211](https://arxiv.org/abs/2505.13211) | 大规模逐块自回归视频扩散 |
| Mean Flows for One-step Generative Modeling | 预印本 | 2025 | [arXiv:2505.13447](https://arxiv.org/abs/2505.13447) | 学习平均速度，单步生成 |
| ★ Self Forcing: Bridging the Train-Test Gap in Autoregressive Video Diffusion | NeurIPS | 2025 | [arXiv:2506.08009](https://arxiv.org/abs/2506.08009) | 在自身推演上训练，弥合训练-测试差距 |
| Self-Forcing++: Towards Minute-Scale High-Quality Video Generation | 预印本 | 2025 | [arXiv:2510.02283](https://arxiv.org/abs/2510.02283) | 分钟级长视频 |
| Diffusion Transformers with Representation Autoencoders | 技术报告 | 2025 | [arXiv:2510.11690](https://arxiv.org/abs/2510.11690) | 在冻结的表示编码器特征空间中做扩散 |
| Causal Forcing | ICML | 2026 | [arXiv:2602.02214](https://arxiv.org/abs/2602.02214) | 用自回归教师初始化因果蒸馏 |
| Causal Forcing++ | 预印本 | 2026 | [arXiv:2605.15141](https://arxiv.org/abs/2605.15141) | 逐帧 2 步自回归蒸馏 |
| Causal-rCM | 技术报告 | 2026 | [arXiv:2606.25473](https://arxiv.org/abs/2606.25473) | 教师强制一致性 + Self Forcing 式 DMD 的开放配方 |

### 交互式视频世界模型与记忆（第 3 篇）

| 论文 / 报告 | 状态 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| World Simulation with Video Foundation Models for Physical AI (Cosmos-Predict2.5) | 预印本 | 2025 | [arXiv:2511.00062](https://arxiv.org/abs/2511.00062) | 第二代 Cosmos |
| Cosmos-Transfer1 / Cosmos-Reason1 | 预印本 | 2025 | [arXiv:2503.14492](https://arxiv.org/abs/2503.14492) / [arXiv:2503.15558](https://arxiv.org/abs/2503.15558) | 多模态控制生成 / 物理常识推理 |
| GAIA-2 | 预印本 | 2025 | [arXiv:2503.20523](https://arxiv.org/abs/2503.20523) | 多相机可控驾驶世界模型 |
| WorldMem | 预印本 | 2025 | [arXiv:2504.12369](https://arxiv.org/abs/2504.12369) | 带位姿的帧记忆库 |
| Long-Context State-Space Video World Models | 预印本 | 2025 | [arXiv:2505.20171](https://arxiv.org/abs/2505.20171) | SSM 长程记忆 + 局部注意力 |
| ★ Context as Memory | SIGGRAPH Asia | 2025 | [arXiv:2506.03141](https://arxiv.org/abs/2506.03141) | 按视锥重叠检索上下文帧 |
| Hunyuan-GameCraft | 预印本 | 2025 | [arXiv:2506.17201](https://arxiv.org/abs/2506.17201) | 游戏视频交互生成 |
| VMem | ICCV | 2025 | [arXiv:2506.18903](https://arxiv.org/abs/2506.18903) | 面元索引的视角记忆 |
| Yan: Foundational Interactive Video Generation | 预印本 | 2025 | [arXiv:2508.08601](https://arxiv.org/abs/2508.08601) | 模拟、生成、编辑三合一 |
| ★ Matrix-Game 2.0 | 预印本 | 2025 | [arXiv:2508.13009](https://arxiv.org/abs/2508.13009) | 开源实时流式世界模型 |
| Mixture of Contexts for Long Video Generation | 预印本 | 2025 | [arXiv:2508.21058](https://arxiv.org/abs/2508.21058) | 长历史上的稀疏路由 |
| LongLive | 预印本 | 2025 | [arXiv:2509.22622](https://arxiv.org/abs/2509.22622) | 实时、可切换提示的长视频 |
| Emu3.5: Native Multimodal Models are World Learners | 预印本 | 2025 | [arXiv:2510.26583](https://arxiv.org/abs/2510.26583) | 下一个 token 多模态“世界学习者” |
| WorldPlay | 预印本 | 2025 | [arXiv:2512.14614](https://arxiv.org/abs/2512.14614) | 720p/24 fps 实时，重建式上下文记忆 |
| Matrix-Game 3.0 | 预印本 | 2026 | [arXiv:2604.08995](https://arxiv.org/abs/2604.08995) | 720p 实时 + 长时程记忆 |
| Echo-Memory | 预印本 | 2026 | [arXiv:2606.09803](https://arxiv.org/abs/2606.09803) | 动作世界模型中记忆机制的受控比较 |
| AlayaWorld | 预印本 | 2026 | [arXiv:2607.18367](https://arxiv.org/abs/2607.18367) | 15B 长时程交互模型 |
| ReWorld | 预印本 | 2026 | [arXiv:2608.23565](https://arxiv.org/abs/2608.23565) | 有界 KV 缓存 + 位姿索引地标库 |
| Towards Interactive Video World Modeling（综述） | 预印本 | 2026 | [arXiv:2606.01164](https://arxiv.org/abs/2606.01164) | 交互式视频世界模型综述 |
| The Past Frames the Future（综述） | 预印本 | 2026 | [arXiv:2609.28466](https://arxiv.org/abs/2609.28466) | 自回归视频生成中的记忆综述 |

公告与产品（公司自述）：[Genie 3](https://deepmind.google/discover/blog/genie-3-a-new-frontier-for-world-models/)（2025-08）、[RTFM](https://worldlabs.ai/blog/rtfm)（2025-10）、[Runway GWM-1](https://runway.com/research/introducing-runway-gwm-1)（2025-12）、[Project Genie](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/)（2026-01）、[Waymo World Model](https://waymo.com/blog/2026/02/the-waymo-world-model-a-new-frontier-for-autonomous-driving-simulation)（2026-02）、[Cosmos 3](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Launches-Cosmos-3-the-Open-Frontier-Foundation-Model-for-Physical-AI/default.aspx)（2026-06）、[GAIA-4](https://wayve.ai/thinking/gaia-4/)（2026-08）、[Genie 4](https://deepmind.google/blog/genie-4-a-new-generation-of-world-simulation/)（2026-10）。

### 3D / 4D 世界生成（第 4 篇）

| 论文 / 报告 | 状态 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| ★ VGGT: Visual Geometry Grounded Transformer | CVPR | 2025 | [arXiv:2503.11651](https://arxiv.org/abs/2503.11651) | 前馈预测相机、深度、点图 |
| GEN3C | CVPR | 2025 | [arXiv:2503.03751](https://arxiv.org/abs/2503.03751) | 3D 缓存引导的视频生成 |
| Bolt3D | ICCV | 2025 | [arXiv:2503.14445](https://arxiv.org/abs/2503.14445) | 几秒钟内生成高斯场景 |
| Stable Virtual Camera | 预印本 | 2025 | [arXiv:2503.14489](https://arxiv.org/abs/2503.14489) | 通用新视角扩散 |
| Aether | 预印本 | 2025 | [arXiv:2503.18945](https://arxiv.org/abs/2503.18945) | 4D 重建 + 预测 + 规划 |
| Voyager | 预印本 | 2025 | [arXiv:2506.04225](https://arxiv.org/abs/2506.04225) | RGB-D 视频 + 世界缓存 |
| π³ | ICLR | 2026 | [arXiv:2507.13347](https://arxiv.org/abs/2507.13347) | 置换等变的前馈几何 |
| HunyuanWorld 1.0 | 预印本 | 2025 | [arXiv:2507.21809](https://arxiv.org/abs/2507.21809) | 全景优先、分层、可导出网格 |
| Matrix-3D | 技术报告 | 2025 | [arXiv:2508.08086](https://arxiv.org/abs/2508.08086) | 全景视频 → 3D 重建 |
| 4DNeX | 预印本 | 2025 | [arXiv:2508.13154](https://arxiv.org/abs/2508.13154) | 前馈图像到 4D |
| MapAnything | 3DV | 2026 | [arXiv:2509.13414](https://arxiv.org/abs/2509.13414) | 度量尺度的通用前馈重建 |
| ★ Lyra | 预印本 | 2025 | [arXiv:2509.19296](https://arxiv.org/abs/2509.19296) | 视频模型自蒸馏为 3DGS 解码器 |
| FlashWorld | 预印本 | 2025 | [arXiv:2510.13678](https://arxiv.org/abs/2510.13678) | 几秒钟内生成 3D 高斯场景 |
| Depth Anything 3 | ICLR | 2026 | [arXiv:2511.10647](https://arxiv.org/abs/2511.10647) | 任意视角的深度 + 光线 |
| SAM 3D | 预印本 | 2025 | [arXiv:2511.16624](https://arxiv.org/abs/2511.16624) | 单图物体 3D 重建 |
| Gen3R | 预印本 | 2026 | [arXiv:2601.04090](https://arxiv.org/abs/2601.04090) | 几何潜变量与视频潜变量对齐 |
| HY-World 2.0 | 预印本 | 2026 | [arXiv:2604.14268](https://arxiv.org/abs/2604.14268) | 重建 / 生成 / 模拟 3DGS 世界 |
| Feed-Forward 3D Scene Modeling: A Problem-Driven Perspective（综述） | 预印本 | 2026 | [arXiv:2604.14025](https://arxiv.org/abs/2604.14025) | 前馈 3D 场景建模综述 |
| FLAT | 预印本 | 2026 | [arXiv:2606.24876](https://arxiv.org/abs/2606.24876) | 由视频潜变量解码三角形泼溅 |
| ★ L3G-World | 预印本 | 2026 | [arXiv:2610.40614](https://arxiv.org/abs/2610.40614) | 随场景范围增长的潜在 3D 高斯记忆 |

公告与产品：[Marble 正式发布](https://worldlabs.ai/blog/marble-world-model)（2025-11-12）、[World API](https://worldlabs.ai/blog/announcing-the-world-api)（2026-01）、[Spark 2.0](https://worldlabs.ai/blog/spark-2.0)（2026-04）、[Atlas](https://worldlabs.ai/blog/atlas)（2026-09）。

### JEPA 与评测（第 5 篇）

| 论文 / 报告 | 状态 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| WorldModelBench | 预印本 | 2025 | [arXiv:2502.20694](https://arxiv.org/abs/2502.20694) | 指令遵循与物理一致性 |
| VideoPhy-2 | 预印本 | 2025 | [arXiv:2503.06800](https://arxiv.org/abs/2503.06800) | 以动作为中心的物理常识 |
| WorldScore | ICCV | 2025 | [arXiv:2504.00983](https://arxiv.org/abs/2504.00983) | 指定相机路径的世界生成评测 |
| IntPhys 2 | 预印本 | 2025 | [arXiv:2506.09849](https://arxiv.org/abs/2506.09849) | 复杂场景的违背预期测试 |
| DINO-world (Back to the Features) | 预印本 | 2025 | [arXiv:2507.19468](https://arxiv.org/abs/2507.19468) | 在 DINOv2 特征空间中预测未来 |
| Video models are zero-shot learners and reasoners | 预印本 | 2025 | [arXiv:2509.20328](https://arxiv.org/abs/2509.20328) | Veo 3 的零样本视觉能力 |
| ★ World-in-World | ICLR（口头报告） | 2026 | [arXiv:2510.18135](https://arxiv.org/abs/2510.18135) | 闭环、以任务成功率评测世界模型 |
| ★ LeJEPA | 预印本 | 2025 | [arXiv:2511.08544](https://arxiv.org/abs/2511.08544) | SIGReg：无启发式技巧的 JEPA |
| VL-JEPA | 预印本 | 2025 | [arXiv:2512.10942](https://arxiv.org/abs/2512.10942) | 预测文本嵌入的视觉语言 JEPA |
| LeWorldModel | 预印本 | 2026 | [arXiv:2603.19312](https://arxiv.org/abs/2603.19312) | 端到端像素 JEPA 世界模型 |
| V-JEPA 2.1 | 预印本 | 2026 | [arXiv:2603.14482](https://arxiv.org/abs/2603.14482) | 稠密特征，机器人抓取更好 |
| WorldMark | 预印本 | 2026 | [arXiv:2604.21686](https://arxiv.org/abs/2604.21686) | 统一控制接口的交互模型评测 |
| WorldArena 2.0 | 预印本 | 2026 | [arXiv:2605.17912](https://arxiv.org/abs/2605.17912) | 具身、多平台世界模型基准 |
| WBench | 预印本 | 2026 | [arXiv:2605.25874](https://arxiv.org/abs/2605.25874) | 多轮交互评测 |
| ★ Current World Models Lack a Persistent State Core (WRBench) | 预印本 | 2026 | [arXiv:2606.20545](https://arxiv.org/abs/2606.20545) | 画面外事件不会继续演化 |
| A Tutorial on World Models and Physical AI | 预印本 | 2026 | [arXiv:2606.12783](https://arxiv.org/abs/2606.12783) | 教程 |
| A Definition and Roadmap for World Models | 预印本 | 2026 | [arXiv:2607.06401](https://arxiv.org/abs/2607.06401) | 定义与路线图 |
| World Models' Last Exam in Physics | 预印本 | 2026 | [arXiv:2610.08791](https://arxiv.org/abs/2610.08791) | 基于测量的物理任务，最佳 57.76/100 |

### 2025-2026 建议学习路线

1. Self Forcing → Causal Forcing（理解因果少步视频扩散）→ Matrix-Game 2.0 / 3.0（开源可跑）。
2. Context as Memory → VMem → WorldPlay → Echo-Memory（记忆）→ WRBench（记忆的局限）。
3. VGGT → Lyra / FlashWorld → Gen3R → L3G-World（显式 3D 与视频模型的汇合）。
4. Dreamer 4 → DreamZero / Fast-WAM（从想象训练到世界动作模型）。
5. LeJEPA → LeWorldModel → V-JEPA 2.1；评测读 World-in-World 与 World Models' Last Exam in Physics。
