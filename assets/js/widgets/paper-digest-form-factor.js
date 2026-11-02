// Form factor explorer (paper-digest issue 01, entry 19 RADIANT).
// Side view of two small patches. Patch i sits at the origin and faces up; drag patch j and tilt it with
// the slider to see r, the two cosines and F_{i->j} = cos(theta_i) cos(theta_j) A_j / (pi r^2) update.
(function () {
  "use strict";
  // Non-ASCII text is written as @XXXX (hex UTF-16 code unit) and decoded by dec(), keeping the file ASCII-only.
  var TXT = {
    en: { help: "Drag patch j (red). Use the slider to tilt it.", tilt: "tilt of j", reset: "Reset",
      away: "a patch faces away: F = 0", ratio: "relative to the start position" },
    zh: { help: "\u62d6\u52a8\u9762\u7247 j\uff08\u7ea2\u8272\uff09\u3002\u7528\u6ed1\u5757\u8c03\u6574\u5b83\u7684\u503e\u659c\u3002",
      tilt: "j \u7684\u503e\u659c", reset: "\u91cd\u7f6e",
      away: "\u6709\u9762\u7247\u80cc\u5bf9\u5bf9\u65b9\uff1a F = 0", ratio: "\u76f8\u5bf9\u4e8e\u521d\u59cb\u4f4d\u7f6e" },
    ja: { help: "\u30d1\u30c3\u30c1 j\uff08\u8d64\uff09\u3092\u30c9\u30e9\u30c3\u30b0\u3057\u3001\u30b9\u30e9\u30a4\u30c0\u30fc\u3067\u50be\u3051\u307e\u3059\u3002",
      tilt: "j \u306e\u50be\u304d", reset: "\u30ea\u30bb\u30c3\u30c8",
      away: "\u30d1\u30c3\u30c1\u304c\u80cc\u3092\u5411\u3051\u3066\u3044\u307e\u3059\uff1a F = 0", ratio: "\u521d\u671f\u4f4d\u7f6e\u3068\u306e\u6bd4" }
  };
  function dec(s) {
    return s.replace(/@([0-9a-f]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
  }
  var AJ = 0.1, START = { y: 2, z: 2, tilt: 0 };

  function formFactor(y, z, tiltDeg) {
    var r2 = y * y + z * z, r = Math.sqrt(r2);
    var wy = y / r, wz = z / r;                       // unit direction from i to j
    var t = tiltDeg * Math.PI / 180;
    var ny = Math.sin(t), nz = -Math.cos(t);          // normal of j (tilt 0 = facing straight down)
    var ci = Math.max(wz, 0);                         // n_i = (0, 1)
    var cj = Math.max(-(ny * wy + nz * wz), 0);
    return { r: r, ci: ci, cj: cj, F: ci * cj * AJ / (Math.PI * r2), ny: ny, nz: nz };
  }

  function build(root) {
    var lang = TXT[root.dataset.lang] ? root.dataset.lang : "en";
    var T = {};
    for (var k in TXT[lang]) if (Object.prototype.hasOwnProperty.call(TXT[lang], k)) T[k] = dec(TXT[lang][k]);
    root.innerHTML = "";
    var box = document.createElement("div");
    box.style.cssText = "background:#fff;color:#222;border:1px solid #ddd;border-radius:10px;padding:10px;" +
      "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;box-sizing:border-box;max-width:100%";
    root.appendChild(box);
    var help = document.createElement("div");
    help.style.cssText = "font-size:13px;color:#555;margin-bottom:6px";
    help.textContent = T.help;
    box.appendChild(help);
    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:280px;touch-action:none;cursor:grab";
    box.appendChild(canvas);
    var row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px";
    var lab = document.createElement("label");
    lab.style.cssText = "display:flex;align-items:center;gap:6px;flex:1 1 220px;min-width:0;font-size:13px";
    var span = document.createElement("span");
    span.textContent = T.tilt;
    var slider = document.createElement("input");
    slider.type = "range"; slider.min = "-90"; slider.max = "90"; slider.step = "1"; slider.value = String(START.tilt);
    slider.style.cssText = "flex:1 1 auto;min-width:0";
    var deg = document.createElement("span");
    deg.style.cssText = "width:42px;text-align:right;font-variant-numeric:tabular-nums";
    lab.appendChild(span); lab.appendChild(slider); lab.appendChild(deg);
    row.appendChild(lab);
    var reset = document.createElement("button");
    reset.type = "button"; reset.textContent = T.reset;
    reset.style.cssText = "font:inherit;font-size:13px;padding:4px 12px;border-radius:6px;border:1px solid #9467bd;background:#fff;color:#222;cursor:pointer";
    row.appendChild(reset);
    box.appendChild(row);
    var out = document.createElement("div");
    out.style.cssText = "font-size:13px;margin-top:6px;line-height:1.5;font-variant-numeric:tabular-nums";
    box.appendChild(out);

    var st = { y: START.y, z: START.z, tilt: START.tilt };
    var F0 = formFactor(START.y, START.z, START.tilt).F;
    var view = { W: 600, H: 280, s: 60, ox: 300, oy: 250 };

    function layout() {
      var W = Math.max(260, canvas.clientWidth || 600), H = 280;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      var ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      view.W = W; view.H = H;
      view.s = Math.min(W / 9, (H - 30) / 4.2);
      view.ox = W / 2; view.oy = H - 30;
      draw();
    }
    function toPx(y, z) { return [view.ox + y * view.s, view.oy - z * view.s]; }
    function arrow(ctx, a, b, col) {
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      var ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ctx.beginPath();
      ctx.moveTo(b[0], b[1]);
      ctx.lineTo(b[0] - 10 * Math.cos(ang - 0.4), b[1] - 10 * Math.sin(ang - 0.4));
      ctx.lineTo(b[0] - 10 * Math.cos(ang + 0.4), b[1] - 10 * Math.sin(ang + 0.4));
      ctx.closePath(); ctx.fill();
    }
    function draw() {
      var ctx = canvas.getContext("2d");
      var W = view.W, H = view.H, s = view.s;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      // grid (1 unit)
      ctx.strokeStyle = "rgba(0,0,0,0.07)"; ctx.lineWidth = 1;
      for (var gy = -4; gy <= 4; gy++) { var p = toPx(gy, 0); ctx.beginPath(); ctx.moveTo(p[0], 0); ctx.lineTo(p[0], H - 30); ctx.stroke(); }
      for (var gz = 0; gz <= 4; gz++) { var q = toPx(0, gz); ctx.beginPath(); ctx.moveTo(0, q[1]); ctx.lineTo(W, q[1]); ctx.stroke(); }
      ctx.fillStyle = "#777"; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center";
      for (gy = -4; gy <= 4; gy += 2) { var t = toPx(gy, 0); ctx.fillText(String(gy), t[0], H - 12); }
      var res = formFactor(st.y, st.z, st.tilt);
      var pi = toPx(0, 0), pj = toPx(st.y, st.z);
      // connecting line
      ctx.setLineDash([6, 5]); ctx.strokeStyle = "#9467bd"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pi[0], pi[1]); ctx.lineTo(pj[0], pj[1]); ctx.stroke(); ctx.setLineDash([]);
      // patch i
      ctx.strokeStyle = "#1f77b4"; ctx.lineWidth = 7; ctx.lineCap = "butt";
      ctx.beginPath(); ctx.moveTo(pi[0] - 0.5 * s, pi[1]); ctx.lineTo(pi[0] + 0.5 * s, pi[1]); ctx.stroke();
      arrow(ctx, pi, [pi[0], pi[1] - 0.9 * s], "#222");
      // patch j: segment perpendicular to its normal
      var ty = -res.nz, tz = res.ny, half = 0.32;
      var a = toPx(st.y - ty * half, st.z - tz * half), b = toPx(st.y + ty * half, st.z + tz * half);
      ctx.strokeStyle = "#d62728"; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      arrow(ctx, pj, toPx(st.y + res.ny * 0.9, st.z + res.nz * 0.9), "#222");
      ctx.fillStyle = "#222"; ctx.font = "italic 15px Georgia, serif"; ctx.textAlign = "left";
      ctx.fillText("i", pi[0] - 0.5 * s - 14, pi[1] + 5);
      ctx.fillText("j", pj[0] + 0.4 * s, pj[1] - 6);
      // readout
      var pct = F0 > 0 ? (100 * res.F / F0) : 0;
      out.innerHTML = "";
      var line1 = document.createElement("div");
      line1.textContent = "r = " + res.r.toFixed(2) + ", cos\u03b8i = " + res.ci.toFixed(3) + ", cos\u03b8j = " + res.cj.toFixed(3);
      var line2 = document.createElement("div");
      line2.style.cssText = "font-weight:bold;color:#7b4fa8";
      line2.textContent = dec("F(i\u2192j) = ") + res.F.toFixed(5) + "   (" + pct.toFixed(0) + "% " + T.ratio + ")";
      out.appendChild(line1); out.appendChild(line2);
      if (res.F === 0) {
        var line3 = document.createElement("div");
        line3.style.color = "#c42021";
        line3.textContent = T.away;
        out.appendChild(line3);
      }
      deg.textContent = st.tilt + dec("\u00b0");
    }
    function setFromEvent(ev) {
      var r = canvas.getBoundingClientRect();
      var px = (ev.clientX - r.left) * view.W / r.width, py = (ev.clientY - r.top) * view.H / r.height;
      st.y = Math.max(-4, Math.min(4, (px - view.ox) / view.s));
      st.z = Math.max(0.4, Math.min(4, (view.oy - py) / view.s));
      draw();
    }
    var dragging = false;
    canvas.addEventListener("pointerdown", function (ev) {
      dragging = true;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      setFromEvent(ev);
    });
    canvas.addEventListener("pointermove", function (ev) { if (dragging) setFromEvent(ev); });
    canvas.addEventListener("pointerup", function () { dragging = false; });
    canvas.addEventListener("pointercancel", function () { dragging = false; });
    slider.addEventListener("input", function () { st.tilt = parseInt(slider.value, 10) || 0; draw(); });
    reset.addEventListener("click", function () {
      st.y = START.y; st.z = START.z; st.tilt = START.tilt; slider.value = String(START.tilt); draw();
    });
    window.addEventListener("resize", layout);
    layout();
  }

  function init() {
    var roots = document.querySelectorAll('[data-widget="paper-digest-form-factor"]');
    for (var i = 0; i < roots.length; i++) build(roots[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
