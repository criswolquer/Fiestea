// Lectura de extractos bancarios (Excel .xlsx o .csv) en el propio navegador, sin librerías ni servidor.
// Reconoce las columnas por su nombre
// (Fecha, Concepto, Importe, Disponible…), así que sirve para la mayoría de bancos.
import type { Ymd } from "./types";

export interface StatementRow {
  date: Ymd;
  concept: string;
  detail: string;             // «Pago con tarjeta», observaciones…
  amountCents: number;        // con signo: negativo = sale dinero
  balanceCents?: number;      // saldo después del movimiento, si el banco lo da
}
export interface Statement { rows: StatementRow[]; columns: string[]; skipped: number }

/* --- ZIP mínimo (un .xlsx es un zip de XML) --- */
async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf); const b = new Uint8Array(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("no-zip");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra + comment;
    if (!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml|workbook\.xml|styles\.xml)$/.test(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = b.subarray(start, start + size);
    if (method === 0) out.set(name, data);
    else if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      out.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
    }
  }
  return out;
}

const xml = (bytes?: Uint8Array) => (bytes ? new DOMParser().parseFromString(new TextDecoder().decode(bytes), "application/xml") : null);
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

async function readXlsx(buf: ArrayBuffer): Promise<(string | number)[][]> {
  const files = await unzip(buf);
  const shared = [...(xml(files.get("xl/sharedStrings.xml"))?.getElementsByTagName("si") ?? [])].map((si) =>
    [...si.getElementsByTagName("t")].map((t) => t.textContent ?? "").join(""));
  const sheetName = [...files.keys()].filter((k) => k.includes("worksheets/")).sort()[0];
  const sheet = xml(files.get(sheetName));
  if (!sheet) throw new Error("sin-hoja");
  const rows: (string | number)[][] = [];
  for (const r of [...sheet.getElementsByTagName("row")]) {
    const row: (string | number)[] = [];
    for (const c of [...r.getElementsByTagName("c")]) {
      const t = c.getAttribute("t"); const raw = c.getElementsByTagName("v")[0]?.textContent ?? "";
      const val = t === "s" ? shared[Number(raw)] ?? "" : t === "inlineStr" ? [...c.getElementsByTagName("t")].map((x) => x.textContent).join("")
        : t === "str" || t === "b" ? raw : raw === "" ? "" : Number(raw);
      row[colIndex(c.getAttribute("r") ?? "A")] = val;
    }
    rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rows;
}

function readCsv(text: string): string[][] {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const sep = [";", "\t", ","].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* --- Interpretar valores --- */
export function parseAmount(v: string | number): number | null {
  if (typeof v === "number") return Math.round(v * 100);
  let s = v.replace(/[€\s ]|EUR/gi, "").replace(/−/g, "-");
  if (!s) return null;
  if (/^\(.*\)$/.test(s)) s = "-" + s.slice(1, -1);
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
export function parseDate(v: string | number): Ymd | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (typeof v === "number" && v > 20000 && v < 80000) {           // fecha de Excel (días desde 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) { const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]); return `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** Lee un extracto. Lanza un Error con un mensaje para la persona si no lo entiende. */
export async function readStatement(file: File): Promise<Statement> {
  if (file.size > 10 * 1024 * 1024) throw new Error("El archivo es demasiado grande (más de 10 MB).");
  const isXlsx = /\.xlsx$/i.test(file.name) || file.type.includes("spreadsheetml");
  if (/\.xls$/i.test(file.name)) throw new Error("Ese Excel es del formato antiguo (.xls). Descárgalo como .xlsx o como CSV.");
  let grid: (string | number)[][];
  try { grid = isXlsx ? await readXlsx(await file.arrayBuffer()) : readCsv(await file.text()); }
  catch { throw new Error("No se ha podido leer el archivo. Prueba a descargarlo de nuevo como Excel (.xlsx) o CSV."); }

  // Fila de cabecera: la primera con una columna de fecha y otra de importe (o cargo/abono).
  const hi = grid.findIndex((r) => r.some((c) => /fecha/i.test(String(c))) && r.some((c) => /importe|cantidad|cargo|abono/i.test(String(c))));
  if (hi < 0) throw new Error("No encuentro las columnas de fecha e importe. ¿Es el extracto de movimientos de tu banco?");
  const head = grid[hi].map((c) => norm(String(c)));
  const find = (...res: RegExp[]) => { for (const re of res) { const i = head.findIndex((h) => re.test(h)); if (i >= 0) return i; } return -1; };
  const cDate = find(/^fecha$/, /^fechaoperacion/, /^fecha/, /valor/);
  const cConcept = find(/^concepto/, /descripcion/, /^detalle/, /comercio/);
  const cMove = find(/^movimiento/, /^tipo/);
  const cObs = find(/observ/, /^notas?$/, /referencia/);
  const cAmount = find(/^importe/, /cantidad/);
  const cDebit = find(/^cargo/, /^debe/), cCredit = find(/^abono/, /^haber/);
  const cBalance = find(/^disponible/, /^saldo/);
  if (cDate < 0 || (cAmount < 0 && cDebit < 0)) throw new Error("No encuentro las columnas de fecha e importe.");

  const rows: StatementRow[] = []; let skipped = 0;
  for (const r of grid.slice(hi + 1)) {
    if (!r.some((c) => String(c).trim())) continue;
    const date = parseDate(r[cDate] ?? "");
    let amount = cAmount >= 0 ? parseAmount(r[cAmount] ?? "") : null;
    if (amount === null && cDebit >= 0) {
      const d = parseAmount(r[cDebit] ?? "") ?? 0, c = cCredit >= 0 ? parseAmount(r[cCredit] ?? "") ?? 0 : 0;
      amount = c - Math.abs(d);
    }
    if (!date || !amount) { skipped++; continue; }
    const concept = String(cConcept >= 0 ? r[cConcept] : r[cMove] ?? "").replace(/\s+/g, " ").trim();
    const detail = [cMove >= 0 && cMove !== cConcept ? r[cMove] : "", cObs >= 0 ? r[cObs] : ""].map((x) => String(x ?? "").trim()).filter(Boolean).join(" · ");
    const balance = cBalance >= 0 ? parseAmount(r[cBalance] ?? "") ?? undefined : undefined;
    rows.push({ date, concept: concept || detail || "Movimiento", detail, amountCents: amount, balanceCents: balance });
  }
  if (!rows.length) throw new Error("El archivo no tiene movimientos que pueda leer.");
  return { rows, columns: grid[hi].map(String), skipped };
}

export const conceptKey = norm;

/** Huella de cada fila para no importarla dos veces (n = repeticiones idénticas en el mismo archivo). */
export function importKeys(accountId: string, rows: StatementRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${accountId}|${r.date}|${r.amountCents}|${norm(r.concept)}`;
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    return `${base}|${n}`;
  });
}

/** Pistas por palabras del concepto → clave de icono de categoría (ver ui/caticons.ts). */
export const KEYWORDS: [RegExp, string][] = [
  [/mercadona|carrefour|lidl|aldi|alcampo|eroski|consum|hipercor|supercor|\bdia\b|ahorramas|bonpreu|condis|supermerc/i, "compra"],
  [/glovo|just ?eat|uber ?eats|deliveroo|restaur|\bbar\b|cafe|burger|mcdonald|telepizza|vips|foster|starbucks|taberna|cerveceria/i, "comida"],
  [/renfe|metro|emt|tmb|cabify|uber(?! ?eats)|bolt|freenow|blablacar|alsa|gasolin|repsol|cepsa|galp|bp |shell|parking|peaje/i, "transporte"],
  [/netflix|spotify|hbo|max\b|disney|prime video|amazon prime|apple\.com|icloud|youtube|dazn|movistar\+|filmin/i, "suscripciones"],
  [/alquiler|hipoteca|comunidad/i, "casa"], [/iberdrola|endesa|naturgy|holaluz|aguas|canal de isabel|totalenergies/i, "luz"],
  [/vodafone|movistar|orange|yoigo|digi|pepephone|masmovil|o2 /i, "movil"], [/farmacia|clinica|dentist|hospital|sanitas|adeslas/i, "salud"],
  [/zara|primark|h&m|pull ?&? ?bear|bershka|mango|decathlon|zalando|shein/i, "ropa"], [/gimnasio|gym|basic ?fit|dreamfit|altafit|padel/i, "deporte"],
  [/cine|yelmo|cinesa|ticketmaster|entradas|concierto|teatro/i, "ocio"], [/ryanair|vueling|iberia|booking|airbnb|renfe ave|hotel/i, "viajes"],
  [/nomina|nómina|salario|sueldo|haberes/i, "nomina"], [/prestamo|préstamo|financiacion|cuota/i, "prestamos"],
];
/** ¿Parece una transferencia a una cuenta propia o a inversión? */
export const looksLikeTransfer = (r: StatementRow) => /transferencia|traspaso|trans\.|envio a|bizum enviado a mi/i.test(`${r.concept} ${r.detail}`) && !/nomina|nómina/i.test(r.concept);
