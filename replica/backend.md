# Backend: guardado en la nube

Decisión (2026-11-13): guardar todo en la nube **sin cuentas de usuario ni pagos**.
Cada dispositivo entra en Supabase como usuario anónimo (sin email ni contraseña) y pertenece
a un «espacio». Los demás dispositivos se unen con un código de emparejar o con el código de
recuperación. La app sigue funcionando entera sin conexión: lo que apuntas se guarda primero en
el móvil y se sube solo en cuanto puede.

## Qué se guarda

| dato | dónde | notas |
| --- | --- | --- |
| movimientos, categorías, huchas y sus aportes, planes, notas, avisos, resúmenes, reflexiones, chat del asistente, ajustes | tabla `records` (una fila por registro, JSON) | gana el cambio más reciente; los borrados también viajan |
| fotos | almacén privado `fotos/<espacio>/<movimiento>.jpg` | máx. 2 MB, solo JPEG (la app las comprime a ~200 KB) |
| clave del asistente, contadores de uso | solo en el dispositivo | nunca se suben |

## Lo que tienes que hacer tú (una vez, gratis)

1. Crea una cuenta en https://supabase.com y un proyecto nuevo (plan Free, región Europa, por ejemplo Frankfurt).
2. En el proyecto: **Authentication → Sign In / Providers → Allow anonymous sign-ins**: actívalo.
   Recomendable también: **Authentication → Attack Protection → CAPTCHA** para que nadie cree usuarios anónimos en masa (opcional al principio).
3. **SQL Editor → New query**: pega el contenido de `ahorro/supabase/migrations/20261113000000_guardado_en_la_nube.sql` y pulsa *Run*.
   (Con la CLI de Supabase, alternativa: `npx supabase link` y `npx supabase db push`.)
4. **Project Settings → API**: copia *Project URL* y la clave *anon / publishable*.
5. En `ahorro/`, copia `.env.example` como `.env.local` y pega esos dos valores. **No** uses la clave `service_role`/`secret`.
6. `npm run dev`. La primera vez que abras la app (o al terminar la bienvenida) se enlaza sola y te enseña el **código de recuperación**: guárdalo.

Copias de seguridad: el plan Free de Supabase **no** guarda copias diarias descargables (las tiene el plan Pro).
Mientras tanto, la app sigue ofreciendo «Copia con fotos» en Ajustes. Cuando lances, valora el plan Pro o un volcado periódico (`supabase db dump`).

Límites del plan Free (noviembre de 2026, comprobar en supabase.com/pricing): 500 MB de base de datos, 1 GB de archivos,
y el proyecto se pausa tras una semana sin uso (se reactiva desde el panel). Para una persona con fotos de ~200 KB
caben unas 5.000 fotos.

## Cómo funciona

- **Migración**: `ahorro/supabase/migrations/20261113000000_guardado_en_la_nube.sql`. Tablas `spaces`, `space_members`,
  `pair_codes`, `join_attempts`, `records`; funciones `create_space`, `create_pair_code`, `join_space`, `new_recovery_code`,
  `push_records`, `pull_records`, `delete_my_space`; reglas del almacén `fotos`.
- **Por qué una tabla genérica** y no las 14 tablas de `replica/schema.sql`: la app trabaja primero en el dispositivo
  y el servidor solo guarda y devuelve registros; ninguna consulta mira dentro. Así la sincronización y las reglas de acceso
  son mucho más simples. `schema.sql` sigue siendo el plan si un día hay cuentas, cobros o consultas en el servidor.
- **Sincronización** (`ahorro/src/data/cloud.ts`): cada escritura local apunta el cambio en la cola `outbox` en la misma
  transacción. La app sube la cola y baja lo nuevo (por número de secuencia del servidor) al abrir, 1,5 s después de cada
  cambio, al volver la conexión, al volver a la app y cada minuto. Si un registro cambió en dos móviles, gana el último cambio.
- **Códigos**: recuperación de 20 caracteres (~100 bits, se guarda solo su hash SHA-256); emparejar de 8 caracteres,
  vale 15 minutos y una vez; máximo 10 intentos por hora y dispositivo.

## Pruebas

- `npm run test:db`: 12 pruebas de la migración con Postgres local (PGlite) y una imitación de auth/storage de Supabase:
  crear espacio, subir/bajar, gana el último, **un segundo usuario no ve ni modifica nada**, sin sesión no se puede llamar
  a nada, emparejar (una sola vez), recuperación, límite de intentos, códigos nuevos invalidan el anterior, fotos por carpeta,
  datos no válidos rechazados, borrado en cascada. **12/12 pasan.**
- Prueba de punta a punta (en el navegador, con un Supabase simulado que responde como el real y ejecuta la migración):
  móvil A sube los datos de ejemplo y 10 fotos; apunta un gasto con foto; B se empareja con el código y lo ve con su foto;
  B apunta y A lo recibe; A sin conexión deja el cambio pendiente y lo sube al volver; C recupera todo con el código de
  recuperación (un código malo da un error claro); D, de otra persona, no ve nada. Sin errores de consola.
- **No probado contra un proyecto real de Supabase** (no hay uno en esta sesión). La primera vez que lo conectes, apunta un
  gasto y mira en Supabase → Table Editor → `records` que aparece.

## Lista de seguridad

- [x] secretos solo en variables de entorno; `.env*.local` en `.gitignore`; la app solo lleva la URL y la clave pública (anon)
- [x] validación en el servidor: `store` en lista cerrada, id de 1 a 100 caracteres, JSON objeto < 64 KB, lotes ≤ 500, fecha del cambio limitada a «ahora + 1 min»
- [x] autorización en cada lectura y escritura (RLS por espacio), probada con un segundo usuario
- [x] límite de intentos al unirse con un código; [ ] CAPTCHA del alta anónima (paso opcional del panel, ver arriba)
- [ ] webhooks: no hay (sin pagos)
- [x] fotos: máx. 2 MB, solo JPEG, almacén privado, una carpeta por espacio
- [x] sin datos personales en URLs ni logs (los avisos de error de la app no incluyen contenido)
- [x] dependencias auditadas: `npm audit` sin vulnerabilidades
- [ ] política de privacidad propia que nombre a Supabase (almacenamiento) y a Anthropic (asistente, si se usa): pendiente para replica-launch

## Fuera de esta fase (decidido)

- Cuentas con email, Apple o Google: no. El código de recuperación hace su papel.
- Pagos (Stripe): no.
- Notificaciones push y avisos programados en el servidor: no (los avisos siguen saliendo al abrir la app).
- Emails: no hay ninguno que enviar sin cuentas.
