// Command and event contracts (ADR 0003 §5.3). Commands flow into the session; events
// flow out and are the renderer's only input.
import type { CapabilityMap } from "./capabilities";
import type { BpError } from "./errors";

export type LayoutMode = "minimal" | "overlay" | "docked";

export type Command =
  | { type: "play" }
  | { type: "pause" }
  | { type: "seek"; to: number }
  | { type: "seekBy"; delta: number }
  | { type: "setVolume"; value: number }
  | { type: "setMuted"; value: boolean }
  | { type: "setRate"; value: number }
  | { type: "selectCaptions"; trackId: string | null };

export interface Chapter {
  start: number;
  title: string;
}

export interface CaptionTrack {
  id: string;
  label: string;
  language: string;
  active: boolean;
}

export interface MediaState {
  paused: boolean;
  time: number;
  duration: number | null;
  buffered: number;
  rate: number;
  volume: number;
  muted: boolean;
  waiting: boolean;
  ended: boolean;
}

export type MediaEvent =
  | { type: "state"; state: MediaState }
  | { type: "capabilities"; caps: CapabilityMap }
  | { type: "chapters"; items: Chapter[] }
  | { type: "captions"; tracks: CaptionTrack[] }
  | { type: "error"; error: BpError };

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
