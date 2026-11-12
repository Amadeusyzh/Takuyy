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
uniform sampler2D uSky;
uniform float uCamR;
vec3 skyLUT(float cosV, float cosPhi) {
  float r = uCamR;
  float vh = sqrt(max(0.0, (r - RB) * (r + RB)));
  float beta = acos(clamp(vh / r, -1.0, 1.0));
  float zha = PI - beta;
  float vz = acos(clamp(cosV, -1.0, 1.0));
  float v = vz < zha ? 0.5 * (1.0 - sqrt(max(0.0, 1.0 - vz / zha)))
                     : 0.5 + 0.5 * sqrt(max(0.0, (vz - zha) / beta));
  float u = sqrt(clamp(0.5 - 0.5 * cosPhi, 0.0, 1.0));
  return texture(uSky, vec2(u, v)).rgb;
}
uniform vec3 uSunDir;
vec3 skyDir(vec3 rd) {
  vec2 a = rd.xz, b = uSunDir.xz;
  float la = length(a), lb = length(b);
  float cp = (la > 1e-4 && lb > 1e-4) ? dot(a, b) / (la * lb) : 1.0;
  return skyLUT(rd.y, cp);
}
uniform sampler3D uShape;
uniform sampler3D uDetail;
uniform sampler2D uWeather;
uniform float uCoverage;
uniform vec3 uWind;
const float CB = 1.5, CT = 4.0;
float remap(float v, float a, float b, float c, float d) { return c + (v - a) * (d - c) / (b - a); }
float cloudBase(vec3 p, float lod, out float hf) {
  hf = (length(p) - RB - CB) / (CT - CB);
  if (hf <= 0.0 || hf >= 1.0) return 0.0;
  vec3 q = p - vec3(0.0, RB, 0.0);
  vec4 w = textureLod(uWeather, (q.xz + uWind.xz * 0.6) / 48.0, 0.0);
  float th = clamp(1.0 - 0.42 * uCoverage - 0.3 * (w.r - 0.5), 0.3, 0.995);
  float top = mix(0.45, 1.0, smoothstep(0.25, 0.75, w.g));
  float prof = smoothstep(0.0, 0.1, hf) * (1.0 - smoothstep(top * 0.3, top, hf));
  if (prof <= 0.0) return 0.0;
  vec4 s = textureLod(uShape, (q + uWind + vec3(0.0, uWind.x * 0.05, 0.0)) / 7.0, lod);
  float wf = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
  float base = remap(s.r, wf - 1.0, 1.0, 0.0, 1.0);
  float e = (base - th) / (1.0 - th);
  return clamp(e - (1.0 - prof), 0.0, 1.0);
}
float erode(float base, vec3 p, float hf, float lod) {
  vec3 q = p - vec3(0.0, RB, 0.0);
  vec3 d = textureLod(uDetail, (q + uWind * 1.6) / 1.0, lod).rgb;
  float df = d.r * 0.625 + d.g * 0.25 + d.b * 0.125;
  float dm = mix(df, 1.0 - df, clamp(hf * 4.0, 0.0, 1.0));
  return max(remap(base, dm * 0.45, 1.0, 0.0, 1.0), 0.0);
}
uniform float uDensity;
float cloudShadow(vec3 p, float lod) {
  float r = length(p);
  if (r > RB + CT) return 1.0;
  vec2 iB = sphere(p, uSunDir, RB + CB), iT = sphere(p, uSunDir, RB + CT);
  float t0 = r < RB + CB ? iB.y : 0.0;
  float t1 = r >= RB + CB && iB.x > 0.0 ? iB.x : iT.y;
  if (t1 <= t0) return 1.0;
  t1 = min(t1, t0 + 12.0);
  float dt = (t1 - t0) / 8.0, od = 0.0, hf;
  for (int i = 0; i < 8; i++) od += cloudBase(p + uSunDir * (t0 + (float(i) + 0.5) * dt), lod, hf) * dt;
  return exp(-od * uDensity * 0.6);
}
float airShadow(vec3 p) {
  float rm = RB + 0.5 * (CB + CT);
  float r = length(p);
  float t = r < rm ? min(max(sphere(p, uSunDir, rm).y, 0.0), 15.0) : 0.0;
  vec3 q = p + uSunDir * t - vec3(0.0, RB, 0.0);
  float w = textureLod(uWeather, (q.xz + uWind.xz * 0.6) / 48.0, 4.0).r;
  float th = 1.0 - 0.42 * uCoverage - 0.3 * (w - 0.5);
  return 1.0 - clamp((0.97 - th) * 2.5, 0.0, 1.0);
}
uniform vec2 uRes;
uniform vec3 uCamPos;
uniform vec3 uCamF, uCamRt, uCamUp;
uniform float uTanH, uAspect;
vec3 rayDir(vec2 uv) {
  vec2 n = uv * 2.0 - 1.0;
  return normalize(uCamF + uCamRt * (n.x * uTanH * uAspect) + uCamUp * (n.y * uTanH));
}
uniform int uSteps, uLightSteps, uOctaves, uPhase, uPowder, uView;
uniform float uFrame;
uniform vec2 uJitter;
uniform vec3 uSunE;
uniform float uPixAngle;
float hg(float mu, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * mu, 1.5)); }
float phase(float mu, float s) {
  if (uPhase == 0) return 1.0 / (4.0 * PI);
  if (uPhase == 1) return hg(mu, 0.8 * s);
  return mix(hg(mu, -0.3 * s), hg(mu, 0.8 * s), 0.7);
}
float lightOD(vec3 p, float lod) {
  float od = 0.0, t = 0.0, ds = 0.05, hf;
  for (int i = 0; i < 6; i++) {
    if (i >= uLightSteps) break;
    vec3 s = p + uSunDir * (t + 0.5 * ds);
    float b = cloudBase(s, lod, hf);
    if (b > 0.0 && i < 3) b = erode(b, s, hf, lod);
    od += b * ds;
    t += ds; ds *= 1.9;
  }
  return od * uDensity;
}
void main() {
  vec2 uv = (gl_FragCoord.xy + uJitter) / uRes;
  vec3 rd = rayDir(uv), ro = uCamPos;
  float r = length(ro);
  vec2 iB = sphere(ro, rd, RB + CB), iT = sphere(ro, rd, RB + CT);
  float tG = sphere(ro, rd, RB).x;
  bool ground = tG > 0.0;
  float t0 = 0.0, t1 = -1.0;
  if (r < RB + CB) { if (!ground) { t0 = iB.y; t1 = iT.y; } }
  else if (r > RB + CT) { if (iT.x > 0.0) { t0 = iT.x; t1 = iB.x > 0.0 ? iB.x : iT.y; } }
  else { t1 = iB.x > 0.0 ? iB.x : iT.y; }
  t1 = min(t1, 160.0);
  if (t1 <= t0) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float ta = max(t0, 0.05);
  int n = int(clamp(ceil((t1 - t0) / 0.035), 12.0, float(uSteps)));
  float lr = log(t1 / ta) / float(n);
  float grow = exp(lr) - 1.0;
  vec2 px = gl_FragCoord.xy + 5.588238 * uFrame;
  float j = fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
  float mu = dot(rd, uSunDir);
  float ph[4];
  float sc = 1.0;
  for (int k = 0; k < 4; k++) { ph[k] = phase(mu, sc); sc *= 0.5; }
  vec3 skyUp = skyLUT(1.0, 1.0) * 0.4 + (skyLUT(0.34, 1.0) + 2.0 * skyLUT(0.34, 0.0) + skyLUT(0.34, -1.0)) * 0.15;
  float sunUp = clamp(uSunDir.y * 4.0 + 0.3, 0.0, 1.0);
  vec3 groundAmb = uSunE * transLUT(RB + 0.01, uSunDir.y) * max(uSunDir.y, 0.0) * 0.3 / PI * 0.5;
  vec3 sunE = uSunE;
  float T = 1.0;
  vec3 Ls = vec3(0.0);
  float tw = 0.0, ww = 0.0, cost = 0.0;
  for (int i = 0; i < 160; i++) {
    if (i >= n || T < 0.01) break;
    float t = ta * exp(lr * (float(i) + j));
    float dt = t * grow;
    vec3 p = ro + rd * t;
    float lod = max(0.0, log2(t * uPixAngle / 0.055));
    float hf;
    float b = cloudBase(p, lod, hf);
    cost += 1.0;
    if (b <= 0.0) continue;
    b = erode(b, p, hf, lod);
    if (b <= 0.0) continue;
    float sig = b * uDensity * smoothstep(160.0, 100.0, t);
    float od = lightOD(p, lod);
    cost += float(uLightSteps) + 3.0;
    float ms = 0.0, a = 1.0, bb = 1.0;
    for (int k = 0; k < 4; k++) {
      if (k >= uOctaves) break;
      ms += a * ph[k] * exp(-bb * od);
      a *= 0.5; bb *= 0.5;
    }
    if (uPowder == 1) ms *= mix(1.0 - exp(-sig * 0.08), 1.0, 0.5 + 0.5 * mu);
    vec3 Lsun = sunE * sunTrans(p, uSunDir);
    float h1, h2;
    float odUp = (cloudBase(p + normalize(p) * 0.12, lod + 1.0, h1) * 0.12 + cloudBase(p + normalize(p) * 0.45, lod + 1.0, h2) * 0.4) * uDensity;
    vec3 amb = skyUp * exp(-0.35 * odUp) * mix(0.5, 1.0, hf) + groundAmb * (1.0 - hf);
    float Ts = exp(-sig * dt);
    Ls += T * (Lsun * ms + amb) * (1.0 - Ts);
    float wgt = T * (1.0 - Ts);
    tw += wgt * t; ww += wgt;
    T *= Ts;
  }
  if (uView == 3) { outColor = vec4(vec3(cost / (2.5 * float(uSteps))), T); return; }
  if (ww <= 0.0) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float tm = tw / ww;
  vec3 Tair = transSeg(ro, rd, tm, false);
  vec3 Tinf = ground ? transSeg(ro, rd, tG, true) : transLUT(r, dot(ro, rd) / r);
  vec3 front = skyDir(rd) * clamp((1.0 - Tair) / max(1.0 - Tinf, vec3(1e-4)), 0.0, 1.0);
  if (r < RB + CB) front *= mix(0.35, 1.0, airShadow(ro + rd * (0.5 * tm)));
  outColor = vec4((1.0 - T) * front + Tair * Ls, T);
}