#!/usr/bin/env bash
# After a worker stops: commit leftover work (allowed paths only), push the branch,
# and publish the worker's final report and cost on the branch report/<id>.
set -uo pipefail
cd "$GITHUB_WORKSPACE/site"
BRANCH="api/$WORKER_ID"
OUT="$RUNNER_TEMP/out"
mkdir -p "$OUT"
AUTH="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)"

git add -- _posts assets/img/blog assets/js/widgets bin/figures docs/reading-lists 2>/dev/null || true
if ! git diff --cached --quiet; then
  git commit -q -m "WIP: work left uncommitted when worker $WORKER_ID stopped" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CeJPo3UioEfuc4SHmQGuTp"
fi
git -c http.extraheader="$AUTH" push -q origin "$BRANCH" || echo "push of $BRANCH failed"

touch "$OUT/stream.jsonl" "$OUT/stderr.txt"
jq -c 'select(.type=="result")' "$OUT/stream.jsonl" 2>/dev/null | tail -1 > "$OUT/result.json"
if [ -s "$OUT/result.json" ]; then
  jq -r '.result // "(no final text)"' "$OUT/result.json" > "$OUT/report.md"
  jq -c '{id: env.WORKER_ID, subtype, is_error, total_cost_usd, num_turns, duration_ms}' "$OUT/result.json" > "$OUT/summary.json"
else
  {
    echo "(no result event; the worker was interrupted or did not start)"
    [ -f "$OUT/preflight-failed.txt" ] && cat "$OUT/preflight-failed.txt"
    # keep the earlier report, so a later continuation run still has it
    if [ -f "$RUNNER_TEMP/earlier-report.md" ]; then echo; cat "$RUNNER_TEMP/earlier-report.md"; fi
  } > "$OUT/report.md"
  printf '{"id":"%s","error":"no result event"}\n' "$WORKER_ID" > "$OUT/summary.json"
fi
tail -c 4000 "$OUT/stderr.txt" > "$OUT/stderr-tail.txt"
git log --oneline main..HEAD > "$OUT/commits.txt" 2>/dev/null || true

echo "== summary"; cat "$OUT/summary.json"
echo "== commits"; cat "$OUT/commits.txt"
echo "== report"; cat "$OUT/report.md"
echo "== stderr (tail)"; cat "$OUT/stderr-tail.txt"
{
  echo "### $WORKER_ID"
  echo '```'; cat "$OUT/summary.json"; cat "$OUT/commits.txt"; echo '```'
  cat "$OUT/report.md"
} >> "$GITHUB_STEP_SUMMARY"

# Report branch built with plumbing, so the work tree is untouched.
entries=""
for f in report.md summary.json commits.txt stderr-tail.txt; do
  b=$(git hash-object -w "$OUT/$f")
  entries="${entries}100644 blob ${b}	${f}
"
done
tree=$(printf '%s' "$entries" | git mktree)
commit=$(git commit-tree "$tree" -m "report $WORKER_ID")
git -c http.extraheader="$AUTH" push -q -f origin "$commit:refs/heads/report/$WORKER_ID" || echo "report push failed"
exit 0
