Both reviewers for graphics-engine 05 and 06 have finished. Their changes are committed in all three languages, and nothing is left uncommitted in `_posts`.

- **graphics-engine-05:** the reviewer filled in the skipped GJK triangle case, the EPA proof and the soft-constraint algebra. Impulse is now written λ so it no longer clashes with the Jacobian J. Missing symbols are defined.
- **graphics-engine-06:** the latency-model symbols are now defined. Several captions that didn't match their figures are fixed. 降噪 is now 去噪 throughout.

All 11 posts are reviewed and committed. `site-build` succeeds, and `site-check` passes apart from one problem. At phone width (390 px), graphics-engine-06 is wider than the screen (570 px in English, 494 in Japanese, 397 in Chinese), and graphics-engine-05 is 1 px too wide. I couldn't find which element causes it. The reviews didn't add any tables or display formulas there, so it probably predates this run, but I haven't confirmed that.

The full per-post list of changes and open issues is in my previous message.
