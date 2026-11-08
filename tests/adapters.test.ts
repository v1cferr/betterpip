// V1C-121 acceptance: the generic session works without an adapter, and a failing adapter
// cannot take the core down (ADR 0003 §5.5).
import { describe, expect, it, vi } from "vitest";
import { attachAdapter } from "../src/core/adapters/registry";
import type { AdapterContext, AdapterHandle, SiteAdapter } from "../src/core/adapters/types";
import { createScope } from "../src/core/contracts/dispose";

const ctx = (url = "https://example.org/watch"): AdapterContext => ({
  video: {} as HTMLVideoElement,
  url: new URL(url),
  scope: createScope(),
  log: vi.fn(),
});

const handle = (dispose = vi.fn()): AdapterHandle => ({ dispose, capabilities: () => ({}) });

describe("attachAdapter", () => {
  it("falls back to the generic session when no adapter matches", async () => {
    expect(await attachAdapter([], ctx())).toEqual({ kind: "generic" });
    const other: SiteAdapter = { id: "x", matches: () => false, attach: vi.fn() };
    expect(await attachAdapter([other], ctx())).toEqual({ kind: "generic" });
    expect(other.attach).not.toHaveBeenCalled();
  });

  it("attaches a matching adapter and disposes it with the session scope", async () => {
    const dispose = vi.fn();
    const a: SiteAdapter = { id: "ok", matches: () => true, attach: async () => handle(dispose) };
    const c = ctx();
    const r = await attachAdapter([a], c);
    expect(r.kind).toBe("adapter");
    c.scope.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("isolates an adapter that throws", async () => {
    const c = ctx();
    const a: SiteAdapter = { id: "boom", matches: () => true, attach: async () => { throw new Error("markup changed"); } };
    const r = await attachAdapter([a], c);
    expect(r).toMatchObject({ kind: "failed", id: "boom", error: { code: "ADAPTER_FAILED", cause: "markup changed" } });
    expect(c.log).toHaveBeenCalledOnce();
    expect(c.scope.disposed).toBe(false); // the session itself keeps running
  });

  it("isolates an adapter whose matches() throws", async () => {
    const a: SiteAdapter = { id: "m", matches: () => { throw new Error("bad url"); }, attach: vi.fn() };
    expect((await attachAdapter([a], ctx())).kind).toBe("failed");
  });

  it("times out a slow adapter and disposes its late handle", async () => {
    vi.useFakeTimers();
    const dispose = vi.fn();
    let resolve!: (h: AdapterHandle) => void;
    const a: SiteAdapter = { id: "slow", matches: () => true, attach: () => new Promise((r) => { resolve = r; }) };
    const c = ctx();
    const p = attachAdapter([a], c, 50);
    await vi.advanceTimersByTimeAsync(60);
    expect(await p).toMatchObject({ kind: "failed", error: { code: "ADAPTER_TIMEOUT" } });
    resolve(handle(dispose));
    await vi.runAllTimersAsync();
    expect(dispose).toHaveBeenCalledOnce();
    expect(c.scope.disposed).toBe(false);
    vi.useRealTimers();
  });
});

describe("youtube adapter matching", async () => {
  const { youtube, youtubeVideoId } = await import("../src/core/adapters/youtube");
  it("matches YouTube pages only", () => {
    for (const u of ["https://www.youtube.com/watch?v=abc", "https://youtube.com/", "https://m.youtube.com/watch?v=x"]) {
      expect(youtube.matches(new URL(u))).toBe(true);
    }
    for (const u of ["https://music.youtube.com/watch?v=x", "https://youtube.com.evil.example/watch?v=x", "https://example.org/watch?v=x"]) {
      expect(youtube.matches(new URL(u))).toBe(false);
    }
  });
  it("extracts the video id from watch and live URLs only", () => {
    expect(youtubeVideoId(new URL("https://www.youtube.com/watch?v=NVUTOpBm258&t=4"))).toBe("NVUTOpBm258");
    expect(youtubeVideoId(new URL("https://www.youtube.com/live/abcdefghijk?si=1"))).toBe("abcdefghijk");
    expect(youtubeVideoId(new URL("https://www.youtube.com/?themeRefresh=1"))).toBeNull();
    expect(youtubeVideoId(new URL("https://example.org/watch?v=x"))).toBeNull();
  });
});
