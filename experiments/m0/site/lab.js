// BetterPiP M0 lab, page main world (V1C-120). Experimental, deliberately framework-free.
// Every observation goes to window.__m0 so the harness can read it back as evidence.

const M0 = (window.__m0 = { events: [], results: {}, pip: null });
const $ = (sel, root = document) => root.querySelector(sel);
const video = $("#v");
const logEl = $("#log");

function log(type, data = {}) {
  const entry = { t: Math.round(performance.now()), type, ...data };
  M0.events.push(entry);
  logEl.textContent += JSON.stringify(entry) + "\n";
  logEl.scrollTop = logEl.scrollHeight;
  return entry;
}
const errInfo = (e) => ({ name: e?.name, message: String(e?.message ?? e) });

function snapshot(v = video) {
  const q = v.getVideoPlaybackQuality?.();
  return {
    currentTime: +v.currentTime.toFixed(3),
    paused: v.paused,
    readyState: v.readyState,
    networkState: v.networkState,
    currentSrc: v.currentSrc,
    volume: v.volume,
    muted: v.muted,
    playbackRate: v.playbackRate,
    ownerIsPip: v.ownerDocument !== document,
    totalFrames: q?.totalVideoFrames,
    droppedFrames: q?.droppedVideoFrames,
    wall: Math.round(performance.now()),
  };
}

// Media events that would reveal a reload or a second pipeline after a move.
for (const ev of ["loadstart", "emptied", "abort", "error", "stalled", "waiting", "play", "pause",
  "playing", "seeking", "seeked", "ratechange", "volumechange", "ended", "loadedmetadata"]) {
  video.addEventListener(ev, () => log("media:" + ev, { currentTime: +video.currentTime.toFixed(3), ownerIsPip: video.ownerDocument !== document }));
}

// ---------------------------------------------------------------- E1: feature detection
function detect() {
  const dpip = window.documentPictureInPicture;
  return {
    userAgent: navigator.userAgent,
    isSecureContext: window.isSecureContext,
    isTopLevel: window.top === window,
    hasDocumentPictureInPicture: "documentPictureInPicture" in window,
    requestWindowType: typeof dpip?.requestWindow,
    hasOnEnter: dpip ? "onenter" in dpip : false,
    initialWindow: dpip ? dpip.window : undefined,
    pictureInPictureEnabled: document.pictureInPictureEnabled,
    videoRequestPictureInPicture: typeof HTMLVideoElement.prototype.requestPictureInPicture,
    pictureInPictureElement: "pictureInPictureElement" in document,
    userActivationApi: !!navigator.userActivation,
    captureStream: typeof video.captureStream,
    mozCaptureStream: typeof video.mozCaptureStream,
    requestVideoFrameCallback: typeof video.requestVideoFrameCallback,
    containerQueries: CSS.supports("container-type: size"),
    backdropFilter: CSS.supports("backdrop-filter: blur(2px)"),
    mediaSession: "mediaSession" in navigator,
  };
}
M0.results.detect = detect();
log("detect", M0.results.detect);

// Calling without transient user activation must fail; record exactly how.
(async () => {
  if (!window.documentPictureInPicture) return;
  try {
    const w = await documentPictureInPicture.requestWindow({ width: 200, height: 150 });
    M0.results.noActivation = { opened: true };
    w.close();
  } catch (e) {
    M0.results.noActivation = { opened: false, ...errInfo(e) };
  }
  log("noActivation", M0.results.noActivation);
})();

// E8: opener focus changes, to see whether focus returns when the PiP window closes.
for (const ev of ["focus", "blur"]) window.addEventListener(ev, () => log("opener:" + ev));

window.documentPictureInPicture?.addEventListener("enter", (e) => log("dpip:enter", { hasWindow: !!e.window }));

// ---------------------------------------------------------------- helpers for the PiP doc
async function requestPip(opts) {
  const t0 = performance.now();
  const activeBefore = navigator.userActivation?.isActive;
  try {
    const pip = await documentPictureInPicture.requestWindow(opts);
    M0.pip = pip;
    const info = {
      ms: Math.round(performance.now() - t0),
      activeBefore,
      requested: opts,
      inner: [pip.innerWidth, pip.innerHeight],
      outer: [pip.outerWidth, pip.outerHeight],
      screenXY: [pip.screenX, pip.screenY],
      baseURI: pip.document.baseURI,
      origin: pip.origin,
      locationHref: pip.location.href,
      sameOrigin: pip.origin === window.origin,
      dpipWindowMatches: documentPictureInPicture.window === pip,
      title: pip.document.title,
    };
    log("pip:open", info);
    pip.addEventListener("pagehide", () => log("pip:pagehide"));
    pip.addEventListener("resize", () => log("pip:resize", { inner: [pip.innerWidth, pip.innerHeight], outer: [pip.outerWidth, pip.outerHeight] }));
    // E8: where keyboard focus goes when the window opens, and back when it closes.
    info.focusAtOpen = { pipHasFocus: pip.document.hasFocus(), openerHasFocus: document.hasFocus() };
    for (const ev of ["focus", "blur"]) pip.addEventListener(ev, () => log("pip:" + ev, { openerHasFocus: document.hasFocus() }));
    return { pip, info };
  } catch (e) {
    const info = { ...errInfo(e), activeBefore, ms: Math.round(performance.now() - t0) };
    log("pip:error", info);
    throw Object.assign(e, { info });
  }
}

function button(doc, id, text, onClick) {
  const b = doc.createElement("button");
  b.id = id;
  b.type = "button";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

// ---------------------------------------------------------------- E2: HTML-only window
async function openHtmlPip() {
  const { pip, info } = await requestPip({ width: 480, height: 320 });
  M0.results.e2 = { open: info, clicks: [] };
  const d = pip.document;
  d.title = "BetterPiP M0 E2";
  const style = d.createElement("style");
  style.textContent = `body{margin:0;font:14px system-ui;background:#111;color:#eee}
    #area{height:90px;background:repeating-linear-gradient(45deg,#334,#334 10px,#223 10px,#223 20px)}
    #wrap{display:flex;gap:8px;padding:8px} #wrap.col{flex-direction:column}
    #panel{border:1px solid #555;padding:6px;flex:1}`;
  d.head.append(style);
  const area = d.createElement("div"); area.id = "area";
  const status = d.createElement("output"); status.id = "status"; status.textContent = "idle";
  const panel = d.createElement("div"); panel.id = "panel"; panel.textContent = "Panel";
  const wrap = d.createElement("div"); wrap.id = "wrap";
  let n = 0;
  wrap.append(
    button(d, "counter", "Click me", (e) => {
      n += 1;
      status.textContent = `clicked ${n}`;
      M0.results.e2.clicks.push({ n, isTrusted: e.isTrusted, active: pip.navigator.userActivation?.isActive });
      log("e2:click", { n, isTrusted: e.isTrusted });
    }),
    button(d, "toggle", "Toggle layout", () => {
      wrap.classList.toggle("col");
      log("e2:toggle", { col: wrap.classList.contains("col"), outer: [pip.outerWidth, pip.outerHeight] });
    }),
    status, panel,
  );
  d.body.append(area, wrap);
  return info;
}

// ---------------------------------------------------------------- E3/E4: video + tools
let placeholder = null;

async function openVideoPip({ width = 640, height = 400, mode = "minimal" } = {}) {
  const before = snapshot();
  const { pip, info } = await requestPip({ width, height });
  const d = pip.document;
  d.title = "BetterPiP M0";
  const css = d.createElement("link");
  css.rel = "stylesheet";
  css.href = new URL("pip.css", location.href).href;
  const cssLoaded = new Promise((r) => { css.onload = () => r("load"); css.onerror = () => r("error"); });
  d.head.append(css);

  const root = d.createElement("div"); root.className = "bp-root";
  const shell = d.createElement("div"); shell.className = "bp-shell"; shell.dataset.mode = mode;
  const stage = d.createElement("div"); stage.className = "bp-stage";
  const bar = d.createElement("div"); bar.className = "bp-bar";
  const status = d.createElement("output"); status.className = "bp-status"; status.id = "bp-status";
  const panel = d.createElement("section"); panel.className = "bp-panel"; panel.id = "bp-panel";
  panel.setAttribute("aria-label", "Tools");
  panel.innerHTML = "<strong>Chapters (fake)</strong><ol>" +
    Array.from({ length: 30 }, (_, i) => `<li><button data-seek="${i * 4}">00:${String(i * 4).padStart(2, "0")} Section ${i + 1}</button></li>`).join("") +
    "</ol>";
  panel.addEventListener("click", (e) => {
    const t = e.target.closest("[data-seek]");
    if (t) { video.currentTime = +t.dataset.seek; log("e4:chapter", { to: +t.dataset.seek, isTrusted: e.isTrusted }); }
  });

  const setMode = (m) => {
    const outerBefore = [pip.outerWidth, pip.outerHeight];
    shell.dataset.mode = m;
    // Force style/layout so the measurements reflect the new mode.
    const effective = effectiveMode();
    log("e4:mode", { requested: m, effective, outerBefore, outerAfter: [pip.outerWidth, pip.outerHeight], inner: [pip.innerWidth, pip.innerHeight], video: videoBox() });
  };
  const effectiveMode = () => {
    const cs = pip.getComputedStyle(panel);
    if (cs.display === "none") return "minimal";
    return cs.position === "absolute" ? "overlay" : "docked";
  };
  const videoBox = () => {
    const r = video.getBoundingClientRect();
    const ratio = video.videoWidth / video.videoHeight;
    // object-fit: contain -> displayed picture is the largest box with the source ratio.
    const shown = r.width / r.height > ratio ? [r.height * ratio, r.height] : [r.width, r.width / ratio];
    return { element: [Math.round(r.width), Math.round(r.height)], picture: shown.map(Math.round), sourceRatio: +ratio.toFixed(4), objectFit: pip.getComputedStyle(video).objectFit };
  };
  M0.pipApi = { setMode, effectiveMode, videoBox, pip };

  bar.append(
    button(d, "bp-play", "Play/Pause", (e) => { video.paused ? video.play() : video.pause(); log("e3:toggle", { isTrusted: e.isTrusted }); }),
    button(d, "bp-back", "-10s", () => { video.currentTime = Math.max(0, video.currentTime - 10); }),
    button(d, "bp-fwd", "+10s", () => { video.currentTime += 10; }),
    button(d, "bp-vol", "Vol 50%", () => { video.volume = video.volume === 1 ? 0.5 : 1; }),
    button(d, "bp-rate", "1.5x", () => { video.playbackRate = video.playbackRate === 1 ? 1.5 : 1; }),
    button(d, "bp-minimal", "Minimal", () => setMode("minimal")),
    button(d, "bp-overlay", "Overlay", () => setMode("overlay")),
    button(d, "bp-docked", "Docked", () => setMode("docked")),
    button(d, "bp-blur", "Blur", () => { shell.dataset.blur = shell.dataset.blur === "on" ? "off" : "on"; }),
    status,
  );

  // Event-driven status; no polling.
  const paint = () => { status.textContent = `${video.paused ? "paused" : "playing"} ${video.currentTime.toFixed(1)}s ${video.playbackRate}x vol ${video.volume}`; };
  for (const ev of ["timeupdate", "play", "pause", "ratechange", "volumechange", "seeked"]) video.addEventListener(ev, paint);

  // The move itself. A comment node keeps the original position for the return trip.
  placeholder = document.createComment("bp-video-slot");
  video.before(placeholder);
  const tMove = performance.now();
  stage.append(video); // adopts the element into the PiP document
  const moveMs = performance.now() - tMove;
  stage.append(bar);
  shell.append(stage, panel);
  root.append(shell);
  d.body.append(root);
  paint();

  // E8: shortcuts handled inside the PiP document (k = play/pause, ArrowRight = +5 s).
  d.addEventListener("keydown", (e) => {
    const entry = { key: e.key, isTrusted: e.isTrusted, target: e.target.id || e.target.tagName };
    if (e.key === "k") { video.paused ? video.play() : video.pause(); entry.action = "toggle"; }
    if (e.key === "ArrowRight" && e.target === d.body) { video.currentTime += 5; entry.action = "+5s"; }
    log("e8:key", entry);
  });
  const focusLog = () => log("e8:focus", { active: d.activeElement?.id || d.activeElement?.tagName, pipHasFocus: d.hasFocus() });
  d.addEventListener("focusin", focusLog);

  const ro = new pip.ResizeObserver((entries) => {
    const r = entries[0].contentRect;
    log("e4:container", { size: [Math.round(r.width), Math.round(r.height)], effective: effectiveMode(), video: videoBox() });
  });
  ro.observe(root);

  pip.addEventListener("pagehide", () => {
    ro.disconnect();
    const atClose = snapshot();
    placeholder.replaceWith(video);
    placeholder = null;
    M0.pip = null;
    // Measured on the next frame so the media element has settled in its home document.
    requestAnimationFrame(() => {
      M0.results.restore = { atClose, afterReturn: snapshot() };
      log("e3:restored", M0.results.restore);
    });
  }, { once: true });

  const after = snapshot();
  M0.results.e3 = { open: info, before, after, moveMs: +moveMs.toFixed(2), css: await cssLoaded, pipVideoCount: d.querySelectorAll("video").length, pageVideoCount: document.querySelectorAll("video").length };
  log("e3:moved", M0.results.e3);
  return M0.results.e3;
}

// ---------------------------------------------------------------- B: native video PiP
async function nativePip() {
  try {
    const w = await video.requestPictureInPicture();
    M0.results.native = { ok: true, width: w?.width, height: w?.height, element: document.pictureInPictureElement === video };
  } catch (e) {
    M0.results.native = { ok: false, ...errInfo(e) };
  }
  log("native", M0.results.native);
}

$("#play").addEventListener("click", () => video.play().then(() => log("play:ok"), (e) => log("play:error", errInfo(e))));
$("#open-html").addEventListener("click", () => openHtmlPip().catch(() => {}));
$("#open-video").addEventListener("click", () => openVideoPip().catch(() => {}));
$("#close-pip").addEventListener("click", () => M0.pip?.close());
$("#native-pip").addEventListener("click", nativePip);

Object.assign(M0, { snapshot, detect, openHtmlPip, openVideoPip, log });
