// Versioned local settings (ADR 0003 §9). storage.local only; never synced by default.
import type { LayoutMode } from "../contracts/commands";

export interface SettingsV1 {
  version: 1;
  layout: { preferred: LayoutMode; blur: boolean };
  stacking: { above: boolean; followWorkspaces: boolean };
  pipSize: { width: number; height: number };
}

export const DEFAULT_SETTINGS: SettingsV1 = {
  version: 1,
  layout: { preferred: "overlay", blur: false },
  stacking: { above: false, followWorkspaces: false },
  pipSize: { width: 720, height: 405 },
};

const KEY = "settings";
const LAYOUTS: readonly LayoutMode[] = ["minimal", "overlay", "docked"];

/** Accepts unknown stored data and returns valid settings; unknown/invalid fields fall back to defaults. */
export function migrate(raw: unknown): SettingsV1 {
  if (!raw || typeof raw !== "object" || (raw as { version?: unknown }).version !== 1) return structuredClone(DEFAULT_SETTINGS);
  const r = raw as Partial<SettingsV1>;
  const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && v >= lo && v <= hi ? Math.round(v) : d);
  return {
    version: 1,
    layout: {
      preferred: LAYOUTS.includes(r.layout?.preferred as LayoutMode) ? (r.layout!.preferred as LayoutMode) : DEFAULT_SETTINGS.layout.preferred,
      blur: typeof r.layout?.blur === "boolean" ? r.layout.blur : DEFAULT_SETTINGS.layout.blur,
    },
    stacking: {
      above: r.stacking?.above === true,
      followWorkspaces: r.stacking?.followWorkspaces === true,
    },
    pipSize: {
      width: n(r.pipSize?.width, 240, 3840, DEFAULT_SETTINGS.pipSize.width),
      height: n(r.pipSize?.height, 135, 2160, DEFAULT_SETTINGS.pipSize.height),
    },
  };
}

export async function loadSettings(): Promise<SettingsV1> {
  try {
    const got = await browser.storage.local.get(KEY);
    return migrate(got[KEY]);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export async function saveSettings(s: SettingsV1): Promise<void> {
  await browser.storage.local.set({ [KEY]: s });
}
