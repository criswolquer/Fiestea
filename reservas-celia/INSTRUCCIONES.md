# Reservas automáticas de Celia en Google Calendar

Con esto, cuando una clienta reserva en la web:

- la cita se guarda sola en el **Google Calendar de Celia**;
- la web solo ofrece **horas libres de verdad** (mira el horario y el calendario);
- Celia recibe un **email de aviso** con cada cita nueva;
- si la clienta deja su email, recibe la **confirmación** y un **recordatorio** el día anterior.

Coste: **0 €**. Tiempo: unos 15–20 minutos, una sola vez.

---

## Paso 1. Crear el proyecto (con la cuenta de Google de Celia)

1. Entra en **https://script.google.com** con el Gmail de Celia.
2. Pulsa **Nuevo proyecto**.
3. Arriba a la izquierda, cambia el nombre "Proyecto sin título" por **Reservas Celia**.
4. Borra todo lo que hay en el editor y **pega el contenido de `Codigo.gs`**.
5. Pulsa el icono de **guardar** (💾).

## Paso 2. Dar permisos y probar

1. En el desplegable de funciones (arriba, junto a "Ejecutar"), elige **probar** y pulsa **Ejecutar**.
2. Google pedirá permisos: **Revisar permisos** → elige la cuenta de Celia.
3. Saldrá "Google no ha verificado esta aplicación". Es normal, porque la app es vuestra: pulsa **Configuración avanzada** → **Ir a Reservas Celia (no seguro)** → **Permitir**.
4. Abajo, en el registro, debe salir el nombre del calendario y las horas libres de hoy.

## Paso 3. Activar los recordatorios

1. En el desplegable, elige **activarRecordatorios** y pulsa **Ejecutar**.
2. Listo: cada día a las 10:00 se mandan los recordatorios de las citas del día siguiente.

## Paso 4. Publicarlo

1. Arriba a la derecha: **Implementar** → **Nueva implementación**.
2. En el engranaje ⚙️ de "Seleccionar tipo", elige **Aplicación web**.
3. Rellena:
   - Descripción: `Reservas web`
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
4. Pulsa **Implementar** y **copia la URL de la aplicación web** (termina en `/exec`).
5. **Esa URL se la pasas a Claude** (o la pegas tú en `reservasURL` dentro de la web).

> Si algún día cambias el código: **Implementar** → **Gestionar implementaciones** → lápiz ✏️ → Versión: **Nueva versión** → **Implementar**. Así la URL no cambia.

---

## Uso diario

- **Ver citas:** en la app de Google Calendar. Las de la web salen en color malva con el nombre y los servicios.
- **Bloquear horas** (médico, descanso…): crea un evento en el calendario a esa hora y la web dejará de ofrecerla.
- **Cerrar un día entero** (festivo, vacaciones): crea un evento de **todo el día**.
- **Cancelar o mover una cita:** borra o mueve el evento y avisa a la clienta por WhatsApp (su teléfono está en la descripción del evento).
- **Cambiar el horario:** cámbialo en `CONFIG.horario` de este código **y** en la web, para que coincidan.

## Importante

- Cualquier evento del calendario principal de Celia ocupa ese hueco. Si prefiere separar lo personal, crea un calendario nuevo, por ejemplo "Citas salón", y pon su ID en `calendarioId` (lo encuentras en Configuración del calendario → Integrar el calendario).
- Google permite enviar unos 100 emails al día con una cuenta gratuita: de sobra para un salón.
- La web tiene que estar publicada en internet (por ejemplo, en Netlify) para que la reserva automática funcione. Dentro de la vista de Claude seguirá funcionando por WhatsApp.
