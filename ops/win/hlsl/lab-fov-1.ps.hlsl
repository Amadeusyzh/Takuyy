
struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 gl_FragCoord : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
// Uniforms

uniform float2 _uRes : register(c0);
uniform float2 _uGaze : register(c1);
uniform float _uR0 : register(c2);
uniform float _uR1 : register(c3);
uniform float _uBand : register(c4);
uniform float _uFov : register(c5);
uniform float _uRegions : register(c6);
uniform float _uDpr : register(c7);
static const uint _uT0 = 0;
static const uint _uT1 = 1;
static const uint _uT2 = 2;
uniform Texture2D<float4> textures2D[3] : register(t0);
uniform SamplerState samplers2D[3] : register(s0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings

static float4 gl_Color[1] =
{
    float4(0, 0, 0, 0)
};
static float4 gl_FragCoord = float4(0, 0, 0, 0);

cbuffer DriverConstants : register(b1)
{
    float4 dx_ViewCoords : packoffset(c1);
    float2 dx_FragCoordOffset : packoffset(c3);
    float3 dx_DepthFront : packoffset(c2);
    float2 dx_ViewScale : packoffset(c3.z);
    uint dx_Misc : packoffset(c2.w);
    struct SamplerMetadata
    {
        int baseLevel;
        int wrapModes;
        int2 padding;
        int4 intBorderColor;
    };
    SamplerMetadata samplerMetadata[3] : packoffset(c4);
};

#define GL_USES_FRAG_COLOR
float4 gl_texture2D(uint samplerIndex, float2 t)
{
    return textures2D[samplerIndex].Sample(samplers2D[samplerIndex], float2(t.x, t.y));
}

#define GL_USES_FRAG_COORD
struct PS_OUTPUT
{
    float4 gl_Color0 : SV_TARGET0;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.gl_Color0 = gl_Color[0];
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;

float2 _uv_3013 = (gl_FragCoord.xy / _uRes);
float _e_3014 = distance(gl_FragCoord.xy, _uGaze);
float3 _col_3015 = gl_texture2D(_uT0, _uv_3013).xyz;
if ((_uFov > 0.5))
{
float _w0_3016 = (1.0 - smoothstep((_uR0 - _uBand), _uR0, _e_3014));
float _w1_3017 = (1.0 - smoothstep((_uR1 - _uBand), _uR1, _e_3014));
(_col_3015 = lerp(lerp(gl_texture2D(_uT2, _uv_3013).xyz, gl_texture2D(_uT1, _uv_3013).xyz, _w1_3017), _col_3015, _w0_3016));
if ((_uRegions > 0.5))
{
float3 sbcd = {0, 0, 0};
if ((_e_3014 < _uR0))
{
(sbcd = float3(0.200000003, 1.0, 0.449999988));
}
else
{
float3 sbce = {0, 0, 0};
if ((_e_3014 < _uR1))
{
(sbce = float3(1.0, 0.800000012, 0.150000006));
}
else
{
(sbce = float3(1.0, 0.25, 0.300000012));
}
(sbcd = sbce);
}
float3 _tint_3018 = sbcd;
(_col_3015 = lerp(_col_3015, _tint_3018, 0.200000003));
float _ring_3019 = min(abs((_e_3014 - _uR0)), abs((_e_3014 - _uR1)));
(_col_3015 = lerp(_col_3015, float3(1.0, 1.0, 1.0), ((1.0 - smoothstep(0.0, (1.5 * _uDpr), _ring_3019)) * 0.699999988)));
}
}
float _ret_3020 = abs((_e_3014 - (7.0 * _uDpr)));
(_col_3015 = lerp(_col_3015, float3(1.0, 1.0, 1.0), ((1.0 - smoothstep(0.0, (1.20000005 * _uDpr), _ret_3020)) * 0.899999976)));
(_col_3015 = lerp(_col_3015, float3(1.0, 1.0, 1.0), ((1.0 - smoothstep((1.0 * _uDpr), (2.0 * _uDpr), _e_3014)) * 0.899999976)));
(gl_Color[0] = vec4_ctor(_col_3015, 1.0));
return generateOutput();
}
