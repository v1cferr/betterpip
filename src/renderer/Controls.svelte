<!-- Bottom control bar, drawn over the video. Only supported capabilities get controls. -->
<script lang="ts">
  import Play from "@lucide/svelte/icons/play";
  import Pause from "@lucide/svelte/icons/pause";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import RotateCw from "@lucide/svelte/icons/rotate-cw";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import Volume1 from "@lucide/svelte/icons/volume-1";
  import VolumeX from "@lucide/svelte/icons/volume-x";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import PanelRightClose from "@lucide/svelte/icons/panel-right-close";
  import { PLAYBACK_RATES } from "../core/contracts/commands";
  import { isSupported } from "../core/contracts/capabilities";
  import Button from "./ui/Button.svelte";
  import { formatTime } from "./format";
  import { chapterIndexAt } from "../core/adapters/youtube-parse";
  import type { Player } from "./player.svelte";

  let { p, compact }: { p: Player; compact: boolean } = $props();

  const canSeek = $derived(isSupported(p.caps.seek));
  const duration = $derived(p.media.duration ?? 0);
  const fill = $derived(duration ? (p.media.time / duration) * 100 : 0);
  const buffer = $derived(duration ? (p.media.buffered / duration) * 100 : 0);
  const volPct = $derived(p.media.muted ? 0 : p.media.volume * 100);
  const chapterIdx = $derived(chapterIndexAt(p.chapters, p.media.time));
  const chapter = $derived(chapterIdx >= 0 ? p.chapters[chapterIdx] : undefined);
  // Gaps in the seek bar where chapters start, like the site's own player.
  const marks = $derived(duration ? p.chapters.filter((c) => c.start > 0 && c.start < duration).map((c) => (c.start / duration) * 100) : []);

  function showChapters() {
    p.tab = "chapters";
    if (p.preferred === "minimal") p.setLayout("overlay");
    p.panelOpen = true;
  }

  function nextRate() {
    const i = PLAYBACK_RATES.indexOf(p.media.rate as (typeof PLAYBACK_RATES)[number]);
    p.setRate(PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length] ?? 1);
  }
</script>

<div class="pointer-events-auto flex flex-col gap-1 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pt-8 pb-2">
  {#if canSeek}
    <div class="relative">
    <input
      class="bp-range w-full"
      type="range"
      min="0"
      max={duration || 0}
      step="0.1"
      value={p.media.time}
      style:--fill="{fill}%"
      style:--buffer="{buffer}%"
      aria-label="Seek"
      aria-valuetext="{formatTime(p.media.time)} of {formatTime(p.media.duration)}"
      oninput={(e) => p.seek(Number(e.currentTarget.value))}
    />
    {#each marks as left, i (i)}
      <span class="pointer-events-none absolute top-1/2 h-1 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-black/70" style:left="{left}%"></span>
    {/each}
    </div>
  {/if}

  <div class="flex items-center gap-0.5">
    <Button size="icon-lg" onclick={p.togglePlay} aria-label={p.media.paused ? "Play (k)" : "Pause (k)"} title={p.media.paused ? "Play (k)" : "Pause (k)"}>
      {#if p.media.paused}<Play class="fill-current" />{:else}<Pause class="fill-current" />{/if}
    </Button>
    {#if canSeek && !compact}
      <Button onclick={() => p.seekBy(-10)} aria-label="Back 10 seconds (j)" title="Back 10 s (j)"><RotateCcw /></Button>
      <Button onclick={() => p.seekBy(10)} aria-label="Forward 10 seconds (l)" title="Forward 10 s (l)"><RotateCw /></Button>
    {/if}

    <div class="group/vol flex items-center">
      <Button onclick={p.toggleMute} aria-label={p.media.muted ? "Unmute (m)" : "Mute (m)"} title={p.media.muted ? "Unmute (m)" : "Mute (m)"}>
        {#if p.media.muted || p.media.volume === 0}<VolumeX />{:else if p.media.volume < 0.5}<Volume1 />{:else}<Volume2 />{/if}
      </Button>
      {#if !compact}
        <input
          class="bp-range w-0 opacity-0 transition-all duration-200 group-hover/vol:w-20 group-hover/vol:opacity-100 focus-visible:w-20 focus-visible:opacity-100"
          type="range" min="0" max="1" step="0.05"
          value={p.media.muted ? 0 : p.media.volume}
          style:--fill="{volPct}%"
          aria-label="Volume"
          oninput={(e) => p.setVolume(Number(e.currentTarget.value))}
        />
      {/if}
    </div>

    <span class="ml-1 font-mono text-xs tabular-nums text-white/85">
      {formatTime(p.media.time)}{#if p.media.duration !== null}<span class="text-white/50">&nbsp;/ {formatTime(p.media.duration)}</span>{:else if isSupported(p.caps.live)}<span class="ml-1.5 rounded bg-red-600 px-1 py-px text-[10px] font-semibold tracking-wide text-white">LIVE</span>{/if}
    </span>
    {#if chapter && !compact}
      <button type="button" onclick={showChapters} title="Chapters (t)" aria-label="Chapter: {chapter.title}. Show chapters"
        class="ml-1 min-w-0 truncate rounded px-1 py-0.5 text-left text-xs text-white/85 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <span class="text-white/45">·</span> {chapter.title}
      </button>
    {/if}

    <div class="ml-auto flex items-center gap-0.5">
      {#if isSupported(p.caps.rate)}
        <Button size="sm" class="font-mono tabular-nums" onclick={nextRate} aria-label="Playback speed {p.media.rate}x" title="Playback speed">
          {p.media.rate}×
        </Button>
      {/if}
      {#if p.effective === "overlay"}
        <Button onclick={() => (p.panelOpen = !p.panelOpen)} pressed={p.panelOpen} aria-pressed={p.panelOpen} aria-label="Tools panel (t)" title="Tools panel (t)">
          {#if p.panelOpen}<PanelRightClose />{:else}<PanelRight />{/if}
        </Button>
      {/if}
    </div>
  </div>
</div>
