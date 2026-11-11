#!/usr/bin/env bash
# Build the checked-out site, run site-check on the configured slugs, and publish
# build log, check JSON and screenshots on the branch report/verify.
set -uo pipefail
export SITE_DIR="$GITHUB_WORKSPACE/site" OPS_TOOLS="$GITHUB_WORKSPACE/ops-src/ops/tools"
export PATH="$OPS_TOOLS:$PATH"
chmod +x "$OPS_TOOLS"/*
REP="$RUNNER_TEMP/rep"
mkdir -p "$REP/shots"

site-build > "$REP/build.txt" 2>&1
echo "build exit $?" | tee -a "$REP/build.txt"
mapfile -t SLUGS < <(jq -r '.slugs[]' "$GITHUB_WORKSPACE/ops-src/ops/verify.json")
site-check "${SLUGS[@]}" > "$REP/check.json" 2> "$REP/check.err"
echo "check exit $?"

# Compact problem list: overflow (with the elements that stick out), broken images, unrendered math,
# console errors.
jq -r '.[] | select((.scrollWidth > .clientWidth + 2) or ((.offenders // []) | length > 0) or (.broken | length > 0)
        or (.unrenderedMath > 0) or (.errors | length > 0) or (.http != 200))
        | "\(.page)\thttp=\(.http) sw=\(.scrollWidth)/\(.clientWidth) figs=\(.figs) broken=\(.broken|length) math=\(.unrenderedMath) widgets=\(.widgets) errors=\(.errors|join(" | ")) offenders=\((.offenders // [])|join(" ; "))"' \
  "$REP/check.json" > "$REP/problems.tsv" 2>/dev/null || true
echo "pages: $(jq length "$REP/check.json" 2>/dev/null), with problems: $(wc -l < "$REP/problems.tsv")"
cat "$REP/problems.tsv" | head -80
# home page: one line per Lab panel
jq -r '.[] | select(.labPanels) | .page as $p | .labPanels | to_entries[] | "\($p)\t\(.key)\t\(.value)"' \
  "$REP/check.json" > "$REP/lab.tsv" 2>/dev/null || true

cp /tmp/shots/*-390.png /tmp/shots/*-wid*.png /tmp/shots/home-*.png "$REP/shots/" 2>/dev/null || true
cd "$REP" && git init -q && git add -A \
  && git -c user.name=yangzehua -c user.email=yangzehua@akane.waseda.jp commit -q -m "verify report" \
  && git -c http.extraheader="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)" \
       push -q -f "https://github.com/$GITHUB_REPOSITORY" HEAD:refs/heads/report/verify
echo "report pushed"
