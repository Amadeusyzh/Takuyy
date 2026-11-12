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
layout(location = 0) out ivec4 o;
void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 s = sceneUV((vec2(px) + 0.5) / uS);
  o = s.a > 0.25 ? ivec4(px, 0, 0) : ivec4(-1, -1, 0, 0);
}