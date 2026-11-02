/* Frame budget explorer (graphics-engine post 06).
   A deliberately simple model of upscaling + frame generation (the same model as the post's figure):
     render  = t_fixed + (t_native - t_fixed) * s^2        (pixel-bound work scales with pixel count)
     gpu     = render + t_up (if s < 1) + (k - 1) * t_gen   (per rendered frame)
     frame   = max(gpu, t_cpu)                              (CPU and GPU pipelined)
     shown   = min(k * 1000 / frame, refresh)
     latency = t_cpu + gpu + (frame if k > 1: interpolation holds one rendered frame) + half a display interval
   Sliders: internal resolution scale s, base (native) render cost, upscaler cost, frame-generation factor k. */
(function () {
  "use strict";
  var TXT = {
    en: { scale: "internal resolution scale", native: "base render cost at native res (ms)", up: "upscaler cost (ms)",
          k: "frame-generation factor k", refresh: "display refresh", unl: "unlimited",
          rendered: "rendered fps", shown: "displayed fps", gpu: "GPU time / rendered frame", lat: "estimated input latency",
          bound: "CPU-bound", strip: "first 100 ms: rendered (blue) and generated (green) frames",
          parts: ["render (fixed)", "render (pixels)", "upscale", "frame gen"],
          lparts: ["CPU", "GPU", "hold for interpolation", "display wait"], note: "t_cpu = 4 ms, t_fixed = 2 ms, 1 ms per generated frame" },
    zh: { scale: "\u{5185}\u{90e8}\u{5206}\u{8fa8}\u{7387}\u{7f29}\u{653e}", native: "\u{539f}\u{751f}\u{5206}\u{8fa8}\u{7387}\u{4e0b}\u{7684}\u{6e32}\u{67d3}\u{4ee3}\u{4ef7} (ms)", up: "\u{8d85}\u{5206}\u{4ee3}\u{4ef7} (ms)",
          k: "\u{5e27}\u{751f}\u{6210}\u{500d}\u{6570} k", refresh: "\u{663e}\u{793a}\u{5237}\u{65b0}\u{7387}", unl: "\u{4e0d}\u{9650}",
          rendered: "\u{6e32}\u{67d3}\u{5e27}\u{7387}", shown: "\u{663e}\u{793a}\u{5e27}\u{7387}", gpu: "\u{6bcf}\u{4e2a}\u{6e32}\u{67d3}\u{5e27}\u{7684} GPU \u{65f6}\u{95f4}", lat: "\u{4f30}\u{8ba1}\u{8f93}\u{5165}\u{5ef6}\u{8fdf}",
          bound: "CPU \u{74f6}\u{9888}", strip: "\u{524d} 100 ms\u{ff1a}\u{6e32}\u{67d3}\u{5e27}\u{ff08}\u{84dd}\u{ff09}\u{4e0e}\u{751f}\u{6210}\u{5e27}\u{ff08}\u{7eff}\u{ff09}",
          parts: ["\u{6e32}\u{67d3}\u{ff08}\u{56fa}\u{5b9a}\u{ff09}", "\u{6e32}\u{67d3}\u{ff08}\u{50cf}\u{7d20}\u{ff09}", "\u{8d85}\u{5206}", "\u{5e27}\u{751f}\u{6210}"],
          lparts: ["CPU", "GPU", "\u{63d2}\u{5e27}\u{7b49}\u{5f85}", "\u{663e}\u{793a}\u{7b49}\u{5f85}"], note: "t_cpu = 4 ms\u{ff0c}t_fixed = 2 ms\u{ff0c}\u{6bcf}\u{4e2a}\u{751f}\u{6210}\u{5e27} 1 ms" },
    ja: { scale: "\u{5185}\u{90e8}\u{89e3}\u{50cf}\u{5ea6}\u{30b9}\u{30b1}\u{30fc}\u{30eb}", native: "\u{30cd}\u{30a4}\u{30c6}\u{30a3}\u{30d6}\u{89e3}\u{50cf}\u{5ea6}\u{3067}\u{306e}\u{63cf}\u{753b}\u{30b3}\u{30b9}\u{30c8} (ms)", up: "\u{30a2}\u{30c3}\u{30d7}\u{30b9}\u{30b1}\u{30fc}\u{30e9}\u{306e}\u{30b3}\u{30b9}\u{30c8} (ms)",
          k: "\u{30d5}\u{30ec}\u{30fc}\u{30e0}\u{751f}\u{6210}\u{500d}\u{7387} k", refresh: "\u{30c7}\u{30a3}\u{30b9}\u{30d7}\u{30ec}\u{30a4}\u{306e}\u{30ea}\u{30d5}\u{30ec}\u{30c3}\u{30b7}\u{30e5}\u{30ec}\u{30fc}\u{30c8}", unl: "\u{7121}\u{5236}\u{9650}",
          rendered: "\u{63cf}\u{753b} fps", shown: "\u{8868}\u{793a} fps", gpu: "\u{63cf}\u{753b}\u{30d5}\u{30ec}\u{30fc}\u{30e0}\u{3042}\u{305f}\u{308a}\u{306e} GPU \u{6642}\u{9593}", lat: "\u{63a8}\u{5b9a}\u{5165}\u{529b}\u{9045}\u{5ef6}",
          bound: "CPU \u{30dc}\u{30c8}\u{30eb}\u{30cd}\u{30c3}\u{30af}", strip: "\u{6700}\u{521d}\u{306e} 100 ms\u{ff1a}\u{63cf}\u{753b}\u{30d5}\u{30ec}\u{30fc}\u{30e0}\u{ff08}\u{9752}\u{ff09}\u{3068}\u{751f}\u{6210}\u{30d5}\u{30ec}\u{30fc}\u{30e0}\u{ff08}\u{7dd1}\u{ff09}",
          parts: ["\u{63cf}\u{753b}\u{ff08}\u{56fa}\u{5b9a}\u{ff09}", "\u{63cf}\u{753b}\u{ff08}\u{753b}\u{7d20}\u{ff09}", "\u{30a2}\u{30c3}\u{30d7}\u{30b9}\u{30b1}\u{30fc}\u{30eb}", "\u{30d5}\u{30ec}\u{30fc}\u{30e0}\u{751f}\u{6210}"],
          lparts: ["CPU", "GPU", "\u{88dc}\u{9593}\u{306e}\u{305f}\u{3081}\u{306e}\u{5f85}\u{3061}", "\u{8868}\u{793a}\u{5f85}\u{3061}"], note: "t_cpu = 4 ms\u{3001}t_fixed = 2 ms\u{3001}\u{751f}\u{6210}\u{30d5}\u{30ec}\u{30fc}\u{30e0} 1 \u{679a}\u{3042}\u{305f}\u{308a} 1 ms" }
  };
  var COLS = ["#7f7f7f", "#1f77b4", "#ff7f0e", "#2ca02c"], LCOLS = ["#9467bd", "#1f77b4", "#d62728", "#bbbbbb"];
  var T_CPU = 4, T_FIXED = 2, T_GEN = 1;

  function model(p) {
    var tf = Math.min(T_FIXED, p.native);
    var render = tf + (p.native - tf) * p.scale * p.scale;
    var up = p.scale < 0.999 ? p.up : 0;
    var gen = (p.k - 1) * T_GEN;
    var gpu = render + up + gen;
    var frame = Math.max(gpu, T_CPU);
    var shown = Math.min(p.k * 1000 / frame, p.refresh || 1e9);
    var hold = p.k > 1 ? frame : 0, wait = 0.5 * 1000 / shown;
    return { parts: [tf, render - tf, up, gen], gpu: gpu, frame: frame, rendered: 1000 / frame, shown: shown,
             lat: [T_CPU, gpu, hold, wait], cpuBound: T_CPU > gpu };
  }

  function setup(el) {
    var lang = TXT[el.dataset.lang] ? el.dataset.lang : "en", T = TXT[lang];
    var p = { scale: 0.67, native: 20, up: 1.0, k: 2, refresh: 240 };
    var wrap = document.createElement("div");
    wrap.style.cssText = "font:13px sans-serif;color:#222";
    var grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px 16px;margin-bottom:8px";
    function slider(key, label, min, max, step, fmt) {
      var box = document.createElement("label"); box.style.cssText = "display:block";
      var t = document.createElement("div"); var inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = p[key];
      inp.style.cssText = "width:100%;touch-action:pan-y";
      function upd() { p[key] = parseFloat(inp.value); t.textContent = label + ": " + fmt(p[key]); draw(); }
      inp.addEventListener("input", upd);
      box.appendChild(t); box.appendChild(inp); grid.appendChild(box);
      t.textContent = label + ": " + fmt(p[key]);
    }
    slider("scale", T.scale, 0.33, 1, 0.01, function (v) { return v.toFixed(2) + " (" + Math.round(v * v * 100) + "% px)"; });
    slider("native", T.native, 4, 50, 0.5, function (v) { return v.toFixed(1); });
    slider("up", T.up, 0, 4, 0.1, function (v) { return v.toFixed(1); });
    slider("k", T.k, 1, 6, 1, function (v) { return String(v); });
    var selBox = document.createElement("label"); selBox.style.cssText = "display:block";
    selBox.textContent = T.refresh + ": ";
    var sel = document.createElement("select");
    [[60, "60 Hz"], [120, "120 Hz"], [144, "144 Hz"], [240, "240 Hz"], [360, "360 Hz"], [0, T.unl]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; if (o[0] === 240) op.selected = true; sel.appendChild(op);
    });
    sel.addEventListener("change", function () { p.refresh = parseFloat(sel.value); draw(); });
    selBox.appendChild(sel); grid.appendChild(selBox);
    var cv = document.createElement("canvas");
    cv.style.cssText = "display:block;width:100%;background:#fcfcfd;border-radius:6px";
    wrap.appendChild(grid); wrap.appendChild(cv); el.appendChild(wrap);
    var ctx = cv.getContext("2d"), W = 0, H = 0;

    function resize() {
      W = el.clientWidth || 600; H = W < 520 ? 330 : 280;
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
    }
    function bar(y, h, vals, cols, scaleMs, x0, w) {
      var x = x0;
      for (var i = 0; i < vals.length; i++) {
        var ww = vals[i] / scaleMs * w; if (ww <= 0) continue;
        ctx.fillStyle = cols[i]; ctx.fillRect(x, y, ww, h); x += ww;
      }
      return x;
    }
    function draw() {
      if (!W) return;
      var r = model(p), small = W < 520, fs = small ? 12 : 13, x0 = 12, w = W - 24;
      ctx.clearRect(0, 0, W, H); ctx.font = "bold " + (small ? 15 : 17) + "px sans-serif";
      var big = [[T.shown, r.shown.toFixed(0) + " fps", "#2ca02c"], [T.rendered, r.rendered.toFixed(0) + " fps", "#1f77b4"],
                 [T.lat, (r.lat[0] + r.lat[1] + r.lat[2] + r.lat[3]).toFixed(1) + " ms", "#d62728"]];
      var cw = w / 3;
      big.forEach(function (b, i) {
        ctx.fillStyle = b[2]; ctx.font = "bold " + (small ? 16 : 20) + "px sans-serif"; ctx.fillText(b[1], x0 + i * cw, 26);
        ctx.fillStyle = "#555"; ctx.font = fs - 1 + "px sans-serif"; ctx.fillText(b[0], x0 + i * cw, 44, cw - 6);
      });
      var maxMs = Math.max(30, r.gpu * 1.1, (r.lat[0] + r.lat[1] + r.lat[2] + r.lat[3]) * 1.05);
      // GPU bar
      ctx.fillStyle = "#222"; ctx.font = fs + "px sans-serif";
      ctx.fillText(T.gpu + ": " + r.gpu.toFixed(1) + " ms" + (r.cpuBound ? "  (" + T.bound + ")" : ""), x0, 70, w);
      bar(78, 20, r.parts, COLS, maxMs, x0, w);
      var lx = x0; ctx.font = (fs - 1) + "px sans-serif";
      var ly = 116;
      T.parts.forEach(function (t, i) {
        var tw = ctx.measureText(t).width + 26; if (lx + tw > W - 8) { lx = x0; ly += 16; }
        ctx.fillStyle = COLS[i]; ctx.fillRect(lx, ly - 9, 10, 10); ctx.fillStyle = "#444"; ctx.fillText(t, lx + 14, ly); lx += tw;
      });
      // latency bar
      var y2 = ly + 26;
      ctx.fillStyle = "#222"; ctx.font = fs + "px sans-serif"; ctx.fillText(T.lat, x0, y2);
      bar(y2 + 8, 20, r.lat, LCOLS, maxMs, x0, w);
      lx = x0; ly = y2 + 46; ctx.font = (fs - 1) + "px sans-serif";
      T.lparts.forEach(function (t, i) {
        var tw = ctx.measureText(t).width + 26; if (lx + tw > W - 8) { lx = x0; ly += 16; }
        ctx.fillStyle = LCOLS[i]; ctx.fillRect(lx, ly - 9, 10, 10); ctx.fillStyle = "#444"; ctx.fillText(t, lx + 14, ly); lx += tw;
      });
      // 10 ms ticks under both bars (same scale)
      ctx.fillStyle = "#999";
      for (var ms = 0; ms <= maxMs; ms += 10) { var tx = x0 + ms / maxMs * w; ctx.fillRect(tx, 98, 1, 4); ctx.fillRect(tx, y2 + 28, 1, 4); }
      // frame strip (first 100 ms)
      var y3 = ly + 22;
      ctx.fillStyle = "#555"; ctx.font = (fs - 1) + "px sans-serif"; ctx.fillText(T.strip, x0, y3, w);
      var sy = y3 + 8, sh = 22;
      ctx.strokeStyle = "#ccc"; ctx.strokeRect(x0, sy, w, sh);
      var interval = 1000 / r.shown, n = 0;
      for (var t = 0; t < 100 && n < 400; t += interval, n++) {
        var gen = p.k > 1 && (n % p.k) !== 0;
        ctx.fillStyle = gen ? "rgba(44,160,44,0.75)" : "rgba(31,119,180,0.9)";
        ctx.fillRect(x0 + t / 100 * w, sy + (gen ? 6 : 1), Math.max(1.5, interval / 100 * w - 1.5), sh - (gen ? 12 : 2));
      }
      ctx.fillStyle = "#999"; ctx.font = "11px sans-serif"; ctx.fillText(T.note, x0, Math.min(H - 4, sy + sh + 16));
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(el); else window.addEventListener("resize", resize);
    resize();
  }
  function init() {
    var els = document.querySelectorAll('[data-widget="graphics-engine-frame-budget"]');
    for (var i = 0; i < els.length; i++) if (!els[i].dataset.ready) { els[i].dataset.ready = "1"; setup(els[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
