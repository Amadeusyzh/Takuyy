// INITIAL HLSL BEGIN

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
float3 vec3_ctor(float x0, float x1, float x2)
{
    return float3(x0, x1, x2);
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
uniform float4x4 _uLightVP : register(c9);
uniform float _uPxPerM : register(c13);
static const uint _uData = 0;
static const uint _uHeight = 1;
static const uint _uPaint = 2;
uniform Texture2D<float4> textures2D[3] : register(t0);
uniform SamplerState samplers2D[3] : register(s0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes
static uint _aIndex = {0};

static float4 gl_Position = float4(0, 0, 0, 0);
static float gl_PointSize = float(1);

// Varyings

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
    SamplerMetadata samplerMetadata[3] : packoffset(c3);
};

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_POINT_SIZE
float mod_emu(float x, float y)
{
    return x - y * floor(x / y);
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
int sc07 = {0};
if ((_uDesert > 0.5))
{
(sc07 = 3);
}
else
{
(sc07 = 1);
}
return sc07;
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
bool sc08 = (_s_3045._type == 1);
if ((!sc08))
{
(sc08 = (_s_3045._type == 9));
}
if (sc08)
{
(_sway_3053 = (0.219999999 * _rel_3052));
}
else
{
bool sc0a = (_s_3045._type == 2);
if ((!sc0a))
{
(sc0a = (_s_3045._type == 3));
}
bool sc09 = sc0a;
if ((!sc09))
{
(sc09 = (_s_3045._type == 4));
}
if (sc09)
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
bool sc0b = (_s_3045._type == 1);
if ((!sc0b))
{
(sc0b = (_s_3045._type == 9));
}
if (sc0b)
{
float3 _gn_3056 = f_nAt(_t4_3050.xy);
int _b_3057 = f_biomeAt(_t4_3050.xy, _hb_3051, _gn_3056, 0.5);
bool sc0d = (_b_3057 != 1);
if (sc0d)
{
(sc0d = (_b_3057 != 2));
}
bool sc0c = sc0d;
if ((!sc0c))
{
(sc0c = (_hb_3051 < (_uWater + 0.25)));
}
if (sc0c)
{
(_s_3045._cull = true);
}
bool sc0e = (_s_3045._type == 9);
if (sc0e)
{
bool sc0f = (_uSeason == 3);
if ((!sc0f))
{
bool sc10 = (_uSeason == 2);
if (sc10)
{
(sc10 = (_s_3045._aux < 0.699999988));
}
(sc0f = sc10);
}
(sc0e = sc0f);
}
if (sc0e)
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
float3 sc11 = {0, 0, 0};
if ((_s_3045._aux < 0.349999994))
{
(sc11 = float3(0.860000014, 0.319999993, 0.0599999987));
}
else
{
float3 sc12 = {0, 0, 0};
if ((_s_3045._aux < 0.699999988))
{
(sc12 = float3(0.949999988, 0.660000026, 0.100000001));
}
else
{
(sc12 = float3(0.600000024, 0.119999997, 0.0599999987));
}
(sc11 = sc12);
}
(_s_3045._alb = ((sc11 * _k_3058) * 0.800000012));
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
bool sc14 = (_s_3045._type == 3);
if (sc14)
{
(sc14 = (_uSeason == 3));
}
bool sc13 = sc14;
if (sc13)
{
(sc13 = (_s_3045._n.y > 0.25));
}
if (sc13)
{
(_s_3045._alb = lerp(_s_3045._alb, float3(0.899999976, 0.930000007, 0.970000029), 0.699999988));
}
else
{
bool sc16 = (_s_3045._type == 5);
if (sc16)
{
(sc16 = (_uSeason == 3));
}
bool sc15 = sc16;
if (sc15)
{
(sc15 = (_s_3045._n.y > 0.550000012));
}
if (sc15)
{
(_s_3045._alb = lerp(_s_3045._alb, float3(0.920000017, 0.939999998, 0.980000019), 0.850000024));
}
}
}
}
}
return _s_3045;
}
@@ VERTEX ATTRIBUTES @@

@@ VERTEX OUTPUT @@

VS_OUTPUT main(VS_INPUT input){
@@ MAIN PROLOGUE @@
(gl_Position = float4(0.0, 0.0, 0.0, 0.0));
int _i_3073 = int_ctor_uint(_aIndex);
_S_0 _s_3074 = f_load_int(_i_3073);
bool sc1c = _s_3074._cull;
if ((!sc1c))
{
(sc1c = (_s_3074._type == 1));
}
bool sc1b = sc1c;
if ((!sc1b))
{
(sc1b = (_s_3074._type == 6));
}
bool sc1a = sc1b;
if ((!sc1a))
{
(sc1a = (_s_3074._type == 7));
}
bool sc19 = sc1a;
if ((!sc19))
{
(sc19 = (_s_3074._type == 9));
}
bool sc18 = sc19;
if ((!sc18))
{
(sc18 = (_s_3074._type == 10));
}
bool sc17 = sc18;
if ((!sc17))
{
(sc17 = (_s_3074._op < 0.300000012));
}
if (sc17)
{
(gl_Position = float4(0.0, 0.0, 2.0, 1.0));
(gl_PointSize = 1.0);
return generateOutput(input);
}
float _r_3075 = _s_3074._s;
if ((_s_3074._type != 0))
{
float4 _t1_3076 = f_F_int_int(_i_3073, 1);
float4 _t2_3077 = f_F_int_int(_i_3073, 2);
(_r_3075 = sqrt(max(_t1_3076.x, max(_t1_3076.w, _t2_3077.y))));
}
(gl_Position = mul(transpose(_uLightVP), vec4_ctor(_s_3074._p, 1.0)));
(gl_PointSize = clamp(((2.20000005 * _r_3075) * _uPxPerM), 1.0, 48.0));
return generateOutput(input);
}

// INITIAL HLSL END


// COMPILER INPUT HLSL BEGIN

struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float gl_PointSize : PSIZE;
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
float3 vec3_ctor(float x0, float x1, float x2)
{
    return float3(x0, x1, x2);
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
uniform float4x4 _uLightVP : register(c9);
uniform float _uPxPerM : register(c13);
static const uint _uData = 0;
static const uint _uHeight = 1;
static const uint _uPaint = 2;
uniform Texture2D<float4> textures2D[3] : register(t0);
uniform SamplerState samplers2D[3] : register(s0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes
static uint _aIndex = {0};

static float4 gl_Position = float4(0, 0, 0, 0);
static float gl_PointSize = float(1);

// Varyings

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
    SamplerMetadata samplerMetadata[3] : packoffset(c3);
};

float4 gl_texture2DFetch(uint samplerIndex, int2 t, int mip)
{
    return textures2D[samplerIndex].Load(int3(t.x, t.y, mip));
}

#define GL_USES_POINT_SIZE
float mod_emu(float x, float y)
{
    return x - y * floor(x / y);
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
int sc07 = {0};
if ((_uDesert > 0.5))
{
(sc07 = 3);
}
else
{
(sc07 = 1);
}
return sc07;
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
bool sc08 = (_s_3045._type == 1);
if ((!sc08))
{
(sc08 = (_s_3045._type == 9));
}
if (sc08)
{
(_sway_3053 = (0.219999999 * _rel_3052));
}
else
{
bool sc0a = (_s_3045._type == 2);
if ((!sc0a))
{
(sc0a = (_s_3045._type == 3));
}
bool sc09 = sc0a;
if ((!sc09))
{
(sc09 = (_s_3045._type == 4));
}
if (sc09)
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
bool sc0b = (_s_3045._type == 1);
if ((!sc0b))
{
(sc0b = (_s_3045._type == 9));
}
if (sc0b)
{
float3 _gn_3056 = f_nAt(_t4_3050.xy);
int _b_3057 = f_biomeAt(_t4_3050.xy, _hb_3051, _gn_3056, 0.5);
bool sc0d = (_b_3057 != 1);
if (sc0d)
{
(sc0d = (_b_3057 != 2));
}
bool sc0c = sc0d;
if ((!sc0c))
{
(sc0c = (_hb_3051 < (_uWater + 0.25)));
}
if (sc0c)
{
(_s_3045._cull = true);
}
bool sc0e = (_s_3045._type == 9);
if (sc0e)
{
bool sc0f = (_uSeason == 3);
if ((!sc0f))
{
bool sc10 = (_uSeason == 2);
if (sc10)
{
(sc10 = (_s_3045._aux < 0.699999988));
}
(sc0f = sc10);
}
(sc0e = sc0f);
}
if (sc0e)
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
float3 sc11 = {0, 0, 0};
if ((_s_3045._aux < 0.349999994))
{
(sc11 = float3(0.860000014, 0.319999993, 0.0599999987));
}
else
{
float3 sc12 = {0, 0, 0};
if ((_s_3045._aux < 0.699999988))
{
(sc12 = float3(0.949999988, 0.660000026, 0.100000001));
}
else
{
(sc12 = float3(0.600000024, 0.119999997, 0.0599999987));
}
(sc11 = sc12);
}
(_s_3045._alb = ((sc11 * _k_3058) * 0.800000012));
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
bool sc14 = (_s_3045._type == 3);
if (sc14)
{
(sc14 = (_uSeason == 3));
}
bool sc13 = sc14;
if (sc13)
{
(sc13 = (_s_3045._n.y > 0.25));
}
if (sc13)
{
(_s_3045._alb = lerp(_s_3045._alb, float3(0.899999976, 0.930000007, 0.970000029), 0.699999988));
}
else
{
bool sc16 = (_s_3045._type == 5);
if (sc16)
{
(sc16 = (_uSeason == 3));
}
bool sc15 = sc16;
if (sc15)
{
(sc15 = (_s_3045._n.y > 0.550000012));
}
if (sc15)
{
(_s_3045._alb = lerp(_s_3045._alb, float3(0.920000017, 0.939999998, 0.980000019), 0.850000024));
}
}
}
}
}
return _s_3045;
}
struct VS_INPUT
{
    int _aIndex : TEXCOORD0;
};

void initAttributes(VS_INPUT input)
{
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
    output.gl_PointSize = gl_PointSize;

    return output;
}

VS_OUTPUT main(VS_INPUT input){
    initAttributes(input);

(gl_Position = float4(0.0, 0.0, 0.0, 0.0));
int _i_3073 = int_ctor_uint(_aIndex);
_S_0 _s_3074 = f_load_int(_i_3073);
bool sc1c = _s_3074._cull;
if ((!sc1c))
{
(sc1c = (_s_3074._type == 1));
}
bool sc1b = sc1c;
if ((!sc1b))
{
(sc1b = (_s_3074._type == 6));
}
bool sc1a = sc1b;
if ((!sc1a))
{
(sc1a = (_s_3074._type == 7));
}
bool sc19 = sc1a;
if ((!sc19))
{
(sc19 = (_s_3074._type == 9));
}
bool sc18 = sc19;
if ((!sc18))
{
(sc18 = (_s_3074._type == 10));
}
bool sc17 = sc18;
if ((!sc17))
{
(sc17 = (_s_3074._op < 0.300000012));
}
if (sc17)
{
(gl_Position = float4(0.0, 0.0, 2.0, 1.0));
(gl_PointSize = 1.0);
return generateOutput(input);
}
float _r_3075 = _s_3074._s;
if ((_s_3074._type != 0))
{
float4 _t1_3076 = f_F_int_int(_i_3073, 1);
float4 _t2_3077 = f_F_int_int(_i_3073, 2);
(_r_3075 = sqrt(max(_t1_3076.x, max(_t1_3076.w, _t2_3077.y))));
}
(gl_Position = mul(transpose(_uLightVP), vec4_ctor(_s_3074._p, 1.0)));
(gl_PointSize = clamp(((2.20000005 * _r_3075) * _uPxPerM), 1.0, 48.0));
return generateOutput(input);
}

// COMPILER INPUT HLSL END
// COMPILER INPUT HLSL BEGIN

cbuffer DriverConstants : register(b0)
{
    float4 dx_ViewCoords : packoffset(c1);
};

#define ANGLE_POINT_SPRITE_SHADER

static float2 pointSpriteCorners[] = 
{
    float2( 0.5f, -0.5f),
    float2( 0.5f,  0.5f),
    float2(-0.5f, -0.5f),
    float2(-0.5f,  0.5f)
};

static float2 pointSpriteTexcoords[] = 
{
    float2(1.0f, 1.0f),
    float2(1.0f, 0.0f),
    float2(0.0f, 1.0f),
    float2(0.0f, 0.0f)
};

static float minPointSize = 1.0f;
static float maxPointSize = 1024.0f;

struct GS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float gl_PointSize : PSIZE;
};

struct GS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float gl_PointSize : PSIZE;
};

void copyVertex(inout GS_OUTPUT output, GS_INPUT input, GS_INPUT flatinput)
{
    output.gl_Position = input.gl_Position;
    output.gl_PointSize = input.gl_PointSize;
#ifndef ANGLE_POINT_SPRITE_SHADER
    output.dx_Position = input.dx_Position;
#endif  // ANGLE_POINT_SPRITE_SHADER
}

[maxvertexcount(4)]
void main(point GS_INPUT input[1],  inout TriangleStream<GS_OUTPUT> outStream)
{
    GS_OUTPUT output = (GS_OUTPUT)0;
    uint lastVertexIndex = 0;
    copyVertex(output, input[0], input[lastVertexIndex]);

    float4 dx_Position = input[0].dx_Position;
    float gl_PointSize = clamp(input[0].gl_PointSize, minPointSize, maxPointSize);
    float2 viewportScale = float2(1.0f / dx_ViewCoords.x, 1.0f / dx_ViewCoords.y) * dx_Position.w;

    output.dx_Position = dx_Position + float4(pointSpriteCorners[0] * viewportScale * gl_PointSize, 0.0f, 0.0f);
    outStream.Append(output);

    output.dx_Position = dx_Position + float4(pointSpriteCorners[1] * viewportScale * gl_PointSize, 0.0f, 0.0f);
    outStream.Append(output);

    output.dx_Position = dx_Position + float4(pointSpriteCorners[2] * viewportScale * gl_PointSize, 0.0f, 0.0f);
    outStream.Append(output);

    output.dx_Position = dx_Position + float4(pointSpriteCorners[3] * viewportScale * gl_PointSize, 0.0f, 0.0f);
    outStream.Append(output);
    
    outStream.RestartStrip();
}

// COMPILER INPUT HLSL END

// VERTEX SHADER END
