// Piezas de la interfaz. Cada una devuelve un HTMLElement y solo usa clases
// de components.css, que a su vez solo usan var(--token). Especificación en
// replica/design/components.md.
import {
  CalendarDays, Camera, ChevronLeft, ChevronRight, House, Image as ImageIcon, Info, Mic,
  PiggyBank, Send, Sparkles, X, type IconNode,
} from "lucide";
import { h, icon, money, pct, s } from "./dom";

let uid = 0;
const nextId = (p: string) => `${p}-${++uid}`;

/* Botón ------------------------------------------------------------------ */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export function button(
  label: string,
  o: { variant?: ButtonVariant; size?: "sm" | "md" | "lg"; icon?: IconNode; iconOnly?: boolean;
       disabled?: boolean; loading?: boolean; block?: boolean; onClick?: () => void; type?: "button" | "submit" } = {},
): HTMLButtonElement {
  const b = h("button", {
    type: o.type ?? "button",
    class: `btn btn-${o.variant ?? "primary"} btn-${o.size ?? "md"}${o.iconOnly ? " btn-icon" : ""}${o.block ? " btn-block" : ""}`,
    disabled: o.disabled || o.loading,
    "aria-busy": o.loading ? "true" : undefined,
    "aria-label": o.iconOnly ? label : undefined,
    onclick: o.onClick ? () => o.onClick!() : undefined,
  });
  if (o.loading) b.append(h("span", { class: "spinner", "aria-hidden": "true" }));
  else if (o.icon) b.append(icon(o.icon, { size: o.size === "sm" ? 16 : 20 }));
  if (!o.iconOnly) b.append(h("span", {}, label));
  return b;
}

/* Campos ----------------------------------------------------------------- */
export function field(
  label: string,
  o: { type?: string; value?: string; placeholder?: string; hint?: string; error?: string; name?: string; required?: boolean;
       maxlength?: number; min?: string; max?: string; autocomplete?: string;
       inputmode?: string; suffix?: string; big?: boolean; disabled?: boolean } = {},
): HTMLDivElement {
  const id = nextId("f");
  const hintId = o.hint || o.error ? `${id}-msg` : undefined;
  const input = h("input", {
    id, type: o.type ?? "text", value: o.value, placeholder: o.placeholder, name: o.name, required: o.required,
    maxlength: o.maxlength, min: o.min, max: o.max, autocomplete: o.autocomplete ?? "off",
    inputmode: o.inputmode, disabled: o.disabled,
    "aria-invalid": o.error ? "true" : undefined, "aria-describedby": hintId,
    class: `input${o.big ? " input-big" : ""}`,
  });
  return h("div", { class: `field${o.error ? " field-error" : ""}` },
    h("label", { for: id, class: "field-label" }, label),
    h("div", { class: "input-wrap" }, input, o.suffix ? h("span", { class: "input-suffix", "aria-hidden": "true" }, o.suffix) : null),
    h("p", { id: hintId ?? `${id}-msg`, class: o.error ? "field-msg error" : "field-msg", hidden: !(o.hint || o.error), "data-hint": o.hint }, o.error ?? o.hint ?? ""),
  );
}

/** Marca un campo con error (o lo limpia con null) sin rehacerlo. */
export function setFieldError(f: HTMLElement, msg: string | null): void {
  const input = f.querySelector("input, textarea, select") as HTMLElement | null;
  const p = f.querySelector(".field-msg") as HTMLElement | null;
  if (!input || !p) return;
  f.classList.toggle("field-error", !!msg);
  if (msg) {
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", p.id);
    p.textContent = msg; p.classList.add("error"); p.hidden = false;
  } else {
    input.removeAttribute("aria-invalid");
    p.classList.remove("error");
    if (!p.dataset.hint) p.hidden = true; else p.textContent = p.dataset.hint;
  }
}

/** Importe: teclado decimal, acepta "12,50", "12.50", "1.234,56", "12€". */
export function moneyField(label: string, o: { value?: string; error?: string; big?: boolean; name?: string; required?: boolean; hint?: string } = {}): HTMLDivElement {
  return field(label, { inputmode: "decimal", placeholder: "0,00", suffix: "€", ...o });
}

export function parseMoney(text: string): number | null {
  let t = text.replace(/[€\s]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}

/* Anillo de progreso ------------------------------------------------------- */
export function ring(o: {
  value: number; max: number; color: string; size?: number; stroke?: number;
  center?: string; sub?: string; label: string; showPct?: boolean;
}): HTMLDivElement {
  const size = o.size ?? 200, stroke = o.stroke ?? Math.max(6, size / 18);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const frac = o.max <= 0 ? 0 : Math.min(1, Math.max(0, o.value / o.max));
  const svg = s("svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size, "aria-hidden": "true" });
  svg.append(
    s("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: "var(--surface-2)", "stroke-width": stroke }),
    s("circle", {
      cx: size / 2, cy: size / 2, r, fill: "none", stroke: `var(--${o.color})`, "stroke-width": stroke,
      "stroke-linecap": "round", "stroke-dasharray": `${c * frac} ${c}`,
      transform: `rotate(-90 ${size / 2} ${size / 2})`, class: "ring-arc",
    }),
  );
  const over = o.max > 0 && o.value > o.max;
  return h("div", { class: `ring${over ? " ring-over" : ""}`, role: "img", "aria-label": o.label, style: `--ring-size:${size}px` },
    svg,
    h("div", { class: "ring-center" },
      o.showPct ? h("span", { class: "ring-pct num" }, `${pct(o.value, o.max)}%`) : null,
      o.center ? h("span", { class: size >= 160 ? "ring-value num" : "ring-value-sm num" }, o.center) : null,
      o.sub ? h("span", { class: "ring-sub" }, o.sub) : null,
    ),
  );
}

/* Donut por categorías ------------------------------------------------------ */
export interface Segment { label: string; cents: number; color: string }
export function donut(segments: Segment[], o: { title: string; size?: number }): HTMLElement {
  const size = o.size ?? 220, stroke = 34, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const total = segments.reduce((a, x) => a + x.cents, 0);
  const fig = h("figure", { class: "donut" });
  if (total === 0) {
    fig.append(emptyState("Sin gastos este mes", "Cuando apuntes alguno, verás aquí en qué se va.", PiggyBank));
    return fig;
  }
  const svg = s("svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size, "aria-hidden": "true" });
  let offset = 0;
  const gap = segments.length > 1 ? 2 : 0;
  for (const seg of segments) {
    const len = (seg.cents / total) * c;
    svg.append(s("circle", {
      cx: size / 2, cy: size / 2, r, fill: "none", stroke: `var(--${seg.color})`, "stroke-width": stroke,
      "stroke-dasharray": `${Math.max(0, len - gap)} ${c}`, "stroke-dashoffset": -offset,
      transform: `rotate(-90 ${size / 2} ${size / 2})`,
    }));
    offset += len;
  }
  const legend = h("ul", { class: "legend" },
    segments.map((seg) => h("li", {},
      h("span", { class: "swatch", style: `background:var(--${seg.color})` }),
      h("span", { class: "legend-label" }, seg.label),
      h("span", { class: "legend-value num" }, `${pct(seg.cents, total)}%`),
    )));
  fig.append(
    h("div", { class: "donut-chart", role: "img",
      "aria-label": `${o.title}: total ${money(total)}. ` + segments.map((x) => `${x.label} ${pct(x.cents, total)}%`).join(", ") },
      svg,
      h("div", { class: "ring-center" }, h("span", { class: "ring-sub" }, "Total"), h("span", { class: "ring-value-sm num" }, money(total))),
    ),
    legend,
  );
  return fig;
}

/* Barras por día --------------------------------------------------------- */
export function bars(values: number[], o: { color: string; label: string }): HTMLElement {
  const w = 320, hgt = 120, n = values.length, max = Math.max(1, ...values), bw = w / n;
  const svg = s("svg", { viewBox: `0 0 ${w} ${hgt + 18}`, class: "bars", "aria-hidden": "true", preserveAspectRatio: "none" });
  svg.append(s("line", { x1: 0, y1: hgt, x2: w, y2: hgt, stroke: "var(--border)" }));
  values.forEach((v, i) => {
    if (v <= 0) return;
    const bh = Math.max(2, (v / max) * (hgt - 4));
    svg.append(s("rect", { x: i * bw + bw * 0.2, y: hgt - bh, width: bw * 0.6, height: bh, rx: 2, fill: `var(--${o.color})` }));
  });
  const peak = values.indexOf(max);
  return h("figure", { class: "bars-fig", role: "img", "aria-label": `${o.label}. Día con más gasto: ${peak + 1}, ${money(max)}` }, svg);
}

/* Cifra del mes ------------------------------------------------------------ */
export function kpi(label: string, cents: number, role: "income" | "expense" | "savings" | "investment"): HTMLElement {
  return h("div", { class: `kpi kpi-${role}` },
    h("span", { class: "kpi-label" }, label),
    h("span", { class: "kpi-value num" }, money(cents)),
  );
}

/* Tarjeta ------------------------------------------------------------------ */
export function card(...children: (Node | string | null)[]): HTMLElement {
  return h("section", { class: "card" }, ...children);
}

export function tile(o: { title: string; body: string | Node; icon?: IconNode; tone?: string; onClick?: () => void }): HTMLElement {
  const inner = [
    o.icon ? h("span", { class: "tile-icon", style: o.tone ? `color:var(--${o.tone})` : undefined }, icon(o.icon)) : null,
    h("span", { class: "tile-title" }, o.title),
    typeof o.body === "string" ? h("span", { class: "tile-body" }, o.body) : o.body,
  ];
  return o.onClick
    ? h("button", { type: "button", class: "tile", onclick: () => o.onClick!() }, ...inner)
    : h("div", { class: "tile" }, ...inner);
}

/* Fila de límite por categoría -------------------------------------------------- */
export function limitRow(o: { name: string; spentCents: number; limitCents: number; color: string }): HTMLElement {
  const left = o.limitCents - o.spentCents;
  const p = pct(o.spentCents, o.limitCents);
  const state = left < 0 ? "over" : p >= 85 ? "near" : "ok";
  return h("li", { class: `limit-row limit-${state}` },
    ring({ value: o.spentCents, max: o.limitCents, color: state === "over" ? "danger" : o.color, size: 52, stroke: 6,
      showPct: true, label: `${o.name}: ${p}% usado` }),
    h("div", { class: "limit-main" },
      h("span", { class: "limit-name" }, o.name),
      h("span", { class: "limit-detail num" }, `${money(o.spentCents)} de ${money(o.limitCents)}`),
    ),
    h("div", { class: "limit-left" },
      h("span", { class: "limit-left-label" }, left < 0 ? "Te has pasado" : "Te quedan"),
      h("span", { class: "limit-left-value num" }, money(Math.abs(left))),
    ),
  );
}

/* Fila de movimiento ---------------------------------------------------------- */
export function txRow(o: { title: string; category: string; cents: number; type: "income" | "expense"; date?: string;
  photoUrl?: string; onClick?: () => void }): HTMLElement {
  const sign = o.type === "income" ? "+" : "−";
  return h("li", {},
    h("button", { type: "button", class: "tx-row", onclick: o.onClick ? () => o.onClick!() : undefined },
      o.photoUrl
        ? h("img", { class: "tx-thumb", src: o.photoUrl, alt: "" })
        : h("span", { class: "tx-thumb tx-thumb-empty", "aria-hidden": "true" }, o.title.slice(0, 1).toUpperCase()),
      h("span", { class: "tx-main" },
        h("span", { class: "tx-title" }, o.title),
        h("span", { class: "tx-sub" }, [o.category, o.date].filter(Boolean).join(" · ")),
      ),
      h("span", { class: `tx-amount num ${o.type}` },
        h("span", { class: "sr-only" }, o.type === "income" ? "Ingreso de " : "Gasto de "),
        `${sign}${money(o.cents)}`),
    ),
  );
}

/* Hoja inferior (bottom sheet) sobre <dialog> ------------------------------------- */
export function sheet(title: string, body: Node, o: { footer?: Node } = {}): HTMLDialogElement {
  const id = nextId("sheet");
  const d = h("dialog", { class: "sheet", "aria-labelledby": id },
    h("div", { class: "sheet-handle", "aria-hidden": "true" }),
    h("header", { class: "sheet-head" },
      h("h2", { id, class: "sheet-title" }, title),
      button("Cerrar", { variant: "ghost", iconOnly: true, icon: X, onClick: () => d.close() }),
    ),
    h("div", { class: "sheet-body" }, body),
    o.footer ? h("footer", { class: "sheet-foot" }, o.footer) : null,
  );
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); }); // tocar fuera cierra
  return d;
}

/* Selector de foto -------------------------------------------------------------- */
export function photoPicker(o: { onChange?: (file: File | null) => void; initialUrl?: string } = {}): HTMLElement {
  const wrap = h("div", { class: "photo-picker" });
  const camId = nextId("cam"), galId = nextId("gal");
  const render = (url: string | null) => {
    wrap.replaceChildren();
    if (url) {
      wrap.append(h("div", { class: "photo-preview" },
        h("img", { src: url, alt: "Foto del movimiento" }),
        button("Quitar foto", { variant: "secondary", size: "sm", iconOnly: true, icon: X, onClick: () => { render(null); o.onChange?.(null); (wrap.querySelector("label") as HTMLElement | null)?.focus(); } }),
      ));
      return;
    }
    const pick = (capture: boolean) => {
      const input = h("input", { type: "file", accept: "image/*", id: capture ? camId : galId, class: "sr-only", capture: capture ? "environment" : undefined });
      input.addEventListener("change", () => {
        const f = input.files?.[0] ?? null;
        if (!f) return;
        render(URL.createObjectURL(f)); o.onChange?.(f);
      });
      return input;
    };
    const cam = pick(true), gal = pick(false);
    wrap.append(cam, gal,
      h("label", { for: camId, class: "photo-btn" }, icon(Camera), h("span", {}, "Hacer foto")),
      h("label", { for: galId, class: "photo-btn" }, icon(ImageIcon), h("span", {}, "De la galería")),
    );
  };
  render(o.initialUrl ?? null);
  return wrap;
}

/* Control segmentado -------------------------------------------------------------- */
export function segmented(name: string, options: string[], selected = 0, onChange?: (i: number) => void): HTMLElement {
  const group = nextId("seg");
  return h("fieldset", { class: "segmented" },
    h("legend", { class: "sr-only" }, name),
    options.map((opt, i) => {
      const id = `${group}-${i}`;
      const input = h("input", { type: "radio", name: group, id, checked: i === selected, class: "seg-input" });
      input.addEventListener("change", () => onChange?.(i));
      return h("span", { class: "seg-opt" }, input, h("label", { for: id }, opt));
    }),
  );
}

/* Slider de reparto ------------------------------------------------------------- */
export function allocSlider(label: string, value: number, color: string): HTMLElement {
  const id = nextId("sl");
  const out = h("output", { for: id, class: "alloc-out num" }, `${value}%`);
  const input = h("input", { id, type: "range", min: 0, max: 100, step: 1, value, class: "range", style: `--fill:var(--${color});--val:${value}%` });
  input.addEventListener("input", () => { out.textContent = `${input.value}%`; input.style.setProperty("--val", `${input.value}%`); });
  return h("div", { class: "alloc" },
    h("div", { class: "alloc-head" }, h("label", { for: id }, label), out),
    input);
}

/* Calendario --------------------------------------------------------------------- */
export type DayMark = "income" | "expense" | "note" | "reminder" | "pot";
export function calendar(year: number, month0: number, marks: Record<number, DayMark[]>, o: { selected?: number; today?: number; onPick?: (day: number) => void } = {}): HTMLElement {
  const first = new Date(year, month0, 1);
  const days = new Date(year, month0 + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // lunes primero
  const monthName = first.toLocaleDateString("es-ES", { month: "long" });
  const grid = h("div", { class: "cal-grid", role: "group", "aria-label": `${monthName} ${year}` });
  ["L", "M", "X", "J", "V", "S", "D"].forEach((d, i) =>
    grid.append(h("span", { class: "cal-dow", "aria-hidden": "true", title: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"][i] }, d)));
  for (let i = 0; i < lead; i++) grid.append(h("span", { "aria-hidden": "true" }));
  const markName: Record<DayMark, string> = { income: "ingresos", expense: "gastos", note: "nota", reminder: "recordatorio", pot: "ahorro o inversión" };
  for (let d = 1; d <= days; d++) {
    const m = marks[d] ?? [];
    grid.append(h("button", {
      type: "button", class: `cal-day${d === o.selected ? " is-selected" : ""}${d === o.today ? " is-today" : ""}`,
      "aria-pressed": d === o.selected ? "true" : "false",
      "aria-current": d === o.today ? "date" : undefined,
      "aria-label": `${d} de ${monthName}${m.length ? ": " + m.map((x) => markName[x]).join(", ") : ""}`,
      onclick: () => o.onPick?.(d),
    },
      h("span", { class: "cal-num" }, d),
      h("span", { class: "cal-marks", "aria-hidden": "true" }, m.map((x) => h("i", { class: `mark mark-${x}` }))),
    ));
  }
  return grid;
}

/* Menú de acciones ------------------------------------------------------------------ */
export function actionMenu(label: string, items: { label: string; icon: IconNode; onClick?: () => void }[]): HTMLElement {
  const menu = h("div", { class: "menu", role: "menu", "aria-label": label },
    items.map((it) => h("button", { type: "button", role: "menuitem", class: "menu-item", tabindex: -1, onclick: () => it.onClick?.() },
      icon(it.icon), h("span", {}, it.label))));
  const buttons = () => [...menu.querySelectorAll<HTMLButtonElement>(".menu-item")];
  buttons()[0]?.setAttribute("tabindex", "0");
  menu.addEventListener("keydown", (e) => {
    const list = buttons(); const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (j: number) => { e.preventDefault(); list.forEach((b) => b.setAttribute("tabindex", "-1")); list[j].setAttribute("tabindex", "0"); list[j].focus(); };
    if (e.key === "ArrowDown") go((i + 1) % list.length);
    else if (e.key === "ArrowUp") go((i - 1 + list.length) % list.length);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
  });
  return menu;
}

/* Visor de historias (cierre de mes) ------------------------------------------------- */
export function stories(slides: { kicker?: string; title: string; body?: string; tone?: string; photos?: { src: string; alt: string }[] }[]): HTMLDialogElement {
  let i = 0;
  const bar = h("div", { class: "story-progress", "aria-hidden": "true" }, slides.map(() => h("span", {}, h("i"))));
  const live = h("div", { class: "story-slide", "aria-live": "polite" });
  const counter = h("span", { class: "sr-only" });
  const d = h("dialog", { class: "stories", "aria-label": "Resumen del mes" },
    bar,
    button("Cerrar resumen", { variant: "ghost", iconOnly: true, icon: X, onClick: () => d.close() }),
    counter, live,
    h("button", { type: "button", class: "story-zone prev", "aria-label": "Anterior", onclick: () => go(i - 1) }),
    h("button", { type: "button", class: "story-zone next", "aria-label": "Siguiente", onclick: () => go(i + 1) }),
  );
  const go = (j: number) => {
    if (j >= slides.length) return d.close();
    i = Math.max(0, j);
    const sl = slides[i];
    bar.querySelectorAll("span").forEach((sp, k) => sp.classList.toggle("done", k <= i));
    d.style.setProperty("--story-tone", `var(--${sl.tone ?? "accent"})`);
    counter.textContent = `Página ${i + 1} de ${slides.length}`;
    live.replaceChildren(
      sl.kicker ? h("p", { class: "story-kicker" }, sl.kicker) : "",
      h("h2", { class: "story-title" }, sl.title),
      sl.body ? h("p", { class: "story-body" }, sl.body) : "",
      sl.photos?.length ? h("div", { class: `story-photos n${Math.min(sl.photos.length, 4)}` }, ...sl.photos.slice(0, 4).map((p) => h("img", { src: p.src, alt: p.alt }))) : "",
    );
  };
  d.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") go(i + 1);
    if (e.key === "ArrowLeft") go(i - 1);
  });
  go(0);
  return d;
}

/* Chat del asistente -------------------------------------------------------------- */
export function chatBubble(role: "user" | "assistant", text: string, o: { time?: string; greeting?: boolean } = {}): HTMLElement {
  return h("li", { class: `bubble bubble-${role}${o.greeting ? " bubble-greeting" : ""}` },
    h("span", { class: "sr-only" }, role === "user" ? "Tú: " : "Asistente: "),
    o.greeting ? h("span", { class: "bubble-kicker" }, icon(Sparkles, { size: 14 }), " Tu resumen de hoy") : null,
    h("p", {}, text),
    o.time ? h("time", { class: "bubble-time" }, o.time) : null,
  );
}

export function chatComposer(o: { disabled?: boolean; hint?: string; micAvailable?: boolean } = {}): HTMLElement {
  const id = nextId("chat");
  return h("form", { class: "composer", onsubmit: (e: Event) => e.preventDefault() },
    h("label", { for: id, class: "sr-only" }, "Pregunta al asistente"),
    h("textarea", { id, rows: 1, class: "input composer-input", placeholder: o.disabled ? o.hint ?? "" : "Pregunta sobre tu dinero…", disabled: o.disabled }),
    o.micAvailable !== false ? micButton({ disabled: o.disabled }) : null,
    button("Enviar", { iconOnly: true, icon: Send, type: "submit", disabled: o.disabled }),
  );
}

export function micButton(o: { listening?: boolean; disabled?: boolean } = {}): HTMLButtonElement {
  const b = button(o.listening ? "Dejar de dictar" : "Dictar", { variant: "secondary", iconOnly: true, icon: Mic, disabled: o.disabled });
  b.classList.add("mic");
  b.setAttribute("aria-pressed", o.listening ? "true" : "false");
  if (o.listening) b.classList.add("is-listening");
  return b;
}

/* Selector de mes ------------------------------------------------------------------ */
export function monthSwitcher(label: string, o: { onPrev?: () => void; onNext?: () => void; onInfo?: () => void; nextDisabled?: boolean } = {}): HTMLElement {
  return h("div", { class: "month-switch" },
    button("Mes anterior", { variant: "ghost", iconOnly: true, icon: ChevronLeft, size: "sm", onClick: o.onPrev }),
    h("h1", { class: "month-label", "aria-live": "polite" }, label),
    o.onInfo ? button("Qué significan estas cifras", { variant: "ghost", iconOnly: true, icon: Info, size: "sm", onClick: o.onInfo }) : null,
    button("Mes siguiente", { variant: "ghost", iconOnly: true, icon: ChevronRight, size: "sm", onClick: o.onNext, disabled: o.nextDisabled }),
  );
}

/* Barra de pestañas -------------------------------------------------------------- */
export function tabbar(active: "calendario" | "inicio" | "patrimonio"): HTMLElement {
  const tabs: [typeof active, string, IconNode, string][] = [
    ["calendario", "Calendario", CalendarDays, "#/calendario"],
    ["inicio", "Inicio", House, "#/"],
    ["patrimonio", "Patrimonio", PiggyBank, "#/capital"],
  ];
  return h("nav", { class: "tabbar", "aria-label": "Secciones" },
    tabs.map(([key, label, ic, href]) => h("a", { href, class: `tab${key === active ? " is-active" : ""}`, "aria-current": key === active ? "page" : undefined },
      icon(ic, { size: 22 }), h("span", {}, label))));
}

/* Tarjeta de plan ------------------------------------------------------------------- */
export function planCard(o: { name: string; price: string; per: string; note?: string; perks: string[]; featured?: boolean; cta: string }): HTMLElement {
  return h("article", { class: `plan${o.featured ? " plan-featured" : ""}` },
    o.featured ? h("span", { class: "badge" }, "Recomendado") : null,
    h("h3", { class: "plan-name" }, o.name),
    h("p", { class: "plan-price" }, h("span", { class: "num" }, o.price), h("span", { class: "plan-per" }, ` ${o.per}`)),
    o.note ? h("p", { class: "plan-note" }, o.note) : null,
    h("ul", { class: "plan-perks" }, o.perks.map((p) => h("li", {}, p))),
    button(o.cta, { variant: o.featured ? "primary" : "secondary", block: true }),
  );
}

/* Avisos ------------------------------------------------------------------------- */
let toastRegion: HTMLElement | null = null;
export function toast(text: string, tone: "info" | "success" | "warning" | "danger" = "info"): void {
  if (!toastRegion) {
    toastRegion = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
    document.body.append(toastRegion);
  }
  const t = h("div", { class: `toast toast-${tone}` }, text);
  toastRegion.append(t);
  setTimeout(() => t.remove(), 4000);
}

export function banner(text: string, tone: "info" | "success" | "warning" | "danger" = "info", action?: HTMLElement): HTMLElement {
  return h("div", { class: `banner banner-${tone}`, role: tone === "danger" ? "alert" : "note" }, h("p", {}, text), action ?? null);
}

/* Estado vacío -------------------------------------------------------------------- */
export function emptyState(title: string, body: string, ic: IconNode, action?: HTMLElement): HTMLElement {
  return h("div", { class: "empty" }, h("span", { class: "empty-icon" }, icon(ic, { size: 28 })), h("p", { class: "empty-title" }, title), h("p", { class: "empty-body" }, body), action ?? null);
}

/* Botón del asistente (sustituye a la mascota del original: aquí no hay personaje) */
export function assistantFab(onClick?: () => void): HTMLButtonElement {
  const b = button("Preguntar al asistente", { variant: "secondary", icon: Sparkles, onClick });
  b.classList.add("assistant-fab");
  return b;
}
