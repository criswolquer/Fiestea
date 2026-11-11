/** Small DOM helpers: element builder, modal dialogs, toasts and popup menus. */

type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (k === "html") el.innerHTML = String(v);
    else if (k === "style") el.setAttribute("style", String(v));
    else if (v === true) el.setAttribute(k, "");
    else if (k in el && k !== "list") (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

export function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.innerHTML = ICONS[name] ?? ICONS.dot;
  return svg;
}

const s = (d: string) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;

export const ICONS: Record<string, string> = {
  dot: `<circle cx="12" cy="12" r="3" fill="currentColor"/>`,
  back: s("M15 5l-7 7 7 7"),
  plus: s("M12 5v14M5 12h14"),
  pen: s("M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3"),
  eraser: s("M8 20h12M5 15l9-9 5 5-8 8H8l-3-3 0-1z"),
  shape: s("M4 4h7v7H4zM17.5 13a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM6 20l3.5-6 3.5 6z"),
  text: s("M5 6V4h14v2M12 4v16M9 20h6"),
  laser: s("M12 3v3M12 18v3M3 12h3M18 12h3M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"),
  menu: s("M4 7h16M4 12h16M4 17h16"),
  cursor: s("M5 3l14 7-6 2-2 6z"),
  eye: s("M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"),
  hide: s("M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3.2 3.6M6.4 7.5C4.2 9 3 12 3 12s4 6 9 6a8.7 8.7 0 0 0 4-1"),
  camera: s("M4 8h3l2-3h6l2 3h3v11H4zM12 10.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z"),
  hand: s("M8 13V6a1.5 1.5 0 0 1 3 0v6M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2.4-4a1.5 1.5 0 0 1 2.5-1.6L8 13"),
  undo: s("M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"),
  redo: s("M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3"),
  layers: s("M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5"),
  grid: s("M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"),
  more: `<circle cx="5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="19" cy="12" r="1.7" fill="currentColor"/>`,
  sparkle: s("M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"),
  mic: s("M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3"),
  calc: s("M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"),
  timer: s("M10 2h4M12 14l3-3M12 6a8 8 0 1 1 0 16 8 8 0 0 1 0-16z"),
  globe: s("M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z"),
  pip: s("M3 5h18v14H3zM12 12h7v5h-7z"),
  link: s("M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"),
  dual: s("M3 5h8v14H3zM13 5h8v14h-8z"),
  lock: s("M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4"),
  unlock: s("M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2"),
  folder: s("M3 6h6l2 2h10v11H3z"),
  star: s("M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"),
  clock: s("M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7v5l3 2"),
  book: s("M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11"),
  import: s("M12 3v12M7 10l5 5 5-5M4 19h16"),
  export: s("M12 15V3M7 8l5-5 5 5M4 19h16"),
  search: s("M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM21 21l-5-5"),
  settings: s("M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"),
  trash: s("M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"),
  close: s("M6 6l12 12M18 6L6 18"),
  play: `<path d="M8 5l11 7-11 7z" fill="currentColor"/>`,
  pause: s("M8 5v14M16 5v14"),
  stop: `<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>`,
  zoomIn: s("M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM21 21l-5-5M11 8v6M8 11h6"),
  zoomOut: s("M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM21 21l-5-5M8 11h6"),
  margin: s("M4 4v16M20 4v16M8 12h8M8 12l2-2M8 12l2 2M16 12l-2-2M16 12l-2 2"),
  image: s("M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01"),
  check: s("M5 12l5 5 9-10"),
  copy: s("M8 8h12v12H8zM4 16V4h12"),
  aipen: s("M4 20l4-1 9-9-3-3-9 9-1 4zM17 3l.6 1.7L19 5.3l-1.4.6L17 7.6l-.6-1.7L15 5.3l1.4-.6z"),
};

export function iconButton(name: string, title: string, onclick: (e: MouseEvent) => void, extraClass = ""): HTMLButtonElement {
  const b = h("button", { class: `icon-btn ${extraClass}`, title, "aria-label": title, type: "button" });
  b.append(icon(name));
  b.addEventListener("click", onclick);
  return b;
}

/* ---------- toast ---------- */

export function toast(msg: string, ms = 2600): void {
  const t = h("div", { class: "toast" }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/* ---------- modal ---------- */

export interface ModalHandle {
  el: HTMLElement;
  body: HTMLElement;
  close: () => void;
}

export function modal(title: string, content: Node | (Node | null | false)[], opts: { wide?: boolean; onClose?: () => void } = {}): ModalHandle {
  const body = h("div", { class: "modal-body" });
  body.append(...(Array.isArray(content) ? content : [content]).filter((n): n is Node => !!n));
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  const box = h(
    "div",
    { class: `modal ${opts.wide ? "wide" : ""}`, role: "dialog", "aria-modal": "true" },
    h("div", { class: "modal-head" }, h("h2", {}, title), iconButton("close", "Cerrar", close)),
    body,
  );
  const overlay = h("div", { class: "overlay" }, box);
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
  return { el: box, body, close };
}

export function confirmDialog(title: string, message: string, okLabel = "Aceptar", danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      m.close();
      resolve(v);
    };
    const m = modal(
      title,
      [
        h("p", {}, message),
        h(
          "div",
          { class: "actions" },
          h("button", { class: "btn", onclick: () => finish(false) }, "Cancelar"),
          h("button", { class: `btn ${danger ? "danger" : "primary"}`, onclick: () => finish(true) }, okLabel),
        ),
      ],
      { onClose: () => finish(false) },
    );
  });
}

export function promptDialog(
  title: string,
  label: string,
  value = "",
  opts: { type?: string; okLabel?: string; placeholder?: string } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const input = h("input", { class: "input", value, type: opts.type ?? "text", placeholder: opts.placeholder ?? "" });
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      m.close();
      resolve(v);
    };
    const form = h(
      "form",
      { onsubmit: ((e: Event) => (e.preventDefault(), finish(input.value))) as EventListener },
      h("label", { class: "field" }, h("span", {}, label), input),
      h(
        "div",
        { class: "actions" },
        h("button", { class: "btn", type: "button", onclick: () => finish(null) }, "Cancelar"),
        h("button", { class: "btn primary", type: "submit" }, opts.okLabel ?? "Aceptar"),
      ),
    );
    const m = modal(title, form, { onClose: () => finish(null) });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 30);
  });
}

/* ---------- popup menu ---------- */

export interface MenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  checked?: boolean;
  action: () => void;
}

export function popupMenu(anchor: HTMLElement, items: (MenuItem | "sep")[]): void {
  closeMenus();
  const menu = h("div", { class: "menu", role: "menu" });
  for (const it of items) {
    if (it === "sep") {
      menu.append(h("div", { class: "menu-sep" }));
      continue;
    }
    const b = h("button", { class: `menu-item ${it.danger ? "danger" : ""}`, role: "menuitem", type: "button" });
    b.append(it.icon ? icon(it.icon) : h("span", { class: "icon" }), h("span", {}, it.label));
    if (it.checked) b.append(icon("check"));
    b.addEventListener("click", () => {
      closeMenus();
      it.action();
    });
    menu.append(b);
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - mw - 8);
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  left = Math.max(8, left);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  setTimeout(() => document.addEventListener("pointerdown", outside), 0);
  function outside(e: PointerEvent) {
    if (!menu.contains(e.target as Node)) closeMenus();
  }
  (menu as HTMLElement & { _cleanup?: () => void })._cleanup = () => document.removeEventListener("pointerdown", outside);
}

export function closeMenus(): void {
  document.querySelectorAll<HTMLElement & { _cleanup?: () => void }>(".menu").forEach((m) => {
    m._cleanup?.();
    m.remove();
  });
}

/* ---------- floating panels (calculator, timer, PiP...) ---------- */

export function floatingPanel(title: string, content: Node, opts: { width?: number; onClose?: () => void; x?: number; y?: number } = {}) {
  const close = () => {
    panel.remove();
    opts.onClose?.();
  };
  const head = h("div", { class: "float-head" }, h("span", {}, title), iconButton("close", "Cerrar", close));
  const panel = h("div", { class: "float-panel" }, head, content);
  if (opts.width) panel.style.width = `${opts.width}px`;
  panel.style.left = `${opts.x ?? Math.max(8, window.innerWidth - (opts.width ?? 280) - 24)}px`;
  panel.style.top = `${opts.y ?? 90}px`;
  document.body.append(panel);

  let sx = 0,
    sy = 0,
    ox = 0,
    oy = 0;
  head.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    sx = e.clientX;
    sy = e.clientY;
    ox = panel.offsetLeft;
    oy = panel.offsetTop;
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener("pointermove", (e) => {
    if (!head.hasPointerCapture(e.pointerId)) return;
    const nx = Math.min(window.innerWidth - 60, Math.max(0, ox + e.clientX - sx));
    const ny = Math.min(window.innerHeight - 40, Math.max(0, oy + e.clientY - sy));
    panel.style.left = `${nx}px`;
    panel.style.top = `${ny}px`;
  });
  return { el: panel, close };
}

export function pickFile(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept, multiple });
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])));
    input.click();
  });
}

export function download(blob: Blob, filename: string): void {
  const a = h("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
