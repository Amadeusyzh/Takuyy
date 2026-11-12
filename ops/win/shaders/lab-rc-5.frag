#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
const float TAU = 6.28318530718;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
uniform sampler2D uC0;
uniform sampler2D uDist;
uniform ivec2 uP0;
uniform float uSp0;
out vec4 o;
void main() {
  vec2 g = gl_FragCoord.xy / uSp0 - 0.5;
  vec2 fl = floor(g);
  vec2 f = g - fl;
  ivec2 b = ivec2(fl);
  vec3 acc = vec3(0.0), accAll = vec3(0.0);
  float ws = 0.0;
  bool self = texelFetch(uDist, ivec2(gl_FragCoord.xy), 0).r < 0.5;
  for (int j = 0; j < 4; j++) {
    ivec2 off = ivec2(j & 1, j >> 1);
    ivec2 q = clamp(b + off, ivec2(0), uP0 - 1);
    float w = (off.x == 1 ? f.x : 1.0 - f.x) * (off.y == 1 ? f.y : 1.0 - f.y);
    vec3 s = texelFetch(uC0, q, 0).rgb + texelFetch(uC0, q + ivec2(uP0.x, 0), 0).rgb
           + texelFetch(uC0, q + ivec2(0, uP0.y), 0).rgb + texelFetch(uC0, q + uP0, 0).rgb;
    float inside = texelFetch(uDist, ivec2((vec2(q) + 0.5) * uSp0), 0).r < 0.5 ? 1.0 : 0.0;
    if (self || inside < 0.5) { acc += w * 0.25 * s; ws += w; }
    accAll += w * 0.25 * s;
  }
  o = vec4(ws > 0.0 ? acc / ws : accAll, 1.0);
}