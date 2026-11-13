package com.talhastudio.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.talhastudio.app.data.*
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private fun stateLabel(p: SellerProduct) = when (p.state) {
    "pending" -> "In review"
    "approved" -> if (p.isPublished) "Live" else "Approved (hidden)"
    "rejected" -> "Rejected"
    else -> "Draft"
}

@Composable
internal fun SellerProductsTab(products: List<SellerProduct>?, error: String?, onAdd: () -> Unit, onOpen: (String) -> Unit, onRetry: () -> Unit) {
    when {
        products == null && error != null -> ErrorState(error, false, onRetry)
        products == null -> Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { repeat(3) { SkeletonBox(Modifier.fillMaxWidth().height(84.dp)) } }
        else -> LazyColumn(contentPadding = PaddingValues(20.dp, 16.dp, 20.dp, 120.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { TsButton("Add product", onAdd) }
            if (products.isEmpty()) item {
                Text("No products yet. Add your first product with photos, sizes and price. Products go live after the store approves your page.",
                    style = MaterialTheme.typography.bodyMedium, color = TS.Gray, modifier = Modifier.padding(vertical = 12.dp))
            }
            items(products, key = { it.id }) { p ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surface).clickable { onOpen(p.id) }.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(64.dp).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                        p.images.firstOrNull()?.let { AsyncImage(it.thumbUrl, p.name, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(p.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(pkr(p.salePrice ?: p.price) + " · " + p.variants.sumOf { it.stock } + " in stock", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
                        Text(stateLabel(p), style = MaterialTheme.typography.labelSmall,
                            color = when (p.state) { "approved" -> TS.Success; "rejected" -> TS.Danger; else -> TS.Gold })
                        if (p.state == "rejected" && p.note != null) Text(p.note, style = MaterialTheme.typography.bodySmall, color = TS.Danger, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

private class VarRow(val id: String?, size: String, color: String, stock: String) {
    var size by mutableStateOf(size); var color by mutableStateOf(color); var stock by mutableStateOf(stock)
}

/** Add or edit one product. A new product is saved first, then photos can be added to it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SellerProductForm(id: String?, onBack: () -> Unit, onSaved: () -> Unit, onChanged: () -> Unit, say: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    var currentId by remember { mutableStateOf(id) }
    var product by remember { mutableStateOf<SellerProduct?>(null) }
    var categories by remember { mutableStateOf<List<SellerCategory>>(emptyList()) }
    var ready by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<ApiException?>(null) }
    var attempt by remember { mutableIntStateOf(0) }

    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var categoryId by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var salePrice by remember { mutableStateOf("") }
    var fabric by remember { mutableStateOf("") }
    val variants = remember { mutableStateListOf<VarRow>() }
    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var busy by remember { mutableStateOf(false) }
    var uploading by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    fun fill(p: SellerProduct) {
        name = p.name; description = p.description; categoryId = p.categoryId; price = p.price.toString(); salePrice = p.salePrice?.toString().orEmpty(); fabric = p.fabric.orEmpty()
        variants.clear(); variants.addAll(p.variants.map { VarRow(it.id, it.size.orEmpty(), it.color.orEmpty(), it.stock.toString()) })
    }
    LaunchedEffect(attempt) {
        ready = false; loadError = null
        try {
            categories = Repo.sellerCategories()
            if (id != null) { val p = Repo.sellerProduct(id); product = p; fill(p) } else if (variants.isEmpty()) variants.add(VarRow(null, "", "", "5"))
            ready = true
        } catch (e: ApiException) { loadError = e }
    }

    fun save() {
        val priceInt = price.trim().toIntOrNull(); val saleInt = salePrice.trim().ifEmpty { null }?.toIntOrNull()
        val bad = mutableMapOf<String, String>()
        if (priceInt == null) bad["price"] = "Enter the price in rupees"
        if (salePrice.isNotBlank() && saleInt == null) bad["salePrice"] = "Enter the sale price in rupees"
        if (categoryId.isEmpty()) bad["categoryId"] = "Choose a category"
        if (variants.any { it.stock.trim().toIntOrNull() == null }) bad["variants"] = "Stock must be a number"
        if (bad.isNotEmpty()) { errors = bad; say(bad.values.first()); return }
        val form = ProductForm(name.trim(), description.trim(), categoryId, priceInt!!, saleInt, fabric.trim().ifEmpty { null },
            variants.map { SellerVariant(it.id, it.size.trim().ifEmpty { null }, it.color.trim().ifEmpty { null }, it.stock.trim().toInt()) })
        busy = true; errors = emptyMap()
        scope.launch {
            try {
                val p = Repo.sellerSaveProduct(currentId, form)
                val wasNew = currentId == null
                currentId = p.id; product = p; fill(p); onChanged()
                if (wasNew) say("Saved. Now add photos.") else onSaved()
            } catch (e: ApiException) { errors = e.fields; say(e.pretty()) } finally { busy = false }
        }
    }
    val pickPhoto = rememberPhotoPicker { uri ->
        val pid = currentId ?: return@rememberPhotoPicker
        scope.launch {
            uploading = true
            try {
                val bytes = withContext(Dispatchers.IO) { readPhoto(ctx, uri) } ?: throw ApiException(false, "Could not read that picture")
                Repo.sellerAddProductImage(pid, bytes); product = Repo.sellerProduct(pid); onChanged()
            } catch (e: ApiException) { say(e.pretty()) } finally { uploading = false }
        }
    }

    Column(Modifier.fillMaxSize()) {
        SellerTopBar(if (id == null && currentId == null) "New product" else "Edit product", null, onBack)
        val le = loadError
        when {
            le != null -> ErrorState(le.pretty(), le.offline, { attempt++ })
            !ready -> Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { SkeletonBox(Modifier.fillMaxWidth().height(56.dp)); SkeletonBox(Modifier.fillMaxWidth().height(120.dp)) }
            else -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                val p = product
                if (p?.state == "rejected" && p.note != null) Panel { Text("Not approved", color = TS.Danger, style = MaterialTheme.typography.titleSmall); Text(p.note, style = MaterialTheme.typography.bodyMedium) }

                Field("Product name", name, { name = it }, errors["name"])
                Field("Description", description, { description = it }, errors["description"], minLines = 4)
                Text("Category", style = MaterialTheme.typography.labelLarge, color = TS.Gray)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    categories.forEach { c -> FilterChip(selected = categoryId == c.id, onClick = { categoryId = c.id }, label = { Text(c.name) }) }
                }
                errors["categoryId"]?.let { Text(it, color = TS.Danger, style = MaterialTheme.typography.labelSmall) }
                Field("Price (Rs.)", price, { price = it }, errors["price"], KeyboardType.Number)
                Field("Sale price (optional, lower than price)", salePrice, { salePrice = it }, errors["salePrice"], KeyboardType.Number)
                Field("Fabric (optional)", fabric, { fabric = it }, errors["fabric"])

                Text("Sizes and colours", style = MaterialTheme.typography.titleMedium, fontFamily = DisplayFont)
                errors["variants"]?.let { Text(it, color = TS.Danger, style = MaterialTheme.typography.labelSmall) }
                variants.forEachIndexed { i, v ->
                    Panel {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Field("Size", v.size, { v.size = it }, errors["variants.$i.size"], modifier = Modifier.weight(1f))
                            Field("Colour", v.color, { v.color = it }, errors["variants.$i.color"], modifier = Modifier.weight(1f))
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Field("Stock", v.stock, { v.stock = it }, errors["variants.$i.stock"], KeyboardType.Number, Modifier.weight(1f))
                            if (variants.size > 1) TextButton({ variants.removeAt(i) }) { Text("Remove") }
                        }
                    }
                }
                if (variants.size < 40) OutlinedButton({ variants.add(VarRow(null, "", "", "5")) }) { Text("Add size / colour") }

                Text("Photos", style = MaterialTheme.typography.titleMedium, fontFamily = DisplayFont)
                if (currentId == null) Text("Save the product first, then you can add photos.", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
                else {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(p?.images.orEmpty(), key = { it.id }) { img ->
                            Box(Modifier.size(96.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                                AsyncImage(img.thumbUrl, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                                TextButton({
                                    val pid = currentId ?: return@TextButton
                                    scope.launch { try { Repo.sellerDeleteProductImage(pid, img.id); product = Repo.sellerProduct(pid); onChanged() } catch (e: ApiException) { say(e.pretty()) } }
                                }, Modifier.align(Alignment.BottomEnd), contentPadding = PaddingValues(6.dp, 0.dp)) { Text("Delete", style = MaterialTheme.typography.labelSmall, color = TS.Danger) }
                            }
                        }
                    }
                    OutlinedButton(pickPhoto, enabled = !uploading && (p?.images?.size ?: 0) < 8) { Text(if (uploading) "Uploading..." else "Add photo") }
                }

                Spacer(Modifier.height(4.dp))
                TsButton(if (busy) "Saving..." else if (currentId == null) "Save product" else "Save changes", enabled = !busy, onClick = { save() })
                if (id == null && currentId != null) TsButton("Done", onSaved, style = TsButtonStyle.Outline)
                if (currentId != null) TextButton({ confirmDelete = true }, Modifier.fillMaxWidth()) { Text("Delete product", color = TS.Danger) }
                Text("New and changed products go live after the store approves your page.", style = MaterialTheme.typography.bodySmall, color = TS.Gray)
                Spacer(Modifier.height(80.dp))
            }
        }
    }
    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Delete this product?") }, text = { Text("It will disappear from your page. Past orders keep their details.") },
        confirmButton = {
            TextButton({
                confirmDelete = false; val pid = currentId ?: return@TextButton
                scope.launch { try { Repo.sellerDeleteProduct(pid); onSaved() } catch (e: ApiException) { say(e.pretty()) } }
            }) { Text("Delete", color = TS.Danger) }
        },
        dismissButton = { TextButton({ confirmDelete = false }) { Text("Cancel") } },
    )
}
