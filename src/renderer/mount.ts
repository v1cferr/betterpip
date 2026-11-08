// Mounts the Svelte renderer into a PiP document from the isolated world (ADR 0003 §7).
// Tailwind output is injected into the PiP document only; the host page gets nothing.
import { mount, unmount } from "svelte";
import css from "./app.css?inline";
import App from "./App.svelte";
import { Player } from "./player.svelte";
import type { MediaSession } from "../core/session/media-session";
import type { SettingsV1 } from "../core/settings/settings";
import type { Scope } from "../core/contracts/dispose";

export function mountRenderer(opts: {
  pip: Window;
  stage: HTMLElement;
  session: MediaSession;
  settings: SettingsV1;
  token: string;
  title: string;
  scope: Scope;
  onClose: () => void;
}) {
  const doc = opts.pip.document;
  doc.title = `BetterPiP — ${opts.title} · ${opts.token}`;
  doc.documentElement.lang = document.documentElement.lang || "en";
  doc.documentElement.classList.add("dark");
  const style = doc.createElement("style");
  style.textContent = css;
  doc.head.append(style);

  const player = new Player(opts.session, opts.settings, opts.token, opts.title);
  const app = mount(App, {
    target: doc.body,
    props: {
      p: player,
      stage: opts.stage,
      onClose: opts.onClose,
      onOpenSettings: () => void browser.runtime.sendMessage({ type: "openOptions" }),
    },
  });
  opts.scope.defer(() => unmount(app));
  return player;
}
