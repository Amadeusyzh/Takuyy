// Interactive 2D XPBD cloth for graphics post 07 (assets/js/widgets/graphics-xpbd-cloth.js).
// A cloth hanging from its two top corners in the x-y plane (y up, gravity -y, SI units),
// solved with the post's XPBD distance constraints. Drag particles with mouse or touch.
(function () {
  "use strict";
  var T = {
    en: { comp: "stretch compliance", n: "n", modeSub: "n substeps \u00d7 1 iteration", modeIt: "1 step \u00d7 n iterations",
          maxs: "max stretch", mean: "mean", reset: "Reset", hint: "drag the cloth" },
    zh: { comp: "\u62c9\u4f38\u67d4\u5ea6", n: "n", modeSub: "n \u4e2a\u5b50\u6b65 \u00d7 1 \u6b21\u8fed\u4ee3", modeIt: "1 \u6b65 \u00d7 n \u6b21\u8fed\u4ee3",
          maxs: "\u6700\u5927\u62c9\u4f38", mean: "\u5e73\u5747", reset: "\u91cd\u7f6e", hint: "\u62d6\u52a8\u5e03\u6599" },
    ja: { comp: "\u4f38\u3073\u306e\u30b3\u30f3\u30d7\u30e9\u30a4\u30a2\u30f3\u30b9", n: "n", modeSub: "n \u30b5\u30d6\u30b9\u30c6\u30c3\u30d7 \u00d7 1 \u53cd\u5fa9", modeIt: "1 \u30b9\u30c6\u30c3\u30d7 \u00d7 n \u53cd\u5fa9",
          maxs: "\u6700\u5927\u4f38\u3073", mean: "\u5e73\u5747", reset: "\u30ea\u30bb\u30c3\u30c8", hint: "\u5e03\u3092\u30c9\u30e9\u30c3\u30b0" }
  };
  var NX = 14, NY = 12, SIZE = 1.0, MASS = 0.2, G = -9.81, FRAME = 1 / 60;

  function Cloth() { this.reset(); }
  Cloth.prototype.reset = function () {
    var n = NX * NY, i, j;
    this.x = new Float64Array(2 * n); this.p = new Float64Array(2 * n); this.v = new Float64Array(2 * n);
    this.w = new Float64Array(n);
    var dx = SIZE / (NX - 1), dy = SIZE / (NY - 1) * 0.9;
    for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) {
      var k = j * NX + i;
      this.x[2 * k] = -SIZE / 2 + i * dx; this.x[2 * k + 1] = -j * dy;
      this.w[k] = n / MASS;
    }
    this.w[0] = 0; this.w[NX - 1] = 0;                    // pinned top corners
    var c = [], kind = [];
    function add(a, b, t) { c.push(a, b); kind.push(t); }
    for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) {
      var id = j * NX + i;
      if (i + 1 < NX) add(id, id + 1, 0);
      if (j + 1 < NY) add(id, id + NX, 0);
      if (i + 1 < NX && j + 1 < NY) { add(id, id + NX + 1, 1); add(id + 1, id + NX, 1); }
      if (i + 2 < NX) add(id, id + 2, 2);
      if (j + 2 < NY) add(id, id + 2 * NX, 2);
    }
    this.c = new Int32Array(c); this.kind = new Int8Array(kind);
    this.rest = new Float64Array(kind.length); this.lam = new Float64Array(kind.length);
    for (i = 0; i < kind.length; i++) {
      var a = this.c[2 * i], b = this.c[2 * i + 1];
      this.rest[i] = Math.hypot(this.x[2 * a] - this.x[2 * b], this.x[2 * a + 1] - this.x[2 * b + 1]);
    }
  };
  // one XPBD substep of length h with 'iters' Gauss-Seidel passes (lambda reset at the start)
  Cloth.prototype.substep = function (h, iters, alpha, grab) {
    var x = this.x, p = this.p, v = this.v, w = this.w, n = NX * NY, i, it;
    p.set(x);
    for (i = 0; i < n; i++) if (w[i] > 0) { v[2 * i + 1] += h * G; x[2 * i] += h * v[2 * i]; x[2 * i + 1] += h * v[2 * i + 1]; }
    if (grab) { x[2 * grab.i] = grab.x; x[2 * grab.i + 1] = grab.y; }
    this.lam.fill(0);
    var at = [alpha / (h * h), 4 * alpha / (h * h), 0.1 / (h * h)];   // stretch, shear (4x softer), bending
    var m = this.kind.length;
    for (it = 0; it < iters; it++) {
      for (i = 0; i < m; i++) {
        var a = this.c[2 * i], b = this.c[2 * i + 1];
        var wa = w[a], wb = w[b];
        var ddx = x[2 * a] - x[2 * b], ddy = x[2 * a + 1] - x[2 * b + 1];
        var L = Math.hypot(ddx, ddy); if (L < 1e-12) continue;
        var C = L - this.rest[i], aT = at[this.kind[i]], den = wa + wb + aT;
        if (den <= 0) continue;
        var dl = (-C - aT * this.lam[i]) / den;
        this.lam[i] += dl;
        var nx = ddx / L, ny = ddy / L;
        x[2 * a] += wa * dl * nx; x[2 * a + 1] += wa * dl * ny;
        x[2 * b] -= wb * dl * nx; x[2 * b + 1] -= wb * dl * ny;
      }
    }
    for (i = 0; i < n; i++) {
      if (x[2 * i + 1] < -1.45) x[2 * i + 1] = -1.45;              // ground
      v[2 * i] = (x[2 * i] - p[2 * i]) / h; v[2 * i + 1] = (x[2 * i + 1] - p[2 * i + 1]) / h;
      if (w[i] === 0) { v[2 * i] = 0; v[2 * i + 1] = 0; }
    }
  };
  Cloth.prototype.stretch = function () {
    var mx = 0, sum = 0, cnt = 0;
    for (var i = 0; i < this.kind.length; i++) {
      if (this.kind[i] !== 0) continue;
      var a = this.c[2 * i], b = this.c[2 * i + 1];
      var s = Math.hypot(this.x[2 * a] - this.x[2 * b], this.x[2 * a + 1] - this.x[2 * b + 1]) / this.rest[i];
      if (s > mx) mx = s; sum += s; cnt++;
    }
    return [mx, sum / cnt];
  };

  function el(tag, attrs, parent) {
    var e = document.createElement(tag);
    for (var k in attrs) { if (k === "style") e.style.cssText = attrs[k]; else if (k === "text") e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (parent) parent.appendChild(e);
    return e;
  }

  function init(root) {
    var t = T[root.dataset.lang] || T.en;
    root.innerHTML = "";
    root.style.background = "#ffffff";
    var wrap = el("div", { style: "position:relative;width:100%;font:14px/1.4 sans-serif;color:#222" }, root);
    var canvas = el("canvas", { style: "display:block;width:100%;touch-action:none;cursor:grab;background:#fff" }, wrap);
    var bar = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;padding:8px 10px;border-top:1px solid #ddd;background:#fafafa" }, wrap);
    var l1 = el("label", { style: "display:flex;align-items:center;gap:6px" }, bar);
    el("span", { text: t.comp + " \u03b1" }, l1);
    var sComp = el("input", { type: "range", min: "-7", max: "-1", step: "0.1", value: "-4", style: "width:110px" }, l1);
    var vComp = el("span", { style: "min-width:58px;font-family:monospace" }, l1);
    var l2 = el("label", { style: "display:flex;align-items:center;gap:6px" }, bar);
    el("span", { text: t.n }, l2);
    var sN = el("input", { type: "range", min: "1", max: "30", step: "1", value: "15", style: "width:90px" }, l2);
    var vN = el("span", { style: "min-width:20px;font-family:monospace" }, l2);
    var sel = el("select", { style: "font-size:13px" }, bar);
    el("option", { value: "sub", text: t.modeSub }, sel);
    el("option", { value: "it", text: t.modeIt }, sel);
    var btn = el("button", { type: "button", text: t.reset, style: "font-size:13px;padding:2px 10px" }, bar);
    var stat = el("div", { style: "flex-basis:100%;font-family:monospace;font-size:13px" }, bar);

    var cloth = new Cloth(), grab = null, ctx = canvas.getContext("2d");
    var W = 0, H = 0, scale = 1, ox = 0, oy = 0, dpr = 1;
    function resize() {
      dpr = window.devicePixelRatio || 1;
      W = Math.max(200, root.clientWidth);
      var total = parseInt(root.style.minHeight, 10) || 420;
      H = Math.max(240, total - bar.offsetHeight - 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = H + "px";
      scale = Math.min(W / 1.7, H / 1.62); ox = W / 2; oy = 0.1 * scale + 8;
    }
    function toScreen(x, y) { return [ox + x * scale, oy - y * scale]; }
    function toWorld(px, py) { return [(px - ox) / scale, (oy - py) / scale]; }
    function labels() {
      var a = Math.pow(10, +sComp.value);
      vComp.textContent = a.toExponential(0).replace("e", "e");
      vN.textContent = sN.value;
    }
    function color(s) {                                     // 1.0 -> purple, >= 1.25 -> red
      var u = Math.min(1, Math.max(0, (s - 1) / 0.25));
      var r = Math.round(148 + u * (214 - 148)), g = Math.round(103 + u * (39 - 103)), b = Math.round(189 + u * (40 - 189));
      return "rgb(" + r + "," + g + "," + b + ")";
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      var gy = toScreen(0, -1.45)[1];
      ctx.fillStyle = "#eee"; ctx.fillRect(0, gy, W, H - gy);
      var x = cloth.x, i;
      ctx.lineWidth = 2;
      for (i = 0; i < cloth.kind.length; i++) {
        if (cloth.kind[i] !== 0) continue;
        var a = cloth.c[2 * i], b = cloth.c[2 * i + 1];
        var s = Math.hypot(x[2 * a] - x[2 * b], x[2 * a + 1] - x[2 * b + 1]) / cloth.rest[i];
        var A = toScreen(x[2 * a], x[2 * a + 1]), B = toScreen(x[2 * b], x[2 * b + 1]);
        ctx.strokeStyle = color(s); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      }
      for (i = 0; i < NX * NY; i++) {
        var P = toScreen(x[2 * i], x[2 * i + 1]);
        var pinned = cloth.w[i] === 0 && !(grab && grab.i === i);
        ctx.fillStyle = pinned ? "#d62728" : (grab && grab.i === i ? "#ff7f0e" : "#222");
        ctx.beginPath(); ctx.arc(P[0], P[1], pinned || (grab && grab.i === i) ? 5 : 2.2, 0, 2 * Math.PI); ctx.fill();
      }
      var st = cloth.stretch();
      stat.textContent = t.maxs + " " + st[0].toFixed(3) + "   " + t.mean + " " + st[1].toFixed(3);
      if (!grab && !moved) {
        ctx.fillStyle = "#7f7f7f"; ctx.font = "13px sans-serif"; ctx.textAlign = "right";
        ctx.fillText(t.hint, W - 10, H - 10);
      }
    }
    var moved = false;
    function step() {
      var n = +sN.value, alpha = Math.pow(10, +sComp.value);
      if (sel.value === "sub") { for (var k = 0; k < n; k++) cloth.substep(FRAME / n, 1, alpha, grab); }
      else cloth.substep(FRAME, n, alpha, grab);
    }
    function pos(e) { var r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    canvas.addEventListener("pointerdown", function (e) {
      var q = pos(e), best = -1, bd = 30 * 30;
      for (var i = 0; i < NX * NY; i++) {
        var P = toScreen(cloth.x[2 * i], cloth.x[2 * i + 1]), d = (P[0] - q[0]) * (P[0] - q[0]) + (P[1] - q[1]) * (P[1] - q[1]);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return;
      var wq = toWorld(q[0], q[1]);
      grab = { i: best, w: cloth.w[best], x: wq[0], y: wq[1] };
      cloth.w[best] = 0; moved = true;
      canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; e.preventDefault();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!grab) return;
      var q = pos(e), wq = toWorld(q[0], q[1]); grab.x = wq[0]; grab.y = Math.max(-1.45, wq[1]);
    });
    function release() {
      if (!grab) return;
      cloth.w[grab.i] = grab.w; grab = null; canvas.style.cursor = "grab";
    }
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    sComp.addEventListener("input", labels); sN.addEventListener("input", labels);
    btn.addEventListener("click", function () { release(); cloth.reset(); });
    resize(); labels();
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(root);
    else window.addEventListener("resize", resize);
    var visible = true;
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(root);
    function loop() { if (visible) { step(); draw(); } requestAnimationFrame(loop); }
    draw(); requestAnimationFrame(loop);
  }

  function start() {
    var roots = document.querySelectorAll('[data-widget="graphics-xpbd-cloth"]');
    for (var i = 0; i < roots.length; i++) init(roots[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
