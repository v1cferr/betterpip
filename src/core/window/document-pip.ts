// Window backend: Document PiP with element custody (ADR 0001, ADR 0003 §5.6).
// The page's own <video> moves into the PiP window and comes back on close.
import type { Scope } from "../contracts/dispose";
import { bpError, type BpError } from "../contracts/errors";

export interface PipHandle {
  window: Window;
  stage: HTMLElement;
  token: string;
  close(): void;
}

export type OpenResult = { ok: true; pip: PipHandle } | { ok: false; error: BpError };

interface DocumentPictureInPicture {
  requestWindow(opts?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
}

export function documentPipAvailable(): boolean {
  return window.top === window && typeof (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture?.requestWindow === "function";
}

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return "bp-" + Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

/**
 * Must be called synchronously from a user gesture in the page (transient activation).
 * `onClosed` runs after the element is back in the page.
 */
export async function openDocumentPip(
  video: HTMLVideoElement,
  scope: Scope,
  size: { width: number; height: number },
  onClosed: (reason: "user" | "elementLost") => void,
): Promise<OpenResult> {
  if (window.top !== window) return { ok: false, error: bpError("NOT_TOP_LEVEL", "Document PiP only works in the top-level page", false) };
  const api = (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;
  if (!api) return { ok: false, error: bpError("WINDOW_REFUSED", "This browser does not expose Document Picture-in-Picture", false) };

  let pip: Window;
  try {
    pip = await api.requestWindow(size);
  } catch (e) {
    const name = (e as Error)?.name;
    return { ok: false, error: bpError(name === "NotAllowedError" ? "ACTIVATION_REQUIRED" : "WINDOW_REFUSED", "The browser refused to open the window", true, e) };
  }

  const token = newToken();
  const placeholder = document.createComment("betterpip-video-slot");
  const originalParent = video.parentNode;
  const saved = { style: video.getAttribute("style"), controls: video.controls };
  video.before(placeholder);

  const stage = pip.document.createElement("div");
  stage.className = "bp-stage";
  stage.append(video);
  video.controls = false;
  video.style.cssText = "width:100%;height:100%;object-fit:contain;display:block;background:#000;";

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    if (saved.style === null) video.removeAttribute("style");
    else video.setAttribute("style", saved.style);
    video.controls = saved.controls;
    if (placeholder.isConnected) placeholder.replaceWith(video);
    else if (originalParent?.isConnected) originalParent.appendChild(video);
    else return onClosed("elementLost");
    onClosed("user");
  };
  pip.addEventListener("pagehide", () => {
    restore();
    scope.dispose();
  }, { once: true });
  scope.defer(() => {
    restore();
    if (!pip.closed) pip.close();
  });

  return { ok: true, pip: { window: pip, stage, token, close: () => pip.close() } };
}
