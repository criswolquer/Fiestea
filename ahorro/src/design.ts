// Página #/design: todas las piezas de la interfaz, con datos de ejemplo
// inventados, en los estados que pide replica/design/components.md.
import { Bell, CalendarDays, Eye, Flame, Plus, ReceiptText, StickyNote, Sparkles, Target } from "lucide";
import {
  actionMenu, allocSlider, assistantFab, banner, bars, button, calendar, card, chatBubble, chatComposer,
  donut, emptyState, field, kpi, limitRow, micButton, monthSwitcher, moneyField, photoPicker, planCard,
  ring, segmented, sheet, stories, tabbar, tile, toast, txRow,
} from "./ui/components";
import { h, money } from "./ui/dom";

function section(title: string, ...children: (Node | null)[]): HTMLElement {
  return h("section", { class: "ds-section" }, h("h2", { class: "ds-h" }, title), ...children);
}
const row = (...c: Node[]) => h("div", { class: "ds-row" }, ...c);

export function designPage(): HTMLElement {
  const themeSwitch = segmented("Tema", ["Sistema", "Claro", "Oscuro"], 0, (i) => {
    const v = ["", "light", "dark"][i];
    if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme;
  });

  const txSheet = sheet("Nuevo gasto", h("div", { class: "sheet-body" },
    segmented("Tipo de movimiento", ["Gasto", "Ingreso"]),
    moneyField("Importe", { big: true }),
    field("Concepto", { placeholder: "Ej.: cena con amigos" }),
    photoPicker(),
  ), { footer: button("Guardar", { block: true, size: "lg" }) });

  const recap = stories([
    { kicker: "Noviembre", title: "Así fue tu mes", body: "30 días, 52 movimientos. Vamos a repasarlo." },
    { kicker: "Lo que entró", title: money(184500), body: "Un 4 % más que en octubre.", tone: "income" },
    { kicker: "Lo que apartaste", title: money(42000), body: "Ahorro e inversión juntos: el 23 % de lo que ganaste.", tone: "savings" },
    { kicker: "Para pensar", title: "¿Qué gasto repetirías sin dudar?", tone: "investment" },
  ]);

  const page = h("main", { class: "page", id: "main" },
    h("header", { class: "ds-top" },
      h("h1", { class: "ds-title" }, "Sistema de diseño"),
      h("p", { class: "ds-sub" }, "Piezas de la app con datos de ejemplo. Colores, iconos (Lucide) y textos propios."),
      themeSwitch,
    ),

    section("Colores",
      h("div", { class: "ds-swatches" },
        ["bg", "surface", "surface-2", "border", "text", "text-muted", "accent", "income", "expense", "savings", "investment", "danger", "success", "warning",
          "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6", "chart-7"].map((t) =>
          h("div", { class: "ds-swatch" }, h("span", { style: `background:var(--${t})` }), h("code", {}, t))))),

    section("Tipografía",
      h("p", { class: "ds-type display num" }, "1.284,50 €"),
      h("p", { class: "ds-type xl" }, "Título de pantalla"),
      h("p", { class: "ds-type lg" }, "Título de tarjeta"),
      h("p", { class: "ds-type base" }, "Texto normal para frases y explicaciones."),
      h("p", { class: "ds-type sm" }, "Texto secundario y etiquetas."),
      h("p", { class: "ds-type xs" }, "LETRA PEQUEÑA · 12 PX")),

    section("Botones",
      row(button("Guardar"), button("Cancelar", { variant: "secondary" }), button("Saltar", { variant: "ghost" })),
      row(button("Borrar movimiento", { variant: "danger" }), button("Guardando", { loading: true }), button("No disponible", { disabled: true })),
      row(button("Añadir", { iconOnly: true, icon: Plus }), button("Pequeño", { size: "sm", variant: "secondary" }), button("Grande", { size: "lg" })),
      row(button("Abrir hoja de nuevo gasto", { variant: "secondary", icon: Plus, onClick: () => txSheet.showModal() }),
        button("Ver resumen del mes", { variant: "secondary", icon: Eye, onClick: () => recap.showModal() }),
        button("Mostrar aviso", { variant: "ghost", onClick: () => toast("Movimiento guardado") }))),

    section("Campos",
      moneyField("Importe", { big: true, value: "12,50" }),
      field("Concepto", { placeholder: "Ej.: café", hint: "Opcional. Te ayuda a encontrarlo luego." }),
      moneyField("Límite mensual", { value: "abc", error: "Escribe un importe, por ejemplo 150 o 150,50." }),
      field("Desactivado", { value: "No editable", disabled: true }),
      photoPicker()),

    section("Selector de mes y cifras del mes",
      monthSwitcher("noviembre 2026", { onInfo: () => {}, nextDisabled: true }),
      h("div", { class: "ds-center" },
        ring({ value: 61250, max: 184500, color: "accent", size: 220, center: money(61250), sub: "te queda este mes",
          label: `Te quedan ${money(61250)} de ${money(184500)} este mes` })),
      h("div", { class: "kpis" },
        kpi("Entró", 184500, "income"), kpi("Gastado", 81250, "expense"), kpi("Ahorrado", 30000, "savings"), kpi("Invertido", 12000, "investment"))),

    section("Tarjetas del inicio",
      h("div", { class: "ds-tiles" },
        tile({ title: "Racha", body: "12 días", icon: Flame, tone: "warning" }),
        tile({ title: "Meses en positivo", body: "3 seguidos", icon: Target, tone: "success" }),
        tile({ title: "Hace un mes", body: "Cena de cumpleaños · 38 €", icon: CalendarDays, tone: "savings", onClick: () => {} }),
        tile({ title: "Asistente", body: "Pregunta lo que quieras", icon: Sparkles, tone: "accent", onClick: () => {} }))),

    section("Gráficos",
      card(donut([
        { label: "Vivienda", cents: 55000, color: "chart-1" }, { label: "Comida", cents: 21000, color: "chart-2" },
        { label: "Ocio", cents: 9800, color: "chart-3" }, { label: "Transporte", cents: 6200, color: "chart-4" },
        { label: "Sin categoría", cents: 3100, color: "chart-7" },
      ], { title: "Gastos de noviembre" })),
      card(bars([0, 1200, 0, 300, 4500, 0, 0, 800, 0, 2100, 0, 0, 0, 900, 15000, 0, 600, 0, 0, 1100, 0, 0, 3000, 0, 0, 700, 0, 0, 0, 5200],
        { color: "expense", label: "Gasto por día de noviembre" })),
      h("div", { class: "ds-row ds-rings" },
        ring({ value: 55, max: 100, color: "chart-1", size: 84, showPct: true, sub: "Fijos", label: "Gastos fijos: 55%" }),
        ring({ value: 30, max: 100, color: "chart-3", size: 84, showPct: true, sub: "A elegir", label: "Gastos a elegir: 30%" }),
        ring({ value: 15, max: 100, color: "chart-5", size: 84, showPct: true, sub: "Deudas", label: "Deudas: 15%" })),
      card(donut([], { title: "Gastos" }))),

    section("Límites por categoría",
      h("ul", { class: "list" },
        limitRow({ name: "Ocio", spentCents: 9800, limitCents: 15000, color: "chart-3" }),
        limitRow({ name: "Comida", spentCents: 32000, limitCents: 35000, color: "chart-2" }),
        limitRow({ name: "Caprichos", spentCents: 11800, limitCents: 10000, color: "chart-5" }))),

    section("Patrimonio",
      h("div", { class: "ds-row ds-rings" },
        ring({ value: 1, max: 1, color: "savings", size: 132, center: money(214000), sub: "Ahorrado", label: `Ahorrado: ${money(214000)}` }),
        ring({ value: 1, max: 1, color: "investment", size: 132, center: money(96550), sub: "Invertido", label: `Invertido: ${money(96550)}` }))),

    section("Movimientos",
      h("ul", { class: "list" },
        txRow({ title: "Supermercado", category: "Comida", cents: 4732, type: "expense", date: "13 nov" }),
        txRow({ title: "Nómina", category: "Trabajo", cents: 184500, type: "income", date: "1 nov" }),
        txRow({ title: "Concierto", category: "Ocio", cents: 4500, type: "expense", date: "8 nov", photoUrl: placeholderPhoto() }))),

    section("Planificación",
      segmented("Repartir en", ["Porcentaje", "Cantidad"]),
      allocSlider("Gastos", 60, "expense"), allocSlider("Ahorro", 25, "savings"), allocSlider("Inversión", 15, "investment"),
      banner("Has repartido el 100 %. Perfecto.", "success"),
      banner("Te pasas un 10 %: baja algún reparto.", "warning")),

    section("Calendario",
      calendar(2026, 10, { 1: ["income"], 3: ["expense"], 8: ["expense", "note"], 13: ["expense", "reminder"], 20: ["pot"], 25: ["expense", "income"] }, { selected: 13, today: 13 }),
      actionMenu("Acciones del 13 de noviembre", [
        { label: "Apuntar movimiento", icon: ReceiptText }, { label: "Escribir nota", icon: StickyNote }, { label: "Crear aviso", icon: Bell },
      ])),

    section("Asistente",
      h("ul", { class: "chat" },
        chatBubble("assistant", "Llevas gastado un 12 % menos que en octubre. Si sigues así, te sobrarán unos 90 € para tu meta del viaje.", { greeting: true }),
        chatBubble("user", "¿Cuál fue mi mayor gasto el mes pasado?", { time: "10:42" }),
        chatBubble("assistant", "El alquiler, 550 €, el día 1. Sin contarlo, la compra del día 14: 150 €.", { time: "10:42" })),
      chatComposer(),
      chatComposer({ disabled: true, hint: "Has usado tus preguntas de hoy", micAvailable: false }),
      row(micButton(), micButton({ listening: true })),
      assistantFab()),

    section("Planes",
      planCard({ name: "Mensual", price: "4,99 €", per: "al mes", perks: ["Movimientos sin límite", "Asistente", "PDF del mes"], cta: "Elegir mensual" }),
      planCard({ name: "Anual", price: "34,99 €", per: "al año", note: "Sale a 2,92 € al mes. 7 días gratis.", perks: ["Todo lo del mensual", "Resumen del mes completo"], featured: true, cta: "Probar gratis" })),

    section("Estados vacíos y avisos",
      card(emptyState("Aún no hay movimientos", "Apunta el primero con el botón +. Tarda menos de 10 segundos.", ReceiptText,
        button("Apuntar el primero", { icon: Plus }))),
      banner("Sin conexión. Lo que apuntes se guarda en el móvil.", "info"),
      banner("No se pudo guardar la foto: el móvil no tiene espacio.", "danger")),

    section("Barra de pestañas", h("div", { class: "ds-tabbar" }, tabbar("inicio"))),
    txSheet, recap,
  );
  return page;
}

/** Foto de ejemplo dibujada aquí (no es del original): un degradado. */
function placeholderPhoto(): string {
  const c = document.createElement("canvas"); c.width = c.height = 88;
  const g = c.getContext("2d")!; const gr = g.createLinearGradient(0, 0, 88, 88);
  gr.addColorStop(0, "#5b3a8c"); gr.addColorStop(1, "#f08a5d"); g.fillStyle = gr; g.fillRect(0, 0, 88, 88);
  return c.toDataURL();
}
