// Capability contract (ADR 0003 §5.2). The UI renders only what is "supported".

export type CapabilityId =
  | "play" | "seek" | "duration" | "live" | "volume" | "mute" | "rate"
  | "chapters" | "captions" | "windowBackend" | "stacking";

export type UnavailableReason =
  | "notExposed" | "live" | "drm" | "crossOriginFrame" | "noActivation"
  | "unsupportedBrowser" | "needsHelper" | "needsPermission" | "unsupportedCompositor" | "adapterFailed";

export type CapabilitySource = "generic" | `adapter:${string}`;

export type Capability<V = unknown> =
  | { status: "supported"; value?: V; source: CapabilitySource }
  | { status: "unavailable"; reason: UnavailableReason };

export type CapabilityMap = Partial<Record<CapabilityId, Capability>>;

export const supported = <V>(source: CapabilitySource, value?: V): Capability<V> =>
  value === undefined ? { status: "supported", source } : { status: "supported", value, source };

export const unavailable = (reason: UnavailableReason): Capability => ({ status: "unavailable", reason });

export const isSupported = (c: Capability | undefined): boolean => c?.status === "supported";
