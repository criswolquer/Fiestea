import { db, deleteNotebookDeep, uid } from "./db";
import { createNotebook, duplicateNotebook, exportPdf, imageToPage, loadPages, pdfToPages } from "./files";
import { checkLock, makeLock, unlocked } from "./lock";
import { PAPER, TEMPLATES, drawPaper, pageToCanvas } from "./render";
import { openSettings } from "./settings";
import type { Folder, Notebook, PageSizeId, PaperColor, TemplateId } from "./types";
import { PAGE_SIZES } from "./types";
import { confirmDialog, download, formatDate, h, icon, iconButton, modal, pickFile, popupMenu, promptDialog, toast } from "./ui";
import { blankPage } from "./files";

export const COVERS = ["#3b6cf6", "#e5484d", "#f5a524", "#2fa36b", "#8e4ec6", "#0e9aa7", "#d6409f", "#5b5f6b", "#c2763a", "#1d2b53"];

type Filter = { kind: "all" } | { kind: "favorites" } | { kind: "recent" } | { kind: "folder"; id: string } | { kind: "unfiled" };

let filter: Filter = { kind: "all" };
let search = "";
let sort: "updated" | "title" | "created" = "updated";

const thumbCache = new Map<string, string>();

async function thumbnail(nb: Notebook): Promise<string | null> {
  const firstId = nb.pageIds[0];
  if (!firstId) return null;
  const page = await db.pages.get(firstId);
  if (!page) return null;
  const key = `${page.id}:${page.updatedAt}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const c = await pageToCanvas(page, 260 / page.width, { hideMasks: false });
  const url = c.toDataURL("image/jpeg", 0.8);
  thumbCache.set(key, url);
  return url;
}

export async function requestUnlock(nb: Notebook): Promise<boolean> {
  if (!nb.lock || unlocked.has(nb.id)) return true;
  const pw = await promptDialog(`«${nb.title}» está protegido`, "Contraseña", "", { type: "password", okLabel: "Abrir" });
  if (pw === null) return false;
  if (await checkLock(nb.lock, pw)) {
    unlocked.add(nb.id);
    return true;
  }
  toast("Contraseña incorrecta");
  return false;
}

export async function renderLibrary(root: HTMLElement, open: (id: string) => void): Promise<void> {
  const [notebooks, folders] = await Promise.all([db.notebooks.all(), db.folders.all()]);
  folders.sort((a, b) => a.name.localeCompare(b.name));
  const rerender = () => renderLibrary(root, open);

  if (filter.kind === "folder" && !folders.some((f) => f.id === (filter as { id: string }).id)) filter = { kind: "all" };

  /* ---------- sidebar ---------- */
  const navItem = (label: string, ic: string, f: Filter, count: number) => {
    const active = JSON.stringify(f) === JSON.stringify(filter);
    return h(
      "button",
      { class: `nav-item ${active ? "active" : ""}`, type: "button", onclick: () => ((filter = f), rerender()) },
      icon(ic),
      h("span", {}, label),
      h("span", { class: "count" }, String(count)),
    );
  };

  const folderItems = folders.map((f) => {
    const item = navItem(f.name, "folder", { kind: "folder", id: f.id }, notebooks.filter((n) => n.folderId === f.id).length);
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      folderMenu(item, f);
    });
    const more = iconButton("more", "Opciones de carpeta", (e) => {
      e.stopPropagation();
      folderMenu(more, f);
    }, "small ghost");
    item.append(more);
    return item;
  });

  function folderMenu(anchor: HTMLElement, f: Folder) {
    popupMenu(anchor, [
      {
        label: "Renombrar",
        icon: "text",
        action: async () => {
          const name = await promptDialog("Renombrar carpeta", "Nombre", f.name);
          if (name?.trim()) {
            await db.folders.put({ ...f, name: name.trim() });
            rerender();
          }
        },
      },
      {
        label: "Eliminar carpeta",
        icon: "trash",
        danger: true,
        action: async () => {
          if (!(await confirmDialog("Eliminar carpeta", `Los cuadernos de «${f.name}» no se borran: pasan a «Sin carpeta».`, "Eliminar", true))) return;
          for (const n of notebooks.filter((n) => n.folderId === f.id)) await db.notebooks.put({ ...n, folderId: null });
          await db.folders.delete(f.id);
          rerender();
        },
      },
    ]);
  }

  const sidebar = h(
    "aside",
    { class: "sidebar" },
    h("div", { class: "brand" }, h("img", { src: "icon.svg", alt: "" }), h("span", {}, "Trazo")),
    navItem("Todos", "book", { kind: "all" }, notebooks.length),
    navItem("Favoritos", "star", { kind: "favorites" }, notebooks.filter((n) => n.favorite).length),
    navItem("Recientes", "clock", { kind: "recent" }, Math.min(8, notebooks.length)),
    navItem("Sin carpeta", "folder", { kind: "unfiled" }, notebooks.filter((n) => !n.folderId).length),
    h("div", { class: "nav-title" }, h("span", {}, "Carpetas"), iconButton("plus", "Nueva carpeta", async () => {
      const name = await promptDialog("Nueva carpeta", "Nombre");
      if (name?.trim()) {
        await db.folders.put({ id: uid(), name: name.trim(), createdAt: Date.now() });
        rerender();
      }
    }, "small ghost")),
    folderItems,
    h("div", { class: "spacer" }),
    h("button", { class: "nav-item", type: "button", onclick: () => openSettings(rerender) }, icon("settings"), h("span", {}, "Ajustes")),
  );

  /* ---------- list ---------- */
  let list = notebooks.slice();
  if (filter.kind === "favorites") list = list.filter((n) => n.favorite);
  if (filter.kind === "folder") list = list.filter((n) => n.folderId === (filter as { id: string }).id);
  if (filter.kind === "unfiled") list = list.filter((n) => !n.folderId);
  if (search) list = list.filter((n) => n.title.toLowerCase().includes(search.toLowerCase()));
  list.sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title) : sort === "created" ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt));
  if (filter.kind === "recent") list = list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);

  const title =
    filter.kind === "all" ? "Todos los cuadernos" :
    filter.kind === "favorites" ? "Favoritos" :
    filter.kind === "recent" ? "Recientes" :
    filter.kind === "unfiled" ? "Sin carpeta" :
    folders.find((f) => f.id === (filter as { id: string }).id)?.name ?? "";

  const searchInput = h("input", { class: "input search", type: "search", placeholder: "Buscar cuadernos", value: search });
  searchInput.addEventListener("input", () => {
    search = searchInput.value;
    const pos = searchInput.selectionStart;
    rerender().then(() => {
      const s = root.querySelector<HTMLInputElement>(".search");
      s?.focus();
      if (pos !== null) s?.setSelectionRange(pos, pos);
    });
  });
  const sortSel = h(
    "select",
    { class: "input sort", "aria-label": "Ordenar" },
    h("option", { value: "updated" }, "Modificado"),
    h("option", { value: "created" }, "Creado"),
    h("option", { value: "title" }, "Título"),
  );
  sortSel.value = sort;
  sortSel.addEventListener("change", () => ((sort = sortSel.value as typeof sort), rerender()));

  const currentFolder = filter.kind === "folder" ? filter.id : null;

  const header = h(
    "header",
    { class: "lib-head" },
    h("button", { class: "icon-btn menu-toggle", type: "button", "aria-label": "Menú", onclick: () => root.classList.toggle("nav-open") }, icon("menu")),
    h("h1", {}, title),
    h("div", { class: "lib-actions" },
      searchInput,
      sortSel,
      h("button", { class: "btn", type: "button", onclick: () => importFlow(currentFolder, open) }, icon("import"), h("span", { class: "hide-sm" }, "Importar")),
      h("button", { class: "btn primary", type: "button", onclick: () => newNotebookDialog(currentFolder, open) }, icon("plus"), h("span", { class: "hide-sm" }, "Nuevo")),
    ),
  );

  const grid = h("div", { class: "nb-grid" });
  if (!list.length) {
    grid.append(
      h(
        "div",
        { class: "empty" },
        h("img", { src: "icon.svg", alt: "", width: 72, height: 72 }),
        h("h2", {}, search ? "Nada coincide con la búsqueda" : "Empieza tu primer cuaderno"),
        h("p", { class: "muted" }, "Escribe a mano con el dedo o el Apple Pencil, importa PDFs y usa la IA para estudiar."),
        h("button", { class: "btn primary", type: "button", onclick: () => newNotebookDialog(currentFolder, open) }, icon("plus"), "Nuevo cuaderno"),
      ),
    );
  }
  for (const nb of list) grid.append(notebookCard(nb, folders, open, rerender));

  root.replaceChildren(sidebar, h("div", { class: "nav-scrim", onclick: () => root.classList.remove("nav-open") }), h("main", { class: "lib-main" }, header, grid));
  root.className = "library";
}

function notebookCard(nb: Notebook, folders: Folder[], open: (id: string) => void, rerender: () => void): HTMLElement {
  const cover = h("div", { class: "nb-cover", style: `--cover:${nb.cover}` });
  if (nb.lock) cover.append(h("div", { class: "nb-locked" }, icon("lock")));
  else
    thumbnail(nb).then((url) => {
      if (url) cover.append(h("img", { src: url, alt: "", loading: "lazy" }));
    });
  const more = iconButton("more", "Opciones", (e) => {
    e.stopPropagation();
    menu(more);
  }, "small ghost");

  const card = h(
    "div",
    { class: "nb-card", tabindex: 0, role: "button", "aria-label": nb.title },
    cover,
    h("div", { class: "nb-meta" },
      h("div", { class: "nb-title" }, nb.favorite ? icon("star") : null, h("span", {}, nb.title)),
      h("div", { class: "row between" }, h("span", { class: "muted small" }, `${formatDate(nb.updatedAt)} · ${nb.pageIds.length} pág.`), more),
    ),
  );
  const go = async () => {
    if (await requestUnlock(nb)) open(nb.id);
  };
  card.addEventListener("click", go);
  card.addEventListener("keydown", (e) => e.key === "Enter" && go());
  card.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    menu(more);
  });

  function menu(anchor: HTMLElement) {
    popupMenu(anchor, [
      { label: "Renombrar", icon: "text", action: async () => {
        const t = await promptDialog("Renombrar", "Título", nb.title);
        if (t?.trim()) {
          await db.notebooks.put({ ...nb, title: t.trim(), updatedAt: Date.now() });
          rerender();
        }
      } },
      { label: nb.favorite ? "Quitar de favoritos" : "Añadir a favoritos", icon: "star", action: async () => {
        await db.notebooks.put({ ...nb, favorite: !nb.favorite });
        rerender();
      } },
      { label: "Mover a carpeta…", icon: "folder", action: () => moveDialog(nb, folders, rerender) },
      { label: "Cambiar portada", icon: "image", action: () => coverDialog(nb, rerender) },
      { label: "Duplicar", icon: "copy", action: async () => {
        if (!(await requestUnlock(nb))) return;
        await duplicateNotebook(nb);
        toast("Cuaderno duplicado");
        rerender();
      } },
      { label: nb.lock ? "Quitar contraseña" : "Proteger con contraseña", icon: nb.lock ? "unlock" : "lock", action: () => lockFlow(nb, rerender) },
      { label: "Exportar PDF", icon: "export", action: async () => {
        if (!(await requestUnlock(nb))) return;
        toast("Generando PDF…");
        download(await exportPdf(nb, await loadPages(nb)), `${nb.title}.pdf`);
      } },
      "sep",
      { label: "Eliminar", icon: "trash", danger: true, action: async () => {
        if (!(await confirmDialog("Eliminar cuaderno", `Se borrará «${nb.title}» con todas sus páginas y grabaciones. No se puede deshacer.`, "Eliminar", true))) return;
        if (!(await requestUnlock(nb))) return;
        await deleteNotebookDeep(nb);
        rerender();
      } },
    ]);
  }
  return card;
}

export async function lockFlow(nb: Notebook, after: () => void): Promise<void> {
  if (nb.lock) {
    const pw = await promptDialog("Quitar contraseña", "Contraseña actual", "", { type: "password" });
    if (pw === null) return;
    if (!(await checkLock(nb.lock, pw))) return toast("Contraseña incorrecta");
    await db.notebooks.put({ ...nb, lock: null });
    nb.lock = null;
    toast("Contraseña quitada");
  } else {
    const pw = await promptDialog("Proteger cuaderno", "Nueva contraseña (mínimo 4 caracteres)", "", { type: "password" });
    if (pw === null) return;
    if (pw.length < 4) return toast("La contraseña es demasiado corta");
    const again = await promptDialog("Proteger cuaderno", "Repite la contraseña", "", { type: "password" });
    if (again !== pw) return toast("Las contraseñas no coinciden");
    nb.lock = await makeLock(pw);
    await db.notebooks.put({ ...nb });
    unlocked.delete(nb.id);
    toast("Cuaderno protegido. Si olvidas la contraseña no podrás abrirlo.", 4000);
  }
  after();
}

function moveDialog(nb: Notebook, folders: Folder[], after: () => void) {
  const m = modal("Mover a carpeta", h("div", { class: "list" },
    h("button", { class: "list-item", type: "button", onclick: async () => {
      await db.notebooks.put({ ...nb, folderId: null });
      m.close();
      after();
    } }, icon("book"), "Sin carpeta"),
    folders.map((f) => h("button", { class: `list-item ${f.id === nb.folderId ? "active" : ""}`, type: "button", onclick: async () => {
      await db.notebooks.put({ ...nb, folderId: f.id });
      m.close();
      after();
    } }, icon("folder"), f.name)),
  ));
}

function coverDialog(nb: Notebook, after: () => void) {
  const m = modal("Portada", h("div", { class: "swatches big" }, COVERS.map((c) => h("button", {
    class: `swatch ${c === nb.cover ? "active" : ""}`, style: `background:${c}`, type: "button", "aria-label": c,
    onclick: async () => {
      await db.notebooks.put({ ...nb, cover: c });
      m.close();
      after();
    },
  }))));
}

function templatePreview(t: TemplateId, paper: PaperColor): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const scale = 0.12;
  c.width = Math.round(794 * scale);
  c.height = Math.round(1123 * scale);
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  drawPaper(ctx, { ...blankPage({ id: "", template: t, paper, pageSize: "a4" }) });
  return c;
}

export function newNotebookDialog(folderId: string | null, open: (id: string) => void): void {
  let cover = COVERS[Math.floor(Math.random() * COVERS.length)];
  let template: TemplateId = "lined";
  let paper: PaperColor = "white";
  let size: PageSizeId = "a4";

  const title = h("input", { class: "input", value: "Cuaderno sin título" });
  const swatches = h("div", { class: "swatches" });
  const drawSwatches = () =>
    swatches.replaceChildren(...COVERS.map((c) => h("button", {
      class: `swatch ${c === cover ? "active" : ""}`, style: `background:${c}`, type: "button", "aria-label": `Portada ${c}`,
      onclick: () => ((cover = c), drawSwatches()),
    })));
  drawSwatches();

  const templates = h("div", { class: "tpl-grid" });
  const drawTemplates = () =>
    templates.replaceChildren(...TEMPLATES.map((t) => h("button", {
      class: `tpl ${t.id === template ? "active" : ""}`, type: "button",
      onclick: () => ((template = t.id), drawTemplates()),
    }, templatePreview(t.id, paper), h("span", {}, t.label))));
  drawTemplates();

  const papers = h("div", { class: "seg" }, (Object.keys(PAPER) as PaperColor[]).map((p) => h("button", {
    class: `seg-btn ${p === paper ? "active" : ""}`, type: "button",
    onclick: (e: Event) => {
      paper = p;
      papers.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b === e.currentTarget));
      drawTemplates();
    },
  }, { white: "Blanco", cream: "Crema", dark: "Oscuro", green: "Pizarra" }[p])));

  const sizes = h("select", { class: "input" }, (Object.keys(PAGE_SIZES) as PageSizeId[]).map((k) => h("option", { value: k }, PAGE_SIZES[k].label)));
  sizes.addEventListener("change", () => (size = sizes.value as PageSizeId));

  const m = modal("Nuevo cuaderno", [
    h("label", { class: "field" }, h("span", {}, "Título"), title),
    h("div", { class: "field" }, h("span", {}, "Portada"), swatches),
    h("div", { class: "field" }, h("span", {}, "Plantilla"), templates),
    h("div", { class: "row wrap" },
      h("div", { class: "field" }, h("span", {}, "Papel"), papers),
      h("label", { class: "field" }, h("span", {}, "Tamaño de página"), sizes),
    ),
    h("div", { class: "actions" }, h("button", { class: "btn primary", type: "button", onclick: async () => {
      const nb = await createNotebook({ title: title.value.trim() || "Cuaderno sin título", cover, template, paper, pageSize: size, folderId });
      m.close();
      open(nb.id);
    } }, "Crear")),
  ], { wide: true });
  setTimeout(() => title.select(), 30);
}

export async function importFlow(folderId: string | null, open: (id: string) => void): Promise<void> {
  const files = await pickFile("application/pdf,image/*", true);
  if (!files.length) return;
  const name = files[0].name.replace(/\.[^.]+$/, "");
  const nb = await createNotebook({ title: name, cover: COVERS[0], template: "blank", paper: "white", pageSize: "a4", folderId });
  // createNotebook adds one blank page; imported content replaces it.
  const blankId = nb.pageIds[0];
  nb.pageIds = [];
  const progress = h("p", {}, "Importando…");
  const m = modal("Importando", progress);
  try {
    for (const f of files) {
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        const pages = await pdfToPages(f, nb, (d, t) => (progress.textContent = `${f.name}: página ${d} de ${t}`));
        for (const p of pages) {
          await db.pages.put(p);
          nb.pageIds.push(p.id);
        }
      } else if (f.type.startsWith("image/")) {
        const p = await imageToPage(f, nb);
        await db.pages.put(p);
        nb.pageIds.push(p.id);
      }
    }
    if (!nb.pageIds.length) throw new Error("No se reconoció ningún PDF ni imagen.");
    await db.pages.delete(blankId);
    await db.notebooks.put({ ...nb, updatedAt: Date.now() });
    m.close();
    open(nb.id);
  } catch (e) {
    m.close();
    await deleteNotebookDeep({ ...nb, pageIds: [] });
    await db.pages.delete(blankId);
    modal("No se pudo importar", h("p", {}, e instanceof Error ? e.message : String(e)));
  }
}
