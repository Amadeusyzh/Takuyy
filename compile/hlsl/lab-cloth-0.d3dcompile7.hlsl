struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    noperspective float4 v0 : TEXCOORD0;
    noperspective float2 v1 : TEXCOORD1;
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
// Uniforms

uniform float4 _sk_RTAdjust : register(c0);
uniform float2 _uatlas_adjust_S0 : register(c1);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes
static float4 _fillBounds = {0, 0, 0, 0};
static float4 _color = {0, 0, 0, 0};
static float4 _locations = {0, 0, 0, 0};

static float4 gl_Position = float4(0, 0, 0, 0);
static int gl_VertexID;

// Varyings
static noperspective float2 _vatlasCoord_S0 = {0, 0};
static noperspective float4 _vcolor_S0 = {0, 0, 0, 0};

cbuffer DriverConstants : register(b1)
{
    float2 dx_ViewScale  : packoffset(c1);
    float clipControlOrigin : packoffset(c1.z);
    float clipControlZeroToOne : packoffset(c1.w);
    uint dx_VertexID : packoffset(c2.x);
};

#define GL_USES_VERTEX_ID
struct VS_INPUT
{
    float4 _fillBounds : TEXCOORD0;
    float4 _color : TEXCOORD1;
    float4 _locations : TEXCOORD2;
 uint gl_VertexID : SV_VertexID;
};

void initAttributes(VS_INPUT input)
{
    _fillBounds = input._fillBounds;
    _color = input._color;
    _locations = input._locations;
    gl_VertexID = input.gl_VertexID + dx_VertexID;
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
    output.v1 = _vatlasCoord_S0;

    return output;
}

VS_OUTPUT main(VS_INPUT input){
    initAttributes(input);

float2 _unitCoord_3009 = vec2_ctor(float_ctor_int((gl_VertexID & 1)), float_ctor_int((gl_VertexID >> 1)));
float2 _devCoord_3010 = lerp(_fillBounds.xy, _fillBounds.zw, _unitCoord_3009);
float2 _atlasTopLeft_3011 = vec2_ctor((abs(_locations.x) - 1.0), _locations.y);
float2 _devTopLeft_3012 = _locations.zw;
bool _transposed_3013 = (_locations.x < 0.0);
float2 _atlasCoord_3014 = (_devCoord_3010 - _devTopLeft_3012);
if (_transposed_3013)
{
(_atlasCoord_3014 = _atlasCoord_3014.yx);
}
(_atlasCoord_3014 += _atlasTopLeft_3011);
(_vatlasCoord_S0 = (_atlasCoord_3014 * _uatlas_adjust_S0));
(_vcolor_S0 = _color);
(gl_Position = vec4_ctor(_devCoord_3010, 0.0, 1.0));
(gl_Position = vec4_ctor(((gl_Position.xy * _sk_RTAdjust.xz) + (gl_Position.ww * _sk_RTAdjust.yw)), 0.0, gl_Position.w));
return generateOutput(input);
}
