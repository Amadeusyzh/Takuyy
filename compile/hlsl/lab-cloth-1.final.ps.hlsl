struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 v0 : TEXCOORD1;
};

// INITIAL HLSL BEGIN

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
uniform float3 _uColor : register(c2);
uniform float _uShadow : register(c3);
uniform float _uMetal : register(c4);
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

static float4 gl_Color[1] =
{
    float4(0, 0, 0, 0)
};

cbuffer DriverConstants : register(b1)
{
    uint dx_Misc : packoffset(c2.w);
};

#define GL_USES_FRAG_COLOR
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
    _vPos = input.v0.xyz;

if ((_uShadow > 0.5))
{
float _f_3009 = (1.0 - smoothstep(1.0, 3.5, length(_vPos.xz)));
(gl_Color[0] = vec4_ctor(0.0, 0.0, 0.0, (0.550000012 * _f_3009)));
return generateOutput();
}
float3 _n_3010 = normalize(_vNrm);
float3 _v_3011 = normalize((_uEye - _vPos));
float3 _r_3012 = reflect((-_v_3011), _n_3010);
float3 _env_3013 = lerp(float3(0.0500000007, 0.0549999997, 0.0700000003), float3(0.75, 0.800000012, 0.899999976), smoothstep(-0.200000003, 0.800000012, _r_3012.y));
(_env_3013 += (float3(1.39999998, 1.39999998, 1.39999998) * smoothstep(0.920000017, 0.99000001, dot(_r_3012, _uLight))));
float sbc9 = (1.0 - max(dot(_n_3010, _v_3011), 0.0));
float _fres_3014 = (0.0399999991 + (0.959999979 * ((((sbc9 * sbc9) * sbc9) * sbc9) * sbc9)));
float _dif_3015 = max(dot(_n_3010, _uLight), 0.0);
float3 _col_3016 = (((_uColor * (0.150000006 + (0.850000024 * _dif_3015))) * (1.0 - _uMetal)) + ((_env_3013 * lerp(_fres_3014, 1.0, _uMetal)) * lerp(float3(1.0, 1.0, 1.0), _uColor, _uMetal)));
(gl_Color[0] = vec4_ctor(_col_3016, 1.0));
return generateOutput();
}

// INITIAL HLSL END


// COMPILER INPUT HLSL BEGIN

struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    float3 v0 : TEXCOORD0;
    float3 v1 : TEXCOORD1;
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
uniform float3 _uColor : register(c2);
uniform float _uShadow : register(c3);
uniform float _uMetal : register(c4);
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

static float4 gl_Color[1] =
{
    float4(0, 0, 0, 0)
};

cbuffer DriverConstants : register(b1)
{
    uint dx_Misc : packoffset(c2.w);
};

#define GL_USES_FRAG_COLOR
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
    _vPos = input.v0.xyz;
    _vNrm = input.v1.xyz;

if ((_uShadow > 0.5))
{
float _f_3009 = (1.0 - smoothstep(1.0, 3.5, length(_vPos.xz)));
(gl_Color[0] = vec4_ctor(0.0, 0.0, 0.0, (0.550000012 * _f_3009)));
return generateOutput();
}
float3 _n_3010 = normalize(_vNrm);
float3 _v_3011 = normalize((_uEye - _vPos));
float3 _r_3012 = reflect((-_v_3011), _n_3010);
float3 _env_3013 = lerp(float3(0.0500000007, 0.0549999997, 0.0700000003), float3(0.75, 0.800000012, 0.899999976), smoothstep(-0.200000003, 0.800000012, _r_3012.y));
(_env_3013 += (float3(1.39999998, 1.39999998, 1.39999998) * smoothstep(0.920000017, 0.99000001, dot(_r_3012, _uLight))));
float sbc9 = (1.0 - max(dot(_n_3010, _v_3011), 0.0));
float _fres_3014 = (0.0399999991 + (0.959999979 * ((((sbc9 * sbc9) * sbc9) * sbc9) * sbc9)));
float _dif_3015 = max(dot(_n_3010, _uLight), 0.0);
float3 _col_3016 = (((_uColor * (0.150000006 + (0.850000024 * _dif_3015))) * (1.0 - _uMetal)) + ((_env_3013 * lerp(_fres_3014, 1.0, _uMetal)) * lerp(float3(1.0, 1.0, 1.0), _uColor, _uMetal)));
(gl_Color[0] = vec4_ctor(_col_3016, 1.0));
return generateOutput();
}

// COMPILER INPUT HLSL END

// FRAGMENT SHADER END
