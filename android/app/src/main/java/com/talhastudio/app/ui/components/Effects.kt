package com.talhastudio.app.ui.components

import android.os.SystemClock
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.math.abs

/** A soft band of light that sweeps across the element every few seconds (sale badges, the sale bar). */
fun Modifier.shimmerSweep(color: Color = Color.White.copy(alpha = 0.55f), durationMs: Int = 1600, pauseMs: Int = 1800): Modifier = composed {
    val t = rememberInfiniteTransition(label = "shine")
    val p by t.animateFloat(-0.35f, 1.35f, infiniteRepeatable(tween(durationMs, delayMillis = pauseMs, easing = LinearEasing), RepeatMode.Restart), label = "shineP")
    drawWithContent {
        drawContent()
        val w = size.width; val h = size.height; val x = w * p
        drawRect(Brush.linearGradient(listOf(Color.Transparent, color, Color.Transparent), start = Offset(x - w * 0.18f, 0f), end = Offset(x + w * 0.18f, h)))
    }
}

/** Springy "pressed" feedback: the element shrinks a little while a finger is on it. */
fun Modifier.pressScale(interaction: InteractionSource, pressed: Float = 0.96f): Modifier = composed {
    val down by interaction.collectIsPressedAsState()
    val s by animateFloatAsState(if (down) pressed else 1f, spring(dampingRatio = 0.55f, stiffness = Spring.StiffnessMedium), label = "press")
    graphicsLayer { scaleX = s; scaleY = s }
}

/** Fades and slides an element in once, a moment after the screen opens (index = order in the list). */
fun Modifier.staggerIn(index: Int, stepMs: Int = 70): Modifier = composed {
    val a = remember { Animatable(0f) }
    LaunchedEffect(Unit) { delay((index * stepMs).toLong()); a.animateTo(1f, tween(420, easing = FastOutSlowInEasing)) }
    graphicsLayer { alpha = a.value; translationY = (1f - a.value) * 28.dp.toPx() }
}

/**
 * Cover-flow look for a row of cards: the cards near the edges turn away a little, shrink and fade, the one in the middle faces you.
 * Everything is read inside graphicsLayer, so scrolling only redraws (no recomposition).
 */
fun Modifier.carousel3d(state: LazyListState, key: Any): Modifier = graphicsLayer {
    val info = state.layoutInfo
    val item = info.visibleItemsInfo.firstOrNull { it.key == key }
    if (item != null && info.viewportSize.width > 0) {
        val center = (info.viewportStartOffset + info.viewportEndOffset) / 2f
        val frac = ((item.offset + item.size / 2f - center) / (info.viewportSize.width / 2f)).coerceIn(-1.3f, 1.3f)
        val a = abs(frac).coerceAtMost(1f)
        cameraDistance = 14f * density
        rotationY = -frac * 16f
        scaleX = 1f - 0.07f * a; scaleY = 1f - 0.07f * a
        alpha = 1f - 0.28f * a
    }
}

/** Slow, smooth drift of a horizontal row so the shop always looks alive. Pauses while the customer touches it and resumes a moment later. */
@Composable
fun AutoScroll(state: LazyListState, enabled: Boolean = true, dpPerSecond: Float = 22f) {
    val dragged by state.interactionSource.collectIsDraggedAsState()
    var resumeAt by remember { mutableLongStateOf(0L) }
    val density = LocalDensity.current
    LaunchedEffect(dragged) { resumeAt = if (dragged) Long.MAX_VALUE else SystemClock.uptimeMillis() + 3000L }
    LaunchedEffect(enabled) {
        if (!enabled) return@LaunchedEffect
        var last = androidx.compose.runtime.withFrameNanos { it }
        while (isActive) {
            val now = androidx.compose.runtime.withFrameNanos { it }
            val dt = (now - last) / 1_000_000_000f; last = now
            if (SystemClock.uptimeMillis() < resumeAt || state.isScrollInProgress) continue
            val px = with(density) { dpPerSecond.dp.toPx() } * dt
            if (!state.canScrollForward) { delay(1800); state.animateScrollToItem(0); delay(1500); last = androidx.compose.runtime.withFrameNanos { it }; continue }
            state.scrollBy(px)
        }
    }
}

/** Gold "NN% OFF" pill with a moving glint and a gentle pulse, so sale items catch the eye. */
@Composable
fun SaleBadge(percent: Int, modifier: Modifier = Modifier) {
    val t = rememberInfiniteTransition(label = "badge")
    val pulse by t.animateFloat(1f, 1.07f, infiniteRepeatable(tween(1100, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "badgePulse")
    val shape = RoundedCornerShape(50)
    Box(modifier.graphicsLayer { scaleX = pulse; scaleY = pulse }.clip(shape)
        .background(Brush.linearGradient(listOf(Color(0xFFE9CF98), TS.Gold, Color(0xFFD7B672))))
        .shimmerSweep(Color.White.copy(alpha = 0.75f), durationMs = 1100, pauseMs = 1400)) {
        Text("$percent% OFF", style = MaterialTheme.typography.labelSmall, color = TS.Black, modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp))
    }
}
