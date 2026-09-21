package es.fiestea.app.notify

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import es.fiestea.app.MainActivity
import es.fiestea.app.R

object Notifications {
    const val CHANNEL_REMINDERS = "reminders"
    const val CHANNEL_NEARBY = "nearby"
    const val EXTRA_EVENT_ID = "es.fiestea.app.EVENT_ID"
    private const val NEARBY_ID = 1001

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_REMINDERS, "Recordatorios de tus planes", NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = "Aviso antes de las fiestas a las que vas" },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_NEARBY, "Fiestas nuevas cerca", NotificationManager.IMPORTANCE_DEFAULT)
                .apply { description = "Cuando aparecen fiestas nuevas en tu zona" },
        )
    }

    fun canNotify(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    /** Abre la app (y la ficha del evento, si se indica) al pulsar la notificación. */
    private fun openAppIntent(context: Context, eventId: String?): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            if (eventId != null) putExtra(EXTRA_EVENT_ID, eventId)
        }
        return PendingIntent.getActivity(
            context, eventId?.hashCode() ?: 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    @SuppressLint("MissingPermission")
    fun showReminder(context: Context, eventId: String, title: String, text: String) {
        createChannels(context)
        if (!canNotify(context)) return
        val n = NotificationCompat.Builder(context, CHANNEL_REMINDERS)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF8B5CF6.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(openAppIntent(context, eventId))
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(eventId.hashCode(), n)
    }

    /** "3 fiestas nuevas cerca de ti" con la lista de las primeras. */
    @SuppressLint("MissingPermission")
    fun showNearby(context: Context, lines: List<String>, firstEventId: String?) {
        if (lines.isEmpty()) return
        createChannels(context)
        if (!canNotify(context)) return
        val title = if (lines.size == 1) "Nueva fiesta cerca de ti" else "${lines.size} fiestas nuevas cerca de ti"
        val style = NotificationCompat.InboxStyle()
        lines.take(5).forEach { style.addLine(it) }
        if (lines.size > 5) style.setSummaryText("y ${lines.size - 5} más")
        val n = NotificationCompat.Builder(context, CHANNEL_NEARBY)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFFEC4899.toInt())
            .setContentTitle(title)
            .setContentText(lines.first())
            .setStyle(style)
            // Si solo hay una, abre su ficha; si hay varias, abre la app
            .setContentIntent(openAppIntent(context, if (lines.size == 1) firstEventId else null))
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(NEARBY_ID, n)
    }
}
