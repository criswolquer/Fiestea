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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import es.fiestea.app.data.Category
import es.fiestea.app.data.SeedEvents
import es.fiestea.app.ui.EventsViewModel
import es.fiestea.app.ui.components.EmptyState
import es.fiestea.app.ui.components.LocationPickerMap
import es.fiestea.app.ui.dayLabel
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CreateEventScreen(vm: EventsViewModel, onCreated: (String) -> Unit, onNeedLogin: () -> Unit) {
    val session by vm.session.collectAsState()
    if (vm.isConnected && session == null) {
        LoginGate(onNeedLogin)
        return
    }
    CreateEventForm(vm, onCreated)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LoginGate(onNeedLogin: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Publicar fiesta", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            EmptyState(
                "📣", "Publica tu fiesta",
                "Para evitar fiestas falsas, necesitas una cuenta. Es gratis y se tarda un minuto.",
            )
            Button(onClick = onNeedLogin, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Text("Entrar o crear cuenta")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun CreateEventForm(vm: EventsViewModel, onCreated: (String) -> Unit) {
    val userLocation by vm.userLocation.collectAsState()
    val scope = rememberCoroutineScope()

    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var category by remember { mutableStateOf(Category.FIESTA_PUEBLO) }
    var date by remember { mutableStateOf(LocalDate.now()) }
    var startTime by remember { mutableStateOf(LocalTime.of(22, 0)) }
    var hasEnd by remember { mutableStateOf(true) }
    var endTime by remember { mutableStateOf(LocalTime.of(3, 0)) }
    var venue by remember { mutableStateOf("") }
    var town by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var organizer by remember { mutableStateOf("") }
    val initialPos = remember { userLocation ?: SeedEvents.DEFAULT_CENTER }
    var position by remember { mutableStateOf(initialPos) }

    var showDate by remember { mutableStateOf(false) }
    var showStart by remember { mutableStateOf(false) }
    var showEnd by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    val priceValue = price.replace(',', '.').toDoubleOrNull()
    val valid = title.isNotBlank() && (venue.isNotBlank() || town.isNotBlank()) &&
        (price.isBlank() || (priceValue != null && priceValue >= 0))
    val hhmm = DateTimeFormatter.ofPattern("HH:mm")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Publicar fiesta", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text("Nombre de la fiesta *") }, singleLine = true)

            Text("Tipo", style = MaterialTheme.typography.titleSmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Category.entries.forEach { c ->
                    FilterChip(category == c, { category = c }, { Text("${c.emoji} ${c.label}") })
                }
            }

            Text("Cuándo", style = MaterialTheme.typography.titleSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { showDate = true }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Filled.CalendarMonth, null); Spacer(Modifier.padding(3.dp)); Text(dayLabel(date))
                }
                OutlinedButton(onClick = { showStart = true }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Filled.Schedule, null); Spacer(Modifier.padding(3.dp)); Text(startTime.format(hhmm))
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Hora de fin", modifier = Modifier.weight(1f))
                if (hasEnd) {
                    TextButton(onClick = { showEnd = true }) { Text(endTime.format(hhmm)) }
                }
                Switch(checked = hasEnd, onCheckedChange = { hasEnd = it })
            }

            Text("Dónde", style = MaterialTheme.typography.titleSmall)
            OutlinedTextField(venue, { venue = it }, Modifier.fillMaxWidth(), label = { Text("Lugar (plaza, bar, sala…)") }, singleLine = true)
            OutlinedTextField(town, { town = it }, Modifier.fillMaxWidth(), label = { Text("Pueblo o ciudad") }, singleLine = true)
            Text(
                "Mueve el mapa para colocar el pin en el sitio exacto",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            LocationPickerMap(
                initial = initialPos,
                onCenterChange = { position = it },
                modifier = Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(20.dp)),
            )

            OutlinedTextField(
                price, { price = it }, Modifier.fillMaxWidth(),
                label = { Text("Precio en € (vacío = gratis)") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                isError = price.isNotBlank() && priceValue == null,
            )
            OutlinedTextField(organizer, { organizer = it }, Modifier.fillMaxWidth(), label = { Text("Organiza (opcional)") }, singleLine = true)
            OutlinedTextField(
                description, { description = it }, Modifier.fillMaxWidth().height(120.dp),
                label = { Text("Descripción (opcional)") },
            )

            Button(
                onClick = {
                    saving = true
                    scope.launch {
                        try {
                            val start = date.atTime(startTime)
                            val end = if (hasEnd) {
                                // Si la hora de fin es "antes" que la de inicio, es al día siguiente (p. ej. 22:00 → 03:00)
                                val sameDay = date.atTime(endTime)
                                if (sameDay.isAfter(start)) sameDay else sameDay.plusDays(1)
                            } else null
                            val created = vm.createEvent(
                                title, description, category, start, end, venue, town, position,
                                priceValue ?: 0.0, organizer,
                            )
                            onCreated(created.id)
                        } catch (e: es.fiestea.app.data.AuthException) {
                            errorMsg = e.message
                        } catch (e: Exception) {
                            errorMsg = "No se pudo publicar. Revisa tu conexión e inténtalo de nuevo."
                        } finally {
                            saving = false
                        }
                    }
                },
                enabled = valid && !saving,
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) { Text(if (saving) "Publicando…" else "Publicar") }
            Spacer(Modifier.height(24.dp))
        }
    }

    if (showDate) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = date.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let {
                        date = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()
                    }
                    showDate = false
                }) { Text("Aceptar") }
            },
            dismissButton = { TextButton(onClick = { showDate = false }) { Text("Cancelar") } },
        ) { DatePicker(state = state) }
    }

    if (showStart || showEnd) {
        val initial = if (showStart) startTime else endTime
        val state = rememberTimePickerState(initialHour = initial.hour, initialMinute = initial.minute, is24Hour = true)
        AlertDialog(
            onDismissRequest = { showStart = false; showEnd = false },
            title = { Text(if (showStart) "Hora de inicio" else "Hora de fin") },
            text = { TimePicker(state = state) },
            confirmButton = {
                TextButton(onClick = {
                    val t = LocalTime.of(state.hour, state.minute)
                    if (showStart) startTime = t else endTime = t
                    showStart = false; showEnd = false
                }) { Text("Aceptar") }
            },
            dismissButton = { TextButton(onClick = { showStart = false; showEnd = false }) { Text("Cancelar") } },
        )
    }

    errorMsg?.let { msg ->
        AlertDialog(
            onDismissRequest = { errorMsg = null },
            text = { Text(msg) },
            confirmButton = { TextButton(onClick = { errorMsg = null }) { Text("Vale") } },
        )
    }
}
