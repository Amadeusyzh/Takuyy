/* GJK + EPA explorer (graphics-engine post 05).
   Left: two convex polygons A and B in world space (drag either one).
   Right: their Minkowski difference A - B with the origin. The GJK simplex is shown step by step
   (buttons), with the search direction d. If the origin is inside A - B the shapes overlap and EPA
   gives the penetration depth and normal, drawn in both views. Plain Canvas 2D, pointer events. */
(function () {
  "use strict";
  var TXT = {
    en: { hint: "Drag A or B", prev: "\u{25c0} step", next: "step \u{25b6}", all: "all", shape: "new B",
          iter: "GJK iteration", sep: "separated: support point did not pass the origin",
          hit: "overlap: origin inside the simplex", run: "running", depth: "EPA depth", normal: "normal",
          mink: "Minkowski difference A \u{2212} B", world: "world" },
    zh: { hint: "\u{62d6}\u{52a8} A \u{6216} B", prev: "\u{25c0} \u{4e0a}\u{4e00}\u{6b65}", next: "\u{4e0b}\u{4e00}\u{6b65} \u{25b6}", all: "\u{5168}\u{90e8}", shape: "\u{6362} B",
          iter: "GJK \u{8fed}\u{4ee3}", sep: "\u{5206}\u{79bb}\u{ff1a}\u{652f}\u{6491}\u{70b9}\u{6ca1}\u{6709}\u{8d8a}\u{8fc7}\u{539f}\u{70b9}",
          hit: "\u{76f8}\u{4ea4}\u{ff1a}\u{539f}\u{70b9}\u{5728}\u{5355}\u{7eaf}\u{5f62}\u{5185}", run: "\u{8fdb}\u{884c}\u{4e2d}", depth: "EPA \u{6df1}\u{5ea6}", normal: "\u{6cd5}\u{7ebf}",
          mink: "\u{95f5}\u{53ef}\u{592b}\u{65af}\u{57fa}\u{5dee} A \u{2212} B", world: "\u{4e16}\u{754c}\u{7a7a}\u{95f4}" },
    ja: { hint: "A \u{307e}\u{305f}\u{306f} B \u{3092}\u{30c9}\u{30e9}\u{30c3}\u{30b0}", prev: "\u{25c0} \u{623b}\u{308b}", next: "\u{9032}\u{3080} \u{25b6}", all: "\u{5168}\u{90e8}", shape: "B \u{3092}\u{5909}\u{66f4}",
          iter: "GJK \u{53cd}\u{5fa9}", sep: "\u{5206}\u{96e2}\u{ff1a}\u{30b5}\u{30dd}\u{30fc}\u{30c8}\u{70b9}\u{304c}\u{539f}\u{70b9}\u{3092}\u{8d8a}\u{3048}\u{306a}\u{3044}",
          hit: "\u{4ea4}\u{5dee}\u{ff1a}\u{539f}\u{70b9}\u{304c}\u{5358}\u{4f53}\u{306e}\u{5185}\u{90e8}", run: "\u{5b9f}\u{884c}\u{4e2d}", depth: "EPA \u{6df1}\u{3055}", normal: "\u{6cd5}\u{7dda}",
          mink: "\u{30df}\u{30f3}\u{30b3}\u{30d5}\u{30b9}\u{30ad}\u{30fc}\u{5dee} A \u{2212} B", world: "\u{30ef}\u{30fc}\u{30eb}\u{30c9}" }
  };
  var COL = { A: "#1f77b4", B: "#ff7f0e", md: "#9467bd", mdFill: "rgba(148,103,189,0.12)", sx: "#d62728",
              d: "#2ca02c", grid: "#ececec", text: "#222", pen: "#d62728" };

  /* ---------- geometry ---------- */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function cross(a, b) { return a[0] * b[1] - a[1] * b[0]; }
  function neg(a) { return [-a[0], -a[1]]; }
  function triple(a, b, c) { var ac = dot(a, c), bc = dot(b, c); return [b[0] * ac - a[0] * bc, b[1] * ac - a[1] * bc]; }
  function support(P, d) { var bi = 0, bv = -1e30; for (var i = 0; i < P.length; i++) { var v = dot(P[i], d); if (v > bv) { bv = v; bi = i; } } return P[bi]; }
  function supportMD(A, B, d) { return sub(support(A, d), support(B, neg(d))); }
  function hull(P) {
    P = P.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function half(pts) { var h = []; pts.forEach(function (p) { while (h.length >= 2 && cross(sub(h[h.length - 1], h[h.length - 2]), sub(p, h[h.length - 2])) <= 0) h.pop(); h.push(p); }); return h; }
    var lo = half(P), up = half(P.slice().reverse());
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function doSimplex(s) {
    if (s.length === 2) {
      var b = s[0], a = s[1], ab = sub(b, a), ao = neg(a);
      if (dot(ab, ao) > 0) {
        var d = triple(ab, ao, ab);
        if (dot(d, d) < 1e-18) return { hit: true, s: [b, a], d: null };
        return { hit: false, s: [b, a], d: d };
      }
      return { hit: false, s: [a], d: ao };
    }
    var c = s[0], b2 = s[1], a2 = s[2], ab2 = sub(b2, a2), ac = sub(c, a2), ao2 = neg(a2);
    if (Math.abs(cross(ab2, ac)) < 1e-12) return doSimplex([b2, a2]);
    var abp = triple(ac, ab2, ab2), acp = triple(ab2, ac, ac);
    if (dot(abp, ao2) > 0) return { hit: false, s: [b2, a2], d: abp };
    if (dot(acp, ao2) > 0) return { hit: false, s: [c, a2], d: acp };
    return { hit: true, s: s, d: null };
  }
  function gjk(A, B) {
    var ca = centroid(A), cb = centroid(B), d = sub(ca, cb);
    if (dot(d, d) < 1e-18) d = [1, 0];
    var s = [supportMD(A, B, d)]; d = neg(s[0]);
    var hist = [{ s: s.slice(), d: d, p: null }];
    for (var it = 0; it < 32; it++) {
      if (dot(d, d) < 1e-18) return { hit: true, s: s, hist: hist };
      var p = supportMD(A, B, d);
      if (dot(p, d) <= 0) { hist.push({ s: s.slice(), d: d, p: p, stop: true }); return { hit: false, s: s, hist: hist }; }
      var r = doSimplex(s.concat([p]));
      s = r.s; hist.push({ s: s.slice(), d: r.d, p: p });
      if (r.hit) return { hit: true, s: s, hist: hist };
      d = r.d;
    }
    return { hit: false, s: s, hist: hist };
  }
  function epa(A, B, s) {
    var poly = s.slice();
    while (poly.length < 3) { var e = poly.length === 2 ? sub(poly[1], poly[0]) : [1, 0]; poly.push(supportMD(A, B, [-e[1], e[0]])); }
    if (cross(sub(poly[1], poly[0]), sub(poly[2], poly[0])) < 0) { var t = poly[1]; poly[1] = poly[2]; poly[2] = t; }
    var n = [1, 0], dist = 0;
    for (var it = 0; it < 64; it++) {
      var best = 1e30, bi = 0, bn = null;
      for (var i = 0; i < poly.length; i++) {
        var a = poly[i], b = poly[(i + 1) % poly.length], ed = sub(b, a), L = Math.hypot(ed[0], ed[1]);
        if (L < 1e-12) continue;
        var nn = [ed[1] / L, -ed[0] / L], dd = dot(nn, a);
        if (dd < best) { best = dd; bi = i; bn = nn; }
      }
      n = bn; dist = best;
      var p = supportMD(A, B, n);
      if (dot(p, n) - dist < 1e-7) break;
      poly.splice(bi + 1, 0, p);
    }
    return { n: n, depth: dist, poly: poly };
  }
  function centroid(P) { var x = 0, y = 0; P.forEach(function (p) { x += p[0]; y += p[1]; }); return [x / P.length, y / P.length]; }
  function inside(P, q) { for (var i = 0; i < P.length; i++) if (cross(sub(P[(i + 1) % P.length], P[i]), sub(q, P[i])) < 0) return false; return true; }
  function regular(n, r, cx, cy, rot) { var P = []; for (var i = 0; i < n; i++) { var t = rot + 2 * Math.PI * i / n; P.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } return P; }

  var SHAPES_B = [
    function (c) { return [[c[0] - 0.9, c[1] - 0.2], [c[0] + 1.4, c[1] - 0.7], [c[0] + 0.4, c[1] + 1.6]]; },
    function (c) { return regular(5, 1.1, c[0], c[1], 0.3); },
    function (c) { return [[c[0] - 1.3, c[1] - 0.5], [c[0] + 1.3, c[1] - 0.5], [c[0] + 1.3, c[1] + 0.5], [c[0] - 1.3, c[1] + 0.5]]; },
    function (c) { return regular(8, 0.95, c[0], c[1], 0.0); }
  ];

  function setup(el) {
    var lang = TXT[el.dataset.lang] ? el.dataset.lang : "en", T = TXT[lang];
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 6px 0;font:13px sans-serif";
    function btn(label, fn) { var b = document.createElement("button"); b.type = "button"; b.textContent = label;
      b.style.cssText = "padding:4px 10px;border:1px solid #bbb;border-radius:6px;background:#fff;color:#222;cursor:pointer;font:13px sans-serif";
      b.addEventListener("click", fn); bar.appendChild(b); return b; }
    var info = document.createElement("span"); info.style.cssText = "color:#444;margin-left:4px";
    var cv = document.createElement("canvas");
    cv.style.cssText = "display:block;width:100%;touch-action:pan-y;background:#fcfcfd;border-radius:6px";
    /* block page scrolling only when a touch starts inside the world view (where dragging happens) */
    cv.addEventListener("touchstart", function (e) {
      var t = e.touches[0], r = cv.getBoundingClientRect(), x = t.clientX - r.left, y = t.clientY - r.top, v = views()[0];
      if (x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h) e.preventDefault();
    }, { passive: false });
    el.appendChild(bar); el.appendChild(cv);
    var ctx = cv.getContext("2d");
    var A = [[-1.6, -1.0], [0.6, -1.3], [1.2, 0.6], [-0.9, 1.3]];
    var shapeIdx = 0, Bc = [1.2, 0.6], B = SHAPES_B[0](Bc);
    var step = 99, drag = null, last = null, W = 0, H = 0, narrow = false;
    var res = null, ep = null;

    btn(T.prev, function () { compute(); step = Math.max(0, Math.min(step, res.hist.length - 1) - 1); draw(); });
    btn(T.next, function () { compute(); step = Math.min(res.hist.length - 1, step + 1); draw(); });
    btn(T.all, function () { step = 99; draw(); });
    btn(T.shape, function () { shapeIdx = (shapeIdx + 1) % SHAPES_B.length; B = SHAPES_B[shapeIdx](centroid(B)); step = 99; draw(); });
    bar.appendChild(info);

    function compute() { res = gjk(A, B); ep = res.hit ? epa(A, B, res.s) : null; }
    function resize() {
      W = el.clientWidth || 600; narrow = W < 620;
      H = narrow ? Math.round(W * 1.55) : Math.max(340, Math.round(W * 0.5));
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
    }
    /* viewports: world (centered at 0,0, range +-4) and Minkowski (range +-5) */
    function views() {
      if (narrow) { var h2 = H / 2; return [{ x: 0, y: 0, w: W, h: h2, r: 3.6 }, { x: 0, y: h2, w: W, h: h2, r: 4.6 }]; }
      return [{ x: 0, y: 0, w: W / 2, h: H, r: 3.6 }, { x: W / 2, y: 0, w: W / 2, h: H, r: 4.6 }];
    }
    function px(v, p) { var s = Math.min(v.w, v.h) / (2 * v.r); return [v.x + v.w / 2 + p[0] * s, v.y + v.h / 2 - p[1] * s]; }
    function wp(v, q) { var s = Math.min(v.w, v.h) / (2 * v.r); return [(q[0] - v.x - v.w / 2) / s, -(q[1] - v.y - v.h / 2) / s]; }
    function poly(v, P, stroke, fill, lw, dash) {
      if (!P.length) return; ctx.beginPath(); var q = px(v, P[0]); ctx.moveTo(q[0], q[1]);
      for (var i = 1; i < P.length; i++) { q = px(v, P[i]); ctx.lineTo(q[0], q[1]); }
      if (P.length > 2) ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); ctx.setLineDash([]);
    }
    function arrow(v, a, b, col, lw) {
      var p0 = px(v, a), p1 = px(v, b), dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy); if (L < 2) return;
      var ux = dx / L, uy = dy / L, h = Math.min(12, L * 0.45);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw || 2.5;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0] - ux * h * 0.8, p1[1] - uy * h * 0.8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p1[0] - ux * h - uy * h * 0.45, p1[1] - uy * h + ux * h * 0.45);
      ctx.lineTo(p1[0] - ux * h + uy * h * 0.45, p1[1] - uy * h - ux * h * 0.45); ctx.closePath(); ctx.fill();
    }
    function dotAt(v, p, col, r) { var q = px(v, p); ctx.beginPath(); ctx.arc(q[0], q[1], r || 4.5, 0, 2 * Math.PI); ctx.fillStyle = col; ctx.fill(); }
    function frame(v, title) {
      ctx.save(); ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); ctx.clip();
      ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
      for (var g = -Math.ceil(v.r * 2); g <= Math.ceil(v.r * 2); g++) {
        var a = px(v, [g, -50]), b = px(v, [g, 50]); ctx.beginPath(); ctx.moveTo(a[0], v.y); ctx.lineTo(b[0], v.y + v.h); ctx.stroke();
        var c = px(v, [-50, g]); ctx.beginPath(); ctx.moveTo(v.x, c[1]); ctx.lineTo(v.x + v.w, c[1]); ctx.stroke();
      }
      ctx.fillStyle = "#555"; ctx.font = "13px sans-serif"; ctx.fillText(title, v.x + 8, v.y + 18);
    }
    function draw() {
      if (!W) return;
      compute();
      var V = views(), vw = V[0], vm = V[1], k = Math.min(step, res.hist.length - 1), last = k === res.hist.length - 1;
      ctx.clearRect(0, 0, W, H);
      /* world view */
      frame(vw, T.world);
      poly(vw, A, COL.A, "rgba(31,119,180,0.18)", 2.5);
      poly(vw, B, COL.B, "rgba(255,127,14,0.18)", 2.5);
      ctx.font = "bold 16px sans-serif"; var ca = px(vw, centroid(A)), cb = px(vw, centroid(B));
      ctx.fillStyle = COL.A; ctx.fillText("A", ca[0] - 5, ca[1] + 5); ctx.fillStyle = COL.B; ctx.fillText("B", cb[0] - 5, cb[1] + 5);
      if (ep && last) {
        var moved = B.map(function (p) { return [p[0] + ep.n[0] * ep.depth, p[1] + ep.n[1] * ep.depth]; });
        poly(vw, moved, COL.B, null, 1.5, [5, 4]);
        var c0 = centroid(B); arrow(vw, c0, [c0[0] + ep.n[0] * ep.depth, c0[1] + ep.n[1] * ep.depth], COL.pen, 3);
      }
      ctx.restore();
      if (!narrow) { ctx.strokeStyle = "#ddd"; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); }
      else { ctx.strokeStyle = "#ddd"; ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); }
      /* Minkowski view */
      frame(vm, T.mink);
      var MD = []; A.forEach(function (a) { B.forEach(function (b) { MD.push(sub(a, b)); }); });
      MD = hull(MD);
      poly(vm, MD, COL.md, COL.mdFill, 2);
      var o = px(vm, [0, 0]); ctx.strokeStyle = "#888"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(o[0] - 9, o[1]); ctx.lineTo(o[0] + 9, o[1]); ctx.moveTo(o[0], o[1] - 9); ctx.lineTo(o[0], o[1] + 9); ctx.stroke();
      dotAt(vm, [0, 0], "#111", 4); ctx.fillStyle = "#111"; ctx.font = "13px sans-serif"; ctx.fillText("O", o[0] + 6, o[1] - 6);
      var h = res.hist[k];
      if (ep && last) {
        poly(vm, ep.poly, COL.pen, "rgba(214,39,40,0.08)", 1.5, [4, 3]);
        arrow(vm, [0, 0], [ep.n[0] * ep.depth, ep.n[1] * ep.depth], COL.pen, 3);
      }
      poly(vm, h.s, COL.sx, h.s.length === 3 ? "rgba(214,39,40,0.15)" : null, 3);
      h.s.forEach(function (p) { dotAt(vm, p, COL.sx, 5.5); });
      if (h.p) { dotAt(vm, h.p, COL.d, 4); }
      if (h.d) { var L = Math.hypot(h.d[0], h.d[1]); if (L > 1e-9) arrow(vm, [0, 0], [h.d[0] / L * 1.3, h.d[1] / L * 1.3], COL.d, 2.5); ctx.fillStyle = COL.d; var dp = px(vm, [h.d[0] / L * 1.5, h.d[1] / L * 1.5]); ctx.fillText("d", dp[0], dp[1]); }
      ctx.restore();
      /* readout */
      var status = !last ? T.run : (res.hit ? T.hit : T.sep);
      var txt = T.iter + " " + k + "/" + (res.hist.length - 1) + " \u{00b7} " + status;
      if (ep && last) txt += " \u{00b7} " + T.depth + " = " + ep.depth.toFixed(3) + ", " + T.normal + " = (" + ep.n[0].toFixed(2) + ", " + ep.n[1].toFixed(2) + ")";
      info.textContent = txt;
      ctx.fillStyle = "#888"; ctx.font = "12px sans-serif"; var hw = ctx.measureText(T.hint).width;
      ctx.fillText(T.hint, vw.x + vw.w - hw - 8, vw.y + vw.h - 8);
    }
    function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    cv.addEventListener("pointerdown", function (e) {
      var p = pos(e), vw = views()[0], q = wp(vw, p);
      if (p[0] < vw.x || p[0] > vw.x + vw.w || p[1] < vw.y || p[1] > vw.y + vw.h) return;
      drag = inside(B, q) ? "B" : (inside(A, q) ? "A" : null);
      if (!drag) { var da = Math.hypot(q[0] - centroid(A)[0], q[1] - centroid(A)[1]), db = Math.hypot(q[0] - centroid(B)[0], q[1] - centroid(B)[1]);
        if (Math.min(da, db) < 1.2) drag = da < db ? "A" : "B"; }
      if (drag) { last = q; step = 99; cv.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    cv.addEventListener("pointermove", function (e) {
      if (!drag) return; var q = wp(views()[0], pos(e)), dx = q[0] - last[0], dy = q[1] - last[1]; last = q;
      var P = drag === "A" ? A : B; for (var i = 0; i < P.length; i++) { P[i] = [P[i][0] + dx, P[i][1] + dy]; }
      draw();
    });
    function up(e) { if (drag) { drag = null; try { cv.releasePointerCapture(e.pointerId); } catch (err) {} } }
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(el); else window.addEventListener("resize", resize);
    resize();
  }
  function init() {
    var els = document.querySelectorAll('[data-widget="graphics-engine-gjk"]');
    for (var i = 0; i < els.length; i++) if (!els[i].dataset.ready) { els[i].dataset.ready = "1"; setup(els[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
