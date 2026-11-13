// S14 Planificación del mes y comparación con lo real.
import { addMonths, monthLabel, thisMonth } from "../data/dates";
import { getPlan, markFirstStep, monthSummary, planVsActual, savePlan } from "../data/repo";
import { allocSlider, banner, button, moneyField, monthSwitcher, parseMoney, ring, segmented, setFieldError, toast } from "../ui/components";
import { h, money } from "../ui/dom";
import { screen, sectionTitle } from "../app/layout";
import { refresh, type Query } from "../app/router";
import { centsToInput, go } from "../app/util";
import { monthParam } from "./home";

const PARTS = [
  { key: "expensesBp", label: "Gastos", color: "expense" },
  { key: "savingsBp", label: "Ahorro", color: "savings" },
  { key: "investmentsBp", label: "Inversión", color: "investment" },
] as const;

export async function planScreen(_: string[], q: Query): Promise<HTMLElement> {
  const month = monthParam(q);
  const [plan, s, prev, cmp] = await Promise.all([getPlan(month), monthSummary(month), monthSummary(addMonths(month, -1)), planVsActual(month)]);
  let mode: "pct" | "amount" = plan?.mode ?? "pct";
  const bp: Record<string, number> = { expensesBp: plan?.expensesBp ?? 6000, savingsBp: plan?.savingsBp ?? 2500, investmentsBp: plan?.investmentsBp ?? 1500 };
  const guessIncome = plan?.plannedIncomeCents ?? (s.incomeCents || prev.incomeCents);
  const income = moneyField("Ingresos previstos este mes", { name: "income", big: true, value: guessIncome ? centsToInput(guessIncome) : "", hint: plan ? undefined : guessIncome ? "Lo hemos sacado de tus ingresos apuntados. Cámbialo si quieres." : "Lo que esperas que entre: nómina, extras…" });
  const incomeInput = income.querySelector("input")!;
  const parts = h("div", { class: "stack-sm" });
  const summary = h("div", { class: "stack-sm", "aria-live": "polite" });

  const incomeCents = () => parseMoney(incomeInput.value) ?? 0;
  const drawParts = () => {
    parts.replaceChildren(...PARTS.map((p) => {
      if (mode === "pct") {
        const el = allocSlider(p.label, Math.round(bp[p.key] / 100), p.color);
        const r = el.querySelector("input")!;
        const out = el.querySelector("output")!;
        const show = () => { const c = Math.round((incomeCents() * bp[p.key]) / 10000); out.textContent = `${r.value} %${c ? ` · ${money(c)}` : ""}`; };
        r.addEventListener("input", () => { bp[p.key] = Number(r.value) * 100; show(); drawSummary(); });
        show();
        return el;
      }
      const f = moneyField(p.label, { value: centsToInput(Math.round((incomeCents() * bp[p.key]) / 10000)) });
      const i = f.querySelector("input")!;
      i.addEventListener("input", () => { const c = parseMoney(i.value) ?? 0; const inc = incomeCents(); bp[p.key] = inc ? Math.round((c / inc) * 10000) : 0; drawSummary(); });
      return f;
    }));
  };
  const drawSummary = () => {
    const total = PARTS.reduce((a, p) => a + bp[p.key], 0);
    const inc = incomeCents();
    const free = Math.round((inc * (10000 - total)) / 10000);
    summary.replaceChildren(...[
      h("div", { class: "hero" }, ring({ value: Math.min(total, 10000), max: 10000, color: total > 10000 ? "danger" : "accent", size: 160,
        center: `${Math.round(total / 100)} %`, sub: "repartido", label: `Has repartido el ${Math.round(total / 100)} % de tus ingresos` }),
        inc ? h("p", { class: "muted" }, total > 10000 ? `Te pasas en ${money(-free)}.` : `Sin asignar: ${money(free)}.`) : null),
      total > 10000 ? banner(`Te pasas un ${Math.round((total - 10000) / 100)} %. Baja algún reparto.`, "warning")
        : total === 10000 ? banner("Has repartido el 100 %. Cada euro tiene su sitio.", "success") : null,
    ].filter((x): x is HTMLElement => !!x));
    save.disabled = total > 10000;
  };

  const save = button("Guardar plan", { block: true, size: "lg", type: "submit" });
  const form = h("form", { class: "stack", novalidate: true },
    income,
    h("div", { class: "row-between" }, h("span", { class: "field-label" }, "Repartir en"),
      segmented("Repartir en", ["%", "Cantidad"], mode === "pct" ? 0 : 1, (i) => { mode = i ? "amount" : "pct"; drawParts(); })),
    parts, summary, save);
  incomeInput.addEventListener("input", () => { if (mode === "pct") drawParts(); drawSummary(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const inc = incomeCents();
    if (!inc) { setFieldError(income, "Escribe cuánto esperas ingresar, por ejemplo 1500."); return; }
    try {
      await savePlan({ month, plannedIncomeCents: inc, mode, expensesBp: bp.expensesBp, savingsBp: bp.savingsBp, investmentsBp: bp.investmentsBp });
      await markFirstStep("plan");
      toast("Plan guardado"); refresh();
    } catch (err) { toast((err as Error).message, "danger"); }
  });
  drawParts(); drawSummary();

  const compare = cmp ? h("section", { class: "stack-sm" },
    sectionTitle(month === thisMonth() ? "Cómo vas" : "Cómo te fue"),
    h("p", { class: "muted" }, `Sobre ${money(cmp.actualIncomeCents || cmp.plannedIncomeCents)} de ingresos${cmp.actualIncomeCents ? "" : " previstos"}.`),
    h("ul", { class: "list" }, ...PARTS.map((p, i) => {
      const planned = [cmp.plan.expensesPct, cmp.plan.savingsPct, cmp.plan.investmentsPct][i];
      const actual = [cmp.actual.expensesPct, cmp.actual.savingsPct, cmp.actual.investmentsPct][i];
      const good = i === 0 ? actual <= planned : actual >= planned;
      return h("li", { class: "compare" },
        h("span", { class: "cat-name" }, p.label),
        h("span", { class: "compare-bars", "aria-hidden": "true" },
          h("i", { class: "plan-bar", style: `width:${Math.min(planned, 100)}%` }),
          h("i", { class: "real-bar", style: `width:${Math.min(actual, 100)}%;background:var(--${p.color})` })),
        h("span", { class: `num compare-val ${good ? "ok" : "bad"}` }, `${actual} % de ${planned} %`),
        h("span", { class: "sr-only" }, good ? "Vas bien" : "Te has desviado"));
    }))) : null;

  return screen({ title: "Plan del mes", back: q.get("volver") ?? `#/?mes=${month}`, header: monthSwitcher(monthLabel(month), {
    onPrev: () => go(`#/plan?mes=${addMonths(month, -1)}`), onNext: () => go(`#/plan?mes=${addMonths(month, 1)}`),
  }) },
    h("p", { class: "muted" }, "Decide antes de que empiece el mes qué parte de lo que entra va a cada sitio. Al final, compáralo con lo que pasó."),
    compare, form);
}
