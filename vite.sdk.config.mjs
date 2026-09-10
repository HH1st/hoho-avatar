import { defineConfig } from "vite";
import MagicString from "magic-string";

export default defineConfig({
  publicDir: false,
  plugins: [{
    name: "standalone-audio-worklet",
    enforce: "pre",
    transform(code, id) {
      if (!id.replaceAll("\\", "/").includes("/src/")) return;
      // Consumers load a sibling module, without Vite plugins or blob/data URLs.
      const match = /import processorUrl from ["'][^"']+audio-clip-processor\.ts\?worker&url["'];/.exec(code);
      if (!match) return;
      const output = new MagicString(code);
      output.overwrite(match.index, match.index + match[0].length, "const processorUrl = __HOHO_WORKLET_URL__;");
      return { code: output.toString(), map: output.generateMap({ hires: true }) };
    },
    renderChunk(code) {
      if (!code.includes("__HOHO_WORKLET_URL__")) return;
      const output = new MagicString(code);
      output.replaceAll("__HOHO_WORKLET_URL__", `new URL("./audio-clip-processor.js?no-inline", import.meta.url).href`);
      return { code: output.toString(), map: output.generateMap({ hires: true }) };
    },
  }],
  build: {
    outDir: "dist-sdk",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    minify: false,
    lib: {
      entry: { index: "src/index.ts", "audio-clip-processor": "src/audio-source/audio-clip-processor.ts" },
      formats: ["es"],
      fileName: (_format, name) => `${name}.js`,
    },
  },
});
