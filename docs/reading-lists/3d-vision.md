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

## 04 两视图几何

### 对极几何、本质矩阵与基础矩阵

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| A computer algorithm for reconstructing a scene from two projections (Longuet-Higgins) | Nature | 1981 | https://doi.org/10.1038/293133a0 | 本质矩阵与线性八点算法的起点 |
| In defense of the eight-point algorithm (Hartley) | TPAMI | 1997 | https://doi.org/10.1109/34.601246 | 坐标归一化使八点算法达到迭代方法的精度 |
| The problem of degeneracy in structure and motion recovery from uncalibrated image sequences (Torr, Fitzgibbon, Zisserman) | IJCV 32(1) | 1999 | — | 纯旋转与平面场景两类退化及其检测 |
| An efficient solution to the five-point relative pose problem (Nistér) | TPAMI | 2004 | https://doi.org/10.1109/TPAMI.2004.17 | 标定相机的五点最小解（10 次多项式），RANSAC 中的标准求解器 |
| Two-view geometry estimation unaffected by a dominant plane (Chum, Werner, Matas) | CVPR | 2005 | — | DEGENSAC：检测七点样本中的单应退化 |
| Recent developments on direct relative orientation (Stewénius, Engels, Nistér) | ISPRS J. Photogrammetry and Remote Sensing | 2006 | — | 用 Gröbner 基与特征值问题求解五点问题 |
| ORB-SLAM: a versatile and accurate monocular SLAM system (Mur-Artal, Montiel, Tardós) | IEEE T-RO | 2015 | https://arxiv.org/abs/1502.00956 | 初始化时并行拟合 H 与 F，按 R_H > 0.45 选择模型 |

### 三角化

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Triangulation (Hartley, Sturm) | CVIU | 1997 | https://doi.org/10.1006/cviu.1997.0547 | 最优两视图三角化：沿极线束参数化，化为 6 次多项式；射影不变 |
| Triangulation made easy (Lindstrom) | CVPR | 2010 | — | 不必求解 6 次多项式、更快的迭代式最优三角化 |

### 立体校正与稠密立体匹配

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Non-parametric local transforms for computing visual correspondence (Zabih, Woodfill) | ECCV | 1994 | — | Census 变换与汉明距离代价，对单调亮度变化不变 |
| Theory and practice of projective rectification (Hartley) | IJCV | 1999 | — | 仅由 F 求校正单应（OpenCV stereoRectifyUncalibrated） |
| Computing rectifying homographies for stereo vision (Loop, Zhang) | CVPR | 1999 | — | 最小化射影畸变的校正单应 |
| A taxonomy and evaluation of dense two-frame stereo correspondence algorithms (Scharstein, Szeliski) | IJCV | 2002 | https://doi.org/10.1023/A:1014573219977 | 代价—聚合—优化—细化的分类框架与 Middlebury 基准 |
| Stereo processing by semiglobal matching and mutual information (Hirschmüller) | TPAMI | 2008 | https://doi.org/10.1109/TPAMI.2007.1166 | SGM：多方向一维动态规划求和 |
| End-to-end learning of geometry and context for deep stereo regression (Kendall et al.) | ICCV | 2017 | https://arxiv.org/abs/1703.04309 | GC-Net：学习特征构建代价体，3D 卷积 + soft argmin |
| RAFT-Stereo: multilevel recurrent field transforms for stereo matching (Lipson, Teed, Deng) | 3DV | 2021 | https://arxiv.org/abs/2109.07547 | 把 RAFT 光流的循环更新用于校正后的立体对 |
| FoundationStereo: zero-shot stereo matching (Wen et al.) | CVPR | 2025 | https://arxiv.org/abs/2501.09898 | 约百万对合成数据 + 冻结的单目深度先验，零样本泛化（已发表，截至 2026 年 11 月） |

### 课程、书与代码

- Hartley & Zisserman《Multiple View Geometry》第 2 版第 9–12 章（对极几何与 F、相机与结构重建、F 的计算、三角化）。
- Ma, Soatto, Košecká, Sastry《An Invitation to 3-D Vision》（2004）第 5、6 章：标定与未标定两视图重建，E 分解的完整证明。
- Szeliski《Computer Vision: Algorithms and Applications》第 2 版第 11 章（运动恢复结构，含两帧方法）与第 12 章（深度估计：校正、匹配代价、SGM）：https://szeliski.org/Book/
- OpenCV calib3d：findFundamentalMat、findEssentialMat、recoverPose、triangulatePoints、stereoRectify、StereoBM、StereoSGBM：https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html
- 代码：https://github.com/PoseLib/PoseLib （五点、七点等最小解）、https://github.com/colmap/colmap
- 基准：Middlebury https://vision.middlebury.edu/stereo/ 、KITTI https://www.cvlibs.net/datasets/kitti/eval_scene_flow.php?benchmark=stereo 、ETH3D https://www.eth3d.net/
## 05 多视图几何与光束法平差

建议顺序：Haralick 等（P3P 综述）→ Lepetit 等（EPnP）→ Triggs 等（BA 综述，重点读规范自由度与稀疏性两节）→ Snavely 等（Photo Tourism）→ Schönberger & Frahm（COLMAP）→ Agarwal 等（BA in the Large）→ Hartley 等（旋转平均）→ Pan 等（GLOMAP）。前馈方法（VGGSfM、VGGT）状态截至 2026 年 11 月。

### PnP 与相机重定位

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Random sample consensus (Fischler, Bolles) | Communications of the ACM | 1981 | https://doi.org/10.1145/358669.358692 | RANSAC 最初就是为由地标求相机位姿而提出的 |
| Review and analysis of solutions of the three point perspective pose estimation problem (Haralick, Lee, Ottenberg, Nölle) | IJCV | 1994 | https://doi.org/10.1007/BF02028352 | Grunert 1841 年的 P3P 及后续解法的综述与数值稳定性分析；第 05 篇的消元即按此推导 |
| Complete solution classification for the perspective-three-point problem (Gao, Hou, Tang, Cheng) | TPAMI | 2003 | https://doi.org/10.1109/TPAMI.2003.1217599 | P3P 有 1、2、3、4 个解的完整判据 |
| EPnP: an accurate O(n) solution to the PnP problem (Lepetit, Moreno-Noguer, Fua) | IJCV | 2009 | https://doi.org/10.1007/s11263-008-0152-6 | 四个控制点 + 重心坐标，把 PnP 化为 12 维零空间问题 |
| A novel parametrization of the perspective-three-point problem (Kneip, Scaramuzza, Siegwart) | CVPR | 2011 | https://doi.org/10.1109/CVPR.2011.5995464 | 直接求位姿、不先求三维点的 P3P |
| Lambda Twist: an accurate fast robust perspective three point (P3P) solver (Persson, Nordberg) | ECCV | 2018 | https://www.ecva.net/papers/eccv_2018/papers_ECCV/html/Mikael_Persson_Lambda_Twist_An_ECCV_2018_paper.php | 避开四次方程，只需三次方程的一个实根，快且稳定 |

### 光束法平差

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Bundle adjustment — a modern synthesis (Triggs, McLauchlan, Hartley, Fitzgibbon) | Vision Algorithms: Theory and Practice (LNCS 1883) | 2000 | https://doi.org/10.1007/3-540-44480-7_21 | BA 的权威综述：代价函数、鲁棒性、稀疏牛顿法、规范自由度；免费版 https://hal.archives-ouvertes.fr/inria-00548290v1 |
| SBA: a software package for generic sparse bundle adjustment (Lourakis, Argyros) | ACM TOMS | 2009 | https://doi.org/10.1145/1486525.1486527 | 基于 Schur 补的稀疏 LM 库 |
| Bundle adjustment in the large (Agarwal, Snavely, Seitz, Szeliski) | ECCV | 2010 | https://doi.org/10.1007/978-3-642-15552-9_3 | 非精确牛顿、迭代 Schur + 预条件共轭梯度；BAL 数据集 |
| Multicore bundle adjustment (Wu, Agarwal, Curless, Seitz) | CVPR | 2011 | https://doi.org/10.1109/CVPR.2011.5995552 | 多核 CPU / GPU 上的 BA |
| Pixel-perfect structure-from-motion with featuremetric refinement (Lindenberger, Sarlin, Larsson, Pollefeys) | ICCV | 2021 | https://arxiv.org/abs/2108.08291 | 用稠密学习特征的"特征度量"误差精化关键点和 BA |

### 增量式 SfM

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Photo tourism: exploring photo collections in 3D (Snavely, Seitz, Szeliski) | SIGGRAPH (ACM TOG) | 2006 | https://doi.org/10.1145/1141911.1141964 | 网络照片上的增量式 SfM（Bundler） |
| Building Rome in a day (Agarwal, Snavely, Simon, Seitz, Szeliski) | ICCV | 2009 | https://doi.org/10.1109/ICCV.2009.5459148 | 城市规模匹配与重建 |
| Towards linear-time incremental structure from motion (Wu) | 3DV | 2013 | https://doi.org/10.1109/3DV.2013.25 | VisualSFM；主要步骤接近线性时间 |
| Structure-from-Motion revisited (Schönberger, Frahm) | CVPR | 2016 | https://openaccess.thecvf.com/content_cvpr_2016/html/Schonberger_Structure-From-Motion_Revisited_CVPR_2016_paper.html | COLMAP：几何验证、下一最佳视图、鲁棒三角化、BA 与过滤 |

### 全局 SfM：旋转平均、平移平均与全局定位

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Rotation averaging (Hartley, Trumpf, Dai, Li) | IJCV | 2013 | https://doi.org/10.1007/s11263-012-0601-0 | 旋转平均的理论教程：弦距离/测地距离、L1/L2、收敛性 |
| Efficient and robust large-scale rotation averaging (Chatterjee, Govindu) | ICCV | 2013 | https://openaccess.thecvf.com/content_iccv_2013/html/Chatterjee_Efficient_and_Robust_2013_ICCV_paper.html | L1 初始化 + IRLS，对错误图像对鲁棒；期刊版 TPAMI 2018 "Robust relative rotation averaging" |
| Global fusion of relative motions for robust, accurate and scalable structure from motion (Moulon, Monasse, Marlet) | ICCV | 2013 | https://openaccess.thecvf.com/content_iccv_2013/html/Moulon_Global_Fusion_of_2013_ICCV_paper.html | 鲁棒的全局 SfM：先求旋转，再由三视图组求平移；OpenMVG 全局流程的基础 |
| Robust global translations with 1DSfM (Wilson, Snavely) | ECCV | 2014 | https://research.cs.cornell.edu/1dsfm | 投影到一维去除错误的平移方向；1DSfM 数据集 |
| Robust camera location estimation by convex programming (Özyeşil, Singer) | CVPR | 2015 | https://openaccess.thecvf.com/content_cvpr_2015/html/Ozyesil_Robust_Camera_Location_2015_CVPR_paper.html | LUD：凸规划平移平均；平行刚性理论 |
| Baseline desensitizing in translation averaging (Zhuang, Cheong, Lee) | CVPR | 2018 | https://arxiv.org/abs/1901.00643 | BATA：双线性、基于角度、对基线长度不敏感 |
| Global structure-from-motion revisited (Pan, Baráth, Pollefeys, Schönberger) | ECCV | 2024 | https://arxiv.org/abs/2407.20219 | 已发表；GLOMAP：跳过平移平均，相机与点联合全局定位，可从随机初值收敛；截至 2026 年 11 月，COLMAP 本身已以 `global_mapper` 命令提供 |

### 前馈方法（截至 2026 年 11 月）

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| VGGSfM: visual geometry grounded deep structure from motion (Wang, Karaev, Rupprecht, Novotny) | CVPR | 2024 | https://openaccess.thecvf.com/content/CVPR2024/html/Wang_VGGSfM_Visual_Geometry_Grounded_Deep_Structure_From_Motion_CVPR_2024_paper.html | 已发表；学习的轨迹 + 可微 BA 的端到端 SfM |
| VGGT: visual geometry grounded transformer (Wang et al.) | CVPR | 2025 | https://arxiv.org/abs/2503.11651 | 已发表；一次前向预测相机、深度、点图与轨迹；官方代码可选 BA 精化（第 09 篇详讲） |

**书籍、文档与代码**

- Hartley & Zisserman《Multiple View Geometry》第 2 版：第 7 章（相机矩阵估计）、第 18 章（N 视图计算方法）、附录 A6（迭代估计与稀疏 LM）。
- Szeliski《Computer Vision: Algorithms and Applications》第 2 版第 11 章（Structure from motion and SLAM）：https://szeliski.org/Book/
- Ceres Solver（BA 教程）：http://ceres-solver.org/ ；BAL 数据集：https://grail.cs.washington.edu/projects/bal/
- COLMAP：https://colmap.github.io/ ；GLOMAP：https://github.com/colmap/glomap
- OpenCV PnP：https://docs.opencv.org/4.x/d5/d1f/calib3d_solvePnP.html
## 06 视觉 SLAM

### 基础、因子图与后端

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Estimating uncertain spatial relationships in robotics (Smith, Self, Cheeseman) | Autonomous Robot Vehicles（论文集） | 1990 | — | 不确定空间关系的随机地图，EKF-SLAM 的源头 |
| Simultaneous localization and mapping: part I (Durrant-Whyte, Bailey) | IEEE Robotics & Automation Magazine | 2006 | — | SLAM 经典教程综述（两部分之一；SLAM 这一缩写出现于 20 世纪 90 年代中期） |
| g2o: a general framework for graph optimization (Kümmerle et al.) | ICRA | 2011 | https://doi.org/10.1109/ICRA.2011.5979949 | 通用图优化框架，位姿图与 BA 的标准开源求解器 |
| iSAM2: incremental smoothing and mapping using the Bayes tree (Kaess et al.) | IJRR | 2012 | — | 贝叶斯树上的增量平滑，无需周期性批量重排序 |
| Switchable constraints for robust pose graph SLAM (Sünderhauf, Protzel) | IROS | 2012 | https://doi.org/10.1109/IROS.2012.6385590 | 每条回环边带开关变量，抵抗错误回环 |
| Past, present, and future of simultaneous localization and mapping (Cadena et al.) | IEEE TRO | 2016 | https://arxiv.org/abs/1606.05830 | 因子图时代的 SLAM 综述与立场论文 |
| Factor graphs for robot perception (Dellaert, Kaess) | Foundations and Trends in Robotics | 2017 | https://doi.org/10.1561/2300000043 | 以因子图统一 SLAM、稀疏性与增量求解的专著 |
| A micro Lie theory for state estimation in robotics (Solà, Deray, Atchuthan) | arXiv 预印本 | 2018 | https://arxiv.org/abs/1812.01537 | 机器人估计所需的李群最小工具集（Exp/Log、扰动、雅可比） |

### 滤波与优化

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| MonoSLAM: real-time single camera SLAM (Davison, Reid, Molton, Stasse) | TPAMI | 2007 | https://doi.org/10.1109/TPAMI.2007.1049 | 第一个实时单目 SLAM，EKF |
| A multi-state constraint Kalman filter for vision-aided inertial navigation (Mourikis, Roumeliotis) | ICRA | 2007 | https://doi.org/10.1109/ROBOT.2007.364024 | MSCKF：左零空间投影消去特征，无路标的 VIO 滤波器 |
| Visual SLAM: why filter? (Strasdat, Montiel, Davison) | Image and Vision Computing | 2012 | — | 单位计算量下关键帧 BA 胜过滤波 |

### 视觉里程计与完整系统

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Parallel tracking and mapping for small AR workspaces (Klein, Murray) | ISMAR | 2007 | https://doi.org/10.1109/ISMAR.2007.4538852 | PTAM：跟踪与建图分线程，关键帧 BA |
| LSD-SLAM: large-scale direct monocular SLAM (Engel, Schöps, Cremers) | ECCV | 2014 | https://doi.org/10.1007/978-3-319-10605-2_54 | 半稠密直接法：新帧在 $SE(3)$ 上跟踪，关键帧之间用 $\mathrm{Sim}(3)$ 对齐并构成位姿图 |
| ORB-SLAM: a versatile and accurate monocular SLAM system (Mur-Artal, Montiel, Tardós) | IEEE TRO | 2015 | https://arxiv.org/abs/1502.00956 | ORB 特征贯穿跟踪、建图、重定位、回环；共视图与本质图 |
| Direct sparse odometry (Engel, Koltun, Cremers) | TPAMI | 2018 | https://arxiv.org/abs/1607.02565 | 稀疏直接法 + 光度标定（曝光、响应、渐晕），窗口化光度 BA |
| ORB-SLAM3: an accurate open-source library for visual, visual-inertial and multi-map SLAM (Campos et al.) | IEEE TRO | 2021 | https://arxiv.org/abs/2007.11898 | 单目/双目/RGB-D ± IMU，针孔与鱼眼，Atlas 多地图 |

### 回环检测

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Video Google: a text retrieval approach to object matching in videos (Sivic, Zisserman) | ICCV | 2003 | — | 视觉词袋 + tf-idf + 倒排文件 |
| Scalable recognition with a vocabulary tree (Nistér, Stewénius) | CVPR | 2006 | — | 层次 k-means 词汇树 |
| Bags of binary words for fast place recognition in image sequences (Gálvez-López, Tardós) | IEEE TRO | 2012 | https://doi.org/10.1109/TRO.2012.2197158 | DBoW2：二值描述子词袋，ORB-SLAM 与 VINS-Mono 的回环检测 |

### 视觉惯性里程计

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Visual-inertial-aided navigation for high-dynamic motion in built environments without initial conditions (Lupton, Sukkarieh) | IEEE TRO | 2012 | https://doi.org/10.1109/TRO.2011.2170332 | IMU 预积分的提出 |
| On-manifold preintegration for real-time visual-inertial odometry (Forster, Carlone, Dellaert, Scaramuzza) | IEEE TRO | 2017 | https://arxiv.org/abs/1512.02363 | $SO(3)$ 流形上的预积分、零偏雅可比，GTSAM 实现 |
| VINS-Mono: a robust and versatile monocular visual-inertial state estimator (Qin, Li, Shen) | IEEE TRO | 2018 | https://arxiv.org/abs/1708.03852 | 紧耦合滑动窗口优化、在线初始化、4 自由度全局位姿图 |

### 学习型与基于基础模型的 SLAM（截至 2026 年 11 月）

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| DROID-SLAM: deep visual SLAM for monocular, stereo, and RGB-D cameras (Teed, Deng) | NeurIPS | 2021 | https://arxiv.org/abs/2108.10869 | RAFT 式循环更新 + 可微稠密 BA 层 |
| Deep patch visual odometry (Teed, Lipson, Deng) | NeurIPS | 2023 | https://arxiv.org/abs/2208.04726 | 稀疏图像块 + 可微 BA，比 DROID 省内存、更快 |
| MASt3R-SLAM: real-time dense SLAM with 3D reconstruction priors (Murai, Dexheimer, Davison) | CVPR（已发表） | 2025 | https://arxiv.org/abs/2412.12392 | 以 MASt3R 两视图点图为先验，约 15 FPS，带回环与二阶全局优化 |
| VGGT-SLAM: dense RGB SLAM optimized on the SL(4) manifold (Maggio, Lim, Carlone) | NeurIPS（已发表） | 2025 | https://arxiv.org/abs/2505.12549 | 未标定相机下用 15 自由度单应在 $\mathrm{SL}(4)$ 上对齐 VGGT 子图 |
| SplaTAM / Gaussian Splatting SLAM (MonoGS) | CVPR | 2024 | https://arxiv.org/abs/2312.02126 、https://arxiv.org/abs/2312.06741 | 高斯泼溅 SLAM，详见 neural-rendering 第 5 篇 |

### 数据集与评测

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| A benchmark for the evaluation of RGB-D SLAM systems (Sturm et al.) | IROS | 2012 | https://doi.org/10.1109/IROS.2012.6385773 | TUM RGB-D，39 个序列；ATE 与 RPE |
| The EuRoC micro aerial vehicle datasets (Burri et al.) | IJRR | 2016 | https://doi.org/10.1177/0278364915620033 | 双目 + IMU 的 11 个 MAV 序列，标准 VIO 基准 |

### 课程、书与代码

- Barfoot《State Estimation for Robotics》（第 2 版，2024）：李群、滤波与批量估计。
- 高翔、张涛等《视觉 SLAM 十四讲》：配套代码 https://github.com/gaoxiang12/slambook2
- Grisetti 等，"A tutorial on graph-based SLAM"（IEEE ITS Magazine，2010）：$SE(2)$ 位姿图雅可比。
- 代码：https://github.com/UZ-SLAMLab/ORB_SLAM3 、https://github.com/HKUST-Aerial-Robotics/VINS-Mono 、https://github.com/JakobEngel/dso 、https://github.com/princeton-vl/DROID-SLAM 、https://github.com/princeton-vl/DPVO 、https://github.com/rpng/open_vins 、https://github.com/RainerKuemmerle/g2o 、https://github.com/borglab/gtsam
- 评估工具：https://github.com/MichaelGrupp/evo
## 07 深度估计与多视图立体

建议顺序：Scharstein & Szeliski（立体分类体系）→ Collins（平面扫描）→ Okutomi & Kanade（多基线）→ Bleyer 等（倾斜窗口 PatchMatch）→ Schönberger 等（COLMAP MVS）→ Curless & Levoy、KinectFusion（TSDF 融合）→ MVSNet → CasMVSNet / PatchmatchNet → Eigen 等 → MiDaS → Depth Anything 系列与度量深度模型。最后一组为 2024–2026 年的工作，状态截至 2026 年 11 月。

### 立体、平面扫描与 PatchMatch MVS

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| A multiple-baseline stereo (Okutomi, Kanade) | TPAMI | 1993 | https://doi.org/10.1109/34.206955 | 在逆距离上对多条基线的 SSD 求和，消除重复纹理的歧义 |
| A space-sweep approach to true multi-image matching (Collins) | CVPR | 1996 | https://doi.org/10.1109/CVPR.1996.517097 | 平面扫描：让平面扫过空间，同时匹配多幅图像 |
| Handling occlusions in dense multi-view stereo (Kang, Szeliski, Chai) | CVPR | 2001 | https://doi.org/10.1109/CVPR.2001.990462 | 可移动窗口与逐像素视图子集，处理遮挡 |
| A taxonomy and evaluation of dense two-frame stereo correspondence algorithms (Scharstein, Szeliski) | IJCV | 2002 | https://doi.org/10.1023/A:1014573219977 | 代价、聚合、优化、细化四步分类；Middlebury 基准 |
| Stereo processing by semiglobal matching and mutual information (Hirschmüller) | TPAMI | 2008 | https://doi.org/10.1109/TPAMI.2007.1166 | SGM：多方向一维动态规划 |
| PatchMatch: a randomized correspondence algorithm for structural image editing (Barnes et al.) | ACM TOG (SIGGRAPH) | 2009 | https://doi.org/10.1145/1531326.1531330 | 随机初始化 + 传播 + 随机搜索 |
| Accurate, dense, and robust multiview stereopsis (Furukawa, Ponce) | TPAMI | 2010 | https://doi.org/10.1109/TPAMI.2009.161 | PMVS：匹配、扩展、过滤的面片式 MVS |
| PatchMatch stereo: stereo matching with slanted support windows (Bleyer, Rhemann, Rother) | BMVC | 2011 | https://doi.org/10.5244/C.25.14 | 逐像素倾斜平面，消除正对平面偏置 |
| Massively parallel multiview stereopsis by surface normal diffusion (Galliani, Lasinger, Schindler) | ICCV | 2015 | https://doi.org/10.1109/ICCV.2015.106 | Gipuma：红黑棋盘传播，GPU 并行 |
| Pixelwise view selection for unstructured multi-view stereo (Schönberger et al.) | ECCV | 2016 | https://doi.org/10.1007/978-3-319-46487-9_31 | COLMAP MVS：深度、法向与视图选择联合估计，几何一致性 |
| Multi-scale geometric consistency guided multi-view stereo (Xu, Tao) | CVPR | 2019 | https://arxiv.org/abs/1904.08103 | ACMM：自适应棋盘采样 + 多尺度几何一致性 |

### 深度传感器与深度融合

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| A volumetric method for building complex models from range images (Curless, Levoy) | SIGGRAPH | 1996 | https://doi.org/10.1145/237170.237269 | TSDF：截断符号距离的加权平均融合 |
| Structured-light 3D surface imaging: a tutorial (Geng) | Advances in Optics and Photonics | 2011 | https://doi.org/10.1364/AOP.3.000128 | 结构光编码（格雷码、相移、伪随机）综述 |
| KinectFusion: real-time dense surface mapping and tracking (Newcombe et al.) | ISMAR | 2011 | https://doi.org/10.1109/ISMAR.2011.6092378 | 实时 TSDF 融合 + 对模型的 ICP 跟踪 |
| Real-time 3D reconstruction at scale using voxel hashing (Nießner et al.) | ACM TOG (SIGGRAPH Asia) | 2013 | https://doi.org/10.1145/2508363.2508374 | 体素哈希：只在表面附近分配 TSDF 块 |
| Time-of-Flight Cameras: Principles, Methods and Applications (Hansard, Lee, Choi, Horaud) | Springer（书） | 2012 | — | ToF 相机的原理、误差来源与标定 |

### 学习式立体与 MVS

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| End-to-end learning of geometry and context for deep stereo regression (Kendall et al.) | ICCV | 2017 | https://arxiv.org/abs/1703.04309 | GC-Net：3D CNN 代价体 + soft-argmin |
| MVSNet: depth inference for unstructured multi-view stereo (Yao et al.) | ECCV | 2018 | https://arxiv.org/abs/1804.02505 | 可微单应变换 + 方差代价体 + 3D U-Net |
| Recurrent MVSNet for high-resolution multi-view stereo depth inference (Yao et al.) | CVPR | 2019 | https://arxiv.org/abs/1902.10556 | 用 GRU 逐深度切片正则化，显存与深度数无关 |
| Cascade cost volume for high-resolution multi-view stereo and stereo matching (Gu et al.) | CVPR | 2020 | https://arxiv.org/abs/1912.06378 | CasMVSNet：由粗到细缩小深度范围 |
| PatchmatchNet: learned multi-view patchmatch stereo (Wang et al.) | CVPR | 2021 | https://arxiv.org/abs/2012.01411 | 可学习的迭代 PatchMatch，无完整代价体 |
| RAFT-Stereo: multilevel recurrent field transforms for stereo matching (Lipson, Teed, Deng) | 3DV | 2021 | https://arxiv.org/abs/2109.07547 | 相关金字塔 + 多级 GRU 迭代更新视差 |
| FoundationStereo: zero-shot stereo matching (Wen et al.) | CVPR | 2025 | https://arxiv.org/abs/2501.09898 | 引入冻结的 Depth Anything V2 特征，零样本立体 |

### 单目深度

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Depth map prediction from a single image using a multi-scale deep network (Eigen, Puhrsch, Fergus) | NeurIPS | 2014 | https://arxiv.org/abs/1406.2283 | 早期的深度单目深度网络之一；尺度不变对数损失 |
| Digging into self-supervised monocular depth estimation (Godard et al.) | ICCV | 2019 | https://arxiv.org/abs/1806.01260 | Monodepth2：最小重投影误差 + 自动掩膜 |
| Vision transformers for dense prediction (Ranftl, Bochkovskiy, Koltun) | ICCV | 2021 | https://arxiv.org/abs/2103.13413 | DPT：ViT 主干的稠密预测 |
| Towards robust monocular depth estimation: mixing datasets for zero-shot cross-dataset transfer (Ranftl et al.) | TPAMI | 2022 | https://arxiv.org/abs/1907.01341 | MiDaS：仿射不变逆深度损失，混合多数据集训练 |
| Depth Anything: unleashing the power of large-scale unlabeled data (Yang et al.) | CVPR | 2024 | https://arxiv.org/abs/2401.10891 | 大规模无标注图像伪标注，相对深度 |
| Repurposing diffusion-based image generators for monocular depth estimation (Ke et al.) | CVPR | 2024 | https://arxiv.org/abs/2312.02145 | Marigold：微调 Stable Diffusion 生成深度 |
| UniDepth: universal monocular metric depth estimation (Piccinelli et al.) | CVPR | 2024 | https://arxiv.org/abs/2403.18913 | 自提示相机模块，无需内参的度量深度 |
| Metric3D v2: a versatile monocular geometric foundation model (Hu et al.) | TPAMI | 2024 | https://arxiv.org/abs/2404.15506 | 规范相机空间，度量深度与法向 |
| Depth Anything V2 (Yang et al.) | NeurIPS | 2024 | https://arxiv.org/abs/2406.09414 | 合成数据训练教师，细节更好 |
| Depth Pro: sharp monocular metric depth in less than a second (Bochkovskii et al.) | ICLR | 2025 | https://arxiv.org/abs/2410.02073 | 零样本度量深度 + 焦距估计，边界锐利 |
| MoGe: unlocking accurate monocular geometry estimation for open-domain images (Wang et al.) | CVPR | 2025 | https://arxiv.org/abs/2410.19115 | 仿射不变点图，联合恢复焦距与偏移 |
| Video Depth Anything: consistent depth estimation for super-long videos (Chen et al.) | CVPR | 2025 | https://arxiv.org/abs/2501.12375 | 时空头，长视频深度一致 |
| Depth Anything 3: recovering the visual space from any views (Lin et al.) | ICLR 2026（arXiv 2025 年 11 月） | 2026 | https://arxiv.org/abs/2511.10647 | 单个 Transformer 从任意视图预测深度与位姿（衔接第 9 篇） |
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
| Streaming 4D visual geometry transformer (Zhuo et al.) | ICLR（据作者代码仓库；arXiv 2025 年 7 月） | 2026 | https://arxiv.org/abs/2507.11539 | StreamVGGT：因果注意力 + 键值缓存，由 VGGT 蒸馏 |
| π³: permutation-equivariant visual geometry learning (Wang et al.) | ICLR（据作者代码仓库） | 2026 | https://arxiv.org/abs/2507.13347 | 无参考视图，置换等变 |
| MapAnything: universal feed-forward metric 3D reconstruction (Keetha et al.) | 3DV | 2026 | https://arxiv.org/abs/2509.13414 | 可选输入（内参、位姿、深度），分解式度量输出 |
| Depth Anything 3: recovering the visual space from any views (Lin et al.) | arXiv 预印本（2025 年 11 月；截至 2026 年 11 月未核实到会议） | 2025 | https://arxiv.org/abs/2511.10647 | 朴素 Transformer + 深度-射线目标 |
| LongStream: long-sequence streaming autoregressive visual geometry (Cheng et al.) | 状态未核实 | 2026 | （链接未核实） | 关键帧相对位姿、解耦尺度，公里级流式重建 |

### 评测基准

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Large scale multi-view stereopsis evaluation (Jensen et al.) | CVPR | 2014 | https://doi.org/10.1109/CVPR.2014.59 | DTU：机械臂上的相机拍摄的桌面物体 + 结构光参考扫描 |
| A multi-view stereo benchmark with high-resolution images and multi-camera videos (Schöps et al.) | CVPR | 2017 | https://doi.org/10.1109/CVPR.2017.272 | ETH3D：高分辨率室内外场景，激光扫描真值 |
| Tanks and Temples: benchmarking large-scale scene reconstruction (Knapitsch et al.) | ACM TOG (SIGGRAPH) | 2017 | https://doi.org/10.1145/3072959.3073599 | 精确率 / 召回率 / F 分数 |
| Large-scale data for multiple-view stereopsis (Aanæs et al.) | IJCV | 2016 | https://doi.org/10.1007/s11263-016-0902-9 | DTU：124 个场景，结构光真值，准确度/完整度（Chamfer） |
| Tanks and Temples: benchmarking large-scale scene reconstruction (Knapitsch et al.) | ACM TOG | 2017 | https://doi.org/10.1145/3072959.3073599 | 激光扫描真值，按场景阈值的精确率/召回率/F 值 |
| A multi-view stereo benchmark with high-resolution images and multi-camera videos (Schöps et al.) | CVPR | 2017 | https://openaccess.thecvf.com/content_cvpr_2017/html/Schops_A_Multi-View_Stereo_CVPR_2017_paper.html | ETH3D：高分辨率图像，多容差 F1 |

### 课程、书与代码

- Szeliski《Computer Vision: Algorithms and Applications》第 2 版第 12–13 章（深度估计、三维重建）：https://szeliski.org/Book/
- Furukawa & Hernández《Multi-View Stereo: A Tutorial》（Foundations and Trends in Computer Graphics and Vision，2015）。
- Hartley & Zisserman《Multiple View Geometry》第 13.1 节：平面诱导的单应。
- 代码：https://github.com/colmap/colmap 、https://github.com/cdcseacave/openMVS 、https://github.com/isl-org/Open3D 、https://github.com/YoYo000/MVSNet 、https://github.com/alibaba/cascade-stereo 、https://github.com/FangjinhuaWang/PatchmatchNet 、https://github.com/DepthAnything/Depth-Anything-V2 、https://github.com/apple/ml-depth-pro 、https://github.com/lpiccinelli-eth/UniDepth
- 基准：https://vision.middlebury.edu/stereo/ 、https://www.eth3d.net/ 、https://www.tanksandtemples.org/
## 08 三维表示

对应文章：`2026-10-27-3d-vision-08-3d-representations.md`（深度图与 MPI、点云、网格、体素与八叉树、SDF/TSDF、神经场、三维高斯，以及 PointNet 与稀疏卷积）。

### 图像空间、点与网格

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| Marching cubes: a high resolution 3D surface construction algorithm (Lorensen, Cline) | SIGGRAPH | 1987 | https://doi.org/10.1145/37401.37422 | 从任意采样的隐式场提取网格 |
| Layered depth images (Shade, Gortler, He, Szeliski) | SIGGRAPH | 1998 | https://doi.org/10.1145/280814.280882 | 每像素多个深度，渲染时可处理视差与去遮挡 |
| Surfels: surface elements as rendering primitives (Pfister, Zwicker, van Baar, Gross) | SIGGRAPH | 2000 | https://doi.org/10.1145/344779.344936 | 带法向与半径的点基元（面元） |
| A point set generation network for 3D object reconstruction from a single image (Fan, Su, Guibas) | CVPR | 2017 | https://arxiv.org/abs/1612.00603 | 直接预测点云；推广了 Chamfer / EMD 损失 |
| Tanks and Temples: benchmarking large-scale scene reconstruction (Knapitsch, Park, Zhou, Koltun) | ACM TOG | 2017 | https://doi.org/10.1145/3072959.3073599 | 精确率 / 召回率 / F-score 评测重建 |
| Stereo magnification: learning view synthesis using multiplane images (Zhou et al.) | SIGGRAPH (ACM TOG) | 2018 | https://arxiv.org/abs/1805.09817 | 多平面图像（MPI），按逆深度均匀分布的 RGBA 平面 |

### 体素、八叉树与距离场

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| A volumetric method for building complex models from range images (Curless, Levoy) | SIGGRAPH | 1996 | https://doi.org/10.1145/237170.237269 | 累积加权有符号距离：TSDF 融合的起源 |
| KinectFusion: real-time dense surface mapping and tracking (Newcombe et al.) | ISMAR | 2011 | https://doi.org/10.1109/ISMAR.2011.6092378 | 深度相机实时 TSDF 融合 + ICP 跟踪 |
| OctoMap: an efficient probabilistic 3D mapping framework based on octrees (Hornung et al.) | Autonomous Robots | 2013 | https://doi.org/10.1007/s10514-012-9321-0 | 八叉树中的对数几率占据，机器人标准地图 |
| Real-time 3D reconstruction at scale using voxel hashing (Nießner, Zollhöfer, Izadi, Stamminger) | ACM TOG (SIGGRAPH Asia) | 2013 | https://doi.org/10.1145/2508363.2508374 | 只在表面附近分配体素块，用哈希表索引 |
| Voxblox: incremental 3D Euclidean signed distance fields for on-board MAV planning (Oleynikova et al.) | IROS | 2017 | https://arxiv.org/abs/1611.03631 | 由 TSDF 增量构建 ESDF，用于规划 |

### 神经场与三维高斯

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| On the spectral bias of neural networks (Rahaman et al.) | ICML | 2019 | https://arxiv.org/abs/1806.08734 | MLP 先学低频：位置编码的动机 |
| Occupancy networks: learning 3D reconstruction in function space (Mescheder et al.) | CVPR | 2019 | https://arxiv.org/abs/1812.03828 | 形状 = 分类器的决策边界 |
| DeepSDF: learning continuous signed distance functions for shape representation (Park et al.) | CVPR | 2019 | https://arxiv.org/abs/1901.05103 | 自解码器 + 隐编码，一个网络表示一类形状 |
| Implicit geometric regularization for learning shapes (Gropp et al.) | ICML | 2020 | https://arxiv.org/abs/2002.10099 | 程函损失；从原始点云学 SDF |
| NeRF: representing scenes as neural radiance fields for view synthesis (Mildenhall et al.) | ECCV | 2020 | https://arxiv.org/abs/2003.08934 | 体渲染训练的辐射场 |
| Fourier features let networks learn high frequency functions in low dimensional domains (Tancik et al.) | NeurIPS | 2020 | https://arxiv.org/abs/2006.10739 | 位置编码的 NTK 分析 |
| Implicit neural representations with periodic activation functions (SIREN; Sitzmann et al.) | NeurIPS | 2020 | https://arxiv.org/abs/2006.09661 | 正弦激活 |
| Instant neural graphics primitives with a multiresolution hash encoding (Müller et al.) | SIGGRAPH (ACM TOG) | 2022 | https://arxiv.org/abs/2201.05989 | 哈希栅格 + 小 MLP 的混合表示 |
| 3D Gaussian splatting for real-time radiance field rendering (Kerbl et al.) | SIGGRAPH (ACM TOG) | 2023 | https://arxiv.org/abs/2308.04079 | 每个高斯 59 个可学习浮点数；显式、可微、实时 |
| 2D Gaussian splatting for geometrically accurate radiance fields (Huang et al.) | SIGGRAPH | 2024 | https://arxiv.org/abs/2403.17888 | 扁平高斯面元，法向与表面定义明确 |

### 三维数据上的学习

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| PointNet: deep learning on point sets for 3D classification and segmentation (Qi, Su, Mo, Guibas) | CVPR | 2017 | https://arxiv.org/abs/1612.00593 | 共享 MLP + 最大池化，排列不变；关键点 |
| PointNet++: deep hierarchical feature learning on point sets in a metric space (Qi, Yi, Su, Guibas) | NeurIPS | 2017 | https://arxiv.org/abs/1706.02413 | FPS + 球查询的分层局部特征 |
| 3D semantic segmentation with submanifold sparse convolutional networks (Graham, Engelcke, van der Maaten) | CVPR | 2018 | https://arxiv.org/abs/1711.10275 | 子流形稀疏卷积，不膨胀活跃集合 |
| 4D spatio-temporal ConvNets: Minkowski convolutional neural networks (Choy, Gwak, Savarese) | CVPR | 2019 | https://arxiv.org/abs/1904.08755 | 广义稀疏卷积与 MinkowskiEngine |
| Point Transformer V3: simpler, faster, stronger (Wu et al.) | CVPR | 2024 | https://arxiv.org/abs/2312.10035 | 点序列化 + 窗口注意力 + 稀疏卷积 |

### 课程、书与代码

- Botsch, Kobbelt, Pauly, Alliez, Lévy《Polygon Mesh Processing》（A K Peters，2010）：网格、转换与重新划分网格。
- 本站图形学第 8 篇（网格、隐式曲面、Marching Cubes、泊松重建）。
- Xie et al., "Neural Fields in Visual Computing and Beyond"（Eurographics STAR 2022）及论文列表：https://neuralfields.cs.brown.edu/
- 代码：https://www.open3d.org/ 、https://trimesh.org/ 、https://octomap.github.io/ 、https://github.com/ethz-asl/voxblox 、https://github.com/NVIDIA/MinkowskiEngine 、https://github.com/Pointcept/Pointcept
- COLMAP 命令行与教程：https://colmap.github.io/cli.html 、https://colmap.github.io/tutorial.html
- Open3D（TSDF 融合、泊松）：https://www.open3d.org/ ；屏蔽泊松参考实现与裁剪工具：https://github.com/mkazhdan/PoissonRecon
- 代码：https://github.com/Totoro97/NeuS 、https://github.com/NVlabs/neuralangelo 、https://github.com/hbb1/2d-gaussian-splatting 、https://github.com/naver/dust3r 、https://github.com/naver/mast3r 、https://github.com/facebookresearch/vggt
## 10 面向 AR/VR 的三维视觉

| 论文 | 会议/期刊 | 年份 | 链接 | 说明 |
| --- | --- | --- | --- | --- |
| A survey of augmented reality (Azuma) | Presence | 1997 | https://doi.org/10.1162/pres.1997.6.4.355 | AR 的经典定义；把配准（registration）列为核心问题 |
| Registration error analysis for augmented reality (Holloway) | Presence | 1997 | https://doi.org/10.1162/pres.1997.6.4.413 | 光学透视系统的端到端误差预算；即使在中等头速下，系统延迟也是最大的单一误差来源 |
| Single point active alignment method (SPAAM) for optical see-through HMD calibration for AR (Tuceryan, Navab) | ISAR | 2000 | — | 用户参与的光学透视显示标定（第 149–158 页） |
| General theory of remote gaze estimation using the pupil center and corneal reflections (Guestrin, Eizenman) | IEEE TBME | 2006 | https://doi.org/10.1109/TBME.2005.863952 | 瞳孔-角膜反射（PCCR）眼动追踪的三维理论 |
| A multi-state constraint Kalman filter for vision-aided inertial navigation (Mourikis, Roumeliotis) | ICRA | 2007 | https://doi.org/10.1109/ROBOT.2007.364024 | MSCKF：移动设备上常用的 VIO 滤波框架 |
| 1€ filter: a simple speed-based low-pass filter for noisy input in interactive systems (Casiez, Roussel, Vogel) | CHI | 2012 | https://doi.org/10.1145/2207676.2208639 | 截止频率随速度增大的自适应低通；兼顾静止抖动与运动延迟 |
| Head tracking for the Oculus Rift (LaValle, Yershova, Katsev, Antonov) | ICRA | 2014 | https://doi.org/10.1109/ICRA.2014.6906608 | 消费级头显的姿态跟踪、漂移校正与预测 |
| The asynchronous time warp for virtual reality on consumer hardware (van Waveren) | VRST | 2016 | https://doi.org/10.1145/2993369.2993375 | 与应用帧率解耦的后期重投影（异步时间扭曲） |
| Towards foveated rendering for gaze-tracked virtual reality (Patney et al.) | SIGGRAPH Asia (ACM TOG) | 2016 | https://doi.org/10.1145/2980179.2980246 | 眼动追踪下周边视野可降低多少渲染质量 |
| On-manifold preintegration for real-time visual-inertial odometry (Forster et al.) | IEEE T-RO | 2017 | https://arxiv.org/abs/1512.02363 | 基于优化的 VIO 中的 IMU 预积分 |
| A survey of calibration methods for optical see-through head-mounted displays (Grubert, Itoh, Moser, Swan) | IEEE TVCG | 2018 | https://arxiv.org/abs/1709.04299 | 光学透视显示与眼睛位置标定方法综述 |
| From coarse to fine: robust hierarchical localization at large scale (Sarlin et al.) | CVPR | 2019 | https://arxiv.org/abs/1812.03506 | 检索 + 局部匹配 + PnP 的分层重定位流程 |
| MEgATrack: monochrome egocentric articulated hand-tracking for virtual reality (Han et al.) | SIGGRAPH (ACM TOG) | 2020 | https://doi.org/10.1145/3386569.3392452 | 用头显单色鱼眼跟踪相机做手部追踪 |
| Passthrough+: real-time stereoscopic view synthesis for mobile mixed reality (Chaurasia et al.) | I3D (PACMCGIT) | 2020 | https://doi.org/10.1145/3384540 | 移动头显上基于深度代理的透视重投影 |
| Towards indistinguishable augmented reality: a survey on optical see-through head-mounted displays (Itoh et al.) | ACM Computing Surveys | 2021 | https://doi.org/10.1145/3453157 | 光学透视显示的空间、时间与视觉真实感 |
| NeuralPassthrough: learned real-time view synthesis for VR (Xiao et al.) | SIGGRAPH | 2022 | https://arxiv.org/abs/2207.02186 | 学习式透视视图合成 |
| UmeTrack: unified multi-view end-to-end hand tracking for VR (Han et al.) | SIGGRAPH Asia | 2022 | https://arxiv.org/abs/2211.00099 | 多视角、多帧端到端输出世界坐标系下的手部姿态 |
| Project Aria: a new tool for egocentric multi-modal AI research (Engel et al.) | arXiv 预印本（2023 年 8 月；截至 2026 年 11 月仍为预印本） | 2023 | https://arxiv.org/abs/2308.13561 | 带 SLAM、眼动与公开数据集的研究用眼镜平台 |
| SceneScript: reconstructing scenes with an autoregressive structured language model (Avetisyan et al.) | ECCV | 2024 | https://arxiv.org/abs/2403.13064 | 已发表（截至 2026 年 11 月）；把房间布局与物体表示为结构化命令序列 |

**书籍、规范与代码**

- S. M. LaValle，*Virtual Reality*（Cambridge University Press，2023），作者网站免费在线版：https://lavalle.pl/vr/ （跟踪、渲染、延迟与感知各章）。
- OpenXR 1.1 规范（帧时序 `predictedDisplayTime`、空间与锚点）：https://registry.khronos.org/OpenXR/specs/1.1-khr/html/xrspec.html
- Project Aria 数据集与工具：https://www.projectaria.com/
- 1€ 滤波器主页与多语言实现：https://cristal.univ-lille.fr/~casiez/1euro
- 开源 VIO（见第 06 篇）：OpenVINS、VINS-Fusion、ORB-SLAM3（惯性模式），可在录制数据上试验 inside-out 跟踪。
