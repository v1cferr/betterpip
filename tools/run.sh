#!/usr/bin/env bash
# One command to try BetterPiP: prepares the toolchain, installs, and opens a browser with a
# throw-away profile and the extension loaded. Edits under src/ reload automatically.
#
#   tools/run.sh            # Zen if installed, otherwise Firefox (from nixpkgs)
#   tools/run.sh firefox    # force Firefox
#   tools/run.sh zen        # force Zen
#   BP_START_URL=https://… tools/run.sh
#
# Your own browser profile is not touched. Close the browser (or Ctrl+C) to stop.
set -euo pipefail
unset LD_LIBRARY_PATH  # some shells export one that breaks Nix-store binaries
cd "$(dirname "$0")/.."

need() { command -v "$1" >/dev/null || PATH="$(nix build --no-link --print-out-paths "nixpkgs#$2")/bin:$PATH"; }
need node nodejs
need pnpm pnpm
export PATH

case ${1:-auto} in
  zen) BP_BROWSER=$(command -v zen-beta || command -v zen) ;;
  firefox) BP_BROWSER=$(command -v firefox || echo "$(nix build --no-link --print-out-paths nixpkgs#firefox)/bin/firefox") ;;
  auto) BP_BROWSER=$(command -v zen-beta || command -v zen || command -v firefox || echo "$(nix build --no-link --print-out-paths nixpkgs#firefox)/bin/firefox") ;;
  *) echo "usage: $0 [zen|firefox]" >&2; exit 2 ;;
esac
export BP_BROWSER
echo "BetterPiP: opening $BP_BROWSER"

pnpm install --frozen-lockfile --reporter=silent
exec pnpm dev
