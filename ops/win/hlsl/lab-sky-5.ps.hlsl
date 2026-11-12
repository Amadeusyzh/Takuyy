
struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 gl_FragCoord : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float2 vec2_ctor(float x0, float x1)
{
    return float2(x0, x1);
}
float2 vec2_ctor_int2(int2 x0)
{
    return float2(x0);
}
float3 vec3_ctor(float x0, float x1, float x2)
{
    return float3(x0, x1, x2);
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

uniform float2 _uRes : register(c0);
uniform float3 _uCamF : register(c1);
uniform float3 _uCamRt : register(c2);
uniform float3 _uCamUp : register(c3);
uniform float _uTanH : register(c4);
uniform float _uAspect : register(c5);
uniform float2 _uLowRes : register(c6);
uniform float2 _uJitter : register(c7);
uniform float3 _uPF : register(c8);
uniform float3 _uPR : register(c9);
uniform float3 _uPU : register(c10);
uniform float _uBlend : register(c11);
uniform int _uValid : register(c12);
uniform int _uFast : register(c13);
static const uint _uCur = 0;
static const uint _uHist = 1;
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

static float4 out_outColor = {0, 0, 0, 0};
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

float4 gl_texture2D(uint samplerIndex, float2 t)
{
    return textures2D[samplerIndex].Sample(samplers2D[samplerIndex], float2(t.x, t.y));
}

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_FRAG_COORD
float3 f_rayDir(in float2 _uv_3010)
{
float2 _n_3011 = ((_uv_3010 * 2.0) - 1.0);
return normalize(((_uCamF + (_uCamRt * ((_n_3011.x * _uTanH) * _uAspect))) + (_uCamUp * (_n_3011.y * _uTanH))));
}
struct PS_OUTPUT
{
    float4 out_outColor : SV_TARGET0;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_outColor = out_outColor;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;

float2 _uv_3023 = (gl_FragCoord.xy / _uRes);
float2 _xl_3024 = (((_uv_3023 * _uLowRes) - 0.5) - _uJitter);
int2 _mx_3025 = (ivec2_ctor(_uLowRes) - 1);
int2 _i_3026 = clamp(ivec2_ctor(floor((_xl_3024 + 0.5))), int2(0, 0), _mx_3025);
float2 _d_3027 = (_xl_3024 - vec2_ctor_int2(_i_3026));
float4 _c_3028 = gl_texture2DFetch(_uCur, _i_3026, 0);
float4 _lo_3029 = _c_3028;
float4 _hi_3030 = _c_3028;
{ for(int _y_3031 = {-1}; (_y_3031 <= 1); (_y_3031++))
{
{ for(int _x_3032 = {-1}; (_x_3032 <= 1); (_x_3032++))
{
float4 _s_3033 = gl_texture2DFetch(_uCur, clamp((_i_3026 + ivec2_ctor_int_int(_x_3032, _y_3031)), int2(0, 0), _mx_3025), 0);
(_lo_3029 = (min(_lo_3029, _s_3033) + float4(0.0, 0.0, 0.0, 0.0)));
(_hi_3030 = (max(_hi_3030, _s_3033) + float4(0.0, 0.0, 0.0, 0.0)));
}
}
}
}
float4 _cb_3034 = gl_texture2D(_uCur, ((_xl_3024 + 0.5) / _uLowRes));
float3 _dir_3035 = f_rayDir(_uv_3023);
float3 _pc_3036 = vec3_ctor(dot(_dir_3035, _uPR), dot(_dir_3035, _uPU), dot(_dir_3035, _uPF));
float2 _puv_3037 = (0.5 + (0.5 * vec2_ctor((_pc_3036.x / ((_pc_3036.z * _uTanH) * _uAspect)), (_pc_3036.y / (_pc_3036.z * _uTanH)))));
bool sbe2 = (_uValid == 1);
if (sbe2)
{
(sbe2 = (_pc_3036.z > 0.0));
}
bool sbe1 = sbe2;
if (sbe1)
{
(sbe1 = all((_puv_3037 >= float2(0.0, 0.0))));
}
bool sbe0 = sbe1;
if (sbe0)
{
(sbe0 = all((_puv_3037 <= float2(1.0, 1.0))));
}
bool _ok_3038 = sbe0;
if ((!_ok_3038))
{
(out_outColor = _cb_3034);
return generateOutput();
}
float4 _h_3039 = clamp(gl_texture2D(_uHist, _puv_3037), _lo_3029, _hi_3030);
if ((_uFast == 1))
{
(out_outColor = lerp(_h_3039, _cb_3034, 0.400000006));
return generateOutput();
}
(out_outColor = lerp(_h_3039, lerp(_cb_3034, _c_3028, exp((-8.0 * dot(_d_3027, _d_3027)))), _uBlend));
return generateOutput();
}
