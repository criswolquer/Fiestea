# Sistema de diseño: componentes

Fuente: las 9 capturas de la tienda (`replica/screens/`, solo de referencia) y `replica/recon.md`.
Código: `ahorro/src/ui/components.ts` + `ahorro/src/styles/components.css`.
Escaparate: `npm run dev` en `ahorro/` y abrir `#/design`.
Capturas del escaparate: `sistema-oscuro.jpg` y `sistema-claro.jpg` (390 px de ancho, 4 columnas).

## Qué se ha tomado del original y qué no

| se toma (sistema, no protegible) | NO se toma |
| --- | --- |
| Interfaz oscura que sigue al tema del sistema | Sus colores (verde oscuro + lima, anillos verde, rojo, azul y morado). Aquí: coral de acento, cian para ahorro, ámbar para inversión |
| Patrón "anillo grande con la cifra del mes + 4 cifras debajo" | Su logo ∞/OO, el icono de la app y la mascota animada del asistente. Aquí: botón con icono de destellos, sin personaje |
| Un color por rol de dinero (entra, sale, se aparta, se invierte) | Sus ilustraciones, fotos y capturas de marketing |
| Donut + barras por día + reparto en 3 grupos | Space Grotesk y su tipografía de marketing. Aquí: fuente del sistema (gratis, sin descargas, va sin conexión) |
| Límites con anillo pequeño y "disponible" | Sus textos ("Balance total", "Capital", "Tus límites"…). Aquí: textos propios ("Te queda este mes", "Patrimonio", "Te quedan / Te has pasado") |
| Calendario con puntos por tipo y menú de acciones por día | Sus nombres de secciones y de funciones ("Recap", "Primeros pasos", "Meses en verde"…). Aquí: "Resumen del mes", "Meses en positivo"… |
| Resumen del mes en formato historias | |
| Barra de 3 pestañas (calendario, inicio, patrimonio) | Iconos: todos son de **Lucide** (licencia ISC), ninguno calcado |

Medido en las capturas: fondo negro puro (#000) en oscuro y blanco puro en claro; tarjetas
gris (~#434345); unos 5 grises; esquinas muy redondeadas (~20 px en tarjetas, píldora en botones);
anillos con trazo grueso y extremos redondeados. Nuestros valores son distintos a propósito:
fondo #101114, no #000.

## Tokens

`tokens.json` (fuente de verdad) → `npm run tokens` genera `ahorro/src/styles/tokens.css`
(y su copia aquí). Los componentes solo usan `var(--…)`. **No hay configuración de Tailwind**:
el stack elegido en `architecture.md` es CSS propio. Las variables CSS sustituyen el mapeo de Tailwind.

- Color (roles): `bg, surface, surface-2, border, border-input, text, text-muted, accent, on-accent,
  danger, success, warning, scrim`. Dinero: `income, expense, savings, investment`.
  Gráficos: `chart-1…7` (`chart-7` = "sin categoría"). Dos temas: oscuro (por defecto) y claro
  (`prefers-color-scheme` o `data-theme`).
- Tipo: xs 12/16 · sm 14/20 · base 16/24 · lg 20/26 · xl 28/32 · display 40/44. Cifras con `tabular-nums`.
- Espacio: 0, 4, 8, 12, 16, 20, 24, 32, 48 (`--space-0…8`).
- Radio: sm 8 · md 14 · lg 22 · pill. Sombra: card, pop. Movimiento: 120 ms, 220 ms, una curva.
- Layout: ancho máximo 480 px, margen 16, barra de pestañas 64, cabecera 52, **toque mínimo 44 px**.

Contraste (`python3 ~/.claude/skills/replica-design/contrast.py replica/design/tokens.json` y
`tokens.light.json`): **31 pares por tema, 0 fallos AA**. Además, axe-core sobre `#/design`
en los dos temas: 0 infracciones.

## Componentes

```
Button                                                  button()
  variants  primary (accent), secondary (surface-2 + borde), ghost, danger (borde y texto danger)
  sizes     sm 36px, md 44px, lg 52px; icon-only cuadrado
  states    default, hover, active (escala .97), focus-visible (anillo 2px accent), disabled (45 %),
            loading (spinner + aria-busy; el texto se mantiene)
  tokens    radius pill, font sm/600
  a11y      <button> real; icon-only lleva aria-label; nunca un <div> clicable
  used on   todas

Field / MoneyField                                      field(), moneyField(), parseMoney()
  variants  texto, importe (inputmode=decimal, sufijo €), importe grande (64px, centrado)
  states    vacío, rellenado, focus, error (borde danger + mensaje), disabled, con ayuda
  tokens    surface, border-input (3:1), radius md, 16px (iOS no hace zoom)
  a11y      <label for>, aria-invalid, aria-describedby al mensaje
  parse     acepta "12,50", "12.50", "1.234,56", "12€"; rechaza "abc" y más de 2 decimales → céntimos
  used on   S04, S07, S11, S13, S14

Ring (anillo de progreso)                               ring()
  variants  grande (cifra display + subtítulo), pequeño (% dentro), lleno (patrimonio)
  states    0 %, parcial, 100 %, superado (>100 %: el arco se queda lleno, el color pasa a danger)
  tokens    pista surface-2, arco = rol de dinero o chart-n
  a11y      role=img + aria-label con la frase completa ("Te quedan 612,50 € de 1.845,00 € este mes")
  used on   S06, S11, S12, S14

Donut                                                    donut()
  states    con datos, una sola categoría (sin hueco), vacío (estado vacío propio)
  tokens    chart-1…7; total en el centro; leyenda en 2 columnas con %
  a11y      role=img + aria-label con total y % por categoría (la leyenda repite los datos en texto)
  used on   S09

Bars (gasto por día)                                     bars()
  states    con datos, días a 0 (no se dibujan)
  a11y      role=img + aria-label con el día pico
  used on   S09

KPI (cifra del mes)                                      kpi()
  variants  income, expense, savings, investment (color del rol)
  a11y      la etiqueta es texto visible, el color no es la única pista
  used on   S06

Tile (tarjeta del inicio)                                tile()
  variants  informativa (<div>), pulsable (<button>); con icono y tono
  used on   S06 (racha, meses en positivo, hace un mes, asistente, primeros pasos)

LimitRow                                                 limitRow()
  states    ok (te quedan, success), cerca (≥85 %, warning), pasado ("Te has pasado", danger)
  a11y      el estado va en palabras, no solo en color
  used on   S11

TxRow (movimiento)                                       txRow()
  variants  con foto (miniatura 44px), sin foto (inicial), ingreso (+ income), gasto (− expense)
  a11y      <button> en <li>; texto oculto "Gasto de / Ingreso de" antes del importe
  used on   S10, S15, S08

Sheet (hoja inferior)                                    sheet()
  states    abierta (entra desde abajo), cerrando; tocar fuera, Esc o X cierran
  tokens    surface, radius lg arriba, scrim 55 %, safe-area abajo
  a11y      <dialog> con showModal(): foco atrapado y devuelto, aria-labelledby al título
  used on   S07, S13, S16

PhotoPicker                                              photoPicker()
  states    vacío (Hacer foto / De la galería), con foto (vista previa + quitar), sin permiso de cámara
            (el input de archivo deja elegir igualmente)
  a11y      <label for> sobre <input type=file>; el foco se ve en el botón visible
  used on   S07

Segmented                                                segmented()
  a11y      radios reales en un <fieldset> con <legend>; flechas del teclado gratis
  used on   S07 (gasto/ingreso), S09, S14 (%/cantidad), ajustes de tema

AllocSlider (reparto)                                    allocSlider()
  states    dentro de rango; la suma >100 % se avisa con Banner warning, no en cada slider
  a11y      <input type=range> + <output for>; altura táctil 44px
  used on   S14

Calendar                                                 calendar()
  marks     income, expense, note, reminder (warning), pot (savings): puntos de 5 px
  states    hoy (número en accent), seleccionado (fondo accent), con y sin marcas
  a11y      cada día es un <button> con aria-label "13 de noviembre: gastos, recordatorio",
            aria-pressed para el seleccionado, aria-current=date para hoy
  used on   S15

ActionMenu                                               actionMenu()
  a11y      role=menu/menuitem, tabindex itinerante, ↑ ↓ Inicio Fin
  used on   S15 (apuntar movimiento, escribir nota, crear aviso)

Stories (resumen del mes)                                stories()
  states    página n de N, última → cerrar; tono por página (accent, income, savings…)
  input     tocar la derecha = siguiente, la izquierda = anterior, ← → en teclado, Esc cierra
  a11y      <dialog>, contenido en aria-live, "Página n de N" para lectores de pantalla;
            sin avance automático (cada uno va a su ritmo; respeta reduced-motion)
  used on   S18

ChatBubble / ChatComposer / MicButton                    chatBubble(), chatComposer(), micButton()
  variants  usuario (accent), asistente (surface-2), saludo del día (borde accent + "Tu resumen de hoy")
  states    escribiendo, límite alcanzado (deshabilitado con el motivo en el placeholder),
            micro escuchando (danger + pulso, aria-pressed), micro no disponible (no se muestra)
  a11y      prefijo oculto "Tú:" / "Asistente:"; <label> del textarea
  used on   S17

AssistantFab                                             assistantFab()
  nota      sustituye a la mascota del original: botón con icono de destellos, sin personaje
  used on   S06

MonthSwitcher                                            monthSwitcher()
  states    mes siguiente deshabilitado en el mes actual; (i) opcional
  a11y      el título del mes es aria-live (anuncia el cambio)
  used on   S06, S09, S15

Tabbar                                                   tabbar()
  a11y      <nav> con enlaces y aria-current=page; iconos con texto
  used on   global (Calendario · Inicio · Patrimonio)

PlanCard                                                 planCard()
  variants  normal, destacado (borde accent + "Recomendado")
  nota      los precios del escaparate son de ejemplo; los decide replica-launch
  used on   S05 (fase 5)

Toast / Banner                                           toast(), banner()
  variants  info, success, warning, danger
  a11y      toasts en role=status aria-live=polite; banner danger = role=alert
  used on   global

EmptyState                                               emptyState()
  a11y      título + explicación + una acción; nunca una pantalla en blanco
  used on   todas las listas y gráficos (S06, S09, S10, S11, S12, S15, S17)
```

## Textos

Todos están escritos aquí, ninguno se ha copiado del original. Tono: de tú, frases cortas,
sin culpa. Por ejemplo, "Te has pasado", no "Has excedido tu presupuesto". Las cifras siempre
llevan formato es-ES con punto de miles: `1.845,00 €`.
