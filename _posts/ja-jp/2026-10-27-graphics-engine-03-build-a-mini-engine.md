---
layout: post
title: "ミニエンジンを作る: ブラウザ上の WebGPU、glTF、PBR、シャドウ、ECS"
date: 2026-10-27 13:03:00+0900
description: "実践チュートリアル: JavaScript と WGSL で書く小さくても本物のエンジン。固定タイムステップのループ、リソースマネージャ、glTF 2.0 ローダ、オービットカメラ、PBR シェーダ、シャドウマップ、最小限の ECS、パスリスト、GPU タイムスタンプ、デバッグ UI を扱い、Vulkan/C++ および Rust/wgpu での対応にも触れます。"
categories: graphics-engine
tags: [webgpu, wgsl, gltf, pbr, shadow-mapping, ecs, render-graph, engine]
series: graphics-engine
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## なぜ重要か

[第 1 回]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})では、エンジンをレイヤ、ゲームループ、データ指向のストレージ、そしてエンティティ・コンポーネント・システム（ECS, entity component system）に分解しました。[第 2 回]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})では、明示的な GPU API、同期、レンダーグラフ（render graph）を説明しました。この回では、それらの考え方をもう一度組み立て直します。JavaScript と WGSL（WebGPU Shading Language）で、約 900 行の**小さくても本物のエンジン**を書きます。このエンジンは glTF 2.0 モデルを読み込み、物理ベース（physically based）のマテリアルでシェーディングし、影を落とし、固定タイムステップのシミュレーションを実行し、シーンを ECS に保持し、宣言されたパスリストからパスをスケジューリングし、GPU タイムスタンプクエリ（timestamp query）で自分自身を計測します。

目的は、[次の回]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})で扱うエンジンと張り合うことではありません。各部品を一度ずつ自分で書いておけば、それらのソースコードを読んだときにすべてのレイヤを見分けられるようになることが目的です。

## 前提知識

- [第 01 回]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})のエンジンのレイヤ、ゲームループ、ECS。および[第 02 回]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})のデバイス、キュー、バインドグループ（bind group）、パイプライン。
- [グラフィックス第 01 回]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})の同次座標（homogeneous coordinates）とカメラ変換、および[グラフィックス第 02 回]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})のラスタライゼーションパイプライン。
- [グラフィックス第 04 回]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})のマイクロファセット BRDF（ここでは導出し直さず実装します）と、[グラフィックス第 03 回]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})のシャドウマップの考え方。
- モダンな JavaScript（ES モジュール、クラス、`async`/`await`）と、WebGPU が使えるブラウザ。2026 年 11 月時点では、Chrome と Edge は Windows、macOS、ChromeOS でバージョン 113 以降（[Chrome ブログ](https://developer.chrome.com/blog/webgpu-release)）、最近の Android 端末ではバージョン 121 以降、Safari 26 は macOS、iOS、iPadOS、visionOS（[WebKit ブログ](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)）、Firefox は Windows でバージョン 141（[リリースノート](https://www.firefox.com/en-US/firefox/141.0/releasenotes/)）、Apple シリコン搭載 Mac でバージョン 147 が対応しています。

## 1. 作るものとモジュール境界

*mini* と名付けるこのエンジンは、第 01 回のレイヤをそのまま備え、厳格なルールを一つ課します。**モジュールは、自分より下のレイヤからのみ import できる**というルールです。GPU レイヤはエンティティを一切知らず、ECS は GPU を一切知らず、レンダラは ECS を読むだけで決して変更しません。

```text
mini-engine/
  index.html               <canvas> + <script type="module" src="src/main.js">
  assets/DamagedHelmet.glb from the Khronos glTF sample assets
  src/
    main.js                composition root: creates everything, owns the loop
    core/
      math.js              vec3 / quat / mat4 (column-major, WebGPU depth 0..1)
      loop.js              fixed-timestep loop with interpolation
      input.js             pointer, wheel and keyboard state
    gpu/
      device.js            adapter, device, canvas context ("swap chain")
      resources.js         buffers, textures, samplers, shader + pipeline caches
    assets/
      gltf.js              glTF 2.0 / GLB parser -> plain CPU data
    ecs/
      world.js             entities, component stores, queries
    scene/
      transform.js         Transform component, hierarchy, dirty flags
      camera.js            orbit camera controller
    render/
      passes.js            pass list: declare, sort, cull, lifetimes
      renderer.js          shadow, opaque and tonemap passes
      shaders/pbr.wgsl  shadow.wgsl  tonemap.wgsl
    debug/
      timing.js            GPU timestamp queries
      panel.js             tiny HTML debug UI
```

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-modules.svg" caption="ミニエンジンのモジュール依存グラフ。この記事のコードの `import` 行から計算しています。すべての矢印が下向きです。`core`、`gpu`、`ecs` はエンジン内の他のモジュールを一切 import せず、すべてを見渡せるのは `main.js` だけです。上向きの矢印が必要になったとき（たとえばレンダラがコンポーネントを変更する場合）、それは設計上の悪臭（design smell）です。" %}

図が示すように、このグラフは 3 段の DAG（有向非巡回グラフ）です。これがエンジンをテスト可能にしています。`core/math.js`、`ecs/world.js`、`assets/gltf.js`（`ArrayBuffer` を与えた場合）、`render/passes.js` は GPU なしの素の Node.js で動作し、第 12 節ではまさにそれらをテストします。

**他のスタックへの対応。** C++ と Vulkan では、同じ分割は通常、静的ライブラリ（`core`、`rhi`、`scene`、`renderer`）になり、依存ルールは CMake のターゲットで強制されます。Rust の [wgpu](https://github.com/gfx-rs/wgpu) では Cargo ワークスペース内のクレートになり、コンパイラがルールを強制します。依存していないクレートは使えないからです。

## 2. 固定タイムステップのメインループ

第 01 回では、シミュレーションは**固定ステップ**（fixed step）$\Delta t$ で進め、レンダリングはディスプレイが許す任意のレートで動かすべき理由を説明しました。フレーム $k$ の実測時間を $T_k$、まだシミュレーションされていない時間の*アキュムレータ*（accumulator）を $A$ とします。各フレームでは次を行います。

$$
A \leftarrow A + \min(T_k, T_{\max}), \qquad
\text{while } A \ge \Delta t:\ \text{update}(\Delta t),\ A \leftarrow A - \Delta t, \qquad
\alpha = A / \Delta t \in [0, 1).
$$

レンダラは、直近 2 つのシミュレーション状態の*あいだ*の状態 $s = (1-\alpha)\, s_{\text{prev}} + \alpha\, s_{\text{curr}}$ を描画します。クランプ $T_{\max}$（ここでは 0.25 秒）は「死のスパイラル」（spiral of death）を防ぎます。長いヒッチ（hitch）のあとにクランプがないと、ループは数十回の更新で遅れを取り戻そうとし、次のフレームがさらに長くなってしまいます。

**計算例。** $\Delta t = 1/60\ \text{s} \approx 16.67$ ms で、フレーム時間が 10、10、25 ms の場合を考えます。フレーム 1 のあとは $A = 10$ で更新なし、$\alpha = 0.6$ です。フレーム 2 のあとは $A = 20 \ge 16.67$ なので更新 1 回、$A = 3.33$、$\alpha = 0.2$ です。フレーム 3 のあとは $A = 28.33$ で更新 1 回、$A = 11.67$、$\alpha = 0.7$ です。

```js
// src/core/loop.js
// Fixed-timestep loop (post 01): simulate in steps of dt, render with alpha in [0, 1).
export function startLoop({ update, render, dt = 1 / 60, maxFrame = 0.25 }) {
  let acc = 0;
  let last = performance.now() / 1000;
  let running = true;
  function frame(nowMs) {
    if (!running) return;
    const now = nowMs / 1000;
    const frameTime = Math.min(now - last, maxFrame); // clamp: no spiral of death
    last = now;
    acc += frameTime;
    let steps = 0;
    while (acc >= dt) {
      update(dt);
      acc -= dt;
      steps++;
    }
    render(acc / dt, frameTime, steps);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return () => { running = false; };
}
```

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-fixed-timestep.svg" caption="上記のループを、ジッタと 80 ms のヒッチを含む 60-120 Hz のディスプレイを模擬して実行した結果（$\Delta t = 1/50$ s）。上: フレーム境界（灰色の目盛り）とシミュレーションステップ（紫の点）。ほとんどのフレームは 0 回か 1 回のステップで、ヒッチのフレームは 4 回実行します。下: 更新後のアキュムレータ $A$（常に $\Delta t$ 未満、破線）と、レンダラが受け取る補間の重み $\alpha = A/\Delta t$。" %}

この図は、模擬したフレーム時間でこの関数を実際に動かした結果です。シミュレーション自体は完全に等間隔で進むのに、フレームごとのステップ数が不規則になっている点に注目してください。だからこそ、レンダリングでは $\alpha$ による補間が必要になります。

`requestAnimationFrame` は `performance.now()` と同じ時計のタイムスタンプを渡すので、両者を混在させても問題ありません。C++ では `std::chrono::steady_clock` を使い、vsync で表示します。Rust/winit では、同じ関数を `RedrawRequested` イベントから駆動します。

## 3. デバイス、キャンバス、リソース

### 3.1 デバイスと「スワップチェイン」

WebGPU はスワップチェイン（swap chain）を**キャンバスコンテキスト**（canvas context）の裏に隠しています。デバイスとテクスチャフォーマットで一度だけ構成すれば、あとは毎フレーム `context.getCurrentTexture()` が描画先の画像を渡してくれます。描画したタスクがブラウザに制御を返すと、プレゼンテーションは自動的に行われます。

```js
// src/gpu/device.js
export async function initGPU(canvas, { wantTimestamps = true } = {}) {
  if (!navigator.gpu) throw new Error('WebGPU is not available in this browser');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No suitable GPU adapter');
  const requiredFeatures = [];
  if (wantTimestamps && adapter.features.has('timestamp-query')) requiredFeatures.push('timestamp-query');
  const device = await adapter.requestDevice({ requiredFeatures });
  device.lost.then((info) => console.error(`GPU device lost (${info.reason}): ${info.message}`));
  device.addEventListener('uncapturederror', (e) => console.error('WebGPU:', e.error.message));
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat(); // 'bgra8unorm' or 'rgba8unorm'
  context.configure({ device, format, alphaMode: 'opaque' });
  return { device, context, format, canvas, hasTimestamps: requiredFeatures.length > 0 };
}

// Match the drawing buffer to the CSS size times the device pixel ratio (capped at 2).
export function resizeCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width === w && canvas.height === h) return false;
  canvas.width = w;
  canvas.height = h;
  return true;
}
```

**Vulkan/C++。** この 1 つの関数は数百行になります。`VkInstance` を作成し、`VkPhysicalDevice` を選び、`VkDevice` とキューを作成し、`VkSurfaceKHR` と `VkSwapchainKHR` を作成します。そして毎フレーム、（セマフォを使って）画像を取得し、描画し、（別のセマフォを待って）プレゼンテーションを行い、CPU が 2〜3 フレームより先に進まないようフェンスで制御します。**Rust/wgpu** は WebGPU の形をそのまま保っています。`Instance`、`Adapter`、`Device` と `Queue`、`Surface::configure` を用意し、毎フレーム `surface.get_current_texture()` と `frame.present()` を呼びます。

### 3.2 リソースマネージャ

どのエンジンにも、GPU オブジェクトを所有する層があり、他のコードが場当たり的にそれらを作らずに済むようになっています。このエンジンのリソースマネージャは 4 つのことを行います。

1. **バッファ**を、作成時点で内容を埋めた状態（`mappedAtCreation`）で作成します。サイズは WebGPU の要求に従って 4 バイトの倍数に切り上げます。
2. **テクスチャ**を、デコード済みの画像から作成します。色空間は呼び出し側が選びます（色には `rgba8unorm-srgb`、粗さのようなデータには `rgba8unorm`）。
3. **サンプラ、シェーダモジュール、パイプラインをキーでキャッシュ**します。パイプラインの作成はシェーダをコンパイルするため数ミリ秒かかることがあり、オブジェクトごとではなく*バリアント*ごとに一度だけ行う必要があります。
4. **統計**を保持し、デバッグ UI がオブジェクト数とバイト数を表示できるようにします。

```js
// src/gpu/resources.js
export class Resources {
  constructor(device) {
    this.device = device;
    this.cache = new Map(); // key -> sampler | shader module | pipeline
    this.owned = [];        // buffers and textures we must destroy
    this.stats = { buffers: 0, bufferBytes: 0, textures: 0, pipelines: 0 };
  }

  buffer(label, data, usage) {
    const size = Math.max(4, Math.ceil(data.byteLength / 4) * 4);
    const buf = this.device.createBuffer({
      label, size, usage: usage | GPUBufferUsage.COPY_DST, mappedAtCreation: true,
    });
    new Uint8Array(buf.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    buf.unmap();
    this.owned.push(buf);
    this.stats.buffers++;
    this.stats.bufferBytes += size;
    return buf;
  }

  uniform(label, byteSize) {
    const size = Math.ceil(byteSize / 16) * 16;
    const buf = this.device.createBuffer({ label, size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.owned.push(buf);
    this.stats.buffers++;
    this.stats.bufferBytes += size;
    return buf;
  }

  texture(label, bitmap, srgb) {
    const tex = this.device.createTexture({
      label,
      size: [bitmap.width, bitmap.height],
      format: srgb ? 'rgba8unorm-srgb' : 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: tex }, [bitmap.width, bitmap.height]);
    this.owned.push(tex);
    this.stats.textures++;
    return tex;
  }

  solidTexture(key, rgba) {
    return this.cached(`solid|${key}`, () => {
      const tex = this.device.createTexture({
        size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      this.device.queue.writeTexture({ texture: tex }, new Uint8Array(rgba), { bytesPerRow: 4 }, [1, 1]);
      this.owned.push(tex);
      return tex;
    });
  }

  sampler(desc) {
    return this.cached(`sampler|${JSON.stringify(desc)}`, () => this.device.createSampler(desc));
  }

  shader(key, code) {
    return this.cached(`shader|${key}`, () => this.device.createShaderModule({ label: key, code }));
  }

  pipeline(key, makeDescriptor) {
    return this.cached(`pipeline|${key}`, () => {
      this.stats.pipelines++;
      return this.device.createRenderPipeline(makeDescriptor());
    });
  }

  cached(key, make) {
    let v = this.cache.get(key);
    if (v === undefined) {
      v = make();
      this.cache.set(key, v);
    }
    return v;
  }

  destroy() {
    for (const r of this.owned) r.destroy();
    this.owned.length = 0;
    this.cache.clear();
  }
}
```

パイプラインのキーは、コンパイル結果のパイプラインを変えるすべての要素を符号化した文字列です。たとえば `pbr|rgba16float|cull-back` のようになります。実際のエンジンでは、マテリアルのシェーダバリアント、頂点レイアウト、レンダーターゲットのフォーマットからキーを組み立て、ロード中に `createRenderPipelineAsync` でパイプラインを作成して、最初のフレームが止まらないようにします。Vulkan で対応するオブジェクトは `VkPipelineCache`（コンパイル済みパイプラインをディスクに永続化するためのもの）と、VMA のようなメモリアロケータです。wgpu では `Device::create_render_pipeline` と、自前のパイプラインの `HashMap` が対応します。

**ユニフォームのアライメント。** すべてのオブジェクトのモデル行列を 1 つの大きなユニフォームバッファに格納し、*動的オフセット*（dynamic offset）で選択します。WebGPU はこれらのオフセットが `minUniformBufferOffsetAlignment` の倍数であることを要求し、既定値は 256 バイトです。モデル行列は 64 バイトなので、各オブジェクトは 256 バイトのスロットを占有します。オブジェクト $i$ はバイト $256\,i$ に置かれ、1024 個のオブジェクトには 256 KiB が必要で、そのうち 75 % がパディングです。このトレードオフ（バイトの無駄と引き換えに、バッファ書き込みを 1 回に抑え、オブジェクトごとのバインドグループを不要にすること）はほぼ常に引き合います。インスタンス ID で添字を引くストレージバッファを使えばパディングをなくせます。これは演習の一つです。

## 4. glTF 2.0 の読み込み

[glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) は「3D の JPEG」です。JSON によるシーン記述とバイナリバッファからなり、別々のファイル（`.gltf` + `.bin` + 画像）としても、1 つのバイナリ `.glb` にまとめた形でも扱えます。GPU バッファへ直接読み込めるように設計されており、まさにそのためにその構造はエンジンのデータ設計の教材になります。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-gltf-structure.svg" caption="glTF 2.0 ファイルの参照チェーン。メッシュ 1 つの小さな例について描いています。すべての矢印は、トップレベルの配列への整数インデックスです。ジオメトリは node → mesh → primitive → accessor → bufferView → buffer とたどり、見た目は primitive → material → texture → image と sampler とたどります。このローダはまさにこれらの矢印をたどります。" %}

図は上から読んでください。**シーン**（scene）はルートの**ノード**（node）を列挙します。ノードはローカル変換（4x4 の `matrix`、または `translation`、クォータニオンの `rotation`、`scale` で、$T R S$ として合成されます）、任意の `children`、任意の**メッシュ**（mesh）を持ちます。メッシュは**プリミティブ**（primitive）のリストで、各プリミティブは 1 回のドローコールに相当します。頂点属性の集合（`POSITION`、`NORMAL`、`TEXCOORD_0` など）、任意の `indices`、そして**マテリアル**（material）からなります。すべての属性は**アクセッサ**（accessor）で、これは **bufferView**（`componentType`、`type`、`count` を持つ型付きのビュー）への参照です。bufferView は **buffer** のバイト範囲（`byteOffset`、`byteLength`、任意の `byteStride`）です。

唯一の算術は、アクセッサの要素 $i$、成分 $c$ のアドレスです。

$$
\text{addr}(i, c) = \text{bufferView.byteOffset} + \text{accessor.byteOffset} + i \cdot \text{stride} + c \cdot \text{sizeof(component)},
$$

ここで $\text{stride}$ は `byteStride` があればその値、なければパックされた要素サイズ（`FLOAT` の `VEC3` なら 12 バイト）です。

**計算例。** インターリーブされた頂点バッファが、頂点ごとに位置（12 バイト）、法線（12）、UV（8）を格納しているとすると、`byteStride = 32` です。`NORMAL` アクセッサは `byteOffset = 12` を持ちます。頂点 2 の法線は $0 + 12 + 2 \cdot 32 = 76$ から始まり、その $z$ 成分は $76 + 2 \cdot 4 = 84$ にあります。下の図はこのインターリーブ配置をバイト単位で描いたものです。太い枠のセルを探してみてください。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-accessor-layout.svg" caption="このインターリーブされた bufferView のバイトレイアウト。赤・緑・青のセルはそれぞれ位置・法線・UV の 4 バイト成分です。3 つのアクセッサ（POSITION はオフセット 0、NORMAL は 12、TEXCOORD_0 は 24）が 32 バイトの 1 つのストライドを共有するので、同じアクセッサの隣り合う要素は 32 バイト離れています。太い枠のセルが計算例で、バイト 84 は頂点 2 の法線の z です。インデックスのアクセッサは、別のぎっしり詰まった bufferView にあり、図には描いていません。" %}

以下のローダは、`.gltf` と `.glb`、外部および埋め込みのバッファと画像、正規化整数の属性を扱い、ファイルに法線がない場合は法線を計算します。スパースアクセッサ、スキン、モーフターゲット、アニメーション、カメラ、拡張は意図的に省略しています（よい演習になります）。GLB ヘッダの形に注目してください。マジックナンバー `0x46546C67`（ASCII バイト列で `glTF`）、バージョン 2、続いて `JSON` と `BIN` のタグが付いたチャンクが並びます。

```js
// src/assets/gltf.js  (glTF 2.0 -> plain CPU data; no GPU calls, no engine imports)
const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const ARRAY = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const GETTER = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const WRAP = { 33071: 'clamp-to-edge', 33648: 'mirror-repeat', 10497: 'repeat' };

export function parseGLB(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB file');
  if (dv.getUint32(4, true) !== 2) throw new Error('only glTF 2.0 is supported');
  let offset = 12, json = null, bin = null;
  while (offset < dv.byteLength) {
    const length = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    const body = arrayBuffer.slice(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body)); // 'JSON'
    else if (type === 0x004e4942) bin = body;                                    // 'BIN\0'
    offset += 8 + length;
  }
  return { json, bin };
}

export function readAccessor(json, buffers, index) {
  const acc = json.accessors[index];
  const n = NUM_COMPONENTS[acc.type];
  const Out = acc.normalized ? Float32Array : ARRAY[acc.componentType];
  const out = new Out(acc.count * n);
  if (acc.bufferView === undefined) return out; // all zeros (sparse data is not handled)
  const view = json.bufferViews[acc.bufferView];
  const size = ARRAY[acc.componentType].BYTES_PER_ELEMENT;
  const stride = view.byteStride || n * size;
  const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const dv = new DataView(buffers[view.buffer]);
  const get = DataView.prototype[GETTER[acc.componentType]];
  const scale = acc.normalized ? NORM[acc.componentType] : 1;
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) {
      const v = get.call(dv, start + i * stride + c * size, true);
      out[i * n + c] = acc.normalized ? Math.max(v / scale, -1) : v;
    }
  }
  return out;
}

function computeNormals(pos, idx) {
  const nrm = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) nrm[v + k] += n[k]; // area-weighted
  }
  for (let v = 0; v < nrm.length; v += 3) {
    const l = Math.hypot(nrm[v], nrm[v + 1], nrm[v + 2]) || 1;
    nrm[v] /= l; nrm[v + 1] /= l; nrm[v + 2] /= l;
  }
  return nrm;
}

// Interleave into our engine's single vertex format: position, normal, uv (32 bytes).
function buildPrimitive(json, buffers, prim) {
  if ((prim.mode ?? 4) !== 4) throw new Error('only triangle lists are supported');
  const pos = readAccessor(json, buffers, prim.attributes.POSITION);
  const count = pos.length / 3;
  let idx;
  if (prim.indices !== undefined) idx = Uint32Array.from(readAccessor(json, buffers, prim.indices));
  else idx = Uint32Array.from({ length: count }, (_, i) => i);
  const nrm = prim.attributes.NORMAL !== undefined ? readAccessor(json, buffers, prim.attributes.NORMAL) : computeNormals(pos, idx);
  const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(json, buffers, prim.attributes.TEXCOORD_0) : new Float32Array(count * 2);
  const vertices = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    vertices.set([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2], nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2], uv[2 * i], uv[2 * i + 1]], 8 * i);
  }
  return { vertices, indices: idx, material: prim.material ?? -1 };
}

function parseMaterial(m, json) {
  const pbr = m.pbrMetallicRoughness || {};
  const samplerOf = (t) => {
    const s = t === undefined ? undefined : json.samplers?.[json.textures[t.index].sampler];
    return {
      magFilter: s?.magFilter === 9728 ? 'nearest' : 'linear',
      minFilter: s?.minFilter === 9728 ? 'nearest' : 'linear',
      addressModeU: WRAP[s?.wrapS ?? 10497],
      addressModeV: WRAP[s?.wrapT ?? 10497],
    };
  };
  return {
    name: m.name || '',
    baseColorFactor: pbr.baseColorFactor || [1, 1, 1, 1],
    metallicFactor: pbr.metallicFactor ?? 1,
    roughnessFactor: pbr.roughnessFactor ?? 1,
    // We do not sample emissiveTexture; its factor alone would make the whole surface glow.
    emissiveFactor: m.emissiveTexture ? [0, 0, 0] : m.emissiveFactor || [0, 0, 0],
    baseColorTexture: pbr.baseColorTexture ? json.textures[pbr.baseColorTexture.index].source : -1,
    metallicRoughnessTexture: pbr.metallicRoughnessTexture ? json.textures[pbr.metallicRoughnessTexture.index].source : -1,
    sampler: samplerOf(pbr.baseColorTexture),
    doubleSided: !!m.doubleSided,
  };
}

async function loadImage(json, buffers, base, i) {
  const img = json.images[i];
  let blob;
  if (img.bufferView !== undefined) {
    const v = json.bufferViews[img.bufferView];
    blob = new Blob([new Uint8Array(buffers[v.buffer], v.byteOffset || 0, v.byteLength)], { type: img.mimeType });
  } else {
    blob = await (await fetch(new URL(img.uri, base))).blob();
  }
  // glTF stores color textures sRGB-encoded: do not let the browser convert them
  return createImageBitmap(blob, { colorSpaceConversion: 'none' });
}

export async function loadGLTF(url) {
  const base = new URL(url, location.href);
  const response = await fetch(base);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  let json, bin = null;
  if (new DataView(bytes).getUint32(0, true) === 0x46546c67) ({ json, bin } = parseGLB(bytes));
  else json = JSON.parse(new TextDecoder().decode(bytes));
  const buffers = await Promise.all((json.buffers || []).map(async (b) =>
    b.uri === undefined ? bin : (await fetch(new URL(b.uri, base))).arrayBuffer()));

  const meshes = (json.meshes || []).map((m) => m.primitives.map((p) => buildPrimitive(json, buffers, p)));
  const materials = (json.materials || []).map((m) => parseMaterial(m, json));
  const images = await Promise.all((json.images || []).map((_, i) => loadImage(json, buffers, base, i)));
  const nodes = (json.nodes || []).map((n) => ({
    name: n.name || '',
    mesh: n.mesh ?? -1,
    children: n.children || [],
    matrix: n.matrix ? Float32Array.from(n.matrix) : null, // column-major, like ours
    t: n.translation || [0, 0, 0],
    r: n.rotation || [0, 0, 0, 1],
    s: n.scale || [1, 1, 1],
  }));
  const scene = json.scenes?.[json.scene ?? 0];
  const roots = scene ? scene.nodes : nodes.map((_, i) => i);
  return { nodes, roots, meshes, materials, images };
}
```

正しい画像にするために重要な点が 2 つあります。色のテクスチャ（`baseColorTexture`、`emissiveTexture`）は sRGB で符号化されているので、サンプリングが*線形*な値を返すよう、`rgba8unorm-srgb` としてアップロードしなければなりません。`metallicRoughnessTexture` はデータを保持しており（粗さは緑チャンネル、金属度は青チャンネル）、`rgba8unorm` のままにしなければなりません。また、glTF は右手系で $+Y$ が上、単位はメートルであり、このエンジンの数学ライブラリと同じ規約なので、軸の反転は不要です。

このローダが返すのは GPU オブジェクトではなく、素の配列です。この分離（CPU でパースし、レンダラでアップロードする）のおかげで、同じパーサを単体テスト、ワーカースレッド、オフラインのアセットクッカー（asset cooker、第 14 節）のどれでも動かせます。

## 5. 数学ライブラリと入力付きカメラ

### 5.1 規約

行列は 16 個の浮動小数点数を**列優先**（column-major）順（要素 $(r, c)$ はインデックス $4c + r$）で格納します。WGSL、glTF、OpenGL と同じです。ビュー空間は右手系で、$-z$ 方向を向きます。OpenGL と異なる点は射影だけで、WebGPU のクリップ空間の深度は $[-1, 1]$ ではなく $[0, 1]$ の範囲です。垂直視野角 $\theta$、アスペクト比 $a$、ニアおよびファー平面 $n, f$ に対し、$s = 1/\tan(\theta/2)$ とすると次のようになります。

$$
P = \begin{pmatrix} s/a & 0 & 0 & 0 \\ 0 & s & 0 & 0 \\ 0 & 0 & \frac{f}{n-f} & \frac{nf}{n-f} \\ 0 & 0 & -1 & 0 \end{pmatrix}.
$$

検算: $z_v = -n$ の点は $z_c = \frac{-fn + nf}{n-f} = 0$ となり、$z_v = -f$ では $z_c = \frac{-f^2 + nf}{n-f} = f = w_c$ となるので、深度 $z_c/w_c$ は 0 から 1 まで変化します。

```js
// src/core/math.js  (column-major 4x4 matrices in Float32Array(16))
export const vec3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  normalize: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

export const quat = {
  fromAxisAngle(axis, angle) {
    const [x, y, z] = vec3.normalize(axis), s = Math.sin(angle / 2);
    return [x * s, y * s, z * s, Math.cos(angle / 2)];
  },
};

export const mat4 = {
  create: () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },

  multiply(out, a, b) { // out = a * b (out may alias neither a nor b)
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[4 * c + r] = a[r] * b[4 * c] + a[4 + r] * b[4 * c + 1] + a[8 + r] * b[4 * c + 2] + a[12 + r] * b[4 * c + 3];
      }
    }
    return out;
  },

  fromTRS(out, t, q, s) { // T * R(q) * S, q = [x, y, z, w]
    const [x, y, z, w] = q;
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    out[0] = (1 - 2 * (yy + zz)) * s[0]; out[1] = 2 * (xy + wz) * s[0];       out[2] = 2 * (xz - wy) * s[0];       out[3] = 0;
    out[4] = 2 * (xy - wz) * s[1];       out[5] = (1 - 2 * (xx + zz)) * s[1]; out[6] = 2 * (yz + wx) * s[1];       out[7] = 0;
    out[8] = 2 * (xz + wy) * s[2];       out[9] = 2 * (yz - wx) * s[2];       out[10] = (1 - 2 * (xx + yy)) * s[2]; out[11] = 0;
    out[12] = t[0]; out[13] = t[1]; out[14] = t[2]; out[15] = 1;
    return out;
  },

  lookAt(out, eye, target, up) { // right-handed view matrix: camera looks down -z
    const z = vec3.normalize(vec3.sub(eye, target));
    const x = vec3.normalize(vec3.cross(up, z));
    const y = vec3.cross(z, x);
    out.set([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -vec3.dot(x, eye), -vec3.dot(y, eye), -vec3.dot(z, eye), 1]);
    return out;
  },

  perspective(out, fovY, aspect, near, far) { // WebGPU clip depth in [0, 1]
    const s = 1 / Math.tan(fovY / 2);
    out.fill(0);
    out[0] = s / aspect; out[5] = s;
    out[10] = far / (near - far); out[11] = -1;
    out[14] = (near * far) / (near - far);
    return out;
  },

  ortho(out, l, r, b, t, near, far) { // WebGPU clip depth in [0, 1]
    out.fill(0);
    out[0] = 2 / (r - l); out[5] = 2 / (t - b); out[10] = 1 / (near - far);
    out[12] = -(r + l) / (r - l); out[13] = -(t + b) / (t - b); out[14] = near / (near - far); out[15] = 1;
    return out;
  },

  transformPoint(m, p) { // returns [x, y, z, w] = m * (p, 1)
    const out = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) out[r] = m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r];
    return out;
  },
};
```

**計算例（Node に貼り付けて試せます）。** カメラを $(0, 0, 3)$ に置いて原点を向け、$\theta = 60°$、$a = 1$、$n = 0.1$、$f = 100$ とします。原点は画面の中央に、深度が 1 をわずかに下回る位置（透視投影の深度は非常に非線形です）に来るはずで、点 $(1, 0, 0)$ は $x_{\text{ndc}} = s/3 = 1.732/3 \approx 0.577$ に来るはずです。

```js
// node --input-type=module < check-math.mjs   (with math.js in the same folder)
import { mat4 } from './math.js';
const view = mat4.lookAt(mat4.create(), [0, 0, 3], [0, 0, 0], [0, 1, 0]);
const proj = mat4.perspective(mat4.create(), Math.PI / 3, 1, 0.1, 100);
const vp = mat4.multiply(mat4.create(), proj, view);
for (const p of [[0, 0, 0], [1, 0, 0]]) {
  const [x, y, z, w] = mat4.transformPoint(vp, p);
  console.log(p, 'ndc =', [x / w, y / w, z / w].map((v) => v.toFixed(4)));
}
// [0,0,0] ndc = [0.0000, 0.0000, 0.9676]
// [1,0,0] ndc = [0.5774, 0.0000, 0.9676]
```

わずか 3 m 先の点（ファー平面は 100 m）で深度が 0.9676 になるのは、透視投影の深度が抱える有名な精度問題です。$[0,1]$ の範囲の大半がカメラの近くで消費されてしまいます。実運用のエンジンは**リバース Z**（reversed-Z、ニアを 1、ファーを 0 に対応させ、浮動小数点の深度バッファを使う）を採用します。これも演習の一つです。

### 5.2 入力とオービットカメラ

**オービットカメラ**（orbit camera）は、ターゲット点 $\mathbf{t}$、距離 $r$、ヨー $\psi$、ピッチ $\phi$ を保持し、視点を球面上に置きます。

$$
\mathbf{e} = \mathbf{t} + r\,(\cos\phi \sin\psi,\ \sin\phi,\ \cos\phi \cos\psi).
$$

ドラッグで $\psi$ と $\phi$ が変化します（`lookAt` の `up` ベクトルが視線方向と平行にならないよう、ピッチは $\pm 90°$ 未満にクランプします）。ホイールは $r$ を幾何級数的にスケールし（1 ノッチあたり 10 %。どの距離でもズームの感覚が同じになります）、WASD はターゲットをカメラの水平面内で動かします。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-orbit-camera.svg" caption="既定のパラメータ（$r = 4$、$\psi = 0.6$、$\phi = 0.35$）でのオービットカメラ。ターゲット $\mathbf{t}$ を中心とする球面上の視点 $\mathbf{e}$ を示します。円弧はヨー角 $\psi$（水平面内で $+z$ 軸から測る）とピッチ角 $\phi$ を表し、細い破線はワールド座標軸です。視点にある 3 本の矢印は `lookAt` が計算するカメラ基底（赤が右向きの $x_c$、緑が上向きの $y_c$、青がターゲットから離れる後ろ向きの $z_c$）です。視錐台は視野角 60° で描き、見やすさのため 1.5 単位のところで切っています。" %}

図が示すように、カメラの $z$ 軸はカメラが見ている対象から*離れる*向きを指します。射影行列の最終行に $-1$ があるのはそのためです。

```js
// src/core/input.js
export class Input {
  constructor(el) {
    this.keys = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.pointers = new Map();
    el.style.touchAction = 'none'; // let pointer events handle touch drags
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (this.pointers.size === 1) { this.dx += e.clientX - p.x; this.dy += e.clientY - p.y; }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e) => this.pointers.delete(e.pointerId);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }
  endFrame() { this.dx = 0; this.dy = 0; this.wheel = 0; }
}
```

```js
// src/scene/camera.js
import { mat4 } from '../core/math.js';

export class OrbitCamera {
  constructor({ target = [0, 0, 0], radius = 4, yaw = 0.6, pitch = 0.35, fovY = Math.PI / 3, near = 0.05, far = 100 } = {}) {
    Object.assign(this, { target: [...target], radius, yaw, pitch, fovY, near, far });
    this.view = mat4.create(); this.proj = mat4.create(); this.viewProj = mat4.create();
  }
  update(input, dt) { // called once per rendered frame with the real frame time
    this.yaw -= input.dx * 0.005;
    this.pitch = Math.min(1.5, Math.max(-1.5, this.pitch + input.dy * 0.005));
    this.radius = Math.min(50, Math.max(0.2, this.radius * Math.pow(1.1, input.wheel)));
    const speed = this.radius * dt; // move faster when zoomed out
    const fwd = [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)], right = [-fwd[2], 0, fwd[0]];
    const k = input.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    for (let i = 0; i < 3; i++) this.target[i] += speed * (f * fwd[i] + s * right[i]);
  }
  eye() {
    const c = Math.cos(this.pitch), t = this.target, r = this.radius;
    return [t[0] + r * c * Math.sin(this.yaw), t[1] + r * Math.sin(this.pitch), t[2] + r * c * Math.cos(this.yaw)];
  }
  matrices(aspect) {
    mat4.lookAt(this.view, this.eye(), this.target, [0, 1, 0]);
    mat4.perspective(this.proj, this.fovY, aspect, this.near, this.far);
    mat4.multiply(this.viewProj, this.proj, this.view);
    return this;
  }
}
```

カメラは固定のシミュレーションステップではなく、*描画*フレームごとに 1 回更新します。入力は即座に反映されるべきであり、カメラは物理演算に関与しないからです。Vulkan では入力を GLFW や SDL で読み取り、Rust では `winit` のイベントで読み取ります。数学は同一です。

## 6. WGSL による PBR マテリアルシェーダ

理論は[グラフィックス第 04 回]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})にあり、ここではそれをコードに写すだけです。色（強度を掛け済み）が $E_L$ の 1 つの平行光源が、法線 $\mathbf{n}$ の面に方向 $\mathbf{l}$ から到来するとき、視点方向 $\mathbf{v}$ への出射放射輝度は次のようになります。

$$
L_o = \Big( \underbrace{(1 - F)(1 - m)\,\frac{\mathbf{c}}{\pi}}_{\text{diffuse}} + \underbrace{D(\mathbf{h})\, V(\mathbf{v}, \mathbf{l})\, F(\mathbf{v}, \mathbf{h})}_{\text{specular}} \Big)\, E_L\, (\mathbf{n} \cdot \mathbf{l})\, s,
$$

ここで $\mathbf{c}$ はベースカラー、$m$ は金属度（metalness）、$\mathbf{h}$ はハーフベクトル、$D$ は $\alpha = \text{roughness}^2$ とする GGX 分布、$V$ は高さ相関 Smith 可視性項（height-correlated Smith visibility term、分母の $1/(4\, \mathbf{n}\cdot\mathbf{v}\, \mathbf{n}\cdot\mathbf{l})$ をすでに含みます）、$F$ は $F_0 = \text{mix}(0.04, \mathbf{c}, m)$ とする Schlick のフレネル項、$s \in [0, 1]$ は次節のシャドウ係数です。これは glTF の metallic-roughness モデルで、Filament や Unreal Engine 4 が使っているものと同じです。

```wgsl
// src/render/shaders/pbr.wgsl
struct Frame {
  viewProj : mat4x4f,
  lightViewProj : mat4x4f,
  cameraPos : vec3f,
  _pad0 : f32,
  lightDir : vec3f,     // direction the light travels (normalized)
  shadowBias : f32,
  lightColor : vec3f,   // already multiplied by intensity
  ambient : f32,
};
struct Material {
  baseColor : vec4f,
  emissive : vec3f,
  metallic : f32,
  roughness : f32,
};
struct Object { model : mat4x4f };

@group(0) @binding(0) var<uniform> frame : Frame;
@group(0) @binding(1) var shadowMap : texture_depth_2d;
@group(0) @binding(2) var shadowSampler : sampler_comparison;
@group(1) @binding(0) var<uniform> material : Material;
@group(1) @binding(1) var baseColorTex : texture_2d<f32>;
@group(1) @binding(2) var metalRoughTex : texture_2d<f32>;
@group(1) @binding(3) var texSampler : sampler;
@group(2) @binding(0) var<uniform> object : Object;

struct VSIn {
  @location(0) position : vec3f,
  @location(1) normal : vec3f,
  @location(2) uv : vec2f,
};
struct VSOut {
  @builtin(position) clip : vec4f,
  @location(0) worldPos : vec3f,
  @location(1) normal : vec3f,
  @location(2) uv : vec2f,
  @location(3) lightClip : vec4f,
};

@vertex fn vs(v : VSIn) -> VSOut {
  let world = object.model * vec4f(v.position, 1.0);
  var o : VSOut;
  o.clip = frame.viewProj * world;
  o.worldPos = world.xyz;
  o.normal = (object.model * vec4f(v.normal, 0.0)).xyz; // valid for uniform scale only
  o.uv = v.uv;
  o.lightClip = frame.lightViewProj * world;
  return o;
}

const PI = 3.14159265359;

fn D_GGX(NdotH : f32, a : f32) -> f32 {
  let a2 = a * a;
  let d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

fn V_SmithGGXCorrelated(NdotV : f32, NdotL : f32, a : f32) -> f32 {
  let a2 = a * a;
  let gv = NdotL * sqrt(NdotV * NdotV * (1.0 - a2) + a2);
  let gl = NdotV * sqrt(NdotL * NdotL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}

fn F_Schlick(VdotH : f32, f0 : vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(1.0 - VdotH, 5.0);
}

fn shadowFactor(lightClip : vec4f) -> f32 {
  let ndc = lightClip.xyz / lightClip.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5); // NDC y is up, texture v is down
  let refDepth = ndc.z - frame.shadowBias;
  let texel = 1.0 / vec2f(textureDimensions(shadowMap));
  var lit = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {   // 3x3 PCF, each tap already 2x2-filtered by the hardware
      lit += textureSampleCompareLevel(shadowMap, shadowSampler, uv + vec2f(f32(x), f32(y)) * texel, refDepth);
    }
  }
  let inside = all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0)) && refDepth <= 1.0;
  return select(1.0, lit / 9.0, inside);
}

@fragment fn fs(in : VSOut) -> @location(0) vec4f {
  let base = textureSample(baseColorTex, texSampler, in.uv) * material.baseColor;
  let mr = textureSample(metalRoughTex, texSampler, in.uv);
  let metallic = material.metallic * mr.b;
  let roughness = clamp(material.roughness * mr.g, 0.045, 1.0);
  let a = roughness * roughness;

  let N = normalize(in.normal);
  let V = normalize(frame.cameraPos - in.worldPos);
  let L = -frame.lightDir;
  let H = normalize(V + L);
  let NdotL = max(dot(N, L), 0.0);
  let NdotV = max(dot(N, V), 1e-4);
  let NdotH = max(dot(N, H), 0.0);
  let VdotH = max(dot(V, H), 0.0);

  let f0 = mix(vec3f(0.04), base.rgb, metallic);
  let F = F_Schlick(VdotH, f0);
  let specular = D_GGX(NdotH, a) * V_SmithGGXCorrelated(NdotV, NdotL, a) * F;
  let diffuse = (vec3f(1.0) - F) * (1.0 - metallic) * base.rgb / PI;
  let direct = (diffuse + specular) * frame.lightColor * NdotL * shadowFactor(in.lightClip);
  let ambient = frame.ambient * base.rgb * (1.0 - 0.5 * metallic); // crude stand-in for image-based lighting
  return vec4f(direct + ambient + material.emissive, base.a);
}
```

このシェーダには、エンジンレベルの論点が 3 つ隠れています。

1. **更新頻度によるバインドグループ分け。** グループ 0 はフレームごとに 1 回、グループ 1 はマテリアルごとに 1 回、グループ 2 はオブジェクトごとに 1 回変わります。レンダラは描画をマテリアル順にソートし、グループ 1 の切り替えをできるだけ減らします。Vulkan も同じモデル（ディスクリプタセット、descriptor set）を持ちます。D3D12 は同じ目的のためにルートシグネチャ（root signature）とディスクリプタテーブル（descriptor table）を使います。
2. **WGSL の構造体レイアウトは JavaScript との契約です。** `Frame` は 176 バイトで、2 つの行列（128）と、それぞれ 16 バイトの 3 組の `vec3f` + `f32` からなります。レンダラは `Float32Array(44)` をちょうどそれらのオフセットで埋めます。これを間違えるのが WebGPU で最もよくあるバグです。リフレクションツールや、単一の共有レイアウト記述が助けになります。
3. **シェーダは線形な HDR 放射輝度を書き出します。** トーンマッピング（tone mapping）と sRGB エンコードは後のパスで行うので、ライティングは最後の瞬間まで物理的に意味のある値のままです。

## 7. シャドウマップパス

[グラフィックス第 03 回]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})では、シャドウマップの考え方を紹介しました。シーンの深度を*光源から*描画し、点 $\mathbf{p}$ をシェーディングするときに、光源から見たその深度を保存済みの深度と比較します。ここでは平行光源に対するエンジン版を示します。

**ライト行列。** シーンのバウンディング球（中心 $\mathbf{c}$、半径 $R$）の周りに正射影のボックスをフィットさせます。ライトの「カメラ」は $\mathbf{c} - 2R\,\mathbf{d}$ に置かれて光の方向 $\mathbf{d}$ に沿って向き、そのボックスは $[-R, R]^2$ の範囲と $[R, 3R]$ の深度範囲を持つので、球はボックス内に収まります。すると、任意のワールド座標の点について次が成り立ちます。

$$
\mathbf{q} = P_L V_L \begin{pmatrix}\mathbf{p}\\ 1\end{pmatrix}, \qquad (u, v) = \Big(\tfrac{q_x + 1}{2},\ \tfrac{1 - q_y}{2}\Big), \qquad \text{lit} \iff q_z - b < \text{shadowMap}(u, v),
$$

ここで $b$ は小さな深度バイアスです。第 6 節のシェーダの `shadowFactor` は、比較を 1 回だけ行うのではなく、$(u, v)$ の周囲 3×3 テクセルのそれぞれで比較を行い（各比較ではハードウェアが近傍 2×2 テクセルを双線形フィルタします）、その平均を取ります。これがパーセンテージクローザーフィルタリング（PCF、percentage-closer filtering）で、影の縁を柔らかくします。光源の正射影ボックスの外にある点（コード中の `inside` が偽）は、常に照らされているものとして扱います。

下の図では、左が光源の正射影ボックスと、点 $\mathbf{p}$ を光の方向に沿って投影する様子、右が対応する深度マップです。右の図で印を付けたテクセルに保存された深度と、$\mathbf{p}$ 自身の深度を見比べてください。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-shadow-geometry.svg" caption="シャドウパスを計算した図。左: 簡単なシーン（地面、球、箱）を囲む光源の正射影視錐台（黄色のボックス）。光の方向は矢印です。地面上の点 $\mathbf{p}$（黒）は光の方向に沿ってテクセル $(u, v)$ に投影されます。その光線上で最初に当たる面は球なので、$\mathbf{p}$ は影の中にあります。右: 光源から実際に描画した深度マップ（暗いほど光源に近い）。$(u, v)$ を印してあり、保存されている深度は $\mathbf{p}$ 自身の深度より小さくなっています。" %}

**シャドウアクネとバイアス。** シャドウマップの 1 テクセルは、受光面の有限の領域を覆います。面の法線と光の方向のなす角が $\theta$ の傾いた面（$\theta = 0$ は光に正対）では、ワールドサイズ $w$ の 1 テクセル内の深度は、保存された中心値の周りで最大 $\tfrac{w}{2}\tan\theta$ だけ変動します。そのためバイアスがないと、面の半分が縞模様に自己遮蔽されます（**アクネ**、acne）。バイアスが大きすぎると、影が投影元から離れてしまいます（**ピーターパニング**、peter-panning）。必要な最小バイアスは傾斜とともに大きくなるので、GPU はラスタライザに*傾斜スケール*（slope-scaled）の深度バイアスを備えています。

**計算例。** 半径 $R = 5$ m のシーンに 2048² のマップを使うと、テクセルは $w = 2R/2048 \approx 4.9$ mm です。45° の斜面では、深度の誤差は最大 $w/2 \approx 2.4$ mm で、正規化深度（範囲 $2R = 10$ m）では $2.4 \times 10^{-4}$ です。定数の `shadowBias` を $5 \times 10^{-4}$ にするだけで、$\arctan(5/2.44) \approx 64°$ までの傾斜をカバーできます。それより急な面では、ラスタライザの傾斜スケールバイアス（シャドウパイプラインの `depthBiasSlopeScale`）が働きます。下の図は 2D でアクネを再現し、必要なバイアスを傾斜角に対して描いたものです。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-shadow-bias.svg" caption="2D で計算したシャドウアクネ。左: 真上からの光の下で 30° 傾いた受光面。シャドウマップはテクセルごとに 1 つの深度を保存します（階段状の段差）。バイアスがないと、赤で示した受光面上の点は自分のテクセルの保存深度より奥にあるため、誤って影と判定され、規則的な縞模様になります。右: アクネを除くために必要なバイアス $\tfrac{w}{2}\tan\theta$ を傾斜角に対して描き、定数バイアス（赤の水平な破線、30° ちょうどに足りる大きさ）および定数 + 傾斜スケールバイアス（緑の曲線）と比較しています。薄い赤の領域は定数バイアスでは足りずアクネが残る傾斜の範囲、灰色の縦の点線は左の図で使った 30° を示します。" %}

次のウィジェットは、シェーダとまったく同じ判定 `depth - bias <= stored` を 2D シーンで実行し、厳密な可視性と比較します。まずバイアスを 0 にしてアクネの縞を確認し、縞が消えるまでバイアスを上げ、さらに上げ続けると箱の下から光が漏れる様子（ピーターパンニング、peter-panning）が見えます。傾斜スケール項をオンにして光源を傾けると、ずっと小さな定数バイアスで斜面のアクネを消せることがわかります。

{% include widget.liquid name="graphics-engine-shadow-bias" height="470" caption="2D でのシャドウアクネとバイアス。オレンジの階段はシャドウマップに保存された深度で、テクセルごとに 1 つです。表面の点は緑（正しく照明）、灰（正しく影）、赤（アクネ: 誤って影）、青（光漏れ: 誤って照明）で表示されます。光源の角度（シーン上のドラッグでも可）、テクセル数、バイアスを変え、傾斜スケールバイアス $\tfrac{w}{2}\tan\theta$ を切り替えてみてください。" %}

シャドウの頂点シェーダは非常に小さく、このパスにはフラグメントシェーダがまったくありません。書き込まれるのは深度だけです。

```wgsl
// src/render/shaders/shadow.wgsl
struct Light { viewProj : mat4x4f };
struct Object { model : mat4x4f };
@group(0) @binding(0) var<uniform> light : Light;
@group(1) @binding(0) var<uniform> object : Object;

@vertex fn vs(@location(0) position : vec3f) -> @builtin(position) vec4f {
  return light.viewProj * object.model * vec4f(position, 1.0);
}
```

そして、光源やシーンの範囲が変わるたびにライト行列を再計算するシステムが次のものです。

```js
// part of src/main.js: a light "system"
function updateLight(light) {
  const d = light.dir, c = light.center, R = light.radius;
  const eye = [c[0] - 2 * R * d[0], c[1] - 2 * R * d[1], c[2] - 2 * R * d[2]];
  const up = Math.abs(d[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0]; // avoid up parallel to d
  const view = mat4.lookAt(mat4.create(), eye, c, up);
  const proj = mat4.ortho(mat4.create(), -R, R, -R, R, R, 3 * R);
  mat4.multiply(light.viewProj, proj, view);
}
```

大きな屋外シーンでは、単一のマップでは粗すぎます。**カスケードシャドウマップ**（cascaded shadow map）は視錐台を距離で分割し、各スライスに専用のマップを与えます。**仮想シャドウマップ**（virtual shadow map、[次の回]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})）は、画面が必要とする場所にだけ、巨大な仮想マップのページを割り当てます。

## 8. 最小限の ECS 駆動シーン

第 01 回ではアーキタイプ（archetype）方式とスパースセット（sparse-set）方式の ECS 設計を比較しました。このエンジンの ECS は、それでも正しい*形*を持つ最も単純なものです。エンティティは整数で、コンポーネントの型ごとに専用のストアがあり、**システム**は、あるコンポーネントの組を持つエンティティを問い合わせる（query する）ただの関数です。

```js
// src/ecs/world.js
export class World {
  constructor() {
    this.nextId = 0;
    this.stores = new Map(); // component name -> Map(entity -> data)
  }
  create() { return this.nextId++; }
  destroy(e) { for (const s of this.stores.values()) s.delete(e); }
  store(name) {
    let s = this.stores.get(name);
    if (!s) { s = new Map(); this.stores.set(name, s); }
    return s;
  }
  add(e, name, data) { this.store(name).set(e, data); return data; }
  get(e, name) { return this.stores.get(name)?.get(e); }
  // Yields [entity, compA, compB, ...] for entities that have all the named components.
  *query(...names) {
    const stores = names.map((n) => this.store(n));
    const smallest = stores.reduce((a, b) => (b.size < a.size ? b : a));
    for (const e of smallest.keys()) {
      const row = [e];
      let ok = true;
      for (const s of stores) {
        const c = s.get(e);
        if (c === undefined) { ok = false; break; }
        row.push(c);
      }
      if (ok) yield row;
    }
  }
}
```

コンポーネントごとに `Map` を使う方式はキャッシュ効率がよくありません（アーキタイプがコンポーネントを密な配列に格納する理由は第 01 回で説明しました）。しかし*インターフェース*（create、add、query、システム）は Bevy、Flecs、EnTT が公開しているものと同じなので、システムに手を加えずに、あとからストレージを差し替えられます。

### 8.1 トランスフォーム、階層、ダーティフラグ

トランスフォームの階層は、ECS が**シーングラフ**（scene graph）と出会う場所です。各 `transform` コンポーネントは、ローカルの平行移動、回転、スケール、親、子、ローカル行列、**ワールド行列**、そして**ダーティフラグ**（dirty flag）を保持します。ノード $k$ のワールド行列は、ルートからの経路に沿った積です。

$$
W_k = W_{\text{parent}(k)}\, L_k = L_{\text{root}} \cdots L_{\text{parent}(k)}\, L_k .
$$

$L_k$ を変更すると、$W_k$ とすべての子孫のワールド行列が無効になり、それ以外は影響を受けません。そこで `markDirty` はサブツリーにフラグを立て、トランスフォームシステムはフラグの立ったノードだけを、親を子より先に再計算します。

```js
// src/scene/transform.js
import { mat4 } from '../core/math.js';

export function addTransform(world, e, { t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1], matrix = null, parent = -1 } = {}) {
  const tr = world.add(e, 'transform', {
    t: [...t], r: [...r], s: [...s], matrix, parent, children: [],
    local: mat4.create(), world: mat4.create(), dirty: true,
  });
  if (parent >= 0) world.get(parent, 'transform').children.push(e);
  return tr;
}

// Invariant: if a node is dirty, its whole subtree is dirty.
export function markDirty(world, e) {
  const tr = world.get(e, 'transform');
  if (tr.dirty) return;
  tr.dirty = true;
  for (const c of tr.children) markDirty(world, c);
}

export function setRotation(world, e, q) {
  world.get(e, 'transform').r = q;
  markDirty(world, e);
}

// Recompute local and world matrices of dirty nodes, depth first from the roots.
export function transformSystem(world) {
  let recomputed = 0;
  const visit = (e, parentWorld) => {
    const tr = world.get(e, 'transform');
    if (tr.dirty) {
      if (tr.matrix) tr.local.set(tr.matrix);
      else mat4.fromTRS(tr.local, tr.t, tr.r, tr.s);
      if (parentWorld) mat4.multiply(tr.world, parentWorld, tr.local);
      else tr.world.set(tr.local);
      tr.dirty = false;
      recomputed++;
    }
    for (const c of tr.children) visit(c, tr.world);
  };
  for (const [e, tr] of world.query('transform')) if (tr.parent < 0) visit(e, null);
  return recomputed;
}
```

**計算例。** root → arm → hand という連鎖で、root を回転させると 3 つのノードすべてにフラグが立ち、システムは行列積を 3 回実行します。hand だけを回転させるとフラグが立つのは 1 ノードで、コストは行列積 1 回です。静的な小道具 10,000 個と動くキャラクター 1 体があるシーンでは、ダーティフラグによって、フレームあたり 10,000 回の行列積が数十回に減ります。ウィジェットで試してみてください。親をドラッグまたは回転させて、どのノードが点灯するかを観察しましょう。

{% include widget.liquid name="graphics-engine-scene-graph" height="460" caption="ローカル変換とワールド変換を持つシーングラフ。ノードをドラッグして（親のフレーム内で）移動させるか、回転ボタンを使うと、子がそれに追従します。表示をワールド変換とローカル変換で切り替え、ダーティフラグの伝播を観察してください。直近の更新で再計算されたノードはオレンジ色に点滅し、カウンタには再計算されたノードの数が表示されます。ダーティフラグのチェックを外すと、変更のたびに全ノードを再計算する場合と比較できます。" %}

### 8.2 glTF シーンの生成と 1 フレームのシステム

コンポジションルート（composition root）は、ローダが返した素のデータを GPU リソースとエンティティに変換し、システムを登録して、ループを開始します。固定ステップの `spinSystem` が前回と現在の角度を保存し、レンダリングステップがトランスフォームシステムの実行前に $\alpha$ で補間している点に注目してください。

```js
// src/main.js
import { initGPU, resizeCanvas } from './gpu/device.js';
import { Resources } from './gpu/resources.js';
import { loadGLTF } from './assets/gltf.js';
import { World } from './ecs/world.js';
import { addTransform, setRotation, transformSystem } from './scene/transform.js';
import { OrbitCamera } from './scene/camera.js';
import { Input } from './core/input.js';
import { startLoop } from './core/loop.js';
import { mat4, quat, vec3 } from './core/math.js';
import { Renderer } from './render/renderer.js';
import { GpuTimer } from './debug/timing.js';
import { DebugPanel } from './debug/panel.js';

const canvas = document.querySelector('canvas');
const gpu = await initGPU(canvas);
const res = new Resources(gpu.device);
const timer = new GpuTimer(gpu.device, gpu.hasTimestamps, ['shadow', 'opaque', 'tonemap']);
const renderer = await Renderer.create(gpu, res);
const world = new World();
const input = new Input(canvas);
const camera = new OrbitCamera({ radius: 4 });
const light = {
  dir: vec3.normalize([-0.4, -1.0, -0.3]), color: [3, 3, 3], ambient: 0.08,
  bias: 0.0005, center: [0, 0, 0], radius: 3, viewProj: mat4.create(), exposure: 1,
};

function spawnGLTF(gltf, parent = -1) {
  const textures = gltf.images.map(() => null); // created lazily: color space depends on usage
  const tex = (i, srgb) => (i < 0 ? null : (textures[i] ??= res.texture(`image${i}`, gltf.images[i], srgb)));
  const materials = gltf.materials.map((m) =>
    renderer.createMaterial(m, { baseColor: tex(m.baseColorTexture, true), metallicRoughness: tex(m.metallicRoughnessTexture, false) }));
  const fallback = renderer.createMaterial({
    baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 0.6, emissiveFactor: [0, 0, 0],
  }, {});
  const meshes = gltf.meshes.map((prims) => prims.map((p) => ({
    mesh: renderer.createMesh(p), material: p.material >= 0 ? materials[p.material] : fallback,
  })));
  const visit = (i, p) => {
    const n = gltf.nodes[i], e = world.create();
    addTransform(world, e, { t: n.t, r: n.r, s: n.s, matrix: n.matrix, parent: p });
    if (n.mesh >= 0) world.add(e, 'meshRenderer', { primitives: meshes[n.mesh] });
    n.children.forEach((c) => visit(c, e));
    return e;
  };
  return gltf.roots.map((i) => visit(i, parent));
}

// Scene: a turntable entity with the helmet as its child, and a ground plane.
const turntable = world.create();
addTransform(world, turntable);
world.add(turntable, 'spin', { axis: [0, 1, 0], speed: 0.5, angle: 0, prev: 0 });
spawnGLTF(await loadGLTF('assets/DamagedHelmet.glb'), turntable);
const ground = world.create();
addTransform(world, ground, { t: [0, -1.1, 0], s: [3, 1, 3] }); // non-uniform scale is fine for a flat plane
world.add(ground, 'meshRenderer', { primitives: [{ mesh: renderer.createMesh(renderer.planeGeometry()), material: renderer.defaultMaterial }] });

// Systems
function spinSystem(dt) { // fixed step: simulation state only
  for (const [, spin] of world.query('spin')) { spin.prev = spin.angle; spin.angle += spin.speed * dt; }
}
function presentSpin(alpha) { // render step: interpolate between the last two states
  for (const [e, spin] of world.query('spin')) {
    setRotation(world, e, quat.fromAxisAngle(spin.axis, spin.prev + alpha * (spin.angle - spin.prev)));
  }
}
// updateLight(light) from Section 7 also lives in this file.

const panel = new DebugPanel(document.body);
panel.slider('exposure', light, 'exposure', 0.1, 4);
panel.slider('shadow bias', light, 'bias', 0, 0.005, 0.0001);
panel.slider('spin speed', world.get(turntable, 'spin'), 'speed', -3, 3);

startLoop({
  dt: 1 / 60,
  update: (dt) => spinSystem(dt),
  render: (alpha, frameTime, steps) => {
    const t0 = performance.now();
    resizeCanvas(canvas);
    camera.update(input, frameTime);
    input.endFrame();
    presentSpin(alpha);
    const recomputed = transformSystem(world);
    updateLight(light);
    const t1 = performance.now();
    const stats = renderer.render(world, camera, light, timer);
    const t2 = performance.now();
    panel.stats({
      'frame (ms)': frameTime * 1000, 'sim steps': steps, 'alpha': alpha,
      'cpu systems (ms)': t1 - t0, 'cpu render (ms)': t2 - t1, 'draws': stats.draws,
      'transforms recomputed': recomputed,
      ...Object.fromEntries(Object.entries(timer.ms).map(([k, v]) => [`gpu ${k} (ms)`, v])),
    });
  },
});
```

`render` 内のシステムの順序は、小さな**スケジュール**（schedule）です。入力 → カメラ → 補間 → トランスフォーム → ライト → 描画。エンジンはこれを明示的に表現します（Bevy のスケジュールとシステムセット、Unity のシステムグループ、Unreal のティックグループ）。トランスフォームシステムが実行される前にトランスフォームを読むシステムは、前フレームのデータを見ることになり、1 フレーム遅れのバグという典型的な不具合を招くからです。

## 9. 小さなパスリスト（60 行のフレームグラフ）

第 02 回では**レンダーグラフ**を説明しました。各パスが読み書きするリソースを宣言し、グラフがパスの順序を決め、結果を誰も使わないパスを取り除き、各リソースの生存期間（lifetime）を導出します。これにより、一時的なメモリをエイリアスでき、バリアを自動的に配置できます。WebGPU はバリアを代わりに挿入してくれますが、残りの 3 つの利点は数行で実現できます。

```js
// src/render/passes.js
export class PassList {
  constructor() { this.passes = []; }

  add(name, { reads = [], writes = [], run }) {
    this.passes.push({ name, reads, writes, run });
    return this;
  }

  compile(outputs = ['backbuffer']) {
    // 1. Order: every pass runs after the passes that write what it reads (Kahn's algorithm).
    const writers = new Map();
    for (const p of this.passes) for (const r of p.writes) writers.set(r, [...(writers.get(r) || []), p]);
    const indegree = new Map(this.passes.map((p) => [p, 0]));
    const next = new Map(this.passes.map((p) => [p, []]));
    for (const p of this.passes) {
      for (const r of p.reads) {
        for (const w of writers.get(r) || []) {
          if (w !== p) { next.get(w).push(p); indegree.set(p, indegree.get(p) + 1); }
        }
      }
    }
    const ready = this.passes.filter((p) => indegree.get(p) === 0);
    const order = [];
    while (ready.length) {
      const p = ready.shift();
      order.push(p);
      for (const q of next.get(p)) {
        indegree.set(q, indegree.get(q) - 1);
        if (indegree.get(q) === 0) ready.push(q);
      }
    }
    if (order.length !== this.passes.length) throw new Error('the pass list has a cycle');

    // 2. Cull: walk backwards from the outputs and keep only passes that contribute.
    const needed = new Set(outputs);
    const kept = [];
    for (let i = order.length - 1; i >= 0; i--) {
      const p = order[i];
      if (p.writes.some((r) => needed.has(r))) {
        kept.unshift(p);
        p.reads.forEach((r) => needed.add(r));
      }
    }

    // 3. Lifetimes: first and last pass index that touches each resource.
    this.lifetimes = new Map();
    kept.forEach((p, i) => {
      for (const r of [...p.writes, ...p.reads]) {
        const l = this.lifetimes.get(r);
        if (l) l.last = i; else this.lifetimes.set(r, { first: i, last: i });
      }
    });
    this.order = kept;
    this.culled = order.filter((p) => !kept.includes(p)).map((p) => p.name);
    return this;
  }

  execute(ctx) {
    for (const p of this.order) p.run(ctx);
  }
}
```

このレンダラは 4 つのパスを宣言します。そのうち 1 つは、誰も使わないデバッグ可視化です。

```js
passes
  .add('shadow', { writes: ['shadowMap'], run: (c) => this.shadowPass(c) })
  .add('opaque', { reads: ['shadowMap'], writes: ['hdr', 'depth'], run: (c) => this.opaquePass(c) })
  .add('debugDepth', { reads: ['depth'], writes: ['debugView'], run: () => {} })
  .add('tonemap', { reads: ['hdr'], writes: ['backbuffer'], run: (c) => this.tonemapPass(c) })
  .compile();
// order: shadow, opaque, tonemap   culled: debugDepth
// lifetimes: shadowMap [0,1], hdr [1,2], depth [1,1], backbuffer [2,2]
```

`depth` の生存期間は `opaque` パスの内部で終わるので、レンダラは `depthStoreOp` を `'discard'` に設定できます。タイルベースのモバイル GPU では、これによって深度バッファ全体をメモリに書き出す処理を省けます。生存期間からは、どの一時テクスチャがメモリを共有できるかもわかります。以下の図は、同じコンパイラをより大きく現実的なフレームに適用した結果です。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-frame-graph.svg" caption="より本格的なフレームのデータフロー。図のスクリプト内にある `PassList.compile` の Python 移植版で計算しています。パス（角丸の箱）は実行順に左から右へ並び、リソース（灰色のラベル）は辺上にあります。カットされたパス `ssaoDebug`（破線）は誰も読まないテクスチャを書くので、実行されません。" %}

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-resource-lifetime.svg" caption="同じフレームの一時リソースの生存期間（最初の使用から最後の使用までのバー、パスのインデックスで表示）と、貪欲な区間アロケータが割り当てるメモリスロット。バーが重ならないリソースは同じ色の 1 つのスロットを共有するので、このフレームに必要なのは 7 個ではなく 3 個のスロットです（サイズとフォーマットが互換であると仮定）。これはレンダーグラフが自動化するエイリアシングです。" %}

パスを所有するレンダラを以下に示します。これは最も大きなファイルですが、1 行 1 行が上で説明した概念のどれかに対応しています。

```js
// src/render/renderer.js
import { PassList } from './passes.js';

const HDR_FORMAT = 'rgba16float';
const SHADOW_SIZE = 2048;
const OBJECT_STRIDE = 256; // minUniformBufferOffsetAlignment
const MAX_OBJECTS = 1024;
const VERTEX_LAYOUT = {
  arrayStride: 32,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
    { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
    { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv
  ],
};

export class Renderer {
  static async create(gpu, res) {
    const load = (f) => fetch(new URL(`./shaders/${f}`, import.meta.url)).then((r) => r.text());
    const [pbr, shadow, tonemap] = await Promise.all([load('pbr.wgsl'), load('shadow.wgsl'), load('tonemap.wgsl')]);
    return new Renderer(gpu, res, { pbr, shadow, tonemap });
  }

  constructor(gpu, res, code) {
    const d = (this.device = gpu.device);
    this.gpu = gpu;
    this.res = res;
    this.materialCount = 0;
    const S = GPUShaderStage;

    this.frameBGL = d.createBindGroupLayout({ label: 'frame', entries: [
      { binding: 0, visibility: S.VERTEX | S.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: S.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 2, visibility: S.FRAGMENT, sampler: { type: 'comparison' } },
    ] });
    this.materialBGL = d.createBindGroupLayout({ label: 'material', entries: [
      { binding: 0, visibility: S.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: S.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: S.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: S.FRAGMENT, sampler: { type: 'filtering' } },
    ] });
    this.objectBGL = d.createBindGroupLayout({ label: 'object', entries: [
      { binding: 0, visibility: S.VERTEX, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 64 } },
    ] });
    this.lightBGL = d.createBindGroupLayout({ label: 'light', entries: [
      { binding: 0, visibility: S.VERTEX, buffer: { type: 'uniform' } },
    ] });

    // Buffers
    this.frameData = new Float32Array(44); // matches struct Frame (176 bytes)
    this.frameUBO = res.uniform('frame', 176);
    this.lightUBO = res.uniform('light', 64);
    this.tonemapUBO = res.uniform('tonemap', 16);
    this.objectData = new Float32Array((OBJECT_STRIDE / 4) * MAX_OBJECTS);
    this.objectUBO = res.uniform('objects', OBJECT_STRIDE * MAX_OBJECTS);

    // Shadow map (persistent) and its comparison sampler
    this.shadowMap = d.createTexture({
      label: 'shadowMap', size: [SHADOW_SIZE, SHADOW_SIZE], format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.shadowView = this.shadowMap.createView();
    const shadowSampler = res.sampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });

    // Pipelines (cached by key)
    const pbrModule = res.shader('pbr', code.pbr);
    this.pbrPipeline = res.pipeline(`pbr|${HDR_FORMAT}|cull-back`, () => ({
      label: 'pbr',
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.frameBGL, this.materialBGL, this.objectBGL] }),
      vertex: { module: pbrModule, entryPoint: 'vs', buffers: [VERTEX_LAYOUT] },
      fragment: { module: pbrModule, entryPoint: 'fs', targets: [{ format: HDR_FORMAT }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    }));
    this.shadowPipeline = res.pipeline('shadow|depth32float', () => ({
      label: 'shadow',
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.lightBGL, this.objectBGL] }),
      vertex: {
        module: res.shader('shadow', code.shadow), entryPoint: 'vs',
        buffers: [{ arrayStride: 32, attributes: [VERTEX_LAYOUT.attributes[0]] }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less',
        depthBias: 2, depthBiasSlopeScale: 1.5, // slope-scaled bias in the rasterizer
      },
    }));
    const tonemapModule = res.shader('tonemap', code.tonemap);
    this.tonemapPipeline = res.pipeline(`tonemap|${gpu.format}`, () => ({
      label: 'tonemap',
      layout: 'auto',
      vertex: { module: tonemapModule, entryPoint: 'vs' },
      fragment: { module: tonemapModule, entryPoint: 'fs', targets: [{ format: gpu.format }] },
      primitive: { topology: 'triangle-list' },
    }));

    // Bind groups that never change
    this.frameBG = d.createBindGroup({ layout: this.frameBGL, entries: [
      { binding: 0, resource: { buffer: this.frameUBO } },
      { binding: 1, resource: this.shadowView },
      { binding: 2, resource: shadowSampler },
    ] });
    this.lightBG = d.createBindGroup({ layout: this.lightBGL, entries: [{ binding: 0, resource: { buffer: this.lightUBO } }] });
    this.objectBG = d.createBindGroup({ layout: this.objectBGL, entries: [
      { binding: 0, resource: { buffer: this.objectUBO, size: 64 } },
    ] });
    this.defaultMaterial = this.createMaterial({
      baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 0.7, emissiveFactor: [0, 0, 0],
    }, {});

    this.passes = new PassList()
      .add('shadow', { writes: ['shadowMap'], run: (c) => this.shadowPass(c) })
      .add('opaque', { reads: ['shadowMap'], writes: ['hdr', 'depth'], run: (c) => this.opaquePass(c) })
      .add('debugDepth', { reads: ['depth'], writes: ['debugView'], run: () => {} })
      .add('tonemap', { reads: ['hdr'], writes: ['backbuffer'], run: (c) => this.tonemapPass(c) })
      .compile();
  }

  createMesh({ vertices, indices }) {
    const B = GPUBufferUsage;
    let maxIndex = 0;
    for (const i of indices) if (i > maxIndex) maxIndex = i; // no Math.max(...): large spreads overflow the stack
    const small = maxIndex < 65536;
    const idx = small ? Uint16Array.from(indices) : indices;
    return {
      vbo: this.res.buffer('vertices', vertices, B.VERTEX),
      ibo: this.res.buffer('indices', idx, B.INDEX),
      indexFormat: small ? 'uint16' : 'uint32',
      indexCount: indices.length,
    };
  }

  createMaterial(m, textures) {
    const data = new Float32Array(12); // matches struct Material (48 bytes)
    data.set(m.baseColorFactor, 0);
    data.set(m.emissiveFactor, 4);
    data[7] = m.metallicFactor;
    data[8] = m.roughnessFactor;
    const white = this.res.solidTexture('white', [255, 255, 255, 255]);
    const sampler = this.res.sampler(m.sampler || {
      magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat',
    });
    const bindGroup = this.device.createBindGroup({ layout: this.materialBGL, entries: [
      { binding: 0, resource: { buffer: this.res.buffer('material', data, GPUBufferUsage.UNIFORM) } },
      { binding: 1, resource: (textures.baseColor || white).createView() },
      { binding: 2, resource: (textures.metallicRoughness || white).createView() },
      { binding: 3, resource: sampler },
    ] });
    return { id: this.materialCount++, bindGroup };
  }

  planeGeometry() { // unit quad in the x-z plane, normal +y, counter-clockwise seen from above
    const vertices = new Float32Array([
      -1, 0, -1, 0, 1, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0, 1,
      1, 0, 1, 0, 1, 0, 1, 1, 1, 0, -1, 0, 1, 0, 1, 0,
    ]);
    return { vertices, indices: new Uint32Array([0, 1, 2, 0, 2, 3]) };
  }

  ensureTargets(w, h) { // transient render targets, recreated on resize
    if (this.hdr && this.hdr.width === w && this.hdr.height === h) return;
    this.hdr?.destroy();
    this.depth?.destroy();
    const T = GPUTextureUsage;
    this.hdr = this.device.createTexture({ label: 'hdr', size: [w, h], format: HDR_FORMAT, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
    this.depth = this.device.createTexture({ label: 'depth', size: [w, h], format: 'depth24plus', usage: T.RENDER_ATTACHMENT });
    this.hdrView = this.hdr.createView();
    this.depthView = this.depth.createView();
    this.tonemapBG = this.device.createBindGroup({ layout: this.tonemapPipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: this.hdrView },
      { binding: 1, resource: { buffer: this.tonemapUBO } },
    ] });
  }

  render(world, camera, light, timer) {
    const d = this.device, canvas = this.gpu.canvas;
    this.ensureTargets(canvas.width, canvas.height);

    // Gather draws from the ECS and upload all model matrices with one write.
    const draws = [];
    let n = 0;
    for (const [, tr, mr] of world.query('transform', 'meshRenderer')) {
      if (n === MAX_OBJECTS) break;
      this.objectData.set(tr.world, n * (OBJECT_STRIDE / 4));
      for (const p of mr.primitives) draws.push({ slot: n, mesh: p.mesh, material: p.material });
      n++;
    }
    draws.sort((a, b) => a.material.id - b.material.id); // fewer bind group changes
    d.queue.writeBuffer(this.objectUBO, 0, this.objectData, 0, n * (OBJECT_STRIDE / 4));

    camera.matrices(canvas.width / canvas.height);
    const f = this.frameData;
    f.set(camera.viewProj, 0);
    f.set(light.viewProj, 16);
    f.set(camera.eye(), 32);
    f.set(light.dir, 36);
    f[39] = light.bias;
    f.set(light.color, 40);
    f[43] = light.ambient;
    d.queue.writeBuffer(this.frameUBO, 0, f);
    d.queue.writeBuffer(this.lightUBO, 0, light.viewProj);
    d.queue.writeBuffer(this.tonemapUBO, 0, new Float32Array([light.exposure, 0, 0, 0]));

    const encoder = d.createCommandEncoder({ label: 'frame' });
    this.passes.execute({ encoder, draws, timer });
    timer.resolve(encoder);
    d.queue.submit([encoder.finish()]);
    timer.readback();
    return { draws: draws.length };
  }

  drawMesh(pass, draw, objectGroup) {
    pass.setBindGroup(objectGroup, this.objectBG, [draw.slot * OBJECT_STRIDE]);
    pass.setVertexBuffer(0, draw.mesh.vbo);
    pass.setIndexBuffer(draw.mesh.ibo, draw.mesh.indexFormat);
    pass.drawIndexed(draw.mesh.indexCount);
  }

  shadowPass({ encoder, draws, timer }) {
    const pass = encoder.beginRenderPass({
      label: 'shadow',
      colorAttachments: [],
      depthStencilAttachment: { view: this.shadowView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      timestampWrites: timer.writes('shadow'),
    });
    pass.setPipeline(this.shadowPipeline);
    pass.setBindGroup(0, this.lightBG);
    for (const dr of draws) this.drawMesh(pass, dr, 1);
    pass.end();
  }

  opaquePass({ encoder, draws, timer }) {
    const pass = encoder.beginRenderPass({
      label: 'opaque',
      colorAttachments: [{ view: this.hdrView, clearValue: [0.05, 0.06, 0.08, 1], loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: {
        view: this.depthView, depthClearValue: 1, depthLoadOp: 'clear',
        depthStoreOp: 'discard', // lifetime of 'depth' ends in this pass
      },
      timestampWrites: timer.writes('opaque'),
    });
    pass.setPipeline(this.pbrPipeline);
    pass.setBindGroup(0, this.frameBG);
    let current = null;
    for (const dr of draws) {
      if (dr.material !== current) { pass.setBindGroup(1, dr.material.bindGroup); current = dr.material; }
      this.drawMesh(pass, dr, 2);
    }
    pass.end();
  }

  tonemapPass({ encoder, timer }) {
    const pass = encoder.beginRenderPass({
      label: 'tonemap',
      colorAttachments: [{
        view: this.gpu.context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'store',
      }],
      timestampWrites: timer.writes('tonemap'),
    });
    pass.setPipeline(this.tonemapPipeline);
    pass.setBindGroup(0, this.tonemapBG);
    pass.draw(3); // one full-screen triangle
    pass.end();
  }
}
```

トーンマッピングパスは、画面を覆う 1 つの三角形を描画し、各ピクセルの下にある HDR テクセルを読み取り、露出（exposure）と Reinhard カーブ $c/(1+c)$ を適用して、sRGB にエンコードします（キャンバスのフォーマットは `-srgb` フォーマットではないので、シェーダが $1/2.2$ 乗でエンコードを行います）。

```wgsl
// src/render/shaders/tonemap.wgsl
struct Params { exposure : f32 };
@group(0) @binding(0) var hdr : texture_2d<f32>;
@group(0) @binding(1) var<uniform> params : Params;

@vertex fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)); // (0,0), (2,0), (0,2)
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

@fragment fn fs(@builtin(position) pos : vec4f) -> @location(0) vec4f {
  let c = textureLoad(hdr, vec2i(pos.xy), 0).rgb * params.exposure;
  let mapped = c / (vec3f(1.0) + c);
  return vec4f(pow(mapped, vec3f(1.0 / 2.2)), 1.0);
}
```

**Vulkan/C++。** パスリストは Vulkan が面白くなる場所です。グラフはパス間で `vkCmdPipelineBarrier2` の呼び出し（シャドウマップの `DEPTH_ATTACHMENT_OPTIMAL` から `SHADER_READ_ONLY_OPTIMAL` へのような画像レイアウト遷移）も出力しなければならず、動的レンダリング（dynamic rendering）では各パスが `vkCmdBeginRendering` のブロックになります。**Rust/wgpu** は WebGPU と同様に振る舞い（バリアは自動です）、`rend3` のようなクレートがかつてその上にレンダーグラフを構築しました。

## 10. デバッグ UI と GPU タイムスタンプクエリ

計測できないものは最適化できません。しかも CPU のタイマーは GPU について何も教えてくれません。`queue.submit` は、GPU が処理を終えるよりずっと前に戻ってくるからです。WebGPU のオプション機能 `timestamp-query` を使うと、各パスが開始時と終了時に GPU のタイムスタンプ（ナノ秒単位）を `GPUQuerySet` に書き込めます。クエリセットをバッファへ解決（resolve）し、マップ可能なバッファへコピーして、1〜2 フレーム後に*非同期*で読み戻します。

```js
// src/debug/timing.js
export class GpuTimer {
  constructor(device, enabled, names) {
    this.device = device;
    this.enabled = enabled;
    this.names = names;
    this.ms = Object.fromEntries(names.map((n) => [n, 0]));
    if (!enabled) return;
    const count = 2 * names.length;
    this.querySet = device.createQuerySet({ type: 'timestamp', count });
    this.resolveBuffer = device.createBuffer({ size: 8 * count, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    this.free = []; // mappable read-back buffers that are not in flight
  }

  writes(name) { // the timestampWrites member of a pass descriptor
    if (!this.enabled) return undefined;
    const i = this.names.indexOf(name);
    return { querySet: this.querySet, beginningOfPassWriteIndex: 2 * i, endOfPassWriteIndex: 2 * i + 1 };
  }

  resolve(encoder) {
    if (!this.enabled) return;
    const count = 2 * this.names.length;
    encoder.resolveQuerySet(this.querySet, 0, count, this.resolveBuffer, 0);
    this.pending = this.free.pop() || this.device.createBuffer({
      size: 8 * count, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    encoder.copyBufferToBuffer(this.resolveBuffer, 0, this.pending, 0, 8 * count);
  }

  readback() { // call after queue.submit; never blocks
    if (!this.enabled) return;
    const buf = this.pending;
    buf.mapAsync(GPUMapMode.READ).then(() => {
      const t = new BigUint64Array(buf.getMappedRange());
      this.names.forEach((n, i) => {
        const ms = Number(t[2 * i + 1] - t[2 * i]) / 1e6;
        if (ms >= 0 && ms < 1000) this.ms[n] = 0.9 * this.ms[n] + 0.1 * ms; // smooth
      });
      buf.unmap();
      this.free.push(buf);
    });
  }
}
```

読み戻し用バッファの小さなプールを使うことは重要です。マップされている最中のバッファは次のフレームのコピーに使えず、それを待てば CPU が GPU を待って止まってしまいます。これは第 13 節で挙げる最悪の落とし穴です。仕様はブラウザがタイムスタンプの精度を下げること（タイミングのサイドチャネル対策）を認めており、Chrome は既定でそれを 100 µs に量子化します（[Chrome ブログ](https://developer.chrome.com/blog/new-in-webgpu-120)）。したがって個々の値は近似値として扱い、`readback` が行っているように、多数のフレームにわたって平均してください。

デバッグパネルは意図的にただの HTML にしています。オブジェクトのプロパティに結び付けたスライダと、統計用のテキストブロックだけです。C++ のエンジンではこの役割を Dear ImGui が、Rust のエンジンでは `egui` が担います。

```js
// src/debug/panel.js
export class DebugPanel {
  constructor(parent) {
    this.root = document.createElement('div');
    this.root.style.cssText = 'position:fixed;left:8px;top:8px;padding:8px;background:rgba(0,0,0,.65);' +
      'color:#e8e8e8;font:12px/1.4 monospace;border-radius:6px;max-width:60vw';
    this.text = document.createElement('pre');
    this.text.style.margin = '6px 0 0';
    parent.appendChild(this.root);
    this.root.appendChild(this.text);
  }
  slider(label, obj, key, min, max, step = 0.01) {
    const row = document.createElement('label');
    row.style.display = 'block';
    const input = Object.assign(document.createElement('input'), { type: 'range', min, max, step, value: obj[key] });
    const out = document.createElement('span');
    out.textContent = ` ${label} = ${obj[key]}`;
    input.addEventListener('input', () => { obj[key] = Number(input.value); out.textContent = ` ${label} = ${input.value}`; });
    row.append(input, out);
    this.root.insertBefore(row, this.text);
  }
  stats(values) {
    this.text.textContent = Object.entries(values)
      .map(([k, v]) => `${k.padEnd(24)} ${typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : v}`)
      .join('\n');
  }
}
```

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-frame-budget.svg" localized="true" caption="描画ループの CPU タイミングモデル（呼び出しごとのコストは仮定で、図のスクリプトに明記しています。実測ではありません）。左: 3 つの送信戦略における、オブジェクト数に対する CPU フレーム時間。オブジェクトごとに 1 回のバッファ書き込みと 1 つのバインドグループ（素朴な方式）、動的オフセットによる 1 回のバッチ書き込み（このエンジン）、そしてインスタンシング。破線は 60 Hz と 120 Hz の予算です。右: オブジェクト 3,000 個のときの時間の内訳。" %}

まず左の図を見てください。素朴な方式の曲線が最初に 60 Hz の予算線を超えます。右の図では、モデルの仮定のもとで、オブジェクト 3,000 個のとき素朴な方式が約 40 ms（そのうちオブジェクトごとの書き込みとバインドグループ作成が約 30 ms）、このエンジンが約 11 ms、インスタンシングが約 1.7 ms です。この図は実測ではなくモデルですが、そのメッセージはプロファイラが実際に示す結果と一致します。GPU が忙しくなるずっと前に、オブジェクトごとの API 呼び出しが CPU 時間を支配するのです。このエンジンの単一の `writeBuffer` と動的オフセットは、その分岐点（knee）をはるか右へ動かします。インスタンシング（1 回の描画でメッシュの多数のコピーを描く）や GPU 駆動レンダリング（第 02 回）は、それをさらに右へ動かします。

### 10.1 エンジンが動いている様子

この記事の完全なコードは、下のフレームを描画します。私たちはこれを、ヘッドレス（headless）Chromium 上で、SwiftShader（Vulkan の CPU 実装）を使う WebGPU で、変更せずに実行しました。変更したのは*テスト用ハーネス*の 1 か所だけです。私たちのビルドマシンでは、ヘッドレス Chromium が `webgpu` キャンバスに表示できなかったため、ハーネスが `canvas.getContext('webgpu')` を、`getCurrentTexture()` がキャンバスと同じ大きさの通常の `rgba8unorm` テクスチャを返すオブジェクトに置き換え、そのテクスチャを `copyTextureToBuffer` で読み戻しました（12 節のゴールデンイメージの手法です）。この実行では、WebGPU の検証エラーも WGSL の警告も一切報告されませんでした。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-engine-frame.png" caption="この記事のミニエンジンが描画した 1 フレームで、上で説明した実行から取得したものです。左: ターンテーブル上の DamagedHelmet モデルと 6 m の地面。ベースカラーとメタリック・ラフネスのテクスチャ、6 節の Cook-Torrance シェーダ、7 節の 2048 × 2048 シャドウマップと 3 × 3 PCF、Reinhard トーンマッピングを使っています。右: 同じ実行でのこの節のデバッグパネル。GPU 時間（シャドウ 11 ms、不透明 34 ms）は CPU 上のソフトウェアラスタライザによるもので、どんな実際の GPU よりもはるかに遅いため、比率だけを比べてください。モデル: Khronos glTF Sample Assets、ctxwing による CC BY 4.0、theblueturtle_ による CC BY-NC 4.0 のモデルに基づきます。" %}

この最初の実行ではバグも 1 つ見つかり、それ自体が良い教訓になります。DamagedHelmet は `emissiveFactor` を $(1, 1, 1)$ に設定し、同時に、テクセルの 99 % 以上が黒い（光るのは小さなライト数か所だけの）`emissiveTexture` を持っています。最初の版のローダはこの係数をコピーしながらテクスチャを無視していたため、シェーダがすべてのピクセルに 1 の発光を加え、ヘルメット全体が平坦で白っぽく光っていました。glTF では発光色は係数とテクスチャの*積*なので、テクスチャを読み飛ばすローダは係数も捨てなければなりません。これが 4 節の `parseMaterial` にある 1 行のルールです。`material.emissive` だけを出力するデバッグビューがあれば、問題はすぐに分かったはずです。

## 11. デバッグ: RenderDoc とブラウザのツール

グラフィックスのバグは、たいてい何のエラーも出しません。画面が真っ黒になる、オブジェクトが消える、影が違う位置に出る、といった形で現れます。これらのツールを早い段階から使う習慣をつけましょう。

- **どこにでもラベルを付ける。** 上のコードの `createBuffer`、`createTexture`、パイプライン、パス、エンコーダにはすべて `label` があります。WebGPU のエラーメッセージはそれらを引用し（「[Buffer "objects"] ... 」）、キャプチャツールも表示します。
- **エラースコープ（error scope）。** 疑わしいコードを `device.pushErrorScope('validation')` ... `await device.popErrorScope()` で囲むと、まさにそのコードのエラーを取得できます。それ以外のすべては、`initGPU` の `uncapturederror` ハンドラが捕捉します。`device.lost` も監視してください。
- **シェーダコンパイル情報。** `await module.getCompilationInfo()` は、WGSL のエラーと警告を行番号付きで返します。
- **ブラウザの GPU ページ。** `chrome://gpu` は、Chrome の WebGPU 実装（Dawn）がどのバックエンド（D3D12、Metal、Vulkan）とどの GPU を使っているかを表示し、WebGPU 関連のフラグを一覧します。
- **WebGPU Inspector。** Brendan Duncan によるブラウザ拡張機能で、WebGPU の呼び出しを記録し、生きているすべてのオブジェクトを表示し、テクスチャとバッファを調べ、フレームをキャプチャできます。
- **RenderDoc。** Vulkan、D3D11/12、OpenGL の標準的なフレームデバッガです。Chrome は WebGPU を（実装である Dawn を通じて）D3D12、Metal、Vulkan に変換し、RenderDoc はブラウザの GPU プロセスから、その*変換後の*フレームをキャプチャできます。Dawn の[デバッグノート](https://dawn.googlesource.com/dawn/+/HEAD/docs/dawn/debugging.md)には、D3D12 バックエンドの Windows 向けの手順が書かれています。サンドボックスを無効にし、GPU の起動ダイアログを有効にして Chrome を起動し、RenderDoc を「GPU」プロセスにインジェクトします。見えるのは WGSL ではなく Dawn が生成した HLSL と、設定したすべての `label` です。正確なパイプライン状態が必要なときに適したツールで、ネイティブの Vulkan/D3D12 や wgpu アプリケーションでは日常的に使うツールです（macOS では、Xcode の Metal デバッガが同じ役割を果たします）。
- **デバッグビュー。** 最も手軽なデバッガは、シェーダのスイッチです。法線、UV、粗さ、シャドウ係数、ライト空間の深度を色として出力します。必要になる前に、`debugView` ユニフォームとスライダを追加しておきましょう。

## 12. エンジンのテスト方法

グラフィックスのコードは、「見た目が正しい」ことをアサートするのが難しいため、テストが極端に不足しがちです。厳密にテストできるものと、画像が必要なものを分けましょう。

1. **純粋なロジックは Node でテストする。** `core/math.js`（行列の恒等式: $P V$ が既知の点を既知の NDC に写すこと、$\text{fromTRS}$ が $T \cdot R \cdot S$ と一致すること）、`ecs/world.js`（クエリがちょうど正しいエンティティを返すこと）、`scene/transform.js`（ダーティフラグが正しい個数だけ再計算すること）、`render/passes.js`（固定のリストに対する順序、カリング、生存期間）、そして小さな手作りの `ArrayBuffer` を使った `assets/gltf.js` です。最小限のテストに必要なのは `node:test` だけです。

   ```js
   // test/passes.test.mjs   run with: node --test   (finds *.test.mjs files)
   import { test } from 'node:test';
   import assert from 'node:assert/strict';
   import { PassList } from '../src/render/passes.js';

   test('culls unused passes and computes lifetimes', () => {
     const pl = new PassList()
       .add('shadow', { writes: ['shadowMap'], run() {} })
       .add('opaque', { reads: ['shadowMap'], writes: ['hdr', 'depth'], run() {} })
       .add('debugDepth', { reads: ['depth'], writes: ['debugView'], run() {} })
       .add('tonemap', { reads: ['hdr'], writes: ['backbuffer'], run() {} })
       .compile();
     assert.deepEqual(pl.order.map((p) => p.name), ['shadow', 'opaque', 'tonemap']);
     assert.deepEqual(pl.culled, ['debugDepth']);
     assert.deepEqual(pl.lifetimes.get('depth'), { first: 1, last: 1 });
   });
   ```

2. **ゴールデンイメージ（golden image）。** 固定のシーンを固定のカメラでヘッドレスに描画し（Playwright や Puppeteer 経由で WebGPU を有効にした Chrome、または CI 上のネイティブ Dawn や wgpu）、保存しておいた参照画像と、許容誤差を持つ指標（ピクセルごとの誤差と、しきい値を超えたピクセルの割合）で比較します。GPU が異なれば結果がわずかに異なるためです。
3. **検証をテストにする。** すべてのテストを、検証エラーが失敗として扱われる状態で実行します（WebGPU ではエラースコープ、ネイティブの Vulkan では検証レイヤ）。
4. **性能回帰テスト。** 固定のカメラパスに対して GPU タイムスタンプと CPU 時間を記録し、あるパスが、たとえば 10 % 遅くなったらビルドを失敗させます。

## 13. パフォーマンス上の落とし穴

よくある原因を、遭遇しやすい順におおよそ並べます。

- **フレームごとのオブジェクト作成。** バッファ、バインドグループ、パイプライン、テクスチャはリソースマネージャに属し、フレームごとにはバッファへ*書き込む*だけにします。特にパイプラインの作成は数ミリ秒かかることがあり、目に見えるヒッチを起こします（ロード時にプリコンパイルし、`createRenderPipelineAsync` を使います）。
- **オブジェクトごとの `writeBuffer`。** 各呼び出しはブラウザの GPU プロセスへの境界をまたぎます。すべてを 1 回の大きな書き込みにまとめる（第 9 節）か、ステージングのリングバッファを使います。
- **CPU と GPU の同期。** 同じフレーム内で `mapAsync` を待つこと、クエリ結果を同期的に読み戻すこと、フレームループ内で `onSubmittedWorkDone` を使うことは、CPU と GPU を直列化します。読み戻しは常に 1 フレーム以上あとに行います。
- **ソートされていない描画。** 描画のたびにパイプラインとバインドグループを切り替えてしまうこと。パイプライン順、次にマテリアル順でソートします。
- **オーバードローとフィルレート。** 高 DPI のキャンバスは、CSS サイズの 4〜9 倍のピクセル数を持ちます。デバイスピクセル比に上限を設け（このエンジンでは 2）、不透明なオブジェクトは手前から奥へ描画するか深度プリパスを使い、フルスクリーンパスのコストに注意します。
- **テクスチャのアップロードとミップマップの欠如。** ミップマップがないと、遠くのテクスチャはエイリアシングを起こし、テクスチャキャッシュをスラッシングさせます。ロード時に（レベルごとに 1 回のコンピュートまたはレンダーパスで）ミップを生成するか、できればアセットパイプラインで生成します。
- **ガベージコレクション。** 毎フレーム配列を確保すると（ホットパスでの `new Float32Array`、ループ内のクロージャなど）GC の停止を招くので、作業用の配列を再利用します。（このエンジンの `tonemapUBO` への書き込みは、コードを短くするためにあえて毎フレーム小さな配列を確保しています。演習として直してみてください。）

## 14. 次のステップ

この骨格から、自然に広がる拡張は、シリーズの残りの話題そのものです。

- **クラスタードライティング**（clustered lighting）による数百個の光源の扱い: 視錐台を 3D のクラスタのグリッドに分割し、コンピュートパスで光源をクラスタに割り当て、PBR シェーダではそのクラスタの光源だけをループします（アルゴリズムは第 02 回で説明しました）。
- **イメージベースドライティング**（image-based lighting）: 定数のアンビエント項を、事前フィルタ済みの環境マップと BRDF のルックアップテーブルに置き換えます（[グラフィックス第 04 回]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})）。
- **アセットパイプライン**: オフラインの「クッカー」（Node または Python）で、glTF を、生成したミップマップ、圧縮テクスチャ（KTX2/Basis Universal）、量子化した頂点、メッシュレット（meshlet）を含む GPU 向けのバイナリ形式に変換し、さらにコンテンツハッシュを付けて、変更されたアセットだけを再ビルドするようにします。
- **エディタ**: エンティティのインスペクタ、ギズモ、シリアライズ可能なコンポーネントの上に築いたアンドゥ/リドゥ、シェーダとアセットのホットリロード。
- **GPU 駆動レンダリング**: コンピュートシェーダでの視錐台カリングとオクルージョンカリング、および `drawIndexedIndirect`。これは[次の回]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})の Nanite へ真っ直ぐつながる道です。

## 代表的な論文

| 論文 | 発表先 | 年 | リンク | 意義 |
| --- | --- | --- | --- | --- |
| Williams, *Casting Curved Shadows on Curved Surfaces* | SIGGRAPH | 1978 | [DOI](https://doi.org/10.1145/965139.807402) | シャドウマップアルゴリズムの原典（第 7 節） |
| Reeves, Salesin & Cook, *Rendering Antialiased Shadows with Depth Maps* | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37402.37435) | パーセンテージクローザーフィルタリング。このエンジンのシェーダの PCF |
| Cook & Torrance, *A Reflectance Model for Computer Graphics* | ACM TOG | 1982 | [DOI](https://doi.org/10.1145/357290.357293) | あらゆる PBR シェーダの背後にあるマイクロファセット鏡面反射モデル |
| Walter, Marschner, Li & Torrance, *Microfacet Models for Refraction through Rough Surfaces* | EGSR | 2007 | [DOI](https://doi.org/10.2312/EGWR/EGSR07/195-206) | `D_GGX` で使っている GGX 分布 |
| Karis, *Real Shading in Unreal Engine 4* | SIGGRAPH course | 2013 | [PDF](https://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf) | glTF とほとんどのエンジンが採用した metallic-roughness ワークフロー |
| Donnelly & Lauritzen, *Variance Shadow Maps* | I3D | 2006 | [DOI](https://doi.org/10.1145/1111411.1111440) | フィルタ可能なシャドウマップ。PCF の古典的な代替手法 |
| Zhang, Sun, Xu & Lun, *Parallel-Split Shadow Maps for Large-scale Virtual Environments* | VRCIA | 2006 | [DOI](https://doi.org/10.1145/1128923.1128975) | カスケードシャドウマップの背後にあるアイデア |
| Lauritzen, Salvi & Lefohn, *Sample Distribution Shadow Maps* | I3D | 2011 | [DOI](https://doi.org/10.1145/1944745.1944761) | 実際に画面に映っている深度分布にカスケードをフィットさせる |
| O'Donnell, *FrameGraph: Extensible Rendering Architecture in Frostbite* | GDC talk | 2017 | [GDC Vault](https://www.gdcvault.com/play/1024612/FrameGraph-Extensible-Rendering-Architecture-in) | このエンジンのパスリストが模倣しているレンダーグラフ設計 |

## 学習リソース

- [WebGPU specification](https://www.w3.org/TR/webgpu/) と [WGSL specification](https://www.w3.org/TR/WGSL/)。やさしく完全なレッスンとして [WebGPU Fundamentals](https://webgpufundamentals.org/)。Brandon Jones の [WebGPU best practices](https://toji.dev/webgpu-best-practices/)。
- [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) と [glTF sample assets](https://github.com/KhronosGroup/glTF-Sample-Assets)（DamagedHelmet、Sponza、およびあらゆる機能の適合性確認用モデル）。
- Rust で同じ道のりをたどる [Learn Wgpu](https://sotrh.github.io/learn-wgpu/) と、C++ 向けの [Vulkan Tutorial](https://vulkan-tutorial.com/)。シャドウマッピングとアクネを図で説明している [LearnOpenGL](https://learnopengl.com/Advanced-Lighting/Shadows/Shadow-Mapping)。
- Romain Guy と Mathias Agopian による [Physically Based Rendering in Filament](https://google.github.io/filament/Filament.md.html)。第 6 節のシェーダについて、導出からコードまでを最も明快にたどれる文書です。
- Glenn Fiedler の [Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/)。第 2 節のループについての古典的な記事です。Robert Nystrom の [Game Programming Patterns](https://gameprogrammingpatterns.com/)（ゲームループ、更新メソッド、ダーティフラグ、コンポーネントの各章）。
- Jason Gregory, *Game Engine Architecture*（第 3 版、CRC Press、2018）。この回のすべてのレイヤを、製品規模で扱っています。
- ツール: [RenderDoc](https://renderdoc.org/)、[WebGPU Inspector](https://github.com/brendan-duncan/webgpu_inspector)、Chrome の `chrome://gpu`。

## 演習

1. **リバース Z。** `perspective` を、ニアが 1、ファーが 0 に写るように変更し、深度バッファを `depth32float` に、クリア値を 0 に、比較関数を `'greater'` に切り替えてください。計算例をやり直しましょう。原点の NDC 深度はいくつになり、なぜ精度が向上するのでしょうか。
   <details markdown="1"><summary>ヒント</summary>
   $n$ と $f$ の役割を入れ替えます。$P_{22} = n/(f-n)$、$P_{23} = nf/(f-n)$ です。すると原点は $n(f-3)/\big(3(f-n)\big) \approx 0.032$ に来ます。浮動小数点数は 0 付近で精度が最も高く、そこにはいま*遠方*のジオメトリが来るため、透視投影の深度が持つ双曲線的な分布が打ち消されます。
   </details>
2. **ストレージバッファによるインスタンシング。** 256 バイトの動的オフセットのスロットを、`@builtin(instance_index)` で添字を引く、行列の `var<storage, read>` 配列に置き換え、メッシュのすべてのコピーを 1 回の `drawIndexed(count, instances)` で描画してください。オブジェクトあたり何バイト節約できるでしょうか。
   <details markdown="1"><summary>ヒント</summary>
   オブジェクトあたり 192 バイトです（256 から 64 を引いた値）。描画リストをメッシュ順にソートし、メッシュごとに行列を連続して書き込み、最初のスロットを `firstInstance` として渡します。
   </details>
3. **法線マップ。** ローダを拡張して `TANGENT` と `normalTexture` を読み込み、シェーダで TBN 行列を使って `N` を摂動させてください。ファイルに接線がない場合は、どうするべきでしょうか。
4. **カスケードシャドウ。** カメラの視錐台を、$z_i = \lambda\, z_i^{\log} + (1-\lambda)\, z_i^{\text{lin}}$（ただし $\lambda \in [0, 1]$ は対数分割と線形分割の混合係数、$z_i^{\log} = n (f/n)^{i/3}$、$z_i^{\text{lin}} = n + (f-n)\, i/3$、$i = 0, 1, 2, 3$ が各カスケードの境界を与えます） で選んだ距離で 3 つのカスケードに分割し、カスケードごとに 1 つの正射影ライト行列をフィットさせてください。
5. **ローダのテスト。** メモリ上で 3 頂点の glTF（JSON と、`data:` URI として符号化した 36 バイトのバッファ）を作り、`readAccessor` でパースして位置をアサートしてください。次に `byteStride = 32` のインターリーブ版を追加し、第 4 節の計算例を確認しましょう。
   <details markdown="1"><summary>ヒント</summary>
   `readAccessor` に必要なのは `json` と `ArrayBuffer` の配列だけなので、`fetch` なしで Node 上で直接呼び出せます。
   </details>

[次の回]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})では、プロダクションのエンジン（Unreal Engine 5、Unity 6、Godot 4、Bevy）を取り上げ、ここで出会ったすべての問題、すなわちジオメトリの詳細度、グローバルイルミネーション、シャドウ、スケジューリング、ツールを、それらが大規模にどう解決しているかを示します。
