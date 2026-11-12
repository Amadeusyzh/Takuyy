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
float3 vec3_ctor(float3 x0)
{
    return float3(x0);
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

uniform float2 _uHi : register(c0);
uniform float4 _uOrb : register(c1);
uniform float3 _uOrbCol : register(c2);
uniform float _uAspect : register(c3);
uniform float2 _uCanvas : register(c4);
uniform float2 _uS : register(c5);
uniform int _uView : register(c6);
uniform float _uExposure : register(c7);
uniform float _uPower : register(c8);
uniform int2 _uCascSize : register(c9);
uniform int2 _uCascP : register(c10);
uniform float4 _uCursor : register(c11);
static const uint _uScene = 0;
static const uint _uGI = 1;
static const uint _uEmit = 2;
static const uint _uDist = 3;
static const uint _uCasc = 4;
uniform Texture2D<float4> textures2D[5] : register(t0);
uniform SamplerState samplers2D[5] : register(s0);
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
    SamplerMetadata samplerMetadata[5] : packoffset(c4);
};

float4 gl_texture2D(uint samplerIndex, float2 t)
{
    return textures2D[samplerIndex].Sample(samplers2D[samplerIndex], float2(t.x, t.y));
}

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
float3 f_aces(in float3 _x_3026)
{
return clamp(((_x_3026 * ((2.50999999 * _x_3026) + 0.0299999993)) / ((_x_3026 * ((2.43000007 * _x_3026) + 0.589999974)) + 0.140000001)), 0.0, 1.0);
}
float3 f_tone(in float3 _x_3028)
{
return pow(f_aces((_x_3028 * _uExposure)), float3(0.454545438, 0.454545438, 0.454545438));
}
float f_hash(in float2 _p_3030)
{
float3 _q_3031 = frac((vec3_ctor(_p_3030.xyx) * 0.103100002));
(_q_3031 += dot(_q_3031, (_q_3031.yzx + 33.3300018)));
return frac(((_q_3031.x + _q_3031.y) * _q_3031.z));
}
float3 f_wallLight(in float2 _uv_3033)
{
float2 _g_3034 = ((_uv_3033 * _uS) - 0.5);
float2 _fl_3035 = floor(_g_3034);
float2 _f_3036 = (_g_3034 - _fl_3035);
float3 _acc_3037 = {0.0, 0.0, 0.0};
float _ws_3038 = {0.0};
{ for(int _j_3039 = {0}; (_j_3039 < 4); (_j_3039++))
{
int2 _off_3040 = ivec2_ctor_int_int((_j_3039 & 1), (_j_3039 >> 1));
int2 _q_3041 = clamp((ivec2_ctor(_fl_3035) + _off_3040), int2(0, 0), (ivec2_ctor(_uS) - 1));
float4 _e_3042 = gl_texture2DFetch(_uEmit, _q_3041, 0);
float sbf3 = {0};
if ((_off_3040.x == 1))
{
(sbf3 = _f_3036.x);
}
else
{
(sbf3 = (1.0 - _f_3036.x));
}
float sbf4 = {0};
if ((_off_3040.y == 1))
{
(sbf4 = _f_3036.y);
}
else
{
(sbf4 = (1.0 - _f_3036.y));
}
float _w_3043 = (sbf3 * sbf4);
bool sbf5 = (_e_3042.w > 0.25);
if (sbf5)
{
(sbf5 = (_e_3042.w < 0.75));
}
if (sbf5)
{
(_acc_3037 += (_w_3043 * _e_3042.xyz));
(_ws_3038 += _w_3043);
}
}
}
float3 sbf6 = {0, 0, 0};
if ((_ws_3038 > 0.0))
{
(sbf6 = (_acc_3037 / _ws_3038));
}
else
{
(sbf6 = float3(0.0, 0.0, 0.0));
}
return sbf6;
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

float2 _uv_3045 = (gl_FragCoord.xy / _uCanvas);
float4 _s_3046 = f_sceneUV(_uv_3045);
float3 _col_3047 = {0, 0, 0};
if ((_uView == 3))
{
int2 _t_3048 = ivec2_ctor((_uv_3045 * vec2_ctor_int2(_uCascSize)));
(_col_3047 = f_tone(gl_texture2DFetch(_uCasc, _t_3048, 0).xyz));
int2 _m_3049 = (_t_3048 - ((_t_3048 / _uCascP) * _uCascP));
float2 _e_3050 = fwidth((_uv_3045 * vec2_ctor_int2(_uCascSize)));
bool sbf7 = (float_ctor_int(_m_3049.x) < _e_3050.x);
if ((!sbf7))
{
(sbf7 = (float_ctor_int(_m_3049.y) < _e_3050.y));
}
if (sbf7)
{
(_col_3047 = lerp(_col_3047, float3(0.449999988, 0.550000012, 0.699999988), 0.699999988));
}
}
else
{
if ((_uView == 1))
{
float _d_3051 = gl_texture2D(_uDist, _uv_3045).x;
if ((_s_3046.w > 0.25))
{
float sbf8 = {0};
if ((_s_3046.w > 0.75))
{
(sbf8 = 1.0);
}
else
{
(sbf8 = 0.75);
}
(_col_3047 = (_s_3046.xyz * sbf8));
}
else
{
float3 _base_3052 = lerp(float3(0.0299999993, 0.0500000007, 0.100000001), float3(0.219999999, 0.449999988, 0.850000024), (1.0 - exp(((-_d_3051) / (0.200000003 * _uS.y)))));
float _k_3053 = (_d_3051 / 6.0);
float _fw_3054 = max(fwidth(_k_3053), 0.00100000005);
float _ln_3055 = (1.0 - smoothstep(0.0, (1.5 * _fw_3054), abs((frac((_k_3053 + 0.5)) - 0.5))));
float _major_3056 = (1.0 - smoothstep(0.0, (1.5 * _fw_3054), (abs((frac(((_k_3053 / 4.0) + 0.5)) - 0.5)) * 4.0)));
(_col_3047 = ((pow(_base_3052, float3(0.454545438, 0.454545438, 0.454545438)) + (float3(0.159999996, 0.159999996, 0.159999996) * _ln_3055)) + (float3(0.25, 0.25, 0.25) * _major_3056)));
}
}
else
{
float3 _c_3057 = {0, 0, 0};
if ((_s_3046.w > 0.75))
{
(_c_3057 = (f_lin(_s_3046.xyz) * _uPower));
}
else
{
if ((_s_3046.w > 0.25))
{
(_c_3057 = ((f_lin(_s_3046.xyz) * 0.0250000004) + f_wallLight(_uv_3045)));
}
else
{
(_c_3057 = gl_texture2D(_uGI, _uv_3045).xyz);
}
}
(_col_3047 = f_tone(_c_3057));
}
}
if ((_uCursor.w > 0.5))
{
float _r_3058 = length((gl_FragCoord.xy - _uCursor.xy));
(_col_3047 = lerp(_col_3047, float3(1.0, 1.0, 1.0), (0.550000012 * (1.0 - smoothstep(0.0, 1.20000005, abs((_r_3058 - _uCursor.z)))))));
}
(_col_3047 += ((f_hash(gl_FragCoord.xy) - 0.5) / 255.0));
(out_o = vec4_ctor(_col_3047, 1.0));
return generateOutput();
}
