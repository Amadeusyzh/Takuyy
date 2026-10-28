// Interactive lab: "Gaussian World", an editable open world made of 3D Gaussians.
//
// Rendering follows 3D Gaussian Splatting (Kerbl et al., SIGGRAPH 2023): every
// primitive is an anisotropic 3D Gaussian whose covariance is projected to a 2D
// screen-space ellipse through the Jacobian of the perspective map (EWA
// splatting, Zwicker et al. 2002), depth-sorted (16-bit counting sort in a Web
// Worker) and alpha-composited back to front. Unlike a frozen capture, the
// Gaussians stay "live": they are relit on the GPU for any time of day, cast sun
// shadows through a splatted shadow map, sway in the wind, follow the seasons,
// and terrain Gaussians re-derive height, normal, orientation and material from
// an editable heightfield. A keyword-driven procedural generator stands in for
// a learned text-to-world model. WebGL 2, no dependencies.
(function () {
  "use strict";

  var panel = document.getElementById("lab-gs");
  if (!panel) return;
  var root = document.getElementById("lab");
  var canvas = panel.querySelector("canvas");

  var TEX_W = 2048; // texels per row of the splat texture
  var TPS = 5; // texels per splat
  var WORLD = 96; // metres
  var HALF = WORLD / 2;
  var GRID = 193; // heightfield resolution (0.5 m cells)
  var CELL = WORLD / (GRID - 1);
  var CAPACITY = 380000;

  // splat types (must match the shader)
  var T_TERRAIN = 0, T_GRASS = 1, T_LEAF = 2, T_NEEDLE = 3, T_BLOSSOM = 4, T_SOLID = 5,
    T_WATER = 6, T_CLOUD = 7, T_EMISSIVE = 8, T_FLOWER = 9, T_BACKDROP = 10, T_CAPTURE = 11;
  var PLY_MAX_MB = 900;

  var KEYWORDS = {"winter": ["winter", "snow", "snowy", "frozen", "ice", "\u51ac", "\u96ea", "\u51b0", "\u6c37"], "autumn": ["autumn", "fall", "maple", "\u79cb", "\u7ea2\u53f6", "\u7d05\u8449", "\u67ab"], "spring": ["spring", "sakura", "cherry", "blossom", "\u6625", "\u685c", "\u6a31"], "summer": ["summer", "\u590f"], "night": ["night", "moon", "midnight", "star", "\u591c", "\u665a", "\u6708", "\u661f"], "dawn": ["dawn", "sunrise", "morning", "\u9ece\u660e", "\u65e5\u51fa", "\u6e05\u6668", "\u65e9\u6668", "\u671d", "\u591c\u660e\u3051"], "sunset": ["sunset", "dusk", "evening", "golden", "\u9ec4\u660f", "\u508d\u665a", "\u65e5\u843d", "\u5915"], "noon": ["noon", "midday", "\u6b63\u5348", "\u4e2d\u5348", "\u767d\u5929", "\u663c"], "lake": ["lake", "pond", "river", "water", "\u6e56", "\u6c60", "\u6cb3", "\u5ddd"], "island": ["island", "ocean", "sea", "beach", "coast", "\u5c9b", "\u5cf6", "\u6d77", "\u6c99\u6ee9", "\u30d3\u30fc\u30c1"], "desert": ["desert", "dune", "oasis", "\u6c99\u6f20", "\u7802\u6f20", "\u7802\u4e18", "\u7eff\u6d32", "\u30aa\u30a2\u30b7\u30b9"], "mountain": ["mountain", "alpine", "peak", "\u5c71", "\u5cf0", "\u5cb3", "\u30a2\u30eb\u30d7\u30b9"], "flat": ["plain", "prairie", "field", "\u8349\u539f", "\u5e73\u539f", "\u91ce\u539f"], "forest": ["forest", "woods", "jungle", "\u68ee", "\u6797"], "pine": ["pine", "conifer", "fir", "spruce", "\u677e", "\u6749", "\u9488\u53f6", "\u91dd\u8449"], "village": ["village", "house", "cabin", "town", "hut", "\u6751", "\u5c4b", "\u623f", "\u5bb6", "\u5c0f\u5c4b", "\u96c6\u843d"], "flowers": ["flower", "garden", "meadow", "\u82b1"], "lantern": ["lantern", "lamp", "\u706f", "\u706f\u7c60", "\u63d0\u706f", "\u706f\u7b3c"], "fog": ["fog", "mist", "haze", "\u96fe", "\u9727", "\u9744"], "wind": ["wind", "storm", "breeze", "\u98ce", "\u98a8", "\u5d50"]};

  function fail(msg) {
    panel.querySelector(".lab-stage").textContent = msg || root.dataset.nogl2;
    panel.querySelector(".gw-ui").style.display = "none";
  }

  // =============================================================== noise
  function hash2(x, y, s) {
    var h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    var a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y, oct, s) {
    var v = 0, amp = 0.5, f = 1, norm = 0;
    for (var o = 0; o < oct; o++) {
      v += amp * vnoise(x * f, y * f, s + o * 17);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return v / norm;
  }
  function ridged(x, y, oct, s) {
    var v = 0, amp = 0.5, f = 1, norm = 0;
    for (var o = 0; o < oct; o++) {
      var n = 1 - Math.abs(vnoise(x * f, y * f, s + o * 31) * 2 - 1);
      v += amp * n * n;
      norm += amp;
      amp *= 0.5;
      f *= 2.1;
    }
    return v / norm;
  }
  function smoothstep(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function strHash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  // ============================================================= prompt
  // A tiny "text-to-world" front end: keywords (en / zh / ja) set generator parameters.
  function parsePrompt(text) {
    var t = (text || "").toLowerCase();
    var has = function (k) {
      return KEYWORDS[k].some(function (w) { return t.indexOf(w) >= 0; });
    };
    var P = {
      seed: strHash(t || "world"), relief: 1, mountains: 0.55, lake: true, island: false, desert: false,
      broad: 35, pine: 25, sakura: 4, rocks: 30, flowers: 0.5, cabins: 2, lanterns: 3, grass: 1,
      season: 1, time: 10.5, clouds: 22, fog: 0.006, wind: 0.8, snowLine: 15, tags: [],
    };
    function tag(k) { if (P.tags.indexOf(k) < 0) P.tags.push(k); }
    if (has("winter")) { P.season = 3; tag("winter"); }
    else if (has("autumn")) { P.season = 2; P.broad += 15; tag("autumn"); }
    else if (has("spring")) { P.season = 0; P.sakura = 30; P.flowers = 1; tag("spring"); }
    else if (has("summer")) { P.season = 1; tag("summer"); }
    if (has("night")) { P.time = 22.5; P.lanterns = 10; tag("night"); }
    else if (has("dawn")) { P.time = 6.9; P.fog = 0.011; tag("dawn"); }
    else if (has("sunset")) { P.time = 17.55; tag("sunset"); }
    else if (has("noon")) { P.time = 12.5; tag("noon"); }
    if (has("desert")) { P.desert = true; P.broad = 3; P.pine = 0; P.sakura = 0; P.grass = 0.15; P.flowers = 0.1; P.rocks = 55; P.mountains = 0.35; P.clouds = 6; tag("desert"); }
    if (has("island")) { P.island = true; P.lake = false; tag("island"); }
    if (has("lake")) { P.lake = true; tag("lake"); }
    if (has("mountain")) { P.mountains = 1; P.relief = 1.25; P.snowLine = 12; P.pine += 10; tag("mountain"); }
    if (has("flat")) { P.mountains = 0.15; P.relief = 0.6; P.flowers = 1; tag("meadow"); }
    if (has("forest")) { P.broad += 25; P.pine += 15; tag("forest"); }
    if (has("pine")) { P.pine += 30; P.broad = Math.round(P.broad * 0.5); tag("pine"); }
    if (has("village")) { P.cabins = 6; P.lanterns += 6; tag("village"); }
    if (has("flowers")) { P.flowers = 1.2; tag("flowers"); }
    if (has("lantern")) { P.lanterns += 8; tag("lantern"); }
    if (has("fog")) { P.fog = 0.028; tag("fog"); }
    if (has("wind")) { P.wind = 1.8; P.clouds += 10; tag("wind"); }
    if (P.season === 3) P.snowLine = 4;
    P.broad = Math.min(P.broad, 70);
    P.pine = Math.min(P.pine, 85);
    P.sakura = Math.min(P.sakura, 32);
    return P;
  }

  // ============================================================ shaders
  var COMMON = [
    "#version 300 es",
    "precision highp float;",
    "precision highp int;",
    "precision highp sampler2DShadow;",
    "uniform highp sampler2D uData, uHeight, uPaint;",
    "uniform float uWorld, uGrid, uWater, uSnowLine, uTime, uWind, uDesert;",
    "uniform vec2 uWindDir;",
    "uniform int uSeason;",
    "vec4 F(int i, int k) { int t = i * " + TPS + " + k; return texelFetch(uData, ivec2(t % " + TEX_W + ", t / " + TEX_W + "), 0); }",
    "float hAt(vec2 xz) {",
    "  vec2 g = clamp((xz / uWorld + 0.5) * (uGrid - 1.0), vec2(0.0), vec2(uGrid - 1.001));",
    "  ivec2 i = ivec2(floor(g)); vec2 f = fract(g);",
    "  float a = texelFetch(uHeight, i, 0).r, b = texelFetch(uHeight, i + ivec2(1, 0), 0).r;",
    "  float c = texelFetch(uHeight, i + ivec2(0, 1), 0).r, d = texelFetch(uHeight, i + ivec2(1, 1), 0).r;",
    "  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);",
    "}",
    "vec3 nAt(vec2 xz) {",
    "  float e = uWorld / (uGrid - 1.0);",
    "  float hx = hAt(xz + vec2(e, 0.0)) - hAt(xz - vec2(e, 0.0));",
    "  float hz = hAt(xz + vec2(0.0, e)) - hAt(xz - vec2(0.0, e));",
    "  return normalize(vec3(-hx, 2.0 * e, -hz));",
    "}",
    "int paintAt(vec2 xz) {",
    "  ivec2 i = clamp(ivec2((xz / uWorld + 0.5) * (uGrid - 1.0) + 0.5), ivec2(0), ivec2(int(uGrid) - 1));",
    "  return int(texelFetch(uPaint, i, 0).r * 255.0 + 0.5);",
    "}",
    // biomes: 1 grass, 2 meadow, 3 sand, 4 snow, 5 rock, 6 path
    "int biomeAt(vec2 xz, float h, vec3 n, float aux) {",
    "  int b = paintAt(xz);",
    "  if (b != 0) return b;",
    "  if (h < uWater + 0.45 + aux * 0.3) return 3;",
    "  if (n.y < 0.74) return 5;",
    "  if (h > uSnowLine + aux * 2.0) return 4;",
    "  return uDesert > 0.5 ? 3 : 1;",
    "}",
    "float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }",
    "struct S { vec3 p; vec3 n; vec3 alb; float op; int type; float aux; bool cull; float s; };",
    // fetch a splat and apply world-model state: heightfield, wind, seasons, biomes
    "S load(int i) {",
    "  S s; vec4 t0 = F(i, 0), t1 = F(i, 1), t2 = F(i, 2), t3 = F(i, 3), t4 = F(i, 4);",
    "  s.type = int(t4.z + 0.5); s.aux = t4.w; s.op = t0.w; s.cull = s.op <= 0.0;",
    "  s.p = t0.xyz; s.n = t3.yzw; s.alb = vec3(t2.z, t2.w, t3.x); s.s = t1.x;",
    "  if (s.cull) return s;",
    "  if (s.type == 6) {",
    "    s.p.y = uWater + 0.04 * sin(s.p.x * 0.9 + uTime * 1.3) * cos(s.p.z * 0.7 + uTime * 1.1);",
    "    if (hAt(s.p.xz) > uWater + 0.02) s.cull = true;",
    "    return s;",
    "  }",
    "  if (s.type == 7) { s.p.x = mod(s.p.x + uTime * 0.7 * (0.3 + uWind) + uWorld, 2.0 * uWorld) - uWorld; return s; }",
    "  if (s.type >= 10) return s;", // backdrop and captured splats are static
    "  float hb = hAt(t4.xy);",
    "  float rel = s.p.y;",
    "  s.p.y += hb;",
    "  float sway = 0.0;",
    "  if (s.type == 1 || s.type == 9) sway = 0.22 * rel;",
    "  else if (s.type == 2 || s.type == 3 || s.type == 4) sway = 0.012 * rel;",
    "  if (sway > 0.0) {",
    "    float ph = uTime * 1.9 + t4.x * 0.31 + t4.y * 0.23;",
    "    float w = 0.6 * sin(ph + s.aux * 6.283) + 0.4 * sin(ph * 2.7 + 1.3);",
    "    s.p.xz += uWindDir * (w * 0.7 + 0.5) * sway * uWind;",
    "  }",
    "  if (s.type == 1 || s.type == 9) {", // grass and flowers live only on grassy, dry ground
    "    vec3 gn = nAt(t4.xy); int b = biomeAt(t4.xy, hb, gn, 0.5);",
    "    if ((b != 1 && b != 2) || hb < uWater + 0.25) s.cull = true;",
    "    if (s.type == 9 && (uSeason == 3 || (uSeason == 2 && s.aux < 0.7))) s.cull = true;",
    "    if (s.type == 1) {",
    "      if (uSeason == 0) s.alb = mix(s.alb, vec3(0.42, 0.62, 0.2), 0.35);",
    "      else if (uSeason == 2) s.alb = mix(s.alb, vec3(0.62, 0.52, 0.22), 0.55);",
    "      else if (uSeason == 3) { s.alb = mix(s.alb, vec3(0.9, 0.92, 0.95), 0.8); s.op *= 0.45; }",
    "    }",
    "  } else if (s.type == 2) {", // broadleaf foliage
    "    float k = lum(s.alb) / 0.3;",
    "    if (uSeason == 0) s.alb = mix(s.alb, vec3(0.42, 0.68, 0.22) * k, 0.55);",
    "    else if (uSeason == 2) s.alb = (s.aux < 0.35 ? vec3(0.86, 0.32, 0.06) : (s.aux < 0.7 ? vec3(0.95, 0.66, 0.1) : vec3(0.6, 0.12, 0.06))) * k * 0.8;",
    "    else if (uSeason == 3) { if (s.aux < 0.93) s.cull = true; else s.alb = vec3(0.5, 0.38, 0.25) * k; }",
    "  } else if (s.type == 4) {", // cherry blossom
    "    float k = lum(s.alb) / 0.8;",
    "    if (uSeason == 1) s.alb = vec3(0.22, 0.45, 0.14) * k * 1.3;",
    "    else if (uSeason == 2) s.alb = vec3(0.85, 0.35, 0.12) * k;",
    "    else if (uSeason == 3) s.cull = true;",
    "  } else if (s.type == 3 && uSeason == 3 && s.n.y > 0.25) {",
    "    s.alb = mix(s.alb, vec3(0.9, 0.93, 0.97), 0.7);",
    "  } else if (s.type == 5 && uSeason == 3 && s.n.y > 0.55) {",
    "    s.alb = mix(s.alb, vec3(0.92, 0.94, 0.98), 0.85);",
    "  }",
    "  return s;",
    "}",
    "vec3 terrainAlbedo(vec2 xz, float h, vec3 n, float aux, float moist) {",
    "  int b = biomeAt(xz, h, n, aux);",
    "  vec3 grass = mix(vec3(0.2, 0.35, 0.1), vec3(0.4, 0.5, 0.16), moist) * (0.85 + 0.3 * aux);",
    "  if (uSeason == 0) grass = mix(grass, vec3(0.36, 0.55, 0.18), 0.4);",
    "  else if (uSeason == 2) grass = mix(grass, vec3(0.55, 0.45, 0.2), 0.5);",
    "  vec3 c = grass;",
    "  if (b == 2) { c = grass; if (aux > 0.82) c = aux > 0.94 ? vec3(0.95, 0.9, 0.95) : (aux > 0.88 ? vec3(0.95, 0.82, 0.2) : vec3(0.65, 0.4, 0.85)); }",
    "  else if (b == 3) c = vec3(0.78, 0.7, 0.52) * (0.9 + 0.2 * aux);",
    "  else if (b == 4) c = vec3(0.92, 0.94, 0.98);",
    "  else if (b == 5) c = mix(vec3(0.36, 0.34, 0.32), vec3(0.52, 0.5, 0.47), aux);",
    "  else if (b == 6) c = vec3(0.45, 0.35, 0.24) * (0.85 + 0.3 * aux);",
    "  if (uSeason == 3 && b != 3 && n.y > 0.55 && h > uWater + 0.1) c = mix(c, vec3(0.93, 0.95, 0.98), 0.9);",
    "  if (h < uWater) c *= vec3(0.6, 0.72, 0.75);",
    "  return c;",
    "}",
  ].join("\n");

  var MAIN_VS = COMMON + "\n" + [
    "uniform highp sampler2DShadow uShadow;",
    "uniform mat4 uView, uProj, uLightVP;",
    "uniform vec2 uViewport;",
    "uniform float uFocal, uFog, uNight;",
    "uniform vec3 uCamPos, uLightDir, uLightCol, uSkyAmb, uGroundAmb, uFogCol, uZenith, uHorizon;",
    "uniform int uMode, uShadowsOn;",
    "in vec2 aCorner;",
    "in uint aIndex;",
    "out vec4 vColor;",
    "out vec2 vPos;",
    "float shadowAt(vec3 p, vec3 n) {",
    "  if (uShadowsOn == 0) return 1.0;",
    "  vec4 c = uLightVP * vec4(p + n * 0.15 + uLightDir * 0.08, 1.0);",
    "  vec3 q = c.xyz / c.w * 0.5 + 0.5;",
    "  if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0 || q.z > 1.0) return 1.0;",
    "  vec2 tx = 1.0 / vec2(textureSize(uShadow, 0));",
    "  float s = texture(uShadow, vec3(q.xy + vec2(-0.7, -0.7) * tx, q.z - 0.0015));",
    "  s += texture(uShadow, vec3(q.xy + vec2(0.7, -0.7) * tx, q.z - 0.0015));",
    "  s += texture(uShadow, vec3(q.xy + vec2(-0.7, 0.7) * tx, q.z - 0.0015));",
    "  s += texture(uShadow, vec3(q.xy + vec2(0.7, 0.7) * tx, q.z - 0.0015));",
    "  return s * 0.25;",
    "}",
    "void cull() { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); }",
    "void main() {",
    "  int i = int(aIndex);",
    "  S s = load(i);",
    "  if (s.cull) { cull(); return; }",
    "  vec4 cam = uView * vec4(s.p, 1.0);",
    "  vec4 clip = uProj * cam;",
    "  float lim = 1.25 * clip.w;",
    "  if (cam.z > -0.35 || abs(clip.x) > lim || abs(clip.y) > lim) { cull(); return; }",
    "  mat3 Sig;",
    "  if (s.type == 0) {", // terrain: orientation and material follow the live heightfield
    "    s.n = nAt(s.p.xz);",
    "    vec3 t = normalize(cross(abs(s.n.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0), s.n));",
    "    vec3 b = cross(s.n, t);",
    "    float ss = s.s * s.s, sn = 0.0016 * ss;",
    "    Sig = ss * (outerProduct(t, t) + outerProduct(b, b)) + sn * outerProduct(s.n, s.n);",
    "    s.alb = terrainAlbedo(s.p.xz, s.p.y, s.n, s.aux, s.alb.r);",
    "  } else {",
    "    vec4 t1 = F(i, 1), t2 = F(i, 2);",
    "    Sig = mat3(t1.x, t1.y, t1.z, t1.y, t1.w, t2.x, t1.z, t2.x, t2.y);",
    "  }",
    // lighting: hemispheric ambient + sun/moon with splatted shadow map
    "  vec3 V = normalize(uCamPos - s.p);",
    "  float dist = length(uCamPos - s.p);",
    "  vec3 col;",
    "  if (s.type == 7) {",
    "    col = mix(uSkyAmb * 1.4 + uLightCol * 0.6, uHorizon, 0.25) * s.alb;",
    "  } else if (s.type == 11) {", // captured scene: plain 3DGS colour, no relighting
    "    col = s.alb;",
    "  } else if (s.type == 10) {",
    "    col = mix(s.alb * (uSkyAmb + uLightCol * 0.35), uHorizon, 0.55);",
    "  } else if (s.type == 6) {",
    "    float depth = uWater - hAt(s.p.xz);",
    "    vec3 wn = normalize(vec3(0.12 * sin(s.p.x * 1.7 + uTime * 1.6) * uWind, 1.0, 0.12 * cos(s.p.z * 1.3 + uTime * 1.2) * uWind));",
    "    float fres = 0.03 + 0.97 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);",
    "    vec3 r = reflect(-V, wn);",
    "    vec3 refl = mix(uHorizon, uZenith, clamp(r.y, 0.0, 1.0));",
    "    float sh = shadowAt(s.p, vec3(0.0, 1.0, 0.0));",
    "    vec3 body = mix(vec3(0.12, 0.38, 0.38), vec3(0.02, 0.1, 0.16), clamp(depth / 3.0, 0.0, 1.0)) * (uSkyAmb + uLightCol * 0.4 * sh);",
    "    float spec = pow(max(dot(r, uLightDir), 0.0), 160.0) * 5.0 * sh;",
    "    col = mix(body, refl, fres) + uLightCol * spec;",
    "    float foam = 1.0 - smoothstep(0.0, 0.18, depth);",
    "    col = mix(col, vec3(0.9) * (uSkyAmb + uLightCol * 0.6), foam * 0.6);",
    "    s.op = clamp(0.45 + depth * 0.6, 0.45, 0.93);",
    "  } else {",
    "    vec3 amb = mix(uGroundAmb, uSkyAmb, s.n.y * 0.5 + 0.5);",
    "    float ndl = dot(s.n, uLightDir);",
    "    bool foliage = s.type == 1 || s.type == 2 || s.type == 3 || s.type == 4 || s.type == 9;",
    "    float dif = foliage ? clamp((ndl + 0.55) / 1.55, 0.0, 1.0) : max(ndl, 0.0);",
    "    float sh = (uLightDir.y > -0.05) ? shadowAt(s.p, s.n) : 1.0;",
    "    col = s.alb * (amb + uLightCol * dif * sh);",
    "    if (foliage) col += s.alb * uLightCol * 0.25 * pow(max(dot(-V, uLightDir), 0.0), 4.0) * sh;", // translucency
    "    if (s.type == 8) col = mix(vec3(0.12, 0.15, 0.2) * (amb + uLightCol * 0.3), s.alb * 1.6, uNight);",
    "  }",
    "  if (s.type < 10) col = mix(col, uFogCol, 1.0 - exp(-dist * uFog));",
    "  if (uMode == 3) col = mix(vec3(0.9, 0.95, 1.0), vec3(0.05, 0.1, 0.3), clamp(dist / 80.0, 0.0, 1.0));",
    // EWA projection of the 3D covariance
    "  float z = -cam.z;",
    "  mat3 J = mat3(uFocal / z, 0.0, 0.0, 0.0, uFocal / z, 0.0, uFocal * cam.x / (z * z), uFocal * cam.y / (z * z), 0.0);",
    "  mat3 T = J * mat3(uView);",
    "  mat3 C = T * Sig * transpose(T);",
    "  float a = C[0][0] + 0.3, bb = C[0][1], c = C[1][1] + 0.3;",
    "  float mid = 0.5 * (a + c), rad = length(vec2(0.5 * (a - c), bb));",
    "  float l1 = mid + rad, l2 = max(mid - rad, 0.1);",
    "  vec2 v1 = abs(bb) > 1e-7 ? normalize(vec2(bb, l1 - a)) : (a >= c ? vec2(1.0, 0.0) : vec2(0.0, 1.0));",
    "  vec2 v2 = vec2(-v1.y, v1.x);",
    "  float r1 = min(3.0 * sqrt(l1), 900.0), r2 = min(3.0 * sqrt(l2), 900.0);",
    "  if (uMode == 2) { r1 = 1.5; r2 = 1.5; }",
    "  vec2 off = aCorner.x * r1 * v1 + aCorner.y * r2 * v2;",
    "  gl_Position = clip + vec4(off / uViewport * 2.0 * clip.w, 0.0, 0.0);",
    "  vPos = aCorner * 3.0;",
    "  vColor = vec4(max(col, vec3(0.0)), s.op);",
    "}",
  ].join("\n");

  var MAIN_FS = [
    "#version 300 es",
    "precision highp float;",
    "precision highp int;",
    "in vec4 vColor;",
    "in vec2 vPos;",
    "uniform int uMode;",
    "out vec4 o;",
    "void main() {",
    "  float r2 = dot(vPos, vPos);",
    "  if (uMode == 1) { if (r2 > 1.0) discard; o = vec4(vColor.rgb * (0.35 + 0.65 * sqrt(1.0 - r2)), 1.0); return; }",
    "  if (uMode == 2) { o = vec4(vColor.rgb, 1.0); return; }",
    "  if (uMode == 4) { float a = exp(-0.5 * r2); if (a < 1.0 / 255.0) discard; o = vec4(vec3(0.010, 0.004, 0.0012) * a, 0.0); return; }",
    "  float a = min(vColor.a * exp(-0.5 * r2), 0.995);",
    "  if (a < 1.0 / 255.0) discard;",
    "  o = vec4(vColor.rgb * a, a);",
    "}",
  ].join("\n");

  // shadow map: splat centres rendered as depth-only points from the sun
  var SHADOW_VS = COMMON + "\n" + [
    "uniform mat4 uLightVP;",
    "uniform float uPxPerM;",
    "in uint aIndex;",
    "void main() {",
    "  int i = int(aIndex);",
    "  S s = load(i);",
    "  if (s.cull || s.type == 1 || s.type == 6 || s.type == 7 || s.type == 9 || s.type == 10 || s.op < 0.3) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 1.0; return; }",
    "  float r = s.s;",
    "  if (s.type != 0) { vec4 t1 = F(i, 1), t2 = F(i, 2); r = sqrt(max(t1.x, max(t1.w, t2.y))); }",
    "  gl_Position = uLightVP * vec4(s.p, 1.0);",
    "  gl_PointSize = clamp(2.2 * r * uPxPerM, 1.0, 48.0);",
    "}",
  ].join("\n");
  var SHADOW_FS = "#version 300 es\nprecision highp float;\nvoid main() {}";

  var SKY_VS = "#version 300 es\nin vec2 aPos; out vec2 vUv; void main() { vUv = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }";
  var SKY_FS = [
    "#version 300 es",
    "precision highp float;",
    "in vec2 vUv;",
    "uniform vec3 uFwd, uRight, uUp, uSunDir, uZenith, uHorizon, uSunCol;",
    "uniform float uTanHalf, uAspect, uNight;",
    "out vec4 o;",
    "float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }",
    "void main() {",
    "  vec3 d = normalize(uFwd + vUv.x * uTanHalf * uAspect * uRight + vUv.y * uTanHalf * uUp);",
    "  float h = d.y;",
    "  vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(h, 0.55)) : mix(uHorizon, uHorizon * 0.55, min(-h * 4.0, 1.0));",
    "  float sd = max(dot(d, uSunDir), 0.0);",
    "  col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 40.0) * 0.35 + pow(sd, 6.0) * 0.12);",
    "  if (uNight > 0.0 && h > 0.0) {",
    "    vec3 q = floor(d * 420.0);",
    "    float st = step(0.9985, hash(q));",
    "    col += vec3(st) * uNight * (0.5 + 0.5 * hash(q + 3.0));",
    "    float md = max(dot(d, -uSunDir), 0.0);",
    "    col += vec3(0.8, 0.85, 1.0) * pow(md, 2000.0) * 4.0 * uNight;",
    "  }",
    "  o = vec4(col, 1.0);",
    "}",
  ].join("\n");

  var LINE_VS = "#version 300 es\nin vec3 aPos; uniform mat4 uVP; void main() { gl_Position = uVP * vec4(aPos, 1.0); gl_PointSize = 3.0; }";
  var LINE_FS = "#version 300 es\nprecision highp float; uniform vec4 uColor; out vec4 o; void main() { o = uColor; }";

  // ============================================================ the world
  function World() {
    this.data = new Float32Array(CAPACITY * TPS * 4);
    this.posW = new Float32Array(CAPACITY * 3); // world positions for sorting
    this.n = 0;
    this.H = new Float32Array(GRID * GRID);
    this.paint = new Uint8Array(GRID * GRID);
    this.objects = [];
    this.water = 0;
  }
  World.prototype.hAt = function (x, z) {
    var gx = Math.max(0, Math.min(GRID - 1.001, (x / WORLD + 0.5) * (GRID - 1)));
    var gz = Math.max(0, Math.min(GRID - 1.001, (z / WORLD + 0.5) * (GRID - 1)));
    var ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz, H = this.H;
    var a = H[iz * GRID + ix], b = H[iz * GRID + ix + 1], c = H[(iz + 1) * GRID + ix], d = H[(iz + 1) * GRID + ix + 1];
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  };
  World.prototype.nAt = function (x, z) {
    var e = CELL;
    var hx = this.hAt(x + e, z) - this.hAt(x - e, z), hz = this.hAt(x, z + e) - this.hAt(x, z - e);
    var l = Math.hypot(hx, 2 * e, hz);
    return [-hx / l, (2 * e) / l, -hz / l];
  };
  // same rules as biomeAt() in the shader, used when scattering vegetation
  World.prototype.biome = function (x, z, P) {
    var gi = Math.round((z / WORLD + 0.5) * (GRID - 1)) * GRID + Math.round((x / WORLD + 0.5) * (GRID - 1));
    if (this.paint[gi]) return this.paint[gi];
    var h = this.hAt(x, z), n = this.nAt(x, z);
    if (h < this.water + 0.6) return 3;
    if (n[1] < 0.74) return 5;
    if (h > P.snowLine) return 4;
    return P.desert ? 3 : 1;
  };

  // writes one splat. relative = y measured from the ground under (ax, az)
  World.prototype.push = function (type, x, y, z, ax, az, axes, sc, alb, nrm, op, aux) {
    if (this.n >= CAPACITY) return false;
    var o = this.n * TPS * 4, d = this.data;
    var c00 = 0, c01 = 0, c02 = 0, c11 = 0, c12 = 0, c22 = 0;
    if (axes) {
      for (var k = 0; k < 3; k++) {
        var a = axes[k], s2 = sc[k] * sc[k];
        c00 += a[0] * a[0] * s2; c01 += a[0] * a[1] * s2; c02 += a[0] * a[2] * s2;
        c11 += a[1] * a[1] * s2; c12 += a[1] * a[2] * s2; c22 += a[2] * a[2] * s2;
      }
    } else {
      c00 = sc[0]; // terrain: isotropic disc radius, oriented in the shader
    }
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = op;
    d[o + 4] = c00; d[o + 5] = c01; d[o + 6] = c02; d[o + 7] = c11;
    d[o + 8] = c12; d[o + 9] = c22; d[o + 10] = alb[0]; d[o + 11] = alb[1];
    d[o + 12] = alb[2]; d[o + 13] = nrm[0]; d[o + 14] = nrm[1]; d[o + 15] = nrm[2];
    d[o + 16] = ax; d[o + 17] = az; d[o + 18] = type; d[o + 19] = aux;
    this.updatePos(this.n);
    this.n++;
    return true;
  };
  World.prototype.updatePos = function (i) {
    var o = i * TPS * 4, d = this.data, t = d[o + 18], y = d[o + 1];
    if (t === T_WATER) y = this.water;
    else if (t !== T_CLOUD && t !== T_BACKDROP && t !== T_CAPTURE) y += this.hAt(d[o + 16], d[o + 17]);
    this.posW[i * 3] = d[o];
    this.posW[i * 3 + 1] = y;
    this.posW[i * 3 + 2] = d[o + 2];
  };

  // ---------------------------------------------------------- geometry kit
  function norm3(v) {
    var l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function frame(n, R) {
    var a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    var t = norm3(cross(a, n)), b = cross(n, t);
    var ang = R() * 6.2832, ca = Math.cos(ang), sa = Math.sin(ang);
    return [[t[0] * ca + b[0] * sa, t[1] * ca + b[1] * sa, t[2] * ca + b[2] * sa], [b[0] * ca - t[0] * sa, b[1] * ca - t[1] * sa, b[2] * ca - t[2] * sa], n];
  }
  function gauss(R) { return Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(6.2832 * R()); }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function scl(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
  function randDir(R) { return norm3([gauss(R), gauss(R), gauss(R)]); }

  // a tube along a cubic Bezier (trunks, branches, posts)
  function tube(W, type, ax, az, P, r0, r1, count, colA, colB, R) {
    for (var q = 0; q < count; q++) {
      var t = R(), u = 1 - t;
      var c = [0, 1, 2].map(function (k) { return u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]; });
      var dt = [0, 1, 2].map(function (k) { return 3 * u * u * (P[1][k] - P[0][k]) + 6 * u * t * (P[2][k] - P[1][k]) + 3 * t * t * (P[3][k] - P[2][k]); });
      var tg = norm3(dt);
      var bx = norm3(cross(tg, Math.abs(tg[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), by = cross(tg, bx);
      var ang = R() * 6.2832, ca = Math.cos(ang), sa = Math.sin(ang);
      var nn = [bx[0] * ca + by[0] * sa, bx[1] * ca + by[1] * sa, bx[2] * ca + by[2] * sa];
      var rad = r0 + (r1 - r0) * t;
      var col = mixc(colA, colB, 0.5 + 0.5 * Math.sin(ang * 7 + t * 30) * 0.6 + (R() - 0.5) * 0.4);
      var len = Math.max(rad * 1.4, 0.05);
      W.push(type, c[0] + nn[0] * rad, c[1] + nn[1] * rad, c[2] + nn[2] * rad, ax, az, [tg, cross(nn, tg), nn], [len, rad * 0.9, rad * 0.25], col, nn, 0.99, R());
    }
  }

  // ----------------------------------------------------------- objects
  var BUILDERS = {
    tree: function (W, x, z, R, s) {
      s = s || 0.8 + R() * 0.5;
      var th = 2.4 * s, lean = [gauss(R) * 0.25 * s, gauss(R) * 0.25 * s];
      var top = [x + lean[0], th, z + lean[1]];
      var bark = [0.26, 0.19, 0.13], bark2 = [0.42, 0.33, 0.24];
      tube(W, T_SOLID, x, z, [[x, -0.2, z], [x, th * 0.4, z], [x + lean[0] * 0.5, th * 0.8, z + lean[1] * 0.5], top], 0.2 * s, 0.11 * s, Math.round(150 * s), bark, bark2, R);
      var blobs = 4 + Math.floor(R() * 3);
      for (var b = 0; b < blobs; b++) {
        var ang = (b / blobs) * 6.2832 + R() * 0.8, rr = (b === 0 ? 0 : 1.1 + R() * 0.6) * s;
        var c = [top[0] + Math.cos(ang) * rr, th + (b === 0 ? 1.4 : 0.6 + R() * 1.1) * s, top[2] + Math.sin(ang) * rr];
        var br = (b === 0 ? 1.45 : 1.0 + R() * 0.35) * s;
        if (b > 0) tube(W, T_SOLID, x, z, [[top[0], th * 0.85, top[2]], [top[0], th * 1.0, top[2]], [(top[0] + c[0]) / 2, c[1] - 0.3, (top[2] + c[2]) / 2], [c[0], c[1] - 0.2, c[2]]], 0.08 * s, 0.03 * s, Math.round(30 * s), bark, bark2, R);
        var cnt = Math.round(95 * br * br);
        var hue = R() * 0.3;
        for (var q = 0; q < cnt; q++) {
          var dir = randDir(R), r = br * Math.pow(R(), 0.3);
          var p = [c[0] + dir[0] * r, c[1] + dir[1] * r * 0.8, c[2] + dir[2] * r];
          var depth = r / br;
          var ao = 0.4 + 0.6 * depth * (0.65 + 0.35 * (dir[1] * 0.5 + 0.5));
          var base = mixc([0.13, 0.3, 0.07], [0.33, 0.52, 0.13], R() * 0.7 + hue);
          var sz = 0.18 + 0.09 * R();
          W.push(T_LEAF, p[0], p[1], p[2], x, z, frame(randDir(R), R), [sz, sz * (0.45 + 0.3 * R()), sz * 0.12], scl(base, ao), dir, 0.9, R());
        }
      }
    },
    pine: function (W, x, z, R, s) {
      s = s || 0.8 + R() * 0.6;
      var th = 7.5 * s;
      tube(W, T_SOLID, x, z, [[x, -0.2, z], [x, th * 0.33, z], [x, th * 0.66, z], [x, th, z]], 0.22 * s, 0.04 * s, Math.round(110 * s), [0.25, 0.17, 0.11], [0.38, 0.27, 0.18], R);
      var tiers = 7;
      for (var k = 0; k < tiers; k++) {
        var f = k / tiers, ty = (1.3 + f * 5.8) * s, tr = (2.3 * (1 - f) + 0.35) * s;
        var cnt = Math.round(26 * tr * tr / s);
        for (var q = 0; q < cnt; q++) {
          var a = R() * 6.2832, rr = tr * Math.sqrt(R());
          var radial = [Math.cos(a), 0, Math.sin(a)];
          var y = ty - rr * 0.42 + gauss(R) * 0.08 * s;
          var nrm = norm3([radial[0] * 0.5, 1, radial[2] * 0.5]);
          var ao = 0.45 + 0.55 * (rr / tr) * (0.6 + 0.4 * f);
          var base = mixc([0.07, 0.2, 0.1], [0.15, 0.32, 0.15], R());
          var tang = [-radial[2], 0, radial[0]];
          W.push(T_NEEDLE, x + radial[0] * rr, y, z + radial[2] * rr, x, z, [norm3([radial[0], -0.4, radial[2]]), tang, nrm], [0.5 * s, 0.15 * s, 0.03 * s], scl(base, ao), nrm, 0.95, R());
        }
      }
    },
    sakura: function (W, x, z, R, s) {
      s = s || 0.8 + R() * 0.4;
      var th = 2.0 * s;
      var bark = [0.25, 0.15, 0.13], bark2 = [0.36, 0.24, 0.2];
      tube(W, T_SOLID, x, z, [[x, -0.2, z], [x + 0.2 * s, th * 0.5, z], [x - 0.2 * s, th * 0.9, z + 0.1], [x, th, z]], 0.17 * s, 0.1 * s, Math.round(110 * s), bark, bark2, R);
      for (var b = 0; b < 6; b++) {
        var ang = (b / 6) * 6.2832 + R() * 0.5, rr = (1.4 + R() * 0.8) * s;
        var c = [x + Math.cos(ang) * rr, th + (0.8 + R() * 0.8) * s, z + Math.sin(ang) * rr];
        tube(W, T_SOLID, x, z, [[x, th * 0.9, z], [x + Math.cos(ang) * rr * 0.3, th + 0.3, z + Math.sin(ang) * rr * 0.3], [(x + c[0]) / 2, c[1], (z + c[2]) / 2], c], 0.07 * s, 0.025 * s, Math.round(35 * s), bark, bark2, R);
        var br = (0.9 + R() * 0.3) * s, cnt = Math.round(110 * br * br);
        for (var q = 0; q < cnt; q++) {
          var dir = randDir(R), r = br * Math.pow(R(), 0.3);
          var ao = 0.55 + 0.45 * (r / br);
          var base = R() < 0.2 ? [0.98, 0.93, 0.95] : mixc([0.95, 0.62, 0.74], [1.0, 0.8, 0.88], R());
          var sz = 0.1 + 0.06 * R();
          W.push(T_BLOSSOM, c[0] + dir[0] * r, c[1] + dir[1] * r * 0.6, c[2] + dir[2] * r, x, z, frame(randDir(R), R), [sz, sz * 0.8, sz * 0.15], scl(base, ao), dir, 0.9, R());
        }
      }
    },
    rock: function (W, x, z, R, s) {
      s = s || 0.5 + R() * 1.1;
      var cnt = Math.round(260 * s * s + 40), seed = Math.floor(R() * 1e6);
      var sq = 0.55 + R() * 0.3;
      for (var q = 0; q < cnt; q++) {
        var dir = randDir(R);
        var bump = 0.75 + 0.5 * fbm(dir[0] * 1.5 + 3, dir[2] * 1.5 + dir[1] * 1.7, 3, seed);
        var r = s * bump;
        var p = [x + dir[0] * r, (dir[1] * sq + 0.15) * r, z + dir[2] * r];
        if (p[1] < -0.3 * s) continue;
        var moss = dir[1] > 0.45 && R() < 0.5;
        var base = moss ? mixc([0.25, 0.33, 0.14], [0.36, 0.42, 0.2], R()) : mixc([0.33, 0.32, 0.31], [0.55, 0.53, 0.5], R());
        var nrm = norm3([dir[0], dir[1] / sq, dir[2]]);
        var sz = (0.14 + 0.08 * R()) * Math.sqrt(s);
        W.push(T_SOLID, p[0], p[1], p[2], x, z, frame(nrm, R), [sz, sz, sz * 0.15], base, nrm, 0.99, R());
      }
    },
    flowers: function (W, x, z, R) {
      var palette = [[0.95, 0.85, 0.2], [0.95, 0.95, 0.98], [0.7, 0.4, 0.9], [0.95, 0.4, 0.45], [0.35, 0.55, 0.95]];
      var col = palette[Math.floor(R() * palette.length)];
      for (var q = 0; q < 70; q++) {
        var a = R() * 6.2832, r = 1.8 * Math.sqrt(R());
        var fx = x + Math.cos(a) * r, fz = z + Math.sin(a) * r, h = 0.15 + R() * 0.25;
        var c = R() < 0.25 ? palette[Math.floor(R() * palette.length)] : col;
        W.push(T_FLOWER, fx, h * 0.5, fz, fx, fz, [[0, 1, 0], [1, 0, 0], [0, 0, 1]], [h * 0.33, 0.006, 0.006], [0.2, 0.4, 0.12], [0, 1, 0], 0.95, R());
        W.push(T_FLOWER, fx, h, fz, fx, fz, frame([0, 1, 0], R), [0.035, 0.035, 0.012], c, [0, 1, 0], 0.98, R());
      }
    },
    cabin: function (W, x, z, R) {
      var rot = Math.floor(R() * 4) * 1.5708 + (R() - 0.5) * 0.3;
      var ca = Math.cos(rot), sa = Math.sin(rot);
      function tr(lx, ly, lz) { return [x + ca * lx - sa * lz, ly, z + sa * lx + ca * lz]; }
      function trd(v) { return [ca * v[0] - sa * v[2], v[1], sa * v[0] + ca * v[2]]; }
      var wx = 2.2, wz = 1.6, wh = 2.3, peak = 3.7, step = 0.13;
      function wall(axis, sign) {
        var len = axis === 0 ? wz : wx, nL = axis === 0 ? [sign, 0, 0] : [0, 0, sign];
        var n = trd(nL);
        for (var u = -len; u <= len; u += step)
          for (var v = 0; v <= wh + (axis === 0 ? (peak - wh) * (1 - Math.abs(u) / len) : 0); v += step) {
            var lx = axis === 0 ? sign * wx : u, lz = axis === 0 ? u : sign * wz;
            var p = tr(lx, v, lz);
            var plank = Math.floor(v / 0.22) % 2;
            var col = mixc([0.42, 0.27, 0.15], [0.5, 0.34, 0.19], plank * 0.6 + R() * 0.4);
            var type = T_SOLID;
            var isDoor = axis === 1 && sign > 0 && Math.abs(u) < 0.45 && v < 1.9;
            var isWin = (axis === 1 && Math.abs(Math.abs(u) - 1.3) < 0.38 && v > 1.0 && v < 1.75) || (axis === 0 && Math.abs(u) < 0.4 && v > 1.0 && v < 1.7);
            if (isDoor) col = [0.24, 0.14, 0.08];
            if (isWin && !isDoor) { type = T_EMISSIVE; col = [1.0, 0.72, 0.32]; }
            W.push(type, p[0], p[1], p[2], x, z, frame(n, R), [step * 0.85, step * 0.85, 0.02], col, n, 0.995, R());
          }
      }
      wall(0, 1); wall(0, -1); wall(1, 1); wall(1, -1);
      // pitched roof with shingles and overhang
      for (var side = -1; side <= 1; side += 2) {
        var nL = norm3([side * (peak - wh), wz + 0.4, 0]);
        var n = trd(nL);
        for (var u = 0; u <= 1; u += 0.055)
          for (var w = -wz - 0.4; w <= wz + 0.4; w += 0.12) {
            var lx = side * (wx + 0.35) * (1 - u), ly = wh - 0.1 + (peak - wh + 0.2) * u;
            var p = tr(lx, ly, w);
            var row = Math.floor(u * 22) % 2;
            var col = mixc([0.45, 0.13, 0.09], [0.6, 0.2, 0.12], row * 0.5 + R() * 0.5);
            W.push(T_SOLID, p[0], p[1] + 0.03, p[2], x, z, frame(n, R), [0.12, 0.12, 0.02], col, n, 0.995, R());
          }
      }
      // chimney with a wisp of smoke-coloured cloud
      for (var q = 0; q < 160; q++) {
        var cp = tr(-1.1 + (R() - 0.5) * 0.4, 3.0 + R() * 1.3, -0.5 + (R() - 0.5) * 0.4);
        W.push(T_SOLID, cp[0], cp[1], cp[2], x, z, frame(randDir(R), R), [0.08, 0.08, 0.03], mixc([0.4, 0.38, 0.36], [0.55, 0.5, 0.45], R()), [0, 1, 0], 0.99, R());
      }
      // stepping-stone path and a door lantern
      for (var k = 0; k < 7; k++) {
        var sp = tr((R() - 0.5) * 0.4, 0.02, wz + 0.7 + k * 0.75);
        for (var m = 0; m < 10; m++) W.push(T_SOLID, sp[0] + gauss(R) * 0.12, 0.03, sp[2] + gauss(R) * 0.12, sp[0], sp[2], frame([0, 1, 0], R), [0.12, 0.1, 0.02], [0.55, 0.53, 0.5], [0, 1, 0], 0.99, R());
      }
      var lp = tr(0.75, 2.0, wz + 0.12);
      W.push(T_EMISSIVE, lp[0], lp[1], lp[2], x, z, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.08, 0.08, 0.08], [1, 0.8, 0.45], [0, 1, 0], 0.99, R());
      W.push(T_EMISSIVE, lp[0], lp[1], lp[2], x, z, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.45, 0.45, 0.45], [0.6, 0.4, 0.2], [0, 1, 0], 0.18, R());
    },
    lantern: function (W, x, z, R) {
      tube(W, T_SOLID, x, z, [[x, 0, z], [x, 0.6, z], [x, 1.2, z], [x, 1.7, z]], 0.05, 0.04, 60, [0.15, 0.1, 0.07], [0.22, 0.15, 0.1], R);
      for (var q = 0; q < 40; q++) {
        var d = randDir(R);
        W.push(T_SOLID, x + d[0] * 0.16, 1.9 + d[1] * 0.2, z + d[2] * 0.16, x, z, frame(d, R), [0.06, 0.06, 0.015], [0.18, 0.12, 0.08], d, 0.6, R());
      }
      W.push(T_EMISSIVE, x, 1.9, z, x, z, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.1, 0.13, 0.1], [1, 0.75, 0.35], [0, 1, 0], 0.99, R());
      W.push(T_EMISSIVE, x, 1.9, z, x, z, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.6, 0.6, 0.6], [0.7, 0.45, 0.2], [0, 1, 0], 0.16, R());
    },
  };

  World.prototype.addObject = function (kind, x, z, R, s) {
    var start = this.n;
    BUILDERS[kind](this, x, z, R, s);
    var obj = { kind: kind, x: x, z: z, start: start, count: this.n - start, alive: true };
    this.objects.push(obj);
    return obj;
  };

  // ------------------------------------------------------------ generator
  World.prototype.generate = function (P) {
    var R = mulberry32(P.seed);
    var s = P.seed % 1000;
    var W = this, i, x, z;
    this.n = 0;
    this.objects = [];
    this.paint.fill(0);
    this.water = 0;
    var lakeX = (R() - 0.5) * 30, lakeZ = (R() - 0.5) * 30 + 6, lakeR = 11 + R() * 6;
    for (var gz = 0; gz < GRID; gz++)
      for (var gx = 0; gx < GRID; gx++) {
        x = -HALF + gx * CELL;
        z = -HALF + gz * CELL;
        var h = (fbm(x * 0.03, z * 0.03, 5, s) - 0.42) * 7 * P.relief;
        var mask = smoothstep(0.42, 0.75, fbm(x * 0.011 + 40, z * 0.011 - 20, 3, s + 5));
        var edge = smoothstep(0.55, 1.0, Math.max(Math.abs(x), Math.abs(z)) / HALF);
        h += Math.pow(ridged(x * 0.02 + 9, z * 0.02 + 3, 5, s + 9), 2.0) * 24 * P.mountains * Math.max(mask, edge * 0.8);
        if (P.lake) {
          var dl = Math.hypot(x - lakeX, z - lakeZ);
          h -= 5.5 * Math.exp(-(dl * dl) / (lakeR * lakeR));
        }
        if (P.island) h = h * 0.6 + 2.2 - smoothstep(0.35, 0.95, Math.hypot(x, z) / HALF) * 9;
        if (P.desert) h += Math.sin(x * 0.22 + fbm(x * 0.05, z * 0.05, 3, s + 2) * 7) * 0.7 + 0.8;
        this.H[gz * GRID + gx] = h;
      }
    var best = null;
    for (i = 0; i < 400; i++) {
      var vx = (R() - 0.5) * 50, vz = (R() - 0.5) * 50, vh = this.hAt(vx, vz), vn = this.nAt(vx, vz);
      if (vh < 1.0 || vh > P.snowLine - 3) continue;
      var score = Math.hypot(vx, vz) * 0.05 + (1 - vn[1]) * 30 + Math.abs(vh - 2) * 0.2;
      if (!best || score < best.score) best = { x: vx, z: vz, h: vh, score: score };
    }
    if (!best) best = { x: 3, z: -4, h: Math.max(this.hAt(3, -4), 1.5) };
    this.village = best;
    for (gz = 0; gz < GRID; gz++)
      for (gx = 0; gx < GRID; gx++) {
        var dv = Math.hypot(-HALF + gx * CELL - best.x, -HALF + gz * CELL - best.z);
        var k = gz * GRID + gx;
        this.H[k] += (Math.max(best.h, 1.2) - this.H[k]) * Math.exp(-(dv * dv) / 90) * 0.85;
      }

    // terrain surfels on a jittered grid
    var sp = 0.4;
    for (z = -HALF; z < HALF; z += sp)
      for (x = -HALF; x < HALF; x += sp) {
        var px = x + (R() - 0.5) * sp * 0.8, pz = z + (R() - 0.5) * sp * 0.8;
        var moist = fbm(px * 0.06 + 100, pz * 0.06, 3, s + 3);
        W.push(T_TERRAIN, px, 0, pz, px, pz, null, [0.31], [moist, 0, 0], [0, 1, 0], 1, R());
      }
    // water sheet (shown wherever the terrain is below the water level)
    for (z = -HALF; z < HALF; z += 0.6)
      for (x = -HALF; x < HALF; x += 0.6) {
        if (this.hAt(x, z) > this.water + 3) continue;
        W.push(T_WATER, x + (R() - 0.5) * 0.3, 0, z + (R() - 0.5) * 0.3, x, z, [[1, 0, 0], [0, 0, 1], [0, 1, 0]], [0.5, 0.5, 0.02], [0.1, 0.3, 0.4], [0, 1, 0], 0.9, R());
      }
    // grass tufts: thin, elongated vertical Gaussians
    var tufts = Math.round(17000 * P.grass);
    for (i = 0; i < tufts; i++) {
      x = (R() - 0.5) * WORLD * 0.98;
      z = (R() - 0.5) * WORLD * 0.98;
      if (this.biome(x, z, P) !== 1 || fbm(x * 0.08, z * 0.08, 2, s + 8) < 0.35) continue;
      var gcol = mixc([0.18, 0.34, 0.08], [0.42, 0.55, 0.17], R());
      for (var b = 0; b < 3; b++) {
        var bx = x + gauss(R) * 0.07, bz = z + gauss(R) * 0.07, hgt = 0.25 + R() * 0.35;
        var lean = norm3([gauss(R) * 0.25, 1, gauss(R) * 0.25]);
        W.push(T_GRASS, bx, hgt * 0.5, bz, bx, bz, [lean, norm3(cross(lean, [0, 0, 1])), norm3(cross(lean, [1, 0, 0]))], [hgt * 0.38, 0.011, 0.011], scl(gcol, 0.8 + 0.4 * R()), [0, 1, 0], 0.95, R());
      }
    }
    // objects scattered by rules (biome, slope, spacing)
    var placed = [];
    function ok(x, z, minD, need) {
      var b = W.biome(x, z, P);
      if (need.indexOf(b) < 0) return false;
      for (var k = 0; k < placed.length; k++) if (Math.hypot(placed[k][0] - x, placed[k][1] - z) < minD) return false;
      return true;
    }
    function scatter(kind, count, minD, need, inner) {
      for (var t = 0, c = 0; t < count * 12 && c < count; t++) {
        var lim = (inner || 0.92) * HALF;
        var x = (R() - 0.5) * 2 * lim, z = (R() - 0.5) * 2 * lim;
        if (Math.hypot(x - W.village.x, z - W.village.z) < 8 && kind !== "cabin" && kind !== "lantern" && kind !== "flowers") continue;
        if (!ok(x, z, minD, need)) continue;
        placed.push([x, z]);
        W.addObject(kind, x, z, R);
        c++;
      }
    }
    for (var c = 0; c < P.cabins; c++) {
      var a = (c / Math.max(1, P.cabins)) * 6.2832 + R();
      var cx = this.village.x + Math.cos(a) * (c === 0 ? 0 : 8 + R() * 4), cz = this.village.z + Math.sin(a) * (c === 0 ? 0 : 8 + R() * 4);
      if (this.hAt(cx, cz) < this.water + 0.8) continue;
      placed.push([cx, cz]);
      W.addObject("cabin", cx, cz, R);
    }
    for (c = 0; c < P.lanterns; c++) {
      var la = R() * 6.2832, lr = 4 + R() * 9, lx = this.village.x + Math.cos(la) * lr, lz = this.village.z + Math.sin(la) * lr;
      if (this.hAt(lx, lz) > this.water + 0.4 && ok(lx, lz, 2.5, [1, 2, 3, 5, 6])) { placed.push([lx, lz]); W.addObject("lantern", lx, lz, R); }
    }
    scatter("pine", P.pine, 2.6, [1, 4, 5], 0.95);
    scatter("tree", P.broad, 3.2, [1, 2], 0.9);
    scatter("sakura", P.sakura, 3.4, [1, 2], 0.7);
    scatter("rock", P.rocks, 2, [1, 3, 4, 5], 0.95);
    scatter("flowers", Math.round(28 * P.flowers), 1.5, [1], 0.85);
    // clouds
    for (c = 0; c < P.clouds; c++) {
      var ccx = (R() - 0.5) * WORLD * 2, ccz = (R() - 0.5) * WORLD * 1.6, ccy = 26 + R() * 14, cr = 5 + R() * 6;
      for (var q = 0; q < 70; q++) {
        var d = randDir(R), rr = cr * Math.pow(R(), 0.5);
        var cs = (1.6 + R() * 2.2) * (cr / 8);
        W.push(T_CLOUD, ccx + d[0] * rr, ccy + d[1] * rr * 0.35, ccz + d[2] * rr * 0.6, 0, 0, frame(randDir(R), R), [cs * 1.4, cs, cs * 0.8], scl([1, 1, 1], 0.85 + 0.15 * (d[1] * 0.5 + 0.5)), [0, 1, 0], 0.42, R());
      }
    }
    // distant mountain ring, so the world does not end at a hard edge
    for (var ang = 0; ang < 6.2832; ang += 0.012) {
      var rad = 82 + 10 * fbm(Math.cos(ang) * 3, Math.sin(ang) * 3, 3, s + 21);
      var ridge = 6 + 26 * Math.pow(ridged(Math.cos(ang) * 2.5 + 5, Math.sin(ang) * 2.5, 4, s + 22), 1.6);
      for (var y = -4; y < ridge; y += 2.4) {
        var hz = mixc([0.32, 0.38, 0.45], [0.55, 0.6, 0.68], y / 30);
        if (ridge - y < 4 && P.season !== 1) hz = [0.85, 0.88, 0.92];
        W.push(T_BACKDROP, Math.cos(ang) * rad, y, Math.sin(ang) * rad, 0, 0, frame([Math.cos(ang), 0, Math.sin(ang)], R), [2.2, 2.0, 0.5], hz, [0, 1, 0], 0.95, R());
      }
    }
  };

  World.prototype.allPositions = function () {
    for (var i = 0; i < this.n; i++) this.updatePos(i);
  };

  // terrain ray cast (march + bisection)
  World.prototype.raycast = function (ro, rd) {
    var t = 0.5, prev = 0, last = null;
    for (var k = 0; k < 600; k++) {
      var p = [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
      if (Math.abs(p[0]) > HALF || Math.abs(p[2]) > HALF) {
        if (last !== null) return null;
      } else {
        var h = Math.max(this.hAt(p[0], p[2]), this.water);
        if (p[1] < h) {
          var lo = prev, hi = t;
          for (var b = 0; b < 12; b++) {
            var m = (lo + hi) / 2, q = [ro[0] + rd[0] * m, ro[1] + rd[1] * m, ro[2] + rd[2] * m];
            if (q[1] < Math.max(this.hAt(q[0], q[2]), this.water)) hi = m;
            else lo = m;
          }
          return [ro[0] + rd[0] * hi, ro[1] + rd[1] * hi, ro[2] + rd[2] * hi];
        }
        last = t;
      }
      prev = t;
      t += Math.max(0.15, t * 0.01);
      if (t > 260) break;
    }
    return null;
  };

  // ========================================================== PLY import
  // Reads a standard 3DGS training output (binary little-endian PLY with
  // x, y, z, f_dc_0..2, optional f_rest_*, opacity as a logit, scale_0..2 as
  // logs and rot_0..3 as a quaternion w, x, y, z). Throws "bad" otherwise.
  var PLY_SIZES = { char: 1, int8: 1, uchar: 1, uint8: 1, short: 2, int16: 2, ushort: 2, uint16: 2, int: 4, int32: 4, uint: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  var PLY_REQUIRED = ["x", "y", "z", "f_dc_0", "f_dc_1", "f_dc_2", "opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"];
  function parsePly(buf) {
    var bytes = new Uint8Array(buf), head = "", end = -1;
    for (var i = 0; i < Math.min(bytes.length, 1 << 16); i++) {
      head += String.fromCharCode(bytes[i]);
      if (bytes[i] === 10 && /(^|\n)end_header\r?\n$/.test(head)) { end = i + 1; break; }
    }
    if (end < 0) throw new Error("bad");
    var lines = head.split(/\r?\n/), elems = [], el = null;
    if (lines[0].trim() !== "ply") throw new Error("bad");
    lines.forEach(function (ln) {
      var w = ln.trim().split(/\s+/);
      if (w[0] === "format" && w[1] !== "binary_little_endian") throw new Error("bad");
      if (w[0] === "element") { el = { name: w[1], count: +w[2], props: [], stride: 0, list: false }; elems.push(el); }
      else if (w[0] === "property" && el) {
        if (w[1] === "list") { el.list = true; return; }
        var size = PLY_SIZES[w[1]];
        if (!size) throw new Error("bad");
        el.props.push({ name: w[2], type: w[1], off: el.stride });
        el.stride += size;
      }
    });
    var offset = end, vert = null;
    for (var e = 0; e < elems.length && !vert; e++) {
      if (elems[e].name === "vertex") vert = elems[e];
      else if (elems[e].list) throw new Error("bad");
      else offset += elems[e].count * elems[e].stride;
    }
    if (!vert || vert.list || !(vert.count > 0) || offset + vert.count * vert.stride > bytes.length) throw new Error("bad");
    var dv = new DataView(buf), props = {};
    vert.props.forEach(function (p) { props[p.name] = p; });
    var get = {};
    PLY_REQUIRED.forEach(function (name) {
      var p = props[name];
      if (!p) throw new Error("bad");
      var off = offset + p.off, s = vert.stride;
      get[name] = p.type === "float" || p.type === "float32" ? function (i) { return dv.getFloat32(off + i * s, true); }
        : p.type === "double" || p.type === "float64" ? function (i) { return dv.getFloat64(off + i * s, true); }
        : function () { throw new Error("bad"); };
    });
    var shRest = vert.props.filter(function (p) { return /^f_rest_/.test(p.name); }).length;
    return { n: vert.count, get: get, shRest: shRest };
  }

  // Converts parsed splats into the renderer's layout (type T_CAPTURE), keeping
  // at most `cap` of them (the most significant by opacity x volume). The scene
  // is recentred on its median and scaled so most of it fits in a 10-unit ball.
  // flip = rotate 180 degrees about x (3DGS / COLMAP captures are usually y-down).
  function buildCapture(W, ply, cap, flip) {
    var g = ply.get, n = ply.n, keep = null, i, k;
    var C0 = 0.28209479177387814;
    function sigmoid(v) { return 1 / (1 + Math.exp(-v)); }
    if (n > cap) {
      var imp = new Float32Array(n);
      for (i = 0; i < n; i++) imp[i] = sigmoid(g.opacity(i)) * Math.exp(g.scale_0(i) + g.scale_1(i) + g.scale_2(i));
      var step = Math.max(1, Math.floor(n / 200000)), sample = [];
      for (i = 0; i < n; i += step) sample.push(imp[i]);
      sample.sort(function (a, b) { return a - b; });
      var thr = sample[Math.min(sample.length - 1, Math.floor((1 - cap / n) * sample.length))];
      keep = new Uint32Array(cap);
      k = 0;
      for (i = 0; i < n && k < cap; i++) if (imp[i] > thr) keep[k++] = i;
      for (i = 0; i < n && k < cap; i++) if (imp[i] === thr) keep[k++] = i; // ties last
      keep = keep.subarray(0, k);
    }
    var count = keep ? keep.length : n;
    function idx(j) { return keep ? keep[j] : j; }
    // robust framing: median centre, 80th-percentile radius
    var sy = flip ? -1 : 1, st = Math.max(1, Math.floor(count / 50000)), xs = [], ys = [], zs = [];
    for (k = 0; k < count; k += st) { i = idx(k); xs.push(g.x(i)); ys.push(sy * g.y(i)); zs.push(sy * g.z(i)); }
    function median(a) { a = a.slice().sort(function (p, q) { return p - q; }); return a[a.length >> 1]; }
    var c = [median(xs), median(ys), median(zs)], ds = [];
    for (k = 0; k < xs.length; k++) ds.push(Math.hypot(xs[k] - c[0], ys[k] - c[1], zs[k] - c[2]));
    ds.sort(function (p, q) { return p - q; });
    var r = ds[Math.floor(ds.length * 0.8)] || 1, s = 10 / r;
    W.n = 0;
    W.objects = [];
    W.water = 0;
    for (k = 0; k < count; k++) {
      i = idx(k);
      var qw = g.rot_0(i), qx = g.rot_1(i), qy = g.rot_2(i), qz = g.rot_3(i);
      var ql = Math.hypot(qw, qx, qy, qz) || 1;
      qw /= ql; qx /= ql; qy /= ql; qz /= ql;
      // columns of the rotation matrix = principal axes of the Gaussian
      var a0 = [1 - 2 * (qy * qy + qz * qz), sy * 2 * (qx * qy + qw * qz), sy * 2 * (qx * qz - qw * qy)];
      var a1 = [2 * (qx * qy - qw * qz), sy * (1 - 2 * (qx * qx + qz * qz)), sy * 2 * (qy * qz + qw * qx)];
      var a2 = [2 * (qx * qz + qw * qy), sy * 2 * (qy * qz - qw * qx), sy * (1 - 2 * (qx * qx + qy * qy))];
      var sc = [Math.exp(g.scale_0(i)) * s, Math.exp(g.scale_1(i)) * s, Math.exp(g.scale_2(i)) * s];
      var col = [Math.max(0, 0.5 + C0 * g.f_dc_0(i)), Math.max(0, 0.5 + C0 * g.f_dc_1(i)), Math.max(0, 0.5 + C0 * g.f_dc_2(i))];
      var x = (g.x(i) - c[0]) * s, y = (sy * g.y(i) - c[1]) * s, z = (sy * g.z(i) - c[2]) * s;
      if (!isFinite(x + y + z + sc[0] + sc[1] + sc[2])) continue;
      W.push(T_CAPTURE, x, y, z, 0, 0, [a0, a1, a2], sc, col, [0, 1, 0], sigmoid(g.opacity(i)), 0);
    }
    return { total: n, kept: W.n };
  }

  // ============================================================= sorting
  // Runs inside a Web Worker (or on the main thread as a fallback).
  function sortCore(pos, n, eye, f) {
    var depth = new Float32Array(n), mn = Infinity, mx = -Infinity, i, z;
    for (i = 0; i < n; i++) {
      z = (pos[3 * i] - eye[0]) * f[0] + (pos[3 * i + 1] - eye[1]) * f[1] + (pos[3 * i + 2] - eye[2]) * f[2];
      z = z < 0.05 ? 0.05 : z > 300 ? 300 : z;
      depth[i] = z;
      if (z < mn) mn = z;
      if (z > mx) mx = z;
    }
    var counts = new Uint32Array(65536), keys = new Uint16Array(n), sc = 65535 / Math.max(mx - mn, 1e-6);
    for (i = 0; i < n; i++) {
      var k = (65535 - (depth[i] - mn) * sc) | 0; // far first
      keys[i] = k;
      counts[k]++;
    }
    for (var s = 0, j = 0; j < 65536; j++) {
      var c = counts[j];
      counts[j] = s;
      s += c;
    }
    var order = new Uint32Array(n);
    for (i = 0; i < n; i++) order[counts[keys[i]]++] = i;
    return order;
  }
  function workerMain() {
    var pos = null, n = 0;
    self.onmessage = function (e) {
      var d = e.data;
      if (d.pos) { pos = d.pos; n = d.n; }
      if (d.eye && pos) {
        var t0 = Date.now();
        var order = SORT(pos, n, d.eye, d.fwd);
        self.postMessage({ order: order, n: n, ms: Date.now() - t0, id: d.id }, [order.buffer]);
      }
    };
  }

  // ================================================================ init
  var started = false;
  function start() {
    if (started) return;
    started = true;
    var gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false });
    if (!gl) return fail();

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function program(vs, fs, attribs) {
      var p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      attribs.forEach(function (a, i) { gl.bindAttribLocation(p, i, a); });
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      var u = {};
      for (var i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
        var info = gl.getActiveUniform(p, i);
        u[info.name] = gl.getUniformLocation(p, info.name);
      }
      return { p: p, u: u };
    }
    var Pm, Ps, Psky, Pline;
    try {
      Pm = program(MAIN_VS, MAIN_FS, ["aCorner", "aIndex"]);
      Ps = program(SHADOW_VS, SHADOW_FS, ["aCorner", "aIndex"]);
      Psky = program(SKY_VS, SKY_FS, ["aPos"]);
      Pline = program(LINE_VS, LINE_FS, ["aPos"]);
    } catch (e) {
      if (window.console) console.warn(e);
      return fail();
    }

    // ------------------------------------------------------------ GPU state
    var rows = Math.ceil((CAPACITY * TPS) / TEX_W);
    var dataTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, dataTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, TEX_W, rows);
    [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST); });
    function floatTex(internal, fmt, type) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, GRID, GRID, 0, fmt, type, null);
      [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST); });
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    var heightTex = floatTex(gl.R32F, gl.RED, gl.FLOAT);
    var paintTex = floatTex(gl.R8, gl.RED, gl.UNSIGNED_BYTE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    var SHADOW_RES = 2048;
    var shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_RES, SHADOW_RES);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    var shadowFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var cornerBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var orderBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, orderBuf);
    gl.bufferData(gl.ARRAY_BUFFER, CAPACITY * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    // shadow pass draws one point per splat in index order
    var shadowVao = gl.createVertexArray();
    gl.bindVertexArray(shadowVao);
    var identBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, identBuf);
    var ident = new Uint32Array(CAPACITY);
    for (var ii = 0; ii < CAPACITY; ii++) ident[ii] = ii;
    gl.bufferData(gl.ARRAY_BUFFER, ident, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, 0, 0);
    var quadVao = gl.createVertexArray();
    gl.bindVertexArray(quadVao);
    var quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var lineVao = gl.createVertexArray();
    gl.bindVertexArray(lineVao);
    var lineBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 4 * 3 * 129, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    var world = new World();
    var drawCount = 0;

    function uploadRows(fromSplat, toSplat) {
      if (toSplat <= fromSplat) return;
      var r0 = Math.floor((fromSplat * TPS) / TEX_W), r1 = Math.ceil((toSplat * TPS) / TEX_W);
      r1 = Math.min(r1, rows);
      gl.bindTexture(gl.TEXTURE_2D, dataTex);
      var need = r1 * TEX_W * 4;
      var view = world.data.subarray(r0 * TEX_W * 4, Math.min(need, world.data.length));
      if (view.length < (r1 - r0) * TEX_W * 4) {
        var tmp = new Float32Array((r1 - r0) * TEX_W * 4);
        tmp.set(view);
        view = tmp;
      }
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r0, TEX_W, r1 - r0, gl.RGBA, gl.FLOAT, view);
    }
    function uploadHeight() {
      gl.bindTexture(gl.TEXTURE_2D, heightTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GRID, GRID, gl.RED, gl.FLOAT, world.H);
    }
    function uploadPaint() {
      gl.bindTexture(gl.TEXTURE_2D, paintTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GRID, GRID, gl.RED, gl.UNSIGNED_BYTE, world.paint);
    }

    // ------------------------------------------------------------- sorting
    var worker = null, sortBusy = false, sortMs = 0, sortId = 0, sortEpoch = 0, posDirty = true;
    try {
      var src = "var SORT = " + sortCore.toString() + ";\n(" + workerMain.toString() + ")();";
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: "application/javascript" })));
      worker.onmessage = function (e) {
        sortBusy = false;
        if (e.data.id < sortEpoch) return; // sorted before the scene was swapped
        gl.bindBuffer(gl.ARRAY_BUFFER, orderBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, e.data.order);
        drawCount = e.data.n;
        sortMs = sortMs * 0.7 + e.data.ms * 0.3;
      };
      worker.onerror = function () { worker = null; sortBusy = false; };
    } catch (e) {
      worker = null;
    }
    function requestSort(eye, fwd) {
      if (sortBusy) return false;
      if (worker) {
        sortBusy = true;
        var msg = { eye: eye, fwd: fwd, id: ++sortId };
        if (posDirty) {
          msg.pos = world.posW.slice(0, world.n * 3);
          msg.n = world.n;
          posDirty = false;
        }
        worker.postMessage(msg, msg.pos ? [msg.pos.buffer] : []);
      } else {
        var t0 = performance.now();
        var order = sortCore(world.posW, world.n, eye, fwd);
        gl.bindBuffer(gl.ARRAY_BUFFER, orderBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, order);
        drawCount = world.n;
        sortMs = sortMs * 0.7 + (performance.now() - t0) * 0.3;
      }
      return true;
    }

    // ---------------------------------------------------------------- state
    var st = {
      tool: "orbit", obj: "tree", biome: 1, brush: 4, time: 10.5, season: 1, wind: 0.8, fog: 0.012,
      waterOffset: 0, shadows: true, timelapse: false, mode: 0, params: null,
    };
    var cam = { target: [0, 2, 0], yaw: 0.7, pitch: 0.42, dist: 38, pos: [0, 10, 30], walkYaw: 0, walkPitch: 0 };
    var shadowDirty = true;
    var lastSort = { eye: [1e9, 0, 0], fwd: [0, 0, 0], n: -1 };

    function generate(text) {
      var P = parsePrompt(text);
      st.params = P;
      world.generate(P);
      st.season = P.season;
      st.time = P.time;
      st.fog = P.fog;
      st.wind = P.wind;
      st.waterOffset = 0;
      drawCount = Math.min(drawCount, world.n);
      uploadRows(0, world.n);
      uploadHeight();
      uploadPaint();
      posDirty = true;
      shadowDirty = true;
      lastSort.n = -1;
      var v = world.village;
      cam.target = [v.x, Math.max(world.hAt(v.x, v.z), world.water) + 1.5, v.z];
      cam.dist = 38;
      syncControls();
      showTags(P.tags);
    }

    // --------------------------------------------------------- environment
    function environment() {
      var t = st.time;
      var elev = Math.sin(((t - 6) / 12) * Math.PI); // -1..1
      var az = ((t - 6) / 12) * Math.PI;
      var sun = norm3([Math.cos(az) * 0.85, elev, Math.sin(az) * 0.45 + 0.3]);
      var day = smoothstep(-0.12, 0.25, elev), golden = Math.exp(-Math.pow((elev - 0.08) / 0.16, 2));
      var night = 1 - smoothstep(-0.2, 0.02, elev);
      var zen = mixc(mixc([0.01, 0.02, 0.05], [0.18, 0.4, 0.78], day), [0.32, 0.36, 0.62], golden * 0.5);
      var hor = mixc(mixc([0.04, 0.06, 0.11], [0.64, 0.76, 0.9], day), [0.98, 0.58, 0.32], golden * 0.75);
      var sunCol = mixc([1.05, 1.0, 0.92], [1.1, 0.6, 0.3], golden);
      var lightDir = sun, lightCol = scl(sunCol, day * 1.05 + golden * 0.35);
      if (elev < 0) { // moonlight
        lightDir = norm3([-sun[0], Math.max(-sun[1], 0.25), -sun[2]]);
        lightCol = scl([0.35, 0.42, 0.6], 0.55 * night);
      }
      var sky = mixc(scl(zen, 0.75), hor, 0.35);
      if (st.season === 3) sky = mixc(sky, [0.7, 0.75, 0.8], 0.15 * day);
      return {
        sun: sun, lightDir: lightDir, lightCol: lightCol, zenith: zen, horizon: hor, sunCol: scl(sunCol, day + golden * 0.5),
        skyAmb: scl(sky, 1.05), groundAmb: scl([0.24, 0.21, 0.17], 0.45 * day + 0.08), night: night,
      };
    }

    function lightMatrix(L) {
      var c = [0, 0, 0], eye = [L[0] * 90, L[1] * 90, L[2] * 90];
      var f = norm3([c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]]);
      var up = Math.abs(f[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
      var r = norm3(cross(f, up)), u = cross(r, f);
      var view = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0,
        -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]), -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]), f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2], 1];
      var e = 72, n = 1, fa = 200;
      var proj = [1 / e, 0, 0, 0, 0, 1 / e, 0, 0, 0, 0, -2 / (fa - n), 0, 0, 0, -(fa + n) / (fa - n), 1];
      return mul(proj, view);
    }
    function mul(a, b) {
      var o = new Float32Array(16);
      for (var c = 0; c < 4; c++)
        for (var r = 0; r < 4; r++) {
          var s = 0;
          for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
          o[c * 4 + r] = s;
        }
      return o;
    }

    function cameraBasis() {
      var eye, fwd;
      if (st.tool === "walk") {
        var g = world.hAt(cam.pos[0], cam.pos[2]);
        cam.pos[1] = Math.max(g, world.water) + 1.7;
        eye = cam.pos.slice();
        fwd = [Math.cos(cam.walkPitch) * Math.sin(cam.walkYaw), Math.sin(cam.walkPitch), -Math.cos(cam.walkPitch) * Math.cos(cam.walkYaw)];
      } else {
        var cp = Math.cos(cam.pitch);
        eye = [cam.target[0] + cam.dist * cp * Math.sin(cam.yaw), cam.target[1] + cam.dist * Math.sin(cam.pitch), cam.target[2] + cam.dist * cp * Math.cos(cam.yaw)];
        if (!capture) {
          var gh = world.hAt(eye[0], eye[2]);
          if (eye[1] < gh + 1) eye[1] = gh + 1;
        }
        fwd = norm3([cam.target[0] - eye[0], cam.target[1] - eye[1], cam.target[2] - eye[2]]);
      }
      var right = norm3(cross(fwd, [0, 1, 0])), up = cross(right, fwd);
      var view = [right[0], up[0], -fwd[0], 0, right[1], up[1], -fwd[1], 0, right[2], up[2], -fwd[2], 0,
        -(right[0] * eye[0] + right[1] * eye[1] + right[2] * eye[2]), -(up[0] * eye[0] + up[1] * eye[1] + up[2] * eye[2]), fwd[0] * eye[0] + fwd[1] * eye[1] + fwd[2] * eye[2], 1];
      var fov = (st.tool === "walk" ? 62 : 48) * Math.PI / 180, aspect = canvas.width / canvas.height, near = 0.1, far = 400;
      var tt = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
      var proj = [tt / aspect, 0, 0, 0, 0, tt, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
      return { eye: eye, fwd: fwd, right: right, up: up, view: view, proj: proj, vp: mul(proj, view), tanHalf: 1 / tt, aspect: aspect, focal: (canvas.height / 2) * tt };
    }
    var B = null;

    function rayAt(mx, my) {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var nx = (mx / w) * 2 - 1, ny = 1 - (my / h) * 2;
      return norm3([0, 1, 2].map(function (k) { return B.fwd[k] + B.right[k] * nx * B.tanHalf * B.aspect + B.up[k] * ny * B.tanHalf; }));
    }

    // ------------------------------------------------------------- editing
    var brushPoint = null;
    function applyBrush(p, dt) {
      var r = st.brush, H = world.H, changedH = false, changedP = false;
      var g0x = Math.max(0, Math.floor(((p[0] - r) / WORLD + 0.5) * (GRID - 1))), g1x = Math.min(GRID - 1, Math.ceil(((p[0] + r) / WORLD + 0.5) * (GRID - 1)));
      var g0z = Math.max(0, Math.floor(((p[2] - r) / WORLD + 0.5) * (GRID - 1))), g1z = Math.min(GRID - 1, Math.ceil(((p[2] + r) / WORLD + 0.5) * (GRID - 1)));
      var copy = st.tool === "smooth" ? H.slice() : null;
      for (var gz = g0z; gz <= g1z; gz++)
        for (var gx = g0x; gx <= g1x; gx++) {
          var x = -HALF + gx * CELL, z = -HALF + gz * CELL;
          var d = Math.hypot(x - p[0], z - p[2]);
          if (d > r) continue;
          var f = 0.5 + 0.5 * Math.cos((d / r) * Math.PI);
          var k = gz * GRID + gx;
          if (st.tool === "raise") { H[k] += 6 * dt * f; changedH = true; }
          else if (st.tool === "lower") { H[k] -= 6 * dt * f; changedH = true; }
          else if (st.tool === "smooth" && gx > 0 && gz > 0 && gx < GRID - 1 && gz < GRID - 1) {
            var avg = (copy[k - 1] + copy[k + 1] + copy[k - GRID] + copy[k + GRID] + copy[k]) / 5;
            H[k] += (avg - H[k]) * Math.min(1, 8 * dt) * f;
            changedH = true;
          } else if (st.tool === "paint" && f > 0.2) { world.paint[k] = st.biome; changedP = true; }
        }
      if (changedH) { uploadHeight(); shadowDirty = true; heightEdited = true; }
      if (changedP) { uploadPaint(); shadowDirty = true; }
    }
    var heightEdited = false;

    function erase(p) {
      var r = st.brush, minI = Infinity, maxI = -1, d = world.data;
      world.objects.forEach(function (o) {
        if (!o.alive || Math.hypot(o.x - p[0], o.z - p[2]) > r) return;
        o.alive = false;
        for (var i = o.start; i < o.start + o.count; i++) d[i * TPS * 4 + 3] = 0;
        minI = Math.min(minI, o.start);
        maxI = Math.max(maxI, o.start + o.count);
      });
      for (var i = 0; i < world.n; i++) {
        var o = i * TPS * 4, t = d[o + 18];
        if ((t === T_GRASS || t === T_FLOWER) && d[o + 3] > 0 && Math.hypot(d[o] - p[0], d[o + 2] - p[2]) < r) {
          d[o + 3] = 0;
          if (i < minI) minI = i;
          if (i + 1 > maxI) maxI = i + 1;
        }
      }
      if (maxI > 0) { uploadRows(minI, maxI); shadowDirty = true; }
    }

    var placeRng = mulberry32(12345);
    function place(p) {
      if (world.n > CAPACITY - 9000) { flash(panel.dataset.full); return; }
      var before = world.n;
      world.addObject(st.obj, p[0], p[2], placeRng);
      uploadRows(before, world.n);
      posDirty = true;
      shadowDirty = true;
    }

    // ------------------------------------------------------------------ UI
    var ui = panel.querySelector(".gw-ui");
    var promptIn = ui.querySelector(".gw-prompt");
    var tagBox = ui.querySelector(".gw-tags");
    var hint = panel.querySelector(".lab-hint");
    var tagNames = {};
    try { tagNames = JSON.parse(panel.dataset.tags || "{}"); } catch (e) { tagNames = {}; }
    function showTags(tags) {
      tagBox.textContent = "";
      if (!tags.length) return;
      var lab = document.createElement("span");
      lab.className = "gw-tag-label";
      lab.textContent = panel.dataset.understood;
      tagBox.appendChild(lab);
      tags.forEach(function (t) {
        var s = document.createElement("span");
        s.className = "gw-tag";
        s.textContent = tagNames[t] || t;
        tagBox.appendChild(s);
      });
    }
    var flashEl = panel.querySelector(".gw-flash");
    var flashTimer = 0;
    function flash(msg, ms) {
      flashEl.textContent = msg;
      flashEl.style.opacity = "1";
      clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { flashEl.style.opacity = "0"; }, ms || 2200);
    }
    function runGenerate(text) {
      flash(panel.dataset.loading);
      setTimeout(function () { generate(text); flash(panel.dataset.loaded); }, 30);
    }
    ui.querySelector('[data-action="generate"]').addEventListener("click", function () { runGenerate(promptIn.value); });
    promptIn.addEventListener("keydown", function (e) { if (e.key === "Enter") runGenerate(promptIn.value); });
    Array.prototype.forEach.call(ui.querySelectorAll("[data-preset-prompt]"), function (b) {
      b.addEventListener("click", function () {
        promptIn.value = b.dataset.presetPrompt;
        runGenerate(promptIn.value);
      });
    });
    ui.querySelector('[data-action="random"]').addEventListener("click", function () {
      var chips = ui.querySelectorAll("[data-preset-prompt]");
      var pick = chips[Math.floor(Math.random() * chips.length)].dataset.presetPrompt;
      promptIn.value = pick + " #" + Math.floor(Math.random() * 1000);
      runGenerate(promptIn.value);
    });

    function group(attr, key, numeric, onChange) {
      var bs = ui.querySelectorAll("[" + attr + "]");
      function sync() {
        Array.prototype.forEach.call(bs, function (b) {
          var v = numeric ? +b.getAttribute(attr) : b.getAttribute(attr);
          b.setAttribute("aria-pressed", v === st[key] ? "true" : "false");
        });
      }
      Array.prototype.forEach.call(bs, function (b) {
        b.addEventListener("click", function () {
          st[key] = numeric ? +b.getAttribute(attr) : b.getAttribute(attr);
          sync();
          if (onChange) onChange();
        });
      });
      return sync;
    }
    var syncFns = [];
    syncFns.push(group("data-tool", "tool", false, function () {
      ui.querySelector(".gw-objs").hidden = st.tool !== "place";
      ui.querySelector(".gw-biomes").hidden = st.tool !== "paint";
      ui.querySelector(".gw-brush").hidden = ["erase", "raise", "lower", "smooth", "paint"].indexOf(st.tool) < 0;
      if (st.tool === "walk") {
        var f = B ? B.fwd : [0, 0, -1];
        cam.pos = B ? [B.eye[0], 0, B.eye[2]] : [0, 0, 10];
        // start the walk near the orbit target, looking the same way
        cam.pos = [cam.target[0] - f[0] * 6, 0, cam.target[2] - f[2] * 6];
        cam.walkYaw = Math.atan2(f[0], -f[2]);
        cam.walkPitch = -0.05;
        canvas.focus();
      }
      canvas.style.cursor = st.tool === "orbit" ? "grab" : st.tool === "walk" ? "move" : "crosshair";
      canvas.style.touchAction = st.tool === "orbit" ? "pan-y" : "none";
      lastSort.n = -1;
    }));
    syncFns.push(group("data-obj", "obj", false));
    syncFns.push(group("data-biome", "biome", true));
    syncFns.push(group("data-season", "season", true, function () { shadowDirty = true; }));
    syncFns.push(group("data-gmode", "mode", true));
    function toggle(name) {
      var b = ui.querySelector('[data-toggle="' + name + '"]');
      b.addEventListener("click", function () {
        st[name] = !st[name];
        b.setAttribute("aria-pressed", st[name] ? "true" : "false");
        shadowDirty = true;
      });
      return function () { b.setAttribute("aria-pressed", st[name] ? "true" : "false"); };
    }
    syncFns.push(toggle("shadows"));
    syncFns.push(toggle("timelapse"));
    var timeLabel = ui.querySelector(".gw-time-label");
    function slider(name, key, fmtFn) {
      var el = ui.querySelector('[data-input="' + name + '"]');
      el.addEventListener("input", function () {
        st[key] = +el.value;
        if (fmtFn) fmtFn();
        if (key === "time" || key === "waterOffset") shadowDirty = true;
        if (key === "waterOffset") { world.water = st.waterOffset; world.allPositions(); posDirty = true; }
      });
      return function () { el.value = st[key]; if (fmtFn) fmtFn(); };
    }
    function fmtTime() {
      var h = Math.floor(st.time), m = Math.floor((st.time - h) * 60);
      timeLabel.textContent = (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    }
    syncFns.push(slider("time", "time", fmtTime));
    syncFns.push(slider("wind", "wind"));
    syncFns.push(slider("fog", "fog"));
    syncFns.push(slider("brush", "brush"));
    syncFns.push(slider("water", "waterOffset"));
    function syncControls() { syncFns.forEach(function (f) { f(); }); }

    // ------------------------------------------------------ captured scenes
    // A loaded .ply replaces the generated world in "capture" mode; the
    // generated world is kept and comes back unchanged.
    var capture = null, genWorld = world, genCam = null, lastPly = null;
    var stage = panel.querySelector(".lab-stage");
    var fileIn = ui.querySelector(".gw-file");
    function fmtMsg(tpl, vals) { return tpl.replace(/\{(\w+)\}/g, function (_, k) { return vals[k]; }); }
    function swapWorld(w) {
      world = w;
      drawCount = 0;
      sortEpoch = sortId + 1;
      uploadRows(0, world.n);
      posDirty = true;
      shadowDirty = true;
      lastSort.n = -1;
      brushPoint = null;
    }
    function showCapture(ply, flip) {
      if (!capture) capture = { world: new World(), flip: flip };
      capture.flip = flip;
      var res = buildCapture(capture.world, ply, CAPACITY, flip);
      if (world === genWorld) genCam = { target: cam.target.slice(), yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist };
      if (st.tool !== "orbit") ui.querySelector('[data-tool="orbit"]').click();
      Array.prototype.forEach.call(ui.querySelectorAll(".gw-gen"), function (el) { el.hidden = true; });
      Array.prototype.forEach.call(ui.querySelectorAll(".gw-cap"), function (el) { el.hidden = false; });
      swapWorld(capture.world);
      cam.target = [0, 0, 0];
      cam.yaw = 0;
      cam.pitch = 0.25;
      cam.dist = 24;
      return res;
    }
    function loadFile(file) {
      if (!file) return;
      if (file.size > PLY_MAX_MB * 1048576) { flash(fmtMsg(panel.dataset.plyBig, { mb: PLY_MAX_MB }), 5000); return; }
      flash(fmtMsg(panel.dataset.plyLoading, { name: file.name }), 60000);
      var reader = new FileReader();
      reader.onerror = function () { flash(panel.dataset.plyBad, 6000); };
      reader.onload = function () {
        setTimeout(function () {
          var ply, res;
          try {
            ply = parsePly(reader.result);
            res = showCapture(ply, true);
          } catch (err) {
            if (window.console) console.warn(err);
            flash(panel.dataset.plyBad, 6000);
            return;
          }
          lastPly = ply;
          if (res.total > res.kept) flash(fmtMsg(panel.dataset.plyCapped, { total: res.total.toLocaleString(), cap: CAPACITY.toLocaleString() }), 7000);
          else flash(fmtMsg(panel.dataset.plyLoaded, { n: res.kept.toLocaleString() }), 3000);
          kick();
        }, 30);
      };
      reader.readAsArrayBuffer(file);
    }
    ui.querySelector('[data-action="load-ply"]').addEventListener("click", function () { fileIn.click(); });
    fileIn.addEventListener("change", function () {
      loadFile(fileIn.files[0]);
      fileIn.value = "";
    });
    ui.querySelector('[data-action="flip"]').addEventListener("click", function () {
      if (lastPly) showCapture(lastPly, !capture.flip);
    });
    ui.querySelector('[data-action="back"]').addEventListener("click", function () {
      if (world === genWorld) return;
      Array.prototype.forEach.call(ui.querySelectorAll(".gw-gen"), function (el) { el.hidden = false; });
      Array.prototype.forEach.call(ui.querySelectorAll(".gw-cap"), function (el) { el.hidden = true; });
      swapWorld(genWorld);
      capture = null; // frees the capture buffers
      lastPly = null;
      if (genCam) { cam.target = genCam.target; cam.yaw = genCam.yaw; cam.pitch = genCam.pitch; cam.dist = genCam.dist; }
      syncControls();
    });
    var dragDepth = 0;
    stage.addEventListener("dragenter", function (e) { e.preventDefault(); dragDepth++; stage.classList.add("gw-dragover"); });
    stage.addEventListener("dragover", function (e) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
    stage.addEventListener("dragleave", function () { if (--dragDepth <= 0) { dragDepth = 0; stage.classList.remove("gw-dragover"); } });
    stage.addEventListener("drop", function (e) {
      e.preventDefault();
      dragDepth = 0;
      stage.classList.remove("gw-dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);
    });

    // -------------------------------------------------------------- pointer
    var drag = null, engaged = false, keys = {};
    canvas.tabIndex = 0;
    function local(e) {
      var r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }
    function hitFromEvent(e) {
      var m = local(e);
      return world.raycast(B.eye, rayAt(m[0], m[1]));
    }
    canvas.addEventListener("pointerdown", function (e) {
      engaged = true;
      canvas.focus();
      hint.style.opacity = "0";
      canvas.setPointerCapture(e.pointerId);
      var m = local(e);
      var pan = e.shiftKey || e.button === 2;
      if (st.tool === "orbit" || st.tool === "walk" || pan) { drag = { mode: pan ? "pan" : st.tool, x: m[0], y: m[1] }; return; }
      var p = hitFromEvent(e);
      if (!p) return;
      if (st.tool === "place") { place(p); return; }
      if (st.tool === "erase") erase(p);
      drag = { mode: "brush", x: m[0], y: m[1], p: p };
    });
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    canvas.addEventListener("pointermove", function (e) {
      var m = local(e);
      if (B && st.tool !== "orbit" && st.tool !== "walk") brushPoint = hitFromEvent(e);
      if (!drag) return;
      var dx = m[0] - drag.x, dy = m[1] - drag.y;
      drag.x = m[0];
      drag.y = m[1];
      if (drag.mode === "orbit") {
        cam.yaw -= dx * 0.006;
        cam.pitch = Math.max(capture ? -1.45 : 0.05, Math.min(1.45, cam.pitch + dy * 0.005));
      } else if (drag.mode === "walk") {
        cam.walkYaw += dx * 0.005;
        cam.walkPitch = Math.max(-1.2, Math.min(1.2, cam.walkPitch - dy * 0.005));
      } else if (drag.mode === "pan") {
        var k = cam.dist * 0.0016;
        var r = B.right, f = norm3([B.fwd[0], 0, B.fwd[2]]);
        if (capture) { // pan in the image plane
          for (var c3 = 0; c3 < 3; c3++) cam.target[c3] += (-B.right[c3] * dx + B.up[c3] * dy) * k;
          return;
        }
        cam.target[0] -= (r[0] * dx - f[0] * dy) * k;
        cam.target[2] -= (r[2] * dx - f[2] * dy) * k;
        cam.target[1] = Math.max(world.hAt(cam.target[0], cam.target[2]), world.water) + 1.5;
      } else if (drag.mode === "brush") {
        drag.p = hitFromEvent(e) || drag.p;
        if (st.tool === "erase") erase(drag.p);
      }
    });
    function end() {
      if (drag && drag.mode === "brush" && heightEdited) {
        world.allPositions();
        posDirty = true;
        lastSort.n = -1;
        heightEdited = false;
      }
      drag = null;
    }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", function () { brushPoint = null; engaged = false; });
    canvas.addEventListener("wheel", function (e) {
      if (!engaged) return;
      e.preventDefault();
      cam.dist = Math.max(capture ? 0.5 : 4, Math.min(110, cam.dist * Math.exp(e.deltaY * 0.0012)));
    }, { passive: false });
    canvas.addEventListener("keydown", function (e) {
      keys[e.key.toLowerCase()] = true;
      if (st.tool === "walk" && ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].indexOf(e.key.toLowerCase()) >= 0) e.preventDefault();
    });
    canvas.addEventListener("keyup", function (e) { keys[e.key.toLowerCase()] = false; });
    canvas.addEventListener("blur", function () { keys = {}; });

    // --------------------------------------------------------------- frame
    var statsEl = panel.querySelector(".lab-stats");
    var statsTpl = panel.dataset.stats;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.0);
    var fps = 60, frames = 0, last = 0, timeSec = 0;
    var adaptT = [], adapted = 0;

    function render(now) {
      if (!st.params) return;
      var dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      timeSec += dt;
      if (st.timelapse) {
        st.time = (st.time + dt * 0.8) % 24;
        fmtTime();
        ui.querySelector('[data-input="time"]').value = st.time;
        shadowDirty = true;
      }
      // walking
      if (st.tool === "walk") {
        var sp = (keys.shift ? 14 : 6) * dt;
        var fx = Math.sin(cam.walkYaw), fz = -Math.cos(cam.walkYaw);
        if (keys.w || keys.arrowup) { cam.pos[0] += fx * sp; cam.pos[2] += fz * sp; }
        if (keys.s || keys.arrowdown) { cam.pos[0] -= fx * sp; cam.pos[2] -= fz * sp; }
        if (keys.a || keys.arrowleft) { cam.pos[0] += fz * sp; cam.pos[2] -= fx * sp; }
        if (keys.d || keys.arrowright) { cam.pos[0] -= fz * sp; cam.pos[2] += fx * sp; }
        cam.pos[0] = Math.max(-HALF + 1, Math.min(HALF - 1, cam.pos[0]));
        cam.pos[2] = Math.max(-HALF + 1, Math.min(HALF - 1, cam.pos[2]));
      }
      if (drag && drag.mode === "brush" && drag.p && st.tool !== "erase") applyBrush(drag.p, dt);

      var w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      B = cameraBasis();
      var E = environment();

      var moved = Math.abs(B.eye[0] - lastSort.eye[0]) + Math.abs(B.eye[1] - lastSort.eye[1]) + Math.abs(B.eye[2] - lastSort.eye[2]) +
        20 * (Math.abs(B.fwd[0] - lastSort.fwd[0]) + Math.abs(B.fwd[1] - lastSort.fwd[1]) + Math.abs(B.fwd[2] - lastSort.fwd[2]));
      if ((moved > 0.05 || lastSort.n !== world.n || posDirty) && requestSort(B.eye, B.fwd)) {
        lastSort = { eye: B.eye, fwd: B.fwd, n: world.n };
      }

      var lightVP = lightMatrix(E.lightDir);
      function common(p) {
        var u = p.u;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dataTex); gl.uniform1i(u.uData, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, heightTex); gl.uniform1i(u.uHeight, 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, paintTex); gl.uniform1i(u.uPaint, 2);
        gl.uniform1f(u.uWorld, WORLD);
        gl.uniform1f(u.uGrid, GRID);
        gl.uniform1f(u.uWater, world.water);
        gl.uniform1f(u.uSnowLine, st.params.snowLine);
        gl.uniform1f(u.uTime, timeSec);
        gl.uniform1f(u.uWind, st.wind);
        gl.uniform1f(u.uDesert, st.params.desert ? 1 : 0);
        gl.uniform2f(u.uWindDir, 0.8, 0.6);
        gl.uniform1i(u.uSeason, st.season);
        gl.uniformMatrix4fv(u.uLightVP, false, lightVP);
      }

      // 1. shadow map (splat centres as points, depth only)
      if (!capture && st.shadows && (shadowDirty || st.wind > 0.01 && frames % 30 === 0)) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
        gl.viewport(0, 0, SHADOW_RES, SHADOW_RES);
        gl.clearDepth(1);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(Ps.p);
        common(Ps);
        gl.uniform1f(Ps.u.uPxPerM, SHADOW_RES / (2 * 72));
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindVertexArray(shadowVao);
        gl.drawArrays(gl.POINTS, 0, world.n);
        gl.disable(gl.DEPTH_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        shadowDirty = false;
      }

      // 2. sky (a plain backdrop for captured scenes)
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      if (capture) {
        gl.clearColor(0.06, 0.065, 0.075, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      } else {
      gl.useProgram(Psky.p);
      var su = Psky.u;
      gl.uniform3fv(su.uFwd, B.fwd); gl.uniform3fv(su.uRight, B.right); gl.uniform3fv(su.uUp, B.up);
      gl.uniform3fv(su.uSunDir, E.sun); gl.uniform3fv(su.uZenith, E.zenith); gl.uniform3fv(su.uHorizon, E.horizon); gl.uniform3fv(su.uSunCol, E.sunCol);
      gl.uniform1f(su.uTanHalf, B.tanHalf); gl.uniform1f(su.uAspect, B.aspect); gl.uniform1f(su.uNight, E.night);
      gl.bindVertexArray(quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // 3. Gaussians, back to front
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(Pm.p);
      common(Pm);
      var u = Pm.u;
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, shadowTex); gl.uniform1i(u.uShadow, 3);
      gl.uniformMatrix4fv(u.uView, false, B.view);
      gl.uniformMatrix4fv(u.uProj, false, B.proj);
      gl.uniform2f(u.uViewport, w, h);
      gl.uniform1f(u.uFocal, B.focal);
      gl.uniform1f(u.uFog, st.fog);
      gl.uniform1f(u.uNight, E.night);
      gl.uniform3fv(u.uCamPos, B.eye);
      gl.uniform3fv(u.uLightDir, E.lightDir);
      gl.uniform3fv(u.uLightCol, E.lightCol);
      gl.uniform3fv(u.uSkyAmb, E.skyAmb);
      gl.uniform3fv(u.uGroundAmb, E.groundAmb);
      gl.uniform3fv(u.uFogCol, E.horizon);
      gl.uniform3fv(u.uZenith, E.zenith);
      gl.uniform3fv(u.uHorizon, E.horizon);
      gl.uniform1i(u.uMode, st.mode);
      gl.uniform1i(u.uShadowsOn, st.shadows ? 1 : 0);
      gl.bindVertexArray(vao);
      if (drawCount > 0) gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, drawCount);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, null);

      // 4. brush outline on the terrain
      if (brushPoint && st.tool !== "orbit" && st.tool !== "walk") {
        var r = st.tool === "place" ? 0.8 : st.brush, pts = new Float32Array(3 * 128);
        for (var k = 0; k < 128; k++) {
          var a = (k / 128) * 6.2832, x = brushPoint[0] + Math.cos(a) * r, z = brushPoint[2] + Math.sin(a) * r;
          pts[k * 3] = x; pts[k * 3 + 1] = Math.max(world.hAt(x, z), world.water) + 0.15; pts[k * 3 + 2] = z;
        }
        gl.useProgram(Pline.p);
        gl.uniformMatrix4fv(Pline.u.uVP, false, B.vp);
        gl.uniform4f(Pline.u.uColor, 1, 0.85, 0.3, 0.9);
        gl.bindVertexArray(lineVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, pts);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.LINE_LOOP, 0, 128);
        gl.drawArrays(gl.POINTS, 0, 128);
      }
      gl.bindVertexArray(null);

      if (dt > 0) {
        fps = fps * 0.95 + (1 / dt) * 0.05;
        if (adapted < 2) {
          adaptT.push(dt);
          if (adaptT.length === 40) {
            var avg = adaptT.reduce(function (x, y) { return x + y; }, 0) / 40;
            adaptT = [];
            adapted++;
            if (avg > 0.05 && dpr > 0.5) dpr *= 0.75;
          }
        }
      }
      if (++frames % 15 === 0) {
        var alive = world.objects.filter(function (o) { return o.alive; }).length;
        statsEl.textContent = (capture ? panel.dataset.statsCapture : statsTpl).replace("{n}", world.n.toLocaleString()).replace("{o}", alive).replace("{ms}", sortMs.toFixed(1)).replace("{fps}", Math.round(fps));
      }
    }

    var visible = false, raf = 0;
    function tick(now) {
      raf = 0;
      render(now);
      if (visible && !document.hidden) raf = requestAnimationFrame(tick);
      else last = 0;
    }
    function kick() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick); }
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; kick(); }).observe(canvas);
    document.addEventListener("visibilitychange", kick);

    syncControls();
    var firstPrompt = ui.querySelector("[data-preset-prompt]");
    promptIn.value = firstPrompt ? firstPrompt.dataset.presetPrompt : "";
    flash(panel.dataset.loading);
    setTimeout(function () {
      generate(promptIn.value);
      flash(panel.dataset.loaded);
      kick();
    }, 30);
  }

  new IntersectionObserver(function (e, obs) {
    if (e[0].isIntersecting) { obs.disconnect(); start(); }
  }).observe(canvas);
})();
