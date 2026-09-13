#!/usr/bin/env bash
#
# Build first, then test. In that order, always.
#
# The demo is served out of public/dierbergs-demo/, and anything in public/ is
# served ahead of the app route it shadows — including by `next dev`. So running
# the browser suites straight after an edit tests the last build rather than the
# edit, silently and convincingly. This script exists so that cannot happen
# again: it rebuilds, then runs every suite against what it just built.
set -euo pipefail

cd "$(dirname "$0")/.."

URL="${1:-http://localhost:3001/dierbergs-demo}"

echo "── rebuilding, so the suites test this code and not the last build"
bash scripts/build-demo-static.sh >/dev/null
echo

echo "── arithmetic and business model (no browser)"
npm run --silent demo:cost
echo

FAILED=0
for suite in demo milk milk-talk depth packshots scale voice-fallback neural-voice cells aisles specials conversation realtime; do
  file="scripts/test-dierbergs-${suite}.mjs"
  [ -f "$file" ] || continue
  echo "── ${suite}"
  if ! node "$file" "$URL"; then
    FAILED=$((FAILED + 1))
  fi
  echo
done

if [ "$FAILED" -gt 0 ]; then
  echo "${FAILED} suite(s) failed."
  exit 1
fi
echo "All suites passed."
