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
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
// Uniforms

static const uint _uTrans = 0;
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
    SamplerMetadata samplerMetadata[1] : packoffset(c4);
};

float4 gl_texture2D(uint samplerIndex, float2 t)
{
    return textures2D[samplerIndex].Sample(samplers2D[samplerIndex], float2(t.x, t.y));
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
void f_medium(in float _h_3017, inout float3 _sR_3018, inout float _sM_3019, inout float3 _ext_3020)
{
(_h_3017 = max(_h_3017, 0.0));
float _dR_3021 = exp(((-_h_3017) / 8.0));
float _dM_3022 = exp(((-_h_3017) / 1.20000005));
float _dO_3023 = max(0.0, (1.0 - (abs((_h_3017 - 25.0)) / 15.0)));
(_sR_3018 = (float3(0.00580199994, 0.0135580003, 0.0331000015) * _dR_3021));
(_sM_3019 = (0.00399600016 * _dM_3022));
(_ext_3020 = ((_sR_3018 + (0.00443999982 * _dM_3022)) + (float3(0.000650000002, 0.001881, 8.49999997e-05) * _dO_3023)));
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

float2 _uv_3064 = ((gl_FragCoord.xy - 0.5) / 31.0);
float _cosS_3065 = ((_uv_3064.x * 2.0) - 1.0);
float _r_3066 = (6360.0 + (clamp(_uv_3064.y, 0.0, 1.0) * 100.0));
(_r_3066 = clamp(_r_3066, 6360.00977, 6459.99023));
float3 _ro_3067 = vec3_ctor(0.0, _r_3066, 0.0);
float3 _sun_3068 = vec3_ctor(sqrt(max(0.0, (1.0 - (_cosS_3065 * _cosS_3065)))), _cosS_3065, 0.0);
float3 _L2_3069 = {0.0, 0.0, 0.0};
float3 _F_3070 = {0.0, 0.0, 0.0};
{LOOP for(int _i_3071 = {0}; (_i_3071 < 8); (_i_3071++))
{
{LOOP for(int _j_3072 = {0}; (_j_3072 < 8); (_j_3072++))
{
float _ct_3073 = (1.0 - ((2.0 * (float_ctor_int(_i_3071) + 0.5)) / 8.0));
float _stt_3074 = sqrt((1.0 - (_ct_3073 * _ct_3073)));
float _ph_3075 = ((6.28318548 * (float_ctor_int(_j_3072) + 0.5)) / 8.0);
float3 _rd_3076 = vec3_ctor((_stt_3074 * cos(_ph_3075)), _ct_3073, (_stt_3074 * sin(_ph_3075)));
float _tG_3077 = f_sphere(_ro_3067, _rd_3076, 6360.0).x;
bool _ground_3078 = (_tG_3077 > 0.0);
float sc16 = {0};
if (_ground_3078)
{
(sc16 = (_tG_3077 + 0.0));
}
else
{
(sc16 = (f_sphere(_ro_3067, _rd_3076, 6460.0).y + 0.0));
}
float _tmax_3079 = sc16;
float _dt_3081 = (_tmax_3079 / 20.0);
float3 _T_3082 = {1.0, 1.0, 1.0};
float3 _Ls_3083 = {0.0, 0.0, 0.0};
float3 _f_3084 = {0.0, 0.0, 0.0};
{LOOP for(int _s_3085 = {0}; (_s_3085 < 20); (_s_3085++))
{
float3 _p_3086 = (_ro_3067 + (_rd_3076 * ((float_ctor_int(_s_3085) + 0.5) * _dt_3081)));
float3 _sR_3087 = {0, 0, 0};
float3 _ext_3088 = {0, 0, 0};
float _sM_3089 = {0};
f_medium((length(_p_3086) - 6360.0), _sR_3087, _sM_3089, _ext_3088);
float3 _sc_3090 = (_sR_3087 + _sM_3089);
float3 _Ts_3091 = exp(((-_ext_3088) * _dt_3081));
float3 _w_3092 = ((1.0 - _Ts_3091) / max(_ext_3088, float3(9.99999972e-10, 9.99999972e-10, 9.99999972e-10)));
(_Ls_3083 += (((((_T_3082 * _w_3092) * f_sunTrans(_p_3086, _sun_3068)) * _sc_3090) / 12.566371) + float3(0.0, 0.0, 0.0)));
(_f_3084 += (((_T_3082 * _w_3092) * _sc_3090) + float3(0.0, 0.0, 0.0)));
(_T_3082 *= (_Ts_3091 + float3(0.0, 0.0, 0.0)));
}
}
if (_ground_3078)
{
float3 _pg_3093 = (_ro_3067 + (_rd_3076 * _tG_3077));
(_Ls_3083 += (((((_T_3082 * f_sunTrans(_pg_3093, _sun_3068)) * max(dot(normalize(_pg_3093), _sun_3068), 0.0)) * 0.300000012) / 3.14159274) + float3(0.0, 0.0, 0.0)));
}
(_L2_3069 += (_Ls_3083 + float3(0.0, 0.0, 0.0)));
(_F_3070 += (_f_3084 + float3(0.0, 0.0, 0.0)));
}
}
}
}
(_L2_3069 /= 64.0);
(_F_3070 /= 64.0);
(out_outColor = vec4_ctor((_L2_3069 / (1.0 - _F_3070)), 1.0));
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
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
// Uniforms

static const uint _uTrans = 0;
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
    SamplerMetadata samplerMetadata[1] : packoffset(c4);
};

float4 gl_texture2D(uint samplerIndex, float2 t)
{
    return textures2D[samplerIndex].Sample(samplers2D[samplerIndex], float2(t.x, t.y));
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
void f_medium(in float _h_3017, inout float3 _sR_3018, inout float _sM_3019, inout float3 _ext_3020)
{
(_h_3017 = max(_h_3017, 0.0));
float _dR_3021 = exp(((-_h_3017) / 8.0));
float _dM_3022 = exp(((-_h_3017) / 1.20000005));
float _dO_3023 = max(0.0, (1.0 - (abs((_h_3017 - 25.0)) / 15.0)));
(_sR_3018 = (float3(0.00580199994, 0.0135580003, 0.0331000015) * _dR_3021));
(_sM_3019 = (0.00399600016 * _dM_3022));
(_ext_3020 = ((_sR_3018 + (0.00443999982 * _dM_3022)) + (float3(0.000650000002, 0.001881, 8.49999997e-05) * _dO_3023)));
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

float2 _uv_3064 = ((gl_FragCoord.xy - 0.5) / 31.0);
float _cosS_3065 = ((_uv_3064.x * 2.0) - 1.0);
float _r_3066 = (6360.0 + (clamp(_uv_3064.y, 0.0, 1.0) * 100.0));
(_r_3066 = clamp(_r_3066, 6360.00977, 6459.99023));
float3 _ro_3067 = vec3_ctor(0.0, _r_3066, 0.0);
float3 _sun_3068 = vec3_ctor(sqrt(max(0.0, (1.0 - (_cosS_3065 * _cosS_3065)))), _cosS_3065, 0.0);
float3 _L2_3069 = {0.0, 0.0, 0.0};
float3 _F_3070 = {0.0, 0.0, 0.0};
{LOOP for(int _i_3071 = {0}; (_i_3071 < 8); (_i_3071++))
{
{LOOP for(int _j_3072 = {0}; (_j_3072 < 8); (_j_3072++))
{
float _ct_3073 = (1.0 - ((2.0 * (float_ctor_int(_i_3071) + 0.5)) / 8.0));
float _stt_3074 = sqrt((1.0 - (_ct_3073 * _ct_3073)));
float _ph_3075 = ((6.28318548 * (float_ctor_int(_j_3072) + 0.5)) / 8.0);
float3 _rd_3076 = vec3_ctor((_stt_3074 * cos(_ph_3075)), _ct_3073, (_stt_3074 * sin(_ph_3075)));
float _tG_3077 = f_sphere(_ro_3067, _rd_3076, 6360.0).x;
bool _ground_3078 = (_tG_3077 > 0.0);
float sc16 = {0};
if (_ground_3078)
{
(sc16 = (_tG_3077 + 0.0));
}
else
{
(sc16 = (f_sphere(_ro_3067, _rd_3076, 6460.0).y + 0.0));
}
float _tmax_3079 = sc16;
float _dt_3081 = (_tmax_3079 / 20.0);
float3 _T_3082 = {1.0, 1.0, 1.0};
float3 _Ls_3083 = {0.0, 0.0, 0.0};
float3 _f_3084 = {0.0, 0.0, 0.0};
{LOOP for(int _s_3085 = {0}; (_s_3085 < 20); (_s_3085++))
{
float3 _p_3086 = (_ro_3067 + (_rd_3076 * ((float_ctor_int(_s_3085) + 0.5) * _dt_3081)));
float3 _sR_3087 = {0, 0, 0};
float3 _ext_3088 = {0, 0, 0};
float _sM_3089 = {0};
f_medium((length(_p_3086) - 6360.0), _sR_3087, _sM_3089, _ext_3088);
float3 _sc_3090 = (_sR_3087 + _sM_3089);
float3 _Ts_3091 = exp(((-_ext_3088) * _dt_3081));
float3 _w_3092 = ((1.0 - _Ts_3091) / max(_ext_3088, float3(9.99999972e-10, 9.99999972e-10, 9.99999972e-10)));
(_Ls_3083 += (((((_T_3082 * _w_3092) * f_sunTrans(_p_3086, _sun_3068)) * _sc_3090) / 12.566371) + float3(0.0, 0.0, 0.0)));
(_f_3084 += (((_T_3082 * _w_3092) * _sc_3090) + float3(0.0, 0.0, 0.0)));
(_T_3082 *= (_Ts_3091 + float3(0.0, 0.0, 0.0)));
}
}
if (_ground_3078)
{
float3 _pg_3093 = (_ro_3067 + (_rd_3076 * _tG_3077));
(_Ls_3083 += (((((_T_3082 * f_sunTrans(_pg_3093, _sun_3068)) * max(dot(normalize(_pg_3093), _sun_3068), 0.0)) * 0.300000012) / 3.14159274) + float3(0.0, 0.0, 0.0)));
}
(_L2_3069 += (_Ls_3083 + float3(0.0, 0.0, 0.0)));
(_F_3070 += (_f_3084 + float3(0.0, 0.0, 0.0)));
}
}
}
}
(_L2_3069 /= 64.0);
(_F_3070 /= 64.0);
(out_outColor = vec4_ctor((_L2_3069 / (1.0 - _F_3070)), 1.0));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
