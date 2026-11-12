#version 300 es
precision highp float;
precision highp int;
#define PI 3.14159265359
#define NBOX 24
#define ID_GROUND 24
uniform vec4 uBoxMin[NBOX];
uniform vec4 uBoxMax[NBOX];
uniform vec4 uBoxMat[NBOX];
uniform int uNumBoxes;
uniform highp sampler2D uLights;
uniform int uNumLights;
uniform int uFrame;
uniform vec2 uRes;

uint seed;
uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd() { seed = pcg(seed); return float(seed) * (1.0 / 4294967296.0); }
void initRng(ivec2 px, int pass) { seed = pcg(uint(px.x) + pcg(uint(px.y) + pcg(uint(uFrame) * 4u + uint(pass)))); }

struct Hit { float t; vec3 n; int id; };
void boxHit(vec3 ro, vec3 inv, vec3 lo, vec3 hi, int id, inout Hit h) {
  vec3 t0 = (lo - ro) * inv, t1 = (hi - ro) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float n = max(max(tn.x, tn.y), tn.z), f = min(min(tf.x, tf.y), tf.z);
  if (n > f || n < 1e-4 || n >= h.t) return;
  h.t = n; h.id = id;
  if (n == tn.x) h.n = vec3(-sign(inv.x), 0.0, 0.0); else if (n == tn.y) h.n = vec3(0.0, -sign(inv.y), 0.0); else h.n = vec3(0.0, 0.0, -sign(inv.z));
}
Hit trace(vec3 ro, vec3 rd) {
  Hit h; h.t = 1e9; h.id = -1; h.n = vec3(0.0, 1.0, 0.0);
  vec3 inv = 1.0 / rd;
  if (rd.y < 0.0) { float t = -ro.y / rd.y; if (t > 1e-4) { h.t = t; h.id = ID_GROUND; } }
  for (int i = 0; i < NBOX; i++) { if (i >= uNumBoxes) break; boxHit(ro, inv, uBoxMin[i].xyz, uBoxMax[i].xyz, i, h); }
  return h;
}
bool occluded(vec3 ro, vec3 rd, float tmax) {
  vec3 inv = 1.0 / rd;
  for (int i = 0; i < NBOX; i++) {
    if (i >= uNumBoxes) break;
    vec3 t0 = (uBoxMin[i].xyz - ro) * inv, t1 = (uBoxMax[i].xyz - ro) * inv;
    vec3 tn = min(t0, t1), tf = max(t0, t1);
    float n = max(max(tn.x, tn.y), tn.z), f = min(min(tf.x, tf.y), tf.z);
    if (n <= f && f > 1e-4 && n < tmax) return true;
  }
  return false;
}

float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
struct Surf { vec3 p; vec3 n; vec3 v; vec3 alb; float rough; };
Surf surface(vec4 g0, vec4 g1, vec3 eye) {
  Surf s; s.p = g0.xyz; s.n = g1.xyz; s.v = normalize(eye - s.p);
  int id = int(g1.w + 0.5);
  if (id == ID_GROUND) {
    float w = vnoise(s.p.xz * 0.45) * 0.65 + vnoise(s.p.xz * 1.7) * 0.35;
    float puddle = smoothstep(0.55, 0.62, w);
    s.alb = mix(vec3(0.11, 0.105, 0.1), vec3(0.03, 0.03, 0.035), puddle);
    s.rough = mix(0.55, 0.06, puddle);
    if (abs(s.p.x) < 0.07 && fract(s.p.z * 0.25) < 0.5) { s.alb = vec3(0.55, 0.5, 0.35); s.rough = 0.5; }
  } else {
    vec4 m = vec4(0.2, 0.2, 0.2, 0.8);
    for (int i = 0; i < NBOX; i++) if (i == id) m = uBoxMat[i];
    float b = 0.85 + 0.3 * hash12(floor(s.p.yz * vec2(3.0, 1.5)) + floor(s.p.xy * vec2(1.5, 3.0)));
    s.alb = m.rgb * b; s.rough = m.a;
  }
  return s;
}
float D_GGX(float NoH, float a) { float a2 = a * a; float d = NoH * NoH * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
float G1(float NoX, float a) { float a2 = a * a; return 2.0 * NoX / (NoX + sqrt(a2 + (1.0 - a2) * NoX * NoX)); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 contrib(int i, Surf s, out vec3 L, out float dist) {
  vec4 a = texelFetch(uLights, ivec2(i, 0), 0), b = texelFetch(uLights, ivec2(i, 1), 0);
  vec3 d = a.xyz - s.p; float d2 = dot(d, d); dist = sqrt(d2); L = d / dist;
  float NoL = dot(s.n, L), NoV = max(dot(s.n, s.v), 1e-4);
  if (NoL <= 0.0 || b.a < 0.5) return vec3(0.0);
  vec3 H = normalize(s.v + L); float NoH = max(dot(s.n, H), 0.0), VoH = max(dot(s.v, H), 0.0);
  float al = max(s.rough * s.rough, 0.003); float F = 0.04 + 0.96 * pow(1.0 - VoH, 5.0);
  float spec = D_GGX(NoH, al) * G1(NoV, al) * G1(NoL, al) * F / (4.0 * NoV * NoL);
  vec3 f = (1.0 - F) * s.alb / PI + vec3(min(spec, 60.0));
  return f * b.rgb * NoL / max(d2, a.w * a.w * 4.0 + 0.02);
}
float phat(int i, Surf s) { vec3 L; float d; return lum(contrib(i, s, L, d)); }
bool visible(int i, Surf s) {
  vec3 L; float d; contrib(i, s, L, d);
  float r = texelFetch(uLights, ivec2(i, 0), 0).w;
  return !occluded(s.p + s.n * 2e-3, L, d - r);
}
struct Reservoir { float y; float wsum; float M; float W; };
Reservoir emptyRes() { Reservoir r; r.y = -1.0; r.wsum = 0.0; r.M = 0.0; r.W = 0.0; return r; }
void update(inout Reservoir r, float y, float w) { r.wsum += w; if (w > 0.0 && rnd() * r.wsum < w) r.y = y; }
uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;
uniform float uTanHalf;
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oNrm;
void main() {
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + ndc.x * uTanHalf * uRes.x / uRes.y * uCamRight + ndc.y * uTanHalf * uCamUp);
  Hit h = trace(uCamPos, rd);
  if (h.id < 0) { oPos = vec4(rd, -1.0); oNrm = vec4(0.0); return; }
  oPos = vec4(uCamPos + rd * h.t, h.t);
  oNrm = vec4(h.n, float(h.id));
}