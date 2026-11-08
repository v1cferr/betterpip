<!-- V1C-121 spike: exercises the Svelte 5 features the PiP renderer would rely on. -->
<script>
  import { fade } from "svelte/transition";
  import { onDestroy } from "svelte";

  let { video, report } = $props();
  let clicks = $state(0);
  let text = $state("");
  let open = $state(true);
  let time = $state(0);
  const items = Array.from({ length: 5 }, (_, i) => ({ id: i, label: `Chapter ${i + 1}` }));

  // Media events bridged into runes: the session core would feed the renderer like this.
  const onTime = () => (time = video.currentTime);
  video.addEventListener("timeupdate", onTime);
  onDestroy(() => {
    video.removeEventListener("timeupdate", onTime);
    report("destroyed", { ok: true });
  });

  $effect(() => report("effect", { clicks, text, open }));
</script>

<section class="panel" aria-label="Spike tools">
  <button id="sv-count" type="button" onclick={(e) => { clicks += 1; report("click", { clicks, isTrusted: e.isTrusted }); }}>
    Clicked {clicks}
  </button>
  <input id="sv-input" bind:value={text} aria-label="Text" />
  <output id="sv-echo">{text}</output>
  <output id="sv-time">{time.toFixed(1)}</output>
  <button id="sv-toggle" type="button" onclick={() => { open = !open; report("toggle", { at: performance.now(), open, hidden: document.hidden }); }}>Toggle</button>
  {#if open}
    <p id="sv-fading" transition:fade={{ duration: 300 }}
       onintroend={() => report("introend", { at: performance.now() })}
       onoutroend={() => report("outroend", { at: performance.now() })}>Fading block</p>
  {/if}
  <ol>
    {#each items as item (item.id)}
      <li><button type="button" data-chapter={item.id}>{item.label}</button></li>
    {/each}
  </ol>
</section>

<style>
  .panel { color: rgb(1, 2, 3); font: 14px system-ui; }
  button:focus-visible { outline: 2px solid rgb(4, 5, 6); }
</style>
