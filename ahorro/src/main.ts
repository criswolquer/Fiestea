import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/app.css";
import "./styles/design.css";
import { route, render } from "./app/router";
import { closeFinishedMonths, getSettings, takeDueReminders } from "./data/repo";
import { toast } from "./ui/components";
import { designPage } from "./design";
import { homeScreen } from "./screens/home";
import { txFormScreen } from "./screens/txform";
import { txDetailScreen, txListScreen } from "./screens/txdetail";
import { firstStepsScreen } from "./screens/firststeps";
import { welcomeScreen } from "./screens/welcome";

route("/", homeScreen);
route("/bienvenida", welcomeScreen);
route("/primeros-pasos", firstStepsScreen);
route("/nuevo", (_, q) => txFormScreen([], q));
route("/movimiento/:id/editar", txFormScreen);
route("/movimiento/:id", txDetailScreen);
route("/movimientos", txListScreen);
route("/design", designPage);

const app = document.getElementById("app")!;

async function boot(): Promise<void> {
  const s = await getSettings();
  applyTheme(s.theme);
  window.addEventListener("hashchange", () => render(app));
  await render(app);
  if (!s.onboardedAt) return;
  // Lo que un servidor haría con tareas programadas, aquí se hace al abrir la app.
  const recaps = await closeFinishedMonths();
  for (const r of await takeDueReminders()) toast(`Recordatorio: ${r.text}`, "warning");
  if (recaps.length && (location.hash === "" || location.hash === "#/")) render(app);
}

export function applyTheme(t: "system" | "light" | "dark"): void {
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

boot();
