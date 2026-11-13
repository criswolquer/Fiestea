import { emptyState, button } from "../ui/components";
import { CircleAlert } from "lucide";
import { h } from "../ui/dom";
import { screen, skeleton } from "./layout";
import { errorText } from "./util";

export type Query = URLSearchParams;
export type Handler = (params: string[], q: Query) => Promise<HTMLElement> | HTMLElement;

const routes: [RegExp, Handler][] = [];
export const route = (pattern: string, handler: Handler) => {
  routes.push([new RegExp("^" + pattern.replace(/:[a-z]+/gi, "([^/]+)") + "$"), handler]);
};

let rendering = 0;
let lastPath = "";

export async function render(app: HTMLElement): Promise<void> {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  const q = new URLSearchParams(qs ?? "");
  const id = ++rendering;
  const samePage = path === lastPath;
  const slow = setTimeout(() => { if (id === rendering && !samePage) app.replaceChildren(skeleton()); }, 120);
  let el: HTMLElement;
  try {
    const hit = routes.map(([re, fn]) => [path.match(re), fn] as const).find(([m]) => m);
    el = hit ? await hit[1](hit[0]!.slice(1).map(decodeURIComponent), q) : notFound();
  } catch (e) {
    console.error(e);
    el = screen({ title: "Algo ha fallado", back: "#/" }, emptyState("No se ha podido abrir esta pantalla", errorText(e), CircleAlert,
      button("Volver al inicio", { onClick: () => { location.hash = "#/"; } })));
  }
  clearTimeout(slow);
  if (id !== rendering) return;
  const scroll = samePage ? window.scrollY : 0;
  app.replaceChildren(el);
  window.scrollTo(0, scroll);
  if (!samePage) (app.querySelector("h1") as HTMLElement | null)?.focus({ preventScroll: true });
  lastPath = path;
}

/** Vuelve a pintar la pantalla actual (tras guardar algo) sin perder el scroll. */
export const refresh = () => window.dispatchEvent(new HashChangeEvent("hashchange"));

function notFound(): HTMLElement {
  return screen({ title: "No encontrado", back: "#/" }, h("p", {}, "Esta pantalla no existe."), h("a", { href: "#/" }, "Ir al inicio"));
}
