# BetterPiP — Architecture and Technology Decision

Status: **proposed architecture, approved stack; no implementation yet**. Updated 2026-11-08. The M0 feasibility gate [V1C-120](https://v1cferr.atlassian.net/browse/V1C-120) precedes implementation. See [V1C-119](https://v1cferr.atlassian.net/browse/V1C-119) for canonical project scope and [ROADMAP](../ROADMAP.md) for dependencies.

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
5. **Window backend:** Document PiP vs native PiP vs extension popup based on experimentally verified browser/API capabilities. **An ordinary popup does not guarantee always-on-top**.
6. **PiP renderer (Svelte 5, loaded on demand):** compact/expanded interface, chapters, subtitles, controls, themes, focus and keyboard navigation. Isolate styles from host websites and minimize JS/CSS bundle impact.
7. **Local settings:** versioned browser storage, minimal origin permissions, explicit grants where possible.

## Feasibility gate — V1C-120

On actual Firefox and Zen builds, record OS, browser version and test context (page vs content script vs extension). Check `documentPictureInPicture`, user activation, window ownership/lifecycle, always-on-top **across apps**, original video preservation, duplicate audio/stream behavior, focus restoration, SPA navigation, iframe cross-origin and CSP restrictions. Verify results with reproducible evidence; API presence alone is insufficient. If central interactive always-on-top functionality is not viable, write an ADR, choose an honest fallback or revisit scope before starting M1.

## Performance and quality

Establish and measure baseline in a fixed test fixture: extension package size, injected script size, idle and active CPU/memory, wakeups, UI update latency, observer/listener leaks and playback continuity. Record results per browser/OS; avoid invented budgets and set thresholds after baseline measurement. Components are imported selectively; animations respect reduced-motion preferences. Test keyboard use, focus, screen-reader labels, contrast and error/unavailable states.

## Source-of-truth policy for agents

Jira V1C-119 and child issues are the canonical **backlog/status/dependencies/acceptance criteria**. The repository's README, ROADMAP and this file are the public **architecture and goals**. In case of conflict, **do not silently implement from stale text**: inspect both, record the discrepancy and update the documentation/issue or request a decision. The approved stack supersedes earlier React/shadcn/ui mentions. All feature implementation remains blocked on M0 go/no-go. Do not create scaffold, prototype, CI, release or publish without authorization.