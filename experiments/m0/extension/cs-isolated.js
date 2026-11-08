// Isolated-world content script probe (V1C-120). Results are written to data-m0-* attributes
// on <html>, the one surface both the page and the harness can read.
"use strict";

const report = (key, value) => {
  document.documentElement.setAttribute("data-m0-" + key, JSON.stringify(value));
};
const errInfo = (e) => ({ ok: false, name: e?.name, message: String(e?.message ?? e) });

report("cs-isolated-detect", {
  has: "documentPictureInPicture" in window,
  requestWindowType: typeof window.documentPictureInPicture?.requestWindow,
  extensionPageUrl: browser.runtime.getURL("ext-page.html"),
});

// After a window opens, check what the content script can actually do with it.
async function exercise(pip, label) {
  const out = { ok: true, label };
  try {
    out.inner = [pip.innerWidth, pip.innerHeight];
    const d = pip.document;
    const b = d.createElement("button");
    b.id = "cs-btn";
    b.textContent = "content-script button";
    let clicks = 0;
    b.addEventListener("click", (e) => {
      clicks += 1;
      report(label + "-click", { clicks, isTrusted: e.isTrusted });
    });
    d.body.append(b);
    out.domWrite = d.getElementById("cs-btn") === b;
    out.sameAsPageWindow = window.wrappedJSObject.documentPictureInPicture.window === (pip.wrappedJSObject ?? pip);
  } catch (e) {
    Object.assign(out, { domError: errInfo(e) });
  }
  return out;
}

function bind(id, label, open) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("click", async () => {
    try {
      const pip = await open();
      report(label, await exercise(pip, label));
    } catch (e) {
      report(label, errInfo(e));
    }
  });
}

const size = { width: 360, height: 240 };

// Direct call from the isolated world (was blocked by bug 2045666, reopened by bug 2053139).
bind("cs-open-isolated", "cs-isolated", () => window.documentPictureInPicture.requestWindow(size));

// Waived call through the page's object (the documented workaround; loses Xray protection).
bind("cs-open-wrapped", "cs-wrapped", () =>
  window.wrappedJSObject.documentPictureInPicture.requestWindow(cloneInto(size, window)));

// Can the isolated world move the page's own <video> into a PiP window it opened?
bind("cs-move-video", "cs-move-video", async () => {
  const video = document.querySelector("video");
  const t0 = video.currentTime;
  const pip = await window.documentPictureInPicture.requestWindow({ width: 480, height: 300 });
  pip.document.body.append(video);
  report("cs-move-video-state", { t0, t1: video.currentTime, paused: video.paused, inPip: video.ownerDocument !== document });
  pip.addEventListener("pagehide", () => document.getElementById("slot").append(video), { once: true });
  return pip;
});

// Keyboard path: a keydown inside the page is user activation for the page.
document.addEventListener("keydown", async (e) => {
  if (!(e.altKey && e.shiftKey && e.code === "KeyP")) return;
  try {
    const pip = await window.documentPictureInPicture.requestWindow(size);
    report("cs-keydown", await exercise(pip, "cs-keydown"));
  } catch (err) {
    report("cs-keydown", errInfo(err));
  }
});

// Option C: ask the background for an ordinary extension popup window.
document.getElementById("cs-popup-window")?.addEventListener("click", async () => {
  report("popup-window", await browser.runtime.sendMessage({ cmd: "popup-window" }));
});

document.getElementById("cs-ext-page")?.addEventListener("click", () => {
  browser.runtime.sendMessage({ cmd: "ext-page" });
});

browser.runtime.sendMessage({ cmd: "tabs-probe" }).then((r) => report("tabs-probe", r), (e) => report("tabs-probe", errInfo(e)));

// The background reports its own attempts through storage; mirror them into the DOM.
async function mirrorBackground() {
  const all = await browser.storage.local.get(null);
  for (const [k, v] of Object.entries(all)) report("bg-" + k, v);
}
browser.storage.onChanged.addListener(mirrorBackground);
mirrorBackground();
