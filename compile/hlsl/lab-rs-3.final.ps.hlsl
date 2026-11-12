struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 gl_FragCoord : TEXCOORD1;
};

// INITIAL HLSL BEGIN

#pragma warning( disable: 3081 3556 3557 3571 )
struct _Surf_0
{
    float3 _p;
    float3 _n;
    float3 _v;
    float3 _alb;
    float _rough;
};
#pragma pack_matrix(row_major)
struct rm__Surf_0
{
    float3 _p;
    float3 _n;
    float3 _v;
    float3 _alb;
    float _rough;
};
#pragma pack_matrix(column_major)
struct std__Surf_0
{
    float3 _p;
    float3 _n;
    float3 _v;
    float3 _alb;
    float _rough;
};
#pragma pack_matrix(row_major)
struct std_rm__Surf_0
{
    float3 _p;
    float3 _n;
    float3 _v;
    float3 _alb;
    float _rough;
};
#pragma pack_matrix(column_major)
struct std_fp__Surf_0
{
    float3 _p;
    float pad_0;
    float3 _n;
    float pad_1;
    float3 _v;
    float pad_2;
    float3 _alb;
    float _rough;
};
#pragma pack_matrix(row_major)
struct std_rm_fp__Surf_0
{
    float3 _p;
    float pad_3;
    float3 _n;
    float pad_4;
    float3 _v;
    float pad_5;
    float3 _alb;
    float _rough;
};
#pragma pack_matrix(column_major)
float float_ctor_int(int x0)
{
    return float(x0);
}
float3 vec3_ctor(float x0)
{
    return float3(x0, x0, x0);
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
int2 ivec2_ctor_int_int(int x0, int x1)
{
    return int2(x0, x1);
}
// Uniforms

uniform float4 _uBoxMin[24] : register(c0);
uniform float4 _uBoxMax[24] : register(c24);
uniform float4 _uBoxMat[24] : register(c48);
uniform int _uNumBoxes : register(c72);
uniform float3 _uCamPos : register(c73);
uniform float _uExposure : register(c74);
static const uint _uLights = 0;
static const uint _uGPos = 1;
static const uint _uGNrm = 2;
static const uint _uIn = 3;
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
;
bool f_occluded(in float3 _ro_3040, in float3 _rd_3041, in float _tmax_3042)
{
float3 _inv_3043 = (1.0 / _rd_3041);
{ for(int _i_3044 = {0}; (_i_3044 < 24); (_i_3044++))
{
if ((_i_3044 >= _uNumBoxes))
{
break;
}
float3 _t0_3045 = ((_uBoxMin[int_ctor(clamp(float_ctor_int(_i_3044), 0.0, 23.0))].xyz - _ro_3040) * _inv_3043);
float3 _t1_3046 = ((_uBoxMax[int_ctor(clamp(float_ctor_int(_i_3044), 0.0, 23.0))].xyz - _ro_3040) * _inv_3043);
float3 _tn_3047 = min(_t0_3045, _t1_3046);
float3 _tf_3048 = max(_t0_3045, _t1_3046);
float _n_3049 = max(max(_tn_3047.x, _tn_3047.y), _tn_3047.z);
float _f_3050 = min(min(_tf_3048.x, _tf_3048.y), _tf_3048.z);
bool sc45 = (_n_3049 <= _f_3050);
if (sc45)
{
(sc45 = (_f_3050 > 9.99999975e-05));
}
bool sc44 = sc45;
if (sc44)
{
(sc44 = (_n_3049 < _tmax_3042));
}
if (sc44)
{
return true;
}
}
}
return false;
}
float f_hash12(in float2 _p_3052)
{
float3 _q_3053 = frac((vec3_ctor(_p_3052.xyx) * 0.103100002));
(_q_3053 += dot(_q_3053, (_q_3053.yzx + 33.3300018)));
return frac(((_q_3053.x + _q_3053.y) * _q_3053.z));
}
float f_vnoise(in float2 _p_3055)
{
float2 _i_3056 = floor(_p_3055);
float2 _f_3057 = frac(_p_3055);
float2 _u_3058 = ((_f_3057 * _f_3057) * (3.0 - (2.0 * _f_3057)));
return lerp(lerp(f_hash12(_i_3056), f_hash12((_i_3056 + float2(1.0, 0.0))), _u_3058.x), lerp(f_hash12((_i_3056 + float2(0.0, 1.0))), f_hash12((_i_3056 + float2(1.0, 1.0))), _u_3058.x), _u_3058.y);
}
_Surf_0 f_surface_float4_float4(in float4 _g0_3061, in float4 _g1_3062, in float3 _eye_3063)
{
_Surf_0 _s_3064 = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
(_s_3064._p = _g0_3061.xyz);
(_s_3064._n = _g1_3062.xyz);
(_s_3064._v = normalize((_eye_3063 - _s_3064._p)));
int _id_3065 = int_ctor((_g1_3062.w + 0.5));
if ((_id_3065 == 24))
{
float _w_3066 = ((f_vnoise((_s_3064._p.xz * 0.449999988)) * 0.649999976) + (f_vnoise((_s_3064._p.xz * 1.70000005)) * 0.349999994));
float _puddle_3067 = smoothstep(0.550000012, 0.620000005, _w_3066);
(_s_3064._alb = lerp(float3(0.109999999, 0.104999997, 0.100000001), float3(0.0299999993, 0.0299999993, 0.0350000001), _puddle_3067));
(_s_3064._rough = lerp(0.550000012, 0.0599999987, _puddle_3067));
bool sc46 = (abs(_s_3064._p.x) < 0.0700000003);
if (sc46)
{
(sc46 = (frac((_s_3064._p.z * 0.25)) < 0.5));
}
if (sc46)
{
(_s_3064._alb = float3(0.550000012, 0.5, 0.349999994));
(_s_3064._rough = 0.5);
}
}
else
{
float4 _m_3068 = {0.200000003, 0.200000003, 0.200000003, 0.800000012};
{ for(int _i_3069 = {0}; (_i_3069 < 24); (_i_3069++))
{
if ((_i_3069 == _id_3065))
{
(_m_3068 = _uBoxMat[int_ctor(clamp(float_ctor_int(_i_3069), 0.0, 23.0))]);
}
}
}
float _b_3070 = (0.850000024 + (0.300000012 * f_hash12((floor((_s_3064._p.yz * float2(3.0, 1.5))) + floor((_s_3064._p.xy * float2(1.5, 3.0)))))));
(_s_3064._alb = (_m_3068.xyz * _b_3070));
(_s_3064._rough = _m_3068.w);
}
return _s_3064;
}
float f_D_GGX(in float _NoH_3072, in float _a_3073)
{
float _a2_3074 = (_a_3073 * _a_3073);
float _d_3075 = (((_NoH_3072 * _NoH_3072) * (_a2_3074 - 1.0)) + 1.0);
return (_a2_3074 / ((3.14159274 * _d_3075) * _d_3075));
}
float f_G1(in float _NoX_3077, in float _a_3078)
{
float _a2_3079 = (_a_3078 * _a_3078);
return ((2.0 * _NoX_3077) / (_NoX_3077 + sqrt((_a2_3079 + (((1.0 - _a2_3079) * _NoX_3077) * _NoX_3077)))));
}
float3 f_contrib_int__Surf_0(in int _i_3083, in _Surf_0 _s_3084, inout float3 _L_3085, inout float _dist_3086)
{
float4 _a_3087 = gl_texture2DFetch(_uLights, ivec2_ctor_int_int(_i_3083, 0), 0);
float4 _b_3088 = gl_texture2DFetch(_uLights, ivec2_ctor_int_int(_i_3083, 1), 0);
float3 _d_3089 = (_a_3087.xyz - _s_3084._p);
float _d2_3090 = dot(_d_3089, _d_3089);
(_dist_3086 = sqrt(_d2_3090));
(_L_3085 = (_d_3089 / _dist_3086));
float _NoL_3091 = dot(_s_3084._n, _L_3085);
float _NoV_3092 = max(dot(_s_3084._n, _s_3084._v), 9.99999975e-05);
bool sc47 = (_NoL_3091 <= 0.0);
if ((!sc47))
{
(sc47 = (_b_3088.w < 0.5));
}
if (sc47)
{
return float3(0.0, 0.0, 0.0);
}
float3 _H_3093 = normalize((_s_3084._v + _L_3085));
float _NoH_3094 = max(dot(_s_3084._n, _H_3093), 0.0);
float _VoH_3095 = max(dot(_s_3084._v, _H_3093), 0.0);
float _al_3096 = max((_s_3084._rough * _s_3084._rough), 0.00300000003);
float sc49 = (1.0 - _VoH_3095);
float _F_3097 = (0.0399999991 + (0.959999979 * ((((sc49 * sc49) * sc49) * sc49) * sc49)));
float _spec_3098 = ((((f_D_GGX(_NoH_3094, _al_3096) * f_G1(_NoV_3092, _al_3096)) * f_G1(_NoL_3091, _al_3096)) * _F_3097) / ((4.0 * _NoV_3092) * _NoL_3091));
float3 _f_3099 = ((((1.0 - _F_3097) * _s_3084._alb) / 3.14159274) + vec3_ctor(min(_spec_3098, 60.0)));
return (((_f_3099 * _b_3088.xyz) * _NoL_3091) / max(_d2_3090, (((_a_3087.w * _a_3087.w) * 4.0) + 0.0199999996)));
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

int2 _px_3125 = ivec2_ctor(gl_FragCoord.xy);
float4 _g0_3126 = gl_texture2DFetch(_uGPos, _px_3125, 0);
float4 _g1_3127 = gl_texture2DFetch(_uGNrm, _px_3125, 0);
float3 _col_3128 = {0, 0, 0};
if ((_g0_3126.w < 0.0))
{
float _h_3129 = max(_g0_3126.y, 0.0);
(_col_3128 = lerp(float3(0.0500000007, 0.0350000001, 0.0599999987), float3(0.00400000019, 0.00600000005, 0.0179999992), sqrt(_h_3129)));
}
else
{
_Surf_0 _s_3130 = f_surface_float4_float4(_g0_3126, _g1_3127, _uCamPos);
(_col_3128 = (_s_3130._alb * float3(0.00600000005, 0.00700000022, 0.0120000001)));
float4 _r_3131 = gl_texture2DFetch(_uIn, _px_3125, 0);
bool sc48 = (_r_3131.x >= 0.0);
if (sc48)
{
(sc48 = (_r_3131.y > 0.0));
}
if (sc48)
{
int _i_3132 = int_ctor(_r_3131.x);
float3 _L_3133 = {0, 0, 0};
float _d_3134 = {0};
float3 _f_3135 = f_contrib_int__Surf_0(_i_3132, _s_3130, _L_3133, _d_3134);
float _rad_3136 = gl_texture2DFetch(_uLights, ivec2_ctor_int_int(_i_3132, 0), 0).w;
if ((!f_occluded((_s_3130._p + (_s_3130._n * 0.00200000009)), _L_3133, (_d_3134 - _rad_3136))))
{
(_col_3128 += (_f_3135 * _r_3131.y));
}
}
}
(_col_3128 = (float3(1.0, 1.0, 1.0) - exp(((-_col_3128) * _uExposure))));
(out_o = vec4_ctor(pow(_col_3128, float3(0.454545438, 0.454545438, 0.454545438)), 1.0));
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
struct _Surf_0
{
    float3 _p;
    float3 _n;
    float3 _v;
    float3 _alb;
    float _rough;
};
#pragma pack_matrix(row_major)
struct rm__Surf_0
{
    float3 _p;
    float3 _n;
    float3 _v;
    float3 _alb;
    float _rough;
};
#pragma pack_matrix(column_major)
struct std__Surf_0
{
    float3 _p;
    float3 _n;
    float3 _v;
    float3 _alb;
    float _rough;
};
#pragma pack_matrix(row_major)
struct std_rm__Surf_0
{
    float3 _p;
    float3 _n;
    float3 _v;
    float3 _alb;
    float _rough;
};
#pragma pack_matrix(column_major)
struct std_fp__Surf_0
{
    float3 _p;
    float pad_0;
    float3 _n;
    float pad_1;
    float3 _v;
    float pad_2;
    float3 _alb;
    float _rough;
};
#pragma pack_matrix(row_major)
struct std_rm_fp__Surf_0
{
    float3 _p;
    float pad_3;
    float3 _n;
    float pad_4;
    float3 _v;
    float pad_5;
    float3 _alb;
    float _rough;
};
#pragma pack_matrix(column_major)
float float_ctor_int(int x0)
{
    return float(x0);
}
float3 vec3_ctor(float x0)
{
    return float3(x0, x0, x0);
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
int2 ivec2_ctor_int_int(int x0, int x1)
{
    return int2(x0, x1);
}
// Uniforms

uniform float4 _uBoxMin[24] : register(c0);
uniform float4 _uBoxMax[24] : register(c24);
uniform float4 _uBoxMat[24] : register(c48);
uniform int _uNumBoxes : register(c72);
uniform float3 _uCamPos : register(c73);
uniform float _uExposure : register(c74);
static const uint _uLights = 0;
static const uint _uGPos = 1;
static const uint _uGNrm = 2;
static const uint _uIn = 3;
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
;
bool f_occluded(in float3 _ro_3040, in float3 _rd_3041, in float _tmax_3042)
{
float3 _inv_3043 = (1.0 / _rd_3041);
{ for(int _i_3044 = {0}; (_i_3044 < 24); (_i_3044++))
{
if ((_i_3044 >= _uNumBoxes))
{
break;
}
float3 _t0_3045 = ((_uBoxMin[int_ctor(clamp(float_ctor_int(_i_3044), 0.0, 23.0))].xyz - _ro_3040) * _inv_3043);
float3 _t1_3046 = ((_uBoxMax[int_ctor(clamp(float_ctor_int(_i_3044), 0.0, 23.0))].xyz - _ro_3040) * _inv_3043);
float3 _tn_3047 = min(_t0_3045, _t1_3046);
float3 _tf_3048 = max(_t0_3045, _t1_3046);
float _n_3049 = max(max(_tn_3047.x, _tn_3047.y), _tn_3047.z);
float _f_3050 = min(min(_tf_3048.x, _tf_3048.y), _tf_3048.z);
bool sc45 = (_n_3049 <= _f_3050);
if (sc45)
{
(sc45 = (_f_3050 > 9.99999975e-05));
}
bool sc44 = sc45;
if (sc44)
{
(sc44 = (_n_3049 < _tmax_3042));
}
if (sc44)
{
return true;
}
}
}
return false;
}
float f_hash12(in float2 _p_3052)
{
float3 _q_3053 = frac((vec3_ctor(_p_3052.xyx) * 0.103100002));
(_q_3053 += dot(_q_3053, (_q_3053.yzx + 33.3300018)));
return frac(((_q_3053.x + _q_3053.y) * _q_3053.z));
}
float f_vnoise(in float2 _p_3055)
{
float2 _i_3056 = floor(_p_3055);
float2 _f_3057 = frac(_p_3055);
float2 _u_3058 = ((_f_3057 * _f_3057) * (3.0 - (2.0 * _f_3057)));
return lerp(lerp(f_hash12(_i_3056), f_hash12((_i_3056 + float2(1.0, 0.0))), _u_3058.x), lerp(f_hash12((_i_3056 + float2(0.0, 1.0))), f_hash12((_i_3056 + float2(1.0, 1.0))), _u_3058.x), _u_3058.y);
}
_Surf_0 f_surface_float4_float4(in float4 _g0_3061, in float4 _g1_3062, in float3 _eye_3063)
{
_Surf_0 _s_3064 = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
(_s_3064._p = _g0_3061.xyz);
(_s_3064._n = _g1_3062.xyz);
(_s_3064._v = normalize((_eye_3063 - _s_3064._p)));
int _id_3065 = int_ctor((_g1_3062.w + 0.5));
if ((_id_3065 == 24))
{
float _w_3066 = ((f_vnoise((_s_3064._p.xz * 0.449999988)) * 0.649999976) + (f_vnoise((_s_3064._p.xz * 1.70000005)) * 0.349999994));
float _puddle_3067 = smoothstep(0.550000012, 0.620000005, _w_3066);
(_s_3064._alb = lerp(float3(0.109999999, 0.104999997, 0.100000001), float3(0.0299999993, 0.0299999993, 0.0350000001), _puddle_3067));
(_s_3064._rough = lerp(0.550000012, 0.0599999987, _puddle_3067));
bool sc46 = (abs(_s_3064._p.x) < 0.0700000003);
if (sc46)
{
(sc46 = (frac((_s_3064._p.z * 0.25)) < 0.5));
}
if (sc46)
{
(_s_3064._alb = float3(0.550000012, 0.5, 0.349999994));
(_s_3064._rough = 0.5);
}
}
else
{
float4 _m_3068 = {0.200000003, 0.200000003, 0.200000003, 0.800000012};
{ for(int _i_3069 = {0}; (_i_3069 < 24); (_i_3069++))
{
if ((_i_3069 == _id_3065))
{
(_m_3068 = _uBoxMat[int_ctor(clamp(float_ctor_int(_i_3069), 0.0, 23.0))]);
}
}
}
float _b_3070 = (0.850000024 + (0.300000012 * f_hash12((floor((_s_3064._p.yz * float2(3.0, 1.5))) + floor((_s_3064._p.xy * float2(1.5, 3.0)))))));
(_s_3064._alb = (_m_3068.xyz * _b_3070));
(_s_3064._rough = _m_3068.w);
}
return _s_3064;
}
float f_D_GGX(in float _NoH_3072, in float _a_3073)
{
float _a2_3074 = (_a_3073 * _a_3073);
float _d_3075 = (((_NoH_3072 * _NoH_3072) * (_a2_3074 - 1.0)) + 1.0);
return (_a2_3074 / ((3.14159274 * _d_3075) * _d_3075));
}
float f_G1(in float _NoX_3077, in float _a_3078)
{
float _a2_3079 = (_a_3078 * _a_3078);
return ((2.0 * _NoX_3077) / (_NoX_3077 + sqrt((_a2_3079 + (((1.0 - _a2_3079) * _NoX_3077) * _NoX_3077)))));
}
float3 f_contrib_int__Surf_0(in int _i_3083, in _Surf_0 _s_3084, inout float3 _L_3085, inout float _dist_3086)
{
float4 _a_3087 = gl_texture2DFetch(_uLights, ivec2_ctor_int_int(_i_3083, 0), 0);
float4 _b_3088 = gl_texture2DFetch(_uLights, ivec2_ctor_int_int(_i_3083, 1), 0);
float3 _d_3089 = (_a_3087.xyz - _s_3084._p);
float _d2_3090 = dot(_d_3089, _d_3089);
(_dist_3086 = sqrt(_d2_3090));
(_L_3085 = (_d_3089 / _dist_3086));
float _NoL_3091 = dot(_s_3084._n, _L_3085);
float _NoV_3092 = max(dot(_s_3084._n, _s_3084._v), 9.99999975e-05);
bool sc47 = (_NoL_3091 <= 0.0);
if ((!sc47))
{
(sc47 = (_b_3088.w < 0.5));
}
if (sc47)
{
return float3(0.0, 0.0, 0.0);
}
float3 _H_3093 = normalize((_s_3084._v + _L_3085));
float _NoH_3094 = max(dot(_s_3084._n, _H_3093), 0.0);
float _VoH_3095 = max(dot(_s_3084._v, _H_3093), 0.0);
float _al_3096 = max((_s_3084._rough * _s_3084._rough), 0.00300000003);
float sc49 = (1.0 - _VoH_3095);
float _F_3097 = (0.0399999991 + (0.959999979 * ((((sc49 * sc49) * sc49) * sc49) * sc49)));
float _spec_3098 = ((((f_D_GGX(_NoH_3094, _al_3096) * f_G1(_NoV_3092, _al_3096)) * f_G1(_NoL_3091, _al_3096)) * _F_3097) / ((4.0 * _NoV_3092) * _NoL_3091));
float3 _f_3099 = ((((1.0 - _F_3097) * _s_3084._alb) / 3.14159274) + vec3_ctor(min(_spec_3098, 60.0)));
return (((_f_3099 * _b_3088.xyz) * _NoL_3091) / max(_d2_3090, (((_a_3087.w * _a_3087.w) * 4.0) + 0.0199999996)));
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

int2 _px_3125 = ivec2_ctor(gl_FragCoord.xy);
float4 _g0_3126 = gl_texture2DFetch(_uGPos, _px_3125, 0);
float4 _g1_3127 = gl_texture2DFetch(_uGNrm, _px_3125, 0);
float3 _col_3128 = {0, 0, 0};
if ((_g0_3126.w < 0.0))
{
float _h_3129 = max(_g0_3126.y, 0.0);
(_col_3128 = lerp(float3(0.0500000007, 0.0350000001, 0.0599999987), float3(0.00400000019, 0.00600000005, 0.0179999992), sqrt(_h_3129)));
}
else
{
_Surf_0 _s_3130 = f_surface_float4_float4(_g0_3126, _g1_3127, _uCamPos);
(_col_3128 = (_s_3130._alb * float3(0.00600000005, 0.00700000022, 0.0120000001)));
float4 _r_3131 = gl_texture2DFetch(_uIn, _px_3125, 0);
bool sc48 = (_r_3131.x >= 0.0);
if (sc48)
{
(sc48 = (_r_3131.y > 0.0));
}
if (sc48)
{
int _i_3132 = int_ctor(_r_3131.x);
float3 _L_3133 = {0, 0, 0};
float _d_3134 = {0};
float3 _f_3135 = f_contrib_int__Surf_0(_i_3132, _s_3130, _L_3133, _d_3134);
float _rad_3136 = gl_texture2DFetch(_uLights, ivec2_ctor_int_int(_i_3132, 0), 0).w;
if ((!f_occluded((_s_3130._p + (_s_3130._n * 0.00200000009)), _L_3133, (_d_3134 - _rad_3136))))
{
(_col_3128 += (_f_3135 * _r_3131.y));
}
}
}
(_col_3128 = (float3(1.0, 1.0, 1.0) - exp(((-_col_3128) * _uExposure))));
(out_o = vec4_ctor(pow(_col_3128, float3(0.454545438, 0.454545438, 0.454545438)), 1.0));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
