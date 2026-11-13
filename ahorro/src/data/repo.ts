// Funciones de datos de la app (ver replica/architecture.md). Las pantallas solo
// llaman a esto; en la fase 4 se añade la sincronización por debajo sin tocarlas.
import * as db from "./db";
import {
  addDays, addMonths, daysInMonth, isoWeekday, monthOf, monthRange, nowIso, sameDayLastMonth, thisMonth, today,
} from "./dates";
import type {
  Account, AssistantMessage, Category, CategoryKind, Month, MonthPlan, MonthRecap, Note, Pot, PotMovement, PotType,
  RecapSummary, Reflection, Reminder, Settings, Transaction, TxType, Ymd,
} from "./types";

const uuid = () => crypto.randomUUID();
const alive = <T extends { deletedAt?: string }>(xs: T[]) => xs.filter((x) => !x.deletedAt);

/* Ajustes ---------------------------------------------------------------- */
export function defaultSettings(): Settings {
  return { id: "me", nickname: "", currency: "EUR", firstSteps: [], liquidStartCents: 0, liquidStartDate: `${thisMonth()}-01`,
    theme: "system", openDays: [], updatedAt: nowIso() };
}
export async function getSettings(): Promise<Settings> {
  return { ...defaultSettings(), ...((await db.get<Settings>("settings", "me")) ?? {}) };
}
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const s = { ...(await getSettings()), ...patch, updatedAt: nowIso() };
  await db.put("settings", s);
  return s;
}
export async function markFirstStep(step: string): Promise<void> {
  const s = await getSettings();
  if (!s.firstSteps.includes(step)) await saveSettings({ firstSteps: [...s.firstSteps, step] });
}
/** Apunta que hoy se ha abierto la app (para la racha). Guarda ~2 años. */
export async function recordOpen(): Promise<void> {
  const s = await getSettings(); const t = today();
  if (s.openDays.at(-1) === t) return;
  await saveSettings({ openDays: [...s.openDays.filter((d) => d !== t), t].slice(-800) });
}

/* Categorías ---------------------------------------------------------------- */
export const DEFAULT_CATEGORIES: Omit<Category, "id" | "updatedAt" | "sortOrder" | "archived">[] = [
  { name: "Vivienda", type: "expense", kind: "fijo", color: "chart-1", monthlyLimitCents: null },
  { name: "Comida", type: "expense", kind: "discrecional", color: "chart-2", monthlyLimitCents: null },
  { name: "Transporte", type: "expense", kind: "fijo", color: "chart-4", monthlyLimitCents: null },
  { name: "Ocio", type: "expense", kind: "discrecional", color: "chart-3", monthlyLimitCents: null },
  { name: "Suscripciones", type: "expense", kind: "fijo", color: "chart-6", monthlyLimitCents: null },
  { name: "Caprichos", type: "expense", kind: "discrecional", color: "chart-5", monthlyLimitCents: null },
  { name: "Préstamos", type: "expense", kind: "deuda", color: "chart-7", monthlyLimitCents: null },
  { name: "Nómina", type: "income", color: "chart-4", monthlyLimitCents: null },
  { name: "Extras", type: "income", color: "chart-2", monthlyLimitCents: null },
];

export async function listCategories(type?: TxType, opts: { includeArchived?: boolean } = {}): Promise<Category[]> {
  let cs = alive(await db.getAll<Category>("categories"));
  if (cs.length === 0 && !(await db.get<Settings>("settings", "me"))?.onboardedAt) cs = await ensureDefaultCategories();
  return cs.filter((c) => (!type || c.type === type) && (opts.includeArchived || !c.archived)).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
}
export async function ensureDefaultCategories(): Promise<Category[]> {
  const existing = alive(await db.getAll<Category>("categories"));
  if (existing.length) return existing;
  const cs = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: uuid(), sortOrder: i, archived: false, updatedAt: nowIso() }));
  await db.write(cs.map((value) => ({ store: "categories", value })));
  return cs;
}
export async function upsertCategory(c: Partial<Category> & { name: string; type: TxType }): Promise<Category> {
  const all = alive(await db.getAll<Category>("categories"));
  const dup = all.find((x) => x.id !== c.id && x.type === c.type && x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
  if (dup) throw new Error(`Ya tienes una categoría llamada «${dup.name}».`);
  const prev = c.id ? all.find((x) => x.id === c.id) : undefined;
  const v: Category = {
    id: c.id ?? uuid(), name: c.name.trim(), type: c.type, kind: c.type === "expense" ? (c.kind ?? prev?.kind ?? "discrecional") : undefined,
    color: c.color ?? prev?.color ?? `chart-${(all.length % 6) + 1}`, icon: c.icon ?? prev?.icon, monthlyLimitCents: c.monthlyLimitCents ?? prev?.monthlyLimitCents ?? null,
    sortOrder: c.sortOrder ?? prev?.sortOrder ?? all.length, archived: c.archived ?? prev?.archived ?? false, updatedAt: nowIso(),
  };
  await db.put("categories", v);
  return v;
}
export async function setLimit(categoryId: string, cents: number | null): Promise<void> {
  const c = await db.get<Category>("categories", categoryId);
  if (c) await db.put("categories", { ...c, monthlyLimitCents: cents, updatedAt: nowIso() });
}

/* Movimientos --------------------------------------------------------------- */
export interface TxInput { type: TxType; amountCents: number; categoryId: string | null; title: string; occurredOn: Ymd; note?: string; accountId?: string; importKey?: string }

export async function addTransaction(t: TxInput, photo?: Blob | null): Promise<Transaction> {
  validateTx(t);
  const v: Transaction = { id: uuid(), ...t, title: t.title.trim(), note: (t.note ?? "").trim(), hasPhoto: !!photo, createdAt: nowIso(), updatedAt: nowIso() };
  await db.write([{ store: "transactions", value: v }, ...(photo ? [{ store: "photos" as const, value: photo, key: v.id }] : [])]);
  return v;
}
/** photo: undefined = no tocar, null = quitar, Blob = cambiar. */
export async function updateTransaction(id: string, patch: Partial<TxInput>, photo?: Blob | null): Promise<Transaction> {
  const prev = await db.get<Transaction>("transactions", id);
  if (!prev || prev.deletedAt) throw new Error("Ese movimiento ya no existe.");
  const v: Transaction = { ...prev, ...patch, hasPhoto: photo === undefined ? prev.hasPhoto : !!photo, updatedAt: nowIso() };
  validateTx(v);
  const ops: db.Write[] = [{ store: "transactions", value: v }];
  if (photo === null) ops.push({ store: "photos", key: id, del: true });
  else if (photo) ops.push({ store: "photos", value: photo, key: id });
  await db.write(ops);
  return v;
}
export async function deleteTransaction(id: string): Promise<void> {
  const prev = await db.get<Transaction>("transactions", id);
  if (!prev) return;
  await db.write([{ store: "transactions", value: { ...prev, deletedAt: nowIso(), updatedAt: nowIso() } }, { store: "photos", key: id, del: true }]);
}
function validateTx(t: TxInput) {
  if (!Number.isInteger(t.amountCents) || t.amountCents <= 0) throw new Error("El importe tiene que ser mayor que cero.");
  if (t.amountCents > 100_000_000_00) throw new Error("Ese importe es demasiado grande.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.occurredOn)) throw new Error("La fecha no es válida.");
}
export const getTransaction = async (id: string) => { const t = await db.get<Transaction>("transactions", id); return t && !t.deletedAt ? t : undefined; };
export const getPhoto = (txId: string) => db.get<Blob>("photos", txId);

export async function listTransactions(f: { month?: Month; from?: Ymd; to?: Ymd; categoryId?: string | null; type?: TxType; day?: Ymd } = {}): Promise<Transaction[]> {
  let [from, to] = f.month ? monthRange(f.month) : [f.from ?? "0000-01-01", f.to ?? "9999-12-31"];
  if (f.day) from = to = f.day;
  const xs = alive(await db.range<Transaction>("transactions", "occurredOn", from, to))
    .filter((t) => (f.type ? t.type === f.type : true) && (f.categoryId === undefined ? true : t.categoryId === f.categoryId));
  return xs.sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt));
}

/* Huchas ------------------------------------------------------------------- */
export async function listPots(type?: PotType): Promise<Pot[]> {
  return alive(await db.getAll<Pot>("pots")).filter((p) => !type || p.type === type).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function upsertPot(p: Partial<Pot> & { name: string; type: PotType }): Promise<Pot> {
  const prev = p.id ? await db.get<Pot>("pots", p.id) : undefined;
  const v: Pot = { id: p.id ?? uuid(), type: p.type, name: p.name.trim(), goalCents: p.goalCents ?? null, goalReachedAt: prev?.goalReachedAt,
    institution: (p.institution ?? prev?.institution ?? "").trim() || undefined,
    createdAt: prev?.createdAt ?? nowIso(), updatedAt: nowIso() };
  if (!v.name) throw new Error("Ponle un nombre.");
  if (prev && v.goalCents !== prev.goalCents) v.goalReachedAt = undefined;
  await db.put("pots", v);
  return v;
}
export async function deletePot(id: string): Promise<void> {
  const p = await db.get<Pot>("pots", id); if (!p) return;
  const movs = await db.range<PotMovement>("potMovements", "potId", id, id);
  const t = nowIso();
  await db.write([{ store: "pots", value: { ...p, deletedAt: t, updatedAt: t } }, ...movs.map((m) => ({ store: "potMovements" as const, value: { ...m, deletedAt: t, updatedAt: t } }))]);
}
export async function potBalance(potId: string): Promise<number> {
  return alive(await db.range<PotMovement>("potMovements", "potId", potId, potId)).reduce((a, m) => a + (m.kind === "contribution" ? m.amountCents : -m.amountCents), 0);
}
export async function listPotMovements(f: { potId?: string; month?: Month } = {}): Promise<PotMovement[]> {
  const xs = f.potId ? await db.range<PotMovement>("potMovements", "potId", f.potId, f.potId)
    : f.month ? await db.range<PotMovement>("potMovements", "occurredOn", ...monthRange(f.month)) : await db.getAll<PotMovement>("potMovements");
  return alive(xs).filter((m) => !f.month || monthOf(m.occurredOn) === f.month).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt));
}
/** Devuelve si con este movimiento se ha cumplido la meta (para avisar). */
export async function addPotMovement(potId: string, kind: PotMovement["kind"], amountCents: number, occurredOn: Ymd, note = "",
  opts: boolean | { initial?: boolean; accountId?: string; importKey?: string } = {}): Promise<{ goalReached: boolean }> {
  const { initial = false, accountId, importKey } = typeof opts === "boolean" ? { initial: opts } : opts;
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("El importe tiene que ser mayor que cero.");
  const pot = await db.get<Pot>("pots", potId);
  if (!pot || pot.deletedAt) throw new Error("Esa hucha ya no existe.");
  const bal = await potBalance(potId);
  if (kind === "withdrawal" && amountCents > bal) throw new Error(`Solo hay ${(bal / 100).toLocaleString("es-ES", { minimumFractionDigits: 2 })} € en esta hucha.`);
  const m: PotMovement = { id: uuid(), potId, kind, amountCents, occurredOn, note, initial: initial || undefined, accountId, importKey, createdAt: nowIso(), updatedAt: nowIso() };
  const after = bal + (kind === "contribution" ? amountCents : -amountCents);
  const goalReached = !!pot.goalCents && !pot.goalReachedAt && after >= pot.goalCents;
  await db.write([{ store: "potMovements", value: m }, ...(goalReached ? [{ store: "pots" as const, value: { ...pot, goalReachedAt: nowIso(), updatedAt: nowIso() } }] : [])]);
  return { goalReached };
}
/** Marca un aporte como dinero que ya tenías (no sale del disponible ni cuenta como aportado ese mes). */
export async function setPotMovementInitial(id: string, initial: boolean): Promise<void> {
  const m = (await db.getAll<PotMovement>("potMovements")).find((x) => x.id === id);
  if (m) await db.put("potMovements", { ...m, initial: initial || undefined, updatedAt: nowIso() });
}
export async function deletePotMovement(id: string): Promise<void> {
  const all = await db.getAll<PotMovement>("potMovements"); const m = all.find((x) => x.id === id);
  if (m) await db.put("potMovements", { ...m, deletedAt: nowIso(), updatedAt: nowIso() });
}

/* Resumen del mes -------------------------------------------------------------- */
export interface LimitState { category: Category; spentCents: number; limitCents: number }
export interface MonthSummary {
  month: Month; incomeCents: number; expenseCents: number; savedCents: number; investedCents: number; balanceCents: number;
  txCount: number; limits: LimitState[];
}
export async function monthSummary(month: Month): Promise<MonthSummary> {
  const [txs, movs, pots, cats] = await Promise.all([listTransactions({ month }), listPotMovements({ month }), db.getAll<Pot>("pots"), listCategories("expense")]);
  const potType = new Map(pots.map((p) => [p.id, p.type]));
  const sum = (xs: Transaction[], t: TxType) => xs.filter((x) => x.type === t).reduce((a, x) => a + x.amountCents, 0);
  const net = (t: PotType) => movs.filter((m) => !m.initial && potType.get(m.potId) === t).reduce((a, m) => a + (m.kind === "contribution" ? m.amountCents : -m.amountCents), 0);
  const incomeCents = sum(txs, "income"), expenseCents = sum(txs, "expense"), savedCents = net("savings"), investedCents = net("investment");
  const spentBy = new Map<string, number>();
  for (const t of txs) if (t.type === "expense" && t.categoryId) spentBy.set(t.categoryId, (spentBy.get(t.categoryId) ?? 0) + t.amountCents);
  const limits = cats.filter((c) => c.monthlyLimitCents).map((c) => ({ category: c, spentCents: spentBy.get(c.id) ?? 0, limitCents: c.monthlyLimitCents! }));
  // Lo que sobra = entró − gastado. Ahorrar o invertir no es gastar: se cuenta aparte (savedCents, investedCents).
  return { month, incomeCents, expenseCents, savedCents, investedCents, balanceCents: incomeCents - expenseCents, txCount: txs.length, limits };
}

export interface Breakdown { segments: { category: Category | null; cents: number }[]; byKind: Record<CategoryKind, number>; byDay: number[]; totalCents: number }
export async function categoryBreakdown(month: Month, type: TxType): Promise<Breakdown> {
  const [txs, cats] = await Promise.all([listTransactions({ month, type }), listCategories(type, { includeArchived: true })]);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const acc = new Map<string, number>(); const byKind: Record<CategoryKind, number> = { fijo: 0, discrecional: 0, deuda: 0 };
  const byDay = Array(daysInMonth(month)).fill(0);
  for (const t of txs) {
    const key = t.categoryId && byId.has(t.categoryId) ? t.categoryId : "";
    acc.set(key, (acc.get(key) ?? 0) + t.amountCents);
    byDay[Number(t.occurredOn.slice(8)) - 1] += t.amountCents;
    const kind = key ? byId.get(key)!.kind : undefined;
    if (type === "expense") byKind[kind ?? "discrecional"] += t.amountCents;
  }
  const segments = [...acc.entries()].map(([id, cents]) => ({ category: id ? byId.get(id)! : null, cents })).sort((a, b) => (a.category ? 0 : 1) - (b.category ? 0 : 1) || b.cents - a.cents);
  return { segments, byKind, byDay, totalCents: txs.reduce((a, t) => a + t.amountCents, 0) };
}

/** Si los límites suman más de lo que hay para gastar, propone bajarlos en proporción. */
export async function limitsCheck(month: Month): Promise<{ availableCents: number; limitsTotalCents: number; proposal: { id: string; name: string; from: number; to: number }[] } | null> {
  const [s, plan, cats] = await Promise.all([monthSummary(month), getPlan(month), listCategories("expense")]);
  const available = plan ? Math.round((plan.plannedIncomeCents * plan.expensesBp) / 10000) : s.incomeCents;
  const withLimit = cats.filter((c) => c.monthlyLimitCents);
  const total = withLimit.reduce((a, c) => a + c.monthlyLimitCents!, 0);
  if (!available || total <= available) return null;
  const f = available / total;
  return { availableCents: available, limitsTotalCents: total, proposal: withLimit.map((c) => ({ id: c.id, name: c.name, from: c.monthlyLimitCents!, to: Math.floor((c.monthlyLimitCents! * f) / 100) * 100 })) };
}

/* Patrimonio -------------------------------------------------------------------- */
export type AccountWithBalance = Account & { balanceCents: number };
export async function wealth(): Promise<{ liquidCents: number; savingsCents: number; investmentCents: number; totalCents: number;
  pots: (Pot & { balanceCents: number })[]; accounts: AccountWithBalance[] }> {
  const [accounts, movs, pots] = await Promise.all([accountBalances(), db.getAll<PotMovement>("potMovements"), listPots()]);
  const bal = new Map<string, number>();
  for (const m of alive(movs)) bal.set(m.potId, (bal.get(m.potId) ?? 0) + (m.kind === "contribution" ? m.amountCents : -m.amountCents));
  const withBal = pots.map((p) => ({ ...p, balanceCents: bal.get(p.id) ?? 0 }));
  const savingsCents = withBal.filter((p) => p.type === "savings").reduce((a, p) => a + p.balanceCents, 0);
  const investmentCents = withBal.filter((p) => p.type === "investment").reduce((a, p) => a + p.balanceCents, 0);
  const liquid = accounts.filter((a) => !a.archived || a.balanceCents).reduce((x, a) => x + a.balanceCents, 0);
  return { liquidCents: liquid, savingsCents, investmentCents, totalCents: liquid + savingsCents + investmentCents, pots: withBal, accounts };
}

/* Cuentas ------------------------------------------------------------------------ */
export const MAIN_ACCOUNT = "principal";   // id fijo: dos móviles no crean dos «principales»

/** Cuentas vivas. Si no hay ninguna, crea la principal con el saldo de partida de Ajustes. */
export async function listAccounts(opts: { includeArchived?: boolean } = {}): Promise<Account[]> {
  let xs = alive(await db.getAll<Account>("accounts"));
  if (!xs.length) {
    const s = await getSettings();
    const main: Account = { id: MAIN_ACCOUNT, name: "Cuenta principal", kind: "corriente", initialCents: s.liquidStartCents, initialDate: s.liquidStartDate,
      color: "chart-2", sortOrder: 0, archived: false, createdAt: nowIso(), updatedAt: nowIso() };
    if (s.onboardedAt) await db.put("accounts", main);
    xs = [main];
  }
  return xs.filter((a) => opts.includeArchived || !a.archived).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}
export async function upsertAccount(a: Partial<Account> & { name: string }): Promise<Account> {
  const all = await listAccounts({ includeArchived: true });
  const prev = a.id ? all.find((x) => x.id === a.id) : undefined;
  const v: Account = { id: a.id ?? uuid(), name: a.name.trim(), kind: a.kind ?? prev?.kind ?? "corriente",
    initialCents: a.initialCents ?? prev?.initialCents ?? 0, initialDate: a.initialDate ?? prev?.initialDate ?? today(),
    color: a.color ?? prev?.color ?? `chart-${(all.length % 6) + 1}`, sortOrder: a.sortOrder ?? prev?.sortOrder ?? all.length,
    archived: a.archived ?? prev?.archived ?? false, createdAt: prev?.createdAt ?? nowIso(), updatedAt: nowIso() };
  if (!v.name) throw new Error("Ponle un nombre.");
  if (all.some((x) => x.id !== v.id && !x.archived && x.name.toLowerCase() === v.name.toLowerCase())) throw new Error(`Ya tienes una cuenta llamada «${v.name}».`);
  await db.put("accounts", v);
  return v;
}
/** Resuelve la cuenta de un movimiento: la suya, o la primera si no tiene o ya no existe. */
function accountResolver(accounts: Account[]): (id?: string) => string {
  const ids = new Set(accounts.map((a) => a.id));
  const fallback = ids.has(MAIN_ACCOUNT) ? MAIN_ACCOUNT : accounts[0]?.id ?? MAIN_ACCOUNT;
  return (id) => (id && ids.has(id) ? id : fallback);
}
/** Saldo de cada cuenta (antes del día `before`, si se da). */
export async function accountBalances(before?: Ymd): Promise<AccountWithBalance[]> {
  const [accounts, txs, movs] = await Promise.all([listAccounts({ includeArchived: true }), listTransactions({ from: "0000-01-01" }), db.getAll<PotMovement>("potMovements")]);
  const of = accountResolver(accounts);
  const byId = new Map(accounts.map((a) => [a.id, { ...a, balanceCents: a.initialCents }]));
  const counts = (acc: Account, d: Ymd) => d >= acc.initialDate && (!before || d < before);
  for (const x of txs) { const a = byId.get(of(x.accountId))!; if (counts(a, x.occurredOn)) a.balanceCents += x.type === "income" ? x.amountCents : -x.amountCents; }
  for (const m of alive(movs)) {
    if (m.initial) continue;
    const a = byId.get(of(m.accountId))!;
    if (counts(a, m.occurredOn)) a.balanceCents -= m.kind === "contribution" ? m.amountCents : -m.amountCents;
  }
  return [...byId.values()];
}
/** Lo apuntado en una cuenta después de `day` (para cuadrar con el saldo de un extracto de ese día). */
export async function accountNetAfter(accountId: string, day: Ymd): Promise<number> {
  const [accounts, txs, movs] = await Promise.all([listAccounts({ includeArchived: true }), listTransactions({ from: addDays(day, 1) }), db.getAll<PotMovement>("potMovements")]);
  const of = accountResolver(accounts);
  let net = 0;
  for (const x of txs) if (of(x.accountId) === accountId) net += x.type === "income" ? x.amountCents : -x.amountCents;
  for (const m of alive(movs)) if (!m.initial && m.occurredOn > day && of(m.accountId) === accountId) net -= m.kind === "contribution" ? m.amountCents : -m.amountCents;
  return net;
}
/** «Cuadrar con el banco»: ajusta el saldo de partida para que hoy dé `realCents`. */
export async function setAccountBalanceToday(id: string, realCents: number): Promise<void> {
  const a = (await accountBalances()).find((x) => x.id === id);
  if (!a) throw new Error("Esa cuenta ya no existe.");
  await upsertAccount({ ...a, initialCents: a.initialCents + (realCents - a.balanceCents) });
}

/* Planificación ------------------------------------------------------------------ */
export const getPlan = async (month: Month) => db.get<MonthPlan>("monthPlans", month);
export async function savePlan(p: Omit<MonthPlan, "updatedAt">): Promise<void> {
  if (p.expensesBp + p.savingsBp + p.investmentsBp > 10000) throw new Error("El reparto pasa del 100 %.");
  await db.put("monthPlans", { ...p, updatedAt: nowIso() });
}
export async function planVsActual(month: Month) {
  const [plan, s] = await Promise.all([getPlan(month), monthSummary(month)]);
  if (!plan) return null;
  const pctOf = (c: number, base: number) => (base > 0 ? Math.round((c / base) * 100) : 0);
  const base = s.incomeCents || plan.plannedIncomeCents;
  return {
    plan: { expensesPct: plan.expensesBp / 100, savingsPct: plan.savingsBp / 100, investmentsPct: plan.investmentsBp / 100 },
    actual: { expensesPct: pctOf(s.expenseCents, base), savingsPct: pctOf(s.savedCents, base), investmentsPct: pctOf(s.investedCents, base) },
    plannedIncomeCents: plan.plannedIncomeCents, actualIncomeCents: s.incomeCents,
  };
}

/* Calendario: notas y recordatorios ------------------------------------------------- */
export async function listNotes(from: Ymd, to: Ymd): Promise<Note[]> { return alive(await db.range<Note>("notes", "onDate", from, to)); }
export async function saveNote(onDate: Ymd, text: string, id?: string): Promise<void> {
  const t = text.trim();
  if (!t) throw new Error("La nota está vacía.");
  const prev = id ? (await db.range<Note>("notes", "onDate", onDate, onDate)).find((n) => n.id === id) : undefined;
  await db.put("notes", { id: id ?? uuid(), onDate, text: t, createdAt: prev?.createdAt ?? nowIso(), updatedAt: nowIso() });
}
export async function deleteNote(n: Note): Promise<void> { await db.put("notes", { ...n, deletedAt: nowIso(), updatedAt: nowIso() }); }

export async function listReminders(): Promise<Reminder[]> { return alive(await db.getAll<Reminder>("reminders")).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
export async function saveReminder(r: Omit<Reminder, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<void> {
  if (!r.text.trim()) throw new Error("Escribe de qué te aviso.");
  if (r.schedule === "once" && !r.onDate) throw new Error("Elige el día.");
  await db.put("reminders", { ...r, id: r.id ?? uuid(), text: r.text.trim(), createdAt: nowIso(), updatedAt: nowIso() });
}
export async function deleteReminder(r: Reminder): Promise<void> { await db.put("reminders", { ...r, deletedAt: nowIso(), updatedAt: nowIso() }); }
export function reminderFallsOn(r: Reminder, d: Ymd): boolean {
  if (r.schedule === "once") return r.onDate === d;
  if (r.schedule === "weekly") return r.weekday === isoWeekday(d);
  const last = daysInMonth(monthOf(d));
  return Math.min(r.monthDay ?? 1, last) === Number(d.slice(8));
}
/** Recordatorios de hoy que aún no se han enseñado. Los marca como enseñados. */
export async function takeDueReminders(): Promise<Reminder[]> {
  const t = today();
  const due = (await listReminders()).filter((r) => reminderFallsOn(r, t) && r.lastShownOn !== t);
  if (due.length) await db.write(due.map((r) => ({ store: "reminders", value: { ...r, lastShownOn: t, updatedAt: nowIso() } })));
  return due;
}

/* Cierre de mes ------------------------------------------------------------------- */
export async function buildSummary(month: Month): Promise<RecapSummary> {
  const [s, prev, txs, cats, plan] = await Promise.all([monthSummary(month), monthSummary(addMonths(month, -1)), listTransactions({ month }), listCategories("expense", { includeArchived: true }), planVsActual(month)]);
  const w = await liquidAt(`${month}-01`);
  const brk = await categoryBreakdown(month, "expense");
  const top = brk.segments.find((x) => x.category);
  const biggest = txs.filter((t) => t.type === "expense").sort((a, b) => b.amountCents - a.amountCents)[0];
  void cats;
  return {
    month, incomeCents: s.incomeCents, expenseCents: s.expenseCents, savedCents: s.savedCents, investedCents: s.investedCents, balanceCents: s.balanceCents,
    liquidStartCents: w, liquidEndCents: w + s.balanceCents - s.savedCents - s.investedCents, txCount: txs.length,
    photoTxIds: txs.filter((t) => t.hasPhoto).map((t) => t.id).slice(0, 12),
    topCategory: top ? { name: top.category!.name, cents: top.cents } : null,
    biggestExpense: biggest ? { title: biggest.title || "Sin concepto", cents: biggest.amountCents, occurredOn: biggest.occurredOn } : null,
    prevExpenseCents: prev.txCount ? prev.expenseCents : null,
    plan: plan?.plan ?? null, actual: plan?.actual ?? null,
  };
}
async function liquidAt(day: Ymd): Promise<number> {
  return (await accountBalances(day)).reduce((x, a) => x + a.balanceCents, 0);
}

/** Congela el resumen de los meses ya terminados que tengan datos (una vez por mes). */
export async function closeFinishedMonths(): Promise<MonthRecap[]> {
  const current = thisMonth();
  const prev = addMonths(current, -1);
  const done = await db.get<MonthRecap>("monthRecaps", prev);
  if (done) return [];
  const s = await monthSummary(prev);
  if (s.txCount === 0) return [];
  const r: MonthRecap = { month: prev, summary: await buildSummary(prev), createdAt: nowIso() };
  await db.put("monthRecaps", r);
  return [r];
}
export const getRecap = (m: Month) => db.get<MonthRecap>("monthRecaps", m);
export async function listRecaps(): Promise<MonthRecap[]> { return (await db.getAll<MonthRecap>("monthRecaps")).sort((a, b) => b.month.localeCompare(a.month)); }
export async function markRecapSeen(m: Month): Promise<void> { const r = await getRecap(m); if (r && !r.seenAt) await db.put("monthRecaps", { ...r, seenAt: nowIso() }); }

export const REFLECTION_QUESTIONS = [
  "¿Qué gasto de este mes repetirías sin dudar?",
  "¿Cuál te sobró y por qué crees que lo hiciste?",
  "¿Qué cambiarías el mes que viene, aunque sea pequeño?",
];
export async function listReflections(month: Month): Promise<Reflection[]> { return db.range<Reflection>("reflections", "month", month, month); }
export async function saveReflection(month: Month, question: string, answer: string): Promise<void> {
  const existing = (await listReflections(month)).find((r) => r.question === question);
  await db.put("reflections", { id: existing?.id ?? uuid(), month, question, answer: answer.trim(), updatedAt: nowIso() });
}

/* Rachas y recuerdos --------------------------------------------------------------- */
export async function streaks(): Promise<{ openDays: number; photoTx: number; greenMonths: number; greenHistory: { month: Month; green: boolean | null }[] }> {
  const s = await getSettings();
  const set = new Set(s.openDays);
  let openDays = 0; let d = today();
  while (set.has(d)) { openDays++; d = addDays(d, -1); }
  const all = alive(await db.getAll<Transaction>("transactions")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let photoTx = 0; for (const t of all) { if (!t.hasPhoto) break; photoTx++; }
  const greenHistory: { month: Month; green: boolean | null }[] = [];
  for (let i = 1; i <= 6; i++) {
    const m = addMonths(thisMonth(), -i);
    const ms = await monthSummary(m);
    greenHistory.push({ month: m, green: ms.txCount ? ms.incomeCents > ms.expenseCents : null });
  }
  let greenMonths = 0; for (const g of greenHistory) { if (!g.green) break; greenMonths++; }
  return { openDays, photoTx, greenMonths, greenHistory: greenHistory.reverse() };
}
/** Lo que pasó hace un mes (±3 días), con fotos primero. */
export async function oneMonthAgo(): Promise<{ day: Ymd; txs: Transaction[] } | null> {
  const center = sameDayLastMonth(today());
  for (const off of [0, -1, 1, -2, 2, -3, 3]) {
    const day = addDays(center, off);
    const txs = await listTransactions({ day });
    if (txs.length) return { day, txs: txs.sort((a, b) => Number(b.hasPhoto) - Number(a.hasPhoto)) };
  }
  return null;
}

/* Asistente --------------------------------------------------------------------- */
export async function listMessages(): Promise<AssistantMessage[]> { return (await db.getAll<AssistantMessage>("assistantMessages")).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
export async function addMessage(role: AssistantMessage["role"], text: string, source: AssistantMessage["source"] = "chat"): Promise<AssistantMessage> {
  const m: AssistantMessage = { id: uuid(), role, source, text, createdAt: nowIso() };
  await db.put("assistantMessages", m);
  return m;
}
export async function clearMessages(): Promise<void> { const ms = await listMessages(); await db.write(ms.map((m) => ({ store: "assistantMessages", key: m.id, del: true }))); }
export async function bumpUsage(kind: string): Promise<number> {
  const key = `${kind}:${today()}`; const n = ((await db.get<number>("usage", key)) ?? 0) + 1;
  await db.put("usage", n, key); return n;
}

/* Copia de seguridad y borrado -------------------------------------------------------- */
export async function exportBackup(withPhotos: boolean): Promise<Blob> {
  const out: Record<string, unknown> = { app: "ahorro", version: 1, exportedAt: nowIso() };
  for (const s of db.STORES) {
    if (s === "photos" || s === "outbox" || s === "meta") continue;
    out[s] = await db.entries(s);
  }
  if (withPhotos) {
    const photos: [string, string][] = [];
    for (const [k, v] of await db.entries("photos")) photos.push([k, await blobToDataUrl(v as Blob)]);
    out.photos = photos;
  }
  return new Blob([JSON.stringify(out)], { type: "application/json" });
}
export async function importBackup(file: File): Promise<{ transactions: number }> {
  let data: Record<string, unknown>;
  try { data = JSON.parse(await file.text()); } catch { throw new Error("Ese archivo no es una copia de esta app."); }
  if (data.app !== "ahorro") throw new Error("Ese archivo no es una copia de esta app.");
  const ops: db.Write[] = [];
  for (const s of db.STORES) {
    if (s === "outbox" || s === "meta") continue;
    const rows = data[s] as [string, unknown][] | undefined;
    if (!Array.isArray(rows)) continue;
    for (const [k, v] of rows) ops.push(s === "photos" ? { store: s, key: k, value: await (await fetch(v as string)).blob() } : s === "usage" ? { store: s, key: k, value: v } : { store: s, value: v });
  }
  await db.clearAll();
  await db.write(ops);
  return { transactions: ((data.transactions as unknown[]) ?? []).length };
}
export const wipeAll = () => db.clearAll({ includeMeta: true });
function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
}

/* Importar extractos --------------------------------------------------------------- */
export interface ImportDecision {
  key: string; date: Ymd; concept: string; detail: string; amountCents: number;   // amount con signo
  action: "expense" | "income" | "pot" | "skip"; categoryId: string | null; potId?: string;
}
/** Huellas ya importadas (para marcar los repetidos). */
export async function existingImportKeys(): Promise<Set<string>> {
  const [txs, movs] = await Promise.all([db.getAll<Transaction>("transactions"), db.getAll<PotMovement>("potMovements")]);
  return new Set([...alive(txs), ...alive(movs)].map((x) => x.importKey).filter((k): k is string => !!k));
}
/** Apunta las filas elegidas en una sola transacción y recuerda la categoría de cada concepto. */
export async function importStatement(accountId: string, rows: ImportDecision[], conceptKey: (s: string) => string): Promise<{ txs: number; moves: number }> {
  const ops: db.Write[] = []; const t = nowIso(); let txs = 0, moves = 0;
  const s = await getSettings(); const rules = { ...(s.importRules ?? {}) };
  for (const r of rows) {
    if (r.action === "skip") continue;
    const cents = Math.abs(r.amountCents);
    if (r.action === "pot") {
      if (!r.potId) continue;
      ops.push({ store: "potMovements", value: { id: uuid(), potId: r.potId, kind: r.amountCents < 0 ? "contribution" : "withdrawal", amountCents: cents,
        occurredOn: r.date, note: r.concept.slice(0, 80), accountId, importKey: r.key, createdAt: t, updatedAt: t } satisfies PotMovement });
      moves++; continue;
    }
    ops.push({ store: "transactions", value: { id: uuid(), type: r.action, amountCents: cents, categoryId: r.categoryId, title: r.concept.slice(0, 80),
      occurredOn: r.date, note: r.detail.slice(0, 1000), hasPhoto: false, accountId, importKey: r.key, createdAt: t, updatedAt: t } satisfies Transaction });
    if (r.categoryId) rules[conceptKey(r.concept)] = r.categoryId;
    txs++;
  }
  ops.push({ store: "settings", value: { ...s, importRules: rules, updatedAt: t } });
  await db.write(ops);
  return { txs, moves };
}
