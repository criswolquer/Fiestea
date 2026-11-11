import { defineConfig } from "vite";

// Single-file build (everything inlined) used to share a test copy of the app as one HTML page.
export default defineConfig({
  base: "./",
  publicDir: false,
  build: {
    target: "es2022",
    outDir: "dist-single",
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 10000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
