import { button, sheet } from "../ui/components";
import { h } from "../ui/dom";

/** Abre una hoja inferior; se quita del DOM al cerrarse y devuelve el foco. */
export function openSheet(title: string, body: Node, footer?: Node): HTMLDialogElement {
  const opener = document.activeElement as HTMLElement | null;
  const d = sheet(title, body, { footer });
  document.body.append(d);
  d.addEventListener("close", () => { d.remove(); opener?.focus?.(); });
  d.showModal();
  return d;
}

export function confirmDialog(text: string, o: { ok: string; danger?: boolean; detail?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const d = openSheet(text,
      o.detail ? h("p", { class: "muted" }, o.detail) : h("span"),
      h("div", { class: "row-end" },
        button("Cancelar", { variant: "secondary", onClick: () => d.close() }),
        button(o.ok, { variant: o.danger ? "danger" : "primary", onClick: () => { answer = true; d.close(); } })));
    d.addEventListener("close", () => resolve(answer));
  });
}
