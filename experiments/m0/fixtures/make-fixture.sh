#!/usr/bin/env bash
# Generates the synthetic M0 test video (V1C-120). No third-party footage: the picture is
# ffmpeg's testsrc2 pattern with a burned-in clock, the audio a plain 440 Hz tone with a
# 1 kHz blip every second, so a duplicated or restarted stream is audible and visible.
#
# Output: clock.webm (VP9 + Opus, 1280x720, 30 fps, 120 s). It is generated, not committed.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
out="$here/clock.webm"
ffmpeg_bin=${FFMPEG:-ffmpeg}

# drawtext needs a font; fall back to the plain pattern when fontconfig finds none.
video_filter="drawtext=text='%{pts\:hms}':fontsize=96:fontcolor=white:box=1:boxcolor=black@0.6:x=(w-tw)/2:y=h-th-40"
if ! fc-match -q monospace >/dev/null 2>&1; then video_filter="null"; fi

"$ffmpeg_bin" -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=120" \
  -f lavfi -i "sine=frequency=440:duration=120:sample_rate=48000" \
  -f lavfi -i "sine=frequency=1000:duration=120:sample_rate=48000,volume='if(lt(mod(t,1),0.05),1,0)':eval=frame" \
  -filter_complex "[0:v]${video_filter}[v];[1:a]volume=0.25[a1];[2:a]volume=0.5[a2];[a1][a2]amix=inputs=2:normalize=0[a]" \
  -map "[v]" -map "[a]" \
  -c:v libvpx-vp9 -b:v 600k -deadline realtime -cpu-used 8 -row-mt 1 \
  -c:a libopus -b:a 64k \
  "$out"

echo "$out"
