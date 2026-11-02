# Final report: worker eng-b (continuation run), graphics-engine posts 03 and 04

Both posts are now built, checked and committed (`26c0f09` for post 03, `b0e91cc` for post 04, on top of the earlier WIP commit). The final `site-check` passes on all 12 page views: both posts × 3 languages × 390 and 1100 px. It reports no broken images, no horizontal overflow, no unrendered math and no console errors.

## Post 03: "Build a mini engine: WebGPU, glTF, PBR, shadows and an ECS in the browser"

- **Size:** 12,685 English words as counted by `wc`, including about 900 lines of code; the prose alone is roughly 4,300 words.
- **Figures:** 11 (10 computed SVGs plus one new rendered PNG). **Widgets:** 2 (scene graph, shadow bias). **Papers cited:** 8.

**How I verified it:**
- **The engine actually runs.** Headless Chromium on this runner can use WebGPU through SwiftShader (a software GPU), so I ran the post's own code (all 15 files) on the DamagedHelmet model.
  - Showing the image in a `webgpu` canvas fails in headless mode, so the test page replaced the canvas with an ordinary texture of the same size and read it back. None of the post's code was changed for this.
  - Result: no WebGPU validation errors, no WGSL warnings, and the GPU timestamp queries work.
- **That run found a real bug.** The glTF loader kept `emissiveFactor = (1,1,1)` but ignored the emissive texture, so the whole helmet glowed white.
  - I checked by decoding the texture: 99.2 % of its texels are dark.
  - The fix is in all three languages. New section 10.1 shows the rendered frame (`03-engine-frame.png`, frame plus debug panel) and explains the bug as a debugging lesson.
- **Code checks:**
  - `node --check` passes on every file.
  - Node tests confirm the worked examples: NDC depth 0.9676 and x 0.5774; pass order `shadow, opaque, tonemap` with `debugDepth` culled; the stated resource lifetimes; dirty-flag counts of 3, then 0, 3 and 1.
  - The post's `node:test` example passes. The comment `node --test test/` fails on Node 22, so it now says `node --test`.
- **Figure numbers match the captions:** the hitch frame runs 4 steps; resources fit in 3 slots instead of 7; `ssaoDebug` is culled.
- **Layout fixes:**
  - Module graph: nodes reordered to reduce crossing arrows.
  - Frame graph: redrawn so boxes and labels no longer overlap.
  - glTF diagram: one label overflowed its box.
  - Frame-budget chart: labels collided with the other panel.
  - Phone width: an inline formula overflowed by 15 px at 390 px, so I split it.

## Post 04: "Inside production engines: Unreal Engine 5, Unity 6, Godot 4, Bevy and others"

- **Size:** about 4,300 English words.
- **Figures:** 8. **Widgets:** 2 (Nanite LOD, virtual shadow map pages). **Papers or talks cited:** 13.

**Fixes from checking the figures and snippets:**
- **LOD-cut figure:** the 5 m camera picked all level-0 clusters, which contradicted the caption. It now uses 25 m and 100 m, and the caption explains that the level also depends on each cluster's own error.
- **Surface-cache cards figure:** the farthest hits were drawn white, the same as misses, so the box disappeared from the ±y cards. The ±x cards also had y on the horizontal axis. Both are fixed.
- **Triangle-size caption:** "almost all below 32 px" became "all", which is what the computation shows.
- **Nanite widget:** the default distance is now 30 m, where the selected cut mixes levels.
- **Python snippets:** all run and match the text (cluster errors per level; the sphere trace reaches −0.8662 in 4 steps).

**Citations:** all 15 DOIs in the two posts resolve in OpenAlex with the right title, first author and year. I re-checked the Walter 2007 DOI (`10.2312/EGWR/EGSR07/195-206`), which my earlier run could only find through search results; it is correct. I also confirmed "Lumen Lite (Beta)" in Epic's official UE 5.8 release notes.

## Open issues and uncertain facts

- The GPU times in the engine figure come from SwiftShader on the CPU. The caption says so and asks readers to compare only their ratio.
- The DamagedHelmet credit is in the figure caption: CC BY 4.0 by ctxwing, based on a CC BY-NC 4.0 model by theblueturtle_. That is fine for this non-commercial site, but an image on a commercial page would need another asset.
- Carried over from the earlier run and not re-checked:
  - the Nanite details (32 px threshold, 64-bit visibility buffer), which come from a secondary summary;
  - the UE 5.4–5.7 dates, which come from GameFromScratch;
  - a few comparison-table cells written from memory.
- I did not re-review the zh/ja translations beyond the passages I changed. Every change was made in all three languages.

## Shared-file changes I would like

- `site-build` fails in the sandbox because a sandbox file appears in the repo as `scripts` and Jekyll cannot read it. Leftover sandbox files like `.bashrc` and `.vscode` show up as untracked files too.
  - To build, I used `bundle exec jekyll build` with a temporary config in `/tmp` that adds `scripts`, `.bashrc` and `.bash_profile` to `exclude`.
  - Adding those to `exclude` in `_config.yml` would fix `site-build`, or the helper could pass its own exclude list.
  - None of these files are committed.

## Left undone

Nothing from the brief.
