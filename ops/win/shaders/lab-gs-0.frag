#version 300 es
precision highp float;
precision highp int;
in vec4 vColor;
in vec2 vPos;
uniform int uMode;
out vec4 o;
void main() {
  float r2 = dot(vPos, vPos);
  if (uMode == 1) { if (r2 > 1.0) discard; o = vec4(vColor.rgb * (0.35 + 0.65 * sqrt(1.0 - r2)), 1.0); return; }
  if (uMode == 2) { o = vec4(vColor.rgb, 1.0); return; }
  if (uMode == 4) { float a = exp(-0.5 * r2); if (a < 1.0 / 255.0) discard; o = vec4(vec3(0.010, 0.004, 0.0012) * a, 0.0); return; }
  float a = min(vColor.a * exp(-0.5 * r2), 0.995);
  if (a < 1.0 / 255.0) discard;
  o = vec4(vColor.rgb * a, a);
}