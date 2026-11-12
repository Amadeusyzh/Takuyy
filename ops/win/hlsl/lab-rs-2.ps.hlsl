
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
uniform int _uFrame : register(c73);
uniform float2 _uRes : register(c74);
uniform float3 _uCamPos : register(c75);
uniform float _uRadius : register(c76);
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
    SamplerMetadata samplerMetadata[4] : packoffset(c4);
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
bool sc4d = (_n_3049 <= _f_3050);
if (sc4d)
{
(sc4d = (_f_3050 > 9.99999975e-05));
}
bool sc4c = sc4d;
if (sc4c)
{
(sc4c = (_n_3049 < _tmax_3042));
}
if (sc4c)
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
bool sc4e = (abs(_s_3064._p.x) < 0.0700000003);
if (sc4e)
{
(sc4e = (frac((_s_3064._p.z * 0.25)) < 0.5));
}
if (sc4e)
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
bool sc4f = (_NoL_3091 <= 0.0);
if ((!sc4f))
{
(sc4f = (_b_3088.w < 0.5));
}
if (sc4f)
{
return float3(0.0, 0.0, 0.0);
}
float3 _H_3093 = normalize((_s_3084._v + _L_3085));
float _NoH_3094 = max(dot(_s_3084._n, _H_3093), 0.0);
float _VoH_3095 = max(dot(_s_3084._v, _H_3093), 0.0);
float _al_3096 = max((_s_3084._rough * _s_3084._rough), 0.00300000003);
float sc5d = (1.0 - _VoH_3095);
float _F_3097 = (0.0399999991 + (0.959999979 * ((((sc5d * sc5d) * sc5d) * sc5d) * sc5d)));
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
bool sc50 = (_w_3117 > 0.0);
if (sc50)
{
(sc50 = ((f_rnd() * _r_3115._wsum) < _w_3117));
}
if (sc50)
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

int2 _px_3125 = ivec2_ctor(gl_FragCoord.xy);
f_initRng_int2_int(_px_3125, 1);
float4 _g0_3126 = gl_texture2DFetch(_uGPos, _px_3125, 0);
float4 _g1_3127 = gl_texture2DFetch(_uGNrm, _px_3125, 0);
if ((_g0_3126.w < 0.0))
{
(out_oRes = float4(-1.0, 0.0, 0.0, 0.0));
return generateOutput();
}
_Surf_0 _s_3128 = f_surface_float4_float4(_g0_3126, _g1_3127, _uCamPos);
_Reservoir_0 _c_3129 = f_emptyRes();
int2 _used_3130[5] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
float _usedM_3131[5] = {0, 0, 0, 0, 0};
int _nUsed_3132 = {0};
{ for(int _k_3133 = {0}; (_k_3133 <= 4); (_k_3133++))
{
int2 _q_3134 = _px_3125;
if ((_k_3133 > 0))
{
float _a_3135 = ((f_rnd() * 2.0) * 3.14159274);
float _rr_3136 = (_uRadius * sqrt(f_rnd()));
(_q_3134 = (_px_3125 + ivec2_ctor(round((vec2_ctor(cos(_a_3135), sin(_a_3135)) * _rr_3136)))));
bool sc54 = (_q_3134.x < 0);
if ((!sc54))
{
(sc54 = (_q_3134.y < 0));
}
bool sc53 = sc54;
if ((!sc53))
{
(sc53 = (_q_3134.x >= int_ctor(_uRes.x)));
}
bool sc52 = sc53;
if ((!sc52))
{
(sc52 = (_q_3134.y >= int_ctor(_uRes.y)));
}
bool sc51 = sc52;
if ((!sc51))
{
(sc51 = all(_q_3134 == _px_3125));
}
if (sc51)
{
continue;
}
float4 _h0_3137 = gl_texture2DFetch(_uGPos, _q_3134, 0);
float4 _h1_3138 = gl_texture2DFetch(_uGNrm, _q_3134, 0);
bool sc56 = (_h0_3137.w < 0.0);
if ((!sc56))
{
(sc56 = (dot(_h1_3138.xyz, _s_3128._n) < 0.906000018));
}
bool sc55 = sc56;
if ((!sc55))
{
(sc55 = (abs((_h0_3137.w - _g0_3126.w)) > (0.100000001 * _g0_3126.w)));
}
if (sc55)
{
continue;
}
}
float4 _rq_3139 = gl_texture2DFetch(_uIn, _q_3134, 0);
if ((_rq_3139.z <= 0.0))
{
continue;
}
float sc57 = {0};
bool sc58 = (_rq_3139.x >= 0.0);
if (sc58)
{
(sc58 = (_rq_3139.y > 0.0));
}
if (sc58)
{
(sc57 = f_phat_int__Surf_0(int_ctor(_rq_3139.x), _s_3128));
}
else
{
(sc57 = 0.0);
}
float _p_3140 = sc57;
bool sc59 = (_p_3140 > 0.0);
if (sc59)
{
(sc59 = (!f_visible_int__Surf_0(int_ctor(_rq_3139.x), _s_3128)));
}
if (sc59)
{
(_p_3140 = 0.0);
}
f_update__Reservoir_0(_c_3129, _rq_3139.x, ((_p_3140 * _rq_3139.y) * _rq_3139.z));
(_c_3129._M += _rq_3139.z);
(_used_3130[int_ctor(clamp(float_ctor_int(_nUsed_3132), 0.0, 4.0))] = _q_3134);
(_usedM_3131[int_ctor(clamp(float_ctor_int(_nUsed_3132), 0.0, 4.0))] = _rq_3139.z);
(_nUsed_3132++);
}
}
float sc5a = {0};
if ((_c_3129._y >= 0.0))
{
(sc5a = f_phat_int__Surf_0(int_ctor(_c_3129._y), _s_3128));
}
else
{
(sc5a = 0.0);
}
float _pc_3141 = sc5a;
float _Z_3142 = {0.0};
if ((_pc_3141 > 0.0))
{
{ for(int _k_3143 = {0}; (_k_3143 <= 4); (_k_3143++))
{
if ((_k_3143 >= _nUsed_3132))
{
break;
}
_Surf_0 _sq_3144 = f_surface_float4_float4(gl_texture2DFetch(_uGPos, _used_3130[int_ctor(clamp(float_ctor_int(_k_3143), 0.0, 4.0))], 0), gl_texture2DFetch(_uGNrm, _used_3130[int_ctor(clamp(float_ctor_int(_k_3143), 0.0, 4.0))], 0), _uCamPos);
if ((f_phat_int__Surf_0(int_ctor(_c_3129._y), _sq_3144) > 0.0))
{
(_Z_3142 += _usedM_3131[int_ctor(clamp(float_ctor_int(_k_3143), 0.0, 4.0))]);
}
}
}
}
float sc5b = {0};
bool sc5c = (_pc_3141 > 0.0);
if (sc5c)
{
(sc5c = (_Z_3142 > 0.0));
}
if (sc5c)
{
(sc5b = (_c_3129._wsum / (_Z_3142 * _pc_3141)));
}
else
{
(sc5b = 0.0);
}
(_c_3129._W = sc5b);
(out_oRes = vec4_ctor(_c_3129._y, _c_3129._W, _c_3129._M, 0.0));
return generateOutput();
}
