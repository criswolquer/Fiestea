import { defineConfig } from "vite";

// Versión en un solo paquete (todo junto) para compartir una copia de prueba como una sola página.
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
