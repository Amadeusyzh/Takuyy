struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    noperspective float4 v0 : TEXCOORD0;
    noperspective float4 v1 : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float x0)
{
    return float4(x0, x0, x0, x0);
}
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static noperspective float4 _vinCircleEdge_S0 = {0, 0, 0, 0};
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
    _vinCircleEdge_S0 = input.v0;
    _vinColor_S0 = input.v1;

float4 _circleEdge_3005 = _vinCircleEdge_S0;
float4 _outputColor_S0_3006 = _vinColor_S0;
float _d_3007 = length(_circleEdge_3005.xy);
float _distanceToOuterEdge_3008 = (_circleEdge_3005.z * (1.0 - _d_3007));
float _edgeAlpha_3009 = clamp(_distanceToOuterEdge_3008, 0.0, 1.0);
float _distanceToInnerEdge_3010 = (_circleEdge_3005.z * (_d_3007 - _circleEdge_3005.w));
float _innerAlpha_3011 = clamp(_distanceToInnerEdge_3010, 0.0, 1.0);
(_edgeAlpha_3009 *= _innerAlpha_3011);
float4 _outputCoverage_S0_3012 = vec4_ctor(_edgeAlpha_3009);
{
(out_sk_FragColor = (_outputColor_S0_3006 * _outputCoverage_S0_3012));
}
return generateOutput();
}
