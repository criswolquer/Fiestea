// S21 Informe del mes en PDF (generado en el navegador con jsPDF).
import { Download, FileText, Share2 } from "lucide";
import { dayLabel, monthLabel, thisMonth, today } from "../data/dates";
import { buildSummary, categoryBreakdown, getSettings, listCategories, listTransactions, markFirstStep } from "../data/repo";
import type { Month } from "../data/types";
import { button, emptyState, kpi, toast } from "../ui/components";
import { h, money } from "../ui/dom";
import { screen } from "../app/layout";
import { download, errorText } from "../app/util";

// jsPDF con fuentes estándar: solo Latin-1. Cambiamos el signo menos tipográfico.
const pdfMoney = (c: number) => money(c).replace(/−/g, "-").replace(/ /g, " ");

export async function monthPdf(month: Month): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const [s, brk, txs, cats, settings] = await Promise.all([buildSummary(month), categoryBreakdown(month, "expense"), listTransactions({ month }), listCategories(undefined, { includeArchived: true }), getSettings()]);
  const byId = new Map(cats.map((c) => [c.id, c.name]));
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 18;
  let y = M;
  const line = (text: string, size = 11, bold = false, color = 20) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(color); doc.text(text, M, y); y += size * 0.5 + 2; };
  const pageBreak = (need = 10) => { if (y > 297 - M - need) { doc.addPage(); y = M; } };

  line(`Informe de ${monthLabel(month)}`, 22, true);
  line(settings.nickname ? `De ${settings.nickname} · generado el ${dayLabel(today())}` : `Generado el ${dayLabel(today())}`, 10, false, 110);
  y += 4;
  // Cifras clave en la primera página
  const boxes: [string, number][] = [["Entró", s.incomeCents], ["Gastado", s.expenseCents], ["Ahorrado", s.savedCents], ["Invertido", s.investedCents]];
  const bw = (W - 2 * M - 9) / 4;
  boxes.forEach(([label, c], i) => {
    const x = M + i * (bw + 3);
    doc.setDrawColor(220); doc.setFillColor(246, 245, 242); doc.roundedRect(x, y, bw, 22, 3, 3, "FD");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100); doc.text(label, x + 4, y + 7);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(20); doc.text(pdfMoney(c), x + 4, y + 16);
  });
  y += 32;
  line(`${s.balanceCents >= 0 ? "Te quedó" : "Te faltó"}: ${pdfMoney(Math.abs(s.balanceCents))}`, 14, true);
  line(`Disponible al empezar: ${pdfMoney(s.liquidStartCents)} · al terminar: ${pdfMoney(s.liquidEndCents)}`, 10, false, 90);
  if (s.plan && s.actual) line(`Plan: gastos ${s.actual.expensesPct} % de ${s.plan.expensesPct} %, ahorro ${s.actual.savingsPct} % de ${s.plan.savingsPct} %, inversión ${s.actual.investmentsPct} % de ${s.plan.investmentsPct} %`, 10, false, 90);
  y += 6;

  line("Gastos por categoría", 14, true);
  for (const seg of brk.segments) {
    pageBreak();
    const pct = brk.totalCents ? Math.round((seg.cents / brk.totalCents) * 100) : 0;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(20);
    doc.text(seg.category?.name ?? "Sin categoría", M, y);
    doc.setFillColor(184, 63, 21); doc.rect(M + 55, y - 3, Math.max(0.5, (pct / 100) * 80), 3.5, "F");
    doc.text(`${pct} %`, M + 140, y, { align: "right" });
    doc.text(pdfMoney(seg.cents), W - M, y, { align: "right" });
    y += 7;
  }
  y += 6; pageBreak(20);
  line("Movimientos", 14, true);
  doc.setFontSize(9);
  for (const t of [...txs].reverse()) {
    pageBreak();
    doc.setFont("helvetica", "normal"); doc.setTextColor(90); doc.text(dayLabel(t.occurredOn), M, y);
    doc.setTextColor(20); doc.text((t.title || "Sin concepto").slice(0, 40), M + 22, y);
    doc.setTextColor(110); doc.text((t.categoryId ? byId.get(t.categoryId) ?? "" : "Sin categoría").slice(0, 22), M + 100, y);
    doc.setTextColor(20); doc.text(`${t.type === "income" ? "+" : "-"}${pdfMoney(t.amountCents)}`, W - M, y, { align: "right" });
    y += 6;
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150); doc.text(`Página ${i} de ${pages} · Solo informativo, no es asesoramiento financiero.`, M, 297 - 8); }
  return doc.output("blob");
}

export async function reportScreen([m]: string[]): Promise<HTMLElement> {
  const month = /^\d{4}-\d{2}$/.test(m) ? m : thisMonth();
  const s = await buildSummary(month);
  const name = `informe-${month}.pdf`;
  const make = async (btn: HTMLButtonElement, share: boolean) => {
    btn.disabled = true;
    try {
      const blob = await monthPdf(month);
      await markFirstStep("informe");
      const file = new File([blob], name, { type: "application/pdf" });
      if (share && navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: `Informe de ${monthLabel(month)}` }); } catch { /* cancelado */ } }
      else download(blob, name);
    } catch (e) { toast(errorText(e), "danger"); }
    btn.disabled = false;
  };
  const dl = button("Descargar PDF", { size: "lg", block: true, icon: Download });
  dl.addEventListener("click", () => make(dl, false));
  const sh = button("Compartir", { variant: "secondary", block: true, icon: Share2 });
  sh.addEventListener("click", () => make(sh, true));
  return screen({ title: "Informe del mes", back: `#/?mes=${month}` },
    h("h2", { class: "section-title" }, monthLabel(month)),
    s.txCount ? h("div", { class: "stack" },
      h("p", { class: "muted" }, "Un PDF con tus cifras clave en la primera página, el gasto por categoría y todos los movimientos. Se genera en tu móvil: no se envía a ningún sitio."),
      h("div", { class: "kpis card" }, kpi("Entró", s.incomeCents, "income"), kpi("Gastado", s.expenseCents, "expense"), kpi("Ahorrado", s.savedCents, "savings"), kpi("Invertido", s.investedCents, "investment")),
      dl, "share" in navigator ? sh : null)
      : emptyState("Este mes no tiene movimientos", "Cuando apuntes alguno, podrás sacar su informe.", FileText));
}
