#!/usr/bin/env bash
# Runs as remoteUser (vscode). Docker creates named volumes, and the parent
# dirs of their mount targets, as root, so chown them before Bun installs
# into ~/.bun.
set -euo pipefail

sudo chown -R vscode:vscode /home/vscode/.bun /home/vscode/.convex

# Bun's installer needs unzip. Pin the version in package.json's packageManager.
sudo apt-get update -qq && sudo apt-get install -y -qq unzip
BUN_VERSION=$(sed -n 's/.*"packageManager": "bun@\([^"]*\)".*/\1/p' package.json)
curl -fsSL https://bun.com/install | bash -s "bun-v${BUN_VERSION}"
export PATH="$HOME/.bun/bin:$PATH"

# CONVEX_TMPDIR is set in devcontainer.json so codegen stays on the workspace
# filesystem. mkdtemp() does not create parents.
mkdir -p apps/web/.convex-tmp

bun install --frozen-lockfile

if [[ ! -f apps/web/.env.local ]]; then
	cp apps/web/.env.example apps/web/.env.local
fi
