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
