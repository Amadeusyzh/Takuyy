// INITIAL HLSL BEGIN

#pragma warning( disable: 3081 3556 3557 3571 )
float3 vec3_ctor(float x0)
{
    return float3(x0, x0, x0);
}
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
int int_ctor(float x0)
{
    return int(x0);
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

uniform int _uView : register(c0);
uniform int _uDenoise : register(c1);
uniform int _uSel : register(c2);
uniform float _uExposure : register(c3);
static const uint _uAccum = 0;
static const uint _uDen = 1;
static const uint _uND = 2;
static const uint _uAlb = 3;
uniform Texture2D<float4> textures2D[4] : register(t0);
uniform SamplerState samplers2D[4] : register(s0);
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
    SamplerMetadata samplerMetadata[4] : packoffset(c4);
};

int2 gl_texture2DSize(uint samplerIndex, int lod)
{
    int baseLevel = 0;
    uint width; uint height; uint numberOfLevels;
    textures2D[samplerIndex].GetDimensions(baseLevel, width, height, numberOfLevels);
    width = max(width >> lod, 1);
    height = max(height >> lod, 1);
    return int2(width, height);
}

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
float3 f_aces(in float3 _x_3011)
{
return clamp(((_x_3011 * ((2.50999999 * _x_3011) + 0.0299999993)) / ((_x_3011 * ((2.43000007 * _x_3011) + 0.589999974)) + 0.140000001)), 0.0, 1.0);
}
@@ PIXEL OUTPUT @@

PS_OUTPUT main(@@ PIXEL MAIN PARAMETERS @@){
@@ MAIN PROLOGUE @@
int2 _p_3013 = ivec2_ctor(gl_FragCoord.xy);
float4 _alb_3014 = gl_texture2DFetch(_uAlb, _p_3013, 0);
float4 _nd_3015 = gl_texture2DFetch(_uND, _p_3013, 0);
float3 _c_3016 = {0, 0, 0};
if ((_uView == 0))
{
float3 sbcf = {0, 0, 0};
if ((_uDenoise == 1))
{
(sbcf = (gl_texture2DFetch(_uDen, _p_3013, 0).xyz * _alb_3014.xyz));
}
else
{
(sbcf = gl_texture2DFetch(_uAccum, _p_3013, 0).xyz);
}
(_c_3016 = sbcf);
}
else
{
if ((_uView == 1))
{
(_c_3016 = gl_texture2DFetch(_uAccum, _p_3013, 0).xyz);
}
}
if ((_uView <= 1))
{
(_c_3016 = pow(f_aces((_c_3016 * _uExposure)), float3(0.454545438, 0.454545438, 0.454545438)));
}
else
{
if ((_uView == 2))
{
(_c_3016 = pow(_alb_3014.xyz, float3(0.454545438, 0.454545438, 0.454545438)));
}
else
{
if ((_uView == 3))
{
(_c_3016 = ((_nd_3015.xyz * 0.5) + 0.5));
}
else
{
(_c_3016 = vec3_ctor((1.0 - clamp(((_nd_3015.w - 1.5) / 4.0), 0.0, 1.0))));
}
}
}
if ((_uSel >= 0))
{
bool _inSel_3017 = ((int_ctor(floor(((_alb_3014.w / 16.0) + 0.00999999978))) - 1) == _uSel);
int _edge_3018 = {0};
int2 _sz_3019 = gl_texture2DSize(_uAlb, 0);
{ for(int _k_3020 = {0}; (_k_3020 < 4); (_k_3020++))
{
int sbd0 = {0};
if ((_k_3020 == 0))
{
(sbd0 = 2);
}
else
{
int sbd1 = {0};
if ((_k_3020 == 1))
{
(sbd1 = -2);
}
else
{
(sbd1 = 0);
}
(sbd0 = sbd1);
}
int sbd2 = {0};
if ((_k_3020 == 2))
{
(sbd2 = 2);
}
else
{
int sbd3 = {0};
if ((_k_3020 == 3))
{
(sbd3 = -2);
}
else
{
(sbd3 = 0);
}
(sbd2 = sbd3);
}
int2 _q_3021 = clamp((_p_3013 + ivec2_ctor_int_int(sbd0, sbd2)), int2(0, 0), (_sz_3019 - 1));
bool _qs_3022 = ((int_ctor(floor(((gl_texture2DFetch(_uAlb, _q_3021, 0).w / 16.0) + 0.00999999978))) - 1) == _uSel);
if ((_qs_3022 != _inSel_3017))
{
(_edge_3018 = 1);
}
}
}
if ((_edge_3018 == 1))
{
(_c_3016 = lerp(_c_3016, float3(1.0, 0.800000012, 0.200000003), 0.850000024));
}
}
(out_o = vec4_ctor(_c_3016, 1.0));
return generateOutput();
}

// INITIAL HLSL END


// COMPILER INPUT HLSL BEGIN

struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 gl_FragCoord : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float3 vec3_ctor(float x0)
{
    return float3(x0, x0, x0);
}
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
int int_ctor(float x0)
{
    return int(x0);
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

uniform int _uView : register(c0);
uniform int _uDenoise : register(c1);
uniform int _uSel : register(c2);
uniform float _uExposure : register(c3);
static const uint _uAccum = 0;
static const uint _uDen = 1;
static const uint _uND = 2;
static const uint _uAlb = 3;
uniform Texture2D<float4> textures2D[4] : register(t0);
uniform SamplerState samplers2D[4] : register(s0);
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
    SamplerMetadata samplerMetadata[4] : packoffset(c4);
};

int2 gl_texture2DSize(uint samplerIndex, int lod)
{
    int baseLevel = 0;
    uint width; uint height; uint numberOfLevels;
    textures2D[samplerIndex].GetDimensions(baseLevel, width, height, numberOfLevels);
    width = max(width >> lod, 1);
    height = max(height >> lod, 1);
    return int2(width, height);
}

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
float3 f_aces(in float3 _x_3011)
{
return clamp(((_x_3011 * ((2.50999999 * _x_3011) + 0.0299999993)) / ((_x_3011 * ((2.43000007 * _x_3011) + 0.589999974)) + 0.140000001)), 0.0, 1.0);
}
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

int2 _p_3013 = ivec2_ctor(gl_FragCoord.xy);
float4 _alb_3014 = gl_texture2DFetch(_uAlb, _p_3013, 0);
float4 _nd_3015 = gl_texture2DFetch(_uND, _p_3013, 0);
float3 _c_3016 = {0, 0, 0};
if ((_uView == 0))
{
float3 sbcf = {0, 0, 0};
if ((_uDenoise == 1))
{
(sbcf = (gl_texture2DFetch(_uDen, _p_3013, 0).xyz * _alb_3014.xyz));
}
else
{
(sbcf = gl_texture2DFetch(_uAccum, _p_3013, 0).xyz);
}
(_c_3016 = sbcf);
}
else
{
if ((_uView == 1))
{
(_c_3016 = gl_texture2DFetch(_uAccum, _p_3013, 0).xyz);
}
}
if ((_uView <= 1))
{
(_c_3016 = pow(f_aces((_c_3016 * _uExposure)), float3(0.454545438, 0.454545438, 0.454545438)));
}
else
{
if ((_uView == 2))
{
(_c_3016 = pow(_alb_3014.xyz, float3(0.454545438, 0.454545438, 0.454545438)));
}
else
{
if ((_uView == 3))
{
(_c_3016 = ((_nd_3015.xyz * 0.5) + 0.5));
}
else
{
(_c_3016 = vec3_ctor((1.0 - clamp(((_nd_3015.w - 1.5) / 4.0), 0.0, 1.0))));
}
}
}
if ((_uSel >= 0))
{
bool _inSel_3017 = ((int_ctor(floor(((_alb_3014.w / 16.0) + 0.00999999978))) - 1) == _uSel);
int _edge_3018 = {0};
int2 _sz_3019 = gl_texture2DSize(_uAlb, 0);
{ for(int _k_3020 = {0}; (_k_3020 < 4); (_k_3020++))
{
int sbd0 = {0};
if ((_k_3020 == 0))
{
(sbd0 = 2);
}
else
{
int sbd1 = {0};
if ((_k_3020 == 1))
{
(sbd1 = -2);
}
else
{
(sbd1 = 0);
}
(sbd0 = sbd1);
}
int sbd2 = {0};
if ((_k_3020 == 2))
{
(sbd2 = 2);
}
else
{
int sbd3 = {0};
if ((_k_3020 == 3))
{
(sbd3 = -2);
}
else
{
(sbd3 = 0);
}
(sbd2 = sbd3);
}
int2 _q_3021 = clamp((_p_3013 + ivec2_ctor_int_int(sbd0, sbd2)), int2(0, 0), (_sz_3019 - 1));
bool _qs_3022 = ((int_ctor(floor(((gl_texture2DFetch(_uAlb, _q_3021, 0).w / 16.0) + 0.00999999978))) - 1) == _uSel);
if ((_qs_3022 != _inSel_3017))
{
(_edge_3018 = 1);
}
}
}
if ((_edge_3018 == 1))
{
(_c_3016 = lerp(_c_3016, float3(1.0, 0.800000012, 0.200000003), 0.850000024));
}
}
(out_o = vec4_ctor(_c_3016, 1.0));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
