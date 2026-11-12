#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform float uNorm;
in vec4 vA;
in vec4 vB;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 >= 1.0) discard;
  float k = (1.0 - r2) * (1.0 - r2) * uNorm;
  o0 = vA * k;
  o1 = vB * k;
}