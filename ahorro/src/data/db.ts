// Almacenamiento local: IndexedDB. Si el navegador no lo permite (modo privado
// antiguo, pruebas), cae a memoria y lo avisa con storageMode().

export type Store =
  | "settings" | "categories" | "transactions" | "photos" | "pots" | "potMovements"
  | "monthPlans" | "notes" | "reminders" | "monthRecaps" | "reflections" | "assistantMessages" | "usage";

const DB_NAME = "ahorro";
const DB_VERSION = 1;

const SCHEMA: Record<Store, { key?: string; indexes?: string[] }> = {
  settings: { key: "id" },
  categories: { key: "id" },
  transactions: { key: "id", indexes: ["occurredOn"] },
  photos: {},                                   // clave = id de la transacción, valor = Blob
  pots: { key: "id" },
  potMovements: { key: "id", indexes: ["potId", "occurredOn"] },
  monthPlans: { key: "month" },
  notes: { key: "id", indexes: ["onDate"] },
  reminders: { key: "id" },
  monthRecaps: { key: "month" },
  reflections: { key: "id", indexes: ["month"] },
  assistantMessages: { key: "id", indexes: ["createdAt"] },
  usage: {},
};
export const STORES = Object.keys(SCHEMA) as Store[];

let dbp: Promise<IDBDatabase | null> | null = null;
let mode: "indexeddb" | "memory" = "indexeddb";
const mem = new Map<Store, Map<string, unknown>>();

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise<IDBDatabase | null>((done) => {
    let settled = false;
    const resolve = (v: IDBDatabase | null) => { if (!settled) { settled = true; done(v); } };
    let r: IDBOpenDBRequest;
    try { r = indexedDB.open(DB_NAME, DB_VERSION); } catch { mode = "memory"; return resolve(null); }
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of STORES) {
        if (d.objectStoreNames.contains(s)) continue;
        const os = d.createObjectStore(s, SCHEMA[s].key ? { keyPath: SCHEMA[s].key } : undefined);
        for (const ix of SCHEMA[s].indexes ?? []) os.createIndex(ix, ix);
      }
    };
    r.onsuccess = () => {
      const d = r.result;
      d.onversionchange = () => { d.close(); dbp = null; };
      d.onclose = () => { dbp = null; };   // Safari cierra la conexión con la app en segundo plano
      resolve(d);
    };
    r.onerror = () => { mode = "memory"; resolve(null); };
    r.onblocked = () => { mode = "memory"; resolve(null); };
    setTimeout(() => { if (!settled) { mode = "memory"; resolve(null); } }, 5000);
  });
  return dbp;
}

const memStore = (s: Store) => { if (!mem.has(s)) mem.set(s, new Map()); return mem.get(s)!; };
const keyOf = (s: Store, v: unknown, key?: string) => key ?? String((v as Record<string, unknown>)[SCHEMA[s].key!]);

export const storageMode = () => mode;

export async function getAll<T>(s: Store): Promise<T[]> {
  const d = await open();
  if (!d) return [...memStore(s).values()] as T[];
  return req(d.transaction(s).objectStore(s).getAll()) as Promise<T[]>;
}

export async function get<T>(s: Store, key: string): Promise<T | undefined> {
  const d = await open();
  if (!d) return memStore(s).get(key) as T | undefined;
  return req(d.transaction(s).objectStore(s).get(key)) as Promise<T | undefined>;
}

/** Valores de un índice entre from y to (incluidos). */
export async function range<T>(s: Store, index: string, from: string, to: string): Promise<T[]> {
  const d = await open();
  if (!d) return [...memStore(s).values()].filter((v) => { const x = String((v as Record<string, unknown>)[index]); return x >= from && x <= to; }) as T[];
  return req(d.transaction(s).objectStore(s).index(index).getAll(IDBKeyRange.bound(from, to))) as Promise<T[]>;
}

export interface Write { store: Store; value?: unknown; key?: string; del?: boolean }

/** Varias escrituras en una sola transacción: o se guardan todas o ninguna. */
export async function write(ops: Write[]): Promise<void> {
  const d = await open();
  if (!d) {
    for (const o of ops) {
      if (o.del) memStore(o.store).delete(o.key!);
      else memStore(o.store).set(keyOf(o.store, o.value, o.key), o.value);
    }
    return;
  }
  const names = [...new Set(ops.map((o) => o.store))];
  const tx = d.transaction(names, "readwrite");
  for (const o of ops) {
    const os = tx.objectStore(o.store);
    if (o.del) os.delete(o.key!);
    else if (SCHEMA[o.store].key) os.put(o.value);
    else os.put(o.value, o.key);
  }
  await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error("abort")); });
}

export const put = (store: Store, value: unknown, key?: string) => write([{ store, value, key }]);
export const del = (store: Store, key: string) => write([{ store, key, del: true }]);

export async function clearAll(): Promise<void> {
  const d = await open();
  if (!d) { mem.clear(); return; }
  const tx = d.transaction(STORES, "readwrite");
  for (const s of STORES) tx.objectStore(s).clear();
  await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

/** Lista todas las claves y valores (para la copia de seguridad). */
export async function entries(s: Store): Promise<[string, unknown][]> {
  const d = await open();
  if (!d) return [...memStore(s).entries()];
  const os = d.transaction(s).objectStore(s);
  const [keys, vals] = await Promise.all([req(os.getAllKeys()), req(os.getAll())]);
  return keys.map((k, i) => [String(k), vals[i]]);
}
