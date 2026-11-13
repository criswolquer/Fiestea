// Interfaz del guardado en la nube: estado, código de recuperación, emparejar otro móvil.
import { Cloud, CloudOff, Copy, Link2, RefreshCw, Smartphone } from "lucide";
import {
  cloudConfigured, cloudStatus, createPairCode, forgetRecoveryCode, joinWithCode, newRecoveryCode, onCloudChange, syncNow, type CloudStatus,
} from "../data/cloud";
import { banner, button, field, setFieldError, toast } from "../ui/components";
import { h, icon } from "../ui/dom";
import { confirmDialog, openSheet } from "../app/dialogs";
import { errorText } from "../app/util";

function ago(iso?: string): string {
  if (!iso) return "nunca";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

const cambios = (n: number) => (n === 1 ? "1 cambio" : `${n} cambios`);
const seSube = (n: number) => (n === 1 ? "se subirá" : "se subirán");

export function statusText(st: CloudStatus): { text: string; tone: "success" | "warning" | "info" | "danger" } {
  if (!st.configured) return { text: "La nube no está configurada: lo apuntado se guarda solo en este dispositivo.", tone: "info" };
  if (st.sessionLost) return { text: "Este móvil ya no está enlazado con tu espacio. Escribe tu código de recuperación para volver a enlazarlo.", tone: "danger" };
  if (!st.linked) return { text: "Aún no está enlazado. Se enlazará solo en cuanto haya conexión.", tone: "warning" };
  if (st.syncing) return { text: "Guardando…", tone: "info" };
  if (!st.online) return { text: `Sin conexión. ${st.pending ? `${cambios(st.pending)} ${seSube(st.pending)} al volver.` : "Todo lo anterior ya está guardado."}`, tone: "warning" };
  if (st.error) return { text: `${st.error} ${st.pending ? `${st.pending === 1 ? "1 cambio pendiente" : `${st.pending} cambios pendientes`}.` : ""}`, tone: "danger" };
  if (st.pending) return { text: `${st.pending === 1 ? "1 cambio pendiente" : `${st.pending} cambios pendientes`} de subir.`, tone: "warning" };
  return { text: `Todo guardado en la nube (${ago(st.lastSyncAt)}).`, tone: "success" };
}

async function copy(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); toast("Copiado"); } catch { toast("Mantén pulsado el código para copiarlo.", "info"); }
}

function codeBox(code: string, label: string): HTMLElement {
  return h("div", { class: "code-box" },
    h("span", { class: "code-label" }, label),
    h("output", { class: "code num", "aria-label": label }, code),
    button("Copiar", { variant: "secondary", size: "sm", icon: Copy, onClick: () => copy(code) }));
}

/** Sección de Ajustes. Se repinta sola cuando cambia el estado. */
export async function cloudSection(): Promise<HTMLElement> {
  const sec = h("section", { class: "stack-sm", "aria-labelledby": "cloud-title" });
  const draw = async () => {
    const st = await cloudStatus();
    const s = statusText(st);
    sec.replaceChildren(...[
      h("div", { class: "section-head" }, h("h2", { class: "section-title", id: "cloud-title" }, "Guardado en la nube")),
      h("p", { class: `cloud-status tone-${s.tone}`, role: "status" }, h("span", { class: "inline-icon" }, icon(st.configured && st.linked ? Cloud : CloudOff, { size: 18 })), " ", s.text),
      st.configured && st.linked && !st.sessionLost ? h("div", { class: "row" },
        button("Guardar ahora", { variant: "secondary", size: "sm", icon: RefreshCw, disabled: st.syncing || !st.online, onClick: () => syncNow() }),
        button("Usar en otro móvil", { variant: "secondary", size: "sm", icon: Smartphone, onClick: pairSheet })) : null,
      st.recoveryCode ? h("div", { class: "card stack-sm" },
        h("p", {}, h("strong", {}, "Guarda tu código de recuperación."), " Si pierdes el móvil o borras los datos del navegador, con él recuperas todo en otro. Apúntalo en un sitio seguro: no se puede volver a ver."),
        codeBox(st.recoveryCode, "Código de recuperación"),
        button("Ya lo he guardado", { size: "sm", onClick: async () => {
          if (await confirmDialog("¿Lo has guardado?", { ok: "Sí, ocultarlo", detail: "Después ya no se podrá ver. Si lo pierdes, puedes crear uno nuevo desde aquí mientras este móvil siga enlazado." })) await forgetRecoveryCode();
        } })) : null,
      st.configured && st.linked && !st.recoveryCode && !st.sessionLost ? button("Crear un código de recuperación nuevo", { variant: "ghost", size: "sm", onClick: async () => {
        if (!(await confirmDialog("¿Crear un código nuevo?", { ok: "Crear", detail: "El anterior dejará de valer." }))) return;
        try { await newRecoveryCode(); } catch (e) { toast(errorText(e), "danger"); }
      } }) : null,
      st.configured ? button(st.sessionLost ? "Escribir el código de recuperación" : "Enlazar con otro móvil que ya la usa", { variant: st.sessionLost ? "primary" : "ghost", size: "sm", icon: Link2, onClick: () => joinSheet() }) : null,
      st.configured ? h("p", { class: "muted small" }, "Se guarda en Supabase (en tu proyecto): movimientos, fotos, huchas, notas y ajustes. La clave del asistente no sale del móvil.") : null,
    ].filter((x) => !!x) as HTMLElement[]);
  };
  await draw();
  const off = onCloudChange(() => { if (!sec.isConnected) off(); else draw(); });
  return sec;
}

/** Aviso en el inicio si hay algo importante de la nube. */
export async function cloudBanner(): Promise<HTMLElement | null> {
  if (!cloudConfigured()) return null;
  const st = await cloudStatus();
  if (st.sessionLost) return banner("Este móvil ya no está enlazado con tu espacio en la nube.", "danger", h("a", { class: "btn btn-secondary btn-sm", href: "#/ajustes" }, "Arreglar"));
  if (st.recoveryCode) return banner("Guarda tu código de recuperación para no perder nada si cambias de móvil.", "warning", h("a", { class: "btn btn-secondary btn-sm", href: "#/ajustes" }, "Verlo"));
  return null;
}

async function pairSheet(): Promise<void> {
  const body = h("div", { class: "stack-sm" }, h("p", { class: "muted" }, "Creando código…"));
  const d = openSheet("Usar en otro móvil", body);
  try {
    const { code, expiresAt } = await createPairCode();
    const until = new Date(expiresAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    body.replaceChildren(
      h("ol", { class: "plain-list" },
        h("li", {}, "En el otro móvil, abre la app."),
        h("li", {}, "En la bienvenida, pulsa «Ya la uso en otro móvil» (o en Ajustes, «Enlazar con otro móvil»)."),
        h("li", {}, "Escribe este código:")),
      codeBox(code, "Código para emparejar"),
      h("p", { class: "muted" }, `Vale hasta las ${until} y una sola vez.`));
  } catch (e) {
    body.replaceChildren(h("p", { class: "field-msg error" }, errorText(e)));
  }
  void d;
}

/** Pide un código y enlaza este móvil. Devuelve true si lo consigue. */
export function joinSheet(): Promise<boolean> {
  return new Promise((resolve) => {
    let ok = false;
    const f = field("Código", { name: "code", placeholder: "Ej.: ABCD-EFGH", autocomplete: "one-time-code", hint: "El de emparejar (8 letras) o el de recuperación (20)." });
    const input = f.querySelector("input")!;
    input.setAttribute("autocapitalize", "characters");
    const go = button("Enlazar", { type: "submit", block: true });
    const form = h("form", { class: "stack-sm", novalidate: true },
      h("p", { class: "muted" }, "Lo que haya en este móvil se juntará con lo que ya tienes guardado."), f, go);
    const d = openSheet("Enlazar con tu espacio", form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setFieldError(f, null); go.disabled = true;
      try { await joinWithCode(input.value); ok = true; toast("Enlazado. Bajando tus datos…", "success"); d.close(); }
      catch (err) { setFieldError(f, errorText(err)); go.disabled = false; }
    });
    d.addEventListener("close", () => resolve(ok));
  });
}
