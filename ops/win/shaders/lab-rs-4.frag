#version 300 es
precision highp float;
uniform highp sampler2D uGPos;
in vec3 vCol; in float vDist;
out vec4 o;
void main() {
  float t = texelFetch(uGPos, ivec2(gl_FragCoord.xy), 0).w;
  if (t > 0.0 && t < vDist) discard;
  vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float core = smoothstep(1.0, 0.25, r2);
  o = vec4(mix(vCol, vec3(1.0), 0.55 * core) * core, 0.0);
}