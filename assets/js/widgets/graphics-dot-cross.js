/* Dot and cross product explorer (graphics post 01).
   Drag the tips of a and b. Shows a.b = |a||b|cos(theta), the projection of a onto b,
   and the cross product a x b = (0, 0, a_x b_y - a_y b_x) as the signed parallelogram area.
   Right-handed axes: x right, y up, z out of the screen. */
(function () {
  "use strict";
  var TXT = {
    en: { hint: "Drag the tips of a and b", proj: "projection of a onto b", out: "a\xd7b points out of the screen (+z)",
          into: "a\xd7b points into the screen (\u2212z)", par: "a \u2225 b: a\xd7b = 0", area: "area" },
    zh: { hint: "\u62d6\u52a8 a \u548c b \u7684\u7bad\u5934\u7aef\u70b9", proj: "a \u5728 b \u4e0a\u7684\u6295\u5f71", out: "a\xd7b \u6307\u5411\u5c4f\u5e55\u5916 (+z)",
          into: "a\xd7b \u6307\u5411\u5c4f\u5e55\u5185 (\u2212z)", par: "a \u2225 b\uff1aa\xd7b = 0", area: "\u9762\u79ef" },
    ja: { hint: "a \u3068 b \u306e\u77e2\u5370\u306e\u5148\u7aef\u3092\u30c9\u30e9\u30c3\u30b0", proj: "a \u306e b \u3078\u306e\u5c04\u5f71", out: "a\xd7b \u306f\u753b\u9762\u306e\u624b\u524d\u5411\u304d (+z)",
          into: "a\xd7b \u306f\u753b\u9762\u306e\u5965\u5411\u304d (\u2212z)", par: "a \u2225 b\uff1aa\xd7b = 0", area: "\u9762\u7a4d" }
  };
  var COL = { a: "#9467bd", b: "#ff7f0e", pos: "rgba(31,119,180,0.18)", neg: "rgba(214,39,40,0.16)",
              posL: "#1f77b4", negL: "#d62728", grid: "#e6e6e6", axis: "#999", text: "#222", proj: "#222" };

  function setup(el) {
    var lang = TXT[el.dataset.lang] ? el.dataset.lang : "en";
    var T = TXT[lang];
    var cv = document.createElement("canvas");
    cv.style.display = "block"; cv.style.width = "100%"; cv.style.touchAction = "none"; cv.style.background = "#fcfcfd";
    el.appendChild(cv);
    var ctx = cv.getContext("2d");
    var a = [3, 1], b = [1, 2.5];
    var W = 0, H = 0, S = 40, ox = 0, oy = 0, drag = null;

    function resize() {
      W = el.clientWidth || 600;
      H = Math.max(parseInt(el.style.minHeight, 10) || 380, 320);
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      S = Math.min(W / 9, H / 7.2);
      ox = W < 560 ? W / 2 : W * 0.42; oy = H * 0.6;
      draw();
    }
    function toPx(v) { return [ox + v[0] * S, oy - v[1] * S]; }
    function toW(px, py) { return [(px - ox) / S, (oy - py) / S]; }
    function fmt(x) { var s = (Math.abs(x) < 0.005 ? 0 : x).toFixed(2); return s; }

    function arrow(v, col, lw, from) {
      var p0 = toPx(from || [0, 0]), p1 = toPx([(from ? from[0] : 0) + v[0], (from ? from[1] : 0) + v[1]]);
      var dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy);
      if (L < 1) return;
      var ux = dx / L, uy = dy / L, h = Math.min(14, L * 0.4);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0] - ux * h * 0.8, p1[1] - uy * h * 0.8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p1[0] - ux * h - uy * h * 0.45, p1[1] - uy * h + ux * h * 0.45);
      ctx.lineTo(p1[0] - ux * h + uy * h * 0.45, p1[1] - uy * h - ux * h * 0.45);
      ctx.closePath(); ctx.fill();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.font = "13px sans-serif";
      // grid and axes
      var x0 = Math.floor(-ox / S), x1 = Math.ceil((W - ox) / S), y0 = Math.floor(-(H - oy) / S), y1 = Math.ceil(oy / S);
      ctx.lineWidth = 1; ctx.strokeStyle = COL.grid;
      for (var i = x0; i <= x1; i++) { var p = toPx([i, 0]); ctx.beginPath(); ctx.moveTo(p[0], 0); ctx.lineTo(p[0], H); ctx.stroke(); }
      for (var j = y0; j <= y1; j++) { var q = toPx([0, j]); ctx.beginPath(); ctx.moveTo(0, q[1]); ctx.lineTo(W, q[1]); ctx.stroke(); }
      ctx.strokeStyle = COL.axis; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke();
      ctx.fillStyle = "#d62728"; ctx.fillText("x", W - 14, oy - 6);
      ctx.fillStyle = "#2ca02c"; ctx.fillText("y", ox + 6, 14);

      var dot = a[0] * b[0] + a[1] * b[1];
      var cz = a[0] * b[1] - a[1] * b[0];
      var la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
      var th = (la > 1e-9 && lb > 1e-9) ? Math.acos(Math.max(-1, Math.min(1, dot / (la * lb)))) : 0;

      // parallelogram spanned by a and b (signed area = cross z)
      var P = [toPx([0, 0]), toPx(a), toPx([a[0] + b[0], a[1] + b[1]]), toPx(b)];
      ctx.fillStyle = cz >= 0 ? COL.pos : COL.neg;
      ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
      for (var k = 1; k < 4; k++) ctx.lineTo(P[k][0], P[k][1]);
      ctx.closePath(); ctx.fill();
      ctx.setLineDash([5, 4]); ctx.strokeStyle = cz >= 0 ? COL.posL : COL.negL; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(P[1][0], P[1][1]); ctx.lineTo(P[2][0], P[2][1]); ctx.lineTo(P[3][0], P[3][1]); ctx.stroke();
      ctx.setLineDash([]);

      // projection of a onto b
      if (lb > 1e-6) {
        var s = dot / (lb * lb), pr = [b[0] * s, b[1] * s];
        var e = toPx(pr), o = toPx([0, 0]), A = toPx(a);
        // extend the line of b faintly so negative projections are visible
        var bb = [b[0] / lb, b[1] / lb], f0 = toPx([-bb[0] * 20, -bb[1] * 20]), f1 = toPx([bb[0] * 20, bb[1] * 20]);
        ctx.strokeStyle = "rgba(255,127,14,0.25)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(f0[0], f0[1]); ctx.lineTo(f1[0], f1[1]); ctx.stroke();
        ctx.strokeStyle = "rgba(34,34,34,0.55)"; ctx.lineWidth = 7; ctx.lineCap = "butt";
        ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
        ctx.setLineDash([4, 4]); ctx.strokeStyle = "#777"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(e[0], e[1]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = COL.proj; ctx.font = "12px sans-serif";
        ctx.fillText(T.proj, e[0] + 8, e[1] + 16);
      }
      // angle arc from b to a
      if (la > 1e-6 && lb > 1e-6) {
        var angA = Math.atan2(a[1], a[0]), angB = Math.atan2(b[1], b[0]);
        var r = Math.min(30, 0.35 * Math.min(la, lb) * S);
        ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.arc(ox, oy, r, -angB, -angA, cz < 0); ctx.stroke();
        var mid = angB + (cz >= 0 ? -1 : 1) * th / 2;
        ctx.fillStyle = "#222"; ctx.font = "italic 15px serif";
        ctx.fillText("\u03b8", ox + Math.cos(mid) * (r + 10) - 4, oy - Math.sin(mid) * (r + 10) + 5);
      }
      arrow(a, COL.a, 3.2); arrow(b, COL.b, 3.2);
      ctx.font = "bold 16px sans-serif";
      var pa = toPx(a), pb = toPx(b);
      ctx.fillStyle = COL.a; ctx.fillText("a", pa[0] + 8, pa[1] - 8);
      ctx.fillStyle = COL.b; ctx.fillText("b", pb[0] + 8, pb[1] - 8);
      // handles
      [[pa, COL.a], [pb, COL.b]].forEach(function (h) {
        ctx.beginPath(); ctx.arc(h[0][0], h[0][1], 9, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fill(); ctx.strokeStyle = h[1]; ctx.lineWidth = 2; ctx.stroke();
      });

      // read-out panel
      var lines = [
        ["a = (" + fmt(a[0]) + ", " + fmt(a[1]) + ", 0)", COL.a],
        ["b = (" + fmt(b[0]) + ", " + fmt(b[1]) + ", 0)", COL.b],
        ["a\xb7b = " + fmt(dot) + " = |a||b|cos\u03b8", COL.text],
        ["|a| = " + fmt(la) + ", |b| = " + fmt(lb) + ", \u03b8 = " + (th * 180 / Math.PI).toFixed(1) + "\xb0", COL.text],
        ["a\xd7b = (0, 0, " + fmt(cz) + ")", cz >= 0 ? COL.posL : COL.negL],
        [T.area + " = |a\xd7b| = |a||b|sin\u03b8 = " + fmt(Math.abs(cz)), COL.text],
        [Math.abs(cz) < 0.005 ? T.par : (cz > 0 ? T.out : T.into), cz >= 0 ? COL.posL : COL.negL]
      ];
      var fs = W < 480 ? 12 : 14, lh = fs + 5, pw = 0;
      ctx.font = fs + "px sans-serif";
      lines.forEach(function (l) { pw = Math.max(pw, ctx.measureText(l[0]).width); });
      ctx.fillStyle = "rgba(255,255,255,0.88)"; ctx.fillRect(6, 6, pw + 16, lh * lines.length + 10);
      ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1; ctx.strokeRect(6, 6, pw + 16, lh * lines.length + 10);
      lines.forEach(function (l, i) { ctx.fillStyle = l[1]; ctx.fillText(l[0], 14, 6 + lh * (i + 1)); });
      // z-direction symbol: dot = out of the screen, cross = into the screen
      var sx = W - 34, sy = 34;
      ctx.strokeStyle = cz >= 0 ? COL.posL : COL.negL; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(sx, sy, 18, 0, 2 * Math.PI); ctx.stroke();
      if (Math.abs(cz) >= 0.005) {
        if (cz > 0) { ctx.fillStyle = COL.posL; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 2 * Math.PI); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(sx - 11, sy - 11); ctx.lineTo(sx + 11, sy + 11); ctx.moveTo(sx + 11, sy - 11); ctx.lineTo(sx - 11, sy + 11); ctx.stroke(); }
      }
      ctx.fillStyle = "#666"; ctx.font = "12px sans-serif";
      ctx.fillText("z", sx + 20, sy + 20);
      ctx.fillStyle = "#888"; ctx.font = "12px sans-serif";
      var hw = ctx.measureText(T.hint).width;
      ctx.fillText(T.hint, W - hw - 10, H - 10);
    }

    function pick(px, py) {
      var pa = toPx(a), pb = toPx(b);
      var da = Math.hypot(px - pa[0], py - pa[1]), db = Math.hypot(px - pb[0], py - pb[1]);
      var m = Math.min(da, db);
      if (m > 28) return null;
      return da <= db ? "a" : "b";
    }
    function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    cv.addEventListener("pointerdown", function (e) {
      var p = pos(e); drag = pick(p[0], p[1]);
      if (drag) { cv.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    cv.addEventListener("pointermove", function (e) {
      var p = pos(e);
      if (!drag) { cv.style.cursor = pick(p[0], p[1]) ? "grab" : "default"; return; }
      var w = toW(p[0], p[1]);
      var v = [Math.round(w[0] * 10) / 10, Math.round(w[1] * 10) / 10];  // snap to 0.1
      if (drag === "a") a = v; else b = v;
      draw();
    });
    function up(e) { if (drag) { drag = null; try { cv.releasePointerCapture(e.pointerId); } catch (err) {} } }
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(el); else window.addEventListener("resize", resize);
    resize();
  }

  function init() {
    var els = document.querySelectorAll('[data-widget="graphics-dot-cross"]');
    for (var i = 0; i < els.length; i++) if (!els[i].dataset.ready) { els[i].dataset.ready = "1"; setup(els[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
