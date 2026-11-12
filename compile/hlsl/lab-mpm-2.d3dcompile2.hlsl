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
float2x2 mat2_ctor(float x0)
{
    return float2x2(x0, 0.0, 0.0, x0);
}
float2x2 mat2_ctor(float x0, float x1, float x2, float x3)
{
    return float2x2(x0, x1, x2, x3);
}
float2x2 mat2_ctor_float4(float4 x0)
{
    return float2x2(x0);
}
float4 vec4_ctor(float x0, float3 x1)
{
    return float4(x0, x1);
}
float4 vec4_ctor(float2 x0, float2 x1)
{
    return float4(x0, x1);
}
int int_ctor(float x0)
{
    return int(x0);
}
int2 ivec2_ctor(float2 x0)
{
    return int2(x0);
}
int2 ivec2_ctor_int_int(int x0, int x1)
{
    return int2(x0, x1);
}
// Uniforms

uniform int _uN : register(c0);
uniform float _uInvDx : register(c1);
uniform float _uDt : register(c2);
uniform float2 _uLo : register(c3);
uniform float2 _uHi : register(c4);
uniform float _uMu0 : register(c5);
uniform float _uLa0 : register(c6);
uniform float _uLaW : register(c7);
uniform float _uHmax : register(c8);
uniform int _uModel : register(c9);
static const uint _uT0 = 0;
static const uint _uT2 = 1;
static const uint _uT3 = 2;
static const uint _uVel = 3;
uniform Texture2D<float4> textures2D[4] : register(t0);
uniform SamplerState samplers2D[4] : register(s0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings

static float4 out_o0 = {0, 0, 0, 0};
static float4 out_o1 = {0, 0, 0, 0};
static float4 out_o2 = {0, 0, 0, 0};
static float4 out_o3 = {0, 0, 0, 0};
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
    SamplerMetadata samplerMetadata[4] : packoffset(c4);
};

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
float2x2 outerProduct_emu(in float2 c, in float2 r)
{
    return mul(float2x1(r), float1x2(c));
}


float f_bspline(in float _r_3002)
{
(_r_3002 = abs(_r_3002));
float sc02 = {0};
if ((_r_3002 < 0.5))
{
(sc02 = (0.75 - (_r_3002 * _r_3002)));
}
else
{
(sc02 = ((0.5 * (1.5 - _r_3002)) * (1.5 - _r_3002)));
}
return sc02;
}
void f_svd2_float2x2_float2x2_float2x2_float2x2(in float2x2 _F_3024, inout float2x2 _R_3025, inout float2x2 _U_3026, inout float2 _sig_3027, inout float2x2 _V_3028)
{
float2 _q_3029 = vec2_ctor((_F_3024[0][0] + _F_3024[1][1]), (_F_3024[0][1] - _F_3024[1][0]));
float _l_3030 = length(_q_3029);
float2 sc03 = {0, 0};
if ((_l_3030 > 9.99999996e-13))
{
(sc03 = (_q_3029 / _l_3030));
}
else
{
(sc03 = float2(1.0, 0.0));
}
(_q_3029 = sc03);
(_R_3025 = mat2_ctor(_q_3029.x, _q_3029.y, (-_q_3029.y), _q_3029.x));
float2x2 _S_3031 = transpose(mul(transpose(transpose(_R_3025)), transpose(_F_3024)));
float _s00_3032 = _S_3031[0][0];
float _s11_3033 = _S_3031[1][1];
float _s01_3034 = (0.5 * (_S_3031[1][0] + _S_3031[0][1]));
float _ex_3035 = (_s00_3032 - _s11_3033);
float _ey_3036 = (2.0 * _s01_3034);
float _r_3037 = sqrt(((_ex_3035 * _ex_3035) + (_ey_3036 * _ey_3036)));
float _c_3038 = {1.0};
float _s_3039 = {0.0};
if ((_r_3037 > 9.99999996e-13))
{
(_c_3038 = sqrt(max(0.0, (0.5 * (1.0 + (_ex_3035 / _r_3037))))));
(_s_3039 = sqrt(max(0.0, (0.5 * (1.0 - (_ex_3035 / _r_3037))))));
if ((_ey_3036 < 0.0))
{
(_s_3039 = (-_s_3039));
}
}
(_V_3028 = mat2_ctor(_c_3038, _s_3039, (-_s_3039), _c_3038));
float _m_3040 = (0.5 * (_s00_3032 + _s11_3033));
(_sig_3027 = vec2_ctor((_m_3040 + (0.5 * _r_3037)), (_m_3040 - (0.5 * _r_3037))));
(_U_3026 = transpose(mul(transpose(_R_3025), transpose(_V_3028))));
}
struct PS_OUTPUT
{
    float4 out_o0 : SV_TARGET0;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_o0 = out_o0;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;

int2 _tc_3042 = ivec2_ctor(gl_FragCoord.xy);
if ((((_tc_3042.y * 256) + _tc_3042.x) >= _uN))
{
(out_o0 = float4(0.0, 0.0, 0.0, 0.0));
(out_o1 = float4(0.0, 0.0, 0.0, 0.0));
(out_o2 = float4(1.0, 0.0, 0.0, 1.0));
(out_o3 = float4(1.0, 0.0, 0.0, 0.0));
return generateOutput();
}
float4 _a_3043 = gl_texture2DFetch(_uT0, _tc_3042, 0);
float2x2 _F_3044 = mat2_ctor_float4(gl_texture2DFetch(_uT2, _tc_3042, 0));
float4 _st_3045 = gl_texture2DFetch(_uT3, _tc_3042, 0);
if ((_st_3045.x < 0.0))
{
float sc04 = {0};
if ((_st_3045.x < -1.5))
{
(sc04 = 1000000000.0);
}
else
{
(sc04 = gl_texture2DFetch(_uVel, ivec2_ctor(floor(((_a_3043.xy * _uInvDx) + 0.5))), 0).z);
}
float _m_3046 = sc04;
(out_o0 = _a_3043);
(out_o1 = float4(0.0, 0.0, 0.0, 0.0));
(out_o2 = float4(1.0, 0.0, 0.0, 1.0));
float sc05 = {0};
if ((_m_3046 < 1.20000005))
{
(sc05 = 1.0);
}
else
{
(sc05 = -2.0);
}
(out_o3 = vec4_ctor(sc05, _st_3045.yzw));
return generateOutput();
}
float2 _xg_3047 = (_a_3043.xy * _uInvDx);
int2 _base_3048 = ivec2_ctor(floor((_xg_3047 - 0.5)));
float2 _fx_3049 = (_xg_3047 - vec2_ctor_int2(_base_3048));
float2 _nv_3050 = {0.0, 0.0};
float2x2 _Bm_3051 = {0.0, 0.0, 0.0, 0.0};
{ for(int _i_3052 = {0}; (_i_3052 < 3); (_i_3052++))
{
{ for(int _j_3053 = {0}; (_j_3053 < 3); (_j_3053++))
{
float2 _d_3054 = (vec2_ctor(float_ctor_int(_i_3052), float_ctor_int(_j_3053)) - _fx_3049);
float _w_3055 = (f_bspline(_d_3054.x) * f_bspline(_d_3054.y));
float2 _gv_3056 = gl_texture2DFetch(_uVel, (_base_3048 + ivec2_ctor_int_int(_i_3052, _j_3053)), 0).xy;
(_nv_3050 += ((_w_3055 * _gv_3056) + float2(0.0, 0.0)));
(_Bm_3051 += ((_w_3055 * outerProduct_emu(_gv_3056, _d_3054)) + float2x2(0.0, 0.0, 0.0, 0.0)));
}
}
}
}
float2x2 _C_3057 = ((4.0 * _uInvDx) * _Bm_3051);
float2 _x_3058 = clamp((_a_3043.xy + (_uDt * _nv_3050)), _uLo, _uHi);
(_F_3044 = transpose(mul(transpose((float2x2(1.0, 0.0, 0.0, 1.0) + (_uDt * _C_3057))), transpose(_F_3044))));
float _Jp_3059 = _st_3045.x;
int _mat_3060 = int_ctor((_st_3045.y + 0.5));
float2x2 _tau_3061 = {0, 0, 0, 0};
if ((_mat_3060 == 0))
{
float _J_3062 = clamp(determinant(transpose(_F_3044)), 0.200000003, 3.0);
(_F_3044 = mat2_ctor(sqrt(_J_3062)));
(_tau_3061 = mat2_ctor(((_uLaW * _J_3062) * (_J_3062 - 1.0))));
}
else
{
float sc06 = {0};
if ((_mat_3060 == 1))
{
(sc06 = 0.300000012);
}
else
{
(sc06 = min(exp((10.0 * (1.0 - _Jp_3059))), _uHmax));
}
float _h_3063 = sc06;
float _mu_3064 = (_uMu0 * _h_3063);
float _la_3065 = (_uLa0 * _h_3063);
float2x2 _R_3066 = {0, 0, 0, 0};
float2x2 _U_3067 = {0, 0, 0, 0};
float2x2 _V_3068 = {0, 0, 0, 0};
float2 _sig_3069 = {0, 0};
f_svd2_float2x2_float2x2_float2x2_float2x2(_F_3044, _R_3066, _U_3067, _sig_3069, _V_3068);
if ((_mat_3060 == 2))
{
float2 _sc_3070 = clamp(_sig_3069, float2(0.975000024, 0.975000024), float2(1.00450003, 1.00450003));
(_Jp_3059 = clamp(((_Jp_3059 * (_sig_3069.x * _sig_3069.y)) / (_sc_3070.x * _sc_3070.y)), 0.300000012, 20.0));
(_F_3044 = transpose(mul(transpose(transpose(mul(transpose(_U_3067), transpose(mat2_ctor(_sc_3070.x, 0.0, 0.0, _sc_3070.y))))), transpose(transpose(_V_3068)))));
}
float _J_3071 = determinant(transpose(_F_3044));
if ((_uModel == 0))
{
(_tau_3061 = (transpose(mul(transpose(((2.0 * _mu_3064) * (_F_3044 - _R_3066))), transpose(transpose(_F_3044)))) + mat2_ctor(((_la_3065 * _J_3071) * (_J_3071 - 1.0)))));
}
else
{
float _Jc_3072 = max(_J_3071, 0.0500000007);
(_tau_3061 = ((_mu_3064 * (transpose(mul(transpose(_F_3044), transpose(transpose(_F_3044)))) - float2x2(1.0, 0.0, 0.0, 1.0))) + mat2_ctor((_la_3065 * log(_Jc_3072)))));
}
}
float2x2 _A_3073 = (_C_3057 - ((((_uDt * 4.0) * _uInvDx) * _uInvDx) * _tau_3061));
(out_o0 = vec4_ctor(_x_3058, _nv_3050));
(out_o1 = vec4_ctor(_A_3073[0], _A_3073[1]));
(out_o2 = vec4_ctor(_F_3044[0], _F_3044[1]));
(out_o3 = vec4_ctor(_Jp_3059, _st_3045.yzw));
return generateOutput();
}
