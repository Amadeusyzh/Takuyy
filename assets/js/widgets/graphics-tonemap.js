/* Tone-mapping explorer (graphics post 11). Plain JS + Canvas 2D, no dependencies.
   An HDR test chart (six hues, each ramping over 12 stops of scene luminance) is exposed by
   2^EV, tone mapped with the selected operator and sRGB-encoded. Below, the operator's curve for
   gray input on a log2 axis. Operators: clamp, Reinhard, extended Reinhard (white 4), Hable
   filmic (Uncharted 2 constants), the ACES fit by Narkowicz (per channel) and Khronos PBR Neutral.
   Embedded with _includes/widget.liquid, name "graphics-tonemap". */
(function () {
  "use strict";
  var TXT = {
    en: { ev: "exposure (EV)", op: "tone mapper", axis: "scene luminance (stops, log\u2082)", out: "sRGB out" },
    zh: { ev: "\u66dd\u5149 (EV)", op: "\u8272\u8c03\u6620\u5c04\u7b97\u5b50", axis: "\u573a\u666f\u4eae\u5ea6\uff08\u6863\uff0clog\u2082\uff09", out: "sRGB \u8f93\u51fa" },
    ja: { ev: "\u9732\u51fa (EV)", op: "\u30c8\u30fc\u30f3\u30de\u30c3\u30d4\u30f3\u30b0\u6f14\u7b97\u5b50", axis: "\u30b7\u30fc\u30f3\u8f1d\u5ea6\uff08\u6bb5\u3001log\u2082\uff09", out: "sRGB \u51fa\u529b" }
  };
  var OPS = [["clamp", "clamp"], ["reinhard", "Reinhard"], ["rext", "Reinhard ext. (Lw = 4)"], ["hable", "Hable filmic"],
             ["aces", "ACES fit (Narkowicz)"], ["neutral", "Khronos PBR Neutral"]];
  var HUES = [[1, 1, 1], [1, 0.08, 0.04], [1, 0.45, 0.08], [0.15, 1, 0.2], [0.08, 0.2, 1], [0.8, 0.5, 0.38]];
  var STOPS_LO = -6, STOPS_HI = 6;

  function hableP(x) { var A = 0.15, B = 0.5, C = 0.1, D = 0.2, E = 0.02, F = 0.3; return (x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F) - E / F; }
  var HW = hableP(11.2);
  function scalar(op, x) {
    if (op === "clamp") return Math.min(x, 1);
    if (op === "reinhard") return x / (1 + x);
    if (op === "rext") return x * (1 + x / 16) / (1 + x);
    if (op === "hable") return hableP(2 * x) / HW;
    var y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
    return Math.max(0, Math.min(1, y));
  }
  function neutral(c) {
    var r = c[0], g = c[1], b = c[2], x = Math.min(r, g, b), off = x < 0.08 ? x - 6.25 * x * x : 0.04;
    r -= off; g -= off; b -= off;
    var peak = Math.max(r, g, b), start = 0.76, d = 0.24;
    if (peak < start) return [r, g, b];
    var np = 1 - d * d / (peak + d - start), s = np / peak;
    r *= s; g *= s; b *= s;
    var t = 1 - 1 / (0.15 * (peak - np) + 1);
    return [r * (1 - t) + np * t, g * (1 - t) + np * t, b * (1 - t) + np * t];
  }
  function mapRGB(op, c) {
    if (op === "neutral") return neutral(c);
    return [scalar(op, c[0]), scalar(op, c[1]), scalar(op, c[2])];
  }
  function enc(x) { x = Math.max(0, Math.min(1, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; }

  function init(el) {
    var T = TXT[el.dataset.lang] || TXT.en;
    var st = { op: "aces", ev: 0 };
    el.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.style.cssText = "background:#fff;color:#222;padding:8px 10px 10px;font-family:inherit";
    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;touch-action:none";
    var controls = document.createElement("div");
    controls.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center;font-size:14px;margin-top:6px";
    wrap.appendChild(canvas); wrap.appendChild(controls); el.appendChild(wrap);
    var ctx = canvas.getContext("2d");
    var row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:8px;flex:1 1 230px;min-width:0";
    var nm = document.createElement("span"); nm.textContent = T.ev; nm.style.whiteSpace = "nowrap";
    var inp = document.createElement("input"); inp.type = "range"; inp.min = -4; inp.max = 4; inp.step = 0.1; inp.value = 0; inp.style.cssText = "flex:1;min-width:60px";
    var val = document.createElement("span"); val.style.cssText = "width:3em;text-align:right";
    row.appendChild(nm); row.appendChild(inp); row.appendChild(val);
    var selLab = document.createElement("label"); selLab.textContent = T.op + " ";
    var sel = document.createElement("select"); sel.style.fontSize = "14px";
    OPS.forEach(function (o) { var e = document.createElement("option"); e.value = o[0]; e.textContent = o[1]; sel.appendChild(e); });
    sel.value = st.op; selLab.appendChild(sel);
    controls.appendChild(selLab); controls.appendChild(row);
    function showEV() { val.textContent = (st.ev > 0 ? "+" : "") + st.ev.toFixed(1); }
    inp.addEventListener("input", function () { st.ev = +inp.value; showEV(); draw(); });
    sel.addEventListener("change", function () { st.op = sel.value; draw(); });
    showEV();

    var off = document.createElement("canvas");
    var W = 0, H = 0, chartH = 0, left = 36;
    function resize() {
      var w = wrap.clientWidth - 20;
      if (w <= 0) return;
      chartH = 6 * Math.round(Math.max(18, Math.min(28, w / 26)));
      var h = chartH + 24 + Math.round(Math.min(Math.max(w * 0.34, 150), 210)) + 34;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = w; H = h;
      off.width = Math.max(64, Math.min(Math.round((W - left - 8) * dpr), 720)); off.height = 6;
      draw();
    }

    function draw() {
      if (!W) return;
      var expo = Math.pow(2, st.ev), i, k;
      // chart: 6 rows x off.width columns, then scaled up (nearest) to the chart area
      var oc = off.getContext("2d"), img = oc.createImageData(off.width, 6), d = img.data;
      for (k = 0; k < 6; k++) {
        for (i = 0; i < off.width; i++) {
          var stop = STOPS_LO + (STOPS_HI - STOPS_LO) * (i + 0.5) / off.width, Lum = Math.pow(2, stop) * 0.18 * expo;
          var c = mapRGB(st.op, [HUES[k][0] * Lum, HUES[k][1] * Lum, HUES[k][2] * Lum]), p = 4 * (k * off.width + i);
          d[p] = Math.round(255 * enc(c[0])); d[p + 1] = Math.round(255 * enc(c[1])); d[p + 2] = Math.round(255 * enc(c[2])); d[p + 3] = 255;
        }
      }
      oc.putImageData(img, 0, 0);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, left, 4, W - left - 8, chartH);
      ctx.imageSmoothingEnabled = true;
      // curve panel
      var top = chartH + 24, ph = H - top - 34, right = W - 8;
      function X(s) { return left + (right - left) * (s - STOPS_LO) / (STOPS_HI - STOPS_LO); }
      function Y(v) { return top + ph - ph * v; }
      ctx.strokeStyle = "#e3e3e3"; ctx.lineWidth = 1;
      for (k = STOPS_LO; k <= STOPS_HI; k += 2) { ctx.beginPath(); ctx.moveTo(X(k), top); ctx.lineTo(X(k), top + ph); ctx.stroke(); }
      [0, 0.5, 1].forEach(function (v) { ctx.beginPath(); ctx.moveTo(left, Y(v)); ctx.lineTo(right, Y(v)); ctx.stroke(); });
      function curve(op, color, lw, dash) {
        ctx.beginPath();
        for (var j = 0; j <= 240; j++) {
          var s = STOPS_LO + (STOPS_HI - STOPS_LO) * j / 240, x = Math.pow(2, s) * 0.18 * expo;
          var y = enc(op === "neutral" ? neutral([x, x, x])[0] : scalar(op, x));
          if (j === 0) ctx.moveTo(X(s), Y(y)); else ctx.lineTo(X(s), Y(y));
        }
        ctx.setLineDash(dash || []); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([]);
      }
      curve("clamp", "#9a9a9a", 1.5, [5, 4]);
      curve(st.op, "#9467bd", 3);
      ctx.strokeStyle = "#e6a00e"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(0), top); ctx.lineTo(X(0), top + ph); ctx.stroke();
      ctx.fillStyle = "#444"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
      for (k = STOPS_LO; k <= STOPS_HI; k += 2) ctx.fillText((k > 0 ? "+" : "") + k, X(k), top + ph + 14);
      ctx.fillText(T.axis, (left + right) / 2, H - 4);
      ctx.fillStyle = "#e6a00e"; ctx.fillText("0.18", X(0), top - 4);
      ctx.save(); ctx.translate(12, top + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillStyle = "#444"; ctx.fillText(T.out, 0, 0); ctx.restore();
      ctx.textAlign = "right"; ctx.fillText("1", left - 4, Y(1) + 4); ctx.fillText("0", left - 4, Y(0) + 4);
    }

    if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);
    else window.addEventListener("resize", resize);
    resize();
  }

  function start() {
    var els = document.querySelectorAll('[data-widget="graphics-tonemap"]');
    for (var i = 0; i < els.length; i++) if (!els[i].dataset.ready) { els[i].dataset.ready = "1"; init(els[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
