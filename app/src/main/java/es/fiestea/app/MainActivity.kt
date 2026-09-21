package es.fiestea.app

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import es.fiestea.app.notify.Notifications
import es.fiestea.app.ui.EventsViewModel
import es.fiestea.app.ui.screens.AlertsScreen
import es.fiestea.app.ui.screens.AuthScreen
import es.fiestea.app.ui.screens.CreateEventScreen
import es.fiestea.app.ui.screens.EventDetailScreen
import es.fiestea.app.ui.screens.ExploreScreen
import es.fiestea.app.ui.screens.ProfileScreen
import es.fiestea.app.ui.theme.FiesteaTheme
import org.osmdroid.config.Configuration

class MainActivity : ComponentActivity() {

    /** Evento a abrir cuando se pulsa una notificación. */
    private val openEventId = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // osmdroid necesita un user-agent propio para descargar el mapa de OpenStreetMap
        Configuration.getInstance().load(this, getSharedPreferences("osmdroid", MODE_PRIVATE))
        Configuration.getInstance().userAgentValue = packageName
        Notifications.createChannels(this)
        openEventId.value = intent?.getStringExtra(Notifications.EXTRA_EVENT_ID)
        enableEdgeToEdge()
        setContent {
            FiesteaTheme {
                val pending by openEventId
                FiesteaApp(openEventId = pending, onEventOpened = { openEventId.value = null })
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(Notifications.EXTRA_EVENT_ID)?.let { openEventId.value = it }
    }
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab("explore", "Explorar", Icons.Filled.Explore),
    Tab("create", "Publicar", Icons.Filled.AddCircle),
    Tab("profile", "Mis planes", Icons.Filled.Person),
)

@Composable
fun FiesteaApp(
    openEventId: String?,
    onEventOpened: () -> Unit,
    vm: EventsViewModel = viewModel(),
) {
    val nav = rememberNavController()
    val context = LocalContext.current

    val locationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { vm.locateAndRefresh() }
    val askLocation = {
        locationLauncher.launch(
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
        )
    }

    // Android 13+ pide permiso para mostrar notificaciones
    val notificationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }
    val askNotifications = {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !Notifications.canNotify(context)) {
            notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    LaunchedEffect(Unit) {
        if (vm.hasLocationPermission()) vm.locateAndRefresh() else askLocation()
    }

    // Al pulsar una notificación, abrimos la ficha de la fiesta
    LaunchedEffect(openEventId) {
        if (openEventId != null) {
            nav.navigate("event/$openEventId")
            onEventOpened()
        }
    }

    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val showBar = TABS.any { it.route == route }
    val openAuth = { nav.navigate("auth") }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        bottomBar = {
            if (showBar) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLow) {
                    TABS.forEach { tab ->
                        NavigationBarItem(
                            selected = route == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, null) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = "explore",
            modifier = Modifier.padding(padding).consumeWindowInsets(padding),
        ) {
            composable("explore") {
                ExploreScreen(vm, onOpenEvent = { nav.navigate("event/$it") }, onAskLocation = askLocation)
            }
            composable("create") {
                CreateEventScreen(
                    vm,
                    onCreated = { id ->
                        askNotifications()
                        nav.navigate("event/$id") { popUpTo("explore") }
                    },
                    onNeedLogin = openAuth,
                )
            }
            composable("profile") {
                ProfileScreen(
                    vm,
                    onOpenEvent = { nav.navigate("event/$it") },
                    onOpenAuth = openAuth,
                    onOpenAlerts = { nav.navigate("alerts") },
                )
            }
            composable("event/{id}") { entry ->
                val id = entry.arguments?.getString("id").orEmpty()
                EventDetailScreen(
                    vm, id,
                    onBack = { nav.popBackStack() },
                    onNeedLogin = openAuth,
                    askNotificationPermission = askNotifications,
                    askLocation = askLocation,
                )
            }
            composable("auth") {
                AuthScreen(vm, onDone = { nav.popBackStack() }, onBack = { nav.popBackStack() })
            }
            composable("alerts") {
                AlertsScreen(
                    vm,
                    onBack = { nav.popBackStack() },
                    askNotificationPermission = askNotifications,
                    askLocation = askLocation,
                )
            }
        }
    }
}
