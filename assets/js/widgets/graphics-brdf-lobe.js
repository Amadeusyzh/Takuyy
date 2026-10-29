/* BRDF lobe explorer (graphics post 04). Plain JS + Canvas 2D, no dependencies.
   Plots f_r(wi, wo) cos(theta_o) in the plane of incidence for the metallic-roughness model:
   f_r = (1 - F) c_diff / pi + D V F, with GGX D, height-correlated Smith V, Schlick F,
   F0 = lerp(0.04, baseColor, metallic), c_diff = (1 - metallic) baseColor, alpha = roughness^2.
   Embedded with _includes/widget.liquid, name "graphics-brdf-lobe". */
(function () {
  "use strict";
  var TXT = {
    en: { rough: "roughness r", metal: "metallic", theta: "light angle \u03b8i", diff: "diffuse", spec: "specular",
          total: "total", drag: "drag to move the light", albedo: "albedo", scale: "lobes scaled to peak f\u00b7cos =",
          base: "baseColor = 0.8 (gray)", mirror: "mirror" },
    zh: { rough: "\u7c97\u7cd9\u5ea6 r", metal: "\u91d1\u5c5e\u5ea6 metallic", theta: "\u5149\u6e90\u89d2\u5ea6 \u03b8i", diff: "\u6f2b\u53cd\u5c04", spec: "\u955c\u9762",
          total: "\u603b\u548c", drag: "\u62d6\u52a8\u4ee5\u79fb\u52a8\u5149\u6e90", albedo: "\u53cd\u7167\u7387", scale: "\u6ce2\u74e3\u6309\u5cf0\u503c\u7f29\u653e f\u00b7cos =",
          base: "baseColor = 0.8\uff08\u7070\u8272\uff09", mirror: "\u955c\u9762\u65b9\u5411" },
    ja: { rough: "\u30e9\u30d5\u30cd\u30b9 r", metal: "\u30e1\u30bf\u30ea\u30c3\u30af", theta: "\u5149\u6e90\u306e\u89d2\u5ea6 \u03b8i", diff: "\u30c7\u30a3\u30d5\u30e5\u30fc\u30ba", spec: "\u30b9\u30da\u30ad\u30e5\u30e9\u30fc",
          total: "\u5408\u8a08", drag: "\u30c9\u30e9\u30c3\u30b0\u3067\u5149\u6e90\u3092\u79fb\u52d5", albedo: "\u30a2\u30eb\u30d9\u30c9", scale: "\u30ed\u30fc\u30d6\u306f\u30d4\u30fc\u30af\u3067\u6b63\u898f\u5316 f\u00b7cos =",
          base: "baseColor = 0.8\uff08\u30b0\u30ec\u30fc\uff09", mirror: "\u93e1\u9762\u65b9\u5411" }
  };
  var COL = { diff: "#1f77b4", spec: "#ff7f0e", total: "#9467bd", light: "#e6a00e", grid: "#d8d8d8", dark: "#222", n: "#1f77b4" };
  var BASE = 0.8;
  var PI = Math.PI;

  // ---- the post's shading functions (section 8 GLSL, scalar version)
  function D_GGX(NoH, a) { var a2 = a * a, d = NoH * NoH * (a2 - 1) + 1; return a2 / (PI * d * d); }
  function V_Smith(NoV, NoL, a) {
    var a2 = a * a;
    var gv = NoL * Math.sqrt(NoV * NoV * (1 - a2) + a2);
    var gl = NoV * Math.sqrt(NoL * NoL * (1 - a2) + a2);
    return 0.5 / (gv + gl);
  }
  function F_Schlick(VoH, F0) { return F0 + (1 - F0) * Math.pow(1 - VoH, 5); }

  // l = light direction, v = view direction, both unit 3-vectors with n = (0, 0, 1)
  function brdf(l, v, s) {
    var NoL = l[2], NoV = v[2];
    if (NoL <= 0 || NoV <= 0) return [0, 0];
    var hx = l[0] + v[0], hy = l[1] + v[1], hz = l[2] + v[2];
    var hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
    hx /= hl; hy /= hl; hz /= hl;
    var VoH = Math.max(v[0] * hx + v[1] * hy + v[2] * hz, 0);
    var a = Math.max(s.rough * s.rough, 1e-3);
    var F0 = 0.04 * (1 - s.metal) + BASE * s.metal;
    var F = F_Schlick(VoH, F0);
    var spec = D_GGX(Math.max(hz, 0), a) * V_Smith(Math.max(NoV, 1e-4), NoL, a) * F;
    var diff = (1 - F) * (1 - s.metal) * BASE / PI;
    return [diff, spec];
  }

  function lightDir(s) { var t = s.theta * PI / 180; return [Math.sin(t), 0, Math.cos(t)]; }

  // Directional albedo: integral of f_r cos(theta_o) over the hemisphere.
  // Diffuse part: midpoint rule in (theta, phi). Specular part: a stratified grid in (xi, phi)
  // mapped through the GGX importance-sampling formula, so that narrow lobes are resolved.
  function albedo(s) {
    var l = lightDir(s), nt = 48, np = 96, sd = 0, ss = 0, i, j;
    var dt = 0.5 * PI / nt, dp = 2 * PI / np;
    for (i = 0; i < nt; i++) {
      var t = (i + 0.5) * dt, st = Math.sin(t), ct = Math.cos(t);
      for (j = 0; j < np; j++) {
        var p = (j + 0.5) * dp;
        sd += brdf(l, [st * Math.cos(p), st * Math.sin(p), ct], s)[0] * ct * st * dt * dp;
      }
    }
    var a = Math.max(s.rough * s.rough, 1e-3), a2 = a * a, nx = 96, n = 0;
    for (i = 0; i < nx; i++) {
      var u = (i + 0.5) / nx;
      var ch = Math.sqrt((1 - u) / (1 + (a2 - 1) * u)), sh = Math.sqrt(1 - ch * ch);
      for (j = 0; j < np; j++) {
        var q = (j + 0.5) * dp, h = [sh * Math.cos(q), sh * Math.sin(q), ch];
        var lh = l[0] * h[0] + l[1] * h[1] + l[2] * h[2];
        var v = [2 * lh * h[0] - l[0], 2 * lh * h[1] - l[1], 2 * lh * h[2] - l[2]];
        n++;
        if (v[2] <= 0 || lh <= 0) continue;
        // pdf(v) = D(h) (n.h) / (4 l.h)
        ss += brdf(l, v, s)[1] * v[2] * 4 * lh / (D_GGX(ch, a) * ch);
      }
    }
    return [sd, ss / n];
  }

  function slider(parent, label, min, max, step, value, onInput) {
    var row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:8px;margin:2px 0;font-size:14px;flex:1 1 220px;min-width:0";
    var name = document.createElement("span");
    name.textContent = label;
    name.style.cssText = "white-space:nowrap;min-width:7.5em";
    var inp = document.createElement("input");
    inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = value;
    inp.style.cssText = "flex:1;min-width:60px";
    var val = document.createElement("span");
    val.style.cssText = "width:3.2em;text-align:right;font-variant-numeric:tabular-nums";
    row.appendChild(name); row.appendChild(inp); row.appendChild(val);
    parent.appendChild(row);
    function show() { val.textContent = (+inp.value).toFixed(step < 1 ? 2 : 0); }
    inp.addEventListener("input", function () { show(); onInput(+inp.value); });
    show();
    return { input: inp, show: show };
  }

  function init(el) {
    var T = TXT[el.dataset.lang] || TXT.en;
    var s = { rough: 0.4, metal: 0.0, theta: -45 };
    el.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.style.cssText = "background:#fff;color:#222;padding:8px 10px 10px;font-family:inherit";
    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;touch-action:none;cursor:crosshair";
    var info = document.createElement("div");
    info.style.cssText = "font-size:13px;margin:4px 0 6px;color:#444;min-height:1.3em";
    var controls = document.createElement("div");
    controls.style.cssText = "display:flex;flex-wrap:wrap;column-gap:18px";
    wrap.appendChild(canvas); wrap.appendChild(info); wrap.appendChild(controls);
    el.appendChild(wrap);

    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, ox = 0, oy = 0, R = 0;
    var sTheta = slider(controls, T.theta, -89, 89, 1, s.theta, function (v) { s.theta = v; update(); });
    slider(controls, T.rough, 0.1, 1, 0.01, s.rough, function (v) { s.rough = v; update(); });
    slider(controls, T.metal, 0, 1, 0.01, s.metal, function (v) { s.metal = v; update(); });

    function resize() {
      var w = wrap.clientWidth - 20;
      if (w <= 0) return;
      var h = Math.round(Math.min(Math.max(w * 0.62, 230), 330));
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = w; H = h; ox = W / 2; oy = H - 26; R = Math.min(W / 2 - 18, H - 46);
      draw();
    }

    function arrow(x0, y0, x1, y1, color, lw) {
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      var a = Math.atan2(y1 - y0, x1 - x0), k = 6 + 2 * lw;
      ctx.beginPath(); ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - k * Math.cos(a - 0.4), y1 - k * Math.sin(a - 0.4));
      ctx.lineTo(x1 - k * Math.cos(a + 0.4), y1 - k * Math.sin(a + 0.4));
      ctx.closePath(); ctx.fill();
    }

    var curves = null, peak = 1, alb = [0, 0];
    function compute() {
      var l = lightDir(s), N = 1441, d = [], sp = [], m = 0;
      for (var i = 0; i < N; i++) {
        var t = -PI / 2 + PI * i / (N - 1);
        var v = [Math.sin(t), 0, Math.cos(t)];
        var f = brdf(l, v, s), c = Math.max(v[2], 0);
        d.push(f[0] * c); sp.push(f[1] * c);
        m = Math.max(m, (f[0] + f[1]) * c);
      }
      curves = { d: d, s: sp, N: N }; peak = m > 0 ? m : 1;
      alb = albedo(s);
    }

    function path(vals, scale) {
      ctx.beginPath(); ctx.moveTo(ox, oy);
      for (var i = 0; i < curves.N; i++) {
        var t = -PI / 2 + PI * i / (curves.N - 1), r = vals[i] * scale;
        ctx.lineTo(ox + r * Math.sin(t), oy - r * Math.cos(t));
      }
      ctx.closePath();
    }

    function draw() {
      if (!W) return;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      // grid: half circle and 30/60 degree rays
      ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
      [0.5, 1].forEach(function (f) { ctx.beginPath(); ctx.arc(ox, oy, R * f, PI, 2 * PI); ctx.stroke(); });
      ctx.fillStyle = "#888"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
      [-60, -30, 30, 60].forEach(function (deg) {
        var t = deg * PI / 180;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + R * Math.sin(t), oy - R * Math.cos(t)); ctx.stroke();
        ctx.fillText(Math.abs(deg) + "\u00b0", ox + (R + 11) * Math.sin(t), oy - (R + 11) * Math.cos(t) + 4);
      });
      // surface
      ctx.fillStyle = "#e9e9e9"; ctx.fillRect(0, oy, W, H - oy);
      ctx.strokeStyle = COL.dark; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.stroke();
      // lobes, all scaled by the same factor
      var scale = R * 0.95 / peak;
      path(curves.d, scale); ctx.fillStyle = "rgba(31,119,180,0.22)"; ctx.fill();
      ctx.strokeStyle = COL.diff; ctx.lineWidth = 1.5; ctx.stroke();
      path(curves.s, scale); ctx.fillStyle = "rgba(255,127,14,0.18)"; ctx.fill();
      ctx.strokeStyle = COL.spec; ctx.lineWidth = 2; ctx.stroke();
      var tot = curves.d.map(function (x, i) { return x + curves.s[i]; });
      path(tot, scale); ctx.strokeStyle = COL.total; ctx.lineWidth = 3; ctx.stroke();
      // normal, mirror direction, light
      var t = s.theta * PI / 180;
      arrow(ox, oy, ox, oy - R * 1.02, COL.n, 1.5);
      ctx.fillStyle = COL.n; ctx.textAlign = "left"; ctx.font = "italic 15px serif";
      ctx.fillText("n", ox + 5, oy - R * 0.98);
      ctx.setLineDash([6, 5]); ctx.strokeStyle = COL.dark; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox - R * Math.sin(t), oy - R * Math.cos(t)); ctx.stroke();
      ctx.setLineDash([]);
      var lx = ox + R * Math.sin(t), ly = oy - R * Math.cos(t);
      arrow(lx, ly, ox + 8 * Math.sin(t), oy - 8 * Math.cos(t), COL.light, 3);
      ctx.beginPath(); ctx.arc(lx, ly, 9, 0, 2 * PI); ctx.fillStyle = COL.light; ctx.fill();
      ctx.font = "italic 16px serif"; ctx.fillStyle = COL.light;
      ctx.textAlign = t < 0 ? "right" : "left";
      ctx.fillText("\u03c9i", lx + (t < 0 ? -12 : 12), ly + 5);
      // legend
      ctx.font = "13px sans-serif"; ctx.textAlign = "left";
      var items = [[COL.diff, T.diff], [COL.spec, T.spec], [COL.total, T.total]], y = 16;
      items.forEach(function (it) {
        ctx.fillStyle = it[0]; ctx.fillRect(8, y - 9, 16, 4 + (it[0] === COL.total ? 2 : 0));
        ctx.fillStyle = "#333"; ctx.fillText(it[1], 30, y - 3); y += 17;
      });
      ctx.textAlign = "right"; ctx.fillStyle = "#666";
      ctx.fillText(T.drag, W - 8, 13);
      ctx.fillText("- - " + T.mirror, W - 8, 30);
      info.textContent = T.base + " \u00b7 " + T.scale + " " + peak.toPrecision(3) + " \u00b7 " + T.albedo + ": " + T.diff + " " +
        alb[0].toFixed(3) + ", " + T.spec + " " + alb[1].toFixed(3) + ", " + T.total + " " + (alb[0] + alb[1]).toFixed(3);
    }

    function update() { compute(); draw(); }

    function setFromPointer(e) {
      var r = canvas.getBoundingClientRect();
      var x = e.clientX - r.left - ox, y = oy - (e.clientY - r.top);
      var deg = Math.atan2(x, Math.max(y, 1e-3)) * 180 / PI;
      s.theta = Math.round(Math.max(-89, Math.min(89, deg)));
      sTheta.input.value = s.theta; sTheta.show();
      update();
    }
    var dragging = false;
    canvas.addEventListener("pointerdown", function (e) {
      dragging = true; canvas.setPointerCapture(e.pointerId); setFromPointer(e); e.preventDefault();
    });
    canvas.addEventListener("pointermove", function (e) { if (dragging) setFromPointer(e); });
    function stop(e) { dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch (err) {} }
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);

    compute();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);
    else window.addEventListener("resize", resize);
    resize();
  }

  function start() {
    var els = document.querySelectorAll('[data-widget="graphics-brdf-lobe"]');
    for (var i = 0; i < els.length; i++) if (!els[i].dataset.ready) { els[i].dataset.ready = "1"; init(els[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
