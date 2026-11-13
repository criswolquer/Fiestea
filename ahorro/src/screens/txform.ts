// S07 Nuevo movimiento y edición de uno existente (#/nuevo, #/movimiento/:id/editar).
import { Plus } from "lucide";
import { addMonths, isValidYmd, today } from "../data/dates";
import { addTransaction, getTransaction, listCategories, markFirstStep, monthSummary, updateTransaction } from "../data/repo";
import type { Category, TxType } from "../data/types";
import { button, field, moneyField, parseMoney, photoPicker, segmented, setFieldError, toast } from "../ui/components";
import { h, icon } from "../ui/dom";
import { screen } from "../app/layout";
import { centsToInput, compressImage, errorText, forgetPhoto, go, photoUrl } from "../app/util";
import type { Query } from "../app/router";

export async function txFormScreen(params: string[], q: Query): Promise<HTMLElement> {
  const editId = params[0];
  const existing = editId ? await getTransaction(editId) : undefined;
  if (editId && !existing) throw new Error("Ese movimiento ya no existe.");
  let type: TxType = existing?.type ?? (q.get("tipo") === "ingreso" ? "income" : "expense");
  const date = existing?.occurredOn ?? (isValidYmd(q.get("fecha") ?? "") ? q.get("fecha")! : today());
  const returnTo = q.get("volver") ?? (existing ? `#/movimiento/${existing.id}` : "#/");
  let photo: File | null | undefined = undefined;  // undefined = sin cambios
  const allCats = await listCategories();

  const amount = moneyField("Importe", { big: true, name: "amount", required: true, value: existing ? centsToInput(existing.amountCents) : "" });
  const title = field("Concepto", { name: "title", placeholder: "Ej.: cena con amigos", maxlength: 80, value: existing?.title });
  const dateF = field("Fecha", { name: "date", type: "date", value: date, required: true, max: `${addMonths(today().slice(0, 7), 12)}-28` });
  const note = h("div", { class: "field" },
    h("label", { class: "field-label", for: "tx-note" }, "Nota"),
    h("textarea", { id: "tx-note", name: "note", class: "input textarea", rows: 2, maxlength: 1000, placeholder: "Opcional" }, existing?.note ?? ""));
  const catBox = h("div");

  const renderCats = () => {
    const cats = allCats.filter((c) => c.type === type);
    const selected = existing && existing.type === type ? existing.categoryId : null;
    catBox.replaceChildren(h("fieldset", { class: "chips" },
      h("legend", { class: "field-label" }, "Categoría"),
      ...cats.map((c: Category) => chip(c.id, c.name, c.color, c.id === selected)),
      chip("", "Sin categoría", "chart-7", !selected && !!existing),
      h("a", { class: "chip chip-link", href: `#/categorias?volver=${encodeURIComponent(location.hash)}` }, "Editar categorías"),
    ));
  };
  const chip = (id: string, name: string, color: string, checked: boolean) => {
    const iid = `cat-${id || "none"}`;
    return h("span", { class: "chip-opt" },
      h("input", { type: "radio", name: "category", value: id, id: iid, class: "seg-input", checked }),
      h("label", { for: iid, class: "chip", style: `--chip:var(--${color})` }, name));
  };
  renderCats();

  const saveBtn = button(existing ? "Guardar cambios" : "Guardar", { block: true, size: "lg", type: "submit" });
  const form = h("form", { class: "stack", novalidate: true },
    segmented("Tipo de movimiento", ["Gasto", "Ingreso"], type === "expense" ? 0 : 1, (i) => { type = i === 0 ? "expense" : "income"; renderCats(); }),
    amount, catBox, title, dateF, note,
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Foto del momento"),
      photoPicker({ initialUrl: existing?.hasPhoto ? await photoUrl(existing.id) : undefined, onChange: (f) => { photo = f; } })),
    saveBtn,
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const cents = parseMoney(String(fd.get("amount") ?? ""));
    setFieldError(amount, null); setFieldError(dateF, null);
    if (!cents) { setFieldError(amount, "Escribe un importe mayor que cero, por ejemplo 12,50."); (amount.querySelector("input") as HTMLInputElement).focus(); return; }
    const d = String(fd.get("date") ?? "");
    if (!isValidYmd(d)) { setFieldError(dateF, "Elige una fecha."); return; }
    saveBtn.disabled = true;
    try {
      const blob = photo ? await compressImage(photo) : photo;
      const input = { type, amountCents: cents, categoryId: String(fd.get("category") ?? "") || null, title: String(fd.get("title") ?? ""), occurredOn: d, note: String(fd.get("note") ?? "") };
      if (existing) {
        await updateTransaction(existing.id, input, blob);
        forgetPhoto(existing.id);
        toast("Cambios guardados");
      } else {
        await addTransaction(input, blob);
        await markFirstStep("primer-movimiento");
        toast(type === "expense" ? "Gasto apuntado" : "Ingreso apuntado");
        if (type === "expense" && input.categoryId) {
          const lim = (await monthSummary(d.slice(0, 7))).limits.find((l) => l.category.id === input.categoryId);
          if (lim && lim.spentCents > lim.limitCents) toast(`Te has pasado del límite de ${lim.category.name}`, "danger");
          else if (lim && lim.spentCents >= lim.limitCents * 0.85) toast(`Llevas el ${Math.round((lim.spentCents / lim.limitCents) * 100)} % del límite de ${lim.category.name}`, "warning");
        }
      }
      go(returnTo);
    } catch (err) {
      toast(errorText(err), "danger");
      saveBtn.disabled = false;
    }
  });

  return screen({ title: existing ? "Editar movimiento" : "Nuevo movimiento", close: returnTo }, form);
}

/** Botón principal "Apuntar" (enlace a #/nuevo). */
export const newTxButton = (label = "Apuntar", href = "#/nuevo") =>
  h("a", { class: "btn btn-primary btn-lg", href }, icon(Plus), h("span", {}, label));
