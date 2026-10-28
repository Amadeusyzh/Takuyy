
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
          description: "",
          section: "Navigation menu",
          handler: () => {
            window.location.href = "/Takuyy/cv/";
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
