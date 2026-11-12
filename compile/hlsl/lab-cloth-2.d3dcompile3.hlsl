struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD1;
    float3 v0 : TEXCOORD0;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
// Uniforms

uniform float3 _uBg : register(c0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static  float3 _vPos = {0, 0, 0};

static float4 gl_Color[1] =
{
    float4(0, 0, 0, 0)
};

cbuffer DriverConstants : register(b1)
{
    uint dx_Misc : packoffset(c2.w);
};

#define GL_USES_FRAG_COLOR
struct PS_OUTPUT
{
    float4 gl_Color0 : SV_TARGET0;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.gl_Color0 = gl_Color[0];
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    _vPos = input.v0.xyz;

float2 _g_3005 = abs((frac((_vPos.xz * 2.0)) - 0.5));
float _line_3006 = (1.0 - smoothstep(0.0, 0.0199999996, (min(_g_3005.x, _g_3005.y) - 0.0)));
float _r_3007 = length(_vPos.xz);
float _spot_3008 = exp((((-_r_3007) * _r_3007) * 0.349999994));
float3 _col_3009 = ((float3(0.109999999, 0.119999997, 0.140000001) * (0.349999994 + (0.899999976 * _spot_3008))) + ((_line_3006 * 0.0599999987) * _spot_3008));
(_col_3009 = lerp(_col_3009, _uBg, smoothstep(2.5, 7.0, _r_3007)));
(gl_Color[0] = vec4_ctor(_col_3009, 1.0));
return generateOutput();
}
