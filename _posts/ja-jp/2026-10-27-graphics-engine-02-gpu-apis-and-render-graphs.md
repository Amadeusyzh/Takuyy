---
layout: post
title: "現代の GPU API とレンダーグラフ"
date: 2026-10-27 13:02:00+0900
description: "エンジンは GPU とどう話すか：明示的 API（Vulkan、D3D12、Metal、WebGPU）、メモリと同期、最小の WebGPU プログラム、動くおもちゃのコンパイラ付きのレンダーグラフ、フォワード/ディファード/クラスタードライティング、ビジビリティバッファ、HZB カリングとメッシュレットによる GPU 駆動レンダリング、そして GPU のデバッグ。"
categories: graphics-engine
tags: [vulkan, d3d12, webgpu, render-graph, frame-graph, clustered-shading, visibility-buffer, gpu-driven, mesh-shaders]
series: graphics-engine
series_order: 2
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 01 回]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})では、エンジンのレイヤー図の中でレンダラを一つの箱として描きました。今回はその箱を開けます。現代のレンダラは指揮者です。数十個のパスのコマンドを記録し、複数のフレームを同時に処理中（in flight）に保ち、各テクスチャが「書き込み中」から「読み取り中」に変わる瞬間を GPU に正確に伝え、寿命の短いテクスチャを共有メモリに詰め込みます。今日の GPU API ではこれらがすべて明示的であり、エンジンがそれを扱いきるための仕組みが**レンダーグラフ**（render graph）です。レンダリングの数学（BRDF、影、大域照明）はグラフィックスシリーズ、例えば[グラフィックス 04]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})や[グラフィックス 11]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }})で扱います。ここで関心を持つのは、それを動かす仕組みのほうです。

## 前提知識

- ラスタライズパイプライン：頂点シェーダ、ラスタライザ、フラグメントシェーダ、深度テスト（[グラフィックス 02]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})）。
- [第 01 回]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})の 3 節で説明したフレームのパイプラインと in flight のフレーム。
- WebGPU の例のための少しの JavaScript と、レンダーグラフのコンパイラのための Python。

## 1. OpenGL のステートマシンから明示的 API へ

### OpenGL の何が問題だったか

OpenGL（と Direct3D 11）は、GPU を**グローバルなステートマシン**（state machine）として見せます。テクスチャをバインドし、ブレンドモードを設定し、シェーダをバインドして描画を呼べば、残りはドライバが考えます。便利ですが、ドライバは推測するしかありません。描画のたびに全状態を検証し、新しい状態の組み合わせに初めて出会ったときにシェーダのバリアントを遅延コンパイルし（プレイ中のカクつきの原因になります）、隠れた同期を挿入するためにすべてのリソースを追跡し、状態がグローバルなのでコマンドを 1 スレッドでしか記録できません。

**明示的 API**（explicit API）は、自分のフレームのことを知っているアプリケーション側にこの仕事を移します。Direct3D 12（2015）、Vulkan（1.0 は 2016 年 2 月リリース）、Apple の Metal（2014）、そして Web 向けの **WebGPU**（2023 年に Chrome 113 で、2025 年に Windows 版 Firefox 141 と Safari 26 で出荷。2026 年秋の時点で W3C 仕様は Candidate Recommendation Draft です）です。名前や細部は違っても、オブジェクトモデルは共通です（図 1）。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-api-objects.svg" caption="明示的 API に共通するオブジェクトモデル（Vulkan / D3D12 / WebGPU の名前）。デバイスがすべてを作り、パイプラインはシェーダモジュールとレイアウトから作られます。バインドグループ（デスクリプタセット）はメモリヒープ上のバッファとテクスチャを指し、コマンドバッファは記録されてキューに投入されます。フェンス、セマフォ、クエリは GPU のタイムラインを観測します。" %}

### 各オブジェクト

- **インスタンス、アダプタ、デバイス。** インスタンス（instance）は API への接続、アダプタ（adapter。Vulkan では physical device）は 1 枚の GPU、論理**デバイス**（device）はほかのすべてを作るためのハンドルです。
- **キュー**（queue）。GPU は種類の違うキューを持ちます。グラフィックス、コンピュート、コピー（転送）です。別々のキューに投入した仕事は重なって実行でき、これが**非同期コンピュート**（async compute、4 節）の基礎です。
- **コマンドバッファ**（command buffer）。呼び出しをすぐに発行するのではなく、コマンドをコマンドバッファ（WebGPU ではコマンドエンコーダ）に**記録**し、完成したバッファをキューに**投入**（submit）します。記録は CPU だけで行われ、スレッドごとに 1 本のコマンドバッファを使えば多くのスレッドで同時に行えます。これが、明示的 API がマルチコア CPU でスケールする主な理由です。
- **パイプラインステートオブジェクト**（pipeline state object、PSO）。シェーダのコンパイルに影響する状態（シェーダ、頂点レイアウト、ブレンド、深度テスト、レンダーターゲットのフォーマット）を、前もって作る一つの不変オブジェクトに焼き込みます。ドライバはフレームの途中ではなく、ロード時に一度だけコンパイルします。代償は PSO の数が組み合わせ的に増えることで、そのためエンジンは PSO をキャッシュし、ロード中に事前コンパイルします。
- **中間コードとしてのシェーダ。** シェーダはオフラインで中間表現にコンパイルします。Vulkan は **SPIR-V**、D3D12 は **DXIL**、Metal は Metal ライブラリです。WebGPU は **WGSL** のソースを受け取り、ブラウザがネイティブ API 向けに変換します。エンジンは普通、HLSL や Slang で一度書いてクロスコンパイルします。
- **デスクリプタとバインドグループ。** シェーダはバインディングスロットを通してリソースを参照します。**デスクリプタ**（descriptor）はスロットを埋める小さなレコード（「テクスチャ X をサンプル用イメージとして」）です。デスクリプタは、**デスクリプタセット**（descriptor set、Vulkan）、**デスクリプタヒープ**（descriptor heap）内の**デスクリプタテーブル**（descriptor table、D3D12）、**バインドグループ**（bind group、WebGPU）にまとめられ、その形はレイアウト（Vulkan のパイプラインレイアウト、D3D12 のルートシグネチャ）で決まります。
- **バインドレス**（bindless）。描画ごとにセットをバインドし直すと CPU 時間がかかり、バッチ化も制限されます。**バインドレス**リソースでは、シーンの全テクスチャを一つの巨大なデスクリプタ配列に置き、シェーダはバッファから読んだ整数でそれを添字アクセスします：`textures[material.albedo_index]`。Vulkan はデスクリプタインデクシング（1.2 からコア）とデスクリプタバッファで、D3D12 は Shader Model 6.6 のヒープ直接インデクシングでこれを提供します。GPU が CPU のバインドなしに自分でマテリアルを選べるので、バインドレスは GPU 駆動レンダリング（6 節）を可能にします。WebGPU 1.0 のコア機能には含まれていません。

## 2. メモリと同期

### メモリ

明示的 API では、**メモリヒープ**（memory heap）を自分で確保し、そこにバッファやテクスチャを配置します。デバイスローカルメモリは GPU から速く、ホスト可視メモリは CPU から書き込めます（アップロードやフレームごとの定数用）。リソースごとにヒープを確保すると遅く、断片化も起こるので、エンジンはサブアロケータ（例えば AMD の Vulkan Memory Allocator や D3D12 Memory Allocator ライブラリ）を使い、寿命の短いレンダーターゲットには、1 フレーム内で複数のテクスチャが同じメモリを使い回す**トランジェントヒープ**（transient heap）を使います（**エイリアシング**、aliasing、4 節）。

### ハザードとバリア

GPU は深くパイプライン化された、大規模並列の機械です。パス A がテクスチャに書き、パス B がそれを読むとき、B が始まる時点で A の書き込みが終わっている保証も、キャッシュから出ている保証もありません。これが**書き込み後の読み取りハザード**（read-after-write hazard）です。アプリケーションは**バリア**（barrier）を挿入しなければなりません。バリアが表すのは「これより前のステージの書き込みが終わるまで待ち、書き込みを可視にし、テクスチャを次の使い方に必要なレイアウトに変換せよ」ということです。Vulkan はバリアを、変換元と変換先の**パイプラインステージ**（pipeline stage）、**アクセスマスク**（access mask）、イメージの**レイアウト**（layout）遷移で表します。D3D12 は**リソースステート**（resource state）の遷移（例えば `RENDER_TARGET` から `PIXEL_SHADER_RESOURCE`）で、あるいは Vulkan 風の新しい enhanced barriers で表します。

各テクスチャを小さなステートマシンと考えると分かりやすくなります。図 3 では、各行がディファードレンダラのテクスチャ、各列がパスで、色はそのパスの間にテクスチャが取るべき状態です。色が変わるたびにバリアが必要です（赤い縦線）。この図は 4 節のおもちゃのコンパイラが生成したもので、バリアは自動で挿入されています。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-barrier-states.svg" caption="例のフレームの各パスにおけるリソースの状態（行：テクスチャ、列：実行されたパス、R/W：そのパスが読むか書くか）。オレンジ：レンダーターゲット、灰青：深度書き込み、緑：シェーダ読み取り（SRV）、紫：プレゼント。赤い縦線はそのパスの前のバリアです。例えば depth は gbuffer が書き、そのあと ssao、lighting、taa が読むので、DEPTH_WRITE から SRV への遷移がちょうど 1 回必要です。" %}

### CPU と GPU の同期：フェンス、セマフォ、in flight のフレーム

バリアは GPU *内部*の順序を決めます。タイムライン同士をつなぐプリミティブがあと二つあります。

- **フェンス**（fence）は CPU が GPU を待つためのものです。投入した仕事が終わるとキューがフェンスをシグナルします。（Vulkan には**タイムラインセマフォ**（timeline semaphore）もあり、単調増加する 64 ビットのカウンタです。D3D12 のフェンスも同じように働きます。）
- **セマフォ**（semaphore）は、*キュー同士*やスワップチェーンとの順序を決めます。例えば「プレゼンテーションエンジンがスワップチェーンのイメージを解放するまで、そこへの描画を始めない」といった具合です。

CPU は、GPU がフレーム $N$ を描画している間にフレーム $N+1$ を記録したいところです。しかしフレーム $N+1$ は自分用のユニフォームバッファとコマンドバッファを使い、GPU がまだ読んでいるフレームのデータを上書きしてはいけません。そこでエンジンは、フレームごとのデータを $F$ 組用意し（**in flight のフレーム**、frames in flight）、コピー $i \bmod F$ を再利用する前にフレーム $i - F$ のフェンスを待ちます。図 2 は、CPU が 9 ms、GPU が 12 ms かかるフレームのシミュレーションです。

- $F = 1$ では二つのプロセッサが交代で動き、1 フレーム $9 + 12 = 21$ ms です。
- $F = 2$ では GPU が遊ぶことはなくなります。フレーム時間は $\max(9, 12) = 12$ ms に下がり、CPU は毎フレーム少しフェンスを待ちます。このエンジンは **GPU ボトルネック**です。
- $F = 3$ ではスループットは 12 ms のままですが、各フレームの CPU 作業の開始から GPU 作業の終了までが、$F = 2$ の 24 ms に対して 36 ms になります。in flight のフレームを増やすとスパイクへの耐性が増し、代わりに遅延が増えます。2 か 3 が一般的です。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-frames-in-flight.svg" caption="in flight のフレームが 1、2、3 のときの CPU（上のレーン）と GPU（下のレーン）。CPU は 1 フレーム 9 ms、GPU は 12 ms です。数字はフレーム番号、斜線の箱は CPU がフェンスを待っている時間です。各パネルのタイトルには、定常状態のフレーム時間と、最後のフレームの CPU 開始から GPU 完了までの時間を示しています。" %}

### よくある同期のバグ

1. **バリアの欠落。** 読み取りが古いデータや書きかけのデータを見ます。ある GPU では動き、別の GPU ではちらつくことがあります。検証レイヤー（Vulkan の同期検証、D3D12 の GPU ベース検証）で多くを見つけられます。
2. **in flight のデータの上書き。** このフレームの定数を、GPU が前のフレームのためにまだ読んでいるバッファに書いてしまうことです。症状：物体が二つの位置の間で震えます。
3. **過剰な同期。** あらゆる場所で「全ステージ、全メモリ」のバリアを張る、あるいは毎フレーム `vkDeviceWaitIdle` を呼ぶことです。正しく動きますが、GPU のパイプラインを空にするので遅くなります。
4. **レイアウトの誤り。** まだレンダーターゲットのレイアウトのテクスチャをサンプリングすることです。ハードウェアによっては、圧縮されたデータがゴミとして読まれます。
5. **デッドロック。** シグナルされることのないフェンスを待つことです。例えば、それをシグナルするはずの投入が失敗した場合です。

レンダーグラフ（4 節）の存在理由の大部分は、1、3、4 のバグを構造的に起こらなくすることにあります。

## 3. 最小の WebGPU プログラム

WebGPU はブラウザで動くので、明示的 API に触れる最も手軽な方法です。以下のページは、角度をユニフォームバッファから受け取って回転する三角形を描きます。`index.html` として保存し、WebGPU に対応したブラウザで開いてください。システムによっては、ファイルを直接開くのではなく `http://localhost` から配信する必要があります。

```html
<!doctype html>
<canvas id="c" width="640" height="480"></canvas>
<script type="module">
const adapter = await navigator.gpu.requestAdapter();             // 1. pick a GPU
const device = await adapter.requestDevice();                     // 2. logical device
const canvas = document.getElementById("c");
const context = canvas.getContext("webgpu");
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format, alphaMode: "opaque" });       // 3. swapchain

const shader = device.createShaderModule({ code: `                // 4. WGSL shaders
  struct Uniforms { time: f32, aspect: f32, pad0: f32, pad1: f32 };
  @group(0) @binding(0) var<uniform> u: Uniforms;
  struct VSOut { @builtin(position) pos: vec4f, @location(0) color: vec3f };

  @vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
    var p = array<vec2f, 3>(vec2f(0.0, 0.6), vec2f(-0.6, -0.4), vec2f(0.6, -0.4));
    var c = array<vec3f, 3>(vec3f(1, 0, 0), vec3f(0, 1, 0), vec3f(0, 0, 1));
    let s = sin(u.time);
    let k = cos(u.time);
    let q = vec2f(k * p[i].x - s * p[i].y, s * p[i].x + k * p[i].y);
    var o: VSOut;
    o.pos = vec4f(q.x / u.aspect, q.y, 0.0, 1.0);
    o.color = c[i];
    return o;
  }
  @fragment fn fs(v: VSOut) -> @location(0) vec4f { return vec4f(v.color, 1.0); }
` });

const pipeline = device.createRenderPipeline({                    // 5. pipeline state object
  layout: "auto",
  vertex: { module: shader, entryPoint: "vs" },
  fragment: { module: shader, entryPoint: "fs", targets: [{ format }] },
  primitive: { topology: "triangle-list" },
});

const ubo = device.createBuffer({                                 // 6. uniform buffer (16 bytes)
  size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const bindGroup = device.createBindGroup({                        // 7. bind group = descriptor set
  layout: pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: ubo } }],
});

function frame(ms) {
  device.queue.writeBuffer(ubo, 0, new Float32Array([ms / 1000, canvas.width / canvas.height, 0, 0]));
  const encoder = device.createCommandEncoder();                  // 8. record commands
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.95, g: 0.95, b: 0.97, a: 1 },
      loadOp: "clear", storeOp: "store",
    }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);                                                   // 3 vertices, no vertex buffer
  pass.end();
  device.queue.submit([encoder.finish()]);                        // 9. submit to the queue
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script>
```

1 行ずつ見ていきます。

1. **アダプタ。** `requestAdapter` が物理 GPU を選びます。GPU を 2 枚持つノート PC では `{ powerPreference: "high-performance" }` を渡せます。
2. **デバイス。** すべてのリソースはデバイスに属します。オプション機能（例えば 7 節の `"timestamp-query"`）はここで要求します。
3. **スワップチェーン。** `context.configure` がキャンバスとデバイスをつなぎます。毎フレーム `getCurrentTexture()` が描画先のイメージを返します。Vulkan でいうスワップチェーンのイメージです。
4. **シェーダ。** 頂点シェーダは頂点バッファを必要としません。組み込みの `vertex_index` で定数配列を引き、その点を `u.time` だけ回転します。ユニフォームバッファにはアラインメントの規則があるので、構造体は 16 バイトにパディングしています。
5. **パイプライン。** `layout: "auto"` で、WebGPU がシェーダからバインドグループのレイアウトを導きます。実際のエンジンは、複数のパイプラインでバインドグループを共有できるようにレイアウトを明示的に宣言します。
6. **ユニフォームバッファ。** `COPY_DST` によって `queue.writeBuffer` でアップロードできます。2 節の in flight のフレームの問題は WebGPU が引き受けてくれます。`writeBuffer` はキュー上で順序付けられるので、先に投入した仕事がまだ使っているデータを上書きすることはありません。
7. **バインドグループ。** バッファを `@group(0) @binding(0)` にバインドします。
8. **記録。** レンダーパスはアタッチメントと、その扱い方を宣言します。`loadOp: "clear"`（古い内容を読み込まない）と `storeOp: "store"`（結果を残す）です。タイルベースのモバイル GPU ではこのフラグが非常に重要で、メモリトラフィックを省けるようになります。
9. **投入。** GPU に仕事を送るのは `submit` だけです。WebGPU はパスごとにリソースの使われ方を追跡して自分でバリアを挿入するので、コードにはバリアが一つもありません。Vulkan と D3D12 では、それはあなたの仕事です。

ここからの次の一歩は、頂点バッファ、深度テクスチャ、ユニフォームバッファに入れたカメラ行列、そして 2 つ目のパスです。[第 03 回]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})では、まさにこの土台の上に、glTF の読み込み、PBR、影、ECS を備えた完全なミニエンジンを作ります。

## 4. レンダーグラフ（フレームグラフ）

### 問題

現代のフレームには 20 から 100 のパスがあります。シャドウマップ、深度プリパス、G バッファ、SSAO、ライティング、半透明、ボリュメトリクス、TAA、ブルーム、トーンマッピング、UI などです。それぞれがテクスチャを読み書きします。手で書くと、各パスがどのバリアを出すべきか知っていなければならず、1 パスでしか使わないテクスチャもフレーム全体のために確保され、機能をオフにする（例えば低画質設定で SSAO を切る）ためには何か所ものコードを直さなければなりません。

### 考え方

Yuriy O'Donnell の GDC 2017 の講演「FrameGraph: Extensible Rendering Architecture in Frostbite」が、いまでは多くのエンジンが採用している設計を紹介しました。Unreal Engine には **Render Dependency Graph（RDG）** があり、Unity の URP と HDRP は **RenderGraph** を使います。フレームは三つの段階で組み立てられます。

1. **セットアップ**（setup）。各パスは読み書きするリソースを*宣言*し、トランジェントリソースを記述（フォーマットとサイズ）だけで作ります。メモリはまだ確保しません。
2. **コンパイル**（compile）。リソースでつながったパスの DAG であるグラフ全体を解析します。使われないパスを**カリング**し、パスを並べ、各リソースの**寿命**を計算し、**エイリアシング**でメモリを割り当て、宣言された使い方から**バリア**を導きます。
3. **実行**（execute）。各パスの記録コールバックを順に、実際のリソースをバインドして実行します。

何かを実行する前にフレーム全体が分かっているので、コンパイラは単独のパスにはできない大域的な判断を下せます。

### おもちゃのフレームグラフコンパイラ

以下は約 60 行の完全なコンパイラ（Python）です。フレームはディファードレンダラで、シャドウマップ、G バッファ（深度、アルベド、法線）、SSAO、HDR ターゲットへのライティング、法線を可視化するデバッグパス、TAA、ブルーム、そしてスワップチェーンのイメージへのトーンマッピングからなります（`backbuffer` はグラフが所有しない**インポート**（imported）リソースです）。サイズの単位は MB で、1080p での各ターゲットのおおよその大きさです。

```python
from dataclasses import dataclass

@dataclass
class Pass:
    name: str
    reads: list
    writes: list

SIZES = {"shadow_map": 16, "depth": 8, "gbuf_albedo": 8, "gbuf_normal": 8,
         "ssao": 2, "hdr": 16, "taa_out": 16, "bloom": 4, "debug_view": 8}
DEPTH_LIKE = {"shadow_map", "depth"}
IMPORTED = {"backbuffer"}

PASSES = [
    Pass("shadow", [], ["shadow_map"]),
    Pass("gbuffer", [], ["depth", "gbuf_albedo", "gbuf_normal"]),
    Pass("ssao", ["depth", "gbuf_normal"], ["ssao"]),
    Pass("lighting", ["gbuf_albedo", "gbuf_normal", "depth", "ssao", "shadow_map"], ["hdr"]),
    Pass("debug_normals", ["gbuf_normal"], ["debug_view"]),
    Pass("taa", ["hdr", "depth"], ["taa_out"]),
    Pass("bloom", ["taa_out"], ["bloom"]),
    Pass("tonemap", ["taa_out", "bloom"], ["backbuffer"]),
]

def compile_graph(passes, outputs):
    # 1. cull: walk backwards from the outputs through the producers
    writer = {r: p for p in passes for r in p.writes}
    needed, stack = set(), list(outputs)
    while stack:
        r = stack.pop()
        p = writer.get(r)
        if p is not None and p.name not in needed:
            needed.add(p.name)
            stack.extend(p.reads)
    # 2. order: Kahn's topological sort, ties broken by declaration order
    live = [p for p in passes if p.name in needed]
    deps = {p.name: {writer[r].name for r in p.reads if r in writer} for p in live}
    order, done = [], set()
    while len(order) < len(live):
        p = next(p for p in live if p.name not in done and deps[p.name] <= done)
        order.append(p)
        done.add(p.name)
    # 3. lifetimes: first and last pass index that touches each transient resource
    life = {}
    for i, p in enumerate(order):
        for r in p.reads + p.writes:
            if r not in IMPORTED:
                a, b = life.get(r, (i, i))
                life[r] = (min(a, i), max(b, i))
    # 4. aliasing: largest first, lowest offset free of overlaps in time and memory
    placed = {}
    for r in sorted(life, key=lambda r: (-SIZES[r], life[r][0], r)):
        a, b = life[r]
        busy = sorted((placed[q][0], placed[q][0] + SIZES[q]) for q in placed
                      if not (life[q][1] < a or b < life[q][0]))
        off = 0
        for lo, hi in busy:
            if off + SIZES[r] <= lo:
                break
            off = max(off, hi)
        placed[r] = (off, off + SIZES[r])
    # 5. barriers: track each resource's state, emit a transition when it changes
    state = {r: "UNDEFINED" for r in life} | {r: "PRESENT" for r in IMPORTED}
    barriers = []
    for i, p in enumerate(order):
        want = [(r, "SRV") for r in p.reads] + \
               [(r, "DEPTH_WRITE" if r in DEPTH_LIKE else "RT") for r in p.writes]
        for r, s in want:
            if state[r] != s:
                barriers.append((i, r, state[r], s))
                state[r] = s
    for r in IMPORTED:
        if state[r] != "PRESENT":
            barriers.append((len(order), r, state[r], "PRESENT"))
    return order, life, placed, barriers

order, life, placed, barriers = compile_graph(PASSES, outputs=["backbuffer"])
print("culled:", [p.name for p in PASSES if p not in order])
print("order :", [p.name for p in order])
for r in life:
    print(f"{r:12s} life {life[r]}  memory [{placed[r][0]:2d}, {placed[r][1]:2d}) MB")
print("no aliasing:", sum(SIZES[r] for r in life), "MB; aliased heap:",
      max(hi for _, hi in placed.values()), "MB")
for i in range(len(order) + 1):
    items = [f"{r}:{a}->{b}" for j, r, a, b in barriers if j == i]
    print(f"{order[i].name if i < len(order) else '(end)':9s}", ", ".join(items))
```

```text
culled: ['debug_normals']
order : ['shadow', 'gbuffer', 'ssao', 'lighting', 'taa', 'bloom', 'tonemap']
shadow_map   life (0, 3)  memory [ 0, 16) MB
depth        life (1, 4)  memory [32, 40) MB
gbuf_albedo  life (1, 3)  memory [40, 48) MB
gbuf_normal  life (1, 3)  memory [48, 56) MB
ssao         life (2, 3)  memory [56, 58) MB
hdr          life (3, 4)  memory [16, 32) MB
taa_out      life (4, 6)  memory [ 0, 16) MB
bloom        life (5, 6)  memory [16, 20) MB
no aliasing: 78 MB; aliased heap: 58 MB
shadow    shadow_map:UNDEFINED->DEPTH_WRITE
gbuffer   depth:UNDEFINED->DEPTH_WRITE, gbuf_albedo:UNDEFINED->RT, gbuf_normal:UNDEFINED->RT
ssao      depth:DEPTH_WRITE->SRV, gbuf_normal:RT->SRV, ssao:UNDEFINED->RT
lighting  gbuf_albedo:RT->SRV, ssao:RT->SRV, shadow_map:DEPTH_WRITE->SRV, hdr:UNDEFINED->RT
taa       hdr:RT->SRV, taa_out:UNDEFINED->RT
bloom     taa_out:RT->SRV, bloom:UNDEFINED->RT
tonemap   bloom:RT->SRV, backbuffer:PRESENT->RT
(end)     backbuffer:RT->PRESENT
```

出力を順に読んでいきましょう。

**カリング。** 探索は `backbuffer` から始まり、`tonemap` を見つけ、その入力 `taa_out` と `bloom` へ進み、というように `shadow` と `gbuffer` までさかのぼります。`debug_view` を読む者はいないので `debug_normals` には到達せず、カリングされます。`debug_view` も確保されません（図 4）。デバッグ表示やオプションのエフェクトは、使う者がいなければコストがゼロです。SSAO を切るのはセットアップコードの 1 行の変更で済み、ライティングパスを変更する必要はありません。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-graph-dag.svg" caption="例のフレームをパスの DAG として描いたもの。辺のラベルは、その辺を流れるリソースです。コンパイラは backbuffer から逆向きにたどります。debug_normals が作る debug_view は誰も読まないので、出力ごとカリングされます（破線）。" %}

**寿命。** トランジェントリソースは、それに触れる最初のパスから最後のパスまで生きています（図 5 左）。`shadow_map` はパス 0 で書かれ、最後にパス 3 の lighting に読まれます。`depth` はパス 4 まで生きます。TAA がそれを使って再投影するからです。

**エイリアシング。** 寿命が重ならない二つのリソースはメモリを共有できます。アロケータはリソースを大きい順に取り出し、すでに配置したものと時間でもアドレス範囲でもぶつからない、最も低いオフセットに置きます。`taa_out`（16 MB、パス 4-6 で生存）を追ってみましょう。同時に生きている配置済みのリソースは [16, 32) にある `hdr` だけなので、オフセット 0 が空いており、`taa_out` はパス 3 のあとに死んだ `shadow_map` のメモリを再利用します。同様に `bloom` は元の `hdr` の範囲に入ります。ヒープは 78 MB ではなく 58 MB で済み、ここでは 58 MB が最適です。lighting（パス 3）の間、16 + 8 + 8 + 8 + 2 + 16 = 58 MB の六つのリソースが同時に生きているからです（図 5 右）。実際のフレームには寿命の短いターゲットがずっと多くあり、エンジンはレンダーターゲットのメモリの 3 分の 1 以上を節約したと報告しています。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-lifetimes-aliasing.svg" caption="compile_graph の出力。左：実行された 7 パスにわたる各トランジェントリソースの寿命とサイズ。右：各リソースがトランジェントヒープのどこに置かれたか（縦軸：メモリオフセット、横軸：寿命）。taa_out は shadow_map のバイトを、bloom は hdr の一部を再利用するので、ヒープは 78 MB ではなく 58 MB です。破線がヒープのサイズです。" %}

エイリアシングには微妙な点が一つあります。`taa_out` が `shadow_map` のバイトを引き継いだとき、新しいリソースの中身はゴミです。実際の API では、そのメモリに**エイリアシングバリア**（aliasing barrier、D3D12）か `UNDEFINED` からの初期レイアウト遷移（Vulkan）が必要で、読む前にクリアするか全体を上書きしなければなりません。私たちの `UNDEFINED->RT` 遷移は、まさにそれを表しています。

**バリア。** コンパイラはすべての使い方を知っているので、上に示した 18 個の遷移を、それぞれできるだけ遅い時点で、関係するステージだけを対象に出します。これが図 3 の赤い縦線です。実際のコンパイラは、1 パス分のバリアを一つの API 呼び出しにまとめ、さらに**分割バリア**（split barrier：遷移を早めに開始し、使う直前に終える）を使って、GPU がその処理をする時間を確保します。

**非同期コンピュート。** 依存関係のないパス同士は並行に実行できます。このグラフでは、`ssao`（コンピュート向き）は `gbuffer` にしか依存しないので、グラフィックスキューがシャドウマップをラスタライズしている間に、コンパイラはそれを**コンピュートキュー**に割り当てられます。キューをまたぐ辺はセマフォになります。非同期コンピュートが効くのは、二つの仕事が異なるユニットに負荷をかけるときです（影のラスタライズは固定機能ハードウェアが、SSAO は ALU と帯域がボトルネックです）。

### 試してみよう

{% include widget.liquid name="graphics-engine-render-graph" height="560" caption="同じコンパイラがブラウザで動きます。パスをタップするとオフになります（taa をオフにすると、bloom と tonemap は hdr を直接読みます）。チェックボックスで debug_view を出力にすると、debug_normals が復活し、gbuf_normal が長く生きるようになります。左のグラフは寿命、右のグラフはエイリアシング後のヒープ（赤い破線）です。上の行は、エイリアシングの有無によるヒープサイズの比較とバリアの数です。" %}

いくつか実験してみましょう。デバッグ出力をオンにすると、`gbuf_normal` は 1 パス長く生き、`debug_view` に 8 MB 必要になるので、エイリアシングなしの合計は 78 MB から 86 MB に増えます。それでもヒープは 58 MB のままです。`debug_view` が `shadow_map` の解放したバイトにちょうど収まるからです。`shadow` をオフにすると、`taa_out` は新しいメモリを探さなければなりませんが、lighting でのピークが下がるのでヒープは 42 MB に縮みます。`tonemap` をオフにすると、画面に届くものがなくなるので、すべてカリングされます。

## 5. ライティングのアーキテクチャ：フォワード、ディファード、タイル、クラスター

レンダーグラフが骨格なら、どのパスが入るかを決めるのはライティングのアーキテクチャです。問題は、多数のライトをどう効率よく評価するかです。物体数を $N_\text{obj}$、ライト数を $N_L$、ピクセル数を $P$ と書きます。各ライトの評価の背後にあるシェーディングの数学は、[グラフィックス 04]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})と[グラフィックス 11]({{ '/blog/2026/graphics-11-real-time-rendering-techniques/' | relative_url }})にあります。

**フォワードレンダリング**（forward rendering）。各物体を、影響するライトをループするシェーダで 1 回描きます。コストはおおよそ（シェーディングされるフラグメント数）× $N_L$ で、**オーバードロー**（overdraw：シェーディングしたフラグメントが手前のものに隠される）が仕事を無駄にします。半透明や MSAA は自然に扱えます。

**ディファードシェーディング**（deferred shading）。まず全ジオメトリを 1 回描いて **G バッファ**（G-buffer）に書き込みます。G バッファは、ピクセルごとの表面属性（アルベド、法線、ラフネス、深度）を保持する画面サイズのテクスチャの組です。次に、フルスクリーンのパスでライトをループし、各ピクセルを 1 回だけシェーディングします（Deering らが 1988 年に、Saito と Takahashi が 1990 年にこの考えを示し、後者が G バッファという言葉を作りました）。シェーディングはジオメトリの複雑さやオーバードローから切り離されますが、代わりにメモリ帯域（図 7）がかかり、ハードウェア MSAA が使えず、半透明物体には別のフォワードパスが必要です。

**タイルシェーディング**（tiled shading）。ほとんどのライトが小さいとき、ピクセルごとに $N_L$ 個すべてをループするのはまだ無駄です。画面をタイル（例えば 16 × 16 ピクセル）に分けます。コンピュートパスで、各タイルは自分のサブ視錐台と境界球が重なるライトのリストを作り、ピクセルは自分のタイルのリストだけをループします。**Forward+**（Harada、McKee、Yang、2012）は、深度プリパスのあとのフォワードパスで同じタイルごとのライトリストを使います。

**クラスタードシェーディング**（clustered shading）。2D のタイルは深度方向の全範囲にまたがるので、手前のキャラクターと遠くの壁の両方を含むタイルは、両方のライトを集めてしまいます。**クラスタードシェーディング**（Olsson、Billeter、Assarsson、HPG 2012）は深度方向も分割し、**クラスター**（cluster）や **froxel**（frustum voxel、視錐台ボクセル）と呼ばれる 3D のセルを作ります。透視投影では遠いスライスほど広い空間を覆うので、深度スライスは指数的な間隔にします。

$$
z_k = z_\text{near} \left(\frac{z_\text{far}}{z_\text{near}}\right)^{k/S}, \qquad
k(z) = \left\lfloor S\, \frac{\ln(z / z_\text{near})}{\ln(z_\text{far}/z_\text{near})} \right\rfloor
$$

ここで $S$ はスライス数、$k(z)$ はビュー空間の深度 $z$ にあるフラグメントのスライス番号です。$z_\text{near} = 0.5$、$z_\text{far} = 50$、$S = 12$ とすると比は 100 です。$z = 5$ のフラグメントはスライス $k = \lfloor 12 \cdot \ln 10 / \ln 100 \rfloor = 6$ に入り、このスライスは $z \in [5, 7.34]$ を覆います。各フラグメントはタイルと深度から自分のクラスターを求め、そのクラスターのライトリストをループします。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-clustered-lights.svg" caption="48 個のランダムな点光源（青い円）に対して計算したクラスターへのライト割り当てを、視錐台を真上から見た図で示します。画面の 8 列 × 指数的な 12 の深度スライスで、各セルは重なるライトの数で色分けしています。右：4000 個のランダムな表面点で、1 ピクセルが評価しなければならないライトの平均数。2D タイル（その列のどこかにあるライトすべて）と 3D クラスター（その深度の近くのライトだけ）の比較です。" %}

図 6 はおもちゃのデータで計算した効果です。列ごと（タイル）のリストは深度の全範囲にあるすべてのライトを含みますが、クラスターは表面の近くのライトだけを残します。ライト割り当てのパスはクラスター単位のコンピュートシェーダで、リストはインデックスのコンパクトなバッファに入ります。クラスタードシェーディングはフォワードとディファードのどちらのパイプラインとも組み合わせられ、現在の多くのエンジンがクラスタードのフォワードまたはディファードの経路を使っています。

### ビジビリティバッファ

G バッファは*属性*を格納するので帯域を消費し、マテリアルモデルが変わるたびに設計し直す必要があります。**ビジビリティバッファ**（visibility buffer、Burns と Hunt、JCGT 2013）は、各ピクセルを*どの三角形*が覆っているかだけを格納します。32 ビットの ID（三角形とインスタンス）と深度です。あとのパスで三角形の 3 頂点を取得し、ピクセルの重心座標を解析的に計算し直し、属性を補間してシェーディングします。画面サイズのバッファは小さくなり（図 7）、ジオメトリは単純なシェーダで 1 回ラスタライズされるだけで、属性の取得は可視ピクセルに対してだけ行われます。Unreal Engine 5 の Nanite は 64 ビットのビジビリティバッファ（深度とクラスター・三角形の ID）にラスタライズします。詳しくは「Nanite: A Deep Dive」（Karis、Stubbe、Wihlidal、SIGGRAPH 2021）にあります。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-gbuffer-bytes.svg" caption="左：典型的な三つのレイアウトにおける画面サイズのターゲットの 1 ピクセルあたりのバイト数（例示用のレイアウト：32 ビット深度、8 ビット RGBA または 10 ビットでパックした属性、16 ビット浮動小数点の HDR カラー）。右：三つの解像度での 1 フレームあたりのメモリ（MSAA なし）。ビジビリティバッファは、アルベド・法線・マテリアルのチャンネルを 32 ビットの三角形・インスタンス ID 一つで置き換えます。" %}

## 6. GPU 駆動レンダリング

古典的なレンダラでは、CPU がシーンをたどり、物体をカリングし、物体とマテリアルごとに描画コールを 1 回発行します。物体が数十万個になると CPU がボトルネックになります。**GPU 駆動レンダリング**（GPU-driven rendering）は、カリングと描画の生成を GPU に移します。Haar と Aaltonen（「GPU-Driven Rendering Pipelines」、SIGGRAPH 2015 Advances in Real-Time Rendering）と Wihlidal（「Optimizing the Graphics Pipeline with Compute」、GDC 2016）が、いまでは標準となった設計を示しました。

1. メッシュデータはすべて少数の大きなバッファに置き、マテリアルはすべてバインドレス（1 節）にし、各インスタンスは GPU バッファにレコードを持ちます。
2. コンピュートシェーダが、各インスタンス、または 64-128 三角形程度の**クラスター**ごとに視錐台とオクルージョンのテストを行い、生き残ったものの描画引数をバッファに追記します。
3. **間接描画**（indirect draw：`DrawIndexedInstancedIndirect`、`vkCmdDrawIndexedIndirectCount`、WebGPU の `drawIndexedIndirect`）がそのバッファから引数を読みます。シーンの大きさに関係なく、CPU が 1 フレームに発行する呼び出しはわずかです。

### 階層 Z バッファによるオクルージョンカリング

視錐台カリングは視野の外にあるものを取り除きますが、都市では視錐台の中の物体のほとんどが建物の陰に隠れています。**階層 Z バッファ**（hierarchical Z-buffer、HZB。Greene、Kass、Miller、SIGGRAPH 1993）は、オクルージョンテストを安くします。深度バッファのミップチェーンを作り、レベル $\ell + 1$ の各テクセルに、下の $2 \times 2$ テクセルの深度の**最大値**（最も遠い値）を格納します。

$$
H_{\ell+1}(x, y) = \max\{ H_\ell(2x, 2y),\ H_\ell(2x+1, 2y),\ H_\ell(2x, 2y+1),\ H_\ell(2x+1, 2y+1) \}
$$

物体をテストするには、そのバウンディングボックスを、最も近い深度が $z_\text{min}$ の $w \times h$ ピクセルの画面上の長方形に投影します。長方形が最大 $2 \times 2$ テクセルしか覆わないレベル $\ell = \lceil \log_2 \max(w, h) \rceil$ を選び、そのテクセルを読みます。$z_\text{min} > \max H_\ell$ なら、ボックスの下のどのピクセルにもすでにもっと近いものがあるので、物体は隠れています。$10 \times 6$ ピクセルのボックスなら $\ell = \lceil \log_2 10 \rceil = 4$ で、それぞれ $16 \times 16$ ピクセルを要約したテクセルを 4 つ読むだけです。このテストは**保守的**です。隠れている物体を残すことはあります（粗いテクセルの最大値は悲観的です）が、見えている物体をカリングすることはありません。図 8 のとおりです。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-hzb-culling.svg" caption="64 × 64 のおもちゃの深度バッファ（黒 = 手前の遮蔽物、白 = 遠方平面）上での 60 個のランダムなボックスの HZB オクルージョンカリング。各ボックスは式が選んだレベルで最大 4 回の読み取りでテストします。赤：HZB テストでカリング。オレンジ：実際には隠れているが、粗いテクセルが背景も覆うために残されたもの。緑：可視。下：最大深度ピラミッドのミップレベル 1-6。ミップ 5 以降はどのテクセルにも遠方の背景が含まれるため真っ白になり、何もカリングできません。スクリプトは、可視のボックスが一つもカリングされないことをアサートで確認しています。" %}

{% include widget.liquid name="graphics-engine-hzb" height="470" caption="同じ深度バッファでの HZB テスト。箱をドラッグし、サイズと最も近い深度 z_min を変えてみてください。青い破線の四角は、選ばれたレベル L で読むテクセルです（小さなミップ画像にも表示されます）。赤：カリング。オレンジ：実際には隠れているが残される（保守的）。緑：描画され、見えている。箱を遮蔽物の縁にまたがらせると、なぜテストが保守的でなければならないかが分かります。" %}

このフレームの深度がまだないとき、どの深度バッファに対してテストするのでしょうか。よくある答えは**2 段階オクルージョンカリング**（two-phase occlusion culling）です。前のフレームで見えていた物体を描き、その深度から HZB を作り、残りすべてをそれでテストし、新しく見えるようになった物体を描き、次のフレームのために可視リストを更新します。

### メッシュレットとメッシュシェーダ

GPU 駆動パイプラインは**メッシュレット**（meshlet）の粒度でカリングします。メッシュレットは小さな三角形のクラスター（典型的には最大 64 頂点、124 か 126 三角形）で、自分の境界球と法線コーンを持ちます。カメラに背を向けている、視錐台の外にある、あるいは隠れているメッシュレットは、三角形に触れずにスキップされます。図 9 では、辺を共有する隣の三角形へ各メッシュレットを広げ、頂点数か三角形数の上限に達したら止める貪欲な構築器で、トーラスを分割しています。meshoptimizer ライブラリのメッシュレット構築器などが使う貪欲な戦略を単純化したものです。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/02-meshlets.svg" caption="2304 三角形のトーラスを、上限 64 頂点・124 三角形で貪欲にメッシュレット分割した結果（メッシュレットごとに 1 色）。右：メッシュレットごとの三角形数と頂点数をソートしたもの。破線が上限です。規則的なグリッドのコンパクトな領域では各頂点を約 6 個の三角形が共有するので、ほとんどのメッシュレットは先に頂点数の上限に達します。" %}

**メッシュシェーダ**（mesh shader）は、メッシュレットをパイプラインの第一級の存在にします。固定機能の頂点フェッチと頂点シェーダのステージを、コンピュートに似た二つのステージで置き換えます。メッシュレットをカリングして起動するメッシュシェーダのグループ数を決める**タスク**（task、amplification）シェーダと、少数の頂点と三角形を直接ラスタライザに出力する**メッシュ**（mesh）シェーダです。2018 年に NVIDIA の Turing GPU とともに登場し、2020 年に DirectX 12 Ultimate の一部となり、2022 年 8 月に Vulkan で `VK_EXT_mesh_shader` としてベンダー横断で標準化されました。Metal 3 にもあります。Nanite はさらに一歩進み、小さな三角形をコンピュートシェーダでラスタライズします（ソフトウェアラスタライザ）。小さな三角形は、クアッド単位で処理するハードウェアラスタライザの仕事を無駄にするからです。

### ワークグラフ

間接描画で GPU は仕事の*量*を選べるようになりましたが、仕事の*種類*は選べません。パイプラインは依然として CPU が決めています。2024 年 3 月にリリースされた（Agility SDK 1.613）**D3D12 のワークグラフ**（work graphs）では、シェーダがほかのシェーダを起動できます。グラフのノードがレコードを作ってほかのノードに渡し、スケジューリングとメモリはドライバが扱います。例えばカリングのノードが、マテリアルごとのシェーディング処理を直接起動できます。ワークグラフからメッシュシェーダの描画を駆動する**メッシュノード**（mesh nodes）はプレビュー版の Agility SDK（1.715）で導入されました。使う前に現在の状況を確認してください。

## 7. デバッグとプロファイリング

GPU のバグがクラッシュを起こすことはまれです。真っ黒に描画されたり、ちらついたり、遅くなったりします。道具は次のとおりです。

- **RenderDoc**（無料、オープンソース。Vulkan、D3D11/12、OpenGL に対応）：1 フレームをキャプチャし、すべての呼び出しをステップ実行し、任意の時点のテクスチャとバッファを調べ、パイプラインの状態を見て、1 ピクセルについてシェーダをデバッグできます。最初にインストールすべき道具です。
- **PIX on Windows**（Microsoft、D3D12 用）：フレームキャプチャに加えて、キューの重なりも含めて CPU と GPU のタイムラインを一緒に表示するタイミングキャプチャがあります。
- **NVIDIA Nsight Graphics**、**AMD Radeon GPU Profiler**、Xcode の Metal デバッガは、占有率、キャッシュヒット率、どのユニットがボトルネックかといったハードウェアカウンタを見せてくれます。
- **検証レイヤー**：Vulkan の検証レイヤー（同期検証を含む）と D3D12 のデバッグレイヤーは、API の誤用を早期に捕まえます。開発中はオンにしておきましょう。

自分のエンジンの中で計測するには **GPU タイムスタンプクエリ**（timestamp query）を使います。各パスの前後にタイムスタンプを書き、クエリをバッファに解決し、ストールを避けるために 1、2 フレーム後に読み戻します。差にタイムスタンプの周期を掛けたものがそのパスの GPU 時間です（`vkCmdWriteTimestamp`、D3D12 ではタイムスタンプクエリヒープでの `EndQuery`、WebGPU ではオプションの `"timestamp-query"` 機能とパスの `timestampWrites`）。これを置く自然な場所がレンダーグラフです。全パスを自動的にタイムスタンプとデバッグラベルで包むので、RenderDoc や PIX のキャプチャにパスの名前が表示されます。

## 代表的な論文

| 論文 | 会議・論文誌 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Deering et al., *The Triangle Processor and Normal Vector Shader: A VLSI System for High Performance Graphics* | SIGGRAPH | 1988 | [DOI](https://doi.org/10.1145/54852.378468) | 初期のハードウェアによるディファードシェーディング |
| Saito & Takahashi, *Comprehensible Rendering of 3-D Shapes* | SIGGRAPH | 1990 | [DOI](https://doi.org/10.1145/97880.97901) | G バッファを導入 |
| Greene, Kass & Miller, *Hierarchical Z-Buffer Visibility* | SIGGRAPH | 1993 | [DOI](https://doi.org/10.1145/166117.166147) | HZB オクルージョンカリングの深度ピラミッド |
| Harada, McKee & Yang, *Forward+: Bringing Deferred Lighting to the Next Level* | Eurographics（ショートペーパー） | 2012 | [DOI](https://doi.org/10.2312/conf/EG2012/short/005-008) | フォワードレンダラでのタイルごとのライトリスト |
| Olsson, Billeter & Assarsson, *Clustered Deferred and Forward Shading* | HPG | 2012 | [DOI](https://doi.org/10.2312/EGGH/HPG12/087-096) | 3D のライトクラスター。現在のライトカリングの多くの基礎 |
| Burns & Hunt, *The Visibility Buffer: A Cache-Friendly Approach to Deferred Shading* | JCGT 2(2) | 2013 | [JCGT](https://jcgt.org/published/0002/02/04/) | 属性の代わりに三角形 ID を格納 |
| Haar & Aaltonen, *GPU-Driven Rendering Pipelines* | SIGGRAPH Advances in Real-Time Rendering | 2015 | [コースページ](https://advances.realtimerendering.com/s2015/index.html) | 製品での GPU カリング、クラスター、間接描画 |
| Wihlidal, *Optimizing the Graphics Pipeline with Compute* | GDC | 2016 | [GDC Vault](https://gdcvault.com/play/1023109) | コンピュートによるクラスターと三角形のカリング |
| O'Donnell, *FrameGraph: Extensible Rendering Architecture in Frostbite* | GDC | 2017 | [GDC Vault](https://www.gdcvault.com/play/1024612) | 現代のエンジンが使うレンダーグラフの設計 |
| Karis, Stubbe & Wihlidal, *Nanite: A Deep Dive* | SIGGRAPH Advances in Real-Time Rendering | 2021 | [コースページ](https://advances.realtimerendering.com/s2021/index.html) | クラスター階層、ビジビリティバッファ、ソフトウェアラスタライズ |

## 学習リソース

- 『Real-Time Rendering』第 4 版（[realtimerendering.com](https://www.realtimerendering.com/)）。グラフィックスパイプライン、効率的なシェーディング（タイルとクラスター）、高速化アルゴリズムの章。
- [WebGPU Fundamentals](https://webgpufundamentals.org/) で WebGPU をゼロから、[Learn Wgpu](https://sotrh.github.io/learn-wgpu/) で同じ API を Rust で、[vkguide.dev](https://vkguide.dev/) で現代的な Vulkan エンジンのチュートリアルを学べます。
- Hans-Kristian Arntzen「[Render graphs and Vulkan: a deep dive](https://themaister.net/blog/2017/08/15/render-graphs-and-vulkan-a-deep-dive/)」（2017）：レンダーグラフ、バリア、非同期コンピュートの実装を詳しく説明しています。
- エンジンのドキュメント：Unreal の [Render Dependency Graph](https://dev.epicgames.com/documentation/en-us/unreal-engine/render-dependency-graph-in-unreal-engine) と Unity の [URP のレンダーグラフシステム](https://docs.unity.com/en-us/engine/6000.0/manual/render-pipelines/universal-render-pipeline/customizing-urp/render-graph)。
- コード：[meshoptimizer](https://github.com/zeux/meshoptimizer)（メッシュレットの構築とメッシュ最適化）と [niagara](https://github.com/zeux/niagara)（Arseny Kapoulkine が配信しながら書いた、メッシュレットとオクルージョンカリングを備えた小さな GPU 駆動の Vulkan レンダラ）。
- GAMES104 のレンダリングシステムの講義と、[Piccolo](https://github.com/BoomingTech/Piccolo) エンジンのレンダーパス。
- 道具：[RenderDoc](https://renderdoc.org/)、[PIX](https://devblogs.microsoft.com/pix/)、[Nsight Graphics](https://developer.nvidia.com/nsight-graphics)。

## 演習

1. `compile_graph` を拡張して、パスが読むリソースに同じパスが書けるようにしてください（読み・変更・書き込み。例えばライティングのあとに半透明物体を `hdr` に描く場合）。カリングと寿命はどう変える必要がありますか。ヒント：その書き込みをリソースの新しい*バージョン*（`hdr#1`）としてモデル化します。
2. エイリアシングアロケータの「大きい順」を「最初に使われる順」に替えて、例のグラフと、ランダムに作った 30 パスのグラフでヒープサイズを比べてください。それぞれの順序はどんなときに勝ちますか。
3. `Pass` にキューのフィールド（`"graphics"` または `"compute"`）を加え、どのバリアがキューをまたぐセマフォになるかを計算してください。`ssao` をコンピュートキューに置きます。
4. 本文のパラメータで、$z = 20$ のスライス番号とそのスライスの深度範囲を求めてください。透視投影では、なぜ一様なスライスより指数的なスライスのほうが良いのでしょうか。
5. WebGPU の例を変更し、`@builtin(instance_index)` で各三角形をずらしながら、1 回の `draw(3, 10000)` で 10000 個の三角形を描いてください。さらに、ブラウザが `timestamp-query` 機能を提供していれば、それでフレームの GPU 時間を測ってください。

<details markdown="1"><summary>ヒント</summary>

1. 書き込みのたびに新しいバージョンのノードを作ります。読む側は特定のバージョンに依存するので、カリングと順序付けはバージョン単位で、メモリの割り当ては物理リソース単位で行います。
2. 大きい順は詰め込み問題の古典的なヒューリスティックです。寿命が短くサイズが似ているときは、最初に使われる順のほうがうまくいくことが多いです。
4. $k = \lfloor 12 \ln 40 / \ln 100 \rfloor = \lfloor 9.61 \rfloor = 9$、スライスは $[0.5 \cdot 100^{9/12}, 0.5 \cdot 100^{10/12}] = [15.8, 23.2]$ です。指数的なスライスでは、各クラスターの奥行きが幅とほぼ同じになります。

</details>

次回：[第 03 回]({{ '/blog/2026/graphics-engine-03-build-a-mini-engine/' | relative_url }})では、レンダーグラフ、glTF アセット、PBR マテリアル、影を備えた完全なミニエンジンを WebGPU で作ります。
