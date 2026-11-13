// S08 Detalle de un movimiento + lista completa del mes (#/movimientos).
import { Pencil, Share2, Trash2, ReceiptText } from "lucide";
import { longDay, monthLabel } from "../data/dates";
import { deleteTransaction, getPhoto, getTransaction, listCategories, listTransactions } from "../data/repo";
import { button, emptyState, toast } from "../ui/components";
import { h, icon, money } from "../ui/dom";
import { screen } from "../app/layout";
import { confirmDialog } from "../app/dialogs";
import { forgetPhoto, go, photoUrl } from "../app/util";
import type { Query } from "../app/router";
import { monthParam, txDayGroups } from "./home";
import { newTxButton } from "./txform";

export async function txDetailScreen([id]: string[]): Promise<HTMLElement> {
  const t = await getTransaction(id);
  if (!t) return screen({ title: "Movimiento", back: "#/" }, emptyState("Este movimiento ya no existe", "Puede que lo hayas borrado.", ReceiptText));
  const cats = await listCategories(undefined, { includeArchived: true });
  const cat = cats.find((c) => c.id === t.categoryId);
  const url = t.hasPhoto ? await photoUrl(t.id) : undefined;
  const backTo = `#/?mes=${t.occurredOn.slice(0, 7)}`;

  const share = async () => {
    const blob = await getPhoto(t.id);
    if (!blob) return;
    const file = new File([blob], "momento.jpg", { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch { /* cancelado */ }
    } else toast("Este navegador no permite compartir fotos. Mantén pulsada la foto para guardarla.", "info");
  };
  const remove = async () => {
    if (!(await confirmDialog("¿Borrar este movimiento?", { ok: "Borrar", danger: true, detail: t.hasPhoto ? "También se borrará su foto. No se puede deshacer." : "No se puede deshacer." }))) return;
    await deleteTransaction(t.id); forgetPhoto(t.id);
    toast("Movimiento borrado"); go(backTo);
  };

  return screen({ title: t.title || cat?.name || "Movimiento", back: backTo },
    url ? h("img", { class: "detail-photo", src: url, alt: `Foto de ${t.title || "este movimiento"}` }) : null,
    h("p", { class: `detail-amount num ${t.type}` }, h("span", { class: "sr-only" }, t.type === "income" ? "Ingreso de " : "Gasto de "), `${t.type === "income" ? "+" : "−"}${money(t.amountCents)}`),
    h("dl", { class: "facts" },
      h("dt", {}, "Categoría"), h("dd", {}, cat ? h("a", { href: `#/categoria/${cat.id}?mes=${t.occurredOn.slice(0, 7)}` }, cat.name) : "Sin categoría"),
      h("dt", {}, "Fecha"), h("dd", {}, longDay(t.occurredOn)),
      t.note ? h("dt", {}, "Nota") : null, t.note ? h("dd", { class: "pre" }, t.note) : null),
    h("div", { class: "row" },
      h("a", { class: "btn btn-secondary btn-md", href: `#/movimiento/${t.id}/editar` }, icon(Pencil), h("span", {}, "Editar")),
      url ? button("Compartir foto", { variant: "secondary", icon: Share2, onClick: share }) : null,
      button("Borrar", { variant: "danger", icon: Trash2, onClick: remove })),
  );
}

export async function txListScreen(_: string[], q: Query): Promise<HTMLElement> {
  const month = monthParam(q);
  const [txs, cats] = await Promise.all([listTransactions({ month }), listCategories(undefined, { includeArchived: true })]);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const search = h("input", { class: "input", type: "search", placeholder: "Buscar por concepto o nota", "aria-label": "Buscar movimientos" });
  const list = await txDayGroups(txs, byId);
  const none = h("p", { class: "muted center", hidden: true }, "Nada coincide con esa búsqueda.");
  const items = [...list.querySelectorAll<HTMLElement>(".tx-row")].map((el) => el.parentElement!);
  const byHref = new Map(txs.map((t) => [`#/movimiento/${t.id}`, t]));
  search.addEventListener("input", () => {
    const term = search.value.trim().toLowerCase();
    let shown = 0;
    for (const li of items) {
      const t = byHref.get(li.firstElementChild!.getAttribute("href")!)!; const c = t.categoryId ? byId.get(t.categoryId)?.name ?? "" : "";
      const hit = !term || `${t.title} ${t.note} ${c}`.toLowerCase().includes(term);
      li.hidden = !hit; if (hit) shown++;
    }
    list.querySelectorAll<HTMLElement>(".day-group").forEach((g) => { g.hidden = !g.querySelector("li:not([hidden])"); });
    none.hidden = shown > 0;
  });
  return screen({ title: `Movimientos de ${monthLabel(month, { year: false })}`, back: `#/?mes=${month}` },
    txs.length ? h("div", { class: "stack-sm" }, search, list, none)
      : emptyState("No hay movimientos este mes", "Apunta uno y aparecerá aquí.", ReceiptText, newTxButton("Apuntar", `#/nuevo?fecha=${month}-01`)));
}
