#!/usr/bin/env bash
# Scores one package from its existing coverage, then applies the gate.
set -euo pipefail

package="$1"
case "$package" in
	apps/web) roots=(convex src) ;;
	packages/design-system) roots=(src) ;;
	*)
		echo "Unknown package: $package" >&2
		exit 2
		;;
esac

(cd "$package" && crapper --use-existing-coverage "${roots[@]}" >/dev/null)
bun scripts/quality/gate.ts crap "$package"
