import { defineConfig, devices } from "@playwright/test";

// Pruebas de punta a punta: construyen la app y la recorren en Chromium a tamaño móvil.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "line",
  use: {
    baseURL: "http://localhost:4174/",
    ...devices["Pixel 7"],
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    serviceWorkers: "block",
    trace: "off",
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4174 --strictPort",
    url: "http://localhost:4174/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
