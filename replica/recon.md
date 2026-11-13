# Recon map: INVEROOS | Ahorro y dinero (original: iOS nativa → clon: web móvil / PWA, en español)

Scope (propuesto, pendiente de tu sí): el bucle principal de finanzas personales con entrada manual:
registrar movimientos (con foto) → ver el balance del mes y el capital (ahorro + inversión) →
límites por categoría y planificación del mes → recap de fin de mes. El asistente con IA,
los reportes PDF, las rachas y los recordatorios van en una segunda fase.
For: **sin confirmar**. Supuesto de trabajo: producto propio para vender a jóvenes en España
(el mismo público que el original). Cámbialo si es para otra cosa.
Date: 2026-11-13

Método: solo fuentes públicas, sin cuenta (no has dado ninguna). Nada de código, endpoints
ni recursos del original. Las pantallas se infieren de las 9 capturas de la tienda, del historial
de versiones, de la web y de la política de privacidad. Todo lo que no se ve en una fuente
está marcado como **inferido**.

Términos del original (https://inveroos.com/terms, oct 2026): prohíben la ingeniería inversa
de la app y reproducir su "código, diseño, marca y contenido". Este mapa no usa la app ni su
código. Copia la **funcionalidad**, no el diseño: el clon necesita marca, colores, mascota,
ilustraciones y textos propios (replica-design y replica-brand).

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | ficha App Store (ES) | https://apps.apple.com/es/app/inveroos-ahorro-y-dinero/id6761435441 | descripción, compras integradas, 18 versiones con notas, etiqueta de privacidad, 2 reseñas visibles |
| 2 | API pública de consulta de iTunes | https://itunes.apple.com/lookup?id=6761435441&country=es | metadatos: v2.3.3 (6 nov 2026), salida 24 abr 2026, 4,8★ con 16 valoraciones, iOS 18.5+, ES/EN, 26 MB, categoría Finanzas |
| 3 | capturas de la tienda (9) | is1-ssl.mzstatic.com (URLs en la consulta de iTunes) | guardadas en `replica/screens/store-01..09.jpg`, solo de referencia |
| 4 | web de marketing | https://inveroos.com/ | funciones, precios, FAQ, textos alternativos de 6 capturas |
| 5 | página del tutorial | https://inveroos.com/tutorial | qué es gratis y qué es Premium; vídeo en https://www.youtube.com/watch?v=L2IT3-7S2BE (**no visto**: YouTube está bloqueado en esta sesión) |
| 6 | política de privacidad | https://inveroos.com/privacy | **la mejor fuente del modelo de datos**: lista todos los datos guardados; proveedores Supabase, OpenAI, PostHog, Apple y Google |
| 7 | términos de servicio | https://inveroos.com/terms | entrada manual, sin bancos, sincronización, borrado de cuenta, suscripciones de Apple |
| 8 | redes | https://www.instagram.com/inveroos.app/ · https://youtube.com/@inveroos | no leídas |
| — | centro de ayuda, API pública, changelog aparte | — | no existen; el historial de versiones hace de changelog |

## Core loop

Apuntar cada ingreso o gasto a mano, con una foto del momento, para ver en una pantalla cuánto
has ingresado, gastado, ahorrado e invertido este mes. Al cerrar el mes, la app lo convierte en
un "recap" tipo historias. Se paga por el asistente con IA, los PDF, el recap completo y quitar límites.

## Screens

Estados vistos: los que salen en capturas o notas. "inferido" = deducido, no visto.

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Portada + tour guiado | primer arranque (v2.2, v2.3) | probar la app antes de crear cuenta | carrusel, CTA, "Toca para continuar" | filled; inferido: saltar |
| S02 | Cuestionario inicial | tras portada (privacidad §2, v2.3) | objetivo, cómo llevas hoy tus finanzas, rango de ahorro mensual deseado; adapta el inicio | opciones de elección única, progreso | inferido |
| S03 | Acceso / registro | tras cuestionario | email, Apple o Google | botones de proveedor, campo email | inferido: error, verificación por correo |
| S04 | Configuración financiera ("Primeros pasos") | tras registro, o desde Inicio (v2.0, v2.3.2) | capital líquido inicial, ahorros, inversiones, categorías, límites; se puede saltar | checklist, pasos, "saltar" | completado → aviso de 14 días Premium |
| S05 | Planes (paywall) | aviso de límite, Inicio, Perfil (v1.2.2) | mensual 5,99 €, anual 39,99 € con 7 días de prueba | 2 tarjetas de plan, lista de ventajas, CTA | inferido: prueba activa, caducado |
| S06 | Inicio (mes actual) | pestaña central (∞) | balance del mes en un vistazo | selector de mes + (i), **anillo "Balance total"**, 4 cifras (Ingresado verde, Gastado rojo, Ahorrado azul, Invertido morado), botones rápidos (+, carpeta, informe, límites), mascota del asistente, botón de micro, carrusel de tarjetas (rachas, "Hace un mes"), barra de 3 pestañas | filled (store-01, 03); inferido: mes vacío, sin conexión |
| S07 | Nueva transacción (hoja) | botón + en Inicio, menú del Calendario, atajo de iOS | registrar ingreso o gasto | importe, tipo, categoría, título, fecha, nota, **foto** (cámara o galería, X para quitarla) | inferido; v1.2.1: quitar foto |
| S08 | Detalle de transacción | tocar un movimiento | ver, editar, borrar, compartir la foto en Instagram | foto redondeada, importe, categoría | inferido (v1.2.1, v2.3.3) |
| S09 | Gráfico de gastos / ingresos | Inicio → gráficos | a dónde va el dinero | **donut por categoría** con total en el centro, leyenda, **barras por día**, 3 anillos **Fijo / Discrecional / Deuda**, "Desliza" a ingresos | filled (store-07) |
| S10 | Transacciones de una categoría | tocar una categoría en S09 (v1.2.1) | movimientos del mes de esa categoría, con fotos | lista con miniaturas | inferido |
| S11 | Tus límites | botón rápido en Inicio | tope por categoría y lo que queda | anillo total, filas por categoría (anillo %, "x € de y €", "Disponible z €") | filled (store-06); aviso de "no cuadra" con ajuste proporcional (v1.2) |
| S12 | Capital total | pestaña derecha | patrimonio: ahorros e inversiones por separado | 2 anillos (Total ahorrado azul, Total invertido morado), capital líquido, botón Planificación | filled (store-04) |
| S13 | Aporte / retirada | desde S12 | mover dinero a ahorro o inversión, o sacarlo | importe, destino, fecha; metas con aviso al cumplirlas (v1.3) | inferido |
| S14 | Planificación del mes | botón en S12 | repartir los ingresos previstos | campo "Ingresos planificados", 3 sliders Gastos / Ahorros / Inversiones con modo **% o Cantidad**, total asignado, anillo "Balance estimado"; al cerrar el mes compara plan y realidad | filled (store-09) |
| S15 | Calendario | pestaña izquierda | el mes día a día | rejilla L-D con marcadores por tipo, campana en días con recordatorio, menú del día (Añadir transacción / nota / recordatorio, Ver nota), lista de movimientos del día; notas en tarjeta flotante (v2.3.3) | filled (store-08) |
| S16 | Recordatorio | menú del Calendario o ajustes (v1.3) | aviso único en una fecha, o semanal o mensual | tipo, fecha u hora, texto | inferido |
| S17 | Asistente financiero (chat) | mascota de Inicio | preguntas sobre tus datos, consejos, hábitos | saludo diario con datos reales, burbujas, **dictado por voz** ES/EN, límite diario de mensajes, responde en tu idioma | filled (store-05); inferido: límite alcanzado |
| S18 | Recap mensual | fin de mes, notificación, Inicio | "Tu mes en resumen" tipo historias | historias a pantalla completa con progreso arriba, X, "Desliza para empezar": inicio y fin del mes, gastos, fotos, ahorro e inversión, preguntas de reflexión (IA) | filled (store-02) |
| S19 | Memoria / "Hace un mes" | tarjeta en Inicio (v2.0) | qué pasaba hace exactamente un mes: fotos y gastos como recuerdo; reflexiones | tarjeta con foto, texto | filled (tarjeta en store-03) |
| S20 | Rachas | tarjeta en Inicio | días seguidos abriendo la app, movimientos seguidos con foto, meses en verde | contadores, historial por meses, diferencia con el mes anterior | filled (store-03) |
| S21 | Reporte PDF | botón informe en Inicio | resumen mensual descargable con las cifras clave en la 1.ª página (v2.3.2) | vista previa, compartir | inferido |
| S22 | Detalle del mes (i) | (i) junto al mes en Inicio | explica las cifras del mes | inferido | inferido |
| S23 | Perfil / Ajustes | icono de perfil arriba a la izquierda | cuenta, plan, idioma, notificaciones, ayuda (vídeo tutorial), feedback, legal, cerrar sesión, **eliminar cuenta** | lista agrupada | inferido (términos §10, v1.2.1) |

Fuera de la web: widgets de rachas (pantalla de inicio y de bloqueo) y atajo de iOS para crear un movimiento.

## Flows

Clics del original contados en la ruta feliz, **inferidos** de las capturas (sin cuenta no se pueden medir).

```
F01 Primer uso hasta el primer mes con datos
    S01 tour -> S02 cuestionario (3 preguntas) -> S03 registro -> S04 primeros pasos -> S06 Inicio
    happy path clicks: ~10
    edge: saltar pasos (luego en "Primeros pasos"), cerrar a mitad, email ya registrado,
          completar pasos -> 14 días Premium sin tarjeta

F02 Apuntar un gasto con foto  (EL BUCLE: el número a batir)
    S06 + -> S07 importe -> categoría -> foto (cámara) -> guardar -> S06 actualizado
    happy path clicks: ~6
    edge: sin conexión (se sincroniza después), sin permiso de cámara, quitar la foto,
          límite de la categoría superado, varios movimientos con el mismo título (bug v1.2.5),
          importe con coma decimal, fecha de otro mes

F03 Apuntar un ingreso
    S06 + -> S07 tipo ingreso -> importe -> guardar
    happy path clicks: ~4

F04 Ver a dónde va el dinero
    S06 -> S09 donut -> tocar categoría -> S10 lista con fotos
    happy path clicks: 2
    edge: mes sin gastos, una sola categoría, "Sin categoría"

F05 Poner límites y gastar sin pasarse
    S06 -> S11 -> editar límite de categoría -> guardar
    edge: suma de límites mayor que el disponible -> aviso y ajuste proporcional

F06 Ahorrar o invertir
    S12 -> S13 aporte -> importe -> guardar -> anillos actualizados
    edge: retirada mayor que el saldo, meta cumplida -> notificación

F07 Planificar el mes y compararse al final
    S12 -> S14 ingresos previstos -> reparto en % o € -> guardar ; fin de mes -> S18 compara
    edge: reparto > 100 %, cambio de % a cantidad a mitad, ingresos reales distintos

F08 Calendario: nota o recordatorio en un día
    S15 -> tocar día -> menú -> Añadir nota / recordatorio (S16) -> guardar
    edge: recordatorio en el pasado, semanal que cae en día 31

F09 Cerrar el mes (recap)
    notificación o Inicio -> S18 historias -> preguntas de reflexión -> responder -> guardar
    edge: mes con pocos movimientos, sin fotos, cerrar a mitad, mes en curso

F10 Preguntar al asistente
    S06 mascota -> S17 escribir o dictar -> respuesta con tus cifras
    edge: límite diario alcanzado -> S05, sin datos todavía, otro idioma, pregunta fuera de tema

F11 Hacerse Premium
    aviso de límite -> S05 -> plan anual -> prueba de 7 días -> pago
    edge: cancelar la prueba, restaurar compra, borrar la cuenta NO cancela la suscripción

F12 Exportar el mes en PDF
    S06 -> S21 -> compartir

F13 Borrar la cuenta
    S23 -> eliminar -> confirmar -> datos fuera; fotos locales borradas
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Anillo de progreso (ring) | grande con cifra central, pequeño con % | lleno, parcial, superado | S06, S11, S12, S14 |
| Donut por categorías | gastos, ingresos | con datos, vacío | S09 |
| Barras por día | — | con datos, vacío | S09 |
| Tarjeta de cifra (KPI) | ingresado, gastado, ahorrado, invertido (color por tipo) | — | S06, S12 |
| Tarjeta del carrusel | rachas, hace un mes, primeros pasos, prueba gratis | — | S06 |
| Fila de categoría con límite | normal, cerca del límite, superado | — | S11 |
| Fila de transacción | con foto, sin foto; ingreso, gasto | — | S10, S15, S08 |
| Hoja inferior (bottom sheet) | nueva transacción, aporte, recordatorio | abierta, guardando, error | S07, S13, S16 |
| Selector de foto | cámara, galería, quitar (X) | sin permiso | S07 |
| Slider con modo %/Cantidad | — | dentro de rango, >100 % | S14 |
| Control segmentado | %/Cantidad, gastos/ingresos | — | S09, S14 |
| Calendario mensual | marcadores de transacción, nota, recordatorio (campana) | día seleccionado, hoy | S15 |
| Menú contextual | — | — | S15 |
| Visor de historias | barras de progreso, cerrar, deslizar | — | S18 |
| Burbujas de chat | usuario, asistente, saludo diario | escribiendo, error, límite | S17 |
| Botón de micro (dictado) | — | escuchando, sin permiso | S06, S17 |
| Mascota animada del asistente | — | reposo, saludo | S06 (**hacer una propia**) |
| Selector de mes | anterior, siguiente, (i) | — | S06, S15 |
| Barra de pestañas | 3: Calendario · Inicio · Capital | activa | global |
| Tarjeta de plan | mensual, anual (destacada) | — | S05 |
| Aviso / toast | info, límite, meta cumplida | — | global |
| Estado vacío | por pantalla | — | todas |

## Inferred data model

```
User         id, email, name_or_nickname, auth_provider (email | apple | google), locale (es | en),
             created_at, terms_accepted_at, terms_version
             evidence: privacidad §2 "Datos de cuenta", términos §5          confidence: high

OnboardingAnswers  user_id, goal, current_management, desired_monthly_saving_range
             evidence: privacidad §2 "Respuestas al cuestionario inicial", v2.3   confidence: high (campos) / guess (valores)

Category     id, user_id, name, type (expense | income), kind (fijo | discrecional | deuda),
             color, icon, monthly_limit (nullable)
             evidence: S09 (Casa, Comida, Ocio, Sin categoría; Fijo/Discrecional/Deuda), S11
             confidence: high (nombre, límite) / medium (kind en la categoría y no en la transacción)

Transaction  id, user_id, type (income | expense), amount, currency (EUR), category_id, title,
             date, note, photo_local_ref (la foto SOLO en el dispositivo), created_at, updated_at
             evidence: S07, S10, S15, privacidad §2 "Ingresos, gastos, categorías, fechas y notas",
                       "las fotos se guardan únicamente en tu dispositivo"   confidence: high

Pot          id, user_id, type (savings | investment), name, goal_amount (nullable)
             evidence: S12 dos anillos, v1.3 "metas de ahorro e inversión"   confidence: medium
             (¿un saldo por tipo o varias huchas? guess: varias con meta opcional)

PotMovement  id, pot_id, kind (contribution | withdrawal), amount, date
             evidence: v2.3 "aportes y retiradas ... se guardan en tu cuenta", S15 "aportaciones"
             confidence: high

LiquidCapital user_id, amount, as_of     evidence: privacidad "tu capital líquido", FAQ   confidence: medium

MonthPlan    id, user_id, month (YYYY-MM), planned_income, expenses_pct|amount,
             savings_pct|amount, investments_pct|amount, mode (pct | amount)
             evidence: S14, privacidad "planificación mensual"   confidence: high

Note         id, user_id, date, text            evidence: S15 menú, v2.3.3   confidence: high
Reminder     id, user_id, text, schedule (once | weekly | monthly), date_or_rule, time
             evidence: v1.3, S15 campana   confidence: high

MonthRecap   id, user_id, month, summary_json, generated_at
Reflection   id, user_id, month, question, answer
             evidence: S18, web "preguntas de reflexión", privacidad "reflexiones mensuales,
                       resúmenes mensuales"   confidence: high

Streak       user_id, kind (app_open_days | photo_transactions | green_months), current, best,
             last_updated   evidence: v2.0, store-03   confidence: high
             ("mes en verde" = guess: ingresos > gastos ese mes)

AssistantMessage  id, user_id, role (user | assistant), text, created_at, source (chat | daily_greeting)
             evidence: privacidad "mensajes e historial del asistente"   confidence: high
UsageCounter user_id, kind (assistant_messages_day, ...), date, count
             evidence: privacidad "contadores de uso", v1.2.1 "límite diario del asistente"   confidence: high

Subscription user_id, plan (monthly | yearly), status (trial | active | expired | cancelled),
             trial_source (yearly_7d | first_steps_14d | ...), period_end, store_events
             evidence: privacidad "estado de tu plan, fechas, eventos", términos §7   confidence: high

FirstStepsProgress user_id, steps_done[], completed_at, premium_unlocked_until
             evidence: v2.0, v2.0.1, v2.3.2   confidence: medium

Feedback     id, user_id, text, created_at   evidence: privacidad   confidence: high
```

Relaciones: User 1-n Category, User 1-n Transaction (n-1 Category), User 1-n Pot 1-n PotMovement,
User 1-n MonthPlan (1 por mes), User 1-n Note/Reminder, User 1-n MonthRecap 1-n Reflection,
User 1-n Streak, User 1-1 Subscription, User 1-n AssistantMessage.

Derivados (sin tabla): balance del mes = ingresos − gastos − aportes; patrimonio = capital
líquido + Σ huchas; "disponible" de un límite = límite − gastado en la categoría ese mes.
La fórmula exacta del anillo "Balance total" **no se ve en las fuentes**: guess.

Arquitectura vista en las fuentes: local primero y sincronización con la cuenta (términos §8,
v1.2.3 "sincronización sin conexión"). Backend en Supabase. IA con OpenAI: se le envía un
**resumen** de los datos (importes, categorías, títulos, límites, ahorro, reflexiones), nunca
el email ni las fotos. Analítica con PostHog.

## Feature matrix

See `features.csv`. 52 filas. Must: 19, should: 14, could: 10, skip: 9.

## Precios (contradictorios en las fuentes: decide tú el tuyo)

- Ficha de la tienda: "Gratis · Compras dentro de la app": Premium 5,99 €, Premium Anual 39,99 €.
- Web: "Sin plan gratuito", mensual 5,99 € o anual 39,99 € con 7 días gratis.
- Tutorial: hay "Plan Gratuito"; Premium (IA, PDF, recap completo) a 5,99 €/mes, "primer mes gratis".
- Notas de versión: avisos de límite (1.2.2), límite diario del asistente (1.2.1), pruebas de 30 días
  (1.2.2), 7 días en el anual (2.1) y 14 días al completar "Primeros pasos" (2.0).
- Conclusión: freemium con límites (transacciones y categorías limitadas en gratis; "ilimitadas" en Premium).
  Los topes exactos del plan gratis **no se conocen**.

## Out of scope (cannot or should not be cloned)

- Marca, nombre, logo "∞/OO", mascota animada, ilustraciones, textos y el estilo visual concreto
  (verde oscuro y lima, Space Grotesk). Los términos lo reservan; replica-brand y replica-design hacen los propios.
- Widgets de pantalla de inicio y de bloqueo, y el atajo de iOS: no existen en la web. Sustituto: acceso directo de la PWA.
- Compras dentro de la app de Apple: en la web, el pago va por Stripe (replica-backend).
- Conexión con bancos: el original tampoco la tiene. No inventarla en el clon.
- Contenido de "La Educación" (próximamente), boletín, Instagram y YouTube: son contenido, no producto.
- Sus usuarios, valoraciones y datos.
- Asesoramiento financiero regulado: el original se declara "no asesoramiento". El clon igual,
  con el mismo tipo de aviso escrito con palabras propias.

## Notas para la web móvil

- PWA instalable (igual que Trazo, en este mismo repo): pantalla completa y sin conexión con IndexedDB, sincronizando después.
- Fotos: `<input type="file" accept="image/*" capture>`. Se guardan solo en el dispositivo (IndexedDB),
  como el original; avisar de que se pierden al cambiar de dispositivo.
- Dictado: Web Speech API en Chrome y Safari (en Safari funciona, pero es irregular). Plan B: grabar y transcribir en el servidor.
- Notificaciones: Web Push. En iPhone solo funciona con la PWA instalada (iOS 16.4+): es el punto débil
  de rachas, recordatorios y recap.
- Compartir la foto en historias de Instagram: Web Share API con archivo (no hay enlace profundo a historias).
- IA: enviar solo resumen agregado, nunca fotos ni email (RGPD). Hay que contarlo en la política de privacidad propia.

## Size

Screens 23, flows 13, entities 17. Hard parts:
1. **Sin conexión + sincronización** (IndexedDB ↔ servidor, conflictos) con fotos que nunca salen del móvil.
2. **Recap tipo historias** generado del mes (datos + fotos + reflexiones con IA) que se vea bien en el móvil.
3. **Asistente con IA sobre tus datos**: herramientas o consultas sobre el historial ("¿cuál fue mi mayor gasto?"),
   cifras que cuadren con la app, límites de uso, dictado.
Además: notificaciones push en iOS (solo PWA instalada), suscripciones con pruebas de varios tipos, PDF.

Size: **M** para el bucle principal (F01–F07, F09 sin IA: unas semanas). **L** con todo (IA, PDF,
rachas, recordatorios, push y pagos). Un clon perfecto no está prometido.
