#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uAcc;
uniform vec2 uGrid;
uniform float uDx, uDt, uGravity, uVmax;
uniform vec4 uPtr;
uniform vec4 uPtrV;
uniform vec4 uCol[4];
uniform vec4 uColR;
uniform int uNumCol;
out vec4 o;
float capsule(vec2 p, vec4 s, float r, out vec2 n) {
  vec2 ab = s.zw - s.xy;
  float h = clamp(dot(p - s.xy, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
  vec2 q = p - (s.xy + h * ab);
  float l = length(q);
  n = l > 1e-9 ? q / l : vec2(0.0, 1.0);
  return l - r;
}
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uAcc, ij, 0);
  float m = a.z;
  vec2 v = vec2(0.0);
  if (m > 1e-7) {
    v = a.xy / m;
    v.y -= uDt * uGravity;
    vec2 p = vec2(ij) * uDx;
    if (uPtr.w > 0.5) {
      vec2 dp = p - uPtr.xy;
      float dist = length(dp);
      if (dist < uPtr.z) {
        float k = 1.0 - dist / uPtr.z; k *= k;
        vec2 dir = dist > 1e-6 ? dp / dist : vec2(0.0, 1.0);
        if (uPtr.w < 1.5) {
          v += (uPtrV.xy - v) * min(1.0, uDt * 60.0 * k);
          v += dir * (uDt * 140.0 * k + uPtrV.z * k);
        } else {
          v += -dir * (uDt * 320.0 * k) * min(1.0, dist / (0.25 * uPtr.z));
          v += (uPtrV.xy - v) * min(1.0, uDt * 30.0 * k);
        }
      }
    }
    for (int c = 0; c < 4; c++) {
      if (c >= uNumCol) break;
      vec2 n;
      float sd = capsule(p, uCol[c], uColR[c], n);
      if (sd < 0.5 * uDx) {
        float vn = dot(v, n);
        if (vn < 0.0) {
          vec2 vt = v - vn * n;
          float lt = length(vt);
          v = lt > 1e-9 ? vt * max(0.0, 1.0 - 0.3 * (-vn) / lt) : vec2(0.0);
        }
      }
    }
    if (ij.x < 3 && v.x < 0.0) v.x = 0.0;
    if (ij.x > int(uGrid.x) - 4 && v.x > 0.0) v.x = 0.0;
    if (ij.y < 3 && v.y < 0.0) v.y = 0.0;
    if (ij.y > int(uGrid.y) - 4 && v.y > 0.0) v.y = 0.0;
    float s = length(v);
    if (s > uVmax) v *= uVmax / s;
  }
  o = vec4(v, m, 0.0);
}