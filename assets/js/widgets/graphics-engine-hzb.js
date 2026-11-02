/* Hierarchical Z-buffer occlusion test (graphics-engine post 02).
   A 64x64 toy depth buffer (same occluders as the post's figure; 1 = far plane) and its
   max-depth mip pyramid. Drag the test box; sliders set its nearest depth z_min and its size.
   The widget picks level L = ceil(log2(max(w, h))), reads the <= 2x2 texels the box covers at
   that level, and culls the box if z_min > max(texels). The exact answer is shown for comparison. */
(function () {
  "use strict";
  var TXT = {
    en: { depth: "box depth z_min", size: "box size (px)", culled: "CULLED by the HZB test", drawn: "DRAWN",
          hid: "exact: hidden", vis: "exact: visible", hint: "drag the box", level: "level", reads: "texels read" },
    zh: { depth: "~7269~4f53~6df1~5ea6 z_min", size: "~76d2~5b50~5c3a~5bf8 (px)", culled: "~88ab HZB ~6d4b~8bd5~5254~9664",
          drawn: "~7ed8~5236", hid: "~5b9e~9645~ff1a~88ab~906e~6321", vis: "~5b9e~9645~ff1a~53ef~89c1",
          hint: "~62d6~52a8~76d2~5b50", level: "~7ea7~522b", reads: "~8bfb~53d6~7684~7eb9~7d20" },
    ja: { depth: "~7269~4f53~306e~6df1~5ea6 z_min", size: "~7bb1~306e~30b5~30a4~30ba (px)",
          culled: "HZB ~30c6~30b9~30c8~3067~30ab~30ea~30f3~30b0", drawn: "~63cf~753b",
          hid: "~5b9f~969b~ff1a~96a0~308c~3066~3044~308b", vis: "~5b9f~969b~ff1a~898b~3048~308b",
          hint: "~7bb1~3092~30c9~30e9~30c3~30b0", level: "~30ec~30d9~30eb", reads: "~8aad~3080~30c6~30af~30bb~30eb" }
  };
  // Non-ASCII text is written as ~hhhh (4 hex digits) so that this file stays ASCII-only.
  function U(s) { return s.replace(/~([0-9a-f]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }); }
  var N = 64;
  var OCC = [[4, 8, 30, 40, 0.30], [26, 30, 60, 52, 0.40], [40, 4, 58, 26, 0.35], [10, 46, 24, 62, 0.50]];

  function buildDepth() {
    var D = new Float32Array(N * N), i, x, y;
    for (i = 0; i < D.length; i++) D[i] = 1;
    OCC.forEach(function (o) {
      for (y = o[1]; y < o[3]; y++) for (x = o[0]; x < o[2]; x++) D[y * N + x] = Math.min(D[y * N + x], o[4]);
    });
    var mips = [D], n = N;
    while (n > 1) {
      var m = mips[mips.length - 1], h = n / 2, M = new Float32Array(h * h);
      for (y = 0; y < h; y++) for (x = 0; x < h; x++) {
        M[y * h + x] = Math.max(m[(2 * y) * n + 2 * x], m[(2 * y) * n + 2 * x + 1],
                                m[(2 * y + 1) * n + 2 * x], m[(2 * y + 1) * n + 2 * x + 1]);
      }
      mips.push(M); n = h;
    }
    return mips;
  }

  function setup(el) {
    var lang = TXT[el.dataset.lang] ? el.dataset.lang : "en";
    var T = {};
    for (var key in TXT[lang]) T[key] = U(TXT[lang][key]);
    el.style.background = "#fcfcfd";
    var mips = buildDepth();
    var box = { x: 28, y: 18, s: 10, z: 0.6 };

    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;padding:8px;font:13px sans-serif;color:#222";
    el.appendChild(bar);
    function slider(label, min, max, step, val, cb) {
      var lab = document.createElement("label");
      lab.style.cssText = "display:flex;align-items:center;gap:6px;white-space:nowrap";
      var inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val; inp.style.width = "100px";
      var out = document.createElement("b");
      function upd() { out.textContent = inp.value; cb(parseFloat(inp.value)); }
      inp.addEventListener("input", upd);
      lab.appendChild(document.createTextNode(label)); lab.appendChild(inp); lab.appendChild(out);
      bar.appendChild(lab);
      out.textContent = String(val);
      return inp;
    }
    slider(T.depth, 0.2, 0.98, 0.02, box.z, function (v) { box.z = v; draw(); });
    slider(T.size, 2, 24, 1, box.s, function (v) {
      box.s = v; box.x = Math.min(box.x, N - v); box.y = Math.min(box.y, N - v); draw();
    });
    var cv = document.createElement("canvas");
    cv.style.display = "block"; cv.style.width = "100%"; cv.style.touchAction = "none";
    el.appendChild(cv);
    var ctx = cv.getContext("2d"), W = 0, H = 0, G = null, drag = null;

    function test() {
      var L = 0;
      while ((1 << L) < box.s) L++;                  // L = ceil(log2(size)), exact in integers
      var s = 1 << L, n = N >> L;
      var tx0 = Math.floor(box.x / s), ty0 = Math.floor(box.y / s);
      var tx1 = Math.floor((box.x + box.s - 1) / s), ty1 = Math.floor((box.y + box.s - 1) / s);
      var hz = 0, x, y, exact = 0;
      for (y = ty0; y <= ty1; y++) for (x = tx0; x <= tx1; x++) hz = Math.max(hz, mips[L][y * n + x]);
      for (y = box.y; y < box.y + box.s; y++) for (x = box.x; x < box.x + box.s; x++) exact = Math.max(exact, mips[0][y * N + x]);
      return { L: L, s: s, n: n, tx0: tx0, ty0: ty0, tx1: tx1, ty1: ty1, hz: hz, culled: box.z > hz, hidden: box.z > exact };
    }

    function resize() {
      W = el.clientWidth || 600;
      var total = Math.max(parseInt(el.style.minHeight, 10) || 460, 380);
      H = Math.max(total - bar.offsetHeight, 300);
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function img(D, n, x0, y0, size) {
      var c = size / n;
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
        var g = Math.round(D[y * n + x] * 235 + 10);
        ctx.fillStyle = "rgb(" + g + "," + g + "," + g + ")";
        ctx.fillRect(x0 + x * c, y0 + y * c, Math.ceil(c), Math.ceil(c));
      }
    }

    function draw() {
      if (!W) return;
      ctx.clearRect(0, 0, W, H);
      var r = test(), wide = W >= 640;
      var size = wide ? Math.min(H - 70, (W - 40) * 0.55) : Math.min(W - 20, (H - 90) * 0.62);
      var mini = wide ? Math.min(size * 0.6, W - size - 50) : Math.min(size * 0.45, W - 20);
      var ax = 10, ay = 10, bx = wide ? ax + size + 30 : ax, by = wide ? ay : ay + size + 62;
      G = { ax: ax, ay: ay, size: size };
      img(mips[0], N, ax, ay, size);
      var c = size / N;
      // texels read at level L, drawn on the full-resolution buffer
      ctx.strokeStyle = "#1f77b4"; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      for (var ty = r.ty0; ty <= r.ty1; ty++) for (var tx = r.tx0; tx <= r.tx1; tx++)
        ctx.strokeRect(ax + tx * r.s * c, ay + ty * r.s * c, r.s * c, r.s * c);
      ctx.setLineDash([]);
      var col = r.culled ? "#d62728" : (r.hidden ? "#ff7f0e" : "#2ca02c");
      ctx.fillStyle = col; ctx.globalAlpha = 0.35;
      ctx.fillRect(ax + box.x * c, ay + box.y * c, box.s * c, box.s * c);
      ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.strokeRect(ax + box.x * c, ay + box.y * c, box.s * c, box.s * c);
      // mip level L with the read texels
      img(mips[r.L], r.n, bx, by, mini);
      var mc = mini / r.n;
      ctx.strokeStyle = "#1f77b4"; ctx.lineWidth = 2;
      for (ty = r.ty0; ty <= r.ty1; ty++) for (tx = r.tx0; tx <= r.tx1; tx++)
        ctx.strokeRect(bx + tx * mc, by + ty * mc, mc, mc);
      // read-out
      var lines = [
        [T.level + " L = ceil(log2 " + box.s + ") = " + r.L + "  (" + r.n + "\xd7" + r.n + ")", "#222"],
        [T.reads + ": " + ((r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1)) + "   max = " + r.hz.toFixed(2), "#1f77b4"],
        ["z_min = " + box.z.toFixed(2) + (r.culled ? " > " : U(" ~2264 ")) + r.hz.toFixed(2), "#222"],
        [r.culled ? T.culled : T.drawn, col],
        [r.hidden ? T.hid : T.vis, "#555"]
      ];
      var tx0 = wide ? bx : bx + mini + 12, ty0 = wide ? by + mini + 22 : by + 4;
      if (!wide && tx0 > W - 120) { tx0 = bx; ty0 = by + mini + 18; }
      ctx.font = "13px sans-serif";
      lines.forEach(function (l, i) { ctx.fillStyle = l[1]; ctx.fillText(l[0], tx0, ty0 + i * 18); });
      ctx.fillStyle = "#888"; ctx.font = "12px sans-serif";
      ctx.fillText(T.hint, ax, ay + size + 16);
    }

    function cell(e) {
      var rc = cv.getBoundingClientRect(), c = G.size / N;
      return [(e.clientX - rc.left - G.ax) / c, (e.clientY - rc.top - G.ay) / c];
    }
    cv.addEventListener("pointerdown", function (e) {
      if (!G) return;
      var p = cell(e);
      if (p[0] < 0 || p[1] < 0 || p[0] > N || p[1] > N) return;
      drag = [p[0] - box.x, p[1] - box.y];
      if (drag[0] < 0 || drag[1] < 0 || drag[0] > box.s || drag[1] > box.s) drag = [box.s / 2, box.s / 2];
      e.preventDefault(); move(e);
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    });
    function move(e) {
      if (!drag) return;
      var p = cell(e);
      box.x = Math.max(0, Math.min(N - box.s, Math.round(p[0] - drag[0])));
      box.y = Math.max(0, Math.min(N - box.s, Math.round(p[1] - drag[1])));
      draw();
    }
    cv.addEventListener("pointermove", move);
    function up(e) { if (drag) { drag = null; try { cv.releasePointerCapture(e.pointerId); } catch (err) {} } }
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(el); else window.addEventListener("resize", resize);
    resize();
  }

  function init() {
    var els = document.querySelectorAll('[data-widget="graphics-engine-hzb"]');
    for (var i = 0; i < els.length; i++) if (!els[i].dataset.ready) { els[i].dataset.ready = "1"; setup(els[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
