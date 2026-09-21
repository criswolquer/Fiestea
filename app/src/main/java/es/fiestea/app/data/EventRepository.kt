package es.fiestea.app.data

import android.content.Context
import es.fiestea.app.notify.AlertScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant

/**
 * Fuente única de datos de la app.
 * - Eventos y ambiente: vienen de Supabase (el importador con IA los rellena cada noche).
 *   Si Supabase no está configurado, usa eventos de ejemplo (modo demo).
 * - Guardados / "Voy" / valoraciones / avisos: se guardan en el móvil.
 */
class EventRepository private constructor(context: Context) {

    private val appContext = context.applicationContext

    /** null en modo demo (sin Supabase). */
    val auth: AuthManager? =
        if (BackendConfig.isConfigured) AuthManager(appContext, BackendConfig.url, BackendConfig.anonKey) else null
    private val api: SupabaseApi? =
        if (BackendConfig.isConfigured) SupabaseApi(BackendConfig.url, BackendConfig.anonKey, auth) else null
    val isConnected: Boolean get() = api != null

    private val alerts = AlertSettingsStore.get(appContext)
    private val file = File(appContext.filesDir, "fiestea_local.json")
    private val io = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _remote = MutableStateFlow(if (api == null) SeedEvents.create() else emptyList())
    private val _localCreated = MutableStateFlow<List<Event>>(emptyList())
    private val _saved = MutableStateFlow<Set<String>>(emptySet())
    private val _going = MutableStateFlow<Set<String>>(emptySet())
    private val _ratings = MutableStateFlow<Map<String, Int>>(emptyMap())
    private val _reported = MutableStateFlow<Set<String>>(emptySet())
    private val _mine = MutableStateFlow<Set<String>>(emptySet())
    private val _vibes = MutableStateFlow<Map<String, VibeSummary>>(emptyMap())
    private val _myVibes = MutableStateFlow<Map<String, VibeVote>>(emptyMap())
    private val _loading = MutableStateFlow(false)
    private val _error = MutableStateFlow<String?>(null)

    /** Todos los eventos conocidos, sin los que el usuario ha marcado como incorrectos. */
    val events: Flow<List<Event>> =
        combine(_remote, _localCreated, _reported) { remote, local, reported ->
            (remote + local).filter { it.id !in reported }.distinctBy { it.id }
        }
    val saved: StateFlow<Set<String>> = _saved.asStateFlow()
    val going: StateFlow<Set<String>> = _going.asStateFlow()
    val ratings: StateFlow<Map<String, Int>> = _ratings.asStateFlow()
    val vibes: StateFlow<Map<String, VibeSummary>> = _vibes.asStateFlow()
    val myVibes: StateFlow<Map<String, VibeVote>> = _myVibes.asStateFlow()
    val loading: StateFlow<Boolean> = _loading.asStateFlow()
    val error: StateFlow<String?> = _error.asStateFlow()

    /** IDs de eventos que ha publicado este usuario (para "Mis eventos"). */
    val mine: StateFlow<Set<String>> = _mine.asStateFlow()

    init {
        load()
    }

    suspend fun refresh(near: GeoPos?) {
        val api = api ?: return
        _loading.value = true
        _error.value = null
        try {
            _remote.value = api.fetchUpcoming(near)
            // Lo publicado por este usuario desde otro móvil también cuenta como "suyo"
            val uid = auth?.session?.value?.userId
            if (uid != null) {
                _mine.update { ids -> ids + _remote.value.filter { it.createdBy == uid }.map { it.id } }
            }
        } catch (e: Exception) {
            _error.value = "No se han podido cargar las fiestas. Revisa tu conexión."
        } finally {
            _loading.value = false
        }
        refreshVibes()
    }

    suspend fun refreshVibes() {
        val api = api ?: return
        runCatching { api.fetchVibes() }.onSuccess { _vibes.value = it }
    }

    fun eventById(id: String): Event? =
        (_remote.value + _localCreated.value).firstOrNull { it.id == id }

    /** Publica un evento. Con Supabase hace falta haber iniciado sesión. */
    suspend fun create(event: Event): Event {
        val saved = if (api != null) {
            val uid = auth?.session?.value?.userId ?: throw AuthException("Inicia sesión para publicar.")
            api.insert(event, uid).also { e -> _remote.update { it + e } }
        } else {
            event.also { e -> _localCreated.update { it + e } }
        }
        _mine.update { it + saved.id }
        persist()
        setGoing(saved.id, true)
        return saved
    }

    /** Borra un evento publicado por el propio usuario. */
    suspend fun deleteMine(id: String) {
        api?.delete(id)
        _remote.update { list -> list.filterNot { it.id == id } }
        _localCreated.update { list -> list.filterNot { it.id == id } }
        _mine.update { it - id }
        setGoing(id, false)
        _saved.update { it - id }
        persist()
    }

    fun toggleSaved(id: String) {
        _saved.update { if (id in it) it - id else it + id }
        persist()
    }

    fun toggleGoing(id: String) = setGoing(id, id !in _going.value)

    private fun setGoing(id: String, value: Boolean) {
        _going.update { if (value) it + id else it - id }
        persist()
        if (value && alerts.current.remindersEnabled) {
            eventById(id)?.let { AlertScheduler.scheduleReminder(appContext, it) }
        } else if (!value) {
            AlertScheduler.cancelReminder(appContext, id)
        }
    }

    /** Vuelve a programar (o quita) los recordatorios de todas las fiestas a las que vas. */
    fun setRemindersEnabled(enabled: Boolean) {
        alerts.update { it.copy(remindersEnabled = enabled) }
        if (enabled) {
            _going.value.mapNotNull { eventById(it) }.forEach { AlertScheduler.scheduleReminder(appContext, it) }
        } else {
            AlertScheduler.cancelAllReminders(appContext)
        }
    }

    fun rate(id: String, stars: Int) {
        _ratings.update { it + (id to stars.coerceIn(1, 5)) }
        persist()
    }

    /** "Esta información es incorrecta": se oculta para este usuario y se avisa al servidor. */
    fun report(id: String) {
        _reported.update { it + id }
        persist()
        val api = api ?: return
        io.launch { runCatching { api.report(id) } }
    }

    /** Guarda el voto del usuario sobre el ambiente y recarga el resumen. */
    suspend fun submitVibe(eventId: String, vote: VibeVote) {
        _myVibes.update { it + (eventId to vote) }
        val api = api
        if (api == null) {
            // Modo demo: el resumen es solo tu voto
            _vibes.update {
                it + (eventId to VibeSummary(1, vote.crowd.toDouble(), if (vote.queue) 1.0 else 0.0, vote.mood.toDouble(), Instant.now()))
            }
            return
        }
        val uid = auth?.session?.value?.userId ?: throw AuthException("Inicia sesión para contar cómo está.")
        api.upsertVibe(eventId, uid, vote)
        refreshVibes()
    }

    // ---------- Persistencia local (un JSON pequeño en el almacenamiento de la app) ----------

    private fun load() {
        if (!file.exists()) return
        runCatching {
            val o = JSONObject(file.readText())
            _saved.value = o.optJSONArray("saved").toStringSet()
            _going.value = o.optJSONArray("going").toStringSet()
            _reported.value = o.optJSONArray("reported").toStringSet()
            _mine.value = o.optJSONArray("mine").toStringSet()
            val r = o.optJSONObject("ratings")
            if (r != null) _ratings.value = r.keys().asSequence().associateWith { r.getInt(it) }
            val local = o.optJSONArray("localEvents")
            if (local != null) {
                _localCreated.value = (0 until local.length()).mapNotNull {
                    runCatching { local.getJSONObject(it).toEvent() }.getOrNull()
                }
            }
        }
    }

    private fun persist() {
        val snapshot = JSONObject().apply {
            put("saved", JSONArray(_saved.value.toList()))
            put("going", JSONArray(_going.value.toList()))
            put("reported", JSONArray(_reported.value.toList()))
            put("mine", JSONArray(_mine.value.toList()))
            put("ratings", JSONObject().also { r -> _ratings.value.forEach { (k, v) -> r.put(k, v) } })
            put("localEvents", JSONArray(_localCreated.value.map { it.toJson() }))
        }.toString()
        io.launch { runCatching { file.writeText(snapshot) } }
    }

    private fun JSONArray?.toStringSet(): Set<String> =
        if (this == null) emptySet() else (0 until length()).map { getString(it) }.toSet()

    private fun Event.toJson() = JSONObject().apply {
        put("id", id); put("title", title); put("description", description)
        put("category", category.name); put("start", start.toString())
        put("end", end?.toString() ?: JSONObject.NULL)
        put("venue", venue); put("address", address); put("town", town)
        put("lat", position.lat); put("lon", position.lon)
        put("price", priceEuros); put("organizer", organizer)
    }

    private fun JSONObject.toEvent() = Event(
        id = getString("id"), title = getString("title"), description = optString("description"),
        category = Category.fromCode(optString("category")),
        start = java.time.LocalDateTime.parse(getString("start")),
        end = if (isNull("end")) null else java.time.LocalDateTime.parse(getString("end")),
        venue = optString("venue"), address = optString("address"), town = optString("town"),
        position = GeoPos(getDouble("lat"), getDouble("lon")),
        priceEuros = optDouble("price", 0.0), organizer = optString("organizer"),
        sourceUrl = null, origin = Origin.USER,
    )

    companion object {
        @Volatile
        private var instance: EventRepository? = null

        fun get(context: Context): EventRepository =
            instance ?: synchronized(this) {
                instance ?: EventRepository(context.applicationContext).also { instance = it }
            }
    }
}
