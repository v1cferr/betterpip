<!-- Top strip over the video: page title, pin toggles (ADR 0002) and return-to-tab. -->
<script lang="ts">
  import Pin from "@lucide/svelte/icons/pin";
  import Layers from "@lucide/svelte/icons/layers";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import Button from "./ui/Button.svelte";
  import type { Player } from "./player.svelte";

  let { p, onClose }: { p: Player; onClose: () => void } = $props();

  const pinHint = $derived(p.stack.available ? "" : ` — ${p.stack.reason ?? "unavailable"}`);
</script>

<div class="pointer-events-auto flex items-center gap-1 bg-gradient-to-b from-black/75 to-transparent px-2 pt-1.5 pb-6">
  <span class="min-w-0 flex-1 truncate px-1 text-xs font-medium text-white/85" title={p.title}>{p.title}</span>
  <Button
    pressed={p.stack.above}
    aria-pressed={p.stack.above}
    aria-disabled={!p.stack.available}
    class={p.stack.available ? "" : "opacity-50"}
    aria-label="Keep above other windows{pinHint}"
    title="Keep above other windows{pinHint}"
    onclick={() => (p.stack.available ? p.setStacking("above", !p.stack.above) : ((p.tab = "window"), (p.panelOpen = true)))}
  ><Pin /></Button>
  <Button
    pressed={p.stack.followWorkspaces}
    aria-pressed={p.stack.followWorkspaces}
    aria-disabled={!p.stack.available}
    class={p.stack.available ? "" : "opacity-50"}
    aria-label="Show on all workspaces{pinHint}"
    title="Show on all workspaces{pinHint}"
    onclick={() => (p.stack.available ? p.setStacking("followWorkspaces", !p.stack.followWorkspaces) : ((p.tab = "window"), (p.panelOpen = true)))}
  ><Layers /></Button>
  <Button onclick={onClose} aria-label="Return video to the tab" title="Return to tab"><Undo2 /></Button>
</div>
