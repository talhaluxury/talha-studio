package com.talhastudio.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.talhastudio.app.data.*
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch

/** Orders that contain this brand's products (only the brand's own lines are listed). */
@Composable
internal fun SellerOrdersTab(onOpen: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var orders by remember { mutableStateOf<List<SellerOrder>>(emptyList()) }
    var page by remember { mutableIntStateOf(1) }
    var total by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<ApiException?>(null) }

    fun load(p: Int) {
        loading = true; error = null
        scope.launch {
            try { val r = Repo.sellerOrders(p); orders = if (p == 1) r.items else orders + r.items; page = r.page; total = r.total }
            catch (e: ApiException) { error = e } finally { loading = false }
        }
    }
    LaunchedEffect(Unit) { load(1) }

    val err = error
    when {
        err != null && orders.isEmpty() -> ErrorState(err.pretty(), err.offline, { load(1) })
        loading && orders.isEmpty() -> Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { repeat(3) { SkeletonBox(Modifier.fillMaxWidth().height(84.dp)) } }
        orders.isEmpty() -> Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text(tr("No orders yet"), style = MaterialTheme.typography.titleMedium)
            Text("When a customer buys one of your products it shows up here, and you get a notification.", style = MaterialTheme.typography.bodyMedium, color = TS.Gray)
            Spacer(Modifier.height(16.dp)); OutlinedButton({ load(1) }) { Text("Refresh") }
        }
        else -> LazyColumn(contentPadding = PaddingValues(20.dp, 16.dp, 20.dp, 120.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { OutlinedButton({ load(1) }, enabled = !loading) { Text(if (loading) "Refreshing..." else "Refresh") } }
            items(orders, key = { it.id }) { o ->
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surface).clickable { onOpen(o.id) }.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(o.orderNumber, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f)); StatusChip(o.status)
                    }
                    Text(o.customerName + " · " + prettyDate(o.createdAt), style = MaterialTheme.typography.bodySmall, color = TS.Gray)
                    Text("${o.itemCount} item${if (o.itemCount == 1) "" else "s"} · " + pkr(o.subtotal), style = MaterialTheme.typography.bodyMedium)
                }
            }
            if (page * 20 < total) item { OutlinedButton({ load(page + 1) }, enabled = !loading) { Text(if (loading) "Loading..." else "Load more") } }
        }
    }
}

@Composable
internal fun SellerOrderDetail(id: String, onBack: () -> Unit) {
    val load = rememberLoad(id) { Repo.sellerOrder(id) }
    Column(Modifier.fillMaxSize()) {
        SellerTopBar("Order", null, onBack)
        when (val s = load.state) {
            is Load.Loading -> Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { SkeletonBox(Modifier.fillMaxWidth().height(120.dp)); SkeletonBox(Modifier.fillMaxWidth().height(160.dp)) }
            is Load.Error -> ErrorState(s.message, s.offline, load.retry)
            is Load.Ready -> {
                val o = s.data
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) { Text(o.orderNumber, style = MaterialTheme.typography.headlineSmall); Text(prettyDate(o.createdAt), style = MaterialTheme.typography.bodySmall, color = TS.Gray) }
                        StatusChip(o.status)
                    }
                    Panel {
                        Text("Deliver to", style = MaterialTheme.typography.labelLarge, color = TS.Gray)
                        Text(o.customerName, style = MaterialTheme.typography.titleSmall)
                        Text(o.customerPhone); Text(o.address, style = MaterialTheme.typography.bodyMedium)
                        if (o.notes != null) Text("Note: ${o.notes}", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
                        Text("Payment: ${o.paymentMethod.uppercase()} · ${o.paymentStatus}", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
                    }
                    Panel {
                        Text("Your items", style = MaterialTheme.typography.labelLarge, color = TS.Gray)
                        o.items.forEach { i ->
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(56.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                                    if (i.imageUrl != null) AsyncImage(i.imageUrl, i.name, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                                }
                                Column(Modifier.weight(1f)) {
                                    Text(i.name, style = MaterialTheme.typography.titleSmall)
                                    Text(listOfNotNull(i.size, i.color).joinToString(" · ").ifEmpty { "Standard" } + " · x${i.qty}", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
                                }
                                Text(pkr(i.unitPrice * i.qty), style = MaterialTheme.typography.titleSmall)
                            }
                        }
                        HorizontalDivider()
                        Row { Text("Total for your items", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall); Text(pkr(o.subtotal), style = MaterialTheme.typography.titleMedium) }
                    }
                    Text("The store handles delivery status. You can see updates here.", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
                }
            }
        }
    }
}
