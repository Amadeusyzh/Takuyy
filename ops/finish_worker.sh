#!/usr/bin/env bash
# After a worker stops: commit leftover work (allowed paths only), push the branch,
# and publish the worker's final report and cost on the branch report/<id>.
set -uo pipefail
cd "$GITHUB_WORKSPACE/site"
BRANCH="api/$WORKER_ID"
OUT="$RUNNER_TEMP/out"
mkdir -p "$OUT"
AUTH="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)"

if [ "${WORKER_PRIVATE:-0}" = "1" ]; then
  # Private worker: nothing in plain text leaves the runner. private/ (plus the final report, transcript and
  # stderr) is packed, encrypted with a fresh AES-256 key, and that key is wrapped with the orchestrator's RSA
  # public key (ops/research-pub.pem). Only the ciphertext and the cost summary are published, on
  # report/<id>; the branch api/<id> is not pushed, and nothing but the cost is printed to the public log.
  SEC="$RUNNER_TEMP/secure"
  mkdir -p "$SEC" private/_run
  touch "$OUT/stream.jsonl" "$OUT/stderr.txt"
  jq -c 'select(.type=="result")' "$OUT/stream.jsonl" 2>/dev/null | tail -1 > "$OUT/result.json"
  if [ -s "$OUT/result.json" ]; then
    jq -r '.result // "(no final text)"' "$OUT/result.json" > private/_run/report.md
    jq -c '{id: env.WORKER_ID, subtype, is_error, total_cost_usd, num_turns, duration_ms}' "$OUT/result.json" > "$OUT/summary.json"
  else
    echo "(no result event; the worker was interrupted or did not start)" > private/_run/report.md
    printf '{"id":"%s","error":"no result event"}\n' "$WORKER_ID" > "$OUT/summary.json"
  fi
  cp "$OUT/stream.jsonl" "$OUT/stderr.txt" private/_run/ 2>/dev/null || true
  git log --oneline main..HEAD > private/_run/commits.txt 2>/dev/null || true
  git diff main --stat > private/_run/diffstat.txt 2>/dev/null || true
  tar czf "$SEC/payload.tgz" private
  openssl rand -out "$SEC/k.bin" 32
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$SEC/payload.tgz" -out "$SEC/payload.tgz.enc" -pass file:"$SEC/k.bin"
  openssl pkeyutl -encrypt -pubin -inkey "$GITHUB_WORKSPACE/ops-src/ops/research-pub.pem" \
    -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -in "$SEC/k.bin" -out "$SEC/key.enc"
  rm -f "$SEC/k.bin" "$SEC/payload.tgz"
  echo "== summary (private worker: contents are encrypted)"; cat "$OUT/summary.json"
  { echo "### $WORKER_ID (private)"; echo '```'; cat "$OUT/summary.json"; echo '```'; } >> "$GITHUB_STEP_SUMMARY"
  entries=""
  for f in "$OUT/summary.json" "$SEC/payload.tgz.enc" "$SEC/key.enc"; do
    b=$(git hash-object -w "$f")
    entries="${entries}100644 blob ${b}	$(basename "$f")
"
  done
  tree=$(printf '%s' "$entries" | git mktree)
  commit=$(git commit-tree "$tree" -m "report $WORKER_ID (encrypted)")
  git -c http.extraheader="$AUTH" push -q -f origin "$commit:refs/heads/report/$WORKER_ID" || echo "report push failed"
  exit 0
fi

git add -- _posts assets/img/blog assets/js/widgets bin/figures docs/reading-lists docs/research _sass/_base.scss 2>/dev/null || true
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
