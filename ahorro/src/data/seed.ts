// Datos de ejemplo inventados para probar la app (botón "Probar con datos de ejemplo").
// Las fotos se dibujan aquí con degradados: no hay ninguna imagen real ni del original.
import { addDays, addMonths, daysInMonth, thisMonth, today } from "./dates";
import * as repo from "./repo";
import type { Category } from "./types";

function fakePhoto(seed: number): Promise<Blob> {
  const c = document.createElement("canvas"); c.width = 640; c.height = 640;
  const g = c.getContext("2d")!;
  const hue = (seed * 67) % 360;
  const gr = g.createLinearGradient(0, 0, 640, 640);
  gr.addColorStop(0, `hsl(${hue} 60% 45%)`); gr.addColorStop(1, `hsl(${(hue + 60) % 360} 70% 60%)`);
  g.fillStyle = gr; g.fillRect(0, 0, 640, 640);
  g.fillStyle = "rgba(255,255,255,.25)";
  for (let i = 0; i < 5; i++) { g.beginPath(); g.arc((seed * 97 + i * 131) % 640, (seed * 53 + i * 171) % 640, 40 + ((seed + i) % 4) * 30, 0, Math.PI * 2); g.fill(); }
  return new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.8));
}

export async function loadDemo(): Promise<void> {
  const cats = await repo.ensureDefaultCategories();
  const byName = (n: string) => cats.find((c: Category) => c.name === n)!.id;
  const limits: [string, number][] = [["Comida", 35000], ["Ocio", 15000], ["Caprichos", 10000], ["Suscripciones", 3000]];
  for (const [n, l] of limits) await repo.setLimit(byName(n), l);

  const now = thisMonth();
  const start = addMonths(now, -2);
  await repo.saveSettings({ nickname: "Alex", liquidStartCents: 120000, liquidStartDate: `${start}-01`, onboardedAt: new Date().toISOString(),
    firstSteps: ["nombre", "dinero-hoy", "huchas", "limites", "plan"], accountsSetupDone: true });

  await repo.upsertAccount({ id: repo.MAIN_ACCOUNT, name: "Banco de la nómina", kind: "corriente", initialCents: 120000, initialDate: `${start}-01`, color: "chart-2" });
  const cash = await repo.upsertAccount({ name: "Efectivo", kind: "efectivo", initialCents: 6000, initialDate: `${start}-01`, color: "chart-4" });
  const sav = await repo.upsertPot({ name: "Colchón", type: "savings", goalCents: 300000, institution: "Cuenta remunerada" });
  const trip = await repo.upsertPot({ name: "Viaje a Lisboa", type: "savings", goalCents: 60000 });
  const inv = await repo.upsertPot({ name: "Fondo indexado", type: "investment", goalCents: null, institution: "Banco de inversión" });
  await repo.addPotMovement(sav.id, "contribution", 150000, `${start}-01`, "Saldo inicial", true);
  await repo.addPotMovement(inv.id, "contribution", 80000, `${start}-01`, "Saldo inicial", true);

  const t = today();
  let photoSeed = 1;
  for (let k = 0; k < 3; k++) {
    const m = addMonths(start, k);
    const last = m === now ? Number(t.slice(8)) : daysInMonth(m);
    const day = (d: number) => `${m}-${String(Math.min(d, last)).padStart(2, "0")}`;
    const add = async (type: "income" | "expense", cents: number, cat: string, title: string, d: number, photo = false) => {
      if (d > last) return;
      await repo.addTransaction({ type, amountCents: cents, categoryId: byName(cat), title, occurredOn: day(d) }, photo ? await fakePhoto(photoSeed++) : null);
    };
    await add("income", 184500, "Nómina", "Nómina", 1);
    await add("expense", 55000, "Vivienda", "Alquiler", 1);
    await add("expense", 1299, "Suscripciones", "Música", 3);
    await add("expense", 899, "Suscripciones", "Series", 5);
    await add("expense", 4000, "Transporte", "Abono transporte", 2);
    await add("expense", 8000, "Préstamos", "Cuota del portátil", 10);
    for (let d = 2; d <= 28; d += 4) await add("expense", 2500 + ((d * 731 + k * 97) % 4500), "Comida", d % 8 === 2 ? "Supermercado" : "Mercado", d);
    await add("expense", 3800 + k * 700, "Ocio", ["Concierto", "Cine y cena", "Escapada a la sierra"][k], 8, true);
    await add("expense", 2450, "Comida", "Cena de cumpleaños", 14, true);
    await add("expense", 4200 + k * 1500, "Caprichos", ["Zapatillas", "Libro y café", "Plantas para el balcón"][k], 18, true);
    await add("expense", 1650, "Ocio", "Partido de pádel", 22, k !== 1);
    if (k === 1) await add("income", 25000, "Extras", "Venta de la bici vieja", 20);
    await add("expense", 900, "Caprichos", "Helado", 25, true);
    if (25 <= last) await repo.addTransaction({ type: "expense", amountCents: 350, categoryId: byName("Comida"), title: "Churros", occurredOn: day(12), accountId: cash.id });
    if (m !== now || last >= 2) {
      await repo.addPotMovement(sav.id, "contribution", 20000, day(2));
      await repo.addPotMovement(trip.id, "contribution", 10000, day(2));
      await repo.addPotMovement(inv.id, "contribution", 12000, day(3));
    }
  }
  await repo.savePlan({ month: now, plannedIncomeCents: 184500, mode: "pct", expensesBp: 6000, savingsBp: 2500, investmentsBp: 1500 });
  await repo.savePlan({ month: addMonths(now, -1), plannedIncomeCents: 184500, mode: "pct", expensesBp: 6500, savingsBp: 2000, investmentsBp: 1500 });
  await repo.saveNote(t, "Devolver a Marta los 15 € de la cena.");
  await repo.saveNote(addDays(t, -3), "Mirar seguros de coche más baratos.");
  await repo.saveReminder({ text: "Revisar suscripciones que no uso", schedule: "monthly", monthDay: 28 });
  await repo.saveReminder({ text: "Apartar dinero para el viaje", schedule: "weekly", weekday: 5 });
  const s = await repo.getSettings();
  const open: string[] = []; for (let i = 6; i >= 0; i--) open.push(addDays(t, -i));
  await repo.saveSettings({ openDays: [...new Set([...s.openDays, ...open])].sort() });
}
