#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uT0, uT2, uT3;
uniform vec2 uOrigin;
uniform vec2 uSpan;
uniform float uSize;
uniform int uMode;
uniform vec3 uPal[4];
out vec4 vA;
out vec4 vB;
vec3 diverging(float t) {
  vec3 neg = vec3(0.15, 0.55, 1.0), mid = vec3(0.62, 0.64, 0.7), pos = vec3(1.0, 0.38, 0.2);
  return t < 0.0 ? mix(mid, neg, -t) : mix(mid, pos, t);
}
void main() {
  ivec2 tc = ivec2(gl_VertexID % 256, gl_VertexID / 256);
  vec4 a = texelFetch(uT0, tc, 0);
  vec4 st = texelFetch(uT3, tc, 0);
  int mat = int(st.y + 0.5);
  vec2 uv = (a.xy - uOrigin) / uSpan;
  gl_Position = st.x < -1.5 ? vec4(-2.0, -2.0, 0.0, 1.0) : vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = uSize;
  vec3 jc = uPal[int(st.z + 0.5) & 3];
  float speed = length(a.zw);
  if (uMode == 0) {
    vA = vec4(mat == 0 ? 1.0 : 0.0, mat == 1 ? 1.0 : 0.0, mat == 2 ? 1.0 : 0.0, speed);
    vB = vec4(mat == 1 ? jc : vec3(0.0), mat == 2 ? clamp(1.0 - st.x, 0.0, 0.6) * 1.6 : 0.0);
  } else {
    vec3 c = mat == 0 ? vec3(0.28, 0.62, 1.0) : (mat == 1 ? jc : vec3(0.93, 0.96, 1.0));
    c *= 0.8 + 0.25 * fract(st.w * 13.7);
    if (uMode == 2) {
      float J = determinant(mat2(texelFetch(uT2, tc, 0))) * st.x;
      c = diverging(tanh(log(max(J, 1e-3)) / 0.025));
    }
    vA = vec4(c, uMode == 3 ? 0.35 : 0.95);
    vB = vec4(0.0);
  }
}