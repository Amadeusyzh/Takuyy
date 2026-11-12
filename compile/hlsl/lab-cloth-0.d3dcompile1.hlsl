struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD1;
    noperspective float4 v0 : TEXCOORD0;
};

#pragma warning( disable: 3081 3556 3557 3571 )
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static noperspective float4 _vcolor_S0 = {0, 0, 0, 0};

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

float4 _outputColor_S0_3004 = _vcolor_S0;
{
(out_sk_FragColor = _outputColor_S0_3004);
}
return generateOutput();
}
