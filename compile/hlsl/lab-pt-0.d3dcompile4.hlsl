struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 gl_FragCoord : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
struct _Hit_0
{
    float _t;
    float3 _n;
    int _id;
};
#pragma pack_matrix(row_major)
struct rm__Hit_0
{
    float _t;
    float3 _n;
    int _id;
};
#pragma pack_matrix(column_major)
struct std__Hit_0
{
    float _t;
    float pad_0;
    float pad_1;
    float pad_2;
    float3 _n;
    int _id;
};
#pragma pack_matrix(row_major)
struct std_rm__Hit_0
{
    float _t;
    float pad_3;
    float pad_4;
    float pad_5;
    float3 _n;
    int _id;
};
#pragma pack_matrix(column_major)
struct std_fp__Hit_0
{
    float _t;
    float pad_6;
    float pad_7;
    float pad_8;
    float3 _n;
    int _id;
};
#pragma pack_matrix(row_major)
struct std_rm_fp__Hit_0
{
    float _t;
    float pad_9;
    float pad_10;
    float pad_11;
    float3 _n;
    int _id;
};
#pragma pack_matrix(column_major)
struct _Mat_0
{
    float3 _albedo;
    float _rough;
    float _metal;
    float _trans;
    float _ior;
};
#pragma pack_matrix(row_major)
struct rm__Mat_0
{
    float3 _albedo;
    float _rough;
    float _metal;
    float _trans;
    float _ior;
};
#pragma pack_matrix(column_major)
struct std__Mat_0
{
    float3 _albedo;
    float _rough;
    float _metal;
    float _trans;
    float _ior;
};
#pragma pack_matrix(row_major)
struct std_rm__Mat_0
{
    float3 _albedo;
    float _rough;
    float _metal;
    float _trans;
    float _ior;
};
#pragma pack_matrix(column_major)
struct std_fp__Mat_0
{
    float3 _albedo;
    float _rough;
    float _metal;
    float _trans;
    float _ior;
    float pad_12;
};
#pragma pack_matrix(row_major)
struct std_rm_fp__Mat_0
{
    float3 _albedo;
    float _rough;
    float _metal;
    float _trans;
    float _ior;
    float pad_13;
};
#pragma pack_matrix(column_major)
float float_ctor_int(int x0)
{
    return float(x0);
}
float float_ctor_uint(uint x0)
{
    return float(x0);
}
float2 vec2_ctor(float x0)
{
    return float2(x0, x0);
}
float2 vec2_ctor(float x0, float x1)
{
    return float2(x0, x1);
}
float3 vec3_ctor(float x0, float x1, float x2)
{
    return float3(x0, x1, x2);
}
float3x3 mat3_ctor(float x0, float x1, float x2, float x3, float x4, float x5, float x6, float x7, float x8)
{
    return float3x3(x0, x1, x2, x3, x4, x5, x6, x7, x8);
}
float4 vec4_ctor(float x0, float x1, float x2, float x3)
{
    return float4(x0, x1, x2, x3);
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
uint uint_ctor(float x0)
{
    return uint(x0);
}
uint uint_ctor_int(int x0)
{
    return uint(x0);
}
// Uniforms

uniform float _uBlend : register(c0);
uniform int _uFrame : register(c1);
uniform float2 _uRes : register(c2);
uniform float3 _uCamPos : register(c3);
uniform float3 _uCamFwd : register(c4);
uniform float3 _uCamRight : register(c5);
uniform float3 _uCamUp : register(c6);
uniform float _uTanHalf : register(c7);
uniform float _uAperture : register(c8);
uniform float _uFocus : register(c9);
uniform int _uBounces : register(c10);
uniform int _uMode : register(c11);
uniform float _uLightHalf : register(c12);
uniform float _uLightPower : register(c13);
uniform float4 _uObjA[4] : register(c14);
uniform float4 _uObjB[4] : register(c18);
uniform float4 _uMatA[4] : register(c22);
uniform float4 _uMatB[4] : register(c26);
static const uint _uPrev = 0;
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

static float4 out_oAccum = {0, 0, 0, 0};
static float4 out_oND = {0, 0, 0, 0};
static float4 out_oAlb = {0, 0, 0, 0};
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
float mod_emu(float x, float y)
{
    return x - y * floor(x / y);
}


float dyn_index_vec3_int(in float3 base, in int index)
{
switch (index) {
case (0):
return base[0];
case (1):
return base[1];
case (2):
return base[2];
default:
break;
}
if ((index < 0))
{
return base[0];
}
{
return base[2];
}
}
;
;
static uint _seed_3023 = {0};
uint f_pcg_uint(in uint _v_3025)
{
uint _s_3026 = ((_v_3025 * 747796405) + 2891336453);
uint _w_3027 = (((_s_3026 >> ((_s_3026 >> 28) + 4)) ^ _s_3026) * 277803737);
return ((_w_3027 >> 22) ^ _w_3027);
}
float f_rnd()
{
(_seed_3023 = f_pcg_uint(_seed_3023));
return (float_ctor_uint(_seed_3023) * 2.32830644e-10);
}
void f_sphere_int__Hit_0(in float3 _ro_3032, in float3 _rd_3033, in float3 _c_3034, in float _r_3035, in int _id_3036, inout _Hit_0 _h_3037)
{
float3 _oc_3038 = (_ro_3032 - _c_3034);
float _b_3039 = dot(_oc_3038, _rd_3033);
float _cc_3040 = (dot(_oc_3038, _oc_3038) - (_r_3035 * _r_3035));
float _disc_3041 = ((_b_3039 * _b_3039) - _cc_3040);
if ((_disc_3041 < 0.0))
{
return;
}
float _s_3042 = sqrt(_disc_3041);
float _t_3043 = ((-_b_3039) - _s_3042);
if ((_t_3043 < 9.99999975e-05))
{
(_t_3043 = ((-_b_3039) + _s_3042));
}
bool scb9 = (_t_3043 > 9.99999975e-05);
if (scb9)
{
(scb9 = (_t_3043 < _h_3037._t));
}
if (scb9)
{
(_h_3037._t = _t_3043);
(_h_3037._n = (((_ro_3032 + (_rd_3033 * _t_3043)) - _c_3034) / _r_3035));
(_h_3037._id = _id_3036);
}
}
void f_box_int__Hit_0(in float3 _ro_3045, in float3 _rd_3046, in float3 _c_3047, in float3 _he_3048, in float _a_3049, in int _id_3050, inout _Hit_0 _h_3051)
{
float _ca_3052 = cos(_a_3049);
float _sa_3053 = sin(_a_3049);
float3x3 _R_3054 = mat3_ctor(_ca_3052, 0.0, (-_sa_3053), 0.0, 1.0, 0.0, _sa_3053, 0.0, _ca_3052);
float3 _o_3055 = mul(transpose(transpose(_R_3054)), (_ro_3045 - _c_3047));
float3 _d_3056 = mul(transpose(transpose(_R_3054)), _rd_3046);
float3 _inv_3057 = (1.0 / _d_3056);
float3 _t0_3058 = (((-_he_3048) - _o_3055) * _inv_3057);
float3 _t1_3059 = ((_he_3048 - _o_3055) * _inv_3057);
float3 _tn_3060 = min(_t0_3058, _t1_3059);
float3 _tf_3061 = max(_t0_3058, _t1_3059);
float _n_3062 = max(max(_tn_3060.x, _tn_3060.y), _tn_3060.z);
float _f_3063 = min(min(_tf_3061.x, _tf_3061.y), _tf_3061.z);
bool scba = (_n_3062 > _f_3063);
if ((!scba))
{
(scba = (_f_3063 < 9.99999975e-05));
}
if (scba)
{
return;
}
float scbb = {0};
if ((_n_3062 > 9.99999975e-05))
{
(scbb = _n_3062);
}
else
{
(scbb = _f_3063);
}
float _t_3064 = scbb;
if ((_t_3064 >= _h_3051._t))
{
return;
}
float3 _p_3065 = ((_o_3055 + (_d_3056 * _t_3064)) / _he_3048);
float3 _ap_3066 = abs(_p_3065);
float3 _nl_3067 = {0, 0, 0};
bool scbc = (_ap_3066.x > _ap_3066.y);
if (scbc)
{
(scbc = (_ap_3066.x > _ap_3066.z));
}
if (scbc)
{
(_nl_3067 = vec3_ctor(sign(_p_3065.x), 0.0, 0.0));
}
else
{
if ((_ap_3066.y > _ap_3066.z))
{
(_nl_3067 = vec3_ctor(0.0, sign(_p_3065.y), 0.0));
}
else
{
(_nl_3067 = vec3_ctor(0.0, 0.0, sign(_p_3065.z)));
}
}
(_h_3051._t = _t_3064);
(_h_3051._n = mul(transpose(_R_3054), _nl_3067));
(_h_3051._id = _id_3050);
}
void f_rect_int_int__Hit_0(in float3 _ro_3069, in float3 _rd_3070, in int _axis_3071, in float _c_3072, in float2 _lo_3073, in float2 _hi_3074, in float3 _n_3075, in int _id_3076, inout _Hit_0 _h_3077)
{
float _d_3078 = dyn_index_vec3_int(_rd_3070, int_ctor(clamp(float_ctor_int(_axis_3071), 0.0, 2.0)));
if ((abs(_d_3078) < 1.00000001e-07))
{
return;
}
float _t_3079 = ((_c_3072 - dyn_index_vec3_int(_ro_3069, int_ctor(clamp(float_ctor_int(_axis_3071), 0.0, 2.0)))) / _d_3078);
bool scbd = (_t_3079 < 9.99999975e-05);
if ((!scbd))
{
(scbd = (_t_3079 >= _h_3077._t));
}
if (scbd)
{
return;
}
float3 _p_3080 = (_ro_3069 + (_rd_3070 * _t_3079));
float2 scbe = {0, 0};
if ((_axis_3071 == 0))
{
(scbe = _p_3080.yz);
}
else
{
float2 scbf = {0, 0};
if ((_axis_3071 == 1))
{
(scbf = _p_3080.xz);
}
else
{
(scbf = _p_3080.xy);
}
(scbe = scbf);
}
float2 _q_3081 = scbe;
bool scc0 = any((_q_3081 < _lo_3073));
if ((!scc0))
{
(scc0 = any((_q_3081 > _hi_3074)));
}
if (scc0)
{
return;
}
(_h_3077._t = _t_3079);
(_h_3077._n = _n_3075);
(_h_3077._id = _id_3076);
}
_Hit_0 f_trace(in float3 _ro_3083, in float3 _rd_3084, in bool _withLight_3085)
{
_Hit_0 _h_3086 = {0, 0, 0, 0, 0};
(_h_3086._t = 1000000000.0);
(_h_3086._id = -1);
{ for(int _i_3087 = {0}; (_i_3087 < 4); (_i_3087++))
{
if ((_uObjA[int_ctor(clamp(float_ctor_int(_i_3087), 0.0, 3.0))].w < 0.5))
{
f_sphere_int__Hit_0(_ro_3083, _rd_3084, _uObjA[int_ctor(clamp(float_ctor_int(_i_3087), 0.0, 3.0))].xyz, _uObjB[int_ctor(clamp(float_ctor_int(_i_3087), 0.0, 3.0))].x, _i_3087, _h_3086);
}
else
{
f_box_int__Hit_0(_ro_3083, _rd_3084, _uObjA[int_ctor(clamp(float_ctor_int(_i_3087), 0.0, 3.0))].xyz, _uObjB[int_ctor(clamp(float_ctor_int(_i_3087), 0.0, 3.0))].xyz, _uObjB[int_ctor(clamp(float_ctor_int(_i_3087), 0.0, 3.0))].w, _i_3087, _h_3086);
}
}
}
f_rect_int_int__Hit_0(_ro_3083, _rd_3084, 1, 0.0, float2(-1.0, -1.0), float2(1.0, 1.0), float3(0.0, 1.0, 0.0), 4, _h_3086);
f_rect_int_int__Hit_0(_ro_3083, _rd_3084, 1, 2.0, float2(-1.0, -1.0), float2(1.0, 1.0), float3(0.0, -1.0, 0.0), 5, _h_3086);
f_rect_int_int__Hit_0(_ro_3083, _rd_3084, 2, -1.0, float2(-1.0, 0.0), float2(1.0, 2.0), float3(0.0, 0.0, 1.0), 6, _h_3086);
f_rect_int_int__Hit_0(_ro_3083, _rd_3084, 0, -1.0, float2(0.0, -1.0), float2(2.0, 1.0), float3(1.0, 0.0, 0.0), 7, _h_3086);
f_rect_int_int__Hit_0(_ro_3083, _rd_3084, 0, 1.0, float2(0.0, -1.0), float2(2.0, 1.0), float3(-1.0, 0.0, 0.0), 8, _h_3086);
if (_withLight_3085)
{
f_rect_int_int__Hit_0(_ro_3083, _rd_3084, 1, 1.995, vec2_ctor((-_uLightHalf)), vec2_ctor(_uLightHalf), float3(0.0, -1.0, 0.0), 9, _h_3086);
}
return _h_3086;
}
_Mat_0 f_material_int(in int _id_3089, in float3 _p_3090)
{
_Mat_0 _m_3091 = {0, 0, 0, 0, 0, 0, 0};
(_m_3091._rough = 1.0);
(_m_3091._metal = 0.0);
(_m_3091._trans = 0.0);
(_m_3091._ior = 1.5);
{ for(int _i_3092 = {0}; (_i_3092 < 4); (_i_3092++))
{
if ((_i_3092 == _id_3089))
{
(_m_3091._albedo = _uMatA[int_ctor(clamp(float_ctor_int(_i_3092), 0.0, 3.0))].xyz);
(_m_3091._rough = _uMatA[int_ctor(clamp(float_ctor_int(_i_3092), 0.0, 3.0))].w);
(_m_3091._metal = _uMatB[int_ctor(clamp(float_ctor_int(_i_3092), 0.0, 3.0))].x);
(_m_3091._trans = _uMatB[int_ctor(clamp(float_ctor_int(_i_3092), 0.0, 3.0))].y);
(_m_3091._ior = _uMatB[int_ctor(clamp(float_ctor_int(_i_3092), 0.0, 3.0))].z);
}
}
}
if ((_id_3089 == 4))
{
float _c_3093 = mod_emu((floor((_p_3090.x * 4.0)) + floor((_p_3090.z * 4.0))), 2.0);
(_m_3091._albedo = lerp(float3(0.720000029, 0.720000029, 0.720000029), float3(0.550000012, 0.550000012, 0.550000012), _c_3093));
(_m_3091._rough = 0.349999994);
}
else
{
bool scc1 = (_id_3089 == 5);
if ((!scc1))
{
(scc1 = (_id_3089 == 6));
}
if (scc1)
{
(_m_3091._albedo = float3(0.730000019, 0.730000019, 0.730000019));
}
else
{
if ((_id_3089 == 7))
{
(_m_3091._albedo = float3(0.649999976, 0.0599999987, 0.0500000007));
}
else
{
if ((_id_3089 == 8))
{
(_m_3091._albedo = float3(0.119999997, 0.449999988, 0.150000006));
}
}
}
}
return _m_3091;
}
void f_onb(in float3 _n_3095, inout float3 _t_3096, inout float3 _b_3097)
{
float scc2 = {0};
if ((_n_3095.z >= 0.0))
{
(scc2 = 1.0);
}
else
{
(scc2 = -1.0);
}
float _s_3098 = scc2;
float _a_3099 = (-1.0 / (_s_3098 + _n_3095.z));
float _c_3100 = ((_n_3095.x * _n_3095.y) * _a_3099);
(_t_3096 = vec3_ctor((1.0 + (((_s_3098 * _n_3095.x) * _n_3095.x) * _a_3099)), (_s_3098 * _c_3100), ((-_s_3098) * _n_3095.x)));
(_b_3097 = vec3_ctor(_c_3100, (_s_3098 + ((_n_3095.y * _n_3095.y) * _a_3099)), (-_n_3095.y)));
}
float f_D_GGX(in float _NoH_3102, in float _a_3103)
{
float _a2_3104 = (_a_3103 * _a_3103);
float _d_3105 = (((_NoH_3102 * _NoH_3102) * (_a2_3104 - 1.0)) + 1.0);
return (_a2_3104 / ((3.14159274 * _d_3105) * _d_3105));
}
float f_G1(in float _NoX_3107, in float _a_3108)
{
float _a2_3109 = (_a_3108 * _a_3108);
return ((2.0 * _NoX_3107) / (_NoX_3107 + sqrt((_a2_3109 + (((1.0 - _a2_3109) * _NoX_3107) * _NoX_3107)))));
}
float3 f_fresnel(in float3 _F0_3111, in float _c_3112)
{
float scce = (1.0 - _c_3112);
return (_F0_3111 + ((1.0 - _F0_3111) * ((((scce * scce) * scce) * scce) * scce)));
}
float f_lum(in float3 _c_3114)
{
return dot(_c_3114, float3(0.212599993, 0.715200007, 0.0722000003));
}
float3 f_sampleVNDF(in float3 _Ve_3116, in float _a_3117)
{
float3 _Vh_3118 = normalize(vec3_ctor((_a_3117 * _Ve_3116.x), (_a_3117 * _Ve_3116.y), _Ve_3116.z));
float _l2_3119 = ((_Vh_3118.x * _Vh_3118.x) + (_Vh_3118.y * _Vh_3118.y));
float3 scc3 = {0, 0, 0};
if ((_l2_3119 > 0.0))
{
(scc3 = (vec3_ctor((-_Vh_3118.y), _Vh_3118.x, 0.0) * rsqrt(_l2_3119)));
}
else
{
(scc3 = float3(1.0, 0.0, 0.0));
}
float3 _T1_3120 = scc3;
float3 _T2_3121 = cross(_Vh_3118, _T1_3120);
float _r_3122 = sqrt(f_rnd());
float _phi_3123 = (6.28318548 * f_rnd());
float _t1_3124 = (_r_3122 * cos(_phi_3123));
float _t2_3125 = (_r_3122 * sin(_phi_3123));
float _s_3126 = (0.5 * (1.0 + _Vh_3118.z));
(_t2_3125 = (((1.0 - _s_3126) * sqrt((1.0 - (_t1_3124 * _t1_3124)))) + (_s_3126 * _t2_3125)));
float3 _Nh_3127 = (((_t1_3124 * _T1_3120) + (_t2_3125 * _T2_3121)) + (sqrt(max(0.0, ((1.0 - (_t1_3124 * _t1_3124)) - (_t2_3125 * _t2_3125)))) * _Vh_3118));
return normalize(vec3_ctor((_a_3117 * _Nh_3127.x), (_a_3117 * _Nh_3127.y), max(0.0, _Nh_3127.z)));
}
float f_alphaOf__Mat_0(in _Mat_0 _m_3129)
{
return max((_m_3129._rough * _m_3129._rough), 0.00249999994);
}
float f_specProb__Mat_0(in _Mat_0 _m_3131, in float _NoV_3132)
{
float3 _F0_3133 = lerp(float3(0.0399999991, 0.0399999991, 0.0399999991), _m_3131._albedo, _m_3131._metal);
float _s_3134 = f_lum(f_fresnel(_F0_3133, _NoV_3132));
float _d_3135 = ((1.0 - _m_3131._metal) * f_lum(_m_3131._albedo));
return clamp((_s_3134 / ((_s_3134 + _d_3135) + 9.99999975e-05)), 0.100000001, 0.949999988);
}
float3 f_evalBSDF__Mat_0(in _Mat_0 _m_3137, in float3 _n_3138, in float3 _V_3139, in float3 _L_3140)
{
float _NoV_3141 = max(dot(_n_3138, _V_3139), 9.99999975e-05);
float _NoL_3142 = max(dot(_n_3138, _L_3140), 9.99999975e-05);
float3 _H_3143 = normalize((_V_3139 + _L_3140));
float _NoH_3144 = max(dot(_n_3138, _H_3143), 0.0);
float _VoH_3145 = max(dot(_V_3139, _H_3143), 0.0);
float _a_3146 = f_alphaOf__Mat_0(_m_3137);
float3 _F0_3147 = lerp(float3(0.0399999991, 0.0399999991, 0.0399999991), _m_3137._albedo, _m_3137._metal);
float3 _F_3148 = f_fresnel(_F0_3147, _VoH_3145);
float3 _spec_3149 = ((((f_D_GGX(_NoH_3144, _a_3146) * f_G1(_NoV_3141, _a_3146)) * f_G1(_NoL_3142, _a_3146)) * _F_3148) / ((4.0 * _NoV_3141) * _NoL_3142));
float3 _diff_3150 = ((((1.0 - _F_3148) * (1.0 - _m_3137._metal)) * _m_3137._albedo) / 3.14159274);
return (_diff_3150 + _spec_3149);
}
float f_pdfBSDF__Mat_0(in _Mat_0 _m_3152, in float3 _n_3153, in float3 _V_3154, in float3 _L_3155)
{
float _NoV_3156 = max(dot(_n_3153, _V_3154), 9.99999975e-05);
float _NoL_3157 = dot(_n_3153, _L_3155);
if ((_NoL_3157 <= 0.0))
{
return 0.0;
}
float3 _H_3158 = normalize((_V_3154 + _L_3155));
float _a_3159 = f_alphaOf__Mat_0(_m_3152);
float _ps_3160 = f_specProb__Mat_0(_m_3152, _NoV_3156);
float _pSpec_3161 = ((f_D_GGX(max(dot(_n_3153, _H_3158), 0.0), _a_3159) * f_G1(_NoV_3156, _a_3159)) / (4.0 * _NoV_3156));
return ((_ps_3160 * _pSpec_3161) + (((1.0 - _ps_3160) * _NoL_3157) / 3.14159274));
}
float3 f_sampleBSDF__Mat_0(in _Mat_0 _m_3163, in float3 _n_3164, in float3 _V_3165)
{
float3 _t_3166 = {0, 0, 0};
float3 _b_3167 = {0, 0, 0};
f_onb(_n_3164, _t_3166, _b_3167);
float _NoV_3168 = max(dot(_n_3164, _V_3165), 9.99999975e-05);
if ((f_rnd() < f_specProb__Mat_0(_m_3163, _NoV_3168)))
{
float3 _Ve_3169 = vec3_ctor(dot(_V_3165, _t_3166), dot(_V_3165, _b_3167), dot(_V_3165, _n_3164));
float3 _Hl_3170 = f_sampleVNDF(_Ve_3169, f_alphaOf__Mat_0(_m_3163));
float3 _H_3171 = (((_Hl_3170.x * _t_3166) + (_Hl_3170.y * _b_3167)) + (_Hl_3170.z * _n_3164));
return reflect((-_V_3165), _H_3171);
}
float _r_3172 = sqrt(f_rnd());
float _phi_3173 = (6.28318548 * f_rnd());
return normalize(((((_r_3172 * cos(_phi_3173)) * _t_3166) + ((_r_3172 * sin(_phi_3173)) * _b_3167)) + (sqrt(max(0.0, (1.0 - (_r_3172 * _r_3172)))) * _n_3164)));
}
float f_fresnelDielectric(in float _cosi_3175, in float _eta_3176)
{
float _s2_3177 = ((_eta_3176 * _eta_3176) * (1.0 - (_cosi_3175 * _cosi_3175)));
if ((_s2_3177 > 1.0))
{
return 1.0;
}
float _cost_3178 = sqrt((1.0 - _s2_3177));
float _rs_3179 = (((_eta_3176 * _cosi_3175) - _cost_3178) / ((_eta_3176 * _cosi_3175) + _cost_3178));
float _rp_3180 = ((_cosi_3175 - (_eta_3176 * _cost_3178)) / (_cosi_3175 + (_eta_3176 * _cost_3178)));
return (0.5 * ((_rs_3179 * _rs_3179) + (_rp_3180 * _rp_3180)));
}
float3 f_clampIndirect_int(in float3 _c_3182, in int _depth_3183)
{
if ((_depth_3183 == 0))
{
return _c_3182;
}
float _l_3184 = f_lum(_c_3182);
float3 scc4 = {0, 0, 0};
if ((_l_3184 > 3.0))
{
(scc4 = (_c_3182 * (3.0 / _l_3184)));
}
else
{
(scc4 = _c_3182);
}
return scc4;
}
float f_encId_int_int(in int _rep_3186, in int _prim_3187)
{
return (float_ctor_int((_rep_3186 + 1)) + (16.0 * float_ctor_int((_prim_3187 + 1))));
}
void f_gbuffer_float4_float4(inout float4 _nd_3189, inout float4 _alb_3190)
{
float2 _s_3191 = ((((2.0 * gl_FragCoord.xy) - _uRes) / _uRes.y) * _uTanHalf);
float3 _ro_3192 = _uCamPos;
float3 _rd_3193 = normalize(((_uCamFwd + (_s_3191.x * _uCamRight)) + (_s_3191.y * _uCamUp)));
int _prim_3194 = {-1};
float _dist_3195 = {0.0};
(_nd_3189 = vec4_ctor((-_rd_3193), 1000.0));
(_alb_3190 = vec4_ctor(1.0, 1.0, 1.0, f_encId_int_int(-1, -1)));
{ for(int _k_3196 = {0}; (_k_3196 < 4); (_k_3196++))
{
_Hit_0 _h_3197 = f_trace(_ro_3192, _rd_3193, true);
if ((_h_3197._id < 0))
{
(_alb_3190.w = f_encId_int_int(-1, _prim_3194));
return;
}
if ((_k_3196 == 0))
{
(_prim_3194 = _h_3197._id);
}
float3 _p_3198 = (_ro_3192 + (_rd_3193 * _h_3197._t));
(_dist_3195 += _h_3197._t);
bool _front_3199 = (dot(_h_3197._n, _rd_3193) < 0.0);
float3 scc5 = {0, 0, 0};
if (_front_3199)
{
(scc5 = _h_3197._n);
}
else
{
(scc5 = (-_h_3197._n));
}
float3 _n_3200 = scc5;
if ((_h_3197._id == 9))
{
(_nd_3189 = vec4_ctor(_n_3200, _dist_3195));
(_alb_3190 = vec4_ctor(1.0, 1.0, 1.0, f_encId_int_int(9, _prim_3194)));
return;
}
_Mat_0 _m_3201 = f_material_int(_h_3197._id, _p_3198);
if ((_m_3201._trans > 0.5))
{
float scc6 = {0};
if (_front_3199)
{
(scc6 = (1.0 / _m_3201._ior));
}
else
{
(scc6 = _m_3201._ior);
}
float3 _r_3202 = refract(_rd_3193, _n_3200, scc6);
float3 scc7 = {0, 0, 0};
if ((dot(_r_3202, _r_3202) > 0.0))
{
(scc7 = _r_3202);
}
else
{
(scc7 = reflect(_rd_3193, _n_3200));
}
(_rd_3193 = scc7);
(_ro_3192 = (_p_3198 + (_rd_3193 * 0.00100000005)));
continue;
}
(_nd_3189 = vec4_ctor(_n_3200, _dist_3195));
(_alb_3190 = vec4_ctor(max(_m_3201._albedo, float3(0.0299999993, 0.0299999993, 0.0299999993)), f_encId_int_int(_h_3197._id, _prim_3194)));
return;
}
}
}
struct PS_OUTPUT
{
    float4 out_oAccum : SV_TARGET0;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_oAccum = out_oAccum;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;

(_seed_3023 = f_pcg_uint((uint_ctor(gl_FragCoord.x) + f_pcg_uint((uint_ctor(gl_FragCoord.y) + f_pcg_uint(uint_ctor_int(_uFrame)))))));
float2 _px_3204 = ((gl_FragCoord.xy + vec2_ctor(f_rnd(), f_rnd())) - 0.5);
float2 _s_3205 = ((((2.0 * _px_3204) - _uRes) / _uRes.y) * _uTanHalf);
float3 _dir_3206 = normalize(((_uCamFwd + (_s_3205.x * _uCamRight)) + (_s_3205.y * _uCamUp)));
float3 _ro_3207 = _uCamPos;
if ((_uAperture > 0.0))
{
float3 _fp_3208 = (_ro_3207 + (_dir_3206 * (_uFocus / dot(_dir_3206, _uCamFwd))));
float _r_3209 = (_uAperture * sqrt(f_rnd()));
float _ph_3210 = (6.28318548 * f_rnd());
(_ro_3207 += (((cos(_ph_3210) * _uCamRight) + (sin(_ph_3210) * _uCamUp)) * _r_3209));
(_dir_3206 = normalize((_fp_3208 - _ro_3207)));
}
float3 _rd_3211 = _dir_3206;
float _area_3212 = ((4.0 * _uLightHalf) * _uLightHalf);
float3 _Le_3213 = ((float3(1.0, 0.860000014, 0.680000007) * _uLightPower) / _area_3212);
float3 _L_out_3214 = {0.0, 0.0, 0.0};
float3 _thr_3215 = {1.0, 1.0, 1.0};
bool _lastDelta_3216 = {true};
float _lastPdf_3217 = {0.0};
float4 _gND_3218 = {0, 0, 0, 0};
float4 _gAlb_3219 = {0, 0, 0, 0};
f_gbuffer_float4_float4(_gND_3218, _gAlb_3219);
{ for(int _depth_3220 = {0}; (_depth_3220 < 9); (_depth_3220++))
{
if ((_depth_3220 > _uBounces))
{
break;
}
_Hit_0 _h_3221 = f_trace(_ro_3207, _rd_3211, true);
if ((_h_3221._id < 0))
{
(_L_out_3214 += (_thr_3215 * float3(0.0199999996, 0.0250000004, 0.0350000001)));
break;
}
float3 _p_3222 = (_ro_3207 + (_rd_3211 * _h_3221._t));
if ((_h_3221._id == 9))
{
float _w_3223 = {1.0};
if ((!_lastDelta_3216))
{
if ((_uMode == 1))
{
(_w_3223 = 0.0);
}
else
{
if ((_uMode == 2))
{
float _cosL_3224 = max(_rd_3211.y, 9.99999975e-05);
float _pl_3225 = ((_h_3221._t * _h_3221._t) / (_cosL_3224 * _area_3212));
(_w_3223 = ((_lastPdf_3217 * _lastPdf_3217) / ((_lastPdf_3217 * _lastPdf_3217) + (_pl_3225 * _pl_3225))));
}
}
}
if ((_rd_3211.y > 0.0))
{
(_L_out_3214 += f_clampIndirect_int(((_thr_3215 * _Le_3213) * _w_3223), _depth_3220));
}
break;
}
_Mat_0 _m_3226 = f_material_int(_h_3221._id, _p_3222);
bool _front_3227 = (dot(_h_3221._n, _rd_3211) < 0.0);
float3 scc8 = {0, 0, 0};
if (_front_3227)
{
(scc8 = _h_3221._n);
}
else
{
(scc8 = (-_h_3221._n));
}
float3 _n_3228 = scc8;
if ((_m_3226._trans > 0.5))
{
float3 _hn_3229 = _n_3228;
if ((_m_3226._rough > 0.0199999996))
{
float3 _t_3230 = {0, 0, 0};
float3 _b_3231 = {0, 0, 0};
f_onb(_n_3228, _t_3230, _b_3231);
float3 _V_3232 = (-_rd_3211);
float3 _Hl_3233 = f_sampleVNDF(vec3_ctor(dot(_V_3232, _t_3230), dot(_V_3232, _b_3231), max(dot(_V_3232, _n_3228), 9.99999975e-05)), f_alphaOf__Mat_0(_m_3226));
(_hn_3229 = normalize((((_Hl_3233.x * _t_3230) + (_Hl_3233.y * _b_3231)) + (_Hl_3233.z * _n_3228))));
}
float scc9 = {0};
if (_front_3227)
{
(scc9 = (1.0 / _m_3226._ior));
}
else
{
(scc9 = _m_3226._ior);
}
float _eta_3234 = scc9;
float _cosi_3235 = clamp(dot((-_rd_3211), _hn_3229), 0.0, 1.0);
float _F_3236 = f_fresnelDielectric(_cosi_3235, _eta_3234);
float3 _nd_3237 = {0, 0, 0};
if ((f_rnd() < _F_3236))
{
(_nd_3237 = reflect(_rd_3211, _hn_3229));
}
else
{
(_nd_3237 = refract(_rd_3211, _hn_3229, _eta_3234));
if ((dot(_nd_3237, _nd_3237) < 9.99999997e-07))
{
(_nd_3237 = reflect(_rd_3211, _hn_3229));
}
else
{
(_thr_3215 *= _m_3226._albedo);
}
}
(_ro_3207 = (_p_3222 + (_nd_3237 * 0.00100000005)));
(_rd_3211 = _nd_3237);
(_lastDelta_3216 = true);
continue;
}
float3 _V_3238 = (-_rd_3211);
float3 _po_3239 = (_p_3222 + (_n_3228 * 0.000199999995));
if ((_uMode > 0))
{
float3 _q_3240 = vec3_ctor((((f_rnd() * 2.0) - 1.0) * _uLightHalf), 1.995, (((f_rnd() * 2.0) - 1.0) * _uLightHalf));
float3 _Lv_3241 = (_q_3240 - _po_3239);
float _d2_3242 = dot(_Lv_3241, _Lv_3241);
float _d_3243 = sqrt(_d2_3242);
(_Lv_3241 /= _d_3243);
float _cosS_3244 = dot(_n_3228, _Lv_3241);
float _cosL_3245 = _Lv_3241.y;
bool scca = (_cosS_3244 > 0.0);
if (scca)
{
(scca = (_cosL_3245 > 0.0));
}
if (scca)
{
_Hit_0 _sh_3246 = f_trace(_po_3239, _Lv_3241, false);
if ((_sh_3246._t > (_d_3243 - 0.00100000005)))
{
float _pl_3247 = (_d2_3242 / (_cosL_3245 * _area_3212));
float _w_3248 = {1.0};
if ((_uMode == 2))
{
float _pb_3249 = f_pdfBSDF__Mat_0(_m_3226, _n_3228, _V_3238, _Lv_3241);
(_w_3248 = ((_pl_3247 * _pl_3247) / ((_pl_3247 * _pl_3247) + (_pb_3249 * _pb_3249))));
}
(_L_out_3214 += f_clampIndirect_int((((((_thr_3215 * f_evalBSDF__Mat_0(_m_3226, _n_3228, _V_3238, _Lv_3241)) * _cosS_3244) * _Le_3213) * _w_3248) / _pl_3247), _depth_3220));
}
}
}
float3 _Ld_3250 = f_sampleBSDF__Mat_0(_m_3226, _n_3228, _V_3238);
float _cosD_3251 = dot(_n_3228, _Ld_3250);
if ((_cosD_3251 <= 0.0))
{
break;
}
float _pdf_3252 = f_pdfBSDF__Mat_0(_m_3226, _n_3228, _V_3238, _Ld_3250);
if ((_pdf_3252 <= 9.99999997e-07))
{
break;
}
(_thr_3215 *= ((f_evalBSDF__Mat_0(_m_3226, _n_3228, _V_3238, _Ld_3250) * _cosD_3251) / _pdf_3252));
(_lastPdf_3217 = _pdf_3252);
(_lastDelta_3216 = false);
(_ro_3207 = _po_3239);
(_rd_3211 = _Ld_3250);
if ((_depth_3220 >= 2))
{
float _pr_3253 = clamp(max(_thr_3215.x, max(_thr_3215.y, _thr_3215.z)), 0.0500000007, 0.949999988);
if ((f_rnd() > _pr_3253))
{
break;
}
(_thr_3215 /= _pr_3253);
}
}
}
(_L_out_3214 = min(_L_out_3214, float3(40.0, 40.0, 40.0)));
float4 _prev_3254 = gl_texture2DFetch(_uPrev, ivec2_ctor(gl_FragCoord.xy), 0);
(out_oAccum = vec4_ctor(lerp(_prev_3254.xyz, _L_out_3214, _uBlend), 1.0));
(out_oND = _gND_3218);
(out_oAlb = _gAlb_3219);
return generateOutput();
}
