package com.talhastudio.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.*
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.delay

/** Browse = categories + search + filters + sorting + paging, all against the live catalog. */
@Composable
fun CategoriesScreen(shop: ShopViewModel, initialCategory: String?, onOpenProduct: (String) -> Unit) {
    var filter by remember(initialCategory) { mutableStateOf(Filter(category = initialCategory)) }
    var typed by remember { mutableStateOf("") }
    var showFilters by remember { mutableStateOf(false) }
    val cats = rememberLoad("cats") { Repo.categories() }

    // Debounce typing so we do not hit the API on every keystroke.
    LaunchedEffect(typed) { if (typed.trim() != filter.query) { delay(350); filter = filter.copy(query = typed.trim()) } }

    var items by remember { mutableStateOf<List<Product>>(emptyList()) }
    var page by remember { mutableIntStateOf(1) }
    var total by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var loadingMore by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<ApiException?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    var moreAttempt by remember { mutableIntStateOf(0) }

    LaunchedEffect(filter, attempt) {
        loading = true; error = null
        try { val r = Repo.products(filter, 1); items = r.items; page = 1; total = r.total } catch (e: ApiException) { error = e }
        loading = false
    }
    LaunchedEffect(moreAttempt) {
        if (moreAttempt == 0) return@LaunchedEffect
        loadingMore = true
        try { val r = Repo.products(filter, page + 1); items = items + r.items; page += 1; total = r.total } catch (e: ApiException) { error = e }
        loadingMore = false
    }

    Column {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(typed, { typed = it }, Modifier.weight(1f), placeholder = { Text("Search products") }, singleLine = true, shape = MaterialTheme.shapes.medium)
            BadgedBox(badge = { if (filter.activeCount > 0) Badge(containerColor = TS.Gold, contentColor = TS.Black) { Text("${filter.activeCount}") } }) {
                IconButton({ showFilters = true }) { Icon(Icons.Outlined.Tune, "Filters and sorting") }
            }
        }
        val catList = (cats.state as? Load.Ready)?.data.orEmpty()
        if (catList.isNotEmpty()) LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item { FilterChip(filter.category == null, { filter = filter.copy(category = null) }, { Text("All") }, colors = chipColors()) }
            items(catList, key = { it.id }) { c -> FilterChip(filter.category == c.slug, { filter = filter.copy(category = c.slug) }, { Text(c.name) }, colors = chipColors()) }
        }
        when {
            loading && items.isEmpty() -> ProductGridSkeleton()
            error != null && items.isEmpty() -> ErrorState(error!!.message ?: "", error!!.offline, { attempt++ })
            items.isEmpty() -> EmptyState("No products found", "Try a different category, search or filter.")
            else -> LazyVerticalGrid(GridCells.Fixed(2), contentPadding = PaddingValues(20.dp, 16.dp, 20.dp, 120.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                items(items, key = { it.id }) { p -> ProductCard(p, shop.isWished(p.id), { onOpenProduct(p.id) }, { shop.toggleWishlist(p.id) }) }
                if (items.size < total) item(span = { GridItemSpan(maxLineSpan) }) {
                    Box(Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.Center) {
                        if (loadingMore) CircularProgressIndicator(color = TS.Gold) else OutlinedButton({ moreAttempt++ }) { Text("Load more") }
                    }
                }
            }
        }
    }
    if (showFilters) FilterDialog(filter, { showFilters = false }) { filter = it; showFilters = false }
}

@Composable
private fun FilterDialog(current: Filter, onDismiss: () -> Unit, onApply: (Filter) -> Unit) {
    var sort by remember { mutableStateOf(current.sort) }
    var inStock by remember { mutableStateOf(current.inStockOnly) }
    var min by remember { mutableStateOf(current.minPrice?.toString() ?: "") }
    var max by remember { mutableStateOf(current.maxPrice?.toString() ?: "") }
    AlertDialog(onDismissRequest = onDismiss,
        title = { Text("Filters & sorting") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Sort by", style = MaterialTheme.typography.titleMedium)
            Sort.entries.forEach { s -> Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { RadioButton(sort == s, { sort = s }); Text(s.label) } }
            Row(verticalAlignment = Alignment.CenterVertically) { Switch(inStock, { inStock = it }); Spacer(Modifier.width(10.dp)); Text("In stock only") }
            Text("Price (Rs.)", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(min, { min = it.filter(Char::isDigit).take(8) }, Modifier.weight(1f), label = { Text("Min") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                OutlinedTextField(max, { max = it.filter(Char::isDigit).take(8) }, Modifier.weight(1f), label = { Text("Max") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            }
        } },
        confirmButton = { TextButton({ onApply(current.copy(sort = sort, inStockOnly = inStock, minPrice = min.toIntOrNull(), maxPrice = max.toIntOrNull())) }) { Text("Apply", color = TS.Gold) } },
        dismissButton = { TextButton({ onApply(current.copy(sort = Sort.New, inStockOnly = false, minPrice = null, maxPrice = null)) }) { Text("Reset") } })
}

@Composable
private fun chipColors() = FilterChipDefaults.filterChipColors(selectedContainerColor = TS.Black, selectedLabelColor = TS.Ivory)
