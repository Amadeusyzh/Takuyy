attribute vec3 aPos;
uniform mat4 uVP; uniform vec3 uCenter; uniform vec3 uScale; uniform float uShadow; uniform vec3 uLight; uniform float uGround;
varying vec3 vPos; varying vec3 vNrm;
void main() {
  vec3 p = uCenter + aPos * uScale;
  vNrm = normalize(aPos / uScale);
  if (uShadow > 0.5) { p.xz -= uLight.xz * (p.y - uGround) / uLight.y; p.y = uGround + 0.003; }
  vPos = p;
  gl_Position = uVP * vec4(p, 1.0);
}