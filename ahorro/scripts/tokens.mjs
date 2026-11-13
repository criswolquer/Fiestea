// Genera src/styles/tokens.css (y una copia en replica/design/tokens.css)
// a partir de replica/design/tokens.json. Los componentes solo usan var(--...).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../replica/design/tokens.json");
const t = JSON.parse(fs.readFileSync(src, "utf8"));

const colorVars = (c) => Object.entries(c).map(([k, v]) => `  --${k}: ${v};`).join("\n");
const lines = [];
for (const [k, v] of Object.entries(t.type)) {
  lines.push(`  --text-${k}: ${v.size}px;`, `  --leading-${k}: ${v.line}px;`, `  --weight-${k}: ${v.weight};`);
}
t.space.forEach((v, i) => lines.push(`  --space-${i}: ${v}px;`));
for (const [k, v] of Object.entries(t.radius)) lines.push(`  --radius-${k}: ${v}px;`);
for (const [k, v] of Object.entries(t.shadow)) lines.push(`  --shadow-${k}: ${v};`);
for (const [k, v] of Object.entries(t.motion)) lines.push(`  --motion-${k}: ${v};`);
for (const [k, v] of Object.entries(t.layout)) lines.push(`  --${k}: ${v}px;`);

const css = `/* GENERADO por scripts/tokens.mjs desde replica/design/tokens.json. No editar a mano. */
:root {
  color-scheme: dark light;
  --font-sans: ${t.font.sans};
${lines.join("\n")}
${colorVars(t.color)}
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
${colorVars(t.themes.light).replace(/^/gm, "  ")}
  }
}
:root[data-theme="light"] {
${colorVars(t.themes.light)}
}
`;
fs.writeFileSync(path.resolve(here, "../src/styles/tokens.css"), css);
fs.writeFileSync(path.resolve(here, "../../replica/design/tokens.css"), css);
console.log("tokens.css generado");

// Copia del tema claro con la forma que espera contrast.py (solo para el control de contraste).
const light = { ...t, _about: "GENERADO desde tokens.json (themes.light) solo para el control de contraste. No editar.", color: t.themes.light };
delete light.themes;
fs.writeFileSync(path.resolve(here, "../../replica/design/tokens.light.json"), JSON.stringify(light, null, 2) + "\n");
