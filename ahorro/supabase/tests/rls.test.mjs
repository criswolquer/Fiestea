// Pruebas de la migración con un Postgres local (PGlite): reglas de acceso, códigos y sincronización.
// Ejecutar: npm run test:db
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const here = new URL(".", import.meta.url);
const migrations = new URL("../migrations/", import.meta.url);
const db = new PGlite();
await db.exec(fs.readFileSync(new URL("supabase-stub.sql", here), "utf8"));
for (const f of fs.readdirSync(migrations).sort()) await db.exec(fs.readFileSync(new URL(f, migrations), "utf8"));

const newUser = async () => { const id = randomUUID(); await db.query("insert into auth.users values ($1)", [id]); return id; };
/** Ejecuta como un usuario con sesión (rol authenticated), igual que PostgREST. */
async function as(uid, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated; set local request.jwt.claim.sub = '${uid}'`);
    return (await tx.query(sql, params)).rows;
  });
}
const rec = (store, id, data, updated_at = new Date().toISOString(), deleted = false) => ({ store, id, data, updated_at, deleted });
const push = (uid, rows) => as(uid, "select public.push_records($1::jsonb) as n", [JSON.stringify(rows)]);
const pull = (uid, after = 0) => as(uid, "select * from public.pull_records($1, 500)", [after]);
const rejects = async (p, re) => assert.match(String((await p.then(() => "no falló", (e) => e.message))), re);

const A = await newUser(), B = await newUser(), C = await newUser(), D = await newUser(), E = await newUser();
let recovery;

test("crear espacio devuelve un código de recuperación de 20 caracteres", async () => {
  const [{ create_space: r }] = await as(A, "select public.create_space()");
  recovery = r.recovery_code;
  assert.match(recovery, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
  await rejects(as(A, "select public.create_space()"), /ya_tiene_espacio/);
});

test("subir y bajar registros", async () => {
  const [{ n }] = await push(A, [rec("transactions", "t1", { amountCents: 1250, title: "Menú" }), rec("categories", "c1", { name: "Comida" })]);
  assert.equal(n, 2);
  const rows = await pull(A);
  assert.deepEqual(rows.map((r) => r.id).sort(), ["c1", "t1"]);
  const after = rows.at(-1).seq;
  await push(A, [rec("transactions", "t1", { amountCents: 1300 })]);
  const delta = await pull(A, after);
  assert.equal(delta.length, 1);
  assert.equal(delta[0].data.amountCents, 1300);
});

test("gana el cambio más reciente", async () => {
  await push(A, [rec("notes", "n1", { text: "nuevo" }, "2026-11-13T10:00:00Z")]);
  await push(A, [rec("notes", "n1", { text: "viejo" }, "2026-11-13T09:00:00Z")]);
  const [n] = await as(A, "select data from public.records where id = 'n1'");
  assert.equal(n.data.text, "nuevo");
});

test("otro dispositivo sin emparejar no ve nada", async () => {
  await as(B, "select public.create_space()");
  assert.equal((await pull(B)).length, 0);
  assert.equal((await as(B, "select * from public.records")).length, 0);
  assert.equal((await as(B, "select * from public.spaces")).length, 1);
  const [{ my_space: sA }] = await as(A, "select public.my_space()");
  await rejects(as(B, "insert into public.records (space_id, store, id, data, updated_at) values ($1, 'notes', 'x', '{}', now())", [sA]), /row-level security/);
  await as(B, "update public.records set data = '{\"hack\":1}'");
  const [n] = await as(A, "select data from public.records where id = 'n1'");
  assert.equal(n.data.text, "nuevo");
});

test("sin sesión no se puede llamar a nada", async () => {
  await rejects(db.transaction(async (tx) => { await tx.exec("set local role anon"); await tx.query("select public.create_space()"); }), /permission denied/);
});

test("código de emparejar: une una vez y caduca al usarse", async () => {
  const [{ create_pair_code: p }] = await as(A, "select public.create_pair_code()");
  assert.match(p.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await as(C, "select public.join_space($1)", [p.code.toLowerCase().replace("-", " ")]);
  assert.ok((await pull(C)).some((r) => r.id === "t1"));
  assert.equal((await as(D, "select public.join_space($1)", [p.code]))[0].join_space, null);
});

test("código de recuperación: entra un móvil nuevo", async () => {
  await as(E, "select public.join_space($1)", [recovery]);
  assert.ok((await pull(E)).some((r) => r.id === "t1"));
});

test("un código erróneo falla y hay límite de intentos", async () => {
  for (let i = 0; i < 9; i++) assert.equal((await as(D, "select public.join_space('AAAA-BBBB')"))[0].join_space, null);
  await rejects(as(D, "select public.join_space($1)", [recovery]), /demasiados_intentos/);
});

test("nuevo código de recuperación invalida el anterior", async () => {
  const [{ new_recovery_code: fresh }] = await as(A, "select public.new_recovery_code()");
  const F = await newUser();
  assert.equal((await as(F, "select public.join_space($1)", [recovery]))[0].join_space, null);
  await as(F, "select public.join_space($1)", [fresh]);
  recovery = fresh;
});

test("fotos: cada espacio solo ve su carpeta", async () => {
  const [{ my_space: sA }] = await as(A, "select public.my_space()");
  const [{ my_space: sB }] = await as(B, "select public.my_space()");
  await as(A, "insert into storage.objects (bucket_id, name) values ('fotos', $1)", [`${sA}/t1.jpg`]);
  await rejects(as(B, "insert into storage.objects (bucket_id, name) values ('fotos', $1)", [`${sA}/x.jpg`]), /row-level security/);
  assert.equal((await as(B, "select * from storage.objects")).length, 0);
  assert.equal((await as(C, "select * from storage.objects")).length, 1);
  await as(B, "insert into storage.objects (bucket_id, name) values ('fotos', $1)", [`${sB}/y.jpg`]);
});

test("lotes y datos no válidos se rechazan", async () => {
  await rejects(push(A, [rec("otra_cosa", "x", {})]), /records_store_check/);
  await rejects(push(A, Array.from({ length: 501 }, (_, i) => rec("notes", `m${i}`, {}))), /lote_no_valido/);
});

test("borrar el espacio lo borra todo", async () => {
  await as(A, "select public.delete_my_space()");
  const [{ count }] = (await db.query("select count(*)::int as count from public.records r join public.spaces s on s.id = r.space_id where s.recovery_hash = public.hash_code($1)", [recovery])).rows;
  assert.equal(count, 0);
  assert.equal((await pull(C)).length, 0);
  assert.equal((await as(A, "select public.my_space()"))[0].my_space, null);
});
