import "./style.css";
import { renderEditor } from "./editor";
import { renderLibrary } from "./library";
import { applyTheme } from "./settings";
import { onMemoryOnly } from "./db";
import { toast } from "./ui";

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
const embedded = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

function navigate(id: string | null) {
  view = id;
  if (!embedded) {
    try {
      location.hash = id ? `#/n/${id}` : "#/";
    } catch {
      /* hash not writable here */
    }
  }
  render();
}

const openNotebook = (id: string) => navigate(id);
const openLibrary = () => navigate(null);

async function render() {
  cleanup?.();
  cleanup = null;
  try {
    if (view) cleanup = await renderEditor(root, view, openLibrary, openNotebook);
    else await renderLibrary(root, openNotebook);
  } catch (e) {
    showError(e);
  }
}

function showError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(e);
  toast(`Algo ha fallado: ${msg}`, 6000);
}

// Surface any failure instead of leaving a button that seems to do nothing.
window.addEventListener("unhandledrejection", (e) => showError(e.reason));
window.addEventListener("error", (e) => showError(e.error ?? e.message));

onMemoryOnly(() =>
  toast("Este navegador no deja guardar datos aquí: puedes usar la app, pero los cuadernos se perderán al cerrarla.", 7000),
);

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

// Offline support. Skipped inside frames, where browsers often forbid service workers.
if (import.meta.env.PROD && !embedded) {
  try {
    if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  } catch {
    /* not allowed here */
  }
}

// Ask the browser to keep notebooks even when storage runs low.
try {
  navigator.storage?.persist?.().catch(() => {});
} catch {
  /* not allowed here */
}
