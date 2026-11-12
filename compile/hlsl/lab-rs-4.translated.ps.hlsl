// INITIAL HLSL BEGIN

#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
int2 ivec2_ctor(float2 x0)
{
    return int2(x0);
}
// Uniforms

static const uint _uGPos = 0;
uniform Texture2D<float4> textures2D[1] : register(t0);
uniform SamplerState samplers2D[1] : register(s0);
#define ANGLE_USES_DISCARD_REWRITING
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static  float3 _vCol = {0, 0, 0};
static  float _vDist = {0};

static float4 out_o = {0, 0, 0, 0};
static float4 gl_FragCoord = float4(0, 0, 0, 0);
static float2 gl_PointCoord = float2(0.5, 0.5);

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

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
#define GL_USES_POINT_COORD
@@ PIXEL OUTPUT @@

PS_OUTPUT main(@@ PIXEL MAIN PARAMETERS @@){
@@ MAIN PROLOGUE @@
float _t_3006 = gl_texture2DFetch(_uGPos, ivec2_ctor(gl_FragCoord.xy), 0).w;
bool sbc2 = (_t_3006 > 0.0);
if (sbc2)
{
(sbc2 = (_t_3006 < _vDist));
}
if (sbc2)
{
discard;
}
float2 _c_3007 = ((gl_PointCoord * 2.0) - 1.0);
float _r2_3008 = dot(_c_3007, _c_3007);
if ((_r2_3008 > 1.0))
{
discard;
}
float _core_3009 = smoothstep(1.0, 0.25, _r2_3008);
(out_o = vec4_ctor((lerp(_vCol, float3(1.0, 1.0, 1.0), (0.550000012 * _core_3009)) * _core_3009), 0.0));
return generateOutput();
}

// INITIAL HLSL END


// COMPILER INPUT HLSL BEGIN

struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    float4 gl_FragCoord : TEXCOORD3;
    float2 gl_PointCoord : TEXCOORD4;
    float gl_PointSize : PSIZE;
    float3 v0 : TEXCOORD0;
    float v1 : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
int2 ivec2_ctor(float2 x0)
{
    return int2(x0);
}
// Uniforms

static const uint _uGPos = 0;
uniform Texture2D<float4> textures2D[1] : register(t0);
uniform SamplerState samplers2D[1] : register(s0);
#define ANGLE_USES_DISCARD_REWRITING
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static  float3 _vCol = {0, 0, 0};
static  float _vDist = {0};

static float4 out_o = {0, 0, 0, 0};
static float4 gl_FragCoord = float4(0, 0, 0, 0);
static float2 gl_PointCoord = float2(0.5, 0.5);

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

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
#define GL_USES_POINT_COORD
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
    gl_PointCoord.x = input.gl_PointCoord.x;
    gl_PointCoord.y = 1.0 - input.gl_PointCoord.y;
    _vCol = input.v0.xyz;
    _vDist = input.v1.x;

float _t_3006 = gl_texture2DFetch(_uGPos, ivec2_ctor(gl_FragCoord.xy), 0).w;
bool sbc2 = (_t_3006 > 0.0);
if (sbc2)
{
(sbc2 = (_t_3006 < _vDist));
}
if (sbc2)
{
discard;
}
float2 _c_3007 = ((gl_PointCoord * 2.0) - 1.0);
float _r2_3008 = dot(_c_3007, _c_3007);
if ((_r2_3008 > 1.0))
{
discard;
}
float _core_3009 = smoothstep(1.0, 0.25, _r2_3008);
(out_o = vec4_ctor((lerp(_vCol, float3(1.0, 1.0, 1.0), (0.550000012 * _core_3009)) * _core_3009), 0.0));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
