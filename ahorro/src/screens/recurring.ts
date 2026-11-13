// Movimientos fijos: se apuntan solos cada mes (#/fijos).
import { Plus, Repeat } from "lucide";
import { deleteRecurring, generateRecurring, listAccounts, listCategories, listRecurring, markFirstStep, upsertRecurring } from "../data/repo";
import type { Category, Recurring, TxType } from "../data/types";
import { button, emptyState, field, moneyField, parseMoney, segmented, setFieldError, toast } from "../ui/components";
import { h, icon, money } from "../ui/dom";
import { categoryIcon } from "../ui/caticons";
import { screen, sectionTitle } from "../app/layout";
import { confirmDialog, openSheet } from "../app/dialogs";
import { refresh, type Query } from "../app/router";
import { centsToInput, errorText } from "../app/util";
import { addMonths, thisMonth, today } from "../data/dates";

const dayText = (d: number) => (d === 31 ? "el último día" : `el día ${d}`);

export async function recurringScreen(_: string[], q: Query): Promise<HTMLElement> {
  const [recs, cats] = await Promise.all([listRecurring(), listCategories(undefined, { includeArchived: true })]);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const sum = (t: TxType) => recs.filter((r) => r.active && r.type === t).reduce((a, r) => a + r.amountCents, 0);
  const row = (r: Recurring) => {
    const c = r.categoryId ? byId.get(r.categoryId) : undefined;
    return h("li", {}, h("button", { type: "button", class: "tx-row", style: `--cat:var(--${c?.color ?? "chart-7"})`, onclick: () => editRecurring(r) },
      h("span", { class: "tx-thumb tx-thumb-icon", "aria-hidden": "true" }, icon(categoryIcon(c), { size: 20 })),
      h("span", { class: "tx-main" }, h("span", { class: "tx-title" }, r.title), h("span", { class: "tx-sub" }, `Cada mes, ${dayText(r.dayOfMonth)}${c ? ` · ${c.name}` : ""}`)),
      h("span", { class: `tx-amount num ${r.type}` }, `${r.type === "income" ? "+" : "−"}${money(r.amountCents)}`)));
  };
  const group = (t: TxType, title: string) => {
    const xs = recs.filter((r) => r.type === t);
    return xs.length ? h("section", { class: "stack-sm" }, sectionTitle(title, h("span", { class: "muted num" }, `${money(sum(t))} al mes`)),
      h("div", { class: "day-group" }, h("ul", { class: "list" }, ...xs.map(row)))) : null;
  };
  return screen({ title: "Fijos del mes", back: q.get("volver") ?? "#/", actions: [button("Añadir fijo", { variant: "ghost", size: "sm", iconOnly: true, icon: Plus, onClick: () => editRecurring({}) })] },
    h("p", { class: "muted" }, "Lo que se repite cada mes (nómina, alquiler, suscripciones, cuotas) se apunta solo el día que toca. Si ese día no abres la app, se apunta la próxima vez que la abras."),
    recs.length ? null : emptyState("Aún no tienes fijos", "Añade tu nómina y tus gastos de cada mes: te ahorras apuntarlos y la app sabe lo que te queda por pagar.", Repeat,
      button("Añadir el primero", { icon: Plus, onClick: () => editRecurring({}) })),
    group("income", "Ingresos fijos"), group("expense", "Gastos fijos"),
    recs.length ? button("Añadir otro", { variant: "secondary", icon: Plus, block: true, onClick: () => editRecurring({}) }) : null);
}

export async function editRecurring(r: Partial<Recurring>, preset?: { type?: TxType; title?: string; amountCents?: number; categoryId?: string | null; day?: number }): Promise<void> {
  const [cats, accounts] = await Promise.all([listCategories(), listAccounts()]);
  let type: TxType = r.type ?? preset?.type ?? "expense";
  const amount = moneyField("Importe", { name: "amount", big: true, value: (r.amountCents ?? preset?.amountCents) ? centsToInput((r.amountCents ?? preset?.amountCents)!) : "" });
  const title = field("Nombre", { name: "title", value: r.title ?? preset?.title, maxlength: 80, placeholder: "Ej.: Alquiler, Nómina, Gimnasio" });
  const day = field("Día del mes", { name: "day", type: "number", min: "1", max: "31", inputmode: "numeric", value: String(r.dayOfMonth ?? preset?.day ?? Number(today().slice(8))),
    hint: "Si pones 31, se apunta el último día de cada mes." });
  const catBox = h("div", { class: "field" });
  const drawCats = () => catBox.replaceChildren(h("label", { class: "field-label", for: "rec-cat" }, "Categoría"),
    h("select", { id: "rec-cat", name: "category", class: "input" }, h("option", { value: "" }, "Sin categoría"),
      ...cats.filter((c: Category) => c.type === type).map((c) => h("option", { value: c.id, selected: c.id === (r.categoryId ?? preset?.categoryId) }, c.name))));
  drawCats();
  const acc = accounts.length > 1 ? h("div", { class: "field" }, h("label", { class: "field-label", for: "rec-acc" }, "Cuenta"),
    h("select", { id: "rec-acc", name: "account", class: "input" }, ...accounts.map((a) => h("option", { value: a.id, selected: a.id === r.accountId }, a.name)))) : null;
  const already = r.id ? null : h("label", { class: "check" }, h("input", { type: "checkbox", name: "already" }),
    h("span", {}, h("strong", {}, "Este mes ya lo he apuntado"), h("span", { class: "muted block" }, "Empezará a apuntarse solo el mes que viene.")));
  const form = h("form", { class: "stack-sm", novalidate: true },
    segmented("Tipo", ["Gasto", "Ingreso"], type === "expense" ? 0 : 1, (i) => { type = i ? "income" : "expense"; drawCats(); }),
    amount, title, day, catBox, acc, already, button("Guardar", { type: "submit", block: true }),
    r.id ? button("Dejar de apuntarlo", { variant: "danger", block: true, onClick: async () => {
      if (!(await confirmDialog(`¿Dejar de apuntar «${r.title}»?`, { ok: "Dejar de apuntarlo", danger: true, detail: "Lo ya apuntado se queda como está." }))) return;
      await deleteRecurring(r.id!); d.close(); toast("Fijo eliminado"); refresh();
    } }) : null);
  const d = openSheet(r.id ? "Editar fijo" : "Nuevo fijo", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const c = parseMoney(String(fd.get("amount") ?? ""));
    if (!c) { setFieldError(amount, "Escribe un importe mayor que cero."); return; }
    const dn = Number(fd.get("day"));
    if (!Number.isInteger(dn) || dn < 1 || dn > 31) { setFieldError(day, "Un día entre 1 y 31."); return; }
    try {
      await upsertRecurring({ ...r, type, amountCents: c, title: String(fd.get("title") ?? ""), dayOfMonth: dn, categoryId: String(fd.get("category") ?? "") || null,
        accountId: String(fd.get("account") ?? "") || undefined, startMonth: r.startMonth ?? (fd.get("already") === "on" ? addMonths(thisMonth(), 1) : thisMonth()) });
      const n = await generateRecurring();
      await markFirstStep("fijos");
      d.close(); toast(n ? `Guardado. Apuntado ${n === 1 ? "1 movimiento" : `${n} movimientos`} que ya tocaban.` : "Guardado"); refresh();
    } catch (err) { setFieldError(title, errorText(err)); }
  });
}
