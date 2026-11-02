/* Toy frame-graph compiler (graphics-engine post 02).
   Same graph and algorithm as the Python compile_graph of the post: cull passes whose outputs
   nobody needs, order the rest, compute resource lifetimes, place transient resources in one
   heap with a greedy aliasing allocator, and count the state-transition barriers.
   Tap a pass to switch it off or on; tick the box to make debug_view an output. */
(function () {
  "use strict";
  var TXT = {
    en: { hint: "Tap a pass: on / off", out: "debug_view is an output", culled: "culled", off: "off",
          life: "lifetimes", mem: "memory (MB)", noalias: "no aliasing", heap: "aliased heap", bar: "barriers",
          run: "executed" },
    zh: { hint: "~70b9~51fb pass~ff1a~5f00 / ~5173", out: "debug_view ~4f5c~4e3a~8f93~51fa",
          culled: "~88ab~5254~9664", off: "~5df2~5173~95ed", life: "~751f~547d~5468~671f",
          mem: "~5185~5b58 (MB)", noalias: "~65e0~590d~7528", heap: "~590d~7528~540e~7684~5806",
          bar: "barrier", run: "~6267~884c" },
    ja: { hint: "~30d1~30b9~3092~30bf~30c3~30d7~ff1a~30aa~30f3 / ~30aa~30d5",
          out: "debug_view ~3092~51fa~529b~306b~3059~308b", culled: "~30ab~30ea~30f3~30b0",
          off: "~30aa~30d5", life: "~30e9~30a4~30d5~30bf~30a4~30e0", mem: "~30e1~30e2~30ea (MB)",
          noalias: "~30a8~30a4~30ea~30a2~30b9~306a~3057", heap: "~30a8~30a4~30ea~30a2~30b9~5f8c~306e~30d2~30fc~30d7",
          bar: "~30d0~30ea~30a2", run: "~5b9f~884c" }
  };
  // Non-ASCII text is written as ~hhhh (4 hex digits) so that this file stays ASCII-only.
  function U(s) { return s.replace(/~([0-9a-f]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }); }
  var SIZES = { shadow_map: 16, depth: 8, gbuf_albedo: 8, gbuf_normal: 8, ssao: 2, hdr: 16, taa_out: 16, bloom: 4, debug_view: 8 };
  var DEPTH_LIKE = { shadow_map: 1, depth: 1 };
  var COLS = { shadow_map: "#8c564b", depth: "#7f7f7f", gbuf_albedo: "#ff7f0e", gbuf_normal: "#9467bd", ssao: "#17becf",
               hdr: "#d62728", taa_out: "#1f77b4", bloom: "#e6b800", debug_view: "#999999" };
  var PASSES = [
    { name: "shadow", reads: [], writes: ["shadow_map"] },
    { name: "gbuffer", reads: [], writes: ["depth", "gbuf_albedo", "gbuf_normal"] },
    { name: "ssao", reads: ["depth", "gbuf_normal"], writes: ["ssao"] },
    { name: "lighting", reads: ["gbuf_albedo", "gbuf_normal", "depth", "ssao", "shadow_map"], writes: ["hdr"] },
    { name: "debug_normals", reads: ["gbuf_normal"], writes: ["debug_view"] },
    { name: "taa", reads: ["hdr", "depth"], writes: ["taa_out"] },
    { name: "bloom", reads: ["taa_out"], writes: ["bloom"] },
    { name: "tonemap", reads: ["taa_out", "bloom"], writes: ["backbuffer"] }
  ];
  var FALLBACK = { taa_out: "hdr" };   // without TAA, later passes read the HDR image directly

  function compile(enabled, outputs) {
    var passes = PASSES.filter(function (p) { return enabled[p.name]; });
    var writer = {};
    passes.forEach(function (p) { p.writes.forEach(function (r) { writer[r] = p; }); });
    // resolve reads: fall back or drop inputs that no enabled pass produces
    passes = passes.map(function (p) {
      var reads = [];
      p.reads.forEach(function (r) {
        var q = writer[r] ? r : (FALLBACK[r] && writer[FALLBACK[r]] ? FALLBACK[r] : null);
        if (q && reads.indexOf(q) < 0) reads.push(q);
      });
      return { name: p.name, reads: reads, writes: p.writes };
    });
    writer = {};
    passes.forEach(function (p) { p.writes.forEach(function (r) { writer[r] = p; }); });
    var needed = {}, stack = outputs.slice();
    while (stack.length) {
      var r = stack.pop(), w = writer[r];
      if (w && !needed[w.name]) { needed[w.name] = 1; stack = stack.concat(w.reads); }
    }
    var order = passes.filter(function (p) { return needed[p.name]; });   // declaration order is topological
    var life = {}, names = [];
    order.forEach(function (p, i) {
      p.reads.concat(p.writes).forEach(function (r) {
        if (r === "backbuffer") return;
        if (!life[r]) { life[r] = [i, i]; names.push(r); }
        life[r][0] = Math.min(life[r][0], i); life[r][1] = Math.max(life[r][1], i);
      });
    });
    var sorted = names.slice().sort(function (a, b) {
      return (SIZES[b] - SIZES[a]) || (life[a][0] - life[b][0]) || (a < b ? -1 : a > b ? 1 : 0);
    });
    var placed = {};
    sorted.forEach(function (r) {
      var a = life[r][0], b = life[r][1], busy = [];
      Object.keys(placed).forEach(function (q) {
        if (!(life[q][1] < a || b < life[q][0])) busy.push([placed[q][0], placed[q][1]]);
      });
      busy.sort(function (x, y) { return (x[0] - y[0]) || (x[1] - y[1]); });
      var off = 0;
      for (var k = 0; k < busy.length; k++) {
        if (off + SIZES[r] <= busy[k][0]) break;
        off = Math.max(off, busy[k][1]);
      }
      placed[r] = [off, off + SIZES[r]];
    });
    var state = { backbuffer: "PRESENT" }, nb = 0;
    names.forEach(function (r) { state[r] = "UNDEFINED"; });
    order.forEach(function (p) {
      var want = p.reads.map(function (r) { return [r, "SRV"]; }).concat(
        p.writes.map(function (r) { return [r, DEPTH_LIKE[r] ? "DEPTH_WRITE" : "RT"]; }));
      want.forEach(function (x) { if (state[x[0]] !== x[1]) { state[x[0]] = x[1]; nb++; } });
    });
    if (state.backbuffer !== "PRESENT") nb++;
    var total = 0, heap = 0;
    names.forEach(function (r) { total += SIZES[r]; heap = Math.max(heap, placed[r][1]); });
    return { order: order, needed: needed, life: life, names: names, placed: placed, barriers: nb, total: total, heap: heap };
  }

  function setup(el) {
    var lang = TXT[el.dataset.lang] ? el.dataset.lang : "en";
    var T = {};
    for (var key in TXT[lang]) T[key] = U(TXT[lang][key]);
    el.style.background = "#fcfcfd";
    var enabled = {}, debugOut = false;
    PASSES.forEach(function (p) { enabled[p.name] = true; });

    var top = document.createElement("div");
    top.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px;font:13px sans-serif;color:#222";
    el.appendChild(top);
    var btns = {};
    PASSES.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.style.cssText = "font:12px monospace;padding:4px 7px;border-radius:5px;cursor:pointer;background:#fff";
      b.addEventListener("click", function () { enabled[p.name] = !enabled[p.name]; update(); });
      top.appendChild(b); btns[p.name] = b;
    });
    var lab = document.createElement("label");
    lab.style.cssText = "display:flex;align-items:center;gap:4px;margin-left:4px;white-space:nowrap";
    var cb = document.createElement("input"); cb.type = "checkbox";
    cb.addEventListener("change", function () { debugOut = cb.checked; update(); });
    lab.appendChild(cb); lab.appendChild(document.createTextNode(T.out));
    top.appendChild(lab);
    var info = document.createElement("div");
    info.style.cssText = "padding:0 8px 4px;font:13px sans-serif;color:#222";
    el.appendChild(info);
    var cv = document.createElement("canvas");
    cv.style.display = "block"; cv.style.width = "100%"; cv.style.touchAction = "pan-y";
    el.appendChild(cv);
    var ctx = cv.getContext("2d");
    var W = 0, H = 0, R = null;

    function update() {
      R = compile(enabled, debugOut ? ["backbuffer", "debug_view"] : ["backbuffer"]);
      PASSES.forEach(function (p) {
        var b = btns[p.name], on = enabled[p.name], used = !!R.needed[p.name];
        b.textContent = p.name + (on ? (used ? "" : " (" + T.culled + ")") : " (" + T.off + ")");
        b.style.border = on && used ? "2px solid #9467bd" : "1.5px dashed #aaa";
        b.style.color = on && used ? "#222" : "#999";
        b.style.textDecoration = on ? "none" : "line-through";
        b.style.background = on && used ? "#f3eefb" : "#fff";
      });
      info.textContent = T.run + ": " + R.order.length + " / " + PASSES.length + "   " + T.bar + ": " + R.barriers +
        "   " + T.noalias + ": " + R.total + " MB -> " + T.heap + ": " + R.heap + " MB   (" + T.hint + ")";
      draw();
    }

    function resize() {
      W = el.clientWidth || 600;
      var total = Math.max(parseInt(el.style.minHeight, 10) || 520, 420);
      H = Math.max(total - top.offsetHeight - info.offsetHeight, W < 700 ? 560 : 340);
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function panel(x0, y0, w, h, title) {
      ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, w, h);
      ctx.fillStyle = "#222"; ctx.font = "bold 12px sans-serif"; ctx.fillText(title, x0 + 4, y0 - 5);
    }

    function draw() {
      if (!W || !R) return;
      ctx.clearRect(0, 0, W, H);
      var n = Math.max(R.order.length, 1), wide = W >= 700;
      var labW = Math.min(96, W * 0.24), pad = 8, gap = wide ? 24 : 84;
      var pw = wide ? (W - 2 * pad - 30 - gap) / 2 : W - 2 * pad - 30;   // 30 px right margin for rotated labels
      var ph = wide ? H - 18 - 78 : (H - 18 - gap - 78) / 2;
      var A = { x: pad, y: 18, w: pw, h: ph };
      var B = wide ? { x: pad + pw + gap, y: 18, w: pw, h: ph } : { x: pad, y: 18 + ph + gap, w: pw, h: ph };
      // --- lifetimes
      panel(A.x, A.y, A.w, A.h, T.life);
      var gx = A.x + labW, gw = A.w - labW - 4, rows = Math.max(R.names.length, 1), rh = A.h / rows;
      var cw = gw / n;
      ctx.font = "11px monospace";
      R.names.forEach(function (r, k) {
        var y = A.y + k * rh, l = R.life[r];
        ctx.fillStyle = "#333"; ctx.fillText(r, A.x + 4, y + rh / 2 + 4);
        ctx.fillStyle = COLS[r];
        ctx.fillRect(gx + l[0] * cw + 1, y + rh * 0.2, (l[1] - l[0] + 1) * cw - 2, rh * 0.6);
      });
      // pass labels under the panel (vertical text keeps them readable on phones)
      function passLabels(x, wdt, yb) {
        ctx.save(); ctx.font = "10px monospace"; ctx.fillStyle = "#555";
        R.order.forEach(function (p, i) {
          ctx.save(); ctx.translate(x + (i + 0.5) * (wdt / n) + 3, yb + 4); ctx.rotate(Math.PI / 4);
          ctx.fillText(p.name, 0, 0); ctx.restore();
        });
        ctx.restore();
      }
      passLabels(gx, gw, A.y + A.h);
      // --- memory placement
      panel(B.x, B.y, B.w, B.h, T.mem);
      var mx = B.x + 30, mw = B.w - 34, top_ = Math.max(R.total, 8);
      var sy = B.h / top_, mcw = mw / n;
      ctx.font = "10px sans-serif"; ctx.fillStyle = "#666";
      for (var v = 0; v <= top_; v += 16) ctx.fillText(String(v), B.x + 3, B.y + B.h - v * sy + 3);
      R.names.forEach(function (r) {
        var l = R.life[r], p = R.placed[r];
        var x = mx + l[0] * mcw, y = B.y + B.h - p[1] * sy, w = (l[1] - l[0] + 1) * mcw, h = (p[1] - p[0]) * sy;
        ctx.fillStyle = COLS[r]; ctx.globalAlpha = 0.85; ctx.fillRect(x + 1, y + 1, w - 2, h - 2); ctx.globalAlpha = 1;
        if (h > 13 && w > 40) {
          ctx.fillStyle = "#fff"; ctx.font = "10px monospace";
          ctx.fillText(r.length * 6 < w - 4 ? r : r.slice(0, Math.max(3, Math.floor((w - 4) / 6))), x + 4, y + h / 2 + 4);
        }
      });
      var hy = B.y + B.h - R.heap * sy;
      ctx.setLineDash([5, 4]); ctx.strokeStyle = "#d62728"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(mx, hy); ctx.lineTo(B.x + B.w, hy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#d62728"; ctx.font = "bold 12px sans-serif";
      ctx.fillText(R.heap + " MB", B.x + B.w - 52, hy - 4);
      passLabels(mx, mw, B.y + B.h);
    }

    if (window.ResizeObserver) new ResizeObserver(resize).observe(el); else window.addEventListener("resize", resize);
    update();
    resize();
  }

  function init() {
    var els = document.querySelectorAll('[data-widget="graphics-engine-render-graph"]');
    for (var i = 0; i < els.length; i++) if (!els[i].dataset.ready) { els[i].dataset.ready = "1"; setup(els[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
