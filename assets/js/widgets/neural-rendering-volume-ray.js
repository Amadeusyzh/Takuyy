/* Volume rendering along one ray (neural-rendering post 02).
   Drag the density bumps; the widget evaluates the field at N midpoint samples in [t_n, t_f]
   and applies NeRF's quadrature exactly as in the post:
     alpha_i = 1 - exp(-sigma_i * delta_i),  T_i = prod_{j<i} (1 - alpha_j),  w_i = T_i * alpha_i,
     C = sum_i w_i c_i  (+ (1 - sum_i w_i) * white background),  depth = sum_i w_i t_i,
   with delta_N = 1e10 for the last sample. Plain JS + Canvas 2D, no libraries. */
(function () {
  "use strict";

  var TEXT = {
    en: {
      hint: "Drag the dots: left/right moves a density bump, up/down changes its peak density.",
      n: "samples N",
      col: "composited colour (white background)",
      acc: "opacity",
      depth: "depth"
    },
    zh: {
      hint: "\u62d6\u52a8\u5706\u70b9\uff1a\u5de6\u53f3\u79fb\u52a8\u5bc6\u5ea6\u5cf0\uff0c\u4e0a\u4e0b\u6539\u53d8\u5cf0\u503c\u5bc6\u5ea6\u3002",
      n: "\u91c7\u6837\u6570 N",
      col: "\u5408\u6210\u989c\u8272\uff08\u767d\u8272\u80cc\u666f\uff09",
      acc: "\u4e0d\u900f\u660e\u5ea6",
      depth: "\u6df1\u5ea6"
    },
    ja: {
      hint: "\u70b9\u3092\u30c9\u30e9\u30c3\u30b0\uff1a\u5de6\u53f3\u3067\u5c71\u3092\u79fb\u52d5\u3001\u4e0a\u4e0b\u3067\u30d4\u30fc\u30af\u5bc6\u5ea6\u3092\u5909\u66f4\u3057\u307e\u3059\u3002",
      n: "\u30b5\u30f3\u30d7\u30eb\u6570 N",
      col: "\u5408\u6210\u8272\uff08\u767d\u80cc\u666f\uff09",
      acc: "\u4e0d\u900f\u660e\u5ea6",
      depth: "\u6df1\u5ea6"
    }
  };

  var NEAR = 2.0, FAR = 6.0, SMAX = 20.0;
  var SIG = "\u03c3";

  function setup(el) {
    var L = TEXT[el.dataset.lang] || TEXT.en;
    el.innerHTML = "";
    el.style.position = "relative";
    el.style.background = "#ffffff";
    el.style.padding = "8px";
    el.style.boxSizing = "border-box";
    el.style.color = "#222";
    el.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', sans-serif";

    var hint = document.createElement("div");
    hint.textContent = L.hint;
    hint.style.fontSize = "13px";
    hint.style.margin = "0 0 6px 2px";
    el.appendChild(hint);

    var canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.touchAction = "none";
    canvas.style.cursor = "pointer";
    el.appendChild(canvas);

    var ctrl = document.createElement("label");
    ctrl.style.display = "flex";
    ctrl.style.alignItems = "center";
    ctrl.style.gap = "8px";
    ctrl.style.fontSize = "13px";
    ctrl.style.marginTop = "6px";
    var span = document.createElement("span");
    var slider = document.createElement("input");
    slider.type = "range"; slider.min = "4"; slider.max = "128"; slider.step = "1"; slider.value = "32";
    slider.style.flex = "1";
    slider.style.maxWidth = "320px";
    ctrl.appendChild(span); ctrl.appendChild(slider);
    el.appendChild(ctrl);
    // the post's code sets the last interval to 1e10 so that the last sample absorbs whatever
    // is left; unchecked, the last interval ends at t_f and the white background can show
    var ctrl2 = document.createElement("label");
    ctrl2.style.display = "flex"; ctrl2.style.alignItems = "center"; ctrl2.style.gap = "6px";
    ctrl2.style.fontSize = "13px"; ctrl2.style.marginTop = "4px";
    var big = document.createElement("input");
    big.type = "checkbox"; big.checked = false;
    var span2 = document.createElement("span");
    span2.textContent = "\u03b4_N = 1e10";
    ctrl2.appendChild(big); ctrl2.appendChild(span2);
    el.appendChild(ctrl2);

    // the same default field as the static figures: faint orange fog, dense blue surface,
    // and a green surface hidden behind it
    var bumps = [
      { m: 3.0, s: 0.30, h: 1.2, c: [1.0, 0.5, 0.05] },
      { m: 4.4, s: 0.18, h: 15.0, c: [0.12, 0.47, 0.71] },
      { m: 5.3, s: 0.20, h: 8.0, c: [0.17, 0.63, 0.17] }
    ];

    var W = 0, H = 0, dpr = 1, lay = null, drag = -1;
    var ctx = canvas.getContext("2d");

    function field(t) {
      var sig = 0, r = 0, g = 0, b = 0;
      for (var k = 0; k < bumps.length; k++) {
        var B = bumps[k], z = (t - B.m) / B.s, p = B.h * Math.exp(-0.5 * z * z);
        sig += p; r += p * B.c[0]; g += p * B.c[1]; b += p * B.c[2];
      }
      if (sig > 1e-12) { r /= sig; g /= sig; b /= sig; } else { r = g = b = 0.5; }
      return [sig, [r, g, b]];
    }

    function render() {
      var N = parseInt(slider.value, 10);
      var t = [], sig = [], col = [], alpha = [], T = [], w = [];
      for (var i = 0; i < N; i++) {
        t.push(NEAR + (FAR - NEAR) * (i + 0.5) / N);           // midpoints (perturb=False)
        var f = field(t[i]); sig.push(f[0]); col.push(f[1]);
      }
      var trans = 1.0, C = [0, 0, 0], acc = 0, depth = 0;
      for (i = 0; i < N; i++) {
        var delta = i < N - 1 ? t[i + 1] - t[i] : (big.checked ? 1e10 : FAR - t[i]);
        alpha.push(1.0 - Math.exp(-sig[i] * delta));
        T.push(trans);
        w.push(trans * alpha[i]);
        trans *= 1.0 - alpha[i];
        acc += w[i]; depth += w[i] * t[i];
        for (var c = 0; c < 3; c++) C[c] += w[i] * col[i][c];
      }
      for (c = 0; c < 3; c++) C[c] += 1.0 - acc;              // white background
      return { N: N, t: t, sig: sig, col: col, alpha: alpha, T: T, w: w, C: C, acc: acc, depth: depth };
    }

    function rgb(c, a) {
      var s = [0, 1, 2].map(function (k) { return Math.round(255 * Math.min(1, Math.max(0, c[k]))); });
      return a === undefined ? "rgb(" + s.join(",") + ")" : "rgba(" + s.join(",") + "," + a + ")";
    }

    function layout() {
      var wide = W >= 560;
      var side = wide ? 150 : 0;
      var left = 54, right = W - side - 16;
      var bottomRow = wide ? 0 : 86;
      var top1 = 14, h1 = (H - bottomRow - 64) * 0.5;
      var top2 = top1 + h1 + 26, h2 = h1;
      return { wide: wide, left: left, right: right, top1: top1, h1: h1, top2: top2, h2: h2, side: side, bottomRow: bottomRow };
    }

    function X(t) { return lay.left + (t - NEAR) / (FAR - NEAR) * (lay.right - lay.left); }
    function Y1(s) { return lay.top1 + lay.h1 * (1 - s / SMAX); }
    function Y2(v) { return lay.top2 + lay.h2 * (1 - v); }

    function axes(top, h, ticks, fmt, label) {
      ctx.strokeStyle = "#e6e6e6"; ctx.lineWidth = 1; ctx.fillStyle = "#555";
      ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ticks.forEach(function (v) {
        var y = v[1];
        ctx.beginPath(); ctx.moveTo(lay.left, y); ctx.lineTo(lay.right, y); ctx.stroke();
        ctx.fillText(fmt(v[0]), lay.left - 5, y);
      });
      ctx.strokeStyle = "#444"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(lay.left, top); ctx.lineTo(lay.left, top + h); ctx.lineTo(lay.right, top + h); ctx.stroke();
      ctx.save(); ctx.translate(11, top + h / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center"; ctx.font = "12px system-ui, sans-serif"; ctx.fillStyle = "#222";
      ctx.fillText(label, 0, 0); ctx.restore();
    }

    function draw() {
      var R = render();
      span.textContent = L.n + " = " + R.N;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);

      // panel 1: sigma(t) continuous, sigma_i at samples, handles
      axes(lay.top1, lay.h1, [0, 5, 10, 15, 20].map(function (v) { return [v, Y1(v)]; }),
        function (v) { return String(v); }, SIG + "(t)");
      ctx.beginPath();
      for (var px = 0; px <= 300; px++) {
        var tt = NEAR + (FAR - NEAR) * px / 300, s = Math.min(field(tt)[0], SMAX * 1.05);
        if (px === 0) ctx.moveTo(X(tt), Y1(s)); else ctx.lineTo(X(tt), Y1(s));
      }
      ctx.strokeStyle = "#7f7f7f"; ctx.lineWidth = 1.8; ctx.stroke();
      var i;
      for (i = 0; i < R.N; i++) {
        ctx.fillStyle = rgb(R.col[i]);
        ctx.beginPath(); ctx.arc(X(R.t[i]), Y1(Math.min(R.sig[i], SMAX)), R.N > 64 ? 1.8 : 2.8, 0, 2 * Math.PI); ctx.fill();
      }
      bumps.forEach(function (B, k) {
        ctx.beginPath(); ctx.arc(X(B.m), Y1(B.h), drag === k ? 10 : 8, 0, 2 * Math.PI);
        ctx.fillStyle = rgb(B.c); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "#222"; ctx.stroke();
      });

      // panel 2: T_i (purple steps) and w_i (coloured bars)
      axes(lay.top2, lay.h2, [0, 0.25, 0.5, 0.75, 1].map(function (v) { return [v, Y2(v)]; }),
        function (v) { return v.toFixed(2); }, "T\u1d62 , w\u1d62");
      var bw = Math.max(1.5, 0.7 * (X(R.t[1] || FAR) - X(R.t[0])));
      for (i = 0; i < R.N; i++) {
        ctx.fillStyle = rgb(R.col[i], 0.9);
        var y = Y2(R.w[i]);
        ctx.fillRect(X(R.t[i]) - bw / 2, y, bw, Y2(0) - y);
      }
      ctx.beginPath();
      for (i = 0; i < R.N; i++) {
        var x0 = i === 0 ? X(NEAR) : X(R.t[i - 1]);
        if (i === 0) ctx.moveTo(x0, Y2(R.T[0]));
        ctx.lineTo(X(R.t[i]), Y2(R.T[i]));
        if (i < R.N - 1) ctx.lineTo(X(R.t[i]), Y2(R.T[i] * (1 - R.alpha[i])));
      }
      ctx.strokeStyle = "#9467bd"; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "top";
      ctx.fillStyle = "#9467bd"; ctx.fillText("T\u1d62 = \u220f(1 \u2212 \u03b1\u2c7c)", lay.right, lay.top2 + 2);
      ctx.fillStyle = "#333"; ctx.fillText("w\u1d62 = T\u1d62 \u03b1\u1d62", lay.right, lay.top2 + 18);

      // t axis ticks
      ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = "#555"; ctx.font = "11px system-ui, sans-serif";
      for (var tk = 2; tk <= 6; tk++) {
        ctx.fillText(String(tk), X(tk), lay.top2 + lay.h2 + 4);
        ctx.fillText(String(tk), X(tk), lay.top1 + lay.h1 + 4);
      }
      ctx.textAlign = "left"; ctx.font = "italic 13px system-ui, sans-serif";
      ctx.fillText("t", lay.right + 5, lay.top2 + lay.h2 + 2);

      // result: composited colour swatch, opacity, depth
      var sx, sy, sw, sh, tx, ty;
      if (lay.wide) { sx = W - lay.side + 18; sy = lay.top1 + 24; sw = lay.side - 30; sh = 90; }
      else { sx = lay.left; sy = H - lay.bottomRow + 14; sw = 70; sh = 52; }
      ctx.fillStyle = rgb(R.C); ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = "#444"; ctx.lineWidth = 1; ctx.strokeRect(sx, sy, sw, sh);
      ctx.fillStyle = "#222"; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.font = "12px system-ui, sans-serif";
      if (lay.wide) {
        wrap(L.col, sx, sy - 22, sw + 12);
        tx = sx; ty = sy + sh + 10;
      } else {
        tx = sx + sw + 12;
        if (ctx.measureText(L.col).width <= W - tx - 4) { ctx.fillText(L.col, tx, sy); ty = sy + 18; }
        else { wrap(L.col, tx, sy + 8, 0); ty = sy + 34; }
      }
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText(L.acc + " \u03a3w\u1d62 = " + R.acc.toFixed(3), tx, ty);
      ctx.fillText(L.depth + " \u03a3w\u1d62t\u1d62 = " + R.depth.toFixed(2), tx, ty + 18);
    }

    function wrap(text, x, y, maxw) {
      if (ctx.measureText(text).width <= maxw) { ctx.fillText(text, x, y); return; }
      var cut = text.indexOf(" (") > 0 ? text.indexOf(" (") : (text.indexOf("\uff08") > 0 ? text.indexOf("\uff08") : -1);
      if (cut > 0) { ctx.fillText(text.slice(0, cut), x, y - 8); ctx.fillText(text.slice(cut).trim(), x, y + 7); }
      else ctx.fillText(text, x, y);
    }

    function resize() {
      var w = Math.max(260, el.clientWidth - 16);
      if (w === W) return;
      W = w;
      H = W >= 560 ? 330 : 380;
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.height = H + "px";
      lay = layout();
      draw();
    }

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
    }

    canvas.addEventListener("pointerdown", function (e) {
      var p = pos(e), best = -1, bd = 26;
      bumps.forEach(function (B, k) {
        var d = Math.hypot(p[0] - X(B.m), p[1] - Y1(B.h));
        if (d < bd) { bd = d; best = k; }
      });
      if (best >= 0) { drag = best; canvas.setPointerCapture(e.pointerId); e.preventDefault(); draw(); }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (drag < 0) return;
      var p = pos(e), B = bumps[drag];
      B.m = Math.min(FAR - 0.05, Math.max(NEAR + 0.05, NEAR + (p[0] - lay.left) / (lay.right - lay.left) * (FAR - NEAR)));
      B.h = Math.min(SMAX, Math.max(0, SMAX * (1 - (p[1] - lay.top1) / lay.h1)));
      draw();
    });
    function end() { if (drag >= 0) { drag = -1; draw(); } }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    slider.addEventListener("input", draw);
    big.addEventListener("change", draw);

    if (window.ResizeObserver) new ResizeObserver(resize).observe(el);
    else window.addEventListener("resize", resize);
    resize();
  }

  function init() {
    var els = document.querySelectorAll('[data-widget="neural-rendering-volume-ray"]');
    for (var i = 0; i < els.length; i++) setup(els[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
