#!/usr/bin/env bash
# Generate a self-signed PKCS#12 for sealing J floor agreements, then print the
# Convex env values to set. Run once; back up the .p12 securely.
#
#   bash scripts/gen-signing-cert.sh "a-strong-passphrase"
#
# SECURITY: This script prints the private-key-bearing P12 base64 and the
# passphrase to stdout. Run it in a private shell session and clear your
# scrollback afterward (or redirect output to a chmod 600 file).
#
# Set these two env vars in Convex (prod + dev as needed):
#   bunx convex env set AGREEMENT_SIGNING_P12 "<base64>"
#   bunx convex env set AGREEMENT_SIGNING_P12_PASS "<passphrase>"
#
# AGREEMENT_SIGNING_CERT_FINGERPRINT is no longer required — the app derives
# the fingerprint from the P12 at runtime. The fingerprint printed below is
# for reference / cross-check only (e.g. to verify the correct cert is loaded).
set -euo pipefail

PASS="${1:?usage: gen-signing-cert.sh <passphrase>}"
DIR="$(mktemp -d)"
SUBJ="/CN=J floor Board/O=J floor/L=Lausanne/C=CH"

openssl req -x509 -newkey rsa:2048 -keyout "$DIR/key.pem" -out "$DIR/cert.pem" \
	-days 3650 -nodes -subj "$SUBJ"
openssl pkcs12 -export -inkey "$DIR/key.pem" -in "$DIR/cert.pem" \
	-out "$DIR/signing.p12" -passout "pass:$PASS"

FP="$(openssl x509 -in "$DIR/cert.pem" -noout -fingerprint -sha256 \
	| sed 's/^.*=//')"
B64="$(base64 -w0 < "$DIR/signing.p12" 2>/dev/null || base64 < "$DIR/signing.p12" | tr -d '\n')"

echo "=== set these Convex env vars (keep the .p12/passphrase backed up) ==="
echo "AGREEMENT_SIGNING_P12=$B64"
echo "AGREEMENT_SIGNING_P12_PASS=$PASS"
echo "=== cert fingerprint (for reference / cross-check only — not required as env var) ==="
echo "SHA-256 fingerprint: $FP"
echo "=== p12 written to: $DIR/signing.p12 (move it somewhere safe) ==="
