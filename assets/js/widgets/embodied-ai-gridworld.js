/* Embodied AI post 02: value iteration on a gridworld, one Bellman sweep at a time.
   V_{k+1}(s) = max_a sum_s' P(s'|s,a) [ r(s') + gamma V_k(s') ], with r = +1 / -1 on entering the
   terminal cells and 0 otherwise; the intended move succeeds with probability 1 - 2 slip and each
   perpendicular move happens with probability slip. Click a cell to add or remove a wall.
   Plain JS + Canvas 2D, no dependencies. */
(function () {
  "use strict";
  var NAME = "embodied-ai-gridworld";
  var TXT = {
    en: { step: "Step", run: "Run", pause: "Pause", reset: "Reset", gamma: "\u03b3", slip: "slip", k: "k", dv: "max |\u0394V|", hint: "click a cell to toggle a wall" },
    zh: { step: "\u5355\u6b65", run: "\u8fd0\u884c", pause: "\u6682\u505c", reset: "\u91cd\u7f6e", gamma: "\u03b3", slip: "\u6ed1\u52a8", k: "k", dv: "max |\u0394V|", hint: "\u70b9\u51fb\u683c\u5b50\u53ef\u6dfb\u52a0\u6216\u79fb\u9664\u5899" },
    ja: { step: "1 \u30b9\u30c6\u30c3\u30d7", run: "\u5b9f\u884c", pause: "\u4e00\u6642\u505c\u6b62", reset: "\u30ea\u30bb\u30c3\u30c8", gamma: "\u03b3", slip: "\u6ed1\u308a", k: "k", dv: "max |\u0394V|", hint: "\u30bb\u30eb\u3092\u30af\u30ea\u30c3\u30af\u3067\u58c1\u3092\u8ffd\u52a0\u30fb\u524a\u9664" }
  };
  var GW = 6, GH = 5;
  var ACTS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // up, right, down, left (y up)
  var TERM = { "5,4": 1, "5,3": -1 };

  function el(tag, css, parent) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (parent) parent.appendChild(n);
    return n;
  }

  function color(v) { // RdYlGn-like ramp on [-1, 1]
    var stops = [[-1, [215, 48, 39]], [-0.5, [252, 141, 89]], [0, [255, 255, 191]], [0.5, [145, 207, 96]], [1, [26, 152, 80]]];
    v = Math.max(-1, Math.min(1, v));
    for (var i = 0; i < 4; i++) {
      if (v <= stops[i + 1][0]) {
        var f = (v - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
        return "rgb(" + [0, 1, 2].map(function (k) { return Math.round(stops[i][1][k] + f * (stops[i + 1][1][k] - stops[i][1][k])); }).join(",") + ")";
      }
    }
    return "rgb(26,152,80)";
  }

  function init(root) {
    var T = TXT[root.dataset.lang] || TXT.en;
    root.style.background = "#fafafa";
    root.style.minHeight = "0";
    root.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', sans-serif";
    var canvas = el("canvas", "display:block;margin:0 auto;cursor:pointer;", root);
    var bar = el("div", "display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:8px 10px;font-size:14px;color:#222;border-top:1px solid #e3e3e3;background:#fff;", root);
    function button(t) {
      var b = el("button", "padding:3px 10px;border:1px solid #bbb;border-radius:5px;background:#f3f3f3;cursor:pointer;font-size:14px;", bar);
      b.textContent = t; return b;
    }
    var bStep = button(T.step), bRun = button(T.run), bReset = button(T.reset);
    function slider(lab, min, max, step, val) {
      var l = el("label", "display:flex;align-items:center;gap:5px;", bar);
      l.appendChild(document.createTextNode(lab));
      var s = el("input", "width:90px;", l);
      s.type = "range"; s.min = min; s.max = max; s.step = step; s.value = val;
      var v = el("span", "min-width:2.4em;font-variant-numeric:tabular-nums;", l);
      return [s, v];
    }
    var gs = slider(T.gamma, "0.5", "0.99", "0.01", "0.9"), ss = slider(T.slip, "0", "0.3", "0.05", "0.1");
    var info = el("span", "font-variant-numeric:tabular-nums;color:#444;", bar);

    var walls, V, k, dv, timer = null, W = 0, H = 0, cs = 1, dpr = 1;
    function resetAll() {
      walls = { "1,1": 1, "1,2": 1, "3,2": 1, "3,3": 1 };
      resetV();
    }
    function resetV() {
      V = []; for (var y = 0; y < GH; y++) { V.push([]); for (var x = 0; x < GW; x++) V[y].push(0); }
      k = 0; dv = NaN;
    }
    function gamma() { return parseFloat(gs[0].value); }
    function slip() { return parseFloat(ss[0].value); }
    function move(x, y, a) {
      var nx = x + ACTS[a][0], ny = y + ACTS[a][1];
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || walls[nx + "," + ny]) return [x, y];
      return [nx, ny];
    }
    function q(Vk, x, y, a) {
      var p = slip(), out = 0, outs = [[a, 1 - 2 * p], [(a + 1) % 4, p], [(a + 3) % 4, p]];
      for (var i = 0; i < 3; i++) {
        if (!outs[i][1]) continue;
        var s2 = move(x, y, outs[i][0]), key = s2[0] + "," + s2[1];
        var r = TERM[key] || 0;
        out += outs[i][1] * (r + gamma() * Vk[s2[1]][s2[0]]);
      }
      return out;
    }
    function sweep() {
      var Vn = [], d = 0;
      for (var y = 0; y < GH; y++) {
        Vn.push([]);
        for (var x = 0; x < GW; x++) {
          var key = x + "," + y, v = 0;
          if (!walls[key] && TERM[key] === undefined) {
            v = -Infinity;
            for (var a = 0; a < 4; a++) v = Math.max(v, q(V, x, y, a));
          }
          Vn[y].push(v); d = Math.max(d, Math.abs(v - V[y][x]));
        }
      }
      V = Vn; k++; dv = d;
    }

    function resize() {
      dpr = window.devicePixelRatio || 1;
      W = Math.min(root.clientWidth, 640);
      cs = Math.floor(W / GW); W = cs * GW; H = cs * GH;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      draw();
    }

    function arrow(g, cx, cy, a, len) {
      var dx = ACTS[a][0], dy = -ACTS[a][1];
      var x0 = cx - dx * len * 0.45, y0 = cy - dy * len * 0.45, x1 = cx + dx * len * 0.55, y1 = cy + dy * len * 0.55;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      var hx = -dx * 0.28 * len, hy = -dy * 0.28 * len;
      g.beginPath(); g.moveTo(x1, y1);
      g.lineTo(x1 + hx - dy * 0.18 * len, y1 + hy + dx * 0.18 * len);
      g.lineTo(x1 + hx + dy * 0.18 * len, y1 + hy - dx * 0.18 * len);
      g.closePath(); g.fill();
    }

    function draw() {
      var g = canvas.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.textAlign = "center"; g.textBaseline = "middle";
      for (var y = 0; y < GH; y++) {
        for (var x = 0; x < GW; x++) {
          var px = x * cs, py = (GH - 1 - y) * cs, key = x + "," + y;
          if (walls[key]) { g.fillStyle = "#333"; g.fillRect(px, py, cs, cs); continue; }
          if (TERM[key] !== undefined) {
            g.fillStyle = TERM[key] > 0 ? "#1f77b4" : "#d62728"; g.fillRect(px, py, cs, cs);
            g.fillStyle = "#fff"; g.font = "bold " + Math.round(cs * 0.3) + "px sans-serif";
            g.fillText(TERM[key] > 0 ? "+1" : "-1", px + cs / 2, py + cs / 2);
            continue;
          }
          g.fillStyle = color(V[y][x]); g.fillRect(px, py, cs, cs);
          g.fillStyle = "#222"; g.font = Math.round(cs * 0.2) + "px sans-serif";
          g.fillText(V[y][x].toFixed(2), px + cs / 2, py + cs * 0.78);
          if (k > 0) {
            var best = -Infinity, ba = -1, worst = Infinity;
            for (var a = 0; a < 4; a++) { var qa = q(V, x, y, a); if (qa > best + 1e-12) { best = qa; ba = a; } worst = Math.min(worst, qa); }
            if (best - worst > 1e-9) { g.strokeStyle = "#222"; g.fillStyle = "#222"; g.lineWidth = Math.max(2, cs * 0.04); arrow(g, px + cs / 2, py + cs * 0.4, ba, cs * 0.42); }
          }
        }
      }
      g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 2;
      for (x = 0; x <= GW; x++) { g.beginPath(); g.moveTo(x * cs, 0); g.lineTo(x * cs, H); g.stroke(); }
      for (y = 0; y <= GH; y++) { g.beginPath(); g.moveTo(0, y * cs); g.lineTo(W, y * cs); g.stroke(); }
      gs[1].textContent = gamma().toFixed(2); ss[1].textContent = slip().toFixed(2);
      info.textContent = T.k + " = " + k + "   " + T.dv + " = " + (isNaN(dv) ? "-" : dv.toFixed(4)) + "   (" + T.hint + ")";
    }

    function stop() { if (timer) { clearInterval(timer); timer = null; bRun.textContent = T.run; } }
    bStep.addEventListener("click", function () { stop(); sweep(); draw(); });
    bRun.addEventListener("click", function () {
      if (timer) { stop(); return; }
      bRun.textContent = T.pause;
      timer = setInterval(function () { sweep(); draw(); if (dv < 1e-4) stop(); }, 350);
    });
    bReset.addEventListener("click", function () { stop(); resetAll(); draw(); });
    gs[0].addEventListener("input", function () { resetV(); draw(); });
    ss[0].addEventListener("input", function () { resetV(); draw(); });
    canvas.addEventListener("pointerdown", function (ev) {
      var r = canvas.getBoundingClientRect();
      var x = Math.floor((ev.clientX - r.left) / cs), y = GH - 1 - Math.floor((ev.clientY - r.top) / cs);
      var key = x + "," + y;
      if (x < 0 || y < 0 || x >= GW || y >= GH || TERM[key] !== undefined) return;
      if (walls[key]) delete walls[key]; else walls[key] = 1;
      stop(); resetV(); draw();
    });

    resetAll();
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-widget="' + NAME + '"]');
    for (var i = 0; i < nodes.length; i++) if (!nodes[i].dataset.ready) { nodes[i].dataset.ready = "1"; init(nodes[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
