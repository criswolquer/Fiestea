package es.fiestea.app.data

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/**
 * Eventos de ejemplo para que la app funcione sin backend.
 * Solo se usan cuando SUPABASE_URL está vacío en local.properties.
 * Las fechas son relativas a hoy para que siempre haya algo "esta noche".
 */
object SeedEvents {

    val DEFAULT_CENTER = GeoPos(40.4168, -3.7038) // Madrid

    fun create(today: LocalDate = LocalDate.now()): List<Event> {
        fun at(dayOffset: Long, h: Int, m: Int = 0): LocalDateTime =
            LocalDateTime.of(today.plusDays(dayOffset), LocalTime.of(h, m))

        return listOf(
            demo(1, "Verbena de barrio", "Orquesta en directo, churros y baile hasta tarde.",
                Category.FIESTA_PUEBLO, at(0, 21), at(1, 2), "Plaza de la Paja", "Madrid",
                GeoPos(40.4115, -3.7115), 0.0),
            demo(2, "Noche de indie en directo", "Tres bandas emergentes. Puertas a las 21:30.",
                Category.CONCIERTO, at(0, 22), at(1, 1), "Sala del centro", "Madrid",
                GeoPos(40.4198, -3.7020), 12.0),
            demo(3, "Sesión techno hasta el amanecer", "DJs residentes y visuales.",
                Category.CLUB, at(0, 23, 59), at(1, 6), "Club junto a Atocha", "Madrid",
                GeoPos(40.4096, -3.6935), 15.0),
            demo(4, "Atardecer con música", "Quedada abierta: trae algo para compartir.",
                Category.QUEDADA, at(1, 19, 30), at(1, 22), "Templo de Debod", "Madrid",
                GeoPos(40.4240, -3.7178), 0.0),
            demo(5, "Feria de septiembre", "Casetas, atracciones y fuegos artificiales el último día.",
                Category.FERIA, at(2, 18), at(3, 3), "Recinto ferial", "Alcobendas",
                GeoPos(40.5475, -3.6420), 0.0),
            demo(6, "Festival de música urbana", "Cartel nacional y food trucks.",
                Category.FESTIVAL, at(3, 17), at(4, 2), "Matadero", "Madrid",
                GeoPos(40.3920, -3.6975), 25.0),
            demo(7, "Fiestas patronales", "Encierro, pasacalles y verbena con orquesta.",
                Category.FIESTA_PUEBLO, at(4, 20), at(5, 4), "Plaza Mayor", "Chinchón",
                GeoPos(40.1400, -3.4226), 0.0),
            demo(8, "Jazz de medianoche", "Cuarteto en directo, aforo reducido.",
                Category.CONCIERTO, at(6, 23), at(7, 1), "Café del centro", "Madrid",
                GeoPos(40.4145, -3.7010), 10.0),
        )
    }

    private fun demo(
        n: Int, title: String, desc: String, cat: Category,
        start: LocalDateTime, end: LocalDateTime?, venue: String, town: String,
        pos: GeoPos, price: Double,
    ) = Event(
        id = "demo-$n", title = title, description = desc, category = cat,
        start = start, end = end, venue = venue, address = "", town = town,
        position = pos, priceEuros = price, organizer = "Evento de ejemplo",
        sourceUrl = null, origin = Origin.DEMO,
    )
}
