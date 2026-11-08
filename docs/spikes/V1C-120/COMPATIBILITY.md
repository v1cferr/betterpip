# V1C-120 — Compatibility matrix

Dated **2026-11-08**. Results from [the M0 lab](../../../experiments/m0/README.md); raw evidence
in [`experiments/m0/results/`](../../../experiments/m0/results/). Methodology and caveats are
in the [spike report](README.md). **Nothing here is a support claim beyond these exact builds.**

## Environments

| ID | Browser | Build | Host OS | Display path | Evidence type |
| --- | --- | --- | --- | --- | --- |
| FX-H | Firefox 159.0 (nixpkgs) | BuildID 20261022150525 | NixOS 26.05, Linux 7.3.1 | `-headless`, no compositor | Automated |
| FX-W | Firefox 159.0 (nixpkgs) | BuildID 20261022150525 | NixOS 26.05, Linux 7.3.1 | Isolated headless **sway 1.12** (wlroots, Wayland, pixman) | Automated |
| ZEN-W | Zen 1.24b (Gecko 159.0) | BuildID 20261029123729 | NixOS 26.05, Linux 7.3.1 | Isolated headless **sway 1.12** | Automated |
| HYPR | Firefox 159 / Zen 1.24b | as above | NixOS 26.05, **Hyprland 0.57.1** (Wayland) | Host desktop | **Manual — NOT TESTED yet** |

Not tested at all: Windows, macOS, X11 window managers, KDE/GNOME, Firefox ESR/Beta/Nightly,
Firefox for Android, other Zen versions. Firefox 151–153 lack the isolated-world fix
(bug 2053139, fixed in 154) and are untested.

## Results

PASS / FAIL / BLOCKED / NOT TESTED as defined in the spike report. "Expected FAIL" means the
platform correctly refuses something it should refuse.

### Document Picture-in-Picture: availability and contexts (E1)

| Scenario | FX-H | FX-W | ZEN-W |
| --- | --- | --- | --- |
| `documentPictureInPicture` exposed, `requestWindow` is a function (top-level, secure context) | PASS | PASS | PASS |
| Call without user activation → `NotAllowedError: … requires user activation` | Expected FAIL | Expected FAIL | Expected FAIL |
| Page main world, after a click | PASS | PASS | PASS |
| Isolated content script, click listener | PASS | PASS | PASS |
| Isolated content script via `wrappedJSObject` | PASS | PASS | PASS |
| `world: "MAIN"` content script | PASS | PASS | PASS |
| Isolated content script, page `keydown` shortcut | PASS | PASS | PASS |
| Background script (no activation) → `NotAllowedError` | Expected FAIL | Expected FAIL | Expected FAIL |
| Extension `commands` shortcut → `scripting.executeScript` MAIN world¹ | not run | PASS (`isActive: true`) | **FAIL** — no tab resolved² |
| Toolbar button → `scripting.executeScript` | NOT TESTED | NOT TESTED | NOT TESTED |
| Extension page (`moz-extension://`) opens its own PiP | not run | PASS (extension origin) | PASS (extension origin) |
| Cross-origin iframe → `NotAllowedError: … only available in top-level contexts` | Expected FAIL | Expected FAIL | Expected FAIL |
| Top page reading a cross-origin frame's `<video>` → `SecurityError` | Expected FAIL | Expected FAIL | Expected FAIL |

¹ The shortcut key was synthesised through Marionette's chrome context; it reached the
extension `commands` handler, but a physical keypress has not been tested.
² Zen passed no `tab` to `commands.onCommand`. A follow-up probe showed the background saw
no tabs at all in this launch mode: `tabs.query({})` returned `[]`, and `runtime` messages
from the content script arrived without `sender.tab`. Firefox, launched by geckodriver,
reported the tab in both cases. Probably an artefact of launching Zen ourselves and attaching
with `--connect-existing`; **unresolved** until the manual check M8 in a normal Zen profile.

### HTML window, video and layout (E2–E4)

| Scenario | FX-H | FX-W | ZEN-W |
| --- | --- | --- | --- |
| E2 Arbitrary HTML; trusted clicks inside PiP (`isTrusted: true`) | PASS | PASS | PASS |
| E2 Layout toggle without changing outer size | PASS | PASS | PASS |
| E3 Original `<video>` moved into PiP keeps playing; no `emptied`/`loadstart`/`abort` | PASS | PASS | PASS |
| E3 No additional media request across move, controls and return | PASS (0) | PASS (0) | PASS (0) |
| E3 One audio stream on the sink after move and after return | n/a | PASS (1/1) | PASS (1/1) |
| E3 No audible gap across move and return (10 ms resolution) | n/a | PASS (0 gaps) | PASS (0 gaps) |
| E3 Play/pause, ±10 s seek, volume, 1.5× rate from buttons inside PiP | PASS | PASS | PASS |
| E3 Close PiP → `pagehide` → element returns to page, still playing, same position | PASS | PASS | PASS |
| E4 Minimal / Overlay / Docked switch with unchanged outer size | PASS | PASS | PASS |
| E4 Page-requested size (`requestWindow({width,height})`) honoured | PASS | **ignored** (tiled) | **ignored** (tiled) |
| E4 Resize by compositor, tiled: 900 → Docked, 480 → Overlay, 280 → Minimal | n/a | PASS | PASS |
| E4 Resize by compositor, floating 240×135 … 960×420: fallback, no document overflow, 16:9 picture kept | n/a | PASS | PASS |
| E4 Panel scrolls internally | PASS | PASS | PASS |

### Page Content-Security-Policy (E7)

The page is served with the policy as an HTTP header. *strict* = `default-src 'none';
script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self';
base-uri 'none'; form-action 'none'`. *TT* = *strict* + `require-trusted-types-for 'script'`.
Each cell is "applied" judged from the PiP document (computed style, DOM result or image
load), for FX-W and ZEN-W; both browsers gave identical results.

| Injection into the PiP document | Page world, no CSP | Page world, strict | Page world, TT | Isolated content script, strict | Isolated content script, TT |
| --- | --- | --- | --- | --- | --- |
| `<style>` element | applied | **blocked** (`style-src-elem`) | **blocked** | applied | applied |
| `style` attribute (`setAttribute`) | applied | **blocked** (`style-src-attr`) | **blocked** | applied | applied |
| CSSOM (`el.style.color = …`) | applied | applied | applied | applied | applied |
| `<link rel=stylesheet>` (page: same origin; extension: web-accessible `moz-extension://`) | applied | applied | applied | applied | applied |
| Constructable stylesheet (`adoptedStyleSheets`) | applied | applied | applied | applied | applied |
| `innerHTML` with a string | applied | applied | **throws** (Trusted Types) | applied | applied |
| `data:` image | loads | **blocked** (`img-src`) | **blocked** | loads | loads |
| Inline `<script>` | runs | blocked | blocked (throws) | blocked | blocked |
| Move the page's `<video>` into PiP, keep playing | n/a | n/a | n/a | PASS (1 media request) | PASS |

The PiP window therefore inherits the opener's policy, and isolated-world DOM changes are
exempt from it (except scripts). Real-site policies (YouTube) and nonce/hash policies: NOT
TESTED.

### Keyboard focus and input (E8)

| Scenario | FX-W | ZEN-W |
| --- | --- | --- |
| PiP window takes keyboard focus when it opens | **No** (opener keeps focus under sway; compositor-dependent) | **No** (same) |
| Tab moves through the PiP UI; no trap (6 native `<video controls>` stops, then the tool buttons in order) | PASS | PASS |
| Shift+Tab moves backwards | PASS | PASS |
| Space on the focused play button toggles playback | PASS | PASS |
| Enter on the focused +10 s button seeks | PASS | PASS |
| `keydown` shortcuts on the PiP document (`k`, `ArrowRight`), `isTrusted: true` | PASS | PASS |
| Escape closes the PiP window | No (stays open) | No (stays open) |
| Focus returns to the opener within 1 s of closing | **No** under sway (compositor-dependent) | **No** |
| Same on Hyprland | NOT TESTED (M1, M7) | NOT TESTED |

### Lifecycle (E5, automated part)

| Scenario | FX-H | FX-W | ZEN-W |
| --- | --- | --- | --- |
| New tab in opener window: PiP stays open, playback continues | PASS | PASS | PASS |
| Opener window minimised (WebDriver): PiP stays open, playback continues | PASS | PASS | PASS |
| Opener navigates: PiP closes (spec behaviour) | PASS | PASS | PASS |
| Opener tab closed: PiP closes | PASS | PASS | PASS |

### Window management (E5, compositor)

| Scenario | FX-W | ZEN-W | HYPR |
| --- | --- | --- | --- |
| Document PiP toplevel role | plain `xdg_shell` toplevel, **tiled**, not sticky | same | NOT TESTED |
| Native video PiP toplevel ("Picture-in-Picture") | plain toplevel, **tiled** | same | NOT TESTED |
| `windows.create({type: "popup"})` | plain toplevel, tiled; `alwaysOnTop: false` | same | NOT TESTED |
| Window title usable for a compositor rule | `<document title> — Mozilla Firefox`, app_id `firefox` | `<document title> — Zen Browser`, app_id `zen-beta` | NOT TESTED |
| Float + sticky applied by the compositor (rule equivalent) | PASS | PASS | NOT TESTED |
| **Always on top across other applications** | NOT TESTED (needs host desktop) | NOT TESTED | **NOT TESTED — manual** |
| Manual edge/corner drag | NOT TESTED | NOT TESTED | **NOT TESTED — manual** |

### Real player (E6)

| Scenario | FX-W | ZEN-W |
| --- | --- | --- |
| YouTube `/watch` (public video, MSE `blob:` source, no `MediaKeys`) moved into PiP | PASS | PASS |
| Playback continues in PiP (≈2 s per 2 s sample), `readyState` 4, no player error | PASS | PASS |
| Returned to the page, still playing; no `emptied`/`abort`/`error`/`loadstart` | PASS | PASS |
| Page-side layout/controls of YouTube while the element is away | not evaluated | not evaluated |

### Alternatives

| Backend | Arbitrary HTML | Same window as video | Always on top on Wayland | Notes |
| --- | --- | --- | --- | --- |
| Document PiP | Yes | Yes (moved element) | Compositor-dependent | Recommended; see [ADR 0001](../../adr/0001-pip-window-backend.md) |
| Native video PiP | **No** | Video only | Compositor-dependent (same plain toplevel) | Fallback for video-only |
| `windows.create` popup | Yes (extension page) | **No**: cannot hold the page's `<video>`; would need a second stream | Compositor-dependent; no API flag | Rejected |
