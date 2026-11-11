import { AiError, MAX_AI_PAGES, getApiKey, makeFlashcards, makeQuiz, summarizePages, summarizeText } from "./ai";
import { db, uid } from "./db";
import type { AiResult, Flashcard, Notebook, Page, QuizQuestion } from "./types";
import { confirmDialog, formatDate, h, icon, modal, toast } from "./ui";
import { markdown } from "./widgets";
import { openSettings } from "./settings";

type Scope = "current" | "all";

function scopeSelector(pageCount: number, current: number) {
  const sel = h(
    "select",
    { class: "input" },
    h("option", { value: "current" }, `Página actual (${current + 1})`),
    h("option", { value: "all" }, `Todo el cuaderno (${pageCount} pág.)`),
  );
  return sel;
}

function pickPages(pages: Page[], current: number, scope: Scope): Page[] {
  const chosen = scope === "current" ? [pages[current]] : pages;
  if (chosen.length > MAX_AI_PAGES) toast(`Se usarán las primeras ${MAX_AI_PAGES} páginas de ${chosen.length}.`, 4000);
  return chosen.slice(0, MAX_AI_PAGES);
}

function busy(text: string, onCancel: () => void) {
  const out = h("div", { class: "ai-stream" });
  const m = modal(text, [h("div", { class: "row" }, h("div", { class: "spinner" }), h("span", {}, "Leyendo tus apuntes…")), out], { wide: true, onClose: onCancel });
  return { m, out };
}

function errorMessage(e: unknown): string {
  if (e instanceof AiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

/** Entry point: the "IA" button in the editor. */
export async function openAiHub(nb: Notebook, pages: Page[], current: number): Promise<void> {
  const saved = (await db.ai.ofNotebook(nb.id)).sort((a, b) => b.createdAt - a.createdAt);
  const scope = scopeSelector(pages.length, current);
  const count = h("input", { class: "input", type: "number", min: 3, max: 40, value: 10, style: "width:90px" });

  const tool = (ic: string, title: string, desc: string, run: () => void) =>
    h("button", { class: "ai-tool", type: "button", onclick: run }, icon(ic), h("div", {}, h("strong", {}, title), h("span", {}, desc)));

  const needKey = !getApiKey();
  const savedList = h(
    "div",
    { class: "saved-list" },
    saved.length
      ? saved.map((r) =>
          h(
            "div",
            { class: "saved-item" },
            h(
              "button",
              { class: "link", type: "button", onclick: () => (m.close(), showResult(r)) },
              `${{ summary: "Resumen", quiz: "Cuestionario", flashcards: "Tarjetas" }[r.kind]}: ${r.title}`,
            ),
            h("span", { class: "muted small" }, formatDate(r.createdAt)),
            h(
              "button",
              {
                class: "icon-btn small",
                type: "button",
                title: "Eliminar",
                onclick: async (e: Event) => {
                  if (!(await confirmDialog("Eliminar", "¿Eliminar este resultado?", "Eliminar", true))) return;
                  await db.ai.delete(r.id);
                  (e.target as HTMLElement).closest(".saved-item")?.remove();
                },
              },
              icon("trash"),
            ),
          ),
        )
      : h("p", { class: "muted small" }, "Aún no hay resultados guardados."),
  );

  const m = modal(
    "Herramientas de IA",
    [
      needKey
        ? h(
            "div",
            { class: "callout" },
            "Para usar la IA necesitas una clave de API de Claude. ",
            h("button", { class: "link", type: "button", onclick: () => (m.close(), openSettings()) }, "Añadirla en Ajustes"),
          )
        : null,
      h("label", { class: "field" }, h("span", {}, "¿Qué páginas?"), scope),
      h(
        "div",
        { class: "ai-tools" },
        tool("book", "Resumen", "Las ideas clave de tus apuntes", () => run("summary")),
        tool("check", "Cuestionario", "Preguntas tipo test para ponerte a prueba", () => run("quiz")),
        tool("copy", "Tarjetas de memoria", "Para repasar con repetición", () => run("flashcards")),
        tool("text", "Resumir un texto", "Pega una transcripción (YouTube, clase…) o un artículo", () => (m.close(), openTextSummary(nb))),
      ),
      h("label", { class: "field inline" }, h("span", {}, "Nº de preguntas o tarjetas"), count),
      h("h3", {}, "Guardados"),
      savedList,
    ],
    { wide: true },
  );

  async function run(kind: AiResult["kind"]) {
    const chosen = pickPages(pages, current, scope.value as Scope);
    const n = Math.max(3, Math.min(40, Number(count.value) || 10));
    m.close();
    const ctrl = new AbortController();
    const label = { summary: "Resumiendo…", quiz: "Creando cuestionario…", flashcards: "Creando tarjetas…" }[kind];
    const b = busy(label, () => ctrl.abort());
    try {
      let result: AiResult;
      const base = { id: uid(), notebookId: nb.id, createdAt: Date.now() };
      if (kind === "summary") {
        const text = await summarizePages(chosen, (s) => (b.out.innerHTML = markdown(s)), ctrl.signal);
        const title = /^#\s+(.+)$/m.exec(text)?.[1] ?? nb.title;
        result = { ...base, kind, title, text };
      } else if (kind === "quiz") {
        const q = await makeQuiz(chosen, n, ctrl.signal);
        result = { ...base, kind, title: q.title, questions: q.questions };
      } else {
        const c = await makeFlashcards(chosen, n, ctrl.signal);
        result = { ...base, kind, title: c.title, cards: c.cards };
      }
      await db.ai.put(result);
      b.m.close();
      showResult(result);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      b.m.close();
      modal("No se pudo completar", h("p", {}, errorMessage(e)));
    }
  }
}

export function showResult(r: AiResult): void {
  if (r.kind === "summary") showSummary(r.title, r.text);
  else if (r.kind === "quiz") playQuiz(r.title, r.questions);
  else playFlashcards(r.title, r.cards);
}

export function showSummary(title: string, text: string): void {
  const body = h("div", { class: "md", html: markdown(text) });
  modal(title, [
    body,
    h(
      "div",
      { class: "actions" },
      h(
        "button",
        {
          class: "btn",
          type: "button",
          onclick: async () => {
            await navigator.clipboard?.writeText(text);
            toast("Copiado");
          },
        },
        "Copiar",
      ),
    ),
  ], { wide: true });
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function playQuiz(title: string, questions: QuizQuestion[]): void {
  let idx = 0;
  let score = 0;
  const body = h("div", { class: "quiz" });
  const m = modal(title, body, { wide: true });
  void m;

  const show = () => {
    body.replaceChildren();
    if (idx >= questions.length) {
      body.append(
        h("div", { class: "quiz-done" }, h("div", { class: "big" }, `${score} / ${questions.length}`), h("p", {}, score === questions.length ? "¡Perfecto!" : "Repasa las que fallaste y vuelve a intentarlo.")),
        h("div", { class: "actions" }, h("button", { class: "btn primary", type: "button", onclick: () => ((idx = 0), (score = 0), show()) }, "Repetir")),
      );
      return;
    }
    const q = questions[idx];
    const explanation = h("div", { class: "quiz-exp" });
    const next = h("button", { class: "btn primary", type: "button", disabled: true, onclick: () => (idx++, show()) }, idx === questions.length - 1 ? "Ver resultado" : "Siguiente");
    const opts = q.options.map((o, i) =>
      h(
        "button",
        {
          class: "quiz-opt",
          type: "button",
          onclick: () => {
            opts.forEach((b, j) => {
              b.disabled = true;
              if (j === q.answer) b.classList.add("right");
            });
            if (i === q.answer) score++;
            else opts[i].classList.add("wrong");
            explanation.textContent = q.explanation;
            next.disabled = false;
          },
        },
        h("span", { class: "quiz-letter" }, "ABCDEFGH"[i]),
        o,
      ),
    );
    body.append(
      h("div", { class: "quiz-progress" }, h("div", { style: `width:${(idx / questions.length) * 100}%` })),
      h("p", { class: "muted small" }, `Pregunta ${idx + 1} de ${questions.length}`),
      h("h3", {}, q.question),
      h("div", { class: "quiz-opts" }, opts),
      explanation,
      h("div", { class: "actions" }, next),
    );
  };
  show();
}

export function playFlashcards(title: string, all: Flashcard[]): void {
  let deck = all.slice();
  let idx = 0;
  let known = 0;
  const body = h("div", { class: "cards" });
  modal(title, body, { wide: true });

  const show = () => {
    body.replaceChildren();
    if (idx >= deck.length) {
      const left = deck.length - known;
      body.append(
        h("div", { class: "quiz-done" }, h("div", { class: "big" }, `${known} / ${deck.length}`), h("p", {}, left ? `Te quedan ${left} por repasar.` : "¡Te las sabes todas!")),
        h(
          "div",
          { class: "actions" },
          h("button", { class: "btn", type: "button", onclick: () => ((deck = shuffle(all)), (idx = 0), (known = 0), show()) }, "Barajar y repetir"),
        ),
      );
      return;
    }
    const c = deck[idx];
    const card = h(
      "button",
      { class: "flashcard", type: "button", onclick: () => card.classList.toggle("flipped") },
      h("div", { class: "fc-inner" }, h("div", { class: "fc-face fc-front" }, c.front), h("div", { class: "fc-face fc-back" }, c.back)),
    );
    const answer = (ok: boolean) => {
      if (ok) known++;
      else deck.push(c); // see it again at the end
      idx++;
      show();
    };
    body.append(
      h("p", { class: "muted small center" }, `Tarjeta ${idx + 1} de ${deck.length} · toca para girarla`),
      card,
      h(
        "div",
        { class: "actions center" },
        h("button", { class: "btn", type: "button", onclick: () => answer(false) }, "Repasar otra vez"),
        h("button", { class: "btn primary", type: "button", onclick: () => answer(true) }, "Me la sé"),
      ),
    );
  };
  show();
}

/** Summarise pasted text: a YouTube transcript, a class transcript, an article… */
export function openTextSummary(nb: Notebook, initial = "", kind = "texto"): void {
  const ta = h("textarea", { class: "input", rows: 12, placeholder: "Pega aquí el texto. En YouTube: «…más» bajo el vídeo → «Mostrar transcripción», y copia el texto." });
  ta.value = initial;
  const m = modal("Resumir un texto", [
    ta,
    h(
      "div",
      { class: "actions" },
      h(
        "button",
        {
          class: "btn primary",
          type: "button",
          onclick: async () => {
            const text = ta.value.trim();
            if (text.length < 40) return toast("Pega un texto más largo.");
            m.close();
            const ctrl = new AbortController();
            const b = busy("Resumiendo…", () => ctrl.abort());
            try {
              const out = await summarizeText(text, kind, (s) => (b.out.innerHTML = markdown(s)), ctrl.signal);
              const title = /^#\s+(.+)$/m.exec(out)?.[1] ?? "Resumen";
              const r: AiResult = { id: uid(), notebookId: nb.id, createdAt: Date.now(), kind: "summary", title, text: out };
              await db.ai.put(r);
              b.m.close();
              showSummary(title, out);
            } catch (e) {
              if (ctrl.signal.aborted) return;
              b.m.close();
              modal("No se pudo completar", h("p", {}, errorMessage(e)));
            }
          },
        },
        "Resumir",
      ),
    ),
  ], { wide: true });
}
