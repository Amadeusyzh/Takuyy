#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uFwd, uRight, uUp, uSunDir, uZenith, uHorizon, uSunCol;
uniform float uTanHalf, uAspect, uNight;
out vec4 o;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(uFwd + vUv.x * uTanHalf * uAspect * uRight + vUv.y * uTanHalf * uUp);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(h, 0.55)) : mix(uHorizon, uHorizon * 0.55, min(-h * 4.0, 1.0));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 40.0) * 0.35 + pow(sd, 6.0) * 0.12);
  if (uNight > 0.0 && h > 0.0) {
    vec3 q = floor(d * 420.0);
    float st = step(0.9985, hash(q));
    col += vec3(st) * uNight * (0.5 + 0.5 * hash(q + 3.0));
    float md = max(dot(d, -uSunDir), 0.0);
    col += vec3(0.8, 0.85, 1.0) * pow(md, 2000.0) * 4.0 * uNight;
  }
  o = vec4(col, 1.0);
}