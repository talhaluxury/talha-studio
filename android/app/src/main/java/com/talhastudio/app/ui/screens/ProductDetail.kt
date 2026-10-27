package com.talhastudio.app.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.Product
import com.talhastudio.app.data.Repo
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ProductDetailScreen(shop: ShopViewModel, id: String, onBack: () -> Unit, onOpenProduct: (String) -> Unit) {
    val load = rememberLoad(id) { Repo.product(id) }
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    LaunchedEffect(id) { shop.markViewed(id) }

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
                is Load.Ready -> Details(shop, s.data, snack, onOpenProduct) { msg -> scope.launch { snack.showSnackbar(msg) } }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Details(shop: ShopViewModel, p: Product, snack: SnackbarHostState, onOpenProduct: (String) -> Unit, say: (String) -> Unit) {
    var size by remember(p.id) { mutableStateOf(p.sizes.singleOrNull()) }
    var color by remember(p.id) { mutableStateOf(p.colors.singleOrNull()) }
    var qty by remember(p.id) { mutableIntStateOf(1) }
    val variant = p.variantFor(size, color)
    val maxQty = ((variant?.stock ?: 0)).coerceAtMost(10)
    val pager = rememberPagerState { p.images.size.coerceAtLeast(1) }

    Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 32.dp)) {
        Box {
            HorizontalPager(pager, Modifier.fillMaxWidth().aspectRatio(0.85f)) { i ->
                ImageTile(p.images.getOrNull(i)?.url, p.name, Modifier.fillMaxSize())
            }
            if (p.images.size > 1) Text("${pager.currentPage + 1}/${p.images.size}", style = MaterialTheme.typography.labelSmall, color = TS.Ivory,
                modifier = Modifier.align(Alignment.BottomEnd).padding(12.dp).clip(RoundedCornerShape(50)).background(TS.Black.copy(0.7f)).padding(horizontal = 10.dp, vertical = 4.dp))
        }
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(p.name, style = MaterialTheme.typography.headlineMedium)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PriceText(p)
                p.discountPercent?.let { Text("$it% OFF", style = MaterialTheme.typography.labelSmall, color = TS.Black, modifier = Modifier.clip(RoundedCornerShape(50)).background(TS.Gold).padding(horizontal = 8.dp, vertical = 3.dp)) }
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

            val needsChoice = (p.sizes.isNotEmpty() && size == null) || (p.colors.isNotEmpty() && color == null)
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
            TsButton("Add to Cart", style = TsButtonStyle.Black, enabled = p.inStock, onClick = {
                when {
                    needsChoice -> say("Please choose " + listOfNotNull("a color".takeIf { p.colors.isNotEmpty() && color == null }, "a size".takeIf { p.sizes.isNotEmpty() && size == null }).joinToString(" and ") + ".")
                    variant == null || variant.stock == 0 -> say("That combination is out of stock.")
                    else -> say(if (shop.addToCart(p, variant, qty)) "Added to cart." else "Added the maximum available (${variant.stock}).")
                }
            })
            if (p.description.isNotBlank()) { Text("Description", style = MaterialTheme.typography.titleMedium); Text(p.description, style = MaterialTheme.typography.bodyLarge) }
        }
        if (p.related.isNotEmpty()) { SectionHeader("You may also like"); Spacer(Modifier.height(12.dp)); ProductRow(shop, p.related, onOpenProduct) }
    }
}

@Composable
private fun chipColors() = FilterChipDefaults.filterChipColors(selectedContainerColor = TS.Black, selectedLabelColor = TS.Ivory)
