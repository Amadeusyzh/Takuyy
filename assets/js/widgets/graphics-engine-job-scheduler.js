/* Job graph list scheduler (graphics-engine post 01).
   The 12-job frame of the post, scheduled greedily on P workers. Priority is either the
   longest remaining path (critical path first) or plain declaration order. "Split physics"
   replaces the 4 ms physics job by two 2 ms islands. Shows the Gantt chart, total work W,
   critical path C, the lower bound max(C, W/P) and the makespan. */
(function () {
  "use strict";
  var TXT = {
    en: { workers: "workers", cp: "critical path first", decl: "declaration order", split: "split physics into 2 islands",
          span: "makespan", bound: "lower bound" },
    zh: { workers: "\u5de5\u4f5c\u7ebf\u7a0b", cp: "\u5173\u952e\u8def\u5f84\u4f18\u5148", decl: "\u58f0\u660e\u987a\u5e8f",
          split: "\u628a\u7269\u7406\u62c6\u6210 2 \u4e2a\u5c9b", span: "\u603b\u65f6\u957f", bound: "\u4e0b\u754c" },
    ja: { workers: "\u30ef\u30fc\u30ab\u30fc", cp: "\u30af\u30ea\u30c6\u30a3\u30ab\u30eb\u30d1\u30b9\u512a\u5148",
          decl: "\u5ba3\u8a00\u9806", split: "\u7269\u7406\u3092 2 \u3064\u306e\u30a2\u30a4\u30e9\u30f3\u30c9\u306b\u5206\u5272",
          span: "\u6240\u8981\u6642\u9593", bound: "\u4e0b\u754c" }
  };
  // Non-ASCII text is written as \u escapes so that this file stays ASCII-only.
  var PAL = ["#1f77b4", "#aec7e8", "#ff7f0e", "#ffbb78", "#2ca02c", "#98df8a", "#9467bd", "#c5b0d5",
             "#8c564b", "#c49c94", "#e377c2", "#f7b6d2", "#7f7f7f", "#bcbd22"];

  function jobs(split) {
    var J = [
      ["input", 1, []], ["anim_a", 3, ["input"]], ["anim_b", 3, ["input"]]
    ];
    if (split) J.push(["physics_a", 2, ["input"]], ["physics_b", 2, ["input"]]);
    else J.push(["physics", 4, ["input"]]);
    var phys = split ? ["physics_a", "physics_b"] : ["physics"];
    J.push(["gameplay", 2, phys], ["skinning", 2, ["anim_a", "anim_b"]], ["particles", 3, phys],
           ["audio", 2, ["gameplay"]], ["cull", 2, ["gameplay", "skinning"]], ["build_1", 2, ["cull"]],
           ["build_2", 2, ["cull", "particles"]], ["submit", 1, ["build_1", "build_2"]]);
    return J.map(function (j, i) { return { name: j[0], dur: j[1], deps: j[2], idx: i }; });
  }

  function schedule(J, P, useCP) {
    var by = {}, children = {};
    J.forEach(function (j) { by[j.name] = j; children[j.name] = []; });
    J.forEach(function (j) { j.deps.forEach(function (d) { children[d].push(j.name); }); });
    var prio = {};
    function bottom(n) {
      if (prio[n] === undefined) {
        var m = 0;
        children[n].forEach(function (c) { m = Math.max(m, bottom(c)); });
        prio[n] = by[n].dur + m;
      }
      return prio[n];
    }
    J.forEach(function (j) { bottom(j.name); });
    var missing = {}, ready = [], free = [], running = [], log = [], t = 0;
    J.forEach(function (j) { missing[j.name] = j.deps.length; if (!j.deps.length) ready.push(j.name); });
    for (var w = 0; w < P; w++) free.push(w);
    while (ready.length || running.length) {
      ready.sort(function (a, b) {
        if (useCP && prio[a] !== prio[b]) return prio[b] - prio[a];
        if (useCP) return a < b ? -1 : a > b ? 1 : 0;
        return by[a].idx - by[b].idx;
      });
      free.sort(function (a, b) { return a - b; });
      while (ready.length && free.length) {
        var n = ready.shift(), wk = free.shift();
        running.push({ end: t + by[n].dur, w: wk, n: n });
        log.push({ n: n, w: wk, s: t, e: t + by[n].dur });
      }
      running.sort(function (a, b) { return (a.end - b.end) || (a.w - b.w); });
      t = running[0].end;
      while (running.length && running[0].end === t) {
        var r = running.shift();
        free.push(r.w);
        children[r.n].forEach(function (c) { if (--missing[c] === 0) ready.push(c); });
      }
    }
    // critical path: follow the child with the largest bottom level from the root
    var crit = {}, cur = J[0].name;
    while (cur) {
      crit[cur] = 1;
      var best = null;
      children[cur].forEach(function (c) { if (best === null || prio[c] > prio[best]) best = c; });
      cur = best;
    }
    var W = 0; J.forEach(function (j) { W += j.dur; });
    return { span: t, log: log, C: prio[J[0].name], W: W, crit: crit };
  }

  function setup(el) {
    var lang = TXT[el.dataset.lang] ? el.dataset.lang : "en";
    var T = {};
    for (var key in TXT[lang]) T[key] = (TXT[lang][key]);
    el.style.background = "#fcfcfd";
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px;font:13px sans-serif;color:#222";
    el.appendChild(bar);
    var lab = document.createElement("label");
    lab.style.cssText = "display:flex;align-items:center;gap:6px";
    var sl = document.createElement("input");
    sl.type = "range"; sl.min = 1; sl.max = 6; sl.step = 1; sl.value = 4; sl.style.width = "100px";
    var sv = document.createElement("b");
    lab.appendChild(document.createTextNode(T.workers + " P")); lab.appendChild(sl); lab.appendChild(sv);
    bar.appendChild(lab);
    var sel = document.createElement("select");
    sel.style.cssText = "font:13px sans-serif";
    [["cp", T.cp], ["decl", T.decl]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
    });
    bar.appendChild(sel);
    var lab2 = document.createElement("label");
    lab2.style.cssText = "display:flex;align-items:center;gap:4px";
    var cb = document.createElement("input"); cb.type = "checkbox";
    lab2.appendChild(cb); lab2.appendChild(document.createTextNode(T.split));
    bar.appendChild(lab2);
    var cv = document.createElement("canvas");
    cv.style.display = "block"; cv.style.width = "100%";
    el.appendChild(cv);
    var ctx = cv.getContext("2d"), W = 0, H = 0, R = null, J = null;

    function update() {
      sv.textContent = sl.value;
      J = jobs(cb.checked);
      R = schedule(J, parseInt(sl.value, 10), sel.value === "cp");
      draw();
    }
    function resize() {
      W = el.clientWidth || 600;
      var total = Math.max(parseInt(el.style.minHeight, 10) || 360, 300);
      H = Math.max(total - bar.offsetHeight, 230);
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function draw() {
      if (!W || !R) return;
      ctx.clearRect(0, 0, W, H);
      var P = parseInt(sl.value, 10), lb = Math.max(R.C, R.W / P);
      var x0 = 34, x1 = W - 10, y0 = 46, y1 = H - 24, tmax = Math.max(R.span, 27) + 0.5;
      var sx = (x1 - x0) / tmax, rh = Math.min(40, (y1 - y0) / P);
      ctx.font = "13px sans-serif"; ctx.fillStyle = "#222";
      ctx.fillText("W = " + R.W + " ms   C = " + R.C + " ms   " + T.bound + " max(C, W/P) = " + lb.toFixed(2).replace(/\.00$/, "") + " ms", 8, 16);
      ctx.font = "bold 14px sans-serif"; ctx.fillStyle = R.span <= lb + 1e-9 ? "#2ca02c" : "#d62728";
      ctx.fillText(T.span + " = " + R.span + " ms", 8, 36);
      // grid
      ctx.strokeStyle = "#e6e6e6"; ctx.lineWidth = 1; ctx.font = "10px sans-serif"; ctx.fillStyle = "#777";
      var step = W < 480 ? 3 : 1;
      for (var t = 0; t <= tmax; t += step) {
        var gx = x0 + t * sx;
        ctx.beginPath(); ctx.moveTo(gx, y0 - 4); ctx.lineTo(gx, y0 + rh * P); ctx.stroke();
        ctx.fillText(String(t), gx - 3, y0 + rh * P + 12);
      }
      ctx.setLineDash([5, 4]); ctx.strokeStyle = "#2ca02c"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0 + lb * sx, y0 - 6); ctx.lineTo(x0 + lb * sx, y0 + rh * P + 2); ctx.stroke();
      ctx.setLineDash([]);
      for (var w = 0; w < P; w++) { ctx.fillStyle = "#555"; ctx.font = "11px sans-serif"; ctx.fillText("w" + w, 6, y0 + rh * (w + 0.5) + 4); }
      R.log.forEach(function (b) {
        var j = null; J.forEach(function (q) { if (q.name === b.n) j = q; });
        var x = x0 + b.s * sx, y = y0 + rh * b.w + 2, wd = (b.e - b.s) * sx, h = rh - 4;
        ctx.fillStyle = PAL[j.idx % PAL.length]; ctx.fillRect(x + 1, y, wd - 2, h);
        if (R.crit[b.n]) { ctx.strokeStyle = "#d62728"; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y, wd - 2, h); }
        ctx.save(); ctx.beginPath(); ctx.rect(x + 1, y, wd - 2, h); ctx.clip();
        ctx.fillStyle = "#111"; ctx.font = (wd > 60 ? "11px" : "9px") + " monospace";
        ctx.fillText(b.n, x + 3, y + h / 2 + 4); ctx.restore();
      });
    }
    sl.addEventListener("input", update);
    sel.addEventListener("change", update);
    cb.addEventListener("change", update);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(el); else window.addEventListener("resize", resize);
    update(); resize();
  }

  function init() {
    var els = document.querySelectorAll('[data-widget="graphics-engine-job-scheduler"]');
    for (var i = 0; i < els.length; i++) if (!els[i].dataset.ready) { els[i].dataset.ready = "1"; setup(els[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
