struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    float4 gl_FragCoord : TEXCOORD3;
    noperspective float4 v0 : TEXCOORD0;
    noperspective float2 v1 : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float x0)
{
    return float4(x0, x0, x0, x0);
}
float4 vec4_ctor(float x0, float x1, float x2, float x3)
{
    return float4(x0, x1, x2, x3);
}
// Uniforms

uniform float2 _u_skRTFlip : register(c0);
uniform float4 _ucircle_S2_c0 : register(c1);
static const uint _uTextureSampler_0_S1 = 0;
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
static noperspective float4 _vcolor_S0 = {0, 0, 0, 0};
static noperspective float2 _vTransformedCoords_3_S0 = {0, 0};

static float4 out_sk_FragColor = {0, 0, 0, 0};
static float4 gl_FragCoord = float4(0, 0, 0, 0);

cbuffer DriverConstants : register(b1)
{
    float4 dx_ViewCoords : packoffset(c1);
    float2 dx_FragCoordOffset : packoffset(c3);
    float3 dx_DepthFront : packoffset(c2);
    float2 dx_ViewScale : packoffset(c3.z);
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

#define GL_USES_FRAG_COORD
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
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;
    _vcolor_S0 = input.v0;
    _vTransformedCoords_3_S0 = input.v1.xy;

float4 _sk_FragCoord_3009 = vec4_ctor(gl_FragCoord.x, (_u_skRTFlip.x + (_u_skRTFlip.y * gl_FragCoord.y)), gl_FragCoord.z, gl_FragCoord.w);
float4 _outputColor_S0_3010 = _vcolor_S0;
float4 __2_input_3011 = _outputColor_S0_3010;
(__2_input_3011 = gl_texture2D(_uTextureSampler_0_S1, _vTransformedCoords_3_S0, -0.474999994));
float4 _output_S1_3012 = __2_input_3011;
float __5_d_3013 = ((1.0 - length(((_ucircle_S2_c0.xy - _sk_FragCoord_3009.xy) * _ucircle_S2_c0.w))) * _ucircle_S2_c0.z);
float4 _output_S2_3014 = vec4_ctor(clamp(__5_d_3013, 0.0, 1.0));
{
(out_sk_FragColor = (_output_S1_3012 * _output_S2_3014));
}
return generateOutput();
}
