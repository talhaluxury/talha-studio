package com.talhastudio.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.*
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch

/** Where the seller is inside the seller area. Everything stays in one screen so the system back button simply goes one step up. */
private sealed interface Sub {
    data object Tabs : Sub
    data class Product(val id: String?) : Sub
    data class Order(val id: String) : Sub
    data object Preview : Sub
}

/** The first field message the server sent (for example "Enter a valid phone number"), otherwise its general message. */
internal fun ApiException.pretty(): String = fields.values.firstOrNull() ?: (message ?: "Something went wrong")

@Composable
internal fun Panel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surface)
        .border(1.dp, TS.Gold.copy(alpha = 0.25f), RoundedCornerShape(20.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
}

@Composable
internal fun SellerTopBar(title: String, subtitle: String? = null, onBack: () -> Unit) {
    Row(Modifier.padding(horizontal = 4.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") }
        Column {
            Text(title, style = MaterialTheme.typography.titleLarge, fontFamily = DisplayFont)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.labelMedium, color = TS.Gray)
        }
    }
}

/**
 * Profile → Seller account. Everything a brand does happens here in the app: apply, wait for approval, build the brand page,
 * add products and see the orders. The same account the customer already signed in with is the seller account.
 */
@Composable
fun SellerScreen(shop: ShopViewModel, onBack: () -> Unit) {
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var brand by remember { mutableStateOf<SellerBrand?>(null) }
    var loaded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<ApiException?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    var sub by remember { mutableStateOf<Sub>(Sub.Tabs) }
    val say: (String) -> Unit = { m -> scope.launch { snack.showSnackbar(m) } }

    LaunchedEffect(attempt) {
        loaded = false; error = null
        try { brand = Repo.sellerMe(); loaded = true } catch (e: ApiException) { error = e }
    }
    BackHandler(sub != Sub.Tabs) { sub = Sub.Tabs }

    Scaffold(snackbarHost = { SnackbarHost(snack) }, containerColor = MaterialTheme.colorScheme.background) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            val b = brand
            val err = error
            when {
                err != null -> Column { SellerTopBar("Seller account", null, onBack); ErrorState(err.pretty(), err.offline, { attempt++ }) }
                !loaded -> Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SkeletonBox(Modifier.fillMaxWidth().height(40.dp)); SkeletonBox(Modifier.fillMaxWidth().height(160.dp)); SkeletonBox(Modifier.fillMaxWidth().height(160.dp))
                }
                b == null -> SellerApply(again = false, prefill = null, onBack = onBack, onDone = { brand = it }, say = say)
                b.status == "active" -> SellerDashboard(shop, b, sub, { sub = it }, { brand = it }, onBack, say)
                else -> SellerStatus(b, onBack, onDone = { brand = it }, say = say)
            }
        }
    }
}

/** The application form (also used to apply again after a rejection). */
@Composable
private fun SellerApply(again: Boolean, prefill: SellerBrand?, onBack: () -> Unit, onDone: (SellerBrand) -> Unit, say: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(prefill?.draft?.name.orEmpty()) }
    var phone by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var busy by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding()) {
        SellerTopBar(if (again) "Apply again" else "Become a seller", null, onBack)
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Panel {
                Text("Sell your brand on Talha Studio", style = MaterialTheme.typography.titleMedium, fontFamily = DisplayFont)
                Text("Tell us about your brand. After we approve your account you can build your own brand page with your logo and products, and see every order here in the app.",
                    style = MaterialTheme.typography.bodyMedium, color = TS.Gray)
            }
            Field("Brand name", name, { name = it }, errors["name"])
            Field("Phone number", phone, { phone = it }, errors["contactPhone"], KeyboardType.Phone)
            Field("City", city, { city = it }, errors["city"])
            Field("What do you sell? (optional)", note, { note = it }, errors["businessNote"], minLines = 3)
            TsButton(if (busy) "Sending..." else "Send application", enabled = !busy, onClick = {
                busy = true; errors = emptyMap()
                scope.launch {
                    try { onDone(Repo.sellerApply(name.trim(), phone.trim(), city.trim(), note.trim(), again)); say("Application sent") }
                    catch (e: ApiException) { errors = e.fields; say(e.pretty()) } finally { busy = false }
                }
            })
        }
    }
}

/** Account is not active: waiting for approval, turned down, or suspended. */
@Composable
private fun SellerStatus(b: SellerBrand, onBack: () -> Unit, onDone: (SellerBrand) -> Unit, say: (String) -> Unit) {
    var applyAgain by remember { mutableStateOf(false) }
    if (applyAgain) { SellerApply(again = true, prefill = b, onBack = { applyAgain = false }, onDone = onDone, say = say); return }
    val (title, text) = when (b.status) {
        "pending" -> "Application under review" to "We are checking ${b.draft.name}. You will get a notification as soon as your account is approved."
        "rejected" -> "Application not approved" to (b.statusNote ?: "Please check your details and apply again.")
        else -> "Account suspended" to (b.statusNote ?: "Your brand page is hidden for now. Please contact support.")
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        SellerTopBar("Seller account", b.draft.name, onBack)
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Panel { Text(title, style = MaterialTheme.typography.titleLarge, fontFamily = DisplayFont); Text(text, style = MaterialTheme.typography.bodyMedium, color = TS.Gray) }
            if (b.status == "rejected") TsButton("Apply again", { applyAgain = true })
        }
    }
}

/** The approved seller's area: Page, Products and Orders. */
@Composable
private fun SellerDashboard(shop: ShopViewModel, brand: SellerBrand, sub: Sub, setSub: (Sub) -> Unit, onBrand: (SellerBrand) -> Unit, onBack: () -> Unit, say: (String) -> Unit) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var products by remember { mutableStateOf<List<SellerProduct>?>(null) }
    var productsError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val refreshProducts: () -> Unit = {
        scope.launch { try { products = Repo.sellerProducts(); productsError = null } catch (e: ApiException) { productsError = e.pretty() } }
    }
    LaunchedEffect(Unit) { refreshProducts() }

    when (val s = sub) {
        is Sub.Product -> SellerProductForm(s.id, onBack = { setSub(Sub.Tabs) }, onSaved = { refreshProducts(); setSub(Sub.Tabs) }, onChanged = refreshProducts, say = say)
        is Sub.Order -> SellerOrderDetail(s.id, onBack = { setSub(Sub.Tabs) })
        Sub.Preview -> Box(Modifier.fillMaxSize()) {
            BrandPageContent(shop, brand.previewPage(products.orEmpty()), onOpenProduct = {})
            Row(Modifier.align(Alignment.TopStart).padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton({ setSub(Sub.Tabs) }, Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.55f))) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Close preview", tint = Color.White) }
                Text("  Preview of your draft", color = Color.White, style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.55f)).padding(horizontal = 12.dp, vertical = 6.dp))
            }
        }
        Sub.Tabs -> Column(Modifier.fillMaxSize()) {
            SellerTopBar("Seller dashboard", brand.draft.name, onBack)
            TabRow(selectedTabIndex = tab, containerColor = Color.Transparent, contentColor = TS.Gold) {
                listOf("Page", "Products", "Orders").forEachIndexed { i, t -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t) }) }
            }
            when (tab) {
                0 -> SellerPageTab(brand, products.orEmpty(), onBrand, onPreview = { setSub(Sub.Preview) }, say = say)
                1 -> SellerProductsTab(products, productsError, onAdd = { setSub(Sub.Product(null)) }, onOpen = { setSub(Sub.Product(it)) }, onRetry = refreshProducts)
                else -> SellerOrdersTab(onOpen = { setSub(Sub.Order(it)) })
            }
        }
    }
}
