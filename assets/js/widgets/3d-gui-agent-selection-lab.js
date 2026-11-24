/* 3D GUI Agent post 03: selection lab.
   A small 3D room (perspective projection on Canvas 2D, no libraries) with buttons on panels at 0.45, 1, 2 and 4 m.
   The reader runs a block of trials with one of four techniques; the widget adds simulated noise:
   - hand ray: Ornstein-Uhlenbeck angular jitter (sigma 0.35 deg) around the hand, plus a 0.6 deg kick at the
     confirm (Heisenberg effect); positional error therefore grows with distance;
   - gaze + pinch: eye-tracking error of about 1 deg (a bias drawn per trial, sigma 0.7 deg per axis, plus 0.15 deg
     noise); the system highlights the button under the gaze, as on visionOS;
   - gaze + dwell: same gaze model; any button looked at for 450 ms fires (Midas touch);
   - direct touch: reach 0.65 m; 0.6 cm fingertip noise per axis; depth misjudgment grows with the change in depth
     from the previous target; far panels need a simulated step (0.8 s + 1 s per metre).
   Arm effort: 2-link arm, gravitational shoulder torque / 50 N m, Rohmert endurance E(f) = 1236.5/(f-15)^0.618 - 72.5 s,
   consumed endurance CE = sum(dt / E(f)). Toy parameters, see the post (section 4.1).
   Plain JS, ASCII only. */
(function () {
  "use strict";
  var NAME = "3d-gui-agent-selection-lab";
  var TXT = {
    en: {
      tech: ["Hand ray", "Gaze + pinch", "Gaze + dwell", "Direct touch"],
      start: "Start", again: "Restart",
      howMouse: "Hit the orange button. Mouse: move to aim, click to confirm.",
      howTouch: "Hit the orange button. Touch: hold to aim, slide, lift to confirm.",
      howDwell: "Dwell: look (aim) at a button for 450 ms and it fires, wanted or not.",
      sim: "Simulated: ray jitter 0.35\u00b0 + 0.6\u00b0 kick on confirm; gaze error ~1\u00b0; dwell 450 ms; touch reach 0.65 m, 1 cm finger noise, depth misjudgment; toy arm model.",
      idle: "Pick a technique and press Start.",
      trial: "trial", hits: "hits", errors: "errors", tp: "throughput", load: "arm load", ce: "CE",
      reach: "out of reach: step closer", stepped: "stepped closer", midas: "Midas touch!", miss: "miss", depth: "depth misjudged", timeout: "too slow (10 s)",
      done: "Block done. Try another technique and compare.",
      time: "time per target [s]", err: "errors", summary: "Your blocks", errRate: "error rate"
    },
    zh: {
      tech: ["\u624b\u90e8\u5c04\u7ebf", "\u6ce8\u89c6 + \u634f\u5408", "\u6ce8\u89c6 + \u9a7b\u7559", "\u76f4\u63a5\u89e6\u63a7"],
      start: "\u5f00\u59cb", again: "\u91cd\u65b0\u5f00\u59cb",
      howMouse: "\u70b9\u4e2d\u6a59\u8272\u6309\u94ae\u3002\u9f20\u6807\uff1a\u79fb\u52a8\u7784\u51c6\uff0c\u5355\u51fb\u786e\u8ba4\u3002",
      howTouch: "\u70b9\u4e2d\u6a59\u8272\u6309\u94ae\u3002\u89e6\u5c4f\uff1a\u6309\u4f4f\u7784\u51c6\u3001\u6ed1\u52a8\uff0c\u62ac\u8d77\u786e\u8ba4\u3002",
      howDwell: "\u9a7b\u7559\uff1a\u6ce8\u89c6\uff08\u7784\u51c6\uff09\u67d0\u4e2a\u6309\u94ae 450 ms \u5c31\u4f1a\u89e6\u53d1\uff0c\u4e0d\u7ba1\u4f60\u662f\u5426\u60f3\u8981\u3002",
      sim: "\u6a21\u62df\uff1a\u5c04\u7ebf\u6296\u52a8 0.35\u00b0 + \u786e\u8ba4\u65f6 0.6\u00b0 \u504f\u79fb\uff1b\u6ce8\u89c6\u8bef\u5dee\u7ea6 1\u00b0\uff1b\u9a7b\u7559 450 ms\uff1b\u89e6\u63a7\u53ef\u53ca 0.65 m\u3001\u624b\u6307\u566a\u58f0 1 cm\u3001\u6df1\u5ea6\u8bef\u5224\uff1b\u7b80\u5316\u624b\u81c2\u6a21\u578b\u3002",
      idle: "\u9009\u62e9\u4e00\u79cd\u6280\u672f\uff0c\u7136\u540e\u6309\u201c\u5f00\u59cb\u201d\u3002",
      trial: "\u8bd5\u6b21", hits: "\u547d\u4e2d", errors: "\u9519\u8bef", tp: "\u541e\u5410\u91cf", load: "\u624b\u81c2\u8d1f\u8377", ce: "CE",
      reach: "\u591f\u4e0d\u5230\uff1a\u8d70\u8fd1\u4e00\u4e9b", stepped: "\u5df2\u8d70\u8fd1", midas: "\u70b9\u77f3\u6210\u91d1\uff01", miss: "\u672a\u547d\u4e2d", depth: "\u6df1\u5ea6\u8bef\u5224", timeout: "\u8d85\u65f6\uff0810 s\uff09",
      done: "\u672c\u7ec4\u5b8c\u6210\u3002\u6362\u4e00\u79cd\u6280\u672f\u6bd4\u8f83\u4e00\u4e0b\u3002",
      time: "\u5404\u76ee\u6807\u7528\u65f6 [s]", err: "\u9519\u8bef", summary: "\u4f60\u7684\u5404\u7ec4\u7ed3\u679c", errRate: "\u9519\u8bef\u7387"
    },
    ja: {
      tech: ["\u30cf\u30f3\u30c9\u30ec\u30a4", "\u8996\u7dda + \u30d4\u30f3\u30c1", "\u8996\u7dda + \u30c9\u30a6\u30a7\u30eb", "\u76f4\u63a5\u30bf\u30c3\u30c1"],
      start: "\u958b\u59cb", again: "\u3082\u3046\u4e00\u5ea6",
      howMouse: "\u30aa\u30ec\u30f3\u30b8\u306e\u30dc\u30bf\u30f3\u3092\u62bc\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u30de\u30a6\u30b9\uff1a\u52d5\u304b\u3057\u3066\u72d9\u3044\u3001\u30af\u30ea\u30c3\u30af\u3067\u78ba\u5b9a\u3002",
      howTouch: "\u30aa\u30ec\u30f3\u30b8\u306e\u30dc\u30bf\u30f3\u3092\u62bc\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u30bf\u30c3\u30c1\uff1a\u62bc\u3057\u305f\u307e\u307e\u72d9\u3063\u3066\u6ed1\u3089\u305b\u3001\u96e2\u3057\u3066\u78ba\u5b9a\u3002",
      howDwell: "\u30c9\u30a6\u30a7\u30eb\uff1a\u30dc\u30bf\u30f3\u3092 450 ms \u898b\u308b\uff08\u72d9\u3046\uff09\u3068\u3001\u610f\u56f3\u306b\u95a2\u4fc2\u306a\u304f\u767a\u706b\u3057\u307e\u3059\u3002",
      sim: "\u30b7\u30df\u30e5\u30ec\u30fc\u30b7\u30e7\u30f3\uff1a\u30ec\u30a4\u306e\u63fa\u308c 0.35\u00b0 + \u78ba\u5b9a\u6642 0.6\u00b0 \u306e\u305a\u308c\uff1b\u8996\u7dda\u8aa4\u5dee \u7d04 1\u00b0\uff1b\u30c9\u30a6\u30a7\u30eb 450 ms\uff1b\u30bf\u30c3\u30c1\u306e\u5c4a\u304f\u7bc4\u56f2 0.65 m\u3001\u6307\u5148\u30ce\u30a4\u30ba 1 cm\u3001\u5965\u884c\u304d\u306e\u8aa4\u5224\u65ad\uff1b\u7c21\u6613\u8155\u30e2\u30c7\u30eb\u3002",
      idle: "\u624b\u6cd5\u3092\u9078\u3093\u3067\u300c\u958b\u59cb\u300d\u3092\u62bc\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
      trial: "\u8a66\u884c", hits: "\u6210\u529f", errors: "\u30a8\u30e9\u30fc", tp: "\u30b9\u30eb\u30fc\u30d7\u30c3\u30c8", load: "\u8155\u306e\u8ca0\u8377", ce: "CE",
      reach: "\u5c4a\u304b\u306a\u3044\uff1a\u8fd1\u3065\u304f", stepped: "\u8fd1\u3065\u3044\u305f", midas: "\u30df\u30c0\u30b9\u30bf\u30c3\u30c1\uff01", miss: "\u5916\u308c", depth: "\u5965\u884c\u304d\u3092\u8aa4\u5224\u65ad", timeout: "\u6642\u9593\u5207\u308c\uff0810 s\uff09",
      done: "\u30d6\u30ed\u30c3\u30af\u7d42\u4e86\u3002\u5225\u306e\u624b\u6cd5\u3067\u6bd4\u3079\u3066\u307f\u307e\u3057\u3087\u3046\u3002",
      time: "\u30bf\u30fc\u30b2\u30c3\u30c8\u3054\u3068\u306e\u6642\u9593 [s]", err: "\u30a8\u30e9\u30fc", summary: "\u3042\u306a\u305f\u306e\u30d6\u30ed\u30c3\u30af", errRate: "\u30a8\u30e9\u30fc\u7387"
    }
  };

  var DEG = Math.PI / 180;
  var REACH = 0.65, DWELL = 0.45, TRIALS_PER_TARGET = 2;
  // panels: centre (x, y) in metres at depth d (eye at the origin, looking down -z), size w x h; buttons: offset and size
  var PANELS = [
    { d: 0.45, x: -0.08, y: -0.06, w: 0.18, h: 0.12, btn: [[-0.05, 0.015, 0.04], [0.02, 0.02, 0.02], [0.05, -0.03, 0.03]] },
    { d: 1.0, x: 0.17, y: -0.08, w: 0.3, h: 0.18, btn: [[-0.07, 0.03, 0.05], [0.08, -0.04, 0.025]] },
    { d: 2.0, x: -0.42, y: 0.2, w: 0.6, h: 0.36, btn: [[-0.15, 0.05, 0.08], [0.15, -0.07, 0.035]] },
    { d: 4.0, x: 0.7, y: 0.45, w: 1.1, h: 0.6, btn: [[-0.25, 0.08, 0.14], [0.28, -0.12, 0.05]] }
  ];
  var BUTTONS = [];
  PANELS.forEach(function (p, pi) {
    p.btn.forEach(function (b) {
      BUTTONS.push({ panel: pi, x: p.x + b[0], y: p.y + b[1], z: -p.d, s: b[2], ang: 2 * Math.atan(b[2] / 2 / p.d) / DEG });
    });
  });

  // ---- arm model (same as the post's figure script) ----
  var Gr = 9.81, MASS = 70, L1 = 0.30, L2 = 0.35, TMAX = 50, M1 = 0.028 * MASS, M2 = 0.022 * MASS, R1 = 0.436, R2 = 0.682;
  function shoulderLoad(hx, hz) {
    var d = Math.min(Math.max(Math.hypot(hx, hz), 1e-6), L1 + L2 - 1e-6);
    var c2 = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    var q2 = Math.acos(Math.max(-1, Math.min(1, c2)));
    var q1 = Math.atan2(hz, hx) + Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
    var ex = L1 * Math.cos(q1);
    var hxx = ex + L2 * Math.cos(q1 - q2);
    var c1x = R1 * ex, c2x = ex + R2 * (hxx - ex);
    return 100 * Gr * (M1 * Math.abs(c1x) + M2 * Math.abs(c2x)) / TMAX;
  }
  function endurance(f) { return f > 15 ? 1236.5 / Math.pow(f - 15, 0.618) - 72.5 : Infinity; }

  function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function norm(v) { var n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; }
  function toAngles(d) { return [Math.atan2(d[0], -d[2]), Math.atan2(d[1], Math.hypot(d[0], d[2]))]; }
  function fromAngles(yaw, pitch) { return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]; }
  function perturb(d, ax, ay) { var a = toAngles(d); return fromAngles(a[0] + ax, a[1] + ay); }

  // cast a ray (origin o, direction u) against the panels; nearest panel wins (occlusion)
  function cast(o, u) {
    var best = null;
    for (var i = 0; i < PANELS.length; i++) {
      var p = PANELS[i];
      if (u[2] >= -1e-9) continue;
      var t = (-p.d - o[2]) / u[2];
      if (t <= 0) continue;
      var x = o[0] + u[0] * t, y = o[1] + u[1] * t;
      if (Math.abs(x - p.x) <= p.w / 2 && Math.abs(y - p.y) <= p.h / 2 && (!best || t < best.t)) best = { t: t, panel: i, x: x, y: y, z: -p.d };
    }
    if (best) best.button = buttonAt(best.panel, best.x, best.y);
    return best;
  }
  function buttonAt(pi, x, y) {
    for (var k = 0; k < BUTTONS.length; k++) {
      var b = BUTTONS[k];
      if (b.panel === pi && Math.abs(x - b.x) <= b.s / 2 && Math.abs(y - b.y) <= b.s / 2) return k;
    }
    return -1;
  }

  function el(tag, css, parent) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (parent) parent.appendChild(n);
    return n;
  }

  function init(root) {
    var T = TXT[root.dataset.lang] || TXT.en;
    root.style.background = "#fafafa";
    root.style.minHeight = "0";
    root.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', sans-serif";
    root.style.color = "#222";
    var bar = el("div", "display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;font-size:14px;border-bottom:1px solid #e3e3e3;background:#fff;", root);
    var techBtns = T.tech.map(function (name, i) {
      var b = el("button", "padding:4px 10px;border:1px solid #bbb;border-radius:14px;background:#f3f3f3;cursor:pointer;font-size:13px;", bar);
      b.textContent = name;
      b.addEventListener("click", function () { if (state !== "running") { tech = i; refreshButtons(); setHelp(); draw(); } });
      return b;
    });
    var startBtn = el("button", "margin-left:auto;padding:4px 14px;border:1px solid #a04d00;border-radius:5px;background:#ff7f0e;color:#fff;cursor:pointer;font-size:14px;font-weight:600;", bar);
    startBtn.textContent = T.start;
    var help = el("div", "padding:5px 10px 0 10px;font-size:13px;color:#333;", root);
    var sim = el("div", "padding:2px 10px 5px 10px;font-size:11.5px;color:#666;", root);
    sim.textContent = T.sim;
    var canvas = el("canvas", "display:block;width:100%;touch-action:none;cursor:crosshair;", root);
    var stats = el("div", "padding:6px 10px;font-size:13px;font-variant-numeric:tabular-nums;border-top:1px solid #e3e3e3;background:#fff;", root);
    var chart = el("canvas", "display:block;width:100%;", root);
    var summary = el("div", "padding:4px 10px 8px 10px;font-size:12.5px;color:#333;font-variant-numeric:tabular-nums;background:#fff;", root);

    var tech = 1, state = "idle", touchMode = false;
    var W = 0, H = 0, CH = 0, dpr = 1, f = 1, cx = 0, cy = 0;
    var aimPx = null, aiming = false;
    var seq = [], ti = 0, tStart = 0, records = [], prevDir = [0, 0, -1], prevDepth = 0.45;
    var jit = [0, 0], gazeBias = [0, 0], gazeNoise = [0, 0];
    var hoverBtn = -1, hoverT = 0, dwellLock = -1;
    var flash = null, msg = "", msgT = 0, extraTime = 0;
    var ce = 0, loadSum = 0, loadT = 0, curLoad = 0;
    var results = [];
    var visible = true, last = performance.now();

    function refreshButtons() {
      techBtns.forEach(function (b, i) {
        b.style.background = i === tech ? "#9467bd" : "#f3f3f3";
        b.style.color = i === tech ? "#fff" : "#222";
        b.style.borderColor = i === tech ? "#6d4a91" : "#bbb";
        b.disabled = state === "running" && i !== tech;
        b.style.opacity = b.disabled ? "0.5" : "1";
      });
      startBtn.textContent = state === "idle" ? T.start : T.again;
    }
    function setHelp() { help.textContent = (tech === 2 ? T.howDwell + " " : "") + (touchMode ? T.howTouch : T.howMouse); }

    function resize() {
      dpr = window.devicePixelRatio || 1;
      W = root.clientWidth || 600;
      H = Math.round(Math.max(280, Math.min(400, W * 0.6)));
      CH = W < 500 ? 150 : 165;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = H + "px";
      chart.width = Math.round(W * dpr); chart.height = Math.round(CH * dpr); chart.style.height = CH + "px";
      cx = W / 2; cy = H * 0.5;
      f = Math.min((W / 2) / Math.tan(23 * DEG), (H / 2) / Math.tan(16 * DEG));
      draw(); drawChart();
    }

    function proj(p) { return [cx + f * p[0] / -p[2], cy - f * p[1] / -p[2]]; }
    function pxDir(px, py) { return norm([(px - cx) / f, -(py - cy) / f, -1]); }
    var HAND = [0.16, -0.3, -0.25];

    // where the simulated input actually points this frame
    function cursor() {
      if (!aimPx) return null;
      var d = pxDir(aimPx[0], aimPx[1]);
      if (tech === 0) {
        var eh = cast([0, 0, 0], d);
        var P = eh ? [eh.x, eh.y, eh.z] : [d[0] * 3, d[1] * 3, d[2] * 3];
        var u = perturb(norm([P[0] - HAND[0], P[1] - HAND[1], P[2] - HAND[2]]), jit[0], jit[1]);
        var h = cast(HAND, u);
        return { o: HAND, u: u, hit: h };
      }
      if (tech === 1 || tech === 2) {
        var g = perturb(d, gazeBias[0] + gazeNoise[0], gazeBias[1] + gazeNoise[1]);
        return { o: [0, 0, 0], u: g, hit: cast([0, 0, 0], g) };
      }
      var e = cast([0, 0, 0], d);
      return { o: [0, 0, 0], u: d, hit: e, touch: true };
    }

    function armLoad(c) {
      if (tech === 1 || tech === 2) return shoulderLoad(0.06, -0.62);
      if (tech === 0) {
        var a = toAngles(c ? c.u : [0, 0, -1]);
        return shoulderLoad(0.33, Math.max(-0.3, Math.min(0.3, -0.12 + 0.35 * Math.sin(a[1]))));
      }
      if (c && c.hit && PANELS[c.hit.panel].d <= REACH) return shoulderLoad(Math.min(PANELS[c.hit.panel].d - 0.05, 0.62), c.hit.y + 0.25);
      return shoulderLoad(0.45, -0.1);
    }

    function newTrialNoise() {
      gazeBias = [0.7 * DEG * gauss(), 0.7 * DEG * gauss()];
      extraTime = 0;
    }

    function start() {
      seq = [];
      for (var r = 0; r < TRIALS_PER_TARGET; r++) for (var k = 0; k < BUTTONS.length; k++) seq.push(k);
      for (var i = seq.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = seq[i]; seq[i] = seq[j]; seq[j] = t; }
      for (i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) { var s2 = (i + 1) % seq.length; t = seq[i]; seq[i] = seq[s2]; seq[s2] = t; }
      ti = 0; records = []; ce = 0; loadSum = 0; loadT = 0; prevDir = [0, 0, -1]; prevDepth = 0.45;
      dwellLock = hoverBtn; hoverT = 0; msg = ""; msgT = 0; flash = null;
      state = "running"; newTrialNoise(); tStart = performance.now();
      refreshButtons(); draw(); drawChart();
    }

    function finishTrial(hit, kind, btn) {
      var tgt = BUTTONS[seq[ti]];
      var mt = (performance.now() - tStart) / 1000 + extraTime;
      var dir = norm([tgt.x, tgt.y, tgt.z]);
      var alpha = Math.acos(Math.max(-1, Math.min(1, dir[0] * prevDir[0] + dir[1] * prevDir[1] + dir[2] * prevDir[2]))) / DEG;
      var id = Math.log(alpha / tgt.ang + 1) / Math.LN2;
      records.push({ k: seq[ti], hit: hit, mt: mt, id: id });
      flash = { k: btn >= 0 ? btn : seq[ti], ok: hit, t: 0.35 };
      if (!hit) { msg = kind; msgT = 1.2; }
      prevDir = dir; prevDepth = -tgt.z;
      ti++;
      if (ti >= seq.length) { state = "done"; storeResult(); refreshButtons(); msg = T.done; msgT = 1e9; }
      else { newTrialNoise(); tStart = performance.now(); }
      drawChart();
    }

    function confirm() {
      if (state !== "running" || tech === 2) return;
      var c = cursor();
      if (!c) return;
      var target = seq[ti];
      if (tech === 0) {
        var ang = 2 * Math.PI * Math.random(), kick = Math.abs(gauss()) * 0.6 * DEG;
        var u = perturb(c.u, kick * Math.cos(ang), kick * Math.sin(ang));
        var h = cast(HAND, u);
        var b = h ? h.button : -1;
        finishTrial(b === target, T.miss, b);
        return;
      }
      if (tech === 1) { b = c.hit ? c.hit.button : -1; finishTrial(b === target, T.miss, b); return; }
      // direct touch
      if (!c.hit) { finishTrial(false, T.miss, -1); return; }
      var p = PANELS[c.hit.panel], sd;
      if (p.d > REACH) { extraTime += 0.8 + 1.0 * (p.d - 0.5); sd = 1.0; msg = T.stepped + " (+" + (0.8 + p.d - 0.5).toFixed(1) + " s)"; msgT = 1.2; }
      else sd = 0.6 + 0.04 * Math.abs(p.d - prevDepth) * 100;
      var x = c.hit.x + 0.006 * gauss(), y = c.hit.y + 0.006 * gauss();
      b = buttonAt(c.hit.panel, x, y);
      var depthErr = Math.abs(sd * gauss());
      if (b === target && depthErr > 1.5) { finishTrial(false, T.depth, b); return; }
      finishTrial(b === target, T.miss, b);
    }

    function storeResult() {
      var hits = records.filter(function (r) { return r.hit; });
      var tp = hits.length ? hits.reduce(function (s, r) { return s + r.id / r.mt; }, 0) / hits.length : 0;
      var res = { tech: tech, tp: tp, err: 1 - hits.length / records.length, ce: ce, load: loadT ? loadSum / loadT : 0,
        mt: records.reduce(function (s, r) { return s + r.mt; }, 0) / records.length };
      results = results.filter(function (r) { return r.tech !== tech; });
      results.push(res);
      results.sort(function (a, b) { return a.tech - b.tech; });
      updateStats();
      summary.innerHTML = "<b>" + T.summary + "</b>: " + results.map(function (r) {
        return T.tech[r.tech] + " \u2014 " + T.tp + " " + r.tp.toFixed(2) + " bit/s, " + T.errRate + " " + Math.round(100 * r.err) + "%, " +
          T.load + " " + Math.round(r.load) + "%, CE " + r.ce.toFixed(1) + "%";
      }).join(" \u00b7 ");
    }

    function tick(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (visible) {
        // noise processes (Ornstein-Uhlenbeck)
        var tau = 0.25, s = 0.35 * DEG;
        for (var a = 0; a < 2; a++) {
          jit[a] += -jit[a] * dt / tau + s * Math.sqrt(2 * dt / tau) * gauss();
          gazeNoise[a] += -gazeNoise[a] * dt / 0.1 + 0.15 * DEG * Math.sqrt(2 * dt / 0.1) * gauss();
        }
        var c = cursor();
        curLoad = armLoad(c);
        if (state === "running" && (now - tStart) / 1000 + extraTime > 10) finishTrial(false, T.timeout, -1);
        if (state === "running") {
          ce += 100 * dt / endurance(curLoad);
          loadSum += curLoad * dt; loadT += dt;
          if (tech === 2) {
            var hb = c && c.hit ? c.hit.button : -1;
            if (hb !== hoverBtn) { hoverBtn = hb; hoverT = 0; if (hb !== dwellLock) dwellLock = -1; }
            else if (hb >= 0 && hb !== dwellLock) {
              hoverT += dt;
              if (hoverT >= DWELL) { dwellLock = hb; hoverT = 0; finishTrial(hb === seq[ti], T.midas, hb); }
            }
          }
        } else if (c && c.hit) { hoverBtn = c.hit.button; } else hoverBtn = -1;
        if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; }
        if (msgT < 1e8) msgT -= dt;
        draw();
        if (state === "running") updateStats();
      }
      window.requestAnimationFrame(tick);
    }

    function updateStats() {
      var hits = records.filter(function (r) { return r.hit; });
      var tp = hits.length ? hits.reduce(function (s, r) { return s + r.id / r.mt; }, 0) / hits.length : 0;
      stats.textContent = T.trial + " " + Math.min(ti + 1, seq.length) + "/" + seq.length + " \u00b7 " + T.hits + " " + hits.length +
        " \u00b7 " + T.errors + " " + (records.length - hits.length) + " \u00b7 " + T.tp + " " + tp.toFixed(2) + " bit/s \u00b7 " +
        T.load + " " + Math.round(curLoad) + "% \u00b7 " + T.ce + " " + ce.toFixed(2) + "%";
    }

    function rrect(g, x, y, w, h, r) {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }

    function draw() {
      var g = canvas.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      var sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#eef1f6"); sky.addColorStop(1, "#dfe3ea");
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      // floor grid 1.2 m below the eyes, for depth cues
      g.strokeStyle = "rgba(120,130,150,0.35)"; g.lineWidth = 1;
      for (var z = 3; z <= 14.01; z += 1) {
        var a = proj([-8, -1.2, -z]), b = proj([8, -1.2, -z]);
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
      for (var x = -8; x <= 8.01; x += 1) {
        a = proj([x, -1.2, -3]); b = proj([x, -1.2, -14]);
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
      // panels, far to near
      var order = [3, 2, 1, 0];
      var c = cursor();
      order.forEach(function (pi) {
        var p = PANELS[pi];
        var tl = proj([p.x - p.w / 2, p.y + p.h / 2, -p.d]), br = proj([p.x + p.w / 2, p.y - p.h / 2, -p.d]);
        var shade = 255 - Math.round(30 / p.d);
        g.fillStyle = "rgba(" + shade + "," + shade + "," + (shade + 0) + ",0.93)";
        rrect(g, tl[0], tl[1], br[0] - tl[0], br[1] - tl[1], Math.max(3, (br[0] - tl[0]) * 0.05)); g.fill();
        g.strokeStyle = tech === 3 && p.d <= REACH ? "#2ca02c" : "#9aa3b2"; g.lineWidth = tech === 3 && p.d <= REACH ? 2.5 : 1.2; g.stroke();
        g.fillStyle = "#555"; g.font = Math.max(10, Math.min(13, (br[0] - tl[0]) * 0.12)) + "px sans-serif";
        g.fillText(p.d + " m", tl[0] + 4, tl[1] + Math.max(11, Math.min(14, (br[1] - tl[1]) * 0.22)));
        BUTTONS.forEach(function (bt, k) {
          if (bt.panel !== pi) return;
          var q0 = proj([bt.x - bt.s / 2, bt.y + bt.s / 2, bt.z]), q1 = proj([bt.x + bt.s / 2, bt.y - bt.s / 2, bt.z]);
          var isT = state === "running" && seq[ti] === k;
          g.fillStyle = isT ? "#ff7f0e" : "#7f8ea6";
          if (flash && flash.k === k) g.fillStyle = flash.ok ? "#2ca02c" : "#d62728";
          rrect(g, q0[0], q0[1], q1[0] - q0[0], q1[1] - q0[1], Math.max(1.5, (q1[0] - q0[0]) * 0.2)); g.fill();
          if ((tech === 1 || tech === 2) && hoverBtn === k) { g.lineWidth = 3; g.strokeStyle = "#ffffff"; g.stroke(); g.lineWidth = 1.5; g.strokeStyle = "#9467bd"; g.stroke(); }
          if (tech === 2 && state === "running" && hoverBtn === k && dwellLock !== k) {
            var m = [(q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2], rr = Math.max(8, (q1[0] - q0[0]) * 0.9);
            g.beginPath(); g.arc(m[0], m[1], rr, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * Math.min(1, hoverT / DWELL));
            g.strokeStyle = "#9467bd"; g.lineWidth = 3; g.stroke();
          }
        });
      });
      // input visualization
      if (c) {
        if (tech === 0) {
          var h0 = proj(c.o), end = c.hit ? [c.hit.x, c.hit.y, c.hit.z] : [c.o[0] + c.u[0] * 6, c.o[1] + c.u[1] * 6, c.o[2] + c.u[2] * 6];
          var e = proj(end);
          g.strokeStyle = "rgba(214,39,40,0.8)"; g.lineWidth = 2; g.beginPath(); g.moveTo(h0[0], h0[1]); g.lineTo(e[0], e[1]); g.stroke();
          g.fillStyle = "#d62728"; g.beginPath(); g.arc(e[0], e[1], 3.5, 0, 2 * Math.PI); g.fill();
          g.fillStyle = "#c9a68a"; g.beginPath(); g.arc(h0[0], h0[1], 12, 0, 2 * Math.PI); g.fill();
        } else if (tech === 1 || tech === 2) {
          var gp = c.hit ? proj([c.hit.x, c.hit.y, c.hit.z]) : proj([c.u[0] * 3, c.u[1] * 3, c.u[2] * 3]);
          g.strokeStyle = "rgba(148,103,189,0.5)"; g.lineWidth = 1.5; g.beginPath(); g.arc(gp[0], gp[1], 6, 0, 2 * Math.PI); g.stroke();
        } else {
          if (c.hit && PANELS[c.hit.panel].d <= REACH) {
            var fp = proj([c.hit.x, c.hit.y, c.hit.z]);
            g.fillStyle = "rgba(201,166,138,0.95)"; g.beginPath(); g.arc(fp[0], fp[1], 7, 0, 2 * Math.PI); g.fill();
            g.strokeStyle = "#8a5a3c"; g.lineWidth = 1.5; g.stroke();
          } else if (aimPx) {
            g.fillStyle = "#a04d00"; g.font = "12px sans-serif"; g.fillText(T.reach, aimPx[0] + 10, aimPx[1] - 8);
          }
        }
        if (aimPx && tech !== 3) { g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1; g.beginPath(); g.moveTo(aimPx[0] - 6, aimPx[1]); g.lineTo(aimPx[0] + 6, aimPx[1]); g.moveTo(aimPx[0], aimPx[1] - 6); g.lineTo(aimPx[0], aimPx[1] + 6); g.stroke(); }
      }
      // arm-load gauge
      var gx = W - 118, gy = H - 22;
      g.fillStyle = "rgba(255,255,255,0.85)"; g.fillRect(gx - 6, gy - 16, 120, 32);
      g.fillStyle = "#333"; g.font = "11px sans-serif"; g.fillText(T.load + " " + Math.round(curLoad) + "%", gx, gy - 4);
      g.fillStyle = "#ddd"; g.fillRect(gx, gy, 100, 7);
      g.fillStyle = curLoad > 15 ? "#d62728" : "#2ca02c"; g.fillRect(gx, gy, Math.min(100, curLoad * 2.5), 7);
      g.fillStyle = "#333"; g.fillRect(gx + 15 * 2.5, gy - 2, 1.5, 11);
      if (state !== "running" && msgT > 1e8) { g.fillStyle = "#333"; g.font = "13px sans-serif"; g.fillText(T.done, 10, H - 12); }
      else if (state === "idle") { g.fillStyle = "#333"; g.font = "13px sans-serif"; g.fillText(T.idle, 10, H - 12); }
      else if (msgT > 0 && msg) { g.fillStyle = "#d62728"; g.font = "bold 14px sans-serif"; g.fillText(msg, 10, H - 12); }
    }

    function drawChart() {
      var g = chart.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#fff"; g.fillRect(0, 0, W, CH);
      var left = 34, right = 16, top = 18, bottom = 38, n = BUTTONS.length;
      var pw = W - left - right, ph = CH - top - bottom, bw = pw / n;
      var mt = [], er = [], ct = [];
      for (var k = 0; k < n; k++) { mt.push(0); er.push(0); ct.push(0); }
      records.forEach(function (r) { mt[r.k] += r.mt; ct[r.k]++; if (!r.hit) er[r.k]++; });
      var ymax = 2;
      for (k = 0; k < n; k++) if (ct[k]) ymax = Math.max(ymax, Math.ceil(mt[k] / ct[k]));
      g.strokeStyle = "#e6e6e6"; g.fillStyle = "#666"; g.font = "10px sans-serif"; g.lineWidth = 1;
      for (var v = 0; v <= ymax; v += Math.max(1, Math.round(ymax / 4))) {
        var yy = top + ph - ph * v / ymax;
        g.beginPath(); g.moveTo(left, yy); g.lineTo(W - right, yy); g.stroke(); g.fillText(String(v), 8, yy + 3);
      }
      g.fillStyle = "#333"; g.font = "11px sans-serif"; g.fillText(T.time + "   \u2716 = " + T.err, left, 12);
      for (k = 0; k < n; k++) {
        var b = BUTTONS[k], x0 = left + k * bw;
        if (ct[k]) {
          var hgt = ph * (mt[k] / ct[k]) / ymax;
          g.fillStyle = "#9467bd"; g.fillRect(x0 + bw * 0.18, top + ph - hgt, bw * 0.64, hgt);
        }
        for (var e = 0; e < er[k]; e++) { g.fillStyle = "#d62728"; g.font = "bold 11px sans-serif"; g.fillText("\u2716", x0 + bw * 0.38, top + ph - 4 - e * 12 - (ct[k] ? ph * (mt[k] / ct[k]) / ymax : 0)); }
        g.fillStyle = "#444"; g.font = (bw < 40 ? 9 : 10) + "px sans-serif";
        var l1 = PANELS[b.panel].d + "m", l2 = b.ang.toFixed(1) + "\u00b0";
        g.fillText(l1, x0 + bw / 2 - g.measureText(l1).width / 2, top + ph + 13);
        g.fillText(l2, x0 + bw / 2 - g.measureText(l2).width / 2, top + ph + 25);
      }
    }

    function setAim(ev) { var r = canvas.getBoundingClientRect(); aimPx = [ev.clientX - r.left, ev.clientY - r.top]; }
    canvas.addEventListener("pointermove", function (ev) {
      if (ev.pointerType === "mouse" || ev.pointerType === "pen" || aiming) setAim(ev);
    });
    canvas.addEventListener("pointerdown", function (ev) {
      if (ev.pointerType === "touch") {
        if (!touchMode) { touchMode = true; setHelp(); }
        aiming = true; setAim(ev);
        try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      } else { setAim(ev); confirm(); }
      ev.preventDefault();
    });
    canvas.addEventListener("pointerup", function (ev) {
      if (ev.pointerType === "touch") { setAim(ev); confirm(); aiming = false; if (tech !== 2) aimPx = null; }
    });
    canvas.addEventListener("pointercancel", function () { aiming = false; });
    canvas.addEventListener("pointerleave", function (ev) { if (ev.pointerType === "mouse") aimPx = null; });
    startBtn.addEventListener("click", start);

    // test hook: screen position of the current target (used by automated checks only)
    root.labTarget = function () { if (state !== "running") return null; var b = BUTTONS[seq[ti]]; var q = proj([b.x, b.y, b.z]); var r = canvas.getBoundingClientRect(); return [q[0] + r.left, q[1] + r.top]; };
    refreshButtons(); setHelp();
    stats.textContent = T.idle;
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(root);
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
    window.requestAnimationFrame(tick);
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-widget="' + NAME + '"]');
    for (var i = 0; i < nodes.length; i++) if (!nodes[i].dataset.ready) { nodes[i].dataset.ready = "1"; init(nodes[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
