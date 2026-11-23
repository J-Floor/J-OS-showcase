#!/usr/bin/env bash
# Builds the TV app and packs it as a .wgt. Needs the Tizen Studio CLI (`tizen`)
# and a Samsung certificate profile. Not run in CI.
#   VITE_TV_API_URL=<convex-site-url> VITE_TV_APP_URL=<app-origin> \
#   TIZEN_PROFILE=<certificate-profile> scripts/package.sh
set -euo pipefail

: "${VITE_TV_API_URL:?set VITE_TV_API_URL to the Convex site URL}"
: "${VITE_TV_APP_URL:?set VITE_TV_APP_URL to the web app origin}"
: "${TIZEN_PROFILE:?set TIZEN_PROFILE to your Tizen certificate profile name}"

cd "$(dirname "$0")/.."
export VITE_TV_API_URL VITE_TV_APP_URL
bun run build:release
tizen package -t wgt -s "$TIZEN_PROFILE" -- dist
