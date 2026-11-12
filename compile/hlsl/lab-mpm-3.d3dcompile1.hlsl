struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    noperspective float4 v0 : TEXCOORD0;
    noperspective float2 v1 : TEXCOORD1;
};
#pragma warning( disable: 3081 3556 3557 3571 )
float3 vec3_ctor(float2 x0, float x1)
{
    return float3(x0, x1);
}
float3x2 mat3x2_ctor(float3x3 x0)
{
    return float3x2(x0[0][0], x0[0][1], x0[1][0], x0[1][1], x0[2][0], x0[2][1]);
}
float4 vec4_ctor(float2 x0, float x1, float x2)
{
    return float4(x0, x1, x2);
}
// Uniforms

uniform float4 _sk_RTAdjust : register(c0);
uniform float3x3 _umatrix_S1_c0 : register(c1);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes
static float2 _position = {0, 0};
static float4 _color = {0, 0, 0, 0};
static float2 _localCoord = {0, 0};

static float4 gl_Position = float4(0, 0, 0, 0);

// Varyings
static noperspective float4 _vcolor_S0 = {0, 0, 0, 0};
static noperspective float2 _vTransformedCoords_3_S0 = {0, 0};

cbuffer DriverConstants : register(b1)
{
    float2 dx_ViewScale  : packoffset(c1);
    float clipControlOrigin : packoffset(c1.z);
    float clipControlZeroToOne : packoffset(c1.w);
};

struct VS_INPUT
{
    float2 _position : TEXCOORD0;
    float4 _color : TEXCOORD1;
    float2 _localCoord : TEXCOORD2;
};

void initAttributes(VS_INPUT input)
{
    _position = input._position;
    _color = input._color;
    _localCoord = input._localCoord;
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
    output.v0 = _vcolor_S0;
    output.v1 = _vTransformedCoords_3_S0;

    return output;
}

VS_OUTPUT main(VS_INPUT input){
    initAttributes(input);

(_vcolor_S0 = _color);
(gl_Position = vec4_ctor(_position, 0.0, 1.0));
{
(_vTransformedCoords_3_S0 = mul(transpose(mat3x2_ctor(_umatrix_S1_c0)), vec3_ctor(_localCoord, 1.0)));
}
(gl_Position = vec4_ctor(((gl_Position.xy * _sk_RTAdjust.xz) + (gl_Position.ww * _sk_RTAdjust.yw)), 0.0, gl_Position.w));
return generateOutput(input);
}
