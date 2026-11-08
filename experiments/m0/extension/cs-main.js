// MAIN-world content script probe (V1C-120). Runs with the page's principal, like a page
// script, so it is the path the extension would use if the isolated world is refused.
"use strict";

(() => {
  const report = (key, value) => document.documentElement.setAttribute("data-m0-" + key, JSON.stringify(value));
  report("cs-main-detect", { has: "documentPictureInPicture" in window, hasBrowserApi: typeof globalThis.browser });

  document.getElementById("cs-open-main")?.addEventListener("click", async () => {
    try {
      const pip = await documentPictureInPicture.requestWindow({ width: 360, height: 240 });
      const b = pip.document.createElement("button");
      b.id = "main-btn";
      b.textContent = "main-world button";
      let clicks = 0;
      b.addEventListener("click", (e) => report("cs-main-click", { clicks: ++clicks, isTrusted: e.isTrusted }));
      pip.document.body.append(b);
      report("cs-main", { ok: true, inner: [pip.innerWidth, pip.innerHeight], domWrite: !!pip.document.getElementById("main-btn") });
    } catch (e) {
      report("cs-main", { ok: false, name: e?.name, message: String(e?.message ?? e) });
    }
  });
})();
