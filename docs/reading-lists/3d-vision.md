# 阅读清单：三维视觉基础（3d-vision）

本清单配合博客系列「三维视觉基础」（`_posts/*/2026-10-27-3d-vision-*.md`）使用。
每篇文章对应一节（`## NN 主题`）；每篇论文给出会议/期刊、年份、链接和一句话说明。论文标题保留英文。
所有 arXiv 编号与 DOI 均已核对；没有可靠链接的经典文献只列出处，不给链接。
近期工作注明状态（已发表 / 已接收 / 预印本），日期以 2026 年 11 月为准。

---

## 01 成像与相机模型

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Decentering distortion of lenses (Brown) | Photogrammetric Engineering | 1966 | — | 径向 + 切向畸变模型（Brown-Conrady），OpenCV 畸变模型的来源 |
| Using vanishing points for camera calibration (Caprile, Torre) | IJCV | 1990 | https://doi.org/10.1007/BF00127813 | 由消失点求内参；主点是消失点三角形的垂心 |
| A flexible new technique for camera calibration (Zhang) | TPAMI | 2000 | https://doi.org/10.1109/34.888718 | 棋盘格标定，OpenCV 的标定方法（第 2 篇详讲） |
| Straight lines have to be straight (Devernay, Faugeras) | Machine Vision and Applications | 2001 | https://doi.org/10.1007/PL00013269 | 利用"直线成像仍为直线"估计畸变，无需标定板 |
| Geometric models of rolling-shutter cameras (Meingast, Geyer, Sastry) | arXiv 预印本 | 2005 | https://arxiv.org/abs/cs/0503076 | 运动中卷帘快门相机的投影方程 |
| A generic camera model and calibration method for conventional, wide-angle, and fish-eye lenses (Kannala, Brandt) | TPAMI | 2006 | https://doi.org/10.1109/TPAMI.2006.153 | 以入射角为变量的多项式鱼眼模型，即 OpenCV fisheye / COLMAP OPENCV_FISHEYE |
| Single view point omnidirectional camera calibration from planar grids (Mei, Rives) | ICRA | 2007 | https://doi.org/10.1109/ROBOT.2007.364084 | 统一（单位球）相机模型，适用于鱼眼与折反射相机 |
| Rolling shutter bundle adjustment (Hedborg, Forssén, Felsberg, Ringaby) | CVPR | 2012 | https://doi.org/10.1109/CVPR.2012.6247831 | 考虑逐行位姿的光束法平差 |
| Structure-from-Motion revisited (Schönberger, Frahm) | CVPR | 2016 | https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html | COLMAP；多数数据集沿用其相机模型与坐标约定 |
| The double sphere camera model (Usenko, Demmel, Cremers) | 3DV | 2018 | https://arxiv.org/abs/1807.08957 | 有闭式逆的大视场模型，并系统比较了各种广角模型 |
| Local light field fusion (Mildenhall et al.) | SIGGRAPH (ACM TOG) | 2019 | https://arxiv.org/abs/1905.00889 | `poses_bounds.npy`（列顺序：下、右、后）格式的来源 |
| Why having 10,000 parameters in your camera model is better than twelve (Schöps et al.) | CVPR | 2020 | https://arxiv.org/abs/1912.02908 | 通用稠密相机模型比常用参数模型标定更准确 |

**书籍与文档**

- Hartley & Zisserman，*Multiple View Geometry in Computer Vision*（第 2 版，2004）：第 2、3、6、8 章（射影几何、相机模型、单视图几何）。
- Szeliski，*Computer Vision: Algorithms and Applications*（第 2 版，2022），第 2 章：https://szeliski.org/Book/
- OpenCV calib3d：https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html ；fisheye：https://docs.opencv.org/4.x/db/d58/group__calib3d__fisheye.html
- COLMAP 输出格式：https://colmap.github.io/format.html
- 坐标约定：nerfstudio https://docs.nerf.studio/quickstart/data_conventions.html ；PyTorch3D https://pytorch3d.org/docs/cameras
## 02 相机标定

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| An algorithm for least-squares estimation of nonlinear parameters (Marquardt) | J. SIAM | 1963 | https://doi.org/10.1137/0111030 | Levenberg-Marquardt 阻尼，所有标定求解器的核心 |
| A versatile camera calibration technique for high-accuracy 3D machine vision metrology using off-the-shelf TV cameras and lenses (Tsai) | IEEE J. Robotics and Automation | 1987 | https://doi.org/10.1109/JRA.1987.1087109 | 经典两步标定，含径向畸变 |
| A new technique for fully autonomous and efficient 3D robotics hand/eye calibration (Tsai, Lenz) | IEEE Trans. Robotics and Automation | 1989 | https://doi.org/10.1109/70.34770 | 第一个实用的手眼标定 AX = XB 解法 |
| Robot sensor calibration: solving AX = XB on the Euclidean group (Park, Martin) | IEEE Trans. Robotics and Automation | 1994 | https://doi.org/10.1109/70.326576 | 李群视角；旋转部分用一次 SVD 求最小二乘解（第 2 篇代码所用方法） |
| In defense of the eight-point algorithm (Hartley) | TPAMI | 1997 | https://doi.org/10.1109/34.601246 | 坐标归一化；DLT 估计单应时同样适用 |
| A four-step camera calibration procedure with implicit image correction (Heikkilä, Silvén) | CVPR | 1997 | https://doi.org/10.1109/CVPR.1997.609468 | 径向 + 切向畸变、去畸变逆模型、圆形标志的圆心偏差校正 |
| On plane-based camera calibration: a general algorithm, singularities, applications (Sturm, Maybank) | CVPR | 1999 | https://hal.archives-ouvertes.fr/inria-00525681 | 平面标定的通用算法与全部退化配置 |
| Hand-eye calibration using dual quaternions (Daniilidis) | IJRR | 1999 | https://doi.org/10.1177/02783649922066213 | 用对偶四元数同时求解旋转与平移 |
| A flexible new technique for camera calibration (Zhang) | TPAMI | 2000 | https://doi.org/10.1109/34.888718 | 单应 → 绝对二次曲线的像 → 闭式内参 → LM 精化；第 2 篇的主线 |
| A compact algorithm for rectification of stereo pairs (Fusiello, Trucco, Verri) | Machine Vision and Applications | 2000 | https://doi.org/10.1007/s001380050120 | 标定双目的极线校正：新 x 轴取基线方向 |
| AprilTag: a robust and flexible visual fiducial system (Olson) | ICRA | 2011 | https://doi.org/10.1109/ICRA.2011.5979561 | AprilTag 标记；Kalibr 的 AprilGrid 标定板由它组成 |
| Unified temporal and spatial calibration for multi-sensor systems (Furgale, Rehder, Siegwart) | IROS | 2013 | https://doi.org/10.1109/IROS.2013.6696514 | Kalibr：连续时间 B 样条，同时估计相机-IMU 外参与时间偏移 |
| AprilCal: assisted and repeatable camera calibration (Richardson, Strom, Olson) | IROS | 2013 | https://doi.org/10.1109/IROS.2013.6696595 | 以投影不确定度为指标，交互式建议下一个标定板位姿 |
| Automatic generation and detection of highly reliable fiducial markers under occlusion (Garrido-Jurado et al.) | Pattern Recognition | 2014 | https://doi.org/10.1016/j.patcog.2014.01.005 | ArUco 标记，ChArUco 标定板的基础 |
| Extending Kalibr: calibrating the extrinsics of multiple IMUs and of individual axes (Rehder et al.) | ICRA | 2016 | https://doi.org/10.1109/ICRA.2016.7487628 | 多 IMU 外参与 IMU 内参标定 |
| Why having 10,000 parameters in your camera model is better than twelve (Schöps et al.) | CVPR | 2020 | https://arxiv.org/abs/1912.02908 | 通用相机模型；参数化模型的系统偏差会传给下游 |
| GeoCalib: learning single-image calibration with geometric optimization (Veicht et al.) | ECCV | 2024 | https://arxiv.org/abs/2409.06704 | 已发表；无需标定板，从单张图像估计内参与重力方向 |

**书籍、文档与代码**

- Hartley & Zisserman，*Multiple View Geometry in Computer Vision*（第 2 版，2004）：第 4 章（DLT、归一化、金标准代价）、第 7-8 章（相机矩阵估计、绝对二次曲线的像）。
- OpenCV 教程：相机标定 https://docs.opencv.org/4.8.0/d4/d94/tutorial_camera_calibration.html ；ChArUco 检测 https://docs.opencv.org/4.x/df/d4a/tutorial_charuco_detection.html ；ArUco/ChArUco 标定 https://docs.opencv.org/4.x/da/d13/tutorial_aruco_calibration.html
- mrcal（投影不确定度、模型差分）：https://mrcal.secretsauce.net/uncertainty.html
- Kalibr：https://github.com/ethz-asl/kalibr ，相机-IMU 标定说明 https://github.com/ethz-asl/kalibr/wiki/camera-imu-calibration
- 通用模型标定器：https://github.com/puzzlepaint/camera_calibration ；单图标定 GeoCalib：https://github.com/cvg/GeoCalib

## 03 特征与匹配

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

## 09 三维重建：从经典流水线到前馈模型

建议顺序：Curless & Levoy（TSDF）→ Lorensen & Cline（Marching Cubes）→ Kazhdan 等（泊松、屏蔽泊松）→ KinectFusion → 体素哈希 → Schönberger 等（COLMAP MVS）→ NeuS / VolSDF → Neuralangelo → DUSt3R → MASt3R → VGGT → 最后一组 2025–2026 年的后继。近期工作的状态截至 2026 年 11 月。

### 经典：深度融合、等值面与泊松重建

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Marching cubes: a high resolution 3D surface construction algorithm (Lorensen, Cline) | SIGGRAPH | 1987 | https://doi.org/10.1145/37401.37422 | 从体素网格提取等值面；顶点线性插值给出二阶精度 |
| A volumetric method for building complex models from range images (Curless, Levoy) | SIGGRAPH | 1996 | https://doi.org/10.1145/237170.237269 | 累积加权有符号距离：TSDF 融合的起点 |
| Poisson surface reconstruction (Kazhdan, Bolitho, Hoppe) | SGP | 2006 | https://doi.org/10.2312/SGP/SGP06/061-070 | 由有向点求指示函数，得到水密曲面 |
| KinectFusion: real-time dense surface mapping and tracking (Newcombe et al.) | ISMAR | 2011 | https://doi.org/10.1109/ISMAR.2011.6092378 | GPU 实时 TSDF 融合 + 对模型做 ICP 跟踪 |
| Screened Poisson surface reconstruction (Kazhdan, Hoppe) | ACM TOG | 2013 | https://doi.org/10.1145/2487228.2487237 | 在样本处加插值约束，减少过度平滑与漂移 |
| Real-time 3D reconstruction at scale using voxel hashing (Nießner et al.) | ACM TOG (SIGGRAPH Asia) | 2013 | https://doi.org/10.1145/2508363.2508374 | 只在表面附近分配 TSDF 块的哈希表 |
| Pixelwise view selection for unstructured multi-view stereo (Schönberger et al.) | ECCV | 2016 | https://doi.org/10.1007/978-3-319-46487-9_31 | COLMAP 的 PatchMatch MVS 与基于一致性的深度图融合 |

### 神经隐式曲面与高斯曲面

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Implicit geometric regularization for learning shapes (Gropp et al.) | ICML | 2020 | https://arxiv.org/abs/2002.10099 | IGR：Eikonal 正则项 |
| NeuS: learning neural implicit surfaces by volume rendering for multi-view reconstruction (Wang et al.) | NeurIPS | 2021 | https://arxiv.org/abs/2106.10689 | 无偏且感知遮挡的 SDF 体渲染权重（第 09 篇推导并复现） |
| Volume rendering of neural implicit surfaces (Yariv et al.) | NeurIPS | 2021 | https://arxiv.org/abs/2106.12052 | VolSDF：拉普拉斯 CDF 密度与不透明度误差界 |
| Neuralangelo: high-fidelity neural surface reconstruction (Li et al.) | CVPR | 2023 | https://arxiv.org/abs/2306.03092 | 哈希网格 SDF、数值梯度、由粗到细 |
| 2D Gaussian splatting for geometrically accurate radiance fields (Huang et al.) | SIGGRAPH | 2024 | https://arxiv.org/abs/2403.17888 | 面元高斯；渲染深度做 TSDF 融合得到网格 |
| Gaussian opacity fields (Yu, Sattler, Geiger) | ACM TOG (SIGGRAPH Asia) | 2024 | https://arxiv.org/abs/2404.10772 | 由高斯直接定义水平集，适合无界场景 |

### 前馈式三维基础模型

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| DUSt3R: geometric 3D vision made easy (Wang et al.) | CVPR | 2024 | https://arxiv.org/abs/2312.14132 | 图像对 → 同一坐标系下的点图；Weiszfeld 求焦距，全局对齐 |
| Grounding image matching in 3D with MASt3R (Leroy, Cabon, Revaud) | ECCV | 2024 | https://arxiv.org/abs/2406.09756 | 在点图之上加稠密描述子头与快速互最近邻匹配 |
| MASt3R-SfM: a fully-integrated solution for unconstrained structure-from-motion (Duisterhof et al.) | 3DV | 2025 | https://arxiv.org/abs/2409.19152 | 基于 MASt3R 的 SfM，可处理纯旋转与极少图像 |
| VGGT: visual geometry grounded transformer (Wang et al.) | CVPR（最佳论文） | 2025 | https://arxiv.org/abs/2503.11651 | 逐帧/全局交替注意力，一次前向输出相机、深度、点图与轨迹 |
| Fast3R: towards 3D reconstruction of 1000+ images in one forward pass (Yang et al.) | CVPR | 2025 | https://arxiv.org/abs/2501.13928 | 多视图 DUSt3R，无需全局对齐 |
| Continuous 3D perception model with persistent state (Wang et al.) | CVPR | 2025 | https://arxiv.org/abs/2501.12387 | CUT3R：带持久状态的循环式在线重建 |
| MASt3R-SLAM: real-time dense SLAM with 3D reconstruction priors (Murai, Dexheimer, Davison) | CVPR | 2025 | https://arxiv.org/abs/2412.12392 | 约 15 FPS 的稠密单目 SLAM |
| MonST3R: a simple approach for estimating geometry in the presence of motion (Zhang et al.) | ICLR | 2025 | https://arxiv.org/abs/2410.03825 | 动态场景的逐时刻点图 |
| Streaming 4D visual geometry transformer (Zhuo et al.) | arXiv 预印本（2025 年 7 月） | 2025 | https://arxiv.org/abs/2507.11539 | StreamVGGT：因果注意力 + 键值缓存，由 VGGT 蒸馏 |
| π³: permutation-equivariant visual geometry learning (Wang et al.) | ICLR（据作者代码仓库） | 2026 | https://arxiv.org/abs/2507.13347 | 无参考视图，置换等变 |
| MapAnything: universal feed-forward metric 3D reconstruction (Keetha et al.) | 3DV | 2026 | https://arxiv.org/abs/2509.13414 | 可选输入（内参、位姿、深度），分解式度量输出 |
| Depth Anything 3: recovering the visual space from any views (Lin et al.) | ICLR | 2026 | https://arxiv.org/abs/2511.10647 | 朴素 Transformer + 深度-射线目标 |
| LongStream: long-sequence streaming autoregressive visual geometry (Cheng et al.) | CVPR | 2026 | https://arxiv.org/abs/2602.13172 | 关键帧相对位姿、解耦尺度，公里级流式重建 |

### 评测基准

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Large-scale data for multiple-view stereopsis (Aanæs et al.) | IJCV | 2016 | https://doi.org/10.1007/s11263-016-0902-9 | DTU：80 个场景，结构光真值，准确度/完整度（Chamfer） |
| Tanks and Temples: benchmarking large-scale scene reconstruction (Knapitsch et al.) | ACM TOG | 2017 | https://doi.org/10.1145/3072959.3073599 | 激光扫描真值，按场景阈值的精确率/召回率/F 值 |
| A multi-view stereo benchmark with high-resolution images and multi-camera videos (Schöps et al.) | CVPR | 2017 | https://openaccess.thecvf.com/content_cvpr_2017/html/Schops_A_Multi-View_Stereo_CVPR_2017_paper.html | ETH3D：高分辨率图像，多容差 F1 |

### 课程、书与代码

- Szeliski《Computer Vision: Algorithms and Applications》第 2 版第 12–13 章（深度估计、三维重建）：https://szeliski.org/Book/
- COLMAP 命令行与教程：https://colmap.github.io/cli.html 、https://colmap.github.io/tutorial.html
- Open3D（TSDF 融合、泊松）：https://www.open3d.org/ ；屏蔽泊松参考实现与裁剪工具：https://github.com/mkazhdan/PoissonRecon
- 代码：https://github.com/Totoro97/NeuS 、https://github.com/NVlabs/neuralangelo 、https://github.com/hbb1/2d-gaussian-splatting 、https://github.com/naver/dust3r 、https://github.com/naver/mast3r 、https://github.com/facebookresearch/vggt
