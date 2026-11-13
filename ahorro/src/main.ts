import "@fontsource-variable/bricolage-grotesque";   // tipografía de cifras y títulos (OFL), va dentro de la app
import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/app.css";
import "./styles/design.css";
import "./styles/polish.css";
import { route, render } from "./app/router";
import { applyTheme } from "./app/util";
import { enableCloud, startAutoSync } from "./data/cloud";
import { closeFinishedMonths, getSettings, takeDueReminders } from "./data/repo";
import { toast } from "./ui/components";
import { designPage } from "./design";
import { homeScreen } from "./screens/home";
import { txFormScreen } from "./screens/txform";
import { txDetailScreen, txListScreen } from "./screens/txdetail";
import { firstStepsScreen } from "./screens/firststeps";
import { welcomeScreen } from "./screens/welcome";
import { categoriesScreen, categoryScreen, chartsScreen, limitsScreen } from "./screens/analysis";
import { potScreen, wealthScreen } from "./screens/wealth";
import { planScreen } from "./screens/plan";
import { calendarScreen } from "./screens/calendar";
import { infoScreen, memoryScreen, recapScreen, streaksScreen } from "./screens/recap";
import { reportScreen } from "./screens/report";
import { assistantScreen } from "./screens/assistant";
import { settingsScreen } from "./screens/settings";

route("/", homeScreen);                              // S06
route("/bienvenida", welcomeScreen);                 // S01, S02
route("/primeros-pasos", firstStepsScreen);          // S04
route("/nuevo", (_, q) => txFormScreen([], q));      // S07
route("/movimiento/:id/editar", txFormScreen);       // S07 (editar)
route("/movimiento/:id", txDetailScreen);            // S08
route("/movimientos", txListScreen);                 // lista del mes
route("/graficos", chartsScreen);                    // S09
route("/categoria/:id", categoryScreen);             // S10
route("/limites", limitsScreen);                     // S11
route("/categorias", categoriesScreen);              // gestión de categorías
route("/capital", wealthScreen);                     // S12
route("/hucha/:id", potScreen);                      // S12/S13
route("/plan", planScreen);                          // S14
route("/calendario", calendarScreen);                // S15, S16
route("/asistente", assistantScreen);                // S17
route("/resumen/:mes", recapScreen);                 // S18
route("/recuerdo", memoryScreen);                    // S19
route("/rachas", streaksScreen);                     // S20
route("/informe/:mes", reportScreen);                // S21
route("/info", infoScreen);                          // S22
route("/ajustes", settingsScreen);                   // S23
route("/design", designPage);                        // sistema de diseño

const app = document.getElementById("app")!;

async function boot(): Promise<void> {
  const s = await getSettings();
  applyTheme(s.theme);
  window.addEventListener("hashchange", () => render(app));
  await render(app);
  // Guardado en la nube: enlaza el dispositivo (la primera vez) y sincroniza solo.
  startAutoSync(() => {
    const path = location.hash.replace(/^#/, "").split("?")[0];
    // No repintar mientras alguien escribe en un formulario.
    if (!/^\/(nuevo|movimiento\/[^/]+\/editar|plan|ajustes|asistente|bienvenida)/.test(path)) render(app);
  });
  if (s.onboardedAt) enableCloud().catch(() => { /* sin conexión: se reintenta al volver a abrir */ });
  if (!s.onboardedAt) return;
  // Lo que en un servidor harían tareas programadas, aquí se hace al abrir la app.
  const recaps = await closeFinishedMonths();
  for (const r of await takeDueReminders()) toast(`Recordatorio: ${r.text}`, "warning");
  if (recaps.length && (location.hash === "" || location.hash === "#/")) render(app);
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => { /* sin modo sin conexión */ }));
}

boot();
