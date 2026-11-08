// Content ↔ background messages (ADR 0003 §6). Closed set, schema-checked on receipt.

export type ToBackground =
  | { type: "stacking"; op: "getState" | "setAbove" | "setFollowWorkspaces"; token: string; value?: boolean }
  | { type: "openOptions" };

export type StackingReply =
  | { ok: true; backend: string; state: { above: boolean; followWorkspaces: boolean }; implied: string[] }
  | { ok: false; error: "needsPermission" | "needsHelper" | "unsupportedCompositor" | "windowNotFound" | "invalid" | "internal"; detail?: string };

const TOKEN = /^bp-[a-z0-9]{8,32}$/;

export function parseToBackground(input: unknown): ToBackground | null {
  if (!input || typeof input !== "object") return null;
  const m = input as Record<string, unknown>;
  if (m.type === "openOptions") return { type: "openOptions" };
  if (m.type !== "stacking") return null;
  if (m.op !== "getState" && m.op !== "setAbove" && m.op !== "setFollowWorkspaces") return null;
  if (typeof m.token !== "string" || !TOKEN.test(m.token)) return null;
  if (m.op !== "getState" && typeof m.value !== "boolean") return null;
  return { type: "stacking", op: m.op, token: m.token, ...(typeof m.value === "boolean" ? { value: m.value } : {}) };
}
