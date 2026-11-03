---
layout: post
title: "プロダクションエンジンの内部：Unreal Engine 5、Unity 6、Godot 4、Bevy ほか"
description: "現代のエンジンは難題をどう解いているのか。Nanite のクラスター階層と LOD カット、Lumen のサーフェスキャッシュと距離場トレーシング、Virtual Shadow Maps、時間的アップスケーリング、Unity の Render Graph と GPU Resident Drawer、Godot の RenderingDevice、Bevy の抽出フェーズ、そしてそれらのソースコードの読み方を解説します。"
date: 2026-10-27 13:04:00+0900
categories: graphics-engine
tags: [unreal-engine, nanite, lumen, virtual-shadow-maps, unity, godot, bevy, engine]
series: graphics-engine
series_order: 4
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[前回の記事]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})では、ミニエンジンを作りました。ループが 1 つ、シャドウマップが 1 枚、定数のアンビエント項があり、オブジェクトごとに 1 回の描画コール（draw call）を発行する CPU ループで動くものです。プロダクションエンジンも同じ問題に直面しますが、そのスケールでは単純な解法が破綻します。ソースの三角形は数十億、動的なグローバルイルミネーション、あらゆる距離でシャープな影、メモリに収まらないオープンワールド、そしてツールを必要とする数百人規模のチームです。この記事では 4 つのエンジンとそのほかいくつかを開き、これらの問題を*どのように*解いているかを、公式ドキュメントと開発者自身による講演をもとに見ていきます。アルゴリズムそのものが核心となる部分（Nanite の LOD カット、スフィアトレーシング、仮想シャドウマップのページ）では、動作を確認できるようにトイ版を作り直します。

バージョン情報はすべて **2026 年 11 月時点**のものです。エンジンの進化は速いので、リンク先のリリースノートを確認してください。

## 前提知識

- [記事 01]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})（エンジンの階層、ECS）、[記事 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})（レンダーグラフ、ビジビリティバッファ、GPU 駆動レンダリング）、[記事 03]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})（動作するパイプライン）。
- [グラフィックス記事 08]({{ '/blog/2026/graphics-08-geometry-processing/' | relative_url }})のレベルオブディテール（level of detail）とメッシュ簡略化。[グラフィックス記事 05]({{ '/blog/2026/graphics-05-ray-and-path-tracing/' | relative_url }})のグローバルイルミネーション（global illumination）と、[グラフィックス記事 11]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }})のリアルタイム技術。
- トイ実験用の Python と NumPy。

## 1. Unreal Engine 5

Unreal Engine 5（UE5）は C++ で書かれ、その上にビジュアルスクリプティングの Blueprint が載っています。ソースコード全体は、Unreal Engine EULA に同意すれば誰でも GitHub で入手できます。レンダリングは 2021〜2022 年に相次いで導入された 3 つのシステムを軸に構築されています。**Nanite**（仮想化ジオメトリ、virtualized geometry）、**Lumen**（動的グローバルイルミネーション）、**Virtual Shadow Maps** です。これらはセットとして設計されています。Nanite が微細なジオメトリのビジビリティバッファ（visibility buffer）を生成し、Virtual Shadow Maps が同じジオメトリを非常に高解像度のシャドウページに描画し、Lumen が事前計算なしでそれを照らします。

### 1.1 Nanite：仮想化ジオメトリ

**問題。** 映画品質のアセットは数百万個の三角形を持つことがあります。オブジェクトが数百ピクセルしか占めないときにそのすべてを描くのは無駄です。また、従来の離散 LOD（メッシュごとに数種類の簡略版を事前に用意し、距離で切り替える方式）は切り替わりが目に見えてしまううえ、手前側は完全なディテールが必要で奥側はほとんど不要という*大きな*オブジェクトを簡略化することもできません。Karis、Stubbe、Wihlidal が SIGGRAPH 2021 Advances コースで発表した Nanite の答え（[*A Deep Dive into Nanite Virtualized Geometry*](https://advances.realtimerendering.com/s2021/index.html)）は、レベルオブディテールを**クラスター単位**にし、毎フレーム GPU 上で選択することです。これにより、描画される三角形の数は元アセットの大きさではなくピクセル数に追従します。

**階層の構築（オフライン）。** メッシュは最大 128 三角形の**クラスター**（cluster）に分割されます。そのうえで、レベルごとに次の処理を行います。

1. 隣接するクラスターをまとめて**グループ**にします。
2. 各グループを統合し、グループの外側の境界を**ロック**（境界の頂点は動かせない）したまま、三角形数が**約半分**になるまで**簡略化**します。
3. 簡略化したグループを再び分割して、より粗い新しいクラスターを作ります。これが次のレベルの入力になります。

次のレベルでは*異なる*グループが形成されるため、あるレベルでロックされていた境界は、次のレベルではグループの内部に入り、そこで簡略化されます。ロックしても境界が永久にフル解像度のまま残らないのはこのためです。また、粗いクラスターが複数の親グループを持ち得るのもこのためで、階層は木ではなく**有向非巡回グラフ**（directed acyclic graph、DAG）になります。各クラスターは、自身を生成した簡略化の**幾何誤差**（geometric error、ワールド単位）を保持し、誤差は**単調**（monotonic）にされます。つまり、親の誤差が子の誤差より小さくなることはありません。

この本質を 1 次元で作り直してみましょう。ここでの「メッシュ」は 128 セグメントの地形プロファイルで（各セグメントが三角形の役割を担います）、8 セグメントずつの 16 クラスターに分けます。各レベルで兄弟のペアを統合し、グループの両端をロックしたまま貪欲な頂点除去によってセグメント数を半分にし、元のプロファイルまでの最大の垂直距離を誤差として記録します。

```python
import numpy as np

xs = np.linspace(0.0, 16.0, 129)                 # 128 segments, 8 per cluster
h = (1.2 * np.sin(0.45 * xs) + 0.5 * np.sin(1.7 * xs + 1)
     + 0.18 * np.sin(4.3 * xs + 2) + 0.07 * np.sin(9.1 * xs + 0.5))

def max_dev(a, b):
    """Largest vertical distance between the original samples a..b and the segment a-b."""
    t = (xs[a:b + 1] - xs[a]) / (xs[b] - xs[a])
    return float(np.max(np.abs(h[a:b + 1] - (h[a] + t * (h[b] - h[a])))))

def simplify(verts, target_segments):
    """Greedy vertex removal; the first and last vertex are locked."""
    verts = list(verts)
    while len(verts) - 1 > target_segments:
        costs = [max_dev(verts[i - 1], verts[i + 1]) for i in range(1, len(verts) - 1)]
        del verts[1 + int(np.argmin(costs))]
    err = max(max_dev(verts[i], verts[i + 1]) for i in range(len(verts) - 1))
    return verts, err

# Level 0: 16 clusters of 8 segments with error 0. Each level: merge pairs, halve, lock the ends.
levels = [[dict(verts=list(range(8 * c, 8 * c + 9)), err=0.0, children=[]) for c in range(16)]]
while len(levels[-1]) > 1:
    prev, nxt = levels[-1], []
    for g in range(0, len(prev), 2):
        a, b = prev[g], prev[g + 1]
        verts, err = simplify(a["verts"] + b["verts"][1:], 8)
        nxt.append(dict(verts=verts, err=max(err, a["err"], b["err"]), children=[a, b]))
    levels.append(nxt)

for i, lv in enumerate(levels):
    print(f"level {i}: {len(lv):2d} clusters, max error {max(c['err'] for c in lv):.4f} m")
```

1 次元では各グループの内部が頂点 1 個だけなので、この階層はたまたま木になります。曲面では、古い境界をまたぐ再グループ化によって DAG が生じます。正しさのために重要な 2 つの性質、**グループ境界のロック**と**誤差の単調性**は同じです。次の図は、このコードが構築する階層を描いたものです。下から上へ見てクラスター数が半分になっていく様子と、各レベルでの黒い目盛りの位置（ロックされた境界に対応します）に注目してください。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-cluster-hierarchy.svg" caption="スクリプトで計算したトイ階層。レベル 0（最下段）には 8 セグメントのクラスターが 16 個あり、上のレベルに行くごとにクラスター数は半分になり、各クラスターは再び 8 セグメントを持ちます。紫とオレンジがクラスターごとに交互に変わります。黒い目盛りはクラスターの端で、グループ境界がロックされているため常に元の頂点です。各行の数字はそのレベルの最大誤差（メートル）で、灰色の破線は元のプロファイルです。" %}

**カットの選択（毎フレーム、GPU 上）。** クラスターのワールド空間での誤差 $\varepsilon$ は、透視投影によってスクリーン空間の誤差になります。垂直解像度を $H$ ピクセル、視野角を $\theta$ とすると、距離 $d$ における 1 ワールド単位は $K/d$ ピクセルを占めます（$K = H / (2 \tan(\theta/2))$）。したがって

$$
\varepsilon_{\text{px}} = \frac{\varepsilon\, K}{d}, \qquad d = \max\big(\lVert \mathbf{c} - \mathbf{e} \rVert - r,\ d_{\min}\big),
$$

となります。ここで距離には、視点 $\mathbf{e}$ からクラスターの境界球（中心 $\mathbf{c}$、半径 $r$）の最近点までの距離を使います。これは保守的な見積もりです。$d_{\min}$ は、カメラが境界球の内側に入ったときにゼロ除算を避けるための小さな下限値です。クラスターが描画されるのは、そのクラスター自身の誤差が十分小さく、かつ親の誤差は小さくないときです。

$$
\varepsilon_{\text{px}}(\text{cluster}) \le \tau \;<\; \varepsilon_{\text{px}}(\text{parent}),
$$

閾値 $\tau$ はおよそ 1 ピクセルです。描画されるクラスターの集合を、DAG を貫く**カット**（cut）と呼びます。誤差が単調なので、ルートから葉へのどの経路もカットをちょうど 1 回だけ横切り、したがって曲面の各部分は 1 つの解像度でちょうど 1 回描画されます。さらに、同じグループのクラスターは親の誤差を共有するため、必ず一緒に切り替わり（同じグループのクラスターが、$d$ の計算に同じ境界球を使うことが前提です）、ロックされた境界がそろいます。つまり**ひび割れ（crack）は生じません**。決定的に重要なのは、このテストが*局所的*であることです。各クラスターは、ルートからの走査なしに、コンピュートシェーダのスレッドごとに独立して評価できます（Nanite は素早くカリングするために、クラスターの境界に対する階層を依然として使います）。

**計算例。** $H = 1080$、$\theta = 60°$ のとき、$K = 1080/(2 \tan 30°) \approx 935$ ピクセルです。$\varepsilon = 0.05$ m のクラスターは、$d = 0.05 \cdot 935 \approx 47$ m で 1 ピクセルに投影されます。それより近ければ子に細分化しなければならず、遠ければ親（たとえば $\varepsilon = 0.12$ m で 112 m で切り替わるもの）が引き継げます。

```python
K = 1080 / (2 * np.tan(np.radians(30)))         # pixels per world unit at distance 1

def select_cut(node, cam, tau=1.0):
    v = node["verts"]
    lo, hi = v[0], v[-1]
    hmin, hmax = h[lo:hi + 1].min(), h[lo:hi + 1].max()
    cx, cy = (xs[lo] + xs[hi]) / 2, (hmin + hmax) / 2
    r = 0.5 * np.hypot(xs[hi] - xs[lo], hmax - hmin)
    d = max(np.hypot(cx - cam[0], cy - cam[1]) - r, 1e-3)
    if node["err"] * K / d <= tau or not node["children"]:
        return [node]
    return [c for child in node["children"] for c in select_cut(child, cam, tau)]

for D in (5.0, 60.0, 500.0):                     # camera to the left of the terrain, 2 m high
    cut = select_cut(levels[-1][0], cam=(-D, 2.0))
    print(f"camera {D:5.0f} m away: {len(cut):2d} clusters, {sum(len(c['verts']) - 1 for c in cut):3d} segments")
```

1 次元のトイでは、ルートから走査します。GPU 版では同じ不等式をクラスターごとに並列に評価します。スクリプトを実行してみてください。カメラが近いと、手前には細かいクラスターが、奥には粗いクラスターが残り、カメラが遠ざかるにつれてセグメント数が減ります。次の 1 枚目の図では、上段のポリライン（選択された各クラスターのレベルで色分けされ、濃いほど細かい）を、下段の階層で強調表示された四角と対応させて見てください。2 枚目の図は不等式 $\varepsilon K / d \le \tau$ を描いたもので、各レベルの直線が破線 $\tau = 1$ px と交わる距離に注目してください。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-lod-cut.svg" caption="地形の左 25 m（左）と 100 m（右）にカメラを置き、τ = 1 px としたときに `select_cut` が選ぶカット。上：描画されるポリライン。選択された各クラスターのレベルで色分けしています（濃いほど細かい）。下：カットを強調表示した階層。ルートから葉へのどの経路もカットをちょうど 1 回横切ります。遠いカメラではどこでも粗いレベルが使われます（100 m では 5 クラスター・40 セグメント、25 m では 13 クラスター・104 セグメント）。1 つのビューの中でも、レベルは距離だけでなく各クラスター自身の誤差で決まります。25 m では、x = 6-8 の平らな区間はすでにレベル 1 に簡略化されていますが、それより遠い起伏の大きい区間（x = 8-10、12-14）はまだレベル 0 を必要とします。" %}

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-error-distance.svg" caption="左：各レベルの最大誤差 $\varepsilon$ から求めた投影誤差 $\varepsilon K / d$ と距離の関係（両対数のため、各レベルは傾き −1 の直線になります）。直線が τ = 1 px（破線）を下回る位置で、そのレベルが許容可能になります。右：選択されたカットのセグメント数とカメラ距離の関係を `select_cut` で計算したもの。ディテールは、少数の大きな離散 LOD ステップではなく、距離とともに滑らかに減少します。" %}

では実際に試してみましょう。このウィジェットは、同じ構築処理を JavaScript で実行します。カメラと閾値を動かし、*独立した LOD レベル*に切り替えてみてください。すると、各 1 m の領域が、プロファイル全体を別々に簡略化したコピーからレベルを選ぶようになります。これは素朴なオブジェクト単位やチャンク単位の LOD と同じ方式で、隣り合う領域が異なるレベルを選んだ場所にはひび割れが現れます。ウィジェットの後の静止画は、そのようなひび割れの 1 つを拡大したものです。

{% include widget.liquid name="graphics-engine-nanite-lod" height="520" caption="1 次元の Nanite 風階層。カメラのスライダー（対数スケール）と、ピクセル単位の誤差閾値 τ をドラッグしてください。選択されたカット（上、レベルで色分け）、階層（下）、セグメント数がリアルタイムに更新されます。独立した LOD レベルに切り替えると、隣接領域の選択が食い違う領域境界にひび割れ（赤）が現れます。境界をロックした階層では、ひび割れは起こり得ません。" %}

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-cracks.svg" caption="境界をロックしなければならない理由を計算で示したもの。左：隣り合う 2 つの領域が、それぞれ独立に簡略化されたプロファイルの 2 つの版（レベル 1 と 3、色を変えて表示）からジオメトリを取っています。共有する x では 2 つの版の高さが異なり、垂直方向の隙間（赤い線。タイトルにその高さ Δh を表示）が生じます。右：同じ領域を階層から取った場合で、クラスターの端はロックされた元の頂点なので、2 本のポリラインはぴったり接します。" %}

**カリング、ラスタライズ、シェーディング。** LOD の選択後、Nanite はクラスターを視錐台と階層的デプスバッファ（hierarchical depth buffer、HZB）に対して**2 パス**でカリングします。最初は前フレームのデプスに対して行い（前フレームで見えていたものは今も見える可能性が高い）、次に残りのクラスターを、今描画したものの深度に対して再テストするので、新たに遮蔽が解けたものを取りこぼしません。可視のクラスターは、その後**ビジビリティバッファ**（記事 02）にラスタライズされます。ピクセルごとに、深度とクラスター ID、三角形 ID を持つ 64 ビット値がアトミック操作で書き込まれます。マテリアルのシェーディングは後で、これらの ID を読んでピクセルごとに 1 回だけ行われます。

ラスタライズは二つに分かれています。GPU のハードウェアラスタライザは大きな三角形には効率的ですが、小さな三角形では無駄が出ます。2x2 ピクセルのクアッド単位でシェーディングし、三角形ごとのセットアップコストもあるため、1 ピクセルを覆う三角形でも、多数のピクセルを覆う三角形とほぼ同じコストがかかります。そのため Nanite は、**小さな三角形を持つクラスターはコンピュートシェーダでラスタライズ**し（ソフトウェアラスタライザで、64 ビットのアトミック操作でビジビリティバッファに書き込む）、大きな三角形を持つクラスターはハードウェアのパスに送ります。講演では、エッジ長の閾値として 32 ピクセルが述べられており（[要約](https://www.thecandidstartup.org/2023/04/03/nanite-graphics-pipeline.html)）、次の図ではこれを使います。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-triangle-sizes.svg" caption="約 26 万個の三角形にテッセレートした球の、3 m、10 m、30 m（1080 p、視野角 60°）での画面上の三角形サイズ。すべての前面向き三角形を投影して計算しました。最長エッジのピクセル長のヒストグラム（対数スケール）で、破線は 32 px です。ジオメトリが高密度だと、3 m でもすべての三角形が線の下に入り（大半は 1-10 px で、30 m ではほとんどが 1 ピクセル未満です）、まさにそこがコンピュートシェーダのラスタライザが固定機能のラスタライザに勝る領域です。" %}

最後に、Nanite はデータを**ストリーミング**します。DAG はページに分割され、現在のカットに必要なページだけが GPU メモリに常駐し、より粗いデータはフォールバックとして常に存在します。これが名前にある「仮想化」で、仮想メモリとの類推です。[Nanite のドキュメント](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine)には、現在の制限（たとえば不透明マテリアルとマスクマテリアルのみで、フォワードレンダラ、MSAA、モーフターゲットは非対応）と、2021 年以降に追加された機能（スケルタルメッシュなど）が挙げられています。

### 1.2 Lumen：動的グローバルイルミネーション

Lumen は、ベイクなしで毎フレーム間接拡散光と反射を計算するので、ライト、ジオメトリ、時刻を自由に変更できます。Wright、Narkowicz、Kelly が SIGGRAPH 2022 Advances コースで発表しており（[*Lumen: Real-time Global Illumination in Unreal Engine 5*](https://advances.realtimerendering.com/s2022/index.html)）、現在の挙動は [Lumen Technical Details](https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine) のページに記載されています。核心的な難しさは、GI には画面外も含めてシーン内の*あらゆるもの*に当たるレイが必要で、さらに命中点での*ライティング済みの*色が必要であり、それを数ミリ秒以内に行わなければならないことです。下の図が全体の流れです。左から右へ読んでください。左の列はレイが何に当たるか（シーン表現）、中央の列はどうトレースするか、右の列は結果をピクセルごとのライティングに変える部分です。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-lumen-pipeline.svg" caption="SIGGRAPH 2022 の講演とテクニカルドキュメントをもとにした、簡略化した Lumen パイプライン。左：シーン表現（スクリーン、メッシュごとの距離場、統合されたグローバル距離場、オプションのハードウェアレイトレーシング構造）と、マテリアルとライティングをカードに保存するサーフェスキャッシュ。中央：ソフトウェアレイトレーシングのためのトレーシングカスケード。右：トレースした放射輝度を間接拡散光と反射に変換するファイナルギャザー。" %}

**三角形なしのトレーシング。** ソフトウェアレイトレーシング（レイトレーシングユニットを持たないハードウェアでの既定）では、Lumen は**符号付き距離場**（signed distance field、SDF）に対してトレースします。各メッシュは事前計算された**メッシュ距離場**（mesh distance field）を持ちます。これは、各点で最も近い表面までの距離を格納した小さな 3D テクスチャです。Lumen は最初の数メートル（ドキュメントによれば 2 m）は個々のメッシュ SDF に対してトレースし、それより遠いレイは、統合されたより粗い**グローバル距離場**（global distance field）に対してトレースします。どちらの前にも、デプスバッファに対する安価な**スクリーントレース**を試みます。ハードウェアレイトレーシングを有効にすると、距離場のステップはレイと三角形のトレースに置き換わります。

SDF のトレースには**スフィアトレーシング**（sphere tracing、Hart 1996）を使います。点 $\mathbf{p}$ における最近接表面までの距離 $f(\mathbf{p})$ は、その半径の球が空であることを意味するので、レイは $f(\mathbf{p})$ だけ安全に進めます。

$$
\mathbf{p}_{k+1} = \mathbf{p}_k + f(\mathbf{p}_k)\, \boldsymbol{\omega}, \qquad \text{stop when } f(\mathbf{p}_k) < \epsilon .
$$

ここで $\boldsymbol{\omega}$ はレイの単位方向ベクトル、$\epsilon$ は命中とみなす許容誤差です（上の幾何誤差 $\varepsilon$ とは無関係です）。

**計算例。** 原点に単位球があり、$f(\mathbf{p}) = \lVert\mathbf{p}\rVert - 1$ とします。レイは $(-3, 0.5, 0)$ から $+x$ 方向に進みます。ステップは $2.041,\ 0.081,\ 0.0099,\ 0.0013$ で、4 ステップで $x \approx -0.8662$ に到達します。厳密な命中点は $x = -\sqrt{0.75} = -0.86603$ です。表面から遠いところではステップが大きく、近づくと収束は速くなります。遅くなるのは、表面のすぐそばをかすめるだけで当たらないレイの場合で、薄い壁の SDF は不正確になります。ドキュメントが壁の厚さを少なくとも 10 cm にするよう求めているのはこのためです。

```python
import numpy as np

def sphere_trace(f, origin, direction, eps=1e-3, max_steps=64):
    p = np.asarray(origin, float)
    d = np.asarray(direction, float) / np.linalg.norm(direction)
    for k in range(max_steps):
        dist = f(p)
        if dist < eps:
            return p, k
        p = p + dist * d
    return None, max_steps

unit_sphere = lambda p: np.linalg.norm(p) - 1.0
hit, steps = sphere_trace(unit_sphere, (-3.0, 0.5, 0.0), (1.0, 0.0, 0.0))
print(hit, steps)   # about [-0.8662, 0.5, 0.0] after 4 steps
```

**命中点には何があるのか。サーフェスキャッシュ。** 距離場は、レイが*どこに*当たるかは教えてくれますが、そこのマテリアルは教えてくれません。Lumen は**サーフェスキャッシュ**（surface cache）を保持します。各メッシュは数枚の**カード**（card）で覆われます。カードとは、メッシュを複数の方向から撮った正射影キャプチャで（ドキュメントの既定値は、スタティックメッシュあたり 12 枚、スケルタルメッシュあたり 6 枚）、アルベド、法線、深度、そして計算済みの*ライティング*を保存します。レイが命中すると、最寄りのカードを引いてキャッシュされたライティングを読むので、完全なマテリアル評価の代わりに数回のテクスチャフェッチで済みます。キャッシュは数フレームかけて段階的に再ライティングされ、キャッシュされたライティングには前フレームの間接光が含まれるため、複数回のバウンスが時間をかけて蓄積します。次の図は、トイオブジェクト上のカードを示しています。右側の各パネルは 1 枚のカードがキャプチャした深度で、灰色が濃いほどカードに近く、白はレイが何にも当たらなかった場所です。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-surface-cache-cards.svg" caption="トイオブジェクト（上に球を載せた箱）のサーフェスキャッシュのカードを、正射影レイキャスティングで計算したもの。左：オブジェクト（黒い線が箱、青いワイヤーフレームが球）と、軸に平行な 6 枚のカード平面（紫の輪郭。見やすいよう外側にずらしています）。右：6 枚のカードそれぞれがキャプチャした深度で、タイトルの +x、−x、+y、−y、+z、−z はカードの向きを表します（濃いほどカードに近い、白は命中なし）。可視の表面点はすべて少なくとも 1 枚のカードに写っているので、レイの命中点は、自分に面したカードに投影することで、マテリアルとキャッシュ済みライティングを見つけられます。" %}

**ファイナルギャザー。** すべてのピクセルでレイをトレースするのは高価すぎるので、講演によれば、Lumen は可視表面に置いた疎な**スクリーン空間プローブ**（screen-space probe）からレイをトレースし、前フレームのライティングを使ってその方向を重要度サンプリング（importance sampling）し、遠方の放射輝度をより粗い**ワールド空間の放射輝度キャッシュ**（world-space radiance cache）にキャッシュします。そのうえで、プローブの放射輝度を積分・フィルタリングして、ピクセルごとの間接拡散光にします。反射は、スペキュラローブに沿ったレイで、同じトレーシングの仕組みを再利用します。この「疎にトレースし、キャッシュし、補間する」構造は、放射照度プローブや DDGI（グラフィックス記事 11）と同じ考え方を、画面上にあるものに応じて適応的にしたものです。

UE 5.8（2026 年 6 月）では、より軽量な Lumen モードである **Lumen Lite**（ベータ）が追加されました。出典は [UE 5.8 リリースノート](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes)です。

### 1.3 Virtual Shadow Maps

記事 03 の単一のシャドウマップは、シーン全体で同じテクセル密度を持ちます。カメラの近くはぼやけ、遠くでは無駄になります。カスケードシャドウマップは、異なるスケールの数枚のマップでこれを改善します。**Virtual Shadow Maps**（VSM）はそれをはるかに押し進めたものです。[ドキュメント](https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-shadow-maps-in-unreal-engine)によれば、各ライトは 16k × 16k テクセルの**仮想**シャドウマップを持ち、128 × 128 テクセルのページに分割されます。可視ピクセルが実際に必要とするページだけが物理ページプールに割り当てられて描画され（ジオメトリのディテールがテクセル密度に合うよう Nanite で描画）、ページ内で何も動かない限り、ページはフレームをまたいで**キャッシュ**されます。ディレクショナルライトは**クリップマップ**（clipmap）を使います。これはカメラを中心とするこのような仮想マップの積み重ねで、各レベルは前のレベルの 2 倍の半径をカバーします。ドキュメントに記載されているレベルは、約 64 cm から約 40 km にわたります。

**レベルの選択。** 距離 $d$ にあるピクセルは、ワールド上でおよそ $\varphi = d \cdot 2\tan(\theta/2)/H$ のフットプリントをカバーします。クリップマップのレベル $k$ は半径 $2^k$ cm をカバーし、直径方向に $16384$ テクセルを持つので、テクセルサイズは $s_k = 2^{k+1}/16384$ cm です。ピクセルあたり少なくとも 1 つのシャドウテクセルを得るには、そのピクセルには、テクセルがフットプリント以下になる最も粗いレベル、すなわち $s_k \le \varphi$ が必要で、これは $k = \lfloor \log_2(16384\, \varphi / 1\,\text{cm}) \rfloor - 1$（利用可能なレベルにクランプ）となり、そのページは $\lfloor \mathbf{x} / (128\, s_k) \rfloor$ です（$\mathbf{x}$ はその点のクリップマップ平面内でのワールド座標で単位は cm です。1 ページは 128 テクセルなので、ページの幅は $128\, s_k$ です）。

**計算例。** $d = 10$ m、$H = 1080$、$\theta = 60°$ のとき、$\varphi \approx 1.07$ cm です。レベル 14 は $s_{14} = 2^{15}/16384 = 2$ cm で粗すぎます。レベル 13 は $s_{13} = 1$ cm なので、10 m にあるピクセルはレベル 13 をサンプルし、そのページの幅は $128 \times 1$ cm $= 1.28$ m です。（Unreal の実際のレベル選択は、クリップマップ中心までの距離や品質設定にも依存します。ここで示したのは原理です。）次の図は、同じ選択を可視の地面全体に適用したものです。左のパネルでは距離とともに色がどう変わるか、右のパネルでは各レベルで何ページ必要かを見てください。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/04-vsm-pages.svg" caption="上のモデルで計算した、トイビューでの仮想シャドウマップのページ割り当て。地面から 1.7 m の高さのカメラが +z 方向を向き、1080 p、60° です。左：カメラから 150 m 以内の可視の地面が要求するページを真上から見た図（赤い点がカメラ、赤い線が視錐台）で、クリップマップのレベル k で色分けしています。フットプリントが距離とともに大きくなるので、ページはレベルごとに 2 倍になります。右：レベルごとに要求されるページ数と、完全に常駐した 16k マップの 16,384 ページとの比較（対数スケール）。" %}

次のウィジェットは同じモデルを実行します。カメラを動かしたり回したりしてみてください。赤枠のページは直前の更新では要求されていなかったページです。ページキャッシュがあれば描画が必要なのはこれらだけなので、ゆっくり動くカメラのコストは総ページ数から想像されるよりずっと小さくなります。

{% include widget.liquid name="graphics-engine-vsm-pages" height="560" caption="地面から 1.7 m の高さにあるカメラが要求する仮想シャドウマップのページ（真上から見た図。赤い線は視錐台）。ドラッグでカメラを移動し、スライダーで回転させます。色はクリップマップのレベルを表し、赤枠は直前の更新以降に新しく要求されたページで、ページキャッシュが描画しなければならないのはこれらだけです。" %}

### 1.4 Temporal Super Resolution、World Partition、MetaHuman

- **Temporal Super Resolution（TSR）** は UE5 に組み込まれた時間的アップスケーラです。毎フレーム異なるサブピクセルのジッタで、より低い内部解像度でレンダリングし、モーションベクトルで高解像度の履歴を再投影し、サンプルを蓄積します。履歴がもはや合わなくなった箇所では履歴を棄却します。その祖先は、UE4 の Karis による時間的アンチエイリアシング（SIGGRAPH 2014 Advances）です。[TSR のドキュメント](https://dev.epicgames.com/documentation/en-us/unreal-engine/temporal-super-resolution-in-unreal-engine)では、設定項目を説明しており、たとえば履歴サンプル数 16 や、スクリーンパーセンテージ 50 % で収束するまでに必要なフレーム数などです。時間的蓄積は、Lumen と VSM を現実的なコストにしている要因でもあります。3 つとも作業を複数フレームに分散させています。
- **World Partition** は、手作業で分割したレベルを、グリッドに分割され**距離でストリーミング**される単一の永続的なワールドに置き換えます。多くの人が衝突なく同じマップを編集できる *One File Per Actor*、バリエーション用の *Data Layers*、遠方のセルのために自動生成される **HLOD**（階層的 LOD プロキシ、hierarchical LOD proxy）を備えています（[ドキュメント](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine)）。
- **MetaHuman**：UE 5.6 以降、リアルなデジタルヒューマンのためのツールである MetaHuman Creator がエンジン内で動作し、顔のパフォーマンスキャプチャのための MetaHuman Animator も併せて利用できます（[ドキュメント](https://dev.epicgames.com/documentation/en-us/metahuman/metahuman-workflow-changes)）。

### 1.5 UE 5.4 から 5.8 までの変更点

| バージョン | リリース | レンダリングの主な変更点 |
| --- | --- | --- |
| 5.4 | 2024 年 4 月 | 実験的な Nanite テッセレーション。モーションマッチングが実運用レベルに |
| 5.5 | 2024 年 11 月 | **MegaLights**（実験的：影付きの動的ライトを多数扱える）。Substrate マテリアルがベータに。パストレーサーが実運用レベルに |
| 5.6 | 2025 年 6 月 | エンジン内の MetaHuman Creator。60 Hz のオープンワールドを狙ったパフォーマンス改善 |
| 5.7 | 2025 年 11 月 | Substrate と PCG（プロシージャルコンテンツ生成、procedural content generation）が実運用レベルに。MegaLights がベータに。Nanite フォリッジ |
| 5.8 | 2026 年 6 月 | MegaLights が実運用レベルに。Lumen Lite（ベータ） |

出典：Epic の [5.8 リリースノート](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-5-8-release-notes)と、各リリースの解説記事（[5.4](https://gamefromscratch.com/unreal-engine-5-4-released/)、[5.5](https://gamefromscratch.com/unreal-engine-5-5-released/)、[5.7](https://gamefromscratch.com/unreal-engine-5-7-released/)）。2026 年 11 月時点で、5.8 が最新のリリース版です。

## 2. Unity 6

Unity は C# でスクリプトを記述する C++ エンジンで、コアはクローズドソースです。Unity 6 は 2024 年の 6.0 LTS から始まり、現在は定期的にアップデートが提供されています。[6.3 LTS](https://unity.com/blog/unity-6-3-lts-is-now-available)（2025 年 12 月）が現在の長期サポート（LTS）リリースで、[6.6](https://unity.com/releases/editor/whats-new/6000.6.0)（2026 年 8 月）がサポートされている最新のアップデートです。2024 年に Unity は、2023 年に反発を招いた[ランタイム料金を撤回](https://unity.com/blog/unity-is-canceling-the-runtime-fee)し、シート単位の価格体系に戻しました。

**Scriptable Render Pipeline。** Unity のレンダリングループ自体は、レンダリングコマンドのスケジューリングと設定のための薄い API である [Scriptable Render Pipeline](https://docs.unity.com/en-us/engine/6000.3/manual/render-pipelines/scriptable-render-pipeline-introduction)（SRP）の上に、C# で書かれています。これには 2 つのパイプラインが付属します。スマートフォンから PC までスケールする **Universal Render Pipeline**（URP）と、ハイエンドプラットフォーム向けの **High Definition Render Pipeline**（HDRP）です。Unity の [2026 年のレンダーパイプライン戦略](https://unity.com/topics/render-pipelines-strategy-for-2026)では、新規開発を URP に集中させ（リアルタイム GI とスクリーン空間反射の計画を含む）、HDRP は新機能なしのメンテナンスモードにとどめ、旧来の Built-in パイプラインは 6.5 から非推奨とされています。

**Render Graph。** Unity 6 では、URP のパスは[レンダーグラフ](https://docs.unity.com/en-us/engine/6000.3/manual/render-pipelines/universal-render-pipeline/customizing-urp/render-graph/introduction)（render graph）に対して書かれます。各パスは自分のリソースを宣言し、システムは出力が使われないパスを取り除き、各リソースを最初の書き込みの直前に確保して最後の読み取りの後に解放し、タイルベースのモバイル GPU では互換性のあるパスをネイティブのレンダーパスに統合します。これはまさに、記事 03 のトイ版 `PassList` の 3 つの仕事です。

**GPU Resident Drawer。** [GPU Resident Drawer](https://docs.unity.com/en-us/engine/6000.3/manual/render-pipelines/universal-render-pipeline/urp-whats-new) はインスタンスデータを GPU 上に保持し（BatchRendererGroup API を基盤とします）、互換性のあるレンダラを GPU インスタンシングで描画して、オブジェクトの多いシーンの CPU コストを削減します。これは記事 03 のフレーム予算の図にあった折れ点にあたります。Forward+ パスと、コンピュートに対応したグラフィックス API が必要です。その上で、[GPU オクルージョンカリング](https://docs.unity.com/en-us/engine/6000.3/manual/analysis/graphics-performance-profiling/in-urp/gpu-culling)は、現在フレームと前フレームのダウンサンプルされたデプスバッファに対して境界球をテストします。これは Nanite の HZB カリングと同じ 2 フェーズの考え方です。**STP**（Spatial-Temporal Post-processing）アップスケーラは TSR の役割を担い、Adaptive Probe Volumes はピクセル単位でベイク済みのプローブライティングを提供します。

**DOTS と Entities。** Unity のデータ指向スタック（Entities ECS、Burst コンパイラ、C# Job System）は、記事 01 の考え方を実運用に落とし込んだ例です。[Unity 6.4](https://unity.com/releases/editor/whats-new/6000.4.0)（2026 年 3 月）以降、Entities、Entities Graphics、Collections はエディタとバージョンを揃えた**コアパッケージ**になり、6.5 では Netcode for Entities がエンジンに取り込まれました。

## 3. Godot 4

Godot は [MIT ライセンス](https://godotengine.org/license/)の完全な**オープンソース**エンジンで、C++ で書かれ、GDScript、C#、またはネイティブ拡張でスクリプトを記述します。2026 年 11 月時点の最新の安定版は [4.7.2](https://godotengine.org/article/maintenance-release-godot-4-7-2/)（2026 年 8 月）で、これは 2026 年 6 月の機能リリース [4.7](https://godotengine.org/releases/4.7/)（HDR 出力、エリアライト、Vulkan のフォビエイテッドレンダリング対応）に続くものです。

**RenderingDevice。** Godot 4 は、[RenderingDevice](https://docs.godotengine.org/en/stable/classes/class_renderingdevice.html) を中心にレンダラを書き直しました。これは、モダンな明示的 API の上に置かれた低レベルの抽象化で、Unreal が RHI と呼び、記事 02 で説明したものと同種のレンダーハードウェアインターフェース（render hardware interface、RHI）です。その背後には、Vulkan、Direct3D 12（[4.3](https://godotengine.org/releases/4.3/) 以降）、Metal（[4.4](https://godotengine.org/releases/4.4/) 以降、Apple シリコン）があります。RenderingDevice はスクリプトにも公開されているので、GDScript からコンピュートシェーダを書けます。

**3 つのレンダラ。** [Forward+](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html)（デスクトップ向けのクラスタードフォワードレンダリング、clustered forward rendering）と Mobile はどちらも RenderingDevice の上で動き、**Compatibility** は OpenGL 上で動き、Web では唯一の選択肢です。1 つのエンジンが 3 つのレンダラを維持していること自体が良い教訓です。機能セットはプラットフォームの関数なのです。

**グローバルイルミネーションの選択肢。** Godot は、トレードオフの異なる[さまざまな GI 技術](https://docs.godotengine.org/en/stable/tutorials/3d/global_illumination/introduction_to_global_illumination.html)を提供します。**VoxelGI**（リアルタイム、ボクセルベース、範囲を限定した領域向け）、**SDFGI**（カメラの周囲にカスケードを持つ符号付き距離場 GI で、Juan Linietsky が[2020 年に](https://godotengine.org/article/godot-40-gets-sdf-based-real-time-global-illumination)導入しました。UV 展開やベイクが不要で、動的オブジェクトはその光を受け取りますが、寄与はしません）、スクリーン空間の間接照明（SSIL）、ベイク型の **LightmapGI**、リフレクションプローブです。SDFGI と Lumen を比べると示唆に富みます。どちらも距離場を使って安価にトレースしますが、Lumen はサーフェスキャッシュとスクリーンプローブを加えることで、より高い品質と動的な寄与を実現しています。

**Godot を学ぶ理由。** Godot のレンダラは、読めるほど小さいです。RenderingDevice ベースのレンダラは[リポジトリ](https://github.com/godotengine/godot)の `servers/rendering/renderer_rd/` にあり、あらゆる設計判断が公開のプルリクエストやプロポーザルで議論されています。

## 4. Bevy

[Bevy](https://github.com/bevyengine/bevy) は Rust で書かれた、MIT または Apache-2.0 のデュアルライセンスのエンジンで、**ECS ファースト**です。レンダリングを含むすべてが、エンティティ、コンポーネント、リソース、システムで構成されています。2026 年 11 月時点の最新リリースは [Bevy 0.20](https://bevy.org/news/bevy-0-20/)（2026 年 10 月）で、まだ 1.0 前であり、リリースごとに API が壊れます。

**wgpu。** Bevy は [wgpu](https://github.com/gfx-rs/wgpu) を通じてレンダリングします。wgpu は WebGPU API（記事 03 で使った API）の Rust 実装で、Vulkan、Metal、D3D12、OpenGL 上、およびブラウザ上では WebGPU または WebGL2 を通じて動作します。

**レンダーアプリと抽出フェーズ。** Bevy は、独自の ECS ワールドを持つ別の**サブアプリ**でレンダリングを実行します。毎フレーム、短い [`ExtractSchedule`](https://docs.rs/bevy_render/latest/bevy_render/struct.ExtractSchedule.html) が、レンダリングに必要なデータ（トランスフォーム、メッシュハンドル、ライト、カメラ）をメインワールドからレンダーワールドにコピーします。その後、レンダーワールドがフレーム $n$ を準備して提出している間に、メインワールドはフレーム $n+1$ のシミュレーションを開始できます。これが**パイプライン化**（pipelining）で、シミュレーション時間を $S$、レンダリング準備時間を $R$ とすると、フレーム時間は $S + R$ からおよそ $\max(S, R)$ に下がり、その代償として 1 フレーム分のレイテンシが生じます。ドキュメントは、2 つのワールドが同期する唯一の箇所なので、抽出を短く保つよう求めています。私たちのミニエンジンの `render(world, ...)` は ECS を直接読みますが、これを並列に動かすための方法が抽出です。

Bevy の最近のレンダリングの取り組みは、オープンなエンジンがどれだけ速く進めるかを示しています。[0.14](https://bevy.org/news/bevy-0-14/) 以降の実験的な仮想ジオメトリ（メッシュレット）、[0.17](https://bevy.org/news/bevy-0-17/) 以降の実験的なレイトレースライティングプロジェクト **Solari**、[0.19](https://bevy.org/news/bevy-0-19/) で通常の ECS システムになったレンダーパス、0.20 のメッシュシェーダです。学ぶには、`crates/bevy_render` と `crates/bevy_pbr` から始めてください。

## 5. 知っておきたいその他のエンジン

- **O3DE**（[Open 3D Engine](https://github.com/o3de/o3de)）は、Amazon Lumberyard のオープンソース化された後継で、ライセンスは Apache-2.0 / MIT です。モジュール式のレンダラは [Atom](https://www.docs.o3de.org/docs/atom-guide/) と呼ばれます。
- **Filament**（[GitHub](https://github.com/google/filament)、Apache-2.0）は、Android、iOS、デスクトップ、WebGL2 向けの Google のリアルタイム PBR エンジンです。その[設計ドキュメント](https://google.github.io/filament/Filament.md.html)は、PBR の実装に関する無料のテキストとして最良のものです（記事 03 で使いました）。
- **Frostbite**（EA）は非公開ですが、その講演は業界を形作りました。[FrameGraph](https://www.gdcvault.com/play/1024612/FrameGraph-Extensible-Rendering-Architecture-in) の講演（GDC 2017）はレンダーグラフを広め、*Moving Frostbite to Physically Based Rendering*（[SIGGRAPH 2014 コース](https://blog.selfshadow.com/publications/s2014-shading-course/)）は、プロダクションでの PBR の参考文献です。
- **id Tech 8** は、id Software が *DOOM: The Dark Ages*（2025）のために作ったエンジンで、レイトレーシングを中心に構築されています。このゲームはネイティブにレイトレーシングでレンダリングし、パストレーシングモードが後から追加されました（[NVIDIA](https://www.nvidia.com/en-us/geforce/news/doom-the-dark-ages-dlss-4-multi-frame-generation-out-now)）。ハードウェアレイトレーシングが標準になりつつあることの表れです。
- **NVIDIA Falcor**（[GitHub](https://github.com/NVIDIAGameWorks/Falcor)）は、D3D12 と Vulkan 上の研究用フレームワークで、リアルタイムレンダリング研究のプロトタイピング向けに設計されており、論文とエンジンの良い橋渡しになります。
- **RTX Remix**（[GitHub](https://github.com/NVIDIAGameWorks/rtx-remix)）は、古い固定機能の DirectX 8/9 ゲームの描画コールを横取りし、シーンを再構築してパストレーシングで再レンダリングするので、モッダーはアセットやライトを置き換えられます。そのランタイムはオープンソースで、他人のエンジンの*周囲に*構築されたエンジンという興味深い例です。

## 6. 比較

| | Unreal Engine 5 | Unity 6 | Godot 4 | Bevy |
| --- | --- | --- | --- | --- |
| コア言語 | C++ | C++ コア、C# スクリプト | C++ | Rust |
| ライセンス | ソース公開（Unreal EULA） | プロプライエタリ | MIT | MIT または Apache-2.0 |
| レンダラのアーキテクチャ | ディファード + ビジビリティバッファ（Nanite）。RDG レンダーグラフ | C# の SRP：URP（フォワード、Forward+、ディファード）と HDRP。レンダーグラフ | RenderingDevice。Forward+、Mobile、Compatibility（OpenGL） | wgpu。抽出フェーズを持つレンダーサブアプリ |
| 動的 GI | Lumen（ソフトウェア SDF またはハードウェア RT） | ベイク型プローブ（APV）、ライトマップ。URP ではリアルタイム GI を計画中 | SDFGI、VoxelGI、SSIL。LightmapGI | 実験的（Solari） |
| ジオメトリパイプライン | Nanite 仮想化ジオメトリ、HLOD | GPU Resident Drawer、GPU オクルージョンカリング、LOD グループ | 従来型の LOD、自動メッシュ LOD、オクルージョンカリング | 実験的なメッシュレット、メッシュシェーダ |
| スクリプト | C++、Blueprint | C# | GDScript、C#、GDExtension | Rust |
| ECS | Mass（群衆向け） | Entities（6.4 からコアパッケージ） | ノードツリーで、ECS ではない | どこでも ECS |
| プラットフォーム | PC、コンソール、モバイル、XR | PC、コンソール、モバイル、XR、Web | PC、モバイル、Web、XR | PC、Web、モバイル（成熟度は低い） |

注意が必要なセルが 2 つあります。「Unreal のレンダーグラフ」は Render Dependency Graph（RDG）のことで、記事 02 のグラフの実運用版です。Unity の ECS と GameObject の世界は今も共存しており、ほとんどの Unity プロジェクトは GameObject を使っています。

## 7. 各エンジンから学べること、そしてソースの読み方

- **Unreal から**：コストを*コンテンツ*ではなく*ピクセル*に比例させる方法（Nanite、VSM）と、時間的な償却をどこまで進められるか（Lumen、TSR、VSM のキャッシュ）。まず SIGGRAPH の講演を読み、次にシェーダを読んでください。GitHub のソースでは、`Engine/Shaders/Private/Nanite/` と `Engine/Shaders/Private/Lumen/` のほうが、それらを駆動する C++ より読みやすいです。エディタのビューポートにある Nanite と Lumen の可視化モードは、カット、クラスター、オーバードローをライブで見るのに最速の方法です。
- **Unity から**：レンダラを*API*として公開し、ユーザーが独自のパイプラインやパスを書けるようにする方法（SRP、レンダーグラフ）と、オブジェクト指向のエンジンに後付けでデータ指向設計を導入する方法（Entities、GPU Resident Drawer）。URP の C# ソースはパッケージに同梱されており、デバッガでステップ実行するのが簡単です。
- **Godot から**：少人数のチームが、移植性のあるレンダラを理解しやすい状態に保つ方法と、複数の GI 手法を率直なトレードオフとともに提供する方法。`RenderingDevice` から始め、次に `servers/rendering/renderer_rd/` の 1 つのレンダラを読んでください。
- **Bevy から**：「すべてが ECS」をどこまで押し進められるか、そして抽出とパイプライン化がシミュレーションとレンダリングをどう切り離すか。examples フォルダは小さなプログラムからなるテストスイートで、リリースノートは各設計変更を説明しています。

**エンジンのソースの読み方。** `main` から始めてはいけません。1 つの*フレーム*と 1 つの*機能*を選びます。RenderDoc（記事 03）でフレームをキャプチャし、パスを一覧にして、各パスを発行しているコードを、そのデバッグラベルで検索して探します（どのエンジンもパスにラベルを付けています）。1 つのリソース（たとえばシャドウマップ）を、作成から最後の使用まで追跡します。公式の講演をコードの横に置いておきましょう。講演は*なぜ*を説明し、コードは講演が省略した何百もの特殊ケースを示します。

## 代表的な論文

| 論文 | 発表先 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Hoppe, *Progressive Meshes* | SIGGRAPH | 1996 | [DOI](https://doi.org/10.1145/237170.237216) | エッジ縮約による連続的な LOD。視点依存の細分化の祖先 |
| Garland & Heckbert, *Surface Simplification Using Quadric Error Metrics* | SIGGRAPH | 1997 | [DOI](https://doi.org/10.1145/258734.258849) | クラスター階層の構築に使われる簡略化誤差 |
| Cignoni et al., *Batched Multi Triangulation* | IEEE Visualization | 2005 | [DOI](https://doi.org/10.1109/VISUAL.2005.1532797) | 境界が一貫したパッチの DAG。Nanite に最も近い先行研究 |
| Burns & Hunt, *The Visibility Buffer: A Cache-Friendly Approach to Deferred Shading* | JCGT | 2013 | [Paper](https://jcgt.org/published/0002/02/04/paper.pdf) | 三角形 ID を保存して後でシェーディングする。Nanite の出力形式 |
| Karis, Stubbe & Wihlidal, *A Deep Dive into Nanite Virtualized Geometry* | SIGGRAPH Advances course | 2021 | [Course page](https://advances.realtimerendering.com/s2021/index.html) | Nanite の設計：クラスター DAG、LOD カット、カリング、ソフトウェアラスタライズ |
| Hart, *Sphere Tracing* | The Visual Computer | 1996 | [DOI](https://doi.org/10.1007/s003710050084) | 符号付き距離場のレイマーチング。Lumen のソフトウェアトレーシングと Godot の SDFGI の基礎 |
| Crassin et al., *Interactive Indirect Illumination Using Voxel Cone Tracing* | Computer Graphics Forum (PG) | 2011 | [DOI](https://doi.org/10.1111/j.1467-8659.2011.02063.x) | ボクセルシーンからのリアルタイム GI。Godot の VoxelGI の背景にある考え方 |
| Majercik et al., *Dynamic Diffuse Global Illumination with Ray-Traced Irradiance Fields* | JCGT | 2019 | [Paper](http://jcgt.org/published/0008/02/01/) | プローブベースの動的 GI（DDGI） |
| Wright, Narkowicz & Kelly, *Lumen: Real-time Global Illumination in Unreal Engine 5* | SIGGRAPH Advances course | 2022 | [Course page](https://advances.realtimerendering.com/s2022/index.html) | サーフェスキャッシュ、距離場トレーシング、スクリーンプローブ |
| Fernando et al., *Adaptive Shadow Maps* | SIGGRAPH | 2001 | [DOI](https://doi.org/10.1145/383259.383302) | 階層的で視点駆動のシャドウマップ解像度。VSM の祖先の 1 つ |
| Lefohn, Sengupta & Owens, *Resolution-Matched Shadow Maps* | ACM TOG | 2007 | [DOI](https://doi.org/10.1145/1289603.1289611) | 視点が必要とする場所にだけシャドウページを割り当てる |
| Karis, *High Quality Temporal Supersampling* | SIGGRAPH Advances course | 2014 | [Course page](https://advances.realtimerendering.com/s2014/index.html) | TAA と TSR の背後にある時間的蓄積 |
| Bitterli et al., *Spatiotemporal Reservoir Resampling for Real-Time Ray Tracing with Dynamic Direct Lighting* | ACM TOG (SIGGRAPH) | 2020 | [DOI](https://doi.org/10.1145/3386569.3392481) | ReSTIR：多数の動的ライトのためのリザーバ再サンプリング。確率的な多光源手法の系統の始まり |

## 学習リソース

- SIGGRAPH の [Advances in Real-Time Rendering](https://advances.realtimerendering.com/) コースのページ（2021 年の Nanite、2022 年の Lumen、およびそれ以降の毎年）：プロダクションレンダリングの一次情報源です。
- 公式ドキュメント：[Nanite](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-virtualized-geometry-in-unreal-engine)、[Lumen technical details](https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-technical-details-in-unreal-engine)、[Virtual Shadow Maps](https://dev.epicgames.com/documentation/en-us/unreal-engine/virtual-shadow-maps-in-unreal-engine)。Unity の [URP render graph](https://docs.unity.com/en-us/engine/6000.3/manual/render-pipelines/universal-render-pipeline/customizing-urp/render-graph/introduction)。Godot の[レンダリングドキュメント](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html)。各リリースの設計を説明している Bevy の[ニュース記事](https://bevy.org/news/)。
- ソースコード：[Godot](https://github.com/godotengine/godot)、[Bevy](https://github.com/bevyengine/bevy)、[O3DE](https://github.com/o3de/o3de)、[Filament](https://github.com/google/filament)、[Falcor](https://github.com/NVIDIAGameWorks/Falcor)。Unreal Engine は Epic アカウントを連携した後に GitHub で入手できます。
- Akenine-Möller らによる *Real-Time Rendering*（第 4 版）と、周辺システムについては Jason Gregory の *Game Engine Architecture*。
- Arseny Kapoulkine による [meshoptimizer](https://github.com/zeux/meshoptimizer) ライブラリ。そのクラスターライザとシンプリファイアは、Nanite 風パイプラインのオープンな構成要素として最も一般的です。

## 演習

1. **単調な誤差。** 階層ビルダーから `max(err, a["err"], b["err"])` を取り除き（`err` だけを残す）、カットが矛盾する（クラスターとその祖先の両方が選ばれる、またはどちらも選ばれない）カメラ位置を探してください。単調性がこれを防ぐのはなぜでしょうか。
   <details markdown="1"><summary>ヒント</summary>
   クラスターごとのテスト $\varepsilon(c) \le \tau < \varepsilon(\text{parent})$ では、ルートから葉への経路がカットを 1 回だけ横切るのは、経路に沿って $\varepsilon$ が減少する場合に限ります。親の誤差が子の誤差より小さいと、1 つの経路上で両方の不等式が同時に成り立つ（または同時に成り立たない）ことがあります。
   </details>
2. **DAG としてのグループ。** 各レベルで*4 つ*のクラスターを統合し、半分に簡略化し、*2 つ*のクラスターに分割するようにビルダーを変更し、1 レベルおきにグループ化を 1 クラスターずらしてください。得られたグラフを描いてください。どのクラスターが 2 つの親を持つようになりますか。
3. **スフィアトレーシングのコスト。** 単位球の表面から 0.01、0.1、1 の距離を通過するレイについて、`sphere_trace` が必要とするステップ数を数えてください。ステップ数を外れ距離に対してプロットし、結果を説明してください。
   <details markdown="1"><summary>ヒント</summary>
   表面の近くでは、安全なステップは表面までの小さな距離なので、かすめるレイはじわじわとしか進めません。滑らかな表面では、ステップ数はおおよそ外れ距離の平方根の逆数のように増加します。
   </details>
4. **VSM の予算。** ページ割り当てモデルを拡張して、毎秒 90° 回転するカメラで、ページを 30 フレーム保持するキャッシュがある場合の物理ページ数を数えてください。1 フレームあたり何ページを新たに描画する必要がありますか。
5. **ソースを読む。** Godot のリポジトリで、Forward+ がクラスター化ライトリストを構築している場所を探すか、Bevy で点光源を抽出しているシステムを探してください。シーンからレンダラへ渡るデータを書き出してください。

[次の記事]({{ '/blog/2026/graphics-engine-05-physics-and-simulation-engines/' | relative_url }})では、レンダリングからシミュレーションへと話題を移します。ゲームエンジンの物理パイプラインと、Isaac、MuJoCo、Newton、Genesis といったエンジンがロボットや AI のためのシミュレータになった経緯を扱います。
