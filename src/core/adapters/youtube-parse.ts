// Pure parsers for YouTube chapter data (V1C-123). They take plain JSON copied out of the
// page and never throw: unknown or malformed shapes give an empty list, so a YouTube markup
// change degrades to "no chapters", not to a broken player.
//
// Sources, in order (observed 2026-11-08, see docs/ADAPTERS.md):
//   1. playerOverlays…multiMarkersPlayerBarRenderer.markersMap, key DESCRIPTION_CHAPTERS or
//      AUTO_CHAPTERS: the chapters YouTube draws on its own seek bar.
//   2. engagementPanels → macroMarkersListRenderer: the "In this video" panel.
//   3. Timestamps typed in the description, with YouTube's own rules (first at 0:00, ascending).
import type { Chapter } from "../contracts/commands";

type Json = unknown;

const obj = (v: Json): Record<string, Json> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Json>) : null);
const arr = (v: Json): Json[] => (Array.isArray(v) ? v : []);
const at = (v: Json, ...path: string[]): Json => path.reduce<Json>((o, k) => obj(o)?.[k], v);

/** `{simpleText}` or `{runs: [{text}]}`, YouTube's two text shapes. */
export function ytText(v: Json): string | null {
  const o = obj(v);
  if (!o) return null;
  if (typeof o.simpleText === "string") return o.simpleText.trim() || null;
  const runs = arr(o.runs).map((r) => at(r, "text")).filter((t): t is string => typeof t === "string");
  return runs.length ? runs.join("").trim() || null : null;
}

/** Sorted, de-duplicated, finite, non-negative, with a title. */
export function normalizeChapters(items: Chapter[]): Chapter[] {
  const seen = new Set<number>();
  return items
    .filter((c) => Number.isFinite(c.start) && c.start >= 0 && c.title.length > 0)
    .sort((a, b) => a.start - b.start)
    .filter((c) => (seen.has(c.start) ? false : (seen.add(c.start), true)));
}

const MARKER_KEYS = ["DESCRIPTION_CHAPTERS", "AUTO_CHAPTERS"];

export function chaptersFromMarkersMap(markersMap: Json): Chapter[] {
  const entries = arr(markersMap);
  for (const key of MARKER_KEYS) {
    const entry = entries.find((e) => at(e, "key") === key);
    if (!entry) continue;
    const out: Chapter[] = [];
    for (const c of arr(at(entry, "value", "chapters"))) {
      const r = at(c, "chapterRenderer");
      const ms = at(r, "timeRangeStartMillis");
      const title = ytText(at(r, "title"));
      if (typeof ms === "number" && title) out.push({ start: ms / 1000, title });
    }
    const norm = normalizeChapters(out);
    if (norm.length) return norm;
  }
  return [];
}

export function chaptersFromEngagementPanels(panels: Json): Chapter[] {
  for (const p of arr(panels)) {
    const r = at(p, "engagementPanelSectionListRenderer");
    const id = at(r, "panelIdentifier");
    if (typeof id !== "string" || !id.includes("macro-markers")) continue;
    const out: Chapter[] = [];
    for (const item of arr(at(r, "content", "macroMarkersListRenderer", "contents"))) {
      const m = at(item, "macroMarkersListItemRenderer");
      const title = ytText(at(m, "title"));
      const secs = at(m, "onTap", "watchEndpoint", "startTimeSeconds");
      const start = typeof secs === "number" ? secs : parseTimestamp(ytText(at(m, "timeDescription")) ?? "");
      if (title && start !== null) out.push({ start, title });
    }
    const norm = normalizeChapters(out);
    if (norm.length) return norm;
  }
  return [];
}

/** Chapters from a watch-next response (`ytInitialData` or a navigation's `response`). */
export function chaptersFromResponse(response: Json): Chapter[] {
  const markers = at(response, "playerOverlays", "playerOverlayRenderer", "decoratedPlayerBarRenderer",
    "decoratedPlayerBarRenderer", "playerBar", "multiMarkersPlayerBarRenderer", "markersMap");
  const fromBar = chaptersFromMarkersMap(markers);
  return fromBar.length ? fromBar : chaptersFromEngagementPanels(at(response, "engagementPanels"));
}

/** The video a watch-next response belongs to, so stale data is never shown. */
export function responseVideoId(response: Json): string | null {
  const id = at(response, "currentVideoEndpoint", "watchEndpoint", "videoId");
  return typeof id === "string" ? id : null;
}

/** "1:02:03" / "12:34" / "0:05" → seconds; anything else → null. */
export function parseTimestamp(s: string): number | null {
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [h, mm, ss] = [Number(m[1] ?? 0), Number(m[2]), Number(m[3])];
  if (ss > 59 || (m[1] !== undefined && mm > 59)) return null;
  return h * 3600 + mm * 60 + ss;
}

/**
 * Description timestamps, accepted only under YouTube's own chapter rules: at least three,
 * the first at 0:00, strictly ascending, and inside the duration when it is known.
 */
export function chaptersFromDescription(text: string, duration: number | null): Chapter[] {
  const out: Chapter[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:[-–•*]\s*)?\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–:|]?\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const start = parseTimestamp(m[1]!);
    if (start !== null && m[2]) out.push({ start, title: m[2] });
  }
  if (out.length < 3 || out[0]!.start !== 0) return [];
  for (let i = 1; i < out.length; i++) if (out[i]!.start <= out[i - 1]!.start) return [];
  if (duration !== null && out[out.length - 1]!.start >= duration) return [];
  return out;
}

/** The chapter playing at `time`, or -1 before the first one. */
export function chapterIndexAt(chapters: readonly Chapter[], time: number): number {
  let idx = -1;
  for (let i = 0; i < chapters.length && chapters[i]!.start <= time; i++) idx = i;
  return idx;
}
