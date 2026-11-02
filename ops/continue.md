# Continuation run: finish and verify your earlier work

This branch already contains the work of your earlier run on this assignment, but that run had no working
shell. Bash could not start, so no figure script, code snippet, build or page check was ever executed, and
the files were committed automatically in a "WIP" commit.

Bash works now. It runs inside a sandbox: commands can write inside the repository and in `/tmp`, and reach
only the hosts listed under "Tools and permissions". Your earlier final report is quoted at the end of this
section.

Do this, in order, committing as you go:

1. See what exists: your earlier report, `git log --stat main..HEAD`, and the files themselves.
2. Run every figure script you wrote and fix errors until every SVG the posts reference exists.
   - Remove any temporary `{% comment %}` wrappers around figure includes.
   - Make captions and text agree with the numbers the scripts actually produce.
   - Look at each SVG (convert a few to PNG in `/tmp` if you need to see them) and fix anything unclear or
     wrong.
3. Run every code snippet in your posts by copying it into a file in `/tmp`. Fix code that fails or
   disagrees with the text, in all three languages.
4. Widgets:
   - `grep -nP '[^\x00-\x7F]'` on each of your widget files must print nothing;
   - `node --check` must pass;
   - then run `site-build` and `site-check` on your slugs, open the screenshots, and fix layout, overflow,
     broken images, unrendered math and console errors.
5. Complete anything your brief asks for that is missing or thin: sections, worked examples, figures,
   widgets, translations, the reading list. Keep all three languages in sync. Teaching quality comes first:
   these posts are for learning from scratch.
6. Re-verify every fact or link you were unsure about, using the citation-audit method.
7. Finish with a new final report, in the same format as the earlier one.

Your earlier report:

<earlier-report>
__REPORT__
</earlier-report>
