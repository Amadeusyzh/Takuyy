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
int2 ivec2_ctor_int_int(int x0, int x1)
{
    return int2(x0, x1);
}
// Uniforms

uniform float2 _uS : register(c0);
uniform int2 _uP : register(c1);
uniform int _uD : register(c2);
uniform int2 _uUP : register(c3);
uniform float _uSp : register(c4);
uniform float _uA : register(c5);
uniform float _uB : register(c6);
uniform int _uHasUpper : register(c7);
uniform int _uFix : register(c8);
uniform float _uBounce : register(c9);
static const uint _uDist = 0;
static const uint _uEmit = 1;
static const uint _uUpper = 2;
uniform Texture2D<float4> textures2D[3] : register(t0);
uniform SamplerState samplers2D[3] : register(s0);
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
    SamplerMetadata samplerMetadata[3] : packoffset(c4);
};

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
float4 f_march(in float2 _from_3019, in float2 _to_3020)
{
float2 _d_3021 = (_to_3020 - _from_3019);
float _len_3022 = length(_d_3021);
float2 _dir_3023 = (_d_3021 / max(_len_3022, 9.99999997e-07));
float _t_3024 = {0.0};
{ for(int _k_3025 = {0}; (_k_3025 < 64); (_k_3025++))
{
float2 _p_3026 = (_from_3019 + (_dir_3023 * _t_3024));
bool sbf4 = (_p_3026.x < 0.0);
if ((!sbf4))
{
(sbf4 = (_p_3026.y < 0.0));
}
bool sbf3 = sbf4;
if ((!sbf3))
{
(sbf3 = (_p_3026.x >= _uS.x));
}
bool sbf2 = sbf3;
if ((!sbf2))
{
(sbf2 = (_p_3026.y >= _uS.y));
}
if (sbf2)
{
break;
}
int2 _ip_3027 = ivec2_ctor(_p_3026);
float _sd_3028 = gl_texture2DFetch(_uDist, _ip_3027, 0).x;
if ((_sd_3028 < 0.5))
{
float4 _e_3029 = gl_texture2DFetch(_uEmit, _ip_3027, 0);
float sbf5 = {0};
if ((_e_3029.w > 0.75))
{
(sbf5 = 1.0);
}
else
{
(sbf5 = _uBounce);
}
return vec4_ctor((_e_3029.xyz * sbf5), 0.0);
}
(_t_3024 += max((_sd_3028 - 1.0), 0.800000012));
if ((_t_3024 >= _len_3022))
{
break;
}
}
}
return float4(0.0, 0.0, 0.0, 1.0);
}
float3 f_upperAvg_int2_int(in int2 _q_3031, in int _k_3032)
{
int _du_3033 = (_uD * 2);
float3 _s_3034 = {0.0, 0.0, 0.0};
{ for(int _j_3035 = {0}; (_j_3035 < 4); (_j_3035++))
{
int _c_3036 = ((4 * _k_3032) + _j_3035);
(_s_3034 += gl_texture2DFetch(_uUpper, ((ivec2_ctor_int_int((_c_3036 % _du_3033), (_c_3036 / _du_3033)) * _uUP) + _q_3031), 0).xyz);
}
}
return (_s_3034 * 0.25);
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

int2 _tc_3038 = ivec2_ctor(gl_FragCoord.xy);
int2 _tile_3039 = (_tc_3038 / _uP);
int2 _pr_3040 = (_tc_3038 - (_tile_3039 * _uP));
int _k_3041 = ((_tile_3039.y * _uD) + _tile_3039.x);
float _ang_3042 = (((float_ctor_int(_k_3041) + 0.5) * 6.28318548) / float_ctor_int((_uD * _uD)));
float2 _dir_3043 = vec2_ctor(cos(_ang_3042), sin(_ang_3042));
float2 _pos_3044 = ((vec2_ctor_int2(_pr_3040) + 0.5) * _uSp);
if ((_uHasUpper == 0))
{
(out_o = vec4_ctor(f_march((_pos_3044 + (_dir_3043 * _uA)), (_pos_3044 + (_dir_3043 * _uB))).xyz, 1.0));
return generateOutput();
}
float2 _g_3045 = ((_pos_3044 / (2.0 * _uSp)) - 0.5);
float2 _fl_3046 = floor(_g_3045);
float2 _f_3047 = (_g_3045 - _fl_3046);
int2 _b_3048 = ivec2_ctor(_fl_3046);
float4 sbf6 = {0, 0, 0, 0};
if ((_uFix == 0))
{
(sbf6 = f_march((_pos_3044 + (_dir_3043 * _uA)), (_pos_3044 + (_dir_3043 * _uB))));
}
else
{
(sbf6 = float4(0.0, 0.0, 0.0, 0.0));
}
float4 _r0_3049 = sbf6;
float3 _acc_3050 = {0.0, 0.0, 0.0};
{ for(int _j_3051 = {0}; (_j_3051 < 4); (_j_3051++))
{
int2 _off_3052 = ivec2_ctor_int_int((_j_3051 & 1), (_j_3051 >> 1));
int2 _q_3053 = clamp((_b_3048 + _off_3052), int2(0, 0), (_uUP - 1));
float sbf7 = {0};
if ((_off_3052.x == 1))
{
(sbf7 = _f_3047.x);
}
else
{
(sbf7 = (1.0 - _f_3047.x));
}
float sbf8 = {0};
if ((_off_3052.y == 1))
{
(sbf8 = _f_3047.y);
}
else
{
(sbf8 = (1.0 - _f_3047.y));
}
float _w_3054 = (sbf7 * sbf8);
float4 _r_3055 = _r0_3049;
if ((_uFix == 1))
{
float2 _qpos_3056 = ((vec2_ctor_int2(_q_3053) + 0.5) * (2.0 * _uSp));
(_r_3055 = f_march((_pos_3044 + (_dir_3043 * _uA)), (_qpos_3056 + (_dir_3043 * _uB))));
}
float3 sbf9 = {0, 0, 0};
if ((_r_3055.w > 0.0))
{
(sbf9 = f_upperAvg_int2_int(_q_3053, _k_3041));
}
else
{
(sbf9 = float3(0.0, 0.0, 0.0));
}
float3 _up_3057 = sbf9;
(_acc_3050 += (_w_3054 * (_r_3055.xyz + (_r_3055.w * _up_3057))));
}
}
(out_o = vec4_ctor(_acc_3050, 1.0));
return generateOutput();
}
