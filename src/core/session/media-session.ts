// Media session (ADR 0003 §5.3): turns validated commands into element operations and
// element events into typed MediaEvents. Event-driven; nothing polls.
import { mergeCapabilities, probeGeneric } from "../capabilities/probe";
import type { CapabilityMap } from "../contracts/capabilities";
import type { CaptionTrack, Chapter, Command, MediaEvent, MediaState } from "../contracts/commands";
import type { Scope } from "../contracts/dispose";
import { bpError } from "../contracts/errors";
import { validateCommand } from "./validate";

const MEDIA_EVENTS = [
  "play", "pause", "playing", "waiting", "seeked", "seeking", "timeupdate", "durationchange",
  "ratechange", "volumechange", "progress", "ended", "loadedmetadata", "emptied",
] as const;

export class MediaSession {
  private listeners = new Set<(e: MediaEvent) => void>();
  private waiting = false;
  private adapterCaps: CapabilityMap = {};
  private adapterChapters: Chapter[] | null = null;

  constructor(readonly video: HTMLVideoElement, private readonly scope: Scope) {
    const opts = { signal: scope.signal };
    for (const ev of MEDIA_EVENTS) {
      video.addEventListener(ev, () => {
        if (ev === "waiting") this.waiting = true;
        if (ev === "playing" || ev === "seeked" || ev === "pause") this.waiting = false;
        this.emit({ type: "state", state: this.state() });
        if (ev === "durationchange" || ev === "loadedmetadata" || ev === "emptied") this.emitCapabilities();
      }, opts);
    }
    const tracks = video.textTracks;
    tracks.addEventListener("addtrack", () => this.emitTracks(), opts);
    tracks.addEventListener("change", () => this.emitTracks(), opts);
  }

  subscribe(fn: (e: MediaEvent) => void): () => void {
    this.listeners.add(fn);
    fn({ type: "state", state: this.state() });
    fn({ type: "capabilities", caps: this.capabilities() });
    fn({ type: "captions", tracks: this.captionTracks() });
    void this.chapters().then((items) => fn({ type: "chapters", items }));
    return () => this.listeners.delete(fn);
  }

  setAdapterCapabilities(caps: CapabilityMap) {
    this.adapterCaps = caps;
    this.emitCapabilities();
  }

  /** Chapters from a site adapter; they replace the generic track-based ones. */
  setAdapterChapters(items: Chapter[]) {
    this.adapterChapters = items;
    this.emit({ type: "chapters", items });
  }

  capabilities(): CapabilityMap {
    return mergeCapabilities(probeGeneric(this.video), this.adapterCaps);
  }

  state(): MediaState {
    const v = this.video;
    const end = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
    return {
      paused: v.paused,
      time: v.currentTime,
      duration: Number.isFinite(v.duration) ? v.duration : null,
      buffered: end,
      rate: v.playbackRate,
      volume: v.volume,
      muted: v.muted,
      waiting: this.waiting,
      ended: v.ended,
    };
  }

  dispatch(input: unknown) {
    const cmd = validateCommand(input);
    if (!cmd) {
      this.emit({ type: "error", error: bpError("INVALID_MESSAGE", "Rejected an invalid command") });
      return;
    }
    this.apply(cmd);
  }

  private apply(cmd: Command) {
    const v = this.video;
    const clamp = (t: number) => Math.max(0, Number.isFinite(v.duration) ? Math.min(t, v.duration) : t);
    switch (cmd.type) {
      case "play":
        v.play().catch((e) => this.emit({ type: "error", error: bpError("ACTIVATION_REQUIRED", "Playback was refused", true, e) }));
        break;
      case "pause": v.pause(); break;
      case "seek": v.currentTime = clamp(cmd.to); break;
      case "seekBy": v.currentTime = clamp(v.currentTime + cmd.delta); break;
      case "setVolume":
        v.volume = cmd.value;
        if (cmd.value > 0 && v.muted) v.muted = false;
        break;
      case "setMuted": v.muted = cmd.value; break;
      case "setRate": v.playbackRate = cmd.value; break;
      case "selectCaptions":
        for (const t of this.textTracks()) {
          if (t.kind === "subtitles" || t.kind === "captions") t.mode = this.trackId(t) === cmd.trackId ? "showing" : "disabled";
        }
        break;
    }
  }

  private textTracks(): TextTrack[] {
    return Array.from({ length: this.video.textTracks.length }, (_, i) => this.video.textTracks[i]!);
  }

  private trackId(t: TextTrack) {
    return t.id || `${t.kind}:${t.language}:${t.label}`;
  }

  captionTracks(): CaptionTrack[] {
    return this.textTracks()
      .filter((t) => t.kind === "subtitles" || t.kind === "captions")
      .map((t) => ({ id: this.trackId(t), label: t.label || t.language || "Untitled", language: t.language, active: t.mode === "showing" }));
  }

  /** Generic chapters: a <track kind="chapters"> on the element, when the site provides one. */
  async chapters(): Promise<Chapter[]> {
    if (this.adapterChapters) return this.adapterChapters;
    const track = this.textTracks().find((t) => t.kind === "chapters");
    if (!track) return [];
    if (track.mode === "disabled") track.mode = "hidden";
    for (let i = 0; i < 20 && !track.cues?.length; i++) await new Promise((r) => setTimeout(r, 100));
    return Array.from(track.cues ?? [], (c) => ({ start: c.startTime, title: (c as VTTCue).text ?? "" }));
  }

  private emitCapabilities() {
    this.emit({ type: "capabilities", caps: this.capabilities() });
  }

  private emitTracks() {
    this.emit({ type: "captions", tracks: this.captionTracks() });
  }

  private emit(e: MediaEvent) {
    if (this.scope.disposed) return;
    for (const fn of this.listeners) fn(e);
  }
}
