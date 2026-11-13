// S17 Asistente: chat sobre tus datos, con dictado por voz si el navegador lo permite.
import { Mic, Send, Trash2 } from "lucide";
import { AiError, hasApiKey, localGreeting } from "../data/assistantLocal";
import { addMessage, bumpUsage, clearMessages, listMessages } from "../data/repo";
import { banner, button, chatBubble, toast } from "../ui/components";
import { h } from "../ui/dom";
import { screen } from "../app/layout";
import { confirmDialog } from "../app/dialogs";
import { refresh } from "../app/router";

const SUGGESTIONS = [
  "¿Cuál fue mi mayor gasto el mes pasado?",
  "¿Qué día de la semana gasto más?",
  "¿Gasté más este mes o el anterior?",
  "¿Cuándo pagué la última vez en el súper?",
];

type Recognition = { lang: string; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const SpeechRec = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

export async function assistantScreen(): Promise<HTMLElement> {
  const keyOk = hasApiKey();
  const history = await listMessages();
  const time = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const list = h("ul", { class: "chat", "aria-live": "polite", "aria-label": "Conversación" },
    chatBubble("assistant", await localGreeting(), { greeting: true }),
    ...history.map((m) => chatBubble(m.role, m.text, { time: time(m.createdAt) })));

  const input = h("textarea", { id: "ask", rows: 1, class: "input composer-input", placeholder: keyOk ? "Pregunta sobre tu dinero…" : "Añade tu clave en Ajustes para preguntar", disabled: !keyOk, maxlength: 1000 });
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = `${Math.min(140, input.scrollHeight)}px`; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  const send = button("Enviar", { iconOnly: true, icon: Send, type: "submit", disabled: !keyOk });
  let busy = false;

  let rec: Recognition | null = null;
  const mic = SpeechRec && keyOk ? button("Dictar", { variant: "secondary", iconOnly: true, icon: Mic }) : null;
  mic?.classList.add("mic");
  mic?.setAttribute("aria-pressed", "false");
  mic?.addEventListener("click", () => {
    if (rec) { rec.stop(); return; }
    rec = new SpeechRec!();
    rec.lang = "es-ES"; rec.interimResults = true;
    const before = input.value ? `${input.value} ` : "";
    rec.onresult = (e) => { input.value = before + Array.from(e.results).map((r) => r[0].transcript).join(""); };
    rec.onerror = (e) => { if (e.error === "not-allowed") toast("Sin permiso para usar el micrófono.", "warning"); };
    rec.onend = () => { rec = null; mic.classList.remove("is-listening"); mic.setAttribute("aria-pressed", "false"); mic.setAttribute("aria-label", "Dictar"); input.focus(); };
    rec.start();
    mic.classList.add("is-listening"); mic.setAttribute("aria-pressed", "true"); mic.setAttribute("aria-label", "Dejar de dictar");
  });

  const form = h("form", { class: "composer composer-fixed" }, h("label", { for: "ask", class: "sr-only" }, "Pregunta al asistente"), input, mic, send);
  const askQ = async (q: string) => {
    if (busy || !q.trim()) return;
    busy = true; send.disabled = true;
    const qText = q.trim();
    input.value = ""; input.style.height = "";
    list.append(chatBubble("user", qText, { time: time(new Date().toISOString()) }));
    const thinking = h("li", { class: "bubble bubble-assistant typing" }, h("span", { class: "sr-only" }, "El asistente está pensando"), h("i"), h("i"), h("i"));
    list.append(thinking);
    thinking.scrollIntoView({ block: "end" });
    try {
      const prev = await listMessages();
      const { ask } = await import("../data/ai");
      const answer = await ask(prev, qText);
      await addMessage("user", qText); await addMessage("assistant", answer); await bumpUsage("assistant_message");
      thinking.replaceWith(chatBubble("assistant", answer, { time: time(new Date().toISOString()) }));
    } catch (e) {
      thinking.replaceWith(h("li", { class: "bubble bubble-assistant bubble-error", role: "alert" }, h("p", {}, e instanceof AiError ? e.message : "Algo ha fallado. Inténtalo de nuevo.")));
    }
    list.lastElementChild?.scrollIntoView({ block: "end" });
    busy = false; send.disabled = false; input.focus();
  };
  form.addEventListener("submit", (e) => { e.preventDefault(); askQ(input.value); });

  const chips = keyOk && !history.length ? h("div", { class: "row suggestions" }, ...SUGGESTIONS.map((s) => button(s, { variant: "secondary", size: "sm", onClick: () => askQ(s) }))) : null;

  return screen({ title: "Asistente", tab: "asistente", actions: history.length ? [button("Borrar conversación", { variant: "ghost", iconOnly: true, icon: Trash2, onClick: async () => {
    if (await confirmDialog("¿Borrar toda la conversación?", { ok: "Borrar", danger: true })) { await clearMessages(); refresh(); }
  } })] : [] },
    keyOk ? null : banner("El saludo de arriba se calcula en tu móvil. Para hacer preguntas, añade tu clave de la API de Claude en Ajustes (cada pregunta tiene un pequeño coste en tu cuenta de Anthropic).", "info",
      h("a", { class: "btn btn-secondary btn-sm", href: "#/ajustes" }, "Ajustes")),
    list, chips,
    h("p", { class: "muted small" }, "Responde con tus datos, pero puede equivocarse. No es asesoramiento financiero. Se envían tus cifras y conceptos, nunca tus fotos."),
    form);
}
