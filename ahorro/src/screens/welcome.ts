// Bienvenida en una sola pantalla. Después: tus cuentas → tu primer gasto.
import { Camera, ChartPie, Gauge, Wallet, type IconNode } from "lucide";
import { ensureDefaultCategories, getSettings, saveSettings } from "../data/repo";
import { cloudConfigured, enableCloud } from "../data/cloud";
import { joinSheet } from "./cloudui";
import { loadDemo } from "../data/seed";
import { button, field, toast } from "../ui/components";
import { h, icon } from "../ui/dom";
import { screen } from "../app/layout";
import { errorText, go } from "../app/util";

const POINTS: [IconNode, string][] = [
  [ChartPie, "Lo que entra, lo que gastas y lo que apartas, en una pantalla."],
  [Gauge, "Cuánto puedes gastar al día para llegar a fin de mes."],
  [Camera, "Cada gasto con su foto: a fin de mes lo repasas como un álbum."],
];

export function welcomeScreen(): HTMLElement {
  const name = field("¿Cómo te llamas? (opcional)", { name: "nickname", maxlength: 30, autocomplete: "given-name" });
  const nameInput = name.querySelector("input")!;
  const linkCloud = () => enableCloud().catch(() => { /* se reintenta al abrir la app */ });

  const start = async () => {
    await ensureDefaultCategories();
    await saveSettings({ nickname: nameInput.value.trim(), onboardedAt: new Date().toISOString() });
    linkCloud();
    go("#/configurar-cuentas?inicio=1");
  };
  const demo = async () => {
    try { await loadDemo(); if (nameInput.value.trim()) await saveSettings({ nickname: nameInput.value.trim() }); linkCloud(); toast("Datos de ejemplo cargados. Puedes borrarlos en Ajustes."); go("#/"); }
    catch (e) { toast(errorText(e), "danger"); }
  };
  const join = async () => {
    if (!(await joinSheet())) return;
    if ((await getSettings()).onboardedAt) go("#/");
    else toast("Enlazado, pero aún no hay datos en la nube. Pulsa «Empezar».", "info");
  };

  const body = h("div", { class: "welcome" },
    h("span", { class: "welcome-icon" }, icon(Wallet, { size: 40 })),
    h("h1", { class: "welcome-title", tabindex: -1 }, "Tu dinero del mes, claro y sin agobios"),
    h("ul", { class: "welcome-points" }, ...POINTS.map(([ic, text]) => h("li", {}, h("span", { class: "welcome-point-icon" }, icon(ic, { size: 20 })), h("span", {}, text)))),
    name,
    h("div", { class: "welcome-actions" },
      button("Empezar", { size: "lg", block: true, onClick: start }),
      button("Probar con datos de ejemplo", { variant: "ghost", block: true, onClick: demo }),
      cloudConfigured() ? button("Ya la uso en otro móvil", { variant: "ghost", block: true, onClick: join }) : null),
    h("p", { class: "muted small center" }, "Tus datos se guardan en este dispositivo. ", h("a", { href: "#/privacidad" }, "Privacidad"), " · No es asesoramiento financiero."));
  return screen({ title: "Bienvenida", header: h("span") }, body);
}
