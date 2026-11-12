#version 300 es
in vec2 aPos; out vec2 vUv; void main() { vUv = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }