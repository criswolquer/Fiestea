import type { AiResult, Folder, Notebook, Page, Recording } from "./types";

const DB_NAME = "trazo";
const DB_VERSION = 1;

type StoreName = "folders" | "notebooks" | "pages" | "blobs" | "recordings" | "ai";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("folders", { keyPath: "id" });
      db.createObjectStore("notebooks", { keyPath: "id" });
      const pages = db.createObjectStore("pages", { keyPath: "id" });
      pages.createIndex("notebookId", "notebookId");
      db.createObjectStore("blobs");
      const rec = db.createObjectStore("recordings", { keyPath: "id" });
      rec.createIndex("notebookId", "notebookId");
      const ai = db.createObjectStore("ai", { keyPath: "id" });
      ai.createIndex("notebookId", "notebookId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name: StoreName, mode: IDBTransactionMode = "readonly") {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

async function getAll<T>(name: StoreName): Promise<T[]> {
  return wrap((await store(name)).getAll()) as Promise<T[]>;
}

async function get<T>(name: StoreName, key: string): Promise<T | undefined> {
  return wrap((await store(name)).get(key)) as Promise<T | undefined>;
}

async function put(name: StoreName, value: unknown, key?: string): Promise<void> {
  await wrap((await store(name, "readwrite")).put(value, key));
}

async function del(name: StoreName, key: string): Promise<void> {
  await wrap((await store(name, "readwrite")).delete(key));
}

async function byNotebook<T>(name: "pages" | "recordings" | "ai", notebookId: string): Promise<T[]> {
  const s = await store(name);
  return wrap(s.index("notebookId").getAll(notebookId)) as Promise<T[]>;
}

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
  return crypto.randomUUID();
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
