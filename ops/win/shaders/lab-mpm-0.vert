#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uT0, uT1, uT3;
uniform vec2 uGrid;
uniform float uInvDx;
flat out vec4 vVF;
flat out vec4 vAff;
flat out vec2 vBase;
void main() {
  ivec2 tc = ivec2(gl_VertexID % 256, gl_VertexID / 256);
  if (texelFetch(uT3, tc, 0).x < 0.0) { gl_Position = vec4(-2.0, -2.0, 0.0, 1.0); gl_PointSize = 1.0; return; }
  vec4 a = texelFetch(uT0, tc, 0);
  vec2 xg = a.xy * uInvDx;
  vec2 base = floor(xg - 0.5);
  vVF = vec4(a.zw, xg - base);
  vAff = texelFetch(uT1, tc, 0);
  vBase = base;
  gl_Position = vec4((base + 1.5) / uGrid * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 3.0;
}