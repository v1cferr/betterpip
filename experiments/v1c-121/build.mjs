// Bundles src/content.js (+ Svelte 5) into extension/content.js for the spike.
import { build } from "esbuild";
import { compile } from "svelte/compiler";
import { readFile } from "node:fs/promises";

const sveltePlugin = {
  name: "svelte",
  setup(b) {
    b.onLoad({ filter: /\.svelte$/ }, async (args) => {
      // css: "injected" makes Svelte insert the component's <style> next to the mount target.
      const { js, warnings } = compile(await readFile(args.path, "utf8"), { filename: args.path, css: "injected", generate: "client" });
      return { contents: js.code, loader: "js", warnings: warnings.map((w) => ({ text: w.message })) };
    });
  },
};

const r = await build({
  entryPoints: ["src/content.js"],
  bundle: true,
  format: "iife",
  minify: true,
  target: "firefox128",
  outfile: "extension/content.js",
  conditions: ["browser"],
  plugins: [sveltePlugin],
  metafile: true,
  logLevel: "warning",
});
const bytes = Object.values(r.metafile.outputs)[0].bytes;
console.log(JSON.stringify({ outfile: "extension/content.js", bytes }));
