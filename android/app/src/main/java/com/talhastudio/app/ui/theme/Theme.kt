package com.talhastudio.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val Light = lightColorScheme(
    primary = TS.Black, onPrimary = TS.Ivory,
    secondary = TS.Gold, onSecondary = TS.Black,
    background = TS.Ivory, onBackground = TS.Black,
    surface = TS.Surface, onSurface = TS.Black,
    surfaceVariant = TS.Neutral, onSurfaceVariant = TS.Gray,
    outline = TS.Neutral, error = TS.Danger,
)
private val Dark = darkColorScheme(
    primary = TS.Gold, onPrimary = TS.Black,
    secondary = TS.Gold, onSecondary = TS.Black,
    background = TS.Black, onBackground = TS.Ivory,
    surface = androidx.compose.ui.graphics.Color(0xFF141414), onSurface = TS.Ivory,
    surfaceVariant = androidx.compose.ui.graphics.Color(0xFF1E1E1E), onSurfaceVariant = TS.Gray,
    outline = androidx.compose.ui.graphics.Color(0xFF2A2A2A), error = TS.Danger,
)

@Composable
fun TalhaTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = TalhaTypography, content = content)
}
