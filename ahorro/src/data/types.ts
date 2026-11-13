// Tipos de datos. Mismos campos que replica/schema.sql, en camelCase.
// Dinero en céntimos enteros. Fechas de calendario "YYYY-MM-DD" locales. Instantes ISO.

export type Ymd = string;   // "2026-11-13"
export type Month = string; // "2026-11"
export type TxType = "income" | "expense";
export type CategoryKind = "fijo" | "discrecional" | "deuda";
export type PotType = "savings" | "investment";

interface Synced { updatedAt: string; deletedAt?: string }

export interface Settings {
  id: "me";
  nickname: string;
  currency: "EUR";
  goal?: "controlar_gastos" | "ahorrar" | "invertir" | "entender";
  management?: "nada" | "cabeza" | "excel" | "otra_app";
  savingRange?: "<100" | "100-300" | "300-600" | ">600";
  onboardedAt?: string;
  firstSteps: string[];
  firstStepsDismissed?: boolean;
  liquidStartCents: number;
  liquidStartDate: Ymd;
  theme: "system" | "light" | "dark";
  openDays: Ymd[];
  /** Concepto de extracto normalizado → categoría elegida (para adivinar en la próxima importación). */
  importRules?: Record<string, string>;
  accountsSetupDone?: boolean;   // ya pasó por «Configura tus cuentas»
  lastBackupAt?: string;         // última copia de seguridad descargada
  lastAccountId?: string;        // última cuenta usada al apuntar
  updatedAt: string;
}

export interface Category extends Synced {
  id: string;
  name: string;
  type: TxType;
  kind?: CategoryKind;
  color: string;            // nombre de token: "chart-1"…"chart-7"
  icon?: string;            // clave de CATEGORY_ICONS; si falta, se deduce del nombre
  monthlyLimitCents: number | null;
  sortOrder: number;
  archived: boolean;
}

/** Cuenta de dinero disponible: un banco, efectivo… (las huchas siguen siendo ahorro e inversión). */
export interface Account extends Synced {
  id: string;
  name: string;              // «Cuenta de la nómina», «Efectivo»
  kind: "corriente" | "efectivo" | "otra";
  initialCents: number;      // saldo el día initialDate
  initialDate: Ymd;
  color: string;             // token "chart-n"
  sortOrder: number;
  archived: boolean;
  createdAt: string;
}

export interface Transaction extends Synced {
  id: string;
  type: TxType;
  amountCents: number;
  categoryId: string | null;
  title: string;
  occurredOn: Ymd;
  note: string;
  hasPhoto: boolean;
  accountId?: string;        // sin cuenta = la cuenta principal
  importKey?: string;        // huella del movimiento importado de un extracto (para no repetirlo)
  createdAt: string;
}

export interface Pot extends Synced {
  id: string;
  type: PotType;
  name: string;
  goalCents: number | null;
  goalReachedAt?: string;
  institution?: string;      // banco o entidad donde está
  /** Inversión: lo que vale (lo actualiza la persona). Si falta, se usa lo aportado. */
  valueHistory?: { on: Ymd; cents: number }[];
  createdAt: string;
}

export interface PotMovement extends Synced {
  id: string;
  potId: string;
  kind: "contribution" | "withdrawal";
  amountCents: number;
  occurredOn: Ymd;
  note: string;
  /** Saldo que ya tenías al empezar: no sale de tu dinero líquido ni cuenta como ahorro del mes. */
  initial?: boolean;
  accountId?: string;        // de qué cuenta sale o a cuál vuelve el dinero (sin cuenta = la principal)
  importKey?: string;
  createdAt: string;
}

export interface MonthPlan {
  month: Month;
  plannedIncomeCents: number;
  mode: "pct" | "amount";
  expensesBp: number;   // puntos básicos: 3500 = 35 %
  savingsBp: number;
  investmentsBp: number;
  updatedAt: string;
}

/** Dinero que pasa de una cuenta tuya a otra (no es gasto ni ingreso). */
export interface Transfer extends Synced {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  occurredOn: Ymd;
  note: string;
  importKey?: string;
  createdAt: string;
}

/** Movimiento fijo que se apunta solo cada mes (alquiler, nómina, suscripciones…). */
export interface Recurring extends Synced {
  id: string;
  type: TxType;
  amountCents: number;
  categoryId: string | null;
  title: string;
  accountId?: string;
  dayOfMonth: number;        // 1-31 (31 = último día del mes)
  startMonth: Month;         // primer mes en que se apunta
  active: boolean;
  createdAt: string;
}

export interface Note extends Synced { id: string; onDate: Ymd; text: string; createdAt: string }

export interface Reminder extends Synced {
  id: string;
  text: string;
  schedule: "once" | "weekly" | "monthly";
  onDate?: Ymd;
  weekday?: number;   // 1 = lunes … 7 = domingo
  monthDay?: number;  // 31 = último día
  lastShownOn?: Ymd;
  createdAt: string;
}

export interface RecapSummary {
  month: Month;
  incomeCents: number;
  expenseCents: number;
  savedCents: number;
  investedCents: number;
  balanceCents: number;
  liquidStartCents: number;
  liquidEndCents: number;
  txCount: number;
  photoTxIds: string[];
  topCategory: { name: string; cents: number } | null;
  biggestExpense: { title: string; cents: number; occurredOn: Ymd } | null;
  prevExpenseCents: number | null;
  plan: { expensesPct: number; savingsPct: number; investmentsPct: number } | null;
  actual: { expensesPct: number; savingsPct: number; investmentsPct: number } | null;
}

export interface MonthRecap { month: Month; summary: RecapSummary; seenAt?: string; createdAt: string }
export interface Reflection { id: string; month: Month; question: string; answer: string; updatedAt: string }
export interface AssistantMessage { id: string; role: "user" | "assistant"; source: "chat" | "daily_greeting"; text: string; createdAt: string }
