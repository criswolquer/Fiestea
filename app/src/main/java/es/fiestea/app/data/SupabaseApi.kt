package es.fiestea.app.data

import es.fiestea.app.BuildConfig
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

/** Datos de conexión leídos de local.properties (vacíos = modo demo). */
object BackendConfig {
    val url: String get() = BuildConfig.SUPABASE_URL
    val anonKey: String get() = BuildConfig.SUPABASE_ANON_KEY
    val isConfigured: Boolean get() = url.isNotBlank() && anonKey.isNotBlank()
}

/**
 * Cliente mínimo de la API REST de Supabase (PostgREST), sin librerías extra.
 * Si hay sesión iniciada, las peticiones van con el token del usuario;
 * si no, con la clave pública (anon).
 */
class SupabaseApi(baseUrl: String, private val anonKey: String, private val auth: AuthManager?) {

    private val rest = baseUrl.trimEnd('/') + "/rest/v1"
    private val iso = DateTimeFormatter.ISO_LOCAL_DATE_TIME

    // ---------------- Eventos ----------------

    /**
     * Eventos que no han terminado y empiezan en los próximos 45 días
     * (incluye ferias de varios días que ya empezaron).
     * Si hay ubicación, solo en ~150 km a la redonda.
     */
    suspend fun fetchUpcoming(near: GeoPos?): List<Event> {
        val now = LocalDateTime.now().withNano(0)
        val params = mutableListOf(
            "select" to "*",
            "or" to "(end_at.gte.\"${now.format(iso)}\",and(end_at.is.null,start_at.gte.\"${now.minusHours(6).format(iso)}\"))",
            "reports" to "lt.3",
            "order" to "start_at.asc",
            "limit" to "2000",
            "start_at" to "lte.${now.plusDays(45).format(iso)}",
        )
        if (near != null) {
            params += "lat" to "gte.${near.lat - 1.4}"
            params += "lat" to "lte.${near.lat + 1.4}"
            params += "lon" to "gte.${near.lon - 1.8}"
            params += "lon" to "lte.${near.lon + 1.8}"
        }
        val arr = JSONArray(get("/events", params))
        return (0 until arr.length()).mapNotNull { i -> runCatching { parseEvent(arr.getJSONObject(i)) }.getOrNull() }
    }

    /** Publica un evento a nombre del usuario (hace falta sesión). */
    suspend fun insert(e: Event, userId: String): Event {
        val json = JSONObject().apply {
            put("dedupe_key", "user-" + java.util.UUID.randomUUID())
            put("title", e.title)
            put("description", e.description)
            put("category", e.category.name)
            put("start_at", e.start.withNano(0).format(iso))
            put("end_at", e.end?.withNano(0)?.format(iso) ?: JSONObject.NULL)
            put("venue", e.venue)
            put("address", e.address)
            put("town", e.town)
            put("lat", e.position.lat)
            put("lon", e.position.lon)
            put("price_eur", e.priceEuros)
            put("organizer", e.organizer)
            put("origin", "user")
            put("created_by", userId)
        }
        val body = send("POST", "/events", json.toString(), prefer = "return=representation")
        return parseEvent(JSONArray(body).getJSONObject(0))
    }

    /** Borra un evento publicado por el propio usuario. */
    suspend fun delete(eventId: String) {
        send("DELETE", "/events?id=eq.${enc(eventId)}", null)
    }

    /** "Información incorrecta" (uno por usuario). Con 3 avisos el evento deja de mostrarse. */
    suspend fun report(eventId: String) {
        send("POST", "/rpc/report_event", JSONObject().put("event_id", eventId).toString())
    }

    // ---------------- Ambiente en directo ----------------

    /** Resumen del ambiente de todas las fiestas con votos recientes. */
    suspend fun fetchVibes(): Map<String, VibeSummary> {
        val arr = JSONArray(get("/event_vibes", listOf("select" to "*")))
        return (0 until arr.length()).mapNotNull { i ->
            runCatching {
                val o = arr.getJSONObject(i)
                o.getString("event_id") to VibeSummary(
                    votes = o.getInt("votes"),
                    crowd = o.getDouble("crowd"),
                    queueRatio = o.getDouble("queue_ratio"),
                    mood = o.getDouble("mood"),
                    lastUpdate = parseInstant(o.getString("last_update")) ?: Instant.now(),
                )
            }.getOrNull()
        }.toMap()
    }

    /** Guarda (o cambia) el voto del usuario sobre cómo está la fiesta. */
    suspend fun upsertVibe(eventId: String, userId: String, vote: VibeVote) {
        val json = JSONObject()
            .put("event_id", eventId)
            .put("user_id", userId)
            .put("crowd", vote.crowd)
            .put("queue", vote.queue)
            .put("mood", vote.mood)
        send(
            "POST", "/vibe_reports?on_conflict=event_id,user_id", json.toString(),
            prefer = "resolution=merge-duplicates,return=minimal",
        )
    }

    // ---------------- Utilidades ----------------

    private fun parseEvent(o: JSONObject) = Event(
        id = o.getString("id"),
        title = o.getString("title"),
        description = o.str("description") ?: "",
        category = Category.fromCode(o.str("category")),
        start = LocalDateTime.parse(o.getString("start_at")),
        end = o.str("end_at")?.let { LocalDateTime.parse(it) },
        venue = o.str("venue") ?: "",
        address = o.str("address") ?: "",
        town = o.str("town") ?: "",
        position = GeoPos(o.getDouble("lat"), o.getDouble("lon")),
        priceEuros = if (o.isNull("price_eur")) 0.0 else o.optDouble("price_eur", 0.0),
        organizer = o.str("organizer") ?: "",
        sourceUrl = o.str("source_url"),
        origin = Origin.fromCode(o.str("origin")),
        discoveredAt = o.str("created_at")?.let { parseInstant(it) },
        createdBy = o.str("created_by"),
    )

    /** PostgREST devuelve timestamptz como "2026-09-21T03:10:22.123456+00:00". */
    private fun parseInstant(s: String): Instant? =
        runCatching { OffsetDateTime.parse(s).toInstant() }.getOrNull()

    private fun JSONObject.str(key: String): String? =
        if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotBlank() }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    private suspend fun headers(prefer: String?): Map<String, String> {
        val token = auth?.validAccessToken() ?: anonKey
        return buildMap {
            put("apikey", anonKey)
            put("Authorization", "Bearer $token")
            if (prefer != null) put("Prefer", prefer)
        }
    }

    private suspend fun get(path: String, params: List<Pair<String, String>>): String {
        val query = params.joinToString("&") { (k, v) -> "$k=${enc(v)}" }
        return httpRequest("GET", "$rest$path?$query", headers(null))
    }

    private suspend fun send(method: String, path: String, body: String?, prefer: String? = null): String =
        httpRequest(method, rest + path, headers(prefer), body)
}
