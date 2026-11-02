/* Curve subdivision explorer (graphics post 08).
 * A closed control polygon is refined level by level with one of three schemes:
 *   Chaikin corner cutting      (3/4, 1/4) and (1/4, 3/4) on every edge      -> quadratic B-spline
 *   4-point (Dyn-Levin-Gregory) keep p_i, insert 9/16 (p_i + p_i+1) - 1/16 (p_i-1 + p_i+2) -> interpolating
 *   cubic B-spline              vertex (p_i-1 + 6 p_i + p_i+1) / 8, edge midpoint (p_i + p_i+1) / 2
 * Drag the control points; the level slider sets how many refinement steps are applied.
 */
(function () {
  "use strict";

  var TEXT = {
    en: {
      schemes: ["Chaikin", "4-point", "cubic B-spline"],
      kinds: ["approximating", "interpolating", "approximating"],
      level: "Level", ghost: "show all levels", pts: "points", reset: "Reset", add: "Add point",
      hint: "Drag the black control points.",
    },
    zh: {
      schemes: ["Chaikin", "4\u70b9", "\u4e09\u6b21 B \u6837\u6761"],
      kinds: ["\u903c\u8fd1\u578b", "\u63d2\u503c\u578b", "\u903c\u8fd1\u578b"],
      level: "\u5c42\u7ea7", ghost: "\u663e\u793a\u6240\u6709\u5c42\u7ea7", pts: "\u4e2a\u70b9",
      reset: "\u91cd\u7f6e", add: "\u6dfb\u52a0\u70b9",
      hint: "\u62d6\u52a8\u9ed1\u8272\u63a7\u5236\u70b9\u3002",
    },
    ja: {
      schemes: ["Chaikin", "4\u70b9\u6cd5", "3\u6b21 B \u30b9\u30d7\u30e9\u30a4\u30f3"],
      kinds: ["\u8fd1\u4f3c\u578b", "\u88dc\u9593\u578b", "\u8fd1\u4f3c\u578b"],
      level: "\u30ec\u30d9\u30eb", ghost: "\u5168\u30ec\u30d9\u30eb\u3092\u8868\u793a", pts: "\u70b9",
      reset: "\u30ea\u30bb\u30c3\u30c8", add: "\u70b9\u3092\u8ffd\u52a0",
      hint: "\u9ed2\u3044\u5236\u5fa1\u70b9\u3092\u30c9\u30e9\u30c3\u30b0\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
    },
  };

  var COLORS = ["#9467bd", "#ff7f0e", "#1f77b4"];
  var DEFAULT = [[0.18, 0.30], [0.42, 0.14], [0.80, 0.22], [0.86, 0.62], [0.60, 0.86], [0.50, 0.50], [0.20, 0.78]];

  function chaikin(P) {
    var n = P.length, Q = [];
    for (var i = 0; i < n; i++) {
      var a = P[i], b = P[(i + 1) % n];
      Q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      Q.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    return Q;
  }
  function fourPoint(P) {
    var n = P.length, Q = [];
    for (var i = 0; i < n; i++) {
      var a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], d = P[(i + 2) % n];
      Q.push([b[0], b[1]]);
      Q.push([(9 * (b[0] + c[0]) - (a[0] + d[0])) / 16, (9 * (b[1] + c[1]) - (a[1] + d[1])) / 16]);
    }
    return Q;
  }
  function bspline(P) {
    var n = P.length, Q = [];
    for (var i = 0; i < n; i++) {
      var a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
      Q.push([(a[0] + 6 * b[0] + c[0]) / 8, (a[1] + 6 * b[1] + c[1]) / 8]);
      Q.push([(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]);
    }
    return Q;
  }
  var RULES = [chaikin, fourPoint, bspline];

  function button(txt) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = txt;
    b.style.cssText = "border:1px solid #9467bd;border-radius:14px;padding:3px 10px;font-size:13px;cursor:pointer;background:#fff;color:#5a3d85";
    return b;
  }

  function setup(root) {
    var T = TEXT[root.dataset.lang] || TEXT.en;
    root.style.background = "#fbfbfd";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.color = "#222";
    root.innerHTML = "";

    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px 0;font-size:14px";
    var scheme = 0, level = 3, ghost = true, drag = -1;
    var P = DEFAULT.map(function (p) { return p.slice(); });
    var sbtn = T.schemes.map(function (s, i) {
      var b = button(s);
      b.addEventListener("click", function () { scheme = i; draw(); });
      bar.appendChild(b);
      return b;
    });
    root.appendChild(bar);

    var bar2 = document.createElement("div");
    bar2.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 10px 0;font-size:14px";
    var lab = document.createElement("label");
    lab.style.cssText = "display:flex;align-items:center;gap:6px";
    var lvlTxt = document.createElement("span");
    var slider = document.createElement("input");
    slider.type = "range"; slider.min = "0"; slider.max = "6"; slider.step = "1"; slider.value = String(level);
    slider.style.width = "120px";
    slider.addEventListener("input", function () { level = +slider.value; draw(); });
    lab.appendChild(lvlTxt); lab.appendChild(slider);
    bar2.appendChild(lab);
    var glab = document.createElement("label");
    glab.style.cssText = "display:flex;align-items:center;gap:4px";
    var gbox = document.createElement("input");
    gbox.type = "checkbox"; gbox.checked = ghost;
    gbox.addEventListener("change", function () { ghost = gbox.checked; draw(); });
    glab.appendChild(gbox); glab.appendChild(document.createTextNode(T.ghost));
    bar2.appendChild(glab);
    var addB = button(T.add), resetB = button(T.reset);
    addB.addEventListener("click", function () {
      if (P.length >= 14) return;
      var best = 0, bl = -1;
      for (var i = 0; i < P.length; i++) {
        var a = P[i], b = P[(i + 1) % P.length];
        var l = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (l > bl) { bl = l; best = i; }
      }
      var a2 = P[best], b2 = P[(best + 1) % P.length];
      P.splice(best + 1, 0, [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2]);
      draw();
    });
    resetB.addEventListener("click", function () { P = DEFAULT.map(function (p) { return p.slice(); }); draw(); });
    bar2.appendChild(addB); bar2.appendChild(resetB);
    root.appendChild(bar2);

    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;margin:6px auto 0;touch-action:none;cursor:grab";
    root.appendChild(canvas);
    var info = document.createElement("div");
    info.style.cssText = "padding:4px 10px 10px;font-size:14px;line-height:1.5;font-variant-numeric:tabular-nums";
    root.appendChild(info);
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, S = 1, lastW = -1;

    function resize() {
      var w = Math.max(260, root.clientWidth);
      if (w === lastW) return;
      lastW = w;
      W = w; H = Math.min(340, Math.max(240, Math.round(w * 0.62)));
      S = Math.min(W, H * 1.25);
      var dpr = window.devicePixelRatio || 1;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    // world [0,1]^2 (aspect-corrected), centred in the canvas
    function toPx(p) { return [(W - S) / 2 + p[0] * S, (H - S * 0.8) / 2 + p[1] * S * 0.8]; }
    function fromPx(x, y) {
      return [Math.min(1, Math.max(0, (x - (W - S) / 2) / S)), Math.min(1, Math.max(0, (y - (H - S * 0.8) / 2) / (S * 0.8)))];
    }

    function poly(Q, color, lw, dash, dots) {
      ctx.beginPath();
      for (var i = 0; i <= Q.length; i++) {
        var z = toPx(Q[i % Q.length]);
        if (i) ctx.lineTo(z[0], z[1]); else ctx.moveTo(z[0], z[1]);
      }
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash || []);
      ctx.stroke(); ctx.setLineDash([]);
      if (dots) {
        ctx.fillStyle = color;
        for (i = 0; i < Q.length; i++) {
          var q = toPx(Q[i]);
          ctx.beginPath(); ctx.arc(q[0], q[1], dots, 0, 2 * Math.PI); ctx.fill();
        }
      }
    }

    function draw() {
      sbtn.forEach(function (b, i) {
        b.style.background = i === scheme ? COLORS[i] : "#fff";
        b.style.color = i === scheme ? "#fff" : "#5a3d85";
        b.style.borderColor = COLORS[i];
      });
      lvlTxt.textContent = T.level + " " + level;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
      var levels = [P], Q = P;
      for (var k = 0; k < level; k++) { Q = RULES[scheme](Q); levels.push(Q); }
      poly(P, "#9a9a9a", 1.5, [6, 4]);
      if (ghost) {
        for (k = 1; k < level; k++) {
          var t = k / Math.max(1, level);
          poly(levels[k], "rgba(120,120,120," + (0.25 + 0.35 * t).toFixed(2) + ")", 1.2, null, level - k <= 1 ? 2 : 0);
        }
      }
      poly(Q, COLORS[scheme], 2.6, null, level > 0 && Q.length <= 120 ? 3 : 0);
      for (var i = 0; i < P.length; i++) {
        var z = toPx(P[i]);
        ctx.beginPath(); ctx.arc(z[0], z[1], 8, 0, 2 * Math.PI);
        ctx.fillStyle = i === drag ? "#9467bd" : "#222"; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
      }
      info.innerHTML = "<b>" + T.schemes[scheme] + "</b> (" + T.kinds[scheme] + ") &nbsp; " +
        T.level + " " + level + ": " + Q.length + " " + T.pts +
        ' &nbsp; <span style="color:#777">' + T.hint + "</span>";
    }

    function pick(e) {
      var rc = canvas.getBoundingClientRect();
      var x = e.clientX - rc.left, y = e.clientY - rc.top, best = -1, bd = Infinity;
      for (var i = 0; i < P.length; i++) {
        var z = toPx(P[i]), d = Math.hypot(z[0] - x, z[1] - y);
        if (d < bd) { bd = d; best = i; }
      }
      return bd < 30 ? best : -1;
    }
    canvas.addEventListener("pointerdown", function (e) {
      drag = pick(e);
      if (drag < 0) return;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      draw();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (drag < 0) return;
      var rc = canvas.getBoundingClientRect();
      // clamp to the canvas so a control point cannot be lost off-screen
      P[drag] = fromPx(Math.max(8, Math.min(W - 8, e.clientX - rc.left)),
                       Math.max(8, Math.min(H - 8, e.clientY - rc.top)));
      draw();
    });
    function end() { if (drag >= 0) { drag = -1; draw(); } }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
  }

  function init() {
    document.querySelectorAll('[data-widget="graphics-subdivision"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
