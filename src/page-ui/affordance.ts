// The only UI BetterPiP puts in the host page (ADR 0003 §7): a small button over the chosen
// video, in a closed shadow root, created from the isolated world and removed after use.

const STYLE = `
:host { all: initial; }
.wrap { position: fixed; z-index: 2147483647; display: flex; gap: 6px; align-items: center; pointer-events: auto;
  font: 500 13px/1 ui-sans-serif, system-ui, sans-serif; animation: in 160ms ease-out; }
button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px 9px 11px;
  border-radius: 999px; color: #fff; background: oklch(0.2 0.02 265 / 0.82); backdrop-filter: blur(8px) saturate(1.4);
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.35), inset 0 0 0 1px rgb(255 255 255 / 0.14); transition: transform 120ms, background 120ms; }
button:hover { background: oklch(0.72 0.16 250 / 0.92); color: oklch(0.16 0.02 260); }
button:active { transform: scale(0.96); }
button:focus-visible { outline: 2px solid oklch(0.72 0.16 250); outline-offset: 2px; }
.x { padding: 7px; border-radius: 999px; }
svg { width: 16px; height: 16px; }
.toast { position: fixed; z-index: 2147483647; left: 50%; bottom: 28px; transform: translateX(-50%); padding: 10px 16px;
  border-radius: 10px; color: #fff; background: oklch(0.2 0.02 265 / 0.9); box-shadow: 0 6px 24px rgb(0 0 0 / 0.35);
  font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; max-width: min(90vw, 460px); animation: in 160ms ease-out; }
@keyframes in { from { opacity: 0; transform: translateY(4px); } }
@media (prefers-reduced-motion: reduce) { .wrap, .toast { animation: none; } }
`;

const PIP_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10h6V4"/><path d="m2 4 6 6"/><path d="M21 10V7a2 2 0 0 0-2-2h-7"/><path d="M3 14v2a2 2 0 0 0 2 2h3"/><rect x="12" y="14" width="10" height="7" rx="1"/></svg>`;
const X_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

let current: (() => void) | null = null;

function host(): { root: ShadowRoot; remove: () => void } {
  current?.();
  const el = document.createElement("betterpip-ui");
  const root = el.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = STYLE; // isolated-world insertion is exempt from the page CSP (V1C-120 E7)
  root.append(style);
  document.documentElement.append(el);
  const remove = () => {
    el.remove();
    if (current === remove) current = null;
  };
  current = remove;
  return { root, remove };
}

export function showAffordance(video: HTMLVideoElement, onOpen: () => void) {
  const { root, remove } = host();
  const wrap = document.createElement("div");
  wrap.className = "wrap";
  const open = document.createElement("button");
  open.innerHTML = `${PIP_ICON}<span>Open in BetterPiP</span>`;
  open.setAttribute("aria-label", "Open this video in BetterPiP");
  const dismiss = document.createElement("button");
  dismiss.className = "x";
  dismiss.innerHTML = X_ICON;
  dismiss.setAttribute("aria-label", "Dismiss");
  wrap.append(open, dismiss);
  root.append(wrap);

  const place = () => {
    const r = video.getBoundingClientRect();
    const top = Math.min(Math.max(r.top + 12, 12), innerHeight - 56);
    const right = Math.min(Math.max(innerWidth - r.right + 12, 12), innerWidth - 220);
    wrap.style.top = `${top}px`;
    wrap.style.right = `${right}px`;
  };
  place();
  const ac = new AbortController();
  addEventListener("scroll", place, { passive: true, capture: true, signal: ac.signal });
  addEventListener("resize", place, { signal: ac.signal });
  const timer = setTimeout(done, 12000);
  function done() {
    ac.abort();
    clearTimeout(timer);
    remove();
  }
  open.addEventListener("click", () => {
    done();
    onOpen(); // runs inside the click: transient activation for requestWindow
  }, { signal: ac.signal });
  dismiss.addEventListener("click", done, { signal: ac.signal });
  open.focus({ preventScroll: true });
}

export function showToast(text: string) {
  const { root, remove } = host();
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = text;
  root.append(t);
  setTimeout(remove, 4000);
}
