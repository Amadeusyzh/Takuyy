#!/usr/bin/env bash
# Runs one headless Claude Code worker on its own branch of the site, with a restricted tool set:
# no permission bypass, an explicit allowlist, no network tools in Bash, no git push, and credentials
# scrubbed from tool subprocesses. Pushing happens only in finish_worker.sh, which the worker cannot reach.
set -uo pipefail
cd "$GITHUB_WORKSPACE/site"
BRANCH="api/$WORKER_ID"
OPS="$GITHUB_WORKSPACE/ops-src/ops"
OUT="$RUNNER_TEMP/out"
mkdir -p "$OUT"
git checkout -q -b "$BRANCH"

PROMPT="$RUNNER_TEMP/prompt.md"
{
  sed "s#__BRANCH__#$BRANCH#g" "$OPS/common.md"
  printf '\n\n---\n\n'
  cat "$OPS/briefs/$WORKER_ID.md"
} > "$PROMPT"

ALLOWED=(
  Read Write Edit MultiEdit Glob Grep WebSearch WebFetch Skill TodoWrite Task Agent
  "Bash(python3:*)" "Bash(python:*)" "Bash(node:*)" "Bash(npx tsc:*)" "Bash(npm install --prefix /tmp/:*)"
  "Bash(site-build:*)" "Bash(site-check:*)"
  "Bash(git status:*)" "Bash(git diff:*)" "Bash(git add:*)" "Bash(git commit:*)" "Bash(git log:*)"
  "Bash(git show:*)" "Bash(git mv:*)" "Bash(git rm:*)" "Bash(git restore:*)"
  "Bash(ls:*)" "Bash(mkdir:*)" "Bash(wc:*)" "Bash(head:*)" "Bash(tail:*)" "Bash(grep:*)" "Bash(find:*)"
  "Bash(jq:*)" "Bash(sort:*)" "Bash(cp:*)" "Bash(mv:*)" "Bash(diff:*)"
)
DENIED=(
  "Bash(curl:*)" "Bash(wget:*)" "Bash(git push:*)" "Bash(git remote:*)" "Bash(git config:*)"
  "Bash(gh:*)" "Bash(env:*)" "Bash(printenv:*)" "Bash(export:*)" "Bash(sudo:*)" "Bash(ssh:*)"
)

export CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1
echo "worker $WORKER_ID on $BRANCH, budget \$$WORKER_BUDGET"
# 330 minutes, so the finishing step still fits in the 350-minute job limit.
timeout --signal=INT --kill-after=120 19800 \
  claude -p --model claude-opus-5-5 --effort high \
    --max-budget-usd "$WORKER_BUDGET" \
    --permission-mode acceptEdits \
    --allowedTools "${ALLOWED[@]}" \
    --disallowedTools "${DENIED[@]}" \
    --output-format stream-json --verbose \
    < "$PROMPT" > "$OUT/stream.jsonl" 2> "$OUT/stderr.txt"
echo "claude exited with $?"
exit 0
