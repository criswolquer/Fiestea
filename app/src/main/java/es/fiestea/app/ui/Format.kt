package es.fiestea.app.ui

import es.fiestea.app.data.Event
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private val ES = Locale.forLanguageTag("es-ES")
private val DAY = DateTimeFormatter.ofPattern("EEE d MMM", ES)
private val DAY_LONG = DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", ES)
private val TIME = DateTimeFormatter.ofPattern("HH:mm", ES)

fun dayLabel(date: LocalDate, today: LocalDate = LocalDate.now()): String = when (date) {
    today -> "Hoy"
    today.plusDays(1) -> "Mañana"
    else -> date.format(DAY).replaceFirstChar { it.uppercase() }
}

/** "Hoy · 22:00", "En curso · hasta 03:00", "Sáb 27 sep · 21:30" */
fun whenLabel(e: Event, now: LocalDateTime = LocalDateTime.now()): String {
    if (e.isLive(now)) {
        val endDay = e.effectiveEnd.toLocalDate()
        val until = if (endDay == now.toLocalDate() || endDay == now.toLocalDate().plusDays(1) && e.effectiveEnd.hour < 10) {
            e.effectiveEnd.format(TIME)
        } else {
            dayLabel(endDay).lowercase(ES)
        }
        return "En curso · hasta $until"
    }
    return "${dayLabel(e.start.toLocalDate())} · ${e.start.format(TIME)}"
}

/** Texto largo para la ficha: "sábado 27 de septiembre, 21:30 – 03:00" */
fun fullWhenLabel(e: Event): String {
    val start = e.start.format(DAY_LONG).replaceFirstChar { it.uppercase() } + ", " + e.start.format(TIME)
    val end = e.end ?: return start
    return if (end.toLocalDate() == e.start.toLocalDate() ||
        (end.toLocalDate() == e.start.toLocalDate().plusDays(1) && end.hour < 10)
    ) {
        "$start – ${end.format(TIME)}"
    } else {
        "$start – ${end.format(DAY_LONG)}, ${end.format(TIME)}"
    }
}

fun priceLabel(e: Event): String =
    if (e.isFree) "Gratis"
    else if (e.priceEuros % 1.0 == 0.0) "${e.priceEuros.toInt()} €"
    else String.format(ES, "%.2f €", e.priceEuros)

fun distanceLabel(km: Double?): String? = when {
    km == null -> null
    km < 1 -> "${(km * 1000).toInt()} m"
    km < 10 -> String.format(ES, "%.1f km", km)
    else -> "${km.toInt()} km"
}
