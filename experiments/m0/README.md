# M0 lab — Document PiP feasibility (V1C-120)

Throw-away experiments for [V1C-120](https://v1cferr.atlassian.net/browse/V1C-120). **Not product
code**: no WXT, no Svelte, no build step. Findings live in
[docs/spikes/V1C-120](../../docs/spikes/V1C-120/README.md) and
[ADR 0001](../../docs/adr/0001-pip-window-backend.md).

## Layout

| Path | Purpose |
| --- | --- |
| `fixtures/make-fixture.sh` | Generates `clock.webm`: synthetic 120 s VP9/Opus, burned-in clock, 440 Hz bed + 1 kHz blip per second. Not versioned. |
| `site/index.html`, `site/lab.js` | Page-world probe: feature detection (E1), HTML-only PiP (E2), moving the original `<video>` (E3), layout states (E4), native PiP (B). |
| `site/pip.css` | Minimal / Overlay / Docked probe with a container-query fallback. Not the product design. |
| `site/csp.html`, `site/csp.js`, `site/csp-*.css` | CSP probe (E7). The server sends the page with the policy named by `?csp=` (`none`, `strict`, `tt`). |
| `site/iframe.html`, `site/frame.html` | Cross-origin iframe probe (127.0.0.1 page, `localhost` frame). |
| `extension/` | Temporary MV3 probe: isolated, `wrappedJSObject`, MAIN-world, keydown, background, command → `scripting.executeScript`, extension page and `windows.create` contexts. Also the content-script CSP probe (`cs-csp.js`, E7) and a tab-visibility probe. |
| `harness/server.py` | Static server on 127.0.0.1 that logs every media request (evidence for "no second stream"). |
| `harness/run_lab.py` | Selenium + geckodriver driver; writes one JSON file per browser run. |
| `harness/manual-check.sh`, `harness/manual_check.py` | Guided manual checks M1–M8 on the host Hyprland desktop (opens real windows on purpose). |
| `harness/isolated-wayland.sh` | Runs a command in an invisible headless sway session with a temporary null audio sink. |
| `results/` | Curated JSON output of the runs cited by the spike report. |

## Why WebDriver clicks count

`requestWindow()` needs transient user activation. geckodriver input actions are dispatched by
the parent process as trusted events (`isTrusted: true` is recorded for every click), so they
activate the page like a real click. Calls made through `execute_script` are *not* activated,
which is why every opener is a button the harness clicks.

## Running

Everything comes from nixpkgs into the Nix store; nothing is installed globally and no browser
profile of the user is touched (each scenario gets a fresh temporary profile).

```sh
nix build --no-link nixpkgs#firefox nixpkgs#geckodriver nixpkgs#ffmpeg-headless \
  nixpkgs#sway nixpkgs#pulseaudio
py=$(nix build --no-link --print-out-paths --impure --expr \
  '(builtins.getFlake "nixpkgs").legacyPackages.x86_64-linux.python3.withPackages (p: [p.selenium])')/bin/python3

# Some shells export an LD_LIBRARY_PATH that breaks Nix-store binaries; drop it.
unset LD_LIBRARY_PATH
cd experiments/m0
FFMPEG=$(nix build --no-link --print-out-paths nixpkgs#ffmpeg-headless.bin)/bin/ffmpeg ./fixtures/make-fixture.sh

export PATH=$(nix build --no-link --print-out-paths nixpkgs#sway)/bin:$(nix build --no-link --print-out-paths nixpkgs#pulseaudio)/bin:$PATH
gd=$(nix build --no-link --print-out-paths nixpkgs#geckodriver)/bin/geckodriver

# Isolated: invisible Wayland session, inaudible audio sink (recorded and analysed).
./harness/isolated-wayland.sh "$py" harness/run_lab.py --geckodriver "$gd" \
  --browser "$(nix build --no-link --print-out-paths nixpkgs#firefox)/bin/firefox" --label firefox
./harness/isolated-wayland.sh "$py" harness/run_lab.py --geckodriver "$gd" \
  --browser "$(command -v zen-beta)" --label zen

# Headless (no compositor at all):
"$py" harness/run_lab.py --geckodriver "$gd" --browser … --label … --headless
```

Scenarios: E1 contexts, E2 HTML window, E3 video move and audio, E4 layout, E5 lifecycle and
compositor, E6 YouTube, E7 page CSP, E8 keyboard focus. `--only E3,E4` runs a subset; `--youtube URL` adds E6. `--host-compositor` observes the host
Hyprland session instead and **opens real windows on the desktop**; use it only on purpose.

## What automation cannot prove

The isolated compositor is sway, not the user's Hyprland, and nothing in it competes with
other applications. Always-on-top across real applications, physical edge/corner drags and
focus/stacking on the host desktop are covered by the manual checklist in the spike report.
