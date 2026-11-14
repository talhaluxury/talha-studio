package com.talhastudio.app.ui.nav

import android.content.Intent
import androidx.activity.ComponentActivity
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.util.Consumer
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.LocalStore
import com.talhastudio.app.data.Session
import com.talhastudio.app.push.PushTokens
import com.talhastudio.app.push.normalizeDeepLink
import com.talhastudio.app.ui.components.FlyToCartOverlay
import com.talhastudio.app.ui.components.LiquidBottomBar
import com.talhastudio.app.ui.components.SaleBar
import com.talhastudio.app.ui.components.rememberSaleRemaining
import com.talhastudio.app.ui.components.TsButton
import com.talhastudio.app.ui.screens.*

object Routes {
    const val Splash = "splash"
    const val Onboarding = "onboarding"
    const val Bonus = "bonus"
    const val Wallet = "wallet"
    const val Main = "main"
    const val Product = "product/{id}"
    fun product(id: String) = "product/$id"
    const val Auth = "auth?next={next}"
    fun auth(next: String = "") = "auth?next=$next"
    const val Checkout = "checkout"
    const val Confirmation = "confirmation/{id}"
    const val Orders = "orders"
    const val Order = "order/{id}"
    const val Addresses = "addresses"
    const val Notifications = "notifications"
    const val Support = "support"
    const val Settings = "settings"
    const val Chat = "chat"
    const val PhoneAuth = "phone_auth"
    const val PhoneSignIn = "phone_signin?next={next}"
    fun phoneSignIn(next: String = "") = "phone_signin?next=$next"
    const val Brands = "brands"
    const val Brand = "brand/{slug}"
    fun brand(slug: String) = "brand/$slug"
    const val Seller = "seller"
    const val Info = "info/{slug}"
    fun info(slug: String) = "info/$slug"
}

private val barRoutes = setOf(Routes.Main, Routes.Confirmation, Routes.Orders, Routes.Order, Routes.Addresses, Routes.Notifications, Routes.Support, Routes.Settings, Routes.Info, Routes.Brands, Routes.Brand, Routes.Seller)

/** [startOnMain] is true when the app was opened from a notification: skip the splash and land inside the app. */
@Composable
fun TalhaNavHost(startOnMain: Boolean = false) {
    val nav = rememberNavController()
    val shop: ShopViewModel = viewModel()
    val ctx = LocalContext.current
    val local = remember { LocalStore(ctx.applicationContext) }

    // Android 13+: ask once for permission to show notifications on the phone (the Notifications screen can ask again).
    val askNotif = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { }
    val route = nav.currentBackStackEntryAsState().value?.destination?.route
    LaunchedEffect(route) {
        if (route == Routes.Main && android.os.Build.VERSION.SDK_INT >= 33 && !com.talhastudio.app.push.notificationsAllowed(ctx) && !local.askedNotifications()) {
            local.setAskedNotifications(); askNotif.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    // A notification tapped while the app is already open arrives here.
    val activity = ctx as? ComponentActivity
    DisposableEffect(nav, activity) {
        val l = Consumer<Intent> { i -> normalizeDeepLink(i); nav.handleDeepLink(i) }
        activity?.addOnNewIntentListener(l); onDispose { activity?.removeOnNewIntentListener(l) }
    }
    // After sign-in (or app start while signed in): register this phone for push and refresh the bell.
    LaunchedEffect(Session.user?.id) { if (Session.signedIn) { PushTokens.sync(); shop.refreshUnread() } }

    // The bottom bar is on every normal screen (not on splash, welcome, sign-in, chat and checkout). Tapping a tab goes back to the main screen on that tab.
    val showBar = route != null && route in barRoutes
    val barSpace by animateDpAsState(if (showBar && route != Routes.Main) 88.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() else 0.dp, label = "barSpace")
    fun goTab(i: Int) { shop.currentTab = i; if (route != Routes.Main && !nav.popBackStack(Routes.Main, false)) nav.navigate(Routes.Main) }

    Box(Modifier.fillMaxSize()) {
    // Screens other than the main one stop above the bar (the main screen floats its content under it on purpose).
    NavHost(nav, startDestination = if (startOnMain) Routes.Main else Routes.Splash,
        modifier = Modifier.padding(bottom = barSpace).consumeWindowInsets(WindowInsets.navigationBars)) {
        composable(Routes.Splash) {
            SplashScreen(onDone = {
                nav.navigate(if (!local.onboarded()) Routes.Onboarding else Routes.Main) { popUpTo(Routes.Splash) { inclusive = true } }
            })
        }
        composable(Routes.Onboarding) {
            OnboardingScreen(onStart = {
                local.setOnboarded()
                nav.navigate(Routes.Main) { popUpTo(Routes.Onboarding) { inclusive = true } }
            })
        }
        composable(Routes.Wallet) { if (Session.signedIn) WalletScreen(onBack = { nav.popBackStack() }) else LaunchedEffect(Unit) { nav.navigate(Routes.auth()) } }
        composable(Routes.Main) {
            MainShell(shop, onOpenProduct = { nav.navigate(Routes.product(it)) },
                onCheckout = { if (Session.signedIn) nav.navigate(Routes.Checkout) else nav.navigate(Routes.auth("checkout")) },
                onSignIn = { nav.navigate(Routes.auth()) },
                onOrders = { nav.navigate(Routes.Orders) }, onAddresses = { nav.navigate(Routes.Addresses) },
                onNotifications = { if (Session.signedIn) nav.navigate(Routes.Notifications) else nav.navigate(Routes.auth()) },
                onUpdates = { nav.navigate(if (Session.signedIn) Routes.Chat else Routes.PhoneAuth) },
                onSupport = { nav.navigate(Routes.Support) }, onSettings = { nav.navigate(Routes.Settings) }, onOpenPage = { nav.navigate(Routes.info(it)) },
                onOpenBrand = { nav.navigate(Routes.brand(it)) }, onAllBrands = { nav.navigate(Routes.Brands) },
                onSeller = { if (Session.signedIn) nav.navigate(Routes.Seller) else nav.navigate(Routes.auth()) },
                onWallet = { nav.navigate(Routes.Wallet) })
        }
        composable(Routes.Brands) { AllBrandsScreen(onBack = { nav.popBackStack() }, onOpen = { nav.navigate(Routes.brand(it)) }) }
        composable(Routes.Brand, deepLinks = listOf(navDeepLink { uriPattern = "talhastudio://brand/{slug}" })) { entry ->
            BrandScreen(shop, entry.arguments?.getString("slug").orEmpty(), onBack = { if (!nav.popBackStack()) nav.navigate(Routes.Main) }, onOpenProduct = { nav.navigate(Routes.product(it)) })
        }
        composable(Routes.Seller, deepLinks = listOf(navDeepLink { uriPattern = "talhastudio://seller" })) {
            if (Session.signedIn) SellerScreen(shop, onBack = { if (!nav.popBackStack()) nav.navigate(Routes.Main) })
            else SignInRequired(onBack = { nav.popBackStack() }) { nav.navigate(Routes.auth()) }
        }
        composable(Routes.Product, deepLinks = listOf(navDeepLink { uriPattern = "talhastudio://product/{id}" })) { entry ->
            val id = entry.arguments?.getString("id").orEmpty()
            ProductDetailScreen(shop, id, onBack = { nav.popBackStack() }, onOpenProduct = { nav.navigate(Routes.product(it)) }, onOpenBrand = { nav.navigate(Routes.brand(it)) })
        }
        composable(Routes.Auth, arguments = listOf(navArgument("next") { type = NavType.StringType; defaultValue = "" })) { entry ->
            val next = entry.arguments?.getString("next").orEmpty()
            val finished = { if (next == "checkout") nav.navigate(Routes.Checkout) { popUpTo(Routes.Main) } else { nav.popBackStack(); Unit } }
            // Sign-in happens only when the customer asks for it (profile) or needs it (buying). While the sign-up bonus is on, the bonus sign-in comes first;
            // "Other sign-in options" opens the normal email / phone screen.
            var other by rememberSaveable { mutableStateOf(false) }
            if (!other) BonusScreen(onDone = { finished() }, onOther = { other = true }, onBack = { nav.popBackStack() })
            else AuthScreen(onBack = { nav.popBackStack() }, onDone = { finished() }, onPhone = { nav.navigate(Routes.phoneSignIn(next)) })
        }
        // Sign in / sign up with a mobile number (for shopping; the chat sign-in above opens the chat afterwards).
        composable(Routes.PhoneSignIn, arguments = listOf(navArgument("next") { type = NavType.StringType; defaultValue = "" })) { entry ->
            val next = entry.arguments?.getString("next").orEmpty()
            PhoneAuthScreen(openChat = false, onBack = { nav.popBackStack() }, onDone = {
                if (next == "checkout") nav.navigate(Routes.Checkout) { popUpTo(Routes.Main) } else nav.popBackStack(Routes.Main, false)
            })
        }
        composable(Routes.Checkout) {
            if (!Session.signedIn) { LaunchedEffect(Unit) { nav.popBackStack() } } else
            CheckoutScreen(shop, onBack = { nav.popBackStack() }, onPlaced = { id -> nav.navigate("confirmation/$id") { popUpTo(Routes.Main) } })
        }
        composable(Routes.Confirmation) { entry ->
            val id = entry.arguments?.getString("id").orEmpty()
            OrderConfirmationScreen(id, onContinue = { nav.popBackStack(Routes.Main, false) }, onViewOrder = { nav.navigate("order/$id") { popUpTo(Routes.Main) } })
        }
        composable(Routes.Orders) { if (Session.signedIn) OrdersScreen(onBack = { nav.popBackStack() }, onOpen = { nav.navigate("order/$it") }) else SignInRequired(onBack = { nav.popBackStack() }) { nav.navigate(Routes.auth()) } }
        composable(Routes.Order, deepLinks = listOf(navDeepLink { uriPattern = "talhastudio://order/{id}" })) { entry ->
            if (Session.signedIn) OrderDetailScreen(entry.arguments?.getString("id").orEmpty(), onBack = { nav.popBackStack() })
            else SignInRequired(onBack = { nav.popBackStack() }) { nav.navigate(Routes.auth()) }
        }
        composable(Routes.Addresses) { AddressesScreen(onBack = { nav.popBackStack() }) }
        composable(Routes.Support) { SupportScreen(onBack = { nav.popBackStack() }, onOpenPage = { nav.navigate(Routes.info(it)) }) }
        composable(Routes.Info) { entry -> InfoPageScreen(entry.arguments?.getString("slug").orEmpty(), onBack = { nav.popBackStack() }) }
        composable(Routes.Settings) {
            SettingsScreen(onBack = { nav.popBackStack() }, onNotifications = { if (Session.signedIn) nav.navigate(Routes.Notifications) else nav.navigate(Routes.auth()) },
                onOpenPage = { nav.navigate(Routes.info(it)) }, onSignedOut = { nav.popBackStack(Routes.Main, false) })
        }
        composable(Routes.PhoneAuth) {
            PhoneAuthScreen(onBack = { nav.popBackStack() }, onDone = { nav.navigate(Routes.Chat) { popUpTo(Routes.PhoneAuth) { inclusive = true } } })
        }
        composable(Routes.Chat, deepLinks = listOf(navDeepLink { uriPattern = "talhastudio://chat" })) {
            // Signed out (or the session expired while chatting): sign in with a number first, then come back here.
            if (!Session.signedIn) LaunchedEffect(Unit) { nav.navigate(Routes.PhoneAuth) { popUpTo(Routes.Chat) { inclusive = true } } }
            else ChatScreen(shop, onBack = { if (!nav.popBackStack()) nav.navigate(Routes.Main) })
        }
        composable(Routes.Notifications) {
            if (Session.signedIn) NotificationsScreen(shop, onBack = { nav.popBackStack() }, onNavigate = { route -> nav.navigate(route) })
            else SignInRequired(onBack = { nav.popBackStack() }) { nav.navigate(Routes.auth()) }
        }
    }
    // Sale timer: a small bar right above the bottom bar on the main tabs (not on the Cart tab, where the customer is about to pay); tapping it lists every item on sale. It vanishes when the time is up.
    val sale = shop.sale
    val saleLeft by rememberSaleRemaining(sale)
    LaunchedEffect(sale, saleLeft) { if (sale != null && saleLeft <= 0L) shop.refreshSale() }      // time is up: ask the server (the owner may have started a new sale)
    AnimatedVisibility(showBar, Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
        enter = slideInVertically { it } + fadeIn(), exit = slideOutVertically { it } + fadeOut()) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            if (route == Routes.Main && shop.currentTab != 3 && sale != null && saleLeft > 0) SaleBar(sale, saleLeft, onClick = { shop.browseRequest = "@sale|On Sale" })
            LiquidBottomBar(shellTabs, shop.currentTab, badges = mapOf(3 to shop.cartCount, 2 to shop.wishlist.size), onSelect = { goTab(it) }, pulseIndex = 3, pulse = shop.cartPulse)
        }
    }
    // An item was added to the cart: its picture flies into the cart tab, the icon bounces, then the cart opens.
    FlyToCartOverlay(shop.flyEvent, cartTabIndex = 3, tabCount = shellTabs.size) { shop.flyEvent = null; shop.cartPulse++; goTab(3) }
    // The floating AI assistant sits above every normal screen (not on splash, welcome, sign-in, chat or checkout) and can be dragged anywhere.
    AssistantOverlay(visible = route != null && route !in setOf(Routes.Splash, Routes.Onboarding, Routes.Bonus, Routes.Auth, Routes.PhoneAuth, Routes.PhoneSignIn, Routes.Chat, Routes.Checkout)) { a ->
        when (a.type) {
            "product" -> a.id?.let { nav.navigate(Routes.product(it)) }
            "cart" -> { shop.requestedTab = 3; nav.popBackStack(Routes.Main, false) }
            "orders" -> nav.navigate(if (Session.signedIn) Routes.Orders else Routes.auth())
            "chat" -> nav.navigate(if (Session.signedIn) Routes.Chat else Routes.PhoneAuth)
        }
    }
    }
}

@Composable
private fun SignInRequired(onBack: () -> Unit, onSignIn: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text("Please sign in to continue")
        Spacer(Modifier.height(16.dp)); TsButton("Sign in", onSignIn); Spacer(Modifier.height(8.dp)); TsButton("Back", onBack, style = com.talhastudio.app.ui.components.TsButtonStyle.Outline)
    }
}
