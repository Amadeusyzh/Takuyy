#version 300 es
precision highp float;
precision highp int;
#define PI 3.14159265359
#define NOBJ 4
#define ID_LIGHT 9
uniform sampler2D uPrev;
uniform float uBlend;
uniform int uFrame;
uniform vec2 uRes;
uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;
uniform float uTanHalf, uAperture, uFocus;
uniform int uBounces, uMode;
uniform float uLightHalf, uLightPower;
uniform vec4 uObjA[NOBJ];
uniform vec4 uObjB[NOBJ];
uniform vec4 uMatA[NOBJ];
uniform vec4 uMatB[NOBJ];
layout(location = 0) out vec4 oAccum;
layout(location = 1) out vec4 oND;
layout(location = 2) out vec4 oAlb;

uint seed;
uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd() { seed = pcg(seed); return float(seed) * (1.0 / 4294967296.0); }

struct Hit { float t; vec3 n; int id; };
struct Mat { vec3 albedo; float rough; float metal; float trans; float ior; };

void sphere(vec3 ro, vec3 rd, vec3 c, float r, int id, inout Hit h) {
  vec3 oc = ro - c; float b = dot(oc, rd); float cc = dot(oc, oc) - r * r;
  float disc = b * b - cc; if (disc < 0.0) return;
  float s = sqrt(disc); float t = -b - s; if (t < 1e-4) t = -b + s;
  if (t > 1e-4 && t < h.t) { h.t = t; h.n = (ro + rd * t - c) / r; h.id = id; }
}
void box(vec3 ro, vec3 rd, vec3 c, vec3 he, float a, int id, inout Hit h) {
  float ca = cos(a), sa = sin(a);
  mat3 R = mat3(ca, 0.0, -sa, 0.0, 1.0, 0.0, sa, 0.0, ca);
  vec3 o = transpose(R) * (ro - c); vec3 d = transpose(R) * rd;
  vec3 inv = 1.0 / d; vec3 t0 = (-he - o) * inv; vec3 t1 = (he - o) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float n = max(max(tn.x, tn.y), tn.z), f = min(min(tf.x, tf.y), tf.z);
  if (n > f || f < 1e-4) return;
  float t = n > 1e-4 ? n : f; if (t >= h.t) return;
  vec3 p = (o + d * t) / he; vec3 ap = abs(p); vec3 nl;
  if (ap.x > ap.y && ap.x > ap.z) nl = vec3(sign(p.x), 0.0, 0.0); else if (ap.y > ap.z) nl = vec3(0.0, sign(p.y), 0.0); else nl = vec3(0.0, 0.0, sign(p.z));
  h.t = t; h.n = R * nl; h.id = id;
}
void rect(vec3 ro, vec3 rd, int axis, float c, vec2 lo, vec2 hi, vec3 n, int id, inout Hit h) {
  float d = rd[axis]; if (abs(d) < 1e-7) return;
  float t = (c - ro[axis]) / d; if (t < 1e-4 || t >= h.t) return;
  vec3 p = ro + rd * t; vec2 q = axis == 0 ? p.yz : (axis == 1 ? p.xz : p.xy);
  if (any(lessThan(q, lo)) || any(greaterThan(q, hi))) return;
  h.t = t; h.n = n; h.id = id;
}
Hit trace(vec3 ro, vec3 rd, bool withLight) {
  Hit h; h.t = 1e9; h.id = -1;
  for (int i = 0; i < NOBJ; i++) {
    if (uObjA[i].w < 0.5) sphere(ro, rd, uObjA[i].xyz, uObjB[i].x, i, h);
    else box(ro, rd, uObjA[i].xyz, uObjB[i].xyz, uObjB[i].w, i, h);
  }
  rect(ro, rd, 1, 0.0, vec2(-1.0), vec2(1.0), vec3(0, 1, 0), 4, h);
  rect(ro, rd, 1, 2.0, vec2(-1.0), vec2(1.0), vec3(0, -1, 0), 5, h);
  rect(ro, rd, 2, -1.0, vec2(-1.0, 0.0), vec2(1.0, 2.0), vec3(0, 0, 1), 6, h);
  rect(ro, rd, 0, -1.0, vec2(0.0, -1.0), vec2(2.0, 1.0), vec3(1, 0, 0), 7, h);
  rect(ro, rd, 0, 1.0, vec2(0.0, -1.0), vec2(2.0, 1.0), vec3(-1, 0, 0), 8, h);
  if (withLight) rect(ro, rd, 1, 1.995, vec2(-uLightHalf), vec2(uLightHalf), vec3(0, -1, 0), ID_LIGHT, h);
  return h;
}

Mat material(int id, vec3 p) {
  Mat m; m.rough = 1.0; m.metal = 0.0; m.trans = 0.0; m.ior = 1.5;
  for (int i = 0; i < NOBJ; i++) if (i == id) { m.albedo = uMatA[i].rgb; m.rough = uMatA[i].a; m.metal = uMatB[i].x; m.trans = uMatB[i].y; m.ior = uMatB[i].z; }
  if (id == 4) { float c = mod(floor(p.x * 4.0) + floor(p.z * 4.0), 2.0); m.albedo = mix(vec3(0.72), vec3(0.55), c); m.rough = 0.35; }
  else if (id == 5 || id == 6) m.albedo = vec3(0.73);
  else if (id == 7) m.albedo = vec3(0.65, 0.06, 0.05);
  else if (id == 8) m.albedo = vec3(0.12, 0.45, 0.15);
  return m;
}

void onb(vec3 n, out vec3 t, out vec3 b) {
  float s = n.z >= 0.0 ? 1.0 : -1.0; float a = -1.0 / (s + n.z); float c = n.x * n.y * a;
  t = vec3(1.0 + s * n.x * n.x * a, s * c, -s * n.x); b = vec3(c, s + n.y * n.y * a, -n.y);
}
float D_GGX(float NoH, float a) { float a2 = a * a; float d = NoH * NoH * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
float G1(float NoX, float a) { float a2 = a * a; return 2.0 * NoX / (NoX + sqrt(a2 + (1.0 - a2) * NoX * NoX)); }
vec3 fresnel(vec3 F0, float c) { return F0 + (1.0 - F0) * pow(1.0 - c, 5.0); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 sampleVNDF(vec3 Ve, float a) {
  vec3 Vh = normalize(vec3(a * Ve.x, a * Ve.y, Ve.z));
  float l2 = Vh.x * Vh.x + Vh.y * Vh.y;
  vec3 T1 = l2 > 0.0 ? vec3(-Vh.y, Vh.x, 0.0) * inversesqrt(l2) : vec3(1.0, 0.0, 0.0);
  vec3 T2 = cross(Vh, T1);
  float r = sqrt(rnd()), phi = 2.0 * PI * rnd();
  float t1 = r * cos(phi), t2 = r * sin(phi); float s = 0.5 * (1.0 + Vh.z);
  t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;
  vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * Vh;
  return normalize(vec3(a * Nh.x, a * Nh.y, max(0.0, Nh.z)));
}
float alphaOf(Mat m) { return max(m.rough * m.rough, 0.0025); }
float specProb(Mat m, float NoV) {
  vec3 F0 = mix(vec3(0.04), m.albedo, m.metal);
  float s = lum(fresnel(F0, NoV)); float d = (1.0 - m.metal) * lum(m.albedo);
  return clamp(s / (s + d + 1e-4), 0.1, 0.95);
}
vec3 evalBSDF(Mat m, vec3 n, vec3 V, vec3 L) {
  float NoV = max(dot(n, V), 1e-4), NoL = max(dot(n, L), 1e-4);
  vec3 H = normalize(V + L); float NoH = max(dot(n, H), 0.0), VoH = max(dot(V, H), 0.0);
  float a = alphaOf(m); vec3 F0 = mix(vec3(0.04), m.albedo, m.metal); vec3 F = fresnel(F0, VoH);
  vec3 spec = D_GGX(NoH, a) * G1(NoV, a) * G1(NoL, a) * F / (4.0 * NoV * NoL);
  vec3 diff = (1.0 - F) * (1.0 - m.metal) * m.albedo / PI;
  return diff + spec;
}
float pdfBSDF(Mat m, vec3 n, vec3 V, vec3 L) {
  float NoV = max(dot(n, V), 1e-4), NoL = dot(n, L); if (NoL <= 0.0) return 0.0;
  vec3 H = normalize(V + L); float a = alphaOf(m);
  float ps = specProb(m, NoV);
  float pSpec = D_GGX(max(dot(n, H), 0.0), a) * G1(NoV, a) / (4.0 * NoV);
  return ps * pSpec + (1.0 - ps) * NoL / PI;
}
vec3 sampleBSDF(Mat m, vec3 n, vec3 V) {
  vec3 t, b; onb(n, t, b);
  float NoV = max(dot(n, V), 1e-4);
  if (rnd() < specProb(m, NoV)) {
    vec3 Ve = vec3(dot(V, t), dot(V, b), dot(V, n));
    vec3 Hl = sampleVNDF(Ve, alphaOf(m));
    vec3 H = Hl.x * t + Hl.y * b + Hl.z * n;
    return reflect(-V, H);
  }
  float r = sqrt(rnd()), phi = 2.0 * PI * rnd();
  return normalize(r * cos(phi) * t + r * sin(phi) * b + sqrt(max(0.0, 1.0 - r * r)) * n);
}
float fresnelDielectric(float cosi, float eta) {
  float s2 = eta * eta * (1.0 - cosi * cosi); if (s2 > 1.0) return 1.0;
  float cost = sqrt(1.0 - s2);
  float rs = (eta * cosi - cost) / (eta * cosi + cost), rp = (cosi - eta * cost) / (cosi + eta * cost);
  return 0.5 * (rs * rs + rp * rp);
}
vec3 clampIndirect(vec3 c, int depth) { if (depth == 0) return c; float l = lum(c); return l > 3.0 ? c * (3.0 / l) : c; }
float encId(int rep, int prim) { return float(rep + 1) + 16.0 * float(prim + 1); }
void gbuffer(out vec4 nd, out vec4 alb) {
  vec2 s = (2.0 * gl_FragCoord.xy - uRes) / uRes.y * uTanHalf;
  vec3 ro = uCamPos, rd = normalize(uCamFwd + s.x * uCamRight + s.y * uCamUp);
  int prim = -1; float dist = 0.0;
  nd = vec4(-rd, 1e3); alb = vec4(1.0, 1.0, 1.0, encId(-1, -1));
  for (int k = 0; k < 4; k++) {
    Hit h = trace(ro, rd, true);
    if (h.id < 0) { alb.a = encId(-1, prim); return; }
    if (k == 0) prim = h.id;
    vec3 p = ro + rd * h.t; dist += h.t;
    bool front = dot(h.n, rd) < 0.0; vec3 n = front ? h.n : -h.n;
    if (h.id == ID_LIGHT) { nd = vec4(n, dist); alb = vec4(1.0, 1.0, 1.0, encId(ID_LIGHT, prim)); return; }
    Mat m = material(h.id, p);
    if (m.trans > 0.5) { vec3 r = refract(rd, n, front ? 1.0 / m.ior : m.ior); rd = dot(r, r) > 0.0 ? r : reflect(rd, n); ro = p + rd * 1e-3; continue; }
    nd = vec4(n, dist); alb = vec4(max(m.albedo, vec3(0.03)), encId(h.id, prim)); return;
  }
}

void main() {
  seed = pcg(uint(gl_FragCoord.x) + pcg(uint(gl_FragCoord.y) + pcg(uint(uFrame))));
  vec2 px = gl_FragCoord.xy + vec2(rnd(), rnd()) - 0.5;
  vec2 s = (2.0 * px - uRes) / uRes.y * uTanHalf;
  vec3 dir = normalize(uCamFwd + s.x * uCamRight + s.y * uCamUp);
  vec3 ro = uCamPos;
  if (uAperture > 0.0) {
    vec3 fp = ro + dir * (uFocus / dot(dir, uCamFwd));
    float r = uAperture * sqrt(rnd()), ph = 2.0 * PI * rnd();
    ro += (cos(ph) * uCamRight + sin(ph) * uCamUp) * r;
    dir = normalize(fp - ro);
  }
  vec3 rd = dir;
  float area = 4.0 * uLightHalf * uLightHalf;
  vec3 Le = vec3(1.0, 0.86, 0.68) * uLightPower / area;
  vec3 L_out = vec3(0.0), thr = vec3(1.0);
  bool lastDelta = true; float lastPdf = 0.0;
  vec4 gND, gAlb; gbuffer(gND, gAlb);
  for (int depth = 0; depth < 9; depth++) {
    if (depth > uBounces) break;
    Hit h = trace(ro, rd, true);
    if (h.id < 0) { L_out += thr * vec3(0.02, 0.025, 0.035); break; }
    vec3 p = ro + rd * h.t;
    if (h.id == ID_LIGHT) {
      float w = 1.0;
      if (!lastDelta) {
        if (uMode == 1) w = 0.0;
        else if (uMode == 2) { float cosL = max(rd.y, 1e-4); float pl = h.t * h.t / (cosL * area); w = lastPdf * lastPdf / (lastPdf * lastPdf + pl * pl); }
      }
      if (rd.y > 0.0) L_out += clampIndirect(thr * Le * w, depth);
      break;
    }
    Mat m = material(h.id, p);
    bool front = dot(h.n, rd) < 0.0; vec3 n = front ? h.n : -h.n;
    if (m.trans > 0.5) {
      vec3 hn = n;
      if (m.rough > 0.02) { vec3 t, b; onb(n, t, b); vec3 V = -rd; vec3 Hl = sampleVNDF(vec3(dot(V, t), dot(V, b), max(dot(V, n), 1e-4)), alphaOf(m)); hn = normalize(Hl.x * t + Hl.y * b + Hl.z * n); }
      float eta = front ? 1.0 / m.ior : m.ior;
      float cosi = clamp(dot(-rd, hn), 0.0, 1.0);
      float F = fresnelDielectric(cosi, eta);
      vec3 nd;
      if (rnd() < F) nd = reflect(rd, hn);
      else { nd = refract(rd, hn, eta); if (dot(nd, nd) < 1e-6) nd = reflect(rd, hn); else thr *= m.albedo; }
      ro = p + nd * 1e-3; rd = nd;
      lastDelta = true;
      continue;
    }
    vec3 V = -rd;
    vec3 po = p + n * 2e-4;
    if (uMode > 0) {
      vec3 q = vec3((rnd() * 2.0 - 1.0) * uLightHalf, 1.995, (rnd() * 2.0 - 1.0) * uLightHalf);
      vec3 Lv = q - po; float d2 = dot(Lv, Lv); float d = sqrt(d2); Lv /= d;
      float cosS = dot(n, Lv), cosL = Lv.y;
      if (cosS > 0.0 && cosL > 0.0) {
        Hit sh = trace(po, Lv, false);
        if (sh.t > d - 1e-3) {
          float pl = d2 / (cosL * area);
          float w = 1.0;
          if (uMode == 2) { float pb = pdfBSDF(m, n, V, Lv); w = pl * pl / (pl * pl + pb * pb); }
          L_out += clampIndirect(thr * evalBSDF(m, n, V, Lv) * cosS * Le * w / pl, depth);
        }
      }
    }
    vec3 Ld = sampleBSDF(m, n, V);
    float cosD = dot(n, Ld);
    if (cosD <= 0.0) break;
    float pdf = pdfBSDF(m, n, V, Ld);
    if (pdf <= 1e-6) break;
    thr *= evalBSDF(m, n, V, Ld) * cosD / pdf;
    lastPdf = pdf; lastDelta = false;
    ro = po; rd = Ld;
    if (depth >= 2) { float pr = clamp(max(thr.r, max(thr.g, thr.b)), 0.05, 0.95); if (rnd() > pr) break; thr /= pr; }
  }
  L_out = min(L_out, vec3(40.0));
  vec4 prev = texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0);
  oAccum = vec4(mix(prev.rgb, L_out, uBlend), 1.0);
  oND = gND; oAlb = gAlb;
}