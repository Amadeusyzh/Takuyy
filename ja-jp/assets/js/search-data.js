
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
        },{id: "post-物理ベースシミュレーション-粒子-布-pbd-と-xpbd",
        
          title: "物理ベースシミュレーション：粒子、布、PBD と XPBD",
        
        description: "時間積分法、質点-バネによる布、Position Based Dynamics、そして XPBD の完全な導出を、NumPy の布ソルバーとともに解説し、剛体と粒子法流体も概観します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-07-physically-based-simulation/";
          
        },
      },{id: "post-リアルタイムレイトレーシング-rt-ハードウェア-デノイズ-restir-ニューラルキャッシュ",
        
          title: "リアルタイムレイトレーシング：RT ハードウェア、デノイズ、ReSTIR、ニューラルキャッシュ",
        
        description: "ゲームが 1 ピクセル 1 サンプルでパストレーシングする仕組み：加速構造と RT コア、ハイブリッドパイプライン、時間的再利用、à-trous/SVGF デノイズ、ReSTIR リサンプリング、TAA、DLSS、ニューラル放射輝度キャッシュ。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-06-real-time-ray-tracing/";
          
        },
      },{id: "post-レイトレーシングとパストレーシング-交差判定から不偏なグローバルイルミネーションまで",
        
          title: "レイトレーシングとパストレーシング：交差判定から不偏なグローバルイルミネーションまで",
        
        description: "レイと球の交差判定と Möller-Trumbore 法、SAH による BVH、モンテカルロ積分、重点的サンプリング、ロシアンルーレット、次イベント推定と MIS を学び、最後にコンパクトな NumPy パストレーサーを実装します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-05-ray-and-path-tracing/";
          
        },
      },{id: "post-物理ベースレンダリング-放射測定-レンダリング方程式-ggx",
        
          title: "物理ベースレンダリング：放射測定、レンダリング方程式、GGX",
        
        description: "ワットから放射輝度へ。レンダリング方程式、BRDF の性質、GGX マイクロファセットモデル、メタリック・ラフネスのワークフロー、split-sum によるイメージベースドライティングを、数値検証と GLSL シェーダー付きで解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-04-physically-based-rendering/";
          
        },
      },{id: "post-シェーディングとテクスチャ-ライティングモデル-法線マップ-フィルタリング-シャドウ",
        
          title: "シェーディングとテクスチャ：ライティングモデル、法線マップ、フィルタリング、シャドウ",
        
        description: "Lambert・Phong・Blinn-Phong、フラット／Gouraud／Phong シェーディング、UV と接空間、ミップマップと異方性フィルタリング、バイアスと PCF を用いたシャドウマッピングを NumPy と GLSL のコードで解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-03-shading-and-textures/";
          
        },
      },{id: "post-ラスタライゼーション-三角形からピクセルへ",
        
          title: "ラスタライゼーション：三角形からピクセルへ",
        
        description: "MVP パイプライン、透視投影行列の段階的な導出、クリッピング、エッジ関数、パースペクティブ補正補間、Z バッファ、アンチエイリアシング、そして NumPy による完全なソフトウェアラスタライザ。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-02-rasterization/";
          
        },
      },{id: "post-グラフィックスのロードマップと数学ツールキット",
        
          title: "グラフィックスのロードマップと数学ツールキット",
        
        description: "コンピュータグラフィックスがここからニューラルレンダリングへとつながる道筋と、最初に必要な線形代数：ベクトル、同次座標、回転、座標空間、法線の変換。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-01-roadmap-and-math/";
          
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
