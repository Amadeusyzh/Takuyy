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
float2 vec2_ctor_int2(int2 x0)
{
    return float2(x0);
}
float4 vec4_ctor(float2 x0, float x1, float x2)
{
    return float4(x0, x1, x2);
}
int int_ctor(float x0)
{
    return int(x0);
}
int2 ivec2_ctor(float2 x0)
{
    return int2(x0);
}
// Uniforms

uniform float2 _uGrid : register(c0);
uniform float _uDx : register(c1);
uniform float _uDt : register(c2);
uniform float _uGravity : register(c3);
uniform float _uVmax : register(c4);
uniform float4 _uPtr : register(c5);
uniform float4 _uPtrV : register(c6);
uniform float4 _uCol[4] : register(c7);
uniform float4 _uColR : register(c11);
uniform int _uNumCol : register(c12);
static const uint _uAcc = 0;
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

static float4 out_o = {0, 0, 0, 0};
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

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
float dyn_index_vec4_float4_int(in float4 base, in int index)
{
switch (index) {
case (0):
return base[0];
case (1):
return base[1];
case (2):
return base[2];
case (3):
return base[3];
default:
break;
}
if ((index < 0))
{
return base[0];
}
{
return base[3];
}
}
float f_capsule_float4(in float2 _p_3014, in float4 _s_3015, in float _r_3016, inout float2 _n_3017)
{
float2 _ab_3018 = (_s_3015.zw - _s_3015.xy);
float _h_3019 = clamp((dot((_p_3014 - _s_3015.xy), _ab_3018) / max(dot(_ab_3018, _ab_3018), 9.99999996e-13)), 0.0, 1.0);
float2 _q_3020 = (_p_3014 - (_s_3015.xy + (_h_3019 * _ab_3018)));
float _l_3021 = length(_q_3020);
float2 sbdf = {0, 0};
if ((_l_3021 > 9.99999972e-10))
{
(sbdf = (_q_3020 / _l_3021));
}
else
{
(sbdf = float2(0.0, 1.0));
}
(_n_3017 = sbdf);
return (_l_3021 - _r_3016);
}
struct PS_OUTPUT
{
    float4 out_o : SV_TARGET0;
    float4 out_o : SV_TARGET1;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_o = out_o;
    output.out_o = out_o;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;

int2 _ij_3023 = ivec2_ctor(gl_FragCoord.xy);
float4 _a_3024 = gl_texture2DFetch(_uAcc, _ij_3023, 0);
float _m_3025 = _a_3024.z;
float2 _v_3026 = {0.0, 0.0};
if ((_m_3025 > 1.00000001e-07))
{
(_v_3026 = (_a_3024.xy / _m_3025));
(_v_3026.y -= (_uDt * _uGravity));
float2 _p_3027 = (vec2_ctor_int2(_ij_3023) * _uDx);
if ((_uPtr.w > 0.5))
{
float2 _dp_3028 = (_p_3027 - _uPtr.xy);
float _dist_3029 = length(_dp_3028);
if ((_dist_3029 < _uPtr.z))
{
float _k_3030 = (1.0 - (_dist_3029 / _uPtr.z));
(_k_3030 *= _k_3030);
float2 sbe0 = {0, 0};
if ((_dist_3029 > 9.99999997e-07))
{
(sbe0 = (_dp_3028 / _dist_3029));
}
else
{
(sbe0 = float2(0.0, 1.0));
}
float2 _dir_3031 = sbe0;
if ((_uPtr.w < 1.5))
{
(_v_3026 += ((_uPtrV.xy - _v_3026) * min(1.0, ((_uDt * 60.0) * _k_3030))));
(_v_3026 += (_dir_3031 * (((_uDt * 140.0) * _k_3030) + (_uPtrV.z * _k_3030))));
}
else
{
(_v_3026 += (((-_dir_3031) * ((_uDt * 320.0) * _k_3030)) * min(1.0, (_dist_3029 / (0.25 * _uPtr.z)))));
(_v_3026 += ((_uPtrV.xy - _v_3026) * min(1.0, ((_uDt * 30.0) * _k_3030))));
}
}
}
{ for(int _c_3032 = {0}; (_c_3032 < 4); (_c_3032++))
{
if ((_c_3032 >= _uNumCol))
{
break;
}
float2 _n_3033 = {0, 0};
float _sd_3034 = f_capsule_float4(_p_3027, _uCol[int_ctor(clamp(float_ctor_int(_c_3032), 0.0, 3.0))], dyn_index_vec4_float4_int(_uColR, int_ctor(clamp(float_ctor_int(_c_3032), 0.0, 3.0))), _n_3033);
if ((_sd_3034 < (0.5 * _uDx)))
{
float _vn_3035 = dot(_v_3026, _n_3033);
if ((_vn_3035 < 0.0))
{
float2 _vt_3036 = (_v_3026 - (_vn_3035 * _n_3033));
float _lt_3037 = length(_vt_3036);
float2 sbe1 = {0, 0};
if ((_lt_3037 > 9.99999972e-10))
{
(sbe1 = (_vt_3036 * max(0.0, (1.0 - ((0.300000012 * (-_vn_3035)) / _lt_3037)))));
}
else
{
(sbe1 = float2(0.0, 0.0));
}
(_v_3026 = sbe1);
}
}
}
}
bool sbe2 = (_ij_3023.x < 3);
if (sbe2)
{
(sbe2 = (_v_3026.x < 0.0));
}
if (sbe2)
{
(_v_3026.x = 0.0);
}
bool sbe3 = (_ij_3023.x > (int_ctor(_uGrid.x) - 4));
if (sbe3)
{
(sbe3 = (_v_3026.x > 0.0));
}
if (sbe3)
{
(_v_3026.x = 0.0);
}
bool sbe4 = (_ij_3023.y < 3);
if (sbe4)
{
(sbe4 = (_v_3026.y < 0.0));
}
if (sbe4)
{
(_v_3026.y = 0.0);
}
bool sbe5 = (_ij_3023.y > (int_ctor(_uGrid.y) - 4));
if (sbe5)
{
(sbe5 = (_v_3026.y > 0.0));
}
if (sbe5)
{
(_v_3026.y = 0.0);
}
float _s_3038 = length(_v_3026);
if ((_s_3038 > _uVmax))
{
(_v_3026 *= (_uVmax / _s_3038));
}
}
(out_o = vec4_ctor(_v_3026, _m_3025, 0.0));
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
float2 vec2_ctor_int2(int2 x0)
{
    return float2(x0);
}
float4 vec4_ctor(float2 x0, float x1, float x2)
{
    return float4(x0, x1, x2);
}
int int_ctor(float x0)
{
    return int(x0);
}
int2 ivec2_ctor(float2 x0)
{
    return int2(x0);
}
// Uniforms

uniform float2 _uGrid : register(c0);
uniform float _uDx : register(c1);
uniform float _uDt : register(c2);
uniform float _uGravity : register(c3);
uniform float _uVmax : register(c4);
uniform float4 _uPtr : register(c5);
uniform float4 _uPtrV : register(c6);
uniform float4 _uCol[4] : register(c7);
uniform float4 _uColR : register(c11);
uniform int _uNumCol : register(c12);
static const uint _uAcc = 0;
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

static float4 out_o = {0, 0, 0, 0};
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

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
float dyn_index_vec4_float4_int(in float4 base, in int index)
{
switch (index) {
case (0):
return base[0];
case (1):
return base[1];
case (2):
return base[2];
case (3):
return base[3];
default:
break;
}
if ((index < 0))
{
return base[0];
}
{
return base[3];
}
}
float f_capsule_float4(in float2 _p_3014, in float4 _s_3015, in float _r_3016, inout float2 _n_3017)
{
float2 _ab_3018 = (_s_3015.zw - _s_3015.xy);
float _h_3019 = clamp((dot((_p_3014 - _s_3015.xy), _ab_3018) / max(dot(_ab_3018, _ab_3018), 9.99999996e-13)), 0.0, 1.0);
float2 _q_3020 = (_p_3014 - (_s_3015.xy + (_h_3019 * _ab_3018)));
float _l_3021 = length(_q_3020);
float2 sbdf = {0, 0};
if ((_l_3021 > 9.99999972e-10))
{
(sbdf = (_q_3020 / _l_3021));
}
else
{
(sbdf = float2(0.0, 1.0));
}
(_n_3017 = sbdf);
return (_l_3021 - _r_3016);
}
struct PS_OUTPUT
{
    float4 out_o : SV_TARGET0;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_o = out_o;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;

int2 _ij_3023 = ivec2_ctor(gl_FragCoord.xy);
float4 _a_3024 = gl_texture2DFetch(_uAcc, _ij_3023, 0);
float _m_3025 = _a_3024.z;
float2 _v_3026 = {0.0, 0.0};
if ((_m_3025 > 1.00000001e-07))
{
(_v_3026 = (_a_3024.xy / _m_3025));
(_v_3026.y -= (_uDt * _uGravity));
float2 _p_3027 = (vec2_ctor_int2(_ij_3023) * _uDx);
if ((_uPtr.w > 0.5))
{
float2 _dp_3028 = (_p_3027 - _uPtr.xy);
float _dist_3029 = length(_dp_3028);
if ((_dist_3029 < _uPtr.z))
{
float _k_3030 = (1.0 - (_dist_3029 / _uPtr.z));
(_k_3030 *= _k_3030);
float2 sbe0 = {0, 0};
if ((_dist_3029 > 9.99999997e-07))
{
(sbe0 = (_dp_3028 / _dist_3029));
}
else
{
(sbe0 = float2(0.0, 1.0));
}
float2 _dir_3031 = sbe0;
if ((_uPtr.w < 1.5))
{
(_v_3026 += ((_uPtrV.xy - _v_3026) * min(1.0, ((_uDt * 60.0) * _k_3030))));
(_v_3026 += (_dir_3031 * (((_uDt * 140.0) * _k_3030) + (_uPtrV.z * _k_3030))));
}
else
{
(_v_3026 += (((-_dir_3031) * ((_uDt * 320.0) * _k_3030)) * min(1.0, (_dist_3029 / (0.25 * _uPtr.z)))));
(_v_3026 += ((_uPtrV.xy - _v_3026) * min(1.0, ((_uDt * 30.0) * _k_3030))));
}
}
}
{ for(int _c_3032 = {0}; (_c_3032 < 4); (_c_3032++))
{
if ((_c_3032 >= _uNumCol))
{
break;
}
float2 _n_3033 = {0, 0};
float _sd_3034 = f_capsule_float4(_p_3027, _uCol[int_ctor(clamp(float_ctor_int(_c_3032), 0.0, 3.0))], dyn_index_vec4_float4_int(_uColR, int_ctor(clamp(float_ctor_int(_c_3032), 0.0, 3.0))), _n_3033);
if ((_sd_3034 < (0.5 * _uDx)))
{
float _vn_3035 = dot(_v_3026, _n_3033);
if ((_vn_3035 < 0.0))
{
float2 _vt_3036 = (_v_3026 - (_vn_3035 * _n_3033));
float _lt_3037 = length(_vt_3036);
float2 sbe1 = {0, 0};
if ((_lt_3037 > 9.99999972e-10))
{
(sbe1 = (_vt_3036 * max(0.0, (1.0 - ((0.300000012 * (-_vn_3035)) / _lt_3037)))));
}
else
{
(sbe1 = float2(0.0, 0.0));
}
(_v_3026 = sbe1);
}
}
}
}
bool sbe2 = (_ij_3023.x < 3);
if (sbe2)
{
(sbe2 = (_v_3026.x < 0.0));
}
if (sbe2)
{
(_v_3026.x = 0.0);
}
bool sbe3 = (_ij_3023.x > (int_ctor(_uGrid.x) - 4));
if (sbe3)
{
(sbe3 = (_v_3026.x > 0.0));
}
if (sbe3)
{
(_v_3026.x = 0.0);
}
bool sbe4 = (_ij_3023.y < 3);
if (sbe4)
{
(sbe4 = (_v_3026.y < 0.0));
}
if (sbe4)
{
(_v_3026.y = 0.0);
}
bool sbe5 = (_ij_3023.y > (int_ctor(_uGrid.y) - 4));
if (sbe5)
{
(sbe5 = (_v_3026.y > 0.0));
}
if (sbe5)
{
(_v_3026.y = 0.0);
}
float _s_3038 = length(_v_3026);
if ((_s_3038 > _uVmax))
{
(_v_3026 *= (_uVmax / _s_3038));
}
}
(out_o = vec4_ctor(_v_3026, _m_3025, 0.0));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
