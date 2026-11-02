/* Research-frontiers explorer (graphics post 13).
   Rows = topics, columns = months of 2026 (venue month for conference papers, arXiv month for
   preprints; SIGGRAPH Asia 2026 papers sit in December). Colour = topic, shape = status:
   filled circle = published, ring = accepted / to appear, diamond = preprint.
   The data mirror bin/figures/graphics/data/13-frontiers.json. Localized UI strings come from the
   hidden element #fw-i18n in the post, and the summary of each work is the post's own paragraph
   #fw-<id>, so this file stays ASCII-only and the widget always shows the same text as the page. */
(function () {
  "use strict";
  var TOPICS = ["light", "neural", "geometry", "simulation", "animation", "imaging", "fabrication", "generative"];
  var TCOL = { light: "#f2b134", neural: "#9467bd", geometry: "#1f77b4", simulation: "#17becf",
               animation: "#d62728", imaging: "#e377c2", fabrication: "#8c564b", generative: "#2ca02c" };
  var DOT = " " + String.fromCharCode(183) + " ";   // middle dot, kept ASCII-only in the source
  var SCOL = { all: "#555555", published: "#2ca02c", accepted: "#1f77b4", preprint: "#ff7f0e" };
  var EN = {
    all: "All", topic: "Topic", status: "Status", published: "Published", accepted: "Accepted / to appear",
    preprint: "Preprint", hint: "Tap a dot or a title.", count: "{n} of {m} works", jump: "Go to this entry in the text",
    today: "today",
    t: { light: "Light", neural: "Neural repr.", geometry: "Geometry", simulation: "Simulation",
         animation: "Animation", imaging: "Displays", fabrication: "Fabrication", generative: "Generative" }
  };

  // id, topic, status, month, title, first author, venue, url
  var W = [
    ["lt-embedding", "light", "published", 7, "A Generalizable Light Transport 3D Embedding for Global Illumination", "Bing Xu", "SIGGRAPH 2026 Conference Papers", "https://arxiv.org/abs/2510.18189"],
    ["gaussian-lt", "light", "accepted", 12, "Gaussian Light Transport", "Patrick Attimont", "SIGGRAPH Asia 2026 (Conference Track)", "https://arxiv.org/abs/2609.11430"],
    ["restcv", "light", "published", 7, "Spatio-Temporal Control Variates with ReSTIR for Real-Time Rendering", "Zhong Shi", "SIGGRAPH 2026 Conference Papers", "https://doi.org/10.1145/3799902.3811113"],
    ["tof-restir", "light", "published", 7, "ToF ReSTIR: Time-of-Flight Rendering with Spatio-temporal Reservoir Resampling", "Juhyeon Kim", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://arxiv.org/abs/2605.11536"],
    ["prefiltered-nrc", "light", "preprint", 10, "Neural Caching of Prefiltered Radiance for Specular Lighting", "Dmitrii Klepikov", "arXiv preprint", "https://arxiv.org/abs/2610.11702"],
    ["hash-5d", "light", "preprint", 3, "Beyond Positional Encoding: A 5D Spatio-Directional Hash Encoding", "Philippe Weier", "arXiv preprint", "https://arxiv.org/abs/2603.05079"],
    ["gray", "neural", "published", 5, "GRay: Ray Tracing 3D Gaussians Near the Speed of Splats", "Yohan Poirier-Ginter", "I3D 2026 (PACMCGIT 9(1))", "https://arxiv.org/abs/2606.30869"],
    ["gps", "neural", "published", 7, "Gaussian Point Splatting", "Joris Rijsdijk", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://doi.org/10.1145/3811272"],
    ["line-primitives", "neural", "accepted", 12, "Inverse Rendering for Modeling with Line Primitives", "Kenji Tojo", "SIGGRAPH Asia 2026 (ACM TOG)", "https://arxiv.org/abs/2609.00625"],
    ["ntc-hyper", "neural", "published", 7, "Neural Texture Compression using Hypernetworks", "Laurent Belcour", "EGSR 2026", "https://arxiv.org/abs/2606.26913"],
    ["hybrid-brdf", "neural", "published", 7, "A Hybrid Neural-Microfacet BRDF Model for Real-Time Rendering", "Louis De Oliveira", "EGSR 2026 (CGF)", "https://arxiv.org/abs/2608.09604"],
    ["neumatex", "neural", "preprint", 6, "Extracting Neural Materials from Images", "Kim Youwang", "arXiv preprint", "https://arxiv.org/abs/2606.26715"],
    ["brepler", "geometry", "published", 7, "B-repLer: Language-guided Editing of CAD Models", "Yilin Liu", "SIGGRAPH 2026 Conference Papers", "https://arxiv.org/abs/2508.10201"],
    ["squadgen", "geometry", "published", 7, "SQuadGen: Generating Simple Quad Layouts via Chart Distance Fields", "Youkang Kong", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://arxiv.org/abs/2604.27329"],
    ["sand", "geometry", "published", 7, "SAND: Spatially Adaptive Network Depth for Fast Sampling of Neural Implicit Surfaces", "Chuanxiang Yang", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://arxiv.org/abs/2604.25936"],
    ["tori", "geometry", "published", 7, "Points as Tori: Fast Pointwise Signed Distance for Point Clouds", "Nicole Feng", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://doi.org/10.1145/3811385"],
    ["iskra", "geometry", "published", 7, "Iskra: A System for Inverse Geometry Processing", "Ana Dodik", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://arxiv.org/abs/2602.12105"],
    ["yasps", "simulation", "published", 7, "YASPS: A Symbolic Framework for Extensible, High-Performance IPC Simulation", "Xuan Tang", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://arxiv.org/abs/2605.23088"],
    ["mesh-ad", "simulation", "published", 7, "Locality-Aware Automatic Differentiation on the GPU for Mesh-Based Computations", "Ahmed H. Mahmoud", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://arxiv.org/abs/2509.00406"],
    ["diffsurflow", "simulation", "published", 7, "DiffSurFlow: Efficient and Robust Differentiable Fluid Optimization via Surrogate Strategy on Flow Map", "Yuhao Quan", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://doi.org/10.1145/3811337"],
    ["wrinkles", "simulation", "accepted", 12, "Learnable Persistent Wrinkle Formation in Cloth Simulation", "Deshan Gong", "SIGGRAPH Asia 2026", "https://arxiv.org/abs/2609.13707"],
    ["curly-hair", "simulation", "preprint", 7, "Curly Hair Simulation using Curly Finite Elements", "Xinming Pei", "arXiv preprint", "https://arxiv.org/abs/2607.22103"],
    ["mpm-lite", "simulation", "preprint", 2, "MPM Lite: Linear Kernels and Integration without Particles", "Xiang Feng", "arXiv preprint", "https://arxiv.org/abs/2602.07853"],
    ["ardy", "animation", "published", 7, "ARDY: Autoregressive Diffusion with Hybrid Representation for Interactive Human Motion Generation", "Kaifeng Zhao", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://arxiv.org/abs/2607.08741"],
    ["gpc", "animation", "published", 7, "GPC: Large-Scale Generative Pretraining for Transferable Motor Control", "Yi Shi", "SIGGRAPH 2026 Conference Papers", "https://arxiv.org/abs/2606.29148"],
    ["instantmimic", "animation", "accepted", 12, "InstantMimic: A High Performance System for Learning Physics-based Skills in Seconds", "Ikjun Choi", "SIGGRAPH Asia 2026 Conference Papers", "https://arxiv.org/abs/2609.09821"],
    ["retarget", "animation", "accepted", 12, "Skinned Motion Retargeting via Artifact-driven Kinematic Prior Refinement", "Seokhyeon Hong", "SIGGRAPH Asia 2026 (Journal Track)", "https://arxiv.org/abs/2609.06517"],
    ["drummer", "animation", "published", 7, "Generalized Audio-Driven Synthesis of Precise Drummer Motion", String.fromCharCode(193) + "lvaro G. I" + String.fromCharCode(241) + "esta", "SCA 2026 (Best Paper)", "https://arxiv.org/abs/2608.19055"],
    ["face-gesture", "animation", "published", 7, "Multi-View Face and Gesture Animation with Dynamic Gaussians", "Alireza Javanmardi", "SCA 2026 (CGF 45(8))", "https://arxiv.org/abs/2608.04722"],
    ["holopathtracer", "imaging", "published", 7, "HoloPathTracer: Fast and Accurate Wave Path Tracing for Holography", "Wenbin Zhou", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://arxiv.org/abs/2606.14173"],
    ["hoopoe", "imaging", "accepted", 12, "HoOPOE: A Holography-Optimized Perceptual ObjectivE function", "Ethan Chen", "SIGGRAPH Asia 2026", "https://arxiv.org/abs/2610.17474"],
    ["dichoptic", "imaging", "published", 7, "Dichoptic Foveation", "Henry Kam", "SIGGRAPH 2026 Conference Papers", "https://arxiv.org/abs/2609.16385"],
    ["pacolorholo", "imaging", "published", 3, "PAColorHolo: A Perceptually-Aware Color Management Framework for Holographic Displays", "Chun Chen", "ACM TOG 45(2)", "https://arxiv.org/abs/2601.14766"],
    ["hybrid-foveated", "imaging", "published", 3, "Hybrid Foveated Path Tracing with Peripheral Gaussians for Immersive Anatomy", "Constantin Kleinbeck", "IEEE VR 2026", "https://arxiv.org/abs/2601.22026"],
    ["atomslicer", "fabrication", "published", 7, "AtomSlicer: Constant-Thickness Field-Aligned Non-Planar Slicing and Continuous Toolpaths for FFF", "Giovanni Cocco", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://doi.org/10.1145/3811363"],
    ["powerknit", "fabrication", "published", 7, "Surface Power Diagrams for Knit Singularity Placement", "Rahul Mitra", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://rahulmitra.xyz/projects/powerknit/"],
    ["isogami", "fabrication", "published", 7, "IsoGami: Rigid-Deployable Kirigami Materials From Isohedral Tilings", "Guo Han", "SIGGRAPH 2026 Conference Papers", "https://thomaszewski.com/projects/isogami/index.html"],
    ["shellular", "fabrication", "published", 7, "Shellular Metamaterial Design via Compact Electric Potential Parametrization", "Tianyi Huang", "SIGGRAPH 2026 Conference Papers", "https://arxiv.org/abs/2511.04025"],
    ["sewing", "fabrication", "published", 7, "Learning Sewing Patterns via Latent Flow Matching of Implicit Fields", "Cong Cao", "SIGGRAPH 2026 Conference Papers", "https://arxiv.org/abs/2601.17740"],
    ["nexus", "generative", "published", 7, "Nexus: Native Mesh Generation with Diffusion", "Hanxiao Wang", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://arxiv.org/abs/2607.13563"],
    ["triposplat", "generative", "published", 7, "Generative 3D Gaussians with Learned Density Control", "Runjie Yan", "SIGGRAPH 2026 Conference Papers", "https://arxiv.org/abs/2605.16355"],
    ["caslayout", "generative", "published", 7, "CasLayout: Cascaded 3D Layout Diffusion for Indoor Scene Synthesis with Implicit Relation Modeling", "Yingrui Wu", "SIGGRAPH 2026 (ACM TOG 45(4))", "https://arxiv.org/abs/2604.27361"],
    ["simart", "generative", "published", 7, "SIMART: Decomposing Monolithic Meshes into Sim-ready Articulated Assets via MLLM", "Chuanrui Zhang", "SIGGRAPH 2026 Conference Papers", "https://arxiv.org/abs/2603.23386"],
    ["rdmesh", "generative", "published", 7, "R-DMesh: Video-Guided 3D Animation via Rectified Dynamic Mesh Flow", "Zijie Wu", "SIGGRAPH 2026 Conference Papers", "https://arxiv.org/abs/2605.13838"],
    ["gaussianimate", "generative", "accepted", 12, "GaussiAnimate: Rig Animatable Categories with Level of Dynamics", "Jiaxin Wang", "SIGGRAPH Asia 2026", "https://arxiv.org/abs/2604.08547"]
  ].map(function (a) {
    return { id: a[0], topic: a[1], status: a[2], month: a[3], title: a[4], first: a[5], venue: a[6], url: a[7] };
  });

  function byId(id) { for (var i = 0; i < W.length; i++) if (W[i].id === id) return W[i]; return null; }

  function strings() {
    var T = { t: {} }, k;
    for (k in EN) if (k !== "t") T[k] = EN[k];
    TOPICS.forEach(function (t) { T.t[t] = EN.t[t]; });
    var src = document.getElementById("fw-i18n");
    if (src) {
      ["all", "topic", "status", "published", "accepted", "preprint", "hint", "count", "jump", "today"].forEach(function (key) {
        var v = src.getAttribute("data-" + key); if (v) T[key] = v;
      });
      TOPICS.forEach(function (t) { var v = src.getAttribute("data-t-" + t); if (v) T.t[t] = v; });
    }
    return T;
  }

  function div(css) { var d = document.createElement("div"); d.style.cssText = css; return d; }

  function setup(el) {
    var T = strings();
    var st = { topic: "all", status: "all", sel: "gray" };
    el.innerHTML = "";
    el.style.background = "#fff"; el.style.color = "#222";
    el.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif"; el.style.fontSize = "14px";

    var ui = div("display:flex;flex-direction:column;gap:6px;padding:8px 10px 2px");
    el.appendChild(ui);
    var syncs = [];
    function chipRow(label, items, key) {
      var row = div("display:flex;flex-wrap:wrap;gap:4px;align-items:center");
      var s = document.createElement("span"); s.textContent = label; s.style.cssText = "color:#555;margin-right:4px";
      row.appendChild(s);
      var bs = items.map(function (it) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = it[1];
        b.style.cssText = "border:1px solid #bbb;border-radius:12px;padding:2px 9px;background:#fff;color:#222;" +
          "cursor:pointer;font:inherit;font-size:13px;line-height:1.5";
        b.addEventListener("click", function () { st[key] = it[0]; ensureSel(); refresh(); });
        row.appendChild(b);
        return [it[0], b, it[2]];
      });
      ui.appendChild(row);
      syncs.push(function () {
        bs.forEach(function (p) {
          var on = st[key] === p[0], c = p[2] || "#9467bd";
          p[1].style.background = on ? c : "#fff";
          p[1].style.color = on ? (c === "#f2b134" ? "#222" : "#fff") : "#222";
          p[1].style.borderColor = on ? c : "#bbb";
        });
      });
    }
    chipRow(T.topic, [["all", T.all, "#555555"]].concat(TOPICS.map(function (t) { return [t, T.t[t], TCOL[t]]; })), "topic");
    chipRow(T.status, [["all", T.all, SCOL.all], ["published", T.published, SCOL.published],
      ["accepted", T.accepted, SCOL.accepted], ["preprint", T.preprint, SCOL.preprint]], "status");

    var cv = document.createElement("canvas");
    cv.style.cssText = "display:block;width:100%;touch-action:manipulation;cursor:pointer;outline:none";
    cv.tabIndex = 0;
    el.appendChild(cv);
    var ctx = cv.getContext("2d");
    var info = div("padding:4px 12px 2px;font-size:13px;color:#555");
    var panel = div("margin:4px 10px;padding:8px 10px;border-left:4px solid #9467bd;background:#faf8fd;line-height:1.55;font-size:14px");
    var list = div("margin:6px 10px 10px;max-height:200px;overflow-y:auto;border-top:1px solid #eee;font-size:13px");
    el.appendChild(info); el.appendChild(panel); el.appendChild(list);

    var Wd = 0, H = 0, L = 0, R = 8, TOP = 8, rh = 40, cw = 1, narrow = false, pos = {};

    function visible(w) {
      return (st.topic === "all" || w.topic === st.topic) && (st.status === "all" || w.status === st.status);
    }
    function ensureSel() {
      var cur = byId(st.sel);
      if (!cur || !visible(cur)) { var f = W.filter(visible)[0]; st.sel = f ? f.id : null; }
    }

    function layout() {
      Wd = el.clientWidth || 600;
      narrow = Wd < 560;
      L = narrow ? 86 : 150;
      cw = (Wd - L - R) / 12;
      var r = narrow ? 4 : 6, step = 2 * r + (narrow ? 2 : 3);
      var per = Math.max(1, Math.floor((cw - 2) / step));
      var cells = {};
      W.forEach(function (w) { var k = w.topic + "|" + w.month; (cells[k] = cells[k] || []).push(w); });
      var lines = 1;
      Object.keys(cells).forEach(function (k) { lines = Math.max(lines, Math.ceil(cells[k].length / per)); });
      rh = Math.max(narrow ? 34 : 40, lines * step + 10);
      H = TOP + rh * TOPICS.length + 48;
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(Wd * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pos = {};
      Object.keys(cells).forEach(function (k) {
        var arr = cells[k], ti = TOPICS.indexOf(arr[0].topic), m = arr[0].month;
        var n = arr.length, nl = Math.ceil(n / per);
        arr.forEach(function (w, i) {
          var li = Math.floor(i / per), ci = i % per, inLine = Math.min(per, n - li * per);
          pos[w.id] = [L + (m - 0.5) * cw + (ci - (inLine - 1) / 2) * step,
                       TOP + (ti + 0.5) * rh + (li - (nl - 1) / 2) * step, r];
        });
      });
    }

    function shape(s, x, y, r, c, sel) {
      ctx.beginPath();
      if (s === "preprint") {
        var q = r * 1.3;
        ctx.moveTo(x, y - q); ctx.lineTo(x + q, y); ctx.lineTo(x, y + q); ctx.lineTo(x - q, y); ctx.closePath();
      } else ctx.arc(x, y, r, 0, 2 * Math.PI);
      if (s === "accepted") { ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = c; ctx.stroke(); }
      else { ctx.fillStyle = c; ctx.fill(); }
      if (sel) { ctx.beginPath(); ctx.arc(x, y, r + 4.5, 0, 2 * Math.PI); ctx.lineWidth = 2; ctx.strokeStyle = "#222"; ctx.stroke(); }
    }

    function draw() {
      var font = "system-ui, -apple-system, Segoe UI, sans-serif", gridH = rh * TOPICS.length;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, Wd, H);
      TOPICS.forEach(function (t, i) {
        var y = TOP + i * rh, on = st.topic === "all" || st.topic === t;
        if (i % 2 === 0) { ctx.fillStyle = "#f6f6f8"; ctx.fillRect(L, y, Wd - L - R, rh); }
        ctx.fillStyle = on ? TCOL[t] : "#dddddd"; ctx.fillRect(L - 5, y + 5, 3, rh - 10);
        ctx.fillStyle = on ? "#222" : "#aaa";
        ctx.font = (narrow ? "11px " : "13px ") + font; ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillText(T.t[t], L - 9, y + rh / 2, L - 12);
      });
      ctx.strokeStyle = "#e2e2e2"; ctx.lineWidth = 1;
      for (var m = 0; m <= 12; m++) {
        var gx = L + m * cw; ctx.beginPath(); ctx.moveTo(gx, TOP); ctx.lineTo(gx, TOP + gridH); ctx.stroke();
      }
      ctx.fillStyle = "#555"; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.font = "11px " + font;
      for (m = 1; m <= 12; m++) ctx.fillText(String(m), L + (m - 0.5) * cw, TOP + gridH + 4);
      ctx.textAlign = "right"; ctx.fillText("2026", L - 9, TOP + gridH + 4);
      var tx = L + (10 + 1 / 30) * cw;            // 2026-11-02
      ctx.strokeStyle = "#d62728"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(tx, TOP); ctx.lineTo(tx, TOP + gridH); ctx.stroke(); ctx.setLineDash([]);
      // legend
      var lx = 10, ly = TOP + gridH + 32;
      ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "11px " + font;
      ["published", "accepted", "preprint"].forEach(function (s) {
        shape(s, lx + 6, ly, 5, "#666", false); ctx.fillStyle = "#444"; ctx.fillText(T[s], lx + 15, ly);
        lx += 26 + ctx.measureText(T[s]).width;
      });
      ctx.strokeStyle = "#d62728"; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(lx, ly - 7); ctx.lineTo(lx, ly + 7); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = "#444"; ctx.fillText(T.today, lx + 6, ly);
      W.forEach(function (w) { if (!visible(w)) { var p = pos[w.id]; shape(w.status, p[0], p[1], p[2], "#d9d9d9", false); } });
      W.forEach(function (w) { if (visible(w)) { var p = pos[w.id]; shape(w.status, p[0], p[1], p[2], TCOL[w.topic], w.id === st.sel); } });
    }

    function showPanel() {
      var w = byId(st.sel);
      panel.innerHTML = "";
      if (!w) { panel.textContent = T.hint; return; }
      panel.style.borderLeftColor = TCOL[w.topic];
      var meta = div("font-size:12px;color:#555;margin-bottom:4px");
      meta.textContent = T.t[w.topic] + DOT + w.venue + DOT + T[w.status] + DOT + "2026-" + (w.month < 10 ? "0" : "") + w.month;
      panel.appendChild(meta);
      var src = document.getElementById("fw-" + w.id);
      if (src) {
        var body = document.createElement("div"); body.innerHTML = src.innerHTML; panel.appendChild(body);
        var a = document.createElement("a"); a.href = "#fw-" + w.id; a.textContent = T.jump + " " + String.fromCharCode(8595);
        a.style.cssText = "display:inline-block;margin-top:4px;font-size:12px";
        panel.appendChild(a);
      } else {
        var a2 = document.createElement("a"); a2.href = w.url; a2.target = "_blank"; a2.rel = "noopener"; a2.textContent = w.title;
        panel.appendChild(a2);
        var p = div(""); p.textContent = w.first + " et al."; panel.appendChild(p);
      }
    }

    function showList() {
      var vis = W.filter(visible);
      info.textContent = T.count.replace("{n}", vis.length).replace("{m}", W.length) + " " + DOT + " " + T.hint;
      list.innerHTML = "";
      vis.forEach(function (w) {
        var b = document.createElement("button"); b.type = "button";
        b.style.cssText = "display:flex;align-items:baseline;gap:6px;width:100%;text-align:left;border:0;border-bottom:1px solid #f0f0f0;" +
          "padding:5px 6px;cursor:pointer;font:inherit;color:#222;background:" + (w.id === st.sel ? "#f1ecfa" : "#fff");
        var dot = document.createElement("span");
        dot.style.cssText = "flex:none;width:9px;height:9px;border-radius:" + (w.status === "preprint" ? "1px" : "50%") +
          ";background:" + (w.status === "accepted" ? "#fff" : TCOL[w.topic]) + ";border:2px solid " + TCOL[w.topic];
        var tx = document.createElement("span"); tx.textContent = w.title + " (" + w.first + " et al.)";
        b.appendChild(dot); b.appendChild(tx);
        b.addEventListener("click", function () { st.sel = w.id; refresh(); });
        list.appendChild(b);
      });
    }

    function refresh() { syncs.forEach(function (f) { f(); }); draw(); showPanel(); showList(); }

    cv.addEventListener("pointerdown", function (e) {
      var b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, best = null, bd = 20 * 20;
      W.forEach(function (w) {
        if (!visible(w)) return;
        var p = pos[w.id], d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
        if (d < bd) { bd = d; best = w; }
      });
      if (best) { st.sel = best.id; refresh(); }
    });
    cv.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var vis = W.filter(visible); if (!vis.length) return;
      var i = vis.indexOf(byId(st.sel)), n = vis.length;
      i = e.key === "ArrowRight" ? (i + 1) % n : (i - 1 + n) % n;
      st.sel = vis[i].id; refresh(); e.preventDefault();
    });

    layout(); refresh();
    var lastW = el.clientWidth;
    window.addEventListener("resize", function () {
      if (el.clientWidth !== lastW) { lastW = el.clientWidth; layout(); draw(); }
    });
  }

  function init() { document.querySelectorAll('[data-widget="graphics-frontiers-explorer"]').forEach(setup); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
