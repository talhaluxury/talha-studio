package com.talhastudio.app.ui.screens

import androidx.compose.animation.core.*
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.talhastudio.app.R
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.delay

@Composable
fun SplashScreen(onDone: () -> Unit) {
    val progress = remember { Animatable(0f) }
    val fade = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        fade.animateTo(1f, tween(700))
        progress.animateTo(1f, tween(1400, easing = LinearEasing))
        delay(150)
        onDone()
    }
    Column(
        Modifier.fillMaxSize().background(TS.Black).systemBarsPadding().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Column(Modifier.alpha(fade.value), horizontalAlignment = Alignment.CenterHorizontally) {
            // Official logo, shown unmodified (no recolor/crop/stretch) on its own ivory tile.
            Image(painterResource(R.drawable.talha_logo), "Talha Studio logo",
                Modifier.size(168.dp).clip(RoundedCornerShape(32.dp)))
            Spacer(Modifier.height(24.dp))
            Text("TALHA", fontFamily = DisplayFont, fontSize = 34.sp, fontWeight = FontWeight.Light, letterSpacing = 12.sp, color = TS.Ivory)
            Text("S T U D I O", fontSize = 11.sp, letterSpacing = 6.sp, color = TS.Gold)
            Spacer(Modifier.height(20.dp))
            Text("Timeless Fashion For Every You", style = MaterialTheme.typography.bodyMedium, color = TS.Ivory.copy(0.7f))
        }
        Spacer(Modifier.height(64.dp))
        LinearProgressIndicator(progress = { progress.value }, modifier = Modifier.fillMaxWidth(0.6f).height(3.dp).clip(RoundedCornerShape(2.dp)),
            color = TS.Gold, trackColor = TS.Ivory.copy(0.15f))
        Spacer(Modifier.height(10.dp))
        Text("Loading...", style = MaterialTheme.typography.labelSmall, color = TS.Ivory.copy(0.6f))
    }
}
