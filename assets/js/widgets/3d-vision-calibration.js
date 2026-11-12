/* Camera calibration lab (3d-vision post 02).
   The same synthetic camera, board and twelve board poses as the post's code: 640 x 480 image,
   fx = 600, fy = 596, (cx, cy) = (322, 236), radial distortion k1 = -0.28, k2 = 0.07; a 9 x 6 corner
   board with 30 mm squares. Pick which views to use; the widget runs the whole pipeline in the browser:
   normalized DLT homographies -> Zhang's closed form -> Levenberg-Marquardt on (fx, fy, cx, cy, k1, k2)
   and all board poses -> covariance sigma^2 (J^T J)^-1 -> projection-uncertainty map (after removing the
   part a small camera rotation explains). OpenCV camera frame: x right, y down, z forward. */
(function () {
  "use strict";
  var W = 640, H = 480, SQ = 0.03, NX = 9, NY = 6, NP = NX * NY;
  var TRUE = [600, 596, 322, 236, -0.28, 0.07];
  var POSES = [[0, 0, 0, [0, 0, 0.55]], [0, 0, 0, [0, 0, 0.40]], [0, 0, 20, [0.06, 0.05, 0.80]],
    [0, 35, 0, [0, 0, 0.55]], [0, -35, 0, [0, 0, 0.55]], [35, 0, 0, [0, 0, 0.55]],
    [-35, 0, 0, [0, 0, 0.55]], [20, -25, 10, [-0.16, -0.115, 0.60]],
    [20, 25, -10, [0.16, -0.115, 0.60]], [-20, -25, -10, [-0.16, 0.115, 0.60]],
    [-20, 25, 10, [0.16, 0.115, 0.60]], [25, 20, 40, [0, 0, 0.50]]];
  var VCOL = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f",
    "#bcbd22", "#17becf", "#7fa9d6", "#5fbf52"];
  var TXT = {
    en: {
      hint: "Tap a board (in the 3D view or the image) or a numbered button to add or remove that view. Drag the 3D view to orbit it.",
      noise: "corner noise \u03c3 (px)", map: "projection-uncertainty map", fresh: "new noise",
      pFront: "frontal 1-3", pCentre: "centre 1, 4-7", pAll: "all 12", pCorner: "+ corners 8-11",
      param: "parameter", truth: "true", est: "estimate \u00b1 1\u03c3",
      views: "views", corners: "corners", rms: "RMS reprojection error", expect: "expected",
      need: "Select at least 3 views: Zhang's closed form needs 3 homographies.",
      degen: "Closed form failed (the boards are almost parallel), so LM started from a rough guess.",
      unobs: "Some parameters are not observable from these views (huge \u03c3): add tilted boards.",
      ok: "Converged.", mapnote: "map: std of re-projecting a ray (px), log scale 0.05 to 10; gray = model folds",
      inf: "\u221e"
    },
    zh: {
      hint: "\u70b9\u51fb\u68cb\u76d8\u683c\uff083D \u89c6\u56fe\u6216\u56fe\u50cf\u4e2d\uff09\u6216\u7f16\u53f7\u6309\u94ae\uff0c\u52a0\u5165\u6216\u53bb\u6389\u8be5\u89c6\u56fe\uff1b\u62d6\u52a8 3D \u89c6\u56fe\u53ef\u65cb\u8f6c\u3002",
      noise: "\u89d2\u70b9\u566a\u58f0 \u03c3\uff08\u50cf\u7d20\uff09", map: "\u6295\u5f71\u4e0d\u786e\u5b9a\u5ea6\u56fe", fresh: "\u91cd\u65b0\u751f\u6210\u566a\u58f0",
      pFront: "\u6b63\u5bf9 1-3", pCentre: "\u4e2d\u592e 1, 4-7", pAll: "\u5168\u90e8 12", pCorner: "+ \u56db\u89d2 8-11",
      param: "\u53c2\u6570", truth: "\u771f\u503c", est: "\u4f30\u8ba1 \u00b1 1\u03c3",
      views: "\u89c6\u56fe", corners: "\u89d2\u70b9", rms: "RMS \u91cd\u6295\u5f71\u8bef\u5dee", expect: "\u671f\u671b",
      need: "\u81f3\u5c11\u9009\u62e9 3 \u4e2a\u89c6\u56fe\uff1a\u5f20\u6b63\u53cb\u95ed\u5f0f\u89e3\u9700\u8981 3 \u4e2a\u5355\u5e94\u77e9\u9635\u3002",
      degen: "\u95ed\u5f0f\u89e3\u5931\u8d25\uff08\u68cb\u76d8\u683c\u51e0\u4e4e\u4e92\u76f8\u5e73\u884c\uff09\uff0cLM \u4ece\u7c97\u7565\u521d\u503c\u5f00\u59cb\u3002",
      unobs: "\u90e8\u5206\u53c2\u6570\u65e0\u6cd5\u4ece\u8fd9\u4e9b\u89c6\u56fe\u4e2d\u786e\u5b9a\uff08\u03c3 \u6781\u5927\uff09\uff1a\u8bf7\u52a0\u5165\u503e\u659c\u7684\u68cb\u76d8\u683c\u3002",
      ok: "\u5df2\u6536\u655b\u3002", mapnote: "\u56fe\uff1a\u91cd\u6295\u5f71\u4e00\u6761\u5149\u7ebf\u7684\u6807\u51c6\u5dee\uff08\u50cf\u7d20\uff09\uff0c\u5bf9\u6570\u8272\u6807 0.05 \u5230 10\uff1b\u7070\u8272 = \u6a21\u578b\u6298\u8fd4",
      inf: "\u221e"
    },
    ja: {
      hint: "\u30dc\u30fc\u30c9\uff083D \u30d3\u30e5\u30fc\u307e\u305f\u306f\u753b\u50cf\u5185\uff09\u304b\u756a\u53f7\u30dc\u30bf\u30f3\u3092\u30bf\u30c3\u30d7\u3059\u308b\u3068\u3001\u305d\u306e\u30d3\u30e5\u30fc\u3092\u8ffd\u52a0\u30fb\u524a\u9664\u3067\u304d\u307e\u3059\u30023D \u30d3\u30e5\u30fc\u306f\u30c9\u30e9\u30c3\u30b0\u3067\u56de\u8ee2\u3057\u307e\u3059\u3002",
      noise: "\u30b3\u30fc\u30ca\u30fc\u306e\u30ce\u30a4\u30ba \u03c3\uff08\u30d4\u30af\u30bb\u30eb\uff09", map: "\u6295\u5f71\u306e\u4e0d\u78ba\u304b\u3055\u30de\u30c3\u30d7", fresh: "\u30ce\u30a4\u30ba\u3092\u518d\u751f\u6210",
      pFront: "\u6b63\u9762 1-3", pCentre: "\u4e2d\u592e 1, 4-7", pAll: "\u5168 12", pCorner: "+ \u56db\u9685 8-11",
      param: "\u30d1\u30e9\u30e1\u30fc\u30bf", truth: "\u771f\u5024", est: "\u63a8\u5b9a\u5024 \u00b1 1\u03c3",
      views: "\u30d3\u30e5\u30fc", corners: "\u30b3\u30fc\u30ca\u30fc", rms: "RMS \u518d\u6295\u5f71\u8aa4\u5dee", expect: "\u671f\u5f85\u5024",
      need: "\u30d3\u30e5\u30fc\u3092 3 \u3064\u4ee5\u4e0a\u9078\u3093\u3067\u304f\u3060\u3055\u3044\uff1aZhang \u306e\u9589\u5f62\u5f0f\u89e3\u306b\u306f 3 \u3064\u306e\u30db\u30e2\u30b0\u30e9\u30d5\u30a3\u304c\u5fc5\u8981\u3067\u3059\u3002",
      degen: "\u9589\u5f62\u5f0f\u89e3\u304c\u5931\u6557\u3057\u307e\u3057\u305f\uff08\u30dc\u30fc\u30c9\u304c\u307b\u307c\u5e73\u884c\uff09\u3002LM \u306f\u5927\u307e\u304b\u306a\u521d\u671f\u5024\u304b\u3089\u59cb\u3081\u307e\u3057\u305f\u3002",
      unobs: "\u3053\u308c\u3089\u306e\u30d3\u30e5\u30fc\u3067\u306f\u6c7a\u307e\u3089\u306a\u3044\u30d1\u30e9\u30e1\u30fc\u30bf\u304c\u3042\u308a\u307e\u3059\uff08\u03c3 \u304c\u5de8\u5927\uff09\uff1a\u50be\u3051\u305f\u30dc\u30fc\u30c9\u3092\u52a0\u3048\u3066\u304f\u3060\u3055\u3044\u3002",
      ok: "\u53ce\u675f\u3057\u307e\u3057\u305f\u3002", mapnote: "\u30de\u30c3\u30d7\uff1a\u5149\u7dda\u3092\u518d\u6295\u5f71\u3057\u305f\u3068\u304d\u306e\u6a19\u6e96\u504f\u5dee\uff08\u30d4\u30af\u30bb\u30eb\uff09\u3001\u5bfe\u6570\u30b9\u30b1\u30fc\u30eb 0.05\u301c10\u3002\u7070\u8272 = \u30e2\u30c7\u30eb\u304c\u6298\u308a\u8fd4\u3059\u9818\u57df",
      inf: "\u221e"
    }
  };
  var COL = { x: "#d62728", y: "#2ca02c", z: "#1f77b4", a: "#9467bd", gray: "#7f7f7f", dark: "#222222",
    bg: "#fbfbfd" };
  var PNAMES = ["fx", "fy", "cx", "cy", "k1", "k2"];

  // ---------------------------------------------------------------- small linear algebra
  function rodrigues(r) {
    var th = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]);
    if (th < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    var x = r[0] / th, y = r[1] / th, z = r[2] / th, c = Math.cos(th), s = Math.sin(th), C1 = 1 - c;
    return [c + x * x * C1, x * y * C1 - z * s, x * z * C1 + y * s,
      y * x * C1 + z * s, c + y * y * C1, y * z * C1 - x * s,
      z * x * C1 - y * s, z * y * C1 + x * s, c + z * z * C1];
  }
  function rvecOf(R) {
    var c = Math.max(-1, Math.min(1, (R[0] + R[4] + R[8] - 1) / 2)), th = Math.acos(c);
    if (th < 1e-12) return [0, 0, 0];
    var k = th / (2 * Math.sin(th));
    return [k * (R[7] - R[5]), k * (R[2] - R[6]), k * (R[3] - R[1])];
  }
  function mul3(A, B) {
    var C = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++)
      C[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j];
    return C;
  }
  function inv3(M) {
    var a = M[0], b = M[1], c = M[2], d = M[3], e = M[4], f = M[5], g = M[6], h = M[7], i = M[8];
    var A = e * i - f * h, B = -(d * i - f * g), Cc = d * h - e * g, det = a * A + b * B + c * Cc;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
      B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
      Cc / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }
  function transpose3(M) { return [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]]; }
  function nearestRotation(M) {          // polar factor by Newton iteration R <- (R + R^-T) / 2
    var R = M.slice();
    for (var it = 0; it < 30; it++) {
      var Ri = transpose3(inv3(R));
      for (var k = 0; k < 9; k++) R[k] = 0.5 * (R[k] + Ri[k]);
    }
    return R;
  }
  function jacobiMinVec(A, n) {          // eigenvector of the smallest eigenvalue of a symmetric n x n
    var a = A.slice(), V = [], i, j, k;
    for (i = 0; i < n * n; i++) V.push(i % (n + 1) === 0 ? 1 : 0);
    for (var sweep = 0; sweep < 60; sweep++) {
      var off = 0;
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) off += a[i * n + j] * a[i * n + j];
      if (off < 1e-30) break;
      for (var p = 0; p < n; p++) for (var q = p + 1; q < n; q++) {
        var apq = a[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        var theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        var t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        var c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (k = 0; k < n; k++) {
          var akp = a[k * n + p], akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq; a[k * n + q] = s * akp + c * akq;
        }
        for (k = 0; k < n; k++) {
          var apk = a[p * n + k], aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk; a[q * n + k] = s * apk + c * aqk;
        }
        for (k = 0; k < n; k++) {
          var vkp = V[k * n + p], vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
    var m = 0, ev = [];
    for (i = 0; i < n; i++) { ev.push(a[i * n + i]); if (a[i * n + i] < a[m * n + m]) m = i; }
    var v = [];
    for (i = 0; i < n; i++) v.push(V[i * n + m]);
    ev.sort(function (x, y) { return x - y; });
    return { v: v, ev: ev };
  }
  function cholesky(A, n) {              // lower L with A = L L^T, or null if not positive definite
    var L = new Float64Array(n * n);
    for (var i = 0; i < n; i++) for (var j = 0; j <= i; j++) {
      var s = A[i * n + j];
      for (var k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      if (i === j) { if (!(s > 0)) return null; L[i * n + i] = Math.sqrt(s); }
      else L[i * n + j] = s / L[j * n + j];
    }
    return L;
  }
  function cholSolve(L, b, n) {
    var y = new Float64Array(n), x = new Float64Array(n), i, k, s;
    for (i = 0; i < n; i++) { s = b[i]; for (k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
    for (i = n - 1; i >= 0; i--) { s = y[i]; for (k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
    return x;
  }

  // ---------------------------------------------------------------- camera model and data
  var OBJ = [];
  for (var r_ = 0; r_ < NY; r_++) for (var c_ = 0; c_ < NX; c_++) OBJ.push([c_ * SQ, r_ * SQ]);
  function boardPose(P) {
    var d = Math.PI / 180;
    var R = mul3(rodrigues([0, 0, P[2] * d]), mul3(rodrigues([P[0] * d, 0, 0]), rodrigues([0, P[1] * d, 0])));
    var cx = 4 * SQ, cy = 2.5 * SQ, c = P[3];
    return { R: R, t: [c[0] - (R[0] * cx + R[1] * cy), c[1] - (R[3] * cx + R[4] * cy), c[2] - (R[6] * cx + R[7] * cy)] };
  }
  var VIEWS = POSES.map(boardPose);
  // th = [fx, fy, cx, cy, k1, k2]; R as 9-array, t as 3-array; writes 2 * NP pixel coords into out
  function projectBoard(th, R, t, out, off) {
    for (var k = 0; k < NP; k++) {
      var X = OBJ[k][0], Y = OBJ[k][1];
      var xc = R[0] * X + R[1] * Y + t[0], yc = R[3] * X + R[4] * Y + t[1], zc = R[6] * X + R[7] * Y + t[2];
      var x = xc / zc, y = yc / zc, r2 = x * x + y * y, rad = 1 + th[4] * r2 + th[5] * r2 * r2;
      out[off + 2 * k] = th[0] * x * rad + th[2];
      out[off + 2 * k + 1] = th[1] * y * rad + th[3];
    }
  }
  function projectRay(th, x, y) {
    var r2 = x * x + y * y, rad = 1 + th[4] * r2 + th[5] * r2 * r2;
    return [th[0] * x * rad + th[2], th[1] * y * rad + th[3]];
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussians(seed, n) {
    var rnd = mulberry32(seed), g = new Float64Array(n);
    for (var i = 0; i < n; i += 2) {
      var u = Math.max(rnd(), 1e-12), v = rnd(), m = Math.sqrt(-2 * Math.log(u));
      g[i] = m * Math.cos(2 * Math.PI * v); if (i + 1 < n) g[i + 1] = m * Math.sin(2 * Math.PI * v);
    }
    return g;
  }
  var CLEAN = VIEWS.map(function (v) { var o = new Float64Array(2 * NP); projectBoard(TRUE, v.R, v.t, o, 0); return o; });

  // ---------------------------------------------------------------- calibration pipeline
  function normT(pts) {                  // Hartley normalization of a list of [x, y]
    var cx = 0, cy = 0, d = 0, n = pts.length, i;
    for (i = 0; i < n; i++) { cx += pts[i][0]; cy += pts[i][1]; }
    cx /= n; cy /= n;
    for (i = 0; i < n; i++) d += Math.hypot(pts[i][0] - cx, pts[i][1] - cy);
    var k = Math.SQRT2 / (d / n);
    return [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1];
  }
  var T1 = normT(OBJ);
  function homography(o) {
    var img = [], i;
    for (i = 0; i < NP; i++) img.push([o[2 * i], o[2 * i + 1]]);
    var T2 = normT(img), M = new Float64Array(81);
    for (i = 0; i < NP; i++) {
      var X = T1[0] * OBJ[i][0] + T1[2], Y = T1[4] * OBJ[i][1] + T1[5];
      var u = T2[0] * img[i][0] + T2[2], v = T2[4] * img[i][1] + T2[5];
      var rows = [[X, Y, 1, 0, 0, 0, -u * X, -u * Y, -u], [0, 0, 0, X, Y, 1, -v * X, -v * Y, -v]];
      for (var r = 0; r < 2; r++) for (var a = 0; a < 9; a++) for (var b = 0; b < 9; b++) M[a * 9 + b] += rows[r][a] * rows[r][b];
    }
    var h = jacobiMinVec(Array.prototype.slice.call(M), 9).v;
    var Hm = mul3(inv3(T2), mul3(h, T1));
    for (i = 0; i < 9; i++) Hm[i] /= Hm[8];
    return Hm;
  }
  function vij(Hm, i, j) {
    var a = [Hm[i], Hm[3 + i], Hm[6 + i]], c = [Hm[j], Hm[3 + j], Hm[6 + j]];
    return [a[0] * c[0], a[0] * c[1] + a[1] * c[0], a[1] * c[1], a[2] * c[0] + a[0] * c[2], a[2] * c[1] + a[1] * c[2], a[2] * c[2]];
  }
  function zhang(Hs) {
    var M = new Array(36).fill(0);
    Hs.forEach(function (Hm) {
      var r1 = vij(Hm, 0, 1), a = vij(Hm, 0, 0), b = vij(Hm, 1, 1), r2 = a.map(function (x, k) { return x - b[k]; });
      [r1, r2].forEach(function (r) { for (var p = 0; p < 6; p++) for (var q = 0; q < 6; q++) M[p * 6 + q] += r[p] * r[q]; });
    });
    var e = jacobiMinVec(M, 6), b = e.v;
    var B = [b[0], b[1], b[3], b[1], b[2], b[4], b[3], b[4], b[5]];
    if (B[0] < 0) B = B.map(function (x) { return -x; });
    var L = cholesky(B, 3);
    if (!L) return null;
    var Lt = [L[0], L[3], L[6], 0, L[4], L[7], 0, 0, L[8]];
    var K = inv3(Lt);
    for (var k = 0; k < 9; k++) K[k] /= K[8];
    if (!(K[0] > 50 && K[4] > 50 && K[0] < 1e5 && K[4] < 1e5)) return null;
    return K;
  }
  function extrinsics(K, Hm) {
    var M = mul3(inv3(K), Hm);
    var lam = 1 / Math.hypot(M[0], M[3], M[6]);
    if (M[8] < 0) lam = -lam;
    var r1 = [lam * M[0], lam * M[3], lam * M[6]], r2 = [lam * M[1], lam * M[4], lam * M[7]];
    var r3 = [r1[1] * r2[2] - r1[2] * r2[1], r1[2] * r2[0] - r1[0] * r2[2], r1[0] * r2[1] - r1[1] * r2[0]];
    var R = nearestRotation([r1[0], r2[0], r3[0], r1[1], r2[1], r3[1], r1[2], r2[2], r3[2]]);
    return { r: rvecOf(R), t: [lam * M[2], lam * M[5], lam * M[8]] };
  }
  function residuals(p, obsList, out) {   // out: Float64Array(2 * NP * N)
    var th = p.slice(0, 6);
    for (var v = 0; v < obsList.length; v++) {
      var q = 6 + 6 * v, R = rodrigues([p[q], p[q + 1], p[q + 2]]);
      projectBoard(th, R, [p[q + 3], p[q + 4], p[q + 5]], out, 2 * NP * v);
      for (var k = 0; k < 2 * NP; k++) out[2 * NP * v + k] -= obsList[v][k];
    }
    return out;
  }
  // block Jacobian: Ji[v] (2NP x 6, intrinsics) and Jp[v] (2NP x 6, pose of view v)
  function jacobian(p, obsList, r0) {
    var N = obsList.length, m = 2 * NP, Ji = [], Jp = [], v, k, j;
    var tmp = new Float64Array(m);
    for (v = 0; v < N; v++) { Ji.push(new Float64Array(m * 6)); Jp.push(new Float64Array(m * 6)); }
    for (j = 0; j < 6; j++) {
      var pp = p.slice(), h = 1e-6 * Math.max(1, Math.abs(p[j]));
      pp[j] += h;
      var th = pp.slice(0, 6);
      for (v = 0; v < N; v++) {
        var q = 6 + 6 * v;
        projectBoard(th, rodrigues([p[q], p[q + 1], p[q + 2]]), [p[q + 3], p[q + 4], p[q + 5]], tmp, 0);
        for (k = 0; k < m; k++) Ji[v][k * 6 + j] = (tmp[k] - obsList[v][k] - r0[m * v + k]) / h;
      }
    }
    var th0 = p.slice(0, 6);
    for (v = 0; v < N; v++) {
      for (j = 0; j < 6; j++) {
        var q2 = 6 + 6 * v, pv = p.slice(q2, q2 + 6), h2 = 1e-6 * Math.max(1, Math.abs(pv[j]));
        pv[j] += h2;
        projectBoard(th0, rodrigues([pv[0], pv[1], pv[2]]), [pv[3], pv[4], pv[5]], tmp, 0);
        for (k = 0; k < m; k++) Jp[v][k * 6 + j] = (tmp[k] - obsList[v][k] - r0[m * v + k]) / h2;
      }
    }
    return { Ji: Ji, Jp: Jp };
  }
  function normalEq(Jb, r, N) {          // A = J^T J (P x P), g = J^T r
    var P = 6 + 6 * N, m = 2 * NP, A = new Float64Array(P * P), g = new Float64Array(P), v, k, a, b;
    for (v = 0; v < N; v++) {
      var Ji = Jb.Ji[v], Jp = Jb.Jp[v], o = 6 + 6 * v;
      for (k = 0; k < m; k++) {
        var rk = r[m * v + k];
        for (a = 0; a < 6; a++) {
          var ia = Ji[k * 6 + a], pa = Jp[k * 6 + a];
          g[a] += ia * rk; g[o + a] += pa * rk;
          for (b = 0; b < 6; b++) {
            A[a * P + b] += ia * Ji[k * 6 + b];
            A[a * P + o + b] += ia * Jp[k * 6 + b];
            A[(o + a) * P + o + b] += pa * Jp[k * 6 + b];
          }
        }
      }
      for (a = 0; a < 6; a++) for (b = 0; b < 6; b++) A[(o + b) * P + a] = A[a * P + o + b];
    }
    return { A: A, g: g, P: P };
  }
  function sumsq(r) { var s = 0; for (var i = 0; i < r.length; i++) s += r[i] * r[i]; return s; }

  function calibrate(sel, sigma, seed) {
    var N = sel.length, res = { N: N, sel: sel.slice() };
    var obsList = sel.map(function (i) {
      var g = gaussians(seed * 977 + i * 7919 + 13, 2 * NP), o = new Float64Array(2 * NP);
      for (var k = 0; k < 2 * NP; k++) o[k] = CLEAN[i][k] + sigma * g[k];
      return o;
    });
    res.obs = obsList;
    if (N < 3) { res.status = "need"; return res; }
    var Hs = obsList.map(homography), K = zhang(Hs);
    res.closedOk = !!K;
    if (!K) K = [500, 0, 320, 0, 500, 240, 0, 0, 1];
    var p = [K[0], K[4], K[2], K[5], 0, 0];
    Hs.forEach(function (Hm) { var e = extrinsics(K, Hm); p.push(e.r[0], e.r[1], e.r[2], e.t[0], e.t[1], e.t[2]); });
    var M = 2 * NP * N, r = residuals(p, obsList, new Float64Array(M)), cost = sumsq(r), lam = 1e-3, rn = new Float64Array(M);
    var Jb, ne, it;
    for (it = 0; it < 60; it++) {
      Jb = jacobian(p, obsList, r);
      ne = normalEq(Jb, r, N);
      var accepted = false, P = ne.P;
      while (lam < 1e10) {
        var Ad = new Float64Array(ne.A);
        for (var d = 0; d < P; d++) Ad[d * P + d] += lam * Math.max(ne.A[d * P + d], 1e-12);
        var L = cholesky(Ad, P);
        if (L) {
          var mg = new Float64Array(P);
          for (d = 0; d < P; d++) mg[d] = -ne.g[d];
          var step = cholSolve(L, mg, P), pn = p.slice();
          for (d = 0; d < P; d++) pn[d] += step[d];
          residuals(pn, obsList, rn);
          var cn = sumsq(rn);
          if (cn < cost && isFinite(cn)) {
            var rel = (cost - cn) / cost;
            p = pn; r = new Float64Array(rn); cost = cn; lam /= 3; accepted = true;
            if (rel < 1e-10) it = 1e9;
            break;
          }
        }
        lam *= 4;
      }
      if (!accepted) break;
    }
    Jb = jacobian(p, obsList, r);
    ne = normalEq(Jb, r, N);
    res.p = p;
    res.rms = Math.sqrt(cost / (NP * N));
    var dof = M - ne.P, s2 = cost / dof;
    res.sigmaHat = Math.sqrt(s2);
    res.expected = sigma * Math.sqrt(2 * dof / M);
    // covariance of the intrinsics: invert J^T J column by column (Cholesky), keep the 6 x 6 block
    var Lc = cholesky(ne.A, ne.P), cov = null;
    if (Lc) {
      cov = new Float64Array(36);
      for (var j = 0; j < 6; j++) {
        var e = new Float64Array(ne.P); e[j] = 1;
        var col = cholSolve(Lc, e, ne.P);
        for (var i = 0; i < 6; i++) cov[i * 6 + j] = s2 * col[i];
      }
    }
    res.cov = cov;
    res.std = [];
    for (var q = 0; q < 6; q++) res.std.push(cov && cov[q * 7] > 0 ? Math.sqrt(cov[q * 7]) : Infinity);
    res.unobs = !cov || res.std[0] > 0.2 * Math.abs(p[0]) || res.std.some(function (x) { return !isFinite(x); });
    res.status = !res.closedOk ? "degen" : (res.unobs ? "unobs" : "ok");
    if (cov && !res.unobs) res.map = uncertaintyMap(p.slice(0, 6), cov);
    return res;
  }
  // per-pixel std of re-projecting the ray of each grid pixel, after removing the rotation part
  var GU = 33, GV = 25;
  function uncertaintyMap(th, cov) {
    var n = GU * GV, rays = [], i, k, j, eps = 1e-6;
    for (j = 0; j < GV; j++) for (i = 0; i < GU; i++) {
      var u = (i + 0.5) * W / GU, v = (j + 0.5) * H / GV;
      var x = (u - th[2]) / th[0], y = (v - th[3]) / th[1], ok = true;
      for (k = 0; k < 60; k++) {
        var d = projectRay(th, x, y);
        x += (u - d[0]) / th[0]; y += (v - d[1]) / th[1];
        if (!isFinite(x) || Math.abs(x) > 50) { ok = false; break; }
      }
      var dd = ok ? projectRay(th, x, y) : [NaN, NaN];
      if (!(Math.hypot(dd[0] - u, dd[1] - v) < 1e-3)) ok = false;
      rays.push(ok ? [x, y] : null);
    }
    var G = [], A = [], idx = [];
    for (i = 0; i < n; i++) {
      if (!rays[i]) continue;
      var q = rays[i], base = projectRay(th, q[0], q[1]), gr = [[], []], ar = [[], []];
      for (k = 0; k < 6; k++) {
        var tp = th.slice(), h = eps * Math.max(1, Math.abs(th[k])); tp[k] += h;
        var pp = projectRay(tp, q[0], q[1]);
        gr[0].push((pp[0] - base[0]) / h); gr[1].push((pp[1] - base[1]) / h);
      }
      for (k = 0; k < 3; k++) {
        var w = [0, 0, 0]; w[k] = eps;
        var R = rodrigues(w), X = R[0] * q[0] + R[1] * q[1] + R[2], Y = R[3] * q[0] + R[4] * q[1] + R[5], Z = R[6] * q[0] + R[7] * q[1] + R[8];
        var pr = projectRay(th, X / Z, Y / Z);
        ar[0].push((pr[0] - base[0]) / eps); ar[1].push((pr[1] - base[1]) / eps);
      }
      G.push(gr[0], gr[1]); A.push(ar[0], ar[1]); idx.push(i);
    }
    // G <- G - A (A^T A)^-1 A^T G
    var AtA = new Float64Array(9), AtG = new Float64Array(18), rI, a, b;
    for (rI = 0; rI < A.length; rI++) for (a = 0; a < 3; a++) {
      for (b = 0; b < 3; b++) AtA[a * 3 + b] += A[rI][a] * A[rI][b];
      for (b = 0; b < 6; b++) AtG[a * 6 + b] += A[rI][a] * G[rI][b];
    }
    var Li = cholesky(AtA, 3), Xs = new Float64Array(18);
    if (Li) for (b = 0; b < 6; b++) {
      var colv = cholSolve(Li, [AtG[b], AtG[6 + b], AtG[12 + b]], 3);
      for (a = 0; a < 3; a++) Xs[a * 6 + b] = colv[a];
    }
    var out = new Float64Array(n).fill(NaN);
    for (k = 0; k < idx.length; k++) {
      var tot = 0;
      for (var rr = 0; rr < 2; rr++) {
        var g = G[2 * k + rr].slice(), arow = A[2 * k + rr];
        for (b = 0; b < 6; b++) g[b] -= arow[0] * Xs[b] + arow[1] * Xs[6 + b] + arow[2] * Xs[12 + b];
        for (a = 0; a < 6; a++) for (b = 0; b < 6; b++) tot += g[a] * cov[a * 6 + b] * g[b];
      }
      out[idx[k]] = Math.sqrt(Math.max(tot, 0));
    }
    return out;
  }

  // ---------------------------------------------------------------- UI
  function el(tag, css, parent) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (parent) parent.appendChild(e);
    return e;
  }
  function magma(t) {                    // light-to-dark ramp for the uncertainty map (t in [0, 1])
    var stops = [[252, 253, 191], [254, 176, 120], [241, 96, 93], [183, 55, 121], [114, 31, 129], [44, 17, 95], [0, 0, 4]];
    t = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    var i = Math.min(Math.floor(t), stops.length - 2), f = t - i, a = stops[i], b = stops[i + 1];
    return "rgb(" + Math.round(a[0] + f * (b[0] - a[0])) + "," + Math.round(a[1] + f * (b[1] - a[1])) + "," + Math.round(a[2] + f * (b[2] - a[2])) + ")";
  }
  function fmt(x, d) { return isFinite(x) ? x.toFixed(d) : "\u221e"; }

  function init(root) {
    var lang = TXT[root.dataset.lang] ? root.dataset.lang : "en", T = TXT[lang];
    root.innerHTML = "";
    root.style.background = COL.bg; root.style.padding = "8px"; root.style.boxSizing = "border-box";
    root.style.color = "#222";
    var hint = el("div", "font-size:13px;color:#555;margin-bottom:6px;line-height:1.4;", root);
    hint.textContent = T.hint;
    var canvas = el("canvas", "display:block;width:100%;touch-action:none;cursor:pointer;", root);
    var chips = el("div", "display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;", root);
    var presets = el("div", "display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;", root);
    var ctrl = el("div", "display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center;margin-top:8px;font-size:14px;", root);
    var table = el("div", "margin-top:8px;font-size:13.5px;overflow-x:auto;", root);
    var status = el("div", "margin-top:6px;font-size:13px;line-height:1.45;", root);
    var state = { sel: [0, 3, 4, 5, 6], sigma: 0.3, seed: 1, map: true, yaw: -0.65, pitch: 0.35, res: null };
    var btnCss = "border:1px solid #bbb;border-radius:6px;background:#fff;padding:3px 9px;font-size:13px;cursor:pointer;touch-action:manipulation;";
    var chipEls = [];
    POSES.forEach(function (_, i) {
      var b = el("button", btnCss + "min-width:36px;font-weight:600;", chips);
      b.type = "button"; b.textContent = String(i + 1);
      b.addEventListener("click", function () { toggle(i); });
      chipEls.push(b);
    });
    function preset(label, sel) {
      var b = el("button", btnCss, presets); b.type = "button"; b.textContent = label;
      b.addEventListener("click", function () {
        if (typeof sel === "function") state.sel = sel(state.sel); else state.sel = sel.slice();
        update();
      });
    }
    preset(T.pFront, [0, 1, 2]);
    preset(T.pCentre, [0, 3, 4, 5, 6]);
    preset(T.pCorner, function (s) { var o = s.slice(); [7, 8, 9, 10].forEach(function (i) { if (o.indexOf(i) < 0) o.push(i); }); return o; });
    preset(T.pAll, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    var fresh = el("button", btnCss, presets); fresh.type = "button"; fresh.textContent = T.fresh;
    fresh.addEventListener("click", function () { state.seed += 1; update(); });
    var sl = el("label", "display:flex;align-items:center;gap:8px;flex:1 1 260px;min-width:0;", ctrl);
    el("span", "white-space:nowrap;", sl).textContent = T.noise;
    var inp = el("input", "flex:1;min-width:80px;", sl);
    inp.type = "range"; inp.min = 0.05; inp.max = 1.5; inp.step = 0.05; inp.value = state.sigma;
    var sv = el("span", "font-family:monospace;min-width:3em;text-align:right;", sl);
    inp.addEventListener("input", function () { state.sigma = parseFloat(inp.value); update(); });
    var cbl = el("label", "display:flex;align-items:center;gap:6px;white-space:nowrap;", ctrl);
    var cb = el("input", "", cbl); cb.type = "checkbox"; cb.checked = state.map;
    el("span", "", cbl).textContent = T.map;
    cb.addEventListener("change", function () { state.map = cb.checked; draw(); });

    function toggle(i) {
      var k = state.sel.indexOf(i);
      if (k >= 0) state.sel.splice(k, 1); else state.sel.push(i);
      update();
    }
    var pending = false;
    function update() {
      state.sel.sort(function (a, b) { return a - b; });
      sv.textContent = state.sigma.toFixed(2);
      chipEls.forEach(function (b, i) {
        var on = state.sel.indexOf(i) >= 0;
        b.style.background = on ? VCOL[i] : "#fff";
        b.style.color = on ? "#fff" : "#333";
        b.style.borderColor = VCOL[i];
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        state.res = calibrate(state.sel, state.sigma, state.seed);
        render();
      });
    }

    // ---------------- drawing
    var ctx = canvas.getContext("2d"), lay = {};
    function resize() {
      var w = root.clientWidth - 16;
      if (w < 10 || w === lay.w) return;
      var wide = w >= 680, h;
      if (wide) {
        h = Math.round(Math.min(380, w * 0.42));
        lay.v3 = { x: 0, y: 0, w: w * 0.42, h: h };
        var iw = w * 0.56, ih = iw * 0.75;
        if (ih > h - 22) { ih = h - 22; iw = ih / 0.75; }
        lay.im = { x: w - iw, y: 0, w: iw, h: ih };
      } else {
        var h3 = Math.round(w * 0.6), hi = Math.round(w * 0.75) + 22;
        lay.v3 = { x: 0, y: 0, w: w, h: h3 };
        lay.im = { x: 0, y: h3 + 8, w: w, h: hi - 22 };
        h = h3 + 8 + hi;
      }
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.height = h + "px";
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lay.w = w; lay.h = h;
      draw();
    }
    function view3(p) {                  // camera frame (x, y down, z fwd) -> screen
      var px = p[0] - 0.02, py = p[2] - 0.45, pz = -p[1];
      var cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
      var x1 = cy * px - sy * py, y1 = sy * px + cy * py;
      var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      var y2 = cp * y1 + sp * pz, z2 = -sp * y1 + cp * pz;
      var D = 2.2, s = D / (D + y2), r = lay.v3, sc = Math.min(r.w * 0.75, r.h) * 1.75;
      return [r.x + r.w / 2 + x1 * s * sc, r.y + r.h * 0.5 - z2 * s * sc, y2];
    }
    function boardQuad3(i) {
      var v = VIEWS[i], c = [[0, 0], [8 * SQ, 0], [8 * SQ, 5 * SQ], [0, 5 * SQ]], out = [];
      for (var k = 0; k < 4; k++) {
        var X = c[k][0], Y = c[k][1], R = v.R, t = v.t;
        out.push([R[0] * X + R[1] * Y + t[0], R[3] * X + R[4] * Y + t[1], R[6] * X + R[7] * Y + t[2]]);
      }
      return out;
    }
    function toImg(u, v) { var r = lay.im; return [r.x + u / W * r.w, r.y + v / H * r.h]; }
    function draw() {
      if (!lay.w) return;
      ctx.clearRect(0, 0, lay.w, lay.h);
      // 3D panel
      var r = lay.v3;
      ctx.fillStyle = "#fff"; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "#ddd"; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      var K = TRUE, d = 0.22, cs = [[0, 0], [W, 0], [W, H], [0, H]].map(function (c) {
        return [(c[0] - K[2]) / K[0] * d, (c[1] - K[3]) / K[1] * d, d];
      });
      ctx.strokeStyle = COL.dark; ctx.lineWidth = 1.4;
      var O = view3([0, 0, 0]);
      cs.forEach(function (c, k) {
        var A = view3(c), B = view3(cs[(k + 1) % 4]);
        ctx.beginPath(); ctx.moveTo(O[0], O[1]); ctx.lineTo(A[0], A[1]); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      });
      [[COL.x, [0.08, 0, 0]], [COL.y, [0, 0.08, 0]], [COL.z, [0, 0, 0.08]]].forEach(function (a) {
        var B = view3(a[1]); ctx.strokeStyle = a[0]; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(O[0], O[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      });
      var order = POSES.map(function (_, i) {
        var q = boardQuad3(i), z = 0;
        q.forEach(function (p) { z += view3(p)[2]; });
        return { i: i, z: z };
      }).sort(function (a, b) { return b.z - a.z; });
      lay.quads3 = [];
      var labels = [];
      order.forEach(function (o) {
        var i = o.i, on = state.sel.indexOf(i) >= 0, q = boardQuad3(i).map(view3);
        ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]);
        for (var k = 1; k < 4; k++) ctx.lineTo(q[k][0], q[k][1]);
        ctx.closePath();
        ctx.globalAlpha = on ? 0.6 : 0.08; ctx.fillStyle = VCOL[i]; ctx.fill();
        ctx.globalAlpha = 1; ctx.strokeStyle = on ? "#222" : VCOL[i]; ctx.lineWidth = on ? 1.2 : 1;
        ctx.setLineDash(on ? [] : [4, 3]); ctx.stroke(); ctx.setLineDash([]);
        var cx = 0, cy = 0; q.forEach(function (p) { cx += p[0] / 4; cy += p[1] / 4; });
        labels.push({ t: String(i + 1), x: cx, y: cy + 4, on: on });
        lay.quads3.push({ i: i, q: q, z: o.z });
      });
      // board numbers after all boards. Boards whose centres nearly coincide (the centre views 1, 4-7) share
      // one row of numbers; rows that still collide (small screens) move down. Selected numbers are dark.
      ctx.font = "bold 12px sans-serif"; ctx.textAlign = "left";
      var groups = [];
      labels.forEach(function (l) {
        var g = groups.filter(function (g) { return Math.abs(g.x - l.x) < 12 && Math.abs(g.y - l.y) < 10; })[0];
        if (g) g.items.push(l); else groups.push({ x: l.x, y: l.y, items: [l] });
      });
      var placed = [];
      groups.forEach(function (g) {
        g.items.sort(function (a, b) { return +a.t - +b.t; });
        var gap = 4, w = -gap;
        g.items.forEach(function (l) { l.w = ctx.measureText(l.t).width; w += l.w + gap; });
        var hit = function (p) { return Math.abs(p.x - g.x) < (p.w + w) / 2 + 7 && Math.abs(p.y - g.y) < 13; };
        for (var tries = 0; tries < 6 && placed.some(hit); tries++) g.y += 13;
        placed.push({ x: g.x, y: g.y, w: w });
        var x = g.x - w / 2;
        g.items.forEach(function (l) {
          ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineJoin = "round";
          ctx.strokeText(l.t, x, g.y);
          ctx.fillStyle = l.on ? "#111" : "#666";
          ctx.fillText(l.t, x, g.y);
          x += l.w + gap;
        });
      });
      ctx.textAlign = "center";
      // image panel
      var im = lay.im, res = state.res;
      ctx.fillStyle = "#fff"; ctx.fillRect(im.x, im.y, im.w, im.h);
      if (state.map && res && res.map) {
        var cw = im.w / GU, ch = im.h / GV, lo = Math.log(0.05), hi = Math.log(10);
        for (var j = 0; j < GV; j++) for (var i2 = 0; i2 < GU; i2++) {
          var val = res.map[j * GU + i2];
          if (isNaN(val)) {
            ctx.fillStyle = "#ccc";
          } else {
            ctx.fillStyle = magma((Math.log(Math.max(val, 0.05)) - lo) / (hi - lo));
          }
          ctx.fillRect(im.x + i2 * cw, im.y + j * ch, cw + 0.6, ch + 0.6);
        }
      }
      ctx.strokeStyle = COL.gray; ctx.lineWidth = 1.2; ctx.strokeRect(im.x, im.y, im.w, im.h);
      lay.quadsIm = [];
      POSES.forEach(function (_, i) {
        var on = state.sel.indexOf(i) >= 0, o = CLEAN[i], idx = [0, 8, 53, 45];
        var q = idx.map(function (k) { return toImg(o[2 * k], o[2 * k + 1]); });
        lay.quadsIm.push({ i: i, q: q });
        ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]);
        for (var k = 1; k < 4; k++) ctx.lineTo(q[k][0], q[k][1]);
        ctx.closePath();
        ctx.strokeStyle = VCOL[i]; ctx.lineWidth = on ? 1.6 : 1; ctx.setLineDash(on ? [] : [3, 3]);
        ctx.globalAlpha = on ? 1 : 0.45; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        if (on && res && res.obs) {
          var oo = res.obs[res.sel.indexOf(i)];
          if (oo) {
            ctx.fillStyle = VCOL[i];
            for (k = 0; k < NP; k++) {
              var pt = toImg(oo[2 * k], oo[2 * k + 1]);
              ctx.beginPath(); ctx.arc(pt[0], pt[1], 1.8, 0, 2 * Math.PI); ctx.fill();
            }
          }
        }
      });
      if (state.map && res && res.map) {
        var ly = im.y + im.h + 4, bw = Math.min(140, im.w * 0.4);
        for (var b = 0; b < bw; b++) { ctx.fillStyle = magma(b / bw); ctx.fillRect(im.x + 34 + b, ly + 3, 1.2, 10); }
        ctx.fillStyle = "#333"; ctx.font = "11px sans-serif"; ctx.textAlign = "right";
        ctx.fillText("0.05", im.x + 31, ly + 12);
        ctx.textAlign = "left"; ctx.fillText("10 px", im.x + 38 + bw, ly + 12);
      }
    }
    function render() {
      var res = state.res, html = "";
      draw();
      if (!res) return;
      var msg = { need: T.need, degen: T.degen, unobs: T.unobs, ok: T.ok }[res.status] || "";
      if (res.status === "degen" && res.unobs) msg += " " + T.unobs;
      if (res.p) {
        html += "<table style='border-collapse:collapse;min-width:100%;'><tr style='text-align:left;color:#555;'>" +
          "<th style='padding:2px 8px 2px 0;'>" + T.param + "</th><th style='padding:2px 8px;'>" + T.truth +
          "</th><th style='padding:2px 8px;'>" + T.est + "</th><th style='padding:2px 0 2px 8px;width:38%;'>\u03c3</th></tr>";
        for (var k = 0; k < 6; k++) {
          var dg = k < 4 ? 2 : 4, s = res.std[k];
          var rel = isFinite(s) ? Math.log(s / (k < 4 ? 0.05 : 0.0005)) / Math.log(1e4) : 1;
          var wbar = Math.max(2, Math.min(100, rel * 100));
          html += "<tr style='border-top:1px solid #e4e4e4;'><td style='padding:2px 8px 2px 0;font-family:monospace;'>" + PNAMES[k] +
            "</td><td style='padding:2px 8px;font-family:monospace;'>" + TRUE[k].toFixed(dg) +
            "</td><td style='padding:2px 8px;font-family:monospace;white-space:nowrap;'>" + fmt(res.p[k], dg) + " \u00b1 " + fmt(s, dg) +
            "</td><td style='padding:2px 0 2px 8px;'><div style='height:9px;background:" + (wbar > 75 ? COL.x : COL.a) +
            ";width:" + wbar.toFixed(0) + "%;border-radius:2px;'></div></td></tr>";
        }
        html += "</table>";
      }
      table.innerHTML = html;
      var line = T.views + ": " + res.N + " \u00b7 " + T.corners + ": " + (res.N * NP);
      if (res.p) line += " \u00b7 " + T.rms + ": <b>" + res.rms.toFixed(3) + " px</b> (" + T.expect + " \u2248 " + res.expected.toFixed(3) + " px)";
      status.innerHTML = line + "<br><span style='color:" + (res.status === "ok" ? "#2a7a2a" : "#b03030") + ";'>" + msg + "</span>" +
        (state.map && res.map ? "<br><span style='color:#666;'>" + T.mapnote + "</span>" : "");
    }

    // ---------------- pointer: orbit the 3D view, tap a board to toggle it
    var drag = null;
    function pos(e) { var b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
    function inside(pt, q) {
      var c = false;
      for (var i = 0, j = q.length - 1; i < q.length; j = i++) {
        if (((q[i][1] > pt[1]) !== (q[j][1] > pt[1])) && (pt[0] < (q[j][0] - q[i][0]) * (pt[1] - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0])) c = !c;
      }
      return c;
    }
    function pick(pt) {
      var r = lay.v3, im = lay.im, best = null;
      if (pt[0] >= r.x && pt[0] <= r.x + r.w && pt[1] >= r.y && pt[1] <= r.y + r.h && lay.quads3) {
        lay.quads3.forEach(function (o) { if (inside(pt, o.q) && (!best || o.z < best.z)) best = o; });
      } else if (pt[0] >= im.x && pt[0] <= im.x + im.w && pt[1] >= im.y && pt[1] <= im.y + im.h && lay.quadsIm) {
        var area = function (q) { var a = 0; for (var i = 0; i < 4; i++) { var j = (i + 1) % 4; a += q[i][0] * q[j][1] - q[j][0] * q[i][1]; } return Math.abs(a); };
        lay.quadsIm.forEach(function (o) { if (inside(pt, o.q) && (!best || area(o.q) < best.a)) best = { i: o.i, a: area(o.q) }; });
      }
      return best ? best.i : -1;
    }
    canvas.addEventListener("pointerdown", function (e) {
      drag = { p: pos(e), moved: 0, yaw: state.yaw, pitch: state.pitch, in3: pos(e)[1] < lay.v3.y + lay.v3.h && pos(e)[0] < lay.v3.x + lay.v3.w };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var p = pos(e), dx = p[0] - drag.p[0], dy = p[1] - drag.p[1];
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      if (drag.in3 && drag.moved > 4) {
        state.yaw = drag.yaw + dx * 0.01;
        state.pitch = Math.max(-1.2, Math.min(1.2, drag.pitch + dy * 0.01));
        draw();
      }
    });
    function end(e) {
      if (!drag) return;
      if (drag.moved <= 6) { var i = pick(pos(e)); if (i >= 0) toggle(i); }
      drag = null;
    }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", function () { drag = null; });

    if (window.ResizeObserver) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
    update();
  }

  function start() {
    document.querySelectorAll('[data-widget="3d-vision-calibration"]').forEach(init);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
