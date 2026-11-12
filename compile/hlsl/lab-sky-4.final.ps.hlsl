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
float3 vec3_ctor(float x0)
{
    return float3(x0, x0, x0);
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

uniform float _uCamR : register(c0);
uniform float3 _uSunDir : register(c1);
uniform float _uCoverage : register(c2);
uniform float3 _uWind : register(c3);
uniform float _uDensity : register(c4);
uniform float2 _uRes : register(c5);
uniform float3 _uCamPos : register(c6);
uniform float3 _uCamF : register(c7);
uniform float3 _uCamRt : register(c8);
uniform float3 _uCamUp : register(c9);
uniform float _uTanH : register(c10);
uniform float _uAspect : register(c11);
uniform int _uSteps : register(c12);
uniform int _uLightSteps : register(c13);
uniform int _uOctaves : register(c14);
uniform int _uPhase : register(c15);
uniform int _uPowder : register(c16);
uniform int _uView : register(c17);
uniform float _uFrame : register(c18);
uniform float2 _uJitter : register(c19);
uniform float3 _uSunE : register(c20);
uniform float _uPixAngle : register(c21);
static const uint _uTrans = 0;
static const uint _uSky = 1;
static const uint _uWeather = 2;
uniform Texture2D<float4> textures2D[3] : register(t0);
uniform SamplerState samplers2D[3] : register(s0);
static const uint _uShape = 3;
static const uint _uDetail = 4;
static const uint textureIndexOffset3D = 3;
static const uint samplerIndexOffset3D = 3;
uniform Texture3D<float4> textures3D[2] : register(t3);
uniform SamplerState samplers3D[2] : register(s3);
#define ANGLE_USES_NESTED_BREAK
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

float4 gl_texture2DLod(uint samplerIndex, float2 t, float lod)
{
    return textures2D[samplerIndex].SampleLevel(samplers2D[samplerIndex], float2(t.x, t.y), lod);
}

float4 gl_texture2DLod0(uint samplerIndex, float2 t)
{
    return textures2D[samplerIndex].SampleLevel(samplers2D[samplerIndex], float2(t.x, t.y), 0);
}

float4 gl_texture3DLod(uint samplerIndex, float3 t, float lod)
{
    const uint textureIndex = samplerIndex - textureIndexOffset3D;
    const uint samplerArrayIndex = samplerIndex - samplerIndexOffset3D;
    return textures3D[textureIndex].SampleLevel(samplers3D[samplerArrayIndex], float3(t.x, t.y, t.z), lod);
}

#define GL_USES_FRAG_COORD
float2 f_sphere(in float3 _ro_3009, in float3 _rd_3010, in float _r_3011)
{
float _l_3012 = length(_ro_3009);
float _b_3013 = dot(_ro_3009, _rd_3010);
float _c_3014 = ((_l_3012 - _r_3011) * (_l_3012 + _r_3011));
float _d_3015 = ((_b_3013 * _b_3013) - _c_3014);
if ((_d_3015 < 0.0))
{
return float2(-1.0, -1.0);
}
(_d_3015 = sqrt(_d_3015));
return vec2_ctor(((-_b_3013) - _d_3015), ((-_b_3013) + _d_3015));
}
float3 f_transLUT(in float _r_3033, in float _mu_3034)
{
float _H_3035 = {1132.25439};
float _rho_3036 = sqrt(max(0.0, ((_r_3033 - 6360.0) * (_r_3033 + 6360.0))));
float _disc_3037 = (((_r_3033 * _r_3033) * ((_mu_3034 * _mu_3034) - 1.0)) + 41731600.0);
float _d_3038 = max(0.0, (((-_r_3033) * _mu_3034) + sqrt(max(_disc_3037, 0.0))));
float _dmin_3039 = (6460.0 - _r_3033);
float _dmax_3040 = (_rho_3036 + _H_3035);
return gl_texture2D(_uTrans, vec2_ctor(((_d_3038 - _dmin_3039) / (_dmax_3040 - _dmin_3039)), (_rho_3036 / _H_3035))).xyz;
}
float3 f_transLUTLod0(in float _r_3033, in float _mu_3034)
{
float _H_3035 = {1132.25439};
float _rho_3036 = sqrt(max(0.0, ((_r_3033 - 6360.0) * (_r_3033 + 6360.0))));
float _disc_3037 = (((_r_3033 * _r_3033) * ((_mu_3034 * _mu_3034) - 1.0)) + 41731600.0);
float _d_3038 = max(0.0, (((-_r_3033) * _mu_3034) + sqrt(max(_disc_3037, 0.0))));
float _dmin_3039 = (6460.0 - _r_3033);
float _dmax_3040 = (_rho_3036 + _H_3035);
return gl_texture2DLod0(_uTrans, vec2_ctor(((_d_3038 - _dmin_3039) / (_dmax_3040 - _dmin_3039)), (_rho_3036 / _H_3035))).xyz;
}
float3 f_sunTrans(in float3 _p_3042, in float3 _sun_3043)
{
float _r_3044 = length(_p_3042);
float _mu_3045 = (dot(_p_3042, _sun_3043) / _r_3044);
float _x_3046 = (6360.0 / _r_3044);
float _muH_3047 = (-sqrt(max(0.0, (1.0 - (_x_3046 * _x_3046)))));
return (f_transLUT(_r_3044, _mu_3045) * smoothstep((_muH_3047 - 0.00499999989), (_muH_3047 + 0.00499999989), _mu_3045));
}
float3 f_sunTransLod0(in float3 _p_3042, in float3 _sun_3043)
{
float _r_3044 = length(_p_3042);
float _mu_3045 = (dot(_p_3042, _sun_3043) / _r_3044);
float _x_3046 = (6360.0 / _r_3044);
float _muH_3047 = (-sqrt(max(0.0, (1.0 - (_x_3046 * _x_3046)))));
return (f_transLUTLod0(_r_3044, _mu_3045) * smoothstep((_muH_3047 - 0.00499999989), (_muH_3047 + 0.00499999989), _mu_3045));
}
float3 f_transSeg(in float3 _ro_3053, in float3 _rd_3054, in float _t_3055, in bool _ground_3056)
{
float3 _pb_3057 = (_ro_3053 + (_rd_3054 * _t_3055));
float _ra_3058 = length(_ro_3053);
float _rb_3059 = length(_pb_3057);
float _mua_3060 = (dot(_ro_3053, _rd_3054) / _ra_3058);
float _mub_3061 = (dot(_pb_3057, _rd_3054) / _rb_3059);
float3 sc9e = {0, 0, 0};
if (_ground_3056)
{
(sc9e = (f_transLUT(_rb_3059, (-_mub_3061)) / max(f_transLUT(_ra_3058, (-_mua_3060)), float3(9.99999997e-07, 9.99999997e-07, 9.99999997e-07))));
}
else
{
(sc9e = (f_transLUT(_ra_3058, _mua_3060) / max(f_transLUT(_rb_3059, _mub_3061), float3(9.99999997e-07, 9.99999997e-07, 9.99999997e-07))));
}
float3 _v_3062 = sc9e;
return clamp(_v_3062, 0.0, 1.0);
}
float3 f_skyLUT(in float _cosV_3066, in float _cosPhi_3067)
{
float _r_3068 = _uCamR;
float _vh_3069 = sqrt(max(0.0, ((_r_3068 - 6360.0) * (_r_3068 + 6360.0))));
float _beta_3070 = acos(clamp((_vh_3069 / _r_3068), -1.0, 1.0));
float _zha_3071 = (3.14159274 - _beta_3070);
float _vz_3072 = acos(clamp(_cosV_3066, -1.0, 1.0));
float sc9f = {0};
if ((_vz_3072 < _zha_3071))
{
(sc9f = (0.5 * (1.0 - sqrt(max(0.0, (1.0 - (_vz_3072 / _zha_3071)))))));
}
else
{
(sc9f = (0.5 + (0.5 * sqrt(max(0.0, ((_vz_3072 - _zha_3071) / _beta_3070))))));
}
float _v_3073 = sc9f;
float _u_3074 = sqrt(clamp((0.5 - (0.5 * _cosPhi_3067)), 0.0, 1.0));
return gl_texture2D(_uSky, vec2_ctor(_u_3074, _v_3073)).xyz;
}
float3 f_skyDir(in float3 _rd_3077)
{
float2 _a_3078 = _rd_3077.xz;
float2 _b_3079 = _uSunDir.xz;
float _la_3080 = length(_a_3078);
float _lb_3081 = length(_b_3079);
float sca0 = {0};
bool sca1 = (_la_3080 > 9.99999975e-05);
if (sca1)
{
(sca1 = (_lb_3081 > 9.99999975e-05));
}
if (sca1)
{
(sca0 = (dot(_a_3078, _b_3079) / (_la_3080 * _lb_3081)));
}
else
{
(sca0 = 1.0);
}
float _cp_3082 = sca0;
return f_skyLUT(_rd_3077.y, _cp_3082);
}
float f_remap(in float _v_3091, in float _a_3092, in float _b_3093, in float _c_3094, in float _d_3095)
{
return (_c_3094 + (((_v_3091 - _a_3092) * (_d_3095 - _c_3094)) / (_b_3093 - _a_3092)));
}
float f_cloudBase(in float3 _p_3097, in float _lod_3098, inout float _hf_3099)
{
(_hf_3099 = (((length(_p_3097) - 6360.0) - 1.5) / 2.5));
bool sca2 = (_hf_3099 <= 0.0);
if ((!sca2))
{
(sca2 = (_hf_3099 >= 1.0));
}
if (sca2)
{
return 0.0;
}
float3 _q_3100 = (_p_3097 - float3(0.0, 6360.0, 0.0));
float4 _w_3101 = gl_texture2DLod(_uWeather, ((_q_3100.xz + (_uWind.xz * 0.600000024)) / 48.0), 0.0);
float _th_3102 = clamp(((1.0 - (0.419999987 * _uCoverage)) - (0.300000012 * (_w_3101.x - 0.5))), 0.300000012, 0.995000005);
float _top_3103 = lerp(0.449999988, 1.0, smoothstep(0.25, 0.75, _w_3101.y));
float _prof_3104 = (smoothstep(0.0, 0.100000001, _hf_3099) * (1.0 - smoothstep((_top_3103 * 0.300000012), _top_3103, _hf_3099)));
if ((_prof_3104 <= 0.0))
{
return 0.0;
}
float4 _s_3105 = gl_texture3DLod(_uShape, (((_q_3100 + _uWind) + vec3_ctor(0.0, (_uWind.x * 0.0500000007), 0.0)) / 7.0), _lod_3098);
float _wf_3106 = (((_s_3105.y * 0.625) + (_s_3105.z * 0.25)) + (_s_3105.w * 0.125));
float _base_3107 = f_remap(_s_3105.x, (_wf_3106 - 1.0), 1.0, 0.0, 1.0);
float _e_3108 = ((_base_3107 - _th_3102) / (1.0 - _th_3102));
return clamp((_e_3108 - (1.0 - _prof_3104)), 0.0, 1.0);
}
float f_erode(in float _base_3110, in float3 _p_3111, in float _hf_3112, in float _lod_3113)
{
float3 _q_3114 = (_p_3111 - float3(0.0, 6360.0, 0.0));
float3 _d_3115 = gl_texture3DLod(_uDetail, ((_q_3114 + (_uWind * 1.60000002)) / 1.0), _lod_3113).xyz;
float _df_3116 = (((_d_3115.x * 0.625) + (_d_3115.y * 0.25)) + (_d_3115.z * 0.125));
float _dm_3117 = lerp(_df_3116, (1.0 - _df_3116), clamp((_hf_3112 * 4.0), 0.0, 1.0));
return max(f_remap(_base_3110, (_dm_3117 * 0.449999988), 1.0, 0.0, 1.0), 0.0);
}
float f_airShadow(in float3 _p_3132)
{
float _rm_3133 = {6362.75};
float _r_3134 = length(_p_3132);
float sca3 = {0};
if ((_r_3134 < _rm_3133))
{
(sca3 = min(max(f_sphere(_p_3132, _uSunDir, _rm_3133).y, 0.0), 15.0));
}
else
{
(sca3 = 0.0);
}
float _t_3135 = sca3;
float3 _q_3136 = ((_p_3132 + (_uSunDir * _t_3135)) - float3(0.0, 6360.0, 0.0));
float _w_3137 = gl_texture2DLod(_uWeather, ((_q_3136.xz + (_uWind.xz * 0.600000024)) / 48.0), 4.0).x;
float _th_3138 = ((1.0 - (0.419999987 * _uCoverage)) - (0.300000012 * (_w_3137 - 0.5)));
return (1.0 - clamp(((0.970000029 - _th_3138) * 2.5), 0.0, 1.0));
}
float3 f_rayDir(in float2 _uv_3147)
{
float2 _n_3148 = ((_uv_3147 * 2.0) - 1.0);
return normalize(((_uCamF + (_uCamRt * ((_n_3148.x * _uTanH) * _uAspect))) + (_uCamUp * (_n_3148.y * _uTanH))));
}
float f_hg(in float _mu_3160, in float _g_3161)
{
float _g2_3162 = (_g_3161 * _g_3161);
return ((1.0 - _g2_3162) / (12.566371 * pow(((1.0 + _g2_3162) - ((2.0 * _g_3161) * _mu_3160)), 1.5)));
}
float f_phase(in float _mu_3164, in float _s_3165)
{
if ((_uPhase == 0))
{
return 0.0795774683;
}
if ((_uPhase == 1))
{
return f_hg(_mu_3164, (0.800000012 * _s_3165));
}
return lerp(f_hg(_mu_3164, (-0.300000012 * _s_3165)), f_hg(_mu_3164, (0.800000012 * _s_3165)), 0.699999988);
}
float f_lightOD(in float3 _p_3167, in float _lod_3168)
{
float _od_3169 = {0.0};
float _t_3170 = {0.0};
float _ds_3171 = {0.0500000007};
float _hf_3172 = {0};
{ for(int _i_3173 = {0}; (_i_3173 < 6); (_i_3173++))
{
if ((_i_3173 >= _uLightSteps))
{
break;
}
float3 _s_3174 = (_p_3167 + (_uSunDir * (_t_3170 + (0.5 * _ds_3171))));
float _b_3175 = f_cloudBase(_s_3174, _lod_3168, _hf_3172);
bool sca4 = (_b_3175 > 0.0);
if (sca4)
{
(sca4 = (_i_3173 < 3));
}
if (sca4)
{
(_b_3175 = f_erode(_b_3175, _s_3174, _hf_3172, _lod_3168));
}
(_od_3169 += (_b_3175 * _ds_3171));
(_t_3170 += _ds_3171);
(_ds_3171 *= 1.89999998);
}
}
return (_od_3169 * _uDensity);
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

float2 _uv_3177 = ((gl_FragCoord.xy + _uJitter) / _uRes);
float3 _rd_3178 = f_rayDir(_uv_3177);
float3 _ro_3179 = _uCamPos;
float _r_3180 = length(_ro_3179);
float2 _iB_3181 = f_sphere(_ro_3179, _rd_3178, 6361.5);
float2 _iT_3182 = f_sphere(_ro_3179, _rd_3178, 6364.0);
float _tG_3183 = f_sphere(_ro_3179, _rd_3178, 6360.0).x;
bool _ground_3184 = (_tG_3183 > 0.0);
float _t0_3185 = {0.0};
float _t1_3186 = {-1.0};
if ((_r_3180 < 6361.5))
{
if ((!_ground_3184))
{
(_t0_3185 = _iB_3181.y);
(_t1_3186 = _iT_3182.y);
}
}
else
{
if ((_r_3180 > 6364.0))
{
if ((_iT_3182.x > 0.0))
{
(_t0_3185 = _iT_3182.x);
float sca5 = {0};
if ((_iB_3181.x > 0.0))
{
(sca5 = _iB_3181.x);
}
else
{
(sca5 = _iT_3182.y);
}
(_t1_3186 = sca5);
}
}
else
{
float sca6 = {0};
if ((_iB_3181.x > 0.0))
{
(sca6 = _iB_3181.x);
}
else
{
(sca6 = _iT_3182.y);
}
(_t1_3186 = sca6);
}
}
(_t1_3186 = min(_t1_3186, 160.0));
if ((_t1_3186 <= _t0_3185))
{
(out_outColor = float4(0.0, 0.0, 0.0, 1.0));
return generateOutput();
}
float _ta_3187 = max(_t0_3185, 0.0500000007);
int _n_3188 = int_ctor(clamp(ceil(((_t1_3186 - _t0_3185) / 0.0350000001)), 12.0, float_ctor_int(_uSteps)));
float _lr_3189 = (log((_t1_3186 / _ta_3187)) / float_ctor_int(_n_3188));
float _grow_3190 = (exp(_lr_3189) - 1.0);
float2 _px_3191 = (gl_FragCoord.xy + (5.58823776 * _uFrame));
float _j_3192 = frac((52.9829178 * frac(dot(_px_3191, float2(0.0671105608, 0.00583714992)))));
float _mu_3193 = dot(_rd_3178, _uSunDir);
float _ph_3194[4] = {0, 0, 0, 0};
float _sc_3195 = {1.0};
{ for(int _k_3196 = {0}; (_k_3196 < 4); (_k_3196++))
{
(_ph_3194[int_ctor(clamp(float_ctor_int(_k_3196), 0.0, 3.0))] = f_phase(_mu_3193, _sc_3195));
(_sc_3195 *= 0.5);
}
}
float3 _skyUp_3197 = ((f_skyLUT(1.0, 1.0) * 0.400000006) + (((f_skyLUT(0.340000004, 1.0) + (2.0 * f_skyLUT(0.340000004, 0.0))) + f_skyLUT(0.340000004, -1.0)) * 0.150000006));
float3 _groundAmb_3199 = (((((_uSunE * f_transLUT(6360.00977, _uSunDir.y)) * max(_uSunDir.y, 0.0)) * 0.300000012) / 3.14159274) * 0.5);
float3 _sunE_3200 = _uSunE;
float _T_3201 = {1.0};
float3 _Ls_3202 = {0.0, 0.0, 0.0};
float _tw_3203 = {0.0};
float _ww_3204 = {0.0};
float _cost_3205 = {0.0};
{LOOP for(int _i_3206 = {0}; (_i_3206 < 160); (_i_3206++))
{
bool sca7 = (_i_3206 >= _n_3188);
if ((!sca7))
{
(sca7 = (_T_3201 < 0.00999999978));
}
if (sca7)
{
break;
}
float _t_3207 = (_ta_3187 * exp((_lr_3189 * (float_ctor_int(_i_3206) + _j_3192))));
float _dt_3208 = (_t_3207 * _grow_3190);
float3 _p_3209 = (_ro_3179 + (_rd_3178 * _t_3207));
float _lod_3210 = max(0.0, log2(((_t_3207 * _uPixAngle) / 0.0549999997)));
float _hf_3211 = {0};
float _b_3212 = f_cloudBase(_p_3209, _lod_3210, _hf_3211);
(_cost_3205 += 1.0);
if ((_b_3212 <= 0.0))
{
continue;
}
(_b_3212 = f_erode(_b_3212, _p_3209, _hf_3211, _lod_3210));
if ((_b_3212 <= 0.0))
{
continue;
}
float _sig_3213 = ((_b_3212 * _uDensity) * smoothstep(160.0, 100.0, _t_3207));
float _od_3214 = f_lightOD(_p_3209, _lod_3210);
(_cost_3205 += (float_ctor_int(_uLightSteps) + 3.0));
float _ms_3215 = {0.0};
float _a_3216 = {1.0};
float _bb_3217 = {1.0};
{ for(int _k_3218 = {0}; (_k_3218 < 4); (_k_3218++))
{
if ((_k_3218 >= _uOctaves))
{
break;
}
(_ms_3215 += (((_a_3216 * _ph_3194[int_ctor(clamp(float_ctor_int(_k_3218), 0.0, 3.0))]) * exp(((-_bb_3217) * _od_3214))) + 0.0));
(_a_3216 *= (0.5 + 0.0));
(_bb_3217 *= (0.5 + 0.0));
}
}
if ((_uPowder == 1))
{
(_ms_3215 *= lerp((1.0 - exp(((-_sig_3213) * 0.0799999982))), 1.0, (0.5 + (0.5 * _mu_3193))));
}
float3 _Lsun_3219 = (_sunE_3200 * f_sunTransLod0(_p_3209, _uSunDir));
float _h1_3220 = {0};
float _h2_3221 = {0};
float _odUp_3222 = (((f_cloudBase((_p_3209 + (normalize(_p_3209) * 0.119999997)), (_lod_3210 + 1.0), _h1_3220) * 0.119999997) + (f_cloudBase((_p_3209 + (normalize(_p_3209) * 0.449999988)), (_lod_3210 + 1.0), _h2_3221) * 0.400000006)) * _uDensity);
float3 _amb_3223 = (((_skyUp_3197 * exp((-0.349999994 * _odUp_3222))) * lerp(0.5, 1.0, _hf_3211)) + (_groundAmb_3199 * (1.0 - _hf_3211)));
float _Ts_3224 = exp(((-_sig_3213) * _dt_3208));
(_Ls_3202 += ((_T_3201 * ((_Lsun_3219 * _ms_3215) + _amb_3223)) * (1.0 - _Ts_3224)));
float _wgt_3225 = (_T_3201 * (1.0 - _Ts_3224));
(_tw_3203 += (_wgt_3225 * _t_3207));
(_ww_3204 += _wgt_3225);
(_T_3201 *= _Ts_3224);
}
}
if ((_uView == 3))
{
(out_outColor = vec4_ctor(vec3_ctor((_cost_3205 / (2.5 * float_ctor_int(_uSteps)))), _T_3201));
return generateOutput();
}
if ((_ww_3204 <= 0.0))
{
(out_outColor = float4(0.0, 0.0, 0.0, 1.0));
return generateOutput();
}
float _tm_3226 = (_tw_3203 / _ww_3204);
float3 _Tair_3227 = f_transSeg(_ro_3179, _rd_3178, _tm_3226, false);
float3 sca8 = {0, 0, 0};
if (_ground_3184)
{
(sca8 = f_transSeg(_ro_3179, _rd_3178, _tG_3183, true));
}
else
{
(sca8 = f_transLUT(_r_3180, (dot(_ro_3179, _rd_3178) / _r_3180)));
}
float3 _Tinf_3228 = sca8;
float3 _front_3229 = (f_skyDir(_rd_3178) * clamp(((1.0 - _Tair_3227) / max((1.0 - _Tinf_3228), float3(9.99999975e-05, 9.99999975e-05, 9.99999975e-05))), 0.0, 1.0));
if ((_r_3180 < 6361.5))
{
(_front_3229 *= lerp(0.349999994, 1.0, f_airShadow((_ro_3179 + (_rd_3178 * (0.5 * _tm_3226))))));
}
(out_outColor = vec4_ctor((((1.0 - _T_3201) * _front_3229) + (_Tair_3227 * _Ls_3202)), _T_3201));
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
float3 vec3_ctor(float x0)
{
    return float3(x0, x0, x0);
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

uniform float _uCamR : register(c0);
uniform float3 _uSunDir : register(c1);
uniform float _uCoverage : register(c2);
uniform float3 _uWind : register(c3);
uniform float _uDensity : register(c4);
uniform float2 _uRes : register(c5);
uniform float3 _uCamPos : register(c6);
uniform float3 _uCamF : register(c7);
uniform float3 _uCamRt : register(c8);
uniform float3 _uCamUp : register(c9);
uniform float _uTanH : register(c10);
uniform float _uAspect : register(c11);
uniform int _uSteps : register(c12);
uniform int _uLightSteps : register(c13);
uniform int _uOctaves : register(c14);
uniform int _uPhase : register(c15);
uniform int _uPowder : register(c16);
uniform int _uView : register(c17);
uniform float _uFrame : register(c18);
uniform float2 _uJitter : register(c19);
uniform float3 _uSunE : register(c20);
uniform float _uPixAngle : register(c21);
static const uint _uTrans = 0;
static const uint _uSky = 1;
static const uint _uWeather = 2;
uniform Texture2D<float4> textures2D[3] : register(t0);
uniform SamplerState samplers2D[3] : register(s0);
static const uint _uShape = 3;
static const uint _uDetail = 4;
static const uint textureIndexOffset3D = 3;
static const uint samplerIndexOffset3D = 3;
uniform Texture3D<float4> textures3D[2] : register(t3);
uniform SamplerState samplers3D[2] : register(s3);
#define ANGLE_USES_NESTED_BREAK
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

float4 gl_texture2DLod(uint samplerIndex, float2 t, float lod)
{
    return textures2D[samplerIndex].SampleLevel(samplers2D[samplerIndex], float2(t.x, t.y), lod);
}

float4 gl_texture2DLod0(uint samplerIndex, float2 t)
{
    return textures2D[samplerIndex].SampleLevel(samplers2D[samplerIndex], float2(t.x, t.y), 0);
}

float4 gl_texture3DLod(uint samplerIndex, float3 t, float lod)
{
    const uint textureIndex = samplerIndex - textureIndexOffset3D;
    const uint samplerArrayIndex = samplerIndex - samplerIndexOffset3D;
    return textures3D[textureIndex].SampleLevel(samplers3D[samplerArrayIndex], float3(t.x, t.y, t.z), lod);
}

#define GL_USES_FRAG_COORD
float2 f_sphere(in float3 _ro_3009, in float3 _rd_3010, in float _r_3011)
{
float _l_3012 = length(_ro_3009);
float _b_3013 = dot(_ro_3009, _rd_3010);
float _c_3014 = ((_l_3012 - _r_3011) * (_l_3012 + _r_3011));
float _d_3015 = ((_b_3013 * _b_3013) - _c_3014);
if ((_d_3015 < 0.0))
{
return float2(-1.0, -1.0);
}
(_d_3015 = sqrt(_d_3015));
return vec2_ctor(((-_b_3013) - _d_3015), ((-_b_3013) + _d_3015));
}
float3 f_transLUT(in float _r_3033, in float _mu_3034)
{
float _H_3035 = {1132.25439};
float _rho_3036 = sqrt(max(0.0, ((_r_3033 - 6360.0) * (_r_3033 + 6360.0))));
float _disc_3037 = (((_r_3033 * _r_3033) * ((_mu_3034 * _mu_3034) - 1.0)) + 41731600.0);
float _d_3038 = max(0.0, (((-_r_3033) * _mu_3034) + sqrt(max(_disc_3037, 0.0))));
float _dmin_3039 = (6460.0 - _r_3033);
float _dmax_3040 = (_rho_3036 + _H_3035);
return gl_texture2D(_uTrans, vec2_ctor(((_d_3038 - _dmin_3039) / (_dmax_3040 - _dmin_3039)), (_rho_3036 / _H_3035))).xyz;
}
float3 f_transLUTLod0(in float _r_3033, in float _mu_3034)
{
float _H_3035 = {1132.25439};
float _rho_3036 = sqrt(max(0.0, ((_r_3033 - 6360.0) * (_r_3033 + 6360.0))));
float _disc_3037 = (((_r_3033 * _r_3033) * ((_mu_3034 * _mu_3034) - 1.0)) + 41731600.0);
float _d_3038 = max(0.0, (((-_r_3033) * _mu_3034) + sqrt(max(_disc_3037, 0.0))));
float _dmin_3039 = (6460.0 - _r_3033);
float _dmax_3040 = (_rho_3036 + _H_3035);
return gl_texture2DLod0(_uTrans, vec2_ctor(((_d_3038 - _dmin_3039) / (_dmax_3040 - _dmin_3039)), (_rho_3036 / _H_3035))).xyz;
}
float3 f_sunTrans(in float3 _p_3042, in float3 _sun_3043)
{
float _r_3044 = length(_p_3042);
float _mu_3045 = (dot(_p_3042, _sun_3043) / _r_3044);
float _x_3046 = (6360.0 / _r_3044);
float _muH_3047 = (-sqrt(max(0.0, (1.0 - (_x_3046 * _x_3046)))));
return (f_transLUT(_r_3044, _mu_3045) * smoothstep((_muH_3047 - 0.00499999989), (_muH_3047 + 0.00499999989), _mu_3045));
}
float3 f_sunTransLod0(in float3 _p_3042, in float3 _sun_3043)
{
float _r_3044 = length(_p_3042);
float _mu_3045 = (dot(_p_3042, _sun_3043) / _r_3044);
float _x_3046 = (6360.0 / _r_3044);
float _muH_3047 = (-sqrt(max(0.0, (1.0 - (_x_3046 * _x_3046)))));
return (f_transLUTLod0(_r_3044, _mu_3045) * smoothstep((_muH_3047 - 0.00499999989), (_muH_3047 + 0.00499999989), _mu_3045));
}
float3 f_transSeg(in float3 _ro_3053, in float3 _rd_3054, in float _t_3055, in bool _ground_3056)
{
float3 _pb_3057 = (_ro_3053 + (_rd_3054 * _t_3055));
float _ra_3058 = length(_ro_3053);
float _rb_3059 = length(_pb_3057);
float _mua_3060 = (dot(_ro_3053, _rd_3054) / _ra_3058);
float _mub_3061 = (dot(_pb_3057, _rd_3054) / _rb_3059);
float3 sc9e = {0, 0, 0};
if (_ground_3056)
{
(sc9e = (f_transLUT(_rb_3059, (-_mub_3061)) / max(f_transLUT(_ra_3058, (-_mua_3060)), float3(9.99999997e-07, 9.99999997e-07, 9.99999997e-07))));
}
else
{
(sc9e = (f_transLUT(_ra_3058, _mua_3060) / max(f_transLUT(_rb_3059, _mub_3061), float3(9.99999997e-07, 9.99999997e-07, 9.99999997e-07))));
}
float3 _v_3062 = sc9e;
return clamp(_v_3062, 0.0, 1.0);
}
float3 f_skyLUT(in float _cosV_3066, in float _cosPhi_3067)
{
float _r_3068 = _uCamR;
float _vh_3069 = sqrt(max(0.0, ((_r_3068 - 6360.0) * (_r_3068 + 6360.0))));
float _beta_3070 = acos(clamp((_vh_3069 / _r_3068), -1.0, 1.0));
float _zha_3071 = (3.14159274 - _beta_3070);
float _vz_3072 = acos(clamp(_cosV_3066, -1.0, 1.0));
float sc9f = {0};
if ((_vz_3072 < _zha_3071))
{
(sc9f = (0.5 * (1.0 - sqrt(max(0.0, (1.0 - (_vz_3072 / _zha_3071)))))));
}
else
{
(sc9f = (0.5 + (0.5 * sqrt(max(0.0, ((_vz_3072 - _zha_3071) / _beta_3070))))));
}
float _v_3073 = sc9f;
float _u_3074 = sqrt(clamp((0.5 - (0.5 * _cosPhi_3067)), 0.0, 1.0));
return gl_texture2D(_uSky, vec2_ctor(_u_3074, _v_3073)).xyz;
}
float3 f_skyDir(in float3 _rd_3077)
{
float2 _a_3078 = _rd_3077.xz;
float2 _b_3079 = _uSunDir.xz;
float _la_3080 = length(_a_3078);
float _lb_3081 = length(_b_3079);
float sca0 = {0};
bool sca1 = (_la_3080 > 9.99999975e-05);
if (sca1)
{
(sca1 = (_lb_3081 > 9.99999975e-05));
}
if (sca1)
{
(sca0 = (dot(_a_3078, _b_3079) / (_la_3080 * _lb_3081)));
}
else
{
(sca0 = 1.0);
}
float _cp_3082 = sca0;
return f_skyLUT(_rd_3077.y, _cp_3082);
}
float f_remap(in float _v_3091, in float _a_3092, in float _b_3093, in float _c_3094, in float _d_3095)
{
return (_c_3094 + (((_v_3091 - _a_3092) * (_d_3095 - _c_3094)) / (_b_3093 - _a_3092)));
}
float f_cloudBase(in float3 _p_3097, in float _lod_3098, inout float _hf_3099)
{
(_hf_3099 = (((length(_p_3097) - 6360.0) - 1.5) / 2.5));
bool sca2 = (_hf_3099 <= 0.0);
if ((!sca2))
{
(sca2 = (_hf_3099 >= 1.0));
}
if (sca2)
{
return 0.0;
}
float3 _q_3100 = (_p_3097 - float3(0.0, 6360.0, 0.0));
float4 _w_3101 = gl_texture2DLod(_uWeather, ((_q_3100.xz + (_uWind.xz * 0.600000024)) / 48.0), 0.0);
float _th_3102 = clamp(((1.0 - (0.419999987 * _uCoverage)) - (0.300000012 * (_w_3101.x - 0.5))), 0.300000012, 0.995000005);
float _top_3103 = lerp(0.449999988, 1.0, smoothstep(0.25, 0.75, _w_3101.y));
float _prof_3104 = (smoothstep(0.0, 0.100000001, _hf_3099) * (1.0 - smoothstep((_top_3103 * 0.300000012), _top_3103, _hf_3099)));
if ((_prof_3104 <= 0.0))
{
return 0.0;
}
float4 _s_3105 = gl_texture3DLod(_uShape, (((_q_3100 + _uWind) + vec3_ctor(0.0, (_uWind.x * 0.0500000007), 0.0)) / 7.0), _lod_3098);
float _wf_3106 = (((_s_3105.y * 0.625) + (_s_3105.z * 0.25)) + (_s_3105.w * 0.125));
float _base_3107 = f_remap(_s_3105.x, (_wf_3106 - 1.0), 1.0, 0.0, 1.0);
float _e_3108 = ((_base_3107 - _th_3102) / (1.0 - _th_3102));
return clamp((_e_3108 - (1.0 - _prof_3104)), 0.0, 1.0);
}
float f_erode(in float _base_3110, in float3 _p_3111, in float _hf_3112, in float _lod_3113)
{
float3 _q_3114 = (_p_3111 - float3(0.0, 6360.0, 0.0));
float3 _d_3115 = gl_texture3DLod(_uDetail, ((_q_3114 + (_uWind * 1.60000002)) / 1.0), _lod_3113).xyz;
float _df_3116 = (((_d_3115.x * 0.625) + (_d_3115.y * 0.25)) + (_d_3115.z * 0.125));
float _dm_3117 = lerp(_df_3116, (1.0 - _df_3116), clamp((_hf_3112 * 4.0), 0.0, 1.0));
return max(f_remap(_base_3110, (_dm_3117 * 0.449999988), 1.0, 0.0, 1.0), 0.0);
}
float f_airShadow(in float3 _p_3132)
{
float _rm_3133 = {6362.75};
float _r_3134 = length(_p_3132);
float sca3 = {0};
if ((_r_3134 < _rm_3133))
{
(sca3 = min(max(f_sphere(_p_3132, _uSunDir, _rm_3133).y, 0.0), 15.0));
}
else
{
(sca3 = 0.0);
}
float _t_3135 = sca3;
float3 _q_3136 = ((_p_3132 + (_uSunDir * _t_3135)) - float3(0.0, 6360.0, 0.0));
float _w_3137 = gl_texture2DLod(_uWeather, ((_q_3136.xz + (_uWind.xz * 0.600000024)) / 48.0), 4.0).x;
float _th_3138 = ((1.0 - (0.419999987 * _uCoverage)) - (0.300000012 * (_w_3137 - 0.5)));
return (1.0 - clamp(((0.970000029 - _th_3138) * 2.5), 0.0, 1.0));
}
float3 f_rayDir(in float2 _uv_3147)
{
float2 _n_3148 = ((_uv_3147 * 2.0) - 1.0);
return normalize(((_uCamF + (_uCamRt * ((_n_3148.x * _uTanH) * _uAspect))) + (_uCamUp * (_n_3148.y * _uTanH))));
}
float f_hg(in float _mu_3160, in float _g_3161)
{
float _g2_3162 = (_g_3161 * _g_3161);
return ((1.0 - _g2_3162) / (12.566371 * pow(((1.0 + _g2_3162) - ((2.0 * _g_3161) * _mu_3160)), 1.5)));
}
float f_phase(in float _mu_3164, in float _s_3165)
{
if ((_uPhase == 0))
{
return 0.0795774683;
}
if ((_uPhase == 1))
{
return f_hg(_mu_3164, (0.800000012 * _s_3165));
}
return lerp(f_hg(_mu_3164, (-0.300000012 * _s_3165)), f_hg(_mu_3164, (0.800000012 * _s_3165)), 0.699999988);
}
float f_lightOD(in float3 _p_3167, in float _lod_3168)
{
float _od_3169 = {0.0};
float _t_3170 = {0.0};
float _ds_3171 = {0.0500000007};
float _hf_3172 = {0};
{ for(int _i_3173 = {0}; (_i_3173 < 6); (_i_3173++))
{
if ((_i_3173 >= _uLightSteps))
{
break;
}
float3 _s_3174 = (_p_3167 + (_uSunDir * (_t_3170 + (0.5 * _ds_3171))));
float _b_3175 = f_cloudBase(_s_3174, _lod_3168, _hf_3172);
bool sca4 = (_b_3175 > 0.0);
if (sca4)
{
(sca4 = (_i_3173 < 3));
}
if (sca4)
{
(_b_3175 = f_erode(_b_3175, _s_3174, _hf_3172, _lod_3168));
}
(_od_3169 += (_b_3175 * _ds_3171));
(_t_3170 += _ds_3171);
(_ds_3171 *= 1.89999998);
}
}
return (_od_3169 * _uDensity);
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

float2 _uv_3177 = ((gl_FragCoord.xy + _uJitter) / _uRes);
float3 _rd_3178 = f_rayDir(_uv_3177);
float3 _ro_3179 = _uCamPos;
float _r_3180 = length(_ro_3179);
float2 _iB_3181 = f_sphere(_ro_3179, _rd_3178, 6361.5);
float2 _iT_3182 = f_sphere(_ro_3179, _rd_3178, 6364.0);
float _tG_3183 = f_sphere(_ro_3179, _rd_3178, 6360.0).x;
bool _ground_3184 = (_tG_3183 > 0.0);
float _t0_3185 = {0.0};
float _t1_3186 = {-1.0};
if ((_r_3180 < 6361.5))
{
if ((!_ground_3184))
{
(_t0_3185 = _iB_3181.y);
(_t1_3186 = _iT_3182.y);
}
}
else
{
if ((_r_3180 > 6364.0))
{
if ((_iT_3182.x > 0.0))
{
(_t0_3185 = _iT_3182.x);
float sca5 = {0};
if ((_iB_3181.x > 0.0))
{
(sca5 = _iB_3181.x);
}
else
{
(sca5 = _iT_3182.y);
}
(_t1_3186 = sca5);
}
}
else
{
float sca6 = {0};
if ((_iB_3181.x > 0.0))
{
(sca6 = _iB_3181.x);
}
else
{
(sca6 = _iT_3182.y);
}
(_t1_3186 = sca6);
}
}
(_t1_3186 = min(_t1_3186, 160.0));
if ((_t1_3186 <= _t0_3185))
{
(out_outColor = float4(0.0, 0.0, 0.0, 1.0));
return generateOutput();
}
float _ta_3187 = max(_t0_3185, 0.0500000007);
int _n_3188 = int_ctor(clamp(ceil(((_t1_3186 - _t0_3185) / 0.0350000001)), 12.0, float_ctor_int(_uSteps)));
float _lr_3189 = (log((_t1_3186 / _ta_3187)) / float_ctor_int(_n_3188));
float _grow_3190 = (exp(_lr_3189) - 1.0);
float2 _px_3191 = (gl_FragCoord.xy + (5.58823776 * _uFrame));
float _j_3192 = frac((52.9829178 * frac(dot(_px_3191, float2(0.0671105608, 0.00583714992)))));
float _mu_3193 = dot(_rd_3178, _uSunDir);
float _ph_3194[4] = {0, 0, 0, 0};
float _sc_3195 = {1.0};
{ for(int _k_3196 = {0}; (_k_3196 < 4); (_k_3196++))
{
(_ph_3194[int_ctor(clamp(float_ctor_int(_k_3196), 0.0, 3.0))] = f_phase(_mu_3193, _sc_3195));
(_sc_3195 *= 0.5);
}
}
float3 _skyUp_3197 = ((f_skyLUT(1.0, 1.0) * 0.400000006) + (((f_skyLUT(0.340000004, 1.0) + (2.0 * f_skyLUT(0.340000004, 0.0))) + f_skyLUT(0.340000004, -1.0)) * 0.150000006));
float3 _groundAmb_3199 = (((((_uSunE * f_transLUT(6360.00977, _uSunDir.y)) * max(_uSunDir.y, 0.0)) * 0.300000012) / 3.14159274) * 0.5);
float3 _sunE_3200 = _uSunE;
float _T_3201 = {1.0};
float3 _Ls_3202 = {0.0, 0.0, 0.0};
float _tw_3203 = {0.0};
float _ww_3204 = {0.0};
float _cost_3205 = {0.0};
{LOOP for(int _i_3206 = {0}; (_i_3206 < 160); (_i_3206++))
{
bool sca7 = (_i_3206 >= _n_3188);
if ((!sca7))
{
(sca7 = (_T_3201 < 0.00999999978));
}
if (sca7)
{
break;
}
float _t_3207 = (_ta_3187 * exp((_lr_3189 * (float_ctor_int(_i_3206) + _j_3192))));
float _dt_3208 = (_t_3207 * _grow_3190);
float3 _p_3209 = (_ro_3179 + (_rd_3178 * _t_3207));
float _lod_3210 = max(0.0, log2(((_t_3207 * _uPixAngle) / 0.0549999997)));
float _hf_3211 = {0};
float _b_3212 = f_cloudBase(_p_3209, _lod_3210, _hf_3211);
(_cost_3205 += 1.0);
if ((_b_3212 <= 0.0))
{
continue;
}
(_b_3212 = f_erode(_b_3212, _p_3209, _hf_3211, _lod_3210));
if ((_b_3212 <= 0.0))
{
continue;
}
float _sig_3213 = ((_b_3212 * _uDensity) * smoothstep(160.0, 100.0, _t_3207));
float _od_3214 = f_lightOD(_p_3209, _lod_3210);
(_cost_3205 += (float_ctor_int(_uLightSteps) + 3.0));
float _ms_3215 = {0.0};
float _a_3216 = {1.0};
float _bb_3217 = {1.0};
{ for(int _k_3218 = {0}; (_k_3218 < 4); (_k_3218++))
{
if ((_k_3218 >= _uOctaves))
{
break;
}
(_ms_3215 += (((_a_3216 * _ph_3194[int_ctor(clamp(float_ctor_int(_k_3218), 0.0, 3.0))]) * exp(((-_bb_3217) * _od_3214))) + 0.0));
(_a_3216 *= (0.5 + 0.0));
(_bb_3217 *= (0.5 + 0.0));
}
}
if ((_uPowder == 1))
{
(_ms_3215 *= lerp((1.0 - exp(((-_sig_3213) * 0.0799999982))), 1.0, (0.5 + (0.5 * _mu_3193))));
}
float3 _Lsun_3219 = (_sunE_3200 * f_sunTransLod0(_p_3209, _uSunDir));
float _h1_3220 = {0};
float _h2_3221 = {0};
float _odUp_3222 = (((f_cloudBase((_p_3209 + (normalize(_p_3209) * 0.119999997)), (_lod_3210 + 1.0), _h1_3220) * 0.119999997) + (f_cloudBase((_p_3209 + (normalize(_p_3209) * 0.449999988)), (_lod_3210 + 1.0), _h2_3221) * 0.400000006)) * _uDensity);
float3 _amb_3223 = (((_skyUp_3197 * exp((-0.349999994 * _odUp_3222))) * lerp(0.5, 1.0, _hf_3211)) + (_groundAmb_3199 * (1.0 - _hf_3211)));
float _Ts_3224 = exp(((-_sig_3213) * _dt_3208));
(_Ls_3202 += ((_T_3201 * ((_Lsun_3219 * _ms_3215) + _amb_3223)) * (1.0 - _Ts_3224)));
float _wgt_3225 = (_T_3201 * (1.0 - _Ts_3224));
(_tw_3203 += (_wgt_3225 * _t_3207));
(_ww_3204 += _wgt_3225);
(_T_3201 *= _Ts_3224);
}
}
if ((_uView == 3))
{
(out_outColor = vec4_ctor(vec3_ctor((_cost_3205 / (2.5 * float_ctor_int(_uSteps)))), _T_3201));
return generateOutput();
}
if ((_ww_3204 <= 0.0))
{
(out_outColor = float4(0.0, 0.0, 0.0, 1.0));
return generateOutput();
}
float _tm_3226 = (_tw_3203 / _ww_3204);
float3 _Tair_3227 = f_transSeg(_ro_3179, _rd_3178, _tm_3226, false);
float3 sca8 = {0, 0, 0};
if (_ground_3184)
{
(sca8 = f_transSeg(_ro_3179, _rd_3178, _tG_3183, true));
}
else
{
(sca8 = f_transLUT(_r_3180, (dot(_ro_3179, _rd_3178) / _r_3180)));
}
float3 _Tinf_3228 = sca8;
float3 _front_3229 = (f_skyDir(_rd_3178) * clamp(((1.0 - _Tair_3227) / max((1.0 - _Tinf_3228), float3(9.99999975e-05, 9.99999975e-05, 9.99999975e-05))), 0.0, 1.0));
if ((_r_3180 < 6361.5))
{
(_front_3229 *= lerp(0.349999994, 1.0, f_airShadow((_ro_3179 + (_rd_3178 * (0.5 * _tm_3226))))));
}
(out_outColor = vec4_ctor((((1.0 - _T_3201) * _front_3229) + (_Tair_3227 * _Ls_3202)), _T_3201));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
