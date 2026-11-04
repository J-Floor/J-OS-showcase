#!/usr/bin/env bash
# Runs the quality checks locally, one at a time, because the box is small.
# The sweep workflow runs the same checks, plus the mutation report.
set -euo pipefail

bun run knip
bash scripts/quality/duplication.sh
bash scripts/quality/coverage-scores.sh
