// Interactive lab: SDF sculpting by sphere tracing (WebGL 2).
// The scene is a list of up to 16 primitives (sphere, rounded box, torus, capsule). The Blend
// shapes are merged one after another with the polynomial smooth minimum, then every Carve shape
// is cut out of the result with the matching smooth maximum of the negated distance:
//   smin_k(a, b) = mix(b, a, h) - k h (1 - h),        h = clamp(1/2 + (b - a) / (2k), 0, 1)
//   carve_k(a, b) = -smin_k(-a, b)                      (a smooth max(a, -b))
// and the floor y = 0 is added with a hard min. A full-screen fragment shader sphere-traces every
// pixel (Hart 1996): t <- t + f(o + t d) until f < (pixel cone radius at t). The optional
// over-relaxation of Keinert et al. 2014 steps by omega f (omega = 1.6) and steps back to the safe
// point t_prev + f_prev when the two unbounding spheres stop overlapping. Normals come from the
// four-tap tetrahedral gradient, soft shadows from the closest approach of the shadow ray to other
// surfaces (Quilez's improved penumbra estimate, min k d / t), ambient occlusion from five samples
// of f along the normal. Exact culling: a primitive whose bounding-sphere lower bound already puts
// it outside the blend band (h = 1) cannot change the result and is skipped.
// Views: shaded, a heat map of the primary-ray iteration count, and a horizontal slice that cuts
// the scene and draws the distance field as contours. "Probe" traces one ray on the CPU with
// exactly the same algorithm and draws its empty-space spheres in 3D.
// While nothing changes, 16 jittered frames are averaged for anti-aliasing and then the loop stops.
(function () {
  "use strict";

  var panel = document.getElementById("lab-sdf");
  if (!panel) return;
  var canvas = panel.querySelector("canvas");
  if (!canvas) return;

  // ------------------------------------------------------------------ text
  var TEXT = {
    en: {
      label: "SDF sculpting by sphere tracing",
      nogl: "This demo needs WebGL 2, which your browser does not support.",
      t_move: "Select / move", t_add: "Add", t_probe: "Probe ray",
      s0: "Sphere", s1: "Box", s2: "Torus", s3: "Capsule",
      p0: "Blobs", p1: "Carved", p2: "Sculpture",
      v0: "Shaded", v1: "Steps", v2: "Slice",
      k: "blend k", steps: "max steps", relax: "Over-relax", soft: "Soft shadows", ao: "AO", slice: "slice y",
      op0: "Blend", op1: "Carve", size: "size", height: "height", del: "Delete",
      nosel: "Tap a shape to select it (carving shapes are the faint ghosts).",
      full: "16 shapes is the limit",
      hint0: "drag a shape: move \u00b7 drag elsewhere: orbit \u00b7 pinch: zoom \u00b7 double-click: reset view",
      hint1: "tap a surface or the floor: add a shape \u00b7 drag: orbit",
      hint2: "tap a pixel: trace its ray \u00b7 then orbit to see the spheres from the side",
      stats: "{n} shapes \u00b7 k = {k} \u00b7 {view} \u00b7 {res} \u00b7 {fps}",
      aa: "AA {a}/16",
      probe: "probe: {s} steps, hit at t = {t}",
      probeMiss: "probe: {s} steps, no hit",
      probeOut: "probe: ran out of steps ({s})",
      lo: "0", hi: "{m} steps", over: "white: out of steps",
      caption: "Every pixel sends a ray into a signed distance field f. The value of f at a point is the radius of a ball that contains no surface, so the ray can always advance by f, until f drops below the size of a pixel at that distance (sphere tracing, Hart 1996). The shapes are combined with the polynomial smooth minimum smin_k, where k is the width of the blend; Carve uses the matching smooth maximum max_k(f, \u2212g), and carving shapes are drawn as faint ghosts. Normals are the gradient of f from four samples, soft shadows measure how closely the shadow ray grazes other shapes (min k\u00b7f/t), and ambient occlusion compares f with the distance along the normal at five points. Steps colours each pixel by its number of iterations: rays that skim silhouettes or run along the floor cost the most, and over-relaxation (Keinert et al. 2014) cuts the count. Slice cuts the scene with a plane and draws f as contour lines, orange outside and blue inside. Probe ray draws the empty-space spheres of a single ray; orbit to see them from the side.",
      more: "Background:",
      l08: "SDFs and sphere tracing (Geometry processing, section 8)",
      l05: "rays and shadows (Ray tracing and path tracing)"
    },
    zh: {
      label: "\u7403\u9762\u8ffd\u8e2a\u4e0e SDF \u96d5\u5851",
      nogl: "\u6b64\u6f14\u793a\u9700\u8981 WebGL 2\uff0c\u4f60\u7684\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u3002",
      t_move: "\u9009\u62e9 / \u79fb\u52a8", t_add: "\u6dfb\u52a0", t_probe: "\u63a2\u6d4b\u5149\u7ebf",
      s0: "\u7403", s1: "\u76d2", s2: "\u5706\u73af", s3: "\u80f6\u56ca",
      p0: "\u878d\u7403", p1: "\u9542\u7a7a", p2: "\u96d5\u5851",
      v0: "\u7740\u8272", v1: "\u6b65\u6570", v2: "\u5207\u7247",
      k: "\u878d\u5408 k", steps: "\u6700\u5927\u6b65\u6570", relax: "\u8d85\u677e\u5f1b", soft: "\u8f6f\u9634\u5f71", ao: "AO", slice: "\u5207\u7247 y",
      op0: "\u878d\u5408", op1: "\u96d5\u523b", size: "\u5927\u5c0f", height: "\u9ad8\u5ea6", del: "\u5220\u9664",
      nosel: "\u70b9\u51fb\u4e00\u4e2a\u5f62\u72b6\u6765\u9009\u4e2d\u5b83\uff08\u96d5\u523b\u7528\u7684\u5f62\u72b6\u663e\u793a\u4e3a\u6de1\u6de1\u7684\u865a\u5f71\uff09\u3002",
      full: "\u6700\u591a 16 \u4e2a\u5f62\u72b6",
      hint0: "\u62d6\u52a8\u5f62\u72b6\uff1a\u79fb\u52a8 \u00b7 \u62d6\u52a8\u522b\u5904\uff1a\u73af\u7ed5 \u00b7 \u53cc\u6307\uff1a\u7f29\u653e \u00b7 \u53cc\u51fb\uff1a\u91cd\u7f6e\u89c6\u89d2",
      hint1: "\u70b9\u51fb\u8868\u9762\u6216\u5730\u9762\uff1a\u6dfb\u52a0\u5f62\u72b6 \u00b7 \u62d6\u52a8\uff1a\u73af\u7ed5",
      hint2: "\u70b9\u51fb\u4e00\u4e2a\u50cf\u7d20\uff1a\u8ffd\u8e2a\u5b83\u7684\u5149\u7ebf \u00b7 \u7136\u540e\u73af\u7ed5\uff0c\u4ece\u4fa7\u9762\u770b\u8fd9\u4e9b\u7403",
      stats: "{n} \u4e2a\u5f62\u72b6 \u00b7 k = {k} \u00b7 {view} \u00b7 {res} \u00b7 {fps}",
      aa: "AA {a}/16",
      probe: "\u63a2\u6d4b\uff1a{s} \u6b65\uff0c\u5728 t = {t} \u5904\u547d\u4e2d",
      probeMiss: "\u63a2\u6d4b\uff1a{s} \u6b65\uff0c\u672a\u547d\u4e2d",
      probeOut: "\u63a2\u6d4b\uff1a\u6b65\u6570\u7528\u5c3d\uff08{s}\uff09",
      lo: "0", hi: "{m} \u6b65", over: "\u767d\u8272\uff1a\u6b65\u6570\u7528\u5c3d",
      caption: "\u6bcf\u4e2a\u50cf\u7d20\u5411\u6709\u7b26\u53f7\u8ddd\u79bb\u573a\uff08signed distance field\uff09f \u53d1\u51fa\u4e00\u6761\u5149\u7ebf\u3002f \u5728\u67d0\u70b9\u7684\u503c\u662f\u4e00\u4e2a\u4e0d\u542b\u4efb\u4f55\u8868\u9762\u7684\u7403\u7684\u534a\u5f84\uff0c\u6240\u4ee5\u5149\u7ebf\u603b\u53ef\u4ee5\u5b89\u5168\u5730\u524d\u8fdb f\uff0c\u76f4\u5230 f \u5c0f\u4e8e\u8be5\u8ddd\u79bb\u5904\u4e00\u4e2a\u50cf\u7d20\u7684\u5927\u5c0f\u4e3a\u6b62\uff08\u7403\u9762\u8ffd\u8e2a\uff0csphere tracing\uff0cHart 1996\uff09\u3002\u5f62\u72b6\u4e4b\u95f4\u7528\u591a\u9879\u5f0f\u5e73\u6ed1\u6700\u5c0f\u503c smin_k \u7ec4\u5408\uff0ck \u662f\u878d\u5408\u533a\u7684\u5bbd\u5ea6\uff1b\u201c\u96d5\u523b\u201d\u4f7f\u7528\u5bf9\u5e94\u7684\u5e73\u6ed1\u6700\u5927\u503c max_k(f, \u2212g)\uff0c\u96d5\u523b\u7528\u7684\u5f62\u72b6\u4ee5\u6de1\u6de1\u7684\u865a\u5f71\u663e\u793a\u3002\u6cd5\u7ebf\u662f f \u7684\u68af\u5ea6\uff0c\u7531\u56db\u6b21\u91c7\u6837\u5f97\u5230\uff1b\u8f6f\u9634\u5f71\u8861\u91cf\u9634\u5f71\u5149\u7ebf\u4e0e\u5176\u4ed6\u5f62\u72b6\u64e6\u80a9\u800c\u8fc7\u7684\u8ddd\u79bb\uff08min k\u00b7f/t\uff09\uff1b\u73af\u5883\u5149\u906e\u853d\uff08AO\uff09\u5728\u6cd5\u7ebf\u65b9\u5411\u7684\u4e94\u4e2a\u70b9\u4e0a\u6bd4\u8f83 f \u4e0e\u6cbf\u6cd5\u7ebf\u7684\u8ddd\u79bb\u3002\u201c\u6b65\u6570\u201d\u6309\u8fed\u4ee3\u6b21\u6570\u7ed9\u6bcf\u4e2a\u50cf\u7d20\u7740\u8272\uff1a\u63a0\u8fc7\u8f6e\u5ed3\u6216\u6cbf\u5730\u9762\u884c\u8fdb\u7684\u5149\u7ebf\u6700\u6602\u8d35\uff0c\u8d85\u677e\u5f1b\uff08Keinert \u7b49\uff0c2014\uff09\u53ef\u4ee5\u51cf\u5c11\u6b65\u6570\u3002\u201c\u5207\u7247\u201d\u7528\u4e00\u4e2a\u5e73\u9762\u5207\u5f00\u573a\u666f\uff0c\u628a f \u753b\u6210\u7b49\u503c\u7ebf\uff0c\u5916\u90e8\u4e3a\u6a59\u8272\u3001\u5185\u90e8\u4e3a\u84dd\u8272\u3002\u201c\u63a2\u6d4b\u5149\u7ebf\u201d\u753b\u51fa\u4e00\u6761\u5149\u7ebf\u7684\u6240\u6709\u7a7a\u7403\uff1b\u73af\u7ed5\u89c6\u89d2\u5373\u53ef\u4ece\u4fa7\u9762\u89c2\u5bdf\u5b83\u4eec\u3002",
      more: "\u80cc\u666f\u77e5\u8bc6\uff1a",
      l08: "SDF \u4e0e\u7403\u9762\u8ffd\u8e2a\uff08\u51e0\u4f55\u5904\u7406\uff0c\u7b2c 8 \u8282\uff09",
      l05: "\u5149\u7ebf\u4e0e\u9634\u5f71\uff08\u5149\u7ebf\u8ffd\u8e2a\u4e0e\u8def\u5f84\u8ffd\u8e2a\uff09"
    },
    ja: {
      label: "\u30b9\u30d5\u30a3\u30a2\u30c8\u30ec\u30fc\u30b7\u30f3\u30b0\u306b\u3088\u308b SDF \u9020\u5f62",
      nogl: "\u3053\u306e\u30c7\u30e2\u306b\u306f WebGL 2 \u304c\u5fc5\u8981\u3067\u3059\u304c\u3001\u304a\u4f7f\u3044\u306e\u30d6\u30e9\u30a6\u30b6\u306f\u5bfe\u5fdc\u3057\u3066\u3044\u307e\u305b\u3093\u3002",
      t_move: "\u9078\u629e / \u79fb\u52d5", t_add: "\u8ffd\u52a0", t_probe: "\u30ec\u30a4\u3092\u8abf\u3079\u308b",
      s0: "\u7403", s1: "\u7bb1", s2: "\u30c8\u30fc\u30e9\u30b9", s3: "\u30ab\u30d7\u30bb\u30eb",
      p0: "\u30d6\u30ed\u30d6", p1: "\u5f6b\u523b", p2: "\u30aa\u30d6\u30b8\u30a7",
      v0: "\u30b7\u30a7\u30fc\u30c7\u30a3\u30f3\u30b0", v1: "\u30b9\u30c6\u30c3\u30d7\u6570", v2: "\u30b9\u30e9\u30a4\u30b9",
      k: "\u30d6\u30ec\u30f3\u30c9 k", steps: "\u6700\u5927\u30b9\u30c6\u30c3\u30d7", relax: "\u904e\u7de9\u548c", soft: "\u30bd\u30d5\u30c8\u30b7\u30e3\u30c9\u30a6", ao: "AO", slice: "\u30b9\u30e9\u30a4\u30b9 y",
      op0: "\u30d6\u30ec\u30f3\u30c9", op1: "\u524a\u308b", size: "\u5927\u304d\u3055", height: "\u9ad8\u3055", del: "\u524a\u9664",
      nosel: "\u5f62\u72b6\u3092\u30bf\u30c3\u30d7\u3059\u308b\u3068\u9078\u629e\u3067\u304d\u307e\u3059\uff08\u524a\u308b\u5f62\u72b6\u306f\u8584\u3044\u30b4\u30fc\u30b9\u30c8\u3067\u8868\u793a\u3055\u308c\u307e\u3059\uff09\u3002",
      full: "\u5f62\u72b6\u306f 16 \u500b\u307e\u3067\u3067\u3059",
      hint0: "\u5f62\u72b6\u3092\u30c9\u30e9\u30c3\u30b0\uff1a\u79fb\u52d5 \u00b7 \u305d\u308c\u4ee5\u5916\u3092\u30c9\u30e9\u30c3\u30b0\uff1a\u8996\u70b9\u3092\u56de\u3059 \u00b7 \u30d4\u30f3\u30c1\uff1a\u30ba\u30fc\u30e0 \u00b7 \u30c0\u30d6\u30eb\u30af\u30ea\u30c3\u30af\uff1a\u8996\u70b9\u3092\u623b\u3059",
      hint1: "\u8868\u9762\u304b\u5e8a\u3092\u30bf\u30c3\u30d7\uff1a\u5f62\u72b6\u3092\u8ffd\u52a0 \u00b7 \u30c9\u30e9\u30c3\u30b0\uff1a\u8996\u70b9\u3092\u56de\u3059",
      hint2: "\u30d4\u30af\u30bb\u30eb\u3092\u30bf\u30c3\u30d7\uff1a\u305d\u306e\u30ec\u30a4\u3092\u8ffd\u8de1 \u00b7 \u8996\u70b9\u3092\u56de\u3059\u3068\u7403\u3092\u6a2a\u304b\u3089\u898b\u3089\u308c\u307e\u3059",
      stats: "\u5f62\u72b6 {n} \u500b \u00b7 k = {k} \u00b7 {view} \u00b7 {res} \u00b7 {fps}",
      aa: "AA {a}/16",
      probe: "\u30d7\u30ed\u30fc\u30d6\uff1a{s} \u30b9\u30c6\u30c3\u30d7\u3001t = {t} \u3067\u30d2\u30c3\u30c8",
      probeMiss: "\u30d7\u30ed\u30fc\u30d6\uff1a{s} \u30b9\u30c6\u30c3\u30d7\u3001\u30d2\u30c3\u30c8\u306a\u3057",
      probeOut: "\u30d7\u30ed\u30fc\u30d6\uff1a\u30b9\u30c6\u30c3\u30d7\u6570\u306e\u4e0a\u9650\u306b\u5230\u9054\uff08{s}\uff09",
      lo: "0", hi: "{m} \u30b9\u30c6\u30c3\u30d7", over: "\u767d\uff1a\u4e0a\u9650\u306b\u5230\u9054",
      caption: "\u5404\u30d4\u30af\u30bb\u30eb\u306f\u7b26\u53f7\u4ed8\u304d\u8ddd\u96e2\u5834\uff08signed distance field\uff09f \u306e\u4e2d\u306b\u30ec\u30a4\u3092\u98db\u3070\u3057\u307e\u3059\u3002\u3042\u308b\u70b9\u3067\u306e f \u306e\u5024\u306f\u3001\u8868\u9762\u3092\u542b\u307e\u306a\u3044\u7403\u306e\u534a\u5f84\u3067\u3059\u3002\u305d\u306e\u305f\u3081\u30ec\u30a4\u306f\u5e38\u306b f \u3060\u3051\u5b89\u5168\u306b\u9032\u3081\u308b\u3053\u3068\u304c\u3067\u304d\u3001f \u304c\u305d\u306e\u8ddd\u96e2\u3067\u306e 1 \u30d4\u30af\u30bb\u30eb\u306e\u5927\u304d\u3055\u3092\u4e0b\u56de\u308b\u307e\u3067\u7e70\u308a\u8fd4\u3057\u307e\u3059\uff08\u30b9\u30d5\u30a3\u30a2\u30c8\u30ec\u30fc\u30b7\u30f3\u30b0\u3001sphere tracing\u3001Hart 1996\uff09\u3002\u5f62\u72b6\u3069\u3046\u3057\u306f\u591a\u9805\u5f0f\u306e\u30b9\u30e0\u30fc\u30ba\u6700\u5c0f\u5024 smin_k \u3067\u7d44\u307f\u5408\u308f\u3055\u308c\u3001k \u306f\u30d6\u30ec\u30f3\u30c9\u9818\u57df\u306e\u5e45\u3067\u3059\u3002\u300c\u524a\u308b\u300d\u306f\u5bfe\u5fdc\u3059\u308b\u30b9\u30e0\u30fc\u30ba\u6700\u5927\u5024 max_k(f, \u2212g) \u3092\u4f7f\u3044\u3001\u524a\u308b\u5f62\u72b6\u306f\u8584\u3044\u30b4\u30fc\u30b9\u30c8\u3068\u3057\u3066\u63cf\u304b\u308c\u307e\u3059\u3002\u6cd5\u7dda\u306f 4 \u70b9\u306e\u30b5\u30f3\u30d7\u30eb\u304b\u3089\u6c42\u3081\u305f f \u306e\u52fe\u914d\u3067\u3059\u3002\u30bd\u30d5\u30c8\u30b7\u30e3\u30c9\u30a6\u306f\u30b7\u30e3\u30c9\u30a6\u30ec\u30a4\u304c\u4ed6\u306e\u5f62\u72b6\u306b\u3069\u308c\u3060\u3051\u8fd1\u3065\u3044\u305f\u304b\uff08min k\u00b7f/t\uff09\u3067\u3001\u30a2\u30f3\u30d3\u30a8\u30f3\u30c8\u30aa\u30af\u30eb\u30fc\u30b8\u30e7\u30f3\uff08AO\uff09\u306f\u6cd5\u7dda\u65b9\u5411\u306e 5 \u70b9\u3067 f \u3068\u6cd5\u7dda\u65b9\u5411\u306e\u8ddd\u96e2\u3092\u6bd4\u3079\u3066\u6c42\u3081\u307e\u3059\u3002\u300c\u30b9\u30c6\u30c3\u30d7\u6570\u300d\u306f\u5404\u30d4\u30af\u30bb\u30eb\u3092\u53cd\u5fa9\u56de\u6570\u3067\u8272\u5206\u3051\u3057\u307e\u3059\u3002\u8f2a\u90ed\u3092\u304b\u3059\u3081\u308b\u30ec\u30a4\u3084\u5e8a\u306b\u6cbf\u3063\u3066\u9032\u3080\u30ec\u30a4\u304c\u6700\u3082\u9ad8\u30b3\u30b9\u30c8\u3067\u3001\u904e\u7de9\u548c\uff08Keinert \u3089\u30012014\uff09\u3067\u56de\u6570\u3092\u6e1b\u3089\u305b\u307e\u3059\u3002\u300c\u30b9\u30e9\u30a4\u30b9\u300d\u306f\u5e73\u9762\u3067\u30b7\u30fc\u30f3\u3092\u5207\u308a\u3001f \u3092\u7b49\u9ad8\u7dda\u3068\u3057\u3066\u63cf\u304d\u307e\u3059\uff08\u5916\u5074\u304c\u30aa\u30ec\u30f3\u30b8\u3001\u5185\u5074\u304c\u9752\uff09\u3002\u300c\u30ec\u30a4\u3092\u8abf\u3079\u308b\u300d\u306f 1 \u672c\u306e\u30ec\u30a4\u306e\u7a7a\u306e\u7403\u3092\u3059\u3079\u3066\u63cf\u304d\u307e\u3059\u3002\u8996\u70b9\u3092\u56de\u3059\u3068\u6a2a\u304b\u3089\u89b3\u5bdf\u3067\u304d\u307e\u3059\u3002",
      more: "\u95a2\u9023\u8a18\u4e8b\uff1a",
      l08: "SDF \u3068\u30b9\u30d5\u30a3\u30a2\u30c8\u30ec\u30fc\u30b7\u30f3\u30b0\uff08\u30b8\u30aa\u30e1\u30c8\u30ea\u51e6\u7406\u3001\u7b2c 8 \u7bc0\uff09",
      l05: "\u30ec\u30a4\u3068\u5f71\uff08\u30ec\u30a4\u30c8\u30ec\u30fc\u30b7\u30f3\u30b0\u3068\u30d1\u30b9\u30c8\u30ec\u30fc\u30b7\u30f3\u30b0\uff09"
    }
  };
  var lang = (panel.dataset.lang || "en").slice(0, 2);
  var L = TEXT[lang] || TEXT.en;

  function fmt(tpl, vals) {
    return tpl.replace(/\{(\w+)\}/g, function (_, k) {
      return vals[k] !== undefined ? vals[k] : "";
    });
  }
  function q(sel) { return panel.querySelector(sel); }
  function qa(sel) { return panel.querySelectorAll(sel); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  each(qa("[data-t]"), function (el) {
    var v = L[el.getAttribute("data-t")];
    if (v !== undefined) el.textContent = v;
  });
  canvas.setAttribute("aria-label", L.label);

  var gl = null; // created lazily, the first time the panel is on screen
  function fail() {
    var stage = q(".lab-stage");
    stage.textContent = L.nogl;
    stage.style.padding = "1.2rem";
    stage.style.color = "#ddd";
    each(qa(".lab-controls, .sdf-editor"), function (el) { el.style.display = "none"; });
  }

  // ------------------------------------------------------------------ constants
  var MAXP = 16;
  var NPROBE = 64;
  var REGION = 4.2; // shapes stay inside |x|, |z| < REGION
  var SLICE_R = 3.0; // half size of the square slice plane
  var TMAX = 40;
  var AA_FRAMES = 16;
  var HEAT_MAX = 48; // the heat map saturates at this many steps
  var LDIR = norm([-0.45, 0.78, 0.5]);

  // ------------------------------------------------------------------ small vector helpers
  function norm(v) {
    var l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function srgbToLin(c) { return Math.pow(c, 2.2); }

  // ------------------------------------------------------------------ shaders
  var VS = "#version 300 es\nin vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }";

  var FS = [
    "#version 300 es",
    "precision highp float;",
    "precision highp int;",
    "#define MAXP " + MAXP,
    "#define NPROBE " + NPROBE,
    "#define SLICE_R " + SLICE_R.toFixed(2),
    "#define TMAX " + TMAX.toFixed(1),
    "#define HEAT_MAX " + HEAT_MAX,
    "uniform vec4 uA[MAXP];", // centre.xyz, type + 8 * op
    "uniform vec4 uB[MAXP];", // dimensions.xyz, rounding
    "uniform vec4 uC[MAXP];", // albedo.rgb (linear), bounding radius
    "uniform mat3 uR[MAXP];", // world -> local rotation
    "uniform int uN;",
    "uniform float uK;",
    "uniform vec3 uCamPos, uCamR, uCamU, uCamF;",
    "uniform float uTanHalf;",
    "uniform vec2 uRes, uJitter;",
    "uniform int uView;", // 0 shaded, 1 steps, 2 slice
    "uniform int uMaxSteps;",
    "uniform float uOmega;",
    "uniform int uSoft, uAO;",
    "uniform float uSliceH;",
    "uniform int uSel;",
    "uniform vec4 uProbe[NPROBE];", // step points (xyz) and |f| there (w)
    "uniform int uProbeN;",
    "uniform vec3 uProbeO, uProbeE;",
    "uniform int uProbeHit;",
    "out vec4 outColor;",
    "const vec3 LDIR = vec3(" + LDIR.map(function (x) { return x.toFixed(5); }).join(", ") + ");",
    "float gClip;",
    "",
    "float sdPrim(int i, vec3 p) {",
    "  vec4 a = uA[i]; vec4 b = uB[i];",
    "  vec3 q = uR[i] * (p - a.xyz);",
    "  int ty = int(a.w + 0.5) & 7;",
    "  if (ty == 0) return length(q) - b.x;",
    "  if (ty == 1) { vec3 d = abs(q) - b.xyz + b.w; return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - b.w; }",
    "  if (ty == 2) { vec2 t = vec2(length(q.xz) - b.x, q.y); return length(t) - b.y; }",
    "  q.y -= clamp(q.y, -b.y, b.y); return length(q) - b.x;",
    "}",
    "",
    // distance to the shapes alone (no floor)
    "float mapObj(vec3 p) {",
    "  float d = 1e5; float k = max(uK, 1e-4);",
    "  for (int i = 0; i < MAXP; i++) {",
    "    if (i >= uN) break;",
    "    vec4 a = uA[i];",
    "    bool carve = a.w > 7.5;",
    "    float lb = length(p - a.xyz) - uC[i].w;", // lower bound of this primitive's distance
    "    if (carve ? lb >= k - d : lb >= d + k) continue;", // h would be 1: no effect
    "    float di = sdPrim(i, p);",
    "    if (!carve) { float h = clamp(0.5 + 0.5 * (di - d) / k, 0.0, 1.0); d = mix(di, d, h) - k * h * (1.0 - h); }",
    "    else { float h = clamp(0.5 + 0.5 * (di + d) / k, 0.0, 1.0); d = mix(-di, d, h) + k * h * (1.0 - h); }",
    "  }",
    "  return d;",
    "}",
    "",
    // the same loop, carrying the blended albedo along with the distance
    "vec3 objColor(vec3 p) {",
    "  float d = 1e5; float k = max(uK, 1e-4); vec3 col = vec3(0.5);",
    "  for (int i = 0; i < MAXP; i++) {",
    "    if (i >= uN) break;",
    "    vec4 a = uA[i];",
    "    bool carve = a.w > 7.5;",
    "    float lb = length(p - a.xyz) - uC[i].w;",
    "    if (carve ? lb >= k - d : lb >= d + k) continue;",
    "    float di = sdPrim(i, p);",
    "    if (!carve) { float h = clamp(0.5 + 0.5 * (di - d) / k, 0.0, 1.0); d = mix(di, d, h) - k * h * (1.0 - h); col = mix(uC[i].rgb, col, h); }",
    "    else { float h = clamp(0.5 + 0.5 * (di + d) / k, 0.0, 1.0); d = mix(-di, d, h) + k * h * (1.0 - h); col = mix(mix(col, uC[i].rgb, 0.65), col, h); }",
    "  }",
    "  return col;",
    "}",
    "",
    "float map(vec3 p) { return max(min(mapObj(p), p.y), p.y - gClip); }",
    "",
    "vec3 calcNormal(vec3 p, float e) {",
    "  const vec2 s = vec2(1.0, -1.0);",
    "  return normalize(s.xyy * map(p + s.xyy * e) + s.yyx * map(p + s.yyx * e) + s.yxy * map(p + s.yxy * e) + s.xxx * map(p + s.xxx * e));",
    "}",
    "",
    // sphere tracing with optional over-relaxation; status 1 hit, 0 escaped, -1 out of steps
    "float trace(vec3 ro, vec3 rd, float pixR, out int steps, out int status) {",
    "  float t = 0.0, omega = uOmega, prevF = 0.0, stepLen = 0.0;",
    "  steps = 0; status = -1;",
    "  for (int i = 0; i < 512; i++) {",
    "    if (i >= uMaxSteps) break;",
    "    steps++;",
    "    float f = map(ro + rd * t);",
    "    if (omega > 1.0 && abs(f) + prevF < stepLen) {", // the two spheres do not overlap: go back
    "      t += prevF - stepLen; stepLen = prevF; omega = 1.0; continue;",
    "    }",
    "    if (f < pixR * t + 1e-4) { status = 1; break; }",
    "    stepLen = f * omega; prevF = f; t += stepLen;",
    "    if (t > TMAX) { status = 0; break; }",
    "  }",
    "  return t;",
    "}",
    "",
    "float shadow(vec3 ro, vec3 rd) {",
    "  float res = 1.0, t = 0.015, ph = 1e10;",
    "  for (int i = 0; i < 56; i++) {",
    "    float h = map(ro + rd * t);",
    "    if (h < 0.0004) return 0.0;",
    "    if (uSoft == 1) {",
    "      float y = h * h / (2.0 * ph);",
    "      float d = sqrt(max(h * h - y * y, 0.0));",
    "      res = min(res, 9.0 * d / max(1e-4, t - y));",
    "      ph = h;",
    "    }",
    "    t += clamp(h, 0.01, 0.45);",
    "    if (t > 14.0 || res < 0.002) break;",
    "  }",
    "  res = clamp(res, 0.0, 1.0);",
    "  return res * res * (3.0 - 2.0 * res);",
    "}",
    "",
    "float calcAO(vec3 p, vec3 n) {",
    "  float occ = 0.0, sca = 1.0;",
    "  for (int i = 0; i < 5; i++) {",
    "    float h = 0.015 + 0.11 * float(i);",
    "    occ += (h - map(p + n * h)) * sca;",
    "    sca *= 0.85;",
    "  }",
    "  return clamp(1.0 - 2.2 * occ, 0.0, 1.0);",
    "}",
    "",
    "vec3 background(vec3 rd) {",
    "  float y = rd.y;",
    "  vec3 c = mix(vec3(0.016, 0.019, 0.026), vec3(0.003, 0.004, 0.006), clamp(y * 1.4, 0.0, 1.0));",
    "  c += vec3(0.05, 0.04, 0.03) * pow(clamp(dot(rd, LDIR), 0.0, 1.0), 6.0) * 0.25;",
    "  return c;",
    "}",
    "",
    "vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }",
    "",
    "vec3 heat(float x) {", // the same stops as the CSS legend
    "  x = clamp(x, 0.0, 1.0);",
    "  vec3 c0 = vec3(0.06, 0.04, 0.24), c1 = vec3(0.12, 0.42, 0.86), c2 = vec3(0.20, 0.78, 0.55), c3 = vec3(0.98, 0.80, 0.20), c4 = vec3(0.86, 0.16, 0.10);",
    "  if (x < 0.25) return mix(c0, c1, x * 4.0);",
    "  if (x < 0.5) return mix(c1, c2, x * 4.0 - 1.0);",
    "  if (x < 0.75) return mix(c2, c3, x * 4.0 - 2.0);",
    "  return mix(c3, c4, x * 4.0 - 3.0);",
    "}",
    "",
    // distance-field colouring in display space: orange outside, blue inside, a band every 0.1
    "vec3 fieldColor(float d, float w) {",
    "  vec3 col = d > 0.0 ? vec3(0.96, 0.62, 0.30) : vec3(0.40, 0.68, 0.98);",
    "  col *= 1.0 - 0.72 * exp(-4.0 * abs(d));",
    "  float band = abs(fract(d * 10.0 + 0.5) - 0.5) / max(w * 10.0, 1e-4);",
    "  col *= mix(0.7, 1.0, smoothstep(0.0, 1.5, band));",
    "  col = mix(col, vec3(1.0), 1.0 - smoothstep(0.004, 0.012 + 1.5 * w, abs(d)));",
    "  return col;",
    "}",
    "",
    // single-primitive sphere trace for the ghosts of carving shapes
    "float traceOne(int i, vec3 ro, vec3 rd, float tEnd) {",
    "  vec3 oc = ro - uA[i].xyz; float r = uC[i].w;",
    "  float b = dot(oc, rd), c = dot(oc, oc) - r * r, disc = b * b - c;",
    "  if (disc < 0.0) return -1.0;",
    "  float sq = sqrt(disc), t = max(-b - sq, 0.0), t1 = min(-b + sq, tEnd);",
    "  for (int s = 0; s < 40; s++) {",
    "    if (t > t1) return -1.0;",
    "    float f = sdPrim(i, ro + rd * t);",
    "    if (f < 0.002) return t;",
    "    t += f;",
    "  }",
    "  return -1.0;",
    "}",
    "",
    "void main() {",
    "  vec2 frag = gl_FragCoord.xy + uJitter;",
    "  vec2 uv = (2.0 * frag - uRes) / uRes.y;",
    "  vec3 ro = uCamPos;",
    "  vec3 rd = normalize(uCamF + uTanHalf * (uv.x * uCamR + uv.y * uCamU));",
    "  float pixR = uTanHalf / uRes.y;", // half a pixel, as an angle
    "  gClip = uView == 2 ? uSliceH : 1e5;",
    "  int steps, status;",
    "  float t = trace(ro, rd, pixR, steps, status);",
    "  bool hit = status == 1;",
    "  float tS = hit ? t : 1e5;",
    "  vec3 p = ro + rd * t;",
    "  vec3 col;",
    "  if (uView == 1) {",
    // iteration heat map, with a little shading so the shapes stay readable
    "    if (status == -1) col = vec3(1.0);",
    "    else {",
    "      col = heat(float(steps) / float(min(uMaxSteps, HEAT_MAX)));",
    "      if (hit) { vec3 n = calcNormal(p, max(0.0007, pixR * t)); col *= 0.72 + 0.28 * clamp(dot(n, LDIR), 0.0, 1.0); }",
    "    }",
    "  } else {",
    "    if (hit) {",
    "      vec3 n = calcNormal(p, max(0.0007, pixR * t));",
    "      float dObj = mapObj(p);",
    "      bool floorHit = p.y < dObj;",
    "      bool cap = uView == 2 && dObj < 0.0 && p.y - uSliceH > min(dObj, p.y) - 1e-4;",
    "      vec3 alb; float spec;",
    "      if (floorHit) {",
    "        float w = pixR * t * 2.0 / max(abs(rd.y), 0.04);",
    "        vec2 g = abs(fract(p.xz * 2.0 + 0.5) - 0.5) / max(w * 2.0, 1e-4);",
    "        float line = 1.0 - smoothstep(0.0, 1.0, min(g.x, g.y));",
    "        vec2 g2 = abs(p.xz) / max(w, 1e-4);",
    "        float axis = 1.0 - smoothstep(0.0, 1.5, min(g2.x, g2.y));",
    "        alb = vec3(0.075, 0.08, 0.09) * (1.0 + 0.45 * line * exp(-0.005 * t * t)) + vec3(0.03) * axis;",
    "        spec = 0.15;",
    "      } else { alb = objColor(p); spec = 1.0; }",
    "      float sh = shadow(p + n * 0.002, LDIR);",
    "      float ao = uAO == 1 ? calcAO(p, n) : 1.0;",
    "      float dif = clamp(dot(n, LDIR), 0.0, 1.0) * sh;",
    "      vec3 hv = normalize(LDIR - rd);",
    "      float nh = clamp(dot(n, hv), 0.0, 1.0);",
    "      float fre = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 5.0);",
    "      float sp = (pow(nh, 60.0) * 2.0 + pow(nh, 12.0) * 0.25) * dif * spec * (0.04 + 0.96 * fre + 0.25);",
    "      float skyD = (0.6 + 0.4 * n.y) * ao;",
    "      float bounce = clamp(0.4 - 0.6 * n.y, 0.0, 1.0) * ao;",
    "      float back = clamp(dot(n, normalize(vec3(-LDIR.x, 0.0, -LDIR.z))), 0.0, 1.0) * ao;",
    "      col = alb * (dif * vec3(1.75, 1.58, 1.36) + skyD * vec3(0.20, 0.25, 0.34) + bounce * vec3(0.10, 0.08, 0.06) + back * vec3(0.10, 0.11, 0.14));",
    "      col += sp * vec3(1.8, 1.7, 1.5);",
    "      col += fre * ao * spec * vec3(0.10, 0.13, 0.18);",
    "      if (uSel >= 0 && !floorHit) {", // selection tint on the region the selected shape owns
    "        float ds = abs(sdPrim(uSel, p));",
    "        col = mix(col, col * vec3(0.9, 1.05, 1.25) + vec3(0.02, 0.05, 0.10), 1.0 - smoothstep(0.0, 0.05, ds));",
    "      }",
    "      if (uSel >= 0 && floorHit) {", // a ring on the floor under the selected shape
    "        float rr = length(p.xz - uA[uSel].xz);",
    "        float w = pixR * t * 2.0 / max(abs(rd.y), 0.04);",
    "        float ring = 1.0 - smoothstep(0.0, 1.5 * w + 0.008, abs(rr - uC[uSel].w));",
    "        col += vec3(0.08, 0.16, 0.30) * ring;",
    "      }",
    "      col = mix(col, background(rd), max(1.0 - exp(-0.0012 * t * t), floorHit ? smoothstep(9.0, 26.0, t) : 0.0));",
    "      col = pow(aces(col), vec3(1.0 / 2.2));",
    "      if (cap) {", // cut face of the slice: the inside distance field
    "        float w = pixR * t * 2.0 / max(abs(rd.y), 0.04);",
    "        col = fieldColor(mapObj(vec3(p.x, uSliceH, p.z)), w) * (0.7 + 0.3 * sh);",
    "      }",
    "    } else {",
    "      col = pow(aces(background(rd) * 1.1), vec3(1.0 / 2.2));",
    "    }",
    "    if (uView == 2) {", // the slice plane, outside the shapes, drawn over what lies beyond it
    "      float tp = (uSliceH - ro.y) / rd.y;",
    "      vec3 pp = ro + rd * tp;",
    "      if (tp > 0.0 && tp < tS - 0.003 && abs(pp.x) < SLICE_R && abs(pp.z) < SLICE_R) {",
    "        float w = pixR * tp * 2.0 / max(abs(rd.y), 0.04);",
    "        vec3 fc = fieldColor(mapObj(pp), w);",
    "        float edge = 1.0 - smoothstep(0.0, 1.5 * w + 0.004, SLICE_R - max(abs(pp.x), abs(pp.z)));",
    "        col = mix(col, fc, 0.72);",
    "        col = mix(col, vec3(0.9), edge);",
    "      }",
    "    }",
    "  }",
    // ghosts of the carving shapes (and a brighter one for the selected shape)
    "  for (int i = 0; i < MAXP; i++) {",
    "    if (i >= uN) break;",
    "    if (uA[i].w < 7.5 && i != uSel) continue;",
    "    float tg = traceOne(i, ro, rd, min(tS, TMAX) - 0.004);",
    "    if (tg > 0.0) {",
    "      vec3 pg = ro + rd * tg;",
    "      const vec2 s = vec2(1.0, -1.0); float e = 0.002;",
    "      vec3 ng = normalize(s.xyy * sdPrim(i, pg + s.xyy * e) + s.yyx * sdPrim(i, pg + s.yyx * e) + s.yxy * sdPrim(i, pg + s.yxy * e) + s.xxx * sdPrim(i, pg + s.xxx * e));",
    "      float rim = pow(1.0 - abs(dot(ng, rd)), 2.0);",
    "      float a = (i == uSel ? 0.16 + 0.5 * rim : 0.05 + 0.22 * rim);",
    "      vec3 gc = i == uSel ? vec3(0.55, 0.80, 1.0) : mix(vec3(0.85), pow(uC[i].rgb, vec3(1.0 / 2.2)), 0.5);",
    "      col = mix(col, gc, a);",
    "    }",
    "  }",
    // the probe ray: its line, its empty-space spheres and its step points
    "  if (uProbeN > 0) {",
    "    vec3 pd = uProbeE - uProbeO; float pl = length(pd); pd /= max(pl, 1e-5);",
    "    vec3 w0 = ro - uProbeO;",
    "    float b = dot(rd, pd), dd = dot(rd, w0), ee = dot(pd, w0), den = 1.0 - b * b;",
    "    if (den > 1e-6) {",
    "      float sc = (b * ee - dd) / den, tc = clamp((ee - b * dd) / den, 0.0, pl);",
    "      sc = dot(uProbeO + pd * tc - ro, rd);",
    "      if (sc > 0.0 && sc < tS + 0.01) {",
    "        float dist = length(ro + rd * sc - (uProbeO + pd * tc));",
    "        float wl = 0.006 + pixR * sc * 1.5;",
    "        col = mix(col, vec3(1.0, 0.92, 0.55), (1.0 - smoothstep(wl * 0.5, wl * 1.5, dist)) * 0.9);",
    "      }",
    "    }",
    "    for (int i = 0; i < NPROBE; i++) {",
    "      if (i >= uProbeN) break;",
    "      vec4 s = uProbe[i];",
    "      vec3 oc = ro - s.xyz;",
    "      float bb = dot(oc, rd);",
    "      float fi = float(i) / max(float(uProbeN - 1), 1.0);",
    "      vec3 sc = mix(vec3(0.35, 0.85, 1.0), vec3(0.75, 0.45, 1.0), fi);",
    "      float c2 = dot(oc, oc) - s.w * s.w, disc = bb * bb - c2;",
    "      if (s.w > 0.003 && disc > 0.0) {",
    "        float t0 = -bb - sqrt(disc);",
    "        if (t0 > 0.0 && t0 < tS) {",
    "          vec3 n = normalize(oc + rd * t0);",
    "          float rim = pow(1.0 - abs(dot(n, rd)), 3.0);",
    "          col = mix(col, sc, 0.05 + 0.45 * rim);",
    "        }",
    "      }",
    "      float rdot = 0.022 + pixR * max(-bb, 0.0) * 2.0;",
    "      float c3 = dot(oc, oc) - rdot * rdot, disc3 = bb * bb - c3;",
    "      if (disc3 > 0.0 && -bb < tS + 0.02) col = mix(col, (i == uProbeN - 1 && uProbeHit == 1) ? vec3(1.0, 0.35, 0.55) : vec3(1.0, 0.92, 0.55), 0.95);",
    "    }",
    "  }",
    "  outColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  var FS_BLIT = [
    "#version 300 es",
    "precision mediump float;",
    "uniform sampler2D uTex;",
    "out vec4 outColor;",
    "void main() { outColor = vec4(texelFetch(uTex, ivec2(gl_FragCoord.xy), 0).rgb, 1.0); }"
  ].join("\n");

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p));
    var u = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name);
    }
    return { p: p, u: u };
  }

  // ------------------------------------------------------------------ scene
  var PALETTE = [
    [0.95, 0.47, 0.37], [0.98, 0.74, 0.32], [0.30, 0.76, 0.70], [0.42, 0.62, 0.96],
    [0.74, 0.54, 0.92], [0.93, 0.91, 0.86], [0.55, 0.82, 0.45], [0.96, 0.58, 0.72]
  ];
  var BASE = {
    0: [0.55, 0, 0],      // sphere: radius
    1: [0.5, 0.5, 0.5],   // box: half extents (rounding = 0.12 of the smallest)
    2: [0.55, 0.2, 0],    // torus: ring radius, tube radius
    3: [0.25, 0.45, 0]    // capsule: radius, half length of the axis
  };

  function prim(type, pos, dims, color, op, yaw, pitch) {
    return { type: type, pos: pos.slice(), dims: dims.slice(), scale: 1, color: color.slice(), op: op || 0, yaw: yaw || 0, pitch: pitch || 0 };
  }

  var PRESETS = [
    { k: 0.45, prims: function () {
      return [
        prim(0, [0, 0.82, 0], [0.82], PALETTE[0]),
        prim(0, [1.05, 0.55, 0.45], [0.55], PALETTE[1]),
        prim(0, [-0.95, 0.62, 0.55], [0.5], PALETTE[2]),
        prim(0, [0.25, 1.75, -0.2], [0.45], PALETTE[3]),
        prim(3, [-0.35, 0.42, -1.05], [0.28, 0.55], PALETTE[4], 0, 0.9, 1.5708),
        prim(0, [1.55, 0.3, -0.95], [0.3], PALETTE[7]),
        prim(2, [-2.1, 0.22, -0.6], [0.5, 0.2], PALETTE[6], 0, 0, 0)
      ];
    } },
    { k: 0.08, prims: function () {
      return [
        prim(1, [0, 0.86, 0], [0.82, 0.82, 0.82], PALETTE[5], 0, 0.6, 0),
        prim(3, [0, 0.86, 0], [0.36, 1.2], PALETTE[3], 1, 0.6, 0),
        prim(3, [0, 0.86, 0], [0.36, 1.2], PALETTE[3], 1, 0.6, 1.5708),
        prim(3, [0, 0.86, 0], [0.36, 1.2], PALETTE[3], 1, 0.6 + 1.5708, 1.5708),
        prim(0, [1.95, 0.6, 0.55], [0.6], PALETTE[1]),
        prim(0, [2.3, 1.0, 0.85], [0.42], PALETTE[0], 1),
        prim(2, [-1.9, 0.62, 0.7], [0.55, 0.2], PALETTE[2], 0, 0.4, 1.5708),
        prim(1, [-1.9, 0.12, 0.7], [0.62, 0.12, 0.3], PALETTE[4], 0, 0.4, 0)
      ];
    } },
    { k: 0.28, prims: function () {
      return [
        prim(1, [0, 0.16, 0], [1.05, 0.16, 1.05], PALETTE[5], 0, 0.78, 0),
        prim(0, [0, 0.16, 0], [0.5], PALETTE[3], 1),
        prim(3, [0, 0.95, 0], [0.16, 0.6], PALETTE[4]),
        prim(2, [0, 1.55, 0], [0.62, 0.18], PALETTE[1], 0, 0.5, 1.5708),
        prim(0, [0, 1.55, 0], [0.3], PALETTE[0]),
        prim(1, [1.9, 0.47, -0.7], [0.45, 0.45, 0.45], PALETTE[2], 0, 0.3, 0),
        prim(0, [1.9, 0.47, -0.7], [0.5], PALETTE[1], 1),
        prim(2, [-1.8, 0.2, -1.0], [0.42, 0.2], PALETTE[6]),
        prim(3, [-1.4, 0.3, 1.5], [0.3, 0.5], PALETTE[7], 0, 1.2, 1.5708)
      ];
    } }
  ];

  var st = {
    tool: "move", shape: 0, view: 0, k: 0.45, maxSteps: 128, relax: false, soft: true, ao: true,
    sliceH: 0.7, preset: 0
  };
  var prims = [];
  var sel = -1;
  var colorCursor = 0;

  // derived per-primitive data, the same numbers on the CPU and the GPU
  function derive(pr) {
    var s = pr.scale, d = pr.dims, cy = Math.cos(pr.yaw), sy = Math.sin(pr.yaw), cp = Math.cos(pr.pitch), sp = Math.sin(pr.pitch);
    // local -> world L = Ry(yaw) Rx(pitch), stored row-major; uploaded as is, it is the column-major world -> local matrix
    pr.R = [cy, sy * sp, sy * cp, 0, cp, -sp, -sy, cy * sp, cy * cp];
    var b = [0, 0, 0, 0];
    if (pr.type === 0) { b[0] = d[0] * s; pr.bound = b[0]; }
    else if (pr.type === 1) {
      b[0] = d[0] * s; b[1] = d[1] * s; b[2] = d[2] * s;
      b[3] = 0.12 * Math.min(b[0], b[1], b[2]);
      pr.bound = Math.hypot(b[0], b[1], b[2]);
    } else if (pr.type === 2) { b[0] = d[0] * s; b[1] = d[1] * s; pr.bound = b[0] + b[1]; }
    else { b[0] = d[0] * s; b[1] = d[1] * s; pr.bound = b[0] + b[1]; }
    pr.B = b;
  }

  function sdPrim(pr, p) {
    var v0 = p[0] - pr.pos[0], v1 = p[1] - pr.pos[1], v2 = p[2] - pr.pos[2], R = pr.R, b = pr.B;
    var q0 = R[0] * v0 + R[3] * v1 + R[6] * v2;
    var q1 = R[1] * v0 + R[4] * v1 + R[7] * v2;
    var q2 = R[2] * v0 + R[5] * v1 + R[8] * v2;
    if (pr.type === 0) return Math.hypot(q0, q1, q2) - b[0];
    if (pr.type === 1) {
      var dx = Math.abs(q0) - b[0] + b[3], dy = Math.abs(q1) - b[1] + b[3], dz = Math.abs(q2) - b[2] + b[3];
      return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0) - b[3];
    }
    if (pr.type === 2) return Math.hypot(Math.hypot(q0, q2) - b[0], q1) - b[1];
    q1 -= clamp(q1, -b[1], b[1]);
    return Math.hypot(q0, q1, q2) - b[0];
  }

  // Blend shapes first, then carving shapes, so that Carve cuts every shape whatever the order
  // in which they were added. The GPU arrays use the same order.
  var ordered = [];
  function reorder() {
    ordered = prims.filter(function (pr) { return !pr.op; }).concat(prims.filter(function (pr) { return pr.op; }));
  }
  function mapObj(p) {
    var d = 1e5, k = Math.max(st.k, 1e-4);
    for (var i = 0; i < ordered.length; i++) {
      var pr = ordered[i];
      var lb = Math.hypot(p[0] - pr.pos[0], p[1] - pr.pos[1], p[2] - pr.pos[2]) - pr.bound;
      if (pr.op ? lb >= k - d : lb >= d + k) continue;
      var di = sdPrim(pr, p), h;
      if (!pr.op) { h = clamp(0.5 + 0.5 * (di - d) / k, 0, 1); d = di + (d - di) * h - k * h * (1 - h); }
      else { h = clamp(0.5 + 0.5 * (di + d) / k, 0, 1); d = -di + (d + di) * h + k * h * (1 - h); }
    }
    return d;
  }
  function clipH() { return st.view === 2 ? st.sliceH : 1e5; }
  function map(p) { return Math.max(Math.min(mapObj(p), p[1]), p[1] - clipH()); }

  // the shader's trace loop, recording every evaluation
  function traceCPU(ro, rd, pixR, record, maxSteps, omega0) {
    var t = 0, omega = omega0, prevF = 0, stepLen = 0, steps = 0, status = -1;
    for (var i = 0; i < maxSteps; i++) {
      steps++;
      var p = add(ro, mul(rd, t));
      var f = map(p);
      if (record && record.length < NPROBE) record.push([p[0], p[1], p[2], Math.abs(f)]);
      if (omega > 1 && Math.abs(f) + prevF < stepLen) {
        t += prevF - stepLen; stepLen = prevF; omega = 1;
        continue;
      }
      if (f < pixR * t + 1e-4) { status = 1; break; }
      stepLen = f * omega; prevF = f; t += stepLen;
      if (t > TMAX) { status = 0; break; }
    }
    return { t: t, steps: steps, status: status };
  }
  // plain sphere trace of one primitive (picking the ghosts)
  function traceOne(pr, ro, rd, tEnd) {
    var t = 0;
    for (var i = 0; i < 80 && t < tEnd; i++) {
      var f = sdPrim(pr, add(ro, mul(rd, t)));
      if (f < 0.002) return t;
      t += f;
    }
    return -1;
  }

  function loadPreset(i) {
    st.preset = i;
    prims = PRESETS[i].prims();
    prims.forEach(derive);
    reorder();
    st.k = PRESETS[i].k;
    sel = -1;
    probe = null;
    colorCursor = prims.length;
  }

  // ------------------------------------------------------------------ camera
  var CAM0 = { yaw: 0.62, pitch: 0.36, dist: 7.2, target: [0, 0.75, 0] };
  var cam = { yaw: CAM0.yaw, pitch: CAM0.pitch, dist: CAM0.dist, target: CAM0.target.slice() };
  var tanHalf = Math.tan((40 * Math.PI) / 360);
  var basis = null;
  function updateBasis() {
    var cp = Math.cos(cam.pitch);
    var off = [Math.sin(cam.yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist, Math.cos(cam.yaw) * cp * cam.dist];
    var pos = add(cam.target, off);
    var f = norm(sub(cam.target, pos));
    var r = norm(cross(f, [0, 1, 0]));
    var u = cross(r, f);
    basis = { pos: pos, f: f, r: r, u: u };
  }
  function rayAt(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var x = (clientX - rect.left) / rect.width, y = (clientY - rect.top) / rect.height;
    var aspect = rect.width / rect.height;
    var u = (2 * x - 1) * aspect, v = 1 - 2 * y;
    return { o: basis.pos.slice(), d: norm(add(basis.f, add(mul(basis.r, u * tanHalf), mul(basis.u, v * tanHalf)))) };
  }

  // ------------------------------------------------------------------ GL resources
  var P, PB, vao, accTex = null, accFb = null, W = 0, H = 0;
  var uniformsA = new Float32Array(MAXP * 4), uniformsB = new Float32Array(MAXP * 4), uniformsC = new Float32Array(MAXP * 4), uniformsR = new Float32Array(MAXP * 9);
  var probeArr = new Float32Array(NPROBE * 4);

  function initGL() {
    P = program(VS, FS);
    PB = program(VS, FS_BLIT);
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  function allocate(w, h) {
    if (accTex) gl.deleteTexture(accTex);
    if (accFb) gl.deleteFramebuffer(accFb);
    accTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, accTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    accFb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, accFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, accTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    W = w;
    H = h;
  }

  function uploadScene(u) {
    for (var i = 0; i < ordered.length; i++) {
      var pr = ordered[i];
      uniformsA.set([pr.pos[0], pr.pos[1], pr.pos[2], pr.type + 8 * pr.op], i * 4);
      uniformsB.set(pr.B, i * 4);
      uniformsC.set([srgbToLin(pr.color[0]), srgbToLin(pr.color[1]), srgbToLin(pr.color[2]), pr.bound], i * 4);
      uniformsR.set(pr.R, i * 9);
    }
    gl.uniform4fv(u.uA, uniformsA);
    gl.uniform4fv(u.uB, uniformsB);
    gl.uniform4fv(u.uC, uniformsC);
    gl.uniformMatrix3fv(u.uR, false, uniformsR);
    gl.uniform1i(u.uN, prims.length);
  }

  // ------------------------------------------------------------------ probe
  var probe = null; // { pts, o, e, steps, status, t }
  function runProbe(clientX, clientY) {
    var ray = rayAt(clientX, clientY);
    var rec = [];
    var res = traceCPU(ray.o, ray.d, tanHalf / Math.max(H, 1), rec, st.maxSteps, st.relax ? 1.6 : 1);
    var tEnd = res.status === 0 ? Math.min(res.t, 14) : res.t;
    probe = { pts: rec, o: ray.o, e: add(ray.o, mul(ray.d, tEnd)), steps: res.steps, status: res.status, t: res.t, clip: st.view === 2 };
  }

  // ------------------------------------------------------------------ UI
  var hint = q(".lab-hint");
  var statsEl = q(".lab-stats");
  var legend = q(".sdf-legend");
  var legendHi = q(".sdf-legend-hi");
  var shapesSeg = q(".sdf-shapes");
  var sliceLabel = q(".sdf-slice");
  var selName = q(".sdf-selname");
  var selTools = q(".sdf-seltools");
  var kOut = q(".sdf-k"), stepsOut = q(".sdf-steps");
  var inK = q('[data-input="k"]'), inSteps = q('[data-input="steps"]'), inSlice = q('[data-input="slice"]');
  var inSize = q('[data-input="size"]'), inHeight = q('[data-input="height"]');
  var dirty = true, accN = 0, flashMsg = "", flashUntil = 0;

  function touch() {
    reorder();
    dirty = true;
    accN = 0;
    kick();
  }

  function setPressed(attr, value) {
    each(qa("[" + attr + "]"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute(attr) === String(value) ? "true" : "false");
    });
  }

  function refreshUI() {
    setPressed("data-tool", st.tool);
    setPressed("data-shape", st.shape);
    setPressed("data-view", st.view);
    setPressed("data-preset", st.preset);
    each(qa("[data-toggle]"), function (b) {
      b.setAttribute("aria-pressed", st[b.getAttribute("data-toggle")] ? "true" : "false");
    });
    shapesSeg.hidden = st.tool !== "add";
    sliceLabel.hidden = st.view !== 2;
    legend.hidden = st.view !== 1;
    legendHi.textContent = fmt(L.hi, { m: Math.min(st.maxSteps, HEAT_MAX) + (st.maxSteps > HEAT_MAX ? "+" : "") });
    hint.textContent = st.tool === "add" ? L.hint1 : st.tool === "probe" ? L.hint2 : L.hint0;
    canvas.style.cursor = st.tool === "move" ? "grab" : "crosshair";
    inK.value = st.k;
    kOut.textContent = st.k.toFixed(2);
    inSteps.value = st.maxSteps;
    stepsOut.textContent = st.maxSteps;
    inSlice.value = st.sliceH;
    if (sel >= 0 && prims[sel]) {
      var pr = prims[sel];
      selName.textContent = L["s" + pr.type] + " " + (sel + 1);
      selTools.hidden = false;
      setPressed("data-op", pr.op);
      inSize.value = pr.scale;
      inHeight.value = pr.pos[1];
    } else {
      selName.textContent = st.tool === "add" ? L.hint1 : st.tool === "probe" ? L.hint2 : L.nosel;
      selTools.hidden = true;
    }
  }

  function bindSeg(attr, fn) {
    each(qa("[" + attr + "]"), function (b) {
      b.addEventListener("click", function () {
        fn(b.getAttribute(attr));
        refreshUI();
        touch();
      });
    });
  }
  bindSeg("data-tool", function (v) { st.tool = v; });
  bindSeg("data-shape", function (v) { st.shape = +v; });
  bindSeg("data-view", function (v) { st.view = +v; if (probe && probe.clip !== (st.view === 2)) probe = null; });
  bindSeg("data-preset", function (v) {
    loadPreset(+v);
    cam.yaw = CAM0.yaw;
    cam.pitch = CAM0.pitch;
    cam.dist = CAM0.dist;
  });
  bindSeg("data-op", function (v) {
    if (sel >= 0) prims[sel].op = +v;
    probe = null;
  });
  bindSeg("data-toggle", function (v) { st[v] = !st[v]; if (v === "relax") probe = null; });
  each(qa('[data-action="delete"]'), function (b) {
    b.addEventListener("click", function () {
      if (sel >= 0) {
        prims.splice(sel, 1);
        sel = -1;
        probe = null;
        refreshUI();
        touch();
      }
    });
  });
  inK.addEventListener("input", function () { st.k = +inK.value; kOut.textContent = st.k.toFixed(2); probe = null; touch(); });
  inSteps.addEventListener("input", function () { st.maxSteps = +inSteps.value; probe = null; refreshUI(); touch(); });
  inSlice.addEventListener("input", function () { st.sliceH = +inSlice.value; probe = null; touch(); });
  inSize.addEventListener("input", function () {
    if (sel < 0) return;
    prims[sel].scale = +inSize.value;
    derive(prims[sel]);
    probe = null;
    touch();
  });
  inHeight.addEventListener("input", function () {
    if (sel < 0) return;
    prims[sel].pos[1] = +inHeight.value;
    probe = null;
    touch();
  });

  // ------------------------------------------------------------------ picking
  function pick(ray) {
    var res = traceCPU(ray.o, ray.d, 1e-4, null, 400, 1);
    var tS = res.status === 1 ? res.t : 1e9;
    var best = -1, bestT = tS;
    if (res.status === 1) {
      var p = add(ray.o, mul(ray.d, res.t));
      if (mapObj(p) <= p[1] + 0.01) {
        var md = 0.12 + st.k;
        for (var i = 0; i < prims.length; i++) {
          var di = Math.abs(sdPrim(prims[i], p));
          if (di < md) { md = di; best = i; }
        }
      }
    }
    // ghosts: carving shapes, and the selected shape, can be grabbed where they float in front
    for (var j = 0; j < prims.length; j++) {
      if (!prims[j].op && j !== sel) continue;
      var tg = traceOne(prims[j], ray.o, ray.d, Math.min(bestT, TMAX));
      if (tg > 0 && tg < bestT - 0.004) { bestT = tg; best = j; }
    }
    return { index: best, hit: res.status === 1, t: res.t };
  }

  function placeShape(ray) {
    if (prims.length >= MAXP) {
      flashMsg = L.full;
      flashUntil = performance.now() + 2000;
      return;
    }
    var res = traceCPU(ray.o, ray.d, 1e-4, null, 400, 1);
    var p;
    if (res.status === 1) p = add(ray.o, mul(ray.d, res.t));
    else if (ray.d[1] < -0.02) p = add(ray.o, mul(ray.d, -ray.o[1] / ray.d[1]));
    else return;
    var type = st.shape;
    var color = PALETTE[colorCursor++ % PALETTE.length];
    var pr = prim(type, [0, 0, 0], BASE[type], color, 0, type === 1 ? 0.5 : type === 3 ? 0.3 : 0, type === 3 ? 1.5708 : 0);
    derive(pr);
    var e = 0.001;
    var n = norm([map(add(p, [e, 0, 0])) - map(add(p, [-e, 0, 0])), map(add(p, [0, e, 0])) - map(add(p, [0, -e, 0])), map(add(p, [0, 0, e])) - map(add(p, [0, 0, -e]))]);
    var lift = type === 0 ? pr.B[0] : type === 1 ? pr.B[1] : type === 2 ? pr.B[1] : pr.B[0];
    var c = add(p, mul(n, lift * 0.55));
    c[0] = clamp(c[0], -REGION + 0.3, REGION - 0.3);
    c[2] = clamp(c[2], -REGION + 0.3, REGION - 0.3);
    c[1] = clamp(c[1], lift * 0.7, 3);
    pr.pos = c;
    prims.push(pr);
    sel = prims.length - 1;
    probe = null;
  }

  // ------------------------------------------------------------------ pointer input
  var pointers = {};
  var gesture = null; // { kind: "orbit" | "move" | "tap" | "pinch", ... }
  function pointerCount() { return Object.keys(pointers).length; }

  canvas.addEventListener("pointerdown", function (e) {
    if (e.button !== undefined && e.button > 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    hint.style.opacity = "0";
    if (pointerCount() === 2) {
      var ids = Object.keys(pointers), a = pointers[ids[0]], b = pointers[ids[1]];
      gesture = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, dist0: cam.dist };
      return;
    }
    if (pointerCount() > 2) return;
    gesture = { kind: "tap", x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    if (st.tool === "move") {
      var ray = rayAt(e.clientX, e.clientY);
      var pk = pick(ray);
      if (pk.index >= 0) {
        gesture.picked = true;
        sel = pk.index;
        var pr = prims[sel];
        if (Math.abs(ray.d[1]) > 0.04) {
          var tp = (pr.pos[1] - ray.o[1]) / ray.d[1];
          var hp = add(ray.o, mul(ray.d, tp));
          gesture = { kind: "move", x0: e.clientX, y0: e.clientY, off: sub(pr.pos, hp), y: pr.pos[1] };
          canvas.style.cursor = "grabbing";
        }
        probe = null;
        refreshUI();
        touch();
      }
    }
  });

  canvas.addEventListener("pointermove", function (e) {
    var pt = pointers[e.pointerId];
    if (!pt || !gesture) return;
    var dx = e.clientX - pt.x, dy = e.clientY - pt.y;
    pt.x = e.clientX;
    pt.y = e.clientY;
    if (gesture.kind === "pinch") {
      var ids = Object.keys(pointers);
      if (ids.length < 2) return;
      var a = pointers[ids[0]], b = pointers[ids[1]];
      cam.dist = clamp(gesture.dist0 * gesture.d0 / (Math.hypot(a.x - b.x, a.y - b.y) || 1), 3, 14);
      touch();
      return;
    }
    if (gesture.kind === "tap" && Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0) > 6) gesture.kind = "orbit";
    if (gesture.kind === "orbit") {
      var rect = canvas.getBoundingClientRect();
      var sc = 3.2 / Math.max(rect.width, 200);
      cam.yaw -= dx * sc;
      cam.pitch = clamp(cam.pitch + dy * sc, 0.06, 1.35);
      touch();
    } else if (gesture.kind === "move" && sel >= 0) {
      var ray = rayAt(e.clientX, e.clientY);
      if (Math.abs(ray.d[1]) < 0.04) return;
      var tp = (gesture.y - ray.o[1]) / ray.d[1];
      if (tp <= 0) return;
      var hp = add(add(ray.o, mul(ray.d, tp)), gesture.off);
      var pr = prims[sel];
      pr.pos[0] = clamp(hp[0], -REGION + 0.2, REGION - 0.2);
      pr.pos[2] = clamp(hp[2], -REGION + 0.2, REGION - 0.2);
      touch();
    }
  });

  function endPointer(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    if (!gesture) return;
    if (gesture.kind === "pinch") {
      gesture = pointerCount() === 1 ? { kind: "orbit" } : null;
      return;
    }
    if (gesture.kind === "tap" && e.type === "pointerup") {
      if (st.tool === "add") placeShape(rayAt(e.clientX, e.clientY));
      else if (st.tool === "probe") runProbe(e.clientX, e.clientY);
      else if (!gesture.picked) sel = -1; // a tap on empty space clears the selection
      refreshUI();
      touch();
    }
    if (gesture.kind === "move") canvas.style.cursor = "grab";
    gesture = null;
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("dblclick", function () {
    cam.yaw = CAM0.yaw;
    cam.pitch = CAM0.pitch;
    cam.dist = CAM0.dist;
    touch();
  });
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  // trackpad pinch arrives as a wheel event with ctrlKey; plain wheel scrolling is left to the page
  canvas.addEventListener("wheel", function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.01), 3, 14);
    touch();
  }, { passive: false });

  // ------------------------------------------------------------------ frame loop
  var maxScale = Math.min(window.devicePixelRatio || 1, 1.5);
  var scale = Math.min(maxScale, 1);
  var frameTimes = [], lastT = 0, fps = 0, upgrades = 0, lastDown = 0;
  var halton = [];
  (function () {
    function h(i, b) { var f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }
    for (var i = 0; i < AA_FRAMES; i++) halton.push([h(i + 1, 2) - 0.5, h(i + 1, 3) - 0.5]);
  })();

  // Resolution scaling: the cost of a frame is proportional to the pixel count, so a frame that is
  // too slow by a factor r is fixed by scaling both sides by about sqrt(1 / r).
  function adapt(dt, now) {
    frameTimes.push(dt);
    var n = frameTimes.length;
    if (n < 12 && !(n >= 3 && dt > 0.15)) return;
    var avg = frameTimes.reduce(function (x, y) { return x + y; }, 0) / n;
    frameTimes = [];
    // never below about 220 pixels across, so a small phone canvas stays legible
    var minScale = clamp(220 / Math.max(canvas.clientWidth, 1), 0.3, 0.6);
    if (avg > 0.034 && scale > minScale) {
      scale = Math.max(minScale, scale * clamp(Math.sqrt(0.025 / avg), 0.5, 0.85));
      lastDown = now;
      touch();
    } else if (avg < 0.019 && scale < maxScale && upgrades < 4 && now - lastDown > 4000) {
      scale = Math.min(maxScale, scale * 1.15);
      upgrades++;
      touch();
    }
  }

  function render(now) {
    var dt = lastT ? (now - lastT) / 1000 : 0;
    lastT = now;
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw < 2 || ch < 2) return false;
    var w = Math.max(16, Math.round(cw * scale)), h = Math.max(16, Math.round(ch * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (w !== W || h !== H) {
      allocate(w, h);
      accN = 0;
    }
    if (dirty) accN = 0;
    var interacting = dirty;
    dirty = false;
    updateBasis();

    if (accN < AA_FRAMES) {
      var u = P.u;
      gl.bindFramebuffer(gl.FRAMEBUFFER, accFb);
      gl.viewport(0, 0, W, H);
      gl.useProgram(P.p);
      gl.bindVertexArray(vao);
      uploadScene(u);
      gl.uniform1f(u.uK, Math.max(st.k, 1e-4));
      gl.uniform3fv(u.uCamPos, basis.pos);
      gl.uniform3fv(u.uCamR, basis.r);
      gl.uniform3fv(u.uCamU, basis.u);
      gl.uniform3fv(u.uCamF, basis.f);
      gl.uniform1f(u.uTanHalf, tanHalf);
      gl.uniform2f(u.uRes, W, H);
      var j = accN === 0 ? [0, 0] : halton[accN];
      gl.uniform2f(u.uJitter, j[0], j[1]);
      gl.uniform1i(u.uView, st.view);
      gl.uniform1i(u.uMaxSteps, st.maxSteps);
      gl.uniform1f(u.uOmega, st.relax ? 1.6 : 1.0);
      gl.uniform1i(u.uSoft, st.soft ? 1 : 0);
      gl.uniform1i(u.uAO, st.ao ? 1 : 0);
      gl.uniform1f(u.uSliceH, st.sliceH);
      gl.uniform1i(u.uSel, sel >= 0 ? ordered.indexOf(prims[sel]) : -1);
      var np = probe ? probe.pts.length : 0;
      if (probe) {
        for (var i = 0; i < np; i++) probeArr.set(probe.pts[i], i * 4);
        gl.uniform4fv(u.uProbe, probeArr);
        gl.uniform3fv(u.uProbeO, probe.o);
        gl.uniform3fv(u.uProbeE, probe.e);
        gl.uniform1i(u.uProbeHit, probe.status === 1 ? 1 : 0);
      }
      gl.uniform1i(u.uProbeN, np);
      if (accN === 0) gl.disable(gl.BLEND);
      else {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
        gl.blendColor(0, 0, 0, 1 / (accN + 1));
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
      accN++;

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(PB.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, accTex);
      gl.uniform1i(PB.u.uTex, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();

      if (dt > 0) {
        fps = fps ? fps * 0.85 + (1 / dt) * 0.15 : 1 / dt;
        adapt(dt, now);
      }
    }
    var viewName = L["v" + st.view];
    var tail = accN < AA_FRAMES || interacting ? (fps ? (fps < 10 ? fps.toFixed(1) : Math.round(fps)) + " fps" : "\u2026") : fmt(L.aa, { a: accN });
    var line = fmt(L.stats, { n: prims.length, k: st.k.toFixed(2), view: viewName, res: W + "\u00d7" + H, fps: tail });
    if (probe) {
      var pl = probe.status === 1 ? fmt(L.probe, { s: probe.steps, t: probe.t.toFixed(2) }) : probe.status === 0 ? fmt(L.probeMiss, { s: probe.steps }) : fmt(L.probeOut, { s: probe.steps });
      line += "\n" + pl;
    }
    if (flashMsg && now < flashUntil) line += "\n" + flashMsg;
    else if (flashMsg) { flashMsg = ""; }
    statsEl.textContent = line;
    return accN < AA_FRAMES || (flashMsg !== "");
  }

  var visible = false, raf = 0, started = false, tried = false;
  // At most one frame in flight: a fence tells when the GPU has finished the previous frame, so
  // slow GPUs do not queue up work, and the time between renders measures the real frame cost.
  var fence = null;
  function tick(now) {
    raf = 0;
    if (gl.isContextLost()) return;
    if (fence) {
      if (gl.clientWaitSync(fence, 0, 0) === gl.TIMEOUT_EXPIRED) {
        if (visible && !document.hidden) raf = requestAnimationFrame(tick);
        return;
      }
      gl.deleteSync(fence);
      fence = null;
    }
    var more = render(now);
    if (more && visible && !document.hidden) raf = requestAnimationFrame(tick);
    else lastT = 0;
  }
  function kick() {
    if (started && !raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) touch(); });
  canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
  if (window.ResizeObserver) new ResizeObserver(function () { touch(); }).observe(canvas);

  function start() {
    started = true;
    try {
      gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    } catch (e) {
      gl = null;
    }
    if (!gl) {
      started = false;
      fail();
      return;
    }
    try {
      initGL();
    } catch (err) {
      fail();
      started = false;
      if (window.console) console.warn(err);
      return;
    }
    statsEl.style.whiteSpace = "pre-line";
    loadPreset(0);
    refreshUI();
    touch();
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e) {
      visible = e[0].isIntersecting;
      if (visible && !tried) { tried = true; start(); }
      else if (visible) touch();
    }).observe(canvas);
  } else {
    visible = true;
    tried = true;
    start();
  }
})();
