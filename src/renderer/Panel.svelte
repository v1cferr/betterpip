<!-- Shared tools panel (UX.md "Tool model"): one panel, used docked or as a glass overlay. -->
<script lang="ts">
  import { Tabs, ToggleGroup } from "bits-ui";
  import ListVideo from "@lucide/svelte/icons/list-video";
  import Captions from "@lucide/svelte/icons/captions";
  import AppWindow from "@lucide/svelte/icons/app-window";
  import Square from "@lucide/svelte/icons/square";
  import Layers2 from "@lucide/svelte/icons/layers-2";
  import Columns2 from "@lucide/svelte/icons/columns-2";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Pin from "@lucide/svelte/icons/pin";
  import Layers from "@lucide/svelte/icons/layers";
  import Button from "./ui/Button.svelte";
  import { cn } from "./ui/utils";
  import { formatTime } from "./format";
  import type { LayoutMode } from "../core/contracts/commands";
  import type { Player, PanelTab } from "./player.svelte";

  let { p, glass, onOpenSettings }: { p: Player; glass: boolean; onOpenSettings: () => void } = $props();

  const activeChapter = $derived.by(() => {
    let idx = -1;
    p.chapters.forEach((c, i) => { if (c.start <= p.media.time) idx = i; });
    return idx;
  });

  const trigger = "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-white/12 data-[state=active]:text-foreground [&_svg]:size-3.5";
  const layoutItem = "flex flex-1 flex-col items-center gap-1 rounded-md border border-transparent px-2 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground data-[state=on]:border-primary/50 data-[state=on]:bg-primary/15 data-[state=on]:text-foreground [&_svg]:size-4";
</script>

<section
  aria-label="BetterPiP tools"
  class={cn(
    "flex h-full min-h-0 flex-col text-foreground",
    glass ? "rounded-xl border border-white/10 bg-glass shadow-2xl shadow-black/40" : "border-l border-border bg-background",
    glass && p.blur && "backdrop-blur-md",
  )}
>
  <Tabs.Root value={p.tab} onValueChange={(v) => (p.tab = v as PanelTab)} class="flex min-h-0 flex-1 flex-col">
    <Tabs.List class="m-2 mb-1 flex gap-1 rounded-lg bg-black/25 p-1">
      <Tabs.Trigger value="chapters" class={trigger}><ListVideo />Chapters</Tabs.Trigger>
      <Tabs.Trigger value="captions" class={trigger}><Captions />Captions</Tabs.Trigger>
      <Tabs.Trigger value="window" class={trigger}><AppWindow />Window</Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="chapters" class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
      {#if p.chapters.length}
        <ol class="flex flex-col gap-0.5">
          {#each p.chapters as c, i (i)}
            <li>
              <button
                type="button"
                onclick={() => p.seek(c.start)}
                class={cn("flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/10", i === activeChapter && "bg-primary/15 text-primary")}
              >
                <span class="font-mono text-xs tabular-nums text-muted-foreground">{formatTime(c.start)}</span>
                <span class="min-w-0 flex-1 truncate">{c.title}</span>
              </button>
            </li>
          {/each}
        </ol>
      {:else}
        <div class="flex h-full flex-col items-center justify-center gap-2 px-4 py-6 text-center">
          <ListVideo class="size-6 text-muted-foreground/70" />
          <p class="text-sm font-medium">No chapters on this page</p>
          <p class="text-xs text-muted-foreground">Chapters appear when the video provides them. Site support (YouTube first) is coming.</p>
        </div>
      {/if}
    </Tabs.Content>

    <Tabs.Content value="captions" class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      {#if p.captions.length}
        <div class="flex flex-col gap-0.5">
          <button type="button" onclick={() => p.selectCaptions(null)}
            class={cn("rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/10", !p.captions.some((t) => t.active) && "bg-primary/15 text-primary")}>Off</button>
          {#each p.captions as t (t.id)}
            <button type="button" onclick={() => p.selectCaptions(t.id)}
              class={cn("rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/10", t.active && "bg-primary/15 text-primary")}>
              {t.label}{#if t.language}<span class="ml-1.5 text-xs text-muted-foreground">{t.language}</span>{/if}
            </button>
          {/each}
        </div>
      {:else}
        <div class="flex h-full flex-col items-center justify-center gap-2 px-4 py-6 text-center">
          <Captions class="size-6 text-muted-foreground/70" />
          <p class="text-sm font-medium">No caption tracks exposed</p>
          <p class="text-xs text-muted-foreground">Some sites draw captions themselves; those stay in the page for now.</p>
        </div>
      {/if}
    </Tabs.Content>

    <Tabs.Content value="window" class="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pt-1 pb-3">
      <div class="space-y-1.5">
        <p class="text-xs font-medium text-muted-foreground">Layout</p>
        <ToggleGroup.Root type="single" value={p.preferred} onValueChange={(v) => v && p.setLayout(v as LayoutMode)} class="flex gap-1.5">
          <ToggleGroup.Item value="minimal" class={layoutItem}><Square />Minimal</ToggleGroup.Item>
          <ToggleGroup.Item value="overlay" class={layoutItem}><Layers2 />Overlay</ToggleGroup.Item>
          <ToggleGroup.Item value="docked" class={layoutItem}><Columns2 />Docked</ToggleGroup.Item>
        </ToggleGroup.Root>
        {#if p.fallbackReason}<p class="text-[11px] text-amber-300/90">{p.fallbackReason}</p>{/if}
      </div>

      <label class="flex cursor-pointer items-center justify-between gap-2 text-sm">
        <span class="flex items-center gap-2"><Sparkles class="size-4 text-muted-foreground" />Glass blur</span>
        <input type="checkbox" class="size-4 accent-[var(--primary)]" checked={p.blur} onchange={() => p.toggleBlur()} />
      </label>

      <div class="space-y-1.5">
        <p class="text-xs font-medium text-muted-foreground">Window stacking</p>
        <div class="grid grid-cols-2 gap-1.5">
          <Button variant="outline" size="md" pressed={p.stack.above} aria-pressed={p.stack.above} disabled={!p.stack.available || p.stack.busy}
            onclick={() => p.setStacking("above", !p.stack.above)}><Pin />Above others</Button>
          <Button variant="outline" size="md" pressed={p.stack.followWorkspaces} aria-pressed={p.stack.followWorkspaces} disabled={!p.stack.available || p.stack.busy}
            onclick={() => p.setStacking("followWorkspaces", !p.stack.followWorkspaces)}><Layers />All workspaces</Button>
        </div>
        {#if p.stack.available}
          <p class="text-[11px] text-muted-foreground">On {p.stack.backend}, showing on all workspaces also keeps the window above others.</p>
        {:else}
          <p class="text-[11px] text-muted-foreground">{p.stack.reason ?? "Checking…"}</p>
          <Button variant="outline" size="sm" onclick={onOpenSettings}>Open BetterPiP settings</Button>
        {/if}
      </div>

      <div class="space-y-1 text-[11px] text-muted-foreground">
        <p class="text-xs font-medium">Keyboard</p>
        <p><kbd class="font-mono">k</kbd>/<kbd class="font-mono">Space</kbd> play · <kbd class="font-mono">j</kbd>/<kbd class="font-mono">l</kbd> ±10 s · <kbd class="font-mono">←</kbd>/<kbd class="font-mono">→</kbd> ±5 s · <kbd class="font-mono">m</kbd> mute · <kbd class="font-mono">1</kbd>/<kbd class="font-mono">2</kbd>/<kbd class="font-mono">3</kbd> layout · <kbd class="font-mono">t</kbd> panel</p>
      </div>
    </Tabs.Content>
  </Tabs.Root>
</section>
