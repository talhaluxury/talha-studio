package com.talhastudio.app.ui.screens

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.*
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS

/** Colours of one of the three page looks the seller can choose (noir / ivory / gold). */
private class BrandLook(val bg: Color, val ink: Color, val soft: Color, val panel: Color)
private fun lookFor(style: String) = when (style) {
    "ivory" -> BrandLook(Color(0xFFFAF8F3), Color(0xFF111111), Color(0xFF6E6A63), Color(0xFFFFFFFF))
    "gold" -> BrandLook(Color(0xFF17120A), Color(0xFFF6EBD2), Color(0xFFB9A987), Color(0xFF241C0F))
    else -> BrandLook(Color(0xFF0A0A0A), Color(0xFFFAF8F3), Color(0xFFA29D94), Color(0xFF161616))
}
private fun accentOf(c: BrandCard) = Color(parseHexColor(c.accent))

/** The logo in a rounded tile; a letter when the brand has no logo yet. */
@Composable
private fun BrandLogo(card: BrandCard, size: androidx.compose.ui.unit.Dp, modifier: Modifier = Modifier) {
    val accent = accentOf(card)
    Box(modifier.size(size).clip(RoundedCornerShape(size / 4)).background(Color.White).border(2.dp, accent, RoundedCornerShape(size / 4)), contentAlignment = Alignment.Center) {
        if (card.logoUrl != null) AsyncImage(model = card.logoUrl, contentDescription = card.name, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else Text(card.name.take(1).uppercase(), fontFamily = DisplayFont, color = accent, fontSize = (size.value / 2.2f).sp)
    }
}

/** Home: "Brands" row. Each card tilts toward the finger. Nothing is drawn when no brand is live yet. */
@Composable
fun BrandsRow(brands: List<BrandCard>, onOpen: (String) -> Unit, onAll: () -> Unit) {
    if (brands.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionHeader("Brands", "View All", onAll)
        LazyRow(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            items(brands, key = { it.id }) { b -> BrandTile(b, Modifier.width(132.dp), onOpen) }
        }
    }
}

@Composable
private fun BrandTile(b: BrandCard, modifier: Modifier = Modifier, onOpen: (String) -> Unit) {
    val look = lookFor(b.style); val accent = accentOf(b)
    val shape = RoundedCornerShape(22.dp)
    Column(modifier.tilt3d().clip(shape).background(Brush.verticalGradient(listOf(look.panel, look.bg))).border(1.dp, accent.copy(alpha = 0.6f), shape)
        .clickable { onOpen(b.slug) }.padding(vertical = 16.dp, horizontal = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        BrandLogo(b, 72.dp)
        Text(b.name, color = look.ink, style = MaterialTheme.typography.titleMedium, maxLines = 2, minLines = 2, textAlign = TextAlign.Center, overflow = TextOverflow.Ellipsis)
        Text("Verified", color = accent, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
    }
}

/** Every live brand as a grid of cards (opened from "View All"). */
@Composable
fun AllBrandsScreen(onBack: () -> Unit, onOpen: (String) -> Unit) {
    val load = rememberLoad("all-brands") { Repo.brands() }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.statusBarsPadding().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
            Text("Brands", style = MaterialTheme.typography.headlineMedium, fontFamily = DisplayFont)
        }
        when (val s = load.state) {
            is Load.Loading -> Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) { repeat(3) { Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) { repeat(2) { SkeletonBox(Modifier.weight(1f).height(170.dp)) } } } }
            is Load.Error -> ErrorState(s.message, s.offline, load.retry)
            is Load.Ready -> if (s.data.isEmpty()) EmptyState("No brands yet", "Authentic brands will appear here soon.")
            else LazyColumn(contentPadding = PaddingValues(20.dp, 8.dp, 20.dp, 120.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                items(s.data.chunked(2)) { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        pair.forEach { BrandTile(it, Modifier.weight(1f), onOpen) }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

/**
 * A brand's own page: parallax cover, floating tilting logo, about text, collections and a product grid.
 * Everything shown here is the version the store approved; the customer buys through the normal product and cart screens.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BrandScreen(shop: ShopViewModel, slug: String, onBack: () -> Unit, onOpenProduct: (String) -> Unit) {
    val load = rememberLoad(slug) { Repo.brand(slug) }
    Box(Modifier.fillMaxSize()) {
        when (val s = load.state) {
            is Load.Loading -> Column(Modifier.fillMaxSize().padding(20.dp).statusBarsPadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SkeletonBox(Modifier.fillMaxWidth().height(220.dp)); SkeletonBox(Modifier.fillMaxWidth(0.6f).height(28.dp)); SkeletonBox(Modifier.fillMaxWidth().height(120.dp))
            }
            is Load.Error -> Box(Modifier.fillMaxSize().statusBarsPadding()) {
                if (s.message.contains("not found", true)) EmptyState("Brand not found", "This brand page is not available right now.", "Go back", onBack)
                else ErrorState(s.message, s.offline, load.retry)
            }
            is Load.Ready -> BrandPageContent(shop, s.data, onOpenProduct)
        }
        IconButton(onBack, Modifier.statusBarsPadding().padding(8.dp).align(Alignment.TopStart).clip(CircleShape).background(Color.Black.copy(alpha = 0.45f))) {
            Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back", tint = Color.White)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun BrandPageContent(shop: ShopViewModel, page: BrandPage, onOpenProduct: (String) -> Unit) {
    val card = page.card; val look = lookFor(card.style); val accent = accentOf(card)
    val state = rememberLazyListState()
    val uri = LocalUriHandler.current
    var selected by remember(card.id) { mutableStateOf<String?>(null) }       // null = all products
    val shown = page.collections.firstOrNull { it.id == selected }?.products ?: page.products

    // Slow floating of the logo (up/down and a small sway).
    val t = rememberInfiniteTransition(label = "float")
    val bob by t.animateFloat(-6f, 6f, infiniteRepeatable(tween(2600), RepeatMode.Reverse), label = "bob")
    val sway by t.animateFloat(-7f, 7f, infiniteRepeatable(tween(3400), RepeatMode.Reverse), label = "sway")

    LazyColumn(Modifier.fillMaxSize().background(look.bg), state = state, contentPadding = PaddingValues(bottom = 120.dp)) {
        item(key = "hero") {
            Box(Modifier.fillMaxWidth().height(330.dp)) {
                // Parallax: the cover moves at half the scroll speed.
                Box(Modifier.fillMaxSize().graphicsLayer { translationY = if (state.firstVisibleItemIndex == 0) state.firstVisibleItemScrollOffset * 0.5f else 0f }) {
                    if (card.coverUrl != null) AsyncImage(model = card.coverUrl, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    else Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(accent.copy(alpha = 0.85f), look.bg))))
                }
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, look.bg.copy(alpha = 0.25f), look.bg))))
                Column(Modifier.align(Alignment.BottomCenter).padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    BrandLogo(card, 104.dp, Modifier.graphicsLayer { translationY = bob * density; rotationY = sway; cameraDistance = 16f * density }.tilt3d(14f))
                    Spacer(Modifier.height(12.dp))
                    Text(card.name, color = look.ink, fontFamily = DisplayFont, style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
                    Row(Modifier.padding(top = 6.dp).clip(CircleShape).border(1.dp, accent.copy(alpha = 0.7f), CircleShape).padding(horizontal = 10.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Verified, null, tint = accent, modifier = Modifier.size(14.dp)); Spacer(Modifier.width(4.dp))
                        Text("Verified brand", color = accent, style = MaterialTheme.typography.labelSmall)
                    }
                    if (card.tagline.isNotBlank()) Text(card.tagline, color = look.soft, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
                    Spacer(Modifier.height(10.dp))
                }
            }
        }
        if (page.about.isNotBlank() || page.highlights.isNotEmpty()) item(key = "about") {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (page.about.isNotBlank()) Text(page.about, color = look.soft, style = MaterialTheme.typography.bodyLarge)
                if (page.highlights.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    page.highlights.forEach { h ->
                        Text(h, color = look.ink, style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(look.panel).border(0.8.dp, accent.copy(alpha = 0.5f), RoundedCornerShape(12.dp)).padding(horizontal = 12.dp, vertical = 8.dp))
                    }
                }
            }
        }
        val links = listOfNotNull(
            page.instagram?.takeIf { Regex("^[A-Za-z0-9._]{1,30}$").matches(it) }?.let { "Instagram" to "https://www.instagram.com/$it" },
            page.website?.takeIf { it.startsWith("https://") }?.let { "Website" to it },
        )
        if (links.isNotEmpty()) item(key = "links") {
            Row(Modifier.padding(horizontal = 20.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                links.forEach { (label, url) ->
                    OutlinedButton({ runCatching { uri.openUri(url) } }, border = androidx.compose.foundation.BorderStroke(1.dp, accent), shape = RoundedCornerShape(12.dp)) {
                        Icon(Icons.Outlined.Language, null, tint = accent, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text(label, color = accent)
                    }
                }
            }
        }
        if (page.collections.isNotEmpty()) item(key = "chips") {
            LazyRow(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { BrandChip("All", selected == null, accent, look) { selected = null } }
                items(page.collections, key = { it.id }) { c -> BrandChip(c.title, selected == c.id, accent, look) { selected = c.id } }
            }
        }
        if (shown.isEmpty()) item(key = "empty") {
            Text("No products here yet.", color = look.soft, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(40.dp))
        } else items(shown.chunked(2), key = { row -> row.first().id }) { pair ->
            Row(Modifier.padding(horizontal = 20.dp, vertical = 7.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                pair.forEach { p -> ProductCard(p, shop.isWished(p.id), { onOpenProduct(p.id) }, { shop.toggleWishlist(p.id) }, Modifier.weight(1f).tilt3d(7f)) }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun BrandChip(label: String, on: Boolean, accent: Color, look: BrandLook, onClick: () -> Unit) {
    Text(label, color = if (on) Color.Black else look.ink, style = MaterialTheme.typography.labelLarge,
        modifier = Modifier.clip(CircleShape).background(if (on) accent else look.panel).border(0.8.dp, accent.copy(alpha = 0.6f), CircleShape).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 9.dp))
}
