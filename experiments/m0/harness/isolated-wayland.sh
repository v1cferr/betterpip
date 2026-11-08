#!/usr/bin/env bash
# Runs a command inside a throw-away, invisible Wayland session (V1C-120 M0 lab).
#
# sway (wlroots) with the headless backend and the pixman software renderer: no GPU, no
# DRM, no input devices, no XWayland, no window on the host desktop. The host session's
# WAYLAND_DISPLAY/DISPLAY/HYPRLAND_* are dropped so the browser cannot reach it.
#
# Audio stays real but inaudible: a temporary PipeWire/PulseAudio null sink is loaded for
# the run and PULSE_SINK points the browser at it. Nothing reaches the host's speakers, and
# the harness can record the sink's monitor to measure the audio (gaps, duplicate streams).
# The module is unloaded on exit. Set M0_NO_AUDIO_SINK=1 to skip it.
#
# Usage: isolated-wayland.sh <command> [args...]
# Needs: sway, pactl/parec on PATH (e.g. `nix build nixpkgs#sway nixpkgs#pulseaudio`).
set -euo pipefail

runtime=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}
work=$(mktemp -d)
cat > "$work/config" <<EOF
xwayland disable
output HEADLESS-1 resolution 1920x1080 position 0 0
default_border normal
EOF

sink="betterpip_m0_$$"
cleanup() {
  [ -n "${sink_module:-}" ] && pactl unload-module "$sink_module" 2>/dev/null
  [ -n "${sway_pid:-}" ] && kill "$sway_pid" 2>/dev/null
  rm -rf "$work"
}
trap cleanup EXIT

if [ -z "${M0_NO_AUDIO_SINK:-}" ]; then
  sink_module=$(pactl load-module module-null-sink sink_name="$sink" \
    sink_properties=device.description=BetterPiP-M0-null-sink rate=48000 channels=2)
fi

# sway picks the first free wayland-N name itself; find the socket that appears.
before=$(ls "$runtime" | grep -E '^wayland-[0-9]+$' || true)
env -i HOME="$HOME" PATH="$PATH" USER="${USER:-}" XDG_RUNTIME_DIR="$runtime" \
  WLR_BACKENDS=headless WLR_LIBINPUT_NO_DEVICES=1 WLR_RENDERER=pixman \
  sway --config "$work/config" >"$work/sway.log" 2>&1 &
sway_pid=$!

socket=""
for _ in $(seq 100); do
  socket=$(ls "$runtime" | grep -E '^wayland-[0-9]+$' | grep -vxF "$before" | head -1 || true)
  [ -n "$socket" ] && [ -S "$runtime/$socket" ] && break
  sleep 0.1
done
[ -n "$socket" ] || { echo "headless sway did not start" >&2; cat "$work/sway.log" >&2; exit 1; }
# sway names its IPC socket itself; prefer the one owned by this sway process.
ipc=$(ls "$runtime"/sway-ipc.*."$sway_pid".sock 2>/dev/null | head -1 || true)
[ -n "$ipc" ] || ipc="$work/sway.sock"

env -u DISPLAY -u HYPRLAND_INSTANCE_SIGNATURE -u HYPRLAND_CMD -u LD_LIBRARY_PATH \
  WAYLAND_DISPLAY="$socket" SWAYSOCK="$ipc" XDG_SESSION_TYPE=wayland \
  XDG_CURRENT_DESKTOP=sway-headless MOZ_ENABLE_WAYLAND=1 \
  ${sink_module:+PULSE_SINK="$sink" M0_AUDIO_SINK="$sink"} \
  "$@"
