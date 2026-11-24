# Assignment i1 (private): organize the 3D GUI Agent idea into a research program, and write the protected post

## The owner's idea, in their words

> 研究专栏目前是我想到的一个新的课题，名字叫做3D GUI Agent，主要是针对3D UI界面的一个新的交互方式，也就是传统2D终端，
> 如手机的GUI Agent迁移到VR/AR/MR上，以解决交互的时候用户面临的一些问题，如3D界面太过复杂等，从而更好地让3D移动终端能够
> 进入我们的生活（原来3D GUI操作太复杂，是难以在生活中普及的一个原因）。帮我整理我的idea，调研，然后写博客。

In English: the research column is about a new topic the owner came up with, the **3D GUI Agent**: a new way
of interacting with 3D user interfaces, which migrates the GUI agents of traditional 2D terminals such as
phones to VR, AR and MR, to solve problems users face when interacting, such as 3D interfaces being too
complex, and so help 3D mobile terminals enter everyday life (3D GUIs being too complex to operate is one
reason they have not become widespread). The owner asked to organize the idea, research it, and write the
blog. The owner wants the public part of the column to establish the idea early ("占位"), and the detailed
research plan to stay protected until a paper is out.

## The owner's decisions so far

- **Prototype platform: Meta Quest first.** Ground the system design, the benchmark environment and the data
  plan in what Quest and Meta Horizon OS allow (see the platforms dossier: Meta Spatial SDK, Unity with the Meta
  XR SDK and the XR Interaction Toolkit, the Meta XR Simulator, Meta XR Operator, the passthrough camera API and
  its rules, 2D Android panels, WebXR in the Quest browser with IWER for development, accessibility rules).
  Keep the formulation platform-independent and say what would carry over to visionOS and Android XR later.
- **Target venues: ISMAR, IEEE VR and CHI.** Find the next submission deadlines of each (from the official calls
  for papers; if a call is not out yet, say so and estimate from previous years), and plan the first paper and
  the follow-ups against them: which contribution fits which venue (for example a system and user study for
  CHI, a benchmark or technique for ISMAR or IEEE VR), what must be ready by each deadline, and the timeline.

## Inputs

Read all four dossiers in `docs/research/3d-gui-agent/` first (2D GUI agents; 3D UI and XR interaction; agents
in XR and 3D, including the gap analysis and the closest works; platforms and tooling, including the
feasibility matrix). Check anything you rely on that is new or surprising against the primary source.

## Deliverables (all under `private/`)

1. `idea-brief.md` (English, 6,000-9,000 words): the organized research program.
   - a one-paragraph pitch; a precise definition of a 3D GUI agent and of what is out of scope;
   - the problem and its evidence (why operating 3D GUIs is hard, why that matters for adoption and for
     accessibility), with citations from the dossiers;
   - positioning against the closest work and products, stating exactly what is new and what is not;
   - a formal problem formulation (observations, the action space and its levels, goals and success,
     partial observability in space);
   - a taxonomy (interaction modes such as acting for the user versus guiding the user, task types, kinds of
     3D UI);
   - research questions;
   - a system architecture;
   - a benchmark and data plan grounded in the tooling dossier (concrete environments, tasks, metrics,
     annotation);
   - an evaluation plan with user studies;
   - expected contributions and the scope of a first paper (venues and timing); risks and mitigations;
     ethics, privacy and safety.
2. `framings.md`: three genuinely different framings of the program, for example benchmark-first,
   system-first and model-first. For each give its pros and cons, its risk of being scooped given the closest
   work, its publication path and its effort. End with a judged recommendation (use subagents as independent
   judges if useful) and how the framings combine.
3. `split.md`: what the public part of the column should say to stake the claim clearly, versus what stays in
   the protected post. Give a detailed outline of the public vision post (sections, figures and one widget
   idea) and of the protected post.
4. `claims.md`: a short, dated list of the key claims of the idea as they will appear in public, with care
   that each is accurate and not overclaimed given the closest work.
5. The protected post, in the three languages, following `docs/BLOG_GUIDE.md` (tone, front matter, figure and
   caption conventions, "Representative papers" and "Exercises" sections where they fit a research plan):
   - `private/posts/en-us/2026-11-24-3d-gui-agent-05-research-plan.md`, and the same file name under
     `private/posts/zh-cn/` and `private/posts/ja-jp/`;
   - front matter `categories: 3d-gui-agent`, `series: 3d-gui-agent`, `series_order: 5`, `toc.sidebar: left`,
     `related_posts: false`, `date: 2026-11-24 12:05:00+0900`;
   - 6-10 figures as SVG in `private/figs/` (file names `05-*.svg`), made by Python scripts in
     `private/scripts/` with the shared style `bin/figures/style.py`, referenced in the posts as
     `{{ '/assets/img/blog/3d-gui-agent/05-<name>.svg' | relative_url }}` through the same figure include the
     other posts use; the system architecture, the formulation, the benchmark design and the timeline are
     good candidates.
   - The post presents the plan in depth: the formulation, the architecture, the benchmark and data plan, the
     evaluation, the first paper, the roadmap and the risks. It is written in the owner's voice as a research
     plan ("we"), states nothing about results that do not exist, and cites prior work properly.

Work in that order: the brief first, then the framings, the split and the claims, then the post. Save each
file as soon as it is complete.
