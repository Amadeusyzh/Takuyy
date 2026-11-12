#version 300 es
in vec2 aCorner;
in vec4 aSeg;
in float aRad;
in vec4 aCol;
uniform vec2 uRes;
uniform float uMinR;
flat out vec4 vSeg;
flat out float vR;
flat out vec4 vCol;
void main() {
  vec2 p0 = aSeg.xy * uRes, p1 = aSeg.zw * uRes;
  float r = max(aRad * uRes.y, uMinR);
  vec2 lo = min(p0, p1) - r - 2.0, hi = max(p0, p1) + r + 2.0;
  vec2 p = mix(lo, hi, aCorner);
  vSeg = vec4(p0, p1); vR = r; vCol = aCol;
  gl_Position = vec4(p / uRes * 2.0 - 1.0, 0.0, 1.0);
}