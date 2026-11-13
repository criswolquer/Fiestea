import { ChevronLeft, X, type IconNode } from "lucide";
import { tabbar } from "../ui/components";
import { h, icon } from "../ui/dom";

export type Tab = "inicio" | "calendario" | "patrimonio";

/** Plantilla de pantalla: cabecera (volver, título, acciones), contenido y pestañas. */
export function screen(
  o: { title: string; back?: string; close?: string; tab?: Tab; actions?: Node[]; hideTitle?: boolean; header?: Node },
  ...content: (Node | null | false)[]
): HTMLElement {
  const nav = o.back ?? o.close;
  const navIcon: IconNode = o.close ? X : ChevronLeft;
  return h("div", { class: `app${o.tab ? " has-tabs" : ""}` },
    h("header", { class: "topbar" },
      nav ? h("a", { class: "btn btn-ghost btn-icon btn-md", href: nav, "aria-label": o.close ? "Cerrar" : "Volver" }, icon(navIcon)) : h("span", { class: "topbar-spacer" }),
      o.header ?? h("h1", { class: `topbar-title${o.hideTitle ? " sr-only" : ""}`, tabindex: -1 }, o.title),
      h("div", { class: "topbar-actions" }, ...(o.actions ?? [])),
    ),
    h("main", { class: "page", id: "main" }, ...content.filter(Boolean) as Node[]),
    o.tab ? tabbar(o.tab) : null,
  );
}

export function sectionTitle(text: string, action?: Node | null): HTMLElement {
  return h("div", { class: "section-head" }, h("h2", { class: "section-title" }, text), action ?? null);
}

/** Esqueleto mientras carga (sin spinner). */
export function skeleton(): HTMLElement {
  return h("div", { class: "app", "aria-busy": "true" },
    h("header", { class: "topbar" }),
    h("main", { class: "page" }, h("span", { class: "sr-only" }, "Cargando…"),
      h("div", { class: "sk sk-ring" }), h("div", { class: "sk sk-line" }), h("div", { class: "sk sk-card" }), h("div", { class: "sk sk-card" })));
}
