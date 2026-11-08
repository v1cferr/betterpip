import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// Firefox/Zen MV3 build (ADR 0001, ADR 0003). Minimal permissions; host access comes from
// activeTab after a user action, nativeMessaging only when the user enables the pin control.
export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-svelte"],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: "BetterPiP",
    description: "One floating Picture-in-Picture window with the video and its tools.",
    permissions: ["activeTab", "scripting", "storage"],
    optional_permissions: ["nativeMessaging"],
    action: { default_title: "Open BetterPiP for this tab (Alt+Shift+P)" },
    commands: {
      "open-betterpip": {
        suggested_key: { default: "Alt+Shift+P" },
        description: "Show the BetterPiP button on the current video",
      },
    },
    browser_specific_settings: {
      // Firefox 154 is the first release where isolated content scripts can open Document PiP.
      gecko: {
        id: "betterpip@v1cferr",
        strict_min_version: "154.0",
        // No telemetry or data collection (ADR 0003 §10).
        data_collection_permissions: { required: ["none"] },
      },
    },
  },
});
