import { expect, type Page } from "@playwright/test";

/** Falla la prueba si la página da errores de consola. */
export function watchErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  return errs;
}

export async function startFresh(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tu dinero del mes, claro y sin agobios" })).toBeVisible();
  await page.getByRole("button", { name: "Empezar" }).click();
  await page.getByRole("button", { name: "Guardar", exact: true }).waitFor();
}

export async function loadDemo(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Probar con datos de ejemplo" }).click();
  await expect(page.locator(".hero-card")).toBeVisible({ timeout: 30_000 });
}

/** Cifras del mes del inicio (espera a que el inicio esté pintado). */
export async function kpis(page: Page): Promise<string[]> {
  await expect(page.locator(".hero-card .kpi-value")).toHaveCount(4);
  return (await page.locator(".hero-card .kpi-value").allTextContents()).map(norm);
}
/** Los importes llevan espacio duro antes del €: lo normalizamos para comparar. */
export const norm = (s: string) => s.replace(/\u00a0|\u202f/g, " ").trim();
