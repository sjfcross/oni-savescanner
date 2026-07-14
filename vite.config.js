import { defineConfig } from "vite";

// Client-side only. The ONI parser + pako bundle into a single static site;
// no server, no upload. Base is "./" so it works from any Netlify path.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1500, // the parser + encoding tables are chunky
  },
});
