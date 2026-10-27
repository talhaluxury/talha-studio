package com.talhastudio.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.QuoteState
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch

@Composable
fun CartScreen(shop: ShopViewModel, goShop: () -> Unit, onCheckout: () -> Unit) {
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { shop.refreshQuote() }      // always confirm prices/stock with the server when the cart opens
    val q = shop.quote
    val ready = (q as? QuoteState.Ready)?.quote
    val issues = ready?.issues?.associateBy { it.variantId }.orEmpty()
    val blocked = issues.isNotEmpty() || q !is QuoteState.Ready

    Box(Modifier.fillMaxSize()) {
        Column {
            Text("My Cart", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(20.dp))
            if (shop.cart.isEmpty()) EmptyState("Your cart is empty", "Add something beautiful.", "Start Shopping", goShop)
            else LazyColumn(contentPadding = PaddingValues(20.dp, 0.dp, 20.dp, 140.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(shop.cart, key = { it.variantId }) { line ->
                    val issue = issues[line.variantId]
                    val price = ready?.items?.firstOrNull { it.variantId == line.variantId }?.unitPrice ?: line.unitPrice
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surface).padding(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            ImageTile(line.imageUrl, line.name, Modifier.size(78.dp).clip(RoundedCornerShape(12.dp)))
                            Column(Modifier.weight(1f).padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(line.name, style = MaterialTheme.typography.bodyLarge, maxLines = 2)
                                Text(listOfNotNull(line.color, line.size?.let { "Size $it" }).joinToString(" · "), style = MaterialTheme.typography.labelSmall, color = TS.Gray)
                                Text(pkr(price), style = MaterialTheme.typography.titleMedium)
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    IconButton({ shop.changeQty(line.variantId, -1) }, Modifier.size(36.dp)) { Icon(Icons.Outlined.Remove, "Decrease quantity") }
                                    Text("${line.qty}", Modifier.widthIn(min = 24.dp), style = MaterialTheme.typography.titleMedium)
                                    IconButton({ shop.changeQty(line.variantId, 1) }, Modifier.size(36.dp), enabled = line.qty < line.maxStock) { Icon(Icons.Outlined.Add, "Increase quantity") }
                                }
                            }
                            IconButton({ shop.remove(line.variantId) }) { Icon(Icons.Outlined.Delete, "Remove ${line.name}", tint = TS.Gray) }
                        }
                        if (issue != null) Text(issue.message + ". Update the quantity or remove this item.", style = MaterialTheme.typography.labelSmall, color = TS.Danger, modifier = Modifier.padding(top = 6.dp))
                    }
                }
                item { CouponBox(shop, ready) }
                item {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Price Details", style = MaterialTheme.typography.titleMedium)
                        when (q) {
                            is QuoteState.Ready -> {
                                q.quote.issues.filter { it.variantId == "cart" }.forEach { Text(it.message, color = TS.Danger, style = MaterialTheme.typography.bodyMedium) }
                                Row { Text("Subtotal", Modifier.weight(1f)); Text(pkr(q.quote.subtotal)) }
                                if (q.quote.discount > 0) Row { Text("Discount", Modifier.weight(1f)); Text("- " + pkr(q.quote.discount), color = TS.Success) }
                                Row { Text("Shipping", Modifier.weight(1f)); Text(if (q.quote.shipping == 0) "Free" else pkr(q.quote.shipping)) }
                                HorizontalDivider()
                                Row { Text("Total", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium); Text(pkr(q.quote.total), style = MaterialTheme.typography.titleMedium) }
                                Text("Payment: Cash on Delivery", style = MaterialTheme.typography.labelSmall, color = TS.Gray)
                            }
                            is QuoteState.Failed -> { Text(q.message, color = TS.Danger, style = MaterialTheme.typography.bodyMedium); OutlinedButton({ shop.refreshQuote() }) { Text("Try again") } }
                            else -> Row(verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = TS.Gold); Spacer(Modifier.width(10.dp)); Text("Confirming prices...", color = TS.Gray) }
                        }
                    }
                }
            }
        }
        if (shop.cart.isNotEmpty()) TsButton("Proceed to Checkout", enabled = !blocked, onClick = onCheckout, style = TsButtonStyle.Black, modifier = Modifier.align(Alignment.BottomCenter).padding(start = 20.dp, end = 20.dp, bottom = 104.dp))
        SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).padding(bottom = 170.dp))
    }
}

@Composable
private fun CouponBox(shop: ShopViewModel, ready: com.talhastudio.app.data.Quote?) {
    var text by remember { mutableStateOf("") }
    val code = shop.couponCode
    val problem = ready?.couponIssue?.message
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Discount code", style = MaterialTheme.typography.titleMedium)
        if (code != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (problem == null && ready?.couponCode != null) "$code applied" else code, Modifier.weight(1f), color = if (problem == null && ready?.couponCode != null) TS.Success else TS.Black)
                TextButton({ shop.clearCoupon() }) { Text("Remove", color = TS.Gold) }
            }
            if (problem != null) Text("$problem. Remove the code to continue.", style = MaterialTheme.typography.labelSmall, color = TS.Danger)
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(text, { text = it.uppercase().take(20).filter { c -> c.isLetterOrDigit() || c == '-' || c == '_' } }, Modifier.weight(1f), singleLine = true, placeholder = { Text("Enter code") })
                OutlinedButton({ if (text.isNotBlank()) { shop.applyCoupon(text); text = "" } }, enabled = text.isNotBlank()) { Text("Apply") }
            }
        }
    }
}
