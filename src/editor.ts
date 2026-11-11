import { askAboutRegion } from "./ai";
import { openAiHub } from "./aiviews";
import { db, uid } from "./db";
import { blankPage, exportPdf, exportPng, imageToPage, loadPages, pdfToPages } from "./files";
import { lockFlow, requestUnlock } from "./library";
import { openRecorder } from "./recorder";
import {
  TEMPLATES,
  drawItem,
  drawMask,
  drawShape,
  drawStroke,
  freeCanvas,
  hitItem,
  itemBounds,
  pageToCanvas,
  pageImagesReady,
  preloadPageImages,
  recognizeShape,
  renderPage,
} from "./render";
import { openSettings, prefs } from "./settings";
import type { ImageItem, Item, Mask, Notebook, Page, PenKind, Point, Shape, ShapeKind, Stroke, TextBox } from "./types";
import {
  closeMenus,
  confirmDialog,
  download,
  floatingPanel,
  h,
  icon,
  iconButton,
  modal,
  pickFile,
  popupMenu,
  promptDialog,
  toast,
} from "./ui";
import { markdown, openBrowser, openCalculator, openTimer } from "./widgets";

/* ------------------------------------------------------------------ */
/* Tool settings                                                       */
/* ------------------------------------------------------------------ */

type Tool = "pen" | "eraser" | "shape" | "text" | "select" | "laser" | "vanish" | "hide" | "capture" | "aipen" | "hand";

export const PENS: { id: PenKind; label: string }[] = [
  { id: "pen", label: "Bolígrafo" },
  { id: "fountain", label: "Pluma estilográfica" },
  { id: "brush", label: "Pincel" },
  { id: "pencil", label: "Lápiz" },
  { id: "highlighter", label: "Rotulador fluorescente" },
  { id: "dashed", label: "Línea discontinua" },
  { id: "dotted", label: "Línea punteada" },
  { id: "wavy", label: "Línea ondulada" },
];

const SHAPES: { id: ShapeKind; label: string }[] = [
  { id: "line", label: "Línea" },
  { id: "arrow", label: "Flecha" },
  { id: "rect", label: "Rectángulo" },
  { id: "ellipse", label: "Elipse" },
  { id: "triangle", label: "Triángulo" },
];

const COLORS = [
  "#111111", "#5b5f6b", "#ffffff", "#e5484d", "#f76b15", "#f5a524",
  "#ffe629", "#2fa36b", "#0e9aa7", "#3b6cf6", "#8e4ec6", "#d6409f",
];

const settings = {
  tool: "pen" as Tool,
  pen: "pen" as PenKind,
  color: "#111111",
  widths: { pen: 2.5, fountain: 2.5, brush: 3, pencil: 2, highlighter: 5, dashed: 2.5, dotted: 3, wavy: 2 } as Record<PenKind, number>,
  highlightColor: "#ffe629",
  shape: "rect" as ShapeKind,
  shapeDashed: false,
  autoShape: true,
  eraserSize: 12,
  textSize: 22,
  maskColor: "#f5a524",
};

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

interface TempStroke {
  stroke: Stroke;
  times: number[];
  end: number; // time the pointer was lifted (0 while drawing)
  laser: boolean;
}

interface PageView {
  page: Page;
  pane: Pane;
  wrap: HTMLDivElement;
  canvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  visible: boolean;
  renderedScale: number;
  dirty: boolean;
  temp: TempStroke[];
  preview: ((ctx: CanvasRenderingContext2D) => void) | null;
}

interface Pane {
  el: HTMLDivElement;
  content: HTMLDivElement;
  views: PageView[];
  zoom: number;
  observer: IntersectionObserver;
}

/*
 * Canvas memory budget. iOS Safari caps the total memory of all canvases and,
 * once over, silently renders blank pages, so each page canvas stays modest.
 */
const MAX_CANVAS_AREA = 6_000_000;
const MAX_SCALE = 2.5;

function backingScale(page: Page, zoom: number): number {
  const want = Math.min(MAX_SCALE, zoom * (window.devicePixelRatio || 1));
  return Math.min(want, Math.sqrt(MAX_CANVAS_AREA / (page.width * page.height)));
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

interface Snapshot {
  pageId: string;
  state: string;
}

export async function renderEditor(root: HTMLElement, notebookId: string, back: () => void, openOther: (id: string) => void): Promise<() => void> {
  const loaded = await db.notebooks.get(notebookId);
  if (!loaded) {
    back();
    return () => {};
  }
  const nb: Notebook = loaded;
  if (!(await requestUnlock(nb))) {
    back();
    return () => {};
  }
  let pages = await loadPages(nb);
  if (!pages.length) {
    const p = blankPage(nb);
    pages = [p];
    nb.pageIds = [p.id];
    await db.pages.put(p);
    await db.notebooks.put(nb);
  }

  let current = 0;
  let activeLayer = 0;
  let dimOthers = false;
  const revealed = new Set<string>();
  const undoStack: Snapshot[] = [];
  const redoStack: Snapshot[] = [];
  const dirtyPages = new Set<string>();
  let saveTimer = 0;
  let selection: { view: PageView; items: Item[] } | null = null;
  const panes: Pane[] = [];

  /* ---------- saving ---------- */

  function markDirty(page: Page) {
    page.updatedAt = Date.now();
    dirtyPages.add(page.id);
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flush, 500);
  }

  async function flush() {
    clearTimeout(saveTimer);
    const ids = [...dirtyPages];
    dirtyPages.clear();
    for (const id of ids) {
      const p = pages.find((x) => x.id === id);
      if (p) await db.pages.put(p);
    }
    nb.pageIds = pages.map((p) => p.id);
    nb.updatedAt = Date.now();
    await db.notebooks.put(nb);
  }

  async function saveNotebook() {
    nb.pageIds = pages.map((p) => p.id);
    nb.updatedAt = Date.now();
    await db.notebooks.put(nb);
  }

  /* ---------- undo ---------- */

  const snap = (p: Page) => JSON.stringify({ layers: p.layers, masks: p.masks, width: p.width, height: p.height, bgW: p.bgW, bgH: p.bgH });

  function checkpoint(page: Page) {
    undoStack.push({ pageId: page.id, state: snap(page) });
    if (undoStack.length > 150) undoStack.shift();
    redoStack.length = 0;
    updateUndoButtons();
  }

  function restore(from: Snapshot[], to: Snapshot[]) {
    const s = from.pop();
    if (!s) return;
    const page = pages.find((p) => p.id === s.pageId);
    if (!page) return restore(from, to);
    to.push({ pageId: page.id, state: snap(page) });
    const st = JSON.parse(s.state) as Pick<Page, "layers" | "masks" | "width" | "height" | "bgW" | "bgH">;
    const resized = st.width !== page.width || st.height !== page.height;
    Object.assign(page, st);
    clearSelection();
    markDirty(page);
    if (resized) relayout();
    else invalidate(page);
    scrollToPage(pages.indexOf(page), true);
    updateUndoButtons();
  }

  /* ---------- DOM ---------- */

  const titleBtn = h("button", { class: "doc-title", type: "button", title: "Renombrar" }, nb.title);
  titleBtn.addEventListener("click", async () => {
    const t = await promptDialog("Renombrar", "Título", nb.title);
    if (t?.trim()) {
      nb.title = t.trim();
      titleBtn.textContent = nb.title;
      await saveNotebook();
    }
  });
  const pageLabel = h("button", { class: "page-label", type: "button", title: "Vista de cuadrícula" });
  pageLabel.addEventListener("click", () => openGrid());

  const undoBtn = iconButton("undo", "Deshacer (Ctrl+Z)", () => restore(undoStack, redoStack));
  const redoBtn = iconButton("redo", "Rehacer (Ctrl+Mayús+Z)", () => restore(redoStack, undoStack));
  function updateUndoButtons() {
    undoBtn.disabled = !undoStack.length;
    redoBtn.disabled = !redoStack.length;
  }

  const toolButtons = new Map<Tool, HTMLButtonElement>();
  const toolBtn = (tool: Tool, ic: string, title: string) => {
    const b = iconButton(ic, title, () => {
      if (settings.tool === tool && (tool === "pen" || tool === "shape" || tool === "eraser")) {
        // Tapping the active tool again opens its options.
        optionsBar.classList.toggle("collapsed");
        return;
      }
      setTool(tool);
    }, "tool");
    toolButtons.set(tool, b);
    return b;
  };

  const optionsBar = h("div", { class: "options-bar" });
  const layerBtn = iconButton("layers", "Capas", () => layersMenu(layerBtn));
  const layerBadge = h("span", { class: "badge" }, "1");
  layerBtn.append(layerBadge);

  const top = h(
    "header",
    { class: "ed-top" },
    iconButton("back", "Biblioteca", () => back()),
    titleBtn,
    pageLabel,
    h("div", { class: "spacer" }),
    undoBtn,
    redoBtn,
    h("button", { class: "btn ai-btn", type: "button", onclick: () => flush().then(() => openAiHub(nb, pages, current)) }, icon("sparkle"), h("span", { class: "hide-sm" }, "IA")),
    iconButton("more", "Más", (e) => moreMenu(e.currentTarget as HTMLElement)),
  );

  const tools = h(
    "div",
    { class: "ed-tools" },
    h(
      "div",
      { class: "tool-group" },
      toolBtn("pen", "pen", "Pluma (P)"),
      toolBtn("eraser", "eraser", "Borrador (E)"),
      toolBtn("shape", "shape", "Formas (S)"),
      toolBtn("text", "text", "Texto (T)"),
      toolBtn("select", "cursor", "Seleccionar y mover (V)"),
      toolBtn("hand", "hand", "Desplazar (H)"),
    ),
    h("div", { class: "tool-sep" }),
    h(
      "div",
      { class: "tool-group" },
      toolBtn("vanish", "clock", "Pluma que desaparece"),
      toolBtn("laser", "laser", "Puntero láser"),
      toolBtn("hide", "hide", "Ocultar para memorizar"),
      toolBtn("capture", "camera", "Captura de pantalla"),
      toolBtn("aipen", "aipen", "Pluma IA: rodea algo y pregunta"),
    ),
    h("div", { class: "tool-sep" }),
    h(
      "div",
      { class: "tool-group" },
      layerBtn,
      iconButton("mic", "Grabación de voz", () => openRecorder(nb)),
      iconButton("calc", "Calculadora", () => openCalculator()),
      iconButton("timer", "Temporizador", () => openTimer()),
      iconButton("globe", "Navegador", () => openBrowser()),
      iconButton("pip", "Imagen en imagen", () => openPip(nb, pages, current)),
      iconButton("dual", "Páginas duales", () => toggleDual()),
      iconButton("link", "Documentos asociados", () => openLinked()),
    ),
  );

  const panesEl = h("div", { class: "panes" });
  const fab = h(
    "div",
    { class: "fab" },
    iconButton("zoomOut", "Alejar", () => zoomBy(panes[0], 1 / 1.25)),
    h("button", { class: "zoom-label", type: "button", title: "Ajustar al ancho", onclick: () => fitWidth(panes[0]) }, "100%"),
    iconButton("zoomIn", "Acercar", () => zoomBy(panes[0], 1.25)),
    h("div", { class: "tool-sep" }),
    iconButton("plus", "Añadir página", (e) => addPageMenu(e.currentTarget as HTMLElement)),
  );

  root.className = "editor";
  root.replaceChildren(top, tools, optionsBar, panesEl, fab);

  /* ---------- panes and page views ---------- */

  function createPane(): Pane {
    const el = h("div", { class: "pane" });
    const content = h("div", { class: "pane-content" });
    el.append(content);
    const pane: Pane = {
      el,
      content,
      views: [],
      zoom: 1,
      observer: new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const v = pane.views.find((x) => x.wrap === e.target);
            if (!v) continue;
            v.visible = e.isIntersecting;
            if (v.visible) ensureRendered(v);
            else releaseCanvas(v);
          }
        },
        { root: el, rootMargin: "300px 200px" },
      ),
    };
    el.addEventListener("scroll", () => {
      if (pane === panes[0]) updateCurrentFromScroll();
    }, { passive: true });
    el.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(pane, pane.zoom * Math.exp(-e.deltaY / 300), e.clientX, e.clientY);
      }
    }, { passive: false });
    attachGestures(pane);
    buildViews(pane);
    return pane;
  }

  function buildViews(pane: Pane) {
    pane.observer.disconnect();
    pane.views = pages.map((page) => {
      const canvas = h("canvas", { class: "page-canvas" });
      const overlay = h("canvas", { class: "page-overlay" });
      const wrap = h("div", { class: "page-wrap" }, canvas, overlay) as HTMLDivElement;
      const v: PageView = { page, pane, wrap, canvas, overlay, visible: false, renderedScale: 0, dirty: true, temp: [], preview: null };
      attachPointer(v);
      return v;
    });
    pane.content.replaceChildren(...pane.views.map((v) => v.wrap));
    layoutPane(pane);
    pane.views.forEach((v) => pane.observer.observe(v.wrap));
  }

  function layoutPane(pane: Pane) {
    for (const v of pane.views) {
      v.wrap.style.width = `${v.page.width * pane.zoom}px`;
      v.wrap.style.height = `${v.page.height * pane.zoom}px`;
    }
  }

  function relayout() {
    for (const pane of panes) {
      buildViews(pane);
    }
    updatePageLabel();
  }

  function ensureRendered(v: PageView) {
    if (!pageImagesReady(v.page)) {
      // Decode this page's PDF background or pictures first, then draw.
      preloadPageImages(v.page).then(() => {
        if (!v.visible) return;
        v.dirty = true;
        if (pageImagesReady(v.page)) ensureRendered(v);
      });
      if (v.canvas.width) return;
    }
    const scale = backingScale(v.page, v.pane.zoom);
    if (!v.dirty && Math.abs(v.renderedScale - scale) < 0.01 && v.canvas.width) return;
    const W = Math.round(v.page.width * scale);
    const H = Math.round(v.page.height * scale);
    if (v.canvas.width !== W || v.canvas.height !== H) {
      v.canvas.width = W;
      v.canvas.height = H;
    }
    const ctx = v.canvas.getContext("2d")!;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const hiding = new Set(selection && selection.view.page === v.page && moving ? selection.items : []);
    // Items being dragged are left out here and drawn on the overlay instead.
    const toDraw = hiding.size ? { ...v.page, layers: v.page.layers.map((l) => ({ ...l, items: l.items.filter((i) => !hiding.has(i)) })) } : v.page;
    renderPage(ctx, toDraw, { activeLayer, dimOthers, revealed });
    v.renderedScale = scale;
    v.dirty = false;
    sizeOverlay(v);
    drawOverlay(v);
  }

  function sizeOverlay(v: PageView) {
    const scale = Math.min(backingScale(v.page, v.pane.zoom), 1.5);
    const W = Math.round(v.page.width * scale);
    const H = Math.round(v.page.height * scale);
    if (v.overlay.width !== W || v.overlay.height !== H) {
      v.overlay.width = W;
      v.overlay.height = H;
    }
    v.overlay.dataset.scale = String(scale);
  }

  function releaseCanvas(v: PageView) {
    v.canvas.width = 0;
    v.canvas.height = 0;
    v.overlay.width = 0;
    v.overlay.height = 0;
    v.renderedScale = 0;
  }

  /** Re-renders every view of a page (both panes in dual mode). */
  function invalidate(page: Page) {
    for (const pane of panes)
      for (const v of pane.views)
        if (v.page === page) {
          v.dirty = true;
          if (v.visible) ensureRendered(v);
        }
  }

  function invalidateAll() {
    for (const pane of panes)
      for (const v of pane.views) {
        v.dirty = true;
        if (v.visible) ensureRendered(v);
      }
  }

  let rafPending = new Set<PageView>();
  let rafId = 0;
  function scheduleOverlay(v: PageView) {
    rafPending.add(v);
    if (!rafId)
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const list = rafPending;
        rafPending = new Set();
        list.forEach(drawOverlay);
      });
  }

  function drawOverlay(v: PageView) {
    if (!v.overlay.width) return;
    const scale = Number(v.overlay.dataset.scale || 1);
    const ctx = v.overlay.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, v.overlay.width, v.overlay.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const now = performance.now();
    let animating = false;
    v.temp = v.temp.filter((t) => {
      if (t.laser) {
        // Laser: keep the last 700 ms of the trail; fade the whole trail after lifting.
        const cutoff = (t.end || now) - 700;
        let i = 0;
        while (i < t.times.length - 1 && t.times[i] < cutoff) i++;
        const pts = t.stroke.points.slice(i);
        const alpha = t.end ? 1 - (now - t.end) / 500 : 1;
        if (alpha <= 0) return false;
        ctx.save();
        ctx.shadowColor = "#ff2d2d";
        ctx.shadowBlur = 12;
        drawStroke(ctx, { ...t.stroke, points: pts, color: "#ff3b3b", width: 4 }, alpha);
        drawStroke(ctx, { ...t.stroke, points: pts, color: "#ffffff", width: 1.3 }, alpha);
        ctx.restore();
        animating = true;
        return true;
      }
      const alpha = t.end ? 1 - Math.max(0, now - t.end - 1500) / 800 : 1;
      if (alpha <= 0) return false;
      drawStroke(ctx, t.stroke, alpha);
      if (t.end) animating = true;
      return true;
    });
    v.preview?.(ctx);
    if (selection && selection.view === v) drawSelection(ctx);
    if (animating) scheduleOverlay(v);
  }

  function drawSelection(ctx: CanvasRenderingContext2D) {
    if (!selection) return;
    const b = selectionBounds();
    if (!b) return;
    if (moving) for (const it of selection.items) drawItem(ctx, it);
    ctx.save();
    ctx.strokeStyle = "#3b6cf6";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
    ctx.restore();
  }

  function selectionBounds() {
    if (!selection || !selection.items.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of selection.items) {
      const b = itemBounds(it);
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function clearSelection() {
    if (!selection) return;
    const v = selection.view;
    selection = null;
    selectionBar.remove();
    scheduleOverlay(v);
  }

  /* ---------- zoom ---------- */

  const zoomLabel = fab.querySelector(".zoom-label")!;

  function zoomAt(pane: Pane, z: number, clientX: number, clientY: number) {
    z = Math.min(5, Math.max(0.25, z));
    if (Math.abs(z - pane.zoom) < 0.0001) return;
    const r = pane.el.getBoundingClientRect();
    const ax = clientX - r.left;
    const ay = clientY - r.top;
    // Content point under the anchor, measured relative to the content box.
    const cx = (pane.el.scrollLeft + ax - pane.content.offsetLeft) / pane.zoom;
    const cy = (pane.el.scrollTop + ay - pane.content.offsetTop) / pane.zoom;
    pane.zoom = z;
    layoutPane(pane);
    pane.el.scrollLeft = cx * z + pane.content.offsetLeft - ax;
    pane.el.scrollTop = cy * z + pane.content.offsetTop - ay;
    if (pane === panes[0]) zoomLabel.textContent = `${Math.round(z * 100)}%`;
    scheduleRerender(pane);
  }

  let rerenderTimer = 0;
  function scheduleRerender(pane: Pane) {
    clearTimeout(rerenderTimer);
    rerenderTimer = window.setTimeout(() => {
      for (const v of pane.views) if (v.visible) ensureRendered(v);
    }, 120);
  }

  function zoomBy(pane: Pane, f: number) {
    const r = pane.el.getBoundingClientRect();
    zoomAt(pane, pane.zoom * f, r.left + r.width / 2, r.top + r.height / 2);
  }

  function fitWidth(pane: Pane) {
    const avail = pane.el.clientWidth - 32;
    const w = Math.max(...pages.map((p) => p.width));
    const r = pane.el.getBoundingClientRect();
    zoomAt(pane, Math.min(1.25, avail / w), r.left + r.width / 2, r.top);
  }

  /* ---------- navigation ---------- */

  function updatePageLabel() {
    pageLabel.textContent = `${current + 1} / ${pages.length}`;
  }

  function updateCurrentFromScroll() {
    const pane = panes[0];
    const mid = pane.el.scrollTop + pane.el.clientHeight / 2;
    let best = 0;
    let bestD = Infinity;
    pane.views.forEach((v, i) => {
      const c = v.wrap.offsetTop + v.wrap.offsetHeight / 2;
      const d = Math.abs(c - mid);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best !== current) {
      current = best;
      updatePageLabel();
    }
  }

  function scrollToPage(i: number, ifNeeded = false) {
    const pane = panes[0];
    const v = pane.views[i];
    if (!v) return;
    const top = v.wrap.offsetTop - 16;
    if (ifNeeded) {
      const vis = top >= pane.el.scrollTop - v.wrap.offsetHeight && top <= pane.el.scrollTop + pane.el.clientHeight;
      if (vis) return;
    }
    pane.el.scrollTop = top;
    current = i;
    updatePageLabel();
  }

  /* ---------- pointer input ---------- */

  const activePointers = new Map<number, { x: number; y: number; type: string }>();
  let gesture: { pane: Pane; startDist: number; startZoom: number; lastMid: [number, number] } | null = null;
  let moving = false;

  /** Pan with one finger (Pencil-only mode or hand tool), with momentum. */
  let pan: { pane: Pane; last: [number, number]; vel: [number, number]; t: number } | null = null;
  let momentumId = 0;

  function attachGestures(pane: Pane) {
    // Apple Pencil on iOS: stop the stylus from scrolling the page.
    pane.el.addEventListener("touchstart", (e) => {
      if (Array.from(e.touches).some((t) => (t as Touch & { touchType?: string }).touchType === "stylus")) e.preventDefault();
    }, { passive: false });
  }

  function pageCoords(v: PageView, e: PointerEvent): Point {
    const r = v.overlay.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * v.page.width;
    const y = ((e.clientY - r.top) / r.height) * v.page.height;
    const pressure = e.pointerType === "pen" ? e.pressure || 0.5 : 0.5;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pressure * 100) / 100];
  }

  function attachPointer(v: PageView) {
    const el = v.overlay;
    let drawing: null | {
      id: number;
      onMove: (p: Point, e: PointerEvent) => void;
      onUp: (p: Point, cancelled: boolean) => void;
    } = null;

    el.addEventListener("pointerdown", (e) => {
      closeMenus();
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      cancelAnimationFrame(momentumId);

      const touches = [...activePointers.values()].filter((p) => p.type === "touch");
      if (e.pointerType === "touch" && touches.length >= 2) {
        // Second finger: abandon any stroke in progress and start pinch / pan.
        if (drawing) {
          drawing.onUp(pageCoords(v, e), true);
          drawing = null;
        }
        pan = null;
        startGesture(v.pane);
        return;
      }

      const fingerPans = e.pointerType === "touch" && prefs.pencilOnly;
      if (settings.tool === "hand" || fingerPans || (e.pointerType === "mouse" && e.button === 1)) {
        pan = { pane: v.pane, last: [e.clientX, e.clientY], vel: [0, 0], t: performance.now() };
        el.setPointerCapture(e.pointerId);
        return;
      }
      if (e.pointerType === "mouse" && e.button !== 0) return;

      el.setPointerCapture(e.pointerId);
      const handler = startTool(v, pageCoords(v, e), e);
      if (handler) drawing = { id: e.pointerId, ...handler };
    });

    el.addEventListener("pointermove", (e) => {
      const ap = activePointers.get(e.pointerId);
      if (ap) {
        ap.x = e.clientX;
        ap.y = e.clientY;
      }
      if (gesture) {
        moveGesture();
        return;
      }
      if (pan && el.hasPointerCapture(e.pointerId)) {
        const now = performance.now();
        const dx = e.clientX - pan.last[0];
        const dy = e.clientY - pan.last[1];
        pan.pane.el.scrollLeft -= dx;
        pan.pane.el.scrollTop -= dy;
        const dt = Math.max(1, now - pan.t);
        pan.vel = [0.8 * (dx / dt) + 0.2 * pan.vel[0], 0.8 * (dy / dt) + 0.2 * pan.vel[1]];
        pan.last = [e.clientX, e.clientY];
        pan.t = now;
        return;
      }
      if (!drawing || drawing.id !== e.pointerId) return;
      const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      for (const ce of events.length ? events : [e]) drawing.onMove(pageCoords(v, ce), ce);
    });

    const end = (e: PointerEvent, cancelled: boolean) => {
      activePointers.delete(e.pointerId);
      if (gesture) {
        if ([...activePointers.values()].filter((p) => p.type === "touch").length < 2) endGesture();
        return;
      }
      if (pan) {
        const p = pan;
        pan = null;
        momentum(p.pane, p.vel);
        return;
      }
      if (!drawing || drawing.id !== e.pointerId) return;
      const d = drawing;
      drawing = null;
      d.onUp(pageCoords(v, e), cancelled);
    };
    el.addEventListener("pointerup", (e) => end(e, false));
    el.addEventListener("pointercancel", (e) => end(e, true));
  }

  function momentum(pane: Pane, vel: [number, number]) {
    let [vx, vy] = vel;
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      pane.el.scrollLeft -= vx * dt;
      pane.el.scrollTop -= vy * dt;
      const decay = Math.pow(0.995, dt);
      vx *= decay;
      vy *= decay;
      if (Math.hypot(vx, vy) > 0.02) momentumId = requestAnimationFrame(step);
    };
    if (Math.hypot(vx, vy) > 0.1) momentumId = requestAnimationFrame(step);
  }

  function touchMid(): { mid: [number, number]; dist: number } {
    const t = [...activePointers.values()].filter((p) => p.type === "touch").slice(0, 2);
    return { mid: [(t[0].x + t[1].x) / 2, (t[0].y + t[1].y) / 2], dist: Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) };
  }

  function startGesture(pane: Pane) {
    const { mid, dist } = touchMid();
    gesture = { pane, startDist: dist, startZoom: pane.zoom, lastMid: mid };
  }

  function moveGesture() {
    if (!gesture) return;
    const { mid, dist } = touchMid();
    const pane = gesture.pane;
    pane.el.scrollLeft -= mid[0] - gesture.lastMid[0];
    pane.el.scrollTop -= mid[1] - gesture.lastMid[1];
    gesture.lastMid = mid;
    const z = gesture.startZoom * (dist / Math.max(1, gesture.startDist));
    if (Math.abs(z - pane.zoom) / pane.zoom > 0.01) zoomAt(pane, z, mid[0], mid[1]);
  }

  function endGesture() {
    if (!gesture) return;
    scheduleRerender(gesture.pane);
    gesture = null;
  }

  /* ---------- tools ---------- */

  type Handler = { onMove: (p: Point, e: PointerEvent) => void; onUp: (p: Point, cancelled: boolean) => void };

  function layerItems(page: Page): Item[] {
    return page.layers[activeLayer].items;
  }

  function startTool(v: PageView, p: Point, e: PointerEvent): Handler | null {
    const page = v.page;
    if (selection && settings.tool !== "select") clearSelection();
    if (!page.layers[activeLayer].visible && ["pen", "shape", "text", "eraser", "select"].includes(settings.tool)) {
      toast("La capa activa está oculta. Muéstrala en Capas para editarla.");
      return null;
    }

    // Tapping a hidden-content mask reveals it, whatever the tool (except while creating masks or erasing).
    if (settings.tool !== "hide" && settings.tool !== "eraser") {
      const m = page.masks.find((m) => p[0] >= m.x && p[0] <= m.x + m.w && p[1] >= m.y && p[1] <= m.y + m.h && !revealed.has(m.id));
      if (m) {
        revealed.add(m.id);
        invalidate(page);
        return null;
      }
    }

    switch (settings.tool) {
      case "pen":
        return penTool(v, p);
      case "vanish":
      case "laser":
        return tempTool(v, p, settings.tool === "laser");
      case "eraser":
        return eraserTool(v, p);
      case "shape":
        return rectDrag(v, p, (a, b) => {
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 4) return;
          checkpoint(page);
          layerItems(page).push(makeShape(settings.shape, a, b));
          markDirty(page);
          invalidate(page);
        }, (ctx, a, b) => drawShape(ctx, makeShape(settings.shape, a, b)));
      case "text":
        editText(v, p);
        return null;
      case "select":
        return selectTool(v, p);
      case "hide":
        return hideTool(v, p);
      case "capture":
      case "aipen":
        return rectDrag(v, p, (a, b) => {
          const r = normRect(a, b);
          if (r.w < 12 || r.h < 12) return;
          if (settings.tool === "capture") captureRegion(page, r);
          else aiPenRegion(v, r);
        }, (ctx, a, b) => {
          const r = normRect(a, b);
          ctx.save();
          ctx.fillStyle = "rgba(59,108,246,.08)";
          ctx.strokeStyle = settings.tool === "aipen" ? "#8e4ec6" : "#3b6cf6";
          ctx.setLineDash([7, 5]);
          ctx.lineWidth = 2;
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.strokeRect(r.x, r.y, r.w, r.h);
          ctx.restore();
        });
      default:
        void e;
        return null;
    }
  }

  function makeShape(kind: ShapeKind, a: Point, b: Point): Shape {
    return { id: uid(), type: "shape", shape: kind, color: settings.color, width: settings.widths.pen, dashed: settings.shapeDashed, x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
  }

  function normRect(a: Point, b: Point) {
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
  }

  function rectDrag(
    v: PageView,
    start: Point,
    done: (a: Point, b: Point) => void,
    preview: (ctx: CanvasRenderingContext2D, a: Point, b: Point) => void,
  ): Handler {
    let end = start;
    return {
      onMove(p) {
        end = p;
        v.preview = (ctx) => preview(ctx, start, end);
        scheduleOverlay(v);
      },
      onUp(p, cancelled) {
        v.preview = null;
        scheduleOverlay(v);
        if (!cancelled) done(start, p);
      },
    };
  }

  function penTool(v: PageView, p: Point): Handler {
    const page = v.page;
    const pen = settings.pen;
    const stroke: Stroke = {
      id: uid(),
      type: "stroke",
      pen,
      color: pen === "highlighter" ? settings.highlightColor : settings.color,
      width: settings.widths[pen],
      points: [p],
    };
    let snapped: Shape | null = null;
    let holdTimer = 0;
    const armHold = () => {
      clearTimeout(holdTimer);
      if (!settings.autoShape || pen === "highlighter") return;
      holdTimer = window.setTimeout(() => {
        const s = recognizeShape(stroke.points);
        if (!s) return;
        snapped = { ...s, id: uid(), color: stroke.color, width: stroke.width, dashed: pen === "dashed" || pen === "dotted" } as Shape;
        v.preview = (ctx) => drawShape(ctx, snapped!);
        scheduleOverlay(v);
        navigator.vibrate?.(10);
      }, 550);
    };
    v.preview = (ctx) => drawStroke(ctx, stroke);
    scheduleOverlay(v);
    armHold();
    return {
      onMove(pt) {
        const last = stroke.points[stroke.points.length - 1];
        const d = Math.hypot(pt[0] - last[0], pt[1] - last[1]);
        if (d < 0.6) return;
        if (snapped) {
          // Keep adjusting the snapped shape's far corner while the pen moves after snapping.
          if (snapped.shape === "line") {
            snapped.x2 = pt[0];
            snapped.y2 = pt[1];
          }
          scheduleOverlay(v);
          return;
        }
        stroke.points.push(pt);
        if (d > 3) armHold();
        scheduleOverlay(v);
      },
      onUp(_pt, cancelled) {
        clearTimeout(holdTimer);
        v.preview = null;
        scheduleOverlay(v);
        if (cancelled) return;
        checkpoint(page);
        layerItems(page).push(snapped ?? stroke);
        markDirty(page);
        // Draw just the new item instead of re-rendering the whole page.
        const added = snapped ?? stroke;
        for (const pane of panes)
          for (const view of pane.views)
            if (view.page === page && view.canvas.width && !view.dirty) {
              const ctx = view.canvas.getContext("2d")!;
              drawItem(ctx, added);
              // Masks must stay on top of ink.
              if (page.masks.length) for (const m of page.masks) drawMask(ctx, m, revealed.has(m.id));
            } else if (view.page === page) invalidate(page);
      },
    };
  }

  function tempTool(v: PageView, p: Point, laser: boolean): Handler {
    const t: TempStroke = {
      stroke: { id: uid(), type: "stroke", pen: "pen", color: settings.color, width: settings.widths.pen, points: [p] },
      times: [performance.now()],
      end: 0,
      laser,
    };
    v.temp.push(t);
    scheduleOverlay(v);
    return {
      onMove(pt) {
        t.stroke.points.push(pt);
        t.times.push(performance.now());
        scheduleOverlay(v);
      },
      onUp() {
        t.end = performance.now();
        scheduleOverlay(v);
      },
    };
  }

  function eraserTool(v: PageView, p: Point): Handler {
    const page = v.page;
    let changed = false;
    const before = snap(page);
    const r = settings.eraserSize;
    const eraseAt = (pt: Point) => {
      const items = layerItems(page);
      const keep = items.filter((it) => !hitItem(it, pt[0], pt[1], r));
      const masksKeep = page.masks.filter((m) => !(pt[0] >= m.x - r && pt[0] <= m.x + m.w + r && pt[1] >= m.y - r && pt[1] <= m.y + m.h + r));
      if (keep.length !== items.length || masksKeep.length !== page.masks.length) {
        page.layers[activeLayer].items = keep;
        page.masks = masksKeep;
        changed = true;
        invalidate(page);
      }
      v.preview = (ctx) => {
        ctx.save();
        ctx.strokeStyle = "#888";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      };
      scheduleOverlay(v);
    };
    eraseAt(p);
    return {
      onMove: eraseAt,
      onUp() {
        v.preview = null;
        scheduleOverlay(v);
        if (changed) {
          undoStack.push({ pageId: page.id, state: before });
          redoStack.length = 0;
          updateUndoButtons();
          markDirty(page);
        }
      },
    };
  }

  function hideTool(v: PageView, p: Point): Handler {
    const page = v.page;
    const hit = page.masks.find((m) => p[0] >= m.x && p[0] <= m.x + m.w && p[1] >= m.y && p[1] <= m.y + m.h);
    return rectDrag(v, p, (a, b) => {
      const r = normRect(a, b);
      if (r.w < 8 && r.h < 8) {
        // A tap toggles the mask under it.
        if (hit) {
          if (revealed.has(hit.id)) revealed.delete(hit.id);
          else revealed.add(hit.id);
          invalidate(page);
        }
        return;
      }
      checkpoint(page);
      const m: Mask = { id: uid(), ...r, color: settings.maskColor };
      page.masks.push(m);
      markDirty(page);
      invalidate(page);
    }, (ctx, a, b) => drawMask(ctx, { id: "", ...normRect(a, b), color: settings.maskColor }, false));
  }

  /* ---------- selection ---------- */

  const selectionBar = h(
    "div",
    { class: "selection-bar" },
    iconButton("copy", "Duplicar", () => duplicateSelection()),
    iconButton("pen", "Cambiar color", (e) => recolorSelection(e.currentTarget as HTMLElement)),
    iconButton("layers", "Mover a otra capa", (e) => moveSelectionLayer(e.currentTarget as HTMLElement)),
    iconButton("trash", "Eliminar", () => deleteSelection()),
  );

  function translate(it: Item, dx: number, dy: number) {
    switch (it.type) {
      case "stroke":
        for (const p of it.points) {
          p[0] += dx;
          p[1] += dy;
        }
        break;
      case "shape":
        it.x1 += dx;
        it.x2 += dx;
        it.y1 += dy;
        it.y2 += dy;
        break;
      case "text":
      case "image":
        it.x += dx;
        it.y += dy;
        break;
    }
  }

  function selectTool(v: PageView, p: Point): Handler {
    const page = v.page;
    const b = selection?.view === v ? selectionBounds() : null;
    if (selection && b && p[0] >= b.x - 10 && p[0] <= b.x + b.w + 10 && p[1] >= b.y - 10 && p[1] <= b.y + b.h + 10) {
      // Drag the current selection.
      checkpoint(page);
      moving = true;
      selectionBar.remove();
      invalidate(page);
      let last = p;
      return {
        onMove(pt) {
          translate0(pt[0] - last[0], pt[1] - last[1]);
          last = pt;
          scheduleOverlay(v);
        },
        onUp() {
          moving = false;
          markDirty(page);
          invalidate(page);
          showSelectionBar();
        },
      };
    }
    clearSelection();
    // Tap on an item selects it; drag draws a selection rectangle.
    return rectDrag(v, p, (a, b2) => {
      const r = normRect(a, b2);
      const items = layerItems(page);
      let chosen: Item[];
      if (r.w < 6 && r.h < 6) {
        const hit = [...items].reverse().find((it) => hitItem(it, a[0], a[1], 8));
        chosen = hit ? [hit] : [];
      } else {
        chosen = items.filter((it) => {
          const ib = itemBounds(it);
          return ib.x < r.x + r.w && ib.x + ib.w > r.x && ib.y < r.y + r.h && ib.y + ib.h > r.y;
        });
      }
      if (!chosen.length) return;
      selection = { view: v, items: chosen };
      scheduleOverlay(v);
      showSelectionBar();
    }, (ctx, a, b2) => {
      const r = normRect(a, b2);
      ctx.save();
      ctx.strokeStyle = "#3b6cf6";
      ctx.fillStyle = "rgba(59,108,246,.07)";
      ctx.setLineDash([6, 4]);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    });
  }

  function translate0(dx: number, dy: number) {
    if (!selection) return;
    for (const it of selection.items) translate(it, dx, dy);
  }

  function showSelectionBar() {
    document.body.append(selectionBar);
  }

  function duplicateSelection() {
    if (!selection) return;
    const page = selection.view.page;
    checkpoint(page);
    const copies = selection.items.map((it) => {
      const c = structuredClone(it);
      c.id = uid();
      translate(c, 20, 20);
      return c;
    });
    layerItems(page).push(...copies);
    selection.items = copies;
    markDirty(page);
    invalidate(page);
  }

  function deleteSelection() {
    if (!selection) return;
    const page = selection.view.page;
    checkpoint(page);
    const del = new Set(selection.items);
    page.layers[activeLayer].items = layerItems(page).filter((i) => !del.has(i));
    clearSelection();
    markDirty(page);
    invalidate(page);
  }

  function recolorSelection(anchor: HTMLElement) {
    if (!selection) return;
    popupMenu(anchor, COLORS.map((c) => ({
      label: c,
      icon: "dot",
      action: () => {
        if (!selection) return;
        const page = selection.view.page;
        checkpoint(page);
        for (const it of selection.items) if ("color" in it) it.color = c;
        markDirty(page);
        invalidate(page);
      },
    })));
  }

  function moveSelectionLayer(anchor: HTMLElement) {
    if (!selection) return;
    popupMenu(anchor, [0, 1, 2].filter((i) => i !== activeLayer).map((i) => ({
      label: `Mover a capa ${i + 1}`,
      icon: "layers",
      action: () => {
        if (!selection) return;
        const page = selection.view.page;
        checkpoint(page);
        const set = new Set(selection.items);
        page.layers[activeLayer].items = layerItems(page).filter((x) => !set.has(x));
        page.layers[i].items.push(...selection.items);
        clearSelection();
        markDirty(page);
        invalidate(page);
      },
    })));
  }

  /* ---------- text ---------- */

  function editText(v: PageView, p: Point) {
    const page = v.page;
    const existing = [...layerItems(page)].reverse().find((it): it is TextBox => it.type === "text" && hitItem(it, p[0], p[1], 4));
    const z = v.pane.zoom;
    const box: TextBox = existing ?? { id: uid(), type: "text", x: p[0], y: p[1] - settings.textSize / 2, w: Math.min(420, page.width - p[0] - 20), text: "", color: settings.color, size: settings.textSize };
    if (box.w < 80) {
      box.w = 200;
      box.x = Math.max(10, page.width - 220);
    }
    const ta = h("textarea", { class: "text-editor" });
    ta.value = box.text;
    Object.assign(ta.style, {
      left: `${box.x * z}px`,
      top: `${box.y * z}px`,
      width: `${box.w * z}px`,
      fontSize: `${box.size * z}px`,
      color: box.color,
      lineHeight: "1.3",
    });
    const autosize = () => {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight + 4}px`;
    };
    ta.addEventListener("input", autosize);
    if (existing) {
      // Hide the canvas copy while editing.
      existing.text = "";
      invalidate(page);
      existing.text = box.text;
    }
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      ta.remove();
      const text = ta.value.replace(/\s+$/, "");
      if (existing) {
        if (text === existing.text) {
          invalidate(page);
          return;
        }
        checkpoint(page);
        if (!text) page.layers[activeLayer].items = layerItems(page).filter((i) => i !== existing);
        else existing.text = text;
      } else {
        if (!text) return;
        checkpoint(page);
        layerItems(page).push({ ...box, text });
      }
      markDirty(page);
      invalidate(page);
    };
    ta.addEventListener("blur", commit);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") ta.blur();
    });
    v.wrap.append(ta);
    setTimeout(() => {
      ta.focus();
      autosize();
    }, 0);
  }

  /* ---------- capture & AI pen ---------- */

  async function cropRegion(page: Page, r: { x: number; y: number; w: number; h: number }): Promise<HTMLCanvasElement> {
    const scale = 2;
    const full = await pageToCanvas(page, scale, { revealed, hideMasks: false });
    const c = document.createElement("canvas");
    c.width = Math.round(r.w * scale);
    c.height = Math.round(r.h * scale);
    c.getContext("2d")!.drawImage(full, r.x * scale, r.y * scale, r.w * scale, r.h * scale, 0, 0, c.width, c.height);
    freeCanvas(full);
    return c;
  }

  async function captureRegion(page: Page, r: { x: number; y: number; w: number; h: number }) {
    const c = await cropRegion(page, r);
    const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
    const img = h("img", { class: "capture-preview", src: c.toDataURL("image/png"), alt: "Captura" });
    const m = modal("Captura", [
      img,
      h(
        "div",
        { class: "actions wrap" },
        h("button", { class: "btn", type: "button", onclick: async () => {
          try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            toast("Copiada al portapapeles");
          } catch {
            toast("Tu navegador no permite copiar imágenes; usa «Guardar».");
          }
        } }, icon("copy"), "Copiar"),
        h("button", { class: "btn", type: "button", onclick: () => download(blob, `captura-${Date.now()}.png`) }, icon("export"), "Guardar"),
        h("button", { class: "btn", type: "button", onclick: async () => {
          m.close();
          await insertImageBlob(blob, current, r.w, r.h);
        } }, icon("image"), "Pegar en la página actual"),
        h("button", { class: "btn primary", type: "button", onclick: () => {
          m.close();
          const v = panes[0].views.find((x) => x.page === page);
          if (v) aiPenRegion(v, r);
        } }, icon("sparkle"), "Preguntar a la IA"),
      ),
    ], { wide: true });
  }

  async function aiPenRegion(v: PageView, r: { x: number; y: number; w: number; h: number }) {
    const page = v.page;
    const c = await cropRegion(page, r);
    const q = h("input", { class: "input", placeholder: "¿Qué quieres saber? (vacío = explicar o resolver)" });
    const out = h("div", { class: "md ai-stream" });
    let answer = "";
    let ctrl: AbortController | null = null;
    const insertBtn = h("button", { class: "btn", type: "button", disabled: true, onclick: () => {
      checkpoint(page);
      const plain = answer.replace(/^#+\s*/gm, "").replace(/\*\*/g, "");
      const y = Math.min(page.height - 40, r.y + r.h + 12);
      layerItems(page).push({ id: uid(), type: "text", x: r.x, y, w: Math.max(240, Math.min(page.width - r.x - 20, 520)), text: plain, color: "#3b6cf6", size: 16 });
      markDirty(page);
      invalidate(page);
      m.close();
    } }, "Insertar en la página");
    const ask = async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      out.innerHTML = `<div class="row"><div class="spinner"></div><span>Pensando…</span></div>`;
      insertBtn.disabled = true;
      try {
        answer = await askAboutRegion(c, q.value.trim(), (s) => (out.innerHTML = markdown(s)), ctrl.signal);
        out.innerHTML = markdown(answer);
        insertBtn.disabled = false;
      } catch (e) {
        if (ctrl.signal.aborted) return;
        out.textContent = e instanceof Error ? e.message : String(e);
      }
    };
    q.addEventListener("keydown", (e) => e.key === "Enter" && ask());
    const m = modal("Pluma IA", [
      h("img", { class: "capture-preview small", src: c.toDataURL("image/png"), alt: "" }),
      h("div", { class: "row" }, q, h("button", { class: "btn primary", type: "button", onclick: ask }, "Preguntar")),
      out,
      h("div", { class: "actions" }, insertBtn),
    ], { wide: true, onClose: () => ctrl?.abort() });
    setTimeout(() => q.focus(), 30);
  }

  /* ---------- images ---------- */

  async function insertImageBlob(blob: Blob, pageIndex: number, w?: number, hgt?: number) {
    const page = pages[pageIndex];
    const blobId = uid();
    await db.blobs.put(blobId, blob);
    const bmp = await createImageBitmap(blob);
    let iw = w ?? bmp.width;
    let ih = hgt ?? bmp.height;
    const maxW = page.width * 0.7;
    if (iw > maxW) {
      ih = (ih * maxW) / iw;
      iw = maxW;
    }
    bmp.close();
    const item: ImageItem = { id: uid(), type: "image", blobId, x: (page.width - iw) / 2, y: Math.min(page.height - ih - 20, 120), w: iw, h: ih };
    await preloadPageImages({ ...page, layers: [{ visible: true, items: [item] }] });
    checkpoint(page);
    layerItems(page).push(item);
    markDirty(page);
    invalidate(page);
    scrollToPage(pageIndex, true);
    setTool("select");
    selection = { view: panes[0].views[pageIndex], items: [item] };
    scheduleOverlay(selection.view);
    showSelectionBar();
    toast("Imagen añadida: arrástrala para colocarla");
  }

  /* ---------- tool UI ---------- */

  function setTool(t: Tool) {
    settings.tool = t;
    toolButtons.forEach((b, k) => b.classList.toggle("active", k === t));
    if (t !== "select") clearSelection();
    panesEl.dataset.tool = t;
    renderOptions();
  }

  function swatchRow(get: () => string, set: (c: string) => void) {
    const custom = h("input", { type: "color", class: "swatch custom", value: get(), title: "Otro color" });
    custom.addEventListener("input", () => (set(custom.value), renderOptions()));
    return h(
      "div",
      { class: "swatches" },
      COLORS.map((c) =>
        h("button", {
          class: `swatch ${c.toLowerCase() === get().toLowerCase() ? "active" : ""}`,
          style: `background:${c}`,
          type: "button",
          "aria-label": `Color ${c}`,
          onclick: () => (set(c), renderOptions()),
        }),
      ),
      custom,
    );
  }

  function slider(label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void) {
    const val = h("span", { class: "slider-val" }, String(get()));
    const r = h("input", { type: "range", min, max, step, value: get() });
    r.addEventListener("input", () => {
      set(Number(r.value));
      val.textContent = r.value;
    });
    return h("label", { class: "slider" }, h("span", {}, label), r, val);
  }

  function renderOptions() {
    const t = settings.tool;
    optionsBar.replaceChildren();
    optionsBar.classList.remove("collapsed");
    if (t === "pen" || t === "vanish") {
      const pens = h(
        "div",
        { class: "pen-picker" },
        PENS.map((p) => {
          const c = document.createElement("canvas");
          c.width = 56;
          c.height = 24;
          const ctx = c.getContext("2d")!;
          ctx.scale(1, 1);
          const pts: Point[] = Array.from({ length: 16 }, (_, i) => [4 + i * 3.2, 12 + Math.sin(i / 2.2) * 6, 0.3 + (i / 16) * 0.6] as Point);
          drawStroke(ctx, { id: "", type: "stroke", pen: p.id, color: p.id === "highlighter" ? settings.highlightColor : settings.color, width: Math.min(3, settings.widths[p.id]), points: pts });
          return h("button", {
            class: `pen-opt ${settings.pen === p.id && t === "pen" ? "active" : ""}`,
            type: "button",
            title: p.label,
            onclick: () => {
              settings.pen = p.id;
              if (t !== "pen") setTool("pen");
              else renderOptions();
            },
          }, c);
        }),
      );
      const isHl = settings.pen === "highlighter";
      optionsBar.append(
        t === "pen" ? pens : h("span", { class: "muted small" }, "Lo que escribas desaparece a los 2 segundos."),
        isHl ? swatchRow(() => settings.highlightColor, (c) => (settings.highlightColor = c)) : swatchRow(() => settings.color, (c) => (settings.color = c)),
        slider("Grosor", 0.5, 16, 0.5, () => settings.widths[settings.pen], (v) => (settings.widths[settings.pen] = v)),
        t === "pen"
          ? h("label", { class: "check small", title: "Mantén el lápiz quieto al terminar un trazo para convertirlo en una forma perfecta" },
              (() => {
                const cb = h("input", { type: "checkbox", checked: settings.autoShape });
                cb.addEventListener("change", () => (settings.autoShape = cb.checked));
                return cb;
              })(),
              h("span", {}, "Formas automáticas"))
          : "",
      );
    } else if (t === "shape") {
      optionsBar.append(
        h("div", { class: "seg" }, SHAPES.map((s) => h("button", {
          class: `seg-btn ${settings.shape === s.id ? "active" : ""}`, type: "button",
          onclick: () => ((settings.shape = s.id), renderOptions()),
        }, s.label))),
        swatchRow(() => settings.color, (c) => (settings.color = c)),
        slider("Grosor", 0.5, 16, 0.5, () => settings.widths.pen, (v) => (settings.widths.pen = v)),
        h("label", { class: "check small" }, (() => {
          const cb = h("input", { type: "checkbox", checked: settings.shapeDashed });
          cb.addEventListener("change", () => (settings.shapeDashed = cb.checked));
          return cb;
        })(), h("span", {}, "Discontinua")),
      );
    } else if (t === "eraser") {
      optionsBar.append(
        slider("Tamaño", 4, 60, 1, () => settings.eraserSize, (v) => (settings.eraserSize = v)),
        h("span", { class: "muted small" }, `Borra trazos enteros de la capa ${activeLayer + 1}.`),
        h("button", { class: "btn small", type: "button", onclick: async () => {
          const page = pages[current];
          if (!(await confirmDialog("Borrar página", `¿Borrar todo lo escrito en la capa ${activeLayer + 1} de la página ${current + 1}?`, "Borrar", true))) return;
          checkpoint(page);
          page.layers[activeLayer].items = [];
          markDirty(page);
          invalidate(page);
        } }, "Borrar capa de esta página"),
      );
    } else if (t === "text") {
      optionsBar.append(
        swatchRow(() => settings.color, (c) => (settings.color = c)),
        slider("Tamaño", 10, 64, 1, () => settings.textSize, (v) => (settings.textSize = v)),
        h("span", { class: "muted small" }, "Toca la página para escribir; toca un texto para editarlo."),
      );
    } else if (t === "hide") {
      optionsBar.append(
        h("span", { class: "muted small" }, "Dibuja un rectángulo para tapar contenido. Toca una zona tapada para verla u ocultarla."),
        swatchRow(() => settings.maskColor, (c) => (settings.maskColor = c)),
        h("button", { class: "btn small", type: "button", onclick: () => {
          pages.forEach((p) => p.masks.forEach((m) => revealed.add(m.id)));
          invalidateAll();
        } }, "Mostrar todo"),
        h("button", { class: "btn small", type: "button", onclick: () => {
          revealed.clear();
          invalidateAll();
        } }, "Ocultar todo"),
      );
    } else if (t === "laser") {
      optionsBar.append(h("span", { class: "muted small" }, "Señala sin dejar marca: ideal para presentar o explicar."));
    } else if (t === "capture") {
      optionsBar.append(h("span", { class: "muted small" }, "Arrastra para capturar una parte de la página."));
    } else if (t === "aipen") {
      optionsBar.append(h("span", { class: "muted small" }, "Rodea un ejercicio, una fórmula o un párrafo y pregunta a la IA."));
    } else if (t === "select") {
      optionsBar.append(h("span", { class: "muted small" }, `Arrastra para seleccionar en la capa ${activeLayer + 1}; arrastra la selección para moverla.`));
    } else if (t === "hand") {
      optionsBar.append(h("span", { class: "muted small" }, "Arrastra para desplazarte. Pellizca con dos dedos para hacer zoom."));
    }
  }

  /* ---------- layers ---------- */

  function layersMenu(anchor: HTMLElement) {
    const page = pages[current];
    const rows = [0, 1, 2].map((i) => {
      const layer = page.layers[i];
      const eye = h("button", { class: `icon-btn small ${layer.visible ? "" : "off"}`, type: "button", title: layer.visible ? "Ocultar capa" : "Mostrar capa", onclick: (e: Event) => {
        e.stopPropagation();
        // Visibility applies to the same layer on every page.
        const vis = !layer.visible;
        pages.forEach((p) => {
          p.layers[i].visible = vis;
          markDirty(p);
        });
        invalidateAll();
        layersMenu(anchor);
      } }, icon(layer.visible ? "eye" : "hide"));
      return h("div", { class: `layer-row ${i === activeLayer ? "active" : ""}` },
        h("button", { class: "layer-pick", type: "button", onclick: () => {
          activeLayer = i;
          layerBadge.textContent = String(i + 1);
          clearSelection();
          if (dimOthers) invalidateAll();
          renderOptions();
          layersMenu(anchor);
        } }, h("strong", {}, `Capa ${i + 1}`), h("span", { class: "muted small" }, `${layer.items.length} elementos`)),
        eye,
        iconButton("trash", "Vaciar esta capa en la página actual", async () => {
          if (!(await confirmDialog("Vaciar capa", `¿Borrar la capa ${i + 1} de la página ${current + 1}?`, "Vaciar", true))) return;
          checkpoint(page);
          page.layers[i].items = [];
          markDirty(page);
          invalidate(page);
          layersMenu(anchor);
        }, "small"),
      );
    });
    const dim = h("input", { type: "checkbox", checked: dimOthers });
    dim.addEventListener("change", () => {
      dimOthers = dim.checked;
      invalidateAll();
    });
    closeMenus();
    const menu = h("div", { class: "menu layers-menu" },
      h("p", { class: "muted small" }, "Usa una capa para el enunciado y otra para tus intentos: vacía la de intentos y vuelve a resolverlo."),
      rows,
      h("label", { class: "check small" }, dim, h("span", {}, "Atenuar las demás capas")),
    );
    document.body.append(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${r.bottom + 6}px`;
    const outside = (e: PointerEvent) => {
      if (!menu.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener("pointerdown", outside);
      }
    };
    setTimeout(() => document.addEventListener("pointerdown", outside), 0);
  }

  /* ---------- pages ---------- */

  async function insertPages(newPages: Page[], at: number) {
    for (const p of newPages) {
      await preloadPageImages(p);
      await db.pages.put(p);
    }
    pages.splice(at, 0, ...newPages);
    await saveNotebook();
    relayout();
    scrollToPage(at);
  }

  function addPageMenu(anchor: HTMLElement) {
    const cur = pages[current];
    popupMenu(anchor, [
      { label: "Página igual después de esta", icon: "plus", action: () => {
        const p = blankPage(nb, cur.backgroundBlobId ? nb.template : cur.template, cur.paper);
        if (!cur.backgroundBlobId) {
          p.width = cur.width;
          p.height = cur.height;
        }
        insertPages([p], current + 1);
      } },
      { label: "Página al final", icon: "plus", action: () => insertPages([blankPage(nb)], pages.length) },
      ...TEMPLATES.map((t) => ({ label: `Nueva: ${t.label}`, icon: "book", action: () => insertPages([blankPage(nb, t.id)], current + 1) })),
      "sep",
      { label: "Importar PDF o imágenes aquí", icon: "import", action: () => importInto(current + 1) },
    ]);
  }

  async function importInto(at: number) {
    const files = await pickFile("application/pdf,image/*", true);
    if (!files.length) return;
    const progress = h("p", {}, "Importando…");
    const m = modal("Importando", progress);
    try {
      const added: Page[] = [];
      for (const f of files) {
        if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
          added.push(...(await pdfToPages(f, nb, (d, t) => (progress.textContent = `${f.name}: página ${d} de ${t}`))));
        else if (f.type.startsWith("image/")) added.push(await imageToPage(f, nb));
      }
      m.close();
      if (added.length) await insertPages(added, at);
    } catch (e) {
      m.close();
      toast(e instanceof Error ? e.message : "No se pudo importar");
    }
  }

  async function deletePage(i: number) {
    if (pages.length === 1) return toast("El cuaderno necesita al menos una página.");
    if (!(await confirmDialog("Eliminar página", `¿Eliminar la página ${i + 1}?`, "Eliminar", true))) return;
    const [p] = pages.splice(i, 1);
    await db.pages.delete(p.id);
    if (p.backgroundBlobId) await db.blobs.delete(p.backgroundBlobId);
    undoStack.splice(0, undoStack.length, ...undoStack.filter((s) => s.pageId !== p.id));
    current = Math.min(current, pages.length - 1);
    await saveNotebook();
    relayout();
    updateUndoButtons();
  }

  async function duplicatePage(i: number) {
    const src = pages[i];
    const copy: Page = { ...structuredClone(src), id: uid(), updatedAt: Date.now() };
    if (src.backgroundBlobId) {
      const b = await db.blobs.get(src.backgroundBlobId);
      if (b) {
        copy.backgroundBlobId = uid();
        await db.blobs.put(copy.backgroundBlobId, b);
      }
    }
    await insertPages([copy], i + 1);
  }

  async function movePage(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= pages.length) return;
    [pages[i], pages[j]] = [pages[j], pages[i]];
    await saveNotebook();
    relayout();
  }

  function enlargePage(i: number, how: "down" | "right") {
    const page = pages[i];
    checkpoint(page);
    if (page.backgroundBlobId) {
      page.bgW ??= page.width;
      page.bgH ??= page.height;
    }
    if (how === "down") page.height += 400;
    else page.width += 300;
    markDirty(page);
    relayout();
    scrollToPage(i, true);
    toast(how === "down" ? "Página ampliada hacia abajo" : "Margen ampliado a la derecha");
  }

  function openGrid() {
    const grid = h("div", { class: "page-grid" });
    const m = modal(`${nb.title} · ${pages.length} páginas`, grid, { wide: true });
    pages.forEach(async (p, i) => {
      const thumb = h("button", { class: "page-thumb", type: "button", onclick: () => {
        m.close();
        scrollToPage(i);
      } });
      const more = iconButton("more", "Opciones", (e) => {
        e.stopPropagation();
        popupMenu(more, [
          { label: "Duplicar", icon: "copy", action: () => (m.close(), duplicatePage(i)) },
          { label: "Mover antes", icon: "back", action: () => (m.close(), movePage(i, -1)) },
          { label: "Mover después", icon: "redo", action: () => (m.close(), movePage(i, 1)) },
          { label: "Exportar como imagen", icon: "image", action: async () => download(await exportPng(p), `${nb.title}-p${i + 1}.png`) },
          "sep",
          { label: "Eliminar", icon: "trash", danger: true, action: () => (m.close(), deletePage(i)) },
        ]);
      }, "small");
      const cell = h("div", { class: `page-cell ${i === current ? "active" : ""}` }, thumb, h("div", { class: "row between" }, h("span", { class: "small" }, String(i + 1)), more));
      grid.append(cell);
      const c = await pageToCanvas(p, 150 / p.width, { revealed });
      thumb.append(c);
    });
  }

  /* ---------- panels ---------- */

  function toggleDual() {
    if (panes.length === 2) {
      const p = panes.pop()!;
      p.observer.disconnect();
      p.el.remove();
      panesEl.classList.remove("dual");
      setTimeout(() => fitWidth(panes[0]), 0);
      return;
    }
    const p = createPane();
    panes.push(p);
    panesEl.append(p.el);
    panesEl.classList.add("dual");
    setTimeout(() => {
      fitWidth(panes[0]);
      fitWidth(p);
      p.el.scrollTop = panes[0].el.scrollTop;
    }, 0);
    toast("Páginas duales: desplaza cada lado por separado.");
  }

  async function openLinked() {
    const all = (await db.notebooks.all()).filter((n) => n.id !== nb.id);
    const list = h("div", { class: "list" });
    const draw = () => {
      list.replaceChildren();
      const linked = all.filter((n) => nb.linkedIds.includes(n.id));
      if (!linked.length) list.append(h("p", { class: "muted small" }, "No hay documentos asociados. Añade apuntes, PDFs o ejercicios relacionados para tenerlos a mano."));
      for (const n of linked)
        list.append(h("div", { class: "list-item" },
          icon("book"),
          h("span", { class: "grow" }, n.title),
          h("button", { class: "btn small", type: "button", onclick: async () => {
            if (!(await requestUnlock(n))) return;
            m.close();
            openPip(n, await loadPages(n), 0);
          } }, "Ver al lado"),
          h("button", { class: "btn small", type: "button", onclick: async () => {
            m.close();
            await flush();
            openOther(n.id);
          } }, "Abrir"),
          iconButton("close", "Quitar", async () => {
            nb.linkedIds = nb.linkedIds.filter((x) => x !== n.id);
            await saveNotebook();
            draw();
          }, "small"),
        ));
    };
    const add = h("select", { class: "input" }, h("option", { value: "" }, "Añadir documento…"), all.filter((n) => !nb.linkedIds.includes(n.id)).map((n) => h("option", { value: n.id }, n.title)));
    add.addEventListener("change", async () => {
      if (!add.value) return;
      nb.linkedIds.push(add.value);
      add.querySelector(`option[value="${add.value}"]`)?.remove();
      add.value = "";
      await saveNotebook();
      draw();
    });
    const m = modal("Documentos asociados", [list, add]);
    draw();
  }

  /* ---------- more menu ---------- */

  function moreMenu(anchor: HTMLElement) {
    popupMenu(anchor, [
      { label: "Vista de cuadrícula", icon: "grid", action: () => openGrid() },
      { label: "Insertar imagen", icon: "image", action: async () => {
        const [f] = await pickFile("image/*");
        if (f) insertImageBlob(f, current);
      } },
      { label: "Importar PDF o imágenes", icon: "import", action: () => importInto(current + 1) },
      { label: "Ampliar página hacia abajo", icon: "margin", action: () => enlargePage(current, "down") },
      { label: "Ampliar margen derecho", icon: "margin", action: () => enlargePage(current, "right") },
      { label: "Cambiar plantilla de la página", icon: "book", action: () => templateMenu(anchor) },
      "sep",
      { label: "Exportar PDF", icon: "export", action: async () => {
        await flush();
        toast("Generando PDF…");
        download(await exportPdf(nb, pages), `${nb.title}.pdf`);
      } },
      { label: "Exportar página como imagen", icon: "image", action: async () => download(await exportPng(pages[current]), `${nb.title}-p${current + 1}.png`) },
      { label: nb.lock ? "Quitar contraseña" : "Proteger con contraseña", icon: "lock", action: () => lockFlow(nb, () => {}) },
      { label: "Eliminar esta página", icon: "trash", danger: true, action: () => deletePage(current) },
      "sep",
      { label: "Ajustes", icon: "settings", action: () => openSettings() },
    ]);
  }

  function templateMenu(anchor: HTMLElement) {
    const page = pages[current];
    if (page.backgroundBlobId) return toast("Esta página es un PDF o una imagen importada.");
    popupMenu(anchor, TEMPLATES.map((t) => ({
      label: t.label,
      icon: "book",
      checked: page.template === t.id,
      action: () => {
        page.template = t.id;
        markDirty(page);
        invalidate(page);
      },
    })));
  }

  /* ---------- keyboard ---------- */

  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) restore(redoStack, undoStack);
      else restore(undoStack, redoStack);
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      restore(redoStack, undoStack);
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selection) {
      e.preventDefault();
      deleteSelection();
      return;
    }
    if (mod) return;
    const map: Record<string, Tool> = { p: "pen", e: "eraser", s: "shape", t: "text", v: "select", h: "hand", l: "laser" };
    const t = map[e.key.toLowerCase()];
    if (t) setTool(t);
    if (e.key === "+" || e.key === "=") zoomBy(panes[0], 1.25);
    if (e.key === "-") zoomBy(panes[0], 0.8);
  };
  document.addEventListener("keydown", onKey);

  const onPaste = async (e: ClipboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest?.("input, textarea")) return;
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      insertImageBlob(file, current);
    }
  };
  document.addEventListener("paste", onPaste);

  const onHide = () => {
    if (document.visibilityState === "hidden") flush();
  };
  document.addEventListener("visibilitychange", onHide);

  /* ---------- start ---------- */

  const first = createPane();
  panes.push(first);
  panesEl.append(first.el);
  // Always open a notebook ready to write.
  setTool(["pen", "eraser", "shape", "text"].includes(settings.tool) ? settings.tool : "pen");
  updatePageLabel();
  updateUndoButtons();
  requestAnimationFrame(() => fitWidth(first));

  return () => {
    flush();
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("paste", onPaste);
    document.removeEventListener("visibilitychange", onHide);
    selectionBar.remove();
    panes.forEach((p) => p.observer.disconnect());
    closeMenus();
    document.querySelectorAll(".float-panel, .layers-menu").forEach((el) => el.remove());
  };
}

/* ------------------------------------------------------------------ */
/* Picture-in-picture: a magnified, movable view of any page           */
/* ------------------------------------------------------------------ */

export function openPip(nb: Notebook, pages: Page[], start: number): void {
  let index = Math.min(start, pages.length - 1);
  let zoom = 1;
  const view = h("div", { class: "pip-view" });
  const label = h("span", { class: "small" });
  const draw = async () => {
    const p = pages[index];
    label.textContent = `${index + 1} / ${pages.length}`;
    const c = await pageToCanvas(p, Math.min(2.5, 1.5 * zoom), { hideMasks: true });
    c.style.width = `${p.width * 0.5 * zoom}px`;
    view.replaceChildren(c);
  };
  const bar = h(
    "div",
    { class: "row between" },
    h("div", { class: "row" },
      iconButton("back", "Anterior", () => index > 0 && (index--, draw()), "small"),
      label,
      iconButton("redo", "Siguiente", () => index < pages.length - 1 && (index++, draw()), "small"),
    ),
    h("div", { class: "row" },
      iconButton("zoomOut", "Alejar", () => ((zoom = Math.max(0.5, zoom / 1.25)), draw()), "small"),
      iconButton("zoomIn", "Acercar", () => ((zoom = Math.min(4, zoom * 1.25)), draw()), "small"),
    ),
  );
  floatingPanel(`Imagen en imagen · ${nb.title}`, h("div", { class: "pip" }, bar, view), { width: Math.min(420, window.innerWidth - 16), x: 8, y: 120 });
  draw();
}
