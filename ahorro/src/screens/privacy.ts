// Política de privacidad, en claro.
import { h } from "../ui/dom";
import { screen } from "../app/layout";
import { cloudConfigured } from "../data/cloud";

export function privacyScreen(): HTMLElement {
  const sec = (title: string, ...ps: string[]) => h("section", { class: "stack-sm" }, h("h2", { class: "section-title" }, title), ...ps.map((p) => h("p", {}, p)));
  return screen({ title: "Privacidad", back: "#/ajustes" },
    h("p", { class: "muted" }, "Versión del 15 de noviembre de 2026. Explicado sin letra pequeña."),
    sec("Qué se guarda y dónde",
      "Lo que apuntas (movimientos, fotos, cuentas, huchas, notas, ajustes) se guarda en este dispositivo, dentro del navegador. No hay cuentas de usuario ni se pide email.",
      cloudConfigured()
        ? "Si el guardado en la nube está activo, una copia de todo (fotos incluidas) se guarda también en Supabase, en un espacio privado al que solo acceden tus dispositivos enlazados. El dueño del proyecto de Supabase puede verlo desde su panel."
        : "Esta versión no guarda nada en la nube: si borras los datos del navegador o pierdes el móvil sin copia, se pierden."),
    sec("Qué sale del dispositivo",
      "Nada, salvo dos cosas que eliges tú: las copias de seguridad que descargas y, si pones tu propia clave de Claude, las preguntas al asistente. Para responder, se envían a Anthropic tus cifras, categorías, conceptos y tu apodo; nunca tus fotos ni tu email.",
      "Los extractos del banco que importas se leen en el móvil y no se envían a ningún sitio."),
    sec("Lo que no hacemos",
      "No hay publicidad, ni analítica, ni se venden ni se comparten datos. No es asesoramiento financiero: solo tus números, ordenados."),
    sec("Tus derechos",
      "Puedes descargar todo en Ajustes → Copia de seguridad, y borrarlo todo en Ajustes → Borrar todos mis datos (también de la nube, si está activa)."),
  );
}
