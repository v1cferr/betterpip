#!/usr/bin/env bash
# V1C-129 on the host Hyprland desktop, no questions asked.
#
# For Firefox and then Zen: opens one browser window and its PiP window ON YOUR DESKTOP for
# roughly 20 s, clicks the "Above others" / "Follow workspaces" toggles in a fixed sequence,
# and reads each state back from `hyprctl clients`. The helper's manifest lives in a
# throw-away HOME; nothing is written to your Hyprland or browser config. Audio is muted
# (media.volume_scale = 0). Results: experiments/v1c-129/out/<browser>-hyprland-headed.json
set -euo pipefail
unset LD_LIBRARY_PATH
here=$(cd "$(dirname "$0")" && pwd)
[[ -n ${HYPRLAND_INSTANCE_SIGNATURE:-} ]] || { echo "Run this from your Hyprland session." >&2; exit 1; }
py=$(nix build --no-link --print-out-paths --impure --expr \
  '(builtins.getFlake "nixpkgs").legacyPackages.x86_64-linux.python3.withPackages (p: [p.selenium])')/bin/python3
gd=$(nix build --no-link --print-out-paths nixpkgs#geckodriver)/bin/geckodriver
firefox=$(nix build --no-link --print-out-paths nixpkgs#firefox)/bin/firefox
"$py" "$here/pin_lab.py" --quick --host-compositor --geckodriver "$gd" --browser "$firefox" --label firefox-hyprland
if zen=$(command -v zen-beta); then
  "$py" "$here/pin_lab.py" --quick --host-compositor --geckodriver "$gd" --browser "$zen" --label zen-hyprland
fi
echo "Done: $(dirname "$here")/out/"
