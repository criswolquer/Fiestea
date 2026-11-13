import { getPhoto } from "../data/repo";

export const go = (hash: string) => { location.hash = hash; };
export const back = (fallback = "#/") => { if (history.length > 1 && document.referrer !== "about:blank") history.back(); else go(fallback); };

/** Reduce la foto a 1280 px de lado y JPEG 0,8 (unos 150-250 KB). */
export async function compressImage(file: Blob, max = 1280): Promise<Blob> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("No se ha podido leer esa imagen."); }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No se ha podido guardar la foto."))), "image/jpeg", 0.8));
}

/** URL de la foto de un movimiento (cacheada mientras dura la sesión). */
const urls = new Map<string, string>();
export async function photoUrl(txId: string): Promise<string | undefined> {
  if (urls.has(txId)) return urls.get(txId);
  const b = await getPhoto(txId);
  if (!b) return undefined;
  const u = URL.createObjectURL(b);
  urls.set(txId, u);
  return u;
}
export function forgetPhoto(txId: string): void { const u = urls.get(txId); if (u) URL.revokeObjectURL(u); urls.delete(txId); }

export function download(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Algo ha fallado. Inténtalo otra vez.";
}

/** Lee un FormData como objeto de strings. */
export const formValues = (f: HTMLFormElement) => Object.fromEntries([...new FormData(f).entries()].map(([k, v]) => [k, String(v)]));

export const centsToInput = (c: number) => (c / 100).toLocaleString("es-ES", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2, useGrouping: false });

export function applyTheme(t: "system" | "light" | "dark"): void {
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", bg));
}
