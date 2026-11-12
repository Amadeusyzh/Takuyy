
struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD3;
    float3 v0 : TEXCOORD0;
    float3 v1 : TEXCOORD1;
    float2 v2 : TEXCOORD2;
};

#pragma warning( disable: 3081 3556 3557 3571 )
float4 vec4_ctor(float x0, float x1, float x2, float x3)
{
    return float4(x0, x1, x2, x3);
}
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
// Uniforms

uniform float3 _uEye : register(c0);
uniform float3 _uLight : register(c1);
uniform float3 _uFront : register(c2);
uniform float3 _uBack : register(c3);
uniform float _uShadow : register(c4);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static  float3 _vPos = {0, 0, 0};
static  float3 _vNrm = {0, 0, 0};
static  float2 _vUv = {0, 0};

static float4 gl_Color[1] =
{
    float4(0, 0, 0, 0)
};
static bool gl_FrontFacing = false;

cbuffer DriverConstants : register(b1)
{
    float3 dx_DepthFront : packoffset(c2);
    uint dx_Misc : packoffset(c2.w);
};

#define GL_USES_FRAG_COLOR
#define GL_USES_FRONT_FACING
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


PS_OUTPUT main(PS_INPUT input, bool isFrontFace : SV_IsFrontFace){
    gl_FrontFacing = isFrontFace;
    _vPos = input.v0.xyz;
    _vNrm = input.v1.xyz;
    _vUv = input.v2.xy;

if ((_uShadow > 0.5))
{
float _f_3010 = (1.0 - smoothstep(1.0, 3.5, length(_vPos.xz)));
(gl_Color[0] = vec4_ctor(0.0, 0.0, 0.0, (0.550000012 * _f_3010)));
return generateOutput();
}
float3 _n_3011 = normalize(_vNrm);
float3 _v_3012 = normalize((_uEye - _vPos));
if ((dot(_n_3011, _v_3012) < 0.0))
{
(_n_3011 = (-_n_3011));
}
float3 sbd3 = {0, 0, 0};
if (gl_FrontFacing)
{
(sbd3 = _uFront);
}
else
{
(sbd3 = _uBack);
}
float3 _base_3013 = sbd3;
float2 _g_3014 = (_vUv * 6.0);
float2 _f_3015 = abs((frac(_g_3014) - 0.5));
float _band_3016 = max((1.0 - smoothstep(0.0799999982, 0.100000001, _f_3015.x)), (1.0 - smoothstep(0.0799999982, 0.100000001, _f_3015.y)));
float2 _f2_3017 = abs((frac(((_g_3014 * 2.0) + 0.5)) - 0.5));
float _pin_3018 = max((1.0 - smoothstep(0.0149999997, 0.0299999993, _f2_3017.x)), (1.0 - smoothstep(0.0149999997, 0.0299999993, _f2_3017.y)));
float _twill_3019 = (0.930000007 + (0.0700000003 * sin(((_vUv.x + _vUv.y) * 140.0))));
(_base_3013 = lerp(_base_3013, (_base_3013 * 0.449999988), (_band_3016 * 0.699999988)));
(_base_3013 = lerp(_base_3013, float3(0.949999988, 0.850000024, 0.550000012), (_pin_3018 * 0.75)));
(_base_3013 *= _twill_3019);
float _ndl_3020 = dot(_n_3011, _uLight);
float _wrap_3021 = max(((_ndl_3020 + 0.349999994) / 1.35000002), 0.0);
float3 _h_3022 = normalize((_uLight + _v_3012));
float _spec_3023 = (pow(max(dot(_n_3011, _h_3022), 0.0), 32.0) * 0.180000007);
float sbd4 = (1.0 - max(dot(_n_3011, _v_3012), 0.0));
float _sheen_3024 = ((((sbd4 * sbd4) * sbd4) * sbd4) * 0.449999988);
float _sky_3025 = (0.5 + (0.5 * _n_3011.y));
float3 _col_3026 = (((_base_3013 * ((0.180000007 + (0.219999999 * _sky_3025)) + (0.949999988 * _wrap_3021))) + _spec_3023) + (_sheen_3024 * lerp(_base_3013, float3(1.0, 1.0, 1.0), 0.600000024)));
(gl_Color[0] = vec4_ctor(_col_3026, 1.0));
return generateOutput();
}
