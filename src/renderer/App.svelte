<!-- PiP root: one window, three layout states (UX.md). The page's own <video> sits in the
     stage; tools are drawn around or over it. -->
<script lang="ts">
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import Controls from "./Controls.svelte";
  import TopBar from "./TopBar.svelte";
  import Panel from "./Panel.svelte";
  import { cn } from "./ui/utils";
  import type { Player } from "./player.svelte";

  let { p, stage, onClose, onOpenSettings }: { p: Player; stage: HTMLElement; onClose: () => void; onOpenSettings: () => void } = $props();

  let root: HTMLDivElement;
  let stageHost: HTMLDivElement;
  let chromeVisible = $state(true);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const compact = $derived(p.width < 420);

  $effect(() => {
    stageHost.prepend(stage);
    const ro = new (root.ownerDocument.defaultView as Window & typeof globalThis).ResizeObserver(([e]) => {
      if (!e) return;
      p.width = Math.round(e.contentRect.width);
      p.height = Math.round(e.contentRect.height);
    });
    ro.observe(root);
    // Keys go to the PiP document. <svelte:document> would bind the content script's global
    // document, which is the host page, not this window.
    const doc = root.ownerDocument;
    doc.addEventListener("keydown", onKey);
    void p.refreshStacking();
    return () => {
      ro.disconnect();
      doc.removeEventListener("keydown", onKey);
    };
  });

  function wake() {
    chromeVisible = true;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!p.media.paused) chromeVisible = false;
    }, 2500);
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (e.altKey || e.ctrlKey || e.metaKey || t.tagName === "INPUT" && (t as HTMLInputElement).type !== "range" && (t as HTMLInputElement).type !== "checkbox") return;
    const handled = (() => {
      switch (e.key) {
        case " ": if (t.tagName === "BUTTON") return false; p.togglePlay(); return true;
        case "k": p.togglePlay(); return true;
        case "j": p.seekBy(-10); return true;
        case "l": p.seekBy(10); return true;
        case "ArrowLeft": if (t.tagName === "INPUT") return false; p.seekBy(-5); return true;
        case "ArrowRight": if (t.tagName === "INPUT") return false; p.seekBy(5); return true;
        case "m": p.toggleMute(); return true;
        case "1": p.setLayout("minimal"); return true;
        case "2": p.setLayout("overlay"); return true;
        case "3": p.setLayout("docked"); return true;
        case "t": p.panelOpen = !p.panelOpen; return true;
        default: return false;
      }
    })();
    if (handled) { e.preventDefault(); wake(); }
  }

  const showChrome = $derived(chromeVisible || p.media.paused);
</script>

<div bind:this={root} class="dark flex h-dvh w-dvw overflow-hidden bg-black font-sans text-foreground" data-layout={p.effective}>
  <div
    class={cn("relative min-w-0 flex-1", !showChrome && "cursor-none")}
    role="presentation"
    onpointermove={wake}
    onpointerdown={wake}
    onfocusin={wake}
  >
    <div bind:this={stageHost} class="absolute inset-0"></div>

    {#if p.media.waiting}
      <div class="pointer-events-none absolute inset-0 grid place-items-center">
        <LoaderCircle class="size-10 animate-spin text-white/80" />
      </div>
    {/if}

    <div class={cn("pointer-events-none absolute inset-x-0 top-0 transition-opacity duration-300", showChrome ? "opacity-100" : "opacity-0")}>
      <TopBar {p} {onClose} />
    </div>

    {#if p.effective === "overlay" && p.panelOpen}
      <div class="absolute top-11 right-2 bottom-20 w-[min(320px,46%)]">
        <Panel {p} glass {onOpenSettings} />
      </div>
    {/if}

    <div class={cn("pointer-events-none absolute inset-x-0 bottom-0 transition-opacity duration-300", showChrome ? "opacity-100" : "opacity-0")}>
      <Controls {p} {compact} />
    </div>

    {#if p.fallbackReason && p.effective === "minimal" && p.preferred !== "minimal" && showChrome && p.height >= 200}
      <span class="pointer-events-none absolute top-10 left-3 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/70">{p.fallbackReason}</span>
    {/if}
  </div>

  {#if p.effective === "docked"}
    <div class="w-[clamp(240px,34%,380px)] shrink-0">
      <Panel {p} glass={false} {onOpenSettings} />
    </div>
  {/if}
</div>
