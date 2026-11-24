/* 3D GUI Agent post 01: where is the UI?
   A top-down room with five floating windows around the user. Drag (or swipe) sideways to turn the head.
   The wedge is the field of view of one frame; visibility is computed by casting rays from the head against
   the windows (nearest window wins), so a window can be in view, occluded by a nearer window, outside the
   view, or behind the user. The strip under the map is the agent's view in that frame (one ray per column).
   "Memory" keeps a faded marker where each window was last seen; "Rearrange" moves windows, which can make
   that memory stale. A request picker says whether the agent could act from the current frame or must first
   turn, search or recall. The layout is illustrative and encodes no benchmark parameters.
   Plain JS, no libraries, ASCII only. */
(function () {
  "use strict";
  var NAME = "3d-gui-agent-where-is-the-ui";
  var TXT = {
    en: {
      names: { browser: "Browser", mail: "Mail", photos: "Photos", settings: "Settings", music: "Music" },
      req: "Request", reqs: [
        ["browser", "Open the browser"], ["music", "Bring the music player here"], ["mail", "Reply to the new email"],
        ["photos", "Show the last photo"], ["settings", "Turn on the passthrough setting"]],
      memory: "Memory", rearrange: "Rearrange", reset: "Reset", fov: "field of view",
      how: "Drag or swipe sideways on the map to turn the head (arrow keys also work).",
      st: { view: "in view", partial: "at the edge", occluded: "occluded", outside: "outside the view", behind: "behind you" },
      strip: "agent's view in this frame",
      left: "left", right: "right",
      can: "Can act from this frame: {w} is in view.",
      part: "{w} is only partly in this frame, at the edge of the view. A small turn would bring it fully into view before acting.",
      occ: "{w} is in the wedge but hidden behind {o}. Turn or lean to see it, or move {o} first.",
      recall: "{w} is not in this frame, but the agent saw it before: about {a}\u00b0 to the {s}. It can turn there, or act on the remembered position and verify.",
      stale: "Memory says {w} is about {a}\u00b0 to the {s}, but it has moved since it was seen. Acting on that memory would miss: the agent must look again.",
      search: "{w} is not in this frame and the agent has no memory of it: it must search (turn around) or ask the user.",
      seen: "remembered"
    },
    zh: {
      names: { browser: "\u6d4f\u89c8\u5668", mail: "\u90ae\u4ef6", photos: "\u7167\u7247", settings: "\u8bbe\u7f6e", music: "\u97f3\u4e50" },
      req: "\u8bf7\u6c42", reqs: [
        ["browser", "\u6253\u5f00\u6d4f\u89c8\u5668"], ["music", "\u628a\u97f3\u4e50\u64ad\u653e\u5668\u62ff\u5230\u8fd9\u91cc"], ["mail", "\u56de\u590d\u65b0\u90ae\u4ef6"],
        ["photos", "\u663e\u793a\u6700\u540e\u4e00\u5f20\u7167\u7247"], ["settings", "\u6253\u5f00\u900f\u89c6\uff08passthrough\uff09\u8bbe\u7f6e"]],
      memory: "\u8bb0\u5fc6", rearrange: "\u91cd\u65b0\u6446\u653e", reset: "\u91cd\u7f6e", fov: "\u89c6\u91ce",
      how: "\u5728\u5730\u56fe\u4e0a\u5de6\u53f3\u62d6\u52a8\u6216\u6ed1\u52a8\u6765\u8f6c\u5934\uff08\u4e5f\u53ef\u4ee5\u7528\u65b9\u5411\u952e\uff09\u3002",
      st: { view: "\u5728\u89c6\u91ce\u5185", partial: "\u5728\u89c6\u91ce\u8fb9\u7f18", occluded: "\u88ab\u906e\u6321", outside: "\u5728\u89c6\u91ce\u5916", behind: "\u5728\u4f60\u8eab\u540e" },
      strip: "\u8fd9\u4e00\u5e27\u4e2d\u667a\u80fd\u4f53\u770b\u5230\u7684\u753b\u9762",
      left: "\u5de6", right: "\u53f3",
      can: "\u53ef\u4ee5\u76f4\u63a5\u6839\u636e\u8fd9\u4e00\u5e27\u64cd\u4f5c\uff1a{w}\u5728\u89c6\u91ce\u5185\u3002",
      part: "{w}\u53ea\u6709\u4e00\u90e8\u5206\u5728\u8fd9\u4e00\u5e27\u91cc\uff0c\u4f4d\u4e8e\u89c6\u91ce\u8fb9\u7f18\u3002\u7a0d\u5fae\u8f6c\u5934\u5c31\u80fd\u5728\u64cd\u4f5c\u524d\u770b\u5230\u5b83\u7684\u5168\u90e8\u3002",
      occ: "{w}\u5728\u89c6\u91ce\u8303\u56f4\u5185\uff0c\u4f46\u88ab{o}\u6321\u4f4f\u4e86\u3002\u9700\u8981\u8f6c\u5934\u6216\u4fa7\u8eab\u624d\u80fd\u770b\u5230\uff0c\u6216\u8005\u5148\u79fb\u5f00{o}\u3002",
      recall: "{w}\u4e0d\u5728\u8fd9\u4e00\u5e27\u91cc\uff0c\u4f46\u667a\u80fd\u4f53\u4e4b\u524d\u89c1\u8fc7\u5b83\uff1a\u5927\u7ea6\u5728{s}\u4fa7 {a}\u00b0\u3002\u5b83\u53ef\u4ee5\u8f6c\u5411\u90a3\u91cc\uff0c\u6216\u6309\u8bb0\u4f4f\u7684\u4f4d\u7f6e\u64cd\u4f5c\u540e\u518d\u9a8c\u8bc1\u3002",
      stale: "\u8bb0\u5fc6\u663e\u793a{w}\u5927\u7ea6\u5728{s}\u4fa7 {a}\u00b0\uff0c\u4f46\u5b83\u5728\u88ab\u770b\u5230\u4e4b\u540e\u79fb\u52a8\u8fc7\u4e86\u3002\u6309\u8fd9\u6761\u8bb0\u5fc6\u64cd\u4f5c\u4f1a\u843d\u7a7a\uff1a\u667a\u80fd\u4f53\u5fc5\u987b\u91cd\u65b0\u67e5\u770b\u3002",
      search: "{w}\u4e0d\u5728\u8fd9\u4e00\u5e27\u91cc\uff0c\u667a\u80fd\u4f53\u4e5f\u6ca1\u6709\u5173\u4e8e\u5b83\u7684\u8bb0\u5fc6\uff1a\u5b83\u5fc5\u987b\u641c\u7d22\uff08\u8f6c\u8eab\uff09\u6216\u8be2\u95ee\u7528\u6237\u3002",
      seen: "\u5df2\u8bb0\u4f4f"
    },
    ja: {
      names: { browser: "\u30d6\u30e9\u30a6\u30b6", mail: "\u30e1\u30fc\u30eb", photos: "\u5199\u771f", settings: "\u8a2d\u5b9a", music: "\u97f3\u697d" },
      req: "\u30ea\u30af\u30a8\u30b9\u30c8", reqs: [
        ["browser", "\u30d6\u30e9\u30a6\u30b6\u3092\u958b\u3044\u3066"], ["music", "\u97f3\u697d\u30d7\u30ec\u30fc\u30e4\u30fc\u3092\u3053\u3053\u306b\u6301\u3063\u3066\u304d\u3066"], ["mail", "\u65b0\u7740\u30e1\u30fc\u30eb\u306b\u8fd4\u4fe1\u3057\u3066"],
        ["photos", "\u6700\u5f8c\u306e\u5199\u771f\u3092\u898b\u305b\u3066"], ["settings", "\u30d1\u30b9\u30b9\u30eb\u30fc\u8a2d\u5b9a\u3092\u30aa\u30f3\u306b\u3057\u3066"]],
      memory: "\u8a18\u61b6", rearrange: "\u914d\u7f6e\u3092\u5909\u3048\u308b", reset: "\u30ea\u30bb\u30c3\u30c8", fov: "\u8996\u91ce",
      how: "\u5730\u56f3\u306e\u4e0a\u3067\u5de6\u53f3\u306b\u30c9\u30e9\u30c3\u30b0\u307e\u305f\u306f\u30b9\u30ef\u30a4\u30d7\u3059\u308b\u3068\u982d\u304c\u56de\u308a\u307e\u3059\uff08\u77e2\u5370\u30ad\u30fc\u3082\u4f7f\u3048\u307e\u3059\uff09\u3002",
      st: { view: "\u8996\u91ce\u5185", partial: "\u8996\u91ce\u306e\u7aef", occluded: "\u96a0\u308c\u3066\u3044\u308b", outside: "\u8996\u91ce\u5916", behind: "\u80cc\u5f8c" },
      strip: "\u3053\u306e\u30d5\u30ec\u30fc\u30e0\u3067\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u304c\u898b\u3066\u3044\u308b\u3082\u306e",
      left: "\u5de6", right: "\u53f3",
      can: "\u3053\u306e\u30d5\u30ec\u30fc\u30e0\u304b\u3089\u64cd\u4f5c\u3067\u304d\u307e\u3059\uff1a{w}\u306f\u8996\u91ce\u5185\u306b\u3042\u308a\u307e\u3059\u3002",
      part: "{w}\u306f\u3053\u306e\u30d5\u30ec\u30fc\u30e0\u306b\u4e00\u90e8\u3057\u304b\u5165\u3063\u3066\u304a\u3089\u305a\u3001\u8996\u91ce\u306e\u7aef\u306b\u3042\u308a\u307e\u3059\u3002\u5c11\u3057\u982d\u3092\u56de\u305b\u3070\u3001\u64cd\u4f5c\u306e\u524d\u306b\u5168\u4f53\u3092\u8996\u91ce\u306b\u5165\u308c\u3089\u308c\u307e\u3059\u3002",
      occ: "{w}\u306f\u8996\u91ce\u306e\u7bc4\u56f2\u5185\u3067\u3059\u304c\u3001{o}\u306b\u96a0\u308c\u3066\u3044\u307e\u3059\u3002\u982d\u3092\u56de\u3059\u304b\u4f53\u3092\u305a\u3089\u3057\u3066\u898b\u308b\u304b\u3001\u5148\u306b{o}\u3092\u52d5\u304b\u3059\u5fc5\u8981\u304c\u3042\u308a\u307e\u3059\u3002",
      recall: "{w}\u306f\u3053\u306e\u30d5\u30ec\u30fc\u30e0\u306b\u3042\u308a\u307e\u305b\u3093\u304c\u3001\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u306f\u4ee5\u524d\u306b\u898b\u3066\u3044\u307e\u3059\uff1a{s}\u306b\u7d04 {a}\u00b0\u3002\u305d\u3061\u3089\u3092\u5411\u304f\u304b\u3001\u8a18\u61b6\u3057\u305f\u4f4d\u7f6e\u3067\u64cd\u4f5c\u3057\u3066\u304b\u3089\u78ba\u8a8d\u3067\u304d\u307e\u3059\u3002",
      stale: "\u8a18\u61b6\u3067\u306f{w}\u306f{s}\u306b\u7d04 {a}\u00b0 \u3067\u3059\u304c\u3001\u898b\u305f\u3042\u3068\u3067\u52d5\u3044\u3066\u3044\u307e\u3059\u3002\u3053\u306e\u8a18\u61b6\u3067\u64cd\u4f5c\u3059\u308b\u3068\u5916\u308c\u307e\u3059\uff1a\u3082\u3046\u4e00\u5ea6\u898b\u308b\u5fc5\u8981\u304c\u3042\u308a\u307e\u3059\u3002",
      search: "{w}\u306f\u3053\u306e\u30d5\u30ec\u30fc\u30e0\u306b\u306a\u304f\u3001\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u306f\u305d\u306e\u8a18\u61b6\u3082\u6301\u3063\u3066\u3044\u307e\u305b\u3093\uff1a\u63a2\u3059\uff08\u632f\u308a\u5411\u304f\uff09\u304b\u3001\u30e6\u30fc\u30b6\u30fc\u306b\u5c0b\u306d\u308b\u5fc5\u8981\u304c\u3042\u308a\u307e\u3059\u3002",
      seen: "\u8a18\u61b6\u6e08\u307f"
    }
  };

  var DEG = Math.PI / 180;
  var FOV = 100 * DEG;
  // key, angle from the initial heading (deg, + = left), distance (m), width (m), colour
  var LAYOUT = [
    ["browser", 4, 1.7, 1.0, "#1f77b4"],
    ["mail", 36, 1.1, 0.6, "#ff7f0e"],
    ["photos", 30, 2.6, 1.0, "#2ca02c"],
    ["settings", -85, 1.5, 0.8, "#8c564b"],
    ["music", 165, 1.8, 0.9, "#d62728"]
  ];
  var STCOL = { view: "#2a9d4b", partial: "#17a2b8", occluded: "#e07b00", outside: "#7f7f7f", behind: "#d62728" };

  function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function mix(hex, a) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return "rgb(" + Math.round(255 - a * (255 - r)) + "," + Math.round(255 - a * (255 - g)) + "," + Math.round(255 - a * (255 - b)) + ")";
  }
  function fmt(s, o) { return s.replace(/\{(\w)\}/g, function (m, k) { return o[k] !== undefined ? o[k] : m; }); }

  // geometry: heading 0 = +y (up on the map), positive angles turn left (counter-clockwise)
  function dirOf(a) { return [-Math.sin(a), Math.cos(a)]; }
  function angleOf(x, y) { return Math.atan2(-x, y); }
  function makeWin(k, angDeg, d, w, col) {
    var a = angDeg * DEG, c = dirOf(a), t = [Math.cos(a), Math.sin(a)];
    var cx = c[0] * d, cy = c[1] * d;
    return { key: k, ang: a, d: d, w: w, col: col, cx: cx, cy: cy,
      p0: [cx - t[0] * w / 2, cy - t[1] * w / 2], p1: [cx + t[0] * w / 2, cy + t[1] * w / 2] };
  }
  // ray from origin in direction u against segment p0-p1: distance or -1
  function hit(u, p0, p1) {
    var ex = p1[0] - p0[0], ey = p1[1] - p0[1];
    var det = u[0] * (-ey) - u[1] * (-ex);
    if (Math.abs(det) < 1e-12) return -1;
    var t = (p0[0] * (-ey) - p0[1] * (-ex)) / det;
    var s = (u[0] * p0[1] - u[1] * p0[0]) / det;
    return (t > 1e-6 && s >= 0 && s <= 1) ? t : -1;
  }
  function nearest(wins, u) {
    var best = null, bt = 1e9;
    for (var i = 0; i < wins.length; i++) {
      var t = hit(u, wins[i].p0, wins[i].p1);
      if (t > 0 && t < bt) { bt = t; best = i; }
    }
    return best === null ? null : { i: best, t: bt };
  }
  function classify(wins, heading) {
    var NS = 24, out = [];
    for (var i = 0; i < wins.length; i++) {
      var w = wins[i], nin = 0, nvis = 0, occ = {};
      for (var k = 0; k < NS; k++) {
        var s = (k + 0.5) / NS;
        var qx = w.p0[0] + (w.p1[0] - w.p0[0]) * s, qy = w.p0[1] + (w.p1[1] - w.p0[1]) * s;
        var a = wrapAngle(angleOf(qx, qy) - heading);
        if (Math.abs(a) <= FOV / 2) {
          nin++;
          var dist = Math.hypot(qx, qy);
          var n = nearest(wins, [qx / dist, qy / dist]);
          if (!n || n.i === i || n.t >= dist - 1e-6) nvis++;
          else occ[n.i] = (occ[n.i] || 0) + 1;
        }
      }
      var ca = wrapAngle(angleOf(w.cx, w.cy) - heading), st;
      if (nvis / NS >= 0.5) st = "view";
      else if (nin > 0) st = (nin - nvis > nvis) ? "occluded" : "partial"; // in-FOV samples are visible or occluded
      else if (Math.abs(ca) <= 110 * DEG) st = "outside";
      else st = "behind";
      var occBy = null, mx = 0;
      for (var j in occ) if (occ[j] > mx) { mx = occ[j]; occBy = +j; }
      out.push({ st: st, rel: ca, occBy: occBy });
    }
    return out;
  }

  function build(el) {
    var lang = TXT[el.dataset.lang] ? el.dataset.lang : "en";
    var T = TXT[lang];
    el.innerHTML = "";
    el.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', sans-serif";
    el.style.fontSize = "14px";
    el.style.color = "#222";

    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:4px 0 6px 0;";
    var lab = document.createElement("label");
    lab.textContent = T.req + " ";
    var sel = document.createElement("select");
    sel.style.cssText = "font-size:14px;padding:3px 4px;max-width:100%;";
    T.reqs.forEach(function (r, i) { var o = document.createElement("option"); o.value = r[0]; o.textContent = r[1]; sel.appendChild(o); });
    sel.value = "music";
    lab.appendChild(sel);
    var memLab = document.createElement("label");
    var mem = document.createElement("input");
    mem.type = "checkbox";
    memLab.appendChild(mem);
    memLab.appendChild(document.createTextNode(" " + T.memory));
    function mkBtn(t) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = t;
      b.style.cssText = "font-size:14px;padding:4px 10px;border:1px solid #9467bd;border-radius:6px;background:#f6f1fb;color:#4b2a7a;cursor:pointer;";
      return b;
    }
    var bRe = mkBtn(T.rearrange), bReset = mkBtn(T.reset);
    [lab, memLab, bRe, bReset].forEach(function (n) { bar.appendChild(n); });
    el.appendChild(bar);

    var how = document.createElement("div");
    how.textContent = T.how;
    how.style.cssText = "font-size:13px;color:#555;margin-bottom:4px;";
    el.appendChild(how);

    var cv = document.createElement("canvas");
    cv.style.cssText = "display:block;width:100%;touch-action:pan-y;cursor:grab;background:#fff;border:1px solid #ddd;border-radius:6px;";
    cv.tabIndex = 0;
    el.appendChild(cv);
    var status = document.createElement("div");
    status.style.cssText = "margin-top:8px;padding:8px 10px;border-radius:6px;line-height:1.45;min-height:3.2em;";
    el.appendChild(status);
    var ctx = cv.getContext("2d");

    var S = { heading: 0, wins: [], memory: {}, W: 600, H: 480, mapH: 380 };
    function reset() {
      S.heading = 0;
      S.wins = LAYOUT.map(function (r) { return makeWin(r[0], r[1], r[2], r[3], r[4]); });
      S.memory = {};
    }
    function rearrange() {
      // move every window to a new angle and distance (kept apart by at least 30 degrees)
      var angs = [], tries = 0;
      while (angs.length < S.wins.length && tries < 2000) {
        tries++;
        var a = (Math.random() * 360 - 180);
        var ok = angs.every(function (b) { return Math.abs(wrapAngle((a - b) * DEG)) > 30 * DEG; });
        if (ok) angs.push(a);
      }
      // keep one window hiding behind another sometimes: no special case, randomness decides
      S.wins = S.wins.map(function (w, i) {
        var d = 1.1 + Math.random() * 1.6;
        return makeWin(w.key, angs[i] !== undefined ? angs[i] : w.ang / DEG, d, w.w, w.col);
      });
    }

    function resize() {
      var W = Math.max(280, Math.floor(el.clientWidth || 600));
      var mapH = Math.round(Math.min(420, Math.max(250, W * 0.62)));
      var H = mapH + 96;
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      S.W = W; S.H = H; S.mapH = mapH;
      draw();
    }

    function draw() {
      var W = S.W, H = S.H, mapH = S.mapH;
      var res = classify(S.wins, S.heading);
      // update memory with what is visible now
      if (mem.checked) {
        S.wins.forEach(function (w, i) {
          if (res[i].st === "view") S.memory[w.key] = { cx: w.cx, cy: w.cy, p0: w.p0.slice(), p1: w.p1.slice() };
        });
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      var sc = Math.min(W, mapH * 1.25) / 7.4, ox = W / 2, oy = mapH / 2 + 6;
      function P(x, y) { return [ox + x * sc, oy - y * sc]; }
      // grid circles
      ctx.strokeStyle = "#eee"; ctx.lineWidth = 1;
      [1, 2, 3].forEach(function (r) { ctx.beginPath(); ctx.arc(ox, oy, r * sc, 0, 2 * Math.PI); ctx.stroke(); });
      // fov wedge
      var R = 3.3;
      var a0 = S.heading - FOV / 2, a1 = S.heading + FOV / 2;
      ctx.beginPath(); ctx.moveTo(ox, oy);
      for (var k = 0; k <= 40; k++) {
        var a = a0 + (a1 - a0) * k / 40, d = dirOf(a), p = P(d[0] * R, d[1] * R);
        ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(148,103,189,0.13)"; ctx.fill();
      ctx.strokeStyle = "#9467bd"; ctx.lineWidth = 1.5; ctx.stroke();
      // sight rays
      ctx.strokeStyle = "rgba(148,103,189,0.35)"; ctx.lineWidth = 1;
      for (k = 0; k <= 30; k++) {
        a = a0 + (a1 - a0) * k / 30; d = dirOf(a);
        var n = nearest(S.wins, d), t = n ? Math.min(n.t, R) : R;
        p = P(d[0] * t, d[1] * t);
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(p[0], p[1]); ctx.stroke();
      }
      // memory markers
      var target = sel.value;
      if (mem.checked) {
        S.wins.forEach(function (w) {
          var m = S.memory[w.key];
          if (!m) return;
          var q0 = P(m.p0[0], m.p0[1]), q1 = P(m.p1[0], m.p1[1]);
          ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = w.col; ctx.globalAlpha = 0.45; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke(); ctx.restore();
        });
      }
      // windows
      var fs = Math.max(11, Math.min(14, W / 48));
      S.wins.forEach(function (w, i) {
        var q0 = P(w.p0[0], w.p0[1]), q1 = P(w.p1[0], w.p1[1]);
        if (w.key === target) {
          ctx.strokeStyle = "rgba(255,200,0,0.55)"; ctx.lineWidth = 16; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
        }
        ctx.strokeStyle = w.col; ctx.lineWidth = 7; ctx.lineCap = "butt";
        ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
        var dd = Math.hypot(w.cx, w.cy), lx = w.cx + w.cx / dd * 0.5, ly = w.cy + w.cy / dd * 0.5, lp = P(lx, ly);
        ctx.font = "bold " + fs + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(255,255,255,0.92)"; ctx.lineWidth = 4;
        ctx.strokeText(T.names[w.key], lp[0], lp[1] - fs * 0.6);
        ctx.fillStyle = w.col; ctx.fillText(T.names[w.key], lp[0], lp[1] - fs * 0.6);
        ctx.font = fs * 0.92 + "px sans-serif";
        ctx.strokeText("\u25cf " + T.st[res[i].st], lp[0], lp[1] + fs * 0.6);
        ctx.fillStyle = STCOL[res[i].st];
        ctx.fillText("\u25cf " + T.st[res[i].st], lp[0], lp[1] + fs * 0.6);
      });
      // user
      var hd = dirOf(S.heading), up = P(0, 0);
      ctx.fillStyle = "#9467bd";
      ctx.beginPath(); ctx.arc(up[0], up[1], 9, 0, 2 * Math.PI); ctx.fill();
      var tip = P(hd[0] * 0.33, hd[1] * 0.33), sd = dirOf(S.heading + Math.PI / 2);
      var b0 = P(hd[0] * 0.12 + sd[0] * 0.08, hd[1] * 0.12 + sd[1] * 0.08), b1 = P(hd[0] * 0.12 - sd[0] * 0.08, hd[1] * 0.12 - sd[1] * 0.08);
      ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.closePath(); ctx.fill();
      // fov label
      ctx.font = "12px sans-serif"; ctx.fillStyle = "#7a5aa8"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(T.fov + " 100\u00b0", 8, mapH - 22);
      ctx.fillStyle = "#555"; ctx.fillText("1 m", W - 50, mapH - 22);
      ctx.strokeStyle = "#555"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W - 58 - sc + 40, mapH - 8); ctx.lineTo(W - 18, mapH - 8); ctx.stroke();

      // the agent's view strip
      var sy = mapH + 22, sh = H - sy - 8, sx = 10, sw = W - 20;
      ctx.fillStyle = "#555"; ctx.font = "12px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      ctx.fillText(T.strip, sx, sy - 3);
      ctx.fillStyle = "#f4f2f7"; ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = "#ccc"; ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
      var cols = Math.max(60, Math.floor(sw / 3)), cw = sw / cols, spans = {};
      for (k = 0; k < cols; k++) {
        // left of the strip = left of the user
        var ang = S.heading + FOV / 2 - FOV * (k + 0.5) / cols;
        d = dirOf(ang);
        n = nearest(S.wins, d);
        if (!n) continue;
        var w = S.wins[n.i];
        var hpx = Math.min(sh - 6, sh * 0.9 / n.t);
        var shade = Math.max(0.35, Math.min(1, 1.3 / n.t));
        ctx.fillStyle = mix(w.col, shade);
        ctx.fillRect(sx + k * cw, sy + (sh - hpx) / 2, cw + 0.6, hpx);
        if (!spans[w.key]) spans[w.key] = [k, k]; else spans[w.key][1] = k;
      }
      ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff";
      Object.keys(spans).forEach(function (key) {
        var sp = spans[key];
        if ((sp[1] - sp[0] + 1) * cw < 34) return;
        ctx.fillText(T.names[key], sx + (sp[0] + sp[1] + 1) / 2 * cw, sy + sh / 2);
      });

      // status text
      var ti = -1;
      S.wins.forEach(function (w, i) { if (w.key === target) ti = i; });
      var r = res[ti], tw = S.wins[ti], msg, bg;
      var nm = T.names[target];
      if (r.st === "view") { msg = fmt(T.can, { w: nm }); bg = "#e6f4ea"; }
      else if (r.st === "partial") { msg = fmt(T.part, { w: nm }); bg = "#e3f4f7"; }
      else if (r.st === "occluded") {
        var on = r.occBy !== null ? T.names[S.wins[r.occBy].key] : "?";
        msg = fmt(T.occ, { w: nm, o: on }); bg = "#fdf0e0";
      } else {
        var m = mem.checked ? S.memory[target] : null;
        if (m) {
          var rel = wrapAngle(angleOf(m.cx, m.cy) - S.heading);
          var o = { w: nm, a: Math.round(Math.abs(rel) / DEG), s: rel > 0 ? T.left : T.right };
          var moved = Math.hypot(m.cx - tw.cx, m.cy - tw.cy) > 0.05;
          if (moved) { msg = fmt(T.stale, o); bg = "#fbe3e3"; }
          else { msg = fmt(T.recall, o); bg = "#e6eef9"; }
        } else { msg = fmt(T.search, { w: nm }); bg = "#fbe3e3"; }
      }
      status.textContent = msg;
      status.style.background = bg;
    }

    // interaction: horizontal drag turns the head
    var drag = null;
    cv.addEventListener("pointerdown", function (e) {
      drag = { x: e.clientX, h: S.heading, id: e.pointerId };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      cv.style.cursor = "grabbing";
    });
    cv.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      S.heading = wrapAngle(drag.h + (e.clientX - drag.x) * (1.6 * Math.PI / Math.max(300, S.W)));
      draw();
    });
    function end(e) { if (drag && e.pointerId === drag.id) { drag = null; cv.style.cursor = "grab"; } }
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    cv.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { S.heading = wrapAngle(S.heading + 10 * DEG); draw(); e.preventDefault(); }
      if (e.key === "ArrowRight") { S.heading = wrapAngle(S.heading - 10 * DEG); draw(); e.preventDefault(); }
    });
    sel.addEventListener("change", draw);
    mem.addEventListener("change", function () { if (!mem.checked) S.memory = {}; draw(); });
    bRe.addEventListener("click", function () { rearrange(); draw(); });
    bReset.addEventListener("click", function () { reset(); mem.checked = false; draw(); });

    reset();
    resize();
    if (window.ResizeObserver) {
      var lastW = 0;
      new ResizeObserver(function () { var w = el.clientWidth; if (Math.abs(w - lastW) > 2) { lastW = w; resize(); } }).observe(el);
    } else {
      window.addEventListener("resize", resize);
    }
  }

  function init() {
    var els = document.querySelectorAll('[data-widget="' + NAME + '"]');
    for (var i = 0; i < els.length; i++) build(els[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
