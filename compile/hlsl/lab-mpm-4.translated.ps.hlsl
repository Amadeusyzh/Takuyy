// INITIAL HLSL BEGIN

#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
#define ANGLE_USES_DISCARD_REWRITING
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static  float4 _vA = {0, 0, 0, 0};

static float4 out_o = {0, 0, 0, 0};
static float2 gl_PointCoord = float2(0.5, 0.5);

cbuffer DriverConstants : register(b1)
{
    uint dx_Misc : packoffset(c2.w);
};

#define GL_USES_POINT_COORD
@@ PIXEL OUTPUT @@

PS_OUTPUT main(@@ PIXEL MAIN PARAMETERS @@){
@@ MAIN PROLOGUE @@
float2 _q_3005 = ((gl_PointCoord * 2.0) - 1.0);
float _r2_3006 = dot(_q_3005, _q_3005);
if ((_r2_3006 >= 1.0))
{
discard;
}
float _a_3007 = (_vA.w * smoothstep(1.0, 0.550000012, _r2_3006));
(out_o = vec4_ctor((_vA.xyz * _a_3007), _a_3007));
return generateOutput();
}

// INITIAL HLSL END


// COMPILER INPUT HLSL BEGIN

struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD1;
    float2 gl_PointCoord : TEXCOORD2;
    float gl_PointSize : PSIZE;
    float4 v0 : TEXCOORD0;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
#define ANGLE_USES_DISCARD_REWRITING
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static  float4 _vA = {0, 0, 0, 0};

static float4 out_o = {0, 0, 0, 0};
static float2 gl_PointCoord = float2(0.5, 0.5);

cbuffer DriverConstants : register(b1)
{
    uint dx_Misc : packoffset(c2.w);
};

#define GL_USES_POINT_COORD
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
    gl_PointCoord.x = input.gl_PointCoord.x;
    gl_PointCoord.y = 1.0 - input.gl_PointCoord.y;
    _vA = input.v0;

float2 _q_3005 = ((gl_PointCoord * 2.0) - 1.0);
float _r2_3006 = dot(_q_3005, _q_3005);
if ((_r2_3006 >= 1.0))
{
discard;
}
float _a_3007 = (_vA.w * smoothstep(1.0, 0.550000012, _r2_3006));
(out_o = vec4_ctor((_vA.xyz * _a_3007), _a_3007));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
