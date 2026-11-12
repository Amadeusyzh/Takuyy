#version 300 es
precision mediump float;
uniform sampler2D uTex;
out vec4 outColor;
void main() { outColor = vec4(texelFetch(uTex, ivec2(gl_FragCoord.xy), 0).rgb, 1.0); }