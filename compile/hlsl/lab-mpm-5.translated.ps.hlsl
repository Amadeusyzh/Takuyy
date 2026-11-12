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
float3 vec3_ctor(float2 x0, float x1)
{
    return float3(x0, x1);
}
float3 vec3_ctor(float3 x0)
{
    return float3(x0);
}
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
int int_ctor(float x0)
{
    return int(x0);
}
int2 ivec2_ctor(float2 x0)
{
    return int2(x0);
}
// Uniforms

uniform int _uView : register(c0);
uniform float2 _uOrigin : register(c1);
uniform float2 _uSpan : register(c2);
uniform float2 _uGrid : register(c3);
uniform float _uDx : register(c4);
uniform float2 _uTexel : register(c5);
uniform float _uCellPx : register(c6);
uniform float _uLod : register(c7);
uniform float4 _uCol[4] : register(c8);
uniform float4 _uColR : register(c12);
uniform int _uNumCol : register(c13);
uniform float4 _uPtr : register(c14);
uniform float3 _uMatCol : register(c15);
static const uint _uDen0 = 0;
static const uint _uDen1 = 1;
static const uint _uVel = 2;
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
static  float2 _vUv = {0, 0};

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

float4 gl_texture2DLod(uint samplerIndex, float2 t, float lod)
{
    return textures2D[samplerIndex].SampleLevel(samplers2D[samplerIndex], float2(t.x, t.y), lod);
}

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
float atan_emu(float y, float x)
{
    if(x == 0 && y == 0) x = 1;
    return atan2(y, x);
}


float dyn_index_vec4_float4_int(in float4 base, in int index)
{
switch (index) {
case (0):
return base[0];
case (1):
return base[1];
case (2):
return base[2];
case (3):
return base[3];
default:
break;
}
if ((index < 0))
{
return base[0];
}
{
return base[3];
}
}
float f_hash(in float2 _p_3020)
{
float3 _q_3021 = frac((vec3_ctor(_p_3020.xyx) * 0.103100002));
(_q_3021 += dot(_q_3021, (_q_3021.yzx + 33.3300018)));
return frac(((_q_3021.x + _q_3021.y) * _q_3021.z));
}
float3 f_hsv(in float _h_3023, in float _s_3024, in float _v_3025)
{
float3 _k_3026 = clamp((abs(((frac((_h_3023 + float3(0.0, 0.666666687, 0.333333343))) * 6.0) - 3.0)) - 1.0), 0.0, 1.0);
return (_v_3025 * lerp(float3(1.0, 1.0, 1.0), _k_3026, _s_3024));
}
float f_capsule_float4(in float2 _p_3028, in float4 _s_3029, in float _r_3030)
{
float2 _ab_3031 = (_s_3029.zw - _s_3029.xy);
float _h_3032 = clamp((dot((_p_3028 - _s_3029.xy), _ab_3031) / max(dot(_ab_3031, _ab_3031), 9.99999996e-13)), 0.0, 1.0);
return (length((_p_3028 - (_s_3029.xy + (_h_3032 * _ab_3031)))) - _r_3030);
}
float3 f_background(in float2 _uv_3034, in float2 _p_3035)
{
float3 _c_3036 = lerp(float3(0.0850000009, 0.100000001, 0.135000005), float3(0.0350000001, 0.0450000018, 0.0700000003), _uv_3034.y);
float2 _g_3037 = (_p_3035 / _uDx);
float2 _f_3038 = (abs((frac((_g_3037 + 0.5)) - 0.5)) * _uCellPx);
float _line_3039 = (1.0 - smoothstep(0.0, 1.0, min(_f_3038.x, _f_3038.y)));
float2 _f8_3040 = ((abs((frac(((_g_3037 / 8.0) + 0.5)) - 0.5)) * _uCellPx) * 8.0);
float _line8_3041 = (1.0 - smoothstep(0.0, 1.20000005, min(_f8_3040.x, _f8_3040.y)));
float sc17 = {0};
if ((_uView == 3))
{
(sc17 = 0.0700000003);
}
else
{
(sc17 = 0.0219999999);
}
float _gl_3042 = sc17;
(_c_3036 += (float3(0.550000012, 0.699999988, 1.0) * ((_line_3039 * _gl_3042) + (_line8_3041 * 0.0350000001))));
float2 _vg_3043 = (_uv_3034 - 0.5);
(_c_3036 *= (1.0 - (0.349999994 * dot(_vg_3043, _vg_3043))));
return _c_3036;
}
float f_total(in float2 _uv_3045, in float _lod_3046)
{
float4 _d_3047 = gl_texture2DLod(_uDen0, _uv_3045, _lod_3046);
return ((_d_3047.x + _d_3047.y) + _d_3047.z);
}
@@ PIXEL OUTPUT @@

PS_OUTPUT main(@@ PIXEL MAIN PARAMETERS @@){
@@ MAIN PROLOGUE @@
float2 _uv_3049 = _vUv;
float2 _p_3050 = (_uOrigin + (_uv_3049 * _uSpan));
float3 _col_3051 = {0, 0, 0};
if ((_uView == 0))
{
float4 _d0_3052 = gl_texture2DLod(_uDen0, _uv_3049, 0.699999988);
float4 _d1_3053 = gl_texture2DLod(_uDen1, _uv_3049, 0.699999988);
float4 _b0_3054 = gl_texture2DLod(_uDen0, _uv_3049, (_uLod + 1.5));
float4 _b1_3055 = gl_texture2DLod(_uDen1, _uv_3049, (_uLod + 1.5));
float _tot_3056 = ((_d0_3052.x + _d0_3052.y) + _d0_3052.z);
float _totB_3057 = ((_b0_3054.x + _b0_3054.y) + _b0_3054.z);
float _cov_3058 = max(smoothstep(0.170000002, 0.360000014, _tot_3056), smoothstep(0.5, 0.779999971, _totB_3057));
float _inner_3059 = smoothstep(0.600000024, 0.949999988, _totB_3057);
float _keep_3060 = smoothstep(0.0399999991, 0.200000003, _tot_3056);
(_d0_3052 = lerp(_b0_3054, _d0_3052, _keep_3060));
(_d1_3053 = lerp(_b1_3055, _d1_3053, _keep_3060));
(_tot_3056 = max(((_d0_3052.x + _d0_3052.y) + _d0_3052.z), 9.99999975e-06));
float2 _e_3061 = ((_uTexel * exp2(_uLod)) * 1.5);
float2 _grad_3062 = vec2_ctor((f_total((_uv_3049 + vec2_ctor(_e_3061.x, 0.0)), _uLod) - f_total((_uv_3049 - vec2_ctor(_e_3061.x, 0.0)), _uLod)), (f_total((_uv_3049 + vec2_ctor(0.0, _e_3061.y)), _uLod) - f_total((_uv_3049 - vec2_ctor(0.0, _e_3061.y)), _uLod)));
float3 _n_3063 = normalize(vec3_ctor((((-_grad_3062) * 1.10000002) * (1.0 - (0.699999988 * _inner_3059))), 1.0));
float3 _Ld_3064 = {-0.447899789, 0.646966338, 0.617106378};
float _diff_3065 = max(dot(_n_3063, _Ld_3064), 0.0);
float _spec_3066 = pow(max(dot(reflect((-_Ld_3064), _n_3063), float3(0.0, 0.0, 1.0)), 0.0), 36.0);
float _rim_3067 = ((1.0 - _n_3063.z) * _cov_3058);
float _sw_3068 = max(_tot_3056, 9.99999975e-06);
float _fw_3069 = (_d0_3052.x / _sw_3068);
float _fj_3070 = (_d0_3052.y / _sw_3068);
float _fs_3071 = (_d0_3052.z / _sw_3068);
float2 _ruv_3072 = clamp((_uv_3049 - (_n_3063.xy * 0.0199999996)), 0.0, 1.0);
float3 _refr_3073 = f_background(_ruv_3072, (_uOrigin + (_ruv_3072 * _uSpan)));
float _deep_3074 = smoothstep(0.449999988, 0.949999988, gl_texture2DLod(_uDen0, _uv_3049, 3.5).x);
float3 _cw_3075 = lerp(((_refr_3073 * 0.600000024) + float3(0.0500000007, 0.319999993, 0.620000005)), float3(0.0199999996, 0.129999995, 0.360000014), (_deep_3074 * 0.75));
float _speed_3076 = (_d0_3052.w / _sw_3068);
float _foam_3077 = ((smoothstep(2.5, 6.0, _speed_3076) * (1.0 - _inner_3059)) * (0.550000012 + (0.449999988 * f_hash(floor((gl_FragCoord.xy * 0.5))))));
(_cw_3075 = (lerp(_cw_3075, float3(0.819999993, 0.920000017, 1.0), (_foam_3077 * 0.75)) + ((float3(0.349999994, 0.649999976, 1.0) * _rim_3067) * 0.600000024)));
float3 _jc_3078 = (_d1_3053.xyz / max(_d0_3052.y, 9.99999975e-06));
float3 _cj_3079 = (((_jc_3078 * (0.379999995 + (0.620000005 * _diff_3065))) + ((_jc_3078 * _rim_3067) * 0.899999976)) + (_refr_3073 * 0.119999997));
float _pack_3080 = clamp((_d1_3053.w / max(_d0_3052.z, 9.99999975e-06)), 0.0, 1.0);
float3 _cs_3081 = (lerp(float3(0.930000007, 0.959999979, 1.0), float3(0.620000005, 0.779999971, 0.949999988), _pack_3080) * (0.550000012 + (0.449999988 * _diff_3065)));
(_cs_3081 *= (0.920000017 + (0.0799999982 * f_hash(floor(((_p_3050 / _uDx) * 4.0))))));
(_cs_3081 += ((step(0.985000014, f_hash(floor(gl_FragCoord.xy))) * _spec_3066) * 2.0));
float3 _cm_3082 = (((_fw_3069 * _cw_3075) + (_fj_3070 * _cj_3079)) + (_fs_3071 * _cs_3081));
(_cm_3082 += (_spec_3066 * (((_fw_3069 * 0.899999976) + (_fj_3070 * 0.699999988)) + (_fs_3071 * 0.25))));
float _alpha_3083 = (_cov_3058 * (((_fw_3069 * 0.899999976) + (_fj_3070 * 0.949999988)) + _fs_3071));
(_col_3051 = lerp(f_background(_uv_3049, _p_3050), _cm_3082, _alpha_3083));
}
else
{
(_col_3051 = f_background(_uv_3049, _p_3050));
if ((_uView == 3))
{
int2 _node_3084 = ivec2_ctor(floor(((_p_3050 / _uDx) + 0.5)));
float4 _g_3085 = gl_texture2DFetch(_uVel, clamp(_node_3084, int2(0, 0), (ivec2_ctor(_uGrid) - 1)), 0);
float2 _lp_3086 = (abs(((_p_3050 / _uDx) - vec2_ctor_int2(_node_3084))) * _uCellPx);
float _cell_3087 = (1.0 - smoothstep(((0.5 * _uCellPx) - 1.5), ((0.5 * _uCellPx) - 0.5), max(_lp_3086.x, _lp_3086.y)));
float _sp_3088 = length(_g_3085.xy);
float3 _hc_3089 = f_hsv(((atan_emu(_g_3085.y, _g_3085.x) / 6.28318548) + 0.5), 0.75, (0.25 + (0.75 * clamp((_sp_3088 / 2.0), 0.0, 1.0))));
(_col_3051 = lerp(_col_3051, _hc_3089, (_cell_3087 * clamp((_g_3085.z / 2.5), 0.0, 0.850000024))));
}
}
{ for(int _c_3090 = {0}; (_c_3090 < 4); (_c_3090++))
{
if ((_c_3090 >= _uNumCol))
{
break;
}
float _sd_3091 = ((f_capsule_float4(_p_3050, _uCol[int_ctor(clamp(float_ctor_int(_c_3090), 0.0, 3.0))], dyn_index_vec4_float4_int(_uColR, int_ctor(clamp(float_ctor_int(_c_3090), 0.0, 3.0)))) * _uCellPx) / _uDx);
if ((_sd_3091 < 1.0))
{
float3 _cc_3092 = (float3(0.200000003, 0.230000004, 0.289999992) + (float3(0.180000007, 0.200000003, 0.239999995) * smoothstep(-6.0, 0.0, _sd_3091)));
(_col_3051 = lerp(_col_3051, _cc_3092, clamp((1.0 - _sd_3091), 0.0, 1.0)));
}
}
}
if ((_uPtr.w > 0.5))
{
float _rp_3093 = ((abs((length((_p_3050 - _uPtr.xy)) - _uPtr.z)) * _uCellPx) / _uDx);
float3 sc18 = {0, 0, 0};
if ((_uPtr.w < 1.5))
{
(sc18 = float3(1.0, 0.800000012, 0.400000006));
}
else
{
float3 sc19 = {0, 0, 0};
if ((_uPtr.w < 2.5))
{
(sc19 = float3(0.5, 0.850000024, 1.0));
}
else
{
(sc19 = _uMatCol);
}
(sc18 = sc19);
}
float3 _pc_3094 = sc18;
(_col_3051 = lerp(_col_3051, _pc_3094, ((1.0 - smoothstep(0.600000024, 1.79999995, _rp_3093)) * 0.699999988)));
}
(out_o = vec4_ctor(_col_3051, 1.0));
return generateOutput();
}

// INITIAL HLSL END


// COMPILER INPUT HLSL BEGIN

struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD1;
    float4 gl_FragCoord : TEXCOORD2;
    float2 v0 : TEXCOORD0;
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
float3 vec3_ctor(float2 x0, float x1)
{
    return float3(x0, x1);
}
float3 vec3_ctor(float3 x0)
{
    return float3(x0);
}
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
int int_ctor(float x0)
{
    return int(x0);
}
int2 ivec2_ctor(float2 x0)
{
    return int2(x0);
}
// Uniforms

uniform int _uView : register(c0);
uniform float2 _uOrigin : register(c1);
uniform float2 _uSpan : register(c2);
uniform float2 _uGrid : register(c3);
uniform float _uDx : register(c4);
uniform float2 _uTexel : register(c5);
uniform float _uCellPx : register(c6);
uniform float _uLod : register(c7);
uniform float4 _uCol[4] : register(c8);
uniform float4 _uColR : register(c12);
uniform int _uNumCol : register(c13);
uniform float4 _uPtr : register(c14);
uniform float3 _uMatCol : register(c15);
static const uint _uDen0 = 0;
static const uint _uDen1 = 1;
static const uint _uVel = 2;
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
static  float2 _vUv = {0, 0};

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

float4 gl_texture2DLod(uint samplerIndex, float2 t, float lod)
{
    return textures2D[samplerIndex].SampleLevel(samplers2D[samplerIndex], float2(t.x, t.y), lod);
}

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
float atan_emu(float y, float x)
{
    if(x == 0 && y == 0) x = 1;
    return atan2(y, x);
}


float dyn_index_vec4_float4_int(in float4 base, in int index)
{
switch (index) {
case (0):
return base[0];
case (1):
return base[1];
case (2):
return base[2];
case (3):
return base[3];
default:
break;
}
if ((index < 0))
{
return base[0];
}
{
return base[3];
}
}
float f_hash(in float2 _p_3020)
{
float3 _q_3021 = frac((vec3_ctor(_p_3020.xyx) * 0.103100002));
(_q_3021 += dot(_q_3021, (_q_3021.yzx + 33.3300018)));
return frac(((_q_3021.x + _q_3021.y) * _q_3021.z));
}
float3 f_hsv(in float _h_3023, in float _s_3024, in float _v_3025)
{
float3 _k_3026 = clamp((abs(((frac((_h_3023 + float3(0.0, 0.666666687, 0.333333343))) * 6.0) - 3.0)) - 1.0), 0.0, 1.0);
return (_v_3025 * lerp(float3(1.0, 1.0, 1.0), _k_3026, _s_3024));
}
float f_capsule_float4(in float2 _p_3028, in float4 _s_3029, in float _r_3030)
{
float2 _ab_3031 = (_s_3029.zw - _s_3029.xy);
float _h_3032 = clamp((dot((_p_3028 - _s_3029.xy), _ab_3031) / max(dot(_ab_3031, _ab_3031), 9.99999996e-13)), 0.0, 1.0);
return (length((_p_3028 - (_s_3029.xy + (_h_3032 * _ab_3031)))) - _r_3030);
}
float3 f_background(in float2 _uv_3034, in float2 _p_3035)
{
float3 _c_3036 = lerp(float3(0.0850000009, 0.100000001, 0.135000005), float3(0.0350000001, 0.0450000018, 0.0700000003), _uv_3034.y);
float2 _g_3037 = (_p_3035 / _uDx);
float2 _f_3038 = (abs((frac((_g_3037 + 0.5)) - 0.5)) * _uCellPx);
float _line_3039 = (1.0 - smoothstep(0.0, 1.0, min(_f_3038.x, _f_3038.y)));
float2 _f8_3040 = ((abs((frac(((_g_3037 / 8.0) + 0.5)) - 0.5)) * _uCellPx) * 8.0);
float _line8_3041 = (1.0 - smoothstep(0.0, 1.20000005, min(_f8_3040.x, _f8_3040.y)));
float sc17 = {0};
if ((_uView == 3))
{
(sc17 = 0.0700000003);
}
else
{
(sc17 = 0.0219999999);
}
float _gl_3042 = sc17;
(_c_3036 += (float3(0.550000012, 0.699999988, 1.0) * ((_line_3039 * _gl_3042) + (_line8_3041 * 0.0350000001))));
float2 _vg_3043 = (_uv_3034 - 0.5);
(_c_3036 *= (1.0 - (0.349999994 * dot(_vg_3043, _vg_3043))));
return _c_3036;
}
float f_total(in float2 _uv_3045, in float _lod_3046)
{
float4 _d_3047 = gl_texture2DLod(_uDen0, _uv_3045, _lod_3046);
return ((_d_3047.x + _d_3047.y) + _d_3047.z);
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
    _vUv = input.v0.xy;

float2 _uv_3049 = _vUv;
float2 _p_3050 = (_uOrigin + (_uv_3049 * _uSpan));
float3 _col_3051 = {0, 0, 0};
if ((_uView == 0))
{
float4 _d0_3052 = gl_texture2DLod(_uDen0, _uv_3049, 0.699999988);
float4 _d1_3053 = gl_texture2DLod(_uDen1, _uv_3049, 0.699999988);
float4 _b0_3054 = gl_texture2DLod(_uDen0, _uv_3049, (_uLod + 1.5));
float4 _b1_3055 = gl_texture2DLod(_uDen1, _uv_3049, (_uLod + 1.5));
float _tot_3056 = ((_d0_3052.x + _d0_3052.y) + _d0_3052.z);
float _totB_3057 = ((_b0_3054.x + _b0_3054.y) + _b0_3054.z);
float _cov_3058 = max(smoothstep(0.170000002, 0.360000014, _tot_3056), smoothstep(0.5, 0.779999971, _totB_3057));
float _inner_3059 = smoothstep(0.600000024, 0.949999988, _totB_3057);
float _keep_3060 = smoothstep(0.0399999991, 0.200000003, _tot_3056);
(_d0_3052 = lerp(_b0_3054, _d0_3052, _keep_3060));
(_d1_3053 = lerp(_b1_3055, _d1_3053, _keep_3060));
(_tot_3056 = max(((_d0_3052.x + _d0_3052.y) + _d0_3052.z), 9.99999975e-06));
float2 _e_3061 = ((_uTexel * exp2(_uLod)) * 1.5);
float2 _grad_3062 = vec2_ctor((f_total((_uv_3049 + vec2_ctor(_e_3061.x, 0.0)), _uLod) - f_total((_uv_3049 - vec2_ctor(_e_3061.x, 0.0)), _uLod)), (f_total((_uv_3049 + vec2_ctor(0.0, _e_3061.y)), _uLod) - f_total((_uv_3049 - vec2_ctor(0.0, _e_3061.y)), _uLod)));
float3 _n_3063 = normalize(vec3_ctor((((-_grad_3062) * 1.10000002) * (1.0 - (0.699999988 * _inner_3059))), 1.0));
float3 _Ld_3064 = {-0.447899789, 0.646966338, 0.617106378};
float _diff_3065 = max(dot(_n_3063, _Ld_3064), 0.0);
float _spec_3066 = pow(max(dot(reflect((-_Ld_3064), _n_3063), float3(0.0, 0.0, 1.0)), 0.0), 36.0);
float _rim_3067 = ((1.0 - _n_3063.z) * _cov_3058);
float _sw_3068 = max(_tot_3056, 9.99999975e-06);
float _fw_3069 = (_d0_3052.x / _sw_3068);
float _fj_3070 = (_d0_3052.y / _sw_3068);
float _fs_3071 = (_d0_3052.z / _sw_3068);
float2 _ruv_3072 = clamp((_uv_3049 - (_n_3063.xy * 0.0199999996)), 0.0, 1.0);
float3 _refr_3073 = f_background(_ruv_3072, (_uOrigin + (_ruv_3072 * _uSpan)));
float _deep_3074 = smoothstep(0.449999988, 0.949999988, gl_texture2DLod(_uDen0, _uv_3049, 3.5).x);
float3 _cw_3075 = lerp(((_refr_3073 * 0.600000024) + float3(0.0500000007, 0.319999993, 0.620000005)), float3(0.0199999996, 0.129999995, 0.360000014), (_deep_3074 * 0.75));
float _speed_3076 = (_d0_3052.w / _sw_3068);
float _foam_3077 = ((smoothstep(2.5, 6.0, _speed_3076) * (1.0 - _inner_3059)) * (0.550000012 + (0.449999988 * f_hash(floor((gl_FragCoord.xy * 0.5))))));
(_cw_3075 = (lerp(_cw_3075, float3(0.819999993, 0.920000017, 1.0), (_foam_3077 * 0.75)) + ((float3(0.349999994, 0.649999976, 1.0) * _rim_3067) * 0.600000024)));
float3 _jc_3078 = (_d1_3053.xyz / max(_d0_3052.y, 9.99999975e-06));
float3 _cj_3079 = (((_jc_3078 * (0.379999995 + (0.620000005 * _diff_3065))) + ((_jc_3078 * _rim_3067) * 0.899999976)) + (_refr_3073 * 0.119999997));
float _pack_3080 = clamp((_d1_3053.w / max(_d0_3052.z, 9.99999975e-06)), 0.0, 1.0);
float3 _cs_3081 = (lerp(float3(0.930000007, 0.959999979, 1.0), float3(0.620000005, 0.779999971, 0.949999988), _pack_3080) * (0.550000012 + (0.449999988 * _diff_3065)));
(_cs_3081 *= (0.920000017 + (0.0799999982 * f_hash(floor(((_p_3050 / _uDx) * 4.0))))));
(_cs_3081 += ((step(0.985000014, f_hash(floor(gl_FragCoord.xy))) * _spec_3066) * 2.0));
float3 _cm_3082 = (((_fw_3069 * _cw_3075) + (_fj_3070 * _cj_3079)) + (_fs_3071 * _cs_3081));
(_cm_3082 += (_spec_3066 * (((_fw_3069 * 0.899999976) + (_fj_3070 * 0.699999988)) + (_fs_3071 * 0.25))));
float _alpha_3083 = (_cov_3058 * (((_fw_3069 * 0.899999976) + (_fj_3070 * 0.949999988)) + _fs_3071));
(_col_3051 = lerp(f_background(_uv_3049, _p_3050), _cm_3082, _alpha_3083));
}
else
{
(_col_3051 = f_background(_uv_3049, _p_3050));
if ((_uView == 3))
{
int2 _node_3084 = ivec2_ctor(floor(((_p_3050 / _uDx) + 0.5)));
float4 _g_3085 = gl_texture2DFetch(_uVel, clamp(_node_3084, int2(0, 0), (ivec2_ctor(_uGrid) - 1)), 0);
float2 _lp_3086 = (abs(((_p_3050 / _uDx) - vec2_ctor_int2(_node_3084))) * _uCellPx);
float _cell_3087 = (1.0 - smoothstep(((0.5 * _uCellPx) - 1.5), ((0.5 * _uCellPx) - 0.5), max(_lp_3086.x, _lp_3086.y)));
float _sp_3088 = length(_g_3085.xy);
float3 _hc_3089 = f_hsv(((atan_emu(_g_3085.y, _g_3085.x) / 6.28318548) + 0.5), 0.75, (0.25 + (0.75 * clamp((_sp_3088 / 2.0), 0.0, 1.0))));
(_col_3051 = lerp(_col_3051, _hc_3089, (_cell_3087 * clamp((_g_3085.z / 2.5), 0.0, 0.850000024))));
}
}
{ for(int _c_3090 = {0}; (_c_3090 < 4); (_c_3090++))
{
if ((_c_3090 >= _uNumCol))
{
break;
}
float _sd_3091 = ((f_capsule_float4(_p_3050, _uCol[int_ctor(clamp(float_ctor_int(_c_3090), 0.0, 3.0))], dyn_index_vec4_float4_int(_uColR, int_ctor(clamp(float_ctor_int(_c_3090), 0.0, 3.0)))) * _uCellPx) / _uDx);
if ((_sd_3091 < 1.0))
{
float3 _cc_3092 = (float3(0.200000003, 0.230000004, 0.289999992) + (float3(0.180000007, 0.200000003, 0.239999995) * smoothstep(-6.0, 0.0, _sd_3091)));
(_col_3051 = lerp(_col_3051, _cc_3092, clamp((1.0 - _sd_3091), 0.0, 1.0)));
}
}
}
if ((_uPtr.w > 0.5))
{
float _rp_3093 = ((abs((length((_p_3050 - _uPtr.xy)) - _uPtr.z)) * _uCellPx) / _uDx);
float3 sc18 = {0, 0, 0};
if ((_uPtr.w < 1.5))
{
(sc18 = float3(1.0, 0.800000012, 0.400000006));
}
else
{
float3 sc19 = {0, 0, 0};
if ((_uPtr.w < 2.5))
{
(sc19 = float3(0.5, 0.850000024, 1.0));
}
else
{
(sc19 = _uMatCol);
}
(sc18 = sc19);
}
float3 _pc_3094 = sc18;
(_col_3051 = lerp(_col_3051, _pc_3094, ((1.0 - smoothstep(0.600000024, 1.79999995, _rp_3093)) * 0.699999988)));
}
(out_o = vec4_ctor(_col_3051, 1.0));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
