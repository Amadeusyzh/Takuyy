struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 v0 : TEXCOORD1;
    float4 v1 : TEXCOORD2;
    float4 v2 : TEXCOORD3;
    float4 gl_FragCoord : TEXCOORD4;
};

// INITIAL HLSL BEGIN

#pragma warning( disable: 3081 3556 3557 3571 )
#define ANGLE_USES_DISCARD_REWRITING
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static nointerpolation float4 _vSeg = {0, 0, 0, 0};
static nointerpolation float _vR = {0};
static nointerpolation float4 _vCol = {0, 0, 0, 0};

static float4 out_o = {0, 0, 0, 0};
static float4 gl_FragCoord = float4(0, 0, 0, 0);

cbuffer DriverConstants : register(b1)
{
    float4 dx_ViewCoords : packoffset(c1);
    float2 dx_FragCoordOffset : packoffset(c3);
    float3 dx_DepthFront : packoffset(c2);
    float2 dx_ViewScale : packoffset(c3.z);
    uint dx_Misc : packoffset(c2.w);
};

#define GL_USES_FRAG_COORD
struct PS_OUTPUT
{
    float4 out_o : SV_TARGET0;
    float4 out_o : SV_TARGET1;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_o = out_o;
    output.out_o = out_o;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;

float2 _p_3006 = gl_FragCoord.xy;
float2 _a_3007 = _vSeg.xy;
float2 _b_3008 = _vSeg.zw;
float2 _ba_3009 = (_b_3008 - _a_3007);
float _h_3010 = clamp((dot((_p_3006 - _a_3007), _ba_3009) / max(dot(_ba_3009, _ba_3009), 9.99999997e-07)), 0.0, 1.0);
if ((length(((_p_3006 - _a_3007) - (_ba_3009 * _h_3010))) > _vR))
{
discard;
}
(out_o = _vCol);
return generateOutput();
}

// INITIAL HLSL END


// COMPILER INPUT HLSL BEGIN

struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD3;
    float4 gl_FragCoord : TEXCOORD4;
    nointerpolation float4 v0 : TEXCOORD0;
    nointerpolation float4 v1 : TEXCOORD1;
    nointerpolation float v2 : TEXCOORD2;
};

#pragma warning( disable: 3081 3556 3557 3571 )
#define ANGLE_USES_DISCARD_REWRITING
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static nointerpolation float4 _vSeg = {0, 0, 0, 0};
static nointerpolation float _vR = {0};
static nointerpolation float4 _vCol = {0, 0, 0, 0};

static float4 out_o = {0, 0, 0, 0};
static float4 gl_FragCoord = float4(0, 0, 0, 0);

cbuffer DriverConstants : register(b1)
{
    float4 dx_ViewCoords : packoffset(c1);
    float2 dx_FragCoordOffset : packoffset(c3);
    float3 dx_DepthFront : packoffset(c2);
    float2 dx_ViewScale : packoffset(c3.z);
    uint dx_Misc : packoffset(c2.w);
};

#define GL_USES_FRAG_COORD
struct PS_OUTPUT
{
    float4 out_o : SV_TARGET0;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_o = out_o;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;
    _vSeg = input.v0;
    _vCol = input.v1;
    _vR = input.v2.x;

float2 _p_3006 = gl_FragCoord.xy;
float2 _a_3007 = _vSeg.xy;
float2 _b_3008 = _vSeg.zw;
float2 _ba_3009 = (_b_3008 - _a_3007);
float _h_3010 = clamp((dot((_p_3006 - _a_3007), _ba_3009) / max(dot(_ba_3009, _ba_3009), 9.99999997e-07)), 0.0, 1.0);
if ((length(((_p_3006 - _a_3007) - (_ba_3009 * _h_3010))) > _vR))
{
discard;
}
(out_o = _vCol);
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
