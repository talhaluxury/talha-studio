package com.talhastudio.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.ZoomIn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.unit.dp
import com.talhastudio.app.FlyEvent
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.Product
import com.talhastudio.app.data.Repo
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ProductDetailScreen(shop: ShopViewModel, id: String, onBack: () -> Unit, onOpenProduct: (String) -> Unit, onOpenBrand: (String) -> Unit = {}) {
    val load = rememberLoad(id) { Repo.product(id) }
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    LaunchedEffect(id) { shop.markViewed(id); shop.refreshSale() }
    val sale = shop.sale
    val saleLeft by rememberSaleRemaining(sale)

    Scaffold(
        snackbarHost = { SnackbarHost(snack) },
        topBar = {
            TopAppBar(title = {}, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
                actions = { val w = shop.isWished(id)
                    IconButton({ shop.toggleWishlist(id) }) { Icon(if (w) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder, if (w) "Remove from wishlist" else "Add to wishlist", tint = if (w) TS.Danger else MaterialTheme.colorScheme.onBackground) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent))
        },
    ) { pad ->
        Box(Modifier.padding(pad)) {
            when (val s = load.state) {
                is Load.Loading -> Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { SkeletonBox(Modifier.fillMaxWidth().aspectRatio(0.85f)); SkeletonBox(Modifier.fillMaxWidth().height(28.dp)); SkeletonBox(Modifier.fillMaxWidth(0.5f).height(22.dp)) }
                is Load.Error -> if (s.message.contains("not found", true)) EmptyState("Product not found", "It may have been removed.", "Go back", onBack) else ErrorState(s.message, s.offline, load.retry)
                is Load.Ready -> Details(shop, s.data, snack, onOpenProduct, onOpenBrand) { msg -> scope.launch { snack.showSnackbar(msg) } }
            }
            // Sale countdown for products that are on sale: small, left side, just above the bottom bar.
            if (sale != null && saleLeft > 0 && (load.state as? Load.Ready)?.data?.salePrice != null)
                SaleChip(saleLeft, Modifier.align(Alignment.BottomStart).padding(start = 16.dp, bottom = 88.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Details(shop: ShopViewModel, p: Product, snack: SnackbarHostState, onOpenProduct: (String) -> Unit, onOpenBrand: (String) -> Unit, say: (String) -> Unit) {
    var size by remember(p.id) { mutableStateOf(p.sizes.singleOrNull()) }
    var color by remember(p.id) { mutableStateOf(p.colors.singleOrNull()) }
    var qty by remember(p.id) { mutableIntStateOf(1) }
    val variant = p.variantFor(size, color)
    val maxQty = ((variant?.stock ?: 0)).coerceAtMost(10)
    val pages = p.images.size.coerceAtLeast(1) + (if (p.videoUrl != null) 1 else 0)      // photos first, the video is the last swipe
    val pager = rememberPagerState { pages }
    var buttonCenter by remember { mutableStateOf(Offset.Zero) }
    var viewer by remember { mutableStateOf<Int?>(null) }                       // photo being zoomed full screen
    val photoUrls = remember(p.id) { p.images.mapNotNull { it.url } }
    viewer?.let { ImageViewerDialog(photoUrls, it, p.name) { viewer = null } }

    val needsChoice = (p.sizes.isNotEmpty() && size == null) || (p.colors.isNotEmpty() && color == null)
    Column(Modifier.fillMaxSize()) {
    Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(bottom = 16.dp)) {
        Box {
            var ratio by remember(p.id) { mutableStateOf(0.67f) }   // the first photo's own shape: whole photo, no side bars
            HorizontalPager(pager, Modifier.fillMaxWidth().aspectRatio(ratio)) { i ->
                if (p.videoUrl != null && i == p.images.size.coerceAtLeast(1)) Box(Modifier.fillMaxSize().background(TS.Black)) { com.talhastudio.app.ui.components.VideoPlayer(p.videoUrl, Modifier.fillMaxSize(), autoplay = true, muted = true, loop = true, controls = true, fit = true, play = pager.currentPage == i) }
                else ImageTile(p.images.getOrNull(i)?.url, p.name,
                    Modifier.fillMaxSize().then(if (photoUrls.isNotEmpty()) Modifier.clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { viewer = i } else Modifier),
                    ContentScale.Fit, onRatio = if (i == 0) ({ r: Float -> ratio = r.coerceIn(0.5f, 1.1f) }) else null)
            }
            if (photoUrls.isNotEmpty() && !(p.videoUrl != null && pager.currentPage == p.images.size.coerceAtLeast(1))) Row(
                Modifier.align(Alignment.BottomStart).padding(12.dp).clip(RoundedCornerShape(50)).background(TS.Black.copy(0.7f)).padding(horizontal = 10.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Icon(Icons.Outlined.ZoomIn, null, tint = TS.Gold, modifier = Modifier.size(16.dp))
                Text("Tap to zoom", style = MaterialTheme.typography.labelSmall, color = TS.Ivory)
            }
            if (pages > 1) Text("${pager.currentPage + 1}/$pages", style = MaterialTheme.typography.labelSmall, color = TS.Ivory,
                modifier = Modifier.align(Alignment.BottomEnd).padding(12.dp).clip(RoundedCornerShape(50)).background(TS.Black.copy(0.7f)).padding(horizontal = 10.dp, vertical = 4.dp))
        }
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(p.name, style = MaterialTheme.typography.headlineMedium)
            p.brand?.let { b -> Row(Modifier.clip(RoundedCornerShape(50)).clickable { onOpenBrand(b.slug) }.background(TS.Neutral.copy(alpha = 0.6f)).padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Sold by ", style = MaterialTheme.typography.labelLarge, color = TS.Gray)
                Text(b.name, style = MaterialTheme.typography.labelLarge, color = TS.Black)
                Text("  \u203A", style = MaterialTheme.typography.labelLarge, color = TS.Gold)
            } }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PriceText(p)
                p.discountPercent?.let { SaleBadge(it) }
            }
            p.fabric?.let { Text("Fabric: $it", style = MaterialTheme.typography.bodyMedium, color = TS.Gray) }

            if (p.colors.isNotEmpty()) { Text("Color", style = MaterialTheme.typography.titleMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { p.colors.forEach { c ->
                    val any = p.variants.any { it.color == c && it.stock > 0 }
                    FilterChip(color == c, { color = c; qty = 1 }, { Text(c) }, enabled = any, colors = chipColors()) } } }
            if (p.sizes.isNotEmpty()) { Text("Size", style = MaterialTheme.typography.titleMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { p.sizes.forEach { s ->
                    val any = p.variants.any { it.size == s && (color == null || it.color == color) && it.stock > 0 }
                    FilterChip(size == s, { size = s; qty = 1 }, { Text(s) }, enabled = any, colors = chipColors()) } } }

            when {
                !p.inStock -> Text("Out of stock", color = TS.Danger, style = MaterialTheme.typography.labelLarge)
                needsChoice -> Text("Select " + listOfNotNull("a color".takeIf { p.colors.isNotEmpty() && color == null }, "a size".takeIf { p.sizes.isNotEmpty() && size == null }).joinToString(" and "), color = TS.Gray, style = MaterialTheme.typography.bodyMedium)
                variant == null || variant.stock == 0 -> Text("This combination is out of stock", color = TS.Danger, style = MaterialTheme.typography.labelLarge)
                variant.stock <= 5 -> Text("Only ${variant.stock} left", color = TS.Danger, style = MaterialTheme.typography.labelLarge)
                else -> Text("In stock", color = TS.Success, style = MaterialTheme.typography.labelLarge)
            }
            if (variant != null && variant.stock > 0) Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Quantity", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                IconButton({ if (qty > 1) qty-- }, enabled = qty > 1) { Icon(Icons.Outlined.Remove, "Decrease quantity") }
                Text("$qty", Modifier.widthIn(min = 28.dp), style = MaterialTheme.typography.titleMedium)
                IconButton({ if (qty < maxQty) qty++ }, enabled = qty < maxQty) { Icon(Icons.Outlined.Add, "Increase quantity") }
            }
            if (p.description.isNotBlank()) { Text("Description", style = MaterialTheme.typography.titleMedium); Text(p.description, style = MaterialTheme.typography.bodyLarge) }
        }
        if (p.related.isNotEmpty()) { SectionHeader("You may also like"); Spacer(Modifier.height(12.dp)); ProductRow(shop, p.related, onOpenProduct) }
    }
    // Fixed bar at the bottom (replaces the tab bar on this screen): the Add to Cart button is always in reach.
    Surface(Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surface, shadowElevation = 12.dp) {
        Column(Modifier.navigationBarsPadding().padding(horizontal = 20.dp, vertical = 12.dp)) {
            Box(Modifier.onGloballyPositioned { c -> val o = c.positionInRoot(); buttonCenter = Offset(o.x + c.size.width / 2f, o.y + c.size.height / 2f) }) {
                TsButton("Add to Cart", style = TsButtonStyle.Black, enabled = p.inStock, onClick = {
                    when {
                        needsChoice -> say("Please choose " + listOfNotNull("a color".takeIf { p.colors.isNotEmpty() && color == null }, "a size".takeIf { p.sizes.isNotEmpty() && size == null }).joinToString(" and ") + ".")
                        variant == null || variant.stock == 0 -> say("That combination is out of stock.")
                        // The picture flies into the cart tab, then the cart opens (see FlyToCartOverlay).
                        shop.addToCart(p, variant, qty) -> { shop.flyEvent = FlyEvent(p.images.firstOrNull()?.url ?: p.thumbUrl, p.name, buttonCenter.x, buttonCenter.y) }
                        else -> say("Added the maximum available (${variant.stock}).")
                    }
                })
            }
        }
    }
    }
}

@Composable
private fun chipColors() = FilterChipDefaults.filterChipColors(selectedContainerColor = TS.Black, selectedLabelColor = TS.Ivory)
