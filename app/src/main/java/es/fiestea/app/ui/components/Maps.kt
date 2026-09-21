package es.fiestea.app.ui.components

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import es.fiestea.app.data.Category
import es.fiestea.app.data.EventItem
import es.fiestea.app.data.GeoPos
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker

private fun GeoPos.toPoint() = GeoPoint(lat, lon)

@Composable
private fun rememberMapView(): MapView {
    val context = LocalContext.current
    val mapView = remember {
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
            isTilesScaledToDpi = true
            controller.setZoom(12.0)
            // Que el mapa se pueda arrastrar aunque esté dentro de una pantalla con scroll
            @Suppress("ClickableViewAccessibility")
            setOnTouchListener { v, _ ->
                v.parent?.requestDisallowInterceptTouchEvent(true)
                false
            }
        }
    }
    DisposableEffect(mapView) {
        mapView.onResume()
        onDispose {
            mapView.onPause()
            mapView.onDetach()
        }
    }
    return mapView
}

/** Círculo de color con el emoji de la categoría, como marcador del mapa. */
private fun markerIcon(context: android.content.Context, category: Category, highlighted: Boolean): Drawable {
    val density = context.resources.displayMetrics.density
    val size = ((if (highlighted) 46 else 38) * density).toInt()
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = android.graphics.Color.WHITE
    canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
    paint.color = category.color.toInt()
    canvas.drawCircle(size / 2f, size / 2f, size / 2f - 2.5f * density, paint)
    paint.textSize = size * 0.5f
    paint.textAlign = Paint.Align.CENTER
    val y = size / 2f - (paint.descent() + paint.ascent()) / 2f
    canvas.drawText(category.emoji, size / 2f, y, paint)
    return BitmapDrawable(context.resources, bmp)
}

/** Mapa de OpenStreetMap con un marcador por evento. */
@Composable
fun EventsMap(
    items: List<EventItem>,
    center: GeoPos,
    userLocation: GeoPos?,
    onEventClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val mapView = rememberMapView()
    val onClick = rememberUpdatedState(onEventClick)
    val iconCache = remember { HashMap<Category, Drawable>() }

    LaunchedEffect(center) {
        mapView.controller.setCenter(center.toPoint())
    }

    AndroidView(
        factory = { mapView },
        modifier = modifier,
        update = { map ->
            map.overlays.clear()
            if (userLocation != null) {
                map.overlays.add(Marker(map).apply {
                    position = userLocation.toPoint()
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                    title = "Estás aquí"
                    icon = youAreHereIcon(context)
                    setOnMarkerClickListener { _, _ -> true }
                })
            }
            items.forEach { item ->
                val e = item.event
                map.overlays.add(Marker(map).apply {
                    position = e.position.toPoint()
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                    title = e.title
                    icon = iconCache.getOrPut(e.category) { markerIcon(context, e.category, false) }
                    setOnMarkerClickListener { _, _ ->
                        onClick.value(e.id); true
                    }
                })
            }
            map.invalidate()
        },
    )
}

private fun youAreHereIcon(context: android.content.Context): Drawable {
    val d = context.resources.displayMetrics.density
    val size = (22 * d).toInt()
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val p = Paint(Paint.ANTI_ALIAS_FLAG)
    p.color = android.graphics.Color.WHITE
    c.drawCircle(size / 2f, size / 2f, size / 2f, p)
    p.color = 0xFF3B82F6.toInt()
    c.drawCircle(size / 2f, size / 2f, size / 2f - 3 * d, p)
    return BitmapDrawable(context.resources, bmp)
}

/**
 * Mapa para elegir un punto: el usuario mueve el mapa y el pin central marca la ubicación.
 */
@Composable
fun LocationPickerMap(
    initial: GeoPos,
    onCenterChange: (GeoPos) -> Unit,
    modifier: Modifier = Modifier,
) {
    val mapView = rememberMapView()
    val callback = rememberUpdatedState(onCenterChange)

    LaunchedEffect(Unit) {
        mapView.controller.setZoom(15.0)
        mapView.controller.setCenter(initial.toPoint())
        mapView.addMapListener(object : MapListener {
            override fun onScroll(event: ScrollEvent?): Boolean {
                val c = mapView.mapCenter
                callback.value(GeoPos(c.latitude, c.longitude))
                return false
            }

            override fun onZoom(event: ZoomEvent?): Boolean = false
        })
    }

    Box(modifier) {
        AndroidView(factory = { mapView }, modifier = Modifier.fillMaxSize())
        Icon(
            Icons.Filled.Place, contentDescription = "Ubicación elegida",
            tint = MaterialTheme.colorScheme.secondary,
            modifier = Modifier.align(Alignment.Center).size(44.dp).offset(y = (-20).dp),
        )
    }
}
