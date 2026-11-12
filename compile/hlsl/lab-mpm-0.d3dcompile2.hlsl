struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD3;
    float4 gl_FragCoord : TEXCOORD4;
    float gl_PointSize : PSIZE;
    nointerpolation float4 v0 : TEXCOORD0;
    nointerpolation float4 v1 : TEXCOORD1;
    nointerpolation float2 v2 : TEXCOORD2;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float2x2 mat2_ctor(float2 x0, float2 x1)
{
    return float2x2(x0, x1);
}
float4 vec4_ctor(float2 x0, float x1, float x2)
{
    return float4(x0, x1, x2);
}
// Uniforms

uniform float _uDx : register(c0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static nointerpolation float4 _vVF = {0, 0, 0, 0};
static nointerpolation float4 _vAff = {0, 0, 0, 0};
static nointerpolation float2 _vBase = {0, 0};

static float4 out_o = {0, 0, 0, 0};
static float4 gl_FragCoord = float4(0, 0, 0, 0);

cbuffer DriverConstants : register(b1)
{
    float4 dx_ViewCoords : packoffset(c1);
    float2 dx_FragCoordOffset : packoffset(c3);
    float3 dx_DepthFront : packoffset(c2);
    float2 dx_ViewScale : packoffset(c3.z);
    uint dx_Misc : packoffset(c2.w);
};

#define GL_USES_FRAG_COORD
float f_bspline(in float _r_3002)
{
(_r_3002 = abs(_r_3002));
float sbc5 = {0};
if ((_r_3002 < 0.5))
{
(sbc5 = (0.75 - (_r_3002 * _r_3002)));
}
else
{
(sbc5 = ((0.5 * (1.5 - _r_3002)) * (1.5 - _r_3002)));
}
return sbc5;
}
struct PS_OUTPUT
{
    float4 out_o : SV_TARGET0;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_o = out_o;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;
    _vVF = input.v0;
    _vAff = input.v1;
    _vBase = input.v2.xy;

float2 _off_3009 = (floor(gl_FragCoord.xy) - _vBase);
float2 _d_3010 = (_off_3009 - _vVF.zw);
float _w_3011 = (f_bspline(_d_3010.x) * f_bspline(_d_3010.y));
float2x2 _A_3012 = mat2_ctor(_vAff.xy, _vAff.zw);
(out_o = vec4_ctor((_w_3011 * (_vVF.xy + mul(transpose(_A_3012), (_d_3010 * _uDx)))), _w_3011, 0.0));
return generateOutput();
}
