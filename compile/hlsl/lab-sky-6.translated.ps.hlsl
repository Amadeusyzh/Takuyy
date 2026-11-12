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
uniform int _uCubic : register(c12);
uniform float _uExposure : register(c13);
uniform float _uStars : register(c14);
uniform float3 _uSunE : register(c15);
uniform int _uView : register(c16);
static const uint _uTrans = 0;
static const uint _uSky = 1;
static const uint _uWeather = 2;
static const uint _uClouds = 3;
uniform Texture2D<float4> textures2D[4] : register(t0);
uniform SamplerState samplers2D[4] : register(s0);
static const uint _uShape = 4;
static const uint textureIndexOffset3D = 4;
static const uint samplerIndexOffset3D = 4;
uniform Texture3D<float4> textures3D[1] : register(t4);
uniform SamplerState samplers3D[1] : register(s4);
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

int2 gl_texture2DSize(uint samplerIndex, int lod)
{
    int baseLevel = 0;
    uint width; uint height; uint numberOfLevels;
    textures2D[samplerIndex].GetDimensions(baseLevel, width, height, numberOfLevels);
    width = max(width >> lod, 1);
    height = max(height >> lod, 1);
    return int2(width, height);
}

float4 gl_texture2D(uint samplerIndex, float2 t)
{
    return textures2D[samplerIndex].Sample(samplers2D[samplerIndex], float2(t.x, t.y));
}

float4 gl_texture2DLod(uint samplerIndex, float2 t, float lod)
{
    return textures2D[samplerIndex].SampleLevel(samplers2D[samplerIndex], float2(t.x, t.y), lod);
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
float3 f_sunTrans(in float3 _p_3042, in float3 _sun_3043)
{
float _r_3044 = length(_p_3042);
float _mu_3045 = (dot(_p_3042, _sun_3043) / _r_3044);
float _x_3046 = (6360.0 / _r_3044);
float _muH_3047 = (-sqrt(max(0.0, (1.0 - (_x_3046 * _x_3046)))));
return (f_transLUT(_r_3044, _mu_3045) * smoothstep((_muH_3047 - 0.00499999989), (_muH_3047 + 0.00499999989), _mu_3045));
}
float3 f_transSeg(in float3 _ro_3053, in float3 _rd_3054, in float _t_3055, in bool _ground_3056)
{
float3 _pb_3057 = (_ro_3053 + (_rd_3054 * _t_3055));
float _ra_3058 = length(_ro_3053);
float _rb_3059 = length(_pb_3057);
float _mua_3060 = (dot(_ro_3053, _rd_3054) / _ra_3058);
float _mub_3061 = (dot(_pb_3057, _rd_3054) / _rb_3059);
float3 sc87 = {0, 0, 0};
if (_ground_3056)
{
(sc87 = (f_transLUT(_rb_3059, (-_mub_3061)) / max(f_transLUT(_ra_3058, (-_mua_3060)), float3(9.99999997e-07, 9.99999997e-07, 9.99999997e-07))));
}
else
{
(sc87 = (f_transLUT(_ra_3058, _mua_3060) / max(f_transLUT(_rb_3059, _mub_3061), float3(9.99999997e-07, 9.99999997e-07, 9.99999997e-07))));
}
float3 _v_3062 = sc87;
return clamp(_v_3062, 0.0, 1.0);
}
float3 f_skyLUT(in float _cosV_3066, in float _cosPhi_3067)
{
float _r_3068 = _uCamR;
float _vh_3069 = sqrt(max(0.0, ((_r_3068 - 6360.0) * (_r_3068 + 6360.0))));
float _beta_3070 = acos(clamp((_vh_3069 / _r_3068), -1.0, 1.0));
float _zha_3071 = (3.14159274 - _beta_3070);
float _vz_3072 = acos(clamp(_cosV_3066, -1.0, 1.0));
float sc88 = {0};
if ((_vz_3072 < _zha_3071))
{
(sc88 = (0.5 * (1.0 - sqrt(max(0.0, (1.0 - (_vz_3072 / _zha_3071)))))));
}
else
{
(sc88 = (0.5 + (0.5 * sqrt(max(0.0, ((_vz_3072 - _zha_3071) / _beta_3070))))));
}
float _v_3073 = sc88;
float _u_3074 = sqrt(clamp((0.5 - (0.5 * _cosPhi_3067)), 0.0, 1.0));
return gl_texture2D(_uSky, vec2_ctor(_u_3074, _v_3073)).xyz;
}
float3 f_skyDir(in float3 _rd_3077)
{
float2 _a_3078 = _rd_3077.xz;
float2 _b_3079 = _uSunDir.xz;
float _la_3080 = length(_a_3078);
float _lb_3081 = length(_b_3079);
float sc89 = {0};
bool sc8a = (_la_3080 > 9.99999975e-05);
if (sc8a)
{
(sc8a = (_lb_3081 > 9.99999975e-05));
}
if (sc8a)
{
(sc89 = (dot(_a_3078, _b_3079) / (_la_3080 * _lb_3081)));
}
else
{
(sc89 = 1.0);
}
float _cp_3082 = sc89;
return f_skyLUT(_rd_3077.y, _cp_3082);
}
float f_remap(in float _v_3091, in float _a_3092, in float _b_3093, in float _c_3094, in float _d_3095)
{
return (_c_3094 + (((_v_3091 - _a_3092) * (_d_3095 - _c_3094)) / (_b_3093 - _a_3092)));
}
float f_cloudBase(in float3 _p_3097, in float _lod_3098, inout float _hf_3099)
{
(_hf_3099 = (((length(_p_3097) - 6360.0) - 1.5) / 2.5));
bool sc8b = (_hf_3099 <= 0.0);
if ((!sc8b))
{
(sc8b = (_hf_3099 >= 1.0));
}
if (sc8b)
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
float f_cloudShadow(in float3 _p_3120, in float _lod_3121)
{
float _r_3122 = length(_p_3120);
if ((_r_3122 > 6364.0))
{
return 1.0;
}
float2 _iB_3123 = f_sphere(_p_3120, _uSunDir, 6361.5);
float2 _iT_3124 = f_sphere(_p_3120, _uSunDir, 6364.0);
float sc8c = {0};
if ((_r_3122 < 6361.5))
{
(sc8c = _iB_3123.y);
}
else
{
(sc8c = 0.0);
}
float _t0_3125 = sc8c;
float sc8d = {0};
bool sc8e = (_r_3122 >= 6361.5);
if (sc8e)
{
(sc8e = (_iB_3123.x > 0.0));
}
if (sc8e)
{
(sc8d = _iB_3123.x);
}
else
{
(sc8d = _iT_3124.y);
}
float _t1_3126 = sc8d;
if ((_t1_3126 <= _t0_3125))
{
return 1.0;
}
(_t1_3126 = min(_t1_3126, (_t0_3125 + 12.0)));
float _dt_3127 = ((_t1_3126 - _t0_3125) / 8.0);
float _od_3128 = {0.0};
float _hf_3129 = {0};
{ for(int _i_3130 = {0}; (_i_3130 < 8); (_i_3130++))
{
(_od_3128 += (f_cloudBase((_p_3120 + (_uSunDir * (_t0_3125 + ((float_ctor_int(_i_3130) + 0.5) * _dt_3127)))), _lod_3121, _hf_3129) * _dt_3127));
}
}
return exp((((-_od_3128) * _uDensity) * 0.600000024));
}
float f_airShadow(in float3 _p_3132)
{
float _rm_3133 = {6362.75};
float _r_3134 = length(_p_3132);
float sc8f = {0};
if ((_r_3134 < _rm_3133))
{
(sc8f = min(max(f_sphere(_p_3132, _uSunDir, _rm_3133).y, 0.0), 15.0));
}
else
{
(sc8f = 0.0);
}
float _t_3135 = sc8f;
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
float4 f_cubicTex(const uint _t_3152, in float2 _uv_3153)
{
float2 _ts_3154 = vec2_ctor_int2(gl_texture2DSize(_t_3152, 0));
float2 _p_3155 = ((_uv_3153 * _ts_3154) - 0.5);
float2 _f_3156 = frac(_p_3155);
(_p_3155 -= _f_3156);
float2 _f2_3157 = (_f_3156 * _f_3156);
float2 _f3_3158 = (_f2_3157 * _f_3156);
float2 _w0_3159 = (((((-_f3_3158) + (3.0 * _f2_3157)) - (3.0 * _f_3156)) + 1.0) / 6.0);
float2 _w1_3160 = ((((3.0 * _f3_3158) - (6.0 * _f2_3157)) + 4.0) / 6.0);
float2 _w3_3161 = (_f3_3158 / 6.0);
float2 _s0_3162 = (_w0_3159 + _w1_3160);
float2 _o0_3163 = (((_p_3155 - 0.5) + (_w1_3160 / _s0_3162)) / _ts_3154);
float2 _o1_3164 = (((_p_3155 + 1.5) + (_w3_3161 / (1.0 - _s0_3162))) / _ts_3154);
float4 _a_3165 = lerp(gl_texture2D(_t_3152, vec2_ctor(_o1_3164.x, _o0_3163.y)), gl_texture2D(_t_3152, vec2_ctor(_o0_3163.x, _o0_3163.y)), _s0_3162.x);
float4 _b_3166 = lerp(gl_texture2D(_t_3152, vec2_ctor(_o1_3164.x, _o1_3164.y)), gl_texture2D(_t_3152, vec2_ctor(_o0_3163.x, _o1_3164.y)), _s0_3162.x);
return lerp(_b_3166, _a_3165, _s0_3162.y);
}
float3 f_aces(in float3 _x_3172)
{
return clamp(((_x_3172 * ((2.50999999 * _x_3172) + 0.0299999993)) / ((_x_3172 * ((2.43000007 * _x_3172) + 0.589999974)) + 0.140000001)), 0.0, 1.0);
}
float3 f_heat(in float _t_3174)
{
(_t_3174 = clamp(_t_3174, 0.0, 1.0));
float3 _c0_3175 = {0.0599999987, 0.0399999991, 0.239999995};
float3 _c1_3176 = {0.119999997, 0.419999987, 0.860000014};
float3 _c2_3177 = {0.200000003, 0.779999971, 0.550000012};
float3 _c3_3178 = {0.980000019, 0.800000012, 0.200000003};
float3 _c4_3179 = {0.860000014, 0.159999996, 0.100000001};
if ((_t_3174 < 0.25))
{
return lerp(_c0_3175, _c1_3176, (_t_3174 * 4.0));
}
if ((_t_3174 < 0.5))
{
return lerp(_c1_3176, _c2_3177, ((_t_3174 * 4.0) - 1.0));
}
if ((_t_3174 < 0.75))
{
return lerp(_c2_3177, _c3_3178, ((_t_3174 * 4.0) - 2.0));
}
return lerp(_c3_3178, _c4_3179, ((_t_3174 * 4.0) - 3.0));
}
@@ PIXEL OUTPUT @@

PS_OUTPUT main(@@ PIXEL MAIN PARAMETERS @@){
@@ MAIN PROLOGUE @@
float2 _uv_3181 = (gl_FragCoord.xy / _uRes);
float3 _rd_3182 = f_rayDir(_uv_3181);
float3 _ro_3183 = _uCamPos;
float _r_3184 = length(_ro_3183);
float3 _col_3185 = f_skyDir(_rd_3182);
float _tG_3186 = f_sphere(_ro_3183, _rd_3182, 6360.0).x;
if ((_tG_3186 > 0.0))
{
float3 _pg_3187 = (_ro_3183 + (_rd_3182 * _tG_3186));
float3 _nrm_3188 = normalize(_pg_3187);
float4 _w_3189 = gl_texture2D(_uWeather, (_pg_3187.xz / 23.0));
float4 _w2_3190 = gl_texture2D(_uWeather, ((_pg_3187.xz / 5.30000019) + 0.370000005));
float3 _alb_3191 = lerp(float3(0.0450000018, 0.075000003, 0.0299999993), float3(0.129999995, 0.115000002, 0.0700000003), clamp(((_w_3189.z * 1.20000005) - 0.100000001), 0.0, 1.0));
(_alb_3191 *= (0.699999988 + ((0.600000024 * _w2_3190.w) * _w2_3190.z)));
bool _cl_3192 = (_uView != 1);
float sc90 = {0};
if (_cl_3192)
{
(sc90 = lerp(0.200000003, 1.0, f_cloudShadow(_pg_3187, 2.0)));
}
else
{
(sc90 = 1.0);
}
float _sh_3193 = sc90;
float sc91 = {0};
if (_cl_3192)
{
(sc91 = f_airShadow((_ro_3183 + (_rd_3182 * (0.5 * _tG_3186)))));
}
else
{
(sc91 = 1.0);
}
float _shAir_3194 = sc91;
float3 _skyUp_3195 = ((f_skyLUT(1.0, 1.0) * 0.400000006) + (((f_skyLUT(0.340000004, 1.0) + (2.0 * f_skyLUT(0.340000004, 0.0))) + f_skyLUT(0.340000004, -1.0)) * 0.150000006));
float3 _sunG_3196 = (_uSunE * f_sunTrans(_pg_3187, _uSunDir));
float3 _E_3197 = ((_sunG_3196 * ((max(dot(_nrm_3188, _uSunDir), 0.0) * _sh_3193) + ((max(_uSunDir.y, 0.0) * (1.0 - _shAir_3194)) * 0.25))) + (((3.14159274 * _skyUp_3195) * 0.800000012) * lerp(0.300000012, 1.0, _shAir_3194)));
(_col_3185 = ((_col_3185 * lerp(0.349999994, 1.0, _shAir_3194)) + (((_alb_3191 / 3.14159274) * _E_3197) * f_transSeg(_ro_3183, _rd_3182, _tG_3186, true))));
}
else
{
float _cs_3198 = dot(_rd_3182, _uSunDir);
float _cosR_3199 = {0.999989092};
if ((_cs_3198 > _cosR_3199))
{
float _x_3200 = clamp(((1.0 - _cs_3198) / (1.0 - _cosR_3199)), 0.0, 1.0);
float _limb_3201 = (1.0 - (0.600000024 * (1.0 - sqrt((1.0 - _x_3200)))));
(_col_3185 += (((_uSunE * f_transLUT(_r_3184, _rd_3182.y)) * 2500.0) * _limb_3201));
}
if ((_uStars > 0.0))
{
float3 _g_3202 = floor((_rd_3182 * 260.0));
float _h_3203 = frac((sin(dot(_g_3202, float3(12.9898005, 78.2330017, 37.7190018))) * 43758.5469));
if ((_h_3203 > 0.997500002))
{
(_col_3185 += (((((float3(0.899999976, 0.949999988, 1.0) * _uStars) * (_h_3203 - 0.997500002)) * 400.0) * f_transLUT(_r_3184, _rd_3182.y)) / _uExposure));
}
}
}
float4 sc92 = {0, 0, 0, 0};
if ((_uCubic == 1))
{
(sc92 = f_cubicTex(_uClouds, _uv_3181));
}
else
{
(sc92 = gl_texture2D(_uClouds, _uv_3181));
}
float4 _c_3204 = sc92;
if ((_uView == 0))
{
(_col_3185 = ((_col_3185 * _c_3204.w) + _c_3204.xyz));
}
if ((_uView == 2))
{
(out_outColor = vec4_ctor(vec3_ctor(_c_3204.w), 1.0));
return generateOutput();
}
if ((_uView == 3))
{
(out_outColor = vec4_ctor(f_heat(_c_3204.x), 1.0));
return generateOutput();
}
float3 _m_3205 = f_aces((_col_3185 * _uExposure));
(_m_3205 = pow(_m_3205, float3(0.454545438, 0.454545438, 0.454545438)));
float _dn_3206 = frac((52.9829178 * frac(dot(gl_FragCoord.xy, float2(0.0671105608, 0.00583714992)))));
(out_outColor = vec4_ctor((_m_3205 + ((_dn_3206 - 0.5) / 255.0)), 1.0));
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
float2 vec2_ctor_int2(int2 x0)
{
    return float2(x0);
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
uniform int _uCubic : register(c12);
uniform float _uExposure : register(c13);
uniform float _uStars : register(c14);
uniform float3 _uSunE : register(c15);
uniform int _uView : register(c16);
static const uint _uTrans = 0;
static const uint _uSky = 1;
static const uint _uWeather = 2;
static const uint _uClouds = 3;
uniform Texture2D<float4> textures2D[4] : register(t0);
uniform SamplerState samplers2D[4] : register(s0);
static const uint _uShape = 4;
static const uint textureIndexOffset3D = 4;
static const uint samplerIndexOffset3D = 4;
uniform Texture3D<float4> textures3D[1] : register(t4);
uniform SamplerState samplers3D[1] : register(s4);
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

int2 gl_texture2DSize(uint samplerIndex, int lod)
{
    int baseLevel = 0;
    uint width; uint height; uint numberOfLevels;
    textures2D[samplerIndex].GetDimensions(baseLevel, width, height, numberOfLevels);
    width = max(width >> lod, 1);
    height = max(height >> lod, 1);
    return int2(width, height);
}

float4 gl_texture2D(uint samplerIndex, float2 t)
{
    return textures2D[samplerIndex].Sample(samplers2D[samplerIndex], float2(t.x, t.y));
}

float4 gl_texture2DLod(uint samplerIndex, float2 t, float lod)
{
    return textures2D[samplerIndex].SampleLevel(samplers2D[samplerIndex], float2(t.x, t.y), lod);
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
float3 f_sunTrans(in float3 _p_3042, in float3 _sun_3043)
{
float _r_3044 = length(_p_3042);
float _mu_3045 = (dot(_p_3042, _sun_3043) / _r_3044);
float _x_3046 = (6360.0 / _r_3044);
float _muH_3047 = (-sqrt(max(0.0, (1.0 - (_x_3046 * _x_3046)))));
return (f_transLUT(_r_3044, _mu_3045) * smoothstep((_muH_3047 - 0.00499999989), (_muH_3047 + 0.00499999989), _mu_3045));
}
float3 f_transSeg(in float3 _ro_3053, in float3 _rd_3054, in float _t_3055, in bool _ground_3056)
{
float3 _pb_3057 = (_ro_3053 + (_rd_3054 * _t_3055));
float _ra_3058 = length(_ro_3053);
float _rb_3059 = length(_pb_3057);
float _mua_3060 = (dot(_ro_3053, _rd_3054) / _ra_3058);
float _mub_3061 = (dot(_pb_3057, _rd_3054) / _rb_3059);
float3 sc87 = {0, 0, 0};
if (_ground_3056)
{
(sc87 = (f_transLUT(_rb_3059, (-_mub_3061)) / max(f_transLUT(_ra_3058, (-_mua_3060)), float3(9.99999997e-07, 9.99999997e-07, 9.99999997e-07))));
}
else
{
(sc87 = (f_transLUT(_ra_3058, _mua_3060) / max(f_transLUT(_rb_3059, _mub_3061), float3(9.99999997e-07, 9.99999997e-07, 9.99999997e-07))));
}
float3 _v_3062 = sc87;
return clamp(_v_3062, 0.0, 1.0);
}
float3 f_skyLUT(in float _cosV_3066, in float _cosPhi_3067)
{
float _r_3068 = _uCamR;
float _vh_3069 = sqrt(max(0.0, ((_r_3068 - 6360.0) * (_r_3068 + 6360.0))));
float _beta_3070 = acos(clamp((_vh_3069 / _r_3068), -1.0, 1.0));
float _zha_3071 = (3.14159274 - _beta_3070);
float _vz_3072 = acos(clamp(_cosV_3066, -1.0, 1.0));
float sc88 = {0};
if ((_vz_3072 < _zha_3071))
{
(sc88 = (0.5 * (1.0 - sqrt(max(0.0, (1.0 - (_vz_3072 / _zha_3071)))))));
}
else
{
(sc88 = (0.5 + (0.5 * sqrt(max(0.0, ((_vz_3072 - _zha_3071) / _beta_3070))))));
}
float _v_3073 = sc88;
float _u_3074 = sqrt(clamp((0.5 - (0.5 * _cosPhi_3067)), 0.0, 1.0));
return gl_texture2D(_uSky, vec2_ctor(_u_3074, _v_3073)).xyz;
}
float3 f_skyDir(in float3 _rd_3077)
{
float2 _a_3078 = _rd_3077.xz;
float2 _b_3079 = _uSunDir.xz;
float _la_3080 = length(_a_3078);
float _lb_3081 = length(_b_3079);
float sc89 = {0};
bool sc8a = (_la_3080 > 9.99999975e-05);
if (sc8a)
{
(sc8a = (_lb_3081 > 9.99999975e-05));
}
if (sc8a)
{
(sc89 = (dot(_a_3078, _b_3079) / (_la_3080 * _lb_3081)));
}
else
{
(sc89 = 1.0);
}
float _cp_3082 = sc89;
return f_skyLUT(_rd_3077.y, _cp_3082);
}
float f_remap(in float _v_3091, in float _a_3092, in float _b_3093, in float _c_3094, in float _d_3095)
{
return (_c_3094 + (((_v_3091 - _a_3092) * (_d_3095 - _c_3094)) / (_b_3093 - _a_3092)));
}
float f_cloudBase(in float3 _p_3097, in float _lod_3098, inout float _hf_3099)
{
(_hf_3099 = (((length(_p_3097) - 6360.0) - 1.5) / 2.5));
bool sc8b = (_hf_3099 <= 0.0);
if ((!sc8b))
{
(sc8b = (_hf_3099 >= 1.0));
}
if (sc8b)
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
float f_cloudShadow(in float3 _p_3120, in float _lod_3121)
{
float _r_3122 = length(_p_3120);
if ((_r_3122 > 6364.0))
{
return 1.0;
}
float2 _iB_3123 = f_sphere(_p_3120, _uSunDir, 6361.5);
float2 _iT_3124 = f_sphere(_p_3120, _uSunDir, 6364.0);
float sc8c = {0};
if ((_r_3122 < 6361.5))
{
(sc8c = _iB_3123.y);
}
else
{
(sc8c = 0.0);
}
float _t0_3125 = sc8c;
float sc8d = {0};
bool sc8e = (_r_3122 >= 6361.5);
if (sc8e)
{
(sc8e = (_iB_3123.x > 0.0));
}
if (sc8e)
{
(sc8d = _iB_3123.x);
}
else
{
(sc8d = _iT_3124.y);
}
float _t1_3126 = sc8d;
if ((_t1_3126 <= _t0_3125))
{
return 1.0;
}
(_t1_3126 = min(_t1_3126, (_t0_3125 + 12.0)));
float _dt_3127 = ((_t1_3126 - _t0_3125) / 8.0);
float _od_3128 = {0.0};
float _hf_3129 = {0};
{ for(int _i_3130 = {0}; (_i_3130 < 8); (_i_3130++))
{
(_od_3128 += (f_cloudBase((_p_3120 + (_uSunDir * (_t0_3125 + ((float_ctor_int(_i_3130) + 0.5) * _dt_3127)))), _lod_3121, _hf_3129) * _dt_3127));
}
}
return exp((((-_od_3128) * _uDensity) * 0.600000024));
}
float f_airShadow(in float3 _p_3132)
{
float _rm_3133 = {6362.75};
float _r_3134 = length(_p_3132);
float sc8f = {0};
if ((_r_3134 < _rm_3133))
{
(sc8f = min(max(f_sphere(_p_3132, _uSunDir, _rm_3133).y, 0.0), 15.0));
}
else
{
(sc8f = 0.0);
}
float _t_3135 = sc8f;
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
float4 f_cubicTex(const uint _t_3152, in float2 _uv_3153)
{
float2 _ts_3154 = vec2_ctor_int2(gl_texture2DSize(_t_3152, 0));
float2 _p_3155 = ((_uv_3153 * _ts_3154) - 0.5);
float2 _f_3156 = frac(_p_3155);
(_p_3155 -= _f_3156);
float2 _f2_3157 = (_f_3156 * _f_3156);
float2 _f3_3158 = (_f2_3157 * _f_3156);
float2 _w0_3159 = (((((-_f3_3158) + (3.0 * _f2_3157)) - (3.0 * _f_3156)) + 1.0) / 6.0);
float2 _w1_3160 = ((((3.0 * _f3_3158) - (6.0 * _f2_3157)) + 4.0) / 6.0);
float2 _w3_3161 = (_f3_3158 / 6.0);
float2 _s0_3162 = (_w0_3159 + _w1_3160);
float2 _o0_3163 = (((_p_3155 - 0.5) + (_w1_3160 / _s0_3162)) / _ts_3154);
float2 _o1_3164 = (((_p_3155 + 1.5) + (_w3_3161 / (1.0 - _s0_3162))) / _ts_3154);
float4 _a_3165 = lerp(gl_texture2D(_t_3152, vec2_ctor(_o1_3164.x, _o0_3163.y)), gl_texture2D(_t_3152, vec2_ctor(_o0_3163.x, _o0_3163.y)), _s0_3162.x);
float4 _b_3166 = lerp(gl_texture2D(_t_3152, vec2_ctor(_o1_3164.x, _o1_3164.y)), gl_texture2D(_t_3152, vec2_ctor(_o0_3163.x, _o1_3164.y)), _s0_3162.x);
return lerp(_b_3166, _a_3165, _s0_3162.y);
}
float3 f_aces(in float3 _x_3172)
{
return clamp(((_x_3172 * ((2.50999999 * _x_3172) + 0.0299999993)) / ((_x_3172 * ((2.43000007 * _x_3172) + 0.589999974)) + 0.140000001)), 0.0, 1.0);
}
float3 f_heat(in float _t_3174)
{
(_t_3174 = clamp(_t_3174, 0.0, 1.0));
float3 _c0_3175 = {0.0599999987, 0.0399999991, 0.239999995};
float3 _c1_3176 = {0.119999997, 0.419999987, 0.860000014};
float3 _c2_3177 = {0.200000003, 0.779999971, 0.550000012};
float3 _c3_3178 = {0.980000019, 0.800000012, 0.200000003};
float3 _c4_3179 = {0.860000014, 0.159999996, 0.100000001};
if ((_t_3174 < 0.25))
{
return lerp(_c0_3175, _c1_3176, (_t_3174 * 4.0));
}
if ((_t_3174 < 0.5))
{
return lerp(_c1_3176, _c2_3177, ((_t_3174 * 4.0) - 1.0));
}
if ((_t_3174 < 0.75))
{
return lerp(_c2_3177, _c3_3178, ((_t_3174 * 4.0) - 2.0));
}
return lerp(_c3_3178, _c4_3179, ((_t_3174 * 4.0) - 3.0));
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

float2 _uv_3181 = (gl_FragCoord.xy / _uRes);
float3 _rd_3182 = f_rayDir(_uv_3181);
float3 _ro_3183 = _uCamPos;
float _r_3184 = length(_ro_3183);
float3 _col_3185 = f_skyDir(_rd_3182);
float _tG_3186 = f_sphere(_ro_3183, _rd_3182, 6360.0).x;
if ((_tG_3186 > 0.0))
{
float3 _pg_3187 = (_ro_3183 + (_rd_3182 * _tG_3186));
float3 _nrm_3188 = normalize(_pg_3187);
float4 _w_3189 = gl_texture2D(_uWeather, (_pg_3187.xz / 23.0));
float4 _w2_3190 = gl_texture2D(_uWeather, ((_pg_3187.xz / 5.30000019) + 0.370000005));
float3 _alb_3191 = lerp(float3(0.0450000018, 0.075000003, 0.0299999993), float3(0.129999995, 0.115000002, 0.0700000003), clamp(((_w_3189.z * 1.20000005) - 0.100000001), 0.0, 1.0));
(_alb_3191 *= (0.699999988 + ((0.600000024 * _w2_3190.w) * _w2_3190.z)));
bool _cl_3192 = (_uView != 1);
float sc90 = {0};
if (_cl_3192)
{
(sc90 = lerp(0.200000003, 1.0, f_cloudShadow(_pg_3187, 2.0)));
}
else
{
(sc90 = 1.0);
}
float _sh_3193 = sc90;
float sc91 = {0};
if (_cl_3192)
{
(sc91 = f_airShadow((_ro_3183 + (_rd_3182 * (0.5 * _tG_3186)))));
}
else
{
(sc91 = 1.0);
}
float _shAir_3194 = sc91;
float3 _skyUp_3195 = ((f_skyLUT(1.0, 1.0) * 0.400000006) + (((f_skyLUT(0.340000004, 1.0) + (2.0 * f_skyLUT(0.340000004, 0.0))) + f_skyLUT(0.340000004, -1.0)) * 0.150000006));
float3 _sunG_3196 = (_uSunE * f_sunTrans(_pg_3187, _uSunDir));
float3 _E_3197 = ((_sunG_3196 * ((max(dot(_nrm_3188, _uSunDir), 0.0) * _sh_3193) + ((max(_uSunDir.y, 0.0) * (1.0 - _shAir_3194)) * 0.25))) + (((3.14159274 * _skyUp_3195) * 0.800000012) * lerp(0.300000012, 1.0, _shAir_3194)));
(_col_3185 = ((_col_3185 * lerp(0.349999994, 1.0, _shAir_3194)) + (((_alb_3191 / 3.14159274) * _E_3197) * f_transSeg(_ro_3183, _rd_3182, _tG_3186, true))));
}
else
{
float _cs_3198 = dot(_rd_3182, _uSunDir);
float _cosR_3199 = {0.999989092};
if ((_cs_3198 > _cosR_3199))
{
float _x_3200 = clamp(((1.0 - _cs_3198) / (1.0 - _cosR_3199)), 0.0, 1.0);
float _limb_3201 = (1.0 - (0.600000024 * (1.0 - sqrt((1.0 - _x_3200)))));
(_col_3185 += (((_uSunE * f_transLUT(_r_3184, _rd_3182.y)) * 2500.0) * _limb_3201));
}
if ((_uStars > 0.0))
{
float3 _g_3202 = floor((_rd_3182 * 260.0));
float _h_3203 = frac((sin(dot(_g_3202, float3(12.9898005, 78.2330017, 37.7190018))) * 43758.5469));
if ((_h_3203 > 0.997500002))
{
(_col_3185 += (((((float3(0.899999976, 0.949999988, 1.0) * _uStars) * (_h_3203 - 0.997500002)) * 400.0) * f_transLUT(_r_3184, _rd_3182.y)) / _uExposure));
}
}
}
float4 sc92 = {0, 0, 0, 0};
if ((_uCubic == 1))
{
(sc92 = f_cubicTex(_uClouds, _uv_3181));
}
else
{
(sc92 = gl_texture2D(_uClouds, _uv_3181));
}
float4 _c_3204 = sc92;
if ((_uView == 0))
{
(_col_3185 = ((_col_3185 * _c_3204.w) + _c_3204.xyz));
}
if ((_uView == 2))
{
(out_outColor = vec4_ctor(vec3_ctor(_c_3204.w), 1.0));
return generateOutput();
}
if ((_uView == 3))
{
(out_outColor = vec4_ctor(f_heat(_c_3204.x), 1.0));
return generateOutput();
}
float3 _m_3205 = f_aces((_col_3185 * _uExposure));
(_m_3205 = pow(_m_3205, float3(0.454545438, 0.454545438, 0.454545438)));
float _dn_3206 = frac((52.9829178 * frac(dot(gl_FragCoord.xy, float2(0.0671105608, 0.00583714992)))));
(out_outColor = vec4_ctor((_m_3205 + ((_dn_3206 - 0.5) / 255.0)), 1.0));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
