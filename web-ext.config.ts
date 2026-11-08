import { defineWebExtConfig } from "wxt";

// Browser opened by `pnpm dev` / tools/run.sh: a throw-away profile with BetterPiP loaded.
// BP_BROWSER picks the binary (tools/run.sh sets it: Zen if installed, else Firefox).
export default defineWebExtConfig({
  binaries: process.env.BP_BROWSER ? { firefox: process.env.BP_BROWSER } : {},
  startUrls: [process.env.BP_START_URL ?? "https://www.youtube.com/"],
  firefoxPref: { "zen.welcome-screen.seen": true },
});
