// INITIAL HLSL BEGIN

#pragma warning( disable: 3081 3556 3557 3571 )
float float_ctor_int(int x0)
{
    return float(x0);
}
float2x2 mat2_ctor_float4(float4 x0)
{
    return float2x2(x0);
}
float4 vec4_ctor(float x0, float x1, float x2, float x3)
{
    return float4(x0, x1, x2, x3);
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
int2 ivec2_ctor_int_int(int x0, int x1)
{
    return int2(x0, x1);
}
// Uniforms

uniform float2 _uOrigin : register(c0);
uniform float2 _uSpan : register(c1);
uniform float _uSize : register(c2);
uniform int _uMode : register(c3);
uniform float3 _uPal[4] : register(c4);
static const uint _uT0 = 0;
static const uint _uT2 = 1;
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
static  float4 _vA = {0, 0, 0, 0};
static  float4 _vB = {0, 0, 0, 0};

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
float tanh_emu(float x)
{
    return (abs(x) > 15.0) ? sign(x) : tanh(x);
}


float3 f_diverging(in float _t_3012)
{
float3 _neg_3013 = {0.150000006, 0.550000012, 1.0};
float3 _mid_3014 = {0.620000005, 0.639999986, 0.699999988};
float3 _pos_3015 = {1.0, 0.379999995, 0.200000003};
float3 sbd2 = {0, 0, 0};
if ((_t_3012 < 0.0))
{
(sbd2 = lerp(_mid_3014, _neg_3013, (-_t_3012)));
}
else
{
(sbd2 = lerp(_mid_3014, _pos_3015, _t_3012));
}
return sbd2;
}
@@ VERTEX ATTRIBUTES @@

@@ VERTEX OUTPUT @@

VS_OUTPUT main(VS_INPUT input){
@@ MAIN PROLOGUE @@
(gl_Position = float4(0.0, 0.0, 0.0, 0.0));
int2 _tc_3017 = ivec2_ctor_int_int((gl_VertexID % 256), (gl_VertexID / 256));
float4 _a_3018 = gl_texture2DFetch(_uT0, _tc_3017, 0);
float4 _st_3019 = gl_texture2DFetch(_uT3, _tc_3017, 0);
int _mat_3020 = int_ctor((_st_3019.y + 0.5));
float2 _uv_3021 = ((_a_3018.xy - _uOrigin) / _uSpan);
float4 sbd3 = {0, 0, 0, 0};
if ((_st_3019.x < -1.5))
{
(sbd3 = float4(-2.0, -2.0, 0.0, 1.0));
}
else
{
(sbd3 = vec4_ctor(((_uv_3021 * 2.0) - 1.0), 0.0, 1.0));
}
(gl_Position = sbd3);
(gl_PointSize = _uSize);
float3 _jc_3022 = _uPal[int_ctor(clamp(float_ctor_int((int_ctor((_st_3019.z + 0.5)) & 3)), 0.0, 3.0))];
float _speed_3023 = length(_a_3018.zw);
if ((_uMode == 0))
{
float sbd4 = {0};
if ((_mat_3020 == 0))
{
(sbd4 = 1.0);
}
else
{
(sbd4 = 0.0);
}
float sbd5 = {0};
if ((_mat_3020 == 1))
{
(sbd5 = 1.0);
}
else
{
(sbd5 = 0.0);
}
float sbd6 = {0};
if ((_mat_3020 == 2))
{
(sbd6 = 1.0);
}
else
{
(sbd6 = 0.0);
}
(_vA = vec4_ctor(sbd4, sbd5, sbd6, _speed_3023));
float3 sbd7 = {0, 0, 0};
if ((_mat_3020 == 1))
{
(sbd7 = _jc_3022);
}
else
{
(sbd7 = float3(0.0, 0.0, 0.0));
}
float sbd8 = {0};
if ((_mat_3020 == 2))
{
(sbd8 = (clamp((1.0 - _st_3019.x), 0.0, 0.600000024) * 1.60000002));
}
else
{
(sbd8 = 0.0);
}
(_vB = vec4_ctor(sbd7, sbd8));
}
else
{
float3 sbd9 = {0, 0, 0};
if ((_mat_3020 == 0))
{
(sbd9 = float3(0.280000001, 0.620000005, 1.0));
}
else
{
float3 sbda = {0, 0, 0};
if ((_mat_3020 == 1))
{
(sbda = _jc_3022);
}
else
{
(sbda = float3(0.930000007, 0.959999979, 1.0));
}
(sbd9 = sbda);
}
float3 _c_3024 = sbd9;
(_c_3024 *= (0.800000012 + (0.25 * frac((_st_3019.w * 13.6999998)))));
if ((_uMode == 2))
{
float _J_3025 = (determinant(transpose(mat2_ctor_float4(gl_texture2DFetch(_uT2, _tc_3017, 0)))) * _st_3019.x);
(_c_3024 = f_diverging(tanh_emu((log(max(_J_3025, 0.00100000005)) / 0.0250000004))));
}
float sbdb = {0};
if ((_uMode == 3))
{
(sbdb = 0.349999994);
}
else
{
(sbdb = 0.949999988);
}
(_vA = vec4_ctor(_c_3024, sbdb));
(_vB = float4(0.0, 0.0, 0.0, 0.0));
}
return generateOutput(input);
}

// INITIAL HLSL END


// COMPILER INPUT HLSL BEGIN

struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD1;
    float2 gl_PointCoord : TEXCOORD2;
    float gl_PointSize : PSIZE;
    float4 v0 : TEXCOORD0;
};
#pragma warning( disable: 3081 3556 3557 3571 )
float float_ctor_int(int x0)
{
    return float(x0);
}
float2x2 mat2_ctor_float4(float4 x0)
{
    return float2x2(x0);
}
float4 vec4_ctor(float x0, float x1, float x2, float x3)
{
    return float4(x0, x1, x2, x3);
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
int2 ivec2_ctor_int_int(int x0, int x1)
{
    return int2(x0, x1);
}
// Uniforms

uniform float2 _uOrigin : register(c0);
uniform float2 _uSpan : register(c1);
uniform float _uSize : register(c2);
uniform int _uMode : register(c3);
uniform float3 _uPal[4] : register(c4);
static const uint _uT0 = 0;
static const uint _uT2 = 1;
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
static  float4 _vA = {0, 0, 0, 0};
static  float4 _vB = {0, 0, 0, 0};

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
float tanh_emu(float x)
{
    return (abs(x) > 15.0) ? sign(x) : tanh(x);
}


float3 f_diverging(in float _t_3012)
{
float3 _neg_3013 = {0.150000006, 0.550000012, 1.0};
float3 _mid_3014 = {0.620000005, 0.639999986, 0.699999988};
float3 _pos_3015 = {1.0, 0.379999995, 0.200000003};
float3 sbd2 = {0, 0, 0};
if ((_t_3012 < 0.0))
{
(sbd2 = lerp(_mid_3014, _neg_3013, (-_t_3012)));
}
else
{
(sbd2 = lerp(_mid_3014, _pos_3015, _t_3012));
}
return sbd2;
}
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
    output.v0 = _vA;

    output.gl_PointCoord = float2(0.5, 0.5);

    return output;
}

VS_OUTPUT main(VS_INPUT input){
    initAttributes(input);

(gl_Position = float4(0.0, 0.0, 0.0, 0.0));
int2 _tc_3017 = ivec2_ctor_int_int((gl_VertexID % 256), (gl_VertexID / 256));
float4 _a_3018 = gl_texture2DFetch(_uT0, _tc_3017, 0);
float4 _st_3019 = gl_texture2DFetch(_uT3, _tc_3017, 0);
int _mat_3020 = int_ctor((_st_3019.y + 0.5));
float2 _uv_3021 = ((_a_3018.xy - _uOrigin) / _uSpan);
float4 sbd3 = {0, 0, 0, 0};
if ((_st_3019.x < -1.5))
{
(sbd3 = float4(-2.0, -2.0, 0.0, 1.0));
}
else
{
(sbd3 = vec4_ctor(((_uv_3021 * 2.0) - 1.0), 0.0, 1.0));
}
(gl_Position = sbd3);
(gl_PointSize = _uSize);
float3 _jc_3022 = _uPal[int_ctor(clamp(float_ctor_int((int_ctor((_st_3019.z + 0.5)) & 3)), 0.0, 3.0))];
float _speed_3023 = length(_a_3018.zw);
if ((_uMode == 0))
{
float sbd4 = {0};
if ((_mat_3020 == 0))
{
(sbd4 = 1.0);
}
else
{
(sbd4 = 0.0);
}
float sbd5 = {0};
if ((_mat_3020 == 1))
{
(sbd5 = 1.0);
}
else
{
(sbd5 = 0.0);
}
float sbd6 = {0};
if ((_mat_3020 == 2))
{
(sbd6 = 1.0);
}
else
{
(sbd6 = 0.0);
}
(_vA = vec4_ctor(sbd4, sbd5, sbd6, _speed_3023));
float3 sbd7 = {0, 0, 0};
if ((_mat_3020 == 1))
{
(sbd7 = _jc_3022);
}
else
{
(sbd7 = float3(0.0, 0.0, 0.0));
}
float sbd8 = {0};
if ((_mat_3020 == 2))
{
(sbd8 = (clamp((1.0 - _st_3019.x), 0.0, 0.600000024) * 1.60000002));
}
else
{
(sbd8 = 0.0);
}
(_vB = vec4_ctor(sbd7, sbd8));
}
else
{
float3 sbd9 = {0, 0, 0};
if ((_mat_3020 == 0))
{
(sbd9 = float3(0.280000001, 0.620000005, 1.0));
}
else
{
float3 sbda = {0, 0, 0};
if ((_mat_3020 == 1))
{
(sbda = _jc_3022);
}
else
{
(sbda = float3(0.930000007, 0.959999979, 1.0));
}
(sbd9 = sbda);
}
float3 _c_3024 = sbd9;
(_c_3024 *= (0.800000012 + (0.25 * frac((_st_3019.w * 13.6999998)))));
if ((_uMode == 2))
{
float _J_3025 = (determinant(transpose(mat2_ctor_float4(gl_texture2DFetch(_uT2, _tc_3017, 0)))) * _st_3019.x);
(_c_3024 = f_diverging(tanh_emu((log(max(_J_3025, 0.00100000005)) / 0.0250000004))));
}
float sbdb = {0};
if ((_uMode == 3))
{
(sbdb = 0.349999994);
}
else
{
(sbdb = 0.949999988);
}
(_vA = vec4_ctor(_c_3024, sbdb));
(_vB = float4(0.0, 0.0, 0.0, 0.0));
}
return generateOutput(input);
}

// COMPILER INPUT HLSL END
// COMPILER INPUT HLSL BEGIN

cbuffer DriverConstants : register(b0)
{
    float4 dx_ViewCoords : packoffset(c1);
};

#define ANGLE_POINT_SPRITE_SHADER

static float2 pointSpriteCorners[] = 
{
    float2( 0.5f, -0.5f),
    float2( 0.5f,  0.5f),
    float2(-0.5f, -0.5f),
    float2(-0.5f,  0.5f)
};

static float2 pointSpriteTexcoords[] = 
{
    float2(1.0f, 1.0f),
    float2(1.0f, 0.0f),
    float2(0.0f, 1.0f),
    float2(0.0f, 0.0f)
};

static float minPointSize = 1.0f;
static float maxPointSize = 1024.0f;

struct GS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD1;
    float2 gl_PointCoord : TEXCOORD2;
    float gl_PointSize : PSIZE;
    float4 v0 : TEXCOORD0;
};

struct GS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD1;
    float2 gl_PointCoord : TEXCOORD2;
    float gl_PointSize : PSIZE;
    float4 v0 : TEXCOORD0;
};

void copyVertex(inout GS_OUTPUT output, GS_INPUT input, GS_INPUT flatinput)
{
    output.gl_Position = input.gl_Position;
    output.gl_PointSize = input.gl_PointSize;
    output.v0 = input.v0; 
#ifndef ANGLE_POINT_SPRITE_SHADER
    output.dx_Position = input.dx_Position;
#endif  // ANGLE_POINT_SPRITE_SHADER
}

[maxvertexcount(4)]
void main(point GS_INPUT input[1],  inout TriangleStream<GS_OUTPUT> outStream)
{
    GS_OUTPUT output = (GS_OUTPUT)0;
    uint lastVertexIndex = 0;
    copyVertex(output, input[0], input[lastVertexIndex]);

    float4 dx_Position = input[0].dx_Position;
    float gl_PointSize = clamp(input[0].gl_PointSize, minPointSize, maxPointSize);
    float2 viewportScale = float2(1.0f / dx_ViewCoords.x, 1.0f / dx_ViewCoords.y) * dx_Position.w;

    output.dx_Position = dx_Position + float4(pointSpriteCorners[0] * viewportScale * gl_PointSize, 0.0f, 0.0f);
    output.gl_PointCoord = pointSpriteTexcoords[0];
    outStream.Append(output);

    output.dx_Position = dx_Position + float4(pointSpriteCorners[1] * viewportScale * gl_PointSize, 0.0f, 0.0f);
    output.gl_PointCoord = pointSpriteTexcoords[1];
    outStream.Append(output);

    output.dx_Position = dx_Position + float4(pointSpriteCorners[2] * viewportScale * gl_PointSize, 0.0f, 0.0f);
    output.gl_PointCoord = pointSpriteTexcoords[2];
    outStream.Append(output);

    output.dx_Position = dx_Position + float4(pointSpriteCorners[3] * viewportScale * gl_PointSize, 0.0f, 0.0f);
    output.gl_PointCoord = pointSpriteTexcoords[3];
    outStream.Append(output);
    
    outStream.RestartStrip();
}

// COMPILER INPUT HLSL END

// VERTEX SHADER END
