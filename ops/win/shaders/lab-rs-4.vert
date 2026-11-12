#version 300 es
precision highp float;
uniform highp sampler2D uLights;
uniform vec3 uCamPos, uCamFwd, uCamRight, uCamUp;
uniform float uTanHalf;
uniform vec2 uRes;
out vec3 vCol; out float vDist;
void main() {
  vec4 a = texelFetch(uLights, ivec2(gl_VertexID, 0), 0), b = texelFetch(uLights, ivec2(gl_VertexID, 1), 0);
  vec3 d = a.xyz - uCamPos; float z = dot(d, uCamFwd);
  if (z < 0.1 || b.a < 0.5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 1.0; return; }
  vec2 ndc = vec2(dot(d, uCamRight) / (z * uTanHalf * uRes.x / uRes.y), dot(d, uCamUp) / (z * uTanHalf));
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = clamp(a.w / (z * uTanHalf) * uRes.y * 1.3, 1.5, 12.0);
  vDist = length(d) - a.w; vCol = b.rgb / max(max(b.r, b.g), max(b.b, 1e-3));
}