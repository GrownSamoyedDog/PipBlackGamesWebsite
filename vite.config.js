import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages project site path: https://<user>.github.io/PipBlackGamesWebsite/
  base: "/PipBlackGamesWebsite/",
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
});