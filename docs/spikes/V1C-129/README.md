# V1C-129 spike — pin control for the PiP window

| | |
| --- | --- |
| Jira | [V1C-129](https://v1cferr.atlassian.net/browse/V1C-129) (parent [V1C-119](https://v1cferr.atlassian.net/browse/V1C-119)) |
| Date | 2026-11-08 |
| Decision record | [ADR 0002 — PiP window pin control](../../adr/0002-pip-window-pin-control.md) (Proposed) |
| Lab | [`experiments/v1c-129/`](../../../experiments/v1c-129/README.md) |
| Status | Demonstrated on isolated sway and on the host **Hyprland 0.57.1** desktop, for Firefox 159.0 and Zen 1.24b. |

## Summary

The pin control works when the extension delegates the compositor call to a small native
messaging helper. On Hyprland 0.57.1 and in an isolated sway session, for Firefox and Zen, toggles in the PiP window
moved the window between tiled, floating ("above others") and floating + sticky/pinned
("follow workspaces"). Every state the helper reported matched what the compositor showed. Each round
trip took 44–137 ms, and the helper rejected every malformed or hostile message tried.

The two options are **not independent** on either compositor checked. Following workspaces
only exists for floating windows, so turning it on also turns on "above others", and turning
"above others" off also turns off "follow workspaces". The helper reports these implied
changes and the UI reflects them.

## Method

- Same isolation as M0: headless sway 1.12 with no GPU, a null audio sink, and fresh
  profiles. The extension is installed as temporary.
- Every scenario runs the browser with a **throw-away `HOME`**. The host manifest is written
  there and deleted afterwards, so nothing is installed for the real user.
- The extension opens a Document PiP window titled `BetterPiP bp-<random token>` with two
  `aria-pressed` toggle buttons. The harness clicks them with trusted WebDriver input.
  After each click it compares the helper's reply with the window state that sway reports
  (`swaymsg -t get_tree`).
- Host security cases are sent straight to the helper over the native messaging framing.

## Findings

| Check | Firefox 159.0 | Zen 1.24b |
| --- | --- | --- |
| `runtime.sendNativeMessage` from the background reaches the helper | PASS | PASS |
| Manifest location read from `HOME` | `~/.mozilla/native-messaging-hosts` only | same (not `~/.zen/…`, not `~/.config/mozilla/…`) |
| Window found by the title token (exactly one match) | PASS | PASS |
| Toggle sequence (7 steps), helper state = compositor state | PASS | PASS |
| Implied changes reported (`followWorkspaces` ⇒ `above`; `¬above` ⇒ `¬followWorkspaces`) | PASS | PASS |
| Latency per toggle (one-shot `sendNativeMessage`) | 44–75 ms | 55–137 ms |
| Manifest `allowed_extensions` lists another extension → refused | PASS ("No such native application") | PASS |
| No helper installed → error the UI can show | PASS (same message) | PASS |

Helper security, identical in both runs:

| Hostile input | Result |
| --- | --- |
| Unknown operation (`exec`) | `unsupported-op` |
| Token with quotes and a shell command | `bad-token` (token is only ever compared, never interpolated) |
| Token not shaped `bp-[a-z0-9]{8,32}` | `bad-token` |
| Non-boolean value (`"true; kill"`) | `bad-value` |
| Oversized message (70 KiB) / invalid JSON | `bad-message` |
| No supported compositor in the environment | `unsupported-compositor` |

Commands address the window only by the compositor's own id: sway `con_id` (an integer) or a
Hyprland address that is validated against `^0x[0-9a-f]+$`. The helper uses no shell.

### Hyprland 0.57.1 (host desktop, `harness/hyprland-check.sh`, no prompts)

| Check | Firefox 159.0 | Zen 1.24b |
| --- | --- | --- |
| Toggle sequence (7 steps), helper state = `hyprctl clients` state | PASS | PASS |
| `hl.dsp.window.float({ action = "toggle" })` and `hl.dsp.window.pin({ window = … })` toggle as expected | PASS | PASS |
| Implied changes reported and applied | PASS | PASS |
| Latency per toggle | 63–87 ms | 61–104 ms |
| Helper security cases (as above) | PASS | PASS |

In this run the PiP window opened **tiled** (2518×1380). Floating it gave 1280×1040, and
turning floating off returned it to the tile. In the V1C-120 manual checks it opened
floating. The difference is unexplained; the probe requested 420×160 here and 640×400
there. The control works from either starting state.

## Compositor mapping

| Option | sway (tested) | Hyprland 0.57.1 (tested; persistence notes from its Lua API) |
| --- | --- | --- |
| Above others | `floating enable`: above tiled windows of the workspace | `window.float`: above tiled windows of the workspace. No persistent "keep above" property was found; `alter_zorder` and `bring_to_top` act once. |
| Follow workspaces | `sticky enable`, effective only while floating | `window.pin` (floating only), shown on every workspace |
| Independent? | No: follow ⇒ above | No: follow ⇒ above |
| Over fullscreen windows | Not measured | Governed by `binds.allow_pin_fullscreen` / `pin_fullscreened` (inferred, not measured) |

On X11 window managers, `_NET_WM_STATE_ABOVE` and `_NET_WM_STATE_STICKY` are independent
EWMH states. That is the only environment seen so far where the two options could be fully
separate. Not tested.

## Not established

- Whether a floating window stays above **other floating** or fullscreen windows.
- Packaging and installing the helper for users, Windows/macOS, KDE/GNOME (V1C-127 scope).
- Requesting `nativeMessaging` as an *optional* permission at the moment the user enables
  the control. The probe declares it up front.
