
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
