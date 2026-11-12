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
uniform vec2 uCanvas;
uniform vec2 uS;
uniform int uView;
uniform float uExposure;
uniform float uPower;
uniform sampler2D uGI;
uniform sampler2D uEmit;
uniform sampler2D uDist;
uniform sampler2D uCasc;
uniform ivec2 uCascSize;
uniform ivec2 uCascP;
uniform vec4 uCursor;
out vec4 o;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 tone(vec3 x) { return pow(aces(x * uExposure), vec3(1.0 / 2.2)); }
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec3 wallLight(vec2 uv) {
  vec2 g = uv * uS - 0.5;
  vec2 fl = floor(g);
  vec2 f = g - fl;
  vec3 acc = vec3(0.0);
  float ws = 0.0;
  for (int j = 0; j < 4; j++) {
    ivec2 off = ivec2(j & 1, j >> 1);
    ivec2 q = clamp(ivec2(fl) + off, ivec2(0), ivec2(uS) - 1);
    vec4 e = texelFetch(uEmit, q, 0);
    float w = (off.x == 1 ? f.x : 1.0 - f.x) * (off.y == 1 ? f.y : 1.0 - f.y);
    if (e.a > 0.25 && e.a < 0.75) { acc += w * e.rgb; ws += w; }
  }
  return ws > 0.0 ? acc / ws : vec3(0.0);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uCanvas;
  vec4 s = sceneUV(uv);
  vec3 col;
  if (uView == 3) {
    ivec2 t = ivec2(uv * vec2(uCascSize));
    col = tone(texelFetch(uCasc, t, 0).rgb);
    ivec2 m = t - (t / uCascP) * uCascP;
    vec2 e = fwidth(uv * vec2(uCascSize));
    if (float(m.x) < e.x || float(m.y) < e.y) col = mix(col, vec3(0.45, 0.55, 0.7), 0.7);
  } else if (uView == 1) {
    float d = texture(uDist, uv).r;
    if (s.a > 0.25) col = s.rgb * (s.a > 0.75 ? 1.0 : 0.75);
    else {
      vec3 base = mix(vec3(0.03, 0.05, 0.1), vec3(0.22, 0.45, 0.85), 1.0 - exp(-d / (0.2 * uS.y)));
      float k = d / 6.0;
      float fw = max(fwidth(k), 1e-3);
      float ln = 1.0 - smoothstep(0.0, 1.5 * fw, abs(fract(k + 0.5) - 0.5));
      float major = 1.0 - smoothstep(0.0, 1.5 * fw, abs(fract(k / 4.0 + 0.5) - 0.5) * 4.0);
      col = pow(base, vec3(1.0 / 2.2)) + vec3(0.16) * ln + vec3(0.25) * major;
    }
  } else {
    vec3 c;
    if (s.a > 0.75) c = lin(s.rgb) * uPower;
    else if (s.a > 0.25) c = lin(s.rgb) * 0.025 + wallLight(uv);
    else c = texture(uGI, uv).rgb;
    col = tone(c);
  }
  if (uCursor.w > 0.5) {
    float r = length(gl_FragCoord.xy - uCursor.xy);
    col = mix(col, vec3(1.0), 0.55 * (1.0 - smoothstep(0.0, 1.2, abs(r - uCursor.z))));
  }
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}