# ADR 0003 — Core architecture: capabilities, contracts, adapters and permissions

| | |
| --- | --- |
| Status | **Accepted**, 2026-11-08 |
| Jira | [V1C-121](https://v1cferr.atlassian.net/browse/V1C-121) (M1, under [V1C-119](https://v1cferr.atlassian.net/browse/V1C-119)) |
| Builds on | [ADR 0001 — window backend](0001-pip-window-backend.md), [ADR 0002 — pin control](0002-pip-window-pin-control.md), [UX.md](../UX.md) |
| Evidence | [V1C-120 spike](../spikes/V1C-120/README.md), [V1C-129 spike](../spikes/V1C-129/README.md), [V1C-121 Svelte-in-PiP lab](../../experiments/v1c-121/README.md) |

This ADR fixes module boundaries and contracts. It does **not** scaffold the project, pin
dependency versions, or set performance budgets; those belong to the foundation work and
V1C-126.

## 1. Context

M0 established the facts the core must be built around:

- Document PiP opens only from a gesture **in the page**, in a top-level document.
- The page's own `<video>` can be moved into the PiP window and back without a reload.
- The PiP document **inherits the page's CSP**. Only DOM work from the **isolated** content
  script is exempt.
- On Wayland, stacking is the compositor's job. A pin control needs an optional native
  helper (ADR 0002).

The V1C-121 lab added the last missing fact. **Svelte 5.57.3, mounted from the isolated
content script into the PiP document, works under no, strict and Trusted Types page CSP**,
on Firefox 159.0 and Zen 1.24b (sway). In every run:

- the component mounted in 1–9 ms and its scoped styles were applied;
- clicks arrived as trusted events;
- `bind:value`, `$effect`, `{#each}` and `{#if}` worked;
- a `fade` transition ran in 300 ms both ways;
- `timeupdate` from the moved `<video>` drove `$state`;
- `unmount()` removed the DOM and ran `onDestroy`;
- no CSP violation was reported.

While the PiP was open, the opener tab's docshell stayed **active** even when another tab
was selected, so the page was not hidden and animations were not throttled. A control run
without a PiP was not made.

Measured size: Svelte runtime plus that component, with a transition, minified and bundled
by esbuild, came to **64,067 B (23.8 KB gzip)**.

## 2. Decision summary

1. **Capability-driven core in plain TypeScript.** The core holds discovery, session,
   capabilities, bridge, window, stacking, settings and adapters. It runs in the isolated
   content script and the background, and **never** loads a UI framework into pages.
2. **Renderer in Svelte 5, loaded only when a PiP window opens**, and mounted from the
   isolated world into the PiP document. No UI code runs in the page's MAIN world.
3. **Generic HTML5 session always works without an adapter.** Adapters only *add*
   capabilities and metadata, and a failing adapter degrades to the generic session.
4. **Typed, closed contracts** for commands, events, capabilities, errors and disposal,
   validated at every boundary.
5. **Minimal permissions.** The baseline is `activeTab`, `scripting` and `storage`.
   Per-origin host permissions and `nativeMessaging` are optional and requested at the
   moment of use.
6. **Local-only, versioned settings. No telemetry, no network of our own.**

## 3. Runtime contexts

| Context | Runs | Holds | Must not |
| --- | --- | --- | --- |
| Background (event page) | Always (event-driven) | Settings store, permission requests, toolbar/command entry, native helper relay | Touch page DOM; keep long-lived state that is not in storage |
| Isolated content script, **detector** | Injected on demand (`activeTab`), or declared only for origins the user granted | Discovery, the in-page affordance, the session core, adapters, the bridge | Load Svelte; poll; observe more than the media subtree it needs |
| Isolated content script, **renderer** | Only after a PiP window opens | Svelte UI mounted into the PiP document, layout engine | Run in the MAIN world; inject UI into the host page |
| MAIN-world bridge (optional, per adapter) | Only for adapters that need page JavaScript objects | A tiny, schema-checked request/response shim | Hold UI; trust or `eval` page data |
| Native helper (optional) | Only if installed and enabled | Compositor calls, closed message set (ADR 0002) | Accept free-form commands |

**Entry flow.** The user clicks the toolbar button or presses the shortcut. The background
injects the detector into that tab under `activeTab`. The detector shows a small affordance
next to the selected video. A click there, or the page-level shortcut, is the gesture that
opens Document PiP (ADR 0001). If the manual check M8 later shows that a toolbar or
command gesture itself grants page activation, the affordance step can be skipped. That is
a UX simplification, not a contract change.

## 4. Module map

```text
src/
  core/
    contracts/      commands.ts, events.ts, capabilities.ts, errors.ts, dispose.ts  (types only)
    discovery/      find + rank candidate <video> elements; scoped MutationObserver
    session/        MediaSession: commands → element, element events → typed events
    capabilities/   registry: generic probe ∪ adapter claims, each with status + reason
    window/         backends: documentPip | nativePip | none; element custody (move/restore)
    stacking/       pin control client (ADR 0002); `none` when no helper
    bridge/         content ↔ background runtime messages; optional MAIN-world shim
    settings/       versioned local storage + migrations
    adapters/       registry + generic fallback; site adapters (youtube/ first, V1C-123)
  renderer/         Svelte 5 PiP UI (V1C-125): layout engine, panels, controls
entrypoints/        WXT entrypoints: background, detector (content), renderer (content chunk)
```

The core modules are plain TypeScript with no DOM-framework dependency. Their unit tests
need no browser. Only `renderer/` imports Svelte, shadcn-svelte, Bits UI, Tailwind output
and `@lucide/svelte`.

## 5. Contracts

The code below is normative in shape; names may still be refined in the foundation PR.

### 5.1 Disposal

Every module that subscribes to anything returns a `Disposable`. Listeners are registered
with an `AbortSignal`, so one `abort()` releases them all. Observers, timers and the
`ResizeObserver` are tied to the same signal.

```ts
interface Disposable { dispose(): void }          // idempotent; never throws
type Scope = { signal: AbortSignal; defer(fn: () => void): void };
```

A session owns a root scope. Closing the PiP window (`pagehide`), the opener navigating,
the element being removed, or the extension being disabled aborts it. Child scopes are
created for the renderer, the adapter and the stacking client. A leak test can then assert
that zero listeners remain after `dispose()` (V1C-126).

### 5.2 Capabilities

```ts
type CapabilityId =
  | "play" | "seek" | "duration" | "live" | "volume" | "mute" | "rate"
  | "chapters" | "captions" | "windowBackend" | "stacking";

type Capability<V = unknown> =
  | { status: "supported"; value?: V; source: "generic" | `adapter:${string}` }
  | { status: "unavailable"; reason: UnavailableReason };

type UnavailableReason =
  | "notExposed" | "live" | "drm" | "crossOriginFrame" | "noActivation"
  | "unsupportedBrowser" | "needsHelper" | "unsupportedCompositor" | "adapterFailed";
```

- The generic probe derives the media capabilities from the element: `duration` is finite
  and not `Infinity`, `seekable.length` is greater than 0, `playbackRate` is writable, and
  so on.
- An adapter can only **upgrade** a capability with evidence, for example chapters parsed
  from the page. It cannot mark one supported that the element refuses.
- The UI renders only `supported` controls. An `unavailable` capability that the user can
  act on, such as `needsHelper`, is shown disabled, with its reason.
- `windowBackend` takes the values `documentPip`, `nativePip` or `none`. `stacking` takes
  `{ above, followWorkspaces, coupled }` (ADR 0002).

### 5.3 Commands and events

```ts
type Command =
  | { type: "play" } | { type: "pause" }
  | { type: "seek"; to: number }                  // seconds, clamped to seekable ranges
  | { type: "setVolume"; value: number }          // 0..1
  | { type: "setMuted"; value: boolean }
  | { type: "setRate"; value: number }            // validated against allowed set
  | { type: "selectCaptions"; trackId: string | null }
  | { type: "openWindow"; layout?: LayoutMode } | { type: "closeWindow" }
  | { type: "setLayout"; mode: LayoutMode }
  | { type: "setStacking"; above?: boolean; followWorkspaces?: boolean };

type MediaEvent =
  | { type: "state"; paused: boolean; time: number; duration: number | null; rate: number; volume: number; muted: boolean }
  | { type: "capabilities"; caps: Partial<Record<CapabilityId, Capability>> }
  | { type: "chapters"; items: { start: number; title: string }[] }
  | { type: "windowOpened"; backend: "documentPip" | "nativePip" }
  | { type: "windowClosed"; reason: "user" | "openerNavigated" | "elementLost" | "error" }
  | { type: "error"; error: BpError };

type LayoutMode = "minimal" | "overlay" | "docked";
```

- Commands only ever flow *into* the session. They are validated (type, ranges) before
  they touch the element.
- Events flow *out* and are the renderer's only input. The renderer never reads the
  element directly, so a future non-DOM backend can implement the same contract.
- State events are coalesced: media events drive them, and `timeupdate` is throttled to
  rendering needs. Nothing polls.

### 5.4 Errors

```ts
type BpErrorCode =
  | "NO_MEDIA" | "ACTIVATION_REQUIRED" | "NOT_TOP_LEVEL" | "WINDOW_REFUSED"
  | "ELEMENT_LOST" | "ADAPTER_FAILED" | "ADAPTER_TIMEOUT" | "HELPER_UNAVAILABLE"
  | "PERMISSION_DENIED" | "STORAGE_MIGRATION_FAILED" | "INVALID_MESSAGE";
interface BpError { code: BpErrorCode; message: string; recoverable: boolean; cause?: string }
```

Errors are values on the event stream; they are not thrown across boundaries. Each code maps
to one user-facing state in the UI (V1C-125) and to a capability `reason` where relevant.

### 5.5 Adapters

```ts
interface SiteAdapter {
  id: string;                                     // "youtube"
  matches(url: URL): boolean;                     // pure, cheap
  attach(ctx: AdapterContext): Promise<AdapterHandle>;
}
interface AdapterContext { video: HTMLVideoElement; scope: Scope; timeoutMs: number; log(e: BpError): void }
interface AdapterHandle extends Disposable {
  capabilities(): Partial<Record<CapabilityId, Capability>>;
  chapters?(): Promise<{ start: number; title: string }[]>;
  onElementAway?(): void;                         // site UI while <video> is in PiP (V1C-123)
  onElementBack?(): void;
}
```

Isolation rules:
- `attach` runs under a timeout and inside `try`/`catch`.
- Any throw, rejection or timeout disposes the adapter's scope, emits
  `ADAPTER_FAILED`/`ADAPTER_TIMEOUT`, and leaves the generic session running.
- Adapters receive the video and a scope, not the session's internals. They cannot issue
  window or stacking commands.

### 5.6 Element custody (window module)

- **Opening:** insert a placeholder comment where the element was, then move the element
  into the PiP stage.
- **Closing:** `pagehide`, a user close, the opener navigating, or the element being
  removed by the site restores the element through the placeholder. If the placeholder is
  gone, the element is appended to the original parent if that still exists; otherwise
  `ELEMENT_LOST` is emitted.
- Playback state is never reset by a layout change or a panel switch.

## 6. Messaging and origin validation

- **Content ↔ background:** `runtime.sendMessage`/`onMessage` only.
  - The background accepts a message only if `sender.id === runtime.id` and, for
    tab-scoped requests, `sender.tab` is present and `sender.url` matches the tab's origin
    permission.
  - Every message is checked against its schema (discriminated union and value ranges).
    Invalid ones are dropped and logged locally as `INVALID_MESSAGE`.
- **MAIN-world bridge (only when an adapter needs it):**
  - Requests go from the isolated world through a `CustomEvent` on a per-session random
    channel name, and replies come back the same way.
  - The page can see and forge these events, so replies are treated as **untrusted data**:
    schema-checked, size-limited, and never executed.
  - Nothing privileged is reachable from the page side.
- **Native helper:** the closed message set and the token rules from ADR 0002.
- **Page data in general** (titles, chapter text, captions) is rendered as text through
  Svelte's escaping, never as HTML.

## 7. Isolation and CSP

- UI DOM and styles are created only from the isolated world, which is exempt from the
  page CSP that the PiP document inherits (V1C-120 E7, V1C-121 lab).
- Styles reach the PiP document as a stylesheet Svelte injects next to its mount target,
  or as a constructable `adoptedStyleSheets` sheet.
- The host page gets no styles, apart from the small detector affordance. That affordance
  lives in a closed shadow root with its own constructable stylesheet.
- No remote code and no `eval`. The extension keeps the default MV3 extension CSP.

## 8. Permissions

| Permission | When | Why |
| --- | --- | --- |
| `activeTab`, `scripting` | Install | Inject the detector into the current tab only after a user action |
| `storage` | Install | Local settings |
| Host permission for an origin (`permissions.request`) | When the user chooses "always enable on this site" | Auto-inject the detector there; also gives `sender.url` for validation |
| `nativeMessaging` (optional) | When the user enables the pin control | ADR 0002 helper |

The extension does not request `<all_urls>`, `tabs`, `webRequest` or `history`.

## 9. Settings storage

```ts
interface SettingsV1 {
  version: 1;
  layout: { preferred: LayoutMode; blur: boolean; reducedMotion: "system" | "on" | "off" };
  stacking: { above: boolean; followWorkspaces: boolean };      // default false/false
  origins: Record<string /* origin */, { autoDetect: boolean; preferredLayout?: LayoutMode }>;
}
```

- Settings live in `storage.local` only. Nothing goes to `storage.sync` by default, since
  syncing would send data off the device.
- Each version bump ships a migration `vN → vN+1`. If a migration fails, the extension
  keeps the old data, uses the defaults, and emits `STORAGE_MIGRATION_FAILED`.

## 10. Privacy

There is no telemetry, analytics, crash reporting or account. The extension makes no network
requests of its own; media requests stay the page's own. Diagnostics stay in a local,
size-capped ring buffer that the user can export by hand.

## 11. Stack and licences

Versions below are those current on npm on 2026-11-08, for licence review only. The
foundation pins exact versions with a lockfile (pnpm).

| Package | Role | Licence | Why |
| --- | --- | --- | --- |
| `wxt` 0.21.x | Extension framework/build | MIT | MV3 manifests, Firefox targets, content-script chunks, dev reload |
| `typescript` 7.x | Language | Apache-2.0 | Contracts in §5 are types first |
| `svelte` 5.x | Renderer only | MIT | Compiled, small runtime; proven in PiP across Xrays and CSP (§1) |
| `shadcn-svelte` 1.x, `bits-ui` 2.x | Accessible primitives (selected, copied in) | MIT | Keyboard/ARIA behaviour without a heavy kit |
| `tailwindcss` 4.x | Styling build | MIT | Compiled CSS, scoped to the PiP document |
| `@lucide/svelte` | Icons | ISC | Tree-shakable SVG icons |
| `motion` | Selected animations only | MIT | Only where Svelte transitions are insufficient |
| `pnpm` | Package manager | MIT | Strict, reproducible installs |
| `vitest`, `@playwright/test` (planned) | Tests | MIT, Apache-2.0 | Core unit tests; browser tests next to the M0 harness (V1C-126) |

All of these licences allow distributing BetterPiP under any OSI licence the project picks
in V1C-127.

## 12. Performance

No budget is approved here. The only measured data point is the renderer spike: about 64 KB
minified, 24 KB gzip, for the Svelte runtime plus one component with a transition. Rules:

- the detector bundle must not include Svelte or Tailwind;
- the renderer chunk is injected only when a window opens;
- component imports are selective;
- idle CPU, memory, wakeups and leaks are measured on the M0 fixture before a budget is
  set (V1C-126).

## 13. Consequences

- V1C-122 (session) implements `discovery`, `session`, `window` and `capabilities` against
  §5.
- V1C-123 (adapters) implements `SiteAdapter` for YouTube, including `onElementAway`.
- V1C-125 (UI) consumes only events, commands and capabilities.
- V1C-126 adds contract tests: schema rejection, adapter failure leaving the generic
  session running, and zero listeners after `dispose()`.
- The pin control and its helper follow ADR 0002. Packaging the helper is V1C-127.

## 13a. Preview build (2026-11-08)

The first runnable build follows this ADR. Details are in [DEVELOPMENT.md](../DEVELOPMENT.md).
Deviations and findings:

- **TypeScript 6.0.3, not 7.x.** `svelte-check` 4.7 supports TypeScript 5 and 6 only.
- **The renderer is still bundled with the detector** in one injected script (≈ 223 kB).
  That is acceptable while it is injected only after a user action, but §12 still wants
  the split (open question 1).
- **Shortcut gesture:** on Firefox 159, the extension shortcut opened Document PiP
  directly from the injected content script (`navigator.userActivation.isActive` was
  true). This partly answers open question 2. The in-page button stays as the fallback.
  In the Zen lab attach mode the command still reaches no tab, so the background now falls
  back to the active tab of the focused window.
- **Svelte inside PiP:** `<svelte:document>` and `<svelte:window>` bind the content
  script's globals, i.e. the **host page**. PiP-document listeners must be added on
  `element.ownerDocument`. Bits UI Tabs and ToggleGroup work in PiP; components that use
  global `document` or portals are unverified.

## 14. Open questions

1. Can the renderer chunk be loaded lazily from a content script in Firefox, for example
   with `scripting.executeScript({ files })` from the background on `openWindow`, or with
   a dynamic `import()` of a web-accessible module? This must be checked in the foundation
   before deciding how WXT is configured.
2. Does a toolbar or command gesture grant page activation (M8 from V1C-120)? This decides
   whether the in-page affordance stays mandatory.
3. Is the opener's active docshell during PiP (§1) guaranteed, or an implementation detail?
   A control run without a PiP, plus a Mozilla reference, is needed before relying on it
   for animations.
4. Shadow-DOM and iframe players: discovery scope and fallback messaging (V1C-122).
