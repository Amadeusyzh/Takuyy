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
| Global fusion of relative motions for robust, accurate and scalable structure from motion (Moulon, Monasse, Marlet) | ICCV | 2013 | https://openaccess.thecvf.com/content_iccv_2013/html/Moulon_Global_Fusion_of_2013_ICCV_paper.html | 稀疏特征值求全局旋转、L∞ 求平移（OpenMVG） |
| Robust global translations with 1DSfM (Wilson, Snavely) | ECCV | 2014 | https://research.cs.cornell.edu/1dsfm | 投影到一维去除错误的平移方向；1DSfM 数据集 |
| Robust camera location estimation by convex programming (Özyeşil, Singer) | CVPR | 2015 | https://openaccess.thecvf.com/content_cvpr_2015/html/Ozyesil_Robust_Camera_Location_2015_CVPR_paper.html | LUD：凸规划平移平均；平行刚性理论 |
| Baseline desensitizing in translation averaging (Zhuang, Cheong, Lee) | CVPR | 2018 | https://arxiv.org/abs/1901.00643 | BATA：双线性、基于角度、对基线长度不敏感 |
| Global structure-from-motion revisited (Pan, Baráth, Pollefeys, Schönberger) | ECCV | 2024 | https://arxiv.org/abs/2407.20219 | 已发表；GLOMAP：跳过平移平均，相机与点联合全局定位，可从随机初值收敛；COLMAP 4.0 起作为 `global_mapper` 并入 COLMAP |

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
