#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DShadow;
uniform highp sampler2D uData, uHeight, uPaint;
uniform float uWorld, uGrid, uWater, uSnowLine, uTime, uWind, uDesert;
uniform vec2 uWindDir;
uniform int uSeason;
vec4 F(int i, int k) { int t = i * 5 + k; return texelFetch(uData, ivec2(t % 2048, t / 2048), 0); }
float hAt(vec2 xz) {
  vec2 g = clamp((xz / uWorld + 0.5) * (uGrid - 1.0), vec2(0.0), vec2(uGrid - 1.001));
  ivec2 i = ivec2(floor(g)); vec2 f = fract(g);
  float a = texelFetch(uHeight, i, 0).r, b = texelFetch(uHeight, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uHeight, i + ivec2(0, 1), 0).r, d = texelFetch(uHeight, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec3 nAt(vec2 xz) {
  float e = uWorld / (uGrid - 1.0);
  float hx = hAt(xz + vec2(e, 0.0)) - hAt(xz - vec2(e, 0.0));
  float hz = hAt(xz + vec2(0.0, e)) - hAt(xz - vec2(0.0, e));
  return normalize(vec3(-hx, 2.0 * e, -hz));
}
int paintAt(vec2 xz) {
  ivec2 i = clamp(ivec2((xz / uWorld + 0.5) * (uGrid - 1.0) + 0.5), ivec2(0), ivec2(int(uGrid) - 1));
  return int(texelFetch(uPaint, i, 0).r * 255.0 + 0.5);
}
int biomeAt(vec2 xz, float h, vec3 n, float aux) {
  int b = paintAt(xz);
  if (b != 0) return b;
  if (h < uWater + 0.45 + aux * 0.3) return 3;
  if (n.y < 0.74) return 5;
  if (h > uSnowLine + aux * 2.0) return 4;
  return uDesert > 0.5 ? 3 : 1;
}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
struct S { vec3 p; vec3 n; vec3 alb; float op; int type; float aux; bool cull; float s; };
S load(int i) {
  S s; vec4 t0 = F(i, 0), t1 = F(i, 1), t2 = F(i, 2), t3 = F(i, 3), t4 = F(i, 4);
  s.type = int(t4.z + 0.5); s.aux = t4.w; s.op = t0.w; s.cull = s.op <= 0.0;
  s.p = t0.xyz; s.n = t3.yzw; s.alb = vec3(t2.z, t2.w, t3.x); s.s = t1.x;
  if (s.cull) return s;
  if (s.type == 6) {
    s.p.y = uWater + 0.04 * sin(s.p.x * 0.9 + uTime * 1.3) * cos(s.p.z * 0.7 + uTime * 1.1);
    if (hAt(s.p.xz) > uWater + 0.02) s.cull = true;
    return s;
  }
  if (s.type == 7) { s.p.x = mod(s.p.x + uTime * 0.7 * (0.3 + uWind) + uWorld, 2.0 * uWorld) - uWorld; return s; }
  if (s.type >= 10) return s;
  float hb = hAt(t4.xy);
  float rel = s.p.y;
  s.p.y += hb;
  float sway = 0.0;
  if (s.type == 1 || s.type == 9) sway = 0.22 * rel;
  else if (s.type == 2 || s.type == 3 || s.type == 4) sway = 0.012 * rel;
  if (sway > 0.0) {
    float ph = uTime * 1.9 + t4.x * 0.31 + t4.y * 0.23;
    float w = 0.6 * sin(ph + s.aux * 6.283) + 0.4 * sin(ph * 2.7 + 1.3);
    s.p.xz += uWindDir * (w * 0.7 + 0.5) * sway * uWind;
  }
  if (s.type == 1 || s.type == 9) {
    vec3 gn = nAt(t4.xy); int b = biomeAt(t4.xy, hb, gn, 0.5);
    if ((b != 1 && b != 2) || hb < uWater + 0.25) s.cull = true;
    if (s.type == 9 && (uSeason == 3 || (uSeason == 2 && s.aux < 0.7))) s.cull = true;
    if (s.type == 1) {
      if (uSeason == 0) s.alb = mix(s.alb, vec3(0.42, 0.62, 0.2), 0.35);
      else if (uSeason == 2) s.alb = mix(s.alb, vec3(0.62, 0.52, 0.22), 0.55);
      else if (uSeason == 3) { s.alb = mix(s.alb, vec3(0.9, 0.92, 0.95), 0.8); s.op *= 0.45; }
    }
  } else if (s.type == 2) {
    float k = lum(s.alb) / 0.3;
    if (uSeason == 0) s.alb = mix(s.alb, vec3(0.42, 0.68, 0.22) * k, 0.55);
    else if (uSeason == 2) s.alb = (s.aux < 0.35 ? vec3(0.86, 0.32, 0.06) : (s.aux < 0.7 ? vec3(0.95, 0.66, 0.1) : vec3(0.6, 0.12, 0.06))) * k * 0.8;
    else if (uSeason == 3) { if (s.aux < 0.93) s.cull = true; else s.alb = vec3(0.5, 0.38, 0.25) * k; }
  } else if (s.type == 4) {
    float k = lum(s.alb) / 0.8;
    if (uSeason == 1) s.alb = vec3(0.22, 0.45, 0.14) * k * 1.3;
    else if (uSeason == 2) s.alb = vec3(0.85, 0.35, 0.12) * k;
    else if (uSeason == 3) s.cull = true;
  } else if (s.type == 3 && uSeason == 3 && s.n.y > 0.25) {
    s.alb = mix(s.alb, vec3(0.9, 0.93, 0.97), 0.7);
  } else if (s.type == 5 && uSeason == 3 && s.n.y > 0.55) {
    s.alb = mix(s.alb, vec3(0.92, 0.94, 0.98), 0.85);
  }
  return s;
}
vec3 terrainAlbedo(vec2 xz, float h, vec3 n, float aux, float moist) {
  int b = biomeAt(xz, h, n, aux);
  vec3 grass = mix(vec3(0.2, 0.35, 0.1), vec3(0.4, 0.5, 0.16), moist) * (0.85 + 0.3 * aux);
  if (uSeason == 0) grass = mix(grass, vec3(0.36, 0.55, 0.18), 0.4);
  else if (uSeason == 2) grass = mix(grass, vec3(0.55, 0.45, 0.2), 0.5);
  vec3 c = grass;
  if (b == 2) { c = grass; if (aux > 0.82) c = aux > 0.94 ? vec3(0.95, 0.9, 0.95) : (aux > 0.88 ? vec3(0.95, 0.82, 0.2) : vec3(0.65, 0.4, 0.85)); }
  else if (b == 3) c = vec3(0.78, 0.7, 0.52) * (0.9 + 0.2 * aux);
  else if (b == 4) c = vec3(0.92, 0.94, 0.98);
  else if (b == 5) c = mix(vec3(0.36, 0.34, 0.32), vec3(0.52, 0.5, 0.47), aux);
  else if (b == 6) c = vec3(0.45, 0.35, 0.24) * (0.85 + 0.3 * aux);
  if (uSeason == 3 && b != 3 && n.y > 0.55 && h > uWater + 0.1) c = mix(c, vec3(0.93, 0.95, 0.98), 0.9);
  if (h < uWater) c *= vec3(0.6, 0.72, 0.75);
  return c;
}
uniform highp sampler2DShadow uShadow;
uniform mat4 uView, uProj, uLightVP;
uniform vec2 uViewport;
uniform float uFocal, uFog, uNight;
uniform vec3 uCamPos, uLightDir, uLightCol, uSkyAmb, uGroundAmb, uFogCol, uZenith, uHorizon;
uniform int uMode, uShadowsOn;
in vec2 aCorner;
in uint aIndex;
out vec4 vColor;
out vec2 vPos;
float shadowAt(vec3 p, vec3 n) {
  if (uShadowsOn == 0) return 1.0;
  vec4 c = uLightVP * vec4(p + n * 0.15 + uLightDir * 0.08, 1.0);
  vec3 q = c.xyz / c.w * 0.5 + 0.5;
  if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
  vec2 tx = 1.0 / vec2(textureSize(uShadow, 0));
  float s = texture(uShadow, vec3(q.xy + vec2(-0.7, -0.7) * tx, q.z - 0.0015));
  s += texture(uShadow, vec3(q.xy + vec2(0.7, -0.7) * tx, q.z - 0.0015));
  s += texture(uShadow, vec3(q.xy + vec2(-0.7, 0.7) * tx, q.z - 0.0015));
  s += texture(uShadow, vec3(q.xy + vec2(0.7, 0.7) * tx, q.z - 0.0015));
  return s * 0.25;
}
void cull() { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); }
void main() {
  int i = int(aIndex);
  S s = load(i);
  if (s.cull) { cull(); return; }
  vec4 cam = uView * vec4(s.p, 1.0);
  vec4 clip = uProj * cam;
  float lim = 1.25 * clip.w;
  if (cam.z > -0.35 || abs(clip.x) > lim || abs(clip.y) > lim) { cull(); return; }
  mat3 Sig;
  if (s.type == 0) {
    s.n = nAt(s.p.xz);
    vec3 t = normalize(cross(abs(s.n.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0), s.n));
    vec3 b = cross(s.n, t);
    float ss = s.s * s.s, sn = 0.0016 * ss;
    Sig = ss * (outerProduct(t, t) + outerProduct(b, b)) + sn * outerProduct(s.n, s.n);
    s.alb = terrainAlbedo(s.p.xz, s.p.y, s.n, s.aux, s.alb.r);
  } else {
    vec4 t1 = F(i, 1), t2 = F(i, 2);
    Sig = mat3(t1.x, t1.y, t1.z, t1.y, t1.w, t2.x, t1.z, t2.x, t2.y);
  }
  vec3 V = normalize(uCamPos - s.p);
  float dist = length(uCamPos - s.p);
  vec3 col;
  if (s.type == 7) {
    col = mix(uSkyAmb * 1.4 + uLightCol * 0.6, uHorizon, 0.25) * s.alb;
  } else if (s.type == 11) {
    col = s.alb;
  } else if (s.type == 10) {
    col = mix(s.alb * (uSkyAmb + uLightCol * 0.35), uHorizon, 0.55);
  } else if (s.type == 6) {
    float depth = uWater - hAt(s.p.xz);
    vec3 wn = normalize(vec3(0.12 * sin(s.p.x * 1.7 + uTime * 1.6) * uWind, 1.0, 0.12 * cos(s.p.z * 1.3 + uTime * 1.2) * uWind));
    float fres = 0.03 + 0.97 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);
    vec3 r = reflect(-V, wn);
    vec3 refl = mix(uHorizon, uZenith, clamp(r.y, 0.0, 1.0));
    float sh = shadowAt(s.p, vec3(0.0, 1.0, 0.0));
    vec3 body = mix(vec3(0.12, 0.38, 0.38), vec3(0.02, 0.1, 0.16), clamp(depth / 3.0, 0.0, 1.0)) * (uSkyAmb + uLightCol * 0.4 * sh);
    float spec = pow(max(dot(r, uLightDir), 0.0), 160.0) * 5.0 * sh;
    col = mix(body, refl, fres) + uLightCol * spec;
    float foam = 1.0 - smoothstep(0.0, 0.18, depth);
    col = mix(col, vec3(0.9) * (uSkyAmb + uLightCol * 0.6), foam * 0.6);
    s.op = clamp(0.45 + depth * 0.6, 0.45, 0.93);
  } else {
    vec3 amb = mix(uGroundAmb, uSkyAmb, s.n.y * 0.5 + 0.5);
    float ndl = dot(s.n, uLightDir);
    bool foliage = s.type == 1 || s.type == 2 || s.type == 3 || s.type == 4 || s.type == 9;
    float dif = foliage ? clamp((ndl + 0.55) / 1.55, 0.0, 1.0) : max(ndl, 0.0);
    float sh = (uLightDir.y > -0.05) ? shadowAt(s.p, s.n) : 1.0;
    col = s.alb * (amb + uLightCol * dif * sh);
    if (foliage) col += s.alb * uLightCol * 0.25 * pow(max(dot(-V, uLightDir), 0.0), 4.0) * sh;
    if (s.type == 8) col = mix(vec3(0.12, 0.15, 0.2) * (amb + uLightCol * 0.3), s.alb * 1.6, uNight);
  }
  if (s.type < 10) col = mix(col, uFogCol, 1.0 - exp(-dist * uFog));
  if (uMode == 3) col = mix(vec3(0.9, 0.95, 1.0), vec3(0.05, 0.1, 0.3), clamp(dist / 80.0, 0.0, 1.0));
  float z = -cam.z;
  mat3 J = mat3(uFocal / z, 0.0, 0.0, 0.0, uFocal / z, 0.0, uFocal * cam.x / (z * z), uFocal * cam.y / (z * z), 0.0);
  mat3 T = J * mat3(uView);
  mat3 C = T * Sig * transpose(T);
  float a = C[0][0] + 0.3, bb = C[0][1], c = C[1][1] + 0.3;
  float mid = 0.5 * (a + c), rad = length(vec2(0.5 * (a - c), bb));
  float l1 = mid + rad, l2 = max(mid - rad, 0.1);
  vec2 v1 = abs(bb) > 1e-7 ? normalize(vec2(bb, l1 - a)) : (a >= c ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  vec2 v2 = vec2(-v1.y, v1.x);
  float r1 = min(3.0 * sqrt(l1), 900.0), r2 = min(3.0 * sqrt(l2), 900.0);
  if (uMode == 2) { r1 = 1.5; r2 = 1.5; }
  vec2 off = aCorner.x * r1 * v1 + aCorner.y * r2 * v2;
  gl_Position = clip + vec4(off / uViewport * 2.0 * clip.w, 0.0, 0.0);
  vPos = aCorner * 3.0;
  vColor = vec4(max(col, vec3(0.0)), s.op);
}