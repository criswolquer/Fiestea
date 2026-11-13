// S15 Calendario y S16 avisos (recordatorios) y notas.
import { Bell, ReceiptText, StickyNote, Trash2 } from "lucide";
import { addMonths, isValidYmd, isoWeekday, longDay, monthLabel, monthOf, monthRange, today } from "../data/dates";
import {
  deleteNote, deleteReminder, listCategories, listNotes, listPotMovements, listPots, listReminders, listTransactions, reminderFallsOn, saveNote, saveReminder,
} from "../data/repo";
import type { Note, Reminder } from "../data/types";
import { actionMenu, button, calendar, field, monthSwitcher, segmented, setFieldError, toast, type DayMark } from "../ui/components";
import { h, icon, money } from "../ui/dom";
import { screen, sectionTitle } from "../app/layout";
import { confirmDialog, openSheet } from "../app/dialogs";
import { refresh, type Query } from "../app/router";
import { errorText, go } from "../app/util";
import { txItem } from "./home";

const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export async function calendarScreen(_: string[], q: Query): Promise<HTMLElement> {
  const dayQ = q.get("dia") ?? "";
  const day = isValidYmd(dayQ) ? dayQ : (q.get("mes") ? `${q.get("mes")}-01` : today());
  const month = monthOf(day);
  const [from, to] = monthRange(month);
  const [txs, notes, reminders, movs, pots, cats] = await Promise.all([
    listTransactions({ month }), listNotes(from, to), listReminders(), listPotMovements({ month }), listPots(), listCategories(undefined, { includeArchived: true })]);
  const potName = new Map(pots.map((p) => [p.id, p.name]));

  const marks: Record<number, DayMark[]> = {};
  const mark = (d: string, m: DayMark) => { const n = Number(d.slice(8)); (marks[n] ??= []).includes(m) || marks[n].push(m); };
  txs.forEach((t) => mark(t.occurredOn, t.type));
  movs.forEach((m) => mark(m.occurredOn, "pot"));
  notes.forEach((n) => mark(n.onDate, "note"));
  for (let d = 1; d <= Number(to.slice(8)); d++) {
    const ymd = `${month}-${String(d).padStart(2, "0")}`;
    if (reminders.some((r) => reminderFallsOn(r, ymd))) mark(ymd, "reminder");
  }

  const [y, m] = month.split("-").map(Number);
  const t = today();
  const grid = calendar(y, m - 1, marks, {
    selected: Number(day.slice(8)), today: monthOf(t) === month ? Number(t.slice(8)) : undefined,
    onPick: (d) => go(`#/calendario?dia=${month}-${String(d).padStart(2, "0")}`),
  });

  const dayTxs = txs.filter((x) => x.occurredOn === day);
  const dayNotes = notes.filter((n) => n.onDate === day);
  const dayRem = reminders.filter((r) => reminderFallsOn(r, day));
  const dayMovs = movs.filter((x) => x.occurredOn === day);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const here = encodeURIComponent(`#/calendario?dia=${day}`);

  const menu = actionMenu(`Acciones del ${longDay(day)}`, [
    { label: "Apuntar movimiento", icon: ReceiptText, onClick: () => go(`#/nuevo?fecha=${day}&volver=${here}`) },
    { label: "Escribir nota", icon: StickyNote, onClick: () => noteSheet(day) },
    { label: "Crear aviso", icon: Bell, onClick: () => reminderSheet(day) },
  ]);

  const dayEmpty = !dayTxs.length && !dayNotes.length && !dayRem.length && !dayMovs.length;
  const spent = dayTxs.filter((x) => x.type === "expense").reduce((a, x) => a + x.amountCents, 0);

  return screen({ title: "Calendario", tab: "calendario", header: monthSwitcher(monthLabel(month), {
    onPrev: () => go(`#/calendario?mes=${addMonths(month, -1)}`), onNext: () => go(`#/calendario?mes=${addMonths(month, 1)}`),
  }) },
    h("section", { class: "card" }, grid,
      h("p", { class: "legend-line muted", "aria-hidden": "true" },
        h("i", { class: "mark mark-income" }), "ingreso ", h("i", { class: "mark mark-expense" }), "gasto ",
        h("i", { class: "mark mark-pot" }), "hucha ", h("i", { class: "mark mark-note" }), "nota ", h("i", { class: "mark mark-reminder" }), "aviso")),
    h("section", { class: "stack-sm", "aria-labelledby": "day-title" },
      h("div", { class: "section-head" }, h("h2", { class: "section-title day-title", id: "day-title" }, longDay(day)), spent ? h("span", { class: "num expense-text" }, `−${money(spent)}`) : null),
      menu,
      dayEmpty ? h("p", { class: "muted" }, "Nada apuntado este día.") : null,
      dayRem.length ? h("ul", { class: "list" }, ...dayRem.map((r) => h("li", { class: "plain-row note-row" },
        h("span", { class: "mov-icon reminder" }, icon(Bell, { size: 18 })), h("span", { class: "cat-name" }, r.text, h("span", { class: "muted block" }, scheduleText(r)))))) : null,
      dayNotes.length ? h("ul", { class: "list" }, ...dayNotes.map((n) => h("li", {},
        h("button", { type: "button", class: "plain-row as-button note-row", onclick: () => noteSheet(day, n) },
          h("span", { class: "mov-icon note" }, icon(StickyNote, { size: 18 })), h("span", { class: "cat-name pre" }, n.text))))) : null,
      dayMovs.length ? h("ul", { class: "list" }, ...dayMovs.map((x) => h("li", {},
        h("a", { class: "plain-row as-button", href: `#/hucha/${x.potId}` }, h("span", { class: "swatch", style: "background:var(--savings)" }),
          h("span", { class: "cat-name" }, `${x.kind === "contribution" ? "Aporte a" : "Retirada de"} ${potName.get(x.potId) ?? "una hucha"}`),
          h("span", { class: "num" }, money(x.amountCents)))))) : null,
      dayTxs.length ? h("ul", { class: "list" }, ...(await Promise.all(dayTxs.map((x) => txItem(x, byId, false))))) : null),
    reminders.length ? h("section", { class: "stack-sm" }, sectionTitle("Tus avisos"),
      h("ul", { class: "list" }, ...reminders.map((r) => h("li", { class: "plain-row" },
        h("span", { class: "mov-icon reminder" }, icon(Bell, { size: 18 })),
        h("span", { class: "cat-name" }, r.text, h("span", { class: "muted block" }, scheduleText(r))),
        button(`Borrar aviso «${r.text}»`, { variant: "ghost", size: "sm", iconOnly: true, icon: Trash2, onClick: async () => {
          if (await confirmDialog("¿Borrar este aviso?", { ok: "Borrar", danger: true })) { await deleteReminder(r); refresh(); }
        } })))),
      h("p", { class: "muted" }, "Los avisos aparecen al abrir la app el día que toca.")) : null,
  );
}

function scheduleText(r: Reminder): string {
  if (r.schedule === "once") return `El ${longDay(r.onDate!)}`;
  if (r.schedule === "weekly") return `Cada ${WEEKDAYS[(r.weekday ?? 1) - 1]}`;
  return r.monthDay === 31 ? "El último día de cada mes" : `El día ${r.monthDay} de cada mes`;
}

function noteSheet(day: string, n?: Note): void {
  const ta = h("textarea", { class: "input textarea", id: "note-text", name: "text", rows: 4, maxlength: 2000, required: true }, n?.text ?? "");
  const f = h("div", { class: "field" }, h("label", { class: "field-label", for: "note-text" }, "Nota"), ta, h("p", { class: "field-msg", hidden: true, id: "note-text-msg" }));
  const form = h("form", { class: "stack-sm", novalidate: true }, f, button("Guardar", { type: "submit", block: true }),
    n ? button("Borrar nota", { variant: "danger", block: true, onClick: async () => { await deleteNote(n); d.close(); toast("Nota borrada"); refresh(); } }) : null);
  const d = openSheet(n ? `Nota del ${longDay(day)}` : `Nueva nota · ${longDay(day)}`, form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await saveNote(day, ta.value, n?.id); d.close(); toast("Nota guardada"); refresh(); }
    catch (err) { setFieldError(f, errorText(err)); }
  });
}

function reminderSheet(day: string): void {
  let schedule: Reminder["schedule"] = "once";
  const text = field("¿De qué te aviso?", { name: "text", required: true, maxlength: 200, placeholder: "Ej.: pagar el seguro" });
  const when = h("p", { class: "muted", "aria-live": "polite" });
  const dom = Number(day.slice(8));
  const describe = () => {
    when.textContent = schedule === "once" ? `Solo el ${longDay(day)}.` : schedule === "weekly" ? `Todos los ${WEEKDAYS[isoWeekday(day) - 1]}.`
      : dom >= 29 ? `El día ${dom} de cada mes (o el último, si el mes es más corto).` : `El día ${dom} de cada mes.`;
  };
  const form = h("form", { class: "stack-sm", novalidate: true }, text,
    segmented("Cuándo", ["Una vez", "Cada semana", "Cada mes"], 0, (i) => { schedule = (["once", "weekly", "monthly"] as const)[i]; describe(); }),
    when, button("Crear aviso", { type: "submit", block: true }));
  describe();
  const d = openSheet("Nuevo aviso", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await saveReminder({ text: String(new FormData(form).get("text") ?? ""), schedule,
        onDate: schedule === "once" ? day : undefined, weekday: schedule === "weekly" ? isoWeekday(day) : undefined,
        monthDay: schedule === "monthly" ? (dom === Number(monthRange(monthOf(day))[1].slice(8)) ? 31 : dom) : undefined });
      d.close(); toast("Aviso creado"); refresh();
    } catch (err) { setFieldError(text, errorText(err)); }
  });
}

