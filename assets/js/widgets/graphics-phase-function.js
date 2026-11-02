/* Phase-function explorer (graphics post 10). Plain JS + Canvas 2D, no dependencies.
   Draws a phase function p(theta) as a polar lobe around the direction in which light travels,
   and live-samples 3D scattering directions with the post's inverse-CDF HG sampler (rejection
   sampling for Rayleigh and Draine with alpha = 1). Dots are the sampled unit vectors projected
   onto the page; the strip below compares the histogram of cos(theta) with the exact pdf.
   Embedded with _includes/widget.liquid, name "graphics-phase-function". */
(function () {
  "use strict";
  var TXT = {
    en: { g: "asymmetry g", dir: "incoming direction", log: "log scale", mode: "phase function",
          reset: "resample", drag: "drag: where light comes from", samples: "samples",
          mean: "mean cos\u03b8", expect: "exact", hist: "cos\u03b8: histogram (bars) vs pdf (line)" },
    zh: { g: "\u4e0d\u5bf9\u79f0\u53c2\u6570 g", dir: "\u5165\u5c04\u65b9\u5411", log: "\u5bf9\u6570\u5750\u6807",
          mode: "\u76f8\u51fd\u6570", reset: "\u91cd\u65b0\u91c7\u6837", drag: "\u62d6\u52a8\u4ee5\u8bbe\u7f6e\u5149\u7684\u6765\u5411",
          samples: "\u6837\u672c", mean: "\u5e73\u5747 cos\u03b8", expect: "\u7cbe\u786e\u503c",
          hist: "cos\u03b8 \u76f4\u65b9\u56fe\uff08\u67f1\uff09\u4e0e\u6982\u7387\u5bc6\u5ea6\uff08\u7ebf\uff09" },
    ja: { g: "\u975e\u5bfe\u79f0\u30d1\u30e9\u30e1\u30fc\u30bf g", dir: "\u5165\u5c04\u65b9\u5411", log: "\u5bfe\u6570\u8868\u793a",
          mode: "\u4f4d\u76f8\u95a2\u6570", reset: "\u518d\u30b5\u30f3\u30d7\u30eb", drag: "\u30c9\u30e9\u30c3\u30b0\u3067\u5149\u306e\u5165\u5c04\u65b9\u5411\u3092\u8a2d\u5b9a",
          samples: "\u30b5\u30f3\u30d7\u30eb\u6570", mean: "\u5e73\u5747 cos\u03b8", expect: "\u53b3\u5bc6\u5024",
          hist: "cos\u03b8 \u306e\u30d2\u30b9\u30c8\u30b0\u30e9\u30e0\uff08\u68d2\uff09\u3068\u78ba\u7387\u5bc6\u5ea6\uff08\u7dda\uff09" }
  };
  var MODES = [["hg", "Henyey-Greenstein"], ["dr", "Draine (\u03b1 = 1)"], ["ray", "Rayleigh"]];
  var COL = { lobe: "#9467bd", fill: "rgba(148,103,189,0.16)", dot: "rgba(255,127,14,0.55)", light: "#e6a00e",
              grid: "#d8d8d8", dark: "#222", iso: "#7f7f7f", bar: "rgba(31,119,180,0.35)", pdf: "#1f77b4" };
  var PI = Math.PI, INV4PI = 1 / (4 * PI), NMAX = 6000, BINS = 40, PER_FRAME = 60;

  function hg(mu, g) { var d = 1 + g * g - 2 * g * mu; return INV4PI * (1 - g * g) / (d * Math.sqrt(d)); }
  function phase(mode, mu, g) {
    if (mode === "ray") return 3 / (16 * PI) * (1 + mu * mu);
    if (mode === "dr") return hg(mu, g) * (1 + mu * mu) / (1 + (1 + 2 * g * g) / 3);
    return hg(mu, g);
  }
  // inverse CDF of HG in cos(theta), theta measured from the direction of travel
  function sampleHG(g) {
    var xi = Math.random();
    if (Math.abs(g) < 1e-3) return 1 - 2 * xi;
    var s = (1 - g * g) / (1 - g + 2 * g * xi);
    return (1 + g * g - s * s) / (2 * g);
  }
  function sampleMu(mode, g) {
    var mu;
    if (mode === "ray") { do { mu = 1 - 2 * Math.random(); } while (2 * Math.random() > 1 + mu * mu); return mu; }
    if (mode === "dr") { do { mu = sampleHG(g); } while (2 * Math.random() > 1 + mu * mu); return mu; }
    return sampleHG(g);
  }
  function exactMean(mode, g) {
    var n = 2000, s = 0, i, mu;
    for (i = 0; i < n; i++) { mu = -1 + 2 * (i + 0.5) / n; s += 2 * PI * phase(mode, mu, g) * mu * 2 / n; }
    return s;
  }

  function slider(parent, label, min, max, step, value, digits, onInput) {
    var row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:8px;margin:2px 0;font-size:14px;flex:1 1 230px;min-width:0";
    var name = document.createElement("span");
    name.textContent = label;
    name.style.cssText = "white-space:nowrap;min-width:7em";
    var inp = document.createElement("input");
    inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = value;
    inp.style.cssText = "flex:1;min-width:60px";
    var val = document.createElement("span");
    val.style.cssText = "width:3.4em;text-align:right;font-variant-numeric:tabular-nums";
    row.appendChild(name); row.appendChild(inp); row.appendChild(val);
    parent.appendChild(row);
    function show() { val.textContent = (+inp.value).toFixed(digits) + (digits === 0 ? "\u00b0" : ""); }
    inp.addEventListener("input", function () { show(); onInput(+inp.value); });
    show();
    return { input: inp, show: show, row: row };
  }

  function init(el) {
    var T = TXT[el.dataset.lang] || TXT.en;
    var s = { g: 0.6, psiDeg: 0, mode: "hg", log: false };
    var samples = [], hist = new Array(BINS), sumMu = 0, running = false, exact = 0;
    el.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.style.cssText = "background:#fff;color:#222;padding:8px 10px 10px;font-family:inherit";
    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;touch-action:none;cursor:crosshair";
    var info = document.createElement("div");
    info.style.cssText = "font-size:13px;margin:4px 0 6px;color:#444;min-height:1.3em";
    var controls = document.createElement("div");
    controls.style.cssText = "display:flex;flex-wrap:wrap;column-gap:18px;align-items:center";
    wrap.appendChild(canvas); wrap.appendChild(info); wrap.appendChild(controls);
    el.appendChild(wrap);
    var ctx = canvas.getContext("2d");

    var sG = slider(controls, T.g, -0.95, 0.95, 0.01, s.g, 2, function (v) { s.g = v; resetSamples(); });
    var sDir = slider(controls, T.dir, 0, 359, 1, s.psiDeg, 0, function (v) { s.psiDeg = v; draw(); });
    var row2 = document.createElement("div");
    row2.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;align-items:center;font-size:14px;margin-top:4px";
    var selLab = document.createElement("label");
    selLab.textContent = T.mode + " ";
    var sel = document.createElement("select");
    sel.style.cssText = "font-size:14px";
    MODES.forEach(function (m) { var o = document.createElement("option"); o.value = m[0]; o.textContent = m[1]; sel.appendChild(o); });
    selLab.appendChild(sel);
    var logLab = document.createElement("label");
    var logBox = document.createElement("input");
    logBox.type = "checkbox";
    logLab.appendChild(logBox); logLab.appendChild(document.createTextNode(" " + T.log));
    var btn = document.createElement("button");
    btn.type = "button"; btn.textContent = T.reset;
    btn.style.cssText = "font-size:14px;padding:2px 10px";
    row2.appendChild(selLab); row2.appendChild(logLab); row2.appendChild(btn);
    controls.appendChild(row2);
    sel.addEventListener("change", function () {
      s.mode = sel.value;
      sG.input.disabled = s.mode === "ray";
      sG.row.style.opacity = s.mode === "ray" ? "0.45" : "1";
      resetSamples();
    });
    logBox.addEventListener("change", function () { s.log = logBox.checked; draw(); });
    btn.addEventListener("click", resetSamples);

    var W = 0, H = 0, Hp = 0, ox = 0, oy = 0, R = 0;
    function resize() {
      var w = wrap.clientWidth - 20;
      if (w <= 0) return;
      Hp = Math.round(Math.min(Math.max(w * 0.6, 240), 340));
      var h = Hp + 96;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = w; H = h; ox = W / 2; oy = Hp / 2 + 4; R = Math.min(W / 2, Hp / 2) - 16;
      draw();
    }

    function resetSamples() {
      samples = []; sumMu = 0;
      for (var i = 0; i < BINS; i++) hist[i] = 0;
      exact = exactMean(s.mode, s.g);
      if (!running) { running = true; requestAnimationFrame(tick); }
      draw();
    }
    function tick() {
      for (var k = 0; k < PER_FRAME && samples.length < NMAX; k++) {
        var mu = Math.max(-1, Math.min(1, sampleMu(s.mode, s.g)));
        samples.push([mu, 2 * PI * Math.random()]);
        sumMu += mu;
        hist[Math.min(BINS - 1, Math.floor((mu + 1) / 2 * BINS))]++;
      }
      draw();
      if (samples.length < NMAX) requestAnimationFrame(tick); else running = false;
    }

    function radius(p, pmax) {
      if (!s.log) return p / pmax;
      var top = Math.max(Math.log(4 * PI * pmax) / Math.LN10 + 2, 2.3);
      return Math.max(Math.log(4 * PI * p) / Math.LN10 + 2, 0) / top;
    }

    function arrow(x0, y0, x1, y1, color, lw) {
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      var a = Math.atan2(y1 - y0, x1 - x0), k = 7 + 2 * lw;
      ctx.beginPath(); ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - k * Math.cos(a - 0.4), y1 - k * Math.sin(a - 0.4));
      ctx.lineTo(x1 - k * Math.cos(a + 0.4), y1 - k * Math.sin(a + 0.4));
      ctx.closePath(); ctx.fill();
    }

    function draw() {
      if (!W) return;
      var psi = s.psiDeg * PI / 180, cp = Math.cos(psi), sp = Math.sin(psi), i;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      // grid
      ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ox, oy, R, 0, 2 * PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox - R, oy); ctx.lineTo(ox + R, oy); ctx.moveTo(ox, oy - R); ctx.lineTo(ox, oy + R); ctx.stroke();
      // sampled directions: unit vectors (sin t cos phi, sin t sin phi, cos t) projected onto the page
      ctx.fillStyle = COL.dot;
      for (i = 0; i < samples.length; i++) {
        var mu = samples[i][0], st = Math.sqrt(Math.max(0, 1 - mu * mu)), lat = st * Math.cos(samples[i][1]);
        var x = mu * cp - lat * sp, y = mu * sp + lat * cp;      // rotate (forward, lateral) by psi
        ctx.fillRect(ox + R * x - 1.2, oy - R * y - 1.2, 2.4, 2.4);
      }
      // lobe
      var pmax = 0, n = 360, pts = [];
      for (i = 0; i <= n; i++) pmax = Math.max(pmax, phase(s.mode, Math.cos(2 * PI * i / n), s.g));
      for (i = 0; i <= n; i++) {
        var th = 2 * PI * i / n, r = R * radius(phase(s.mode, Math.cos(th), s.g), pmax), a = psi + th;
        pts.push([ox + r * Math.cos(a), oy - r * Math.sin(a)]);
      }
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath(); ctx.fillStyle = COL.fill; ctx.fill();
      ctx.strokeStyle = COL.lobe; ctx.lineWidth = 3; ctx.stroke();
      // isotropic reference 1/(4 pi)
      var ri = R * radius(INV4PI, pmax);
      ctx.setLineDash([5, 5]); ctx.strokeStyle = COL.iso; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(ox, oy, Math.max(ri, 0.5), 0, 2 * PI); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COL.iso; ctx.font = "12px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("1/4\u03c0", ox + ri * 0.72 + 4, oy - ri * 0.72 - 4);
      // incoming light: travels along psi, arrives from the opposite side
      var lx = ox - (R + 6) * cp, ly = oy + (R + 6) * sp;
      arrow(lx, ly, ox - 10 * cp, oy + 10 * sp, COL.light, 3);
      ctx.beginPath(); ctx.arc(lx, ly, 8, 0, 2 * PI); ctx.fillStyle = COL.light; ctx.fill();
      ctx.font = "italic 16px serif"; ctx.fillStyle = COL.dark; ctx.textAlign = "center";
      ctx.fillText("\u03c9", ox - 0.55 * R * cp - 12 * sp, oy + 0.55 * R * sp - 12 * cp + 5);
      // labels
      ctx.font = "12px sans-serif"; ctx.textAlign = "right"; ctx.fillStyle = "#666";
      ctx.fillText(T.drag, W - 6, 14);
      ctx.textAlign = "left";
      ctx.fillText(s.log ? "r = log\u2081\u2080(4\u03c0p) + 2" : "r \u221d p(\u03b8)", 6, 14);
      // histogram strip
      var top = Hp + 18, hh = H - top - 18, left = 34, right = W - 8, bw = (right - left) / BINS;
      ctx.fillStyle = "#555"; ctx.font = "12px sans-serif"; ctx.textAlign = "left";
      ctx.fillText(T.hist, left, top - 4);
      var dens = [], ymax = 0, N = samples.length, m = 120, curve = [];
      for (i = 0; i < BINS; i++) { dens.push(N ? hist[i] / (N * 2 / BINS) : 0); }
      for (i = 0; i <= m; i++) { var mu2 = -1 + 2 * i / m; curve.push(2 * PI * phase(s.mode, mu2, s.g)); ymax = Math.max(ymax, curve[i]); }
      function yOf(v) {
        if (!s.log) return top + hh - hh * Math.min(v / (ymax * 1.05), 1);
        var lo = -2, hi = Math.log(ymax * 1.5) / Math.LN10;
        var t = (Math.log(Math.max(v, 1e-6)) / Math.LN10 - lo) / (hi - lo);
        return top + hh - hh * Math.max(0, Math.min(1, t));
      }
      ctx.fillStyle = COL.bar;
      for (i = 0; i < BINS; i++) {
        if (dens[i] <= 0) continue;
        var y0 = yOf(dens[i]);
        ctx.fillRect(left + i * bw + 0.5, y0, bw - 1, top + hh - y0);
      }
      ctx.strokeStyle = COL.pdf; ctx.lineWidth = 2; ctx.beginPath();
      for (i = 0; i <= m; i++) {
        var xx = left + (right - left) * i / m, yy = yOf(curve[i]);
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      ctx.strokeStyle = COL.dark; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, top + hh); ctx.lineTo(right, top + hh); ctx.stroke();
      ctx.fillStyle = "#444"; ctx.textAlign = "center";
      [-1, -0.5, 0, 0.5, 1].forEach(function (v) { ctx.fillText(String(v), left + (right - left) * (v + 1) / 2, top + hh + 13); });
      info.textContent = T.samples + " " + N + " \u00b7 " + T.mean + " = " + (N ? (sumMu / N).toFixed(3) : "-") +
        " \u00b7 " + T.expect + " " + exact.toFixed(3);
    }

    function setFromPointer(e) {
      var r = canvas.getBoundingClientRect();
      var px = e.clientX - r.left - ox, py = oy - (e.clientY - r.top);
      if (px * px + py * py < 16) return;
      var deg = Math.atan2(-py, -px) * 180 / PI;      // light travels from the pointer towards the centre
      s.psiDeg = Math.round((deg + 360) % 360) % 360;
      sDir.input.value = s.psiDeg; sDir.show();
      draw();
    }
    var dragging = false;
    canvas.addEventListener("pointerdown", function (e) {
      var r = canvas.getBoundingClientRect();
      if (e.clientY - r.top > Hp + 8) return;           // histogram area: no drag
      dragging = true; canvas.setPointerCapture(e.pointerId); setFromPointer(e); e.preventDefault();
    });
    canvas.addEventListener("pointermove", function (e) { if (dragging) setFromPointer(e); });
    function stop(e) { dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch (err) {} }
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);

    if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);
    else window.addEventListener("resize", resize);
    resize();
    resetSamples();
  }

  function start() {
    var els = document.querySelectorAll('[data-widget="graphics-phase-function"]');
    for (var i = 0; i < els.length; i++) if (!els[i].dataset.ready) { els[i].dataset.ready = "1"; init(els[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
