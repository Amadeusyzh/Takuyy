/* One shape, six representations (3d-vision post 08).
 * A 2D shape in a 100 mm x 100 mm box is stored as a point cloud, an occupancy grid, a quadtree, a
 * sampled signed distance field (with marching squares), a polygon ("mesh") or a mixture of Gaussians.
 * The slider sets the resolution of the chosen representation. The panel reports its memory and its
 * surface error: the mean two-sided distance between its boundary and the true boundary, both sampled
 * every 0.25 mm. The chart shows memory against error for all six over their whole resolution range.
 * Drag the probe (the ringed dot) to see what each representation can answer about a point.
 */
(function () {
  "use strict";

  var TEXT = {
    en: {
      shape: "shape", blob: "blob", star: "star", thin: "thin ring",
      reps: ["points", "pixels", "quadtree", "SDF", "polygon", "Gaussians"],
      res: "resolution", mem: "memory (2D)", mem3: "in 3D it grows as", err: "surface error",
      param: ["N points", "N\u00d7N pixels", "depth L", "N\u00d7N cells", "V vertices", "K Gaussians"],
      truth: "true signed distance", chartX: "memory (bytes)", chartY: "error (mm)",
      hint: "Drag the probe (ringed dot). Tap a curve point in the chart to jump there.",
      q: [
        "nearest point %d mm away; a point cloud cannot tell inside from outside",
        "pixel says: %s",
        "leaf at depth %d (%s mm wide) says: %s",
        "bilinear SDF from 4 nodes: %s mm (%s)",
        "nearest edge %d mm away; ray crossings say: %s",
        "density %s vs threshold %s: %s"
      ],
      inside: "inside", outside: "outside", lost: "nothing left: the shape fell between the samples (plotted at 30 mm)",
      grow: ["\u221d 1/s\u00b2 (s = spacing)", "\u221d N\u00b3", "\u221d 4^L (surface cells)", "\u221d N\u00b3 (dense)", "\u221d 1/s\u00b2", "\u221d K (11 floats each)"], nodes: "nodes"
    },
    zh: {
      shape: "\u5f62\u72b6", blob: "\u56e2\u5757", star: "\u661f\u5f62", thin: "\u7ec6\u73af",
      reps: ["\u70b9", "\u50cf\u7d20", "\u56db\u53c9\u6811", "SDF", "\u591a\u8fb9\u5f62", "\u9ad8\u65af"],
      res: "\u5206\u8fa8\u7387", mem: "\u5185\u5b58\uff082D\uff09", mem3: "\u5728 3D \u4e2d\u7684\u589e\u957f", err: "\u8868\u9762\u8bef\u5dee",
      param: ["N \u4e2a\u70b9", "N\u00d7N \u50cf\u7d20", "\u6df1\u5ea6 L", "N\u00d7N \u683c", "V \u4e2a\u9876\u70b9", "K \u4e2a\u9ad8\u65af"],
      truth: "\u771f\u5b9e\u6709\u7b26\u53f7\u8ddd\u79bb", chartX: "\u5185\u5b58\uff08\u5b57\u8282\uff09", chartY: "\u8bef\u5dee\uff08mm\uff09",
      hint: "\u62d6\u52a8\u63a2\u9488\uff08\u5e26\u5708\u7684\u70b9\uff09\u3002\u70b9\u51fb\u53f3\u56fe\u66f2\u7ebf\u4e0a\u7684\u70b9\u53ef\u76f4\u63a5\u8df3\u8f6c\u3002",
      q: [
        "\u6700\u8fd1\u7684\u70b9\u8ddd\u79bb %d mm\uff1b\u70b9\u4e91\u65e0\u6cd5\u5224\u65ad\u5185\u5916",
        "\u50cf\u7d20\u7684\u56de\u7b54\uff1a%s",
        "\u6df1\u5ea6 %d \u7684\u53f6\u5b50\uff08\u5bbd %s mm\uff09\u7684\u56de\u7b54\uff1a%s",
        "\u7531 4 \u4e2a\u8282\u70b9\u53cc\u7ebf\u6027\u63d2\u503c\u7684 SDF\uff1a%s mm\uff08%s\uff09",
        "\u6700\u8fd1\u7684\u8fb9\u8ddd\u79bb %d mm\uff1b\u5c04\u7ebf\u7a7f\u8d8a\u8ba1\u6570\u7684\u56de\u7b54\uff1a%s",
        "\u5bc6\u5ea6 %s\uff0c\u9608\u503c %s\uff1a%s"
      ],
      inside: "\u5185\u90e8", outside: "\u5916\u90e8", lost: "\u4ec0\u4e48\u4e5f\u6ca1\u7559\u4e0b\uff1a\u5f62\u72b6\u843d\u5728\u91c7\u6837\u70b9\u4e4b\u95f4\uff08\u6309 30 mm \u753b\u51fa\uff09",
      grow: ["\u221d 1/s\u00b2\uff08s \u4e3a\u95f4\u8ddd\uff09", "\u221d N\u00b3", "\u221d 4^L\uff08\u8868\u9762\u683c\u5b50\uff09", "\u221d N\u00b3\uff08\u7a20\u5bc6\uff09", "\u221d 1/s\u00b2", "\u221d K\uff08\u6bcf\u4e2a 11 \u4e2a\u6d6e\u70b9\u6570\uff09"], nodes: "\u4e2a\u8282\u70b9"
    },
    ja: {
      shape: "\u5f62\u72b6", blob: "\u584a", star: "\u661f\u5f62", thin: "\u7d30\u3044\u8f2a",
      reps: ["\u70b9", "\u753b\u7d20", "\u56db\u5206\u6728", "SDF", "\u591a\u89d2\u5f62", "\u30ac\u30a6\u30b7\u30a2\u30f3"],
      res: "\u89e3\u50cf\u5ea6", mem: "\u30e1\u30e2\u30ea\uff082D\uff09", mem3: "3D \u3067\u306e\u5897\u3048\u65b9", err: "\u8868\u9762\u8aa4\u5dee",
      param: ["N \u70b9", "N\u00d7N \u753b\u7d20", "\u6df1\u3055 L", "N\u00d7N \u30bb\u30eb", "\u9802\u70b9 V \u500b", "\u30ac\u30a6\u30b7\u30a2\u30f3 K \u500b"],
      truth: "\u771f\u306e\u7b26\u53f7\u4ed8\u304d\u8ddd\u96e2", chartX: "\u30e1\u30e2\u30ea\uff08\u30d0\u30a4\u30c8\uff09", chartY: "\u8aa4\u5dee\uff08mm\uff09",
      hint: "\u30d7\u30ed\u30fc\u30d6\uff08\u4e38\u3067\u56f2\u3093\u3060\u70b9\uff09\u3092\u30c9\u30e9\u30c3\u30b0\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u53f3\u306e\u30b0\u30e9\u30d5\u306e\u70b9\u3092\u30bf\u30c3\u30d7\u3059\u308b\u3068\u305d\u306e\u8a2d\u5b9a\u306b\u79fb\u308a\u307e\u3059\u3002",
      q: [
        "\u6700\u3082\u8fd1\u3044\u70b9\u307e\u3067 %d mm\u3002\u70b9\u7fa4\u306f\u5185\u5916\u3092\u5224\u5b9a\u3067\u304d\u306a\u3044",
        "\u753b\u7d20\u306e\u7b54\u3048\uff1a%s",
        "\u6df1\u3055 %d \u306e\u8449\uff08\u5e45 %s mm\uff09\u306e\u7b54\u3048\uff1a%s",
        "4 \u7bc0\u70b9\u304b\u3089\u306e\u53cc\u7dda\u5f62\u88dc\u9593 SDF\uff1a%s mm\uff08%s\uff09",
        "\u6700\u3082\u8fd1\u3044\u8fba\u307e\u3067 %d mm\u3002\u534a\u76f4\u7dda\u306e\u4ea4\u5dee\u6570\u306e\u7b54\u3048\uff1a%s",
        "\u5bc6\u5ea6 %s\u3001\u3057\u304d\u3044\u5024 %s\uff1a%s"
      ],
      inside: "\u5185\u5074", outside: "\u5916\u5074", lost: "\u4f55\u3082\u6b8b\u3089\u306a\u3044\uff1a\u5f62\u72b6\u304c\u30b5\u30f3\u30d7\u30eb\u306e\u9593\u306b\u843d\u3061\u305f\uff0830 mm \u3068\u3057\u3066\u63cf\u753b\uff09",
      grow: ["\u221d 1/s\u00b2\uff08s \u306f\u9593\u9694\uff09", "\u221d N\u00b3", "\u221d 4^L\uff08\u8868\u9762\u306e\u30bb\u30eb\uff09", "\u221d N\u00b3\uff08\u5bc6\uff09", "\u221d 1/s\u00b2", "\u221d K\uff081 \u500b\u3042\u305f\u308a\u6d6e\u52d5\u5c0f\u6570\u70b9\u6570 11 \u500b\uff09"], nodes: "\u30ce\u30fc\u30c9"
    }
  };

  var COL = { truth: "#222", rep: "#9467bd", repFill: "rgba(148,103,189,0.28)", pts: "#ff7f0e", probe: "#d62728", grid: "#d8d8e0" };
  var REPCOL = ["#ff7f0e", "#17becf", "#8c6d31", "#d62728", "#9467bd", "#2ca02c"];
  var LEVELS = [
    [8, 16, 32, 64, 128, 256, 512, 1024],
    [8, 12, 16, 24, 32, 48, 64, 96, 128],
    [3, 4, 5, 6, 7, 8],
    [6, 8, 12, 16, 24, 32, 48, 64],
    [6, 8, 12, 16, 24, 32, 48, 64, 96, 128],
    [2, 4, 6, 8, 12, 16, 24, 32, 48, 64]
  ];
  var STEP = 0.25;            // boundary sampling step (mm)

  // ---------- shapes: approximate SDFs whose zero sets are the true boundaries ----------
  function circle(x, y, cx, cy, r) { return Math.hypot(x - cx, y - cy) - r; }
  function box(x, y, cx, cy, hx, hy) {
    var qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  }
  function smin(a, b, k) {
    var h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
    return b * (1 - h) + a * h - k * h * (1 - h);
  }
  var STAR = (function () {
    var v = [], i;
    for (i = 0; i < 10; i++) {
      var a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 17 : 41;
      v.push([50 + r * Math.cos(a), 52 - r * Math.sin(a)]);
    }
    return v;
  })();
  function polySdf(x, y, V) {
    var d = Infinity, inside = false, i, j;
    for (i = 0, j = V.length - 1; i < V.length; j = i++) {
      var ax = V[i][0], ay = V[i][1], bx = V[j][0], by = V[j][1];
      var ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay;
      var t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
      d = Math.min(d, Math.hypot(wx - t * ex, wy - t * ey));
      if ((ay > y) !== (by > y) && x < ax + (y - ay) * ex / ey) inside = !inside;
    }
    return inside ? -d : d;
  }
  var SHAPES = {
    blob: function (x, y) {
      return smin(smin(circle(x, y, 36, 42, 19), circle(x, y, 63, 57, 22), 9), circle(x, y, 38, 72, 11), 7);
    },
    star: function (x, y) { return polySdf(x, y, STAR); },
    thin: function (x, y) {
      var ring = Math.abs(circle(x, y, 50, 50, 29)) - 1.75;
      return Math.min(ring, box(x, y, 50, 50, 29, 1.2));
    }
  };

  // ---------- small helpers ----------
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function fmtBytes(b) {
    if (b < 1000) return Math.round(b) + " B";
    if (b < 1e6) return (b / 1000).toFixed(b < 1e4 ? 2 : 1) + " kB";
    return (b / 1e6).toFixed(2) + " MB";
  }
  function fmt(v, d) { return (Math.abs(v) < 1e-9 ? 0 : v).toFixed(d); }

  // marching squares on node values vals[j * (n + 1) + i] at (x0 + i h, y0 + j h); returns segments
  function marching(vals, n, x0, y0, h) {
    var segs = [], i, j;
    function ip(a, b, ax, ay, bx, by) { var t = a / (a - b); return [ax + t * (bx - ax), ay + t * (by - ay)]; }
    for (j = 0; j < n; j++) {
      for (i = 0; i < n; i++) {
        var c0 = vals[j * (n + 1) + i], c1 = vals[j * (n + 1) + i + 1];
        var c2 = vals[(j + 1) * (n + 1) + i + 1], c3 = vals[(j + 1) * (n + 1) + i];
        var idx = (c0 < 0 ? 1 : 0) | (c1 < 0 ? 2 : 0) | (c2 < 0 ? 4 : 0) | (c3 < 0 ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        var x = x0 + i * h, y = y0 + j * h;
        var e = [
          function () { return ip(c0, c1, x, y, x + h, y); },
          function () { return ip(c1, c2, x + h, y, x + h, y + h); },
          function () { return ip(c2, c3, x + h, y + h, x, y + h); },
          function () { return ip(c3, c0, x, y + h, x, y); }
        ];
        var centre = (c0 + c1 + c2 + c3) / 4, pairs;
        switch (idx) {
          case 1: case 14: pairs = [[3, 0]]; break;
          case 2: case 13: pairs = [[0, 1]]; break;
          case 3: case 12: pairs = [[3, 1]]; break;
          case 4: case 11: pairs = [[1, 2]]; break;
          case 6: case 9: pairs = [[0, 2]]; break;
          case 7: case 8: pairs = [[3, 2]]; break;
          case 5: pairs = centre < 0 ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]]; break;
          case 10: pairs = centre < 0 ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]]; break;
        }
        for (var k = 0; k < pairs.length; k++) segs.push([e[pairs[k][0]](), e[pairs[k][1]]()]);
      }
    }
    return segs;
  }
  function sampleSegs(segs, step) {
    var out = [], k, s;
    for (k = 0; k < segs.length; k++) {
      var a = segs[k][0], b = segs[k][1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      var n = Math.max(1, Math.ceil(L / step));
      for (s = 0; s < n; s++) {
        var t = (s + 0.5) / n;
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    return out;
  }
  // bucket grid for nearest-neighbour queries over [-10, 110]^2
  function Index(pts, cell) {
    this.pts = pts; this.cell = cell; this.n = Math.ceil(120 / cell); this.b = [];
    for (var i = 0; i < this.n * this.n; i++) this.b.push(null);
    for (var k = 0; k < pts.length; k++) {
      var key = this.key(pts[k][0], pts[k][1]);
      if (!this.b[key]) this.b[key] = [];
      this.b[key].push(k);
    }
  }
  Index.prototype.ij = function (v) { return Math.max(0, Math.min(this.n - 1, Math.floor((v + 10) / this.cell))); };
  Index.prototype.key = function (x, y) { return this.ij(y) * this.n + this.ij(x); };
  Index.prototype.nearest = function (x, y) {
    var ci = this.ij(x), cj = this.ij(y), best = Infinity, bi = -1, r, i, j, k;
    for (r = 0; r < this.n; r++) {
      if (bi >= 0 && (r - 1) * this.cell > best) break;
      for (j = cj - r; j <= cj + r; j++) {
        if (j < 0 || j >= this.n) continue;
        for (i = ci - r; i <= ci + r; i++) {
          if (i < 0 || i >= this.n) continue;
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
          var bucket = this.b[j * this.n + i];
          if (!bucket) continue;
          for (k = 0; k < bucket.length; k++) {
            var p = this.pts[bucket[k]], d = Math.hypot(p[0] - x, p[1] - y);
            if (d < best) { best = d; bi = bucket[k]; }
          }
        }
      }
    }
    return [best, bi];
  }
  function twoSided(repPts, truth) {
    if (!repPts.length) return Infinity;
    var ri = new Index(repPts, 2.5), a = 0, b = 0, k;
    for (k = 0; k < repPts.length; k++) a += truth.idx.nearest(repPts[k][0], repPts[k][1])[0];
    for (k = 0; k < truth.pts.length; k++) b += ri.nearest(truth.pts[k][0], truth.pts[k][1])[0];
    return 0.5 * (a / repPts.length + b / truth.pts.length);
  }

  // ---------- the ground truth of a shape ----------
  function makeTruth(f) {
    var n = 400, h = 100 / n, vals = new Float64Array((n + 1) * (n + 1)), i, j;
    for (j = 0; j <= n; j++) for (i = 0; i <= n; i++) vals[j * (n + 1) + i] = f(i * h, j * h);
    var segs = marching(vals, n, 0, 0, h);
    var pts = sampleSegs(segs, STEP);
    var T = { f: f, segs: segs, pts: pts, idx: new Index(pts, 2.5) };
    T.sd = function (x, y) { return (f(x, y) < 0 ? -1 : 1) * T.idx.nearest(x, y)[0]; };
    // arc-length parametrised loops for points and polygons: chain segments into loops
    T.loops = chain(segs);
    var interior = [];
    for (j = 0; j < 100; j++) for (i = 0; i < 100; i++) if (f(i + 0.5, j + 0.5) < 0) interior.push([i + 0.5, j + 0.5]);
    T.interior = interior;
    T.area = interior.length;
    return T;
  }
  function chain(segs) {
    // join segments that share endpoints (rounded) into closed loops
    function key(p) { return Math.round(p[0] * 1000) + "," + Math.round(p[1] * 1000); }
    var adj = {}, used = new Array(segs.length), loops = [], k;
    for (k = 0; k < segs.length; k++) {
      for (var e = 0; e < 2; e++) {
        var kk = key(segs[k][e]);
        (adj[kk] = adj[kk] || []).push(k);
      }
    }
    for (k = 0; k < segs.length; k++) {
      if (used[k]) continue;
      var loop = [segs[k][0], segs[k][1]], cur = k, end = segs[k][1];
      used[k] = true;
      for (var guard = 0; guard < segs.length; guard++) {
        var cand = adj[key(end)] || [], nxt = -1;
        for (var c = 0; c < cand.length; c++) if (!used[cand[c]]) { nxt = cand[c]; break; }
        if (nxt < 0) break;
        used[nxt] = true;
        end = key(segs[nxt][0]) === key(end) ? segs[nxt][1] : segs[nxt][0];
        loop.push(end); cur = nxt;
      }
      if (loop.length > 3) {
        var len = 0, cum = [0];
        for (var q = 1; q < loop.length; q++) { len += Math.hypot(loop[q][0] - loop[q - 1][0], loop[q][1] - loop[q - 1][1]); cum.push(len); }
        loops.push({ p: loop, cum: cum, len: len });
      }
    }
    return loops;
  }
  function atArc(loop, s) {
    var lo = 0, hi = loop.cum.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (loop.cum[mid] <= s) lo = mid; else hi = mid; }
    var seg = loop.cum[hi] - loop.cum[lo], t = seg > 0 ? (s - loop.cum[lo]) / seg : 0;
    var a = loop.p[lo], b = loop.p[hi];
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  }

  // ---------- the six representations ----------
  function buildPoints(T, N) {
    var total = 0, k, rnd = mulberry(7 + N), pts = [];
    for (k = 0; k < T.loops.length; k++) total += T.loops[k].len;
    for (k = 0; k < N; k++) {
      var s = rnd() * total, l = 0;
      while (l < T.loops.length - 1 && s > T.loops[l].len) { s -= T.loops[l].len; l++; }
      pts.push(atArc(T.loops[l], Math.min(s, T.loops[l].len)));
    }
    return { kind: 0, pts: pts, bpts: pts, mem: 8 * N, idx: new Index(pts, 2.5) };
  }
  function buildPixels(T, N) {
    var h = 100 / N, occ = new Uint8Array(N * N), i, j, segs = [];
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) occ[j * N + i] = T.f((i + 0.5) * h, (j + 0.5) * h) < 0 ? 1 : 0;
    function o(i_, j_) { return i_ < 0 || j_ < 0 || i_ >= N || j_ >= N ? 0 : occ[j_ * N + i_]; }
    for (j = 0; j <= N; j++) {
      for (i = 0; i <= N; i++) {
        if (o(i, j) !== o(i - 1, j) && j < N) segs.push([[i * h, j * h], [i * h, (j + 1) * h]]);
        if (o(i, j) !== o(i, j - 1) && i < N) segs.push([[i * h, j * h], [(i + 1) * h, j * h]]);
      }
    }
    return { kind: 1, N: N, h: h, occ: occ, segs: segs, bpts: sampleSegs(segs, STEP), mem: Math.ceil(N * N / 8) };
  }
  function buildQuad(T, L) {
    var leaves = [], nodes = 0;
    function rec(cx, cy, half, d) {
      nodes++;
      var dist = Math.abs(T.sd(cx, cy));
      if (d === L || dist > half * Math.SQRT2 + STEP) {
        leaves.push({ cx: cx, cy: cy, half: half, d: d, ins: T.f(cx, cy) < 0 });
        return;
      }
      var q = half / 2;
      rec(cx - q, cy - q, q, d + 1); rec(cx + q, cy - q, q, d + 1); rec(cx - q, cy + q, q, d + 1); rec(cx + q, cy + q, q, d + 1);
    }
    rec(50, 50, 50, 0);
    var pix = buildPixels(T, 1 << L);   // near the boundary all leaves are at the finest level
    return { kind: 2, L: L, leaves: leaves, nodes: nodes, segs: pix.segs, bpts: pix.bpts, mem: 8 * nodes };
  }
  function buildSdf(T, N) {
    var h = 100 / N, vals = new Float64Array((N + 1) * (N + 1)), i, j;
    for (j = 0; j <= N; j++) for (i = 0; i <= N; i++) vals[j * (N + 1) + i] = T.sd(i * h, j * h);
    var segs = marching(vals, N, 0, 0, h);
    return { kind: 3, N: N, h: h, vals: vals, segs: segs, bpts: sampleSegs(segs, STEP), mem: 4 * (N + 1) * (N + 1) };
  }
  function buildPoly(T, V) {
    var total = 0, k, polys = [], segs = [];
    for (k = 0; k < T.loops.length; k++) total += T.loops[k].len;
    var left = V;
    for (k = 0; k < T.loops.length; k++) {
      var lp = T.loops[k];
      var nv = k === T.loops.length - 1 ? Math.max(3, left) : Math.max(3, Math.round(V * lp.len / total));
      left -= nv;
      var poly = [];
      for (var q = 0; q < nv; q++) poly.push(atArc(lp, lp.len * q / nv));
      polys.push(poly);
      for (q = 0; q < nv; q++) segs.push([poly[q], poly[(q + 1) % nv]]);
    }
    var nvt = 0;
    for (k = 0; k < polys.length; k++) nvt += polys[k].length;
    return { kind: 4, polys: polys, segs: segs, nv: nvt, bpts: sampleSegs(segs, STEP), mem: 8 * nvt + 8 * nvt };
  }
  function buildGauss(T, K) {
    var P = T.interior, n = P.length, rnd = mulberry(11 + K), mu = [], i, k, it;
    // k-means++ seeding
    mu.push(P[Math.floor(rnd() * n)].slice());
    var d2 = new Float64Array(n);
    while (mu.length < K) {
      var sum = 0;
      for (i = 0; i < n; i++) {
        var best = Infinity;
        for (k = 0; k < mu.length; k++) best = Math.min(best, (P[i][0] - mu[k][0]) * (P[i][0] - mu[k][0]) + (P[i][1] - mu[k][1]) * (P[i][1] - mu[k][1]));
        d2[i] = best; sum += best;
      }
      var r = rnd() * sum, acc = 0;
      for (i = 0; i < n - 1; i++) { acc += d2[i]; if (acc >= r) break; }
      mu.push(P[i].slice());
    }
    var lab = new Int32Array(n);
    for (it = 0; it < 15; it++) {
      for (i = 0; i < n; i++) {
        var bd = Infinity, bk = 0;
        for (k = 0; k < K; k++) {
          var dd = (P[i][0] - mu[k][0]) * (P[i][0] - mu[k][0]) + (P[i][1] - mu[k][1]) * (P[i][1] - mu[k][1]);
          if (dd < bd) { bd = dd; bk = k; }
        }
        lab[i] = bk;
      }
      var sx = new Float64Array(K), sy = new Float64Array(K), cn = new Float64Array(K);
      for (i = 0; i < n; i++) { sx[lab[i]] += P[i][0]; sy[lab[i]] += P[i][1]; cn[lab[i]]++; }
      for (k = 0; k < K; k++) if (cn[k]) { mu[k][0] = sx[k] / cn[k]; mu[k][1] = sy[k] / cn[k]; }
    }
    var G = [];
    var cxx = new Float64Array(K), cxy = new Float64Array(K), cyy = new Float64Array(K), cnt = new Float64Array(K);
    for (i = 0; i < n; i++) {
      k = lab[i];
      var dx = P[i][0] - mu[k][0], dy = P[i][1] - mu[k][1];
      cxx[k] += dx * dx; cxy[k] += dx * dy; cyy[k] += dy * dy; cnt[k]++;
    }
    for (k = 0; k < K; k++) {
      if (!cnt[k]) continue;
      var a = cxx[k] / cnt[k] + 0.25, b = cxy[k] / cnt[k], c = cyy[k] / cnt[k] + 0.25, det = a * c - b * b;
      G.push({ x: mu[k][0], y: mu[k][1], a: a, b: b, c: c, ia: c / det, ib: -b / det, ic: a / det,
               w: cnt[k] / n / (2 * Math.PI * Math.sqrt(det)) });
    }
    function dens(x, y) {
      var s = 0;
      for (var q = 0; q < G.length; q++) {
        var g = G[q], dx_ = x - g.x, dy_ = y - g.y;
        var m = g.ia * dx_ * dx_ + 2 * g.ib * dx_ * dy_ + g.ic * dy_ * dy_;
        if (m < 30) s += g.w * Math.exp(-0.5 * m);
      }
      return s;
    }
    // threshold that gives the true area, then the level set by marching squares
    var NN = 100, vals = new Float64Array((NN + 1) * (NN + 1)), cells = [];
    for (var j = 0; j <= NN; j++) for (i = 0; i <= NN; i++) vals[j * (NN + 1) + i] = dens(i, j);
    for (j = 0; j < NN; j++) for (i = 0; i < NN; i++) cells.push(dens(i + 0.5, j + 0.5));
    cells.sort(function (p, q) { return q - p; });
    var tau = cells[Math.max(0, Math.min(cells.length - 1, T.area - 1))];
    for (i = 0; i < vals.length; i++) vals[i] = tau - vals[i];
    var segs = marching(vals, NN, 0, 0, 1);
    return { kind: 5, G: G, tau: tau, dens: dens, segs: segs, bpts: sampleSegs(segs, STEP), mem: 24 * G.length };
  }
  var BUILD = [buildPoints, buildPixels, buildQuad, buildSdf, buildPoly, buildGauss];

  // ---------- widget ----------
  function setup(root) {
    var lang = TEXT[root.dataset.lang] ? root.dataset.lang : "en", tx = TEXT[lang];
    root.innerHTML = "";
    root.style.background = "#fbfbfd"; root.style.color = "#222";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif"; root.style.fontSize = "14px";
    root.style.borderRadius = "8px";

    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:8px 10px 4px";
    root.appendChild(bar);
    function button(text) {
      var b = document.createElement("button");
      b.textContent = text;
      b.style.cssText = "font:inherit;padding:3px 9px;border:1px solid #bbb;border-radius:5px;background:#fff;color:#222;cursor:pointer;touch-action:manipulation";
      bar.appendChild(b);
      return b;
    }
    var shapeSel = document.createElement("select");
    shapeSel.style.cssText = "font:inherit;padding:2px 4px;border:1px solid #bbb;border-radius:5px;background:#fff;color:#222";
    ["star", "blob", "thin"].forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = tx[k]; shapeSel.appendChild(o); });
    var shL = document.createElement("label");
    shL.style.cssText = "display:flex;align-items:center;gap:5px";
    shL.appendChild(document.createTextNode(tx.shape)); shL.appendChild(shapeSel);
    bar.appendChild(shL);
    var repBtns = tx.reps.map(function (nm, k) {
      var b = button(nm);
      b.addEventListener("click", function () { state.rep = k; state.lvl = Math.min(state.lvl, LEVELS[k].length - 1); slider.max = LEVELS[k].length - 1; slider.value = state.lvl; update(); });
      return b;
    });
    var bar2 = document.createElement("div");
    bar2.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:2px 10px 6px";
    root.appendChild(bar2);
    var slL = document.createElement("label");
    slL.style.cssText = "display:flex;align-items:center;gap:6px;white-space:nowrap";
    var slName = document.createElement("span");
    var slider = document.createElement("input");
    slider.type = "range"; slider.min = 0; slider.step = 1; slider.style.width = "150px";
    var slVal = document.createElement("span");
    slVal.style.cssText = "font-variant-numeric:tabular-nums;min-width:90px";
    slL.appendChild(slName); slL.appendChild(slider); slL.appendChild(slVal);
    bar2.appendChild(slL);

    var row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;padding:2px 10px 10px;align-items:flex-start";
    root.appendChild(row);
    var cv = document.createElement("canvas");
    cv.style.cssText = "display:block;touch-action:none;cursor:crosshair;border-radius:6px;background:#fff;box-shadow:0 0 0 1px #ddd";
    row.appendChild(cv);
    var side = document.createElement("div");
    side.style.cssText = "flex:1 1 230px;min-width:0";
    row.appendChild(side);
    var info = document.createElement("div");
    info.style.cssText = "line-height:1.5;font-variant-numeric:tabular-nums;padding:0 2px 6px";
    side.appendChild(info);
    var ch = document.createElement("canvas");
    ch.style.cssText = "display:block;border-radius:6px;background:#fff;box-shadow:0 0 0 1px #ddd;touch-action:manipulation";
    side.appendChild(ch);
    var legend = document.createElement("div");
    legend.style.cssText = "display:flex;flex-wrap:wrap;gap:2px 12px;font-size:12.5px;padding:5px 2px 0";
    tx.reps.forEach(function (nm, k) {
      var it = document.createElement("span");
      it.innerHTML = "<span style='display:inline-block;width:14px;height:3px;vertical-align:middle;margin-right:4px;background:" + REPCOL[k] + "'></span>" + nm;
      legend.appendChild(it);
    });
    side.appendChild(legend);
    var hint = document.createElement("div");
    hint.style.cssText = "color:#666;font-size:12.5px;padding:6px 2px 0";
    hint.textContent = tx.hint;
    side.appendChild(hint);

    var state = { shape: "star", rep: 1, lvl: 2, probe: [57, 40] };
    var truth = null, cache = {}, curve = null, SZ = 360, CW = 300, CH = 220, chartPts = [];

    function get(rep, lvl) {
      var key = state.shape + ":" + rep + ":" + lvl;
      if (!cache[key]) {
        var R = BUILD[rep](truth, LEVELS[rep][lvl]);
        R.err = twoSided(R.bpts, truth);
        R.lost = !isFinite(R.err);
        if (R.lost) R.err = 30;            // nothing left to measure: plot it at 30 mm
        cache[key] = R;
      }
      return cache[key];
    }
    function setShape(s) {
      state.shape = s; truth = makeTruth(SHAPES[s]); cache = {};
      curve = [];
      for (var r = 0; r < 6; r++) {
        var c = [];
        for (var l = 0; l < LEVELS[r].length; l++) { var R = get(r, l); c.push([R.mem, R.err]); }
        curve.push(c);
      }
    }

    function resize() {
      var W = root.clientWidth - 20;
      var wide = W >= 640;
      SZ = Math.max(240, Math.min(wide ? W - 300 - 8 : W, 440));
      CW = wide ? Math.max(260, W - SZ - 8) : W; CH = 220;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.style.width = SZ + "px"; cv.style.height = SZ + "px"; cv.width = SZ * dpr; cv.height = SZ * dpr;
      ch.style.width = CW + "px"; ch.style.height = CH + "px"; ch.width = CW * dpr; ch.height = CH * dpr;
      cv.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      ch.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function X(x) { return x / 100 * SZ; }
    function Y(y) { return y / 100 * SZ; }

    function drawSegs(g, segs, col, lw) {
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
      for (var k = 0; k < segs.length; k++) { g.moveTo(X(segs[k][0][0]), Y(segs[k][0][1])); g.lineTo(X(segs[k][1][0]), Y(segs[k][1][1])); }
      g.stroke();
    }
    function sdfColor(v) {
      var t = Math.max(-1, Math.min(1, v / 20));
      if (t < 0) return "rgb(" + Math.round(255 + 120 * t) + "," + Math.round(255 + 80 * t) + ",255)";
      return "rgb(255," + Math.round(255 - 90 * t) + "," + Math.round(255 - 120 * t) + ")";
    }

    function draw() {
      if (!truth) return;
      var g = cv.getContext("2d"), R = get(state.rep, state.lvl), i, j, k;
      g.clearRect(0, 0, SZ, SZ); g.fillStyle = "#fff"; g.fillRect(0, 0, SZ, SZ);
      var p = state.probe, msg = "";
      if (R.kind === 1) {
        for (j = 0; j < R.N; j++) for (i = 0; i < R.N; i++) if (R.occ[j * R.N + i]) { g.fillStyle = COL.repFill; g.fillRect(X(i * R.h), Y(j * R.h), X(R.h) + 0.5, Y(R.h) + 0.5); }
        if (R.N <= 48) { g.strokeStyle = COL.grid; g.lineWidth = 0.6; g.beginPath(); for (i = 0; i <= R.N; i++) { g.moveTo(X(i * R.h), 0); g.lineTo(X(i * R.h), SZ); g.moveTo(0, Y(i * R.h)); g.lineTo(SZ, Y(i * R.h)); } g.stroke(); }
        drawSegs(g, R.segs, COL.rep, 2);
        var pi_ = Math.min(R.N - 1, Math.max(0, Math.floor(p[0] / R.h))), pj = Math.min(R.N - 1, Math.max(0, Math.floor(p[1] / R.h)));
        g.strokeStyle = COL.probe; g.lineWidth = 2; g.strokeRect(X(pi_ * R.h), Y(pj * R.h), X(R.h), Y(R.h));
        msg = tx.q[1].replace("%s", R.occ[pj * R.N + pi_] ? tx.inside : tx.outside);
      } else if (R.kind === 2) {
        g.lineWidth = 0.6; g.strokeStyle = "#bbb";
        var hitLeaf = null;
        for (k = 0; k < R.leaves.length; k++) {
          var lf = R.leaves[k];
          if (lf.ins) { g.fillStyle = COL.repFill; g.fillRect(X(lf.cx - lf.half), Y(lf.cy - lf.half), X(2 * lf.half), Y(2 * lf.half)); }
          if (lf.d <= 7) g.strokeRect(X(lf.cx - lf.half), Y(lf.cy - lf.half), X(2 * lf.half), Y(2 * lf.half));
          if (Math.abs(p[0] - lf.cx) <= lf.half && Math.abs(p[1] - lf.cy) <= lf.half) hitLeaf = lf;
        }
        drawSegs(g, R.segs, COL.rep, 2);
        if (hitLeaf) {
          g.strokeStyle = COL.probe; g.lineWidth = 2;
          g.strokeRect(X(hitLeaf.cx - hitLeaf.half), Y(hitLeaf.cy - hitLeaf.half), X(2 * hitLeaf.half), Y(2 * hitLeaf.half));
          msg = tx.q[2].replace("%d", hitLeaf.d).replace("%s", fmt(2 * hitLeaf.half, 2)).replace("%s", hitLeaf.ins ? tx.inside : tx.outside);
        }
      } else if (R.kind === 3) {
        var oc = document.createElement("canvas"); oc.width = R.N + 1; oc.height = R.N + 1;
        var og = oc.getContext("2d"), im = og.createImageData(R.N + 1, R.N + 1);
        for (j = 0; j <= R.N; j++) for (i = 0; i <= R.N; i++) {
          var col = sdfColor(R.vals[j * (R.N + 1) + i]).match(/\d+/g), o = 4 * (j * (R.N + 1) + i);
          im.data[o] = +col[0]; im.data[o + 1] = +col[1]; im.data[o + 2] = +col[2]; im.data[o + 3] = 255;
        }
        og.putImageData(im, 0, 0);
        g.imageSmoothingEnabled = true;
        // node centres sit on grid vertices: shift by half a texel so texel centres land on nodes
        var tex = SZ / R.N;
        g.drawImage(oc, -tex / 2, -tex / 2, SZ + tex, SZ + tex);
        if (R.N <= 32) {
          g.fillStyle = "#555";
          for (j = 0; j <= R.N; j++) for (i = 0; i <= R.N; i++) { g.beginPath(); g.arc(X(i * R.h), Y(j * R.h), 1.4, 0, 6.3); g.fill(); }
        }
        drawSegs(g, R.segs, COL.rep, 2.4);
        var fi = Math.min(R.N - 1, Math.max(0, Math.floor(p[0] / R.h))), fj = Math.min(R.N - 1, Math.max(0, Math.floor(p[1] / R.h)));
        var fx = p[0] / R.h - fi, fy = p[1] / R.h - fj, V = R.vals, n1 = R.N + 1;
        var val = (1 - fx) * (1 - fy) * V[fj * n1 + fi] + fx * (1 - fy) * V[fj * n1 + fi + 1] + (1 - fx) * fy * V[(fj + 1) * n1 + fi] + fx * fy * V[(fj + 1) * n1 + fi + 1];
        g.fillStyle = COL.probe;
        [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (c) { g.beginPath(); g.arc(X((fi + c[0]) * R.h), Y((fj + c[1]) * R.h), 3.5, 0, 6.3); g.fill(); });
        g.strokeStyle = COL.probe; g.setLineDash([4, 3]); g.lineWidth = 1.3;
        g.beginPath(); g.arc(X(p[0]), Y(p[1]), X(Math.abs(val)), 0, 6.3); g.stroke(); g.setLineDash([]);
        msg = tx.q[3].replace("%s", fmt(val, 2)).replace("%s", val < 0 ? tx.inside : tx.outside);
      } else if (R.kind === 4) {
        g.fillStyle = COL.repFill; g.beginPath();
        for (k = 0; k < R.polys.length; k++) {
          var pl = R.polys[k];
          g.moveTo(X(pl[0][0]), Y(pl[0][1]));
          for (i = 1; i < pl.length; i++) g.lineTo(X(pl[i][0]), Y(pl[i][1]));
          g.closePath();
        }
        g.fill("evenodd");
        drawSegs(g, R.segs, COL.rep, 2);
        g.fillStyle = COL.rep;
        for (k = 0; k < R.polys.length; k++) for (i = 0; i < R.polys[k].length; i++) { g.beginPath(); g.arc(X(R.polys[k][i][0]), Y(R.polys[k][i][1]), 2.6, 0, 6.3); g.fill(); }
        var bd = Infinity, bq = null, inside = false;
        for (k = 0; k < R.segs.length; k++) {
          var a = R.segs[k][0], b = R.segs[k][1], ex = b[0] - a[0], ey = b[1] - a[1];
          var t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey)));
          var qx = a[0] + t * ex, qy = a[1] + t * ey, d = Math.hypot(p[0] - qx, p[1] - qy);
          if (d < bd) { bd = d; bq = [qx, qy]; }
          if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + (p[1] - a[1]) * ex / ey) inside = !inside;
        }
        if (bq) { g.strokeStyle = COL.probe; g.lineWidth = 1.6; g.beginPath(); g.moveTo(X(p[0]), Y(p[1])); g.lineTo(X(bq[0]), Y(bq[1])); g.stroke(); }
        msg = tx.q[4].replace("%d", fmt(bd, 2)).replace("%s", inside ? tx.inside : tx.outside);
      } else if (R.kind === 5) {
        for (k = 0; k < R.G.length; k++) {
          var G = R.G[k], tr = (G.a + G.c) / 2, dt = Math.sqrt(Math.max(0, (G.a - G.c) * (G.a - G.c) / 4 + G.b * G.b));
          var l1 = tr + dt, l2 = Math.max(1e-6, tr - dt), th = 0.5 * Math.atan2(2 * G.b, G.a - G.c);
          g.save(); g.translate(X(G.x), Y(G.y)); g.rotate(th);
          g.fillStyle = "rgba(44,160,44,0.16)"; g.strokeStyle = "rgba(44,160,44,0.75)"; g.lineWidth = 1;
          g.beginPath(); g.ellipse(0, 0, X(2 * Math.sqrt(l1)), X(2 * Math.sqrt(l2)), 0, 0, 6.3); g.fill(); g.stroke();
          g.restore();
        }
        drawSegs(g, R.segs, COL.rep, 2.2);
        var dv = R.dens(p[0], p[1]);
        msg = tx.q[5].replace("%s", dv.toExponential(2)).replace("%s", R.tau.toExponential(2)).replace("%s", dv > R.tau ? tx.inside : tx.outside);
      } else {
        g.fillStyle = COL.pts;
        for (k = 0; k < R.pts.length; k++) { g.beginPath(); g.arc(X(R.pts[k][0]), Y(R.pts[k][1]), R.pts.length > 300 ? 1.6 : 2.6, 0, 6.3); g.fill(); }
        var nn = R.idx.nearest(p[0], p[1]);
        if (nn[1] >= 0) {
          var q_ = R.pts[nn[1]];
          g.strokeStyle = COL.probe; g.lineWidth = 1.6; g.beginPath(); g.moveTo(X(p[0]), Y(p[1])); g.lineTo(X(q_[0]), Y(q_[1])); g.stroke();
          msg = tx.q[0].replace("%d", fmt(nn[0], 2));
        }
      }
      // ground truth outline
      g.setLineDash([5, 4]); drawSegs(g, truth.segs, COL.truth, 1.1); g.setLineDash([]);
      // probe
      g.fillStyle = COL.probe; g.beginPath(); g.arc(X(p[0]), Y(p[1]), 4, 0, 6.3); g.fill();
      g.strokeStyle = COL.probe; g.lineWidth = 2; g.beginPath(); g.arc(X(p[0]), Y(p[1]), 10, 0, 6.3); g.stroke();
      // scale bar 10 mm
      g.fillStyle = "#222"; g.fillRect(8, SZ - 12, X(10), 3); g.font = "11px system-ui, sans-serif"; g.fillText("10 mm", 8, SZ - 16);

      // the polygon keeps at least 3 vertices per loop, so show the count it really has
      var lvVal = R.kind === 4 ? R.nv : LEVELS[state.rep][state.lvl];
      slName.textContent = tx.res;
      slVal.textContent = tx.param[state.rep].replace(/\b[NVKL]\b/g, String(lvVal));
      repBtns.forEach(function (b, k_) { b.style.fontWeight = k_ === state.rep ? "700" : "400"; b.style.borderColor = k_ === state.rep ? REPCOL[k_] : "#bbb"; b.style.boxShadow = k_ === state.rep ? "inset 0 -3px 0 " + REPCOL[k_] : "none"; });
      var sd = truth.sd(p[0], p[1]);
      var extra = R.kind === 2 ? " (" + R.nodes + " " + tx.nodes + " \u00d7 8 B)" : "";
      info.innerHTML = "<b>" + tx.reps[state.rep] + "</b>: " + tx.mem + " <b>" + fmtBytes(R.mem) + "</b>" + extra +
        "<br>" + tx.err + " <b>" + (R.lost ? "\u2014" : fmt(R.err, 3) + " mm") + "</b>" + (R.lost ? " <span style='color:#d62728'>" + tx.lost + "</span>" : "") +
        "<br>" + tx.mem3 + " " + tx.grow[state.rep] +
        "<br><span style='color:" + COL.probe + "'>\u25cf</span> " + msg +
        "<br><span style='color:#666'>" + tx.truth + ": " + fmt(sd, 2) + " mm</span>";
      drawChart();
    }

    function drawChart() {
      var g = ch.getContext("2d"), k, l;
      g.clearRect(0, 0, CW, CH); g.fillStyle = "#fff"; g.fillRect(0, 0, CW, CH);
      var mx0 = Infinity, mx1 = -Infinity, ey0 = Infinity, ey1 = -Infinity;
      for (k = 0; k < 6; k++) for (l = 0; l < curve[k].length; l++) {
        var m = curve[k][l][0], e = Math.max(curve[k][l][1], 1e-3);
        mx0 = Math.min(mx0, m); mx1 = Math.max(mx1, m); ey0 = Math.min(ey0, e); ey1 = Math.max(ey1, e);
      }
      var L0 = Math.floor(Math.log10(mx0)), L1 = Math.ceil(Math.log10(mx1)), E0 = Math.floor(Math.log10(ey0)), E1 = Math.ceil(Math.log10(ey1));
      if (!(isFinite(L0) && isFinite(L1) && isFinite(E0) && isFinite(E1))) return;
      if (L1 === L0) L1++;
      if (E1 === E0) E1++;
      var left = 44, right = 8, top = 8, bottom = 34;
      function px(m_) { return left + (Math.log10(m_) - L0) / (L1 - L0) * (CW - left - right); }
      function py(e_) { return top + (E1 - Math.log10(Math.max(e_, 1e-3))) / (E1 - E0) * (CH - top - bottom); }
      g.strokeStyle = "#eee"; g.lineWidth = 1; g.fillStyle = "#666"; g.font = "11px system-ui, sans-serif";
      for (l = L0; l <= L1; l++) { g.beginPath(); g.moveTo(px(Math.pow(10, l)), top); g.lineTo(px(Math.pow(10, l)), CH - bottom); g.stroke(); g.fillText("1e" + l, px(Math.pow(10, l)) - 9, CH - bottom + 13); }
      for (l = E0; l <= E1; l++) { g.beginPath(); g.moveTo(left, py(Math.pow(10, l))); g.lineTo(CW - right, py(Math.pow(10, l))); g.stroke(); g.fillText(String(Math.pow(10, l)), 4, py(Math.pow(10, l)) + 4); }
      g.fillStyle = "#444"; g.fillText(tx.chartX, left + 4, CH - 6);
      g.save(); g.translate(11, top + 70); g.rotate(-Math.PI / 2); g.restore();
      g.fillText(tx.chartY, left + 4, top + 11);
      chartPts = [];
      for (k = 0; k < 6; k++) {
        g.strokeStyle = REPCOL[k]; g.lineWidth = k === state.rep ? 2.6 : 1.4; g.globalAlpha = k === state.rep ? 1 : 0.65;
        g.beginPath();
        for (l = 0; l < curve[k].length; l++) {
          var x = px(curve[k][l][0]), y = py(curve[k][l][1]);
          if (l) g.lineTo(x, y); else g.moveTo(x, y);
          chartPts.push([x, y, k, l]);
        }
        g.stroke();
        g.fillStyle = REPCOL[k];
        for (l = 0; l < curve[k].length; l++) { g.beginPath(); g.arc(px(curve[k][l][0]), py(curve[k][l][1]), 2.2, 0, 6.3); g.fill(); }
        g.globalAlpha = 1;
      }
      var c = curve[state.rep][state.lvl];
      g.strokeStyle = "#111"; g.lineWidth = 2; g.beginPath(); g.arc(px(c[0]), py(c[1]), 6, 0, 6.3); g.stroke();
    }

    function update() { draw(); }

    // ---------- events ----------
    shapeSel.addEventListener("change", function () { setShape(shapeSel.value); draw(); });
    slider.addEventListener("input", function () { state.lvl = +slider.value; draw(); });
    var dragging = false;
    function toModel(e) {
      var r = cv.getBoundingClientRect();
      return [Math.max(0.5, Math.min(99.5, (e.clientX - r.left) / r.width * 100)), Math.max(0.5, Math.min(99.5, (e.clientY - r.top) / r.height * 100))];
    }
    cv.addEventListener("pointerdown", function (e) { dragging = true; cv.setPointerCapture(e.pointerId); state.probe = toModel(e); draw(); e.preventDefault(); });
    cv.addEventListener("pointermove", function (e) { if (!dragging) return; state.probe = toModel(e); draw(); });
    function end() { dragging = false; }
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    ch.addEventListener("pointerdown", function (e) {
      var r = ch.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = 18, pick = null;
      for (var k = 0; k < chartPts.length; k++) { var d = Math.hypot(chartPts[k][0] - x, chartPts[k][1] - y); if (d < best) { best = d; pick = chartPts[k]; } }
      if (pick) { state.rep = pick[2]; state.lvl = pick[3]; slider.max = LEVELS[state.rep].length - 1; slider.value = state.lvl; draw(); }
    });

    setShape("star");
    slider.max = LEVELS[state.rep].length - 1; slider.value = state.lvl;
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(root);
    else window.addEventListener("resize", resize);
    resize();
  }

  function init() { document.querySelectorAll('[data-widget="3d-vision-representations"]').forEach(setup); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
