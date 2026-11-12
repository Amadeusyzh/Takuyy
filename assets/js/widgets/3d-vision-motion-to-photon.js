/* Motion-to-photon lab (3d-vision post 10).
 * A head turns (yaw psi) and sways sideways (x) in front of a real box at distance d straight ahead.
 * A virtual box is rendered on top of it. The renderer only knows the head pose from samples that are
 * Delta seconds old (motion-to-photon latency), extrapolated by a predictor:
 *   none:          psi_hat = psi(t - Delta)
 *   velocity:      psi_hat = psi(t - Delta) + omega * Delta
 *   acceleration:  ... + 0.5 * alpha_hat * Delta^2, alpha_hat from the gyro 10 ms apart.
 * Late-stage reprojection re-samples the rotation 5 ms before the photons (translation keeps Delta).
 * The position estimate also carries a slowly wandering drift (its velocity is an Ornstein-Uhlenbeck
 * process with the chosen RMS; map corrections pull the drift back with a 5 s time constant) and pose
 * jitter. Registration error = rendered minus true angular position of the box edge, as seen by
 * the eye, in arcminutes; display pixels = error * pixels-per-degree / 60.
 * The simulation runs at 1 kHz; all angles in degrees inside, arcmin in the readout.
 */
(function () {
  "use strict";

  var TEXT = {
    en: {
      lat: "latency \u0394", pred: "prediction", none: "none", vel: "constant velocity", acc: "constant acceleration",
      warp: "late warp (5 ms)", drift: "drift", dist: "distance d", noise: "jitter", ppd: "display",
      motion: "head motion", auto: "auto", drag: "drag", still: "still", reloc: "relocalize", pause: "pause", play: "play",
      real: "real box", virt: "virtual box", zoom: "zoom on the left edge", px: "display pixels", px1: "display pixel",
      rot: "rotation part", trans: "translation part", total: "total", now: "now", rms: "RMS (4 s)",
      atobj: "at the object", hint: "Drag in the view to turn your head (drag mode), or let the auto mode turn it. " +
        "The zoom shows the display pixel grid around the box edge.",
      t: "time (s)", err: "|error| (\u2032)", rate: "head rate", pxu: "px"
    },
    zh: {
      lat: "\u5ef6\u8fdf \u0394", pred: "\u9884\u6d4b", none: "\u65e0", vel: "\u6052\u901f\u5ea6", acc: "\u6052\u52a0\u901f\u5ea6",
      warp: "\u540e\u671f\u91cd\u6295\u5f71\uff085 ms\uff09", drift: "\u6f02\u79fb", dist: "\u8ddd\u79bb d", noise: "\u6296\u52a8", ppd: "\u663e\u793a",
      motion: "\u5934\u90e8\u8fd0\u52a8", auto: "\u81ea\u52a8", drag: "\u62d6\u52a8", still: "\u9759\u6b62", reloc: "\u91cd\u5b9a\u4f4d", pause: "\u6682\u505c", play: "\u7ee7\u7eed",
      real: "\u771f\u5b9e\u76d2\u5b50", virt: "\u865a\u62df\u76d2\u5b50", zoom: "\u5de6\u8fb9\u7f18\u653e\u5927", px: "\u663e\u793a\u50cf\u7d20", px1: "\u663e\u793a\u50cf\u7d20",
      rot: "\u65cb\u8f6c\u90e8\u5206", trans: "\u5e73\u79fb\u90e8\u5206", total: "\u603b\u8ba1", now: "\u5f53\u524d", rms: "RMS\uff084 \u79d2\uff09",
      atobj: "\u7269\u4f53\u5904", hint: "\u5728\u89c6\u56fe\u4e2d\u62d6\u52a8\u6765\u8f6c\u5934\uff08\u62d6\u52a8\u6a21\u5f0f\uff09\uff0c\u6216\u8ba9\u81ea\u52a8\u6a21\u5f0f\u8f6c\u5934\u3002\u653e\u5927\u56fe\u663e\u793a\u76d2\u5b50\u8fb9\u7f18\u9644\u8fd1\u7684\u663e\u793a\u50cf\u7d20\u7f51\u683c\u3002",
      t: "\u65f6\u95f4\uff08\u79d2\uff09", err: "|\u8bef\u5dee|\uff08\u2032\uff09", rate: "\u5934\u90e8\u89d2\u901f\u5ea6", pxu: "\u50cf\u7d20"
    },
    ja: {
      lat: "\u9045\u5ef6 \u0394", pred: "\u4e88\u6e2c", none: "\u306a\u3057", vel: "\u7b49\u901f\u5ea6", acc: "\u7b49\u52a0\u901f\u5ea6",
      warp: "\u5f8c\u6bb5\u30ea\u30d7\u30ed\u30b8\u30a7\u30af\u30b7\u30e7\u30f3\uff085 ms\uff09", drift: "\u30c9\u30ea\u30d5\u30c8", dist: "\u8ddd\u96e2 d", noise: "\u30b8\u30c3\u30bf", ppd: "\u30c7\u30a3\u30b9\u30d7\u30ec\u30a4",
      motion: "\u982d\u306e\u52d5\u304d", auto: "\u81ea\u52d5", drag: "\u30c9\u30e9\u30c3\u30b0", still: "\u9759\u6b62", reloc: "\u518d\u30ed\u30fc\u30ab\u30e9\u30a4\u30ba", pause: "\u4e00\u6642\u505c\u6b62", play: "\u518d\u751f",
      real: "\u5b9f\u7269\u306e\u7bb1", virt: "\u4eee\u60f3\u306e\u7bb1", zoom: "\u5de6\u7aef\u306e\u62e1\u5927", px: "\u30c7\u30a3\u30b9\u30d7\u30ec\u30a4\u753b\u7d20", px1: "\u30c7\u30a3\u30b9\u30d7\u30ec\u30a4\u753b\u7d20",
      rot: "\u56de\u8ee2\u6210\u5206", trans: "\u4e26\u9032\u6210\u5206", total: "\u5408\u8a08", now: "\u73fe\u5728", rms: "RMS\uff084 \u79d2\uff09",
      atobj: "\u7269\u4f53\u4e0a", hint: "\u30d3\u30e5\u30fc\u3092\u30c9\u30e9\u30c3\u30b0\u3059\u308b\u3068\u982d\u304c\u56de\u308a\u307e\u3059\uff08\u30c9\u30e9\u30c3\u30b0\u30e2\u30fc\u30c9\uff09\u3002\u81ea\u52d5\u30e2\u30fc\u30c9\u3067\u306f\u81ea\u52d5\u3067\u56de\u308a\u307e\u3059\u3002\u62e1\u5927\u56f3\u306f\u7bb1\u306e\u7aef\u4ed8\u8fd1\u306e\u30c7\u30a3\u30b9\u30d7\u30ec\u30a4\u753b\u7d20\u683c\u5b50\u3067\u3059\u3002",
      t: "\u6642\u9593\uff08\u79d2\uff09", err: "|\u8aa4\u5dee|\uff08\u2032\uff09", rate: "\u982d\u306e\u89d2\u901f\u5ea6", pxu: "\u753b\u7d20"
    }
  };

  var COL = { real: "#555", virt: "#9467bd", rot: "#ff7f0e", trans: "#17becf", total: "#222", grid: "#e4e4ea",
    bg: "#fbfbfd" };
  var DT = 0.001, HIST = 400, FOV = 90, BOX_W = 0.30, WARP = 0.005, H_ACC = 0.010;

  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function setup(root) {
    var T = TEXT[root.dataset.lang] || TEXT.en;
    root.innerHTML = "";
    root.style.background = COL.bg;
    root.style.color = "#222";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.fontSize = "14px";

    var S = { lat: 25, pred: "vel", warp: false, drift: 0.5, dist: 1.0, noise: 0.5, ppd: 25, motion: "auto" };

    // ---------- controls ----------
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 10px 4px";
    root.appendChild(bar);
    function slider(txt, min, max, step, val, fmt, cb) {
      var l = document.createElement("label");
      l.style.cssText = "display:flex;align-items:center;gap:5px;white-space:nowrap";
      var sp = document.createElement("span");
      var inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
      inp.style.width = "96px";
      function show() { sp.textContent = txt + " " + fmt(+inp.value); }
      inp.addEventListener("input", function () { show(); cb(+inp.value); });
      show();
      l.appendChild(sp); l.appendChild(inp); bar.appendChild(l);
      return inp;
    }
    function select(txt, opts, val, cb) {
      var l = document.createElement("label");
      l.style.cssText = "display:flex;align-items:center;gap:5px;white-space:nowrap";
      l.appendChild(document.createTextNode(txt));
      var s = document.createElement("select");
      s.style.cssText = "font:inherit;padding:2px 4px;border:1px solid #bbb;border-radius:5px;background:#fff;color:#222";
      opts.forEach(function (o) {
        var e = document.createElement("option"); e.value = o[0]; e.textContent = o[1]; s.appendChild(e);
      });
      s.value = val;
      s.addEventListener("change", function () { cb(s.value); });
      l.appendChild(s); bar.appendChild(l);
      return s;
    }
    function btn(txt, cb) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = txt;
      b.style.cssText = "font:inherit;padding:3px 9px;border:1px solid #bbb;border-radius:5px;background:#fff;color:#222;cursor:pointer;touch-action:manipulation";
      b.addEventListener("click", cb);
      bar.appendChild(b);
      return b;
    }
    slider(T.lat, 0, 100, 1, S.lat, function (v) { return v + " ms"; }, function (v) { S.lat = v; });
    select(T.pred, [["none", T.none], ["vel", T.vel], ["acc", T.acc]], S.pred, function (v) { S.pred = v; });
    var wl = document.createElement("label");
    wl.style.cssText = "display:flex;align-items:center;gap:4px;white-space:nowrap";
    var wc = document.createElement("input"); wc.type = "checkbox";
    wc.addEventListener("change", function () { S.warp = wc.checked; });
    wl.appendChild(wc); wl.appendChild(document.createTextNode(T.warp)); bar.appendChild(wl);
    slider(T.drift, 0, 20, 0.5, S.drift, function (v) { return v.toFixed(1) + " mm/s"; }, function (v) { S.drift = v; });
    slider(T.dist, 0.3, 5, 0.1, S.dist, function (v) { return v.toFixed(1) + " m"; }, function (v) { S.dist = v; });
    slider(T.noise, 0, 5, 0.1, S.noise, function (v) { return v.toFixed(1) + "\u2032"; }, function (v) { S.noise = v; });
    slider(T.ppd, 10, 60, 1, S.ppd, function (v) { return v + " px/\u00b0"; }, function (v) { S.ppd = v; });
    select(T.motion, [["auto", T.auto], ["drag", T.drag], ["still", T.still]], S.motion, function (v) {
      S.motion = v; target = st.psi; tv = 0;
    });
    btn(T.reloc, function () { st.drift = 0; st.dv = 0; });
    var pauseBtn = btn(T.pause, function () {
      paused = !paused; pauseBtn.textContent = paused ? T.play : T.pause; lastTs = 0;
    });

    // ---------- canvases ----------
    var row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;padding:4px 10px 6px;align-items:flex-start";
    root.appendChild(row);
    function canvas(cursor, touch) {
      var c = document.createElement("canvas");
      c.style.cssText = "display:block;border-radius:6px;background:#fff;box-shadow:0 0 0 1px #ddd;touch-action:" + touch +
        (cursor ? ";cursor:" + cursor : "");
      return c;
    }
    // the view takes horizontal drags (head turns) but lets vertical swipes scroll the page;
    // the zoom and plot canvases are display only
    var cv = canvas("ew-resize", "pan-y"), side = document.createElement("div");
    side.style.cssText = "flex:1 1 240px;min-width:0;display:flex;flex-direction:column;gap:8px";
    row.appendChild(cv); row.appendChild(side);
    var zc = canvas(null, "auto"), pc = canvas(null, "auto");
    side.appendChild(zc); side.appendChild(pc);
    var info = document.createElement("div");
    info.style.cssText = "padding:2px 12px 10px;line-height:1.55;font-variant-numeric:tabular-nums";
    root.appendChild(info);
    var ctx = cv.getContext("2d"), zctx = zc.getContext("2d"), pctx = pc.getContext("2d");
    var VW = 400, VH = 260, ZW = 240, ZH = 150, PW = 240, PH = 120, lastW = -1;
    function size(c, g, w, h) {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.style.width = w + "px"; c.style.height = h + "px";
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function resize() {
      var w = Math.max(260, root.clientWidth - 20);
      if (w === lastW) return;
      lastW = w;
      var wide = w >= 680;
      VW = wide ? Math.round(w * 0.58) : w;
      VH = Math.round(VW * (wide ? 0.62 : 0.6));
      ZW = PW = wide ? w - VW - 8 : w;
      ZH = wide ? Math.round((VH - 8) * 0.55) : 150;
      PH = wide ? VH - 8 - ZH : 130;
      size(cv, ctx, VW, VH); size(zc, zctx, ZW, ZH); size(pc, pctx, PW, PH);
      if (lastR) { drawView(lastR); drawZoom(lastR); drawPlot(); }   // resizing clears the canvases
    }

    // ---------- simulation ----------
    var N = HIST;
    var buf = { psi: new Float64Array(N), om: new Float64Array(N), x: new Float64Array(N), v: new Float64Array(N),
      drift: new Float64Array(N) };
    var head = 0, simT = 0;
    var st = { psi: 0, om: 0, x: 0, v: 0, drift: 0, dv: 0 };
    var target = 0, tv = 0;
    var turn = { from: 0, to: 0, t0: 0, T: 0.5, until: 0.8 };
    var paused = false, visible = true, lastTs = 0;
    var hist = [], lastR = null;

    function minJerk(s) { return 10 * s * s * s - 15 * s * s * s * s + 6 * s * s * s * s * s; }
    function minJerkD(s) { return 30 * s * s - 60 * s * s * s + 30 * s * s * s * s; }

    function stepTruth() {
      simT += DT;
      if (S.motion === "auto") {
        if (simT > turn.until) {
          var to = (Math.random() * 2 - 1) * 40;
          var amp = Math.abs(to - turn.to);
          turn = { from: turn.to, to: to, t0: simT, T: Math.max(0.3, amp / 110), until: 0 };
          turn.until = simT + turn.T + 0.25 + Math.random() * 0.9;
        }
        var s = Math.min(1, Math.max(0, (simT - turn.t0) / turn.T));
        st.psi = turn.from + (turn.to - turn.from) * minJerk(s);
        st.om = (turn.to - turn.from) / turn.T * (s < 1 ? minJerkD(s) : 0);
        var w = 2 * Math.PI * 0.35;
        st.x = 0.03 * Math.sin(w * simT);
        st.v = 0.03 * w * Math.cos(w * simT);
      } else {
        if (S.motion === "still") target = st.psi;
        // critically damped spring towards the dragged target (natural frequency 14 rad/s)
        var wn = 14, acc = wn * wn * (target - st.psi) - 2 * wn * st.om;
        st.om += acc * DT;
        st.psi += st.om * DT;
        st.v = 0; st.x += (0 - st.x) * 0.01;
        turn.to = st.psi; turn.until = simT;
      }
      // drift: the drift velocity wanders (Ornstein-Uhlenbeck, RMS = S.drift mm/s, time constant 2 s);
      // map corrections pull the accumulated position drift back with a time constant of 5 s
      var tau = 2.0, sig = S.drift * 1e-3;
      st.dv += -st.dv / tau * DT + sig * Math.sqrt(2 * DT / tau) * gauss();
      st.drift += (st.dv - st.drift / 5.0) * DT;
      head = (head + 1) % N;
      buf.psi[head] = st.psi; buf.om[head] = st.om; buf.x[head] = st.x; buf.v[head] = st.v;
      buf.drift[head] = st.drift;
    }
    function past(arr, sec) {
      var k = Math.min(N - 1, Math.round(sec / DT));
      return arr[(head - k + N) % N];
    }
    function predictYaw(lag) {
      var psi = past(buf.psi, lag), om = past(buf.om, lag) + 0.2 * gauss();   // gyro noise 0.2 deg/s
      if (S.pred === "none") return psi;
      var p = psi + om * lag;
      if (S.pred === "acc") {
        var om0 = past(buf.om, lag + H_ACC) + 0.2 * gauss();
        p += 0.5 * (om - om0) / H_ACC * lag * lag;
      }
      return p;
    }
    function predictX(lag) {
      var x = past(buf.x, lag) + past(buf.drift, lag), v = past(buf.v, lag);
      if (S.pred === "none") return x;
      return x + v * lag;    // VIO velocity; no acceleration term for the position
    }
    // angular position (deg) of the box's left edge relative to the gaze direction
    function edgeAngle(psi, x) {
      var d = S.dist;
      return Math.atan2(-BOX_W / 2 - x, d) * 180 / Math.PI - psi;
    }
    function evaluate() {
      var lag = S.lat / 1000, lagR = S.warp ? Math.min(lag, WARP) : lag;
      var psiHat = predictYaw(lagR) + S.noise / 60 * gauss();
      var xHat = predictX(lag);
      var a0 = edgeAngle(st.psi, st.x);
      var eRot = -(psiHat - st.psi) * 60;                         // arcmin, rotation part
      var eAll = (edgeAngle(psiHat, xHat) - a0) * 60;
      var eTr = eAll - eRot;                                      // jitter is inside psiHat
      return { e: eAll, rot: eRot, tr: eTr, a0: a0, psiHat: psiHat, xHat: xHat };
    }

    // ---------- drawing ----------
    function viewX(angDeg) { return VW / 2 + angDeg / (FOV / 2) * (VW / 2); }
    function drawView(r) {
      ctx.fillStyle = "#f4f6fb"; ctx.fillRect(0, 0, VW, VH);
      var hy = VH * 0.42;
      var g = ctx.createLinearGradient(0, hy, 0, VH);
      g.addColorStop(0, "#e9e4da"); g.addColorStop(1, "#d6cfc1");
      ctx.fillStyle = g; ctx.fillRect(0, hy, VW, VH - hy);
      ctx.strokeStyle = "#c9c2b4"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(VW, hy); ctx.stroke();
      var k = VW / 2 / Math.tan(FOV / 2 * Math.PI / 180);       // pinhole focal length in canvas px
      // world poles every 20 deg on a 3 m circle (real scenery)
      for (var a = -180; a < 180; a += 20) {
        var px = 3 * Math.sin(a * Math.PI / 180) - st.x, pz = 3 * Math.cos(a * Math.PI / 180);
        var ang = Math.atan2(px, pz) * 180 / Math.PI - st.psi;
        while (ang > 180) ang -= 360;
        while (ang < -180) ang += 360;
        if (Math.abs(ang) > FOV / 2 + 5) continue;
        var sx = VW / 2 + k * Math.tan(ang * Math.PI / 180);
        var h = k * 1.2 / Math.hypot(px, pz);
        ctx.fillStyle = "#b9b1a3"; ctx.fillRect(sx - 2, hy - h * 0.6, 4, h);
      }
      // the real box and the virtual box (pinhole drawing; both 0.3 m wide and 0.3 m tall at eye height - 0.3 m)
      function boxScreen(psi, x, col, fill, lw) {
        var d = S.dist;
        var aL = Math.atan2(-BOX_W / 2 - x, d) * 180 / Math.PI - psi;
        var aR = Math.atan2(BOX_W / 2 - x, d) * 180 / Math.PI - psi;
        if (Math.abs(aL) > 85 || Math.abs(aR) > 85) return;
        var xL = VW / 2 + k * Math.tan(aL * Math.PI / 180), xR = VW / 2 + k * Math.tan(aR * Math.PI / 180);
        var yT = hy + k * 0.15 / d, yB = hy + k * 0.45 / d;
        if (fill) { ctx.fillStyle = fill; ctx.fillRect(xL, yT, xR - xL, yB - yT); }
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.strokeRect(xL, yT, xR - xL, yB - yT);
      }
      boxScreen(st.psi, st.x, COL.real, "#c8c8cc", 2);
      boxScreen(r.psiHat, r.xHat, COL.virt, "rgba(148,103,189,0.12)", 2.5);
      ctx.font = "12px system-ui, sans-serif"; ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(6, 6, 150, 36);
      ctx.fillStyle = COL.real; ctx.fillRect(12, 12, 14, 9); ctx.fillStyle = "#222"; ctx.fillText(T.real, 32, 10);
      ctx.strokeStyle = COL.virt; ctx.lineWidth = 2; ctx.strokeRect(12, 27, 14, 9);
      ctx.fillStyle = "#222"; ctx.fillText(T.virt, 32, 25);
      // head yaw gauge
      ctx.fillStyle = "#666"; ctx.textAlign = "right";
      ctx.fillText("\u03c8 = " + st.psi.toFixed(1) + "\u00b0   \u03c9 = " + st.om.toFixed(0) + "\u00b0/s", VW - 8, 8);
      ctx.textAlign = "left";
    }
    var zoomRange = 20;
    function drawZoom(r) {
      var need = Math.max(8, Math.abs(r.e) * 1.6);
      zoomRange += (need - zoomRange) * 0.08;
      var half = zoomRange;                                      // arcmin from centre to the side
      var sc = (ZW / 2) / half;                                  // canvas px per arcmin
      zctx.fillStyle = "#fff"; zctx.fillRect(0, 0, ZW, ZH);
      var cell = 60 / S.ppd;                                     // arcmin per display pixel
      if (cell * sc >= 5) {
        zctx.strokeStyle = COL.grid; zctx.lineWidth = 1;
        var x0 = ZW / 2 - Math.ceil(half / cell) * cell * sc;
        for (var x = x0; x <= ZW; x += cell * sc) { zctx.beginPath(); zctx.moveTo(x, 0); zctx.lineTo(x, ZH); zctx.stroke(); }
        for (var y = ZH / 2 % (cell * sc); y <= ZH; y += cell * sc) { zctx.beginPath(); zctx.moveTo(0, y); zctx.lineTo(ZW, y); zctx.stroke(); }
      }
      // real edge at the centre; the box extends to the right
      zctx.fillStyle = "#c8c8cc"; zctx.fillRect(ZW / 2, 18, ZW / 2, ZH - 36);
      zctx.strokeStyle = COL.real; zctx.lineWidth = 3;
      zctx.beginPath(); zctx.moveTo(ZW / 2, 18); zctx.lineTo(ZW / 2, ZH - 18); zctx.stroke();
      var xv = ZW / 2 + r.e * sc;
      zctx.fillStyle = "rgba(148,103,189,0.22)"; zctx.fillRect(xv, 26, ZW, ZH - 52);
      zctx.strokeStyle = COL.virt; zctx.lineWidth = 3;
      zctx.beginPath(); zctx.moveTo(xv, 26); zctx.lineTo(xv, ZH - 26); zctx.stroke();
      zctx.font = "12px system-ui, sans-serif"; zctx.fillStyle = "#333"; zctx.textBaseline = "top";
      zctx.fillText(T.zoom + "  \u00b1" + half.toFixed(0) + "\u2032", 6, 3);
      zctx.textBaseline = "bottom";
      zctx.fillText((cell * sc >= 5 ? "\u25a1 = 1 " + T.px1 + " (" + cell.toFixed(1) + "\u2032)" : ""), 6, ZH - 2);
    }
    function drawPlot() {
      pctx.fillStyle = "#fff"; pctx.fillRect(0, 0, PW, PH);
      var l = 34, rr = 6, tp = 6, b = 18;
      var ymax = 5;
      for (var i = 0; i < hist.length; i++) ymax = Math.max(ymax, Math.abs(hist[i].e), Math.abs(hist[i].rot), Math.abs(hist[i].tr));
      ymax = Math.pow(10, Math.ceil(Math.log10(ymax) * 4) / 4);
      function X(t) { return l + (t - (simT - 4)) / 4 * (PW - l - rr); }
      function Y(v) { return PH - b - Math.min(1, v / ymax) * (PH - tp - b); }
      pctx.strokeStyle = "#999"; pctx.lineWidth = 1;
      pctx.beginPath(); pctx.moveTo(l, tp); pctx.lineTo(l, PH - b); pctx.lineTo(PW - rr, PH - b); pctx.stroke();
      var one = 60 / S.ppd;
      if (one < ymax) {
        pctx.setLineDash([3, 3]); pctx.strokeStyle = "#999";
        pctx.beginPath(); pctx.moveTo(l, Y(one)); pctx.lineTo(PW - rr, Y(one)); pctx.stroke(); pctx.setLineDash([]);
        pctx.fillStyle = "#888"; pctx.font = "10px system-ui, sans-serif"; pctx.textBaseline = "bottom";
        pctx.fillText("1 " + T.pxu, PW - rr - 30, Y(one) - 1);
      }
      [["rot", COL.rot, 1.3], ["tr", COL.trans, 1.3], ["e", COL.total, 2]].forEach(function (s) {
        pctx.strokeStyle = s[1]; pctx.lineWidth = s[2]; pctx.beginPath();
        for (var i = 0; i < hist.length; i++) {
          var px = X(hist[i].t), py = Y(Math.abs(hist[i][s[0]]));
          if (i === 0) pctx.moveTo(px, py); else pctx.lineTo(px, py);
        }
        pctx.stroke();
      });
      pctx.fillStyle = "#555"; pctx.font = "10px system-ui, sans-serif"; pctx.textAlign = "right"; pctx.textBaseline = "middle";
      pctx.fillText(ymax >= 10 ? ymax.toFixed(0) : ymax.toFixed(1), l - 3, tp + 4); pctx.fillText("0", l - 3, PH - b);
      pctx.textAlign = "center"; pctx.textBaseline = "top";
      pctx.fillText(T.t + "  (\u22124 \u2026 0)", (l + PW) / 2, PH - b + 3);
      pctx.save(); pctx.translate(9, (tp + PH - b) / 2); pctx.rotate(-Math.PI / 2); pctx.textBaseline = "middle";
      pctx.fillText(T.err, 0, 0); pctx.restore();
      pctx.textAlign = "left";
    }
    function writeInfo(r) {
      var n = hist.length, s2 = 0;
      for (var i = 0; i < n; i++) s2 += hist[i].e * hist[i].e;
      var rms = n ? Math.sqrt(s2 / n) : 0;
      var mm = Math.abs(r.e) / 60 * Math.PI / 180 * S.dist * 1000;
      var px = Math.abs(r.e) / 60 * S.ppd;
      function sw(c) { return '<span style="display:inline-block;width:10px;height:3px;background:' + c + ';vertical-align:middle;margin-right:4px"></span>'; }
      info.innerHTML =
        "<b>" + T.now + "</b>: " + sw(COL.total) + T.total + " " + Math.abs(r.e).toFixed(1) + "\u2032 = " + px.toFixed(1) + " " + T.px +
        " = " + mm.toFixed(1) + " mm " + T.atobj + " &nbsp; " + sw(COL.rot) + T.rot + " " + Math.abs(r.rot).toFixed(1) +
        "\u2032 &nbsp; " + sw(COL.trans) + T.trans + " " + Math.abs(r.tr).toFixed(1) + "\u2032<br>" +
        "<b>" + T.rms + "</b>: " + rms.toFixed(1) + "\u2032 = " + (rms / 60 * S.ppd).toFixed(1) + " " + T.px +
        " &nbsp; (\u0394 = " + S.lat + " ms" + (S.warp ? ", " + T.rot + " \u0394 = " + Math.min(S.lat, 5) + " ms" : "") + ")<br>" +
        '<span style="color:#777">' + T.hint + "</span>";
    }

    var lastInfo = 0;
    function frame(ts) {
      requestAnimationFrame(frame);
      if (!visible || document.hidden) { lastTs = 0; return; }
      var dtReal = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 1 / 60;
      lastTs = ts;
      if (!paused) {
        var n = Math.round(dtReal / DT);
        for (var i = 0; i < n; i++) stepTruth();
      }
      var r = evaluate();
      lastR = r;
      if (!paused) {
        hist.push({ t: simT, e: r.e, rot: r.rot, tr: r.tr });
        while (hist.length && hist[0].t < simT - 4) hist.shift();
      }
      drawView(r); drawZoom(r); drawPlot();
      if (ts - lastInfo > 150) { writeInfo(r); lastInfo = ts; }
    }

    // ---------- pointer ----------
    var dragX = null, dragT0 = 0;
    cv.addEventListener("pointerdown", function (e) {
      if (S.motion !== "drag") return;
      dragX = e.clientX; dragT0 = target;
      cv.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    cv.addEventListener("pointermove", function (e) {
      if (dragX === null) return;
      target = Math.max(-80, Math.min(80, dragT0 + (e.clientX - dragX) / VW * FOV));
    });
    function end() { dragX = null; }
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible && lastR) { drawView(lastR); drawZoom(lastR); drawPlot(); }
      }).observe(root);
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
    for (var i = 0; i < N; i++) stepTruth();      // fill the history
    lastR = evaluate();
    drawView(lastR); drawZoom(lastR); drawPlot(); writeInfo(lastR);
    requestAnimationFrame(frame);
  }

  function init() {
    document.querySelectorAll('[data-widget="3d-vision-motion-to-photon"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
