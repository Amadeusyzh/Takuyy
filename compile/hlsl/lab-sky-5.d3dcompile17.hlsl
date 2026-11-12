struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    noperspective float4 v0 : TEXCOORD0;
    noperspective float4 v1 : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float2 vec2_ctor(float x0, float x1)
{
    return float2(x0, x1);
}
float4 vec4_ctor(float x0)
{
    return float4(x0, x0, x0, x0);
}
// Uniforms

uniform float2 _u_skRTFlip : register(c0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static noperspective float4 _vQuadEdge_S0 = {0, 0, 0, 0};
static noperspective float4 _vinColor_S0 = {0, 0, 0, 0};

static float4 out_sk_FragColor = {0, 0, 0, 0};

cbuffer DriverConstants : register(b1)
{
    uint dx_Misc : packoffset(c2.w);
};

struct PS_OUTPUT
{
    float4 out_sk_FragColor : SV_TARGET0;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_sk_FragColor = out_sk_FragColor;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    _vQuadEdge_S0 = input.v0;
    _vinColor_S0 = input.v1;

float4 _outputColor_S0_3006 = _vinColor_S0;
float _edgeAlpha_3007 = {0};
float2 _duvdx_3008 = ddx(_vQuadEdge_S0.xy);
float2 _duvdy_3009 = (_u_skRTFlip.y * ddy(_vQuadEdge_S0.xy));
bool sbc4 = (_vQuadEdge_S0.z > 0.0);
if (sbc4)
{
(sbc4 = (_vQuadEdge_S0.w > 0.0));
}
if (sbc4)
{
(_edgeAlpha_3007 = min((min(_vQuadEdge_S0.z, _vQuadEdge_S0.w) + 0.5), 1.0));
}
else
{
float2 _gF_3010 = vec2_ctor((((2.0 * _vQuadEdge_S0.x) * _duvdx_3008.x) - _duvdx_3008.y), (((2.0 * _vQuadEdge_S0.x) * _duvdy_3009.x) - _duvdy_3009.y));
(_edgeAlpha_3007 = ((_vQuadEdge_S0.x * _vQuadEdge_S0.x) - _vQuadEdge_S0.y));
(_edgeAlpha_3007 = clamp((0.5 - (_edgeAlpha_3007 / max(length(_gF_3010), 9.99999997e-07))), 0.0, 1.0));
}
float4 _outputCoverage_S0_3011 = vec4_ctor(_edgeAlpha_3007);
{
(out_sk_FragColor = (_outputColor_S0_3006 * _outputCoverage_S0_3011));
}
return generateOutput();
}
