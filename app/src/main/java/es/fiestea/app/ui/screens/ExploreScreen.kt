package es.fiestea.app.ui.screens

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import es.fiestea.app.data.Category
import es.fiestea.app.data.EventItem
import es.fiestea.app.data.SeedEvents
import es.fiestea.app.ui.DateFilter
import es.fiestea.app.ui.EventsViewModel
import es.fiestea.app.ui.Filters
import es.fiestea.app.ui.PriceFilter
import es.fiestea.app.ui.components.EmptyState
import es.fiestea.app.ui.components.EventCard
import es.fiestea.app.ui.components.EventsMap

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExploreScreen(vm: EventsViewModel, onOpenEvent: (String) -> Unit, onAskLocation: () -> Unit) {
    val items by vm.visibleItems.collectAsState()
    val filters by vm.filters.collectAsState()
    val saved by vm.saved.collectAsState()
    val location by vm.userLocation.collectAsState()
    val loading by vm.loading.collectAsState()
    val error by vm.error.collectAsState()
    val vibes by vm.vibes.collectAsState()

    var showMap by rememberSaveable { mutableStateOf(false) }

    // El ambiente en directo cambia rápido: lo refrescamos cada 2 minutos mientras miras la lista
    androidx.compose.runtime.LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(120_000)
            vm.refreshVibes()
        }
    }
    var showFilters by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Fiestea", fontWeight = FontWeight.Black) },
                actions = {
                    IconButton(onClick = { vm.refresh() }) { Icon(Icons.Filled.Refresh, "Actualizar") }
                    IconButton(onClick = { showMap = !showMap }) {
                        Icon(
                            if (showMap) Icons.AutoMirrored.Filled.List else Icons.Filled.Map,
                            if (showMap) "Ver lista" else "Ver mapa",
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            SearchAndQuickFilters(
                filters = filters,
                onQuery = { q -> vm.updateFilters { it.copy(query = q) } },
                onDate = { d -> vm.updateFilters { it.copy(date = if (it.date == d) DateFilter.TODAS else d) } },
                onFree = { vm.updateFilters { it.copy(price = if (it.price == PriceFilter.GRATIS) PriceFilter.TODOS else PriceFilter.GRATIS) } },
                onOpenFilters = { showFilters = true },
            )
            if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            error?.let {
                Text(
                    it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }

            if (showMap) {
                val center = mapCenter(items, location)
                Box(Modifier.fillMaxSize()) {
                    EventsMap(
                        items = items, center = center, userLocation = location,
                        onEventClick = onOpenEvent, modifier = Modifier.fillMaxSize(),
                    )
                    SmallFloatingActionButton(
                        onClick = { if (location == null) onAskLocation() else vm.locateAndRefresh() },
                        modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
                    ) { Icon(Icons.Filled.MyLocation, "Mi ubicación") }
                    if (items.isEmpty() && !loading) {
                        Text(
                            "No hay fiestas con estos filtros",
                            modifier = Modifier.align(Alignment.TopCenter).padding(12.dp),
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }
            } else {
                EventList(
                    events = items, saved = saved, vibes = vibes, hasLocation = location != null, loading = loading,
                    filtersActive = filters.activeCount > 0 || filters.query.isNotBlank(),
                    onOpenEvent = onOpenEvent, onToggleSaved = vm::toggleSaved,
                    onAskLocation = onAskLocation, onReset = { vm.resetFilters(); vm.updateFilters { it.copy(query = "") } },
                )
            }
        }
    }

    if (showFilters) {
        FiltersSheet(
            filters = filters,
            hasLocation = location != null,
            onChange = { f -> vm.updateFilters { f } },
            onReset = vm::resetFilters,
            onDismiss = { showFilters = false },
        )
    }
}

/** Centro del mapa: el usuario si tiene fiestas cerca; si no, la media de las fiestas. */
private fun mapCenter(items: List<EventItem>, location: es.fiestea.app.data.GeoPos?): es.fiestea.app.data.GeoPos {
    if (location != null && (items.isEmpty() || items.any { (it.distanceKm ?: 999.0) < 50 })) return location
    if (items.isEmpty()) return SeedEvents.DEFAULT_CENTER
    val near = items.take(30)
    return es.fiestea.app.data.GeoPos(near.map { it.event.position.lat }.average(), near.map { it.event.position.lon }.average())
}

@Composable
private fun SearchAndQuickFilters(
    filters: Filters,
    onQuery: (String) -> Unit,
    onDate: (DateFilter) -> Unit,
    onFree: () -> Unit,
    onOpenFilters: () -> Unit,
) {
    Column(Modifier.padding(horizontal = 16.dp)) {
        OutlinedTextField(
            value = filters.query,
            onValueChange = onQuery,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Busca fiesta, pueblo o sitio…") },
            leadingIcon = { Icon(Icons.Filled.Search, null) },
            trailingIcon = {
                if (filters.query.isNotEmpty()) IconButton(onClick = { onQuery("") }) { Icon(Icons.Filled.Close, "Borrar") }
            },
            singleLine = true,
            shape = RoundedCornerShape(50),
        )
        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BadgedBox(badge = { if (filters.activeCount > 0) Badge { Text("${filters.activeCount}") } }) {
                FilterChip(
                    selected = filters.activeCount > 0, onClick = onOpenFilters,
                    label = { Text("Filtros") }, leadingIcon = { Icon(Icons.Filled.Tune, null) },
                )
            }
            listOf(DateFilter.HOY, DateFilter.FINDE, DateFilter.SEMANA).forEach { d ->
                FilterChip(selected = filters.date == d, onClick = { onDate(d) }, label = { Text(d.label) })
            }
            FilterChip(selected = filters.price == PriceFilter.GRATIS, onClick = onFree, label = { Text("Gratis") })
        }
    }
}

@Composable
private fun EventList(
    events: List<EventItem>,
    saved: Set<String>,
    vibes: Map<String, es.fiestea.app.data.VibeSummary>,
    hasLocation: Boolean,
    loading: Boolean,
    filtersActive: Boolean,
    onOpenEvent: (String) -> Unit,
    onToggleSaved: (String) -> Unit,
    onAskLocation: () -> Unit,
    onReset: () -> Unit,
) {
    val now = java.time.LocalDateTime.now()
    val tonight = events.filter {
        val e = it.event
        e.isLive(now) || (e.start.toLocalDate() == now.toLocalDate() && e.start.isAfter(now))
    }
    val later = events - tonight.toSet()

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (!hasLocation) {
            item {
                OutlinedButton(onClick = onAskLocation, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.MyLocation, null)
                    Spacer(Modifier.padding(4.dp))
                    Text("Activa la ubicación para ver lo más cercano")
                }
            }
        }
        if (events.isEmpty() && !loading) {
            item {
                if (filtersActive) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                        EmptyState("🔍", "Nada con estos filtros", "Prueba a quitar alguno o ampliar la distancia.")
                        Button(onClick = onReset) { Text("Quitar filtros") }
                    }
                } else {
                    EmptyState(
                        "🌙", "Todavía no hay fiestas aquí",
                        "El buscador automático añade fiestas nuevas cada noche. ¡Vuelve pronto o publica la tuya!",
                    )
                }
            }
        }
        if (tonight.isNotEmpty()) {
            item { SectionTitle(if (hasLocation) "Esta noche cerca de ti" else "Esta noche") }
            items(tonight, key = { "t-" + it.event.id }) { item ->
                EventCard(
                    item, item.event.id in saved, { onOpenEvent(item.event.id) }, { onToggleSaved(item.event.id) },
                    vibe = vibes[item.event.id],
                )
            }
        }
        if (later.isNotEmpty()) {
            item { SectionTitle("Próximamente") }
            items(later, key = { "l-" + it.event.id }) { item ->
                EventCard(
                    item, item.event.id in saved, { onOpenEvent(item.event.id) }, { onToggleSaved(item.event.id) },
                    vibe = vibes[item.event.id],
                )
            }
        }
    }
}

@Composable
fun SectionTitle(text: String) {
    Text(
        text, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 12.dp, bottom = 2.dp),
    )
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun FiltersSheet(
    filters: Filters,
    hasLocation: Boolean,
    onChange: (Filters) -> Unit,
    onReset: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(horizontal = 20.dp).navigationBarsPadding().padding(bottom = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Filtros", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                TextButton(onClick = onReset) { Text("Restablecer") }
            }

            FilterGroup("Cuándo")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DateFilter.entries.forEach { d ->
                    FilterChip(filters.date == d, { onChange(filters.copy(date = d)) }, { Text(d.label) })
                }
            }

            FilterGroup("Tipo")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Category.entries.forEach { c ->
                    val sel = c in filters.categories
                    FilterChip(
                        selected = sel,
                        onClick = { onChange(filters.copy(categories = if (sel) filters.categories - c else filters.categories + c)) },
                        label = { Text("${c.emoji} ${c.label}") },
                    )
                }
            }

            FilterGroup("Precio")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PriceFilter.entries.forEach { p ->
                    FilterChip(filters.price == p, { onChange(filters.copy(price = p)) }, { Text(p.label) })
                }
            }

            FilterGroup(if (hasLocation) "Distancia" else "Distancia (necesita ubicación)")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(5, 15, 30, 60, null).forEach { km ->
                    FilterChip(
                        selected = filters.maxKm == km,
                        onClick = { onChange(filters.copy(maxKm = km)) },
                        enabled = hasLocation,
                        label = { Text(if (km == null) "Sin límite" else "$km km") },
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
            Button(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) { Text("Ver resultados") }
        }
    }
}

@Composable
private fun FilterGroup(title: String) {
    Text(
        title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 16.dp, bottom = 6.dp),
    )
}
