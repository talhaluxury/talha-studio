package com.talhastudio.app.ui.components

import android.os.SystemClock
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.talhastudio.app.data.ApiException
import com.talhastudio.app.data.Repo
import com.talhastudio.app.data.Sale
import com.talhastudio.app.data.SpinResult
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.random.Random

/** "2d 04:12:09" (days only when there are some). */
fun formatCountdown(ms: Long): String {
    val total = (ms / 1000).coerceAtLeast(0)
    val d = total / 86_400; val h = (total % 86_400) / 3_600; val m = (total % 3_600) / 60; val s = total % 60
    val hms = "%02d:%02d:%02d".format(h, m, s)
    return if (d > 0) "${d}d $hms" else hms
}

/** Milliseconds left in the sale, ticking every second. Reaches 0 (and stays) when the sale is over or there is none. */
@Composable
fun rememberSaleRemaining(sale: Sale?): State<Long> = produceState(initialValue = sale?.remainingMs(SystemClock.elapsedRealtime()) ?: 0L, sale) {
    if (sale == null) { value = 0L; return@produceState }
    while (true) {
        value = sale.remainingMs(SystemClock.elapsedRealtime())
        if (value <= 0L) break
        delay(1000)
    }
}

private val tabularNumbers @Composable get() = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold, fontFeatureSettings = "tnum")

/** Frosted-glass white fill for the sale timer: translucent white that fades slightly toward the bottom, with black text on top. */
private val glassWhite = Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.95f), Color.White.copy(alpha = 0.76f)))

/** The bar that floats above the bottom bar: glassy white, black text, a gold glow that breathes and a glint that sweeps across. Tap = show every item on sale. */
@Composable
fun SaleBar(sale: Sale, remainingMs: Long, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(50)
    val t = rememberInfiniteTransition(label = "salebar")
    val glow by t.animateFloat(0.25f, 0.95f, infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "glow")
    val tick by t.animateFloat(0.9f, 1.12f, infiniteRepeatable(tween(900, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "tick")
    Row(modifier.shadow(14.dp, shape, ambientColor = TS.Gold.copy(alpha = glow), spotColor = TS.Gold.copy(alpha = glow))
        .clip(shape).background(glassWhite)
        .border(1.dp, Brush.linearGradient(listOf(Color.White, TS.Gold.copy(alpha = 0.4f + glow * 0.6f), Color.White)), shape)
        .shimmerSweep(TS.Gold.copy(alpha = 0.40f))
        .clickable(onClick = onClick).padding(start = 14.dp, end = 8.dp, top = 7.dp, bottom = 7.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(Icons.Outlined.Timer, null, tint = Color.Black, modifier = Modifier.size(18.dp).graphicsLayer { scaleX = tick; scaleY = tick })
        Text(sale.label, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold), color = Color.Black, maxLines = 1)
        Text(formatCountdown(remainingMs), style = tabularNumbers, color = Color.Black)
        Row(Modifier.clip(RoundedCornerShape(50)).background(TS.Black).padding(start = 10.dp, end = 4.dp, top = 3.dp, bottom = 3.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("See items", style = MaterialTheme.typography.labelSmall, color = TS.Gold)
            Icon(Icons.Outlined.ChevronRight, null, tint = TS.Gold, modifier = Modifier.size(16.dp))
        }
    }
}

/** Smaller version for the product page: sits at the left, just above the bottom bar. Same glassy white look. */
@Composable
fun SaleChip(remainingMs: Long, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(50)
    Row(modifier.shadow(10.dp, shape, ambientColor = TS.Gold, spotColor = TS.Gold).clip(shape).background(glassWhite)
        .border(1.dp, Brush.linearGradient(listOf(Color.White, TS.Gold, Color.White)), shape).shimmerSweep(TS.Gold.copy(alpha = 0.40f))
        .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(Icons.Outlined.Timer, null, tint = Color.Black, modifier = Modifier.size(16.dp))
        Text("Sale", style = MaterialTheme.typography.labelSmall, color = Color.Black.copy(alpha = 0.75f))
        Text(formatCountdown(remainingMs), style = tabularNumbers, color = Color.Black)
    }
}

/** Prize-wheel badge for the home header: polished gold rim, burgundy and cream slices that turn slowly, a gold hub and a red pointer. */
@Composable
fun SpinWheelButton(onClick: () -> Unit) {
    val t = rememberInfiniteTransition(label = "spinicon")
    val deg by t.animateFloat(0f, 360f, infiniteRepeatable(tween(14000, easing = LinearEasing)), label = "deg")
    IconButton(onClick, Modifier.size(48.dp).semantics { contentDescription = "Spin and win a discount" }) {
        Canvas(Modifier.size(34.dp)) {
            val r = size.minDimension / 2f
            drawCircle(brush = Brush.sweepGradient(listOf(Color(0xFFF3DFA2), Color(0xFFB99A62), Color(0xFF8A6A32), Color(0xFFE8CC85), Color(0xFFF3DFA2))), radius = r)
            val inner = r * 0.80f
            rotate(deg) {
                for (i in 0 until 8) drawArc(color = if (i % 2 == 0) Color(0xFF7A1633) else Color(0xFFFAF1D6), startAngle = -90f + i * 45f, sweepAngle = 45f, useCenter = true,
                    topLeft = Offset(center.x - inner, center.y - inner), size = Size(inner * 2f, inner * 2f))
            }
            drawCircle(Color(0xFFB99A62), radius = r * 0.27f); drawCircle(Color(0xFF080808), radius = r * 0.11f)
            drawPath(Path().apply { moveTo(center.x - r * 0.15f, 0f); lineTo(center.x + r * 0.15f, 0f); lineTo(center.x, r * 0.32f); close() }, Color(0xFFD62839))
        }
    }
}

@Composable
private fun Wheel(percents: List<Int>, rotation: Float, modifier: Modifier = Modifier) {
    val paint = remember { android.graphics.Paint().apply { isAntiAlias = true; textAlign = android.graphics.Paint.Align.CENTER; typeface = android.graphics.Typeface.create(android.graphics.Typeface.SERIF, android.graphics.Typeface.BOLD) } }
    Canvas(modifier.graphicsLayer { rotationZ = rotation }) {
        val n = percents.size; val sweep = 360f / n; val d = size.minDimension
        for (i in 0 until n) drawArc(color = if (i % 2 == 0) TS.Gold else Color(0xFF242424), startAngle = -90f + i * sweep, sweepAngle = sweep, useCenter = true)
        drawCircle(TS.Gold, radius = d / 2f - 3.dp.toPx(), style = Stroke(width = 6.dp.toPx()))
        paint.textSize = d * 0.10f
        drawIntoCanvas { c ->
            val nc = c.nativeCanvas
            for (i in 0 until n) {
                nc.save(); nc.rotate((i + 0.5f) * sweep, center.x, center.y)       // turn so the slice's middle points up, then write its label near the rim
                paint.color = if (i % 2 == 0) android.graphics.Color.BLACK else android.graphics.Color.rgb(0xB9, 0x9A, 0x62)
                nc.drawText("${percents[i]}%", center.x, center.y - d * 0.31f, paint)
                nc.restore()
            }
        }
        drawCircle(TS.Black, radius = d * 0.07f); drawCircle(TS.Gold, radius = d * 0.07f, style = Stroke(width = 2.dp.toPx()))
    }
}

/** Spin & Win: one spin a day for a signed-in customer; the prize is a single-use discount code. */
@Composable
fun SpinWheelDialog(onDismiss: () -> Unit, onUseCode: (String) -> Unit) {
    val status = rememberLoad("spin-status") { Repo.spinStatus() }
    val scope = rememberCoroutineScope()
    val rotation = remember { Animatable(0f) }
    var spinning by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<SpinResult?>(null) }
    var spun by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var copied by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current

    Dialog(onDismissRequest = { if (!spinning) onDismiss() }) {
        Column(Modifier.clip(RoundedCornerShape(28.dp)).background(TS.Black).border(1.dp, TS.Gold.copy(alpha = 0.5f), RoundedCornerShape(28.dp)).padding(22.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("SPIN & WIN", fontFamily = DisplayFont, color = TS.Gold, letterSpacing = 3.sp, style = MaterialTheme.typography.titleLarge)
            when (val s = status.state) {
                is Load.Loading -> Box(Modifier.height(200.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = TS.Gold) }
                is Load.Error -> ErrorState(s.message, s.offline, status.retry)
                is Load.Ready -> {
                    val st = s.data
                    if (!st.active || st.percents.isEmpty()) {
                        Text("The lucky wheel is not running right now. Please check back soon!", color = Color.White.copy(0.8f), textAlign = TextAlign.Center, modifier = Modifier.padding(vertical = 24.dp))
                    } else {
                        Text("One spin a day. Every slice wins a discount coupon!", color = Color.White.copy(0.75f), style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
                        Box(Modifier.padding(top = 6.dp).size(260.dp), contentAlignment = Alignment.TopCenter) {
                            Wheel(st.percents, rotation.value, Modifier.align(Alignment.Center).padding(top = 10.dp).fillMaxSize())
                            Canvas(Modifier.size(width = 30.dp, height = 32.dp)) {
                                val p = Path().apply { moveTo(0f, 0f); lineTo(size.width, 0f); lineTo(size.width / 2f, size.height); close() }
                                drawPath(p, TS.Danger)
                            }
                        }
                        val won = result
                        if (won != null) {
                            Text("You won ${won.percent}% OFF!", fontFamily = DisplayFont, color = TS.Ivory, style = MaterialTheme.typography.headlineMedium)
                            Text(won.code, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold, letterSpacing = 2.sp), color = TS.Gold,
                                modifier = Modifier.clip(RoundedCornerShape(12.dp)).border(1.dp, TS.Gold, RoundedCornerShape(12.dp)).padding(horizontal = 18.dp, vertical = 10.dp))
                            Text("Single use, valid for 3 days. Enter it at checkout.", color = Color.White.copy(0.7f), style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center)
                            TsButton("Use it on my order", { onUseCode(won.code); onDismiss() })
                            TsButton(if (copied) "Copied" else "Copy code", { clipboard.setText(AnnotatedString(won.code)); copied = true }, style = TsButtonStyle.Outline)
                        } else {
                            error?.let { Text(it, color = TS.Danger, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium) }
                            val blocked = !st.canSpin && !spun
                            if (blocked) Text("You have already used today's spin. Come back tomorrow for another chance!", color = Color.White.copy(0.8f), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
                            TsButton(if (spinning) "Spinning..." else if (blocked) "Come back tomorrow" else "SPIN", enabled = !spinning && !blocked && error == null, onClick = {
                                scope.launch {
                                    spinning = true; error = null
                                    try {
                                        val r = Repo.spin(); spun = true
                                        val sweep = 360f / st.percents.size
                                        val jitter = (Random.nextFloat() - 0.5f) * sweep * 0.6f          // lands somewhere inside the winning slice, not always dead centre
                                        val now = rotation.value
                                        val extra = ((-(r.index + 0.5f) * sweep + jitter - now) % 360f + 360f) % 360f
                                        rotation.animateTo(now + 5 * 360f + extra, tween(4800, easing = FastOutSlowInEasing))
                                        delay(350); result = r
                                    } catch (e: ApiException) { error = e.message ?: "Could not spin. Please try again." }
                                    spinning = false
                                }
                            })
                        }
                    }
                }
            }
            TextButton(onDismiss, enabled = !spinning) { Text("Close", color = TS.Gray) }
        }
    }
}
