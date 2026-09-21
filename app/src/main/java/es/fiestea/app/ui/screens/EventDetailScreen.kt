package es.fiestea.app.ui.screens

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Directions
import androidx.compose.material.icons.filled.Euro
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import es.fiestea.app.data.AuthException
import es.fiestea.app.data.Event
import es.fiestea.app.data.VibeSummary
import es.fiestea.app.data.VibeVote
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.FilterChip
import java.time.Duration
import java.time.Instant
import es.fiestea.app.data.Origin
import es.fiestea.app.ui.EventsViewModel
import es.fiestea.app.ui.components.EmptyState
import es.fiestea.app.ui.components.Pill
import es.fiestea.app.ui.distanceLabel
import es.fiestea.app.ui.fullWhenLabel
import es.fiestea.app.ui.priceLabel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventDetailScreen(
    vm: EventsViewModel,
    eventId: String,
    onBack: () -> Unit,
    onNeedLogin: () -> Unit,
    askNotificationPermission: () -> Unit,
    askLocation: () -> Unit,
) {
    val all by vm.allItems.collectAsState()
    val saved by vm.saved.collectAsState()
    val going by vm.going.collectAsState()
    val ratings by vm.ratings.collectAsState()
    val mine by vm.mine.collectAsState()
    val vibes by vm.vibes.collectAsState()
    val myVibes by vm.myVibes.collectAsState()
    val alertSettings by vm.alertSettings.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var confirmReport by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var showVibeDialog by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    // Mientras la fiesta está en curso, refrescamos el ambiente cada minuto
    LaunchedEffect(eventId) {
        while (true) {
            vm.refreshVibes()
            delay(60_000)
        }
    }

    val item = all.firstOrNull { it.event.id == eventId }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver") } },
                actions = {
                    if (item != null) {
                        val isSaved = eventId in saved
                        IconButton(onClick = { vm.toggleSaved(eventId) }) {
                            Icon(
                                if (isSaved) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder,
                                if (isSaved) "Quitar de guardados" else "Guardar",
                                tint = if (isSaved) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurface,
                            )
                        }
                        IconButton(onClick = { share(context, item.event) }) { Icon(Icons.Filled.Share, "Compartir") }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
            )
        },
    ) { padding ->
        if (item == null) {
            Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.Center) {
                EmptyState("🤷", "Evento no disponible", "Puede que haya terminado o que se haya eliminado.")
            }
            return@Scaffold
        }
        val e = item.event
        val isGoing = eventId in going
        val catColor = Color(e.category.color)

        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            // Cabecera con degradado de la categoría
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(150.dp)
                    .background(
                        Brush.linearGradient(listOf(catColor, catColor.copy(alpha = 0.25f), MaterialTheme.colorScheme.primary.copy(alpha = 0.4f))),
                        RoundedCornerShape(28.dp),
                    ),
                contentAlignment = Alignment.Center,
            ) { Text(e.category.emoji, fontSize = 72.sp) }

            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill(e.category.label, catColor)
                if (e.isLive()) Pill("En curso", MaterialTheme.colorScheme.secondary)
            }
            Spacer(Modifier.height(8.dp))
            Text(e.title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)

            Spacer(Modifier.height(16.dp))
            InfoRow(Icons.Filled.CalendarMonth, fullWhenLabel(e))
            InfoRow(
                Icons.Filled.Place,
                listOfNotNull(
                    e.placeLine.ifBlank { null }, e.address.ifBlank { null },
                    distanceLabel(item.distanceKm)?.let { "a $it" },
                ).joinToString(" · "),
            )
            InfoRow(Icons.Filled.Euro, priceLabel(e))
            if (e.organizer.isNotBlank()) InfoRow(Icons.Filled.Groups, e.organizer)

            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = {
                        if (!isGoing && alertSettings.remindersEnabled) askNotificationPermission()
                        vm.toggleGoing(eventId)
                    },
                    modifier = Modifier.weight(1f).height(52.dp),
                    colors = if (isGoing) ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary)
                    else ButtonDefaults.buttonColors(),
                ) {
                    if (isGoing) {
                        Icon(Icons.Filled.Check, null); Spacer(Modifier.width(6.dp))
                    }
                    Text(if (isGoing) "¡Vas!" else "Voy")
                }
                OutlinedButton(onClick = { directions(context, e) }, modifier = Modifier.weight(1f).height(52.dp)) {
                    Icon(Icons.Filled.Directions, null); Spacer(Modifier.width(6.dp)); Text("Cómo llegar")
                }
            }

            if (e.description.isNotBlank()) {
                Spacer(Modifier.height(20.dp))
                Text("Qué hay", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text(e.description, style = MaterialTheme.typography.bodyLarge)
            }

            // Ambiente en directo: solo mientras la fiesta está en curso
            if (e.isLive()) {
                Spacer(Modifier.height(20.dp))
                VibeSection(
                    vibe = vibes[eventId],
                    onReport = {
                        val distance = item.distanceKm
                        when {
                            vm.needsLogin() -> onNeedLogin()
                            // En modo demo no exigimos estar allí, para poder probarlo
                            vm.isConnected && distance == null -> {
                                askLocation()
                                message = "Activa la ubicación para confirmar que estás en la fiesta."
                            }
                            vm.isConnected && distance != null && distance > 1.5 ->
                                message = "Tienes que estar en la fiesta (a menos de 1,5 km) para contar cómo está."
                            else -> showVibeDialog = true
                        }
                    },
                )
            }

            // Valoración: solo si vas y el evento ya ha empezado
            if (isGoing && e.hasStarted()) {
                Spacer(Modifier.height(20.dp))
                Text("¿Qué tal estuvo?", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                val current = ratings[eventId] ?: 0
                Row {
                    (1..5).forEach { n ->
                        IconButton(onClick = { vm.rate(eventId, n) }) {
                            Icon(
                                if (n <= current) Icons.Filled.Star else Icons.Outlined.StarBorder,
                                "$n estrellas", tint = Color(0xFFF59E0B), modifier = Modifier.size(32.dp),
                            )
                        }
                    }
                }
            }

            // Origen de la información
            Spacer(Modifier.height(24.dp))
            HorizontalDivider()
            Spacer(Modifier.height(12.dp))
            when (e.origin) {
                Origin.AI -> Surface(color = MaterialTheme.colorScheme.surfaceContainer, shape = RoundedCornerShape(16.dp)) {
                    Column(Modifier.padding(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.AutoAwesome, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Detectado automáticamente", fontWeight = FontWeight.Bold)
                        }
                        Text(
                            "Esta fiesta la ha encontrado nuestro buscador con IA en internet. Confirma los detalles en la fuente antes de ir.",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (!e.sourceUrl.isNullOrBlank()) {
                            TextButton(onClick = { openUrl(context, e.sourceUrl) }) {
                                Icon(Icons.AutoMirrored.Filled.OpenInNew, null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp)); Text("Ver fuente")
                            }
                        }
                    }
                }
                Origin.USER -> Text("Publicado por un usuario", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Origin.DEMO -> Text("Evento de ejemplo (conecta Supabase para ver fiestas reales)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (eventId in mine) {
                TextButton(onClick = { confirmDelete = true }) {
                    Icon(Icons.Filled.Delete, null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp))
                    Text("Borrar mi fiesta")
                }
            }
            TextButton(onClick = { if (vm.needsLogin()) onNeedLogin() else confirmReport = true }) {
                Icon(Icons.Filled.Flag, null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp))
                Text("Esta información es incorrecta")
            }
            Spacer(Modifier.height(32.dp))
        }
    }

    if (showVibeDialog) {
        VibeDialog(
            initial = myVibes[eventId],
            onDismiss = { showVibeDialog = false },
            onSubmit = { vote ->
                showVibeDialog = false
                scope.launch {
                    message = try {
                        vm.submitVibe(eventId, vote)
                        "¡Gracias! Tu voto ayuda a los que están decidiendo si venir."
                    } catch (e: AuthException) {
                        e.message
                    } catch (e: Exception) {
                        "No se ha podido enviar. Revisa tu conexión."
                    }
                }
            },
        )
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("¿Borrar esta fiesta?") },
            text = { Text("Desaparecerá para todo el mundo.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    scope.launch {
                        try {
                            vm.deleteMine(eventId); onBack()
                        } catch (e: Exception) {
                            message = "No se ha podido borrar. Revisa tu conexión."
                        }
                    }
                }) { Text("Borrar") }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancelar") } },
        )
    }

    message?.let { msg ->
        AlertDialog(
            onDismissRequest = { message = null },
            text = { Text(msg) },
            confirmButton = { TextButton(onClick = { message = null }) { Text("Vale") } },
        )
    }

    if (confirmReport) {
        AlertDialog(
            onDismissRequest = { confirmReport = false },
            title = { Text("¿Avisar de un error?") },
            text = { Text("Ocultaremos este evento para ti. Si varias personas avisan, desaparecerá para todos.") },
            confirmButton = {
                TextButton(onClick = { confirmReport = false; vm.report(eventId); onBack() }) { Text("Avisar") }
            },
            dismissButton = { TextButton(onClick = { confirmReport = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun InfoRow(icon: ImageVector, text: String) {
    if (text.isBlank()) return
    Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(12.dp))
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}

private fun openUrl(context: Context, url: String) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    } catch (_: ActivityNotFoundException) {
    }
}

private fun directions(context: Context, e: Event) {
    openUrl(context, "https://www.google.com/maps/dir/?api=1&destination=${e.position.lat},${e.position.lon}")
}

private fun share(context: Context, e: Event) {
    val text = buildString {
        append("🎉 ${e.title}\n")
        append("📅 ${fullWhenLabel(e)}\n")
        if (e.placeLine.isNotBlank()) append("📍 ${e.placeLine}\n")
        append("💶 ${priceLabel(e)}\n")
        append("https://www.google.com/maps/search/?api=1&query=${e.position.lat},${e.position.lon}")
    }
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, "Compartir fiesta"))
}


@Composable
private fun VibeSection(vibe: VibeSummary?, onReport: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).background(MaterialTheme.colorScheme.secondary, RoundedCornerShape(50)))
                Spacer(Modifier.width(8.dp))
                Text("Ambiente ahora mismo", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(8.dp))
            if (vibe == null) {
                Text(
                    "Nadie ha contado todavía cómo está. ¿Estás allí? ¡Sé el primero!",
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                )
            } else {
                Text("${vibe.crowdEmoji} ${vibe.crowdLabel}", fontSize = 24.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill(if (vibe.queueRatio >= 0.5) "⏳ ${vibe.queueLabel}" else "✅ ${vibe.queueLabel}", MaterialTheme.colorScheme.onSecondaryContainer)
                    Pill(vibe.moodLabel, MaterialTheme.colorScheme.onSecondaryContainer)
                }
                Spacer(Modifier.height(6.dp))
                val minutes = Duration.between(vibe.lastUpdate, Instant.now()).toMinutes().coerceAtLeast(0)
                Text(
                    "${vibe.votes} ${if (vibe.votes == 1) "persona lo ha contado" else "personas lo han contado"} · " +
                        if (minutes < 1) "ahora mismo" else "hace $minutes min",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSecondaryContainer,
                )
            }
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = onReport,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Estoy aquí · Contar cómo está") }
        }
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun VibeDialog(initial: VibeVote?, onDismiss: () -> Unit, onSubmit: (VibeVote) -> Unit) {
    var crowd by remember { mutableStateOf(initial?.crowd ?: 0) }
    var queue by remember { mutableStateOf(initial?.queue) }
    var mood by remember { mutableStateOf(initial?.mood ?: 0) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("¿Cómo está la fiesta?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Gente", fontWeight = FontWeight.Bold)
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(1 to "🙂 Poca", 2 to "😃 Bastante", 3 to "🔥 A tope").forEach { (v, label) ->
                        FilterChip(crowd == v, { crowd = v }, { Text(label) })
                    }
                }
                Text("Cola para entrar", fontWeight = FontWeight.Bold)
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(queue == false, { queue = false }, { Text("✅ Sin cola") })
                    FilterChip(queue == true, { queue = true }, { Text("⏳ Hay cola") })
                }
                Text("Ambiente y música", fontWeight = FontWeight.Bold)
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(1 to "😐 Flojo", 2 to "👍 Bien", 3 to "🤩 Ambientazo").forEach { (v, label) ->
                        FilterChip(mood == v, { mood = v }, { Text(label) })
                    }
                }
            }
        },
        confirmButton = {
            val q = queue
            TextButton(
                enabled = crowd > 0 && mood > 0 && q != null,
                onClick = { if (q != null) onSubmit(VibeVote(crowd, q, mood)) },
            ) { Text("Enviar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}
