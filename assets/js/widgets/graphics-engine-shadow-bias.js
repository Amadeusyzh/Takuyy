/* Shadow-map acne, bias and peter-panning in 2D (graphics-engine post 03).
 * A directional light renders a 1D shadow map of a 2D scene (ground, a 25 degree slope, a box).
 * Every surface sample is then tested like the post's shader: lit iff depth - bias <= stored depth.
 * Results are compared with exact visibility (a ray toward the light): correct lit, correct shadow,
 * acne (wrongly shadowed) and leaks (wrongly lit, peter-panning). The orange stairs are the stored
 * depths, one per texel.
 */
(function () {
  "use strict";

  var TEXT = {
    en: { angle: "Light angle", res: "Shadow-map texels", bias: "Bias", slope: "Slope-scaled",
          lit: "lit", shadow: "shadow", acne: "acne (wrongly shadowed)", leak: "leak (wrongly lit)",
          texel: "texel size", hint: "Drag in the scene to tilt the light." },
    zh: { angle: "\u{5149}\u{6e90}\u{89d2}\u{5ea6}", res: "\u{9634}\u{5f71}\u{8d34}\u{56fe}\u{7eb9}\u{7d20}\u{6570}", bias: "\u{504f}\u{79fb}",
          slope: "\u{659c}\u{7387}\u{7f29}\u{653e}", lit: "\u{7167}\u{4eae}", shadow: "\u{9634}\u{5f71}",
          acne: "\u{9634}\u{5f71}\u{7c89}\u{523a}\u{ff08}\u{9519}\u{8bef}\u{5730}\u{5904}\u{4e8e}\u{9634}\u{5f71}\u{ff09}",
          leak: "\u{6f0f}\u{5149}\u{ff08}\u{9519}\u{8bef}\u{5730}\u{88ab}\u{7167}\u{4eae}\u{ff09}", texel: "\u{7eb9}\u{7d20}\u{5c3a}\u{5bf8}",
          hint: "\u{5728}\u{573a}\u{666f}\u{4e2d}\u{62d6}\u{52a8}\u{53ef}\u{503e}\u{659c}\u{5149}\u{6e90}\u{3002}" },
    ja: { angle: "\u{5149}\u{6e90}\u{306e}\u{89d2}\u{5ea6}", res: "\u{30b7}\u{30e3}\u{30c9}\u{30a6}\u{30de}\u{30c3}\u{30d7}\u{306e}\u{30c6}\u{30af}\u{30bb}\u{30eb}\u{6570}",
          bias: "\u{30d0}\u{30a4}\u{30a2}\u{30b9}", slope: "\u{50be}\u{659c}\u{30b9}\u{30b1}\u{30fc}\u{30eb}", lit: "\u{7167}\u{660e}",
          shadow: "\u{5f71}", acne: "\u{30a2}\u{30af}\u{30cd}\u{ff08}\u{8aa4}\u{3063}\u{3066}\u{5f71}\u{ff09}",
          leak: "\u{5149}\u{6f0f}\u{308c}\u{ff08}\u{8aa4}\u{3063}\u{3066}\u{7167}\u{660e}\u{ff09}", texel: "\u{30c6}\u{30af}\u{30bb}\u{30eb}\u{30b5}\u{30a4}\u{30ba}",
          hint: "\u{30b7}\u{30fc}\u{30f3}\u{4e0a}\u{3092}\u{30c9}\u{30e9}\u{30c3}\u{30b0}\u{3059}\u{308b}\u{3068}\u{5149}\u{6e90}\u{304c}\u{50be}\u{304d}\u{307e}\u{3059}\u{3002}" }
  };
  var TAN25 = Math.tan(25 * Math.PI / 180);
  // scene segments [x0, y0, x1, y1]
  var SEG = [
    [-5, 0, 0, 0],
    [0, 0, 4.5, 4.5 * TAN25],
    [-3, 0, -3, 1], [-3, 1, -2, 1], [-2, 1, -2, 0]
  ];
  var COL = { lit: "#2ca02c", shadow: "#555555", acne: "#d62728", leak: "#1f77b4" };

  function hitT(ox, oy, dx, dy) { // nearest positive ray parameter over all segments
    var best = Infinity;
    for (var i = 0; i < SEG.length; i++) {
      var s = SEG[i], ex = s[2] - s[0], ey = s[3] - s[1];
      var den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      var qx = s[0] - ox, qy = s[1] - oy;
      var t = (qx * ey - qy * ex) / den;
      var u = (qx * dy - qy * dx) / den;
      if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 && t < best) best = t;
    }
    return best;
  }

  // surface samples with normals
  var SAMPLES = [];
  SEG.forEach(function (s) {
    var len = Math.hypot(s[2] - s[0], s[3] - s[1]), n = Math.max(2, Math.round(len / 0.02));
    var nx = -(s[3] - s[1]) / len, ny = (s[2] - s[0]) / len; // left normal of the segment direction
    if (s[0] === -3 && s[2] === -3) { nx = -1; ny = 0; }       // box sides point outwards
    if (s[0] === -2 && s[2] === -2) { nx = 1; ny = 0; }
    for (var k = 0; k < n; k++) {
      var t = (k + 0.5) / n;
      SAMPLES.push({ x: s[0] + t * (s[2] - s[0]), y: s[1] + t * (s[3] - s[1]), nx: nx, ny: ny });
    }
  });

  function setup(root) {
    var T = TEXT[root.dataset.lang] || TEXT.en;
    root.style.background = "#fbfbfd";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.color = "#222";
    root.innerHTML = "";
    var phi = 35 * Math.PI / 180, ntex = 24, bias = 0, slope = false;

    var ctrl = document.createElement("div");
    ctrl.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 10px 0;font-size:13.5px";
    function slider(min, max, step, val, onInput) {
      var wrap = document.createElement("label");
      wrap.style.cssText = "display:flex;align-items:center;gap:6px;flex:1 1 200px";
      var span = document.createElement("span");
      span.style.cssText = "min-width:150px;font-variant-numeric:tabular-nums";
      var inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
      inp.style.cssText = "flex:1;min-width:80px;accent-color:#9467bd";
      inp.addEventListener("input", function () { onInput(Number(inp.value)); draw(); });
      wrap.appendChild(span); wrap.appendChild(inp); ctrl.appendChild(wrap);
      return { span: span, inp: inp };
    }
    var sA = slider(-60, 60, 1, 35, function (v) { phi = v * Math.PI / 180; });
    var sR = slider(4, 128, 1, ntex, function (v) { ntex = v; });
    var sB = slider(0, 0.4, 0.005, bias, function (v) { bias = v; });
    var sl = document.createElement("label");
    sl.style.cssText = "display:inline-flex;align-items:center;gap:4px";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.addEventListener("change", function () { slope = cb.checked; draw(); });
    sl.appendChild(cb); sl.appendChild(document.createTextNode(T.slope));
    ctrl.appendChild(sl);
    root.appendChild(ctrl);

    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;margin:4px auto 0;touch-action:none;cursor:ew-resize";
    root.appendChild(canvas);
    var info = document.createElement("div");
    info.style.cssText = "padding:4px 10px 10px;font-size:13.5px;line-height:1.5;font-variant-numeric:tabular-nums";
    root.appendChild(info);
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, lastW = -1, sc = 50;
    var XMIN = -5.3, XMAX = 4.8, YMIN = -0.4, YMAX = 3.6;

    function resize() {
      var w = Math.max(280, root.clientWidth);
      if (w === lastW) return;
      lastW = w;
      W = w; sc = (W - 16) / (XMAX - XMIN); H = Math.round(sc * (YMAX - YMIN)) + 16;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function X(x) { return 8 + (x - XMIN) * sc; }
    function Y(y) { return 8 + (YMAX - y) * sc; }

    function draw() {
      if (!W) return;
      var dx = Math.sin(phi), dy = -Math.cos(phi);   // light travels along d (downwards)
      var ux = Math.cos(phi), uy = Math.sin(phi);    // shadow-map u axis, perpendicular to d
      var cx = 0, cy = 1, L = 12;                    // light plane: (c - L d) + u U
      // u extent of the scene
      var umin = Infinity, umax = -Infinity;
      SEG.forEach(function (s) {
        [[s[0], s[1]], [s[2], s[3]]].forEach(function (p) {
          var u = (p[0] - cx) * ux + (p[1] - cy) * uy;
          umin = Math.min(umin, u); umax = Math.max(umax, u);
        });
      });
      umin -= 0.05; umax += 0.05;
      var w = (umax - umin) / ntex, stored = [];
      for (var i = 0; i < ntex; i++) {
        var uc = umin + (i + 0.5) * w;
        stored.push(hitT(cx - L * dx + uc * ux, cy - L * dy + uc * uy, dx, dy));
      }
      sA.span.textContent = T.angle + " = " + Math.round(phi * 180 / Math.PI) + "\u{b0}";
      sR.span.textContent = T.res + " = " + ntex;
      sB.span.textContent = T.bias + " = " + bias.toFixed(3);

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      // a few light rays through texel boundaries
      ctx.strokeStyle = "rgba(242,177,52,0.35)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (i = 0; i <= ntex; i += Math.max(1, Math.round(ntex / 16))) {
        var ub = umin + i * w, ox = cx - L * dx + ub * ux, oy = cy - L * dy + ub * uy;
        ctx.moveTo(X(ox), Y(oy)); ctx.lineTo(X(ox + 2 * L * dx), Y(oy + 2 * L * dy));
      }
      ctx.stroke();
      // stored depths as stairs (each texel: a segment perpendicular to d at the stored depth)
      ctx.strokeStyle = "#f2b134"; ctx.lineWidth = 2.5;
      for (i = 0; i < ntex; i++) {
        if (!isFinite(stored[i])) continue;
        var t = stored[i];
        var u0 = umin + i * w, u1 = u0 + w;
        ctx.beginPath();
        ctx.moveTo(X(cx - L * dx + u0 * ux + t * dx), Y(cy - L * dy + u0 * uy + t * dy));
        ctx.lineTo(X(cx - L * dx + u1 * ux + t * dx), Y(cy - L * dy + u1 * uy + t * dy));
        ctx.stroke();
      }
      // scene
      ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5;
      SEG.forEach(function (s) { ctx.beginPath(); ctx.moveTo(X(s[0]), Y(s[1])); ctx.lineTo(X(s[2]), Y(s[3])); ctx.stroke(); });
      // classify samples
      var cnt = { lit: 0, shadow: 0, acne: 0, leak: 0 };
      SAMPLES.forEach(function (p) {
        var ndl = -(p.nx * dx + p.ny * dy);           // cos of the angle between normal and light
        var truthLit = ndl > 0 && !isFinite(hitT(p.x - 1e-4 * dx, p.y - 1e-4 * dy, -dx, -dy));
        var u = (p.x - cx) * ux + (p.y - cy) * uy;
        var depth = (p.x - (cx - L * dx)) * dx + (p.y - (cy - L * dy)) * dy;
        var ti = Math.floor((u - umin) / w);
        var b = bias;
        if (slope && ndl > 0.02) b += 0.5 * w * Math.sqrt(1 - ndl * ndl) / ndl; // + (w/2) tan(theta)
        var mapLit = ndl > 0 && (ti < 0 || ti >= ntex || depth - b <= stored[ti] + 1e-9);
        var k = mapLit ? (truthLit ? "lit" : "leak") : (truthLit ? "acne" : "shadow");
        cnt[k]++;
        ctx.fillStyle = COL[k];
        ctx.fillRect(X(p.x) - 2.5, Y(p.y) - 2.5, 5, 5);
      });
      // light arrow
      var ax0 = X(3.2), ay0 = Y(3.3), al = 40;
      ctx.strokeStyle = "#e0a000"; ctx.fillStyle = "#e0a000"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ax0, ay0); ctx.lineTo(ax0 + al * dx, ay0 - al * dy); ctx.stroke();
      var aa = Math.atan2(-al * dy, al * dx);
      ctx.beginPath(); ctx.moveTo(ax0 + al * dx, ay0 - al * dy);
      ctx.lineTo(ax0 + al * dx - 10 * Math.cos(aa - 0.4), ay0 - al * dy - 10 * Math.sin(aa - 0.4));
      ctx.lineTo(ax0 + al * dx - 10 * Math.cos(aa + 0.4), ay0 - al * dy - 10 * Math.sin(aa + 0.4));
      ctx.closePath(); ctx.fill();
      function chip(k, label) {
        return '<span style="display:inline-block;width:10px;height:10px;background:' + COL[k] +
          ';margin:0 4px 0 10px;vertical-align:middle"></span>' + label + " <b>" + cnt[k] + "</b>";
      }
      info.innerHTML = T.texel + " w = " + w.toFixed(3) + " &nbsp;" + chip("lit", T.lit) + chip("shadow", T.shadow) +
        "<br>" + chip("acne", T.acne) + chip("leak", T.leak) + ' <span style="color:#777">' + T.hint + "</span>";
    }

    var dragX = null;
    canvas.addEventListener("pointerdown", function (e) { dragX = e.clientX; canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
    canvas.addEventListener("pointermove", function (e) {
      if (dragX === null) return;
      var deg = Math.max(-60, Math.min(60, phi * 180 / Math.PI + (e.clientX - dragX) * 0.3));
      dragX = e.clientX;
      phi = deg * Math.PI / 180; sA.inp.value = deg;
      draw();
    });
    function end() { dragX = null; }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
  }

  function start() {
    document.querySelectorAll('[data-widget="graphics-engine-shadow-bias"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
