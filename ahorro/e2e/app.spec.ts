import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { kpis, loadDemo, startFresh, watchErrors } from "./helpers";

test("bienvenida corta: cuentas y primer gasto", async ({ page }) => {
  const errs = watchErrors(page);
  await startFresh(page);
  await expect(page.getByText("Paso 1 de 2")).toBeVisible();
  const rows = page.locator(".setup-row");
  await rows.nth(0).locator("[name=name]").fill("Cuenta de la nómina");
  await rows.nth(0).locator("[name=bal]").fill("1500");
  await page.locator(".setup-pot").first().locator("[name=name]").fill("Fondo");
  await page.locator(".setup-pot").first().locator("[name=bal]").fill("1000");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Paso 2 de 2")).toBeVisible();
  await expect(page.getByLabel("Importe")).toBeFocused();
  await page.getByLabel("Importe").fill("3,20");
  await page.getByLabel("Concepto").fill("Café");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.locator(".tx-row", { hasText: "Café" })).toBeVisible();
  expect((await kpis(page))[1]).toBe("3,20 €");
  await expect(page.locator(".ring-sub").first()).toHaveText("gastado este mes");
  await page.goto("/#/capital");
  await expect(page.locator(".big-number")).toHaveText(/2\.496,80\s€/);
  expect(errs).toEqual([]);
});

test("todas las pantallas abren sin errores ni desbordes con datos de ejemplo", async ({ page }) => {
  const errs = watchErrors(page);
  await loadDemo(page);
  for (const route of ["#/", "#/movimientos", "#/graficos", "#/limites", "#/plan", "#/calendario", "#/capital", "#/cuentas", "#/fijos", "#/asistente",
    "#/rachas", "#/recuerdo", "#/ajustes", "#/categorias", "#/importar", "#/configurar-cuentas", "#/privacidad", "#/info", "#/primeros-pasos"]) {
    await page.goto(`/${route}`);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByText("No se ha podido abrir esta pantalla")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), route).toBeLessThanOrEqual(0);
  }
  expect(errs).toEqual([]);
});

test("al apuntar se elige la cuenta y el saldo de esa cuenta sube", async ({ page }) => {
  await loadDemo(page);
  await page.goto("/#/nuevo?tipo=ingreso");
  await expect(page.getByText("¿A qué cuenta entra?")).toBeVisible();
  await page.getByLabel("Importe").fill("20");
  await page.locator("label.chip", { hasText: "Efectivo" }).click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Ingreso apuntado en Efectivo")).toBeVisible();
  await page.goto("/#/cuentas"); await page.reload();
  await expect(page.locator(".account", { hasText: "Efectivo" }).locator(".pot-amount")).toHaveText(/73,00\s€/);
});

test("invertir no cuenta como gasto y «puedes gastar al día» aparece", async ({ page }) => {
  await loadDemo(page);
  await expect(page.locator(".safe-pill")).toContainText("al día");
  const before = await kpis(page);
  await page.goto("/#/capital");
  await page.locator("a.pot", { hasText: "Fondo indexado" }).click();
  await page.getByRole("button", { name: "Aportar" }).click();
  await page.locator("dialog").getByLabel("Importe").fill("100");
  await page.locator("dialog form button[type=submit]").click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await page.goto("/#/"); await page.reload();
  const after = await kpis(page);
  expect(after[1]).toBe(before[1]);           // gastado igual
  expect(after[3]).not.toBe(before[3]);       // invertido sube
  await expect(page.locator(".ring-sub").first()).toHaveText("te sobra este mes");
});

test("los fijos se apuntan solos una vez", async ({ page }) => {
  await startFresh(page);
  await page.getByRole("button", { name: "Ahora no" }).click();
  await expect(page.getByText("Paso 2 de 2")).toBeVisible();
  await page.goto("/#/fijos");
  await page.getByRole("button", { name: "Añadir el primero" }).click();
  await page.locator("dialog").getByLabel("Importe").fill("550");
  await page.locator("dialog").getByLabel("Nombre").fill("Alquiler");
  await page.locator("dialog").getByLabel("Día del mes").fill("1");
  await page.locator("dialog form button[type=submit]").click();
  await page.goto("/#/movimientos"); await page.reload();
  await expect(page.locator(".tx-row", { hasText: "Alquiler" })).toHaveCount(1);
});

test("mover dinero entre cuentas no es gasto", async ({ page }) => {
  await loadDemo(page);
  const before = await kpis(page);
  await page.goto("/#/cuentas");
  await page.getByRole("button", { name: "Mover dinero entre cuentas o a tus huchas" }).click();
  const efectivo = await page.locator("#mv-to option", { hasText: "Efectivo" }).getAttribute("value");
  await page.locator("#mv-to").selectOption(efectivo!);
  await page.locator("dialog").getByLabel("Importe").fill("50");
  await expect(page.locator("dialog").getByRole("button", { name: "Mover", exact: true })).toBeVisible();
  // Se envía con Intro: en el navegador del servidor de CI el clic sobre la hoja animada es inestable.
  await page.locator("dialog").getByLabel("Importe").press("Enter");
  await expect(page.getByText("Últimos traspasos")).toBeVisible();
  await expect(page.locator(".account", { hasText: "Efectivo" }).locator(".pot-amount")).toHaveText(/103,00\s€/);
  await page.goto("/#/"); await page.reload();
  expect(await kpis(page)).toEqual(before);
});

test("valor de la inversión: muestra lo que ganas", async ({ page }) => {
  await loadDemo(page);
  await page.goto("/#/capital");
  await page.locator("a.pot", { hasText: "Fondo indexado" }).click();
  await page.getByRole("button", { name: "Actualizar valor" }).click();
  await page.locator("dialog").getByLabel("Valor de hoy").fill("2000");
  await page.locator("dialog form button[type=submit]").click();
  await expect(page.locator("dd.gain")).toContainText("€");
  await expect(page.getByText("Ganas")).toBeVisible();
});

test("importar extracto CSV sin repetir", async ({ page }) => {
  await loadDemo(page);
  const file = path.join(os.tmpdir(), `extracto-${Date.now()}.csv`);
  const d = new Date(); const fmt = (x: Date) => `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${x.getFullYear()}`;
  fs.writeFileSync(file, `Fecha;Concepto;Importe;Saldo\n${fmt(d)};MERCADONA;-15,20;1.234,56\n${fmt(d)};NETFLIX.COM;-12,99;1.249,76\n`);
  await page.goto("/#/importar");
  await page.locator("#statement").setInputFiles(file);
  await expect(page.locator(".import-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Importar 2 movimientos" }).click();
  await expect(page.locator(".tx-row", { hasText: "MERCADONA" })).toBeVisible();
  await page.goto("/#/importar");
  await page.locator("#statement").setInputFiles(file);
  await expect(page.getByText("2 ya estaban importados")).toBeVisible();
});
