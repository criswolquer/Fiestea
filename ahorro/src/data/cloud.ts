// Guardado en la nube (Supabase) sin cuentas: el dispositivo entra como usuario anónimo,
// pertenece a un «espacio» y sube y baja registros. La app sigue funcionando entera sin
// conexión: lo apuntado se queda en `outbox` hasta que se puede subir.
import type { SupabaseClient } from "@supabase/supabase-js";
import * as db from "./db";
import type { OutboxEntry, Store } from "./db";

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudConfigured = () => !!(URL_ && KEY_);

const BUCKET = "fotos";
const PAGE = 500;

interface Meta { spaceId?: string; cursor: number; lastSyncAt?: string; recoveryCode?: string; lastError?: string }
export interface CloudStatus {
  configured: boolean; linked: boolean; online: boolean; syncing: boolean; pending: number;
  lastSyncAt?: string; error?: string; recoveryCode?: string; sessionLost: boolean;
}

let client: SupabaseClient | null = null;
async function sb(): Promise<SupabaseClient> {
  if (!cloudConfigured()) throw new Error("La nube no está configurada.");
  if (!client) {
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(URL_!, KEY_!, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "ahorro.sesion" } });
  }
  return client;
}

const getMeta = async (): Promise<Meta> => ({ cursor: 0, ...((await db.get<Meta>("meta", "cloud")) ?? {}) });
const setMeta = async (patch: Partial<Meta>) => db.write([{ store: "meta", key: "cloud", value: { ...(await getMeta()), ...patch } }]);

let syncing = false;
let sessionLost = false;
const listeners = new Set<() => void>();
export const onCloudChange = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((f) => f());

export async function cloudStatus(): Promise<CloudStatus> {
  const m = await getMeta();
  const pending = (await db.getAll<OutboxEntry>("outbox")).length;
  return { configured: cloudConfigured(), linked: !!m.spaceId, online: navigator.onLine, syncing, pending, lastSyncAt: m.lastSyncAt,
    error: m.lastError, recoveryCode: m.recoveryCode, sessionLost };
}

/** Nombres de error del servidor → frases para la persona. */
function friendly(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/demasiados_intentos/.test(msg)) return "Demasiados intentos. Espera una hora y vuelve a probar.";
  if (/ya_tiene_espacio/.test(msg)) return "Este móvil ya está enlazado.";
  if (/anonymous.*disabled|Anonymous sign-ins are disabled/i.test(msg)) return "Falta activar el acceso anónimo en Supabase (Authentication → Sign In / Providers).";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Sin conexión con la nube.";
  return "No se ha podido conectar con la nube.";
}

async function ensureSession(): Promise<string> {
  const c = await sb();
  const { data } = await c.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: d, error } = await c.auth.signInAnonymously();
  if (error || !d.user) throw error ?? new Error("sin_sesion");
  return d.user.id;
}

/** Mete en la cola todo lo que ya hay en el dispositivo (al enlazarlo por primera vez). */
async function enqueueEverything(): Promise<void> {
  const at = new Date().toISOString();
  const ops: db.Write[] = [];
  for (const s of db.SYNCED) for (const [key] of await db.entries(s)) ops.push({ store: "outbox", key: db.outboxKey(s, key), value: { store: s, key, at } satisfies OutboxEntry });
  if (ops.length) await db.write(ops, { fromRemote: true });
}

/** Primer dispositivo: crea el espacio y guarda el código de recuperación para enseñarlo. */
export async function enableCloud(): Promise<void> {
  if (!cloudConfigured() || (await getMeta()).spaceId) return;
  await ensureSession();
  const c = await sb();
  const { data, error } = await c.rpc("create_space");
  if (error) throw new Error(friendly(error));
  await setMeta({ spaceId: data.space_id, recoveryCode: data.recovery_code, cursor: 0, lastError: undefined });
  await enqueueEverything();
  emit();
  await syncNow();
}

/** Otro dispositivo: se une con un código de emparejar o de recuperación y baja todo. */
export async function joinWithCode(code: string): Promise<void> {
  if (!code.replace(/[^A-Za-z0-9]/g, "")) throw new Error("Escribe el código.");
  await ensureSession();
  const c = await sb();
  const { data, error } = await c.rpc("join_space", { code });
  if (error) throw new Error(friendly(error));
  if (!data) throw new Error("Ese código no vale. Revisa que esté bien escrito o crea uno nuevo en el otro móvil.");
  sessionLost = false;
  await setMeta({ spaceId: data, cursor: 0, recoveryCode: undefined, lastError: undefined });
  await enqueueEverything();     // lo que hubiera en este móvil se junta con lo del espacio
  emit();
  await syncNow();
}

export async function createPairCode(): Promise<{ code: string; expiresAt: string }> {
  await ensureSession();
  const { data, error } = await (await sb()).rpc("create_pair_code");
  if (error) throw new Error(friendly(error));
  return { code: data.code, expiresAt: data.expires_at };
}

export async function newRecoveryCode(): Promise<string> {
  await ensureSession();
  const { data, error } = await (await sb()).rpc("new_recovery_code");
  if (error) throw new Error(friendly(error));
  await setMeta({ recoveryCode: data });
  emit();
  return data as string;
}

export async function forgetRecoveryCode(): Promise<void> { await setMeta({ recoveryCode: undefined }); emit(); }

/** Borra el espacio en la nube (todos sus dispositivos) y deja este móvil sin enlazar. */
export async function deleteCloudData(): Promise<void> {
  const m = await getMeta();
  if (!cloudConfigured() || !m.spaceId) return;
  const c = await sb();
  const { data: files } = await c.storage.from(BUCKET).list(m.spaceId, { limit: 1000 });
  if (files?.length) await c.storage.from(BUCKET).remove(files.map((f) => `${m.spaceId}/${f.name}`));
  const { error } = await c.rpc("delete_my_space");
  if (error) throw new Error(friendly(error));
  await c.auth.signOut();
}

/* Sincronización ------------------------------------------------------------------- */
let pendingRun: Promise<void> | null = null;
/** Sube lo pendiente y baja lo nuevo. Si ya hay una en marcha, espera a esa. */
export function syncNow(): Promise<void> {
  if (!pendingRun) pendingRun = run().finally(() => { pendingRun = null; });
  return pendingRun;
}

async function run(): Promise<void> {
  const m = await getMeta();
  if (!cloudConfigured() || !m.spaceId || !navigator.onLine) { emit(); return; }
  syncing = true; emit();
  try {
    const c = await sb();
    const { data: s } = await c.auth.getSession();
    if (!s.session) { sessionLost = true; return; }   // se borraron los datos del navegador: hace falta el código
    await push(c, m.spaceId);
    await pull(c);
    await setMeta({ lastSyncAt: new Date().toISOString(), lastError: undefined });
  } catch (e) {
    console.warn("Sincronización", e);
    await setMeta({ lastError: friendly(e) });
  } finally {
    syncing = false; emit();
  }
}

async function push(c: SupabaseClient, spaceId: string): Promise<void> {
  const queue = await db.getAll<OutboxEntry>("outbox");
  for (let i = 0; i < queue.length; i += 200) {
    const batch = queue.slice(i, i + 200);
    const rows = [];
    for (const e of batch) {
      const value = await db.get<unknown>(e.store, e.key);
      if (e.store === "photos") {
        const path = `${spaceId}/${e.key}.jpg`;
        if (value) {
          const { error } = await c.storage.from(BUCKET).upload(path, value as Blob, { upsert: true, contentType: "image/jpeg" });
          if (error) throw error;
        } else {
          await c.storage.from(BUCKET).remove([path]);
        }
        rows.push({ store: "photos", id: e.key, data: { path }, deleted: !value, updated_at: e.at });
      } else {
        rows.push({ store: e.store, id: e.key, data: value ?? {}, deleted: value === undefined, updated_at: e.at });
      }
    }
    const { error } = await c.rpc("push_records", { rows });
    if (error) throw error;
    // Quita de la cola solo lo que no ha vuelto a cambiar mientras subía.
    const now = await Promise.all(batch.map((e) => db.get<OutboxEntry>("outbox", db.outboxKey(e.store, e.key))));
    const done = batch.filter((e, j) => now[j]?.at === e.at);
    if (done.length) await db.write([
      ...done.map((e) => ({ store: "outbox" as Store, key: db.outboxKey(e.store, e.key), del: true })),
      // Versión de cada foto subida: así este móvil no vuelve a bajarse sus propias fotos.
      ...done.filter((e) => e.store === "photos").map((e) => ({ store: "meta" as Store, key: `foto:${e.key}`, value: e.at })),
    ], { fromRemote: true });
  }
}

async function pull(c: SupabaseClient): Promise<void> {
  for (;;) {
    const m = await getMeta();
    const { data, error } = await c.rpc("pull_records", { after_seq: m.cursor, max_rows: PAGE });
    if (error) throw error;
    const rows = (data ?? []) as { store: Store; id: string; data: Record<string, unknown>; deleted: boolean; updated_at: string; seq: number }[];
    if (!rows.length) return;
    const ops: db.Write[] = [];
    for (const r of rows) {
      const pending = await db.get<OutboxEntry>("outbox", db.outboxKey(r.store, r.id));
      if (pending && pending.at > r.updated_at) continue;          // lo de este móvil es más nuevo: se subirá
      if (r.deleted) { ops.push({ store: r.store, key: r.id, del: true }); continue; }
      if (r.store === "photos") {
        if ((await db.get<string>("meta", `foto:${r.id}`)) === r.updated_at) continue;   // ya la tiene
        const { data: blob } = await c.storage.from(BUCKET).download(String(r.data.path));
        if (blob) ops.push({ store: "photos", key: r.id, value: blob }, { store: "meta", key: `foto:${r.id}`, value: r.updated_at });
        continue;
      }
      ops.push({ store: r.store, value: r.data });
    }
    ops.push({ store: "meta", key: "cloud", value: { ...m, cursor: rows[rows.length - 1].seq } });
    await db.write(ops, { fromRemote: true });
    if (ops.length > 1) changedFromRemote = true;
    if (rows.length < PAGE) return;
  }
}

/* Arranque automático ----------------------------------------------------------------- */
let changedFromRemote = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Sincroniza sola: al abrir, al volver la conexión, tras cada cambio (con un respiro) y cada minuto. */
export function startAutoSync(onRemoteChanges: () => void): void {
  if (!cloudConfigured()) return;
  db.setOnLocalChange(() => { clearTimeout(timer); timer = setTimeout(() => syncNow(), 1500); emit(); });
  const tick = async () => {
    changedFromRemote = false;
    await syncNow();
    if (changedFromRemote) onRemoteChanges();
  };
  window.addEventListener("online", tick);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); else syncNow(); });
  setInterval(() => { if (document.visibilityState === "visible") tick(); }, 60_000);
  tick();
}
