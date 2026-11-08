// V1C-121 spike, isolated content script: mount a Svelte 5 component into a Document PiP
// window, under whatever CSP the page has. Results go to data-sv-* attributes on <html>.
import { mount, unmount, flushSync } from "svelte";
import Panel from "./Panel.svelte";

const report = (k, v) => document.documentElement.setAttribute("data-sv-" + k, JSON.stringify(v));
const errInfo = (e) => ({ ok: false, name: e?.name, message: String(e?.message ?? e).slice(0, 200), stack: String(e?.stack ?? "").split("\n").slice(0, 4) });
let app = null;
let pipRef = null;

function opener(id, label, fn) {
  const b = document.createElement("button");
  b.id = id;
  b.textContent = label;
  b.addEventListener("click", fn);
  document.body.prepend(b);
}

opener("sv-open", "V1C-121: open Svelte PiP", async () => {
  try {
    const pip = await window.documentPictureInPicture.requestWindow({ width: 480, height: 360 });
    pipRef = pip;
    pip.document.title = "BetterPiP svelte spike";
    const violations = [];
    pip.document.addEventListener("securitypolicyviolation", (e) => violations.push(e.effectiveDirective));
    const video = document.querySelector("video");
    const t0 = performance.now();
    app = mount(Panel, { target: pip.document.body, props: { video, report } });
    flushSync();
    const mountMs = +(performance.now() - t0).toFixed(2);
    const panel = pip.document.querySelector(".panel");
    const styles = [...pip.document.querySelectorAll("style")].length;
    report("mount", {
      ok: !!panel,
      mountMs,
      styleApplied: panel ? pip.getComputedStyle(panel).color === "rgb(1, 2, 3)" : false,
      styleElements: styles,
      styleInPageDoc: [...document.querySelectorAll("style")].some((s) => s.textContent.includes("rgb(1, 2, 3)")),
      nodesOwnedByPip: panel?.ownerDocument === pip.document,
      listItems: pip.document.querySelectorAll("li").length,
    });
    setTimeout(() => report("violations", violations), 500);
    pip.addEventListener("pagehide", () => {
      if (app) { unmount(app); app = null; }
    }, { once: true });
  } catch (e) {
    report("mount", errInfo(e));
  }
});

opener("sv-unmount", "V1C-121: unmount", () => {
  try {
    const before = pipRef.document.querySelectorAll(".panel").length;
    unmount(app);
    app = null;
    report("unmount", { ok: true, before, after: pipRef.document.querySelectorAll(".panel").length });
  } catch (e) {
    report("unmount", errInfo(e));
  }
});
