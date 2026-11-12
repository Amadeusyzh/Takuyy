#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
#define PI 3.14159265359
out vec4 outColor;
uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
uint hash3(ivec3 c, int seed) { return pcg(uint(c.x) + pcg(uint(c.y) + pcg(uint(c.z) + uint(seed) * 1013u))); }
vec3 rnd3(ivec3 c, int seed) {
  uint h = hash3(c, seed);
  return vec3(float(h & 1023u), float((h >> 10u) & 1023u), float((h >> 20u) & 1023u)) / 1023.0;
}
float perlin(vec3 p, int per, int seed) {
  ivec3 i = ivec3(floor(p));
  vec3 f = p - vec3(i);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  int m = per - 1;
  float n[8];
  for (int k = 0; k < 8; k++) {
    ivec3 o = ivec3(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    vec3 g = normalize(rnd3((i + o) & m, seed) * 2.0 - 1.0 + 1e-4);
    n[k] = dot(g, f - vec3(o));
  }
  return mix(mix(mix(n[0], n[1], u.x), mix(n[2], n[3], u.x), u.y),
             mix(mix(n[4], n[5], u.x), mix(n[6], n[7], u.x), u.y), u.z);
}
float perlinFbm(vec3 p, int freq, int oct, int seed) {
  float s = 0.0, a = 1.0, n = 0.0;
  int f = freq;
  for (int o = 0; o < 8; o++) {
    if (o >= oct) break;
    s += a * perlin(p * float(f), f, seed + o);
    n += a; a *= 0.5; f *= 2;
  }
  return s / n;
}
float worley(vec3 p, int per, int seed) {
  ivec3 i = ivec3(floor(p));
  vec3 f = p - vec3(i);
  float d = 1e9;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    ivec3 o = ivec3(x, y, z);
    vec3 r = vec3(o) + rnd3((i + o) & (per - 1), seed) - f;
    d = min(d, dot(r, r));
  }
  return clamp(1.0 - sqrt(d), 0.0, 1.0);
}
float worleyFbm(vec3 p, int f, int seed) {
  return worley(p * float(f), f, seed) * 0.625 + worley(p * float(2 * f), 2 * f, seed + 1) * 0.25
       + worley(p * float(4 * f), 4 * f, seed + 2) * 0.125;
}
uniform float uZ;
uniform float uSize;
uniform int uKind;
void main() {
  vec3 p = vec3(gl_FragCoord.xy, uZ + 0.5) / uSize;
  if (uKind == 0) {
    float g = worleyFbm(p, 4, 11);
    float pn = clamp(perlinFbm(p, 4, 5, 1) * 2.2 + 0.5, 0.0, 1.0);
    float pw = clamp((pn + 1.0 - g) / (2.0 - g), 0.0, 1.0);
    outColor = vec4(pw, g, worleyFbm(p, 8, 21), worleyFbm(p, 16, 31));
  } else if (uKind == 1) {
    outColor = vec4(worleyFbm(p, 2, 41), worleyFbm(p, 4, 51), worleyFbm(p, 8, 61), 1.0);
  } else {
    p.z = 0.37;
    float cov = clamp(perlinFbm(p, 4, 5, 71) * 2.2 + 0.5, 0.0, 1.0) * 0.8 + worleyFbm(p, 8, 81) * 0.4 - 0.1;
    float type = clamp(perlinFbm(p, 2, 3, 91) * 2.2 + 0.5, 0.0, 1.0);
    float fields = clamp(perlinFbm(p, 16, 4, 101) * 2.2 + 0.5, 0.0, 1.0);
    float rough = worleyFbm(p, 32, 111);
    outColor = vec4(cov, type, fields, rough);
  }
}