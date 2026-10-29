/* Edge functions and barycentric coordinates explorer (graphics post 02).
 * Drag the vertices a, b, c and the sample point p. Pixels whose centres pass all three edge
 * tests are filled with the barycentric blend of the vertex colours. Math uses the post's y-up
 * convention: E_ab(p) = (b_x - a_x)(p_y - a_y) - (b_y - a_y)(p_x - a_x), positive on the left of a->b.
 */
(function () {
  "use strict";

  var TEXT = {
    en: {
      show: "Show sign of",
      all: "coverage",
      area: "E<sub>ab</sub>(c) = 2 \u00d7 signed area",
      inside: "p is inside",
      outside: "p is outside",
      cw: "clockwise (back-facing): the post's rasterizer would cull it",
      hint: "Drag a, b, c or p.",
      sum: "sum",
    },
    zh: {
      show: "\u663e\u793a\u7b26\u53f7",
      all: "\u8986\u76d6",
      area: "E<sub>ab</sub>(c) = 2 \u00d7 \u6709\u5411\u9762\u79ef",
      inside: "p \u5728\u4e09\u89d2\u5f62\u5185",
      outside: "p \u5728\u4e09\u89d2\u5f62\u5916",
      cw: "\u987a\u65f6\u9488\uff08\u80cc\u9762\uff09\uff1a\u6587\u4e2d\u7684\u5149\u6805\u5316\u5668\u4f1a\u5254\u9664\u5b83",
      hint: "\u62d6\u52a8 a\u3001b\u3001c \u6216 p\u3002",
      sum: "\u548c",
    },
    ja: {
      show: "\u7b26\u53f7\u3092\u8868\u793a",
      all: "\u30ab\u30d0\u30ec\u30c3\u30b8",
      area: "E<sub>ab</sub>(c) = 2 \u00d7 \u7b26\u53f7\u4ed8\u304d\u9762\u7a4d",
      inside: "p \u306f\u4e09\u89d2\u5f62\u306e\u5185\u5074",
      outside: "p \u306f\u4e09\u89d2\u5f62\u306e\u5916\u5074",
      cw: "\u6642\u8a08\u56de\u308a\uff08\u88cf\u9762\uff09\uff1a\u672c\u6587\u306e\u30e9\u30b9\u30bf\u30e9\u30a4\u30b6\u306f\u30ab\u30ea\u30f3\u30b0\u3057\u307e\u3059",
      hint: "a\u3001b\u3001c \u307e\u305f\u306f p \u3092\u30c9\u30e9\u30c3\u30b0\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
      sum: "\u548c",
    },
  };

  var GW = 24, GH = 16; // pixel grid (cells)
  var VCOL = [[230, 51, 51], [51, 179, 64], [51, 102, 230]];
  var NAMES = ["a", "b", "c"];

  function edge(a, b, p) {
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  }

  function setup(root) {
    var T = TEXT[root.dataset.lang] || TEXT.en;
    root.style.background = "#fbfbfd";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.color = "#222";
    root.innerHTML = "";

    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px 0;font-size:14px";
    var lab = document.createElement("span");
    lab.textContent = T.show + ":";
    bar.appendChild(lab);
    var modes = ["E_ab", "E_bc", "E_ca", T.all];
    var mode = 3;
    var buttons = modes.map(function (m, i) {
      var bt = document.createElement("button");
      bt.type = "button";
      bt.textContent = m;
      bt.style.cssText = "border:1px solid #9467bd;border-radius:14px;padding:2px 10px;font-size:13px;cursor:pointer";
      bt.addEventListener("click", function () { mode = i; draw(); });
      bar.appendChild(bt);
      return bt;
    });
    root.appendChild(bar);

    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;margin:0 auto;touch-action:none;cursor:crosshair";
    root.appendChild(canvas);
    var info = document.createElement("div");
    info.style.cssText = "padding:4px 10px 10px;font-size:14px;line-height:1.5;font-variant-numeric:tabular-nums";
    root.appendChild(info);
    var ctx = canvas.getContext("2d");

    // geometry in grid units, y up (0..GH)
    var P = [[3.2, 2.1], [21.0, 5.2], [9.4, 14.2], [10.5, 6.5]]; // a, b, c, p
    var cell = 20, W = 0, H = 0, drag = -1, lastW = -1;

    function resize() {
      var w = Math.max(260, root.clientWidth);
      if (w === lastW) return; // height changes of the container must not loop
      lastW = w;
      cell = Math.min(w / GW, 26); // cap the height on wide screens
      W = cell * GW; H = cell * GH;
      canvas.style.width = W + "px";
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function toPx(q) { return [q[0] * cell, H - q[1] * cell]; }
    function fromPx(x, y) {
      return [Math.min(GW, Math.max(0, x / cell)), Math.min(GH, Math.max(0, (H - y) / cell))];
    }

    function draw() {
      buttons.forEach(function (bt, i) {
        bt.style.background = i === mode ? "#9467bd" : "#fff";
        bt.style.color = i === mode ? "#fff" : "#5a3d85";
      });
      var a = P[0], b = P[1], c = P[2], p = P[3];
      var area = edge(a, b, c);
      var s = area < 0 ? -1 : 1; // for a clockwise triangle "inside" means all edge functions <= 0
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
      var pairs = [[a, b], [b, c], [c, a]];
      for (var j = 0; j < GH; j++) {
        for (var i = 0; i < GW; i++) {
          var q = [i + 0.5, j + 0.5];
          var e = [edge(b, c, q), edge(c, a, q), edge(a, b, q)]; // lambda numerators (a, b, c)
          var x = i * cell, y = H - (j + 1) * cell;
          if (mode < 3) {
            var v = edge(pairs[mode][0], pairs[mode][1], q);
            ctx.fillStyle = v >= 0 ? "#cde6cd" : "#f7d0d0";
            ctx.fillRect(x, y, cell, cell);
          } else if (area !== 0 && s * e[0] >= 0 && s * e[1] >= 0 && s * e[2] >= 0) {
            var col = [0, 0, 0];
            for (var k = 0; k < 3; k++) {
              var l = e[k] / area;
              col[0] += l * VCOL[k][0]; col[1] += l * VCOL[k][1]; col[2] += l * VCOL[k][2];
            }
            ctx.fillStyle = area > 0 ? "rgb(" + col.map(Math.round).join(",") + ")" : "#c8c8c8";
            ctx.fillRect(x, y, cell, cell);
          }
        }
      }
      // grid and pixel centres
      ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (i = 0; i <= GW; i++) { ctx.moveTo(i * cell + 0.5, 0); ctx.lineTo(i * cell + 0.5, H); }
      for (j = 0; j <= GH; j++) { ctx.moveTo(0, j * cell + 0.5); ctx.lineTo(W, j * cell + 0.5); }
      ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      for (j = 0; j < GH; j++) for (i = 0; i < GW; i++) {
        ctx.fillRect((i + 0.5) * cell - 1, H - (j + 0.5) * cell - 1, 2, 2);
      }
      // sub-triangles at p, each in the colour of the opposite vertex (its area / total = lambda)
      var subs = [[p, b, c], [p, c, a], [p, a, b]];
      for (k = 0; k < 3; k++) {
        ctx.beginPath();
        subs[k].forEach(function (pt, n) { var z = toPx(pt); if (n) ctx.lineTo(z[0], z[1]); else ctx.moveTo(z[0], z[1]); });
        ctx.closePath();
        ctx.fillStyle = "rgba(" + VCOL[k].join(",") + ",0.12)";
        ctx.fill();
        ctx.strokeStyle = "rgba(" + VCOL[k].join(",") + ",0.9)";
        ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      }
      // triangle edges as arrows a->b->c->a, highlighted edge in mode < 3
      for (k = 0; k < 3; k++) {
        var p0 = toPx(pairs[k][0]), p1 = toPx(pairs[k][1]);
        ctx.strokeStyle = mode === k ? "#9467bd" : "#333";
        ctx.lineWidth = mode === k ? 3.5 : 2;
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
        var ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, hs = 9;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(mx + hs * Math.cos(ang), my + hs * Math.sin(ang));
        ctx.lineTo(mx + hs * Math.cos(ang + 2.5), my + hs * Math.sin(ang + 2.5));
        ctx.lineTo(mx + hs * Math.cos(ang - 2.5), my + hs * Math.sin(ang - 2.5));
        ctx.closePath(); ctx.fill();
      }
      // handles
      var r = Math.max(8, cell * 0.38);
      for (k = 0; k < 4; k++) {
        var z = toPx(P[k]);
        ctx.beginPath(); ctx.arc(z[0], z[1], k < 3 ? r : r * 0.8, 0, 2 * Math.PI);
        ctx.fillStyle = k < 3 ? "rgb(" + VCOL[k].join(",") + ")" : "#111";
        ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
        ctx.fillStyle = "#111";
        ctx.font = "bold " + Math.round(Math.max(14, cell * 0.7)) + "px system-ui, sans-serif";
        ctx.fillText(k < 3 ? NAMES[k] : "p", z[0] + r + 2, z[1] - r * 0.4);
      }
      // numbers
      var E = [edge(a, b, p), edge(b, c, p), edge(c, a, p)];
      var lam = area !== 0 ? [E[1] / area, E[2] / area, E[0] / area] : [NaN, NaN, NaN];
      var ins = area !== 0 && lam[0] >= 0 && lam[1] >= 0 && lam[2] >= 0;
      function f(v) { return (v >= 0 ? "+" : "\u2212") + Math.abs(v).toFixed(2); }
      function sp(v, txt) {
        return '<span style="color:' + (v >= 0 ? "#1a7f1a" : "#c62828") + '">' + txt + "</span>";
      }
      info.innerHTML =
        "E<sub>ab</sub>(p) = " + sp(E[0], f(E[0])) + " &nbsp; E<sub>bc</sub>(p) = " + sp(E[1], f(E[1])) +
        " &nbsp; E<sub>ca</sub>(p) = " + sp(E[2], f(E[2])) + "<br>" +
        T.area + " = " + sp(area, f(area)) + "<br>" +
        "\u03bb<sub>a</sub> = " + f(lam[0]) + " &nbsp; \u03bb<sub>b</sub> = " + f(lam[1]) +
        " &nbsp; \u03bb<sub>c</sub> = " + f(lam[2]) + " &nbsp; (" + T.sum + " = " + (lam[0] + lam[1] + lam[2]).toFixed(2) + ")<br>" +
        "<b>" + (ins ? T.inside : T.outside) + "</b>" + (area < 0 ? " &nbsp; <i>" + T.cw + "</i>" : "") +
        ' <span style="color:#777">' + T.hint + "</span>";
    }

    function pick(e) {
      var rc = canvas.getBoundingClientRect();
      var x = e.clientX - rc.left, y = e.clientY - rc.top;
      var best = -1, bd = Infinity;
      for (var k = 3; k >= 0; k--) {
        var z = toPx(P[k]);
        var d = Math.hypot(z[0] - x, z[1] - y);
        if (d < bd) { bd = d; best = k; }
      }
      return bd < Math.max(26, cell) ? best : -1;
    }
    canvas.addEventListener("pointerdown", function (e) {
      drag = pick(e);
      if (drag < 0) drag = 3; // tap anywhere moves p
      canvas.setPointerCapture(e.pointerId);
      move(e);
      e.preventDefault();
    });
    function move(e) {
      if (drag < 0) return;
      var rc = canvas.getBoundingClientRect();
      P[drag] = fromPx(e.clientX - rc.left, e.clientY - rc.top);
      draw();
    }
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", function () { drag = -1; });
    canvas.addEventListener("pointercancel", function () { drag = -1; });

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
  }

  function init() {
    document.querySelectorAll('[data-widget="graphics-barycentric"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
