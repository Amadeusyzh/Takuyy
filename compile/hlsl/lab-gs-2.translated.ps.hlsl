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
// Uniforms

uniform float3 _uFwd : register(c0);
uniform float3 _uRight : register(c1);
uniform float3 _uUp : register(c2);
uniform float3 _uSunDir : register(c3);
uniform float3 _uZenith : register(c4);
uniform float3 _uHorizon : register(c5);
uniform float3 _uSunCol : register(c6);
uniform float _uTanHalf : register(c7);
uniform float _uAspect : register(c8);
uniform float _uNight : register(c9);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static  float2 _vUv = {0, 0};

static float4 out_o = {0, 0, 0, 0};

cbuffer DriverConstants : register(b1)
{
    uint dx_Misc : packoffset(c2.w);
};

float f_hash(in float3 _p_3014)
{
return frac((sin(dot(_p_3014, float3(12.9898005, 78.2330017, 37.7190018))) * 43758.5469));
}
@@ PIXEL OUTPUT @@

PS_OUTPUT main(@@ PIXEL MAIN PARAMETERS @@){
@@ MAIN PROLOGUE @@
float3 _d_3016 = normalize(((_uFwd + (((_vUv.x * _uTanHalf) * _uAspect) * _uRight)) + ((_vUv.y * _uTanHalf) * _uUp)));
float _h_3017 = _d_3016.y;
float3 sbcf = {0, 0, 0};
if ((_h_3017 > 0.0))
{
(sbcf = lerp(_uHorizon, _uZenith, pow(_h_3017, 0.550000012)));
}
else
{
(sbcf = lerp(_uHorizon, (_uHorizon * 0.550000012), min(((-_h_3017) * 4.0), 1.0)));
}
float3 _col_3018 = sbcf;
float _sd_3019 = max(dot(_d_3016, _uSunDir), 0.0);
float sbd1 = _sd_3019;
(_col_3018 += (_uSunCol * (((pow(_sd_3019, 900.0) * 6.0) + (pow(_sd_3019, 40.0) * 0.349999994)) + ((((((sbd1 * sbd1) * sbd1) * sbd1) * sbd1) * sbd1) * 0.119999997))));
bool sbd0 = (_uNight > 0.0);
if (sbd0)
{
(sbd0 = (_h_3017 > 0.0));
}
if (sbd0)
{
float3 _q_3020 = floor((_d_3016 * 420.0));
float _st_3021 = step(0.99849999, f_hash(_q_3020));
(_col_3018 += ((vec3_ctor(_st_3021) * _uNight) * (0.5 + (0.5 * f_hash((_q_3020 + 3.0))))));
float _md_3022 = max(dot(_d_3016, (-_uSunDir)), 0.0);
(_col_3018 += (((float3(0.800000012, 0.850000024, 1.0) * pow(_md_3022, 2000.0)) * 4.0) * _uNight));
}
(out_o = vec4_ctor(_col_3018, 1.0));
return generateOutput();
}

// INITIAL HLSL END


// COMPILER INPUT HLSL BEGIN

struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD1;
    float2 v0 : TEXCOORD0;
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
// Uniforms

uniform float3 _uFwd : register(c0);
uniform float3 _uRight : register(c1);
uniform float3 _uUp : register(c2);
uniform float3 _uSunDir : register(c3);
uniform float3 _uZenith : register(c4);
uniform float3 _uHorizon : register(c5);
uniform float3 _uSunCol : register(c6);
uniform float _uTanHalf : register(c7);
uniform float _uAspect : register(c8);
uniform float _uNight : register(c9);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings
static  float2 _vUv = {0, 0};

static float4 out_o = {0, 0, 0, 0};

cbuffer DriverConstants : register(b1)
{
    uint dx_Misc : packoffset(c2.w);
};

float f_hash(in float3 _p_3014)
{
return frac((sin(dot(_p_3014, float3(12.9898005, 78.2330017, 37.7190018))) * 43758.5469));
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
    _vUv = input.v0.xy;

float3 _d_3016 = normalize(((_uFwd + (((_vUv.x * _uTanHalf) * _uAspect) * _uRight)) + ((_vUv.y * _uTanHalf) * _uUp)));
float _h_3017 = _d_3016.y;
float3 sbcf = {0, 0, 0};
if ((_h_3017 > 0.0))
{
(sbcf = lerp(_uHorizon, _uZenith, pow(_h_3017, 0.550000012)));
}
else
{
(sbcf = lerp(_uHorizon, (_uHorizon * 0.550000012), min(((-_h_3017) * 4.0), 1.0)));
}
float3 _col_3018 = sbcf;
float _sd_3019 = max(dot(_d_3016, _uSunDir), 0.0);
float sbd1 = _sd_3019;
(_col_3018 += (_uSunCol * (((pow(_sd_3019, 900.0) * 6.0) + (pow(_sd_3019, 40.0) * 0.349999994)) + ((((((sbd1 * sbd1) * sbd1) * sbd1) * sbd1) * sbd1) * 0.119999997))));
bool sbd0 = (_uNight > 0.0);
if (sbd0)
{
(sbd0 = (_h_3017 > 0.0));
}
if (sbd0)
{
float3 _q_3020 = floor((_d_3016 * 420.0));
float _st_3021 = step(0.99849999, f_hash(_q_3020));
(_col_3018 += ((vec3_ctor(_st_3021) * _uNight) * (0.5 + (0.5 * f_hash((_q_3020 + 3.0))))));
float _md_3022 = max(dot(_d_3016, (-_uSunDir)), 0.0);
(_col_3018 += (((float3(0.800000012, 0.850000024, 1.0) * pow(_md_3022, 2000.0)) * 4.0) * _uNight));
}
(out_o = vec4_ctor(_col_3018, 1.0));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
