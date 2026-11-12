precision highp float;
uniform sampler2D uT0; uniform sampler2D uT1; uniform sampler2D uT2;
uniform vec2 uRes; uniform vec2 uGaze; uniform float uR0; uniform float uR1; uniform float uBand;
uniform float uFov; uniform float uRegions; uniform float uDpr;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float e = distance(gl_FragCoord.xy, uGaze);
  vec3 col = texture2D(uT0, uv).rgb;
  if (uFov > 0.5) {
    float w0 = 1.0 - smoothstep(uR0 - uBand, uR0, e);
    float w1 = 1.0 - smoothstep(uR1 - uBand, uR1, e);
    col = mix(mix(texture2D(uT2, uv).rgb, texture2D(uT1, uv).rgb, w1), col, w0);
    if (uRegions > 0.5) {
      vec3 tint = e < uR0 ? vec3(0.2, 1.0, 0.45) : (e < uR1 ? vec3(1.0, 0.8, 0.15) : vec3(1.0, 0.25, 0.3));
      col = mix(col, tint, 0.2);
      float ring = min(abs(e - uR0), abs(e - uR1));
      col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 1.5 * uDpr, ring)) * 0.7);
    }
  }
  float ret = abs(e - 7.0 * uDpr);
  col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 1.2 * uDpr, ret)) * 0.9);
  col = mix(col, vec3(1.0), (1.0 - smoothstep(1.0 * uDpr, 2.0 * uDpr, e)) * 0.9);
  gl_FragColor = vec4(col, 1.0);
}