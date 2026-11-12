#version 300 es
precision highp float;
precision highp int;
#define MAXP 16
#define NPROBE 64
#define SLICE_R 3.00
#define TMAX 40.0
#define HEAT_MAX 48
uniform vec4 uA[MAXP];
uniform vec4 uB[MAXP];
uniform vec4 uC[MAXP];
uniform mat3 uR[MAXP];
uniform int uN;
uniform float uK;
uniform vec3 uCamPos, uCamR, uCamU, uCamF;
uniform float uTanHalf;
uniform vec2 uRes, uJitter;
uniform int uView;
uniform int uMaxSteps;
uniform float uOmega;
uniform int uSoft, uAO;
uniform float uSliceH;
uniform int uSel;
uniform vec4 uProbe[NPROBE];
uniform int uProbeN;
uniform vec3 uProbeO, uProbeE;
uniform int uProbeHit;
out vec4 outColor;
const vec3 LDIR = vec3(-0.43689, 0.75728, 0.48544);
float gClip;
#define ZERO min(uN, 0)

float sdPrim(int i, vec3 p) {
  vec4 a = uA[i]; vec4 b = uB[i];
  vec3 q = uR[i] * (p - a.xyz);
  int ty = int(a.w + 0.5) & 7;
  if (ty == 0) return length(q) - b.x;
  if (ty == 1) { vec3 d = abs(q) - b.xyz + b.w; return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - b.w; }
  if (ty == 2) { vec2 t = vec2(length(q.xz) - b.x, q.y); return length(t) - b.y; }
  q.y -= clamp(q.y, -b.y, b.y); return length(q) - b.x;
}

float mapObj(vec3 p) {
  float d = 1e5; float k = max(uK, 1e-4);
  for (int i = 0; i < MAXP; i++) {
    if (i >= uN) break;
    vec4 a = uA[i];
    bool carve = a.w > 7.5;
    float lb = length(p - a.xyz) - uC[i].w;
    if (carve ? lb >= k - d : lb >= d + k) continue;
    float di = sdPrim(i, p);
    if (!carve) { float h = clamp(0.5 + 0.5 * (di - d) / k, 0.0, 1.0); d = mix(di, d, h) - k * h * (1.0 - h); }
    else { float h = clamp(0.5 + 0.5 * (di + d) / k, 0.0, 1.0); d = mix(-di, d, h) + k * h * (1.0 - h); }
  }
  return d;
}

vec3 objColor(vec3 p) {
  float d = 1e5; float k = max(uK, 1e-4); vec3 col = vec3(0.5);
  for (int i = 0; i < MAXP; i++) {
    if (i >= uN) break;
    vec4 a = uA[i];
    bool carve = a.w > 7.5;
    float lb = length(p - a.xyz) - uC[i].w;
    if (carve ? lb >= k - d : lb >= d + k) continue;
    float di = sdPrim(i, p);
    if (!carve) { float h = clamp(0.5 + 0.5 * (di - d) / k, 0.0, 1.0); d = mix(di, d, h) - k * h * (1.0 - h); col = mix(uC[i].rgb, col, h); }
    else { float h = clamp(0.5 + 0.5 * (di + d) / k, 0.0, 1.0); d = mix(-di, d, h) + k * h * (1.0 - h); col = mix(mix(col, uC[i].rgb, 0.65), col, h); }
  }
  return col;
}

float map(vec3 p) { return max(min(mapObj(p), p.y), p.y - gClip); }

vec3 calcNormal(vec3 p, float e) {
  const vec2 s = vec2(1.0, -1.0);
  return normalize(s.xyy * map(p + s.xyy * e) + s.yyx * map(p + s.yyx * e) + s.yxy * map(p + s.yxy * e) + s.xxx * map(p + s.xxx * e));
}

float trace(vec3 ro, vec3 rd, float pixR, out int steps, out int status) {
  float t = 0.0, omega = uOmega, prevF = 0.0, stepLen = 0.0;
  steps = 0; status = -1;
  for (int i = 0; i < uMaxSteps; i++) {
    steps++;
    float f = map(ro + rd * t);
    if (omega > 1.0 && abs(f) + prevF < stepLen) {
      t += prevF - stepLen; stepLen = prevF; omega = 1.0; continue;
    }
    if (f < pixR * t + 1e-4) { status = 1; break; }
    stepLen = f * omega; prevF = f; t += stepLen;
    if (t > TMAX) { status = 0; break; }
  }
  return t;
}

float shadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.015, ph = 1e10;
  for (int i = ZERO; i < 56; i++) {
    float h = map(ro + rd * t);
    if (h < 0.0004) return 0.0;
    if (uSoft == 1) {
      float y = h * h / (2.0 * ph);
      float d = sqrt(max(h * h - y * y, 0.0));
      res = min(res, 9.0 * d / max(1e-4, t - y));
      ph = h;
    }
    t += clamp(h, 0.01, 0.45);
    if (t > 14.0 || res < 0.002) break;
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = ZERO; i < 5; i++) {
    float h = 0.015 + 0.11 * float(i);
    occ += (h - map(p + n * h)) * sca;
    sca *= 0.85;
  }
  return clamp(1.0 - 2.2 * occ, 0.0, 1.0);
}

vec3 background(vec3 rd) {
  float y = rd.y;
  vec3 c = mix(vec3(0.016, 0.019, 0.026), vec3(0.003, 0.004, 0.006), clamp(y * 1.4, 0.0, 1.0));
  c += vec3(0.05, 0.04, 0.03) * pow(clamp(dot(rd, LDIR), 0.0, 1.0), 6.0) * 0.25;
  return c;
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

vec3 heat(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 c0 = vec3(0.06, 0.04, 0.24), c1 = vec3(0.12, 0.42, 0.86), c2 = vec3(0.20, 0.78, 0.55), c3 = vec3(0.98, 0.80, 0.20), c4 = vec3(0.86, 0.16, 0.10);
  if (x < 0.25) return mix(c0, c1, x * 4.0);
  if (x < 0.5) return mix(c1, c2, x * 4.0 - 1.0);
  if (x < 0.75) return mix(c2, c3, x * 4.0 - 2.0);
  return mix(c3, c4, x * 4.0 - 3.0);
}

vec3 fieldColor(float d, float w) {
  vec3 col = d > 0.0 ? vec3(0.96, 0.62, 0.30) : vec3(0.40, 0.68, 0.98);
  col *= 1.0 - 0.72 * exp(-4.0 * abs(d));
  float band = abs(fract(d * 10.0 + 0.5) - 0.5) / max(w * 10.0, 1e-4);
  col *= mix(0.7, 1.0, smoothstep(0.0, 1.5, band));
  col = mix(col, vec3(1.0), 1.0 - smoothstep(0.004, 0.012 + 1.5 * w, abs(d)));
  return col;
}

float traceOne(int i, vec3 ro, vec3 rd, float tEnd) {
  vec3 oc = ro - uA[i].xyz; float r = uC[i].w;
  float b = dot(oc, rd), c = dot(oc, oc) - r * r, disc = b * b - c;
  if (disc < 0.0) return -1.0;
  float sq = sqrt(disc), t = max(-b - sq, 0.0), t1 = min(-b + sq, tEnd);
  for (int s = ZERO; s < 40; s++) {
    if (t > t1) return -1.0;
    float f = sdPrim(i, ro + rd * t);
    if (f < 0.002) return t;
    t += f;
  }
  return -1.0;
}

void main() {
  vec2 frag = gl_FragCoord.xy + uJitter;
  vec2 uv = (2.0 * frag - uRes) / uRes.y;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamF + uTanHalf * (uv.x * uCamR + uv.y * uCamU));
  float pixR = uTanHalf / uRes.y;
  gClip = uView == 2 ? uSliceH : 1e5;
  int steps, status;
  float t = trace(ro, rd, pixR, steps, status);
  bool hit = status == 1;
  float tS = hit ? t : 1e5;
  vec3 p = ro + rd * t;
  vec3 col;
  if (uView == 1) {
    if (status == -1) col = vec3(1.0);
    else {
      col = heat(float(steps) / float(min(uMaxSteps, HEAT_MAX)));
      if (hit) { vec3 n = calcNormal(p, max(0.0007, pixR * t)); col *= 0.72 + 0.28 * clamp(dot(n, LDIR), 0.0, 1.0); }
    }
  } else {
    if (hit) {
      vec3 n = calcNormal(p, max(0.0007, pixR * t));
      float dObj = mapObj(p);
      bool floorHit = p.y < dObj;
      bool cap = uView == 2 && dObj < 0.0 && p.y - uSliceH > min(dObj, p.y) - 1e-4;
      vec3 alb; float spec;
      if (floorHit) {
        float w = pixR * t * 2.0 / max(abs(rd.y), 0.04);
        vec2 g = abs(fract(p.xz * 2.0 + 0.5) - 0.5) / max(w * 2.0, 1e-4);
        float line = 1.0 - smoothstep(0.0, 1.0, min(g.x, g.y));
        vec2 g2 = abs(p.xz) / max(w, 1e-4);
        float axis = 1.0 - smoothstep(0.0, 1.5, min(g2.x, g2.y));
        alb = vec3(0.075, 0.08, 0.09) * (1.0 + 0.45 * line * exp(-0.005 * t * t)) + vec3(0.03) * axis;
        spec = 0.15;
      } else { alb = objColor(p); spec = 1.0; }
      float sh = shadow(p + n * 0.002, LDIR);
      float ao = uAO == 1 ? calcAO(p, n) : 1.0;
      float dif = clamp(dot(n, LDIR), 0.0, 1.0) * sh;
      vec3 hv = normalize(LDIR - rd);
      float nh = clamp(dot(n, hv), 0.0, 1.0);
      float fre = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 5.0);
      float sp = (pow(nh, 60.0) * 2.0 + pow(nh, 12.0) * 0.25) * dif * spec * (0.04 + 0.96 * fre + 0.25);
      float skyD = (0.6 + 0.4 * n.y) * ao;
      float bounce = clamp(0.4 - 0.6 * n.y, 0.0, 1.0) * ao;
      float back = clamp(dot(n, normalize(vec3(-LDIR.x, 0.0, -LDIR.z))), 0.0, 1.0) * ao;
      col = alb * (dif * vec3(1.75, 1.58, 1.36) + skyD * vec3(0.20, 0.25, 0.34) + bounce * vec3(0.10, 0.08, 0.06) + back * vec3(0.10, 0.11, 0.14));
      col += sp * vec3(1.8, 1.7, 1.5);
      col += fre * ao * spec * vec3(0.10, 0.13, 0.18);
      if (uSel >= 0 && !floorHit) {
        float ds = abs(sdPrim(uSel, p));
        col = mix(col, col * vec3(0.9, 1.05, 1.25) + vec3(0.02, 0.05, 0.10), 1.0 - smoothstep(0.0, 0.05, ds));
      }
      if (uSel >= 0 && floorHit) {
        float rr = length(p.xz - uA[uSel].xz);
        float w = pixR * t * 2.0 / max(abs(rd.y), 0.04);
        float ring = 1.0 - smoothstep(0.0, 1.5 * w + 0.008, abs(rr - uC[uSel].w));
        col += vec3(0.08, 0.16, 0.30) * ring;
      }
      col = mix(col, background(rd), max(1.0 - exp(-0.0012 * t * t), floorHit ? smoothstep(9.0, 26.0, t) : 0.0));
      col = pow(aces(col), vec3(1.0 / 2.2));
      if (cap) {
        float w = pixR * t * 2.0 / max(abs(rd.y), 0.04);
        col = fieldColor(mapObj(vec3(p.x, uSliceH, p.z)), w) * (0.7 + 0.3 * sh);
      }
    } else {
      col = pow(aces(background(rd) * 1.1), vec3(1.0 / 2.2));
    }
    if (uView == 2) {
      float tp = (uSliceH - ro.y) / rd.y;
      vec3 pp = ro + rd * tp;
      if (tp > 0.0 && tp < tS - 0.003 && abs(pp.x) < SLICE_R && abs(pp.z) < SLICE_R) {
        float w = pixR * tp * 2.0 / max(abs(rd.y), 0.04);
        vec3 fc = fieldColor(mapObj(pp), w);
        float edge = 1.0 - smoothstep(0.0, 1.5 * w + 0.004, SLICE_R - max(abs(pp.x), abs(pp.z)));
        col = mix(col, fc, 0.72);
        col = mix(col, vec3(0.9), edge);
      }
    }
  }
  for (int i = 0; i < MAXP; i++) {
    if (i >= uN) break;
    if (uA[i].w < 7.5 && i != uSel) continue;
    float tg = traceOne(i, ro, rd, min(tS, TMAX) - 0.004);
    if (tg > 0.0) {
      vec3 pg = ro + rd * tg;
      const vec2 s = vec2(1.0, -1.0); float e = 0.002;
      vec3 ng = normalize(s.xyy * sdPrim(i, pg + s.xyy * e) + s.yyx * sdPrim(i, pg + s.yyx * e) + s.yxy * sdPrim(i, pg + s.yxy * e) + s.xxx * sdPrim(i, pg + s.xxx * e));
      float rim = pow(1.0 - abs(dot(ng, rd)), 2.0);
      float a = (i == uSel ? 0.16 + 0.5 * rim : 0.05 + 0.22 * rim);
      vec3 gc = i == uSel ? vec3(0.55, 0.80, 1.0) : mix(vec3(0.85), pow(uC[i].rgb, vec3(1.0 / 2.2)), 0.5);
      col = mix(col, gc, a);
    }
  }
  if (uProbeN > 0) {
    vec3 pd = uProbeE - uProbeO; float pl = length(pd); pd /= max(pl, 1e-5);
    vec3 w0 = ro - uProbeO;
    float b = dot(rd, pd), dd = dot(rd, w0), ee = dot(pd, w0), den = 1.0 - b * b;
    if (den > 1e-6) {
      float sc = (b * ee - dd) / den, tc = clamp((ee - b * dd) / den, 0.0, pl);
      sc = dot(uProbeO + pd * tc - ro, rd);
      if (sc > 0.0 && sc < tS + 0.01) {
        float dist = length(ro + rd * sc - (uProbeO + pd * tc));
        float wl = 0.006 + pixR * sc * 1.5;
        col = mix(col, vec3(1.0, 0.92, 0.55), (1.0 - smoothstep(wl * 0.5, wl * 1.5, dist)) * 0.9);
      }
    }
    for (int i = 0; i < uProbeN; i++) {
      vec4 s = uProbe[i];
      vec3 oc = ro - s.xyz;
      float bb = dot(oc, rd);
      float fi = float(i) / max(float(uProbeN - 1), 1.0);
      vec3 sc = mix(vec3(0.35, 0.85, 1.0), vec3(0.75, 0.45, 1.0), fi);
      float c2 = dot(oc, oc) - s.w * s.w, disc = bb * bb - c2;
      if (s.w > 0.003 && disc > 0.0) {
        float t0 = -bb - sqrt(disc);
        if (t0 > 0.0 && t0 < tS) {
          vec3 n = normalize(oc + rd * t0);
          float rim = pow(1.0 - abs(dot(n, rd)), 3.0);
          col = mix(col, sc, 0.05 + 0.45 * rim);
        }
      }
      float rdot = 0.022 + pixR * max(-bb, 0.0) * 2.0;
      float c3 = dot(oc, oc) - rdot * rdot, disc3 = bb * bb - c3;
      if (disc3 > 0.0 && -bb < tS + 0.02) col = mix(col, (i == uProbeN - 1 && uProbeHit == 1) ? vec3(1.0, 0.35, 0.55) : vec3(1.0, 0.92, 0.55), 0.95);
    }
  }
  outColor = vec4(col, 1.0);
}
