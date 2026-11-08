// Player content script, isolated world (ADR 0003 §3). Injected on demand by the background
// (activeTab), never declared for every site. Finds the video, offers a button next to it,
// and on that click (a page gesture) opens Document PiP with the Svelte renderer.
import { attachAdapter } from "../core/adapters/registry";
import { ADAPTERS } from "../core/adapters";
import { createScope, type Scope } from "../core/contracts/dispose";
import { findBestVideo } from "../core/discovery/find-video";
import { MediaSession } from "../core/session/media-session";
import { loadSettings, saveSettings } from "../core/settings/settings";
import { documentPipAvailable, openDocumentPip } from "../core/window/document-pip";
import { mountRenderer } from "../renderer/mount";
import { showAffordance, showToast } from "../page-ui/affordance";

export default defineContentScript({
  registration: "runtime",
  main() {
    const flag = "__betterpipLoaded";
    const w = window as unknown as Record<string, unknown>;
    if (w[flag]) return;
    w[flag] = true;

    let active: Scope | null = null;
    // Preloaded so that opening does not wait on storage after the click.
    const settingsP = loadSettings();

    browser.runtime.onMessage.addListener((msg: unknown) => {
      if ((msg as { type?: string })?.type === "activate") offer();
      return undefined;
    });
    offer();

    function offer() {
      if (active) return; // a PiP window is already open for this tab
      if (!documentPipAvailable()) {
        showToast("BetterPiP needs Firefox 154+ with Document Picture-in-Picture, in the top-level page.");
        return;
      }
      const video = findBestVideo();
      if (!video) {
        showToast("No video found on this page.");
        return;
      }
      // The toolbar/shortcut gesture may already count as page activation (V1C-120 M8):
      // if so open straight away, otherwise ask for one click on the video's button.
      if ((navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive) void open(video);
      else showAffordance(video, () => void open(video));
    }

    async function open(video: HTMLVideoElement) {
      if (active) return;
      const scope = createScope();
      active = scope;
      scope.defer(() => (active = null));
      // requestWindow needs the click's transient activation; the only wait before it is the
      // already-resolved settings promise.
      const settings = await settingsP;
      const opened = await openDocumentPip(video, scope, settings.pipSize, () => {});
      if (!opened.ok) {
        scope.dispose();
        showToast(opened.error.message);
        return;
      }
      const { window: pip, stage, token } = opened.pip;
      const session = new MediaSession(video, scope);
      const title = document.title.replace(/^\(\d+\)\s*/, "") || location.hostname;
      mountRenderer({ pip, stage, session, settings, token, title, scope, onClose: () => pip.close() });

      // Remember the size the user left the window at.
      pip.addEventListener("pagehide", () => {
        settings.pipSize = { width: pip.innerWidth, height: pip.innerHeight };
        void saveSettings(settings);
      }, { once: true });

      const adapter = await attachAdapter(ADAPTERS, { video, url: new URL(location.href), scope, log: (e) => console.debug("BetterPiP adapter:", e) });
      if (adapter.kind === "adapter") session.setAdapterCapabilities(adapter.handle.capabilities());
    }
  },
});
