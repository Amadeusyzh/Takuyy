---
layout: post
title: "Build a mini engine: WebGPU, glTF, PBR, shadows and an ECS in the browser"
date: 2026-10-27 13:03:00+0900
description: "A hands-on tutorial: a small but real engine in JavaScript and WGSL with a fixed-timestep loop, resource manager, glTF 2.0 loader, orbit camera, PBR shader, shadow map, minimal ECS, pass list, GPU timestamps and debug UI, with notes on Vulkan/C++ and Rust/wgpu."
categories: graphics-engine
tags: [webgpu, wgsl, gltf, pbr, shadow-mapping, ecs, render-graph, engine]
series: graphics-engine
series_order: 3
toc:
  sidebar: left
related_posts: false
---

## Why this matters

The [first post]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}) took an engine apart into layers, a game loop, data-oriented storage and an entity component system (ECS). The [second post]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}) explained explicit GPU APIs, synchronization and render graphs. This post puts those ideas back together. We write a **small but real engine** in about 900 lines of JavaScript and WGSL (the WebGPU Shading Language). It loads a glTF 2.0 model, shades it with a physically based material, casts a shadow, runs a fixed-timestep simulation, keeps its scene in an ECS, schedules its passes from a declared pass list, and measures itself with GPU timestamp queries.

The point is not to compete with the engines in the [next post]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}). The point is that after writing each piece once, you can read their source code and recognise every layer.

## Prerequisites

- The engine layers, game loop and ECS of [post 01]({{ '/blog/2026/graphics-engine-01-anatomy-of-an-engine/' | relative_url }}); devices, queues, bind groups and pipelines from [post 02]({{ '/blog/2026/graphics-engine-02-gpu-apis-and-render-graphs/' | relative_url }}).
- Homogeneous coordinates and the camera transforms of [graphics post 01]({{ '/blog/2026/graphics-01-roadmap-and-math/' | relative_url }}) and the rasterization pipeline of [graphics post 02]({{ '/blog/2026/graphics-02-rasterization/' | relative_url }}).
- The microfacet BRDF of [graphics post 04]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}) (we implement it, not derive it again) and the shadow-map idea from [graphics post 03]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }}).
- Modern JavaScript (ES modules, classes, `async`/`await`) and a browser with WebGPU. As of November 2026: Chrome and Edge since version 113 on Windows, macOS and ChromeOS ([Chrome blog](https://developer.chrome.com/blog/webgpu-release)) and since 121 on recent Android devices; Safari 26 on macOS, iOS, iPadOS and visionOS ([WebKit blog](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)); Firefox 141 on Windows ([release notes](https://www.firefox.com/en-US/firefox/141.0/releasenotes/)) and 147 on Apple-silicon Macs.

## 1. What we build, and the module boundaries

Our engine, called *mini*, has exactly the layers of post 01, with a strict rule: **a module may import only from layers below it**. The GPU layer knows nothing about entities; the ECS knows nothing about the GPU; the renderer reads the ECS but never changes it.

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

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-modules.svg" caption="Module dependency graph of the mini engine, computed from the `import` lines of the code in this post. Every arrow points downwards: `core`, `gpu` and `ecs` import nothing from the engine, and only `main.js` sees everything. If you ever need an upward arrow (for example the renderer changing a component), that is a design smell." %}

As the figure shows, the graph is a DAG with three levels. This is what makes the engine testable: `core/math.js`, `ecs/world.js`, `assets/gltf.js` (given an `ArrayBuffer`) and `render/passes.js` run in plain Node.js without a GPU, and Section 12 tests exactly those.

**Mapping to other stacks.** In C++ with Vulkan the same split usually becomes static libraries (`core`, `rhi`, `scene`, `renderer`) with the dependency rule enforced by CMake targets. In Rust with [wgpu](https://github.com/gfx-rs/wgpu) it becomes crates in a Cargo workspace, and the compiler enforces it: a crate cannot use a crate it does not depend on.

## 2. The main loop with a fixed timestep

Post 01 explained why simulation should advance in **fixed steps** $\Delta t$ while rendering runs at whatever rate the display allows. Let $T_k$ be the measured duration of frame $k$, and $A$ an *accumulator* of time that has not been simulated yet. Each frame does

$$
A \leftarrow A + \min(T_k, T_{\max}), \qquad
\text{while } A \ge \Delta t:\ \text{update}(\Delta t),\ A \leftarrow A - \Delta t, \qquad
\alpha = A / \Delta t \in [0, 1).
$$

The renderer then draws the state *between* the last two simulated states, $s = (1-\alpha)\, s_{\text{prev}} + \alpha\, s_{\text{curr}}$. The clamp $T_{\max}$ (0.25 s here) prevents the "spiral of death": after a long hitch, the loop would otherwise try to catch up with dozens of updates, which makes the next frame even longer.

**Worked example.** With $\Delta t = 1/60\ \text{s} \approx 16.67$ ms and frames of 10, 10 and 25 ms: after frame 1, $A = 10$, no update, $\alpha = 0.6$. After frame 2, $A = 20 \ge 16.67$, one update, $A = 3.33$, $\alpha = 0.2$. After frame 3, $A = 28.33$, one update, $A = 11.67$, $\alpha = 0.7$.

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

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-fixed-timestep.svg" caption="The loop above, run on a simulated 60-120 Hz display with jitter and one 80 ms hitch, with $\Delta t = 1/50$ s. Top: frame boundaries (gray ticks) and simulation steps (purple dots); most frames run 0 or 1 steps, the hitch frame runs 4. Bottom: the accumulator $A$ after the updates (always below $\Delta t$, dashed) and $\alpha = A/\Delta t$, the interpolation weight the renderer receives." %}

The figure is a real run of this function on simulated frame times. Notice that the number of steps per frame is irregular even though the simulation itself advances perfectly evenly: this is exactly why rendering must interpolate with $\alpha$.

`requestAnimationFrame` passes a timestamp on the same clock as `performance.now()`, so the two can be mixed. In C++ you would use `std::chrono::steady_clock` and present with vsync; in Rust/winit you drive the same function from the `RedrawRequested` event.

## 3. Device, canvas and resources

### 3.1 The device and the "swap chain"

WebGPU hides the swap chain behind a **canvas context**: you configure it once with a device and a texture format, and every frame `context.getCurrentTexture()` hands you the image to render into. Presenting happens automatically when the task that rendered it returns to the browser.

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

**Vulkan/C++.** This one function becomes several hundred lines: create a `VkInstance`, pick a `VkPhysicalDevice`, create a `VkDevice` and queues, create a `VkSurfaceKHR` and a `VkSwapchainKHR`, and each frame acquire an image (with a semaphore), render, and present (waiting on another semaphore), with fences so the CPU never runs more than two or three frames ahead. **Rust/wgpu** keeps WebGPU's shape: `Instance`, `Adapter`, `Device` and `Queue`, `Surface::configure`, then `surface.get_current_texture()` and `frame.present()` each frame.

### 3.2 A resource manager

Every engine has a layer that owns GPU objects so the rest of the code does not create them ad hoc. Ours does four things:

1. **Buffers** created already filled (`mappedAtCreation`), with the size rounded up to a multiple of 4 bytes as WebGPU requires.
2. **Textures** from decoded images, with the color space chosen by the caller (`rgba8unorm-srgb` for colors, `rgba8unorm` for data such as roughness).
3. **Samplers, shader modules and pipelines cached by a key**. Creating a pipeline compiles shaders and can take milliseconds; it must happen once per *variant*, not once per object.
4. **Statistics**, so the debug UI can show how many objects and bytes exist.

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

The pipeline key is a string that encodes everything that changes the compiled pipeline: for example `pbr|rgba16float|cull-back`. A real engine builds the key from the material's shader variant, vertex layout and render-target formats, and creates pipelines with `createRenderPipelineAsync` during loading so the first frame does not stall. In Vulkan the analogous objects are a `VkPipelineCache` (to persist compiled pipelines to disk) and a memory allocator such as VMA; in wgpu, `Device::create_render_pipeline` and your own `HashMap` of pipelines.

**Uniform alignment.** We will store every object's model matrix in one large uniform buffer and select it with a *dynamic offset*. WebGPU requires those offsets to be multiples of `minUniformBufferOffsetAlignment`, which is 256 bytes by default. A model matrix is 64 bytes, so each object occupies a 256-byte slot: object $i$ lives at byte $256\,i$, and 1024 objects need 256 KiB of which 75 % is padding. That trade (wasted bytes for one buffer write and no per-object bind groups) is almost always worth it; storage buffers indexed by instance ID remove the padding, which is one of the exercises.

## 4. Loading glTF 2.0

[glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) is the "JPEG of 3D": a JSON scene description plus binary buffers, either as separate files (`.gltf` + `.bin` + images) or packed in one binary `.glb`. It was designed to be loaded straight into GPU buffers, which is exactly what makes its structure a lesson in engine data design.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-gltf-structure.svg" caption="The reference chain of a glTF 2.0 file, drawn for a tiny example with one mesh. Every arrow is an integer index into a top-level array. Geometry goes node → mesh → primitive → accessor → bufferView → buffer; appearance goes primitive → material → texture → image and sampler. Our loader follows exactly these arrows." %}

Read the figure from the top. A **scene** lists root **nodes**. A node has a local transform (either a 4x4 `matrix`, or `translation`, `rotation` quaternion and `scale`, composed as $T R S$), optional `children` and an optional **mesh**. A mesh is a list of **primitives**; each primitive is one draw call: a set of vertex attributes (`POSITION`, `NORMAL`, `TEXCOORD_0`, ...), optional `indices` and a **material**. Every attribute is an **accessor**: a typed view (`componentType`, `type`, `count`) into a **bufferView**, which is a byte range (`byteOffset`, `byteLength`, optional `byteStride`) of a **buffer**.

The only arithmetic is the address of element $i$, component $c$ of an accessor:

$$
\text{addr}(i, c) = \text{bufferView.byteOffset} + \text{accessor.byteOffset} + i \cdot \text{stride} + c \cdot \text{sizeof(component)},
$$

where $\text{stride}$ is `byteStride` if present and otherwise the packed element size (12 bytes for a `VEC3` of `FLOAT`).

**Worked example.** An interleaved vertex buffer stores position (12 bytes), normal (12) and UV (8) per vertex, so `byteStride = 32`. The `NORMAL` accessor has `byteOffset = 12`. The normal of vertex 2 starts at $0 + 12 + 2 \cdot 32 = 76$, and its $z$ component is at $76 + 2 \cdot 4 = 84$.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-accessor-layout.svg" caption="Byte layout of that interleaved bufferView: three accessors (POSITION at offset 0, NORMAL at 12, TEXCOORD_0 at 24) share one stride of 32 bytes. The highlighted cell is the worked example, byte 84 = the z of the normal of vertex 2. The index accessor lives in a second, tightly packed bufferView." %}

The loader below handles `.gltf` and `.glb`, external and embedded buffers and images, normalized integer attributes, and computes normals if a file has none. It deliberately skips sparse accessors, skins, morph targets, animations, cameras and extensions (good exercises). Note what the GLB header looks like: the magic number `0x46546C67` (the ASCII bytes `glTF`), the version 2, then chunks tagged `JSON` and `BIN`.

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

Two details matter for correct images. Color textures (`baseColorTexture`, `emissiveTexture`) are sRGB-encoded and must be uploaded as `rgba8unorm-srgb` so that sampling returns *linear* values; `metallicRoughnessTexture` holds data (roughness in the green channel, metallic in blue) and must stay `rgba8unorm`. And glTF is right-handed with $+Y$ up and units in meters, the same convention as our math library, so no axis flips are needed.

Our loader returns plain arrays, not GPU objects. This split (parse on the CPU, upload in the renderer) is what lets the same parser run in a unit test, in a worker thread, or in an offline asset cooker (Section 14).

## 5. A math library and a camera with input

### 5.1 Conventions

We store matrices as 16 floats in **column-major** order (element $(r, c)$ at index $4c + r$), as WGSL, glTF and OpenGL do. View space is right-handed and looks down $-z$. The one thing that differs from OpenGL is the projection: WebGPU's clip-space depth ranges over $[0, 1]$, not $[-1, 1]$. For a vertical field of view $\theta$, aspect ratio $a$ and near/far planes $n, f$, with $s = 1/\tan(\theta/2)$:

$$
P = \begin{pmatrix} s/a & 0 & 0 & 0 \\ 0 & s & 0 & 0 \\ 0 & 0 & \frac{f}{n-f} & \frac{nf}{n-f} \\ 0 & 0 & -1 & 0 \end{pmatrix}.
$$

Check: a point at $z_v = -n$ gets $z_c = \frac{-fn + nf}{n-f} = 0$, and at $z_v = -f$ it gets $z_c = \frac{-f^2 + nf}{n-f} = f = w_c$, so depth $z_c/w_c$ runs from 0 to 1.

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

**Worked example (you can paste this into Node).** A camera at $(0, 0, 3)$ looking at the origin with $\theta = 60°$, $a = 1$, $n = 0.1$, $f = 100$: the origin should land in the middle of the screen at depth just below 1 (perspective depth is very non-linear), and the point $(1, 0, 0)$ at $x_{\text{ndc}} = s/3 = 1.732/3 \approx 0.577$.

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

The depth 0.9676 for a point only 3 m away (with a 100 m far plane) is the well-known precision problem of perspective depth: most of the $[0,1]$ range is spent near the camera. Production engines use **reversed-Z** (map near to 1 and far to 0 with a floating-point depth buffer), one of the exercises.

### 5.2 Input and an orbit camera

An **orbit camera** keeps a target point $\mathbf{t}$, a distance $r$, a yaw $\psi$ and a pitch $\phi$, and places the eye on a sphere:

$$
\mathbf{e} = \mathbf{t} + r\,(\cos\phi \sin\psi,\ \sin\phi,\ \cos\phi \cos\psi).
$$

Dragging changes $\psi$ and $\phi$ (pitch is clamped below $\pm 90°$ so that the `up` vector of `lookAt` never becomes parallel to the view direction), the wheel scales $r$ geometrically (each notch by 10 %, so zooming feels the same at every distance), and WASD moves the target in the camera's horizontal plane.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-orbit-camera.svg" caption="The orbit camera with the default parameters ($r = 4$, $\psi = 0.6$, $\phi = 0.35$): the eye $\mathbf{e}$ on the sphere around the target, and the camera basis computed by `lookAt` (red $x$ to the right, green $y$ up, blue $z$ pointing backwards, away from the target). The frustum is drawn with the 60° field of view, cut at 1.5 units for legibility." %}

As the figure shows, the camera's $z$ axis points *away* from what it looks at, which is why the projection matrix has $-1$ in its last row.

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

The camera is updated once per *rendered* frame, not in the fixed simulation step: input should feel immediate, and the camera does not take part in physics. With Vulkan you would read input through GLFW or SDL; in Rust through `winit` events. The math is identical.

## 6. A PBR material shader in WGSL

The theory is in [graphics post 04]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }}); here we only translate it. For one directional light with radiance-scaled color $E_L$ arriving from direction $\mathbf{l}$, the outgoing radiance toward the viewer $\mathbf{v}$ is

$$
L_o = \Big( \underbrace{(1 - F)(1 - m)\,\frac{\mathbf{c}}{\pi}}_{\text{diffuse}} + \underbrace{D(\mathbf{h})\, V(\mathbf{v}, \mathbf{l})\, F(\mathbf{v}, \mathbf{h})}_{\text{specular}} \Big)\, E_L\, (\mathbf{n} \cdot \mathbf{l})\, s,
$$

where $\mathbf{c}$ is the base color, $m$ the metalness, $\mathbf{h}$ the half vector, $D$ the GGX distribution with $\alpha = \text{roughness}^2$, $V$ the height-correlated Smith visibility term (which already contains the $1/(4\, \mathbf{n}\cdot\mathbf{v}\, \mathbf{n}\cdot\mathbf{l})$ denominator), $F$ Schlick's Fresnel with $F_0 = \text{mix}(0.04, \mathbf{c}, m)$, and $s \in [0, 1]$ the shadow factor of the next section. This is the glTF metallic-roughness model, the same one used by Filament and Unreal Engine 4.

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

Three engine-level points hide in this shader:

1. **Bind groups by update frequency.** Group 0 changes once per frame, group 1 once per material, group 2 once per object. The renderer sorts draws by material so that group 1 changes as rarely as possible. Vulkan has the same model (descriptor sets); D3D12 uses root signatures and descriptor tables for the same purpose.
2. **The WGSL struct layout is a contract with JavaScript.** `Frame` is 176 bytes: two matrices (128), then three `vec3f` + `f32` pairs of 16 bytes each. The renderer fills a `Float32Array(44)` at exactly those offsets. Getting this wrong is the most common WebGPU bug; reflection tools or a single shared layout description help.
3. **The shader writes linear HDR radiance.** Tone mapping and the sRGB encode happen in a later pass, so lighting stays physically meaningful until the last moment.

## 7. A shadow-map pass

[Graphics post 03]({{ '/blog/2026/graphics-03-shading-and-textures/' | relative_url }}) introduced the idea of a shadow map: render the scene's depth *from the light*, then, when shading a point $\mathbf{p}$, compare its depth from the light with the stored one. Here is the engine version for a directional light.

**Light matrices.** We fit an orthographic box around a bounding sphere of the scene (center $\mathbf{c}$, radius $R$). The light "camera" sits at $\mathbf{c} - 2R\,\mathbf{d}$, looking along the light direction $\mathbf{d}$, and its box spans $[-R, R]^2$ with depth range $[R, 3R]$, so the sphere lies inside. Then for any world point

$$
\mathbf{q} = P_L V_L \begin{pmatrix}\mathbf{p}\\ 1\end{pmatrix}, \qquad (u, v) = \Big(\tfrac{q_x + 1}{2},\ \tfrac{1 - q_y}{2}\Big), \qquad \text{lit} \iff q_z - b < \text{shadowMap}(u, v),
$$

where $b$ is a small depth bias.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-shadow-geometry.svg" caption="The shadow pass, computed. Left: the light's orthographic frustum (yellow box) around a toy scene (ground, sphere, box); the light direction is the arrow. The point $\mathbf{p}$ on the ground (black) projects along the light direction to texel $(u, v)$; the first surface on that ray is the sphere, so $\mathbf{p}$ is in shadow. Right: the depth map actually rendered from the light (darker = closer to the light), with $(u, v)$ marked; the stored depth is smaller than $\mathbf{p}$'s own depth." %}

**Shadow acne and bias.** A shadow-map texel covers a finite patch of the receiver. On a surface tilted by angle $\theta$ to the light, the depth inside one texel of world size $w$ varies by up to $\tfrac{w}{2}\tan\theta$ around the stored center value, so without bias half of the surface shadows itself in a striped pattern (**acne**). Too much bias detaches shadows from their casters (**peter-panning**). The minimal bias grows with the slope, which is why GPUs offer a *slope-scaled* depth bias in the rasterizer.

**Worked example.** A scene of radius $R = 5$ m with a 2048² map has texels of $w = 2R/2048 \approx 4.9$ mm. On a 45° slope the depth error is up to $w/2 \approx 2.4$ mm; in normalized depth (range $2R = 10$ m) that is $2.4 \times 10^{-4}$. A constant `shadowBias` of $5 \times 10^{-4}$ alone covers slopes up to $\arctan(5/2.44) \approx 64°$; for steeper surfaces the rasterizer's slope-scaled bias (`depthBiasSlopeScale` in the shadow pipeline) does the work.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-shadow-bias.svg" caption="Shadow acne, computed in 2D. Left: a receiver tilted by 30° under a light from above; the shadow map stores one depth per texel (the stair steps). Without bias, the receiver points shown in red lie behind their own texel's stored depth and are wrongly shadowed, in a regular stripe pattern. Right: the bias needed to remove acne, $\tfrac{w}{2}\tan\theta$, versus the slope angle, against a constant bias (flat line) and a constant-plus-slope-scaled bias (curve)." %}

The widget below runs exactly the shader's test, `depth - bias <= stored`, on a 2D scene and compares it with exact visibility. Start with zero bias to see the acne stripes, raise the bias until they vanish, then keep raising it and watch light leak under the box (peter-panning). Turn on the slope-scaled term and tilt the light: it removes acne on the slope with a much smaller constant bias.

{% include widget.liquid name="graphics-engine-shadow-bias" height="470" caption="Shadow-map acne and bias in 2D. The orange stairs are the depths stored in the shadow map, one per texel; surface points are green (correctly lit), gray (correctly shadowed), red (acne: wrongly shadowed) or blue (leak: wrongly lit). Change the light angle (or drag in the scene), the number of texels and the bias, and toggle the slope-scaled bias $\tfrac{w}{2}\tan\theta$." %}

The shadow vertex shader is tiny, and the pass has no fragment shader at all: only depth is written.

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

And this is the system that recomputes the light matrices whenever the light or the scene bounds change:

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

For large outdoor scenes a single map is far too coarse; **cascaded shadow maps** split the view frustum by distance and give each slice its own map, and **virtual shadow maps** (the [next post]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }})) allocate pages of a huge virtual map only where the screen needs them.

## 8. A minimal ECS-driven scene

Post 01 compared archetype and sparse-set ECS designs. Ours is the simplest one that still has the right *shape*: entities are integers, each component type has its own store, and **systems** are plain functions that query entities having a set of components.

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

A `Map` per component is not cache-friendly (post 01 explains why archetypes store components in dense arrays), but the *interface* (create, add, query, systems) is the same one Bevy, Flecs or EnTT expose, so you can swap the storage later without touching the systems.

### 8.1 Transforms, hierarchy and dirty flags

The transform hierarchy is where an ECS meets a **scene graph**. Each `transform` component stores a local translation, rotation and scale, its parent, its children, a local matrix, a **world matrix** and a **dirty flag**. The world matrix of node $k$ is the product along its path from the root:

$$
W_k = W_{\text{parent}(k)}\, L_k = L_{\text{root}} \cdots L_{\text{parent}(k)}\, L_k .
$$

Changing $L_k$ invalidates $W_k$ and the world matrix of every descendant, and nothing else. So `markDirty` flags the subtree, and the transform system recomputes only flagged nodes, parents before children.

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

**Worked example.** In a chain root → arm → hand, rotating the root flags all three nodes and the system performs three matrix products; rotating only the hand flags one node and costs one product. In a scene of 10,000 static props and one animated character, dirty flags turn 10,000 products per frame into a few dozen. Try it in the widget: drag or rotate a parent and watch which nodes light up.

{% include widget.liquid name="graphics-engine-scene-graph" height="460" caption="A scene graph with local and world transforms. Drag a node to move it (in its parent's frame) or use the rotate buttons; children follow. Switch the view between world and local transforms, and watch the dirty-flag propagation: the nodes recomputed in the last update flash orange and the counter shows how many nodes were recomputed. Untick the dirty flags to compare with recomputing every node on every change." %}

### 8.2 Spawning a glTF scene and the systems of one frame

The composition root turns the loader's plain data into GPU resources and entities, registers the systems and starts the loop. Note how the fixed-step `spinSystem` stores the previous and current angle, and the render step interpolates with $\alpha$ before the transform system runs.

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

The order of systems in `render` is a small **schedule**: input → camera → interpolation → transforms → light → render. Engines make this explicit (Bevy's schedules and system sets, Unity's system groups, Unreal's tick groups) because a system that reads transforms before the transform system has run sees last frame's data, a classic one-frame-lag bug.

## 9. A tiny pass list (a frame graph in 60 lines)

Post 02 described **render graphs**: each pass declares which resources it reads and writes; the graph orders the passes, removes passes whose results nobody uses, and derives each resource's lifetime, so that transient memory can be aliased and barriers placed automatically. WebGPU inserts the barriers for us, but the other three benefits fit in a few lines.

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

Our renderer declares four passes, one of them a debug visualization that nothing consumes:

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

The lifetime of `depth` ends inside the `opaque` pass, so the renderer may set its `depthStoreOp` to `'discard'`: on tile-based mobile GPUs this saves writing the whole depth buffer to memory. Lifetimes also tell which transient textures can share memory. The figures show the same compiler on a larger, more realistic frame.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-frame-graph.svg" caption="Data flow of a fuller frame, computed by the Python port of `PassList.compile` in the figure script: passes (rounded boxes) in execution order from left to right, resources (gray labels) on the edges. The culled pass `ssaoDebug` (dashed) writes a texture nobody reads, so it never runs." %}

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-resource-lifetime.svg" caption="Lifetimes of the transient resources of the same frame (bars from first to last use, in pass indices) and the memory slots a greedy interval allocator assigns. Resources whose bars do not overlap share a slot (same color), so this frame needs 3 slots instead of 7 (assuming compatible sizes and formats), the aliasing that render graphs automate." %}

Here is the renderer that owns the passes. It is the largest file, but every line is one of the concepts above.

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

The tone-mapping pass draws one triangle that covers the screen, reads the HDR texel under each pixel, applies exposure and the Reinhard curve $c/(1+c)$, and encodes to sRGB (the canvas format is not an `-srgb` format, so the shader does the encode with a $1/2.2$ power):

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

**Vulkan/C++.** The pass list is where Vulkan gets interesting: the graph must also emit `vkCmdPipelineBarrier2` calls (image layout transitions such as `DEPTH_ATTACHMENT_OPTIMAL` to `SHADER_READ_ONLY_OPTIMAL` for the shadow map) between passes, and with dynamic rendering each pass becomes a `vkCmdBeginRendering` block. **Rust/wgpu** behaves like WebGPU (barriers are automatic); crates such as `rend3` once built render graphs on top of it.

## 10. Debug UI and GPU timestamp queries

You cannot optimize what you cannot measure, and CPU timers say nothing about the GPU: `queue.submit` returns long before the GPU has finished. WebGPU's optional `timestamp-query` feature lets each pass write a GPU timestamp (in nanoseconds) at its beginning and end into a `GPUQuerySet`. We resolve the set into a buffer, copy it to a mappable buffer and read it back *asynchronously*, a frame or two later.

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

Using a small pool of read-back buffers matters: a buffer that is being mapped cannot be used by the next frame's copy, and waiting for it would stall the CPU on the GPU, the worst pitfall in Section 13. The specification allows browsers to reduce timestamp precision (against timing side channels), and Chrome quantizes them to 100 µs by default ([Chrome blog](https://developer.chrome.com/blog/new-in-webgpu-120)), so treat single values as approximate and average over many frames, as `readback` does.

The debug panel is deliberately just HTML: sliders bound to object properties and a text block for statistics. Dear ImGui plays this role in C++ engines, and `egui` in Rust ones.

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

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-frame-budget.svg" localized="true" caption="A CPU timing model of the render loop (assumed per-call costs, stated in the figure script; not a measurement). Left: CPU frame time versus number of objects for three submission strategies: one buffer write and one bind group per object (naive), one batched write with dynamic offsets (this engine), and instancing. The dashed lines are the 60 Hz and 120 Hz budgets. Right: where the time goes at 3,000 objects." %}

The figure is a model, not a measurement, but its message matches what profilers show in practice: per-object API calls dominate the CPU long before the GPU is busy. Our engine's single `writeBuffer` and dynamic offsets move the knee far to the right; instancing (one draw for many copies of a mesh) or GPU-driven rendering (post 02) move it further.

### 10.1 The engine running

The complete code of this post produces the frame below. We ran it unchanged in headless Chromium with WebGPU on SwiftShader, a CPU implementation of Vulkan, with one change in the *test harness*: on our build machine headless Chromium could not present to a `webgpu` canvas, so the harness replaced `canvas.getContext('webgpu')` with an object whose `getCurrentTexture()` returns an ordinary `rgba8unorm` texture of the canvas size, and read that texture back with `copyTextureToBuffer` (the golden-image technique of Section 12). The run reported no WebGPU validation error and no WGSL warning.

{% include blog_figure.liquid path="assets/img/blog/graphics-engine/03-engine-frame.png" caption="A frame rendered by the mini engine of this post, captured from the run described above. Left: the DamagedHelmet model on its turntable over the 6 m ground plane, with base color and metallic-roughness textures, the Cook-Torrance shader of Section 6, the 2048 × 2048 shadow map with 3 × 3 PCF of Section 7 and Reinhard tone mapping. Right: the debug panel of this section from the same run. The GPU times (shadow 11 ms, opaque 34 ms) come from a software rasterizer on the CPU and are far slower than on any real GPU; compare only their ratio. Model: Khronos glTF Sample Assets, CC BY 4.0 by ctxwing, based on a CC BY-NC 4.0 model by theblueturtle_." %}

That first run also found a bug, which is a useful lesson. DamagedHelmet sets `emissiveFactor` to $(1, 1, 1)$ together with an `emissiveTexture` in which more than 99 % of the texels are black (only a few small lights glow). The first version of our loader copied the factor but ignored the texture, so the shader added an emission of 1 to every pixel and the whole helmet glowed a flat, washed-out white. In glTF the emissive color is factor *times* texture, so a loader that skips the texture must also drop the factor; that is the one-line rule in `parseMaterial` in Section 4. A debug view that outputs only `material.emissive` would have shown the problem at once.

## 11. Debugging: RenderDoc and the browser tools

Graphics bugs are usually silent: a black screen, a missing object, a shadow in the wrong place. Build the habit of these tools early.

- **Labels everywhere.** Every `createBuffer`, `createTexture`, pipeline, pass and encoder above has a `label`. WebGPU error messages quote them ("[Buffer "objects"] ... "), and capture tools display them.
- **Error scopes.** Wrap suspicious code in `device.pushErrorScope('validation')` ... `await device.popErrorScope()` to get the error of exactly that code; the `uncapturederror` handler in `initGPU` catches everything else. Also listen to `device.lost`.
- **Shader compilation info.** `await module.getCompilationInfo()` returns WGSL errors and warnings with line numbers.
- **Browser GPU pages.** `chrome://gpu` shows which backend (D3D12, Metal, Vulkan) and which GPU Chrome's WebGPU implementation (Dawn) uses, and lists WebGPU-related flags.
- **WebGPU Inspector.** A browser extension by Brendan Duncan that records WebGPU calls, shows every live object, lets you inspect textures and buffers, and capture a frame.
- **RenderDoc.** The standard frame debugger for Vulkan, D3D11/12 and OpenGL. Chrome translates WebGPU (through its implementation, Dawn) into D3D12, Metal or Vulkan, and RenderDoc can capture that *translated* frame from the browser's GPU process. Dawn's [debugging notes](https://dawn.googlesource.com/dawn/+/HEAD/docs/dawn/debugging.md) describe the recipe for Windows with the D3D12 backend: start Chrome with the sandbox disabled and a GPU startup dialog, then inject RenderDoc into the "GPU" process. You will see Dawn's generated HLSL rather than your WGSL, and every `label` you set. It is the right tool when you need exact pipeline state, and the everyday tool for native Vulkan/D3D12 and wgpu applications (on macOS, Xcode's Metal debugger plays the same role).
- **Debug views.** The cheapest debugger is a shader switch: output normals, UVs, roughness, the shadow factor or the light-space depth as colors. Add a `debugView` uniform and a slider before you need it.

## 12. How to test an engine

Graphics code is notoriously under-tested because "it looks right" is hard to assert. Separate what can be tested exactly from what needs images:

1. **Pure logic, in Node.** `core/math.js` (matrix identities: $P V$ maps known points to known NDC, $\text{fromTRS}$ agrees with $T \cdot R \cdot S$), `ecs/world.js` (queries return exactly the right entities), `scene/transform.js` (dirty flags recompute the right count), `render/passes.js` (order, culling, lifetimes for a fixed list), and `assets/gltf.js` on small hand-built `ArrayBuffer`s. A minimal test needs nothing but `node:test`:

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

2. **Golden images.** Render fixed scenes with fixed cameras headlessly (Chrome with WebGPU via Playwright or Puppeteer, or native Dawn or wgpu in CI) and compare with stored reference images using a tolerance metric (per-pixel error and the fraction of pixels above a threshold), because different GPUs produce slightly different results.
3. **Validation as a test.** Run every test with validation errors turned into failures (WebGPU error scopes; the Vulkan validation layers natively).
4. **Performance regression tests.** Record GPU timestamps and CPU times for a fixed camera path and fail the build if a pass gets, say, 10 % slower.

## 13. Performance pitfalls

The usual suspects, roughly in the order you will meet them:

- **Creating objects per frame.** Buffers, bind groups, pipelines and textures belong in the resource manager; per frame you only *write* to buffers. Pipeline creation in particular can take milliseconds and causes visible hitches (precompile at load time, use `createRenderPipelineAsync`).
- **One `writeBuffer` per object.** Each call crosses into the browser's GPU process; batch everything into one large write (Section 9) or use a staging ring buffer.
- **CPU-GPU synchronization.** Waiting for `mapAsync` in the same frame, reading back query results synchronously, or `onSubmittedWorkDone` in the frame loop serializes CPU and GPU. Always read back a frame or more later.
- **Unsorted draws.** Changing pipelines and bind groups between every draw; sort by pipeline, then material.
- **Overdraw and fill rate.** High DPI canvases have 4-9 times the pixels of the CSS size. Cap the device pixel ratio (we cap at 2), draw opaque objects front-to-back or use a depth pre-pass, and watch the cost of full-screen passes.
- **Texture uploads and missing mipmaps.** Without mipmaps, distant textures alias and thrash the texture cache. Generate mips at load time (a compute or render pass per level) or, better, in the asset pipeline.
- **Garbage collection.** Allocating arrays every frame (`new Float32Array` in hot paths, closures in loops) causes GC pauses; reuse scratch arrays. (Our `tonemapUBO` write allocates a tiny array per frame on purpose to keep the code short; fix it as an exercise.)

## 14. Next steps

With this skeleton, the natural extensions are the topics of the rest of the series:

- **Clustered lighting** for hundreds of lights: divide the view frustum into a 3D grid of clusters, assign lights to clusters in a compute pass, and loop over only the cluster's lights in the PBR shader (post 02 explains the algorithm).
- **Image-based lighting**: replace the constant ambient term with a prefiltered environment map and a BRDF lookup table ([graphics post 04]({{ '/blog/2026/graphics-04-physically-based-rendering/' | relative_url }})).
- **An asset pipeline**: an offline "cooker" (Node or Python) that converts glTF into a GPU-ready binary format with generated mipmaps, compressed textures (KTX2/Basis Universal), quantized vertices and meshlets, plus a content hash so only changed assets are rebuilt.
- **An editor**: entity inspector, gizmos, undo/redo built on serializable components, and hot reload of shaders and assets.
- **GPU-driven rendering**: frustum and occlusion culling in a compute shader and `drawIndexedIndirect`, the path that leads straight to Nanite in the [next post]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}).

## Representative papers

| Paper | Venue | Year | Link | Why it matters |
| --- | --- | --- | --- | --- |
| Williams, *Casting Curved Shadows on Curved Surfaces* | SIGGRAPH | 1978 | [DOI](https://doi.org/10.1145/965139.807402) | The original shadow-map algorithm (Section 7) |
| Reeves, Salesin & Cook, *Rendering Antialiased Shadows with Depth Maps* | SIGGRAPH | 1987 | [DOI](https://doi.org/10.1145/37402.37435) | Percentage-closer filtering, the PCF in our shader |
| Cook & Torrance, *A Reflectance Model for Computer Graphics* | ACM TOG | 1982 | [DOI](https://doi.org/10.1145/357290.357293) | The microfacet specular model behind every PBR shader |
| Walter, Marschner, Li & Torrance, *Microfacet Models for Refraction through Rough Surfaces* | EGSR | 2007 | [DOI](https://doi.org/10.2312/EGWR/EGSR07/195-206) | The GGX distribution used in `D_GGX` |
| Karis, *Real Shading in Unreal Engine 4* | SIGGRAPH course | 2013 | [PDF](https://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf) | The metallic-roughness workflow adopted by glTF and most engines |
| Donnelly & Lauritzen, *Variance Shadow Maps* | I3D | 2006 | [DOI](https://doi.org/10.1145/1111411.1111440) | Filterable shadow maps, a classic alternative to PCF |
| Zhang, Sun, Xu & Lun, *Parallel-Split Shadow Maps for Large-scale Virtual Environments* | VRCIA | 2006 | [DOI](https://doi.org/10.1145/1128923.1128975) | The idea behind cascaded shadow maps |
| Lauritzen, Salvi & Lefohn, *Sample Distribution Shadow Maps* | I3D | 2011 | [DOI](https://doi.org/10.1145/1944745.1944761) | Fitting cascades to the depth distribution actually on screen |
| O'Donnell, *FrameGraph: Extensible Rendering Architecture in Frostbite* | GDC talk | 2017 | [GDC Vault](https://www.gdcvault.com/play/1024612/FrameGraph-Extensible-Rendering-Architecture-in) | The render-graph design our pass list imitates |

## Learning resources

- The [WebGPU specification](https://www.w3.org/TR/webgpu/) and the [WGSL specification](https://www.w3.org/TR/WGSL/); [WebGPU Fundamentals](https://webgpufundamentals.org/) for gentle, complete lessons; Brandon Jones' [WebGPU best practices](https://toji.dev/webgpu-best-practices/).
- The [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) and the [glTF sample assets](https://github.com/KhronosGroup/glTF-Sample-Assets) (DamagedHelmet, Sponza, and conformance models for every feature).
- [Learn Wgpu](https://sotrh.github.io/learn-wgpu/) for the same journey in Rust, and [Vulkan Tutorial](https://vulkan-tutorial.com/) for C++; [LearnOpenGL](https://learnopengl.com/Advanced-Lighting/Shadows/Shadow-Mapping) explains shadow mapping and acne with pictures.
- Romain Guy and Mathias Agopian, [Physically Based Rendering in Filament](https://google.github.io/filament/Filament.md.html): the clearest derivation-to-code document for the shader in Section 6.
- Glenn Fiedler, [Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/), the classic article on the loop of Section 2; Robert Nystrom, [Game Programming Patterns](https://gameprogrammingpatterns.com/) (game loop, update method, dirty flag, component chapters).
- Jason Gregory, *Game Engine Architecture* (3rd ed., CRC Press, 2018), for every layer of this post at production scale.
- Tools: [RenderDoc](https://renderdoc.org/), [WebGPU Inspector](https://github.com/brendan-duncan/webgpu_inspector), Chrome's `chrome://gpu`.

## Exercises

1. **Reversed-Z.** Change `perspective` so that near maps to 1 and far to 0, switch the depth buffer to `depth32float`, the clear value to 0 and the compare function to `'greater'`. Redo the worked example: what NDC depth does the origin get now, and why is precision better?
   <details markdown="1"><summary>Hint</summary>
   Swap the roles of $n$ and $f$: $P_{22} = n/(f-n)$, $P_{23} = nf/(f-n)$. The origin then lands at $n(f-3)/\big(3(f-n)\big) \approx 0.032$. Floating point has most precision near 0, which is now where the *far* geometry lands, cancelling the hyperbolic distribution of perspective depth.
   </details>
2. **Storage-buffer instancing.** Replace the 256-byte dynamic-offset slots with a `var<storage, read>` array of matrices indexed by `@builtin(instance_index)`, and draw all copies of a mesh with one `drawIndexed(count, instances)`. How many bytes per object do you save?
   <details markdown="1"><summary>Hint</summary>
   192 bytes per object (256 minus 64). Sort the draw list by mesh, write matrices contiguously per mesh, and pass the first slot as `firstInstance`.
   </details>
3. **Normal maps.** Extend the loader to read `TANGENT` and `normalTexture` and perturb `N` in the shader with the TBN matrix. What should happen when a file has no tangents?
4. **Cascaded shadows.** Split the camera frustum into 3 cascades at distances chosen by $z_i = \lambda\, z_i^{\log} + (1-\lambda)\, z_i^{\text{lin}}$, with $z_i^{\log} = n (f/n)^{i/3}$ and $z_i^{\text{lin}} = n + (f-n)\, i/3$, and fit one orthographic light matrix per cascade.
5. **Test the loader.** Build a 3-vertex glTF in memory (JSON plus a 36-byte buffer encoded as a `data:` URI), parse it with `readAccessor`, and assert the positions; then add an interleaved version with `byteStride = 32` and check the worked example of Section 4.
   <details markdown="1"><summary>Hint</summary>
   `readAccessor` only needs `json` and an array of `ArrayBuffer`s, so you can call it directly in Node without `fetch`.
   </details>

The [next post]({{ '/blog/2026/graphics-engine-04-inside-production-engines/' | relative_url }}) opens the production engines (Unreal Engine 5, Unity 6, Godot 4, Bevy) and shows how they solve, at scale, every problem we met here: geometry detail, global illumination, shadows, scheduling and tooling.
