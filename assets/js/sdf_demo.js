// Interactive ray-marching demo for the about page (WebGL 1, no dependencies).
(function () {
  "use strict";

  var root = document.getElementById("sdf-demo");
  if (!root) return;
  var canvas = root.querySelector("canvas");
  var gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) {
    root.querySelector(".sdf-demo-stage").textContent = root.dataset.nogl;
    root.querySelector(".sdf-demo-controls").style.display = "none";
    return;
  }

  var VERT = "attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }";

  var FRAG = [
    "precision highp float;",
    "uniform vec2 uRes;",
    "uniform float uTime;",
    "uniform vec2 uCam;",
    "uniform float uK;",
    "uniform int uMode;",
    "uniform vec3 uBg;",
    "uniform vec3 uAccent;",
    "",
    "mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }",
    "float sdSphere(vec3 p, float r) { return length(p) - r; }",
    "float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }",
    "float sdRoundBox(vec3 p, vec3 b, float r) {",
    "  vec3 q = abs(p) - b;",
    "  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;",
    "}",
    // polynomial smooth minimum; also blends the material colour (yzw)
    "vec4 smin(vec4 a, vec4 b, float k) {",
    "  float h = clamp(0.5 + 0.5 * (b.x - a.x) / k, 0.0, 1.0);",
    "  return vec4(mix(b.x, a.x, h) - k * h * (1.0 - h), mix(b.yzw, a.yzw, h));",
    "}",
    "",
    // x = distance, yzw = albedo (y < 0 marks the ground plane)
    "vec4 map(vec3 p) {",
    "  float t = uTime;",
    "  float k = max(uK, 1e-4);",
    "  vec3 q = p; q.xz *= rot(t * 0.3); q.xy *= rot(0.6);",
    "  vec4 r = vec4(sdTorus(q, vec2(0.75, 0.2)), uAccent);",
    "  vec3 c1 = vec3(sin(t * 0.9) * 1.1, 0.3 + 0.35 * sin(t * 1.3), cos(t * 0.7) * 0.6);",
    "  r = smin(r, vec4(sdSphere(p - c1, 0.4), vec3(0.95, 0.5, 0.2)), k);",
    "  vec3 c2 = vec3(cos(t * 0.6) * 0.85, 0.15 + 0.5 * cos(t * 1.1), sin(t * 0.8) * 1.0);",
    "  r = smin(r, vec4(sdSphere(p - c2, 0.34), vec3(0.15, 0.6, 0.85)), k);",
    "  vec3 bp = p - vec3(0.0, -0.1 + 0.2 * sin(t * 0.5), 0.0);",
    "  bp.xz *= rot(-t * 0.4); bp.yz *= rot(t * 0.3);",
    "  r = smin(r, vec4(sdRoundBox(bp, vec3(0.26), 0.05), vec3(0.3, 0.75, 0.4)), k);",
    "  float g = p.y + 1.0;",
    "  return g < r.x ? vec4(g, -1.0, 0.0, 0.0) : r;",
    "}",
    "",
    "vec3 calcNormal(vec3 p) {",
    "  const vec2 e = vec2(1.0, -1.0) * 0.0008;",
    "  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x +",
    "                   e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);",
    "}",
    "float softShadow(vec3 ro, vec3 rd) {",
    "  float res = 1.0, t = 0.02;",
    "  for (int i = 0; i < 40; i++) {",
    "    float h = map(ro + rd * t).x;",
    "    res = min(res, 10.0 * h / t);",
    "    t += clamp(h, 0.02, 0.25);",
    "    if (res < 0.002 || t > 8.0) break;",
    "  }",
    "  return clamp(res, 0.0, 1.0);",
    "}",
    "float ambientOcclusion(vec3 p, vec3 n) {",
    "  float occ = 0.0, w = 1.0;",
    "  for (int i = 0; i < 5; i++) {",
    "    float h = 0.02 + 0.12 * float(i);",
    "    occ += (h - map(p + n * h).x) * w;",
    "    w *= 0.75;",
    "  }",
    "  return clamp(1.0 - 2.0 * occ, 0.0, 1.0);",
    "}",
    "vec3 heat(float x) {",
    "  return vec3(smoothstep(0.0, 0.45, x), smoothstep(0.25, 0.8, x), smoothstep(0.6, 1.0, x));",
    "}",
    "",
    "void main() {",
    "  vec2 uv = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;",
    "  vec3 ro = 4.2 * vec3(cos(uCam.y) * sin(uCam.x), sin(uCam.y), cos(uCam.y) * cos(uCam.x));",
    "  vec3 ta = vec3(0.0, -0.1, 0.0);",
    "  vec3 ww = normalize(ta - ro);",
    "  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));",
    "  vec3 vv = cross(uu, ww);",
    "  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.8 * ww);",
    "",
    "  float t = 0.0, steps = 0.0;",
    "  vec4 h = vec4(1.0);",
    "  bool hit = false;",
    "  for (int i = 0; i < 128; i++) {",
    "    h = map(ro + rd * t);",
    "    if (h.x < 0.0008 * t) { hit = true; break; }",
    "    t += h.x;",
    "    steps += 1.0;",
    "    if (t > 20.0) break;",
    "  }",
    "",
    "  vec3 col = uBg;",
    "  if (uMode == 2) {",
    "    col = heat(steps / 96.0);",
    "  } else if (hit) {",
    "    vec3 p = ro + rd * t;",
    "    vec3 n = calcNormal(p);",
    "    if (uMode == 1) {",
    "      col = n * 0.5 + 0.5;",
    "    } else {",
    "      vec3 alb = h.yzw;",
    "      if (h.y < 0.0) {",
    "        float c = mod(floor(p.x * 1.5) + floor(p.z * 1.5), 2.0);",
    "        alb = mix(uBg, vec3(0.5), 0.35) * (0.85 + 0.15 * c);",
    "      }",
    "      vec3 L = normalize(vec3(0.6, 0.9, 0.4));",
    "      float dif = clamp(dot(n, L), 0.0, 1.0) * softShadow(p + n * 0.002, L);",
    "      float occ = ambientOcclusion(p, n);",
    "      float sky = 0.5 + 0.5 * n.y;",
    "      float spe = pow(clamp(dot(n, normalize(L - rd)), 0.0, 1.0), 48.0) * dif;",
    "      col = alb * (1.2 * dif * vec3(1.0, 0.95, 0.85) + 0.4 * sky * occ * vec3(0.75, 0.85, 1.0));",
    "      col += 0.4 * spe * (h.y < 0.0 ? 0.2 : 1.0);",
    "    }",
    "    col = mix(col, uBg, 1.0 - exp(-0.003 * t * t * t));",
    "  }",
    "  gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);",
    "}",
  ].join("\n");

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog = gl.createProgram();
  try {
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) {
    root.style.display = "none";
    return;
  }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var U = {};
  ["uRes", "uTime", "uCam", "uK", "uMode", "uBg", "uAccent"].forEach(function (n) {
    U[n] = gl.getUniformLocation(prog, n);
  });

  // ---- theme colours (follow the site's light/dark toggle) ----
  function cssColor(name) {
    var probe = document.createElement("span");
    probe.style.color = "var(" + name + ")";
    probe.style.display = "none";
    document.body.appendChild(probe);
    var m = getComputedStyle(probe).color.match(/[\d.]+/g) || [128, 128, 128];
    document.body.removeChild(probe);
    return [0, 1, 2].map(function (i) {
      return Math.pow(m[i] / 255, 2.2); // sRGB -> linear
    });
  }
  var bg, accent;
  function readTheme() {
    bg = cssColor("--global-bg-color");
    accent = cssColor("--global-theme-color");
    requestFrame();
  }
  new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // ---- state & controls ----
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DEFAULT_CAM = [0.6, 0.35];
  var state = { yaw: DEFAULT_CAM[0], pitch: DEFAULT_CAM[1], k: 0.35, mode: 0, time: 0, playing: !reduceMotion };
  var lastInteract = -1e9;

  var modeButtons = root.querySelectorAll("[data-mode]");
  Array.prototype.forEach.call(modeButtons, function (b) {
    b.addEventListener("click", function () {
      state.mode = +b.dataset.mode;
      Array.prototype.forEach.call(modeButtons, function (o) {
        o.setAttribute("aria-pressed", o === b ? "true" : "false");
      });
      requestFrame();
    });
  });
  var slider = root.querySelector('input[type="range"]');
  var kLabel = root.querySelector(".sdf-demo-k");
  slider.addEventListener("input", function () {
    state.k = +slider.value;
    kLabel.textContent = state.k.toFixed(2);
    requestFrame();
  });
  var playBtn = root.querySelector('[data-action="play"]');
  function syncPlay() {
    playBtn.textContent = state.playing ? root.dataset.play : root.dataset.resume;
  }
  playBtn.addEventListener("click", function () {
    state.playing = !state.playing;
    syncPlay();
    requestFrame();
  });
  root.querySelector('[data-action="reset"]').addEventListener("click", function () {
    state.yaw = DEFAULT_CAM[0];
    state.pitch = DEFAULT_CAM[1];
    state.k = 0.35;
    slider.value = "0.35";
    kLabel.textContent = "0.35";
    requestFrame();
  });
  syncPlay();

  // drag to orbit (vertical drags on touch screens keep scrolling the page)
  var hint = root.querySelector(".sdf-demo-hint");
  var drag = null;
  canvas.addEventListener("pointerdown", function (e) {
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    hint.style.opacity = "0";
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    state.yaw -= (e.clientX - drag.x) * 0.008;
    state.pitch = Math.min(1.25, Math.max(0.02, state.pitch + (e.clientY - drag.y) * 0.006));
    drag.x = e.clientX;
    drag.y = e.clientY;
    lastInteract = performance.now();
    requestFrame();
  });
  function endDrag() {
    drag = null;
    lastInteract = performance.now();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // ---- render loop: only while visible, with adaptive resolution ----
  var visible = false;
  var scale = Math.min(window.devicePixelRatio || 1, 1.5);
  var raf = 0;
  var prev = 0;
  var frameTimes = [];
  var fpsEl = root.querySelector(".sdf-demo-fps");

  function resize() {
    var w = Math.max(1, Math.round(canvas.clientWidth * scale));
    var h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function frame(now) {
    raf = 0;
    var dt = prev ? Math.min((now - prev) / 1000, 0.1) : 0;
    prev = now;
    if (state.playing) {
      state.time += dt;
      if (!drag && now - lastInteract > 2500) state.yaw += dt * 0.12;
    }

    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, state.time);
    gl.uniform2f(U.uCam, state.yaw, state.pitch);
    gl.uniform1f(U.uK, state.k);
    gl.uniform1i(U.uMode, state.mode);
    gl.uniform3fv(U.uBg, bg);
    gl.uniform3fv(U.uAccent, accent);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (dt > 0) {
      frameTimes.push(dt);
      if (frameTimes.length === 30) {
        var avg = frameTimes.reduce(function (a, b) { return a + b; }, 0) / 30;
        frameTimes = [];
        fpsEl.textContent = Math.round(1 / avg) + " fps @ " + canvas.width + "x" + canvas.height;
        if (avg > 1 / 40 && scale > 0.4) scale *= 0.8;
        else if (avg < 1 / 58 && scale < Math.min(window.devicePixelRatio || 1, 1.5)) scale *= 1.1;
      }
    }

    if (visible && !document.hidden && (state.playing || drag)) requestFrame();
    else prev = 0;
  }

  function requestFrame() {
    if (!raf && visible && bg) raf = requestAnimationFrame(frame);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) requestFrame();
    }).observe(canvas);
  } else {
    visible = true;
  }
  document.addEventListener("visibilitychange", requestFrame);
  window.addEventListener("resize", requestFrame);
  readTheme();
})();
