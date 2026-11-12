struct GS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD3;
    float4 gl_FragCoord : TEXCOORD4;
    nointerpolation float4 v0 : TEXCOORD0;
    nointerpolation float4 v1 : TEXCOORD1;
    nointerpolation float v2 : TEXCOORD2;
};

struct GS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD3;
    float4 gl_FragCoord : TEXCOORD4;
    nointerpolation float4 v0 : TEXCOORD0;
    nointerpolation float4 v1 : TEXCOORD1;
    nointerpolation float v2 : TEXCOORD2;
};

void copyVertex(inout GS_OUTPUT output, GS_INPUT input, GS_INPUT flatinput)
{
    output.gl_Position = input.gl_Position;
    output.v0 = flatinput.v0; 
    output.v1 = flatinput.v1; 
    output.v2 = flatinput.v2; 
    output.gl_FragCoord = input.gl_FragCoord;
#ifndef ANGLE_POINT_SPRITE_SHADER
    output.dx_Position = input.dx_Position;
#endif  // ANGLE_POINT_SPRITE_SHADER
}

[maxvertexcount(3)]
void main(triangle GS_INPUT input[3],  inout TriangleStream<GS_OUTPUT> outStream)
{
    GS_OUTPUT output = (GS_OUTPUT)0;
    uint lastVertexIndex = 2;
    copyVertex(output, input[0], input[lastVertexIndex]);
    outStream.Append(output);
    copyVertex(output, input[1], input[lastVertexIndex]);
    outStream.Append(output);
    copyVertex(output, input[2], input[lastVertexIndex]);
    outStream.Append(output);
    
    outStream.RestartStrip();
}
