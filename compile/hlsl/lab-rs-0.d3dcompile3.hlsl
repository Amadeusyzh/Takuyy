struct PS_INPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD0;
    float4 gl_FragCoord : TEXCOORD1;
};

#pragma warning( disable: 3081 3556 3557 3571 )
struct _Hit_0
{
    float _t;
    float3 _n;
    int _id;
};
#pragma pack_matrix(row_major)
struct rm__Hit_0
{
    float _t;
    float3 _n;
    int _id;
};
#pragma pack_matrix(column_major)
struct std__Hit_0
{
    float _t;
    float pad_0;
    float pad_1;
    float pad_2;
    float3 _n;
    int _id;
};
#pragma pack_matrix(row_major)
struct std_rm__Hit_0
{
    float _t;
    float pad_3;
    float pad_4;
    float pad_5;
    float3 _n;
    int _id;
};
#pragma pack_matrix(column_major)
struct std_fp__Hit_0
{
    float _t;
    float pad_6;
    float pad_7;
    float pad_8;
    float3 _n;
    int _id;
};
#pragma pack_matrix(row_major)
struct std_rm_fp__Hit_0
{
    float _t;
    float pad_9;
    float pad_10;
    float pad_11;
    float3 _n;
    int _id;
};
#pragma pack_matrix(column_major)
float float_ctor_int(int x0)
{
    return float(x0);
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
// Uniforms

uniform float4 _uBoxMin[24] : register(c0);
uniform float4 _uBoxMax[24] : register(c24);
uniform int _uNumBoxes : register(c48);
uniform float2 _uRes : register(c49);
uniform float3 _uCamPos : register(c50);
uniform float3 _uCamFwd : register(c51);
uniform float3 _uCamRight : register(c52);
uniform float3 _uCamUp : register(c53);
uniform float _uTanHalf : register(c54);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Varyings

static float4 out_oPos = {0, 0, 0, 0};
static float4 out_oNrm = {0, 0, 0, 0};
static float4 gl_FragCoord = float4(0, 0, 0, 0);

cbuffer DriverConstants : register(b1)
{
    float4 dx_ViewCoords : packoffset(c1);
    float2 dx_FragCoordOffset : packoffset(c3);
    float3 dx_DepthFront : packoffset(c2);
    float2 dx_ViewScale : packoffset(c3.z);
    uint dx_Misc : packoffset(c2.w);
};

#define GL_USES_FRAG_COORD
;
void f_boxHit_int__Hit_0(in float3 _ro_3020, in float3 _inv_3021, in float3 _lo_3022, in float3 _hi_3023, in int _id_3024, inout _Hit_0 _h_3025)
{
float3 _t0_3026 = ((_lo_3022 - _ro_3020) * _inv_3021);
float3 _t1_3027 = ((_hi_3023 - _ro_3020) * _inv_3021);
float3 _tn_3028 = min(_t0_3026, _t1_3027);
float3 _tf_3029 = max(_t0_3026, _t1_3027);
float _n_3030 = max(max(_tn_3028.x, _tn_3028.y), _tn_3028.z);
float _f_3031 = min(min(_tf_3029.x, _tf_3029.y), _tf_3029.z);
bool sc3d = (_n_3030 > _f_3031);
if ((!sc3d))
{
(sc3d = (_n_3030 < 9.99999975e-05));
}
bool sc3c = sc3d;
if ((!sc3c))
{
(sc3c = (_n_3030 >= _h_3025._t));
}
if (sc3c)
{
return;
}
(_h_3025._t = _n_3030);
(_h_3025._id = _id_3024);
if ((_n_3030 == _tn_3028.x))
{
(_h_3025._n = vec3_ctor((-sign(_inv_3021.x)), 0.0, 0.0));
}
else
{
if ((_n_3030 == _tn_3028.y))
{
(_h_3025._n = vec3_ctor(0.0, (-sign(_inv_3021.y)), 0.0));
}
else
{
(_h_3025._n = vec3_ctor(0.0, 0.0, (-sign(_inv_3021.z))));
}
}
}
_Hit_0 f_trace(in float3 _ro_3033, in float3 _rd_3034)
{
_Hit_0 _h_3035 = {0, 0, 0, 0, 0};
(_h_3035._t = 1000000000.0);
(_h_3035._id = -1);
(_h_3035._n = float3(0.0, 1.0, 0.0));
float3 _inv_3036 = (1.0 / _rd_3034);
if ((_rd_3034.y < 0.0))
{
float _t_3037 = ((-_ro_3033.y) / _rd_3034.y);
if ((_t_3037 > 9.99999975e-05))
{
(_h_3035._t = _t_3037);
(_h_3035._id = 24);
}
}
{ for(int _i_3038 = {0}; (_i_3038 < 24); (_i_3038++))
{
if ((_i_3038 >= _uNumBoxes))
{
break;
}
f_boxHit_int__Hit_0(_ro_3033, _inv_3036, _uBoxMin[int_ctor(clamp(float_ctor_int(_i_3038), 0.0, 23.0))].xyz, _uBoxMax[int_ctor(clamp(float_ctor_int(_i_3038), 0.0, 23.0))].xyz, _i_3038, _h_3035);
}
}
return _h_3035;
}
struct PS_OUTPUT
{
    float4 out_oPos : SV_TARGET0;
};

PS_OUTPUT generateOutput()
{
    PS_OUTPUT output;
    output.out_oPos = out_oPos;
    return output;
}


PS_OUTPUT main(PS_INPUT input){
    float rhw = 1.0 / input.gl_FragCoord.w;
    gl_FragCoord.x = input.dx_Position.x - dx_FragCoordOffset.x;
    gl_FragCoord.y = input.dx_Position.y - dx_FragCoordOffset.y;
    gl_FragCoord.z = input.dx_Position.z;
    gl_FragCoord.w = rhw;

float2 _ndc_3126 = (((gl_FragCoord.xy / _uRes) * 2.0) - 1.0);
float3 _rd_3127 = normalize(((_uCamFwd + ((((_ndc_3126.x * _uTanHalf) * _uRes.x) / _uRes.y) * _uCamRight)) + ((_ndc_3126.y * _uTanHalf) * _uCamUp)));
_Hit_0 _h_3128 = f_trace(_uCamPos, _rd_3127);
if ((_h_3128._id < 0))
{
(out_oPos = vec4_ctor(_rd_3127, -1.0));
(out_oNrm = float4(0.0, 0.0, 0.0, 0.0));
return generateOutput();
}
(out_oPos = vec4_ctor((_uCamPos + (_rd_3127 * _h_3128._t)), _h_3128._t));
(out_oNrm = vec4_ctor(_h_3128._n, float_ctor_int(_h_3128._id)));
return generateOutput();
}
