// Interactive lab: many-light direct illumination with ReSTIR (WebGL 2).
// A night alley lit by hundreds of small coloured lights, rendered with one
// shading sample per pixel per frame. Four estimators can be compared:
//   (a) uniform light sampling,
//   (b) resampled importance sampling, RIS (Talbot et al. 2005),
//   (c) ReSTIR DI with temporal reuse,
//   (d) ReSTIR DI with temporal + spatial reuse (Bitterli et al., SIGGRAPH 2020).
// Reservoirs live in RGBA32F textures that are ping-ponged between frames:
// (x) selected light index, (y) unbiased contribution weight W, (z) M.
//
// Weights and bias. Candidates come from the uniform source pdf 1/N and are
// resampled with the target p-hat = luminance of the *unshadowed* contribution
// f * Le * cos / d^2, so W = wsum / (M * p-hat(y)) is an unbiased contribution
// weight. Merging reservoirs of other pixels with the naive 1/M normalisation
// (Alg. 4 of the paper) is biased: a neighbour may hold a light that lies
// behind the current surface, which darkens edges. We use the 1/Z form
// (Alg. 6): Z only sums the M of reservoirs whose pixel has p-hat(y) > 0.
// Visibility is kept out of p-hat for the M initial candidates (a shadow ray
// each would be too costly); only the selected one is tested. In the spatial
// pass the target at the current pixel does include visibility (one shadow
// ray per neighbour), so lights that a neighbour sees but this pixel does not
// are never picked; without it they show up as black speckles next to
// shadows. Z, however, still tests p-hat > 0 without visibility at the
// neighbours. The fully unbiased variant would trace one more shadow ray per
// neighbour there; we skip those rays and accept a small bias (slight
// darkening near shadow edges), like the paper's faster mode. Reusing last
// frame's W while the lights move is a second, small source of bias that
// temporal reuse always has. Every final sample is shadow-tested, so occluded
// lights never add light, and modes (a) and (b) are unbiased.
(function () {
  "use strict";

  var panel = document.getElementById("lab-rs");
  if (!panel) return;
  var root = document.getElementById("lab");
  var canvas = panel.querySelector("canvas");

  function fail() {
    panel.querySelector(".lab-stage").textContent = root.dataset.nogl2;
    panel.querySelector(".lab-controls").style.display = "none";
  }

  var MAX_LIGHTS = 1024;
  var NBOX = 24;
  var TEMPORAL_CAP = 20; // clamp the history to 20x the current candidate count (as in the paper)
  var SPATIAL_K = 4; // neighbours per spatial pass

  // ------------------------------------------------------------------ shaders
  var VS = "#version 300 es\nin vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }";

  var COMMON = [
    "#version 300 es",
    "precision highp float;",
    "precision highp int;",
    "#define PI 3.14159265359",
    "#define NBOX " + NBOX,
    "#define ID_GROUND " + NBOX,
    "uniform vec4 uBoxMin[NBOX];",
    "uniform vec4 uBoxMax[NBOX];",
    "uniform vec4 uBoxMat[NBOX];", // albedo.rgb, roughness
    "uniform int uNumBoxes;",
    "uniform highp sampler2D uLights;", // row 0: position.xyz, radius; row 1: intensity.rgb, -
    "uniform int uNumLights;",
    "uniform int uFrame;",
    "uniform vec2 uRes;",
    "",
    "uint seed;",
    "uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }",
    "float rnd() { seed = pcg(seed); return float(seed) * (1.0 / 4294967296.0); }",
    "void initRng(ivec2 px, int pass) { seed = pcg(uint(px.x) + pcg(uint(px.y) + pcg(uint(uFrame) * 4u + uint(pass)))); }",
    "",
    "struct Hit { float t; vec3 n; int id; };",
    "void boxHit(vec3 ro, vec3 inv, vec3 lo, vec3 hi, int id, inout Hit h) {",
    "  vec3 t0 = (lo - ro) * inv, t1 = (hi - ro) * inv;",
    "  vec3 tn = min(t0, t1), tf = max(t0, t1);",
    "  float n = max(max(tn.x, tn.y), tn.z), f = min(min(tf.x, tf.y), tf.z);",
    "  if (n > f || n < 1e-4 || n >= h.t) return;",
    "  h.t = n; h.id = id;",
    "  if (n == tn.x) h.n = vec3(-sign(inv.x), 0.0, 0.0); else if (n == tn.y) h.n = vec3(0.0, -sign(inv.y), 0.0); else h.n = vec3(0.0, 0.0, -sign(inv.z));",
    "}",
    "Hit trace(vec3 ro, vec3 rd) {",
    "  Hit h; h.t = 1e9; h.id = -1; h.n = vec3(0.0, 1.0, 0.0);",
    "  vec3 inv = 1.0 / rd;",
    "  if (rd.y < 0.0) { float t = -ro.y / rd.y; if (t > 1e-4) { h.t = t; h.id = ID_GROUND; } }",
    "  for (int i = 0; i < NBOX; i++) { if (i >= uNumBoxes) break; boxHit(ro, inv, uBoxMin[i].xyz, uBoxMax[i].xyz, i, h); }",
    "  return h;",
    "}",
    // shadow rays only test the boxes: lights and shading points are never below the ground
    "bool occluded(vec3 ro, vec3 rd, float tmax) {",
    "  vec3 inv = 1.0 / rd;",
    "  for (int i = 0; i < NBOX; i++) {",
    "    if (i >= uNumBoxes) break;",
    "    vec3 t0 = (uBoxMin[i].xyz - ro) * inv, t1 = (uBoxMax[i].xyz - ro) * inv;",
    "    vec3 tn = min(t0, t1), tf = max(t0, t1);",
    "    float n = max(max(tn.x, tn.y), tn.z), f = min(min(tf.x, tf.y), tf.z);",
    "    if (n <= f && f > 1e-4 && n < tmax) return true;",
    "  }",
    "  return false;",
    "}",
    "",
    "float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }",
    "float vnoise(vec2 p) {",
    "  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);",
    "}",
    // a shading point: position, normal, view direction and material
    "struct Surf { vec3 p; vec3 n; vec3 v; vec3 alb; float rough; };",
    "Surf surface(vec4 g0, vec4 g1, vec3 eye) {",
    "  Surf s; s.p = g0.xyz; s.n = g1.xyz; s.v = normalize(eye - s.p);",
    "  int id = int(g1.w + 0.5);",
    "  if (id == ID_GROUND) {", // wet asphalt with puddles and a dashed centre line
    "    float w = vnoise(s.p.xz * 0.45) * 0.65 + vnoise(s.p.xz * 1.7) * 0.35;",
    "    float puddle = smoothstep(0.55, 0.62, w);",
    "    s.alb = mix(vec3(0.11, 0.105, 0.1), vec3(0.03, 0.03, 0.035), puddle);",
    "    s.rough = mix(0.55, 0.06, puddle);",
    "    if (abs(s.p.x) < 0.07 && fract(s.p.z * 0.25) < 0.5) { s.alb = vec3(0.55, 0.5, 0.35); s.rough = 0.5; }",
    "  } else {",
    "    vec4 m = vec4(0.2, 0.2, 0.2, 0.8);",
    "    for (int i = 0; i < NBOX; i++) if (i == id) m = uBoxMat[i];",
    "    float b = 0.85 + 0.3 * hash12(floor(s.p.yz * vec2(3.0, 1.5)) + floor(s.p.xy * vec2(1.5, 3.0)));",
    "    s.alb = m.rgb * b; s.rough = m.a;",
    "  }",
    "  return s;",
    "}",
    "float D_GGX(float NoH, float a) { float a2 = a * a; float d = NoH * NoH * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }",
    "float G1(float NoX, float a) { float a2 = a * a; return 2.0 * NoX / (NoX + sqrt(a2 + (1.0 - a2) * NoX * NoX)); }",
    "float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }",
    // unshadowed contribution of light i at s: f * Le * cos / d^2. Its luminance is the RIS target p-hat.
    "vec3 contrib(int i, Surf s, out vec3 L, out float dist) {",
    "  vec4 a = texelFetch(uLights, ivec2(i, 0), 0), b = texelFetch(uLights, ivec2(i, 1), 0);",
    "  vec3 d = a.xyz - s.p; float d2 = dot(d, d); dist = sqrt(d2); L = d / dist;",
    "  float NoL = dot(s.n, L), NoV = max(dot(s.n, s.v), 1e-4);",
    "  if (NoL <= 0.0 || b.a < 0.5) return vec3(0.0);",
    "  vec3 H = normalize(s.v + L); float NoH = max(dot(s.n, H), 0.0), VoH = max(dot(s.v, H), 0.0);",
    "  float al = max(s.rough * s.rough, 0.003); float F = 0.04 + 0.96 * pow(1.0 - VoH, 5.0);",
    "  float spec = D_GGX(NoH, al) * G1(NoV, al) * G1(NoL, al) * F / (4.0 * NoV * NoL);",
    "  vec3 f = (1.0 - F) * s.alb / PI + vec3(min(spec, 60.0));",
    "  return f * b.rgb * NoL / max(d2, a.w * a.w * 4.0 + 0.02);",
    "}",
    "float phat(int i, Surf s) { vec3 L; float d; return lum(contrib(i, s, L, d)); }",
    "bool visible(int i, Surf s) {",
    "  vec3 L; float d; contrib(i, s, L, d);",
    "  float r = texelFetch(uLights, ivec2(i, 0), 0).w;",
    "  return !occluded(s.p + s.n * 2e-3, L, d - r);",
    "}",
    // weighted reservoir sampling (Chao 1982): stream candidates, keep one with probability w / wsum
    "struct Reservoir { float y; float wsum; float M; float W; };",
    "Reservoir emptyRes() { Reservoir r; r.y = -1.0; r.wsum = 0.0; r.M = 0.0; r.W = 0.0; return r; }",
    "void update(inout Reservoir r, float y, float w) { r.wsum += w; if (w > 0.0 && rnd() * r.wsum < w) r.y = y; }",
  ].join("\n");

  // primary rays: G-buffer with world position + hit distance and normal + object id
  var GBUF_FS = COMMON + "\n" + [
    "uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;",
    "uniform float uTanHalf;",
    "layout(location = 0) out vec4 oPos;",
    "layout(location = 1) out vec4 oNrm;",
    "void main() {",
    "  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;",
    "  vec3 rd = normalize(uCamFwd + ndc.x * uTanHalf * uRes.x / uRes.y * uCamRight + ndc.y * uTanHalf * uCamUp);",
    "  Hit h = trace(uCamPos, rd);",
    "  if (h.id < 0) { oPos = vec4(rd, -1.0); oNrm = vec4(0.0); return; }",
    "  oPos = vec4(uCamPos + rd * h.t, h.t);",
    "  oNrm = vec4(h.n, float(h.id));",
    "}",
  ].join("\n");

  // initial candidates (RIS) + optional temporal reuse
  var TEMPORAL_FS = COMMON + "\n" + [
    "uniform highp sampler2D uGPos, uGNrm, uPrevGPos, uPrevGNrm, uPrevRes;",
    "uniform vec3 uCamPos, uPrevCamPos, uPrevFwd, uPrevRight, uPrevUp;",
    "uniform float uTanHalf, uCap;",
    "uniform int uM, uTemporal;",
    "out vec4 oRes;",
    "void main() {",
    "  ivec2 px = ivec2(gl_FragCoord.xy);",
    "  initRng(px, 0);",
    "  vec4 g0 = texelFetch(uGPos, px, 0), g1 = texelFetch(uGNrm, px, 0);",
    "  if (g0.w < 0.0) { oRes = vec4(-1.0, 0.0, 0.0, 0.0); return; }",
    "  Surf s = surface(g0, g1, uCamPos);",
    // 1. RIS: M candidates from the uniform source pdf 1/N, resampled by p-hat
    "  float N = float(uNumLights);",
    "  Reservoir r = emptyRes();",
    "  for (int i = 0; i < 64; i++) {",
    "    if (i >= uM) break;",
    "    int y = min(int(rnd() * N), uNumLights - 1);",
    "    update(r, float(y), phat(y, s) * N);", // w = p-hat / source pdf
    "  }",
    "  r.M = float(uM);",
    "  float py = r.y >= 0.0 ? phat(int(r.y), s) : 0.0;",
    "  r.W = py > 0.0 ? r.wsum / (r.M * py) : 0.0;",
    // a sample that is shadowed here is useless here, and is also discarded before neighbours can reuse it (paper, Alg. 5)
    "  if (r.W > 0.0 && !visible(int(r.y), s)) r.W = 0.0;",
    "  if (uTemporal == 1) {",
    "    vec3 d = s.p - uPrevCamPos; float z = dot(d, uPrevFwd);",
    "    vec2 ndc = vec2(dot(d, uPrevRight) / (z * uTanHalf * uRes.x / uRes.y), dot(d, uPrevUp) / (z * uTanHalf));",
    "    ivec2 q = ivec2(floor((ndc * 0.5 + 0.5) * uRes));",
    "    if (z > 0.0 && q.x >= 0 && q.y >= 0 && q.x < int(uRes.x) && q.y < int(uRes.y)) {",
    "      vec4 p0 = texelFetch(uPrevGPos, q, 0), p1 = texelFetch(uPrevGNrm, q, 0);",
    "      vec4 pr = texelFetch(uPrevRes, q, 0);",
    // reject disocclusions: the reprojected pixel must see (nearly) the same surface
    "      if (p0.w > 0.0 && pr.x >= 0.0 && int(pr.x) < uNumLights && dot(p1.xyz, s.n) > 0.9 && distance(p0.xyz, s.p) < 0.03 * g0.w + 0.02) {",
    "        float Mp = min(pr.z, uCap * r.M);",
    "        Reservoir c = emptyRes();",
    "        update(c, r.y, py * r.W * r.M);",
    "        update(c, pr.x, phat(int(pr.x), s) * pr.y * Mp);",
    "        c.M = r.M + Mp;",
    "        float pc = c.y >= 0.0 ? phat(int(c.y), s) : 0.0;",
    // 1/Z normalisation: only count reservoirs whose pixel could have produced the chosen sample
    "        Surf sp = surface(p0, p1, uPrevCamPos);",
    "        float Z = (pc > 0.0 ? r.M : 0.0) + (c.y >= 0.0 && phat(int(c.y), sp) > 0.0 ? Mp : 0.0);",
    "        c.W = pc > 0.0 && Z > 0.0 ? c.wsum / (Z * pc) : 0.0;",
    "        r = c;",
    "      }",
    "    }",
    "  }",
    "  oRes = vec4(r.y, r.W, r.M, 0.0);",
    "}",
  ].join("\n");

  // spatial reuse: merge the reservoirs of K random, geometrically similar neighbours
  var SPATIAL_FS = COMMON + "\n" + [
    "#define K " + SPATIAL_K,
    "uniform highp sampler2D uGPos, uGNrm, uIn;",
    "uniform vec3 uCamPos;",
    "uniform float uRadius;",
    "out vec4 oRes;",
    "void main() {",
    "  ivec2 px = ivec2(gl_FragCoord.xy);",
    "  initRng(px, 1);",
    "  vec4 g0 = texelFetch(uGPos, px, 0), g1 = texelFetch(uGNrm, px, 0);",
    "  if (g0.w < 0.0) { oRes = vec4(-1.0, 0.0, 0.0, 0.0); return; }",
    "  Surf s = surface(g0, g1, uCamPos);",
    "  Reservoir c = emptyRes();",
    "  ivec2 used[K + 1]; float usedM[K + 1]; int nUsed = 0;",
    "  for (int k = 0; k <= K; k++) {",
    "    ivec2 q = px;",
    "    if (k > 0) {",
    "      float a = rnd() * 2.0 * PI, rr = uRadius * sqrt(rnd());",
    "      q = px + ivec2(round(vec2(cos(a), sin(a)) * rr));",
    "      if (q.x < 0 || q.y < 0 || q.x >= int(uRes.x) || q.y >= int(uRes.y) || q == px) continue;",
    "      vec4 h0 = texelFetch(uGPos, q, 0), h1 = texelFetch(uGNrm, q, 0);",
    "      if (h0.w < 0.0 || dot(h1.xyz, s.n) < 0.906 || abs(h0.w - g0.w) > 0.1 * g0.w) continue;",
    "    }",
    "    vec4 rq = texelFetch(uIn, q, 0);",
    "    if (rq.z <= 0.0) continue;",
    "    float p = rq.x >= 0.0 && rq.y > 0.0 ? phat(int(rq.x), s) : 0.0;",
    // the target here includes visibility: a neighbour's light that is hidden from this pixel gets weight 0
    "    if (p > 0.0 && !visible(int(rq.x), s)) p = 0.0;",
    "    update(c, rq.x, p * rq.y * rq.z);",
    "    c.M += rq.z;",
    "    used[nUsed] = q; usedM[nUsed] = rq.z; nUsed++;",
    "  }",
    "  float pc = c.y >= 0.0 ? phat(int(c.y), s) : 0.0;",
    "  float Z = 0.0;",
    "  if (pc > 0.0) {",
    "    for (int k = 0; k <= K; k++) {",
    "      if (k >= nUsed) break;",
    "      Surf sq = surface(texelFetch(uGPos, used[k], 0), texelFetch(uGNrm, used[k], 0), uCamPos);",
    "      if (phat(int(c.y), sq) > 0.0) Z += usedM[k];",
    "    }",
    "  }",
    "  c.W = pc > 0.0 && Z > 0.0 ? c.wsum / (Z * pc) : 0.0;",
    "  oRes = vec4(c.y, c.W, c.M, 0.0);",
    "}",
  ].join("\n");

  // final shading: one shadow ray for the reservoir's sample, weighted by W
  var SHADE_FS = COMMON + "\n" + [
    "uniform highp sampler2D uGPos, uGNrm, uIn;",
    "uniform vec3 uCamPos;",
    "uniform float uExposure;",
    "out vec4 o;",
    "void main() {",
    "  ivec2 px = ivec2(gl_FragCoord.xy);",
    "  vec4 g0 = texelFetch(uGPos, px, 0), g1 = texelFetch(uGNrm, px, 0);",
    "  vec3 col;",
    "  if (g0.w < 0.0) {",
    "    float h = max(g0.y, 0.0);",
    "    col = mix(vec3(0.05, 0.035, 0.06), vec3(0.004, 0.006, 0.018), sqrt(h));",
    "  } else {",
    "    Surf s = surface(g0, g1, uCamPos);",
    "    col = s.alb * vec3(0.006, 0.007, 0.012);", // faint sky ambient
    "    vec4 r = texelFetch(uIn, px, 0);",
    "    if (r.x >= 0.0 && r.y > 0.0) {",
    "      int i = int(r.x); vec3 L; float d;",
    "      vec3 f = contrib(i, s, L, d);",
    "      float rad = texelFetch(uLights, ivec2(i, 0), 0).w;",
    "      if (!occluded(s.p + s.n * 2e-3, L, d - rad)) col += f * r.y;",
    "    }",
    "  }",
    "  col = vec3(1.0) - exp(-col * uExposure);",
    "  o = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);",
    "}",
  ].join("\n");

  // the light bulbs themselves, as depth-tested point sprites
  var BULB_VS = [
    "#version 300 es",
    "precision highp float;",
    "uniform highp sampler2D uLights;",
    "uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;",
    "uniform float uTanHalf;",
    "uniform vec2 uRes;",
    "out vec3 vCol; out float vDist;",
    "void main() {",
    "  vec4 a = texelFetch(uLights, ivec2(gl_VertexID, 0), 0), b = texelFetch(uLights, ivec2(gl_VertexID, 1), 0);",
    "  vec3 d = a.xyz - uCamPos; float z = dot(d, uCamFwd);",
    "  if (z < 0.1 || b.a < 0.5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 1.0; return; }",
    "  vec2 ndc = vec2(dot(d, uCamRight) / (z * uTanHalf * uRes.x / uRes.y), dot(d, uCamUp) / (z * uTanHalf));",
    "  gl_Position = vec4(ndc, 0.0, 1.0);",
    "  gl_PointSize = clamp(a.w / (z * uTanHalf) * uRes.y * 1.3, 1.5, 12.0);",
    "  vDist = length(d) - a.w; vCol = b.rgb / max(max(b.r, b.g), max(b.b, 1e-3));",
    "}",
  ].join("\n");
  var BULB_FS = [
    "#version 300 es",
    "precision highp float;",
    "uniform highp sampler2D uGPos;",
    "in vec3 vCol; in float vDist;",
    "out vec4 o;",
    "void main() {",
    "  float t = texelFetch(uGPos, ivec2(gl_FragCoord.xy), 0).w;",
    "  if (t > 0.0 && t < vDist) discard;",
    "  vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c);",
    "  if (r2 > 1.0) discard;",
    "  float core = smoothstep(1.0, 0.25, r2);",
    "  o = vec4(mix(vCol, vec3(1.0), 0.55 * core) * core, 0.0);",
    "}",
  ].join("\n");

  // -------------------------------------------------------------------- scene
  // A night alley: two rows of buildings, a bridge, awnings and street props.
  function box(x0, y0, z0, x1, y1, z1, col, rough) { return { lo: [x0, y0, z0], hi: [x1, y1, z1], col: col, rough: rough }; }
  var WALL_A = [0.2, 0.18, 0.17], WALL_B = [0.16, 0.17, 0.2], WALL_C = [0.24, 0.17, 0.14];
  var BOXES = [
    box(-10, 0, -30, -4, 11, -20, WALL_A, 0.85), box(-10, 0, -20, -4, 7, -12, WALL_C, 0.85),
    box(-10, 0, -12, -4, 13, -3, WALL_B, 0.8), box(-10, 0, -3, -4, 8, 6, WALL_A, 0.85),
    box(-10, 0, 6, -4, 10, 14, WALL_C, 0.85), box(-10, 0, 14, -4, 6, 26, WALL_B, 0.85),
    box(4, 0, -30, 10, 9, -22, WALL_B, 0.85), box(4, 0, -22, 10, 12, -13, WALL_A, 0.85),
    box(4, 0, -13, 10, 6.5, -5, WALL_C, 0.85), box(4, 0, -5, 10, 10, 4, WALL_B, 0.8),
    box(4, 0, 4, 10, 7.5, 13, WALL_A, 0.85), box(4, 0, 13, 10, 11, 26, WALL_C, 0.85),
    box(-10, 0, -34, 10, 16, -30, WALL_B, 0.85), // end of the alley
    box(-4, 5.6, -8, 4, 6.2, -6.5, [0.3, 0.3, 0.32], 0.6), // footbridge
    box(-4, 2.8, -10, -3.1, 2.95, -6, [0.5, 0.12, 0.1], 0.5), // awnings
    box(3.1, 3.0, 0, 4, 3.15, 5, [0.1, 0.3, 0.45], 0.5),
    box(-2.9, 0, 2, -2.1, 0.8, 2.8, [0.45, 0.33, 0.2], 0.9), // crates
    box(-3.4, 0, 2.9, -2.6, 0.7, 3.6, [0.42, 0.3, 0.18], 0.9),
    box(3.2, 0, -2, 4, 1.9, -1, [0.75, 0.75, 0.78], 0.3), // vending machine
    box(1.1, 0, -17, 3.0, 1.2, -12.5, [0.55, 0.06, 0.05], 0.25), // parked car
    box(-0.35, 0, 9, 0.35, 0.9, 9.7, [0.6, 0.6, 0.6], 0.6), // bollard
  ];
  var PALETTE = [[1, 0.1, 0.55], [0.1, 0.85, 1], [1, 0.45, 0.05], [0.3, 1, 0.3], [0.45, 0.25, 1], [1, 0.9, 0.3], [1, 0.15, 0.1]];

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // lights must not sit inside (or flush against) geometry
  function insideBox(p, margin) {
    return BOXES.some(function (b) {
      for (var k = 0; k < 3; k++) if (p[k] < b.lo[k] - margin || p[k] > b.hi[k] + margin) return false;
      return true;
    });
  }

  // About half the lights are neon signs on the facades (blinking), the rest
  // are lanterns drifting through the alley.
  function makeLights(n) {
    var R = mulberry32(7 + n), L = [];
    var nSign = Math.round(n * 0.5);
    while (L.length < nSign) {
      var side = R() < 0.5 ? -1 : 1, z0 = -28 + R() * 46, y0 = 1.6 + R() * 5.5;
      var vertical = R() < 0.35, len = vertical ? 1 + R() * 2 : 1 + R() * 2.5;
      var count = Math.min(nSign - L.length, 6 + Math.floor(R() * 10));
      var col = PALETTE[Math.floor(R() * PALETTE.length)];
      var blink = R() < 0.4 ? 0.6 + R() * 2.5 : 0, phase = R() * 10;
      var p0 = [side * 3.86, y0, z0], p1 = [side * 3.86, vertical ? y0 + len : y0, vertical ? z0 : z0 + len];
      var pm = [p0[0], (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
      // every bulb needs a wall right behind it and must stay clear of awnings and props
      if ([p0, pm, p1].some(function (q) { return !insideBox([side * 4.05, q[1], q[2]], 0) || insideBox(q, 0.1); })) continue;
      for (var k = 0; k < count; k++) {
        var t = count > 1 ? k / (count - 1) : 0.5;
        L.push({
          base: [side * 3.86, vertical ? y0 + t * len : y0, vertical ? z0 : z0 + t * len], amp: [0, 0, 0], freq: [0, 0, 0], ph: [0, 0, 0],
          col: col, power: 1.0, r: 0.045, blink: blink, phase: phase + (blink ? k * 0.15 : 0),
        });
      }
    }
    while (L.length < n) {
      var c = PALETTE[Math.floor(R() * PALETTE.length)];
      c = [0.15 + 0.85 * c[0], 0.12 + 0.88 * c[1], 0.1 + 0.9 * c[2]];
      var base = [(R() * 2 - 1) * 2.4, 0.6 + R() * 3.6, -26 + R() * 44];
      if (insideBox(base, 0.6)) continue;
      L.push({
        base: base,
        amp: [0.4 + R() * 0.6, 0.15 + R() * 0.35, 0.8 + R() * 2.2], freq: [0.2 + R() * 0.5, 0.3 + R() * 0.6, 0.1 + R() * 0.3],
        ph: [R() * 6.28, R() * 6.28, R() * 6.28], col: c, power: 0.45, r: 0.06, blink: 0, phase: 0,
      });
    }
    return L;
  }

  // ------------------------------------------------------------------- init
  var started = false;
  function start() {
    if (started) return;
    started = true;
    var gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) return fail();

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function prog(vs, fs) {
      var p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, "aPos");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      var u = {};
      for (var i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
        var info = gl.getActiveUniform(p, i);
        u[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name);
      }
      return { p: p, u: u };
    }
    var P;
    try {
      P = {
        gbuf: prog(VS, GBUF_FS), temporal: prog(VS, TEMPORAL_FS), spatial: prog(VS, SPATIAL_FS),
        shade: prog(VS, SHADE_FS), bulb: prog(BULB_VS, BULB_FS),
      };
    } catch (e) {
      if (window.console) console.warn(e);
      return fail();
    }

    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var emptyVao = gl.createVertexArray();

    function tex(w, h) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function fbo(attachments) {
      var f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      attachments.forEach(function (t, i) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      });
      return f;
    }

    var lightTex = tex(MAX_LIGHTS, 2);
    var lightData = new Float32Array(MAX_LIGHTS * 2 * 4);

    // G-buffers and final reservoirs are double-buffered: frame t reads frame t-1's
    var W = 0, H = 0, T = null, cur = 0, hasPrev = false;
    function allocate(w, h) {
      if (T) {
        T.tex.forEach(function (t) { gl.deleteTexture(t); });
        T.fb.forEach(function (f) { gl.deleteFramebuffer(f); });
      }
      W = w;
      H = h;
      var gp = [tex(w, h), tex(w, h)], gn = [tex(w, h), tex(w, h)], rf = [tex(w, h), tex(w, h)], rt = tex(w, h);
      T = { gp: gp, gn: gn, rf: rf, rt: rt, tex: gp.concat(gn, rf, [rt]) };
      T.gfb = [fbo([gp[0], gn[0]]), fbo([gp[1], gn[1]])];
      T.rffb = [fbo([rf[0]]), fbo([rf[1]])];
      T.rtfb = fbo([rt]);
      T.fb = T.gfb.concat(T.rffb, [T.rtfb]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      hasPrev = false;
    }

    // ------------------------------------------------------------------ state
    var st = { mode: 3, lights: 512, M: 16, animate: true, walk: true };
    var lights = makeLights(st.lights);
    var cam = { x: 0, y: 1.7, z: 12, yaw: 0, pitch: 0.05, dyaw: 0, dpitch: 0 };
    var walkT = 0, animT = 0, frame = 0;
    var tanHalf = Math.tan((55 * Math.PI) / 360);
    var basis = null, prevBasis = null;

    function updateLights() {
      for (var i = 0; i < lights.length; i++) {
        var l = lights[i], o = i * 4, on = 1;
        for (var k = 0; k < 3; k++) lightData[o + k] = l.base[k] + l.amp[k] * Math.sin(animT * l.freq[k] + l.ph[k]);
        lightData[o + 3] = l.r;
        if (l.blink) on = Math.sin(animT * l.blink + l.phase) > -0.3 ? 1 : 0;
        // total power is kept constant when the light count changes
        var p = l.power * (512 / lights.length) * 0.6;
        var o2 = (MAX_LIGHTS + i) * 4;
        lightData[o2] = l.col[0] * p;
        lightData[o2 + 1] = l.col[1] * p;
        lightData[o2 + 2] = l.col[2] * p;
        lightData[o2 + 3] = on;
      }
      gl.bindTexture(gl.TEXTURE_2D, lightTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_LIGHTS, 2, gl.RGBA, gl.FLOAT, lightData);
    }

    function updateCamera() {
      if (st.walk) {
        cam.z = 4 + 9 * Math.sin(walkT * 0.11);
        cam.x = 0.9 * Math.sin(walkT * 0.23);
        cam.yaw = 0.22 * Math.sin(walkT * 0.17);
      }
      var yaw = cam.yaw + cam.dyaw, pitch = Math.max(-0.6, Math.min(0.9, cam.pitch + cam.dpitch));
      var f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
      var r = [Math.cos(yaw), 0, Math.sin(yaw)];
      var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      basis = { pos: [cam.x, cam.y, cam.z], fwd: f, right: r, up: u };
    }

    function setScene(u) {
      var lo = [], hi = [], m = [];
      BOXES.forEach(function (b) {
        lo.push(b.lo[0], b.lo[1], b.lo[2], 0);
        hi.push(b.hi[0], b.hi[1], b.hi[2], 0);
        m.push(b.col[0], b.col[1], b.col[2], b.rough);
      });
      while (lo.length < NBOX * 4) { lo.push(0, 0, 0, 0); hi.push(0, 0, 0, 0); m.push(0, 0, 0, 1); }
      gl.uniform4fv(u.uBoxMin, lo);
      gl.uniform4fv(u.uBoxMax, hi);
      gl.uniform4fv(u.uBoxMat, m);
      gl.uniform1i(u.uNumBoxes, BOXES.length);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, lightTex);
      gl.uniform1i(u.uLights, 0);
      gl.uniform1i(u.uNumLights, lights.length);
      gl.uniform1i(u.uFrame, frame);
      gl.uniform2f(u.uRes, W, H);
    }
    function bindTex(u, name, unit, t) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(u[name], unit);
    }
    function setCam(u, prefix, b) {
      gl.uniform3fv(u["u" + prefix + "CamPos"], b.pos);
      if (u["u" + prefix + "Fwd"]) gl.uniform3fv(u["u" + prefix + "Fwd"], b.fwd);
      if (u["u" + prefix + "Right"]) gl.uniform3fv(u["u" + prefix + "Right"], b.right);
      if (u["u" + prefix + "Up"]) gl.uniform3fv(u["u" + prefix + "Up"], b.up);
    }

    // ------------------------------------------------------------- controls UI
    function seg(attr, key, onChange) {
      var bs = panel.querySelectorAll("[" + attr + "]");
      Array.prototype.forEach.call(bs, function (b) {
        var val = +b.getAttribute(attr);
        b.setAttribute("aria-pressed", val === st[key] ? "true" : "false");
        b.addEventListener("click", function () {
          st[key] = val;
          Array.prototype.forEach.call(bs, function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
          if (onChange) onChange();
        });
      });
    }
    seg("data-rmode", "mode", function () { hasPrev = false; });
    seg("data-lights", "lights", function () {
      lights = makeLights(st.lights);
      hasPrev = false;
    });
    var mIn = panel.querySelector('[data-input="candidates"]');
    var mOut = panel.querySelector(".rs-m");
    mIn.value = st.M;
    mOut.textContent = st.M;
    mIn.addEventListener("input", function () {
      st.M = +mIn.value;
      mOut.textContent = st.M;
    });
    Array.prototype.forEach.call(panel.querySelectorAll("[data-toggle]"), function (b) {
      var key = b.dataset.toggle;
      b.setAttribute("aria-pressed", st[key] ? "true" : "false");
      b.addEventListener("click", function () {
        st[key] = !st[key];
        b.setAttribute("aria-pressed", st[key] ? "true" : "false");
      });
    });
    function modeName() {
      var b = panel.querySelector('[data-rmode="' + st.mode + '"]');
      return b ? b.textContent : "";
    }

    // ---------------------------------------------------------------- pointer
    var hint = panel.querySelector(".lab-hint");
    var drag = null;
    canvas.addEventListener("pointerdown", function (e) {
      canvas.setPointerCapture(e.pointerId);
      hint.style.opacity = "0";
      drag = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drag) return;
      cam.dyaw = Math.max(-1.2, Math.min(1.2, cam.dyaw + (e.clientX - drag.x) * 0.004));
      cam.dpitch = Math.max(-0.6, Math.min(0.8, cam.dpitch - (e.clientY - drag.y) * 0.004));
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    function end() { drag = null; }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("dblclick", function () { cam.dyaw = 0; cam.dpitch = 0; });

    // ------------------------------------------------------------------ frame
    var statsEl = panel.querySelector(".lab-stats");
    var statsTpl = panel.dataset.stats;
    var scale = Math.min(window.devicePixelRatio || 1, 1);
    var times = [], adapted = 0, fps = 0, lastT = 0;

    function draw(fb, p) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.viewport(0, 0, W, H);
      gl.useProgram(p.p);
      setScene(p.u);
    }

    function render(now) {
      var dt = lastT ? Math.min((now - lastT) / 1000, 0.1) : 0;
      lastT = now;
      if (st.animate) animT += dt;
      if (st.walk) walkT += dt;
      var w = Math.max(16, Math.round(canvas.clientWidth * scale));
      var h = Math.max(16, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      if (w !== W || h !== H) allocate(w, h);
      frame++;
      prevBasis = basis;
      updateCamera();
      updateLights();
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      var prev = cur ^ 1;

      // 1. G-buffer
      draw(T.gfb[cur], P.gbuf);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      setCam(P.gbuf.u, "", basis);
      gl.uniform3fv(P.gbuf.u.uCamFwd, basis.fwd);
      gl.uniform3fv(P.gbuf.u.uCamRight, basis.right);
      gl.uniform3fv(P.gbuf.u.uCamUp, basis.up);
      gl.uniform1f(P.gbuf.u.uTanHalf, tanHalf);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 2. initial candidates (+ temporal reuse)
      var spatial = st.mode === 3, temporal = st.mode >= 2 && hasPrev && prevBasis;
      var u = P.temporal.u;
      draw(spatial ? T.rtfb : T.rffb[cur], P.temporal);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      bindTex(u, "uGPos", 1, T.gp[cur]);
      bindTex(u, "uGNrm", 2, T.gn[cur]);
      bindTex(u, "uPrevGPos", 3, T.gp[prev]);
      bindTex(u, "uPrevGNrm", 4, T.gn[prev]);
      bindTex(u, "uPrevRes", 5, T.rf[prev]);
      gl.uniform3fv(u.uCamPos, basis.pos);
      var pb = prevBasis || basis;
      gl.uniform3fv(u.uPrevCamPos, pb.pos);
      gl.uniform3fv(u.uPrevFwd, pb.fwd);
      gl.uniform3fv(u.uPrevRight, pb.right);
      gl.uniform3fv(u.uPrevUp, pb.up);
      gl.uniform1f(u.uTanHalf, tanHalf);
      gl.uniform1f(u.uCap, TEMPORAL_CAP);
      gl.uniform1i(u.uM, st.mode === 0 ? 1 : st.M); // RIS with one candidate is plain uniform sampling
      gl.uniform1i(u.uTemporal, temporal ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 3. spatial reuse
      if (spatial) {
        u = P.spatial.u;
        draw(T.rffb[cur], P.spatial);
        bindTex(u, "uGPos", 1, T.gp[cur]);
        bindTex(u, "uGNrm", 2, T.gn[cur]);
        bindTex(u, "uIn", 3, T.rt);
        gl.uniform3fv(u.uCamPos, basis.pos);
        gl.uniform1f(u.uRadius, Math.max(6, H * 0.06));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // 4. shading to the canvas, then the bulbs on top
      u = P.shade.u;
      draw(null, P.shade);
      bindTex(u, "uGPos", 1, T.gp[cur]);
      bindTex(u, "uGNrm", 2, T.gn[cur]);
      bindTex(u, "uIn", 3, T.rf[cur]);
      gl.uniform3fv(u.uCamPos, basis.pos);
      gl.uniform1f(u.uExposure, 1.6);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(P.bulb.p);
      u = P.bulb.u;
      bindTex(u, "uLights", 0, lightTex);
      bindTex(u, "uGPos", 1, T.gp[cur]);
      gl.uniform3fv(u.uCamPos, basis.pos);
      gl.uniform3fv(u.uCamFwd, basis.fwd);
      gl.uniform3fv(u.uCamRight, basis.right);
      gl.uniform3fv(u.uCamUp, basis.up);
      gl.uniform1f(u.uTanHalf, tanHalf);
      gl.uniform2f(u.uRes, W, H);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.POINTS, 0, lights.length);
      gl.disable(gl.BLEND);
      for (var i = 0; i < 6; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
      gl.bindVertexArray(null);
      hasPrev = true;
      cur = prev;

      // stats and a one-off resolution adaptation for slow GPUs
      if (dt > 0) {
        fps = fps ? fps * 0.9 + (1 / dt) * 0.1 : 1 / dt;
        if (adapted < 2) {
          times.push(dt);
          if (times.length === 20) {
            var avg = times.reduce(function (x, y) { return x + y; }, 0) / 20;
            times = [];
            adapted++;
            if (avg > 0.045 && scale > 0.35) scale *= 0.7;
          }
        }
      }
      if (frame % 10 === 1)
        statsEl.textContent = statsTpl
          .replace("{n}", lights.length)
          .replace("{m}", st.mode === 0 ? 1 : st.M)
          .replace("{mode}", modeName())
          .replace("{fps}", Math.round(fps))
          .replace("{res}", W + "\u00d7" + H);
    }

    // run only while visible
    var visible = false, raf = 0;
    function tick(now) {
      raf = 0;
      render(now);
      if (visible && !document.hidden) raf = requestAnimationFrame(tick);
      else lastT = 0;
    }
    function kick() {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
    }
    new IntersectionObserver(function (e) {
      visible = e[0].isIntersecting;
      kick();
    }).observe(canvas);
    document.addEventListener("visibilitychange", kick);
  }

  // initialise lazily, the first time the panel is shown
  new IntersectionObserver(function (e, obs) {
    if (e[0].isIntersecting) {
      obs.disconnect();
      start();
    }
  }).observe(canvas);
})();
