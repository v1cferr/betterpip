import { describe, expect, it, vi } from "vitest";
import { parseToBackground } from "../src/core/bridge/messages";
import { mergeCapabilities, probeGeneric } from "../src/core/capabilities/probe";
import { supported, unavailable } from "../src/core/contracts/capabilities";
import { createScope } from "../src/core/contracts/dispose";
import { validateCommand } from "../src/core/session/validate";
import { DEFAULT_SETTINGS, migrate } from "../src/core/settings/settings";

describe("scope disposal", () => {
  it("aborts the signal, runs deferred cleanups in reverse once, and cascades to children", () => {
    const order: string[] = [];
    const root = createScope();
    const child = root.child();
    root.defer(() => order.push("a"));
    root.defer(() => order.push("b"));
    child.defer(() => order.push("child"));
    root.defer(() => { throw new Error("ignored"); });
    root.dispose();
    root.dispose();
    expect(root.signal.aborted).toBe(true);
    expect(child.disposed).toBe(true);
    expect(order).toEqual(["b", "a", "child"]);
  });

  it("removes listeners registered with the scope signal", () => {
    const target = new EventTarget();
    const fn = vi.fn();
    const s = createScope();
    target.addEventListener("x", fn, { signal: s.signal });
    s.dispose();
    target.dispatchEvent(new Event("x"));
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("capabilities", () => {
  it("probes a VOD element", () => {
    const caps = probeGeneric({ duration: 120, seekable: { length: 1 } });
    expect(caps.seek?.status).toBe("supported");
    expect(caps.duration).toEqual({ status: "supported", value: 120, source: "generic" });
    expect(caps.live?.status).toBe("unavailable");
    expect(caps.chapters).toEqual({ status: "unavailable", reason: "notExposed" });
  });

  it("probes a live stream", () => {
    const caps = probeGeneric({ duration: Infinity, seekable: { length: 1 } });
    expect(caps.seek).toEqual({ status: "unavailable", reason: "live" });
    expect(caps.rate).toEqual({ status: "unavailable", reason: "live" });
    expect(caps.live?.status).toBe("supported");
  });

  it("lets adapters add metadata but not playback the element refuses", () => {
    const generic = probeGeneric({ duration: Infinity, seekable: { length: 0 } });
    const merged = mergeCapabilities(generic, { seek: supported("adapter:x"), chapters: supported("adapter:x") });
    expect(merged.seek?.status).toBe("unavailable");
    expect(merged.chapters).toEqual({ status: "supported", source: "adapter:x" });
    expect(mergeCapabilities(probeGeneric({ duration: 9, seekable: { length: 1 } }), { seek: unavailable("drm") }).seek)
      .toEqual({ status: "unavailable", reason: "drm" });
  });
});

describe("command validation", () => {
  it("accepts valid commands and clamps volume", () => {
    expect(validateCommand({ type: "play" })).toEqual({ type: "play" });
    expect(validateCommand({ type: "setVolume", value: 3 })).toEqual({ type: "setVolume", value: 1 });
    expect(validateCommand({ type: "setRate", value: 1.5 })).toEqual({ type: "setRate", value: 1.5 });
  });

  it.each([
    null, "play", { type: "exec" }, { type: "seek", to: -1 }, { type: "seek", to: Number.NaN },
    { type: "setRate", value: 16 }, { type: "setMuted", value: "yes" }, { type: "selectCaptions", trackId: 4 },
  ])("rejects %j", (input) => {
    expect(validateCommand(input)).toBeNull();
  });
});

describe("background message parsing", () => {
  it("accepts the closed stacking set only", () => {
    expect(parseToBackground({ type: "stacking", op: "setAbove", token: "bp-abcdefgh12", value: true })).toMatchObject({ op: "setAbove" });
    expect(parseToBackground({ type: "stacking", op: "setAbove", token: "bp-abcdefgh12" })).toBeNull();
    expect(parseToBackground({ type: "stacking", op: "exec", token: "bp-abcdefgh12" })).toBeNull();
    expect(parseToBackground({ type: "stacking", op: "getState", token: 'bp-x"; rm -rf' })).toBeNull();
    expect(parseToBackground({ type: "other" })).toBeNull();
  });
});

describe("settings migration", () => {
  it("returns defaults for unknown data and repairs invalid fields", () => {
    expect(migrate(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(migrate({ version: 99 })).toEqual(DEFAULT_SETTINGS);
    const s = migrate({ version: 1, layout: { preferred: "docked", blur: "x" }, pipSize: { width: 10, height: 600 } });
    expect(s.layout).toEqual({ preferred: "docked", blur: false });
    expect(s.pipSize).toEqual({ width: DEFAULT_SETTINGS.pipSize.width, height: 600 });
    expect(s.stacking).toEqual({ above: false, followWorkspaces: false });
  });
});
