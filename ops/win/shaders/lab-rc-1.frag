#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
const float TAU = 6.28318530718;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
uniform isampler2D uIn;
uniform int uStep;
uniform ivec2 uSize;
layout(location = 0) out ivec4 o;
void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  ivec2 best = ivec2(-1);
  float bd = 1e20;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 q = px + ivec2(i, j) * uStep;
    if (q.x < 0 || q.y < 0 || q.x >= uSize.x || q.y >= uSize.y) continue;
    ivec2 s = texelFetch(uIn, q, 0).xy;
    if (s.x < 0) continue;
    vec2 d = vec2(s - px);
    float dd = dot(d, d);
    if (dd < bd) { bd = dd; best = s; }
  }
  o = ivec4(best, 0, 0);
}