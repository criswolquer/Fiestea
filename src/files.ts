import { db, uid } from "./db";
import { pageToCanvas } from "./render";
import type { AiResult, Folder, Notebook, Page, PageSizeId, PaperColor, Recording, TemplateId } from "./types";
import { LAYER_COUNT, PAGE_SIZES } from "./types";

/* ---------- new pages ---------- */

export function blankPage(nb: Pick<Notebook, "id" | "template" | "paper" | "pageSize">, template?: TemplateId, paper?: PaperColor): Page {
  const size = PAGE_SIZES[nb.pageSize];
  return {
    id: uid(),
    notebookId: nb.id,
    width: size.w,
    height: size.h,
    template: template ?? nb.template,
    paper: paper ?? nb.paper,
    layers: Array.from({ length: LAYER_COUNT }, () => ({ visible: true, items: [] })),
    masks: [],
    updatedAt: Date.now(),
  };
}

export async function createNotebook(opts: {
  title: string;
  cover: string;
  template: TemplateId;
  paper: PaperColor;
  pageSize: PageSizeId;
  folderId: string | null;
}): Promise<Notebook> {
  const now = Date.now();
  const nb: Notebook = { id: uid(), ...opts, favorite: false, pageIds: [], linkedIds: [], lock: null, createdAt: now, updatedAt: now };
  const first = blankPage(nb);
  nb.pageIds.push(first.id);
  await db.pages.put(first);
  await db.notebooks.put(nb);
  return nb;
}

export async function loadPages(nb: Notebook): Promise<Page[]> {
  const all = await db.pages.ofNotebook(nb.id);
  const byId = new Map(all.map((p) => [p.id, p]));
  return nb.pageIds.map((id) => byId.get(id)).filter((p): p is Page => !!p);
}

/* ---------- import ---------- */

async function canvasToBlob(c: HTMLCanvasElement, type = "image/jpeg", q = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), type, q));
}

/** Converts each PDF page into a notebook page with the PDF page as its background. */
export async function pdfToPages(
  file: File,
  nb: Notebook,
  onProgress?: (done: number, total: number) => void,
): Promise<Page[]> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: Page[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pdfPage = await doc.getPage(n);
    const base = pdfPage.getViewport({ scale: 1 });
    // Page coordinates: 794 px wide like A4; render the background at 2x for sharpness.
    const width = 794;
    const height = Math.round((base.height / base.width) * width);
    const viewport = pdfPage.getViewport({ scale: (width / base.width) * 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blobId = uid();
    await db.blobs.put(blobId, await canvasToBlob(canvas));
    const page = blankPage(nb, "blank", "white");
    page.width = width;
    page.height = height;
    page.backgroundBlobId = blobId;
    pages.push(page);
    onProgress?.(n, doc.numPages);
  }
  await task.destroy();
  return pages;
}

export async function imageToPage(file: Blob, nb: Notebook): Promise<Page> {
  const bmp = await createImageBitmap(file);
  const width = 794;
  const height = Math.round((bmp.height / bmp.width) * width);
  bmp.close();
  const blobId = uid();
  await db.blobs.put(blobId, file);
  const page = blankPage(nb, "blank", "white");
  page.width = width;
  page.height = height;
  page.backgroundBlobId = blobId;
  return page;
}

/* ---------- export ---------- */

export async function exportPdf(nb: Notebook, pages: Page[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (const p of pages) {
    const c = await pageToCanvas(p, 2, { hideMasks: true });
    const orientation = p.width > p.height ? "l" : "p";
    if (!pdf) pdf = new jsPDF({ unit: "px", format: [p.width, p.height], orientation, hotfixes: ["px_scaling"] });
    else pdf.addPage([p.width, p.height], orientation);
    pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, p.width, p.height);
  }
  if (!pdf) throw new Error("El cuaderno no tiene páginas.");
  pdf.setProperties({ title: nb.title });
  return pdf.output("blob");
}

export async function exportPng(p: Page): Promise<Blob> {
  return canvasToBlob(await pageToCanvas(p, 2, { hideMasks: true }), "image/png");
}

/* ---------- full backup (move notes between devices) ---------- */

async function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

interface Backup {
  app: "trazo";
  version: 1;
  exportedAt: number;
  folders: Folder[];
  notebooks: Notebook[];
  pages: Page[];
  recordings: Recording[];
  ai: AiResult[];
  blobs: Record<string, string>;
}

export async function exportBackup(): Promise<Blob> {
  const folders = await db.folders.all();
  const notebooks = await db.notebooks.all();
  const pages: Page[] = [];
  const recordings: Recording[] = [];
  const ai: AiResult[] = [];
  const blobIds = new Set<string>();
  for (const nb of notebooks) {
    for (const p of await db.pages.ofNotebook(nb.id)) {
      pages.push(p);
      if (p.backgroundBlobId) blobIds.add(p.backgroundBlobId);
      for (const l of p.layers) for (const it of l.items) if (it.type === "image") blobIds.add(it.blobId);
    }
    for (const r of await db.recordings.ofNotebook(nb.id)) {
      recordings.push(r);
      blobIds.add(r.blobId);
    }
    ai.push(...(await db.ai.ofNotebook(nb.id)));
  }
  const blobs: Record<string, string> = {};
  for (const id of blobIds) {
    const b = await db.blobs.get(id);
    if (b) blobs[id] = await blobToDataUrl(b);
  }
  const backup: Backup = { app: "trazo", version: 1, exportedAt: Date.now(), folders, notebooks, pages, recordings, ai, blobs };
  return new Blob([JSON.stringify(backup)], { type: "application/json" });
}

/** Restores a backup. Items whose id already exists are replaced. Returns the number of notebooks. */
export async function importBackup(file: File): Promise<number> {
  const data = JSON.parse(await file.text()) as Backup;
  if (data.app !== "trazo" || !Array.isArray(data.notebooks)) throw new Error("Este archivo no es una copia de seguridad de Trazo.");
  for (const [id, url] of Object.entries(data.blobs ?? {})) await db.blobs.put(id, await (await fetch(url)).blob());
  for (const f of data.folders ?? []) await db.folders.put(f);
  for (const p of data.pages ?? []) await db.pages.put(p);
  for (const r of data.recordings ?? []) await db.recordings.put(r);
  for (const a of data.ai ?? []) await db.ai.put(a);
  for (const n of data.notebooks) await db.notebooks.put(n);
  return data.notebooks.length;
}

export async function duplicateNotebook(nb: Notebook): Promise<Notebook> {
  const pages = await loadPages(nb);
  const now = Date.now();
  const copy: Notebook = { ...structuredClone(nb), id: uid(), title: `${nb.title} (copia)`, pageIds: [], createdAt: now, updatedAt: now, favorite: false };
  for (const p of pages) {
    const np: Page = { ...structuredClone(p), id: uid(), notebookId: copy.id };
    if (p.backgroundBlobId) {
      const b = await db.blobs.get(p.backgroundBlobId);
      if (b) {
        np.backgroundBlobId = uid();
        await db.blobs.put(np.backgroundBlobId, b);
      }
    }
    for (const l of np.layers)
      for (const it of l.items)
        if (it.type === "image") {
          const b = await db.blobs.get(it.blobId);
          if (b) {
            it.blobId = uid();
            await db.blobs.put(it.blobId, b);
          }
        }
    copy.pageIds.push(np.id);
    await db.pages.put(np);
  }
  await db.notebooks.put(copy);
  return copy;
}
