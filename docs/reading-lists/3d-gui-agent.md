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
# 阅读清单：3D GUI 智能体（3d-gui-agent）

本清单配合研究专栏「3D GUI Agent」（`_posts/*/2026-11-24-3d-gui-agent-*.md`）使用。
每篇文章对应一节（`## NN 主题`）；每篇论文给出会议/期刊（或状态）、年份、链接和一句话说明。论文标题保留英文。
近期工作注明状态（已发表 / 已接收 / 预印本），日期以 2026 年 11 月为准。

---

## 04 XR 中的 AI 智能体：最接近的工作、平台与空白

对应文章：`2026-11-24-3d-gui-agent-04-agents-in-xr-and-the-gap.md`。主要来源：
`docs/research/3d-gui-agent/03-agents-in-xr-and-3d.md` 与 `04-platforms-and-tooling.md`。

### 最接近的工作（XR 界面的定位与操作）

| 论文 | 会议/期刊（状态） | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Look Before You Leap: Context-Sensitive GUI Grounding for Boosting Automated Extended Reality (XR) Testing (Orienter; Li et al.) | FSE 2026，PACMSE 3(FSE)（arXiv 题为 Grounded GUI Understanding for Vision-Based Spatial Intelligent Agent） | 2026 | https://doi.org/10.1145/3808134 | 零样本检测 VR 截图中的可交互 GUI 元素；IoU 0.75 下 F1 44.1%；唯一经同行评审的 XR 界面像素级定位工作 |
| ComboBench: Can LLMs Manipulate Physical Devices to Play VR Games? (Li et al.) | arXiv 预印本 | 2025 | https://arxiv.org/abs/2510.24706 | 语义动作 → 手柄/头显操作序列；最佳完全匹配仅 11.7% |
| NavAI: A Generalizable LLM Framework for Navigation Tasks in Virtual Reality Environments (Qin, DiGiovanni) | ASE 2025 Workshops（arXiv 2026） | 2025 | https://arxiv.org/abs/2601.03251 | 语言 + VR 截图 → 移动动作的闭环；16/18 任务成功，每轮约 49 s；不涉及界面 |
| SIAgent: Spatial Interaction Agent via LLM-powered Eye-Hand Motion Intent Understanding in VR (Wang, Gu, Lu) | IEEE TVCG 32(7)（DOI 10.1109/TVCG.2026.3686395） | 2026 | https://arxiv.org/abs/2603.00522 | 从眼手运动推断意图并由虚拟手执行；意图识别 97.2%，LLM 延迟约 9.1 s |
| Revisiting put-that-there, context aware window interactions via LLMs (Bovo et al.) | ISMAR 2025 Adjunct（据 OpenAlex） | 2025 | https://arxiv.org/abs/2511.02378 | 语音 + 指向 + 注视 → JSON 窗口放置动作；尚无定量评测 |
| DuoZone: A User-Centric, LLM-Guided Mixed-Initiative XR Window Management System (Qian et al.) | IEEE TVCG（2026-11-03 在线发表，据 OpenAlex） | 2026 | https://arxiv.org/abs/2511.15676 | Vision Pro 上的混合主动窗口布局；N=16，布局匹配快 34.5% |
| Voice2Action: Language Models as Agent for Efficient Real-Time Interaction in Virtual Reality (Su) | arXiv 预印本 | 2023 | https://arxiv.org/abs/2310.00092 | 早期的语言 → VR 动作智能体（经引擎 API） |
| A Benchmarking Framework for Context-aware XR Interfaces (ContextXR; Cho et al.) | UIST 2026（据 OpenAlex） | 2026 | https://arxiv.org/abs/2609.30466 | 把 XR 应用建模为功能面图；预测下一功能面，不行动 |

### 构建 / 编辑 XR 世界的 LLM 与智能体基础设施

| 论文 | 会议/期刊（状态） | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| LLMR: Real-time Prompting of Interactive Worlds using Large Language Models (De La Torre et al.) | CHI 2024（荣誉提名） | 2024 | https://doi.org/10.1145/3613904.3642579 | 多个 GPT-4 角色读取场景图并生成 C#；说明 LLM 能理解 XR 场景结构 |
| LLMER: Crafting Interactive Extended Reality Worlds with JSON Data Generated by Large Language Models (Chen et al.) | IEEE TVCG 31(5) | 2025 | https://arxiv.org/abs/2502.02441 | 用 JSON 代替代码，token 减少 80% 以上 |
| VRCopilot: Authoring 3D Layouts with Generative AI Models in VR (Zhang et al.) | UIST 2024 | 2024 | https://arxiv.org/abs/2408.09382 | 脚手架式协作提高用户主导感 |
| GenXR-Bench: Benchmarking Coding Agents for Interactive XR Development (Huang et al.) | arXiv 预印本 | 2026 | https://arxiv.org/abs/2610.29014 | 112 个 XR 开发任务；其 VLM「演员」API 是现成的 3D 界面动作空间 |
| ControlAnything: Generative UI and On-Demand Device Integration for Mixed-Reality Hand Interaction by a Coding Agent (Ryskeldiev) | arXiv 预印本 | 2026 | https://arxiv.org/abs/2611.08321 | 在 Quest 3 上按需生成 AR 控件；中位数 32.5 s |
| XARP: A Human-First and Agent-Ready Extended Reality Toolkit in Python（arXiv 题为 XARP Tools; Caetano et al.） | PACM HCI 10(4)（EICS） | 2026 | https://doi.org/10.1145/3816762 | 以工具和 MCP 形式向智能体开放 XR 工具包 |
| Introducing Meta XR Operator (Meta 开发者博客) | 产品 / SDK v205，实验性 | 2026 | https://developers.meta.com/horizon/blog/meta-xr-operator-close-the-build-test-verify-loop-for-vr/ | OpenXR API 层 + MCP：截图、房间几何、Unity 层级、手柄输入；「too slowly for real-time interaction」 |

### 回答 / 引导型 XR 助手

| 论文 | 会议/期刊（状态） | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| GazePointAR (Lee et al.) | CHI 2024 | 2024 | https://arxiv.org/abs/2404.08213 | 用注视与指向解析代词 |
| EmBARDiment: an Embodied AI Agent for Productivity in XR (Bovo et al.) | IEEE VR 2025 | 2025 | https://arxiv.org/abs/2408.08158 | 以注视选中的 XR 窗口内容作为 LLM 上下文 |
| Satori: Towards Proactive AR Assistant with Belief-Desire-Intention User Modeling (Li et al.) | CHI 2025 | 2025 | https://doi.org/10.1145/3706598.3714188 | 主动式 AR 引导；N=16 不劣于设计师搭建的绿野仙踪系统 |
| Sensible Agent: A Framework for Unobtrusive Interaction with Proactive AR Agents (Lee et al.) | UIST 2025 | 2025 | https://arxiv.org/abs/2509.09255 | 决定如何询问、通过哪种通道；Android XR 上的 WebXR |
| Guided Reality (Zhao et al.) | UIST 2025 | 2025 | https://arxiv.org/abs/2508.03547 | 五类空间视觉引导 |
| AgentHands (Liu et al.) | CHI 2026 | 2026 | https://research.google/pubs/agenthands-generating-interactive-hands-gestures-for-spatially-grounded-agent-conversations-in-xr/ | 智能体之手在 XR 中指点和演示 |

### XR 应用的自动化操作与测试

| 论文 | 会议/期刊（状态） | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| VRExplorer (Zhu et al.) | ASE 2025 | 2025 | https://arxiv.org/abs/2607.10174 | 实体-动作-任务模型 + NavMesh 自动抓取/触发 VR 物体 |
| Automated Testing of Prevalent 3D User Interactions in Virtual Reality Applications (XRintTest; Gu et al.) | Automated Software Engineering 33(3)（DOI 10.1007/s10515-026-00620-1） | 2026 | https://arxiv.org/abs/2601.23139 | 交互流图；XRBench3D 456 个交互，覆盖 93% |
| AUTOVR (Kim et al.) | USENIX Security 2025 | 2025 | https://arxiv.org/abs/2508.12187 | 二进制插桩驱动 366 个商业 Quest 应用的界面 |
| ExploreAI (Wang et al.) | arXiv 预印本 | 2026 | https://arxiv.org/abs/2608.21628 | LLM 智能体探索黑盒 VR/3D 应用 |
| VRSight / DISCOVR (Killough et al.) | UIST 2025 | 2025 | https://arxiv.org/abs/2508.02958 | 最大的 VR 界面元素检测数据集（17,691 帧） |
| Characterizing Virtual Reality Software Testing (Rzig et al.) | ISSTA 2023 | 2023 | https://arxiv.org/abs/2211.01992 | 314 个 Unity VR 应用中 79% 没有自动化测试 |
| Software Engineering Practice in the VR/AR Software Life Cycle: A Systematic Survey (Guo et al.) | arXiv 预印本（投稿 TSE） | 2026 | https://arxiv.org/abs/2611.18567 | 把面向 VR GUI 探索的 LLM 智能体列为开放问题 |

### 通过渲染视图在 3D 中行动的智能体

| 论文 | 会议/期刊（状态） | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Scaling Instructable Agents Across Many Simulated Worlds (SIMA) | arXiv 技术报告 | 2024 | https://arxiv.org/abs/2404.10179 | 像素 → 键鼠，跨 10 余款 3D 游戏 |
| SIMA 2: A Generalist Embodied Agent for Virtual Worlds | arXiv 预印本 | 2025 | https://arxiv.org/abs/2512.04797 | 基础模型兼任规划器与策略，可自我提升 |
| Lumine: An Open Recipe for Building Generalist Agents in 3D Open Worlds (Tan et al.) | arXiv 预印本 | 2025 | https://arxiv.org/abs/2511.08892 | 首个动作 0.11-0.23 s 的实时 3D 智能体 |
| VideoGameBench (Zhang et al.) | arXiv 预印本 | 2025 | https://arxiv.org/abs/2505.18134 | 实时 0.48% 对暂停时 1.6%：XR 不能暂停 |
| Embodied Web Agents (Hong et al.) | NeurIPS 2025 D&B | 2025 | https://arxiv.org/abs/2506.15677 | 3D 世界与网页之间的切换是主要失败原因（66.6%） |

### 头显 / 眼镜上的助手与空间理解

| 论文 / 产品 | 会议/期刊（状态） | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Introducing Galaxy XR (Google 博客) | 产品，2025-10 上市 | 2025 | https://blog.google/products/android/samsung-galaxy-xr | 宣称 Gemini 能跨应用代为操作、整理窗口；机制与评测未公开 |
| Apple Siri AI 发布（Apple Newsroom） | 产品，WWDC 2026-06-08 | 2026 | https://www.apple.com/newsroom/2026/06/apple-unveils-next-generation-of-apple-intelligence-siri-ai-and-more/ | 通过 App Intents 的应用动作；API 优先 |
| VisionClaw: Always-On AI Agents through Smart Glasses (Liu et al.) | arXiv 预印本 | 2026 | https://arxiv.org/abs/2604.03486 | 眼镜智能体通过服务而非界面行动 |
| Thinking in Space (VSI-Bench; Yang et al.) | CVPR 2025 | 2025 | https://arxiv.org/abs/2412.14171 | 最佳 MLLM 45.4% 对人类约 79%：空间记忆薄弱 |

### 数据、隐私与人机协作

| 论文 | 会议/期刊（状态） | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| GUI-World (Chen et al.) | ICLR 2025 | 2025 | https://arxiv.org/abs/2406.10819 | 唯一含 XR 子集（393 个视频）的 GUI 基准 |
| MineXR (Cho et al.) | CHI 2024 | 2024 | https://arxiv.org/abs/2403.08057 | 31 人、695 个控件、109 种布局 |
| Unique Identification of 50,000+ Virtual Reality Users from Head & Hand Motion Data (Nair et al.) | USENIX Security 2023 | 2023 | https://arxiv.org/abs/2302.08927 | 100 s 运动数据识别 94.33% 的用户：轨迹是生物特征数据 |
| Can AR Embedded Visualizations Foster Appropriate Reliance on AI in Spatial Decision-Making? (Liu et al.) | CHI 2026（据 arXiv） | 2026 | https://arxiv.org/abs/2507.14316 | 原位 AI 输出导致过度依赖 |
| Mitigating Response Delays in Free-Form Conversations with LLM-powered Intelligent Virtual Agents (Maslych et al.) | CUI 2025 | 2025 | https://arxiv.org/abs/2507.22352 | VR 中超过约 4 s 的延迟降低体验质量 |
| MetaScanner (Lee et al.) | Computers & Security（已接收，据 arXiv） | 2026 | https://arxiv.org/abs/2611.25608 | 社交 VR 中的欺骗性界面攻击 |

### 平台文档、工具与代码

- Android XR 模拟器：https://developer.android.com/develop/xr/jetpack-xr-sdk/run/emulator/xr-headsets-glasses
- Compose for XR 测试包（3D 语义树）：https://developer.android.com/reference/kotlin/androidx/xr/compose/testing/package-summary
- Apple XCUIAutomation（visionOS SDK 应用不支持 UI 测试）：https://developer.apple.com/documentation/xcuiautomation
- RealityKit `AccessibilityComponent`：https://developer.apple.com/documentation/realitykit/accessibilitycomponent
- IWER：https://github.com/meta-quest/immersive-web-emulation-runtime ；Immersive Web SDK：https://github.com/facebook/immersive-web-sdk ；IWSDK AI 工具：https://developers.meta.com/horizon/documentation/web/iwsdk-ai-assisted-dev-tooling
- OpenXR API 层：https://github.com/KhronosGroup/OpenXR-SDK-Source/blob/main/src/api_layers/README.md ；Monado：https://monado.freedesktop.org/developing-with-monado.html
- W3C XR Accessibility User Requirements：https://www.w3.org/TR/xaur/
# 3D GUI 智能体（3D GUI Agent）阅读清单

对应博客专栏 `3d-gui-agent`（5 篇）。每篇一节，按主题组织；先读带 ★ 的条目。
链接均已核对（arXiv / DOI / 官方页面，核对日期 2026-11-24）；预印本注明状态。

---

## 第 3 篇：为什么 3D 界面难以操作：证据（`3d-gui-agent-03-why-3d-interfaces-are-hard`）

主要来源：`docs/research/3d-gui-agent/02-3d-ui-and-xr-interaction.md`（162 篇文献、30 项操作目录）。

### 3.1 三维交互的任务分类与指向模型

| 论文 | 会议/期刊 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| ★ 3D User Interfaces: Theory and Practice, 2nd ed.（LaViola, Kruijff, McMahan, Bowman, Poupyrev） | Addison-Wesley（书） | 2017 | [书籍主页](https://people.cs.vt.edu/~bowman/3dui.org/Table_of_Contents.html) | 选择、操纵、移动/寻路、系统控制、符号输入五类任务；系统控制即“用户说做什么，系统决定怎么做” |
| Towards a standard for pointing device evaluation（Soukoreff, MacKenzie） | IJHCS | 2004 | [DOI](https://doi.org/10.1016/j.ijhcs.2004.09.001) | ISO 9241-9 吞吐量的计算方法 |
| Pointing at trivariate targets in 3D environments（Grossman, Balakrishnan） | CHI | 2004 | [DOI](https://doi.org/10.1145/985692.985749) | 三维中难度取决于运动方向上的目标尺寸 |
| A human motor behavior model for distal pointing tasks（Kopper et al.） | IJHCS | 2010 | [DOI](https://doi.org/10.1016/j.ijhcs.2010.05.001) | 远距指向由角度大小决定，而非物理尺寸 |
| ★ A survey of 3D object selection techniques for virtual environments（Argelaguet, Andujar） | Computers & Graphics | 2013 | [DOI](https://doi.org/10.1016/j.cag.2012.12.003) | 三维选择为何失败；消歧分类；驻留阈值 350–600 ms |
| ★ The effect of stereo display deficiencies on virtual hand pointing（Barrera Machuca, Stuerzlinger） | CHI | 2019 | [DOI](https://doi.org/10.1145/3290605.3300437) | 深度方向移动慢 25%；含深度变化项的 Fitts 模型 |
| Do HMD stereo deficiencies affect 3D pointing tasks in AR and VR?（Batmaz et al.） | IEEE VR | 2019 | [DOI](https://doi.org/10.1109/VR.2019.8797975) | 在商用头显上复现深度代价 |
| Revisiting performance models of distal pointing tasks in VR（Lane et al.） | IEEE TVCG | 2025 | [DOI](https://doi.org/10.1109/TVCG.2025.3567078) | Quest 2 上角度版 Fitts 指数 R² = 97.86% |
| Direct vs. score-based selection: the Heisenberg effect（Qiu et al.） | arXiv 预印本（作者称已被 TVCG / IEEE VR 2026 接收） | 2026 | [arXiv](https://arxiv.org/abs/2602.01061) | 8 m 射线选择中 72–81% 的错误来自确认动作 |
| Evaluating the vergence-accommodation conflict in gaze-based 3D target selection（Bashar et al.） | arXiv 预印本（IEEE TVCG / ISMAR 2026） | 2026 | [arXiv](https://arxiv.org/abs/2607.27369) | 注视+捏合的代价随深度增长；屈光度变化项 |

### 3.2 现代 XR 输入：注视、捏合、双手、手柄、语音、肌电

| 论文 | 会议/期刊 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| "Put-that-there": voice and gesture at the graphics interface（Bolt） | SIGGRAPH | 1980 | [DOI](https://doi.org/10.1145/800250.807503) | 指示性命令的原型 |
| ★ What you look at is what you get（Jacob） | CHI | 1990 | [DOI](https://doi.org/10.1145/97243.97246) | 提出注视输入的点石成金（Midas touch）问题 |
| Fast gaze typing with an adjustable dwell time（Majaranta et al.） | CHI | 2009 | [DOI](https://doi.org/10.1145/1518701.1518758) | 驻留时间可调后注视打字从 6.9 提升到 19.9 wpm |
| ★ Gaze + pinch interaction in virtual reality（Pfeuffer et al.） | SUI | 2017 | [DOI](https://doi.org/10.1145/3131277.3132180) | visionOS 输入模型的研究源头 |
| Design principles and issues for gaze and pinch interaction（Pfeuffer et al.） | arXiv（IEEE CG&A 2024） | 2024 | [arXiv](https://arxiv.org/abs/2401.10948) | 五条原则与早/晚触发等问题 |
| Pinch, click, or dwell（Mutasim et al.） | ETRA | 2021 | [DOI](https://doi.org/10.1145/3448018.3457998) | 驻留错误最少但明显更慢 |
| ★ A Fitts' law study of gaze-hand alignment for selection in 3D UIs（Wagner et al.） | CHI | 2023 | [DOI](https://doi.org/10.1145/3544548.3581423) | 五种徒手技术的 Fitts 模型；Gaze & Pinch 斜率平 2.5 倍 |
| Controllers or bare hands?（Luong et al.） | IEEE TVCG | 2023 | [DOI](https://doi.org/10.1109/TVCG.2023.3320211) | 即使追踪完美，徒手射线也更慢、更不准、更累 |
| A preliminary study of the eye tracker in the Meta Quest Pro（Wei et al.） | IMX | 2023 | [DOI](https://doi.org/10.1145/3573381.3596467) | 眼动追踪精度 1.652° |
| The eye-tracking accuracy of Apple Vision Pro（Huang et al.） | Virtual Reality | 2026 | [DOI](https://doi.org/10.1007/s10055-026-01442-y) | 从外部测得 0.45–1.06°；应用无法读取注视 |
| A generic non-invasive neuromotor interface（Kaifosh et al.） | Nature | 2025 | [DOI](https://doi.org/10.1038/s41586-025-09255-w) | 肌电腕带：0.88 手势/s，手写 20.9 wpm |

### 3.3 空间 UI 结构、参考系与平台指南

| 论文 / 文档 | 会议/期刊 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| Windows on the world（Feiner et al.） | UIST | 1993 | [DOI](https://doi.org/10.1145/168642.168657) | 头部、身体、世界固定窗口的最早分类 |
| An evaluation of wearable information spaces（Billinghurst et al.） | VRAIS | 1998 | [DOI](https://doi.org/10.1109/VRAIS.1998.658418) | 身体稳定显示优于头部稳定显示 |
| The personal cockpit（Ens et al.） | CHI | 2014 | [DOI](https://doi.org/10.1145/2556288.2557058) | 以身体为中心的窗口布局，切换快 40% |
| User preferences for UI anchoring in MR（Belo et al.） | arXiv 预印本（已被 IEEE ISMAR 2026 接收） | 2026 | [arXiv](https://arxiv.org/abs/2608.28064) | 行走时用户从世界锚定转向身体锚定 |
| Virtual monitors vs. physical monitors（Pavanatto et al.） | Frontiers in VR | 2023 | [DOI](https://doi.org/10.3389/frvir.2023.1215820) | 虚拟显示器舒适度低 37%、专注度低 24% |
| Quantifying the effects of working in VR for one week（Biener et al.） | IEEE TVCG | 2022 | [DOI](https://doi.org/10.1109/TVCG.2022.3203103) | 连续一周 VR 办公，多项指标变差 |
| ★ Apple visionOS Human Interface Guidelines | 官方文档 | 2023– | [HIG](https://developer.apple.com/design/human-interface-guidelines/designing-for-visionos) | 窗口、体积、沉浸空间；角度单位的点；目标尺寸 |
| Android XR design guidelines | 官方文档 | 2024– | [文档](https://developer.android.com/design/ui/xr) | Home/Full Space；1.75 m 启动；视野中央 41° |
| Meta Horizon OS design guidelines | 官方文档 | 2025– | [文档](https://developers.meta.com/horizon/design/panels/) | 触控 42–46 cm；“1 主 + 2 辅”窗口 |
| Microsoft Mixed Reality comfort | 官方文档 | 2018– | [文档](https://learn.microsoft.com/en-us/windows/mixed-reality/design/comfort) | 1.25–5 m 舒适区；视线与颈部角度 |

### 3.4 实测困难：疲劳、错误、文本输入、学习、晕动、社会接受度

| 论文 | 会议/期刊 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| Simulator Sickness Questionnaire（Kennedy et al.） | Int. J. Aviation Psychology | 1993 | [DOI](https://doi.org/10.1207/s15327108ijap0303_3) | SSQ 量表 |
| Usable gestures for mobile interfaces: evaluating social acceptability（Rico, Brewster） | CHI | 2010 | [DOI](https://doi.org/10.1145/1753326.1753458) | 地点与观众影响手势意愿 |
| ★ Consumed endurance（Hincapié-Ramos et al.） | CHI | 2014 | [DOI](https://doi.org/10.1145/2556288.2557130) | 用骨架数据量化“大猩猩手臂”疲劳 |
| A dose of reality（McGill et al.） | CHI | 2015 | [DOI](https://doi.org/10.1145/2702123.2702382) | VR 中看不到现实时打字错误率 30.86% |
| Tap, dwell or gesture? Head-based text entry（Yu et al.） | CHI | 2017 | [DOI](https://doi.org/10.1145/3025453.3025964) | 头部输入 10.6–19.0 wpm，训练后 24.7 |
| ★ Selection-based text entry in virtual reality（Speicher et al.） | CHI | 2018 | [DOI](https://doi.org/10.1145/3173574.3174221) | 六种 VR 键盘 5.3–15.4 wpm |
| Text entry in immersive HMD-based VR using standard keyboards（Grubert et al.） | IEEE VR | 2018 | [DOI](https://doi.org/10.1109/VR.2018.8446059) | 台式键盘在 VR 中从 41.4 降到 26.3 wpm |
| Physical keyboards in virtual reality（Knierim et al.） | CHI | 2018 | [DOI](https://doi.org/10.1145/3173574.3173919) | 新手打字者在 VR 中损失最大 |
| Virtual reality on the go?（Schwind et al.） | MobileHCI Adjunct | 2018 | [DOI](https://doi.org/10.1145/3236112.3236127) | 客厅、咖啡馆中戴 VR 眼镜接受度低 |
| Mobile typing with 37,000 volunteers（Palin et al.） | MobileHCI | 2019 | [DOI](https://doi.org/10.1145/3338286.3340120) | 手机基线 36.2 wpm |
| Performance envelopes of virtual keyboard text input strategies（Dudley et al.） | ISMAR | 2019 | [DOI](https://doi.org/10.1109/ISMAR.2019.00027) | 理想追踪下的上限：55.6 / 34.5 wpm |
| ★ Factors associated with VR sickness in HMDs（Saredakis et al.） | Front. Hum. Neurosci. | 2020 | [DOI](https://doi.org/10.3389/fnhum.2020.00096) | 合并 SSQ 28.00；15.6% 因晕动退出 |
| You're making me sick（MacArthur et al.） | CHI | 2021 | [DOI](https://doi.org/10.1145/3411764.3445701) | 晕动的性别差异证据受研究设计混淆 |
| ★ "Do I just tap my headset?"（Khurana et al.） | IMWUT | 2023 | [DOI](https://doi.org/10.1145/3631451) | 新手主要败在发现手势与判断结果 |
| NICER（Li et al.） | ACM TOG | 2024 | [DOI](https://doi.org/10.1145/3658230) | 含恢复的疲劳模型，与 Borg CR10 相关 0.978 |
| Bumpy ride?（Sasalovici et al.） | CHI | 2025 | [DOI](https://doi.org/10.1145/3706598.3714077) | 车内选择错误率 8.8–23.5%（停车）/ 20.4–36.0%（行驶） |
| Text Entry for XR Trove（Bhatia et al.） | CHI | 2025 | [DOI](https://doi.org/10.1145/3706598.3713382) | 176 种 XR 文本输入技术，均值 20.36 wpm |

### 3.5 普及障碍与市场数据

| 论文 / 来源 | 类型 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| ★ Consumer perceptions of VR devices in the post-adoption phase（Dehghani et al.） | Behaviour & IT | 2021 | [DOI](https://doi.org/10.1080/0144929X.2021.1876767) | 3,205 条评论：不适 39%，易用性 7% |
| ★ Wearable AR in everyday contexts（Tran et al.） | CHI | 2025 | [DOI](https://doi.org/10.1145/3706598.3713572) | 日常使用中交互层的摩擦 |
| Adoption of VR headsets: the role of metaverse trials（Hennig-Thurau et al.） | J. Interactive Marketing | 2025 | [DOI](https://doi.org/10.1177/10949968241263353) | 试用后更想用、更不想买 |
| The user affordances of Apple Vision Pro（Tafesse） | SAGE Open | 2026 | [DOI](https://doi.org/10.1177/21582440261464433) | 早期用户认为界面直观（反证） |
| IDC AR/VR 与 XR 出货新闻稿 | 分析机构估计 | 2023–2026 | [IDC 2026-03-23](https://www.idc.com/resource-center/press-releases/xr-market-grew-44-4-in-2025-as-smart-glasses-redefine-the-category/) | 头显下滑、眼镜增长 |
| Meta Q4/FY2025 业绩 | 公司公告 | 2026 | [新闻稿](https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Fourth-Quarter-and-Full-Year-2025-Results/) | Reality Labs 2025 年亏损 192 亿美元 |

### 3.6 XR 无障碍

| 论文 / 文档 | 会议/期刊 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| ★ SeeingVR（Zhao et al.） | CHI | 2019 | [DOI](https://doi.org/10.1145/3290605.3300341) | 低视力工具；事后注入与开发者元数据之分 |
| Understanding the accessibility of VR for people with limited mobility（Mott et al.） | ASSETS | 2020 | [DOI](https://doi.org/10.1145/3373625.3416998) | 七类肢体可达性障碍 |
| A critical examination of VR technology in the context of the minority body（Gerling, Spiel） | CHI | 2021 | [DOI](https://doi.org/10.1145/3411764.3445196) | VR 预设了“标准身体” |
| Inclusive immersion（Dudley et al.） | Virtual Reality | 2023 | [DOI](https://doi.org/10.1007/s10055-023-00850-8) | XR 无障碍综述 |
| ★ VRSight（Killough et al.） | UIST | 2025 | [DOI](https://doi.org/10.1145/3746059.3747641) | 能描述场景却难以操作：菜单任务完成率 11% |
| XR Accessibility User Requirements | W3C 工作组说明 | 2021 | [W3C](https://www.w3.org/TR/2021/NOTE-xaur-20210825/) | 单一输入方式可达全部界面等需求 |

### 3.7 已有的帮助：教程、自适应界面、助手

| 论文 | 会议/期刊 | 年份 | 链接 | 一句话说明 |
| --- | --- | --- | --- | --- |
| User onboarding in virtual reality（Chauvergne et al.） | CHI | 2023 | [DOI](https://doi.org/10.1145/3544548.3581211) | VR 上手引导框架 |
| Evaluating tutorial-based instructions for controllers in VR games（Kao et al.） | CHI PLAY | 2021 | [DOI](https://doi.org/10.1145/3474661) | 50 款游戏的教程；空间提示只在部分游戏有效 |
| ★ Context-aware online adaptation of MR interfaces（Lindlbauer et al.） | UIST | 2019 | [DOI](https://doi.org/10.1145/3332165.3347945) | 次要任务交互减少 36% |
| SemanticAdapt（Cheng et al.） | UIST | 2021 | [DOI](https://doi.org/10.1145/3472749.3474750) | 手动调整减少 33% |
| SituationAdapt（Li et al.） | UIST | 2024 | [DOI](https://doi.org/10.1145/3654777.3676470) | VLM 判断 UI 可放置的位置 |
| ★ DuoZone（Qian et al.） | arXiv 预印本 | 2025 | [arXiv](https://arxiv.org/abs/2511.15676) | Vision Pro 上 LLM 窗口布局，快 34.5% |
| Revisiting put-that-there via LLMs（Bovo et al.） | arXiv 预印本 | 2025 | [arXiv](https://arxiv.org/abs/2511.02378) | JSON place/remove 动作模式 |
| GazePointAR（Lee et al.） | CHI | 2024 | [DOI](https://doi.org/10.1145/3613904.3642230) | 注视+指点+语音消解“这个” |
| Orienter: grounded GUI understanding for XR apps（Li et al.） | arXiv 预印本 | 2024 | [arXiv](https://arxiv.org/abs/2409.10811) | VR 界面可交互元素检测，F1 46% |
| RAVEN（Cao et al.） | CHI | 2026 | [DOI](https://doi.org/10.1145/3772318.3791616) | LLM 通过场景图为盲人用户操作 VR 场景 |

**书与课程**

- LaViola et al., *3D User Interfaces: Theory and Practice*, 2nd ed.（第 7–9 章）
- I. S. MacKenzie, *Human-Computer Interaction: An Empirical Research Perspective*（Fitts 定律、吞吐量与文本输入方法论）
- 四个平台的设计指南（见 3.3），以及 W3C XAUR 与 [XR Access](https://xraccess.org/)

## 第 1 篇：研究愿景（`3d-gui-agent-01-research-vision`）

本篇是专栏的入口：给出 3D GUI 智能体的定义、范围（包括与不包括什么）、动机（操作代价、普及障碍、无障碍）、从二维迁移与失效之处、自主程度谱系（讲解 -> 指出位置 -> 逐步指导 -> 重排布局 -> 提议后执行 -> 代为执行）以及开放问题。证据均来自第 2–4 篇，详细条目见上面各节；这里只列出支撑核心论点的少数工作。状态截至 2026-11-24。

| 论文 | 出处 | 年份 | 链接 | 一句话说明（支撑的论点） |
| --- | --- | --- | --- | --- |
| ★ 3D User Interfaces: Theory and Practice, 2nd ed.（LaViola, Kruijff, McMahan, Bowman, Poupyrev） | 书，Addison-Wesley | 2017 | [出版社](https://www.informit.com/store/3d-user-interfaces-theory-and-practice-9780134034478) | 3D 交互任务分类：智能体动作词汇的来源 |
| ★ AppAgent（C. Zhang et al.） | CHI | 2025 | [arXiv:2312.13771](https://arxiv.org/abs/2312.13771) | 元素级动作空间（2.2% -> 48.9%）：可迁移到 3D 的配方 |
| AndroidWorld（Rawles et al.） | ICLR | 2025 | [arXiv:2405.14573](https://arxiv.org/abs/2405.14573) | 参数化任务 + 程序化成功检查 |
| OSWorld（Xie et al.） | NeurIPS D&B | 2024 | [arXiv:2404.07972](https://arxiv.org/abs/2404.07972) | 基于执行的评测；从 12% 到超过人类基线 |
| ★ Look Before You Leap（Orienter, S. Li et al.） | FSE（PACMSE） | 2026 | [DOI](https://doi.org/10.1145/3808134) | VR 帧中 GUI 元素定位（IoU 0.75 下 F1 44.10%）；arXiv 标题已使用 “Spatial Intelligent Agent” |
| ★ DuoZone（Qian et al.） | IEEE TVCG | 2026 | [arXiv:2511.15676](https://arxiv.org/abs/2511.15676) | 语言驱动的窗口布局 + 确认后执行：“提议后执行”模式的证据 |
| Revisiting put-that-there via LLMs（Bovo et al.） | ISMAR Adjunct | 2025 | [arXiv:2511.02378](https://arxiv.org/abs/2511.02378) | 语音 + 指向 -> 窗口动作（尚无用户研究） |
| NavAI（Qin, DiGiovanni） | ASE Workshops | 2025 | [arXiv:2601.03251](https://arxiv.org/abs/2601.03251) | 语言 + VR 截图的闭环，但只做移动 |
| SIAgent（Z. Wang, Gu, Lu） | IEEE TVCG | 2026 | [arXiv:2603.00522](https://arxiv.org/abs/2603.00522) | 智能体根据眼手意图执行 VR 操作（无语言） |
| ★ VRSight（Killough et al.） | UIST | 2025 | [DOI](https://doi.org/10.1145/3746059.3747641) | 盲人与低视力用户菜单任务完成率 11%：描述不等于操作 |
| GazePointAR（J. Lee et al.） | CHI | 2024 | [arXiv:2404.08213](https://arxiv.org/abs/2404.08213) | 注视与指向消解指示代词（只回答，不操作） |
| Guided Reality（Zhao et al.） | UIST | 2025 | [arXiv:2508.03547](https://arxiv.org/abs/2508.03547) | 空间引导的视觉词汇（物理任务，不在范围内） |
| VRCopilot（L. Zhang et al.） | UIST | 2024 | [DOI](https://doi.org/10.1145/3654777.3676451) | 完全自动降低主体感 |
| "What Can I Do for You"（T. Zhang et al.） | arXiv 预印本 | 2026 | [arXiv:2609.13727](https://arxiv.org/abs/2609.13727) | VR 游戏中自主代玩降低负荷，也降低乐趣 |
| "Do I Just Tap My Headset?"（Khurana et al.） | IMWUT | 2023 | [DOI](https://doi.org/10.1145/3631451) | 新手错误多来自不知道操作顺序 |
| Selection-based Text Entry in VR（Speicher et al.） | CHI | 2018 | [DOI](https://doi.org/10.1145/3173574.3174221) | VR 键盘 5.3–15.4 wpm |
| Bumpy Ride?（Sasalovici et al.） | CHI | 2025 | [DOI](https://doi.org/10.1145/3706598.3714077) | 头显选择错误率：静止 8.8–23.5%，行驶 20.4–36.0% |
| How do People Type on Mobile Devices?（Palin et al.） | MobileHCI | 2019 | [DOI](https://doi.org/10.1145/3338286.3340120) | 手机 36.2 wpm，未更正错误 2.3% |
| Text Entry for XR Trove（Bhatia et al.） | CHI | 2025 | [DOI](https://doi.org/10.1145/3706598.3713382) | 137 种 XR 输入技术平均 20.36 wpm |

**厂商来源（产品，不是论文）**：[Introducing Galaxy XR](https://blog.google/products/android/samsung-galaxy-xr)（Google，2025-10）；[Introducing Meta XR Operator](https://developers.meta.com/horizon/blog/meta-xr-operator-close-the-build-test-verify-loop-for-vr/)（Meta，2026-08-18）；[About visionOS 27 updates](https://support.apple.com/en-us/149067)（Apple）。
