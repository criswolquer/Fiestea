// S01 Bienvenida + S02 tres preguntas. Se puede probar con datos de ejemplo antes de nada.
import { ChartPie, Camera, Sparkles, type IconNode } from "lucide";
import { ensureDefaultCategories, getSettings, saveSettings } from "../data/repo";
import { cloudConfigured, enableCloud } from "../data/cloud";
import { joinSheet } from "./cloudui";
import { loadDemo } from "../data/seed";
import type { Settings } from "../data/types";
import { button, toast } from "../ui/components";
import { h, icon } from "../ui/dom";
import { screen } from "../app/layout";
import { errorText, go } from "../app/util";

const SLIDES: { icon: IconNode; title: string; text: string }[] = [
  { icon: ChartPie, title: "Tu dinero, en una pantalla", text: "Lo que entra, lo que gastas, lo que apartas y lo que inviertes este mes. Sin hojas de cálculo." },
  { icon: Camera, title: "Cada gasto, con su momento", text: "Añade una foto a lo que apuntes. A fin de mes, lo repasas como un álbum." },
  { icon: Sparkles, title: "Mejorar sin agobios", text: "Límites por categoría, un plan para el mes y preguntas para pensar. Tú decides el ritmo." },
];

type Q = { key: keyof Settings; title: string; options: [string, string][] };
const QUESTIONS: Q[] = [
  { key: "goal", title: "¿Qué te gustaría conseguir?", options: [["controlar_gastos", "Saber en qué se me va el dinero"], ["ahorrar", "Ahorrar más cada mes"], ["invertir", "Empezar a invertir"], ["entender", "Entender mi situación"]] },
  { key: "management", title: "¿Cómo llevas hoy tus cuentas?", options: [["nada", "No las llevo"], ["cabeza", "De memoria"], ["excel", "En una hoja de cálculo"], ["otra_app", "Con otra app"]] },
  { key: "savingRange", title: "¿Cuánto te gustaría apartar al mes?", options: [["<100", "Menos de 100 €"], ["100-300", "Entre 100 y 300 €"], ["300-600", "Entre 300 y 600 €"], [">600", "Más de 600 €"]] },
];

export function welcomeScreen(): HTMLElement {
  let step = 0;
  const answers: Partial<Settings> = {};
  const body = h("div", { class: "welcome" });
  const total = SLIDES.length + QUESTIONS.length;

  const dots = () => h("div", { class: "dots", "aria-hidden": "true" }, ...Array.from({ length: total + 1 }, (_, i) => h("i", { class: i === step ? "on" : "" })));

  const draw = () => {
    body.replaceChildren();
    const heading = (t: string) => h("h1", { class: "welcome-title", tabindex: -1 }, t);
    if (step < SLIDES.length) {
      const s = SLIDES[step];
      body.append(dots(), h("span", { class: "welcome-icon" }, icon(s.icon, { size: 40 })), heading(s.title), h("p", { class: "welcome-text" }, s.text),
        h("div", { class: "welcome-actions" },
          button("Siguiente", { size: "lg", block: true, onClick: () => { step++; draw(); } }),
          step === 0 ? button("Probar con datos de ejemplo", { variant: "ghost", block: true, onClick: demo }) : null,
          step === 0 && cloudConfigured() ? button("Ya la uso en otro móvil", { variant: "ghost", block: true, onClick: join }) : null));
    } else if (step < total) {
      const q = QUESTIONS[step - SLIDES.length];
      const fs = h("fieldset", { class: "options" }, h("legend", { class: "sr-only" }, q.title),
        ...q.options.map(([v, label]) => {
          const id = `q-${String(q.key)}-${v}`;
          const input = h("input", { type: "radio", name: String(q.key), value: v, id, class: "seg-input", checked: answers[q.key] === v });
          input.addEventListener("change", () => { (answers as Record<string, string>)[q.key] = v; next.disabled = false; });
          return h("span", { class: "option" }, input, h("label", { for: id }, label));
        }));
      const next = button("Siguiente", { size: "lg", block: true, disabled: !answers[q.key], onClick: () => { step++; draw(); } });
      body.append(dots(), h("p", { class: "welcome-kicker" }, `Pregunta ${step - SLIDES.length + 1} de ${QUESTIONS.length}`), heading(q.title), fs,
        h("div", { class: "welcome-actions" }, next, button("Saltar", { variant: "ghost", block: true, onClick: () => { step++; draw(); } })));
    } else {
      body.append(dots(), heading("Todo listo"),
        h("p", { class: "welcome-text" }, "Tus datos se guardan solo en este dispositivo. Nadie más los ve. Para no perderlos, añade la app a la pantalla de inicio y haz copias desde Ajustes."),
        h("p", { class: "welcome-text muted" }, "Esta app te ayuda a organizarte. No es asesoramiento financiero."),
        h("div", { class: "welcome-actions" },
          button("Empezar", { size: "lg", block: true, onClick: start }),
          button("Probar con datos de ejemplo", { variant: "ghost", block: true, onClick: demo })));
    }
    (body.querySelector("h1") as HTMLElement).focus();
  };

  const linkCloud = () => enableCloud().catch(() => { /* se reintenta al abrir la app */ });
  const start = async () => {
    await ensureDefaultCategories();
    await saveSettings({ ...answers, onboardedAt: new Date().toISOString() });
    linkCloud();
    go("#/primeros-pasos");
  };
  const demo = async () => {
    try { await saveSettings(answers); await loadDemo(); linkCloud(); toast("Datos de ejemplo cargados. Puedes borrarlos en Ajustes."); go("#/"); }
    catch (e) { toast(errorText(e), "danger"); }
  };
  const join = async () => {
    if (!(await joinSheet())) return;
    if ((await getSettings()).onboardedAt) go("#/");
    else toast("Enlazado, pero aún no hay datos en la nube. Sigue con la bienvenida.", "info");
  };

  draw();
  return screen({ title: "Bienvenida", header: h("span") }, body);
}
