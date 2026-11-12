#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
const float TAU = 6.28318530718;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
in vec2 aProbe;
in vec4 aRay;
in float aLevel;
uniform sampler2D uDist;
uniform vec2 uS;
out vec4 vCol;
vec3 levelCol(float l) {
  vec3 c[7] = vec3[7](vec3(1.0, 0.3, 0.3), vec3(1.0, 0.62, 0.2), vec3(0.98, 0.92, 0.3), vec3(0.4, 0.95, 0.45), vec3(0.3, 0.85, 1.0), vec3(0.5, 0.55, 1.0), vec3(0.95, 0.45, 1.0));
  return c[int(l)];
}
void main() {
  vec2 dir = vec2(cos(aRay.x), sin(aRay.x));
  vec2 p = aProbe + dir * (aRay.w > 1.5 ? aRay.z : aRay.y);
  float a = 0.8;
  if (aRay.w > 0.5 && aRay.w < 1.5) {
    vec2 from = aProbe + dir * aRay.y;
    float len = aRay.z - aRay.y, t = 0.0;
    for (int k = 0; k < 96; k++) {
      vec2 q = from + dir * t;
      if (q.x < 0.0 || q.y < 0.0 || q.x >= uS.x || q.y >= uS.y) break;
      float sd = texelFetch(uDist, ivec2(q), 0).r;
      if (sd < 0.5) break;
      t += max(sd - 1.0, 0.8);
      if (t >= len) { t = len; break; }
    }
    p = from + dir * min(t, len);
    a = 0.35;
  }
  vCol = vec4(levelCol(aLevel), a);
  gl_Position = vec4(p / uS * 2.0 - 1.0, 0.0, 1.0);
}