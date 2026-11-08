// Site adapter contract (ADR 0003 §5.5).
import type { CapabilityMap } from "../contracts/capabilities";
import type { Chapter } from "../contracts/commands";
import type { Disposable, Scope } from "../contracts/dispose";
import type { BpError } from "../contracts/errors";

export interface AdapterContext {
  video: HTMLVideoElement;
  url: URL;
  scope: Scope;
  log(error: BpError): void;
}

export interface AdapterHandle extends Disposable {
  capabilities(): CapabilityMap;
  chapters?(): Promise<Chapter[]>;
  /** Called when the chapter list changes, e.g. after in-page navigation to another video. */
  onChaptersChanged?(fn: (items: Chapter[]) => void): void;
  onElementAway?(): void;
  onElementBack?(): void;
}

export interface SiteAdapter {
  id: string;
  matches(url: URL): boolean;
  attach(ctx: AdapterContext): Promise<AdapterHandle>;
}
