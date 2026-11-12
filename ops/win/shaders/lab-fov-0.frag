precision highp float;
uniform vec2 uRes; uniform float uAspect; uniform float uTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float ribInner(vec3 q) { return sdBox(q - vec3(0.0, 1.3, 0.0), vec3(1.55, 1.3, 0.4)) - 0.25; }
vec2 map(vec3 p) {
  vec2 r = vec2(p.y, 1.0);
  float c = 3.0 - p.y; if (c < r.x) r = vec2(c, 2.0);
  float w = 2.0 - abs(p.x); if (w < r.x) r = vec2(w, 3.0);
  vec3 q = p; q.z = mod(q.z, 3.0) - 1.5;
  float rib = max(sdBox(q - vec3(0.0, 1.5, 0.0), vec3(2.3, 1.7, 0.14)), -ribInner(q));
  if (rib < r.x) r = vec2(rib, 4.0);
  return r;
}
vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x));
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 s = (uv * 2.0 - 1.0) * vec2(uAspect, 1.0);
  float t = uTime;
  vec3 ro = vec3(0.45 * sin(t * 0.31), 1.35 + 0.04 * sin(t * 1.9), t * 1.4);
  float yaw = 0.18 * sin(t * 0.23);
  vec3 rd = normalize(vec3(s, 1.5));
  rd.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * rd.xz;
  float d = 0.0; vec2 h = vec2(1.0); float steps = 0.0;
  for (int i = 0; i < 110; i++) {
    h = map(ro + rd * d);
    if (h.x < 0.0006 * d || d > 60.0) break;
    d += h.x; steps += 1.0;
  }
  vec3 p = ro + rd * d;
  vec3 n = normalAt(p);
  vec3 col = vec3(0.0); vec3 emit = vec3(0.0);
  float pulse = 0.5 + 0.5 * sin(p.z * 1.3 - t * 7.0);
  if (h.y < 1.5) {
    vec2 g = abs(fract(p.xz * 2.0) - 0.5);
    float seam = 1.0 - smoothstep(0.46, 0.49, max(g.x, g.y));
    col = vec3(0.06, 0.065, 0.08) * (0.6 + 0.4 * seam) + 0.02 * hash(floor(p.xz * 2.0));
    float strip = smoothstep(1.86, 1.9, abs(p.x)) * (1.0 - smoothstep(1.94, 1.98, abs(p.x)));
    emit += strip * mix(vec3(0.1, 0.8, 1.0), vec3(1.0, 0.2, 0.7), step(0.0, p.x)) * (0.6 + 1.6 * pulse);
  } else if (h.y < 2.5) {
    vec2 g = abs(fract(p.xz * 4.0) - 0.5);
    col = vec3(0.05) + 0.03 * step(0.46, max(g.x, g.y));
    emit += vec3(1.0, 0.95, 0.85) * 1.2 * (1.0 - smoothstep(0.1, 0.13, abs(p.x)));
  } else if (h.y < 3.5) {
    vec2 cell = floor(vec2(p.z * 6.0, p.y * 6.0));
    vec2 f = fract(vec2(p.z * 6.0, p.y * 6.0));
    float seam = step(0.92, max(f.x, f.y));
    col = vec3(0.05, 0.055, 0.07) - 0.03 * seam;
    float r = hash(cell + step(0.0, p.x) * 17.0);
    float led = step(0.86, r) * (1.0 - smoothstep(0.12, 0.2, length(f - 0.5)));
    float blink = step(0.3, fract(r * 13.0 + t * (0.5 + r)));
    emit += led * blink * mix(vec3(0.2, 1.0, 0.6), vec3(1.0, 0.5, 0.1), step(0.95, r)) * 2.0;
    vec2 big = abs(fract(vec2(p.z * 0.5, p.y * 0.5)) - 0.5);
    col *= 0.8 + 0.2 * step(0.47, max(big.x, big.y));
  } else {
    vec3 q = p; q.z = mod(q.z, 3.0) - 1.5;
    col = vec3(0.1, 0.105, 0.12) * (0.85 + 0.15 * sin(p.y * 220.0));
    float edge = 1.0 - smoothstep(0.0, 0.018, abs(ribInner(q)));
    emit += edge * vec3(0.3, 0.7, 1.0) * (0.6 + 1.4 * pulse);
  }
  vec3 lp = vec3(0.0, 2.9, floor(p.z / 3.0) * 3.0 + 1.5);
  vec3 L = lp - p; float ld = dot(L, L); L *= inversesqrt(ld);
  float dif = max(dot(n, L), 0.0) * 3.0 / (1.0 + ld);
  float spec = pow(max(dot(reflect(rd, n), L), 0.0), 40.0) * 2.0 / (1.0 + ld);
  float ao = 1.0 - steps / 110.0;
  col = col * (0.12 * ao + dif) + spec * 0.3 + emit;
  col = mix(vec3(0.01, 0.015, 0.03), col, exp(-0.045 * d));
  col = col / (1.0 + col);
  gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}