struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD3;
    float4 gl_FragCoord : TEXCOORD4;
    float gl_PointSize : PSIZE;
    nointerpolation float4 v0 : TEXCOORD0;
    nointerpolation float4 v1 : TEXCOORD1;
    nointerpolation float2 v2 : TEXCOORD2;
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
int2 ivec2_ctor_int_int(int x0, int x1)
{
    return int2(x0, x1);
}
// Uniforms

uniform float2 _uGrid : register(c0);
uniform float _uInvDx : register(c1);
static const uint _uT0 = 0;
static const uint _uT1 = 1;
static const uint _uT3 = 2;
uniform Texture2D<float4> textures2D[3] : register(t0);
uniform SamplerState samplers2D[3] : register(s0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes

static float4 gl_Position = float4(0, 0, 0, 0);
static float gl_PointSize = float(1);
static int gl_VertexID;

// Varyings
static nointerpolation float4 _vVF = {0, 0, 0, 0};
static nointerpolation float4 _vAff = {0, 0, 0, 0};
static nointerpolation float2 _vBase = {0, 0};

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
    SamplerMetadata samplerMetadata[3] : packoffset(c3);
    uint dx_VertexID : packoffset(c2.x);
};

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_POINT_SIZE
#define GL_USES_VERTEX_ID
struct VS_INPUT
{
 uint gl_VertexID : SV_VertexID;
};

void initAttributes(VS_INPUT input)
{
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
    output.gl_PointSize = gl_PointSize;
    output.gl_FragCoord = gl_Position;
    output.v0 = _vVF;
    output.v1 = _vAff;
    output.v2 = _vBase;

    return output;
}

VS_OUTPUT main(VS_INPUT input){
    initAttributes(input);

(gl_Position = float4(0.0, 0.0, 0.0, 0.0));
int2 _tc_3010 = ivec2_ctor_int_int((gl_VertexID % 256), (gl_VertexID / 256));
if ((gl_texture2DFetch(_uT3, _tc_3010, 0).x < 0.0))
{
(gl_Position = float4(-2.0, -2.0, 0.0, 1.0));
(gl_PointSize = 1.0);
return generateOutput(input);
}
float4 _a_3011 = gl_texture2DFetch(_uT0, _tc_3010, 0);
float2 _xg_3012 = (_a_3011.xy * _uInvDx);
float2 _base_3013 = floor((_xg_3012 - 0.5));
(_vVF = vec4_ctor(_a_3011.zw, (_xg_3012 - _base_3013)));
(_vAff = gl_texture2DFetch(_uT1, _tc_3010, 0));
(_vBase = _base_3013);
(gl_Position = vec4_ctor(((((_base_3013 + 1.5) / _uGrid) * 2.0) - 1.0), 0.0, 1.0));
(gl_PointSize = 3.0);
return generateOutput(input);
}
