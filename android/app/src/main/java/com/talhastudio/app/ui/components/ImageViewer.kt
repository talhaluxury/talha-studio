package com.talhastudio.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage

/**
 * One photo that can be pinched (up to 5x), dragged around while zoomed, and double-tapped to zoom in and out.
 * While it is zoomed it keeps its touches, so a surrounding pager does not swipe away by accident ([onZoomChange] tells the pager).
 */
@Composable
fun ZoomableImage(url: String, label: String, active: Boolean, modifier: Modifier = Modifier, onZoomChange: (Boolean) -> Unit = {}) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var gesturing by remember { mutableStateOf(false) }
    LaunchedEffect(active) { if (!active) { scale = 1f; offset = Offset.Zero } }            // swiping to another photo resets this one
    LaunchedEffect(scale > 1.01f) { onZoomChange(scale > 1.01f) }
    val spec = if (gesturing) snap<Float>() else tween<Float>(240)
    val shownScale by animateFloatAsState(scale, spec, label = "zoom")
    val shownX by animateFloatAsState(offset.x, spec, label = "zoomX")
    val shownY by animateFloatAsState(offset.y, spec, label = "zoomY")

    BoxWithConstraints(modifier.clipToBounds()) {
        val w = constraints.maxWidth.toFloat(); val h = constraints.maxHeight.toFloat()
        fun clamp(o: Offset, s: Float): Offset { val mx = w * (s - 1f) / 2f; val my = h * (s - 1f) / 2f; return Offset(o.x.coerceIn(-mx, mx), o.y.coerceIn(-my, my)) }
        AsyncImage(
            model = url, contentDescription = label, contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize()
                .pointerInput(w, h) {
                    detectTapGestures(onDoubleTap = { tap ->
                        if (scale > 1.05f) { scale = 1f; offset = Offset.Zero }
                        else { scale = 2.5f; offset = clamp(Offset((w / 2f - tap.x) * 1.5f, (h / 2f - tap.y) * 1.5f), 2.5f) }   // zoom toward the spot that was tapped
                    })
                }
                .pointerInput(w, h) {
                    awaitEachGesture {
                        awaitFirstDown(requireUnconsumed = false)
                        do {
                            val ev = awaitPointerEvent()
                            val zoom = ev.calculateZoom(); val pan = ev.calculatePan()
                            if (ev.changes.size > 1 || scale > 1.01f) {                // two fingers, or already zoomed: this image keeps the touch
                                gesturing = true
                                val ns = (scale * zoom).coerceIn(1f, 5f)
                                scale = ns
                                offset = if (ns <= 1.01f) Offset.Zero else clamp(offset + pan, ns)
                                ev.changes.forEach { if (it.positionChanged()) it.consume() }
                            }
                        } while (ev.changes.any { it.pressed })
                        gesturing = false
                        if (scale < 1.05f) { scale = 1f; offset = Offset.Zero }
                    }
                }
                .graphicsLayer { scaleX = shownScale; scaleY = shownScale; translationX = shownX; translationY = shownY },
        )
    }
}

/** Full-screen photo viewer for the product page: swipe between photos, pinch or double-tap to zoom. */
@Composable
fun ImageViewerDialog(urls: List<String>, startIndex: Int, title: String, onDismiss: () -> Unit) {
    if (urls.isEmpty()) return
    val pager = rememberPagerState(initialPage = startIndex.coerceIn(0, urls.size - 1)) { urls.size }
    var zoomed by remember { mutableStateOf(false) }
    LaunchedEffect(pager.currentPage) { zoomed = false }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(pager, Modifier.fillMaxSize(), userScrollEnabled = !zoomed) { i ->
                ZoomableImage(urls[i], title, active = pager.currentPage == i, modifier = Modifier.fillMaxSize(), onZoomChange = { if (pager.currentPage == i) zoomed = it })
            }
            IconButton(onDismiss, Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(8.dp)) {
                Icon(Icons.Outlined.Close, "Close", tint = Color.White, modifier = Modifier.clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.5f)).padding(6.dp))
            }
            Column(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (urls.size > 1) Text("${pager.currentPage + 1} / ${urls.size}", style = MaterialTheme.typography.labelMedium, color = Color.White)
                Text("Pinch or double-tap to zoom", style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.85f),
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.55f)).padding(horizontal = 12.dp, vertical = 6.dp))
            }
        }
    }
}
