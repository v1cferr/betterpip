// Known site adapters. Pages without one use the generic session alone.
import type { SiteAdapter } from "./types";
import { youtube } from "./youtube";

export const ADAPTERS: readonly SiteAdapter[] = [youtube];
