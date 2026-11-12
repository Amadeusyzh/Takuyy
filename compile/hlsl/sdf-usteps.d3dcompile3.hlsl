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
{ for(int _i_3042 = {0}; (_i_3042 < 16); (_i_3042++))
{
if ((_i_3042 >= _uN))
{
break;
}
float4 _a_3043 = _uA[int_ctor(clamp(float_ctor_int(_i_3042), 0.0, 15.0))];
bool _carve_3044 = (_a_3043.w > 7.5);
float _lb_3045 = (length((_p_3039 - _a_3043.xyz)) - _uC[int_ctor(clamp(float_ctor_int(_i_3042), 0.0, 15.0))].w);
bool sc88 = {0};
if (_carve_3044)
{
(sc88 = (_lb_3045 >= (_k_3041 - _d_3040)));
}
else
{
(sc88 = (_lb_3045 >= (_d_3040 + _k_3041)));
}
if (sc88)
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
{ for(int _i_3054 = {0}; (_i_3054 < 16); (_i_3054++))
{
if ((_i_3054 >= _uN))
{
break;
}
float4 _a_3055 = _uA[int_ctor(clamp(float_ctor_int(_i_3054), 0.0, 15.0))];
bool _carve_3056 = (_a_3055.w > 7.5);
float _lb_3057 = (length((_p_3050 - _a_3055.xyz)) - _uC[int_ctor(clamp(float_ctor_int(_i_3054), 0.0, 15.0))].w);
bool sc89 = {0};
if (_carve_3056)
{
(sc89 = (_lb_3057 >= (_k_3052 - _d_3051)));
}
else
{
(sc89 = (_lb_3057 >= (_d_3051 + _k_3052)));
}
if (sc89)
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
return normalize(((((float3(1.0, -1.0, -1.0) * f_map((_p_3064 + (float3(1.0, -1.0, -1.0) * _e_3065)))) + (float3(-1.0, -1.0, 1.0) * f_map((_p_3064 + (float3(-1.0, -1.0, 1.0) * _e_3065))))) + (float3(-1.0, 1.0, -1.0) * f_map((_p_3064 + (float3(-1.0, 1.0, -1.0) * _e_3065))))) + (float3(1.0, 1.0, 1.0) * f_map((_p_3064 + (float3(1.0, 1.0, 1.0) * _e_3065))))));
}
float f_trace_int_int(in float3 _ro_3068, in float3 _rd_3069, in float _pixR_3070, inout int _steps_3071, inout int _status_3072)
{
float _t_3073 = {0.0};
float _omega_3074 = _uOmega;
float _prevF_3075 = {0.0};
float _stepLen_3076 = {0.0};
(_steps_3071 = 0);
(_status_3072 = -1);
{ for(int _i_3077 = {0}; (_i_3077 < _uMaxSteps); (_i_3077++))
{
(_steps_3071++);
float _f_3078 = f_map((_ro_3068 + (_rd_3069 * _t_3073)));
bool sc8a = (_omega_3074 > 1.0);
if (sc8a)
{
(sc8a = ((abs(_f_3078) + _prevF_3075) < _stepLen_3076));
}
if (sc8a)
{
(_t_3073 += (_prevF_3075 - _stepLen_3076));
(_stepLen_3076 = _prevF_3075);
(_omega_3074 = 1.0);
continue;
}
if ((_f_3078 < ((_pixR_3070 * _t_3073) + 9.99999975e-05)))
{
(_status_3072 = 1);
break;
}
(_stepLen_3076 = (_f_3078 * _omega_3074));
(_prevF_3075 = _f_3078);
(_t_3073 += _stepLen_3076);
if ((_t_3073 > 40.0))
{
(_status_3072 = 0);
break;
}
}
}
return _t_3073;
}
float f_shadow(in float3 _ro_3080, in float3 _rd_3081)
{
float _res_3082 = {1.0};
float _t_3083 = {0.0149999997};
float _ph_3084 = {10000000000.0};
{ for(int _i_3085 = min(_uN, 0); (_i_3085 < 56); (_i_3085++))
{
float _h_3086 = f_map((_ro_3080 + (_rd_3081 * _t_3083)));
if ((_h_3086 < 0.00039999999))
{
return 0.0;
}
if ((_uSoft == 1))
{
float _y_3087 = ((_h_3086 * _h_3086) / (2.0 * _ph_3084));
float _d_3088 = sqrt(max(((_h_3086 * _h_3086) - (_y_3087 * _y_3087)), 0.0));
(_res_3082 = min(_res_3082, ((9.0 * _d_3088) / max(9.99999975e-05, (_t_3083 - _y_3087)))));
(_ph_3084 = _h_3086);
}
(_t_3083 += clamp(_h_3086, 0.00999999978, 0.449999988));
bool sc8b = (_t_3083 > 14.0);
if ((!sc8b))
{
(sc8b = (_res_3082 < 0.00200000009));
}
if (sc8b)
{
break;
}
}
}
(_res_3082 = clamp(_res_3082, 0.0, 1.0));
return ((_res_3082 * _res_3082) * (3.0 - (2.0 * _res_3082)));
}
float f_calcAO(in float3 _p_3090, in float3 _n_3091)
{
float _occ_3092 = {0.0};
float _sca_3093 = {1.0};
{ for(int _i_3094 = min(_uN, 0); (_i_3094 < 5); (_i_3094++))
{
float _h_3095 = (0.0149999997 + (0.109999999 * float_ctor_int(_i_3094)));
(_occ_3092 += ((_h_3095 - f_map((_p_3090 + (_n_3091 * _h_3095)))) * _sca_3093));
(_sca_3093 *= 0.850000024);
}
}
return clamp((1.0 - (2.20000005 * _occ_3092)), 0.0, 1.0);
}
float3 f_background(in float3 _rd_3097)
{
float _y_3098 = _rd_3097.y;
float3 _c_3099 = lerp(float3(0.0160000008, 0.0189999994, 0.0260000005), float3(0.00300000003, 0.00400000019, 0.00600000005), clamp((_y_3098 * 1.39999998), 0.0, 1.0));
float sca0 = clamp(dot(_rd_3097, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0);
(_c_3099 += ((float3(0.0500000007, 0.0399999991, 0.0299999993) * (((((sca0 * sca0) * sca0) * sca0) * sca0) * sca0)) * 0.25));
return _c_3099;
}
float3 f_aces(in float3 _x_3101)
{
return clamp(((_x_3101 * ((2.50999999 * _x_3101) + 0.0299999993)) / ((_x_3101 * ((2.43000007 * _x_3101) + 0.589999974)) + 0.140000001)), 0.0, 1.0);
}
float3 f_heat(in float _x_3103)
{
(_x_3103 = clamp(_x_3103, 0.0, 1.0));
float3 _c0_3104 = {0.0599999987, 0.0399999991, 0.239999995};
float3 _c1_3105 = {0.119999997, 0.419999987, 0.860000014};
float3 _c2_3106 = {0.200000003, 0.779999971, 0.550000012};
float3 _c3_3107 = {0.980000019, 0.800000012, 0.200000003};
float3 _c4_3108 = {0.860000014, 0.159999996, 0.100000001};
if ((_x_3103 < 0.25))
{
return lerp(_c0_3104, _c1_3105, (_x_3103 * 4.0));
}
if ((_x_3103 < 0.5))
{
return lerp(_c1_3105, _c2_3106, ((_x_3103 * 4.0) - 1.0));
}
if ((_x_3103 < 0.75))
{
return lerp(_c2_3106, _c3_3107, ((_x_3103 * 4.0) - 2.0));
}
return lerp(_c3_3107, _c4_3108, ((_x_3103 * 4.0) - 3.0));
}
float3 f_fieldColor(in float _d_3110, in float _w_3111)
{
float3 sc8c = {0, 0, 0};
if ((_d_3110 > 0.0))
{
(sc8c = float3(0.959999979, 0.620000005, 0.300000012));
}
else
{
(sc8c = float3(0.400000006, 0.680000007, 0.980000019));
}
float3 _col_3112 = sc8c;
(_col_3112 *= (1.0 - (0.720000029 * exp((-4.0 * abs(_d_3110))))));
float _band_3113 = (abs((frac(((_d_3110 * 10.0) + 0.5)) - 0.5)) / max((_w_3111 * 10.0), 9.99999975e-05));
(_col_3112 *= lerp(0.699999988, 1.0, smoothstep(0.0, 1.5, _band_3113)));
(_col_3112 = lerp(_col_3112, float3(1.0, 1.0, 1.0), (1.0 - smoothstep(0.00400000019, (0.0120000001 + (1.5 * _w_3111)), abs(_d_3110)))));
return _col_3112;
}
float f_traceOne_int(in int _i_3115, in float3 _ro_3116, in float3 _rd_3117, in float _tEnd_3118)
{
float3 _oc_3119 = (_ro_3116 - _uA[int_ctor(clamp(float_ctor_int(_i_3115), 0.0, 15.0))].xyz);
float _r_3120 = _uC[int_ctor(clamp(float_ctor_int(_i_3115), 0.0, 15.0))].w;
float _b_3121 = dot(_oc_3119, _rd_3117);
float _c_3122 = (dot(_oc_3119, _oc_3119) - (_r_3120 * _r_3120));
float _disc_3123 = ((_b_3121 * _b_3121) - _c_3122);
if ((_disc_3123 < 0.0))
{
return -1.0;
}
float _sq_3124 = sqrt(_disc_3123);
float _t_3125 = max(((-_b_3121) - _sq_3124), 0.0);
float _t1_3126 = min(((-_b_3121) + _sq_3124), _tEnd_3118);
{ for(int _s_3127 = min(_uN, 0); (_s_3127 < 40); (_s_3127++))
{
if ((_t_3125 > _t1_3126))
{
return -1.0;
}
float _f_3128 = f_sdPrim_int(_i_3115, (_ro_3116 + (_rd_3117 * _t_3125)));
if ((_f_3128 < 0.00200000009))
{
return _t_3125;
}
(_t_3125 += _f_3128);
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

float2 _frag_3130 = (gl_FragCoord.xy + _uJitter);
float2 _uv_3131 = (((2.0 * _frag_3130) - _uRes) / _uRes.y);
float3 _ro_3132 = _uCamPos;
float3 _rd_3133 = normalize((_uCamF + (_uTanHalf * ((_uv_3131.x * _uCamR) + (_uv_3131.y * _uCamU)))));
float _pixR_3134 = (_uTanHalf / _uRes.y);
float sc8d = {0};
if ((_uView == 2))
{
(sc8d = _uSliceH);
}
else
{
(sc8d = 100000.0);
}
(_gClip_3028 = sc8d);
int _steps_3135 = {0};
int _status_3136 = {0};
float _t_3137 = f_trace_int_int(_ro_3132, _rd_3133, _pixR_3134, _steps_3135, _status_3136);
bool _hit_3138 = (_status_3136 == 1);
float sc8e = {0};
if (_hit_3138)
{
(sc8e = _t_3137);
}
else
{
(sc8e = 100000.0);
}
float _tS_3139 = sc8e;
float3 _p_3140 = (_ro_3132 + (_rd_3133 * _t_3137));
float3 _col_3141 = {0, 0, 0};
if ((_uView == 1))
{
if ((_status_3136 == -1))
{
(_col_3141 = float3(1.0, 1.0, 1.0));
}
else
{
(_col_3141 = f_heat((float_ctor_int(_steps_3135) / float_ctor_int(min(_uMaxSteps, 48)))));
if (_hit_3138)
{
float3 _n_3142 = f_calcNormal(_p_3140, max(0.000699999975, (_pixR_3134 * _t_3137)));
(_col_3141 *= (0.720000029 + (0.280000001 * clamp(dot(_n_3142, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0))));
}
}
}
else
{
if (_hit_3138)
{
float3 _n_3143 = f_calcNormal(_p_3140, max(0.000699999975, (_pixR_3134 * _t_3137)));
float _dObj_3144 = f_mapObj(_p_3140);
bool _floorHit_3145 = (_p_3140.y < _dObj_3144);
bool sc90 = (_uView == 2);
if (sc90)
{
(sc90 = (_dObj_3144 < 0.0));
}
bool sc8f = sc90;
if (sc8f)
{
(sc8f = ((_p_3140.y - _uSliceH) > (min(_dObj_3144, _p_3140.y) - 9.99999975e-05)));
}
bool _cap_3146 = sc8f;
float3 _alb_3147 = {0, 0, 0};
float _spec_3148 = {0};
if (_floorHit_3145)
{
float _w_3149 = (((_pixR_3134 * _t_3137) * 2.0) / max(abs(_rd_3133.y), 0.0399999991));
float2 _g_3150 = (abs((frac(((_p_3140.xz * 2.0) + 0.5)) - 0.5)) / max((_w_3149 * 2.0), 9.99999975e-05));
float _line_3151 = (1.0 - smoothstep(0.0, 1.0, min(_g_3150.x, _g_3150.y)));
float2 _g2_3152 = (abs(_p_3140.xz) / max(_w_3149, 9.99999975e-05));
float _axis_3153 = (1.0 - smoothstep(0.0, 1.5, min(_g2_3152.x, _g2_3152.y)));
(_alb_3147 = ((float3(0.075000003, 0.0799999982, 0.0900000036) * (1.0 + ((0.449999988 * _line_3151) * exp(((-0.00499999989 * _t_3137) * _t_3137))))) + (float3(0.0299999993, 0.0299999993, 0.0299999993) * _axis_3153)));
(_spec_3148 = 0.150000006);
}
else
{
(_alb_3147 = f_objColor(_p_3140));
(_spec_3148 = 1.0);
}
float _sh_3154 = f_shadow((_p_3140 + (_n_3143 * 0.00200000009)), float3(-0.436890006, 0.757279992, 0.485439986));
float sc91 = {0};
if ((_uAO == 1))
{
(sc91 = f_calcAO(_p_3140, _n_3143));
}
else
{
(sc91 = 1.0);
}
float _ao_3155 = sc91;
float _dif_3156 = (clamp(dot(_n_3143, float3(-0.436890006, 0.757279992, 0.485439986)), 0.0, 1.0) * _sh_3154);
float3 _hv_3157 = normalize((float3(-0.436890006, 0.757279992, 0.485439986) - _rd_3133));
float _nh_3158 = clamp(dot(_n_3143, _hv_3157), 0.0, 1.0);
float sca1 = clamp((1.0 + dot(_n_3143, _rd_3133)), 0.0, 1.0);
float _fre_3159 = ((((sca1 * sca1) * sca1) * sca1) * sca1);
float _sp_3160 = (((((pow(_nh_3158, 60.0) * 2.0) + (pow(_nh_3158, 12.0) * 0.25)) * _dif_3156) * _spec_3148) * ((0.0399999991 + (0.959999979 * _fre_3159)) + 0.25));
float _skyD_3161 = ((0.600000024 + (0.400000006 * _n_3143.y)) * _ao_3155);
float _bounce_3162 = (clamp((0.400000006 - (0.600000024 * _n_3143.y)), 0.0, 1.0) * _ao_3155);
float _back_3163 = (clamp(dot(_n_3143, float3(0.668959618, 0.0, -0.74329865)), 0.0, 1.0) * _ao_3155);
(_col_3141 = (_alb_3147 * ((((_dif_3156 * float3(1.75, 1.58000004, 1.36000001)) + (_skyD_3161 * float3(0.200000003, 0.25, 0.340000004))) + (_bounce_3162 * float3(0.100000001, 0.0799999982, 0.0599999987))) + (_back_3163 * float3(0.100000001, 0.109999999, 0.140000001)))));
(_col_3141 += (_sp_3160 * float3(1.79999995, 1.70000005, 1.5)));
(_col_3141 += (((_fre_3159 * _ao_3155) * _spec_3148) * float3(0.100000001, 0.129999995, 0.180000007)));
bool sc92 = (_uSel >= 0);
if (sc92)
{
(sc92 = (!_floorHit_3145));
}
if (sc92)
{
float _ds_3164 = abs(f_sdPrim_int(_uSel, _p_3140));
(_col_3141 = lerp(_col_3141, ((_col_3141 * float3(0.899999976, 1.04999995, 1.25)) + float3(0.0199999996, 0.0500000007, 0.100000001)), (1.0 - smoothstep(0.0, 0.0500000007, _ds_3164))));
}
if (((_uSel >= 0) && _floorHit_3145))
{
float _rr_3165 = length((_p_3140.xz - _uA[int_ctor(clamp(float_ctor_int(_uSel), 0.0, 15.0))].xz));
float _w_3166 = (((_pixR_3134 * _t_3137) * 2.0) / max(abs(_rd_3133.y), 0.0399999991));
float _ring_3167 = (1.0 - smoothstep(0.0, ((1.5 * _w_3166) + 0.00800000038), abs((_rr_3165 - _uC[int_ctor(clamp(float_ctor_int(_uSel), 0.0, 15.0))].w))));
(_col_3141 += (float3(0.0799999982, 0.159999996, 0.300000012) * _ring_3167));
}
float sc93 = {0};
if (_floorHit_3145)
{
(sc93 = smoothstep(9.0, 26.0, _t_3137));
}
else
{
(sc93 = 0.0);
}
(_col_3141 = lerp(_col_3141, f_background(_rd_3133), max((1.0 - exp(((-0.00120000006 * _t_3137) * _t_3137))), sc93)));
(_col_3141 = pow(f_aces(_col_3141), float3(0.454545438, 0.454545438, 0.454545438)));
if (_cap_3146)
{
float _w_3168 = (((_pixR_3134 * _t_3137) * 2.0) / max(abs(_rd_3133.y), 0.0399999991));
(_col_3141 = (f_fieldColor(f_mapObj(vec3_ctor(_p_3140.x, _uSliceH, _p_3140.z)), _w_3168) * (0.699999988 + (0.300000012 * _sh_3154))));
}
}
else
{
(_col_3141 = pow(f_aces((f_background(_rd_3133) * 1.10000002)), float3(0.454545438, 0.454545438, 0.454545438)));
}
if ((_uView == 2))
{
float _tp_3169 = ((_uSliceH - _ro_3132.y) / _rd_3133.y);
float3 _pp_3170 = (_ro_3132 + (_rd_3133 * _tp_3169));
bool sc96 = (_tp_3169 > 0.0);
if (sc96)
{
(sc96 = (_tp_3169 < (_tS_3139 - 0.00300000003)));
}
bool sc95 = sc96;
if (sc95)
{
(sc95 = (abs(_pp_3170.x) < 3.0));
}
bool sc94 = sc95;
if (sc94)
{
(sc94 = (abs(_pp_3170.z) < 3.0));
}
if (sc94)
{
float _w_3171 = (((_pixR_3134 * _tp_3169) * 2.0) / max(abs(_rd_3133.y), 0.0399999991));
float3 _fc_3172 = f_fieldColor(f_mapObj(_pp_3170), _w_3171);
float _edge_3173 = (1.0 - smoothstep(0.0, ((1.5 * _w_3171) + 0.00400000019), (3.0 - max(abs(_pp_3170.x), abs(_pp_3170.z)))));
(_col_3141 = lerp(_col_3141, _fc_3172, 0.720000029));
(_col_3141 = lerp(_col_3141, float3(0.899999976, 0.899999976, 0.899999976), _edge_3173));
}
}
}
{ for(int _i_3174 = {0}; (_i_3174 < 16); (_i_3174++))
{
if ((_i_3174 >= _uN))
{
break;
}
bool sc97 = (_uA[int_ctor(clamp(float_ctor_int(_i_3174), 0.0, 15.0))].w < 7.5);
if (sc97)
{
(sc97 = (_i_3174 != _uSel));
}
if (sc97)
{
continue;
}
float _tg_3175 = f_traceOne_int(_i_3174, _ro_3132, _rd_3133, (min(_tS_3139, 40.0) - 0.00400000019));
if ((_tg_3175 > 0.0))
{
float3 _pg_3176 = (_ro_3132 + (_rd_3133 * _tg_3175));
float _e_3178 = {0.00200000009};
float3 _ng_3179 = normalize(((((float3(1.0, -1.0, -1.0) * f_sdPrim_int(_i_3174, (_pg_3176 + (float3(1.0, -1.0, -1.0) * _e_3178)))) + (float3(-1.0, -1.0, 1.0) * f_sdPrim_int(_i_3174, (_pg_3176 + (float3(-1.0, -1.0, 1.0) * _e_3178))))) + (float3(-1.0, 1.0, -1.0) * f_sdPrim_int(_i_3174, (_pg_3176 + (float3(-1.0, 1.0, -1.0) * _e_3178))))) + (float3(1.0, 1.0, 1.0) * f_sdPrim_int(_i_3174, (_pg_3176 + (float3(1.0, 1.0, 1.0) * _e_3178))))));
float sca2 = (1.0 - abs(dot(_ng_3179, _rd_3133)));
float _rim_3180 = (sca2 * sca2);
float sc98 = {0};
if ((_i_3174 == _uSel))
{
(sc98 = (0.159999996 + (0.5 * _rim_3180)));
}
else
{
(sc98 = (0.0500000007 + (0.219999999 * _rim_3180)));
}
float _a_3181 = sc98;
float3 sc99 = {0, 0, 0};
if ((_i_3174 == _uSel))
{
(sc99 = float3(0.550000012, 0.800000012, 1.0));
}
else
{
(sc99 = lerp(float3(0.850000024, 0.850000024, 0.850000024), pow(_uC[int_ctor(clamp(float_ctor_int(_i_3174), 0.0, 15.0))].xyz, float3(0.454545438, 0.454545438, 0.454545438)), 0.5));
}
float3 _gc_3182 = sc99;
(_col_3141 = lerp(_col_3141, _gc_3182, _a_3181));
}
}
}
if ((_uProbeN > 0))
{
float3 _pd_3183 = (_uProbeE - _uProbeO);
float _pl_3184 = length(_pd_3183);
(_pd_3183 /= max(_pl_3184, 9.99999975e-06));
float3 _w0_3185 = (_ro_3132 - _uProbeO);
float _b_3186 = dot(_rd_3133, _pd_3183);
float _dd_3187 = dot(_rd_3133, _w0_3185);
float _ee_3188 = dot(_pd_3183, _w0_3185);
float _den_3189 = (1.0 - (_b_3186 * _b_3186));
if ((_den_3189 > 9.99999997e-07))
{
float _sc_3190 = (((_b_3186 * _ee_3188) - _dd_3187) / _den_3189);
float _tc_3191 = clamp(((_ee_3188 - (_b_3186 * _dd_3187)) / _den_3189), 0.0, _pl_3184);
(_sc_3190 = dot(((_uProbeO + (_pd_3183 * _tc_3191)) - _ro_3132), _rd_3133));
bool sc9a = (_sc_3190 > 0.0);
if (sc9a)
{
(sc9a = (_sc_3190 < (_tS_3139 + 0.00999999978)));
}
if (sc9a)
{
float _dist_3192 = length(((_ro_3132 + (_rd_3133 * _sc_3190)) - (_uProbeO + (_pd_3183 * _tc_3191))));
float _wl_3193 = (0.00600000005 + ((_pixR_3134 * _sc_3190) * 1.5));
(_col_3141 = lerp(_col_3141, float3(1.0, 0.920000017, 0.550000012), ((1.0 - smoothstep((_wl_3193 * 0.5), (_wl_3193 * 1.5), _dist_3192)) * 0.899999976)));
}
}
{ for(int _i_3194 = {0}; (_i_3194 < _uProbeN); (_i_3194++))
{
float4 _s_3195 = _uProbe[int_ctor(clamp(float_ctor_int(_i_3194), 0.0, 63.0))];
float3 _oc_3196 = (_ro_3132 - _s_3195.xyz);
float _bb_3197 = dot(_oc_3196, _rd_3133);
float _fi_3198 = (float_ctor_int(_i_3194) / max(float_ctor_int((_uProbeN - 1)), 1.0));
float3 _sc_3199 = lerp(float3(0.349999994, 0.850000024, 1.0), float3(0.75, 0.449999988, 1.0), _fi_3198);
float _c2_3200 = (dot(_oc_3196, _oc_3196) - (_s_3195.w * _s_3195.w));
float _disc_3201 = ((_bb_3197 * _bb_3197) - _c2_3200);
bool sc9b = (_s_3195.w > 0.00300000003);
if (sc9b)
{
(sc9b = (_disc_3201 > 0.0));
}
if (sc9b)
{
float _t0_3202 = ((-_bb_3197) - sqrt(_disc_3201));
bool sc9c = (_t0_3202 > 0.0);
if (sc9c)
{
(sc9c = (_t0_3202 < _tS_3139));
}
if (sc9c)
{
float3 _n_3203 = normalize((_oc_3196 + (_rd_3133 * _t0_3202)));
float sca3 = (1.0 - abs(dot(_n_3203, _rd_3133)));
float _rim_3204 = ((sca3 * sca3) * sca3);
(_col_3141 = lerp(_col_3141, _sc_3199, (0.0500000007 + (0.449999988 * _rim_3204))));
}
}
float _rdot_3205 = (0.0219999999 + ((_pixR_3134 * max((-_bb_3197), 0.0)) * 2.0));
float _c3_3206 = (dot(_oc_3196, _oc_3196) - (_rdot_3205 * _rdot_3205));
float _disc3_3207 = ((_bb_3197 * _bb_3197) - _c3_3206);
bool sc9d = (_disc3_3207 > 0.0);
if (sc9d)
{
(sc9d = ((-_bb_3197) < (_tS_3139 + 0.0199999996)));
}
if (sc9d)
{
float3 sc9e = {0, 0, 0};
bool sc9f = (_i_3194 == (_uProbeN - 1));
if (sc9f)
{
(sc9f = (_uProbeHit == 1));
}
if (sc9f)
{
(sc9e = float3(1.0, 0.349999994, 0.550000012));
}
else
{
(sc9e = float3(1.0, 0.920000017, 0.550000012));
}
(_col_3141 = lerp(_col_3141, sc9e, 0.949999988));
}
}
}
}
(out_outColor = vec4_ctor(_col_3141, 1.0));
return generateOutput();
}
