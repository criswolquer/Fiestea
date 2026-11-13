// Asistente con Claude. Sin servidor: la petición va del navegador a la API de
// Claude con la clave que la persona guarda en Ajustes (solo en este dispositivo).
// Las herramientas se ejecutan aquí, sobre los datos locales; nunca se envían fotos ni el correo.
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaToolResultBlockParam, BetaToolUnion } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { addMonths, isoWeekday, thisMonth, today } from "./dates";
import { categoryBreakdown, getPlan, getSettings, listCategories, listTransactions, monthSummary, wealth } from "./repo";
import type { AssistantMessage } from "./types";
import { AiError, getApiKey } from "./assistantLocal";
export { AiError };

const MODEL = "claude-opus-5-5";
const eur = (c: number) => Math.round(c) / 100;

const TOOLS: BetaToolUnion[] = [
  {
    name: "resumen_mes",
    description: "Cifras de un mes: ingresos, gastos, ahorrado, invertido, lo que queda, número de movimientos, límites por categoría y el plan del mes si existe. Importes en euros.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["mes"],
      properties: { mes: { type: "string", description: "Mes en formato AAAA-MM" } } },
  },
  {
    name: "buscar_movimientos",
    description: "Lista ingresos o gastos apuntados entre dos fechas, con filtros opcionales. Úsala para preguntas sobre gastos concretos, el mayor gasto, la última vez que se pagó algo, etc.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["desde", "hasta", "tipo", "categoria", "texto", "orden", "limite"],
      properties: {
        desde: { type: "string", description: "Fecha inicial AAAA-MM-DD (incluida)" },
        hasta: { type: "string", description: "Fecha final AAAA-MM-DD (incluida)" },
        tipo: { type: ["string", "null"], enum: ["gasto", "ingreso", null], description: "null para ambos" },
        categoria: { type: ["string", "null"], description: "Nombre de la categoría, o null" },
        texto: { type: ["string", "null"], description: "Texto a buscar en el concepto o la nota, o null" },
        orden: { type: "string", enum: ["fecha_desc", "importe_desc"] },
        limite: { type: "integer", description: "Máximo de resultados (1-200)" },
      } },
  },
  {
    name: "gasto_por_categoria",
    description: "Reparto de un mes por categoría y por tipo de gasto (fijo, a elegir, deuda), en euros.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["mes", "tipo"],
      properties: { mes: { type: "string", description: "AAAA-MM" }, tipo: { type: "string", enum: ["gasto", "ingreso"] } } },
  },
  {
    name: "gasto_por_dia_de_la_semana",
    description: "Total gastado por día de la semana (lunes a domingo) entre dos fechas.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, required: ["desde", "hasta"],
      properties: { desde: { type: "string" }, hasta: { type: "string" } } },
  },
  {
    name: "patrimonio",
    description: "Dinero disponible, ahorros e inversiones actuales, con cada hucha, su saldo y su meta.",
    strict: true,
    input_schema: { type: "object", additionalProperties: false, required: [], properties: {} },
  },
];

async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const cats = await listCategories(undefined, { includeArchived: true });
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const ym = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}$/.test(v) ? v : thisMonth());
  const ymd = (v: unknown, d: string) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d);
  switch (name) {
    case "resumen_mes": {
      const m = ym(input.mes);
      const [s, plan] = await Promise.all([monthSummary(m), getPlan(m)]);
      return { mes: m, ingresos: eur(s.incomeCents), gastos: eur(s.expenseCents), ahorrado: eur(s.savedCents), invertido: eur(s.investedCents),
        queda: eur(s.balanceCents), movimientos: s.txCount,
        limites: s.limits.map((l) => ({ categoria: l.category.name, gastado: eur(l.spentCents), limite: eur(l.limitCents) })),
        plan: plan ? { ingresos_previstos: eur(plan.plannedIncomeCents), gastos_pct: plan.expensesBp / 100, ahorro_pct: plan.savingsBp / 100, inversion_pct: plan.investmentsBp / 100 } : null };
    }
    case "buscar_movimientos": {
      const from = ymd(input.desde, `${addMonths(thisMonth(), -12)}-01`), to = ymd(input.hasta, today());
      let txs = await listTransactions({ from, to, type: input.tipo === "gasto" ? "expense" : input.tipo === "ingreso" ? "income" : undefined });
      if (typeof input.categoria === "string" && input.categoria) { const q = input.categoria.toLowerCase(); txs = txs.filter((t) => (catName.get(t.categoryId ?? "") ?? "sin categoría").toLowerCase().includes(q)); }
      if (typeof input.texto === "string" && input.texto) { const q = input.texto.toLowerCase(); txs = txs.filter((t) => `${t.title} ${t.note}`.toLowerCase().includes(q)); }
      if (input.orden === "importe_desc") txs = [...txs].sort((a, b) => b.amountCents - a.amountCents);
      const limit = Math.max(1, Math.min(200, Number(input.limite) || 50));
      return { total_encontrados: txs.length, movimientos: txs.slice(0, limit).map((t) => ({
        fecha: t.occurredOn, tipo: t.type === "income" ? "ingreso" : "gasto", importe: eur(t.amountCents), concepto: t.title || null,
        categoria: catName.get(t.categoryId ?? "") ?? "Sin categoría", nota: t.note || null, con_foto: t.hasPhoto })) };
    }
    case "gasto_por_categoria": {
      const b = await categoryBreakdown(ym(input.mes), input.tipo === "ingreso" ? "income" : "expense");
      return { total: eur(b.totalCents), categorias: b.segments.map((s) => ({ categoria: s.category?.name ?? "Sin categoría", importe: eur(s.cents) })),
        por_tipo: input.tipo === "ingreso" ? null : { fijos: eur(b.byKind.fijo), a_elegir: eur(b.byKind.discrecional), deudas: eur(b.byKind.deuda) } };
    }
    case "gasto_por_dia_de_la_semana": {
      const txs = await listTransactions({ from: ymd(input.desde, `${thisMonth()}-01`), to: ymd(input.hasta, today()), type: "expense" });
      const days = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
      const acc = days.map(() => ({ total: 0, n: 0 }));
      for (const t of txs) { const i = isoWeekday(t.occurredOn) - 1; acc[i].total += t.amountCents; acc[i].n++; }
      return days.map((d, i) => ({ dia: d, total: eur(acc[i].total), movimientos: acc[i].n }));
    }
    case "patrimonio": {
      const w = await wealth();
      return { disponible: eur(w.liquidCents), ahorros: eur(w.savingsCents), inversiones: eur(w.investmentCents), total: eur(w.totalCents),
        huchas: w.pots.map((p) => ({ nombre: p.name, tipo: p.type === "savings" ? "ahorro" : "inversión", saldo: eur(p.balanceCents), meta: p.goalCents ? eur(p.goalCents) : null })) };
    }
  }
  throw new Error(`Herramienta desconocida: ${name}`);
}

async function system(): Promise<string> {
  const s = await getSettings();
  return `Eres el asistente de una app personal de finanzas en español. La persona apunta a mano sus ingresos, gastos, ahorros e inversiones.
Usa las herramientas para consultar sus datos reales antes de dar cifras; no inventes importes. Si no hay datos, dilo.
Hoy es ${today()} (${["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"][isoWeekday(today()) - 1]}).${s.nickname ? ` Se llama ${s.nickname}.` : ""}
Responde en el idioma en que te escriban, de tú, en frases cortas y sin juzgar. Formato de importes: 1.234,56 €.
Ayudas a ver patrones y a reflexionar. No das asesoramiento financiero, fiscal ni de inversión concreto (qué fondo comprar, etc.); si te lo piden, explica conceptos generales y sugiere consultar a un profesional.
Escribe texto plano sin Markdown (sin asteriscos ni almohadillas); puedes usar guiones para listas cortas.`;
}

function client(): Anthropic {
  const apiKey = getApiKey();
  if (!apiKey) throw new AiError("Añade tu clave de la API de Claude en Ajustes para usar el asistente.");
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/** Una vuelta de conversación: puede llamar a herramientas varias veces antes de responder. */
export async function ask(history: AssistantMessage[], question: string, signal?: AbortSignal): Promise<string> {
  const c = client();
  const sys = await system();
  const messages: BetaMessageParam[] = [
    ...history.slice(-20).map((m) => ({ role: m.role, content: m.text }) as BetaMessageParam),
    { role: "user", content: question },
  ];
  try {
    for (let step = 0; step < 8; step++) {
      const msg = await c.beta.messages.stream({
        model: MODEL, max_tokens: 16000, system: sys, tools: TOOLS, messages,
        betas: ["server-side-fallback-2026-07-01"],
        // Si un clasificador de seguridad rechaza la petición, la API la repite con otro modelo en la misma llamada.
        fallbacks: "default",
        output_config: { effort: "low" },
      }, { signal }).finalMessage();
      if (msg.stop_reason === "refusal") throw new AiError("El asistente no puede responder a esa pregunta.");
      const uses = msg.content.filter((b): b is Extract<typeof b, { type: "tool_use" }> => b.type === "tool_use");
      if (msg.stop_reason !== "tool_use" || !uses.length) {
        const text = msg.content.filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text").map((b) => b.text).join("").trim();
        return text || "No tengo una respuesta para eso.";
      }
      messages.push({ role: "assistant", content: msg.content });
      const results: BetaToolResultBlockParam[] = await Promise.all(uses.map(async (u) => {
        try { return { type: "tool_result" as const, tool_use_id: u.id, content: JSON.stringify(await runTool(u.name, u.input as Record<string, unknown>)) }; }
        catch (e) { return { type: "tool_result" as const, tool_use_id: u.id, content: (e as Error).message, is_error: true }; }
      }));
      messages.push({ role: "user", content: results });
    }
    throw new AiError("La pregunta necesitaba demasiados pasos. Prueba a hacerla más concreta.");
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.APIUserAbortError) throw new AiError("Cancelado.");
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("La clave no es válida. Revísala en Ajustes.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError("Tu clave no tiene permiso para usar este modelo.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Demasiadas preguntas seguidas. Espera un momento.");
    if (e instanceof Anthropic.BadRequestError) throw new AiError(`Petición rechazada: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw new AiError("No hay conexión con el asistente. ¿Tienes internet?");
    if (e instanceof Anthropic.APIError) throw new AiError(`Error del asistente (${e.status ?? "?"}).`);
    throw e;
  }
}

