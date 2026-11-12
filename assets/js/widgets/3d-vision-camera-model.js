/* Camera model explorer (3d-vision post 01).
   A 12 x 9 checkerboard (squares of 0.1 m) in front of a camera, projected with
   u = fx * x_d + cx, v = fy * y_d + cy, where (x_d, y_d) comes from either
   - Brown-Conrady: x = X/Z, r^2 = x^2 + y^2, radial = 1 + k1 r^2 + k2 r^4, plus tangential p1, p2, or
   - Kannala-Brandt (OpenCV fisheye): theta = atan2(sqrt(X^2 + Y^2), Z), theta_d = theta (1 + k1 theta^2 + k2 theta^4),
     (x_d, y_d) = theta_d (cos phi, sin phi).
   Left: 3D view in the OpenCV camera frame (x right, y down, z forward) with the true field of view,
   obtained by unprojecting the image border (fixed-point undistortion or Newton). Drag to orbit.
   Right: the 640 x 480 image. Points where the distortion polynomial folds back are not drawn. */
(function () {
  "use strict";
  var W = 640, H = 480, NX = 12, NY = 9, SQ = 0.1;
  var TXT = {
    en: {
      fx: "f_x (px)", fy: "f_y (px)", cx: "c_x (px)", cy: "c_y (px)", k1: "k_1", k2: "k_2", p1: "p_1", p2: "p_2",
      tilt: "board yaw (deg)", dist: "board distance (m)", lock: "f_y = f_x",
      ideal: "show the undistorted board", bc: "Brown-Conrady", kb: "Kannala-Brandt (fisheye)",
      reset: "Reset", barrel: "Barrel", pincushion: "Pincushion", fisheye: "Fisheye",
      hfov: "horizontal FOV", vfov: "vertical FOV", folds: "parts of the board fall where the model folds back (not drawn)",
      hint: "Drag the 3D view to orbit it. The orange outline in the image is the board without distortion; the 3D frustum is the field of view the current model really sees (the unprojected image border)."
    },
    zh: {
      fx: "f_x\uff08\u50cf\u7d20\uff09", fy: "f_y\uff08\u50cf\u7d20\uff09", cx: "c_x\uff08\u50cf\u7d20\uff09", cy: "c_y\uff08\u50cf\u7d20\uff09",
      k1: "k_1", k2: "k_2", p1: "p_1", p2: "p_2",
      tilt: "\u6807\u5b9a\u677f\u504f\u822a\u89d2\uff08\u5ea6\uff09", dist: "\u6807\u5b9a\u677f\u8ddd\u79bb\uff08\u7c73\uff09", lock: "f_y = f_x",
      ideal: "\u663e\u793a\u65e0\u7578\u53d8\u7684\u6807\u5b9a\u677f", bc: "Brown-Conrady", kb: "Kannala-Brandt\uff08\u9c7c\u773c\uff09",
      reset: "\u91cd\u7f6e", barrel: "\u6876\u5f62", pincushion: "\u6795\u5f62", fisheye: "\u9c7c\u773c",
      hfov: "\u6c34\u5e73\u89c6\u573a\u89d2", vfov: "\u5782\u76f4\u89c6\u573a\u89d2", folds: "\u90e8\u5206\u6807\u5b9a\u677f\u843d\u5728\u6a21\u578b\u53d1\u751f\u6298\u8fd4\u7684\u533a\u57df\uff08\u672a\u7ed8\u5236\uff09",
      hint: "\u62d6\u52a8 3D \u89c6\u56fe\u53ef\u65cb\u8f6c\u89c6\u89d2\u3002\u56fe\u50cf\u4e2d\u7684\u6a59\u8272\u8f6e\u5ed3\u662f\u65e0\u7578\u53d8\u65f6\u7684\u6807\u5b9a\u677f\uff1b3D \u89c6\u9525\u662f\u5f53\u524d\u6a21\u578b\u771f\u6b63\u770b\u5230\u7684\u89c6\u573a\uff08\u5373\u56fe\u50cf\u8fb9\u754c\u53cd\u6295\u5f71\u540e\u7684\u5c04\u7ebf\uff09\u3002"
    },
    ja: {
      fx: "f_x\uff08\u30d4\u30af\u30bb\u30eb\uff09", fy: "f_y\uff08\u30d4\u30af\u30bb\u30eb\uff09", cx: "c_x\uff08\u30d4\u30af\u30bb\u30eb\uff09", cy: "c_y\uff08\u30d4\u30af\u30bb\u30eb\uff09",
      k1: "k_1", k2: "k_2", p1: "p_1", p2: "p_2",
      tilt: "\u30dc\u30fc\u30c9\u306e\u30e8\u30fc\u89d2\uff08\u5ea6\uff09", dist: "\u30dc\u30fc\u30c9\u307e\u3067\u306e\u8ddd\u96e2\uff08m\uff09", lock: "f_y = f_x",
      ideal: "\u6b6a\u307f\u306e\u306a\u3044\u30dc\u30fc\u30c9\u3092\u8868\u793a", bc: "Brown-Conrady", kb: "Kannala-Brandt\uff08\u9b5a\u773c\uff09",
      reset: "\u30ea\u30bb\u30c3\u30c8", barrel: "\u6a3d\u578b", pincushion: "\u7cf8\u5dfb\u304d\u578b", fisheye: "\u9b5a\u773c",
      hfov: "\u6c34\u5e73\u753b\u89d2", vfov: "\u5782\u76f4\u753b\u89d2", folds: "\u30dc\u30fc\u30c9\u306e\u4e00\u90e8\u304c\u30e2\u30c7\u30eb\u304c\u6298\u308a\u8fd4\u3059\u9818\u57df\u306b\u5165\u3063\u3066\u3044\u307e\u3059\uff08\u63cf\u753b\u3057\u307e\u305b\u3093\uff09",
      hint: "3D \u30d3\u30e5\u30fc\u3092\u30c9\u30e9\u30c3\u30b0\u3059\u308b\u3068\u8996\u70b9\u304c\u56de\u308a\u307e\u3059\u3002\u753b\u50cf\u4e2d\u306e\u30aa\u30ec\u30f3\u30b8\u306e\u8f2a\u90ed\u306f\u6b6a\u307f\u304c\u306a\u3044\u5834\u5408\u306e\u30dc\u30fc\u30c9\u3067\u3059\u3002 3D \u306e\u8996\u9310\u53f0\u306f\u3001\u73fe\u5728\u306e\u30e2\u30c7\u30eb\u304c\u5b9f\u969b\u306b\u898b\u3066\u3044\u308b\u8996\u91ce\uff08\u753b\u50cf\u306e\u5883\u754c\u3092\u9006\u6295\u5f71\u3057\u305f\u5149\u7dda\uff09\u3067\u3059\u3002"
    }
  };
  var COL = { x: "#d62728", y: "#2ca02c", z: "#1f77b4", a: "#9467bd", b: "#ff7f0e", gray: "#7f7f7f",
              dark: "#222222", fill: "rgba(148,103,189,0.12)", bg: "#fbfbfd" };
  var DEF = { model: "bc", fx: 500, fy: 500, cx: 320, cy: 240, k1: 0, k2: 0, p1: 0, p2: 0, tilt: 25, dist: 1.5 };
  var PRESETS = {
    reset: DEF,
    barrel: { model: "bc", fx: 420, fy: 420, cx: 320, cy: 240, k1: -0.32, k2: 0.08, p1: 0, p2: 0, tilt: 20, dist: 0.8 },
    pincushion: { model: "bc", fx: 520, fy: 520, cx: 320, cy: 240, k1: 0.25, k2: 0.0, p1: 0, p2: 0, tilt: 20, dist: 1.1 },
    fisheye: { model: "kb", fx: 190, fy: 190, cx: 320, cy: 240, k1: 0, k2: 0, p1: 0, p2: 0, tilt: 15, dist: 0.32 }
  };

  function el(tag, css, parent) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (parent) parent.appendChild(e);
    return e;
  }
  function copy(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }

  function init(root) {
    var lang = TXT[root.dataset.lang] ? root.dataset.lang : "en";
    var T = TXT[lang];
    root.innerHTML = "";
    root.style.background = COL.bg;
    root.style.padding = "8px";
    root.style.boxSizing = "border-box";
    var S = copy(DEF);
    S.lock = true; S.ideal = true; S.yaw = -0.85; S.pitch = 0.35;

    var bar = el("div", "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;font-size:13.5px;", root);
    function button(label, fn) {
      var b = el("button", "padding:3px 10px;border:1px solid #bbb;border-radius:4px;background:#fff;color:#222;cursor:pointer;font-size:13px;", bar);
      b.type = "button"; b.textContent = label;
      b.addEventListener("click", fn);
      return b;
    }
    var mb = {};
    mb.bc = button(T.bc, function () { S.model = "bc"; S.k1 = 0; S.k2 = 0; sync(); });
    mb.kb = button(T.kb, function () { S.model = "kb"; S.k1 = 0; S.k2 = 0; S.p1 = 0; S.p2 = 0; sync(); });
    el("span", "width:10px;", bar);
    ["reset", "barrel", "pincushion", "fisheye"].forEach(function (k) {
      button(T[k], function () { var p = PRESETS[k]; for (var q in p) S[q] = p[q]; sync(); });
    });

    var canvas = el("canvas", "display:block;width:100%;touch-action:none;cursor:grab;", root);
    var panel = el("div", "display:flex;flex-wrap:wrap;gap:2px 18px;margin-top:6px;font-size:13.5px;color:#222;", root);
    var inputs = {};
    function slider(key, min, max, step, digits) {
      var wrap = el("label", "display:flex;align-items:center;gap:8px;flex:1 1 230px;min-width:0;", panel);
      var name = el("span", "white-space:nowrap;flex:none;min-width:5.6em;", wrap);
      name.textContent = T[key];
      var inp = el("input", "flex:1;min-width:70px;", wrap);
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step;
      var val = el("span", "font-family:monospace;flex:none;min-width:3.8em;text-align:right;", wrap);
      inp.addEventListener("input", function () {
        S[key] = parseFloat(inp.value);
        if (S.lock && key === "fx") S.fy = S.fx;
        if (S.lock && key === "fy") S.fx = S.fy;
        sync();
      });
      inputs[key] = { inp: inp, val: val, digits: digits, wrap: wrap };
    }
    slider("fx", 120, 1200, 1, 0); slider("fy", 120, 1200, 1, 0);
    slider("cx", 200, 440, 1, 0); slider("cy", 140, 340, 1, 0);
    slider("k1", -0.5, 0.5, 0.005, 3); slider("k2", -0.2, 0.2, 0.002, 3);
    slider("p1", -0.05, 0.05, 0.001, 3); slider("p2", -0.05, 0.05, 0.001, 3);
    slider("tilt", -60, 60, 1, 0); slider("dist", 0.25, 3, 0.01, 2);
    var opts = el("div", "display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:4px;font-size:13.5px;color:#222;", root);
    function check(key, label) {
      var w = el("label", "display:flex;align-items:center;gap:6px;cursor:pointer;", opts);
      var c = el("input", "", w); c.type = "checkbox"; c.checked = S[key];
      el("span", "", w).textContent = label;
      c.addEventListener("change", function () { S[key] = c.checked; if (key === "lock" && c.checked) S.fy = S.fx; sync(); });
    }
    check("lock", T.lock); check("ideal", T.ideal);
    var readout = el("div", "font-family:monospace;font-size:12.5px;line-height:1.5;margin-top:6px;color:#222;white-space:pre-wrap;", root);
    var hint = el("div", "font-size:12.5px;color:#666;margin-top:4px;", root);
    hint.textContent = T.hint;

    function sync() {
      for (var k in inputs) {
        var I = inputs[k];
        I.inp.value = S[k];
        I.val.textContent = (+S[k]).toFixed(I.digits);
        var off = S.model === "kb" && (k === "p1" || k === "p2");
        I.inp.disabled = off;
        I.wrap.style.opacity = off ? "0.4" : "1";
      }
      mb.bc.style.background = S.model === "bc" ? "#e8e0f5" : "#fff";
      mb.kb.style.background = S.model === "kb" ? "#e8e0f5" : "#fff";
      mb.bc.style.borderColor = S.model === "bc" ? COL.a : "#bbb";
      mb.kb.style.borderColor = S.model === "kb" ? COL.a : "#bbb";
      draw();
    }

    // ---------------- camera model ----------------
    // normalized distorted coordinates of a camera-frame point, or null where the model is invalid
    function distortN(X) {
      if (S.model === "bc") {
        if (X[2] < 1e-3) return null;
        var x = X[0] / X[2], y = X[1] / X[2], r2 = x * x + y * y;
        if (r2 > 25) return null;
        if (1 + 3 * S.k1 * r2 + 5 * S.k2 * r2 * r2 <= 0.02) return null; // d r_d / d r <= 0: folded
        var rad = 1 + S.k1 * r2 + S.k2 * r2 * r2;
        return [x * rad + 2 * S.p1 * x * y + S.p2 * (r2 + 2 * x * x), y * rad + S.p1 * (r2 + 2 * y * y) + 2 * S.p2 * x * y];
      }
      var rho = Math.sqrt(X[0] * X[0] + X[1] * X[1]);
      var th = Math.atan2(rho, X[2]);
      if (th > 2.3) return null; // about 132 degrees off-axis
      var t2 = th * th;
      if (1 + 3 * S.k1 * t2 + 5 * S.k2 * t2 * t2 <= 0.02) return null;
      var td = th * (1 + S.k1 * t2 + S.k2 * t2 * t2);
      if (rho < 1e-12) return [0, 0];
      return [td * X[0] / rho, td * X[1] / rho];
    }
    function toPix(n) { return [S.fx * n[0] + S.cx, S.fy * n[1] + S.cy]; }
    // unit ray for a pixel (inverse model), or null if it does not converge
    function unproject(u, v) {
      var xd = (u - S.cx) / S.fx, yd = (v - S.cy) / S.fy, i;
      if (S.model === "bc") {
        var x = xd, y = yd;
        for (i = 0; i < 60; i++) {
          var r2 = x * x + y * y, rad = 1 + S.k1 * r2 + S.k2 * r2 * r2;
          if (rad <= 0.05) return null;
          var tx = 2 * S.p1 * x * y + S.p2 * (r2 + 2 * x * x), ty = S.p1 * (r2 + 2 * y * y) + 2 * S.p2 * x * y;
          x = (xd - tx) / rad; y = (yd - ty) / rad;
        }
        var chk = distortN([x, y, 1]);
        if (!chk || Math.abs(chk[0] - xd) + Math.abs(chk[1] - yd) > 1e-4) return null;
        var n = Math.sqrt(x * x + y * y + 1);
        return [x / n, y / n, 1 / n];
      }
      var tdv = Math.sqrt(xd * xd + yd * yd), th = tdv;
      for (i = 0; i < 40; i++) {
        var t2 = th * th, g = th * (1 + S.k1 * t2 + S.k2 * t2 * t2) - tdv, dg = 1 + 3 * S.k1 * t2 + 5 * S.k2 * t2 * t2;
        if (dg <= 0.02) return null;
        th -= g / dg;
      }
      if (!(th >= 0 && th < 2.3)) return null;
      var s = tdv > 1e-12 ? Math.sin(th) / tdv : 0;
      return [xd * s, yd * s, Math.cos(th)];
    }
    function board() {
      var a = S.tilt * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), b = -0.18, cb = Math.cos(b), sb = Math.sin(b);
      return function (i, j) {
        var x = (i - NX / 2) * SQ, y = (j - NY / 2) * SQ;
        var y1 = cb * y, z1 = sb * y;            // small tilt about x
        return [c * x + s * z1, y1, -s * x + c * z1 + S.dist];
      };
    }

    var ctx = canvas.getContext("2d");
    var L = {};
    function resize() {
      var w = root.clientWidth - 16;
      if (w < 10) return;
      var hh;
      if (w >= 640) {
        var imw = w * 0.52, imh = imw * 0.75;
        L.v3 = { x: 0, y: 0, w: w - imw - 8, h: imh };
        L.im = { x: w - imw, y: 0, w: imw, h: imh };
        hh = imh;
      } else {
        var h3 = Math.round(w * 0.62), him = Math.round(w * 0.75);
        L.v3 = { x: 0, y: 0, w: w, h: h3 };
        L.im = { x: 0, y: h3 + 6, w: w, h: him };
        hh = h3 + 6 + him;
      }
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.height = hh + "px";
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      L.w = w; L.h = hh;
      draw();
    }

    // 3D view: data (x, y down, z forward) -> plot (x, z, -y) -> orbit -> perspective
    function view(p) {
      var px = p[0], py = p[2] - 1.0, pz = -p[1];
      var cy = Math.cos(S.yaw), sy = Math.sin(S.yaw);
      var x1 = cy * px - sy * py, y1 = sy * px + cy * py;
      var cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
      var y2 = cp * y1 + sp * pz, z2 = -sp * y1 + cp * pz;
      var D = 6, s = D / (D + y2), r = L.v3, sc = Math.min(r.w, r.h) * 0.36;
      return [r.x + r.w / 2 + x1 * s * sc, r.y + r.h / 2 - z2 * s * sc];
    }
    function line3(a, b, color, lw, dash) {
      var A = view(a), B = view(b);
      ctx.strokeStyle = color; ctx.lineWidth = lw || 1.4; ctx.setLineDash(dash || []);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); ctx.setLineDash([]);
    }
    function scale(v, s) { return [v[0] * s, v[1] * s, v[2] * s]; }

    function borderPixels(n) {
      var pts = [], i;
      for (i = 0; i < n; i++) pts.push([W * i / n, 0]);
      for (i = 0; i < n; i++) pts.push([W, H * i / n]);
      for (i = 0; i < n; i++) pts.push([W - W * i / n, H]);
      for (i = 0; i < n; i++) pts.push([0, H - H * i / n]);
      return pts;
    }

    function draw3d() {
      var r = L.v3;
      ctx.save();
      ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      ctx.fillStyle = "#fff"; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      var B = board(), i, j;
      for (i = 0; i < NX; i++) for (j = 0; j < NY; j++) {
        var q = [B(i, j), B(i + 1, j), B(i + 1, j + 1), B(i, j + 1)];
        ctx.fillStyle = (i + j) % 2 ? "#333" : "#eee";
        ctx.beginPath();
        for (var k = 0; k < 4; k++) { var P = view(q[k]); if (k) ctx.lineTo(P[0], P[1]); else ctx.moveTo(P[0], P[1]); }
        ctx.closePath(); ctx.fill();
      }
      // field of view: unprojected border at radius R, corner rays extended
      var R = 0.7, O = [0, 0, 0], bp = borderPixels(24), rays = [], ok = true;
      for (i = 0; i < bp.length; i++) { var d = unproject(bp[i][0], bp[i][1]); rays.push(d); if (!d) ok = false; }
      if (ok) {   // the whole border is valid: fill the field of view
        ctx.fillStyle = COL.fill; ctx.beginPath();
        for (i = 0; i < rays.length; i++) { var Q = view(scale(rays[i], R)); if (i) ctx.lineTo(Q[0], Q[1]); else ctx.moveTo(Q[0], Q[1]); }
        ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = COL.a; ctx.lineWidth = 2; ctx.beginPath();
      for (i = 0; i <= rays.length; i++) {
        var ra = rays[i % rays.length], rb = rays[(i + rays.length - 1) % rays.length];
        if (!ra) continue;
        var Q2 = view(scale(ra, R));
        if (i && rb) ctx.lineTo(Q2[0], Q2[1]); else ctx.moveTo(Q2[0], Q2[1]);
      }
      ctx.stroke();
      for (i = 0; i < 4; i++) {
        var cr = rays[i * 24];
        if (!cr) continue;
        line3(O, scale(cr, R), COL.gray, 1.3);
        line3(scale(cr, R), scale(cr, 3.2), "#bbb", 1, [4, 4]);
      }
      // camera axes
      line3(O, [0.3, 0, 0], COL.x, 2.5); line3(O, [0, 0.3, 0], COL.y, 2.5); line3(O, [0, 0, 0.3], COL.z, 2.5);
      ctx.font = "italic 14px serif";
      var lx = view([0.36, 0, 0]), ly = view([0, 0.36, 0]), lz = view([0, 0, 0.36]);
      ctx.fillStyle = COL.x; ctx.fillText("x", lx[0] - 3, lx[1] + 4);
      ctx.fillStyle = COL.y; ctx.fillText("y", ly[0] - 3, ly[1] + 4);
      ctx.fillStyle = COL.z; ctx.fillText("z", lz[0] - 3, lz[1] + 4);
      ctx.restore();
      return ok ? rays : null;
    }

    function drawImage() {
      var r = L.im, s = Math.min(r.w / (W + 40), r.h / (H + 40));
      var ox = r.x + (r.w - W * s) / 2, oy = r.y + (r.h - H * s) / 2;
      function P(p) { return [ox + p[0] * s, oy + p[1] * s]; }
      ctx.save();
      ctx.fillStyle = "#fff"; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.beginPath(); ctx.rect(ox, oy, W * s, H * s); ctx.clip();
      ctx.fillStyle = "#f0eef5"; ctx.fillRect(ox, oy, W * s, H * s);
      var B = board(), i, j, k, folded = false, N = 6;
      for (i = 0; i < NX; i++) for (j = 0; j < NY; j++) {
        var c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], poly = [], bad = false;
        for (k = 0; k < 4 && !bad; k++) {
          for (var m = 0; m < N; m++) {
            var t = m / N, a = c[k], b = c[(k + 1) % 4];
            var n = distortN(B(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
            if (!n) { bad = true; break; }
            poly.push(P(toPix(n)));
          }
        }
        if (bad) { folded = true; continue; }
        ctx.fillStyle = (i + j) % 2 ? "#2a2a2a" : "#fafafa";
        ctx.beginPath();
        for (k = 0; k < poly.length; k++) { if (k) ctx.lineTo(poly[k][0], poly[k][1]); else ctx.moveTo(poly[k][0], poly[k][1]); }
        ctx.closePath(); ctx.fill();
      }
      if (S.ideal) {  // the board outline without distortion (pinhole with the same K)
        ctx.strokeStyle = COL.b; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
        var outl = [[0, 0], [NX, 0], [NX, NY], [0, NY]], first = true;
        for (k = 0; k < 4; k++) for (var e = 0; e <= 10; e++) {
          var a2 = outl[k], b2 = outl[(k + 1) % 4], X = B(a2[0] + (b2[0] - a2[0]) * e / 10, a2[1] + (b2[1] - a2[1]) * e / 10);
          if (X[2] < 1e-3) { first = true; continue; }
          var Q = P([S.fx * X[0] / X[2] + S.cx, S.fy * X[1] / X[2] + S.cy]);
          if (first) { ctx.moveTo(Q[0], Q[1]); first = false; } else ctx.lineTo(Q[0], Q[1]);
        }
        ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();
      ctx.strokeStyle = COL.a; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, W * s, H * s);
      var pp = P([S.cx, S.cy]);
      ctx.strokeStyle = COL.x; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pp[0] - 7, pp[1]); ctx.lineTo(pp[0] + 7, pp[1]); ctx.moveTo(pp[0], pp[1] - 7); ctx.lineTo(pp[0], pp[1] + 7); ctx.stroke();
      ctx.fillStyle = "#555"; ctx.font = "11px sans-serif";
      ctx.fillText("640 \u00d7 480", ox + 4, oy + H * s - 5);
      return folded;
    }

    // full field of view between two border rays on opposite sides of the optical axis: the sum of
    // their angles to the axis (an acos of their dot product would wrap around above 180 degrees)
    function angle(a, b) {
      if (!a || !b) return null;
      function off(d) { return Math.atan2(Math.sqrt(d[0] * d[0] + d[1] * d[1]), d[2]); }
      return (off(a) + off(b)) * 180 / Math.PI;
    }

    function draw() {
      if (!L.w) return;
      ctx.clearRect(0, 0, L.w, L.h);
      draw3d();
      var folded = drawImage();
      var h = angle(unproject(0, S.cy), unproject(W, S.cy)), v = angle(unproject(S.cx, 0), unproject(S.cx, H));
      var model = S.model === "bc"
        ? "x_d = x(1 + k1 r^2 + k2 r^4) + tangential(p1, p2),  r^2 = x^2 + y^2,  x = X/Z"
        : "theta_d = theta(1 + k1 theta^2 + k2 theta^4),  theta = atan2(sqrt(X^2+Y^2), Z)";
      readout.textContent =
        "K = [[" + S.fx.toFixed(0) + ", 0, " + S.cx.toFixed(0) + "], [0, " + S.fy.toFixed(0) + ", " + S.cy.toFixed(0) + "], [0, 0, 1]]\n" +
        model + "\n" +
        T.hfov + " = " + (h === null ? "\u2014" : h.toFixed(1) + "\u00b0") + ",  " +
        T.vfov + " = " + (v === null ? "\u2014" : v.toFixed(1) + "\u00b0") +
        (folded ? "\n" + T.folds : "");
    }

    var drag = null;
    canvas.addEventListener("pointerdown", function (e) {
      var rc = canvas.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top, r = L.v3;
      if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return;
      drag = { x: e.clientX, y: e.clientY, yaw: S.yaw, pitch: S.pitch };
      canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drag) return;
      S.yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
      S.pitch = Math.max(-1.4, Math.min(1.4, drag.pitch + (e.clientY - drag.y) * 0.01));
      draw();
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
    var els = document.querySelectorAll('[data-widget="3d-vision-camera-model"]');
    for (var i = 0; i < els.length; i++) init(els[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
