package com.talhastudio.app.ui.screens

import androidx.compose.animation.core.*
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.ui.draw.drawBehind
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.talhastudio.app.R
import com.talhastudio.app.data.ApiException
import com.talhastudio.app.data.AssistantAction
import com.talhastudio.app.data.Repo
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private val Ink = Color(0xFF0B0B0C)
private val CardBg = Color(0xFF17171A)
private val CardLine = Color(0xFF2A2A2E)
private val GoldBrush = Brush.linearGradient(listOf(Color(0xFFE6C98F), TS.Gold))
private val OrbSize = 64.dp

private class Turn(val fromUser: Boolean, val text: String, val actions: List<AssistantAction> = emptyList())

private val suggestions = listOf("What's new?", "Delivery and returns", "Where is my order?", "Help me choose a suit")

private val greetings = listOf(
    "Assalam o Alaikum! Main Talha AI Assistant hun. Main aap ki kya madad kar sakti hun?",
    "Size, fabric ya delivery ke baare mein kuch poochna hai? Main yahin hun.",
    "Order ka status jaanna hai? Mujh se poochein!",
    "Suit chunne mein madad chahiye? Bataiye, aap ke liye behtareen options dhoondti hun.",
)

/** Small gold "AI" pill: tells the customer at a glance that this icon is an AI assistant. */
@Composable
private fun AiChip(modifier: Modifier = Modifier) {
    Text("AI", modifier.clip(RoundedCornerShape(50)).background(GoldBrush).padding(horizontal = 7.dp, vertical = 1.dp),
        color = TS.Black, fontSize = 10.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, letterSpacing = 1.sp)
}

/**
 * Floating AI assistant: a glowing orb that can be dragged to any spot on the screen. Tap it to ask about products, sizes,
 * delivery or your orders. It is not shown at all when the server has no assistant switched on.
 */
@Composable
fun AssistantOverlay(visible: Boolean, onAction: (AssistantAction) -> Unit) {
    var enabled by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { enabled = Repo.assistantEnabled() }
    var open by remember { mutableStateOf(false) }
    val turns = remember { mutableStateListOf<Turn>() }          // kept here so the conversation survives closing the panel
    if (!enabled || !visible) return

    // The assistant "speaks": a few seconds after a screen opens (and now and then afterwards) a bubble types out a greeting next to the orb.
    var bubble by remember { mutableStateOf<String?>(null) }
    var lastBubble by remember { mutableStateOf("") }          // keeps the words on screen while the bubble fades out
    LaunchedEffect(bubble) { bubble?.let { lastBubble = it } }
    LaunchedEffect(enabled, visible, open) {
        if (!enabled || !visible || open) { bubble = null; return@LaunchedEffect }
        kotlinx.coroutines.delay(2500)
        var round = 0
        while (round < 6) {
            val msg = greetings[round % greetings.size]
            for (n in 1..msg.length) { bubble = msg.take(n); kotlinx.coroutines.delay(28) }      // typewriter
            kotlinx.coroutines.delay(5500); bubble = null
            round++; kotlinx.coroutines.delay(24_000)
        }
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val density = LocalDensity.current
        val orbPx = with(density) { OrbSize.toPx() }
        val maxX = with(density) { maxWidth.toPx() } - orbPx
        val maxY = with(density) { maxHeight.toPx() } - orbPx
        var pos by remember(maxX, maxY) { mutableStateOf(Offset(maxX - with(density) { 14.dp.toPx() }, maxY * 0.7f)) }

        val t = rememberInfiniteTransition(label = "orb")
        val tilt by t.animateFloat(-14f, 14f, infiniteRepeatable(tween(3600, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "tilt")
        val pulse by t.animateFloat(1f, 1.07f, infiniteRepeatable(tween(1800, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "pulse")
        val ring by t.animateFloat(0f, 1f, infiniteRepeatable(tween(2400, easing = LinearEasing), RepeatMode.Restart), label = "ring")

        // Speech bubble: sits on the side of the orb that has room, and a tap on it opens the assistant.
        val bubbleW = 214.dp
        val bubbleWPx = with(density) { bubbleW.toPx() }
        val gap = with(density) { 10.dp.toPx() }
        val onLeft = pos.x > maxX / 2f
        val bx = (if (onLeft) pos.x - bubbleWPx - gap else pos.x + orbPx + gap).coerceIn(with(density) { 8.dp.toPx() }, (maxX + orbPx - bubbleWPx - with(density) { 8.dp.toPx() }).coerceAtLeast(0f))
        val by = (pos.y - with(density) { 6.dp.toPx() }).coerceAtLeast(with(density) { 8.dp.toPx() })
        AnimatedVisibility(bubble != null, Modifier.offset { IntOffset(bx.roundToInt(), by.roundToInt()) }, enter = fadeIn() + scaleIn(initialScale = 0.85f), exit = fadeOut() + scaleOut(targetScale = 0.9f)) {
            val shape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = if (onLeft) 18.dp else 4.dp, bottomEnd = if (onLeft) 4.dp else 18.dp)
            Column(Modifier.width(bubbleW).shadow(14.dp, shape, ambientColor = TS.Gold, spotColor = TS.Gold).clip(shape).background(Ink.copy(alpha = 0.96f)).border(1.dp, GoldBrush, shape)
                .clickable { open = true }.padding(horizontal = 14.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    AiChip()
                    Text("Talha AI Assistant", style = MaterialTheme.typography.labelSmall, color = TS.Gold)
                }
                Text(bubble ?: lastBubble, style = MaterialTheme.typography.bodyMedium, color = TS.Ivory)
            }
        }

        Box(
            Modifier.offset { IntOffset(pos.x.roundToInt(), pos.y.roundToInt()) }.size(OrbSize)
                .drawBehind {                                                                  // two soft rings spread out from the orb so it reads as "alive"
                    for (k in 0..1) {
                        val f = (ring + k * 0.5f) % 1f
                        drawCircle(TS.Gold.copy(alpha = (1f - f) * 0.45f), radius = size.minDimension / 2f * (1f + f * 0.75f), style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2.dp.toPx()))
                    }
                }
                .pointerInput(Unit) { detectTapGestures(onTap = { open = true }) }
                .pointerInput(maxX, maxY) {
                    detectDragGestures { change, drag ->
                        change.consume()
                        pos = Offset((pos.x + drag.x).coerceIn(0f, maxX), (pos.y + drag.y).coerceIn(0f, maxY))
                    }
                },
        ) {
            Image(painterResource(R.drawable.assistant_orb), "Talha AI Assistant. Tap to ask a question.",
                Modifier.fillMaxSize().graphicsLayer { cameraDistance = 14f * density.density; rotationY = tilt; scaleX = pulse; scaleY = pulse }
                    .shadow(20.dp, CircleShape, ambientColor = TS.Gold, spotColor = TS.Gold).clip(CircleShape), contentScale = ContentScale.Crop)
            AiChip(Modifier.align(Alignment.BottomCenter).offset(y = 8.dp))                    // the label that tells customers this is the AI
        }
    }

    if (open) AssistantSheet(turns, onClose = { open = false }, onAction = { open = false; onAction(it) })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AssistantSheet(turns: androidx.compose.runtime.snapshots.SnapshotStateList<Turn>, onClose: () -> Unit, onAction: (AssistantAction) -> Unit) {
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    var input by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun ask(text: String) {
        val q = text.trim(); if (q.isEmpty() || busy) return
        turns.add(Turn(true, q)); input = ""; busy = true; error = null
        scope.launch {
            try {
                val r = Repo.assistant(turns.takeLast(10).map { (if (it.fromUser) "user" else "assistant") to it.text })
                turns.add(Turn(false, r.text, r.actions))
            } catch (e: ApiException) { error = e.message } finally { busy = false }
        }
    }
    LaunchedEffect(turns.size, busy) { if (turns.isNotEmpty()) listState.animateScrollToItem(turns.size) }   // +1 = the typing row

    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Ink, contentColor = TS.Ivory, dragHandle = {}) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.9f).imePadding().navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(R.drawable.assistant_orb), null, Modifier.size(46.dp).shadow(12.dp, CircleShape, ambientColor = TS.Gold, spotColor = TS.Gold).clip(CircleShape), contentScale = ContentScale.Crop)
                Column(Modifier.padding(start = 12.dp).weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { Text("Talha Assistant", fontFamily = DisplayFont, style = MaterialTheme.typography.titleLarge, color = TS.Ivory); AiChip() }
                    Text("Ask about fabrics, sizes, delivery or your order", style = MaterialTheme.typography.labelSmall, color = TS.Gold)
                }
                TextButton(onClose) { Text("Close", color = TS.Ivory.copy(0.7f)) }
            }
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = listState, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { Bubble(Turn(false, "Assalam o Alaikum! Main Talha AI Assistant hun. Main aap ki kya madad kar sakti hun? Aap English, Urdu ya Roman Urdu mein poochh sakte hain."), onAction) }
                if (turns.isEmpty()) item {
                    Column(Modifier.horizontalScroll(rememberScrollState()).padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { suggestions.forEach { s -> Chip(s) { ask(s) } } }
                    }
                }
                items(turns) { Bubble(it, onAction) }
                if (busy) item { TypingDots() }
            }
            error?.let { Text(it, color = Color(0xFFFFB4AB), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) }
            val pill = RoundedCornerShape(26.dp)
            Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.Bottom) {
                Box(Modifier.weight(1f).clip(pill).background(CardBg).border(0.8.dp, CardLine, pill).padding(horizontal = 18.dp, vertical = 14.dp)) {
                    BasicTextField(input, { input = it.take(1000) }, Modifier.fillMaxWidth(), textStyle = TextStyle(color = TS.Ivory, fontSize = 16.sp), cursorBrush = SolidColor(TS.Gold), maxLines = 4,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                        decorationBox = { inner -> Box { if (input.isEmpty()) Text("Ask the assistant...", color = TS.Ivory.copy(0.4f), fontSize = 16.sp); inner() } })
                }
                Spacer(Modifier.width(8.dp))
                val can = input.isNotBlank() && !busy
                Box(Modifier.size(52.dp).shadow(12.dp, CircleShape, ambientColor = TS.Gold, spotColor = TS.Gold).clip(CircleShape)
                    .background(if (can) GoldBrush else SolidColor(CardLine)).clickable(enabled = can) { ask(input) }, contentAlignment = Alignment.Center) {
                    androidx.compose.material3.Icon(Icons.AutoMirrored.Outlined.Send, "Send", tint = if (can) TS.Black else TS.Gray)
                }
            }
        }
    }
}

@Composable
private fun Chip(label: String, onClick: () -> Unit) {
    Box(Modifier.clip(RoundedCornerShape(50)).border(1.dp, TS.Gold.copy(0.7f), RoundedCornerShape(50)).clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 9.dp)) {
        Text(label, color = TS.Gold, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun Bubble(t: Turn, onAction: (AssistantAction) -> Unit) {
    val mine = t.fromUser
    val shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomStart = if (mine) 20.dp else 4.dp, bottomEnd = if (mine) 4.dp else 20.dp)
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
        Text(t.text, color = if (mine) TS.Black else TS.Ivory, style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.widthIn(max = 310.dp).clip(shape).background(if (mine) GoldBrush else SolidColor(CardBg)).then(if (mine) Modifier else Modifier.border(0.8.dp, CardLine, shape)).padding(horizontal = 14.dp, vertical = 10.dp))
        if (t.actions.isNotEmpty()) Row(Modifier.padding(top = 8.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            t.actions.forEach { a -> Chip(if (a.type == "product") "View: ${a.label.take(24)}" else a.label) { onAction(a) } }
        }
    }
}

@Composable
private fun TypingDots() {
    val t = rememberInfiniteTransition(label = "typing")
    Row(Modifier.clip(RoundedCornerShape(20.dp)).background(CardBg).padding(horizontal = 16.dp, vertical = 14.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        repeat(3) { i ->
            val a by t.animateFloat(0.25f, 1f, infiniteRepeatable(tween(600, delayMillis = i * 160), RepeatMode.Reverse), label = "dot$i")
            Box(Modifier.size(8.dp).alpha(a).clip(CircleShape).background(TS.Gold))
        }
    }
}
