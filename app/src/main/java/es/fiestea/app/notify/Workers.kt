package es.fiestea.app.notify

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import es.fiestea.app.data.AlertSettingsStore
import es.fiestea.app.data.BackendConfig
import es.fiestea.app.data.Event
import es.fiestea.app.data.SupabaseApi
import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.concurrent.TimeUnit

private val HHMM = DateTimeFormatter.ofPattern("HH:mm")
private val DAY = DateTimeFormatter.ofPattern("EEE d", Locale.forLanguageTag("es-ES"))

/** Programa y cancela los avisos con WorkManager (sobreviven a reinicios del móvil). */
object AlertScheduler {
    private const val TAG_REMINDER = "reminder"
    private const val NEARBY_WORK = "nearby-alerts"

    /**
     * Recordatorio de una fiesta a la que vas:
     *  - la tarde anterior a las 18:00, o
     *  - si ya ha pasado ese momento, 2 horas antes de que empiece.
     */
    fun scheduleReminder(context: Context, e: Event) {
        val now = LocalDateTime.now()
        val dayBefore = e.start.toLocalDate().minusDays(1).atTime(LocalTime.of(18, 0))
        val twoHoursBefore = e.start.minusHours(2)
        val (at, text) = when {
            now.isBefore(dayBefore) -> dayBefore to "Mañana a las ${e.start.format(HHMM)}"
            now.isBefore(twoHoursBefore) -> twoHoursBefore to "Hoy a las ${e.start.format(HHMM)}"
            else -> return
        }
        val place = e.placeLine.ifBlank { null }
        val request = OneTimeWorkRequestBuilder<ReminderWorker>()
            .setInitialDelay(Duration.between(now, at).toMillis(), TimeUnit.MILLISECONDS)
            .setInputData(
                workDataOf(
                    "id" to e.id,
                    "title" to "🎉 ${e.title}",
                    "text" to listOfNotNull(text, place).joinToString(" · "),
                ),
            )
            .addTag(TAG_REMINDER)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork("reminder-${e.id}", ExistingWorkPolicy.REPLACE, request)
    }

    fun cancelReminder(context: Context, eventId: String) {
        WorkManager.getInstance(context).cancelUniqueWork("reminder-$eventId")
    }

    fun cancelAllReminders(context: Context) {
        WorkManager.getInstance(context).cancelAllWorkByTag(TAG_REMINDER)
    }

    /** Comprueba cada ~6 horas si hay fiestas nuevas en la zona del usuario. */
    fun enableNearby(context: Context) {
        val request = PeriodicWorkRequestBuilder<NearbyAlertsWorker>(6, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInitialDelay(30, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(NEARBY_WORK, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun disableNearby(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(NEARBY_WORK)
    }
}

class ReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val id = inputData.getString("id") ?: return Result.success()
        if (!AlertSettingsStore.get(applicationContext).current.remindersEnabled) return Result.success()
        Notifications.showReminder(
            applicationContext, id,
            inputData.getString("title") ?: "Tienes plan",
            inputData.getString("text") ?: "",
        )
        return Result.success()
    }
}

/** Busca fiestas que han entrado en la base de datos desde la última comprobación. */
class NearbyAlertsWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val store = AlertSettingsStore.get(applicationContext)
        val s = store.current
        val center = s.center
        if (!s.nearbyEnabled || center == null || !BackendConfig.isConfigured) return Result.success()

        val api = SupabaseApi(BackendConfig.url, BackendConfig.anonKey, auth = null)
        val events = try {
            api.fetchUpcoming(center)
        } catch (e: Exception) {
            return Result.retry()
        }
        val since = Instant.ofEpochSecond(s.lastCheckEpochSec)
        val now = LocalDateTime.now()
        val fresh = events
            .filter { (it.discoveredAt ?: Instant.EPOCH).isAfter(since) }
            .filter { !it.isOver(now) }
            .filter { it.position.distanceKmTo(center) <= s.radiusKm }
            .filter { s.categories.isEmpty() || it.category in s.categories }
            .sortedBy { it.start }

        store.update { it.copy(lastCheckEpochSec = Instant.now().epochSecond) }

        if (fresh.isNotEmpty()) {
            val lines = fresh.map { e ->
                val day = e.start.format(DAY).replaceFirstChar { c -> c.uppercase() }
                "${e.category.emoji} ${e.title} · ${e.town.ifBlank { e.venue }} · $day"
            }
            Notifications.showNearby(applicationContext, lines, fresh.first().id)
        }
        return Result.success()
    }
}
