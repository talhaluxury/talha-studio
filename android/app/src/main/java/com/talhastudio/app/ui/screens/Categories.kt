package com.talhastudio.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Check
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import com.talhastudio.app.ui.theme.DisplayFont
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
    var filter by remember(initialCategory) { mutableStateOf(parseBrowse(initialCategory)) }
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
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(typed, { typed = it }, Modifier.weight(1f), placeholder = { Text("Search suits, fabrics, brands") }, singleLine = true, shape = RoundedCornerShape(50),
                leadingIcon = { Icon(Icons.Outlined.Search, null, tint = TS.Gold) },
                trailingIcon = { if (typed.isNotEmpty()) IconButton({ typed = "" }) { Icon(Icons.Outlined.Close, "Clear search") } },
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = TS.Gold, unfocusedBorderColor = TS.Gold.copy(alpha = 0.35f), cursorColor = TS.Gold))
            BadgedBox(badge = { if (filter.activeCount > 0) Badge(containerColor = TS.Gold, contentColor = TS.Black) { Text("${filter.activeCount}") } }) {
                Box(Modifier.size(50.dp).clip(CircleShape).background(if (filter.activeCount > 0) TS.Gold else Color.Transparent).border(1.dp, TS.Gold, CircleShape).clickable { showFilters = true }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.Tune, "Filters and sorting", tint = if (filter.activeCount > 0) TS.Black else TS.Gold)
                }
            }
        }
        // What is currently applied, each removable with one tap.
        if (filter.sort != Sort.New || filter.inStockOnly || filter.minPrice != null || filter.maxPrice != null) LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 8.dp)) {
            if (filter.sort != Sort.New) item { AppliedChip(filter.sort.label) { filter = filter.copy(sort = Sort.New) } }
            if (filter.inStockOnly) item { AppliedChip("In stock") { filter = filter.copy(inStockOnly = false) } }
            if (filter.minPrice != null || filter.maxPrice != null) item { AppliedChip(priceLabel(filter.minPrice, filter.maxPrice)) { filter = filter.copy(minPrice = null, maxPrice = null) } }
        }
        if (filter.section != null) Row(Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
            FilterChip(true, { filter = filter.copy(section = null, sectionTitle = null) }, { Text("${filter.sectionTitle.orEmpty().ifBlank { "Section" }}  \u2715") }, colors = chipColors())
        }
        val catList = (cats.state as? Load.Ready)?.data.orEmpty()
        val mains = catList.filter { it.parentId == null }
        val picked = catList.firstOrNull { it.slug == filter.category }
        val activeMain = picked?.let { p -> if (p.parentId == null) p else catList.firstOrNull { it.id == p.parentId } }
        val subs = activeMain?.let { m -> catList.filter { it.parentId == m.id } }.orEmpty()
        if (mains.isNotEmpty()) LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item { FilterChip(filter.category == null, { filter = filter.copy(category = null) }, { Text("All") }, colors = chipColors()) }
            items(mains, key = { it.id }) { c -> FilterChip(activeMain?.id == c.id, { filter = filter.copy(category = c.slug) }, { Text(c.name) }, colors = chipColors()) }
        }
        // Sub-categories of the chosen main category: a side-scrolling slider of round pictures.
        if (activeMain != null && subs.isNotEmpty()) LazyRow(Modifier.padding(top = 12.dp), contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            item(key = "all-" + activeMain.id) { SubCategoryTile("All", null, filter.category == activeMain.slug) { filter = filter.copy(category = activeMain.slug) } }
            items(subs, key = { it.id }) { s -> SubCategoryTile(s.name, s.imageUrl, filter.category == s.slug) { filter = filter.copy(category = s.slug) } }
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
    if (showFilters) FilterSheet(filter, { showFilters = false }) { filter = it; showFilters = false }
}

private fun priceLabel(min: Int?, max: Int?) = when {
    min != null && max != null -> "Rs. %,d - %,d".format(min, max)
    min != null -> "From Rs. %,d".format(min)
    max != null -> "Up to Rs. %,d".format(max)
    else -> "Any price"
}

@Composable
private fun AppliedChip(text: String, onRemove: () -> Unit) {
    Row(Modifier.clip(RoundedCornerShape(50)).background(TS.Gold.copy(alpha = 0.16f)).border(0.8.dp, TS.Gold.copy(alpha = 0.6f), RoundedCornerShape(50)).clickable(onClick = onRemove).padding(start = 12.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(text, style = MaterialTheme.typography.labelMedium, color = TS.Ivory)
        Icon(Icons.Outlined.Close, "Remove filter", tint = TS.Gold, modifier = Modifier.size(15.dp))
    }
}

@Composable
private fun SheetLabel(text: String) = Text(text, style = MaterialTheme.typography.labelSmall, color = TS.Gold, letterSpacing = 2.sp, modifier = Modifier.padding(top = 4.dp))

/** Filters and sorting as a bottom sheet: sort cards, an in-stock switch, quick price ranges plus your own range, and one big "Show results" button. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilterSheet(current: Filter, onDismiss: () -> Unit, onApply: (Filter) -> Unit) {
    var sort by remember { mutableStateOf(current.sort) }
    var inStock by remember { mutableStateOf(current.inStockOnly) }
    var min by remember { mutableStateOf(current.minPrice?.toString() ?: "") }
    var max by remember { mutableStateOf(current.maxPrice?.toString() ?: "") }
    val quick: List<Pair<String, Pair<Int?, Int?>>> = listOf("Under 3,000" to (null to 3000), "3,000 - 5,000" to (3000 to 5000), "5,000 - 8,000" to (5000 to 8000), "8,000+" to (8000 to null))
    val line = TS.Gold.copy(alpha = 0.3f)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Color(0xFF121212),
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp), dragHandle = { BottomSheetDefaults.DragHandle(color = TS.Gold.copy(alpha = 0.6f)) }) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding().padding(horizontal = 22.dp).padding(bottom = 18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(3.dp).height(24.dp).clip(RoundedCornerShape(2.dp)).background(TS.Gold))
                Spacer(Modifier.width(10.dp))
                Text("Filter & sort", style = MaterialTheme.typography.headlineSmall, fontFamily = DisplayFont, modifier = Modifier.weight(1f))
                TextButton({ sort = Sort.New; inStock = false; min = ""; max = "" }) { Text("Reset all", color = TS.Gold) }
            }
            SheetLabel("SORT BY")
            Sort.entries.forEach { s ->
                val on = sort == s
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (on) TS.Gold.copy(alpha = 0.14f) else Color.White.copy(alpha = 0.04f))
                    .border(if (on) 1.2.dp else 0.8.dp, if (on) TS.Gold else line, RoundedCornerShape(16.dp)).clickable { sort = s }.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(s.label, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, color = if (on) TS.Gold else TS.Ivory)
                    if (on) Icon(Icons.Outlined.Check, null, tint = TS.Gold)
                }
            }
            SheetLabel("AVAILABILITY")
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.04f)).border(0.8.dp, line, RoundedCornerShape(16.dp)).clickable { inStock = !inStock }.padding(start = 16.dp, end = 10.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("In stock only", style = MaterialTheme.typography.bodyLarge); Text("Hide sold-out items", style = MaterialTheme.typography.labelSmall, color = TS.Gray) }
                Switch(inStock, { inStock = it }, colors = SwitchDefaults.colors(checkedTrackColor = TS.Gold, checkedThumbColor = TS.Black))
            }
            SheetLabel("PRICE RANGE (RS.)")
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(quick, key = { it.first }) { (label, range) ->
                    val on = min.toIntOrNull() == range.first && max.toIntOrNull() == range.second
                    Text(label, style = MaterialTheme.typography.labelLarge, color = if (on) TS.Black else TS.Ivory,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(if (on) TS.Gold else Color.Transparent).border(0.8.dp, if (on) TS.Gold else line, RoundedCornerShape(50))
                            .clickable { min = range.first?.toString() ?: ""; max = range.second?.toString() ?: "" }.padding(horizontal = 14.dp, vertical = 9.dp))
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(min, { min = it.filter(Char::isDigit).take(8) }, Modifier.weight(1f), label = { Text("Min") }, singleLine = true, shape = RoundedCornerShape(16.dp), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = TS.Gold, unfocusedBorderColor = line, focusedLabelColor = TS.Gold, cursorColor = TS.Gold))
                OutlinedTextField(max, { max = it.filter(Char::isDigit).take(8) }, Modifier.weight(1f), label = { Text("Max") }, singleLine = true, shape = RoundedCornerShape(16.dp), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = TS.Gold, unfocusedBorderColor = line, focusedLabelColor = TS.Gold, cursorColor = TS.Gold))
            }
            Spacer(Modifier.height(4.dp))
            Button({ onApply(current.copy(sort = sort, inStockOnly = inStock, minPrice = min.toIntOrNull(), maxPrice = max.toIntOrNull())) }, Modifier.fillMaxWidth().heightIn(min = 54.dp),
                shape = RoundedCornerShape(16.dp), colors = ButtonDefaults.buttonColors(containerColor = TS.Gold, contentColor = TS.Black)) { Text("Show results", style = MaterialTheme.typography.labelLarge) }
        }
    }
}

@Composable
private fun chipColors() = FilterChipDefaults.filterChipColors(selectedContainerColor = TS.Ivory, selectedLabelColor = TS.Black)

@Composable
private fun SubCategoryTile(name: String, imageUrl: String?, selected: Boolean, onClick: () -> Unit) {
    Column(Modifier.width(72.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp)).clickable(onClick = onClick), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(60.dp).clip(androidx.compose.foundation.shape.CircleShape).background(TS.Neutral)
            .border(if (selected) 2.dp else 0.dp, if (selected) TS.Gold else androidx.compose.ui.graphics.Color.Transparent, androidx.compose.foundation.shape.CircleShape), contentAlignment = Alignment.Center) {
            if (imageUrl != null) coil.compose.AsyncImage(model = imageUrl, contentDescription = name, modifier = Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.Crop)
            else Text(name.take(1), color = TS.Gold, style = MaterialTheme.typography.titleMedium)
        }
        Text(name, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall, color = if (selected) TS.Gold else TS.Gray, modifier = Modifier.padding(top = 6.dp))
    }
}
