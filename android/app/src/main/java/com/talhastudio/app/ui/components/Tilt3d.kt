package com.talhastudio.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import kotlinx.coroutines.launch

/**
 * Touch-driven 3D tilt: while a finger is on the element it turns toward the touch point (like a physical card), and it springs back on release.
 * The touch is only observed, never consumed, so taps, scrolling and clicks on the same element keep working.
 */
fun Modifier.tilt3d(maxDegrees: Float = 9f): Modifier = composed {
    var size by remember { mutableStateOf(IntSize.Zero) }
    val rx = remember { Animatable(0f) }
    val ry = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    this
        .onSizeChanged { size = it }
        .pointerInput(maxDegrees) {
            awaitPointerEventScope {
                while (true) {
                    val change = awaitPointerEvent(PointerEventPass.Initial).changes.firstOrNull() ?: continue
                    if (change.pressed && size.width > 0 && size.height > 0) {
                        val nx = ((change.position.x / size.width) - 0.5f).coerceIn(-0.5f, 0.5f) * 2f
                        val ny = ((change.position.y / size.height) - 0.5f).coerceIn(-0.5f, 0.5f) * 2f
                        scope.launch { ry.snapTo(nx * maxDegrees); rx.snapTo(-ny * maxDegrees) }
                    } else if (rx.value != 0f || ry.value != 0f) {
                        scope.launch { launch { ry.animateTo(0f, spring(Spring.DampingRatioMediumBouncy, Spring.StiffnessLow)) }; rx.animateTo(0f, spring(Spring.DampingRatioMediumBouncy, Spring.StiffnessLow)) }
                    }
                }
            }
        }
        .graphicsLayer {
            cameraDistance = 14f * density
            rotationY = ry.value
            rotationX = rx.value
        }
}
