
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

uniform float _uCamR : register(c0);
uniform float _uSunCos : register(c1);
static const uint _uTrans = 0;
static const uint _uMS = 1;
uniform Texture2D<float4> textures2D[2] : register(t0);
uniform SamplerState samplers2D[2] : register(s0);
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
    SamplerMetadata samplerMetadata[2] : packoffset(c4);
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
float f_phaseR(in float _mu_3025)
{
return (0.0596831031 * (1.0 + (_mu_3025 * _mu_3025)));
}
float f_phaseM(in float _mu_3027)
{
float _k_3029 = {0.0162772071};
return ((_k_3029 * (1.0 + (_mu_3027 * _mu_3027))) / pow((1.6400001 - (1.60000002 * _mu_3027)), 1.5));
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
float3 f_msLUT(in float _r_3049, in float _muS_3050)
{
float2 _uv_3051 = vec2_ctor(((_muS_3050 * 0.5) + 0.5), ((_r_3049 - 6360.0) / 100.0));
(_uv_3051 = ((clamp(_uv_3051, 0.0, 1.0) * 0.96875) + 0.015625));
return gl_texture2D(_uMS, _uv_3051).xyz;
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

float2 _uv_3066 = (gl_FragCoord.xy / float2(192.0, 108.0));
float _r_3067 = _uCamR;
float _vh_3068 = sqrt(max(0.0, ((_r_3067 - 6360.0) * (_r_3067 + 6360.0))));
float _beta_3069 = acos(clamp((_vh_3068 / _r_3067), -1.0, 1.0));
float _zha_3070 = (3.14159274 - _beta_3069);
float _vz_3071 = {0};
if ((_uv_3066.y < 0.5))
{
float _c_3072 = (1.0 - (2.0 * _uv_3066.y));
(_vz_3071 = (_zha_3070 * (1.0 - (_c_3072 * _c_3072))));
}
else
{
float _c_3073 = ((_uv_3066.y * 2.0) - 1.0);
(_vz_3071 = (_zha_3070 + ((_beta_3069 * _c_3073) * _c_3073)));
}
float _cosPhi_3074 = (1.0 - ((2.0 * _uv_3066.x) * _uv_3066.x));
float _sinPhi_3075 = sqrt(max(0.0, (1.0 - (_cosPhi_3074 * _cosPhi_3074))));
float3 _rd_3076 = vec3_ctor((sin(_vz_3071) * _cosPhi_3074), cos(_vz_3071), (sin(_vz_3071) * _sinPhi_3075));
float3 _sun_3077 = vec3_ctor(sqrt(max(0.0, (1.0 - (_uSunCos * _uSunCos)))), _uSunCos, 0.0);
float3 _ro_3078 = vec3_ctor(0.0, _r_3067, 0.0);
float _tG_3079 = f_sphere(_ro_3078, _rd_3076, 6360.0).x;
float sc1a = {0};
if ((_tG_3079 > 0.0))
{
(sc1a = _tG_3079);
}
else
{
(sc1a = f_sphere(_ro_3078, _rd_3076, 6460.0).y);
}
float _tmax_3080 = sc1a;
float _mu_3081 = dot(_rd_3076, _sun_3077);
float _pR_3082 = f_phaseR(_mu_3081);
float _pM_3083 = f_phaseM(_mu_3081);
float3 _Ls_3085 = {0.0, 0.0, 0.0};
float3 _T_3086 = {1.0, 1.0, 1.0};
float _t0_3087 = {0.0};
{LOOP for(int _s_3088 = {0}; (_s_3088 < 32); (_s_3088++))
{
float sc1b = ((float_ctor_int(_s_3088) + 1.0) / 32.0);
float _t1_3089 = (_tmax_3080 * (sc1b * sc1b));
float _dt_3090 = (_t1_3089 - _t0_3087);
float3 _p_3091 = (_ro_3078 + (_rd_3076 * (_t0_3087 + (0.300000012 * _dt_3090))));
(_t0_3087 = _t1_3089);
float _rp_3092 = length(_p_3091);
float3 _sR_3093 = {0, 0, 0};
float3 _ext_3094 = {0, 0, 0};
float _sM_3095 = {0};
f_medium((_rp_3092 - 6360.0), _sR_3093, _sM_3095, _ext_3094);
float3 _Ts_3096 = exp(((-_ext_3094) * _dt_3090));
float3 _S_3097 = ((f_sunTrans(_p_3091, _sun_3077) * ((_sR_3093 * _pR_3082) + (_sM_3095 * _pM_3083))) + (f_msLUT(_rp_3092, (dot(_p_3091, _sun_3077) / _rp_3092)) * (_sR_3093 + _sM_3095)));
(_Ls_3085 += (((_T_3086 * _S_3097) * (1.0 - _Ts_3096)) / max(_ext_3094, float3(9.99999972e-10, 9.99999972e-10, 9.99999972e-10))));
(_T_3086 *= _Ts_3096);
}
}
(out_outColor = vec4_ctor(_Ls_3085, 1.0));
return generateOutput();
}
