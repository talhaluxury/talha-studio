package com.talhastudio.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.talhastudio.app.FlyEvent
import com.talhastudio.app.ui.theme.TS
import kotlin.math.roundToInt

/**
 * The product picture leaves the "Add to Cart" button, flips like a coin along a curve, shrinks into the cart tab
 * of the bottom bar, and then [onLanded] runs (bounce the cart icon, open the cart).
 * Must be drawn over the whole window: the start position comes from positionInRoot().
 */
@Composable
fun FlyToCartOverlay(event: FlyEvent?, cartTabIndex: Int, tabCount: Int, onLanded: () -> Unit) {
    if (event == null) return
    val progress = remember(event) { Animatable(0f) }
    LaunchedEffect(event) {
        progress.animateTo(1f, tween(750, easing = FastOutSlowInEasing))
        onLanded()
    }
    val density = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val w = with(density) { maxWidth.toPx() }; val h = with(density) { maxHeight.toPx() }
        val navInset = WindowInsets.navigationBars.getBottom(density).toFloat()
        // Centre of the cart tab: bar margin 16dp + inner padding 6dp, five equal slots, bar centre 44dp above the bottom inset.
        val edge = with(density) { 22.dp.toPx() }; val slot = (w - 2 * edge) / tabCount
        val tx = edge + slot * (cartTabIndex + 0.5f)
        val ty = h - navInset - with(density) { 44.dp.toPx() }
        val p = progress.value
        val cx = (event.startX + tx) / 2f; val cy = minOf(event.startY, ty) - with(density) { 140.dp.toPx() }   // the curve bends upward
        val q = 1f - p
        val x = q * q * event.startX + 2 * q * p * cx + p * p * tx
        val y = q * q * event.startY + 2 * q * p * cy + p * p * ty
        val sizePx = with(density) { (96f + (24f - 96f) * p).dp.toPx() }
        Box(
            Modifier.offset { IntOffset((x - sizePx / 2).roundToInt(), (y - sizePx / 2).roundToInt()) }
                .size(with(density) { sizePx.toDp() })
                .graphicsLayer { rotationY = p * 540f; cameraDistance = 16f * density.density; alpha = 1f - 0.2f * p }
                .shadow(10.dp, CircleShape).clip(CircleShape).border(BorderStroke(2.dp, TS.Gold), CircleShape)
        ) { ImageTile(event.imageUrl, event.label, Modifier.fillMaxSize()) }
    }
}
