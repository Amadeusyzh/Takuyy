/* Box-stack solver explorer (graphics-engine post 05).
   The same 1D toy as the post's stack figures: n unit boxes stacked on the ground, contact k joins box k-1
   (or the ground) and box k with gap C_k >= 0. Each 1/60 s frame spends N constraint sweeps either as
   one step with N Gauss-Seidel iterations (PGS, optionally warm-started) or as N substeps with one sweep
   each (substeps + warm start, like TGS / soft step; or XPBD). Drag down on the stack to push the top box. */
(function () {
  "use strict";
  var TXT = {
    en: { solver: "solver", names: ["PGS (N iterations)", "PGS + warm start", "N substeps + warm start (TGS-like)", "XPBD (N substeps)"],
          n: "boxes", ratio: "top box mass ratio", sweeps: "constraint sweeps per frame N", reset: "reset",
          pen: "max penetration", plot: "max penetration (mm), last 4 s, log scale", mag: "overlaps drawn 5x larger",
          drag: "drag down on the stack to push the top box", top: ["top box below rest", "top box above rest"] },
    zh: { solver: "\u{6c42}\u{89e3}\u{5668}", names: ["PGS\u{ff08}N \u{6b21}\u{8fed}\u{4ee3}\u{ff09}", "PGS + \u{70ed}\u{542f}\u{52a8}", "N \u{4e2a}\u{5b50}\u{6b65} + \u{70ed}\u{542f}\u{52a8}\u{ff08}\u{7c7b}\u{4f3c} TGS\u{ff09}", "XPBD\u{ff08}N \u{4e2a}\u{5b50}\u{6b65}\u{ff09}"],
          n: "\u{76d2}\u{5b50}\u{6570}", ratio: "\u{9876}\u{90e8}\u{76d2}\u{5b50}\u{8d28}\u{91cf}\u{6bd4}", sweeps: "\u{6bcf}\u{5e27}\u{7ea6}\u{675f}\u{626b}\u{63cf}\u{6b21}\u{6570} N", reset: "\u{91cd}\u{7f6e}",
          pen: "\u{6700}\u{5927}\u{7a7f}\u{900f}", plot: "\u{6700}\u{5927}\u{7a7f}\u{900f}\u{ff08}mm\u{ff09}\u{ff0c}\u{6700}\u{8fd1} 4 \u{79d2}\u{ff0c}\u{5bf9}\u{6570}\u{5750}\u{6807}", mag: "\u{91cd}\u{53e0}\u{653e}\u{5927} 5 \u{500d}\u{7ed8}\u{5236}",
          drag: "\u{5728}\u{5806}\u{53e0}\u{4e0a}\u{5411}\u{4e0b}\u{62d6}\u{52a8}\u{53ef}\u{6309}\u{538b}\u{9876}\u{90e8}\u{76d2}\u{5b50}", top: ["\u{9876}\u{90e8}\u{76d2}\u{5b50}\u{4f4e}\u{4e8e}\u{9759}\u{6b62}\u{4f4d}\u{7f6e}", "\u{9876}\u{90e8}\u{76d2}\u{5b50}\u{9ad8}\u{4e8e}\u{9759}\u{6b62}\u{4f4d}\u{7f6e}"] },
    ja: { solver: "\u{30bd}\u{30eb}\u{30d0}", names: ["PGS\u{ff08}N \u{56de}\u{53cd}\u{5fa9}\u{ff09}", "PGS + \u{30a6}\u{30a9}\u{30fc}\u{30e0}\u{30b9}\u{30bf}\u{30fc}\u{30c8}", "N \u{30b5}\u{30d6}\u{30b9}\u{30c6}\u{30c3}\u{30d7} + \u{30a6}\u{30a9}\u{30fc}\u{30e0}\u{30b9}\u{30bf}\u{30fc}\u{30c8}\u{ff08}TGS \u{98a8}\u{ff09}", "XPBD\u{ff08}N \u{30b5}\u{30d6}\u{30b9}\u{30c6}\u{30c3}\u{30d7}\u{ff09}"],
          n: "\u{7bb1}\u{306e}\u{6570}", ratio: "\u{4e00}\u{756a}\u{4e0a}\u{306e}\u{7bb1}\u{306e}\u{8cea}\u{91cf}\u{6bd4}", sweeps: "1 \u{30d5}\u{30ec}\u{30fc}\u{30e0}\u{3042}\u{305f}\u{308a}\u{306e}\u{62d8}\u{675f}\u{8d70}\u{67fb}\u{56de}\u{6570} N", reset: "\u{30ea}\u{30bb}\u{30c3}\u{30c8}",
          pen: "\u{6700}\u{5927}\u{8cab}\u{901a}", plot: "\u{6700}\u{5927}\u{8cab}\u{901a}\u{ff08}mm\u{ff09}\u{3001}\u{76f4}\u{8fd1} 4 \u{79d2}\u{3001}\u{5bfe}\u{6570}\u{8ef8}", mag: "\u{91cd}\u{306a}\u{308a}\u{3092} 5 \u{500d}\u{306b}\u{62e1}\u{5927}\u{3057}\u{3066}\u{63cf}\u{753b}",
          drag: "\u{7a4d}\u{307f}\u{91cd}\u{306d}\u{3092}\u{4e0b}\u{306b}\u{30c9}\u{30e9}\u{30c3}\u{30b0}\u{3059}\u{308b}\u{3068}\u{4e00}\u{756a}\u{4e0a}\u{306e}\u{7bb1}\u{3092}\u{62bc}\u{305b}\u{307e}\u{3059}", top: ["\u{4e00}\u{756a}\u{4e0a}\u{306e}\u{7bb1}\u{306e}\u{9759}\u{6b62}\u{4f4d}\u{7f6e}\u{304b}\u{3089}\u{306e}\u{6c88}\u{307f}", "\u{4e00}\u{756a}\u{4e0a}\u{306e}\u{7bb1}\u{306e}\u{9759}\u{6b62}\u{4f4d}\u{7f6e}\u{304b}\u{3089}\u{306e}\u{6d6e}\u{304d}"] }
  };
  var G = 9.81, DT = 1 / 60, BETA = 0.2, MAG = 5, HIST = 240;
  var COLS = ["#d62728", "#ff7f0e", "#1f77b4", "#9467bd"];

  function Sim(p) {
    var n = p.n, i;
    this.p = p; this.n = n;
    this.w = []; this.y = []; this.v = []; this.lam = [];
    for (i = 0; i < n; i++) { this.w.push(1); this.y.push(i + 0.5); this.v.push(0); this.lam.push(0); }
    this.w[n - 1] = 1 / p.ratio;
    this.hist = [];
  }
  Sim.prototype.gap = function (k) { return k === 0 ? this.y[0] - 0.5 : this.y[k] - this.y[k - 1] - 1; };
  Sim.prototype.frame = function (push) {
    var p = this.p, n = this.n, w = this.w, y = this.y, v = this.v, lam = this.lam;
    var xpbd = p.method === 3, warm = p.method >= 1 && p.method <= 2;
    var sub = p.method >= 2 ? p.N : 1, iters = p.method >= 2 ? 1 : p.N, h = DT / sub;
    var k, it, s;
    v[n - 1] -= push;
    for (s = 0; s < sub; s++) {
      if (xpbd) {
        var yp = y.slice();
        for (k = 0; k < n; k++) { v[k] -= G * h; y[k] += h * v[k]; }
        for (it = 0; it < iters; it++) {
          for (k = 0; k < n; k++) {
            var C = this.gap(k);
            if (C >= 0) continue;
            if (k === 0) { y[0] -= C; continue; }
            var dl = -C / (w[k] + w[k - 1]);
            y[k] += w[k] * dl; y[k - 1] -= w[k - 1] * dl;
          }
        }
        for (k = 0; k < n; k++) v[k] = (y[k] - yp[k]) / h;
      } else {
        var Cg = [];
        for (k = 0; k < n; k++) { v[k] -= G * h; Cg.push(this.gap(k)); }
        if (warm) {
          for (k = 0; k < n; k++) { v[k] += w[k] * lam[k]; if (k) v[k - 1] -= w[k - 1] * lam[k]; }
        } else {
          for (k = 0; k < n; k++) lam[k] = 0;
        }
        for (it = 0; it < iters; it++) {
          for (k = 0; k < n; k++) {
            var jv = v[k] - (k ? v[k - 1] : 0), keff = w[k] + (k ? w[k - 1] : 0);
            var bias = BETA / h * Math.min(0, Cg[k]);
            var d = -(jv + bias) / keff, nl = Math.max(0, lam[k] + d);
            d = nl - lam[k]; lam[k] = nl;
            v[k] += w[k] * d; if (k) v[k - 1] -= w[k - 1] * d;
          }
        }
        for (k = 0; k < n; k++) y[k] += h * v[k];
      }
    }
    var pen = 0;
    for (k = 0; k < n; k++) pen = Math.max(pen, -this.gap(k));
    this.hist.push(pen); if (this.hist.length > HIST) this.hist.shift();
    return pen;
  };

  function setup(el) {
    var lang = TXT[el.dataset.lang] ? el.dataset.lang : "en", T = TXT[lang];
    var p = { method: 0, n: 10, ratio: 10, N: 10 };
    var sim = new Sim(p), push = 0, drag = null;
    var wrap = document.createElement("div");
    wrap.style.cssText = "font:13px sans-serif;color:#222";
    var grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px 16px;margin-bottom:8px";
    var selBox = document.createElement("label"); selBox.style.cssText = "display:block";
    selBox.appendChild(document.createTextNode(T.solver + ": "));
    var sel = document.createElement("select"); sel.style.cssText = "max-width:100%";
    T.names.forEach(function (nm, i) { var o = document.createElement("option"); o.value = i; o.textContent = nm; sel.appendChild(o); });
    sel.addEventListener("change", function () { p.method = +sel.value; sim = new Sim(p); });
    selBox.appendChild(sel); grid.appendChild(selBox);
    function slider(label, min, max, step, get, set) {
      var box = document.createElement("label"); box.style.cssText = "display:block";
      var t = document.createElement("div"), inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = get();
      inp.style.cssText = "width:100%;touch-action:pan-y";
      function upd(restart) { var val = set(parseFloat(inp.value)); t.textContent = label + ": " + val; if (restart) sim = new Sim(p); }
      inp.addEventListener("input", function () { upd(true); });
      upd(false); box.appendChild(t); box.appendChild(inp); grid.appendChild(box);
    }
    slider(T.n, 2, 20, 1, function () { return p.n; }, function (x) { p.n = x; return x; });
    slider(T.ratio, 0, 2, 0.05, function () { return Math.log(p.ratio) / Math.LN10; },
           function (x) { p.ratio = Math.round(Math.pow(10, x)); return "1 : " + p.ratio; });
    slider(T.sweeps, 1, 32, 1, function () { return p.N; }, function (x) { p.N = x; return x; });
    var btn = document.createElement("button"); btn.textContent = T.reset; btn.style.cssText = "justify-self:start;padding:4px 14px";
    btn.addEventListener("click", function () { sim = new Sim(p); });
    grid.appendChild(btn);
    var cv = document.createElement("canvas");
    cv.style.cssText = "width:100%;height:340px;display:block;touch-action:none;border:1px solid #ddd;border-radius:6px;background:#fcfcfc";
    wrap.appendChild(grid); wrap.appendChild(cv); el.appendChild(wrap);
    var ctx = cv.getContext("2d"), W = 0, H = 0;
    function resize() {
      var dpr = window.devicePixelRatio || 1; W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function yOf(e) { var r = cv.getBoundingClientRect(); return e.clientY - r.top; }
    cv.addEventListener("pointerdown", function (e) { drag = yOf(e); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", function (e) { if (drag === null) return; var y = yOf(e); push += Math.max(0, y - drag) * 0.02; drag = y; });
    function up() { drag = null; }
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);

    function draw(pen) {
      ctx.clearRect(0, 0, W, H);
      var sw = Math.min(W * 0.36, 170), gy = H - 50, sc = (gy - 30) / (p.n + 1.5);
      var x0 = 16, bw = sw - 30;
      ctx.fillStyle = "#555"; ctx.fillRect(x0 - 6, gy, bw + 12, 3);
      // draw boxes with overlaps magnified: displayed bottom of box k = sum of magnified gaps below + k
      var base = 0, k;
      for (k = 0; k < p.n; k++) {
        var g = sim.gap(k);
        base += 0 + g * MAG;
        var bot = gy - (k + base) * sc;
        var bad = Math.min(1, Math.max(0, -g) / 0.05);
        ctx.fillStyle = "rgba(" + Math.round(31 + 183 * bad) + "," + Math.round(119 - 80 * bad) + "," + Math.round(180 - 140 * bad) + ",0.35)";
        ctx.strokeStyle = k === p.n - 1 ? "#9467bd" : "#1f77b4"; ctx.lineWidth = k === p.n - 1 ? 2.5 : 1.2;
        ctx.fillRect(x0, bot - sc, bw, sc); ctx.strokeRect(x0, bot - sc, bw, sc);
      }
      ctx.setLineDash([4, 4]); ctx.strokeStyle = "#999"; ctx.lineWidth = 1;
      var rest = gy - p.n * sc; ctx.beginPath(); ctx.moveTo(x0 - 6, rest); ctx.lineTo(x0 + bw + 6, rest); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#888"; ctx.font = "11px sans-serif"; ctx.fillText(T.mag, x0 - 6, gy + 18, sw);
      // plot
      var px = x0 + sw + 20, pw = W - px - 12, py = 40, ph = gy - py;
      if (pw < 80) return;
      ctx.strokeStyle = "#ccc"; ctx.strokeRect(px, py, pw, ph);
      var lo = -3, hi = 3;                                  // 1e-3 .. 1e3 mm
      ctx.fillStyle = "#888"; ctx.font = "10px sans-serif";
      for (var e = lo; e <= hi; e++) {
        var yy = py + ph * (1 - (e - lo) / (hi - lo));
        ctx.fillText(e === 0 ? "1" : "1e" + e, px + 2, e === lo ? yy - 2 : yy + 11);
        ctx.strokeStyle = "#eee"; ctx.beginPath(); ctx.moveTo(px, yy); ctx.lineTo(px + pw, yy); ctx.stroke();
      }
      ctx.strokeStyle = COLS[p.method]; ctx.lineWidth = 2; ctx.beginPath();
      for (var i = 0; i < sim.hist.length; i++) {
        var mm = Math.max(sim.hist[i] * 1000, 1e-3), ly = Math.log(mm) / Math.LN10;
        var X = px + pw * i / (HIST - 1), Y = py + ph * (1 - (Math.min(ly, hi) - lo) / (hi - lo));
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
      ctx.stroke();
      ctx.fillStyle = "#222"; ctx.font = "12px sans-serif";
      ctx.fillText(T.plot, px, py - 8, W - px - 4);
      var sink = (p.n - 0.5) - sim.y[p.n - 1];
      ctx.fillStyle = COLS[p.method];
      ctx.fillText(T.pen + " = " + (pen * 1000).toFixed(pen * 1000 < 10 ? 2 : 1) + " mm", px, gy + 18, W - px - 4);
      ctx.fillText(T.top[sink < 0 ? 1 : 0] + ": " + Math.abs(sink * 1000).toFixed(1) + " mm", px, gy + 34, W - px - 4);
      ctx.fillStyle = "#888"; ctx.font = "11px sans-serif"; ctx.fillText(T.drag, x0 - 6, H - 3, W - 8);
    }
    var last = 0, acc = 0, visible = true;
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(cv);
    function loop(t) {
      if (visible) {
        acc += Math.min(0.1, (t - (last || t)) / 1000);
        var pen = sim.hist.length ? sim.hist[sim.hist.length - 1] : 0, steps = 0;
        while (acc >= DT && steps < 4) { pen = sim.frame(push); push = 0; acc -= DT; steps++; }
        if (steps === 4) acc = 0;
        draw(pen);
      }
      last = t; requestAnimationFrame(loop);
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv); else window.addEventListener("resize", resize);
    resize(); requestAnimationFrame(loop);
  }
  function init() {
    var els = document.querySelectorAll('[data-widget="graphics-engine-stack"]');
    for (var i = 0; i < els.length; i++) if (!els[i].dataset.ready) { els[i].dataset.ready = "1"; setup(els[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
