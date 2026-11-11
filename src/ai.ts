import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Flashcard, Page, QuizQuestion } from "./types";
import { freeCanvas, pageToCanvas } from "./render";

/*
 * AI tools (summaries, quizzes, flashcards, the AI pen and transcript
 * summaries). The app has no server: requests go straight from the browser to
 * the Claude API with the API key the person saves in Settings, which stays on
 * this device.
 */

const MODEL = "claude-opus-5-5";
const KEY_STORAGE = "trazo.apiKey";
/** Upper bound on pages sent in one request, to keep requests within size limits. */
export const MAX_AI_PAGES = 40;

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage unavailable (private mode) */
  }
}

export class AiError extends Error {}

function client(): Anthropic {
  const apiKey = getApiKey();
  if (!apiKey) throw new AiError("Añade tu clave de API de Claude en Ajustes para usar las herramientas de IA.");
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

const SYSTEM = `Eres el asistente de estudio de Trazo, una app de apuntes a mano.
Recibes imágenes de páginas de apuntes manuscritos (pueden incluir PDFs importados, dibujos, fórmulas y diagramas) o transcripciones.
Lee con cuidado la letra manuscrita. Si una parte es ilegible, dilo en lugar de inventarla.
Responde siempre en el idioma de los apuntes; si no está claro, en español.`;

interface RunOptions {
  content: BetaContentBlockParam[];
  schema?: Record<string, unknown>;
  onText?: (snapshot: string) => void;
  signal?: AbortSignal;
}

async function run({ content, schema, onText, signal }: RunOptions): Promise<string> {
  const c = client();
  try {
    const stream = c.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 32000,
        system: SYSTEM,
        betas: ["server-side-fallback-2026-07-01"],
        // If a safety classifier declines, the API retries on a fallback model in the same call.
        fallbacks: "default",
        output_config: schema
          ? { effort: "medium", format: { type: "json_schema", schema } }
          : { effort: "medium" },
        messages: [{ role: "user", content }],
      },
      { signal },
    );
    if (onText) stream.on("text", (_delta, snapshot) => onText(snapshot));
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new AiError("Claude no ha podido responder a esta petición.");
    const text = msg.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (msg.stop_reason === "max_tokens" && schema) throw new AiError("La respuesta era demasiado larga y se cortó. Prueba con menos páginas.");
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.APIUserAbortError) throw new AiError("Cancelado.");
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("La clave de API no es válida. Revísala en Ajustes.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new AiError("Tu clave de API no tiene permiso para usar este modelo.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.");
    if (e instanceof Anthropic.BadRequestError) throw new AiError(`Petición rechazada: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw new AiError("No hay conexión con el servicio de IA.");
    if (e instanceof Anthropic.APIError) throw new AiError(`Error del servicio de IA (${e.status ?? "?"}).`);
    throw e;
  }
}

/* ---------- page images ---------- */

export async function canvasToBase64(c: HTMLCanvasElement, type = "image/jpeg"): Promise<string> {
  const url = c.toDataURL(type, 0.85);
  return url.slice(url.indexOf(",") + 1);
}

async function pageBlocks(pages: Page[]): Promise<BetaContentBlockParam[]> {
  const blocks: BetaContentBlockParam[] = [];
  for (const [i, p] of pages.entries()) {
    // ~1000px on the long side keeps handwriting legible without huge requests.
    const scale = Math.min(1.2, 1100 / Math.max(p.width, p.height));
    const c = await pageToCanvas(p, scale, { hideMasks: true });
    const data = await canvasToBase64(c);
    freeCanvas(c);
    blocks.push({ type: "text", text: `Página ${i + 1}:` });
    blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
  }
  return blocks;
}

/* ---------- tools ---------- */

export async function summarizePages(pages: Page[], onText?: (s: string) => void, signal?: AbortSignal): Promise<string> {
  const content = await pageBlocks(pages);
  content.push({
    type: "text",
    text: `Haz un resumen de estos apuntes para estudiar.
Formato (Markdown sencillo):
- Un título con "# ".
- 3-6 secciones con "## " según los temas de los apuntes.
- Viñetas breves con las ideas, definiciones y fórmulas clave.
- Al final, "## Para repasar" con 3 preguntas cortas.
No añadas información que no esté en los apuntes salvo para aclarar un término.`,
  });
  return run({ content, onText, signal });
}

export async function summarizeText(text: string, kind: string, onText?: (s: string) => void, signal?: AbortSignal): Promise<string> {
  return run({
    content: [
      {
        type: "text",
        text: `<${kind}>\n${text}\n</${kind}>\n\nResume este contenido para estudiar en Markdown sencillo: título con "# ", secciones con "## ", viñetas con las ideas clave y, al final, "## Puntos clave" con lo más importante en 3-5 viñetas.`,
      },
    ],
    onText,
    signal,
  });
}

const QUIZ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "questions"],
  properties: {
    title: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "options", "answer", "explanation"],
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer: { type: "integer", description: "Índice (desde 0) de la opción correcta" },
          explanation: { type: "string" },
        },
      },
    },
  },
};

export async function makeQuiz(pages: Page[], count: number, signal?: AbortSignal): Promise<{ title: string; questions: QuizQuestion[] }> {
  const content = await pageBlocks(pages);
  content.push({
    type: "text",
    text: `Crea un cuestionario de ${count} preguntas tipo test sobre estos apuntes.
Cada pregunta tiene 4 opciones y una sola correcta; reparte la posición de la correcta.
Las opciones incorrectas deben ser plausibles. La explicación dice en una o dos frases por qué la respuesta es correcta, citando los apuntes.
El título describe el tema en pocas palabras.`,
  });
  const out = JSON.parse(await run({ content, schema: QUIZ_SCHEMA, signal })) as { title: string; questions: QuizQuestion[] };
  out.questions = out.questions.filter((q) => q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length);
  if (!out.questions.length) throw new AiError("No se pudieron generar preguntas con estas páginas.");
  return out;
}

const CARDS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "cards"],
  properties: {
    title: { type: "string" },
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["front", "back"],
        properties: { front: { type: "string" }, back: { type: "string" } },
      },
    },
  },
};

export async function makeFlashcards(pages: Page[], count: number, signal?: AbortSignal): Promise<{ title: string; cards: Flashcard[] }> {
  const content = await pageBlocks(pages);
  content.push({
    type: "text",
    text: `Crea hasta ${count} tarjetas de memoria a partir de estos apuntes.
Anverso: una pregunta, término o concepto breve. Reverso: la respuesta, concisa (máximo 2 frases).
Cubre los conceptos más importantes sin repetir. El título describe el tema en pocas palabras.`,
  });
  const out = JSON.parse(await run({ content, schema: CARDS_SCHEMA, signal })) as { title: string; cards: Flashcard[] };
  if (!out.cards.length) throw new AiError("No se pudieron generar tarjetas con estas páginas.");
  return out;
}

/** "AI pen": the person circles part of a page and asks about it. */
export async function askAboutRegion(
  image: HTMLCanvasElement,
  question: string,
  onText?: (s: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  return run({
    content: [
      { type: "image", source: { type: "base64", media_type: "image/png", data: await canvasToBase64(image, "image/png") } },
      {
        type: "text",
        text: `Esta imagen es un recorte de mis apuntes.\n${question || "Explícame qué es y, si es un ejercicio o problema, resuélvelo paso a paso."}\nResponde de forma clara y breve, en Markdown sencillo.`,
      },
    ],
    onText,
    signal,
  });
}
