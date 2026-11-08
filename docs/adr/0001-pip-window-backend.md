# ADR 0001 — PiP window backend

| | |
| --- | --- |
| Status | **Proposed**, 2026-11-08 (CONDITIONAL GO; becomes *Accepted* once the manual checks in the spike report pass) |
| Jira | [V1C-120](https://v1cferr.atlassian.net/browse/V1C-120) |
| Evidence | [Spike report](../spikes/V1C-120/README.md), [compatibility matrix](../spikes/V1C-120/COMPATIBILITY.md), [lab results](../../experiments/m0/results/) |

## 1. Context and problem

BetterPiP's central promise ([UX.md](../UX.md)) is **one** user-resizable floating window that
holds the video *and* interactive tools, stays visible while the user works in other
applications, and preserves the page's original playback session. The architecture
([ARCHITECTURE.md](../ARCHITECTURE.md)) left the window backend open until real Firefox/Zen
evidence existed. This ADR picks the backend.

## 2. Non-negotiable requirements

1. Single window containing the video surface and an interactive HTML tool layer.
2. Original media session preserved: no second stream, no duplicated audio, no restart.
3. Responsive inside the user-chosen size; no automatic resize of the outer window.
4. Controllable lifecycle: open from a user gesture, restore the element on close.
5. Public, supported browser APIs only. No DRM circumvention, no privileged browser patches.
6. Visible above other applications. This ADR records how far a browser extension can
   deliver this on each platform.

## 3. Alternatives evaluated

| Option | Description |
| --- | --- |
| **A. Document Picture-in-Picture** | `documentPictureInPicture.requestWindow()` from the page's principal; move the page's `<video>` into the PiP document next to the tool UI. |
| B. Native video PiP | `video.requestPictureInPicture()` / Firefox's built-in PiP player. |
| C. Extension popup window | `browser.windows.create({type: "popup"})` showing an extension page. |
| D. Zen-specific/privileged integration | Zen internals, userChrome scripts, patched builds. |

## 4. Evidence (Firefox 159.0, Zen 1.24b, NixOS, 2026-11-08)

- **A** opens from isolated, `wrappedJSObject` and MAIN-world content scripts and from page
  `keydown`/click gestures. Inside it, arbitrary HTML receives trusted input. The moved
  `<video>` keeps one pipeline: 0 extra requests, 1 audio stream, 0 gaps, no reload events.
  This holds for a local fixture and for YouTube's MSE player. Minimal/Overlay/Docked
  switch inside a fixed outer size and fall back with container queries. On Wayland the
  window is a plain toplevel and is not kept on top by the browser.
- **B** works for video only; no HTML can be added. It has the same Wayland stacking
  behaviour as A.
- **C** opens, but `windows.create` has no always-on-top property, and an extension page
  cannot hold the web page's `<video>`. Showing the video there would need a second stream
  or capture pipeline, which violates requirement 2.
- **D**: no public, documented Zen mechanism was found. Zen behaves like Firefox for A.

## 5. Trade-offs

| | A | B | C | D |
| --- | --- | --- | --- | --- |
| Single window, video + HTML tools | ✅ | ❌ | ❌ (no shared video) | ? |
| Original session preserved | ✅ | ✅ | ❌ | ? |
| Public, stable API | ✅ (Firefox ≥ 151; isolated world ≥ 154) | ✅ | ✅ | ❌ |
| Always on top, X11/Windows/macOS | Browser-managed (untested here) | Browser-managed | ❌ | ? |
| Always on top, Wayland | Compositor rule | Compositor rule | Compositor rule | ? |
| Maintenance cost | Low/moderate | Low | Moderate | High |

## 6. Limitations

- **Wayland:** clients cannot keep a window above others. BetterPiP can set a stable,
  matchable document title (`BetterPiP …`) and document compositor rules. It cannot
  guarantee always-on-top by itself. Hyprland behaviour is still to be confirmed manually.
- **Activation:** opening requires a gesture in the page. Background scripts are refused
  ([bug 2047870](https://bugzilla.mozilla.org/show_bug.cgi?id=2047870) is open). Toolbar
  entry and Zen's `commands` tab resolution are not established.
- **Top-level only:** cross-origin iframe players cannot be moved or opened from inside the
  frame.
- **One PiP per tab**, closed when the opener navigates or closes, and closed when the opener
  moves between windows ([bug 2009192](https://bugzilla.mozilla.org/show_bug.cgi?id=2009192), open).
- **Site UIs** may react to their `<video>` leaving the page; adapters must handle this.
- DRM/EME media, Shadow-DOM players, X11, Windows and macOS were not tested.

## 7. Decision (proposed)

Use **Document PiP (A)** as the primary window backend for Firefox/Zen. Move the page's own
`<video>` element into the PiP document, and return it on `pagehide`.

- **Opening path:** a content-script-handled gesture in the page (click on an on-demand
  affordance, or a page-level `keydown` shortcut), calling the isolated-world API directly.
  Use the MAIN world only where isolation blocks a need, since `wrappedJSObject` loses Xray
  protection.
- **Fallback:** where A is unavailable (Firefox < 151, iframe players, refused activation,
  unsupported sites), offer **native video PiP (B)** as "video only", or state clearly that
  the page is unsupported. **C is rejected** as a primary or fallback backend.
- **D is rejected** without a separate, explicit architectural decision.

## 8. Architectural consequences

- The capability registry (V1C-121) needs a `windowBackend` capability:
  `documentPip | nativePip | none`, plus reasons such as `iframe`, `noActivation`,
  `unsupportedBrowser`.
- The media/session core owns *element custody*: placeholder, move, return on `pagehide`,
  and a guard against the opener navigating or the window moving (bug 2009192).
- The renderer runs inside the PiP document. Svelte and styles are injected into that
  document on demand, never into the host page. Layout responds to the PiP document's own
  container size.
- Documentation must state the Wayland always-on-top dependency and provide tested
  compositor recipes, starting with Hyprland.
- Minimum versions: Firefox 154 for the isolated-world path. Zen versions are tracked by
  their Gecko base.

## 9. Open questions

1. Hyprland: does a float + pin rule give always-on-top across applications, workspaces and
   fullscreen? (spike M2–M4)
2. Does a physical toolbar click or a real `commands` shortcut grant page activation? Why did
   Zen's `commands` handler resolve no tab? (M8)
3. How should each adapter handle a site's own UI while its `<video>` is away? (V1C-123)
4. DRM/EME and Shadow-DOM players: does the move work, or is the fallback required?
5. Non-Wayland platforms: does Firefox keep Document PiP on top natively?

## 10. Conditions to advance to M1 (V1C-121)

- Manual checks M1–M7 executed on Hyprland for Firefox and Zen, with results recorded in
  the compatibility matrix.
- Always-on-top classified per desktop as *native*, *with documented rule* or *not possible*.
  If Hyprland cannot achieve it even with a rule, revisit scope before M1.
- V1C-120 updated in Jira with this evidence. The Jira acceptance criteria are compared with
  this ADR and any divergence is resolved.
- This ADR's status moves to *Accepted* (or is superseded).
