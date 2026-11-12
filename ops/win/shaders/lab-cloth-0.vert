attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aUv;
uniform mat4 uVP; uniform float uShadow; uniform vec3 uLight; uniform float uGround;
varying vec3 vPos; varying vec3 vNrm; varying vec2 vUv;
void main() {
  vec3 p = aPos;
  if (uShadow > 0.5) { p.xz -= uLight.xz * (p.y - uGround) / uLight.y; p.y = uGround + 0.003; }
  vPos = p; vNrm = aNrm; vUv = aUv;
  gl_Position = uVP * vec4(p, 1.0);
}