
struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 gl_FragCoord : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float2 vec2_ctor_int2(int2 x0)
{
    return float2(x0);
}
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
int2 ivec2_ctor(float2 x0)
{
    return int2(x0);
}
int2 ivec2_ctor_int_int(int x0, int x1)
{
    return int2(x0, x1);
}
// Uniforms

uniform int2 _uP0 : register(c0);
uniform float _uSp0 : register(c1);
static const uint _uC0 = 0;
static const uint _uDist = 1;
uniform Texture2D<float4> textures2D[2] : register(t0);
uniform SamplerState samplers2D[2] : register(s0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings

static float4 out_o = {0, 0, 0, 0};
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
    SamplerMetadata samplerMetadata[2] : packoffset(c4);
};

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

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

float2 _g_3010 = ((gl_FragCoord.xy / _uSp0) - 0.5);
float2 _fl_3011 = floor(_g_3010);
float2 _f_3012 = (_g_3010 - _fl_3011);
int2 _b_3013 = ivec2_ctor(_fl_3011);
float3 _acc_3014 = {0.0, 0.0, 0.0};
float3 _accAll_3015 = {0.0, 0.0, 0.0};
float _ws_3016 = {0.0};
bool _self_3017 = (gl_texture2DFetch(_uDist, ivec2_ctor(gl_FragCoord.xy), 0).x < 0.5);
{ for(int _j_3018 = {0}; (_j_3018 < 4); (_j_3018++))
{
int2 _off_3019 = ivec2_ctor_int_int((_j_3018 & 1), (_j_3018 >> 1));
int2 _q_3020 = clamp((_b_3013 + _off_3019), int2(0, 0), (_uP0 - 1));
float sbd0 = {0};
if ((_off_3019.x == 1))
{
(sbd0 = _f_3012.x);
}
else
{
(sbd0 = (1.0 - _f_3012.x));
}
float sbd1 = {0};
if ((_off_3019.y == 1))
{
(sbd1 = _f_3012.y);
}
else
{
(sbd1 = (1.0 - _f_3012.y));
}
float _w_3021 = (sbd0 * sbd1);
float3 _s_3022 = (((gl_texture2DFetch(_uC0, _q_3020, 0).xyz + gl_texture2DFetch(_uC0, (_q_3020 + ivec2_ctor_int_int(_uP0.x, 0)), 0).xyz) + gl_texture2DFetch(_uC0, (_q_3020 + ivec2_ctor_int_int(0, _uP0.y)), 0).xyz) + gl_texture2DFetch(_uC0, (_q_3020 + _uP0), 0).xyz);
float sbd2 = {0};
if ((gl_texture2DFetch(_uDist, ivec2_ctor(((vec2_ctor_int2(_q_3020) + 0.5) * _uSp0)), 0).x < 0.5))
{
(sbd2 = 1.0);
}
else
{
(sbd2 = 0.0);
}
float _inside_3023 = sbd2;
bool sbd3 = _self_3017;
if ((!sbd3))
{
(sbd3 = (_inside_3023 < 0.5));
}
if (sbd3)
{
(_acc_3014 += ((_w_3021 * 0.25) * _s_3022));
(_ws_3016 += _w_3021);
}
(_accAll_3015 += ((_w_3021 * 0.25) * _s_3022));
}
}
float3 sbd4 = {0, 0, 0};
if ((_ws_3016 > 0.0))
{
(sbd4 = (_acc_3014 / _ws_3016));
}
else
{
(sbd4 = _accAll_3015);
}
(out_o = vec4_ctor(sbd4, 1.0));
return generateOutput();
}
