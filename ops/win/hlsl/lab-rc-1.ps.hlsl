
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
int2 ivec2_ctor(float2 x0)
{
    return int2(x0);
}
int2 ivec2_ctor_int_int(int x0, int x1)
{
    return int2(x0, x1);
}
int4 ivec4_ctor_int2_int_int(int2 x0, int x1, int x2)
{
    return int4(x0, x1, x2);
}
// Uniforms

uniform int _uStep : register(c0);
uniform int2 _uSize : register(c1);
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

static int4 out_o = {0, 0, 0, 0};
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
    int4 out_o : SV_TARGET0;
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

int2 _px_3009 = ivec2_ctor(gl_FragCoord.xy);
int2 _best_3010 = {-1, -1};
float _bd_3011 = {100000002004087734272.0};
{ for(int _j_3012 = {-1}; (_j_3012 <= 1); (_j_3012++))
{
{ for(int _i_3013 = {-1}; (_i_3013 <= 1); (_i_3013++))
{
int2 _q_3014 = (_px_3009 + (ivec2_ctor_int_int(_i_3013, _j_3012) * _uStep));
bool sbcc = (_q_3014.x < 0);
if ((!sbcc))
{
(sbcc = ((_q_3014.y < 0) + false));
}
bool sbcb = sbcc;
if ((!sbcb))
{
(sbcb = ((_q_3014.x >= _uSize.x) + false));
}
bool sbca = sbcb;
if ((!sbca))
{
(sbca = ((_q_3014.y >= _uSize.y) + false));
}
if (sbca)
{
continue;
}
int2 _s_3015 = gl_texture2D_int4_Fetch(_uIn, _q_3014, 0).xy;
if ((_s_3015.x < 0))
{
continue;
}
float2 _d_3016 = vec2_ctor_int2((_s_3015 - _px_3009));
float _dd_3017 = dot(_d_3016, _d_3016);
if ((_dd_3017 < _bd_3011))
{
(_bd_3011 = (_dd_3017 + 0.0));
(_best_3010 = (_s_3015 + int2(0, 0)));
}
}
}
}
}
(out_o = ivec4_ctor_int2_int_int(_best_3010, 0, 0));
return generateOutput();
}
