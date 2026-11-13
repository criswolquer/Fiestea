// S09 Gráficos, S10 Movimientos de una categoría, S11 Límites, gestión de categorías.
import { ChartPie, Gauge, Plus, Tags } from "lucide";
import { addMonths, monthLabel, thisMonth } from "../data/dates";
import {
  categoryBreakdown, limitsCheck, listCategories, listTransactions, markFirstStep, monthSummary, setLimit, upsertCategory,
} from "../data/repo";
import type { Category, CategoryKind, TxType } from "../data/types";
import { banner, bars, button, donut, emptyState, field, limitRow, monthSwitcher, moneyField, parseMoney, ring, setFieldError, toast } from "../ui/components";
import { h, icon, money, pct } from "../ui/dom";
import { CATEGORY_ICONS, categoryIcon, categoryIconName } from "../ui/caticons";
import { screen, sectionTitle } from "../app/layout";
import { openSheet } from "../app/dialogs";
import { refresh, type Query } from "../app/router";
import { centsToInput, errorText, go, photoUrl } from "../app/util";
import { monthParam, txItem } from "./home";

const KIND_LABEL: Record<CategoryKind, string> = { fijo: "Fijos", discrecional: "A elegir", deuda: "Deudas" };
const KIND_HELP: Record<CategoryKind, string> = { fijo: "Lo que pagas sí o sí cada mes", discrecional: "Lo que podrías no gastar", deuda: "Cuotas y préstamos" };

function switcher(path: string, month: string, extra = ""): HTMLElement {
  const cur = thisMonth();
  return monthSwitcher(monthLabel(month), {
    onPrev: () => go(`${path}?mes=${addMonths(month, -1)}${extra}`),
    onNext: () => go(`${path}?mes=${addMonths(month, 1)}${extra}`),
    nextDisabled: month >= cur,
  });
}

/* S09 ------------------------------------------------------------------------ */
export async function chartsScreen(_: string[], q: Query): Promise<HTMLElement> {
  const month = monthParam(q);
  const type: TxType = q.get("tipo") === "ingresos" ? "income" : "expense";
  const [b, prev] = await Promise.all([categoryBreakdown(month, type), monthSummary(addMonths(month, -1))]);
  const prevTotal = type === "expense" ? prev.expenseCents : prev.incomeCents;

  const tabs = h("nav", { class: "segmented seg-links", "aria-label": "Qué ver" },
    h("a", { href: `#/graficos?mes=${month}`, "aria-current": type === "expense" ? "page" : undefined }, "Gastos"),
    h("a", { href: `#/graficos?mes=${month}&tipo=ingresos`, "aria-current": type === "income" ? "page" : undefined }, "Ingresos"));

  if (!b.totalCents) {
    return screen({ title: "Gráficos", back: `#/?mes=${month}`, header: switcher("#/graficos", month, type === "income" ? "&tipo=ingresos" : "") },
      tabs, emptyState(type === "expense" ? "Sin gastos este mes" : "Sin ingresos este mes", "Cuando apuntes alguno, verás aquí a dónde va cada euro.", ChartPie));
  }

  const segs = b.segments.map((s) => ({ label: s.category?.name ?? "Sin categoría", cents: s.cents, color: s.category?.color ?? "chart-7" }));
  const diff = prevTotal ? Math.round(((b.totalCents - prevTotal) / prevTotal) * 100) : null;
  const compare = diff === null ? null : h("p", { class: "muted center" },
    diff === 0 ? `Igual que en ${monthLabel(addMonths(month, -1), { year: false })}.` :
    `${Math.abs(diff)} % ${diff > 0 ? "más" : "menos"} que en ${monthLabel(addMonths(month, -1), { year: false })} (${money(prevTotal)}).`);

  const rows = h("ul", { class: "list" }, ...b.segments.map((s) => h("li", {},
    h("a", { class: "cat-row", href: `#/categoria/${s.category?.id ?? "sin"}?mes=${month}`, style: `--cat:var(--${s.category?.color ?? "chart-7"})` },
      h("span", { class: "cat-icon", "aria-hidden": "true" }, icon(categoryIcon(s.category), { size: 18 })),
      h("span", { class: "cat-name" }, s.category?.name ?? "Sin categoría"),
      h("span", { class: "muted num" }, `${pct(s.cents, b.totalCents)} %`),
      h("span", { class: "num cat-amount" }, money(s.cents))))));

  const kinds = type === "expense" ? h("section", { class: "stack-sm" },
    sectionTitle("Tipo de gasto"),
    h("div", { class: "kind-rings" }, ...(Object.keys(KIND_LABEL) as CategoryKind[]).map((k, i) =>
      h("div", { class: "kind" },
        ring({ value: b.byKind[k], max: b.totalCents, color: ["chart-1", "chart-3", "chart-5"][i], size: 88, showPct: true, sub: KIND_LABEL[k], label: `${KIND_LABEL[k]}: ${pct(b.byKind[k], b.totalCents)} %, ${money(b.byKind[k])}` }),
        h("span", { class: "muted num" }, money(b.byKind[k])), h("span", { class: "kind-help" }, KIND_HELP[k])))),
  ) : null;

  return screen({ title: "Gráficos", back: `#/?mes=${month}`, header: switcher("#/graficos", month, type === "income" ? "&tipo=ingresos" : "") },
    tabs,
    h("section", { class: "card" }, donut(segs, { title: type === "expense" ? "Gastos por categoría" : "Ingresos por categoría" }), compare),
    h("section", { class: "stack-sm" }, sectionTitle("Por categoría"), rows),
    h("section", { class: "stack-sm" }, sectionTitle(type === "expense" ? "Gasto por día" : "Ingresos por día"),
      h("div", { class: "card" }, bars(b.byDay, { color: type === "expense" ? "expense" : "income", label: type === "expense" ? "Gasto por día" : "Ingresos por día" }),
        h("div", { class: "bars-axis muted", "aria-hidden": "true" }, h("span", {}, "1"), h("span", {}, "15"), h("span", {}, String(b.byDay.length))))),
    kinds,
  );
}

/* S10 ------------------------------------------------------------------------ */
export async function categoryScreen([id]: string[], q: Query): Promise<HTMLElement> {
  const month = monthParam(q);
  const cats = await listCategories(undefined, { includeArchived: true });
  const cat = cats.find((c) => c.id === id);
  if (id !== "sin" && !cat) throw new Error("Esa categoría ya no existe.");
  const txs = await listTransactions({ month, categoryId: cat ? cat.id : null });
  const total = txs.reduce((a, t) => a + t.amountCents, 0);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const photos = (await Promise.all(txs.filter((t) => t.hasPhoto).map(async (t) => [t, await photoUrl(t.id)] as const))).filter(([, u]) => u);
  return screen({ title: cat?.name ?? "Sin categoría", back: `#/graficos?mes=${month}${cat?.type === "income" ? "&tipo=ingresos" : ""}`, header: switcher(`#/categoria/${id}`, month) },
    h("h2", { class: "big-title" }, cat?.name ?? "Sin categoría"),
    h("p", { class: "muted" }, `${txs.length} ${txs.length === 1 ? "movimiento" : "movimientos"} · ${money(total)}`,
      cat?.monthlyLimitCents ? ` · límite ${money(cat.monthlyLimitCents)}` : ""),
    photos.length ? h("ul", { class: "photo-grid", "aria-label": "Fotos" }, ...photos.map(([t, u]) =>
      h("li", {}, h("a", { href: `#/movimiento/${t.id}` }, h("img", { src: u!, alt: `${t.title || "Movimiento"}, ${money(t.amountCents)}` }))))) : null,
    txs.length ? h("ul", { class: "list" }, ...(await Promise.all(txs.map((t) => txItem(t, byId)))))
      : emptyState("Nada en esta categoría", `No hay movimientos de ${cat?.name ?? "sin categoría"} en ${monthLabel(month, { year: false })}.`, Tags),
  );
}

/* S11 ------------------------------------------------------------------------ */
export async function limitsScreen(_: string[], q: Query): Promise<HTMLElement> {
  const month = monthParam(q);
  const [s, cats, check] = await Promise.all([monthSummary(month), listCategories("expense"), limitsCheck(month)]);
  const withLimit = s.limits;
  const without = cats.filter((c) => !c.monthlyLimitCents);
  const spent = withLimit.reduce((a, l) => a + l.spentCents, 0), cap = withLimit.reduce((a, l) => a + l.limitCents, 0);
  const back = q.get("volver") ?? `#/?mes=${month}`;

  const top = withLimit.length ? h("div", { class: "hero" },
    ring({ value: spent, max: cap, color: spent > cap ? "danger" : "accent", size: 180, center: money(Math.max(0, cap - spent)), sub: spent > cap ? "por encima del total" : "te queda en tus límites",
      label: `Has gastado ${money(spent)} de ${money(cap)} en las categorías con límite` }),
    h("p", { class: "muted" }, `${money(spent)} de ${money(cap)} en ${withLimit.length} ${withLimit.length === 1 ? "categoría" : "categorías"}`)) : null;

  const rebalance = check ? banner(`Tus límites suman ${money(check.limitsTotalCents)} y para gastar tienes ${money(check.availableCents)}. ¿Los bajamos en proporción?`, "warning",
    button("Ajustar", { size: "sm", variant: "secondary", onClick: async () => {
      for (const p of check.proposal) await setLimit(p.id, p.to);
      toast("Límites ajustados"); refresh();
    } })) : null;

  const rows = h("ul", { class: "list" }, ...withLimit.map((l) => {
    const li = limitRow({ name: l.category.name, spentCents: l.spentCents, limitCents: l.limitCents, color: l.category.color });
    const btn = h("button", { type: "button", class: "row-overlay", "aria-label": `Cambiar límite de ${l.category.name}` });
    btn.addEventListener("click", () => editLimit(l.category));
    li.append(btn); li.classList.add("has-overlay");
    return li;
  }));

  return screen({ title: "Límites", back, header: switcher("#/limites", month) },
    h("p", { class: "muted" }, "Ponle un tope a lo que más se te escapa. Te avisamos al llegar al 85 %."),
    rebalance, top,
    withLimit.length ? rows : emptyState("Aún no tienes límites", "Elige una categoría de abajo y ponle un tope mensual.", Gauge),
    without.length ? h("section", { class: "stack-sm" }, sectionTitle("Sin límite"),
      h("ul", { class: "list" }, ...without.map((c) => h("li", { class: "plain-row", style: `--cat:var(--${c.color})` },
        h("span", { class: "cat-icon", "aria-hidden": "true" }, icon(categoryIcon(c), { size: 18 })), h("span", { class: "cat-name" }, c.name),
        button("Poner límite", { size: "sm", variant: "secondary", onClick: () => editLimit(c) }))))) : null,
  );
}

function editLimit(c: Category): void {
  const f = moneyField("Límite al mes", { name: "limit", big: true, value: c.monthlyLimitCents ? centsToInput(c.monthlyLimitCents) : "" });
  const form = h("form", { class: "stack-sm", novalidate: true }, f,
    button("Guardar", { type: "submit", block: true }),
    c.monthlyLimitCents ? button("Quitar el límite", { variant: "ghost", block: true, onClick: async () => { await setLimit(c.id, null); d.close(); toast("Límite quitado"); refresh(); } }) : null);
  const d = openSheet(`Límite de ${c.name}`, form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = parseMoney(String(new FormData(form).get("limit")));
    if (!v) { setFieldError(f, "Escribe un importe mayor que cero."); return; }
    await setLimit(c.id, v); await markFirstStep("limites");
    d.close(); toast("Límite guardado"); refresh();
  });
}

/* Categorías ------------------------------------------------------------------ */
export async function categoriesScreen(_: string[], q: Query): Promise<HTMLElement> {
  const all = await listCategories(undefined, { includeArchived: true });
  const back = q.get("volver") ?? "#/ajustes";
  const group = (type: TxType, title: string) => h("section", { class: "stack-sm" },
    sectionTitle(title, button("Nueva", { size: "sm", variant: "secondary", icon: Plus, onClick: () => editCategory({ type }) })),
    h("ul", { class: "list" }, ...all.filter((c) => c.type === type).map((c) => h("li", {},
      h("button", { type: "button", class: `plain-row as-button${c.archived ? " is-archived" : ""}`, onclick: () => editCategory(c), style: `--cat:var(--${c.color})` },
        h("span", { class: "cat-icon", "aria-hidden": "true" }, icon(categoryIcon(c), { size: 18 })),
        h("span", { class: "cat-name" }, c.name),
        h("span", { class: "muted" }, c.archived ? "Archivada" : c.kind ? KIND_LABEL[c.kind] : ""))))));
  return screen({ title: "Categorías", back }, group("expense", "De gasto"), group("income", "De ingreso"));
}

function editCategory(c: Partial<Category> & { type: TxType }): void {
  const name = field("Nombre", { name: "name", value: c.name, required: true, maxlength: 40 });
  const colors = h("fieldset", { class: "chips" }, h("legend", { class: "field-label" }, "Color"),
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => {
      const id = `color-${n}`;
      return h("span", { class: "chip-opt" },
        h("input", { type: "radio", name: "color", value: `chart-${n}`, id, class: "seg-input", checked: (c.color ?? "chart-1") === `chart-${n}` }),
        h("label", { for: id, class: "chip color-chip", style: `--chip:var(--chart-${n})`, "aria-label": `Color ${n}` }));
    }));
  const kind = c.type === "expense" ? h("div", { class: "field" },
    h("label", { class: "field-label", for: "cat-kind" }, "Tipo de gasto"),
    h("select", { id: "cat-kind", name: "kind", class: "input" },
      ...(Object.keys(KIND_LABEL) as CategoryKind[]).map((k) => h("option", { value: k, selected: (c.kind ?? "discrecional") === k }, `${KIND_LABEL[k]}: ${KIND_HELP[k].toLowerCase()}`)))) : null;
  const current = categoryIconName({ name: c.name ?? "", icon: c.icon });
  const icons = h("fieldset", { class: "chips icon-picker" }, h("legend", { class: "field-label" }, "Icono"),
    ...Object.entries(CATEGORY_ICONS).map(([k, ic]) => {
      const id = `icon-${k}`;
      return h("span", { class: "chip-opt" },
        h("input", { type: "radio", name: "icon", value: k, id, class: "seg-input", checked: k === current }),
        h("label", { for: id, class: "chip icon-chip", "aria-label": k }, icon(ic, { size: 18 })));
    }));
  const form = h("form", { class: "stack-sm", novalidate: true }, name, kind, icons, colors,
    button("Guardar", { type: "submit", block: true }),
    c.id ? button(c.archived ? "Volver a usarla" : "Archivar", { variant: "ghost", block: true, onClick: async () => {
      await upsertCategory({ ...(c as Category), archived: !c.archived }); d.close(); refresh();
    } }) : null,
    c.id && !c.archived ? h("p", { class: "muted" }, "Archivar la esconde al apuntar, pero sus movimientos se quedan.") : null);
  const d = openSheet(c.id ? "Editar categoría" : c.type === "expense" ? "Nueva categoría de gasto" : "Nueva categoría de ingreso", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const n = String(fd.get("name") ?? "").trim();
    if (!n) { setFieldError(name, "Ponle un nombre."); return; }
    try {
      await upsertCategory({ ...c, name: n, color: String(fd.get("color") ?? "chart-1"), icon: String(fd.get("icon") ?? "") || undefined, kind: (fd.get("kind") as CategoryKind) ?? undefined });
      d.close(); toast("Categoría guardada"); refresh();
    } catch (err) { setFieldError(name, errorText(err)); }
  });
}

