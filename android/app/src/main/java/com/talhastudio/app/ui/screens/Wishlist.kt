package com.talhastudio.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.Repo
import com.talhastudio.app.ui.components.*

@Composable
fun WishlistScreen(shop: ShopViewModel, onOpenProduct: (String) -> Unit, goShop: () -> Unit) {
    val ids = shop.wishlist.toList()
    val load = rememberLoad(ids) { Repo.byIds(ids) }
    Column {
        Text("Wishlist", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(20.dp))
        when {
            ids.isEmpty() -> EmptyState("Your wishlist is empty", "Tap the heart on any product to save it.", "Browse Collection", goShop)
            load.state is Load.Loading -> ProductGridSkeleton()
            load.state is Load.Error -> (load.state as Load.Error).let { ErrorState(it.message, it.offline, load.retry) }
            else -> {
                val items = (load.state as Load.Ready).data
                if (items.isEmpty()) EmptyState("Saved items are no longer available", "They may have been removed from the store.")
                else LazyVerticalGrid(GridCells.Fixed(2), contentPadding = PaddingValues(20.dp, 0.dp, 20.dp, 120.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    items(items, key = { it.id }) { p -> ProductCard(p, shop.isWished(p.id), { onOpenProduct(p.id) }, { shop.toggleWishlist(p.id) }) }
                }
            }
        }
    }
}

@Composable
fun EmptyState(title: String, body: String, action: String? = null, onAction: () -> Unit = {}) {
    Column(Modifier.fillMaxWidth().padding(40.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Text(body, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (action != null) { Spacer(Modifier.height(8.dp)); TsButton(action, onAction) }
    }
}
