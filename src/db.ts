import type { AiResult, Folder, Notebook, Page, Recording } from "./types";

const DB_NAME = "trazo";
const DB_VERSION = 1;

type StoreName = "folders" | "notebooks" | "pages" | "blobs" | "recordings" | "ai";
const STORES: StoreName[] = ["folders", "notebooks", "pages", "blobs", "recordings", "ai"];

/** Storage backend: IndexedDB when the browser allows it, otherwise memory (lost on close). */
interface Backend {
  getAll(name: StoreName): Promise<unknown[]>;
  get(name: StoreName, key: string): Promise<unknown>;
  put(name: StoreName, value: unknown, key?: string): Promise<void>;
  delete(name: StoreName, key: string): Promise<void>;
  byNotebook(name: StoreName, notebookId: string): Promise<unknown[]>;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}

async function idbBackend(): Promise<Backend> {
  const db = await withTimeout(
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore("folders", { keyPath: "id" });
        d.createObjectStore("notebooks", { keyPath: "id" });
        d.createObjectStore("pages", { keyPath: "id" }).createIndex("notebookId", "notebookId");
        d.createObjectStore("blobs");
        d.createObjectStore("recordings", { keyPath: "id" }).createIndex("notebookId", "notebookId");
        d.createObjectStore("ai", { keyPath: "id" }).createIndex("notebookId", "notebookId");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("blocked"));
    }),
    3000,
  );
  const store = (name: StoreName, mode: IDBTransactionMode = "readonly") => db.transaction(name, mode).objectStore(name);
  const backend: Backend = {
    getAll: (name) => wrap(store(name).getAll()),
    get: (name, key) => wrap(store(name).get(key)),
    put: async (name, value, key) => void (await wrap(store(name, "readwrite").put(value, key))),
    delete: async (name, key) => void (await wrap(store(name, "readwrite").delete(key))),
    byNotebook: (name, id) => wrap(store(name).index("notebookId").getAll(id)),
  };
  // Some embedded or private browsers open the database but refuse writes: check once.
  await withTimeout(backend.put("blobs", new Blob(["ok"]), "__probe__"), 3000);
  await backend.delete("blobs", "__probe__");
  return backend;
}

function memoryBackend(): Backend {
  const data = new Map<StoreName, Map<string, unknown>>(STORES.map((s) => [s, new Map()]));
  const clone = <T>(v: T): T => (v instanceof Blob ? v : structuredClone(v));
  return {
    getAll: async (name) => [...data.get(name)!.values()].map(clone),
    get: async (name, key) => {
      const v = data.get(name)!.get(key);
      return v === undefined ? undefined : clone(v);
    },
    put: async (name, value, key) => void data.get(name)!.set(key ?? (value as { id: string }).id, clone(value)),
    delete: async (name, key) => void data.get(name)!.delete(key),
    byNotebook: async (name, id) => [...data.get(name)!.values()].filter((v) => (v as { notebookId: string }).notebookId === id).map(clone),
  };
}

let backendPromise: Promise<Backend> | null = null;
/** True when notebooks only live in memory because the browser blocks storage. */
export let memoryOnly = false;
const memoryListeners: (() => void)[] = [];
export function onMemoryOnly(fn: () => void): void {
  if (memoryOnly) fn();
  else memoryListeners.push(fn);
}

function backend(): Promise<Backend> {
  if (!backendPromise) {
    backendPromise = (async () => {
      try {
        if (typeof indexedDB === "undefined") throw new Error("no indexedDB");
        return await idbBackend();
      } catch {
        memoryOnly = true;
        memoryListeners.splice(0).forEach((fn) => fn());
        return memoryBackend();
      }
    })();
  }
  return backendPromise;
}

const getAll = async <T>(name: StoreName) => (await (await backend()).getAll(name)) as T[];
const get = async <T>(name: StoreName, key: string) => (await (await backend()).get(name, key)) as T | undefined;
const put = async (name: StoreName, value: unknown, key?: string) => (await backend()).put(name, value, key);
const del = async (name: StoreName, key: string) => (await backend()).delete(name, key);
const byNotebook = async <T>(name: StoreName, id: string) => (await (await backend()).byNotebook(name, id)) as T[];

export const db = {
  folders: {
    all: () => getAll<Folder>("folders"),
    put: (f: Folder) => put("folders", f),
    delete: (id: string) => del("folders", id),
  },
  notebooks: {
    all: () => getAll<Notebook>("notebooks"),
    get: (id: string) => get<Notebook>("notebooks", id),
    put: (n: Notebook) => put("notebooks", n),
    delete: (id: string) => del("notebooks", id),
  },
  pages: {
    get: (id: string) => get<Page>("pages", id),
    put: (p: Page) => put("pages", p),
    delete: (id: string) => del("pages", id),
    ofNotebook: (id: string) => byNotebook<Page>("pages", id),
  },
  blobs: {
    get: (id: string) => get<Blob>("blobs", id),
    put: (id: string, b: Blob) => put("blobs", b, id),
    delete: (id: string) => del("blobs", id),
  },
  recordings: {
    put: (r: Recording) => put("recordings", r),
    delete: (id: string) => del("recordings", id),
    ofNotebook: (id: string) => byNotebook<Recording>("recordings", id),
  },
  ai: {
    put: (r: AiResult) => put("ai", r),
    delete: (id: string) => del("ai", id),
    ofNotebook: (id: string) => byNotebook<AiResult>("ai", id),
  },
};

export function uid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Deletes a notebook with every page, blob, recording and AI result it owns. */
export async function deleteNotebookDeep(nb: Notebook): Promise<void> {
  const pages = await db.pages.ofNotebook(nb.id);
  for (const p of pages) {
    if (p.backgroundBlobId) await db.blobs.delete(p.backgroundBlobId);
    for (const layer of p.layers)
      for (const it of layer.items) if (it.type === "image") await db.blobs.delete(it.blobId);
    await db.pages.delete(p.id);
  }
  for (const r of await db.recordings.ofNotebook(nb.id)) {
    await db.blobs.delete(r.blobId);
    await db.recordings.delete(r.id);
  }
  for (const a of await db.ai.ofNotebook(nb.id)) await db.ai.delete(a.id);
  await db.notebooks.delete(nb.id);
}
