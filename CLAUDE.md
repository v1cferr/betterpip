# BetterPiP — Agent Instructions

Before work, read [README.md](README.md), [ROADMAP.md](ROADMAP.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and the relevant Jira issue under [V1C-119](https://v1cferr.atlassian.net/browse/V1C-119). Jira owns task statuses, dependencies and acceptance criteria; GitHub documents the public architecture and hosts future code. Keep both in sync, but do not create duplicate, contradictory backlogs.

**Approved initial stack:** WXT, TypeScript, Svelte 5 (on-demand UI only), shadcn-svelte, Bits UI, Tailwind CSS v4, `@lucide/svelte`, native Svelte animations with Motion for Svelte only when justified, pnpm. TypeScript-only content scripts, media/session core, capability registry and site adapters; do not scaffold React, Next.js or SvelteKit.

**Current gate:** [V1C-120](https://v1cferr.atlassian.net/browse/V1C-120) must establish real Firefox/Zen support, correct page/extension context, interactive PiP and always-on-top behavior, lifecycle and safe fallback. Documentation is planning only: **do not begin code/prototypes/build/CI/releases until explicitly asked to execute that task**.

Favor capabilities-based progressive enhancement, no UI injected into every site, minimal permissions, local-only preferences, no tracking, tests and measurable performance. Never claim universal browser/player compatibility or bypass DRM/protected content. Preserve source video state when opening and closing PiP.

If the user authorizes implementation, work against the chosen Jira task, record evidence and constraints, and update both Jira and GitHub accordingly.