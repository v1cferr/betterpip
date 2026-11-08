<!-- Small icon cluster over the video's top-right corner: pin toggles (ADR 0002) and
     return-to-tab. No title: the window stays video-only (UX.md "Clean view"). -->
<script lang="ts">
  import Pin from "@lucide/svelte/icons/pin";
  import Layers from "@lucide/svelte/icons/layers";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import Button from "./ui/Button.svelte";
  import type { Player } from "./player.svelte";

  let { p, onClose }: { p: Player; onClose: () => void } = $props();

  const pinHint = $derived(p.stack.available ? "" : ` — ${p.stack.reason ?? "unavailable"}`);
</script>

<div class="pointer-events-auto flex items-center gap-0.5 rounded-lg bg-black/45 p-0.5 backdrop-saturate-150">
  <Button
    size="icon-sm"
    pressed={p.stack.above}
    aria-pressed={p.stack.above}
    aria-disabled={!p.stack.available}
    class={p.stack.available ? "" : "opacity-50"}
    aria-label="Keep above other windows{pinHint}"
    title="Keep above other windows{pinHint}"
    onclick={() => (p.stack.available ? p.setStacking("above", !p.stack.above) : ((p.tab = "window"), (p.panelOpen = true)))}
  ><Pin /></Button>
  <Button
    size="icon-sm"
    pressed={p.stack.followWorkspaces}
    aria-pressed={p.stack.followWorkspaces}
    aria-disabled={!p.stack.available}
    class={p.stack.available ? "" : "opacity-50"}
    aria-label="Show on all workspaces{pinHint}"
    title="Show on all workspaces{pinHint}"
    onclick={() => (p.stack.available ? p.setStacking("followWorkspaces", !p.stack.followWorkspaces) : ((p.tab = "window"), (p.panelOpen = true)))}
  ><Layers /></Button>
  <Button size="icon-sm" onclick={onClose} aria-label="Return video to the tab" title="Return to tab"><Undo2 /></Button>
</div>
