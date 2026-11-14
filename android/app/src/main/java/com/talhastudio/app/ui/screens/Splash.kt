package com.talhastudio.app.ui.screens

import androidx.compose.animation.core.*
import com.talhastudio.app.ui.components.tr
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.talhastudio.app.R
import com.talhastudio.app.ui.components.shimmerSweep
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.sin
import kotlin.random.Random

private val GoldLight = Color(0xFFE9CF98)
private val statusLines = listOf("Preparing your collection", "Dressing the showroom", "Almost ready")

/** Opening screen: warm dark background with a soft gold glow and drifting golden dust, the logo inside a slowly turning gold ring, then the name and a shimmering progress bar. */
@Composable
fun SplashScreen(onDone: () -> Unit) {
    val progress = remember { Animatable(0f) }
    val logoIn = remember { Animatable(0f) }
    val textIn = remember { Animatable(0f) }
    var line by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        logoIn.animateTo(1f, spring(dampingRatio = 0.6f, stiffness = 120f))
    }
    LaunchedEffect(Unit) { delay(450); textIn.animateTo(1f, tween(800, easing = FastOutSlowInEasing)) }
    LaunchedEffect(Unit) {
        progress.animateTo(1f, tween(2200, easing = FastOutSlowInEasing))
        delay(200)
        onDone()
    }
    LaunchedEffect(Unit) { while (true) { delay(800); line = (line + 1) % statusLines.size } }

    val t = rememberInfiniteTransition(label = "splash")
    val turn by t.animateFloat(0f, 360f, infiniteRepeatable(tween(5000, easing = LinearEasing)), label = "turn")
    val drift by t.animateFloat(0f, 1f, infiniteRepeatable(tween(9000, easing = LinearEasing)), label = "drift")
    val breathe by t.animateFloat(0.55f, 1f, infiniteRepeatable(tween(2000, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "breathe")
    val dust = remember { List(34) { Dust(Random(it * 97 + 13)) } }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF14100A), Color(0xFF080808), Color(0xFF110D07))))) {
        // Soft gold glow behind the logo and floating dust.
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(Brush.radialGradient(listOf(TS.Gold.copy(alpha = 0.26f * breathe), Color.Transparent), center = Offset(size.width / 2f, size.height * 0.38f), radius = size.width * 0.85f),
                radius = size.width * 0.85f, center = Offset(size.width / 2f, size.height * 0.38f))
            dust.forEach { d ->
                val y = ((d.y - drift * d.speed) % 1f + 1f) % 1f
                val x = d.x + sin((drift * 2f * PI.toFloat() * d.sway) + d.phase) * 0.02f
                val a = (sin((y + d.phase) * PI.toFloat()).coerceAtLeast(0f)) * d.alpha
                drawCircle(GoldLight.copy(alpha = a), radius = d.r * density, center = Offset(x * size.width, y * size.height))
            }
        }
        Column(Modifier.fillMaxSize().systemBarsPadding().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            // Logo on its ivory tile, inside a turning gold ring. The logo itself is shown unmodified.
            Box(Modifier.size(210.dp).graphicsLayer { scaleX = 0.7f + 0.3f * logoIn.value; scaleY = 0.7f + 0.3f * logoIn.value; alpha = logoIn.value.coerceIn(0f, 1f) }
                .drawBehind {
                    rotate(turn) { drawCircle(Brush.sweepGradient(listOf(Color.Transparent, GoldLight, TS.Gold, Color.Transparent, Color.Transparent)), radius = size.minDimension / 2f - 2.dp.toPx(), style = Stroke(width = 3.dp.toPx())) }
                    drawCircle(TS.Gold.copy(alpha = 0.18f), radius = size.minDimension / 2f - 2.dp.toPx(), style = Stroke(width = 1.dp.toPx()))
                }, contentAlignment = Alignment.Center) {
                Image(painterResource(R.drawable.talha_logo), "Talha Studio logo",
                    Modifier.size(158.dp).shadow(28.dp, RoundedCornerShape(34.dp), ambientColor = TS.Gold, spotColor = TS.Gold).clip(RoundedCornerShape(34.dp)))
            }
            Spacer(Modifier.height(30.dp))
            Column(Modifier.graphicsLayer { alpha = textIn.value; translationY = (1f - textIn.value) * 24.dp.toPx() }, horizontalAlignment = Alignment.CenterHorizontally) {
                Text("TALHA", fontFamily = DisplayFont, fontSize = 36.sp, fontWeight = FontWeight.Light, letterSpacing = (6 + 8 * textIn.value).sp, color = TS.Ivory)
                Text("S T U D I O", fontSize = 11.sp, letterSpacing = 6.sp, color = TS.Gold)
                Spacer(Modifier.height(14.dp))
                Box(Modifier.width(54.dp).height(1.dp).background(Brush.horizontalGradient(listOf(Color.Transparent, TS.Gold, Color.Transparent))))
                Spacer(Modifier.height(14.dp))
                Text("Timeless Fashion For Every You", style = MaterialTheme.typography.bodyMedium, color = TS.Ivory.copy(0.75f))
            }
            Spacer(Modifier.height(56.dp))
            // Progress bar: gold fill with a moving glint.
            Box(Modifier.fillMaxWidth(0.62f).height(4.dp).clip(RoundedCornerShape(2.dp)).background(TS.Ivory.copy(0.12f))) {
                Box(Modifier.fillMaxHeight().fillMaxWidth(progress.value).clip(RoundedCornerShape(2.dp)).background(Brush.horizontalGradient(listOf(TS.Gold, GoldLight, TS.Gold))).shimmerSweep(Color.White.copy(alpha = 0.8f), durationMs = 900, pauseMs = 200))
            }
            Spacer(Modifier.height(14.dp))
            Text(statusLines[line], style = MaterialTheme.typography.labelSmall, color = TS.Ivory.copy(0.6f), letterSpacing = 1.sp)
        }
        Text(tr("Elegance in every thread"), Modifier.align(Alignment.BottomCenter).systemBarsPadding().padding(bottom = 18.dp).alpha(0.45f), style = MaterialTheme.typography.labelSmall, color = TS.Gold, letterSpacing = 2.sp)
    }
}

private class Dust(g: Random) {
    val x = g.nextFloat(); val y = g.nextFloat(); val speed = 0.4f + g.nextFloat() * 0.9f
    val r = 0.8f + g.nextFloat() * 1.8f; val alpha = 0.25f + g.nextFloat() * 0.5f
    val sway = 1 + g.nextInt(3); val phase = g.nextFloat() * 6.28f
}
