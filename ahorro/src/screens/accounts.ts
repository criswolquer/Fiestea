// Cuentas (bancos, efectivo) e importación de extractos.
import { FileUp, Landmark, Plus, Scale, Upload } from "lucide";
import { dayLabel, today } from "../data/dates";
import { conceptKey, importKeys, KEYWORDS, looksLikeTransfer, readStatement, type StatementRow } from "../data/importer";
import {
  accountBalances, accountNetAfter, existingImportKeys, getSettings, importStatement, listAccounts, listCategories, listPots, setAccountBalanceToday, upsertAccount,
  type AccountWithBalance, type ImportDecision,
} from "../data/repo";
import type { Account, Category, Pot } from "../data/types";
import { banner, button, emptyState, field, moneyField, parseMoney, segmented, setFieldError, toast } from "../ui/components";
import { h, icon, money } from "../ui/dom";
import { categoryIconName } from "../ui/caticons";
import { screen } from "../app/layout";
import { confirmDialog, openSheet } from "../app/dialogs";
import { refresh, type Query } from "../app/router";
import { centsToInput, errorText, go } from "../app/util";

const KIND_LABEL: Record<Account["kind"], string> = { corriente: "Cuenta bancaria", efectivo: "Efectivo", otra: "Otra" };

export async function accountsScreen(_: string[], q: Query): Promise<HTMLElement> {
  const accounts = (await accountBalances()).filter((a) => !a.archived);
  const total = accounts.reduce((x, a) => x + a.balanceCents, 0);
  return screen({ title: "Cuentas", back: q.get("volver") ?? "#/capital", actions: [button("Nueva cuenta", { variant: "ghost", size: "sm", icon: Plus, onClick: () => editAccount({}) })] },
    h("section", { class: "hero" }, h("p", { class: "muted" }, "Dinero disponible en tus cuentas"), h("p", { class: "big-number num" }, money(total))),
    h("ul", { class: "list" }, ...accounts.map((a) => accountRow(a))),
    h("a", { class: "btn btn-primary btn-lg btn-block", href: "#/importar" }, icon(FileUp), h("span", {}, "Importar extracto del banco")),
    h("p", { class: "muted" }, "Cada movimiento que apuntas va a una cuenta. El ahorro y la inversión van en tus huchas (Patrimonio): ahí puedes poner en qué banco o entidad está cada una."),
  );
}

function accountRow(a: AccountWithBalance): HTMLElement {
  return h("li", { class: "account", style: `--cat:var(--${a.color})` },
    h("span", { class: "cat-icon", "aria-hidden": "true" }, icon(Landmark, { size: 18 })),
    h("span", { class: "pot-main" }, h("span", { class: "pot-name" }, a.name), h("span", { class: "muted" }, KIND_LABEL[a.kind])),
    h("span", { class: `num pot-amount${a.balanceCents < 0 ? " neg" : ""}` }, money(a.balanceCents)),
    h("div", { class: "account-actions" },
      button("Cuadrar con el banco", { variant: "secondary", size: "sm", icon: Scale, onClick: () => squareSheet(a) }),
      h("a", { class: "btn btn-ghost btn-sm", href: `#/importar?cuenta=${encodeURIComponent(a.id)}` }, icon(Upload, { size: 16 }), h("span", {}, "Importar")),
      button("Editar", { variant: "ghost", size: "sm", onClick: () => editAccount(a) })));
}

function editAccount(a: Partial<Account>): void {
  let kind: Account["kind"] = a.kind ?? "corriente";
  const name = field("Nombre", { name: "name", value: a.name, required: true, maxlength: 40, placeholder: "Ej.: BBVA nómina" });
  const bal = a.id ? null : moneyField("Saldo de hoy", { name: "balance", hint: "Lo que pone tu banco ahora mismo. Puedes ajustarlo luego con «Cuadrar con el banco»." });
  const kinds: Account["kind"][] = ["corriente", "efectivo", "otra"];
  const form = h("form", { class: "stack-sm", novalidate: true }, name,
    segmented("Tipo", kinds.map((k) => KIND_LABEL[k]), kinds.indexOf(kind), (i) => { kind = kinds[i]; }), bal,
    button("Guardar", { type: "submit", block: true }),
    a.id ? button(a.archived ? "Volver a usarla" : "Archivar cuenta", { variant: "ghost", block: true, onClick: async () => {
      if (!a.archived && !(await confirmDialog(`¿Archivar «${a.name}»?`, { ok: "Archivar", detail: "Dejará de salir al apuntar. Sus movimientos se quedan y su saldo sigue contando en tu patrimonio." }))) return;
      await upsertAccount({ ...(a as Account), archived: !a.archived }); d.close(); refresh();
    } }) : null);
  const d = openSheet(a.id ? "Editar cuenta" : "Nueva cuenta", form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const n = String(fd.get("name") ?? "").trim();
    if (!n) { setFieldError(name, "Ponle un nombre."); return; }
    let cents = 0;
    if (bal) { const raw = String(fd.get("balance") ?? "").trim(); const c = raw ? parseMoney(raw.replace(/^-/, "")) : 0;
      if (c === null) { setFieldError(bal, "Escribe una cantidad, por ejemplo 1250,40."); return; } cents = raw.startsWith("-") ? -c : c; }
    try {
      await upsertAccount(a.id ? { ...(a as Account), name: n, kind } : { name: n, kind, initialCents: cents, initialDate: today() });
      d.close(); toast("Cuenta guardada"); refresh();
    } catch (err) { setFieldError(name, errorText(err)); }
  });
}

function squareSheet(a: AccountWithBalance): void {
  const f = moneyField("Saldo real de hoy", { name: "real", big: true, value: centsToInput(Math.abs(a.balanceCents)), hint: `La app calcula ${money(a.balanceCents)}. Si tu banco dice otra cosa, escríbelo y se ajusta.` });
  const form = h("form", { class: "stack-sm", novalidate: true }, f, button("Ajustar saldo", { type: "submit", block: true }));
  const d = openSheet(`Cuadrar ${a.name}`, form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = String(new FormData(form).get("real") ?? "").trim();
    const c = parseMoney(raw.replace(/^-/, ""));
    if (c === null) { setFieldError(f, "Escribe una cantidad."); return; }
    await setAccountBalanceToday(a.id, raw.startsWith("-") ? -c : c);
    d.close(); toast("Saldo ajustado"); refresh();
  });
}

/* Importar ------------------------------------------------------------------------ */
function guessCategory(r: StatementRow, cats: Category[], rules: Record<string, string>): string | null {
  const type = r.amountCents < 0 ? "expense" : "income";
  const ruled = rules[conceptKey(r.concept)];
  if (ruled && cats.some((c) => c.id === ruled && c.type === type)) return ruled;
  const hit = KEYWORDS.find(([re]) => re.test(`${r.concept} ${r.detail}`))?.[1];
  if (!hit) return null;
  const pool = cats.filter((c) => c.type === type);
  return (pool.find((c) => categoryIconName(c) === hit) ?? (hit === "compra" ? pool.find((c) => categoryIconName(c) === "comida") : undefined))?.id ?? null;
}

export async function importScreen(_: string[], q: Query): Promise<HTMLElement> {
  const [accounts, cats, pots] = await Promise.all([listAccounts(), listCategories(), listPots()]);
  let accountId = accounts.find((a) => a.id === q.get("cuenta"))?.id ?? accounts[0].id;
  const body = h("div", { class: "stack" });
  const fileInput = h("input", { type: "file", id: "statement", accept: ".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", class: "sr-only" });
  const accountSelect = h("select", { id: "acc", class: "input" }, ...accounts.map((a) => h("option", { value: a.id, selected: a.id === accountId }, a.name)));
  accountSelect.addEventListener("change", () => { accountId = accountSelect.value; });

  const intro = h("div", { class: "stack-sm" },
    h("p", { class: "muted" }, "En la web o la app de tu banco (BBVA incluido), entra en los movimientos de la cuenta y usa «Descargar» o «Exportar» en Excel (.xlsx) o CSV. Luego súbelo aquí: se lee en tu móvil, no se envía a ningún sitio."),
    h("div", { class: "field" }, h("label", { class: "field-label", for: "acc" }, "¿De qué cuenta es el extracto?"), accountSelect),
    h("div", {}, fileInput, h("label", { for: "statement", class: "btn btn-primary btn-lg btn-block" }, icon(FileUp), h("span", {}, "Elegir archivo"))),
    accounts.length === 1 ? h("p", { class: "muted small" }, h("a", { href: "#/cuentas" }, "¿Es de otro banco? Crea antes la cuenta.")) : null);
  body.append(intro);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try { await preview(await readStatement(file)); }
    catch (e) { toast(errorText(e), "danger"); }
    fileInput.value = "";
  });

  async function preview(st: { rows: StatementRow[]; skipped: number }): Promise<void> {
    const keys = importKeys(accountId, st.rows);
    const existing = await existingImportKeys();
    const rules = (await getSettings()).importRules ?? {};
    const investPot = pots.find((p) => p.type === "investment") ?? pots[0];
    const decisions: (ImportDecision & { dup: boolean })[] = st.rows.map((r, i) => {
      const transfer = looksLikeTransfer(r) && r.amountCents < 0 && !!investPot;
      return { key: keys[i], date: r.date, concept: r.concept, detail: r.detail, amountCents: r.amountCents, dup: existing.has(keys[i]),
        action: transfer ? "pot" : r.amountCents < 0 ? "expense" : "income", categoryId: transfer ? null : guessCategory(r, cats, rules), potId: transfer ? investPot!.id : undefined };
    });
    const fresh = decisions.filter((d) => !d.dup);
    const dates = st.rows.map((r) => r.date).sort();
    const latest = st.rows.filter((r) => r.balanceCents !== undefined).sort((a, b) => b.date.localeCompare(a.date))[0];
    const acc = accounts.find((a) => a.id === accountId)!;

    const run = button(`Importar ${fresh.length} movimientos`, { size: "lg", block: true, disabled: !fresh.length });
    const count = () => { const n = fresh.filter((d) => d.action !== "skip").length; run.querySelector("span")!.textContent = n ? `Importar ${n} movimientos` : "Nada que importar"; run.disabled = !n; };
    const setBalance = latest ? h("label", { class: "check" }, h("input", { type: "checkbox", id: "set-balance", checked: true }),
      h("span", {}, h("strong", {}, `Poner el saldo de ${acc.name} en ${money(latest.balanceCents!)}`), h("span", { class: "muted block" }, `Es el saldo que da el extracto el ${dayLabel(latest.date)}.`))) : null;

    const list = h("ul", { class: "list import-list" }, ...decisions.map((d) => importRow(d, cats, pots, count)));
    body.replaceChildren(...[
      h("p", {}, h("strong", {}, `${st.rows.length} movimientos`), ` del ${dayLabel(dates[0])} al ${dayLabel(dates[dates.length - 1])} · cuenta ${acc.name}.`),
      decisions.length - fresh.length ? banner(`${decisions.length - fresh.length} ya estaban importados: no se repetirán.`, "info") : null,
      st.skipped ? banner(`${st.skipped} filas no tenían fecha o importe y se han saltado.`, "warning") : null,
      fresh.some((d) => d.action === "pot") ? banner("Las transferencias a tu inversión se apuntan como aporte a la hucha, no como gasto. Cámbialo en cada fila si no es así.", "info") : null,
      h("p", { class: "muted small" }, "Revisa la categoría de cada uno. La app recordará tus elecciones para la próxima vez."),
      list, setBalance, run, button("Elegir otro archivo", { variant: "ghost", block: true, onClick: () => body.replaceChildren(intro) }),
    ].filter((x) => !!x) as HTMLElement[]);
    count();
    run.addEventListener("click", async () => {
      run.disabled = true;
      try {
        const r = await importStatement(accountId, fresh, conceptKey);
        if (latest && (document.getElementById("set-balance") as HTMLInputElement | null)?.checked) {
          // El saldo del extracto es el del final de ese día: se cuadra con todo lo apuntado en la cuenta.
          await setAccountBalanceToday(accountId, latest.balanceCents! + await accountNetAfter(accountId, latest.date));
        }
        toast(`Importados ${r.txs} movimientos${r.moves ? ` y ${r.moves} aportes a huchas` : ""}`, "success");
        go(`#/movimientos?mes=${dates[dates.length - 1].slice(0, 7)}`);
      } catch (e) { toast(errorText(e), "danger"); run.disabled = false; }
    });
  }

  return screen({ title: "Importar extracto", back: q.get("volver") ?? "#/cuentas" },
    accounts.length ? body : emptyState("Primero crea una cuenta", "Crea la cuenta del banco antes de importar.", Landmark));
}
function importRow(d: ImportDecision & { dup: boolean }, cats: Category[], pots: Pot[], onChange: () => void): HTMLElement {
  const li = h("li", { class: `import-row${d.dup ? " is-dup" : ""}` });
  const amount = h("span", { class: `num tx-amount ${d.amountCents < 0 ? "expense" : "income"}` }, `${d.amountCents < 0 ? "−" : "+"}${money(Math.abs(d.amountCents))}`);
  const headRow = h("div", { class: "import-head" },
    h("span", { class: "tx-main" }, h("span", { class: "tx-title" }, d.concept), h("span", { class: "tx-sub" }, [dayLabel(d.date), d.detail].filter(Boolean).join(" · "))), amount);
  if (d.dup) { li.append(headRow, h("span", { class: "muted small" }, "Ya importado")); return li; }
  const id = `imp-${d.key.replace(/[^a-z0-9]/gi, "").slice(-24)}-${Math.random().toString(36).slice(2, 6)}`;
  const what = h("select", { class: "input input-sm", id: `${id}-a`, "aria-label": `Qué es: ${d.concept}` },
    h("option", { value: d.amountCents < 0 ? "expense" : "income", selected: d.action === "expense" || d.action === "income" }, d.amountCents < 0 ? "Gasto" : "Ingreso"),
    ...pots.map((p) => h("option", { value: `pot:${p.id}`, selected: d.action === "pot" && d.potId === p.id }, `${d.amountCents < 0 ? "Aporte a" : "Retirada de"} ${p.name}`)),
    h("option", { value: "skip", selected: d.action === "skip" }, "No importar"));
  const type = d.amountCents < 0 ? "expense" : "income";
  const cat = h("select", { class: "input input-sm", id: `${id}-c`, "aria-label": `Categoría: ${d.concept}` },
    h("option", { value: "" }, "Sin categoría"), ...cats.filter((c) => c.type === type).map((c) => h("option", { value: c.id, selected: c.id === d.categoryId }, c.name)));
  const sync = () => {
    const v = what.value;
    d.action = v === "skip" ? "skip" : v.startsWith("pot:") ? "pot" : (v as "expense" | "income");
    d.potId = v.startsWith("pot:") ? v.slice(4) : undefined;
    cat.hidden = d.action !== "expense" && d.action !== "income";
    li.classList.toggle("is-skip", d.action === "skip");
    onChange();
  };
  what.addEventListener("change", sync);
  cat.addEventListener("change", () => { d.categoryId = cat.value || null; });
  li.append(headRow, h("div", { class: "import-controls" }, what, cat));
  sync();
  return li;
}

