I added four new figures to the 2025-2026 update sections of world-models posts 01, 03 and 04, in all three languages. Each one comes from a real NumPy toy run, not from illustrative numbers. Everything is committed on `api/wm-figs` (commit `9b55435`). `site-build` passes, and `site-check` on the three slugs (en, zh-cn and ja-jp at 390 and 1100 px) found no broken images, no horizontal overflow, no unrendered math and no console errors. I looked at the 390 px screenshots of the new figures; they are legible on a phone and match their captions.

## Figures

| Post | Figure | What it shows |
| --- | --- | --- |
| 01 | `01-update-offline-imagination.svg` | Dreamer 4's "train only inside the model, from offline data" setting, shrunk to a 7x9 maze. **Left:** with 50 transitions, the policy trained in imagination plans a route through a wall the model never saw, then gets stuck on that wall in the real maze. **Right:** how good the policy is in the real maze (as a fraction of the best possible), plotted against dataset size N (25 to 3,200, 50 random datasets each). The model-based policy is optimal from N = 200; the model-free one is at 0.61 at N = 400 and needs about 800. With little data the agent expects more than it gets: 1.15x the optimum expected versus 0.30 actually achieved at N = 25. |
| 03 | `03-update-revisit-kymo.svg` | A 1D "video world model" fit by least squares. The camera goes out and back twice over a 1D strip of texture. The figure stacks every frame in time order, for the true world, a model that keeps only the current window, and a model that also keeps a memory indexed by position. When the camera returns, the window model shows different content from before; the memory model shows the same content, slightly blurred. |
| 03 | `03-update-revisit-error.svg` | How much the current frame differs from what the model first showed at the same place, averaged over 200 random worlds. The window model jumps to about 1.3 as soon as the camera turns back. The memory model stays below 0.42; its slow rise is a small learned blur building up over time. The text uses this to separate *forgetting* (fixed by memory) from *accumulation* (fixed by training methods). |
| 04 | `04-update-coverage.svg` | A 2D room with ray-cast depth: 613 frames, 90 rays per frame. A 25 cm piece of wall is added to memory only if it isn't there already. **Top:** floor plan, with wall pieces coloured by when they were first seen. **Bottom:** while exploring, only about 3% of each frame is new. During a repeated lap coverage stays flat at 42% and nothing new is added. Storing every ray hit gives 43,011 primitives; the deduplicated memory has 475 pieces covering 92% of the walls (about 90x fewer). This backs up the existing illustrative memory-growth figure with a real run. |

Each figure has a caption in all three languages saying what to look at, plus a short subsection or paragraph that refers to it. Post 01 got a subsection "A toy run: imagination training from a fixed dataset" after the Dreamer 4 discussion; it links to section 2.2 (model exploitation) and to exercise 6. Post 03 got "A toy run: what a window forgets" just before the Echo-Memory paragraph. Post 04 got a paragraph after the memory-growth figure.

## Verification
- All numbers quoted in the posts are values the script prints. I re-ran it to check the quoted maximum (0.410) and the exact results at N = 200, 400 and 800.
- The four new figures generate in about 7 s on CPU. The script `bin/figures/world-models/world_models_updates.py` now also accepts function names to regenerate only some figures (`python3 … fig_revisit fig_coverage`), and its docstring lists the new figures. I did not regenerate the existing figures.
- No new papers are cited, so no citation audit was needed.

## Open issues
- The toys are deliberately simplified, and the text says so. The 04 toy has no depth noise and simply skips duplicates instead of fusing them. The 01 model's ability to see walls next to visited cells is a modelling assumption, described as "as a model trained on images would".
- The build prints `Lexer: unexpected object at 669`. I believe it was there before my changes, but I didn't check it against `main`; the build still exits with code 0.
- There are untracked dotfiles and a `scripts/` folder in the working tree that I didn't create; I did not commit them.

No shared-file changes are needed, and nothing in the assignment is left undone.
