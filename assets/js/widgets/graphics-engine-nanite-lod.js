/* 1D Nanite-style cluster hierarchy and LOD cut (graphics-engine post 04).
 * A terrain profile of 128 segments is cut into 16 clusters of 8 segments. Each level merges sibling
 * pairs, halves the segment count by greedy vertex removal with the group ends locked, and stores a
 * monotonic error. The cut is { c : err(c) K / d(c) <= tau < err(parent) K / d(parent) }.
 * "Independent LOD levels" instead simplifies the whole profile per level and lets each 1 m region
 * pick its own level, which produces cracks where neighbours disagree. Same algorithm as the post.
 */
(function () {
  "use strict";

  var TEXT = {
    en: { cam: "Camera distance D", tau: "Error threshold \u{3c4}", hier: "Locked-boundary hierarchy",
          naive: "Independent LOD levels", clusters: "clusters", segs: "segments", cracks: "cracks",
          regions: "regions", hint: "Drag on the terrain or use the sliders." },
    zh: { cam: "\u{76f8}\u{673a}\u{8ddd}\u{79bb} D", tau: "\u{8bef}\u{5dee}\u{9608}\u{503c} \u{3c4}",
          hier: "\u{9501}\u{5b9a}\u{8fb9}\u{754c}\u{7684}\u{5c42}\u{7ea7}", naive: "\u{72ec}\u{7acb} LOD \u{7ea7}\u{522b}",
          clusters: "\u{7c07}", segs: "\u{7ebf}\u{6bb5}", cracks: "\u{88c2}\u{7f1d}", regions: "\u{533a}\u{57df}",
          hint: "\u{5728}\u{5730}\u{5f62}\u{4e0a}\u{62d6}\u{52a8}\u{6216}\u{4f7f}\u{7528}\u{6ed1}\u{5757}\u{3002}" },
    ja: { cam: "\u{30ab}\u{30e1}\u{30e9}\u{8ddd}\u{96e2} D", tau: "\u{8aa4}\u{5dee}\u{3057}\u{304d}\u{3044}\u{5024} \u{3c4}",
          hier: "\u{5883}\u{754c}\u{56fa}\u{5b9a}\u{306e}\u{968e}\u{5c64}", naive: "\u{72ec}\u{7acb}\u{3057}\u{305f} LOD \u{30ec}\u{30d9}\u{30eb}",
          clusters: "\u{30af}\u{30e9}\u{30b9}\u{30bf}", segs: "\u{7dda}\u{5206}", cracks: "\u{3072}\u{3073}\u{5272}\u{308c}",
          regions: "\u{9818}\u{57df}",
          hint: "\u{5730}\u{5f62}\u{306e}\u{4e0a}\u{3092}\u{30c9}\u{30e9}\u{30c3}\u{30b0}\u{3059}\u{308b}\u{304b}\u{3001}\u{30b9}\u{30e9}\u{30a4}\u{30c0}\u{30fc}\u{3092}\u{4f7f}\u{3063}\u{3066}\u{304f}\u{3060}\u{3055}\u{3044}\u{3002}" }
  };
  var LCOL = ["#440154", "#3b528b", "#21918c", "#5ec962", "#c8e020"];
  var K = 1080 / (2 * Math.tan(Math.PI / 6));
  var CAM_H = 2.0;

  // ---- data (built once, shared by all instances) -------------------------------------------
  var N = 129, xs = [], h = [];
  for (var i = 0; i < N; i++) {
    var x = 16 * i / 128;
    xs.push(x);
    h.push(1.2 * Math.sin(0.45 * x) + 0.5 * Math.sin(1.7 * x + 1) + 0.18 * Math.sin(4.3 * x + 2) + 0.07 * Math.sin(9.1 * x + 0.5));
  }
  function maxDev(a, b) {
    var m = 0;
    for (var k = a; k <= b; k++) {
      var t = (xs[k] - xs[a]) / (xs[b] - xs[a]);
      m = Math.max(m, Math.abs(h[k] - (h[a] + t * (h[b] - h[a]))));
    }
    return m;
  }
  function simplify(verts, target) { // greedy removal, ends locked
    verts = verts.slice();
    while (verts.length - 1 > target) {
      var best = 1, bc = Infinity;
      for (var k = 1; k < verts.length - 1; k++) {
        var c = maxDev(verts[k - 1], verts[k + 1]);
        if (c < bc) { bc = c; best = k; }
      }
      verts.splice(best, 1);
    }
    var err = 0;
    for (k = 0; k < verts.length - 1; k++) err = Math.max(err, maxDev(verts[k], verts[k + 1]));
    return { verts: verts, err: err };
  }
  function bounds(v) {
    var lo = v[0], hi = v[v.length - 1], mn = Infinity, mx = -Infinity;
    for (var k = lo; k <= hi; k++) { mn = Math.min(mn, h[k]); mx = Math.max(mx, h[k]); }
    return { cx: (xs[lo] + xs[hi]) / 2, cy: (mn + mx) / 2, r: 0.5 * Math.hypot(xs[hi] - xs[lo], mx - mn) };
  }
  var levels = [[]];
  for (var c0 = 0; c0 < 16; c0++) {
    var vv = [];
    for (var k0 = 8 * c0; k0 <= 8 * c0 + 8; k0++) vv.push(k0);
    levels[0].push({ verts: vv, err: 0, children: [], level: 0, b: bounds(vv) });
  }
  while (levels[levels.length - 1].length > 1) {
    var prev = levels[levels.length - 1], nxt = [];
    for (var g = 0; g < prev.length; g += 2) {
      var A = prev[g], B = prev[g + 1];
      var s = simplify(A.verts.concat(B.verts.slice(1)), 8);
      var node = { verts: s.verts, err: Math.max(s.err, A.err, B.err), children: [A, B], level: levels.length };
      node.b = bounds(node.verts);
      nxt.push(node);
    }
    levels.push(nxt);
  }
  var ROOT = levels[levels.length - 1][0], NL = levels.length;
  // independent global levels for the naive mode
  var glob = [[]];
  for (i = 0; i < N; i++) glob[0].push(i);
  for (var L = 1; L < NL; L++) glob.push(simplify(glob[L - 1], 128 >> L).verts);
  function gAt(L, x) {
    var v = glob[L];
    for (var k = 0; k < v.length - 1; k++) {
      var a = xs[v[k]], b = xs[v[k + 1]];
      if (x >= a && x <= b) return h[v[k]] + (x - a) / (b - a) * (h[v[k + 1]] - h[v[k]]);
    }
    return h[v[v.length - 1]];
  }
  var regErr = [], regB = [];
  for (L = 0; L < NL; L++) {
    regErr.push([]);
    for (var r = 0; r < 16; r++) {
      var m = 0;
      for (k0 = 8 * r; k0 <= 8 * r + 8; k0++) m = Math.max(m, Math.abs(h[k0] - gAt(L, xs[k0])));
      regErr[L].push(m);
    }
  }
  for (r = 0; r < 16; r++) {
    var rv = [];
    for (k0 = 8 * r; k0 <= 8 * r + 8; k0++) rv.push(k0);
    regB.push(bounds(rv));
  }
  function dist(b, D) { return Math.max(Math.hypot(b.cx + D, b.cy - CAM_H) - b.r, 1e-3); }
  function selectCut(node, D, tau, out) {
    if (node.err * K / dist(node.b, D) <= tau || !node.children.length) { out.push(node); return out; }
    node.children.forEach(function (ch) { selectCut(ch, D, tau, out); });
    return out;
  }

  // ---- UI ----------------------------------------------------------------------------------------
  function setup(root) {
    var T = TEXT[root.dataset.lang] || TEXT.en;
    root.style.background = "#fbfbfd";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.color = "#222";
    root.innerHTML = "";
    var D = 20, tau = 1, naive = false;

    var ctrl = document.createElement("div");
    ctrl.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 10px 0;font-size:13.5px";
    function slider(label, min, max, val, onInput) {
      var wrap = document.createElement("label");
      wrap.style.cssText = "display:flex;align-items:center;gap:6px;flex:1 1 220px";
      var span = document.createElement("span");
      span.style.cssText = "min-width:150px;font-variant-numeric:tabular-nums";
      var inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = "0.001"; inp.value = val;
      inp.style.cssText = "flex:1;min-width:90px;accent-color:#9467bd";
      inp.addEventListener("input", function () { onInput(Number(inp.value)); draw(); });
      wrap.appendChild(span); wrap.appendChild(inp);
      ctrl.appendChild(wrap);
      return { span: span, inp: inp };
    }
    var sD = slider(T.cam, 0, 3, Math.log10(D), function (v) { D = Math.pow(10, v); });
    var sT = slider(T.tau, -0.6, 0.9, Math.log10(tau), function (v) { tau = Math.pow(10, v); });
    var modeBar = document.createElement("div");
    modeBar.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
    function mbtn(label, val) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = label;
      b.style.cssText = "border:1px solid #9467bd;border-radius:14px;padding:3px 10px;font-size:13px;cursor:pointer";
      b.addEventListener("click", function () { naive = val; draw(); });
      modeBar.appendChild(b);
      return b;
    }
    var bH = mbtn(T.hier, false), bN = mbtn(T.naive, true);
    ctrl.appendChild(modeBar);
    root.appendChild(ctrl);

    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;margin:4px auto 0;touch-action:none;cursor:ew-resize";
    root.appendChild(canvas);
    var info = document.createElement("div");
    info.style.cssText = "padding:4px 10px 10px;font-size:13.5px;line-height:1.5;font-variant-numeric:tabular-nums";
    root.appendChild(info);
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, HT = 0, lastW = -1;

    function resize() {
      var w = Math.max(280, root.clientWidth);
      if (w === lastW) return;
      lastW = w;
      W = w; HT = Math.round(Math.min(250, Math.max(170, w * 0.36))); H = HT + 150;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    var X0 = -1.4, X1 = 16.3;
    function X(x) { return 8 + (x - X0) / (X1 - X0) * (W - 16); }
    function Y(y) { return 10 + (3.0 - y) / 5.8 * (HT - 20); }

    function draw() {
      if (!W) return;
      sD.span.textContent = T.cam + " = " + (D < 10 ? D.toFixed(1) : D.toFixed(0)) + " m";
      sT.span.textContent = T.tau + " = " + tau.toFixed(2) + " px";
      [bH, bN].forEach(function (b, i) {
        var on = (i === 1) === naive;
        b.style.background = on ? "#9467bd" : "#fff";
        b.style.color = on ? "#fff" : "#5a3d85";
      });
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      // original profile
      ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (var k = 0; k < N; k++) { if (k) ctx.lineTo(X(xs[k]), Y(h[k])); else ctx.moveTo(X(xs[k]), Y(h[k])); }
      ctx.stroke(); ctx.setLineDash([]);
      // camera
      ctx.fillStyle = "#222"; ctx.font = "12px system-ui, sans-serif";
      ctx.beginPath(); ctx.moveTo(X(-1.3), Y(CAM_H) - 7); ctx.lineTo(X(-0.6), Y(CAM_H)); ctx.lineTo(X(-1.3), Y(CAM_H) + 7);
      ctx.closePath(); ctx.fill();
      ctx.fillText("\u{2190} " + (D < 10 ? D.toFixed(1) : D.toFixed(0)) + " m", X(-1.35), Y(CAM_H) - 12);
      var nClusters = 0, nSegs = 0, nCracks = 0, regLevel = [];
      function poly(xsArr, ysArr, col) {
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineJoin = "round";
        ctx.beginPath();
        for (var q = 0; q < xsArr.length; q++) { if (q) ctx.lineTo(X(xsArr[q]), Y(ysArr[q])); else ctx.moveTo(X(xsArr[q]), Y(ysArr[q])); }
        ctx.stroke();
        ctx.fillStyle = col;
        for (q = 0; q < xsArr.length; q++) { ctx.beginPath(); ctx.arc(X(xsArr[q]), Y(ysArr[q]), 2.2, 0, 6.2832); ctx.fill(); }
      }
      var cut = [];
      if (!naive) {
        cut = selectCut(ROOT, D, tau, []);
        cut.forEach(function (c) {
          poly(c.verts.map(function (v) { return xs[v]; }), c.verts.map(function (v) { return h[v]; }), LCOL[c.level]);
          nSegs += c.verts.length - 1;
          ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5;
          var e = c.verts[c.verts.length - 1];
          ctx.beginPath(); ctx.moveTo(X(xs[e]), Y(h[e]) - 6); ctx.lineTo(X(xs[e]), Y(h[e]) + 6); ctx.stroke();
        });
        nClusters = cut.length;
      } else {
        for (var r = 0; r < 16; r++) {
          var lv = 0;
          for (var L2 = 1; L2 < NL; L2++) if (regErr[L2][r] * K / dist(regB[r], D) <= tau) lv = L2;
          regLevel.push(lv);
          var px = [r], py = [gAt(lv, r)];
          glob[lv].forEach(function (v) { if (xs[v] > r && xs[v] < r + 1) { px.push(xs[v]); py.push(h[v]); } });
          px.push(r + 1); py.push(gAt(lv, r + 1));
          poly(px, py, LCOL[lv]);
          nSegs += px.length - 1;
        }
        for (r = 1; r < 16; r++) {
          var ya = gAt(regLevel[r - 1], r), yb = gAt(regLevel[r], r);
          if (regLevel[r] !== regLevel[r - 1] && Math.abs(ya - yb) > 1e-6) {
            nCracks++;
            ctx.strokeStyle = "#d62728"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(X(r), Y((ya + yb) / 2), 9, 0, 6.2832); ctx.stroke();
            ctx.lineWidth = 5;
            ctx.beginPath(); ctx.moveTo(X(r), Y(ya)); ctx.lineTo(X(r), Y(yb)); ctx.stroke();
          }
        }
        nClusters = 16;
      }
      // bottom panel
      var top = HT + 8, rowH = (150 - 24) / (NL - 1);
      function TY(level) { return top + 8 + (NL - 1 - level) * rowH; }
      ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, HT + 2); ctx.lineTo(W, HT + 2); ctx.stroke();
      ctx.fillStyle = "#666"; ctx.font = "11px system-ui, sans-serif";
      for (var l3 = 0; l3 < NL; l3++) ctx.fillText("L" + l3, 4, TY(l3) + 4);
      if (!naive) {
        var sel = new Set(cut);
        var cxOf = function (c) { return (xs[c.verts[0]] + xs[c.verts[c.verts.length - 1]]) / 2; };
        var visit = function (c, below) {
          var on = sel.has(c);
          c.children.forEach(function (ch) {
            ctx.strokeStyle = below ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.4)"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(X(cxOf(c)), TY(c.level)); ctx.lineTo(X(cxOf(ch)), TY(ch.level)); ctx.stroke();
            visit(ch, below || on);
          });
          var sz = on ? 6 : 4;
          ctx.fillStyle = on ? LCOL[c.level] : (below ? "#e6e6e6" : "#ffffff");
          ctx.fillRect(X(cxOf(c)) - sz, TY(c.level) - sz, 2 * sz, 2 * sz);
          ctx.strokeStyle = on ? "#111" : "#999"; ctx.lineWidth = on ? 1.6 : 1;
          ctx.strokeRect(X(cxOf(c)) - sz, TY(c.level) - sz, 2 * sz, 2 * sz);
        };
        visit(ROOT, false);
      } else {
        for (r = 0; r < 16; r++) {
          ctx.fillStyle = LCOL[regLevel[r]];
          var y0 = TY(regLevel[r]);
          ctx.fillRect(X(r) + 1, y0 - 5, X(r + 1) - X(r) - 2, 10);
        }
      }
      info.innerHTML = "<b>" + nClusters + "</b> " + (naive ? T.regions : T.clusters) + " &nbsp; <b>" + nSegs + "</b> " + T.segs +
        " &nbsp; " + (naive ? "<b style=\"color:#d62728\">" + nCracks + "</b> " + T.cracks
          : "<b style=\"color:#2ca02c\">0</b> " + T.cracks) +
        " &nbsp; <span style=\"color:#777\">" + T.hint + "</span>";
    }

    var dragX = null;
    canvas.addEventListener("pointerdown", function (e) {
      dragX = e.clientX; canvas.setPointerCapture(e.pointerId); e.preventDefault();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (dragX === null) return;
      var lg = Math.log10(D) - (e.clientX - dragX) * 0.006;
      dragX = e.clientX;
      lg = Math.max(0, Math.min(3, lg));
      D = Math.pow(10, lg); sD.inp.value = lg;
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
    document.querySelectorAll('[data-widget="graphics-engine-nanite-lod"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
