# BetterPiP — Adaptive Player UX Specification

Status: **product/design requirements only; not implemented**. Approved 2026-11-08. Scope: [V1C-119](https://v1cferr.atlassian.net/browse/V1C-119), implementation criteria: [V1C-125](https://v1cferr.atlassian.net/browse/V1C-125), architecture: [ARCHITECTURE.md](ARCHITECTURE.md).

## Product principle

**One resizable floating window; the video is primary; tools stay inside that same window.** The user chooses the outer window dimensions by dragging its edges/corners, subject to the browser/OS constraints. BetterPiP must **adapt its inner composition** rather than automatically enlarging the window or opening a second tools window. Leaving the original page in the background should not mean losing the supported video-player features. The source page may need to remain open to preserve playback.

Avoid a permanently visible sidebar. The player must be usable for long periods with only the video visible.

## Layout states (one window, not three windows)

| State | Video surface | Tools | Behavior |
| --- | --- | --- | --- |
| **Minimal** | Primary, as large as possible | Essential playback controls appear contextually, then hide | Default distraction-free state; no reserved tools sidebar |
| **Overlay / Glass** | Retains the full video layout area | A dismissible, scrollable, interactive panel overlays the video | Transparent/tinted glass-style surface with adjustable opacity; controlled, optional blur and readable text |
| **Docked / Split** | Shrinks **within the same window**, initially on the **left** | A panel sits **on the right** and scrolls internally | Video keeps its original aspect ratio; user-defined window boundary does not expand |

The user can explicitly select Overlay or Docked where space allows. Preserve the preference locally, but when Docked cannot satisfy usable minimum video and panel sizes, **temporarily fall back to Overlay or Minimal inside the same window**, explain why if useful, and restore the chosen mode when size permits. Any future left/right panel swapping is optional, not MVP-critical.

Opening or closing tools should never spawn another window, resize the outer window automatically or permanently obstruct video playback controls. Multiple tools use a common panel shell rather than separate floating windows. In Overlay mode, position and scroll the panel to avoid unnecessary occlusion of subtitles and frequently used controls when possible.

## Adaptive behavior and content sizing

- Respond to the **PiP container's actual dimensions** (e.g. CSS container queries / scoped ResizeObserver when justified), not just the host page's viewport.
- Treat window size as user-owned; browser/OS may enforce min/max size, which must be recorded in M0.
- Preserve media aspect ratio by default (e.g. `object-fit: contain`); letterbox rather than crop or stretch. Never change playback resolution solely to satisfy layout unless technically required and authorized.
- Maintain accessible target sizes, readable text and controls. On compact widths, progressively collapse nonessential chrome, prefer a small Overlay panel, and keep playback accessible.
- Panels scroll independently without forcing the entire window to overflow. No horizontal scrollbar for the primary controls; long chapter titles wrap/ellipsize with accessible full text.
- Preserve live video and UI state while resizing or switching modes; no duplicate stream, restart, audio doubling or surprise seeks.

## Tool model

The **same extensible tool layer** works in Overlay and Docked modes. Initial tool modules are:

- Universal playback: play/pause, seek/timeline where available, volume/mute, playback speed, keyboard shortcuts and accessible status.
- Chapters/timestamps: current chapter, previous/next chapter and selectable chapter list (YouTube timestamp parsing is an adapter enhancement).
- Captions/subtitle tracks when available; an unavailable capability must be disabled/hidden with an honest explanation.

**Deferred, outside the MVP:** YouTube comments, playlists, chat, transcript intelligence, AI features and full webpage mirroring. Comments may eventually appear as an Overlay or Docked panel inside this same window, not as an extra window; obtaining them requires a separate adapter, permissions and privacy/security review. Do not promise access to every control or feature of the original website.

## Glass, animation and accessibility

- Prefer tinted translucent backgrounds with strong foreground contrast. Optional blur should be limited to small open panels; do not default to large-area animated `backdrop-filter` on a playing video.
- Opacity/blur choices should maintain contrast and a solid fallback; respect reduced motion and user preferences.
- Keyboard support: focus moves logically into an open panel and returns to its trigger when closed; Escape should dismiss a panel before affecting PiP; inputs must not trigger global shortcuts. Use accessible names, tab order and screen-reader announcements appropriately.
- UI updates should be driven by playback events and scoped observation, not busy polling. Load Svelte 5 and UI components only when the interactive PiP renderer is needed.

## Acceptance scenarios for M2 (V1C-125)

1. User manually resizes the PiP window to small/medium/large sizes; the UI adapts **within the unchanged outer bounds**, with no new window. Test landscape and narrow/portrait where supported.
2. With only video visible, user opens chapters in Overlay, selects a chapter, closes the panel and resumes unobstructed viewing without playback interruption.
3. User switches to Docked; video appears left and tools right, media ratio preserved; dragging the outer window smaller causes a graceful Overlay/Minimal fallback. Preference survives close/reopen where technically supported.
4. A keyboard/screen-reader user can open/switch/close panels, access controls and return focus reliably; reduced-motion and contrast fallbacks are verified.
5. Inaccessible/unavailable tools are clearly represented; generic HTML5 works without any site adapter.
6. Measure CPU/memory, bundle footprint, responsiveness and video/compositor impact with controls closed, Overlay open, Docked open and during resize; set numeric budgets only from measured baselines.

## Blocking technical uncertainty (M0)

[V1C-120](https://v1cferr.atlassian.net/browse/V1C-120) must experimentally confirm on real Firefox/Zen builds that a **single interactive, resizable, always-on-top window** can contain the video surface and HTML tool layer, while retaining playback and restoring origin state. Test closing, refocusing, user activation, background tab lifecycle, iframe/cross-origin restrictions, DRM and fallback. If the browser cannot satisfy this central interaction model through supported APIs, document the failure and reassess the product approach before shipping an inferior lookalike.

This is a UX specification, not evidence that Firefox/Zen APIs already meet the requirements.

## Window pin control (V1C-129)

The PiP window offers a pin control with two toggles, both **off by default** and owned by the
user: **Above others** and **Follow workspaces**. Each toggle is a keyboard-reachable button
with `aria-pressed` and a visible state. Decided in
[ADR 0002](adr/0002-pip-window-pin-control.md).

- **With the optional helper installed** (a native messaging host): the toggles apply
  immediately through the compositor and show the state the compositor reports. On the
  compositors tested (Hyprland, sway), Follow workspaces needs a floating window. Turning
  it on therefore also turns on Above others, and turning Above others off also turns off
  Follow workspaces. The UI shows that coupling instead of pretending the toggles are
  independent.
- **Without the helper**, or on an unsupported compositor: the toggles stay visible but
  disabled, with a short reason. A link explains how to install the helper or add a window
  rule matching the `BetterPiP` title. Nothing fails silently.
- BetterPiP never writes to the user's compositor or browser configuration, and the helper
  is never required for the rest of the player.
