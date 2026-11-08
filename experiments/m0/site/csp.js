// E7, page world (V1C-120): which ways of putting UI into a Document PiP window survive the
// opener's Content-Security-Policy? Results go to window.__csp for the harness.
"use strict";

const TARGET = "rgb(1, 2, 3)";
const GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const errInfo = (e) => ({ name: e?.name, message: String(e?.message ?? e).slice(0, 160) });
const video = document.getElementById("v");
window.__csp = { pageViolations: [] };
document.addEventListener("securitypolicyviolation", (e) =>
  window.__csp.pageViolations.push({ directive: e.effectiveDirective, blocked: e.blockedURI }));

async function inject(pip, linkHref) {
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
  attempt("link", () => { link.rel = "stylesheet"; link.href = linkHref; d.head.append(link); });
  attempt("adopted", () => { const sh = new pip.CSSStyleSheet(); sh.replaceSync(`#m-adopted{color:${TARGET}}`); d.adoptedStyleSheets = [sh]; });
  attempt("inline-script", () => { const s = d.createElement("script"); s.textContent = "window.__inlineRan = 1"; d.body.append(s); });
  attempt("innerHTML", () => { const div = d.createElement("div"); div.innerHTML = '<b id="m-inner">x</b>'; d.body.append(div); });
  const img = d.createElement("img");
  const imgDone = new Promise((r) => { img.onload = () => r("load"); img.onerror = () => r("error"); setTimeout(() => r("timeout"), 3000); });
  attempt("img-data", () => { img.src = GIF; d.body.append(img); });

  out.linkEvent = await linkDone;
  out.imgEvent = await imgDone;
  await new Promise((r) => setTimeout(r, 300)); // let violation events arrive
  out.applied = Object.fromEntries(Object.entries(m).map(([k, el]) => [k, pip.getComputedStyle(el).color === TARGET]));
  out.applied["inline-script"] = pip.__inlineRan === 1;
  out.applied.innerHTML = !!d.getElementById("m-inner");
  out.applied["img-data"] = out.imgEvent === "load";
  out.tries = tries;
  return out;
}

document.getElementById("play").addEventListener("click", () => video.play());
document.getElementById("close-pip").addEventListener("click", () => documentPictureInPicture.window?.close());
document.getElementById("csp-page").addEventListener("click", async () => {
  try {
    const pip = await documentPictureInPicture.requestWindow({ width: 480, height: 320 });
    window.__csp.page = { ok: true, ...(await inject(pip, new URL("csp-probe.css", location.href).href)) };
  } catch (e) {
    window.__csp.page = { ok: false, ...errInfo(e) };
  }
});
