struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    noperspective float4 v0 : TEXCOORD0;
    noperspective float2 v1 : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
// Uniforms

static const uint _uTextureSampler_0_S0 = 0;
uniform Texture2D<float4> textures2D[1] : register(t0);
uniform SamplerState samplers2D[1] : register(s0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static noperspective float2 _vTextureCoords_S0 = {0, 0};
static noperspective float4 _vinColor_S0 = {0, 0, 0, 0};

static float4 out_sk_FragColor = {0, 0, 0, 0};
static float4 out_fsSecondaryColorOut = {0, 0, 0, 0};

cbuffer DriverConstants : register(b1)
{
    uint dx_Misc : packoffset(c2.w);
    struct SamplerMetadata
    {
        int baseLevel;
        int wrapModes;
        int2 padding;
        int4 intBorderColor;
    };
    SamplerMetadata samplerMetadata[1] : packoffset(c4);
};

float4 gl_texture2D(uint samplerIndex, float2 t, float bias)
{
    return textures2D[samplerIndex].SampleBias(samplers2D[samplerIndex], float2(t.x, t.y), bias);
}

struct PS_OUTPUT
{
    float4 out_sk_FragColor : SV_TARGET0;
    float4 out_fsSecondaryColorOut : SV_TARGET1;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_sk_FragColor = out_sk_FragColor;
    output.out_fsSecondaryColorOut = out_fsSecondaryColorOut;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    _vinColor_S0 = input.v0;
    _vTextureCoords_S0 = input.v1.xy;

float4 _outputColor_S0_3008 = _vinColor_S0;
float4 _texColor_3009 = gl_texture2D(_uTextureSampler_0_S0, _vTextureCoords_S0, -0.474999994);
float4 _outputCoverage_S0_3010 = _texColor_3009;
{
(_outputCoverage_S0_3010.w = max(max(_outputCoverage_S0_3010.x, _outputCoverage_S0_3010.y), _outputCoverage_S0_3010.z));
(out_fsSecondaryColorOut = (_outputColor_S0_3008.w * _outputCoverage_S0_3010));
(out_sk_FragColor = (_outputColor_S0_3008 * _outputCoverage_S0_3010));
}
return generateOutput();
}
