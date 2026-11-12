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
