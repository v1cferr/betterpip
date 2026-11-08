// V1C-123: YouTube chapter parsing. Fixtures are hand-trimmed shapes, never real page dumps.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chapterIndexAt, chaptersFromDescription, chaptersFromResponse, parseTimestamp, responseVideoId,
} from "../src/core/adapters/youtube-parse";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/youtube/${name}.json`, import.meta.url), "utf8"));

describe("chaptersFromResponse", () => {
  it("reads description chapters from the seek-bar markers", () => {
    expect(chaptersFromResponse(fixture("with-chapters"))).toEqual([
      { start: 0, title: "Intro" },
      { start: 85, title: "First topic" },
      { start: 637, title: "Second topic" },
    ]);
  });

  it("falls back to auto chapters and ignores other marker kinds", () => {
    expect(chaptersFromResponse(fixture("auto-chapters"))).toEqual([
      { start: 0, title: "Opening" },
      { start: 120.5, title: "Demo" },
    ]);
  });

  it("uses the 'In this video' panel when the seek-bar markers are missing", () => {
    expect(chaptersFromResponse(fixture("panel-only"))).toEqual([
      { start: 0, title: "Start" },
      { start: 637, title: "Middle" },
    ]);
  });

  it("returns nothing for a video without chapters", () => {
    expect(chaptersFromResponse(fixture("no-chapters"))).toEqual([]);
  });

  it("drops malformed entries instead of throwing", () => {
    expect(chaptersFromResponse(fixture("malformed"))).toEqual([]);
    for (const junk of [null, undefined, 0, "x", [], { playerOverlays: [] }, { engagementPanels: [null, 1] }]) {
      expect(chaptersFromResponse(junk)).toEqual([]);
    }
  });

  it("identifies the video a response belongs to", () => {
    expect(responseVideoId(fixture("with-chapters"))).toBe("AAAAAAAAAAA");
    expect(responseVideoId(fixture("malformed"))).toBeNull();
    expect(responseVideoId(null)).toBeNull();
  });
});

describe("description timestamps", () => {
  it("parses timestamps", () => {
    expect(parseTimestamp("0:00")).toBe(0);
    expect(parseTimestamp("10:37")).toBe(637);
    expect(parseTimestamp("1:02:18")).toBe(3738);
    for (const bad of ["", "1:2", "1:60", "1:61:00", "abc", "12"]) expect(parseTimestamp(bad)).toBeNull();
  });

  it("follows YouTube's chapter rules", () => {
    const text = "Links below\n0:00 Intro\n1:25 - OpenAI Git\n(10:37) Node fixes\nthanks!";
    expect(chaptersFromDescription(text, 3600)).toEqual([
      { start: 0, title: "Intro" },
      { start: 85, title: "OpenAI Git" },
      { start: 637, title: "Node fixes" },
    ]);
    expect(chaptersFromDescription("0:05 a\n1:00 b\n2:00 c", null)).toEqual([]); // must start at 0:00
    expect(chaptersFromDescription("0:00 a\n2:00 b\n1:00 c", null)).toEqual([]); // ascending
    expect(chaptersFromDescription("0:00 a\n1:00 b", null)).toEqual([]); // at least three
    expect(chaptersFromDescription("0:00 a\n1:00 b\n9:00 c", 300)).toEqual([]); // inside duration
  });
});

describe("chapterIndexAt", () => {
  const ch = [{ start: 0, title: "a" }, { start: 10, title: "b" }, { start: 20, title: "c" }];
  it("finds the chapter playing", () => {
    expect(chapterIndexAt(ch, 0)).toBe(0);
    expect(chapterIndexAt(ch, 15)).toBe(1);
    expect(chapterIndexAt(ch, 99)).toBe(2);
    expect(chapterIndexAt([{ start: 5, title: "x" }], 1)).toBe(-1);
    expect(chapterIndexAt([], 1)).toBe(-1);
  });
});
