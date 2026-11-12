#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
const float TAU = 6.28318530718;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
uniform sampler2D uDist;
uniform sampler2D uEmit;
uniform sampler2D uUpper;
uniform vec2 uS;
uniform ivec2 uP;
uniform int uD;
uniform ivec2 uUP;
uniform float uSp;
uniform float uA;
uniform float uB;
uniform int uHasUpper;
uniform int uFix;
uniform float uBounce;
out vec4 o;
vec4 march(vec2 from, vec2 to) {
  vec2 d = to - from;
  float len = length(d);
  vec2 dir = d / max(len, 1e-6);
  float t = 0.0;
  for (int k = 0; k < 64; k++) {
    vec2 p = from + dir * t;
    if (p.x < 0.0 || p.y < 0.0 || p.x >= uS.x || p.y >= uS.y) break;
    ivec2 ip = ivec2(p);
    float sd = texelFetch(uDist, ip, 0).r;
    if (sd < 0.5) {
      vec4 e = texelFetch(uEmit, ip, 0);
      return vec4(e.rgb * (e.a > 0.75 ? 1.0 : uBounce), 0.0);
    }
    t += max(sd - 1.0, 0.8);
    if (t >= len) break;
  }
  return vec4(0.0, 0.0, 0.0, 1.0);
}
vec3 upperAvg(ivec2 q, int k) {
  int du = uD * 2;
  vec3 s = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    int c = 4 * k + j;
    s += texelFetch(uUpper, ivec2(c % du, c / du) * uUP + q, 0).rgb;
  }
  return s * 0.25;
}
void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  ivec2 tile = tc / uP;
  ivec2 pr = tc - tile * uP;
  int k = tile.y * uD + tile.x;
  float ang = (float(k) + 0.5) * TAU / float(uD * uD);
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 pos = (vec2(pr) + 0.5) * uSp;
  if (uHasUpper == 0) {
    o = vec4(march(pos + dir * uA, pos + dir * uB).rgb, 1.0);
    return;
  }
  vec2 g = pos / (2.0 * uSp) - 0.5;
  vec2 fl = floor(g);
  vec2 f = g - fl;
  ivec2 b = ivec2(fl);
  vec4 r0 = uFix == 0 ? march(pos + dir * uA, pos + dir * uB) : vec4(0.0);
  vec3 acc = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    ivec2 off = ivec2(j & 1, j >> 1);
    ivec2 q = clamp(b + off, ivec2(0), uUP - 1);
    float w = (off.x == 1 ? f.x : 1.0 - f.x) * (off.y == 1 ? f.y : 1.0 - f.y);
    vec4 r = r0;
    if (uFix == 1) {
      vec2 qpos = (vec2(q) + 0.5) * (2.0 * uSp);
      r = march(pos + dir * uA, qpos + dir * uB);
    }
    vec3 up = r.a > 0.0 ? upperAvg(q, k) : vec3(0.0);
    acc += w * (r.rgb + r.a * up);
  }
  o = vec4(acc, 1.0);
}