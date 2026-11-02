#!/usr/bin/env bash
# Runs one headless Claude Code worker on its own branch of the site, with a restricted tool set:
# no permission bypass, an explicit allowlist, no network tools in Bash, no git push, and credentials
# scrubbed from tool subprocesses, which run in Claude Code's bubblewrap sandbox.
# Pushing happens only in finish_worker.sh, which the worker cannot reach.
# WORKER_MODE=continue resumes from the existing branch api/<id> and its report on report/<id>.
set -uo pipefail
cd "$GITHUB_WORKSPACE/site"
BRANCH="api/$WORKER_ID"
OPS="$GITHUB_WORKSPACE/ops-src/ops"
OUT="$RUNNER_TEMP/out"
mkdir -p "$OUT"

PROMPT="$RUNNER_TEMP/prompt.md"
if [ "${WORKER_MODE:-new}" = "continue" ]; then
  git fetch -q origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" "+refs/heads/report/$WORKER_ID:refs/remotes/origin/report/$WORKER_ID"
  git checkout -q -B "$BRANCH" "origin/$BRANCH"
  git show "origin/report/$WORKER_ID:report.md" > "$RUNNER_TEMP/earlier-report.md" 2>/dev/null || echo "(no earlier report)" > "$RUNNER_TEMP/earlier-report.md"
  {
    sed "s#__BRANCH__#$BRANCH#g" "$OPS/common.md"
    printf '\n\n---\n\n'
    python3 - "$OPS/continue.md" "$RUNNER_TEMP/earlier-report.md" <<'PY'
import sys
tpl = open(sys.argv[1]).read()
print(tpl.replace("__REPORT__", open(sys.argv[2]).read().strip()))
PY
    printf '\n\n---\n\n# Your original assignment (for reference)\n\n'
    cat "$OPS/briefs/$WORKER_ID.md"
  } > "$PROMPT"
else
  git checkout -q -b "$BRANCH"
  {
    sed "s#__BRANCH__#$BRANCH#g" "$OPS/common.md"
    printf '\n\n---\n\n'
    cat "$OPS/briefs/$WORKER_ID.md"
  } > "$PROMPT"
fi

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
COMMON=(--model claude-opus-5-5 --permission-mode acceptEdits
        --allowedTools "${ALLOWED[@]}" --disallowedTools "${DENIED[@]}")

# Preflight: make sure Bash really works in the sandbox before spending the budget.
pre=$(timeout 300 claude -p "Use the Bash tool to run exactly this command: python3 -c 'print(6*7)'. Then reply with only the number it printed." \
      "${COMMON[@]}" --effort low --max-budget-usd 0.5 2> "$OUT/preflight.err")
echo "preflight answer: $pre"
if ! printf '%s' "$pre" | grep -q 42; then
  echo "PREFLIGHT FAILED: Bash does not work for the worker; not starting the main run."
  tail -c 2000 "$OUT/preflight.err"
  printf 'Preflight failed, main run not started.\nAnswer: %s\n' "$pre" > "$OUT/preflight-failed.txt"
  exit 0
fi

echo "worker $WORKER_ID (${WORKER_MODE:-new}) on $BRANCH, budget \$$WORKER_BUDGET"
# 330 minutes, so the finishing step still fits in the 350-minute job limit.
timeout --signal=INT --kill-after=120 19800 \
  claude -p "${COMMON[@]}" --effort high \
    --max-budget-usd "$WORKER_BUDGET" \
    --output-format stream-json --verbose \
    < "$PROMPT" > "$OUT/stream.jsonl" 2> "$OUT/stderr.txt"
echo "claude exited with $?"
exit 0
