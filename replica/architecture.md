# Architecture: «ahorro» (nombre provisional; replica-brand pondrá el definitivo), una web móvil con las funciones principales de INVEROOS

Fuente: `replica/recon.md` y `replica/features.csv` (2026-11-13).
Requisitos: lo más sencillo posible, que funcione en tu ordenador y no cueste nada hasta que decidas lanzar.

## La decisión principal: sin servidor hasta que haga falta

El original guarda los datos en el móvil y los sincroniza con una cuenta. Las fotos nunca
salen del dispositivo (privacidad §2, términos §8). Así que el clon puede empezar **solo con la
parte del dispositivo**: una PWA con IndexedDB, sin cuentas, sin base de datos en un servidor,
sin hosting y sin pagos. Es la misma arquitectura que **Trazo**, que ya está en este repo y ya
conoces. Las cuentas, la sincronización y Stripe llegan en las fases 4 y 5, y solo si las
quieres. El esquema SQL de esas fases ya está escrito (`replica/schema.sql`) para que los datos
locales tengan desde el día 1 la forma que tendrán en el servidor.

Coste hasta la fase 3 incluida: **0 €**. La única excepción es opcional: el asistente con IA usa
tu propia clave de la API de Claude (se paga por uso). Viene apagado y la app funciona entera sin él.

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | **Vite + TypeScript, sin framework** (como Trazo) | ya lo usas en este repo; `npm run dev` y listo; sin React no hay nada más que aprender |
| styling | CSS propio con variables (tokens de replica-design) en un `style.css` | igual que Trazo; Tailwind no hace falta para unas 20 pantallas |
| app móvil | **PWA instalable** (manifest + service worker) | "web para el móvil"; se añade a la pantalla de inicio y funciona sin conexión |
| database | **IndexedDB en el navegador** (capa `db.ts` como la de Trazo) | gratis, sin conexión, los datos no salen del móvil |
| fotos | **IndexedDB, como Blob** comprimido a JPEG de unos 1280 px | como el original: solo en el dispositivo |
| gráficos | **SVG escrito a mano** (anillos, donut, barras) | 3 tipos de gráfico no justifican una librería |
| PDF | **jsPDF** (ya en Trazo) | genera el PDF en el navegador, sin servidor |
| IA (opcional) | **SDK de Anthropic en el navegador con la clave del usuario en Ajustes** (como `src/ai.ts` de Trazo) | sin servidor ni cuenta propia; apagado por defecto |
| dictado | **Web Speech API** | gratis y en el navegador; en Safari funciona, pero es irregular: el texto siempre se puede escribir |
| auth | ninguna (fases 1-3) → **Supabase Auth** (fase 4) | sin cuentas no hay nada que proteger en un servidor |
| sincronización | exportar e importar una copia JSON (fase 2) → **Supabase Postgres** (fase 4) | la copia evita perder datos sin pagar nada |
| payments | ninguno → **Stripe Checkout + Billing en modo prueba** (fase 5) | gratis en modo prueba |
| email | ninguno → Supabase Auth manda los de la cuenta (fase 4) | no hay correos propios en el original |
| jobs | ninguno: todo se calcula **al abrir la app** (recap, rachas, recordatorios) | sin servidor no hay cron; el original también depende de abrir la app |
| hosting | **tu ordenador** (`npm run dev -- --host`, y el móvil en la misma wifi) → GitHub Pages gratis, como Trazo | cero coste; el despliegue es cosa de replica-deploy |

Ubicación: una carpeta nueva **`ahorro/`** en la raíz del repo, con su propio `package.json`.
Así no se mezcla con Trazo ni con su despliegue (el workflow `deploy.yml` construye solo la raíz).
Se renombra cuando haya marca.

Para arrancarla en tu ordenador:

```bash
cd ahorro
npm install
npm run dev -- --host     # abre http://localhost:5173, o desde el móvil la IP de tu ordenador
```

Aviso: el service worker y la cámara exigen HTTPS o `localhost`. Desde el móvil por IP, la cámara
cae al selector de archivos (que también deja hacer la foto) y el modo sin conexión no se activa.
Para probar todo en el móvil, usa la vista previa con HTTPS de la fase 2 (abajo).

## Almacenes locales (IndexedDB, fases 1-3)

Mismos campos que `schema.sql`, en camelCase. Dinero en **céntimos enteros**. Fechas del
calendario como texto **`YYYY-MM-DD` local** (el día que ve el usuario, sin zona horaria).
Instantes como ISO UTC. Ids con `crypto.randomUUID()`. En cada registro, `updatedAt` y `deletedAt`
(borrado blando) para poder sincronizar en la fase 4 sin rehacer nada.

| store | key | índices | qué guarda | pantallas |
| --- | --- | --- | --- | --- |
| `settings` | `"me"` | — | apodo, moneda, respuestas del cuestionario, primeros pasos, capital líquido inicial, clave de IA (aparte, en localStorage como Trazo) | S02, S04, S23 |
| `categories` | id | `type` | categorías con `kind` (fijo, discrecional, deuda) y `monthlyLimitCents` | S09, S11 |
| `transactions` | id | `occurredOn`, `[categoryId+occurredOn]` | movimientos (`hasPhoto`) | S06, S07, S08, S10, S15 |
| `photos` | id de la transacción | — | Blob JPEG; nunca se exporta a ningún servidor | S07, S08, S10, S18, S19 |
| `pots` | id | `type` | huchas de ahorro e inversión, con meta | S12 |
| `potMovements` | id | `potId`, `occurredOn` | aportes y retiradas | S13, S15 |
| `monthPlans` | `month` (`YYYY-MM`) | — | plan en puntos básicos y modo | S14 |
| `notes` | id | `onDate` | notas del calendario | S15 |
| `reminders` | id | — | recordatorios únicos, semanales y mensuales | S16 |
| `monthRecaps` | `month` | — | cifras congeladas al cerrar el mes | S18 |
| `reflections` | id | `month` | preguntas y respuestas | S18, S19 |
| `assistantMessages` | id | `createdAt` | chat | S17 |
| `usage` | `kind:day` | — | contadores (solo informativos hasta la fase 5) | S17 |

13 almacenes. Todo lo demás se **calcula**: el balance del mes, el patrimonio, lo disponible en
cada límite, las rachas y "hace un mes". Con miles de filas sigue siendo instantáneo: un mes
se lee por el índice `occurredOn` en un rango.

Fórmulas (el recon no las veía; decisión propia):
- Ingresado, Gastado = Σ de las transacciones del mes por tipo.
- Ahorrado, Invertido = Σ de aportes − retiradas del mes, por tipo de hucha.
- **Balance total del mes** = Ingresado − Gastado − Ahorrado − Invertido (lo que queda libre).
- Capital líquido = inicial + Σ de todos los balances desde la fecha inicial.
- Patrimonio = capital líquido + Σ de los saldos de las huchas.
- Mes "en verde" = Ingresado > Gastado.

## Schema (fases 4-5)

Tablas: 14 (`profiles`, `categories`, `transactions`, `pots`, `pot_movements`, `month_plans`, `notes`,
`reminders`, `month_recaps`, `reflections`, `assistant_messages`, `usage_counters`, `subscriptions`,
`stripe_events`). Access rules: **Row Level Security** de Supabase, `user_id = auth.uid()` en
todas. Los contadores y la suscripción solo los escribe el servidor.

Ver `replica/schema.sql`. Validado en Postgres (PGlite): crea todas las tablas, rechaza una
categoría de otro tipo, un plan por encima del 100 % y un recordatorio semanal sin día, y al borrar
el usuario borra todo en cascada.

## "API" de las fases 1-3: rutas de pantalla y funciones de datos

Sin servidor no hay endpoints. El contrato equivalente son las **rutas hash** de la app (una por
pantalla) y las **funciones del módulo de datos** a las que llaman. Quien llama: siempre el
propio usuario, en su dispositivo.

### Rutas

| ruta | pantalla | flow |
| --- | --- | --- |
| `#/bienvenida` | S01 tour, S02 cuestionario | F01 |
| `#/primeros-pasos` | S04 | F01 |
| `#/` | S06 Inicio (`?mes=YYYY-MM`) | todos |
| `#/nuevo?tipo=gasto\|ingreso&fecha=` | S07 (hoja) | F02, F03 |
| `#/movimiento/:id` | S08 | F02 |
| `#/graficos?tipo=gasto\|ingreso&mes=` | S09 | F04 |
| `#/categoria/:id?mes=` | S10 | F04 |
| `#/limites` | S11 | F05 |
| `#/capital` | S12 | F06 |
| `#/hucha/:id/movimiento` | S13 (hoja) | F06 |
| `#/plan?mes=` | S14 | F07 |
| `#/calendario?mes=` | S15 | F08 |
| `#/recordatorio/nuevo?fecha=` | S16 (hoja) | F08 |
| `#/recap/:mes` | S18 | F09 |
| `#/recuerdo` | S19 | F09 |
| `#/rachas` | S20 | — |
| `#/asistente` | S17 | F10 |
| `#/pdf/:mes` | S21 | F12 |
| `#/ajustes` | S23 | F13 |

19 rutas. S05 (planes) y S03 (registro) no existen hasta las fases 4 y 5.

### Funciones de datos (`ahorro/src/data/*.ts`)

| función | hace | input | output | flow |
| --- | --- | --- | --- | --- |
| `monthSummary(month)` | 4 cifras + balance + estado de límites | `YYYY-MM` | `{incomeCents, expenseCents, savedCents, investedCents, balanceCents, limits[]}` | F02-F05 |
| `addTransaction(t, photo?)` | guarda el movimiento y la foto en **una** transacción de IndexedDB | `TransactionInput`, `Blob?` | `Transaction` | F02, F03 |
| `updateTransaction(id, patch, photo?\|null)` | edita; `null` quita la foto | | | F02 |
| `deleteTransaction(id)` | borrado blando y borra la foto | | | F02 |
| `listTransactions({month?, categoryId?, day?})` | por rango del índice | | `Transaction[]` | F04, F08 |
| `categoryBreakdown(month, type)` | donut + fijo/discrecional/deuda + barras por día | | | F04 |
| `upsertCategory`, `setLimit(categoryId, cents)` | crea o edita categorías y límites | | | F05 |
| `rebalanceLimits(month)` | ajuste proporcional si los límites superan lo disponible | | propuesta | F05 |
| `addPot`, `addPotMovement(potId, kind, cents, date)` | huchas, aportes y retiradas; marca la meta cumplida | | | F06 |
| `wealth()` | capital líquido, saldos de huchas, patrimonio | | | F06 |
| `savePlan(month, plan)`, `planVsActual(month)` | planificación y comparación | | | F07 |
| `addNote`, `addReminder`, `dueReminders(now)` | calendario; los recordatorios se avisan **al abrir la app** | | | F08 |
| `closeMonth(month)` | congela el recap una vez (clave = mes) | | `MonthRecap` | F09 |
| `streaks(today)` | días seguidos, movimientos con foto seguidos, meses en verde | | | — |
| `exportBackup()`, `importBackup(file)` | JSON con todo **menos las fotos** (opción: zip con fotos) | | archivo | F13 |
| `wipeAll()` | borra todos los datos del dispositivo | | | F13 |
| `askAssistant(question)` | Claude con *tool use*: el modelo pide `listTransactions`, `monthSummary`, etc., y se ejecutan **en el navegador** | texto | respuesta | F10 |
| `monthPdf(month)` | jsPDF con las cifras clave en la primera página | | Blob | F12 |

Webhooks in/out: ninguno hasta la fase 5. Jobs: ninguno; ver "al abrir la app" arriba.

### Fases 4-5 (cuando quieras cuentas y cobrar)

| method path | does | who | flow |
| --- | --- | --- | --- |
| Supabase Auth (email, magic link, Google) | cuenta | público | F01 |
| Supabase REST sobre las tablas con RLS | sincronización: subir lo cambiado desde `lastSync` (por `updated_at`) y bajar lo del servidor | el dueño | todos |
| `POST /functions/v1/checkout` (Edge Function) | crea la sesión de Stripe Checkout | usuario con sesión | F11 |
| `POST /functions/v1/stripe-webhook` | actualiza `subscriptions`; idempotente con `stripe_events` | Stripe (firma verificada) | F11 |
| `POST /functions/v1/assistant` | proxy a la IA con **tu** clave de servidor, aplicando `usage_counters` | usuario con sesión | F10 |
| `POST /functions/v1/delete-account` | borra `auth.users` → cascada | el dueño | F13 |

Supabase tiene plan gratuito y también corre en local con Docker (`supabase start`). Stripe en
modo prueba no cobra. Sigue costando 0 € hasta lanzar.

## The parts that bite

- **Fechas:** guardar `occurredOn` como `YYYY-MM-DD` local, nunca como `Date` en UTC. Si no, un
  gasto de las 00:30 cae en el día (o el mes) anterior. El mes = prefijo `YYYY-MM`. Los
  recordatorios van en hora de pared + zona; "mensual el día 31" = último día del mes. Con fechas
  de texto, el cambio de horario no afecta a los movimientos.
- **Dinero:** céntimos enteros y nunca `float`. Hay que entender "12,50", "12.50", "1.234,56" y "12€".
  Mostrar con `Intl.NumberFormat('es-ES', {style:'currency', currency:'EUR'})`.
- **Fotos y espacio:** comprimir en un canvas (1280 px, JPEG 0,8: unos 150-250 KB por foto). Pedir
  `navigator.storage.persist()`. Safari puede **borrar los datos de una web no instalada tras 7 días
  sin uso**, y la PWA instalada tiene un almacenamiento **distinto** al de Safari. Hay que decir
  "instálala" y ofrecer la copia de seguridad desde el día 1.
- **Sin conexión:** sin servidor, la app siempre funciona sin conexión. En la fase 4, la
  sincronización usa la regla "el último `updatedAt` gana" por fila, y los borrados viajan con
  `deletedAt`.
- **Carreras:** dos pestañas abiertas. Cada escritura va en una transacción de IndexedDB, y
  `closeMonth` usa el mes como clave, así que el recap no se duplica.
- **Idempotencia:** los webhooks de Stripe llegan dos veces (fase 5). La tabla `stripe_events`
  se encarga.
- **Límites de uso:** en el navegador, los contadores no se pueden hacer cumplir. Solo importan
  cuando cobres (fase 5, en el servidor).
- **Privacidad y RGPD:** en las fases 1-3 los datos no salen del móvil, **salvo** lo que envía el
  asistente si pones tu clave: solo un resumen y lo que pida la herramienta, nunca las fotos. Hay que
  decirlo en Ajustes. Borrar = `wipeAll()`. En la fase 4: cascada en Postgres + borrar la cuenta de Auth.
- **Notificaciones:** no hay en las fases 1-3 (Web Push necesita servidor, y en iPhone solo funciona
  con la PWA instalada). Recordatorios, recap y metas se avisan dentro de la app al abrirla.
- **Dictado:** Web Speech API no existe en Firefox y en Safari es irregular. El micro se esconde
  donde no está disponible.
- **Búsqueda:** un filtro en memoria sobre el mes o el año basta.
- **Multi-tenancy:** no aplica (una persona, un dispositivo) hasta la fase 4 (RLS).

## Build order

Cada fase termina con algo que se puede usar en el móvil.

1. **Vertical slice**: apuntar un gasto con foto y verlo en el mes.
   - Pantallas: S06 (versión fea), S07, S08.
   - Almacenes: `settings`, `categories` (con categorías de serie: Casa, Comida, Transporte, Ocio,
     Suscripciones, Caprichos, Nómina…), `transactions`, `photos`.
   - Rutas: `#/`, `#/nuevo`, `#/movimiento/:id`.
   - Funciones: `addTransaction`, `listTransactions`, `monthSummary`.
   - Hecho cuando: en el móvil, F02 en ≤ 6 toques y las cifras del mes cuadran.
2. **Must-haves** (`features.csv`, todos en local):
   - PWA (manifest + service worker), cambiar de mes, editar y borrar (S08).
   - Categorías con tipo; donut (S09); límites con disponible (S11).
   - Capital, huchas, aportes y retiradas (S12, S13); planificación (S14); calendario (S15).
   - Recap mensual tipo historias, sin IA (S18); primeros pasos (S04).
   - Ajustes con **copia de seguridad, restaurar y borrar todo** (S23). Sustituye a "eliminar
     cuenta" mientras no haya cuentas.
   - Vista previa con HTTPS para probar en el móvil: `vite preview` + un túnel gratuito, o GitHub Pages.
   - **Quedan para las fases 4 y 5** (must en el CSV, pero necesitan servidor): registro con email,
     suscripción, sincronización.
3. **Should-haves, luego could-haves**:
   - Tour y cuestionario (S01, S02); categoría → movimientos (S10).
   - Barras por día y fijo/discrecional/deuda; metas; notas; plan frente a realidad.
   - Preguntas de reflexión (fijas; con IA si hay clave); PDF (S21).
   - Asistente con tu clave (S17) y dictado. Rachas (S20), "hace un mes" (S19), recordatorios
     dentro de la app (S16), compartir foto.
4. **Cuentas y sincronización** (si quieres usarla en varios dispositivos): Supabase en local o
   en el plan gratuito, `schema.sql` como primera migración, inicio de sesión con email o enlace mágico.
5. **Cobrar**: Stripe en modo prueba, planes (S05), límites del plan gratis, asistente con la clave
   del servidor. Antes de esto, replica-brand y replica-launch.
6. **Fixes de replica-entrepreneur**, cuando se haya ejecutado (lo que odian sus usuarios).
