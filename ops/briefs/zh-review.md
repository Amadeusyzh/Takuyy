# Assignment zh-review: read the new chapters as a learner, in Chinese

Your branch `api/zh-review` starts from `integration`, which contains all new posts. The owner is a
native Chinese speaker and will study from the Chinese versions. Your brief explicitly allows you to edit
these posts, in all three languages:
- `graphics-08-geometry-processing`
- `graphics-09-animation-and-characters`
- `graphics-10-volumes-and-participating-media`
- `graphics-11-real-time-rendering-techniques`
- `graphics-12-differentiable-and-inverse-rendering`
- `graphics-engine-01-anatomy-of-an-engine` through `graphics-engine-06-ai-meets-graphics-engines`

Another worker is fixing overflow, the roadmap and links in other posts. Do not touch any other file.

Read each zh-cn post in full, from the point of view of a motivated learner starting from scratch. Fix:
1. **Translation problems.**
   - Untranslated or half-translated paragraphs, captions or table cells.
   - Unnatural or wrong Simplified Chinese; inconsistent terminology across posts.
   - At the first mention of a technical term, give the English in parentheses.
2. **Teaching gaps.**
   - A symbol used before it is defined; a skipped derivation step; a figure the text never refers to.
   - A caption that does not say what to look at.
   - A worked example whose numbers do not match the code or the figure.
   When you add or fix an explanation, add the same change to the en and ja versions, so the three stay
   faithful to each other.
3. **Consistency with the figures and widgets.** Check that each figure's caption matches the figure. Open
   the SVG, or render it to PNG in `/tmp`.

Do not rewrite posts wholesale. Make targeted, high-value improvements, best-quality first: graphics 08-12
first, then graphics-engine 01-06.

Commit after each post or two, with the trailers. Run `site-build` once at the end, then `site-check` on the
posts you changed.

Your final report lists, per post, what you changed and why.
