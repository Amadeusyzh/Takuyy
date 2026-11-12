#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uDen0, uDen1, uVel;
uniform int uView;
uniform vec2 uOrigin, uSpan, uGrid;
uniform float uDx;
uniform vec2 uTexel;
uniform float uCellPx;
uniform float uLod;
uniform vec4 uCol[4];
uniform vec4 uColR;
uniform int uNumCol;
uniform vec4 uPtr;
uniform vec3 uMatCol;
in vec2 vUv;
out vec4 o;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
float capsule(vec2 p, vec4 s, float r) {
  vec2 ab = s.zw - s.xy;
  float h = clamp(dot(p - s.xy, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
  return length(p - (s.xy + h * ab)) - r;
}
vec3 background(vec2 uv, vec2 p) {
  vec3 c = mix(vec3(0.085, 0.1, 0.135), vec3(0.035, 0.045, 0.07), uv.y);
  vec2 g = p / uDx;
  vec2 f = abs(fract(g + 0.5) - 0.5) * uCellPx;
  float line = 1.0 - smoothstep(0.0, 1.0, min(f.x, f.y));
  vec2 f8 = abs(fract(g / 8.0 + 0.5) - 0.5) * uCellPx * 8.0;
  float line8 = 1.0 - smoothstep(0.0, 1.2, min(f8.x, f8.y));
  float gl = uView == 3 ? 0.07 : 0.022;
  c += vec3(0.55, 0.7, 1.0) * (line * gl + line8 * 0.035);
  vec2 vg = uv - 0.5;
  c *= 1.0 - 0.35 * dot(vg, vg);
  return c;
}
float total(vec2 uv, float lod) { vec4 d = textureLod(uDen0, uv, lod); return d.r + d.g + d.b; }
void main() {
  vec2 uv = vUv;
  vec2 p = uOrigin + uv * uSpan;
  vec3 col;
  if (uView == 0) {
    vec4 d0 = textureLod(uDen0, uv, 0.7);
    vec4 d1 = textureLod(uDen1, uv, 0.7);
    vec4 b0 = textureLod(uDen0, uv, uLod + 1.5);
    vec4 b1 = textureLod(uDen1, uv, uLod + 1.5);
    float tot = d0.r + d0.g + d0.b, totB = b0.r + b0.g + b0.b;
    float cov = max(smoothstep(0.17, 0.36, tot), smoothstep(0.5, 0.78, totB));
    float inner = smoothstep(0.6, 0.95, totB);
    float keep = smoothstep(0.04, 0.2, tot);
    d0 = mix(b0, d0, keep); d1 = mix(b1, d1, keep);
    tot = max(d0.r + d0.g + d0.b, 1e-5);
    vec2 e = uTexel * exp2(uLod) * 1.5;
    vec2 grad = vec2(total(uv + vec2(e.x, 0.0), uLod) - total(uv - vec2(e.x, 0.0), uLod), total(uv + vec2(0.0, e.y), uLod) - total(uv - vec2(0.0, e.y), uLod));
    vec3 n = normalize(vec3(-grad * 1.1 * (1.0 - 0.7 * inner), 1.0));
    vec3 Ld = normalize(vec3(-0.45, 0.65, 0.62));
    float diff = max(dot(n, Ld), 0.0);
    float spec = pow(max(dot(reflect(-Ld, n), vec3(0.0, 0.0, 1.0)), 0.0), 36.0);
    float rim = (1.0 - n.z) * cov;
    float sw = max(tot, 1e-5);
    float fw = d0.r / sw, fj = d0.g / sw, fs = d0.b / sw;
    vec2 ruv = clamp(uv - n.xy * 0.02, 0.0, 1.0);
    vec3 refr = background(ruv, uOrigin + ruv * uSpan);
    float deep = smoothstep(0.45, 0.95, textureLod(uDen0, uv, 3.5).r);
    vec3 cw = mix(refr * 0.6 + vec3(0.05, 0.32, 0.62), vec3(0.02, 0.13, 0.36), deep * 0.75);
    float speed = d0.a / sw;
    float foam = smoothstep(2.5, 6.0, speed) * (1.0 - inner) * (0.55 + 0.45 * hash(floor(gl_FragCoord.xy * 0.5)));
    cw = mix(cw, vec3(0.82, 0.92, 1.0), foam * 0.75) + vec3(0.35, 0.65, 1.0) * rim * 0.6;
    vec3 jc = d1.rgb / max(d0.g, 1e-5);
    vec3 cj = jc * (0.38 + 0.62 * diff) + jc * rim * 0.9 + refr * 0.12;
    float pack = clamp(d1.a / max(d0.b, 1e-5), 0.0, 1.0);
    vec3 cs = mix(vec3(0.93, 0.96, 1.0), vec3(0.62, 0.78, 0.95), pack) * (0.55 + 0.45 * diff);
    cs *= 0.92 + 0.08 * hash(floor(p / uDx * 4.0));
    cs += step(0.985, hash(floor(gl_FragCoord.xy))) * spec * 2.0;
    vec3 cm = fw * cw + fj * cj + fs * cs;
    cm += spec * (fw * 0.9 + fj * 0.7 + fs * 0.25);
    float alpha = cov * (fw * 0.9 + fj * 0.95 + fs);
    col = mix(background(uv, p), cm, alpha);
  } else {
    col = background(uv, p);
    if (uView == 3) {
      ivec2 node = ivec2(floor(p / uDx + 0.5));
      vec4 g = texelFetch(uVel, clamp(node, ivec2(0), ivec2(uGrid) - 1), 0);
      vec2 lp = abs(p / uDx - vec2(node)) * uCellPx;
      float cell = 1.0 - smoothstep(0.5 * uCellPx - 1.5, 0.5 * uCellPx - 0.5, max(lp.x, lp.y));
      float sp = length(g.xy);
      vec3 hc = hsv(atan(g.y, g.x) / 6.2831853 + 0.5, 0.75, 0.25 + 0.75 * clamp(sp / 2.0, 0.0, 1.0));
      col = mix(col, hc, cell * clamp(g.z / 2.5, 0.0, 0.85));
    }
  }
  for (int c = 0; c < 4; c++) {
    if (c >= uNumCol) break;
    float sd = capsule(p, uCol[c], uColR[c]) * uCellPx / uDx;
    if (sd < 1.0) {
      vec3 cc = vec3(0.2, 0.23, 0.29) + vec3(0.18, 0.2, 0.24) * smoothstep(-6.0, 0.0, sd);
      col = mix(col, cc, clamp(1.0 - sd, 0.0, 1.0));
    }
  }
  if (uPtr.w > 0.5) {
    float rp = abs(length(p - uPtr.xy) - uPtr.z) * uCellPx / uDx;
    vec3 pc = uPtr.w < 1.5 ? vec3(1.0, 0.8, 0.4) : (uPtr.w < 2.5 ? vec3(0.5, 0.85, 1.0) : uMatCol);
    col = mix(col, pc, (1.0 - smoothstep(0.6, 1.8, rp)) * 0.7);
  }
  o = vec4(col, 1.0);
}