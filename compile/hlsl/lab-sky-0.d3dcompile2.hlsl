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
float float_ctor_uint(uint x0)
{
    return float(x0);
}
float3 vec3_ctor(float x0, float x1, float x2)
{
    return float3(x0, x1, x2);
}
float3 vec3_ctor(float2 x0, float x1)
{
    return float3(x0, x1);
}
float3 vec3_ctor_int3(int3 x0)
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
int3 ivec3_ctor(float3 x0)
{
    return int3(x0);
}
int3 ivec3_ctor_int_int_int(int x0, int x1, int x2)
{
    return int3(x0, x1, x2);
}
uint uint_ctor_int(int x0)
{
    return uint(x0);
}
// Uniforms

uniform float _uZ : register(c0);
uniform float _uSize : register(c1);
uniform int _uKind : register(c2);
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
uint f_pcg_uint(in uint _v_3003)
{
uint _s_3004 = ((_v_3003 * 747796405) + 2891336453);
uint _w_3005 = (((_s_3004 >> ((_s_3004 >> 28) + 4)) ^ _s_3004) * 277803737);
return ((_w_3005 >> 22) ^ _w_3005);
}
uint f_hash3_int3_int(in int3 _c_3007, in int _seed_3008)
{
return f_pcg_uint((uint_ctor_int(_c_3007.x) + f_pcg_uint((uint_ctor_int(_c_3007.y) + f_pcg_uint((uint_ctor_int(_c_3007.z) + (uint_ctor_int(_seed_3008) * 1013)))))));
}
float3 f_rnd3_int3_int(in int3 _c_3010, in int _seed_3011)
{
uint _h_3012 = f_hash3_int3_int(_c_3010, _seed_3011);
return (vec3_ctor(float_ctor_uint((_h_3012 & 1023)), float_ctor_uint(((_h_3012 >> 10) & 1023)), float_ctor_uint(((_h_3012 >> 20) & 1023))) / 1023.0);
}
float f_perlin_int_int(in float3 _p_3014, in int _per_3015, in int _seed_3016)
{
int3 _i_3017 = ivec3_ctor(floor(_p_3014));
float3 _f_3018 = (_p_3014 - vec3_ctor_int3(_i_3017));
float3 _u_3019 = (((_f_3018 * _f_3018) * _f_3018) * ((_f_3018 * ((_f_3018 * 6.0) - 15.0)) + 10.0));
int _m_3020 = (_per_3015 - 1);
float _n_3021[8] = {0, 0, 0, 0, 0, 0, 0, 0};
{ for(int _k_3022 = {0}; (_k_3022 < 8); (_k_3022++))
{
int3 _o_3023 = ivec3_ctor_int_int_int((_k_3022 & 1), ((_k_3022 >> 1) & 1), ((_k_3022 >> 2) & 1));
float3 _g_3024 = normalize((((f_rnd3_int3_int(((_i_3017 + _o_3023) & _m_3020), _seed_3016) * 2.0) - 1.0) + 9.99999975e-05));
(_n_3021[int_ctor(clamp(float_ctor_int(_k_3022), 0.0, 7.0))] = dot(_g_3024, (_f_3018 - vec3_ctor_int3(_o_3023))));
}
}
return lerp(lerp(lerp(_n_3021[0], _n_3021[1], _u_3019.x), lerp(_n_3021[2], _n_3021[3], _u_3019.x), _u_3019.y), lerp(lerp(_n_3021[4], _n_3021[5], _u_3019.x), lerp(_n_3021[6], _n_3021[7], _u_3019.x), _u_3019.y), _u_3019.z);
}
float f_perlinFbm_int_int_int(in float3 _p_3026, in int _freq_3027, in int _oct_3028, in int _seed_3029)
{
float _s_3030 = {0.0};
float _a_3031 = {1.0};
float _n_3032 = {0.0};
int _f_3033 = _freq_3027;
{ for(int _o_3034 = {0}; (_o_3034 < 8); (_o_3034++))
{
if ((_o_3034 >= _oct_3028))
{
break;
}
(_s_3030 += (_a_3031 * f_perlin_int_int((_p_3026 * float_ctor_int(_f_3033)), _f_3033, (_seed_3029 + _o_3034))));
(_n_3032 += _a_3031);
(_a_3031 *= 0.5);
(_f_3033 *= 2);
}
}
return (_s_3030 / _n_3032);
}
float f_worley_int_int(in float3 _p_3036, in int _per_3037, in int _seed_3038)
{
int3 _i_3039 = ivec3_ctor(floor(_p_3036));
float3 _f_3040 = (_p_3036 - vec3_ctor_int3(_i_3039));
float _d_3041 = {1000000000.0};
{ for(int _z_3042 = {-1}; (_z_3042 <= 1); (_z_3042++))
{
{ for(int _y_3043 = {-1}; (_y_3043 <= 1); (_y_3043++))
{
{ for(int _x_3044 = {-1}; (_x_3044 <= 1); (_x_3044++))
{
int3 _o_3045 = ivec3_ctor_int_int_int(_x_3044, _y_3043, _z_3042);
float3 _r_3046 = ((vec3_ctor_int3(_o_3045) + f_rnd3_int3_int(((_i_3039 + _o_3045) & (_per_3037 - 1)), _seed_3038)) - _f_3040);
(_d_3041 = (min(_d_3041, dot(_r_3046, _r_3046)) + 0.0));
}
}
}
}
}
}
return clamp((1.0 - sqrt(_d_3041)), 0.0, 1.0);
}
float f_worleyFbm_int_int(in float3 _p_3048, in int _f_3049, in int _seed_3050)
{
return (((f_worley_int_int((_p_3048 * float_ctor_int(_f_3049)), _f_3049, _seed_3050) * 0.625) + (f_worley_int_int((_p_3048 * float_ctor_int((2 * _f_3049))), (2 * _f_3049), (_seed_3050 + 1)) * 0.25)) + (f_worley_int_int((_p_3048 * float_ctor_int((4 * _f_3049))), (4 * _f_3049), (_seed_3050 + 2)) * 0.125));
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

float3 _p_3055 = (vec3_ctor(gl_FragCoord.xy, (_uZ + 0.5)) / _uSize);
if ((_uKind == 0))
{
float _g_3056 = f_worleyFbm_int_int(_p_3055, 4, 11);
float _pn_3057 = clamp(((f_perlinFbm_int_int_int(_p_3055, 4, 5, 1) * 2.20000005) + 0.5), 0.0, 1.0);
float _pw_3058 = clamp((((_pn_3057 + 1.0) - _g_3056) / (2.0 - _g_3056)), 0.0, 1.0);
(out_outColor = vec4_ctor(_pw_3058, _g_3056, f_worleyFbm_int_int(_p_3055, 8, 21), f_worleyFbm_int_int(_p_3055, 16, 31)));
}
else
{
if ((_uKind == 1))
{
(out_outColor = vec4_ctor(f_worleyFbm_int_int(_p_3055, 2, 41), f_worleyFbm_int_int(_p_3055, 4, 51), f_worleyFbm_int_int(_p_3055, 8, 61), 1.0));
}
else
{
(_p_3055.z = 0.370000005);
float _cov_3059 = (((clamp(((f_perlinFbm_int_int_int(_p_3055, 4, 5, 71) * 2.20000005) + 0.5), 0.0, 1.0) * 0.800000012) + (f_worleyFbm_int_int(_p_3055, 8, 81) * 0.400000006)) - 0.100000001);
float _type_3060 = clamp(((f_perlinFbm_int_int_int(_p_3055, 2, 3, 91) * 2.20000005) + 0.5), 0.0, 1.0);
float _fields_3061 = clamp(((f_perlinFbm_int_int_int(_p_3055, 16, 4, 101) * 2.20000005) + 0.5), 0.0, 1.0);
float _rough_3062 = f_worleyFbm_int_int(_p_3055, 32, 111);
(out_outColor = vec4_ctor(_cov_3059, _type_3060, _fields_3061, _rough_3062));
}
}
return generateOutput();
}
