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
