# Continuation run: finish your dossier

Your earlier run on this assignment ended too early. A run ends as soon as you send your final message, and
any subagent still working in the background at that moment is stopped and its work is lost. That is what
happened: the earlier run handed its sections to background subagents and then ended while they were still
working. Only what had been committed survives on this branch. Your earlier final message is quoted at the
end of this section.

Do this, in order, committing as you go:

1. See what exists: `git log --stat main..HEAD` and every file under `docs/research/3d-gui-agent/` (for
   example `_parts/`).
2. Write the complete dossier into the single output file that your assignment names, following the shared
   instructions and the structure there. Merge the parts that already exist into it (check their facts and
   links as you go), and research and write every part that is missing. Then delete the `_parts/` folder.
3. Run subagents only in the foreground: wait for each one to return before you continue, and never end your
   turn while a subagent, a search or any other work is still pending. Commit after each large section.
4. Verify every citation (the citation-audit method), and list anything you could not verify.
5. Finish with the final report the shared instructions describe.

Your earlier final message:

<earlier-report>
__REPORT__
</earlier-report>
