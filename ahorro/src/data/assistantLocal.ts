// Partes del asistente que no necesitan el SDK de Claude (se cargan con la app).
import { addMonths, thisMonth, today } from "./dates";
import { getSettings, listTransactions, monthSummary } from "./repo";

const KEY = "ahorro.apiKey";

export class AiError extends Error {}

export function getApiKey(): string { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } }
export function setApiKey(k: string): void { try { if (k.trim()) localStorage.setItem(KEY, k.trim()); else localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } }
export const hasApiKey = () => !!getApiKey();

/** Saludo del día SIN IA: se calcula aquí, gratis y sin conexión. */
export async function localGreeting(): Promise<string> {
  const s = await getSettings();
  const m = thisMonth();
  const cur = await monthSummary(m);
  const hi = s.nickname ? `Hola, ${s.nickname}.` : "Hola.";
  if (!cur.txCount) return `${hi} Este mes aún no has apuntado nada. Empieza por el último gasto que recuerdes.`;
  const day = Number(today().slice(8));
  const prevTxs = await listTransactions({ month: addMonths(m, -1), type: "expense" });
  const prevSoFar = prevTxs.filter((t) => Number(t.occurredOn.slice(8)) <= day).reduce((a, t) => a + t.amountCents, 0);
  const fmt = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions);
  let cmp = "";
  if (prevSoFar > 0) {
    const d = Math.round(((cur.expenseCents - prevSoFar) / prevSoFar) * 100);
    cmp = d === 0 ? " Igual que el mes pasado a estas alturas." : ` Un ${Math.abs(d)} % ${d > 0 ? "más" : "menos"} que el mes pasado a estas alturas.`;
  }
  const near = cur.limits.filter((l) => l.spentCents >= l.limitCents * 0.85).map((l) => l.category.name);
  return `${hi} Llevas ${fmt(cur.expenseCents)} gastados este mes.${cmp}${cur.balanceCents >= 0 ? ` Te quedan ${fmt(cur.balanceCents)}.` : ""}${near.length ? ` Ojo con ${near.join(" y ")}: estás cerca del límite.` : ""}`;
}
