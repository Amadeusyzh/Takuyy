#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
#define PI 3.14159265359
out vec4 outColor;
const float RB = 6360.0;
const float RT = 6460.0;
const vec3 RAY_S = vec3(5.802e-3, 13.558e-3, 33.1e-3);
const float MIE_S = 3.996e-3;
const float MIE_E = 4.440e-3;
const vec3 OZO_A = vec3(0.650e-3, 1.881e-3, 0.085e-3);
vec2 sphere(vec3 ro, vec3 rd, float r) {
  float l = length(ro);
  float b = dot(ro, rd);
  float c = (l - r) * (l + r);
  float d = b * b - c;
  if (d < 0.0) return vec2(-1.0);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}
void medium(float h, out vec3 sR, out float sM, out vec3 ext) {
  h = max(h, 0.0);
  float dR = exp(-h / 8.0);
  float dM = exp(-h / 1.2);
  float dO = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
  sR = RAY_S * dR;
  sM = MIE_S * dM;
  ext = sR + MIE_E * dM + OZO_A * dO;
}
float phaseR(float mu) { return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }
float phaseM(float mu) {
  const float g = 0.8;
  float k = 3.0 / (8.0 * PI) * (1.0 - g * g) / (2.0 + g * g);
  return k * (1.0 + mu * mu) / pow(1.0 + g * g - 2.0 * g * mu, 1.5);
}
uniform sampler2D uTrans;
uniform sampler2D uMS;
vec3 transLUT(float r, float mu) {
  float H = sqrt(RT * RT - RB * RB);
  float rho = sqrt(max(0.0, (r - RB) * (r + RB)));
  float disc = r * r * (mu * mu - 1.0) + RT * RT;
  float d = max(0.0, -r * mu + sqrt(max(disc, 0.0)));
  float dmin = RT - r, dmax = rho + H;
  return texture(uTrans, vec2((d - dmin) / (dmax - dmin), rho / H)).rgb;
}
vec3 sunTrans(vec3 p, vec3 sun) {
  float r = length(p);
  float mu = dot(p, sun) / r;
  float x = RB / r;
  float muH = -sqrt(max(0.0, 1.0 - x * x));
  return transLUT(r, mu) * smoothstep(muH - 0.005, muH + 0.005, mu);
}
vec3 msLUT(float r, float muS) {
  vec2 uv = vec2(muS * 0.5 + 0.5, (r - RB) / (RT - RB));
  uv = clamp(uv, 0.0, 1.0) * (31.0 / 32.0) + 0.5 / 32.0;
  return texture(uMS, uv).rgb;
}
vec3 transSeg(vec3 ro, vec3 rd, float t, bool ground) {
  vec3 pb = ro + rd * t;
  float ra = length(ro), rb = length(pb);
  float mua = dot(ro, rd) / ra, mub = dot(pb, rd) / rb;
  vec3 v = ground ? transLUT(rb, -mub) / max(transLUT(ra, -mua), vec3(1e-6))
                  : transLUT(ra, mua) / max(transLUT(rb, mub), vec3(1e-6));
  return clamp(v, 0.0, 1.0);
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5) / 31.0;
  float cosS = uv.x * 2.0 - 1.0;
  float r = RB + clamp(uv.y, 0.0, 1.0) * (RT - RB);
  r = clamp(r, RB + 0.01, RT - 0.01);
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 sun = vec3(sqrt(max(0.0, 1.0 - cosS * cosS)), cosS, 0.0);
  vec3 L2 = vec3(0.0), F = vec3(0.0);
  for (int i = 0; i < 8; i++) for (int j = 0; j < 8; j++) {
    float ct = 1.0 - 2.0 * (float(i) + 0.5) / 8.0;
    float stt = sqrt(1.0 - ct * ct);
    float ph = 2.0 * PI * (float(j) + 0.5) / 8.0;
    vec3 rd = vec3(stt * cos(ph), ct, stt * sin(ph));
    float tG = sphere(ro, rd, RB).x;
    bool ground = tG > 0.0;
    float tmax = ground ? tG : sphere(ro, rd, RT).y;
    const int N = 20;
    float dt = tmax / float(N);
    vec3 T = vec3(1.0), Ls = vec3(0.0), f = vec3(0.0);
    for (int s = 0; s < N; s++) {
      vec3 p = ro + rd * ((float(s) + 0.5) * dt);
      vec3 sR, ext; float sM;
      medium(length(p) - RB, sR, sM, ext);
      vec3 sc = sR + sM;
      vec3 Ts = exp(-ext * dt);
      vec3 w = (1.0 - Ts) / max(ext, vec3(1e-9));
      Ls += T * w * sunTrans(p, sun) * sc / (4.0 * PI);
      f += T * w * sc;
      T *= Ts;
    }
    if (ground) {
      vec3 pg = ro + rd * tG;
      Ls += T * sunTrans(pg, sun) * max(dot(normalize(pg), sun), 0.0) * 0.3 / PI;
    }
    L2 += Ls; F += f;
  }
  L2 /= 64.0; F /= 64.0;
  outColor = vec4(L2 / (1.0 - F), 1.0);
}