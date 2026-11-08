# V1C-121 lab — Svelte 5 in a Document PiP window from an isolated content script

Throw-away spike for [V1C-121](https://v1cferr.atlassian.net/browse/V1C-121). It closes the
open question in [ADR 0001](../../docs/adr/0001-pip-window-backend.md) §8: do Svelte 5's DOM
operations work across Xray wrappers, inside a PiP window that inherits the page's CSP?
**Not product code**; findings are in [ADR 0003](../../docs/adr/0003-core-architecture.md).

| Path | Purpose |
| --- | --- |
| `src/Panel.svelte` | Component exercising runes (`$state`, `$props`, `$effect`), `bind:value`, `{#each}`, `{#if}` + `transition:fade`, scoped CSS, `onDestroy`, media events bridged into state. |
| `src/content.js` | Isolated content script: opens Document PiP, `mount()`s the component into `pip.document.body`, reports results, `unmount()`s. |
| `build.mjs` | Compiles with `css: "injected"` and bundles with esbuild into `extension/content.js` (not versioned). |
| `harness/svelte_lab.py` | Reuses the M0 harness and the CSP probe page (`none`, `strict`, `tt`). |
| `results/` | Curated runs cited by the ADR. |

```sh
unset LD_LIBRARY_PATH
export PATH=$(nix build --no-link --print-out-paths nixpkgs#nodejs)/bin:$PATH
export ESBUILD_BINARY_PATH=$(nix build --no-link --print-out-paths nixpkgs#esbuild)/bin/esbuild
$(nix build --no-link --print-out-paths nixpkgs#pnpm)/bin/pnpm install   # exact versions from pnpm-lock.yaml
node build.mjs
../m0/harness/isolated-wayland.sh "$py" harness/svelte_lab.py --geckodriver "$gd" --browser "$firefox" --label firefox
```

pnpm 11 reports `ERR_PNPM_IGNORED_BUILDS` for esbuild after installing; that is expected,
because the esbuild binary comes from nixpkgs.
