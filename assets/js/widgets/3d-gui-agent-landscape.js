// 3D GUI Agent post 04: interactive capability map of agents in XR and 3D (as of November 2026).
// Each work or product is a point placed by how much of the 3D UI it perceives (x) and how much
// it operates (y), coloured by the kind of user intent it understands, outlined by how it was
// evaluated. Filter by category, platform and year; tap a point to read a summary with numbers
// and a link; toggle the target region of the 3D GUI agent idea.
// Ratings follow the rubric in section 0 of the post; data from the column's research dossiers
// (docs/research/3d-gui-agent/03-agents-in-xr-and-3d.md and 04-platforms-and-tooling.md).
// Source is ASCII-only: non-ASCII text is written as \u escapes.
(function () {
  "use strict";
  var AX = "https://arxiv.org/abs/";
  // P perceive 3D UI, I intent, O operate/guide, E evaluated: 0 none, 1 partial, 2 full.
  // pl: platforms; y: year of first public appearance; v: venue or status.
  var W = [
    { k: "orienter", n: "Orienter", c: "A", y: 2024, pl: ["pcvr"], P: 2, I: 0, O: 1, E: 2, v: "FSE 2026 (arXiv 2024)", u: AX + "2409.10811",
      s: { en: "Zero-shot detection of interactable GUI elements in VR screenshots: an LMM proposes elements, the APE grounding model boxes them, an LMM advisor validates them in a loop. F1 44.1% at IoU 0.75 vs 32.7% for a trained Faster R-CNN and 2.2% for OmniParser; 1,552 frames from 100 Steam apps. No user intent; interactions are simulated for test exploration.",
        zh: "\u5bf9 VR \u622a\u56fe\u4e2d\u53ef\u4ea4\u4e92 GUI \u5143\u7d20\u7684\u96f6\u6837\u672c\u68c0\u6d4b\uff1aLMM \u63d0\u51fa\u5019\u9009\u5143\u7d20\uff0cAPE \u5b9a\u4f4d\u6a21\u578b\u7ed9\u51fa\u8fb9\u6846\uff0cLMM \u987e\u95ee\u5faa\u73af\u9a8c\u8bc1\u3002IoU 0.75 \u4e0b F1 \u4e3a 44.1%\uff0c\u8bad\u7ec3\u8fc7\u7684 Faster R-CNN \u4e3a 32.7%\uff0cOmniParser \u4e3a 2.2%\uff1b\u6570\u636e\u4e3a 100 \u4e2a Steam \u5e94\u7528\u7684 1,552 \u5e27\u3002\u6ca1\u6709\u7528\u6237\u610f\u56fe\uff1b\u4ea4\u4e92\u662f\u4e3a\u6d4b\u8bd5\u63a2\u7d22\u800c\u6a21\u62df\u7684\u3002",
        ja: "VR \u30b9\u30af\u30ea\u30fc\u30f3\u30b7\u30e7\u30c3\u30c8\u4e2d\u306e\u64cd\u4f5c\u53ef\u80fd\u306a GUI \u8981\u7d20\u306e\u30bc\u30ed\u30b7\u30e7\u30c3\u30c8\u691c\u51fa\uff1aLMM \u304c\u8981\u7d20\u3092\u63d0\u6848\u3057\u3001\u63a5\u5730\u30e2\u30c7\u30eb APE \u304c\u67a0\u3067\u4f4d\u7f6e\u3092\u7279\u5b9a\u3057\u3001LMM \u306e\u30a2\u30c9\u30d0\u30a4\u30b6\u30fc\u304c\u30eb\u30fc\u30d7\u3067\u691c\u8a3c\u3057\u307e\u3059\u3002IoU 0.75 \u3067\u306e F1 \u306f 44.1%\uff08\u5b66\u7fd2\u6e08\u307f Faster R-CNN \u306f 32.7%\u3001OmniParser \u306f 2.2%\uff09\u3002100 \u500b\u306e Steam \u30a2\u30d7\u30ea\u306e 1,552 \u30d5\u30ec\u30fc\u30e0\u3002\u30e6\u30fc\u30b6\u30fc\u306e\u610f\u56f3\u306f\u306a\u304f\u3001\u64cd\u4f5c\u306f\u30c6\u30b9\u30c8\u63a2\u7d22\u306e\u305f\u3081\u306e\u6a21\u64ec\u3067\u3059\u3002" } },
    { k: "combobench", n: "ComboBench", c: "A", y: 2025, pl: ["pcvr", "quest"], P: 0, I: 2, O: 1, E: 2, v: "arXiv preprint 2025", u: AX + "2510.24706",
      s: { en: "262 scenarios from four VR games: translate a semantic action into the controller and headset steps the game needs. The best LLM matches the exact sequence in 11.7% of cases (Gemini-1.5-Pro, 5-shot); zero-shot at most 5.8%. Text only, nothing executed.",
        zh: "\u6765\u81ea 4 \u6b3e VR \u6e38\u620f\u7684 262 \u4e2a\u573a\u666f\uff1a\u628a\u8bed\u4e49\u52a8\u4f5c\u7ffb\u8bd1\u6210\u6e38\u620f\u6240\u9700\u7684\u624b\u67c4\u4e0e\u5934\u663e\u64cd\u4f5c\u6b65\u9aa4\u3002\u6700\u4f73 LLM \u7684\u5b8c\u5168\u5339\u914d\u7387\u4e3a 11.7%\uff08Gemini-1.5-Pro\uff0c5-shot\uff09\uff1b\u96f6\u6837\u672c\u6700\u591a 5.8%\u3002\u4ec5\u6587\u672c\uff0c\u4e0d\u6267\u884c\u3002",
        ja: "4 \u672c\u306e VR \u30b2\u30fc\u30e0\u306e 262 \u30b7\u30ca\u30ea\u30aa\uff1a\u610f\u5473\u7684\u306a\u884c\u52d5\u3092\u3001\u30b2\u30fc\u30e0\u304c\u6c42\u3081\u308b\u30b3\u30f3\u30c8\u30ed\u30fc\u30e9\u3068\u30d8\u30c3\u30c9\u30bb\u30c3\u30c8\u306e\u64cd\u4f5c\u624b\u9806\u306b\u5909\u63db\u3057\u307e\u3059\u3002\u6700\u826f\u306e LLM \u3067\u3082\u5b8c\u5168\u4e00\u81f4\u306f 11.7%\uff08Gemini-1.5-Pro\u30015-shot\uff09\u3001\u30bc\u30ed\u30b7\u30e7\u30c3\u30c8\u3067\u306f\u6700\u5927 5.8%\u3002\u30c6\u30ad\u30b9\u30c8\u306e\u307f\u3067\u3001\u5b9f\u884c\u306f\u3057\u307e\u305b\u3093\u3002" } },
    { k: "navai", n: "NavAI", c: "A", y: 2026, pl: ["unity"], P: 1, I: 2, O: 1, E: 2, v: "arXiv preprint 2026", u: AX + "2601.03251",
      s: { en: "A closed loop from a natural-language request and field-of-view screenshots (with a grid overlay) to move, rotate and look calls in Unity, with voting across three LLMs. 21/21 basic actions and 16/18 goal tasks, but about 49 s per turn. Locomotion only, no UI elements.",
        zh: "\u4ece\u81ea\u7136\u8bed\u8a00\u8bf7\u6c42\u548c\u5e26\u7f51\u683c\u53e0\u52a0\u7684\u89c6\u91ce\u622a\u56fe\uff0c\u5230 Unity \u4e2d move\u3001rotate\u3001look \u8c03\u7528\u7684\u95ed\u73af\uff0c\u7531\u4e09\u4e2a LLM \u6295\u7968\u51b3\u7b56\u300221/21 \u4e2a\u57fa\u672c\u52a8\u4f5c\u300116/18 \u4e2a\u76ee\u6807\u4efb\u52a1\u6210\u529f\uff0c\u4f46\u6bcf\u8f6e\u7ea6 49 s\u3002\u53ea\u6709\u79fb\u52a8\uff0c\u4e0d\u6d89\u53ca\u754c\u9762\u5143\u7d20\u3002",
        ja: "\u81ea\u7136\u8a00\u8a9e\u306e\u4f9d\u983c\u3068\u30b0\u30ea\u30c3\u30c9\u3092\u91cd\u306d\u305f\u8996\u91ce\u306e\u30b9\u30af\u30ea\u30fc\u30f3\u30b7\u30e7\u30c3\u30c8\u304b\u3089\u3001Unity \u306e move\u30fbrotate\u30fblook \u547c\u3073\u51fa\u3057\u307e\u3067\u306e\u9589\u30eb\u30fc\u30d7\u3067\u30013 \u3064\u306e LLM \u306e\u6295\u7968\u3067\u6b21\u306e\u624b\u3092\u6c7a\u3081\u307e\u3059\u3002\u57fa\u672c\u52d5\u4f5c 21/21\u3001\u76ee\u6a19\u30bf\u30b9\u30af 16/18 \u3092\u9054\u6210\u3057\u307e\u3059\u304c\u30011 \u30bf\u30fc\u30f3\u7d04 49 s\u3002\u79fb\u52d5\u306e\u307f\u3067 UI \u8981\u7d20\u306f\u6271\u3044\u307e\u305b\u3093\u3002" } },
    { k: "siagent", n: "SIAgent", c: "A", y: 2026, pl: ["unity"], P: 1, I: 1, O: 2, E: 2, v: "arXiv preprint 2026", u: AX + "2603.00522",
      s: { en: "Gaze and hand motion are verbalized, an LLM ranks six intent hypotheses and a virtual hand executes the chosen operation. N=16: 97.2% intent recognition, 86.8% execution accuracy, 81% preferred it, but about 9.1 s of LLM latency. No language instructions, no GUI perception.",
        zh: "\u628a\u6ce8\u89c6\u4e0e\u624b\u90e8\u8fd0\u52a8\u8f6c\u5199\u6210\u6587\u672c\uff0cLLM \u7ed9\u51fa\u516d\u4e2a\u6392\u5e8f\u7684\u610f\u56fe\u5047\u8bbe\uff0c\u7531\u865a\u62df\u624b\u6267\u884c\u9009\u4e2d\u7684\u64cd\u4f5c\u3002N=16\uff1a\u610f\u56fe\u8bc6\u522b 97.2%\uff0c\u6267\u884c\u51c6\u786e\u7387 86.8%\uff0c81% \u7684\u53c2\u4e0e\u8005\u66f4\u504f\u597d\u5b83\uff0c\u4f46 LLM \u5ef6\u8fdf\u7ea6 9.1 s\u3002\u6ca1\u6709\u8bed\u8a00\u6307\u4ee4\uff0c\u4e5f\u4e0d\u611f\u77e5 GUI\u3002",
        ja: "\u8996\u7dda\u3068\u624b\u306e\u52d5\u304d\u3092\u8a00\u8a9e\u5316\u3057\u3001LLM \u304c 6 \u3064\u306e\u610f\u56f3\u5019\u88dc\u3092\u9806\u4f4d\u4ed8\u3051\u3057\u3001\u4eee\u60f3\u306e\u624b\u304c\u9078\u3070\u308c\u305f\u64cd\u4f5c\u3092\u5b9f\u884c\u3057\u307e\u3059\u3002N=16 \u3067\u610f\u56f3\u8a8d\u8b58 97.2%\u3001\u5b9f\u884c\u7cbe\u5ea6 86.8%\u300181% \u304c\u597d\u307f\u307e\u3057\u305f\u304c\u3001LLM \u306e\u9045\u5ef6\u306f\u7d04 9.1 s\u3002\u8a00\u8a9e\u6307\u793a\u3082 GUI \u306e\u77e5\u899a\u3082\u3042\u308a\u307e\u305b\u3093\u3002" } },
    { k: "ptt", n: "Put-That-There LLM", c: "A", y: 2025, pl: ["quest"], P: 1, I: 2, O: 2, E: 0, v: "ISMAR 2025 Adjunct (per OpenAlex)", u: AX + "2511.02378",
      s: { en: "GPT-4 fuses window metadata, room surfaces from the Quest Scene API, speech, pointing and head direction into JSON place/remove actions: explicit, deictic ('put that there') and goal-level commands. Acts on the XR window layer through metadata; no quantitative evaluation yet.",
        zh: "GPT-4 \u878d\u5408\u7a97\u53e3\u5143\u6570\u636e\u3001Quest Scene API \u63d0\u4f9b\u7684\u623f\u95f4\u8868\u9762\u3001\u8bed\u97f3\u3001\u6307\u5411\u4e0e\u5934\u90e8\u671d\u5411\uff0c\u8f93\u51fa JSON \u5f62\u5f0f\u7684\u653e\u7f6e/\u79fb\u9664\u52a8\u4f5c\uff0c\u652f\u6301\u663e\u5f0f\u3001\u6307\u793a\u6027\uff08\u201c\u628a\u90a3\u4e2a\u653e\u5230\u90a3\u91cc\u201d\uff09\u548c\u76ee\u6807\u7ea7\u547d\u4ee4\u3002\u901a\u8fc7\u5143\u6570\u636e\u4f5c\u7528\u4e8e XR \u7a97\u53e3\u5c42\uff1b\u5c1a\u65e0\u5b9a\u91cf\u8bc4\u6d4b\u3002",
        ja: "GPT-4 \u304c\u30a6\u30a3\u30f3\u30c9\u30a6\u306e\u30e1\u30bf\u30c7\u30fc\u30bf\u3001Quest Scene API \u306e\u90e8\u5c4b\u306e\u9762\u3001\u97f3\u58f0\u3001\u30dd\u30a4\u30f3\u30c6\u30a3\u30f3\u30b0\u3001\u982d\u306e\u5411\u304d\u3092\u7d71\u5408\u3057\u3001JSON \u306e\u914d\u7f6e\u30fb\u524a\u9664\u30a2\u30af\u30b7\u30e7\u30f3\u3092\u51fa\u529b\u3057\u307e\u3059\u3002\u660e\u793a\u7684\u3001\u76f4\u793a\u7684\uff08\u300c\u305d\u308c\u3092\u305d\u3053\u306b\u300d\uff09\u3001\u76ee\u6a19\u30ec\u30d9\u30eb\u306e\u547d\u4ee4\u306b\u5bfe\u5fdc\u3002\u30e1\u30bf\u30c7\u30fc\u30bf\u3092\u901a\u3058\u3066 XR \u306e\u30a6\u30a3\u30f3\u30c9\u30a6\u5c64\u3092\u64cd\u4f5c\u3057\u3001\u5b9a\u91cf\u8a55\u4fa1\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093\u3002" } },
    { k: "duozone", n: "DuoZone", c: "A", y: 2025, pl: ["avp"], P: 1, I: 2, O: 2, E: 2, v: "IEEE TVCG 2026 (arXiv 2025)", u: AX + "2511.15676",
      s: { en: "On Vision Pro, an LLM recommends apps for the user's goal and assigns them to user-defined zones; an optimizer sizes windows; the user confirms. N=16 vs native visionOS: layout matching 34.5% faster, workspace built in 168.3 s vs 218.1 s, lower workload; about 4 s per request. Window layer only.",
        zh: "\u5728 Vision Pro \u4e0a\uff0cLLM \u6839\u636e\u7528\u6237\u76ee\u6807\u63a8\u8350\u5e94\u7528\u5e76\u5206\u914d\u5230\u7528\u6237\u5b9a\u4e49\u7684\u533a\u57df\uff0c\u7531\u4f18\u5316\u5668\u51b3\u5b9a\u7a97\u53e3\u5c3a\u5bf8\uff0c\u7528\u6237\u786e\u8ba4\u540e\u751f\u6548\u3002N=16\uff0c\u5bf9\u6bd4\u539f\u751f visionOS\uff1a\u5e03\u5c40\u5339\u914d\u5feb 34.5%\uff0c\u642d\u5efa\u5de5\u4f5c\u533a 168.3 s \u5bf9 218.1 s\uff0c\u8d1f\u8377\u66f4\u4f4e\uff1b\u6bcf\u6b21\u8bf7\u6c42\u7ea6 4 s\u3002\u4ec5\u9650\u7a97\u53e3\u5c42\u3002",
        ja: "Vision Pro \u4e0a\u3067\u3001LLM \u304c\u30e6\u30fc\u30b6\u30fc\u306e\u76ee\u7684\u306b\u5408\u3046\u30a2\u30d7\u30ea\u3092\u63a8\u85a6\u3057\u3066\u30e6\u30fc\u30b6\u30fc\u5b9a\u7fa9\u306e\u30be\u30fc\u30f3\u306b\u5272\u308a\u5f53\u3066\u3001\u6700\u9069\u5316\u5668\u304c\u30a6\u30a3\u30f3\u30c9\u30a6\u306e\u5927\u304d\u3055\u3092\u6c7a\u3081\u3001\u30e6\u30fc\u30b6\u30fc\u304c\u78ba\u8a8d\u3057\u307e\u3059\u3002N=16\u3001\u6a19\u6e96\u306e visionOS \u3068\u6bd4\u3079\u3066\u30ec\u30a4\u30a2\u30a6\u30c8\u5408\u308f\u305b\u304c 34.5% \u901f\u304f\u3001\u4f5c\u696d\u7a7a\u9593\u306e\u69cb\u7bc9\u306f 168.3 s \u5bfe 218.1 s\u3001\u8ca0\u8377\u3082\u4f4e\u4e0b\u30021 \u56de\u7d04 4 s\u3002\u30a6\u30a3\u30f3\u30c9\u30a6\u5c64\u306e\u307f\u3067\u3059\u3002" } },
    { k: "voice2action", n: "Voice2Action", c: "A", y: 2023, pl: ["other"], P: 1, I: 2, O: 2, E: 1, v: "arXiv preprint 2023", u: AX + "2310.00092",
      s: { en: "An early agent that splits voice or text commands into action and entity extraction and executes them hierarchically in a VR scene through the engine, with environment feedback. Evaluated on synthetic instructions only, without a user study.",
        zh: "\u65e9\u671f\u7684\u667a\u80fd\u4f53\uff1a\u628a\u8bed\u97f3\u6216\u6587\u672c\u547d\u4ee4\u62c6\u5206\u4e3a\u52a8\u4f5c\u4e0e\u5b9e\u4f53\u62bd\u53d6\uff0c\u901a\u8fc7\u5f15\u64ce\u5728 VR \u573a\u666f\u4e2d\u5206\u5c42\u6267\u884c\uff0c\u5e76\u5229\u7528\u73af\u5883\u53cd\u9988\u3002\u4ec5\u5728\u5408\u6210\u6307\u4ee4\u4e0a\u8bc4\u6d4b\uff0c\u6ca1\u6709\u7528\u6237\u7814\u7a76\u3002",
        ja: "\u521d\u671f\u306e\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u3067\u3001\u97f3\u58f0\u3084\u30c6\u30ad\u30b9\u30c8\u306e\u547d\u4ee4\u3092\u884c\u52d5\u3068\u5bfe\u8c61\u306e\u62bd\u51fa\u306b\u5206\u3051\u3001\u74b0\u5883\u304b\u3089\u306e\u30d5\u30a3\u30fc\u30c9\u30d0\u30c3\u30af\u3092\u4f7f\u3044\u306a\u304c\u3089\u30a8\u30f3\u30b8\u30f3\u7d4c\u7531\u3067 VR \u30b7\u30fc\u30f3\u5185\u3067\u968e\u5c64\u7684\u306b\u5b9f\u884c\u3057\u307e\u3059\u3002\u5408\u6210\u3057\u305f\u6307\u793a\u3067\u306e\u307f\u8a55\u4fa1\u3055\u308c\u3001\u30e6\u30fc\u30b6\u30fc\u5b9f\u9a13\u306f\u3042\u308a\u307e\u305b\u3093\u3002" } },
    { k: "qi", n: "Qi et al. (LLM VR testing)", c: "A", y: 2025, pl: ["other"], P: 1, I: 0, O: 0, E: 2, v: "Automated Software Engineering 33 (2026)", u: AX + "2501.05625",
      s: { en: "A case study of GPT-4o analysing the field of view of VR apps for exploration testing: with better prompting, entity identification rose from 41.67% to 71.30%. Perception only, no actions.",
        zh: "\u7528 GPT-4o \u5206\u6790 VR \u5e94\u7528\u89c6\u91ce\u4ee5\u652f\u6301\u63a2\u7d22\u5f0f\u6d4b\u8bd5\u7684\u6848\u4f8b\u7814\u7a76\uff1a\u6539\u8fdb\u63d0\u793a\u540e\uff0c\u5b9e\u4f53\u8bc6\u522b\u7387\u4ece 41.67% \u63d0\u5347\u5230 71.30%\u3002\u53ea\u6709\u611f\u77e5\uff0c\u6ca1\u6709\u52a8\u4f5c\u3002",
        ja: "\u63a2\u7d22\u30c6\u30b9\u30c8\u306e\u305f\u3081\u306b GPT-4o \u3067 VR \u30a2\u30d7\u30ea\u306e\u8996\u91ce\u3092\u5206\u6790\u3057\u305f\u4e8b\u4f8b\u7814\u7a76\uff1a\u30d7\u30ed\u30f3\u30d7\u30c8\u306e\u5de5\u592b\u3067\u5bfe\u8c61\u306e\u8b58\u5225\u7387\u304c 41.67% \u304b\u3089 71.30% \u306b\u5411\u4e0a\u3057\u307e\u3057\u305f\u3002\u77e5\u899a\u306e\u307f\u3067\u3001\u884c\u52d5\u306f\u3057\u307e\u305b\u3093\u3002" } },
    { k: "contextxr", n: "ContextXR / MineXR++", c: "A", y: 2026, pl: ["other"], P: 1, I: 0, O: 0, E: 2, v: "UIST 2026 (per OpenAlex)", u: AX + "2609.30466",
      s: { en: "Models XR apps as graphs of functional facets and benchmarks next-facet suggestion, including LLMs; MineXR++ has 42 apps, 273 facets and 1,007 capabilities. A formal model of XR UI structure and navigation cost; it predicts, it does not act.",
        zh: "\u628a XR \u5e94\u7528\u5efa\u6a21\u4e3a\u529f\u80fd\u9762\uff08facet\uff09\u7ec4\u6210\u7684\u56fe\uff0c\u5e76\u5bf9\u201c\u4e0b\u4e00\u4e2a\u529f\u80fd\u9762\u201d\u63a8\u8350\uff08\u542b LLM\uff09\u8fdb\u884c\u57fa\u51c6\u8bc4\u6d4b\uff1bMineXR++ \u542b 42 \u4e2a\u5e94\u7528\u3001273 \u4e2a\u529f\u80fd\u9762\u30011,007 \u9879\u80fd\u529b\u3002\u662f XR \u754c\u9762\u7ed3\u6784\u4e0e\u5bfc\u822a\u6210\u672c\u7684\u5f62\u5f0f\u5316\u6a21\u578b\uff1b\u53ea\u9884\u6d4b\uff0c\u4e0d\u884c\u52a8\u3002",
        ja: "XR \u30a2\u30d7\u30ea\u3092\u6a5f\u80fd\u30d5\u30a1\u30bb\u30c3\u30c8\u306e\u30b0\u30e9\u30d5\u3068\u3057\u3066\u30e2\u30c7\u30eb\u5316\u3057\u3001LLM \u3092\u542b\u3080\u300c\u6b21\u306e\u30d5\u30a1\u30bb\u30c3\u30c8\u300d\u63a8\u85a6\u3092\u30d9\u30f3\u30c1\u30de\u30fc\u30af\u3057\u307e\u3059\u3002MineXR++ \u306f 42 \u30a2\u30d7\u30ea\u3001273 \u30d5\u30a1\u30bb\u30c3\u30c8\u30011,007 \u6a5f\u80fd\u3002XR UI \u306e\u69cb\u9020\u3068\u30ca\u30d3\u30b2\u30fc\u30b7\u30e7\u30f3\u30b3\u30b9\u30c8\u306e\u5f62\u5f0f\u7684\u30e2\u30c7\u30eb\u3067\u3001\u4e88\u6e2c\u306e\u307f\u3067\u884c\u52d5\u306f\u3057\u307e\u305b\u3093\u3002" } },
    { k: "llmr", n: "LLMR", c: "B", y: 2023, pl: ["unity"], P: 1, I: 2, O: 1, E: 2, v: "CHI 2024 (Honorable Mention)", u: "https://doi.org/10.1145/3613904.3642579",
      s: { en: "Several GPT-4 roles (scene analyzer, planner, builder writing C#, inspector) create and modify interactive mixed-reality worlds in Unity at run time. Error rate about a quarter of plain GPT-4's; usability study with 11 participants. Builds content; does not operate existing apps.",
        zh: "\u591a\u4e2a GPT-4 \u89d2\u8272\uff08\u573a\u666f\u5206\u6790\u5668\u3001\u89c4\u5212\u5668\u3001\u7f16\u5199 C# \u7684\u6784\u5efa\u5668\u3001\u68c0\u67e5\u5668\uff09\u5728\u8fd0\u884c\u65f6\u4e8e Unity \u4e2d\u521b\u5efa\u548c\u4fee\u6539\u53ef\u4ea4\u4e92\u7684\u6df7\u5408\u73b0\u5b9e\u4e16\u754c\u3002\u9519\u8bef\u7387\u7ea6\u4e3a\u666e\u901a GPT-4 \u7684\u56db\u5206\u4e4b\u4e00\uff1b11 \u540d\u53c2\u4e0e\u8005\u7684\u53ef\u7528\u6027\u7814\u7a76\u3002\u5b83\u6784\u5efa\u5185\u5bb9\uff0c\u4e0d\u64cd\u4f5c\u5df2\u6709\u5e94\u7528\u3002",
        ja: "\u8907\u6570\u306e GPT-4 \u306e\u5f79\u5272\uff08\u30b7\u30fc\u30f3\u89e3\u6790\u3001\u8a08\u753b\u3001C# \u3092\u66f8\u304f\u30d3\u30eb\u30c0\u30fc\u3001\u691c\u67fb\uff09\u304c\u3001\u5b9f\u884c\u6642\u306b Unity \u3067\u30a4\u30f3\u30bf\u30e9\u30af\u30c6\u30a3\u30d6\u306a MR \u4e16\u754c\u3092\u751f\u6210\u30fb\u5909\u66f4\u3057\u307e\u3059\u3002\u8aa4\u308a\u7387\u306f\u7d20\u306e GPT-4 \u306e\u7d04 4 \u5206\u306e 1\u3001\u53c2\u52a0\u8005 11 \u540d\u306e\u30e6\u30fc\u30b6\u30d3\u30ea\u30c6\u30a3\u8abf\u67fb\u3002\u30b3\u30f3\u30c6\u30f3\u30c4\u3092\u4f5c\u308b\u3082\u306e\u3067\u3001\u65e2\u5b58\u30a2\u30d7\u30ea\u306f\u64cd\u4f5c\u3057\u307e\u305b\u3093\u3002" } },
    { k: "llmer", n: "LLMER", c: "B", y: 2025, pl: ["other"], P: 1, I: 2, O: 1, E: 2, v: "IEEE TVCG 31(5), 2025", u: AX + "2502.02441",
      s: { en: "Generates XR scene changes as JSON instead of code: over 80% fewer tokens and about 60% less task time than earlier code-generating systems. A compact action format for XR edits.",
        zh: "\u4ee5 JSON \u800c\u4e0d\u662f\u4ee3\u7801\u751f\u6210 XR \u573a\u666f\u4fee\u6539\uff1a\u4e0e\u5148\u524d\u751f\u6210\u4ee3\u7801\u7684\u7cfb\u7edf\u76f8\u6bd4\uff0ctoken \u51cf\u5c11 80% \u4ee5\u4e0a\uff0c\u4efb\u52a1\u65f6\u95f4\u51cf\u5c11\u7ea6 60%\u3002\u662f\u4e00\u79cd\u7d27\u51d1\u7684 XR \u7f16\u8f91\u52a8\u4f5c\u683c\u5f0f\u3002",
        ja: "XR \u30b7\u30fc\u30f3\u306e\u5909\u66f4\u3092\u30b3\u30fc\u30c9\u3067\u306f\u306a\u304f JSON \u3067\u751f\u6210\u3057\u307e\u3059\u3002\u5f93\u6765\u306e\u30b3\u30fc\u30c9\u751f\u6210\u578b\u30b7\u30b9\u30c6\u30e0\u3088\u308a \u30c8\u30fc\u30af\u30f3\u304c 80% \u4ee5\u4e0a\u5c11\u306a\u304f\u3001\u4f5c\u696d\u6642\u9593\u306f\u7d04 60% \u77ed\u7e2e\u3002XR \u7de8\u96c6\u306e\u305f\u3081\u306e\u30b3\u30f3\u30d1\u30af\u30c8\u306a\u884c\u52d5\u5f62\u5f0f\u3067\u3059\u3002" } },
    { k: "vrcopilot", n: "VRCopilot", c: "B", y: 2024, pl: ["other"], P: 1, I: 2, O: 1, E: 2, v: "UIST 2024", u: AX + "2408.09382",
      s: { en: "Compares manual, automatic and scaffolded (AI wireframe, user edits) co-creation of 3D layouts in VR with generative models; scaffolding gives users more sense of agency. Evidence on how much autonomy people want from an XR AI.",
        zh: "\u6bd4\u8f83 VR \u4e2d\u501f\u52a9\u751f\u6210\u6a21\u578b\u8fdb\u884c 3D \u5e03\u5c40\u521b\u4f5c\u7684\u4e09\u79cd\u65b9\u5f0f\uff1a\u624b\u52a8\u3001\u81ea\u52a8\u3001\u811a\u624b\u67b6\u5f0f\uff08AI \u7ed9\u51fa\u7ebf\u6846\uff0c\u7528\u6237\u7f16\u8f91\uff09\uff1b\u811a\u624b\u67b6\u5f0f\u8ba9\u7528\u6237\u66f4\u6709\u4e3b\u5bfc\u611f\u3002\u8bf4\u660e\u4eba\u4eec\u5e0c\u671b XR AI \u62e5\u6709\u591a\u5927\u81ea\u4e3b\u6027\u3002",
        ja: "\u751f\u6210\u30e2\u30c7\u30eb\u3092\u4f7f\u3063\u305f VR \u3067\u306e 3D \u30ec\u30a4\u30a2\u30a6\u30c8\u4f5c\u6210\u3092\u3001\u624b\u52d5\u30fb\u81ea\u52d5\u30fb\u8db3\u5834\u578b\uff08AI \u304c\u30ef\u30a4\u30e4\u30fc\u30d5\u30ec\u30fc\u30e0\u3092\u51fa\u3057\u3001\u30e6\u30fc\u30b6\u30fc\u304c\u7de8\u96c6\uff09\u3067\u6bd4\u8f03\u3057\u3001\u8db3\u5834\u578b\u3067\u4e3b\u4f53\u611f\u304c\u9ad8\u307e\u308b\u3053\u3068\u3092\u793a\u3057\u307e\u3057\u305f\u3002XR \u306e AI \u306b\u3069\u3053\u307e\u3067\u81ea\u5f8b\u3092\u671b\u3080\u304b\u306e\u624b\u304c\u304b\u308a\u3067\u3059\u3002" } },
    { k: "controlanything", n: "ControlAnything", c: "B", y: 2026, pl: ["quest"], P: 0, I: 2, O: 1, E: 2, v: "arXiv preprint 2026", u: AX + "2611.08321",
      s: { en: "A coding agent generates AR controls and device connectors at use time on Quest 3: 9 of 10 requests ready, median 32.5 s. It generates UI rather than operating existing UI.",
        zh: "\u7f16\u7801\u667a\u80fd\u4f53\u5728 Quest 3 \u4e0a\u6309\u9700\u751f\u6210 AR \u63a7\u4ef6\u548c\u8bbe\u5907\u8fde\u63a5\u5668\uff1a10 \u4e2a\u8bf7\u6c42\u4e2d 9 \u4e2a\u53ef\u7528\uff0c\u4e2d\u4f4d\u6570 32.5 s\u3002\u5b83\u751f\u6210\u754c\u9762\uff0c\u800c\u4e0d\u662f\u64cd\u4f5c\u5df2\u6709\u754c\u9762\u3002",
        ja: "\u30b3\u30fc\u30c7\u30a3\u30f3\u30b0\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u304c Quest 3 \u4e0a\u3067\u3001\u4f7f\u3046\u5834\u9762\u3067 AR \u306e\u30b3\u30f3\u30c8\u30ed\u30fc\u30eb\u3068\u6a5f\u5668\u3068\u306e\u63a5\u7d9a\u90e8\u3092\u751f\u6210\u3057\u307e\u3059\u300210 \u4ef6\u4e2d 9 \u4ef6\u304c\u5229\u7528\u53ef\u80fd\u3001\u4e2d\u592e\u5024 32.5 s\u3002\u65e2\u5b58\u306e UI \u3092\u64cd\u4f5c\u3059\u308b\u306e\u3067\u306f\u306a\u304f UI \u3092\u751f\u6210\u3057\u307e\u3059\u3002" } },
    { k: "gazepointar", n: "GazePointAR", c: "C", y: 2024, pl: ["other"], P: 0, I: 2, O: 0, E: 1, v: "CHI 2024", u: AX + "2404.08213",
      s: { en: "A wearable AR voice assistant that resolves pronouns such as 'this' from gaze, pointing and conversation history before querying an LLM. Lab study (N=12) and a diary study. Answers questions; does not act.",
        zh: "\u53ef\u7a7f\u6234 AR \u8bed\u97f3\u52a9\u624b\uff0c\u5728\u8c03\u7528 LLM \u4e4b\u524d\u7528\u6ce8\u89c6\u3001\u6307\u5411\u548c\u5bf9\u8bdd\u5386\u53f2\u89e3\u6790\u201c\u8fd9\u4e2a\u201d\u7b49\u4ee3\u8bcd\u3002\u5b9e\u9a8c\u5ba4\u7814\u7a76\uff08N=12\uff09\u52a0\u65e5\u8bb0\u7814\u7a76\u3002\u53ea\u56de\u7b54\u95ee\u9898\uff0c\u4e0d\u884c\u52a8\u3002",
        ja: "\u88c5\u7740\u578b AR \u97f3\u58f0\u30a2\u30b7\u30b9\u30bf\u30f3\u30c8\u3067\u3001LLM \u306b\u554f\u3044\u5408\u308f\u305b\u308b\u524d\u306b\u8996\u7dda\u30fb\u6307\u5dee\u3057\u30fb\u4f1a\u8a71\u5c65\u6b74\u304b\u3089\u300c\u3053\u308c\u300d\u306a\u3069\u306e\u4ee3\u540d\u8a5e\u3092\u89e3\u6c7a\u3057\u307e\u3059\u3002\u5b9f\u9a13\u5ba4\u7814\u7a76\uff08N=12\uff09\u3068\u65e5\u8a18\u7814\u7a76\u3002\u8cea\u554f\u306b\u7b54\u3048\u308b\u3060\u3051\u3067\u3001\u884c\u52d5\u306f\u3057\u307e\u305b\u3093\u3002" } },
    { k: "embardiment", n: "EmBARDiment", c: "C", y: 2024, pl: ["other"], P: 1, I: 2, O: 0, E: 1, v: "IEEE VR 2025", u: AX + "2408.08158",
      s: { en: "An embodied XR chatbot whose context is the content of the window the user is reading, chosen by gaze, plus a memory, so users need not restate what they look at. Reads a multi-window XR UI, but only to answer.",
        zh: "\u5177\u8eab XR \u804a\u5929\u673a\u5668\u4eba\uff0c\u4ee5\u7528\u6237\u6ce8\u89c6\u9009\u4e2d\u7684\u6b63\u5728\u9605\u8bfb\u7684\u7a97\u53e3\u5185\u5bb9\u548c\u8bb0\u5fc6\u4f5c\u4e3a\u4e0a\u4e0b\u6587\uff0c\u7528\u6237\u65e0\u9700\u91cd\u590d\u8bf4\u660e\u81ea\u5df1\u5728\u770b\u4ec0\u4e48\u3002\u5b83\u8bfb\u53d6\u591a\u7a97\u53e3 XR \u754c\u9762\uff0c\u4f46\u53ea\u7528\u4e8e\u56de\u7b54\u3002",
        ja: "\u8eab\u4f53\u3092\u6301\u3064 XR \u30c1\u30e3\u30c3\u30c8\u30dc\u30c3\u30c8\u3067\u3001\u8996\u7dda\u3067\u9078\u3070\u308c\u305f\u8aad\u3093\u3067\u3044\u308b\u30a6\u30a3\u30f3\u30c9\u30a6\u306e\u5185\u5bb9\u3068\u8a18\u61b6\u3092\u6587\u8108\u3068\u3057\u3001\u898b\u3066\u3044\u308b\u3082\u306e\u3092\u8a00\u3044\u76f4\u3059\u5fc5\u8981\u3092\u306a\u304f\u3057\u307e\u3059\u3002\u8907\u6570\u30a6\u30a3\u30f3\u30c9\u30a6\u306e XR UI \u3092\u8aad\u307f\u307e\u3059\u304c\u3001\u56de\u7b54\u306e\u305f\u3081\u3060\u3051\u3067\u3059\u3002" } },
    { k: "satori", n: "Satori", c: "C", y: 2024, pl: ["holo"], P: 0, I: 1, O: 1, E: 2, v: "CHI 2025", u: AX + "2410.16668",
      s: { en: "A proactive AR assistant on HoloLens 2 with a Belief-Desire-Intention user model and GPT-4V; it guides physical tasks step by step. N=16: non-inferior to a designer-built Wizard-of-Oz system on all 11 usability items; 2-3 s latency.",
        zh: "HoloLens 2 \u4e0a\u7684\u4e3b\u52a8\u5f0f AR \u52a9\u624b\uff0c\u4f7f\u7528\u4fe1\u5ff5-\u613f\u671b-\u610f\u56fe\uff08BDI\uff09\u7528\u6237\u6a21\u578b\u548c GPT-4V\uff0c\u9010\u6b65\u5f15\u5bfc\u7269\u7406\u4efb\u52a1\u3002N=16\uff1a\u5728\u5168\u90e8 11 \u9879\u53ef\u7528\u6027\u6307\u6807\u4e0a\u4e0d\u52a3\u4e8e\u7531\u8bbe\u8ba1\u5e08\u642d\u5efa\u7684\u7eff\u91ce\u4ed9\u8e2a\u7cfb\u7edf\uff1b\u5ef6\u8fdf 2-3 s\u3002",
        ja: "HoloLens 2 \u4e0a\u306e\u5148\u56de\u308a\u578b AR \u30a2\u30b7\u30b9\u30bf\u30f3\u30c8\u3067\u3001\u4fe1\u5ff5\u30fb\u9858\u671b\u30fb\u610f\u56f3\uff08BDI\uff09\u306e\u30e6\u30fc\u30b6\u30fc\u30e2\u30c7\u30eb\u3068 GPT-4V \u3092\u4f7f\u3044\u3001\u7269\u7406\u7684\u306a\u4f5c\u696d\u3092\u6bb5\u968e\u7684\u306b\u6848\u5185\u3057\u307e\u3059\u3002N=16 \u3067\u3001\u30c7\u30b6\u30a4\u30ca\u30fc\u304c\u4f5c\u3063\u305f Wizard-of-Oz \u30b7\u30b9\u30c6\u30e0\u306b 11 \u9805\u76ee\u3059\u3079\u3066\u3067\u52a3\u3089\u305a\u3001\u9045\u5ef6\u306f 2-3 s\u3002" } },
    { k: "sensible", n: "Sensible Agent", c: "C", y: 2025, pl: ["axr", "webxr"], P: 0, I: 1, O: 1, E: 1, v: "UIST 2025", u: AX + "2509.09255",
      s: { en: "A proactive AR agent in WebXR on an Android XR headset that chooses what to suggest, how to ask (multiple choice, yes/no, icons) and through which channel (gaze, head, hand, voice). Preliminary study (N=10): NASA-TLX 20.55 vs 43.27.",
        zh: "\u8fd0\u884c\u5728 Android XR \u5934\u663e\u4e0a\u7684 WebXR \u4e3b\u52a8\u5f0f AR \u667a\u80fd\u4f53\uff0c\u51b3\u5b9a\u5efa\u8bae\u4ec0\u4e48\u3001\u5982\u4f55\u8be2\u95ee\uff08\u591a\u9009\u3001\u662f/\u5426\u3001\u56fe\u6807\uff09\u4ee5\u53ca\u901a\u8fc7\u54ea\u79cd\u901a\u9053\uff08\u6ce8\u89c6\u3001\u5934\u90e8\u3001\u624b\u3001\u8bed\u97f3\uff09\u3002\u521d\u6b65\u7814\u7a76\uff08N=10\uff09\uff1aNASA-TLX \u4e3a 20.55 \u5bf9 43.27\u3002",
        ja: "Android XR \u30d8\u30c3\u30c9\u30bb\u30c3\u30c8\u4e0a\u306e WebXR \u3067\u52d5\u304f\u5148\u56de\u308a\u578b AR \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u3067\u3001\u4f55\u3092\u63d0\u6848\u3059\u308b\u304b\u3001\u3069\u3046\u5c0b\u306d\u308b\u304b\uff08\u591a\u80a2\u9078\u629e\u3001\u306f\u3044/\u3044\u3044\u3048\u3001\u30a2\u30a4\u30b3\u30f3\uff09\u3001\u3069\u306e\u30c1\u30e3\u30cd\u30eb\uff08\u8996\u7dda\u3001\u982d\u3001\u624b\u3001\u97f3\u58f0\uff09\u3092\u4f7f\u3046\u304b\u3092\u9078\u3073\u307e\u3059\u3002\u4e88\u5099\u7814\u7a76\uff08N=10\uff09\u3067 NASA-TLX \u306f 20.55 \u5bfe 43.27\u3002" } },
    { k: "guided", n: "Guided Reality", c: "C", y: 2025, pl: ["other"], P: 0, I: 2, O: 1, E: 2, v: "UIST 2025", u: AX + "2508.03547",
      s: { en: "An LLM plus vision models generate AR task guidance in five visual categories, localizing interaction points in the user's view and anchoring guidance in space; evaluated with 16 users and 4 instructors. Guide mode for physical tasks.",
        zh: "LLM \u4e0e\u89c6\u89c9\u6a21\u578b\u751f\u6210\u4e94\u7c7b\u53ef\u89c6\u5316\u7684 AR \u4efb\u52a1\u5f15\u5bfc\uff0c\u5728\u7528\u6237\u89c6\u91ce\u4e2d\u5b9a\u4f4d\u4ea4\u4e92\u70b9\u5e76\u628a\u5f15\u5bfc\u951a\u5b9a\u5728\u7a7a\u95f4\u4e2d\uff1b\u7531 16 \u540d\u7528\u6237\u548c 4 \u540d\u6307\u5bfc\u8005\u8bc4\u6d4b\u3002\u662f\u9762\u5411\u7269\u7406\u4efb\u52a1\u7684\u5f15\u5bfc\u6a21\u5f0f\u3002",
        ja: "LLM \u3068\u8996\u899a\u30e2\u30c7\u30eb\u304c 5 \u7a2e\u985e\u306e\u8996\u899a\u7684\u306a AR \u4f5c\u696d\u30ac\u30a4\u30c9\u3092\u751f\u6210\u3057\u3001\u30e6\u30fc\u30b6\u30fc\u306e\u8996\u754c\u3067\u64cd\u4f5c\u70b9\u3092\u7279\u5b9a\u3057\u3066\u7a7a\u9593\u306b\u56fa\u5b9a\u3057\u307e\u3059\u3002\u30e6\u30fc\u30b6\u30fc 16 \u540d\u3068\u6307\u5c0e\u8005 4 \u540d\u3067\u8a55\u4fa1\u3002\u7269\u7406\u4f5c\u696d\u306e\u305f\u3081\u306e\u30ac\u30a4\u30c9\u30e2\u30fc\u30c9\u3067\u3059\u3002" } },
    { k: "agenthands", n: "AgentHands", c: "C", y: 2026, pl: ["other"], P: 0, I: 2, O: 1, E: 2, v: "CHI 2026", u: "https://research.google/pubs/agenthands-generating-interactive-hands-gestures-for-spatially-grounded-agent-conversations-in-xr/",
      s: { en: "An LLM emits word-synchronized gesture events rendered as an agent's hands that point and demonstrate in XR; comparative study with 12 participants against speech only. A visual vocabulary for showing the user what to do.",
        zh: "LLM \u8f93\u51fa\u4e0e\u8bcd\u8bed\u540c\u6b65\u7684\u624b\u52bf\u4e8b\u4ef6\uff0c\u6e32\u67d3\u6210\u5728 XR \u4e2d\u6307\u70b9\u548c\u6f14\u793a\u7684\u667a\u80fd\u4f53\u4e4b\u624b\uff1b\u4e0e\u7eaf\u8bed\u97f3\u8fdb\u884c\u6bd4\u8f83\u7684\u7814\u7a76\u6709 12 \u540d\u53c2\u4e0e\u8005\u3002\u4e3a\u201c\u5411\u7528\u6237\u5c55\u793a\u8be5\u600e\u4e48\u505a\u201d\u63d0\u4f9b\u89c6\u89c9\u8bed\u6c47\u3002",
        ja: "LLM \u304c\u5358\u8a9e\u306b\u540c\u671f\u3057\u305f\u30b8\u30a7\u30b9\u30c1\u30e3\u30fc\u30a4\u30d9\u30f3\u30c8\u3092\u51fa\u529b\u3057\u3001XR \u3067\u6307\u3057\u793a\u3057\u305f\u308a\u5b9f\u6f14\u3057\u305f\u308a\u3059\u308b\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u306e\u624b\u3068\u3057\u3066\u63cf\u753b\u3057\u307e\u3059\u3002\u97f3\u58f0\u306e\u307f\u3068\u306e\u6bd4\u8f03\u7814\u7a76\uff08\u53c2\u52a0\u8005 12 \u540d\uff09\u3002\u30e6\u30fc\u30b6\u30fc\u306b\u624b\u9806\u3092\u898b\u305b\u308b\u305f\u3081\u306e\u8996\u899a\u7684\u306a\u8a9e\u5f59\u3067\u3059\u3002" } },
    { k: "vrguide", n: "VRGuide", c: "D", y: 2023, pl: ["unity"], P: 1, I: 0, O: 2, E: 2, v: "ASE 2023", u: "https://par.nsf.gov/servlets/purl/10488928",
      s: { en: "Plans camera routes with computational geometry (dynamic cut coverage) so that every interactable object of a Unity VR scene is visited and clicked: about 31% less time than VRTest, 4 new bugs. Coverage, not user intent.",
        zh: "\u7528\u8ba1\u7b97\u51e0\u4f55\uff08\u52a8\u6001\u5272\u8986\u76d6\uff09\u89c4\u5212\u76f8\u673a\u8def\u5f84\uff0c\u4f7f Unity VR \u573a\u666f\u4e2d\u7684\u6bcf\u4e2a\u53ef\u4ea4\u4e92\u7269\u4f53\u90fd\u88ab\u8bbf\u95ee\u548c\u70b9\u51fb\uff1a\u65f6\u95f4\u6bd4 VRTest \u5c11\u7ea6 31%\uff0c\u53d1\u73b0 4 \u4e2a\u65b0\u7f3a\u9677\u3002\u76ee\u6807\u662f\u8986\u76d6\u7387\uff0c\u800c\u975e\u7528\u6237\u610f\u56fe\u3002",
        ja: "\u8a08\u7b97\u5e7e\u4f55\uff08\u52d5\u7684\u30ab\u30c3\u30c8\u88ab\u8986\uff09\u3067\u30ab\u30e1\u30e9\u306e\u7d4c\u8def\u3092\u8a08\u753b\u3057\u3001Unity \u306e VR \u30b7\u30fc\u30f3\u306e\u3059\u3079\u3066\u306e\u64cd\u4f5c\u5bfe\u8c61\u3092\u8a2a\u308c\u3066\u30af\u30ea\u30c3\u30af\u3057\u307e\u3059\u3002VRTest \u3088\u308a\u7d04 31% \u77ed\u6642\u9593\u3067\u3001\u65b0\u3057\u3044\u30d0\u30b0\u3092 4 \u4ef6\u767a\u898b\u3002\u76ee\u7684\u306f\u7db2\u7f85\u3067\u3001\u30e6\u30fc\u30b6\u30fc\u306e\u610f\u56f3\u3067\u306f\u3042\u308a\u307e\u305b\u3093\u3002" } },
    { k: "vrexplorer", n: "VRExplorer", c: "D", y: 2025, pl: ["unity"], P: 1, I: 0, O: 2, E: 2, v: "ASE 2025", u: AX + "2607.10174",
      s: { en: "An Entity-Action-Task model of Unity scenes, NavMesh path finding and a probabilistic state machine grab and trigger VR objects automatically. On 11 projects: +122.8% executable-line coverage over VRGuide; 3 bugs. Needs scene access and 30-90 min of manual analysis per project.",
        zh: "\u57fa\u4e8e Unity \u573a\u666f\u7684\u5b9e\u4f53-\u52a8\u4f5c-\u4efb\u52a1\u6a21\u578b\u3001NavMesh \u5bfb\u8def\u548c\u6982\u7387\u72b6\u6001\u673a\uff0c\u81ea\u52a8\u6293\u53d6\u548c\u89e6\u53d1 VR \u7269\u4f53\u3002\u5728 11 \u4e2a\u9879\u76ee\u4e0a\u53ef\u6267\u884c\u884c\u8986\u76d6\u7387\u6bd4 VRGuide \u9ad8 122.8%\uff1b\u53d1\u73b0 3 \u4e2a\u7f3a\u9677\u3002\u9700\u8981\u573a\u666f\u8bbf\u95ee\u6743\u9650\uff0c\u6bcf\u4e2a\u9879\u76ee\u8fd8\u9700 30-90 \u5206\u949f\u4eba\u5de5\u5206\u6790\u3002",
        ja: "Unity \u30b7\u30fc\u30f3\u306e\u30a8\u30f3\u30c6\u30a3\u30c6\u30a3\u30fb\u30a2\u30af\u30b7\u30e7\u30f3\u30fb\u30bf\u30b9\u30af\u30e2\u30c7\u30eb\u3001NavMesh \u7d4c\u8def\u63a2\u7d22\u3001\u78ba\u7387\u7684\u72b6\u614b\u6a5f\u68b0\u306b\u3088\u3063\u3066\u3001VR \u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u3092\u81ea\u52d5\u3067\u3064\u304b\u307f\u3001\u4f5c\u52d5\u3055\u305b\u307e\u3059\u300211 \u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u3067\u5b9f\u884c\u884c\u30ab\u30d0\u30ec\u30c3\u30b8\u304c VRGuide \u3088\u308a 122.8% \u5411\u4e0a\u3001\u30d0\u30b0 3 \u4ef6\u3002\u30b7\u30fc\u30f3\u3078\u306e\u30a2\u30af\u30bb\u30b9\u3068\u3001\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u3054\u3068\u306b 30-90 \u5206\u306e\u624b\u4f5c\u696d\u306e\u5206\u6790\u304c\u5fc5\u8981\u3067\u3059\u3002" } },
    { k: "xrinttest", n: "XRintTest / XRBench3D", c: "D", y: 2026, pl: ["unity"], P: 1, I: 0, O: 2, E: 2, v: "arXiv preprint 2026", u: AX + "2601.23139",
      s: { en: "An Interaction Flow Graph parsed from XR Interaction Toolkit components drives fire, manipulate and socket interactions through simulated controller events. XRBench3D: 10 scenes, 456 interactions, 93% covered vs 8% for random input.",
        zh: "\u4ece XR Interaction Toolkit \u7ec4\u4ef6\u89e3\u6790\u51fa\u7684\u4ea4\u4e92\u6d41\u56fe\uff0c\u901a\u8fc7\u6a21\u62df\u624b\u67c4\u4e8b\u4ef6\u9a71\u52a8\u201c\u89e6\u53d1\u3001\u64cd\u7eb5\u3001\u63d2\u69fd\u201d\u4e09\u7c7b\u4ea4\u4e92\u3002XRBench3D\uff1a10 \u4e2a\u573a\u666f\u3001456 \u4e2a\u4ea4\u4e92\uff0c\u8986\u76d6 93%\uff0c\u968f\u673a\u8f93\u5165\u4e3a 8%\u3002",
        ja: "XR Interaction Toolkit \u306e\u30b3\u30f3\u30dd\u30fc\u30cd\u30f3\u30c8\u304b\u3089\u89e3\u6790\u3057\u305f\u30a4\u30f3\u30bf\u30e9\u30af\u30b7\u30e7\u30f3\u30d5\u30ed\u30fc\u30b0\u30e9\u30d5\u304c\u3001\u6a21\u64ec\u30b3\u30f3\u30c8\u30ed\u30fc\u30e9\u30a4\u30d9\u30f3\u30c8\u3067\u767a\u5c04\u30fb\u64cd\u4f5c\u30fb\u30bd\u30b1\u30c3\u30c8\u306e\u5404\u30a4\u30f3\u30bf\u30e9\u30af\u30b7\u30e7\u30f3\u3092\u99c6\u52d5\u3057\u307e\u3059\u3002XRBench3D \u306f 10 \u30b7\u30fc\u30f3\u30fb456 \u30a4\u30f3\u30bf\u30e9\u30af\u30b7\u30e7\u30f3\u3067\u300193% \u3092\u7db2\u7f85\uff08\u30e9\u30f3\u30c0\u30e0\u5165\u529b\u306f 8%\uff09\u3002" } },
    { k: "autovr", n: "AUTOVR", c: "D", y: 2025, pl: ["quest"], P: 1, I: 0, O: 2, E: 2, v: "USENIX Security 2025", u: AX + "2508.12187",
      s: { en: "Binary instrumentation of Unity apps on Quest 2 recovers UI event handlers and triggers them, forces collider contacts and reloads scenes. On 366 Quest Store and SideQuest apps it found 390 sensitive-data exposures vs 117 for Android Monkey, about 222 s per app.",
        zh: "\u5bf9 Quest 2 \u4e0a\u7684 Unity \u5e94\u7528\u505a\u4e8c\u8fdb\u5236\u63d2\u6869\uff0c\u6062\u590d\u5e76\u89e6\u53d1\u754c\u9762\u4e8b\u4ef6\u5904\u7406\u51fd\u6570\u3001\u5f3a\u5236\u78b0\u649e\u4f53\u63a5\u89e6\u3001\u91cd\u8f7d\u573a\u666f\u3002\u5728 366 \u4e2a Quest Store \u4e0e SideQuest \u5e94\u7528\u4e0a\u53d1\u73b0 390 \u5904\u654f\u611f\u6570\u636e\u66b4\u9732\uff0cAndroid Monkey \u4e3a 117 \u5904\uff0c\u6bcf\u4e2a\u5e94\u7528\u7ea6 222 s\u3002",
        ja: "Quest 2 \u4e0a\u306e Unity \u30a2\u30d7\u30ea\u3092\u30d0\u30a4\u30ca\u30ea\u8a08\u88c5\u3057\u3066 UI \u30a4\u30d9\u30f3\u30c8\u30cf\u30f3\u30c9\u30e9\u3092\u5fa9\u5143\u30fb\u8d77\u52d5\u3057\u3001\u30b3\u30e9\u30a4\u30c0\u30fc\u306e\u63a5\u89e6\u3092\u5f37\u5236\u3057\u3001\u30b7\u30fc\u30f3\u3092\u518d\u8aad\u307f\u8fbc\u307f\u3057\u307e\u3059\u3002Quest Store \u3068 SideQuest \u306e 366 \u30a2\u30d7\u30ea\u3067\u6a5f\u5bc6\u30c7\u30fc\u30bf\u9732\u51fa\u3092 390 \u4ef6\u767a\u898b\uff08Android Monkey \u306f 117 \u4ef6\uff09\u30011 \u30a2\u30d7\u30ea\u7d04 222 s\u3002" } },
    { k: "exploreai", n: "ExploreAI", c: "D", y: 2026, pl: ["unity"], P: 1, I: 1, O: 1, E: 1, v: "arXiv preprint 2026", u: AX + "2608.21628",
      s: { en: "An LLM agent that explores black-box VR and 3D applications from task text: it selects targets, navigates, captures multiple views and verifies, building per-object knowledge bases for regression testing (Unity, AI2-THOR, BeamNG). Acts on objects, not UI.",
        zh: "\u6839\u636e\u4efb\u52a1\u6587\u672c\u63a2\u7d22\u9ed1\u76d2 VR \u4e0e 3D \u5e94\u7528\u7684 LLM \u667a\u80fd\u4f53\uff1a\u9009\u62e9\u76ee\u6807\u3001\u5bfc\u822a\u3001\u591a\u89c6\u89d2\u91c7\u96c6\u5e76\u9a8c\u8bc1\uff0c\u4e3a\u56de\u5f52\u6d4b\u8bd5\u6784\u5efa\u9010\u7269\u4f53\u7684\u77e5\u8bc6\u5e93\uff08Unity\u3001AI2-THOR\u3001BeamNG\uff09\u3002\u4f5c\u7528\u4e8e\u7269\u4f53\u800c\u975e\u754c\u9762\u3002",
        ja: "\u30bf\u30b9\u30af\u306e\u8a18\u8ff0\u304b\u3089\u30d6\u30e9\u30c3\u30af\u30dc\u30c3\u30af\u30b9\u306e VR\u30fb3D \u30a2\u30d7\u30ea\u3092\u63a2\u7d22\u3059\u308b LLM \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u3067\u3001\u5bfe\u8c61\u3092\u9078\u3073\u3001\u79fb\u52d5\u3057\u3001\u591a\u8996\u70b9\u3067\u64ae\u5f71\u3057\u3066\u691c\u8a3c\u3057\u3001\u56de\u5e30\u30c6\u30b9\u30c8\u306e\u305f\u3081\u306e\u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u3054\u3068\u306e\u77e5\u8b58\u30d9\u30fc\u30b9\u3092\u4f5c\u308a\u307e\u3059\uff08Unity\u3001AI2-THOR\u3001BeamNG\uff09\u3002\u5bfe\u8c61\u306f UI \u3067\u306f\u306a\u304f\u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u3067\u3059\u3002" } },
    { k: "vrsight", n: "VRSight / DISCOVR", c: "D", y: 2025, pl: ["quest"], P: 2, I: 0, O: 0, E: 2, v: "UIST 2025", u: AX + "2508.02958",
      s: { en: "A 3D screen reader for blind VR users: a YOLOv8n detector trained on DISCOVR (17,691 social-VR frames, 30 classes incl. menu, button, HUD), depth estimation and an MLLM describe the scene with spatial audio, without app changes. 46.3 mAP50-95; 9 blind participants. Describes; does not act.",
        zh: "\u9762\u5411\u76f2\u4eba VR \u7528\u6237\u7684 3D \u8bfb\u5c4f\u5668\uff1a\u5728 DISCOVR\uff0817,691 \u5e27\u793e\u4ea4 VR \u753b\u9762\uff0c30 \u7c7b\uff0c\u542b\u83dc\u5355\u3001\u6309\u94ae\u3001HUD\uff09\u4e0a\u8bad\u7ec3\u7684 YOLOv8n \u68c0\u6d4b\u5668\u3001\u6df1\u5ea6\u4f30\u8ba1\u548c MLLM \u7528\u7a7a\u95f4\u97f3\u9891\u63cf\u8ff0\u573a\u666f\uff0c\u65e0\u9700\u4fee\u6539\u5e94\u7528\u3002mAP50-95 \u4e3a 46.3\uff1b9 \u540d\u76f2\u4eba\u53c2\u4e0e\u8005\u3002\u53ea\u63cf\u8ff0\uff0c\u4e0d\u884c\u52a8\u3002",
        ja: "\u8996\u899a\u969c\u5bb3\u306e\u3042\u308b VR \u5229\u7528\u8005\u306e\u305f\u3081\u306e 3D \u30b9\u30af\u30ea\u30fc\u30f3\u30ea\u30fc\u30c0\u30fc\uff1aDISCOVR\uff08\u30bd\u30fc\u30b7\u30e3\u30eb VR \u306e 17,691 \u30d5\u30ec\u30fc\u30e0\u3001\u30e1\u30cb\u30e5\u30fc\u30fb\u30dc\u30bf\u30f3\u30fbHUD \u3092\u542b\u3080 30 \u30af\u30e9\u30b9\uff09\u3067\u5b66\u7fd2\u3057\u305f YOLOv8n\u3001\u6df1\u5ea6\u63a8\u5b9a\u3001MLLM \u304c\u3001\u30a2\u30d7\u30ea\u3092\u6539\u5909\u305b\u305a\u306b\u7a7a\u9593\u97f3\u97ff\u3067\u30b7\u30fc\u30f3\u3092\u8aac\u660e\u3057\u307e\u3059\u3002mAP50-95 \u306f 46.3\u3001\u8996\u899a\u969c\u5bb3\u306e\u3042\u308b\u53c2\u52a0\u8005 9 \u540d\u3002\u8aac\u660e\u306e\u307f\u3067\u884c\u52d5\u306f\u3057\u307e\u305b\u3093\u3002" } },
    { k: "sima", n: "SIMA", c: "E", y: 2024, pl: ["games"], P: 1, I: 2, O: 1, E: 2, v: "arXiv tech report 2024", u: AX + "2404.10179",
      s: { en: "A language-conditioned keyboard-and-mouse agent trained on human play across more than 10 3D games, from pixels. No Man's Sky subset: 34% success vs 60% for humans, 11% without language. Game worlds, not interfaces.",
        zh: "\u4ee5\u8bed\u8a00\u4e3a\u6761\u4ef6\u3001\u4ece\u50cf\u7d20\u8f93\u51fa\u952e\u76d8\u9f20\u6807\u52a8\u4f5c\u7684\u667a\u80fd\u4f53\uff0c\u5728 10 \u4f59\u6b3e 3D \u6e38\u620f\u7684\u4eba\u7c7b\u6e38\u73a9\u6570\u636e\u4e0a\u8bad\u7ec3\u3002No Man's Sky \u5b50\u96c6\uff1a\u6210\u529f\u7387 34%\uff0c\u4eba\u7c7b 60%\uff0c\u53bb\u6389\u8bed\u8a00\u4e3a 11%\u3002\u662f\u6e38\u620f\u4e16\u754c\uff0c\u800c\u975e\u754c\u9762\u3002",
        ja: "\u8a00\u8a9e\u3067\u6761\u4ef6\u3065\u3051\u3089\u308c\u3001\u753b\u7d20\u304b\u3089\u30ad\u30fc\u30dc\u30fc\u30c9\u3068\u30de\u30a6\u30b9\u3092\u64cd\u4f5c\u3059\u308b\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u3067\u300110 \u672c\u4ee5\u4e0a\u306e 3D \u30b2\u30fc\u30e0\u306e\u4eba\u9593\u306e\u30d7\u30ec\u30a4\u3067\u5b66\u7fd2\u3002No Man's Sky \u306e\u30b5\u30d6\u30bb\u30c3\u30c8\u3067\u6210\u529f\u7387 34%\uff08\u4eba\u9593 60%\u3001\u8a00\u8a9e\u306a\u3057 11%\uff09\u3002\u5bfe\u8c61\u306f\u30b2\u30fc\u30e0\u4e16\u754c\u3067\u30a4\u30f3\u30bf\u30fc\u30d5\u30a7\u30fc\u30b9\u3067\u306f\u3042\u308a\u307e\u305b\u3093\u3002" } },
    { k: "sima2", n: "SIMA 2", c: "E", y: 2025, pl: ["games"], P: 1, I: 2, O: 1, E: 2, v: "arXiv preprint 2025", u: AX + "2512.04797",
      s: { en: "Gemini Flash-Lite fine-tuned to reason, talk and act (96 keys, clicks, mouse moves) in 3D games; about double SIMA's average success; self-improves with Gemini as task setter and reward model. Fine-tuning costs general reasoning (AIME -15.4%).",
        zh: "\u5c06 Gemini Flash-Lite \u5fae\u8c03\u4e3a\u80fd\u5728 3D \u6e38\u620f\u4e2d\u63a8\u7406\u3001\u5bf9\u8bdd\u548c\u884c\u52a8\uff0896 \u4e2a\u6309\u952e\u3001\u70b9\u51fb\u3001\u9f20\u6807\u79fb\u52a8\uff09\u7684\u667a\u80fd\u4f53\uff1b\u5e73\u5747\u6210\u529f\u7387\u7ea6\u4e3a SIMA \u7684\u4e24\u500d\uff1b\u4ee5 Gemini \u4f5c\u4e3a\u51fa\u9898\u8005\u4e0e\u5956\u52b1\u6a21\u578b\u81ea\u6211\u63d0\u5347\u3002\u5fae\u8c03\u635f\u5931\u4e86\u901a\u7528\u63a8\u7406\u80fd\u529b\uff08AIME -15.4%\uff09\u3002",
        ja: "Gemini Flash-Lite \u3092\u5fae\u8abf\u6574\u3057\u30013D \u30b2\u30fc\u30e0\u3067\u63a8\u8ad6\u30fb\u4f1a\u8a71\u30fb\u884c\u52d5\uff0896 \u30ad\u30fc\u3001\u30af\u30ea\u30c3\u30af\u3001\u30de\u30a6\u30b9\u79fb\u52d5\uff09\u3067\u304d\u308b\u3088\u3046\u306b\u3057\u305f\u3082\u306e\u3002\u5e73\u5747\u6210\u529f\u7387\u306f SIMA \u306e\u7d04 2 \u500d\u3067\u3001Gemini \u3092\u8ab2\u984c\u8a2d\u5b9a\u3068\u5831\u916c\u30e2\u30c7\u30eb\u306b\u4f7f\u3063\u3066\u81ea\u5df1\u6539\u5584\u3057\u307e\u3059\u3002\u5fae\u8abf\u6574\u3067\u6c4e\u7528\u63a8\u8ad6\u306f\u4f4e\u4e0b\uff08AIME -15.4%\uff09\u3002" } },
    { k: "lumine", n: "Lumine", c: "E", y: 2025, pl: ["games"], P: 1, I: 2, O: 1, E: 2, v: "arXiv preprint 2025", u: AX + "2511.08892",
      s: { en: "Qwen2-VL-7B sees 5 frames per second and emits 30 Hz action chunks, reasoning only when needed: 113.9 ms to the first action without reasoning, 234 ms with it; completes a 5-hour Genshin Impact storyline. A latency recipe a headset agent will need.",
        zh: "Qwen2-VL-7B \u4ee5\u6bcf\u79d2 5 \u5e27\u611f\u77e5\u3001\u4ee5 30 Hz \u8f93\u51fa\u52a8\u4f5c\u5757\uff0c\u4ec5\u5728\u5fc5\u8981\u65f6\u63a8\u7406\uff1a\u65e0\u63a8\u7406\u65f6\u9996\u4e2a\u52a8\u4f5c 113.9 ms\uff0c\u6709\u63a8\u7406\u65f6 234 ms\uff1b\u5b8c\u6210 5 \u5c0f\u65f6\u7684\u539f\u795e\u4e3b\u7ebf\u5267\u60c5\u3002\u662f\u5934\u663e\u667a\u80fd\u4f53\u6240\u9700\u7684\u4f4e\u5ef6\u8fdf\u65b9\u6848\u3002",
        ja: "Qwen2-VL-7B \u304c\u6bce\u79d2 5 \u30d5\u30ec\u30fc\u30e0\u3092\u898b\u3066 30 Hz \u306e\u884c\u52d5\u30c1\u30e3\u30f3\u30af\u3092\u51fa\u529b\u3057\u3001\u5fc5\u8981\u306a\u3068\u304d\u3060\u3051\u63a8\u8ad6\u3057\u307e\u3059\u3002\u6700\u521d\u306e\u884c\u52d5\u307e\u3067\u63a8\u8ad6\u306a\u3057\u3067 113.9 ms\u3001\u3042\u308a\u3067 234 ms\u3002\u539f\u795e\u306e 5 \u6642\u9593\u306e\u30b9\u30c8\u30fc\u30ea\u30fc\u3092\u5b8c\u8d70\u3002\u30d8\u30c3\u30c9\u30bb\u30c3\u30c8\u306e\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u306b\u5fc5\u8981\u306a\u4f4e\u9045\u5ef6\u306e\u30ec\u30b7\u30d4\u3067\u3059\u3002" } },
    { k: "ewa", n: "Embodied Web Agents", c: "E", y: 2025, pl: ["games"], P: 1, I: 2, O: 1, E: 2, v: "NeurIPS 2025 Datasets and Benchmarks", u: AX + "2506.15677",
      s: { en: "About 1.5k tasks that need both a 3D environment and live websites. Best model vs human: cooking 6.4% vs 77.08%, navigation 34.72% vs 90.28%. 66.6% of GPT-4o's cooking failures come from switching between the 3D world and the web, the mix XR interfaces have.",
        zh: "\u7ea6 1.5k \u4e2a\u540c\u65f6\u9700\u8981 3D \u73af\u5883\u4e0e\u771f\u5b9e\u7f51\u7ad9\u7684\u4efb\u52a1\u3002\u6700\u4f73\u6a21\u578b\u5bf9\u4eba\u7c7b\uff1a\u70f9\u996a 6.4% \u5bf9 77.08%\uff0c\u5bfc\u822a 34.72% \u5bf9 90.28%\u3002GPT-4o \u70f9\u996a\u4efb\u52a1\u5931\u8d25\u4e2d\u6709 66.6% \u6e90\u4e8e\u5728 3D \u4e16\u754c\u4e0e\u7f51\u9875\u4e4b\u95f4\u5207\u6362\uff0c\u800c XR \u754c\u9762\u6b63\u662f\u8fd9\u79cd\u6df7\u5408\u3002",
        ja: "3D \u74b0\u5883\u3068\u5b9f\u969b\u306e\u30a6\u30a7\u30d6\u30b5\u30a4\u30c8\u306e\u4e21\u65b9\u3092\u5fc5\u8981\u3068\u3059\u308b\u7d04 1.5k \u30bf\u30b9\u30af\u3002\u6700\u826f\u30e2\u30c7\u30eb\u5bfe\u4eba\u9593\u306f\u6599\u7406 6.4% \u5bfe 77.08%\u3001\u30ca\u30d3\u30b2\u30fc\u30b7\u30e7\u30f3 34.72% \u5bfe 90.28%\u3002GPT-4o \u306e\u6599\u7406\u3067\u306e\u5931\u6557\u306e 66.6% \u306f 3D \u4e16\u754c\u3068\u30a6\u30a7\u30d6\u306e\u5207\u308a\u66ff\u3048\u3067\u8d77\u304d\u3001XR \u306e\u30a4\u30f3\u30bf\u30fc\u30d5\u30a7\u30fc\u30b9\u306f\u307e\u3055\u306b\u3053\u306e\u6df7\u5728\u3067\u3059\u3002" } },
    { k: "gemini", n: "Gemini on Galaxy XR", c: "F", y: 2025, pl: ["axr"], P: 1, I: 2, O: 2, E: 0, v: "product, on sale since Oct 2025", u: "https://blog.google/products/android/samsung-galaxy-xr",
      s: { en: "Google says Gemini Live understands what you see and do, can 'take action on your behalf across your apps', and arranges open windows on 'organize these windows'. Mechanism, coverage and success rates are not published; the only shipped headset assistant that claims cross-app actions. Ratings reflect claims.",
        zh: "Google \u79f0 Gemini Live \u80fd\u7406\u89e3\u4f60\u6240\u89c1\u6240\u505a\uff0c\u80fd\u201ctake action on your behalf across your apps\u201d\uff08\u8de8\u5e94\u7528\u4ee3\u4f60\u6267\u884c\u64cd\u4f5c\uff09\uff0c\u5e76\u5728\u201corganize these windows\u201d\u65f6\u6574\u7406\u6253\u5f00\u7684\u7a97\u53e3\u3002\u673a\u5236\u3001\u8986\u76d6\u8303\u56f4\u548c\u6210\u529f\u7387\u5747\u672a\u516c\u5f00\uff1b\u662f\u552f\u4e00\u58f0\u79f0\u80fd\u8de8\u5e94\u7528\u64cd\u4f5c\u7684\u5df2\u4e0a\u5e02\u5934\u663e\u52a9\u624b\u3002\u8bc4\u5206\u53cd\u6620\u7684\u662f\u5ba3\u79f0\u3002",
        ja: "Google \u306b\u3088\u308c\u3070\u3001Gemini Live \u306f\u898b\u3066\u3044\u308b\u3082\u306e\u3068\u3057\u3066\u3044\u308b\u3053\u3068\u3092\u7406\u89e3\u3057\u3001\u300ctake action on your behalf across your apps\u300d\uff08\u30a2\u30d7\u30ea\u3092\u307e\u305f\u3044\u3067\u4ee3\u308f\u308a\u306b\u64cd\u4f5c\uff09\u3067\u304d\u3001\u300corganize these windows\u300d\u3067\u958b\u3044\u3066\u3044\u308b\u30a6\u30a3\u30f3\u30c9\u30a6\u3092\u6574\u7406\u3057\u307e\u3059\u3002\u4ed5\u7d44\u307f\u30fb\u5bfe\u8c61\u7bc4\u56f2\u30fb\u6210\u529f\u7387\u306f\u975e\u516c\u958b\u3002\u30a2\u30d7\u30ea\u6a2a\u65ad\u306e\u64cd\u4f5c\u3092\u3046\u305f\u3046\u552f\u4e00\u306e\u5e02\u8ca9\u30d8\u30c3\u30c9\u30bb\u30c3\u30c8\u30a2\u30b7\u30b9\u30bf\u30f3\u30c8\u3067\u3059\u3002\u8a55\u4fa1\u306f\u4e3b\u5f35\u306b\u57fa\u3065\u304d\u307e\u3059\u3002" } },
    { k: "siri", n: "Siri AI, visionOS 27", c: "F", y: 2026, pl: ["avp"], P: 1, I: 2, O: 1, E: 0, v: "product, WWDC 2026", u: "https://www.apple.com/newsroom/2026/06/apple-unveils-next-generation-of-apple-intelligence-siri-ai-and-more/",
      s: { en: "Look at Siri and speak; ask about objects in your room or content on your screen; get things done through app actions. Actions go through developer-provided App Intents; Apple notes Siri 'can't act on the tracks shown' unless the app adopts its APIs. API-first, the opposite pole of a GUI agent.",
        zh: "\u770b\u5411 Siri \u5373\u53ef\u8bf4\u8bdd\uff1b\u8be2\u95ee\u623f\u95f4\u91cc\u7684\u7269\u4f53\u6216\u5c4f\u5e55\u4e0a\u7684\u5185\u5bb9\uff1b\u901a\u8fc7\u5e94\u7528\u52a8\u4f5c\u5b8c\u6210\u4efb\u52a1\u3002\u52a8\u4f5c\u7ecf\u7531\u5f00\u53d1\u8005\u63d0\u4f9b\u7684 App Intents\uff1bApple \u6307\u51fa\uff0c\u9664\u975e\u5e94\u7528\u91c7\u7528\u5176 API\uff0cSiri\u201ccan't act on the tracks shown\u201d\uff08\u65e0\u6cd5\u64cd\u4f5c\u5c4f\u5e55\u4e0a\u663e\u793a\u7684\u66f2\u76ee\uff09\u3002API \u4f18\u5148\uff0c\u662f GUI \u667a\u80fd\u4f53\u7684\u53e6\u4e00\u6781\u3002",
        ja: "Siri \u3092\u898b\u3066\u8a71\u3057\u304b\u3051\u3001\u90e8\u5c4b\u306e\u7269\u4f53\u3084\u753b\u9762\u306e\u5185\u5bb9\u306b\u3064\u3044\u3066\u5c0b\u306d\u3001\u30a2\u30d7\u30ea\u30a2\u30af\u30b7\u30e7\u30f3\u3067\u7528\u4e8b\u3092\u6e08\u307e\u305b\u307e\u3059\u3002\u30a2\u30af\u30b7\u30e7\u30f3\u306f\u958b\u767a\u8005\u304c\u7528\u610f\u3057\u305f App Intents \u3092\u901a\u308a\u3001Apple \u306f\u30a2\u30d7\u30ea\u304c API \u3092\u63a1\u7528\u3057\u306a\u3044\u9650\u308a Siri \u306f\u300ccan't act on the tracks shown\u300d\uff08\u8868\u793a\u3055\u308c\u305f\u66f2\u3092\u64cd\u4f5c\u3067\u304d\u306a\u3044\uff09\u3068\u8ff0\u3079\u3066\u3044\u307e\u3059\u3002API \u512a\u5148\u3067\u3001GUI \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u306e\u5bfe\u6975\u3067\u3059\u3002" } },
    { k: "rbd", n: "Meta Ray-Ban Display", c: "F", y: 2025, pl: ["glasses"], P: 0, I: 2, O: 1, E: 0, v: "product, on sale Sep 2025 (US, $799)", u: "https://about.fb.com/news/2025/09/meta-ray-ban-display-ai-glasses-emg-wristband/",
      s: { en: "Glasses with an in-lens display and the EMG Neural Band for wrist gestures; Meta AI gives visual answers and step-by-step guides. The user operates the display UI; the agent answers and guides.",
        zh: "\u955c\u7247\u5185\u663e\u793a\u7684\u773c\u955c\uff0c\u914d\u5408\u7528\u4e8e\u624b\u8155\u624b\u52bf\u7684 EMG Neural Band\uff1bMeta AI \u63d0\u4f9b\u53ef\u89c6\u5316\u56de\u7b54\u548c\u5206\u6b65\u6307\u5357\u3002\u754c\u9762\u7531\u7528\u6237\u81ea\u5df1\u64cd\u4f5c\uff1b\u667a\u80fd\u4f53\u8d1f\u8d23\u56de\u7b54\u548c\u5f15\u5bfc\u3002",
        ja: "\u30ec\u30f3\u30ba\u5185\u30c7\u30a3\u30b9\u30d7\u30ec\u30a4\u3092\u6301\u3064\u30b0\u30e9\u30b9\u3068\u3001\u624b\u9996\u306e\u30b8\u30a7\u30b9\u30c1\u30e3\u30fc\u7528\u306e EMG Neural Band\u3002Meta AI \u304c\u8996\u899a\u7684\u306a\u56de\u7b54\u3068\u624b\u9806\u30ac\u30a4\u30c9\u3092\u8868\u793a\u3057\u307e\u3059\u3002\u8868\u793a UI \u3092\u64cd\u4f5c\u3059\u308b\u306e\u306f\u30e6\u30fc\u30b6\u30fc\u3067\u3001\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u306f\u56de\u7b54\u3068\u6848\u5185\u3092\u3057\u307e\u3059\u3002" } },
    { k: "muse", n: "Meta Muse agent", c: "F", y: 2026, pl: ["glasses"], P: 0, I: 2, O: 1, E: 0, v: "announced at Connect, Sep 2026; not shipped", u: "https://about.fb.com/news/2026/09/the-biggest-news-from-connect-2026/",
      s: { en: "A personal agent for AI glasses, announced for 'the coming months', that acts on what the user looks at through shopping, payment and booking connectors. Acts through services, not by operating an interface.",
        zh: "\u9762\u5411 AI \u773c\u955c\u7684\u4e2a\u4eba\u667a\u80fd\u4f53\uff0c\u5ba3\u5e03\u5c06\u5728\u201cthe coming months\u201d\uff08\u672a\u6765\u51e0\u4e2a\u6708\uff09\u63a8\u51fa\uff0c\u901a\u8fc7\u8d2d\u7269\u3001\u652f\u4ed8\u548c\u9884\u8ba2\u8fde\u63a5\u5668\u5bf9\u7528\u6237\u6240\u770b\u4e4b\u7269\u91c7\u53d6\u884c\u52a8\u3002\u901a\u8fc7\u670d\u52a1\u884c\u52a8\uff0c\u800c\u975e\u64cd\u4f5c\u754c\u9762\u3002",
        ja: "AI \u30b0\u30e9\u30b9\u5411\u3051\u306e\u30d1\u30fc\u30bd\u30ca\u30eb\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u3067\u3001\u300cthe coming months\u300d\uff08\u4eca\u5f8c\u6570\u304b\u6708\uff09\u306b\u63d0\u4f9b\u4e88\u5b9a\u3068\u767a\u8868\u3055\u308c\u307e\u3057\u305f\u3002\u30e6\u30fc\u30b6\u30fc\u304c\u898b\u3066\u3044\u308b\u3082\u306e\u306b\u5bfe\u3057\u3001\u8cb7\u3044\u7269\u30fb\u6c7a\u6e08\u30fb\u4e88\u7d04\u306e\u30b3\u30cd\u30af\u30bf\u3092\u901a\u3058\u3066\u884c\u52d5\u3057\u307e\u3059\u3002\u30a4\u30f3\u30bf\u30fc\u30d5\u30a7\u30fc\u30b9\u306e\u64cd\u4f5c\u3067\u306f\u306a\u304f\u30b5\u30fc\u30d3\u30b9\u7d4c\u7531\u3067\u3059\u3002" } },
    { k: "visionclaw", n: "VisionClaw", c: "F", y: 2026, pl: ["glasses"], P: 0, I: 2, O: 1, E: 2, v: "arXiv preprint 2026", u: AX + "2604.03486",
      s: { en: "Always-on perception on Ray-Ban Meta glasses connected to agents that act through apps and services (shopping cart, calendar from posters, IoT). Lab study N=12 and deployment N=5: faster completion, opportunistic delegation. Acts via services, not a 3D GUI.",
        zh: "Ray-Ban Meta \u773c\u955c\u4e0a\u7684\u5e38\u5f00\u611f\u77e5\uff0c\u8fde\u63a5\u901a\u8fc7\u5e94\u7528\u548c\u670d\u52a1\u884c\u52a8\u7684\u667a\u80fd\u4f53\uff08\u8d2d\u7269\u8f66\u3001\u4ece\u6d77\u62a5\u521b\u5efa\u65e5\u7a0b\u3001IoT\uff09\u3002\u5b9e\u9a8c\u5ba4\u7814\u7a76 N=12\u3001\u90e8\u7f72\u7814\u7a76 N=5\uff1a\u5b8c\u6210\u66f4\u5feb\uff0c\u7528\u6237\u8f6c\u5411\u968f\u624b\u59d4\u6258\u3002\u901a\u8fc7\u670d\u52a1\u884c\u52a8\uff0c\u800c\u975e\u64cd\u4f5c 3D \u754c\u9762\u3002",
        ja: "Ray-Ban Meta \u30b0\u30e9\u30b9\u306e\u5e38\u6642\u77e5\u899a\u3092\u3001\u30a2\u30d7\u30ea\u3084\u30b5\u30fc\u30d3\u30b9\u7d4c\u7531\u3067\u884c\u52d5\u3059\u308b\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\uff08\u8cb7\u3044\u7269\u304b\u3054\u3001\u30dd\u30b9\u30bf\u30fc\u304b\u3089\u4e88\u5b9a\u4f5c\u6210\u3001IoT\uff09\u306b\u3064\u306a\u304e\u307e\u3059\u3002\u5b9f\u9a13\u5ba4 N=12\u3001\u5b9f\u5730\u5c55\u958b N=5 \u3067\u5b8c\u4e86\u304c\u901f\u304f\u306a\u308a\u3001\u6a5f\u4f1a\u7684\u306a\u59d4\u4efb\u304c\u5897\u3048\u307e\u3057\u305f\u30023D GUI \u3067\u306f\u306a\u304f\u30b5\u30fc\u30d3\u30b9\u7d4c\u7531\u306e\u884c\u52d5\u3067\u3059\u3002" } },
    { k: "operator", n: "Meta XR Operator", c: "H", y: 2026, pl: ["quest", "unity"], P: 2, I: 1, O: 2, E: 0, v: "experimental, Meta XR SDK v205, Aug 2026", u: "https://developers.meta.com/horizon/blog/meta-xr-operator-close-the-build-test-verify-loop-for-vr/",
      s: { en: "An OpenXR API layer with an in-app MCP server: an agent can screenshot the app, read room geometry and the Unity hierarchy, press buttons, point and aim, and 'work through menus'. Limits stated by Meta: one aim ray per hand, no audio, screenshots only, 'too slowly for real-time interaction'. Developer testing; no evaluation.",
        zh: "\u5e26\u6709\u5e94\u7528\u5185 MCP \u670d\u52a1\u5668\u7684 OpenXR API \u5c42\uff1a\u667a\u80fd\u4f53\u53ef\u4ee5\u622a\u53d6\u5e94\u7528\u753b\u9762\u3001\u8bfb\u53d6\u623f\u95f4\u51e0\u4f55\u4e0e Unity \u5c42\u7ea7\u3001\u6309\u6309\u94ae\u3001\u6307\u5411\u4e0e\u7784\u51c6\uff0c\u5e76\u201cwork through menus\u201d\uff08\u9010\u7ea7\u64cd\u4f5c\u83dc\u5355\uff09\u3002Meta \u81ea\u8ff0\u7684\u9650\u5236\uff1a\u6bcf\u53ea\u624b\u4e00\u6761\u7784\u51c6\u5c04\u7ebf\u3001\u65e0\u97f3\u9891\u3001\u53ea\u6709\u622a\u56fe\u3001\u201ctoo slowly for real-time interaction\u201d\uff08\u592a\u6162\uff0c\u65e0\u6cd5\u5b9e\u65f6\u4ea4\u4e92\uff09\u3002\u7528\u4e8e\u5f00\u53d1\u6d4b\u8bd5\uff1b\u65e0\u8bc4\u6d4b\u3002",
        ja: "\u30a2\u30d7\u30ea\u5185 MCP \u30b5\u30fc\u30d0\u30fc\u3092\u6301\u3064 OpenXR API \u30ec\u30a4\u30e4\u30fc\u3067\u3001\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u306f\u30a2\u30d7\u30ea\u306e\u30b9\u30af\u30ea\u30fc\u30f3\u30b7\u30e7\u30c3\u30c8\u3001\u90e8\u5c4b\u306e\u5f62\u72b6\u3068 Unity \u968e\u5c64\u306e\u8aad\u307f\u53d6\u308a\u3001\u30dc\u30bf\u30f3\u62bc\u4e0b\u3001\u30dd\u30a4\u30f3\u30c6\u30a3\u30f3\u30b0\u3068\u7167\u6e96\u3001\u300cwork through menus\u300d\uff08\u30e1\u30cb\u30e5\u30fc\u3092\u305f\u3069\u308b\uff09\u3053\u3068\u304c\u3067\u304d\u307e\u3059\u3002Meta \u304c\u6319\u3052\u308b\u5236\u9650\u306f\u3001\u7247\u624b 1 \u672c\u306e\u7167\u6e96\u30ec\u30a4\u3001\u97f3\u58f0\u306a\u3057\u3001\u30b9\u30af\u30ea\u30fc\u30f3\u30b7\u30e7\u30c3\u30c8\u306e\u307f\u3001\u300ctoo slowly for real-time interaction\u300d\uff08\u30ea\u30a2\u30eb\u30bf\u30a4\u30e0\u306b\u306f\u9045\u3059\u304e\u308b\uff09\u3002\u958b\u767a\u30c6\u30b9\u30c8\u7528\u3067\u3001\u8a55\u4fa1\u306f\u3042\u308a\u307e\u305b\u3093\u3002" } },
    { k: "iwsdk", n: "IWSDK MCP tools", c: "H", y: 2026, pl: ["webxr"], P: 2, I: 1, O: 2, E: 0, v: "Meta documentation, 2026", u: "https://developers.meta.com/horizon/documentation/web/iwsdk-ai-assisted-dev-tooling",
      s: { en: "Meta's Immersive Web SDK exposes 32 MCP tools to agents: canvas capture, scene hierarchy, ECS snapshots and diffs, ui_inspect for panels, device poses, select and pinch input, pause and step. Built for coding agents testing their own WebXR app; the most open observation and action API found.",
        zh: "Meta \u7684 Immersive Web SDK \u5411\u667a\u80fd\u4f53\u63d0\u4f9b 32 \u4e2a MCP \u5de5\u5177\uff1a\u753b\u5e03\u622a\u56fe\u3001\u573a\u666f\u5c42\u7ea7\u3001ECS \u5feb\u7167\u4e0e\u5dee\u5206\u3001\u9762\u677f\u7684 ui_inspect\u3001\u8bbe\u5907\u4f4d\u59ff\u3001\u9009\u62e9\u4e0e\u634f\u5408\u8f93\u5165\u3001\u6682\u505c\u4e0e\u5355\u6b65\u3002\u4e3a\u6d4b\u8bd5\u81ea\u5df1 WebXR \u5e94\u7528\u7684\u7f16\u7801\u667a\u80fd\u4f53\u800c\u8bbe\u8ba1\uff1b\u662f\u76ee\u524d\u627e\u5230\u7684\u6700\u5f00\u653e\u7684\u89c2\u5bdf\u4e0e\u52a8\u4f5c API\u3002",
        ja: "Meta \u306e Immersive Web SDK \u306f\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u306b 32 \u500b\u306e MCP \u30c4\u30fc\u30eb\u3092\u63d0\u4f9b\u3057\u307e\u3059\uff1a\u30ad\u30e3\u30f3\u30d0\u30b9\u306e\u30ad\u30e3\u30d7\u30c1\u30e3\u3001\u30b7\u30fc\u30f3\u968e\u5c64\u3001ECS \u306e\u30b9\u30ca\u30c3\u30d7\u30b7\u30e7\u30c3\u30c8\u3068\u5dee\u5206\u3001\u30d1\u30cd\u30eb\u7528\u306e ui_inspect\u3001\u30c7\u30d0\u30a4\u30b9\u306e\u59ff\u52e2\u3001\u9078\u629e\u3068\u30d4\u30f3\u30c1\u5165\u529b\u3001\u4e00\u6642\u505c\u6b62\u3068\u30b9\u30c6\u30c3\u30d7\u5b9f\u884c\u3002\u81ea\u5206\u306e WebXR \u30a2\u30d7\u30ea\u3092\u30c6\u30b9\u30c8\u3059\u308b\u30b3\u30fc\u30c7\u30a3\u30f3\u30b0\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u5411\u3051\u3067\u3001\u898b\u3064\u304b\u3063\u305f\u4e2d\u3067\u6700\u3082\u958b\u304b\u308c\u305f\u89b3\u6e2c\u30fb\u884c\u52d5 API \u3067\u3059\u3002" } },
    { k: "genxr", n: "GenXR-Bench actors", c: "H", y: 2026, pl: ["webxr"], P: 1, I: 1, O: 2, E: 1, v: "arXiv preprint 2026", u: AX + "2610.29014",
      s: { en: "112 XR development tasks for coding agents (best Pass@1 50.9%). Its harness has scripted and VLM 'actors' that observe an object tree and set-of-mark screenshots and act through viewer, hand, pointing and selection calls. The actors operate the generated apps, but are not themselves evaluated as GUI agents.",
        zh: "\u9762\u5411\u7f16\u7801\u667a\u80fd\u4f53\u7684 112 \u4e2a XR \u5f00\u53d1\u4efb\u52a1\uff08\u6700\u4f73 Pass@1 \u4e3a 50.9%\uff09\u3002\u5176\u6d4b\u8bd5\u6846\u67b6\u5305\u542b\u811a\u672c\u5316\u548c VLM\u201c\u6f14\u5458\u201d\uff0c\u5b83\u4eec\u89c2\u5bdf\u5bf9\u8c61\u6811\u4e0e set-of-mark \u622a\u56fe\uff0c\u5e76\u901a\u8fc7\u89c6\u89d2\u3001\u624b\u3001\u6307\u5411\u4e0e\u9009\u62e9\u8c03\u7528\u884c\u52a8\u3002\u6f14\u5458\u4f1a\u64cd\u4f5c\u751f\u6210\u7684\u5e94\u7528\uff0c\u4f46\u672c\u8eab\u5e76\u672a\u4f5c\u4e3a GUI \u667a\u80fd\u4f53\u88ab\u8bc4\u6d4b\u3002",
        ja: "\u30b3\u30fc\u30c7\u30a3\u30f3\u30b0\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u5411\u3051\u306e 112 \u500b\u306e XR \u958b\u767a\u30bf\u30b9\u30af\uff08\u6700\u826f\u306e Pass@1 \u306f 50.9%\uff09\u3002\u8a55\u4fa1\u74b0\u5883\u306b\u306f\u30b9\u30af\u30ea\u30d7\u30c8\u3068 VLM \u306e\u300c\u30a2\u30af\u30bf\u30fc\u300d\u304c\u3042\u308a\u3001\u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u30c4\u30ea\u30fc\u3068 set-of-mark \u306e\u30b9\u30af\u30ea\u30fc\u30f3\u30b7\u30e7\u30c3\u30c8\u3092\u89b3\u6e2c\u3057\u3001\u8996\u70b9\u30fb\u624b\u30fb\u30dd\u30a4\u30f3\u30c6\u30a3\u30f3\u30b0\u30fb\u9078\u629e\u306e\u547c\u3073\u51fa\u3057\u3067\u884c\u52d5\u3057\u307e\u3059\u3002\u30a2\u30af\u30bf\u30fc\u306f\u751f\u6210\u3055\u308c\u305f\u30a2\u30d7\u30ea\u3092\u64cd\u4f5c\u3057\u307e\u3059\u304c\u3001\u305d\u308c\u81ea\u4f53\u306f GUI \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u3068\u3057\u3066\u8a55\u4fa1\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002" } },
    { k: "xarp", n: "XARP Tools", c: "H", y: 2025, pl: ["unity"], P: 1, I: 1, O: 2, E: 1, v: "PACM HCI (EICS)", u: AX + "2508.04108",
      s: { en: "A Python server drives a Unity XR client and exposes the same functions to humans as a library and to AI agents as tools and over MCP. Acceptance evaluation with 24 developers; agents used 19% fewer tokens than writing C#. An agent-ready API for apps you control.",
        zh: "Python \u670d\u52a1\u5668\u9a71\u52a8 Unity XR \u5ba2\u6237\u7aef\uff0c\u540c\u4e00\u7ec4\u51fd\u6570\u65e2\u4f5c\u4e3a\u5e93\u63d0\u4f9b\u7ed9\u4eba\uff0c\u4e5f\u4f5c\u4e3a\u5de5\u5177\u5e76\u901a\u8fc7 MCP \u63d0\u4f9b\u7ed9 AI \u667a\u80fd\u4f53\u300224 \u540d\u5f00\u53d1\u8005\u7684\u63a5\u53d7\u5ea6\u8bc4\u4f30\uff1b\u667a\u80fd\u4f53\u6bd4\u7f16\u5199 C# \u5c11\u7528 19% \u7684 token\u3002\u662f\u9762\u5411\u81ea\u6709\u5e94\u7528\u7684\u3001\u53ef\u4f9b\u667a\u80fd\u4f53\u4f7f\u7528\u7684 API\u3002",
        ja: "Python \u30b5\u30fc\u30d0\u30fc\u304c Unity \u306e XR \u30af\u30e9\u30a4\u30a2\u30f3\u30c8\u3092\u52d5\u304b\u3057\u3001\u540c\u3058\u6a5f\u80fd\u3092\u4eba\u306b\u306f\u30e9\u30a4\u30d6\u30e9\u30ea\u3068\u3057\u3066\u3001AI \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u306b\u306f\u30c4\u30fc\u30eb\u3068\u3057\u3066 MCP \u7d4c\u7531\u3067\u63d0\u4f9b\u3057\u307e\u3059\u3002\u958b\u767a\u8005 24 \u540d\u306b\u3088\u308b\u53d7\u5bb9\u6027\u8a55\u4fa1\u3067\u3001\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u306f C# \u3092\u66f8\u304f\u5834\u5408\u3088\u308a 19% \u5c11\u306a\u3044\u30c8\u30fc\u30af\u30f3\u3067\u6e08\u307f\u307e\u3057\u305f\u3002\u81ea\u5206\u3067\u7ba1\u7406\u3059\u308b\u30a2\u30d7\u30ea\u5411\u3051\u306e\u3001\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u5bfe\u5fdc API \u3067\u3059\u3002" } }
  ];

  var CATS = [
    { k: "A", col: "#9467bd" }, { k: "B", col: "#ff7f0e" }, { k: "C", col: "#17becf" },
    { k: "D", col: "#1f77b4" }, { k: "E", col: "#2ca02c" }, { k: "F", col: "#d62728" }, { k: "H", col: "#b07d10" }
  ];
  var PLATS = ["quest", "avp", "axr", "holo", "pcvr", "unity", "webxr", "glasses", "games", "other"];
  var YEARS = [2023, 2024, 2025, 2026];
  var ICOL = ["#9e9e9e", "#17becf", "#ff7f0e"];

  var TXT = {
    en: {
      help: "Tap a point or a name to read its summary. Chips filter by category, platform and year (tap again to clear).",
      cat: "Category", plat: "Platform", year: "Year", all: "All", target: "Target region",
      cats: { A: "XR-UI grounding & operation", B: "Build / edit XR worlds", C: "Assistants that answer / guide", D: "XR app testing", E: "3D agents from pixels", F: "Headset / glasses products", H: "Agent infrastructure" },
      plats: { quest: "Quest / Horizon OS", avp: "Vision Pro", axr: "Android XR", holo: "HoloLens", pcvr: "PC VR", unity: "Unity / simulator", webxr: "WebXR", glasses: "AI glasses", games: "3D games / sims", other: "other / unspecified" },
      xl: "perceives the 3D UI", yl: "operates the XR UI",
      lv: ["none", "partial", "full"],
      ol: ["operate: none", "act partly / guide", "operate UI"],
      intent: "Intent", intents: ["none", "implicit / proactive", "natural language"],
      eval: "Evaluation", evals: ["none / undisclosed", "preliminary", "quantitative"],
      tgt: "3D GUI agent: full perception and operation, natural-language intent, evaluated. Empty so far.",
      open: "Open source", shown: "shown", none: "No work matches these filters.",
      props: ["perceive", "intent", "operate", "evaluated"]
    },
    zh: {
      help: "\u70b9\u51fb\u5706\u70b9\u6216\u540d\u79f0\u67e5\u770b\u6458\u8981\u3002\u7528\u6807\u7b7e\u6309\u7c7b\u522b\u3001\u5e73\u53f0\u548c\u5e74\u4efd\u7b5b\u9009\uff08\u518d\u6b21\u70b9\u51fb\u53d6\u6d88\uff09\u3002",
      cat: "\u7c7b\u522b", plat: "\u5e73\u53f0", year: "\u5e74\u4efd", all: "\u5168\u90e8", target: "\u76ee\u6807\u533a\u57df",
      cats: { A: "XR \u754c\u9762\u5b9a\u4f4d\u4e0e\u64cd\u4f5c", B: "\u751f\u6210 / \u7f16\u8f91 XR \u4e16\u754c", C: "\u56de\u7b54 / \u5f15\u5bfc\u578b\u52a9\u624b", D: "XR \u5e94\u7528\u6d4b\u8bd5", E: "\u4ece\u50cf\u7d20\u5728 3D \u4e2d\u884c\u52a8", F: "\u5934\u663e / \u773c\u955c\u4ea7\u54c1", H: "\u667a\u80fd\u4f53\u57fa\u7840\u8bbe\u65bd" },
      plats: { quest: "Quest / Horizon OS", avp: "Vision Pro", axr: "Android XR", holo: "HoloLens", pcvr: "PC VR", unity: "Unity / \u6a21\u62df\u5668", webxr: "WebXR", glasses: "AI \u773c\u955c", games: "3D \u6e38\u620f / \u4eff\u771f", other: "\u5176\u4ed6 / \u672a\u6ce8\u660e" },
      xl: "\u611f\u77e5 3D \u754c\u9762", yl: "\u64cd\u4f5c XR \u754c\u9762",
      lv: ["\u65e0", "\u90e8\u5206", "\u5b8c\u6574"],
      ol: ["\u4e0d\u64cd\u4f5c", "\u90e8\u5206\u884c\u52a8 / \u5f15\u5bfc", "\u64cd\u4f5c\u754c\u9762"],
      intent: "\u610f\u56fe", intents: ["\u65e0", "\u9690\u5f0f / \u4e3b\u52a8\u63a8\u65ad", "\u81ea\u7136\u8bed\u8a00"],
      eval: "\u8bc4\u6d4b", evals: ["\u65e0 / \u672a\u516c\u5f00", "\u521d\u6b65", "\u5b9a\u91cf"],
      tgt: "3D GUI \u667a\u80fd\u4f53\uff1a\u5b8c\u6574\u611f\u77e5\u4e0e\u64cd\u4f5c\u3001\u81ea\u7136\u8bed\u8a00\u610f\u56fe\u3001\u7ecf\u8fc7\u8bc4\u6d4b\u3002\u76ee\u524d\u4e3a\u7a7a\u3002",
      open: "\u67e5\u770b\u6765\u6e90", shown: "\u9879", none: "\u6ca1\u6709\u7b26\u5408\u7b5b\u9009\u6761\u4ef6\u7684\u5de5\u4f5c\u3002",
      props: ["\u611f\u77e5", "\u610f\u56fe", "\u64cd\u4f5c", "\u8bc4\u6d4b"]
    },
    ja: {
      help: "\u70b9\u3084\u540d\u524d\u3092\u30bf\u30c3\u30d7\u3059\u308b\u3068\u8981\u7d04\u304c\u8868\u793a\u3055\u308c\u307e\u3059\u3002\u30c1\u30c3\u30d7\u3067\u30ab\u30c6\u30b4\u30ea\u30fb\u30d7\u30e9\u30c3\u30c8\u30d5\u30a9\u30fc\u30e0\u30fb\u5e74\u3092\u7d5e\u308a\u8fbc\u3081\u307e\u3059\uff08\u3082\u3046\u4e00\u5ea6\u30bf\u30c3\u30d7\u3067\u89e3\u9664\uff09\u3002",
      cat: "\u30ab\u30c6\u30b4\u30ea", plat: "\u30d7\u30e9\u30c3\u30c8\u30d5\u30a9\u30fc\u30e0", year: "\u5e74", all: "\u3059\u3079\u3066", target: "\u76ee\u6a19\u9818\u57df",
      cats: { A: "XR UI \u306e\u63a5\u5730\u3068\u64cd\u4f5c", B: "XR \u4e16\u754c\u306e\u751f\u6210\u30fb\u7de8\u96c6", C: "\u56de\u7b54\u30fb\u30ac\u30a4\u30c9\u578b\u30a2\u30b7\u30b9\u30bf\u30f3\u30c8", D: "XR \u30a2\u30d7\u30ea\u306e\u30c6\u30b9\u30c8", E: "\u753b\u7d20\u304b\u3089 3D \u3067\u884c\u52d5", F: "\u30d8\u30c3\u30c9\u30bb\u30c3\u30c8\u30fb\u30b0\u30e9\u30b9\u88fd\u54c1", H: "\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u57fa\u76e4" },
      plats: { quest: "Quest / Horizon OS", avp: "Vision Pro", axr: "Android XR", holo: "HoloLens", pcvr: "PC VR", unity: "Unity / \u30b7\u30df\u30e5\u30ec\u30fc\u30bf", webxr: "WebXR", glasses: "AI \u30b0\u30e9\u30b9", games: "3D \u30b2\u30fc\u30e0 / \u30b7\u30df\u30e5", other: "\u305d\u306e\u4ed6 / \u4e0d\u660e" },
      xl: "3D UI \u3092\u77e5\u899a", yl: "XR UI \u3092\u64cd\u4f5c",
      lv: ["\u306a\u3057", "\u90e8\u5206\u7684", "\u5b8c\u5168"],
      ol: ["\u64cd\u4f5c\u306a\u3057", "\u90e8\u5206\u7684\u306a\u884c\u52d5 / \u30ac\u30a4\u30c9", "UI \u3092\u64cd\u4f5c"],
      intent: "\u610f\u56f3", intents: ["\u306a\u3057", "\u6697\u9ed9\u7684 / \u5148\u56de\u308a", "\u81ea\u7136\u8a00\u8a9e"],
      eval: "\u8a55\u4fa1", evals: ["\u306a\u3057 / \u975e\u516c\u958b", "\u4e88\u5099\u7684", "\u5b9a\u91cf\u7684"],
      tgt: "3D GUI \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\uff1a\u5b8c\u5168\u306a\u77e5\u899a\u3068\u64cd\u4f5c\u3001\u81ea\u7136\u8a00\u8a9e\u306e\u610f\u56f3\u3001\u8a55\u4fa1\u6e08\u307f\u3002\u73fe\u6642\u70b9\u3067\u306f\u7a7a\u3067\u3059\u3002",
      open: "\u51fa\u5178\u3092\u958b\u304f", shown: "\u4ef6\u8868\u793a", none: "\u6761\u4ef6\u306b\u5408\u3046\u7814\u7a76\u306f\u3042\u308a\u307e\u305b\u3093\u3002",
      props: ["\u77e5\u899a", "\u610f\u56f3", "\u64cd\u4f5c", "\u8a55\u4fa1"]
    }
  };

  var SVGNS = "http://www.w3.org/2000/svg";
  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }
  function sv(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }
  function chip(label, color) {
    var b = el("button", "font:inherit;font-size:12.5px;line-height:1.2;padding:4px 9px;margin:2px;border-radius:999px;" +
      "border:1.5px solid " + color + ";cursor:pointer;touch-action:manipulation;white-space:nowrap;background:#fff;color:#222", label);
    b.type = "button";
    b._col = color;
    return b;
  }
  function setChip(b, on) {
    b.style.background = on ? b._col : "#fff";
    b.style.color = on ? "#fff" : "#222";
  }
  function catCol(c) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].k === c) return CATS[i].col;
    return "#555";
  }

  function build(root) {
    var lang = TXT[root.dataset.lang] ? root.dataset.lang : "en";
    var T = TXT[lang];
    root.innerHTML = "";
    root.style.cssText += ";font-family:inherit;background:#fafafa;border:1px solid #ddd;border-radius:8px;padding:10px;color:#222;box-sizing:border-box";
    var state = { cat: null, plat: null, year: null, sel: null, target: true };

    root.appendChild(el("div", "font-size:13px;color:#555;margin-bottom:6px", T.help));

    function chipRow(title, items, key, labelOf, colorOf) {
      var row = el("div", "display:flex;flex-wrap:wrap;align-items:center;margin:2px 0");
      row.appendChild(el("span", "font-size:12.5px;font-weight:600;margin-right:4px;min-width:64px", title));
      var chips = [];
      items.forEach(function (it) {
        var b = chip(labelOf(it), colorOf(it));
        b.addEventListener("click", function () {
          state[key] = state[key] === it ? null : it;
          chips.forEach(function (c) { setChip(c, state[key] === c._it); });
          state.sel = null;
          render();
        });
        b._it = it;
        chips.push(b);
        row.appendChild(b);
      });
      root.appendChild(row);
    }
    chipRow(T.cat, CATS.map(function (c) { return c.k; }), "cat", function (k) { return T.cats[k]; }, catCol);
    chipRow(T.plat, PLATS, "plat", function (k) { return T.plats[k]; }, function () { return "#555"; });
    chipRow(T.year, YEARS, "year", function (y) { return String(y); }, function () { return "#555"; });
    var tb = chip(T.target, "#d62728");
    setChip(tb, true);
    tb.addEventListener("click", function () { state.target = !state.target; setChip(tb, state.target); render(); });
    var trow = el("div", "margin:4px 0");
    trow.appendChild(tb);
    root.appendChild(trow);

    var svgWrap = el("div", "position:relative;width:100%");
    root.appendChild(svgWrap);
    var svg = sv("svg", { width: "100%" });
    svg.style.display = "block";
    svg.style.touchAction = "pan-y";
    svgWrap.appendChild(svg);

    var legend = el("div", "font-size:12px;color:#444;margin:4px 0;display:flex;flex-wrap:wrap;gap:10px");
    root.appendChild(legend);
    var card = el("div", "background:#fff;border:1px solid #ccc;border-radius:6px;padding:8px 10px;margin-top:6px;font-size:13.5px;line-height:1.45;min-height:60px");
    root.appendChild(card);
    var list = el("div", "margin-top:6px;font-size:12.5px;line-height:1.7");
    root.appendChild(list);

    // legend
    (function () {
      var a = el("span", "", T.intent + ": ");
      legend.appendChild(a);
      T.intents.forEach(function (t, i) {
        var s = el("span", "white-space:nowrap");
        s.appendChild(el("span", "display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:3px;vertical-align:middle;background:" + ICOL[i]));
        s.appendChild(document.createTextNode(t));
        legend.appendChild(s);
      });
      var b = el("span", "", T.eval + ": ");
      legend.appendChild(b);
      var styles = ["border:1px solid #ccc", "border:2px dashed #222", "border:2.5px solid #222"];
      T.evals.forEach(function (t, i) {
        var s = el("span", "white-space:nowrap");
        s.appendChild(el("span", "display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:3px;vertical-align:middle;background:#fff;" + styles[i]));
        s.appendChild(document.createTextNode(t));
        legend.appendChild(s);
      });
    })();

    function visible(w) {
      if (state.cat && w.c !== state.cat) return false;
      if (state.plat && w.pl.indexOf(state.plat) < 0) return false;
      if (state.year && w.y !== state.year) return false;
      return true;
    }

    function showCard(w) {
      card.innerHTML = "";
      if (!w) {
        card.appendChild(el("div", "color:#666", T.tgt));
        return;
      }
      var h = el("div", "font-weight:700;color:" + catCol(w.c), w.n);
      card.appendChild(h);
      var meta = w.v + " \u00b7 " + w.pl.map(function (p) { return T.plats[p]; }).join(", ") + " \u00b7 " + T.cats[w.c];
      card.appendChild(el("div", "font-size:12px;color:#555;margin:2px 0 4px", meta));
      var r = el("div", "font-size:12px;margin-bottom:4px");
      [w.P, w.I, w.O, w.E].forEach(function (v, i) {
        var lab = i === 1 ? T.intents[v] : (i === 3 ? T.evals[v] : (i === 2 ? T.ol[v] : T.lv[v]));
        var s = el("span", "display:inline-block;margin:1px 6px 1px 0;padding:1px 6px;border-radius:4px;background:" +
          (v === 2 ? "#6a3d9a;color:#fff" : (v === 1 ? "#c9b8e6;color:#222" : "#eee;color:#666")), T.props[i] + ": " + lab);
        r.appendChild(s);
      });
      card.appendChild(r);
      card.appendChild(el("div", "", w.s[lang] || w.s.en));
      var a = el("a", "display:inline-block;margin-top:4px;font-size:12.5px", T.open + " \u2192");
      a.href = w.u;
      a.target = "_blank";
      a.rel = "noopener";
      card.appendChild(a);
    }

    var layout = [];
    function render() {
      var Wd = Math.max(280, svgWrap.clientWidth || root.clientWidth || 600);
      var narrow = Wd < 560;
      var H = narrow ? Math.round(Wd * 1.05) : Math.round(Math.min(560, Wd * 0.62));
      svg.setAttribute("viewBox", "0 0 " + Wd + " " + H);
      svg.setAttribute("height", H);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var ml = narrow ? 30 : 44, mb = narrow ? 34 : 40, mt = 8, mr = 6;
      var cw = (Wd - ml - mr) / 3, ch = (H - mt - mb) / 3;
      function cx(p) { return ml + p * cw; }
      function cy(o) { return mt + (2 - o) * ch; }
      // grid
      for (var i = 0; i < 3; i++) {
        for (var j = 0; j < 3; j++) {
          svg.appendChild(sv("rect", { x: cx(i) + 1, y: cy(j) + 1, width: cw - 2, height: ch - 2, fill: (i + j) % 2 ? "#ffffff" : "#f3f1f8", stroke: "#e0e0e0" }));
        }
      }
      if (state.target) {
        svg.appendChild(sv("rect", { x: cx(2) + 3, y: cy(2) + 3, width: cw - 6, height: ch - 6, fill: "rgba(214,39,40,0.06)", stroke: "#d62728", "stroke-width": 2.5, "stroke-dasharray": "7 5", rx: 6 }));
      }
      // axis labels
      for (var k = 0; k < 3; k++) {
        var tx = sv("text", { x: cx(k) + cw / 2, y: H - mb + 14, "text-anchor": "middle", "font-size": narrow ? 10 : 12, fill: "#444" });
        tx.textContent = T.lv[k];
        svg.appendChild(tx);
        var ty = sv("text", { x: 0, y: 0, "text-anchor": "middle", "font-size": narrow ? 10 : 12, fill: "#444",
          transform: "translate(" + (ml - 8) + "," + (cy(k) + ch / 2) + ") rotate(-90)" });
        ty.textContent = T.ol[k];
        svg.appendChild(ty);
      }
      var xl = sv("text", { x: ml + 1.5 * cw, y: H - 4, "text-anchor": "middle", "font-size": narrow ? 11 : 13, "font-weight": 600, fill: "#222" });
      xl.textContent = T.xl + " \u2192";
      svg.appendChild(xl);
      var yl = sv("text", { x: 0, y: 0, "text-anchor": "middle", "font-size": narrow ? 11 : 13, "font-weight": 600, fill: "#222",
        transform: "translate(" + (narrow ? 9 : 12) + "," + (mt + 1.5 * ch) + ") rotate(-90)" });
      yl.textContent = T.yl + " \u2192";
      svg.appendChild(yl);

      // place points: group by cell, sort by intent then name, arrange in a small grid inside the cell
      var cells = {};
      var shownN = 0;
      W.forEach(function (w) {
        var key = w.P + "," + w.O;
        (cells[key] = cells[key] || []).push(w);
      });
      layout = [];
      var r = narrow ? 7 : 9;
      Object.keys(cells).forEach(function (key) {
        var arr = cells[key].slice().sort(function (a, b) { return b.I - a.I || (a.n < b.n ? -1 : 1); });
        var p = +key.split(",")[0], o = +key.split(",")[1];
        var n = arr.length;
        var showLabels = !narrow;
        var cols = Math.max(1, Math.min(n, showLabels ? 3 : 4));
        var rows = Math.ceil(n / cols);
        arr.forEach(function (w, idx) {
          var c = idx % cols, rr = Math.floor(idx / cols);
          var x = cx(p) + cw * (c + 0.5) / cols;
          var y = cy(o) + ch * (rr + 0.5) / rows - (showLabels ? 6 : 0);
          layout.push({ w: w, x: x, y: y, lab: showLabels, colw: cw / cols });
        });
      });
      layout.forEach(function (L) {
        var w = L.w, vis = visible(w);
        if (vis) shownN++;
        var g = sv("g", { cursor: "pointer", opacity: vis ? 1 : 0.13 });
        var sel = state.sel === w;
        if (sel) g.appendChild(sv("circle", { cx: L.x, cy: L.y, r: r + 6, fill: "none", stroke: "#6a3d9a", "stroke-width": 2.5 }));
        var circ = sv("circle", { cx: L.x, cy: L.y, r: r, fill: ICOL[w.I],
          stroke: w.E === 0 ? "#bbb" : "#222", "stroke-width": w.E === 2 ? 2.6 : (w.E === 1 ? 2 : 1) });
        if (w.E === 1) circ.setAttribute("stroke-dasharray", "3 2");
        g.appendChild(circ);
        if (L.lab) {
          var t = sv("text", { x: L.x, y: L.y + r + 12, "text-anchor": "middle", "font-size": 10.5, fill: catCol(w.c) });
          var name = w.n;
          var maxc = Math.max(6, Math.floor(L.colw / 6.2));
          if (name.length > maxc) name = name.slice(0, maxc - 1) + "\u2026";
          t.textContent = name;
          g.appendChild(t);
        }
        g.addEventListener("click", function (ev) { ev.stopPropagation(); state.sel = w; render(); });
        svg.appendChild(g);
      });
      // list
      list.innerHTML = "";
      var cnt = el("div", "color:#666", shownN + " / " + W.length + " " + T.shown);
      list.appendChild(cnt);
      if (shownN === 0) list.appendChild(el("div", "color:#a00", T.none));
      W.forEach(function (w) {
        if (!visible(w)) return;
        var b = el("button", "font:inherit;font-size:12px;margin:2px 3px 2px 0;padding:2px 7px;border-radius:4px;cursor:pointer;touch-action:manipulation;background:" +
          (state.sel === w ? catCol(w.c) : "#fff") + ";color:" + (state.sel === w ? "#fff" : catCol(w.c)) + ";border:1px solid " + catCol(w.c), w.n);
        b.type = "button";
        b.addEventListener("click", function () { state.sel = w; render(); });
        list.appendChild(b);
      });
      showCard(state.sel);
    }

    // tap on empty plot area: pick the nearest visible point within reach
    svg.addEventListener("pointerdown", function (ev) {
      var rect = svg.getBoundingClientRect();
      var vb = svg.viewBox.baseVal;
      var sx = vb.width / rect.width, sy = vb.height / rect.height;
      var px = (ev.clientX - rect.left) * sx, py = (ev.clientY - rect.top) * sy;
      var best = null, bd = 900;
      layout.forEach(function (L) {
        if (!visible(L.w)) return;
        var d = (L.x - px) * (L.x - px) + (L.y - py) * (L.y - py);
        if (d < bd) { bd = d; best = L.w; }
      });
      if (best && best !== state.sel) { state.sel = best; render(); }
    });

    render();
    var rt = null;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(render, 120); });
  }

  function init() {
    var nodes = document.querySelectorAll('[data-widget="3d-gui-agent-landscape"]');
    for (var i = 0; i < nodes.length; i++) build(nodes[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
