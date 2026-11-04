#!/usr/bin/env bash
# Runs coverage and the risk-score gate for each package. Every package is
# scored before the script fails, so one red package does not hide the other.
set -euo pipefail

status=0
for package in apps/web packages/design-system; do
	if (cd "$package" && bunx vitest run --coverage --reporter=dot --maxWorkers=2); then
		bash scripts/quality/risk-scores.sh "$package" || status=1
	else
		status=1
	fi
done
exit "$status"
