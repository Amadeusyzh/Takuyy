struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD1;
    float4 v0 : TEXCOORD0;
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
float4 vec4_ctor(float2 x0, float x1, float x2)
{
    return float4(x0, x1, x2);
}
float4 vec4_ctor(float3 x0, float x1)
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
// Uniforms

uniform float2 _uS : register(c0);
static const uint _uDist = 0;
uniform Texture2D<float4> textures2D[1] : register(t0);
uniform SamplerState samplers2D[1] : register(s0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes
static float2 _aProbe = {0, 0};
static float4 _aRay = {0, 0, 0, 0};
static float _aLevel = {0};

static float4 gl_Position = float4(0, 0, 0, 0);

// Varyings
static  float4 _vCol = {0, 0, 0, 0};

cbuffer DriverConstants : register(b1)
{
    float2 dx_ViewScale  : packoffset(c1);
    float clipControlOrigin : packoffset(c1.z);
    float clipControlZeroToOne : packoffset(c1.w);
    struct SamplerMetadata
    {
        int baseLevel;
        int wrapModes;
        int2 padding;
        int4 intBorderColor;
    };
    SamplerMetadata samplerMetadata[1] : packoffset(c3);
};

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

float3 f_levelCol(in float _l_3011)
{
float3 _c_3012[7] = {1.0, 0.300000012, 0.300000012, 1.0, 0.620000005, 0.200000003, 0.980000019, 0.920000017, 0.300000012, 0.400000006, 0.949999988, 0.449999988, 0.300000012, 0.850000024, 1.0, 0.5, 0.550000012, 1.0, 0.949999988, 0.449999988, 1.0};
return _c_3012[int_ctor(clamp(float_ctor_int(int_ctor(_l_3011)), 0.0, 6.0))];
}
struct VS_INPUT
{
    float2 _aProbe : TEXCOORD0;
    float4 _aRay : TEXCOORD1;
    float _aLevel : TEXCOORD2;
};

void initAttributes(VS_INPUT input)
{
    _aProbe = input._aProbe;
    _aRay = input._aRay;
    _aLevel = input._aLevel;
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
    output.v0 = _vCol;

    return output;
}

VS_OUTPUT main(VS_INPUT input){
    initAttributes(input);

(gl_Position = float4(0.0, 0.0, 0.0, 0.0));
float2 _dir_3014 = vec2_ctor(cos(_aRay.x), sin(_aRay.x));
float sbcf = {0};
if ((_aRay.w > 1.5))
{
(sbcf = _aRay.z);
}
else
{
(sbcf = _aRay.y);
}
float2 _p_3015 = (_aProbe + (_dir_3014 * sbcf));
float _a_3016 = {0.800000012};
bool sbd0 = (_aRay.w > 0.5);
if (sbd0)
{
(sbd0 = (_aRay.w < 1.5));
}
if (sbd0)
{
float2 _from_3017 = (_aProbe + (_dir_3014 * _aRay.y));
float _len_3018 = (_aRay.z - _aRay.y);
float _t_3019 = {0.0};
{ for(int _k_3020 = {0}; (_k_3020 < 96); (_k_3020++))
{
float2 _q_3021 = (_from_3017 + (_dir_3014 * _t_3019));
bool sbd3 = (_q_3021.x < 0.0);
if ((!sbd3))
{
(sbd3 = (_q_3021.y < 0.0));
}
bool sbd2 = sbd3;
if ((!sbd2))
{
(sbd2 = (_q_3021.x >= _uS.x));
}
bool sbd1 = sbd2;
if ((!sbd1))
{
(sbd1 = (_q_3021.y >= _uS.y));
}
if (sbd1)
{
break;
}
float _sd_3022 = gl_texture2DFetch(_uDist, ivec2_ctor(_q_3021), 0).x;
if ((_sd_3022 < 0.5))
{
break;
}
(_t_3019 += max((_sd_3022 - 1.0), 0.800000012));
if ((_t_3019 >= _len_3018))
{
(_t_3019 = _len_3018);
break;
}
}
}
(_p_3015 = (_from_3017 + (_dir_3014 * min(_t_3019, _len_3018))));
(_a_3016 = 0.349999994);
}
(_vCol = vec4_ctor(f_levelCol(_aLevel), _a_3016));
(gl_Position = vec4_ctor((((_p_3015 / _uS) * 2.0) - 1.0), 0.0, 1.0));
return generateOutput(input);
}
