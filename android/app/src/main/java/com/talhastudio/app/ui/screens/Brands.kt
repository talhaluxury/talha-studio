package com.talhastudio.app.ui.screens

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.*
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.delay

/* A brand page never has its own colours: background, text and cards come from the app theme (light or dark), with the store gold as the accent. */

/** The logo in a rounded tile; the first letter when the brand has no logo yet. */
@Composable
private fun BrandLogo(card: BrandCard, size: Dp, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(size / 4)
    Box(modifier.size(size).clip(shape).background(Color.White).border(2.dp, TS.Gold, shape), contentAlignment = Alignment.Center) {
        if (card.logoUrl != null) AsyncImage(model = card.logoUrl, contentDescription = card.name, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else Text(card.name.take(1).uppercase(), fontFamily = DisplayFont, color = TS.Gold, fontSize = (size.value / 2.2f).sp)
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
    val shape = RoundedCornerShape(22.dp)
    Column(modifier.tilt3d().clip(shape).background(MaterialTheme.colorScheme.surface).border(1.dp, TS.Gold.copy(alpha = 0.5f), shape)
        .clickable { onOpen(b.slug) }.padding(vertical = 16.dp, horizontal = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        BrandLogo(b, 72.dp)
        Text(b.name, style = MaterialTheme.typography.titleMedium, maxLines = 2, minLines = 2, textAlign = TextAlign.Center, overflow = TextOverflow.Ellipsis)
        Text("Verified", color = TS.Gold, style = MaterialTheme.typography.labelSmall, letterSpacing = 1.sp)
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

/** A brand's own page, built by the seller from sections (banners, video, text, products, gallery...) and approved by the store. Buying works through the normal product and cart screens. */
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
    val card = page.card
    val bg = MaterialTheme.colorScheme.background
    val state = rememberLazyListState()
    val uri = LocalUriHandler.current

    // Slow floating of the logo (up/down and a small sway).
    val t = rememberInfiniteTransition(label = "float")
    val bob by t.animateFloat(-6f, 6f, infiniteRepeatable(tween(2600), RepeatMode.Reverse), label = "bob")
    val sway by t.animateFloat(-7f, 7f, infiniteRepeatable(tween(3400), RepeatMode.Reverse), label = "sway")

    LazyColumn(Modifier.fillMaxSize().background(bg), state = state, contentPadding = PaddingValues(bottom = 120.dp)) {
        item(key = "hero") {
            Box(Modifier.fillMaxWidth().height(320.dp)) {
                // Parallax: the cover moves at half the scroll speed.
                Box(Modifier.fillMaxSize().graphicsLayer { translationY = if (state.firstVisibleItemIndex == 0) state.firstVisibleItemScrollOffset * 0.5f else 0f }) {
                    if (card.coverUrl != null) AsyncImage(model = card.coverUrl, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    else Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(TS.Gold.copy(alpha = 0.6f), bg))))
                }
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, bg.copy(alpha = 0.25f), bg))))
                Column(Modifier.align(Alignment.BottomCenter).padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    BrandLogo(card, 104.dp, Modifier.graphicsLayer { translationY = bob * density; rotationY = sway; cameraDistance = 16f * density }.tilt3d(14f))
                    Spacer(Modifier.height(12.dp))
                    Text(card.name, fontFamily = DisplayFont, style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
                    Row(Modifier.padding(top = 6.dp).clip(CircleShape).border(1.dp, TS.Gold.copy(alpha = 0.7f), CircleShape).padding(horizontal = 10.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Verified, null, tint = TS.Gold, modifier = Modifier.size(14.dp)); Spacer(Modifier.width(4.dp))
                        Text("Verified brand", color = TS.Gold, style = MaterialTheme.typography.labelSmall)
                    }
                    if (card.tagline.isNotBlank()) Text(card.tagline, color = TS.Gray, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
                    Spacer(Modifier.height(10.dp))
                }
            }
        }
        val links = listOfNotNull(
            page.instagram?.takeIf { Regex("^[A-Za-z0-9._]{1,30}$").matches(it) }?.let { "Instagram" to "https://www.instagram.com/$it" },
            page.website?.takeIf { it.startsWith("https://") }?.let { "Website" to it },
        )
        if (links.isNotEmpty()) item(key = "links") {
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally)) {
                links.forEach { (label, url) ->
                    OutlinedButton({ runCatching { uri.openUri(url) } }, border = BorderStroke(1.dp, TS.Gold), shape = RoundedCornerShape(12.dp)) {
                        Icon(Icons.Outlined.Language, null, tint = TS.Gold, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp)); Text(label, color = TS.Gold)
                    }
                }
            }
        }
        items(page.sections, key = { it.id }) { s ->
            when (s) {
                is BannerSection -> BannerBlock(s, onOpenProduct)
                is VideoSection -> VideoBlock(s)
                is TextSection -> TextBlock(s)
                is ProductsSection -> ProductsBlock(shop, s, onOpenProduct)
                is GallerySection -> GalleryBlock(s)
                is FeaturesSection -> FeaturesBlock(s)
                is SpacerSection -> Spacer(Modifier.height(when (s.size) { "small" -> 12.dp; "large" -> 56.dp; else -> 28.dp }))
            }
        }
        if (page.sections.isEmpty()) item(key = "empty") {
            Text("This brand is still setting up its page.", color = TS.Gray, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(40.dp))
        }
    }
}

@Composable
private fun BlockTitle(title: String, modifier: Modifier = Modifier) {
    if (title.isNotBlank()) Text(title, style = MaterialTheme.typography.titleLarge, fontFamily = DisplayFont, modifier = modifier.padding(horizontal = 20.dp, vertical = 8.dp))
}

/** Banner slider: swipe, or it moves on by itself every few seconds. A slide can have a button that opens one of the brand's products. */
@Composable
private fun BannerBlock(s: BannerSection, onOpenProduct: (String) -> Unit) {
    if (s.slides.isEmpty()) return
    val pager = rememberPagerState { s.slides.size }
    if (s.slides.size > 1) LaunchedEffect(pager, s.slides.size) {
        while (true) { delay(4500); pager.animateScrollToPage((pager.currentPage + 1) % s.slides.size) }
    }
    Box(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp).height(220.dp).clip(RoundedCornerShape(24.dp))) {
        HorizontalPager(pager, Modifier.fillMaxSize()) { i ->
            val sl = s.slides[i]
            Box(Modifier.fillMaxSize().then(if (sl.productId != null) Modifier.clickable { onOpenProduct(sl.productId) } else Modifier)) {
                AsyncImage(sl.imageUrl, sl.title.ifBlank { null }, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                if (sl.title.isNotBlank() || sl.subtitle.isNotBlank() || sl.buttonLabel.isNotBlank()) {
                    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.7f)))))
                    Column(Modifier.align(Alignment.BottomStart).padding(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (sl.title.isNotBlank()) Text(sl.title, color = Color.White, fontFamily = DisplayFont, style = MaterialTheme.typography.titleLarge, maxLines = 2)
                        if (sl.subtitle.isNotBlank()) Text(sl.subtitle, color = Color.White.copy(alpha = 0.88f), style = MaterialTheme.typography.bodyMedium, maxLines = 2)
                        if (sl.buttonLabel.isNotBlank() && sl.productId != null) {
                            Spacer(Modifier.height(4.dp))
                            Text(sl.buttonLabel, color = TS.Black, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.clip(CircleShape).background(TS.Gold).padding(horizontal = 16.dp, vertical = 8.dp))
                        }
                    }
                }
            }
        }
        if (s.slides.size > 1) Row(Modifier.align(Alignment.TopCenter).padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            repeat(s.slides.size) { i -> Box(Modifier.size(if (pager.currentPage == i) 18.dp else 6.dp, 6.dp).clip(CircleShape).background(Color.White.copy(alpha = if (pager.currentPage == i) 0.95f else 0.5f))) }
        }
    }
}

@Composable
private fun VideoBlock(s: VideoSection) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BlockTitle(s.title)
        Box(Modifier.fillMaxWidth().padding(horizontal = 20.dp).aspectRatio(16f / 9f).clip(RoundedCornerShape(24.dp)).background(Color.Black)) {
            VideoPlayer(s.videoUrl, Modifier.fillMaxSize(), autoplay = s.autoplay, muted = s.autoplay, loop = s.autoplay, controls = true, fit = true)
        }
        if (s.caption.isNotBlank()) Text(s.caption, color = TS.Gray, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 20.dp))
    }
}

@Composable
private fun TextBlock(s: TextSection) {
    val align = if (s.centered) TextAlign.Center else TextAlign.Start
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = if (s.centered) Alignment.CenterHorizontally else Alignment.Start) {
        if (s.heading.isNotBlank()) Text(s.heading, style = MaterialTheme.typography.headlineSmall, fontFamily = DisplayFont, textAlign = align)
        if (s.body.isNotBlank()) Text(s.body, color = TS.Gray, style = MaterialTheme.typography.bodyLarge, textAlign = align)
    }
}

@Composable
private fun ProductsBlock(shop: ShopViewModel, s: ProductsSection, onOpenProduct: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BlockTitle(s.title)
        when (s.layout) {
            "carousel" -> LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                items(s.products, key = { it.id }) { p -> ProductCard(p, shop.isWished(p.id), { onOpenProduct(p.id) }, { shop.toggleWishlist(p.id) }, Modifier.width(168.dp).tilt3d(7f)) }
            }
            "big" -> Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                s.products.forEach { p -> ProductCard(p, shop.isWished(p.id), { onOpenProduct(p.id) }, { shop.toggleWishlist(p.id) }, Modifier.fillMaxWidth().tilt3d(5f)) }
            }
            else -> Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                s.products.chunked(2).forEach { pair ->
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        pair.forEach { p -> ProductCard(p, shop.isWished(p.id), { onOpenProduct(p.id) }, { shop.toggleWishlist(p.id) }, Modifier.weight(1f).tilt3d(7f)) }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun GalleryBlock(s: GallerySection) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BlockTitle(s.title)
        LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(s.images) { url ->
                AsyncImage(url, null, Modifier.height(220.dp).aspectRatio(0.8f).tilt3d(8f).clip(RoundedCornerShape(20.dp)), contentScale = ContentScale.Crop)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FeaturesBlock(s: FeaturesSection) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BlockTitle(s.title)
        FlowRow(Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            s.items.forEach { item ->
                Row(Modifier.clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).border(0.8.dp, TS.Gold.copy(alpha = 0.5f), RoundedCornerShape(14.dp)).padding(horizontal = 12.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.CheckCircle, null, tint = TS.Gold, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(6.dp))
                    Text(item, style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}
