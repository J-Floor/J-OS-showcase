#!/usr/bin/env bash
# Installs the named tools (crapper, dryer) from exact commits, with their
# parser dependencies at exact versions, because they are third-party code that
# runs in CI. Usage: install-tools.sh crapper|dryer...
set -euo pipefail

CRAPPER_COMMIT=6fd92c4c9bcc56efb64a2f8743d5a2993bcfd42d
DRYER_COMMIT=66ff6d21a42c04afcad89c78a80066176d1294b0
# Both tools declare these with a lower bound only.
TREE_SITTER=tree-sitter==0.26.0
TREE_SITTER_LANGUAGE_PACK=tree-sitter-language-pack==1.23.1

install_tool() {
	local spec="git+https://github.com/unclebob/$1@$2"
	uv tool install --force --with "$TREE_SITTER" --with "$TREE_SITTER_LANGUAGE_PACK" "$spec"
}

if [[ $# -eq 0 ]]; then
	echo "Usage: install-tools.sh crapper|dryer..." >&2
	exit 2
fi

for tool in "$@"; do
	case "$tool" in
		crapper) install_tool crapper "$CRAPPER_COMMIT" ;;
		dryer) install_tool dryer "$DRYER_COMMIT" ;;
		*)
			echo "Unknown tool: $tool" >&2
			exit 2
			;;
	esac
done
