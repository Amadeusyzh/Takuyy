/* Widget: neural-rendering-splat
   A 3D Gaussian (quaternion rotation + scales) seen by a pinhole camera, projected with EWA splatting
   exactly as in post 04: Sigma = R S S^T R^T, J = d(phi)/dt at the camera-space mean (with the 1.3x
   frustum clamp), Sigma' = J W Sigma W^T J^T (+ 0.3 I). Camera: OpenCV convention (x right, y down,
   z forward). World frame of this widget: z up.
   Drag the image to orbit the camera around the Gaussian; drag the 3D view to rotate the observer. */
(function () {
  "use strict";
  var TXT = {
    en: {
      view3d: "3D: Gaussian (1 sigma) and camera", image: "image, 160 x 120 px (16 px tiles)",
      s: "scale", yaw: "yaw", pitch: "pitch", roll: "roll", dist: "camera distance", lp: "low-pass +0.3 I",
      hint: "Drag the image to orbit the camera around the Gaussian; drag the 3D view to turn it.",
      depth: "depth", radius: "3-sigma radius"
    },
    zh: {
      view3d: "3D\uff1a\u9ad8\u65af\uff081 sigma\uff09\u4e0e\u76f8\u673a", image: "\u56fe\u50cf\uff0c160 x 120 \u50cf\u7d20\uff0816 \u50cf\u7d20\u56fe\u5757\uff09",
      s: "\u7f29\u653e", yaw: "\u504f\u822a", pitch: "\u4fef\u4ef0", roll: "\u6eda\u8f6c", dist: "\u76f8\u673a\u8ddd\u79bb", lp: "\u4f4e\u901a +0.3 I",
      hint: "\u62d6\u52a8\u56fe\u50cf\uff0c\u8ba9\u76f8\u673a\u7ed5\u9ad8\u65af\u65cb\u8f6c\uff1b\u62d6\u52a8 3D \u89c6\u56fe\u53ef\u6539\u53d8\u89c2\u5bdf\u89d2\u5ea6\u3002",
      depth: "\u6df1\u5ea6", radius: "3 sigma \u534a\u5f84"
    },
    ja: {
      view3d: "3D\uff1a\u30ac\u30a6\u30b7\u30a2\u30f3\uff081 sigma\uff09\u3068\u30ab\u30e1\u30e9", image: "\u753b\u50cf\u3001160 x 120 \u30d4\u30af\u30bb\u30eb\uff0816 \u30d4\u30af\u30bb\u30eb\u306e\u30bf\u30a4\u30eb\uff09",
      s: "\u30b9\u30b1\u30fc\u30eb", yaw: "\u30e8\u30fc", pitch: "\u30d4\u30c3\u30c1", roll: "\u30ed\u30fc\u30eb", dist: "\u30ab\u30e1\u30e9\u8ddd\u96e2", lp: "\u30ed\u30fc\u30d1\u30b9 +0.3 I",
      hint: "\u753b\u50cf\u3092\u30c9\u30e9\u30c3\u30b0\u3059\u308b\u3068\u30ab\u30e1\u30e9\u304c\u30ac\u30a6\u30b7\u30a2\u30f3\u306e\u5468\u308a\u3092\u56de\u308a\u307e\u3059\u30023D \u30d3\u30e5\u30fc\u3092\u30c9\u30e9\u30c3\u30b0\u3059\u308b\u3068\u8996\u70b9\u304c\u56de\u8ee2\u3057\u307e\u3059\u3002",
      depth: "\u5965\u884c\u304d", radius: "3 sigma \u534a\u5f84"
    }
  };
  var IW = 160, IH = 120, FX = 110, FY = 110, CX = IW / 2, CY = IH / 2, OPACITY = 0.9;
  var MU = [0.45, 0.25, 0.15];

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)); return [a[0] / l, a[1] / l, a[2] / l]; }
  function matvec(M, v) { return [dot(M[0], v), dot(M[1], v), dot(M[2], v)]; }
  function qmul(a, b) {
    return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
            a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
            a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
            a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
  }
  function qaxis(ax, deg) {
    var h = deg * Math.PI / 360, s = Math.sin(h);
    return [Math.cos(h), ax[0] * s, ax[1] * s, ax[2] * s];
  }
  // quat_to_rotmat from the post (q = (w, x, y, z), normalized first)
  function quatToRot(q) {
    var n = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    var w = q[0] / n, x = q[1] / n, y = q[2] / n, z = q[3] / n;
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
            [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
            [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]];
  }

  function compute(st) {
    var q = qmul(qmul(qaxis([0, 0, 1], st.yaw), qaxis([0, 1, 0], st.pitch)), qaxis([1, 0, 0], st.roll));
    var R = quatToRot(q);
    var M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], i, j, k;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) M[i][j] = R[i][j] * st.s[j];       // M = R S
    var Sig = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) for (k = 0; k < 3; k++) Sig[i][j] += M[i][k] * M[j][k];
    // camera on a sphere around the origin, looking at the origin (OpenCV axes)
    var ce = Math.cos(st.el), C = [st.dist * ce * Math.cos(st.az), st.dist * ce * Math.sin(st.az), st.dist * Math.sin(st.el)];
    var zc = norm(sub([0, 0, 0], C));
    var up = [0, 0, 1];
    var xc = cross(zc, up);
    if (dot(xc, xc) < 1e-9) xc = [1, 0, 0];
    xc = norm(xc);
    var yc = cross(zc, xc);                                    // points "down" in the image
    var Rcw = [xc, yc, zc];
    var t = matvec(Rcw, sub(MU, C));                           // t = Rcw mu + tcw, tcw = -Rcw C
    var res = { q: q, R: R, M: M, Sig: Sig, C: C, Rcw: Rcw, t: t, visible: t[2] > 0.2 };
    if (!res.visible) return res;
    var limx = 1.3 * (IW / 2) / FX, limy = 1.3 * (IH / 2) / FY;
    var tz = t[2];
    var tx = Math.min(limx, Math.max(-limx, t[0] / tz)) * tz;
    var ty = Math.min(limy, Math.max(-limy, t[1] / tz)) * tz;
    var J = [[FX / tz, 0, -FX * tx / (tz * tz)], [0, FY / tz, -FY * ty / (tz * tz)]];
    var T = [[0, 0, 0], [0, 0, 0]];                            // T = J W
    for (i = 0; i < 2; i++) for (j = 0; j < 3; j++) for (k = 0; k < 3; k++) T[i][j] += J[i][k] * Rcw[k][j];
    var TS = [[0, 0, 0], [0, 0, 0]];
    for (i = 0; i < 2; i++) for (j = 0; j < 3; j++) for (k = 0; k < 3; k++) TS[i][j] += T[i][k] * Sig[k][j];
    var cov = [[0, 0], [0, 0]];
    for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) for (k = 0; k < 3; k++) cov[i][j] += TS[i][k] * T[j][k];
    if (st.lp) { cov[0][0] += 0.3; cov[1][1] += 0.3; }
    res.J = J; res.cov = cov;
    res.mean2d = [FX * t[0] / tz + CX, FY * t[1] / tz + CY];
    var a = cov[0][0], b = cov[0][1], c = cov[1][1], det = a * c - b * b;
    res.conic = [c / det, -b / det, a / det];
    var mid = 0.5 * (a + c);
    res.lmax = mid + Math.sqrt(Math.max(0.1, mid * mid - det));
    res.lmin = Math.max(1e-9, mid - Math.sqrt(Math.max(0, mid * mid - det)));
    res.radius = Math.ceil(3 * Math.sqrt(res.lmax));
    res.angle = 0.5 * Math.atan2(2 * b, a - c);                // major axis angle
    return res;
  }

  function init(el) {
    var lang = TXT[el.dataset.lang] ? el.dataset.lang : "en", L = TXT[lang];
    el.innerHTML = "";
    el.style.position = "relative";
    var st = { s: [0.55, 0.22, 0.08], yaw: 35, pitch: -20, roll: 25, dist: 3.2, az: -1.9, el: 0.35, lp: true,
               oaz: -0.75, oel: 0.45 };
    var canvas = document.createElement("canvas");
    canvas.style.display = "block"; canvas.style.width = "100%"; canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";
    el.appendChild(canvas);
    var ro = document.createElement("div");
    ro.style.cssText = "font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#222;padding:4px 10px;white-space:pre-wrap;background:#fafafa;";
    el.appendChild(ro);
    var ctl = document.createElement("div");
    ctl.style.cssText = "display:flex;flex-wrap:wrap;gap:4px 14px;padding:6px 10px 8px;font:13px/1.3 system-ui,sans-serif;color:#222;background:#fafafa;";
    el.appendChild(ctl);
    function slider(label, min, max, step, get, set) {
      var w = document.createElement("label");
      w.style.cssText = "display:flex;align-items:center;gap:6px;flex:1 1 150px;min-width:140px;";
      var sp = document.createElement("span"); sp.style.minWidth = "88px";
      var inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = get();
      inp.style.flex = "1"; inp.style.minWidth = "60px";
      function upd() { sp.textContent = label + " " + (+get()).toFixed(step < 1 ? 2 : 0); }
      inp.addEventListener("input", function () { set(+inp.value); upd(); draw(); });
      upd(); w.appendChild(sp); w.appendChild(inp); ctl.appendChild(w);
    }
    slider(L.s + " s1", 0.03, 1.0, 0.01, function () { return st.s[0]; }, function (v) { st.s[0] = v; });
    slider(L.s + " s2", 0.03, 1.0, 0.01, function () { return st.s[1]; }, function (v) { st.s[1] = v; });
    slider(L.s + " s3", 0.03, 1.0, 0.01, function () { return st.s[2]; }, function (v) { st.s[2] = v; });
    slider(L.yaw, -180, 180, 1, function () { return st.yaw; }, function (v) { st.yaw = v; });
    slider(L.pitch, -90, 90, 1, function () { return st.pitch; }, function (v) { st.pitch = v; });
    slider(L.roll, -180, 180, 1, function () { return st.roll; }, function (v) { st.roll = v; });
    slider(L.dist, 1.6, 6, 0.05, function () { return st.dist; }, function (v) { st.dist = v; });
    var cbw = document.createElement("label");
    cbw.style.cssText = "display:flex;align-items:center;gap:6px;flex:1 1 150px;";
    var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = st.lp;
    cb.addEventListener("change", function () { st.lp = cb.checked; draw(); });
    cbw.appendChild(cb); cbw.appendChild(document.createTextNode(L.lp)); ctl.appendChild(cbw);
    var hint = document.createElement("div");
    hint.style.cssText = "padding:0 10px 8px;font:12px/1.4 system-ui,sans-serif;color:#555;background:#fafafa;";
    hint.textContent = L.hint; el.appendChild(hint);

    var off = document.createElement("canvas"); off.width = IW; off.height = IH;
    var octx = off.getContext("2d"), img = octx.createImageData(IW, IH);
    var layout = null;

    function resize() {
      var w = Math.max(260, el.clientWidth), dpr = window.devicePixelRatio || 1;
      var wide = w >= 620, h;
      if (wide) {
        var pw = Math.floor(w / 2);
        h = Math.round(Math.min(360, pw * 0.78) + 28);
        layout = { p3: [0, 0, pw, h], pi: [pw, 0, w - pw, h] };
      } else {
        var h3 = Math.round(w * 0.62), hi = Math.round((w - 24) * 0.75) + 36;
        h = h3 + hi;
        layout = { p3: [0, 0, w, h3], pi: [0, h3, w, hi] };
      }
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.height = h + "px";
      layout.dpr = dpr; layout.w = w; layout.h = h;
      draw();
    }

    function draw() {
      if (!layout) return;
      var r = compute(st);
      var ctx = canvas.getContext("2d");
      ctx.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, layout.w, layout.h);
      draw3d(ctx, r, layout.p3);
      drawImage(ctx, r, layout.pi);
      readout(r);
    }

    function draw3d(ctx, r, p) {
      var x0 = p[0], y0 = p[1], w = p[2], h = p[3];
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
      ctx.fillStyle = "#222"; ctx.font = "13px system-ui,sans-serif"; ctx.textAlign = "left";
      ctx.fillText(L.view3d, x0 + 10, y0 + 18);
      var ca = Math.cos(st.oaz), sa = Math.sin(st.oaz), ce = Math.cos(st.oel), se = Math.sin(st.oel);
      var right = [-sa, ca, 0], up = [-se * ca, -se * sa, ce];
      // frame the midpoint between the camera and the Gaussian so that both stay visible and large
      var scale = Math.min(w, h - 28) * 0.47 / (0.5 * st.dist + 0.75);
      var mid = [0.5 * r.C[0], 0.5 * r.C[1], 0.5 * r.C[2]];
      var cx = x0 + w / 2 - scale * dot(mid, right), cy = y0 + 28 + (h - 28) / 2 + scale * dot(mid, up);
      function P(v) { return [cx + scale * dot(v, right), cy - scale * dot(v, up)]; }
      function line(a, b, col, lw, dash) {
        var A = P(a), B = P(b);
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash || []);
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); ctx.setLineDash([]);
      }
      // ground grid (z = 0)
      var g, n = 4;
      for (g = -n; g <= n; g++) {
        line([g * 0.5, -n * 0.5, 0], [g * 0.5, n * 0.5, 0], "#e6e6e6", 1);
        line([-n * 0.5, g * 0.5, 0], [n * 0.5, g * 0.5, 0], "#e6e6e6", 1);
      }
      var axc = ["#d62728", "#2ca02c", "#1f77b4"], axn = ["x", "y", "z"];
      for (g = 0; g < 3; g++) {
        var e = [0, 0, 0]; e[g] = 0.8;
        line([0, 0, 0], e, axc[g], 1.5);
        var E = P([e[0] * 1.12, e[1] * 1.12, e[2] * 1.12]);
        ctx.fillStyle = axc[g]; ctx.fillText(axn[g], E[0] - 3, E[1] + 4);
      }
      // ellipsoid wireframe: mu + M u for |u| = 1
      var M = r.M, i, k;
      function ell(u) { return [MU[0] + dot(M[0], u), MU[1] + dot(M[1], u), MU[2] + dot(M[2], u)]; }
      ctx.strokeStyle = "rgba(148,103,189,0.75)"; ctx.lineWidth = 1;
      var lat, N = 48;
      for (lat = -2; lat <= 2; lat++) {
        var ph = lat * Math.PI / 6;
        ctx.beginPath();
        for (k = 0; k <= N; k++) {
          var th = 2 * Math.PI * k / N, Q = P(ell([Math.cos(ph) * Math.cos(th), Math.cos(ph) * Math.sin(th), Math.sin(ph)]));
          if (k) ctx.lineTo(Q[0], Q[1]); else ctx.moveTo(Q[0], Q[1]);
        }
        ctx.stroke();
      }
      for (i = 0; i < 6; i++) {
        var lo = i * Math.PI / 6;
        ctx.beginPath();
        for (k = 0; k <= N; k++) {
          var tt = 2 * Math.PI * k / N, Q2 = P(ell([Math.cos(tt) * Math.cos(lo), Math.cos(tt) * Math.sin(lo), Math.sin(tt)]));
          if (k) ctx.lineTo(Q2[0], Q2[1]); else ctx.moveTo(Q2[0], Q2[1]);
        }
        ctx.stroke();
      }
      for (g = 0; g < 3; g++) line(MU, [MU[0] + M[0][g], MU[1] + M[1][g], MU[2] + M[2][g]], axc[g], 2.5);
      // camera: centre, frustum to depth 0.6, and the line of sight to the Gaussian mean
      var Cw = r.C, Rc = r.Rcw, d = 0.6;
      function cam(xn, yn) {   // camera-space direction (xn, yn, 1) at depth d, to world
        return [Cw[0] + d * (Rc[0][0] * xn + Rc[1][0] * yn + Rc[2][0]),
                Cw[1] + d * (Rc[0][1] * xn + Rc[1][1] * yn + Rc[2][1]),
                Cw[2] + d * (Rc[0][2] * xn + Rc[1][2] * yn + Rc[2][2])];
      }
      var cs = [cam(-CX / FX, -CY / FY), cam(CX / FX, -CY / FY), cam(CX / FX, CY / FY), cam(-CX / FX, CY / FY)];
      for (k = 0; k < 4; k++) { line(Cw, cs[k], "#444", 1.3); line(cs[k], cs[(k + 1) % 4], "#444", 1.3); }
      line(cs[0], cs[1], "#ff7f0e", 2.5);   // top edge of the image (v = 0)
      line(Cw, MU, "#ff7f0e", 1.2, [4, 4]);
      var Cp = P(Cw);
      ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(Cp[0], Cp[1], 3.5, 0, 2 * Math.PI); ctx.fill();
      ctx.restore();
    }

    function drawImage(ctx, r, p) {
      var x0 = p[0], y0 = p[1], w = p[2], h = p[3];
      ctx.save();
      ctx.fillStyle = "#222"; ctx.font = "13px system-ui,sans-serif"; ctx.textAlign = "left";
      ctx.fillText(L.image, x0 + 12, y0 + 18);
      var sc = Math.min((w - 24) / IW, (h - 36) / IH);
      var ix = x0 + (w - IW * sc) / 2, iy = y0 + 28;
      // rasterize the splat per pixel, alpha = min(0.99, o exp(-1/2 d^T Sigma'^-1 d)), over white
      var data = img.data, xx, yy;
      for (yy = 0; yy < IH; yy++) for (xx = 0; xx < IW; xx++) {
        var a = 0;
        if (r.visible) {
          var dx = xx + 0.5 - r.mean2d[0], dy = yy + 0.5 - r.mean2d[1];
          var pw = -0.5 * (r.conic[0] * dx * dx + r.conic[2] * dy * dy) - r.conic[1] * dx * dy;
          a = Math.min(0.99, OPACITY * Math.exp(Math.min(pw, 0)));
          if (a < 1 / 255) a = 0;
        }
        var o = 4 * (yy * IW + xx);
        data[o] = Math.round(255 * (1 - a) + 148 * a);
        data[o + 1] = Math.round(255 * (1 - a) + 103 * a);
        data[o + 2] = Math.round(255 * (1 - a) + 189 * a);
        data[o + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, ix, iy, IW * sc, IH * sc);
      ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 1;
      for (xx = 16; xx < IW; xx += 16) { ctx.beginPath(); ctx.moveTo(ix + xx * sc, iy); ctx.lineTo(ix + xx * sc, iy + IH * sc); ctx.stroke(); }
      for (yy = 16; yy < IH; yy += 16) { ctx.beginPath(); ctx.moveTo(ix, iy + yy * sc); ctx.lineTo(ix + IW * sc, iy + yy * sc); ctx.stroke(); }
      ctx.strokeStyle = "#444"; ctx.lineWidth = 1.2; ctx.strokeRect(ix, iy, IW * sc, IH * sc);
      ctx.beginPath(); ctx.rect(ix, iy, IW * sc, IH * sc); ctx.clip();
      if (r.visible) {
        var mx = ix + r.mean2d[0] * sc, my = iy + r.mean2d[1] * sc;
        ctx.strokeStyle = "#ff7f0e"; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(mx, my, 3 * Math.sqrt(r.lmax) * sc, 3 * Math.sqrt(r.lmin) * sc, r.angle, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
        ctx.strokeRect(mx - r.radius * sc, my - r.radius * sc, 2 * r.radius * sc, 2 * r.radius * sc);
        ctx.setLineDash([]);
        ctx.fillStyle = "#ff7f0e"; ctx.beginPath(); ctx.arc(mx, my, 3, 0, 2 * Math.PI); ctx.fill();
      }
      ctx.restore();
    }

    function f(v, n) { var s = v.toFixed(n === undefined ? 2 : n); return (v >= 0 ? " " : "") + s; }
    function readout(r) {
      var q = r.q, qn = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
      var s = "q = (" + [q[0], q[1], q[2], q[3]].map(function (v) { return (v / qn).toFixed(2); }).join(", ") + ")   " +
              "s = (" + st.s.map(function (v) { return v.toFixed(2); }).join(", ") + ")\n";
      if (!r.visible) { ro.textContent = s + "t_z <= 0.2"; return; }
      var c = r.cov;
      s += "\u03a3' = [" + f(c[0][0], 1) + " " + f(c[0][1], 1) + " ;" + f(c[1][0], 1) + " " + f(c[1][1], 1) + " ] px\u00b2   " +
           "\u03bc' = (" + r.mean2d[0].toFixed(1) + ", " + r.mean2d[1].toFixed(1) + ")\n" +
           "J = [" + f(r.J[0][0], 1) + " 0 " + f(r.J[0][2], 1) + " ; 0 " + f(r.J[1][1], 1) + " " + f(r.J[1][2], 1) + " ]   " +
           L.depth + " t_z = " + r.t[2].toFixed(2) + "   " + L.radius + " = " + r.radius + " px";
      ro.textContent = s;
    }

    // pointer interaction
    var drag = null;
    canvas.addEventListener("pointerdown", function (ev) {
      var rect = canvas.getBoundingClientRect(), x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      var pi = layout.pi, inImg = x >= pi[0] && x < pi[0] + pi[2] && y >= pi[1] && y < pi[1] + pi[3];
      drag = { x: ev.clientX, y: ev.clientY, cam: inImg };
      canvas.setPointerCapture(ev.pointerId); canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (!drag) return;
      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      drag.x = ev.clientX; drag.y = ev.clientY;
      if (drag.cam) {
        st.az -= dx * 0.01; st.el = Math.max(-1.45, Math.min(1.45, st.el + dy * 0.01));
      } else {
        st.oaz -= dx * 0.01; st.oel = Math.max(-1.45, Math.min(1.45, st.oel + dy * 0.01));
      }
      draw();
    });
    function end() { drag = null; canvas.style.cursor = "grab"; }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    var lastW = -1;
    if (window.ResizeObserver) new ResizeObserver(function () { if (el.clientWidth !== lastW) { lastW = el.clientWidth; resize(); } }).observe(el);
    else window.addEventListener("resize", resize);
    resize();
  }

  function boot() {
    var els = document.querySelectorAll('[data-widget="neural-rendering-splat"]');
    for (var i = 0; i < els.length; i++) if (!els[i].dataset.ready) { els[i].dataset.ready = "1"; init(els[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
