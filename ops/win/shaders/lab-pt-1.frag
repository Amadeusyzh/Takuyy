#version 300 es
precision highp float;
precision highp int;
#define PI 3.14159265359
#define NOBJ 4
#define ID_LIGHT 9
uniform sampler2D uIn, uND, uAlb;
uniform int uStep, uDemod;
uniform float uSigC, uSigN, uSigZ;
out vec4 o;
vec3 fetch(ivec2 q) {
  vec3 c = texelFetch(uIn, q, 0).rgb;
  if (uDemod == 1) c /= texelFetch(uAlb, q, 0).rgb;
  return c;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy); ivec2 sz = textureSize(uIn, 0);
  vec3 cp = fetch(p); vec4 ndp = texelFetch(uND, p, 0); float idp = texelFetch(uAlb, p, 0).a;
  float k[3] = float[3](0.375, 0.25, 0.0625);
  vec3 sum = vec3(0.0); float wsum = 0.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    ivec2 q = clamp(p + ivec2(x, y) * uStep, ivec2(0), sz - 1);
    vec3 cq = fetch(q); vec4 ndq = texelFetch(uND, q, 0);
    float wc = exp(-dot(cp - cq, cp - cq) / (uSigC * uSigC + 1e-6));
    float wn = pow(max(dot(ndp.xyz, ndq.xyz), 0.0), uSigN);
    float wz = exp(-abs(ndp.w - ndq.w) / (uSigZ * float(uStep) + 1e-3));
    float wi = texelFetch(uAlb, q, 0).a == idp ? 1.0 : 0.2;
    float w = k[abs(x)] * k[abs(y)] * wc * wn * wz * wi;
    sum += cq * w; wsum += w;
  }
  o = vec4(sum / max(wsum, 1e-6), 1.0);
}