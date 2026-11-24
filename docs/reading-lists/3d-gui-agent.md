# 3D GUI Agent 阅读清单

对应博客专栏 `3d-gui-agent`（5 篇，第 5 篇研究计划不公开）。每篇文章各占一节，由各自的作者追加。论文标题保留英文；arXiv 编号均已对照 arXiv / Semantic Scholar 核对（2026-11-24）。"arXiv" 表示未经同行评审的预印本或技术报告。先读标 ★ 的条目。

## 第 2 篇：二维屏幕上的 GUI 智能体（GUI agents on 2D screens: a survey to November 2026）

主要来源：`docs/research/3d-gui-agent/01-gui-agents-2d.md`（216 篇工作、48 个基准）。下表按文章的章节组织。

### 2.1 前 LLM 时代：UI 数据、UI 理解与 UI 上的强化学习

| 论文 | 出处 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| ★ Rico: A Mobile App Dataset for Building Data-Driven Design Applications (Deka et al.) | UIST | 2017 | [doi](https://doi.org/10.1145/3126594.3126651) | 7.2 万个带视图层级的 Android 界面；UI 数据的范本 |
| World of Bits: An Open-Domain Platform for Web-Based Agents (Shi et al.) | ICML | 2017 | [PMLR](https://proceedings.mlr.press/v70/shi17a.html) | MiniWoB：键鼠动作的网页小任务 |
| Reinforcement Learning on Web Interfaces Using Workflow-Guided Exploration (E. Z. Liu et al.) | ICLR | 2018 | [arXiv:1802.08802](https://arxiv.org/abs/1802.08802) | MiniWoB++；用少量演示约束探索 |
| Mapping Natural Language Instructions to Mobile UI Action Sequences (Y. Li et al.) | ACL | 2020 | [arXiv:2005.03776](https://arxiv.org/abs/2005.03776) | Seq2Act / PixelHelp：指令 -> 定位 -> 动作的分解 |
| AndroidEnv: A Reinforcement Learning Platform for Android (Toyama et al.) | arXiv | 2021 | [arXiv:2105.13231](https://arxiv.org/abs/2105.13231) | 把 Android 模拟器包装成 RL 环境 |
| A Data-Driven Approach for Learning to Control Computers (Humphreys et al., CC-Net) | ICML | 2022 | [arXiv:2202.08137](https://arxiv.org/abs/2202.08137) | 240 万演示达到 MiniWoB++ 人类水平 |
| Spotlight: Mobile UI Understanding using VLMs with a Focus (G. Li et al.) | ICLR | 2023 | [arXiv:2209.14927](https://arxiv.org/abs/2209.14927) | 只看截图即胜过视图层级模型 |
| ★ Pix2Struct: Screenshot Parsing as Pretraining (K. Lee et al.) | ICML | 2023 | [arXiv:2210.03347](https://arxiv.org/abs/2210.03347) | 截图 -> 简化 HTML 的预训练 |
| ★ Android in the Wild (Rawles et al., AITW) | NeurIPS D&B | 2023 | [arXiv:2307.10088](https://arxiv.org/abs/2307.10088) | 71.5 万条人类设备操作轨迹 |

### 2.2 智能体系统：手机、桌面、网页

| 论文 | 出处 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| AutoDroid: LLM-powered Task Automation in Android (Wen et al.) | MobiCom | 2024 | [arXiv:2308.15272](https://arxiv.org/abs/2308.15272) | 离线探索构建 UI 转移图作为记忆 |
| ★ AppAgent: Multimodal Agents as Smartphone Users (C. Zhang et al.) | CHI | 2025 | [arXiv:2312.13771](https://arxiv.org/abs/2312.13771) | 元素级动作空间（2.2% -> 48.9%）与探索文档 |
| Mobile-Agent (J. Wang et al.) | ICLR Workshop | 2024 | [arXiv:2401.16158](https://arxiv.org/abs/2401.16158) | 纯截图感知（OCR + 图标检测） |
| ★ Mobile-Agent-v2 (J. Wang et al.) | NeurIPS | 2024 | [arXiv:2406.01014](https://arxiv.org/abs/2406.01014) | 规划 / 决策 / 反思多智能体 |
| Mobile-Agent-E (Z. Wang et al.) | arXiv | 2025 | [arXiv:2501.11733](https://arxiv.org/abs/2501.11733) | 自我进化的 Tips 与 Shortcuts |
| UFO: A UI-Focused Agent for Windows OS Interaction (C. Zhang et al.) | arXiv | 2024 | [arXiv:2402.07939](https://arxiv.org/abs/2402.07939) | HostAgent / AppAgent，基于 UI Automation |
| UFO2: The Desktop AgentOS (C. Zhang et al.) | arXiv | 2025 | [arXiv:2504.14603](https://arxiv.org/abs/2504.14603) | GUI + API 混合动作、画中画桌面 |
| Cradle (W. Tan et al.) | arXiv | 2024 | [arXiv:2403.03186](https://arxiv.org/abs/2403.03186) | 仅键鼠控制，含 3D 游戏 |
| ★ Agent S (Agashe et al.) | ICLR | 2025 | [arXiv:2410.08164](https://arxiv.org/abs/2410.08164) | Agent-Computer Interface（ACI） |
| Agent S2 (Agashe et al.) | arXiv | 2025 | [arXiv:2504.00906](https://arxiv.org/abs/2504.00906) | 多个专门定位器的混合 |
| ★ Scaling Agents for Computer Use (Agent S3, Gonzalez-Pumariega et al.) | TMLR | 2026 | [arXiv:2510.02250](https://arxiv.org/abs/2510.02250) | Behavior Best-of-N；OSWorld 首次超过人类（72.6%） |
| Evolving Agent Interfaces (Agent S4, Agashe et al.) | arXiv | 2026 | [arXiv:2610.28601](https://arxiv.org/abs/2610.28601) | 元智能体进化自身的工具与接口 |
| CoAct-1 (L. Song et al.) | arXiv | 2025 | [arXiv:2508.03923](https://arxiv.org/abs/2508.03923) | GUI 操作员 + 写代码的程序员；OSWorld 60.76% |
| GPT-4V(ision) is a Generalist Web Agent, if Grounded (SeeAct, B. Zheng et al.) | ICML | 2024 | [arXiv:2401.01614](https://arxiv.org/abs/2401.01614) | 理想定位 51.1% vs 实用定位 37.8% |
| WebVoyager (H. He et al.) | ACL | 2024 | [arXiv:2401.13919](https://arxiv.org/abs/2401.13919) | Set-of-Mark 截图 + 真实网站 + VLM 评判 |
| Agent Workflow Memory (Z. Z. Wang et al.) | ICML | 2025 | [arXiv:2409.07429](https://arxiv.org/abs/2409.07429) | 从过往回合归纳可复用工作流 |
| Magentic-One (Fourney et al.) | arXiv | 2024 | [arXiv:2411.04468](https://arxiv.org/abs/2411.04468) | 编排者 + 专门子智能体 |
| Tree Search for Language Model Agents (Koh et al.) | TMLR | 2025 | [arXiv:2407.01476](https://arxiv.org/abs/2407.01476) | 推理时最佳优先搜索 |
| Do Multi-Agents Dream of Electric Screens? (Minitap, Favreau et al.) | arXiv | 2026 | [arXiv:2602.07787](https://arxiv.org/abs/2602.07787) | AndroidWorld pass@3 100%、pass^3 94.0% |

### 2.3 感知与定位（grounding）模型、原生智能体模型

| 论文 | 出处 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| ★ Set-of-Mark Prompting (J. Yang et al.) | arXiv | 2023 | [arXiv:2310.11441](https://arxiv.org/abs/2310.11441) | 编号标记让 VLM 用数字指代区域 |
| CogAgent (W. Hong et al.) | CVPR | 2024 | [arXiv:2312.08914](https://arxiv.org/abs/2312.08914) | 1120 x 1120 高分辨率分支 |
| ★ SeeClick (K. Cheng et al.) | ACL | 2024 | [arXiv:2401.10935](https://arxiv.org/abs/2401.10935) | 定位预训练；提出 ScreenSpot |
| Ferret-UI (K. You et al.) | ECCV | 2024 | [arXiv:2404.05719](https://arxiv.org/abs/2404.05719) | "any resolution" 子图应对细长屏幕与小控件 |
| OmniParser (Y. Lu et al.) | arXiv | 2024 | [arXiv:2408.00203](https://arxiv.org/abs/2408.00203) | 纯像素解析：图标检测 + 描述 + OCR |
| ★ UGround (Gou et al.) | ICLR | 2025 | [arXiv:2410.05243](https://arxiv.org/abs/2410.05243) | 1000 万合成网页元素训练的纯视觉定位器 |
| OS-ATLAS (Z. Wu et al.) | ICLR | 2025 | [arXiv:2410.23218](https://arxiv.org/abs/2410.23218) | 1358 万元素跨平台语料；ScreenSpot-v2 |
| ShowUI (K. Q. Lin et al.) | CVPR | 2025 | [arXiv:2411.17465](https://arxiv.org/abs/2411.17465) | UI 引导的视觉 token 选择 |
| Aguvis (Y. Xu et al.) | ICML | 2025 | [arXiv:2412.04454](https://arxiv.org/abs/2412.04454) | 先定位、后规划的两阶段训练 |
| ★ UI-TARS (Y. Qin et al.) | arXiv | 2025 | [arXiv:2501.12326](https://arxiv.org/abs/2501.12326) | 原生端到端智能体模型 |
| Jedi / OSWorld-G (T. Xie et al.) | NeurIPS D&B | 2025 | [arXiv:2505.13227](https://arxiv.org/abs/2505.13227) | 400 万合成样本；o3 + Jedi 在 OSWorld 上 23% -> 51% |
| ★ GUI-Actor (Q. Wu et al.) | NeurIPS | 2025 | [arXiv:2506.03143](https://arxiv.org/abs/2506.03143) | 无坐标注意力热图 + 验证器 |
| Ferret-UI Lite (Z. Yang et al.) | arXiv | 2025 | [arXiv:2509.26539](https://arxiv.org/abs/2509.26539) | 3B 端侧智能体 |
| Mobile-Agent-v3 / GUI-Owl (J. Ye et al.) | arXiv | 2025 | [arXiv:2508.15144](https://arxiv.org/abs/2508.15144) | 开源原生模型 + 多智能体框架 |
| MAI-UI (H. Zhou et al.) | arXiv | 2025 | [arXiv:2512.22047](https://arxiv.org/abs/2512.22047) | 端云协同、MCP 与用户交互进入动作空间 |
| Mobile-Agent-v3.5 / GUI-Owl-1.5 (H. Xu et al.) | arXiv | 2026 | [arXiv:2602.16855](https://arxiv.org/abs/2602.16855) | 2B-235B 多平台开源模型 |
| UI-Venus-2 (Venus Team) | arXiv | 2026 | [arXiv:2609.00028](https://arxiv.org/abs/2609.00028) | ScreenSpot-Pro 单次 74.1（27B） |
| GroundCascade (Phoulady et al.) | arXiv | 2026 | [arXiv:2611.13177](https://arxiv.org/abs/2611.13177) | 级联定位，ScreenSpot-Pro 85.33 |

### 2.4 训练：数据、强化学习、世界模型

| 论文 | 出处 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| On the Effects of Data Scale on UI Control Agents (AndroidControl, W. Li et al.) | NeurIPS D&B | 2024 | [arXiv:2406.03679](https://arxiv.org/abs/2406.03679) | 域内随数据增长，域外增长缓慢 |
| ★ DigiRL (H. Bai et al.) | NeurIPS | 2024 | [arXiv:2406.11896](https://arxiv.org/abs/2406.11896) | 离线到在线 RL；1.3B 模型 17.7% -> 67.2% |
| WebRL (Z. Qi et al.) | ICLR | 2025 | [arXiv:2411.02337](https://arxiv.org/abs/2411.02337) | 由失败生成课程 + 结果奖励模型 |
| AgentTrek (Y. Xu et al.) | ICLR | 2025 | [arXiv:2412.09605](https://arxiv.org/abs/2412.09605) | 教程回放合成轨迹，约 0.55 美元/条 |
| ★ OS-Genesis (Q. Sun et al.) | ACL | 2025 | [arXiv:2412.19723](https://arxiv.org/abs/2412.19723) | 反向任务合成：先探索、再命名任务 |
| ★ UI-R1 (Z. Lu et al.) | arXiv | 2025 | [arXiv:2503.21620](https://arxiv.org/abs/2503.21620) | 136 个任务的规则奖励 GRPO |
| GUI-R1 (R. Luo et al.) | arXiv | 2025 | [arXiv:2504.10458](https://arxiv.org/abs/2504.10458) | 约 3K 样本的 R1 式训练 |
| GUI-G1 (Y. Zhou et al.) | arXiv | 2025 | [arXiv:2505.15810](https://arxiv.org/abs/2505.15810) | 框大小约束对抗奖励投机 |
| GUI-G² (F. Tang et al.) | arXiv | 2025 | [arXiv:2507.15846](https://arxiv.org/abs/2507.15846) | 高斯点奖励与覆盖奖励 |
| ★ UI-TARS-2 (H. Wang et al.) | arXiv | 2025 | [arXiv:2509.02544](https://arxiv.org/abs/2509.02544) | 大规模多轮 RL、GUI + 终端沙箱 |
| ComputerRL (H. Lai et al.) | arXiv | 2025 | [arXiv:2508.14040](https://arxiv.org/abs/2508.14040) | API-GUI 动作 + 数千虚拟机 RL |
| ★ How Far Does Online RL Generalize in Mobile GUI Agents? (L. Gu et al.) | arXiv | 2026 | [arXiv:2603.07432](https://arxiv.org/abs/2603.07432) | 在未见应用上 RL 增益缩小到 +4.2 / +0 |
| MobileGym (D. Wu et al.) | EMNLP | 2026 | [arXiv:2605.26114](https://arxiv.org/abs/2605.26114) | 浏览器内手机模拟器，95.1% 增益迁移到真机 |
| Qwen-UI-Agent (H. Zhou et al.) | arXiv | 2026 | [arXiv:2607.28227](https://arxiv.org/abs/2607.28227) | GUI + CLI，1 万+ 并发 RL 环境 |
| MAI-Gym (P. Tong et al.) | arXiv | 2026 | [arXiv:2610.20939](https://arxiv.org/abs/2610.20939) | 2 万并行实例、合成应用 |
| Web Agents with World Models (WMA, Chae et al.) | ICLR | 2025 | [arXiv:2410.13232](https://arxiv.org/abs/2410.13232) | 预测"变化了什么"的文本世界模型 |
| Is Your LLM Secretly a World Model of the Internet? (WebDreamer, Y. Gu et al.) | TMLR | 2025 | [arXiv:2411.06559](https://arxiv.org/abs/2411.06559) | LLM 想象候选动作的结果 |
| NeuralOS (Rivard et al.) | ICLR | 2026 | [arXiv:2507.08800](https://arxiv.org/abs/2507.08800) | 扩散渲染器模拟桌面 |
| ★ Code2World (Y. Zheng et al.) | arXiv | 2026 | [arXiv:2602.09856](https://arxiv.org/abs/2602.09856) | 以可渲染 HTML 预测下一屏 |

### 2.5 基准与评测

| 论文 | 出处 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| Mind2Web (X. Deng et al.) | NeurIPS D&B | 2023 | [arXiv:2306.06070](https://arxiv.org/abs/2306.06070) | 2000+ 网页任务，离线逐步评测 |
| ★ WebArena (S. Zhou et al.) | ICLR | 2024 | [arXiv:2307.13854](https://arxiv.org/abs/2307.13854) | 自托管网站 + 功能正确性检查 |
| ★ OSWorld (T. Xie et al.) | NeurIPS D&B | 2024 | [arXiv:2404.07972](https://arxiv.org/abs/2404.07972) | 369 个执行检查的电脑任务；人类 72.36% |
| ★ AndroidWorld (Rawles et al.) | ICLR | 2025 | [arXiv:2405.14573](https://arxiv.org/abs/2405.14573) | 参数化任务 + 程序化检查（已饱和） |
| Windows Agent Arena (Bonatti et al.) | ICML | 2025 | [arXiv:2409.08264](https://arxiv.org/abs/2409.08264) | Windows 版 OSWorld 风格基准 |
| ★ ScreenSpot-Pro (K. Li et al.) | ACM MM | 2025 | [arXiv:2504.07981](https://arxiv.org/abs/2504.07981) | 专业高分辨率软件中的小目标定位 |
| ★ An Illusion of Progress? (Online-Mind2Web, T. Xue et al.) | COLM | 2025 | [arXiv:2504.01382](https://arxiv.org/abs/2504.01382) | 真实网站评测揭示过度乐观 |
| OSWorld-Human (Abhyankar et al.) | arXiv | 2025 | [arXiv:2506.16042](https://arxiv.org/abs/2506.16042) | 智能体步数是必要步数的 2.7-4.3 倍 |
| MobileWorld (Q. Kong et al.) | arXiv | 2025 | [arXiv:2512.19432](https://arxiv.org/abs/2512.19432) | 跨应用长程任务，含询问用户与 MCP |
| ★ OSWorld 2.0 (M. Yuan et al.) | arXiv | 2026 | [arXiv:2606.29537](https://arxiv.org/abs/2606.29537) | 108 个长流程；最佳 20.6% |
| GUI-World (D. Chen et al.) | ICLR | 2025 | [arXiv:2406.10819](https://arxiv.org/abs/2406.10819) | 含 393 个 XR 界面视频（问答而非操作） |

### 2.6 人在回路、无障碍、安全与隐私

| 论文 | 出处 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| ★ Morae: Proactively Pausing UI Agents for User Choices (Y.-H. Peng et al.) | UIST | 2025 | [arXiv:2508.21456](https://arxiv.org/abs/2508.21456) | 在歧义处暂停，为盲人与低视力用户生成选择界面 |
| When Should Users Check? (J. Zhou et al.) | CHI | 2026 | [arXiv:2510.05307](https://arxiv.org/abs/2510.05307) | 确认频率作为调度问题；81% 偏好中途确认 |
| From Struggle to Success: Context-Aware Guidance for Screen Reader Users (N. Chen et al.) | CHI | 2026 | [arXiv:2601.18092](https://arxiv.org/abs/2601.18092) | "引导我"而非"替我做" |
| A11y-CUA Dataset (Gubbi Mohanbabu et al.) | CHI | 2026 | [arXiv:2602.09310](https://arxiv.org/abs/2602.09310) | 仅键盘 41.67%、放大镜 28.3% |
| Attacking Vision-Language Computer Agents via Pop-ups (Y. Zhang et al.) | ACL | 2025 | [arXiv:2411.02391](https://arxiv.org/abs/2411.02391) | 弹窗攻击成功率 86% |
| VPI-Bench (T. Cao et al.) | ICLR | 2026 | [arXiv:2506.02456](https://arxiv.org/abs/2506.02456) | 视觉提示注入基准 |
| OS-Harm (Kuntz et al.) | NeurIPS D&B | 2025 | [arXiv:2506.14866](https://arxiv.org/abs/2506.14866) | 误用、注入、不当行为三类危害 |
| Benchmarking Web Agent Defenses Against Adaptive Visual Prompt Injection (H. Zhang et al.) | arXiv | 2026 | [arXiv:2611.29268](https://arxiv.org/abs/2611.29268) | 自适应攻击对 21 种防御配置约 92% 成功 |
| PriMobiBench (Q. Cen et al.) | ACM CCS | 2026 | [arXiv:2609.13873](https://arxiv.org/abs/2609.13873) | 截图隐私泄露；遮罩可减少画像推断 |

### 2.7 综述与资源

- ★ Large Language Model-Brained GUI Agents: A Survey（C. Zhang et al., arXiv 2024）[arXiv:2411.18279](https://arxiv.org/abs/2411.18279)：最完整的路线图。
- OS Agents: A Survey on MLLM-based Agents for General Computing Devices Use（X. Hu et al., ACL 2025）[arXiv:2508.04482](https://arxiv.org/abs/2508.04482)。
- Reinforcement Learning in GUI Agents: A Survey Toward Digital Inhabitants（J. Hu et al., TMLR 2026）[arXiv:2604.27955](https://arxiv.org/abs/2604.27955)。
- 可运行环境：[AndroidWorld](https://github.com/google-research/android_world)、[OSWorld](https://github.com/xlang-ai/OSWorld)、[WebArena](https://github.com/web-arena-x/webarena)。
- 开源智能体与模型：[Agent S](https://github.com/simular-ai/Agent-S)、[UI-TARS](https://github.com/bytedance/UI-TARS)、[OmniParser](https://github.com/microsoft/OmniParser)、[OpenCUA](https://github.com/xlang-ai/OpenCUA)。
- 厂商安全设计：OpenAI [Operator system card](https://openai.com/index/operator-system-card)；Anthropic [computer use 发布说明](https://www.anthropic.com/news/3-5-models-and-computer-use)。
