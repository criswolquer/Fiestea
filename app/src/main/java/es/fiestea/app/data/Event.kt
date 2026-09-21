package es.fiestea.app.data

import java.time.LocalDateTime
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

enum class Category(val label: String, val emoji: String, val color: Long) {
    FIESTA_PUEBLO("Fiesta de pueblo", "🎉", 0xFFF59E0B),
    FERIA("Feria", "🎡", 0xFFEF4444),
    CONCIERTO("Concierto", "🎸", 0xFFEC4899),
    CLUB("Club", "🪩", 0xFF8B5CF6),
    FESTIVAL("Festival", "🎪", 0xFF3B82F6),
    QUEDADA("Quedada", "🍻", 0xFF10B981);

    companion object {
        fun fromCode(code: String?): Category =
            entries.firstOrNull { it.name.equals(code, ignoreCase = true) } ?: FIESTA_PUEBLO
    }
}

/** De dónde viene el evento. */
enum class Origin {
    /** Encontrado automáticamente por el importador con IA. */
    AI,
    /** Publicado por un usuario desde la app. */
    USER,
    /** Datos de ejemplo (cuando Supabase no está configurado). */
    DEMO;

    companion object {
        fun fromCode(code: String?): Origin =
            entries.firstOrNull { it.name.equals(code, ignoreCase = true) } ?: AI
    }
}

data class GeoPos(val lat: Double, val lon: Double) {
    /** Distancia en km (fórmula de Haversine). */
    fun distanceKmTo(other: GeoPos): Double {
        val r = 6371.0
        val dLat = Math.toRadians(other.lat - lat)
        val dLon = Math.toRadians(other.lon - lon)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat)) * cos(Math.toRadians(other.lat)) * sin(dLon / 2).pow(2)
        return 2 * r * asin(sqrt(a))
    }
}

data class Event(
    val id: String,
    val title: String,
    val description: String,
    val category: Category,
    val start: LocalDateTime,
    val end: LocalDateTime?,
    val venue: String,
    val address: String,
    val town: String,
    val position: GeoPos,
    /** 0.0 = gratis */
    val priceEuros: Double,
    val organizer: String,
    val sourceUrl: String?,
    val origin: Origin,
    /** Cuándo entró en la base de datos (para avisar de fiestas nuevas). */
    val discoveredAt: java.time.Instant? = null,
    /** Usuario que lo publicó (si lo publicó alguien desde la app). */
    val createdBy: String? = null,
) {
    val isFree: Boolean get() = priceEuros <= 0.0

    /** Si no hay hora de fin, se asume que dura 5 horas. */
    val effectiveEnd: LocalDateTime get() = end ?: start.plusHours(5)

    fun isOver(now: LocalDateTime = LocalDateTime.now()) = effectiveEnd.isBefore(now)
    fun hasStarted(now: LocalDateTime = LocalDateTime.now()) = !start.isAfter(now)
    fun isLive(now: LocalDateTime = LocalDateTime.now()) = hasStarted(now) && !isOver(now)

    /** "Plaza Mayor · Villalpando" sin repetir partes vacías. */
    val placeLine: String
        get() = listOf(venue, town).filter { it.isNotBlank() }.distinct().joinToString(" · ")
}

/** Evento listo para pintar, con la distancia al usuario si la conocemos. */
data class EventItem(val event: Event, val distanceKm: Double?)

/** Resumen del ambiente de una fiesta según quien está allí (últimos 90 minutos). */
data class VibeSummary(
    val votes: Int,
    /** 1 poca gente … 3 a tope */
    val crowd: Double,
    /** 0..1: proporción de gente que dice que hay cola */
    val queueRatio: Double,
    /** 1 flojo … 3 ambientazo */
    val mood: Double,
    val lastUpdate: java.time.Instant,
) {
    val crowdLabel: String
        get() = when {
            crowd < 1.67 -> "Poca gente"
            crowd < 2.34 -> "Bastante gente"
            else -> "A tope"
        }
    val crowdEmoji: String
        get() = when {
            crowd < 1.67 -> "🙂"
            crowd < 2.34 -> "😃"
            else -> "🔥"
        }
    val queueLabel: String get() = if (queueRatio >= 0.5) "Hay cola" else "Sin cola"
    val moodLabel: String
        get() = when {
            mood < 1.67 -> "Ambiente flojo"
            mood < 2.34 -> "Buen ambiente"
            else -> "Ambientazo"
        }
    /** Texto corto para las tarjetas: "🔥 A tope" */
    val short: String get() = "$crowdEmoji $crowdLabel"
}

/** Voto de un usuario sobre el ambiente. */
data class VibeVote(val crowd: Int, val queue: Boolean, val mood: Int)
