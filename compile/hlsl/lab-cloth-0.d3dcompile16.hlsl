struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
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
static float2 _position = {0, 0};
static float4 _color = {0, 0, 0, 0};

static float4 gl_Position = float4(0, 0, 0, 0);

// Varyings
static noperspective float4 _vcolor_S0 = {0, 0, 0, 0};

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
};

void initAttributes(VS_INPUT input)
{
    _position = input._position;
    _color = input._color;
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

(_vcolor_S0 = _color);
(gl_Position = vec4_ctor(_position, 0.0, 1.0));
(gl_Position = vec4_ctor(((gl_Position.xy * _sk_RTAdjust.xz) + (gl_Position.ww * _sk_RTAdjust.yw)), 0.0, gl_Position.w));
return generateOutput(input);
}
