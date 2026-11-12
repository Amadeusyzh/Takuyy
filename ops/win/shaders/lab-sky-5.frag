#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
#define PI 3.14159265359
out vec4 outColor;
uniform vec2 uRes;
uniform vec3 uCamPos;
uniform vec3 uCamF, uCamRt, uCamUp;
uniform float uTanH, uAspect;
vec3 rayDir(vec2 uv) {
  vec2 n = uv * 2.0 - 1.0;
  return normalize(uCamF + uCamRt * (n.x * uTanH * uAspect) + uCamUp * (n.y * uTanH));
}
uniform sampler2D uCur, uHist;
uniform vec2 uLowRes, uJitter;
uniform vec3 uPF, uPR, uPU;
uniform float uBlend;
uniform int uValid, uFast;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 xl = uv * uLowRes - 0.5 - uJitter;
  ivec2 mx = ivec2(uLowRes) - 1;
  ivec2 i = clamp(ivec2(floor(xl + 0.5)), ivec2(0), mx);
  vec2 d = xl - vec2(i);
  vec4 c = texelFetch(uCur, i, 0);
  vec4 lo = c, hi = c;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec4 s = texelFetch(uCur, clamp(i + ivec2(x, y), ivec2(0), mx), 0);
    lo = min(lo, s); hi = max(hi, s);
  }
  vec4 cb = texture(uCur, (xl + 0.5) / uLowRes);
  vec3 dir = rayDir(uv);
  vec3 pc = vec3(dot(dir, uPR), dot(dir, uPU), dot(dir, uPF));
  vec2 puv = 0.5 + 0.5 * vec2(pc.x / (pc.z * uTanH * uAspect), pc.y / (pc.z * uTanH));
  bool ok = uValid == 1 && pc.z > 0.0 && all(greaterThanEqual(puv, vec2(0.0))) && all(lessThanEqual(puv, vec2(1.0)));
  if (!ok) { outColor = cb; return; }
  vec4 h = clamp(texture(uHist, puv), lo, hi);
  if (uFast == 1) { outColor = mix(h, cb, 0.4); return; }
  outColor = mix(h, mix(cb, c, exp(-8.0 * dot(d, d))), uBlend);
}