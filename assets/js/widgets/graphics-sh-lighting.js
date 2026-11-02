/* Spherical-harmonic irradiance (graphics post 11). Plain JS + Canvas 2D, no dependencies.
   Environment: a sky/ground hemisphere plus a disc-shaped sun of adjustable size (its power is
   kept constant). Left sphere: exact irradiance E(n) (closed form for the hemispheres, numerical
   integration over the sun disc). Right sphere: the SH approximation
   E(n) = sum_l A_l sum_m c_lm Y_lm(n), A = (pi, 2pi/3, pi/4, 0), using bands l <= l_max.
   Below: the environment radiance and its SH reconstruction at the same order (lat-long maps).
   Real SH basis, z up, same constants as the post. Embedded with name "graphics-sh-lighting". */
(function () {
  "use strict";
  var TXT = {
    en: { order: "SH order l_max", size: "light size", drag: "drag to move the light", exact: "exact E(n)",
          sh: "SH approximation", env: "environment L(\u03c9)", rec: "SH reconstruction of L", err: "relative RMS error of E",
          coeffs: "coefficients per channel" },
    zh: { order: "SH \u9636\u6570 l_max", size: "\u5149\u6e90\u5927\u5c0f", drag: "\u62d6\u52a8\u4ee5\u79fb\u52a8\u5149\u6e90",
          exact: "\u7cbe\u786e\u8f90\u7167\u5ea6 E(n)", sh: "SH \u8fd1\u4f3c", env: "\u73af\u5883 L(\u03c9)",
          rec: "L \u7684 SH \u91cd\u5efa", err: "E \u7684\u76f8\u5bf9 RMS \u8bef\u5dee", coeffs: "\u6bcf\u901a\u9053\u7cfb\u6570" },
    ja: { order: "SH \u306e\u6b21\u6570 l_max", size: "\u5149\u6e90\u306e\u5927\u304d\u3055", drag: "\u30c9\u30e9\u30c3\u30b0\u3067\u5149\u6e90\u3092\u79fb\u52d5",
          exact: "\u53b3\u5bc6\u306a\u653e\u5c04\u7167\u5ea6 E(n)", sh: "SH \u8fd1\u4f3c", env: "\u74b0\u5883 L(\u03c9)",
          rec: "L \u306e SH \u518d\u69cb\u6210", err: "E \u306e\u76f8\u5bfe RMS \u8aa4\u5dee", coeffs: "\u30c1\u30e3\u30f3\u30cd\u30eb\u3042\u305f\u308a\u306e\u4fc2\u6570" }
  };
  var PI = Math.PI;
  var SKY = [0.20, 0.32, 0.55], GROUND = [0.10, 0.08, 0.06], SUNC = [1.0, 0.85, 0.65], E_SUN = 3.0;
  var BAND = [0, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3];
  var AHAT = [PI, 2 * PI / 3, PI / 4, 0];

  function basis(x, y, z, o) {
    o[0] = 0.282095;
    o[1] = 0.488603 * y; o[2] = 0.488603 * z; o[3] = 0.488603 * x;
    o[4] = 1.092548 * x * y; o[5] = 1.092548 * y * z; o[6] = 0.315392 * (3 * z * z - 1);
    o[7] = 1.092548 * x * z; o[8] = 0.546274 * (x * x - y * y);
    o[9] = 0.590044 * y * (3 * x * x - y * y); o[10] = 2.890611 * x * y * z; o[11] = 0.457046 * y * (5 * z * z - 1);
    o[12] = 0.373176 * z * (5 * z * z - 3); o[13] = 0.457046 * x * (5 * z * z - 1);
    o[14] = 1.445306 * z * (x * x - y * y); o[15] = 0.590044 * x * (x * x - 3 * y * y);
  }
  // Fibonacci directions for projecting the hemispheres and for the error estimate
  var NF = 4096, FIB = [];
  (function () {
    for (var i = 0; i < NF; i++) {
      var z = 1 - 2 * (i + 0.5) / NF, r = Math.sqrt(1 - z * z), p = i * 2.399963229728653;
      FIB.push([r * Math.cos(p), r * Math.sin(p), z]);
    }
  })();
  var SKYC = [[], [], []];
  (function () {
    var Y = new Array(16), k, c, i;
    for (c = 0; c < 3; c++) for (k = 0; k < 16; k++) SKYC[c][k] = 0;
    for (i = 0; i < NF; i++) {
      var d = FIB[i]; basis(d[0], d[1], d[2], Y);
      for (c = 0; c < 3; c++) {
        var L = d[2] > 0 ? SKY[c] : GROUND[c];
        for (k = 0; k < 16; k++) SKYC[c][k] += L * Y[k] * 4 * PI / NF;
      }
    }
  })();
  function skyE(nz, c) { return PI * (SKY[c] * (1 + nz) / 2 + GROUND[c] * (1 - nz) / 2); }

  function frame(s) {
    var a = Math.abs(s[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    var t1 = [a[1] * s[2] - a[2] * s[1], a[2] * s[0] - a[0] * s[2], a[0] * s[1] - a[1] * s[0]];
    var l = Math.hypot(t1[0], t1[1], t1[2]); t1 = [t1[0] / l, t1[1] / l, t1[2] / l];
    var t2 = [s[1] * t1[2] - s[2] * t1[1], s[2] * t1[0] - s[0] * t1[2], s[0] * t1[1] - s[1] * t1[0]];
    return [t1, t2];
  }

  function init(el) {
    var T = TXT[el.dataset.lang] || TXT.en;
    var st = { order: 2, alphaDeg: 10, az: 0.7, el: 0.6 };
    var NA = 40, NB = 64, cone = [], domega = 0, Lsun = 0, table = new Float64Array(181), coef = [[], [], []];
    el.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.style.cssText = "background:#fff;color:#222;padding:8px 10px 10px;font-family:inherit";
    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;touch-action:none;cursor:grab";
    var info = document.createElement("div");
    info.style.cssText = "font-size:13px;margin:4px 0 6px;color:#444;min-height:1.3em";
    var controls = document.createElement("div");
    controls.style.cssText = "display:flex;flex-wrap:wrap;column-gap:18px";
    wrap.appendChild(canvas); wrap.appendChild(info); wrap.appendChild(controls);
    el.appendChild(wrap);
    var ctx = canvas.getContext("2d");

    function slider(label, min, max, step, value, fmt, onInput) {
      var row = document.createElement("label");
      row.style.cssText = "display:flex;align-items:center;gap:8px;margin:2px 0;font-size:14px;flex:1 1 220px;min-width:0";
      var name = document.createElement("span"); name.textContent = label; name.style.cssText = "white-space:nowrap;min-width:7em";
      var inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = value; inp.style.cssText = "flex:1;min-width:60px";
      var val = document.createElement("span"); val.style.cssText = "width:3em;text-align:right";
      row.appendChild(name); row.appendChild(inp); row.appendChild(val); controls.appendChild(row);
      function show() { val.textContent = fmt(+inp.value); }
      inp.addEventListener("input", function () { show(); onInput(+inp.value); });
      show();
    }
    slider(T.order, 0, 3, 1, st.order, function (v) { return String(v); }, function (v) { st.order = v; draw(); });
    slider(T.size, 2, 60, 1, st.alphaDeg, function (v) { return v + "\u00b0"; }, function (v) { st.alphaDeg = v; buildSun(); updateCoef(); draw(); });

    function sunDir() { return [Math.cos(st.el) * Math.sin(st.az), Math.cos(st.el) * Math.cos(st.az), Math.sin(st.el)]; }
    function buildSun() {
      var ca = Math.cos(st.alphaDeg * PI / 180), sa2 = 1 - ca * ca, a, b, i;
      Lsun = E_SUN / (PI * sa2);                       // keeps the irradiance at normal incidence fixed
      domega = 2 * PI * (1 - ca) / (NA * NB);
      cone = [];
      for (a = 0; a < NA; a++) {
        var mu = 1 - (1 - ca) * (a + 0.5) / NA, sm = Math.sqrt(Math.max(0, 1 - mu * mu));
        for (b = 0; b < NB; b++) { var p = 2 * PI * (b + 0.5) / NB; cone.push([sm * Math.cos(p), sm * Math.sin(p), mu]); }
      }
      for (i = 0; i <= 180; i++) {                     // exact sun irradiance versus n.s
        var m = -1 + 2 * i / 180, nx = Math.sqrt(Math.max(0, 1 - m * m)), acc = 0;
        for (var j = 0; j < cone.length; j++) { var c = nx * cone[j][0] + m * cone[j][2]; if (c > 0) acc += c; }
        table[i] = Lsun * domega * acc;
      }
    }
    function sunTable(m) { var f = (m + 1) * 90, i = Math.min(179, Math.max(0, Math.floor(f))), t = f - i; return table[i] * (1 - t) + table[i + 1] * t; }
    function updateCoef() {
      var s = sunDir(), F = frame(s), Y = new Array(16), c, k, j;
      for (c = 0; c < 3; c++) for (k = 0; k < 16; k++) coef[c][k] = SKYC[c][k];
      for (j = 0; j < cone.length; j++) {
        var q = cone[j];
        var x = q[0] * F[0][0] + q[1] * F[1][0] + q[2] * s[0];
        var y = q[0] * F[0][1] + q[1] * F[1][1] + q[2] * s[1];
        var z = q[0] * F[0][2] + q[1] * F[1][2] + q[2] * s[2];
        basis(x, y, z, Y);
        for (k = 0; k < 16; k++) { var w = Lsun * Y[k] * domega; for (c = 0; c < 3; c++) coef[c][k] += w * SUNC[c]; }
      }
    }
    function exactE(n, s, out) {
      var m = n[0] * s[0] + n[1] * s[1] + n[2] * s[2], e = sunTable(m);
      for (var c = 0; c < 3; c++) out[c] = skyE(n[2], c) + SUNC[c] * e;
    }
    var Yb = new Array(16);
    function shE(n, out) {
      basis(n[0], n[1], n[2], Yb);
      var kmax = (st.order + 1) * (st.order + 1);
      for (var c = 0; c < 3; c++) { var acc = 0; for (var k = 0; k < kmax; k++) acc += AHAT[BAND[k]] * coef[c][k] * Yb[k]; out[c] = acc; }
    }
    function tone(v) { var x = Math.max(v, 0); x = x / (1 + x); x = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; return Math.round(255 * Math.min(1, x)); }

    var offA = document.createElement("canvas"), offB = document.createElement("canvas");
    var offC = document.createElement("canvas"), offD = document.createElement("canvas");
    offC.width = offD.width = 128; offC.height = offD.height = 64;
    var W = 0, H = 0, S = 0, SD = 0, stripW = 0, stripH = 0, gapX = 0;

    function resize() {
      var w = wrap.clientWidth - 20;
      if (w <= 0) return;
      gapX = 14;
      S = Math.floor(Math.min((w - gapX) / 2, 250));
      if (S < 8) return;
      stripW = Math.floor((w - gapX) / 2); stripH = Math.round(stripW / 2);
      var h = 20 + S + 28 + stripH + 6;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = w; H = h;
      SD = Math.min(Math.round(S * dpr), 220);
      offA.width = offA.height = offB.width = offB.height = SD;
      draw();
    }

    function renderSphere(off, useSH, s) {
      var c2 = off.getContext("2d"), img = c2.createImageData(SD, SD), d = img.data, out = [0, 0, 0], n = [0, 0, 0];
      for (var j = 0; j < SD; j++) {
        for (var i = 0; i < SD; i++) {
          var u = (i + 0.5) / SD * 2 - 1, v = 1 - (j + 0.5) / SD * 2, r2 = u * u + v * v, p = 4 * (j * SD + i);
          if (r2 > 1) { d[p] = d[p + 1] = d[p + 2] = 255; d[p + 3] = 0; continue; }
          n[0] = u; n[1] = Math.sqrt(1 - r2); n[2] = v;
          if (useSH) shE(n, out); else exactE(n, s, out);
          for (var c = 0; c < 3; c++) d[p + c] = tone(0.8 / PI * out[c]);
          d[p + 3] = 255;
        }
      }
      c2.putImageData(img, 0, 0);
    }
    function renderStrip(off, useSH, s) {
      var c2 = off.getContext("2d"), img = c2.createImageData(128, 64), d = img.data, Y = new Array(16);
      var ca = Math.cos(st.alphaDeg * PI / 180), kmax = (st.order + 1) * (st.order + 1);
      for (var j = 0; j < 64; j++) {
        var th = (j + 0.5) / 64 * PI, z = Math.cos(th), sr = Math.sin(th);
        for (var i = 0; i < 128; i++) {
          var ph = (i + 0.5) / 128 * 2 * PI - PI, x = sr * Math.sin(ph), y = sr * Math.cos(ph), p = 4 * (j * 128 + i), c;
          if (useSH) {
            basis(x, y, z, Y);
            for (c = 0; c < 3; c++) { var acc = 0; for (var k = 0; k < kmax; k++) acc += coef[c][k] * Y[k]; d[p + c] = tone(acc * 0.6); }
          } else {
            var inSun = x * s[0] + y * s[1] + z * s[2] > ca;
            for (c = 0; c < 3; c++) d[p + c] = tone(0.6 * ((z > 0 ? SKY[c] : GROUND[c]) + (inSun ? Lsun * SUNC[c] : 0)));
          }
          d[p + 3] = 255;
        }
      }
      c2.putImageData(img, 0, 0);
    }
    function errorE(s) {
      var a = [0, 0, 0], b = [0, 0, 0], num = 0, den = 0;
      for (var i = 0; i < NF; i += 4) {
        exactE(FIB[i], s, a); shE(FIB[i], b);
        for (var c = 0; c < 3; c++) { num += (a[c] - b[c]) * (a[c] - b[c]); den += a[c] * a[c]; }
      }
      return Math.sqrt(num / den);
    }

    function draw() {
      if (!W) return;
      var s = sunDir();
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      renderSphere(offA, false, s); renderSphere(offB, true, s);
      renderStrip(offC, false, s); renderStrip(offD, true, s);
      var x0 = Math.round((stripW - S) / 2), x1 = stripW + gapX + Math.round((stripW - S) / 2);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offA, x0, 20, S, S); ctx.drawImage(offB, x1, 20, S, S);
      ctx.drawImage(offC, 0, 20 + S + 28, stripW, stripH); ctx.drawImage(offD, stripW + gapX, 20 + S + 28, stripW, stripH);
      ctx.font = "13px sans-serif"; ctx.fillStyle = "#333"; ctx.textAlign = "center";
      ctx.fillText(T.exact, x0 + S / 2, 14); ctx.fillText(T.sh + " (l \u2264 " + st.order + ")", x1 + S / 2, 14);
      ctx.fillText(T.env, stripW / 2, 20 + S + 22); ctx.fillText(T.rec, stripW + gapX + stripW / 2, 20 + S + 22);
      // light marker when it faces the viewer
      if (s[1] > 0) {
        [x0, x1].forEach(function (xx) {
          ctx.beginPath(); ctx.arc(xx + S / 2 + s[0] * S / 2, 20 + S / 2 - s[2] * S / 2, 6, 0, 2 * PI);
          ctx.strokeStyle = "#e6a00e"; ctx.lineWidth = 2.5; ctx.stroke();
        });
      }
      info.textContent = T.drag + " \u00b7 " + T.err + ": " + (100 * errorE(s)).toFixed(2) + "% \u00b7 " + T.coeffs + ": " + (st.order + 1) * (st.order + 1);
    }

    var drag = null;
    canvas.addEventListener("pointerdown", function (e) { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
    canvas.addEventListener("pointermove", function (e) {
      if (!drag) return;
      st.az += (e.clientX - drag[0]) * 0.012;
      st.el = Math.max(-1.5, Math.min(1.5, st.el - (e.clientY - drag[1]) * 0.012));
      drag = [e.clientX, e.clientY];
      updateCoef(); draw();
    });
    function stop(e) { drag = null; try { canvas.releasePointerCapture(e.pointerId); } catch (err) {} }
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);

    buildSun(); updateCoef();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);
    else window.addEventListener("resize", resize);
    resize();
  }

  function start() {
    var els = document.querySelectorAll('[data-widget="graphics-sh-lighting"]');
    for (var i = 0; i < els.length; i++) if (!els[i].dataset.ready) { els[i].dataset.ready = "1"; init(els[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
