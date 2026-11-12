precision highp float;
varying vec3 vPos; varying vec3 vNrm; varying vec2 vUv;
uniform vec3 uEye; uniform vec3 uLight; uniform vec3 uFront; uniform vec3 uBack; uniform float uShadow;
void main() {
  if (uShadow > 0.5) { float f = 1.0 - smoothstep(1.0, 3.5, length(vPos.xz)); gl_FragColor = vec4(0.0, 0.0, 0.0, 0.55 * f); return; }
  vec3 n = normalize(vNrm);
  vec3 v = normalize(uEye - vPos);
  if (dot(n, v) < 0.0) n = -n;
  vec3 base = gl_FrontFacing ? uFront : uBack;
  vec2 g = vUv * 6.0;
  vec2 f = abs(fract(g) - 0.5);
  float band = max(1.0 - smoothstep(0.08, 0.1, f.x), 1.0 - smoothstep(0.08, 0.1, f.y));
  vec2 f2 = abs(fract(g * 2.0 + 0.5) - 0.5);
  float pin = max(1.0 - smoothstep(0.015, 0.03, f2.x), 1.0 - smoothstep(0.015, 0.03, f2.y));
  float twill = 0.93 + 0.07 * sin((vUv.x + vUv.y) * 140.0);
  base = mix(base, base * 0.45, band * 0.7);
  base = mix(base, vec3(0.95, 0.85, 0.55), pin * 0.75);
  base *= twill;
  float ndl = dot(n, uLight);
  float wrap = max((ndl + 0.35) / 1.35, 0.0);
  vec3 h = normalize(uLight + v);
  float spec = pow(max(dot(n, h), 0.0), 32.0) * 0.18;
  float sheen = pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.45;
  float sky = 0.5 + 0.5 * n.y;
  vec3 col = base * (0.18 + 0.22 * sky + 0.95 * wrap) + spec + sheen * mix(base, vec3(1.0), 0.6);
  gl_FragColor = vec4(col, 1.0);
}