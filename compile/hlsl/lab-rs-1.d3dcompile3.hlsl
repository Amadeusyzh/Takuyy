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
struct _Reservoir_0
{
    float _y;
    float _wsum;
    float _M;
    float _W;
};
#pragma pack_matrix(row_major)
struct rm__Reservoir_0
{
    float _y;
    float _wsum;
    float _M;
    float _W;
};
#pragma pack_matrix(column_major)
struct std__Reservoir_0
{
    float _y;
    float _wsum;
    float _M;
    float _W;
};
#pragma pack_matrix(row_major)
struct std_rm__Reservoir_0
{
    float _y;
    float _wsum;
    float _M;
    float _W;
};
#pragma pack_matrix(column_major)
struct std_fp__Reservoir_0
{
    float _y;
    float _wsum;
    float _M;
    float _W;
};
#pragma pack_matrix(row_major)
struct std_rm_fp__Reservoir_0
{
    float _y;
    float _wsum;
    float _M;
    float _W;
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
float2 vec2_ctor(float x0, float x1)
{
    return float2(x0, x1);
}
float3 vec3_ctor(float x0)
{
    return float3(x0, x0, x0);
}
float3 vec3_ctor(float3 x0)
{
    return float3(x0);
}
float4 vec4_ctor(float x0, float x1, float x2, float x3)
{
    return float4(x0, x1, x2, x3);
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
uint uint_ctor_int(int x0)
{
    return uint(x0);
}
// Uniforms

uniform float4 _uBoxMin[24] : register(c0);
uniform float4 _uBoxMax[24] : register(c24);
uniform float4 _uBoxMat[24] : register(c48);
uniform int _uNumBoxes : register(c72);
uniform int _uNumLights : register(c73);
uniform int _uFrame : register(c74);
uniform float2 _uRes : register(c75);
uniform float3 _uCamPos : register(c76);
uniform float3 _uPrevCamPos : register(c77);
uniform float3 _uPrevFwd : register(c78);
uniform float3 _uPrevRight : register(c79);
uniform float3 _uPrevUp : register(c80);
uniform float _uTanHalf : register(c81);
uniform float _uCap : register(c82);
uniform int _uM : register(c83);
uniform int _uTemporal : register(c84);
static const uint _uLights = 0;
static const uint _uGPos = 1;
static const uint _uGNrm = 2;
static const uint _uPrevGPos = 3;
static const uint _uPrevGNrm = 4;
static const uint _uPrevRes = 5;
uniform Texture2D<float4> textures2D[6] : register(t0);
uniform SamplerState samplers2D[6] : register(s0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings

static float4 out_oRes = {0, 0, 0, 0};
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
    SamplerMetadata samplerMetadata[6] : packoffset(c4);
};

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
;
;
static uint _seed_3009 = {0};
uint f_pcg_uint(in uint _v_3011)
{
uint _s_3012 = ((_v_3011 * 747796405) + 2891336453);
uint _w_3013 = (((_s_3012 >> ((_s_3012 >> 28) + 4)) ^ _s_3012) * 277803737);
return ((_w_3013 >> 22) ^ _w_3013);
}
float f_rnd()
{
(_seed_3009 = f_pcg_uint(_seed_3009));
return (float_ctor_uint(_seed_3009) * 2.32830644e-10);
}
void f_initRng_int2_int(in int2 _px_3016, in int _pass_3017)
{
(_seed_3009 = f_pcg_uint((uint_ctor_int(_px_3016.x) + f_pcg_uint((uint_ctor_int(_px_3016.y) + f_pcg_uint(((uint_ctor_int(_uFrame) * 4) + uint_ctor_int(_pass_3017))))))));
}
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
bool sc57 = (_n_3049 <= _f_3050);
if (sc57)
{
(sc57 = (_f_3050 > 9.99999975e-05));
}
bool sc56 = sc57;
if (sc56)
{
(sc56 = (_n_3049 < _tmax_3042));
}
if (sc56)
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
bool sc58 = (abs(_s_3064._p.x) < 0.0700000003);
if (sc58)
{
(sc58 = (frac((_s_3064._p.z * 0.25)) < 0.5));
}
if (sc58)
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
float f_lum(in float3 _c_3081)
{
return dot(_c_3081, float3(0.212599993, 0.715200007, 0.0722000003));
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
bool sc59 = (_NoL_3091 <= 0.0);
if ((!sc59))
{
(sc59 = (_b_3088.w < 0.5));
}
if (sc59)
{
return float3(0.0, 0.0, 0.0);
}
float3 _H_3093 = normalize((_s_3084._v + _L_3085));
float _NoH_3094 = max(dot(_s_3084._n, _H_3093), 0.0);
float _VoH_3095 = max(dot(_s_3084._v, _H_3093), 0.0);
float _al_3096 = max((_s_3084._rough * _s_3084._rough), 0.00300000003);
float sc6c = (1.0 - _VoH_3095);
float _F_3097 = (0.0399999991 + (0.959999979 * ((((sc6c * sc6c) * sc6c) * sc6c) * sc6c)));
float _spec_3098 = ((((f_D_GGX(_NoH_3094, _al_3096) * f_G1(_NoV_3092, _al_3096)) * f_G1(_NoL_3091, _al_3096)) * _F_3097) / ((4.0 * _NoV_3092) * _NoL_3091));
float3 _f_3099 = ((((1.0 - _F_3097) * _s_3084._alb) / 3.14159274) + vec3_ctor(min(_spec_3098, 60.0)));
return (((_f_3099 * _b_3088.xyz) * _NoL_3091) / max(_d2_3090, (((_a_3087.w * _a_3087.w) * 4.0) + 0.0199999996)));
}
float f_phat_int__Surf_0(in int _i_3101, in _Surf_0 _s_3102)
{
float3 _L_3103 = {0, 0, 0};
float _d_3104 = {0};
return f_lum(f_contrib_int__Surf_0(_i_3101, _s_3102, _L_3103, _d_3104));
}
bool f_visible_int__Surf_0(in int _i_3106, in _Surf_0 _s_3107)
{
float3 _L_3108 = {0, 0, 0};
float _d_3109 = {0};
f_contrib_int__Surf_0(_i_3106, _s_3107, _L_3108, _d_3109);
float _r_3110 = gl_texture2DFetch(_uLights, ivec2_ctor_int_int(_i_3106, 0), 0).w;
return (!f_occluded((_s_3107._p + (_s_3107._n * 0.00200000009)), _L_3108, (_d_3109 - _r_3110)));
}
_Reservoir_0 f_emptyRes()
{
_Reservoir_0 _r_3113 = {0, 0, 0, 0};
(_r_3113._y = -1.0);
(_r_3113._wsum = 0.0);
(_r_3113._M = 0.0);
(_r_3113._W = 0.0);
return _r_3113;
}
void f_update__Reservoir_0(inout _Reservoir_0 _r_3115, in float _y_3116, in float _w_3117)
{
(_r_3115._wsum += _w_3117);
bool sc5a = (_w_3117 > 0.0);
if (sc5a)
{
(sc5a = ((f_rnd() * _r_3115._wsum) < _w_3117));
}
if (sc5a)
{
(_r_3115._y = _y_3116);
}
}
struct PS_OUTPUT
{
    float4 out_oRes : SV_TARGET0;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_oRes = out_oRes;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;

int2 _px_3134 = ivec2_ctor(gl_FragCoord.xy);
f_initRng_int2_int(_px_3134, 0);
float4 _g0_3135 = gl_texture2DFetch(_uGPos, _px_3134, 0);
float4 _g1_3136 = gl_texture2DFetch(_uGNrm, _px_3134, 0);
if ((_g0_3135.w < 0.0))
{
(out_oRes = float4(-1.0, 0.0, 0.0, 0.0));
return generateOutput();
}
_Surf_0 _s_3137 = f_surface_float4_float4(_g0_3135, _g1_3136, _uCamPos);
float _N_3138 = float_ctor_int(_uNumLights);
_Reservoir_0 _r_3139 = f_emptyRes();
{ for(int _i_3140 = {0}; (_i_3140 < 64); (_i_3140++))
{
if ((_i_3140 >= _uM))
{
break;
}
int _y_3141 = min(int_ctor((f_rnd() * _N_3138)), (_uNumLights - 1));
f_update__Reservoir_0(_r_3139, float_ctor_int(_y_3141), (f_phat_int__Surf_0(_y_3141, _s_3137) * _N_3138));
}
}
(_r_3139._M = float_ctor_int(_uM));
float sc5b = {0};
if ((_r_3139._y >= 0.0))
{
(sc5b = f_phat_int__Surf_0(int_ctor(_r_3139._y), _s_3137));
}
else
{
(sc5b = 0.0);
}
float _py_3142 = sc5b;
float sc5c = {0};
if ((_py_3142 > 0.0))
{
(sc5c = (_r_3139._wsum / (_r_3139._M * _py_3142)));
}
else
{
(sc5c = 0.0);
}
(_r_3139._W = sc5c);
bool sc5d = (_r_3139._W > 0.0);
if (sc5d)
{
(sc5d = (!f_visible_int__Surf_0(int_ctor(_r_3139._y), _s_3137)));
}
if (sc5d)
{
(_r_3139._W = 0.0);
}
if ((_uTemporal == 1))
{
float3 _d_3143 = (_s_3137._p - _uPrevCamPos);
float _z_3144 = dot(_d_3143, _uPrevFwd);
float2 _ndc_3145 = vec2_ctor((dot(_d_3143, _uPrevRight) / (((_z_3144 * _uTanHalf) * _uRes.x) / _uRes.y)), (dot(_d_3143, _uPrevUp) / (_z_3144 * _uTanHalf)));
int2 _q_3146 = ivec2_ctor(floor((((_ndc_3145 * 0.5) + 0.5) * _uRes)));
bool sc61 = (_z_3144 > 0.0);
if (sc61)
{
(sc61 = (_q_3146.x >= 0));
}
bool sc60 = sc61;
if (sc60)
{
(sc60 = (_q_3146.y >= 0));
}
bool sc5f = sc60;
if (sc5f)
{
(sc5f = (_q_3146.x < int_ctor(_uRes.x)));
}
bool sc5e = sc5f;
if (sc5e)
{
(sc5e = (_q_3146.y < int_ctor(_uRes.y)));
}
if (sc5e)
{
float4 _p0_3147 = gl_texture2DFetch(_uPrevGPos, _q_3146, 0);
float4 _p1_3148 = gl_texture2DFetch(_uPrevGNrm, _q_3146, 0);
float4 _pr_3149 = gl_texture2DFetch(_uPrevRes, _q_3146, 0);
bool sc65 = (_p0_3147.w > 0.0);
if (sc65)
{
(sc65 = (_pr_3149.x >= 0.0));
}
bool sc64 = sc65;
if (sc64)
{
(sc64 = (int_ctor(_pr_3149.x) < _uNumLights));
}
bool sc63 = sc64;
if (sc63)
{
(sc63 = (dot(_p1_3148.xyz, _s_3137._n) > 0.899999976));
}
bool sc62 = sc63;
if (sc62)
{
(sc62 = (distance(_p0_3147.xyz, _s_3137._p) < ((0.0299999993 * _g0_3135.w) + 0.0199999996)));
}
if (sc62)
{
float _Mp_3150 = min(_pr_3149.z, (_uCap * _r_3139._M));
_Reservoir_0 _c_3151 = f_emptyRes();
f_update__Reservoir_0(_c_3151, _r_3139._y, ((_py_3142 * _r_3139._W) * _r_3139._M));
f_update__Reservoir_0(_c_3151, _pr_3149.x, ((f_phat_int__Surf_0(int_ctor(_pr_3149.x), _s_3137) * _pr_3149.y) * _Mp_3150));
(_c_3151._M = (_r_3139._M + _Mp_3150));
float sc66 = {0};
if ((_c_3151._y >= 0.0))
{
(sc66 = f_phat_int__Surf_0(int_ctor(_c_3151._y), _s_3137));
}
else
{
(sc66 = 0.0);
}
float _pc_3152 = sc66;
_Surf_0 _sp_3153 = f_surface_float4_float4(_p0_3147, _p1_3148, _uPrevCamPos);
float sc67 = {0};
if ((_pc_3152 > 0.0))
{
(sc67 = _r_3139._M);
}
else
{
(sc67 = 0.0);
}
float sc68 = {0};
bool sc69 = (_c_3151._y >= 0.0);
if (sc69)
{
(sc69 = (f_phat_int__Surf_0(int_ctor(_c_3151._y), _sp_3153) > 0.0));
}
if (sc69)
{
(sc68 = _Mp_3150);
}
else
{
(sc68 = 0.0);
}
float _Z_3154 = (sc67 + sc68);
float sc6a = {0};
bool sc6b = (_pc_3152 > 0.0);
if (sc6b)
{
(sc6b = (_Z_3154 > 0.0));
}
if (sc6b)
{
(sc6a = (_c_3151._wsum / (_Z_3154 * _pc_3152)));
}
else
{
(sc6a = 0.0);
}
(_c_3151._W = sc6a);
(_r_3139 = _c_3151);
}
}
}
(out_oRes = vec4_ctor(_r_3139._y, _r_3139._W, _r_3139._M, 0.0));
return generateOutput();
}
