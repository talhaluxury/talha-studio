package com.talhastudio.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.talhastudio.app.QuoteState
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.*
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch
import java.util.UUID

private val PHONE = Regex("^\\+?[0-9 \\-]{7,16}$")
private val EMAIL = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

fun validateCheckout(f: CheckoutForm): Map<String, String> = buildMap {
    if (f.name.trim().length < 2) put("name", "Enter the recipient's full name")
    if (!EMAIL.matches(f.email.trim())) put("email", "Enter a valid email")
    if (!PHONE.matches(f.phone.trim())) put("phone", "Enter a valid phone number")
    if (f.line1.trim().length < 3) put("line1", "Enter the street address")
    if (f.city.trim().length < 2) put("city", "Enter the city")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutScreen(shop: ShopViewModel, onBack: () -> Unit, onPlaced: (orderId: String) -> Unit) {
    val user = Session.user
    val saved = rememberLoad("addresses") { runCatching { Repo.addresses() }.getOrDefault(emptyList()) }
    var form by remember { mutableStateOf(CheckoutForm(user?.fullName.orEmpty(), user?.email.orEmpty().takeUnless { it.endsWith(".invalid") }.orEmpty(), user?.phone.orEmpty(), "", "", "", "", "", "")) }
    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var saveAddress by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { shop.refreshQuote() }

    // One key per cart contents: a retry after a dropped connection can never create a second order.
    val cartSignature = shop.cart.joinToString { "${it.variantId}x${it.qty}" } + "|" + shop.couponCode
    val idempotencyKey = remember(cartSignature) { UUID.randomUUID().toString().replace("-", "") }
    val q = shop.quote
    val ready = (q as? QuoteState.Ready)?.quote
    val canOrder = ready != null && ready.issues.isEmpty() && ready.items.isNotEmpty() && !busy

    Scaffold(topBar = { TopAppBar(title = { Text("Checkout") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } }) }) { pad ->
        Column(Modifier.padding(pad).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).imePadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val addrs = (saved.state as? Load.Ready)?.data.orEmpty()
            if (addrs.isNotEmpty()) {
                Text("Saved addresses", style = MaterialTheme.typography.titleMedium)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    addrs.take(3).forEach { a -> AssistChip({ form = form.copy(name = a.recipient, phone = a.phone, line1 = a.line1, line2 = a.line2.orEmpty(), city = a.city, province = a.province.orEmpty(), postalCode = a.postalCode.orEmpty()); saveAddress = false },
                        { Text(a.label ?: a.city) }) }
                }
            }
            Text("Delivery details", style = MaterialTheme.typography.titleMedium)
            Field("Full name", form.name, { form = form.copy(name = it) }, errors["name"])
            Field("Phone", form.phone, { form = form.copy(phone = it.take(16)) }, errors["phone"], KeyboardType.Phone)
            Field("Email (for your order confirmation)", form.email, { form = form.copy(email = it) }, errors["email"], KeyboardType.Email)
            Field("Street address", form.line1, { form = form.copy(line1 = it) }, errors["line1"])
            Field("Apartment, landmark (optional)", form.line2, { form = form.copy(line2 = it) })
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Field("City", form.city, { form = form.copy(city = it) }, errors["city"], modifier = Modifier.weight(1f))
                Field("Province", form.province, { form = form.copy(province = it) }, modifier = Modifier.weight(1f))
            }
            Field("Postal code (optional)", form.postalCode, { form = form.copy(postalCode = it.take(12)) }, type = KeyboardType.Number)
            Field("Note for the courier (optional)", form.notes, { form = form.copy(notes = it.take(300)) }, minLines = 2)
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { Checkbox(saveAddress, { saveAddress = it }); Text("Save this address for next time") }

            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Order summary", style = MaterialTheme.typography.titleMedium)
                shop.cart.forEach { l -> Row { Text("${l.qty} x ${l.name}", Modifier.weight(1f), maxLines = 1); Text(pkr(l.unitPrice * l.qty)) } }
                HorizontalDivider()
                when (q) {
                    is QuoteState.Ready -> {
                        Row { Text("Subtotal", Modifier.weight(1f)); Text(pkr(q.quote.subtotal)) }
                        if (q.quote.discount > 0) Row { Text("Discount (${q.quote.couponCode})", Modifier.weight(1f)); Text("- " + pkr(q.quote.discount), color = TS.Success) }
                        Row { Text("Shipping", Modifier.weight(1f)); Text(if (q.quote.shipping == 0) "Free" else pkr(q.quote.shipping)) }
                        Row { Text("Total", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium); Text(pkr(q.quote.total), style = MaterialTheme.typography.titleMedium) }
                        q.quote.issues.forEach { Text(it.message, color = TS.Danger, style = MaterialTheme.typography.labelSmall) }
                    }
                    is QuoteState.Failed -> Text(q.message, color = TS.Danger)
                    else -> Text("Confirming prices...", color = TS.Gray)
                }
                Text("Payment: Cash on Delivery. Pay the courier when your order arrives.", style = MaterialTheme.typography.labelSmall, color = TS.Gray)
                Text("Returns accepted within 7 days of delivery for unused items.", style = MaterialTheme.typography.labelSmall, color = TS.Gray)
                Text("We will confirm your order on WhatsApp on the phone number above.", style = MaterialTheme.typography.labelSmall, color = TS.Gray)
            }
            failure?.let { Text(it, color = TS.Danger, style = MaterialTheme.typography.bodyMedium) }
            TsButton(if (busy) "Placing order..." else "Place Order" + (ready?.let { " · " + pkr(it.total) } ?: ""), enabled = canOrder, style = TsButtonStyle.Black, onClick = {
                val v = validateCheckout(form); errors = v
                if (v.isNotEmpty()) { failure = "Please fix the highlighted fields."; return@TsButton }
                failure = null; busy = true
                scope.launch {
                    try {
                        val order = Repo.placeOrder(shop.cart.toList(), form, idempotencyKey, shop.couponCode)
                        if (saveAddress) runCatching { Repo.saveAddress(form, isDefault = addrs.isEmpty()) }
                        shop.clearCart(); onPlaced(order.id)
                    } catch (e: ApiException) {
                        failure = e.message
                        errors = e.fields.mapKeys { it.key.substringAfterLast('.').let { k -> if (k == "line1" || k == "city" || k == "name" || k == "phone" || k == "email") k else it.key } }
                        if (e.code == "CART_ISSUES") shop.refreshQuote()
                    } finally { busy = false }
                }
            })
            Spacer(Modifier.height(24.dp))
        }
    }
}
