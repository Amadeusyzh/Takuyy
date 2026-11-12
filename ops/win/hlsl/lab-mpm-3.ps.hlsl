
struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    float2 gl_PointCoord : TEXCOORD3;
    float gl_PointSize : PSIZE;
    float4 v0 : TEXCOORD0;
    float4 v1 : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
// Uniforms

uniform float _uNorm : register(c0);
#define ANGLE_USES_DISCARD_REWRITING
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static  float4 _vA = {0, 0, 0, 0};
static  float4 _vB = {0, 0, 0, 0};

static float4 out_o0 = {0, 0, 0, 0};
static float4 out_o1 = {0, 0, 0, 0};
static float2 gl_PointCoord = float2(0.5, 0.5);

cbuffer DriverConstants : register(b1)
{
    uint dx_Misc : packoffset(c2.w);
};

#define GL_USES_POINT_COORD
struct PS_OUTPUT
{
    float4 out_o0 : SV_TARGET0;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_o0 = out_o0;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    gl_PointCoord.x = input.gl_PointCoord.x;
    gl_PointCoord.y = 1.0 - input.gl_PointCoord.y;
    _vA = input.v0;
    _vB = input.v1;

float2 _q_3007 = ((gl_PointCoord * 2.0) - 1.0);
float _r2_3008 = dot(_q_3007, _q_3007);
if ((_r2_3008 >= 1.0))
{
discard;
}
float _k_3009 = (((1.0 - _r2_3008) * (1.0 - _r2_3008)) * _uNorm);
(out_o0 = (_vA * _k_3009));
(out_o1 = (_vB * _k_3009));
return generateOutput();
}
