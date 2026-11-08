// Background (event page) probe (V1C-120). Each attempt is stored in storage.local and the
// isolated content script mirrors it into the page DOM for the harness.
"use strict";

const save = (key, value) => browser.storage.local.set({ [key]: { ...value, at: Date.now() } });
const errInfo = (e) => ({ ok: false, name: e?.name, message: String(e?.message ?? e) });

// 1. Directly from the background context, with no user activation at all.
(async () => {
  await browser.storage.local.clear();
  const has = typeof globalThis.documentPictureInPicture?.requestWindow === "function";
  try {
    if (!has) throw new Error("documentPictureInPicture not exposed in background");
    await globalThis.documentPictureInPicture.requestWindow({ width: 200, height: 150 });
    save("background-direct", { ok: true, has });
  } catch (e) {
    save("background-direct", { has, ...errInfo(e) });
  }
})();

// 2. Toolbar button / keyboard command -> scripting.executeScript into the active tab.
//    The question: does the browser-UI gesture count as user activation for the page?
async function viaExecuteScript(tab, source) {
  for (const world of ["MAIN", "ISOLATED"]) {
    try {
      const [res] = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        world,
        func: async () => {
          const activeBefore = navigator.userActivation?.isActive;
          try {
            const w = await window.documentPictureInPicture.requestWindow({ width: 360, height: 240 });
            w.document.body.textContent = "opened from executeScript";
            return { ok: true, activeBefore };
          } catch (e) {
            return { ok: false, activeBefore, name: e?.name, message: String(e?.message ?? e) };
          }
        },
      });
      await save(`${source}-exec-${world.toLowerCase()}`, res?.result ?? { ok: false, message: "no result" });
      if (res?.result?.ok) break; // one window per tab; stop after the first success
    } catch (e) {
      await save(`${source}-exec-${world.toLowerCase()}`, errInfo(e));
    }
  }
}
browser.action.onClicked.addListener((tab) => viaExecuteScript(tab, "action"));
browser.commands.onCommand.addListener(async (name, tab) => {
  if (name !== "open-pip") return;
  tab ??= (await browser.tabs.query({ active: true, currentWindow: true }))[0];
  viaExecuteScript(tab, "command");
});

// 3. Option C: an ordinary extension popup window. The WebExtensions windows API has no
//    always-on-top flag in Firefox, so stacking is up to the window manager.
browser.runtime.onMessage.addListener(async (msg) => {
  if (msg?.cmd === "ext-page") {
    await browser.tabs.create({ url: "ext-page.html" });
    return { ok: true };
  }
  if (msg?.cmd !== "popup-window") return undefined;
  try {
    const w = await browser.windows.create({ type: "popup", url: "ext-page.html?popup=1", width: 420, height: 300 });
    const info = { ok: true, id: w.id, type: w.type, state: w.state, alwaysOnTop: w.alwaysOnTop, width: w.width, height: w.height };
    await save("popup-window", info);
    return info;
  } catch (e) {
    return errInfo(e);
  }
});
