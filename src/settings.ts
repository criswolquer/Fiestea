import { getApiKey, setApiKey } from "./ai";
import { exportBackup, importBackup } from "./files";
import { download, h, modal, pickFile, toast } from "./ui";

export const prefs = {
  get pencilOnly(): boolean {
    return read("pencilOnly") === "1";
  },
  set pencilOnly(v: boolean) {
    write("pencilOnly", v ? "1" : "0");
  },
  get theme(): "auto" | "light" | "dark" {
    return (read("theme") as "auto" | "light" | "dark") || "auto";
  },
  set theme(v) {
    write("theme", v);
    applyTheme();
  },
};

function read(k: string): string | null {
  try {
    return localStorage.getItem(`trazo.${k}`);
  } catch {
    return null;
  }
}
function write(k: string, v: string): void {
  try {
    localStorage.setItem(`trazo.${k}`, v);
  } catch {
    /* ignore */
  }
}

export function applyTheme(): void {
  const t = prefs.theme;
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}

export function openSettings(onChange?: () => void): void {
  const key = h("input", { class: "input", type: "password", value: getApiKey(), placeholder: "sk-ant-…", autocomplete: "off" });
  const pencil = h("input", { type: "checkbox", checked: prefs.pencilOnly });
  const theme = h(
    "select",
    { class: "input" },
    h("option", { value: "auto" }, "Automático"),
    h("option", { value: "light" }, "Claro"),
    h("option", { value: "dark" }, "Oscuro"),
  );
  theme.value = prefs.theme;

  const m = modal(
    "Ajustes",
    [
      h("h3", {}, "Escritura"),
      h(
        "label",
        { class: "check" },
        pencil,
        h("span", {}, h("strong", {}, "Escribir solo con Apple Pencil"), h("br"), h("span", { class: "muted small" }, "El dedo desplaza y hace zoom; el lápiz escribe. Evita marcas al apoyar la mano.")),
      ),
      h("label", { class: "field" }, h("span", {}, "Tema"), theme),
      h("h3", {}, "Inteligencia artificial"),
      h("label", { class: "field" }, h("span", {}, "Clave de API de Claude"), key),
      h(
        "p",
        { class: "muted small" },
        "Consíguela en console.anthropic.com. Se guarda solo en este dispositivo y se usa para enviar tus páginas a Claude cuando pides un resumen, un cuestionario, tarjetas o usas la pluma IA.",
      ),
      h("h3", {}, "Copia de seguridad"),
      h(
        "p",
        { class: "muted small" },
        "Tus cuadernos se guardan en este dispositivo. Para pasarlos a otro (por ejemplo del iPhone al iPad), exporta una copia aquí e impórtala en el otro.",
      ),
      h(
        "div",
        { class: "row" },
        h(
          "button",
          {
            class: "btn",
            type: "button",
            onclick: async () => {
              const blob = await exportBackup();
              download(blob, `trazo-copia-${new Date().toISOString().slice(0, 10)}.json`);
            },
          },
          "Exportar copia",
        ),
        h(
          "button",
          {
            class: "btn",
            type: "button",
            onclick: async () => {
              const [f] = await pickFile("application/json,.json");
              if (!f) return;
              try {
                const n = await importBackup(f);
                toast(`${n} cuaderno(s) importado(s)`);
                m.close();
                onChange?.();
              } catch (e) {
                toast(e instanceof Error ? e.message : "No se pudo importar");
              }
            },
          },
          "Importar copia",
        ),
      ),
      h(
        "div",
        { class: "actions" },
        h(
          "button",
          {
            class: "btn primary",
            type: "button",
            onclick: () => {
              setApiKey(key.value);
              prefs.pencilOnly = pencil.checked;
              prefs.theme = theme.value as typeof prefs.theme;
              m.close();
              toast("Ajustes guardados");
              onChange?.();
            },
          },
          "Guardar",
        ),
      ),
    ],
    { wide: true },
  );
}
