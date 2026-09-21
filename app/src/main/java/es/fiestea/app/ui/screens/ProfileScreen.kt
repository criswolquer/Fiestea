package es.fiestea.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import es.fiestea.app.data.Session
import es.fiestea.app.ui.EventsViewModel
import es.fiestea.app.ui.components.EmptyState
import es.fiestea.app.ui.components.EventCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    vm: EventsViewModel,
    onOpenEvent: (String) -> Unit,
    onOpenAuth: () -> Unit,
    onOpenAlerts: () -> Unit,
) {
    val all by vm.allItems.collectAsState()
    val saved by vm.saved.collectAsState()
    val going by vm.going.collectAsState()
    val mine by vm.mine.collectAsState()
    val session by vm.session.collectAsState()
    val vibes by vm.vibes.collectAsState()
    var tab by rememberSaveable { mutableIntStateOf(0) }

    val tabs = listOf("Voy", "Guardados", "Publicados")
    val ids = when (tab) {
        0 -> going
        1 -> saved
        else -> mine
    }
    // Primero los próximos; los ya pasados al final (para poder valorarlos)
    val list = all.filter { it.event.id in ids }
        .sortedWith(compareBy({ it.event.isOver() }, { it.event.start }))

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Mis planes", fontWeight = FontWeight.Bold) },
                actions = {
                    IconButton(onClick = onOpenAlerts) { Icon(Icons.Outlined.Notifications, "Avisos") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            AccountCard(
                session = session, isConnected = vm.isConnected,
                onLogin = onOpenAuth, onLogout = { vm.signOut() },
            )
            PrimaryTabRow(selectedTabIndex = tab, containerColor = MaterialTheme.colorScheme.background) {
                tabs.forEachIndexed { i, t ->
                    Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t) })
                }
            }
            if (list.isEmpty()) {
                when (tab) {
                    0 -> EmptyState("🕺", "Aún no tienes planes", "Pulsa \"Voy\" en una fiesta: aparecerá aquí y te avisaremos la tarde antes.")
                    1 -> EmptyState("🔖", "Nada guardado", "Guarda fiestas que te interesen para no perderlas.")
                    else -> EmptyState("📣", "No has publicado nada", "¿Organizas algo? Publícalo en la pestaña Publicar.")
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(list, key = { it.event.id }) { item ->
                        EventCard(
                            item = item,
                            isSaved = item.event.id in saved,
                            onClick = { onOpenEvent(item.event.id) },
                            onToggleSaved = { vm.toggleSaved(item.event.id) },
                            vibe = vibes[item.event.id],
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AccountCard(session: Session?, isConnected: Boolean, onLogin: () -> Unit, onLogout: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainer,
        shape = RoundedCornerShape(20.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(44.dp).background(MaterialTheme.colorScheme.primary, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    session?.displayName?.firstOrNull()?.uppercase() ?: "🎉",
                    color = Color.White, fontWeight = FontWeight.Bold,
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                when {
                    session != null -> {
                        Text("Hola, ${session.displayName}", fontWeight = FontWeight.Bold)
                        Text(session.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    isConnected -> {
                        Text("Sin cuenta", fontWeight = FontWeight.Bold)
                        Text(
                            "Crea una para publicar y contar el ambiente",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    else -> {
                        Text("Modo demo", fontWeight = FontWeight.Bold)
                        Text(
                            "Conecta Supabase para usar cuentas",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            when {
                session != null -> TextButton(onClick = onLogout) { Text("Salir") }
                isConnected -> Button(onClick = onLogin) { Text("Entrar") }
            }
        }
    }
}
