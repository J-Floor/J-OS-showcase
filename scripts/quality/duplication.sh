#!/usr/bin/env bash
# Structural duplication: dryer finds the pairs, gate.ts applies the ignores.
set -euo pipefail

# A plain assignment fails the script when the listing fails; process
# substitution would hide it.
listing=$(bun scripts/quality/gate.ts dry-files)
mapfile -t files <<<"$listing"
dryer "${files[@]}" >/dev/null
bun scripts/quality/gate.ts dry
