/* Scene graph with local/world transforms and dirty-flag propagation (graphics-engine post 03).
 * Each node stores a local 2D rigid transform (translation t, angle) relative to its parent.
 * World = parentWorld * local. Moving or rotating a node marks its subtree dirty; the transform
 * system then recomputes only dirty nodes, parents first, exactly like transformSystem in the post.
 * Recomputed nodes flash orange. With dirty flags off, every update recomputes every node.
 */
(function () {
  "use strict";

  var TEXT = {
    en: {
      show: "Show transforms:", world: "World", local: "Local", rot: "Rotate", dirty: "Dirty flags",
      reset: "Reset", selected: "Selected", recomputed: "Recomputed in the last update",
      products: "nodes", nodes: "nodes",
      hint: "Drag a node to move it; select one and use the buttons to rotate it."
    },
    zh: {
      show: "\u{663e}\u{793a}\u{53d8}\u{6362}\u{ff1a}", world: "\u{4e16}\u{754c}", local: "\u{5c40}\u{90e8}", rot: "\u{65cb}\u{8f6c}",
      dirty: "\u{810f}\u{6807}\u{8bb0}", reset: "\u{91cd}\u{7f6e}", selected: "\u{9009}\u{4e2d}",
      recomputed: "\u{4e0a}\u{6b21}\u{66f4}\u{65b0}\u{91cd}\u{7b97}", products: "\u{4e2a}\u{8282}\u{70b9}",
      nodes: "\u{8282}\u{70b9}",
      hint: "\u{62d6}\u{52a8}\u{8282}\u{70b9}\u{6765}\u{79fb}\u{52a8}\u{5b83}\u{ff1b}\u{9009}\u{4e2d}\u{540e}\u{7528}\u{6309}\u{94ae}\u{65cb}\u{8f6c}\u{3002}"
    },
    ja: {
      show: "\u{5909}\u{63db}\u{3092}\u{8868}\u{793a}\u{ff1a}", world: "\u{30ef}\u{30fc}\u{30eb}\u{30c9}", local: "\u{30ed}\u{30fc}\u{30ab}\u{30eb}",
      rot: "\u{56de}\u{8ee2}", dirty: "\u{30c0}\u{30fc}\u{30c6}\u{30a3}\u{30d5}\u{30e9}\u{30b0}", reset: "\u{30ea}\u{30bb}\u{30c3}\u{30c8}",
      selected: "\u{9078}\u{629e}\u{4e2d}", recomputed: "\u{76f4}\u{524d}\u{306e}\u{66f4}\u{65b0}\u{3067}\u{518d}\u{8a08}\u{7b97}",
      products: "\u{30ce}\u{30fc}\u{30c9}", nodes: "\u{30ce}\u{30fc}\u{30c9}",
      hint: "\u{30ce}\u{30fc}\u{30c9}\u{3092}\u{30c9}\u{30e9}\u{30c3}\u{30b0}\u{3057}\u{3066}\u{79fb}\u{52d5}\u{3001}\u{9078}\u{629e}\u{3057}\u{3066}\u{30dc}\u{30bf}\u{30f3}\u{3067}\u{56de}\u{8ee2}\u{3057}\u{307e}\u{3059}\u{3002}"
    }
  };

  // name, parent, local tx, local ty, local angle (radians)
  var INIT = [
    ["base", -1, 0, -1.6, 0],
    ["torso", 0, 0, 1.4, 0],
    ["head", 1, 0, 1.5, 0],
    ["armL", 1, -1.3, 0.8, 0.5],
    ["handL", 3, -1.4, 0, 0.3],
    ["armR", 1, 1.3, 0.8, -0.5],
    ["handR", 5, 1.4, 0, -0.3],
    ["wheel", 0, 2.2, -0.3, 0]
  ];
  var FLASH_MS = 900;

  // 2D affine matrices as [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f
  function fromTR(tx, ty, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    return [c, s, -s, c, tx, ty];
  }
  function mul(P, L) {
    return [P[0] * L[0] + P[2] * L[1], P[1] * L[0] + P[3] * L[1],
            P[0] * L[2] + P[2] * L[3], P[1] * L[2] + P[3] * L[3],
            P[0] * L[4] + P[2] * L[5] + P[4], P[1] * L[4] + P[3] * L[5] + P[5]];
  }

  function setup(root) {
    var T = TEXT[root.dataset.lang] || TEXT.en;
    root.style.background = "#fbfbfd";
    root.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    root.style.color = "#222";
    root.innerHTML = "";

    function button(label, onClick) {
      var bt = document.createElement("button");
      bt.type = "button";
      bt.textContent = label;
      bt.style.cssText = "border:1px solid #9467bd;border-radius:14px;padding:3px 10px;font-size:13px;cursor:pointer;background:#fff;color:#5a3d85";
      bt.addEventListener("click", onClick);
      return bt;
    }
    var bar = document.createElement("div");
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px 0;font-size:14px";
    var lab = document.createElement("span");
    lab.textContent = T.show;
    bar.appendChild(lab);
    var mode = "world";
    var bWorld = button(T.world, function () { mode = "world"; draw(); });
    var bLocal = button(T.local, function () { mode = "local"; draw(); });
    bar.appendChild(bWorld); bar.appendChild(bLocal);
    var bm = button(T.rot + " \u{2212}15\u{b0}", function () { rotate(-Math.PI / 12); });
    var bp = button(T.rot + " +15\u{b0}", function () { rotate(Math.PI / 12); });
    bar.appendChild(bm); bar.appendChild(bp);
    var dl = document.createElement("label");
    dl.style.cssText = "display:inline-flex;align-items:center;gap:4px;margin-left:4px";
    var dc = document.createElement("input");
    dc.type = "checkbox"; dc.checked = true;
    dl.appendChild(dc); dl.appendChild(document.createTextNode(T.dirty));
    bar.appendChild(dl);
    bar.appendChild(button(T.reset, function () { init(); }));
    root.appendChild(bar);

    var canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;margin:0 auto;touch-action:none;cursor:grab";
    root.appendChild(canvas);
    var info = document.createElement("div");
    info.style.cssText = "padding:4px 10px 10px;font-size:13.5px;line-height:1.5;font-variant-numeric:tabular-nums";
    root.appendChild(info);
    var ctx = canvas.getContext("2d");

    var nodes = [], sel = 1, lastCount = 0, lastNames = [], W = 0, H = 0, s = 40, lastW = -1, drag = -1, anim = 0;

    function init() {
      nodes = INIT.map(function (r) {
        return { name: r[0], parent: r[1], t: [r[2], r[3]], ang: r[4], local: null, world: null,
                 dirty: true, children: [], flash: -1e9 };
      });
      nodes.forEach(function (n, i) { if (n.parent >= 0) nodes[n.parent].children.push(i); });
      sel = 1;
      update(false);
      lastCount = 0; lastNames = [];
      draw();
    }

    function markDirty(i) {
      if (!dc.checked) { nodes.forEach(function (n) { n.dirty = true; }); return; }
      var n = nodes[i];
      if (n.dirty) return; // invariant: a dirty node's subtree is already dirty
      n.dirty = true;
      n.children.forEach(markDirty);
    }

    // transformSystem: depth first from the roots, recompute dirty nodes only
    function update(flash) {
      var count = 0, names = [], now = performance.now();
      function visit(i, P) {
        var n = nodes[i];
        if (n.dirty) {
          n.local = fromTR(n.t[0], n.t[1], n.ang);
          n.world = P ? mul(P, n.local) : n.local.slice();
          n.dirty = false;
          count++; names.push(n.name);
          if (flash) n.flash = now;
        }
        n.children.forEach(function (c) { visit(c, n.world); });
      }
      nodes.forEach(function (n, i) { if (n.parent < 0) visit(i, null); });
      lastCount = count; lastNames = names;
      if (flash && !anim) anim = requestAnimationFrame(tick);
    }
    function tick() {
      anim = 0;
      draw();
      var now = performance.now();
      if (nodes.some(function (n) { return now - n.flash < FLASH_MS; })) anim = requestAnimationFrame(tick);
    }

    function rotate(da) {
      nodes[sel].ang += da;
      markDirty(sel);
      update(true);
      draw();
    }

    function resize() {
      var w = Math.max(280, root.clientWidth);
      if (w === lastW) return;
      lastW = w;
      W = w; H = Math.round(Math.min(420, Math.max(300, w * 0.62)));
      s = Math.min(W / 10.5, H / 7.2);
      var dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function X(x) { return W / 2 + x * s; }
    function Y(y) { return H / 2 - (y - 0.3) * s; }
    function toWorld(px, py) { return [(px - W / 2) / s, 0.3 - (py - H / 2) / s]; }

    function arrow(x0, y0, x1, y1, col, lw, dash) {
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
      ctx.setLineDash(dash || []);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.setLineDash([]);
      var a = Math.atan2(y1 - y0, x1 - x0), h = 8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - h * Math.cos(a - 0.4), y1 - h * Math.sin(a - 0.4));
      ctx.lineTo(x1 - h * Math.cos(a + 0.4), y1 - h * Math.sin(a + 0.4));
      ctx.closePath(); ctx.fill();
    }
    function axes(M, len, alpha) {
      var ox = X(M[4]), oy = Y(M[5]);
      arrow(ox, oy, X(M[4] + len * M[0]), Y(M[5] + len * M[1]), "rgba(214,39,40," + alpha + ")", 2);
      arrow(ox, oy, X(M[4] + len * M[2]), Y(M[5] + len * M[3]), "rgba(44,160,44," + alpha + ")", 2);
    }
    function deg(a) { return Math.round(a * 180 / Math.PI); }
    function f1(v) { return (v >= 0 ? "" : "\u{2212}") + Math.abs(v).toFixed(2); }

    function draw() {
      if (!W) return;
      [bWorld, bLocal].forEach(function (b, i) {
        var on = (i === 0) === (mode === "world");
        b.style.background = on ? "#9467bd" : "#fff";
        b.style.color = on ? "#fff" : "#5a3d85";
      });
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
      // world grid
      ctx.strokeStyle = "rgba(0,0,0,0.06)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gx = -6; gx <= 6; gx++) { ctx.moveTo(X(gx), 0); ctx.lineTo(X(gx), H); }
      for (var gy = -4; gy <= 5; gy++) { ctx.moveTo(0, Y(gy)); ctx.lineTo(W, Y(gy)); }
      ctx.stroke();
      axes([1, 0, 0, 1, 0, 0], 0.8, 0.45);
      ctx.fillStyle = "#888"; ctx.font = "12px system-ui, sans-serif";
      ctx.fillText("O", X(0) - 12, Y(0) + 14);
      // bones
      nodes.forEach(function (n) {
        if (n.parent < 0) return;
        var p = nodes[n.parent].world;
        ctx.strokeStyle = "#c9c9d6"; ctx.lineWidth = 7; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(X(p[4]), Y(p[5])); ctx.lineTo(X(n.world[4]), Y(n.world[5])); ctx.stroke();
      });
      ctx.lineCap = "butt";
      if (mode === "local") {
        // each node's local translation, drawn as an arrow in its parent's frame (from the parent origin)
        nodes.forEach(function (n, i) {
          var P = n.parent < 0 ? [1, 0, 0, 1, 0, 0] : nodes[n.parent].world;
          var hl = i === sel || n.parent === sel;
          arrow(X(P[4]), Y(P[5]), X(n.world[4]), Y(n.world[5]), hl ? "#9467bd" : "rgba(148,103,189,0.45)", hl ? 2.4 : 1.5, [5, 4]);
        });
        var S = nodes[sel], Pn = S.parent < 0 ? [1, 0, 0, 1, 0, 0] : nodes[S.parent].world;
        axes(Pn, 1.1, 1); // the frame in which the selected node's local numbers are expressed
      } else {
        nodes.forEach(function (n) { axes(n.world, 0.6, 0.9); });
      }
      // nodes
      var now = performance.now();
      nodes.forEach(function (n, i) {
        var k = Math.max(0, 1 - (now - n.flash) / FLASH_MS);
        var x = X(n.world[4]), y = Y(n.world[5]);
        ctx.beginPath(); ctx.arc(x, y, i === sel ? 12 : 10, 0, 2 * Math.PI);
        var base = i === sel ? [148, 103, 189] : [255, 255, 255];
        var col = base.map(function (b, j) { return Math.round(b * (1 - k) + [255, 127, 14][j] * k); });
        ctx.fillStyle = "rgb(" + col.join(",") + ")";
        ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = k > 0.05 ? "#d35400" : "#5a3d85"; ctx.stroke();
        ctx.fillStyle = "#222"; ctx.font = (i === sel ? "bold " : "") + "13px system-ui, sans-serif";
        ctx.fillText(n.name, x + 14, y - 8);
        if (W > 560 || i === sel) {
          ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = "#555";
          var txt = mode === "local"
            ? "t=(" + f1(n.t[0]) + ", " + f1(n.t[1]) + ") " + deg(n.ang) + "\u{b0}"
            : "(" + f1(n.world[4]) + ", " + f1(n.world[5]) + ") " + deg(Math.atan2(n.world[1], n.world[0])) + "\u{b0}";
          ctx.fillText(txt, x + 14, y + 7);
        }
      });
      var n = nodes[sel];
      info.innerHTML =
        "<b>" + T.selected + ": " + n.name + "</b> &nbsp; " +
        "L: t = (" + f1(n.t[0]) + ", " + f1(n.t[1]) + "), \u{3b8} = " + deg(n.ang) + "\u{b0} &nbsp; " +
        "W: (" + f1(n.world[4]) + ", " + f1(n.world[5]) + "), " + deg(Math.atan2(n.world[1], n.world[0])) + "\u{b0}<br>" +
        T.recomputed + ": <b style=\"color:#d35400\">" + lastCount + " / " + nodes.length + "</b> " + T.products +
        (lastNames.length ? " (" + lastNames.join(", ") + ")" : "") +
        "<br><span style=\"color:#777\">" + T.hint + "</span>";
    }

    function pick(e) {
      var rc = canvas.getBoundingClientRect();
      var px = e.clientX - rc.left, py = e.clientY - rc.top, best = -1, bd = 1e9;
      nodes.forEach(function (n, i) {
        var d = Math.hypot(X(n.world[4]) - px, Y(n.world[5]) - py);
        if (d < bd) { bd = d; best = i; }
      });
      return bd < 26 ? best : -1;
    }
    canvas.addEventListener("pointerdown", function (e) {
      var i = pick(e);
      if (i < 0) return;
      sel = i; drag = i;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
      draw();
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (drag < 0) return;
      var rc = canvas.getBoundingClientRect();
      var p = toWorld(e.clientX - rc.left, e.clientY - rc.top);
      p[0] = Math.max(-5, Math.min(5, p[0])); p[1] = Math.max(-3.2, Math.min(3.8, p[1]));
      var n = nodes[drag];
      var P = n.parent < 0 ? [1, 0, 0, 1, 0, 0] : nodes[n.parent].world;
      var dx = p[0] - P[4], dy = p[1] - P[5];
      // inverse of a rigid transform: transpose the rotation
      n.t = [P[0] * dx + P[1] * dy, P[2] * dx + P[3] * dy];
      markDirty(drag);
      update(true);
      draw();
    });
    function end() { drag = -1; canvas.style.cursor = "grab"; }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    init();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
  }

  function start() {
    document.querySelectorAll('[data-widget="graphics-engine-scene-graph"]').forEach(setup);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
