package com.talhastudio.app.ui.screens

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.talhastudio.app.data.*
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val MAX_VIDEO_BYTES = 25L * 1024 * 1024
private val SECTION_NAMES = linkedMapOf(
    "banner" to "Banner slider", "video" to "Video", "text" to "Text", "products" to "Products", "gallery" to "Photo gallery", "features" to "Highlights", "spacer" to "Space",
)

/** Reads a chosen video, refusing anything over the server's size limit before it is loaded into memory. */
private fun readVideo(ctx: Context, uri: Uri): ByteArray {
    val size = ctx.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { if (it.moveToFirst()) it.getLong(0) else -1L } ?: -1L
    if (size > MAX_VIDEO_BYTES) throw ApiException(false, "That video is larger than 25 MB. Keep it under 30 seconds or compress it.")
    val bytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: throw ApiException(false, "Could not read that video")
    if (bytes.size > MAX_VIDEO_BYTES) throw ApiException(false, "That video is larger than 25 MB. Keep it under 30 seconds or compress it.")
    return bytes
}

/** What is wrong with a section that would stop the page from saving, in words the seller understands. */
private fun problemWith(s: SSection): String? = when (s.type) {
    "banner" -> if (s.slides.isEmpty()) "Banner slider needs at least one picture" else null
    "video" -> if (s.video == null) "Choose a video for the Video section" else null
    "gallery" -> if (s.images.isEmpty()) "Photo gallery needs at least one picture" else null
    "features" -> if (s.items.none { it.isNotBlank() }) "Highlights needs at least one point" else null
    else -> null
}

/**
 * The seller's page builder. Header: logo, cover, name, tagline, links. Below that an ordered list of sections (banner slider, video, text,
 * products, gallery, highlights, space) that can be added, reordered, hidden and deleted. There are no colour options: the page follows the app theme.
 * Text stays in local state until "Save draft"; pictures and videos are uploaded straight away and kept once a saved page uses them.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SellerPageTab(brand: SellerBrand, products: List<SellerProduct>, onBrand: (SellerBrand) -> Unit, onPreview: () -> Unit, say: (String) -> Unit) {
    val d = brand.draft
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    // Local state is keyed by the brand, so refreshing the brand after a logo upload never wipes what is being typed.
    var name by remember(brand.id) { mutableStateOf(d.name) }
    var tagline by remember(brand.id) { mutableStateOf(d.tagline) }
    var instagram by remember(brand.id) { mutableStateOf(d.instagram.orEmpty()) }
    var website by remember(brand.id) { mutableStateOf(d.website.orEmpty()) }
    val sections = remember(brand.id) { mutableStateListOf<SSection>().apply { addAll(d.sections) } }
    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var busy by remember { mutableStateOf(false) }
    var uploading by remember { mutableStateOf<String?>(null) }

    fun cleaned(s: SSection) = when (s.type) {
        "features" -> s.copy(items = s.items.map { it.trim() }.filter { it.isNotEmpty() })
        else -> s.copy(title = s.title.trim(), body = s.body.trim())
    }
    fun content() = d.copy(name = name.trim(), tagline = tagline.trim(), instagram = instagram.trim().ifEmpty { null }, website = website.trim().ifEmpty { null }, sections = sections.map(::cleaned))
    fun upload(kind: String, uri: Uri) {
        scope.launch {
            uploading = kind
            try {
                val bytes = withContext(Dispatchers.IO) { readPhoto(ctx, uri) } ?: throw ApiException(false, "Could not read that picture")
                Repo.sellerUploadBrandImage(kind, bytes); Repo.sellerMe()?.let(onBrand); say(if (kind == "logo") "Logo updated" else "Cover updated")
            } catch (e: ApiException) { say(e.pretty()) } finally { uploading = null }
        }
    }
    val pickLogo = rememberPhotoPicker { upload("logo", it) }
    val pickCover = rememberPhotoPicker { upload("cover", it) }
    suspend fun save(): SellerBrand? {
        sections.firstNotNullOfOrNull { problemWith(it) }?.let { say(it); return null }
        return try { Repo.sellerSaveBrand(content()).also { onBrand(it); errors = emptyMap() } }
        catch (e: ApiException) { errors = e.fields; say(e.pretty()); null }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        val (title, text, ok) = when (brand.pageStatus) {
            "submitted" -> Triple("Waiting for review", "We are reviewing your page and products. They go live as soon as they are approved.", false)
            "approved" -> Triple("Your page is live", "Customers can see the approved version. Changes you save below stay private until you send them for review again.", true)
            "rejected" -> Triple("Changes needed", brand.pageNote ?: "Please update your page and send it again.", false)
            else -> Triple("Not sent for review yet", "Add your logo, build your page and add products, then send it for review. Customers see it only after we approve it.", false)
        }
        Panel {
            Text(title, style = MaterialTheme.typography.titleMedium, fontFamily = DisplayFont, color = if (ok) TS.Success else if (brand.pageStatus == "rejected") TS.Danger else MaterialTheme.colorScheme.onSurface)
            Text(text, style = MaterialTheme.typography.bodyMedium, color = TS.Gray)
        }

        Text("Brand", style = MaterialTheme.typography.titleMedium, fontFamily = DisplayFont)
        ImagePickRow("Logo", d.logoUrl, uploading == "logo", { pickLogo() }, onRemove = {
            scope.launch { try { Repo.sellerDeleteBrandImage("logo"); Repo.sellerMe()?.let(onBrand) } catch (e: ApiException) { say(e.pretty()) } }
        })
        ImagePickRow("Cover picture (top of your page)", d.coverUrl, uploading == "cover", { pickCover() }, onRemove = {
            scope.launch { try { Repo.sellerDeleteBrandImage("cover"); Repo.sellerMe()?.let(onBrand) } catch (e: ApiException) { say(e.pretty()) } }
        })
        Field("Brand name", name, { name = it }, errors["name"])
        Field("Tagline (short line under the name)", tagline, { tagline = it }, errors["tagline"])
        Field("Instagram username (optional)", instagram, { instagram = it }, errors["instagram"])
        Field("Website (optional, https://...)", website, { website = it }, errors["website"], KeyboardType.Uri)

        Text("Page sections", style = MaterialTheme.typography.titleMedium, fontFamily = DisplayFont)
        Text("Build your page like a website. Add sections and arrange them with the arrows. The colours follow the app's light or dark theme.", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
        sections.forEachIndexed { i, s ->
            SectionEditor(
                s, i, sections.size, products, say,
                onChange = { sections[i] = it },
                onMove = { by -> val j = i + by; if (j in sections.indices) { val x = sections.removeAt(i); sections.add(j, x) } },
                onDelete = { sections.removeAt(i) },
            )
        }
        if (sections.size < 20) {
            Text("Add a section", style = MaterialTheme.typography.labelLarge, color = TS.Gray)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SECTION_NAMES.forEach { (type, label) ->
                    OutlinedButton({ sections.add(SSection(id = java.util.UUID.randomUUID().toString(), type = type, layout = "grid")) }) { Text("+ $label") }
                }
            }
        }

        Spacer(Modifier.height(4.dp))
        TsButton(if (busy) "Please wait..." else "Save draft", enabled = !busy, onClick = { busy = true; scope.launch { if (save() != null) say("Draft saved"); busy = false } })
        TsButton("Preview my page", onPreview, style = TsButtonStyle.Outline)
        TsButton(if (brand.pageStatus == "submitted") "Already sent for review" else "Save and send for review", enabled = !busy && brand.pageStatus != "submitted", style = TsButtonStyle.Black, onClick = {
            busy = true
            scope.launch {
                try { if (save() != null) { onBrand(Repo.sellerSubmit()); say("Sent for review. We will notify you.") } }
                catch (e: ApiException) { say(e.pretty()) } finally { busy = false }
            }
        })
        Text("Preview shows the last saved draft.", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
        Spacer(Modifier.height(80.dp))
    }
}

/** One section card: type name, show/hide, move up/down, delete, and the settings of that type. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SectionEditor(
    s: SSection, index: Int, count: Int, products: List<SellerProduct>, say: (String) -> Unit,
    onChange: (SSection) -> Unit, onMove: (Int) -> Unit, onDelete: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    var uploading by remember { mutableStateOf(false) }
    var pending by remember { mutableStateOf<((Uri) -> Unit)?>(null) }
    val pickImage = rememberPhotoPicker { uri -> pending?.invoke(uri); pending = null }
    val pickVideo = rememberVideoPicker { uri -> pending?.invoke(uri); pending = null }

    /** Reads and uploads the chosen file, then hands the stored media back. */
    fun send(type: String, uri: Uri, done: (SMedia) -> Unit) {
        scope.launch {
            uploading = true
            try {
                val bytes = withContext(Dispatchers.IO) { if (type == "video") readVideo(ctx, uri) else readPhoto(ctx, uri) } ?: throw ApiException(false, "Could not read that picture")
                done(Repo.sellerUploadMedia(type, bytes))
            } catch (e: ApiException) { say(e.pretty()) } catch (e: java.io.IOException) { say("Could not read that file") } finally { uploading = false }
        }
    }
    fun chooseImage(done: (SMedia) -> Unit) { pending = { uri -> send("image", uri, done) }; pickImage() }

    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${index + 1}. ${SECTION_NAMES[s.type] ?: s.type}", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            IconButton({ onMove(-1) }, enabled = index > 0) { Icon(Icons.Outlined.KeyboardArrowUp, "Move up") }
            IconButton({ onMove(1) }, enabled = index < count - 1) { Icon(Icons.Outlined.KeyboardArrowDown, "Move down") }
            IconButton(onDelete) { Icon(Icons.Outlined.Delete, "Delete section", tint = TS.Danger) }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Show on my page", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            Switch(checked = !s.hidden, onCheckedChange = { onChange(s.copy(hidden = !it)) })
        }
        if (uploading) LinearProgressIndicator(Modifier.fillMaxWidth(), color = TS.Gold)

        when (s.type) {
            "banner" -> {
                s.slides.forEachIndexed { i, sl ->
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            AsyncImage(sl.image.url, null, Modifier.size(width = 110.dp, height = 68.dp).clip(RoundedCornerShape(10.dp)), contentScale = ContentScale.Crop)
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text("Banner ${i + 1}", style = MaterialTheme.typography.labelLarge)
                                Row {
                                    TextButton({ chooseImage { m -> onChange(s.copy(slides = s.slides.toMutableList().also { it[i] = sl.copy(image = m) })) } }, enabled = !uploading) { Text("Change picture") }
                                    TextButton({ onChange(s.copy(slides = s.slides.filterIndexed { k, _ -> k != i })) }) { Text("Remove", color = TS.Danger) }
                                }
                            }
                        }
                        Field("Headline (optional)", sl.title, { v -> onChange(s.copy(slides = s.slides.toMutableList().also { it[i] = sl.copy(title = v) })) })
                        Field("Small text (optional)", sl.subtitle, { v -> onChange(s.copy(slides = s.slides.toMutableList().also { it[i] = sl.copy(subtitle = v) })) })
                        Field("Button text (optional, e.g. Shop now)", sl.buttonLabel, { v -> onChange(s.copy(slides = s.slides.toMutableList().also { it[i] = sl.copy(buttonLabel = v) })) })
                        Text("Button / tap opens this product", style = MaterialTheme.typography.labelMedium, color = TS.Gray)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(selected = sl.productId == null, onClick = { onChange(s.copy(slides = s.slides.toMutableList().also { it[i] = sl.copy(productId = null) })) }, label = { Text("Nothing") })
                            products.forEach { p -> FilterChip(selected = sl.productId == p.id, onClick = { onChange(s.copy(slides = s.slides.toMutableList().also { it[i] = sl.copy(productId = p.id) })) }, label = { Text(p.name, maxLines = 1) }) }
                        }
                    }
                }
                if (s.slides.size < 6) OutlinedButton({ chooseImage { m -> onChange(s.copy(slides = s.slides + SSlide(m))) } }, enabled = !uploading) { Text(if (uploading) "Uploading..." else "Add banner picture") }
                Text("Best with wide pictures. Up to 6; they slide automatically.", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
            }
            "video" -> {
                Text(if (s.video == null) "No video yet" else "Video added", style = MaterialTheme.typography.bodyMedium, color = if (s.video == null) TS.Gray else TS.Success)
                OutlinedButton({ pending = { uri -> send("video", uri) { m -> onChange(s.copy(video = m)) } }; pickVideo() }, enabled = !uploading) { Text(if (uploading) "Uploading..." else if (s.video == null) "Choose video" else "Change video") }
                Text("MP4, under 25 MB (about 30 seconds).", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
                Field("Title (optional)", s.title, { onChange(s.copy(title = it)) })
                Field("Caption (optional)", s.body, { onChange(s.copy(body = it)) })
                Row(verticalAlignment = Alignment.CenterVertically) { Text("Play automatically (muted)", Modifier.weight(1f)); Switch(s.autoplay, { onChange(s.copy(autoplay = it)) }) }
            }
            "text" -> {
                Field("Heading", s.title, { onChange(s.copy(title = it)) })
                Field("Text", s.body, { onChange(s.copy(body = it)) }, minLines = 4)
                Row(verticalAlignment = Alignment.CenterVertically) { Text("Center the text", Modifier.weight(1f)); Switch(s.centered, { onChange(s.copy(centered = it)) }) }
            }
            "products" -> {
                Field("Title (e.g. Best sellers)", s.title, { onChange(s.copy(title = it)) })
                Text("Layout", style = MaterialTheme.typography.labelMedium, color = TS.Gray)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("grid" to "Grid", "carousel" to "Scrolling row", "big" to "Big cards").forEach { (id, label) -> FilterChip(selected = s.layout == id, onClick = { onChange(s.copy(layout = id)) }, label = { Text(label) }) }
                }
                Text("Products (none selected = all your products)", style = MaterialTheme.typography.labelMedium, color = TS.Gray)
                if (products.isEmpty()) Text("Add products in the Products tab first.", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    products.forEach { p ->
                        val on = p.id in s.productIds
                        FilterChip(selected = on, onClick = { onChange(s.copy(productIds = if (on) s.productIds - p.id else s.productIds + p.id)) }, label = { Text(p.name, maxLines = 1) })
                    }
                }
            }
            "gallery" -> {
                Field("Title (optional)", s.title, { onChange(s.copy(title = it)) })
                FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    s.images.forEachIndexed { i, m ->
                        Box(Modifier.size(92.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                            AsyncImage(m.url, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                            TextButton({ onChange(s.copy(images = s.images.filterIndexed { k, _ -> k != i })) }, Modifier.align(Alignment.BottomEnd), contentPadding = PaddingValues(6.dp, 0.dp)) { Text("Remove", style = MaterialTheme.typography.labelSmall, color = TS.Danger) }
                        }
                    }
                }
                if (s.images.size < 8) OutlinedButton({ chooseImage { m -> onChange(s.copy(images = s.images + m)) } }, enabled = !uploading) { Text(if (uploading) "Uploading..." else "Add picture") }
            }
            "features" -> {
                Field("Title (optional, e.g. Why choose us)", s.title, { onChange(s.copy(title = it)) })
                s.items.forEachIndexed { i, item ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Field("e.g. Pure cotton", item, { v -> onChange(s.copy(items = s.items.toMutableList().also { it[i] = v })) }, modifier = Modifier.weight(1f))
                        TextButton({ onChange(s.copy(items = s.items.filterIndexed { k, _ -> k != i })) }) { Text("Remove") }
                    }
                }
                if (s.items.size < 6) OutlinedButton({ onChange(s.copy(items = s.items + "")) }) { Text("Add point") }
            }
            "spacer" -> {
                Text("Empty space between sections", style = MaterialTheme.typography.labelMedium, color = TS.Gray)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("small" to "Small", "medium" to "Medium", "large" to "Large").forEach { (id, label) -> FilterChip(selected = s.size == id, onClick = { onChange(s.copy(size = id)) }, label = { Text(label) }) }
                }
            }
        }
    }
}

/** Opens the system photo picker; [onPicked] gets the chosen picture. Calling the returned function opens the picker. */
@Composable
internal fun rememberPhotoPicker(onPicked: (Uri) -> Unit): () -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> if (uri != null) onPicked(uri) }
    return { launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
}

@Composable
private fun rememberVideoPicker(onPicked: (Uri) -> Unit): () -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> if (uri != null) onPicked(uri) }
    return { launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) }
}

@Composable
internal fun ImagePickRow(label: String, url: String?, busy: Boolean, onPick: () -> Unit, onRemove: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.size(76.dp).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
            if (url != null) AsyncImage(url, label, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            else Text("No\nphoto", style = MaterialTheme.typography.labelSmall, color = TS.Gray)
            if (busy) CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp, color = TS.Gold)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(label, style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onPick, enabled = !busy) { Text(if (url == null) "Choose" else "Change") }
                if (url != null) TextButton(onRemove, enabled = !busy) { Text("Remove") }
            }
        }
    }
}
