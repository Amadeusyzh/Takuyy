
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
        },{id: "post-論文速報-2026-年-10-11-月-グラフィックス-エンジン-ニューラルレンダリング-世界モデル-身体性-ai-xr",
        
          title: "論文速報｜2026 年 10–11 月：グラフィックス、エンジン、ニューラルレンダリング、世界モデル、身体性 AI、XR",
        
        description: "論文速報 第 01 号：2026 年 10 月 1 日から 11 月 2 日に初めて公開された、検証済みの 42 本の論文を 6 つのカテゴリで紹介します。各論文について、何をするか、どう動くか、何が新しいか、コンピュータグラフィックスとどうつながるかを説明します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/paper-digest-01-2026-oct-nov/";
          
        },
      },{id: "post-学習ロードマップ-コンピュータグラフィックスから-3d-ガウシアンスプラッティング-世界モデル-身体性-ai-まで",
        
          title: "学習ロードマップ：コンピュータグラフィックスから 3D ガウシアンスプラッティング、世界モデル、身体性 AI まで",
        
        description: "このブログの地図です。6 つのシリーズと日付入りの論文速報コラムを順番に、各段階で何を学ぶかをまとめました。",
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
      },{id: "post-ai-とグラフィックスエンジン-ニューラルレンダリング-生成コンテンツ-ニューラルゲームエンジン",
        
          title: "AI とグラフィックスエンジン：ニューラルレンダリング、生成コンテンツ、ニューラルゲームエンジン",
        
        description: "2026 年 11 月時点で、ゲームエンジンのどの部分をネットワークが補助・置換しているか。DLSS/FSR/XeSS のアップスケーリングとフレーム生成、ニューラルマテリアルとテクスチャ圧縮、エンジン内のガウシアンスプラット、生成 3D アセット、エディタの中の LLM エージェント、GameNGen や Genie などのニューラルゲームエンジン、そして世界モデルとロボットのためのデータ工場としてのエンジンを扱います。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-engine-06-ai-meets-graphics-engines/";
          
        },
      },{id: "post-物理-シミュレーションエンジン-ゲーム物理からロボットシミュレータへ",
        
          title: "物理・シミュレーションエンジン：ゲーム物理からロボットシミュレータへ",
        
        description: "物理エンジンの 1 ステップの中身（ブロードフェーズ、GJK と EPA、接触マニフォールド、PGS/TGS/soft step/XPBD ソルバ、多関節体）を見たうえで、Isaac・MuJoCo・Newton・Genesis がエンジンをロボットシミュレータに変える方法、OpenUSD、ドメインランダム化を解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-engine-05-physics-and-simulation-engines/";
          
        },
      },{id: "post-プロダクションエンジンの内部-unreal-engine-5-unity-6-godot-4-bevy-ほか",
        
          title: "プロダクションエンジンの内部：Unreal Engine 5、Unity 6、Godot 4、Bevy ほか",
        
        description: "現代のエンジンは難題をどう解いているのか。Nanite のクラスター階層と LOD カット、Lumen のサーフェスキャッシュと距離場トレーシング、Virtual Shadow Maps、時間的アップスケーリング、Unity の Render Graph と GPU Resident Drawer、Godot の RenderingDevice、Bevy の抽出フェーズ、そしてそれらのソースコードの読み方を解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-engine-04-inside-production-engines/";
          
        },
      },{id: "post-ミニエンジンを作る-ブラウザ上の-webgpu-gltf-pbr-シャドウ-ecs",
        
          title: "ミニエンジンを作る: ブラウザ上の WebGPU、glTF、PBR、シャドウ、ECS",
        
        description: "実践チュートリアル: JavaScript と WGSL で書く小さくても本物のエンジン。固定タイムステップのループ、リソースマネージャ、glTF 2.0 ローダ、オービットカメラ、PBR シェーダ、シャドウマップ、最小限の ECS、パスリスト、GPU タイムスタンプ、デバッグ UI を扱い、Vulkan/C++ および Rust/wgpu での対応にも触れます。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-engine-03-build-a-mini-engine/";
          
        },
      },{id: "post-現代の-gpu-api-とレンダーグラフ",
        
          title: "現代の GPU API とレンダーグラフ",
        
        description: "エンジンは GPU とどう話すか：明示的 API（Vulkan、D3D12、Metal、WebGPU）、メモリと同期、最小の WebGPU プログラム、動くおもちゃのコンパイラ付きのレンダーグラフ、フォワード/ディファード/クラスタードライティング、ビジビリティバッファ、HZB カリングとメッシュレットによる GPU 駆動レンダリング、そして GPU のデバッグ。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/";
          
        },
      },{id: "post-ゲームエンジンの解剖-ループ-データ-ecs-ジョブ-ツール",
        
          title: "ゲームエンジンの解剖：ループ、データ、ECS、ジョブ、ツール",
        
        description: "ゲームエンジンは何でできているか：レイヤー構造、ゲームループと固定タイムステップ、フレーム予算、データ指向設計、ECS、シーングラフと空間構造、ジョブシステム、アセットパイプラインを、実行できるコードと実測した図で解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-engine-01-anatomy-of-an-engine/";
          
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
      },{id: "post-ar-vr-のための-3d-ビジョン-追跡-遅延-レジストレーション誤差",
        
          title: "AR/VR のための 3D ビジョン：追跡、遅延、レジストレーション誤差",
        
        description: "「3D ビジョンの基礎」の最終回：VIO と地図によるインサイドアウト 6DoF 追跡、モーション・トゥ・フォトン遅延と予測、後段リプロジェクション、レジストレーション誤差のバジェット、パススルーの再投影、ハンドトラッキングとアイトラッキング、平面とメッシュ、空間アンカーと再ローカライズ。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/3d-vision-10-3d-vision-for-ar-vr/";
          
        },
      },{id: "post-3d-再構成-古典的パイプラインからフィードフォワードモデルまで",
        
          title: "3D 再構成：古典的パイプラインからフィードフォワードモデルまで",
        
        description: "写真から表面へ：SfM、MVS、融合、メッシュ化からなる古典的パイプライン、TSDF 融合と Marching Cubes、スクリーン付きポアソン再構成、ニューラル表面（NeuS、Neuralangelo、2DGS）、フィードフォワード型の 3D 基盤モデル（DUSt3R、MASt3R、VGGT と 2025〜2026 年の後継）、そして DTU、Tanks and Temples、ETH3D での再構成の評価方法を、各ステップの NumPy コード付きで解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/3d-vision-09-3d-reconstruction-classic-to-feed-forward/";
          
        },
      },{id: "post-3d-表現-点-メッシュ-ボクセル-sdf-ニューラル場-ガウシアン",
        
          title: "3D 表現：点、メッシュ、ボクセル、SDF、ニューラル場、ガウシアン",
        
        description: "同じ形状を 9 通りに保存します。奥行きマップと多平面画像、点群、メッシュ、ボクセルグリッドと八分木、符号付き距離場と TSDF、ニューラル場と 3D ガウシアン。表現間の変換、メモリと精度のスケーリング（1 つのトーラスで実測）、どのタスクにどれを選ぶか、そして PointNet とスパース畳み込みの概要を扱います。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/3d-vision-08-3d-representations/";
          
        },
      },{id: "post-奥行き推定とマルチビューステレオ-センサー-平面掃引-patchmatch-学習型-mvs-単眼奥行き",
        
          title: "奥行き推定とマルチビューステレオ：センサー、平面掃引、PatchMatch、学習型 MVS、単眼奥行き",
        
        description: "姿勢付き画像から密な奥行きへ：奥行き・距離・視差、ステレオ、構造化光、Time-of-Flight、LiDAR の各センサー、コストボリュームによる平面掃引ステレオ、傾いた平面を使う PatchMatch マルチビューステレオ、MVSNet と soft-argmin、MiDaS から Depth Anything、メトリック奥行きモデルまでの単眼奥行き推定、TSDF による奥行き統合を、各ステップの NumPy コード付きで解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/3d-vision-07-depth-estimation-and-multi-view-stereo/";
          
        },
      },{id: "post-visual-slam-因子グラフ-オドメトリ-ループ閉じ込み-視覚慣性融合",
        
          title: "Visual SLAM：因子グラフ、オドメトリ、ループ閉じ込み、視覚慣性融合",
        
        description: "因子グラフ上の MAP 推定としての SLAM、フロントエンドとバックエンド、特徴点ベースと直接法の Visual Odometry、必要十分なリー群、ロバストカーネル付きの SE(3) 姿勢グラフ最適化、Bag of Words によるループ検出、フィルタと平滑化（EKF、MSCKF、スライディングウィンドウ）、IMU 事前積分と VIO、ORB-SLAM3・VINS・DSO・DROID-SLAM、そして 2024-2026 年の学習型・ガウシアン SLAM。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/3d-vision-06-visual-slam/";
          
        },
      },{id: "post-多視点幾何とバンドル調整-pnp-structure-from-motion-と-schur-補行列",
        
          title: "多視点幾何とバンドル調整：PnP、Structure-from-Motion と Schur 補行列",
        
        description: "2 視点から多視点へ：P3P・EPnP・RANSAC によるカメラの位置決め（resectioning）、バンドル調整のゼロからの導出（ヤコビアン、疎な正規方程式、Schur 補行列、Levenberg-Marquardt、ゲージの自由度、ロバストカーネル）、COLMAP 型のインクリメンタル SfM、回転平均と GLOMAP 型の全体位置推定によるグローバル SfM、そしてスケールの不定性。すべて合成シーン上で動く NumPy コード付きです。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/3d-vision-05-multi-view-geometry-and-bundle-adjustment/";
          
        },
      },{id: "post-2-視点幾何-エピポーラ拘束-相対姿勢-三角測量とステレオ",
        
          title: "2 視点幾何：エピポーラ拘束、相対姿勢、三角測量とステレオ",
        
        description: "3D ビジョンの基礎 第 4 回：エピポーラ拘束、基本行列と基礎行列、正規化 8 点・7 点・5 点アルゴリズム、E の分解とチラリティ（cheirality）検査、中点法・線形・最適三角測量、純回転と平面の退化、そしてステレオ：平行化、視差と奥行き、ブロックマッチングとセミグローバルマッチング。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/3d-vision-04-two-view-geometry/";
          
        },
      },{id: "post-特徴とマッチング-コーナー-sift-ransac-学習型マッチャー",
        
          title: "特徴とマッチング：コーナー、SIFT、RANSAC、学習型マッチャー",
        
        description: "2 枚の画像で同じ点を見つける方法：構造テンソルと Harris コーナー、スケール空間と SIFT、FAST/BRIEF/ORB、比率テスト、RANSAC とその後継（MSAC、LO-RANSAC、MAGSAC++）、SuperPoint、SuperGlue、LightGlue、LoFTR、RoMa、Lucas-Kanade と RAFT のオプティカルフロー、そしてマッチャーの評価法を、各ステップの NumPy コード付きで解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/3d-vision-03-features-and-matching/";
          
        },
      },{id: "post-カメラキャリブレーション-ホモグラフィ-zhang-の手法-そして結果をどこまで信じてよいか",
        
          title: "カメラキャリブレーション：ホモグラフィ、Zhang の手法、そして結果をどこまで信じてよいか",
        
        description: "チェッカーボードからカメラの内部パラメータとレンズ歪みを推定します。平面ホモグラフィと正規化 DLT、Zhang の閉形式解、Levenberg-Marquardt による精密化、再投影誤差とパラメータの不確かさ、キャリブレーションターゲットとサブピクセルコーナー、ステレオ平行化、ハンドアイ AX = XB、カメラ-IMU キャリブレーションを、合成データ上の NumPy と OpenCV のコードとともに解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/3d-vision-02-camera-calibration/";
          
        },
      },{id: "post-画像形成とカメラモデル-射影幾何-ピンホール-レンズ-座標系の約束事",
        
          title: "画像形成とカメラモデル：射影幾何、ピンホール、レンズ、座標系の約束事",
        
        description: "「3D ビジョンの基礎」シリーズ第 1 回：同次座標、無限遠点と消失点、ピンホールカメラ P = K[R|t] とその RQ 分解、Brown-Conrady と Kannala-Brandt の歪み、ローリングシャッター、そして OpenCV・OpenGL・COLMAP・NeRF の座標系の変換方法を扱います。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/3d-vision-01-image-formation-and-camera-models/";
          
        },
      },{id: "post-グラフィックス研究のフロンティア-2026-siggraph-siggraph-asia-と最新プレプリントの動向",
        
          title: "グラフィックス研究のフロンティア 2026：SIGGRAPH、SIGGRAPH Asia と最新プレプリントの動向",
        
        description: "2026 年のグラフィックス研究（SIGGRAPH 2026、SIGGRAPH Asia 2026、EGSR、I3D、SCA、arXiv プレプリント）を、一次情報で確認しながらトピック別にまとめた地図です。繰り返し現れる 4 つのアイデアの数学と、インタラクティブなエクスプローラーも収録しています。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-13-research-frontiers-2026/";
          
        },
      },{id: "post-微分可能レンダリングと逆レンダリング-ピクセルを通る勾配",
        
          title: "微分可能レンダリングと逆レンダリング：ピクセルを通る勾配",
        
        description: "画像の勾配が難しい理由（可視性がディラックのデルタを生む）、ソフトラスタライザ、nvdiffrast、エッジサンプリング、再パラメータ化、パス空間の手法がそれをどう解決するか、Mitsuba 3、逆レンダリングの実際、そして実行できる 3 つの PyTorch 実験を解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-12-differentiable-and-inverse-rendering/";
          
        },
      },{id: "post-リアルタイムレンダリングの技法-g-buffer-ソフトシャドウ-ao-反射-リアルタイム-gi-トーンマッピング",
        
          title: "リアルタイムレンダリングの技法：G-buffer、ソフトシャドウ、AO、反射、リアルタイム GI、トーンマッピング",
        
        description: "16 ms の 1 フレームを支えるアルゴリズム：遅延シェーディングと八面体法線エンコード、クラスター化ライトカリング、カスケードとソフトシャドウ（PCSS、VSM、EVSM）、SSAO/HBAO/GTAO と地平線積分、Hi-Z スクリーン空間反射、ライトマップ、SH 放射照度プローブ、DDGI とボクセルコーントレーシング、時間方向の履歴補正、HDR トーンマッピングと sRGB カーブ、そして GPU 性能の考え方。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-11-real-time-rendering-techniques/";
          
        },
      },{id: "post-ボリュームと関与媒質-霧-煙-雲-空-肌",
        
          title: "ボリュームと関与媒質：霧・煙・雲・空・肌",
        
        description: "消散係数とアルベド、Beer-Lambert 透過率、放射伝達方程式、位相関数とそのサンプリングコード、レイマーチング、delta / ratio tracking、ボリュームパストレーシング、OpenVDB、リアルタイムの霧・空・雲、表面下散乱、そして NeRF のアルファ合成が同じ積分の数値求積である理由。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-10-volumes-and-participating-media/";
          
        },
      },{id: "post-アニメーションとキャラクター-スプライン-回転-スキニング-ik-モーションマッチング-学習ベースのモーション",
        
          title: "アニメーションとキャラクター：スプライン、回転、スキニング、IK、モーションマッチング、学習ベースのモーション",
        
        description: "キーフレームのスプラインと弧長、slerp と squad、骨格と順運動学、線形ブレンドスキニングとデュアルクォータニオン・スキニング、ブレンドシェイプ、CCD と FABRIK、モーションキャプチャと SMPL、モーションマッチング、強化学習で訓練する物理ベースのキャラクター、生成的モーションを NumPy のコードとともに解説します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-09-animation-and-characters/";
          
        },
      },{id: "post-ジオメトリ処理-メッシュ-曲率-平滑化-細分割-再構成",
        
          title: "ジオメトリ処理：メッシュ、曲率、平滑化、細分割、再構成",
        
        description: "メッシュ表現とハーフエッジ構造、コタンジェント・ラプラシアンによる離散曲率、平滑化、Loop 細分割、QEM 簡略化、Tutte パラメータ化、Marching Squares と Marching Cubes、ポアソン再構成を、すべて NumPy で実装します。",
        section: "記事",
        handler: () => {
          
            window.location.href = "/Takuyy/ja-jp/blog/2026/graphics-08-geometry-processing/";
          
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
