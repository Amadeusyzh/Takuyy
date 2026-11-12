struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 gl_FragCoord : TEXCOORD1;
};

// INITIAL HLSL BEGIN

#pragma warning( disable: 3081 3556 3557 3571 )
float2 vec2_ctor(float x0, float x1)
{
    return float2(x0, x1);
}
float2 vec2_ctor_int2(int2 x0)
{
    return float2(x0);
}
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
int2 ivec2_ctor(float2 x0)
{
    return int2(x0);
}
int4 ivec4_ctor_int2_int_int(int2 x0, int x1, int x2)
{
    return int4(x0, x1, x2);
}
// Uniforms

uniform float2 _uHi : register(c0);
uniform float4 _uOrb : register(c1);
uniform float3 _uOrbCol : register(c2);
uniform float _uAspect : register(c3);
uniform float2 _uS : register(c4);
static const uint _uScene = 0;
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

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
float4 f_sceneUV(in float2 _uv_3010)
{
if ((_uOrb.w > 0.5))
{
float2 _d_3011 = ((_uv_3010 - _uOrb.xy) * vec2_ctor(_uAspect, 1.0));
if ((dot(_d_3011, _d_3011) < (_uOrb.z * _uOrb.z)))
{
return vec4_ctor(_uOrbCol, 1.0);
}
}
return gl_texture2DFetch(_uScene, ivec2_ctor((clamp(_uv_3010, 0.0, 0.999899983) * _uHi)), 0);
}
struct PS_OUTPUT
{
    int4 out_o : SV_TARGET0;
    int4 out_o : SV_TARGET1;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_o = out_o;
    output.out_o = out_o;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;

int2 _px_3015 = ivec2_ctor(gl_FragCoord.xy);
float4 _s_3016 = f_sceneUV(((vec2_ctor_int2(_px_3015) + 0.5) / _uS));
int4 sbc9 = {0, 0, 0, 0};
if ((_s_3016.w > 0.25))
{
(sbc9 = ivec4_ctor_int2_int_int(_px_3015, 0, 0));
}
else
{
(sbc9 = int4(-1, -1, 0, 0));
}
(out_o = sbc9);
return generateOutput();
}

// INITIAL HLSL END


// COMPILER INPUT HLSL BEGIN

struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 gl_FragCoord : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float2 vec2_ctor(float x0, float x1)
{
    return float2(x0, x1);
}
float2 vec2_ctor_int2(int2 x0)
{
    return float2(x0);
}
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
int2 ivec2_ctor(float2 x0)
{
    return int2(x0);
}
int4 ivec4_ctor_int2_int_int(int2 x0, int x1, int x2)
{
    return int4(x0, x1, x2);
}
// Uniforms

uniform float2 _uHi : register(c0);
uniform float4 _uOrb : register(c1);
uniform float3 _uOrbCol : register(c2);
uniform float _uAspect : register(c3);
uniform float2 _uS : register(c4);
static const uint _uScene = 0;
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

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
float4 f_sceneUV(in float2 _uv_3010)
{
if ((_uOrb.w > 0.5))
{
float2 _d_3011 = ((_uv_3010 - _uOrb.xy) * vec2_ctor(_uAspect, 1.0));
if ((dot(_d_3011, _d_3011) < (_uOrb.z * _uOrb.z)))
{
return vec4_ctor(_uOrbCol, 1.0);
}
}
return gl_texture2DFetch(_uScene, ivec2_ctor((clamp(_uv_3010, 0.0, 0.999899983) * _uHi)), 0);
}
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

int2 _px_3015 = ivec2_ctor(gl_FragCoord.xy);
float4 _s_3016 = f_sceneUV(((vec2_ctor_int2(_px_3015) + 0.5) / _uS));
int4 sbc9 = {0, 0, 0, 0};
if ((_s_3016.w > 0.25))
{
(sbc9 = ivec4_ctor_int2_int_int(_px_3015, 0, 0));
}
else
{
(sbc9 = int4(-1, -1, 0, 0));
}
(out_o = sbc9);
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
