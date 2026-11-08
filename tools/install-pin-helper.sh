#!/usr/bin/env bash
# Installs (or with --uninstall removes) the optional BetterPiP pin helper for this user.
#
# Writes only two things, both under your home directory:
#   ~/.local/share/betterpip/betterpip-pin-host            (launcher for native/betterpip_pin_host.py)
#   ~/.mozilla/native-messaging-hosts/betterpip_pin.json   (read by Firefox and Zen; V1C-129)
# Nothing is written to your compositor or browser configuration. Then allow the helper in
# BetterPiP settings (about:addons → BetterPiP → Preferences → "Allow pin helper").
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
share="$HOME/.local/share/betterpip"
manifest="$HOME/.mozilla/native-messaging-hosts/betterpip_pin.json"

if [[ ${1:-} == --uninstall ]]; then
  rm -f "$manifest" "$share/betterpip-pin-host" "$share/betterpip_pin_host.py"
  rmdir "$share" 2>/dev/null || true
  echo "Removed the BetterPiP pin helper."
  exit 0
fi

py=$(command -v python3 || true)
if [[ -z $py ]] && command -v nix >/dev/null; then
  py=$(nix build --no-link --print-out-paths nixpkgs#python3)/bin/python3
fi
[[ -n $py ]] || { echo "python3 is required" >&2; exit 1; }

mkdir -p "$share" "$(dirname "$manifest")"
install -m 0644 "$repo/native/betterpip_pin_host.py" "$share/betterpip_pin_host.py"
cat > "$share/betterpip-pin-host" <<SH
#!/bin/sh
exec "$py" -I "$share/betterpip_pin_host.py" "\$@"
SH
chmod 0755 "$share/betterpip-pin-host"
cat > "$manifest" <<JSON
{
  "name": "betterpip_pin",
  "description": "BetterPiP pin helper (keeps the PiP window above others / on all workspaces)",
  "path": "$share/betterpip-pin-host",
  "type": "stdio",
  "allowed_extensions": ["betterpip@v1cferr"]
}
JSON
echo "Installed. Manifest: $manifest"
echo "Next: about:addons → BetterPiP → Preferences → Allow pin helper."
