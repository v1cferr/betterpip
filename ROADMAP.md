# BetterPiP roadmap

Status: planning only, 2026-11-08. No implementation has started.

Canonical project: [V1C-119](https://v1cferr.atlassian.net/browse/V1C-119).
Repository: [v1cferr/betterpip](https://github.com/v1cferr/betterpip).

Milestones represent acceptance gates, not scheduled releases. Jira items carry detailed scope and acceptance criteria; this public document summarizes them.

| Item | Milestone | Scope | Prerequisites |
| --- | --- | --- | --- |
| [V1C-120](https://v1cferr.atlassian.net/browse/V1C-120) | M0 | Validar PiP interativo e always-on-top em Firefox/Zen | None; first gate |
| [V1C-121](https://v1cferr.atlassian.net/browse/V1C-121) | M1 | Definir core por capacidades, contratos de adaptadores e permissões | V1C-120 |
| [V1C-122](https://v1cferr.atlassian.net/browse/V1C-122) | M1 | Planejar e desenvolver sessão universal para vídeos HTML5 acessíveis | V1C-120, V1C-121 |
| [V1C-123](https://v1cferr.atlassian.net/browse/V1C-123) | M2 | Criar contrato de integração e primeiro adaptador YouTube | V1C-121, V1C-122 |
| [V1C-124](https://v1cferr.atlassian.net/browse/V1C-124) | M2 | Normalizar capítulos, timestamps e legendas disponíveis | V1C-121, V1C-123 |
| [V1C-125](https://v1cferr.atlassian.net/browse/V1C-125) | M2 | Desenhar e implementar player acessível e personalizável | V1C-120, V1C-121, V1C-122 |
| [V1C-126](https://v1cferr.atlassian.net/browse/V1C-126) | M3 | Estabelecer testes, matriz de compatibilidade e CI reproduzível | V1C-121, V1C-122, V1C-123, V1C-124, V1C-125 |
| [V1C-127](https://v1cferr.atlassian.net/browse/V1C-127) | M3 | Definir contribuição, manutenção e distribuição Firefox/Zen | V1C-120, V1C-126 |
| [V1C-128](https://v1cferr.atlassian.net/browse/V1C-128) | M4 | Avaliar portabilidade Chromium e expansão de adaptadores | V1C-126, V1C-127 |

## Technology decision (2026-11-08)

Initial stack: **WXT + TypeScript + Svelte 5 + shadcn-svelte/Bits UI + Tailwind CSS v4 + Lucide Svelte + native Svelte transitions (Motion selectively) + pnpm**. Content scripts, HTML5 detection, media/session core, capabilities and site adapters use framework-free TypeScript. Svelte is loaded **only for interactive PiP UI on demand**. Vitest, Playwright and GitHub Actions are planned, not installed. No Next.js/React/SvelteKit/backend is needed for the MVP.

See [architecture decision and boundaries](docs/ARCHITECTURE.md) and [Claude Code instructions](CLAUDE.md). **M0 remains the blocking gate**: verify actual Firefox/Zen interactive PiP and always-on-top behavior before initiating implementation. Establish performance baselines (bundle size, injected footprint, idle CPU/memory, active playback/update cost and listener leaks) with reproducible fixtures; don't assert unmeasured thresholds.

## M0 — Feasibility

Produce a dated browser/OS/context matrix and an architecture decision. Validate interaction, always-on-top, opening/closing, **one interactive window containing video + panels**, manual window resizing and internal layout responsiveness, media state preservation, permissions and fallback. A failed central requirement triggers scope review before M1. No Firefox/Zen API support is claimed yet.

## M1 — Foundation and generic core

Define capability-driven contracts, secure page/extension messaging and window backends. Deliver a generic HTML5 fixture flow with selection, bidirectional playback controls and cleanup/restoration; no site adapter is required for the basic path.

## M2 — Firefox/Zen MVP

First adapter: YouTube, including SPA navigation and chapter/timestamp sources. Normalize chapters and available subtitle tracks. A timestamp of 03:27 seeks to 207 seconds. Test malformed/duplicate timestamps, missing chapters, live media and unavailable capabilities.

**Single-window adaptive UX ([specification](docs/UX.md)):** Minimal (video-first), Overlay / Glass (tools over video), and Docked / Split (video left, tools right) **inside one manually resizable PiP window**. Switching modes and resizing must not create windows, resize outer bounds on its own, restart streams, stretch/crop video by default or permanently hide essential controls. On narrow dimensions, degrade Docked to Overlay/Minimal while preserving user preference. Accessible focus, keyboard interaction, contrast/opacity, reduced motion and affordable glass compositing are acceptance criteria for V1C-125. Comments are deferred.

## M3 — Quality and alpha readiness

Combine unit, integration and end-to-end checks with explicit manual validation of real PiP windows. Define reproducible builds, CI, permission/privacy review, performance measurements, contribution/security guidance, license notices, SemVer and release checklist. AMO submission is a later step after acceptance.

## M4 — Chromium and integrations

Evaluate API/Manifest/background differences and retain shared core behavior without Firefox/Zen regressions. Prioritize Vimeo/Twitch/educational adapters from demand, stable access, license obligations and maintenance cost.

## Deferred scope

YouTube comments, playlists, public plugin ecosystem, chat, AI/transcription, screenshots and next-video navigation need separate refinement. These would use the same tool layer if feasible, not an extra window. Protected/inaccessible media is a documented compatibility boundary; universal coverage is not an acceptance promise.

## Definition of done

Every implemented item must include relevant tests, supported-version evidence, documented limitations and its Jira reference. Main task holds the vision; progress and evidence belong to the corresponding child item. No implementation, prototype, scaffold, executable CI workflow, store publication or release is part of the initial formalization.
