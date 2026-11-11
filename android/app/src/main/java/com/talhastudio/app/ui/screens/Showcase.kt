package com.talhastudio.app.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.Accessories
import com.talhastudio.app.data.Product
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS

/**
 * Home panel under the categories for the Accessories category: dark glass card with a gold glow, the title, sub-category chips and big picture cards.
 * It appears as soon as the category exists, even before the first product is added.
 */
@Composable
fun AccessoriesShowcase(acc: Accessories?, shop: ShopViewModel, onOpen: (String) -> Unit, onBrowse: (String?) -> Unit) {
    if (acc == null) return
    val shape = RoundedCornerShape(32.dp)
    val title = acc.title.trim().replaceFirstChar { it.uppercase() }
    Box(Modifier.padding(horizontal = 12.dp).fillMaxWidth().clip(shape)
        .background(Brush.linearGradient(listOf(Color(0xFF241D12), Color(0xFF0D0C0A), Color(0xFF16120B))))
        .border(1.dp, Brush.linearGradient(listOf(TS.Gold.copy(alpha = 0.7f), TS.Gold.copy(alpha = 0.12f), TS.Gold.copy(alpha = 0.5f))), shape)) {
        Box(Modifier.align(Alignment.TopEnd).size(240.dp).background(Brush.radialGradient(listOf(TS.Gold.copy(alpha = 0.22f), Color.Transparent))))
        Column(Modifier.fillMaxWidth().padding(vertical = 22.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("THE FINISHING TOUCH", color = TS.Gold, style = MaterialTheme.typography.labelSmall, letterSpacing = 3.sp)
                    Text(title, style = MaterialTheme.typography.headlineSmall, fontFamily = DisplayFont, color = TS.Ivory)
                }
                Text("View all", color = TS.Black, style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(Brush.horizontalGradient(listOf(Color(0xFFE9CF98), TS.Gold))).shimmerSweep(Color.White.copy(alpha = 0.7f)).clickable { onBrowse(acc.slug) }.padding(horizontal = 14.dp, vertical = 8.dp))
            }
            if (acc.tiles.isNotEmpty()) LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(acc.tiles, key = { it.id }) { t ->
                    Row(Modifier.clip(RoundedCornerShape(50)).border(1.dp, TS.Gold.copy(alpha = 0.55f), RoundedCornerShape(50)).clickable { onBrowse(t.slug) }.padding(start = 5.dp, end = 14.dp, top = 5.dp, bottom = 5.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(Modifier.size(30.dp).clip(CircleShape).background(TS.Neutral), contentAlignment = Alignment.Center) {
                            if (t.imageUrl != null) AsyncImage(t.imageUrl, t.name, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) else Text(t.name.take(1).uppercase(), color = TS.Gold, style = MaterialTheme.typography.labelLarge)
                        }
                        Text(t.name, style = MaterialTheme.typography.labelLarge, color = TS.Ivory)
                    }
                }
            }
            if (acc.products.isEmpty()) Column(Modifier.padding(horizontal = 20.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Color.White.copy(alpha = 0.05f))
                .border(0.8.dp, TS.Gold.copy(alpha = 0.35f), RoundedCornerShape(24.dp)).shimmerSweep(TS.Gold.copy(alpha = 0.16f)).padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.AutoAwesome, null, tint = TS.Gold, modifier = Modifier.size(30.dp))
                Text("New accessories arriving soon", style = MaterialTheme.typography.titleMedium, color = TS.Ivory, textAlign = TextAlign.Center)
                Text("Bags, scarves, jewellery and more to complete your look. Check back shortly.", style = MaterialTheme.typography.bodyMedium, color = TS.Ivory.copy(alpha = 0.65f), textAlign = TextAlign.Center)
            } else ShowcaseRow(acc.products, shop, onOpen)
        }
    }
}

@Composable
private fun ShowcaseRow(list: List<Product>, shop: ShopViewModel, onOpen: (String) -> Unit) {
    val state = rememberLazyListState()
    AutoScroll(state, enabled = list.size > 2, dpPerSecond = 18f)
    LazyRow(state = state, contentPadding = PaddingValues(horizontal = 20.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        items(list, key = { it.id }) { p -> PosterCard(p, shop.isWished(p.id), { onOpen(p.id) }, { shop.toggleWishlist(p.id) }, Modifier.carousel3d(state, p.id)) }
    }
}

/** Full-picture card: the photo fills the card, name and price sit on a dark fade at the bottom. Every card is the same size. */
@Composable
private fun PosterCard(p: Product, wished: Boolean, onClick: () -> Unit, onToggleWish: () -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(26.dp)
    val press = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
    Box(modifier.pressScale(press).width(158.dp).height(232.dp).clip(shape).background(TS.Neutral).border(0.8.dp, TS.Gold.copy(alpha = 0.35f), shape)
        .clickable(interactionSource = press, indication = androidx.compose.foundation.LocalIndication.current, onClick = onClick)) {
        ImageTile(p.thumbUrl, p.name, Modifier.fillMaxSize(), ContentScale.Crop, alignment = Alignment.TopCenter)
        Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(110.dp).background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.88f)))))
        p.discountPercent?.let { SaleBadge(it, Modifier.align(Alignment.TopStart).padding(10.dp)) }
        IconButton(onToggleWish, Modifier.align(Alignment.TopEnd).padding(2.dp).size(40.dp)) {
            Icon(if (wished) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder, if (wished) "Remove from wishlist" else "Add to wishlist", tint = if (wished) TS.Danger else Color.White)
        }
        Column(Modifier.align(Alignment.BottomStart).padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(p.name, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(pkr(p.effectivePrice), color = TS.Gold, style = MaterialTheme.typography.titleMedium)
                if (p.salePrice != null) Text(pkr(p.price), color = Color.White.copy(alpha = 0.6f), style = MaterialTheme.typography.labelSmall.copy(textDecoration = TextDecoration.LineThrough))
            }
        }
    }
}
