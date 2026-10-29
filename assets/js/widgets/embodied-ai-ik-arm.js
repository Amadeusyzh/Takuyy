/* Embodied AI post 01: drag an IK target for a planar 3-link arm.
   Damped least squares on the position task, dq = J^T (J J^T + lam^2 I)^-1 e, a few steps per frame,
   with the velocity ellipse {J_p qdot : |qdot| <= 1} drawn at the end effector.
   Plain JS + Canvas 2D, no dependencies. Frame: x right, y up, angles counter-clockwise. */
(function () {
  "use strict";
  var NAME = "embodied-ai-ik-arm";
  var TXT = {
    en: { lam: "damping \u03bb", reset: "Reset", res: "residual", w: "w(J_p)", hint: "drag the orange target", iters: "steps/frame" },
    zh: { lam: "\u963b\u5c3c \u03bb", reset: "\u91cd\u7f6e", res: "\u6b8b\u5dee", w: "w(J_p)", hint: "\u62d6\u52a8\u6a59\u8272\u76ee\u6807", iters: "\u6bcf\u5e27\u8fed\u4ee3" },
    ja: { lam: "\u6e1b\u8870 \u03bb", reset: "\u30ea\u30bb\u30c3\u30c8", res: "\u6b8b\u5dee", w: "w(J_p)", hint: "\u6a59\u8272\u306e\u76ee\u6a19\u3092\u30c9\u30e9\u30c3\u30b0", iters: "\u53cd\u5fa9/\u30d5\u30ec\u30fc\u30e0" }
  };
  var LINKS = [1.0, 0.8, 0.5];

  function fk(q) {
    var pts = [[0, 0]], c = 0, x = 0, y = 0;
    for (var i = 0; i < 3; i++) {
      c += q[i];
      x += LINKS[i] * Math.cos(c);
      y += LINKS[i] * Math.sin(c);
      pts.push([x, y]);
    }
    return pts;
  }

  function jac(q) { // 2 x 3 position Jacobian
    var c = [q[0], q[0] + q[1], q[0] + q[1] + q[2]];
    var J = [[0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) {
      for (var k = i; k < 3; k++) {
        J[0][i] -= LINKS[k] * Math.sin(c[k]);
        J[1][i] += LINKS[k] * Math.cos(c[k]);
      }
    }
    return J;
  }

  function dlsStep(q, target, lam) {
    var p = fk(q)[3];
    var e = [target[0] - p[0], target[1] - p[1]];
    var J = jac(q);
    // A = J J^T + lam^2 I (2x2), solve A y = e, dq = J^T y
    var a = 0, b = 0, d = 0;
    for (var i = 0; i < 3; i++) { a += J[0][i] * J[0][i]; b += J[0][i] * J[1][i]; d += J[1][i] * J[1][i]; }
    a += lam * lam; d += lam * lam;
    var det = a * d - b * b;
    var y0 = (d * e[0] - b * e[1]) / det, y1 = (-b * e[0] + a * e[1]) / det;
    for (i = 0; i < 3; i++) q[i] += J[0][i] * y0 + J[1][i] * y1;
    return Math.hypot(e[0], e[1]);
  }

  function ellipse(J) { // eigen-decomposition of J J^T (2x2 symmetric)
    var a = 0, b = 0, d = 0;
    for (var i = 0; i < 3; i++) { a += J[0][i] * J[0][i]; b += J[0][i] * J[1][i]; d += J[1][i] * J[1][i]; }
    var tr = a + d, disc = Math.sqrt(Math.max(0, (a - d) * (a - d) / 4 + b * b));
    var l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
    var ang = 0.5 * Math.atan2(2 * b, a - d);
    return { s1: Math.sqrt(l1), s2: Math.sqrt(l2), ang: ang, w: Math.sqrt(Math.max(0, a * d - b * b)) };
  }

  function el(tag, css, parent) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (parent) parent.appendChild(n);
    return n;
  }

  function init(root) {
    var T = TXT[root.dataset.lang] || TXT.en;
    root.style.background = "#fafafa";
    root.style.minHeight = "0";
    root.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', sans-serif";
    var canvas = el("canvas", "display:block;width:100%;touch-action:none;cursor:crosshair;", root);
    var bar = el("div", "display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 10px;font-size:14px;color:#222;border-top:1px solid #e3e3e3;background:#fff;", root);
    var lamLab = el("label", "display:flex;align-items:center;gap:6px;", bar);
    lamLab.appendChild(document.createTextNode(T.lam));
    var slider = el("input", "width:120px;", lamLab);
    slider.type = "range"; slider.min = "-2"; slider.max = "0"; slider.step = "0.01"; slider.value = String(Math.log10(0.1));
    var lamVal = el("span", "min-width:3.2em;font-variant-numeric:tabular-nums;", lamLab);
    var btn = el("button", "padding:3px 10px;border:1px solid #bbb;border-radius:5px;background:#f3f3f3;cursor:pointer;font-size:14px;", bar);
    btn.textContent = T.reset;
    var info = el("span", "font-variant-numeric:tabular-nums;color:#444;", bar);

    var q = [0.3, 0.5, 0.4];
    var target = [1.2, 0.9];
    var trail = [];
    var W = 0, H = 0, S = 1, ox = 0, oy = 0, dpr = 1;
    var dragging = false, running = true, visible = true, lastRes = 1;

    function lam() { return Math.pow(10, parseFloat(slider.value)); }
    function toPx(p) { return [ox + p[0] * S, oy - p[1] * S]; }
    function toWorld(px, py) { return [(px - ox) / S, (oy - py) / S]; }

    function resize() {
      dpr = window.devicePixelRatio || 1;
      W = root.clientWidth;
      H = Math.max(300, Math.min(420, Math.round(W * 0.9)));
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.height = H + "px";
      S = Math.min(W, H) / 5.1;
      ox = W / 2; oy = H / 2;
      draw();
    }

    function draw() {
      var g = canvas.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#fafafa"; g.fillRect(0, 0, W, H);
      // grid
      g.strokeStyle = "#e6e6e6"; g.lineWidth = 1;
      for (var v = -3; v <= 3; v += 0.5) {
        var a = toPx([v, 0]), b = toPx([0, v]);
        g.beginPath(); g.moveTo(a[0], 0); g.lineTo(a[0], H); g.stroke();
        g.beginPath(); g.moveTo(0, b[1]); g.lineTo(W, b[1]); g.stroke();
      }
      // axes
      var o = toPx([0, 0]);
      g.lineWidth = 2;
      g.strokeStyle = "#d62728"; g.beginPath(); g.moveTo(o[0], o[1]); g.lineTo(o[0] + 0.5 * S, o[1]); g.stroke();
      g.strokeStyle = "#2ca02c"; g.beginPath(); g.moveTo(o[0], o[1]); g.lineTo(o[0], o[1] - 0.5 * S); g.stroke();
      g.font = "13px sans-serif"; g.fillStyle = "#d62728"; g.fillText("x", o[0] + 0.5 * S + 4, o[1] + 4);
      g.fillStyle = "#2ca02c"; g.fillText("y", o[0] - 4, o[1] - 0.5 * S - 6);
      // reach circle
      g.setLineDash([6, 5]); g.strokeStyle = "#999"; g.lineWidth = 1.5;
      g.beginPath(); g.arc(o[0], o[1], 2.3 * S, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]);
      // trail
      if (trail.length > 1) {
        g.strokeStyle = "rgba(34,34,34,0.35)"; g.lineWidth = 1.5; g.beginPath();
        for (var i = 0; i < trail.length; i++) { var t = toPx(trail[i]); if (i) g.lineTo(t[0], t[1]); else g.moveTo(t[0], t[1]); }
        g.stroke();
      }
      var pts = fk(q), ee = toPx(pts[3]);
      // velocity ellipse (scaled 0.25)
      var E = ellipse(jac(q)), sc = 0.25 * S;
      g.save(); g.translate(ee[0], ee[1]); g.rotate(-E.ang);
      g.beginPath(); g.ellipse(0, 0, Math.max(E.s1 * sc, 0.5), Math.max(E.s2 * sc, 0.5), 0, 0, 2 * Math.PI);
      g.fillStyle = "rgba(148,103,189,0.22)"; g.fill(); g.strokeStyle = "#9467bd"; g.lineWidth = 2; g.stroke();
      g.restore();
      // arm
      g.lineCap = "round"; g.strokeStyle = "#222"; g.lineWidth = Math.max(5, S * 0.07);
      g.beginPath();
      for (i = 0; i < 4; i++) { var p = toPx(pts[i]); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }
      g.stroke();
      for (i = 0; i < 3; i++) {
        p = toPx(pts[i]);
        g.beginPath(); g.arc(p[0], p[1], 6, 0, 2 * Math.PI); g.fillStyle = "#fff"; g.fill();
        g.lineWidth = 2.5; g.strokeStyle = "#222"; g.stroke();
      }
      g.beginPath(); g.arc(ee[0], ee[1], 5, 0, 2 * Math.PI); g.fillStyle = "#222"; g.fill();
      g.fillStyle = "#222"; g.fillRect(o[0] - 9, o[1] - 9, 18, 18);
      // target
      var tp = toPx(target);
      g.beginPath(); g.arc(tp[0], tp[1], 11, 0, 2 * Math.PI);
      g.fillStyle = "rgba(255,127,14,0.85)"; g.fill(); g.lineWidth = 2; g.strokeStyle = "#a04d00"; g.stroke();
      g.beginPath(); g.moveTo(tp[0] - 5, tp[1]); g.lineTo(tp[0] + 5, tp[1]); g.moveTo(tp[0], tp[1] - 5); g.lineTo(tp[0], tp[1] + 5);
      g.strokeStyle = "#fff"; g.stroke();
      g.fillStyle = "#666"; g.font = "13px sans-serif";
      g.fillText(T.hint, 8, 18);
      lamVal.textContent = lam().toFixed(lam() < 0.1 ? 3 : 2);
      info.textContent = T.res + " " + lastRes.toFixed(3) + "   " + T.w + " " + E.w.toFixed(3) +
        "   q = (" + q.map(function (v) { return v.toFixed(2); }).join(", ") + ")";
    }

    function tick() {
      if (running && visible) {
        var r = 0;
        for (var k = 0; k < 3; k++) r = dlsStep(q, target, lam());
        for (k = 0; k < 3; k++) q[k] = Math.atan2(Math.sin(q[k]), Math.cos(q[k]));
        lastRes = r;
        var ee = fk(q)[3];
        var last = trail[trail.length - 1];
        if (!last || Math.hypot(last[0] - ee[0], last[1] - ee[1]) > 0.005) { trail.push(ee); if (trail.length > 300) trail.shift(); }
        draw();
      }
      window.requestAnimationFrame(tick);
    }

    function pointer(ev) {
      var r = canvas.getBoundingClientRect();
      target = toWorld(ev.clientX - r.left, ev.clientY - r.top);
    }
    canvas.addEventListener("pointerdown", function (ev) { dragging = true; canvas.setPointerCapture(ev.pointerId); pointer(ev); ev.preventDefault(); });
    canvas.addEventListener("pointermove", function (ev) { if (dragging) pointer(ev); });
    canvas.addEventListener("pointerup", function () { dragging = false; });
    canvas.addEventListener("pointercancel", function () { dragging = false; });
    slider.addEventListener("input", draw);
    btn.addEventListener("click", function () { q = [0.3, 0.5, 0.4]; target = [1.2, 0.9]; trail = []; draw(); });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(root);
    }
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
    window.requestAnimationFrame(tick);
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-widget="' + NAME + '"]');
    for (var i = 0; i < nodes.length; i++) if (!nodes[i].dataset.ready) { nodes[i].dataset.ready = "1"; init(nodes[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
