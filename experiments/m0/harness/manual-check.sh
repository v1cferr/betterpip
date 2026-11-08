#!/usr/bin/env bash
# One command for the V1C-120 manual checks (M1-M8) on the host Hyprland desktop.
#
# Opens real browser windows on YOUR desktop, one browser after the other, each with a
# throw-away profile and the probe extension. Follow the prompts in this terminal.
# Results: experiments/m0/out/manual-<browser>.json.
#
# Usage: experiments/m0/harness/manual-check.sh [firefox|zen|both]   (default: both)
set -euo pipefail
unset LD_LIBRARY_PATH  # some shells export one that breaks Nix-store binaries

here=$(cd "$(dirname "$0")" && pwd)
lab=$(dirname "$here")
which=${1:-both}

[[ -n ${HYPRLAND_INSTANCE_SIGNATURE:-} ]] || { echo "Run this from your Hyprland session." >&2; exit 1; }

echo "Preparing tools from nixpkgs (first run may take a moment)..."
py=$(nix build --no-link --print-out-paths --impure --expr \
  '(builtins.getFlake "nixpkgs").legacyPackages.x86_64-linux.python3.withPackages (p: [p.selenium])')/bin/python3
gd=$(nix build --no-link --print-out-paths nixpkgs#geckodriver)/bin/geckodriver
firefox=$(nix build --no-link --print-out-paths nixpkgs#firefox)/bin/firefox
zen=$(command -v zen-beta || true)

if [[ ! -f $lab/fixtures/clock.webm ]]; then
  FFMPEG=$(nix build --no-link --print-out-paths nixpkgs#ffmpeg-headless.bin)/bin/ffmpeg "$lab/fixtures/make-fixture.sh"
fi

run() { "$py" "$here/manual_check.py" --geckodriver "$gd" --browser "$1" --label "$2"; }
case $which in
  firefox) run "$firefox" firefox ;;
  zen) run "${zen:?zen-beta not found}" zen ;;
  both)
    run "$firefox" firefox
    if [[ -n $zen ]]; then
      read -rp $'\nFirefox done. Press Enter to start Zen (Ctrl+C to stop)... '
      run "$zen" zen
    fi ;;
  *) echo "usage: $0 [firefox|zen|both]" >&2; exit 2 ;;
esac
echo -e "\nDone. Results are in $lab/out/manual-*.json"
