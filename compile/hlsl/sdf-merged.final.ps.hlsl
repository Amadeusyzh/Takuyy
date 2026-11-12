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
float3 vec3_ctor(float x0, float x1, float x2)
{
    return float3(x0, x1, x2);
}
float3 vec3_ctor_int_int_int(int x0, int x1, int x2)
{
    return float3(x0, x1, x2);
}
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
int int_ctor(float x0)
{
    return int(x0);
}
// Uniforms

uniform float4 _uA[16] : register(c0);
uniform float4 _uB[16] : register(c16);
uniform float4 _uC[16] : register(c32);
uniform float3x3 _uR[16] : register(c48);
uniform int _uN : register(c96);
uniform float _uK : register(c97);
uniform float3 _uCamPos : register(c98);
uniform float3 _uCamR : register(c99);
uniform float3 _uCamU : register(c100);
uniform float3 _uCamF : register(c101);
uniform float _uTanHalf : register(c102);
uniform float2 _uRes : register(c103);
uniform float2 _uJitter : register(c104);
uniform int _uView : register(c105);
uniform int _uMaxSteps : register(c106);
uniform float _uOmega : register(c107);
uniform int _uSoft : register(c108);
uniform int _uAO : register(c109);
uniform float _uSliceH : register(c110);
uniform int _uSel : register(c111);
uniform float4 _uProbe[64] : register(c112);
uniform int _uProbeN : register(c176);
uniform float3 _uProbeO : register(c177);
uniform float3 _uProbeE : register(c178);
uniform int _uProbeHit : register(c179);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings

static float4 out_outColor = {0, 0, 0, 0};
static float4 gl_FragCoord = float4(0, 0, 0, 0);

cbuffer DriverConstants : register(b1)
{
    float4 dx_ViewCoords : packoffset(c1);
    float2 dx_FragCoordOffset : packoffset(c3);
    float3 dx_DepthFront : packoffset(c2);
    float2 dx_ViewScale : packoffset(c3.z);
    uint dx_Misc : packoffset(c2.w);
};

#define GL_USES_FRAG_COORD
static float _gClip_3028 = {0};
float f_sdPrim_int(in int _i_3030, in float3 _p_3031)
{
float4 _a_3032 = _uA[int_ctor(clamp(float_ctor_int(_i_3030), 0.0, 15.0))];
float4 _b_3033 = _uB[int_ctor(clamp(float_ctor_int(_i_3030), 0.0, 15.0))];
float3 _q_3034 = mul(transpose(_uR[int_ctor(clamp(float_ctor_int(_i_3030), 0.0, 15.0))]), (_p_3031 - _a_3032.xyz));
int _ty_3035 = (int_ctor((_a_3032.w + 0.5)) & 7);
if ((_ty_3035 == 0))
{
return (length(_q_3034) - _b_3033.x);
}
if ((_ty_3035 == 1))
{
float3 _d_3036 = ((abs(_q_3034) - _b_3033.xyz) + _b_3033.w);
return ((length(max(_d_3036, 0.0)) + min(max(_d_3036.x, max(_d_3036.y, _d_3036.z)), 0.0)) - _b_3033.w);
}
if ((_ty_3035 == 2))
{
float2 _t_3037 = vec2_ctor((length(_q_3034.xz) - _b_3033.x), _q_3034.y);
return (length(_t_3037) - _b_3033.y);
}
(_q_3034.y -= clamp(_q_3034.y, (-_b_3033.y), _b_3033.y));
return (length(_q_3034) - _b_3033.x);
}
float f_mapObj(in float3 _p_3039)
{
float _d_3040 = {100000.0};
float _k_3041 = max(_uK, 9.99999975e-05);
{ for(int _i_3042 = {0}; (_i_3042 < _uN); (_i_3042++))
{
float4 _a_3043 = _uA[int_ctor(clamp(float_ctor_int(_i_3042), 0.0, 15.0))];
bool _carve_3044 = (_a_3043.w > 7.5);
float _lb_3045 = (length((_p_3039 - _a_3043.xyz)) - _uC[int_ctor(clamp(float_ctor_int(_i_3042), 0.0, 15.0))].w);
bool sc8b = {0};
if (_carve_3044)
{
(sc8b = (_lb_3045 >= (_k_3041 - _d_3040)));
}
else
{
(sc8b = (_lb_3045 >= (_d_3040 + _k_3041)));
}
if (sc8b)
{
continue;
}
float _di_3046 = f_sdPrim_int(_i_3042, _p_3039);
if ((!_carve_3044))
{
float _h_3047 = clamp((0.5 + ((0.5 * (_di_3046 - _d_3040)) / _k_3041)), 0.0, 1.0);
(_d_3040 = (lerp(_di_3046, _d_3040, _h_3047) - ((_k_3041 * _h_3047) * (1.0 - _h_3047))));
}
else
{
float _h_3048 = clamp((0.5 + ((0.5 * (_di_3046 + _d_3040)) / _k_3041)), 0.0, 1.0);
(_d_3040 = (lerp((-_di_3046), _d_3040, _h_3048) + ((_k_3041 * _h_3048) * (1.0 - _h_3048))));
}
}
}
return _d_3040;
}
float f_mapObjCol(in float3 _p_3050, inout float3 _colOut_3051)
{
float _d_3052 = {100000.0};
float _k_3053 = max(_uK, 9.99999975e-05);
float3 _col_3054 = {0.5, 0.5, 0.5};
{ for(int _i_3055 = {0}; (_i_3055 < _uN); (_i_3055++))
{
float4 _a_3056 = _uA[int_ctor(clamp(float_ctor_int(_i_3055), 0.0, 15.0))];
bool _carve_3057 = (_a_3056.w > 7.5);
float _lb_3058 = (length((_p_3050 - _a_3056.xyz)) - _uC[int_ctor(clamp(float_ctor_int(_i_3055), 0.0, 15.0))].w);
bool sc8c = {0};
if (_carve_3057)
{
(sc8c = (_lb_3058 >= (_k_3053 - _d_3052)));
}
else
{
(sc8c = (_lb_3058 >= (_d_3052 + _k_3053)));
}
if (sc8c)
{
continue;
}
float _di_3059 = f_sdPrim_int(_i_3055, _p_3050);
if ((!_carve_3057))
{
float _h_3060 = clamp((0.5 + ((0.5 * (_di_3059 - _d_3052)) / _k_3053)), 0.0, 1.0);
(_d_3052 = (lerp(_di_3059, _d_3052, _h_3060) - ((_k_3053 * _h_3060) * (1.0 - _h_3060))));
(_col_3054 = lerp(_uC[int_ctor(clamp(float_ctor_int(_i_3055), 0.0, 15.0))].xyz, _col_3054, _h_3060));
}
else
{
float _h_3061 = clamp((0.5 + ((0.5 * (_di_3059 + _d_3052)) / _k_3053)), 0.0, 1.0);
(_d_3052 = (lerp((-_di_3059), _d_3052, _h_3061) + ((_k_3053 * _h_3061) * (1.0 - _h_3061))));
(_col_3054 = lerp(lerp(_col_3054, _uC[int_ctor(clamp(float_ctor_int(_i_3055), 0.0, 15.0))].xyz, 0.649999976), _col_3054, _h_3061));
}
}
}
(_colOut_3051 = _col_3054);
return _d_3052;
}
float f_map(in float3 _p_3063)
{
return max(min(f_mapObj(_p_3063), _p_3063.y), (_p_3063.y - _gClip_3028));
}
float3 f_calcNormal(in float3 _p_3065, in float _e_3066)
{
float3 _n_3067 = {0.0, 0.0, 0.0};
{ for(int _i_3068 = min(_uN, 0); (_i_3068 < 4); (_i_3068++))
{
float3 _s_3069 = ((2.0 * vec3_ctor_int_int_int((((_i_3068 + 3) >> 1) & 1), ((_i_3068 >> 1) & 1), (_i_3068 & 1))) - 1.0);
(_n_3067 += (_s_3069 * f_map((_p_3065 + (_s_3069 * _e_3066)))));
}
}
return normalize(_n_3067);
}
float f_trace_int_int(in float3 _ro_3071, in float3 _rd_3072, in float _pixR_3073, inout int _steps_3074, inout int _status_3075)
{
float _t_3076 = {0.0};
float _omega_3077 = _uOmega;
float _prevF_3078 = {0.0};
float _stepLen_3079 = {0.0};
(_steps_3074 = 0);
(_status_3075 = -1);
{ for(int _i_3080 = {0}; (_i_3080 < _uMaxSteps); (_i_3080++))
{
(_steps_3074++);
float _f_3081 = f_map((_ro_3071 + (_rd_3072 * _t_3076)));
bool sc8d = (_omega_3077 > 1.0);
if (sc8d)
{
(sc8d = ((abs(_f_3081) + _prevF_3078) < _stepLen_3079));
}
if (sc8d)
{
(_t_3076 += (_prevF_3078 - _stepLen_3079));
(_stepLen_3079 = _prevF_3078);
(_omega_3077 = 1.0);
continue;
}
if ((_f_3081 < ((_pixR_3073 * _t_3076) + 9.99999975e-05)))
{
(_status_3075 = 1);
break;
}
(_stepLen_3079 = (_f_3081 * _omega_3077));
(_prevF_3078 = _f_3081);
(_t_3076 += _stepLen_3079);
if ((_t_3076 > 40.0))
{
(_status_3075 = 0);
break;
}
}
}
return _t_3076;
}
float f_shadow(in float3 _ro_3083, in float3 _rd_3084)
{
float _res_3085 = {1.0};
float _t_3086 = {0.0149999997};
float _ph_3087 = {10000000000.0};
{ for(int _i_3088 = min(_uN, 0); (_i_3088 < 56); (_i_3088++))
{
float _h_3089 = f_map((_ro_3083 + (_rd_3084 * _t_3086)));
if ((_h_3089 < 0.00039999999))
{
return 0.0;
}
if ((_uSoft == 1))
{
float _y_3090 = ((_h_3089 * _h_3089) / (2.0 * _ph_3087));
float _d_3091 = sqrt(max(((_h_3089 * _h_3089) - (_y_3090 * _y_3090)), 0.0));
(_res_3085 = min(_res_3085, ((9.0 * _d_3091) / max(9.99999975e-05, (_t_3086 - _y_3090)))));
(_ph_3087 = _h_3089);
}
(_t_3086 += clamp(_h_3089, 0.00999999978, 0.449999988));
bool sc8e = (_t_3086 > 14.0);
if ((!sc8e))
{
(sc8e = (_res_3085 < 0.00200000009));
}
if (sc8e)
{
break;
}
}
}
(_res_3085 = clamp(_res_3085, 0.0, 1.0));
return ((_res_3085 * _res_3085) * (3.0 - (2.0 * _res_3085)));
}
float f_calcAO(in float3 _p_3093, in float3 _n_3094)
{
float _occ_3095 = {0.0};
float _sca_3096 = {1.0};
{ for(int _i_3097 = min(_uN, 0); (_i_3097 < 5); (_i_3097++))
{
float _h_3098 = (0.0149999997 + (0.109999999 * float_ctor_int(_i_3097)));
(_occ_3095 += ((_h_3098 - f_map((_p_3093 + (_n_3094 * _h_3098)))) * _sca_3096));
(_sca_3096 *= 0.850000024);
}
}
return clamp((1.0 - (2.20000005 * _occ_3095)), 0.0, 1.0);
}
float3 f_background(in float3 _rd_3100)
{
float _y_3101 = _rd_3100.y;
float3 _c_3102 = lerp(float3(0.0160000008, 0.0189999994, 0.0260000005), float3(0.00300000003, 0.00400000019, 0.00600000005), clamp((_y_3101 * 1.39999998), 0.0, 1.0));
float sca3 = clamp(dot(_rd_3100, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0);
(_c_3102 += ((float3(0.0500000007, 0.0399999991, 0.0299999993) * (((((sca3 * sca3) * sca3) * sca3) * sca3) * sca3)) * 0.25));
return _c_3102;
}
float3 f_aces(in float3 _x_3104)
{
return clamp(((_x_3104 * ((2.50999999 * _x_3104) + 0.0299999993)) / ((_x_3104 * ((2.43000007 * _x_3104) + 0.589999974)) + 0.140000001)), 0.0, 1.0);
}
float3 f_heat(in float _x_3106)
{
(_x_3106 = clamp(_x_3106, 0.0, 1.0));
float3 _c0_3107 = {0.0599999987, 0.0399999991, 0.239999995};
float3 _c1_3108 = {0.119999997, 0.419999987, 0.860000014};
float3 _c2_3109 = {0.200000003, 0.779999971, 0.550000012};
float3 _c3_3110 = {0.980000019, 0.800000012, 0.200000003};
float3 _c4_3111 = {0.860000014, 0.159999996, 0.100000001};
if ((_x_3106 < 0.25))
{
return lerp(_c0_3107, _c1_3108, (_x_3106 * 4.0));
}
if ((_x_3106 < 0.5))
{
return lerp(_c1_3108, _c2_3109, ((_x_3106 * 4.0) - 1.0));
}
if ((_x_3106 < 0.75))
{
return lerp(_c2_3109, _c3_3110, ((_x_3106 * 4.0) - 2.0));
}
return lerp(_c3_3110, _c4_3111, ((_x_3106 * 4.0) - 3.0));
}
float3 f_fieldColor(in float _d_3113, in float _w_3114)
{
float3 sc8f = {0, 0, 0};
if ((_d_3113 > 0.0))
{
(sc8f = float3(0.959999979, 0.620000005, 0.300000012));
}
else
{
(sc8f = float3(0.400000006, 0.680000007, 0.980000019));
}
float3 _col_3115 = sc8f;
(_col_3115 *= (1.0 - (0.720000029 * exp((-4.0 * abs(_d_3113))))));
float _band_3116 = (abs((frac(((_d_3113 * 10.0) + 0.5)) - 0.5)) / max((_w_3114 * 10.0), 9.99999975e-05));
(_col_3115 *= lerp(0.699999988, 1.0, smoothstep(0.0, 1.5, _band_3116)));
(_col_3115 = lerp(_col_3115, float3(1.0, 1.0, 1.0), (1.0 - smoothstep(0.00400000019, (0.0120000001 + (1.5 * _w_3114)), abs(_d_3113)))));
return _col_3115;
}
float f_traceOne_int(in int _i_3118, in float3 _ro_3119, in float3 _rd_3120, in float _tEnd_3121)
{
float3 _oc_3122 = (_ro_3119 - _uA[int_ctor(clamp(float_ctor_int(_i_3118), 0.0, 15.0))].xyz);
float _r_3123 = _uC[int_ctor(clamp(float_ctor_int(_i_3118), 0.0, 15.0))].w;
float _b_3124 = dot(_oc_3122, _rd_3120);
float _c_3125 = (dot(_oc_3122, _oc_3122) - (_r_3123 * _r_3123));
float _disc_3126 = ((_b_3124 * _b_3124) - _c_3125);
if ((_disc_3126 < 0.0))
{
return -1.0;
}
float _sq_3127 = sqrt(_disc_3126);
float _t_3128 = max(((-_b_3124) - _sq_3127), 0.0);
float _t1_3129 = min(((-_b_3124) + _sq_3127), _tEnd_3121);
{ for(int _s_3130 = min(_uN, 0); (_s_3130 < 40); (_s_3130++))
{
if ((_t_3128 > _t1_3129))
{
return -1.0;
}
float _f_3131 = f_sdPrim_int(_i_3118, (_ro_3119 + (_rd_3120 * _t_3128)));
if ((_f_3131 < 0.00200000009))
{
return _t_3128;
}
(_t_3128 += _f_3131);
}
}
return -1.0;
}
struct PS_OUTPUT
{
    float4 out_outColor : SV_TARGET0;
    float4 out_outColor : SV_TARGET1;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_outColor = out_outColor;
    output.out_outColor = out_outColor;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;

float2 _frag_3133 = (gl_FragCoord.xy + _uJitter);
float2 _uv_3134 = (((2.0 * _frag_3133) - _uRes) / _uRes.y);
float3 _ro_3135 = _uCamPos;
float3 _rd_3136 = normalize((_uCamF + (_uTanHalf * ((_uv_3134.x * _uCamR) + (_uv_3134.y * _uCamU)))));
float _pixR_3137 = (_uTanHalf / _uRes.y);
float sc90 = {0};
if ((_uView == 2))
{
(sc90 = _uSliceH);
}
else
{
(sc90 = 100000.0);
}
(_gClip_3028 = sc90);
int _steps_3138 = {0};
int _status_3139 = {0};
float _t_3140 = f_trace_int_int(_ro_3135, _rd_3136, _pixR_3137, _steps_3138, _status_3139);
bool _hit_3141 = (_status_3139 == 1);
float sc91 = {0};
if (_hit_3141)
{
(sc91 = _t_3140);
}
else
{
(sc91 = 100000.0);
}
float _tS_3142 = sc91;
float3 _p_3143 = (_ro_3135 + (_rd_3136 * _t_3140));
float3 _col_3144 = {0, 0, 0};
float3 _n_3145 = {0.0, 1.0, 0.0};
if (_hit_3141)
{
(_n_3145 = f_calcNormal(_p_3143, max(0.000699999975, (_pixR_3137 * _t_3140))));
}
if ((_uView == 1))
{
if ((_status_3139 == -1))
{
(_col_3144 = float3(1.0, 1.0, 1.0));
}
else
{
(_col_3144 = f_heat((float_ctor_int(_steps_3138) / float_ctor_int(min(_uMaxSteps, 48)))));
if (_hit_3141)
{
(_col_3144 *= (0.720000029 + (0.280000001 * clamp(dot(_n_3145, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0))));
}
}
}
else
{
if (_hit_3141)
{
float3 _objAlb_3146 = {0, 0, 0};
float _dObj_3147 = f_mapObjCol(_p_3143, _objAlb_3146);
bool _floorHit_3148 = (_p_3143.y < _dObj_3147);
bool sc93 = (_uView == 2);
if (sc93)
{
(sc93 = (_dObj_3147 < 0.0));
}
bool sc92 = sc93;
if (sc92)
{
(sc92 = ((_p_3143.y - _uSliceH) > (min(_dObj_3147, _p_3143.y) - 9.99999975e-05)));
}
bool _cap_3149 = sc92;
float3 _alb_3150 = {0, 0, 0};
float _spec_3151 = {0};
if (_floorHit_3148)
{
float _w_3152 = (((_pixR_3137 * _t_3140) * 2.0) / max(abs(_rd_3136.y), 0.0399999991));
float2 _g_3153 = (abs((frac(((_p_3143.xz * 2.0) + 0.5)) - 0.5)) / max((_w_3152 * 2.0), 9.99999975e-05));
float _line_3154 = (1.0 - smoothstep(0.0, 1.0, min(_g_3153.x, _g_3153.y)));
float2 _g2_3155 = (abs(_p_3143.xz) / max(_w_3152, 9.99999975e-05));
float _axis_3156 = (1.0 - smoothstep(0.0, 1.5, min(_g2_3155.x, _g2_3155.y)));
(_alb_3150 = ((float3(0.075000003, 0.0799999982, 0.0900000036) * (1.0 + ((0.449999988 * _line_3154) * exp(((-0.00499999989 * _t_3140) * _t_3140))))) + (float3(0.0299999993, 0.0299999993, 0.0299999993) * _axis_3156)));
(_spec_3151 = 0.150000006);
}
else
{
(_alb_3150 = _objAlb_3146);
(_spec_3151 = 1.0);
}
float _sh_3157 = f_shadow((_p_3143 + (_n_3145 * 0.00200000009)), float3(-0.436890006, 0.757279992, 0.485439986));
float sc94 = {0};
if ((_uAO == 1))
{
(sc94 = f_calcAO(_p_3143, _n_3145));
}
else
{
(sc94 = 1.0);
}
float _ao_3158 = sc94;
float _dif_3159 = (clamp(dot(_n_3145, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0) * _sh_3157);
float3 _hv_3160 = normalize((float3(-0.436890006, 0.757279992, 0.485439986) - _rd_3136));
float _nh_3161 = clamp(dot(_n_3145, _hv_3160), 0.0, 1.0);
float sca4 = clamp((1.0 + dot(_n_3145, _rd_3136)), 0.0, 1.0);
float _fre_3162 = ((((sca4 * sca4) * sca4) * sca4) * sca4);
float _sp_3163 = (((((pow(_nh_3161, 60.0) * 2.0) + (pow(_nh_3161, 12.0) * 0.25)) * _dif_3159) * _spec_3151) * ((0.0399999991 + (0.959999979 * _fre_3162)) + 0.25));
float _skyD_3164 = ((0.600000024 + (0.400000006 * _n_3145.y)) * _ao_3158);
float _bounce_3165 = (clamp((0.400000006 - (0.600000024 * _n_3145.y)), 0.0, 1.0) * _ao_3158);
float _back_3166 = (clamp(dot(_n_3145, float3(0.668959618, 0.0, -0.74329865)), 0.0, 1.0) * _ao_3158);
(_col_3144 = (_alb_3150 * ((((_dif_3159 * float3(1.75, 1.58000004, 1.36000001)) + (_skyD_3164 * float3(0.200000003, 0.25, 0.340000004))) + (_bounce_3165 * float3(0.100000001, 0.0799999982, 0.0599999987))) + (_back_3166 * float3(0.100000001, 0.109999999, 0.140000001)))));
(_col_3144 += (_sp_3163 * float3(1.79999995, 1.70000005, 1.5)));
(_col_3144 += (((_fre_3162 * _ao_3158) * _spec_3151) * float3(0.100000001, 0.129999995, 0.180000007)));
bool sc95 = (_uSel >= 0);
if (sc95)
{
(sc95 = (!_floorHit_3148));
}
if (sc95)
{
float _ds_3167 = abs(f_sdPrim_int(_uSel, _p_3143));
(_col_3144 = lerp(_col_3144, ((_col_3144 * float3(0.899999976, 1.04999995, 1.25)) + float3(0.0199999996, 0.0500000007, 0.100000001)), (1.0 - smoothstep(0.0, 0.0500000007, _ds_3167))));
}
if (((_uSel >= 0) && _floorHit_3148))
{
float _rr_3168 = length((_p_3143.xz - _uA[int_ctor(clamp(float_ctor_int(_uSel), 0.0, 15.0))].xz));
float _w_3169 = (((_pixR_3137 * _t_3140) * 2.0) / max(abs(_rd_3136.y), 0.0399999991));
float _ring_3170 = (1.0 - smoothstep(0.0, ((1.5 * _w_3169) + 0.00800000038), abs((_rr_3168 - _uC[int_ctor(clamp(float_ctor_int(_uSel), 0.0, 15.0))].w))));
(_col_3144 += (float3(0.0799999982, 0.159999996, 0.300000012) * _ring_3170));
}
float sc96 = {0};
if (_floorHit_3148)
{
(sc96 = smoothstep(9.0, 26.0, _t_3140));
}
else
{
(sc96 = 0.0);
}
(_col_3144 = lerp(_col_3144, f_background(_rd_3136), max((1.0 - exp(((-0.00120000006 * _t_3140) * _t_3140))), sc96)));
(_col_3144 = pow(f_aces(_col_3144), float3(0.454545438, 0.454545438, 0.454545438)));
if (_cap_3149)
{
float _w_3171 = (((_pixR_3137 * _t_3140) * 2.0) / max(abs(_rd_3136.y), 0.0399999991));
(_col_3144 = (f_fieldColor(f_mapObj(vec3_ctor(_p_3143.x, _uSliceH, _p_3143.z)), _w_3171) * (0.699999988 + (0.300000012 * _sh_3157))));
}
}
else
{
(_col_3144 = pow(f_aces((f_background(_rd_3136) * 1.10000002)), float3(0.454545438, 0.454545438, 0.454545438)));
}
if ((_uView == 2))
{
float _tp_3172 = ((_uSliceH - _ro_3135.y) / _rd_3136.y);
float3 _pp_3173 = (_ro_3135 + (_rd_3136 * _tp_3172));
bool sc99 = (_tp_3172 > 0.0);
if (sc99)
{
(sc99 = (_tp_3172 < (_tS_3142 - 0.00300000003)));
}
bool sc98 = sc99;
if (sc98)
{
(sc98 = (abs(_pp_3173.x) < 3.0));
}
bool sc97 = sc98;
if (sc97)
{
(sc97 = (abs(_pp_3173.z) < 3.0));
}
if (sc97)
{
float _w_3174 = (((_pixR_3137 * _tp_3172) * 2.0) / max(abs(_rd_3136.y), 0.0399999991));
float3 _fc_3175 = f_fieldColor(f_mapObj(_pp_3173), _w_3174);
float _edge_3176 = (1.0 - smoothstep(0.0, ((1.5 * _w_3174) + 0.00400000019), (3.0 - max(abs(_pp_3173.x), abs(_pp_3173.z)))));
(_col_3144 = lerp(_col_3144, _fc_3175, 0.720000029));
(_col_3144 = lerp(_col_3144, float3(0.899999976, 0.899999976, 0.899999976), _edge_3176));
}
}
}
{ for(int _i_3177 = {0}; (_i_3177 < _uN); (_i_3177++))
{
bool sc9a = (_uA[int_ctor(clamp(float_ctor_int(_i_3177), 0.0, 15.0))].w < 7.5);
if (sc9a)
{
(sc9a = (_i_3177 != _uSel));
}
if (sc9a)
{
continue;
}
float _tg_3178 = f_traceOne_int(_i_3177, _ro_3135, _rd_3136, (min(_tS_3142, 40.0) - 0.00400000019));
if ((_tg_3178 > 0.0))
{
float3 _pg_3179 = (_ro_3135 + (_rd_3136 * _tg_3178));
float3 _ng_3180 = {0.0, 0.0, 0.0};
{ for(int _j_3181 = min(_uN, 0); (_j_3181 < 4); (_j_3181++))
{
float3 _s_3182 = ((2.0 * vec3_ctor_int_int_int((((_j_3181 + 3) >> 1) & 1), ((_j_3181 >> 1) & 1), (_j_3181 & 1))) - 1.0);
(_ng_3180 += ((_s_3182 * f_sdPrim_int(_i_3177, (_pg_3179 + (_s_3182 * 0.00200000009)))) + float3(0.0, 0.0, 0.0)));
}
}
(_ng_3180 = normalize(_ng_3180));
float sca5 = (1.0 - abs(dot(_ng_3180, _rd_3136)));
float _rim_3183 = (sca5 * sca5);
float sc9b = {0};
if ((_i_3177 == _uSel))
{
(sc9b = (0.159999996 + (0.5 * _rim_3183)));
}
else
{
(sc9b = (0.0500000007 + (0.219999999 * _rim_3183)));
}
float _a_3184 = sc9b;
float3 sc9c = {0, 0, 0};
if ((_i_3177 == _uSel))
{
(sc9c = float3(0.550000012, 0.800000012, 1.0));
}
else
{
(sc9c = lerp(float3(0.850000024, 0.850000024, 0.850000024), pow(_uC[int_ctor(clamp(float_ctor_int(_i_3177), 0.0, 15.0))].xyz, float3(0.454545438, 0.454545438, 0.454545438)), 0.5));
}
float3 _gc_3185 = sc9c;
(_col_3144 = lerp(_col_3144, _gc_3185, _a_3184));
}
}
}
if ((_uProbeN > 0))
{
float3 _pd_3186 = (_uProbeE - _uProbeO);
float _pl_3187 = length(_pd_3186);
(_pd_3186 /= max(_pl_3187, 9.99999975e-06));
float3 _w0_3188 = (_ro_3135 - _uProbeO);
float _b_3189 = dot(_rd_3136, _pd_3186);
float _dd_3190 = dot(_rd_3136, _w0_3188);
float _ee_3191 = dot(_pd_3186, _w0_3188);
float _den_3192 = (1.0 - (_b_3189 * _b_3189));
if ((_den_3192 > 9.99999997e-07))
{
float _sc_3193 = (((_b_3189 * _ee_3191) - _dd_3190) / _den_3192);
float _tc_3194 = clamp(((_ee_3191 - (_b_3189 * _dd_3190)) / _den_3192), 0.0, _pl_3187);
(_sc_3193 = dot(((_uProbeO + (_pd_3186 * _tc_3194)) - _ro_3135), _rd_3136));
bool sc9d = (_sc_3193 > 0.0);
if (sc9d)
{
(sc9d = (_sc_3193 < (_tS_3142 + 0.00999999978)));
}
if (sc9d)
{
float _dist_3195 = length(((_ro_3135 + (_rd_3136 * _sc_3193)) - (_uProbeO + (_pd_3186 * _tc_3194))));
float _wl_3196 = (0.00600000005 + ((_pixR_3137 * _sc_3193) * 1.5));
(_col_3144 = lerp(_col_3144, float3(1.0, 0.920000017, 0.550000012), ((1.0 - smoothstep((_wl_3196 * 0.5), (_wl_3196 * 1.5), _dist_3195)) * 0.899999976)));
}
}
{ for(int _i_3197 = {0}; (_i_3197 < _uProbeN); (_i_3197++))
{
float4 _s_3198 = _uProbe[int_ctor(clamp(float_ctor_int(_i_3197), 0.0, 63.0))];
float3 _oc_3199 = (_ro_3135 - _s_3198.xyz);
float _bb_3200 = dot(_oc_3199, _rd_3136);
float _fi_3201 = (float_ctor_int(_i_3197) / max(float_ctor_int((_uProbeN - 1)), 1.0));
float3 _sc_3202 = lerp(float3(0.349999994, 0.850000024, 1.0), float3(0.75, 0.449999988, 1.0), _fi_3201);
float _c2_3203 = (dot(_oc_3199, _oc_3199) - (_s_3198.w * _s_3198.w));
float _disc_3204 = ((_bb_3200 * _bb_3200) - _c2_3203);
bool sc9e = (_s_3198.w > 0.00300000003);
if (sc9e)
{
(sc9e = (_disc_3204 > 0.0));
}
if (sc9e)
{
float _t0_3205 = ((-_bb_3200) - sqrt(_disc_3204));
bool sc9f = (_t0_3205 > 0.0);
if (sc9f)
{
(sc9f = (_t0_3205 < _tS_3142));
}
if (sc9f)
{
float3 _n_3206 = normalize((_oc_3199 + (_rd_3136 * _t0_3205)));
float sca6 = (1.0 - abs(dot(_n_3206, _rd_3136)));
float _rim_3207 = ((sca6 * sca6) * sca6);
(_col_3144 = lerp(_col_3144, _sc_3202, (0.0500000007 + (0.449999988 * _rim_3207))));
}
}
float _rdot_3208 = (0.0219999999 + ((_pixR_3137 * max((-_bb_3200), 0.0)) * 2.0));
float _c3_3209 = (dot(_oc_3199, _oc_3199) - (_rdot_3208 * _rdot_3208));
float _disc3_3210 = ((_bb_3200 * _bb_3200) - _c3_3209);
bool sca0 = (_disc3_3210 > 0.0);
if (sca0)
{
(sca0 = ((-_bb_3200) < (_tS_3142 + 0.0199999996)));
}
if (sca0)
{
float3 sca1 = {0, 0, 0};
bool sca2 = (_i_3197 == (_uProbeN - 1));
if (sca2)
{
(sca2 = (_uProbeHit == 1));
}
if (sca2)
{
(sca1 = float3(1.0, 0.349999994, 0.550000012));
}
else
{
(sca1 = float3(1.0, 0.920000017, 0.550000012));
}
(_col_3144 = lerp(_col_3144, sca1, 0.949999988));
}
}
}
}
(out_outColor = vec4_ctor(_col_3144, 1.0));
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
float3 vec3_ctor(float x0, float x1, float x2)
{
    return float3(x0, x1, x2);
}
float3 vec3_ctor_int_int_int(int x0, int x1, int x2)
{
    return float3(x0, x1, x2);
}
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
int int_ctor(float x0)
{
    return int(x0);
}
// Uniforms

uniform float4 _uA[16] : register(c0);
uniform float4 _uB[16] : register(c16);
uniform float4 _uC[16] : register(c32);
uniform float3x3 _uR[16] : register(c48);
uniform int _uN : register(c96);
uniform float _uK : register(c97);
uniform float3 _uCamPos : register(c98);
uniform float3 _uCamR : register(c99);
uniform float3 _uCamU : register(c100);
uniform float3 _uCamF : register(c101);
uniform float _uTanHalf : register(c102);
uniform float2 _uRes : register(c103);
uniform float2 _uJitter : register(c104);
uniform int _uView : register(c105);
uniform int _uMaxSteps : register(c106);
uniform float _uOmega : register(c107);
uniform int _uSoft : register(c108);
uniform int _uAO : register(c109);
uniform float _uSliceH : register(c110);
uniform int _uSel : register(c111);
uniform float4 _uProbe[64] : register(c112);
uniform int _uProbeN : register(c176);
uniform float3 _uProbeO : register(c177);
uniform float3 _uProbeE : register(c178);
uniform int _uProbeHit : register(c179);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings

static float4 out_outColor = {0, 0, 0, 0};
static float4 gl_FragCoord = float4(0, 0, 0, 0);

cbuffer DriverConstants : register(b1)
{
    float4 dx_ViewCoords : packoffset(c1);
    float2 dx_FragCoordOffset : packoffset(c3);
    float3 dx_DepthFront : packoffset(c2);
    float2 dx_ViewScale : packoffset(c3.z);
    uint dx_Misc : packoffset(c2.w);
};

#define GL_USES_FRAG_COORD
static float _gClip_3028 = {0};
float f_sdPrim_int(in int _i_3030, in float3 _p_3031)
{
float4 _a_3032 = _uA[int_ctor(clamp(float_ctor_int(_i_3030), 0.0, 15.0))];
float4 _b_3033 = _uB[int_ctor(clamp(float_ctor_int(_i_3030), 0.0, 15.0))];
float3 _q_3034 = mul(transpose(_uR[int_ctor(clamp(float_ctor_int(_i_3030), 0.0, 15.0))]), (_p_3031 - _a_3032.xyz));
int _ty_3035 = (int_ctor((_a_3032.w + 0.5)) & 7);
if ((_ty_3035 == 0))
{
return (length(_q_3034) - _b_3033.x);
}
if ((_ty_3035 == 1))
{
float3 _d_3036 = ((abs(_q_3034) - _b_3033.xyz) + _b_3033.w);
return ((length(max(_d_3036, 0.0)) + min(max(_d_3036.x, max(_d_3036.y, _d_3036.z)), 0.0)) - _b_3033.w);
}
if ((_ty_3035 == 2))
{
float2 _t_3037 = vec2_ctor((length(_q_3034.xz) - _b_3033.x), _q_3034.y);
return (length(_t_3037) - _b_3033.y);
}
(_q_3034.y -= clamp(_q_3034.y, (-_b_3033.y), _b_3033.y));
return (length(_q_3034) - _b_3033.x);
}
float f_mapObj(in float3 _p_3039)
{
float _d_3040 = {100000.0};
float _k_3041 = max(_uK, 9.99999975e-05);
{ for(int _i_3042 = {0}; (_i_3042 < _uN); (_i_3042++))
{
float4 _a_3043 = _uA[int_ctor(clamp(float_ctor_int(_i_3042), 0.0, 15.0))];
bool _carve_3044 = (_a_3043.w > 7.5);
float _lb_3045 = (length((_p_3039 - _a_3043.xyz)) - _uC[int_ctor(clamp(float_ctor_int(_i_3042), 0.0, 15.0))].w);
bool sc8b = {0};
if (_carve_3044)
{
(sc8b = (_lb_3045 >= (_k_3041 - _d_3040)));
}
else
{
(sc8b = (_lb_3045 >= (_d_3040 + _k_3041)));
}
if (sc8b)
{
continue;
}
float _di_3046 = f_sdPrim_int(_i_3042, _p_3039);
if ((!_carve_3044))
{
float _h_3047 = clamp((0.5 + ((0.5 * (_di_3046 - _d_3040)) / _k_3041)), 0.0, 1.0);
(_d_3040 = (lerp(_di_3046, _d_3040, _h_3047) - ((_k_3041 * _h_3047) * (1.0 - _h_3047))));
}
else
{
float _h_3048 = clamp((0.5 + ((0.5 * (_di_3046 + _d_3040)) / _k_3041)), 0.0, 1.0);
(_d_3040 = (lerp((-_di_3046), _d_3040, _h_3048) + ((_k_3041 * _h_3048) * (1.0 - _h_3048))));
}
}
}
return _d_3040;
}
float f_mapObjCol(in float3 _p_3050, inout float3 _colOut_3051)
{
float _d_3052 = {100000.0};
float _k_3053 = max(_uK, 9.99999975e-05);
float3 _col_3054 = {0.5, 0.5, 0.5};
{ for(int _i_3055 = {0}; (_i_3055 < _uN); (_i_3055++))
{
float4 _a_3056 = _uA[int_ctor(clamp(float_ctor_int(_i_3055), 0.0, 15.0))];
bool _carve_3057 = (_a_3056.w > 7.5);
float _lb_3058 = (length((_p_3050 - _a_3056.xyz)) - _uC[int_ctor(clamp(float_ctor_int(_i_3055), 0.0, 15.0))].w);
bool sc8c = {0};
if (_carve_3057)
{
(sc8c = (_lb_3058 >= (_k_3053 - _d_3052)));
}
else
{
(sc8c = (_lb_3058 >= (_d_3052 + _k_3053)));
}
if (sc8c)
{
continue;
}
float _di_3059 = f_sdPrim_int(_i_3055, _p_3050);
if ((!_carve_3057))
{
float _h_3060 = clamp((0.5 + ((0.5 * (_di_3059 - _d_3052)) / _k_3053)), 0.0, 1.0);
(_d_3052 = (lerp(_di_3059, _d_3052, _h_3060) - ((_k_3053 * _h_3060) * (1.0 - _h_3060))));
(_col_3054 = lerp(_uC[int_ctor(clamp(float_ctor_int(_i_3055), 0.0, 15.0))].xyz, _col_3054, _h_3060));
}
else
{
float _h_3061 = clamp((0.5 + ((0.5 * (_di_3059 + _d_3052)) / _k_3053)), 0.0, 1.0);
(_d_3052 = (lerp((-_di_3059), _d_3052, _h_3061) + ((_k_3053 * _h_3061) * (1.0 - _h_3061))));
(_col_3054 = lerp(lerp(_col_3054, _uC[int_ctor(clamp(float_ctor_int(_i_3055), 0.0, 15.0))].xyz, 0.649999976), _col_3054, _h_3061));
}
}
}
(_colOut_3051 = _col_3054);
return _d_3052;
}
float f_map(in float3 _p_3063)
{
return max(min(f_mapObj(_p_3063), _p_3063.y), (_p_3063.y - _gClip_3028));
}
float3 f_calcNormal(in float3 _p_3065, in float _e_3066)
{
float3 _n_3067 = {0.0, 0.0, 0.0};
{ for(int _i_3068 = min(_uN, 0); (_i_3068 < 4); (_i_3068++))
{
float3 _s_3069 = ((2.0 * vec3_ctor_int_int_int((((_i_3068 + 3) >> 1) & 1), ((_i_3068 >> 1) & 1), (_i_3068 & 1))) - 1.0);
(_n_3067 += (_s_3069 * f_map((_p_3065 + (_s_3069 * _e_3066)))));
}
}
return normalize(_n_3067);
}
float f_trace_int_int(in float3 _ro_3071, in float3 _rd_3072, in float _pixR_3073, inout int _steps_3074, inout int _status_3075)
{
float _t_3076 = {0.0};
float _omega_3077 = _uOmega;
float _prevF_3078 = {0.0};
float _stepLen_3079 = {0.0};
(_steps_3074 = 0);
(_status_3075 = -1);
{ for(int _i_3080 = {0}; (_i_3080 < _uMaxSteps); (_i_3080++))
{
(_steps_3074++);
float _f_3081 = f_map((_ro_3071 + (_rd_3072 * _t_3076)));
bool sc8d = (_omega_3077 > 1.0);
if (sc8d)
{
(sc8d = ((abs(_f_3081) + _prevF_3078) < _stepLen_3079));
}
if (sc8d)
{
(_t_3076 += (_prevF_3078 - _stepLen_3079));
(_stepLen_3079 = _prevF_3078);
(_omega_3077 = 1.0);
continue;
}
if ((_f_3081 < ((_pixR_3073 * _t_3076) + 9.99999975e-05)))
{
(_status_3075 = 1);
break;
}
(_stepLen_3079 = (_f_3081 * _omega_3077));
(_prevF_3078 = _f_3081);
(_t_3076 += _stepLen_3079);
if ((_t_3076 > 40.0))
{
(_status_3075 = 0);
break;
}
}
}
return _t_3076;
}
float f_shadow(in float3 _ro_3083, in float3 _rd_3084)
{
float _res_3085 = {1.0};
float _t_3086 = {0.0149999997};
float _ph_3087 = {10000000000.0};
{ for(int _i_3088 = min(_uN, 0); (_i_3088 < 56); (_i_3088++))
{
float _h_3089 = f_map((_ro_3083 + (_rd_3084 * _t_3086)));
if ((_h_3089 < 0.00039999999))
{
return 0.0;
}
if ((_uSoft == 1))
{
float _y_3090 = ((_h_3089 * _h_3089) / (2.0 * _ph_3087));
float _d_3091 = sqrt(max(((_h_3089 * _h_3089) - (_y_3090 * _y_3090)), 0.0));
(_res_3085 = min(_res_3085, ((9.0 * _d_3091) / max(9.99999975e-05, (_t_3086 - _y_3090)))));
(_ph_3087 = _h_3089);
}
(_t_3086 += clamp(_h_3089, 0.00999999978, 0.449999988));
bool sc8e = (_t_3086 > 14.0);
if ((!sc8e))
{
(sc8e = (_res_3085 < 0.00200000009));
}
if (sc8e)
{
break;
}
}
}
(_res_3085 = clamp(_res_3085, 0.0, 1.0));
return ((_res_3085 * _res_3085) * (3.0 - (2.0 * _res_3085)));
}
float f_calcAO(in float3 _p_3093, in float3 _n_3094)
{
float _occ_3095 = {0.0};
float _sca_3096 = {1.0};
{ for(int _i_3097 = min(_uN, 0); (_i_3097 < 5); (_i_3097++))
{
float _h_3098 = (0.0149999997 + (0.109999999 * float_ctor_int(_i_3097)));
(_occ_3095 += ((_h_3098 - f_map((_p_3093 + (_n_3094 * _h_3098)))) * _sca_3096));
(_sca_3096 *= 0.850000024);
}
}
return clamp((1.0 - (2.20000005 * _occ_3095)), 0.0, 1.0);
}
float3 f_background(in float3 _rd_3100)
{
float _y_3101 = _rd_3100.y;
float3 _c_3102 = lerp(float3(0.0160000008, 0.0189999994, 0.0260000005), float3(0.00300000003, 0.00400000019, 0.00600000005), clamp((_y_3101 * 1.39999998), 0.0, 1.0));
float sca3 = clamp(dot(_rd_3100, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0);
(_c_3102 += ((float3(0.0500000007, 0.0399999991, 0.0299999993) * (((((sca3 * sca3) * sca3) * sca3) * sca3) * sca3)) * 0.25));
return _c_3102;
}
float3 f_aces(in float3 _x_3104)
{
return clamp(((_x_3104 * ((2.50999999 * _x_3104) + 0.0299999993)) / ((_x_3104 * ((2.43000007 * _x_3104) + 0.589999974)) + 0.140000001)), 0.0, 1.0);
}
float3 f_heat(in float _x_3106)
{
(_x_3106 = clamp(_x_3106, 0.0, 1.0));
float3 _c0_3107 = {0.0599999987, 0.0399999991, 0.239999995};
float3 _c1_3108 = {0.119999997, 0.419999987, 0.860000014};
float3 _c2_3109 = {0.200000003, 0.779999971, 0.550000012};
float3 _c3_3110 = {0.980000019, 0.800000012, 0.200000003};
float3 _c4_3111 = {0.860000014, 0.159999996, 0.100000001};
if ((_x_3106 < 0.25))
{
return lerp(_c0_3107, _c1_3108, (_x_3106 * 4.0));
}
if ((_x_3106 < 0.5))
{
return lerp(_c1_3108, _c2_3109, ((_x_3106 * 4.0) - 1.0));
}
if ((_x_3106 < 0.75))
{
return lerp(_c2_3109, _c3_3110, ((_x_3106 * 4.0) - 2.0));
}
return lerp(_c3_3110, _c4_3111, ((_x_3106 * 4.0) - 3.0));
}
float3 f_fieldColor(in float _d_3113, in float _w_3114)
{
float3 sc8f = {0, 0, 0};
if ((_d_3113 > 0.0))
{
(sc8f = float3(0.959999979, 0.620000005, 0.300000012));
}
else
{
(sc8f = float3(0.400000006, 0.680000007, 0.980000019));
}
float3 _col_3115 = sc8f;
(_col_3115 *= (1.0 - (0.720000029 * exp((-4.0 * abs(_d_3113))))));
float _band_3116 = (abs((frac(((_d_3113 * 10.0) + 0.5)) - 0.5)) / max((_w_3114 * 10.0), 9.99999975e-05));
(_col_3115 *= lerp(0.699999988, 1.0, smoothstep(0.0, 1.5, _band_3116)));
(_col_3115 = lerp(_col_3115, float3(1.0, 1.0, 1.0), (1.0 - smoothstep(0.00400000019, (0.0120000001 + (1.5 * _w_3114)), abs(_d_3113)))));
return _col_3115;
}
float f_traceOne_int(in int _i_3118, in float3 _ro_3119, in float3 _rd_3120, in float _tEnd_3121)
{
float3 _oc_3122 = (_ro_3119 - _uA[int_ctor(clamp(float_ctor_int(_i_3118), 0.0, 15.0))].xyz);
float _r_3123 = _uC[int_ctor(clamp(float_ctor_int(_i_3118), 0.0, 15.0))].w;
float _b_3124 = dot(_oc_3122, _rd_3120);
float _c_3125 = (dot(_oc_3122, _oc_3122) - (_r_3123 * _r_3123));
float _disc_3126 = ((_b_3124 * _b_3124) - _c_3125);
if ((_disc_3126 < 0.0))
{
return -1.0;
}
float _sq_3127 = sqrt(_disc_3126);
float _t_3128 = max(((-_b_3124) - _sq_3127), 0.0);
float _t1_3129 = min(((-_b_3124) + _sq_3127), _tEnd_3121);
{ for(int _s_3130 = min(_uN, 0); (_s_3130 < 40); (_s_3130++))
{
if ((_t_3128 > _t1_3129))
{
return -1.0;
}
float _f_3131 = f_sdPrim_int(_i_3118, (_ro_3119 + (_rd_3120 * _t_3128)));
if ((_f_3131 < 0.00200000009))
{
return _t_3128;
}
(_t_3128 += _f_3131);
}
}
return -1.0;
}
struct PS_OUTPUT
{
    float4 out_outColor : SV_TARGET0;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_outColor = out_outColor;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;

float2 _frag_3133 = (gl_FragCoord.xy + _uJitter);
float2 _uv_3134 = (((2.0 * _frag_3133) - _uRes) / _uRes.y);
float3 _ro_3135 = _uCamPos;
float3 _rd_3136 = normalize((_uCamF + (_uTanHalf * ((_uv_3134.x * _uCamR) + (_uv_3134.y * _uCamU)))));
float _pixR_3137 = (_uTanHalf / _uRes.y);
float sc90 = {0};
if ((_uView == 2))
{
(sc90 = _uSliceH);
}
else
{
(sc90 = 100000.0);
}
(_gClip_3028 = sc90);
int _steps_3138 = {0};
int _status_3139 = {0};
float _t_3140 = f_trace_int_int(_ro_3135, _rd_3136, _pixR_3137, _steps_3138, _status_3139);
bool _hit_3141 = (_status_3139 == 1);
float sc91 = {0};
if (_hit_3141)
{
(sc91 = _t_3140);
}
else
{
(sc91 = 100000.0);
}
float _tS_3142 = sc91;
float3 _p_3143 = (_ro_3135 + (_rd_3136 * _t_3140));
float3 _col_3144 = {0, 0, 0};
float3 _n_3145 = {0.0, 1.0, 0.0};
if (_hit_3141)
{
(_n_3145 = f_calcNormal(_p_3143, max(0.000699999975, (_pixR_3137 * _t_3140))));
}
if ((_uView == 1))
{
if ((_status_3139 == -1))
{
(_col_3144 = float3(1.0, 1.0, 1.0));
}
else
{
(_col_3144 = f_heat((float_ctor_int(_steps_3138) / float_ctor_int(min(_uMaxSteps, 48)))));
if (_hit_3141)
{
(_col_3144 *= (0.720000029 + (0.280000001 * clamp(dot(_n_3145, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0))));
}
}
}
else
{
if (_hit_3141)
{
float3 _objAlb_3146 = {0, 0, 0};
float _dObj_3147 = f_mapObjCol(_p_3143, _objAlb_3146);
bool _floorHit_3148 = (_p_3143.y < _dObj_3147);
bool sc93 = (_uView == 2);
if (sc93)
{
(sc93 = (_dObj_3147 < 0.0));
}
bool sc92 = sc93;
if (sc92)
{
(sc92 = ((_p_3143.y - _uSliceH) > (min(_dObj_3147, _p_3143.y) - 9.99999975e-05)));
}
bool _cap_3149 = sc92;
float3 _alb_3150 = {0, 0, 0};
float _spec_3151 = {0};
if (_floorHit_3148)
{
float _w_3152 = (((_pixR_3137 * _t_3140) * 2.0) / max(abs(_rd_3136.y), 0.0399999991));
float2 _g_3153 = (abs((frac(((_p_3143.xz * 2.0) + 0.5)) - 0.5)) / max((_w_3152 * 2.0), 9.99999975e-05));
float _line_3154 = (1.0 - smoothstep(0.0, 1.0, min(_g_3153.x, _g_3153.y)));
float2 _g2_3155 = (abs(_p_3143.xz) / max(_w_3152, 9.99999975e-05));
float _axis_3156 = (1.0 - smoothstep(0.0, 1.5, min(_g2_3155.x, _g2_3155.y)));
(_alb_3150 = ((float3(0.075000003, 0.0799999982, 0.0900000036) * (1.0 + ((0.449999988 * _line_3154) * exp(((-0.00499999989 * _t_3140) * _t_3140))))) + (float3(0.0299999993, 0.0299999993, 0.0299999993) * _axis_3156)));
(_spec_3151 = 0.150000006);
}
else
{
(_alb_3150 = _objAlb_3146);
(_spec_3151 = 1.0);
}
float _sh_3157 = f_shadow((_p_3143 + (_n_3145 * 0.00200000009)), float3(-0.436890006, 0.757279992, 0.485439986));
float sc94 = {0};
if ((_uAO == 1))
{
(sc94 = f_calcAO(_p_3143, _n_3145));
}
else
{
(sc94 = 1.0);
}
float _ao_3158 = sc94;
float _dif_3159 = (clamp(dot(_n_3145, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0) * _sh_3157);
float3 _hv_3160 = normalize((float3(-0.436890006, 0.757279992, 0.485439986) - _rd_3136));
float _nh_3161 = clamp(dot(_n_3145, _hv_3160), 0.0, 1.0);
float sca4 = clamp((1.0 + dot(_n_3145, _rd_3136)), 0.0, 1.0);
float _fre_3162 = ((((sca4 * sca4) * sca4) * sca4) * sca4);
float _sp_3163 = (((((pow(_nh_3161, 60.0) * 2.0) + (pow(_nh_3161, 12.0) * 0.25)) * _dif_3159) * _spec_3151) * ((0.0399999991 + (0.959999979 * _fre_3162)) + 0.25));
float _skyD_3164 = ((0.600000024 + (0.400000006 * _n_3145.y)) * _ao_3158);
float _bounce_3165 = (clamp((0.400000006 - (0.600000024 * _n_3145.y)), 0.0, 1.0) * _ao_3158);
float _back_3166 = (clamp(dot(_n_3145, float3(0.668959618, 0.0, -0.74329865)), 0.0, 1.0) * _ao_3158);
(_col_3144 = (_alb_3150 * ((((_dif_3159 * float3(1.75, 1.58000004, 1.36000001)) + (_skyD_3164 * float3(0.200000003, 0.25, 0.340000004))) + (_bounce_3165 * float3(0.100000001, 0.0799999982, 0.0599999987))) + (_back_3166 * float3(0.100000001, 0.109999999, 0.140000001)))));
(_col_3144 += (_sp_3163 * float3(1.79999995, 1.70000005, 1.5)));
(_col_3144 += (((_fre_3162 * _ao_3158) * _spec_3151) * float3(0.100000001, 0.129999995, 0.180000007)));
bool sc95 = (_uSel >= 0);
if (sc95)
{
(sc95 = (!_floorHit_3148));
}
if (sc95)
{
float _ds_3167 = abs(f_sdPrim_int(_uSel, _p_3143));
(_col_3144 = lerp(_col_3144, ((_col_3144 * float3(0.899999976, 1.04999995, 1.25)) + float3(0.0199999996, 0.0500000007, 0.100000001)), (1.0 - smoothstep(0.0, 0.0500000007, _ds_3167))));
}
if (((_uSel >= 0) && _floorHit_3148))
{
float _rr_3168 = length((_p_3143.xz - _uA[int_ctor(clamp(float_ctor_int(_uSel), 0.0, 15.0))].xz));
float _w_3169 = (((_pixR_3137 * _t_3140) * 2.0) / max(abs(_rd_3136.y), 0.0399999991));
float _ring_3170 = (1.0 - smoothstep(0.0, ((1.5 * _w_3169) + 0.00800000038), abs((_rr_3168 - _uC[int_ctor(clamp(float_ctor_int(_uSel), 0.0, 15.0))].w))));
(_col_3144 += (float3(0.0799999982, 0.159999996, 0.300000012) * _ring_3170));
}
float sc96 = {0};
if (_floorHit_3148)
{
(sc96 = smoothstep(9.0, 26.0, _t_3140));
}
else
{
(sc96 = 0.0);
}
(_col_3144 = lerp(_col_3144, f_background(_rd_3136), max((1.0 - exp(((-0.00120000006 * _t_3140) * _t_3140))), sc96)));
(_col_3144 = pow(f_aces(_col_3144), float3(0.454545438, 0.454545438, 0.454545438)));
if (_cap_3149)
{
float _w_3171 = (((_pixR_3137 * _t_3140) * 2.0) / max(abs(_rd_3136.y), 0.0399999991));
(_col_3144 = (f_fieldColor(f_mapObj(vec3_ctor(_p_3143.x, _uSliceH, _p_3143.z)), _w_3171) * (0.699999988 + (0.300000012 * _sh_3157))));
}
}
else
{
(_col_3144 = pow(f_aces((f_background(_rd_3136) * 1.10000002)), float3(0.454545438, 0.454545438, 0.454545438)));
}
if ((_uView == 2))
{
float _tp_3172 = ((_uSliceH - _ro_3135.y) / _rd_3136.y);
float3 _pp_3173 = (_ro_3135 + (_rd_3136 * _tp_3172));
bool sc99 = (_tp_3172 > 0.0);
if (sc99)
{
(sc99 = (_tp_3172 < (_tS_3142 - 0.00300000003)));
}
bool sc98 = sc99;
if (sc98)
{
(sc98 = (abs(_pp_3173.x) < 3.0));
}
bool sc97 = sc98;
if (sc97)
{
(sc97 = (abs(_pp_3173.z) < 3.0));
}
if (sc97)
{
float _w_3174 = (((_pixR_3137 * _tp_3172) * 2.0) / max(abs(_rd_3136.y), 0.0399999991));
float3 _fc_3175 = f_fieldColor(f_mapObj(_pp_3173), _w_3174);
float _edge_3176 = (1.0 - smoothstep(0.0, ((1.5 * _w_3174) + 0.00400000019), (3.0 - max(abs(_pp_3173.x), abs(_pp_3173.z)))));
(_col_3144 = lerp(_col_3144, _fc_3175, 0.720000029));
(_col_3144 = lerp(_col_3144, float3(0.899999976, 0.899999976, 0.899999976), _edge_3176));
}
}
}
{ for(int _i_3177 = {0}; (_i_3177 < _uN); (_i_3177++))
{
bool sc9a = (_uA[int_ctor(clamp(float_ctor_int(_i_3177), 0.0, 15.0))].w < 7.5);
if (sc9a)
{
(sc9a = (_i_3177 != _uSel));
}
if (sc9a)
{
continue;
}
float _tg_3178 = f_traceOne_int(_i_3177, _ro_3135, _rd_3136, (min(_tS_3142, 40.0) - 0.00400000019));
if ((_tg_3178 > 0.0))
{
float3 _pg_3179 = (_ro_3135 + (_rd_3136 * _tg_3178));
float3 _ng_3180 = {0.0, 0.0, 0.0};
{ for(int _j_3181 = min(_uN, 0); (_j_3181 < 4); (_j_3181++))
{
float3 _s_3182 = ((2.0 * vec3_ctor_int_int_int((((_j_3181 + 3) >> 1) & 1), ((_j_3181 >> 1) & 1), (_j_3181 & 1))) - 1.0);
(_ng_3180 += ((_s_3182 * f_sdPrim_int(_i_3177, (_pg_3179 + (_s_3182 * 0.00200000009)))) + float3(0.0, 0.0, 0.0)));
}
}
(_ng_3180 = normalize(_ng_3180));
float sca5 = (1.0 - abs(dot(_ng_3180, _rd_3136)));
float _rim_3183 = (sca5 * sca5);
float sc9b = {0};
if ((_i_3177 == _uSel))
{
(sc9b = (0.159999996 + (0.5 * _rim_3183)));
}
else
{
(sc9b = (0.0500000007 + (0.219999999 * _rim_3183)));
}
float _a_3184 = sc9b;
float3 sc9c = {0, 0, 0};
if ((_i_3177 == _uSel))
{
(sc9c = float3(0.550000012, 0.800000012, 1.0));
}
else
{
(sc9c = lerp(float3(0.850000024, 0.850000024, 0.850000024), pow(_uC[int_ctor(clamp(float_ctor_int(_i_3177), 0.0, 15.0))].xyz, float3(0.454545438, 0.454545438, 0.454545438)), 0.5));
}
float3 _gc_3185 = sc9c;
(_col_3144 = lerp(_col_3144, _gc_3185, _a_3184));
}
}
}
if ((_uProbeN > 0))
{
float3 _pd_3186 = (_uProbeE - _uProbeO);
float _pl_3187 = length(_pd_3186);
(_pd_3186 /= max(_pl_3187, 9.99999975e-06));
float3 _w0_3188 = (_ro_3135 - _uProbeO);
float _b_3189 = dot(_rd_3136, _pd_3186);
float _dd_3190 = dot(_rd_3136, _w0_3188);
float _ee_3191 = dot(_pd_3186, _w0_3188);
float _den_3192 = (1.0 - (_b_3189 * _b_3189));
if ((_den_3192 > 9.99999997e-07))
{
float _sc_3193 = (((_b_3189 * _ee_3191) - _dd_3190) / _den_3192);
float _tc_3194 = clamp(((_ee_3191 - (_b_3189 * _dd_3190)) / _den_3192), 0.0, _pl_3187);
(_sc_3193 = dot(((_uProbeO + (_pd_3186 * _tc_3194)) - _ro_3135), _rd_3136));
bool sc9d = (_sc_3193 > 0.0);
if (sc9d)
{
(sc9d = (_sc_3193 < (_tS_3142 + 0.00999999978)));
}
if (sc9d)
{
float _dist_3195 = length(((_ro_3135 + (_rd_3136 * _sc_3193)) - (_uProbeO + (_pd_3186 * _tc_3194))));
float _wl_3196 = (0.00600000005 + ((_pixR_3137 * _sc_3193) * 1.5));
(_col_3144 = lerp(_col_3144, float3(1.0, 0.920000017, 0.550000012), ((1.0 - smoothstep((_wl_3196 * 0.5), (_wl_3196 * 1.5), _dist_3195)) * 0.899999976)));
}
}
{ for(int _i_3197 = {0}; (_i_3197 < _uProbeN); (_i_3197++))
{
float4 _s_3198 = _uProbe[int_ctor(clamp(float_ctor_int(_i_3197), 0.0, 63.0))];
float3 _oc_3199 = (_ro_3135 - _s_3198.xyz);
float _bb_3200 = dot(_oc_3199, _rd_3136);
float _fi_3201 = (float_ctor_int(_i_3197) / max(float_ctor_int((_uProbeN - 1)), 1.0));
float3 _sc_3202 = lerp(float3(0.349999994, 0.850000024, 1.0), float3(0.75, 0.449999988, 1.0), _fi_3201);
float _c2_3203 = (dot(_oc_3199, _oc_3199) - (_s_3198.w * _s_3198.w));
float _disc_3204 = ((_bb_3200 * _bb_3200) - _c2_3203);
bool sc9e = (_s_3198.w > 0.00300000003);
if (sc9e)
{
(sc9e = (_disc_3204 > 0.0));
}
if (sc9e)
{
float _t0_3205 = ((-_bb_3200) - sqrt(_disc_3204));
bool sc9f = (_t0_3205 > 0.0);
if (sc9f)
{
(sc9f = (_t0_3205 < _tS_3142));
}
if (sc9f)
{
float3 _n_3206 = normalize((_oc_3199 + (_rd_3136 * _t0_3205)));
float sca6 = (1.0 - abs(dot(_n_3206, _rd_3136)));
float _rim_3207 = ((sca6 * sca6) * sca6);
(_col_3144 = lerp(_col_3144, _sc_3202, (0.0500000007 + (0.449999988 * _rim_3207))));
}
}
float _rdot_3208 = (0.0219999999 + ((_pixR_3137 * max((-_bb_3200), 0.0)) * 2.0));
float _c3_3209 = (dot(_oc_3199, _oc_3199) - (_rdot_3208 * _rdot_3208));
float _disc3_3210 = ((_bb_3200 * _bb_3200) - _c3_3209);
bool sca0 = (_disc3_3210 > 0.0);
if (sca0)
{
(sca0 = ((-_bb_3200) < (_tS_3142 + 0.0199999996)));
}
if (sca0)
{
float3 sca1 = {0, 0, 0};
bool sca2 = (_i_3197 == (_uProbeN - 1));
if (sca2)
{
(sca2 = (_uProbeHit == 1));
}
if (sca2)
{
(sca1 = float3(1.0, 0.349999994, 0.550000012));
}
else
{
(sca1 = float3(1.0, 0.920000017, 0.550000012));
}
(_col_3144 = lerp(_col_3144, sca1, 0.949999988));
}
}
}
}
(out_outColor = vec4_ctor(_col_3144, 1.0));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
