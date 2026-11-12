struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 gl_FragCoord : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float2 vec2_ctor(float x0, float x1)
{
    return float2(x0, x1);
}
float2x2 mat2_ctor(float x0, float x1, float x2, float x3)
{
    return float2x2(x0, x1, x2, x3);
}
float3 vec3_ctor(float x0, float x1, float x2)
{
    return float3(x0, x1, x2);
}
float3 vec3_ctor(float2 x0, float x1)
{
    return float3(x0, x1);
}
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
// Uniforms

uniform float2 _uRes : register(c0);
uniform float _uAspect : register(c1);
uniform float _uTime : register(c2);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings

static float4 gl_Color[1] =
{
    float4(0, 0, 0, 0)
};
static float4 gl_FragCoord = float4(0, 0, 0, 0);

cbuffer DriverConstants : register(b1)
{
    float4 dx_ViewCoords : packoffset(c1);
    float2 dx_FragCoordOffset : packoffset(c3);
    float3 dx_DepthFront : packoffset(c2);
    float2 dx_ViewScale : packoffset(c3.z);
    uint dx_Misc : packoffset(c2.w);
};

#define GL_USES_FRAG_COLOR
#define GL_USES_FRAG_COORD
float mod_emu(float x, float y)
{
    return x - y * floor(x / y);
}


float f_hash(in float2 _p_3005)
{
return frac((sin(dot(_p_3005, float2(127.099998, 311.700012))) * 43758.5469));
}
float f_sdBox(in float3 _p_3007, in float3 _b_3008)
{
float3 _q_3009 = (abs(_p_3007) - _b_3008);
return (length(max(_q_3009, 0.0)) + min(max(_q_3009.x, max(_q_3009.y, _q_3009.z)), 0.0));
}
float f_ribInner(in float3 _q_3011)
{
return (f_sdBox((_q_3011 - float3(0.0, 1.29999995, 0.0)), float3(1.54999995, 1.29999995, 0.400000006)) - 0.25);
}
float2 f_map(in float3 _p_3013)
{
float2 _r_3014 = vec2_ctor(_p_3013.y, 1.0);
float _c_3015 = (3.0 - _p_3013.y);
if ((_c_3015 < _r_3014.x))
{
(_r_3014 = vec2_ctor(_c_3015, 2.0));
}
float _w_3016 = (2.0 - abs(_p_3013.x));
if ((_w_3016 < _r_3014.x))
{
(_r_3014 = vec2_ctor(_w_3016, 3.0));
}
float3 _q_3017 = _p_3013;
(_q_3017.z = (mod_emu(_q_3017.z, 3.0) - 1.5));
float _rib_3018 = max(f_sdBox((_q_3017 - float3(0.0, 1.5, 0.0)), float3(2.29999995, 1.70000005, 0.140000001)), (-f_ribInner(_q_3017)));
if ((_rib_3018 < _r_3014.x))
{
(_r_3014 = vec2_ctor(_rib_3018, 4.0));
}
return _r_3014;
}
float3 f_normalAt(in float3 _p_3020)
{
float2 _e_3021 = {0.00200000009, 0.0};
return normalize(vec3_ctor((f_map((_p_3020 + _e_3021.xyy)).x - f_map((_p_3020 - _e_3021.xyy)).x), (f_map((_p_3020 + _e_3021.yxy)).x - f_map((_p_3020 - _e_3021.yxy)).x), (f_map((_p_3020 + _e_3021.yyx)).x - f_map((_p_3020 - _e_3021.yyx)).x)));
}
struct PS_OUTPUT
{
    float4 gl_Color0 : SV_TARGET0;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.gl_Color0 = gl_Color[0];
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;

float2 _uv_3023 = (gl_FragCoord.xy / _uRes);
float2 _s_3024 = (((_uv_3023 * 2.0) - 1.0) * vec2_ctor(_uAspect, 1.0));
float _t_3025 = _uTime;
float3 _ro_3026 = vec3_ctor((0.449999988 * sin((_t_3025 * 0.310000002))), (1.35000002 + (0.0399999991 * sin((_t_3025 * 1.89999998)))), (_t_3025 * 1.39999998));
float _yaw_3027 = (0.180000007 * sin((_t_3025 * 0.230000004)));
float3 _rd_3028 = normalize(vec3_ctor(_s_3024, 1.5));
(_rd_3028.xz = mul(transpose(mat2_ctor(cos(_yaw_3027), (-sin(_yaw_3027)), sin(_yaw_3027), cos(_yaw_3027))), _rd_3028.xz));
float _d_3029 = {0.0};
float2 _h_3030 = {1.0, 1.0};
float _steps_3031 = {0.0};
{ for(int _i_3032 = {0}; (_i_3032 < 110); (_i_3032++))
{
(_h_3030 = f_map((_ro_3026 + (_rd_3028 * _d_3029))));
bool sbf1 = (_h_3030.x < (0.000600000028 * _d_3029));
if ((!sbf1))
{
(sbf1 = (_d_3029 > 60.0));
}
if (sbf1)
{
break;
}
(_d_3029 += _h_3030.x);
(_steps_3031 += 1.0);
}
}
float3 _p_3033 = (_ro_3026 + (_rd_3028 * _d_3029));
float3 _n_3034 = f_normalAt(_p_3033);
float3 _col_3035 = {0.0, 0.0, 0.0};
float3 _emit_3036 = {0.0, 0.0, 0.0};
float _pulse_3037 = (0.5 + (0.5 * sin(((_p_3033.z * 1.29999995) - (_t_3025 * 7.0)))));
if ((_h_3030.y < 1.5))
{
float2 _g_3038 = abs((frac((_p_3033.xz * 2.0)) - 0.5));
float _seam_3039 = (1.0 - smoothstep(0.460000008, 0.49000001, max(_g_3038.x, _g_3038.y)));
(_col_3035 = ((float3(0.0599999987, 0.0649999976, 0.0799999982) * (0.600000024 + (0.400000006 * _seam_3039))) + (0.0199999996 * f_hash(floor((_p_3033.xz * 2.0))))));
float _strip_3040 = (smoothstep(1.86000001, 1.89999998, abs(_p_3033.x)) * (1.0 - smoothstep(1.94000006, 1.98000002, abs(_p_3033.x))));
(_emit_3036 += ((_strip_3040 * lerp(float3(0.100000001, 0.800000012, 1.0), float3(1.0, 0.200000003, 0.699999988), step(0.0, _p_3033.x))) * (0.600000024 + (1.60000002 * _pulse_3037))));
}
else
{
if ((_h_3030.y < 2.5))
{
float2 _g_3041 = abs((frac((_p_3033.xz * 4.0)) - 0.5));
(_col_3035 = (float3(0.0500000007, 0.0500000007, 0.0500000007) + (0.0299999993 * step(0.460000008, max(_g_3041.x, _g_3041.y)))));
(_emit_3036 += (float3(1.20000005, 1.13999999, 1.0200001) * (1.0 - smoothstep(0.100000001, 0.129999995, abs(_p_3033.x)))));
}
else
{
if ((_h_3030.y < 3.5))
{
float2 _cell_3042 = floor(vec2_ctor((_p_3033.z * 6.0), (_p_3033.y * 6.0)));
float2 _f_3043 = frac(vec2_ctor((_p_3033.z * 6.0), (_p_3033.y * 6.0)));
float _seam_3044 = step(0.920000017, max(_f_3043.x, _f_3043.y));
(_col_3035 = (float3(0.0500000007, 0.0549999997, 0.0700000003) - (0.0299999993 * _seam_3044)));
float _r_3045 = f_hash((_cell_3042 + (step(0.0, _p_3033.x) * 17.0)));
float _led_3046 = (step(0.860000014, _r_3045) * (1.0 - smoothstep(0.119999997, 0.200000003, length((_f_3043 - 0.5)))));
float _blink_3047 = step(0.300000012, frac(((_r_3045 * 13.0) + (_t_3025 * (0.5 + _r_3045)))));
(_emit_3036 += (((_led_3046 * _blink_3047) * lerp(float3(0.200000003, 1.0, 0.600000024), float3(1.0, 0.5, 0.100000001), step(0.949999988, _r_3045))) * 2.0));
float2 _big_3048 = abs((frac(vec2_ctor((_p_3033.z * 0.5), (_p_3033.y * 0.5))) - 0.5));
(_col_3035 *= (0.800000012 + (0.200000003 * step(0.469999999, max(_big_3048.x, _big_3048.y)))));
}
else
{
float3 _q_3049 = _p_3033;
(_q_3049.z = (mod_emu(_q_3049.z, 3.0) - 1.5));
(_col_3035 = (float3(0.100000001, 0.104999997, 0.119999997) * (0.850000024 + (0.150000006 * sin((_p_3033.y * 220.0))))));
float _edge_3050 = (1.0 - smoothstep(0.0, 0.0179999992, abs(f_ribInner(_q_3049))));
(_emit_3036 += ((_edge_3050 * float3(0.300000012, 0.699999988, 1.0)) * (0.600000024 + (1.39999998 * _pulse_3037))));
}
}
}
float3 _lp_3051 = vec3_ctor(0.0, 2.9000001, ((floor((_p_3033.z / 3.0)) * 3.0) + 1.5));
float3 _L_3052 = (_lp_3051 - _p_3033);
float _ld_3053 = dot(_L_3052, _L_3052);
(_L_3052 *= rsqrt(_ld_3053));
float _dif_3054 = ((max(dot(_n_3034, _L_3052), 0.0) * 3.0) / (1.0 + _ld_3053));
float _spec_3055 = ((pow(max(dot(reflect(_rd_3028, _n_3034), _L_3052), 0.0), 40.0) * 2.0) / (1.0 + _ld_3053));
float _ao_3056 = (1.0 - (_steps_3031 / 110.0));
(_col_3035 = (((_col_3035 * ((0.119999997 * _ao_3056) + _dif_3054)) + (_spec_3055 * 0.300000012)) + _emit_3036));
(_col_3035 = lerp(float3(0.00999999978, 0.0149999997, 0.0299999993), _col_3035, exp((-0.0450000018 * _d_3029))));
(_col_3035 = (_col_3035 / (1.0 + _col_3035)));
(gl_Color[0] = vec4_ctor(pow(_col_3035, float3(0.45449999, 0.45449999, 0.45449999)), 1.0));
return generateOutput();
}
