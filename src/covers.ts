import { db, uid } from "./db";
import type { CoverPattern, Notebook } from "./types";
import { h, icon, pickFile, toast } from "./ui";

/* Notebook covers: a colour, a printed pattern, a title label, or the person's own photo. */

export const COVER_COLORS: { color: string; name: string }[] = [
  { color: "#e5484d", name: "Rojo" },
  { color: "#f76b15", name: "Naranja" },
  { color: "#f2b43c", name: "Mostaza" },
  { color: "#a3b745", name: "Pistacho" },
  { color: "#2fa36b", name: "Verde" },
  { color: "#1f6f5c", name: "Bosque" },
  { color: "#0e9aa7", name: "Turquesa" },
  { color: "#3b6cf6", name: "Azul" },
  { color: "#1d2b53", name: "Marino" },
  { color: "#8e4ec6", name: "Violeta" },
  { color: "#d6409f", name: "Fucsia" },
  { color: "#f4a6b8", name: "Rosa" },
  { color: "#c2763a", name: "Cuero" },
  { color: "#d9cbb0", name: "Kraft" },
  { color: "#5b5f6b", name: "Pizarra" },
  { color: "#1b1c1f", name: "Negro" },
];

export const COVER_PATTERNS: { id: CoverPattern; name: string }[] = [
  { id: "plain", name: "Liso" },
  { id: "linen", name: "Lino" },
  { id: "stripes", name: "Rayas" },
  { id: "dots", name: "Lunares" },
  { id: "grid", name: "Cuadros" },
  { id: "waves", name: "Ondas" },
  { id: "geo", name: "Geométrico" },
  { id: "gradient", name: "Degradado" },
  { id: "terrazzo", name: "Terrazo" },
  { id: "spine", name: "Lomo" },
];

export function randomCover(): { cover: string; coverPattern: CoverPattern } {
  const c = COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)].color;
  const p = COVER_PATTERNS[Math.floor(Math.random() * COVER_PATTERNS.length)].id;
  return { cover: c, coverPattern: p };
}

/** Whether dark text reads better than white on this colour. */
export function isLight(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 165;
}

const urlCache = new Map<string, Promise<string | null>>();
export function coverImageUrl(blobId: string): Promise<string | null> {
  let p = urlCache.get(blobId);
  if (!p) {
    p = db.blobs.get(blobId).then((b) => (b ? URL.createObjectURL(b) : null));
    urlCache.set(blobId, p);
  }
  return p;
}

export interface CoverSpec {
  cover: string;
  coverPattern?: CoverPattern;
  coverImage?: string;
  title: string;
  subtitle?: string;
}

/** The cover artwork: colour, pattern, optional photo, spine and title label. */
export function coverArt(spec: CoverSpec, opts: { label?: boolean } = {}): HTMLElement {
  const art = h("div", {
    class: `cover-art ${isLight(spec.cover) ? "light" : "dark"}`,
    "data-pattern": spec.coverPattern ?? "plain",
    style: `--cover:${spec.cover}`,
  });
  if (spec.coverImage) {
    const img = h("img", { class: "cover-photo", alt: "" });
    coverImageUrl(spec.coverImage).then((u) => u && (img.src = u));
    art.append(img);
  }
  art.append(h("div", { class: "cover-spine" }));
  if (opts.label !== false)
    art.append(
      h(
        "div",
        { class: "cover-label" },
        h("span", { class: "cover-title" }, spec.title || "Sin título"),
        spec.subtitle ? h("span", { class: "cover-sub" }, spec.subtitle) : null,
      ),
    );
  return art;
}

export function coverSpecOf(nb: Notebook, subtitle?: string): CoverSpec {
  return { cover: nb.cover, coverPattern: nb.coverPattern, coverImage: nb.coverImage, title: nb.title, subtitle };
}

/**
 * Cover editor with a live preview. `state` is changed in place; `getTitle`
 * keeps the preview label in sync with a title field elsewhere in the dialog.
 */
export function coverPicker(
  state: { cover: string; coverPattern: CoverPattern; coverImage?: string },
  getTitle: () => string,
): { el: HTMLElement; refresh: () => void } {
  const preview = h("div", { class: "cover-preview" });
  const colors = h("div", { class: "cover-colors" });
  const patterns = h("div", { class: "cover-patterns" });
  const photoRow = h("div", { class: "row wrap" });

  const refresh = () => {
    preview.replaceChildren(coverArt({ ...state, title: getTitle() }));
    colors.replaceChildren(
      ...COVER_COLORS.map((c) =>
        h("button", {
          class: `swatch ${c.color === state.cover ? "active" : ""}`,
          style: `background:${c.color}`,
          type: "button",
          title: c.name,
          "aria-label": c.name,
          onclick: () => ((state.cover = c.color), refresh()),
        }),
      ),
    );
    patterns.replaceChildren(
      ...COVER_PATTERNS.map((p) =>
        h(
          "button",
          {
            class: `pattern-opt ${p.id === state.coverPattern && !state.coverImage ? "active" : ""}`,
            type: "button",
            onclick: () => {
              state.coverPattern = p.id;
              state.coverImage = undefined;
              refresh();
            },
          },
          coverArt({ cover: state.cover, coverPattern: p.id, title: "" }, { label: false }),
          h("span", {}, p.name),
        ),
      ),
    );
    photoRow.replaceChildren(
      h(
        "button",
        {
          class: "btn small",
          type: "button",
          onclick: async () => {
            const [f] = await pickFile("image/*");
            if (!f) return;
            try {
              const blob = await shrinkImage(f, 900);
              const id = uid();
              await db.blobs.put(id, blob);
              state.coverImage = id;
              refresh();
            } catch {
              toast("No se pudo usar esa imagen.");
            }
          },
        },
        icon("image"),
        state.coverImage ? "Cambiar foto" : "Usar una foto",
      ),
      state.coverImage
        ? h("button", { class: "btn small", type: "button", onclick: () => ((state.coverImage = undefined), refresh()) }, "Quitar foto")
        : "",
    );
  };
  refresh();

  const el = h(
    "div",
    { class: "cover-picker" },
    preview,
    h(
      "div",
      { class: "cover-controls" },
      h("span", { class: "field-label" }, "Color"),
      colors,
      h("span", { class: "field-label" }, "Diseño"),
      patterns,
      photoRow,
    ),
  );
  return { el, refresh };
}

/** Downscales a photo so covers stay light. */
async function shrinkImage(file: Blob, max: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", 0.85));
}
