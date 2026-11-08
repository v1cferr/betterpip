# V1C-129 lab — PiP pin control through a native messaging helper

Throw-away spike for [V1C-129](https://v1cferr.atlassian.net/browse/V1C-129) and
[ADR 0002](../../docs/adr/0002-pip-window-pin-control.md). **Not product code.** Findings:
[docs/spikes/V1C-129](../../docs/spikes/V1C-129/README.md).

| Path | Purpose |
| --- | --- |
| `host/betterpip_pin_host.py` | Minimal native messaging host. Closed message set (`getState`, `setAbove`, `setFollowWorkspaces`), token-matched window lookup, sway and Hyprland backends, no shell. |
| `extension/` | MV3 probe: opens a Document PiP window titled `BetterPiP <token>` with "Above others" / "Follow workspaces" toggles; the background relays to the host. |
| `harness/pin_lab.py` | Reuses the M0 harness. Each scenario gets a throw-away `HOME` holding the host manifest, so nothing is installed for the real user. |
| `harness/hyprland-check.sh` | Same toggle sequence on the host Hyprland desktop, no prompts (opens real windows for ~20 s per browser, muted). |
| `results/` | Curated JSON of the runs cited by the report. |

Run isolated (from `experiments/v1c-129`, tools as in [the M0 README](../m0/README.md)):

```sh
../m0/harness/isolated-wayland.sh "$py" harness/pin_lab.py --geckodriver "$gd" --browser "$firefox" --label firefox
```
