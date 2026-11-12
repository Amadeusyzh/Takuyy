struct VS_OUTPUT
{
    float4 dx_Position : SV_Position;
    float4 gl_Position : TEXCOORD2;
    noperspective float4 v0 : TEXCOORD0;
    noperspective float2 v1 : TEXCOORD1;
};
#pragma warning( disable: 3081 3556 3557 3571 )
float2 vec2_ctor(float x0, float x1)
{
    return float2(x0, x1);
}
float2x2 mat2_ctor(float2 x0, float2 x1)
{
    return float2x2(x0, x1);
}
float4 vec4_ctor(float2 x0, float x1, float x2)
{
    return float4(x0, x1, x2);
}
float4x4 mat4_ctor_float4_float4_float4_float4(float4 x0, float4 x1, float4 x2, float4 x3)
{
    return float4x4(x0, x1, x2, x3);
}
// Uniforms

uniform float4 _sk_RTAdjust : register(c0);
#ifdef ANGLE_ENABLE_LOOP_FLATTEN
#define LOOP [loop]
#define FLATTEN [flatten]
#else
#define LOOP
#define FLATTEN
#endif
// Attributes
static float4 _radii_selector = {0, 0, 0, 0};
static float4 _corner_and_radius_outsets = {0, 0, 0, 0};
static float4 _aa_bloat_and_coverage = {0, 0, 0, 0};
static float4 _radii_x = {0, 0, 0, 0};
static float4 _radii_y = {0, 0, 0, 0};
static float4 _skew = {0, 0, 0, 0};
static float2 _translate_and_localrotate = {0, 0};
static float4 _color = {0, 0, 0, 0};

static float4 gl_Position = float4(0, 0, 0, 0);

// Varyings
static noperspective float4 _vcolor_S0 = {0, 0, 0, 0};
static noperspective float2 _varccoord_S0 = {0, 0};

cbuffer DriverConstants : register(b1)
{
    float2 dx_ViewScale  : packoffset(c1);
    float clipControlOrigin : packoffset(c1.z);
    float clipControlZeroToOne : packoffset(c1.w);
};

struct VS_INPUT
{
    float4 _radii_selector : TEXCOORD0;
    float4 _corner_and_radius_outsets : TEXCOORD1;
    float4 _aa_bloat_and_coverage : TEXCOORD2;
    float4 _radii_x : TEXCOORD3;
    float4 _radii_y : TEXCOORD4;
    float4 _skew : TEXCOORD5;
    float2 _translate_and_localrotate : TEXCOORD6;
    float4 _color : TEXCOORD7;
};

void initAttributes(VS_INPUT input)
{
    _radii_selector = input._radii_selector;
    _corner_and_radius_outsets = input._corner_and_radius_outsets;
    _aa_bloat_and_coverage = input._aa_bloat_and_coverage;
    _radii_x = input._radii_x;
    _radii_y = input._radii_y;
    _skew = input._skew;
    _translate_and_localrotate = input._translate_and_localrotate;
    _color = input._color;
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
    output.v0 = _vcolor_S0;
    output.v1 = _varccoord_S0;

    return output;
}

VS_OUTPUT main(VS_INPUT input){
    initAttributes(input);

(_vcolor_S0 = _color);
float _aa_bloat_multiplier_3013 = {1.0};
float2 _corner_3014 = _corner_and_radius_outsets.xy;
float2 _radius_outset_3015 = _corner_and_radius_outsets.zw;
float2 _aa_bloat_direction_3016 = _aa_bloat_and_coverage.xy;
float _is_linear_coverage_3017 = _aa_bloat_and_coverage.w;
float2 _pixellength_3018 = rsqrt(vec2_ctor(dot(_skew.xz, _skew.xz), dot(_skew.yw, _skew.yw)));
float4 _normalized_axis_dirs_3019 = (_skew * _pixellength_3018.xyxy);
float2 _axiswidths_3020 = (abs(_normalized_axis_dirs_3019.xy) + abs(_normalized_axis_dirs_3019.zw));
float2 _aa_bloatradius_3021 = ((_axiswidths_3020 * _pixellength_3018) * 0.5);
float4 _radii_and_neighbors_3022 = mul(_radii_selector, transpose(mat4_ctor_float4_float4_float4_float4(_radii_x, _radii_y, _radii_x.yxwz, _radii_y.wzyx)));
float2 _radii_3023 = _radii_and_neighbors_3022.xy;
float2 _neighbor_radii_3024 = _radii_and_neighbors_3022.zw;
float _coverage_multiplier_3025 = {1.0};
if (any((_aa_bloatradius_3021 > float2(1.0, 1.0))))
{
(_corner_3014 = (max(abs(_corner_3014), _aa_bloatradius_3021) * sign(_corner_3014)));
(_coverage_multiplier_3025 = (1.0 / (max(_aa_bloatradius_3021.x, 1.0) * max(_aa_bloatradius_3021.y, 1.0))));
(_radii_3023 = float2(0.0, 0.0));
}
float _coverage_3026 = _aa_bloat_and_coverage.z;
if (any((_radii_3023 < (_aa_bloatradius_3021 * 1.5))))
{
(_radii_3023 = float2(0.0, 0.0));
(_aa_bloat_direction_3016 = sign(_corner_3014));
if ((_coverage_3026 > 0.5))
{
(_aa_bloat_direction_3016 = (-_aa_bloat_direction_3016));
}
(_is_linear_coverage_3017 = 1.0);
}
else
{
(_radii_3023 = clamp(_radii_3023, (_pixellength_3018 * 1.5), (2.0 - (_pixellength_3018 * 1.5))));
(_neighbor_radii_3024 = clamp(_neighbor_radii_3024, (_pixellength_3018 * 1.5), (2.0 - (_pixellength_3018 * 1.5))));
float2 _spacing_3027 = ((2.0 - _radii_3023) - _neighbor_radii_3024);
float2 _extra_pad_3028 = max(((_pixellength_3018 * 0.0625) - _spacing_3027), float2(0.0, 0.0));
(_radii_3023 -= (_extra_pad_3028 * 0.5));
}
float2 _aa_outset_3029 = ((_aa_bloat_direction_3016 * _aa_bloatradius_3021) * _aa_bloat_multiplier_3013);
float2 _vertexpos_3030 = ((_corner_3014 + (_radius_outset_3015 * _radii_3023)) + _aa_outset_3029);
if ((_coverage_3026 > 0.5))
{
bool sbdc = (_aa_bloat_direction_3016.x != 0.0);
if (sbdc)
{
(sbdc = ((_vertexpos_3030.x * _corner_3014.x) < 0.0));
}
if (sbdc)
{
float _backset_3031 = abs(_vertexpos_3030.x);
(_vertexpos_3030.x = 0.0);
(_vertexpos_3030.y += (((_backset_3031 * sign(_corner_3014.y)) * _pixellength_3018.y) / _pixellength_3018.x));
(_coverage_3026 = ((((_coverage_3026 - 0.5) * abs(_corner_3014.x)) / (abs(_corner_3014.x) + _backset_3031)) + 0.5));
}
bool sbdd = (_aa_bloat_direction_3016.y != 0.0);
if (sbdd)
{
(sbdd = ((_vertexpos_3030.y * _corner_3014.y) < 0.0));
}
if (sbdd)
{
float _backset_3032 = abs(_vertexpos_3030.y);
(_vertexpos_3030.y = 0.0);
(_vertexpos_3030.x += (((_backset_3032 * sign(_corner_3014.x)) * _pixellength_3018.x) / _pixellength_3018.y));
(_coverage_3026 = ((((_coverage_3026 - 0.5) * abs(_corner_3014.y)) / (abs(_corner_3014.y) + _backset_3032)) + 0.5));
}
}
float2x2 _skewmatrix_3033 = mat2_ctor(_skew.xy, _skew.zw);
float2 _devcoord_3034 = (mul(_vertexpos_3030, transpose(_skewmatrix_3033)) + _translate_and_localrotate);
if ((0.0 != _is_linear_coverage_3017))
{
(_varccoord_S0 = vec2_ctor(0.0, (_coverage_3026 * _coverage_multiplier_3025)));
}
else
{
float2 _arccoord_3035 = ((1.0 - abs(_radius_outset_3015)) + ((_aa_outset_3029 / _radii_3023) * _corner_3014));
(_varccoord_S0 = vec2_ctor((_arccoord_3035.x + 1.0), _arccoord_3035.y));
}
(gl_Position = vec4_ctor(_devcoord_3034, 0.0, 1.0));
(gl_Position = vec4_ctor(((gl_Position.xy * _sk_RTAdjust.xz) + (gl_Position.ww * _sk_RTAdjust.yw)), 0.0, gl_Position.w));
return generateOutput(input);
}
