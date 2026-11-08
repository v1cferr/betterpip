# Development — preview build

The first runnable BetterPiP: Document PiP with the page's own video, a Svelte 5 + Tailwind v4
UI in the shadcn-svelte style, and Minimal / Overlay / Docked layouts. It is a **preview** for
trying the UX on real sites; scope and limits are listed below. Architecture:
[ADR 0003](adr/0003-core-architecture.md).

## Build

Requires Node 24 and pnpm. On NixOS without them installed, use them from nixpkgs:

```sh
export PATH=$(nix build --no-link --print-out-paths nixpkgs#nodejs)/bin:$(nix build --no-link --print-out-paths nixpkgs#pnpm)/bin:$PATH
unset LD_LIBRARY_PATH   # some shells export one that breaks Nix-store binaries

pnpm install            # exact versions from pnpm-lock.yaml
pnpm build              # → .output/firefox-mv3/
pnpm test               # core unit tests (Vitest)
pnpm check              # svelte-check / TypeScript
```

## Try it in your browser (Firefox ≥ 154 or Zen)

1. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick
   `.output/firefox-mv3/manifest.json`. It stays until the browser restarts. `pnpm build`
   again, then **Reload** on that page, after any change.
2. Open a page with a video, for example YouTube.
3. Press **Alt+Shift+P** or click the BetterPiP toolbar button (it may be under the puzzle
   icon). Firefox opens the PiP window directly. When the browser does not count the
   shortcut as a page gesture, a small **Open in BetterPiP** button appears on the video;
   click it.
4. In the PiP window:
   - **Space/k** play or pause; **j/l** ±10 s; **←/→** ±5 s; **m** mute;
     **1/2/3** Minimal/Overlay/Docked; **t** tools panel.
   - The top-right **↶** button returns the video to the tab.
   - The **Window** tab changes the layout, the glass blur and stacking.
5. Pin buttons (optional): run `tools/install-pin-helper.sh`, then in `about:addons` →
   BetterPiP → Preferences click **Allow pin helper**. `--uninstall` removes it. The helper
   lives only in your home directory (ADR 0002).

## What the preview covers

- Any page with an HTML5 `<video>` in the top-level document (generic session, no
  adapter).
- Controls the element supports: play, seek, ±10 s, volume/mute, speed. Live streams hide
  seek and speed.
- Captions from `<track>` elements. Chapters from `<track kind="chapters">`.
- Layout fallback by window size: Docked → Overlay below 640 px wide; Minimal below
  340×220. The preferred layout, blur and window size are remembered locally.

## Known gaps (next tasks)

- No YouTube adapter yet (V1C-123). YouTube's own chapters and captions are drawn by
  YouTube, so they do not show in the panel. The video itself works.
- Players inside cross-origin iframes and DRM-protected media are not supported
  (ADR 0001).
- `content-scripts/player.js` bundles the Svelte renderer with the detector (≈ 223 kB).
  ADR 0003 wants the renderer loaded only when a window opens; that split is pending (its
  open question 1).
- Bits UI is used for Tabs and ToggleGroup, which are verified inside PiP. Components that
  portal or listen on `document` (Tooltip, Popover, Select, Slider) still need checking:
  the content script's global `document` is the host page, not the PiP window.

## Automated checks

- `pnpm test`: contracts, adapter isolation (fallback, throw, timeout), command and message
  validation, settings migration.
- `tests/browser/preview_lab.py`: drives the built extension in an isolated headless sway
  session through the real shortcut. It checks every layout at several window sizes,
  Bits UI tabs with the keyboard, `k`, returning the video to the page, and that the host
  page gets no styles, and saves screenshots to `tests/browser/out/`. Run it as in
  [experiments/m0/README.md](../experiments/m0/README.md); pass `--declare` for Zen, whose
  extension cannot see tabs in that lab mode.
