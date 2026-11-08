// Renderer state. Fed only by MediaSession events (ADR 0003 §5.3); commands go back through
// session.dispatch, never straight to the element.
import { stacking } from "../core/stacking/client";
import type { StackingReply } from "../core/bridge/messages";
import type { CapabilityMap } from "../core/contracts/capabilities";
import type { CaptionTrack, Chapter, LayoutMode, MediaState } from "../core/contracts/commands";
import type { MediaSession } from "../core/session/media-session";
import { saveSettings, type SettingsV1 } from "../core/settings/settings";

export type PanelTab = "chapters" | "captions" | "window";

// Size thresholds for the layout fallback (UX.md "Adaptive behavior").
export const DOCKED_MIN_WIDTH = 640;
export const PANEL_MIN_WIDTH = 340;
export const PANEL_MIN_HEIGHT = 220;

export class Player {
  media = $state<MediaState>({ paused: true, time: 0, duration: null, buffered: 0, rate: 1, volume: 1, muted: false, waiting: false, ended: false });
  caps = $state<CapabilityMap>({});
  chapters = $state<Chapter[]>([]);
  captions = $state<CaptionTrack[]>([]);
  lastError = $state<string | null>(null);

  preferred = $state<LayoutMode>("overlay");
  blur = $state(false);
  panelOpen = $state(true);
  tab = $state<PanelTab>("chapters");
  width = $state(0);
  height = $state(0);

  stack = $state<{ available: boolean; reason: string | null; above: boolean; followWorkspaces: boolean; backend: string | null; busy: boolean }>({
    available: false, reason: null, above: false, followWorkspaces: false, backend: null, busy: false,
  });

  effective = $derived<LayoutMode>(this.computeEffective());

  constructor(
    readonly session: MediaSession,
    readonly settings: SettingsV1,
    readonly token: string,
    readonly title: string,
  ) {
    this.preferred = settings.layout.preferred;
    this.blur = settings.layout.blur;
    session.subscribe((e) => {
      if (e.type === "state") this.media = e.state;
      else if (e.type === "capabilities") this.caps = e.caps;
      else if (e.type === "chapters") this.chapters = e.items;
      else if (e.type === "captions") this.captions = e.tracks;
      else if (e.type === "error") this.lastError = e.error.message;
    });
  }

  private computeEffective(): LayoutMode {
    const fitsPanel = this.width >= PANEL_MIN_WIDTH && this.height >= PANEL_MIN_HEIGHT;
    if (this.preferred === "minimal" || !fitsPanel) return "minimal";
    if (this.preferred === "docked" && this.width < DOCKED_MIN_WIDTH) return "overlay";
    return this.preferred;
  }

  /** Why the preferred layout is not the one shown, for a short hint in the UI. */
  get fallbackReason(): string | null {
    if (this.preferred === this.effective) return null;
    return this.effective === "minimal" ? "Window too small for the tools panel" : "Too narrow for side-by-side; showing as overlay";
  }

  setLayout(mode: LayoutMode) {
    this.preferred = mode;
    if (mode !== "minimal") this.panelOpen = true;
    this.persist();
  }

  toggleBlur() {
    this.blur = !this.blur;
    this.persist();
  }

  private persist() {
    this.settings.layout = { preferred: this.preferred, blur: this.blur };
    void saveSettings(this.settings);
  }

  togglePlay = () => this.session.dispatch({ type: this.media.paused ? "play" : "pause" });
  seekBy = (delta: number) => this.session.dispatch({ type: "seekBy", delta });
  seek = (to: number) => this.session.dispatch({ type: "seek", to });
  setVolume = (value: number) => this.session.dispatch({ type: "setVolume", value });
  toggleMute = () => this.session.dispatch({ type: "setMuted", value: !this.media.muted });
  setRate = (value: number) => this.session.dispatch({ type: "setRate", value });
  selectCaptions = (trackId: string | null) => this.session.dispatch({ type: "selectCaptions", trackId });

  async refreshStacking() {
    this.applyStacking(await stacking("getState", this.token));
  }

  async setStacking(which: "above" | "followWorkspaces", value: boolean) {
    this.stack.busy = true;
    const reply = await stacking(which === "above" ? "setAbove" : "setFollowWorkspaces", this.token, value);
    this.applyStacking(reply);
    if (reply.ok) {
      this.settings.stacking = { above: reply.state.above, followWorkspaces: reply.state.followWorkspaces };
      void saveSettings(this.settings);
    }
  }

  private applyStacking(reply: StackingReply) {
    this.stack.busy = false;
    if (reply.ok) {
      Object.assign(this.stack, { available: true, reason: null, backend: reply.backend, ...reply.state });
    } else {
      const reasons: Record<string, string> = {
        needsPermission: "Allow the pin helper in BetterPiP settings",
        needsHelper: "Install the optional pin helper to keep this window on top",
        unsupportedCompositor: "Your desktop is not supported by the pin helper yet",
        windowNotFound: "The pin helper could not find this window",
      };
      Object.assign(this.stack, { available: false, reason: reasons[reply.error] ?? "Pin control unavailable" });
    }
  }
}
