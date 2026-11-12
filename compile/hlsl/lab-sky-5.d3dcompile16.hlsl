struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    noperspective float4 v0 : TEXCOORD0;
    noperspective float4 v1 : TEXCOORD1;
};
#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float2 x0, float x1, float x2)
{
    return float4(x0, x1, x2);
}
// Uniforms

uniform float4 _sk_RTAdjust : register(c0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes
static float2 _inPosition = {0, 0};
static float4 _inColor = {0, 0, 0, 0};
static float4 _inQuadEdge = {0, 0, 0, 0};

static float4 gl_Position = float4(0, 0, 0, 0);

// Varyings
static noperspective float4 _vQuadEdge_S0 = {0, 0, 0, 0};
static noperspective float4 _vinColor_S0 = {0, 0, 0, 0};

cbuffer DriverConstants : register(b1)
{
    float2 dx_ViewScale  : packoffset(c1);
    float clipControlOrigin : packoffset(c1.z);
    float clipControlZeroToOne : packoffset(c1.w);
};

struct VS_INPUT
{
    float2 _inPosition : TEXCOORD0;
    float4 _inColor : TEXCOORD1;
    float4 _inQuadEdge : TEXCOORD2;
};

void initAttributes(VS_INPUT input)
{
    _inPosition = input._inPosition;
    _inColor = input._inColor;
    _inQuadEdge = input._inQuadEdge;
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
    output.v0 = _vQuadEdge_S0;
    output.v1 = _vinColor_S0;

    return output;
}

VS_OUTPUT main(VS_INPUT input){
    initAttributes(input);

(_vQuadEdge_S0 = _inQuadEdge);
(_vinColor_S0 = _inColor);
float2 __tmp_0_inPosition_3008 = _inPosition;
(gl_Position = vec4_ctor(__tmp_0_inPosition_3008, 0.0, 1.0));
(gl_Position = vec4_ctor(((gl_Position.xy * _sk_RTAdjust.xz) + (gl_Position.ww * _sk_RTAdjust.yw)), 0.0, gl_Position.w));
return generateOutput(input);
}
