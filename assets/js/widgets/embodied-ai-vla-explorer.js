/* Embodied AI post 05: interactive family tree and timeline of VLA and robot foundation models, 2023-2026.
   Every entry was checked against its arXiv page, official blog or repository (as of November 2026).
   Colour = action head, filled marker = open weights, grey curves = "builds on".
   Filters fade non-matching entries; tap or click an entry to see its summary, status and link.
   Plain JS + Canvas 2D, no dependencies, ASCII only. */
(function () {
  "use strict";
  var NAME = "embodied-ai-vla-explorer";
  var TXT = {
    en: { head: "Action head", all: "All", tok: "Tokens", diff: "Diffusion", flow: "Flow", other: "Other",
      open: "Open weights only", emb: "Embodiment", arm: "Arm", bi: "Bimanual", hum: "Humanoid", mob: "Mobile",
      tap: "Tap a model for details. Colour = action head, filled = open weights.", status: "Status", link: "Open link",
      parent: "builds on", shown: "shown", openw: "open weights", closedw: "closed weights",
      lanes: ["DeepMind", "Phys. Intell.", "NVIDIA", "Academia", "Industry", "World+action"],
      heads: { tok: "discrete tokens", diff: "diffusion", flow: "flow matching", other: "other / regression" } },
    zh: { head: "\u52a8\u4f5c\u5934", all: "\u5168\u90e8", tok: "\u79bb\u6563 token", diff: "\u6269\u6563", flow: "\u6d41\u5339\u914d", other: "\u5176\u4ed6",
      open: "\u4ec5\u5f00\u653e\u6743\u91cd", emb: "\u672c\u4f53", arm: "\u673a\u68b0\u81c2", bi: "\u53cc\u81c2", hum: "\u4eba\u5f62", mob: "\u79fb\u52a8",
      tap: "\u70b9\u51fb\u6a21\u578b\u67e5\u770b\u8be6\u60c5\u3002\u989c\u8272 = \u52a8\u4f5c\u5934\uff0c\u5b9e\u5fc3 = \u5f00\u653e\u6743\u91cd\u3002",
      status: "\u72b6\u6001", link: "\u6253\u5f00\u94fe\u63a5", parent: "\u57fa\u4e8e", shown: "\u663e\u793a",
      openw: "\u5f00\u653e\u6743\u91cd", closedw: "\u672a\u5f00\u653e\u6743\u91cd",
      lanes: ["DeepMind", "Phys. Intell.", "NVIDIA", "\u5b66\u672f\u754c", "\u5de5\u4e1a\u754c", "\u4e16\u754c+\u52a8\u4f5c"],
      heads: { tok: "\u79bb\u6563 token", diff: "\u6269\u6563", flow: "\u6d41\u5339\u914d", other: "\u5176\u4ed6 / \u56de\u5f52" } },
    ja: { head: "\u30a2\u30af\u30b7\u30e7\u30f3\u30d8\u30c3\u30c9", all: "\u3059\u3079\u3066", tok: "\u96e2\u6563\u30c8\u30fc\u30af\u30f3", diff: "\u62e1\u6563",
      flow: "\u30d5\u30ed\u30fc", other: "\u305d\u306e\u4ed6",
      open: "\u30aa\u30fc\u30d7\u30f3\u30a6\u30a7\u30a4\u30c8\u306e\u307f", emb: "\u8eab\u4f53", arm: "\u30a2\u30fc\u30e0", bi: "\u53cc\u8155",
      hum: "\u30d2\u30e5\u30fc\u30de\u30ce\u30a4\u30c9", mob: "\u79fb\u52d5",
      tap: "\u30e2\u30c7\u30eb\u3092\u30bf\u30c3\u30d7\u3059\u308b\u3068\u8a73\u7d30\u3092\u8868\u793a\u3002\u8272 = \u30a2\u30af\u30b7\u30e7\u30f3\u30d8\u30c3\u30c9\u3001\u5857\u308a\u3064\u3076\u3057 = \u30aa\u30fc\u30d7\u30f3\u30a6\u30a7\u30a4\u30c8\u3002",
      status: "\u72b6\u614b", link: "\u30ea\u30f3\u30af\u3092\u958b\u304f", parent: "\u6d3e\u751f\u5143", shown: "\u8868\u793a\u4e2d",
      openw: "\u30aa\u30fc\u30d7\u30f3\u30a6\u30a7\u30a4\u30c8", closedw: "\u975e\u516c\u958b\u30a6\u30a7\u30a4\u30c8",
      lanes: ["DeepMind", "Phys. Intell.", "NVIDIA", "\u5b66\u8853", "\u7523\u696d", "\u4e16\u754c+\u884c\u52d5"],
      heads: { tok: "\u96e2\u6563\u30c8\u30fc\u30af\u30f3", diff: "\u62e1\u6563", flow: "\u30d5\u30ed\u30fc\u30de\u30c3\u30c1\u30f3\u30b0", other: "\u305d\u306e\u4ed6 / \u56de\u5e30" } }
  };
  var SEP = " " + String.fromCharCode(0xb7) + " ";
  var COL = { tok: "#1f77b4", diff: "#ff7f0e", flow: "#2ca02c", other: "#9467bd" };

  /* id, short label, lane (0 DeepMind, 1 Physical Intelligence, 2 NVIDIA, 3 academia, 4 other industry, 5 world-action models),
     date (first arXiv version or official announcement, YYYY-MM), action head, open weights (1/0),
     embodiments (arm, bi, hum, mob), parents (ids), full name, status, link, summary */
  var DATA = [
/*DATA-BEGIN*/
    { id: "rt1", s: "RT-1", lane: 0, date: "2022-12", head: "tok", open: 0, emb: ["arm", "mob"], par: [], name: "RT-1: Robotics Transformer for real-world control at scale", org: "Google", status: "RSS 2023", link: "https://arxiv.org/abs/2212.06817",
      sum: "Transformer policy trained on about 130k real episodes from 13 mobile manipulators; 256-bin discretized actions. Showed that data scale and diversity drive generalization." },
    { id: "rt2", s: "RT-2", lane: 0, date: "2023-07", head: "tok", open: 0, emb: ["arm", "mob"], par: ["rt1"], name: "RT-2: Vision-language-action models transfer web knowledge to robotic control", org: "Google DeepMind", status: "CoRL 2023", link: "https://arxiv.org/abs/2307.15818",
      sum: "Coined the term VLA: a large VLM co-fine-tuned on web and robot data that writes actions as text tokens, so web concepts transfer to robot instructions." },
    { id: "rtx", s: "RT-X", lane: 0, date: "2023-10", head: "tok", open: 1, emb: ["arm", "bi", "mob"], par: ["rt1", "rt2"], name: "Open X-Embodiment: robotic learning datasets and RT-X models", org: "Open X-Embodiment Collaboration", status: "ICRA 2024", link: "https://arxiv.org/abs/2310.08864",
      sum: "Pooled 60 datasets (22 robot types, 1M+ trajectories) into one format and trained RT-1-X / RT-2-X; RT-1-X checkpoints were released. The data underlies Octo and OpenVLA." },
    { id: "gr", s: "Gemini Rob.", lane: 0, date: "2025-03", head: "other", open: 0, emb: ["bi"], par: ["rt2"], name: "Gemini Robotics: bringing AI into the physical world", org: "Google DeepMind", status: "arXiv technical report", link: "https://arxiv.org/abs/2503.20020",
      sum: "VLA built on Gemini 2.0 with a cloud backbone and a local action decoder, plus Gemini Robotics-ER for embodied reasoning (pointing, 3D boxes, grasps). Action-head details are not disclosed." },
    { id: "grod", s: "On-Device", lane: 0, date: "2025-06", head: "other", open: 0, emb: ["bi"], par: ["gr"], name: "Gemini Robotics On-Device", org: "Google DeepMind", status: "announcement (trusted testers)", link: "https://deepmind.google/blog/gemini-robotics-on-device-brings-ai-to-local-robotic-devices/",
      sum: "A VLA that runs locally without a network; the first DeepMind VLA offered for fine-tuning (50-100 demonstrations), with an SDK and MuJoCo testing." },
    { id: "gr15", s: "GR 1.5", lane: 0, date: "2025-10", head: "other", open: 0, emb: ["bi", "hum"], par: ["gr"], name: "Gemini Robotics 1.5", org: "Google DeepMind", status: "arXiv technical report", link: "https://arxiv.org/abs/2510.03342",
      sum: "Thinks in text before acting and transfers motions between embodiments; Gemini Robotics-ER 1.5 acts as an orchestrator that calls the VLA as a tool." },
    { id: "gr2", s: "GR 2", lane: 0, date: "2026-07", head: "other", open: 0, emb: ["hum", "bi"], par: ["gr15", "grod"], name: "Gemini Robotics 2 (GR 2, ER 2, On-Device 2)", org: "Google DeepMind", status: "announcement; early-access partners, ER 2 preview", link: "https://deepmind.google/blog/gemini-robotics-2-brings-whole-body-intelligence-to-robots/",
      sum: "Moves from tabletop to whole-body humanoid control (e.g. Apptronik Apollo 2); ER 2 coordinates several robots over multi-minute tasks; On-Device 2 adapts to a new bi-arm body with fewer than 200 examples." },
    { id: "pi0", s: "pi0", lane: 1, date: "2024-10", head: "flow", open: 1, emb: ["arm", "bi", "mob"], par: ["rt2"], name: "pi0: a vision-language-action flow model for general robot control", org: "Physical Intelligence", status: "RSS 2025", link: "https://arxiv.org/abs/2410.24164",
      sum: "PaliGemma VLM plus a 300M flow-matching action expert that outputs 50-step continuous action chunks; laundry folding and other dexterous long-horizon tasks. Weights in openpi." },
    { id: "fast", s: "pi0-FAST", lane: 1, date: "2025-01", head: "tok", open: 1, emb: ["arm", "bi", "mob"], par: ["pi0"], name: "FAST: efficient action tokenization for vision-language-action models", org: "Physical Intelligence", status: "RSS 2025", link: "https://arxiv.org/abs/2501.09747",
      sum: "DCT + quantization + BPE turns a smooth action chunk into a few tokens, so an autoregressive VLA (pi0-FAST) trains on high-frequency data." },
    { id: "pi05", s: "pi0.5", lane: 1, date: "2025-04", head: "flow", open: 1, emb: ["mob", "bi"], par: ["pi0", "fast"], name: "pi0.5: a vision-language-action model with open-world generalization", org: "Physical Intelligence", status: "CoRL 2025", link: "https://arxiv.org/abs/2504.16054",
      sum: "Co-trained on many robots, web data and subtask labels; predicts a text subtask, then actions; cleans kitchens and bedrooms in unseen homes." },
    { id: "ki", s: "KI", lane: 1, date: "2025-05", head: "flow", open: 0, emb: ["arm", "bi", "mob"], par: ["pi05"], name: "Knowledge insulating vision-language-action models: train fast, run fast, generalize better", org: "Physical Intelligence", status: "NeurIPS 2025", link: "https://arxiv.org/abs/2505.23705",
      sum: "The VLM backbone learns from FAST tokens and web data while the flow-matching action expert's gradients are stopped before the backbone, keeping semantic knowledge and fast inference." },
    { id: "pi06", s: "pi*0.6", lane: 1, date: "2025-11", head: "flow", open: 0, emb: ["bi", "mob"], par: ["pi05", "ki"], name: "pi*0.6: a VLA that learns from experience (Recap)", org: "Physical Intelligence", status: "arXiv preprint", link: "https://arxiv.org/abs/2511.14759",
      sum: "Recap: a learned value function scores demonstrations, corrections and autonomous rollouts, and the VLA is conditioned on the advantage; reported to more than double throughput on hard tasks such as espresso making." },
    { id: "pi07", s: "pi0.7", lane: 1, date: "2026-04", head: "flow", open: 0, emb: ["bi", "mob", "arm"], par: ["pi06"], name: "pi0.7: a steerable generalist robotic foundation model with emergent capabilities", org: "Physical Intelligence", status: "arXiv preprint", link: "https://arxiv.org/abs/2604.15483",
      sum: "The prompt carries language, episode metadata (quality, speed), control modality and subgoal images, so mixed-quality and non-robot data can be used; reports zero-shot cross-embodiment laundry folding. Head marked flow by lineage (not detailed in the abstract)." },
    { id: "n1", s: "GR00T N1", lane: 2, date: "2025-03", head: "flow", open: 1, emb: ["hum", "bi"], par: [], name: "GR00T N1: an open foundation model for generalist humanoid robots", org: "NVIDIA", status: "arXiv preprint", link: "https://arxiv.org/abs/2503.14734",
      sum: "Dual system: Eagle-2 VLM (System 2) plus a flow-matching diffusion transformer (System 1); trained on a pyramid of web/human video, synthetic and real robot data." },
    { id: "n15", s: "N1.5", lane: 2, date: "2025-06", head: "flow", open: 1, emb: ["hum", "arm"], par: ["n1", "dreamgen"], name: "GR00T N1.5", org: "NVIDIA GEAR", status: "model release", link: "https://research.nvidia.com/labs/gear/gr00t-n1_5/",
      sum: "Frozen Eagle 2.5 VLM, a FLARE future-latent alignment loss, and DreamGen neural trajectories in pre-training." },
    { id: "n16", s: "N1.6", lane: 2, date: "2025-12", head: "flow", open: 1, emb: ["hum", "bi"], par: ["n15"], name: "GR00T N1.6", org: "NVIDIA GEAR", status: "model release", link: "https://research.nvidia.com/labs/gear/gr00t-n1_6/",
      sum: "Cosmos-based 2B VLM with its top layers unfrozen, a 32-layer action DiT, state-relative action chunks and several thousand more hours of teleoperation." },
    { id: "n17", s: "N1.7", lane: 2, date: "2026-03", head: "flow", open: 1, emb: ["hum"], par: ["n16"], name: "Isaac GR00T N1.7", org: "NVIDIA", status: "model release (GitHub)", link: "https://github.com/NVIDIA/Isaac-GR00T",
      sum: "Cosmos-Reason2-2B backbone; adds about 20k hours of egocentric human video (EgoScale) and a relative end-effector action space shared by humans and robots." },
    { id: "octo", s: "Octo", lane: 3, date: "2024-05", head: "diff", open: 1, emb: ["arm", "bi"], par: ["rtx"], name: "Octo: an open-source generalist robot policy", org: "Octo Model Team (UC Berkeley, Stanford, CMU, Google DeepMind)", status: "RSS 2024", link: "https://arxiv.org/abs/2405.12213",
      sum: "27M/93M transformer trained from scratch on 800k OXE trajectories with a diffusion head; designed for easy fine-tuning to new sensors and action spaces." },
    { id: "openvla", s: "OpenVLA", lane: 3, date: "2024-06", head: "tok", open: 1, emb: ["arm"], par: ["rtx", "rt2"], name: "OpenVLA: an open-source vision-language-action model", org: "Stanford, UC Berkeley, TRI, Google DeepMind and others", status: "CoRL 2024", link: "https://arxiv.org/abs/2406.09246",
      sum: "Open 7B RT-2 analogue (Llama 2 + DINOv2 + SigLIP) emitting 256-bin action tokens; LoRA fine-tuning on one GPU." },
    { id: "rdt", s: "RDT-1B", lane: 3, date: "2024-10", head: "diff", open: 1, emb: ["bi"], par: [], name: "RDT-1B: a diffusion foundation model for bimanual manipulation", org: "Tsinghua University", status: "ICLR 2025", link: "https://arxiv.org/abs/2410.07864",
      sum: "1.2B diffusion transformer over a physically interpretable unified action space for many robots." },
    { id: "oft", s: "OpenVLA-OFT", lane: 3, date: "2025-02", head: "other", open: 1, emb: ["arm", "bi"], par: ["openvla"], name: "Fine-tuning vision-language-action models: optimizing speed and success", org: "Stanford", status: "RSS 2025", link: "https://arxiv.org/abs/2502.19645",
      sum: "Parallel decoding of action chunks and continuous actions with an L1 regression loss: higher success and much faster inference than token-by-token OpenVLA." },
    { id: "univla", s: "UniVLA", lane: 3, date: "2025-05", head: "tok", open: 1, emb: ["arm", "mob"], par: [], name: "UniVLA: learning to act anywhere with task-centric latent actions", org: "OpenDriveLab (HKU) and others", status: "RSS 2025", link: "https://arxiv.org/abs/2505.06111",
      sum: "A latent action model in DINO feature space learns discrete task-centric actions from internet video; a small decoder maps them to each robot." },
    { id: "xvla", s: "X-VLA", lane: 3, date: "2025-10", head: "flow", open: 1, emb: ["arm", "bi"], par: [], name: "X-VLA: soft-prompted transformer as scalable cross-embodiment VLA", org: "Tsinghua AIR and others", status: "ICLR 2026", link: "https://arxiv.org/abs/2510.10274",
      sum: "A 0.9B plain transformer with flow matching; one learnable soft-prompt embedding per data source absorbs embodiment differences." },
    { id: "rdt2", s: "RDT2", lane: 3, date: "2026-02", head: "flow", open: 1, emb: ["bi", "arm"], par: ["rdt"], name: "RDT2: exploring the scaling limit of UMI data towards zero-shot cross-embodiment generalization", org: "Tsinghua University", status: "ICML 2026", link: "https://arxiv.org/abs/2602.03310",
      sum: "7B VLM trained on more than 10k hours of UMI handheld-gripper demonstrations (RVQ token and flow-matching variants) and deployed zero-shot on unseen robots." },
    { id: "molmoact2", s: "MolmoAct2", lane: 3, date: "2026-05", head: "flow", open: 1, emb: ["bi", "arm"], par: ["fast"], name: "MolmoAct2: action reasoning models for real-world deployment", org: "Ai2 and University of Washington", status: "arXiv preprint", link: "https://arxiv.org/abs/2605.02881",
      sum: "Fully open model, data (720 h bimanual) and OpenFAST tokenizer; flow-matching expert reading per-layer KV of the backbone." },
    { id: "helix", s: "Helix", lane: 4, date: "2025-02", head: "other", open: 0, emb: ["hum"], par: [], name: "Helix: a vision-language-action model for generalist humanoid control", org: "Figure AI", status: "announcement", link: "https://www.figure.ai/news/helix",
      sum: "System 2 (7B VLM, 7-9 Hz) passes a latent to System 1 (80M transformer, 200 Hz) that controls the whole upper body; runs on board." },
    { id: "helix02", s: "Helix 02", lane: 4, date: "2026-01", head: "other", open: 0, emb: ["hum"], par: ["helix"], name: "Helix 02: full-body autonomy", org: "Figure AI", status: "announcement", link: "https://www.figure.ai/news/helix-02",
      sum: "Adds System 0, a learned 1 kHz whole-body controller trained on retargeted human motion, plus palm cameras and touch." },
    { id: "helix25", s: "Helix 2.5", lane: 4, date: "2026-09", head: "other", open: 0, emb: ["hum"], par: ["helix02"], name: "Helix 2.5: zero-shot 30-home generalization", org: "Figure AI", status: "announcement", link: "https://www.figure.ai/news/helix-2-5-zero-shot-30-home-generalization",
      sum: "Retrained with human-behaviour pre-training and evaluated zero-shot in 30 unseen homes." },
    { id: "smolvla", s: "SmolVLA", lane: 4, date: "2025-06", head: "flow", open: 1, emb: ["arm"], par: ["pi0"], name: "SmolVLA: a vision-language-action model for affordable and efficient robotics", org: "Hugging Face", status: "arXiv preprint", link: "https://arxiv.org/abs/2506.01844",
      sum: "About 0.45B parameters, flow-matching expert, trained on community LeRobot datasets; runs on consumer hardware." },
    { id: "gr3", s: "GR-3", lane: 4, date: "2025-07", head: "flow", open: 0, emb: ["bi", "mob"], par: [], name: "GR-3 technical report", org: "ByteDance Seed", status: "arXiv technical report", link: "https://arxiv.org/abs/2507.15493",
      sum: "About 4B parameters (Qwen2.5-VL + flow-matching DiT), co-trained on web data, VR human trajectories and robot data on a bimanual mobile robot." },
    { id: "wall", s: "WALL-OSS", lane: 4, date: "2025-09", head: "flow", open: 1, emb: ["bi", "arm"], par: [], name: "Igniting VLMs toward the embodied space (WALL-OSS)", org: "X Square Robot", status: "arXiv preprint", link: "https://arxiv.org/abs/2509.11766",
      sum: "Unified cross-level chain of thought links instruction reasoning, subgoals and actions; released in flow-matching and FAST variants." },
    { id: "dreamgen", s: "DreamGen", lane: 5, date: "2025-05", head: "other", open: 1, emb: ["hum", "arm"], par: [], name: "DreamGen: unlocking generalization in robot learning through video world models", org: "NVIDIA", status: "CoRL 2025", link: "https://arxiv.org/abs/2505.12705",
      sum: "Data pipeline, not a policy: fine-tuned video models dream new behaviours, and inverse dynamics labels them as neural trajectories for training." },
    { id: "vjepa2", s: "V-JEPA 2-AC", lane: 5, date: "2025-06", head: "other", open: 1, emb: ["arm"], par: [], name: "V-JEPA 2: self-supervised video models enable understanding, prediction and planning", org: "Meta FAIR", status: "arXiv preprint", link: "https://arxiv.org/abs/2506.09985",
      sum: "Latent action-conditioned predictor trained on 62 h of DROID video; plans actions by optimizing in embedding space toward a goal image (no action head)." },
    { id: "unified", s: "UniVLA-AR", lane: 5, date: "2025-06", head: "tok", open: 0, emb: ["arm", "bi"], par: [], name: "Unified vision-language-action model", org: "CASIA and others", status: "ICLR 2026", link: "https://arxiv.org/abs/2506.19850",
      sum: "One autoregressive model over vision, language and action tokens, post-trained as a world model on video. (Weights not checked.)" },
    { id: "worldvla", s: "WorldVLA", lane: 5, date: "2025-06", head: "tok", open: 0, emb: ["arm"], par: [], name: "WorldVLA: towards autoregressive action world model", org: "Alibaba DAMO and others", status: "arXiv preprint", link: "https://arxiv.org/abs/2506.21539",
      sum: "Predicts both actions and future images in one autoregressive model; an attention mask over earlier actions limits error build-up in action chunks. (Weights not checked.)" },
    { id: "ge", s: "Genie Env.", lane: 5, date: "2025-08", head: "flow", open: 0, emb: ["bi"], par: [], name: "Genie Envisioner: a unified world foundation platform for robotic manipulation", org: "AgiBot and others", status: "arXiv preprint", link: "https://arxiv.org/abs/2508.05635",
      sum: "GE-Base video diffusion world model, GE-Act flow-matching action decoder on its latents, GE-Sim neural simulator and the EWMBench benchmark." },
    { id: "cosmospol", s: "Cosmos Policy", lane: 5, date: "2026-01", head: "diff", open: 1, emb: ["arm"], par: [], name: "Cosmos Policy: fine-tuning video models for visuomotor control and planning", org: "NVIDIA and Stanford", status: "ICLR 2026", link: "https://arxiv.org/abs/2601.16163",
      sum: "Fine-tunes the Cosmos-Predict2 video model so actions, future states and values are latent frames: one network is policy, world model and value function." },
    { id: "dreamzero", s: "DreamZero", lane: 5, date: "2026-02", head: "diff", open: 0, emb: ["arm"], par: ["dreamgen"], name: "World action models are zero-shot policies (DreamZero)", org: "NVIDIA", status: "arXiv preprint", link: "https://arxiv.org/abs/2602.15922",
      sum: "14B autoregressive video-diffusion world action model that jointly generates video and actions, closed loop at 7 Hz; NVIDIA previews GR00T N2 on this design." }
/*DATA-END*/
  ];

  var T0 = 2022 * 12 + 10, T1 = 2026 * 12 + 11;  // Nov 2022 .. Dec 2026
  function monthOf(s) { var p = s.split("-"); return (+p[0]) * 12 + (+p[1]) - 1; }

  function el(tag, css, parent) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (parent) parent.appendChild(n);
    return n;
  }

  function init(root) {
    var lang = root.dataset.lang || "en";
    var T = TXT[lang] || TXT.en;
    root.style.background = "#fafafa";
    root.style.minHeight = "0";
    root.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', sans-serif";
    var bar = el("div", "display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;padding:8px 10px;font-size:13px;color:#222;border-bottom:1px solid #e3e3e3;background:#fff;", root);
    var canvas = el("canvas", "display:block;width:100%;touch-action:manipulation;cursor:default;", root);
    var info = el("div", "padding:10px 12px;font-size:14px;line-height:1.5;color:#222;border-top:1px solid #e3e3e3;background:#fff;min-height:96px;overflow-wrap:anywhere;", root);

    var state = { head: "all", open: false, emb: "all", sel: null };
    var heads = ["all", "tok", "diff", "flow", "other"], hbtn = {};
    el("span", "font-weight:600;", bar).textContent = T.head + ":";
    heads.forEach(function (h) {
      var b = el("button", "padding:2px 8px;border:1px solid #bbb;border-radius:5px;cursor:pointer;font-size:13px;", bar);
      b.textContent = T[h]; hbtn[h] = b;
      if (h !== "all") b.style.borderLeft = "5px solid " + COL[h];
      b.addEventListener("click", function () { state.head = h; refresh(); });
    });
    var lab = el("label", "display:inline-flex;align-items:center;gap:4px;cursor:pointer;", bar);
    var cb = el("input", "", lab); cb.type = "checkbox";
    el("span", "", lab).textContent = T.open;
    cb.addEventListener("change", function () { state.open = cb.checked; refresh(); });
    var lab2 = el("label", "display:inline-flex;align-items:center;gap:4px;", bar);
    el("span", "", lab2).textContent = T.emb + ":";
    var sel = el("select", "font-size:13px;padding:1px 4px;", lab2);
    ["all", "arm", "bi", "hum", "mob"].forEach(function (k) {
      var o = el("option", "", sel); o.value = k; o.textContent = T[k];
    });
    sel.addEventListener("change", function () { state.emb = sel.value; refresh(); });
    var count = el("span", "color:#555;font-variant-numeric:tabular-nums;", bar);

    var byId = {};
    DATA.forEach(function (d) { byId[d.id] = d; d.m = monthOf(d.date); });

    function match(d) {
      if (state.head !== "all" && d.head !== state.head) return false;
      if (state.open && !d.open) return false;
      if (state.emb !== "all" && d.emb.indexOf(state.emb) < 0) return false;
      return true;
    }

    var W = 0, H = 0, dpr = 1, vertical = false, pos = {};
    var PADL = 0, PADT = 0, laneSize = 0, scale = 0;

    function layout() {
      vertical = W < 640;
      var lanes = T.lanes.length;
      if (vertical) {
        PADL = 40; PADT = 34;
        laneSize = (W - PADL - 6) / lanes;
        scale = 13;                                   // px per month
        H = Math.round(PADT + (T1 - T0 + 1) * scale + 10);
      } else {
        PADL = 96; PADT = 8;
        laneSize = 66;
        scale = (W - PADL - 16) / (T1 - T0 + 1);
        H = Math.round(PADT + lanes * laneSize + 30);
      }
      // de-overlap along the time axis inside each lane, keeping the order
      pos = {};
      var minGap = vertical ? 15 : 14;
      for (var L = 0; L < lanes; L++) {
        var items = DATA.filter(function (d) { return d.lane === L; }).sort(function (a, b) { return a.m - b.m; });
        var last = -1e9;
        items.forEach(function (d, i) {
          var t = (d.m - T0 + 0.5) * scale;
          t = Math.max(t, last + minGap); last = t;
          var c = (L + 0.5) * laneSize;
          pos[d.id] = vertical ? { x: PADL + c, y: PADT + t, tier: i % 2 } : { x: PADL + t, y: PADT + c, tier: i % 2 };
        });
      }
    }

    function resize() {
      dpr = window.devicePixelRatio || 1;
      W = root.clientWidth;
      layout();
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = H + "px";
      draw();
    }

    function draw() {
      var g = canvas.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#fafafa"; g.fillRect(0, 0, W, H);
      var lanes = T.lanes.length, L, y;
      // lanes and year grid
      g.font = (vertical ? "11px" : "12px") + " sans-serif";
      for (L = 0; L < lanes; L++) {
        g.fillStyle = L % 2 ? "#f1f1f4" : "#fafafa";
        if (vertical) g.fillRect(PADL + L * laneSize, PADT, laneSize, H - PADT);
        else g.fillRect(0, PADT + L * laneSize, W, laneSize);
        g.fillStyle = "#333";
        if (vertical) {
          g.save(); g.textAlign = "center";
          var words = T.lanes[L].split(" ");
          for (var k = 0; k < words.length; k++) g.fillText(words[k], PADL + (L + 0.5) * laneSize, 13 + 12 * k);
          g.restore();
        } else {
          g.fillText(T.lanes[L], 6, PADT + (L + 0.5) * laneSize + 4);
        }
      }
      g.strokeStyle = "#c8c8c8"; g.lineWidth = 1; g.fillStyle = "#555";
      for (y = 2023; y <= 2027; y++) {
        var t = (y * 12 - T0) * scale;
        g.beginPath();
        if (vertical) { g.moveTo(PADL, PADT + t); g.lineTo(W, PADT + t); }
        else { g.moveTo(PADL + t, PADT); g.lineTo(PADL + t, PADT + lanes * laneSize); }
        g.stroke();
        if (y < 2027) {
          if (vertical) g.fillText(String(y), 3, PADT + t + 14);
          else g.fillText(String(y), PADL + t + 4, PADT + lanes * laneSize + 18);
        }
      }
      // edges
      DATA.forEach(function (d) {
        (d.par || []).forEach(function (pid) {
          var p = byId[pid]; if (!p) return;
          var a = pos[pid], b = pos[d.id];
          var on = match(d) && match(p);
          g.strokeStyle = on ? "rgba(90,90,90,0.55)" : "rgba(90,90,90,0.12)";
          g.lineWidth = (state.sel && (state.sel === d.id || state.sel === pid)) ? 2.5 : 1.3;
          g.beginPath(); g.moveTo(a.x, a.y);
          if (vertical) g.bezierCurveTo(a.x, (a.y + b.y) / 2, b.x, (a.y + b.y) / 2, b.x, b.y);
          else g.bezierCurveTo((a.x + b.x) / 2, a.y, (a.x + b.x) / 2, b.y, b.x, b.y);
          g.stroke();
        });
      });
      // nodes and labels
      var n = 0;
      DATA.forEach(function (d) {
        var p = pos[d.id], on = match(d), c = COL[d.head];
        if (on) n++;
        g.globalAlpha = on ? 1 : 0.15;
        var r = state.sel === d.id ? 8 : 6;
        g.beginPath(); g.arc(p.x, p.y, r, 0, 2 * Math.PI);
        g.fillStyle = d.open ? c : "#fff"; g.fill();
        g.lineWidth = d.open ? 1.2 : 2.5; g.strokeStyle = d.open ? "#222" : c; g.stroke();
        if (state.sel === d.id) { g.beginPath(); g.arc(p.x, p.y, r + 4, 0, 2 * Math.PI); g.lineWidth = 2; g.strokeStyle = "#d62728"; g.stroke(); }
        g.fillStyle = "#111"; g.font = (vertical ? "10.5px" : "11px") + " sans-serif";
        if (vertical) { g.textAlign = "left"; g.fillText(d.s, p.x + 9, p.y + 4); }
        else { g.textAlign = "center"; g.fillText(d.s, p.x, p.tier ? p.y + 19 : p.y - 10); }
        g.textAlign = "left";
      });
      g.globalAlpha = 1;
      count.textContent = n + " / " + DATA.length + " " + T.shown;
      heads.forEach(function (h) {
        hbtn[h].style.background = state.head === h ? "#333" : "#f3f3f3";
        hbtn[h].style.color = state.head === h ? "#fff" : "#222";
      });
    }

    function showInfo() {
      info.textContent = "";
      var d = state.sel && byId[state.sel];
      if (!d) { el("span", "color:#555;", info).textContent = T.tap; return; }
      var h = el("div", "font-weight:700;font-size:15px;", info);
      h.textContent = d.name;
      var meta = el("div", "color:#444;font-size:13px;", info);
      meta.textContent = d.org + SEP + d.date + SEP + T.heads[d.head] + SEP + (d.open ? T.openw : T.closedw) +
        SEP + d.emb.map(function (k) { return T[k]; }).join(", ");
      var st = el("div", "font-size:13px;", info);
      st.textContent = T.status + ": " + d.status;
      if (d.par && d.par.length) {
        var pp = el("div", "font-size:13px;color:#444;", info);
        pp.textContent = T.parent + ": " + d.par.map(function (q) { return byId[q] ? byId[q].s : q; }).join(", ");
      }
      el("div", "margin-top:4px;", info).textContent = d.sum;
      var a = el("a", "display:inline-block;margin-top:4px;", info);
      a.href = d.link; a.target = "_blank"; a.rel = "noopener"; a.textContent = T.link + " " + String.fromCharCode(0x2197);
    }

    function refresh() {
      if (state.sel && !match(byId[state.sel])) state.sel = null;
      draw(); showInfo();
    }

    function hit(ev) {
      var r = canvas.getBoundingClientRect();
      var x = ev.clientX - r.left, y = ev.clientY - r.top, best = null, bd = 18 * 18;
      DATA.forEach(function (d) {
        var p = pos[d.id], dd = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
        if (dd < bd && match(d)) { bd = dd; best = d.id; }
      });
      return best;
    }
    canvas.addEventListener("pointerdown", function (ev) {
      var id = hit(ev);
      if (id) { state.sel = id; draw(); showInfo(); }
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (ev.pointerType === "mouse") canvas.style.cursor = hit(ev) ? "pointer" : "default";
    });

    state.sel = byId.pi0 ? "pi0" : null;
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize);
    resize();
    showInfo();
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-widget="' + NAME + '"]');
    for (var i = 0; i < nodes.length; i++) if (!nodes[i].dataset.ready) { nodes[i].dataset.ready = "1"; init(nodes[i]); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
