#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
float bspline(float r) {
  r = abs(r);
  return r < 0.5 ? 0.75 - r * r : 0.5 * (1.5 - r) * (1.5 - r);
}
uniform sampler2D uT0, uT1, uT2, uT3, uVel;
uniform int uN;
uniform float uDx, uInvDx, uDt;
uniform vec2 uLo, uHi;
uniform float uMu0, uLa0, uLaW, uHmax;
uniform int uModel;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
layout(location = 3) out vec4 o3;
void svd2(mat2 F, out mat2 R, out mat2 U, out vec2 sig, out mat2 V) {
  vec2 q = vec2(F[0][0] + F[1][1], F[0][1] - F[1][0]);
  float l = length(q);
  q = l > 1e-12 ? q / l : vec2(1.0, 0.0);
  R = mat2(q.x, q.y, -q.y, q.x);
  mat2 S = transpose(R) * F;
  float s00 = S[0][0], s11 = S[1][1], s01 = 0.5 * (S[1][0] + S[0][1]);
  float ex = s00 - s11, ey = 2.0 * s01, r = sqrt(ex * ex + ey * ey);
  float c = 1.0, s = 0.0;
  if (r > 1e-12) {
    c = sqrt(max(0.0, 0.5 * (1.0 + ex / r)));
    s = sqrt(max(0.0, 0.5 * (1.0 - ex / r)));
    if (ey < 0.0) s = -s;
  }
  V = mat2(c, s, -s, c);
  float m = 0.5 * (s00 + s11);
  sig = vec2(m + 0.5 * r, m - 0.5 * r);
  U = R * V;
}
void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  if (tc.y * 256 + tc.x >= uN) { o0 = vec4(0.0); o1 = vec4(0.0); o2 = vec4(1.0, 0.0, 0.0, 1.0); o3 = vec4(1.0, 0.0, 0.0, 0.0); return; }
  vec4 a = texelFetch(uT0, tc, 0);
  mat2 F = mat2(texelFetch(uT2, tc, 0));
  vec4 st = texelFetch(uT3, tc, 0);
  if (st.x < 0.0) {
    float m = st.x < -1.5 ? 1e9 : texelFetch(uVel, ivec2(floor(a.xy * uInvDx + 0.5)), 0).z;
    o0 = a; o1 = vec4(0.0); o2 = vec4(1.0, 0.0, 0.0, 1.0);
    o3 = vec4(m < 1.2 ? 1.0 : -2.0, st.yzw);
    return;
  }
  vec2 xg = a.xy * uInvDx;
  ivec2 base = ivec2(floor(xg - 0.5));
  vec2 fx = xg - vec2(base);
  vec2 nv = vec2(0.0);
  mat2 Bm = mat2(0.0);
  for (int i = 0; i < 3; i++) {
    for (int j = 0; j < 3; j++) {
      vec2 d = vec2(float(i), float(j)) - fx;
      float w = bspline(d.x) * bspline(d.y);
      vec2 gv = texelFetch(uVel, base + ivec2(i, j), 0).xy;
      nv += w * gv;
      Bm += w * outerProduct(gv, d);
    }
  }
  mat2 C = (4.0 * uInvDx) * Bm;
  vec2 x = clamp(a.xy + uDt * nv, uLo, uHi);
  F = (mat2(1.0) + uDt * C) * F;
  float Jp = st.x;
  int mat = int(st.y + 0.5);
  mat2 tau;
  if (mat == 0) {
    float J = clamp(determinant(F), 0.2, 3.0);
    F = mat2(sqrt(J));
    tau = mat2(uLaW * J * (J - 1.0));
  } else {
    float h = mat == 1 ? 0.3 : min(exp(10.0 * (1.0 - Jp)), uHmax);
    float mu = uMu0 * h, la = uLa0 * h;
    mat2 R, U, V; vec2 sig;
    svd2(F, R, U, sig, V);
    if (mat == 2) {
      vec2 sc = clamp(sig, vec2(1.0 - 2.5e-2), vec2(1.0 + 4.5e-3));
      Jp = clamp(Jp * (sig.x * sig.y) / (sc.x * sc.y), 0.3, 20.0);
      F = U * mat2(sc.x, 0.0, 0.0, sc.y) * transpose(V);
    }
    float J = determinant(F);
    if (uModel == 0) {
      tau = 2.0 * mu * (F - R) * transpose(F) + mat2(la * J * (J - 1.0));
    } else {
      float Jc = max(J, 0.05);
      tau = mu * (F * transpose(F) - mat2(1.0)) + mat2(la * log(Jc));
    }
  }
  mat2 A = C - (uDt * 4.0 * uInvDx * uInvDx) * tau;
  o0 = vec4(x, nv);
  o1 = vec4(A[0], A[1]);
  o2 = vec4(F[0], F[1]);
  o3 = vec4(Jp, st.yzw);
}