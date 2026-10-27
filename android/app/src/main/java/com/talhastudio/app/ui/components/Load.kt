package com.talhastudio.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.talhastudio.app.data.ApiException
import com.talhastudio.app.ui.theme.TS

sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Error(val message: String, val offline: Boolean) : Load<Nothing>
    data class Ready<T>(val data: T) : Load<T>
}

class Loader<T>(val state: Load<T>, val retry: () -> Unit)

/** Runs [block] whenever [key] changes or retry() is called; exposes Loading / Error / Ready for the UI. */
@Composable
fun <T> rememberLoad(key: Any?, block: suspend () -> T): Loader<T> {
    var attempt by remember { mutableIntStateOf(0) }
    var state by remember(key, attempt) { mutableStateOf<Load<T>>(Load.Loading) }
    LaunchedEffect(key, attempt) {
        state = try { Load.Ready(block()) } catch (e: ApiException) { Load.Error(e.message ?: "Something went wrong", e.offline) }
    }
    return Loader(state) { attempt++ }
}

@Composable
fun ErrorState(message: String, offline: Boolean, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(36.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(if (offline) "You're offline" else "Something went wrong", style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Text(message, style = MaterialTheme.typography.bodyMedium, color = TS.Gray, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp)); TsButton("Try again", onRetry, Modifier.widthIn(max = 260.dp))
    }
}

@Composable
fun SkeletonBox(modifier: Modifier = Modifier) {
    val a by androidx.compose.animation.core.rememberInfiniteTransition(label = "sk").animateFloat(
        0.45f, 0.9f, androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(800), androidx.compose.animation.core.RepeatMode.Reverse), label = "a")
    Box(modifier.clip(RoundedCornerShape(14.dp)).background(TS.Neutral.copy(alpha = a)))
}

@Composable
fun ProductGridSkeleton() {
    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        repeat(2) { Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) { repeat(2) { SkeletonBox(Modifier.weight(1f).aspectRatio(0.62f)) } } }
    }
}
