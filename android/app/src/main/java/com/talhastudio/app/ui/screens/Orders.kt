package com.talhastudio.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import com.talhastudio.app.data.*
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch

@Composable
fun StatusChip(status: String) {
    val (bg, fg) = when (status) {
        "delivered" -> TS.Success.copy(0.15f) to TS.Success
        "cancelled", "refunded" -> TS.Danger.copy(0.12f) to TS.Danger
        "shipped" -> TS.Gold.copy(0.25f) to TS.Black
        else -> TS.Neutral to TS.Black
    }
    Text(statusLabel(status), style = MaterialTheme.typography.labelSmall, color = fg, modifier = Modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 10.dp, vertical = 3.dp))
}
fun prettyDate(iso: String) = runCatching { java.time.OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.systemDefault())
    .format(java.time.format.DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a")) }.getOrDefault(iso)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrdersScreen(onBack: () -> Unit, onOpen: (String) -> Unit) {
    var items by remember { mutableStateOf<List<OrderSummary>>(emptyList()) }
    var page by remember { mutableIntStateOf(1) }; var total by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }; var error by remember { mutableStateOf<ApiException?>(null) }
    var attempt by remember { mutableIntStateOf(0) }; var more by remember { mutableIntStateOf(0) }
    LaunchedEffect(attempt) { loading = true; error = null
        try { val r = Repo.orders(1); items = r.items; page = 1; total = r.total } catch (e: ApiException) { error = e }; loading = false }
    LaunchedEffect(more) { if (more == 0) return@LaunchedEffect
        try { val r = Repo.orders(page + 1); items = items + r.items; page++ } catch (e: ApiException) { error = e } }

    Scaffold(topBar = { TopAppBar(title = { Text("My Orders") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } }) }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when {
                loading -> ProductGridSkeleton()
                error != null && items.isEmpty() -> ErrorState(error!!.message ?: "", error!!.offline, { attempt++ })
                items.isEmpty() -> EmptyState("No orders yet", "When you place an order it will appear here.")
                else -> LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(items, key = { it.id }) { o ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surface).clickable { onOpen(o.id) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            ImageTile(o.imageUrl, o.firstItemName ?: "T", Modifier.size(64.dp).clip(RoundedCornerShape(10.dp)))
                            Column(Modifier.weight(1f).padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(o.orderNumber, style = MaterialTheme.typography.titleMedium)
                                Text("${o.itemCount} item${if (o.itemCount == 1) "" else "s"} · ${pkr(o.total)}", style = MaterialTheme.typography.bodyMedium)
                                Text(prettyDate(o.createdAt), style = MaterialTheme.typography.labelSmall, color = TS.Gray)
                            }
                            StatusChip(o.status)
                        }
                    }
                    if (items.size < total) item { OutlinedButton({ more++ }, Modifier.fillMaxWidth()) { Text("Load more") } }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(id: String, onBack: () -> Unit) {
    val load = rememberLoad(id) { Repo.order(id) }
    var latest by remember { mutableStateOf<Order?>(null) }
    val snack = remember { SnackbarHostState() }; val scope = rememberCoroutineScope()
    var confirmCancel by remember { mutableStateOf(false) }; var returning by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf("") }; var busy by remember { mutableStateOf(false) }
    val uri = LocalUriHandler.current

    fun act(block: suspend () -> Order, ok: String) = scope.launch {
        busy = true
        try { latest = block(); snack.showSnackbar(ok) } catch (e: ApiException) { snack.showSnackbar(e.message ?: "Something went wrong") } finally { busy = false }
    }

    Scaffold(snackbarHost = { SnackbarHost(snack) }, topBar = { TopAppBar(title = { Text("Order details") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } }) }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (val s = load.state) {
                is Load.Loading -> Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { SkeletonBox(Modifier.fillMaxWidth().height(80.dp)); SkeletonBox(Modifier.fillMaxWidth().height(160.dp)) }
                is Load.Error -> ErrorState(s.message, s.offline, load.retry)
                is Load.Ready -> {
                    val o = latest ?: s.data
                    Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) { Text(o.orderNumber, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f)); StatusChip(o.status) }
                        Text("Placed ${prettyDate(o.createdAt)}", color = TS.Gray, style = MaterialTheme.typography.bodyMedium)
                        Progress(o)
                        o.trackingUrl?.let { link -> TextButton({ runCatching { uri.openUri(link) } }) { Text("Track your parcel", color = TS.Gold) } }
                        Panel("Items") {
                            o.items.forEach { i -> Row(verticalAlignment = Alignment.CenterVertically) {
                                ImageTile(i.imageUrl, i.name, Modifier.size(56.dp).clip(RoundedCornerShape(8.dp)))
                                Column(Modifier.weight(1f).padding(horizontal = 10.dp)) { Text(i.name, maxLines = 2); Text(listOfNotNull(i.color, i.size?.let { "Size $it" }, "Qty ${i.qty}").joinToString(" · "), style = MaterialTheme.typography.labelSmall, color = TS.Gray) }
                                Text(pkr(i.unitPrice * i.qty))
                            } }
                            HorizontalDivider()
                            Row { Text("Subtotal", Modifier.weight(1f)); Text(pkr(o.subtotal)) }
                            Row { Text("Shipping", Modifier.weight(1f)); Text(if (o.shipping == 0) "Free" else pkr(o.shipping)) }
                            Row { Text("Total", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium); Text(pkr(o.total), style = MaterialTheme.typography.titleMedium) }
                            Text("Payment: Cash on Delivery (${o.paymentStatus})", style = MaterialTheme.typography.labelSmall, color = TS.Gray)
                        }
                        Panel("Delivery") { Text(o.customerName); Text(o.customerPhone); Text(o.address, color = TS.Gray); o.notes?.let { Text("Note: $it", style = MaterialTheme.typography.labelSmall, color = TS.Gray) } }
                        Panel("History") { o.history.reversed().forEach { h -> Column { Text(statusLabel(h.status), style = MaterialTheme.typography.titleMedium); Text(prettyDate(h.at), style = MaterialTheme.typography.labelSmall, color = TS.Gray); h.note?.let { Text(it, style = MaterialTheme.typography.bodyMedium) } } } }
                        if (o.canCancel) TsButton("Cancel order", style = TsButtonStyle.Outline, enabled = !busy, onClick = { confirmCancel = true })
                        if (o.canReturn) TsButton("Request a return", style = TsButtonStyle.Outline, enabled = !busy, onClick = { returning = true })
                        Spacer(Modifier.height(24.dp))
                    }
                    if (confirmCancel) AlertDialog({ confirmCancel = false }, title = { Text("Cancel this order?") }, text = { Text("Your items go back on sale and you will not be charged.") },
                        confirmButton = { TextButton({ confirmCancel = false; act({ Repo.cancelOrder(o.id) }, "Order cancelled") }) { Text("Cancel order", color = TS.Danger) } },
                        dismissButton = { TextButton({ confirmCancel = false }) { Text("Keep order") } })
                    if (returning) AlertDialog({ returning = false }, title = { Text("Request a return") },
                        text = { Column { Text("Tell us what went wrong (min 5 characters).", style = MaterialTheme.typography.bodyMedium); OutlinedTextField(reason, { reason = it.take(500) }, Modifier.fillMaxWidth(), minLines = 3) } },
                        confirmButton = { TextButton({ if (reason.trim().length >= 5) { returning = false; act({ Repo.requestReturn(o.id, reason.trim()) }, "Return requested. We will contact you.") } }, enabled = reason.trim().length >= 5) { Text("Submit", color = TS.Gold) } },
                        dismissButton = { TextButton({ returning = false }) { Text("Close") } })
                }
            }
        }
    }
}

@Composable
private fun Progress(o: Order) {
    if (o.status !in trackingSteps) { Text(when (o.status) { "cancelled" -> "This order was cancelled."; "refund_requested" -> "Your return request is being reviewed."; else -> "This order was refunded." }, color = TS.Gray); return }
    val idx = trackingSteps.indexOf(o.status)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        trackingSteps.forEachIndexed { i, st -> Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(3.dp)).background(if (i <= idx) TS.Gold else TS.Neutral))
            Text(statusLabel(st), style = MaterialTheme.typography.labelSmall, color = if (i <= idx) TS.Black else TS.Gray, modifier = Modifier.padding(top = 4.dp), maxLines = 1)
        } }
    }
}

@Composable
private fun Panel(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surface).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium); content()
    }
}

@Composable
fun OrderConfirmationScreen(id: String, onContinue: () -> Unit, onViewOrder: () -> Unit) {
    val load = rememberLoad(id) { Repo.order(id) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Spacer(Modifier.height(40.dp))
        Box(Modifier.size(84.dp).clip(RoundedCornerShape(42.dp)).background(TS.Gold), contentAlignment = Alignment.Center) { Text("✓", style = MaterialTheme.typography.displayLarge, color = TS.Black) }
        Text("Thank you!", style = MaterialTheme.typography.headlineMedium)
        Text("Your order has been placed.", color = TS.Gray)
        when (val s = load.state) {
            is Load.Ready -> { val o = s.data
                Text(o.orderNumber, style = MaterialTheme.typography.displayLarge)
                Text("Total to pay on delivery: ${pkr(o.total)}", style = MaterialTheme.typography.titleMedium)
                Text("We will email your confirmation to ${o.customerEmail}. You can follow every step under My Orders.", style = MaterialTheme.typography.bodyMedium, color = TS.Gray) }
            is Load.Error -> Text("Your order was saved. Open My Orders to see its details.", color = TS.Gray)
            else -> SkeletonBox(Modifier.fillMaxWidth().height(60.dp))
        }
        EnableNotificationsCard()
        Spacer(Modifier.height(10.dp))
        TsButton("View order", onViewOrder, style = TsButtonStyle.Black)
        TsButton("Continue shopping", onContinue, style = TsButtonStyle.Outline)
    }
}
