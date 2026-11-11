# Trazo

Cuaderno digital para tomar apuntes a mano en iPhone, iPad y ordenador, con herramientas de IA para estudiar.
Es una app web instalable (PWA): se abre en Safari y se añade a la pantalla de inicio, y funciona sin conexión.

## Instalar en el iPhone o iPad

1. Abre la dirección de la app en **Safari**.
2. Pulsa **Compartir** → **Añadir a pantalla de inicio**.
3. Ábrela desde el icono: se ve a pantalla completa, como una app normal.

Los cuadernos se guardan en el propio dispositivo.

## Funciones

**Escritura**
- 8 plumas: bolígrafo, estilográfica, pincel, lápiz, fluorescente, discontinua, punteada y ondulada. Las plumas que varían el grosor responden a la presión del Apple Pencil.
- Colores predefinidos y selector libre; grosor ajustable.
- **Formas automáticas**: dibuja un círculo, un rectángulo, un triángulo o una línea y mantén el lápiz quieto un momento para que se convierta en una forma perfecta. También hay una herramienta de formas (línea, flecha, rectángulo, elipse, triángulo).
- Borrador de trazos, texto escrito con teclado, selección para mover, duplicar, cambiar de color o pasar a otra capa.
- Deshacer y rehacer.
- Modo **"solo Apple Pencil"** (en Ajustes): el dedo desplaza y hace zoom, y el lápiz escribe.

**Herramientas especiales**
- **Pluma que desaparece**: notas temporales que se borran solas a los 2 segundos.
- **Puntero láser**: para señalar o presentar sin dejar marca.
- **Ocultar para memorizar**: tapa partes de la página y tócalas para descubrirlas.
- **Captura**: recorta una zona de la página para copiarla, guardarla, pegarla o preguntar a la IA.
- **Capas**: tres capas por página, que se pueden ocultar, atenuar y vaciar. Sirven para resolver el mismo problema varias veces.

**Organización**
- Biblioteca con carpetas, favoritos, recientes, búsqueda y portadas de colores.
- 9 plantillas (en blanco, rayado, rayado estrecho, cuadrícula, puntos, Cornell, pentagrama, lista de tareas y planificador semanal) y 4 colores de papel.
- Tamaños de página: A4, Carta, Cuadrado, Móvil y **Nota grande**.
- **Ampliar página** hacia abajo o el margen derecho, para tener espacio extra junto a un PDF.
- **Vista de cuadrícula** para saltar entre páginas, reordenarlas, duplicarlas o borrarlas.
- **Páginas duales**: el mismo cuaderno en dos paneles independientes.
- **Imagen en imagen**: ventana flotante y ampliable con cualquier página.
- **Documentos asociados**: enlaza otros cuadernos para abrirlos o verlos al lado.
- **Protección con contraseña** por cuaderno.

**Importar y exportar**
- Importa PDFs (cada página se convierte en una página donde escribir) e imágenes.
- Exporta a PDF o una página a PNG.
- Copia de seguridad completa (Ajustes) para pasar los cuadernos a otro dispositivo.

**Productividad**
- Calculadora científica, temporizador y cronómetro.
- Navegador integrado.
- Grabación de voz con transcripción en vivo (si el navegador la ofrece).

**IA (con Claude)**
- **Resumen** de una página o del cuaderno entero.
- **Cuestionario** tipo test interactivo, con explicaciones.
- **Tarjetas de memoria** que se giran y se repasan.
- **Pluma IA**: rodea un ejercicio o una fórmula y pregunta; la respuesta se puede insertar en la página.
- **Resumen de audio**: resume la transcripción de una grabación.
- **Resumen de texto**: pega la transcripción de un vídeo de YouTube, de una clase o un artículo.

La IA lee la letra manuscrita a partir de una imagen de cada página. Para usarla, añade tu clave de API de Claude en **Ajustes**: se guarda solo en el dispositivo y las peticiones van directamente del navegador a la API de Anthropic.

## Limitaciones

- **No hay sincronización en la nube.** Para pasar cuadernos de un dispositivo a otro, usa la copia de seguridad.
- **Contraseña:** impide abrir el cuaderno dentro de la app, pero no cifra los datos del dispositivo.
- **YouTube:** la app no descarga la transcripción por sí sola. Hay que copiarla de YouTube ("Mostrar transcripción") y pegarla.
- **Navegador integrado:** algunas webs no se dejan mostrar dentro de otra app. Para esas está el botón "Abrir fuera".
- **Transcripción de voz:** depende del navegador. Safari la ofrece en iOS 14.5 o posterior. Si no está disponible, se guarda solo el audio y la transcripción se puede escribir a mano.

## Desarrollo

```bash
npm install
npm run dev       # servidor local (accesible desde el móvil en la misma red)
npm run build     # compila en dist/
npm run preview   # sirve la versión compilada
```

Está hecha con TypeScript y Vite, sin frameworks. Los datos se guardan en IndexedDB. Usa `pdfjs-dist` para importar PDFs, `jspdf` para exportarlos y `@anthropic-ai/sdk` para la IA.

| Archivo | Contenido |
|---|---|
| `src/editor.ts` | Lienzo, herramientas, capas, zoom, páginas y paneles |
| `src/render.ts` | Dibujo de plantillas, plumas, formas, texto y reconocimiento de formas |
| `src/library.ts` | Biblioteca, carpetas y creación de cuadernos |
| `src/ai.ts`, `src/aiviews.ts` | Llamadas a Claude y pantallas de resumen, cuestionario y tarjetas |
| `src/files.ts` | Importar y exportar PDF e imágenes, copias de seguridad |
| `src/widgets.ts`, `src/recorder.ts` | Calculadora, temporizador, navegador y grabadora |
| `src/db.ts`, `src/types.ts` | Almacenamiento y modelo de datos |

### Publicación

`.github/workflows/deploy.yml` publica la app en GitHub Pages en cada push a `main`. Hay que activarlo una vez en el repositorio: **Settings → Pages → Source: GitHub Actions**.
