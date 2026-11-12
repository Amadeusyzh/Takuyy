struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    noperspective float4 v0 : TEXCOORD0;
    noperspective float2 v1 : TEXCOORD1;
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
static noperspective float4 _vcolor_S0 = {0, 0, 0, 0};
static noperspective float2 _varccoord_S0 = {0, 0};

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
    _vcolor_S0 = input.v0;
    _varccoord_S0 = input.v1.xy;

float4 _outputColor_S0_3005 = _vcolor_S0;
float _x_plus_1_3006 = _varccoord_S0.x;
float _y_3007 = _varccoord_S0.y;
float _coverage_3008 = {0};
if ((0.0 == _x_plus_1_3006))
{
(_coverage_3008 = _y_3007);
}
else
{
float _fn_3009 = (_x_plus_1_3006 * (_x_plus_1_3006 - 2.0));
(_fn_3009 = ((_y_3007 * _y_3007) + _fn_3009));
float _fnwidth_3010 = fwidth(_fn_3009);
(_coverage_3008 = (0.5 - (_fn_3009 / _fnwidth_3010)));
(_coverage_3008 = clamp(_coverage_3008, 0.0, 1.0));
}
float4 _outputCoverage_S0_3011 = vec4_ctor(_coverage_3008);
{
(out_sk_FragColor = (_outputColor_S0_3005 * _outputCoverage_S0_3011));
}
return generateOutput();
}
