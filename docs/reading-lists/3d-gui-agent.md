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
