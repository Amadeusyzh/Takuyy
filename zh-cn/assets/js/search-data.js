
const currentUrl = window.location.href;
const siteUrl = "https://amadeusyzh.github.io";
let updatedUrl = currentUrl.replace("https://amadeusyzh.github.io/Takuyy", "");
if (currentUrl.length == updatedUrl.length && currentUrl.startsWith("http://127.0.0.1")) {
  const otherSiteUrl = siteUrl.replace("localhost", "127.0.0.1");
  updatedUrl = currentUrl.replace(otherSiteUrl + "/Takuyy", "");
}
if ("zh-cn".length > 0) {
  updatedUrl = updatedUrl.replace("/zh-cn", "");
}
// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-关于",
    title: "关于",
    section: "导航菜单",
    handler: () => {
      window.location.href = "/Takuyy/zh-cn/";
    },
  },{id: "nav-论文",
          title: "论文",
          description: "按时间倒序排列。* 表示共同第一作者。",
          section: "导航菜单",
          handler: () => {
            window.location.href = "/Takuyy/zh-cn/publications/";
          },
        },{id: "nav-博客",
          title: "博客",
          description: "研究笔记、论文阅读与学习记录。",
          section: "导航菜单",
          handler: () => {
            window.location.href = "/Takuyy/zh-cn/blog/";
          },
        },{id: "nav-简历",
          title: "简历",
          description: "",
          section: "导航菜单",
          handler: () => {
            window.location.href = "/Takuyy/zh-cn/cv/";
          },
        },{id: "post-基于物理的模拟-粒子-布料-pbd-与-xpbd",
        
          title: "基于物理的模拟：粒子、布料、PBD 与 XPBD",
        
        description: "时间积分器、质点-弹簧布料、基于位置的动力学（PBD）以及 XPBD 的完整推导，附 NumPy 布料求解器，并概览刚体与粒子流体。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-07-physically-based-simulation/";
          
        },
      },{id: "post-实时光线追踪-rt-硬件-降噪-restir-与神经缓存",
        
          title: "实时光线追踪：RT 硬件、降噪、ReSTIR 与神经缓存",
        
        description: "游戏如何在每像素一个样本下做路径追踪：加速结构与 RT Core、混合管线、时间复用、à-trous/SVGF 降噪、ReSTIR 重采样、TAA、DLSS 与神经辐射缓存。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-06-real-time-ray-tracing/";
          
        },
      },{id: "post-光线追踪与路径追踪-从求交到无偏全局光照",
        
          title: "光线追踪与路径追踪：从求交到无偏全局光照",
        
        description: "光线-球体求交与 Möller-Trumbore 算法、基于 SAH 的 BVH、蒙特卡洛积分、重要性采样、俄罗斯轮盘赌、次事件估计与多重重要性采样，最后实现一个紧凑的 NumPy 路径追踪器。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-05-ray-and-path-tracing/";
          
        },
      },{id: "post-基于物理的渲染-辐射度量学-渲染方程与-ggx",
        
          title: "基于物理的渲染：辐射度量学、渲染方程与 GGX",
        
        description: "从瓦特到辐亮度，渲染方程、BRDF 的性质、GGX 微表面模型、金属度-粗糙度工作流与 split-sum 基于图像的光照，并配有数值验证和 GLSL 着色器。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-04-physically-based-rendering/";
          
        },
      },{id: "post-着色与纹理-光照模型-法线贴图-纹理过滤与阴影",
        
          title: "着色与纹理：光照模型、法线贴图、纹理过滤与阴影",
        
        description: "Lambert、Phong 与 Blinn-Phong，平面/Gouraud/Phong 着色，UV 与切线空间，Mipmap 与各向异性过滤，以及带偏移和 PCF 的阴影映射，附 NumPy 与 GLSL 代码。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-03-shading-and-textures/";
          
        },
      },{id: "post-光栅化-从三角形到像素",
        
          title: "光栅化：从三角形到像素",
        
        description: "MVP 管线、逐步推导透视投影矩阵、裁剪、边函数、透视校正插值、z-buffer 与抗锯齿，并用 NumPy 实现一个完整的软件光栅化器。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-02-rasterization/";
          
        },
      },{id: "post-图形学路线图与数学工具箱",
        
          title: "图形学路线图与数学工具箱",
        
        description: "计算机图形学从这里一路通向神经渲染的路线，以及你首先需要的线性代数：向量、齐次坐标、旋转、坐标空间与法线变换。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/graphics-01-roadmap-and-math/";
          
        },
      },{id: "post-你好-世界",
        
          title: "你好，世界",
        
        description: "个人网站上线了。",
        section: "文章",
        handler: () => {
          
            window.location.href = "/Takuyy/zh-cn/blog/2026/hello-world/";
          
        },
      },{id: "news-个人网站上线了-欢迎看看我的博客",
          title: '个人网站上线了，欢迎看看我的博客。',
          description: "",
          section: "动态",},{
        id: 'social-github',
        title: 'GitHub',
        section: '社交账号',
        handler: () => {
          window.open("https://github.com/Amadeusyzh", "_blank");
        },
      },{
        id: 'social-rss',
        title: 'RSS Feed',
        section: '社交账号',
        handler: () => {
          window.open("/Takuyy/feed.xml", "_blank");
        },
      },{
        id: 'social-scholar',
        title: 'Google Scholar',
        section: '社交账号',
        handler: () => {
          window.open("https://scholar.google.com/citations?user=8wyZlsEAAAAJ", "_blank");
        },
      },{
          id: 'lang-en-us',
          title: 'en-us',
          section: '语言',
          handler: () => {
            window.location.href = "/Takuyy" + updatedUrl;
          },
        },{
          id: 'lang-ja-jp',
          title: 'ja-jp',
          section: '语言',
          handler: () => {
            window.location.href = "/Takuyy/ja-jp" + updatedUrl;
          },
        },{
      id: 'light-theme',
      title: '浅色主题',
      description: '切换为浅色主题',
      section: '主题',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: '深色主题',
      description: '切换为深色主题',
      section: '主题',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: '系统默认主题',
      description: '跟随系统主题',
      section: '主题',
      handler: () => {
        setThemeSetting("system");
      },
    },];
