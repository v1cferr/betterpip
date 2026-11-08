// YouTube adapter (V1C-123): chapters for the video that is playing, kept current across
// YouTube's in-page navigation. Metadata only: it never drives the player and draws no UI.
//
// Page data lives in the page's JS world. From the isolated content script, Firefox's
// `wrappedJSObject` reads it; only the few subtrees the parser needs are copied out as
// plain JSON, so no page object is kept or called. See docs/ADAPTERS.md for the sources
// and how fragile each one is.
import { supported, unavailable, type CapabilityMap } from "../contracts/capabilities";
import type { Chapter } from "../contracts/commands";
import { bpError } from "../contracts/errors";
import type { AdapterContext, AdapterHandle, SiteAdapter } from "./types";
import { chaptersFromDescription, chaptersFromResponse, responseVideoId } from "./youtube-parse";

const HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com"]);

/** The video id in a watch or live URL; null on any other YouTube page. */
export function youtubeVideoId(url: URL): string | null {
  if (!HOSTS.has(url.hostname)) return null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const live = /^\/live\/([\w-]{6,})/.exec(url.pathname);
  return live ? live[1]! : null;
}

type Waived = Record<string, unknown> | null | undefined;
const waive = (o: unknown): Waived => {
  if (!o) return null;
  const w = (o as { wrappedJSObject?: unknown }).wrappedJSObject;
  return (w ?? o) as Waived;
};

function copy(v: unknown): unknown {
  try {
    return v == null ? null : JSON.parse(JSON.stringify(v));
  } catch {
    return null;
  }
}

/** Copies out only what chaptersFromResponse/responseVideoId read, from a page object. */
function snapshot(resp: unknown): unknown {
  const r = waive(resp);
  if (!r) return null;
  try {
    const panels = Array.from((r.engagementPanels as ArrayLike<unknown>) ?? []).filter((p) => {
      const id = (waive(waive(p)?.engagementPanelSectionListRenderer)?.panelIdentifier);
      return typeof id === "string" && id.includes("macro-markers");
    });
    return {
      currentVideoEndpoint: copy(r.currentVideoEndpoint),
      playerOverlays: copy(r.playerOverlays),
      engagementPanels: panels.map(copy),
    };
  } catch {
    return null;
  }
}

/** The page's current watch-next response for `videoId`, newest source first. */
function currentResponse(videoId: string, fromEvent?: unknown): unknown {
  const candidates: Array<() => unknown> = [
    () => fromEvent,
    () => waive(document.querySelector("ytd-watch-flexy"))?.data,
    () => waive(window)?.ytInitialData,
  ];
  for (const get of candidates) {
    let snap: unknown = null;
    try {
      snap = snapshot(get());
    } catch {
      continue;
    }
    if (snap && responseVideoId(snap) === videoId) return snap;
  }
  return null;
}

function descriptionText(): string {
  const el = document.querySelector("ytd-watch-metadata #description-inline-expander, #description-inline-expander");
  return el?.textContent ?? "";
}

export function readChapters(videoId: string, duration: number | null, fromEvent?: unknown): Chapter[] {
  const resp = currentResponse(videoId, fromEvent);
  if (!resp) return [];
  const chapters = chaptersFromResponse(resp);
  return chapters.length ? chapters : chaptersFromDescription(descriptionText(), duration);
}

export const youtube: SiteAdapter = {
  id: "youtube",
  matches: (url) => HOSTS.has(url.hostname),
  async attach(ctx: AdapterContext): Promise<AdapterHandle> {
    const listeners = new Set<(items: Chapter[]) => void>();
    let videoId = youtubeVideoId(new URL(location.href));
    let chapters: Chapter[] = [];
    const duration = () => (Number.isFinite(ctx.video.duration) ? ctx.video.duration : null);

    const refresh = (fromEvent?: unknown) => {
      try {
        videoId = youtubeVideoId(new URL(location.href));
        const next = videoId ? readChapters(videoId, duration(), fromEvent) : [];
        if (JSON.stringify(next) === JSON.stringify(chapters)) return;
        chapters = next;
        for (const fn of listeners) fn(chapters);
      } catch (e) {
        ctx.log(bpError("ADAPTER_FAILED", "YouTube chapters could not be read", true, e));
      }
    };

    const opts = { signal: ctx.scope.signal };
    // In-page navigation: the event carries the new response; the page data follows shortly.
    document.addEventListener("yt-navigate-finish", (e) => {
      let resp: unknown;
      try {
        resp = waive(waive(waive(e)?.detail)?.response)?.response;
      } catch {
        resp = undefined;
      }
      refresh(resp);
    }, opts);
    document.addEventListener("yt-page-data-updated", () => refresh(), opts);
    // Data can arrive after the element is ready (slow load); one late re-read covers it.
    ctx.video.addEventListener("loadedmetadata", () => refresh(), opts);

    refresh();

    return {
      capabilities: (): CapabilityMap => ({
        chapters: chapters.length ? supported("adapter:youtube") : unavailable("notExposed"),
      }),
      chapters: async () => chapters,
      onChaptersChanged(fn) {
        listeners.add(fn);
      },
      dispose() {
        listeners.clear();
      },
    };
  },
};
