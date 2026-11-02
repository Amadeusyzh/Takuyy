/* Where a ray meets a Gaussian (graphics post 13), in 2D.
   G(x) = exp(-q/2), q = (x - mu)^T Sigma^-1 (x - mu), mu = 0, Sigma = R diag(sx^2, sy^2) R^T.
   On the ray x(t) = o + t d:  t* = d^T Sigma^-1 (mu - o) / (d^T Sigma^-1 d),  G_max = exp(-q(t*)/2).
   Purple: the peak t*, where the ray is tangent to a level ellipse of the Gaussian.
   Grey: the closest point in ordinary distance, where the ray is tangent to a circle around mu.
   Defaults (sx = 2, sy = 1, o = (-4, -1), d through (-3, 0)) reproduce the post's worked example.
   Drag the square (ray origin) or the circle (direction handle). UI strings come from #gr-i18n. */
(function () {
  "use strict";
  var EN = { drag: "Drag the square (ray origin) or the circle (direction).", rot: "Rotation",
             peak: "peak", eucl: "closest point", reset: "Reset" };
  var PUR = "#9467bd", GRY = "#7f7f7f", DARK = "#222222";

  function strings() {
    var T = {}, k, s = document.getElementById("gr-i18n");
    for (k in EN) T[k] = EN[k];
    if (s) for (k in EN) { var v = s.getAttribute("data-" + k); if (v) T[k] = v; }
    return T;
  }
  function defaults() { return { rot: 0, sx: 2, sy: 1, o: [-4, -1], h: [-3, 0] }; }

  function setup(el) {
    var T = strings(), st = defaults();
    el.innerHTML = "";
    el.style.background = "#fff"; el.style.color = DARK;
    el.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif"; el.style.fontSize = "14px";
    var ui = document.createElement("div");
    ui.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 10px 4px";
    el.appendChild(ui);
    var syncs = [];
    function slider(label, min, max, step, key, fmt) {
      var g = document.createElement("label"); g.style.cssText = "display:flex;align-items:center;gap:5px";
      var s = document.createElement("span"); s.textContent = label; s.style.color = "#555";
      var r = document.createElement("input"); r.type = "range"; r.min = min; r.max = max; r.step = step;
      r.style.cssText = "width:110px;accent-color:" + PUR;
      var o = document.createElement("span"); o.style.cssText = "min-width:2.8em;font-variant-numeric:tabular-nums";
      r.addEventListener("input", function () { st[key] = parseFloat(r.value); o.textContent = fmt(st[key]); draw(); });
      g.appendChild(s); g.appendChild(r); g.appendChild(o); ui.appendChild(g);
      syncs.push(function () { r.value = st[key]; o.textContent = fmt(st[key]); });
    }
    var DEG = String.fromCharCode(176), SIG = String.fromCharCode(963);   // degree sign, sigma
    slider(T.rot, 0, 180, 1, "rot", function (v) { return Math.round(v) + DEG; });
    slider(SIG + "x", 0.3, 2.5, 0.05, "sx", function (v) { return v.toFixed(2); });
    slider(SIG + "y", 0.3, 2.5, 0.05, "sy", function (v) { return v.toFixed(2); });
    var rb = document.createElement("button"); rb.type = "button"; rb.textContent = T.reset;
    rb.style.cssText = "border:1px solid " + PUR + ";color:" + PUR + ";background:#fff;border-radius:6px;padding:3px 10px;cursor:pointer;font:inherit";
    rb.addEventListener("click", function () { st = defaults(); syncs.forEach(function (f) { f(); }); draw(); });
    ui.appendChild(rb);

    var cv = document.createElement("canvas");
    cv.style.cssText = "display:block;width:100%;touch-action:none;cursor:crosshair";
    el.appendChild(cv);
    var hint = document.createElement("div"); hint.style.cssText = "padding:2px 10px 8px;font-size:12px;color:#666";
    hint.textContent = T.drag; el.appendChild(hint);
    var ctx = cv.getContext("2d");
    var W = 0, Hs = 0, Hp = 130, H = 0, sc = 1, cx = 0, cy = 0;

    function resize() {
      W = el.clientWidth || 600;
      Hs = Math.round(Math.min(340, Math.max(230, W * 0.6)));
      H = Hs + Hp;
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sc = Math.min(W / 9.6, Hs / 6.4); cx = W / 2; cy = Hs / 2;
    }
    function toS(p) { return [cx + p[0] * sc, cy - p[1] * sc]; }
    function toW(x, y) { return [(x - cx) / sc, (cy - y) / sc]; }

    function model() {
      var a = st.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      var ax = 1 / (st.sx * st.sx), ay = 1 / (st.sy * st.sy);
      var i11 = c * c * ax + s * s * ay, i22 = s * s * ax + c * c * ay, i12 = c * s * (ax - ay);
      function bil(u, v) { return i11 * u[0] * v[0] + i12 * (u[0] * v[1] + u[1] * v[0]) + i22 * u[1] * v[1]; }
      var dx = st.h[0] - st.o[0], dy = st.h[1] - st.o[1], L = Math.hypot(dx, dy) || 1;
      var d = [dx / L, dy / L], mo = [-st.o[0], -st.o[1]];
      var ts = bil(d, mo) / bil(d, d), te = d[0] * mo[0] + d[1] * mo[1];
      function at(t) { return [st.o[0] + t * d[0], st.o[1] + t * d[1]]; }
      function G(t) { var x = at(t); return Math.exp(-0.5 * bil(x, x)); }
      return { c: c, s: s, d: d, ts: ts, te: te, at: at, G: G, q: function (x) { return bil(x, x); } };
    }

    function ellipse(m, k, stroke, fill, dash, lw) {
      ctx.beginPath();
      for (var i = 0; i <= 96; i++) {
        var ph = 2 * Math.PI * i / 96, u = k * st.sx * Math.cos(ph), v = k * st.sy * Math.sin(ph);
        var p = toS([m.c * u - m.s * v, m.s * u + m.c * v]);
        if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
      }
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      ctx.setLineDash(dash || []); ctx.lineWidth = lw || 1.2; ctx.strokeStyle = stroke; ctx.stroke(); ctx.setLineDash([]);
    }
    function dot(p, r, col, square) {
      var s = toS(p);
      ctx.beginPath();
      if (square) ctx.rect(s[0] - r, s[1] - r, 2 * r, 2 * r); else ctx.arc(s[0], s[1], r, 0, 2 * Math.PI);
      ctx.fillStyle = col; ctx.fill();
    }

    function draw() {
      var m = model(), font = "system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      // grid
      ctx.strokeStyle = "#eeeeee"; ctx.lineWidth = 1;
      for (var g = -6; g <= 6; g++) {
        var a = toS([g, -4]), b = toS([g, 4]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        a = toS([-6, g]); b = toS([6, g]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ellipse(m, 1, PUR, "rgba(148,103,189,0.22)", null, 1.6);
      ellipse(m, 2, PUR, "rgba(148,103,189,0.08)", null, 1);
      ellipse(m, 3, "rgba(148,103,189,0.5)", null, null, 1);
      // tangent level ellipse at the peak, tangent circle at the Euclidean point
      var P = m.at(m.ts), E = m.at(m.te), kq = Math.sqrt(Math.max(m.q(P), 0));
      ellipse(m, kq, PUR, null, [5, 4], 1.8);
      var rE = Math.hypot(E[0], E[1]), c0 = toS([0, 0]);
      ctx.beginPath(); ctx.arc(c0[0], c0[1], rE * sc, 0, 2 * Math.PI); ctx.setLineDash([3, 4]);
      ctx.strokeStyle = GRY; ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([]);
      dot([0, 0], 3, DARK);
      // ray
      var o = toS(st.o), far = toS(m.at(30));
      ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(far[0], far[1]); ctx.strokeStyle = DARK; ctx.lineWidth = 2; ctx.stroke();
      dot(st.o, 6, DARK, true);
      var hs = toS(st.h); ctx.beginPath(); ctx.arc(hs[0], hs[1], 7, 0, 2 * Math.PI);
      ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = DARK; ctx.stroke();
      if (m.te > 0) dot(E, 5, GRY);
      if (m.ts > 0) dot(P, 6, PUR);
      // separator and plot
      ctx.fillStyle = "#fff"; ctx.fillRect(0, Hs, W, Hp);
      ctx.strokeStyle = "#dddddd"; ctx.beginPath(); ctx.moveTo(0, Hs + 0.5); ctx.lineTo(W, Hs + 0.5); ctx.stroke();
      var px0 = 34, px1 = W - 12, py0 = Hs + 14, py1 = Hs + Hp - 24;
      var tmax = Math.min(16, Math.max(6, 1.6 * Math.max(m.ts, m.te) + 1));
      function X(t) { return px0 + (px1 - px0) * t / tmax; }
      function Y(v) { return py1 - (py1 - py0) * v; }
      ctx.strokeStyle = "#999"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px0, py1); ctx.lineTo(px1, py1); ctx.stroke();
      ctx.fillStyle = "#555"; ctx.font = "11px " + font; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText("1", px0 - 5, Y(1)); ctx.fillText("0", px0 - 5, Y(0));
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (var tt = 0; tt <= tmax; tt += (tmax > 10 ? 4 : 2)) ctx.fillText(String(tt), X(tt), py1 + 4);
      ctx.textAlign = "right"; ctx.fillText("t", px1, py1 + 4);
      ctx.beginPath();
      for (var i = 0; i <= 240; i++) { var t = tmax * i / 240, y = Y(m.G(t)); if (i) ctx.lineTo(X(t), y); else ctx.moveTo(X(t), y); }
      ctx.strokeStyle = PUR; ctx.lineWidth = 2.2; ctx.stroke();
      function mark(t, col, lab, up) {
        if (t <= 0 || t > tmax) return;
        var v = m.G(t);
        ctx.strokeStyle = col; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(X(t), py1); ctx.lineTo(X(t), Y(v)); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(X(t), Y(v), 4, 0, 2 * Math.PI); ctx.fillStyle = col; ctx.fill();
        ctx.font = "12px " + font; ctx.textBaseline = "middle";
        var txt = lab + "  t=" + t.toFixed(2) + "  G=" + v.toFixed(3), w = ctx.measureText(txt).width;
        var tx = Math.min(Math.max(X(t) + 8, px0 + 4), px1 - w), ty = up ? py0 + 2 : py0 + 18;
        ctx.textAlign = "left"; ctx.fillStyle = col; ctx.fillText(txt, tx, ty);
      }
      mark(m.ts, PUR, T.peak + " t*", true);
      mark(m.te, GRY, T.eucl, false);
    }

    var drag = null;
    function pt(e) { var b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
    cv.addEventListener("pointerdown", function (e) {
      var p = pt(e); if (p[1] > Hs) return;
      var so = toS(st.o), sh = toS(st.h);
      var dO = Math.hypot(p[0] - so[0], p[1] - so[1]), dH = Math.hypot(p[0] - sh[0], p[1] - sh[1]);
      drag = dO < dH && dO < 30 ? "o" : "h";
      st[drag] = toW(p[0], p[1]);
      cv.setPointerCapture(e.pointerId); draw();
    });
    cv.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var p = pt(e), w = toW(p[0], Math.min(p[1], Hs - 2));
      w[0] = Math.max(-6, Math.min(6, w[0])); w[1] = Math.max(-4, Math.min(4, w[1]));
      var other = drag === "o" ? st.h : st.o;
      if (Math.hypot(w[0] - other[0], w[1] - other[1]) > 0.05) { st[drag] = w; draw(); }
    });
    function end() { drag = null; }
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);

    syncs.forEach(function (f) { f(); });
    resize(); draw();
    var lastW = el.clientWidth;
    window.addEventListener("resize", function () { if (el.clientWidth !== lastW) { lastW = el.clientWidth; resize(); draw(); } });
  }

  function init() { document.querySelectorAll('[data-widget="graphics-gaussian-ray"]').forEach(setup); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
