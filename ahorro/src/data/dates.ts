import type { Month, Ymd } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha local de hoy, sin zona horaria: lo que el usuario ve en el calendario. */
export function today(now = new Date()): Ymd {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
export const monthOf = (d: Ymd): Month => d.slice(0, 7);
export const thisMonth = (): Month => monthOf(today());

export function parseYmd(d: Ymd): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function addMonths(m: Month, delta: number): Month {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function addDays(d: Ymd, delta: number): Ymd {
  const x = parseYmd(d);
  x.setDate(x.getDate() + delta);
  return today(x);
}

export function daysInMonth(m: Month): number {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo, 0).getDate();
}

/** Mismo día del mes anterior; si no existe (31 → 30), el último día. */
export function sameDayLastMonth(d: Ymd): Ymd {
  const m = addMonths(monthOf(d), -1);
  const day = Math.min(Number(d.slice(8)), daysInMonth(m));
  return `${m}-${pad(day)}`;
}

export const monthRange = (m: Month): [Ymd, Ymd] => [`${m}-01`, `${m}-${pad(daysInMonth(m))}`];

export function monthLabel(m: Month, opts: { year?: boolean } = {}): string {
  const [y, mo] = m.split("-").map(Number);
  const name = new Date(y, mo - 1, 1).toLocaleDateString("es-ES", { month: "long" });
  return opts.year === false ? name : `${name} ${y}`;
}

export function dayLabel(d: Ymd, opts: { weekday?: boolean } = {}): string {
  return parseYmd(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", ...(opts.weekday ? { weekday: "long" } : {}) }).replace(".", "");
}

export function longDay(d: Ymd): string {
  return parseYmd(d).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

/** 1 = lunes … 7 = domingo */
export const isoWeekday = (d: Ymd): number => ((parseYmd(d).getDay() + 6) % 7) + 1;
export const isValidYmd = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && today(parseYmd(d)) === d;
export const nowIso = (): string => new Date().toISOString();
