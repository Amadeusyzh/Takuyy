struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 gl_FragCoord : TEXCOORD1;
};

// INITIAL HLSL BEGIN

#pragma warning( disable: 3081 3556 3557 3571 )
float float_ctor_int(int x0)
{
    return float(x0);
}
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
// Uniforms

uniform float2 _uHi : register(c0);
uniform float4 _uOrb : register(c1);
uniform float3 _uOrbCol : register(c2);
uniform float _uAspect : register(c3);
uniform float2 _uS : register(c4);
uniform float _uPower : register(c5);
uniform float _uBounce : register(c6);
static const uint _uScene = 0;
static const uint _uDist = 1;
static const uint _uGIPrev = 2;
static const uint _uEPrev = 3;
uniform Texture2D<float4> textures2D[4] : register(t0);
uniform SamplerState samplers2D[4] : register(s0);
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
    SamplerMetadata samplerMetadata[4] : packoffset(c4);
};

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
float3 f_lin(in float3 _c_3003)
{
return pow(_c_3003, float3(2.20000005, 2.20000005, 2.20000005));
}
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
    float4 out_o : SV_TARGET0;
    float4 out_o : SV_TARGET1;
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

int2 _px_3020 = ivec2_ctor(gl_FragCoord.xy);
float4 _s_3021 = f_sceneUV(((vec2_ctor_int2(_px_3020) + 0.5) / _uS));
if ((_s_3021.w > 0.75))
{
(out_o = vec4_ctor((f_lin(_s_3021.xyz) * _uPower), 1.0));
return generateOutput();
}
if ((_s_3021.w < 0.25))
{
(out_o = float4(0.0, 0.0, 0.0, 0.0));
return generateOutput();
}
int2 _sz_3022 = ivec2_ctor(_uS);
float3 _acc_3023 = {0.0, 0.0, 0.0};
float _n_3024 = {0.0};
{ for(int _k_3025 = {0}; (_k_3025 < 24); (_k_3025++))
{
float _a_3026 = ((float_ctor_int(_k_3025) * 0.785398185) + (float_ctor_int((_k_3025 / 8)) * 0.261799395));
float _r_3027 = (2.5 + (2.75 * float_ctor_int((_k_3025 / 8))));
int2 _q_3028 = (_px_3020 + ivec2_ctor(floor(((vec2_ctor(cos(_a_3026), sin(_a_3026)) * _r_3027) + 0.5))));
bool sbda = (_q_3028.x < 0);
if ((!sbda))
{
(sbda = (_q_3028.y < 0));
}
bool sbd9 = sbda;
if ((!sbd9))
{
(sbd9 = (_q_3028.x >= _sz_3022.x));
}
bool sbd8 = sbd9;
if ((!sbd8))
{
(sbd8 = (_q_3028.y >= _sz_3022.y));
}
if (sbd8)
{
continue;
}
if ((gl_texture2DFetch(_uDist, _q_3028, 0).x < 0.5))
{
continue;
}
(_acc_3023 += gl_texture2DFetch(_uGIPrev, _q_3028, 0).xyz);
(_n_3024 += 1.0);
}
}
float3 sbdb = {0, 0, 0};
if ((_n_3024 > 0.0))
{
(sbdb = (_acc_3023 / _n_3024));
}
else
{
(sbdb = float3(0.0, 0.0, 0.0));
}
float3 _phi_3029 = sbdb;
float3 _lprev_3030 = gl_texture2DFetch(_uEPrev, _px_3020, 0).xyz;
float3 _R_3031 = (f_lin(_s_3021.xyz) * max(((2.0 * _phi_3029) - (_uBounce * _lprev_3030)), 0.0));
(out_o = vec4_ctor(min(_R_3031, float3(64.0, 64.0, 64.0)), 0.5));
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
float float_ctor_int(int x0)
{
    return float(x0);
}
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
// Uniforms

uniform float2 _uHi : register(c0);
uniform float4 _uOrb : register(c1);
uniform float3 _uOrbCol : register(c2);
uniform float _uAspect : register(c3);
uniform float2 _uS : register(c4);
uniform float _uPower : register(c5);
uniform float _uBounce : register(c6);
static const uint _uScene = 0;
static const uint _uDist = 1;
static const uint _uGIPrev = 2;
static const uint _uEPrev = 3;
uniform Texture2D<float4> textures2D[4] : register(t0);
uniform SamplerState samplers2D[4] : register(s0);
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
    SamplerMetadata samplerMetadata[4] : packoffset(c4);
};

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
float3 f_lin(in float3 _c_3003)
{
return pow(_c_3003, float3(2.20000005, 2.20000005, 2.20000005));
}
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

int2 _px_3020 = ivec2_ctor(gl_FragCoord.xy);
float4 _s_3021 = f_sceneUV(((vec2_ctor_int2(_px_3020) + 0.5) / _uS));
if ((_s_3021.w > 0.75))
{
(out_o = vec4_ctor((f_lin(_s_3021.xyz) * _uPower), 1.0));
return generateOutput();
}
if ((_s_3021.w < 0.25))
{
(out_o = float4(0.0, 0.0, 0.0, 0.0));
return generateOutput();
}
int2 _sz_3022 = ivec2_ctor(_uS);
float3 _acc_3023 = {0.0, 0.0, 0.0};
float _n_3024 = {0.0};
{ for(int _k_3025 = {0}; (_k_3025 < 24); (_k_3025++))
{
float _a_3026 = ((float_ctor_int(_k_3025) * 0.785398185) + (float_ctor_int((_k_3025 / 8)) * 0.261799395));
float _r_3027 = (2.5 + (2.75 * float_ctor_int((_k_3025 / 8))));
int2 _q_3028 = (_px_3020 + ivec2_ctor(floor(((vec2_ctor(cos(_a_3026), sin(_a_3026)) * _r_3027) + 0.5))));
bool sbda = (_q_3028.x < 0);
if ((!sbda))
{
(sbda = (_q_3028.y < 0));
}
bool sbd9 = sbda;
if ((!sbd9))
{
(sbd9 = (_q_3028.x >= _sz_3022.x));
}
bool sbd8 = sbd9;
if ((!sbd8))
{
(sbd8 = (_q_3028.y >= _sz_3022.y));
}
if (sbd8)
{
continue;
}
if ((gl_texture2DFetch(_uDist, _q_3028, 0).x < 0.5))
{
continue;
}
(_acc_3023 += gl_texture2DFetch(_uGIPrev, _q_3028, 0).xyz);
(_n_3024 += 1.0);
}
}
float3 sbdb = {0, 0, 0};
if ((_n_3024 > 0.0))
{
(sbdb = (_acc_3023 / _n_3024));
}
else
{
(sbdb = float3(0.0, 0.0, 0.0));
}
float3 _phi_3029 = sbdb;
float3 _lprev_3030 = gl_texture2DFetch(_uEPrev, _px_3020, 0).xyz;
float3 _R_3031 = (f_lin(_s_3021.xyz) * max(((2.0 * _phi_3029) - (_uBounce * _lprev_3030)), 0.0));
(out_o = vec4_ctor(min(_R_3031, float3(64.0, 64.0, 64.0)), 0.5));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
