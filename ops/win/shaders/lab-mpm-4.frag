#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec4 vA;
in vec4 vB;
out vec4 o;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 >= 1.0) discard;
  float a = vA.a * smoothstep(1.0, 0.55, r2);
  o = vec4(vA.rgb * a, a);
}