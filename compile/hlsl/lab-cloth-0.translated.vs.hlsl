// INITIAL HLSL BEGIN

#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
// Uniforms

uniform float4x4 _uVP : register(c0);
uniform float _uShadow : register(c4);
uniform float3 _uLight : register(c5);
uniform float _uGround : register(c6);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes
static float3 _aPos = {0, 0, 0};
static float3 _aNrm = {0, 0, 0};
static float2 _aUv = {0, 0};

static float4 gl_Position = float4(0, 0, 0, 0);

// Varyings
static  float3 _vPos = {0, 0, 0};
static  float3 _vNrm = {0, 0, 0};
static  float2 _vUv = {0, 0};

cbuffer DriverConstants : register(b1)
{
    float2 dx_ViewScale  : packoffset(c1);
    float clipControlOrigin : packoffset(c1.z);
    float clipControlZeroToOne : packoffset(c1.w);
};

@@ VERTEX ATTRIBUTES @@

@@ VERTEX OUTPUT @@

VS_OUTPUT main(VS_INPUT input){
@@ MAIN PROLOGUE @@
(gl_Position = float4(0.0, 0.0, 0.0, 0.0));
float3 _p_3012 = _aPos;
if ((_uShadow > 0.5))
{
(_p_3012.xz -= ((_uLight.xz * (_p_3012.y - _uGround)) / _uLight.y));
(_p_3012.y = (_uGround + 0.00300000003));
}
(_vPos = _p_3012);
(_vNrm = _aNrm);
(_vUv = _aUv);
(gl_Position = mul(transpose(_uVP), vec4_ctor(_p_3012, 1.0)));
return generateOutput(input);
}

// INITIAL HLSL END


// COMPILER INPUT HLSL BEGIN

struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD3;
    float3 v0 : TEXCOORD0;
    float3 v1 : TEXCOORD1;
    float2 v2 : TEXCOORD2;
};
#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
// Uniforms

uniform float4x4 _uVP : register(c0);
uniform float _uShadow : register(c4);
uniform float3 _uLight : register(c5);
uniform float _uGround : register(c6);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes
static float3 _aPos = {0, 0, 0};
static float3 _aNrm = {0, 0, 0};
static float2 _aUv = {0, 0};

static float4 gl_Position = float4(0, 0, 0, 0);

// Varyings
static  float3 _vPos = {0, 0, 0};
static  float3 _vNrm = {0, 0, 0};
static  float2 _vUv = {0, 0};

cbuffer DriverConstants : register(b1)
{
    float2 dx_ViewScale  : packoffset(c1);
    float clipControlOrigin : packoffset(c1.z);
    float clipControlZeroToOne : packoffset(c1.w);
};

struct VS_INPUT
{
    float3 _aPos : TEXCOORD0;
    float3 _aNrm : TEXCOORD1;
    float2 _aUv : TEXCOORD2;
};

void initAttributes(VS_INPUT input)
{
    _aPos = input._aPos;
    _aNrm = input._aNrm;
    _aUv = input._aUv;
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
    output.v0 = _vPos;
    output.v1 = _vNrm;
    output.v2 = _vUv;

    return output;
}

VS_OUTPUT main(VS_INPUT input){
    initAttributes(input);

(gl_Position = float4(0.0, 0.0, 0.0, 0.0));
float3 _p_3012 = _aPos;
if ((_uShadow > 0.5))
{
(_p_3012.xz -= ((_uLight.xz * (_p_3012.y - _uGround)) / _uLight.y));
(_p_3012.y = (_uGround + 0.00300000003));
}
(_vPos = _p_3012);
(_vNrm = _aNrm);
(_vUv = _aUv);
(gl_Position = mul(transpose(_uVP), vec4_ctor(_p_3012, 1.0)));
return generateOutput(input);
}

// COMPILER INPUT HLSL END

// VERTEX SHADER END
