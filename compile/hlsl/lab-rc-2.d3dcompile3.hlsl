struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 gl_FragCoord : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float2 vec2_ctor_int2(int2 x0)
{
    return float2(x0);
}
float4 vec4_ctor(float x0, float x1, float x2, float x3)
{
    return float4(x0, x1, x2, x3);
}
int2 ivec2_ctor(float2 x0)
{
    return int2(x0);
}
// Uniforms

static const uint _uIn = 0;
static const uint textureIndexOffset2D_int4_ = 0;
static const uint samplerIndexOffset2D_int4_ = 0;
uniform Texture2D<int4> textures2D_int4_[1] : register(t0);
uniform SamplerState samplers2D_int4_[1] : register(s0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings

static float4 out_o = {0, 0, 0, 0};
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

int4 gl_texture2D_int4_Fetch(uint samplerIndex, int2 t, int mip)
{
    const uint textureIndex = samplerIndex - textureIndexOffset2D_int4_;
    const uint samplerArrayIndex = samplerIndex - samplerIndexOffset2D_int4_;
    int baseLevel = 0;
    return textures2D_int4_[textureIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
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

int2 _px_3007 = ivec2_ctor(gl_FragCoord.xy);
int2 _s_3008 = gl_texture2D_int4_Fetch(_uIn, _px_3007, 0).xy;
float sbc1 = {0};
if ((_s_3008.x < 0))
{
(sbc1 = 10000.0);
}
else
{
(sbc1 = length(vec2_ctor_int2((_s_3008 - _px_3007))));
}
(out_o = vec4_ctor(sbc1, 0.0, 0.0, 1.0));
return generateOutput();
}
