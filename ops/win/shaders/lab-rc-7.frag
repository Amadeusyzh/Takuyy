#version 300 es
precision highp float;
flat in vec4 vSeg;
flat in float vR;
flat in vec4 vCol;
out vec4 o;
void main() {
  vec2 p = gl_FragCoord.xy, a = vSeg.xy, b = vSeg.zw;
  vec2 ba = b - a;
  float h = clamp(dot(p - a, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  if (length(p - a - ba * h) > vR) discard;
  o = vCol;
}