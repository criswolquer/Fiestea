import "./style.css";
import { renderEditor } from "./editor";
import { renderLibrary } from "./library";
import { applyTheme } from "./settings";

const root = document.getElementById("app")!;
let cleanup: (() => void) | null = null;

const openNotebook = (id: string) => (location.hash = `#/n/${id}`);
const openLibrary = () => (location.hash = "#/");

async function route() {
  cleanup?.();
  cleanup = null;
  const m = /^#\/n\/([\w-]+)/.exec(location.hash);
  if (m) cleanup = await renderEditor(root, m[1], openLibrary, openNotebook);
  else await renderLibrary(root, openNotebook);
}

window.addEventListener("hashchange", route);
applyTheme();
route();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

// Ask the browser to keep notebooks even when storage runs low.
navigator.storage?.persist?.().catch(() => {});
