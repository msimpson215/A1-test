#!/usr/bin/env bash
# Builds the shareable static copy of /dierbergs-demo that is served from
# raw.githack.com straight off this branch. Asset URLs are absolute because the
# demo lives under a CDN sub-path, so the branch name is baked in at build time.
set -euo pipefail

BRANCH="${BRANCH:-cursor/axon-dierbergs-shopper-1680}"
export DEMO_EXPORT=1
export NEXT_PUBLIC_ASSET_BASE="https://raw.githack.com/msimpson215/A1-test/${BRANCH}/demo-static"

cd "$(dirname "$0")/.."

rm -rf out demo-static
npx next build

mkdir -p demo-static
cp -r out/_next out/dierbergs out/dierbergs-demo demo-static/
cp out/index.html out/404.html demo-static/

echo "demo-static/ rebuilt for ${NEXT_PUBLIC_ASSET_BASE}"
