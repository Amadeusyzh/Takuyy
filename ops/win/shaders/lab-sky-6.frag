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
uniform sampler2D uClouds;
uniform int uCubic;
vec4 cubicTex(sampler2D t, vec2 uv) {
  vec2 ts = vec2(textureSize(t, 0));
  vec2 p = uv * ts - 0.5;
  vec2 f = fract(p);
  p -= f;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (-f3 + 3.0 * f2 - 3.0 * f + 1.0) / 6.0;
  vec2 w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 s0 = w0 + w1;
  vec2 o0 = (p - 0.5 + w1 / s0) / ts;
  vec2 o1 = (p + 1.5 + w3 / (1.0 - s0)) / ts;
  vec4 a = mix(texture(t, vec2(o1.x, o0.y)), texture(t, vec2(o0.x, o0.y)), s0.x);
  vec4 b = mix(texture(t, vec2(o1.x, o1.y)), texture(t, vec2(o0.x, o1.y)), s0.x);
  return mix(b, a, s0.y);
}
uniform float uExposure, uStars;
uniform vec3 uSunE;
uniform int uView;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 heat(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.06, 0.04, 0.24), c1 = vec3(0.12, 0.42, 0.86), c2 = vec3(0.2, 0.78, 0.55), c3 = vec3(0.98, 0.8, 0.2), c4 = vec3(0.86, 0.16, 0.1);
  if (t < 0.25) return mix(c0, c1, t * 4.0);
  if (t < 0.5) return mix(c1, c2, t * 4.0 - 1.0);
  if (t < 0.75) return mix(c2, c3, t * 4.0 - 2.0);
  return mix(c3, c4, t * 4.0 - 3.0);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 rd = rayDir(uv), ro = uCamPos;
  float r = length(ro);
  vec3 col = skyDir(rd);
  float tG = sphere(ro, rd, RB).x;
  if (tG > 0.0) {
    vec3 pg = ro + rd * tG;
    vec3 nrm = normalize(pg);
    vec4 w = texture(uWeather, pg.xz / 23.0);
    vec4 w2 = texture(uWeather, pg.xz / 5.3 + 0.37);
    vec3 alb = mix(vec3(0.045, 0.075, 0.03), vec3(0.13, 0.115, 0.07), clamp(w.b * 1.2 - 0.1, 0.0, 1.0));
    alb *= 0.7 + 0.6 * w2.a * w2.b;
    bool cl = uView != 1;
    float sh = cl ? mix(0.2, 1.0, cloudShadow(pg, 2.0)) : 1.0;
    float shAir = cl ? airShadow(ro + rd * (0.5 * tG)) : 1.0;
    vec3 skyUp = skyLUT(1.0, 1.0) * 0.4 + (skyLUT(0.34, 1.0) + 2.0 * skyLUT(0.34, 0.0) + skyLUT(0.34, -1.0)) * 0.15;
    vec3 sunG = uSunE * sunTrans(pg, uSunDir);
    vec3 E = sunG * (max(dot(nrm, uSunDir), 0.0) * sh + max(uSunDir.y, 0.0) * (1.0 - shAir) * 0.25)
           + PI * skyUp * 0.8 * mix(0.3, 1.0, shAir);
    col = col * mix(0.35, 1.0, shAir) + alb / PI * E * transSeg(ro, rd, tG, true);
  } else {
    float cs = dot(rd, uSunDir);
    float cosR = 0.99998907;
    if (cs > cosR) {
      float x = clamp((1.0 - cs) / (1.0 - cosR), 0.0, 1.0);
      float limb = 1.0 - 0.6 * (1.0 - sqrt(1.0 - x));
      col += uSunE * transLUT(r, rd.y) * 2500.0 * limb;
    }
    if (uStars > 0.0) {
      vec3 g = floor(rd * 260.0);
      float h = fract(sin(dot(g, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      if (h > 0.9975) col += vec3(0.9, 0.95, 1.0) * uStars * (h - 0.9975) * 400.0 * transLUT(r, rd.y) / uExposure;
    }
  }
  vec4 c = uCubic == 1 ? cubicTex(uClouds, uv) : texture(uClouds, uv);
  if (uView == 0) col = col * c.a + c.rgb;
  if (uView == 2) { outColor = vec4(vec3(c.a), 1.0); return; }
  if (uView == 3) { outColor = vec4(heat(c.r), 1.0); return; }
  vec3 m = aces(col * uExposure);
  m = pow(m, vec3(1.0 / 2.2));
  float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  outColor = vec4(m + (dn - 0.5) / 255.0, 1.0);
}