# API workers

Ops branch, never merged into `main`. Pushing this branch to `ops/api-run` starts the GitHub Actions
workflow `.github/workflows/api-workers.yml`. It first probes the API key in the repository secret
`ANTHROPIC_API_KEY`, then runs one headless Claude Code worker per entry of `ops/workers.json`, each on its
own runner, with a hard dollar cap (`--max-budget-usd`).

Safety:
- There is no permission bypass; workers run with an explicit tool allowlist.
- Bash has no network tools and no `git push`.
- Credentials are scrubbed from tool subprocesses.
- The worker step gets no GitHub token; only the finishing step pushes `api/<id>` and `report/<id>`.

Layout:
- Briefs: `ops/common.md` (shared instructions) plus `ops/briefs/<id>.md`.
- Helpers on the worker's PATH: `ops/tools/site-build` and `ops/tools/site-check`.

To stop, cancel the run in the Actions tab. To revoke access, delete the secret or the key.
