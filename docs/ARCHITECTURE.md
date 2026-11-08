# BetterPiP — Architecture and Technology Decision

Status: **accepted architecture, approved stack; no product code yet**. Updated 2026-11-08. The M0 feasibility gate [V1C-120](https://v1cferr.atlassian.net/browse/V1C-120) passed (**GO**). Decisions: [ADR 0001 — window backend](adr/0001-pip-window-backend.md), [ADR 0002 — pin control](adr/0002-pip-window-pin-control.md), [ADR 0003 — core architecture and contracts](adr/0003-core-architecture.md). See [V1C-119](https://v1cferr.atlassian.net/browse/V1C-119) for canonical project scope and [ROADMAP](../ROADMAP.md) for dependencies.

## Technology stack

- WXT (browser extension) + TypeScript + pnpm.
- **Svelte 5 strictly for on-demand interactive PiP UI**, not the always-running page detector.
- shadcn-svelte and Bits UI for selected accessible components; Tailwind CSS v4; `@lucide/svelte`.
- Native Svelte transitions first; Motion for Svelte only for interactions that justify its additional cost.
- Vitest, Playwright and GitHub Actions are *planned*, not installed. Real Firefox/Zen manual tests remain essential.
- No Next.js, React, SvelteKit or backend for the MVP; no account or telemetry by default. No dependencies are pinned yet.

## Boundaries

1. **Universal media discovery (plain TypeScript):** detect and select accessible HTML5 video elements, including dynamically inserted media; scope observers, avoid busy polling, do not inject a UI runtime into every page.
2. **Media/session core (plain TypeScript):** playback actions/events, lifecycle, cleanup, origin restoration, secure messages; prefer platform events, distinguish VOD/live and unavailable functions.
3. **Capability registry (plain TypeScript):** expose supported seek, duration, rate, volume, captions and chapters; UI must never imply unsupported controls work.
4. **Site adapters (plain TypeScript):** progressively enhance known origins (YouTube first), handle SPA navigation, missing metadata and markup changes without breaking generic playback.
5. **Window backend:** Document PiP vs native PiP vs extension popup based on experimentally verified browser/API capabilities. **An ordinary popup does not guarantee always-on-top**. Decided in [ADR 0001](adr/0001-pip-window-backend.md): Document PiP primary, native video PiP as the video-only fallback, popup rejected. Stacking on Wayland is the compositor's; an optional pin control goes through a native helper ([ADR 0002](adr/0002-pip-window-pin-control.md)).
6. **PiP renderer + adaptive layout (Svelte 5, loaded on demand):** single-window Minimal / Overlay-Glass / Docked-Split states; responsive composition inside user-selected window bounds, with shared tool panel and capability-driven controls. Preserve the video's aspect ratio and focus/keyboard accessibility. Use localized translucency/optional blur rather than costly full-surface effects; isolate styles from host websites and minimize JS/CSS bundle impact.
7. **Local settings:** versioned browser storage, minimal origin permissions, explicit grants where possible.

## Single-window UX contract (approved 2026-11-08)

Read [UX.md](UX.md) as the authoritative public specification for interaction states. A **single user-resizable floating PiP window contains both the original video surface and the tools**; no secondary windows for chapters/controls and no automatic outer-window expansion. The interface supports:

- **Minimal** with no permanently reserved panel; contextual playback chrome.
- **Overlay / Glass** with a dismissible translucent tools layer over the existing video surface, contrast/opacity controls and optional limited blur.
- **Docked / Split** with video left, tools right, sharing the existing window; separate panel scrolling, original aspect ratio maintained.
- Container-scoped size adaptation. If Docked cannot remain readable at a smaller window size, gracefully fall back to Overlay/Minimal while preserving the user's preferred mode to restore when size permits.
- One shared modules/panels model for playback, chapters and captions; capabilities control visibility. Comments/playlist/chat remain **deferred**, with permissions, privacy and adapter evaluation required.

The player must not reset or duplicate streams upon resize, layout change or panel switching. No promises of full website feature parity. Browser/OS window constraints, PiP lifecycle and the practicality of moving/referencing the media element in an arbitrary-HTML PiP **must be tested in M0**, not assumed.

## Feasibility gate — V1C-120

**Result (2026-11-08): GO** — see the [V1C-120 spike report](spikes/V1C-120/README.md). Original gate text: on actual Firefox and Zen builds, record OS, browser version and test context (page vs content script vs extension). Check `documentPictureInPicture`, user activation, window ownership/lifecycle, always-on-top **across apps**, original video preservation, duplicate audio/stream behavior, focus restoration, SPA navigation, iframe cross-origin and CSP restrictions. Verify results with reproducible evidence; API presence alone is insufficient. If central interactive always-on-top functionality is not viable, write an ADR, choose an honest fallback or revisit scope before starting M1.

## Performance and quality

Establish and measure baseline in a fixed test fixture: extension package size, injected script size, idle and active CPU/memory, wakeups, UI update latency, observer/listener leaks, playback continuity and resize/overlay/compositing costs (closed vs Overlay vs Docked). Record results per browser/OS; avoid invented budgets and set thresholds after baseline measurement. Components are imported selectively; animations respect reduced-motion preferences. Test keyboard use, focus, screen-reader labels, contrast and error/unavailable states.

## Source-of-truth policy for agents

Jira V1C-119 and child issues are the canonical **backlog/status/dependencies/acceptance criteria**. The repository's README, ROADMAP and this file are the public **architecture and goals**. In case of conflict, **do not silently implement from stale text**: inspect both, record the discrepancy and update the documentation/issue or request a decision. The approved stack supersedes earlier React/shadcn/ui mentions. All feature implementation remains blocked on M0 go/no-go. Do not create scaffold, prototype, CI, release or publish without authorization.