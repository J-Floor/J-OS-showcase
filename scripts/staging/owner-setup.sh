#!/usr/bin/env bash
# One-time setup of staging.thejfloor.com on the app box (the host Caddy serves
# app.thejfloor.com from; DEPLOY_HOST in the deploy workflows). Run it there,
# as root, from a checkout of this repo:
#
#   sudo bash scripts/staging/owner-setup.sh --dry-run "ssh-ed25519 AAAA... staging-deploy"
#   sudo bash scripts/staging/owner-setup.sh "ssh-ed25519 AAAA... staging-deploy"
#
# The argument is the PUBLIC half of the staging deploy key; its private half
# goes into the DEPLOY_SSH_KEY_STAGING GitHub secret.
#
# What it does, each step skipped when already done:
#   1. Creates the staging dist dir with the prod dist dir's owner and mode.
#   2. Adds the key to the deploy user's authorized_keys with the same forced
#      rrsync command as the prod key, pointed at the staging dist dir.
#   3. Appends a copy of the live app.thejfloor.com Caddy block for the staging
#      host (same TLS, headers and CSP; staging root; noindex; no-cache for the
#      app shell), validates the config, and reloads Caddy. A failed validation
#      restores the backup and changes nothing.
#
# --dry-run prints every change and writes nothing.
# Path overrides (CADDYFILE, AUTHORIZED_KEYS, PROD_DIST, STAGING_DIST) exist
# for testing against fixtures.
set -euo pipefail

DEPLOY_USER=jos
PROD_HOST=app.thejfloor.com
STAGING_HOST=staging.thejfloor.com
CADDYFILE=${CADDYFILE:-/etc/caddy/Caddyfile}
PROD_DIST=${PROD_DIST:-/srv/jfloor/apps/web/dist}
STAGING_DIST=${STAGING_DIST:-/srv/jfloor/apps/web-staging/dist}
STAMP=$(date +%Y-%m-%d-%H%M%S)

dry_run=false
public_key=""
for arg in "$@"; do
	case "$arg" in
		--dry-run) dry_run=true ;;
		-h | --help)
			sed -n '2,24p' "$0"
			exit 0
			;;
		*) public_key=$arg ;;
	esac
done

say() { printf '%s\n' "$*"; }
die() {
	printf 'error: %s\n' "$*" >&2
	exit 1
}
step() { printf '\n== %s\n' "$*"; }

# ---------------------------------------------------------------- preflight
step "Preflight"
[[ -n "$public_key" ]] || die "pass the staging deploy PUBLIC key as the argument"
[[ "$public_key" != *PRIVATE* ]] || die "that is a private key; pass the .pub line"
ssh-keygen -l -f /dev/stdin <<<"$public_key" >/dev/null 2>&1 ||
	die "the argument is not a valid SSH public key line"
key_body=$(awk '{print $2}' <<<"$public_key")

if ! $dry_run && [[ $EUID -ne 0 ]]; then
	die "run with sudo (or add --dry-run)"
fi
command -v caddy >/dev/null || die "caddy is not installed"
[[ -r "$CADDYFILE" ]] || die "cannot read $CADDYFILE"
[[ -d "$PROD_DIST" ]] || die "prod dist dir $PROD_DIST not found"

if [[ -z "${AUTHORIZED_KEYS:-}" ]]; then
	deploy_home=$(getent passwd "$DEPLOY_USER" | cut -d: -f6) ||
		die "user $DEPLOY_USER not found"
	AUTHORIZED_KEYS="$deploy_home/.ssh/authorized_keys"
fi
[[ -r "$AUTHORIZED_KEYS" ]] || die "cannot read $AUTHORIZED_KEYS"
$dry_run && say "dry run: nothing will be written"
say "ok"

# ---------------------------------------------------------------- 1. dist dir
step "1. Staging dist dir $STAGING_DIST"
if [[ -d "$STAGING_DIST" ]]; then
	say "exists, skipped"
else
	owner=$(stat -c '%U' "$PROD_DIST")
	group=$(stat -c '%G' "$PROD_DIST")
	mode=$(stat -c '%a' "$PROD_DIST")
	say "install -d -o $owner -g $group -m $mode $STAGING_DIST (copied from $PROD_DIST)"
	$dry_run || install -d -o "$owner" -g "$group" -m "$mode" "$STAGING_DIST"
fi

# ---------------------------------------------------------------- 2. deploy key
step "2. rrsync-locked key in $AUTHORIZED_KEYS"
if grep -qF -- "$key_body" "$AUTHORIZED_KEYS"; then
	say "key already present, skipped"
else
	prod_lines=$(grep -F -- "$PROD_DIST" "$AUTHORIZED_KEYS" | grep -F rrsync || true)
	[[ -n "$prod_lines" ]] || die "no rrsync key for $PROD_DIST in $AUTHORIZED_KEYS; add the staging entry by hand (docs/DEPLOYMENT.md, Staging)"
	[[ $(wc -l <<<"$prod_lines") -eq 1 ]] || die "several keys reference $PROD_DIST; add the staging entry by hand"
	# Options are everything before the key type (they may hold quoted spaces).
	prod_options=$(sed -E 's/[[:space:]]*(ssh-(ed25519|rsa|dss)|ecdsa-sha2-[^[:space:]]+|sk-[^[:space:]]+)[[:space:]]+AAAA.*$//' <<<"$prod_lines")
	[[ -n "$prod_options" && "$prod_options" != "$prod_lines" ]] || die "could not read the prod key's options"
	staging_options=${prod_options//"$PROD_DIST"/"$STAGING_DIST"}
	[[ "$staging_options" == *"$STAGING_DIST"* && "$staging_options" != *"$PROD_DIST"* ]] ||
		die "could not point the options at $STAGING_DIST"
	entry="$staging_options $public_key"
	say "append: $entry"
	if ! $dry_run; then
		cp -p "$AUTHORIZED_KEYS" "$AUTHORIZED_KEYS.bak-$STAMP"
		printf '%s\n' "$entry" >>"$AUTHORIZED_KEYS"
	fi
fi

# ---------------------------------------------------------------- 3. caddy
step "3. Caddy block for $STAGING_HOST in $CADDYFILE"

# Prints the top-level site block whose address line starts with the host.
extract_block() {
	awk -v host="$1" '
		function opens(s) { return gsub(/\{/, "{", s) }
		function closes(s) { return gsub(/\}/, "}", s) }
		!inside && depth == 0 {
			line = $0
			sub(/^[[:space:]]+/, "", line)
			sub(/^https:\/\//, "", line)
			if (index(line, host) == 1 && substr(line, length(host) + 1, 1) ~ /[[:space:],:{]/) {
				inside = 1
			}
		}
		{
			if (inside) print
			depth += opens($0) - closes($0)
			if (inside && depth == 0 && opens($0) + closes($0) > 0) exit
		}
	' "$CADDYFILE"
}

staging_block() {
	local first=true line
	while IFS= read -r line; do
		if $first; then
			first=false
			printf '%s {\n' "$STAGING_HOST"
			printf '    # Copy of %s, made by scripts/staging/owner-setup.sh on %s.\n' "$PROD_HOST" "$STAMP"
			printf '    header X-Robots-Tag "noindex"\n'
			printf '    @staging_nocache path / /index.html /sw.js /manifest.webmanifest\n'
			printf '    header @staging_nocache Cache-Control "no-cache"\n'
			continue
		fi
		printf '%s\n' "${line//"$PROD_DIST"/"$STAGING_DIST"}"
	done
}

if extract_block "$STAGING_HOST" | grep -q .; then
	say "a $STAGING_HOST block exists, skipped"
else
	prod_block=$(extract_block "$PROD_HOST")
	[[ -n "$prod_block" ]] || die "no $PROD_HOST block at the top level of $CADDYFILE; add the staging block by hand (docs/DEPLOYMENT.md, Staging)"
	grep -qF -- "$PROD_DIST" <<<"$prod_block" || die "the $PROD_HOST block does not serve $PROD_DIST"
	new_block=$(staging_block <<<"$prod_block")
	if grep -qF -- "$PROD_DIST" <<<"$new_block"; then
		die "the staging block still references $PROD_DIST"
	fi
	tls_line=$(grep -E '^[[:space:]]*tls([[:space:]]|$)' <<<"$prod_block" | sed -E 's/^[[:space:]]+//' || true)
	say "TLS in the copied block: ${tls_line:-none (Caddy automatic HTTPS)}"
	say "append:"
	printf '%s\n' "$new_block"

	if $dry_run; then
		candidate=$(mktemp)
		trap 'rm -f "$candidate"' EXIT
		cat "$CADDYFILE" >"$candidate"
		printf '\n%s\n' "$new_block" >>"$candidate"
		if (cd "$(dirname "$CADDYFILE")" && caddy validate --config "$candidate" --adapter caddyfile >/dev/null 2>&1); then
			say "dry run: the result validates"
		else
			say "dry run: caddy validate did not pass on a temp copy (imports, cert files or permissions may need the real run); the real run validates again and rolls back on failure"
		fi
	else
		backup="$CADDYFILE.bak-$STAMP"
		cp -p "$CADDYFILE" "$backup"
		printf '\n%s\n' "$new_block" >>"$CADDYFILE"
		if ! caddy validate --config "$CADDYFILE" --adapter caddyfile; then
			cp -p "$backup" "$CADDYFILE"
			die "caddy validate failed; restored $CADDYFILE from $backup"
		fi
		if ! systemctl reload caddy; then
			cp -p "$backup" "$CADDYFILE"
			die "caddy reload failed; restored $CADDYFILE from $backup (fix the reload error, then rerun)"
		fi
		say "Caddy reloaded (backup: $backup)"
	fi
fi

step "Done"
say "Next: the proxied DNS record and the cache rule (docs/DEPLOYMENT.md, Staging)."
say "After DNS is live: journalctl -u caddy --since '-10 min' | grep -i $STAGING_HOST"
