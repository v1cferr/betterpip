// Pin control client (ADR 0002): asks the background, which relays to the optional native
// helper. Without the helper the UI shows why the toggles are unavailable.
import type { StackingReply } from "../bridge/messages";

export async function stacking(op: "getState" | "setAbove" | "setFollowWorkspaces", token: string, value?: boolean): Promise<StackingReply> {
  try {
    const reply = (await browser.runtime.sendMessage({ type: "stacking", op, token, value })) as StackingReply | undefined;
    return reply ?? { ok: false, error: "internal" };
  } catch (e) {
    return { ok: false, error: "internal", detail: String((e as Error)?.message ?? e) };
  }
}
