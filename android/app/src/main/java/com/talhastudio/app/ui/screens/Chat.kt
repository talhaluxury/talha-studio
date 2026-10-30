package com.talhastudio.app.ui.screens

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import coil.compose.AsyncImage
import com.talhastudio.app.R
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.ApiException
import com.talhastudio.app.data.ChatMessage
import com.talhastudio.app.data.Repo
import com.talhastudio.app.data.StatusItem
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val Ink = Color(0xFF0B0B0C)
private val CardBg = Color(0xFF17171A)
private val CardLine = Color(0xFF2A2A2E)
private val GoldBrush = Brush.linearGradient(listOf(Color(0xFFE6C98F), TS.Gold))
private val Warn = Color(0xFFFFB4AB)

/**
 * "Updates" screen: the store's daily status pictures on top and the chat with Talha Studio below.
 * New messages arrive by polling every 3 s while the screen is open, and by a phone notification when it is not.
 */
@Composable
fun ChatScreen(shop: ShopViewModel, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val messages = remember { mutableStateListOf<ChatMessage>() }
    var statuses by remember { mutableStateOf<List<StatusItem>>(emptyList()) }
    var seen by remember { mutableStateOf(shop.seenStatuses()) }
    var loading by remember { mutableStateOf(true) }
    var offline by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var input by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var viewer by remember { mutableStateOf<Pair<List<StatusItem>, Int>?>(null) }
    var liveFrom by remember { mutableLongStateOf(Long.MAX_VALUE) }       // only messages newer than this pop in with an animation
    val listState = rememberLazyListState()

    fun addAll(items: List<ChatMessage>) {
        items.forEach { m -> if (messages.none { it.seq == m.seq }) messages.add(m) }
        messages.sortBy { it.seq }
    }

    LaunchedEffect(Unit) {
        try {
            addAll(Repo.chat(null)); liveFrom = messages.lastOrNull()?.seq ?: 0L; loading = false
            statuses = runCatching { Repo.statuses() }.getOrDefault(emptyList())
            if (messages.any { it.fromStore }) runCatching { Repo.chatMarkRead() }
            shop.clearChatBadge(); shop.refreshUpdates()
        } catch (e: ApiException) { loading = false; offline = e.offline; error = if (e.offline) null else e.message }
    }

    val owner = LocalLifecycleOwner.current
    LaunchedEffect(owner) {
        owner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            var round = 0
            while (true) {
                delay(3000); round++
                try {
                    val fresh = Repo.chat(messages.lastOrNull()?.seq)
                    offline = false
                    if (loading) { loading = false; liveFrom = fresh.lastOrNull()?.seq ?: 0L }
                    if (fresh.isNotEmpty()) {
                        addAll(fresh)
                        if (fresh.any { it.fromStore }) { runCatching { Repo.chatMarkRead() }; shop.clearChatBadge() }
                    }
                    if (round % 5 == 0) runCatching { Repo.statuses() }.onSuccess { statuses = it }
                } catch (e: ApiException) { offline = e.offline }
            }
        }
    }
    LaunchedEffect(messages.size) { if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex) }

    fun send() {
        val t = input.trim(); if (t.isEmpty() || sending) return
        sending = true; error = null
        scope.launch {
            try { addAll(listOf(Repo.sendChat(t))); input = "" } catch (e: ApiException) { error = e.message } finally { sending = false }
        }
    }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            sending = true; error = null
            try {
                val bytes = withContext(Dispatchers.IO) { readPhoto(ctx, uri) } ?: throw ApiException(false, "Could not read that picture")
                addAll(listOf(Repo.sendChatImage(bytes)))
            } catch (e: ApiException) { error = e.message } finally { sending = false }
        }
    }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF17130C), Ink)))) {
        Column(Modifier.fillMaxSize().systemBarsPadding().imePadding()) {
            ChatTopBar(onBack, offline)
            if (statuses.isNotEmpty()) StatusStrip(statuses, seen) { s ->
                val oldestFirst = statuses.reversed()          // plays like a story: oldest to newest
                viewer = oldestFirst to oldestFirst.indexOfFirst { it.id == s.id }.coerceAtLeast(0)
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    loading -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = TS.Gold)
                    messages.isEmpty() -> Column(Modifier.align(Alignment.Center).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Say hello", fontFamily = DisplayFont, style = MaterialTheme.typography.headlineMedium, color = TS.Ivory)
                        Spacer(Modifier.height(6.dp))
                        Text("Ask about fabrics, sizes, prices or your order. We reply right here.", color = TS.Ivory.copy(0.6f), textAlign = TextAlign.Center)
                    }
                    else -> LazyColumn(state = listState, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(messages, key = { it.seq }) { m -> MessageBubble(m, animate = m.seq > liveFrom) }
                    }
                }
            }
            error?.let { Text(it, color = Warn, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) }
            Composer(input, { input = it.take(2000) }, sending, onSend = { send() },
                onPhoto = { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) })
        }
        viewer?.let { (list, start) ->
            StatusViewer(list, start, onSeen = { id ->
                shop.markStatusSeen(id); seen = shop.seenStatuses()
                scope.launch { runCatching { Repo.viewStatus(id) } }
            }, onClose = { viewer = null })
        }
    }
}

/** Phone photos are normally under the server's 8 MB limit and are sent untouched (the server rotates and resizes them); only huge ones are shrunk. */
private fun readPhoto(ctx: Context, uri: Uri): ByteArray? {
    val raw = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
    if (raw.size <= 7_000_000) return raw
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(raw, 0, raw.size, bounds)
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 3000) sample *= 2
    val bmp = BitmapFactory.decodeByteArray(raw, 0, raw.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
    return java.io.ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, 85, it) }.toByteArray()
}

@Composable
private fun ChatTopBar(onBack: () -> Unit, offline: Boolean) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back", tint = TS.Ivory) }
        Image(painterResource(R.drawable.talha_logo), "Talha Studio", Modifier.size(42.dp)
            .shadow(10.dp, RoundedCornerShape(12.dp), ambientColor = TS.Gold, spotColor = TS.Gold).clip(RoundedCornerShape(12.dp)))
        Column(Modifier.padding(start = 12.dp)) {
            Text("Talha Studio", style = MaterialTheme.typography.titleMedium, color = TS.Ivory)
            Text(if (offline) "Reconnecting..." else "Official store · we reply here", style = MaterialTheme.typography.labelSmall, color = if (offline) Warn else TS.Gold)
        }
    }
}

@Composable
private fun StatusStrip(items: List<StatusItem>, seen: Set<String>, onOpen: (StatusItem) -> Unit) {
    Column(Modifier.padding(top = 4.dp)) {
        Text("STATUS", style = MaterialTheme.typography.labelSmall, color = TS.Gold, letterSpacing = 3.sp, modifier = Modifier.padding(horizontal = 20.dp))
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            itemsIndexed(items, key = { _, s -> s.id }) { i, s -> StatusCard(s, i, unseen = s.id !in seen) { onOpen(s) } }
        }
    }
}

/** A small picture card that gently turns in 3D. A gold ring means you have not watched it yet. */
@Composable
private fun StatusCard(s: StatusItem, index: Int, unseen: Boolean, onClick: () -> Unit) {
    val t = rememberInfiniteTransition(label = "float")
    val tilt by t.animateFloat(-7f, 7f, infiniteRepeatable(tween(3200 + index * 450, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "tilt")
    val shape = RoundedCornerShape(22.dp)
    val glow = if (unseen) TS.Gold else Color.Black
    Box(
        Modifier.size(92.dp, 132.dp).graphicsLayer { cameraDistance = 16f * density; rotationY = tilt }
            .shadow(14.dp, shape, ambientColor = glow, spotColor = glow).clip(shape)
            .border(2.dp, if (unseen) GoldBrush else SolidColor(Color(0xFF3A3A3E)), shape).clickable(onClick = onClick),
    ) {
        AsyncImage(s.imageUrl, s.caption, Modifier.fillMaxSize().background(CardBg), contentScale = ContentScale.Crop)
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.5f to Color.Transparent, 1f to Color.Black.copy(0.75f))))
        Text(s.caption ?: "Talha Studio", color = TS.Ivory, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.align(Alignment.BottomStart).padding(8.dp))
    }
}

@Composable
private fun StatusViewer(items: List<StatusItem>, start: Int, onSeen: (String) -> Unit, onClose: () -> Unit) {
    var index by remember { mutableIntStateOf(start.coerceIn(0, items.lastIndex)) }
    val progress = remember { Animatable(0f) }
    LaunchedEffect(index) {
        onSeen(items[index].id)
        progress.snapTo(0f)
        progress.animateTo(1f, tween(5000, easing = LinearEasing))
        if (index < items.lastIndex) index++ else onClose()
    }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        val s = items[index]
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AsyncImage(s.imageUrl, s.caption, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
            Row(Modifier.fillMaxSize()) {       // tap the left third to go back, the rest to go forward
                Box(Modifier.weight(1f).fillMaxHeight().clickable(remember { MutableInteractionSource() }, null) { if (index > 0) index-- })
                Box(Modifier.weight(2f).fillMaxHeight().clickable(remember { MutableInteractionSource() }, null) { if (index < items.lastIndex) index++ else onClose() })
            }
            Column(Modifier.align(Alignment.TopCenter).fillMaxWidth().background(Brush.verticalGradient(listOf(Color.Black.copy(0.6f), Color.Transparent))).systemBarsPadding().padding(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    items.forEachIndexed { i, _ ->
                        LinearProgressIndicator(progress = { when { i < index -> 1f; i == index -> progress.value; else -> 0f } },
                            modifier = Modifier.weight(1f).height(3.dp).clip(RoundedCornerShape(2.dp)), color = TS.Gold, trackColor = Color.White.copy(0.3f))
                    }
                }
                Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Image(painterResource(R.drawable.talha_logo), null, Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)))
                    Column(Modifier.padding(start = 10.dp).weight(1f)) {
                        Text("Talha Studio", color = TS.Ivory, style = MaterialTheme.typography.titleMedium)
                        Text(prettyDate(s.createdAt), color = TS.Ivory.copy(0.7f), style = MaterialTheme.typography.labelSmall)
                    }
                    IconButton(onClose) { Icon(Icons.Outlined.Close, "Close", tint = TS.Ivory) }
                }
            }
            s.caption?.let {
                Text(it, color = TS.Ivory, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center,
                    modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(0.75f)))).navigationBarsPadding().padding(24.dp))
            }
        }
    }
}

/** Slight 3D pop when a new message arrives: it tips up from the bottom edge and springs into place. */
@Composable
private fun Pop(fromRight: Boolean, content: @Composable () -> Unit) {
    val a = remember { Animatable(0f) }
    LaunchedEffect(Unit) { a.animateTo(1f, spring(dampingRatio = 0.65f, stiffness = 320f)) }
    Box(Modifier.graphicsLayer {
        val p = a.value
        alpha = p.coerceIn(0f, 1f); scaleX = 0.9f + 0.1f * p; scaleY = 0.9f + 0.1f * p
        rotationX = (1f - p) * 16f; cameraDistance = 14f * density; transformOrigin = TransformOrigin(if (fromRight) 1f else 0f, 1f)
    }) { content() }
}

@Composable
private fun MessageBubble(m: ChatMessage, animate: Boolean) {
    val mine = !m.fromStore
    val shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomStart = if (mine) 20.dp else 4.dp, bottomEnd = if (mine) 4.dp else 20.dp)
    val glow = if (mine) TS.Gold else Color.Black
    val bubble: @Composable () -> Unit = {
        Column(
            Modifier.widthIn(max = 290.dp).shadow(if (mine) 10.dp else 4.dp, shape, ambientColor = glow, spotColor = glow).clip(shape)
                .background(if (mine) GoldBrush else SolidColor(CardBg)).then(if (mine) Modifier else Modifier.border(0.8.dp, CardLine, shape))
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            if (m.imageUrl != null) {
                AsyncImage(m.imageUrl, "Picture", Modifier.defaultMinSize(160.dp, 160.dp).sizeIn(maxWidth = 240.dp, maxHeight = 320.dp).clip(RoundedCornerShape(14.dp)), contentScale = ContentScale.Fit)
                Spacer(Modifier.height(4.dp))
            }
            if (m.body.isNotBlank()) Text(m.body, color = if (mine) TS.Black else TS.Ivory, style = MaterialTheme.typography.bodyLarge)
            Text(chatTime(m.createdAt), color = (if (mine) TS.Black else TS.Ivory).copy(0.55f), style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.End).padding(top = 2.dp))
        }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
        if (animate) Pop(fromRight = mine, content = bubble) else bubble()
    }
}

private fun chatTime(iso: String) = runCatching {
    java.time.OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("h:mm a"))
}.getOrDefault("")

@Composable
private fun Composer(value: String, onChange: (String) -> Unit, sending: Boolean, onSend: () -> Unit, onPhoto: () -> Unit) {
    val pill = RoundedCornerShape(26.dp)
    Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.Bottom) {
        Row(Modifier.weight(1f).shadow(10.dp, pill, ambientColor = Color.Black).clip(pill).background(CardBg).border(0.8.dp, CardLine, pill).padding(start = 4.dp, end = 14.dp),
            verticalAlignment = Alignment.CenterVertically) {
            IconButton(onPhoto, enabled = !sending) { Icon(Icons.Outlined.Image, "Send a picture", tint = TS.Gold) }
            BasicTextField(value, onChange, Modifier.weight(1f).padding(vertical = 14.dp), textStyle = TextStyle(color = TS.Ivory, fontSize = 16.sp), cursorBrush = SolidColor(TS.Gold),
                maxLines = 5, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                decorationBox = { inner -> Box { if (value.isEmpty()) Text("Message", color = TS.Ivory.copy(0.4f), fontSize = 16.sp); inner() } })
        }
        Spacer(Modifier.width(8.dp))
        val canSend = value.isNotBlank() && !sending
        Box(Modifier.size(52.dp).shadow(12.dp, CircleShape, ambientColor = TS.Gold, spotColor = TS.Gold).clip(CircleShape)
            .background(if (canSend) GoldBrush else SolidColor(CardLine)).clickable(enabled = canSend, onClick = onSend), contentAlignment = Alignment.Center) {
            if (sending) CircularProgressIndicator(Modifier.size(22.dp), color = TS.Black, strokeWidth = 2.dp)
            else Icon(Icons.AutoMirrored.Outlined.Send, "Send", tint = if (canSend) TS.Black else TS.Gray)
        }
    }
}
