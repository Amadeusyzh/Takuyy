/* Epipolar geometry explorer (3d-vision post 04).
   Camera 1 sits at the origin (OpenCV frame: x right, y down, z forward); camera 2 has centre C2 and
   rotation R = Ry(yaw) Rx(pitch) as in the post (X2 = R X1 + t, t = -R C2). Both cameras use
   K = [[500, 0, 320], [0, 500, 240], [0, 0, 1]] and a 640 x 480 image.
   E = [t]x R, F = K^-T E K^-1. Drag the point x1 in view 1: view 2 shows its epipolar line l2 = F x1,
   the projections of the ray points at depths Z = 1, 2, 4, 8 m, the epipole e2 = K t (depth 0) and the
   vanishing point K R K^-1 x1 (depth infinity); the depth slider moves a 3D point along the ray.
   Drag in the top view to move camera 2. */
(function () {
  "use strict";
  var TXT = {
    en: {
      v1: "view 1 (drag the point)", v2: "view 2", top: "top view (drag to move camera 2)",
      cx: "C2 x (m)", cy: "C2 y (m)", cz: "C2 z (m)", yaw: "yaw (deg)", pitch: "pitch (deg)", depth: "depth Z (m)", zoom: "zoom out",
      pencil: "show the pencil of epipolar lines", scene: "show the scene",
      post: "Post pair", stereo: "Stereo (sideways)", forward: "Forward motion", rotation: "Pure rotation",
      inf: "at infinity, direction", e1: "e1 (image of C2)", e2: "e2 (image of C1)", line: "l2 = F x1",
      check: "x2^T F x1", noT: "t = 0: E = F = 0. There is no epipolar line; every depth maps to the same point x2 = K R K^-1 x1 (a homography).",
      hint: "Drag the orange point in view 1. In view 2 the match of that pixel can only lie on the orange line; the ticks mark depths 1, 2, 4 and 8 m, the square is the epipole (depth 0) and the open circle the vanishing point (infinite depth). Move camera 2 with the sliders or by dragging in the top view."
    },
    zh: {
      v1: "\u89c6\u56fe 1\uff08\u62d6\u52a8\u8be5\u70b9\uff09", v2: "\u89c6\u56fe 2", top: "\u4fef\u89c6\u56fe\uff08\u62d6\u52a8\u4ee5\u79fb\u52a8\u76f8\u673a 2\uff09",
      cx: "C2 x\uff08\u7c73\uff09", cy: "C2 y\uff08\u7c73\uff09", cz: "C2 z\uff08\u7c73\uff09", yaw: "\u504f\u822a\u89d2\uff08\u5ea6\uff09", pitch: "\u4fef\u4ef0\u89d2\uff08\u5ea6\uff09", depth: "\u6df1\u5ea6 Z\uff08\u7c73\uff09", zoom: "\u89c6\u56fe\u7f29\u5c0f",
      pencil: "\u663e\u793a\u6781\u7ebf\u675f", scene: "\u663e\u793a\u573a\u666f",
      post: "\u6b63\u6587\u4e2d\u7684\u76f8\u673a\u5bf9", stereo: "\u53cc\u76ee\uff08\u6a2a\u5411\u5e73\u79fb\uff09", forward: "\u5411\u524d\u8fd0\u52a8", rotation: "\u7eaf\u65cb\u8f6c",
      inf: "\u4f4d\u4e8e\u65e0\u7a77\u8fdc\uff0c\u65b9\u5411", e1: "e1\uff08C2 \u7684\u50cf\uff09", e2: "e2\uff08C1 \u7684\u50cf\uff09", line: "l2 = F x1",
      check: "x2^T F x1", noT: "t = 0\uff1aE = F = 0\u3002\u4e0d\u5b58\u5728\u6781\u7ebf\uff1b\u6240\u6709\u6df1\u5ea6\u90fd\u6620\u5c04\u5230\u540c\u4e00\u70b9 x2 = K R K^-1 x1\uff08\u4e00\u4e2a\u5355\u5e94\uff09\u3002",
      hint: "\u5728\u89c6\u56fe 1 \u4e2d\u62d6\u52a8\u6a59\u8272\u70b9\u3002\u5728\u89c6\u56fe 2 \u4e2d\uff0c\u8be5\u50cf\u7d20\u7684\u5bf9\u5e94\u70b9\u53ea\u53ef\u80fd\u843d\u5728\u6a59\u8272\u76f4\u7ebf\u4e0a\uff1b\u523b\u5ea6\u6807\u51fa\u6df1\u5ea6 1\u30012\u30014\u30018 \u7c73\uff0c\u65b9\u5757\u662f\u6781\u70b9\uff08\u6df1\u5ea6 0\uff09\uff0c\u7a7a\u5fc3\u5706\u662f\u6d88\u5931\u70b9\uff08\u6df1\u5ea6\u65e0\u7a77\u5927\uff09\u3002\u7528\u6ed1\u5757\u6216\u5728\u4fef\u89c6\u56fe\u4e2d\u62d6\u52a8\u6765\u79fb\u52a8\u76f8\u673a 2\u3002"
    },
    ja: {
      v1: "\u30d3\u30e5\u30fc 1\uff08\u70b9\u3092\u30c9\u30e9\u30c3\u30b0\uff09", v2: "\u30d3\u30e5\u30fc 2", top: "\u4e0a\u9762\u56f3\uff08\u30c9\u30e9\u30c3\u30b0\u3067\u30ab\u30e1\u30e9 2 \u3092\u79fb\u52d5\uff09",
      cx: "C2 x\uff08m\uff09", cy: "C2 y\uff08m\uff09", cz: "C2 z\uff08m\uff09", yaw: "\u30e8\u30fc\u89d2\uff08\u5ea6\uff09", pitch: "\u30d4\u30c3\u30c1\u89d2\uff08\u5ea6\uff09", depth: "\u5965\u884c\u304d Z\uff08m\uff09", zoom: "\u8868\u793a\u7bc4\u56f2",
      pencil: "\u30a8\u30d4\u30dd\u30fc\u30e9\u7dda\u306e\u675f\u3092\u8868\u793a", scene: "\u30b7\u30fc\u30f3\u3092\u8868\u793a",
      post: "\u672c\u6587\u306e\u30ab\u30e1\u30e9\u5bfe", stereo: "\u30b9\u30c6\u30ec\u30aa\uff08\u6a2a\u79fb\u52d5\uff09", forward: "\u524d\u9032", rotation: "\u7d14\u56de\u8ee2",
      inf: "\u7121\u9650\u9060\u3001\u65b9\u5411", e1: "e1\uff08C2 \u306e\u50cf\uff09", e2: "e2\uff08C1 \u306e\u50cf\uff09", line: "l2 = F x1",
      check: "x2^T F x1", noT: "t = 0\uff1aE = F = 0 \u3067\u3059\u3002\u30a8\u30d4\u30dd\u30fc\u30e9\u7dda\u306f\u5b58\u5728\u305b\u305a\u3001\u3059\u3079\u3066\u306e\u5965\u884c\u304d\u304c\u540c\u3058\u70b9 x2 = K R K^-1 x1 \u306b\u5199\u308a\u307e\u3059\uff08\u30db\u30e2\u30b0\u30e9\u30d5\u30a3\uff09\u3002",
      hint: "\u30d3\u30e5\u30fc 1 \u306e\u30aa\u30ec\u30f3\u30b8\u306e\u70b9\u3092\u30c9\u30e9\u30c3\u30b0\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u30d3\u30e5\u30fc 2 \u3067\u306f\u3001\u305d\u306e\u753b\u7d20\u306e\u5bfe\u5fdc\u70b9\u306f\u30aa\u30ec\u30f3\u30b8\u306e\u76f4\u7dda\u4e0a\u306b\u3057\u304b\u3042\u308a\u307e\u305b\u3093\u3002\u76ee\u76db\u308a\u306f\u5965\u884c\u304d 1\u30012\u30014\u30018 m\u3001\u56db\u89d2\u306f\u30a8\u30d4\u30dd\u30fc\u30eb\uff08\u5965\u884c\u304d 0\uff09\u3001\u767d\u629c\u304d\u306e\u4e38\u306f\u6d88\u5931\u70b9\uff08\u5965\u884c\u304d\u7121\u9650\u5927\uff09\u3067\u3059\u3002\u30b9\u30e9\u30a4\u30c0\u30fc\u304b\u4e0a\u9762\u56f3\u306e\u30c9\u30e9\u30c3\u30b0\u3067\u30ab\u30e1\u30e9 2 \u3092\u52d5\u304b\u305b\u307e\u3059\u3002"
    }
  };
  var COL = { c1: "#9467bd", c2: "#1f77b4", line: "#ff7f0e", pt: "#ff7f0e", gray: "#7f7f7f", dark: "#222222",
              scene: "#c4c4cc", pencil: "#a9c4e8", bg: "#fbfbfd", green: "#2ca02c" };
  var W = 640, H = 480, FX = 500, CX = 320, CY = 240;
  var PRESETS = {
    post: { cx: 0.8, cy: 0.1, cz: 0.3, yaw: 10, pitch: -3 },
    stereo: { cx: 0.6, cy: 0, cz: 0, yaw: 0, pitch: 0 },
    forward: { cx: 0, cy: 0, cz: 1.2, yaw: 0, pitch: 0 },
    rotation: { cx: 0, cy: 0, cz: 0, yaw: 12, pitch: -4 }
  };
  var DEPTHS = [1, 2, 4, 8];

  // ---- scene in camera-1 coordinates (y down, floor at y = 1) ----
  var SEGS = [];
  (function () {
    var boxes = [[-1.3, 4.0, 0.8, 0.8, 1.0], [0.7, 5.5, 1.0, 0.7, 1.6], [2.0, 7.5, 0.9, 0.9, 0.9], [-0.6, 9.0, 1.6, 0.7, 2.4]];
    boxes.forEach(function (b) {
      var xs = [b[0] - b[2] / 2, b[0] + b[2] / 2], zs = [b[1] - b[3] / 2, b[1] + b[3] / 2], ys = [1, 1 - b[4]];
      for (var j = 0; j < 2; j++) for (var k = 0; k < 2; k++) {
        SEGS.push([[xs[0], ys[j], zs[k]], [xs[1], ys[j], zs[k]]]);
        SEGS.push([[xs[k], ys[j], zs[0]], [xs[k], ys[j], zs[1]]]);
        SEGS.push([[xs[j], ys[0], zs[k]], [xs[j], ys[1], zs[k]]]);
      }
    });
    for (var g = -4; g <= 4; g += 1) SEGS.push([[g, 1, 2], [g, 1, 12]]);
    for (g = 2; g <= 12; g += 1) SEGS.push([[-4, 1, g], [4, 1, g]]);
  })();

  // ---- small linear algebra ----
  function mul(A, B) {
    var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) for (var k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j];
    return C;
  }
  function T3(A) { return [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]]; }
  function mv(A, v) { return [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function skew(v) { return [[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]; }
  function ry(d) { var a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
  function rx(d) { var a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
  var K = [[FX, 0, CX], [0, FX, CY], [0, 0, 1]], KI = [[1 / FX, 0, -CX / FX], [0, 1 / FX, -CY / FX], [0, 0, 1]];

  function el(tag, css, parent) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (parent) parent.appendChild(e);
    return e;
  }

  function init(root) {
    var lang = TXT[root.dataset.lang] ? root.dataset.lang : "en", T = TXT[lang];
    root.innerHTML = "";
    root.style.background = COL.bg; root.style.padding = "8px"; root.style.boxSizing = "border-box";
    var S = { cx: 0.8, cy: 0.1, cz: 0.3, yaw: 10, pitch: -3, depth: 4, zoom: 1.6, pencil: true, scene: true, u: 400, v: 190 };

    var bar = el("div", "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;", root);
    ["post", "stereo", "forward", "rotation"].forEach(function (k) {
      var b = el("button", "padding:3px 10px;border:1px solid #bbb;border-radius:4px;background:#fff;color:#222;cursor:pointer;font-size:13px;touch-action:manipulation;", bar);
      b.type = "button"; b.textContent = T[k];
      b.addEventListener("click", function () { var p = PRESETS[k]; for (var q in p) S[q] = p[q]; sync(); });
    });
    var canvas = el("canvas", "display:block;width:100%;touch-action:none;cursor:crosshair;", root);
    var panel = el("div", "display:flex;flex-wrap:wrap;gap:2px 18px;margin-top:6px;font-size:13.5px;color:#222;", root);
    var inputs = {};
    function slider(key, min, max, step, digits) {
      var wrap = el("label", "display:flex;align-items:center;gap:8px;flex:1 1 220px;min-width:0;", panel);
      el("span", "white-space:nowrap;flex:none;min-width:5.6em;", wrap).textContent = T[key];
      var inp = el("input", "flex:1;min-width:70px;", wrap);
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step;
      var val = el("span", "font-family:monospace;flex:none;min-width:3.4em;text-align:right;", wrap);
      inp.addEventListener("input", function () { S[key] = parseFloat(inp.value); sync(); });
      inputs[key] = { inp: inp, val: val, digits: digits };
    }
    slider("cx", -1.5, 1.5, 0.01, 2); slider("cy", -0.5, 0.5, 0.01, 2); slider("cz", -1.5, 2.0, 0.01, 2);
    slider("yaw", -40, 40, 0.5, 1); slider("pitch", -20, 20, 0.5, 1); slider("depth", 0.5, 20, 0.05, 2);
    slider("zoom", 1, 6, 0.05, 2);
    var opts = el("div", "display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:4px;font-size:13.5px;color:#222;", root);
    ["pencil", "scene"].forEach(function (key) {
      var w = el("label", "display:flex;align-items:center;gap:6px;cursor:pointer;", opts);
      var c = el("input", "", w); c.type = "checkbox"; c.checked = S[key];
      el("span", "", w).textContent = T[key];
      c.addEventListener("change", function () { S[key] = c.checked; draw(); });
    });
    var readout = el("div", "font-family:monospace;font-size:12.5px;line-height:1.5;margin-top:6px;color:#222;white-space:pre-wrap;overflow-wrap:anywhere;", root);
    el("div", "font-size:12.5px;color:#666;margin-top:4px;", root).textContent = T.hint;

    function sync() {
      for (var k in inputs) { inputs[k].inp.value = S[k]; inputs[k].val.textContent = (+S[k]).toFixed(inputs[k].digits); }
      draw();
    }

    var ctx = canvas.getContext("2d"), Lw = 0, Lh = 0, L = null, placed = [];
    function resize() {
      var w = root.clientWidth - 16;
      if (w < 10) return;
      var narrow = w < 620, gap = 10, vw, vh, th;
      if (narrow) { vw = w; vh = Math.round(vw * 0.62); th = Math.round(w * 0.62); }
      else { vw = (w - gap) / 2; vh = Math.round(vw * 0.62); th = Math.round(Math.min(w * 0.36, 320)); }
      var h = narrow ? 2 * vh + th + 2 * gap + 3 * 18 : vh + th + gap + 2 * 18;
      L = narrow ? { v1: [0, 18, vw, vh], v2: [0, 2 * 18 + vh + gap, vw, vh], top: [0, 3 * 18 + 2 * vh + 2 * gap, w, th] }
                 : { v1: [0, 18, vw, vh], v2: [vw + gap, 18, vw, vh], top: [0, 2 * 18 + vh + gap, w, th] };
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.height = h + "px";
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      Lw = w; Lh = h;
      draw();
    }

    // image-plane window of a view: centre (320, 240), half-size scaled by zoom; keeps the panel aspect
    function viewMap(rect) {
      var hw = 0.5 * W * S.zoom * 1.08, hh = hw * rect[3] / rect[2];
      if (hh < 0.5 * H * S.zoom * 1.08) { hh = 0.5 * H * S.zoom * 1.08; hw = hh * rect[2] / rect[3]; }
      var sc = rect[2] / (2 * hw);
      return { sc: sc, hw: hw, hh: hh,
        to: function (u, v) { return [rect[0] + (u - CX + hw) * sc, rect[1] + (v - CY + hh) * sc]; },
        from: function (x, y) { return [(x - rect[0]) / sc - hw + CX, (y - rect[1]) / sc - hh + CY]; } };
    }

    function geometry() {
      var R = mul(ry(S.yaw), rx(S.pitch)), C2 = [S.cx, S.cy, S.cz];
      var t = mv(R, C2); t = [-t[0], -t[1], -t[2]];
      var E = mul(skew(t), R), F = mul(mul(T3(KI), E), KI);
      return { R: R, C2: C2, t: t, E: E, F: F, tn: Math.hypot(t[0], t[1], t[2]) };
    }
    function proj(G, cam, X) {   // cam 1 or 2; returns homogeneous pixel
      var Xc = cam === 1 ? X : [dot(G.R[0], X) + G.t[0], dot(G.R[1], X) + G.t[1], dot(G.R[2], X) + G.t[2]];
      return mv(K, Xc);
    }

    // clip a homogeneous line a u + b v + c = 0 to the box [u0,u1] x [v0,v1]
    function clipLine(l, u0, u1, v0, v1) {
      var P = [], a = l[0], b = l[1], c = l[2];
      if (Math.abs(b) > 1e-12) { [u0, u1].forEach(function (u) { var v = -(a * u + c) / b; if (v >= v0 && v <= v1) P.push([u, v]); }); }
      if (Math.abs(a) > 1e-12) { [v0, v1].forEach(function (v) { var u = -(b * v + c) / a; if (u >= u0 && u <= u1) P.push([u, v]); }); }
      if (P.length < 2) return null;
      var best = null, bd = -1;
      for (var i = 0; i < P.length; i++) for (var j = i + 1; j < P.length; j++) {
        var d = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]); if (d > bd) { bd = d; best = [P[i], P[j]]; }
      }
      return best;
    }

    function drawView(rect, cam, G, title, col) {
      var M = viewMap(rect), i;
      ctx.save();
      ctx.beginPath(); ctx.rect(rect[0], rect[1], rect[2], rect[3]); ctx.clip();
      ctx.fillStyle = "#ffffff"; ctx.fillRect(rect[0], rect[1], rect[2], rect[3]);
      var a = M.to(0, 0), b = M.to(W, H);
      ctx.fillStyle = "#f3f0f9"; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      if (S.scene) {
        ctx.strokeStyle = COL.scene; ctx.lineWidth = 1;
        ctx.beginPath();
        for (i = 0; i < SEGS.length; i++) {
          var s = SEGS[i];
          var p = proj(G, cam, s[0]), q = proj(G, cam, s[1]);
          if (p[2] < 0.05 && q[2] < 0.05) continue;
          if (p[2] < 0.05 || q[2] < 0.05) {   // clip at depth 0.05
            var tt = (0.05 - p[2]) / (q[2] - p[2]);
            var m = [p[0] + tt * (q[0] - p[0]), p[1] + tt * (q[1] - p[1]), 0.05];
            if (p[2] < 0.05) p = m; else q = m;
          }
          var P1 = M.to(p[0] / p[2], p[1] / p[2]), P2 = M.to(q[0] / q[2], q[1] / q[2]);
          ctx.moveTo(P1[0], P1[1]); ctx.lineTo(P2[0], P2[1]);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      ctx.restore();
      ctx.fillStyle = col; ctx.font = "bold 13px sans-serif";
      ctx.fillText(title, rect[0] + 2, rect[1] - 5);
      return M;
    }

    function line2(M, rect, l, color, width, dash) {
      var lo = M.from(rect[0], rect[1]), hi = M.from(rect[0] + rect[2], rect[1] + rect[3]);
      var seg = clipLine(l, lo[0], hi[0], lo[1], hi[1]);
      if (!seg) return;
      var p = M.to(seg[0][0], seg[0][1]), q = M.to(seg[1][0], seg[1][1]);
      ctx.save(); ctx.beginPath(); ctx.rect(rect[0], rect[1], rect[2], rect[3]); ctx.clip();
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      ctx.restore();
    }
    function marker(M, rect, h, kind, color, label) {
      var inside;
      if (Math.abs(h[2]) < 1e-12) return;
      var u = h[0] / h[2], v = h[1] / h[2], P = M.to(u, v);
      inside = P[0] >= rect[0] && P[0] <= rect[0] + rect[2] && P[1] >= rect[1] && P[1] <= rect[1] + rect[3];
      if (!inside) return;
      ctx.save();
      ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.fillStyle = color;
      if (kind === "sq") ctx.fillRect(P[0] - 5, P[1] - 5, 10, 10);
      else if (kind === "open") { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(P[0], P[1], 5.5, 0, 7); ctx.fill(); ctx.stroke(); }
      else if (kind === "big") { ctx.beginPath(); ctx.arc(P[0], P[1], 7, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(P[0], P[1], 3.5, 0, 7); ctx.fill(); }
      var free = label && placed.every(function (q) { return Math.abs(q[0] - P[0]) > 30 || Math.abs(q[1] - P[1]) > 14; });
      if (free) { placed.push(P); ctx.font = "12px sans-serif"; ctx.fillStyle = COL.dark; ctx.fillText(label, P[0] + 7, P[1] - 7); }
      ctx.restore();
    }

    function drawTop(rect, G, ray, Xd) {
      ctx.save();
      ctx.beginPath(); ctx.rect(rect[0], rect[1], rect[2], rect[3]); ctx.clip();
      ctx.fillStyle = "#ffffff"; ctx.fillRect(rect[0], rect[1], rect[2], rect[3]);
      // x in [-4.5, 4.5] horizontally (scaled to fit), z from -2 upward
      var sc = Math.min(rect[2] / 7, rect[3] / 11.5), ox = rect[0] + rect[2] / 2, oy = rect[1] + rect[3] - 1.6 * sc;
      var to = function (x, z) { return [ox + x * sc, oy - z * sc]; };
      L.topMap = { sc: sc, ox: ox, oy: oy };
      if (S.scene) {
        ctx.strokeStyle = COL.scene; ctx.lineWidth = 1; ctx.beginPath();
        SEGS.forEach(function (s) {
          if (s[0][1] === 1 && s[1][1] === 1 && !(Math.abs(s[0][0] - s[1][0]) > 7 || Math.abs(s[0][2] - s[1][2]) > 10)) {
            var p = to(s[0][0], s[0][2]), q = to(s[1][0], s[1][2]); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
          }
        });
        ctx.stroke();
      }
      function cam(cen, fwd, right, col) {
        var c = to(cen[0], cen[2]), half = Math.tan(Math.atan(W / 2 / FX));
        var a = [cen[0] + 0.8 * (fwd[0] - half * right[0]), cen[2] + 0.8 * (fwd[2] - half * right[2])];
        var b = [cen[0] + 0.8 * (fwd[0] + half * right[0]), cen[2] + 0.8 * (fwd[2] + half * right[2])];
        var A = to(a[0], a[1]), B = to(b[0], b[1]);
        ctx.fillStyle = col; ctx.globalAlpha = 0.2; ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(c[0], c[1], 5, 0, 7); ctx.fill();
      }
      var Rt = T3(G.R);
      cam([0, 0, 0], [0, 0, 1], [1, 0, 0], COL.c1);
      cam(G.C2, mv(Rt, [0, 0, 1]), mv(Rt, [1, 0, 0]), COL.c2);
      var o = to(0, 0), c2 = to(G.C2[0], G.C2[2]);
      ctx.strokeStyle = COL.dark; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(c2[0], c2[1]); ctx.stroke();
      // ray of x1 and the point at the chosen depth
      var far = to(ray[0] * 30, ray[2] * 30), xd = to(Xd[0], Xd[2]);
      ctx.strokeStyle = COL.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(far[0], far[1]); ctx.stroke();
      ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(c2[0], c2[1]); ctx.lineTo(xd[0], xd[1]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COL.green; ctx.beginPath(); ctx.arc(xd[0], xd[1], 5.5, 0, 7); ctx.fill();
      DEPTHS.forEach(function (z) { var p = to(ray[0] * z, z); ctx.fillStyle = COL.line; ctx.fillRect(p[0] - 2.5, p[1] - 2.5, 5, 5); });
      ctx.font = "12px sans-serif"; ctx.fillStyle = COL.c1; ctx.fillText("C1", o[0] - 20, o[1] + 16);
      ctx.fillStyle = COL.c2; ctx.fillText("C2", c2[0] + 7, c2[1] + 16);
      ctx.fillStyle = COL.gray; ctx.fillText("x", rect[0] + rect[2] - 14, oy - 4); ctx.fillText("z", ox + 5, rect[1] + 13);
      ctx.restore();
      ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1; ctx.strokeRect(rect[0] + 0.5, rect[1] + 0.5, rect[2] - 1, rect[3] - 1);
      ctx.fillStyle = COL.dark; ctx.font = "bold 13px sans-serif"; ctx.fillText(T.top, rect[0] + 2, rect[1] - 5);
    }

    function fmt(v, d) { return (v >= 0 ? " " : "") + v.toFixed(d); }
    function draw() {
      if (!Lw || !L) return;
      ctx.clearRect(0, 0, Lw, Lh);
      placed = [];
      var G = geometry(), noT = G.tn < 1e-6, i;
      var x1 = [S.u, S.v, 1], ray = mv(KI, x1);                       // ray with z = 1
      var M1 = drawView(L.v1, 1, G, T.v1, COL.c1);
      var M2 = drawView(L.v2, 2, G, T.v2, COL.c2);
      var e1 = mv(K, G.C2), e2 = mv(K, G.t);
      var l2 = mv(G.F, x1), vinf = mv(mul(mul(K, G.R), KI), x1);
      var Xd = [ray[0] * S.depth, ray[1] * S.depth, S.depth], xd = proj(G, 2, Xd);
      if (!noT) {
        if (S.pencil) {   // epipolar lines of a grid of pixels of view 1, in both views
          for (var gu = 40; gu < W; gu += 140) for (var gv = 40; gv < H; gv += 110) {
            var g = [gu, gv, 1];
            line2(M2, L.v2, mv(G.F, g), COL.pencil, 1);
            var gx = proj(G, 2, [(gu - CX) / FX * 5, (gv - CY) / FX * 5, 5]);
            line2(M1, L.v1, mv(T3(G.F), gx), COL.pencil, 1);
          }
        }
        // view 1: the epipolar line through x1 (and e1) = F^T x2 for any x2 on l2
        line2(M1, L.v1, mv(T3(G.F), xd), COL.line, 2);
        line2(M2, L.v2, l2, COL.line, 2.5);
        marker(M1, L.v1, e1, "sq", COL.dark, "e1");
        marker(M2, L.v2, e2, "sq", COL.dark, "e2");
        DEPTHS.forEach(function (z) { var p = proj(G, 2, [ray[0] * z, ray[1] * z, z]); if (p[2] > 0) marker(M2, L.v2, p, "dot", COL.line, z + " m"); });
        if (vinf[2] > 0) marker(M2, L.v2, vinf, "open", COL.line, "\u221e");
      } else {
        marker(M2, L.v2, vinf, "open", COL.line, "\u221e");
      }
      if (xd[2] > 0) marker(M2, L.v2, xd, "big", COL.green, null);
      marker(M1, L.v1, x1, "big", COL.pt, null);
      drawTop(L.top, G, ray, Xd);

      // readout
      var txt = "", Fn = 0;
      for (i = 0; i < 3; i++) for (var j = 0; j < 3; j++) Fn += G.F[i][j] * G.F[i][j];
      Fn = Math.sqrt(Fn);
      if (noT) txt = T.noT + "\n";
      else {
        txt += "F/|F| = [" + [0, 1, 2].map(function (r) { return [0, 1, 2].map(function (c) { return fmt(G.F[r][c] / Fn, 4); }).join(" "); }).join(" ;") + " ]\n";
        var ep = function (e, name) {
          if (Math.abs(e[2]) < 1e-9 * Math.hypot(e[0], e[1])) { var n = Math.hypot(e[0], e[1]); return name + ": " + T.inf + " (" + (e[0] / n).toFixed(3) + ", " + (e[1] / n).toFixed(3) + ")"; }
          return name + " = (" + (e[0] / e[2]).toFixed(1) + ", " + (e[1] / e[2]).toFixed(1) + ")";
        };
        txt += ep(e1, T.e1) + "\n" + ep(e2, T.e2) + "\n";
        var ln = Math.hypot(l2[0], l2[1]);
        txt += T.line + ": " + (l2[0] / ln).toFixed(4) + " u + " + (l2[1] / ln).toFixed(4) + " v + " + (l2[2] / ln).toFixed(2) + " = 0\n";
      }
      txt += "x1 = (" + S.u.toFixed(1) + ", " + S.v.toFixed(1) + ")";
      if (xd[2] > 0) {
        txt += "   Z = " + S.depth.toFixed(2) + " m \u2192 x2 = (" + (xd[0] / xd[2]).toFixed(1) + ", " + (xd[1] / xd[2]).toFixed(1) + ")";
        if (!noT) {
          var xn = [xd[0] / xd[2], xd[1] / xd[2], 1];
          txt += "   " + T.check + " = " + dot(xn, mv(G.F, x1)).toExponential(1);
        }
      }
      readout.textContent = txt;
    }

    // ---- pointer: drag x1 in view 1, or camera 2 in the top view ----
    var drag = null;
    function inRect(r, x, y) { return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]; }
    function pos(e) { var b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
    function apply(p) {
      if (drag === "v1") {
        var q = viewMap(L.v1).from(p[0], p[1]);
        S.u = Math.max(-W, Math.min(2 * W, q[0])); S.v = Math.max(-H, Math.min(2 * H, q[1]));
        draw();
      } else if (drag === "top" && L.topMap) {
        var m = L.topMap;
        S.cx = Math.max(-1.5, Math.min(1.5, (p[0] - m.ox) / m.sc));
        S.cz = Math.max(-1.5, Math.min(2.0, (m.oy - p[1]) / m.sc));
        sync();
      }
    }
    canvas.addEventListener("pointerdown", function (e) {
      var p = pos(e);
      drag = inRect(L.v1, p[0], p[1]) ? "v1" : inRect(L.top, p[0], p[1]) ? "top" : null;
      if (!drag) return;
      canvas.setPointerCapture(e.pointerId); e.preventDefault(); apply(p);
    });
    canvas.addEventListener("pointermove", function (e) { if (drag) apply(pos(e)); });
    function end() { drag = null; }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    sync();
    resize();
  }

  function boot() {
    var els = document.querySelectorAll('[data-widget="3d-vision-epipolar"]');
    for (var i = 0; i < els.length; i++) init(els[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
