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

float2 _uv_3031 = (gl_FragCoord.xy / float2(256.0, 64.0));
float _H_3032 = {1132.25439};
float _rho_3033 = (_H_3032 * _uv_3031.y);
float _r_3034 = sqrt(((_rho_3033 * _rho_3033) + 40449600.0));
float _dmin_3035 = (6460.0 - _r_3034);
float _dmax_3036 = (_rho_3033 + _H_3032);
float _d_3037 = (_dmin_3035 + (_uv_3031.x * (_dmax_3036 - _dmin_3035)));
float sbea = {0};
if ((_d_3037 == 0.0))
{
(sbea = 1.0);
}
else
{
(sbea = ((((_H_3032 * _H_3032) - (_rho_3033 * _rho_3033)) - (_d_3037 * _d_3037)) / ((2.0 * _r_3034) * _d_3037)));
}
float _mu_3038 = sbea;
(_mu_3038 = clamp(_mu_3038, -1.0, 1.0));
float3 _ro_3039 = vec3_ctor(0.0, _r_3034, 0.0);
float3 _rd_3040 = vec3_ctor(sqrt((1.0 - (_mu_3038 * _mu_3038))), _mu_3038, 0.0);
float _tmax_3041 = max(f_sphere(_ro_3039, _rd_3040, 6460.0).y, 0.0);
float _dt_3043 = (_tmax_3041 / 40.0);
float3 _od_3044 = {0.0, 0.0, 0.0};
{ for(int _i_3045 = {0}; (_i_3045 < 40); (_i_3045++))
{
float3 _p_3046 = (_ro_3039 + (_rd_3040 * ((float_ctor_int(_i_3045) + 0.5) * _dt_3043)));
float3 _sR_3047 = {0, 0, 0};
float3 _ext_3048 = {0, 0, 0};
float _sM_3049 = {0};
f_medium((length(_p_3046) - 6360.0), _sR_3047, _sM_3049, _ext_3048);
(_od_3044 += (_ext_3048 * _dt_3043));
}
}
(out_outColor = vec4_ctor(exp((-_od_3044)), 1.0));
return generateOutput();
}
