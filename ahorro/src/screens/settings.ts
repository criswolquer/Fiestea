// S23 Ajustes: perfil, aspecto, categorías, asistente, tus datos.
import { Download, Upload } from "lucide";
import { getApiKey, setApiKey } from "../data/assistantLocal";
import { storageMode } from "../data/db";
import { cloudConfigured, cloudStatus, deleteCloudData } from "../data/cloud";
import { cloudSection } from "./cloudui";
import { exportBackup, getSettings, importBackup, saveSettings, wipeAll } from "../data/repo";
import type { Settings } from "../data/types";
import { button, field, segmented, setFieldError, toast } from "../ui/components";
import { h, icon } from "../ui/dom";
import { screen, sectionTitle } from "../app/layout";
import { confirmDialog } from "../app/dialogs";
import { refresh } from "../app/router";
import { applyTheme, download, errorText } from "../app/util";

export async function settingsScreen(): Promise<HTMLElement> {
  const s = await getSettings();
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  const est = await navigator.storage?.estimate?.().catch(() => undefined);
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

  // Perfil
  const nick = field("Nombre o apodo", { name: "nickname", value: s.nickname, maxlength: 30 });
  const profile = h("form", { class: "stack-sm", novalidate: true }, nick, button("Guardar", { type: "submit", variant: "secondary" }));
  profile.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveSettings({ nickname: String(new FormData(profile).get("nickname") ?? "").trim() });
    toast("Guardado");
  });

  // Aspecto
  const themes: Settings["theme"][] = ["system", "light", "dark"];
  const theme = segmented("Tema", ["Automático", "Claro", "Oscuro"], themes.indexOf(s.theme), async (i) => { await saveSettings({ theme: themes[i] }); applyTheme(themes[i]); });

  // Asistente
  const key = field("Clave de la API de Claude", { name: "key", type: "password", value: getApiKey(), placeholder: "sk-ant-…", autocomplete: "off",
    hint: "Se guarda solo en este dispositivo. Consíguela en console.anthropic.com." });
  const keyForm = h("form", { class: "stack-sm", novalidate: true }, key, h("div", { class: "row" }, button("Guardar clave", { type: "submit", variant: "secondary" }),
    getApiKey() ? button("Quitar clave", { variant: "ghost", onClick: () => { setApiKey(""); toast("Clave quitada"); refresh(); } }) : null));
  keyForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = String(new FormData(keyForm).get("key") ?? "").trim();
    if (v && !v.startsWith("sk-")) { setFieldError(key, "No parece una clave de la API (empiezan por sk-)."); return; }
    setApiKey(v); toast(v ? "Clave guardada" : "Clave quitada"); refresh();
  });

  // Datos
  const restoreInput = h("input", { type: "file", accept: "application/json,.json", id: "restore", class: "sr-only" });
  restoreInput.addEventListener("change", async () => {
    const f = restoreInput.files?.[0];
    if (!f) return;
    if (!(await confirmDialog("¿Restaurar esta copia?", { ok: "Restaurar", danger: true, detail: "Se sustituye todo lo que hay ahora en la app por lo de la copia." }))) { restoreInput.value = ""; return; }
    try { const r = await importBackup(f); toast(`Copia restaurada: ${r.transactions} movimientos`, "success"); location.hash = "#/"; }
    catch (e) { toast(errorText(e), "danger"); }
  });
  const backup = async (photos: boolean) => {
    try { download(await exportBackup(photos), `copia-ahorro-${new Date().toISOString().slice(0, 10)}.json`); toast("Copia descargada"); }
    catch (e) { toast(errorText(e), "danger"); }
  };
  const mb = est?.usage ? (est.usage / 1024 / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 }) : null;

  return screen({ title: "Ajustes", back: "#/" },
    h("section", { class: "stack-sm" }, sectionTitle("Tú"), profile),
    h("section", { class: "stack-sm" }, sectionTitle("Aspecto"), theme),
    h("section", { class: "stack-sm" }, sectionTitle("Organización"),
      h("ul", { class: "list" },
        h("li", {}, h("a", { class: "plain-row as-button", href: "#/cuentas?volver=%23%2Fajustes" }, h("span", { class: "cat-name" }, "Cuentas y saldos"), h("span", { class: "muted" }, "Bancos, efectivo, importar"))),
        h("li", {}, h("a", { class: "plain-row as-button", href: "#/fijos?volver=%23%2Fajustes" }, h("span", { class: "cat-name" }, "Fijos del mes"), h("span", { class: "muted" }, "Se apuntan solos"))),
        h("li", {}, h("a", { class: "plain-row as-button", href: "#/categorias" }, h("span", { class: "cat-name" }, "Categorías"), h("span", { class: "muted" }, "Crear, cambiar, archivar"))),
        h("li", {}, h("a", { class: "plain-row as-button", href: "#/limites" }, h("span", { class: "cat-name" }, "Límites por categoría"))),
        h("li", {}, h("a", { class: "plain-row as-button", href: "#/primeros-pasos" }, h("span", { class: "cat-name" }, "Primeros pasos"))))),
    h("section", { class: "stack-sm" }, sectionTitle("Asistente"),
      h("p", { class: "muted" }, "Opcional. Con tu clave, el asistente responde preguntas sobre tus datos. Se envían a Anthropic tu apodo, tus cifras, categorías y conceptos; nunca tus fotos. Cada pregunta tiene un pequeño coste en tu cuenta."),
      keyForm),
    await cloudSection(),
    h("section", { class: "stack-sm" }, sectionTitle("Tus datos"),
      h("p", { class: "muted" }, `En este dispositivo ocupa unos ${mb ?? "0"} MB.${cloudConfigured() ? "" : " Nada sale de aquí salvo lo que preguntes al asistente."}`),
      storageMode() === "memory" ? h("p", { class: "field-msg error" }, "Este navegador no deja guardar datos: se perderán al cerrar.") : null,
      !standalone ? h("p", { class: "muted" }, "Consejo: añade la app a la pantalla de inicio (en iPhone: Compartir → Añadir a pantalla de inicio). Safari puede borrar los datos de webs sin instalar si no las usas en una semana.") : null,
      persisted === false && navigator.storage?.persist ? button("Pedir que no se borren mis datos", { variant: "secondary", onClick: async () => {
        const ok = await navigator.storage.persist(); toast(ok ? "Hecho: el navegador no los borrará por falta de espacio." : "El navegador no lo ha permitido. Instala la app y haz copias.", ok ? "success" : "warning");
      } }) : null,
      h("div", { class: "row" },
        button("Copia con fotos", { variant: "secondary", icon: Download, onClick: () => backup(true) }),
        button("Copia sin fotos", { variant: "ghost", icon: Download, onClick: () => backup(false) })),
      h("div", {}, restoreInput, h("label", { for: "restore", class: "btn btn-ghost btn-md" }, icon(Upload), h("span", {}, "Restaurar una copia"))),
      button("Borrar todos mis datos", { variant: "danger", onClick: async () => {
        const linked = (await cloudStatus()).linked;
        if (!(await confirmDialog("¿Borrar todo?", { ok: "Borrar todo", danger: true, detail: `Movimientos, fotos, huchas, notas y ajustes${linked ? ", aquí y en la nube (también desaparecen de tus otros móviles enlazados)" : ""}. No se puede deshacer. Si quieres, haz antes una copia.` }))) return;
        try { await deleteCloudData(); } catch (e) { toast(`${errorText(e)} No se ha borrado nada.`, "danger"); return; }
        await wipeAll(); setApiKey(""); toast("Datos borrados"); location.hash = "#/bienvenida";
      } })),
    h("section", { class: "stack-sm" }, sectionTitle("Acerca de"),
      h("p", { class: "muted" }, "Esta app te ayuda a organizar tu dinero. No es asesoramiento financiero, fiscal ni de inversión."),
      h("p", {}, h("a", { href: "#/privacidad" }, "Privacidad: qué se guarda y dónde")),
      h("p", { class: "muted" }, "Iconos: Lucide (licencia ISC). Tipografía: Bricolage Grotesque (licencia OFL).")),
  );
}
