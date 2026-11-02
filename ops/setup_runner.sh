#!/usr/bin/env bash
# Installs what a worker needs on a fresh ubuntu-latest runner.
set -euo pipefail

sudo apt-get update -qq
sudo apt-get install -y -qq fonts-wqy-zenhei jq bubblewrap socat >/dev/null
# Claude Code isolates tool subprocesses (and scrubs credentials from them) with bubblewrap.
# Ubuntu 24.04 restricts unprivileged user namespaces through AppArmor; allow them on this throwaway VM.
sudo sysctl -q -w kernel.apparmor_restrict_unprivileged_userns=0 || true
bwrap --ro-bind / / --dev /dev --proc /proc --unshare-pid true && echo "bubblewrap works"

python -m pip install -q --upgrade pip
python -m pip install -q numpy scipy matplotlib requests
python -m pip install -q torch --index-url https://download.pytorch.org/whl/cpu
python -c "import matplotlib.pyplot"   # build the font cache now; the sandbox may not write to ~/.cache later

npm install -g --silent @anthropic-ai/claude-code playwright
playwright install --with-deps chromium >/dev/null
echo "NODE_PATH=$(npm root -g)" >> "$GITHUB_ENV"

# Build and page-check helpers for the worker.
chmod +x "$GITHUB_WORKSPACE/ops-src/ops/tools/"*
echo "$GITHUB_WORKSPACE/ops-src/ops/tools" >> "$GITHUB_PATH"
echo "SITE_DIR=$GITHUB_WORKSPACE/site" >> "$GITHUB_ENV"
echo "OPS_TOOLS=$GITHUB_WORKSPACE/ops-src/ops/tools" >> "$GITHUB_ENV"

# ARIS research skills (https://github.com/wanshuiyin/auto-claude-code-research-in-sleep, MIT), pinned.
ARIS_REPO="$HOME/aris"
git init -q "$ARIS_REPO"
git -C "$ARIS_REPO" fetch -q --depth 1 https://github.com/wanshuiyin/auto-claude-code-research-in-sleep \
  2927b40b2ea37774de53763338c5e8f91a7601e6
git -C "$ARIS_REPO" checkout -q FETCH_HEAD
mkdir -p "$HOME/.claude/skills" "$HOME/.claude/agents" "$HOME/.aris"
echo "$ARIS_REPO" > "$HOME/.aris/repo"
for s in research-lit arxiv semantic-scholar openalex citation-audit shared-references; do
  cp -r "$ARIS_REPO/skills/$s" "$HOME/.claude/skills/"
done
cp "$ARIS_REPO/agents/aris-fanout-leaf.md" "$HOME/.claude/agents/"
echo "ARIS_REPO=$ARIS_REPO" >> "$GITHUB_ENV"

cat > "$HOME/.claude/settings.json" <<'JSON'
{
  "includeCoAuthoredBy": false,
  "sandbox": {
    "network": {
      "allowLocalBinding": true,
      "allowedDomains": [
        "arxiv.org",
        "export.arxiv.org",
        "api.semanticscholar.org",
        "api.openalex.org",
        "dblp.org",
        "openreview.net",
        "api.openreview.net",
        "api2.openreview.net",
        "huggingface.co",
        "kesen.realtimerendering.com",
        "doi.org",
        "dl.acm.org",
        "openaccess.thecvf.com",
        "github.com",
        "api.github.com",
        "raw.githubusercontent.com",
        "cdn.jsdelivr.net",
        "cdnjs.cloudflare.com",
        "fonts.googleapis.com",
        "fonts.gstatic.com",
        "code.jquery.com",
        "unpkg.com",
        "registry.npmjs.org",
        "pypi.org",
        "files.pythonhosted.org"
      ]
    },
    "filesystem": {
      "allowWrite": [
        "/tmp"
      ]
    }
  }
}
JSON

git config --global user.name yangzehua
git config --global user.email yangzehua@akane.waseda.jp

claude --version
