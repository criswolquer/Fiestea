import "./style.css";
import { renderEditor } from "./editor";
import { renderLibrary } from "./library";
import { applyTheme } from "./settings";

const root = document.getElementById("app")!;
let cleanup: (() => void) | null = null;

/** The open notebook id, or null for the library. */
let view: string | null = null;

function fromHash(): string | null {
  return /^#\/n\/([\w-]+)/.exec(location.hash)?.[1] ?? null;
}

/*
 * Navigation renders directly and mirrors the view in the URL hash, so the
 * browser's back button works where the hash is available, and the app still
 * works where it is not (for example inside an embedded preview).
 */
function navigate(id: string | null) {
  view = id;
  try {
    location.hash = id ? `#/n/${id}` : "#/";
  } catch {
    /* hash not writable here */
  }
  render();
}

const openNotebook = (id: string) => navigate(id);
const openLibrary = () => navigate(null);

async function render() {
  cleanup?.();
  cleanup = null;
  if (view) cleanup = await renderEditor(root, view, openLibrary, openNotebook);
  else await renderLibrary(root, openNotebook);
}

window.addEventListener("hashchange", () => {
  const id = fromHash();
  if (id !== view) {
    view = id;
    render();
  }
});
applyTheme();
view = fromHash();
render();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

// Ask the browser to keep notebooks even when storage runs low.
navigator.storage?.persist?.().catch(() => {});
