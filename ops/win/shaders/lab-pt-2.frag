#version 300 es
precision highp float;
precision highp int;
#define PI 3.14159265359
#define NOBJ 4
#define ID_LIGHT 9
uniform sampler2D uAccum, uDen, uND, uAlb;
uniform int uView, uDenoise, uSel;
uniform float uExposure;
out vec4 o;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 alb = texelFetch(uAlb, p, 0); vec4 nd = texelFetch(uND, p, 0);
  vec3 c;
  if (uView == 0) c = uDenoise == 1 ? texelFetch(uDen, p, 0).rgb * alb.rgb : texelFetch(uAccum, p, 0).rgb;
  else if (uView == 1) c = texelFetch(uAccum, p, 0).rgb;
  if (uView <= 1) c = pow(aces(c * uExposure), vec3(1.0 / 2.2));
  else if (uView == 2) c = pow(alb.rgb, vec3(1.0 / 2.2));
  else if (uView == 3) c = nd.xyz * 0.5 + 0.5;
  else c = vec3(1.0 - clamp((nd.w - 1.5) / 4.0, 0.0, 1.0));
  if (uSel >= 0) {
    bool inSel = int(floor(alb.a / 16.0 + 0.01)) - 1 == uSel; int edge = 0;
    ivec2 sz = textureSize(uAlb, 0);
    for (int k = 0; k < 4; k++) { ivec2 q = clamp(p + ivec2(k == 0 ? 2 : (k == 1 ? -2 : 0), k == 2 ? 2 : (k == 3 ? -2 : 0)), ivec2(0), sz - 1);
      bool qs = int(floor(texelFetch(uAlb, q, 0).a / 16.0 + 0.01)) - 1 == uSel; if (qs != inSel) edge = 1; }
    if (edge == 1) c = mix(c, vec3(1.0, 0.8, 0.2), 0.85);
  }
  o = vec4(c, 1.0);
}