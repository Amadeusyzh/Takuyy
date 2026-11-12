struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD1;
    float4 gl_FragCoord : TEXCOORD2;
    noperspective float4 v0 : TEXCOORD0;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float3 vec3_ctor(float2 x0, float x1)
{
    return float3(x0, x1);
}
float3x2 mat3x2_ctor(float3x3 x0)
{
    return float3x2(x0[0][0], x0[0][1], x0[1][0], x0[1][1], x0[2][0], x0[2][1]);
}
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
uniform float3x3 _umatrix_S1_c0 : register(c1);
uniform float2 _ucoverageInvert_S1 : register(c4);
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

float4 _sk_FragCoord_3008 = vec4_ctor(gl_FragCoord.x, (_u_skRTFlip.x + (_u_skRTFlip.y * gl_FragCoord.y)), gl_FragCoord.z, gl_FragCoord.w);
float4 _outputColor_S0_3009 = _vcolor_S0;
float __0_coverage_3010 = {0.0};
{
(__0_coverage_3010 = gl_texture2D(_uTextureSampler_0_S1, mul(transpose(mat3x2_ctor(_umatrix_S1_c0)), vec3_ctor(_sk_FragCoord_3008.xy, 1.0)), -0.474999994).x);
}
(__0_coverage_3010 = ((__0_coverage_3010 * _ucoverageInvert_S1.x) + _ucoverageInvert_S1.y));
float4 _output_S1_3011 = vec4_ctor(__0_coverage_3010);
{
(out_sk_FragColor = (_outputColor_S0_3009 * _output_S1_3011));
}
return generateOutput();
}
