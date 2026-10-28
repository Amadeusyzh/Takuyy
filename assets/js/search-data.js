
const currentUrl = window.location.href;
const siteUrl = "https://amadeusyzh.github.io";
let updatedUrl = currentUrl.replace("https://amadeusyzh.github.io/Takuyy", "");
if (currentUrl.length == updatedUrl.length && currentUrl.startsWith("http://127.0.0.1")) {
  const otherSiteUrl = siteUrl.replace("localhost", "127.0.0.1");
  updatedUrl = currentUrl.replace(otherSiteUrl + "/Takuyy", "");
}
if ("".length > 0) {
  updatedUrl = updatedUrl.replace("/", "");
}
// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-about",
    title: "about",
    section: "Navigation menu",
    handler: () => {
      window.location.href = "/Takuyy/";
    },
  },{id: "nav-publications",
          title: "publications",
          description: "Publications in reverse chronological order. * denotes equal contribution.",
          section: "Navigation menu",
          handler: () => {
            window.location.href = "/Takuyy/publications/";
          },
        },{id: "nav-blog",
          title: "blog",
          description: "Notes on research, papers I read, and things I learn.",
          section: "Navigation menu",
          handler: () => {
            window.location.href = "/Takuyy/blog/";
          },
        },{id: "nav-cv",
          title: "cv",
          description: "Download the PDF version with the button on the right.",
          section: "Navigation menu",
          handler: () => {
            window.location.href = "/Takuyy/cv/";
          },
        },{id: "post-learning-roadmap-from-computer-graphics-to-3d-gaussian-splatting-world-models-and-embodied-ai",
        
          title: "Learning roadmap: from computer graphics to 3D Gaussian Splatting, world models and embodied...",
        
        description: "The map of this blog: four series, in order, with what to learn at each stage.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/roadmap-01-learning-roadmap/";
          
        },
      },{id: "post-embodied-ai-meets-xr-and-hci-humans-as-data-operators-and-partners",
        
          title: "Embodied AI meets XR and HCI: humans as data, operators and partners",
        
        description: "Human motion capture and wearable sensing, egocentric data (Ego4D, Project Aria), VR/AR teleoperation for robot data collection, human-robot interaction, digital twins and mixed-reality interfaces, and research opportunities where embodied AI, world models, AR/VR, HCI and graphics meet.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/embodied-ai-06-embodied-ai-meets-xr-and-hci/";
          
        },
      },{id: "post-vision-language-action-models-rt-2-openvla-pi0-gr00t-and-gemini-robotics",
        
          title: "Vision-Language-Action models: RT-2, OpenVLA, pi0, GR00T and Gemini Robotics",
        
        description: "How robot foundation models are built: from RT-1 and RT-2 to Octo, OpenVLA, pi0/pi0.5, GR00T N1 and Gemini Robotics; action tokenization versus flow-matching heads, cross-embodiment training, evaluation, and how world models enter robot learning.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/embodied-ai-05-vision-language-action-models/";
          
        },
      },{id: "post-imitation-learning-behavior-cloning-dagger-act-and-diffusion-policy",
        
          title: "Imitation learning: behavior cloning, DAgger, ACT and Diffusion Policy",
        
        description: "Learning robot skills from demonstrations: covariate shift and DAgger, action chunking with transformers (ACT/ALOHA), Diffusion Policy, data collection with teleoperation and UMI, and large cross-embodiment datasets, with a runnable diffusion-policy training example.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/embodied-ai-04-imitation-learning/";
          
        },
      },{id: "post-simulation-platforms-for-embodied-ai-mujoco-isaac-habitat-maniskill-genesis",
        
          title: "Simulation platforms for embodied AI: MuJoCo, Isaac, Habitat, ManiSkill, Genesis",
        
        description: "What a robotics simulator actually computes (dynamics, contacts, rendering, sensors), a tour of today&#39;s platforms and benchmarks, differentiable and GPU-parallel simulation, and a hands-on MuJoCo/MJX example.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/embodied-ai-03-simulation-platforms/";
          
        },
      },{id: "post-reinforcement-learning-for-robots-from-mdps-to-ppo-sac-and-sim-to-real",
        
          title: "Reinforcement learning for robots: from MDPs to PPO, SAC and sim-to-real",
        
        description: "MDPs, value functions, policy gradients, PPO and SAC, reward design, domain randomization and the legged-locomotion results that made sim-to-real RL mainstream, with a compact PyTorch PPO.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/embodied-ai-02-reinforcement-learning-for-robots/";
          
        },
      },{id: "post-robotics-foundations-transforms-kinematics-control-and-planning",
        
          title: "Robotics foundations: transforms, kinematics, control and planning",
        
        description: "SE(3), forward and inverse kinematics, Jacobians, a first look at dynamics, PID and impedance control, and A*/RRT planning, with NumPy code for a 3-link arm.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/embodied-ai-01-robotics-foundations/";
          
        },
      },{id: "post-predict-don-39-t-generate-jepa-evaluating-world-models-and-open-problems",
        
          title: "Predict, don&#39;t generate? JEPA, evaluating world models, and open problems",
        
        description: "LeCun&#39;s path towards autonomous machine intelligence, I-JEPA, V-JEPA and V-JEPA 2, the predictive-vs-generative debate, how world models are evaluated (physics, controllability, planning), and the open problems that lead into embodied AI.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/world-models-05-jepa-evaluation-and-open-problems/";
          
        },
      },{id: "post-explicit-worlds-3d-and-4d-world-generation",
        
          title: "Explicit worlds: 3D and 4D world generation",
        
        description: "Generating explicit 3D and 4D worlds: score distillation (DreamFusion, VSD), multi-view diffusion, scene growing with inpainting and depth (Text2Room, LucidDreamer, WonderJourney, WonderWorld), Gaussian scene generation, 4D generation, World Labs&#39; Marble, and the trade-offs against pixel-space video world models.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/world-models-04-3d-and-4d-world-generation/";
          
        },
      },{id: "post-video-generation-as-world-simulation-sora-genie-gamengen-and-beyond",
        
          title: "Video generation as world simulation: Sora, Genie, GameNGen and beyond",
        
        description: "How video generators became interactive world simulators: the Sora report, Genie 1-3, GameNGen, UniSim, GAIA-1, NVIDIA Cosmos, latent action models, and the open problems of memory, consistency and physics.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/world-models-03-video-world-simulators/";
          
        },
      },{id: "post-the-generative-toolkit-vaes-tokenizers-transformers-diffusion-and-flow-matching",
        
          title: "The generative toolkit: VAEs, tokenizers, Transformers, diffusion and flow matching",
        
        description: "The generative models modern world models are built from: VAE and ELBO, VQ-VAE tokenizers, autoregressive Transformers, DDPM, the score/SDE view, DDIM, latent diffusion, classifier-free guidance, flow matching and DiT, with runnable PyTorch.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/world-models-02-generative-modeling-foundations/";
          
        },
      },{id: "post-what-is-a-world-model-from-dyna-to-dreamer-and-muzero",
        
          title: "What is a world model? From Dyna to Dreamer and MuZero",
        
        description: "Definitions and history of world models: MDPs, model-based RL, Ha &amp; Schmidhuber&#39;s World Models, PlaNet, Dreamer V1-V3 and MuZero, with a PyTorch RSSM and imagination rollouts.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/world-models-01-what-is-a-world-model/";
          
        },
      },{id: "post-from-phone-capture-to-vr-a-hands-on-3d-gaussian-splatting-tutorial",
        
          title: "From phone capture to VR: a hands-on 3D Gaussian Splatting tutorial",
        
        description: "A practical, step-by-step workflow: capture photos or video, run COLMAP, train 3DGS with the official code, gsplat or nerfstudio splatfacto, clean and export the .ply, and view it on the web and in a VR headset, with common failure modes and fixes.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/neural-rendering-06-capture-to-vr-tutorial/";
          
        },
      },{id: "post-beyond-3dgs-a-map-of-the-gaussian-splatting-frontier",
        
          title: "Beyond 3DGS: a map of the Gaussian splatting frontier",
        
        description: "A structured survey of what came after 3D Gaussian Splatting: anti-aliasing, surfaces, dynamic scenes, compression, SLAM, feed-forward reconstruction, generation, relighting, physics, semantics and AR/VR, with the key idea and representative papers of each direction.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/neural-rendering-05-3dgs-frontiers/";
          
        },
      },{id: "post-3d-gaussian-splatting-end-to-end",
        
          title: "3D Gaussian Splatting, end to end",
        
        description: "The complete 3DGS method: Gaussian parameters, covariance from rotation and scale, EWA projection with the Jacobian, the 0.3 low-pass, tile-based differentiable rasterization, alpha blending and gradients, adaptive density control and the training recipe, with Python code.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/neural-rendering-04-3d-gaussian-splatting/";
          
        },
      },{id: "post-fast-radiance-fields-grids-tensors-and-hash-encodings",
        
          title: "Fast radiance fields: grids, tensors and hash encodings",
        
        description: "Why NeRF is slow and how explicit and hybrid representations fixed it: Plenoxels, DVGO, TensoRF, Instant-NGP&#39;s multiresolution hash encoding (with PyTorch code), Zip-NeRF, and the nerfstudio toolbox.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/neural-rendering-03-fast-radiance-fields/";
          
        },
      },{id: "post-nerf-neural-radiance-fields-and-differentiable-volume-rendering",
        
          title: "NeRF: neural radiance fields and differentiable volume rendering",
        
        description: "The volume rendering equation and its quadrature, positional encoding, the NeRF MLP, hierarchical sampling and the photometric loss, with a minimal PyTorch NeRF and the follow-ups Mip-NeRF, Mip-NeRF 360 and NeRF in the Wild.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/neural-rendering-02-nerf/";
          
        },
      },{id: "post-cameras-and-multi-view-geometry-from-pixels-to-poses",
        
          title: "Cameras and multi-view geometry: from pixels to poses",
        
        description: "Pinhole cameras, intrinsics and extrinsics, lens distortion, epipolar geometry, the eight-point algorithm, triangulation, bundle adjustment, Structure-from-Motion with COLMAP and multi-view stereo, with NumPy code.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/neural-rendering-01-cameras-and-multiview-geometry/";
          
        },
      },{id: "post-physically-based-simulation-particles-cloth-pbd-and-xpbd",
        
          title: "Physically based simulation: particles, cloth, PBD and XPBD",
        
        description: "Time integrators, mass-spring cloth, Position Based Dynamics and a full derivation of XPBD, with a NumPy cloth solver, plus a tour of rigid bodies and particle fluids.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/graphics-07-physically-based-simulation/";
          
        },
      },{id: "post-real-time-ray-tracing-rt-hardware-denoising-restir-and-neural-caches",
        
          title: "Real-time ray tracing: RT hardware, denoising, ReSTIR and neural caches",
        
        description: "How games path trace at one sample per pixel: acceleration structures and RT cores, hybrid pipelines, temporal reuse, à-trous/SVGF denoising, ReSTIR resampling, TAA, DLSS and neural radiance caching.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/graphics-06-real-time-ray-tracing/";
          
        },
      },{id: "post-ray-tracing-and-path-tracing-from-intersections-to-unbiased-global-illumination",
        
          title: "Ray tracing and path tracing: from intersections to unbiased global illumination",
        
        description: "Ray-sphere and Möller-Trumbore intersection, BVHs with the SAH, Monte Carlo integration, importance sampling, Russian roulette, next-event estimation and MIS, ending in a compact NumPy path tracer.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/graphics-05-ray-and-path-tracing/";
          
        },
      },{id: "post-physically-based-rendering-radiometry-the-rendering-equation-and-ggx",
        
          title: "Physically based rendering: radiometry, the rendering equation and GGX",
        
        description: "From watts to radiance, the rendering equation, BRDF properties, the GGX microfacet model, the metallic-roughness workflow and split-sum image-based lighting, with numerical checks and a GLSL shader.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/graphics-04-physically-based-rendering/";
          
        },
      },{id: "post-shading-and-textures-lighting-models-normal-maps-filtering-and-shadows",
        
          title: "Shading and textures: lighting models, normal maps, filtering and shadows",
        
        description: "Lambert, Phong and Blinn-Phong, flat/Gouraud/Phong shading, UVs and tangent space, mipmaps and anisotropic filtering, and shadow mapping with bias and PCF, with NumPy and GLSL code.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/graphics-03-shading-and-textures/";
          
        },
      },{id: "post-rasterization-from-triangles-to-pixels",
        
          title: "Rasterization: from triangles to pixels",
        
        description: "The MVP pipeline, the perspective matrix derived step by step, clipping, edge functions, perspective-correct interpolation, the z-buffer and anti-aliasing, plus a complete software rasterizer in NumPy.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/graphics-02-rasterization/";
          
        },
      },{id: "post-the-graphics-roadmap-and-the-math-toolkit",
        
          title: "The graphics roadmap and the math toolkit",
        
        description: "Where computer graphics goes from here to neural rendering, and the linear algebra you need first: vectors, homogeneous coordinates, rotations, coordinate spaces and normals.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/graphics-01-roadmap-and-math/";
          
        },
      },{id: "post-hello-world",
        
          title: "Hello World",
        
        description: "My personal website is live.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/Takuyy/blog/2026/hello-world/";
          
        },
      },{id: "news-launched-my-personal-website-check-out-the-blog",
          title: 'Launched my personal website — check out the blog.',
          description: "",
          section: "News",},{
        id: 'social-cv',
        title: 'CV',
        section: 'Socials',
        handler: () => {
          window.open("/Takuyy/assets/pdf/en-us//assets/pdf/[LANG]/cv.pdf", "_blank");
        },
      },{
        id: 'social-github',
        title: 'GitHub',
        section: 'Socials',
        handler: () => {
          window.open("https://github.com/Amadeusyzh", "_blank");
        },
      },{
        id: 'social-rss',
        title: 'RSS Feed',
        section: 'Socials',
        handler: () => {
          window.open("/Takuyy/feed.xml", "_blank");
        },
      },{
        id: 'social-scholar',
        title: 'Google Scholar',
        section: 'Socials',
        handler: () => {
          window.open("https://scholar.google.com/citations?user=8wyZlsEAAAAJ", "_blank");
        },
      },{
          id: 'lang-zh-cn',
          title: 'zh-cn',
          section: 'Languages',
          handler: () => {
            window.location.href = "/Takuyy/zh-cn" + updatedUrl;
          },
        },{
          id: 'lang-ja-jp',
          title: 'ja-jp',
          section: 'Languages',
          handler: () => {
            window.location.href = "/Takuyy/ja-jp" + updatedUrl;
          },
        },{
      id: 'light-theme',
      title: 'Change theme to light',
      description: 'Change the theme of the site to Light',
      section: 'Theme',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: 'Change theme to dark',
      description: 'Change the theme of the site to Dark',
      section: 'Theme',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: 'Use system default theme',
      description: 'Change the theme of the site to System Default',
      section: 'Theme',
      handler: () => {
        setThemeSetting("system");
      },
    },];
