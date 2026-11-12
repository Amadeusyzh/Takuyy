#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
const float TAU = 6.28318530718;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
uniform sampler2D uScene;
uniform vec2 uHi;
uniform vec4 uOrb;
uniform vec3 uOrbCol;
uniform float uAspect;
vec4 sceneUV(vec2 uv) {
  if (uOrb.w > 0.5) {
    vec2 d = (uv - uOrb.xy) * vec2(uAspect, 1.0);
    if (dot(d, d) < uOrb.z * uOrb.z) return vec4(uOrbCol, 1.0);
  }
  return texelFetch(uScene, ivec2(clamp(uv, 0.0, 0.9999) * uHi), 0);
}
uniform vec2 uS;
uniform sampler2D uDist;
uniform sampler2D uGIPrev;
uniform sampler2D uEPrev;
uniform float uPower;
uniform float uBounce;
out vec4 o;
void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 s = sceneUV((vec2(px) + 0.5) / uS);
  if (s.a > 0.75) { o = vec4(lin(s.rgb) * uPower, 1.0); return; }
  if (s.a < 0.25) { o = vec4(0.0); return; }
  ivec2 sz = ivec2(uS);
  vec3 acc = vec3(0.0);
  float n = 0.0;
  for (int k = 0; k < 24; k++) {
    float a = float(k) * (TAU / 8.0) + float(k / 8) * (TAU / 24.0);
    float r = 2.5 + 2.75 * float(k / 8);
    ivec2 q = px + ivec2(floor(vec2(cos(a), sin(a)) * r + 0.5));
    if (q.x < 0 || q.y < 0 || q.x >= sz.x || q.y >= sz.y) continue;
    if (texelFetch(uDist, q, 0).r < 0.5) continue;
    acc += texelFetch(uGIPrev, q, 0).rgb;
    n += 1.0;
  }
  vec3 phi = n > 0.0 ? acc / n : vec3(0.0);
  vec3 lprev = texelFetch(uEPrev, px, 0).rgb;
  vec3 R = lin(s.rgb) * max(2.0 * phi - uBounce * lprev, 0.0);
  o = vec4(min(R, vec3(64.0)), 0.5);
}