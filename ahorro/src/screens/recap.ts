// S18 Resumen del mes (historias + reflexión), S19 Hace un mes, S20 Rachas, S22 Qué significan las cifras.
import { BookOpen, CalendarClock, Camera, Flame, Play, Target } from "lucide";
import { addMonths, dayLabel, longDay, monthLabel, thisMonth } from "../data/dates";
import {
  REFLECTION_QUESTIONS, buildSummary, getRecap, getTransaction, listReflections, markRecapSeen, monthSummary, oneMonthAgo, saveReflection, streaks,
} from "../data/repo";
import type { Month, RecapSummary } from "../data/types";
import { button, emptyState, kpi, stories, tile, toast } from "../ui/components";
import { h, money } from "../ui/dom";
import { screen, sectionTitle } from "../app/layout";
import type { Query } from "../app/router";
import { photoUrl } from "../app/util";
import { monthParam } from "./home";

export async function recapScreen([m]: string[], q: Query): Promise<HTMLElement> {
  const month = /^\d{4}-\d{2}$/.test(m) ? m : addMonths(thisMonth(), -1);
  const saved = await getRecap(month);
  const live = month >= thisMonth();
  const s = saved?.summary ?? (await buildSummary(month));
  const name = monthLabel(month, { year: false });
  if (!s.txCount) {
    return screen({ title: `Resumen de ${name}`, back: `#/?mes=${month}` },
      emptyState("No hay nada que resumir", `No apuntaste movimientos en ${name}.`, BookOpen));
  }
  const photos = (await Promise.all(s.photoTxIds.map(async (id) => {
    const [t, src] = await Promise.all([getTransaction(id), photoUrl(id)]);
    return t && src ? { src, alt: `${t.title || "Movimiento"}, ${money(t.amountCents)}`, href: `#/movimiento/${id}` } : null;
  }))).filter((x): x is { src: string; alt: string; href: string } => !!x);

  const story = stories(slidesFor(s, photos, live));
  story.addEventListener("close", () => story.remove());
  const play = () => { document.body.append(story); story.showModal(); markRecapSeen(month); };

  const refl = await listReflections(month);
  const questions = h("form", { class: "stack-sm", novalidate: true },
    ...REFLECTION_QUESTIONS.map((question, i) => {
      const id = `refl-${i}`;
      return h("div", { class: "field" }, h("label", { class: "field-label", for: id }, question),
        h("textarea", { id, name: question, class: "input textarea", rows: 2, maxlength: 600 }, refl.find((r) => r.question === question)?.answer ?? ""));
    }),
    button("Guardar respuestas", { type: "submit", variant: "secondary" }));
  questions.addEventListener("submit", async (e) => {
    e.preventDefault();
    for (const [question, answer] of new FormData(questions).entries()) await saveReflection(month, question, String(answer));
    toast("Respuestas guardadas");
  });

  const startAt = q.get("auto") === "1" && !saved?.seenAt;
  if (startAt) setTimeout(play, 50);

  return screen({ title: `Resumen de ${name}`, back: `#/?mes=${month}` },
    live ? h("p", { class: "muted" }, "El mes aún no ha terminado: el resumen se completa cuando acabe.") : null,
    button("Ver la historia del mes", { size: "lg", block: true, icon: Play, onClick: play }),
    h("section", { class: "card stack-sm" },
      h("div", { class: "kpis" }, kpi("Entró", s.incomeCents, "income"), kpi("Gastado", s.expenseCents, "expense"), kpi("Ahorrado", s.savedCents, "savings"), kpi("Invertido", s.investedCents, "investment")),
      h("dl", { class: "facts" },
        h("dt", {}, "Empezaste con"), h("dd", { class: "num" }, money(s.liquidStartCents)),
        h("dt", {}, live ? "Llevas" : "Terminaste con"), h("dd", { class: "num" }, money(s.liquidEndCents)),
        h("dt", {}, "Movimientos"), h("dd", {}, String(s.txCount)),
        s.topCategory ? h("dt", {}, "Donde más gastaste") : null, s.topCategory ? h("dd", {}, `${s.topCategory.name} (${money(s.topCategory.cents)})`) : null,
        s.biggestExpense ? h("dt", {}, "El gasto más grande") : null, s.biggestExpense ? h("dd", {}, `${s.biggestExpense.title}, ${money(s.biggestExpense.cents)} el ${dayLabel(s.biggestExpense.occurredOn)}`) : null)),
    photos.length ? h("section", { class: "stack-sm" }, sectionTitle("Tus momentos"),
      h("ul", { class: "photo-grid" }, ...photos.map((p) => h("li", {}, h("a", { href: p.href }, h("img", { src: p.src, alt: p.alt })))))) : null,
    h("section", { class: "stack-sm" }, sectionTitle("Para pensar"),
      h("p", { class: "muted" }, "Sin culpa: solo para que el mes que viene sea un poco mejor. Las respuestas se quedan en tu móvil."), questions),
  );
}

function slidesFor(s: RecapSummary, photos: { src: string; alt: string }[], live: boolean) {
  const name = monthLabel(s.month, { year: false });
  const diff = s.prevExpenseCents ? Math.round(((s.expenseCents - s.prevExpenseCents) / s.prevExpenseCents) * 100) : null;
  const apart = s.savedCents + s.investedCents;
  const slides: Parameters<typeof stories>[0] = [
    { kicker: name, title: live ? "Tu mes, hasta hoy" : "Así fue tu mes", body: `${s.txCount} movimientos${photos.length ? ` y ${photos.length} fotos` : ""}. Vamos a repasarlo.` },
    { kicker: "Lo que entró", title: money(s.incomeCents), body: `Empezaste con ${money(s.liquidStartCents)} disponibles.`, tone: "income" },
    { kicker: "Lo que gastaste", title: money(s.expenseCents),
      body: [diff === null ? "" : diff === 0 ? "Igual que el mes anterior." : `Un ${Math.abs(diff)} % ${diff > 0 ? "más" : "menos"} que el mes anterior.`,
        s.topCategory ? `Donde más: ${s.topCategory.name}.` : ""].filter(Boolean).join(" "), tone: "expense" },
  ];
  if (photos.length) slides.push({ kicker: "Tus momentos", title: "Detrás de cada gasto, algo que viviste", photos, tone: "accent" });
  slides.push({ kicker: "Lo que apartaste", title: money(apart),
    body: s.incomeCents ? `Ahorro e inversión juntos: el ${Math.round((apart / s.incomeCents) * 100)} % de lo que entró.` : "Entre ahorro e inversión.", tone: "savings" });
  if (s.plan && s.actual) slides.push({ kicker: "Tu plan", title: s.actual.expensesPct <= s.plan.expensesPct ? "Cumpliste con tus gastos" : "Los gastos se pasaron del plan",
    body: `Gastos: ${s.actual.expensesPct} % de ${s.plan.expensesPct} %. Ahorro: ${s.actual.savingsPct} % de ${s.plan.savingsPct} %. Inversión: ${s.actual.investmentsPct} % de ${s.plan.investmentsPct} %.`, tone: "investment" });
  slides.push({ kicker: live ? "Por ahora" : "Para cerrar", title: `${s.balanceCents >= 0 ? "Te sobraron" : "Te faltaron"} ${money(Math.abs(s.balanceCents))}`,
    body: live ? "Aún queda mes." : `Terminaste ${name} con ${money(s.liquidEndCents)} disponibles. Abajo tienes tres preguntas para pensar.`, tone: s.balanceCents >= 0 ? "success" : "danger" });
  return slides;
}

/* S19 ------------------------------------------------------------------------- */
export async function memoryScreen(): Promise<HTMLElement> {
  const ago = await oneMonthAgo();
  if (!ago) return screen({ title: "Hace un mes", back: "#/" }, emptyState("Aún no hay recuerdos", "Cuando lleves un mes apuntando, aquí verás qué hacías ese día.", CalendarClock));
  const items = await Promise.all(ago.txs.map(async (t) => {
    const src = t.hasPhoto ? await photoUrl(t.id) : undefined;
    return h("li", { class: "memory" },
      src ? h("img", { src, alt: t.title || "Foto del movimiento" }) : null,
      h("a", { class: "memory-text", href: `#/movimiento/${t.id}` }, h("span", { class: "tx-title" }, t.title || "Sin concepto"),
        h("span", { class: `num tx-amount ${t.type}` }, `${t.type === "income" ? "+" : "−"}${money(t.amountCents)}`)));
  }));
  return screen({ title: "Hace un mes", back: "#/" },
    h("h2", { class: "section-title" }, longDay(ago.day)),
    h("ul", { class: "list" }, ...items),
    h("p", { class: "muted" }, "¿Lo volverías a hacer?"));
}

/* S20 -------------------------------------------------------------------------- */
export async function streaksScreen(): Promise<HTMLElement> {
  const st = await streaks();
  return screen({ title: "Rachas", back: "#/" },
    h("div", { class: "tiles" },
      tile({ title: "Días seguidos", body: String(st.openDays), icon: Flame, tone: "warning" }),
      tile({ title: "Movimientos con foto", body: String(st.photoTx), icon: Camera, tone: "accent" }),
      tile({ title: "Meses en positivo", body: String(st.greenMonths), icon: Target, tone: "success" })),
    h("section", { class: "stack-sm" }, sectionTitle("Últimos 6 meses"),
      h("ol", { class: "months-line" }, ...st.greenHistory.map((g) => h("li", { class: `month-dot ${g.green === null ? "none" : g.green ? "green" : "red"}` },
        h("span", { class: "dot", "aria-hidden": "true" }), h("span", {}, monthLabel(g.month, { year: false }).slice(0, 3)),
        h("span", { class: "sr-only" }, g.green === null ? ": sin datos" : g.green ? ": entró más de lo que gastaste" : ": gastaste más de lo que entró"))))),
    h("dl", { class: "facts" },
      h("dt", {}, "Días seguidos"), h("dd", {}, "Cuenta los días que abres la app, sin saltarte ninguno."),
      h("dt", {}, "Con foto"), h("dd", {}, "Tus últimos movimientos seguidos que llevan foto."),
      h("dt", {}, "En positivo"), h("dd", {}, "Meses terminados en los que entró más de lo que gastaste.")));
}

/* S22 -------------------------------------------------------------------------- */
export async function infoScreen(_: string[], q: Query): Promise<HTMLElement> {
  const month: Month = monthParam(q);
  const s = await monthSummary(month);
  return screen({ title: "Qué significan las cifras", back: `#/?mes=${month}` },
    h("dl", { class: "facts" },
      h("dt", {}, "Entró"), h("dd", {}, `Todos los ingresos apuntados en ${monthLabel(month, { year: false })}: ${money(s.incomeCents)}.`),
      h("dt", {}, "Gastado"), h("dd", {}, `Todos los gastos: ${money(s.expenseCents)}.`),
      h("dt", {}, "Ahorrado"), h("dd", {}, `Lo que metiste en huchas de ahorro menos lo que sacaste: ${money(s.savedCents)}.`),
      h("dt", {}, "Invertido"), h("dd", {}, `Igual, en tus huchas de inversión: ${money(s.investedCents)}.`),
      h("dt", {}, "Te queda"), h("dd", {}, `Entró − gastado − ahorrado − invertido = ${money(s.balanceCents)}. Es lo que aún puedes usar este mes sin tocar tus huchas.`)),
    h("p", { class: "muted" }, "Los saldos que ya tenías al empezar no cuentan como ahorro del mes. Tampoco es asesoramiento financiero: solo tus números, ordenados."));
}
