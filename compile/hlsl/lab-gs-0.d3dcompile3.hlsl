struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    float4 v0 : TEXCOORD0;
    float2 v1 : TEXCOORD1;
};
#pragma warning( disable: 3081 3556 3557 3571 )
struct _S_0
{
    float3 _p;
    float3 _n;
    float3 _alb;
    float _op;
    int _type;
    float _aux;
    bool _cull;
    float _s;
};
#pragma pack_matrix(row_major)
struct rm__S_0
{
    float3 _p;
    float3 _n;
    float3 _alb;
    float _op;
    int _type;
    float _aux;
    bool _cull;
    float _s;
};
#pragma pack_matrix(column_major)
struct std__S_0
{
    float3 _p;
    float3 _n;
    float3 _alb;
    float _op;
    int _type;
    float _aux;
    bool _cull;
    float _s;
};
#pragma pack_matrix(row_major)
struct std_rm__S_0
{
    float3 _p;
    float3 _n;
    float3 _alb;
    float _op;
    int _type;
    float _aux;
    bool _cull;
    float _s;
};
#pragma pack_matrix(column_major)
struct std_fp__S_0
{
    float3 _p;
    float pad_0;
    float3 _n;
    float pad_1;
    float3 _alb;
    float _op;
    int _type;
    float _aux;
    bool _cull;
    float _s;
};
#pragma pack_matrix(row_major)
struct std_rm_fp__S_0
{
    float3 _p;
    float pad_2;
    float3 _n;
    float pad_3;
    float3 _alb;
    float _op;
    int _type;
    float _aux;
    bool _cull;
    float _s;
};
#pragma pack_matrix(column_major)
float2 vec2_ctor(float x0)
{
    return float2(x0, x0);
}
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
float3 vec3_ctor(float2 x0, float x1)
{
    return float3(x0, x1);
}
float3x3 mat3_ctor(float x0, float x1, float x2, float x3, float x4, float x5, float x6, float x7, float x8)
{
    return float3x3(x0, x1, x2, x3, x4, x5, x6, x7, x8);
}
float3x3 mat3_ctor(float4x4 x0)
{
    return float3x3(x0[0][0], x0[0][1], x0[0][2], x0[1][0], x0[1][1], x0[1][2], x0[2][0], x0[2][1], x0[2][2]);
}
float4 vec4_ctor(float2 x0, float x1, float x2)
{
    return float4(x0, x1, x2);
}
float4 vec4_ctor(float3 x0, float x1)
{
    return float4(x0, x1);
}
int int_ctor(float x0)
{
    return int(x0);
}
int int_ctor_uint(uint x0)
{
    return int(x0);
}
int2 ivec2_ctor(float2 x0)
{
    return int2(x0);
}
int2 ivec2_ctor_int(int x0)
{
    return int2(x0, x0);
}
int2 ivec2_ctor_int_int(int x0, int x1)
{
    return int2(x0, x1);
}
// Uniforms

uniform float _uWorld : register(c0);
uniform float _uGrid : register(c1);
uniform float _uWater : register(c2);
uniform float _uSnowLine : register(c3);
uniform float _uTime : register(c4);
uniform float _uWind : register(c5);
uniform float _uDesert : register(c6);
uniform float2 _uWindDir : register(c7);
uniform int _uSeason : register(c8);
uniform float4x4 _uView : register(c9);
uniform float4x4 _uProj : register(c13);
uniform float4x4 _uLightVP : register(c17);
uniform float2 _uViewport : register(c21);
uniform float _uFocal : register(c22);
uniform float _uFog : register(c23);
uniform float _uNight : register(c24);
uniform float3 _uCamPos : register(c25);
uniform float3 _uLightDir : register(c26);
uniform float3 _uLightCol : register(c27);
uniform float3 _uSkyAmb : register(c28);
uniform float3 _uGroundAmb : register(c29);
uniform float3 _uFogCol : register(c30);
uniform float3 _uZenith : register(c31);
uniform float3 _uHorizon : register(c32);
uniform int _uMode : register(c33);
uniform int _uShadowsOn : register(c34);
static const uint _uData = 0;
static const uint _uHeight = 1;
static const uint _uPaint = 2;
uniform Texture2D<float4> textures2D[3] : register(t0);
uniform SamplerState samplers2D[3] : register(s0);
static const uint _uShadow = 3;
static const uint textureIndexOffset2D_comparison = 3;
static const uint samplerIndexOffset2D_comparison = 3;
uniform Texture2D textures2D_comparison[1] : register(t3);
uniform SamplerComparisonState samplers2D_comparison[1] : register(s3);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes
static float2 _aCorner = {0, 0};
static uint _aIndex = {0};

static float4 gl_Position = float4(0, 0, 0, 0);

// Varyings
static  float4 _vColor = {0, 0, 0, 0};
static  float2 _vPos = {0, 0};

cbuffer DriverConstants : register(b1)
{
    float2 dx_ViewScale  : packoffset(c1);
    float clipControlOrigin : packoffset(c1.z);
    float clipControlZeroToOne : packoffset(c1.w);
    struct SamplerMetadata
    {
        int baseLevel;
        int wrapModes;
        int2 padding;
        int4 intBorderColor;
    };
    SamplerMetadata samplerMetadata[4] : packoffset(c3);
};

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

int2 gl_texture2D_comparisonSize(uint samplerIndex, int lod)
{
    const uint textureIndex = samplerIndex - textureIndexOffset2D_comparison;
    const uint samplerArrayIndex = samplerIndex - samplerIndexOffset2D_comparison;
    int baseLevel = 0;
    uint width; uint height; uint numberOfLevels;
    textures2D_comparison[textureIndex].GetDimensions(baseLevel, width, height, numberOfLevels);
    width = max(width >> lod, 1);
    height = max(height >> lod, 1);
    return int2(width, height);
}

float gl_texture2D_comparisonLod0(uint samplerIndex, float3 t)
{
    const uint textureIndex = samplerIndex - textureIndexOffset2D_comparison;
    const uint samplerArrayIndex = samplerIndex - samplerIndexOffset2D_comparison;
    return textures2D_comparison[textureIndex].SampleCmpLevelZero(samplers2D_comparison[samplerArrayIndex], float2(t.x, t.y), t.z);
}

float mod_emu(float x, float y)
{
    return x - y * floor(x / y);
}


float3x3 outerProduct_emu(in float3 c, in float3 r)
{
    return mul(float3x1(r), float1x3(c));
}


;
float4 f_F_int_int(in int _i_3014, in int _k_3015)
{
int _t_3016 = ((_i_3014 * 5) + _k_3015);
return gl_texture2DFetch(_uData, ivec2_ctor_int_int((_t_3016 % 2048), (_t_3016 / 2048)), 0);
}
float f_hAt(in float2 _xz_3018)
{
float2 _g_3019 = clamp((((_xz_3018 / _uWorld) + 0.5) * (_uGrid - 1.0)), float2(0.0, 0.0), vec2_ctor((_uGrid - 1.00100005)));
int2 _i_3020 = ivec2_ctor(floor(_g_3019));
float2 _f_3021 = frac(_g_3019);
float _a_3022 = gl_texture2DFetch(_uHeight, _i_3020, 0).x;
float _b_3023 = gl_texture2DFetch(_uHeight, (_i_3020 + int2(1, 0)), 0).x;
float _c_3024 = gl_texture2DFetch(_uHeight, (_i_3020 + int2(0, 1)), 0).x;
float _d_3025 = gl_texture2DFetch(_uHeight, (_i_3020 + int2(1, 1)), 0).x;
return lerp(lerp(_a_3022, _b_3023, _f_3021.x), lerp(_c_3024, _d_3025, _f_3021.x), _f_3021.y);
}
float3 f_nAt(in float2 _xz_3027)
{
float _e_3028 = (_uWorld / (_uGrid - 1.0));
float _hx_3029 = (f_hAt((_xz_3027 + vec2_ctor(_e_3028, 0.0))) - f_hAt((_xz_3027 - vec2_ctor(_e_3028, 0.0))));
float _hz_3030 = (f_hAt((_xz_3027 + vec2_ctor(0.0, _e_3028))) - f_hAt((_xz_3027 - vec2_ctor(0.0, _e_3028))));
return normalize(vec3_ctor((-_hx_3029), (2.0 * _e_3028), (-_hz_3030)));
}
int f_paintAt(in float2 _xz_3032)
{
int2 _i_3033 = clamp(ivec2_ctor(((((_xz_3032 / _uWorld) + 0.5) * (_uGrid - 1.0)) + 0.5)), int2(0, 0), ivec2_ctor_int((int_ctor(_uGrid) - 1)));
return int_ctor(((gl_texture2DFetch(_uPaint, _i_3033, 0).x * 255.0) + 0.5));
}
int f_biomeAt(in float2 _xz_3035, in float _h_3036, in float3 _n_3037, in float _aux_3038)
{
int _b_3039 = f_paintAt(_xz_3035);
if ((_b_3039 != 0))
{
return _b_3039;
}
if ((_h_3036 < ((_uWater + 0.449999988) + (_aux_3038 * 0.300000012))))
{
return 3;
}
if ((_n_3037.y < 0.74000001))
{
return 5;
}
if ((_h_3036 > (_uSnowLine + (_aux_3038 * 2.0))))
{
return 4;
}
int sc4a = {0};
if ((_uDesert > 0.5))
{
(sc4a = 3);
}
else
{
(sc4a = 1);
}
return sc4a;
}
float f_lum(in float3 _c_3041)
{
return dot(_c_3041, float3(0.298999995, 0.587000012, 0.114));
}
_S_0 f_load_int(in int _i_3044)
{
_S_0 _s_3045 = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
float4 _t0_3046 = f_F_int_int(_i_3044, 0);
float4 _t1_3047 = f_F_int_int(_i_3044, 1);
float4 _t2_3048 = f_F_int_int(_i_3044, 2);
float4 _t3_3049 = f_F_int_int(_i_3044, 3);
float4 _t4_3050 = f_F_int_int(_i_3044, 4);
(_s_3045._type = int_ctor((_t4_3050.z + 0.5)));
(_s_3045._aux = _t4_3050.w);
(_s_3045._op = _t0_3046.w);
(_s_3045._cull = (_s_3045._op <= 0.0));
(_s_3045._p = _t0_3046.xyz);
(_s_3045._n = _t3_3049.yzw);
(_s_3045._alb = vec3_ctor(_t2_3048.z, _t2_3048.w, _t3_3049.x));
(_s_3045._s = _t1_3047.x);
if (_s_3045._cull)
{
return _s_3045;
}
if ((_s_3045._type == 6))
{
(_s_3045._p.y = (_uWater + ((0.0399999991 * sin(((_s_3045._p.x * 0.899999976) + (_uTime * 1.29999995)))) * cos(((_s_3045._p.z * 0.699999988) + (_uTime * 1.10000002))))));
if ((f_hAt(_s_3045._p.xz) > (_uWater + 0.0199999996)))
{
(_s_3045._cull = true);
}
return _s_3045;
}
if ((_s_3045._type == 7))
{
(_s_3045._p.x = (mod_emu(((_s_3045._p.x + ((_uTime * 0.699999988) * (0.300000012 + _uWind))) + _uWorld), (2.0 * _uWorld)) - _uWorld));
return _s_3045;
}
if ((_s_3045._type >= 10))
{
return _s_3045;
}
float _hb_3051 = f_hAt(_t4_3050.xy);
float _rel_3052 = _s_3045._p.y;
(_s_3045._p.y += _hb_3051);
float _sway_3053 = {0.0};
bool sc4b = (_s_3045._type == 1);
if ((!sc4b))
{
(sc4b = (_s_3045._type == 9));
}
if (sc4b)
{
(_sway_3053 = (0.219999999 * _rel_3052));
}
else
{
bool sc4d = (_s_3045._type == 2);
if ((!sc4d))
{
(sc4d = (_s_3045._type == 3));
}
bool sc4c = sc4d;
if ((!sc4c))
{
(sc4c = (_s_3045._type == 4));
}
if (sc4c)
{
(_sway_3053 = (0.0120000001 * _rel_3052));
}
}
if ((_sway_3053 > 0.0))
{
float _ph_3054 = (((_uTime * 1.89999998) + (_t4_3050.x * 0.310000002)) + (_t4_3050.y * 0.230000004));
float _w_3055 = ((0.600000024 * sin((_ph_3054 + (_s_3045._aux * 6.28299999)))) + (0.400000006 * sin(((_ph_3054 * 2.70000005) + 1.29999995))));
(_s_3045._p.xz += (((_uWindDir * ((_w_3055 * 0.699999988) + 0.5)) * _sway_3053) * _uWind));
}
bool sc4e = (_s_3045._type == 1);
if ((!sc4e))
{
(sc4e = (_s_3045._type == 9));
}
if (sc4e)
{
float3 _gn_3056 = f_nAt(_t4_3050.xy);
int _b_3057 = f_biomeAt(_t4_3050.xy, _hb_3051, _gn_3056, 0.5);
bool sc50 = (_b_3057 != 1);
if (sc50)
{
(sc50 = (_b_3057 != 2));
}
bool sc4f = sc50;
if ((!sc4f))
{
(sc4f = (_hb_3051 < (_uWater + 0.25)));
}
if (sc4f)
{
(_s_3045._cull = true);
}
bool sc51 = (_s_3045._type == 9);
if (sc51)
{
bool sc52 = (_uSeason == 3);
if ((!sc52))
{
bool sc53 = (_uSeason == 2);
if (sc53)
{
(sc53 = (_s_3045._aux < 0.699999988));
}
(sc52 = sc53);
}
(sc51 = sc52);
}
if (sc51)
{
(_s_3045._cull = true);
}
if ((_s_3045._type == 1))
{
if ((_uSeason == 0))
{
(_s_3045._alb = lerp(_s_3045._alb, float3(0.419999987, 0.620000005, 0.200000003), 0.349999994));
}
else
{
if ((_uSeason == 2))
{
(_s_3045._alb = lerp(_s_3045._alb, float3(0.620000005, 0.519999981, 0.219999999), 0.550000012));
}
else
{
if ((_uSeason == 3))
{
(_s_3045._alb = lerp(_s_3045._alb, float3(0.899999976, 0.920000017, 0.949999988), 0.800000012));
(_s_3045._op *= 0.449999988);
}
}
}
}
}
else
{
if ((_s_3045._type == 2))
{
float _k_3058 = (f_lum(_s_3045._alb) / 0.300000012);
if ((_uSeason == 0))
{
(_s_3045._alb = lerp(_s_3045._alb, (float3(0.419999987, 0.680000007, 0.219999999) * _k_3058), 0.550000012));
}
else
{
if ((_uSeason == 2))
{
float3 sc54 = {0, 0, 0};
if ((_s_3045._aux < 0.349999994))
{
(sc54 = float3(0.860000014, 0.319999993, 0.0599999987));
}
else
{
float3 sc55 = {0, 0, 0};
if ((_s_3045._aux < 0.699999988))
{
(sc55 = float3(0.949999988, 0.660000026, 0.100000001));
}
else
{
(sc55 = float3(0.600000024, 0.119999997, 0.0599999987));
}
(sc54 = sc55);
}
(_s_3045._alb = ((sc54 * _k_3058) * 0.800000012));
}
else
{
if ((_uSeason == 3))
{
if ((_s_3045._aux < 0.930000007))
{
(_s_3045._cull = true);
}
else
{
(_s_3045._alb = (float3(0.5, 0.379999995, 0.25) * _k_3058));
}
}
}
}
}
else
{
if ((_s_3045._type == 4))
{
float _k_3059 = (f_lum(_s_3045._alb) / 0.800000012);
if ((_uSeason == 1))
{
(_s_3045._alb = ((float3(0.219999999, 0.449999988, 0.140000001) * _k_3059) * 1.29999995));
}
else
{
if ((_uSeason == 2))
{
(_s_3045._alb = (float3(0.850000024, 0.349999994, 0.119999997) * _k_3059));
}
else
{
if ((_uSeason == 3))
{
(_s_3045._cull = true);
}
}
}
}
else
{
bool sc57 = (_s_3045._type == 3);
if (sc57)
{
(sc57 = (_uSeason == 3));
}
bool sc56 = sc57;
if (sc56)
{
(sc56 = (_s_3045._n.y > 0.25));
}
if (sc56)
{
(_s_3045._alb = lerp(_s_3045._alb, float3(0.899999976, 0.930000007, 0.970000029), 0.699999988));
}
else
{
bool sc59 = (_s_3045._type == 5);
if (sc59)
{
(sc59 = (_uSeason == 3));
}
bool sc58 = sc59;
if (sc58)
{
(sc58 = (_s_3045._n.y > 0.550000012));
}
if (sc58)
{
(_s_3045._alb = lerp(_s_3045._alb, float3(0.920000017, 0.939999998, 0.980000019), 0.850000024));
}
}
}
}
}
return _s_3045;
}
float3 f_terrainAlbedo(in float2 _xz_3061, in float _h_3062, in float3 _n_3063, in float _aux_3064, in float _moist_3065)
{
int _b_3066 = f_biomeAt(_xz_3061, _h_3062, _n_3063, _aux_3064);
float3 _grass_3067 = (lerp(float3(0.200000003, 0.349999994, 0.100000001), float3(0.400000006, 0.5, 0.159999996), _moist_3065) * (0.850000024 + (0.300000012 * _aux_3064)));
if ((_uSeason == 0))
{
(_grass_3067 = lerp(_grass_3067, float3(0.360000014, 0.550000012, 0.180000007), 0.400000006));
}
else
{
if ((_uSeason == 2))
{
(_grass_3067 = lerp(_grass_3067, float3(0.550000012, 0.449999988, 0.200000003), 0.5));
}
}
float3 _c_3068 = _grass_3067;
if ((_b_3066 == 2))
{
(_c_3068 = _grass_3067);
if ((_aux_3064 > 0.819999993))
{
float3 sc5a = {0, 0, 0};
if ((_aux_3064 > 0.939999998))
{
(sc5a = float3(0.949999988, 0.899999976, 0.949999988));
}
else
{
float3 sc5b = {0, 0, 0};
if ((_aux_3064 > 0.879999995))
{
(sc5b = float3(0.949999988, 0.819999993, 0.200000003));
}
else
{
(sc5b = float3(0.649999976, 0.400000006, 0.850000024));
}
(sc5a = sc5b);
}
(_c_3068 = sc5a);
}
}
else
{
if ((_b_3066 == 3))
{
(_c_3068 = (float3(0.779999971, 0.699999988, 0.519999981) * (0.899999976 + (0.200000003 * _aux_3064))));
}
else
{
if ((_b_3066 == 4))
{
(_c_3068 = float3(0.920000017, 0.939999998, 0.980000019));
}
else
{
if ((_b_3066 == 5))
{
(_c_3068 = lerp(float3(0.360000014, 0.340000004, 0.319999993), float3(0.519999981, 0.5, 0.469999999), _aux_3064));
}
else
{
if ((_b_3066 == 6))
{
(_c_3068 = (float3(0.449999988, 0.349999994, 0.239999995) * (0.850000024 + (0.300000012 * _aux_3064))));
}
}
}
}
}
bool sc5e = (_uSeason == 3);
if (sc5e)
{
(sc5e = (_b_3066 != 3));
}
bool sc5d = sc5e;
if (sc5d)
{
(sc5d = (_n_3063.y > 0.550000012));
}
bool sc5c = sc5d;
if (sc5c)
{
(sc5c = (_h_3062 > (_uWater + 0.100000001)));
}
if (sc5c)
{
(_c_3068 = lerp(_c_3068, float3(0.930000007, 0.949999988, 0.980000019), 0.899999976));
}
if ((_h_3062 < _uWater))
{
(_c_3068 *= float3(0.600000024, 0.720000029, 0.75));
}
return _c_3068;
}
float f_shadowAt(in float3 _p_3092, in float3 _n_3093)
{
if ((_uShadowsOn == 0))
{
return 1.0;
}
float4 _c_3094 = mul(transpose(_uLightVP), vec4_ctor(((_p_3092 + (_n_3093 * 0.150000006)) + (_uLightDir * 0.0799999982)), 1.0));
float3 _q_3095 = (((_c_3094.xyz / _c_3094.w) * 0.5) + 0.5);
bool sc62 = (_q_3095.x < 0.0);
if ((!sc62))
{
(sc62 = (_q_3095.y < 0.0));
}
bool sc61 = sc62;
if ((!sc61))
{
(sc61 = (_q_3095.x > 1.0));
}
bool sc60 = sc61;
if ((!sc60))
{
(sc60 = (_q_3095.y > 1.0));
}
bool sc5f = sc60;
if ((!sc5f))
{
(sc5f = (_q_3095.z > 1.0));
}
if (sc5f)
{
return 1.0;
}
float2 _tx_3096 = (1.0 / vec2_ctor_int2(gl_texture2D_comparisonSize(_uShadow, 0)));
float _s_3097 = gl_texture2D_comparisonLod0(_uShadow, vec3_ctor((_q_3095.xy + (float2(-0.699999988, -0.699999988) * _tx_3096)), (_q_3095.z - 0.00150000001)));
(_s_3097 += gl_texture2D_comparisonLod0(_uShadow, vec3_ctor((_q_3095.xy + (float2(0.699999988, -0.699999988) * _tx_3096)), (_q_3095.z - 0.00150000001))));
(_s_3097 += gl_texture2D_comparisonLod0(_uShadow, vec3_ctor((_q_3095.xy + (float2(-0.699999988, 0.699999988) * _tx_3096)), (_q_3095.z - 0.00150000001))));
(_s_3097 += gl_texture2D_comparisonLod0(_uShadow, vec3_ctor((_q_3095.xy + (float2(0.699999988, 0.699999988) * _tx_3096)), (_q_3095.z - 0.00150000001))));
return (_s_3097 * 0.25);
}
void f_cull()
{
(gl_Position = float4(0.0, 0.0, 2.0, 1.0));
}
struct VS_INPUT
{
    float2 _aCorner : TEXCOORD0;
    int _aIndex : TEXCOORD1;
};

void initAttributes(VS_INPUT input)
{
    _aCorner = input._aCorner;
    _aIndex = input._aIndex;
}


VS_OUTPUT generateOutput(VS_INPUT input)
{
    VS_OUTPUT output;
    output.gl_Position = gl_Position;
    output.dx_Position.x = gl_Position.x;
    output.dx_Position.y = clipControlOrigin * gl_Position.y;
    if (clipControlZeroToOne)
    {
        output.dx_Position.z = gl_Position.z;
    } else {
        output.dx_Position.z = (gl_Position.z + gl_Position.w) * 0.5;
    }
    output.dx_Position.w = gl_Position.w;
    output.v0 = _vColor;
    output.v1 = _vPos;

    return output;
}

VS_OUTPUT main(VS_INPUT input){
    initAttributes(input);

(gl_Position = float4(0.0, 0.0, 0.0, 0.0));
int _i_3100 = int_ctor_uint(_aIndex);
_S_0 _s_3101 = f_load_int(_i_3100);
if (_s_3101._cull)
{
f_cull();
return generateOutput(input);
}
float4 _cam_3102 = mul(transpose(_uView), vec4_ctor(_s_3101._p, 1.0));
float4 _clip_3103 = mul(transpose(_uProj), _cam_3102);
float _lim_3104 = (1.25 * _clip_3103.w);
bool sc64 = (_cam_3102.z > -0.349999994);
if ((!sc64))
{
(sc64 = (abs(_clip_3103.x) > _lim_3104));
}
bool sc63 = sc64;
if ((!sc63))
{
(sc63 = (abs(_clip_3103.y) > _lim_3104));
}
if (sc63)
{
f_cull();
return generateOutput(input);
}
float3x3 _Sig_3105 = {0, 0, 0, 0, 0, 0, 0, 0, 0};
if ((_s_3101._type == 0))
{
(_s_3101._n = f_nAt(_s_3101._p.xz));
float3 sc65 = {0, 0, 0};
if ((abs(_s_3101._n.z) < 0.899999976))
{
(sc65 = float3(0.0, 0.0, 1.0));
}
else
{
(sc65 = float3(1.0, 0.0, 0.0));
}
float3 _t_3106 = normalize(cross(sc65, _s_3101._n));
float3 _b_3107 = cross(_s_3101._n, _t_3106);
float _ss_3108 = (_s_3101._s * _s_3101._s);
float _sn_3109 = (0.00159999996 * _ss_3108);
(_Sig_3105 = ((_ss_3108 * (outerProduct_emu(_t_3106, _t_3106) + outerProduct_emu(_b_3107, _b_3107))) + (_sn_3109 * outerProduct_emu(_s_3101._n, _s_3101._n))));
(_s_3101._alb = f_terrainAlbedo(_s_3101._p.xz, _s_3101._p.y, _s_3101._n, _s_3101._aux, _s_3101._alb.x));
}
else
{
float4 _t1_3110 = f_F_int_int(_i_3100, 1);
float4 _t2_3111 = f_F_int_int(_i_3100, 2);
(_Sig_3105 = mat3_ctor(_t1_3110.x, _t1_3110.y, _t1_3110.z, _t1_3110.y, _t1_3110.w, _t2_3111.x, _t1_3110.z, _t2_3111.x, _t2_3111.y));
}
float3 _V_3112 = normalize((_uCamPos - _s_3101._p));
float _dist_3113 = length((_uCamPos - _s_3101._p));
float3 _col_3114 = {0, 0, 0};
if ((_s_3101._type == 7))
{
(_col_3114 = (lerp(((_uSkyAmb * 1.39999998) + (_uLightCol * 0.600000024)), _uHorizon, 0.25) * _s_3101._alb));
}
else
{
if ((_s_3101._type == 11))
{
(_col_3114 = _s_3101._alb);
}
else
{
if ((_s_3101._type == 10))
{
(_col_3114 = lerp((_s_3101._alb * (_uSkyAmb + (_uLightCol * 0.349999994))), _uHorizon, 0.550000012));
}
else
{
if ((_s_3101._type == 6))
{
float _depth_3115 = (_uWater - f_hAt(_s_3101._p.xz));
float3 _wn_3116 = normalize(vec3_ctor(((0.119999997 * sin(((_s_3101._p.x * 1.70000005) + (_uTime * 1.60000002)))) * _uWind), 1.0, ((0.119999997 * cos(((_s_3101._p.z * 1.29999995) + (_uTime * 1.20000005)))) * _uWind)));
float sc6e = (1.0 - max(dot(_wn_3116, _V_3112), 0.0));
float _fres_3117 = (0.0299999993 + (0.970000029 * ((((sc6e * sc6e) * sc6e) * sc6e) * sc6e)));
float3 _r_3118 = reflect((-_V_3112), _wn_3116);
float3 _refl_3119 = lerp(_uHorizon, _uZenith, clamp(_r_3118.y, 0.0, 1.0));
float _sh_3120 = f_shadowAt(_s_3101._p, float3(0.0, 1.0, 0.0));
float3 _body_3121 = (lerp(float3(0.119999997, 0.379999995, 0.379999995), float3(0.0199999996, 0.100000001, 0.159999996), clamp((_depth_3115 / 3.0), 0.0, 1.0)) * (_uSkyAmb + ((_uLightCol * 0.400000006) * _sh_3120)));
float _spec_3122 = ((pow(max(dot(_r_3118, _uLightDir), 0.0), 160.0) * 5.0) * _sh_3120);
(_col_3114 = (lerp(_body_3121, _refl_3119, _fres_3117) + (_uLightCol * _spec_3122)));
float _foam_3123 = (1.0 - smoothstep(0.0, 0.180000007, _depth_3115));
(_col_3114 = lerp(_col_3114, (float3(0.899999976, 0.899999976, 0.899999976) * (_uSkyAmb + (_uLightCol * 0.600000024))), (_foam_3123 * 0.600000024)));
(_s_3101._op = clamp((0.449999988 + (_depth_3115 * 0.600000024)), 0.449999988, 0.930000007));
}
else
{
float3 _amb_3124 = lerp(_uGroundAmb, _uSkyAmb, ((_s_3101._n.y * 0.5) + 0.5));
float _ndl_3125 = dot(_s_3101._n, _uLightDir);
bool sc69 = (_s_3101._type == 1);
if ((!sc69))
{
(sc69 = (_s_3101._type == 2));
}
bool sc68 = sc69;
if ((!sc68))
{
(sc68 = (_s_3101._type == 3));
}
bool sc67 = sc68;
if ((!sc67))
{
(sc67 = (_s_3101._type == 4));
}
bool sc66 = sc67;
if ((!sc66))
{
(sc66 = (_s_3101._type == 9));
}
bool _foliage_3126 = sc66;
float sc6a = {0};
if (_foliage_3126)
{
(sc6a = clamp(((_ndl_3125 + 0.550000012) / 1.54999995), 0.0, 1.0));
}
else
{
(sc6a = max(_ndl_3125, 0.0));
}
float _dif_3127 = sc6a;
float sc6b = {0};
if ((_uLightDir.y > -0.0500000007))
{
(sc6b = f_shadowAt(_s_3101._p, _s_3101._n));
}
else
{
(sc6b = 1.0);
}
float _sh_3128 = sc6b;
(_col_3114 = (_s_3101._alb * (_amb_3124 + ((_uLightCol * _dif_3127) * _sh_3128))));
if (_foliage_3126)
{
float sc6f = max(dot((-_V_3112), _uLightDir), 0.0);
(_col_3114 += ((((_s_3101._alb * _uLightCol) * 0.25) * (((sc6f * sc6f) * sc6f) * sc6f)) * _sh_3128));
}
if ((_s_3101._type == 8))
{
(_col_3114 = lerp((float3(0.119999997, 0.150000006, 0.200000003) * (_amb_3124 + (_uLightCol * 0.300000012))), (_s_3101._alb * 1.60000002), _uNight));
}
}
}
}
}
if ((_s_3101._type < 10))
{
(_col_3114 = lerp(_col_3114, _uFogCol, (1.0 - exp(((-_dist_3113) * _uFog)))));
}
if ((_uMode == 3))
{
(_col_3114 = lerp(float3(0.899999976, 0.949999988, 1.0), float3(0.0500000007, 0.100000001, 0.300000012), clamp((_dist_3113 / 80.0), 0.0, 1.0)));
}
float _z_3129 = (-_cam_3102.z);
float3x3 _J_3130 = mat3_ctor((_uFocal / _z_3129), 0.0, 0.0, 0.0, (_uFocal / _z_3129), 0.0, ((_uFocal * _cam_3102.x) / (_z_3129 * _z_3129)), ((_uFocal * _cam_3102.y) / (_z_3129 * _z_3129)), 0.0);
float3x3 _T_3131 = transpose(mul(transpose(_J_3130), transpose(mat3_ctor(_uView))));
float3x3 _C_3132 = transpose(mul(transpose(transpose(mul(transpose(_T_3131), transpose(_Sig_3105)))), transpose(transpose(_T_3131))));
float _a_3133 = (_C_3132[0][0] + 0.300000012);
float _bb_3134 = _C_3132[0][1];
float _c_3135 = (_C_3132[1][1] + 0.300000012);
float _mid_3136 = (0.5 * (_a_3133 + _c_3135));
float _rad_3137 = length(vec2_ctor((0.5 * (_a_3133 - _c_3135)), _bb_3134));
float _l1_3138 = (_mid_3136 + _rad_3137);
float _l2_3139 = max((_mid_3136 - _rad_3137), 0.100000001);
float2 sc6c = {0, 0};
if ((abs(_bb_3134) > 1.00000001e-07))
{
(sc6c = normalize(vec2_ctor(_bb_3134, (_l1_3138 - _a_3133))));
}
else
{
float2 sc6d = {0, 0};
if ((_a_3133 >= _c_3135))
{
(sc6d = float2(1.0, 0.0));
}
else
{
(sc6d = float2(0.0, 1.0));
}
(sc6c = sc6d);
}
float2 _v1_3140 = sc6c;
float2 _v2_3141 = vec2_ctor((-_v1_3140.y), _v1_3140.x);
float _r1_3142 = min((3.0 * sqrt(_l1_3138)), 900.0);
float _r2_3143 = min((3.0 * sqrt(_l2_3139)), 900.0);
if ((_uMode == 2))
{
(_r1_3142 = 1.5);
(_r2_3143 = 1.5);
}
float2 _off_3144 = (((_aCorner.x * _r1_3142) * _v1_3140) + ((_aCorner.y * _r2_3143) * _v2_3141));
(gl_Position = (_clip_3103 + vec4_ctor((((_off_3144 / _uViewport) * 2.0) * _clip_3103.w), 0.0, 0.0)));
(_vPos = (_aCorner * 3.0));
(_vColor = vec4_ctor(max(_col_3114, float3(0.0, 0.0, 0.0)), _s_3101._op));
return generateOutput(input);
}
