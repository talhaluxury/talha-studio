package com.talhastudio.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Frosted-glass surface: translucent fill + hairline border. Compose cannot blur the content *behind* a
 * layer, so depth comes from translucency over imagery; this works on every API level.
 */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier, corner: Dp = 20.dp,
    tint: Color = Color.White.copy(alpha = 0.72f),
    border: Color = Color.White.copy(alpha = 0.55f),
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier, shape = RoundedCornerShape(corner), color = tint,
        border = BorderStroke(0.8.dp, border), tonalElevation = 0.dp, shadowElevation = 6.dp,
    ) { Box { content() } }
}
