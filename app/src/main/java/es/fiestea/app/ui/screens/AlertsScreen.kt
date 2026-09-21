package es.fiestea.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import es.fiestea.app.data.Category
import es.fiestea.app.ui.EventsViewModel

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AlertsScreen(
    vm: EventsViewModel,
    onBack: () -> Unit,
    askNotificationPermission: () -> Unit,
    askLocation: () -> Unit,
) {
    val s by vm.alertSettings.collectAsState()
    val location by vm.userLocation.collectAsState()
    var locationMsg by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Avisos", fontWeight = FontWeight.Bold) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // ---------- Recordatorios ----------
            SettingCard {
                SwitchRow(
                    title = "Recordatorio de tus planes",
                    subtitle = "Te avisamos la tarde antes (a las 18:00) de las fiestas en las que has pulsado \"Voy\". " +
                        "Si te apuntas el mismo día, 2 horas antes.",
                    checked = s.remindersEnabled,
                    onChange = {
                        if (it) askNotificationPermission()
                        vm.setRemindersEnabled(it)
                    },
                )
            }

            // ---------- Fiestas nuevas cerca ----------
            SettingCard {
                SwitchRow(
                    title = "Fiestas nuevas cerca de ti",
                    subtitle = if (vm.isConnected) {
                        "Cada noche nuestro buscador encuentra fiestas nuevas. Te avisamos cuando aparezca alguna en tu zona."
                    } else {
                        "Disponible cuando conectes Supabase (modo demo)."
                    },
                    checked = s.nearbyEnabled,
                    enabled = vm.isConnected,
                    onChange = {
                        if (it) {
                            askNotificationPermission()
                            if (s.center == null && location == null) askLocation()
                        }
                        vm.setNearbyEnabled(it)
                    },
                )

                if (s.nearbyEnabled) {
                    Spacer(Modifier.height(12.dp))
                    Text("Zona", style = MaterialTheme.typography.titleSmall)
                    Text(
                        if (s.center == null) "Aún no sabemos dónde estás. Pulsa el botón para usar tu ubicación."
                        else "Alrededor del sitio donde activaste los avisos.",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (s.center == null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedButton(onClick = {
                        if (!vm.useCurrentLocationForAlerts()) {
                            askLocation()
                            locationMsg = "Activa la ubicación y vuelve a pulsar."
                        } else {
                            locationMsg = "Zona actualizada a tu ubicación actual ✓"
                        }
                    }) {
                        Icon(Icons.Filled.MyLocation, null); Spacer(Modifier.width(6.dp)); Text("Usar mi ubicación actual")
                    }
                    locationMsg?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }

                    Spacer(Modifier.height(8.dp))
                    Text("Distancia", style = MaterialTheme.typography.titleSmall)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(5, 10, 20, 50, 100).forEach { km ->
                            FilterChip(s.radiusKm == km, { vm.setAlertRadius(km) }, { Text("$km km") })
                        }
                    }

                    Spacer(Modifier.height(8.dp))
                    Text("Qué te interesa", style = MaterialTheme.typography.titleSmall)
                    Text(
                        if (s.categories.isEmpty()) "Todo (toca para elegir solo algunos tipos)" else "Solo los tipos marcados",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Category.entries.forEach { c ->
                            FilterChip(c in s.categories, { vm.toggleAlertCategory(c) }, { Text("${c.emoji} ${c.label}") })
                        }
                    }
                }
            }

            OutlinedButton(
                onClick = { askNotificationPermission(); vm.sendTestNotification() },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Filled.NotificationsActive, null); Spacer(Modifier.width(6.dp)); Text("Enviarme un aviso de prueba")
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun SettingCard(content: @Composable () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainer, shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) { content() }
    }
}

@Composable
private fun SwitchRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
    enabled: Boolean = true,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}
