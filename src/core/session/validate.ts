// Command validation (ADR 0003 §5.3/§6): commands are checked before they touch the element.
import { PLAYBACK_RATES, type Command } from "../contracts/commands";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateCommand(input: unknown): Command | null {
  if (!input || typeof input !== "object") return null;
  const c = input as Record<string, unknown>;
  switch (c.type) {
    case "play":
    case "pause":
      return { type: c.type };
    case "seek":
      return isNum(c.to) && c.to >= 0 ? { type: "seek", to: c.to } : null;
    case "seekBy":
      return isNum(c.delta) && Math.abs(c.delta) <= 24 * 3600 ? { type: "seekBy", delta: c.delta } : null;
    case "setVolume":
      return isNum(c.value) ? { type: "setVolume", value: Math.min(1, Math.max(0, c.value)) } : null;
    case "setMuted":
      return typeof c.value === "boolean" ? { type: "setMuted", value: c.value } : null;
    case "setRate":
      return isNum(c.value) && (PLAYBACK_RATES as readonly number[]).includes(c.value) ? { type: "setRate", value: c.value } : null;
    case "selectCaptions":
      return c.trackId === null || (typeof c.trackId === "string" && c.trackId.length <= 64)
        ? { type: "selectCaptions", trackId: c.trackId as string | null }
        : null;
    default:
      return null;
  }
}
