
struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 gl_FragCoord : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float float_ctor_int(int x0)
{
    return float(x0);
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

uniform int _uStep : register(c0);
uniform int _uDemod : register(c1);
uniform float _uSigC : register(c2);
uniform float _uSigN : register(c3);
uniform float _uSigZ : register(c4);
static const uint _uIn = 0;
static const uint _uND = 1;
static const uint _uAlb = 2;
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
    SamplerMetadata samplerMetadata[3] : packoffset(c4);
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
float3 f_fetch_int2(in int2 _q_3011)
{
float3 _c_3012 = gl_texture2DFetch(_uIn, _q_3011, 0).xyz;
if ((_uDemod == 1))
{
(_c_3012 /= gl_texture2DFetch(_uAlb, _q_3011, 0).xyz);
}
return _c_3012;
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

int2 _p_3014 = ivec2_ctor(gl_FragCoord.xy);
int2 _sz_3015 = gl_texture2DSize(_uIn, 0);
float3 _cp_3016 = f_fetch_int2(_p_3014);
float4 _ndp_3017 = gl_texture2DFetch(_uND, _p_3014, 0);
float _idp_3018 = gl_texture2DFetch(_uAlb, _p_3014, 0).w;
float _k_3019[3] = {0.375, 0.25, 0.0625};
float3 _sum_3020 = {0.0, 0.0, 0.0};
float _wsum_3021 = {0.0};
{ for(int _y_3022 = {-2}; (_y_3022 <= 2); (_y_3022++))
{
{ for(int _x_3023 = {-2}; (_x_3023 <= 2); (_x_3023++))
{
int2 _q_3024 = clamp((_p_3014 + (ivec2_ctor_int_int(_x_3023, _y_3022) * _uStep)), int2(0, 0), (_sz_3015 - 1));
float3 _cq_3025 = f_fetch_int2(_q_3024);
float4 _ndq_3026 = gl_texture2DFetch(_uND, _q_3024, 0);
float _wc_3027 = exp(((-dot((_cp_3016 - _cq_3025), (_cp_3016 - _cq_3025))) / ((_uSigC * _uSigC) + 9.99999997e-07)));
float _wn_3028 = pow(max(dot(_ndp_3017.xyz, _ndq_3026.xyz), 0.0), _uSigN);
float _wz_3029 = exp(((-abs((_ndp_3017.w - _ndq_3026.w))) / ((_uSigZ * float_ctor_int(_uStep)) + 0.00100000005)));
float sbd8 = {0};
if ((gl_texture2DFetch(_uAlb, _q_3024, 0).w == _idp_3018))
{
(sbd8 = (1.0 + 0.0));
}
else
{
(sbd8 = (0.200000003 + 0.0));
}
float _wi_3030 = sbd8;
float _w_3031 = (((((_k_3019[int_ctor(clamp(float_ctor_int(abs(_x_3023)), 0.0, 2.0))] * _k_3019[int_ctor(clamp(float_ctor_int(abs(_y_3022)), 0.0, 2.0))]) * _wc_3027) * _wn_3028) * _wz_3029) * _wi_3030);
(_sum_3020 += ((_cq_3025 * _w_3031) + float3(0.0, 0.0, 0.0)));
(_wsum_3021 += (_w_3031 + 0.0));
}
}
}
}
(out_o = vec4_ctor((_sum_3020 / max(_wsum_3021, 9.99999997e-07)), 1.0));
return generateOutput();
}
