// Background (ADR 0003 §3): entry from the toolbar button or the shortcut, and the relay to
// the optional pin helper (ADR 0002). It never touches page DOM.
import { parseToBackground, type StackingReply } from "../core/bridge/messages";

const PLAYER_SCRIPT = "/content-scripts/player.js";
const HELPER = "betterpip_pin";

export default defineBackground(() => {
  // Toolbar button and keyboard shortcut both grant activeTab for this tab.
  browser.action.onClicked.addListener((tab) => void activate(tab.id));
  browser.commands.onCommand.addListener(async (name, tab) => {
    if (name !== "open-betterpip") return;
    // Some builds pass no tab to onCommand (seen with Zen in the M0 lab); fall back to the
    // active tab of the focused window.
    const target = tab ?? (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    void activate(target?.id);
  });

  browser.runtime.onMessage.addListener((raw, sender) => {
    if (sender.id !== browser.runtime.id) return undefined; // only our own content scripts and pages
    const msg = parseToBackground(raw);
    if (!msg) return Promise.resolve({ ok: false, error: "invalid" } satisfies StackingReply);
    if (msg.type === "openOptions") return browser.runtime.openOptionsPage().then(() => ({ ok: true }));
    if (!sender.tab) return Promise.resolve({ ok: false, error: "invalid" } satisfies StackingReply);
    return relayStacking(msg.op, msg.token, msg.value);
  });
});

async function activate(tabId: number | undefined) {
  if (tabId === undefined) return;
  try {
    // Already injected: ask it to show its button (or open directly if the gesture allows).
    await browser.tabs.sendMessage(tabId, { type: "activate" });
  } catch {
    try {
      await browser.scripting.executeScript({ target: { tabId }, files: [PLAYER_SCRIPT] });
    } catch (e) {
      console.warn("BetterPiP cannot run on this page:", e);
    }
  }
}

async function relayStacking(op: "getState" | "setAbove" | "setFollowWorkspaces", token: string, value?: boolean): Promise<StackingReply> {
  if (!(await browser.permissions.contains({ permissions: ["nativeMessaging"] }))) return { ok: false, error: "needsPermission" };
  try {
    const r = (await browser.runtime.sendNativeMessage(HELPER, { op, token, ...(value === undefined ? {} : { value }) })) as Record<string, unknown>;
    if (r?.ok === true) {
      const st = r.state as { above: boolean; followWorkspaces: boolean };
      return { ok: true, backend: String(r.backend), state: { above: !!st.above, followWorkspaces: !!st.followWorkspaces }, implied: (r.implied as string[]) ?? [] };
    }
    const map: Record<string, StackingReply & { ok: false }> = {
      "unsupported-compositor": { ok: false, error: "unsupportedCompositor" },
      "window-not-found": { ok: false, error: "windowNotFound" },
    };
    return map[String(r?.error)] ?? { ok: false, error: "internal", detail: String(r?.error) };
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    return /No such native application|not found/i.test(message) ? { ok: false, error: "needsHelper" } : { ok: false, error: "internal", detail: message };
  }
}
