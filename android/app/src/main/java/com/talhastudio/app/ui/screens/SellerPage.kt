package com.talhastudio.app.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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

private val STYLES = listOf("noir" to "Noir (dark)", "ivory" to "Ivory (light)", "gold" to "Gold")
private val ACCENTS = listOf("#B99A62", "#C9A24B", "#8E1B2D", "#1F6F54", "#1E3A5F", "#C2577A", "#0F8B8D", "#B4572B", "#6B4FA0", "#E5E1D8")

/** The seller's brand page editor. Text fields are kept here until "Save draft"; pictures are uploaded straight away. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SellerPageTab(brand: SellerBrand, products: List<SellerProduct>, onBrand: (SellerBrand) -> Unit, onPreview: () -> Unit, say: (String) -> Unit) {
    val d = brand.draft
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    // Text lives in local state keyed by the brand, so uploading a picture (which refreshes the brand) never wipes what is being typed.
    var name by remember(brand.id) { mutableStateOf(d.name) }
    var tagline by remember(brand.id) { mutableStateOf(d.tagline) }
    var about by remember(brand.id) { mutableStateOf(d.about) }
    var style by remember(brand.id) { mutableStateOf(d.style) }
    var accent by remember(brand.id) { mutableStateOf(d.accent) }
    var instagram by remember(brand.id) { mutableStateOf(d.instagram.orEmpty()) }
    var website by remember(brand.id) { mutableStateOf(d.website.orEmpty()) }
    val highlights = remember(brand.id) { mutableStateListOf<String>().apply { addAll(d.highlights) } }
    val collections = remember(brand.id) { mutableStateListOf<SellerCollection>().apply { addAll(d.collections) } }
    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var busy by remember { mutableStateOf(false) }
    var uploading by remember { mutableStateOf<String?>(null) }

    fun content() = d.copy(
        name = name.trim(), tagline = tagline.trim(), about = about.trim(), style = style, accent = accent,
        highlights = highlights.map { it.trim() }.filter { it.isNotEmpty() }, instagram = instagram.trim().ifEmpty { null }, website = website.trim().ifEmpty { null },
        collections = collections.map { it.copy(title = it.title.trim()) },
    )
    fun upload(kind: String, uri: android.net.Uri) {
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
    suspend fun save(): SellerBrand? = try { Repo.sellerSaveBrand(content()).also { onBrand(it); errors = emptyMap() } }
        catch (e: ApiException) { errors = e.fields; say(e.pretty()); null }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        val (title, text, ok) = when (brand.pageStatus) {
            "submitted" -> Triple("Waiting for review", "We are reviewing your page and products. They go live as soon as they are approved.", false)
            "approved" -> Triple("Your page is live", "Customers can see the approved version. Changes you save below stay private until you send them for review again.", true)
            "rejected" -> Triple("Changes needed", brand.pageNote ?: "Please update your page and send it again.", false)
            else -> Triple("Not sent for review yet", "Add your logo and products, then send the page for review. Customers see it only after we approve it.", false)
        }
        Panel {
            Text(title, style = MaterialTheme.typography.titleMedium, fontFamily = DisplayFont, color = if (ok) TS.Success else if (brand.pageStatus == "rejected") TS.Danger else MaterialTheme.colorScheme.onSurface)
            Text(text, style = MaterialTheme.typography.bodyMedium, color = TS.Gray)
        }

        Text("Brand", style = MaterialTheme.typography.titleMedium, fontFamily = DisplayFont)
        ImagePickRow("Logo", d.logoUrl, uploading == "logo", { pickLogo() }, onRemove = {
            scope.launch { try { Repo.sellerDeleteBrandImage("logo"); Repo.sellerMe()?.let(onBrand) } catch (e: ApiException) { say(e.pretty()) } }
        })
        ImagePickRow("Cover picture", d.coverUrl, uploading == "cover", { pickCover() }, onRemove = {
            scope.launch { try { Repo.sellerDeleteBrandImage("cover"); Repo.sellerMe()?.let(onBrand) } catch (e: ApiException) { say(e.pretty()) } }
        })
        Field("Brand name", name, { name = it }, errors["name"])
        Field("Tagline (short line under the name)", tagline, { tagline = it }, errors["tagline"])
        Field("About your brand", about, { about = it }, errors["about"], minLines = 4)

        Text("Look", style = MaterialTheme.typography.titleMedium, fontFamily = DisplayFont)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            STYLES.forEach { (id, label) -> FilterChip(selected = style == id, onClick = { style = id }, label = { Text(label) }) }
        }
        Text("Accent colour", style = MaterialTheme.typography.labelLarge, color = TS.Gray)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            (ACCENTS + accent).distinct().forEach { hex ->
                val c = Color(parseHexColor(hex)); val on = hex.equals(accent, true)
                Box(Modifier.size(38.dp).clip(CircleShape).background(c).border(if (on) 3.dp else 1.dp, if (on) MaterialTheme.colorScheme.onSurface else Color.Gray.copy(alpha = 0.4f), CircleShape).clickable { accent = hex })
            }
        }

        Text("Highlights (up to 4)", style = MaterialTheme.typography.titleMedium, fontFamily = DisplayFont)
        highlights.forEachIndexed { i, h ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Field("e.g. Handmade", h, { highlights[i] = it }, errors["highlights.$i"], modifier = Modifier.weight(1f))
                TextButton({ highlights.removeAt(i) }) { Text("Remove") }
            }
        }
        if (highlights.size < 4) OutlinedButton({ highlights.add("") }) { Text("Add highlight") }

        Text("Links (optional)", style = MaterialTheme.typography.titleMedium, fontFamily = DisplayFont)
        Field("Instagram username", instagram, { instagram = it }, errors["instagram"])
        Field("Website (https://...)", website, { website = it }, errors["website"], KeyboardType.Uri)

        Text("Collections", style = MaterialTheme.typography.titleMedium, fontFamily = DisplayFont)
        Text("Group your products, for example \"Summer\" or \"Bridal\". Customers can filter by them.", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
        collections.forEachIndexed { i, c ->
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Field("Collection name", c.title, { collections[i] = c.copy(title = it) }, errors["collections.$i.title"], modifier = Modifier.weight(1f))
                    TextButton({ collections.removeAt(i) }) { Text("Remove") }
                }
                if (products.isEmpty()) Text("Add products first, then put them in this collection.", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    products.forEach { p ->
                        val on = p.id in c.productIds
                        FilterChip(selected = on, onClick = { collections[i] = c.copy(productIds = if (on) c.productIds - p.id else c.productIds + p.id) }, label = { Text(p.name, maxLines = 1) })
                    }
                }
            }
        }
        if (collections.size < 8) OutlinedButton({ collections.add(SellerCollection(null, "", emptyList())) }) { Text("Add collection") }

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
        Spacer(Modifier.height(80.dp))
    }
}

/** Opens the system photo picker; [onPicked] gets the chosen picture. Calling the returned function opens the picker. */
@Composable
internal fun rememberPhotoPicker(onPicked: (android.net.Uri) -> Unit): () -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> if (uri != null) onPicked(uri) }
    return { launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
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
