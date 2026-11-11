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
