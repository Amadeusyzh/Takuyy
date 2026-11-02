---
layout: post
title: "动手实现一个迷你引擎：浏览器中的 WebGPU、glTF、PBR、阴影与 ECS"
date: 2026-10-27 13:03:00+0900
description: "一篇动手教程：用 JavaScript 和 WGSL 写出一个小而完整的真实引擎，包含固定时间步长循环、资源管理器、glTF 2.0 加载器、轨道相机、PBR 着色器、阴影贴图、极简 ECS、渲染通道列表、GPU 时间戳和调试界面，并附 Vulkan/C++ 与 Rust/wgpu 的对照说明。"
categories: graphics-engine
tags: [webgpu, wgsl, gltf, pbr, shadow-mapping, ecs, render-graph, engine]
series: graphics-engine
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## 为什么重要

[第一篇]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})把引擎拆解为若干层、游戏循环、面向数据的存储和实体组件系统（ECS, entity component system）。[第二篇]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})讲解了显式 GPU API、同步和渲染图（render graph）。本文把这些思想重新拼装起来。我们用大约 900 行 JavaScript 和 WGSL（WebGPU Shading Language，WebGPU 着色语言）写一个**小而完整的真实引擎**：它能加载 glTF 2.0 模型，用基于物理的材质（physically based material）着色，投射阴影，运行固定时间步长（fixed timestep）的模拟，把场景存放在 ECS 中，根据声明的通道列表（pass list）调度各个渲染通道，并用 GPU 时间戳查询（timestamp query）测量自身性能。

目的不是与[下一篇]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})中的那些引擎竞争，而是让你在亲手把每一块实现一遍之后，能够读懂它们的源码，并认出其中的每一层。

## 前置知识

- [第 01 篇]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }})中的引擎分层、游戏循环和 ECS；[第 02 篇]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }})中的设备（device）、队列（queue）、绑定组（bind group）和管线（pipeline）。
- [图形学第 01 篇]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }})中的齐次坐标（homogeneous coordinates）和相机变换，以及[图形学第 02 篇]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }})中的光栅化管线。
- [图形学第 04 篇]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})中的微表面 BRDF（我们只实现它，不再重新推导），以及[图形学第 03 篇]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})中的阴影贴图思想。
- 现代 JavaScript（ES 模块、类、`async`/`await`）和支持 WebGPU 的浏览器。截至 2026 年 11 月：Windows、macOS 和 ChromeOS 上的 Chrome 与 Edge 自 113 版起支持（[Chrome 博客](https://developer.chrome.com/blog/webgpu-release)），较新的 Android 设备自 121 版起支持；macOS、iOS、iPadOS 和 visionOS 上的 Safari 26 支持（[WebKit 博客](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)）；Windows 上的 Firefox 141 支持（[发布说明](https://www.firefox.com/en-US/firefox/141.0/releasenotes/)），Apple 芯片 Mac 上自 147 版起支持。

## 1. 我们要构建什么，以及模块边界

我们的引擎名为 *mini*，分层与第 01 篇完全一致，并遵循一条严格的规则：**一个模块只能从它下面的层导入**。GPU 层对实体一无所知；ECS 对 GPU 一无所知；渲染器读取 ECS，但从不修改它。

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

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-modules.svg" caption="迷你引擎的模块依赖图，由本文代码中的 `import` 语句计算得出。所有箭头都指向下方：`core`、`gpu` 和 `ecs` 不从引擎中导入任何东西，只有 `main.js` 能看到全部模块。如果你需要一条向上的箭头（例如渲染器修改某个组件），那就是设计上的坏味道。" %}

如图所示，该依赖图是一个三层的有向无环图（DAG）。这正是引擎可测试的原因：`core/math.js`、`ecs/world.js`、`assets/gltf.js`（给定一个 `ArrayBuffer`）和 `render/passes.js` 都可以在没有 GPU 的纯 Node.js 中运行，第 12 节测试的正是这几个模块。

**对应到其他技术栈。** 在 C++ 与 Vulkan 中，同样的划分通常变成静态库（`core`、`rhi`、`scene`、`renderer`），依赖规则由 CMake 目标来强制。在 Rust 与 [wgpu](https://github.com/gfx-rs/wgpu) 中，它变成 Cargo 工作区中的多个 crate，并由编译器强制：一个 crate 不能使用它没有声明依赖的 crate。

## 2. 固定时间步长的主循环

第 01 篇解释了为什么模拟应当以**固定步长** $\Delta t$ 推进，而渲染则按显示器允许的速率运行。设 $T_k$ 为第 $k$ 帧的实测时长，$A$ 为尚未被模拟的时间的*累加器*（accumulator）。每一帧执行

$$
A \leftarrow A + \min(T_k, T_{\max}), \qquad
\text{while } A \ge \Delta t:\ \text{update}(\Delta t),\ A \leftarrow A - \Delta t, \qquad
\alpha = A / \Delta t \in [0, 1).
$$

随后渲染器绘制最近两个模拟状态*之间*的状态，$s = (1-\alpha)\, s_{\text{prev}} + \alpha\, s_{\text{curr}}$。钳制值 $T_{\max}$（这里为 0.25 s）用来防止「死亡螺旋」（spiral of death）：一次长时间卡顿之后，循环否则会试图用几十次更新来追赶，导致下一帧耗时更长。

**算例。** 取 $\Delta t = 1/60\ \text{s} \approx 16.67$ ms，三帧的耗时分别为 10、10 和 25 ms：第 1 帧之后，$A = 10$，不更新，$\alpha = 0.6$。第 2 帧之后，$A = 20 \ge 16.67$，更新一次，$A = 3.33$，$\alpha = 0.2$。第 3 帧之后，$A = 28.33$，更新一次，$A = 11.67$，$\alpha = 0.7$。

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

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-fixed-timestep.svg" caption="上面的循环在一个带抖动、并含一次 80 ms 卡顿的模拟 60-120 Hz 显示器上运行，取 $\Delta t = 1/50$ s。上：帧边界（灰色刻度）与模拟步（紫色圆点）；大多数帧执行 0 或 1 步，卡顿帧执行 4 步。下：更新之后的累加器 $A$（始终小于 $\Delta t$，虚线）和 $\alpha = A/\Delta t$，即渲染器收到的插值权重。" %}

该图是这个函数在模拟帧时间上的真实运行结果。请注意，即使模拟本身推进得完全均匀，每帧的步数也并不规则：这正是渲染必须用 $\alpha$ 做插值的原因。

`requestAnimationFrame` 传入的时间戳与 `performance.now()` 使用同一个时钟，因此二者可以混用。在 C++ 中你会使用 `std::chrono::steady_clock` 并配合垂直同步（vsync）呈现；在 Rust/winit 中，则由 `RedrawRequested` 事件来驱动同一个函数。

## 3. 设备、画布与资源

### 3.1 设备与「交换链」

WebGPU 把交换链（swap chain）隐藏在**画布上下文（canvas context）**之后：你用一个设备和一种纹理格式配置它一次，之后每帧由 `context.getCurrentTexture()` 交给你要渲染到的图像。当渲染它的任务返回浏览器时，呈现会自动发生。

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

**Vulkan/C++。** 这一个函数会变成几百行代码：创建 `VkInstance`，挑选 `VkPhysicalDevice`，创建 `VkDevice` 和队列，创建 `VkSurfaceKHR` 与 `VkSwapchainKHR`，并在每一帧获取图像（用信号量，semaphore）、渲染、再呈现（等待另一个信号量），同时用栅栏（fence）保证 CPU 领先不超过两三帧。**Rust/wgpu** 保持了 WebGPU 的形态：`Instance`、`Adapter`、`Device` 与 `Queue`、`Surface::configure`，然后每帧调用 `surface.get_current_texture()` 和 `frame.present()`。

### 3.2 资源管理器

每个引擎都有一个拥有 GPU 对象的层，使其余代码不必随意临时创建它们。我们的资源管理器做四件事：

1. **缓冲区（buffer）**在创建时就已填充数据（`mappedAtCreation`），大小按 WebGPU 的要求向上取整为 4 字节的倍数。
2. **纹理（texture）**来自解码后的图像，色彩空间由调用者选择（颜色用 `rgba8unorm-srgb`，粗糙度之类的数据用 `rgba8unorm`）。
3. **采样器、着色器模块和管线按键缓存。**创建管线要编译着色器，可能耗时数毫秒；它必须按每个*变体*只发生一次，而不是每个对象一次。
4. **统计信息**，让调试界面能显示当前存在多少对象和多少字节。

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

管线的键是一个字符串，编码了所有会改变已编译管线的因素，例如 `pbr|rgba16float|cull-back`。真实的引擎会根据材质的着色器变体、顶点布局和渲染目标格式来构造键，并在加载期间用 `createRenderPipelineAsync` 创建管线，使第一帧不会卡顿。在 Vulkan 中与之对应的对象是 `VkPipelineCache`（把已编译管线持久化到磁盘）和 VMA 之类的内存分配器；在 wgpu 中则是 `Device::create_render_pipeline` 加上你自己的管线 `HashMap`。

**Uniform 对齐。**我们会把每个对象的模型矩阵存放在一个大的 uniform 缓冲区里，并用*动态偏移*（dynamic offset）来选取。WebGPU 要求这些偏移是 `minUniformBufferOffsetAlignment` 的倍数，默认值为 256 字节。一个模型矩阵是 64 字节，所以每个对象占用一个 256 字节的槽位：第 $i$ 个对象位于字节 $256\,i$ 处，1024 个对象需要 256 KiB，其中 75 % 是填充。这种取舍（浪费一些字节，换来只需一次缓冲区写入、无需为每个对象创建绑定组）几乎总是值得的；按实例 ID 索引的存储缓冲区（storage buffer）可以去掉填充，这是练习之一。

## 4. 加载 glTF 2.0

[glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) 是「3D 领域的 JPEG」：一份 JSON 场景描述加上若干二进制缓冲区，既可以是分开的文件（`.gltf` + `.bin` + 图像），也可以打包成单个二进制 `.glb`。它被设计为可直接加载进 GPU 缓冲区，这恰恰使它的结构成为引擎数据设计的一堂课。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-gltf-structure.svg" caption="glTF 2.0 文件的引用链，以一个只含一个网格的小例子绘制。每条箭头都是指向某个顶层数组的整数索引。几何沿 node → mesh → primitive → accessor → bufferView → buffer 走；外观沿 primitive → material → texture → image 与 sampler 走。我们的加载器正是沿着这些箭头工作。" %}

请从图的顶部读起。一个**场景（scene）**列出若干根**节点（node）**。节点具有局部变换（要么是 4x4 的 `matrix`，要么是 `translation`、四元数 `rotation` 和 `scale`，按 $T R S$ 组合）、可选的 `children` 和可选的**网格（mesh）**。网格是**图元（primitive）**的列表；每个图元对应一次绘制调用：一组顶点属性（`POSITION`、`NORMAL`、`TEXCOORD_0` 等）、可选的 `indices` 和一个**材质（material）**。每个属性都是一个**访问器（accessor）**：它是指向某个 **bufferView** 的带类型视图（`componentType`、`type`、`count`），而 bufferView 是某个**缓冲区（buffer）**中的一段字节范围（`byteOffset`、`byteLength`，以及可选的 `byteStride`）。

唯一的算术是访问器第 $i$ 个元素、第 $c$ 个分量的地址：

$$
\text{addr}(i, c) = \text{bufferView.byteOffset} + \text{accessor.byteOffset} + i \cdot \text{stride} + c \cdot \text{sizeof(component)},
$$

其中 $\text{stride}$ 在存在时取 `byteStride`，否则取紧密排列的元素大小（`FLOAT` 类型的 `VEC3` 为 12 字节）。

**算例。** 一个交错（interleaved）顶点缓冲区为每个顶点存放位置（12 字节）、法线（12）和 UV（8），因此 `byteStride = 32`。`NORMAL` 访问器的 `byteOffset = 12`。顶点 2 的法线起始于 $0 + 12 + 2 \cdot 32 = 76$，它的 $z$ 分量位于 $76 + 2 \cdot 4 = 84$。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-accessor-layout.svg" caption="上述交错 bufferView 的字节布局：三个访问器（POSITION 偏移 0，NORMAL 偏移 12，TEXCOORD_0 偏移 24）共享 32 字节的同一个步长。高亮的格子就是算例，即字节 84 = 顶点 2 的法线的 z。索引访问器位于第二个紧密排列的 bufferView 中。" %}

下面的加载器处理 `.gltf` 和 `.glb`、外部与内嵌的缓冲区和图像、归一化整数属性，并在文件没有法线时自行计算法线。它有意跳过了稀疏访问器、蒙皮、形变目标、动画、相机和扩展（都是很好的练习）。请注意 GLB 头部的样子：魔数 `0x46546C67`（即 ASCII 字节 `glTF`），版本号 2，然后是标记为 `JSON` 和 `BIN` 的数据块（chunk）。

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
    emissiveFactor: m.emissiveFactor || [0, 0, 0],
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

有两个细节关系到图像是否正确。颜色纹理（`baseColorTexture`、`emissiveTexture`）是 sRGB 编码的，必须以 `rgba8unorm-srgb` 上传，这样采样返回的才是*线性*值；`metallicRoughnessTexture` 存放的是数据（粗糙度在绿色通道，金属度在蓝色通道），必须保持为 `rgba8unorm`。此外，glTF 是右手系、$+Y$ 向上、单位为米，与我们的数学库约定相同，因此不需要翻转坐标轴。

我们的加载器返回的是普通数组，而不是 GPU 对象。这种拆分（在 CPU 上解析，在渲染器里上传）使同一个解析器既能在单元测试里运行，也能在工作线程（worker thread）里运行，还能用于离线的资源烘焙器（asset cooker，第 14 节）。

## 5. 数学库与带输入的相机

### 5.1 约定

我们把矩阵存为 16 个浮点数，采用**列主序（column-major）**（元素 $(r, c)$ 位于下标 $4c + r$），这与 WGSL、glTF 和 OpenGL 相同。观察空间是右手系，朝 $-z$ 方向看。与 OpenGL 唯一不同的是投影：WebGPU 裁剪空间的深度范围是 $[0, 1]$，而不是 $[-1, 1]$。对于垂直视场角 $\theta$、宽高比 $a$ 以及近/远平面 $n, f$，令 $s = 1/\tan(\theta/2)$：

$$
P = \begin{pmatrix} s/a & 0 & 0 & 0 \\ 0 & s & 0 & 0 \\ 0 & 0 & \frac{f}{n-f} & \frac{nf}{n-f} \\ 0 & 0 & -1 & 0 \end{pmatrix}.
$$

验证：位于 $z_v = -n$ 的点得到 $z_c = \frac{-fn + nf}{n-f} = 0$，位于 $z_v = -f$ 的点得到 $z_c = \frac{-f^2 + nf}{n-f} = f = w_c$，因此深度 $z_c/w_c$ 从 0 变到 1。

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

**算例（可以直接粘贴到 Node 中运行）。** 相机位于 $(0, 0, 3)$，看向原点，$\theta = 60°$，$a = 1$，$n = 0.1$，$f = 100$：原点应落在屏幕正中，深度略小于 1（透视深度非常非线性），而点 $(1, 0, 0)$ 应落在 $x_{\text{ndc}} = s/3 = 1.732/3 \approx 0.577$。

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

一个仅 3 m 远的点（远平面在 100 m）深度就达到 0.9676，这就是透视深度著名的精度问题：$[0,1]$ 范围的大部分都消耗在靠近相机的地方。生产级引擎使用**反向 Z（reversed-Z）**（配合浮点深度缓冲，把近平面映射到 1、远平面映射到 0），这是练习之一。

### 5.2 输入与轨道相机

**轨道相机（orbit camera）**保存一个目标点 $\mathbf{t}$、一个距离 $r$、一个偏航角（yaw）$\psi$ 和一个俯仰角（pitch）$\phi$，并把眼睛放在一个球面上：

$$
\mathbf{e} = \mathbf{t} + r\,(\cos\phi \sin\psi,\ \sin\phi,\ \cos\phi \cos\psi).
$$

拖动改变 $\psi$ 和 $\phi$（俯仰角被钳制在 $\pm 90°$ 以内，使 `lookAt` 的 `up` 向量永远不会与视线方向平行），滚轮按几何方式缩放 $r$（每格 10 %，使缩放在任何距离上手感都相同），WASD 则在相机的水平面内移动目标点。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-orbit-camera.svg" caption="使用默认参数（$r = 4$、$\psi = 0.6$、$\phi = 0.35$）的轨道相机：位于目标周围球面上的眼睛 $\mathbf{e}$，以及由 `lookAt` 算出的相机基（红色 $x$ 指向右，绿色 $y$ 指向上，蓝色 $z$ 指向后方，即背离目标）。视锥体按 60° 视场角绘制，为了清晰在 1.5 个单位处截断。" %}

如图所示，相机的 $z$ 轴指向它所看对象的*反方向*，这就是投影矩阵最后一行为 $-1$ 的原因。

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

相机每个*渲染*帧更新一次，而不是在固定的模拟步中更新：输入应当有即时反馈，而且相机不参与物理。在 Vulkan 下你会通过 GLFW 或 SDL 读取输入；在 Rust 中则通过 `winit` 事件。数学部分完全相同。

## 6. 用 WGSL 编写 PBR 材质着色器

理论部分见[图形学第 04 篇]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})；这里我们只做翻译。对于一个方向光，其按辐射度缩放的颜色为 $E_L$，从方向 $\mathbf{l}$ 到达，朝向观察者 $\mathbf{v}$ 的出射辐射度为

$$
L_o = \Big( \underbrace{(1 - F)(1 - m)\,\frac{\mathbf{c}}{\pi}}_{\text{diffuse}} + \underbrace{D(\mathbf{h})\, V(\mathbf{v}, \mathbf{l})\, F(\mathbf{v}, \mathbf{h})}_{\text{specular}} \Big)\, E_L\, (\mathbf{n} \cdot \mathbf{l})\, s,
$$

其中 $\mathbf{c}$ 是基础颜色，$m$ 是金属度，$\mathbf{h}$ 是半程向量，$D$ 是 $\alpha = \text{roughness}^2$ 的 GGX 分布，$V$ 是高度相关的 Smith 可见性项（它已经包含了 $1/(4\, \mathbf{n}\cdot\mathbf{v}\, \mathbf{n}\cdot\mathbf{l})$ 这个分母），$F$ 是 Schlick 菲涅尔项，$F_0 = \text{mix}(0.04, \mathbf{c}, m)$，$s \in [0, 1]$ 是下一节的阴影因子。这就是 glTF 的金属-粗糙度模型，Filament 和 Unreal Engine 4 使用的也是同一个模型。

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

这个着色器里藏着三个引擎层面的要点：

1. **按更新频率划分绑定组。**组 0 每帧变一次，组 1 每个材质变一次，组 2 每个对象变一次。渲染器按材质对绘制排序，使组 1 尽可能少地变化。Vulkan 有相同的模型（描述符集，descriptor set）；D3D12 则为同一目的使用根签名（root signature）和描述符表（descriptor table）。
2. **WGSL 的结构体布局是与 JavaScript 之间的契约。**`Frame` 为 176 字节：两个矩阵（128），然后是三组 `vec3f` + `f32`，每组 16 字节。渲染器按这些确切的偏移填充一个 `Float32Array(44)`。弄错它是 WebGPU 中最常见的 bug；反射工具或单一的共享布局描述会有帮助。
3. **着色器写出的是线性 HDR 辐射度。**色调映射（tone mapping）和 sRGB 编码发生在后面的通道中，因此光照在最后一刻之前始终保持物理意义。

## 7. 阴影贴图通道

[图形学第 03 篇]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }})介绍了阴影贴图的思想：从光源出发渲染场景的深度，然后在着色一个点 $\mathbf{p}$ 时，把它到光源的深度与存储的深度比较。下面是针对方向光的引擎版本。

**光源矩阵。**我们围绕场景的包围球（中心 $\mathbf{c}$，半径 $R$）拟合一个正交盒。光源「相机」位于 $\mathbf{c} - 2R\,\mathbf{d}$，沿光线方向 $\mathbf{d}$ 看去，它的盒子在 $[-R, R]^2$ 范围内，深度范围为 $[R, 3R]$，因此球体位于其内部。于是对任何世界空间的点

$$
\mathbf{q} = P_L V_L \begin{pmatrix}\mathbf{p}\\ 1\end{pmatrix}, \qquad (u, v) = \Big(\tfrac{q_x + 1}{2},\ \tfrac{1 - q_y}{2}\Big), \qquad \text{lit} \iff q_z - b < \text{shadowMap}(u, v),
$$

其中 $b$ 是一个小的深度偏置（bias）。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-shadow-geometry.svg" caption="阴影通道，由计算得出。左：光源的正交视锥（黄色盒）包围着一个玩具场景（地面、球体、盒子）；箭头为光线方向。地面上的点 $\mathbf{p}$（黑色）沿光线方向投影到纹素 $(u, v)$；该射线上遇到的第一个表面是球体，所以 $\mathbf{p}$ 处于阴影中。右：真正从光源渲染出的深度图（越暗越靠近光源），并标出 $(u, v)$；其中存储的深度小于 $\mathbf{p}$ 自身的深度。" %}

**阴影痤疮与偏置。**一个阴影贴图纹素覆盖接收面上有限大小的一小块。在相对光线倾斜 $\theta$ 角的表面上，世界尺寸为 $w$ 的一个纹素内部的深度，会在存储的中心值附近变化最多 $\tfrac{w}{2}\tan\theta$，因此没有偏置时，表面有一半会以条纹图案给自己投下阴影（**痤疮**，acne）。偏置过大则会让阴影与遮挡物分离（**彼得潘现象**，peter-panning）。所需的最小偏置随斜率增长，这就是 GPU 在光栅化器中提供*斜率缩放*（slope-scaled）深度偏置的原因。

**算例。**一个半径为 $R = 5$ m 的场景使用 2048² 的贴图，纹素大小为 $w = 2R/2048 \approx 4.9$ mm。在 45° 的斜面上，深度误差最大为 $w/2 \approx 2.4$ mm；换算成归一化深度（范围 $2R = 10$ m）就是 $2.4 \times 10^{-4}$。仅用一个常数 `shadowBias` 取 $5 \times 10^{-4}$，就能覆盖最大 $\arctan(5/2.44) \approx 64°$ 的斜率；对更陡的表面，则由光栅化器的斜率缩放偏置（阴影管线中的 `depthBiasSlopeScale`）来起作用。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-shadow-bias.svg" caption="阴影痤疮，在 2D 中计算得出。左：一个倾斜 30° 的接收面处于来自上方的光照下；阴影贴图每个纹素存储一个深度（阶梯状）。没有偏置时，图中红色的接收点位于其所属纹素存储深度的后面，被错误地置于阴影中，呈规则的条纹图案。右：消除痤疮所需的偏置 $\tfrac{w}{2}\tan\theta$ 随斜率角的变化，并对比常数偏置（水平线）和常数加斜率缩放偏置（曲线）。" %}

下面的小部件在一个 2D 场景上执行与着色器完全相同的测试 `depth - bias <= stored`，并与精确可见性进行比较。先把偏置设为零，观察阴影痤疮的条纹；增大偏置直到条纹消失；再继续增大，就会看到光线从盒子底下漏出（peter-panning，悬浮阴影）。打开斜率缩放项并倾斜光源：它只需小得多的常数偏置就能消除斜坡上的痤疮。

{% include widget.liquid name="graphics-engine-shadow-bias" height="470" caption="2D 中的阴影痤疮与偏置。橙色阶梯是阴影贴图中存储的深度，每个纹素一个；表面点的颜色为绿色（正确照亮）、灰色（正确处于阴影）、红色（痤疮：错误地处于阴影）或蓝色（漏光：错误地被照亮）。可调整光源角度（或在场景中拖动）、纹素数和偏置，并切换斜率缩放偏置 $\tfrac{w}{2}\tan\theta$。" %}

阴影的顶点着色器非常小，而且该通道根本没有片元着色器：只写入深度。

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

下面这个系统会在光源或场景边界变化时重新计算光源矩阵：

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

对于大型室外场景，单张贴图的分辨率远远不够；**级联阴影贴图（cascaded shadow maps）**按距离切分视锥，并给每一段分配自己的贴图，而**虚拟阴影贴图（virtual shadow maps）**（见[下一篇]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})）只在屏幕需要的地方，才从一张巨大的虚拟贴图中分配页面。

## 8. 一个极简的 ECS 驱动场景

第 01 篇比较了原型（archetype）式和稀疏集（sparse-set）式的 ECS 设计。我们的是仍然具备正确*形态*的最简单实现：实体是整数，每种组件类型有自己的存储，而**系统（system）**是普通函数，用于查询拥有某组组件的实体。

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

每种组件一个 `Map` 对缓存并不友好（第 01 篇解释了原型为什么把组件存放在稠密数组中），但它的*接口*（创建、添加、查询、系统）与 Bevy、Flecs 或 EnTT 暴露的接口相同，因此你以后可以替换存储，而无需改动系统。

### 8.1 变换、层级与脏标记

变换层级是 ECS 与**场景图（scene graph）**交汇的地方。每个 `transform` 组件存储局部平移、旋转和缩放、它的父节点、它的子节点、一个局部矩阵、一个**世界矩阵（world matrix）**和一个**脏标记（dirty flag）**。节点 $k$ 的世界矩阵是沿它从根出发的路径所做的乘积：

$$
W_k = W_{\text{parent}(k)}\, L_k = L_{\text{root}} \cdots L_{\text{parent}(k)}\, L_k .
$$

改变 $L_k$ 会使 $W_k$ 和每个后代的世界矩阵失效，而不影响其他任何节点。因此 `markDirty` 标记整棵子树，变换系统只重新计算被标记的节点，且父节点先于子节点。

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

**算例。**在 root → arm → hand 这条链中，旋转 root 会标记全部三个节点，系统执行三次矩阵乘法；只旋转 hand 则只标记一个节点，耗费一次乘法。在一个有 10,000 个静态道具和一个动画角色的场景里，脏标记把每帧 10,000 次乘法变成几十次。可以在小组件里试试：拖动或旋转一个父节点，看哪些节点会亮起来。

{% include widget.liquid name="graphics-engine-scene-graph" height="460" caption="带局部与世界变换的场景图。拖动一个节点来移动它（在其父节点的坐标系中），或使用旋转按钮；子节点会跟随。可以在世界变换与局部变换之间切换视图，并观察脏标记的传播：最近一次更新中被重新计算的节点会闪烁橙色，计数器显示重新计算了多少个节点。取消勾选脏标记，可以与每次改动都重算所有节点的做法对比。" %}

### 8.2 生成 glTF 场景与一帧中的各个系统

组合根（composition root）把加载器给出的普通数据转换成 GPU 资源和实体，注册各个系统，并启动循环。请留意固定步长的 `spinSystem` 如何存储上一个与当前的角度，而渲染步骤在变换系统运行之前用 $\alpha$ 进行插值。

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

`render` 中各系统的顺序是一个小小的**调度（schedule）**：输入 → 相机 → 插值 → 变换 → 光源 → 渲染。引擎会把它显式化（Bevy 的调度与系统集、Unity 的系统组、Unreal 的 tick 组），因为一个在变换系统运行之前就读取变换的系统，看到的是上一帧的数据，这是经典的滞后一帧的 bug。

## 9. 一个微型通道列表（60 行的帧图）

第 02 篇描述了**渲染图（render graph）**：每个通道声明自己读写哪些资源；图对通道排序，剔除结果无人使用的通道，并推导出每个资源的生命周期，从而可以对瞬态内存做别名复用（aliasing），并自动放置屏障（barrier）。WebGPU 会替我们插入屏障，但其余三项好处只需几行代码就能实现。

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

我们的渲染器声明了四个通道，其中一个是没有任何东西消费的调试可视化：

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

`depth` 的生命周期在 `opaque` 通道内部就结束了，所以渲染器可以把它的 `depthStoreOp` 设为 `'discard'`：在基于分块（tile-based）的移动 GPU 上，这样可以省去把整个深度缓冲区写回内存的开销。生命周期还能告诉我们哪些瞬态纹理可以共享内存。下面两张图展示了同一个编译器处理一个更大、更真实的帧。

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-frame-graph.svg" caption="一个更完整的帧的数据流，由图脚本中 `PassList.compile` 的 Python 移植版计算得出：通道（圆角框）按执行顺序从左到右排列，资源（灰色标签）位于边上。被剔除的通道 `ssaoDebug`（虚线）写入的纹理无人读取，所以它从不运行。" %}

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-resource-lifetime.svg" caption="同一帧中瞬态资源的生命周期（从首次使用到最后一次使用的条形，以通道索引计），以及贪心区间分配器分配的内存槽位。条形不重叠的资源共享一个槽位（颜色相同），因此这一帧只需要 3 个槽位而不是 7 个（假设尺寸和格式兼容），这就是渲染图所自动完成的别名复用。" %}

下面是拥有这些通道的渲染器。它是最大的文件，但其中每一行都属于上面的某个概念。

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

色调映射通道绘制一个覆盖整个屏幕的三角形，读取每个像素下方的 HDR 纹素，应用曝光和 Reinhard 曲线 $c/(1+c)$，并编码为 sRGB（画布格式不是 `-srgb` 格式，所以着色器用 $1/2.2$ 次幂来做编码）：

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

**Vulkan/C++。**通道列表正是 Vulkan 变得有趣的地方：图还必须在通道之间发出 `vkCmdPipelineBarrier2` 调用（图像布局转换，例如阴影贴图从 `DEPTH_ATTACHMENT_OPTIMAL` 到 `SHADER_READ_ONLY_OPTIMAL`），并且在使用动态渲染（dynamic rendering）时，每个通道都变成一个 `vkCmdBeginRendering` 块。**Rust/wgpu** 的行为与 WebGPU 类似（屏障是自动的）；`rend3` 之类的 crate 曾在其之上构建过渲染图。

## 10. 调试界面与 GPU 时间戳查询

无法测量就无法优化，而 CPU 计时器对 GPU 一无所知：`queue.submit` 在 GPU 完成工作很久之前就已返回。WebGPU 的可选特性 `timestamp-query` 允许每个通道在开始和结束时，把一个 GPU 时间戳（单位为纳秒）写入 `GPUQuerySet`。我们把查询集解析（resolve）到一个缓冲区里，再复制到可映射的缓冲区，并在一两帧之后*异步*读回。

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

使用一个小的读回缓冲区池很重要：正在被映射的缓冲区无法用于下一帧的复制，而等待它会让 CPU 卡在 GPU 上，这是第 13 节中最糟糕的陷阱。规范允许浏览器降低时间戳的精度（以防御计时侧信道），Chrome 默认把它量化到 100 µs（[Chrome 博客](https://developer.chrome.com/blog/new-in-webgpu-120)），所以应把单个数值视为近似值，并像 `readback` 那样在多帧上取平均。

调试面板有意做成纯 HTML：绑定到对象属性的滑块，加上一个显示统计信息的文本块。在 C++ 引擎中这个角色由 Dear ImGui 担任，在 Rust 引擎中则是 `egui`。

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

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-frame-budget.svg" localized="true" caption="渲染循环的 CPU 计时模型（假设的单次调用开销，已在图脚本中说明；不是实测）。左：三种提交策略下 CPU 帧时间随对象数量的变化：每个对象一次缓冲区写入加一个绑定组（朴素做法）、一次批量写入加动态偏移（本引擎）以及实例化。虚线是 60 Hz 和 120 Hz 的预算。右：3,000 个对象时时间的去向。" %}

该图是模型而非实测，但它传达的信息与性能分析器在实践中显示的一致：在 GPU 忙起来之前很久，按对象的 API 调用就已主导了 CPU 时间。我们引擎中单次 `writeBuffer` 加动态偏移，把拐点移到了很靠右的位置；实例化（一次绘制多个网格副本）或 GPU 驱动渲染（第 02 篇）会把它推得更远。

## 11. 调试：RenderDoc 与浏览器工具

图形 bug 往往是无声的：黑屏、物体消失、阴影出现在错误的位置。请尽早养成使用这些工具的习惯。

- **到处加标签。**上面每个 `createBuffer`、`createTexture`、管线、通道和编码器都有 `label`。WebGPU 的错误信息会引用它们（「[Buffer "objects"] ... 」），捕获工具也会显示它们。
- **错误作用域（error scope）。**把可疑的代码包在 `device.pushErrorScope('validation')` ... `await device.popErrorScope()` 之间，就能得到恰好那段代码产生的错误；`initGPU` 中的 `uncapturederror` 处理器捕获其余所有错误。也要监听 `device.lost`。
- **着色器编译信息。**`await module.getCompilationInfo()` 会返回带行号的 WGSL 错误和警告。
- **浏览器 GPU 页面。**`chrome://gpu` 显示 Chrome 的 WebGPU 实现（Dawn）使用哪个后端（D3D12、Metal、Vulkan）和哪块 GPU，并列出与 WebGPU 相关的标志。
- **WebGPU Inspector。**Brendan Duncan 开发的浏览器扩展，可记录 WebGPU 调用，显示每个存活对象，让你检查纹理和缓冲区，并捕获一帧。
- **RenderDoc。**Vulkan、D3D11/12 和 OpenGL 的标准帧调试器。Chrome 通过其实现 Dawn 把 WebGPU 转换成 D3D12、Metal 或 Vulkan，RenderDoc 可以从浏览器的 GPU 进程中捕获这个*转换后*的帧。Dawn 的[调试说明](https://dawn.googlesource.com/dawn/+/HEAD/docs/dawn/debugging.md)描述了 Windows 与 D3D12 后端下的做法：以禁用沙箱并带 GPU 启动对话框的方式启动 Chrome，然后把 RenderDoc 注入「GPU」进程。你会看到 Dawn 生成的 HLSL 而不是你的 WGSL，以及你设置的每一个 `label`。当你需要精确的管线状态时它是合适的工具，也是原生 Vulkan/D3D12 和 wgpu 应用的日常工具（在 macOS 上，Xcode 的 Metal 调试器扮演相同的角色）。
- **调试视图。**最便宜的调试器是一个着色器开关：把法线、UV、粗糙度、阴影因子或光源空间深度输出为颜色。在需要之前就先加一个 `debugView` uniform 和一个滑块。

## 12. 如何测试一个引擎

图形代码出了名地缺少测试，因为「看起来对」很难断言。请把可以精确测试的部分与需要图像的部分分开：

1. **纯逻辑，在 Node 中测试。**`core/math.js`（矩阵恒等式：$P V$ 把已知点映射到已知的 NDC，$\text{fromTRS}$ 与 $T \cdot R \cdot S$ 一致）、`ecs/world.js`（查询恰好返回正确的实体）、`scene/transform.js`（脏标记重新计算了正确的数量）、`render/passes.js`（对固定列表检查顺序、剔除和生命周期），以及在手工构造的小 `ArrayBuffer` 上测试 `assets/gltf.js`。一个最小的测试只需要 `node:test`：

   ```js
   // test/passes.test.mjs   run with: node --test test/
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

2. **黄金图像（golden image）。**用固定的相机无头渲染固定的场景（通过 Playwright 或 Puppeteer 使用支持 WebGPU 的 Chrome，或在 CI 中使用原生 Dawn 或 wgpu），并用容差度量（逐像素误差以及超过阈值的像素比例）与存储的参考图像比较，因为不同 GPU 会产生略有差异的结果。
3. **把校验当作测试。**运行每个测试时，把校验错误变成失败（WebGPU 的错误作用域；原生环境下则是 Vulkan 校验层）。
4. **性能回归测试。**对固定的相机路径记录 GPU 时间戳和 CPU 时间，如果某个通道变慢了，比如 10 %，就让构建失败。

## 13. 性能陷阱

常见的元凶，大致按你会遇到的顺序排列：

- **每帧创建对象。**缓冲区、绑定组、管线和纹理属于资源管理器；每帧你只应当*写入*缓冲区。尤其是创建管线，可能耗时数毫秒并造成明显的卡顿（在加载时预编译，使用 `createRenderPipelineAsync`）。
- **每个对象一次 `writeBuffer`。**每次调用都会跨入浏览器的 GPU 进程；应把所有内容合并为一次大的写入（第 9 节），或使用暂存环形缓冲区（staging ring buffer）。
- **CPU-GPU 同步。**在同一帧里等待 `mapAsync`、同步读回查询结果，或在帧循环中使用 `onSubmittedWorkDone`，都会使 CPU 与 GPU 串行化。始终在一帧或更晚之后再读回。
- **未排序的绘制。**每次绘制之间都切换管线和绑定组；应先按管线、再按材质排序。
- **过度绘制与填充率。**高 DPI 画布的像素数是 CSS 尺寸的 4 到 9 倍。应限制设备像素比（我们限制为 2），不透明物体按从前到后的顺序绘制或使用深度预通道（depth pre-pass），并留意全屏通道的开销。
- **纹理上传与缺失的 mipmap。**没有 mipmap，远处的纹理会产生混叠并使纹理缓存抖动。应在加载时生成 mip（每一级一个计算或渲染通道），或者更好的做法是在资源管线中生成。
- **垃圾回收。**每帧分配数组（热点路径中的 `new Float32Array`、循环中的闭包）会引起 GC 停顿；应复用临时数组。（我们的 `tonemapUBO` 写入每帧会分配一个很小的数组，这是为了让代码简短而故意为之；把它修好作为练习。）

## 14. 下一步

有了这个骨架，自然的扩展就是本系列其余文章的主题：

- **分簇光照（clustered lighting）**，用于数百个光源：把视锥划分为三维簇网格，在计算通道中把光源分配到各个簇，并在 PBR 着色器中只遍历该簇的光源（算法见第 02 篇）。
- **基于图像的光照（image-based lighting）**：用预过滤的环境贴图和 BRDF 查找表取代常数环境项（见[图形学第 04 篇]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})）。
- **资源管线（asset pipeline）**：一个离线的「烘焙器」（Node 或 Python），把 glTF 转换成 GPU 就绪的二进制格式，包含生成的 mipmap、压缩纹理（KTX2/Basis Universal）、量化的顶点和 meshlet，外加内容哈希，使得只有改动过的资源才会被重新构建。
- **编辑器**：实体检查器、操作手柄（gizmo）、基于可序列化组件的撤销/重做，以及着色器和资源的热重载。
- **GPU 驱动渲染（GPU-driven rendering）**：在计算着色器中做视锥与遮挡剔除，并使用 `drawIndexedIndirect`，这条路径直通[下一篇]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})中的 Nanite。

## 代表性论文

| 论文 | 发表 | 年份 | 链接 | 意义 |
| --- | --- | --- | --- | --- |
| Williams, *Casting Curved Shadows on Curved Surfaces* | SIGGRAPH | 1978 | [DOI](https://doi.org/10.1145/965139.807402) | 最初的阴影贴图算法（第 7 节） |
| Reeves, Salesin & Cook, *Rendering Antialiased Shadows with Depth Maps* | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37402.37435) | 百分比渐近过滤（percentage-closer filtering），即我们着色器中的 PCF |
| Cook & Torrance, *A Reflectance Model for Computer Graphics* | ACM TOG | 1982 | [DOI](https://doi.org/10.1145/357290.357293) | 每个 PBR 着色器背后的微表面镜面反射模型 |
| Walter, Marschner, Li & Torrance, *Microfacet Models for Refraction through Rough Surfaces* | EGSR | 2007 | [DOI](https://doi.org/10.2312/EGWR/EGSR07/195-206) | `D_GGX` 中使用的 GGX 分布 |
| Karis, *Real Shading in Unreal Engine 4* | SIGGRAPH course | 2013 | [PDF](https://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf) | 被 glTF 和大多数引擎采用的金属-粗糙度工作流 |
| Donnelly & Lauritzen, *Variance Shadow Maps* | I3D | 2006 | [DOI](https://doi.org/10.1145/1111411.1111440) | 可滤波的阴影贴图，PCF 的经典替代方案 |
| Zhang, Sun, Xu & Lun, *Parallel-Split Shadow Maps for Large-scale Virtual Environments* | VRCIA | 2006 | [DOI](https://doi.org/10.1145/1128923.1128975) | 级联阴影贴图背后的思想 |
| Lauritzen, Salvi & Lefohn, *Sample Distribution Shadow Maps* | I3D | 2011 | [DOI](https://doi.org/10.1145/1944745.1944761) | 让级联适配屏幕上实际的深度分布 |
| O'Donnell, *FrameGraph: Extensible Rendering Architecture in Frostbite* | GDC talk | 2017 | [GDC Vault](https://www.gdcvault.com/play/1024612/FrameGraph-Extensible-Rendering-Architecture-in) | 我们的通道列表所模仿的渲染图设计 |

## 学习资源

- [WebGPU 规范](https://www.w3.org/TR/webgpu/)和 [WGSL 规范](https://www.w3.org/TR/WGSL/)；[WebGPU Fundamentals](https://webgpufundamentals.org/) 提供循序渐进且完整的课程；Brandon Jones 的 [WebGPU best practices](https://toji.dev/webgpu-best-practices/)。
- [glTF 2.0 规范](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)和 [glTF 示例资源](https://github.com/KhronosGroup/glTF-Sample-Assets)（DamagedHelmet、Sponza，以及覆盖每种特性的一致性模型）。
- [Learn Wgpu](https://sotrh.github.io/learn-wgpu/) 讲述 Rust 中的同一段旅程，[Vulkan Tutorial](https://vulkan-tutorial.com/) 对应 C++；[LearnOpenGL](https://learnopengl.com/Advanced-Lighting/Shadows/Shadow-Mapping) 配图讲解了阴影贴图与痤疮。
- Romain Guy 与 Mathias Agopian，[Physically Based Rendering in Filament](https://google.github.io/filament/Filament.md.html)：从推导到代码最清晰的文档，对应第 6 节的着色器。
- Glenn Fiedler，[Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/)，关于第 2 节循环的经典文章；Robert Nystrom，[Game Programming Patterns](https://gameprogrammingpatterns.com/)（游戏循环、更新方法、脏标记和组件各章）。
- Jason Gregory，*Game Engine Architecture*（第 3 版，CRC Press，2018），以生产规模讲述本文的每一层。
- 工具：[RenderDoc](https://renderdoc.org/)、[WebGPU Inspector](https://github.com/brendan-duncan/webgpu_inspector)、Chrome 的 `chrome://gpu`。

## 练习

1. **反向 Z。**修改 `perspective`，使近平面映射到 1、远平面映射到 0，把深度缓冲区改为 `depth32float`，清除值改为 0，比较函数改为 `'greater'`。重做算例：原点现在得到的 NDC 深度是多少，为什么精度更好？
   <details markdown="1"><summary>提示</summary>
   交换 $n$ 和 $f$ 的角色：$P_{22} = n/(f-n)$，$P_{23} = nf/(f-n)$。此时原点落在 $n(f-3)/\big(3(f-n)\big) \approx 0.032$。浮点数在 0 附近精度最高，而现在*远处*的几何体恰好落在那里，从而抵消了透视深度的双曲线分布。
   </details>
2. **存储缓冲区实例化。**用一个由 `@builtin(instance_index)` 索引的 `var<storage, read>` 矩阵数组取代 256 字节的动态偏移槽位，并用一次 `drawIndexed(count, instances)` 绘制某个网格的所有副本。每个对象节省多少字节？
   <details markdown="1"><summary>提示</summary>
   每个对象 192 字节（256 减 64）。按网格对绘制列表排序，按网格连续写入矩阵，并把第一个槽位作为 `firstInstance` 传入。
   </details>
3. **法线贴图。**扩展加载器以读取 `TANGENT` 和 `normalTexture`，并在着色器中用 TBN 矩阵扰动 `N`。当文件没有切线时应该怎么办？
4. **级联阴影。**按公式 $z_i = \lambda\, n (f/n)^{i/3} + (1-\lambda)(n + (f-n)\, i/3)$ 选取距离，把相机视锥分成 3 个级联，并为每个级联拟合一个正交光源矩阵。
5. **测试加载器。**在内存中构建一个 3 顶点的 glTF（JSON 加上编码为 `data:` URI 的 36 字节缓冲区），用 `readAccessor` 解析它，并断言位置；然后添加一个 `byteStride = 32` 的交错版本，并检验第 4 节的算例。
   <details markdown="1"><summary>提示</summary>
   `readAccessor` 只需要 `json` 和一个 `ArrayBuffer` 数组，所以你可以在 Node 中不用 `fetch` 直接调用它。
   </details>

[下一篇]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})将打开生产级引擎（Unreal Engine 5、Unity 6、Godot 4、Bevy），并展示它们如何在大规模下解决我们在此遇到的每一个问题：几何细节、全局光照、阴影、调度和工具链。
