// S06 Inicio: el mes de un vistazo.
import { BookOpen, CalendarClock, ReceiptText, ChartPie, FileText, Flame, Gauge, Scale, Settings as Cog, Sparkles, Target } from "lucide";
import { addDays, addMonths, dayLabel, isValidYmd, longDay, monthLabel, thisMonth, today } from "../data/dates";
import { categoryIcon } from "../ui/caticons";
import { getSettings, listCategories, recordOpen, listRecaps, listTransactions, monthSummary, oneMonthAgo, streaks } from "../data/repo";
import { storageMode } from "../data/db";
import type { Category, Transaction } from "../data/types";
import { banner, emptyState, kpi, monthSwitcher, ring, tile } from "../ui/components";
import { h, icon, money } from "../ui/dom";
import { screen, sectionTitle } from "../app/layout";
import { go, photoUrl } from "../app/util";
import type { Query } from "../app/router";
import { newTxButton } from "./txform";
import { cloudBanner } from "./cloudui";
import { firstStepsCard } from "./firststeps";


export const monthParam = (q: Query) => { const m = q.get("mes") ?? ""; return isValidYmd(`${m}-01`) ? m : thisMonth(); };

export async function homeScreen(_: string[], q: Query): Promise<HTMLElement> {
  const settings = await getSettings();
  if (!settings.onboardedAt) { go("#/bienvenida"); return h("div"); }
  await recordOpen();
  const month = monthParam(q);
  const isCurrent = month === thisMonth();
  const [s, txs, cats, recaps, st, ago] = await Promise.all([
    monthSummary(month), listTransactions({ month }), listCategories(undefined, { includeArchived: true }), listRecaps(), streaks(), isCurrent ? oneMonthAgo() : null,
  ]);
  const catById = new Map(cats.map((c) => [c.id, c]));

  const header = monthSwitcher(monthLabel(month), {
    onPrev: () => go(`#/?mes=${addMonths(month, -1)}`),
    onNext: () => go(isCurrent ? "#/" : `#/?mes=${addMonths(month, 1)}`),
    nextDisabled: isCurrent,
    onInfo: () => go(`#/info?mes=${month}`),
  });

  // Anillo: lo que te sobra de lo que entró (entró − gastado). Ahorrar o invertir no cuenta como gasto.
  const left = s.balanceCents;
  const base = s.incomeCents;
  const ringEl = ring({
    value: Math.max(0, left), max: base || 1, color: left < 0 ? "danger" : "accent", size: 232, stroke: 16,
    center: money(Math.abs(left)),
    sub: left < 0 ? "gastado de más este mes" : base ? "te sobra este mes" : "aún no has apuntado ingresos",
    label: left < 0 ? `Este mes has gastado ${money(-left)} más de lo que entró` : `Te sobran ${money(left)} de ${money(base)} este mes`,
  });

  const unseen = recaps.find((r) => !r.seenAt);
  const banners = h("div", { class: "stack-sm" },
    await cloudBanner(),
    storageMode() === "memory" ? banner("Este navegador no deja guardar datos: lo que apuntes se perderá al cerrar.", "danger") : null,
    unseen ? banner(`Tu resumen de ${monthLabel(unseen.month, { year: false })} está listo.`, "success",
      h("a", { class: "btn btn-secondary btn-sm", href: `#/resumen/${unseen.month}?auto=1` }, "Verlo")) : null,
  );

  const quick = h("nav", { class: "quick", "aria-label": "Atajos del mes" },
    quickLink("Gráficos", `#/graficos?mes=${month}`, ChartPie),
    quickLink("Límites", `#/limites?mes=${month}`, Gauge),
    quickLink("Plan", `#/plan?mes=${month}`, Scale),
    quickLink("Informe", `#/informe/${month}`, FileText),
  );

  const recent = txs.slice(0, 8);
  const list = recent.length
    ? await txDayGroups(recent, catById)
    : emptyState(isCurrent ? "Aún no hay movimientos este mes" : "Este mes no tiene movimientos",
        isCurrent ? "Apunta el primero: importe, categoría y, si quieres, una foto." : "Puedes apuntar algo con fecha de ese mes.",
        ReceiptText, newTxButton("Apuntar el primero", `#/nuevo?fecha=${month}-01`));

  const tiles = isCurrent ? h("div", { class: "tiles" },
    tile({ title: "Racha", body: st.openDays === 1 ? "1 día" : `${st.openDays} días`, icon: Flame, tone: "warning", onClick: () => go("#/rachas") }),
    tile({ title: "Meses en positivo", body: st.greenMonths === 1 ? "1 seguido" : `${st.greenMonths} seguidos`, icon: Target, tone: "success", onClick: () => go("#/rachas") }),
    ago ? await agoTile(ago.day, ago.txs[0]) : tile({ title: "Hace un mes", body: "Aún no hay recuerdos", icon: CalendarClock, tone: "savings" }),
    tile({ title: "Asistente", body: "Pregúntale por tus gastos", icon: Sparkles, tone: "accent", onClick: () => go("#/asistente") }),
  ) : null;

  const steps = isCurrent ? await firstStepsCard(settings) : null;

  const spentPct = base ? Math.round((s.expenseCents / base) * 100) : 0;
  const apart = s.savedCents + s.investedCents;
  const heroNote = base
    ? `Has gastado el ${spentPct} % de lo que entró${apart > 0 ? ` y has apartado ${money(apart)}` : ""}.`
    : apart > 0 ? `Has apartado ${money(apart)} en tus huchas.` : null;
  return screen({ title: monthLabel(month), tab: "inicio", newHref: isCurrent ? "#/nuevo" : `#/nuevo?fecha=${month}-01`, header, actions: [
    h("a", { class: "btn btn-ghost btn-icon btn-md", href: "#/ajustes", "aria-label": "Ajustes" }, icon(Cog)),
  ] },
    banners,
    h("section", { class: "hero-card", "aria-label": "Resumen del mes" },
      h("div", { class: "hero-ring" }, ringEl),
      heroNote ? h("p", { class: "hero-note" }, heroNote) : null,
      h("div", { class: "kpis kpis-grid" },
        kpi("Entró", s.incomeCents, "income"), kpi("Gastado", s.expenseCents, "expense"),
        kpi("Ahorrado", s.savedCents, "savings"), kpi("Invertido", s.investedCents, "investment"))),
    quick,
    steps,
    tiles,
    h("section", { class: "stack-sm" },
      sectionTitle("Movimientos", txs.length > recent.length ? h("a", { href: `#/movimientos?mes=${month}` }, `Ver los ${txs.length}`) : null),
      list),
    isCurrent ? null : h("p", { class: "center" }, h("a", { href: `#/resumen/${month}` }, h("span", { class: "inline-icon" }, icon(BookOpen, { size: 16 })), " Ver el resumen de este mes")),
  );
}

function quickLink(label: string, href: string, ic: typeof ChartPie): HTMLElement {
  return h("a", { class: "quick-link", href }, h("span", { class: "quick-icon" }, icon(ic)), h("span", {}, label));
}

export async function txItem(t: Transaction, catById: Map<string, Category>, showDate = true): Promise<HTMLElement> {
  const cat = t.categoryId ? catById.get(t.categoryId) : undefined;
  const url = t.hasPhoto ? await photoUrl(t.id) : undefined;
  const sign = t.type === "income" ? "+" : "−";
  const tone = `--cat:var(--${cat?.color ?? "chart-7"})`;
  return h("li", {},
    h("a", { class: "tx-row", href: `#/movimiento/${t.id}`, style: tone },
      url ? h("span", { class: "tx-thumb tx-thumb-photo" }, h("img", { src: url, alt: "" }), h("span", { class: "tx-badge", "aria-hidden": "true" }, icon(categoryIcon(cat), { size: 12 })))
        : h("span", { class: "tx-thumb tx-thumb-icon", "aria-hidden": "true" }, icon(categoryIcon(cat), { size: 20 })),
      h("span", { class: "tx-main" },
        h("span", { class: "tx-title" }, t.title || cat?.name || "Sin concepto"),
        h("span", { class: "tx-sub" }, [cat?.name ?? "Sin categoría", showDate ? dayLabel(t.occurredOn) : ""].filter(Boolean).join(" · "))),
      h("span", { class: `tx-amount num ${t.type}` }, h("span", { class: "sr-only" }, t.type === "income" ? "Ingreso de " : "Gasto de "), `${sign}${money(t.amountCents)}`)));
}

/** Movimientos agrupados por día: «Hoy», «Ayer», «Jueves 12», con lo gastado ese día. */
export async function txDayGroups(txs: Transaction[], catById: Map<string, Category>): Promise<HTMLElement> {
  const days = new Map<string, Transaction[]>();
  for (const x of txs) (days.get(x.occurredOn) ?? days.set(x.occurredOn, []).get(x.occurredOn)!).push(x);
  const t0 = today(), t1 = addDays(t0, -1);
  const groups = await Promise.all([...days.entries()].map(async ([d, list]) => {
    const spent = list.filter((x) => x.type === "expense").reduce((a, x) => a + x.amountCents, 0);
    const name = d === t0 ? "Hoy" : d === t1 ? "Ayer" : longDay(d);
    return h("section", { class: "day-group" },
      h("h3", { class: "day-head" }, h("span", {}, name), spent ? h("span", { class: "num day-total" }, `−${money(spent)}`) : null),
      h("ul", { class: "list" }, ...(await Promise.all(list.map((x) => txItem(x, catById, false))))));
  }));
  return h("div", { class: "day-groups" }, ...groups);
}

async function agoTile(day: string, t: Transaction): Promise<HTMLElement> {
  const url = t.hasPhoto ? await photoUrl(t.id) : undefined;
  return h("a", { class: "tile tile-photo", href: "#/recuerdo", style: url ? `--photo:url(${url})` : undefined },
    h("span", { class: "tile-title" }, "Hace un mes"),
    h("span", { class: "tile-body" }, `${t.title || "Un movimiento"} · ${money(t.amountCents)}`),
    h("span", { class: "tile-foot" }, dayLabel(day)));
}

