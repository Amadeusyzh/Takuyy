// INITIAL HLSL BEGIN

#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
// Uniforms

uniform float4x4 _uVP : register(c0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes
static float3 _aPos = {0, 0, 0};

static float4 gl_Position = float4(0, 0, 0, 0);
static float gl_PointSize = float(1);

// Varyings

cbuffer DriverConstants : register(b1)
{
    float2 dx_ViewScale  : packoffset(c1);
    float clipControlOrigin : packoffset(c1.z);
    float clipControlZeroToOne : packoffset(c1.w);
};

#define GL_USES_POINT_SIZE
@@ VERTEX ATTRIBUTES @@

@@ VERTEX OUTPUT @@

VS_OUTPUT main(VS_INPUT input){
@@ MAIN PROLOGUE @@
(gl_Position = float4(0.0, 0.0, 0.0, 0.0));
(gl_Position = mul(transpose(_uVP), vec4_ctor(_aPos, 1.0)));
(gl_PointSize = 3.0);
return generateOutput(input);
}

// INITIAL HLSL END


// COMPILER INPUT HLSL BEGIN

struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float gl_PointSize : PSIZE;
};
#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
// Uniforms

uniform float4x4 _uVP : register(c0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes
static float3 _aPos = {0, 0, 0};

static float4 gl_Position = float4(0, 0, 0, 0);
static float gl_PointSize = float(1);

// Varyings

cbuffer DriverConstants : register(b1)
{
    float2 dx_ViewScale  : packoffset(c1);
    float clipControlOrigin : packoffset(c1.z);
    float clipControlZeroToOne : packoffset(c1.w);
};

#define GL_USES_POINT_SIZE
struct VS_INPUT
{
    float3 _aPos : TEXCOORD0;
};

void initAttributes(VS_INPUT input)
{
    _aPos = input._aPos;
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

    return output;
}

VS_OUTPUT main(VS_INPUT input){
    initAttributes(input);

(gl_Position = float4(0.0, 0.0, 0.0, 0.0));
(gl_Position = mul(transpose(_uVP), vec4_ctor(_aPos, 1.0)));
(gl_PointSize = 3.0);
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
    float4 gl_Position : TEXCOORD0;
    float gl_PointSize : PSIZE;
};

struct GS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float gl_PointSize : PSIZE;
};

void copyVertex(inout GS_OUTPUT output, GS_INPUT input, GS_INPUT flatinput)
{
    output.gl_Position = input.gl_Position;
    output.gl_PointSize = input.gl_PointSize;
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
    outStream.Append(output);

    output.dx_Position = dx_Position + float4(pointSpriteCorners[1] * viewportScale * gl_PointSize, 0.0f, 0.0f);
    outStream.Append(output);

    output.dx_Position = dx_Position + float4(pointSpriteCorners[2] * viewportScale * gl_PointSize, 0.0f, 0.0f);
    outStream.Append(output);

    output.dx_Position = dx_Position + float4(pointSpriteCorners[3] * viewportScale * gl_PointSize, 0.0f, 0.0f);
    outStream.Append(output);
    
    outStream.RestartStrip();
}

// COMPILER INPUT HLSL END

// VERTEX SHADER END
