// S04 Primeros pasos: configurar lo básico, cada paso se puede dejar para luego.
import { Check, ListChecks } from "lucide";
import { today } from "../data/dates";
import { addPotMovement, getSettings, listAccounts, markFirstStep, saveSettings, setAccountBalanceToday, upsertPot } from "../data/repo";
import type { Settings } from "../data/types";
import { button, field, moneyField, parseMoney, setFieldError, toast } from "../ui/components";
import { h, icon } from "../ui/dom";
import { screen } from "../app/layout";
import { refresh } from "../app/router";
import { errorText } from "../app/util";

export const STEPS: { id: string; title: string; text: string; href?: string }[] = [
  { id: "nombre", title: "Dinos cómo te llamamos", text: "Para saludarte y personalizar tus resúmenes." },
  { id: "dinero-hoy", title: "Cuánto tienes hoy", text: "Lo que hay en tus cuentas y en efectivo, sin contar ahorros ni inversiones." },
  { id: "huchas", title: "Lo que ya tienes apartado", text: "Si ya ahorras o inviertes, apúntalo para que tu patrimonio cuadre." },
  { id: "limites", title: "Un límite para empezar", text: "Elige la categoría que más se te escapa y ponle un tope.", href: "#/limites" },
  { id: "plan", title: "Reparte el mes", text: "Decide qué parte de lo que ganas va a gastos, ahorro e inversión.", href: "#/plan" },
  { id: "primer-movimiento", title: "Tu primer movimiento", text: "Apunta un gasto de hoy. Con foto, si te apetece.", href: "#/nuevo" },
];

export async function firstStepsCard(s: Settings): Promise<HTMLElement | null> {
  const done = STEPS.filter((x) => s.firstSteps.includes(x.id)).length;
  if (done === STEPS.length || s.firstStepsDismissed) return null;
  return h("a", { class: "steps-card", href: "#/primeros-pasos" },
    h("span", { class: "tile-icon" }, icon(ListChecks)),
    h("span", { class: "steps-main" },
      h("span", { class: "tile-title" }, "Primeros pasos"),
      h("span", { class: "steps-text" }, `${done} de ${STEPS.length} hechos. Te llevan dos minutos.`),
      h("span", { class: "progress", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": STEPS.length, "aria-valuenow": done, "aria-label": "Primeros pasos" },
        h("i", { style: `width:${(done / STEPS.length) * 100}%` }))));
}

export async function firstStepsScreen(): Promise<HTMLElement> {
  const s = await getSettings();
  const done = new Set(s.firstSteps);
  const items = STEPS.map((step, i) => {
    const ok = done.has(step.id);
    const body = ok ? null : stepBody(step.id, s);
    return h("li", { class: `step${ok ? " is-done" : ""}` },
      h("span", { class: "step-num", "aria-hidden": "true" }, ok ? icon(Check, { size: 16 }) : String(i + 1)),
      h("div", { class: "step-main" },
        h("h2", { class: "step-title" }, step.title, ok ? h("span", { class: "sr-only" }, " (hecho)") : null),
        ok ? null : h("p", { class: "muted" }, step.text),
        body,
        ok ? null : h("div", { class: "row" },
          step.href ? h("a", { class: "btn btn-secondary btn-sm", href: `${step.href}${step.href.includes("?") ? "&" : "?"}volver=${encodeURIComponent("#/primeros-pasos")}` }, "Ir ahora") : null,
          button("Dejar para luego", { variant: "ghost", size: "sm", onClick: async () => { await markFirstStep(step.id); refresh(); } }))));
  });
  const allDone = STEPS.every((x) => done.has(x.id));
  return screen({ title: "Primeros pasos", back: "#/" },
    h("p", { class: "muted" }, allDone ? "Ya está todo listo. Puedes cambiar cualquier cosa en Ajustes." : "Cada paso es opcional. Lo que dejes para luego seguirá aquí."),
    h("ol", { class: "steps" }, ...items),
    allDone ? null : button("Ocultar esta lista del inicio", { variant: "ghost", onClick: async () => { await saveSettings({ firstStepsDismissed: true }); location.hash = "#/"; } }),
  );
}

function stepBody(id: string, s: Settings): HTMLElement | null {
  if (id === "nombre") {
    const f = field("Nombre o apodo", { name: "nickname", value: s.nickname, maxlength: 30, autocomplete: "given-name" });
    return form([f], async (fd) => { await saveSettings({ nickname: fd.get("nickname")!.toString().trim() }); await markFirstStep(id); });
  }
  if (id === "dinero-hoy") {
    const f = moneyField("Dinero disponible hoy", { name: "liquid", hint: "Lo de tu cuenta principal. Si tienes varios bancos, créalos luego en Patrimonio → Cuentas." });
    return form([f], async (fd) => {
      const c = parseMoney(String(fd.get("liquid")));
      if (c === null) { setFieldError(f, "Escribe una cantidad, por ejemplo 1200 o 0."); throw new Error(""); }
      await saveSettings({ liquidStartCents: c, liquidStartDate: today() });
      const [main] = await listAccounts(); await setAccountBalanceToday(main.id, c);
      await markFirstStep(id);
    });
  }
  if (id === "huchas") {
    const sav = moneyField("Ahorrado", { name: "sav", hint: "Cuenta de ahorro, fondo de emergencia…" });
    const inv = moneyField("Invertido", { name: "inv", hint: "Fondos, acciones, plan de pensiones…" });
    return form([sav, inv], async (fd) => {
      for (const [name, type, label] of [["sav", "savings", "Mis ahorros"], ["inv", "investment", "Mis inversiones"]] as const) {
        const raw = String(fd.get(name) ?? "").trim();
        if (!raw) continue;
        const c = parseMoney(raw);
        if (c === null) { setFieldError(name === "sav" ? sav : inv, "Escribe una cantidad, por ejemplo 3000."); throw new Error(""); }
        if (c > 0) { const p = await upsertPot({ name: label, type }); await addPotMovement(p.id, "contribution", c, today(), "Saldo inicial", true); }
      }
      await markFirstStep(id);
    });
  }
  return null;
}

function form(fields: HTMLElement[], onSave: (fd: FormData) => Promise<void>): HTMLFormElement {
  const f = h("form", { class: "stack-sm", novalidate: true }, ...fields, button("Guardar", { type: "submit", size: "sm" }));
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    fields.forEach((x) => setFieldError(x, null));
    try { await onSave(new FormData(f)); toast("Hecho"); refresh(); }
    catch (err) { const m = errorText(err); if (m) toast(m, "danger"); }
  });
  return f;
}
