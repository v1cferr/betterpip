# V1C-120 spike — interactive, always-on-top PiP on Firefox/Zen

| | |
| --- | --- |
| Jira | [V1C-120](https://v1cferr.atlassian.net/browse/V1C-120) (parent [V1C-119](https://v1cferr.atlassian.net/browse/V1C-119)) |
| Date | 2026-11-08 |
| Status | **CONDITIONAL GO**, pending the manual Hyprland checks below. V1C-120 is **not** done until those run. |
| Lab | [`experiments/m0/`](../../../experiments/m0/README.md) |
| Matrix | [COMPATIBILITY.md](COMPATIBILITY.md) |
| Decision | [ADR 0001 — PiP window backend](../../adr/0001-pip-window-backend.md) |

## Summary

**Document Picture-in-Picture works on Firefox 159.0 and Zen 1.24b, and it works from a
WebExtension.** One PiP window can host arbitrary interactive HTML together with the page's
own `<video>` element, moved in and out with no reload, no second download, a single audio
stream and no audible gap. This held for a local fixture and for YouTube's MSE player.
Inside one window, the layout switches between Minimal, Overlay and Docked without
changing the outer size, and falls back as the window shrinks.

**The open condition is "always on top" on Wayland.** Under a Wayland compositor the PiP
window is an ordinary `xdg_shell` toplevel. The page cannot make it float or stay above other
applications; the compositor decides. That is Wayland's design ([Mozilla bug
1621261](https://bugzilla.mozilla.org/show_bug.cgi?id=1621261)), not something an extension
can fix. On Hyprland it most likely needs a window rule (float + pin) that the user owns.
Whether that rule gives the required behaviour on the target desktop has **not been tested
yet**; see [Manual checks](#manual-checks-pending).

## Questions and answers

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 1 | Do the installed Firefox/Zen support Document PiP? | Yes: Firefox 159.0 and Zen 1.24b (Gecko 159) expose it by default. It shipped on desktop in Firefox 151 ([bug 2006594](https://bugzilla.mozilla.org/show_bug.cgi?id=2006594)); no flag was changed. | Automated (E1) |
| 2 | Can a WebExtension use it in the right context? | Yes, from a user gesture in the page: isolated content script (direct or `wrappedJSObject`), MAIN-world script, page `keydown`. Not from background scripts (no activation) or cross-origin iframes (top-level only). Extension pages can open a PiP, but it belongs to the extension origin and cannot hold the page's video. | Automated (E1) |
| 3 | Always-visible window with interactive HTML? | Interactive HTML: yes (trusted clicks). Always visible: **depends on the compositor**. Not established on Hyprland. | Automated (E2, E5); Manual pending |
| 4 | Video and tools in the same window? | Yes. | Automated (E3, E4) |
| 5 | Original video keeps working without restarting the stream? | Yes: 0 extra media requests, 1 audio stream, 0 audio gaps, no `emptied`/`loadstart`/`abort`; same on YouTube (MSE). | Automated (E3, E6) |
| 6 | Manually resizable? | The compositor resizes it (tested on isolated sway). Physical drag on Hyprland: not tested. | Automated; Manual pending |
| 7 | Content adapts to the size? | Yes: container queries switch Docked → Overlay → Minimal, keep 16:9 and never overflow the document. | Automated (E4, E5) |
| 8 | Always on top across applications in the real environment? | **Not tested.** Expected to need a compositor rule. | Inferred + Manual pending |
| 9 | Firefox vs Zen differences? | Same behaviour in every page/content-script scenario. Zen titles the PiP window `… — Zen Browser` (app_id `zen-beta`) versus `… — Mozilla Firefox` (app_id `firefox`). In the lab's Zen launch mode the extension could not see any tab (`tabs.query({})` empty, no `sender.tab`), so the `commands` path failed there; this needs a check in a normal Zen profile (M8). Zen needed `zen.welcome-screen.seen` in a fresh profile. | Automated |
| 10 | Public, sustainable alternatives? | Native video PiP (video only, no HTML) and an ordinary popup (no always-on-top flag, cannot hold the page's video). Neither meets the single-window requirement. No public Zen-specific mechanism was found. | Automated + documentation |

## Method

- **Toolchain.** Browsers, geckodriver 0.36.0, Selenium 4.40, sway, ffmpeg and PulseAudio
  tools come from nixpkgs into the Nix store. No system, NixOS, Hyprland, Firefox or Zen
  configuration was changed. Every scenario uses a fresh temporary profile and a temporary
  probe extension. No browser flag was changed except test-profile prefs: autoplay allowed,
  Zen welcome screen marked as seen, and the volume scaled to 0 only when no isolated sink
  is in use.
- **User activation.** geckodriver input actions are dispatched as trusted events. The lab
  records `isTrusted: true` and `navigator.userActivation.isActive` to show the clicks are
  real gestures.
- **Isolation.** After the first headed attempt opened windows and played sound on the host
  desktop, all runs moved to [`isolated-wayland.sh`](../../../experiments/m0/harness/isolated-wayland.sh).
  It runs a headless sway session with no GPU and no XWayland. Audio goes to a temporary
  PipeWire null sink, recorded and analysed, then unloaded.
- **Media fixture.** Synthetic, generated by ffmpeg, so there are no licensing questions:
  120 s, 1280×720 VP9 with a burned-in clock, Opus audio with a continuous 440 Hz bed and a
  1 kHz blip each second. Gaps show up as silence, and a duplicate stream would show up as
  blips less than 0.5 s apart.
- **Stream evidence.** A local server logs every media request. Sink inputs are counted to
  detect duplicate audio.
- **CSP and keyboard (E7, E8).** Added after reading the Jira scope, and run on the same
  builds and isolated session. The lab server sends `/site/csp.html` with a policy chosen per
  run (`none`, `strict`, `strict` + Trusted Types) as an HTTP header. The page world and the
  isolated content script each apply the same eight injections in a new PiP window. Success
  is judged by computed style or DOM effect, not by the absence of an exception. Keyboard
  input uses trusted WebDriver key actions on the PiP window. Results are in
  `results/*-e7-e8.json`.
- **Classification.** *Automated*: produced by the harness. *Manual*: a human on the real
  desktop. *Inferred*: reasoned from evidence or documentation, not observed directly.

### Environment

| Item | Value |
| --- | --- |
| OS | NixOS 26.05 (build 26.05.20261102.7dcdd87), Linux 7.3.1 x86_64 |
| Host desktop | Hyprland 0.57.1, Wayland session (XWayland present) |
| CPU / RAM | Intel Core i5-11400 (12 threads), 15 GiB |
| Firefox | 159.0, BuildID 20261022150525, nixpkgs (not installed system-wide) |
| Zen | 1.24b, BuildID 20261029123729, Gecko 159.0, installed through the user's Nix profile behind a password-guard wrapper (the guard only protects the default profile and was not armed) |
| Node.js / pnpm | **Not installed.** Not needed: M0 used no WXT and no build step. |
| Isolated compositor | sway 1.12 headless, pixman renderer |
| Limitation | No automated access to the host desktop without opening windows on it; always-on-top across applications needs a person |

## Findings

### What worked

- **Contexts.** Mozilla's earlier block on isolated content scripts
  ([bug 2045666](https://bugzilla.mozilla.org/show_bug.cgi?id=2045666)) was lifted in 154
  ([bug 2053139](https://bugzilla.mozilla.org/show_bug.cgi?id=2053139)). On 159 a plain
  isolated content script both opens the window and reads/writes its DOM. The window belongs
  to the page's origin (`about:blank` with the page's base URI).
- **Moving the element.** `pipWindow.document.body.append(video)` (adoption) keeps the media
  pipeline: `currentTime`, play state, volume and rate are unchanged. Media events show only
  user-caused events. A placeholder comment node plus a `pagehide` listener puts the element
  back. The isolated world can move the page's `<video>` too.
- **Real player.** YouTube's `<video>` (MSE, `blob:`, no EME on the tested public video)
  kept playing in PiP and after return, with no player error and no media events signalling
  a reload. *Not evaluated:* how YouTube's own UI and controls behave while the element is
  away. That is adapter work (V1C-123).
- **Layout.** CSS container queries on the PiP root alone produced Docked (≥ 560 px),
  Overlay (300–559 px) and Minimal (< 300 px wide or < 180 px tall). `object-fit: contain`
  kept the picture at 16:9. Switching modes never changed `outerWidth/outerHeight`.
- **CSP (E7).** The PiP document **inherits the opener's Content-Security-Policy**. Under a
  strict page policy (`default-src 'none'; script-src 'self'; style-src 'self'; img-src
  'self'; …`), page-world code in the PiP window loses `<style>` elements, `style`
  attributes and `data:` images, each with a `securitypolicyviolation`. With Trusted Types
  enforced (`require-trusted-types-for 'script'`) its `innerHTML` throws as well. The same
  operations done **from the isolated content script are not blocked**: `<style>`, `style`
  attributes, `innerHTML` (even with Trusted Types), `data:` images, a linked
  `moz-extension://` stylesheet (web-accessible) and constructable stylesheets
  (`adoptedStyleSheets`) all applied. Inline `<script>` is blocked in both worlds, as
  expected. Moving the `<video>` still worked under both policies (playing, no error, one
  media request). Firefox and Zen behave identically. Consequence: the UI must be built
  from the isolated world, never from a MAIN-world or page script.
- **Keyboard (E8).** Buttons in the PiP window are reachable with Tab and Shift+Tab. With the
  moved `<video>` still carrying `controls`, Tab first visits its 6 native control stops,
  then the tool buttons in order; focus is not trapped. Space and Enter activate the
  focused button, and a `keydown` listener on the PiP document receives trusted keys (`k`
  toggled playback, `ArrowRight` seeked). Escape does not close the window.
- **Lifecycle.** PiP survives tab switches and minimising the opener window. It closes
  when the opener navigates or is closed (spec behaviour), and `pagehide` fires in time to
  restore the element.

### What did not work, or is not established

- **Always on top (Wayland).** In the isolated sway session, Document PiP, native PiP and
  `windows.create` popups are all ordinary tiled toplevels: not floating, not sticky, and
  the requested size is ignored. On Wayland a client cannot ask to stay above other
  windows. Firefox's own workaround is the compositor's menu or rules (bug 1621261). The
  WebExtensions `windows.create` API has no always-on-top property
  ([MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/windows/create)).
  BetterPiP cannot guarantee always-on-top by itself on Wayland. It can make the window
  easy to match (stable document title) and document the rule.
- **Toolbar button.** Not tested. MV3's unified extensions panel hides the button from the
  automation, and nothing proves that a toolbar click gives the page user activation. The
  keyboard `commands` path did pass with `isActive: true` on Firefox, but via a synthesised
  key.
- **Zen `commands`.** The handler ran, but no tab was resolved. A follow-up probe showed the
  cause is wider than `commands`: in the lab's Zen launch mode (own process, fresh profile,
  geckodriver `--connect-existing`, extension installed as temporary), the background sees
  **no tabs at all** (`tabs.query({})` returned `[]`, messages arrived without
  `sender.tab`), while Firefox reported the tab normally. This is probably an artefact of
  that launch mode, but it is not proven; M8 checks it in a normal Zen profile.
- **Focus when the window opens or closes (E8).** In the isolated sway session the new PiP
  window did **not** take keyboard focus (`pipHasFocus: false`, the opener kept it), and no
  focus returned to the opener within 1 s of closing. Both are compositor decisions;
  Hyprland may differ (M1, M7). The UI must therefore not assume focus on open.
- **Cross-origin iframes.** Embedded players in cross-origin frames cannot be moved, and
  their content script cannot open Document PiP (top-level only). Needs a frame-aware design
  (V1C-121) or a native-PiP fallback.
- **CSP on real sites.** E7 used a local page with synthetic policies. YouTube's own
  policy was not inspected, and nonce/hash-based policies were not tried; the isolated-world
  exemption should cover them, but this is not measured.
- **Not tested at all.** DRM/EME-protected media (out of scope to bypass; expected to keep
  working only if the browser allows the element to move, otherwise fallback), Shadow-DOM
  players (`<video>` inside a shadow root is still a movable element, but not exercised),
  SPA navigation on YouTube, HiDPI/fractional scaling, X11 sessions, Windows, macOS.

## Performance (preliminary)

Process-tree CPU (sum of `utime + stime`, % of one core) and PSS from `/proc`, sampled over
**one 8-second window per state**. Isolated sway uses **software rendering (pixman)**, so
absolute numbers include CPU compositing a GPU would normally do. Treat them as
order-of-magnitude, single-sample values.

| State | Firefox 159 CPU % | Firefox PSS MB | Zen 1.24b CPU % | Zen PSS MB |
| --- | --- | --- | --- | --- |
| Lab page loaded, paused | 0.6 | 241 | 0.4 | 179 |
| Playing in page | 7.3 | 251 | 7.0 | 192 |
| Playing in PiP: Minimal | 6.7 | 253 | 6.8 | 193 |
| Playing in PiP: Overlay | 8.7 | 254 | 6.3 | 194 |
| Playing in PiP: Overlay + `blur(8px)` panel | 7.5 | 252 | 7.3 | 192 |
| Playing in PiP: Docked | 6.5 | 252 | 6.5 | 192 |
| 16 programmatic resizes (8 s window) | 6.4 | — | 6.7 | — |

- Moving playback into PiP did not measurably change CPU or memory compared with playing
  in the page. The ±1–2 point spread between modes is within single-sample noise. Overlay,
  scoped blur and Docked showed no clear cost at this resolution. **No budget should be
  derived from these numbers.**
- Prototype size: probe extension ≈ 10.7 KB unminified; page probe JS + CSS ≈ 15.3 KB.
  The lab adds 21 media listeners and one `ResizeObserver` per PiP session, all released
  with the session. These numbers describe the lab, not a product.
- Confounders: the whole browser tree is measured (including the lab page and harness
  connections), there is no GPU path, a single run per state, and Firefox and Zen differ in
  their default extensions/features (Zen's tree uses less memory here).
- Not measured: no-extension baseline vs native PiP vs prototype on the real desktop with
  GPU composition, idle wakeups, long-run leaks. These need a repeatable method on
  Hyprland, part of V1C-126.

## Manual checks (pending)

These cannot be automated without opening windows on the user's desktop. Run them on the
Hyprland session, with the fixture page served locally (`python3 experiments/m0/harness/server.py
experiments/m0 47120 /tmp/m0-req.jsonl`, then open `http://127.0.0.1:47120/site/index.html`),
in a **separate temporary profile** (`firefox -no-remote -profile $(mktemp -d)`; for Zen,
`zen-beta -no-remote -profile $(mktemp -d)`) with the probe extension loaded through
`about:debugging` → *Load Temporary Add-on* → `experiments/m0/extension/manifest.json`.

| ID | Procedure | Expected | FX | Zen |
| --- | --- | --- | --- | --- |
| M1 | Click *E3/E4: move video + tools*. Note whether Hyprland floats the PiP window. | Window opens; record float/tile | NOT TESTED | NOT TESTED |
| M2 | Without any rule, focus another application over the PiP | Record whether PiP stays visible | NOT TESTED | NOT TESTED |
| M3 | Float and pin **only that window, at runtime** (e.g. `hyprctl dispatch setfloating title:^BetterPiP` then `hyprctl dispatch pin title:^BetterPiP`; check the dispatcher syntax for the installed Hyprland). Nothing is written to the config. A persistent rule matching title `^BetterPiP` is the user's choice. | PiP floats and is pinned | NOT TESTED | NOT TESTED |
| M4 | With M3: switch workspace, focus other apps, fullscreen another app | PiP stays visible above other windows (record fullscreen behaviour) | NOT TESTED | NOT TESTED |
| M5 | Drag PiP edges and corners | Layout goes Docked → Overlay → Minimal, no overflow, playback continues | NOT TESTED | NOT TESTED |
| M6 | Minimise/hide the browser window, switch tabs, play for 1 min | PiP keeps playing; audio continuous | NOT TESTED | NOT TESTED |
| M7 | Close PiP with its close button and with the browser's "return" button | Video back in page, same position, still playing | NOT TESTED | NOT TESTED |
| M8 | Open the toolbar action button, then press `Alt+Shift+9`. On Zen, also open `about:debugging` → the probe → *Inspect* and run `await browser.tabs.query({})` in its console. | Record whether either opens PiP (activation from browser UI); on Zen, whether tabs are listed | NOT TESTED | NOT TESTED |
| M9 | YouTube: move the player video, interact with YouTube's page controls, return | Record any UI breakage | NOT TESTED | NOT TESTED |

## Decision

**CONDITIONAL GO** for Document PiP as BetterPiP's primary window backend on Firefox ≥ 154
and Zen built on it, with these conditions:

1. Always-on-top on Wayland is the **compositor's** responsibility. BetterPiP must document
   it and must not claim it. M2–M4 must confirm what users get on Hyprland.
2. Opening PiP requires a gesture **in the page** (content-script click or `keydown`).
   Toolbar/command entry points need M8 before being promised.
3. Cross-origin iframe players and DRM media are compatibility limits that need a defined
   fallback (native video PiP or "not supported").
4. The PiP UI is built from the isolated content script, because the PiP document inherits
   the page's CSP and only isolated-world injections were exempt (E7). The UI must not
   assume it has keyboard focus when the window opens (E8).

Details, alternatives and consequences: [ADR 0001](../../adr/0001-pip-window-backend.md).

## Documentation consulted

- [MDN Document Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API), [WICG specification](https://wicg.github.io/document-picture-in-picture/)
- Mozilla bugs [1858562](https://bugzilla.mozilla.org/show_bug.cgi?id=1858562) (implementation), [2006594](https://bugzilla.mozilla.org/show_bug.cgi?id=2006594) (release in 151), [2045666](https://bugzilla.mozilla.org/show_bug.cgi?id=2045666) and [2053139](https://bugzilla.mozilla.org/show_bug.cgi?id=2053139) (extension contexts, 154), [2012979](https://bugzilla.mozilla.org/show_bug.cgi?id=2012979) (meta), [1621261](https://bugzilla.mozilla.org/show_bug.cgi?id=1621261) (Wayland always-on-top), [2047870](https://bugzilla.mozilla.org/show_bug.cgi?id=2047870) (background activation, open), [2009192](https://bugzilla.mozilla.org/show_bug.cgi?id=2009192) (PiP closes when opener moves between windows, open)
- [MDN `windows.create`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/windows/create)
- [Zen docs: Picture-in-Picture](https://docs.zen-browser.app/user-manual/pip)

## Jira and documentation divergences

- Jira V1C-120 was read after the run (2026-11-08). Its acceptance criteria are covered: a
  dated matrix, the floating vs. always-on-top difference, and an ADR with go/no-go. Its
  extra gate items remain open: always-on-top verified across applications, and manual
  resize. Its scope lists **CSP** and focus, which the first run missed; both were then
  tested (E7, E8, 2026-11-08, same builds) and are reported above.
- The repository docs say the backend is chosen "only after V1C-120". This report proposes it
  (ADR 0001, status *Proposed*). Nothing in the repository conflicts with the findings.
