package com.talhastudio.app.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.ui.components.LiquidBottomBar
import com.talhastudio.app.ui.components.NavItem

private val tabs = listOf(
    NavItem("Home", Icons.Outlined.Home), NavItem("Categories", Icons.Outlined.GridView),
    NavItem("Wishlist", Icons.Outlined.FavoriteBorder), NavItem("Cart", Icons.Outlined.ShoppingBag),
    NavItem("Profile", Icons.Outlined.Person),
)

@Composable
fun MainShell(shop: ShopViewModel, onOpenProduct: (String) -> Unit, onCheckout: () -> Unit, onSignIn: () -> Unit, onOrders: () -> Unit, onAddresses: () -> Unit, onNotifications: () -> Unit, onSupport: () -> Unit, onSettings: () -> Unit, onOpenPage: (String) -> Unit) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var browseCategory by rememberSaveable { mutableStateOf<String?>(null) }
    Scaffold(
        containerColor = androidx.compose.material3.MaterialTheme.colorScheme.background,
        bottomBar = { LiquidBottomBar(tabs, tab, badges = mapOf(3 to shop.cartCount, 2 to shop.wishlist.size), onSelect = { tab = it }) },
    ) { pad ->
        // Bottom bar floats above content, so only apply top inset; screens add their own bottom padding.
        Box(Modifier.fillMaxSize().padding(top = pad.calculateTopPadding())) {
            AnimatedContent(tab, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "tab") { t ->
                when (t) {
                    0 -> HomeScreen(shop, onOpenProduct, onBrowse = { browseCategory = it; tab = 1 }, onNotifications = onNotifications, onSupport = onSupport, onOpenPage = onOpenPage)
                    1 -> CategoriesScreen(shop, browseCategory, onOpenProduct)
                    2 -> WishlistScreen(shop, onOpenProduct, goShop = { tab = 0 })
                    3 -> CartScreen(shop, goShop = { tab = 0 }, onCheckout = onCheckout)
                    else -> ProfileScreen(onSignIn, onOrders, onAddresses, onNotifications, onSupport, onSettings, onOpenPage)
                }
            }
        }
    }
}
