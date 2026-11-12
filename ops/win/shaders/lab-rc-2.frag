#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
const float TAU = 6.28318530718;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
uniform isampler2D uIn;
out vec4 o;
void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  ivec2 s = texelFetch(uIn, px, 0).xy;
  o = vec4(s.x < 0 ? 1e4 : length(vec2(s - px)), 0.0, 0.0, 1.0);
}