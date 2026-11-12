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
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(256.0, 64.0);
  float H = sqrt(RT * RT - RB * RB);
  float rho = H * uv.y;
  float r = sqrt(rho * rho + RB * RB);
  float dmin = RT - r, dmax = rho + H;
  float d = dmin + uv.x * (dmax - dmin);
  float mu = d == 0.0 ? 1.0 : (H * H - rho * rho - d * d) / (2.0 * r * d);
  mu = clamp(mu, -1.0, 1.0);
  vec3 ro = vec3(0.0, r, 0.0), rd = vec3(sqrt(1.0 - mu * mu), mu, 0.0);
  float tmax = max(sphere(ro, rd, RT).y, 0.0);
  const int N = 40;
  float dt = tmax / float(N);
  vec3 od = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec3 p = ro + rd * ((float(i) + 0.5) * dt);
    vec3 sR, ext; float sM;
    medium(length(p) - RB, sR, sM, ext);
    od += ext * dt;
  }
  outColor = vec4(exp(-od), 1.0);
}