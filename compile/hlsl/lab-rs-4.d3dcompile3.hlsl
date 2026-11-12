struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    float4 gl_FragCoord : TEXCOORD3;
    float2 gl_PointCoord : TEXCOORD4;
    float gl_PointSize : PSIZE;
    float3 v0 : TEXCOORD0;
    float v1 : TEXCOORD1;
};
#pragma warning( disable: 3081 3556 3557 3571 )
float2 vec2_ctor(float x0, float x1)
{
    return float2(x0, x1);
}
float4 vec4_ctor(float2 x0, float x1, float x2)
{
    return float4(x0, x1, x2);
}
int2 ivec2_ctor_int_int(int x0, int x1)
{
    return int2(x0, x1);
}
// Uniforms

uniform float3 _uCamPos : register(c0);
uniform float3 _uCamFwd : register(c1);
uniform float3 _uCamRight : register(c2);
uniform float3 _uCamUp : register(c3);
uniform float _uTanHalf : register(c4);
uniform float2 _uRes : register(c5);
static const uint _uLights = 0;
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

static float4 gl_Position = float4(0, 0, 0, 0);
static float gl_PointSize = float(1);
static int gl_VertexID;

// Varyings
static  float3 _vCol = {0, 0, 0};
static  float _vDist = {0};

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
    output.v0 = _vCol;
    output.v1 = _vDist;

    output.gl_PointCoord = float2(0.5, 0.5);

    return output;
}

VS_OUTPUT main(VS_INPUT input){
    initAttributes(input);

(gl_Position = float4(0.0, 0.0, 0.0, 0.0));
float4 _a_3011 = gl_texture2DFetch(_uLights, ivec2_ctor_int_int(gl_VertexID, 0), 0);
float4 _b_3012 = gl_texture2DFetch(_uLights, ivec2_ctor_int_int(gl_VertexID, 1), 0);
float3 _d_3013 = (_a_3011.xyz - _uCamPos);
float _z_3014 = dot(_d_3013, _uCamFwd);
bool sbc8 = (_z_3014 < 0.100000001);
if ((!sbc8))
{
(sbc8 = (_b_3012.w < 0.5));
}
if (sbc8)
{
(gl_Position = float4(0.0, 0.0, 2.0, 1.0));
(gl_PointSize = 1.0);
return generateOutput(input);
}
float2 _ndc_3015 = vec2_ctor((dot(_d_3013, _uCamRight) / (((_z_3014 * _uTanHalf) * _uRes.x) / _uRes.y)), (dot(_d_3013, _uCamUp) / (_z_3014 * _uTanHalf)));
(gl_Position = vec4_ctor(_ndc_3015, 0.0, 1.0));
(gl_PointSize = clamp((((_a_3011.w / (_z_3014 * _uTanHalf)) * _uRes.y) * 1.29999995), 1.5, 12.0));
(_vDist = (length(_d_3013) - _a_3011.w));
(_vCol = (_b_3012.xyz / max(max(_b_3012.x, _b_3012.y), max(_b_3012.z, 0.00100000005))));
return generateOutput(input);
}
