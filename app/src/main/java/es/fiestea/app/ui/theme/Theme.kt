package es.fiestea.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Purple = Color(0xFF8B5CF6)
val Pink = Color(0xFFEC4899)
val Night = Color(0xFF120B1E)
val NightSurface = Color(0xFF1C1430)
val NightSurfaceHigh = Color(0xFF2A1F45)

private val FiesteaColors = darkColorScheme(
    primary = Purple,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF4C2A99),
    onPrimaryContainer = Color(0xFFEDE4FF),
    secondary = Pink,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFF6B1F48),
    onSecondaryContainer = Color(0xFFFFD9EA),
    tertiary = Color(0xFFF59E0B),
    background = Night,
    onBackground = Color(0xFFEDE7F6),
    surface = Night,
    onSurface = Color(0xFFEDE7F6),
    surfaceVariant = NightSurfaceHigh,
    onSurfaceVariant = Color(0xFFBDB2D6),
    surfaceContainerLowest = Color(0xFF0D0816),
    surfaceContainerLow = Color(0xFF181027),
    surfaceContainer = NightSurface,
    surfaceContainerHigh = Color(0xFF241A3A),
    surfaceContainerHighest = NightSurfaceHigh,
    outline = Color(0xFF6E6388),
    outlineVariant = Color(0xFF3A2F55),
)

@Composable
fun FiesteaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = FiesteaColors, content = content)
}
