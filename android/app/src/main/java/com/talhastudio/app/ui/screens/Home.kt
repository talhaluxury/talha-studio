package com.talhastudio.app.ui.screens

import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DonutLarge
import androidx.compose.material.icons.outlined.MovieCreation
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Search
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.talhastudio.app.data.Session
import com.talhastudio.app.push.routeFor
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.talhastudio.app.R
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.HomeData
import com.talhastudio.app.data.Product
import com.talhastudio.app.data.Repo
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS

@Composable
fun HomeScreen(shop: ShopViewModel, onOpenProduct: (String) -> Unit, onBrowse: (category: String?) -> Unit, onNotifications: () -> Unit, onUpdates: () -> Unit, onSupport: () -> Unit, onOpenPage: (String) -> Unit, onSignIn: () -> Unit = {}, onOpenBrand: (String) -> Unit = {}, onAllBrands: () -> Unit = {}) {
    LaunchedEffect(Session.user?.id) { shop.refreshUnread(); shop.refreshUpdates() }
    LaunchedEffect(Unit) { shop.refreshSale() }
    var showSpin by remember { mutableStateOf(false) }
    val home = rememberLoad("home") { Repo.home() }
    val brands = rememberLoad("brands") { runCatching { Repo.brands() }.getOrDefault(emptyList()) }       // a failing brands row must never break the home screen
    // Show last visit's feed instantly while fresh data loads (or when offline).
    val cachedHome = remember { Repo.cachedHome() }
    val homeState: Load<HomeData> = when (val s = home.state) { is Load.Ready -> s; else -> cachedHome?.let { Load.Ready<HomeData>(it) } ?: s }

    LazyColumn(contentPadding = PaddingValues(bottom = 120.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
        item { // Branded header + search (search opens the Browse tab)
            Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Image(painterResource(R.drawable.talha_logo), "Talha Studio", Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)))
                    Spacer(Modifier.width(10.dp))
                    Text("TALHA STUDIO", fontFamily = DisplayFont, letterSpacing = 2.sp, maxLines = 1, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                    // Lucky wheel: shown only while the owner has it switched on. Signed-out customers are asked to sign in first.
                    if ((homeState as? Load.Ready)?.data?.spin == true) SpinWheelButton { if (Session.signedIn) showSpin = true else onSignIn() }
                    // Updates: daily status pictures + chat with the store (asks for a mobile-number sign-in the first time).
                    IconButton(onUpdates) {
                        BadgedBox(badge = {
                            if (shop.chatUnread > 0) Badge(containerColor = TS.Gold, contentColor = TS.Black) { Text("${shop.chatUnread.coerceAtMost(99)}") }
                            else if (shop.newStatus) Badge(containerColor = TS.Gold)
                        }) { Icon(Icons.Outlined.DonutLarge, "Updates and chat") }
                    }
                    IconButton(onNotifications) {
                        BadgedBox(badge = { if (shop.unread > 0) Badge(containerColor = TS.Danger, contentColor = androidx.compose.ui.graphics.Color.White) { Text("${shop.unread.coerceAtMost(99)}") } }) {
                            Icon(Icons.Outlined.Notifications, "Notifications")
                        }
                    }
                }
                GlassCard(Modifier.fillMaxWidth().height(48.dp).clickable { onBrowse(null) }, corner = 14.dp, tint = TS.Surface) {
                    Row(Modifier.fillMaxSize().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Search, null, tint = TS.Gray); Spacer(Modifier.width(10.dp))
                        Text("Search products...", color = TS.Gray, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
        (homeState as? Load.Ready)?.data?.announcement?.let { text ->
            item(key = "announcement") {
                Text(text, style = MaterialTheme.typography.labelLarge.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), color = TS.Black, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 20.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(TS.Gold).padding(horizontal = 14.dp, vertical = 10.dp))
            }
        }
        item(key = "banners") { // Admin-managed banners; before any exist (or while loading) the Talha Studio brand banner is shown
            val banners = (homeState as? Load.Ready)?.data?.banners.orEmpty()
            if (banners.isEmpty()) BrandBanner { onBrowse(null) }
            else BannerCarousel(banners) { link -> routeFor(link)?.takeIf { it.startsWith("product/") }?.let { onOpenProduct(it.removePrefix("product/")) } ?: onBrowse(null) }
        }
        when (val s = homeState) {
            is Load.Loading -> item { Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) { repeat(4) { SkeletonBox(Modifier.size(64.dp)) } }
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) { repeat(2) { SkeletonBox(Modifier.weight(1f).aspectRatio(0.7f)) } } } }
            is Load.Error -> item { ErrorState(s.message, s.offline, home.retry) }
            is Load.Ready -> {
                val d = s.data
                if (d.categories.isNotEmpty()) item {
                    LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        items(d.categories.filter { it.parentId == null }, key = { it.id }) { c ->
                            Column(Modifier.clickable { onBrowse(c.slug) }, horizontalAlignment = Alignment.CenterHorizontally) {
                                Box(Modifier.size(64.dp).clip(CircleShape).background(TS.Neutral), contentAlignment = Alignment.Center) {
                                    if (c.imageUrl != null) AsyncImage(model = c.imageUrl, contentDescription = c.name, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                                    else Text(c.name.take(1), fontFamily = DisplayFont, color = TS.Gold, style = MaterialTheme.typography.titleLarge)
                                }
                                Spacer(Modifier.height(6.dp)); Text(c.name, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
                (brands.state as? Load.Ready)?.data?.takeIf { it.isNotEmpty() }?.let { list -> item(key = "brands") { BrandsRow(list, onOpenBrand, onAllBrands) } }
                item(key = "showcase") { AccessoriesShowcase(d.accessories, shop, onOpenProduct, onBrowse) }
                if (d.collections.isEmpty()) item { EmptyState("New collection coming soon", "Our products will appear here as soon as they are published.") }
                // "Watch & Shop" video cards sit right under On Sale (at the end of the collections when there is no sale section).
                var reelsShown = false
                fun LazyListScope.reelsRow() { if (!reelsShown && d.reels.isNotEmpty()) { reelsShown = true
                    item(key = "h-reels") { SectionHeader("Watch & Shop") }
                    item(key = "r-reels") { ReelRow(d.reels) { onBrowse(it) } } } }
                d.collections.forEach { col ->
                    item(key = "h-${col.slug}") { SectionHeader(col.title, "View All") { onBrowse("@${col.slug}|${col.title}") } }
                    if (col.grid) item(key = "r-${col.slug}") { ProductGrid(shop, col.products, onOpenProduct) }
                    else item(key = "r-${col.slug}") { ProductRow(shop, col.products, onOpenProduct) }
                    if (col.banners.isNotEmpty()) item(key = "b-${col.slug}") {
                        BannerCarousel(col.banners) { link -> routeFor(link)?.takeIf { it.startsWith("product/") }?.let { onOpenProduct(it.removePrefix("product/")) } ?: onBrowse(null) }
                    }
                    if (col.slug == "sale") reelsRow()
                }
                reelsRow()
            }
        }
        item(key = "footer") { Footer(onSupport, onOpenPage) }
    }
    if (showSpin) SpinWheelDialog(onDismiss = { showSpin = false }, onUseCode = { shop.applyCoupon(it) })
}

@Composable
fun SectionHeader(title: String, action: String? = null, onAction: () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(3.dp).height(22.dp).clip(RoundedCornerShape(2.dp)).background(Brush.verticalGradient(listOf(Color(0xFFE9CF98), TS.Gold))))
        Spacer(Modifier.width(10.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
        if (action != null) TextButton(onAction) { Text(action, color = TS.Gold) }
    }
}

/** Product row: drifts slowly by itself (stops when touched), and the cards swing in a cover-flow style toward the middle. */
@Composable
fun ProductRow(shop: ShopViewModel, list: List<Product>, onOpen: (String) -> Unit) {
    val state = rememberLazyListState()
    AutoScroll(state, enabled = list.size > 2)
    LazyRow(state = state, contentPadding = PaddingValues(horizontal = 20.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        items(list, key = { it.id }) { p -> ProductCard(p, shop.isWished(p.id), { onOpen(p.id) }, { shop.toggleWishlist(p.id) }, Modifier.width(172.dp).carousel3d(state, p.id)) }
    }
}

/** Two-column grid that scrolls down with the page (the owner picks this layout per section instead of the sideways slider). */
@Composable
fun ProductGrid(shop: ShopViewModel, list: List<Product>, onOpen: (String) -> Unit) {
    Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        list.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                pair.forEach { p -> ProductCard(p, shop.isWished(p.id), { onOpen(p.id) }, { shop.toggleWishlist(p.id) }, Modifier.weight(1f)) }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

/** Row of autoplaying video cards (muted, looping). Only the cards on screen play; a tap opens the category or section the owner linked. */
@Composable
private fun ReelRow(reels: List<com.talhastudio.app.data.Reel>, onOpen: (String?) -> Unit) {
    LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        items(reels, key = { it.id }) { r ->
            Box(Modifier.width(172.dp).height(250.dp).clip(RoundedCornerShape(24.dp)).background(TS.Black).clickable { onOpen(r.browse) }) {
                VideoPlayer(r.videoUrl, Modifier.fillMaxSize(), autoplay = true, muted = true, loop = true, controls = false)
                Icon(Icons.Outlined.MovieCreation, null, tint = androidx.compose.ui.graphics.Color.White, modifier = Modifier.align(Alignment.TopEnd).padding(12.dp).size(24.dp))
                Text(r.title, color = androidx.compose.ui.graphics.Color.White, maxLines = 2, style = MaterialTheme.typography.titleMedium.copy(shadow = androidx.compose.ui.graphics.Shadow(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.7f), blurRadius = 8f)),
                    modifier = Modifier.align(Alignment.BottomStart).padding(14.dp))
            }
        }
    }
}

@Composable
private fun BrandBanner(onShop: () -> Unit) {
    Box(Modifier.padding(horizontal = 20.dp).fillMaxWidth().height(190.dp).clip(RoundedCornerShape(24.dp)).background(TS.Black)) {
        Column(Modifier.padding(24.dp).align(Alignment.CenterStart)) {
            Text("ELEGANCE", fontFamily = DisplayFont, color = TS.Ivory, style = MaterialTheme.typography.headlineMedium, letterSpacing = 4.sp)
            Text("IN EVERY THREAD", fontFamily = DisplayFont, color = TS.Gold, style = MaterialTheme.typography.titleLarge, letterSpacing = 3.sp)
            Spacer(Modifier.height(18.dp))
            Button(onClick = onShop, colors = ButtonDefaults.buttonColors(TS.Gold, TS.Black), shape = RoundedCornerShape(12.dp)) { Text("Shop Now") }
        }
    }
}

@Composable
private fun BannerCarousel(banners: List<com.talhastudio.app.data.Banner>, onOpen: (String?) -> Unit) {
    val pager = androidx.compose.foundation.pager.rememberPagerState { banners.size }
    LaunchedEffect(banners.size) { while (banners.size > 1) { kotlinx.coroutines.delay(5000); pager.animateScrollToPage((pager.currentPage + 1) % banners.size) } }
    Box {
        androidx.compose.foundation.pager.HorizontalPager(pager, Modifier.fillMaxWidth().height(190.dp), contentPadding = PaddingValues(horizontal = 20.dp), pageSpacing = 12.dp) { i ->
            val b = banners[i]
            Box(Modifier.fillMaxSize().clip(RoundedCornerShape(24.dp)).background(TS.Black).clickable { onOpen(b.ctaLink) }) {
                if (b.imageUrl != null || b.videoUrl != null) {
                    if (b.videoUrl != null) com.talhastudio.app.ui.components.VideoPlayer(b.videoUrl, Modifier.fillMaxSize(), autoplay = true, muted = true, loop = true, controls = false)
                    else ImageTile(b.imageUrl, b.title, Modifier.fillMaxSize())
                }
                Column(Modifier.padding(24.dp).align(Alignment.CenterStart).fillMaxWidth(0.7f)) {
                    Text(b.title, fontFamily = DisplayFont, color = TS.Ivory, style = MaterialTheme.typography.headlineMedium.copy(shadow = androidx.compose.ui.graphics.Shadow(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.55f), blurRadius = 10f)))
                    b.subtitle?.let { Text(it, color = TS.Gold, style = MaterialTheme.typography.bodyMedium) }
                    if (b.ctaLabel != null) { Spacer(Modifier.height(14.dp)); Button(onClick = { onOpen(b.ctaLink) }, colors = ButtonDefaults.buttonColors(TS.Gold, TS.Black), shape = RoundedCornerShape(12.dp)) { Text(b.ctaLabel) } }
                }
            }
        }
    }
}

@Composable
private fun Footer(onSupport: () -> Unit, onOpenPage: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).clip(RoundedCornerShape(20.dp)).background(TS.Black).padding(20.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("TALHA STUDIO", fontFamily = DisplayFont, color = TS.Ivory, letterSpacing = 4.sp, style = MaterialTheme.typography.titleLarge)
        Text("Customer service", color = TS.Gold, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp))
        listOf("Help & Support" to null, "Shipping" to "shipping", "Returns" to "returns", "Privacy Policy" to "privacy", "Terms of Service" to "terms", "About Us" to "about").forEach { (label, slug) ->
            Text(label, color = TS.Ivory.copy(0.85f), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.fillMaxWidth().clickable { if (slug == null) onSupport() else onOpenPage(slug) }.padding(vertical = 8.dp))
        }
    }
}
