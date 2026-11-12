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
bool sc89 = {0};
if (_carve_3044)
{
(sc89 = (_lb_3045 >= (_k_3041 - _d_3040)));
}
else
{
(sc89 = (_lb_3045 >= (_d_3040 + _k_3041)));
}
if (sc89)
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
float3 f_objColor(in float3 _p_3050)
{
float _d_3051 = {100000.0};
float _k_3052 = max(_uK, 9.99999975e-05);
float3 _col_3053 = {0.5, 0.5, 0.5};
{ for(int _i_3054 = {0}; (_i_3054 < _uN); (_i_3054++))
{
float4 _a_3055 = _uA[int_ctor(clamp(float_ctor_int(_i_3054), 0.0, 15.0))];
bool _carve_3056 = (_a_3055.w > 7.5);
float _lb_3057 = (length((_p_3050 - _a_3055.xyz)) - _uC[int_ctor(clamp(float_ctor_int(_i_3054), 0.0, 15.0))].w);
bool sc8a = {0};
if (_carve_3056)
{
(sc8a = (_lb_3057 >= (_k_3052 - _d_3051)));
}
else
{
(sc8a = (_lb_3057 >= (_d_3051 + _k_3052)));
}
if (sc8a)
{
continue;
}
float _di_3058 = f_sdPrim_int(_i_3054, _p_3050);
if ((!_carve_3056))
{
float _h_3059 = clamp((0.5 + ((0.5 * (_di_3058 - _d_3051)) / _k_3052)), 0.0, 1.0);
(_d_3051 = (lerp(_di_3058, _d_3051, _h_3059) - ((_k_3052 * _h_3059) * (1.0 - _h_3059))));
(_col_3053 = lerp(_uC[int_ctor(clamp(float_ctor_int(_i_3054), 0.0, 15.0))].xyz, _col_3053, _h_3059));
}
else
{
float _h_3060 = clamp((0.5 + ((0.5 * (_di_3058 + _d_3051)) / _k_3052)), 0.0, 1.0);
(_d_3051 = (lerp((-_di_3058), _d_3051, _h_3060) + ((_k_3052 * _h_3060) * (1.0 - _h_3060))));
(_col_3053 = lerp(lerp(_col_3053, _uC[int_ctor(clamp(float_ctor_int(_i_3054), 0.0, 15.0))].xyz, 0.649999976), _col_3053, _h_3060));
}
}
}
return _col_3053;
}
float f_map(in float3 _p_3062)
{
return max(min(f_mapObj(_p_3062), _p_3062.y), (_p_3062.y - _gClip_3028));
}
float3 f_calcNormal(in float3 _p_3064, in float _e_3065)
{
float3 _n_3066 = {0.0, 0.0, 0.0};
{ for(int _i_3067 = min(_uN, 0); (_i_3067 < 4); (_i_3067++))
{
float3 _s_3068 = ((2.0 * vec3_ctor_int_int_int((((_i_3067 + 3) >> 1) & 1), ((_i_3067 >> 1) & 1), (_i_3067 & 1))) - 1.0);
(_n_3066 += (_s_3068 * f_map((_p_3064 + (_s_3068 * _e_3065)))));
}
}
return normalize(_n_3066);
}
float f_trace_int_int(in float3 _ro_3070, in float3 _rd_3071, in float _pixR_3072, inout int _steps_3073, inout int _status_3074)
{
float _t_3075 = {0.0};
float _omega_3076 = _uOmega;
float _prevF_3077 = {0.0};
float _stepLen_3078 = {0.0};
(_steps_3073 = 0);
(_status_3074 = -1);
{ for(int _i_3079 = {0}; (_i_3079 < _uMaxSteps); (_i_3079++))
{
(_steps_3073++);
float _f_3080 = f_map((_ro_3070 + (_rd_3071 * _t_3075)));
bool sc8b = (_omega_3076 > 1.0);
if (sc8b)
{
(sc8b = ((abs(_f_3080) + _prevF_3077) < _stepLen_3078));
}
if (sc8b)
{
(_t_3075 += (_prevF_3077 - _stepLen_3078));
(_stepLen_3078 = _prevF_3077);
(_omega_3076 = 1.0);
continue;
}
if ((_f_3080 < ((_pixR_3072 * _t_3075) + 9.99999975e-05)))
{
(_status_3074 = 1);
break;
}
(_stepLen_3078 = (_f_3080 * _omega_3076));
(_prevF_3077 = _f_3080);
(_t_3075 += _stepLen_3078);
if ((_t_3075 > 40.0))
{
(_status_3074 = 0);
break;
}
}
}
return _t_3075;
}
float f_shadow(in float3 _ro_3082, in float3 _rd_3083)
{
float _res_3084 = {1.0};
float _t_3085 = {0.0149999997};
float _ph_3086 = {10000000000.0};
{ for(int _i_3087 = min(_uN, 0); (_i_3087 < 56); (_i_3087++))
{
float _h_3088 = f_map((_ro_3082 + (_rd_3083 * _t_3085)));
if ((_h_3088 < 0.00039999999))
{
return 0.0;
}
if ((_uSoft == 1))
{
float _y_3089 = ((_h_3088 * _h_3088) / (2.0 * _ph_3086));
float _d_3090 = sqrt(max(((_h_3088 * _h_3088) - (_y_3089 * _y_3089)), 0.0));
(_res_3084 = min(_res_3084, ((9.0 * _d_3090) / max(9.99999975e-05, (_t_3085 - _y_3089)))));
(_ph_3086 = _h_3088);
}
(_t_3085 += clamp(_h_3088, 0.00999999978, 0.449999988));
bool sc8c = (_t_3085 > 14.0);
if ((!sc8c))
{
(sc8c = (_res_3084 < 0.00200000009));
}
if (sc8c)
{
break;
}
}
}
(_res_3084 = clamp(_res_3084, 0.0, 1.0));
return ((_res_3084 * _res_3084) * (3.0 - (2.0 * _res_3084)));
}
float f_calcAO(in float3 _p_3092, in float3 _n_3093)
{
float _occ_3094 = {0.0};
float _sca_3095 = {1.0};
{ for(int _i_3096 = min(_uN, 0); (_i_3096 < 5); (_i_3096++))
{
float _h_3097 = (0.0149999997 + (0.109999999 * float_ctor_int(_i_3096)));
(_occ_3094 += ((_h_3097 - f_map((_p_3092 + (_n_3093 * _h_3097)))) * _sca_3095));
(_sca_3095 *= 0.850000024);
}
}
return clamp((1.0 - (2.20000005 * _occ_3094)), 0.0, 1.0);
}
float3 f_background(in float3 _rd_3099)
{
float _y_3100 = _rd_3099.y;
float3 _c_3101 = lerp(float3(0.0160000008, 0.0189999994, 0.0260000005), float3(0.00300000003, 0.00400000019, 0.00600000005), clamp((_y_3100 * 1.39999998), 0.0, 1.0));
float sca1 = clamp(dot(_rd_3099, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0);
(_c_3101 += ((float3(0.0500000007, 0.0399999991, 0.0299999993) * (((((sca1 * sca1) * sca1) * sca1) * sca1) * sca1)) * 0.25));
return _c_3101;
}
float3 f_aces(in float3 _x_3103)
{
return clamp(((_x_3103 * ((2.50999999 * _x_3103) + 0.0299999993)) / ((_x_3103 * ((2.43000007 * _x_3103) + 0.589999974)) + 0.140000001)), 0.0, 1.0);
}
float3 f_heat(in float _x_3105)
{
(_x_3105 = clamp(_x_3105, 0.0, 1.0));
float3 _c0_3106 = {0.0599999987, 0.0399999991, 0.239999995};
float3 _c1_3107 = {0.119999997, 0.419999987, 0.860000014};
float3 _c2_3108 = {0.200000003, 0.779999971, 0.550000012};
float3 _c3_3109 = {0.980000019, 0.800000012, 0.200000003};
float3 _c4_3110 = {0.860000014, 0.159999996, 0.100000001};
if ((_x_3105 < 0.25))
{
return lerp(_c0_3106, _c1_3107, (_x_3105 * 4.0));
}
if ((_x_3105 < 0.5))
{
return lerp(_c1_3107, _c2_3108, ((_x_3105 * 4.0) - 1.0));
}
if ((_x_3105 < 0.75))
{
return lerp(_c2_3108, _c3_3109, ((_x_3105 * 4.0) - 2.0));
}
return lerp(_c3_3109, _c4_3110, ((_x_3105 * 4.0) - 3.0));
}
float3 f_fieldColor(in float _d_3112, in float _w_3113)
{
float3 sc8d = {0, 0, 0};
if ((_d_3112 > 0.0))
{
(sc8d = float3(0.959999979, 0.620000005, 0.300000012));
}
else
{
(sc8d = float3(0.400000006, 0.680000007, 0.980000019));
}
float3 _col_3114 = sc8d;
(_col_3114 *= (1.0 - (0.720000029 * exp((-4.0 * abs(_d_3112))))));
float _band_3115 = (abs((frac(((_d_3112 * 10.0) + 0.5)) - 0.5)) / max((_w_3113 * 10.0), 9.99999975e-05));
(_col_3114 *= lerp(0.699999988, 1.0, smoothstep(0.0, 1.5, _band_3115)));
(_col_3114 = lerp(_col_3114, float3(1.0, 1.0, 1.0), (1.0 - smoothstep(0.00400000019, (0.0120000001 + (1.5 * _w_3113)), abs(_d_3112)))));
return _col_3114;
}
float f_traceOne_int(in int _i_3117, in float3 _ro_3118, in float3 _rd_3119, in float _tEnd_3120)
{
float3 _oc_3121 = (_ro_3118 - _uA[int_ctor(clamp(float_ctor_int(_i_3117), 0.0, 15.0))].xyz);
float _r_3122 = _uC[int_ctor(clamp(float_ctor_int(_i_3117), 0.0, 15.0))].w;
float _b_3123 = dot(_oc_3121, _rd_3119);
float _c_3124 = (dot(_oc_3121, _oc_3121) - (_r_3122 * _r_3122));
float _disc_3125 = ((_b_3123 * _b_3123) - _c_3124);
if ((_disc_3125 < 0.0))
{
return -1.0;
}
float _sq_3126 = sqrt(_disc_3125);
float _t_3127 = max(((-_b_3123) - _sq_3126), 0.0);
float _t1_3128 = min(((-_b_3123) + _sq_3126), _tEnd_3120);
{ for(int _s_3129 = min(_uN, 0); (_s_3129 < 40); (_s_3129++))
{
if ((_t_3127 > _t1_3128))
{
return -1.0;
}
float _f_3130 = f_sdPrim_int(_i_3117, (_ro_3118 + (_rd_3119 * _t_3127)));
if ((_f_3130 < 0.00200000009))
{
return _t_3127;
}
(_t_3127 += _f_3130);
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

float2 _frag_3132 = (gl_FragCoord.xy + _uJitter);
float2 _uv_3133 = (((2.0 * _frag_3132) - _uRes) / _uRes.y);
float3 _ro_3134 = _uCamPos;
float3 _rd_3135 = normalize((_uCamF + (_uTanHalf * ((_uv_3133.x * _uCamR) + (_uv_3133.y * _uCamU)))));
float _pixR_3136 = (_uTanHalf / _uRes.y);
float sc8e = {0};
if ((_uView == 2))
{
(sc8e = _uSliceH);
}
else
{
(sc8e = 100000.0);
}
(_gClip_3028 = sc8e);
int _steps_3137 = {0};
int _status_3138 = {0};
float _t_3139 = f_trace_int_int(_ro_3134, _rd_3135, _pixR_3136, _steps_3137, _status_3138);
bool _hit_3140 = (_status_3138 == 1);
float sc8f = {0};
if (_hit_3140)
{
(sc8f = _t_3139);
}
else
{
(sc8f = 100000.0);
}
float _tS_3141 = sc8f;
float3 _p_3142 = (_ro_3134 + (_rd_3135 * _t_3139));
float3 _col_3143 = {0, 0, 0};
float3 _n_3144 = {0.0, 1.0, 0.0};
if (_hit_3140)
{
(_n_3144 = f_calcNormal(_p_3142, max(0.000699999975, (_pixR_3136 * _t_3139))));
}
if ((_uView == 1))
{
if ((_status_3138 == -1))
{
(_col_3143 = float3(1.0, 1.0, 1.0));
}
else
{
(_col_3143 = f_heat((float_ctor_int(_steps_3137) / float_ctor_int(min(_uMaxSteps, 48)))));
if (_hit_3140)
{
(_col_3143 *= (0.720000029 + (0.280000001 * clamp(dot(_n_3144, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0))));
}
}
}
else
{
if (_hit_3140)
{
float _dObj_3145 = f_mapObj(_p_3142);
bool _floorHit_3146 = (_p_3142.y < _dObj_3145);
bool sc91 = (_uView == 2);
if (sc91)
{
(sc91 = (_dObj_3145 < 0.0));
}
bool sc90 = sc91;
if (sc90)
{
(sc90 = ((_p_3142.y - _uSliceH) > (min(_dObj_3145, _p_3142.y) - 9.99999975e-05)));
}
bool _cap_3147 = sc90;
float3 _alb_3148 = {0, 0, 0};
float _spec_3149 = {0};
if (_floorHit_3146)
{
float _w_3150 = (((_pixR_3136 * _t_3139) * 2.0) / max(abs(_rd_3135.y), 0.0399999991));
float2 _g_3151 = (abs((frac(((_p_3142.xz * 2.0) + 0.5)) - 0.5)) / max((_w_3150 * 2.0), 9.99999975e-05));
float _line_3152 = (1.0 - smoothstep(0.0, 1.0, min(_g_3151.x, _g_3151.y)));
float2 _g2_3153 = (abs(_p_3142.xz) / max(_w_3150, 9.99999975e-05));
float _axis_3154 = (1.0 - smoothstep(0.0, 1.5, min(_g2_3153.x, _g2_3153.y)));
(_alb_3148 = ((float3(0.075000003, 0.0799999982, 0.0900000036) * (1.0 + ((0.449999988 * _line_3152) * exp(((-0.00499999989 * _t_3139) * _t_3139))))) + (float3(0.0299999993, 0.0299999993, 0.0299999993) * _axis_3154)));
(_spec_3149 = 0.150000006);
}
else
{
(_alb_3148 = f_objColor(_p_3142));
(_spec_3149 = 1.0);
}
float _sh_3155 = f_shadow((_p_3142 + (_n_3144 * 0.00200000009)), float3(-0.436890006, 0.757279992, 0.485439986));
float sc92 = {0};
if ((_uAO == 1))
{
(sc92 = f_calcAO(_p_3142, _n_3144));
}
else
{
(sc92 = 1.0);
}
float _ao_3156 = sc92;
float _dif_3157 = (clamp(dot(_n_3144, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0) * _sh_3155);
float3 _hv_3158 = normalize((float3(-0.436890006, 0.757279992, 0.485439986) - _rd_3135));
float _nh_3159 = clamp(dot(_n_3144, _hv_3158), 0.0, 1.0);
float sca2 = clamp((1.0 + dot(_n_3144, _rd_3135)), 0.0, 1.0);
float _fre_3160 = ((((sca2 * sca2) * sca2) * sca2) * sca2);
float _sp_3161 = (((((pow(_nh_3159, 60.0) * 2.0) + (pow(_nh_3159, 12.0) * 0.25)) * _dif_3157) * _spec_3149) * ((0.0399999991 + (0.959999979 * _fre_3160)) + 0.25));
float _skyD_3162 = ((0.600000024 + (0.400000006 * _n_3144.y)) * _ao_3156);
float _bounce_3163 = (clamp((0.400000006 - (0.600000024 * _n_3144.y)), 0.0, 1.0) * _ao_3156);
float _back_3164 = (clamp(dot(_n_3144, float3(0.668959618, 0.0, -0.74329865)), 0.0, 1.0) * _ao_3156);
(_col_3143 = (_alb_3148 * ((((_dif_3157 * float3(1.75, 1.58000004, 1.36000001)) + (_skyD_3162 * float3(0.200000003, 0.25, 0.340000004))) + (_bounce_3163 * float3(0.100000001, 0.0799999982, 0.0599999987))) + (_back_3164 * float3(0.100000001, 0.109999999, 0.140000001)))));
(_col_3143 += (_sp_3161 * float3(1.79999995, 1.70000005, 1.5)));
(_col_3143 += (((_fre_3160 * _ao_3156) * _spec_3149) * float3(0.100000001, 0.129999995, 0.180000007)));
bool sc93 = (_uSel >= 0);
if (sc93)
{
(sc93 = (!_floorHit_3146));
}
if (sc93)
{
float _ds_3165 = abs(f_sdPrim_int(_uSel, _p_3142));
(_col_3143 = lerp(_col_3143, ((_col_3143 * float3(0.899999976, 1.04999995, 1.25)) + float3(0.0199999996, 0.0500000007, 0.100000001)), (1.0 - smoothstep(0.0, 0.0500000007, _ds_3165))));
}
if (((_uSel >= 0) && _floorHit_3146))
{
float _rr_3166 = length((_p_3142.xz - _uA[int_ctor(clamp(float_ctor_int(_uSel), 0.0, 15.0))].xz));
float _w_3167 = (((_pixR_3136 * _t_3139) * 2.0) / max(abs(_rd_3135.y), 0.0399999991));
float _ring_3168 = (1.0 - smoothstep(0.0, ((1.5 * _w_3167) + 0.00800000038), abs((_rr_3166 - _uC[int_ctor(clamp(float_ctor_int(_uSel), 0.0, 15.0))].w))));
(_col_3143 += (float3(0.0799999982, 0.159999996, 0.300000012) * _ring_3168));
}
float sc94 = {0};
if (_floorHit_3146)
{
(sc94 = smoothstep(9.0, 26.0, _t_3139));
}
else
{
(sc94 = 0.0);
}
(_col_3143 = lerp(_col_3143, f_background(_rd_3135), max((1.0 - exp(((-0.00120000006 * _t_3139) * _t_3139))), sc94)));
(_col_3143 = pow(f_aces(_col_3143), float3(0.454545438, 0.454545438, 0.454545438)));
if (_cap_3147)
{
float _w_3169 = (((_pixR_3136 * _t_3139) * 2.0) / max(abs(_rd_3135.y), 0.0399999991));
(_col_3143 = (f_fieldColor(f_mapObj(vec3_ctor(_p_3142.x, _uSliceH, _p_3142.z)), _w_3169) * (0.699999988 + (0.300000012 * _sh_3155))));
}
}
else
{
(_col_3143 = pow(f_aces((f_background(_rd_3135) * 1.10000002)), float3(0.454545438, 0.454545438, 0.454545438)));
}
if ((_uView == 2))
{
float _tp_3170 = ((_uSliceH - _ro_3134.y) / _rd_3135.y);
float3 _pp_3171 = (_ro_3134 + (_rd_3135 * _tp_3170));
bool sc97 = (_tp_3170 > 0.0);
if (sc97)
{
(sc97 = (_tp_3170 < (_tS_3141 - 0.00300000003)));
}
bool sc96 = sc97;
if (sc96)
{
(sc96 = (abs(_pp_3171.x) < 3.0));
}
bool sc95 = sc96;
if (sc95)
{
(sc95 = (abs(_pp_3171.z) < 3.0));
}
if (sc95)
{
float _w_3172 = (((_pixR_3136 * _tp_3170) * 2.0) / max(abs(_rd_3135.y), 0.0399999991));
float3 _fc_3173 = f_fieldColor(f_mapObj(_pp_3171), _w_3172);
float _edge_3174 = (1.0 - smoothstep(0.0, ((1.5 * _w_3172) + 0.00400000019), (3.0 - max(abs(_pp_3171.x), abs(_pp_3171.z)))));
(_col_3143 = lerp(_col_3143, _fc_3173, 0.720000029));
(_col_3143 = lerp(_col_3143, float3(0.899999976, 0.899999976, 0.899999976), _edge_3174));
}
}
}
{ for(int _i_3175 = {0}; (_i_3175 < _uN); (_i_3175++))
{
bool sc98 = (_uA[int_ctor(clamp(float_ctor_int(_i_3175), 0.0, 15.0))].w < 7.5);
if (sc98)
{
(sc98 = (_i_3175 != _uSel));
}
if (sc98)
{
continue;
}
float _tg_3176 = f_traceOne_int(_i_3175, _ro_3134, _rd_3135, (min(_tS_3141, 40.0) - 0.00400000019));
if ((_tg_3176 > 0.0))
{
float3 _pg_3177 = (_ro_3134 + (_rd_3135 * _tg_3176));
float3 _ng_3178 = {0.0, 0.0, 0.0};
{ for(int _j_3179 = min(_uN, 0); (_j_3179 < 4); (_j_3179++))
{
float3 _s_3180 = ((2.0 * vec3_ctor_int_int_int((((_j_3179 + 3) >> 1) & 1), ((_j_3179 >> 1) & 1), (_j_3179 & 1))) - 1.0);
(_ng_3178 += ((_s_3180 * f_sdPrim_int(_i_3175, (_pg_3177 + (_s_3180 * 0.00200000009)))) + float3(0.0, 0.0, 0.0)));
}
}
(_ng_3178 = normalize(_ng_3178));
float sca3 = (1.0 - abs(dot(_ng_3178, _rd_3135)));
float _rim_3181 = (sca3 * sca3);
float sc99 = {0};
if ((_i_3175 == _uSel))
{
(sc99 = (0.159999996 + (0.5 * _rim_3181)));
}
else
{
(sc99 = (0.0500000007 + (0.219999999 * _rim_3181)));
}
float _a_3182 = sc99;
float3 sc9a = {0, 0, 0};
if ((_i_3175 == _uSel))
{
(sc9a = float3(0.550000012, 0.800000012, 1.0));
}
else
{
(sc9a = lerp(float3(0.850000024, 0.850000024, 0.850000024), pow(_uC[int_ctor(clamp(float_ctor_int(_i_3175), 0.0, 15.0))].xyz, float3(0.454545438, 0.454545438, 0.454545438)), 0.5));
}
float3 _gc_3183 = sc9a;
(_col_3143 = lerp(_col_3143, _gc_3183, _a_3182));
}
}
}
if ((_uProbeN > 0))
{
float3 _pd_3184 = (_uProbeE - _uProbeO);
float _pl_3185 = length(_pd_3184);
(_pd_3184 /= max(_pl_3185, 9.99999975e-06));
float3 _w0_3186 = (_ro_3134 - _uProbeO);
float _b_3187 = dot(_rd_3135, _pd_3184);
float _dd_3188 = dot(_rd_3135, _w0_3186);
float _ee_3189 = dot(_pd_3184, _w0_3186);
float _den_3190 = (1.0 - (_b_3187 * _b_3187));
if ((_den_3190 > 9.99999997e-07))
{
float _sc_3191 = (((_b_3187 * _ee_3189) - _dd_3188) / _den_3190);
float _tc_3192 = clamp(((_ee_3189 - (_b_3187 * _dd_3188)) / _den_3190), 0.0, _pl_3185);
(_sc_3191 = dot(((_uProbeO + (_pd_3184 * _tc_3192)) - _ro_3134), _rd_3135));
bool sc9b = (_sc_3191 > 0.0);
if (sc9b)
{
(sc9b = (_sc_3191 < (_tS_3141 + 0.00999999978)));
}
if (sc9b)
{
float _dist_3193 = length(((_ro_3134 + (_rd_3135 * _sc_3191)) - (_uProbeO + (_pd_3184 * _tc_3192))));
float _wl_3194 = (0.00600000005 + ((_pixR_3136 * _sc_3191) * 1.5));
(_col_3143 = lerp(_col_3143, float3(1.0, 0.920000017, 0.550000012), ((1.0 - smoothstep((_wl_3194 * 0.5), (_wl_3194 * 1.5), _dist_3193)) * 0.899999976)));
}
}
{ for(int _i_3195 = {0}; (_i_3195 < _uProbeN); (_i_3195++))
{
float4 _s_3196 = _uProbe[int_ctor(clamp(float_ctor_int(_i_3195), 0.0, 63.0))];
float3 _oc_3197 = (_ro_3134 - _s_3196.xyz);
float _bb_3198 = dot(_oc_3197, _rd_3135);
float _fi_3199 = (float_ctor_int(_i_3195) / max(float_ctor_int((_uProbeN - 1)), 1.0));
float3 _sc_3200 = lerp(float3(0.349999994, 0.850000024, 1.0), float3(0.75, 0.449999988, 1.0), _fi_3199);
float _c2_3201 = (dot(_oc_3197, _oc_3197) - (_s_3196.w * _s_3196.w));
float _disc_3202 = ((_bb_3198 * _bb_3198) - _c2_3201);
bool sc9c = (_s_3196.w > 0.00300000003);
if (sc9c)
{
(sc9c = (_disc_3202 > 0.0));
}
if (sc9c)
{
float _t0_3203 = ((-_bb_3198) - sqrt(_disc_3202));
bool sc9d = (_t0_3203 > 0.0);
if (sc9d)
{
(sc9d = (_t0_3203 < _tS_3141));
}
if (sc9d)
{
float3 _n_3204 = normalize((_oc_3197 + (_rd_3135 * _t0_3203)));
float sca4 = (1.0 - abs(dot(_n_3204, _rd_3135)));
float _rim_3205 = ((sca4 * sca4) * sca4);
(_col_3143 = lerp(_col_3143, _sc_3200, (0.0500000007 + (0.449999988 * _rim_3205))));
}
}
float _rdot_3206 = (0.0219999999 + ((_pixR_3136 * max((-_bb_3198), 0.0)) * 2.0));
float _c3_3207 = (dot(_oc_3197, _oc_3197) - (_rdot_3206 * _rdot_3206));
float _disc3_3208 = ((_bb_3198 * _bb_3198) - _c3_3207);
bool sc9e = (_disc3_3208 > 0.0);
if (sc9e)
{
(sc9e = ((-_bb_3198) < (_tS_3141 + 0.0199999996)));
}
if (sc9e)
{
float3 sc9f = {0, 0, 0};
bool sca0 = (_i_3195 == (_uProbeN - 1));
if (sca0)
{
(sca0 = (_uProbeHit == 1));
}
if (sca0)
{
(sc9f = float3(1.0, 0.349999994, 0.550000012));
}
else
{
(sc9f = float3(1.0, 0.920000017, 0.550000012));
}
(_col_3143 = lerp(_col_3143, sc9f, 0.949999988));
}
}
}
}
(out_outColor = vec4_ctor(_col_3143, 1.0));
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
bool sc89 = {0};
if (_carve_3044)
{
(sc89 = (_lb_3045 >= (_k_3041 - _d_3040)));
}
else
{
(sc89 = (_lb_3045 >= (_d_3040 + _k_3041)));
}
if (sc89)
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
float3 f_objColor(in float3 _p_3050)
{
float _d_3051 = {100000.0};
float _k_3052 = max(_uK, 9.99999975e-05);
float3 _col_3053 = {0.5, 0.5, 0.5};
{ for(int _i_3054 = {0}; (_i_3054 < _uN); (_i_3054++))
{
float4 _a_3055 = _uA[int_ctor(clamp(float_ctor_int(_i_3054), 0.0, 15.0))];
bool _carve_3056 = (_a_3055.w > 7.5);
float _lb_3057 = (length((_p_3050 - _a_3055.xyz)) - _uC[int_ctor(clamp(float_ctor_int(_i_3054), 0.0, 15.0))].w);
bool sc8a = {0};
if (_carve_3056)
{
(sc8a = (_lb_3057 >= (_k_3052 - _d_3051)));
}
else
{
(sc8a = (_lb_3057 >= (_d_3051 + _k_3052)));
}
if (sc8a)
{
continue;
}
float _di_3058 = f_sdPrim_int(_i_3054, _p_3050);
if ((!_carve_3056))
{
float _h_3059 = clamp((0.5 + ((0.5 * (_di_3058 - _d_3051)) / _k_3052)), 0.0, 1.0);
(_d_3051 = (lerp(_di_3058, _d_3051, _h_3059) - ((_k_3052 * _h_3059) * (1.0 - _h_3059))));
(_col_3053 = lerp(_uC[int_ctor(clamp(float_ctor_int(_i_3054), 0.0, 15.0))].xyz, _col_3053, _h_3059));
}
else
{
float _h_3060 = clamp((0.5 + ((0.5 * (_di_3058 + _d_3051)) / _k_3052)), 0.0, 1.0);
(_d_3051 = (lerp((-_di_3058), _d_3051, _h_3060) + ((_k_3052 * _h_3060) * (1.0 - _h_3060))));
(_col_3053 = lerp(lerp(_col_3053, _uC[int_ctor(clamp(float_ctor_int(_i_3054), 0.0, 15.0))].xyz, 0.649999976), _col_3053, _h_3060));
}
}
}
return _col_3053;
}
float f_map(in float3 _p_3062)
{
return max(min(f_mapObj(_p_3062), _p_3062.y), (_p_3062.y - _gClip_3028));
}
float3 f_calcNormal(in float3 _p_3064, in float _e_3065)
{
float3 _n_3066 = {0.0, 0.0, 0.0};
{ for(int _i_3067 = min(_uN, 0); (_i_3067 < 4); (_i_3067++))
{
float3 _s_3068 = ((2.0 * vec3_ctor_int_int_int((((_i_3067 + 3) >> 1) & 1), ((_i_3067 >> 1) & 1), (_i_3067 & 1))) - 1.0);
(_n_3066 += (_s_3068 * f_map((_p_3064 + (_s_3068 * _e_3065)))));
}
}
return normalize(_n_3066);
}
float f_trace_int_int(in float3 _ro_3070, in float3 _rd_3071, in float _pixR_3072, inout int _steps_3073, inout int _status_3074)
{
float _t_3075 = {0.0};
float _omega_3076 = _uOmega;
float _prevF_3077 = {0.0};
float _stepLen_3078 = {0.0};
(_steps_3073 = 0);
(_status_3074 = -1);
{ for(int _i_3079 = {0}; (_i_3079 < _uMaxSteps); (_i_3079++))
{
(_steps_3073++);
float _f_3080 = f_map((_ro_3070 + (_rd_3071 * _t_3075)));
bool sc8b = (_omega_3076 > 1.0);
if (sc8b)
{
(sc8b = ((abs(_f_3080) + _prevF_3077) < _stepLen_3078));
}
if (sc8b)
{
(_t_3075 += (_prevF_3077 - _stepLen_3078));
(_stepLen_3078 = _prevF_3077);
(_omega_3076 = 1.0);
continue;
}
if ((_f_3080 < ((_pixR_3072 * _t_3075) + 9.99999975e-05)))
{
(_status_3074 = 1);
break;
}
(_stepLen_3078 = (_f_3080 * _omega_3076));
(_prevF_3077 = _f_3080);
(_t_3075 += _stepLen_3078);
if ((_t_3075 > 40.0))
{
(_status_3074 = 0);
break;
}
}
}
return _t_3075;
}
float f_shadow(in float3 _ro_3082, in float3 _rd_3083)
{
float _res_3084 = {1.0};
float _t_3085 = {0.0149999997};
float _ph_3086 = {10000000000.0};
{ for(int _i_3087 = min(_uN, 0); (_i_3087 < 56); (_i_3087++))
{
float _h_3088 = f_map((_ro_3082 + (_rd_3083 * _t_3085)));
if ((_h_3088 < 0.00039999999))
{
return 0.0;
}
if ((_uSoft == 1))
{
float _y_3089 = ((_h_3088 * _h_3088) / (2.0 * _ph_3086));
float _d_3090 = sqrt(max(((_h_3088 * _h_3088) - (_y_3089 * _y_3089)), 0.0));
(_res_3084 = min(_res_3084, ((9.0 * _d_3090) / max(9.99999975e-05, (_t_3085 - _y_3089)))));
(_ph_3086 = _h_3088);
}
(_t_3085 += clamp(_h_3088, 0.00999999978, 0.449999988));
bool sc8c = (_t_3085 > 14.0);
if ((!sc8c))
{
(sc8c = (_res_3084 < 0.00200000009));
}
if (sc8c)
{
break;
}
}
}
(_res_3084 = clamp(_res_3084, 0.0, 1.0));
return ((_res_3084 * _res_3084) * (3.0 - (2.0 * _res_3084)));
}
float f_calcAO(in float3 _p_3092, in float3 _n_3093)
{
float _occ_3094 = {0.0};
float _sca_3095 = {1.0};
{ for(int _i_3096 = min(_uN, 0); (_i_3096 < 5); (_i_3096++))
{
float _h_3097 = (0.0149999997 + (0.109999999 * float_ctor_int(_i_3096)));
(_occ_3094 += ((_h_3097 - f_map((_p_3092 + (_n_3093 * _h_3097)))) * _sca_3095));
(_sca_3095 *= 0.850000024);
}
}
return clamp((1.0 - (2.20000005 * _occ_3094)), 0.0, 1.0);
}
float3 f_background(in float3 _rd_3099)
{
float _y_3100 = _rd_3099.y;
float3 _c_3101 = lerp(float3(0.0160000008, 0.0189999994, 0.0260000005), float3(0.00300000003, 0.00400000019, 0.00600000005), clamp((_y_3100 * 1.39999998), 0.0, 1.0));
float sca1 = clamp(dot(_rd_3099, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0);
(_c_3101 += ((float3(0.0500000007, 0.0399999991, 0.0299999993) * (((((sca1 * sca1) * sca1) * sca1) * sca1) * sca1)) * 0.25));
return _c_3101;
}
float3 f_aces(in float3 _x_3103)
{
return clamp(((_x_3103 * ((2.50999999 * _x_3103) + 0.0299999993)) / ((_x_3103 * ((2.43000007 * _x_3103) + 0.589999974)) + 0.140000001)), 0.0, 1.0);
}
float3 f_heat(in float _x_3105)
{
(_x_3105 = clamp(_x_3105, 0.0, 1.0));
float3 _c0_3106 = {0.0599999987, 0.0399999991, 0.239999995};
float3 _c1_3107 = {0.119999997, 0.419999987, 0.860000014};
float3 _c2_3108 = {0.200000003, 0.779999971, 0.550000012};
float3 _c3_3109 = {0.980000019, 0.800000012, 0.200000003};
float3 _c4_3110 = {0.860000014, 0.159999996, 0.100000001};
if ((_x_3105 < 0.25))
{
return lerp(_c0_3106, _c1_3107, (_x_3105 * 4.0));
}
if ((_x_3105 < 0.5))
{
return lerp(_c1_3107, _c2_3108, ((_x_3105 * 4.0) - 1.0));
}
if ((_x_3105 < 0.75))
{
return lerp(_c2_3108, _c3_3109, ((_x_3105 * 4.0) - 2.0));
}
return lerp(_c3_3109, _c4_3110, ((_x_3105 * 4.0) - 3.0));
}
float3 f_fieldColor(in float _d_3112, in float _w_3113)
{
float3 sc8d = {0, 0, 0};
if ((_d_3112 > 0.0))
{
(sc8d = float3(0.959999979, 0.620000005, 0.300000012));
}
else
{
(sc8d = float3(0.400000006, 0.680000007, 0.980000019));
}
float3 _col_3114 = sc8d;
(_col_3114 *= (1.0 - (0.720000029 * exp((-4.0 * abs(_d_3112))))));
float _band_3115 = (abs((frac(((_d_3112 * 10.0) + 0.5)) - 0.5)) / max((_w_3113 * 10.0), 9.99999975e-05));
(_col_3114 *= lerp(0.699999988, 1.0, smoothstep(0.0, 1.5, _band_3115)));
(_col_3114 = lerp(_col_3114, float3(1.0, 1.0, 1.0), (1.0 - smoothstep(0.00400000019, (0.0120000001 + (1.5 * _w_3113)), abs(_d_3112)))));
return _col_3114;
}
float f_traceOne_int(in int _i_3117, in float3 _ro_3118, in float3 _rd_3119, in float _tEnd_3120)
{
float3 _oc_3121 = (_ro_3118 - _uA[int_ctor(clamp(float_ctor_int(_i_3117), 0.0, 15.0))].xyz);
float _r_3122 = _uC[int_ctor(clamp(float_ctor_int(_i_3117), 0.0, 15.0))].w;
float _b_3123 = dot(_oc_3121, _rd_3119);
float _c_3124 = (dot(_oc_3121, _oc_3121) - (_r_3122 * _r_3122));
float _disc_3125 = ((_b_3123 * _b_3123) - _c_3124);
if ((_disc_3125 < 0.0))
{
return -1.0;
}
float _sq_3126 = sqrt(_disc_3125);
float _t_3127 = max(((-_b_3123) - _sq_3126), 0.0);
float _t1_3128 = min(((-_b_3123) + _sq_3126), _tEnd_3120);
{ for(int _s_3129 = min(_uN, 0); (_s_3129 < 40); (_s_3129++))
{
if ((_t_3127 > _t1_3128))
{
return -1.0;
}
float _f_3130 = f_sdPrim_int(_i_3117, (_ro_3118 + (_rd_3119 * _t_3127)));
if ((_f_3130 < 0.00200000009))
{
return _t_3127;
}
(_t_3127 += _f_3130);
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

float2 _frag_3132 = (gl_FragCoord.xy + _uJitter);
float2 _uv_3133 = (((2.0 * _frag_3132) - _uRes) / _uRes.y);
float3 _ro_3134 = _uCamPos;
float3 _rd_3135 = normalize((_uCamF + (_uTanHalf * ((_uv_3133.x * _uCamR) + (_uv_3133.y * _uCamU)))));
float _pixR_3136 = (_uTanHalf / _uRes.y);
float sc8e = {0};
if ((_uView == 2))
{
(sc8e = _uSliceH);
}
else
{
(sc8e = 100000.0);
}
(_gClip_3028 = sc8e);
int _steps_3137 = {0};
int _status_3138 = {0};
float _t_3139 = f_trace_int_int(_ro_3134, _rd_3135, _pixR_3136, _steps_3137, _status_3138);
bool _hit_3140 = (_status_3138 == 1);
float sc8f = {0};
if (_hit_3140)
{
(sc8f = _t_3139);
}
else
{
(sc8f = 100000.0);
}
float _tS_3141 = sc8f;
float3 _p_3142 = (_ro_3134 + (_rd_3135 * _t_3139));
float3 _col_3143 = {0, 0, 0};
float3 _n_3144 = {0.0, 1.0, 0.0};
if (_hit_3140)
{
(_n_3144 = f_calcNormal(_p_3142, max(0.000699999975, (_pixR_3136 * _t_3139))));
}
if ((_uView == 1))
{
if ((_status_3138 == -1))
{
(_col_3143 = float3(1.0, 1.0, 1.0));
}
else
{
(_col_3143 = f_heat((float_ctor_int(_steps_3137) / float_ctor_int(min(_uMaxSteps, 48)))));
if (_hit_3140)
{
(_col_3143 *= (0.720000029 + (0.280000001 * clamp(dot(_n_3144, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0))));
}
}
}
else
{
if (_hit_3140)
{
float _dObj_3145 = f_mapObj(_p_3142);
bool _floorHit_3146 = (_p_3142.y < _dObj_3145);
bool sc91 = (_uView == 2);
if (sc91)
{
(sc91 = (_dObj_3145 < 0.0));
}
bool sc90 = sc91;
if (sc90)
{
(sc90 = ((_p_3142.y - _uSliceH) > (min(_dObj_3145, _p_3142.y) - 9.99999975e-05)));
}
bool _cap_3147 = sc90;
float3 _alb_3148 = {0, 0, 0};
float _spec_3149 = {0};
if (_floorHit_3146)
{
float _w_3150 = (((_pixR_3136 * _t_3139) * 2.0) / max(abs(_rd_3135.y), 0.0399999991));
float2 _g_3151 = (abs((frac(((_p_3142.xz * 2.0) + 0.5)) - 0.5)) / max((_w_3150 * 2.0), 9.99999975e-05));
float _line_3152 = (1.0 - smoothstep(0.0, 1.0, min(_g_3151.x, _g_3151.y)));
float2 _g2_3153 = (abs(_p_3142.xz) / max(_w_3150, 9.99999975e-05));
float _axis_3154 = (1.0 - smoothstep(0.0, 1.5, min(_g2_3153.x, _g2_3153.y)));
(_alb_3148 = ((float3(0.075000003, 0.0799999982, 0.0900000036) * (1.0 + ((0.449999988 * _line_3152) * exp(((-0.00499999989 * _t_3139) * _t_3139))))) + (float3(0.0299999993, 0.0299999993, 0.0299999993) * _axis_3154)));
(_spec_3149 = 0.150000006);
}
else
{
(_alb_3148 = f_objColor(_p_3142));
(_spec_3149 = 1.0);
}
float _sh_3155 = f_shadow((_p_3142 + (_n_3144 * 0.00200000009)), float3(-0.436890006, 0.757279992, 0.485439986));
float sc92 = {0};
if ((_uAO == 1))
{
(sc92 = f_calcAO(_p_3142, _n_3144));
}
else
{
(sc92 = 1.0);
}
float _ao_3156 = sc92;
float _dif_3157 = (clamp(dot(_n_3144, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0) * _sh_3155);
float3 _hv_3158 = normalize((float3(-0.436890006, 0.757279992, 0.485439986) - _rd_3135));
float _nh_3159 = clamp(dot(_n_3144, _hv_3158), 0.0, 1.0);
float sca2 = clamp((1.0 + dot(_n_3144, _rd_3135)), 0.0, 1.0);
float _fre_3160 = ((((sca2 * sca2) * sca2) * sca2) * sca2);
float _sp_3161 = (((((pow(_nh_3159, 60.0) * 2.0) + (pow(_nh_3159, 12.0) * 0.25)) * _dif_3157) * _spec_3149) * ((0.0399999991 + (0.959999979 * _fre_3160)) + 0.25));
float _skyD_3162 = ((0.600000024 + (0.400000006 * _n_3144.y)) * _ao_3156);
float _bounce_3163 = (clamp((0.400000006 - (0.600000024 * _n_3144.y)), 0.0, 1.0) * _ao_3156);
float _back_3164 = (clamp(dot(_n_3144, float3(0.668959618, 0.0, -0.74329865)), 0.0, 1.0) * _ao_3156);
(_col_3143 = (_alb_3148 * ((((_dif_3157 * float3(1.75, 1.58000004, 1.36000001)) + (_skyD_3162 * float3(0.200000003, 0.25, 0.340000004))) + (_bounce_3163 * float3(0.100000001, 0.0799999982, 0.0599999987))) + (_back_3164 * float3(0.100000001, 0.109999999, 0.140000001)))));
(_col_3143 += (_sp_3161 * float3(1.79999995, 1.70000005, 1.5)));
(_col_3143 += (((_fre_3160 * _ao_3156) * _spec_3149) * float3(0.100000001, 0.129999995, 0.180000007)));
bool sc93 = (_uSel >= 0);
if (sc93)
{
(sc93 = (!_floorHit_3146));
}
if (sc93)
{
float _ds_3165 = abs(f_sdPrim_int(_uSel, _p_3142));
(_col_3143 = lerp(_col_3143, ((_col_3143 * float3(0.899999976, 1.04999995, 1.25)) + float3(0.0199999996, 0.0500000007, 0.100000001)), (1.0 - smoothstep(0.0, 0.0500000007, _ds_3165))));
}
if (((_uSel >= 0) && _floorHit_3146))
{
float _rr_3166 = length((_p_3142.xz - _uA[int_ctor(clamp(float_ctor_int(_uSel), 0.0, 15.0))].xz));
float _w_3167 = (((_pixR_3136 * _t_3139) * 2.0) / max(abs(_rd_3135.y), 0.0399999991));
float _ring_3168 = (1.0 - smoothstep(0.0, ((1.5 * _w_3167) + 0.00800000038), abs((_rr_3166 - _uC[int_ctor(clamp(float_ctor_int(_uSel), 0.0, 15.0))].w))));
(_col_3143 += (float3(0.0799999982, 0.159999996, 0.300000012) * _ring_3168));
}
float sc94 = {0};
if (_floorHit_3146)
{
(sc94 = smoothstep(9.0, 26.0, _t_3139));
}
else
{
(sc94 = 0.0);
}
(_col_3143 = lerp(_col_3143, f_background(_rd_3135), max((1.0 - exp(((-0.00120000006 * _t_3139) * _t_3139))), sc94)));
(_col_3143 = pow(f_aces(_col_3143), float3(0.454545438, 0.454545438, 0.454545438)));
if (_cap_3147)
{
float _w_3169 = (((_pixR_3136 * _t_3139) * 2.0) / max(abs(_rd_3135.y), 0.0399999991));
(_col_3143 = (f_fieldColor(f_mapObj(vec3_ctor(_p_3142.x, _uSliceH, _p_3142.z)), _w_3169) * (0.699999988 + (0.300000012 * _sh_3155))));
}
}
else
{
(_col_3143 = pow(f_aces((f_background(_rd_3135) * 1.10000002)), float3(0.454545438, 0.454545438, 0.454545438)));
}
if ((_uView == 2))
{
float _tp_3170 = ((_uSliceH - _ro_3134.y) / _rd_3135.y);
float3 _pp_3171 = (_ro_3134 + (_rd_3135 * _tp_3170));
bool sc97 = (_tp_3170 > 0.0);
if (sc97)
{
(sc97 = (_tp_3170 < (_tS_3141 - 0.00300000003)));
}
bool sc96 = sc97;
if (sc96)
{
(sc96 = (abs(_pp_3171.x) < 3.0));
}
bool sc95 = sc96;
if (sc95)
{
(sc95 = (abs(_pp_3171.z) < 3.0));
}
if (sc95)
{
float _w_3172 = (((_pixR_3136 * _tp_3170) * 2.0) / max(abs(_rd_3135.y), 0.0399999991));
float3 _fc_3173 = f_fieldColor(f_mapObj(_pp_3171), _w_3172);
float _edge_3174 = (1.0 - smoothstep(0.0, ((1.5 * _w_3172) + 0.00400000019), (3.0 - max(abs(_pp_3171.x), abs(_pp_3171.z)))));
(_col_3143 = lerp(_col_3143, _fc_3173, 0.720000029));
(_col_3143 = lerp(_col_3143, float3(0.899999976, 0.899999976, 0.899999976), _edge_3174));
}
}
}
{ for(int _i_3175 = {0}; (_i_3175 < _uN); (_i_3175++))
{
bool sc98 = (_uA[int_ctor(clamp(float_ctor_int(_i_3175), 0.0, 15.0))].w < 7.5);
if (sc98)
{
(sc98 = (_i_3175 != _uSel));
}
if (sc98)
{
continue;
}
float _tg_3176 = f_traceOne_int(_i_3175, _ro_3134, _rd_3135, (min(_tS_3141, 40.0) - 0.00400000019));
if ((_tg_3176 > 0.0))
{
float3 _pg_3177 = (_ro_3134 + (_rd_3135 * _tg_3176));
float3 _ng_3178 = {0.0, 0.0, 0.0};
{ for(int _j_3179 = min(_uN, 0); (_j_3179 < 4); (_j_3179++))
{
float3 _s_3180 = ((2.0 * vec3_ctor_int_int_int((((_j_3179 + 3) >> 1) & 1), ((_j_3179 >> 1) & 1), (_j_3179 & 1))) - 1.0);
(_ng_3178 += ((_s_3180 * f_sdPrim_int(_i_3175, (_pg_3177 + (_s_3180 * 0.00200000009)))) + float3(0.0, 0.0, 0.0)));
}
}
(_ng_3178 = normalize(_ng_3178));
float sca3 = (1.0 - abs(dot(_ng_3178, _rd_3135)));
float _rim_3181 = (sca3 * sca3);
float sc99 = {0};
if ((_i_3175 == _uSel))
{
(sc99 = (0.159999996 + (0.5 * _rim_3181)));
}
else
{
(sc99 = (0.0500000007 + (0.219999999 * _rim_3181)));
}
float _a_3182 = sc99;
float3 sc9a = {0, 0, 0};
if ((_i_3175 == _uSel))
{
(sc9a = float3(0.550000012, 0.800000012, 1.0));
}
else
{
(sc9a = lerp(float3(0.850000024, 0.850000024, 0.850000024), pow(_uC[int_ctor(clamp(float_ctor_int(_i_3175), 0.0, 15.0))].xyz, float3(0.454545438, 0.454545438, 0.454545438)), 0.5));
}
float3 _gc_3183 = sc9a;
(_col_3143 = lerp(_col_3143, _gc_3183, _a_3182));
}
}
}
if ((_uProbeN > 0))
{
float3 _pd_3184 = (_uProbeE - _uProbeO);
float _pl_3185 = length(_pd_3184);
(_pd_3184 /= max(_pl_3185, 9.99999975e-06));
float3 _w0_3186 = (_ro_3134 - _uProbeO);
float _b_3187 = dot(_rd_3135, _pd_3184);
float _dd_3188 = dot(_rd_3135, _w0_3186);
float _ee_3189 = dot(_pd_3184, _w0_3186);
float _den_3190 = (1.0 - (_b_3187 * _b_3187));
if ((_den_3190 > 9.99999997e-07))
{
float _sc_3191 = (((_b_3187 * _ee_3189) - _dd_3188) / _den_3190);
float _tc_3192 = clamp(((_ee_3189 - (_b_3187 * _dd_3188)) / _den_3190), 0.0, _pl_3185);
(_sc_3191 = dot(((_uProbeO + (_pd_3184 * _tc_3192)) - _ro_3134), _rd_3135));
bool sc9b = (_sc_3191 > 0.0);
if (sc9b)
{
(sc9b = (_sc_3191 < (_tS_3141 + 0.00999999978)));
}
if (sc9b)
{
float _dist_3193 = length(((_ro_3134 + (_rd_3135 * _sc_3191)) - (_uProbeO + (_pd_3184 * _tc_3192))));
float _wl_3194 = (0.00600000005 + ((_pixR_3136 * _sc_3191) * 1.5));
(_col_3143 = lerp(_col_3143, float3(1.0, 0.920000017, 0.550000012), ((1.0 - smoothstep((_wl_3194 * 0.5), (_wl_3194 * 1.5), _dist_3193)) * 0.899999976)));
}
}
{ for(int _i_3195 = {0}; (_i_3195 < _uProbeN); (_i_3195++))
{
float4 _s_3196 = _uProbe[int_ctor(clamp(float_ctor_int(_i_3195), 0.0, 63.0))];
float3 _oc_3197 = (_ro_3134 - _s_3196.xyz);
float _bb_3198 = dot(_oc_3197, _rd_3135);
float _fi_3199 = (float_ctor_int(_i_3195) / max(float_ctor_int((_uProbeN - 1)), 1.0));
float3 _sc_3200 = lerp(float3(0.349999994, 0.850000024, 1.0), float3(0.75, 0.449999988, 1.0), _fi_3199);
float _c2_3201 = (dot(_oc_3197, _oc_3197) - (_s_3196.w * _s_3196.w));
float _disc_3202 = ((_bb_3198 * _bb_3198) - _c2_3201);
bool sc9c = (_s_3196.w > 0.00300000003);
if (sc9c)
{
(sc9c = (_disc_3202 > 0.0));
}
if (sc9c)
{
float _t0_3203 = ((-_bb_3198) - sqrt(_disc_3202));
bool sc9d = (_t0_3203 > 0.0);
if (sc9d)
{
(sc9d = (_t0_3203 < _tS_3141));
}
if (sc9d)
{
float3 _n_3204 = normalize((_oc_3197 + (_rd_3135 * _t0_3203)));
float sca4 = (1.0 - abs(dot(_n_3204, _rd_3135)));
float _rim_3205 = ((sca4 * sca4) * sca4);
(_col_3143 = lerp(_col_3143, _sc_3200, (0.0500000007 + (0.449999988 * _rim_3205))));
}
}
float _rdot_3206 = (0.0219999999 + ((_pixR_3136 * max((-_bb_3198), 0.0)) * 2.0));
float _c3_3207 = (dot(_oc_3197, _oc_3197) - (_rdot_3206 * _rdot_3206));
float _disc3_3208 = ((_bb_3198 * _bb_3198) - _c3_3207);
bool sc9e = (_disc3_3208 > 0.0);
if (sc9e)
{
(sc9e = ((-_bb_3198) < (_tS_3141 + 0.0199999996)));
}
if (sc9e)
{
float3 sc9f = {0, 0, 0};
bool sca0 = (_i_3195 == (_uProbeN - 1));
if (sca0)
{
(sca0 = (_uProbeHit == 1));
}
if (sca0)
{
(sc9f = float3(1.0, 0.349999994, 0.550000012));
}
else
{
(sc9f = float3(1.0, 0.920000017, 0.550000012));
}
(_col_3143 = lerp(_col_3143, sc9f, 0.949999988));
}
}
}
}
(out_outColor = vec4_ctor(_col_3143, 1.0));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
