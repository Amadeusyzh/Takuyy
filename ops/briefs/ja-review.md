# Assignment ja-review: read the new chapters in Japanese

Your branch `api/ja-review` starts from `main`, which contains all new posts. Japanese readers (the owner's
lab in Japan) will read the Japanese versions. A Chinese review has already been done, and its substantive
changes were mirrored into en and ja. Your brief explicitly allows you to edit the ja-jp versions of these
posts:
- `graphics-08-geometry-processing`
- `graphics-09-animation-and-characters`
- `graphics-10-volumes-and-participating-media`
- `graphics-11-real-time-rendering-techniques`
- `graphics-12-differentiable-and-inverse-rendering`
- `graphics-engine-01-anatomy-of-an-engine` through `graphics-engine-06-ai-meets-graphics-engines`

Edit their en-us or zh-cn versions only when you find a real error that is present in all languages. Do not
touch any other file; another worker is editing world-models posts.

Read each ja-jp post in full, comparing it with the en-us version. Fix:
1. **Japanese quality.**
   - Unnatural or wrong Japanese; keep a natural です/ます style.
   - Untranslated or half-translated paragraphs, captions and table cells.
   - Terminology that is inconsistent across posts. Follow existing usage in the earlier ja-jp posts, for
     example 身体性 AI.
   - The English term in parentheses at the first mention of a technical term.
2. **Faithfulness.** Content missing or added compared with en-us, including the parts the Chinese review
   added. Numbers in captions and worked examples must match en-us.
3. **Figures and widgets.** Each caption must say what to look at and match the figure.

Make targeted, high-value fixes; do not rewrite posts wholesale. Do graphics 08-12 first, then
graphics-engine 01-06. Commit after each post or two, with the trailers. Run `site-build` once at the end,
then `site-check` on the posts you changed.

Your final report lists, per post, what you changed.
