// S12 Patrimonio, S13 aporte o retirada (hoja), detalle de una hucha.
import { ArrowDownLeft, ArrowUpRight, FileUp, History, Landmark, PiggyBank, Plus, Scale, Trash2, Undo2 } from "lucide";
import { dayLabel, isValidYmd, thisMonth, today } from "../data/dates";
import { addPotMovement, deletePot, deletePotMovement, listAccounts, listPotMovements, setPotMovementInitial, upsertPot, wealth } from "../data/repo";
import type { Pot, PotType } from "../data/types";
import { button, emptyState, field, moneyField, parseMoney, ring, segmented, setFieldError, toast } from "../ui/components";
import { h, icon, money, pct } from "../ui/dom";
import { screen, sectionTitle } from "../app/layout";
import { confirmDialog, openSheet } from "../app/dialogs";
import { refresh } from "../app/router";
import { centsToInput, errorText, go } from "../app/util";

export async function wealthScreen(): Promise<HTMLElement> {
  const w = await wealth();
  const potCard = (p: Pot & { balanceCents: number }) => h("li", {},
    h("a", { class: "pot", href: `#/hucha/${p.id}` },
      ring({ value: p.goalCents ? p.balanceCents : 1, max: p.goalCents ?? 1, color: p.type, size: 56, stroke: 6, showPct: !!p.goalCents,
        label: p.goalCents ? `${p.name}: ${pct(p.balanceCents, p.goalCents)} % de la meta` : p.name }),
      h("span", { class: "pot-main" }, h("span", { class: "pot-name" }, p.name),
        h("span", { class: "muted" }, [p.institution, p.goalCents ? `Meta: ${money(p.goalCents)}${p.goalReachedAt ? " · ¡conseguida!" : ""}` : p.institution ? "" : p.type === "savings" ? "Ahorro" : "Inversión"].filter(Boolean).join(" · "))),
      h("span", { class: "num pot-amount" }, money(p.balanceCents))));
  const group = (type: PotType, title: string) => {
    const pots = w.pots.filter((p) => p.type === type);
    return h("section", { class: "stack-sm" },
      sectionTitle(title, button("Nueva", { size: "sm", variant: "secondary", icon: Plus, onClick: () => editPot({ type }) })),
      pots.length ? h("ul", { class: "list" }, ...pots.map(potCard))
        : h("p", { class: "muted" }, type === "savings" ? "Crea una hucha para tu colchón o para algo concreto, como un viaje." : "Apunta aquí lo que tienes en fondos, acciones o plan de pensiones."));
  };
  const empty = !w.pots.length && w.liquidCents === 0;
  return screen({ title: "Patrimonio", tab: "patrimonio", actions: [h("a", { class: "btn btn-ghost btn-sm", href: `#/plan?mes=${thisMonth()}` }, icon(Scale, { size: 16 }), h("span", {}, "Plan"))] },
    h("section", { class: "hero" },
      h("p", { class: "muted" }, "Todo lo que tienes"),
      h("p", { class: "big-number num" }, money(w.totalCents)),
      h("div", { class: "kind-rings" },
        ringBlock("Disponible", w.liquidCents, w.totalCents, "accent"),
        ringBlock("Ahorrado", w.savingsCents, w.totalCents, "savings"),
        ringBlock("Invertido", w.investmentCents, w.totalCents, "investment"))),
    empty ? emptyState("Empieza por lo que tienes hoy", "Dinos cuánto hay en tus cuentas en Primeros pasos, o crea tu primera hucha.", PiggyBank,
      h("a", { class: "btn btn-primary btn-md", href: "#/primeros-pasos" }, "Ir a primeros pasos")) : null,
    h("section", { class: "stack-sm" },
      sectionTitle("Cuentas", h("a", { href: "#/cuentas" }, "Gestionar")),
      h("ul", { class: "list" }, ...w.accounts.filter((a) => !a.archived).map((a) => h("li", {},
        h("a", { class: "pot", href: "#/cuentas", style: `--cat:var(--${a.color})` },
          h("span", { class: "cat-icon", "aria-hidden": "true" }, icon(Landmark, { size: 18 })),
          h("span", { class: "pot-main" }, h("span", { class: "pot-name" }, a.name), h("span", { class: "muted" }, "Disponible")),
          h("span", { class: `num pot-amount${a.balanceCents < 0 ? " neg" : ""}` }, money(a.balanceCents)))))),
      h("a", { class: "btn btn-secondary btn-md", href: "#/importar" }, icon(FileUp, { size: 18 }), h("span", {}, "Importar extracto del banco"))),
    group("savings", "Ahorro"), group("investment", "Inversión"),
    h("p", { class: "muted" }, "«Disponible» es lo que hay en tus cuentas: su saldo de partida más lo que entra, menos lo que gastas y lo que mueves a tus huchas."),
  );
}

const ringBlock = (label: string, cents: number, total: number, color: string) => h("div", { class: "kind" },
  ring({ value: Math.max(0, cents), max: total > 0 ? total : 1, color, size: 88, showPct: true, sub: label, label: `${label}: ${money(cents)}, ${pct(Math.max(0, cents), total)} % del total` }),
  h("span", { class: "num kind-amount" }, money(cents)));

export async function potScreen([id]: string[]): Promise<HTMLElement> {
  const w = await wealth();
  const p = w.pots.find((x) => x.id === id);
  if (!p) return screen({ title: "Hucha", back: "#/capital" }, emptyState("Esta hucha ya no existe", "Puede que la hayas borrado.", PiggyBank));
  const movs = await listPotMovements({ potId: id });
  const left = p.goalCents ? Math.max(0, p.goalCents - p.balanceCents) : 0;
  return screen({ title: p.name, back: "#/capital", actions: [button("Editar", { variant: "ghost", size: "sm", onClick: () => editPot(p) })] },
    h("section", { class: "hero" },
      ring({ value: p.goalCents ? p.balanceCents : 1, max: p.goalCents ?? 1, color: p.type, size: 200, center: money(p.balanceCents),
        sub: p.goalCents ? (left ? `faltan ${money(left)}` : "¡meta conseguida!") : p.type === "savings" ? "ahorrado" : "invertido",
        label: p.goalCents ? `${money(p.balanceCents)} de ${money(p.goalCents)}` : money(p.balanceCents) })),
    h("div", { class: "row two" },
      button("Aportar", { icon: ArrowDownLeft, block: true, onClick: () => movementSheet(p, "contribution") }),
      button("Retirar", { icon: ArrowUpRight, variant: "secondary", block: true, disabled: p.balanceCents <= 0, onClick: () => movementSheet(p, "withdrawal") })),
    h("section", { class: "stack-sm" }, sectionTitle("Movimientos"),
      movs.length ? h("ul", { class: "list" }, ...movs.map((m) => h("li", { class: "plain-row" },
        h("span", { class: `mov-icon ${m.kind}` }, icon(m.kind === "contribution" ? ArrowDownLeft : ArrowUpRight, { size: 18 })),
        h("span", { class: "cat-name" }, m.initial ? "Ya lo tenías" : m.kind === "contribution" ? "Aporte" : "Retirada",
          h("span", { class: "muted block" }, dayLabel(m.occurredOn) + (m.note && !m.initial ? ` · ${m.note}` : ""))),
        h("span", { class: "num" }, `${m.kind === "contribution" ? "+" : "−"}${money(m.amountCents)}`),
        m.kind === "contribution" ? button(m.initial ? "Contar como aporte de ese mes" : "Marcar como «ya lo tenía»", { variant: "ghost", size: "sm", iconOnly: true, icon: m.initial ? Undo2 : History, onClick: async () => {
          await setPotMovementInitial(m.id, !m.initial);
          toast(m.initial ? "Ahora cuenta como aportado ese mes" : "Marcado como dinero que ya tenías");
          refresh();
        } }) : null,
        button("Borrar este movimiento", { variant: "ghost", size: "sm", iconOnly: true, icon: Trash2, onClick: async () => {
          if (await confirmDialog("¿Borrar este movimiento de la hucha?", { ok: "Borrar", danger: true })) { await deletePotMovement(m.id); refresh(); }
        } }))))
        : h("p", { class: "muted" }, "Aún no hay movimientos.")),
  );
}

/** S13: aportar o retirar. */
export async function movementSheet(p: Pot, kind: "contribution" | "withdrawal"): Promise<void> {
  const accounts = await listAccounts();
  const amount = moneyField("Importe", { name: "amount", big: true, required: true });
  const date = field("Fecha", { name: "date", type: "date", value: today(), max: today() });
  const note = field("Nota", { name: "note", placeholder: "Opcional", maxlength: 80 });
  const had = kind === "contribution" ? h("label", { class: "check" },
    h("input", { type: "checkbox", name: "initial", id: "mov-initial" }),
    h("span", {}, h("strong", {}, "Ya lo tenía"), h("span", { class: "muted block" }, `Dinero que ya estaba ${p.type === "savings" ? "ahorrado" : "invertido"} antes: no sale de tu disponible ni cuenta como apartado este mes.`))) : null;
  const acc = accounts.length > 1 ? h("div", { class: "field" }, h("label", { class: "field-label", for: "mov-acc" }, kind === "contribution" ? "Sale de la cuenta" : "Vuelve a la cuenta"),
    h("select", { id: "mov-acc", name: "account", class: "input" }, ...accounts.map((a) => h("option", { value: a.id }, a.name)))) : null;
  const form = h("form", { class: "stack-sm", novalidate: true }, amount, date, acc, note, had, button(kind === "contribution" ? "Aportar" : "Retirar", { type: "submit", block: true }));
  const d = openSheet(`${kind === "contribution" ? "Aportar a" : "Retirar de"} ${p.name}`, form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const c = parseMoney(String(fd.get("amount")));
    if (!c) { setFieldError(amount, "Escribe un importe mayor que cero."); return; }
    const dv = String(fd.get("date"));
    if (!isValidYmd(dv)) { setFieldError(date, "Elige una fecha."); return; }
    try {
      const r = await addPotMovement(p.id, kind, c, dv, String(fd.get("note") ?? "").trim(),
        { initial: fd.get("initial") === "on", accountId: String(fd.get("account") ?? "") || undefined });
      d.close();
      toast(r.goalReached ? `¡Has llegado a tu meta de ${p.name}!` : kind === "contribution" ? "Aporte guardado" : "Retirada guardada", r.goalReached ? "success" : "info");
      refresh();
    } catch (err) { setFieldError(amount, errorText(err)); }
  });
}

function editPot(p: Partial<Pot> & { type: PotType }): void {
  let type = p.type;
  const name = field("Nombre", { name: "name", value: p.name, required: true, maxlength: 40, placeholder: p.type === "savings" ? "Ej.: Colchón, Viaje" : "Ej.: Fondo indexado" });
  const goal = moneyField("Meta (opcional)", { name: "goal", value: p.goalCents ? centsToInput(p.goalCents) : "", hint: "Te avisamos cuando la alcances." });
  const inst = field("Banco o entidad (opcional)", { name: "institution", value: p.institution, maxlength: 40, placeholder: "Ej.: el banco o la app donde lo tienes" });
  const form = h("form", { class: "stack-sm", novalidate: true },
    p.id ? null : segmented("Tipo", ["Ahorro", "Inversión"], type === "savings" ? 0 : 1, (i) => { type = i ? "investment" : "savings"; }),
    name, inst, goal, button("Guardar", { type: "submit", block: true }),
    p.id ? button("Borrar hucha", { variant: "danger", block: true, onClick: async () => {
      if (!(await confirmDialog(`¿Borrar «${p.name}»?`, { ok: "Borrar", danger: true, detail: "Se borran también sus aportes y retiradas." }))) return;
      await deletePot(p.id!); d.close(); toast("Hucha borrada"); go("#/capital");
    } }) : null);
  const d = openSheet(p.id ? "Editar hucha" : "Nueva hucha", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const raw = String(fd.get("goal") ?? "").trim();
    const g = raw ? parseMoney(raw) : null;
    if (raw && !g) { setFieldError(goal, "Escribe un importe, por ejemplo 3000."); return; }
    try {
      const saved = await upsertPot({ ...p, type, name: String(fd.get("name") ?? ""), goalCents: g, institution: String(fd.get("institution") ?? "") });
      d.close(); toast("Hucha guardada");
      if (!p.id) go(`#/hucha/${saved.id}`); else refresh();
    } catch (err) { setFieldError(name, errorText(err)); }
  });
}
