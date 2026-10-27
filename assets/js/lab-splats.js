// Interactive lab: 3D Gaussian Splatting renderer (Kerbl et al., SIGGRAPH 2023).
// A procedurally generated "capture" of ~75k anisotropic Gaussians is rendered
// with the paper's pipeline: EWA projection of each 3D covariance to a 2D
// screen-space ellipse (Zwicker et al. 2002), a per-frame depth sort, and
// front-to-back-equivalent alpha compositing, plus a first-order
// view-dependent colour term. WebGL 2, no dependencies.
(function () {
  "use strict";

  var panel = document.getElementById("lab-gs");
  if (!panel) return;
  var root = document.getElementById("lab");
  var canvas = panel.querySelector("canvas");
  var TEX_W = 2048; // texels per row; 4 texels per Gaussian

  function fail() {
    panel.querySelector(".lab-stage").textContent = root.dataset.nogl2;
    panel.querySelector(".lab-controls").style.display = "none";
  }

  // ------------------------------------------------------- scene generation
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildScene() {
    var R = mulberry32(7);
    var out = []; // flat records: pos(3) opacity cov(6) color(3) sh(3)
    var L = norm3([0.5, 1.0, 0.35]);

    function norm3(v) {
      var l = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / l, v[1] / l, v[2] / l];
    }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    function gauss() { return Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(2 * Math.PI * R()); }
    function jitter(c, k) {
      var j = 1 + gauss() * k;
      return [c[0] * j, c[1] * j, c[2] * j];
    }
    function lit(c, n, ao) {
      var d = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
      var k = (0.42 + 0.7 * d) * (ao === undefined ? 1 : ao);
      return [c[0] * k, c[1] * k, c[2] * k];
    }
    // covariance = R S S^T R^T from three orthonormal axes and three scales
    function push(p, axes, sc, color, opacity, gloss, n) {
      var c = [0, 0, 0, 0, 0, 0];
      var idx = [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 2]];
      for (var q = 0; q < 6; q++) {
        var i = idx[q][0], j = idx[q][1], s = 0;
        for (var k = 0; k < 3; k++) s += axes[k][i] * axes[k][j] * sc[k] * sc[k];
        c[q] = s;
      }
      var sh = [0, 0, 0];
      if (gloss && n) {
        // highlight when looking along the mirrored light direction
        var dn = 2 * (L[0] * n[0] + L[1] * n[1] + L[2] * n[2]);
        var r = [L[0] - dn * n[0], L[1] - dn * n[1], L[2] - dn * n[2]];
        sh = [r[0] * gloss, r[1] * gloss, r[2] * gloss];
      }
      out.push(p[0], p[1], p[2], opacity, c[0], c[1], c[2], c[3], c[4], c[5], color[0], color[1], color[2], sh[0], sh[1], sh[2]);
    }
    function frame(n) {
      var a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      var t = norm3(cross(a, n));
      var b = cross(n, t);
      var ang = R() * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
      return [[t[0] * ca + b[0] * sa, t[1] * ca + b[1] * sa, t[2] * ca + b[2] * sa], [b[0] * ca - t[0] * sa, b[1] * ca - t[1] * sa, b[2] * ca - t[2] * sa], n];
    }
    function surfel(p, n, s, color, opacity, gloss) {
      push(p, frame(n), [s * (0.7 + 0.6 * R()), s * (0.7 + 0.6 * R()), s * 0.12], color, opacity, gloss, n);
    }

    var i, p, n, r, a, y, c;
    // floor with a soft contact shadow
    for (i = 0; i < 4000; i++) {
      r = 4.5 * Math.sqrt(R());
      a = R() * Math.PI * 2;
      p = [r * Math.cos(a), -1.2, r * Math.sin(a)];
      var sh = 1 - 0.45 * Math.exp(-r * r * 0.6);
      c = lerp3([0.3, 0.28, 0.26], [0.42, 0.4, 0.37], R());
      surfel(p, [0, 1, 0], 0.1, [c[0] * sh, c[1] * sh, c[2] * sh], 0.95, 0);
    }
    // round wooden table top with growth rings, and its edge
    for (i = 0; i < 15000; i++) {
      r = 1.25 * Math.sqrt(R());
      a = R() * Math.PI * 2;
      p = [r * Math.cos(a), 0, r * Math.sin(a)];
      var ring = 0.5 + 0.5 * Math.sin(r * 38 + Math.sin(a * 3) * 1.5);
      c = lerp3([0.42, 0.24, 0.12], [0.6, 0.38, 0.2], ring);
      var shadow = Math.hypot(p[0] + 0.18, p[2] + 0.12) < 0.62 ? 0.55 : 1;
      surfel(p, [0, 1, 0], 0.018, jitter(lit(c, [0, 1, 0], shadow), 0.05), 0.98, 0.18);
    }
    for (i = 0; i < 3000; i++) {
      a = R() * Math.PI * 2;
      y = -0.09 * R();
      n = [Math.cos(a), 0, Math.sin(a)];
      surfel([1.25 * n[0], y, 1.25 * n[2]], n, 0.02, jitter(lit([0.38, 0.21, 0.1], n), 0.05), 0.98, 0.1);
    }
    // pedestal
    for (i = 0; i < 2200; i++) {
      a = R() * Math.PI * 2;
      y = -0.09 - 1.1 * R();
      n = [Math.cos(a), 0, Math.sin(a)];
      surfel([0.22 * n[0], y, 0.22 * n[2]], n, 0.03, jitter(lit([0.2, 0.12, 0.07], n, 0.8), 0.05), 0.98, 0);
    }
    // glazed ceramic pot (a frustum), with a rim
    for (i = 0; i < 9000; i++) {
      var h = R();
      a = R() * Math.PI * 2;
      var pr = 0.36 + 0.14 * h;
      n = norm3([Math.cos(a), -0.35, Math.sin(a)]);
      p = [pr * Math.cos(a), 0.38 * h, pr * Math.sin(a)];
      var glaze = lerp3([0.06, 0.18, 0.42], [0.12, 0.35, 0.6], Math.pow(R(), 2) * 0.6 + h * 0.4);
      surfel(p, n, 0.013, jitter(lit(glaze, n), 0.04), 0.98, 0.55);
    }
    for (i = 0; i < 1800; i++) {
      a = R() * Math.PI * 2;
      var tb = R() * Math.PI * 2;
      n = [Math.cos(tb) * Math.cos(a), Math.sin(tb), Math.cos(tb) * Math.sin(a)];
      p = [(0.5 + 0.035 * Math.cos(tb)) * Math.cos(a), 0.38 + 0.035 * Math.sin(tb), (0.5 + 0.035 * Math.cos(tb)) * Math.sin(a)];
      surfel(p, n, 0.01, jitter(lit([0.1, 0.28, 0.55], n), 0.04), 0.98, 0.55);
    }
    // soil with pebbles
    for (i = 0; i < 3500; i++) {
      r = 0.48 * Math.sqrt(R());
      a = R() * Math.PI * 2;
      var pebble = R() < 0.08;
      c = pebble ? lerp3([0.45, 0.43, 0.4], [0.7, 0.68, 0.62], R()) : lerp3([0.13, 0.08, 0.05], [0.24, 0.15, 0.09], R());
      surfel([r * Math.cos(a), 0.35 + (pebble ? 0.008 : 0), r * Math.sin(a)], [0, 1, 0], pebble ? 0.016 : 0.012, lit(c, [0, 1, 0]), 0.98, 0);
    }
    // trunk and branches: tubes swept along cubic Bezier curves
    function bez(P, t) {
      var u = 1 - t;
      return [0, 1, 2].map(function (k) {
        return u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k];
      });
    }
    function tube(P, r0, r1, count) {
      for (var q = 0; q < count; q++) {
        var t = R();
        var c0 = bez(P, t), c1 = bez(P, Math.min(1, t + 0.01)), c2 = bez(P, Math.max(0, t - 0.01));
        var tg = norm3([c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]]);
        var a0 = Math.abs(tg[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        var bx = norm3(cross(tg, a0)), by = cross(tg, bx);
        var ang = R() * Math.PI * 2;
        var nn = [bx[0] * Math.cos(ang) + by[0] * Math.sin(ang), bx[1] * Math.cos(ang) + by[1] * Math.sin(ang), bx[2] * Math.cos(ang) + by[2] * Math.sin(ang)];
        var rad = r0 + (r1 - r0) * t;
        var bark = 0.5 + 0.5 * Math.sin(ang * 9 + t * 40);
        var col = lerp3([0.22, 0.15, 0.1], [0.4, 0.31, 0.24], bark * 0.7 + R() * 0.3);
        push([c0[0] + nn[0] * rad, c0[1] + nn[1] * rad, c0[2] + nn[2] * rad], [tg, cross(nn, tg), nn], [0.022, 0.009, 0.004], lit(col, nn), 0.98, 0.05, nn);
      }
    }
    var trunk = [[0, 0.34, 0], [0.18, 0.62, 0.06], [-0.26, 0.92, -0.06], [0.02, 1.2, 0.02]];
    tube(trunk, 0.085, 0.035, 6000);
    tube([[0.0, 0.8, -0.01], [0.25, 0.85, 0.05], [0.42, 0.95, 0.1], [0.55, 1.05, 0.12]], 0.04, 0.018, 1600);
    tube([[-0.12, 0.98, -0.05], [-0.3, 1.02, -0.1], [-0.45, 1.08, -0.05], [-0.55, 1.15, 0.0]], 0.035, 0.016, 1400);
    tube([[0.0, 1.1, 0.0], [0.08, 1.2, -0.2], [0.1, 1.28, -0.3], [0.05, 1.32, -0.38]], 0.03, 0.014, 1000);
    // foliage: volumetric clusters of small, flat, randomly oriented Gaussians
    var clusters = [
      [0.02, 1.35, 0.03, 0.32], [0.58, 1.14, 0.13, 0.26], [-0.58, 1.24, 0.01, 0.27],
      [0.08, 1.42, -0.4, 0.22], [0.3, 1.3, 0.25, 0.2], [-0.3, 1.38, -0.25, 0.2],
    ];
    clusters.forEach(function (cl, ci) {
      var cnt = Math.round(8000 * cl[3] / 0.32);
      for (var q = 0; q < cnt; q++) {
        var dir = norm3([gauss(), gauss() * 0.7, gauss()]);
        var rr = cl[3] * Math.pow(R(), 0.35);
        var pp = [cl[0] + dir[0] * rr, cl[1] + dir[1] * rr * 0.75, cl[2] + dir[2] * rr];
        var depth = rr / cl[3];
        var ao = 0.45 + 0.55 * depth * (0.6 + 0.4 * (dir[1] * 0.5 + 0.5));
        var base = lerp3([0.12, 0.3, 0.08], [0.36, 0.56, 0.14], R() * 0.7 + (ci % 2) * 0.15);
        var flower = R() < 0.02 && depth > 0.85;
        if (flower) base = lerp3([0.95, 0.55, 0.7], [1.0, 0.85, 0.9], R());
        var ax = frame(norm3([gauss(), gauss(), gauss()]));
        var s = flower ? 0.012 : 0.018 + 0.012 * R();
        push(pp, ax, [s, s * (0.4 + 0.3 * R()), s * 0.15], lit(base, dir, ao), 0.88, 0.12, dir);
      }
    });

    // shuffle so that "show the first N Gaussians" is a uniform random subset
    var count = out.length / 16;
    var data = new Float32Array(out);
    for (i = count - 1; i > 0; i--) {
      var j = Math.floor(R() * (i + 1));
      for (var k = 0; k < 16; k++) {
        var tmp = data[i * 16 + k];
        data[i * 16 + k] = data[j * 16 + k];
        data[j * 16 + k] = tmp;
      }
    }
    return { count: count, data: data };
  }

  // ---------------------------------------------------------------- shaders
  var VS = [
    "#version 300 es",
    "precision highp float;",
    "precision highp int;",
    "in vec2 aCorner;",
    "in uint aIndex;",
    "uniform highp sampler2D uData;",
    "uniform mat4 uView, uProj;",
    "uniform vec2 uViewport;",
    "uniform float uFocal, uScale;",
    "uniform vec3 uCamPos;",
    "uniform int uCount, uMode, uSH;",
    "out vec4 vColor;",
    "out vec2 vPos;",
    "vec4 fetch(int i, int k) { int t = i * 4 + k; return texelFetch(uData, ivec2(t % " + TEX_W + ", t / " + TEX_W + "), 0); }",
    "void main() {",
    "  int i = int(aIndex);",
    "  if (i >= uCount) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }",
    "  vec4 d0 = fetch(i, 0), d1 = fetch(i, 1), d2 = fetch(i, 2), d3 = fetch(i, 3);",
    "  vec4 cam = uView * vec4(d0.xyz, 1.0);",
    "  vec4 clip = uProj * cam;",
    "  float lim = 1.3 * clip.w;",
    "  if (cam.z > -0.05 || abs(clip.x) > lim || abs(clip.y) > lim) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }",
    // EWA splatting: project the 3D covariance with the Jacobian of the perspective map
    "  mat3 S = mat3(d1.x, d1.y, d1.z, d1.y, d1.w, d2.x, d1.z, d2.x, d2.y) * (uScale * uScale);",
    "  float z = -cam.z;",
    "  mat3 J = mat3(uFocal / z, 0.0, 0.0, 0.0, uFocal / z, 0.0, uFocal * cam.x / (z * z), uFocal * cam.y / (z * z), 0.0);",
    "  mat3 T = J * mat3(uView);",
    "  mat3 C = T * S * transpose(T);",
    "  float a = C[0][0] + 0.3, b = C[0][1], c = C[1][1] + 0.3;", // low-pass filter, as in the paper
    "  float mid = 0.5 * (a + c), rad = length(vec2(0.5 * (a - c), b));",
    "  float l1 = mid + rad, l2 = max(mid - rad, 0.1);",
    "  vec2 v1 = abs(b) > 1e-7 ? normalize(vec2(b, l1 - a)) : (a >= c ? vec2(1.0, 0.0) : vec2(0.0, 1.0));",
    "  vec2 v2 = vec2(-v1.y, v1.x);",
    "  float r1 = min(3.0 * sqrt(l1), 1024.0), r2 = min(3.0 * sqrt(l2), 1024.0);",
    "  if (uMode == 2) { r1 = 1.6; r2 = 1.6; }",
    "  vec2 off = aCorner.x * r1 * v1 + aCorner.y * r2 * v2;",
    "  gl_Position = clip + vec4(off / uViewport * 2.0 * clip.w, 0.0, 0.0);",
    "  vPos = aCorner * 3.0;",
    "  vec3 col = vec3(d2.z, d2.w, d3.x);",
    "  if (uSH == 1) col += dot(d3.yzw, normalize(d0.xyz - uCamPos));",
    "  if (uMode == 4) col = mix(vec3(1.0, 0.9, 0.4), vec3(0.1, 0.2, 0.6), clamp((z - 1.5) / 4.0, 0.0, 1.0));",
    "  vColor = vec4(clamp(col, 0.0, 1.0), d0.w);",
    "}",
  ].join("\n");

  var FS = [
    "#version 300 es",
    "precision highp float;",
    "precision highp int;",
    "in vec4 vColor;",
    "in vec2 vPos;",
    "uniform int uMode;",
    "out vec4 o;",
    "void main() {",
    "  float r2 = dot(vPos, vPos);",
    "  if (uMode == 1) {", // 1-sigma ellipsoids, opaque, shaded like spheres
    "    if (r2 > 1.0) discard;",
    "    o = vec4(vColor.rgb * (0.35 + 0.65 * sqrt(1.0 - r2)), 1.0);",
    "  } else if (uMode == 2) {",
    "    o = vec4(vColor.rgb, 1.0);",
    "  } else if (uMode == 3) {", // overdraw heat map: additive (alpha 0)
    "    float a = exp(-0.5 * r2); if (a < 1.0 / 255.0) discard;",
    "    o = vec4(vec3(0.012, 0.0045, 0.0015) * a, 0.0);",
    "  } else {",
    "    float a = vColor.a * exp(-0.5 * r2);",
    "    if (a < 1.0 / 255.0) discard;",
    "    o = vec4(vColor.rgb * a, a);",
    "  }",
    "}",
  ].join("\n");

  // ------------------------------------------------------------------ init
  var started = false;
  function start() {
    if (started) return;
    started = true;
    var gl = canvas.getContext("webgl2", { antialias: false, alpha: true, premultipliedAlpha: true });
    canvas.style.background = "radial-gradient(ellipse at 50% 35%, #7b828c 0%, #4a4c50 55%, #2a2a2c 100%)";
    if (!gl) return fail();

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var prog = gl.createProgram();
    try {
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.bindAttribLocation(prog, 0, "aCorner");
      gl.bindAttribLocation(prog, 1, "aIndex");
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) {
      if (window.console) console.warn(e);
      return fail();
    }
    var U = {};
    ["uData", "uView", "uProj", "uViewport", "uFocal", "uScale", "uCamPos", "uCount", "uMode", "uSH"].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });

    var scene = buildScene();
    var N = scene.count;
    var pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos[i * 3] = scene.data[i * 16];
      pos[i * 3 + 1] = scene.data[i * 16 + 1];
      pos[i * 3 + 2] = scene.data[i * 16 + 2];
    }
    var rows = Math.ceil((N * 4) / TEX_W);
    var texData = new Float32Array(TEX_W * rows * 4);
    texData.set(scene.data);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TEX_W, rows, 0, gl.RGBA, gl.FLOAT, texData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var cb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var order = new Uint32Array(N);
    var ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ib);
    gl.bufferData(gl.ARRAY_BUFFER, order, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    // ---------------------------------------------------- depth sort (CPU)
    // 16-bit counting sort of view depth, far to near, as in common 3DGS web viewers
    var keys = new Uint16Array(N), counts = new Uint32Array(65536), starts = new Uint32Array(65536);
    var sortMs = 0;
    function sortSplats(eye, fwd) {
      var t0 = performance.now();
      var mn = Infinity, mx = -Infinity, k, d;
      var depth = new Float32Array(N);
      for (k = 0; k < N; k++) {
        d = (pos[k * 3] - eye[0]) * fwd[0] + (pos[k * 3 + 1] - eye[1]) * fwd[1] + (pos[k * 3 + 2] - eye[2]) * fwd[2];
        depth[k] = d;
        if (d < mn) mn = d;
        if (d > mx) mx = d;
      }
      var sc = 65535 / Math.max(mx - mn, 1e-6);
      counts.fill(0);
      for (k = 0; k < N; k++) {
        keys[k] = 65535 - ((depth[k] - mn) * sc) | 0; // far first
        counts[keys[k]]++;
      }
      starts[0] = 0;
      for (k = 1; k < 65536; k++) starts[k] = starts[k - 1] + counts[k - 1];
      for (k = 0; k < N; k++) order[starts[keys[k]]++] = k;
      gl.bindBuffer(gl.ARRAY_BUFFER, ib);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, order);
      sortMs = sortMs * 0.8 + (performance.now() - t0) * 0.2;
    }

    // ------------------------------------------------------------- camera
    var cam = { yaw: 0.6, pitch: 0.28, dist: 3.4, target: [0, 0.6, 0] };
    var st = { mode: 0, sh: true, scale: 1, frac: 1, spin: true };
    var lastSortDir = [0, 0, 0], lastSortEye = [0, 0, 0];

    function mats() {
      var cp = Math.cos(cam.pitch);
      var eye = [cam.target[0] + cam.dist * cp * Math.sin(cam.yaw), cam.target[1] + cam.dist * Math.sin(cam.pitch), cam.target[2] + cam.dist * cp * Math.cos(cam.yaw)];
      var f = [cam.target[0] - eye[0], cam.target[1] - eye[1], cam.target[2] - eye[2]];
      var fl = Math.hypot(f[0], f[1], f[2]);
      f = [f[0] / fl, f[1] / fl, f[2] / fl];
      var r = [-f[2], 0, f[0]], rl = Math.hypot(r[0], r[2]);
      r = [r[0] / rl, 0, r[2] / rl];
      var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      var view = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0,
        -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]), -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]), f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2], 1];
      var fov = (45 * Math.PI) / 180, aspect = canvas.width / canvas.height, near = 0.05, far = 50;
      var t = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
      var proj = [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
      return { eye: eye, fwd: f, view: view, proj: proj, focal: canvas.height / 2 * t };
    }

    // ------------------------------------------------------------ controls
    var modes = panel.querySelectorAll("[data-gmode]");
    Array.prototype.forEach.call(modes, function (b) {
      b.addEventListener("click", function () {
        st.mode = +b.dataset.gmode;
        Array.prototype.forEach.call(modes, function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
      });
    });
    Array.prototype.forEach.call(panel.querySelectorAll("[data-toggle]"), function (b) {
      var key = b.dataset.toggle;
      b.setAttribute("aria-pressed", st[key] ? "true" : "false");
      b.addEventListener("click", function () {
        st[key] = !st[key];
        b.setAttribute("aria-pressed", st[key] ? "true" : "false");
      });
    });
    panel.querySelector('[data-input="gscale"]').addEventListener("input", function (e) { st.scale = +e.target.value; });
    panel.querySelector('[data-input="gcount"]').addEventListener("input", function (e) { st.frac = +e.target.value; });

    var hint = panel.querySelector(".lab-hint");
    var drag = null, engaged = false;
    canvas.addEventListener("pointerdown", function (e) {
      drag = { x: e.clientX, y: e.clientY };
      engaged = true;
      canvas.setPointerCapture(e.pointerId);
      hint.style.opacity = "0";
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drag) return;
      cam.yaw -= (e.clientX - drag.x) * 0.007;
      cam.pitch = Math.max(-0.2, Math.min(1.2, cam.pitch + (e.clientY - drag.y) * 0.005));
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    function end() { drag = null; }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", function () { engaged = false; });
    // zoom with the wheel only after the user has clicked into the viewer,
    // so scrolling the page over the canvas keeps working
    canvas.addEventListener("wheel", function (e) {
      if (!engaged) return;
      e.preventDefault();
      cam.dist = Math.max(1.2, Math.min(8, cam.dist * Math.exp(e.deltaY * 0.001)));
    }, { passive: false });

    // --------------------------------------------------------------- frame
    var statsEl = panel.querySelector(".lab-stats");
    var statsTpl = panel.dataset.stats;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    var fps = 60, frames = 0, last = 0;

    function render(now) {
      var dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      if (st.spin && !drag) cam.yaw += dt * 0.15;
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      var M = mats();
      var moved = Math.abs(M.fwd[0] - lastSortDir[0]) + Math.abs(M.fwd[1] - lastSortDir[1]) + Math.abs(M.fwd[2] - lastSortDir[2]) +
        Math.abs(M.eye[0] - lastSortEye[0]) + Math.abs(M.eye[1] - lastSortEye[1]) + Math.abs(M.eye[2] - lastSortEye[2]);
      if (moved > 0.002) {
        sortSplats(M.eye, M.fwd);
        lastSortDir = M.fwd;
        lastSortEye = M.eye;
      }

      gl.bindVertexArray(vao);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied "over", back to front
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(U.uData, 0);
      gl.uniformMatrix4fv(U.uView, false, M.view);
      gl.uniformMatrix4fv(U.uProj, false, M.proj);
      gl.uniform2f(U.uViewport, w, h);
      gl.uniform1f(U.uFocal, M.focal);
      gl.uniform1f(U.uScale, st.scale);
      gl.uniform3fv(U.uCamPos, M.eye);
      var shown = Math.max(1, Math.round(N * st.frac));
      gl.uniform1i(U.uCount, shown);
      gl.uniform1i(U.uMode, st.mode);
      gl.uniform1i(U.uSH, st.sh ? 1 : 0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N);

      if (dt > 0) fps = fps * 0.95 + (1 / dt) * 0.05;
      if (++frames % 15 === 0)
        statsEl.textContent = statsTpl.replace("{n}", shown.toLocaleString()).replace("{ms}", sortMs.toFixed(1)).replace("{fps}", Math.round(fps));
    }

    var visible = false, raf = 0;
    function tick(now) {
      raf = 0;
      render(now);
      if (visible && !document.hidden) raf = requestAnimationFrame(tick);
      else last = 0;
    }
    function kick() {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
    }
    new IntersectionObserver(function (e) {
      visible = e[0].isIntersecting;
      kick();
    }).observe(canvas);
    document.addEventListener("visibilitychange", kick);
  }

  new IntersectionObserver(function (e, obs) {
    if (e[0].isIntersecting) {
      obs.disconnect();
      start();
    }
  }).observe(canvas);
})();
