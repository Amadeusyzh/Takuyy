
## 03 特征与匹配（对应第 3 篇）

建议顺序：Harris → Lowe（SIFT）→ Fischler & Bolles（RANSAC）→ Lucas-Kanade → ORB → SuperPoint/SuperGlue → LightGlue → LoFTR/RoMa → Jin 等的评测论文。最后一组为 2024–2026 年的工作，状态截至 2026 年 11 月。

### 经典：检测、描述与鲁棒估计

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Random sample consensus: a paradigm for model fitting with applications to image analysis and automated cartography (Fischler, Bolles) | Communications of the ACM | 1981 | https://doi.org/10.1145/358669.358692 | RANSAC：最小样本拟合 + 一致集计数 |
| An iterative image registration technique with an application to stereo vision (Lucas, Kanade) | IJCAI | 1981 | — | Lucas-Kanade：窗口内的 Gauss-Newton，光流与跟踪的基础 |
| Determining optical flow (Horn, Schunck) | Artificial Intelligence | 1981 | https://doi.org/10.1016/0004-3702(81)90024-2 | 全局变分光流，加入平滑项 |
| A combined corner and edge detector (Harris, Stephens) | Alvey Vision Conference | 1988 | https://doi.org/10.5244/C.2.23 | 结构张量与 Harris 响应 |
| Good features to track (Shi, Tomasi) | CVPR | 1994 | https://doi.org/10.1109/CVPR.1994.323794 | 最小特征值准则，KLT 跟踪器 |
| Feature detection with automatic scale selection (Lindeberg) | IJCV | 1998 | https://doi.org/10.1023/A:1008045108935 | 尺度归一化导数与特征尺度 |
| MLESAC: a new robust estimator with application to estimating image geometry (Torr, Zisserman) | CVIU | 2000 | https://doi.org/10.1006/cviu.1999.0832 | MSAC 截断二次评分与 MLESAC 似然评分 |
| Locally optimized RANSAC (Chum, Matas, Kittler) | DAGM | 2003 | https://doi.org/10.1007/978-3-540-45243-0_31 | LO-RANSAC：对每个新的最佳模型做局部优化 |
| Distinctive image features from scale-invariant keypoints (Lowe) | IJCV | 2004 | https://doi.org/10.1023/B:VISI.0000029664.99615.94 | SIFT：DoG、方向、128 维描述子、比值检验 |
| Matching with PROSAC – progressive sample consensus (Chum, Matas) | CVPR | 2005 | https://doi.org/10.1109/CVPR.2005.221 | 按匹配质量排序的引导采样 |
| Machine learning for high-speed corner detection (Rosten, Drummond) | ECCV | 2006 | https://doi.org/10.1007/11744023_34 | FAST 分段测试与决策树 |
| BRIEF: binary robust independent elementary features (Calonder et al.) | ECCV | 2010 | https://doi.org/10.1007/978-3-642-15561-1_56 | 二值描述子与汉明距离 |
| ORB: an efficient alternative to SIFT or SURF (Rublee et al.) | ICCV | 2011 | https://doi.org/10.1109/ICCV.2011.6126544 | 灰度质心方向 + rBRIEF，ORB-SLAM 前端 |
| USAC: a universal framework for random sample consensus (Raguram et al.) | TPAMI | 2013 | https://doi.org/10.1109/TPAMI.2012.257 | 模块化 RANSAC：引导采样、SPRT、退化检查、LO |
| MAGSAC++, a fast, reliable and accurate robust estimator (Barath et al.) | CVPR | 2020 | https://arxiv.org/abs/1912.05909 | 对噪声尺度边缘化，免调阈值；OpenCV `USAC_MAGSAC` |

### 学习式特征、匹配器与光流

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| SuperPoint: self-supervised interest point detection and description (DeTone et al.) | CVPR Workshops | 2018 | https://arxiv.org/abs/1712.07629 | 单应适应自监督训练关键点与描述子 |
| SuperGlue: learning feature matching with graph neural networks (Sarlin et al.) | CVPR | 2020 | https://arxiv.org/abs/1911.11763 | 自/交叉注意力 + 带垃圾箱的 Sinkhorn 最优传输 |
| DISK: learning local features with policy gradient (Tyszkiewicz et al.) | NeurIPS | 2020 | https://arxiv.org/abs/2006.13566 | 用策略梯度端到端训练特征 |
| RAFT: recurrent all-pairs field transforms for optical flow (Teed, Deng) | ECCV | 2020 | https://arxiv.org/abs/2003.12039 | 全对相关体 + GRU 迭代更新 |
| LoFTR: detector-free local feature matching with transformers (Sun et al.) | CVPR | 2021 | https://arxiv.org/abs/2104.00680 | 无检测器、由粗到细的 Transformer 匹配 |
| LightGlue: local feature matching at light speed (Lindenberger, Sarlin, Pollefeys) | ICCV | 2023 | https://arxiv.org/abs/2306.13643 | 自适应深度与剪枝；支持 SuperPoint/DISK/ALIKED/SIFT |
| RoMa: robust dense feature matching (Edstedt et al.) | CVPR | 2024 | https://arxiv.org/abs/2305.15404 | DINOv2 特征 + 精细化的稠密匹配 |
| XFeat: accelerated features for lightweight image matching (Potje et al.) | CVPR | 2024 | https://arxiv.org/abs/2404.19174 | CPU 实时的轻量学习式特征 |
| SEA-RAFT: simple, efficient, accurate RAFT for optical flow (Wang, Lipson, Deng) | ECCV | 2024 | https://arxiv.org/abs/2405.14793 | 更简单更快的 RAFT |
| MatchAnything: universal cross-modality image matching with large-scale pre-training (He et al.) | arXiv 预印本（2025 年 1 月） | 2025 | https://arxiv.org/abs/2501.07556 | 合成跨模态数据预训练无检测器匹配器 |
| RoMa v2: harder better faster denser feature matching (Edstedt et al.) | ECCV（据作者所在大学的论文记录） | 2026 | https://arxiv.org/abs/2511.15706 | 更快、更省内存的稠密匹配；arXiv 2025 年 11 月 |

### 评测

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| HPatches: a benchmark and evaluation of handcrafted and learned local descriptors (Balntas et al.) | CVPR | 2017 | https://arxiv.org/abs/1704.05939 | 带真值单应的平面场景，MMA 等指标 |
| Image matching across wide baselines: from paper to practice (Jin et al.) | IJCV | 2021 | https://arxiv.org/abs/2003.01587 | 以位姿精度为指标的基准；调好基线后 SIFT 仍有竞争力 |

### 课程、书与代码

- Szeliski《Computer Vision: Algorithms and Applications》第 2 版第 7–9 章（特征、对齐与 RANSAC、运动估计）：https://szeliski.org/Book/
- Hartley & Zisserman《Multiple View Geometry》第 4.7 节：RANSAC 迭代次数与 $\chi^2$ 阈值。
- OpenCV USAC 教程：https://docs.opencv.org/5.0/tutorials/calib3d/usac.html
- 代码：https://github.com/cvg/LightGlue 、https://github.com/magicleap/SuperGluePretrainedNetwork 、https://github.com/Parskatt/RoMa 、https://github.com/danini/magsac 、https://github.com/princeton-vl/RAFT
- 基准：https://github.com/hpatches 、https://vision.uvic.ca/image-matching-challenge/
