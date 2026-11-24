---
layout: post
title: "3D GUI 智能体：替用户操作 VR、AR 与 MR 界面的研究愿景"
date: 2026-11-24 12:01:00+0900
description: "为什么头显和 XR 眼镜的 3D 界面难以操作，以及本专栏提出的研究方向：由智能体替用户操作空间 GUI，或引导用户完成操作。"
categories: 3d-gui-agent
tags: [gui-agent, xr, vr, mixed-reality, 3d-user-interfaces, accessibility, research-vision]
series: 3d-gui-agent
series_order: 1
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

手机成为日常设备，并不只是因为它有用。它还变得容易操作：手中一块平面屏幕，点一下看到的东西，再加上一个人们平均每分钟能打约 36 个单词的键盘。过去三年里，在此之上又发生了第二次变化。**GUI 智能体**（GUI agent），即读取屏幕并替用户点按、输入和滚动的 AI 模型，学会了操作手机、桌面和网站；在桌面基准 OSWorld 上，它们完成的任务比例从 2024 年 4 月的 12% 上升到 2025 年 12 月超过人类基线（[第 2 篇]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }})）。如今，一个人可以说出自己想要什么，让智能体去操作界面完成。

头显和 XR 眼镜还没有迎来这两个时刻中的任何一个。它们的界面是空间性的：窗口悬浮在用户周围，按钮位于不同的深度，菜单要用需要学习的手势打开，文本要在空中输入。实测表明，操作它们比操作手机更慢、更不准确，也更累（[第 3 篇]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }})）。而且我们没有找到任何已发表的评估，表明有智能体能像手机智能体那样替用户操作它们（[第 4 篇]({{ '/blog/2026/3d-gui-agent-04-agents-in-xr-and-the-gap/' | relative_url }})）。

本专栏提议把两者结合起来：一个**3D GUI 智能体**（3D GUI agent），替用户操作 VR、AR 或 MR 设备的空间界面，或引导用户完成操作。本文阐述这个想法，给出定义，用第 2 至 4 篇收集的证据为它论证，坦率地说明它能做什么、不能做什么，并列出开放问题。**本文确定的是截至 2026 年 11 月的研究方向。**它描述的是一个研究方向，而不是一项成果：我们目前还没有自己的系统，也没有自己的数据可以报告。

## 前置知识

- GUI 智能体是什么（观察（observe）、定位（grounding）、执行（act）、验证（verify）；基准上的任务成功率（task success））。[第 2 篇]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }})从零开始讲解了这些内容。
- 基本的 3D 交互词汇（射线指向、注视加捏合、空间中的窗口和体积）。[第 3 篇]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }})结合数字介绍了这些内容。
- 除此之外不需要别的。本文是专栏的入口，技术细节保持简略；深入的内容由三篇综述承担。

## 1. 我们所说的 3D GUI 智能体是什么

### 1.1 定义

> 我们所说的 *3D GUI 智能体*，是指这样一种智能体：它接收用户以语音或文本（可选地辅以指向）提出的请求，感知 VR、AR 或 MR 设备的空间用户界面，并替用户操作该界面，或引导用户完成操作。

这句话中有四个部分很关键。

1. **目标来自用户，以语言表达。**“打开浏览器”“把音乐播放器拿到这里”“打开那个让边界不再显示的设置”。指向、注视和头部朝向可以补全句子：“把*那个*放到*那边*”只有结合用户正在指向的位置才有意义。目标不是从覆盖率指标（如自动化测试中那样）或游戏的奖励中推断出来的。
2. **智能体感知空间用户界面（spatial user interface，spatial UI）**：即在 3D 中摆放在用户周围的窗口、面板、体积（volume）、菜单和控件。它通过渲染出的视图看到这些内容；在平台允许时，还通过 UI 结构看到它们，即场景图（scene graph）或无障碍树（accessibility tree）。它感知的是*界面*，而主要不是物理房间。
3. **它以几种方式之一行动。**它可以自己操作界面（选择、按下、抓取、移动、调整大小、输入、浏览菜单和应用）；可以引导用户（讲解、高亮、逐步指导）；在请求有歧义或某一步有重要后果时，还可以询问。第 6 节把这些模式视为一条连续的谱系。
4. **评判它的标准是在并非由它构建的界面上的任务成功率。**一个通过自身应用的引擎来改变虚拟世界的智能体，解决的是另一个问题。检验 3D GUI 智能体的标准是：它能否在现有应用和系统的界面上完成用户的请求，正如手机智能体是在并非由它们编写的应用上接受测试一样。

我们并不声称这个术语或这个想法从未被使用过。Orienter（Shuqing Li 等，发表于 FSE 2026）的 arXiv 标题已经提到了面向 XR 应用的“Vision-Based Spatial Intelligent Agent”（基于视觉的空间智能体），厂商也已经在描述能在头显上执行操作的助手（第 7 节）。本专栏的贡献是一个精确的问题表述、一个动机，以及围绕它的一套研究纲领。

### 1.2 循环：在手机上与在头显上

手机 GUI 智能体运行一个循环：**观察**屏幕，把下一步**定位**到一个元素上（“Share 按钮”变成一个位置），**执行**（点按、输入、滑动），然后**验证**屏幕是否如预期那样发生了变化。3D GUI 智能体运行同样的循环，但如图所示，每个方框都变了。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/01-loop-2d-vs-3d.svg" localized="true" caption="手机（上）与头显（下）上的 GUI 智能体循环。四个阶段相同；橙色注释说明在 3D 中有什么变化。观察取决于用户头部的朝向，目标是空间中的一个物体，可能被遮挡或位于用户身后，动作是射线、捏合和 6-DoF 位姿而不是点按，验证还必须考虑到在智能体思考期间发生了移动的内容。通向用户的红色通道（询问、确认、接管）在两边都存在，但在头显中，智能体工作时用户就身处界面之中。" %}

### 1.3 哪些在范围内，哪些不在

一个有用的定义要说明它排除了什么。以下是我们划定的边界，每条都附有理由。

**范围内：**

- **放置在 3D 中的 2D 面板。**人们在头显上做的大多数事情都发生在平面窗口中：浏览器、设置面板、邮件应用，常常还有不经修改、以面板形式运行的 2D Android 应用。它们的内容是 2D GUI，但找到它们、够到它们和排列它们是一个 3D 问题。
- **空间系统 UI。**启动器、快速设置、窗口管理器、重新居中和边界控件、系统键盘：这是每个用户都必须操作的一层，也是那些藏得很深的设置所在的地方。
- **3D 控件与体积。**空间中的滑块和旋钮，需要旋转或缩放的 3D 模型，以及控件是物体而不是按钮的体积式应用。
- **沉浸式应用的 UI，当任务是界面操作时。**在 VR 应用里更改一项设置、打开它的菜单、在它的物品栏界面中选择一件物品。界线在于任务而不在于应用：操作应用的界面在范围内，玩这个应用则不在。
- **多应用任务。**“把菜谱放到计时器旁边，并开始 10 分钟倒计时”横跨两个应用和窗口层，就像 2D 基准发现最难的那类跨应用任务。

**范围外：**

- **生成 XR 内容**（构建或编辑场景的 LLM，例如 CHI 2024 上的 LLMR）。智能体通过引擎改变世界；它并不操作别人制作的界面。
- **物理任务的引导**（借助 AR 指示组装家具、修理机器，如 UIST 2025 上的 Guided Reality）。任务的对象是真实世界，而不是 GUI，尽管其由箭头和高亮构成的视觉词汇对我们的引导模式很有用。
- **回答关于所见内容的问题**（CHI 2024 上的 GazePointAR、眼镜助手）。回答是没有动作的感知与对话；它是一个组件，而不是目标。
- **自动化测试**（VRExplorer、XRintTest，以及供编程智能体使用的 Meta XR Operator）。这些系统能非常有效地驱动 VR 应用，但它们的目标是覆盖所有交互，而不是完成某一个用户的请求；我们复用的是它们的机制，而不是它们的问题。
- **玩游戏。**替用户玩游戏，就抹去了用户在那里的理由；一项关于 VR 游戏中 AI 伙伴的研究发现，由智能体自主游玩降低了工作负荷，却损害了挑战感、自主感、沉浸感和乐趣（Taiyu Zhang 等，arXiv 2609.13727，2026）。
- **无显示屏眼镜**（只有摄像头和音频的 AI 眼镜）。它们没有可供操作的空间 GUI；其助手通过服务和 API 行动。带显示屏的眼镜，以及能显示窗口的 XR 眼镜，在范围之内。

## 2. 为什么 3D 界面难以操作

[第 3 篇]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }})详细收集了相关证据。简要版本如下：

> 操作 3D 界面有手机所没有的实测代价：深度方向的指向更慢、更不准确，空中文本输入的速度大约只有手机打字的一半，手臂疲劳，以及新手不知道该执行哪个操作。

每种代价都有其来源：

- **深度方向的指向。**在立体显示器上，虚拟手沿视线方向的运动比横向运动慢约 25%，吞吐量低约 20%，远超视觉尺寸变化所能解释的程度（Barrera Machuca 和 Stuerzlinger，CHI 2019）。在 Quest Pro 上使用注视加捏合时，选择同样随深度增加而变慢（Bashar 等，arXiv 2607.27369，将发表于 IEEE TVCG / ISMAR 2026）。
- **选择错误。**在一项车内现场研究中（Varjo XR-3，N = 24），视技术不同，停车时有 8.8% 到 23.5% 的选择失败，行驶中为 20.4% 到 36.0%（Sasalovici 等，CHI 2025）。在 Quest 3 上于 8 m 处进行射线选择，使用控制器时有 15.2% 的选择失败，徒手时为 32.9%，主要原因是确认动作本身带动了射线（Qiu 等，arXiv 2602.01061，据作者称已被 IEEE TVCG / IEEE VR 2026 接收）。在手机上，37,370 人的打字留下了 2.3% 的未纠正错误（Palin 等，MobileHCI 2019）。
- **文本输入。**在同一项研究中，手机打字的平均速度为每分钟 36.2 个单词（words per minute，wpm）。在 VR 中的虚拟键盘上，六种选择方法中最快的一种，即用控制器指向，达到 15.44 wpm（Speicher 等，CHI 2018），而在报告了速度的 137 种 XR 文本输入技术中，平均为 20.36 wpm（Bhatia 等，CHI 2025）：大约是手机速度的一半，甚至更低。
- **手臂疲劳。**空中输入需要让手臂对抗重力；消耗耐力（Consumed Endurance，Hincapié-Ramos 等，CHI 2014）使这种“大猩猩手臂”（gorilla arm）代价可以测量，并表明即使时间和错误没有差异，这种代价也会出现。徒手射线选择时，手的位置比使用控制器时高 14.3%、靠前 66.2%（Luong 等，IEEE TVCG 2023），Apple 的指南称直接手势 "best for infrequent use"（最适合不频繁的使用）。
- **不知道该做什么。**Khurana 等（IMWUT 2023）观察了 25 名使用四款消费级 AR 应用的新手，发现大多数错误发生在参与者无法确定正确的操作序列，或无法评估自己的操作产生了什么结果的时候。这些是知识上的失败，而不是运动控制上的失败，而一个了解界面的智能体针对的恰恰就是它们。

下图把主要数字并排列出。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/01-operating-cost.svg" localized="true" caption="头显上实测的操作代价与手机的对比，每根柱都标注了来源。(a) 文本输入：手机平均值（Palin 等 2019），对比最快的 VR 虚拟键盘方法（控制器指向，Speicher 等 2018）以及 137 种 XR 技术的平均值（Bhatia 等 2025）。(b) 选择错误率：停驶和行驶车辆中各技术的范围（Sasalovici 等 2025）以及 8 m 处的射线选择（Qiu 等 2026），对比手机打字中 2.3% 的未纠正错误。这些比较跨越不同的研究和任务，因此应把它们当作数量级来看，而不是精确的比值。" %}

另外两种代价来自空间本身。**内容可能在任何地方。**一个窗口可能在用户身后、被另一个窗口挡住，或被留在另一个房间，用户必须转身或重新居中才能找到它；平台把这件事留给了用户的头和手（第 3 篇第 3.4 节）。而且**视野随每一次头部运动而变化**，这对于看到用户所见内容的智能体，与对于用户本人同样重要。下一张图以及第 5 节的交互组件会把这一点具体化。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/01-where-is-the-ui.svg" localized="true" caption="一名被五个窗口环绕的用户的俯视示意图（概念性布局，并非取自任何研究或基准）。紫色扇形是某一时刻的视野（field of view）。可见性通过从头部发出射线（细线）来计算：两个窗口在视野内，第三个（照片）在扇形之内，但几乎完全被更近的邮件窗口挡住，一个在侧面、位于扇形之外，还有一个在用户身后。手机智能体在每张截图中都能看到整个屏幕；头显智能体只能看到扇形内的部分，而一旦用户转身，扇形内的内容就会改变。" %}

## 3. 这对日常 XR 重要吗？一个诚实的回答

用本站作者的话说，本专栏的动机是：操作 3D 界面的复杂性是 3D 移动终端尚未进入日常生活的原因之一。这是一个假设，而证据只部分支持它。我们陈述一个能够站得住的立场：

> 操作 3D 界面的困难是日常 XR 面临的多重障碍之一，与价格、舒适度、内容和晕动症并列，而且通常排在这些因素之后。智能体可以降低操作代价；它无法解决重量、价格或晕动问题。

“通常排在之后”这一说法背后的证据很清楚（第 3 篇第 5 节）。在 2024 年 2 月不打算购买 Vision Pro 的美国成年人中（Variety VIP+ 与 CivicScience，N = 1,069），65.5% 提到价格，15% 提到不舒适，13.5% 提到恶心，12.2% 提到缺乏内容。在对十款 VR 设备的 3,205 条亚马逊评论中，不适占编码主题的 39%，健康风险占 30%，内容缺失占 21%，易用性占 7%（Dehghani 等，2021）。停止使用头显的拥有者更多提到的是舒适度和健康，而不是操作。

“多重障碍之一”的证据同样真实，而且它指向的正是操作中智能体能够解决的那些部分：

- **可发现性**（discoverability）。在同一项 Vision Pro 调查中，22.3% 的人表示不了解这款设备能做什么。一些在日常使用中被拍摄的拥有者不知道旅行模式（Travel Mode）的存在（Tran 等，CHI 2025），测试 Vision Pro 的分析师也描述了使用眼睛、双手和手势时的学习曲线。
- **学习。**Khurana 等记录的新手错误源于不知道操作序列，即执行鸿沟（gulf of execution），而这正是 GUI 智能体在手机上接手的那一步。
- **接受度模型中的易用性。**在基于调查的模型中，易用性和认知可供性作为 AR 和 VR 接受度的显著前因变量出现，与有用性、舒适度和社会规范并列（第 3 篇第 5.3 节）。

也存在反面证据：早期使用者认为 Vision Pro 的界面很直观，而增长最快的设备类别 AI 眼镜几乎完全没有 GUI，这既可以解读为“更简单的交互胜出”，也可以解读为“更便宜、更轻的胜出”。我们找到的调查中，没有一项甚至把“太难用”列为可选答案。缺失的证据本身就是研究的一部分：如果 3D GUI 智能体行得通，就有可能通过消除操作代价来测量它究竟有多重要。

因此，我们并不声称智能体会把头显带进日常生活。我们的主张要窄得多：操作代价是一个真实的、经过测量的障碍，它是唯一一个单靠软件就能降低的障碍，而降低它既因其本身而值得研究，也因下一节所讲的用户而值得研究。

## 4. 最有力的论据：无障碍

> 无障碍（accessibility）是近期最有力的论据：XR 中的屏幕阅读器能够描述和枚举，但用户仍然无法成功操作菜单；借助 AI 场景描述，盲人与低视力参与者完成了 11% 的 VR 菜单试验。

各平台已经提供了读取 UI 树并替用户行动的辅助服务：Vision Pro 上的 VoiceOver、Pointer Control 和 Voice Control，Android XR 上的 TalkBack，以及 Meta Quest 实验性设置中的屏幕阅读器。它们适用于系统 UI 和带标签的 2D 面板。它们无法作用于没有标签的 3D 内容，而这正是沉浸式应用所绘制内容的大部分；它们不传达空间结构（什么在左边、在后面、在近处）；也无法把一次自由形式的 3D 操纵转化为一条命令（第 3 篇第 6 节）。Vision Pro 上的 Voice Control 可以触及任何带标签的元素，但用户必须说出每一步。

**VRSight**（Killough 等，UIST 2025）最清楚地测量了现有手段留下的缺口。它根据头显视频描述未经修改的 VR 应用，使用一个在 17,691 张 VR 图像上训练的检测器、深度估计、OCR 和 GPT-4o，每次查询约需 2.3 到 2.6 s。九名盲人和低视力参与者在 Rec Room 中使用了它。他们全都找到了菜单，但只有一人找到了任务要求的那个特定按钮：菜单试验的完成率为 11%。参与者希望有方向键导航、吸附以及逐行朗读，换句话说，他们想要的是一个离散的动作空间（action space）。对于低视力用户，SeeingVR 工具包（Zhao 等，CHI 2019）把完成菜单任务的参与者从 11 人中的 4 人提高到 11 人中的 11 人，但它需要内置于每个应用中的工具，或事后施加的工具。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/01-accessibility.svg" localized="true" caption="描述比操作容易。左：VRSight 的九名盲人和低视力参与者在 Rec Room 中。每位参与者都找到了菜单，但只有一人找到并按下了目标按钮（菜单试验完成率 11%，Killough 等，UIST 2025）。右：借助 SeeingVR 的低视力工具，全部 11 名参与者都完成了一项菜单任务，而没有这些工具时只有 4 人完成（Zhao 等，CHI 2019）。一个按请求操作菜单的智能体能够省去最后一步，也就是大多数参与者失败的那一步。" %}

**描述场景远比操作 3D UI 容易**，而失败的那一步恰恰是一个执行操作的智能体会接手的那一步。这个论据也具有即时性：盲人用户无法等到头显变得更便宜或更轻之后，菜单才变得可用。来自 2D 文献的两点警示同样适用。GUI 智能体本身往往就不具备无障碍性：一个在 78.3% 的任务上成功的计算机使用智能体（computer-use agent），在使用屏幕放大镜时降到了 28.3%（A11y-CUA，CHI 2026）。而默默行动的智能体会做出用户看不到的选择：在 Morae（Peng 等，UIST 2025）的形成性研究中，在一项有盲人与低视力用户参与的研究中，一个智能体对 576 个可完成的请求中的 484 个报告了“已完成”，但只有 189 个是正确的。就无障碍而言，3D GUI 智能体必须在决策点询问，并报告自己做了什么。

## 5. 从手机智能体到 3D GUI 智能体：哪些可以迁移，哪些会失效

[第 2 篇]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }})综述了 2D 领域，并以一份审慎的清单收尾，列出哪些内容可以迁移。我们的总结：

> 手机 GUI 智能体的大部分配方可以迁移（截图加结构、元素级动作、基于执行的评测）；会失效的是：智能体的视野随每一次头部运动而变化，目标可能很小、很远、被遮挡或位于用户身后，动作是 3D 的，而用户在界面之中等待。

**可以迁移的。**来自 2D 的三条经验足够有力，可以从一开始就采用：

- **截图加结构。**截图优先的模型覆盖所有应用，而无障碍树或 DOM 在存在时能提供帮助。XR 有同样的两个来源：渲染出的视图，以及场景图或平台的空间语义（Android XR 的子空间语义树、RealityKit 的 `AccessibilityComponent`）。
- **元素级动作。**动作空间的选择与模型同样重要：在固定使用 GPT-4 的情况下，AppAgent 的成功率从使用原始坐标动作时的 2.2% 升至使用基于编号元素的动作时的 48.9%（C. Zhang 等，CHI 2025）。XR 智能体同样应当通过一小组动词作用于*目标*（一个窗口、一个按钮、一个滑块），而把射线和捏合交给底层控制器。
- **基于执行的评测**（execution-based evaluation）。AndroidWorld（Rawles 等，ICLR 2025）和 OSWorld（Xie 等，NeurIPS 2024）在真实环境中运行智能体，并用程序检查最终状态。只有这种评测才能衡量用户的请求是否真的被执行了。

**会失效的。**2D 智能体的四个假设在头显中不成立：

1. **视野随每一次头部运动而变化。**手机截图显示整个界面，并且在点按某处之前保持不变。头显的一帧只显示视野内的那部分界面，片刻之后又是另一部分。一个 UI 状态会产生无穷多幅不同的图像。
2. **目标可能很小、很远、被遮挡或位于用户身后。**1.5 m 外面板上一个 2 cm 的按钮所张视角不到 1°；一个窗口可能挡住另一个；用户要求的窗口可能就在他们身后。智能体必须决定往哪里看，或者请用户转身，而且它需要记住各个东西在哪里。
3. **动作是 3D 的。**射线、捏合、抓取、双手缩放、6-DoF 位姿、注视、移动（locomotion）。在 ComboBench 的场景中，最好的语言模型只在 11.7% 的情况下为一个 VR 动作生成了准确的控制器操作序列（Shuqing Li 等，arXiv 2510.24706，2025）。
4. **用户在界面之中等待。**在桌面上，智能体可以在后台工作二十分钟。在头显中，用户在一旁看着，世界继续以每秒 90 帧渲染，而内容可能在智能体思考时移动。已发表的 XR 智能体原型每轮耗时约 4 s（DuoZone）到约 49 s（NavAI）；与 VR 中由 LLM 驱动的智能体交互时，超过约 4 s 的延迟就已经会损害体验（Maslych 等，CUI 2025）。

下面的交互示意让你亲身感受前两点。转动头部，看看一个通过用户双眼观察的智能体能知道什么、不能知道什么。

{% include widget.liquid name="3d-gui-agent-where-is-the-ui" height="600" caption="UI 在哪里？一个俯视的房间，用户（紫色圆点）周围漂浮着五个窗口。横向拖动或滑动来转动头部；扇形是某一帧中的视野，下方的条带是智能体在这一帧中看到的内容。窗口被标记为在视野内、在视野边缘、被遮挡（被更近的窗口挡住）、在视野外或在你身后。打开“记忆”可保留之前见过的窗口的淡色标记，按下“重新摆放”可在你没有看的时候移动窗口，选择一个请求，看看智能体能否根据当前视野行动，还是必须先转身、搜索或回忆。布局仅作示意，不包含任何基准参数。" %}

## 6. 替我做、指给我看，还是问我：自主程度谱系

在手机上，人们通常期望 GUI 智能体完成整个任务。在头显中，用户身在现场、以身体参与，而且常常是为了体验本身而来。因此我们采取如下立场：

> 3D GUI 智能体不应总是接管：有些操作最好替用户完成，有些最好指给用户看，有时智能体应当询问。

我们在一条从讲解到执行的谱系（autonomy spectrum）上区分六个点，并为每个点给出一个示例操作：

| 模式 | 智能体做什么 | 示例操作 |
| --- | --- | --- |
| 讲解（Explain） | 用语言说明怎么做 | “怎么开启旅行模式？” |
| 指出位置（Show where） | 在空间中高亮目标，或画出指向它的射线提示 | 在快速设置中找到重新居中控件 |
| 逐步指导（Coach） | 一步步带领，等待用户操作，确认每一步 | 学会用来移动窗口的捏合拖动手势 |
| 重排布局（Reshape the layout） | 移动、放大内容或把内容拉近，使用户便于操作 | 把音乐播放器从用户身后拿到前面；为低视力用户放大远处的面板 |
| 提议后执行（Propose and act） | 预览一项改动，在用户确认后应用 | 为写报告排列三个窗口 |
| 代为执行（可接管）（Act with takeover） | 在用户观看且可随时打断的情况下执行各个步骤 | 输入搜索词；更改一项藏得很深的设置 |

在每一个点上，智能体都还可以**询问**（ask）：“那个”指的是哪个窗口，是否覆盖，遇到意外的对话框后是否继续。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/01-autonomy-spectrum.svg" localized="true" caption="3D GUI 智能体的自主程度谱系，从讲解（上）到代为执行（可接管）（下）；示例操作（中间一列）放在我们预期适合它们的模式旁边，右侧一列是为各个区域提供依据的已发表研究。从上到下读这条线，可以看作工作从用户转移到智能体：在顶端，用户执行操作，智能体提供知识；在底端，智能体执行操作，用户进行监督。“询问”（红色虚线）不是线上的一个点，而是在每个点上都可用的通道。示例的位置是我们的判断，而不是所引文献的发现。" %}

已发表的证据从三个方向表明这一选择很重要：

- **DuoZone**（Qian 等，IEEE TVCG 2026）是 Vision Pro 上一个由 LLM 引导的窗口管理器，它提出布局，并只在用户确认后才应用。在 16 名专业人士参与的评估中，它使布局匹配快了 34.5%，构建一个工作区用时 168.3 s 而不是 218.1 s；但参与者对应用推荐的接受率为 90.3%，对尺寸决定为 82.8%，对排序决定为 76.5%：用户改动了多达约四分之一的决定。提议后执行适合用户有自己偏好的任务。
- **VRCopilot**（L. Zhang 等，UIST 2024）比较了手动、全自动和脚手架式（scaffolded）的 VR 布局共创；全自动创作给用户带来的能动感（sense of agency）低于脚手架式，后者由 AI 提出线框，再由用户编辑。
- **VR 游戏中 AI 伙伴的研究**（Taiyu Zhang 等，arXiv 2609.13727，预印本，2026；在 Vision Pro 上，N = 24）比较了无帮助、基于命令的帮助、讨论以及智能体自主游玩。自主游玩带来的工作负荷最低，却降低了挑战感、自主感、沉浸感和乐趣。

2D 文献补充指出，用户更愿意在中间步骤进行确认，而不是只在最后确认（“When Should Users Check?”，CHI 2026，48 名参与者中的 81%），而第 4 篇中的 XR 引导系统（Sensible Agent、Guided Reality、AgentHands）为谱系中“指给我看与逐步指导”这一端提供了一套词汇。缺少的是关于 XR 中 GUI 操作的证据：用户希望哪些操作被代劳、哪些被指给他们看，以及他们希望在什么时候被询问。我们在这里不提出规则；如何选择模式是第 8 节的开放问题之一。

## 7. 已有的工作

[第 4 篇]({{ '/blog/2026/3d-gui-agent-04-agents-in-xr-and-the-gap/' | relative_url }})深入梳理了最接近的工作，给出了一套评分标准和一张涵盖 23 项工作与产品的热力图。它描绘的图景是：

> 这样一个智能体的组成部分已经存在：VR 帧中 GUI 元素的检测、基于语音和指向的 LLM 窗口管理、基于 VR 截图的 LLM 导航，以及让智能体为测试而驱动 VR 应用的工具。

- **VR 帧中 GUI 元素的检测。**Orienter（Shuqing Li 等，FSE 2026）用一个大型多模态模型加一个开放词汇检测器，在 100 款 Steam VR 应用的截图中寻找可交互元素，在 IoU 0.75 下的可交互性 F1 达到 44.10%，而 2D 屏幕解析器 OmniParser 为 2.21%。VRSight 的 DISCOVR 数据集（UIST 2025）在 17,691 帧社交 VR 画面中标注了菜单、按钮和 UI 文字。
- **基于语音和指向的 LLM 窗口管理。**Revisiting Put-That-There（Bovo 等，ISMAR 2025 Adjunct）把语音、指向和头部朝向转换为 JSON 动作，在房间的各个表面上放置或移除窗口，目前尚无用户研究；DuoZone（第 6 节）在带确认的方式下进行窗口布局，并做了 16 人的评估。
- **基于 VR 截图的 LLM 导航。**NavAI（Qin 和 DiGiovanni，ASE 2025 Workshops）在 Unity 场景中打通了从语言目标和视野截图到实际执行移动的闭环，以每轮约 49 s 完成了 18 个目标任务中的 16 个；它移动视点，不触及菜单。
- **让智能体为测试而驱动 VR 应用的工具。**Meta XR Operator（2026 年 8 月，实验性）让编程智能体截取正在运行的 VR 应用的画面，按下按钮并逐层操作菜单；GenXR-Bench（Huang 等，arXiv 2610.29014，2026）使用 VLM 执行者来操作编程智能体生成的 XR 应用；VRExplorer 和 XRintTest 为测试覆盖率而驱动 Unity VR 场景。

与这些工作相近的还有：SIAgent（Wang、Gu 和 Lu，IEEE TVCG 2026）让智能体根据推断出的眼手意图执行 VR 操作，不使用语言；GazePointAR 则根据注视和指向解析“这个”和“那个”，以回答问题。

> 厂商正朝这个方向前进：Google 表示 Galaxy XR 上的 Gemini 可以跨应用执行操作并整理窗口；Apple 在 visionOS 27 上的 Siri 通过应用意图（app intents）执行操作；Meta 推出了一个实验性工具，让编程智能体驱动 VR 应用。它们的机制和成功率大多未公开，或仅限于开发者测试。

Google 为 Galaxy XR 发布的介绍文章（2025 年 10 月）称，Gemini 可以“take action on your behalf across your apps”（在你的各个应用中替你执行操作），并且说一句“Hey Google, organize these windows”（嘿 Google，整理这些窗口）就能排列已打开的窗口；没有公布任何机制或评测。Apple 在 visionOS 27 上的 Siri 通过应用用 App Intents 声明的动作来执行操作，Apple 也说明 Siri 无法对仅存在于像素中的内容采取行动。Meta 的 XR Operator 是一个开发者工具，用 Meta 的话说，它“operates too slowly for real-time interaction”（运行速度太慢，无法用于实时交互）。这些都是强烈的信号，表明这个方向正当其时，同时也显示出两条路线：由应用主动接入的语义动作，以及对 GUI 本身的操作。

第 4 篇的能力热力图（其第 2 节）按四个属性对 23 项此类工作和产品进行评分：感知 3D UI、理解自然语言意图、操作 UI，以及经过评估。每个属性都有某项工作完全覆盖；但没有一行覆盖全部四个。综合起来：

> 截至 2026 年 11 月，我们没有找到任何已发表的工作评估过一个通过操作 XR 应用的 3D GUI 来执行用户自然语言请求的智能体，也没有找到这类从指令到动作的任务的基准或数据集。

这一陈述基于第 2 至 4 篇背后的检索（arXiv、OpenAlex、ACM DL、IEEE Xplore、会议论文集和产品页面，截至 2026 年 11 月 24 日）。检索中没有找到并不能证明不存在，而且这个空白很窄：Orienter 能感知，Put-That-There 和 DuoZone 能根据语言作用于窗口层，NavAI 打通了一个闭环，Meta XR Operator 给了智能体一双手，Galaxy XR 上的 Gemini 声称能跨应用执行操作。因此，这个想法**正当其时，并已被部分预见**。它增加的是这种组合：一个由用户请求驱动的智能体，操作现有应用的通用 3D GUI，以任务成功率来评估，并把第 5 节的空间问题作为研究的核心，而不是当作细节。

## 8. 开放问题

我们把这些保持在问题的层面。每一个都大到足以容纳多项研究。

1. **应当如何衡量 3D GUI 智能体？**2D 智能体是在可重置的环境中、通过程序化检查以任务成功率来评估的。3D 版本需要真实用户会提出的任务、能容忍空间差异的成功检查（例如一个窗口被放在另一个窗口“旁边”）、视点变化，以及针对同样任务的人类基线（时间、错误、用力程度），而在商用头显上，针对完整任务的人类基线同样不存在。
2. **智能体应当如何看到一个随每一次头部运动而变化的界面？**通过用户的眼睛、通过它自己渲染的视图、通过场景图或无障碍结构，还是将它们组合起来；当窗口离开视野，或在无人注视时移动，它又该如何记住窗口在哪里？
3. **它应当使用哪些动作？**设备级输入（射线、捏合、位姿）对每个应用都有效，但缓慢而脆弱；语义动作（应用意图、函数调用）可靠，但只覆盖主动接入的应用。合适的层级是什么，以及如何在两者之间回退，在 XR 中仍是开放问题。
4. **它应当何时代做、何时引导、何时询问？**第 6 节表明这一选择很重要，而且完全自主并不总是用户想要的。哪些信号（用户的目标、专业程度、动作的可逆性、用户是否是来享受体验的）应当决定这一选择，以及用户如何保持控制，对于 XR 中的 GUI 操作而言尚不清楚。
5. **它能让 XR 变得无障碍吗？**3D GUI 智能体能否把 VRSight 的 11% 变成盲人用户的常规成功，帮助行动不便的用户够到身后的内容，并帮助老年人度过最初的几次使用，必须与这些用户一起来证明，而不能想当然。

在这五个问题之下，是第 4 篇提出的平台问题：第三方应用在设备上是封闭的，注视数据保持私密，而最开放的环境（WebXR、模拟器、仿真器）并不是人们每天使用的环境。安全和隐私贯穿所有这些问题：一个在用户家中看到用户所见内容的智能体，绝不能成为欺骗性 UI、来自房间的提示注入（prompt injection）或生物特征痕迹泄露的通道。

## 9. 本专栏接下来做什么

> 我们正在 Meta Quest 上构建一个开放基准和第一个原型，并将在有结果时报告结果。

本专栏的其余部分是这项工作的证据基础：

- [第 2 篇：二维屏幕上的 GUI 智能体]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }})，综述截至 2026 年 11 月的手机、桌面和网页智能体，最后讨论哪些可以迁移到 3D、哪些会失效。
- [第 3 篇：为什么 3D 界面难以操作]({{ '/blog/2026/3d-gui-agent-03-why-3d-interfaces-are-hard/' | relative_url }})，关于输入、空间 UI 结构、实测困难、普及和无障碍的证据，附一份包含 30 项头显操作的目录。
- [第 4 篇：XR 中的 AI 智能体、平台与空白]({{ '/blog/2026/3d-gui-agent-04-agents-in-xr-and-the-gap/' | relative_url }})，深入介绍最接近的工作、各平台允许智能体观察和控制什么，以及数据集。
- [研究计划]({{ '/blog/2026/3d-gui-agent-05-research-plan/' | relative_url }})，目前设有密码保护。

{% include blog_figure.liquid path="assets/img/blog/3d-gui-agent/01-column-map.svg" localized="true" caption="本专栏五篇文章如何相互衔接。这篇愿景文章（中央）提出想法；三篇综述为它提供证据：智能体在 2D 屏幕上能做什么（第 2 篇），为什么操作 3D 界面代价高昂（第 3 篇），以及 XR 中已有什么、空白在哪里（第 4 篇）。研究计划（第 5 篇，已加锁）建立在前四篇的基础之上。" %}

## 代表性论文

状态截至 2026 年 11 月。“arXiv”表示仅为预印本。

| 论文 | 作者 | 出处 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- | --- |
| 3D User Interfaces: Theory and Practice (2nd ed.) | J. J. LaViola Jr., E. Kruijff, R. P. McMahan, D. A. Bowman, I. Poupyrev | 书籍，Addison-Wesley | 2017 | [出版社](https://www.informit.com/store/3d-user-interfaces-theory-and-practice-9780134034478) | 3D 交互任务的标准分类法（选择、操纵、移动、系统控制） |
| AppAgent: Multimodal Agents as Smartphone Users | C. Zhang et al. | CHI | 2025 | [arXiv](https://arxiv.org/abs/2312.13771) | 手机智能体的元素级动作与探索文档 |
| AndroidWorld: A Dynamic Benchmarking Environment for Autonomous Agents | C. Rawles et al. | ICLR | 2025 | [arXiv](https://arxiv.org/abs/2405.14573) | 带程序化成功检查的参数化任务 |
| OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments | T. Xie et al. | NeurIPS (D&B) | 2024 | [arXiv](https://arxiv.org/abs/2404.07972) | 在真实桌面上基于执行的评测；记录了进展的那条曲线 |
| Look Before You Leap: Context-Sensitive GUI Grounding for Boosting Automated Extended Reality (XR) Testing (Orienter) | S. Li et al. | FSE (PACMSE) | 2026 | [DOI](https://doi.org/10.1145/3808134) | 在渲染出的 VR 帧中对可交互 GUI 元素进行定位 |
| DuoZone: A User-Centric, LLM-Guided Mixed-Initiative XR Window Management System | J. Qian et al. | IEEE TVCG | 2026 | [arXiv](https://arxiv.org/abs/2511.15676) | 语言驱动、带确认的窗口布局，经 16 名用户评估 |
| Revisiting put-that-there, context aware window interactions via LLMs | R. Bovo et al. | ISMAR Adjunct | 2025 | [arXiv](https://arxiv.org/abs/2511.02378) | 根据语音、指向和头部朝向对 XR 窗口执行 LLM 动作 |
| NavAI: A Generalizable LLM Framework for Navigation Tasks in Virtual Reality Environments | X. Qin, M. DiGiovanni | ASE Workshops | 2025 | [arXiv](https://arxiv.org/abs/2601.03251) | 从语言和 VR 截图到移动的闭环 |
| SIAgent: Spatial Interaction Agent via LLM-powered Eye-Hand Motion Intent Understanding in VR | Z. Wang, C. Gu, F. Lu | IEEE TVCG | 2026 | [arXiv](https://arxiv.org/abs/2603.00522) | 智能体根据推断出的意图执行 VR 操作 |
| VRSight: An AI-Driven Scene Description System to Improve Virtual Reality Accessibility for Blind People | D. Killough et al. | UIST | 2025 | [DOI](https://doi.org/10.1145/3746059.3747641) | 借助场景描述的菜单完成率为 11%：描述不等于操作 |
| GazePointAR: A Context-Aware Multimodal Voice Assistant for Pronoun Disambiguation in Wearable Augmented Reality | J. Lee et al. | CHI | 2024 | [arXiv](https://arxiv.org/abs/2404.08213) | 根据注视和指向解析指示性（deictic）请求 |
| Guided Reality: Generating Visually-Enriched AR Task Guidance with LLMs and Vision Models | A. Y. Zhao et al. | UIST | 2025 | [arXiv](https://arxiv.org/abs/2508.03547) | 一套用于空间引导的视觉词汇 |
| VRCopilot: Authoring 3D Layouts with Generative AI Models in VR | L. Zhang et al. | UIST | 2024 | [DOI](https://doi.org/10.1145/3654777.3676451) | 完全自动化会降低能动感 |
| "What Can I Do for You": How Should AI Companions Provide Assistance to Players in Virtual Reality Games | T. Zhang et al. | arXiv | 2026 | [arXiv](https://arxiv.org/abs/2609.13727) | 智能体自主游玩降低了工作负荷，但也降低了乐趣 |
| "Do I Just Tap My Headset?": How Novice Users Discover Gestural Interactions with Consumer Augmented Reality Applications | A. Khurana et al. | IMWUT | 2023 | [DOI](https://doi.org/10.1145/3631451) | 新手的失败在于不知道该做什么，而不在于动作本身 |
| Selection-based Text Entry in Virtual Reality | M. Speicher et al. | CHI | 2018 | [DOI](https://doi.org/10.1145/3173574.3174221) | VR 键盘速度为 5.3 到 15.4 wpm |
| Bumpy Ride? Understanding the Effects of External Forces on Spatial Interactions in Moving Vehicles | M. Sasalovici et al. | CHI | 2025 | [DOI](https://doi.org/10.1145/3706598.3714077) | 当前头显在静止和行驶中的选择错误率 |

产品来源：[Introducing Galaxy XR](https://blog.google/products/android/samsung-galaxy-xr)（Google，2025 年 10 月）；[Introducing Meta XR Operator](https://developers.meta.com/horizon/blog/meta-xr-operator-close-the-build-test-verify-loop-for-vr/)（Meta，2026 年 8 月 18 日）；[About visionOS 27 updates](https://support.apple.com/en-us/149067)（Apple）。

## 学习资源

- 本专栏在仓库中的研究资料汇编 `docs/research/3d-gui-agent/`：2D 中的 GUI 智能体、3D UI 与 XR 交互、XR 与 3D 中的智能体，以及平台与工具，每份都附有经过核查的引用。阅读清单是 `docs/reading-lists/3d-gui-agent.md`。
- 上面提到的 3D UI 教材（LaViola 等，2017），用于学习交互词汇；以及 Apple 的[空间设计人机界面指南（Human Interface Guidelines）](https://developer.apple.com/design/human-interface-guidelines/spatial-layout)，看一个平台如何把这些词汇变成规则。
- 动手做智能体：[AndroidWorld](https://github.com/google-research/android_world) 和 [OSWorld](https://github.com/xlang-ai/OSWorld) 提供环境和检查器；Meta 的 [IWER](https://github.com/meta-quest/immersive-web-emulation-runtime) 在浏览器中提供一个可用脚本控制的 WebXR 头显。
- W3C 的 [XR 无障碍用户需求（XR Accessibility User Requirements）](https://www.w3.org/TR/xaur/)，描述了一个无障碍的 XR 界面必须允许用户做什么；读起来就像 3D GUI 智能体的前提条件。

## 练习

1. **为一项藏得很深的设置计时。**在你能使用的头显上，更改一项需要多个步骤的设置（例如透视（passthrough）或边界的行为，或键盘语言）。为它计时，数一数步骤，并记下每一个你不知道下一步该做什么的时刻。然后，如果手机上有对应的设置，就在手机上做同样的事。

   <details markdown="1"><summary>提示</summary>

   计时时区分三类代价：知道设置在哪里（知识），够到并选择每个控件（运动），以及检查设置是否生效（评估）。Khurana 等发现新手的大多数错误出在第一类和第三类；智能体在那里帮助最大。
   </details>

2. **委托还是不委托。**针对练习 1 的任务，把每一步标记为“替我做”“指给我看在哪里”或“我想自己做”。你委托了哪些步骤，为什么？

   <details markdown="1"><summary>提示</summary>

   纯导航的步骤（打开菜单、滚动）是委托的好候选；最终的决定（选哪个值）通常不是，因为它承载着你的偏好。这就是 DuoZone 的提议后执行模式：智能体做准备，你来确认。
   </details>

3. **绝不替我做。**描述头显上一项智能体绝不应替你做的操作，以及一项只有在询问后才应做的操作。是操作的什么属性决定了这一点？

   <details markdown="1"><summary>提示</summary>

   考虑可逆性（删除、发送、付款）、安全性（更改边界或透视会遮住真实房间）、机密（密码），以及你本来就是为之而来的体验（玩游戏）。第 3 篇的 30 项操作目录把其中几项标记为“都不行”。
   </details>

4. **转身与记忆。**在第 5 节的交互组件中，在记忆关闭的情况下选择请求“把音乐播放器拿到这里”，然后转动直到智能体能够行动。接着打开记忆，环顾一周，转回来，再按下“重新摆放”。智能体现在相信什么？它在行动之前应当做什么？

   <details markdown="1"><summary>提示</summary>

   打开记忆后，智能体会记住它上次看到每个窗口的位置，这能省去一次搜索，直到有东西移动为止。按下“重新摆放”之后，它的记忆就过时了：一个谨慎的智能体会把记住的位置当作线索，在行动之前加以验证，就像 2D 智能体在每个动作之后重新读取屏幕一样。
   </details>

5. **哪些可以迁移。**从第 2 篇中选一种 2D GUI 智能体技术（例如 Set-of-Mark 标签、探索文档或反思），用一段话描述它在头显中会是什么样子，以及它必须应对第 5 节四个失效假设中的哪些。

   <details markdown="1"><summary>提示</summary>

   以 Set-of-Mark 标签为例，它们会变成附着在空间物体上的标记；头部移动时它们必须保持附着（假设 1），它们无法标注用户身后的东西（假设 2），而一个很小的远处按钮即使带有标签，用射线仍然很难命中（假设 3）。
   </details>

**下一篇：**[第 2 篇：二维屏幕上的 GUI 智能体]({{ '/blog/2026/3d-gui-agent-02-gui-agents-on-2d-screens/' | relative_url }})。
