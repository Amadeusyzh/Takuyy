/* Virtual shadow map page requests, top view (graphics-engine post 04).
 * Model of the post: a camera 1.7 m above a ground plane casts one ray per pixel block (1080p,
 * 60 degree vertical field of view). A ground point at distance d has footprint
 * phi = d * 2 tan(fov/2) / 1080; it needs clipmap level k = floor(log2(16384 phi / 1 cm)) - 1
 * (clamped to 6..22), texel 2^(k+1)/16384 cm and pages of 128 texels. Pages requested this frame
 * but not the previous one are outlined: with caching, only those would have to be rendered.
 */
(function () {
  "use strict";

  var TEXT = {
    en: { yaw: "Camera yaw", pages: "pages requested", fresh: "new since last frame", level: "level",
          hint: "Drag the view to move the camera; use the slider to turn it." },
    zh: { yaw: "\u{76f8}\u{673a}\u{671d}\u{5411}", pages: "\u{8bf7}\u{6c42}\u{7684}\u{9875}", fresh: "\u{76f8}\u{5bf9}\u{4e0a}\u{4e00}\u{5e27}\u{65b0}\u{589e}",
          level: "\u{7ea7}\u{522b}", hint: "\u{62d6}\u{52a8}\u{89c6}\u{56fe}\u{4ee5}\u{79fb}\u{52a8}\u{76f8}\u{673a}\u{ff0c}\u{7528}\u{6ed1}\u{5757}\u{8f6c}\u{52a8}\u{5b83}\u{3002}" },
    ja: { yaw: "\u{30ab}\u{30e1}\u{30e9}\u{306e}\u{5411}\u{304d}", pages: "\u{8981}\u{6c42}\u{3055}\u{308c}\u{305f}\u{30da}\u{30fc}\u{30b8}",
          fresh: "\u{524d}\u{30d5}\u{30ec}\u{30fc}\u{30e0}\u{304b}\u{3089}\u{306e}\u{65b0}\u{898f}", level: "\u{30ec}\u{30d9}\u{30eb}",
          hint: "\u{30c9}\u{30e9}\u{30c3}\u{30b0}\u{3067}\u{30ab}\u{30e1}\u{30e9}\u{3092}\u{79fb}\u{52d5}\u{3057}\u{3001}\u{30b9}\u{30e9}\u{30a4}\u{30c0}\u{30fc}\u{3067}\u{56de}\u{8ee2}\u{3057}\u{307e}\u{3059}\u{3002}" }
  };
  var LCOL = ["#440154", "#472c7a", "#3b528b", "#2c728e", "#21918c", "#28ae80", "#5ec962", "#addc30", "#fde725"];
  var TF = Math.tan(Math.PI / 6), ASPECT = 16 / 9, HPX = 1080, CAM_H = 1.7, MAXD = 150;

  function setup(root) {
    var T = TEXT[root.dataset.lang] || TEXT.en;
    root.style.background = "#fbfbfd";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.color = "#222";
    root.innerHTML = "";
    var cam = [0, 0], yaw = 0, prev = new Set();

    var ctrl = document.createElement("div");
    ctrl.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 10px 0;font-size:13.5px";
    var span = document.createElement("span");
    span.style.cssText = "min-width:150px;font-variant-numeric:tabular-nums";
    var inp = document.createElement("input");
    inp.type = "range"; inp.min = -180; inp.max = 180; inp.step = 1; inp.value = 0;
    inp.style.cssText = "flex:1;accent-color:#9467bd";
    inp.addEventListener("input", function () { yaw = Number(inp.value) * Math.PI / 180; draw(); });
    ctrl.appendChild(span); ctrl.appendChild(inp);
    root.appendChild(ctrl);
    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;margin:4px auto 0;touch-action:none;cursor:move";
    root.appendChild(canvas);
    var info = document.createElement("div");
    info.style.cssText = "padding:4px 10px 10px;font-size:13.5px;line-height:1.5;font-variant-numeric:tabular-nums";
    root.appendChild(info);
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, lastW = -1, sc = 3, VIEW = 70; // meters shown around the camera (half width)

    function resize() {
      var w = Math.max(280, root.clientWidth);
      if (w === lastW) return;
      lastW = w;
      W = w; H = Math.round(Math.min(420, w * 0.75));
      sc = W / (2 * VIEW);
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    // top view: world x to the right, world z up on screen; the camera sits low on the screen
    function SX(x) { return W / 2 + (x - cam[0]) * sc; }
    function SY(z) { return H * 0.85 - (z - cam[1]) * sc; }

    function requestPages() {
      var pages = new Map(), fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      var NX = 160, NY = 90;
      for (var j = 0; j < NY; j++) {
        var py = 1 - (j + 0.5) / NY * 2;
        if (py >= 0) continue;                                   // above the horizon: no ground hit
        for (var i = 0; i < NX; i++) {
          var px = (i + 0.5) / NX * 2 - 1;
          var dx = px * TF * ASPECT, dy = py * TF, len = Math.sqrt(dx * dx + dy * dy + 1);
          var t = CAM_H / (-dy / len);
          if (t > MAXD) continue;
          var lx = dx / len * t, lz = 1 / len * t;               // camera space hit (x right, z forward)
          var wx = cam[0] + lx * rx + lz * fx, wz = cam[1] + lx * rz + lz * fz;
          var phiCm = t * 2 * TF / HPX * 100;
          var k = Math.max(6, Math.min(22, Math.floor(Math.log2(16384 * phiCm)) - 1));
          var pm = 128 * Math.pow(2, k + 1) / 16384 / 100;       // page size in meters
          var key = k + ":" + Math.floor(wx / pm) + ":" + Math.floor(wz / pm);
          if (!pages.has(key)) pages.set(key, [k, Math.floor(wx / pm), Math.floor(wz / pm), pm]);
        }
      }
      return pages;
    }

    function draw() {
      if (!W) return;
      span.textContent = T.yaw + " = " + Math.round(yaw * 180 / Math.PI) + "\u{b0}";
      var pages = requestPages();
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      var perLevel = {}, fresh = 0, kmin = 99;
      pages.forEach(function (p) { kmin = Math.min(kmin, p[0]); });
      pages.forEach(function (p, key) {
        var k = p[0], pm = p[3];
        perLevel[k] = (perLevel[k] || 0) + 1;
        var x0 = SX(p[1] * pm), y0 = SY((p[2] + 1) * pm), s = pm * sc;
        ctx.fillStyle = LCOL[Math.min(LCOL.length - 1, k - kmin)];
        ctx.globalAlpha = 0.8;
        ctx.fillRect(x0, y0, Math.max(1, s - 0.5), Math.max(1, s - 0.5));
        ctx.globalAlpha = 1;
        if (!prev.has(key)) {
          fresh++;
          if (s > 3) { ctx.strokeStyle = "#d62728"; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, s, s); }
        }
      });
      // frustum
      var fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), hw = TF * ASPECT;
      ctx.strokeStyle = "#d62728"; ctx.lineWidth = 1.5;
      [-1, 1].forEach(function (sg) {
        ctx.beginPath(); ctx.moveTo(SX(cam[0]), SY(cam[1]));
        ctx.lineTo(SX(cam[0] + 200 * (fx + sg * hw * rx)), SY(cam[1] + 200 * (fz + sg * hw * rz)));
        ctx.stroke();
      });
      ctx.fillStyle = "#d62728";
      ctx.beginPath(); ctx.arc(SX(cam[0]), SY(cam[1]), 5, 0, 6.2832); ctx.fill();
      // scale bar
      ctx.fillStyle = "#222"; ctx.fillRect(10, H - 14, 10 * sc, 3);
      ctx.font = "12px system-ui, sans-serif"; ctx.fillText("10 m", 12, H - 18);
      var lv = Object.keys(perLevel).map(Number).sort(function (a, b) { return a - b; });
      var legend = lv.map(function (k) {
        return '<span style="display:inline-block;width:10px;height:10px;background:' + LCOL[Math.min(LCOL.length - 1, k - kmin)] +
          ';margin:0 3px 0 8px;vertical-align:middle"></span>' + k + ": " + perLevel[k];
      }).join("");
      info.innerHTML = "<b>" + pages.size + "</b> " + T.pages + " &nbsp; <b style=\"color:#d62728\">" + fresh + "</b> " + T.fresh +
        "<br>" + T.level + legend + '<br><span style="color:#777">' + T.hint + "</span>";
      prev = new Set(pages.keys());
    }

    var last = null;
    canvas.addEventListener("pointerdown", function (e) { last = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); e.preventDefault(); });
    canvas.addEventListener("pointermove", function (e) {
      if (!last) return;
      cam[0] -= (e.clientX - last[0]) / sc;
      cam[1] += (e.clientY - last[1]) / sc;
      last = [e.clientX, e.clientY];
      draw();
    });
    function end() { last = null; }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
  }

  function start() {
    document.querySelectorAll('[data-widget="graphics-engine-vsm-pages"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
