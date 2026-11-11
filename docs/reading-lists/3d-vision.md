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
