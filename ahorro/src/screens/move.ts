// «Mover dinero» entre tus cuentas y huchas: no es gasto ni ingreso.
import { ArrowRight, Trash2 } from "lucide";
import { dayLabel, isValidYmd, today } from "../data/dates";
import { deleteTransfer, listAccounts, listPots, listTransfers, moveMoney, wealth } from "../data/repo";
import { button, field, moneyField, parseMoney, setFieldError, toast } from "../ui/components";
import { h, money } from "../ui/dom";
import { sectionTitle } from "../app/layout";
import { confirmDialog, openSheet } from "../app/dialogs";
import { refresh } from "../app/router";
import { errorText } from "../app/util";

/** preset: "acc:<id>" o "pot:<id>" para origen y destino. */
export async function openMoveSheet(preset: { from?: string; to?: string } = {}): Promise<void> {
  const [accounts, pots, w] = await Promise.all([listAccounts(), listPots(), wealth()]);
  const bal = new Map<string, number>([...w.accounts.map((a) => [`acc:${a.id}`, a.balanceCents] as const), ...w.pots.map((p) => [`pot:${p.id}`, p.balanceCents] as const)]);
  const options = (sel?: string) => [
    h("optgroup", { label: "Cuentas" }, ...accounts.map((a) => h("option", { value: `acc:${a.id}`, selected: sel === `acc:${a.id}` }, `${a.name} (${money(bal.get(`acc:${a.id}`) ?? 0)})`))),
    pots.length ? h("optgroup", { label: "Huchas" }, ...pots.map((p) => h("option", { value: `pot:${p.id}`, selected: sel === `pot:${p.id}` }, `${p.name} (${money(bal.get(`pot:${p.id}`) ?? 0)})`))) : null,
  ].filter((x): x is HTMLOptGroupElement => !!x);
  const defTo = preset.to ?? (accounts[1] ? `acc:${accounts[1].id}` : pots[0] ? `pot:${pots[0].id}` : undefined);
  const from = h("select", { id: "mv-from", name: "from", class: "input" }, ...options(preset.from ?? `acc:${accounts[0].id}`));
  const to = h("select", { id: "mv-to", name: "to", class: "input" }, ...options(defTo));
  const amount = moneyField("Importe", { name: "amount", big: true });
  const date = field("Fecha", { name: "date", type: "date", value: today(), max: today() });
  const note = field("Nota", { name: "note", placeholder: "Opcional", maxlength: 80 });
  const swap = button("Cambiar origen y destino", { variant: "ghost", size: "sm", iconOnly: true, icon: ArrowRight, onClick: () => { const a = from.value; from.value = to.value; to.value = a; } });
  swap.classList.add("swap-btn");
  const form = h("form", { class: "stack-sm", novalidate: true },
    h("div", { class: "move-pair" },
      h("div", { class: "field" }, h("label", { class: "field-label", for: "mv-from" }, "Desde"), from),
      swap,
      h("div", { class: "field" }, h("label", { class: "field-label", for: "mv-to" }, "A"), to)),
    amount, date, note,
    h("p", { class: "muted small" }, "Mover dinero entre tus cuentas o a tus huchas no cuenta como gasto ni como ingreso."),
    button("Mover", { type: "submit", block: true, size: "lg" }));
  const d = openSheet("Mover dinero", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const c = parseMoney(String(fd.get("amount") ?? ""));
    if (!c) { setFieldError(amount, "Escribe un importe mayor que cero."); return; }
    const dv = String(fd.get("date"));
    if (!isValidYmd(dv)) { setFieldError(date, "Elige una fecha."); return; }
    const side = (v: string) => (v.startsWith("acc:") ? { account: v.slice(4) } : { pot: v.slice(4) });
    try {
      const r = await moveMoney({ from: side(from.value), to: side(to.value), amountCents: c, occurredOn: dv, note: String(fd.get("note") ?? "") });
      d.close(); toast(r.goalReached ? "¡Movido, y has llegado a tu meta!" : "Dinero movido", "success"); refresh();
    } catch (err) { setFieldError(amount, errorText(err)); }
  });
}

/** Lista de los últimos traspasos entre cuentas (para la pantalla de Cuentas). */
export async function transfersSection(): Promise<HTMLElement | null> {
  const [trs, accounts] = await Promise.all([listTransfers(), listAccounts({ includeArchived: true })]);
  if (!trs.length) return null;
  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Cuenta";
  return h("section", { class: "stack-sm" }, sectionTitle("Últimos traspasos"),
    h("ul", { class: "list" }, ...trs.slice(0, 10).map((x) => h("li", { class: "plain-row" },
      h("span", { class: "cat-name" }, `${name(x.fromAccountId)} → ${name(x.toAccountId)}`, h("span", { class: "muted block" }, dayLabel(x.occurredOn) + (x.note ? ` · ${x.note}` : ""))),
      h("span", { class: "num" }, money(x.amountCents)),
      button("Borrar traspaso", { variant: "ghost", size: "sm", iconOnly: true, icon: Trash2, onClick: async () => {
        if (await confirmDialog("¿Borrar este traspaso?", { ok: "Borrar", danger: true })) { await deleteTransfer(x.id); refresh(); }
      } })))));
}

