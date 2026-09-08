#!/usr/bin/env bash
# Builds demo-static/, the prebuilt copy of /dierbergs-demo that is published to
# https://axon-dierbergs-demo.surge.sh. Asset URLs are root-relative, so the
# folder can be dropped on any static host that serves it from a domain root.
# To host it under a sub-path instead, set NEXT_PUBLIC_ASSET_BASE to that
# prefix (e.g. https://example.com/demo) before running.
set -euo pipefail

cd "$(dirname "$0")/.."

export DEMO_EXPORT=1
export NEXT_PUBLIC_BUILD_STAMP="$(date -u "+%Y-%m-%d %H:%M UTC")"
export NEXT_PUBLIC_ASSET_BASE="${NEXT_PUBLIC_ASSET_BASE:-}"

rm -rf out demo-static
npx next build

mkdir -p demo-static
cp -r out/_next out/dierbergs out/dierbergs-demo demo-static/
cp out/404.html demo-static/404.html
cp out/icon.png demo-static/icon.png
# Served from the domain root, so the demo is also the index.
cp out/dierbergs-demo/index.html demo-static/index.html

# Same build, dropped into public/ so the Express server serves it at
# /dierbergs-demo. Hosted there it can reach /api/tts on its own origin, so the
# neural voice uses the server's key and nothing needs configuring.
rm -rf public/dierbergs-demo public/_next
cp -r out/dierbergs-demo public/dierbergs-demo
cp -r out/_next public/_next

echo "demo-static/ rebuilt. Publish with:"
echo "  npx surge --project ./demo-static --domain axon-dierbergs-demo.surge.sh"
echo "public/dierbergs-demo/ rebuilt: served by the Express app at /dierbergs-demo"
