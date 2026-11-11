/* Vanishing points explorer (3d-vision post 01).
   World: X east, Y north, Z up. Camera (OpenCV): x right, y down, z forward, centre at height 1.6 m.
   R = camera_R(yaw, pitch, roll) as in the post; K = [[f, 0, 640], [0, f, 360], [0, 0, 1]], image 1280 x 720.
   The vanishing point of world axis i is v_i = K R e_i (column i of K R); the horizon is the vanishing
   line of the ground plane, l = K^-T R (0, 0, 1). The view shows the extended image plane, so vanishing
   points outside the frame stay visible. With two finite vanishing points of orthogonal directions,
   f = sqrt(-(v1 - c) . (v2 - c)); with three, c is the orthocentre of their triangle. */
(function () {
  "use strict";
  var W = 1280, H = 720, CAMH = 1.6;
  var TXT = {
    en: {
      yaw: "yaw (deg)", pitch: "pitch (deg)", roll: "roll (deg)", f: "focal length f (px)", zoom: "zoom out",
      ext: "extend edges to their vanishing points", ortho: "orthocentre construction",
      inf: "at infinity, direction", fest: "f recovered from v_X and v_Y", none: "not available (a vanishing point is at infinity)",
      horizon: "horizon", reset: "Reset", level: "Level camera", three: "Three-point view",
      hint: "Drag in the view to turn the camera (left/right: yaw, up/down: pitch). The dark rectangle is the 1280 x 720 image; vanishing points outside it are still on the image plane. Press \u201cLevel camera\u201d: vertical edges become parallel in the image and v_Z goes to infinity."
    },
    zh: {
      yaw: "\u504f\u822a\u89d2\uff08\u5ea6\uff09", pitch: "\u4fef\u4ef0\u89d2\uff08\u5ea6\uff09", roll: "\u6eda\u8f6c\u89d2\uff08\u5ea6\uff09", f: "\u7126\u8ddd f\uff08\u50cf\u7d20\uff09", zoom: "\u89c6\u56fe\u7f29\u5c0f",
      ext: "\u5c06\u8fb9\u5ef6\u957f\u5230\u6d88\u5931\u70b9", ortho: "\u5782\u5fc3\u4f5c\u56fe",
      inf: "\u4f4d\u4e8e\u65e0\u7a77\u8fdc\uff0c\u65b9\u5411", fest: "\u7531 v_X \u4e0e v_Y \u6062\u590d\u7684 f", none: "\u65e0\u6cd5\u8ba1\u7b97\uff08\u6709\u6d88\u5931\u70b9\u5728\u65e0\u7a77\u8fdc\uff09",
      horizon: "\u5730\u5e73\u7ebf", reset: "\u91cd\u7f6e", level: "\u76f8\u673a\u6c34\u5e73", three: "\u4e09\u70b9\u900f\u89c6",
      hint: "\u5728\u89c6\u56fe\u4e2d\u62d6\u52a8\u53ef\u8f6c\u52a8\u76f8\u673a\uff08\u5de6\u53f3\u4e3a\u504f\u822a\uff0c\u4e0a\u4e0b\u4e3a\u4fef\u4ef0\uff09\u3002\u6df1\u8272\u77e9\u5f62\u662f 1280 \u00d7 720 \u7684\u56fe\u50cf\uff1b\u843d\u5728\u56fe\u50cf\u4e4b\u5916\u7684\u6d88\u5931\u70b9\u4ecd\u7136\u4f4d\u4e8e\u50cf\u5e73\u9762\u4e0a\u3002\u70b9\u51fb\u201c\u76f8\u673a\u6c34\u5e73\u201d\uff1a\u7ad6\u76f4\u7684\u8fb9\u5728\u56fe\u50cf\u4e2d\u53d8\u4e3a\u5e73\u884c\uff0cv_Z \u79fb\u5230\u65e0\u7a77\u8fdc\u3002"
    },
    ja: {
      yaw: "\u30e8\u30fc\u89d2\uff08\u5ea6\uff09", pitch: "\u30d4\u30c3\u30c1\u89d2\uff08\u5ea6\uff09", roll: "\u30ed\u30fc\u30eb\u89d2\uff08\u5ea6\uff09", f: "\u7126\u70b9\u8ddd\u96e2 f\uff08\u30d4\u30af\u30bb\u30eb\uff09", zoom: "\u8868\u793a\u7bc4\u56f2",
      ext: "\u8fba\u3092\u6d88\u5931\u70b9\u307e\u3067\u5ef6\u9577", ortho: "\u5782\u5fc3\u306e\u4f5c\u56f3",
      inf: "\u7121\u9650\u9060\u3001\u65b9\u5411", fest: "v_X \u3068 v_Y \u304b\u3089\u5fa9\u5143\u3057\u305f f", none: "\u8a08\u7b97\u3067\u304d\u307e\u305b\u3093\uff08\u6d88\u5931\u70b9\u304c\u7121\u9650\u9060\u306b\u3042\u308a\u307e\u3059\uff09",
      horizon: "\u5730\u5e73\u7dda", reset: "\u30ea\u30bb\u30c3\u30c8", level: "\u30ab\u30e1\u30e9\u3092\u6c34\u5e73\u306b", three: "3 \u70b9\u900f\u8996",
      hint: "\u30d3\u30e5\u30fc\u3092\u30c9\u30e9\u30c3\u30b0\u3059\u308b\u3068\u30ab\u30e1\u30e9\u304c\u56de\u308a\u307e\u3059\uff08\u5de6\u53f3\u306f\u30e8\u30fc\u3001\u4e0a\u4e0b\u306f\u30d4\u30c3\u30c1\uff09\u3002\u6fc3\u3044\u9577\u65b9\u5f62\u304c 1280 \u00d7 720 \u306e\u753b\u50cf\u3067\u3059\u3002\u753b\u50cf\u306e\u5916\u306b\u3042\u308b\u6d88\u5931\u70b9\u3082\u50cf\u5e73\u9762\u4e0a\u306b\u3042\u308a\u307e\u3059\u3002\u300c\u30ab\u30e1\u30e9\u3092\u6c34\u5e73\u306b\u300d\u3092\u62bc\u3059\u3068\u3001\u925b\u76f4\u306a\u8fba\u304c\u753b\u50cf\u4e0a\u3067\u5e73\u884c\u306b\u306a\u308a\u3001v_Z \u306f\u7121\u9650\u9060\u3078\u79fb\u308a\u307e\u3059\u3002"
    }
  };
  var COL = { x: "#d62728", y: "#2ca02c", z: "#1f77b4", a: "#9467bd", b: "#ff7f0e", gray: "#7f7f7f",
              dark: "#222222", bg: "#fbfbfd" };
  var AXC = [COL.x, COL.y, COL.z], AXN = ["v_X", "v_Y", "v_Z"];
  var DEF = { yaw: 30, pitch: -15, roll: 0, f: 800, zoom: 2.2 };

  // ---- scene: boxes (cx, cy, sx, sy, sz) and a ground grid, as world-space segments with axis ids ----
  var SEGS = [], GROUND = [];
  (function () {
    var boxes = [[-2.8, 7, 2, 2, 1.0], [-6.5, 9.5, 2.5, 2, 3.2], [-1, 12, 2, 2.5, 2.6], [-8.5, 15, 3, 3, 4.5],
                 [3.5, 9, 2, 3, 2.2], [7, 14, 3, 2, 5.0], [2, 18, 4, 2, 3.4]];
    boxes.forEach(function (b, bi) {
      var ext = bi % 2 === 0;   // extend the edges of every other box only (less clutter)
      var xs = [b[0] - b[2] / 2, b[0] + b[2] / 2], ys = [b[1] - b[3] / 2, b[1] + b[3] / 2], zs = [0, b[4]];
      var i, j, k;
      for (j = 0; j < 2; j++) for (k = 0; k < 2; k++) SEGS.push([[xs[0], ys[j], zs[k]], [xs[1], ys[j], zs[k]], 0, ext && k === 1]);
      for (i = 0; i < 2; i++) for (k = 0; k < 2; k++) SEGS.push([[xs[i], ys[0], zs[k]], [xs[i], ys[1], zs[k]], 1, ext && k === 1]);
      for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) SEGS.push([[xs[i], ys[j], 0], [xs[i], ys[j], zs[1]], 2, ext]);
    });
    for (var g = -20; g <= 20; g += 2) {
      GROUND.push([[g, -20, 0], [g, 40, 0], 1]);
    }
    for (g = -20; g <= 40; g += 2) GROUND.push([[-20, g, 0], [20, g, 0], 0]);
  })();

  function el(tag, css, parent) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (parent) parent.appendChild(e);
    return e;
  }
  function mul(A, B) {
    var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) for (var k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j];
    return C;
  }
  function T3(A) { return [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]]; }
  function rx(a) { var c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
  function rz(a) { var c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }
  function mv(A, v) { return [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]]; }
  // camera_R from the post: rot_z(roll)^T rot_x(-pitch) R0 rot_z(yaw)^T
  function cameraR(yaw, pitch, roll) {
    var R0 = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
    return mul(mul(mul(T3(rz(roll)), rx(-pitch)), R0), T3(rz(yaw)));
  }

  function init(root) {
    var lang = TXT[root.dataset.lang] ? root.dataset.lang : "en";
    var T = TXT[lang];
    root.innerHTML = "";
    root.style.background = COL.bg; root.style.padding = "8px"; root.style.boxSizing = "border-box";
    var S = { yaw: DEF.yaw, pitch: DEF.pitch, roll: DEF.roll, f: DEF.f, zoom: DEF.zoom, ext: true, ortho: true };

    var bar = el("div", "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;", root);
    function button(label, fn) {
      var b = el("button", "padding:3px 10px;border:1px solid #bbb;border-radius:4px;background:#fff;color:#222;cursor:pointer;font-size:13px;", bar);
      b.type = "button"; b.textContent = label; b.addEventListener("click", fn);
    }
    button(T.reset, function () { S.yaw = DEF.yaw; S.pitch = DEF.pitch; S.roll = DEF.roll; S.f = DEF.f; S.zoom = DEF.zoom; sync(); });
    button(T.level, function () { S.pitch = 0; S.roll = 0; sync(); });
    button(T.three, function () { S.yaw = 35; S.pitch = -28; S.roll = 0; S.f = 700; S.zoom = 4.0; sync(); });

    var canvas = el("canvas", "display:block;width:100%;touch-action:none;cursor:grab;", root);
    var panel = el("div", "display:flex;flex-wrap:wrap;gap:2px 18px;margin-top:6px;font-size:13.5px;color:#222;", root);
    var inputs = {};
    function slider(key, min, max, step, digits) {
      var wrap = el("label", "display:flex;align-items:center;gap:8px;flex:1 1 230px;min-width:0;", panel);
      el("span", "white-space:nowrap;flex:none;min-width:5.6em;", wrap).textContent = T[key];
      var inp = el("input", "flex:1;min-width:70px;", wrap);
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step;
      var val = el("span", "font-family:monospace;flex:none;min-width:3.4em;text-align:right;", wrap);
      inp.addEventListener("input", function () { S[key] = parseFloat(inp.value); sync(); });
      inputs[key] = { inp: inp, val: val, digits: digits };
    }
    slider("yaw", -85, 85, 0.5, 1); slider("pitch", -45, 45, 0.5, 1); slider("roll", -30, 30, 0.5, 1);
    slider("f", 300, 1600, 1, 0); slider("zoom", 1, 6, 0.05, 2);
    var opts = el("div", "display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:4px;font-size:13.5px;color:#222;", root);
    function check(key) {
      var w = el("label", "display:flex;align-items:center;gap:6px;cursor:pointer;", opts);
      var c = el("input", "", w); c.type = "checkbox"; c.checked = S[key];
      el("span", "", w).textContent = T[key];
      c.addEventListener("change", function () { S[key] = c.checked; draw(); });
    }
    check("ext"); check("ortho");
    var readout = el("div", "font-family:monospace;font-size:12.5px;line-height:1.5;margin-top:6px;color:#222;white-space:pre-wrap;", root);
    el("div", "font-size:12.5px;color:#666;margin-top:4px;", root).textContent = T.hint;

    function sync() {
      for (var k in inputs) { inputs[k].inp.value = S[k]; inputs[k].val.textContent = (+S[k]).toFixed(inputs[k].digits); }
      draw();
    }

    var ctx = canvas.getContext("2d"), Lw = 0, Lh = 0;
    function resize() {
      var w = root.clientWidth - 16;
      if (w < 10) return;
      var h = Math.round(w < 560 ? w * 0.95 : Math.min(w * 0.62, 520));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.height = h + "px";
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      Lw = w; Lh = h;
      draw();
    }

    function draw() {
      if (!Lw) return;
      var d2r = Math.PI / 180, f = S.f;
      var R = cameraR(S.yaw * d2r, S.pitch * d2r, S.roll * d2r);
      var K = [[f, 0, W / 2], [0, f, H / 2], [0, 0, 1]];
      var KR = mul(K, R);
      // view: image-plane pixels -> canvas
      var half = Math.max(W, H * Lw / Lh) / 2 * S.zoom, sc = Lw / (2 * half);
      function P(u, v) { return [Lw / 2 + (u - W / 2) * sc, Lh / 2 + (v - H / 2) * sc]; }
      ctx.clearRect(0, 0, Lw, Lh);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, Lw, Lh);
      var a = P(0, 0), b = P(W, H);
      ctx.fillStyle = "#f3f0f8"; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);

      function projSeg(s) {
        var p = mv(R, [s[0][0], s[0][1], s[0][2] - CAMH]), q = mv(R, [s[1][0], s[1][1], s[1][2] - CAMH]), near = 0.15;
        if (p[2] < near && q[2] < near) return null;
        var t;
        if (p[2] < near) { t = (near - p[2]) / (q[2] - p[2]); p = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, near]; }
        if (q[2] < near) { t = (near - q[2]) / (p[2] - q[2]); q = [q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t, near]; }
        return [[f * p[0] / p[2] + W / 2, f * p[1] / p[2] + H / 2], [f * q[0] / q[2] + W / 2, f * q[1] / q[2] + H / 2]];
      }
      function line(A, B, color, lw, dash) {
        var pa = P(A[0], A[1]), pb = P(B[0], B[1]);
        ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash || []);
        ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke(); ctx.setLineDash([]);
      }
      // vanishing points: columns of K R
      var V = [0, 1, 2].map(function (i) { return [KR[0][i], KR[1][i], KR[2][i]]; });
      var finite = V.map(function (v) { return Math.abs(v[2]) > 1e-9 * Math.hypot(v[0], v[1]) && Math.abs(v[2]) > 1e-12; });
      var vp = V.map(function (v, i) { return finite[i] ? [v[0] / v[2], v[1] / v[2]] : null; });
      // horizon: K^-T R e_z = (K^-T)(third column of R)
      var r3 = [R[0][2], R[1][2], R[2][2]];
      var hl = [r3[0] / f, r3[1] / f, -r3[0] * (W / 2) / f - r3[1] * (H / 2) / f + r3[2]];

      var i;
      for (i = 0; i < GROUND.length; i++) {
        var g = projSeg(GROUND[i]);
        if (g) line(g[0], g[1], AXC[GROUND[i][2]], 0.8, null);
      }
      ctx.globalAlpha = 1;
      var span = 4 * half;
      for (i = 0; i < SEGS.length; i++) {
        var s = SEGS[i], e = projSeg(s);
        if (!e) continue;
        if (S.ext && s[3] && vp[s[2]]) {
          var v = vp[s[2]];
          var far = Math.hypot(e[0][0] - v[0], e[0][1] - v[1]) < Math.hypot(e[1][0] - v[0], e[1][1] - v[1]) ? e[0] : e[1];
          ctx.globalAlpha = 0.55;
          if (Math.hypot(far[0] - v[0], far[1] - v[1]) < span) line(far, v, AXC[s[2]], 0.8, [4, 4]);
          ctx.globalAlpha = 1;
        }
        line(e[0], e[1], AXC[s[2]], 2.2, null);
      }
      // horizon line across the view
      if (Math.abs(hl[0]) + Math.abs(hl[1]) > 1e-12) {
        var u0 = W / 2 - half * 1.2, u1 = W / 2 + half * 1.2, A2, B2;
        if (Math.abs(hl[1]) > Math.abs(hl[0])) {
          A2 = [u0, -(hl[0] * u0 + hl[2]) / hl[1]]; B2 = [u1, -(hl[0] * u1 + hl[2]) / hl[1]];
        } else {
          var v0 = H / 2 - half * 1.2, v1 = H / 2 + half * 1.2;
          A2 = [-(hl[1] * v0 + hl[2]) / hl[0], v0]; B2 = [-(hl[1] * v1 + hl[2]) / hl[0], v1];
        }
        line(A2, B2, COL.a, 2.2, null);
      }
      ctx.strokeStyle = COL.dark; ctx.lineWidth = 2; ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      // principal point
      var c = P(W / 2, H / 2);
      ctx.strokeStyle = COL.dark; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(c[0] - 6, c[1]); ctx.lineTo(c[0] + 6, c[1]); ctx.moveTo(c[0], c[1] - 6); ctx.lineTo(c[0], c[1] + 6); ctx.stroke();
      // orthocentre construction
      if (S.ortho && finite[0] && finite[1] && finite[2]) {
        ctx.globalAlpha = 0.85;
        for (i = 0; i < 3; i++) {
          var p0 = vp[i], o1 = vp[(i + 1) % 3], o2 = vp[(i + 2) % 3];
          line(o1, o2, COL.dark, 1, null);
          var ex = o2[0] - o1[0], ey = o2[1] - o1[1], L2 = ex * ex + ey * ey;
          var t = ((p0[0] - o1[0]) * ex + (p0[1] - o1[1]) * ey) / L2;
          line(p0, [o1[0] + t * ex, o1[1] + t * ey], AXC[i], 1.2, [2, 4]);
        }
        ctx.globalAlpha = 1;
      }
      // vanishing point markers (or arrows at the border when outside the view / at infinity)
      ctx.font = "bold 13px sans-serif";
      for (i = 0; i < 3; i++) {
        var q, dir, inside = false;
        if (finite[i]) {
          q = P(vp[i][0], vp[i][1]);
          inside = q[0] > 8 && q[0] < Lw - 8 && q[1] > 8 && q[1] < Lh - 8;
          dir = [q[0] - c[0], q[1] - c[1]];
        } else dir = [V[i][0], V[i][1]];
        if (inside) {
          ctx.fillStyle = AXC[i]; ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 2 * Math.PI); ctx.fill();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillText(AXN[i], q[0] + 8, q[1] - 8);
        } else {
          var n = Math.hypot(dir[0], dir[1]) || 1, dx = dir[0] / n, dy = dir[1] / n;
          var tx = dx > 0 ? (Lw - 14 - c[0]) / dx : dx < 0 ? (14 - c[0]) / dx : 1e9;
          var ty = dy > 0 ? (Lh - 14 - c[1]) / dy : dy < 0 ? (14 - c[1]) / dy : 1e9;
          var tt = Math.min(tx, ty), ax = c[0] + dx * tt, ay = c[1] + dy * tt;
          ctx.fillStyle = AXC[i]; ctx.beginPath();
          ctx.moveTo(ax + dx * 10, ay + dy * 10);
          ctx.lineTo(ax - dx * 6 - dy * 7, ay - dy * 6 + dx * 7);
          ctx.lineTo(ax - dx * 6 + dy * 7, ay - dy * 6 - dx * 7);
          ctx.closePath(); ctx.fill();
          ctx.fillText(AXN[i] + (finite[i] ? "" : " \u221e"), Math.max(4, Math.min(Lw - 60, ax - dx * 34 - 14)), Math.max(14, Math.min(Lh - 6, ay - dy * 24 + 4)));
        }
      }

      // readout
      var txt = "";
      for (i = 0; i < 3; i++) {
        var hv = V[i], nn = Math.hypot(hv[0], hv[1], hv[2]);
        txt += AXN[i] + " ~ (" + (hv[0] / nn).toFixed(3) + ", " + (hv[1] / nn).toFixed(3) + ", " + (hv[2] / nn).toFixed(3) + ")  ";
        txt += finite[i] ? "\u2192 (u, v) = (" + vp[i][0].toFixed(1) + ", " + vp[i][1].toFixed(1) + ")" : "\u2192 " + T.inf + " (" + (hv[0] / nn).toFixed(2) + ", " + (hv[1] / nn).toFixed(2) + ")";
        txt += "\n";
      }
      var hn = Math.hypot(hl[0], hl[1]);
      txt += T.horizon + ": " + (hl[0] / hn).toFixed(3) + " u + " + (hl[1] / hn).toFixed(3) + " v + " + (hl[2] / hn).toFixed(1) + " = 0\n";
      var fe = null;
      if (finite[0] && finite[1]) {
        var dd = -((vp[0][0] - W / 2) * (vp[1][0] - W / 2) + (vp[0][1] - H / 2) * (vp[1][1] - H / 2));
        if (dd > 0) fe = Math.sqrt(dd);
      }
      txt += T.fest + ": " + (fe === null ? T.none : fe.toFixed(1) + "  (f = " + f.toFixed(0) + ")");
      readout.textContent = txt;
    }

    var drag = null;
    canvas.addEventListener("pointerdown", function (e) {
      drag = { x: e.clientX, y: e.clientY, yaw: S.yaw, pitch: S.pitch };
      canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drag) return;
      S.yaw = Math.max(-85, Math.min(85, drag.yaw + (e.clientX - drag.x) * 0.25));
      S.pitch = Math.max(-45, Math.min(45, drag.pitch + (e.clientY - drag.y) * 0.25));
      sync();
    });
    function end() { drag = null; canvas.style.cursor = "grab"; }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    sync();
    resize();
  }

  function boot() {
    var els = document.querySelectorAll('[data-widget="3d-vision-vanishing-points"]');
    for (var i = 0; i < els.length; i++) init(els[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
