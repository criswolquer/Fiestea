package es.fiestea.app.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class AlertSettings(
    /** Recordatorio el día antes de las fiestas marcadas con "Voy". */
    val remindersEnabled: Boolean = true,
    /** Aviso de fiestas nuevas en tu zona. */
    val nearbyEnabled: Boolean = false,
    /** Centro de la zona vigilada (null = aún no elegido). */
    val center: GeoPos? = null,
    val radiusKm: Int = 20,
    /** Vacío = todos los tipos. */
    val categories: Set<Category> = emptySet(),
    /** Última comprobación (segundos desde 1970): solo se avisa de lo que llegó después. */
    val lastCheckEpochSec: Long = 0,
)

/** Guarda los ajustes de avisos en el móvil. */
class AlertSettingsStore private constructor(context: Context) {

    private val prefs = context.getSharedPreferences("fiestea_alerts", Context.MODE_PRIVATE)
    private val _settings = MutableStateFlow(load())
    val settings: StateFlow<AlertSettings> = _settings.asStateFlow()
    val current: AlertSettings get() = _settings.value

    fun update(transform: (AlertSettings) -> AlertSettings) {
        val next = transform(_settings.value)
        _settings.value = next
        prefs.edit()
            .putBoolean("reminders", next.remindersEnabled)
            .putBoolean("nearby", next.nearbyEnabled)
            .putString("center", next.center?.let { "${it.lat},${it.lon}" })
            .putInt("radius", next.radiusKm)
            .putStringSet("categories", next.categories.map { it.name }.toSet())
            .putLong("lastCheck", next.lastCheckEpochSec)
            .apply()
    }

    private fun load(): AlertSettings {
        val center = prefs.getString("center", null)?.split(",")?.let { parts ->
            val lat = parts.getOrNull(0)?.toDoubleOrNull()
            val lon = parts.getOrNull(1)?.toDoubleOrNull()
            if (lat != null && lon != null) GeoPos(lat, lon) else null
        }
        return AlertSettings(
            remindersEnabled = prefs.getBoolean("reminders", true),
            nearbyEnabled = prefs.getBoolean("nearby", false),
            center = center,
            radiusKm = prefs.getInt("radius", 20),
            categories = prefs.getStringSet("categories", emptySet()).orEmpty()
                .mapNotNull { name -> Category.entries.firstOrNull { it.name == name } }.toSet(),
            lastCheckEpochSec = prefs.getLong("lastCheck", 0),
        )
    }

    companion object {
        @Volatile
        private var instance: AlertSettingsStore? = null

        fun get(context: Context): AlertSettingsStore =
            instance ?: synchronized(this) {
                instance ?: AlertSettingsStore(context.applicationContext).also { instance = it }
            }
    }
}
