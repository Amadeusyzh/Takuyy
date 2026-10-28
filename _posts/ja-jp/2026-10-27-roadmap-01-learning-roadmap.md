---
layout: post
title: "学習ロードマップ：コンピュータグラフィックスから 3D ガウシアンスプラッティング、世界モデル、身体性 AI まで"
date: 2026-10-27 21:00:00+0900
description: "このブログの地図です。4 つのシリーズを順番に、各段階で何を学ぶかをまとめました。"
categories: roadmap
tags: [roadmap]
featured: true
toc:
  sidebar: left
related_posts: false
mermaid:
  enabled: true
  zoomable: true
---

この記事はブログ全体の地図です。私は**身体性 AI、世界モデル、AR/VR、HCI、コンピュータグラフィックス**の交差点を研究している博士課程の学生です。これらの分野には、意外なほど一直線のストーリーがあります。まず画像がどのように作られるかを学び（グラフィックス）、写真からその過程を*逆算*する方法を学び（ニューラルレンダリング、3D ガウシアンスプラッティング）、世界がどう変化するかを*予測*するモデルを学び（世界モデル）、最後に世界の中に身体を置いて行動させます（身体性 AI）。

ブログはこの流れに沿った 4 つのシリーズで構成しています。すべての記事に日本語・英語・中国語の 3 バージョンがあり、数式の導出、実行できる短いコード、そして SIGGRAPH、CVPR/ICCV/ECCV、NeurIPS/ICLR/ICML、CoRL/RSS などのトップ会議・論文誌の代表的な論文へのリンクを載せています。各分野には、リポジトリ内に整理された文献リストもあります。

```mermaid
flowchart LR
  P[前提知識<br/>線形代数・確率・<br/>Python / C++・PyTorch] --> G
  subgraph G[1. コンピュータグラフィックス]
    G1[数学と座標変換] --> G2[ラスタライゼーション] --> G3[シェーディング] --> G4[PBR] --> G5[パストレーシング] --> G6[リアルタイム RT]
    G4 --> G7[シミュレーション]
  end
  G --> N
  subgraph N[2. ニューラルレンダリング]
    N1[カメラと SfM] --> N2[NeRF] --> N3[高速な放射場] --> N4[3D ガウシアンスプラッティング] --> N5[3DGS の最前線]
  end
  N --> W
  subgraph W[3. 世界モデル]
    W1[モデルベース強化学習] --> W2[生成モデル] --> W3[動画世界シミュレータ] --> W4[3D/4D 世界生成] --> W5[JEPA と評価]
  end
  G7 --> E
  W --> E
  subgraph E[4. 身体性 AI]
    E1[ロボティクスの基礎] --> E2[ロボットの強化学習] --> E3[シミュレーション] --> E4[模倣学習] --> E5[VLA モデル] --> E6[身体性 AI x XR/HCI]
  end
```

## ステージ 0：前提知識

始める前にすべてを身につける必要はありませんが、いずれどれにも出会います。

- **線形代数**：ベクトル、行列、固有値分解、SVD。グラフィックスとビジョンの多くは $4\times 4$ 行列と最小二乗法です。
- **微積分と確率**：半球上の積分、期待値、モンテカルロ推定 $\hat I = \frac{1}{N}\sum_i f(x_i)/p(x_i)$、ガウス分布。
- **プログラミング**：ほとんどの記事で Python（NumPy、PyTorch）を使い、レンダリングでは GLSL と C++ も少し使います。

## ステージ 1：ゼロから学ぶコンピュータグラフィックス

画像がどのように作られるか：座標変換とラスタライゼーションから、物理ベースの光輸送とシミュレーションまで。この後のすべての土台です。NeRF はボリュームレンダリングであり、3DGS は微分可能なラスタライザであり、ロボットシミュレータは物理エンジンとレンダラーの組み合わせです。

1. [ロードマップと数学の道具箱]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})
2. [ラスタライゼーション]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})
3. [シェーディングとテクスチャ]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})
4. [物理ベースレンダリング]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})
5. [レイトレーシングとパストレーシング]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})
6. [リアルタイムレイトレーシング]({{ '/blog/2026/graphics-06-real-time-ray-tracing/' | relative_url }})
7. [物理ベースシミュレーション]({{ '/blog/2026/graphics-07-physically-based-simulation/' | relative_url }})

## ステージ 2：ニューラルレンダリングと 3D ガウシアンスプラッティング

レンダリングの過程を逆にたどります。写真からカメラを復元し、それらの写真を再現する放射場（NeRF）や 3D ガウシアンの集合（3DGS）をフィットさせます。これらの表現は、いまや AR/VR の 3D キャプチャや多くの 3D 世界生成システムの中核になっています。

1. [カメラと多視点幾何]({{ '/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/' | relative_url }})
2. [NeRF]({{ '/blog/2026/neural-rendering-02-nerf/' | relative_url }})
3. [高速な放射場]({{ '/blog/2026/neural-rendering-03-fast-radiance-fields/' | relative_url }})
4. [3D ガウシアンスプラッティング]({{ '/blog/2026/neural-rendering-04-3d-gaussian-splatting/' | relative_url }})
5. [3DGS の最前線]({{ '/blog/2026/neural-rendering-05-3dgs-frontiers/' | relative_url }})
6. [撮影から VR まで：ハンズオン]({{ '/blog/2026/neural-rendering-06-capture-to-vr-tutorial/' | relative_url }})

## ステージ 3：世界モデル

世界を再構成することから、世界を*予測*することへ。計画のための潜在ダイナミクスモデル、生成モデルの道具箱（VAE、拡散モデル、フローマッチング、Transformer）、Genie のような動画世界シミュレータ、明示的な 3D/4D 世界生成、そして JEPA に代表される予測的表現学習の考え方を扱います。

1. [世界モデルとは何か]({{ '/blog/2026/world-models-01-what-is-a-world-model/' | relative_url }})
2. [生成モデルの基礎]({{ '/blog/2026/world-models-02-generative-modeling-foundations/' | relative_url }})
3. [動画世界シミュレータ]({{ '/blog/2026/world-models-03-video-world-simulators/' | relative_url }})
4. [3D・4D 世界生成]({{ '/blog/2026/world-models-04-3d-and-4d-world-generation/' | relative_url }})
5. [JEPA、評価、未解決問題]({{ '/blog/2026/world-models-05-jepa-evaluation-and-open-problems/' | relative_url }})

## ステージ 4：身体性 AI

モデルに身体を与えます。運動学と制御、強化学習と sim2real、シミュレータ、模倣学習、視覚・言語・行動（VLA）モデル、そして最後に身体性 AI が XR やヒューマンコンピュータインタラクションとどうつながるかを考えます。

1. [ロボティクスの基礎]({{ '/blog/2026/embodied-ai-01-robotics-foundations/' | relative_url }})
2. [ロボットのための強化学習]({{ '/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/' | relative_url }})
3. [シミュレーション基盤]({{ '/blog/2026/embodied-ai-03-simulation-platforms/' | relative_url }})
4. [模倣学習]({{ '/blog/2026/embodied-ai-04-imitation-learning/' | relative_url }})
5. [視覚・言語・行動モデル]({{ '/blog/2026/embodied-ai-05-vision-language-action-models/' | relative_url }})
6. [身体性 AI と XR・HCI]({{ '/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/' | relative_url }})

## 学習ペースの目安

| ステージ | 記事数 | 目安の期間 | マイルストーン |
| --- | --- | --- | --- |
| グラフィックス | 7 | 4〜6 週間 | ソフトウェアラスタライザと小さなパストレーサーを書く |
| ニューラルレンダリング | 6 | 3〜4 週間 | 自分で撮影したデータで 3DGS を学習し、VR で見る |
| 世界モデル | 5 | 3〜4 週間 | 小さな潜在ダイナミクスモデルか DDPM を学習する |
| 身体性 AI | 6 | 4〜6 週間 | シミュレーションでデモンストレーションから方策を学習する |

## 触ってみる

トップページの[インタラクティブラボ]({{ '/' | relative_url }}#lab)には、このブログのために作ったデモがあります。GPU パストレーサー（GGX、NEE + MIS、à-trous デノイズ）、*ガウシアンワールド*（編集・再ライティングできる 3D ガウシアンのオープンワールド）、XPBD 布シミュレーション、視線追跡型の中心窩レンダリングです。各記事では、関係するデモへのリンクを適宜載せています。

## カテゴリから探す

[グラフィックス]({{ '/blog/category/graphics/' | relative_url }}) · [ニューラルレンダリング]({{ '/blog/category/neural-rendering/' | relative_url }}) · [世界モデル]({{ '/blog/category/world-models/' | relative_url }}) · [身体性 AI]({{ '/blog/category/embodied-ai/' | relative_url }})

学びながらシリーズを少しずつ広げていきます。誤りの指摘や提案を歓迎します。
