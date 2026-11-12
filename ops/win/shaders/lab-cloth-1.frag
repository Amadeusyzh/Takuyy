precision highp float;
varying vec3 vPos; varying vec3 vNrm;
uniform vec3 uEye; uniform vec3 uLight; uniform vec3 uColor; uniform float uShadow; uniform float uMetal;
void main() {
  if (uShadow > 0.5) { float f = 1.0 - smoothstep(1.0, 3.5, length(vPos.xz)); gl_FragColor = vec4(0.0, 0.0, 0.0, 0.55 * f); return; }
  vec3 n = normalize(vNrm); vec3 v = normalize(uEye - vPos);
  vec3 r = reflect(-v, n);
  vec3 env = mix(vec3(0.05, 0.055, 0.07), vec3(0.75, 0.8, 0.9), smoothstep(-0.2, 0.8, r.y));
  env += vec3(1.4) * smoothstep(0.92, 0.99, dot(r, uLight));
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  float dif = max(dot(n, uLight), 0.0);
  vec3 col = uColor * (0.15 + 0.85 * dif) * (1.0 - uMetal) + env * mix(fres, 1.0, uMetal) * mix(vec3(1.0), uColor, uMetal);
  gl_FragColor = vec4(col, 1.0);
}