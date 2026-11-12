struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD1;
    noperspective float2 v0 : TEXCOORD0;
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
static noperspective float2 _vlocalCoord_S0 = {0, 0};

static float4 out_sk_FragColor = {0, 0, 0, 0};

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
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_sk_FragColor = out_sk_FragColor;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    _vlocalCoord_S0 = input.v0.xy;

float4 _outputColor_S0_3005 = {1.0, 1.0, 1.0, 1.0};
float2 _texCoord_3006 = _vlocalCoord_S0;
(_outputColor_S0_3005 = gl_texture2D(_uTextureSampler_0_S0, _texCoord_3006, -0.474999994));
{
(out_sk_FragColor = _outputColor_S0_3005);
}
return generateOutput();
}
