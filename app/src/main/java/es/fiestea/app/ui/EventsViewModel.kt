package es.fiestea.app.ui

import android.Manifest
import android.annotation.SuppressLint
import android.app.Application
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import es.fiestea.app.data.AlertSettings
import es.fiestea.app.data.AlertSettingsStore
import es.fiestea.app.data.Category
import es.fiestea.app.data.Event
import es.fiestea.app.data.EventItem
import es.fiestea.app.data.EventRepository
import es.fiestea.app.data.GeoPos
import es.fiestea.app.data.Origin
import es.fiestea.app.data.Session
import es.fiestea.app.data.SignUpResult
import es.fiestea.app.data.VibeSummary
import es.fiestea.app.data.VibeVote
import es.fiestea.app.data.Zone
import es.fiestea.app.data.Zones
import es.fiestea.app.notify.AlertScheduler
import es.fiestea.app.notify.Notifications
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.UUID

enum class DateFilter(val label: String) { TODAS("Todas"), HOY("Hoy"), FINDE("Este finde"), SEMANA("7 días") }
enum class PriceFilter(val label: String) { TODOS("Todos"), GRATIS("Gratis"), PAGO("De pago") }

data class Filters(
    val date: DateFilter = DateFilter.TODAS,
    val price: PriceFilter = PriceFilter.TODOS,
    val categories: Set<Category> = emptySet(),
    /** null = sin límite */
    val maxKm: Int? = null,
    val query: String = "",
) {
    val activeCount: Int
        get() = listOf(date != DateFilter.TODAS, price != PriceFilter.TODOS, categories.isNotEmpty(), maxKm != null)
            .count { it }
}

class EventsViewModel(app: Application) : AndroidViewModel(app) {

    private val repo = EventRepository.get(app)

    private val _filters = MutableStateFlow(Filters())
    val filters: StateFlow<Filters> = _filters.asStateFlow()

    /** Ubicación real del GPS (null si no hay permiso o aún no se sabe). */
    private val _userLocation = MutableStateFlow<GeoPos?>(null)
    val userLocation: StateFlow<GeoPos?> = _userLocation.asStateFlow()

    /** Zona elegida a mano (null = usar la ubicación del GPS). Se recuerda entre sesiones. */
    private val prefs = app.getSharedPreferences("fiestea_prefs", android.content.Context.MODE_PRIVATE)
    private val _zone = MutableStateFlow(Zones.byName(prefs.getString("zone", null)))
    val zone: StateFlow<Zone?> = _zone.asStateFlow()

    /** Punto desde el que buscamos fiestas y medimos distancias: la zona elegida o el GPS. */
    val searchCenter: StateFlow<GeoPos?> =
        combine(_zone, _userLocation) { z, loc -> z?.position ?: loc }
            .stateIn(viewModelScope, SharingStarted.Eagerly, _zone.value?.position)

    /** true si no había fiestas cerca y estamos enseñando las de otras zonas. */
    val showingFarAway: StateFlow<Boolean> get() = repo.showingFarAway

    private val alertStore = AlertSettingsStore.get(app)

    val saved = repo.saved
    val going = repo.going
    val ratings = repo.ratings
    val mine = repo.mine
    val loading = repo.loading
    val error = repo.error
    val isConnected = repo.isConnected
    val vibes: StateFlow<Map<String, VibeSummary>> = repo.vibes
    val myVibes: StateFlow<Map<String, VibeVote>> = repo.myVibes
    val alertSettings: StateFlow<AlertSettings> = alertStore.settings

    /** Sesión del usuario (siempre null en modo demo). */
    val session: StateFlow<Session?> = repo.auth?.session ?: MutableStateFlow(null)

    /** Con Supabase, publicar / avisar / contar el ambiente requiere cuenta. */
    fun needsLogin(): Boolean = isConnected && session.value == null

    /** Todos los eventos con su distancia (sin filtrar). */
    val allItems: StateFlow<List<EventItem>> =
        combine(repo.events, searchCenter) { events, loc ->
            events.map { EventItem(it, loc?.distanceKmTo(it.position)) }.sortedBy { it.event.start }
        }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    /** Eventos visibles en Explorar: no terminados y que pasan los filtros. */
    val visibleItems: StateFlow<List<EventItem>> =
        combine(allItems, _filters) { items, f -> applyFilters(items, f) }
            .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init {
        refresh()
        // Si los avisos de zona estaban activos, nos aseguramos de que siguen programados
        if (alertStore.current.nearbyEnabled) AlertScheduler.enableNearby(app)
    }

    fun refresh() {
        viewModelScope.launch { repo.refresh(_zone.value?.position ?: _userLocation.value) }
    }

    /** Cambia la zona (null = "Cerca de mí" con el GPS) y recarga las fiestas. */
    fun setZone(zone: Zone?) {
        _zone.value = zone
        prefs.edit().putString("zone", zone?.name).apply()
        if (zone == null) locateAndRefresh() else refresh()
    }

    fun updateFilters(transform: (Filters) -> Filters) = _filters.update(transform)
    fun resetFilters() = _filters.update { Filters(query = it.query) }

    fun refreshVibes() {
        viewModelScope.launch { repo.refreshVibes() }
    }

    fun toggleSaved(id: String) = repo.toggleSaved(id)
    fun toggleGoing(id: String) = repo.toggleGoing(id)
    fun rate(id: String, stars: Int) = repo.rate(id, stars)
    fun report(id: String) = repo.report(id)

    suspend fun submitVibe(id: String, vote: VibeVote) = repo.submitVibe(id, vote)
    suspend fun deleteMine(id: String) = repo.deleteMine(id)

    // ---------------- Cuentas ----------------

    suspend fun signIn(email: String, password: String) {
        repo.auth?.signIn(email, password)
        refresh()
    }

    suspend fun signUp(name: String, email: String, password: String): SignUpResult =
        repo.auth?.signUp(name, email, password) ?: SignUpResult.LoggedIn

    fun signOut() = repo.auth?.signOut()

    // ---------------- Avisos ----------------

    fun setRemindersEnabled(enabled: Boolean) = repo.setRemindersEnabled(enabled)

    fun setNearbyEnabled(enabled: Boolean) {
        val app = getApplication<Application>()
        alertStore.update {
            it.copy(
                nearbyEnabled = enabled,
                center = it.center ?: _userLocation.value ?: _zone.value?.position,
                // Solo avisamos de lo que llegue a partir de ahora
                lastCheckEpochSec = if (enabled) java.time.Instant.now().epochSecond else it.lastCheckEpochSec,
            )
        }
        if (enabled) AlertScheduler.enableNearby(app) else AlertScheduler.disableNearby(app)
    }

    /** Usa la ubicación actual como centro de la zona vigilada. Devuelve false si no la conocemos. */
    fun useCurrentLocationForAlerts(): Boolean {
        val loc = _userLocation.value ?: return false
        alertStore.update { it.copy(center = loc) }
        return true
    }

    fun setAlertRadius(km: Int) = alertStore.update { it.copy(radiusKm = km) }

    fun toggleAlertCategory(c: Category) = alertStore.update {
        it.copy(categories = if (c in it.categories) it.categories - c else it.categories + c)
    }

    /** Muestra un aviso de ejemplo con fiestas reales de la lista, para ver cómo queda. */
    fun sendTestNotification() {
        val app = getApplication<Application>()
        val sample = visibleItems.value.take(3).map { it.event }
        if (sample.isEmpty()) {
            Notifications.showNearby(app, listOf("🎉 Así te avisaremos de las fiestas nuevas"), null)
        } else {
            Notifications.showNearby(
                app, sample.map { "${it.category.emoji} ${it.title} · ${it.town.ifBlank { it.venue }}" }, sample.first().id,
            )
        }
    }

    fun eventById(id: String): EventItem? = allItems.value.firstOrNull { it.event.id == id }

    suspend fun createEvent(
        title: String, description: String, category: Category,
        start: LocalDateTime, end: LocalDateTime?, venue: String, town: String,
        position: GeoPos, price: Double, organizer: String,
    ): Event = repo.create(
        Event(
            id = "local-" + UUID.randomUUID(), title = title.trim(), description = description.trim(),
            category = category, start = start, end = end, venue = venue.trim(), address = "",
            town = town.trim(), position = position, priceEuros = price,
            organizer = organizer.trim().ifBlank { "Particular" }, sourceUrl = null, origin = Origin.USER,
        )
    )

    // ---------------- Ubicación ----------------

    fun hasLocationPermission(): Boolean {
        val ctx = getApplication<Application>()
        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    /** Obtiene la ubicación y, cuando la tiene, recarga los eventos de la zona. */
    @SuppressLint("MissingPermission")
    fun locateAndRefresh() {
        if (!hasLocationPermission()) {
            refresh(); return
        }
        val ctx = getApplication<Application>()
        val lm = ctx.getSystemService(LocationManager::class.java) ?: run { refresh(); return }
        val last: Location? = lm.getProviders(true)
            .mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }
            .maxByOrNull { it.time }
        if (last != null) {
            _userLocation.value = GeoPos(last.latitude, last.longitude)
            refresh()
        }
        // Pedimos además una ubicación fresca (Android 11+).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val provider = when {
                lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
                lm.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
                else -> null
            }
            if (provider != null) {
                runCatching {
                    lm.getCurrentLocation(provider, null, ctx.mainExecutor) { loc ->
                        if (loc != null) {
                            val fresh = GeoPos(loc.latitude, loc.longitude)
                            val old = _userLocation.value
                            _userLocation.value = fresh
                            // Solo recargamos si nos hemos movido bastante (o no teníamos ubicación).
                            if (old == null || old.distanceKmTo(fresh) > 20) refresh()
                        } else if (last == null) refresh()
                    }
                }.onFailure { if (last == null) refresh() }
                return
            }
        }
        if (last == null) refresh()
    }

    // ---------------- Filtros ----------------

    private fun applyFilters(items: List<EventItem>, f: Filters): List<EventItem> {
        val now = LocalDateTime.now()
        val today = LocalDate.now()
        val (weekendStart, weekendEnd) = weekend(today)
        val q = f.query.trim()
        return items.filter { item ->
            val e = item.event
            if (e.isOver(now)) return@filter false
            val startDay = e.start.toLocalDate()
            val endDay = e.effectiveEnd.toLocalDate()
            val dateOk = when (f.date) {
                DateFilter.TODAS -> true
                DateFilter.HOY -> !startDay.isAfter(today) && !endDay.isBefore(today)
                DateFilter.FINDE -> !startDay.isAfter(weekendEnd) && !endDay.isBefore(weekendStart)
                DateFilter.SEMANA -> !startDay.isAfter(today.plusDays(7))
            }
            val priceOk = when (f.price) {
                PriceFilter.TODOS -> true
                PriceFilter.GRATIS -> e.isFree
                PriceFilter.PAGO -> !e.isFree
            }
            val catOk = f.categories.isEmpty() || e.category in f.categories
            val distOk = f.maxKm == null || item.distanceKm == null || item.distanceKm <= f.maxKm
            val queryOk = q.isEmpty() || listOf(e.title, e.town, e.venue, e.description)
                .any { it.contains(q, ignoreCase = true) }
            dateOk && priceOk && catOk && distOk && queryOk
        }
    }

    /** Viernes–domingo de este fin de semana (si hoy es fin de semana, el actual). */
    private fun weekend(today: LocalDate): Pair<LocalDate, LocalDate> {
        val dow = today.dayOfWeek.value // lunes=1 … domingo=7
        val friday = if (dow <= 5) today.plusDays((5 - dow).toLong()) else today.minusDays((dow - 5).toLong())
        val start = if (friday.isBefore(today)) today else friday
        return start to friday.with(DayOfWeek.SUNDAY)
    }
}
