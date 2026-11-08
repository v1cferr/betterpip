# BetterPiP

**An open-source, extensible and interactive Picture-in-Picture experience for the modern web.**

Firefox/Zen first. Chromium later. Universal by default, specialized when available.

> Planning stage — no extension implementation, installable build, CI workflow or release exists yet. Features below are goals, not shipped capabilities. Browser support must pass the feasibility gate.

## Why

Keep supported web videos visible while working in other applications, with useful controls, chapters, subtitles and a customizable interface. BetterPiP targets accessible HTML5 video across sites, with optional adapters for richer integrations. “Universal” is an architectural goal, not a guarantee that every video or site can be supported.

The motivating use case is a YouTube video whose description contains timestamps such as:

```text
00:00 - Introduction
00:30 - Calling features
03:27 - Voice typing
```

The intended player shows the current chapter, a clickable chapter list and previous/next chapter controls, alongside normal playback controls.

## Planned experience

- Generic HTML5 discovery and explicit selection when several videos are present.
- Play/pause, seek, timeline, volume/mute, playback speed and keyboard shortcuts.
- Chapters/timestamps and available subtitle tracks, with graceful handling of missing data.
- Compact and expanded layouts, light/dark themes and accessible keyboard/focus behavior.
- Optional site adapters: YouTube first; Vimeo, Twitch and educational players are later candidates.
- Local preferences, minimal permissions, no required account/backend and no telemetry by default.

## Feasibility first

The first milestone must validate interactive PiP and always-on-top behavior on actual Firefox and Zen versions. Do not assume Document Picture-in-Picture support from the earlier discussion or from another browser's support.

Compare public Document PiP, native video PiP and WebExtension popup approaches. An ordinary popup does not guarantee always-on-top. Record tested versions, operating systems, extension/page contexts, user activation, iframe/CSP/Shadow DOM restrictions, protected media limitations and fallback behavior.

Proceed to implementation only after a documented go/no-go decision. Preserve and restore the original video/session; avoid duplicate audio, unnecessary stream reloads and lost playback state.

See the [MDN API overview](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API) and [specification](https://wicg.github.io/document-picture-in-picture/).

## Technology decision (2026-11-08)

**Initial approved stack (pending M0 browser/API feasibility):**

| Concern | Choice |
| --- | --- |
| Browser-extension framework | WXT |
| Language / media core / content scripts | TypeScript (framework-free) |
| Interactive PiP UI only | Svelte 5 |
| Accessible UI components | shadcn-svelte + Bits UI |
| Styling | Tailwind CSS v4 |
| Icons | Lucide for Svelte (`@lucide/svelte`) |
| Animation | Native Svelte transitions; Motion for Svelte only where justified |
| Package manager | pnpm |
| Testing (planned) | Vitest + Playwright; real-browser manual validation |
| CI (planned, not installed) | GitHub Actions |

**No Next.js, React, SvelteKit, application backend or telemetry is required for the MVP.** shadcn-svelte components should be selectively imported, not treated as a UI bundle to load on every website.

The universal HTML5 detector, media/session state machine, capability contracts, secure messaging, storage interfaces and site adapters are **plain TypeScript**. **Svelte is confined to the interactive PiP UI and loaded on demand**, not in always-running content scripts. Keep UI and playback logic independent so an unavailable capability can be disabled or hidden without breaking the video. Prefer events over polling and limit DOM observers to relevant scopes.

WXT packages the extension; the renderer/window backend is chosen **only after V1C-120 validates** actual Firefox/Zen versions, page-vs-extension execution contexts, user activation, window lifecycle, cross-origin limits and always-on-top behavior. A regular extension popup is *not* guaranteed to stay on top. No claim of universal compatibility is made.

The stack is an **initial architecture decision, not a claim of implemented support**. Pin dependency versions, review licenses and record bundle size, idle CPU/memory, runtime update cost and potential observer/listener leaks during implementation. Revisit the decision with measurable evidence if M0 exposes constraints.

Read [ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries, compatibility gates, quality criteria and decision ownership; [CLAUDE.md](CLAUDE.md) provides repository-specific instructions to coding agents.

## Roadmap and tracking

The canonical technical backlog is [Jira V1C-119](https://v1cferr.atlassian.net/browse/V1C-119). Jira access may require authentication; public scope and milestones are mirrored in [ROADMAP.md](ROADMAP.md).

| Milestone | Outcome |
| --- | --- |
| M0 | Feasibility matrix and ADR; go/no-go for Firefox/Zen |
| M1 | Architecture, generic HTML5 session and playback controls |
| M2 | Accessible Firefox/Zen MVP, YouTube adapter, chapters and subtitles |
| M3 | Tests, CI, reproducible alpha builds, documentation and release readiness |
| M4 | Chromium feasibility/port and additional adapters |

No delivery dates or maintenance SLA are promised. Browser/store releases require a later explicit execution step.

## Quality and maintenance goals

Plan unit tests for timestamp parsing, capabilities and lifecycle; integration tests for messaging/adapters; local legal fixtures and end-to-end coverage. Validate real PiP windows manually on Firefox/Zen where automation is insufficient. Future CI should check lint, types, tests and builds, with pinned tooling and minimal permissions.

Adapter changes should include regression fixtures. Record compatibility and limitations per version. Contribution, security-reporting and release policies are tracked in the backlog; no workflow or infrastructure is enabled by this documentation bootstrap.

## Contributing at this stage

Planning feedback, reproducible browser capability evidence and proposed adapter requirements are welcome. Include browser/version, OS, expected behavior and a public or synthetic reproduction; do not post credentials, private watch history or protected media.

Use Jira as the canonical delivery backlog. Public GitHub issues may capture community feedback; link accepted work to its Jira item instead of maintaining conflicting task statuses.

## Inspiration

- [PiP Companion](https://github.com/kir4che/pip-companion)
- [Picture-in-Picture Anything](https://github.com/boryssey/picture-in-picture-anything)
- [Kairos Better Chapters](https://addons.mozilla.org/en-US/firefox/addon/kairos-better-chapters/)

These are references, not approved dependencies. No third-party source code has been incorporated. Review license and attribution requirements before reusing any code.

## License

[MIT](LICENSE) for original BetterPiP material. Third-party code/assets, if introduced later, retain their own applicable licenses and notices.
