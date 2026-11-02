/* CCD vs FABRIK on a planar four-bone chain (graphics post 09).
 * The chain always starts from the same rest pose; the slider sets how many iterations are run
 * toward the draggable target, and faint ghosts show the intermediate iterations.
 *   CCD: for j = last..0, rotate joint j so the end effector lies on the ray from joint j to the target.
 *   FABRIK: backward pass from the target, forward pass from the fixed root, on joint positions.
 */
(function () {
  "use strict";

  var TEXT = {
    en: { iters: "Iterations", both: "both", err: "error", hint: "Drag the red target." },
    zh: { iters: "\u8fed\u4ee3\u6b21\u6570", both: "\u4e24\u8005", err: "\u8bef\u5dee", hint: "\u62d6\u52a8\u7ea2\u8272\u76ee\u6807\u3002" },
    ja: { iters: "\u53cd\u5fa9\u56de\u6570", both: "\u4e21\u65b9", err: "\u8aa4\u5dee",
      hint: "\u8d64\u3044\u76ee\u6a19\u3092\u30c9\u30e9\u30c3\u30b0\u3057\u3066\u304f\u3060\u3055\u3044\u3002" },
  };
  var LEN = [1.0, 0.8, 0.6, 0.4];
  var REST = [0.25, -0.3, -0.3, -0.25];
  var COL = { ccd: "#9467bd", fab: "#ff7f0e" };

  function fk(ang) {
    var P = [[0, 0]], a = 0;
    for (var i = 0; i < LEN.length; i++) {
      a += ang[i];
      var q = P[i];
      P.push([q[0] + LEN[i] * Math.cos(a), q[1] + LEN[i] * Math.sin(a)]);
    }
    return P;
  }
  function ccd(target, iters) {
    var ang = REST.slice(), hist = [fk(ang)];
    for (var it = 0; it < iters; it++) {
      for (var j = LEN.length - 1; j >= 0; j--) {
        var P = fk(ang), e = P[P.length - 1];
        var ux = e[0] - P[j][0], uy = e[1] - P[j][1], vx = target[0] - P[j][0], vy = target[1] - P[j][1];
        ang[j] += Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      }
      hist.push(fk(ang));
    }
    return hist;
  }
  function fabrik(target, iters) {
    var P = fk(REST), hist = [P.map(function (p) { return p.slice(); })], n = LEN.length;
    for (var it = 0; it < iters; it++) {
      P[n] = target.slice();
      for (var i = n - 1; i >= 0; i--) {
        var dx = P[i][0] - P[i + 1][0], dy = P[i][1] - P[i + 1][1], d = Math.hypot(dx, dy) || 1e-9;
        P[i] = [P[i + 1][0] + LEN[i] * dx / d, P[i + 1][1] + LEN[i] * dy / d];
      }
      P[0] = [0, 0];
      for (i = 0; i < n; i++) {
        dx = P[i + 1][0] - P[i][0]; dy = P[i + 1][1] - P[i][1]; d = Math.hypot(dx, dy) || 1e-9;
        P[i + 1] = [P[i][0] + LEN[i] * dx / d, P[i][1] + LEN[i] * dy / d];
      }
      hist.push(P.map(function (p) { return p.slice(); }));
    }
    return hist;
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
    var method = 2, iters = 3, target = [0.6, 1.9], dragging = false;

    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 10px 0;font-size:14px";
    var mb = [btn("CCD"), btn("FABRIK"), btn(T.both)];
    mb.forEach(function (b, i) { b.addEventListener("click", function () { method = i; draw(); }); bar.appendChild(b); });
    var lab = document.createElement("label");
    lab.style.cssText = "display:flex;align-items:center;gap:6px";
    var itTxt = document.createElement("span");
    var slider = document.createElement("input");
    slider.type = "range"; slider.min = "0"; slider.max = "20"; slider.step = "1"; slider.value = String(iters);
    slider.style.width = "130px";
    slider.addEventListener("input", function () { iters = +slider.value; draw(); });
    lab.appendChild(itTxt); lab.appendChild(slider); bar.appendChild(lab);
    root.appendChild(bar);

    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;margin:6px auto 0;touch-action:none;cursor:crosshair";
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
      W = w; H = Math.min(340, Math.max(240, Math.round(w * 0.62)));
      S = Math.min(W / 6.4, H / 3.6); ox = W / 2; oy = H - 0.35 * S;
      var dpr = window.devicePixelRatio || 1;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function px(p) { return [ox + p[0] * S, oy - p[1] * S]; }

    function chain(P, color, alpha, lw) {
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round";
      ctx.beginPath();
      P.forEach(function (p, i) { var z = px(p); if (i) ctx.lineTo(z[0], z[1]); else ctx.moveTo(z[0], z[1]); });
      ctx.stroke();
      P.forEach(function (p) { var z = px(p); ctx.beginPath(); ctx.arc(z[0], z[1], lw + 1.5, 0, 2 * Math.PI); ctx.fill(); });
      ctx.globalAlpha = 1;
    }

    function draw() {
      mb.forEach(function (b, i) {
        var c = i === 0 ? COL.ccd : i === 1 ? COL.fab : "#555";
        b.style.borderColor = c; b.style.background = i === method ? c : "#fff"; b.style.color = i === method ? "#fff" : c;
      });
      itTxt.textContent = T.iters + " " + iters;
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      // reach circle
      var o = px([0, 0]);
      ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(o[0], o[1], 2.8 * S, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      chain(fk(REST), "#999", 0.5, 2);
      var hc = ccd(target, iters), hf = fabrik(target, iters), out = [];
      [[hc, COL.ccd, "CCD", 0], [hf, COL.fab, "FABRIK", 1]].forEach(function (m) {
        if (method !== 2 && method !== m[3]) return;
        var hist = m[0];
        for (var k = 1; k < hist.length - 1; k++) chain(hist[k], m[1], 0.15, 1.5);
        if (iters > 0) chain(hist[hist.length - 1], m[1], 1, 3.5);
        var e = hist[hist.length - 1][LEN.length];
        out.push('<b style="color:' + m[1] + '">' + m[2] + "</b> " + T.err + " " +
          Math.hypot(e[0] - target[0], e[1] - target[1]).toFixed(4));
      });
      ctx.fillStyle = "#222"; ctx.fillRect(o[0] - 9, o[1] - 5, 18, 10);
      var t = px(target);
      ctx.beginPath(); ctx.arc(t[0], t[1], 9, 0, 2 * Math.PI); ctx.fillStyle = "#d62728"; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
      info.innerHTML = out.join(" &nbsp; ") + ' &nbsp; <span style="color:#777">' + T.hint + "</span>";
    }

    function setTarget(e) {
      var rc = canvas.getBoundingClientRect();
      // clamp to the canvas so the target stays visible when the pointer leaves it during a drag
      var x = Math.max(10, Math.min(W - 10, e.clientX - rc.left));
      var y = Math.max(10, Math.min(H - 10, e.clientY - rc.top));
      target = [(x - ox) / S, (oy - y) / S];
      draw();
    }
    canvas.addEventListener("pointerdown", function (e) {
      dragging = true; canvas.setPointerCapture(e.pointerId); e.preventDefault(); setTarget(e);
    });
    canvas.addEventListener("pointermove", function (e) { if (dragging) setTarget(e); });
    canvas.addEventListener("pointerup", function () { dragging = false; });
    canvas.addEventListener("pointercancel", function () { dragging = false; });

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
  }

  function init() {
    document.querySelectorAll('[data-widget="graphics-ik-chain"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
