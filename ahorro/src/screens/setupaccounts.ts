// «Configura tus cuentas»: en una pantalla, dónde está tu dinero del día a día y dónde tu ahorro o inversión.
import { Landmark, PiggyBank, Plus, X } from "lucide";
import { accountBalances, saveSettings, setAccountBalanceToday, setPotBalance, upsertAccount, upsertPot, wealth } from "../data/repo";
import { today } from "../data/dates";
import type { PotType } from "../data/types";
import { button, parseMoney, toast } from "../ui/components";
import { h, icon } from "../ui/dom";
import { screen, sectionTitle } from "../app/layout";
import { centsToInput, errorText, go } from "../app/util";

let n = 0;
const uid = () => `s${++n}`;

/** Importe con signo opcional ("-120,50"). */
function signed(raw: string): number | null {
  const t = raw.trim();
  if (!t) return 0;
  const c = parseMoney(t.replace(/^[-−]/, ""));
  return c === null ? null : /^[-−]/.test(t) ? -c : c;
}

function input(label: string, o: { value?: string; placeholder?: string; money?: boolean; name: string }): HTMLElement {
  const id = uid();
  return h("div", { class: "field" }, h("label", { class: "field-label", for: id }, label),
    h("div", { class: "input-wrap" },
      h("input", { id, name: o.name, class: "input", value: o.value, placeholder: o.placeholder, inputmode: o.money ? "decimal" : undefined, autocomplete: "off", maxlength: 40 }),
      o.money ? h("span", { class: "input-suffix", "aria-hidden": "true" }, "€") : null));
}

export async function setupAccountsScreen(): Promise<HTMLElement> {
  const [accounts, w] = await Promise.all([accountBalances(), wealth()]);
  const accList = h("div", { class: "stack-sm" });
  const potList = h("div", { class: "stack-sm" });

  const accRow = (a?: { id: string; name: string; balanceCents: number }) => {
    const row = h("div", { class: "setup-row", "data-id": a?.id ?? "" },
      input("Nombre", { name: "name", value: a?.name === "Cuenta principal" ? "" : a?.name, placeholder: a ? "Ej.: Cuenta de la nómina" : "Ej.: Efectivo" }),
      input("Saldo hoy", { name: "bal", value: a ? centsToInput(a.balanceCents) : "", placeholder: "0,00", money: true }),
      a ? null : button("Quitar", { variant: "ghost", size: "sm", iconOnly: true, icon: X, onClick: () => row.remove() }));
    accList.append(row);
  };
  const potRow = (p?: { id: string; name: string; type: PotType; institution?: string; balanceCents: number }) => {
    const sid = uid();
    const row = h("div", { class: "setup-row setup-pot", "data-id": p?.id ?? "" },
      input("Nombre", { name: "name", value: p?.name, placeholder: "Ej.: Fondo indexado, Colchón" }),
      h("div", { class: "field" }, h("label", { class: "field-label", for: sid }, "Es"),
        h("select", { id: sid, name: "type", class: "input", disabled: !!p },
          h("option", { value: "investment", selected: !p || p.type === "investment" }, "Inversión"),
          h("option", { value: "savings", selected: p?.type === "savings" }, "Ahorro"))),
      input("Dónde está", { name: "inst", value: p?.institution, placeholder: "Banco o app (opcional)" }),
      input("Cuánto hay hoy", { name: "bal", value: p ? centsToInput(p.balanceCents) : "", placeholder: "0,00", money: true }),
      p ? null : button("Quitar", { variant: "ghost", size: "sm", iconOnly: true, icon: X, onClick: () => row.remove() }));
    potList.append(row);
  };
  accounts.filter((a) => !a.archived).forEach((a) => accRow(a));
  w.pots.forEach((p) => potRow(p));
  if (!w.pots.length) potRow();

  const err = h("p", { class: "field-msg error", hidden: true, role: "alert" });
  const save = button("Guardar", { size: "lg", block: true });
  save.addEventListener("click", async () => {
    err.hidden = true;
    const val = (row: Element, name: string) => (row.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement).value.trim();
    try {
      save.disabled = true;
      for (const row of [...accList.children]) {
        const id = row.getAttribute("data-id") || undefined;
        const name = val(row, "name") || (id ? "Cuenta principal" : "");
        const bal = signed(val(row, "bal"));
        if (bal === null) throw new Error(`El saldo de «${name || "una cuenta"}» no es un importe válido.`);
        if (!name) continue;
        const prev = accounts.find((a) => a.id === id);
        const saved = await upsertAccount(prev ? { ...prev, name } : { name, initialCents: bal, initialDate: today() });
        if (prev && prev.balanceCents !== bal) await setAccountBalanceToday(saved.id, bal);
      }
      for (const row of [...potList.children]) {
        const id = row.getAttribute("data-id") || undefined;
        const name = val(row, "name");
        const bal = signed(val(row, "bal"));
        if (!name) continue;
        if (bal === null || bal < 0) throw new Error(`Lo que hay en «${name}» no es un importe válido.`);
        const prev = w.pots.find((p) => p.id === id);
        const saved = await upsertPot({ ...(prev ?? {}), name, type: prev?.type ?? (val(row, "type") as PotType), institution: val(row, "inst") });
        if ((prev?.balanceCents ?? 0) !== bal) await setPotBalance(saved.id, bal);
      }
      await saveSettings({ accountsSetupDone: true });
      toast("Cuentas guardadas", "success");
      go("#/capital");
    } catch (e) { err.textContent = errorText(e); err.hidden = false; save.disabled = false; }
  });

  return screen({ title: "Tus cuentas", back: "#/" },
    h("p", { class: "muted" }, "Pon dónde tienes tu dinero y cuánto hay hoy. Puedes cambiarlo cuando quieras en Patrimonio."),
    h("section", { class: "stack-sm" },
      sectionTitle("Dinero del día a día"),
      h("p", { class: "muted small" }, "Las cuentas donde te pagan y desde donde gastas, y el efectivo."),
      accList, button("Añadir otra cuenta", { variant: "secondary", icon: Plus, onClick: () => accRow() })),
    h("section", { class: "stack-sm" },
      sectionTitle("Ahorro e inversión"),
      h("p", { class: "muted small" }, "Lo que tienes apartado en otro sitio. Contará en tu patrimonio, no como gasto."),
      potList, button("Añadir otra", { variant: "secondary", icon: Plus, onClick: () => potRow() })),
    err, save,
    button("Ahora no", { variant: "ghost", block: true, onClick: async () => { await saveSettings({ accountsSetupDone: true }); go("#/"); } }));
}

/** Tarjeta del inicio mientras no se haya configurado. */
export function setupAccountsCard(): HTMLElement {
  return h("a", { class: "steps-card", href: "#/configurar-cuentas" },
    h("span", { class: "tile-icon" }, icon(Landmark)),
    h("span", { class: "steps-main" },
      h("span", { class: "tile-title" }, "Configura tus cuentas"),
      h("span", { class: "steps-text" }, "Dinos dónde tienes tu dinero y tu inversión. Un minuto.")),
    h("span", { class: "inline-icon", "aria-hidden": "true" }, icon(PiggyBank)));
}
