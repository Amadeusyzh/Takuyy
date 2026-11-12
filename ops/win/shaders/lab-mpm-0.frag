#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
float bspline(float r) {
  r = abs(r);
  return r < 0.5 ? 0.75 - r * r : 0.5 * (1.5 - r) * (1.5 - r);
}
uniform float uDx;
flat in vec4 vVF;
flat in vec4 vAff;
flat in vec2 vBase;
out vec4 o;
void main() {
  vec2 off = floor(gl_FragCoord.xy) - vBase;
  vec2 d = off - vVF.zw;
  float w = bspline(d.x) * bspline(d.y);
  mat2 A = mat2(vAff.xy, vAff.zw);
  o = vec4(w * (vVF.xy + A * (d * uDx)), w, 0.0);
}