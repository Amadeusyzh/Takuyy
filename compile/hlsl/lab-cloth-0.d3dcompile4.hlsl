struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
};
#pragma warning( disable: 3081 3556 3557 3571 )
float2 vec2_ctor(float x0)
{
    return float2(x0, x0);
}
float2x2 mat2_ctor(float2 x0, float2 x1)
{
    return float2x2(x0, x1);
}
float4 vec4_ctor(float2 x0, float x1, float x2)
{
    return float4(x0, x1, x2);
}
// Uniforms

uniform float4 _sk_RTAdjust : register(c0);
uniform float4 _uaffineMatrix_S0 : register(c1);
uniform float2 _utranslate_S0 : register(c2);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes
static float2 _resolveLevel_and_idx = {0, 0};
static float4 _p01 = {0, 0, 0, 0};
static float4 _p23 = {0, 0, 0, 0};
static float2 _fanPointAttrib = {0, 0};

static float4 gl_Position = float4(0, 0, 0, 0);

// Varyings

cbuffer DriverConstants : register(b1)
{
    float2 dx_ViewScale  : packoffset(c1);
    float clipControlOrigin : packoffset(c1.z);
    float clipControlZeroToOne : packoffset(c1.w);
};

float f_wangs_formula_max_fdiff_p2_ff2f2f2f2f22_float2x2(in float2 _p0_3012, in float2 _p1_3013, in float2 _p2_3014, in float2 _p3_3015, in float2x2 _matrix_3016)
{
float2 _d0_3017 = mul(transpose(_matrix_3016), (((float2(-2.0, -2.0) * _p1_3013) + _p2_3014) + _p0_3012));
float2 _d1_3018 = mul(transpose(_matrix_3016), (((float2(-2.0, -2.0) * _p2_3014) + _p3_3015) + _p1_3013));
return max(dot(_d0_3017, _d0_3017), dot(_d1_3018, _d1_3018));
}
float f_wangs_formula_conic_p2_fff2f2f2f(in float __precision__3020, in float2 _p0_3021, in float2 _p1_3022, in float2 _p2_3023, in float _w_3024)
{
float2 _C_3025 = ((min(min(_p0_3021, _p1_3022), _p2_3023) + max(max(_p0_3021, _p1_3022), _p2_3023)) * 0.5);
(_p0_3021 -= _C_3025);
(_p1_3022 -= _C_3025);
(_p2_3023 -= _C_3025);
float _m_3026 = sqrt(max(max(dot(_p0_3021, _p0_3021), dot(_p1_3022, _p1_3022)), dot(_p2_3023, _p2_3023)));
float2 _dp_3027 = (((vec2_ctor((-2.0 * _w_3024)) * _p1_3022) + _p0_3021) + _p2_3023);
float _dw_3028 = abs(((-2.0 * _w_3024) + 2.0));
float _rp_minus_1_3029 = max(0.0, ((_m_3026 * __precision__3020) + -1.0));
float _numer_3030 = ((length(_dp_3027) * __precision__3020) + (_rp_minus_1_3029 * _dw_3028));
float _denom_3031 = (4.0 * min(_w_3024, 1.0));
return (_numer_3030 / _denom_3031);
}
struct VS_INPUT
{
    float2 _resolveLevel_and_idx : TEXCOORD0;
    float4 _p01 : TEXCOORD1;
    float4 _p23 : TEXCOORD2;
    float2 _fanPointAttrib : TEXCOORD3;
};

void initAttributes(VS_INPUT input)
{
    _resolveLevel_and_idx = input._resolveLevel_and_idx;
    _p01 = input._p01;
    _p23 = input._p23;
    _fanPointAttrib = input._fanPointAttrib;
}


VS_OUTPUT generateOutput(VS_INPUT input)
{
    VS_OUTPUT output;
    output.gl_Position = gl_Position;
    output.dx_Position.x = gl_Position.x;
    output.dx_Position.y = clipControlOrigin * gl_Position.y;
    if (clipControlZeroToOne)
    {
        output.dx_Position.z = gl_Position.z;
    } else {
        output.dx_Position.z = (gl_Position.z + gl_Position.w) * 0.5;
    }
    output.dx_Position.w = gl_Position.w;

    return output;
}

VS_OUTPUT main(VS_INPUT input){
    initAttributes(input);

float2x2 _AFFINE_MATRIX_3033 = mat2_ctor(_uaffineMatrix_S0.xy, _uaffineMatrix_S0.zw);
float2 _TRANSLATE_3034 = _utranslate_S0;
float _resolveLevel_3035 = _resolveLevel_and_idx.x;
float _idxInResolveLevel_3036 = _resolveLevel_and_idx.y;
float2 _localcoord_3037 = {0, 0};
if ((_resolveLevel_3035 < 0.0))
{
(_localcoord_3037 = _fanPointAttrib);
}
else
{
if (isinf(_p23.z))
{
float2 sbf2 = {0, 0};
if ((_resolveLevel_3035 != 0.0))
{
(sbf2 = _p01.zw);
}
else
{
float2 sbf3 = {0, 0};
if ((_idxInResolveLevel_3036 != 0.0))
{
(sbf3 = _p23.xy);
}
else
{
(sbf3 = _p01.xy);
}
(sbf2 = sbf3);
}
(_localcoord_3037 = sbf2);
}
else
{
float2 _p0_3038 = _p01.xy;
float2 _p1_3039 = _p01.zw;
float2 _p2_3040 = _p23.xy;
float2 _p3_3041 = _p23.zw;
float _w_3042 = {-1.0};
float _maxResolveLevel_3043 = {0};
if (isinf(_p23.w))
{
(_w_3042 = _p3_3041.x);
float __0_n2_3044 = f_wangs_formula_conic_p2_fff2f2f2f(4.0, mul(transpose(_AFFINE_MATRIX_3033), _p0_3038), mul(transpose(_AFFINE_MATRIX_3033), _p1_3039), mul(transpose(_AFFINE_MATRIX_3033), _p2_3040), _w_3042);
(_maxResolveLevel_3043 = ceil((log2(max(__0_n2_3044, 1.0)) * 0.5)));
(_p1_3039 *= _w_3042);
(_p3_3041 = _p2_3040);
}
else
{
float __1_m_3045 = f_wangs_formula_max_fdiff_p2_ff2f2f2f2f22_float2x2(_p0_3038, _p1_3039, _p2_3040, _p3_3041, _AFFINE_MATRIX_3033);
(_maxResolveLevel_3043 = ceil((log2(max((9.0 * __1_m_3045), 1.0)) * 0.25)));
}
if ((_resolveLevel_3035 > _maxResolveLevel_3043))
{
(_idxInResolveLevel_3036 = floor((_idxInResolveLevel_3036 * exp2((_maxResolveLevel_3043 - _resolveLevel_3035)))));
(_resolveLevel_3035 = _maxResolveLevel_3043);
}
float _fixedVertexID_3046 = floor((0.5 + (_idxInResolveLevel_3036 * exp2((5.0 - _resolveLevel_3035)))));
bool sbf4 = (0.0 < _fixedVertexID_3046);
if (sbf4)
{
(sbf4 = (_fixedVertexID_3046 < 32.0));
}
if (sbf4)
{
float _T_3047 = (_fixedVertexID_3046 * 0.03125);
float2 _ab_3048 = lerp(_p0_3038, _p1_3039, _T_3047);
float2 _bc_3049 = lerp(_p1_3039, _p2_3040, _T_3047);
float2 _cd_3050 = lerp(_p2_3040, _p3_3041, _T_3047);
float2 _abc_3051 = lerp(_ab_3048, _bc_3049, _T_3047);
float2 _bcd_3052 = lerp(_bc_3049, _cd_3050, _T_3047);
float2 _abcd_3053 = lerp(_abc_3051, _bcd_3052, _T_3047);
float _u_3054 = lerp(1.0, _w_3042, _T_3047);
float _v_3055 = ((_w_3042 + 1.0) - _u_3054);
float _uv_3056 = lerp(_u_3054, _v_3055, _T_3047);
float2 sbf5 = {0, 0};
if ((_w_3042 < 0.0))
{
(sbf5 = _abcd_3053);
}
else
{
(sbf5 = (_abc_3051 / _uv_3056));
}
(_localcoord_3037 = sbf5);
}
else
{
float2 sbf6 = {0, 0};
if ((_fixedVertexID_3046 == 0.0))
{
(sbf6 = _p0_3038);
}
else
{
(sbf6 = _p3_3041);
}
(_localcoord_3037 = sbf6);
}
}
}
float2 _vertexpos_3057 = (mul(transpose(_AFFINE_MATRIX_3033), _localcoord_3037) + _TRANSLATE_3034);
(gl_Position = vec4_ctor(_vertexpos_3057, 0.0, 1.0));
(gl_Position = vec4_ctor(((gl_Position.xy * _sk_RTAdjust.xz) + (gl_Position.ww * _sk_RTAdjust.yw)), 0.0, gl_Position.w));
return generateOutput(input);
}
