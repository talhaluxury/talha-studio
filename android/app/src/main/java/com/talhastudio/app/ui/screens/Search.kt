package com.talhastudio.app.ui.screens

import android.graphics.Bitmap
import com.talhastudio.app.ui.components.tr
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Collections
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.Filter
import com.talhastudio.app.data.LocalStore
import com.talhastudio.app.data.Product
import com.talhastudio.app.data.Repo
import com.talhastudio.app.ui.components.Load
import com.talhastudio.app.ui.components.ProductGridSkeleton
import com.talhastudio.app.ui.components.rememberLoad
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Search screen: type to see matching products and related ones live, or search with a photo (camera or gallery). */
@Composable
fun SearchScreen(shop: ShopViewModel, openCamera: Boolean, onBack: () -> Unit, onOpenProduct: (String) -> Unit) {
    val ctx = LocalContext.current
    val local = remember { LocalStore(ctx.applicationContext) }
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    val focus = remember { FocusRequester() }
    var typed by rememberSaveable { mutableStateOf("") }
    var recents by remember { mutableStateOf(local.recentSearches()) }
    var results by remember { mutableStateOf<List<Product>?>(null) }
    var related by remember { mutableStateOf<List<Product>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var photo by remember { mutableStateOf<Bitmap?>(null) }
    var photoResults by remember { mutableStateOf<List<Product>?>(null) }
    var chooser by remember { mutableStateOf(openCamera) }
    val trendingLoad = rememberLoad("search-trending") { Repo.products(Filter(), 1).items.take(8) }
    val trending = (trendingLoad.state as? Load.Ready)?.data.orEmpty()

    fun runPhoto(bmp: Bitmap) {
        photo = bmp; photoResults = null; error = null; busy = true; typed = ""; focusManager.clearFocus()
        scope.launch {
            try { photoResults = PhotoMatch.find(bmp) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { error = "Photo search could not run. Please check your connection and try again."; photoResults = emptyList() }
            busy = false
        }
    }
    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp -> if (bmp != null) runPhoto(bmp) }
    val pickPicture = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch { withContext(Dispatchers.IO) { decodeSampled(ctx, uri, 1024) }?.let { runPhoto(it) } }
    }

    // Live results while typing (short pause first so we do not call the server on every letter).
    LaunchedEffect(typed) {
        val q = typed.trim()
        if (q.length < 2) { results = null; related = emptyList(); busy = false; error = null; return@LaunchedEffect }
        photo = null; photoResults = null
        delay(300); busy = true; error = null
        try {
            val found = Repo.products(Filter(query = q), 1).items
            results = found
            related = found.firstOrNull()?.let { first -> runCatching { Repo.product(first.id).related }.getOrDefault(emptyList()).filter { r -> found.none { it.id == r.id } } }.orEmpty()
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { error = "Could not search. Please check your connection."; results = null }
        busy = false
    }
    LaunchedEffect(Unit) { if (!openCamera) runCatching { focus.requestFocus() } }

    fun open(id: String) { local.addRecentSearch(typed); onOpenProduct(id) }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
            OutlinedTextField(typed, { typed = it }, Modifier.weight(1f).focusRequester(focus), placeholder = { Text(tr("Search suits, fabrics, brands")) }, singleLine = true, shape = RoundedCornerShape(50),
                leadingIcon = { Icon(Icons.Outlined.Search, null, tint = TS.Gold) },
                trailingIcon = { if (typed.isNotEmpty()) IconButton({ typed = "" }) { Icon(Icons.Outlined.Close, "Clear search") } },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { local.addRecentSearch(typed); recents = local.recentSearches(); focusManager.clearFocus() }))
            Spacer(Modifier.width(6.dp))
            Box(Modifier.size(48.dp).clip(RoundedCornerShape(50)).background(TS.Gold).clickable { chooser = true }, contentAlignment = Alignment.Center) {
                Icon(Icons.Outlined.PhotoCamera, "Search with a photo", tint = TS.Black)
            }
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.fillMaxSize()) {
            val q = typed.trim()
            when {
                photo != null -> {
                    item {
                        Row(Modifier.padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            Image(photo!!.asImageBitmap(), "Your photo", Modifier.size(72.dp).clip(RoundedCornerShape(14.dp)).border(1.dp, TS.Gold.copy(alpha = 0.5f), RoundedCornerShape(14.dp)), contentScale = ContentScale.Crop)
                            Column(Modifier.weight(1f)) {
                                Text(tr("Similar to your photo"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                Text(if (busy) "Looking through the collection..." else "${photoResults?.size ?: 0} close matches", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
                            }
                            IconButton({ photo = null; photoResults = null; error = null }) { Icon(Icons.Outlined.Close, "Remove photo") }
                        }
                    }
                    if (busy) item { ProductGridSkeleton() }
                    else if (photoResults.isNullOrEmpty()) {
                        item { Message(error ?: "No close match found", if (error == null) "Try another photo, or search by name above." else "You can still search by typing.") }
                        titleAndGrid("You may also like", trending, shop, ::open)
                    } else titleAndGrid(null, photoResults.orEmpty(), shop, ::open)
                }
                q.length >= 2 -> when {
                    busy && results == null -> item { ProductGridSkeleton() }
                    error != null -> item { Message(error!!, "Pull back and try again in a moment.") }
                    results.isNullOrEmpty() -> {
                        item { Message("No products found for \"$q\"", "Check the spelling or use fewer words.") }
                        titleAndGrid("You may also like", trending, shop, ::open)
                    }
                    else -> {
                        titleAndGrid("${results!!.size} result${if (results!!.size == 1) "" else "s"}", results!!, shop, ::open)
                        titleAndGrid("Related products", related, shop, ::open)
                    }
                }
                else -> {
                    if (recents.isNotEmpty()) item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(Modifier.padding(horizontal = 20.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Text(tr("Recent searches"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                Text(tr("Clear"), color = TS.Gold, style = MaterialTheme.typography.labelLarge, modifier = Modifier.clickable { local.clearRecentSearches(); recents = emptyList() })
                            }
                            LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(recents) { r ->
                                    Text(r, style = MaterialTheme.typography.labelLarge, modifier = Modifier.clip(RoundedCornerShape(50)).border(1.dp, TS.Gold.copy(alpha = 0.5f), RoundedCornerShape(50)).clickable { typed = r }.padding(horizontal = 14.dp, vertical = 8.dp))
                                }
                            }
                        }
                    }
                    titleAndGrid("Popular right now", trending, shop, ::open)
                }
            }
        }
    }

    if (chooser) AlertDialog(
        onDismissRequest = { chooser = false },
        title = { Text(tr("Search with a photo")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(tr("Show us a dress, suit or fabric you like and we will find similar products."), style = MaterialTheme.typography.bodyMedium, color = TS.Gray)
                ChooserRow(Icons.Outlined.PhotoCamera, "Take a photo") { chooser = false; takePicture.launch(null) }
                ChooserRow(Icons.Outlined.Collections, "Choose from gallery") { chooser = false; pickPicture.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            }
        },
        confirmButton = {}, dismissButton = { TextButton({ chooser = false }) { Text(tr("Cancel")) } },
    )
}

private fun androidx.compose.foundation.lazy.LazyListScope.titleAndGrid(title: String?, list: List<Product>, shop: ShopViewModel, open: (String) -> Unit) {
    if (list.isEmpty()) return
    if (title != null) item { Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 20.dp)) }
    item { ProductGrid(shop, list, open) }
}

@Composable
private fun Message(title: String, body: String) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Text(body, style = MaterialTheme.typography.bodySmall, color = TS.Gray, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

@Composable
private fun ChooserRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).border(1.dp, TS.Gold.copy(alpha = 0.4f), RoundedCornerShape(14.dp)).clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(icon, null, tint = TS.Gold); Text(label, style = MaterialTheme.typography.titleSmall)
    }
}

/**
 * Photo search without any AI: the colours and layout of the customer's photo are compared with the product pictures
 * (their small thumbnails are read once per app run and remembered). Closest looks first.
 */
private object PhotoMatch {
    private const val GRID = 4
    private class Sig(val hue: FloatArray, val cells: FloatArray)
    private val cache = HashMap<String, Sig?>()

    private fun sig(src: Bitmap): Sig {
        val b = Bitmap.createScaledBitmap(src, 24, 24, true)
        val hue = FloatArray(16); val cells = FloatArray(GRID * GRID * 3); val count = IntArray(GRID * GRID)
        val hsv = FloatArray(3)
        for (y in 0 until 24) for (x in 0 until 24) {
            val c = b.getPixel(x, y); val r = (c shr 16) and 255; val g = (c shr 8) and 255; val bl = c and 255
            android.graphics.Color.RGBToHSV(r, g, bl, hsv)
            // 12 hue slots for coloured pixels, 4 slots (black..white) for grey ones
            val slot = if (hsv[1] < 0.18f || hsv[2] < 0.15f) 12 + (hsv[2] * 3.99f).toInt().coerceIn(0, 3) else ((hsv[0] / 30f).toInt() % 12)
            hue[slot] += 1f
            val cell = (y * GRID / 24) * GRID + (x * GRID / 24)
            cells[cell * 3] += r / 255f; cells[cell * 3 + 1] += g / 255f; cells[cell * 3 + 2] += bl / 255f; count[cell]++
        }
        val total = hue.sum().coerceAtLeast(1f); for (i in hue.indices) hue[i] /= total
        for (c in 0 until GRID * GRID) { val n = count[c].coerceAtLeast(1); for (k in 0..2) cells[c * 3 + k] /= n }
        if (b !== src) b.recycle()
        return Sig(hue, cells)
    }

    private fun score(a: Sig, b: Sig): Float {
        var inter = 0f; for (i in a.hue.indices) inter += minOf(a.hue[i], b.hue[i])
        var d = 0f; for (i in a.cells.indices) d += kotlin.math.abs(a.cells[i] - b.cells[i])
        return 0.6f * inter + 0.4f * (1f - d / a.cells.size)
    }

    private fun thumb(url: String): Bitmap? = runCatching {
        val c = java.net.URL(url).openConnection() as java.net.HttpURLConnection
        c.connectTimeout = 8000; c.readTimeout = 8000
        c.inputStream.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = 2 }) }
    }.getOrNull()

    suspend fun find(photo: Bitmap): List<Product> = withContext(Dispatchers.IO) {
        val mine = sig(photo)
        val catalog = buildList { for (page in 1..3) { val r = Repo.products(Filter(), page); addAll(r.items); if (!r.hasMore) break } }
        val gate = kotlinx.coroutines.sync.Semaphore(6)
        val scored = kotlinx.coroutines.coroutineScope {
            catalog.map { p ->
                async {
                    val url = p.images.firstOrNull()?.thumbUrl ?: return@async null
                    val s: Sig? = gate.withPermit {
                        val hit = synchronized(cache) { if (cache.containsKey(url)) cache[url] to true else null to false }
                        if (hit.second) hit.first else thumb(url)?.let { bm -> sig(bm).also { bm.recycle() } }.also { synchronized(cache) { cache[url] = it } }
                    }
                    s?.let { p to score(mine, it) }
                }
            }.awaitAll().filterNotNull()
        }
        scored.sortedByDescending { it.second }.filter { it.second >= 0.45f }.take(8).map { it.first }
    }
}

/** Reads a gallery picture at a reduced size so large photos never fill the phone's memory. */
private fun decodeSampled(ctx: android.content.Context, uri: Uri, maxSide: Int): Bitmap? = runCatching {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1; while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxSide * 2) sample *= 2
    ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
}.getOrNull()
