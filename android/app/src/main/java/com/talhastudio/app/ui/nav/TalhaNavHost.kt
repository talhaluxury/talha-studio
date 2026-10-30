package com.talhastudio.app.ui.nav

import android.content.Intent
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
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
import com.talhastudio.app.ui.components.TsButton
import com.talhastudio.app.ui.screens.*

object Routes {
    const val Splash = "splash"
    const val Onboarding = "onboarding"
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
    const val Info = "info/{slug}"
    fun info(slug: String) = "info/$slug"
}

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

    Box(Modifier.fillMaxSize()) {
    NavHost(nav, startDestination = if (startOnMain) Routes.Main else Routes.Splash) {
        composable(Routes.Splash) {
            SplashScreen(onDone = {
                nav.navigate(if (local.onboarded()) Routes.Main else Routes.Onboarding) { popUpTo(Routes.Splash) { inclusive = true } }
            })
        }
        composable(Routes.Onboarding) {
            OnboardingScreen(onStart = {
                local.setOnboarded()
                nav.navigate(Routes.Main) { popUpTo(Routes.Onboarding) { inclusive = true } }
            })
        }
        composable(Routes.Main) {
            MainShell(shop, onOpenProduct = { nav.navigate(Routes.product(it)) },
                onCheckout = { if (Session.signedIn) nav.navigate(Routes.Checkout) else nav.navigate(Routes.auth("checkout")) },
                onSignIn = { nav.navigate(Routes.auth()) },
                onOrders = { nav.navigate(Routes.Orders) }, onAddresses = { nav.navigate(Routes.Addresses) },
                onNotifications = { if (Session.signedIn) nav.navigate(Routes.Notifications) else nav.navigate(Routes.auth()) },
                onUpdates = { nav.navigate(if (Session.signedIn) Routes.Chat else Routes.PhoneAuth) },
                onSupport = { nav.navigate(Routes.Support) }, onSettings = { nav.navigate(Routes.Settings) }, onOpenPage = { nav.navigate(Routes.info(it)) })
        }
        composable(Routes.Product, deepLinks = listOf(navDeepLink { uriPattern = "talhastudio://product/{id}" })) { entry ->
            val id = entry.arguments?.getString("id").orEmpty()
            ProductDetailScreen(shop, id, onBack = { nav.popBackStack() }, onOpenProduct = { nav.navigate(Routes.product(it)) })
        }
        composable(Routes.Auth, arguments = listOf(navArgument("next") { type = NavType.StringType; defaultValue = "" })) { entry ->
            val next = entry.arguments?.getString("next").orEmpty()
            AuthScreen(onBack = { nav.popBackStack() }, onDone = {
                if (next == "checkout") nav.navigate(Routes.Checkout) { popUpTo(Routes.Main) } else nav.popBackStack()
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
    // The floating AI assistant sits above every normal screen (not on splash, welcome, sign-in, chat or checkout) and can be dragged anywhere.
    AssistantOverlay(visible = route != null && route !in setOf(Routes.Splash, Routes.Onboarding, Routes.Auth, Routes.PhoneAuth, Routes.Chat, Routes.Checkout)) { a ->
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
