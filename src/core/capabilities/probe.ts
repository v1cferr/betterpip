// Generic capability probe (ADR 0003 §5.2): derived from the media element alone, so the
// player works on any site without an adapter.
import { supported, unavailable, type CapabilityMap } from "../contracts/capabilities";

/** The subset of HTMLMediaElement the probe reads; plain objects work in unit tests. */
export interface MediaLike {
  duration: number;
  seekable: { length: number };
  mediaKeys?: unknown;
  textTracks?: { length: number; [index: number]: { kind: string } | undefined };
}

export function probeGeneric(media: MediaLike): CapabilityMap {
  const finite = Number.isFinite(media.duration) && media.duration > 0;
  const live = media.duration === Infinity;
  const tracks = media.textTracks ? Array.from({ length: media.textTracks.length }, (_, i) => media.textTracks![i]) : [];
  const caps: CapabilityMap = {
    play: supported("generic"),
    volume: supported("generic"),
    mute: supported("generic"),
    rate: live ? unavailable("live") : supported("generic"),
    duration: finite ? supported("generic", media.duration) : unavailable(live ? "live" : "notExposed"),
    live: live ? supported("generic", true) : unavailable("notExposed"),
    seek: media.seekable.length > 0 && !live ? supported("generic") : unavailable(live ? "live" : "notExposed"),
    chapters: tracks.some((t) => t?.kind === "chapters") ? supported("generic") : unavailable("notExposed"),
    captions: tracks.some((t) => t?.kind === "subtitles" || t?.kind === "captions") ? supported("generic") : unavailable("notExposed"),
  };
  return caps;
}

/**
 * Merges adapter claims over the generic probe. An adapter may add or upgrade metadata
 * capabilities (chapters, captions), but it cannot turn on a playback capability that the
 * element itself refuses (ADR 0003 §5.2).
 */
export function mergeCapabilities(generic: CapabilityMap, adapter: CapabilityMap): CapabilityMap {
  const out: CapabilityMap = { ...generic };
  const metadataOnly = new Set(["chapters", "captions"]);
  for (const [id, cap] of Object.entries(adapter) as [keyof CapabilityMap, CapabilityMap[keyof CapabilityMap]][]) {
    if (!cap) continue;
    if (metadataOnly.has(id) || generic[id]?.status === "supported" || cap.status === "unavailable") out[id] = cap;
  }
  return out;
}
