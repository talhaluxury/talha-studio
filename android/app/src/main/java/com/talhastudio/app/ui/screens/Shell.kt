package com.talhastudio.app.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.ui.components.NavItem

/** The five tabs. The bar itself is drawn by the nav host so it shows on every screen. */
internal val shellTabs = listOf(
    NavItem("Home", Icons.Outlined.Home), NavItem("Categories", Icons.Outlined.GridView),
    NavItem("Wishlist", Icons.Outlined.FavoriteBorder), NavItem("Cart", Icons.Outlined.ShoppingBag),
    NavItem("Profile", Icons.Outlined.Person),
)

@Composable
fun MainShell(shop: ShopViewModel, onOpenProduct: (String) -> Unit, onCheckout: () -> Unit, onSignIn: () -> Unit, onOrders: () -> Unit, onAddresses: () -> Unit, onNotifications: () -> Unit, onUpdates: () -> Unit, onSupport: () -> Unit, onSettings: () -> Unit, onOpenPage: (String) -> Unit) {
    val tab = shop.currentTab
    var browseCategory by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(shop.requestedTab) { shop.requestedTab?.let { shop.currentTab = it; shop.requestedTab = null } }
    Scaffold(
        containerColor = androidx.compose.material3.MaterialTheme.colorScheme.background,
    ) { pad ->
        // Bottom bar floats above content, so only apply top inset; screens add their own bottom padding.
        Box(Modifier.fillMaxSize().padding(top = pad.calculateTopPadding())) {
            AnimatedContent(tab, transitionSpec = {
                val dir = if (targetState > initialState) 1 else -1     // new tab slides in from the side it sits on
                (slideInHorizontally { it / 3 * dir } + fadeIn() + scaleIn(initialScale = 0.92f)) togetherWith (slideOutHorizontally { -it / 3 * dir } + fadeOut() + scaleOut(targetScale = 0.92f))
            }, label = "tab") { t ->
                when (t) {
                    0 -> HomeScreen(shop, onOpenProduct, onBrowse = { browseCategory = it; shop.currentTab = 1 }, onNotifications = onNotifications, onUpdates = onUpdates, onSupport = onSupport, onOpenPage = onOpenPage)
                    1 -> CategoriesScreen(shop, browseCategory, onOpenProduct)
                    2 -> WishlistScreen(shop, onOpenProduct, goShop = { shop.currentTab = 0 })
                    3 -> CartScreen(shop, goShop = { shop.currentTab = 0 }, onCheckout = onCheckout)
                    else -> ProfileScreen(onSignIn, onOrders, onAddresses, onNotifications, onSupport, onSettings, onOpenPage)
                }
            }
        }
    }
}
