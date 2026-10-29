/* Pinhole camera explorer (neural-rendering post 1).
   OpenCV / COLMAP camera frame: x right, y down, z forward (right-handed).
   u = fx * Xc / Zc + cx, v = fy * Yc / Zc + cy with fx = fy = f, (cx, cy) = (320, 240), image 640 x 480.
   Left: 3D view (drag to orbit). Right: the image (drag to move the point at fixed depth). */
(function () {
  "use strict";
  var W = 640, H = 480, CX = 320, CY = 240;
  var TXT = {
    en: {
      f: "focal length f (px)", X: "X_c", Y: "Y_c", Z: "Z_c (depth)",
      hint: "Drag the 3D view to orbit it; drag inside the image to move the point (its depth stays fixed).",
      out: "outside the image", fov: "horizontal field of view", plane: "Z_c = 1"
    },
    zh: {
      f: "\u7126\u8ddd f\uff08\u50cf\u7d20\uff09", X: "X_c", Y: "Y_c", Z: "Z_c\uff08\u6df1\u5ea6\uff09",
      hint: "\u62d6\u52a8\u5de6\u4fa7 3D \u89c6\u56fe\u53ef\u65cb\u8f6c\u89c6\u89d2\uff1b\u5728\u53f3\u4fa7\u56fe\u50cf\u4e2d\u62d6\u52a8\u53ef\u79fb\u52a8\u8be5\u70b9\uff08\u6df1\u5ea6\u4fdd\u6301\u4e0d\u53d8\uff09\u3002",
      out: "\u843d\u5728\u56fe\u50cf\u4e4b\u5916", fov: "\u6c34\u5e73\u89c6\u573a\u89d2", plane: "Z_c = 1"
    },
    ja: {
      f: "\u7126\u70b9\u8ddd\u96e2 f\uff08\u30d4\u30af\u30bb\u30eb\uff09", X: "X_c", Y: "Y_c", Z: "Z_c\uff08\u5965\u884c\u304d\uff09",
      hint: "\u5de6\u306e 3D \u30d3\u30e5\u30fc\u3092\u30c9\u30e9\u30c3\u30b0\u3059\u308b\u3068\u8996\u70b9\u304c\u56de\u8ee2\u3057\u3001\u53f3\u306e\u753b\u50cf\u5185\u3092\u30c9\u30e9\u30c3\u30b0\u3059\u308b\u3068\u70b9\u304c\u52d5\u304d\u307e\u3059\uff08\u5965\u884c\u304d\u306f\u56fa\u5b9a\uff09\u3002",
      out: "\u753b\u50cf\u306e\u5916", fov: "\u6c34\u5e73\u753b\u89d2", plane: "Z_c = 1"
    }
  };
  var COL = { x: "#d62728", y: "#2ca02c", z: "#1f77b4", a: "#9467bd", b: "#ff7f0e", gray: "#7f7f7f",
              dark: "#222222", fill: "rgba(148,103,189,0.13)", bg: "#fbfbfd" };

  function el(tag, css, parent) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (parent) parent.appendChild(e);
    return e;
  }

  function init(root) {
    var lang = TXT[root.dataset.lang] ? root.dataset.lang : "en";
    var T = TXT[lang];
    root.innerHTML = "";
    root.style.background = COL.bg;
    root.style.padding = "8px";
    root.style.boxSizing = "border-box";
    var canvas = el("canvas", "display:block;width:100%;touch-action:none;cursor:grab;", root);
    var panel = el("div", "display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:6px;font-size:14px;color:#222;", root);
    var state = { f: 554.3, X: 0.6, Y: -0.3, Z: 2.5, yaw: -0.75, pitch: 0.32 };
    var inputs = {};

    function slider(key, min, max, step) {
      var wrap = el("label", "display:flex;align-items:center;gap:8px;flex:1 1 300px;min-width:0;", panel);
      var name = el("span", "white-space:nowrap;flex:none;min-width:4em;", wrap);
      name.textContent = T[key];
      var inp = el("input", "flex:1;min-width:80px;", wrap);
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = state[key];
      var val = el("span", "font-family:monospace;flex:none;min-width:3.6em;text-align:right;", wrap);
      inp.addEventListener("input", function () { state[key] = parseFloat(inp.value); draw(); });
      inputs[key] = { inp: inp, val: val };
    }
    slider("f", 200, 1200, 1);
    slider("X", -1.5, 1.5, 0.01);
    slider("Y", -1.2, 1.2, 0.01);
    slider("Z", 0.6, 5, 0.01);
    var readout = el("div", "font-family:monospace;font-size:13px;line-height:1.5;margin-top:6px;color:#222;white-space:pre-wrap;", root);
    var hint = el("div", "font-size:12.5px;color:#666;margin-top:4px;", root);
    hint.textContent = T.hint;

    var ctx = canvas.getContext("2d");
    var layout = {};

    function resize() {
      var w = root.clientWidth - 16;
      if (w < 10) return;
      var wide = w >= 620;
      var h3, him;
      if (wide) {
        layout.v3 = { x: 0, y: 0, w: w * 0.54, h: 330 };
        layout.im = { x: w * 0.56, y: 0, w: w * 0.44, h: 330 };
        h3 = 330;
      } else {
        h3 = Math.round(w * 0.66);
        him = Math.round(w * 0.64);
        layout.v3 = { x: 0, y: 0, w: w, h: h3 };
        layout.im = { x: 0, y: h3 + 6, w: w, h: him };
        h3 = h3 + 6 + him;
      }
      var dpr = window.devicePixelRatio || 1;
      canvas.style.height = h3 + "px";
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h3 * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout.w = w; layout.h = h3;
      draw();
    }

    // ---- 3D view: data (x, y down, z forward) -> plot (x, z, -y) -> orbit -> perspective ----
    function view(p) {
      var px = p[0], py = p[2], pz = -p[1];
      px -= 0.2; py -= 1.6; // look at a point between the camera and the scene
      var cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
      var x1 = cy * px - sy * py, y1 = sy * px + cy * py;
      var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      var y2 = cp * y1 + sp * pz, z2 = -sp * y1 + cp * pz;
      var D = 9, s = D / (D + y2);
      var r = layout.v3, sc = Math.min(r.w, r.h) * 0.27;
      return [r.x + r.w / 2 + x1 * s * sc, r.y + r.h / 2 - z2 * s * sc, y2];
    }
    function seg(a, b, color, lw, dash) {
      var A = view(a), B = view(b);
      ctx.strokeStyle = color; ctx.lineWidth = lw || 1.5; ctx.setLineDash(dash || []);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      ctx.setLineDash([]);
    }
    function arrow3(a, b, color, text) {
      seg(a, b, color, 2.5);
      var A = view(a), B = view(b);
      var ang = Math.atan2(B[1] - A[1], B[0] - A[0]), L = 9;
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(B[0], B[1]);
      ctx.lineTo(B[0] - L * Math.cos(ang - 0.4), B[1] - L * Math.sin(ang - 0.4));
      ctx.lineTo(B[0] - L * Math.cos(ang + 0.4), B[1] - L * Math.sin(ang + 0.4));
      ctx.closePath(); ctx.fill();
      if (text) {
        ctx.font = "italic 15px serif";
        ctx.fillText(text, B[0] + 6 * Math.cos(ang) - 4, B[1] + 6 * Math.sin(ang) + 5);
      }
    }
    function dot(p, color, r) {
      var P = view(p);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(P[0], P[1], r || 5, 0, 2 * Math.PI); ctx.fill();
      return P;
    }

    function draw3d() {
      var r = layout.v3, f = state.f;
      ctx.save();
      ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      ctx.fillStyle = "#ffffff"; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      var O = [0, 0, 0], hw = W / 2 / f, hh = H / 2 / f;
      var cs = [[-hw, -hh, 1], [hw, -hh, 1], [hw, hh, 1], [-hw, hh, 1]];
      var far = 4.5;
      // frustum extended (dashed) and the image plane at Z_c = 1
      for (var i = 0; i < 4; i++) {
        seg(O, [cs[i][0] * far, cs[i][1] * far, far], "#bbb", 1, [4, 4]);
        seg(O, cs[i], COL.gray, 1.2);
      }
      ctx.fillStyle = COL.fill; ctx.beginPath();
      for (i = 0; i < 4; i++) { var Q = view(cs[i]); if (i) ctx.lineTo(Q[0], Q[1]); else ctx.moveTo(Q[0], Q[1]); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = COL.a; ctx.lineWidth = 2; ctx.stroke();
      var lab = view([hw, hh, 1]);
      ctx.fillStyle = COL.a; ctx.font = "13px sans-serif"; ctx.fillText(T.plane, lab[0] + 4, lab[1] + 14);
      // optical axis and camera axes
      seg([0, 0, 0.5], [0, 0, far], COL.z, 1, [6, 4]);
      arrow3(O, [0.5, 0, 0], COL.x, "x");
      arrow3(O, [0, 0.5, 0], COL.y, "y");
      arrow3(O, [0, 0, 0.6], COL.z, "z");
      var Pc = dot(O, "#000", 4);
      ctx.fillStyle = "#000"; ctx.font = "bold 15px serif"; ctx.fillText("C", Pc[0] - 16, Pc[1] - 6);
      // the point, its ray and its projection on Z_c = 1
      var X = [state.X, state.Y, state.Z], xn = [state.X / state.Z, state.Y / state.Z, 1];
      var tEnd = Math.max(1, state.Z);
      seg(O, [xn[0] * tEnd, xn[1] * tEnd, tEnd], COL.b, 2);
      dot([0, 0, 1], COL.dark, 3);
      var inside = Math.abs(xn[0]) <= hw && Math.abs(xn[1]) <= hh;
      dot(xn, inside ? COL.a : "#bbb", 5);
      var PX = dot(X, COL.b, 6);
      ctx.fillStyle = COL.b; ctx.font = "bold 15px serif"; ctx.fillText("X", PX[0] + 8, PX[1] - 6);
      ctx.restore();
    }

    function drawImage() {
      var r = layout.im, f = state.f;
      ctx.save();
      ctx.fillStyle = "#ffffff"; ctx.fillRect(r.x, r.y, r.w, r.h);
      var pad = 26, s = Math.min((r.w - 2 * pad) / W, (r.h - 2 * pad) / H);
      var ox = r.x + (r.w - W * s) / 2, oy = r.y + (r.h - H * s) / 2 + 6;
      layout.img = { ox: ox, oy: oy, s: s };
      ctx.fillStyle = "rgba(148,103,189,0.10)"; ctx.fillRect(ox, oy, W * s, H * s);
      ctx.strokeStyle = COL.a; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, W * s, H * s);
      ctx.fillStyle = "#444"; ctx.font = "12px sans-serif";
      ctx.fillText("(0,0)", ox - 4, oy - 6);
      ctx.fillText("u \u2192", ox + W * s - 26, oy - 6);
      ctx.fillText("v", ox - 14, oy + 14); ctx.fillText("\u2193", ox - 15, oy + 30);
      // principal point
      var pcx = ox + CX * s, pcy = oy + CY * s;
      ctx.strokeStyle = COL.dark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pcx - 7, pcy); ctx.lineTo(pcx + 7, pcy); ctx.moveTo(pcx, pcy - 7); ctx.lineTo(pcx, pcy + 7); ctx.stroke();
      var u = f * state.X / state.Z + CX, v = f * state.Y / state.Z + CY;
      var inside = u >= 0 && u <= W && v >= 0 && v <= H;
      var qx = ox + Math.max(-10, Math.min(W + 10, u)) * s, qy = oy + Math.max(-10, Math.min(H + 10, v)) * s;
      ctx.setLineDash([4, 4]); ctx.strokeStyle = COL.gray; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(pcx, pcy); ctx.lineTo(qx, pcy); ctx.lineTo(qx, qy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = inside ? COL.a : "#bbb";
      ctx.beginPath(); ctx.arc(qx, qy, 6.5, 0, 2 * Math.PI); ctx.fill();
      ctx.font = "13px sans-serif"; ctx.fillStyle = COL.dark;
      var lbl = "(" + u.toFixed(1) + ", " + v.toFixed(1) + ")";
      var tw = ctx.measureText(lbl).width;
      ctx.fillText(lbl, Math.min(qx + 9, ox + W * s - tw), Math.max(qy - 9, oy + 14));
      if (!inside) { ctx.fillStyle = COL.x; ctx.fillText(T.out, ox + 6, oy + H * s - 8); }
      ctx.restore();
      return [u, v];
    }

    function draw() {
      if (!layout.v3) return;
      ctx.clearRect(0, 0, layout.w, layout.h);
      draw3d();
      var uv = drawImage();
      for (var k in inputs) {
        inputs[k].inp.value = state[k];
        inputs[k].val.textContent = k === "f" ? state[k].toFixed(0) : state[k].toFixed(2);
      }
      var x = state.X / state.Z, y = state.Y / state.Z, f = state.f;
      function par(a) { return a < 0 ? "(" + a.toFixed(3) + ")" : a.toFixed(3); }
      var fov = 2 * Math.atan(W / (2 * f)) * 180 / Math.PI;
      readout.textContent =
        "x = X_c/Z_c = " + x.toFixed(3) + ",  y = Y_c/Z_c = " + y.toFixed(3) + "\n" +
        "u = f\u00b7x + c_x = " + f.toFixed(0) + "\u00b7" + par(x) + " + 320 = " + uv[0].toFixed(1) + "\n" +
        "v = f\u00b7y + c_y = " + f.toFixed(0) + "\u00b7" + par(y) + " + 240 = " + uv[1].toFixed(1) + "\n" +
        T.fov + " = 2\u00b7atan(W / 2f) = " + fov.toFixed(1) + "\u00b0";
    }

    // ---- pointer interaction ----
    var drag = null;
    function local(e) {
      var b = canvas.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top];
    }
    function inRect(p, r) { return p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h; }
    function moveImagePoint(p) {
      var g = layout.img;
      var u = Math.max(-40, Math.min(W + 40, (p[0] - g.ox) / g.s));
      var v = Math.max(-40, Math.min(H + 40, (p[1] - g.oy) / g.s));
      state.X = Math.max(-1.5, Math.min(1.5, (u - CX) / state.f * state.Z));
      state.Y = Math.max(-1.2, Math.min(1.2, (v - CY) / state.f * state.Z));
    }
    canvas.addEventListener("pointerdown", function (e) {
      var p = local(e);
      if (inRect(p, layout.im)) { drag = { mode: "img" }; moveImagePoint(p); draw(); }
      else if (inRect(p, layout.v3)) { drag = { mode: "orbit", p: p, yaw: state.yaw, pitch: state.pitch }; }
      if (drag) { canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; e.preventDefault(); }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var p = local(e);
      if (drag.mode === "img") moveImagePoint(p);
      else {
        state.yaw = drag.yaw + (p[0] - drag.p[0]) * 0.01;
        state.pitch = Math.max(-1.4, Math.min(1.4, drag.pitch + (p[1] - drag.p[1]) * 0.01));
      }
      draw();
    });
    function end() { drag = null; canvas.style.cursor = "grab"; }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
  }

  function boot() {
    var els = document.querySelectorAll('[data-widget="neural-rendering-camera"]');
    for (var i = 0; i < els.length; i++) init(els[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
