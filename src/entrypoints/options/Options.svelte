<!-- Settings page. The nativeMessaging permission can only be requested from a user gesture
     in an extension page, which is why the pin control sends the user here (ADR 0002). -->
<script lang="ts">
  import Pin from "@lucide/svelte/icons/pin";
  import Keyboard from "@lucide/svelte/icons/keyboard";
  import PictureInPicture from "@lucide/svelte/icons/picture-in-picture-2";
  import Button from "../../renderer/ui/Button.svelte";

  let granted = $state<boolean | null>(null);
  let helper = $state<string>("Not checked");

  $effect(() => {
    void browser.permissions.contains({ permissions: ["nativeMessaging"] }).then((v) => (granted = v));
  });

  async function grant() {
    granted = await browser.permissions.request({ permissions: ["nativeMessaging"] });
    if (granted) await check();
  }

  async function revoke() {
    await browser.permissions.remove({ permissions: ["nativeMessaging"] });
    granted = false;
    helper = "Not checked";
  }

  async function check() {
    try {
      const r = (await browser.runtime.sendNativeMessage("betterpip_pin", { op: "getState", token: "bp-settingscheck" })) as { ok: boolean; error?: string; backend?: string };
      helper = r.ok || r.error === "window-not-found" ? `Installed and reachable${r.backend ? ` (${r.backend})` : ""}` : `Installed, but: ${r.error}`;
    } catch (e) {
      helper = /No such native application/i.test(String(e)) ? "Not installed" : `Error: ${String((e as Error)?.message ?? e)}`;
    }
  }
</script>

<main class="mx-auto max-w-2xl space-y-6 px-6 py-10 text-foreground">
  <header class="flex items-center gap-3">
    <div class="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary"><PictureInPicture class="size-5" /></div>
    <div>
      <h1 class="text-xl font-semibold">BetterPiP</h1>
      <p class="text-sm text-muted-foreground">Preview build. Settings are stored only in this browser.</p>
    </div>
  </header>

  <section class="space-y-3 rounded-xl border border-border bg-white/[0.03] p-5">
    <h2 class="flex items-center gap-2 font-medium"><Keyboard class="size-4 text-muted-foreground" />How to open</h2>
    <p class="text-sm text-muted-foreground">
      On a page with a video, click the BetterPiP toolbar button or press <kbd class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">Alt+Shift+P</kbd>,
      then <strong class="text-foreground">Open in BetterPiP</strong> on the video. Change the shortcut in <span class="font-mono">about:addons</span> → ⚙ → Manage Extension Shortcuts.
    </p>
  </section>

  <section class="space-y-3 rounded-xl border border-border bg-white/[0.03] p-5">
    <h2 class="flex items-center gap-2 font-medium"><Pin class="size-4 text-muted-foreground" />Keep the window on top (optional)</h2>
    <p class="text-sm text-muted-foreground">
      Browsers cannot keep a window above others on Wayland. The pin buttons work through a small optional helper
      program that asks your desktop (Hyprland or sway) to float, pin or show the window on all workspaces.
    </p>
    <div class="flex flex-wrap items-center gap-2">
      {#if granted}
        <Button variant="outline" size="md" onclick={check}>Check helper</Button>
        <Button variant="ghost" size="md" onclick={revoke}>Revoke permission</Button>
      {:else}
        <Button variant="primary" size="md" onclick={grant}>Allow pin helper</Button>
      {/if}
      <span class="text-sm text-muted-foreground">Permission: {granted === null ? "…" : granted ? "allowed" : "not allowed"} · Helper: {helper}</span>
    </div>
    <p class="text-xs text-muted-foreground">Install it with <span class="font-mono">tools/install-pin-helper.sh</span> from the repository.</p>
  </section>
</main>
