// Interactive lab: progressive GPU path tracer (WebGL 2).
// GGX microfacet BRDF with visible-normal sampling (Heitz 2018), next-event
// estimation with multiple importance sampling (Veach 1995), thin-lens depth of
// field, and an edge-avoiding a-trous wavelet denoiser (Dammertz et al. 2010)
// guided by a G-buffer, as used in real-time ray tracing pipelines.
(function () {
  "use strict";

  var panel = document.getElementById("lab-pt");
  if (!panel) return;
  var root = document.getElementById("lab");
  var canvas = panel.querySelector("canvas");

  function fail() {
    panel.querySelector(".lab-stage").textContent = root.dataset.nogl2;
    panel.querySelector(".lab-controls").style.display = "none";
  }

  // ------------------------------------------------------------------ shaders
  var VS = "#version 300 es\nin vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }";

  var COMMON = [
    "#version 300 es",
    "precision highp float;",
    "precision highp int;",
    "#define PI 3.14159265359",
    "#define NOBJ 4",
    "#define ID_LIGHT 9",
  ].join("\n");

  var TRACE_FS = COMMON + "\n" + [
    "uniform sampler2D uPrev;",
    "uniform float uBlend;",
    "uniform int uFrame;",
    "uniform vec2 uRes;",
    "uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;",
    "uniform float uTanHalf, uAperture, uFocus;",
    "uniform int uBounces, uMode;",
    "uniform float uLightHalf, uLightPower;",
    "uniform vec4 uObjA[NOBJ];", // center.xyz, type (0 sphere, 1 box)
    "uniform vec4 uObjB[NOBJ];", // size.xyz (radius in x), rotY
    "uniform vec4 uMatA[NOBJ];", // albedo.rgb, roughness
    "uniform vec4 uMatB[NOBJ];", // metallic, transmission, ior, -
    "layout(location = 0) out vec4 oAccum;",
    "layout(location = 1) out vec4 oND;",
    "layout(location = 2) out vec4 oAlb;",
    "",
    "uint seed;",
    "uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }",
    "float rnd() { seed = pcg(seed); return float(seed) * (1.0 / 4294967296.0); }",
    "",
    "struct Hit { float t; vec3 n; int id; };",
    "struct Mat { vec3 albedo; float rough; float metal; float trans; float ior; };",
    "",
    "void sphere(vec3 ro, vec3 rd, vec3 c, float r, int id, inout Hit h) {",
    "  vec3 oc = ro - c; float b = dot(oc, rd); float cc = dot(oc, oc) - r * r;",
    "  float disc = b * b - cc; if (disc < 0.0) return;",
    "  float s = sqrt(disc); float t = -b - s; if (t < 1e-4) t = -b + s;",
    "  if (t > 1e-4 && t < h.t) { h.t = t; h.n = (ro + rd * t - c) / r; h.id = id; }",
    "}",
    "void box(vec3 ro, vec3 rd, vec3 c, vec3 he, float a, int id, inout Hit h) {",
    "  float ca = cos(a), sa = sin(a);",
    "  mat3 R = mat3(ca, 0.0, -sa, 0.0, 1.0, 0.0, sa, 0.0, ca);",
    "  vec3 o = transpose(R) * (ro - c); vec3 d = transpose(R) * rd;",
    "  vec3 inv = 1.0 / d; vec3 t0 = (-he - o) * inv; vec3 t1 = (he - o) * inv;",
    "  vec3 tn = min(t0, t1), tf = max(t0, t1);",
    "  float n = max(max(tn.x, tn.y), tn.z), f = min(min(tf.x, tf.y), tf.z);",
    "  if (n > f || f < 1e-4) return;",
    "  float t = n > 1e-4 ? n : f; if (t >= h.t) return;",
    "  vec3 p = (o + d * t) / he; vec3 ap = abs(p); vec3 nl;",
    "  if (ap.x > ap.y && ap.x > ap.z) nl = vec3(sign(p.x), 0.0, 0.0); else if (ap.y > ap.z) nl = vec3(0.0, sign(p.y), 0.0); else nl = vec3(0.0, 0.0, sign(p.z));",
    "  h.t = t; h.n = R * nl; h.id = id;",
    "}",
    "void rect(vec3 ro, vec3 rd, int axis, float c, vec2 lo, vec2 hi, vec3 n, int id, inout Hit h) {",
    "  float d = rd[axis]; if (abs(d) < 1e-7) return;",
    "  float t = (c - ro[axis]) / d; if (t < 1e-4 || t >= h.t) return;",
    "  vec3 p = ro + rd * t; vec2 q = axis == 0 ? p.yz : (axis == 1 ? p.xz : p.xy);",
    "  if (any(lessThan(q, lo)) || any(greaterThan(q, hi))) return;",
    "  h.t = t; h.n = n; h.id = id;",
    "}",
    "Hit trace(vec3 ro, vec3 rd, bool withLight) {",
    "  Hit h; h.t = 1e9; h.id = -1;",
    "  for (int i = 0; i < NOBJ; i++) {",
    "    if (uObjA[i].w < 0.5) sphere(ro, rd, uObjA[i].xyz, uObjB[i].x, i, h);",
    "    else box(ro, rd, uObjA[i].xyz, uObjB[i].xyz, uObjB[i].w, i, h);",
    "  }",
    "  rect(ro, rd, 1, 0.0, vec2(-1.0), vec2(1.0), vec3(0, 1, 0), 4, h);",
    "  rect(ro, rd, 1, 2.0, vec2(-1.0), vec2(1.0), vec3(0, -1, 0), 5, h);",
    "  rect(ro, rd, 2, -1.0, vec2(-1.0, 0.0), vec2(1.0, 2.0), vec3(0, 0, 1), 6, h);",
    "  rect(ro, rd, 0, -1.0, vec2(0.0, -1.0), vec2(2.0, 1.0), vec3(1, 0, 0), 7, h);",
    "  rect(ro, rd, 0, 1.0, vec2(0.0, -1.0), vec2(2.0, 1.0), vec3(-1, 0, 0), 8, h);",
    "  if (withLight) rect(ro, rd, 1, 1.995, vec2(-uLightHalf), vec2(uLightHalf), vec3(0, -1, 0), ID_LIGHT, h);",
    "  return h;",
    "}",
    "",
    "Mat material(int id, vec3 p) {",
    "  Mat m; m.rough = 1.0; m.metal = 0.0; m.trans = 0.0; m.ior = 1.5;",
    "  for (int i = 0; i < NOBJ; i++) if (i == id) { m.albedo = uMatA[i].rgb; m.rough = uMatA[i].a; m.metal = uMatB[i].x; m.trans = uMatB[i].y; m.ior = uMatB[i].z; }",
    "  if (id == 4) { float c = mod(floor(p.x * 4.0) + floor(p.z * 4.0), 2.0); m.albedo = mix(vec3(0.72), vec3(0.55), c); m.rough = 0.35; }",
    "  else if (id == 5 || id == 6) m.albedo = vec3(0.73);",
    "  else if (id == 7) m.albedo = vec3(0.65, 0.06, 0.05);",
    "  else if (id == 8) m.albedo = vec3(0.12, 0.45, 0.15);",
    "  return m;",
    "}",
    "",
    "void onb(vec3 n, out vec3 t, out vec3 b) {", // Duff et al. 2017
    "  float s = n.z >= 0.0 ? 1.0 : -1.0; float a = -1.0 / (s + n.z); float c = n.x * n.y * a;",
    "  t = vec3(1.0 + s * n.x * n.x * a, s * c, -s * n.x); b = vec3(c, s + n.y * n.y * a, -n.y);",
    "}",
    "float D_GGX(float NoH, float a) { float a2 = a * a; float d = NoH * NoH * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }",
    "float G1(float NoX, float a) { float a2 = a * a; return 2.0 * NoX / (NoX + sqrt(a2 + (1.0 - a2) * NoX * NoX)); }",
    "vec3 fresnel(vec3 F0, float c) { return F0 + (1.0 - F0) * pow(1.0 - c, 5.0); }",
    "float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }",
    "vec3 sampleVNDF(vec3 Ve, float a) {", // Heitz 2018
    "  vec3 Vh = normalize(vec3(a * Ve.x, a * Ve.y, Ve.z));",
    "  float l2 = Vh.x * Vh.x + Vh.y * Vh.y;",
    "  vec3 T1 = l2 > 0.0 ? vec3(-Vh.y, Vh.x, 0.0) * inversesqrt(l2) : vec3(1.0, 0.0, 0.0);",
    "  vec3 T2 = cross(Vh, T1);",
    "  float r = sqrt(rnd()), phi = 2.0 * PI * rnd();",
    "  float t1 = r * cos(phi), t2 = r * sin(phi); float s = 0.5 * (1.0 + Vh.z);",
    "  t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;",
    "  vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * Vh;",
    "  return normalize(vec3(a * Nh.x, a * Nh.y, max(0.0, Nh.z)));",
    "}",
    "float alphaOf(Mat m) { return max(m.rough * m.rough, 0.0025); }",
    "float specProb(Mat m, float NoV) {",
    "  vec3 F0 = mix(vec3(0.04), m.albedo, m.metal);",
    "  float s = lum(fresnel(F0, NoV)); float d = (1.0 - m.metal) * lum(m.albedo);",
    "  return clamp(s / (s + d + 1e-4), 0.1, 0.95);",
    "}",
    "vec3 evalBSDF(Mat m, vec3 n, vec3 V, vec3 L) {",
    "  float NoV = max(dot(n, V), 1e-4), NoL = max(dot(n, L), 1e-4);",
    "  vec3 H = normalize(V + L); float NoH = max(dot(n, H), 0.0), VoH = max(dot(V, H), 0.0);",
    "  float a = alphaOf(m); vec3 F0 = mix(vec3(0.04), m.albedo, m.metal); vec3 F = fresnel(F0, VoH);",
    "  vec3 spec = D_GGX(NoH, a) * G1(NoV, a) * G1(NoL, a) * F / (4.0 * NoV * NoL);",
    "  vec3 diff = (1.0 - F) * (1.0 - m.metal) * m.albedo / PI;",
    "  return diff + spec;",
    "}",
    "float pdfBSDF(Mat m, vec3 n, vec3 V, vec3 L) {",
    "  float NoV = max(dot(n, V), 1e-4), NoL = dot(n, L); if (NoL <= 0.0) return 0.0;",
    "  vec3 H = normalize(V + L); float a = alphaOf(m);",
    "  float ps = specProb(m, NoV);",
    "  float pSpec = D_GGX(max(dot(n, H), 0.0), a) * G1(NoV, a) / (4.0 * NoV);",
    "  return ps * pSpec + (1.0 - ps) * NoL / PI;",
    "}",
    "vec3 sampleBSDF(Mat m, vec3 n, vec3 V) {",
    "  vec3 t, b; onb(n, t, b);",
    "  float NoV = max(dot(n, V), 1e-4);",
    "  if (rnd() < specProb(m, NoV)) {",
    "    vec3 Ve = vec3(dot(V, t), dot(V, b), dot(V, n));",
    "    vec3 Hl = sampleVNDF(Ve, alphaOf(m));",
    "    vec3 H = Hl.x * t + Hl.y * b + Hl.z * n;",
    "    return reflect(-V, H);",
    "  }",
    "  float r = sqrt(rnd()), phi = 2.0 * PI * rnd();",
    "  return normalize(r * cos(phi) * t + r * sin(phi) * b + sqrt(max(0.0, 1.0 - r * r)) * n);",
    "}",
    "float fresnelDielectric(float cosi, float eta) {",
    "  float s2 = eta * eta * (1.0 - cosi * cosi); if (s2 > 1.0) return 1.0;",
    "  float cost = sqrt(1.0 - s2);",
    "  float rs = (eta * cosi - cost) / (eta * cosi + cost), rp = (cosi - eta * cost) / (cosi + eta * cost);",
    "  return 0.5 * (rs * rs + rp * rp);",
    "}",
    "vec3 clampIndirect(vec3 c, int depth) { if (depth == 0) return c; float l = lum(c); return l > 3.0 ? c * (3.0 / l) : c; }",
    "float encId(int rep, int prim) { return float(rep + 1) + 16.0 * float(prim + 1); }",
    // noise-free G-buffer from the pixel centre; follows glass to the first rough surface
    "void gbuffer(out vec4 nd, out vec4 alb) {",
    "  vec2 s = (2.0 * gl_FragCoord.xy - uRes) / uRes.y * uTanHalf;",
    "  vec3 ro = uCamPos, rd = normalize(uCamFwd + s.x * uCamRight + s.y * uCamUp);",
    "  int prim = -1; float dist = 0.0;",
    "  nd = vec4(-rd, 1e3); alb = vec4(1.0, 1.0, 1.0, encId(-1, -1));",
    "  for (int k = 0; k < 4; k++) {",
    "    Hit h = trace(ro, rd, true);",
    "    if (h.id < 0) { alb.a = encId(-1, prim); return; }",
    "    if (k == 0) prim = h.id;",
    "    vec3 p = ro + rd * h.t; dist += h.t;",
    "    bool front = dot(h.n, rd) < 0.0; vec3 n = front ? h.n : -h.n;",
    "    if (h.id == ID_LIGHT) { nd = vec4(n, dist); alb = vec4(1.0, 1.0, 1.0, encId(ID_LIGHT, prim)); return; }",
    "    Mat m = material(h.id, p);",
    "    if (m.trans > 0.5) { vec3 r = refract(rd, n, front ? 1.0 / m.ior : m.ior); rd = dot(r, r) > 0.0 ? r : reflect(rd, n); ro = p + rd * 1e-3; continue; }",
    "    nd = vec4(n, dist); alb = vec4(max(m.albedo, vec3(0.03)), encId(h.id, prim)); return;",
    "  }",
    "}",
    "",
    "void main() {",
    "  seed = pcg(uint(gl_FragCoord.x) + pcg(uint(gl_FragCoord.y) + pcg(uint(uFrame))));",
    "  vec2 px = gl_FragCoord.xy + vec2(rnd(), rnd()) - 0.5;",
    "  vec2 s = (2.0 * px - uRes) / uRes.y * uTanHalf;",
    "  vec3 dir = normalize(uCamFwd + s.x * uCamRight + s.y * uCamUp);",
    "  vec3 ro = uCamPos;",
    "  if (uAperture > 0.0) {", // thin lens
    "    vec3 fp = ro + dir * (uFocus / dot(dir, uCamFwd));",
    "    float r = uAperture * sqrt(rnd()), ph = 2.0 * PI * rnd();",
    "    ro += (cos(ph) * uCamRight + sin(ph) * uCamUp) * r;",
    "    dir = normalize(fp - ro);",
    "  }",
    "  vec3 rd = dir;",
    "  float area = 4.0 * uLightHalf * uLightHalf;",
    "  vec3 Le = vec3(1.0, 0.86, 0.68) * uLightPower / area;",
    "  vec3 L_out = vec3(0.0), thr = vec3(1.0);",
    "  bool lastDelta = true; float lastPdf = 0.0;",
    "  vec4 gND, gAlb; gbuffer(gND, gAlb);",
    "  for (int depth = 0; depth < 9; depth++) {",
    "    if (depth > uBounces) break;",
    "    Hit h = trace(ro, rd, true);",
    "    if (h.id < 0) { L_out += thr * vec3(0.02, 0.025, 0.035); break; }",
    "    vec3 p = ro + rd * h.t;",
    "    if (h.id == ID_LIGHT) {",
    "      float w = 1.0;",
    "      if (!lastDelta) {",
    "        if (uMode == 1) w = 0.0;",
    "        else if (uMode == 2) { float cosL = max(rd.y, 1e-4); float pl = h.t * h.t / (cosL * area); w = lastPdf * lastPdf / (lastPdf * lastPdf + pl * pl); }",
    "      }",
    "      if (rd.y > 0.0) L_out += clampIndirect(thr * Le * w, depth);",
    "      break;",
    "    }",
    "    Mat m = material(h.id, p);",
    "    bool front = dot(h.n, rd) < 0.0; vec3 n = front ? h.n : -h.n;",
    "    if (m.trans > 0.5) {",
    "      vec3 hn = n;",
    "      if (m.rough > 0.02) { vec3 t, b; onb(n, t, b); vec3 V = -rd; vec3 Hl = sampleVNDF(vec3(dot(V, t), dot(V, b), max(dot(V, n), 1e-4)), alphaOf(m)); hn = normalize(Hl.x * t + Hl.y * b + Hl.z * n); }",
    "      float eta = front ? 1.0 / m.ior : m.ior;",
    "      float cosi = clamp(dot(-rd, hn), 0.0, 1.0);",
    "      float F = fresnelDielectric(cosi, eta);",
    "      vec3 nd;",
    "      if (rnd() < F) nd = reflect(rd, hn);",
    "      else { nd = refract(rd, hn, eta); if (dot(nd, nd) < 1e-6) nd = reflect(rd, hn); else thr *= m.albedo; }",
    "      ro = p + nd * 1e-3; rd = nd;",
    "      lastDelta = true;",
    "      continue;",
    "    }",
    "    vec3 V = -rd;",
    "    vec3 po = p + n * 2e-4;",
    "    if (uMode > 0) {",
    "      vec3 q = vec3((rnd() * 2.0 - 1.0) * uLightHalf, 1.995, (rnd() * 2.0 - 1.0) * uLightHalf);",
    "      vec3 Lv = q - po; float d2 = dot(Lv, Lv); float d = sqrt(d2); Lv /= d;",
    "      float cosS = dot(n, Lv), cosL = Lv.y;",
    "      if (cosS > 0.0 && cosL > 0.0) {",
    "        Hit sh = trace(po, Lv, false);",
    "        if (sh.t > d - 1e-3) {",
    "          float pl = d2 / (cosL * area);",
    "          float w = 1.0;",
    "          if (uMode == 2) { float pb = pdfBSDF(m, n, V, Lv); w = pl * pl / (pl * pl + pb * pb); }",
    "          L_out += clampIndirect(thr * evalBSDF(m, n, V, Lv) * cosS * Le * w / pl, depth);",
    "        }",
    "      }",
    "    }",
    "    vec3 Ld = sampleBSDF(m, n, V);",
    "    float cosD = dot(n, Ld);",
    "    if (cosD <= 0.0) break;",
    "    float pdf = pdfBSDF(m, n, V, Ld);",
    "    if (pdf <= 1e-6) break;",
    "    thr *= evalBSDF(m, n, V, Ld) * cosD / pdf;",
    "    lastPdf = pdf; lastDelta = false;",
    "    ro = po; rd = Ld;",
    "    if (depth >= 2) { float pr = clamp(max(thr.r, max(thr.g, thr.b)), 0.05, 0.95); if (rnd() > pr) break; thr /= pr; }",
    "  }",
    "  L_out = min(L_out, vec3(40.0));", // clamp fireflies
    "  vec4 prev = texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0);",
    "  oAccum = vec4(mix(prev.rgb, L_out, uBlend), 1.0);",
    "  oND = gND; oAlb = gAlb;",
    "}",
  ].join("\n");

  // edge-avoiding a-trous wavelet filter (one level per pass)
  var ATROUS_FS = COMMON + "\n" + [
    "uniform sampler2D uIn, uND, uAlb;",
    "uniform int uStep, uDemod;",
    "uniform float uSigC, uSigN, uSigZ;",
    "out vec4 o;",
    "vec3 fetch(ivec2 q) {",
    "  vec3 c = texelFetch(uIn, q, 0).rgb;",
    "  if (uDemod == 1) c /= texelFetch(uAlb, q, 0).rgb;",
    "  return c;",
    "}",
    "void main() {",
    "  ivec2 p = ivec2(gl_FragCoord.xy); ivec2 sz = textureSize(uIn, 0);",
    "  vec3 cp = fetch(p); vec4 ndp = texelFetch(uND, p, 0); float idp = texelFetch(uAlb, p, 0).a;",
    "  float k[3] = float[3](0.375, 0.25, 0.0625);",
    "  vec3 sum = vec3(0.0); float wsum = 0.0;",
    "  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {",
    "    ivec2 q = clamp(p + ivec2(x, y) * uStep, ivec2(0), sz - 1);",
    "    vec3 cq = fetch(q); vec4 ndq = texelFetch(uND, q, 0);",
    "    float wc = exp(-dot(cp - cq, cp - cq) / (uSigC * uSigC + 1e-6));",
    "    float wn = pow(max(dot(ndp.xyz, ndq.xyz), 0.0), uSigN);",
    "    float wz = exp(-abs(ndp.w - ndq.w) / (uSigZ * float(uStep) + 1e-3));",
    "    float wi = texelFetch(uAlb, q, 0).a == idp ? 1.0 : 0.2;",
    "    float w = k[abs(x)] * k[abs(y)] * wc * wn * wz * wi;",
    "    sum += cq * w; wsum += w;",
    "  }",
    "  o = vec4(sum / max(wsum, 1e-6), 1.0);",
    "}",
  ].join("\n");

  var DISPLAY_FS = COMMON + "\n" + [
    "uniform sampler2D uAccum, uDen, uND, uAlb;",
    "uniform int uView, uDenoise, uSel;",
    "uniform float uExposure;",
    "out vec4 o;",
    "vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }",
    "void main() {",
    "  ivec2 p = ivec2(gl_FragCoord.xy);",
    "  vec4 alb = texelFetch(uAlb, p, 0); vec4 nd = texelFetch(uND, p, 0);",
    "  vec3 c;",
    "  if (uView == 0) c = uDenoise == 1 ? texelFetch(uDen, p, 0).rgb * alb.rgb : texelFetch(uAccum, p, 0).rgb;",
    "  else if (uView == 1) c = texelFetch(uAccum, p, 0).rgb;",
    "  if (uView <= 1) c = pow(aces(c * uExposure), vec3(1.0 / 2.2));",
    "  else if (uView == 2) c = pow(alb.rgb, vec3(1.0 / 2.2));",
    "  else if (uView == 3) c = nd.xyz * 0.5 + 0.5;",
    "  else c = vec3(1.0 - clamp((nd.w - 1.5) / 4.0, 0.0, 1.0));",
    // outline of the selected object
    "  if (uSel >= 0) {",
    "    bool inSel = int(floor(alb.a / 16.0 + 0.01)) - 1 == uSel; int edge = 0;",
    "    ivec2 sz = textureSize(uAlb, 0);",
    "    for (int k = 0; k < 4; k++) { ivec2 q = clamp(p + ivec2(k == 0 ? 2 : (k == 1 ? -2 : 0), k == 2 ? 2 : (k == 3 ? -2 : 0)), ivec2(0), sz - 1);",
    "      bool qs = int(floor(texelFetch(uAlb, q, 0).a / 16.0 + 0.01)) - 1 == uSel; if (qs != inSel) edge = 1; }",
    "    if (edge == 1) c = mix(c, vec3(1.0, 0.8, 0.2), 0.85);",
    "  }",
    "  o = vec4(c, 1.0);",
    "}",
  ].join("\n");

  // ------------------------------------------------------------------ scene
  var PRESETS = {
    diffuse: { rough: 1.0, metal: 0, trans: 0 },
    plastic: { rough: 0.3, metal: 0, trans: 0 },
    metal: { rough: 0.25, metal: 1, trans: 0 },
    mirror: { rough: 0.02, metal: 1, trans: 0 },
    glass: { rough: 0.0, metal: 0, trans: 1 },
    frosted: { rough: 0.25, metal: 0, trans: 1 },
  };
  var COLORS = [[0.9, 0.9, 0.9], [0.85, 0.12, 0.1], [1.0, 0.76, 0.33], [0.15, 0.3, 0.85], [0.2, 0.7, 0.35], [0.95, 0.5, 0.75]];

  function defaultScene() {
    return [
      { type: 0, c: [-0.48, 0.34, 0.25], s: [0.34, 0, 0], rot: 0, albedo: [0.95, 0.97, 1.0], rough: 0.0, metal: 0, trans: 1, ior: 1.5, preset: "glass" },
      { type: 0, c: [0.5, 0.3, 0.35], s: [0.3, 0, 0], rot: 0, albedo: [1.0, 0.76, 0.33], rough: 0.25, metal: 1, trans: 0, ior: 1.5, preset: "metal" },
      { type: 1, c: [0.05, 0.45, -0.45], s: [0.27, 0.45, 0.27], rot: 0.45, albedo: [0.15, 0.3, 0.85], rough: 0.3, metal: 0, trans: 0, ior: 1.5, preset: "plastic" },
      { type: 0, c: [0.02, 0.16, 0.62], s: [0.16, 0, 0], rot: 0, albedo: [0.9, 0.9, 0.9], rough: 0.02, metal: 1, trans: 0, ior: 1.5, preset: "mirror" },
    ];
  }

  // --------------------------------------------------------------- picking (CPU)
  function hitObject(o, ro, rd) {
    if (o.type === 0) {
      var oc = [ro[0] - o.c[0], ro[1] - o.c[1], ro[2] - o.c[2]];
      var b = oc[0] * rd[0] + oc[1] * rd[1] + oc[2] * rd[2];
      var cc = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - o.s[0] * o.s[0];
      var disc = b * b - cc;
      if (disc < 0) return Infinity;
      var t = -b - Math.sqrt(disc);
      return t > 0 ? t : Infinity;
    }
    var ca = Math.cos(o.rot), sa = Math.sin(o.rot);
    function toLocal(v) { return [ca * v[0] - sa * v[2], v[1], sa * v[0] + ca * v[2]]; }
    var lo = toLocal([ro[0] - o.c[0], ro[1] - o.c[1], ro[2] - o.c[2]]), ld = toLocal(rd);
    var tn = -Infinity, tf = Infinity;
    for (var k = 0; k < 3; k++) {
      var t0 = (-o.s[k] - lo[k]) / ld[k], t1 = (o.s[k] - lo[k]) / ld[k];
      tn = Math.max(tn, Math.min(t0, t1));
      tf = Math.min(tf, Math.max(t0, t1));
    }
    return tn <= tf && tn > 0 ? tn : Infinity;
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
    function prog(fs) {
      var p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
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
      P = { trace: prog(TRACE_FS), atrous: prog(ATROUS_FS), display: prog(DISPLAY_FS) };
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

    var W = 0, H = 0, T = null;
    function allocate(w, h) {
      if (T) {
        [T.acc0, T.acc1, T.nd, T.alb, T.den0, T.den1].forEach(function (t) { gl.deleteTexture(t); });
        [T.f0, T.f1, T.fd0, T.fd1].forEach(function (f) { gl.deleteFramebuffer(f); });
      }
      W = w;
      H = h;
      T = { acc0: tex(w, h), acc1: tex(w, h), nd: tex(w, h), alb: tex(w, h), den0: tex(w, h), den1: tex(w, h) };
      T.f0 = fbo([T.acc0, T.nd, T.alb]);
      T.f1 = fbo([T.acc1, T.nd, T.alb]);
      T.fd0 = fbo([T.den0]);
      T.fd1 = fbo([T.den1]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      resetAccum();
    }

    // -------------------------------------------------------------- state
    var objs = defaultScene();
    var st = { bounces: 5, mode: 2, denoise: true, view: 0, lightSize: 0.45, aperture: 0, focus: 3.2, sel: -1 };
    var cam = { yaw: 0.0, pitch: 0.1, dist: 3.5, target: [0, 0.9, 0] };
    var frame = 0, spp = 0, ping = 0;
    var MAX_SPP = 4096;
    var basis;
    var tanHalf = Math.tan((38 * Math.PI) / 360);

    function resetAccum() { spp = 0; }

    function updateCamera() {
      var cp = Math.cos(cam.pitch);
      var pos = [cam.target[0] + cam.dist * cp * Math.sin(cam.yaw), cam.target[1] + cam.dist * Math.sin(cam.pitch), cam.target[2] + cam.dist * cp * Math.cos(cam.yaw)];
      var f = [cam.target[0] - pos[0], cam.target[1] - pos[1], cam.target[2] - pos[2]];
      var fl = Math.hypot(f[0], f[1], f[2]);
      f = [f[0] / fl, f[1] / fl, f[2] / fl];
      var r = [-f[2], 0, f[0]];
      var rl = Math.hypot(r[0], r[2]);
      r = [r[0] / rl, 0, r[2] / rl];
      var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      basis = { pos: pos, fwd: f, right: r, up: u };
    }
    updateCamera();

    function rayAt(mx, my) {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var sx = ((2 * mx - w) / h) * tanHalf, sy = ((h - 2 * my) / h) * tanHalf;
      var d = [0, 1, 2].map(function (k) { return basis.fwd[k] + sx * basis.right[k] + sy * basis.up[k]; });
      var l = Math.hypot(d[0], d[1], d[2]);
      return [d[0] / l, d[1] / l, d[2] / l];
    }
    function pick(mx, my) {
      var d = rayAt(mx, my), best = -1, bt = Infinity;
      objs.forEach(function (o, i) {
        var t = hitObject(o, basis.pos, d);
        if (t < bt) { bt = t; best = i; }
      });
      return { id: best, t: bt, dir: d };
    }
    // distance to the first surface (objects or room), for click-to-focus
    function surfaceDistance(d) {
      var t = Infinity;
      objs.forEach(function (o) { t = Math.min(t, hitObject(o, basis.pos, d)); });
      [[1, 0], [1, 2], [2, -1], [0, -1], [0, 1]].forEach(function (pl) {
        var ax = pl[0], c = pl[1];
        if (Math.abs(d[ax]) < 1e-6) return;
        var tt = (c - basis.pos[ax]) / d[ax];
        if (tt > 0) t = Math.min(t, tt);
      });
      return t === Infinity ? 3.2 : t * (d[0] * basis.fwd[0] + d[1] * basis.fwd[1] + d[2] * basis.fwd[2]);
    }

    // ----------------------------------------------------------- controls UI
    var selName = panel.querySelector(".pt-selname");
    var matBox = panel.querySelector(".pt-material");
    var roughIn = panel.querySelector('[data-input="rough"]');
    function syncMaterialUI() {
      var o = objs[st.sel];
      matBox.hidden = !o;
      selName.textContent = o ? panel.dataset["obj" + st.sel] : panel.dataset.nosel;
      if (!o) return;
      Array.prototype.forEach.call(panel.querySelectorAll("[data-preset]"), function (b) {
        b.setAttribute("aria-pressed", b.dataset.preset === o.preset ? "true" : "false");
      });
      roughIn.value = o.rough;
    }
    Array.prototype.forEach.call(panel.querySelectorAll("[data-preset]"), function (b) {
      b.addEventListener("click", function () {
        var o = objs[st.sel];
        if (!o) return;
        var pr = PRESETS[b.dataset.preset];
        o.rough = pr.rough;
        o.metal = pr.metal;
        o.trans = pr.trans;
        o.preset = b.dataset.preset;
        if (pr.trans) o.albedo = [0.95, 0.97, 1.0];
        syncMaterialUI();
        resetAccum();
      });
    });
    var swatches = panel.querySelector(".pt-swatches");
    COLORS.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pt-swatch";
      b.style.background = "rgb(" + c.map(function (v) { return Math.round(Math.pow(v, 1 / 2.2) * 255); }).join(",") + ")";
      b.addEventListener("click", function () {
        var o = objs[st.sel];
        if (!o) return;
        o.albedo = c.slice();
        resetAccum();
      });
      swatches.appendChild(b);
    });
    roughIn.addEventListener("input", function () {
      var o = objs[st.sel];
      if (!o) return;
      o.rough = +roughIn.value;
      resetAccum();
    });
    function seg(attr, key) {
      var bs = panel.querySelectorAll("[" + attr + "]");
      Array.prototype.forEach.call(bs, function (b) {
        var val = +b.getAttribute(attr);
        b.setAttribute("aria-pressed", val === st[key] ? "true" : "false");
        b.addEventListener("click", function () {
          st[key] = val;
          Array.prototype.forEach.call(bs, function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
          if (key === "mode") resetAccum();
        });
      });
    }
    seg("data-mode", "mode");
    seg("data-view", "view");
    var denBtn = panel.querySelector('[data-toggle="denoise"]');
    denBtn.addEventListener("click", function () {
      st.denoise = !st.denoise;
      denBtn.setAttribute("aria-pressed", st.denoise ? "true" : "false");
    });
    function slider(name, key) {
      var el = panel.querySelector('[data-input="' + name + '"]');
      el.value = st[key];
      el.addEventListener("input", function () {
        st[key] = +el.value;
        resetAccum();
      });
    }
    slider("bounces", "bounces");
    slider("light", "lightSize");
    slider("aperture", "aperture");
    panel.querySelector('[data-action="reset"]').addEventListener("click", function () {
      objs = defaultScene();
      st.sel = -1;
      cam.yaw = 0;
      cam.pitch = 0.1;
      updateCamera();
      syncMaterialUI();
      resetAccum();
    });
    syncMaterialUI();

    // ------------------------------------------------------------ pointer
    var hint = panel.querySelector(".lab-hint");
    var drag = null;
    function local(e) {
      var r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }
    canvas.addEventListener("pointerdown", function (e) {
      var m = local(e);
      canvas.setPointerCapture(e.pointerId);
      hint.style.opacity = "0";
      var hit = pick(m[0], m[1]);
      if (hit.id >= 0) {
        var o = objs[hit.id];
        st.sel = hit.id;
        syncMaterialUI();
        // drag on the horizontal plane through the object's centre
        var y = o.c[1];
        var t = (y - basis.pos[1]) / hit.dir[1];
        var px = basis.pos[0] + hit.dir[0] * t, pz = basis.pos[2] + hit.dir[2] * t;
        drag = { mode: "move", id: hit.id, off: [o.c[0] - px, o.c[2] - pz], x: m[0], y: m[1], moved: false };
      } else {
        drag = { mode: "orbit", x: m[0], y: m[1], moved: false, sx: m[0], sy: m[1] };
      }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var m = local(e);
      if (Math.abs(m[0] - drag.x) + Math.abs(m[1] - drag.y) > 0) drag.moved = true;
      if (drag.mode === "orbit") {
        cam.yaw = Math.max(-0.85, Math.min(0.85, cam.yaw - (m[0] - drag.x) * 0.006));
        cam.pitch = Math.max(-0.05, Math.min(0.75, cam.pitch + (m[1] - drag.y) * 0.005));
        updateCamera();
      } else {
        var o = objs[drag.id];
        var d = rayAt(m[0], m[1]);
        if (Math.abs(d[1]) > 1e-4) {
          var t = (o.c[1] - basis.pos[1]) / d[1];
          if (t > 0) {
            var r = o.type === 0 ? o.s[0] : Math.max(o.s[0], o.s[2]) * 1.2;
            o.c[0] = Math.max(-1 + r, Math.min(1 - r, basis.pos[0] + d[0] * t + drag.off[0]));
            o.c[2] = Math.max(-1 + r, Math.min(1.0, basis.pos[2] + d[2] * t + drag.off[1]));
          }
        }
      }
      drag.x = m[0];
      drag.y = m[1];
      resetAccum();
    });
    function end() {
      if (drag && drag.mode === "orbit" && !drag.moved && st.sel >= 0) {
        st.sel = -1;
        syncMaterialUI();
      }
      drag = null;
    }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("dblclick", function (e) {
      var m = local(e);
      st.focus = surfaceDistance(rayAt(m[0], m[1]));
      if (st.aperture === 0) {
        st.aperture = 0.06;
        panel.querySelector('[data-input="aperture"]').value = 0.06;
      }
      resetAccum();
    });

    // --------------------------------------------------------------- frame
    var statsEl = panel.querySelector(".lab-stats");
    var statsTpl = panel.dataset.stats;
    var scale = Math.min(window.devicePixelRatio || 1, 1.25);
    var times = [], adapted = 0;
    var raysPerSec = 0, lastT = 0;

    function setObjUniforms(u) {
      var A = [], B = [], MA = [], MB = [];
      objs.forEach(function (o) {
        A.push(o.c[0], o.c[1], o.c[2], o.type);
        B.push(o.s[0], o.s[1], o.s[2], o.rot);
        MA.push(o.albedo[0], o.albedo[1], o.albedo[2], o.rough);
        MB.push(o.metal, o.trans, o.ior, 0);
      });
      gl.uniform4fv(u.uObjA, A);
      gl.uniform4fv(u.uObjB, B);
      gl.uniform4fv(u.uMatA, MA);
      gl.uniform4fv(u.uMatB, MB);
    }

    function render(now) {
      var w = Math.max(16, Math.round(canvas.clientWidth * scale));
      var h = Math.max(16, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      if (w !== W || h !== H) allocate(w, h);
      gl.bindVertexArray(vao);

      var traced = false;
      if (spp < MAX_SPP) {
        var src = ping === 0 ? T.acc1 : T.acc0;
        gl.bindFramebuffer(gl.FRAMEBUFFER, ping === 0 ? T.f0 : T.f1);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
        gl.viewport(0, 0, W, H);
        var u = P.trace.u;
        gl.useProgram(P.trace.p);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src);
        gl.uniform1i(u.uPrev, 0);
        spp++;
        frame++;
        gl.uniform1f(u.uBlend, 1 / spp);
        gl.uniform1i(u.uFrame, frame);
        gl.uniform2f(u.uRes, W, H);
        gl.uniform3fv(u.uCamPos, basis.pos);
        gl.uniform3fv(u.uCamFwd, basis.fwd);
        gl.uniform3fv(u.uCamRight, basis.right);
        gl.uniform3fv(u.uCamUp, basis.up);
        gl.uniform1f(u.uTanHalf, tanHalf);
        gl.uniform1f(u.uAperture, st.aperture);
        gl.uniform1f(u.uFocus, st.focus);
        gl.uniform1i(u.uBounces, st.bounces);
        gl.uniform1i(u.uMode, st.mode);
        gl.uniform1f(u.uLightHalf, 0.06 + st.lightSize * 0.5);
        gl.uniform1f(u.uLightPower, 1.6);
        setObjUniforms(u);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        ping ^= 1;
        traced = true;
      }
      var accTex = ping === 1 ? T.acc0 : T.acc1;

      // denoise: 5 levels of the a-trous wavelet (steps 1, 2, 4, 8, 16)
      if (st.denoise && st.view === 0) {
        gl.useProgram(P.atrous.p);
        var a = P.atrous.u;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, T.nd);
        gl.uniform1i(a.uND, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, T.alb);
        gl.uniform1i(a.uAlb, 2);
        gl.uniform1f(a.uSigN, 64.0);
        gl.uniform1f(a.uSigZ, 0.06);
        var input = accTex;
        for (var lvl = 0; lvl < 5; lvl++) {
          var dst = lvl % 2 === 0 ? T.fd0 : T.fd1;
          gl.bindFramebuffer(gl.FRAMEBUFFER, dst);
          gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, input);
          gl.uniform1i(a.uIn, 0);
          gl.uniform1i(a.uStep, 1 << lvl);
          gl.uniform1i(a.uDemod, lvl === 0 ? 1 : 0);
          gl.uniform1f(a.uSigC, (2.0 / Math.sqrt(spp)) * Math.pow(0.5, lvl) + 0.002);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          input = lvl % 2 === 0 ? T.den0 : T.den1;
        }
        var denTex = input;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(P.display.p);
      var d = P.display.u;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, accTex);
      gl.uniform1i(d.uAccum, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, denTex || accTex);
      gl.uniform1i(d.uDen, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, T.nd);
      gl.uniform1i(d.uND, 2);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, T.alb);
      gl.uniform1i(d.uAlb, 3);
      gl.uniform1i(d.uView, st.view);
      gl.uniform1i(d.uDenoise, st.denoise ? 1 : 0);
      gl.uniform1i(d.uSel, st.sel);
      gl.uniform1f(d.uExposure, 1.3);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      for (var i = 0; i < 4; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }

      // stats and a one-off resolution adaptation for slow GPUs
      if (lastT) {
        var dt = (now - lastT) / 1000;
        if (traced) raysPerSec = raysPerSec * 0.9 + ((W * H) / dt) * 0.1;
        if (adapted < 2 && traced) {
          times.push(dt);
          if (times.length === 20) {
            var avg = times.reduce(function (x, y) { return x + y; }, 0) / 20;
            times = [];
            adapted++;
            if (avg > 0.045 && scale > 0.4) scale *= 0.7;
          }
        }
      }
      lastT = now;
      if (frame % 10 === 0 || !traced)
        statsEl.textContent = statsTpl
          .replace("{spp}", spp)
          .replace("{mps}", (raysPerSec / 1e6).toFixed(1))
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
