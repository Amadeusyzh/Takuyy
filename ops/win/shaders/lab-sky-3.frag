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
uniform float uCamR;
uniform float uSunCos;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(192.0, 108.0);
  float r = uCamR;
  float vh = sqrt(max(0.0, (r - RB) * (r + RB)));
  float beta = acos(clamp(vh / r, -1.0, 1.0));
  float zha = PI - beta;
  float vz;
  if (uv.y < 0.5) { float c = 1.0 - 2.0 * uv.y; vz = zha * (1.0 - c * c); }
  else { float c = uv.y * 2.0 - 1.0; vz = zha + beta * c * c; }
  float cosPhi = 1.0 - 2.0 * uv.x * uv.x;
  float sinPhi = sqrt(max(0.0, 1.0 - cosPhi * cosPhi));
  vec3 rd = vec3(sin(vz) * cosPhi, cos(vz), sin(vz) * sinPhi);
  vec3 sun = vec3(sqrt(max(0.0, 1.0 - uSunCos * uSunCos)), uSunCos, 0.0);
  vec3 ro = vec3(0.0, r, 0.0);
  float tG = sphere(ro, rd, RB).x;
  float tmax = tG > 0.0 ? tG : sphere(ro, rd, RT).y;
  float mu = dot(rd, sun);
  float pR = phaseR(mu), pM = phaseM(mu);
  const int N = 32;
  vec3 Ls = vec3(0.0), T = vec3(1.0);
  float t0 = 0.0;
  for (int s = 0; s < N; s++) {
    float t1 = tmax * pow((float(s) + 1.0) / float(N), 2.0);
    float dt = t1 - t0;
    vec3 p = ro + rd * (t0 + 0.3 * dt);
    t0 = t1;
    float rp = length(p);
    vec3 sR, ext; float sM;
    medium(rp - RB, sR, sM, ext);
    vec3 Ts = exp(-ext * dt);
    vec3 S = sunTrans(p, sun) * (sR * pR + sM * pM) + msLUT(rp, dot(p, sun) / rp) * (sR + sM);
    Ls += T * S * (1.0 - Ts) / max(ext, vec3(1e-9));
    T *= Ts;
  }
  outColor = vec4(Ls, 1.0);
}