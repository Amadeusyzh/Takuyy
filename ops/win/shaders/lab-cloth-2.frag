precision highp float;
varying vec3 vPos; uniform vec3 uBg; uniform vec3 uAccent;
void main() {
  vec2 g = abs(fract(vPos.xz * 2.0) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.02, min(g.x, g.y) - 0.0);
  float r = length(vPos.xz);
  float spot = exp(-r * r * 0.35);
  vec3 col = vec3(0.11, 0.12, 0.14) * (0.35 + 0.9 * spot) + line * 0.06 * spot;
  col = mix(col, uBg, smoothstep(2.5, 7.0, r));
  gl_FragColor = vec4(col, 1.0);
}