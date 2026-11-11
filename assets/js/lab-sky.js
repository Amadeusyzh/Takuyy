// Interactive lab: volumetric clouds and a physically based sky (WebGL 2).
//
// Everything is computed in kilometres on a spherical Earth (radius 6360 km,
// atmosphere top 6460 km), with the camera at (0, 6360 + altitude, 0).
//
// Sky: the LUT method of Hillaire, "A Scalable and Production Ready Sky and
// Atmosphere Rendering Technique" (EGSR 2020), with the Earth parameters of
// that paper (Rayleigh, Mie and ozone):
//   1. transmittance LUT (256 x 64), indexed by altitude and view zenith angle
//      with Bruneton's parameterization; built once;
//   2. multiple-scattering LUT (32 x 32): for each altitude and sun zenith angle
//      the second-order radiance L2 and the transfer factor f_ms, integrated
//      over 64 directions; all higher orders are summed as a geometric series,
//      Psi_ms = L2 / (1 - f_ms) (isotropic phase for orders >= 2); built once;
//   3. sky-view LUT (192 x 108): single scattering with Rayleigh and Mie
//      (Cornette-Shanks) phases plus Psi_ms * sigma_s, ray-marched from the
//      camera; rebuilt when the sun or the altitude changes. Its latitude is
//      warped so that texels crowd around the horizon.
//
// Clouds: a layer from 1.5 to 4.0 km above the ground, modelled in the style of
// Schneider, "The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn"
// (SIGGRAPH 2015 Advances course): a 128^3 tileable Perlin-Worley texture
// (with three Worley octaves) gives the base shape, a 2D weather map gives
// coverage and cloud type (which sets the height profile), and a 32^3 Worley
// texture erodes the edges. All noise is generated on the GPU at start-up.
// The coverage threshold is applied first and the height profile is then
// subtracted (not multiplied), so strong cells grow taller with rounded tops.
// Lighting per sample:
//   - sigma_s = sigma_t (albedo ~ 1), Beer-Lambert transmittance along the
//     view ray, integrated with the energy-conserving step formula
//     S * (1 - exp(-sigma_t dt)) / sigma_t (Hillaire 2015);
//   - up to six samples toward the sun for the optical depth tau_l, then
//     sunlight * T_atmosphere(sample, sun), so clouds redden at sunset and
//     fall into the Earth's shadow after it;
//   - phase function: isotropic, Henyey-Greenstein (g = 0.8) or a dual-lobe HG
//     (0.7 HG(0.8) + 0.3 HG(-0.3));
//   - multiple scattering by the octave approximation of Wrenninge, Kulla and
//     Lundqvist (2013): sum_k a^k p(mu; c^k g) exp(-b^k tau_l), a = b = c = 1/2;
//   - an ambient term from the sky-view LUT, occluded by the cloud above the
//     sample, plus light reflected by the ground; optionally Schneider's
//     "powder" darkening of thin edges.
// Aerial perspective: the cloud is attenuated by the air between it and the
// camera (from the transmittance LUT) and the in-scattered air light in front
// of it is a fraction (1 - T_air) / (1 - T_air,inf) of the sky-view radiance,
// i.e. in-scattering is assumed proportional to optical depth along the ray.
// Below the clouds that air light, and the ground's sky light, are dimmed by
// the local cloud fraction; the ground also gets ray-marched cloud shadows.
//
// Cost: the clouds are marched at 1/1.5 to 1/4 of the display resolution,
// with samples spaced evenly in log(distance), empty space skipped with the
// cheap base density, early termination at T < 0.01, a jittered start
// (interleaved gradient noise) and a sub-pixel offset (Halton 2, 3) that
// change every frame. A temporal pass then upsamples into a full-resolution
// history: it reprojects last frame's value (the camera only rotates, so
// reprojection by direction is exact), clamps it to the 3x3 neighbourhood of
// the new samples and blends in the nearest sample (weighted by its distance)
// mixed with a bilinear estimate. The composite pass adds the
// sky, sun, ground and cloud shadows at full resolution. Resolution and step
// counts adapt to the measured frame time.
(function () {
  "use strict";

  var panel = document.getElementById("lab-sky");
  if (!panel) return;

  // ------------------------------------------------------------------ text
  var TEXT = {
    en: {
      tab: "Clouds \u00b7 Sky",
      aria: "Volumetric clouds and a physically based sky, rendered in real time",
      hint: "drag: look around \u00b7 tap the sky: move the sun \u00b7 double-click: reset view",
      time: "Time", coverage: "Coverage", density: "Density", altitude: "Altitude",
      p0: "Isotropic", p1: "HG", p2: "Dual-lobe HG",
      ms: "Multiple scattering", powder: "Powder", wind: "Wind", taa: "Temporal",
      v0: "Final", v1: "Sky only", v2: "Transmittance", v3: "Cost",
      pr0: "Cumulus", pr1: "Golden hour", pr2: "Overcast", pr3: "Above the clouds",
      legT: "cloud transmittance T: black = opaque, white = clear",
      legC: "samples per pixel: dark blue = few, red = many",
      stats: "sun {sun}\u00b0 \u00b7 clouds {cw}\u00d7{ch} \u00b7 {n} + {l} steps \u00b7 {fps} fps",
      gen: "building 3D noise textures\u2026 {p}%",
      nogl: "This demo needs WebGL 2, which your browser does not support.",
      nogl2: "This demo needs WebGL 2 with floating-point render targets, which your browser does not support.",
      caption: "Sky and clouds computed from the physics of participating media rather than painted. The sky follows Hillaire's LUT method (EGSR 2020) on a spherical Earth: a transmittance table, a table that adds all higher orders of scattering in closed form, and a sky-view table of Rayleigh, Mie and ozone single scattering that is rebuilt whenever the sun moves. The clouds are a 2.5 km thick layer of Perlin-Worley noise, shaped by a weather map and eroded by finer Worley noise, in the style of Horizon Zero Dawn (Schneider 2015). Every pixel ray-marches the layer and accumulates in-scattered light with Beer-Lambert transmittance and the energy-conserving step formula. Each sample takes up to six more steps toward the sun, whose light is reddened by the atmosphere on the way. A dual-lobe Henyey-Greenstein phase function produces the silver lining when you look toward the sun, and the octave approximation of Wrenninge et al. (2013, a = b = c = \u00bd) stands in for multiple scattering; switch them off to see what each one adds. Powder adds the heuristic edge darkening from Schneider's talk. The clouds are marched at reduced resolution with a jittered start and a sub-pixel offset that change every frame, and reprojection with neighbourhood clamping accumulates the frames into a full-resolution image (temporal upsampling); resolution and step counts drop automatically when the frame rate does. Drag to look around, tap the sky to move the sun, and use the views to see transmittance and per-pixel cost.",
      link: "Theory: Volumes and participating media (Graphics 10)",
    },
    zh: {
      tab: "\u4f53\u79ef\u4e91 \u00b7 \u5929\u7a7a",
      aria: "\u5b9e\u65f6\u6e32\u67d3\u7684\u4f53\u79ef\u4e91\u548c\u57fa\u4e8e\u7269\u7406\u7684\u5929\u7a7a",
      hint: "\u62d6\u52a8\uff1a\u73af\u987e\u56db\u5468 \u00b7 \u70b9\u51fb\u5929\u7a7a\uff1a\u79fb\u52a8\u592a\u9633 \u00b7 \u53cc\u51fb\uff1a\u91cd\u7f6e\u89c6\u89d2",
      time: "\u65f6\u95f4", coverage: "\u4e91\u91cf", density: "\u5bc6\u5ea6", altitude: "\u9ad8\u5ea6",
      p0: "\u5404\u5411\u540c\u6027", p1: "HG", p2: "\u53cc\u74e3 HG",
      ms: "\u591a\u91cd\u6563\u5c04", powder: "\u7c89\u672b\u6548\u5e94", wind: "\u98ce", taa: "\u65f6\u95f4\u7d2f\u79ef",
      v0: "\u6700\u7ec8", v1: "\u4ec5\u5929\u7a7a", v2: "\u900f\u5c04\u7387", v3: "\u5f00\u9500",
      pr0: "\u79ef\u4e91", pr1: "\u9ec4\u91d1\u65f6\u523b", pr2: "\u9634\u5929", pr3: "\u4e91\u5c42\u4e4b\u4e0a",
      legT: "\u4e91\u7684\u900f\u5c04\u7387 T\uff1a\u9ed1 = \u4e0d\u900f\u660e\uff0c\u767d = \u900f\u660e",
      legC: "\u6bcf\u50cf\u7d20\u91c7\u6837\u6570\uff1a\u6df1\u84dd = \u5c11\uff0c\u7ea2 = \u591a",
      stats: "\u592a\u9633 {sun}\u00b0 \u00b7 \u4e91 {cw}\u00d7{ch} \u00b7 {n} + {l} \u6b65 \u00b7 {fps} fps",
      gen: "\u6b63\u5728\u751f\u6210\u4e09\u7ef4\u566a\u58f0\u7eb9\u7406\u2026 {p}%",
      nogl: "\u6b64\u6f14\u793a\u9700\u8981 WebGL 2\uff0c\u4f60\u7684\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u3002",
      nogl2: "\u6b64\u6f14\u793a\u9700\u8981\u652f\u6301\u6d6e\u70b9\u6e32\u67d3\u76ee\u6807\u7684 WebGL 2\uff0c\u4f60\u7684\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u3002",
      caption: "\u5929\u7a7a\u548c\u4e91\u90fd\u662f\u6309\u53c2\u4e0e\u4ecb\u8d28\uff08participating media\uff09\u7684\u7269\u7406\u8ba1\u7b97\u51fa\u6765\u7684\uff0c\u800c\u4e0d\u662f\u753b\u51fa\u6765\u7684\u3002\u5929\u7a7a\u91c7\u7528 Hillaire \u7684\u67e5\u627e\u8868\uff08LUT\uff09\u65b9\u6cd5\uff08EGSR 2020\uff09\uff0c\u5728\u7403\u5f62\u5730\u7403\u4e0a\u8ba1\u7b97\uff1a\u4e00\u5f20\u900f\u5c04\u7387\u8868\uff1b\u4e00\u5f20\u4ee5\u95ed\u5f0f\u89e3\u7d2f\u52a0\u6240\u6709\u9ad8\u9636\u6563\u5c04\u7684\u8868\uff1b\u4e00\u5f20\u745e\u5229\uff08Rayleigh\uff09\u3001\u7c73\u6c0f\uff08Mie\uff09\u548c\u81ed\u6c27\u5355\u6b21\u6563\u5c04\u7684\u5929\u7a7a\u89c6\u56fe\u8868\uff0c\u592a\u9633\u4e00\u79fb\u52a8\u5c31\u91cd\u65b0\u751f\u6210\u3002\u4e91\u662f\u4e00\u5c42 2.5 km \u539a\u7684 Perlin-Worley \u566a\u58f0\uff0c\u7531\u5929\u6c14\u56fe\u5851\u5f62\uff0c\u518d\u7528\u66f4\u7ec6\u7684 Worley \u566a\u58f0\u4fb5\u8680\u8fb9\u7f18\uff0c\u505a\u6cd5\u6e90\u81ea\u300a\u5730\u5e73\u7ebf\uff1a\u96f6\u4e4b\u66d9\u5149\u300b\uff08Schneider 2015\uff09\u3002\u6bcf\u4e2a\u50cf\u7d20\u6cbf\u89c6\u7ebf\u5149\u7ebf\u6b65\u8fdb\uff08ray marching\uff09\u7a7f\u8fc7\u4e91\u5c42\uff0c\u7528\u6bd4\u5c14-\u6717\u4f2f\uff08Beer-Lambert\uff09\u900f\u5c04\u7387\u548c\u80fd\u91cf\u5b88\u6052\u7684\u5206\u6bb5\u516c\u5f0f\u7d2f\u79ef\u5185\u6563\u5c04\u5149\u3002\u6bcf\u4e2a\u91c7\u6837\u70b9\u518d\u671d\u592a\u9633\u6700\u591a\u8d70\u516d\u6b65\uff0c\u800c\u9633\u5149\u5728\u9014\u4e2d\u5df2\u88ab\u5927\u6c14\u67d3\u7ea2\u3002\u53cc\u74e3 Henyey-Greenstein \u76f8\u51fd\u6570\u5728\u4f60\u671b\u5411\u592a\u9633\u65f6\u4ea7\u751f\u4e91\u7684\u201c\u94f6\u8fb9\u201d\uff0cWrenninge \u7b49\u4eba\u7684\u500d\u9891\u8fd1\u4f3c\uff082013\uff0ca = b = c = \u00bd\uff09\u4ee3\u66ff\u591a\u91cd\u6563\u5c04\uff1b\u628a\u5b83\u4eec\u5173\u6389\uff0c\u5c31\u80fd\u770b\u51fa\u5404\u81ea\u7684\u4f5c\u7528\u3002\u201c\u7c89\u672b\u6548\u5e94\u201d\u52a0\u5165 Schneider \u6f14\u8bb2\u4e2d\u542f\u53d1\u5f0f\u7684\u8fb9\u7f18\u53d8\u6697\u3002\u4e91\u4ee5\u964d\u4f4e\u7684\u5206\u8fa8\u7387\u6b65\u8fdb\uff0c\u8d77\u70b9\u548c\u4e9a\u50cf\u7d20\u4f4d\u7f6e\u6bcf\u5e27\u6296\u52a8\uff0c\u518d\u901a\u8fc7\u91cd\u6295\u5f71\u548c\u90bb\u57df\u88c1\u526a\u628a\u591a\u5e27\u7d2f\u79ef\u6210\u5168\u5206\u8fa8\u7387\u56fe\u50cf\uff08\u65f6\u95f4\u4e0a\u91c7\u6837\uff09\uff1b\u5e27\u7387\u4e0b\u964d\u65f6\u5206\u8fa8\u7387\u548c\u6b65\u6570\u4f1a\u81ea\u52a8\u964d\u4f4e\u3002\u62d6\u52a8\u53ef\u73af\u987e\u56db\u5468\uff0c\u70b9\u51fb\u5929\u7a7a\u53ef\u79fb\u52a8\u592a\u9633\uff0c\u5207\u6362\u89c6\u56fe\u53ef\u67e5\u770b\u900f\u5c04\u7387\u548c\u6bcf\u50cf\u7d20\u5f00\u9500\u3002",
      link: "\u539f\u7406\uff1a\u4f53\u79ef\u4e0e\u53c2\u4e0e\u4ecb\u8d28\uff08\u56fe\u5f62\u5b66 10\uff09",
    },
    ja: {
      tab: "\u96f2 \u00b7 \u7a7a",
      aria: "\u30ea\u30a2\u30eb\u30bf\u30a4\u30e0\u306b\u63cf\u753b\u3057\u305f\u30dc\u30ea\u30e5\u30fc\u30e0\u306e\u96f2\u3068\u7269\u7406\u30d9\u30fc\u30b9\u306e\u7a7a",
      hint: "\u30c9\u30e9\u30c3\u30b0\uff1a\u898b\u56de\u3059 \u00b7 \u7a7a\u3092\u30bf\u30c3\u30d7\uff1a\u592a\u967d\u3092\u52d5\u304b\u3059 \u00b7 \u30c0\u30d6\u30eb\u30af\u30ea\u30c3\u30af\uff1a\u8996\u70b9\u3092\u30ea\u30bb\u30c3\u30c8",
      time: "\u6642\u523b", coverage: "\u96f2\u91cf", density: "\u5bc6\u5ea6", altitude: "\u9ad8\u5ea6",
      p0: "\u7b49\u65b9", p1: "HG", p2: "\u4e8c\u91cd\u30ed\u30fc\u30d6 HG",
      ms: "\u591a\u91cd\u6563\u4e71", powder: "\u30d1\u30a6\u30c0\u30fc", wind: "\u98a8", taa: "\u6642\u9593\u84c4\u7a4d",
      v0: "\u6700\u7d42", v1: "\u7a7a\u306e\u307f", v2: "\u900f\u904e\u7387", v3: "\u30b3\u30b9\u30c8",
      pr0: "\u7a4d\u96f2", pr1: "\u5915\u66ae\u308c", pr2: "\u66c7\u5929", pr3: "\u96f2\u306e\u4e0a",
      legT: "\u96f2\u306e\u900f\u904e\u7387 T\uff1a\u9ed2 = \u4e0d\u900f\u660e\u3001\u767d = \u900f\u660e",
      legC: "\u30d4\u30af\u30bb\u30eb\u3042\u305f\u308a\u306e\u30b5\u30f3\u30d7\u30eb\u6570\uff1a\u7d3a = \u5c11\u306a\u3044\u3001\u8d64 = \u591a\u3044",
      stats: "\u592a\u967d {sun}\u00b0 \u00b7 \u96f2 {cw}\u00d7{ch} \u00b7 {n} + {l} \u30b9\u30c6\u30c3\u30d7 \u00b7 {fps} fps",
      gen: "3D \u30ce\u30a4\u30ba\u30c6\u30af\u30b9\u30c1\u30e3\u3092\u751f\u6210\u4e2d\u2026 {p}%",
      nogl: "\u3053\u306e\u30c7\u30e2\u306b\u306f WebGL 2 \u304c\u5fc5\u8981\u3067\u3059\u304c\u3001\u304a\u4f7f\u3044\u306e\u30d6\u30e9\u30a6\u30b6\u306f\u5bfe\u5fdc\u3057\u3066\u3044\u307e\u305b\u3093\u3002",
      nogl2: "\u3053\u306e\u30c7\u30e2\u306b\u306f\u6d6e\u52d5\u5c0f\u6570\u70b9\u30ec\u30f3\u30c0\u30fc\u30bf\u30fc\u30b2\u30c3\u30c8\u306b\u5bfe\u5fdc\u3057\u305f WebGL 2 \u304c\u5fc5\u8981\u3067\u3059\u304c\u3001\u304a\u4f7f\u3044\u306e\u30d6\u30e9\u30a6\u30b6\u306f\u5bfe\u5fdc\u3057\u3066\u3044\u307e\u305b\u3093\u3002",
      caption: "\u7a7a\u3068\u96f2\u306f\u63cf\u3044\u305f\u3082\u306e\u3067\u306f\u306a\u304f\u3001\u95a2\u4e0e\u5a92\u8cea\uff08participating media\uff09\u306e\u7269\u7406\u304b\u3089\u8a08\u7b97\u3057\u3066\u3044\u307e\u3059\u3002\u7a7a\u306f\u7403\u4f53\u306e\u5730\u7403\u306e\u4e0a\u3067 Hillaire \u306e LUT \u624b\u6cd5\uff08EGSR 2020\uff09\u306b\u5f93\u3044\u307e\u3059\u3002\u900f\u904e\u7387\u30c6\u30fc\u30d6\u30eb\u3001\u9ad8\u6b21\u306e\u6563\u4e71\u3092\u3059\u3079\u3066\u9589\u5f62\u5f0f\u3067\u8db3\u3057\u5408\u308f\u305b\u308b\u30c6\u30fc\u30d6\u30eb\u3001\u305d\u3057\u3066\u30ec\u30a4\u30ea\u30fc\uff08Rayleigh\uff09\u30fb\u30df\u30fc\uff08Mie\uff09\u30fb\u30aa\u30be\u30f3\u306e\u5358\u4e00\u6563\u4e71\u306b\u3088\u308b\u30b9\u30ab\u30a4\u30d3\u30e5\u30fc\u30c6\u30fc\u30d6\u30eb\u3067\u3001\u592a\u967d\u304c\u52d5\u304f\u305f\u3073\u306b\u4f5c\u308a\u76f4\u3057\u307e\u3059\u3002\u96f2\u306f\u539a\u3055 2.5 km \u306e Perlin-Worley \u30ce\u30a4\u30ba\u306e\u5c64\u3067\u3001\u5929\u6c17\u30de\u30c3\u30d7\u3067\u5f62\u3092\u6c7a\u3081\u3001\u3088\u308a\u7d30\u304b\u3044 Worley \u30ce\u30a4\u30ba\u3067\u7e01\u3092\u524a\u308a\u307e\u3059\u3002Horizon Zero Dawn\uff08Schneider 2015\uff09\u306b\u306a\u3089\u3063\u305f\u624b\u6cd5\u3067\u3059\u3002\u5404\u30d4\u30af\u30bb\u30eb\u306f\u5c64\u3092\u30ec\u30a4\u30de\u30fc\u30c1\u30f3\u30b0\u3057\u3001Beer-Lambert \u306e\u900f\u904e\u7387\u3068\u30a8\u30cd\u30eb\u30ae\u30fc\u4fdd\u5b58\u578b\u306e\u533a\u9593\u516c\u5f0f\u3067\u5185\u90e8\u6563\u4e71\u5149\u3092\u7a4d\u7b97\u3057\u307e\u3059\u3002\u5404\u30b5\u30f3\u30d7\u30eb\u304b\u3089\u306f\u3055\u3089\u306b\u592a\u967d\u3078\u5411\u304b\u3063\u3066\u6700\u5927 6 \u30b9\u30c6\u30c3\u30d7\u9032\u307f\u3001\u305d\u306e\u592a\u967d\u5149\u306f\u9014\u4e2d\u306e\u5927\u6c17\u3067\u8d64\u304f\u67d3\u307e\u308a\u307e\u3059\u3002\u4e8c\u91cd\u30ed\u30fc\u30d6\u306e Henyey-Greenstein \u4f4d\u76f8\u95a2\u6570\u306f\u3001\u592a\u967d\u306e\u65b9\u3092\u5411\u3044\u305f\u3068\u304d\u306b\u96f2\u306e\u9280\u8272\u306e\u7e01\uff08\u30b7\u30eb\u30d0\u30fc\u30e9\u30a4\u30cb\u30f3\u30b0\uff09\u3092\u751f\u307f\u3001Wrenninge \u3089\u306e\u30aa\u30af\u30bf\u30fc\u30d6\u8fd1\u4f3c\uff082013\u3001a = b = c = \u00bd\uff09\u304c\u591a\u91cd\u6563\u4e71\u306e\u4ee3\u308f\u308a\u3092\u3057\u307e\u3059\u3002\u30aa\u30d5\u306b\u3059\u308b\u3068\u3001\u305d\u308c\u305e\u308c\u306e\u5f79\u5272\u304c\u308f\u304b\u308a\u307e\u3059\u3002\u300c\u30d1\u30a6\u30c0\u30fc\u300d\u306f Schneider \u306e\u8b1b\u6f14\u306b\u3042\u308b\u30d2\u30e5\u30fc\u30ea\u30b9\u30c6\u30a3\u30c3\u30af\u306a\u7e01\u306e\u6697\u5316\u3092\u52a0\u3048\u307e\u3059\u3002\u96f2\u306f\u4e0b\u3052\u305f\u89e3\u50cf\u5ea6\u3067\u3001\u958b\u59cb\u4f4d\u7f6e\u3068\u30b5\u30d6\u30d4\u30af\u30bb\u30eb\u4f4d\u7f6e\u3092\u6bce\u30d5\u30ec\u30fc\u30e0\u305a\u3089\u3057\u306a\u304c\u3089\u30de\u30fc\u30c1\u3057\u3001\u518d\u6295\u5f71\u3068\u8fd1\u508d\u30af\u30e9\u30f3\u30d7\u3067\u8907\u6570\u30d5\u30ec\u30fc\u30e0\u3092\u30d5\u30eb\u89e3\u50cf\u5ea6\u306e\u753b\u50cf\u306b\u84c4\u7a4d\u3057\u307e\u3059\uff08\u6642\u9593\u65b9\u5411\u306e\u30a2\u30c3\u30d7\u30b5\u30f3\u30d7\u30ea\u30f3\u30b0\uff09\u3002\u30d5\u30ec\u30fc\u30e0\u30ec\u30fc\u30c8\u304c\u843d\u3061\u308b\u3068\u89e3\u50cf\u5ea6\u3068\u30b9\u30c6\u30c3\u30d7\u6570\u306f\u81ea\u52d5\u7684\u306b\u4e0b\u304c\u308a\u307e\u3059\u3002\u30c9\u30e9\u30c3\u30b0\u3067\u898b\u56de\u3057\u3001\u7a7a\u3092\u30bf\u30c3\u30d7\u3059\u308b\u3068\u592a\u967d\u304c\u52d5\u304d\u3001\u8868\u793a\u3092\u5207\u308a\u66ff\u3048\u308b\u3068\u900f\u904e\u7387\u3068\u30d4\u30af\u30bb\u30eb\u3054\u3068\u306e\u30b3\u30b9\u30c8\u3092\u78ba\u8a8d\u3067\u304d\u307e\u3059\u3002",
      link: "\u89e3\u8aac\uff1a\u30dc\u30ea\u30e5\u30fc\u30e0\u3068\u95a2\u4e0e\u5a92\u8cea\uff08\u30b0\u30e9\u30d5\u30a3\u30c3\u30af\u30b9 10\uff09",
    },
  };
  var lang = (panel.dataset.lang || "en").slice(0, 2);
  var L = TEXT[lang] || TEXT.en;

  function q(s) { return panel.querySelector(s); }
  function each(sel, fn) { Array.prototype.forEach.call(panel.querySelectorAll(sel), fn); }
  each("[data-t]", function (el) {
    var k = el.getAttribute("data-t");
    if (L[k] != null) el.textContent = L[k];
  });
  var tabBtn = document.getElementById("lab-tab-sky");
  if (tabBtn && !tabBtn.textContent.trim()) tabBtn.textContent = L.tab;

  var canvas = q("canvas");
  canvas.setAttribute("aria-label", L.aria);
  var hint = q(".lab-hint");
  hint.textContent = L.hint;
  var statsEl = q(".lab-stats");
  var legend = q(".sky-legend");

  function fail(msg) {
    var stage = q(".lab-stage");
    stage.textContent = msg;
    stage.style.padding = "1.2rem";
    stage.style.color = "#ddd";
    each(".lab-controls", function (c) { c.style.display = "none"; });
  }

  // ---------------------------------------------------------------- shaders
  var VS = "#version 300 es\nin vec2 aPos;\nvoid main() { gl_Position = vec4(aPos, 0.0, 1.0); }";

  var HEAD = [
    "#version 300 es",
    "precision highp float;",
    "precision highp int;",
    "precision highp sampler3D;",
    "#define PI 3.14159265359",
    "out vec4 outColor;",
  ].join("\n");

  // Atmosphere model (Hillaire 2020, Earth): units km and 1/km.
  var ATMO = [
    "const float RB = 6360.0;", // ground radius
    "const float RT = 6460.0;", // top of the atmosphere
    "const vec3 RAY_S = vec3(5.802e-3, 13.558e-3, 33.1e-3);", // Rayleigh scattering at sea level
    "const float MIE_S = 3.996e-3;", // Mie scattering
    "const float MIE_E = 4.440e-3;", // Mie extinction
    "const vec3 OZO_A = vec3(0.650e-3, 1.881e-3, 0.085e-3);", // ozone absorption at its peak
    // Ray-sphere intersection with a sphere centred at the origin; (-1, -1) on a miss.
    // c is written as (l - r)(l + r) to keep precision on a 6360 km sphere.
    "vec2 sphere(vec3 ro, vec3 rd, float r) {",
    "  float l = length(ro);",
    "  float b = dot(ro, rd);",
    "  float c = (l - r) * (l + r);",
    "  float d = b * b - c;",
    "  if (d < 0.0) return vec2(-1.0);",
    "  d = sqrt(d);",
    "  return vec2(-b - d, -b + d);",
    "}",
    // Scattering and extinction coefficients at altitude h.
    "void medium(float h, out vec3 sR, out float sM, out vec3 ext) {",
    "  h = max(h, 0.0);",
    "  float dR = exp(-h / 8.0);", // Rayleigh scale height 8 km
    "  float dM = exp(-h / 1.2);", // Mie scale height 1.2 km
    "  float dO = max(0.0, 1.0 - abs(h - 25.0) / 15.0);", // ozone: tent around 25 km
    "  sR = RAY_S * dR;",
    "  sM = MIE_S * dM;",
    "  ext = sR + MIE_E * dM + OZO_A * dO;",
    "}",
    "float phaseR(float mu) { return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }",
    "float phaseM(float mu) {", // Cornette-Shanks, g = 0.8
    "  const float g = 0.8;",
    "  float k = 3.0 / (8.0 * PI) * (1.0 - g * g) / (2.0 + g * g);",
    "  return k * (1.0 + mu * mu) / pow(1.0 + g * g - 2.0 * g * mu, 1.5);",
    "}",
  ].join("\n");

  // Lookups into the transmittance and multiple-scattering LUTs.
  var LUTS = [
    "uniform sampler2D uTrans;",
    "uniform sampler2D uMS;",
    "vec3 transLUT(float r, float mu) {",
    "  float H = sqrt(RT * RT - RB * RB);",
    "  float rho = sqrt(max(0.0, (r - RB) * (r + RB)));",
    "  float disc = r * r * (mu * mu - 1.0) + RT * RT;",
    "  float d = max(0.0, -r * mu + sqrt(max(disc, 0.0)));",
    "  float dmin = RT - r, dmax = rho + H;",
    "  return texture(uTrans, vec2((d - dmin) / (dmax - dmin), rho / H)).rgb;",
    "}",
    // Transmittance toward the sun, zero once the planet blocks it (soft over the sun's disk).
    "vec3 sunTrans(vec3 p, vec3 sun) {",
    "  float r = length(p);",
    "  float mu = dot(p, sun) / r;",
    "  float x = RB / r;",
    "  float muH = -sqrt(max(0.0, 1.0 - x * x));",
    "  return transLUT(r, mu) * smoothstep(muH - 0.005, muH + 0.005, mu);",
    "}",
    "vec3 msLUT(float r, float muS) {",
    "  vec2 uv = vec2(muS * 0.5 + 0.5, (r - RB) / (RT - RB));",
    "  uv = clamp(uv, 0.0, 1.0) * (31.0 / 32.0) + 0.5 / 32.0;",
    "  return texture(uMS, uv).rgb;",
    "}",
    // Transmittance of the segment ro -> ro + rd t. LUT values are transmittances to the top of
    // the atmosphere, so a segment is a ratio of two of them; rays that end on the ground are
    // reversed so that both LUT rays point up.
    "vec3 transSeg(vec3 ro, vec3 rd, float t, bool ground) {",
    "  vec3 pb = ro + rd * t;",
    "  float ra = length(ro), rb = length(pb);",
    "  float mua = dot(ro, rd) / ra, mub = dot(pb, rd) / rb;",
    "  vec3 v = ground ? transLUT(rb, -mub) / max(transLUT(ra, -mua), vec3(1e-6))",
    "                  : transLUT(ra, mua) / max(transLUT(rb, mub), vec3(1e-6));",
    "  return clamp(v, 0.0, 1.0);",
    "}",
  ].join("\n");

  // Sky-view LUT lookup: view zenith angle warped around the horizon, azimuth relative to the sun.
  var SKY = [
    "uniform sampler2D uSky;",
    "uniform float uCamR;",
    "vec3 skyLUT(float cosV, float cosPhi) {",
    "  float r = uCamR;",
    "  float vh = sqrt(max(0.0, (r - RB) * (r + RB)));",
    "  float beta = acos(clamp(vh / r, -1.0, 1.0));",
    "  float zha = PI - beta;", // zenith angle of the geometric horizon
    "  float vz = acos(clamp(cosV, -1.0, 1.0));",
    "  float v = vz < zha ? 0.5 * (1.0 - sqrt(max(0.0, 1.0 - vz / zha)))",
    "                     : 0.5 + 0.5 * sqrt(max(0.0, (vz - zha) / beta));",
    "  float u = sqrt(clamp(0.5 - 0.5 * cosPhi, 0.0, 1.0));",
    "  return texture(uSky, vec2(u, v)).rgb;",
    "}",
    "uniform vec3 uSunDir;",
    "vec3 skyDir(vec3 rd) {",
    "  vec2 a = rd.xz, b = uSunDir.xz;",
    "  float la = length(a), lb = length(b);",
    "  float cp = (la > 1e-4 && lb > 1e-4) ? dot(a, b) / (la * lb) : 1.0;",
    "  return skyLUT(rd.y, cp);",
    "}",
  ].join("\n");

  // Tileable noise for the cloud textures (periods are powers of two, wrapped with a bit mask).
  var NOISE = [
    "uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }",
    "uint hash3(ivec3 c, int seed) { return pcg(uint(c.x) + pcg(uint(c.y) + pcg(uint(c.z) + uint(seed) * 1013u))); }",
    "vec3 rnd3(ivec3 c, int seed) {",
    "  uint h = hash3(c, seed);",
    "  return vec3(float(h & 1023u), float((h >> 10u) & 1023u), float((h >> 20u) & 1023u)) / 1023.0;",
    "}",
    "float perlin(vec3 p, int per, int seed) {",
    "  ivec3 i = ivec3(floor(p));",
    "  vec3 f = p - vec3(i);",
    "  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);",
    "  int m = per - 1;",
    "  float n[8];",
    "  for (int k = 0; k < 8; k++) {",
    "    ivec3 o = ivec3(k & 1, (k >> 1) & 1, (k >> 2) & 1);",
    "    vec3 g = normalize(rnd3((i + o) & m, seed) * 2.0 - 1.0 + 1e-4);",
    "    n[k] = dot(g, f - vec3(o));",
    "  }",
    "  return mix(mix(mix(n[0], n[1], u.x), mix(n[2], n[3], u.x), u.y),",
    "             mix(mix(n[4], n[5], u.x), mix(n[6], n[7], u.x), u.y), u.z);",
    "}",
    "float perlinFbm(vec3 p, int freq, int oct, int seed) {",
    "  float s = 0.0, a = 1.0, n = 0.0;",
    "  int f = freq;",
    "  for (int o = 0; o < 8; o++) {",
    "    if (o >= oct) break;",
    "    s += a * perlin(p * float(f), f, seed + o);",
    "    n += a; a *= 0.5; f *= 2;",
    "  }",
    "  return s / n;",
    "}",
    // Worley (cellular) noise, inverted: 1 at feature points, 0 far from them.
    "float worley(vec3 p, int per, int seed) {",
    "  ivec3 i = ivec3(floor(p));",
    "  vec3 f = p - vec3(i);",
    "  float d = 1e9;",
    "  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {",
    "    ivec3 o = ivec3(x, y, z);",
    "    vec3 r = vec3(o) + rnd3((i + o) & (per - 1), seed) - f;",
    "    d = min(d, dot(r, r));",
    "  }",
    "  return clamp(1.0 - sqrt(d), 0.0, 1.0);",
    "}",
    "float worleyFbm(vec3 p, int f, int seed) {",
    "  return worley(p * float(f), f, seed) * 0.625 + worley(p * float(2 * f), 2 * f, seed + 1) * 0.25",
    "       + worley(p * float(4 * f), 4 * f, seed + 2) * 0.125;",
    "}",
  ].join("\n");

  var NOISE_FS = [
    HEAD, NOISE,
    "uniform float uZ;",
    "uniform float uSize;",
    "uniform int uKind;", // 0: shape (3D), 1: detail (3D), 2: weather (2D)
    "void main() {",
    "  vec3 p = vec3(gl_FragCoord.xy, uZ + 0.5) / uSize;",
    "  if (uKind == 0) {",
    "    float g = worleyFbm(p, 4, 11);",
    "    float pn = clamp(perlinFbm(p, 4, 5, 1) * 2.2 + 0.5, 0.0, 1.0);", // Perlin fBm stretched to [0, 1]
    "    float pw = clamp((pn + 1.0 - g) / (2.0 - g), 0.0, 1.0);", // Perlin-Worley: Perlin dilated by Worley, remap(pn, -(1 - g), 1, 0, 1)
    "    outColor = vec4(pw, g, worleyFbm(p, 8, 21), worleyFbm(p, 16, 31));",
    "  } else if (uKind == 1) {",
    "    outColor = vec4(worleyFbm(p, 2, 41), worleyFbm(p, 4, 51), worleyFbm(p, 8, 61), 1.0);",
    "  } else {",
    "    p.z = 0.37;",
    "    float cov = clamp(perlinFbm(p, 4, 5, 71) * 2.2 + 0.5, 0.0, 1.0) * 0.8 + worleyFbm(p, 8, 81) * 0.4 - 0.1;",
    "    float type = clamp(perlinFbm(p, 2, 3, 91) * 2.2 + 0.5, 0.0, 1.0);",
    "    float fields = clamp(perlinFbm(p, 16, 4, 101) * 2.2 + 0.5, 0.0, 1.0);",
    "    float rough = worleyFbm(p, 32, 111);",
    "    outColor = vec4(cov, type, fields, rough);",
    "  }",
    "}",
  ].join("\n");

  var TRANS_FS = [
    HEAD, ATMO,
    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / vec2(256.0, 64.0);",
    "  float H = sqrt(RT * RT - RB * RB);",
    "  float rho = H * uv.y;",
    "  float r = sqrt(rho * rho + RB * RB);",
    "  float dmin = RT - r, dmax = rho + H;",
    "  float d = dmin + uv.x * (dmax - dmin);",
    "  float mu = d == 0.0 ? 1.0 : (H * H - rho * rho - d * d) / (2.0 * r * d);",
    "  mu = clamp(mu, -1.0, 1.0);",
    "  vec3 ro = vec3(0.0, r, 0.0), rd = vec3(sqrt(1.0 - mu * mu), mu, 0.0);",
    "  float tmax = max(sphere(ro, rd, RT).y, 0.0);",
    "  const int N = 40;",
    "  float dt = tmax / float(N);",
    "  vec3 od = vec3(0.0);",
    "  for (int i = 0; i < N; i++) {",
    "    vec3 p = ro + rd * ((float(i) + 0.5) * dt);",
    "    vec3 sR, ext; float sM;",
    "    medium(length(p) - RB, sR, sM, ext);",
    "    od += ext * dt;",
    "  }",
    "  outColor = vec4(exp(-od), 1.0);",
    "}",
  ].join("\n");

  var MS_FS = [
    HEAD, ATMO, LUTS,
    "void main() {",
    "  vec2 uv = (gl_FragCoord.xy - 0.5) / 31.0;",
    "  float cosS = uv.x * 2.0 - 1.0;",
    "  float r = RB + clamp(uv.y, 0.0, 1.0) * (RT - RB);",
    "  r = clamp(r, RB + 0.01, RT - 0.01);",
    "  vec3 ro = vec3(0.0, r, 0.0);",
    "  vec3 sun = vec3(sqrt(max(0.0, 1.0 - cosS * cosS)), cosS, 0.0);",
    "  vec3 L2 = vec3(0.0), F = vec3(0.0);",
    "  for (int i = 0; i < 8; i++) for (int j = 0; j < 8; j++) {",
    "    float ct = 1.0 - 2.0 * (float(i) + 0.5) / 8.0;",
    "    float stt = sqrt(1.0 - ct * ct);",
    "    float ph = 2.0 * PI * (float(j) + 0.5) / 8.0;",
    "    vec3 rd = vec3(stt * cos(ph), ct, stt * sin(ph));",
    "    float tG = sphere(ro, rd, RB).x;",
    "    bool ground = tG > 0.0;",
    "    float tmax = ground ? tG : sphere(ro, rd, RT).y;",
    "    const int N = 20;",
    "    float dt = tmax / float(N);",
    "    vec3 T = vec3(1.0), Ls = vec3(0.0), f = vec3(0.0);",
    "    for (int s = 0; s < N; s++) {",
    "      vec3 p = ro + rd * ((float(s) + 0.5) * dt);",
    "      vec3 sR, ext; float sM;",
    "      medium(length(p) - RB, sR, sM, ext);",
    "      vec3 sc = sR + sM;",
    "      vec3 Ts = exp(-ext * dt);",
    "      vec3 w = (1.0 - Ts) / max(ext, vec3(1e-9));", // integral of T over the step
    "      Ls += T * w * sunTrans(p, sun) * sc / (4.0 * PI);", // isotropic phase
    "      f += T * w * sc;",
    "      T *= Ts;",
    "    }",
    "    if (ground) {",
    "      vec3 pg = ro + rd * tG;",
    "      Ls += T * sunTrans(pg, sun) * max(dot(normalize(pg), sun), 0.0) * 0.3 / PI;", // albedo 0.3
    "    }",
    "    L2 += Ls; F += f;",
    "  }",
    "  L2 /= 64.0; F /= 64.0;", // uniform average over the sphere = integral with the isotropic phase
    "  outColor = vec4(L2 / (1.0 - F), 1.0);", // geometric series of all orders >= 2
    "}",
  ].join("\n");

  var SKYVIEW_FS = [
    HEAD, ATMO, LUTS,
    "uniform float uCamR;",
    "uniform float uSunCos;",
    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / vec2(192.0, 108.0);",
    "  float r = uCamR;",
    "  float vh = sqrt(max(0.0, (r - RB) * (r + RB)));",
    "  float beta = acos(clamp(vh / r, -1.0, 1.0));",
    "  float zha = PI - beta;",
    "  float vz;",
    "  if (uv.y < 0.5) { float c = 1.0 - 2.0 * uv.y; vz = zha * (1.0 - c * c); }",
    "  else { float c = uv.y * 2.0 - 1.0; vz = zha + beta * c * c; }",
    "  float cosPhi = 1.0 - 2.0 * uv.x * uv.x;",
    "  float sinPhi = sqrt(max(0.0, 1.0 - cosPhi * cosPhi));",
    "  vec3 rd = vec3(sin(vz) * cosPhi, cos(vz), sin(vz) * sinPhi);",
    "  vec3 sun = vec3(sqrt(max(0.0, 1.0 - uSunCos * uSunCos)), uSunCos, 0.0);",
    "  vec3 ro = vec3(0.0, r, 0.0);",
    "  float tG = sphere(ro, rd, RB).x;",
    "  float tmax = tG > 0.0 ? tG : sphere(ro, rd, RT).y;",
    "  float mu = dot(rd, sun);",
    "  float pR = phaseR(mu), pM = phaseM(mu);",
    "  const int N = 32;",
    "  vec3 Ls = vec3(0.0), T = vec3(1.0);",
    "  float t0 = 0.0;",
    "  for (int s = 0; s < N; s++) {",
    "    float t1 = tmax * pow((float(s) + 1.0) / float(N), 2.0);", // denser samples near the camera
    "    float dt = t1 - t0;",
    "    vec3 p = ro + rd * (t0 + 0.3 * dt);",
    "    t0 = t1;",
    "    float rp = length(p);",
    "    vec3 sR, ext; float sM;",
    "    medium(rp - RB, sR, sM, ext);",
    "    vec3 Ts = exp(-ext * dt);",
    "    vec3 S = sunTrans(p, sun) * (sR * pR + sM * pM) + msLUT(rp, dot(p, sun) / rp) * (sR + sM);",
    "    Ls += T * S * (1.0 - Ts) / max(ext, vec3(1e-9));",
    "    T *= Ts;",
    "  }",
    "  outColor = vec4(Ls, 1.0);",
    "}",
  ].join("\n");

  // Cloud density model (shared by the march and the ground shadows).
  var CLOUD = [
    "uniform sampler3D uShape;",
    "uniform sampler3D uDetail;",
    "uniform sampler2D uWeather;",
    "uniform float uCoverage;",
    "uniform vec3 uWind;", // accumulated wind offset, km
    "const float CB = 1.5, CT = 4.0;", // cloud layer, km above the ground
    "float remap(float v, float a, float b, float c, float d) { return c + (v - a) * (d - c) / (b - a); }",
    // Base density (no erosion) and the height fraction in the layer.
    "float cloudBase(vec3 p, float lod, out float hf) {",
    "  hf = (length(p) - RB - CB) / (CT - CB);",
    "  if (hf <= 0.0 || hf >= 1.0) return 0.0;",
    "  vec3 q = p - vec3(0.0, RB, 0.0);",
    "  vec4 w = textureLod(uWeather, (q.xz + uWind.xz * 0.6) / 48.0, 0.0);",
    // coverage threshold: the slider sets it globally, the weather map moves it locally
    "  float th = clamp(1.0 - 0.42 * uCoverage - 0.3 * (w.r - 0.5), 0.3, 0.995);",
    "  float top = mix(0.45, 1.0, smoothstep(0.25, 0.75, w.g));", // the cloud type sets the height of the tops
    "  float prof = smoothstep(0.0, 0.1, hf) * (1.0 - smoothstep(top * 0.3, top, hf));",
    "  if (prof <= 0.0) return 0.0;",
    "  vec4 s = textureLod(uShape, (q + uWind + vec3(0.0, uWind.x * 0.05, 0.0)) / 7.0, lod);",
    "  float wf = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;",
    "  float base = remap(s.r, wf - 1.0, 1.0, 0.0, 1.0);", // Schneider: erode the Perlin-Worley by the Worley fBm
    // excess over the coverage threshold; the height profile is subtracted, so strong cells reach
    // higher and get rounded tops, while weak ones stay low and flat
    "  float e = (base - th) / (1.0 - th);",
    "  return clamp(e - (1.0 - prof), 0.0, 1.0);",
    "}",
    "float erode(float base, vec3 p, float hf, float lod) {",
    "  vec3 q = p - vec3(0.0, RB, 0.0);",
    "  vec3 d = textureLod(uDetail, (q + uWind * 1.6) / 1.0, lod).rgb;",
    "  float df = d.r * 0.625 + d.g * 0.25 + d.b * 0.125;",
    "  float dm = mix(df, 1.0 - df, clamp(hf * 4.0, 0.0, 1.0));", // wispy at the base, billowy above
    "  return max(remap(base, dm * 0.45, 1.0, 0.0, 1.0), 0.0);",
    "}",
    // Transmittance of direct sunlight through the layer at p (base density, five samples).
    "uniform float uDensity;", // sigma_t per unit density, 1/km
    "float cloudShadow(vec3 p, float lod) {",
    "  float r = length(p);",
    "  if (r > RB + CT) return 1.0;",
    "  vec2 iB = sphere(p, uSunDir, RB + CB), iT = sphere(p, uSunDir, RB + CT);",
    "  float t0 = r < RB + CB ? iB.y : 0.0;",
    "  float t1 = r >= RB + CB && iB.x > 0.0 ? iB.x : iT.y;",
    "  if (t1 <= t0) return 1.0;",
    "  t1 = min(t1, t0 + 12.0);",
    "  float dt = (t1 - t0) / 8.0, od = 0.0, hf;",
    "  for (int i = 0; i < 8; i++) od += cloudBase(p + uSunDir * (t0 + (float(i) + 0.5) * dt), lod, hf) * dt;",
    "  return exp(-od * uDensity * 0.6);", // 0.6: the eroded density is lower than the base density
    "}",
    // Sunlit fraction of the air at p: one minus the local cloud fraction, read from a blurred mip
    // of the weather map where the sun ray crosses the middle of the layer. A single shadow ray
    // would be far too noisy for this (it aliases into bands when the sun is low).
    "float airShadow(vec3 p) {",
    "  float rm = RB + 0.5 * (CB + CT);",
    "  float r = length(p);",
    "  float t = r < rm ? min(max(sphere(p, uSunDir, rm).y, 0.0), 15.0) : 0.0;",
    "  vec3 q = p + uSunDir * t - vec3(0.0, RB, 0.0);",
    "  float w = textureLod(uWeather, (q.xz + uWind.xz * 0.6) / 48.0, 4.0).r;",
    "  float th = 1.0 - 0.42 * uCoverage - 0.3 * (w - 0.5);",
    "  return 1.0 - clamp((0.97 - th) * 2.5, 0.0, 1.0);",
    "}",
  ].join("\n");

  var CAMERA = [
    "uniform vec2 uRes;",
    "uniform vec3 uCamPos;",
    "uniform vec3 uCamF, uCamRt, uCamUp;",
    "uniform float uTanH, uAspect;",
    "vec3 rayDir(vec2 uv) {",
    "  vec2 n = uv * 2.0 - 1.0;",
    "  return normalize(uCamF + uCamRt * (n.x * uTanH * uAspect) + uCamUp * (n.y * uTanH));",
    "}",
  ].join("\n");

  var CLOUDS_FS = [
    HEAD, ATMO, LUTS, SKY, CLOUD, CAMERA,
    "uniform int uSteps, uLightSteps, uOctaves, uPhase, uPowder, uView;",
    "uniform float uFrame;",
    "uniform vec2 uJitter;",
    "uniform vec3 uSunE;",
    "uniform float uPixAngle;",
    "float hg(float mu, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * mu, 1.5)); }",
    "float phase(float mu, float s) {", // s scales the anisotropy for the octaves
    "  if (uPhase == 0) return 1.0 / (4.0 * PI);",
    "  if (uPhase == 1) return hg(mu, 0.8 * s);",
    "  return mix(hg(mu, -0.3 * s), hg(mu, 0.8 * s), 0.7);",
    "}",
    // Optical depth toward the sun: geometric steps, eroded density for the first three.
    "float lightOD(vec3 p, float lod) {",
    "  float od = 0.0, t = 0.0, ds = 0.05, hf;",
    "  for (int i = 0; i < 6; i++) {",
    "    if (i >= uLightSteps) break;",
    "    vec3 s = p + uSunDir * (t + 0.5 * ds);",
    "    float b = cloudBase(s, lod, hf);",
    "    if (b > 0.0 && i < 3) b = erode(b, s, hf, lod);",
    "    od += b * ds;",
    "    t += ds; ds *= 1.9;",
    "  }",
    "  return od * uDensity;",
    "}",
    "void main() {",
    "  vec2 uv = (gl_FragCoord.xy + uJitter) / uRes;",
    "  vec3 rd = rayDir(uv), ro = uCamPos;",
    "  float r = length(ro);",
    "  vec2 iB = sphere(ro, rd, RB + CB), iT = sphere(ro, rd, RB + CT);",
    "  float tG = sphere(ro, rd, RB).x;",
    "  bool ground = tG > 0.0;",
    "  float t0 = 0.0, t1 = -1.0;",
    "  if (r < RB + CB) { if (!ground) { t0 = iB.y; t1 = iT.y; } }",
    "  else if (r > RB + CT) { if (iT.x > 0.0) { t0 = iT.x; t1 = iB.x > 0.0 ? iB.x : iT.y; } }",
    "  else { t1 = iB.x > 0.0 ? iB.x : iT.y; }",
    "  t1 = min(t1, 160.0);", // beyond 160 km the clouds are lost in the haze
    "  if (t1 <= t0) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }",
    // samples evenly spaced in log(t): about constant size on screen, so grazing rays through
    // the far layer get long steps and steep rays short ones
    "  float ta = max(t0, 0.05);",
    "  int n = int(clamp(ceil((t1 - t0) / 0.035), 12.0, float(uSteps)));",
    "  float lr = log(t1 / ta) / float(n);",
    "  float grow = exp(lr) - 1.0;",
    // interleaved gradient noise (Jimenez 2014), shifted every frame
    "  vec2 px = gl_FragCoord.xy + 5.588238 * uFrame;",
    "  float j = fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));",
    "  float mu = dot(rd, uSunDir);",
    "  float ph[4];",
    "  float sc = 1.0;",
    "  for (int k = 0; k < 4; k++) { ph[k] = phase(mu, sc); sc *= 0.5; }",
    "  vec3 skyUp = skyLUT(1.0, 1.0) * 0.4 + (skyLUT(0.34, 1.0) + 2.0 * skyLUT(0.34, 0.0) + skyLUT(0.34, -1.0)) * 0.15;",
    "  float sunUp = clamp(uSunDir.y * 4.0 + 0.3, 0.0, 1.0);",
    "  vec3 groundAmb = uSunE * transLUT(RB + 0.01, uSunDir.y) * max(uSunDir.y, 0.0) * 0.3 / PI * 0.5;",
    "  vec3 sunE = uSunE;",
    "  float T = 1.0;",
    "  vec3 Ls = vec3(0.0);",
    "  float tw = 0.0, ww = 0.0, cost = 0.0;",
    "  for (int i = 0; i < 160; i++) {",
    "    if (i >= n || T < 0.01) break;",
    "    float t = ta * exp(lr * (float(i) + j));",
    "    float dt = t * grow;",
    "    vec3 p = ro + rd * t;",
    "    float lod = max(0.0, log2(t * uPixAngle / 0.055));", // footprint vs. a shape texel (7 km / 128)
    "    float hf;",
    "    float b = cloudBase(p, lod, hf);",
    "    cost += 1.0;",
    "    if (b <= 0.0) continue;",
    "    b = erode(b, p, hf, lod);",
    "    if (b <= 0.0) continue;",
    "    float sig = b * uDensity * smoothstep(160.0, 100.0, t);", // fade out instead of a hard cut-off
    "    float od = lightOD(p, lod);",
    "    cost += float(uLightSteps) + 3.0;",
    "    float ms = 0.0, a = 1.0, bb = 1.0;",
    "    for (int k = 0; k < 4; k++) {",
    "      if (k >= uOctaves) break;",
    "      ms += a * ph[k] * exp(-bb * od);",
    "      a *= 0.5; bb *= 0.5;",
    "    }",
    "    if (uPowder == 1) ms *= mix(1.0 - exp(-sig * 0.08), 1.0, 0.5 + 0.5 * mu);", // dark edges away from the sun
    "    vec3 Lsun = sunE * sunTrans(p, uSunDir);",
    // ambient sky light, occluded by the cloud above the sample (two base-density samples upward)
    "    float h1, h2;",
    "    float odUp = (cloudBase(p + normalize(p) * 0.12, lod + 1.0, h1) * 0.12 + cloudBase(p + normalize(p) * 0.45, lod + 1.0, h2) * 0.4) * uDensity;",
    "    vec3 amb = skyUp * exp(-0.35 * odUp) * mix(0.5, 1.0, hf) + groundAmb * (1.0 - hf);",
    "    float Ts = exp(-sig * dt);",
    // sigma_s = sigma_t: the step integral of S is (Lsun ms + amb)(1 - Ts)
    "    Ls += T * (Lsun * ms + amb) * (1.0 - Ts);",
    "    float wgt = T * (1.0 - Ts);",
    "    tw += wgt * t; ww += wgt;",
    "    T *= Ts;",
    "  }",
    "  if (uView == 3) { outColor = vec4(vec3(cost / (2.5 * float(uSteps))), T); return; }",
    "  if (ww <= 0.0) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }",
    // aerial perspective between the camera and the (weighted) cloud depth
    "  float tm = tw / ww;",
    "  vec3 Tair = transSeg(ro, rd, tm, false);",
    "  vec3 Tinf = ground ? transSeg(ro, rd, tG, true) : transLUT(r, dot(ro, rd) / r);",
    "  vec3 front = skyDir(rd) * clamp((1.0 - Tair) / max(1.0 - Tinf, vec3(1e-4)), 0.0, 1.0);",
    // air below the clouds is partly in their shadow
    "  if (r < RB + CB) front *= mix(0.35, 1.0, airShadow(ro + rd * (0.5 * tm)));",
    "  outColor = vec4((1.0 - T) * front + Tair * Ls, T);",
    "}",
  ].join("\n");

  // Temporal upsampling into a full-resolution history. The low-resolution samples of this frame
  // sit at a sub-pixel jitter (Halton 2, 3); each history pixel reprojects last frame's value,
  // clamps it to the 3x3 neighbourhood of this frame's samples and blends in the nearest sample,
  // mixed with the bilinear estimate by its distance. Over 16 frames every history pixel
  // receives nearby samples.
  var TAA_FS = [
    HEAD, CAMERA,
    "uniform sampler2D uCur, uHist;",
    "uniform vec2 uLowRes, uJitter;",
    "uniform vec3 uPF, uPR, uPU;", // previous camera basis
    "uniform float uBlend;",
    "uniform int uValid, uFast;",
    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / uRes;",
    "  vec2 xl = uv * uLowRes - 0.5 - uJitter;", // integer values are this frame's samples
    "  ivec2 mx = ivec2(uLowRes) - 1;",
    "  ivec2 i = clamp(ivec2(floor(xl + 0.5)), ivec2(0), mx);",
    "  vec2 d = xl - vec2(i);",
    "  vec4 c = texelFetch(uCur, i, 0);",
    "  vec4 lo = c, hi = c;",
    "  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {",
    "    vec4 s = texelFetch(uCur, clamp(i + ivec2(x, y), ivec2(0), mx), 0);",
    "    lo = min(lo, s); hi = max(hi, s);",
    "  }",
    "  vec4 cb = texture(uCur, (xl + 0.5) / uLowRes);", // bilinear estimate of this frame
    "  vec3 dir = rayDir(uv);",
    "  vec3 pc = vec3(dot(dir, uPR), dot(dir, uPU), dot(dir, uPF));",
    "  vec2 puv = 0.5 + 0.5 * vec2(pc.x / (pc.z * uTanH * uAspect), pc.y / (pc.z * uTanH));",
    "  bool ok = uValid == 1 && pc.z > 0.0 && all(greaterThanEqual(puv, vec2(0.0))) && all(lessThanEqual(puv, vec2(1.0)));",
    "  if (!ok) { outColor = cb; return; }",
    "  vec4 h = clamp(texture(uHist, puv), lo, hi);",
    "  if (uFast == 1) { outColor = mix(h, cb, 0.4); return; }", // parameters changed: converge quickly
    // the nearest sample is exact where it lands; between samples the bilinear estimate is better
    "  outColor = mix(h, mix(cb, c, exp(-8.0 * dot(d, d))), uBlend);",
    "}",
  ].join("\n");

  var COMPOSITE_FS = [
    HEAD, ATMO, LUTS, SKY, CLOUD, CAMERA,
    "uniform sampler2D uClouds;",
    "uniform int uCubic;",
    // cubic B-spline upsampling with four bilinear taps (Sigg and Hadwiger, GPU Gems 2, ch. 20)
    "vec4 cubicTex(sampler2D t, vec2 uv) {",
    "  vec2 ts = vec2(textureSize(t, 0));",
    "  vec2 p = uv * ts - 0.5;",
    "  vec2 f = fract(p);",
    "  p -= f;",
    "  vec2 f2 = f * f, f3 = f2 * f;",
    "  vec2 w0 = (-f3 + 3.0 * f2 - 3.0 * f + 1.0) / 6.0;",
    "  vec2 w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;",
    "  vec2 w3 = f3 / 6.0;",
    "  vec2 s0 = w0 + w1;",
    "  vec2 o0 = (p - 0.5 + w1 / s0) / ts;",
    "  vec2 o1 = (p + 1.5 + w3 / (1.0 - s0)) / ts;",
    "  vec4 a = mix(texture(t, vec2(o1.x, o0.y)), texture(t, vec2(o0.x, o0.y)), s0.x);",
    "  vec4 b = mix(texture(t, vec2(o1.x, o1.y)), texture(t, vec2(o0.x, o1.y)), s0.x);",
    "  return mix(b, a, s0.y);",
    "}",
    "uniform float uExposure, uStars;",
    "uniform vec3 uSunE;",
    "uniform int uView;",
    "vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }",
    "vec3 heat(float t) {",
    "  t = clamp(t, 0.0, 1.0);",
    "  vec3 c0 = vec3(0.06, 0.04, 0.24), c1 = vec3(0.12, 0.42, 0.86), c2 = vec3(0.2, 0.78, 0.55), c3 = vec3(0.98, 0.8, 0.2), c4 = vec3(0.86, 0.16, 0.1);",
    "  if (t < 0.25) return mix(c0, c1, t * 4.0);",
    "  if (t < 0.5) return mix(c1, c2, t * 4.0 - 1.0);",
    "  if (t < 0.75) return mix(c2, c3, t * 4.0 - 2.0);",
    "  return mix(c3, c4, t * 4.0 - 3.0);",
    "}",
    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / uRes;",
    "  vec3 rd = rayDir(uv), ro = uCamPos;",
    "  float r = length(ro);",
    "  vec3 col = skyDir(rd);",
    "  float tG = sphere(ro, rd, RB).x;",
    "  if (tG > 0.0) {",
    "    vec3 pg = ro + rd * tG;",
    "    vec3 nrm = normalize(pg);",
    "    vec4 w = texture(uWeather, pg.xz / 23.0);",
    "    vec4 w2 = texture(uWeather, pg.xz / 5.3 + 0.37);",
    "    vec3 alb = mix(vec3(0.045, 0.075, 0.03), vec3(0.13, 0.115, 0.07), clamp(w.b * 1.2 - 0.1, 0.0, 1.0));",
    "    alb *= 0.7 + 0.6 * w2.a * w2.b;",
    "    bool cl = uView != 1;",
    "    float sh = cl ? mix(0.2, 1.0, cloudShadow(pg, 2.0)) : 1.0;", // some light diffuses through a cloud
    "    float shAir = cl ? airShadow(ro + rd * (0.5 * tG)) : 1.0;", // how much of the air is sunlit
    "    vec3 skyUp = skyLUT(1.0, 1.0) * 0.4 + (skyLUT(0.34, 1.0) + 2.0 * skyLUT(0.34, 0.0) + skyLUT(0.34, -1.0)) * 0.15;",
    "    vec3 sunG = uSunE * sunTrans(pg, uSunDir);",
    // direct sun, sky light (dimmed under the clouds) and sunlight diffused through the clouds
    "    vec3 E = sunG * (max(dot(nrm, uSunDir), 0.0) * sh + max(uSunDir.y, 0.0) * (1.0 - shAir) * 0.25)",
    "           + PI * skyUp * 0.8 * mix(0.3, 1.0, shAir);",
    "    col = col * mix(0.35, 1.0, shAir) + alb / PI * E * transSeg(ro, rd, tG, true);",
    "  } else {",
    "    float cs = dot(rd, uSunDir);",
    "    float cosR = 0.99998907;", // cos of the sun's angular radius (0.268 deg)
    "    if (cs > cosR) {",
    "      float x = clamp((1.0 - cs) / (1.0 - cosR), 0.0, 1.0);",
    "      float limb = 1.0 - 0.6 * (1.0 - sqrt(1.0 - x));", // limb darkening
    // the disk is dimmed from its physical radiance (about 15000x the illuminance) to keep thin clouds readable
    "      col += uSunE * transLUT(r, rd.y) * 2500.0 * limb;",
    "    }",
    "    if (uStars > 0.0) {",
    "      vec3 g = floor(rd * 260.0);",
    "      float h = fract(sin(dot(g, vec3(12.9898, 78.233, 37.719))) * 43758.5453);",
    "      if (h > 0.9975) col += vec3(0.9, 0.95, 1.0) * uStars * (h - 0.9975) * 400.0 * transLUT(r, rd.y) / uExposure;",
    "    }",
    "  }",
    "  vec4 c = uCubic == 1 ? cubicTex(uClouds, uv) : texture(uClouds, uv);",
    "  if (uView == 0) col = col * c.a + c.rgb;",
    "  if (uView == 2) { outColor = vec4(vec3(c.a), 1.0); return; }",
    "  if (uView == 3) { outColor = vec4(heat(c.r), 1.0); return; }",
    "  vec3 m = aces(col * uExposure);",
    "  m = pow(m, vec3(1.0 / 2.2));",
    "  float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));",
    "  outColor = vec4(m + (dn - 0.5) / 255.0, 1.0);",
    "}",
  ].join("\n");

  // ------------------------------------------------------------------ state
  var MAXEL = 68 * Math.PI / 180; // highest sun elevation of the simulated day
  var PRESETS = [
    { time: 13.2, cov: 0.35, dens: 0.05, alt: 0.3, yaw: 0.9, pitch: 0.38 },
    { time: 17.5, cov: 0.45, dens: 0.05, alt: 0.3, yaw: 0.3, pitch: 0.3 },
    { time: 10.5, cov: 0.95, dens: 0.09, alt: 0.3, yaw: 0.7, pitch: 0.3 },
    { time: 17.3, cov: 0.45, dens: 0.05, alt: 6.5, yaw: 0.45, pitch: -0.1 },
  ];
  var st = { time: 17.5, cov: 0.45, dens: 0.05, alt: 0.3, phase: 2, ms: true, powder: false, wind: true, taa: true, view: 0, preset: 1 };
  var cam = { yaw: 0, pitch: 0.3 };
  var sunAz0 = 0;
  var FOV = 58 * Math.PI / 180;
  var tanH = Math.tan(FOV / 2);
  // quality levels: cloud resolution divisor, max view steps, light steps
  var LEVELS = [
    { div: 4, steps: 40, light: 4 },
    { div: 3, steps: 56, light: 5 },
    { div: 2, steps: 72, light: 6 },
    { div: 2, steps: 110, light: 6 },
    { div: 1.5, steps: 110, light: 6 },
  ];
  var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  var level = coarse ? 1 : 2;

  function sunAt(t) {
    var ang = (t - 6) / 12 * Math.PI;
    var el = Math.asin(Math.sin(MAXEL) * Math.sin(ang));
    var az = sunAz0 + (t - 12) / 6 * (Math.PI / 2);
    return { el: el, az: az };
  }
  function dirOf(el, az) { return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)]; }

  function applyPreset(i) {
    var p = PRESETS[i];
    st.preset = i;
    st.time = p.time; st.cov = p.cov; st.dens = p.dens; st.alt = p.alt;
    sunAz0 = 0;
    cam.yaw = sunAt(p.time).az + p.yaw;
    cam.pitch = p.pitch;
  }
  applyPreset(1);

  // ---------------------------------------------------------------- controls
  var inputs = {};
  var VALS = {
    time: function (v) { var h = Math.floor(v), m = Math.round((v - h) * 60); if (m === 60) { h++; m = 0; } return h + ":" + (m < 10 ? "0" : "") + m; },
    cov: function (v) { return Math.round(v * 100) + "%"; },
    dens: function (v) { return v.toFixed(3) + " m\u207b\u00b9"; },
    alt: function (v) { return v.toFixed(1) + " km"; },
  };
  var changed = 0, idle = 0, kick = function () {};
  function syncInputs() {
    Object.keys(inputs).forEach(function (k) {
      inputs[k].el.value = st[k];
      if (inputs[k].out) inputs[k].out.textContent = VALS[k](st[k]);
    });
  }
  function touch() { changed = 4; idle = 0; kick(); }
  each("[data-input]", function (el) {
    var k = el.dataset.input;
    inputs[k] = { el: el, out: q('[data-val="' + k + '"]') };
    el.addEventListener("input", function () {
      st[k] = +el.value;
      if (inputs[k].out) inputs[k].out.textContent = VALS[k](st[k]);
      clearPreset();
      touch();
    });
  });
  function setPressed(sel, fn) { each(sel, function (b) { b.setAttribute("aria-pressed", fn(b) ? "true" : "false"); }); }
  function clearPreset() { st.preset = -1; setPressed("[data-preset]", function () { return false; }); }
  function syncButtons() {
    setPressed("[data-phase]", function (b) { return +b.dataset.phase === st.phase; });
    setPressed("[data-view]", function (b) { return +b.dataset.view === st.view; });
    setPressed("[data-preset]", function (b) { return +b.dataset.preset === st.preset; });
    setPressed("[data-toggle]", function (b) { return !!st[b.dataset.toggle]; });
    legend.hidden = !(st.view === 2 || st.view === 3);
    legend.textContent = st.view === 2 ? L.legT : L.legC;
  }
  each("[data-phase]", function (b) { b.addEventListener("click", function () { st.phase = +b.dataset.phase; syncButtons(); touch(); }); });
  each("[data-view]", function (b) { b.addEventListener("click", function () { st.view = +b.dataset.view; syncButtons(); touch(); }); });
  each("[data-toggle]", function (b) { b.addEventListener("click", function () { var k = b.dataset.toggle; st[k] = !st[k]; syncButtons(); touch(); }); });
  each("[data-preset]", function (b) {
    b.addEventListener("click", function () { applyPreset(+b.dataset.preset); syncInputs(); syncButtons(); touch(); });
  });
  syncInputs();
  syncButtons();

  // ----------------------------------------------------------------- pointer
  var drag = null;
  canvas.addEventListener("pointerdown", function (e) {
    if (e.button !== undefined && e.button > 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    hint.style.opacity = "0";
    drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now(), moved: false };
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) > 6) drag.moved = true;
    if (!drag.moved) return;
    var k = FOV / Math.max(1, canvas.clientHeight);
    cam.yaw -= dx * k;
    cam.pitch = Math.max(-1.2, Math.min(1.45, cam.pitch - dy * k));
    drag.x = e.clientX;
    drag.y = e.clientY;
    touch();
  });
  function end(e) {
    if (!drag) return;
    var tap = !drag.moved && performance.now() - drag.t < 500;
    drag = null;
    canvas.style.cursor = "grab";
    if (tap && e.type === "pointerup") tapSun(e);
  }
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("dblclick", function () {
    var p = PRESETS[st.preset >= 0 ? st.preset : 1];
    cam.yaw = sunAt(st.time).az + p.yaw;
    cam.pitch = p.pitch;
    touch();
  });

  function basis() {
    var f = dirOf(cam.pitch, cam.yaw);
    var rt = [-Math.cos(cam.yaw), 0, Math.sin(cam.yaw)]; // f x up, normalized
    var up = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2], rt[0] * f[1] - rt[1] * f[0]];
    return { f: f, r: rt, u: up };
  }
  // Tap the sky: the sun moves to that direction. The day's path is rotated so that it passes
  // through the tapped point, and the time is solved from the elevation on the current half-day.
  function tapSun(e) {
    var rect = canvas.getBoundingClientRect();
    var nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    var ny = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    var b = basis(), a = rect.width / rect.height;
    var d = [0, 0, 0];
    for (var i = 0; i < 3; i++) d[i] = b.f[i] + b.r[i] * nx * tanH * a + b.u[i] * ny * tanH;
    var l = Math.hypot(d[0], d[1], d[2]);
    var el = Math.asin(Math.max(-0.2, Math.min(Math.sin(MAXEL), d[1] / l)));
    var az = Math.atan2(d[0], d[2]);
    var t = 6 + Math.asin(Math.sin(el) / Math.sin(MAXEL)) * 12 / Math.PI;
    if (st.time > 12) t = 24 - t;
    t = Math.max(4.5, Math.min(19.5, t));
    st.time = t;
    sunAz0 = az - (t - 12) / 6 * (Math.PI / 2);
    clearPreset();
    syncInputs();
    touch();
  }

  // -------------------------------------------------------------------- GL
  function start() {
    var gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) return fail(L.nogl);
    if (!gl.getExtension("EXT_color_buffer_float")) return fail(L.nogl2);

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function prog(fs) {
      var p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, "aPos");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      var u = {};
      for (var i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
        var info = gl.getActiveUniform(p, i);
        u[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name);
      }
      return { p: p, u: u };
    }
    var P;
    try {
      P = {
        noise: prog(NOISE_FS), trans: prog(TRANS_FS), ms: prog(MS_FS), sky: prog(SKYVIEW_FS),
        clouds: prog(CLOUDS_FS), taa: prog(TAA_FS), comp: prog(COMPOSITE_FS),
      };
    } catch (err) {
      if (window.console) console.warn(err);
      return fail(L.nogl2);
    }

    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    function tex2D(w, h, fmt, wrap, mip) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (fmt === "f16") gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      return t;
    }
    function tex3D(n) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, t);
      gl.texStorage3D(gl.TEXTURE_3D, Math.log2(n) + 1, gl.RGBA8, n, n, n);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R].forEach(function (w) { gl.texParameteri(gl.TEXTURE_3D, w, gl.REPEAT); });
      return t;
    }
    function fbo2D(t) {
      var f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return f;
    }
    function bind(u, name, unit, target, t) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(target, t);
      gl.uniform1i(u[name], unit);
    }
    function draw(fb, w, h, p) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.viewport(0, 0, w, h);
      gl.useProgram(p.p);
    }

    var SHAPE_N = 128, DETAIL_N = 32, WEATHER_N = 512;
    var T = {
      trans: tex2D(256, 64, "f16", gl.CLAMP_TO_EDGE),
      ms: tex2D(32, 32, "f16", gl.CLAMP_TO_EDGE),
      sky: tex2D(192, 108, "f16", gl.CLAMP_TO_EDGE),
      weather: tex2D(WEATHER_N, WEATHER_N, "u8", gl.REPEAT, true),
      shape: tex3D(SHAPE_N),
      detail: tex3D(DETAIL_N),
    };
    var F = { trans: fbo2D(T.trans), ms: fbo2D(T.ms), sky: fbo2D(T.sky), weather: fbo2D(T.weather) };
    gl.bindFramebuffer(gl.FRAMEBUFFER, F.trans);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return fail(L.nogl2);
    var layerFb = gl.createFramebuffer();

    // ---------------------------------------------------- one-off generation
    var gen = { stage: 0, z: 0 }; // 0 shape, 1 detail, 2 weather + LUTs, 3 done
    var SLICES_PER_FRAME = 8;
    function genStep() {
      var u = P.noise.u;
      gl.bindFramebuffer(gl.FRAMEBUFFER, layerFb);
      gl.useProgram(P.noise.p);
      if (gen.stage === 0 || gen.stage === 1) {
        var n = gen.stage === 0 ? SHAPE_N : DETAIL_N, t = gen.stage === 0 ? T.shape : T.detail;
        gl.viewport(0, 0, n, n);
        gl.uniform1i(u.uKind, gen.stage);
        gl.uniform1f(u.uSize, n);
        var count = gen.stage === 0 ? SLICES_PER_FRAME : DETAIL_N;
        for (var k = 0; k < count && gen.z < n; k++, gen.z++) {
          gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, t, 0, gen.z);
          gl.uniform1f(u.uZ, gen.z);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        if (gen.z >= n) {
          gl.bindTexture(gl.TEXTURE_3D, t);
          gl.generateMipmap(gl.TEXTURE_3D);
          gen.stage++;
          gen.z = 0;
        }
        return;
      }
      // weather map
      draw(F.weather, WEATHER_N, WEATHER_N, P.noise);
      gl.uniform1i(u.uKind, 2);
      gl.uniform1f(u.uSize, WEATHER_N);
      gl.uniform1f(u.uZ, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, T.weather);
      gl.generateMipmap(gl.TEXTURE_2D);
      // transmittance, then multiple scattering
      draw(F.trans, 256, 64, P.trans);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      draw(F.ms, 32, 32, P.ms);
      bind(P.ms.u, "uTrans", 0, gl.TEXTURE_2D, T.trans);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gen.stage = 3;
    }
    function genProgress() {
      var done = gen.stage === 0 ? gen.z : gen.stage === 1 ? SHAPE_N + gen.z : SHAPE_N + DETAIL_N;
      return Math.round(100 * done / (SHAPE_N + DETAIL_N + 4));
    }

    // ---------------------------------------------- resolution-dependent targets
    var W = 0, H = 0, CW = 0, CH = 0, C = null, histIdx = 0, histValid = false;
    var fullScale = 1;
    var HW = 0, HH = 0;
    function allocClouds(cw, ch) {
      if (C) {
        C.tex.forEach(function (t) { gl.deleteTexture(t); });
        C.fb.forEach(function (f) { gl.deleteFramebuffer(f); });
      }
      CW = cw; CH = ch; HW = W; HH = H;
      var cur = tex2D(cw, ch, "f16", gl.CLAMP_TO_EDGE), h0 = tex2D(W, H, "f16", gl.CLAMP_TO_EDGE), h1 = tex2D(W, H, "f16", gl.CLAMP_TO_EDGE);
      C = { cur: cur, hist: [h0, h1], tex: [cur, h0, h1] };
      C.curFb = fbo2D(cur);
      C.histFb = [fbo2D(h0), fbo2D(h1)];
      C.fb = [C.curFb, C.histFb[0], C.histFb[1]];
      histValid = false;
    }

    // ------------------------------------------------------------------ frame
    var frame = 0, lastT = 0, fps = 0, windT = 0, times = [], failedUp = {}, prevB = null;
    var skyKey = "";
    function halton(i, b) {
      var f = 1, r = 0;
      while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); }
      return r;
    }
    function exposureFor(elDeg) {
      // a simple auto-exposure: twilight skies are about a thousand times darker than daylight
      var e = elDeg > -2 ? (8 - elDeg) / 12.5 : 0.8 + (-2 - elDeg) * 0.22;
      return 11 * Math.pow(10, Math.max(0, Math.min(3, e)));
    }
    function setCam(u, b) {
      gl.uniform3f(u.uCamPos, 0, 6360 + st.alt, 0);
      gl.uniform3fv(u.uCamF, b.f);
      gl.uniform3fv(u.uCamRt, b.r);
      gl.uniform3fv(u.uCamUp, b.u);
      gl.uniform1f(u.uTanH, tanH);
      gl.uniform1f(u.uAspect, W / H);
    }
    function setCommon(u, sun) {
      bind(u, "uTrans", 0, gl.TEXTURE_2D, T.trans);
      bind(u, "uMS", 1, gl.TEXTURE_2D, T.ms);
      bind(u, "uSky", 2, gl.TEXTURE_2D, T.sky);
      bind(u, "uWeather", 3, gl.TEXTURE_2D, T.weather);
      bind(u, "uShape", 4, gl.TEXTURE_3D, T.shape);
      bind(u, "uDetail", 5, gl.TEXTURE_3D, T.detail);
      gl.uniform1f(u.uCamR, 6360 + st.alt);
      gl.uniform3fv(u.uSunDir, sun);
      gl.uniform3f(u.uSunE, 1, 1, 1);
      gl.uniform1f(u.uCoverage, st.cov);
      gl.uniform3f(u.uWind, windT * 0.9, 0, windT * 0.35);
      gl.uniform1f(u.uDensity, st.dens * 1000); // per metre -> per km
    }

    function render(now) {
      var dt = lastT ? Math.min((now - lastT) / 1000, 0.25) : 0;
      lastT = now;
      frame++;
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5) * fullScale;
      var w = Math.max(32, Math.min(1600, Math.round(canvas.clientWidth * dpr)));
      var h = Math.max(18, Math.round(w * canvas.clientHeight / Math.max(1, canvas.clientWidth)));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      W = w; H = h;
      gl.bindVertexArray(vao);

      if (gen.stage < 3) {
        genStep();
        statsEl.textContent = L.gen.replace("{p}", genProgress());
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
        gl.clearColor(0.05, 0.06, 0.08, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return true;
      }

      var lv = LEVELS[level];
      var cw = Math.max(8, Math.round(W / lv.div)), ch = Math.max(8, Math.round(H / lv.div));
      if (cw !== CW || ch !== CH || W !== HW || H !== HH) allocClouds(cw, ch);
      var k = (frame % 16) + 1, jit = st.taa ? [halton(k, 2) - 0.5, halton(k, 3) - 0.5] : [0, 0];
      if (st.wind) windT += dt * 0.12; // km of drift per second (a time-lapse)

      var s = sunAt(st.time);
      var sun = dirOf(s.el, s.az);
      var b = basis();
      var u;

      // 1. sky-view LUT (only when the sun or the altitude changed)
      var key = s.el.toFixed(5) + "/" + st.alt.toFixed(3);
      if (key !== skyKey) {
        skyKey = key;
        u = P.sky.u;
        draw(F.sky, 192, 108, P.sky);
        bind(u, "uTrans", 0, gl.TEXTURE_2D, T.trans);
        bind(u, "uMS", 1, gl.TEXTURE_2D, T.ms);
        gl.uniform1f(u.uCamR, 6360 + st.alt);
        gl.uniform1f(u.uSunCos, sun[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // 2. clouds at reduced resolution
      var showClouds = st.view !== 1;
      u = P.clouds.u;
      draw(C.curFb, CW, CH, P.clouds);
      if (showClouds) {
        setCommon(u, sun);
        setCam(u, b);
        gl.uniform2f(u.uRes, CW, CH);
        gl.uniform1i(u.uSteps, lv.steps);
        gl.uniform1i(u.uLightSteps, lv.light);
        gl.uniform1i(u.uOctaves, st.ms ? 4 : 1);
        gl.uniform1i(u.uPhase, st.phase);
        gl.uniform1i(u.uPowder, st.powder ? 1 : 0);
        gl.uniform1i(u.uView, st.view);
        gl.uniform1f(u.uFrame, st.taa ? frame % 1024 : 0);
        gl.uniform1f(u.uPixAngle, 2 * tanH / CH);
        gl.uniform2fv(u.uJitter, jit);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }

      // 3. temporal accumulation
      var shown = C.cur;
      if (st.taa && showClouds) {
        var dst = histIdx ^ 1;
        u = P.taa.u;
        draw(C.histFb[dst], W, H, P.taa);
        bind(u, "uCur", 0, gl.TEXTURE_2D, C.cur);
        bind(u, "uHist", 1, gl.TEXTURE_2D, C.hist[histIdx]);
        setCam(u, b);
        gl.uniform2f(u.uRes, W, H);
        gl.uniform2f(u.uLowRes, CW, CH);
        gl.uniform2fv(u.uJitter, jit);
        var pb = prevB || b;
        gl.uniform3fv(u.uPF, pb.f);
        gl.uniform3fv(u.uPR, pb.r);
        gl.uniform3fv(u.uPU, pb.u);
        gl.uniform1i(u.uValid, histValid ? 1 : 0);
        gl.uniform1i(u.uFast, changed > 0 ? 1 : 0);
        gl.uniform1f(u.uBlend, 0.2);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        histIdx = dst;
        histValid = true;
        shown = C.hist[dst];
      } else histValid = false;
      prevB = b;
      if (changed > 0) changed--;

      // 4. composite at full resolution
      u = P.comp.u;
      draw(null, W, H, P.comp);
      setCommon(u, sun);
      setCam(u, b);
      bind(u, "uClouds", 6, gl.TEXTURE_2D, shown);
      gl.uniform1i(u.uCubic, shown === C.cur ? 1 : 0); // the low-resolution buffer is shown directly
      gl.uniform2f(u.uRes, W, H);
      gl.uniform1i(u.uView, st.view);
      var elDeg = s.el * 180 / Math.PI;
      var expo = exposureFor(elDeg);
      gl.uniform1f(u.uExposure, expo);
      gl.uniform1f(u.uStars, Math.max(0, Math.min(1, (-1 - elDeg) / 7)));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      for (var i = 0; i < 7; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindTexture(gl.TEXTURE_3D, null);
      }

      // adapt the cost to the frame rate
      if (dt > 0) {
        fps = fps ? fps * 0.9 + 0.1 / dt : 1 / dt;
        times.push(dt);
        if (times.length >= 30) {
          var avg = times.reduce(function (x, y) { return x + y; }, 0) / times.length;
          times = [];
          if (avg > 1 / 40) {
            failedUp[level] = true;
            if (level > 0) level--;
            else if (fullScale > 0.6) fullScale *= 0.8;
          } else if (avg < 1 / 57 && level < LEVELS.length - 1 && !failedUp[level + 1]) {
            level++;
          }
        }
      }
      if (frame % 10 === 0 || frame < 3)
        statsEl.textContent = L.stats
          .replace("{sun}", elDeg.toFixed(1))
          .replace("{cw}", CW).replace("{ch}", CH)
          .replace("{n}", lv.steps).replace("{l}", lv.light)
          .replace("{fps}", Math.round(fps));
      // keep animating while the wind blows or the history is converging
      idle++;
      return st.wind || idle < 60;
    }

    // run only while visible
    var visible = false, raf = 0;
    function tick(now) {
      raf = 0;
      var more = render(now);
      if (more && visible && !document.hidden) raf = requestAnimationFrame(tick);
      else lastT = 0;
    }
    kick = function () {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick);
    };
    new IntersectionObserver(function (e) {
      visible = e[e.length - 1].isIntersecting;
      kick();
    }).observe(canvas);
    document.addEventListener("visibilitychange", kick);
    window.addEventListener("resize", touch);
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); visible = false; });
  }

  // initialise lazily, the first time the panel is shown
  new IntersectionObserver(function (e, obs) {
    if (e[e.length - 1].isIntersecting) {
      obs.disconnect();
      start();
    }
  }).observe(canvas);
})();
