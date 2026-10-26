
const currentUrl = window.location.href;
const siteUrl = "https://amadeusyzh.github.io";
let updatedUrl = currentUrl.replace("https://amadeusyzh.github.io/Takuyy", "");
if (currentUrl.length == updatedUrl.length && currentUrl.startsWith("http://127.0.0.1")) {
  const otherSiteUrl = siteUrl.replace("localhost", "127.0.0.1");
  updatedUrl = currentUrl.replace(otherSiteUrl + "/Takuyy", "");
}
if ("ja-jp".length > 0) {
  updatedUrl = updatedUrl.replace("/ja-jp", "");
}
// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-ホーム",
    title: "ホーム",
    section: "ナビゲーション",
    handler: () => {
      window.location.href = "/Takuyy/ja-jp/";
    },
  },{id: "nav-業績",
          title: "業績",
          description: "新しい順に掲載。* は同等貢献を示します。",
          section: "ナビゲーション",
          handler: () => {
            window.location.href = "/Takuyy/ja-jp/publications/";
          },
        },{id: "nav-ブログ",
          title: "ブログ",
          description: "研究ノート、論文紹介、日々の学び。",
          section: "ナビゲーション",
          handler: () => {
            window.location.href = "/Takuyy/ja-jp/blog/";
          },
        },{id: "nav-cv",
          title: "CV",
          description: "",
          section: "ナビゲーション",
          handler: () => {
            window.location.href = "/Takuyy/ja-jp/cv/";
          },
        },{id: "post-hello-world",
        
          title: "Hello World",
        
        description: "ウェブサイトを公開しました。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/hello-world/";
          
        },
      },{id: "news-ウェブサイトを公開しました-ブログもぜひご覧ください",
          title: 'ウェブサイトを公開しました。ブログもぜひご覧ください。',
          description: "",
          section: "ニュース",},{
        id: 'social-github',
        title: 'GitHub',
        section: 'SNS',
        handler: () => {
          window.open("https://github.com/Amadeusyzh", "_blank");
        },
      },{
        id: 'social-rss',
        title: 'RSS Feed',
        section: 'SNS',
        handler: () => {
          window.open("/Takuyy/feed.xml", "_blank");
        },
      },{
        id: 'social-scholar',
        title: 'Google Scholar',
        section: 'SNS',
        handler: () => {
          window.open("https://scholar.google.com/citations?user=8wyZlsEAAAAJ", "_blank");
        },
      },{
          id: 'lang-en-us',
          title: 'en-us',
          section: '言語',
          handler: () => {
            window.location.href = "/Takuyy" + updatedUrl;
          },
        },{
          id: 'lang-zh-cn',
          title: 'zh-cn',
          section: '言語',
          handler: () => {
            window.location.href = "/Takuyy/zh-cn" + updatedUrl;
          },
        },{
      id: 'light-theme',
      title: 'ライトテーマ',
      description: 'ライトテーマに切り替える',
      section: 'テーマ',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: 'ダークテーマ',
      description: 'ダークテーマに切り替える',
      section: 'テーマ',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: 'システムのテーマ',
      description: 'システム設定に合わせる',
      section: 'テーマ',
      handler: () => {
        setThemeSetting("system");
      },
    },];
