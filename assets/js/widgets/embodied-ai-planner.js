/* Embodied AI post 01: A*, RRT and RRT* on a 2-D map with draggable start, goal and obstacles.
   A* runs on an 8-connected grid (diagonal cost sqrt 2, Euclidean heuristic, no corner cutting);
   RRT grows a tree with a fixed step and goal bias; RRT* adds choose-parent and rewiring.
   Plain JS + Canvas 2D, no dependencies. */
(function () {
  "use strict";
  var NAME = "embodied-ai-planner";
  var TXT = {
    en: { resample: "New samples", expanded: "expanded", nodes: "nodes", len: "path length", none: "no path", hint: "drag start, goal or obstacles" },
    zh: { resample: "\u91cd\u65b0\u91c7\u6837", expanded: "\u5c55\u5f00", nodes: "\u8282\u70b9", len: "\u8def\u5f84\u957f\u5ea6", none: "\u65e0\u8def\u5f84", hint: "\u62d6\u52a8\u8d77\u70b9\u3001\u7ec8\u70b9\u6216\u969c\u788d\u7269" },
    ja: { resample: "\u518d\u30b5\u30f3\u30d7\u30eb", expanded: "\u5c55\u958b", nodes: "\u30ce\u30fc\u30c9", len: "\u7d4c\u8def\u9577", none: "\u7d4c\u8def\u306a\u3057", hint: "\u30b9\u30bf\u30fc\u30c8\u30fb\u30b4\u30fc\u30eb\u30fb\u969c\u5bb3\u7269\u3092\u30c9\u30e9\u30c3\u30b0" }
  };
  var WX = 1.5, WY = 1.0;          // world size
  var CELL = 0.025;                // A* grid resolution
  var GX = Math.round(WX / CELL), GY = Math.round(WY / CELL);

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function el(tag, css, parent) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (parent) parent.appendChild(n);
    return n;
  }

  function viridis(t) { // small viridis approximation
    var c = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
    t = Math.max(0, Math.min(1, t)) * 4;
    var i = Math.min(3, Math.floor(t)), f = t - i;
    return "rgb(" + [0, 1, 2].map(function (k) { return Math.round(c[i][k] + f * (c[i + 1][k] - c[i][k])); }).join(",") + ")";
  }

  function init(root) {
    var T = TXT[root.dataset.lang] || TXT.en;
    root.style.background = "#fafafa";
    root.style.minHeight = "0";
    root.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', sans-serif";
    var canvas = el("canvas", "display:block;width:100%;touch-action:none;", root);
    var bar = el("div", "display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:8px 10px;font-size:14px;color:#222;border-top:1px solid #e3e3e3;background:#fff;", root);
    var algos = ["A*", "RRT", "RRT*"], algo = "A*", btns = {};
    algos.forEach(function (a) {
      var b = el("button", "padding:3px 10px;border:1px solid #bbb;border-radius:5px;cursor:pointer;font-size:14px;", bar);
      b.textContent = a; btns[a] = b;
      b.addEventListener("click", function () { algo = a; style(); plan(); draw(); });
    });
    var re = el("button", "padding:3px 10px;border:1px solid #bbb;border-radius:5px;background:#f3f3f3;cursor:pointer;font-size:14px;", bar);
    re.textContent = T.resample;
    var info = el("span", "font-variant-numeric:tabular-nums;color:#444;", bar);
    function style() {
      algos.forEach(function (a) {
        btns[a].style.background = a === algo ? "#9467bd" : "#f3f3f3";
        btns[a].style.color = a === algo ? "#fff" : "#222";
      });
    }
    style();

    var start = [0.12, 0.12], goal = [1.38, 0.88];
    var obst = [[0.45, 0.45, 0.17], [0.85, 0.7, 0.14], [1.05, 0.3, 0.15], [0.3, 0.82, 0.1]];
    var seed = 1;
    var result = null;
    var W = 0, H = 0, S = 1, dpr = 1, drag = null;

    function free(x, y) {
      if (x < 0 || y < 0 || x > WX || y > WY) return false;
      for (var i = 0; i < obst.length; i++) {
        var o = obst[i];
        if ((x - o[0]) * (x - o[0]) + (y - o[1]) * (y - o[1]) <= o[2] * o[2]) return false;
      }
      return true;
    }
    function edgeFree(a, b) {
      var n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.005));
      for (var i = 0; i <= n; i++) { var t = i / n; if (!free(a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))) return false; }
      return true;
    }

    // ---------------- A*
    function astar() {
      var N = GX * GY, occ = new Uint8Array(N), g = new Float64Array(N), par = new Int32Array(N), order = new Int32Array(N);
      for (var j = 0; j < GY; j++) for (var i = 0; i < GX; i++) occ[j * GX + i] = free((i + 0.5) * CELL, (j + 0.5) * CELL) ? 0 : 1;
      function cellOf(p) { return Math.min(GY - 1, Math.max(0, Math.floor(p[1] / CELL))) * GX + Math.min(GX - 1, Math.max(0, Math.floor(p[0] / CELL))); }
      var s = cellOf(start), t = cellOf(goal);
      g.fill(Infinity); par.fill(-1); order.fill(-1);
      if (occ[s] || occ[t]) return { type: "grid", occ: occ, order: order, n: 0, path: null };
      var tx = t % GX, ty = Math.floor(t / GX);
      function h(c) { return Math.hypot(c % GX - tx, Math.floor(c / GX) - ty); }
      // binary heap of [f, cell]
      var heap = [];
      function push(f, c) { heap.push([f, c]); var k = heap.length - 1; while (k > 0) { var p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; var tmp = heap[p]; heap[p] = heap[k]; heap[k] = tmp; k = p; } }
      function pop() {
        var top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last; var k = 0;
          for (;;) {
            var l = 2 * k + 1, r = l + 1, m = k;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === k) break;
            var tmp = heap[m]; heap[m] = heap[k]; heap[k] = tmp; k = m;
          }
        }
        return top;
      }
      g[s] = 0; push(h(s), s);
      var n = 0;
      while (heap.length) {
        var c = pop()[1];
        if (order[c] >= 0) continue;
        order[c] = n++;
        if (c === t) break;
        var cx = c % GX, cy = Math.floor(c / GX);
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= GX || ny >= GY) continue;
          var m = ny * GX + nx;
          if (occ[m] || order[m] >= 0) continue;
          if (dx && dy && (occ[cy * GX + nx] || occ[ny * GX + cx])) continue;
          var ng = g[c] + (dx && dy ? Math.SQRT2 : 1);
          if (ng < g[m]) { g[m] = ng; par[m] = c; push(ng + h(m), m); }
        }
      }
      var path = null;
      if (order[t] >= 0) {
        path = [goal.slice()];
        for (var k = par[t]; k >= 0 && k !== s; k = par[k]) path.push([(k % GX + 0.5) * CELL, (Math.floor(k / GX) + 0.5) * CELL]);
        path.push(start.slice()); path.reverse();
      }
      return { type: "grid", occ: occ, order: order, n: n, path: path };
    }

    // ---------------- RRT / RRT*
    function rrt(star) {
      var rnd = mulberry32(seed * 7919 + (star ? 13 : 0));
      var step = 0.04, nodes = [start.slice()], parent = [-1], cost = [0], children = [[]];
      if (!free(start[0], start[1]) || !free(goal[0], goal[1])) return { type: "tree", nodes: nodes, parent: parent, path: null };
      var iters = star ? 2500 : 4000, best = -1, bestLen = Infinity;
      for (var it = 0; it < iters; it++) {
        var xr = (!star && rnd() < 0.1) ? goal : [rnd() * WX, rnd() * WY];
        var bi = 0, bd = Infinity;
        for (var i = 0; i < nodes.length; i++) {
          var d = (nodes[i][0] - xr[0]) * (nodes[i][0] - xr[0]) + (nodes[i][1] - xr[1]) * (nodes[i][1] - xr[1]);
          if (d < bd) { bd = d; bi = i; }
        }
        bd = Math.sqrt(bd);
        var f = Math.min(1, step / (bd + 1e-12));
        var xn = [nodes[bi][0] + f * (xr[0] - nodes[bi][0]), nodes[bi][1] + f * (xr[1] - nodes[bi][1])];
        if (!edgeFree(nodes[bi], xn)) continue;
        var pi = bi, pc = cost[bi] + Math.hypot(xn[0] - nodes[bi][0], xn[1] - nodes[bi][1]), near = [];
        if (star) {
          var n1 = nodes.length + 1, r = Math.min(0.9 * Math.sqrt(Math.log(n1) / n1), 2.5 * step);
          for (i = 0; i < nodes.length; i++) {
            var dd = Math.hypot(nodes[i][0] - xn[0], nodes[i][1] - xn[1]);
            if (dd < r) near.push([i, dd]);
          }
          for (i = 0; i < near.length; i++) {
            var c = cost[near[i][0]] + near[i][1];
            if (c < pc && edgeFree(nodes[near[i][0]], xn)) { pc = c; pi = near[i][0]; }
          }
        }
        var k = nodes.length;
        nodes.push(xn); parent.push(pi); cost.push(pc); children.push([]); children[pi].push(k);
        if (star) {
          for (i = 0; i < near.length; i++) {
            var j = near[i][0], cj = pc + near[i][1];
            if (cj < cost[j] - 1e-12 && edgeFree(xn, nodes[j])) {
              var ch = children[parent[j]]; ch.splice(ch.indexOf(j), 1);
              parent[j] = k; children[k].push(j);
              var delta = cost[j] - cj, stack = [j];
              while (stack.length) { var u = stack.pop(); cost[u] -= delta; for (var q = 0; q < children[u].length; q++) stack.push(children[u][q]); }
            }
          }
        }
        var dg = Math.hypot(xn[0] - goal[0], xn[1] - goal[1]);
        if (dg < step && edgeFree(xn, goal)) {
          if (!star) { best = k; bestLen = cost[k] + dg; break; }
        }
      }
      if (star) {
        for (i = 0; i < nodes.length; i++) {
          var dg2 = Math.hypot(nodes[i][0] - goal[0], nodes[i][1] - goal[1]);
          if (dg2 < 2 * step && cost[i] + dg2 < bestLen && edgeFree(nodes[i], goal)) { bestLen = cost[i] + dg2; best = i; }
        }
      }
      var path = null;
      if (best >= 0) { path = [goal.slice()]; for (k = best; k >= 0; k = parent[k]) path.push(nodes[k]); path.reverse(); }
      return { type: "tree", nodes: nodes, parent: parent, path: path };
    }

    function plan() { result = algo === "A*" ? astar() : rrt(algo === "RRT*"); }

    function pathLen(p) { var L = 0; for (var i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }

    function px(p) { return [p[0] * S, H - p[1] * S]; }

    function resize() {
      dpr = window.devicePixelRatio || 1;
      W = root.clientWidth; S = W / WX; H = Math.round(WY * S);
      if (H > 440) { H = 440; S = H / WY; }
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = H + "px";
      draw();
    }

    function draw() {
      if (!result) return;
      var g = canvas.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#fafafa"; g.fillRect(0, 0, W, H);
      var i;
      if (result.type === "grid") {
        var cs = CELL * S + 0.5;
        for (i = 0; i < GX * GY; i++) {
          if (result.order[i] < 0) continue;
          var p = px([(i % GX) * CELL, (Math.floor(i / GX) + 1) * CELL]);
          g.fillStyle = viridis(result.order[i] / Math.max(1, result.n)); g.globalAlpha = 0.75;
          g.fillRect(p[0], p[1], cs, cs);
        }
        g.globalAlpha = 1;
      } else {
        g.strokeStyle = "rgba(31,119,180,0.75)"; g.lineWidth = 1;
        g.beginPath();
        for (i = 1; i < result.nodes.length; i++) {
          var a = px(result.nodes[i]), b = px(result.nodes[result.parent[i]]);
          g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
        }
        g.stroke();
      }
      for (i = 0; i < obst.length; i++) {
        var c = px(obst[i]);
        g.beginPath(); g.arc(c[0], c[1], obst[i][2] * S, 0, 2 * Math.PI);
        g.fillStyle = "rgba(127,127,127,0.75)"; g.fill();
      }
      if (result.path) {
        g.strokeStyle = "#d62728"; g.lineWidth = 3.5; g.lineJoin = "round"; g.beginPath();
        for (i = 0; i < result.path.length; i++) { var q = px(result.path[i]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
        g.stroke();
      }
      var s = px(start), t = px(goal);
      g.beginPath(); g.arc(s[0], s[1], 9, 0, 2 * Math.PI); g.fillStyle = "#fff"; g.fill(); g.lineWidth = 2.5; g.strokeStyle = "#222"; g.stroke();
      g.beginPath();
      for (i = 0; i < 10; i++) {
        var rr = i % 2 ? 6 : 14, an = -Math.PI / 2 + i * Math.PI / 5;
        g.lineTo(t[0] + rr * Math.cos(an), t[1] + rr * Math.sin(an));
      }
      g.closePath(); g.fillStyle = "#ff7f0e"; g.fill(); g.lineWidth = 1.5; g.strokeStyle = "#222"; g.stroke();
      g.fillStyle = "#555"; g.font = "13px sans-serif"; g.fillText(T.hint, 8, 18);
      var txt = result.type === "grid" ? (T.expanded + " " + result.n) : (T.nodes + " " + result.nodes.length);
      txt += "   " + (result.path ? T.len + " " + pathLen(result.path).toFixed(3) : T.none);
      info.textContent = txt;
      re.style.display = result.type === "grid" ? "none" : "";
    }

    function pick(w) {
      if (Math.hypot(w[0] - start[0], w[1] - start[1]) < 0.05) return { kind: "start" };
      if (Math.hypot(w[0] - goal[0], w[1] - goal[1]) < 0.06) return { kind: "goal" };
      for (var i = obst.length - 1; i >= 0; i--) if (Math.hypot(w[0] - obst[i][0], w[1] - obst[i][1]) < obst[i][2]) return { kind: "obst", i: i, dx: w[0] - obst[i][0], dy: w[1] - obst[i][1] };
      return null;
    }
    function world(ev) {
      var r = canvas.getBoundingClientRect();
      return [Math.max(0.01, Math.min(WX - 0.01, (ev.clientX - r.left) / S)), Math.max(0.01, Math.min(WY - 0.01, (H - (ev.clientY - r.top)) / S))];
    }
    var pending = false;
    function replan() {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(function () { pending = false; plan(); draw(); });
    }
    canvas.addEventListener("pointerdown", function (ev) {
      drag = pick(world(ev));
      if (drag) { canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); }
    });
    canvas.addEventListener("pointermove", function (ev) {
      var w = world(ev);
      if (!drag) { canvas.style.cursor = pick(w) ? "grab" : "default"; return; }
      if (drag.kind === "start") start = w;
      else if (drag.kind === "goal") goal = w;
      else { obst[drag.i][0] = w[0] - drag.dx; obst[drag.i][1] = w[1] - drag.dy; }
      replan();
    });
    function up() { drag = null; }
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    re.addEventListener("click", function () { seed++; plan(); draw(); });

    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    plan();
    resize();
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-widget="' + NAME + '"]');
    for (var i = 0; i < nodes.length; i++) if (!nodes[i].dataset.ready) { nodes[i].dataset.ready = "1"; init(nodes[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
