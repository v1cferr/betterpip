// Relays the closed message set to the native helper (V1C-129). The content script cannot
// use native messaging; the background can, and only with the nativeMessaging permission.
"use strict";

const HOST = "betterpip_pin";
const OPS = new Set(["getState", "setAbove", "setFollowWorkspaces"]);

browser.runtime.onMessage.addListener(async (msg) => {
  if (!OPS.has(msg?.op)) return { ok: false, error: "unsupported-op" };
  const t0 = Date.now();
  try {
    const res = await browser.runtime.sendNativeMessage(HOST, { op: msg.op, token: msg.token, value: msg.value });
    return { ...res, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: "native-error", message: String(e?.message ?? e), ms: Date.now() - t0 };
  }
});
