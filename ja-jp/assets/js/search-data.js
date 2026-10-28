
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
          description: "右のボタンから PDF 版をダウンロードできます。",
          section: "ナビゲーション",
          handler: () => {
            window.location.href = "/Takuyy/ja-jp/cv/";
          },
        },{id: "post-学習ロードマップ-コンピュータグラフィックスから-3d-ガウシアンスプラッティング-世界モデル-身体性-ai-まで",
        
          title: "学習ロードマップ：コンピュータグラフィックスから 3D ガウシアンスプラッティング、世界モデル、身体性 AI まで",
        
        description: "このブログの地図です。4 つのシリーズを順番に、各段階で何を学ぶかをまとめました。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/roadmap-01-learning-roadmap/";
          
        },
      },{id: "post-身体性-ai-xr-hci-データ-操作者-パートナーとしての人",
        
          title: "身体性 AI × XR・HCI：データ、操作者、パートナーとしての人",
        
        description: "人のモーションキャプチャとウェアラブルセンシング、一人称視点データ（Ego4D、Project Aria）、ロボットのデータ収集のための VR/AR 遠隔操作、ヒューマンロボットインタラクション、デジタルツインと複合現実インターフェース、そして身体性 AI・世界モデル・AR/VR・HCI・グラフィックスが交わる研究機会を紹介します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/";
          
        },
      },{id: "post-vision-language-action-モデル-rt-2-openvla-pi0-gr00t-gemini-robotics",
        
          title: "Vision-Language-Action モデル：RT-2、OpenVLA、pi0、GR00T、Gemini Robotics",
        
        description: "ロボット基盤モデルの作り方：RT-1・RT-2 から Octo、OpenVLA、pi0/pi0.5、GR00T N1、Gemini Robotics まで。行動のトークン化とフローマッチングの行動ヘッド、クロスエンボディメント学習、評価、そして世界モデルがロボット学習にどう入ってくるかを解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/embodied-ai-05-vision-language-action-models/";
          
        },
      },{id: "post-模倣学習-行動クローニング-dagger-act-diffusion-policy",
        
          title: "模倣学習：行動クローニング、DAgger、ACT、Diffusion Policy",
        
        description: "デモンストレーションからロボットのスキルを学ぶ：共変量シフトと DAgger、Transformer によるアクションチャンキング（ACT/ALOHA）、Diffusion Policy、遠隔操作と UMI によるデータ収集、大規模なクロスエンボディメントデータセットを、実行可能な拡散方策の学習例とともに解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/embodied-ai-04-imitation-learning/";
          
        },
      },{id: "post-身体性-ai-のシミュレーションプラットフォーム-mujoco-isaac-habitat-maniskill-genesis",
        
          title: "身体性 AI のシミュレーションプラットフォーム：MuJoCo、Isaac、Habitat、ManiSkill、Genesis",
        
        description: "ロボットシミュレータが実際に何を計算しているのか（動力学、接触、レンダリング、センサ）、現在の主要なプラットフォームとベンチマーク、微分可能・GPU 並列シミュレーション、そして MuJoCo/MJX の実践例を紹介します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/embodied-ai-03-simulation-platforms/";
          
        },
      },{id: "post-ロボットのための強化学習-mdp-から-ppo-sac-sim-to-real-まで",
        
          title: "ロボットのための強化学習：MDP から PPO、SAC、Sim-to-Real まで",
        
        description: "MDP、価値関数、方策勾配、PPO と SAC、報酬設計、ドメインランダム化、そして Sim-to-Real の RL を主流にした脚移動の成果を、コンパクトな PyTorch の PPO とともに解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/";
          
        },
      },{id: "post-ロボティクスの基礎-座標変換-運動学-制御-計画",
        
          title: "ロボティクスの基礎：座標変換、運動学、制御、計画",
        
        description: "SE(3)、順・逆運動学、ヤコビアン、動力学の概観、PID とインピーダンス制御、A*/RRT による計画を、3 リンクアームの NumPy コード付きで解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/embodied-ai-01-robotics-foundations/";
          
        },
      },{id: "post-生成ではなく予測を-jepa-世界モデルの評価-そして未解決の課題",
        
          title: "生成ではなく予測を？JEPA、世界モデルの評価、そして未解決の課題",
        
        description: "LeCun が示す自律的機械知能への道、I-JEPA、V-JEPA と V-JEPA 2、予測型対生成型の論争、世界モデルの評価方法（物理、制御可能性、プランニング）、そして身体性AI へとつながる未解決の課題。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/world-models-05-jepa-evaluation-and-open-problems/";
          
        },
      },{id: "post-明示的な世界-3d-4d-世界生成",
        
          title: "明示的な世界：3D・4D 世界生成",
        
        description: "明示的な 3D・4D 世界の生成：スコア蒸留（DreamFusion、VSD）、マルチビュー拡散、インペインティングと深度によるシーン拡張（Text2Room、LucidDreamer、WonderJourney、WonderWorld）、ガウシアンによるシーン生成、4D 生成、World Labs の Marble、そしてピクセル空間の動画世界モデルとのトレードオフを解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/world-models-04-3d-and-4d-world-generation/";
          
        },
      },{id: "post-世界シミュレーションとしての動画生成-sora-genie-gamengen-そしてその先へ",
        
          title: "世界シミュレーションとしての動画生成：Sora、Genie、GameNGen、そしてその先へ",
        
        description: "動画生成モデルはいかにしてインタラクティブな世界シミュレータになったのか：Sora の技術レポート、Genie 1-3、GameNGen、UniSim、GAIA-1、NVIDIA Cosmos、潜在行動モデル、そして記憶・一貫性・物理という未解決の課題。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/world-models-03-video-world-simulators/";
          
        },
      },{id: "post-生成モデルの道具箱-vae-トークナイザ-トランスフォーマー-拡散モデル-フローマッチング",
        
          title: "生成モデルの道具箱：VAE、トークナイザ、トランスフォーマー、拡散モデル、フローマッチング",
        
        description: "現代の世界モデルを構成する生成モデル：VAE と ELBO、VQ-VAE トークナイザ、自己回帰トランスフォーマー、DDPM、スコア/SDE の視点、DDIM、潜在拡散、classifier-free guidance、フローマッチング、DiT を、実行可能な PyTorch コードとともに解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/world-models-02-generative-modeling-foundations/";
          
        },
      },{id: "post-世界モデルとは何か-dyna-から-dreamer-muzero-まで",
        
          title: "世界モデルとは何か？ Dyna から Dreamer、MuZero まで",
        
        description: "世界モデルの定義と歴史：MDP、モデルベース強化学習、Ha &amp; Schmidhuber の World Models、PlaNet、Dreamer V1-V3、MuZero を、PyTorch による RSSM と想像ロールアウトの実装とともに解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/world-models-01-what-is-a-world-model/";
          
        },
      },{id: "post-スマホ撮影から-vr-まで-3d-gaussian-splatting-ハンズオンチュートリアル",
        
          title: "スマホ撮影から VR まで：3D Gaussian Splatting ハンズオンチュートリアル",
        
        description: "実践的なステップバイステップのワークフローです：写真や動画を撮影し、COLMAP を実行し、公式コード、gsplat、または nerfstudio の splatfacto で 3DGS を学習させ、.ply をクリーンアップしてエクスポートし、Web と VR ヘッドセットで表示します。よくある失敗パターンとその対処法も紹介します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/neural-rendering-06-capture-to-vr-tutorial/";
          
        },
      },{id: "post-3dgs-の先へ-gaussian-splatting-研究フロンティアの地図",
        
          title: "3DGS の先へ：Gaussian Splatting 研究フロンティアの地図",
        
        description: "3D Gaussian Splatting 以降に登場した研究の体系的なサーベイです：アンチエイリアシング、表面、動的シーン、圧縮、SLAM、フィードフォワード再構成、生成、リライティング、物理、セマンティクス、AR/VR について、各方向の核となるアイデアと代表的な論文を紹介します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/neural-rendering-05-3dgs-frontiers/";
          
        },
      },{id: "post-3d-gaussian-splatting-徹底解説",
        
          title: "3D Gaussian Splatting 徹底解説",
        
        description: "3DGS の手法の全体像：ガウシアンのパラメータ、回転とスケールからの共分散、ヤコビ行列を用いた EWA 投影、0.3 のローパスフィルタ、タイルベースの微分可能ラスタライズ、アルファブレンディングと勾配、適応的密度制御、学習レシピを Python コード付きで解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/neural-rendering-04-3d-gaussian-splatting/";
          
        },
      },{id: "post-高速な放射輝度場-グリッド-テンソル-ハッシュエンコーディング",
        
          title: "高速な放射輝度場：グリッド、テンソル、ハッシュエンコーディング",
        
        description: "NeRF がなぜ遅いのか、そして明示的表現とハイブリッド表現がそれをどう解決したのかを解説します：Plenoxels、DVGO、TensoRF、Instant-NGP のマルチ解像度ハッシュエンコーディング（PyTorch コード付き）、Zip-NeRF、そして nerfstudio ツールボックス。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/neural-rendering-03-fast-radiance-fields/";
          
        },
      },{id: "post-nerf-ニューラル放射輝度場と微分可能なボリュームレンダリング",
        
          title: "NeRF：ニューラル放射輝度場と微分可能なボリュームレンダリング",
        
        description: "ボリュームレンダリング方程式とその数値求積、位置エンコーディング、NeRF の MLP、階層的サンプリングと光度損失を解説し、最小限の PyTorch NeRF 実装と、後続研究の Mip-NeRF、Mip-NeRF 360、NeRF in the Wild を紹介します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/neural-rendering-02-nerf/";
          
        },
      },{id: "post-カメラと多視点幾何-ピクセルから姿勢へ",
        
          title: "カメラと多視点幾何：ピクセルから姿勢へ",
        
        description: "ピンホールカメラ、内部パラメータと外部パラメータ、レンズ歪み、エピポーラ幾何、8点アルゴリズム、三角測量、バンドル調整、COLMAP による Structure-from-Motion、多視点ステレオを NumPy コード付きで解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/";
          
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
        id: 'social-cv',
        title: 'CV',
        section: 'SNS',
        handler: () => {
          window.open("/Takuyy/assets/pdf/ja-jp//assets/pdf/[LANG]/cv.pdf", "_blank");
        },
      },{
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
