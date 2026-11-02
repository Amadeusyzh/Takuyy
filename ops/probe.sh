#!/usr/bin/env bash
# Checks that the API key works and prints the organization's rate limits (header values only).
set -uo pipefail
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "### API probe: the repository secret ANTHROPIC_API_KEY is missing" | tee -a "$GITHUB_STEP_SUMMARY"
  echo "ok=false" >> "$GITHUB_OUTPUT"
  exit 1
fi
code=$(curl -s -o /tmp/body.json -D /tmp/headers.txt -w '%{http_code}' https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" \
  -d '{"model":"claude-opus-5-5","max_tokens":256,"messages":[{"role":"user","content":"Reply with the single word OK."}]}')
{
  echo "### API probe: HTTP $code"
  echo '```'
  grep -i '^anthropic-ratelimit' /tmp/headers.txt || true
  jq -c '{type, model, stop_reason, usage, error}' /tmp/body.json || true
  echo '```'
} | tee -a "$GITHUB_STEP_SUMMARY"
if [ "$code" = "200" ]; then
  echo "ok=true" >> "$GITHUB_OUTPUT"
else
  echo "ok=false" >> "$GITHUB_OUTPUT"
  exit 1
fi
