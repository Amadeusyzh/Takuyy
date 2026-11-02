/* Linear blend skinning vs dual quaternion skinning (graphics post 09).
 * A two-bone limb (bone 0 fixed, bone 1 rotating about the joint) is skinned with smooth weights
 * w1 = smoothstep(0.65, 1.35, x). Bend mode rotates bone 1 about z through the joint (1, 0, 0);
 * twist mode rotates it about the limb axis x, applied to a flat ribbon drawn in an oblique view.
 *   LBS: p' = w0 p + w1 (R p + t)
 *   DQS: blend unit dual quaternions, normalise by the real part, apply the rigid motion.
 * The readout gives the minimum skin width over the limb relative to the rest width.
 */
(function () {
  "use strict";

  var TEXT = {
    en: { bend: "Bend", twist: "Twist", both: "both", angle: "Angle", width: "min width / rest",
      hint: "Drag on the limb or use the slider." },
    zh: { bend: "弯曲", twist: "扭转", both: "两者", angle: "角度",
      width: "最小宽度 / 静止宽度",
      hint: "在肢体上拖动或使用滑块。" },
    ja: { bend: "曲げ", twist: "ねじり", both: "両方", angle: "角度",
      width: "最小幅 / 静止時の幅",
      hint: "肢をドラッグするかスライダーを使ってください。" },
  };
  var COL = { lbs: "#ff7f0e", dqs: "#9467bd" };
  var NX = 41, NY = 7, HALF = 0.2; // grid along the limb (x in [0, 2]) and across (half width)

  // quaternions as [w, x, y, z]
  function qmul(a, b) {
    return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
  }
  function qconj(q) { return [q[0], -q[1], -q[2], -q[3]]; }
  function qrot(q, v) { var r = qmul(qmul(q, [0, v[0], v[1], v[2]]), qconj(q)); return [r[1], r[2], r[3]]; }
  function smoothstep(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  // bone 1 transform: rotation q about an axis through the pivot j
  function boneTransform(mode, ang) {
    var h = ang / 2, q = mode === 0 ? [Math.cos(h), 0, 0, Math.sin(h)] : [Math.cos(h), Math.sin(h), 0, 0];
    var j = [1, 0, 0], Rj = qrot(q, j);
    var t = [j[0] - Rj[0], j[1] - Rj[1], j[2] - Rj[2]];
    return { q: q, t: t, d: qmul([0, t[0], t[1], t[2]], q).map(function (v) { return 0.5 * v; }) };
  }

  function deform(mode, ang) {
    var B = boneTransform(mode, ang), L = [], D = [];
    for (var i = 0; i < NX; i++) {
      var rowL = [], rowD = [];
      for (var k = 0; k < NY; k++) {
        var x = 2 * i / (NX - 1), s = -HALF + 2 * HALF * k / (NY - 1);
        var p = mode === 0 ? [x, s, 0] : [x, s, 0]; // ribbon lies in the x-y plane in both modes
        var w1 = smoothstep(0.65, 1.35, x), w0 = 1 - w1;
        var Rp = qrot(B.q, p);
        rowL.push([w0 * p[0] + w1 * (Rp[0] + B.t[0]), w0 * p[1] + w1 * (Rp[1] + B.t[1]), w0 * p[2] + w1 * (Rp[2] + B.t[2])]);
        var r = [w0 + w1 * B.q[0], w1 * B.q[1], w1 * B.q[2], w1 * B.q[3]];   // bone 0 = identity
        var d = [w1 * B.d[0], w1 * B.d[1], w1 * B.d[2], w1 * B.d[3]];
        var n = Math.hypot(r[0], r[1], r[2], r[3]);
        r = r.map(function (v) { return v / n; }); d = d.map(function (v) { return v / n; });
        var tt = qmul(d, qconj(r)), rp = qrot(r, p);
        rowD.push([rp[0] + 2 * tt[1], rp[1] + 2 * tt[2], rp[2] + 2 * tt[3]]);
      }
      L.push(rowL); D.push(rowD);
    }
    return { L: L, D: D, B: B };
  }

  function minWidth(G) {
    var m = Infinity;
    for (var i = 0; i < NX; i++) {
      var a = G[i][0], b = G[i][NY - 1];
      m = Math.min(m, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / (2 * HALF));
    }
    return m;
  }

  function btn(txt) {
    var b = document.createElement("button");
    b.type = "button"; b.textContent = txt;
    b.style.cssText = "border:1px solid #9467bd;border-radius:14px;padding:3px 10px;font-size:13px;cursor:pointer";
    return b;
  }

  function setup(root) {
    var T = TEXT[root.dataset.lang] || TEXT.en;
    root.style.background = "#fbfbfd";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.color = "#222";
    root.innerHTML = "";
    var mode = 0, method = 2, angDeg = 120, dragging = false, lastX = 0;

    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px 0;font-size:14px";
    var modeB = [btn(T.bend), btn(T.twist)];
    modeB.forEach(function (b, i) { b.addEventListener("click", function () { mode = i; draw(); }); bar.appendChild(b); });
    var sep = document.createElement("span"); sep.style.width = "10px"; bar.appendChild(sep);
    var methB = [btn("LBS"), btn("DQS"), btn(T.both)];
    methB.forEach(function (b, i) { b.addEventListener("click", function () { method = i; draw(); }); bar.appendChild(b); });
    root.appendChild(bar);

    var bar2 = document.createElement("label");
    bar2.style.cssText = "display:flex;gap:8px;align-items:center;padding:6px 10px 0;font-size:14px";
    var angTxt = document.createElement("span");
    var slider = document.createElement("input");
    slider.type = "range"; slider.min = "0"; slider.max = "180"; slider.step = "1"; slider.value = String(angDeg);
    slider.style.cssText = "flex:1;max-width:320px";
    slider.addEventListener("input", function () { angDeg = +slider.value; draw(); });
    bar2.appendChild(angTxt); bar2.appendChild(slider);
    root.appendChild(bar2);

    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;margin:6px auto 0;touch-action:none;cursor:ew-resize";
    root.appendChild(canvas);
    var info = document.createElement("div");
    info.style.cssText = "padding:4px 10px 10px;font-size:14px;line-height:1.5;font-variant-numeric:tabular-nums";
    root.appendChild(info);
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, S = 100, ox = 0, oy = 0, lastW = -1;

    function resize() {
      var w = Math.max(260, root.clientWidth);
      if (w === lastW) return;
      lastW = w;
      W = w; H = Math.min(330, Math.max(230, Math.round(w * 0.6)));
      var dpr = window.devicePixelRatio || 1;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    // bend: orthographic x-y; twist: oblique view so that z (the twist direction) is visible
    function proj(p) {
      if (mode === 0) return [ox + p[0] * S, oy - p[1] * S];
      return [ox + (p[0] + 0.28 * p[2]) * S, oy - (0.55 * p[1] + 0.8 * p[2]) * S];
    }
    function layout() {
      if (mode === 0) { S = Math.min(W / 2.9, H / 2.75); ox = W / 2 - 1.0 * S; oy = H / 2 + 0.05 * S; }
      else { S = Math.min(W / 2.8, H / 1.4); ox = W / 2 - 1.05 * S; oy = H / 2; }
    }

    function drawSkin(G, color, fill) {
      for (var i = 0; i < NX - 1; i++) {
        for (var k = 0; k < NY - 1; k++) {
          var a = proj(G[i][k]), b = proj(G[i + 1][k]), c = proj(G[i + 1][k + 1]), d = proj(G[i][k + 1]);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
          if (fill) {
            var shade = 0.55;
            if (mode === 1) { // front/back faces of the ribbon from the screen-space orientation
              var cr = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
              shade = cr < 0 ? 0.65 : 0.3;
            }
            ctx.globalAlpha = shade; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
          }
          ctx.strokeStyle = color; ctx.lineWidth = fill ? 0.6 : 1.2; ctx.stroke();
        }
      }
      ctx.lineWidth = 2.4; ctx.strokeStyle = color;
      [0, NY - 1].forEach(function (k) {
        ctx.beginPath();
        for (var i = 0; i < NX; i++) { var z = proj(G[i][k]); if (i) ctx.lineTo(z[0], z[1]); else ctx.moveTo(z[0], z[1]); }
        ctx.stroke();
      });
    }

    function draw() {
      layout();
      modeB.forEach(function (b, i) { b.style.background = i === mode ? "#9467bd" : "#fff"; b.style.color = i === mode ? "#fff" : "#5a3d85"; });
      methB.forEach(function (b, i) {
        var c = i === 0 ? COL.lbs : i === 1 ? COL.dqs : "#555";
        b.style.borderColor = c; b.style.background = i === method ? c : "#fff"; b.style.color = i === method ? "#fff" : c;
      });
      angTxt.textContent = T.angle + " " + angDeg + "°";
      var ang = angDeg * Math.PI / 180, R = deform(mode, ang);
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      // rest outline
      ctx.setLineDash([5, 4]); ctx.strokeStyle = "#bbb"; ctx.lineWidth = 1.2;
      var r0 = [proj([0, -HALF, 0]), proj([2, -HALF, 0]), proj([2, HALF, 0]), proj([0, HALF, 0])];
      ctx.beginPath(); ctx.moveTo(r0[0][0], r0[0][1]); r0.slice(1).forEach(function (p) { ctx.lineTo(p[0], p[1]); }); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      if (method === 0 || method === 2) drawSkin(R.L, COL.lbs, true);
      if (method === 1) drawSkin(R.D, COL.dqs, true);
      if (method === 2) drawSkin(R.D, COL.dqs, false);
      // bones
      var j = proj([1, 0, 0]), b0 = proj([0, 0, 0]);
      var tip3 = qrot(R.B.q, [2, 0, 0]); tip3 = [tip3[0] + R.B.t[0], tip3[1] + R.B.t[1], tip3[2] + R.B.t[2]];
      var tip = proj(tip3);
      ctx.strokeStyle = "#222"; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(j[0], j[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      [b0, j, tip].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 2 * Math.PI); ctx.fillStyle = "#222"; ctx.fill(); });
      var wl = minWidth(R.L), wd = minWidth(R.D);
      info.innerHTML = T.width + ": " +
        '<b style="color:' + COL.lbs + '">LBS ' + wl.toFixed(2) + "</b> &nbsp; " +
        '<b style="color:' + COL.dqs + '">DQS ' + wd.toFixed(2) + "</b>" +
        ' &nbsp; <span style="color:#777">' + T.hint + "</span>";
    }

    function setFromPointer(e) {
      var rc = canvas.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
      if (mode === 0) {
        var j = proj([1, 0, 0]);
        var a = Math.atan2(-(y - j[1]), x - j[0]) * 180 / Math.PI;
        if (a < -90) a += 360;  // keep the angle continuous when folding back past 180
        angDeg = Math.round(Math.min(180, Math.max(0, a)));
      } else {
        angDeg = Math.round(Math.min(180, Math.max(0, angDeg + (x - lastX) * 180 / Math.max(200, W * 0.8))));
        lastX = x;
      }
      slider.value = String(angDeg);
      draw();
    }
    canvas.addEventListener("pointerdown", function (e) {
      dragging = true; lastX = e.clientX - canvas.getBoundingClientRect().left;
      canvas.setPointerCapture(e.pointerId); e.preventDefault();
      if (mode === 0) setFromPointer(e);
    });
    canvas.addEventListener("pointermove", function (e) { if (dragging) setFromPointer(e); });
    canvas.addEventListener("pointerup", function () { dragging = false; });
    canvas.addEventListener("pointercancel", function () { dragging = false; });

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
  }

  function init() {
    document.querySelectorAll('[data-widget="graphics-skinning"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
