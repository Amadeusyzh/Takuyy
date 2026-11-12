#version 300 es
in vec3 aPos; uniform mat4 uVP; void main() { gl_Position = uVP * vec4(aPos, 1.0); gl_PointSize = 3.0; }