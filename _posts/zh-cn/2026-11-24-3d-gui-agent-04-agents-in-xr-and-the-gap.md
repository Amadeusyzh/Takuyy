---
layout: post
title: "XR 中的 AI 智能体：最接近的工作、平台与空白"
date: 2026-11-24 12:04:00+0900
description: "截至 2026 年 11 月，所有接近“替用户操作 VR、AR 和 MR 设备 3D 界面的智能体”的工作的全景图：构建 XR 世界的 LLM、XR 助手、XR 测试智能体、游戏智能体、头显与眼镜助手，对最接近工作的深入分析（Orienter、ComboBench、NavAI、SIAgent、Put-That-There、DuoZone、Galaxy XR 上的 Gemini、Meta XR Operator、visionOS 上的 Siri），各平台允许智能体观察和控制什么，现有数据集，以及仍然缺少什么。"
categories: 3d-gui-agent
tags: [gui-agent, xr, vr, mixed-reality, llm-agent, visionos, android-xr, openxr, webxr, benchmark]
series: 3d-gui-agent
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[第 2 篇]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }})表明，GUI 智能体（GUI agents），即读取屏幕并替用户点按、输入和滚动的模型，已经在手机、桌面和网页上成为一个成熟的研究领域。[第 3 篇]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }})解释了为什么头显和眼镜的 3D 界面比平面屏幕更难操作。本专栏的[研究愿景]({{ '/blog/2026/3d-gui-agent-01-research-vision/' | relative_url }})把两者结合起来：一个代表用户操作 VR、AR 或 MR 设备 3D GUI 的智能体，或者引导用户完成操作的智能体。

在宣称这样的智能体是新东西之前，我们必须确切知道已经存在什么。许多部件已经有了：构建 XR 场景的 LLM，回答你所看之物相关问题的助手，在 VR 应用中自动点击的测试程序，从像素出发在 3D 中行动的游戏智能体，一款厂商称其能“take action on your behalf across your apps”（在你的各个应用中代你执行操作）的已上市头显助手，以及一个让 LLM 智能体逐层操作 VR 应用菜单的厂商工具。本文梳理截至 **2026 年 11 月**的所有这些工作，结合数字深入研究最接近的几项，描述每个 XR 平台允许智能体观察和控制什么，比较现有数据集，并在证据允许的范围内尽可能精确地说明仍然缺少什么。在这里公正对待先前工作很重要：空白比“还没有人把智能体放进 XR”要窄，本文试图准确说明它到底有多窄。

## 前置知识

- 什么是 GUI 智能体以及如何评估它（观察（observation）、动作空间（action space）、接地（grounding）、任务成功率（task success））：[第 2 篇]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }})。
- 3D 交互的基础（射线指向、捏合、注视、直接操纵、窗口与体积（volumes））：[第 3 篇]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }})。
- 大致了解 XR 运行时、引擎和应用如何组合在一起（OpenXR、Unity、WebXR）。[图形引擎系列]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})介绍了引擎。

## 0. 什么算“接近”：工作定义与评分标准

本专栏使用如下工作定义。**3D GUI 智能体**（3D GUI agent）是这样一种 AI 智能体，它

1. **感知 VR、AR 或 MR 设备（头显或眼镜）的空间用户界面**（spatial user interface）：放置在 3D 中的窗口、体积、菜单、控件和可交互虚拟物体，通过渲染视图和/或系统与应用的结构来获取；
2. **理解用户以自然语言（语音或文本）给出的意图**，可能还结合注视和指向；并且
3. 替用户**操作该 3D GUI**（选择、按下、抓取、移动、缩放、浏览菜单和应用），或者**引导**用户完成操作。

第四个属性把一个系统与一个想法区分开来：它应当**作为智能体被评估**，即在一组指令和应用上测量任务成功率。

为了在同一尺度上比较差异很大的工作，本文中的每项工作都按这四个属性、分三个等级评分。评分是我对论文和产品页面的解读；评分标准（rubric）如下：

| 属性 | 2（完全） | 1（部分） | 0（无） |
| --- | --- | --- | --- |
| 感知 3D UI | 从渲染视图或 UI 结构中找到现有 XR 应用的 UI 元素 | 通过特权元数据、场景图或不含 UI 元素的像素感知 XR 场景 | 只感知物理世界，或什么都不感知 |
| 理解意图 | 来自用户的自然语言目标 | 隐式意图（注视、手部运动）、主动推断或测试指令 | 无（例如覆盖率驱动的测试） |
| 操作 / 引导 | 在 XR UI 上执行操作：窗口、控件、可交互物 | 在 XR 中行动但不作用于 UI（移动（locomotion）、世界编辑、服务），引导，或只规划不执行 | 只回答或预测 |
| 已评估 | 定量的任务或用户研究结果 | 初步或小规模研究，仅有合成数据 | 无，或未公开 |

第 2 节的能力热力图把该评分标准应用于 23 项工作和产品。简而言之：有几项工作在两个属性上达到“完全”，少数在三个属性上达到，没有一项在全部四个属性上达到。

## 1. 全景

3D GUI 智能体的近邻分为八条工作脉络。图中把它们围绕目标排列，并在每个箭头上标注该脉络贡献了什么，或者它为何不足。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-map.svg" localized="true" caption="领域全景图。八条工作脉络围绕着 3D GUI 智能体。实线箭头：该脉络提供了智能体的一部分（XR UI 的感知、从像素出发的 3D 动作、动作通道、空间中的接地）。虚线箭头：该脉络在 XR 中使用 LLM，但做的是别的事（编辑虚拟世界，或者只回答和引导）。只有脉络 A 触及核心，而其中每项工作都只覆盖闭环的一部分。" %}

### 1.1 构建或编辑 XR 世界的 LLM

第一波 XR 中的 LLM 研究（2023-2024）用语言来**创建或改变虚拟世界**。**LLMR**（De La Torre et al.，CHI 2024，Honorable Mention）在 Unity 中编排多个 GPT-4 角色：一个把场景图总结为文本的*场景分析器*（scene analyzer），一个*规划器*（planner），一个编写 C# 代码的*构建器*（builder），一个检查编译和运行时错误的*检查器*（inspector），外加一个技能库。它的错误率约为普通 GPT-4 的四分之一（摘要称低 4 倍），并有 11 名参与者在可用性研究中使用了它。**DreamCodeVR**（Giunchi et al.，IEEE VR 2024）把语音请求编译成能改变正在运行的 VR 应用的 C# 代码。**LLMER**（Chen et al.，IEEE TVCG 2025）用 JSON 取代代码，报告与先前工作相比 token 减少 80% 以上、任务时间减少约 60%。**VRCopilot**（Zhang et al.，UIST 2024）比较了手动、自动和脚手架式（scaffolded）三种 3D 布局共创方式，发现脚手架方式（AI 提出线框，由用户编辑）给用户更强的能动感（sense of agency），这是关于人们希望 XR AI 拥有多大自主性的一个早期数据点。**sMoRe**（Xing et al.，arXiv 2024）根据语音和文本命令在 MR 中放置和组织虚拟物体。

最新的系统面向开发者。**XR Blocks**（Li et al.，arXiv 2025）和 **Vibe Coding XR**（Du et al.，据 arXiv 为 VRST 2026）通过一个对 LLM 友好、涵盖用户、世界、界面和智能体的“Reality Model”，把提示转化为 WebXR 应用。**GenXR-Bench**（Huang et al.，arXiv，2026 年 10 月）在 112 个 XR 开发任务上评估编程智能体；它的测试框架（harness）在第 4 节讨论，其中包含操作所生成应用的 VLM“行动者”（actors）。**ControlAnything**（Ryskeldiev，arXiv，2026 年 11 月）让编程智能体在使用时于 Quest 3 上生成 AR 控件和设备连接器（10 个请求中 9 个就绪，中位数 32.5 s）。

*这条脉络给 3D GUI 智能体带来什么：* 证明 LLM 能读取 XR 场景结构（LLMR 的场景分析器），以及紧凑的动作格式（LLMER 的 JSON）。*它缺少什么：* 它通过引擎构建或编辑内容；它不操作现有应用的界面。

### 1.2 回答或引导的 XR 助手

第二条脉络把多模态助手放进头显或眼镜。这些系统在**意图**方面很强，尤其擅长根据注视和指向解析指示性指代（deictic references）（“这个”“那个”“那里”，即 this、that、there）：

- **GazePointAR**（Lee et al.，CHI 2024）在查询 LLM 之前，把语音提问中的代词替换为用户正在注视或指向之物的描述（12 名参与者的实验室研究，外加一项日记研究）。
- **G-VOILA**（Wang et al.，IMWUT 2024）利用注视、视野和语音进行信息查询。
- **EmBARDiment**（Bovo et al.，IEEE VR 2025）把用户正在阅读的那个 XR 窗口（由注视选中）的内容提供给 LLM 聊天机器人，使用户无需重述上下文。它读取多窗口 XR UI，但只用于回答。
- **Satori**（Li et al.，CHI 2025）是 HoloLens 2 上的主动式（proactive）AR 助手，采用信念-愿望-意图（Belief-Desire-Intention）用户模型；在一项 16 名参与者的研究中，它在全部 11 项可用性指标上都不劣于由 AR 设计师设计的 Wizard-of-Oz 系统，延迟为 2-3 s。
- **Sensible Agent**（Lee et al.，UIST 2025）不仅决定建议什么，还决定如何询问（多选、是/否、图标）以及通过哪个通道（注视、头部、手、语音），运行在 Android XR 头显上的 WebXR 中。在一项初步研究（N=10）中，NASA-TLX 工作负荷为 20.55，基线为 43.27。
- **Guided Reality**（Zhao et al.，UIST 2025）和 **AgentHands**（Liu et al.，CHI 2026）在空间中生成视觉引导：锚定在交互点上的高亮和箭头，以及在智能体说话时进行指点和演示的渲染出来的智能体双手。

*这条脉络带来什么：* 基于注视和指向的意图接地、一套空间引导的词汇，以及关于何时、如何打断用户的模型。它是 3D GUI 智能体**引导模式**（guide mode）的最佳证据。*它缺少什么：* 输出是回答或叠加层；这些系统都不操作界面。

### 1.3 已经在操作 XR 应用的程序：自动化测试

软件工程研究自 2022 年起就在自动驱动 VR 应用，只是目标不同：**测试覆盖率**。**VRTest**（Wang，ICSE 2022 工具演示）读取 Unity 场景并移动相机进行探索。**VRGuide**（Wang、Rafi 和 Meng，ASE 2023）用计算几何规划相机路线，以覆盖所有可交互物体。**VRExplorer**（Zhu et al.，ASE 2025）、**XRintTest**（Gu et al.，Automated Software Engineering 2026）、**AUTOVR**（Kim et al.，USENIX Security 2025）以及 LLM 驱动的 **ExploreAI**（Wang et al.，arXiv 2026）在第 2.7 节介绍。**VRScout**（Wu et al.，arXiv 2025）从人类演示中学习 Action Chunking Transformer，以 60 FPS 玩商业 VR 游戏，这是一个不含语言的从像素到 6-DoF 的策略。

动机是真实存在的：一项针对 314 个开源 Unity VR 应用的研究发现，79% 完全没有自动化测试（Rzig et al.，ISSTA 2023）。一篇 2026 年的 VR/AR 软件工程综述（Guo et al.，arXiv，已投稿 TSE）把用于 VR GUI 探索的 LLM 智能体列为开放问题，其中坐标定位尚未解决。

*这条脉络带来什么：* 适用于真实 VR 应用的可用感知-动作机制，以及一套可执行的 3D 交互词汇（触发 fire、抓取 grab、插槽 socket）。*它缺少什么：* 用户意图。目标是触碰一切，而不是完成用户要求的事。

### 1.4 通过渲染视图在 3D 中行动的智能体

游戏智能体表明，**单一接口（输入像素、输出人类输入设备的操作）可以在许多 3D 世界中遵循语言指令**，并且它们测量了这样做的代价。

- **SIMA**（SIMA Team，Google DeepMind，arXiv 2024）在 10 多款 3D 游戏中训练了一个以语言为条件的键盘鼠标策略。在 No Man's Sky 子集上，它的成功率为 34%，人类为 60%；去掉语言的消融版本为 11%：语言很重要。
- **SIMA 2**（arXiv，2025 年 12 月）把 Gemini Flash-Lite 微调成一个会推理、对话和行动的智能体（96 个按键、点击和离散化的鼠标移动），平均成功率约为 SIMA 的两倍。它以 Gemini 作为任务设定者和奖励模型进行自我改进，但微调损失了通用推理能力（AIME -15.4%，GPQA -19.5%）。
- **Cradle**（Tan et al.，arXiv 2024）是一个免训练的六模块 GPT-4o 框架，根据截图编写键盘和鼠标技能；它在思考时必须暂停游戏。
- **Lumine**（Tan et al.，arXiv 2025）是实时方向的对照：Qwen2-VL-7B 每秒看 5 帧，输出 30 Hz 的动作块（action chunks），只在需要时推理，不推理时 113.9 ms、推理时 234 ms 即可给出第一个动作，并完成了 Genshin Impact（原神）长达 5 小时的剧情线。
- **VideoGameBench**（Zhang et al.，arXiv 2025）说明了这为什么重要：前沿 VLM 在实时游玩时完成了 0.48% 的游戏，在游戏为它们暂停时完成了 1.6%。**XR 界面无法为智能体暂停。**
- **Embodied Web Agents**（Hong et al.，NeurIPS 2025 Datasets and Benchmarks）在约 1.5k 个任务中把 3D 世界与真实网站混合在一起。在烹饪任务中，GPT-4o 66.6% 的失败来自在 3D 世界与网页之间切换，而仅具身部分的失败占 14.6%，仅网页部分的失败占 8.0%。XR 界面恰恰就是这种混合：漂浮在 3D 空间中的平面面板。
- 3D 软件智能体对纯像素控制提出了警告：在 **VideoCAD**（Man et al.，NeurIPS 2025 D&B，约 41k 个合成 CAD UI 视频）上，前沿模型在长程 CAD UI 任务上失败；**ComAct**（Ai et al.，arXiv 2026）报告 GUI 智能体在工业 CAD 上的成功率接近零，并主张改用 API 动作。

*这条脉络带来什么：* 面向从像素出发在 3D 中行动的智能体的动作空间设计、延迟方案和自我改进闭环。*它缺少什么：* 这些世界是游戏而不是界面，而且都不运行在头显上。

### 1.5 头显与眼镜上的助手，以及第一人称 AI

已上市的助手已经能感知很多东西：相机画面、屏幕，有时还有注视。它们如何利用这些信息则各不相同：

- **Samsung Galaxy XR 上的 Gemini**（Android XR，2025 年 10 月 21 日起发售，$1,799）：Google 的发布文章称 Gemini Live “can better understand what you're seeing and doing”（能更好地理解你正在看和正在做的事），能够“take action on your behalf across your apps”（在你的各个应用中代你执行操作），并且说“Hey Google, organize these windows”（Hey Google，整理一下这些窗口）会排列打开的窗口。详见第 2.8 节。
- **Apple Vision Pro 上的 Siri AI**（2026 年 6 月 8 日在 WWDC 上发布；visionOS 27 发布说明的日期为 2026 年 11 月 9 日）：你看向 Siri 并说话，询问房间里的物体或屏幕上的内容，Siri 通过应用动作（app actions）“get[s] things done across apps”（跨应用把事情办完）。
- **Meta**：搭配 Neural Band 腕带的 Meta Ray-Ban Display（2025 年 9 月 30 日在美国发售，$799）在镜片中显示回答和分步指南。在 Connect 2026 上，Meta 发布了面向 AI 眼镜的个人智能体 **Muse**，它将“in the coming months”（在未来几个月内）通过购物、支付和预订连接器执行操作；还发布了 **Meta VR Glasses**（$1,299.99，2027 年春季），其操作系统内置一个 Meta AI 智能体，可以“play a movie, open an app, adjust your workspace”（播放电影、打开应用、调整你的工作区）。在撰写本文时，两者都尚未上市。
- **研究**：第一人称 AI（egocentric AI）已经从第一人称视频问答（Ego4D、EgoSchema），经过主动辅助（ProAssist，EMNLP 2025；HoloAssist，一个 166 小时的 HoloLens 2 数据集，记录指导者引导执行者完成任务），发展到执行任务的眼镜智能体：**VisionClaw**（Liu et al.，arXiv 2026）把 Ray-Ban Meta 眼镜连接到智能体，这些智能体能把商品加入购物车、根据海报创建日历事件、控制 IoT 设备（实验室研究 N=12，部署 N=5）。

*这条脉络带来什么：* 已部署的感知能力，以及用户愿意委托的证据。*它缺少什么：* 行动途径是 API 和服务，而不是操作 3D 界面（Galaxy XR 上的 Gemini 是一个细节未公开的例外）。

### 1.6 3D 与空间理解

3D-LLM（3D-LLM、LEO、Video-3D LLM、GPT4Scene）、空间 VLM（SpatialVLM、SpatialRGPT）、场景图（ConceptGraphs、HOV-SG）和 3D 指代表达接地（3D referring-expression grounding）（ScanRefer、SeeGround）在空间中对**物理物体**进行接地。有两个结果值得 3D GUI 智能体记住。在 **VSI-Bench**（Yang et al.，CVPR 2025）上，最好的 MLLM 在关于室内视频的空间记忆问题上答对 45.4%，人类约为 79%，而且显式的认知地图（cognitive maps）比思维链（chain-of-thought）帮助更大。**SeeGround**（Li et al.，CVPR 2025）渲染 3D 场景的视图并用 2D VLM 进行接地，这一方案可以让 2D GUI 接地器在 3D 中工作。UI 方面的对应物，即利用立体视觉、深度和头部位姿在 3D 空间中对 *UI 元素*进行接地的模型，目前还不存在；最接近的工作 Orienter 处理的是单眼 2D 截图。

### 1.7 领域如何汇聚

时间线显示了每条脉络何时出现。XR 中关于意图和引导的研究始于 2023-2024 年；真正操作 XR UI 某些部分的工作集中在 2025 年末和 2026 年；基础设施和产品也在同一时间窗口内到来。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-timeline.svg" localized="true" caption="2023 年至 2026 年 11 月的论文、基础设施和产品（研究项目按首次 arXiv 提交或发表的月份标注）。看右半部分：Put-That-There、DuoZone、ComboBench、NavAI、XRintTest 和 SIAgent 在彼此相隔不到六个月的时间内相继出现，Meta XR Operator 从 2026 年 8 月起让智能体驱动 VR 应用，搭载 Gemini 的 Galaxy XR 于 2025 年 10 月上市。这个想法恰逢其时，并已被部分预见。" %}

## 2. 最接近工作的深入分析

热力图把第 0 节的评分标准应用于 23 项最接近的工作和产品。先按列来读：许多行在*自然语言意图*和*已评估*两列颜色很深，有几行在*操作*一列颜色很深，但*感知 3D UI* 一列只有三个“完全”格子（Orienter、VRSight、Meta XR Operator），而这三者都不理解用户的请求。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-capability.svg" localized="true" caption="能力热力图。行：最接近的工作和产品，按工作脉络着色（紫色：XR UI 接地与操作；橙色：世界构建；青色：助手；蓝色：XR 测试；绿色：3D 智能体；红色：产品；棕色：基础设施）。列：第 0 节评分标准的四个属性；深色为完全，浅色为部分，灰色为无。最右一列给出评分背后的数字。虚线框出的最底行是目标；没有任何一行与之吻合。" %}

下面的交互式地图包含同样的工作以及另外约二十项。每项工作是一个点，横向位置表示它感知 3D UI 的程度，纵向位置表示它操作的程度；颜色表示它理解的意图类型，轮廓表示它的评估方式。

{% include widget.liquid name="3d-gui-agent-landscape" height="660" caption="XR 与 3D 中智能体的能力地图（截至 2026 年 11 月）。点击类别、平台或年份标签进行筛选；点击某个点或列表中的名称，可阅读附带数字和链接的摘要。切换「目标区域」可勾勒出 3D GUI 智能体这一想法所处的位置：完全感知 3D UI、完全操作、自然语言意图以及任务评估。各点略微错开，以免评分相同的工作相互遮挡。" %}

### 2.1 Orienter：在 VR 帧中对可交互元素进行接地

**Look Before You Leap: Context-Sensitive GUI Grounding for Boosting Automated Extended Reality (XR) Testing**（Shuqing Li et al.，FSE 2026，发表于 Proceedings of the ACM on Software Engineering 3(FSE)，[DOI 10.1145/3808134](https://doi.org/10.1145/3808134)；arXiv 2409.10811，其标题为 *Grounded GUI Understanding for Vision-Based Spatial Intelligent Agent: Exemplified by Extended Reality Apps*）。该方法名为 **Orienter**。

*问题。* 在 VR 应用的截图中找出*可交互 GUI 元素*（interactable GUI elements, IGE）。与手机 GUI 不同，XR 元素是开放词表的（open-vocabulary）（一根拉杆、一块漂浮面板、一个门把手），而且一个元素是否可交互取决于上下文：同一个箱子可能可以抓取，也可能不行。在固定 2D 控件类别上训练的检测器迁移效果很差。

*方法。* 一个围绕大型多模态模型（LMM：GPT-4V、GPT-4o、Claude 3.5 Sonnet 或 Gemini 1.5 Pro）构建的零样本流程：

1. *语义上下文理解*：LMM 读取画面帧，以及从 Steam 爬取的应用信息。
2. *反思引导的候选检测*：LMM 提出候选元素的描述，开放词表接地模型 APE 将其定位为框，再由一个 LMM“顾问”（advisor）在循环中加以验证。
3. *上下文敏感的可交互性分类*，使用思维链。

这就是[第 2 篇]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }})中的 2D GUI 智能体方案（语言模型负责语义，接地模型负责坐标，就像 Set-of-Mark 提示和 OmniParser 那样）被迁移到 VR 帧上，并加入了反思，因为最初的猜测常常是错的。

*数据。* 来自 100 个 Steam VR 应用的 1,552 张右眼帧（960x540），包含 766 个语义类别的 4,470 个可交互标注，由 13 名标注者历时三个多月完成。

*结果。* 在 IoU 0.75 下，可交互性 F1 为 44.10%（Gemini，按应用划分），而训练过的 Faster R-CNN 为 32.69%，强大的 2D 屏幕解析器 OmniParser 为 2.21%。在上下文敏感划分上，Orienter 达到 32.51%，而基线接近 0.5%。在严格 IoU 下精确率崩溃（IoU 0.95 时为 5.64%），而直接让 LMM 输出框则在定位上失败。用它引导对 77 个应用进行 60 分钟的自动化探索，元素覆盖率从 0.65 提高到 0.83，有效交互从 5,911 次增加到 13,038 次（摘要中给出的相对提升比正文中的这些数字更大）。

*它不做什么。* 它处理的是单眼的 2D 投影，没有深度或立体信息；没有用户目标；所谓“行动”只是为了测试探索而在帧上模拟的交互点，而不是真实的 6-DoF 输入。**重叠：在感知方面相当大。** Orienter 是唯一一项在真实 XR 应用的渲染帧中对 GUI 元素进行接地的同行评审工作，而且其 arXiv 标题已经提到了“spatial intelligent agent”（空间智能体）。本专栏必须承认它是这一想法中感知的那一半。

### 2.2 ComboBench：从语义动作到控制器步骤

**ComboBench: Can LLMs Manipulate Physical Devices to Play VR Games?**（Shuqing Li et al.，arXiv 2510.24706，2025 年 10 月；预印本）单独研究感知之后的那一步：给定一个语义动作，例如“给枪换弹”（reload the gun），生成该 VR 游戏所要求的头显和控制器物理操作序列。

*数据与方法。* 来自 Half-Life: Alyx、Into the Radius、Moss: Book II 和 Vivecraft 的 262 个场景；在 Quest 2 上录制的真值操作序列；七个 LLM 在零样本和少样本条件下评估，仅使用文本。

*结果。* 最好的严格序列匹配为 11.7%（Gemini-1.5-Pro，5-shot），GPT-4o 为 10.9%，GPT-4 为 8.8%；开源模型约为 0-2%，并且没有模型在零样本下超过 5.8%。归一化对齐分数很高（最高 0.832，人类基线为 0.833），所以模型大致知道涉及*哪些*步骤，但步骤顺序准确率始终在约 0.3 或以下。少量示例使顺序准确率提高了 10-20 倍，超过约三个示例后收益很小。把步骤映射到运动动作是最弱的能力。

*它不做什么。* 没有截图，没有执行，没有闭环，目标是游戏机制而不是 GUI 控件。**重叠：在动作接地方面相当大。** 它是对“LLM 多么不了解 6-DoF 控制器操作流程”的最干净的测量。

### 2.3 NavAI：闭环，但用于行走

**NavAI: A Generalizable LLM Framework for Navigation Tasks in Virtual Reality Environments**（Xue Qin 和 Matthew DiGiovanni，ASE 2025 Workshops，[DOI 10.1109/ASEW67777.2025.00067](https://doi.org/10.1109/ASEW67777.2025.00067)；arXiv 2601.03251，2026 年 1 月）是唯一已发表的、从自然语言目标和 VR 截图到执行动作的闭环。

*闭环。* 带网格叠加的视野截图和用户请求被送入 GPT-4o；由 GPT-4o、Grok-2 和 Gemini-2.5-Flash 投票选出下一步；JSON 函数调用（`move`、`rotate`、`look`、`scan_360`）在 Unity 模拟器中执行；新的视图再返回给模型。网格叠加是 Set-of-Mark 提示在 3D 中的近亲：它给模型提供了可以指向的编号位置。

*结果。* 在三个 Unity 场景中，它执行了 21 个基本动作中的 21 个，完成了 18 个目标任务中的 16 个（89%），每个任务约 8 轮，每轮约 49 s，每个任务最长约 395 s。

*它不做什么。* 它移动视点；从不触碰菜单或控件。它的延迟比交互式使用高两个数量级（第 2.9 节）。**重叠：在闭环方面相当大，在 GUI 操作方面没有。**

### 2.4 SIAgent：智能体执行，意图来自眼和手

**SIAgent: Spatial Interaction Agent via LLM-powered Eye-Hand Motion Intent Understanding in VR**（Zhimin Wang、Chenyu Gu 和 Feng Lu，IEEE TVCG 32(7)，2026，[DOI 10.1109/TVCG.2026.3686395](https://doi.org/10.1109/TVCG.2026.3686395)；arXiv 2603.00522，2026 年 3 月）探讨用户能否跳过学习手势到命令的映射：智能体观察自然的眼和手行为，推断预期的操作并执行它。

*流程。* 以 30 Hz 采样的 3 秒注视窗口被压缩为 18 个点；手部姿态和手指状态被转写为文字；三次 LLM 调用（ChatGLM-4）返回六个排序的意图假设；由智能体控制的虚拟手执行选中的那个。

*结果。* 研究 1（N=16，每人 54 次试验）与控制器输入和注视+捏合输入对比：意图识别 97.2%，注视+捏合为 93.1%；执行准确率 86.8%；每个任务 7.7 s（*不含* LLM 时间），控制器为 5.8 s；LLM 延迟约 9.1 s；手臂疲劳更少；81% 的参与者更喜欢 SIAgent。Top-1 意图准确率在 GLM-4 下为 83.3%，GPT-4o 下为 72.2%，GPT-3.5 下为 46.3%；在注视之外加入手部信息，使 top-1 准确率从 30.2% 提高到 58.3%。

*它不做什么。* 没有语言指令，也没有 GUI 感知；操作是预定义的场景操作。**重叠：在“智能体替用户操作 VR”方面相当大。** 它是已发表工作中，智能体代表用户对 VR 内容执行操作的最清晰案例。

### 2.5 重访 Put-That-There：从语言与指示语（deixis）到窗口操作

**Revisiting put-that-there, context aware window interactions via LLMs**（Riccardo Bovo et al.，据 OpenAlex 为 ISMAR 2025 Adjunct；arXiv 2511.02378）为头显更新了 Bolt 1980 年的“put that there”（把那个放到那里）。

*方法。* GPT-4 在未经微调、仅靠提示的情况下，接收窗口元数据（id、尺寸、位置）、来自 Quest Scene API 的房间平面（约 10 个自动类别，外加约 30 个手工标注的类别）、用户的语音、指向悬停事件和头部朝向。它输出 JSON 三元组 `["place"|"remove", windowId, surface]`。它能处理显式命令（“把 Maps 放到咖啡桌上”，put Maps on the coffee table）、指示性命令（“把那个放到那里”，put that there）以及目标层面的命令（“我需要发一条消息”，I need to send a message，这会打开并放置合适的应用），包括一对多的动作。

*它不做什么。* 目前还没有定量结果（计划进行用户研究）。它通过窗口管理器元数据而不是感知 GUI 来行动，并且只放置窗口，不在应用内部操作。**重叠：在“意图加 XR 窗口层操作”方面相当大。** 它是“LLM 根据多模态意图对 XR UI 采取行动”的最清晰表述，以特权元数据代替了感知。

### 2.6 DuoZone：混合主动（mixed initiative）的窗口布局，经过评估

**DuoZone: A User-Centric, LLM-Guided Mixed-Initiative XR Window Management System**（Jing Qian et al.，IEEE TVCG，据 OpenAlex 于 2026 年 11 月 3 日在线发表；arXiv 2511.15676）是由语言驱动 XR UI 的系统中评估最充分的一个。

*方法。* 在 Apple Vision Pro 上配合一台 GPT-4.1 服务器，用户在空间中定义区域并陈述一个目标。LLM 为每个应用与目标的相关性打分，并利用代价矩阵（指向距离、转头、手部移动）把应用分配到各个区域；由一个非 LLM 的优化器确定窗口大小，因为单靠 LLM 会随机调整窗口大小。在任何改变发生之前都由用户确认；一次请求约需 4 s。

*结果。* N=16 名专业人士，被试内设计，与 visionOS 原生窗口管理对比：布局匹配快 34.5%；构建一个工作区耗时 168.3 s，对比 218.1 s；在报告的两组比较中 NASA-TLX 工作负荷都更低（33.3 对 47.7，22.4 对 34.2）。参与者接受了 90.3% 的应用推荐、82.8% 的尺寸决定和 76.5% 的排序决定。满意度没有差异。

*它不做什么。* 只涉及窗口层；以应用元数据代替 GUI 感知；每次改变都需用户确认。**重叠：在混合主动下操作 XR 窗口层方面相当大**，而它的先确认后应用（confirm-then-apply）设计是共享控制（shared control）的一个范例。

### 2.7 XR 测试智能体

四个测试系统展示了在没有用户的情况下，在 VR 应用中获得*感知与动作*的四种不同方式：

| 系统 | 如何感知 | 如何行动 | 规模与结果 | 状态 |
| --- | --- | --- | --- | --- |
| VRExplorer（Zhu et al.） | 对 Unity 场景和脚本做静态与动态分析；开发者用 `IGrabbable` 等接口标记物体 | NavMesh 寻路，一个在任务与探索之间交替的概率状态机 | 11 个 Unity 项目；可执行行覆盖率比 VRGuide 高 122.8%；发现 3 个 bug | ASE 2025 |
| XRintTest（Gu et al.） | 从 XR Interaction Toolkit 组件解析出的交互流图（Interaction Flow Graph） | 通过 XRI 设备模拟器模拟控制器事件；一个预言机（oracle）标记无响应的交互 | XRBench3D：10 个场景，456 个交互；覆盖 93%（fire 97%，manipulate 94%，socket 83%），随机输入为 8% | Automated Software Engineering 33(3), 2026 |
| AUTOVR（Kim et al.） | 在 Quest 2 上对 Unity IL2CPP 应用做二进制插桩（Frida），以恢复 UI 事件处理函数 | 直接调用处理函数，强制碰撞体接触，重新加载场景 | 366 个 Quest Store 和 SideQuest 应用；与 Android Monkey 相比发现 390 对 117 处敏感数据暴露；每个应用约 222 s | USENIX Security 2025 |
| ExploreAI（Wang et al.） | LLM 根据视图和任务文本选择目标；导航与多视角采集模块 | 导航和采集；逐物体的轨迹记录 | Unity、AI2-THOR 和 BeamNG 应用 | arXiv 2026 |

有两条经验可以迁移。第一，**结构使执行变得可靠**：借助场景图访问，XRintTest 达到 93% 的覆盖率，而随机输入只有 8%。第二，**第三方应用是封闭的**：AUTOVR 只有通过对二进制文件插桩才能驱动商业 Quest 应用，而面向最终用户的智能体都做不到这一点。XRBench3D 也是目前最接近可执行 XR 交互基准的东西，但它没有指令，也没有像素感知。

### 2.8 产品：Galaxy XR 上的 Gemini、Meta XR Operator、visionOS 上的 Siri

**Samsung Galaxy XR 上的 Gemini。** 发布文章（blog.google，2025 年 10 月）声称 Gemini Live 能理解你所看和所做的事，可以“take action on your behalf across your apps”（在你的各个应用中代你执行操作），并在听到“Hey Google, organize these windows”（Hey Google，整理一下这些窗口）时排列打开的窗口。没有公开任何技术报告、基准或机制。Android XR 的开发者指南在应用内控制方面指向另一个方向：“To let your users navigate your app using their voice, use the Gemini live API along with function calling”（要让用户用语音浏览你的应用，请将 Gemini live API 与函数调用结合使用），也就是说，每个应用通过函数调用自行构建语音控制。由于覆盖范围和成功率都未公开，Galaxy XR 上的 Gemini 是这一想法恰逢其时的最强**产业信号**，但无法把它评估为已经解决该问题的现有技术（prior art）。如果按*声称的*范围把产品和论文放在一起排序，它会排在最前面。

**Meta XR Operator。** 于 2026 年 8 月 18 日推出，定位为“an OpenXR API layer, now available as an experimental component in the Meta XR SDK (v205)”（一个 OpenXR API 层，现已作为实验性组件包含在 Meta XR SDK（v205）中）。一个运行时 MCP（Model Context Protocol）服务器运行在应用进程内，一个代理使智能体在应用重启后仍保持连接。借助它，用博客的原话说，智能体可以“Screenshot the running app as rendered in Meta XR Simulator”（截取在 Meta XR Simulator 中渲染的运行中应用的画面）、“Read room geometry (walls, floors, furniture)”（读取房间几何：墙壁、地板、家具）、“Read the Unity scene hierarchy, check components”（读取 Unity 场景层级，检查组件）、“Press buttons, move thumbsticks, pull triggers, point and aim”（按按钮、推摇杆、扣扳机、指向和瞄准），以及“Press buttons, work through menus, and navigate multi-step flows autonomously”（自主地按按钮、逐层操作菜单、完成多步流程）。博客也列出了局限：智能体“uses a single aim-ray per hand with no per-finger data”（每只手只使用一条瞄准射线，没有逐手指的数据）、“has no access to audio”（无法获取音频）、“works from screenshots only and cannot watch animations play out”（只基于截图工作，无法观看动画的播放过程），并且“operates too slowly for real-time interaction”（运行速度太慢，无法进行实时交互）。它的目的是为使用编程智能体的开发者闭合“构建-测试-验证”循环；它只在嵌入了该层的应用中工作，因此无法操作系统外壳（system shell）或其他应用，也没有公开的评估。**它是第一个让通用 LLM 智能体看到 VR 应用、并用控制器输入驱动其 UI 的厂商通道**，而它自己陈述的局限（手部关节、实时速度、运动中的内容）恰恰就是 3D GUI 智能体的研究问题。

**visionOS 27 上的 Siri AI。** Apple 新闻稿（2026 年 6 月 8 日）称 Siri 可以“answer questions related to the content on a user's screen”（回答与用户屏幕内容相关的问题），并能“get things done across apps with even more systemwide app actions”（借助更多系统级应用动作跨应用完成任务）。其机制在 WWDC26 关于 App Intents 的讲座中有解释，是语义层面的：应用通过 App Intents、App Entities 和视图标注来声明实体和动作。Apple 明确指出，除非应用采用这些 API，否则“Siri has an understanding of text on screen, but it's limited to exactly what's in the pixels. For example, Siri can't act on the tracks shown”（Siri 能理解屏幕上的文字，但仅限于像素中的确切内容。例如，Siri 无法对显示出来的曲目执行操作）。Apple 的设计是基于像素的 GUI 智能体的**另一极**：助手只对开发者公开的内容采取行动。这覆盖了选择接入的应用，而把界面的其余部分留给用户。

### 2.9 各部件并列比较

图中汇集了各部件的数字：我们能多好地感知 XR UI、把动作转换为 XR 输入、读取意图，以及跨 3D 世界和 2D 面板行动。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-pieces.svg" localized="true" caption="各部件的数字。(a) 感知：Orienter 在 VR 截图上 IoU 0.75 下的可交互性 F1 胜过训练过的检测器，而 2D 屏幕解析器 OmniParser 几乎完全失效。(b) 动作接地：在 ComboBench 的 262 个场景中，没有任何 LLM 能为超过 11.7% 的场景生成完全正确的控制器序列（y 轴画到 100% 以显示差距）。(c) 意图：SIAgent 的 top-1 意图准确率强烈依赖于所用的 LLM，而在注视之外加入手部信息几乎使其翻倍。(d) 混合 3D 世界与 2D 面板：在 Embodied Web Agents 的每个任务族中，最好的模型都远低于人类。" %}

延迟值得单独一张图。已发表的 XR 智能体一轮耗时在 4 s（DuoZone）到约 49 s（NavAI）之间。作为对比，Maslych et al.（CUI 2025）发现，在 VR 中，超过约 4 s 的响应延迟会降低与 LLM 驱动的虚拟智能体交互的体验质量，而实时游戏智能体在 100-250 ms 内行动。智能体一步的总延迟是一个求和

$$
t_{\text{step}} = t_{\text{capture}} + t_{\text{upload}} + t_{\text{prefill}} + t_{\text{decode}} + t_{\text{execute}},
$$

而在头显中，世界在这整个过程中一直在变化：用户会转头，因此计划所依据的截图在动作执行时已经过时。游戏智能体的处理方式是在慢速规划器之下放置一个快速的低层策略（Lumine 的自适应推理，JARVIS-1 在控制器之上的规划器）；XR 智能体尚未采用这种做法。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-latency.svg" localized="true" caption="每次智能体决策所需的秒数，对数刻度。已发表的 XR 智能体（紫色、青色、橙色）位于 2 s 到数分钟之间，处于或高于 VR 用户体验质量下降的 4 s 点（黑色虚线）。游戏智能体 Lumine 表明，使用 7B 模型进行实时 3D 控制时，0.1-0.25 s（绿色带）是可以达到的。红线是常被引用的约 20 ms 的运动到光子（motion-to-photon）目标，这一目标需要由渲染循环而不是智能体来满足。" %}

最后，把每项工作放到它所覆盖的智能体闭环阶段上。每个阶段都至少有一个强有力的部件，但没有一个系统能从用户请求出发、在现有应用的 3D GUI 上闭合整个闭环并报告任务成功率。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-loop.svg" localized="true" caption="3D GUI 智能体的“感知-理解-规划-行动-验证”闭环，最接近的工作被放在它们所覆盖的阶段上。观察（NavAI 的视野截图、Meta XR Operator、IWSDK）、接地（Orienter、VRSight）、意图（SIAgent、GazePointAR、EmBARDiment、Put-That-There）、规划（DuoZone、ComboBench）、行动（XRintTest、VRExplorer、AUTOVR、Operator）和验证（Orienter 的反思、XRI 事件）都各自存在。中心，即在现有应用上评估的完整闭环，是空的。" %}

## 3. 平台与工具：智能体能观察和控制什么

3D GUI 智能体需要两条通往设备的通道：**观察**（它能看到什么）和**动作**（它能做什么）。在当今的 XR 平台上，它各能获得多少，主要取决于**智能体是谁**。

### 3.1 智能体是谁：四个访问级别

| 级别 | 示例 | 观察 | 行动 | 状态（2026 年 11 月） |
| --- | --- | --- | --- | --- |
| L0：你自己应用中的测试框架 | Meta XR Operator、IWSDK MCP 工具、Jetpack `compose-testing`、Unity XRI 模拟器 | 像素、场景图、ECS 状态 | 设备级输入、组件写入 | 已存在，实验性 |
| L1：你自己应用内的智能体 | visionOS 应用中的端侧规划器；EmBARDiment | 自身 UI 加上获准使用的传感器 | 自身 UI | 现在即可实现 |
| L2：操作系统助手 | Siri AI、Galaxy XR 上的 Gemini Live、Meta VR Glasses 的 Meta AI 智能体 | 全系统 | 语义动作；仅限厂商 | 仅限厂商 |
| L3：第三方跨应用智能体 | 一个“头显版 AppAgent” | Android XR 上的 2D 面板无障碍树（accessibility trees）（未验证）；visionOS 上什么都没有 | 无障碍手势（Android，受政策限制） | 在设备上受阻；在模拟器和 WebXR 中开放 |

本专栏的研究问题是一个 **L3** 问题（操作他人的应用），但平台只开放了 L0-L2。实际的结论是：在自己可控的环境中研究 L3 问题，即 WebXR、Unity 和 Android XR 模拟器。

图中把一台 XR 设备分解为若干层，从底部的传感器到顶部的语义应用动作，并标出每个级别的智能体能触及哪些层。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-channels.svg" localized="true" caption="XR 设备的观察层与动作层（左，从原始传感器一直到语义应用动作），以及每类智能体能触及其中哪些层（右）。你自己应用内的测试框架（L0）几乎能触及一切；操作系统助手（L2）能触及厂商允许的一切；想要操作他人应用的第三方智能体（L3）最多只能获得需经用户同意的画面捕获、2D 面板树，以及在 PC 上的运行时级注入。" %}

### 3.2 Apple visionOS

- **观察。** 模拟器截图很容易获得。在设备上，屏幕捕获中的相机帧和透视画面（passthrough）需要附带许可证文件的**企业授权**（enterprise entitlements），仅向组织提供，且只能用于私有分发；每次广播都由用户发起；任何视图都可以通过 `contentCaptureProtected` 选择不被捕获。应用永远不会被告知用户在看哪里：注视数据留在系统内部。ARKit 的手部和世界数据需要 Full Space，因此一个智能体应用无法观察另一个应用。
- **结构。** SwiftUI 窗口公开标准的无障碍元素；RealityKit 的 3D 内容对 VoiceOver 不可见，除非开发者添加 `AccessibilityComponent`（标签、值、特征（traits）、系统动作和自定义动作、自定义转子（rotors））。这个组件是“3D 无障碍节点”应当包含哪些内容的现有最佳模板。
- **行动。** 不支持第三方输入注入。Apple 的 XCUIAutomation 概览指出“UI testing isn't available to apps you build using the visionOS SDK”（使用 visionOS SDK 构建的应用无法进行 UI 测试）。辅助模式（Pointer Control、Dwell Control、Switch Control、Voice Control）证明 UI 可以仅靠一条射线加停留（dwell）来驱动，但第三方无法以编程方式驱动这些模式。
- **语义途径。** App Intents 和 App Schemas 让应用为 Siri 声明动作；Foundation Models 框架提供一个约 3B 参数（2 bit 量化）、支持工具调用的端侧模型，可用于 L1 应用内智能体。

visionOS 拥有最精致的 3D UI，却是最不适合自动化研究的平台。它最适合用于用户研究和语义途径。

### 3.3 Android XR

- **模拟器。** Android XR 模拟器（头显、有线眼镜、AI 眼镜）于 2026 年 11 月 6 日与 Jetpack SceneCore 和 ARCore for Jetpack XR 一起升级为稳定版。在头显模拟器中，双手会“automatically direct their raycasts toward your mouse pointer position”（自动将射线指向鼠标指针所在的位置），拖动即执行捏合，注视跟随鼠标，视点用 WASD/QE 移动。只有右手捏合：“Left-hand controls and alternative gestures, such as grabbing and poking, aren't currently supported.”（目前不支持左手控制以及抓取、戳点等其他手势。）
- **结构。** Compose for XR 的文档给出了所有平台中最清晰的空间 UI 官方结构：一个由容器（空间面板、orbiter）组成的 3D 子空间语义树，以及每个面板内部各自独立的 2D 语义树，它们“operate as distinct hierarchies”（作为相互独立的层级运作）。智能体的观察应当镜像这种两级结构：带位姿的面板节点和体积节点，每个节点持有一棵 2D 控件树。进程内测试 API（`compose-testing`、`scenecore-testing`）为你自己的应用公开了这一结构。
- **行动。** 在 2D Android 上，开放的 GUI 智能体读取 `AccessibilityNodeInfo` 树，并通过 `AccessibilityService.performAction` 和 `dispatchGesture` 执行动作。这对放置在 3D 中的面板是否有效、手势坐标如何映射到面板空间，都**没有文档说明**；在模拟器中做一天实验就能弄清楚。AppFunctions 是 Android 的语义动作途径，需要特权调用方权限，因此实际上服务于系统助手。Gemini 的 UI 自动化于 2026 年 2 月 25 日在手机上（Galaxy S26 和部分 Pixel 10）预览，提供了一种可复用的安全设计：实时画面、随时手动接管，以及敏感操作之前的提醒。该公告没有提到 XR。

由于 2D Android 应用可以不经修改地作为面板运行，Android XR 模拟器是用 AndroidWorld 风格的任务来回答“2D GUI 智能体搬到 3D 中还能正常工作吗？”这一问题的天然场所。

### 3.4 Meta Horizon OS（Quest）

- **观察。** MediaProjection 在一个同意对话框之后捕获“the user's whole view or a single panel”（用户的整个视野或单个面板）；沉浸式应用可以通过 OpenXR 阻止捕获。Passthrough Camera API 在获得 `HEADSET_CAMERA` 权限后提供相机帧（Quest 3/3S 上最高 1728x1728，60 Hz，20-40 ms 延迟）；相机帧属于设备用户数据（Device User Data），禁止用于监视和识别人员。相机帧显示的是房间，而不是虚拟 UI。MRUK 提供带标签锚点（TABLE、COUCH、DOOR_FRAME）的房间模型。
- **结构。** Horizon OS 基于注视的“Look and Pinch”输入“infers interactable elements from your app's view hierarchy and accessibility information”（从应用的视图层级和无障碍信息中推断可交互元素）：操作系统本身利用无障碍元数据在 2D 面板上对注视进行接地，这直接证明了无障碍树是 3D 输入可行的接地基础。但 `BIND_ACCESSIBILITY_SERVICE` 位于 Meta 的禁用权限列表中，因此 AppAgent 式的无障碍服务智能体无法在商店中分发。
- **行动。** 对嵌入了 Meta XR Operator（第 2.8 节）的应用可以使用它；Meta XR Simulator 是一个带合成房间、键盘/鼠标/手柄输入以及会话录制与回放功能的 OpenXR 运行时，可用于不需要头显的运行；可编写脚本的测试服务可以关闭边界（boundary）和休眠，以便无人值守地运行（这也说明此类控制绝不能暴露给佩戴中设备上的自主智能体）。

### 3.5 OpenXR、WebXR 与引擎

- **OpenXR API 层**（OpenXR API layers）位于应用与运行时之间，可以记录或改写位姿和按钮状态（OpenXR-Toolkit 的手部到控制器重映射表明，在不修改应用的情况下改写输入是可行的）；Meta XR Operator 本身就是这样一个层。开源运行时 **Monado** 有一个键盘驱动的 HMD，以及一个通过 TCP 接收位姿的远程驱动。这是在 PC 上唯一适用于任意第三方 OpenXR 应用的通道，但 OpenXR 没有 UI 的概念：结构必须来自像素。
- **WebXR** 是最开放的途径。**IWER**（Meta，MIT 许可证）用一个可编写脚本的头显、控制器和双手替换 `navigator.xr`。**IWSDK** 是 Meta 基于 three.js 的 ECS 框架，运行一个带 32 个工具的 MCP 服务器：像素（`capture_canvas`、`browser_screenshot`）、结构（`get_scene_hierarchy`、`ecs_snapshot`、`ecs_diff`、`ui_inspect`）、输入（`set_transform`、`look_at`、`select`、`set_input_mode`）和时间控制（`ecs_pause`、`ecs_step`），并以无头（headless）的“agent”模式配合一个托管的 Playwright 浏览器运行。较早的 Immersive Web Emulator 扩展已于 2026 年 10 月 1 日归档；新的工作应基于 IWER/IWSDK 构建。
- **Unity**（XR Interaction Toolkit 3.5 配合 XR Interaction Simulator，以及 Input System 测试夹具（test fixtures））是大多数商业 XR UI 的构建之处，也是 XRintTest 的交互图和预言机所在之处。**Godot** 对 Control 节点有实验性的 AccessKit 屏幕阅读器支持，**Unreal** 有实验性的 Slate 无障碍支持；两者都没有值得一提的 XR 测试框架。

### 3.6 隐私、安全与商店规则

一个在用户家中看到用户所见之物的智能体，继承了每个平台最严格的规则，并且增加了 2D 智能体所没有的风险：

- **旁观者与房间。** 相机帧中包含其他人；Meta 禁止据此识别人员。在一项有 1,036 名受访者的众包调查中，位置数据被评为 XR 对话智能体可能使用的最敏感数据（Bozkir 和 Kasneci，arXiv 2025）。
- **生物特征。** 头部和手部运动能识别身份：Nair et al.（USENIX Security 2023）根据 100 s 的运动数据，在 55,541 名用户中识别出了 94.33%。智能体轨迹属于个人数据。
- **人身安全。** 移动窗口可能遮挡真实障碍物；改变边界或透视程度可能隐藏危险。
- **欺骗性 UI 与注入。** MetaScanner（Lee et al.，据 arXiv 已被 Computers & Security 接收）展示了社交 VR 中的四种欺骗性 UI 攻击，这对会点击的智能体是直接威胁。房间中或其他应用面板中可见的文字是一个提示注入（prompt injection）通道，而 2D 智能体较少面对这种情况（这是一个推断；未找到 XR 专门的研究）。
- **过度依赖。** 在一项 32 名参与者的研究中，AI 输出的 AR X 光可视化比 2D 小地图导致了更多不恰当的依赖（主要是过度依赖）（Liu et al.，CHI 2026）：逼真的原位（in-situ）输出很有说服力。
- **不可逆操作**需要确认，正如 Gemini 在敏感任务前的提醒和 DuoZone 的先确认后应用。

### 3.7 可行性矩阵与三套原型技术栈

该矩阵按平台汇总了智能体能否观察像素和 UI 结构、能否注入输入、能否使用自动化框架，以及能否在模拟器中收集数据。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-feasibility.svg" localized="true" caption="构建和测试 3D GUI 智能体的可行性矩阵（2026 年 11 月的状态）。绿色：可用且有文档；米色：部分可用、受限或仅限自己的应用；红色：不可用；灰色：无文档说明。使用 IWER/IWSDK 的 WebXR 是唯一全行皆绿的平台，但面向的是没有操作系统外壳的合成应用；visionOS 最封闭；Android XR 和 Horizon OS 居中，各自都有模拟器以及自身应用的结构。" %}

本文背后的平台调研档案（dossier）推荐按以下顺序，为第一个原型选用三套技术栈：

1. **基于 IWER/IWSDK 的 WebXR，由 Playwright 驱动。** 10-20 个带 3D GUI 的小型 WebXR 应用（设置菜单、窗口管理器、模型查看器、媒体播放器、带键盘的表单）。被测智能体只能看到每只眼的 RGB（可选 set-of-mark 叠加），并通过设备级输入（头部位姿、控制器或手部射线、选择或捏合）行动；检查器保留特权 ECS 访问，用于检查是否成功。开放、免费、确定性、无头、真值精确；但应用是合成的，也没有系统 UI。
2. **带 AccessibilityService 的 Android XR 模拟器。** 移植 AndroidWorld 风格的任务；真实的 Android、作为面板的真实应用、系统 UI；可与 2D 数字直接比较。但空间无障碍没有文档说明，而且模拟器只有右手捏合。
3. **配合 XR Interaction Simulator 的 Unity XRI 场景，可选 Meta XR Simulator 和 Operator。** 来自 XRBench3D 的抓取、插槽和操纵任务，以 XRI 事件作为预言机，以及录制的人类演示。真实，但笨重，而且 Operator 是实验性的、速度慢。

无论采用哪套技术栈，回合日志（episode log）都决定了以后能学到什么。一个由现有工具拼合而成的合理模式（schema），在单一的单调时钟上为每个 tick 或事件记录一行 JSON：

| 字段 | 内容 | 记录类似内容的现有工具 |
| --- | --- | --- |
| `head_pose`、`hands`、`controllers` | 位置和四元数；26 个 OpenXR 手部关节，或按钮和轴 | BOXRR-23 XROR 格式、Meta XR Simulator VRS 捕获、IWER `ActionRecorder` |
| `gaze` | 起点、方向、命中实体（仅在允许的情况下） | GazeBaseVR、Aria |
| `ui_tree` | 实体 id、角色、标签、值、世界位姿与包围盒、是否可见、是否可交互、父节点 | IWSDK `ecs_snapshot`/`ui_inspect`、Jetpack 子空间语义、RealityKit `AccessibilityComponent` |
| `action` | 原始设备动作（位姿增量、选择、捏合）和语义动作（动词 + 目标 id） | GenXR-Bench 行动者 API、IWSDK MCP 工具、Meta XR Operator |
| `frames` | 每只眼的 RGB、深度、实体 id 掩码、set-of-mark 叠加、内参和外参 | GenXR-Bench 截图、Orienter 帧 |
| `outcome` | 检查器结果、原因、最终状态哈希 | OSWorld 脚本、AndroidWorld init/check/teardown |

存储内参和外参很重要，因为图像中的一次点击必须还原为一条 3D 射线。一点几何知识就能说明为什么在 XR 中指向很难：距离为 $d$、宽度为 $s$ 的目标所张的视角为

$$
\theta = 2\arctan\frac{s}{2d},
$$

因此，1.5 m 外面板上一个 2 cm 的按钮张角约为 0.76°。一个在手机截图上偏差几个像素的 2D 接地器，在头显画面中偏差就是零点几度，这足以点不中目标。

## 4. XR 界面的数据集与基准，以及数据空白

2D GUI 智能体建立在人类演示数据集之上：AITW（715,142 个回合）、AndroidControl（833 个应用上的 15,283 条演示）、Mind2Web（137 个网站上的 2,000+ 个任务），以及 AndroidWorld（116 个任务）和 OSWorld（369 个任务）等可执行基准。XR 没有类似的东西。现有的是：

| 数据集 | 包含内容 | 规模 | 发表处 |
| --- | --- | --- | --- |
| Orienter IGE 集 | 带可交互元素框的 Steam VR 右眼截图 | 1,552 张图像，100 个应用，4,470 个框，766 个类别 | FSE 2026 |
| DISCOVR（VRSight） | 社交 VR 帧，30 个类别，包括 menu、button、ui-text、HUD | 17,691 张图像，17 个应用，约 92K 个实例 | UIST 2025 |
| StereoID 截图 | VR 应用的立体截图 | 171K 张截图，288 个应用 | FSE 2024 |
| GUI-World（XR 子集） | 屏幕录制的 GUI 视频及问答 | 393 个 XR 视频，3,930 个问答（共 12,379 个视频） | ICLR 2025 |
| ComboBench | 语义动作与录制的控制器/HMD 序列，仅文本 | 262 个场景 | arXiv 2025 |
| XRBench3D | 带可执行交互的 Unity 场景 | 10 个场景，456 个交互 | Automated Software Engineering 2026 |
| MineXR | 在头显上制作的个性化 XR 布局 | 31 名参与者，695 个控件，109 个布局 | CHI 2024 |
| GenXR-Bench | 带脚本行动者和 VLM 行动者的 WebXR 开发任务 | 112 个任务 | arXiv 2026 |

在 VRSight 的 DISCOVR 集上，小型 YOLOv8n 检测器达到 67.3 mAP50 和 46.3 mAP50-95（menu 62.2，button 45.9），因此从像素检测 VR UI 元素是可行的，但远未解决。行为数据集很丰富（BOXRR-23 有来自 105,852 名用户的 4.7M 条运动记录，GazeBaseVR 有 407 名参与者、250 Hz，HOT3D 有来自 Aria 和 Quest 3 的手部与物体数据），但它们都没有 UI 标签。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-datasets.svg" localized="true" caption="XR 数据集（紫色）以及它们需要比肩的 2D GUI 智能体数据集（灰色）。左：对数刻度下的规模（单位各不相同）。右：每个数据集包含什么。2D 数据集同时包含画面帧、UI 标签、自然语言任务和动作；每个 XR 数据集至多包含其中两项，GenXR-Bench 除外，它的任务是开发者任务，动作是脚本化的测试行动者（圆环）。" %}

**目前没有关于 XR GUI 上指令到动作轨迹的公开数据集**，也没有 AndroidControl、AITW、Mind2Web 或 OSWorld 的 XR 对应物。最接近的基础是 GUI-World 的 XR 视频（问答，而非任务）、XRBench3D（有交互，无指令）、ComboBench（有文本，无截图），以及 Orienter 和 DISCOVR 的截图（有框，无动作）。GenXR-Bench 的测试框架在架构上最接近：它的 VLM 行动者观察一棵带稳定 id 的剪枝对象树和 set-of-mark 截图，通过一个查看器、手部、瞄准和选择 API（`navigateTo`、`setHandPose`、`pointTo`、`rayClick`……）行动，并由程序化断言检查；但它评估的是编程智能体，而不是 GUI 智能体。带精确实体标签的合成渲染（WebXR、Unity、Jetpack 测试 API）是获得接地数据的可扩展途径，正如 Jedi 的 UI 合成之于 2D。

## 5. 空白

### 5.1 尚无任何工作做到的事

经过本专栏背后的检索（arXiv、OpenAlex、ACM DL、IEEE Xplore、会议论文集和官方产品页面，截至 2026 年 11 月 24 日），**没有找到任何同行评审论文或预印本提出这样一个智能体，它**

- 接收头显用户的**自然语言**（或语音加注视和指向）请求，
- 从渲染视图和/或 UI 结构中**感知现有 XR 应用的 3D GUI**（放置在不同深度、部分被遮挡或位于视野之外的窗口、体积、菜单、控件），
- 使用 XR 输入（射线与捏合、控制器、注视、窗口管理器）**跨应用规划并执行多步操作**，并且
- **作为 GUI 智能体被评估**，即在一组指令和应用上报告任务成功率；

也没有找到**关于 XR GUI 上指令到动作轨迹的基准或数据集**。本专栏研究的两轮独立检索都得出了这一结论，而 Guo et al. 2026 年的软件工程综述也把用于 VR GUI 探索的 LLM 智能体列为开放问题。通常的保留意见同样适用：检索中没有发现证据并不能证明不存在，而工业系统（首先是 Galaxy XR 上的 Gemini）可能已经在未发表的情况下实现了其中的部分内容。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/04-gap.svg" localized="true" caption="以三个相互重叠的集合表示的空白：感知现有 XR 应用 3D UI 的工作（蓝色）、理解自然语言用户意图的工作（橙色）、操作 XR UI 的工作（绿色）。每两个集合的交集都已有工作占据（NavAI：像素和语言，但用于移动；Meta XR Operator：像素和操作，用于开发者测试；Put-That-There 和 DuoZone：语言和窗口操作，通过元数据）。在已发表的记录中，中心是空的；Galaxy XR 上的 Gemini 声称位于那里，但其机制和评估均未公开。" %}

### 5.2 这一想法增加了什么，以及在哪里承认重叠

**已有的东西，逐项来看：** 从像素感知 XR GUI 元素（Orienter、DISCOVR）；从语言到控制器动作规划，但不执行（ComboBench）；从语言和截图到 VR 移动的闭环（NavAI）；从注视和双手推断意图并执行 VR 操作（SIAgent）；通过元数据从语言和指示语到窗口放置（Put-That-There；DuoZone，带确认）；不含意图的 3D 交互自动执行（VRExplorer、XRintTest、AUTOVR）；让智能体看到并驱动 VR 应用的基础设施（Meta XR Operator、IWSDK、XARP Tools）；以及一个跨应用动作和窗口排列细节未公开的已上市助手（Galaxy XR 上的 Gemini）。

**3D GUI 智能体这一想法增加的内容：**

1. 把这些部件**统一**为一个在现有 XR 应用 GUI 上经过评估的“感知-理解-操作”闭环；
2. 任何部件都未涉及的 **3D 特有**部分：深度、遮挡和视野外的 UI；窗口和体积的 6-DoF 操纵；平面面板与 3D 内容的混合（Embodied Web Agents 的失败模式）；以及作为指令一部分的注视和手部指示语；
3. 一种**引导模式**，在该模式下，同一个智能体用空间提示向用户展示如何操作 UI，而不是自己行动；
4. 这样一个**动机**：操作复杂性制约了 3D 终端，而这些工作中没有一项把它当作自己要解决的问题；以及
5. 一个**基准和轨迹数据**。

**本专栏在哪里承认重叠。** Orienter 的 arXiv 标题已经提到面向 XR 应用的“Vision-Based Spatial Intelligent Agent”（基于视觉的空间智能体）。Put-That-There 和 DuoZone 已经让 LLM 根据语言对 XR 窗口层采取行动。Google 公开声称 Galaxy XR 上的 Gemini 能跨应用行动并排列窗口。Meta 推出了一个让智能体逐层操作 VR 菜单的工具。因此，这一想法**恰逢其时，并已被部分预见**：它的新颖性在于面向通用 3D GUI、经过评估、由用户意图驱动的统一智能体，在于 3D 特有的感知与动作，以及基准，而不在于泛泛的“XR 中的智能体”。

### 5.3 开放问题

1. **任务基准。** 固定的应用、自然语言用户任务、设备级动作、视点变化和基于状态的检查器。XRBench3D、GenXR-Bench 的测试框架和 AndroidWorld 的 init/check/teardown 是可用的模板。
2. **UI 的 3D 感知。** 零样本可交互元素 F1 在 IoU 0.75 下低于 50%，在更严格的 IoU 下崩溃；没有工作利用立体、深度或头部位姿在 3D 中定位 UI 元素。
3. **6-DoF 动作接地。** LLM 只能达到 11.7% 的完全正确控制器序列；没有可与点按/滑动/输入（tap/swipe/type）相比的标准 XR 动作空间。候选方案：目标 id 加动词、射线加捏合，或 6-DoF 位姿增量。
4. **延迟。** 已发表的 XR 智能体每轮耗时 4-49 s；交互式使用能容忍约 4 s；实时 3D 控制需要 0.1-0.25 s。分层控制（慢速规划器、快速局部指向）、经验复用（PastForward 报告端侧步骤快 1.63-2.36x）和具身的等待反馈（Arora et al. 发现在 VR 中手势比加载转圈图标更好）是可用的杠杆。
5. **视野外记忆。** 用户身后的窗口和被遮挡的体积需要空间记忆；VSI-Bench 表明 MLLM 在这方面很弱。
6. **API 动作与 GUI 动作。** Apple 和 Google 通过应用意图和函数调用来路由助手动作，只覆盖选择接入的应用；GUI 操作覆盖一切，但很脆弱。混合动作空间在 CAD 智能体中有帮助，但在 XR 中尚未被探索。
7. **访问权限。** 第三方应用在设备上是封闭的；3D 无障碍树（RealityKit 的 `AccessibilityComponent`、Jetpack 的子空间语义）未被充分利用，而且也不存在一种秉承 W3C XR Accessibility User Requirements 精神的可移植“3D 无障碍节点”模式。
8. **空间中的共享控制。** 智能体如何展示它即将做什么（幽灵手、高亮、预览）、何时询问、如何交还控制权，这些问题已经在引导和窗口布局中得到研究（DuoZone、Sensible Agent、AgentHands），但尚未在 GUI 操作中研究。一项 Vision Pro 研究（Zhang et al.，arXiv 2026，n=24）发现，完全自主的智能体游玩使工作负荷最小，但降低了挑战感、自主感、沉浸感和乐趣：“替我做”（do it for me）并不总是用户想要的。
9. **安全与隐私。** 欺骗性 UI、来自房间的提示注入、旁观者、生物特征痕迹，以及移动内容带来的物理副作用。
10. **数据。** 没有带 UI 标注和动作的人类 XR GUI 使用记录。

本专栏打算如何攻克这些问题，是[研究计划]({{ '/blog/2026/3d-gui-agent-05-research-plan/' | relative_url }})的主题；动机和研究问题见[研究愿景]({{ '/blog/2026/3d-gui-agent-01-research-vision/' | relative_url }})。

## 动手试试

- 在第 2 节的**能力地图**中，打开目标区域并按 2026 年筛选：哪些工作最接近它的那个角？每项工作分别缺少四个属性中的哪一个？
- 先按平台“Quest / Horizon OS”、再按“Vision Pro”筛选地图：比较每个平台上已经做过哪些研究，以及第 3.7 节的可行性矩阵说该平台允许做什么。
- 首页的[交互实验室]({{ '/' | relative_url }}#lab)（Interactive Lab）在浏览器中运行手写的 WebGL，这与第 3.7 节推荐的 WebXR 技术栈是同一种技术。

## 代表性论文

截至 2026 年 11 月的状态。“arXiv”表示仅为预印本。

| 论文 | 作者 | 发表处 | 年份 | 链接 | 为什么重要 |
| --- | --- | --- | --- | --- | --- |
| Look Before You Leap: Context-Sensitive GUI Grounding for Boosting Automated Extended Reality (XR) Testing (Orienter) | Shuqing Li et al. | FSE (PACMSE) | 2026 | [DOI](https://doi.org/10.1145/3808134) | 唯一在渲染的 VR 帧中对 GUI 元素进行接地的同行评审工作 |
| ComboBench: Can LLMs Manipulate Physical Devices to Play VR Games? | Shuqing Li et al. | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2510.24706) | 测量从语言到控制器动作的接地：最好也只有 11.7% |
| NavAI: A Generalizable LLM Framework for Navigation Tasks in Virtual Reality Environments | Xue Qin, Matthew DiGiovanni | ASE Workshops | 2025 | [arXiv](https://arxiv.org/abs/2601.03251) | 从语言和 VR 截图出发的闭环，用于移动 |
| SIAgent: Spatial Interaction Agent via LLM-powered Eye-Hand Motion Intent Understanding in VR | Zhimin Wang, Chenyu Gu, Feng Lu | IEEE TVCG | 2026 | [arXiv](https://arxiv.org/abs/2603.00522) | 智能体根据推断出的意图执行 VR 操作 |
| Revisiting put-that-there, context aware window interactions via LLMs | Riccardo Bovo et al. | ISMAR Adjunct | 2025 | [arXiv](https://arxiv.org/abs/2511.02378) | LLM 根据语音、指向和注视对 XR 窗口层采取行动 |
| DuoZone: A User-Centric, LLM-Guided Mixed-Initiative XR Window Management System | Jing Qian et al. | IEEE TVCG | 2026 | [arXiv](https://arxiv.org/abs/2511.15676) | 评估最充分的语言驱动 XR UI 系统（N=16） |
| Voice2Action: Language Models as Agent for Efficient Real-Time Interaction in Virtual Reality | Yang Su | arXiv | 2023 | [arXiv](https://arxiv.org/abs/2310.00092) | 通过引擎实现的早期“语言到 VR 动作”智能体 |
| LLMR: Real-time Prompting of Interactive Worlds using Large Language Models | Fernanda De La Torre et al. | CHI | 2024 | [DOI](https://doi.org/10.1145/3613904.3642579) | LLM 读取 XR 场景图并改变世界 |
| GenXR-Bench: Benchmarking Coding Agents for Interactive XR Development | William Huang et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2610.29014) | 带有操作 XR 应用的 VLM 行动者的测试框架 |
| XARP: A Human-First and Agent-Ready Extended Reality Toolkit in Python (arXiv: XARP Tools) | Arthur Caetano et al. | PACM HCI (EICS) | 2026 | [DOI](https://doi.org/10.1145/3816762) | 以工具形式并通过 MCP 向智能体公开的 XR 工具包 |
| GazePointAR: A Context-Aware Multimodal Voice Assistant for Pronoun Disambiguation in Wearable Augmented Reality | Jaewook Lee et al. | CHI | 2024 | [arXiv](https://arxiv.org/abs/2404.08213) | 从注视和指向获取指示性意图 |
| EmBARDiment: an Embodied AI Agent for Productivity in XR | Riccardo Bovo et al. | IEEE VR | 2025 | [arXiv](https://arxiv.org/abs/2408.08158) | 把对 XR 窗口的注视作为 LLM 上下文 |
| Satori: Towards Proactive AR Assistant with Belief-Desire-Intention User Modeling | Chenyi Li et al. | CHI | 2025 | [DOI](https://doi.org/10.1145/3706598.3714188) | 带显式用户模型的主动引导 |
| Sensible Agent: A Framework for Unobtrusive Interaction with Proactive AR Agents | Geonsun Lee et al. | UIST | 2025 | [arXiv](https://arxiv.org/abs/2509.09255) | XR 智能体应当如何询问，以及通过哪个通道询问 |
| Guided Reality: Generating Visually-Enriched AR Task Guidance with LLMs and Vision Models | Ada Yi Zhao et al. | UIST | 2025 | [arXiv](https://arxiv.org/abs/2508.03547) | 引导模式的视觉词汇 |
| VRExplorer: A Model-based Approach for Semi-Automated Testing of Virtual Reality Scenes | Zhengyang Zhu et al. | ASE | 2025 | [arXiv](https://arxiv.org/abs/2607.10174) | 对 Unity VR 场景的自动化抓取/触发操作 |
| Automated Testing of Prevalent 3D User Interactions in Virtual Reality Applications (XRintTest) | Ruizhen Gu et al. | Automated Software Engineering | 2026 | [arXiv](https://arxiv.org/abs/2601.23139) | 交互流图与 XRBench3D（456 个交互） |
| AUTOVR: Automated UI Exploration for Detecting Sensitive Data Flow Exposures in Virtual Reality Apps | John Y. Kim et al. | USENIX Security | 2025 | [arXiv](https://arxiv.org/abs/2508.12187) | 通过二进制插桩驱动商业 Quest 应用的 UI |
| ExploreAI: Agentic Exploration Knowledge Bases for Reproducible Observable-Regression Testing of Black-Box VR and 3D Applications | Jiajie Wang et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2608.21628) | LLM 智能体探索黑盒 VR 应用 |
| VRSight: An AI-Driven Scene Description System to Improve Virtual Reality Accessibility for Blind People (DISCOVR) | Daniel Killough et al. | UIST | 2025 | [arXiv](https://arxiv.org/abs/2508.02958) | 最大的 VR UI 元素检测数据集 |
| Characterizing Virtual Reality Software Testing | Dhia Elhaq Rzig et al. | ISSTA | 2023 | [arXiv](https://arxiv.org/abs/2211.01992) | 314 个 Unity VR 应用中 79% 没有自动化测试 |
| Software Engineering Practice in the Virtual Reality/Augmented Reality Software Life Cycle: A Systematic Survey | Hanyang Guo et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2611.18567) | 把用于 VR GUI 探索的 LLM 智能体列为开放问题 |
| Scaling Instructable Agents Across Many Simulated Worlds (SIMA) | SIMA Team | arXiv | 2024 | [arXiv](https://arxiv.org/abs/2404.10179) | 跨多款 3D 游戏的单一“像素到输入”策略 |
| SIMA 2: A Generalist Embodied Agent for Virtual Worlds | SIMA Team | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2512.04797) | 基础模型兼作规划器和策略，并能自我改进 |
| Lumine: An Open Recipe for Building Generalist Agents in 3D Open Worlds | Weihao Tan et al. | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2511.08892) | 实时 3D 智能体：约 0.1-0.25 s 给出第一个动作 |
| VideoGameBench: Can Vision-Language Models complete popular video games? | Alex L. Zhang et al. | arXiv | 2025 | [arXiv](https://arxiv.org/abs/2505.18134) | 实时性是首要因素：0.48% 对比暂停时的 1.6% |
| Embodied Web Agents: Bridging Physical-Digital Realms for Integrated Agent Intelligence | Yining Hong et al. | NeurIPS D&B | 2025 | [arXiv](https://arxiv.org/abs/2506.15677) | 在 3D 世界与 2D 面板之间切换是主要的失败来源 |
| VisionClaw: Always-On AI Agents through Smart Glasses | Xiaoan Liu et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2604.03486) | 通过服务行动的眼镜智能体 |
| Thinking in Space: How Multimodal Large Language Models See, Remember, and Recall Spaces (VSI-Bench) | Jihan Yang et al. | CVPR | 2025 | [arXiv](https://arxiv.org/abs/2412.14171) | 基于第一人称视频的空间记忆很弱 |
| GUI-World: A Video Benchmark and Dataset for Multimodal GUI-oriented Understanding | Dongping Chen et al. | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2406.10819) | 唯一带 XR 子集的 GUI 基准 |
| MineXR: Mining Personalized Extended Reality Interfaces | Hyunsung Cho et al. | CHI | 2024 | [arXiv](https://arxiv.org/abs/2403.08057) | 人们把 XR UI 放在哪里 |
| Unique Identification of 50,000+ Virtual Reality Users from Head & Hand Motion Data | Vivek Nair et al. | USENIX Security | 2023 | [arXiv](https://arxiv.org/abs/2302.08927) | 智能体轨迹属于生物特征数据 |
| Can AR Embedded Visualizations Foster Appropriate Reliance on AI in Spatial Decision-Making? | Xianhao Carton Liu et al. | CHI | 2026 | [arXiv](https://arxiv.org/abs/2507.14316) | 原位 AI 输出导致过度依赖 |
| Mitigating Response Delays in Free-Form Conversations with LLM-powered Intelligent Virtual Agents | Mykola Maslych et al. | CUI | 2025 | [arXiv](https://arxiv.org/abs/2507.22352) | 约 4 s 是 VR 中的延迟预算 |
| MetaScanner: An Empirical Study and Proactive Defense against Deceptive UI Attacks in Social VR | Junhee Lee et al. | Computers & Security（已接收） | 2026 | [arXiv](https://arxiv.org/abs/2611.25608) | 点击 XR UI 的智能体所面对的威胁模型 |

产品与平台文档（官方来源）：[Introducing Galaxy XR](https://blog.google/products/android/samsung-galaxy-xr)（Google，2025 年 10 月）；[Introducing Meta XR Operator](https://developers.meta.com/horizon/blog/meta-xr-operator-close-the-build-test-verify-loop-for-vr/)（Meta，2026 年 8 月 18 日）；[Apple 的 Siri AI 发布公告](https://www.apple.com/newsroom/2026/06/apple-unveils-next-generation-of-apple-intelligence-siri-ai-and-more/)（2026 年 6 月 8 日）以及 [About visionOS 27 updates](https://support.apple.com/en-us/149067)；[Android XR 模拟器](https://developer.android.com/develop/xr/jetpack-xr-sdk/run/emulator/xr-headsets-glasses)；[IWSDK AI 辅助开发工具](https://developers.meta.com/horizon/documentation/web/iwsdk-ai-assisted-dev-tooling)；[XCUIAutomation](https://developer.apple.com/documentation/xcuiautomation)（关于 visionOS UI 测试的说明）。

## 学习资源

- 本文背后的两份研究调研档案，位于仓库中：`docs/research/3d-gui-agent/03-agents-in-xr-and-3d.md`（123 项工作，附深入笔记和重叠评分）和 `04-platforms-and-tooling.md`（156 个条目、可行性矩阵和原型技术栈）。
- 可动手实践的智能体基础设施：[IWER](https://github.com/meta-quest/immersive-web-emulation-runtime) 和 [Immersive Web SDK](https://github.com/facebook/immersive-web-sdk)（WebXR，MIT）；[OpenXR API 层文档](https://github.com/KhronosGroup/OpenXR-SDK-Source/blob/main/src/api_layers/README.md)；开源运行时 [Monado](https://monado.freedesktop.org/developing-with-monado.html)；Unity 的 [XR Interaction Toolkit](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@3.5/changelog/CHANGELOG.html) 及其模拟器。
- 空间 UI 结构：Apple 的 [AccessibilityComponent](https://developer.apple.com/documentation/realitykit/accessibilitycomponent) 和 Jetpack 的 [Compose for XR 测试包](https://developer.android.com/reference/kotlin/androidx/xr/compose/testing/package-summary)；W3C 的 [XR Accessibility User Requirements](https://www.w3.org/TR/xaur/)。
- 可借鉴的 2D 基准：[OSWorld](https://arxiv.org/abs/2404.07972) 和 [AndroidWorld](https://arxiv.org/abs/2405.14573)，用于借鉴检查器和参数化任务；[Set-of-Mark prompting](https://arxiv.org/abs/2310.11441)，用于借鉴叠加标记。

## 练习

1. 把第 0 节的评分标准应用于一项不在热力图中的工作，例如 LLMER、AssistVR 或 Guided Reality。哪个属性最难评分？为什么？

   <details markdown="1"><summary>提示</summary>

   从系统的输出入手：改变世界的代码或 JSON（LLMER）、通过语音和射线投射进行的编辑（AssistVR），或者引导叠加层（Guided Reality）。“操作”一列通常是最难的，因为编辑世界、操作可交互物和引导之间的界线取决于定义；像本文一样，写下你采用的规则。
   </details>

2. 头显中的用户以 60°/s 转头，而智能体一轮需要 4 s。在截图与动作之间，视图转过了多少？这对点击图像坐标的智能体意味着什么？你会改为向执行器发送什么？

   <details markdown="1"><summary>提示</summary>

   240°：目标现在可能已经在用户身后。过时图像中的坐标毫无意义；应发送一个在头部运动后依然有效的目标，例如实体 id，或者锚定在房间中的世界空间射线或点，并让一个快速的局部控制器在执行时重新瞄准（第 2.9 节）。
   </details>

3. 用 $\theta = 2\arctan(s/2d)$ 计算一个 2 cm 按钮在 0.5 m、1.5 m 和 3 m 处的视角。如果一张 960 像素宽的头显画面水平覆盖约 100°，在每种情况下按钮有多少像素宽？

   <details markdown="1"><summary>提示</summary>

   约 2.29°、0.76° 和 0.38°，即按每度 9.6 像素计约为 22、7 和 4 像素。在 3 m 处，按钮已接近 2D 接地器变得不可靠的尺寸（可对比 ScreenSpot-Pro 中大截图里的小目标），两个像素的误差就是按钮宽度的一半。
   </details>

4. 在第 3.7 节的 WebXR 技术栈上，为 3D GUI 智能体基准设计一个任务：写出指令、初始状态、智能体得到的观察、它的动作空间以及成功检查。检查器使用哪些 IWSDK 工具？哪些必须对智能体隐藏？

   <details markdown="1"><summary>提示</summary>

   例如：“把我身后的音乐播放器移到浏览器左边，并暂停歌曲。”初始状态：两个面板，其中一个在视野之外。智能体：每只眼的 RGB 加上头部位姿，以及一条带选择功能的控制器射线。检查器：用 `ecs_snapshot` 获取面板位姿和播放器状态。对智能体隐藏 `ecs_set_component`、`get_scene_hierarchy` 和 `ui_inspect`，否则它可以绕过感知。
   </details>

5. Galaxy XR 上的 Gemini 和 visionOS 上的 Siri 采取了不同的途径在应用中行动。从最终用户的角度，分别列出 API 优先途径的两个优点和 GUI 优先途径的两个优点，并提出一个混合策略。

   <details markdown="1"><summary>提示</summary>

   API 优先：可靠、快速，并且由开发者控制公开什么；但只覆盖选择接入的应用，而且只限于它们声明的动作。GUI 优先：覆盖每个应用和每个可见控件，用户还可以看着整个过程；但速度慢且脆弱。混合策略先尝试已声明的意图，失败时回退到带确认的 GUI 操作，就像 CAD 智能体在 API 调用和点击之间回退那样。
   </details>

**下一篇：** [研究计划]({{ '/blog/2026/3d-gui-agent-05-research-plan/' | relative_url }})
