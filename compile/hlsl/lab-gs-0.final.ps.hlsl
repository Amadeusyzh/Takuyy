struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 v0 : TEXCOORD1;
    float4 v1 : TEXCOORD2;
};

// INITIAL HLSL BEGIN

#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
// Uniforms

uniform int _uMode : register(c0);
#define ANGLE_USES_DISCARD_REWRITING
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static  float4 _vColor = {0, 0, 0, 0};
static  float2 _vPos = {0, 0};

static float4 out_o = {0, 0, 0, 0};

cbuffer DriverConstants : register(b1)
{
    uint dx_Misc : packoffset(c2.w);
};

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
    _vColor = input.v0;
    _vPos = input.v1.xy;

float _r2_3006 = dot(_vPos, _vPos);
if ((_uMode == 1))
{
if ((_r2_3006 > 1.0))
{
discard;
}
(out_o = vec4_ctor((_vColor.xyz * (0.349999994 + (0.649999976 * sqrt((1.0 - _r2_3006))))), 1.0));
return generateOutput();
}
if ((_uMode == 2))
{
(out_o = vec4_ctor(_vColor.xyz, 1.0));
return generateOutput();
}
if ((_uMode == 4))
{
float _a_3007 = exp((-0.5 * _r2_3006));
if ((_a_3007 < 0.00392156886))
{
discard;
}
(out_o = vec4_ctor((float3(0.00999999978, 0.00400000019, 0.00120000006) * _a_3007), 0.0));
return generateOutput();
}
float _a_3008 = min((_vColor.w * exp((-0.5 * _r2_3006))), 0.995000005);
if ((_a_3008 < 0.00392156886))
{
discard;
}
(out_o = vec4_ctor((_vColor.xyz * _a_3008), _a_3008));
return generateOutput();
}

// INITIAL HLSL END


// COMPILER INPUT HLSL BEGIN

struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    float4 v0 : TEXCOORD0;
    float2 v1 : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
// Uniforms

uniform int _uMode : register(c0);
#define ANGLE_USES_DISCARD_REWRITING
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static  float4 _vColor = {0, 0, 0, 0};
static  float2 _vPos = {0, 0};

static float4 out_o = {0, 0, 0, 0};

cbuffer DriverConstants : register(b1)
{
    uint dx_Misc : packoffset(c2.w);
};

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
    _vColor = input.v0;
    _vPos = input.v1.xy;

float _r2_3006 = dot(_vPos, _vPos);
if ((_uMode == 1))
{
if ((_r2_3006 > 1.0))
{
discard;
}
(out_o = vec4_ctor((_vColor.xyz * (0.349999994 + (0.649999976 * sqrt((1.0 - _r2_3006))))), 1.0));
return generateOutput();
}
if ((_uMode == 2))
{
(out_o = vec4_ctor(_vColor.xyz, 1.0));
return generateOutput();
}
if ((_uMode == 4))
{
float _a_3007 = exp((-0.5 * _r2_3006));
if ((_a_3007 < 0.00392156886))
{
discard;
}
(out_o = vec4_ctor((float3(0.00999999978, 0.00400000019, 0.00120000006) * _a_3007), 0.0));
return generateOutput();
}
float _a_3008 = min((_vColor.w * exp((-0.5 * _r2_3006))), 0.995000005);
if ((_a_3008 < 0.00392156886))
{
discard;
}
(out_o = vec4_ctor((_vColor.xyz * _a_3008), _a_3008));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
