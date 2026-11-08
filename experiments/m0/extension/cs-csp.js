// E7, isolated content script (V1C-120): the same injections as site/csp.js, but made by the
// extension, which is how BetterPiP would build its UI. Also moves the page's <video> into
// the PiP window to check that playback survives under the page's policy.
"use strict";

(() => {
  const TARGET = "rgb(1, 2, 3)";
  const GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const errInfo = (e) => ({ name: e?.name, message: String(e?.message ?? e).slice(0, 160) });
  const report = (value) => document.documentElement.setAttribute("data-m0-csp-cs", JSON.stringify(value));

  async function inject(pip) {
    const d = pip.document;
    const out = { violations: [] };
    d.addEventListener("securitypolicyviolation", (e) =>
      out.violations.push({ directive: e.effectiveDirective, blocked: e.blockedURI, sample: e.sample?.slice(0, 40) }));
    const marker = (id) => { const el = d.createElement("div"); el.id = id; el.textContent = id; d.body.append(el); return el; };
    const tries = {};
    const attempt = (name, fn) => { try { fn(); tries[name] = "ok"; } catch (e) { tries[name] = errInfo(e); } };

    const m = Object.fromEntries(["style-element", "style-attr", "cssom", "link", "adopted"].map((k) => [k, marker("m-" + k)]));
    attempt("style-element", () => { const s = d.createElement("style"); s.textContent = `#m-style-element{color:${TARGET}}`; d.head.append(s); });
    attempt("style-attr", () => m["style-attr"].setAttribute("style", `color:${TARGET}`));
    attempt("cssom", () => { m.cssom.style.color = TARGET; });
    const link = d.createElement("link");
    const linkDone = new Promise((r) => { link.onload = () => r("load"); link.onerror = () => r("error"); setTimeout(() => r("timeout"), 3000); });
    attempt("link", () => { link.rel = "stylesheet"; link.href = browser.runtime.getURL("ext-probe.css"); d.head.append(link); });
    attempt("adopted", () => {
      const sh = new pip.CSSStyleSheet();
      sh.replaceSync(`#m-adopted{color:${TARGET}}`);
      d.adoptedStyleSheets = cloneInto([sh], pip, { wrapReflectors: true });
    });
    attempt("inline-script", () => { const s = d.createElement("script"); s.textContent = "window.__inlineRan = 1"; d.body.append(s); });
    attempt("innerHTML", () => { const div = d.createElement("div"); div.innerHTML = '<b id="m-inner">x</b>'; d.body.append(div); });
    const img = d.createElement("img");
    const imgDone = new Promise((r) => { img.onload = () => r("load"); img.onerror = () => r("error"); setTimeout(() => r("timeout"), 3000); });
    attempt("img-data", () => { img.src = GIF; d.body.append(img); });

    out.linkEvent = await linkDone;
    out.imgEvent = await imgDone;
    await new Promise((r) => setTimeout(r, 300));
    out.applied = Object.fromEntries(Object.entries(m).map(([k, el]) => [k, pip.getComputedStyle(el).color === TARGET]));
    out.applied["inline-script"] = pip.wrappedJSObject.__inlineRan === 1;
    out.applied.innerHTML = !!d.getElementById("m-inner");
    out.applied["img-data"] = out.imgEvent === "load";
    out.tries = tries;
    return out;
  }

  document.getElementById("csp-cs")?.addEventListener("click", async () => {
    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 480, height: 320 });
      const out = { ok: true, ...(await inject(pip)) };
      const video = document.getElementById("v");
      const t0 = video.currentTime;
      pip.document.body.append(video);
      await new Promise((r) => setTimeout(r, 2000));
      out.video = { t0: +t0.toFixed(2), t1: +video.currentTime.toFixed(2), paused: video.paused, inPip: video.ownerDocument !== document, error: video.error?.code ?? null };
      pip.addEventListener("pagehide", () => document.body.prepend(video), { once: true });
      report(out);
    } catch (e) {
      report({ ok: false, ...errInfo(e) });
    }
  });
})();
