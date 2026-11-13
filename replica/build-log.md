# Registro de construcción

App: `ahorro/` (nombre provisional). Stack: Vite + TypeScript sin framework, IndexedDB, PWA.
Todas las pantallas se probaron en Chromium a 390 px (y el inicio a 1440 px) con datos de ejemplo:
0 errores de consola, ninguna pantalla se sale por los lados y el recorrido principal se puede hacer solo con teclado.
Las capturas están en `replica/clone-screens/` para replica-diff.

| ID | fecha | estado | qué falta | más difícil de lo previsto |
| --- | --- | --- | --- | --- |
| S01 Bienvenida | 2026-11-13 | hecho | — | — |
| S02 Cuestionario | 2026-11-13 | hecho | — | — |
| S03 Registro | — | no hecho | fase 4 (cuentas con Supabase) | — |
| S04 Primeros pasos | 2026-11-13 | hecho | — | Los saldos iniciales de las huchas no pueden contar como «ahorrado este mes» ni restar del disponible: se marcan con `initial` |
| S05 Planes | — | no hecho | fase 5 (Stripe); el componente está en `#/design` | — |
| S06 Inicio | 2026-11-13 | hecho | — | — |
| S07 Nuevo movimiento | 2026-11-13 | hecho | — | La foto se comprime en el navegador (1280 px) para no llenar el móvil |
| S08 Detalle | 2026-11-13 | hecho | — | — |
| S09 Gráficos | 2026-11-13 | hecho | — | — |
| S10 Categoría | 2026-11-13 | hecho | — | — |
| S11 Límites | 2026-11-13 | hecho | — | — |
| S12 Patrimonio | 2026-11-13 | hecho | — | La fórmula del «disponible»: partida + ingresos − gastos − aportes + retiradas, desde la fecha de partida |
| S13 Aporte/retirada | 2026-11-13 | hecho | — | — |
| S14 Plan | 2026-11-13 | hecho | — | — |
| S15 Calendario | 2026-11-13 | hecho | — | Se salía 6 px a 390 px: corregido |
| S16 Avisos | 2026-11-13 | parcial | Notificaciones push: sin servidor, los avisos salen al abrir la app | — |
| S17 Asistente | 2026-11-13 | parcial | No probado con una clave real; sin límite diario (fase 5) | Separado en dos partes para que el SDK de Claude (380 KB) solo se descargue al abrir el asistente |
| S18 Resumen del mes | 2026-11-13 | hecho | Preguntas de reflexión fijas (sin IA) | — |
| S19 Hace un mes | 2026-11-13 | hecho | — | — |
| S20 Rachas | 2026-11-13 | hecho | — | — |
| S21 Informe PDF | 2026-11-13 | hecho | — | jsPDF solo admite Latin-1: el signo menos tipográfico se cambia por guion |
| S22 Qué significan las cifras | 2026-11-13 | hecho | — | — |
| S23 Ajustes | 2026-11-13 | hecho | «Eliminar cuenta» es «Borrar todo» mientras no haya cuentas | — |
| extra: categorías, lista del mes | 2026-11-13 | hecho | — | — |
| extra: cuentas e importar extracto | 2026-11-13 | hecho | Conexión automática con el banco (necesitaría un agregador bancario autorizado y servidor) | El lector de Excel se ha escrito sin librerías (zip + XML) para no arrastrar dependencias con vulnerabilidades |
| extra: fijos, puedes gastar al día, mover dinero, valor de inversión, bienvenida corta, privacidad, pruebas automáticas | 2026-11-15 | hecho | Recordatorio diario (servidor de notificaciones), gastos compartidos (cuentas) | Las pruebas destaparon que el primer gasto sin ingresos salía como «gastado de más»: corregido |
