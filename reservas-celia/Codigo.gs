/**
 * Reservas de Celia: conecta la web con el Google Calendar del salón.
 *
 * - La web pregunta qué horas están libres un día (mira el horario y el calendario).
 * - Cuando una clienta reserva, se crea la cita en el calendario, se avisa a Celia por email
 *   y, si la clienta dejó su email, se le manda la confirmación.
 * - Cada día a las 10:00 se manda un recordatorio a las clientas con cita al día siguiente.
 *
 * Cómo instalarlo: mira INSTRUCCIONES.md (en esta misma carpeta).
 */

const CONFIG = {
  nombreSalon: "Celia",
  direccion: "Calle Cristóbal Colón, 10, 29100 Coín, Málaga",
  telefono: "+34 615 24 04 67",
  zona: "Europe/Madrid",

  // Calendario donde se guardan las citas. "" = el calendario principal de la cuenta.
  calendarioId: "",

  // Horario (formato 24 h). 0 = domingo, 1 = lunes … 6 = sábado. Debe coincidir con la web.
  horario: {
    0: [],
    1: [],
    2: [["09:30", "20:00"]],
    3: [["09:30", "20:00"]],
    4: [["09:30", "20:00"]],
    5: [["09:30", "20:00"]],
    6: [["09:00", "14:00"]],
  },
  intervaloMin: 30,      // cada cuántos minutos se ofrece una hora
  antelacionMin: 60,     // antelación mínima para reservar
  diasMax: 60,           // hasta cuántos días vista se puede reservar
  duracionMax: 360,      // duración máxima de una cita, en minutos
  avisarmePorEmail: true // email a Celia con cada reserva nueva
};

/* ------------------------------------------------------------------ */

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.accion === "huecos") {
      if (!fechaValida_(p.fecha)) return json_({ ok: false, error: "fecha" });
      const dur = duracion_(p.dur);
      return json_({ ok: true, fecha: p.fecha, huecos: huecos_(p.fecha, dur) });
    }
    return json_({ ok: true, salon: CONFIG.nombreSalon });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: "servidor" });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (d.web) return json_({ ok: true }); // campo trampa para robots

    const nombre = limpiar_(d.nombre, 60);
    const telefono = limpiar_(d.telefono, 30);
    const email = limpiar_(d.email, 120);
    const nota = limpiar_(d.nota, 500);
    const precio = limpiar_(d.precio, 40);
    const servicios = (Array.isArray(d.servicios) ? d.servicios : []).slice(0, 8).map((s) => limpiar_(s, 80)).filter(Boolean);
    const dur = duracion_(d.dur);

    if (!nombre || telefono.replace(/\D/g, "").length < 9 || !servicios.length || !fechaValida_(d.fecha) || !/^\d{2}:\d{2}$/.test(d.hora || "")) {
      return json_({ ok: false, error: "datos" });
    }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json_({ ok: false, error: "email" });

    // Máximo 3 reservas por teléfono cada 6 horas (evita abusos)
    const cache = CacheService.getScriptCache();
    const clave = "tel" + telefono.replace(/\D/g, "");
    const usadas = Number(cache.get(clave) || 0);
    if (usadas >= 3) return json_({ ok: false, error: "limite" });

    lock.waitLock(20000);
    if (huecos_(d.fecha, dur).indexOf(d.hora) < 0) return json_({ ok: false, error: "ocupado" });

    const inicio = fecha_(d.fecha, aMin_(d.hora));
    const fin = new Date(inicio.getTime() + dur * 60000);
    const descripcion = [
      "Clienta: " + nombre,
      "Teléfono: " + telefono,
      email ? "Email: " + email : null,
      "Servicios: " + servicios.join(", "),
      precio ? "Precio orientativo: " + precio : null,
      nota ? "Comentarios: " + nota : null,
      "",
      "Reservada desde la web.",
    ].filter((l) => l !== null).join("\n");

    const ev = calendario_().createEvent(nombre + " · " + servicios.join(" + "), inicio, fin, {
      description: descripcion,
      location: CONFIG.direccion,
    });
    ev.setColor(CalendarApp.EventColor.MAUVE);
    ev.setTag("web", "1");
    ev.setTag("nombre", nombre);
    if (email) ev.setTag("email", email);
    cache.put(clave, String(usadas + 1), 21600);

    const cuando = fechaLarga_(inicio);
    if (email) enviarConfirmacion_(email, nombre, servicios, cuando);
    if (CONFIG.avisarmePorEmail) {
      MailApp.sendEmail({
        to: Session.getEffectiveUser().getEmail(),
        subject: "Nueva cita: " + nombre + ", " + cuando,
        body: descripcion + "\n\nDía: " + cuando + " (" + dur + " min)",
      });
    }
    return json_({ ok: true, cuando: cuando });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: "servidor" });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ---------- Recordatorios ---------- */

// Ejecuta esta función UNA vez para que los recordatorios se manden solos cada día a las 10:00.
function activarRecordatorios() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "enviarRecordatorios")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("enviarRecordatorios").timeBased().everyDays(1).atHour(10).inTimezone(CONFIG.zona).create();
}

function enviarRecordatorios() {
  const hoy = Utilities.formatDate(new Date(), CONFIG.zona, "yyyy-MM-dd");
  const manana = new Date(Utilities.parseDate(hoy + " 00:00", CONFIG.zona, "yyyy-MM-dd HH:mm").getTime() + 36 * 3600000);
  const ymd = Utilities.formatDate(manana, CONFIG.zona, "yyyy-MM-dd");
  calendario_().getEvents(fecha_(ymd, 0), fecha_(ymd, 1439)).forEach((ev) => {
    const email = ev.getTag("email");
    if (!email || ev.getTag("recordado")) return;
    const nombre = ev.getTag("nombre") || "";
    MailApp.sendEmail({
      to: email,
      name: CONFIG.nombreSalon,
      subject: "Recordatorio: mañana tienes cita en " + CONFIG.nombreSalon,
      htmlBody:
        "<p>Hola" + (nombre ? ", " + esc_(nombre) : "") + ":</p>" +
        "<p>Te recordamos tu cita de <b>mañana, " + esc_(fechaLarga_(ev.getStartTime())) + "</b>.</p>" +
        "<p>📍 " + esc_(CONFIG.direccion) + "</p>" +
        "<p>Si no puedes venir, avísanos cuanto antes por WhatsApp o al " + esc_(CONFIG.telefono) + ".</p>" +
        "<p>¡Hasta mañana!<br>" + esc_(CONFIG.nombreSalon) + "</p>",
    });
    ev.setTag("recordado", "1");
  });
}

// Ejecuta esta función una vez al instalar para dar permisos y comprobar que todo va bien.
function probar() {
  const cal = calendario_();
  console.log("Calendario: " + cal.getName());
  console.log("Emails que se pueden enviar hoy: " + MailApp.getRemainingDailyQuota());
  const hoy = Utilities.formatDate(new Date(), CONFIG.zona, "yyyy-MM-dd");
  console.log("Horas libres hoy para 60 min: " + huecos_(hoy, 60).join(", "));
}

/* ---------- Funciones internas ---------- */

function huecos_(ymd, dur) {
  const mediodia = Utilities.parseDate(ymd + " 12:00", CONFIG.zona, "yyyy-MM-dd HH:mm");
  const dias = (mediodia.getTime() - Date.now()) / 86400000;
  if (dias < -1 || dias > CONFIG.diasMax) return [];
  const dow = Number(Utilities.formatDate(mediodia, CONFIG.zona, "u")) % 7; // u: 1 = lunes … 7 = domingo
  const tramos = CONFIG.horario[dow] || [];
  if (!tramos.length) return [];

  const eventos = calendario_().getEvents(fecha_(ymd, 0), fecha_(ymd, 1439));
  if (eventos.some((ev) => ev.isAllDayEvent())) return []; // un evento de todo el día cierra el día
  const ocupado = eventos.map((ev) => [ev.getStartTime().getTime(), ev.getEndTime().getTime()]);

  const minimo = Date.now() + CONFIG.antelacionMin * 60000;
  const libres = [];
  tramos.forEach((t) => {
    for (let m = aMin_(t[0]); m + dur <= aMin_(t[1]); m += CONFIG.intervaloMin) {
      const ini = fecha_(ymd, m).getTime();
      const fin = ini + dur * 60000;
      if (ini < minimo) continue;
      if (ocupado.some((o) => ini < o[1] && fin > o[0])) continue;
      libres.push(hhmm_(m));
    }
  });
  return libres;
}

function enviarConfirmacion_(email, nombre, servicios, cuando) {
  MailApp.sendEmail({
    to: email,
    name: CONFIG.nombreSalon,
    subject: "Tu cita en " + CONFIG.nombreSalon + ": " + cuando,
    htmlBody:
      "<p>Hola, " + esc_(nombre) + ":</p>" +
      "<p>Tu cita está reservada para el <b>" + esc_(cuando) + "</b>.</p>" +
      "<p>Servicios: " + esc_(servicios.join(", ")) + "</p>" +
      "<p>📍 " + esc_(CONFIG.direccion) + "</p>" +
      "<p>Si no puedes venir, avísanos con al menos 24 horas por WhatsApp o al " + esc_(CONFIG.telefono) + ".</p>" +
      "<p>¡Te esperamos!<br>" + esc_(CONFIG.nombreSalon) + "</p>",
  });
}

function calendario_() {
  return CONFIG.calendarioId ? CalendarApp.getCalendarById(CONFIG.calendarioId) : CalendarApp.getDefaultCalendar();
}

function fecha_(ymd, minutos) {
  return Utilities.parseDate(ymd + " " + hhmm_(minutos), CONFIG.zona, "yyyy-MM-dd HH:mm");
}

function fechaLarga_(d) {
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const dow = Number(Utilities.formatDate(d, CONFIG.zona, "u")) % 7;
  const mes = Number(Utilities.formatDate(d, CONFIG.zona, "M")) - 1;
  return dias[dow] + " " + Utilities.formatDate(d, CONFIG.zona, "d") + " de " + meses[mes] + " a las " + Utilities.formatDate(d, CONFIG.zona, "HH:mm");
}

function fechaValida_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); }
function duracion_(v) { return Math.min(Math.max(parseInt(v, 10) || 30, 15), CONFIG.duracionMax); }
function aMin_(t) { const p = t.split(":"); return Number(p[0]) * 60 + Number(p[1]); }
function hhmm_(m) { return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); }
function limpiar_(v, max) { return String(v || "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max); }
function esc_(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
