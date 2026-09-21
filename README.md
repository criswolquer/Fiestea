# Fiestea 🎉

App Android para descubrir **fiestas de discoteca, sesiones de DJ, fiestas temáticas y ocio nocturno** cerca de ti (y, si quieres, también fiestas de pueblo y ferias).
**Las fiestas se buscan en internet de forma automática cada noche con IA**; no hay que cargarlas a mano.

```
 ┌────────────────────────┐   cada noche   ┌──────────────┐   lee    ┌──────────────┐
 │ GitHub Actions (gratis)│ ─────────────► │  Supabase    │ ◄─────── │  App Android │
 │ importer/ + Claude IA  │   guarda       │ (base datos) │          │  (tu Pixel)  │
 │ + búsqueda web         │                └──────────────┘          └──────────────┘
 └────────────────────────┘
```

## Qué hay en el proyecto

| Carpeta | Qué es |
|---|---|
| `app/` | App Android (Kotlin + Jetpack Compose). Mapa con OpenStreetMap (sin API key). |
| `importer/` | Script en Python: busca con Claude y búsqueda web (por defecto, discotecas y ocio nocturno), saca el cartel de cada fiesta, las sitúa en el mapa, quita duplicados y las guarda en Supabase. |
| `supabase/schema.sql` | Tabla de eventos y reglas de seguridad. |
| `.github/workflows/` | Ejecuta el importador automáticamente una vez al día (03:00 UTC). |

### Funciones de la app
- **Explorar**: lista "Esta noche cerca de ti" y "Próximamente", o vista de mapa. Con **fotos/carteles** de cada fiesta.
- **Zona 📍**: "Cerca de mí" (GPS) o cualquier provincia. Si no hay nada cerca, enseña otras zonas en vez de quedarse vacía.
- **Filtros**: hoy, este finde, 7 días, gratis, tipo de fiesta y distancia. También hay buscador.
- **Ficha**: fecha, lugar, distancia, precio, botón **Voy**, **Cómo llegar**, compartir y guardar.
- **Etiqueta ✨ "Detectado automáticamente"** con enlace a la fuente original.
- **"Esta información es incorrecta"**: con 3 avisos la fiesta se oculta para todos.
- **Publicar**: cualquiera con cuenta puede subir su fiesta y elegir el sitio en el mapa (y borrarla después).
- **Mis planes**: fiestas a las que vas (con valoración cuando ya han empezado), guardadas y publicadas.
- **Cuentas de usuario** (email y contraseña): necesarias para publicar, avisar de errores y contar el ambiente. Explorar no requiere cuenta.
- **Ambiente en directo** 🔥: quien está en la fiesta (a menos de 1,5 km) cuenta si hay poca gente, bastante o que está a tope, si hay cola y cómo está el ambiente. Se muestra el resumen de los últimos 90 minutos en la ficha y en las tarjetas.
- **Avisos** 🔔:
  - Recordatorio la tarde antes (18:00) de las fiestas marcadas con "Voy"; si te apuntas el mismo día, 2 horas antes.
  - "Fiestas nuevas cerca de ti": cada ~6 horas la app comprueba si el buscador ha encontrado fiestas nuevas en tu zona (radio y tipos configurables) y te avisa.
  - Al pulsar el aviso se abre directamente la ficha de la fiesta.

---

## Paso 0 · Probarla ya en tu móvil (sin configurar nada)

1. Abre la carpeta `Fiestea` en **Android Studio** (File → Open).
2. Espera a que termine el "Gradle sync". Si Android Studio sugiere actualizar AGP o Gradle, puedes aceptar.
3. Conecta tu Pixel con la depuración USB activada y pulsa ▶ Run.

Sin Supabase, la app muestra **eventos de ejemplo en Madrid** para que veas cómo funciona.

## Paso 1 · Base de datos (Supabase, gratis) · 5 min

1. Crea una cuenta en https://supabase.com y luego un proyecto nuevo (región: Europa).
2. Ve a **SQL Editor → New query**, pega el contenido de `supabase/schema.sql` y pulsa **Run**.
   (Si ya lo habías ejecutado con una versión anterior, vuelve a ejecutarlo: se actualiza sin perder datos.)
3. En **Project Settings → API** copia:
   - **Project URL** → `https://xxxx.supabase.co`
   - Clave **anon public**, que va en la app.
   - Clave **service_role**, que va en el importador. **No la pongas nunca en la app.**

### Cuentas de usuario
Las cuentas con email vienen activadas por defecto en Supabase. Por defecto, Supabase pide **confirmar el email** con un enlace; la app lo gestiona ("te hemos enviado un correo…").
- Para probar más rápido puedes desactivarlo en **Authentication → Sign In / Providers → Email → Confirm email**.
- El servidor de correo incluido en Supabase tiene un límite bajo de envíos por hora. Para producción, configura el tuyo en **Authentication → Emails → SMTP Settings**.

## Paso 2 · Conectar la app

Crea o edita el archivo `local.properties` en la raíz del proyecto (Android Studio ya crea uno) y añade:

```properties
supabase.url=https://xxxx.supabase.co
supabase.anonKey=eyJhbGciOi...tu_clave_anon
```

Vuelve a ejecutar la app. Ahora lee las fiestas reales de tu base de datos.

## Paso 3 · Clave de la IA

1. Entra en https://console.anthropic.com, añade saldo y crea una **API key**.
2. **Coste**: cada provincia supone una consulta a la IA por cada enfoque (por defecto 2), con hasta 10–14 búsquedas web cada una, y el robot se ejecuta 2 veces al día. Tras la primera ejecución, mira en la consola de Anthropic (**Usage**) cuánto ha costado y ajusta:
   - Menos provincias (`PROVINCES`) o menos enfoques (`SEARCH_FOCUSES`).
   - Al final de cada ejecución, el registro del robot muestra una **estimación del coste** ("Consumo IA… coste aproximado").
   - Si se acaba el saldo, el robot se para, guarda lo que haya encontrado y marca la ejecución en rojo.
   - Por defecto usa el modelo **Haiku**, el más barato. Si quieres más precisión (y más coste), crea la variable `CLAUDE_MODEL` = `claude-sonnet-5`.
   - `MAX_SEARCHES` limita las búsquedas web por consulta (por ejemplo `3` para gastar menos).

## Paso 4 · Automatizarlo cada noche (GitHub, gratis)

1. Sube el proyecto a un repositorio de GitHub (puede ser privado).
2. En el repositorio, ve a **Settings → Secrets and variables → Actions → New repository secret** y crea:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` (la clave service_role)
3. Pestaña **Actions → "Importar fiestas con IA" → Run workflow** para la primera carga.
   A partir de ahí se ejecuta solo **todas las noches**.

### Ajustes opcionales (en "Variables", no en "Secrets")
| Variable | Para qué | Por defecto |
|---|---|---|
| `PROVINCES` | Limitarlo a ciertas provincias, p. ej. `Zamora,León,Salamanca` (se buscan todas cada noche) | Toda España en rotación |
| `PROVINCES_PER_RUN` | Provincias por ejecución en modo rotación (si no pones `PROVINCES`) | 3 |
| `DAYS_AHEAD` | Cuántos días hacia delante buscar | 21 |
| `CLAUDE_MODEL` | Modelo de IA | `claude-haiku-4-5-20251001` |
| `MAX_SEARCHES` | Máximo de búsquedas web por consulta | 4–6 según el tipo |
| `SEARCH_FOCUSES` | Qué buscar, separado por comas: `discotecas` (programación de cada discoteca/club y webs de entradas), `noche` (fiestas temáticas, universitarias, salas, conciertos), `fiestas` (agendas oficiales, ferias, fiestas de ciudades), `pueblos` (fiestas de pueblos, comarca por comarca) | `discotecas,noche` |
| `CONTACT_EMAIL` | Contacto para el servicio de mapas Nominatim (lo piden sus normas) | — |

## Probar el importador en tu ordenador

```bash
cd importer
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
python import_events.py --dry-run --provinces "Zamora"
```

`--dry-run` muestra las fiestas encontradas en pantalla sin guardarlas en la base de datos.

---

## Cómo evita errores la IA
- Solo acepta fiestas con **fecha concreta** y **URL de la fuente**. Descarta las que ya pasaron o duran más de 20 días.
- Sitúa cada fiesta con OpenStreetMap y descarta las que caen fuera de España.
- Detecta duplicados: "Fiestas de San Roque 2026" y "Fiesta San Roque" en el mismo pueblo y día cuentan como una sola.
- Borra cada noche las fiestas terminadas hace más de 2 días.
- Los usuarios pueden avisar de errores; con 3 avisos la fiesta desaparece.

## Seguridad de los datos (probado)
- Sin cuenta solo se puede **leer**. Publicar, votar el ambiente y avisar de errores exige sesión.
- Nadie puede publicar a nombre de otro, ni hacerse pasar por el buscador automático.
- Cada usuario solo puede borrar lo que ha publicado.
- Cada usuario cuenta **una sola vez** al avisar de un error, aunque pulse varias veces.
- Los votos de ambiente son anónimos: solo se publica el resumen (media de los últimos 90 minutos), nunca quién votó qué.

## Siguientes pasos posibles
- Planes con amigos: ver qué amigos van y crear grupos.
- Fotos de los eventos (Supabase Storage).
- Perfil para discotecas y ayuntamientos, con fiestas destacadas.
- Avisos push desde el servidor (Firebase Cloud Messaging) para avisar al instante, sin esperar a la comprobación periódica.

## Notas técnicas
- `minSdk 26`, `targetSdk 35`, AGP 8.7, Kotlin 2.1, Compose BOM 2024.12.
- Mapa: osmdroid + teselas de OpenStreetMap. Para mucho tráfico conviene un proveedor de teselas propio (MapTiler, Stadia…).
- Las horas se guardan como hora local del lugar, sin zona horaria.
- Avisos con WorkManager: siguen funcionando tras reiniciar el móvil. Android puede retrasar la comprobación periódica unos minutos para ahorrar batería.
