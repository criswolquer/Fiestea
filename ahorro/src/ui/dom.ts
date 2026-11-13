import { createElement, type IconNode } from "lucide";

type Child = Node | string | number | false | null | undefined;
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;

/** Crea un elemento: h("button", { class: "btn", onclick: fn }, "Guardar"). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: (Child | Child[])[]): void {
  for (const c of children.flat()) {
    if (c === false || c === null || c === undefined) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const SVG = "http://www.w3.org/2000/svg";
export function s(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Icono de Lucide (licencia ISC), decorativo salvo que se le dé label. */
export function icon(node: IconNode, opts: { size?: number; label?: string } = {}): SVGElement {
  const el = createElement(node) as unknown as SVGElement;
  const size = opts.size ?? 20;
  el.setAttribute("width", String(size));
  el.setAttribute("height", String(size));
  el.setAttribute("stroke-width", "2");
  el.classList.add("icon");
  if (opts.label) {
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", opts.label);
  } else {
    el.setAttribute("aria-hidden", "true");
  }
  return el;
}

// useGrouping "always": es-ES no pone el punto de los miles en números de 4 cifras ("1845,00 €").
const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", useGrouping: "always" });
/** 184500 -> "1.845,00 €". */
export function money(cents: number): string {
  return eur.format(cents / 100);
}

export function pct(part: number, total: number): number {
  return total <= 0 ? 0 : Math.round((part / total) * 100);
}
