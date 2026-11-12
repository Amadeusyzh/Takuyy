struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD3;
    float4 gl_FragCoord : TEXCOORD4;
    nointerpolation float4 v0 : TEXCOORD0;
    nointerpolation float4 v1 : TEXCOORD1;
    nointerpolation float v2 : TEXCOORD2;
};
#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float2 x0, float x1, float x2)
{
    return float4(x0, x1, x2);
}
float4 vec4_ctor(float2 x0, float2 x1)
{
    return float4(x0, x1);
}
// Uniforms

uniform float2 _uRes : register(c0);
uniform float _uMinR : register(c1);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes
static float2 _aCorner = {0, 0};
static float4 _aSeg = {0, 0, 0, 0};
static float _aRad = {0};
static float4 _aCol = {0, 0, 0, 0};

static float4 gl_Position = float4(0, 0, 0, 0);

// Varyings
static nointerpolation float4 _vSeg = {0, 0, 0, 0};
static nointerpolation float _vR = {0};
static nointerpolation float4 _vCol = {0, 0, 0, 0};

cbuffer DriverConstants : register(b1)
{
    float2 dx_ViewScale  : packoffset(c1);
    float clipControlOrigin : packoffset(c1.z);
    float clipControlZeroToOne : packoffset(c1.w);
};

struct VS_INPUT
{
    float2 _aCorner : TEXCOORD0;
    float4 _aSeg : TEXCOORD1;
    float _aRad : TEXCOORD2;
    float4 _aCol : TEXCOORD3;
};

void initAttributes(VS_INPUT input)
{
    _aCorner = input._aCorner;
    _aSeg = input._aSeg;
    _aRad = input._aRad;
    _aCol = input._aCol;
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
    output.gl_FragCoord = gl_Position;
    output.v0 = _vSeg;
    output.v1 = _vCol;
    output.v2 = _vR;

    return output;
}

VS_OUTPUT main(VS_INPUT input){
    initAttributes(input);

(gl_Position = float4(0.0, 0.0, 0.0, 0.0));
float2 _p0_3011 = (_aSeg.xy * _uRes);
float2 _p1_3012 = (_aSeg.zw * _uRes);
float _r_3013 = max((_aRad * _uRes.y), _uMinR);
float2 _lo_3014 = ((min(_p0_3011, _p1_3012) - _r_3013) - 2.0);
float2 _hi_3015 = ((max(_p0_3011, _p1_3012) + _r_3013) + 2.0);
float2 _p_3016 = lerp(_lo_3014, _hi_3015, _aCorner);
(_vSeg = vec4_ctor(_p0_3011, _p1_3012));
(_vR = _r_3013);
(_vCol = _aCol);
(gl_Position = vec4_ctor((((_p_3016 / _uRes) * 2.0) - 1.0), 0.0, 1.0));
return generateOutput(input);
}
