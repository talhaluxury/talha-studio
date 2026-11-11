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
import coil.compose.AsyncImage
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.Accessories
import com.talhastudio.app.data.Product
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS

/**
 * Home showcase under the categories: a pill switch between "Accessories" (the owner's accessories category: sub-category chips + big picture cards)
 * and "Recent" (products the customer opened lately). Without accessories it simply shows the recently viewed products; with neither it is hidden.
 */
@Composable
fun AccessoriesShowcase(acc: Accessories?, recent: List<Product>, shop: ShopViewModel, onOpen: (String) -> Unit, onBrowse: (String?) -> Unit) {
    if (acc == null && recent.isEmpty()) return
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val current = if (acc == null) 1 else tab
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (acc != null) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(3.dp).height(22.dp).clip(RoundedCornerShape(2.dp)).background(Brush.verticalGradient(listOf(Color(0xFFE9CF98), TS.Gold))))
                Spacer(Modifier.width(10.dp))
                Text("Style it with", style = MaterialTheme.typography.titleLarge, fontFamily = DisplayFont, modifier = Modifier.weight(1f))
                if (current == 0) Text("View All", color = TS.Gold, style = MaterialTheme.typography.labelLarge, modifier = Modifier.clickable { onBrowse(acc.slug) }.padding(8.dp))
            }
            PillTabs(listOf(acc.title, "Recent"), current) { tab = it }
        } else SectionHeader("Recently Viewed")
        Crossfade(current, label = "showcase") { c ->
            if (c == 0 && acc != null) Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                if (acc.tiles.isNotEmpty()) LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(acc.tiles, key = { it.id }) { t ->
                        Row(Modifier.clip(RoundedCornerShape(50)).border(1.dp, TS.Gold.copy(alpha = 0.55f), RoundedCornerShape(50)).clickable { onBrowse(t.slug) }.padding(start = 5.dp, end = 14.dp, top = 5.dp, bottom = 5.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(Modifier.size(30.dp).clip(CircleShape).background(TS.Neutral), contentAlignment = Alignment.Center) {
                                if (t.imageUrl != null) AsyncImage(t.imageUrl, t.name, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) else Text(t.name.take(1), color = TS.Gold, style = MaterialTheme.typography.labelLarge)
                            }
                            Text(t.name, style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
                ShowcaseRow(acc.products, shop, onOpen)
            } else {
                if (recent.isEmpty()) Text("Products you open will appear here.", color = TS.Gray, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 20.dp, vertical = 24.dp))
                else ShowcaseRow(recent, shop, onOpen)
            }
        }
    }
}

/** Two-option pill switch with a gold block that slides to the chosen side. */
@Composable
private fun PillTabs(labels: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    val shape = RoundedCornerShape(50)
    BoxWithConstraints(Modifier.padding(horizontal = 20.dp).fillMaxWidth().height(46.dp).clip(shape).background(Color.White.copy(alpha = 0.06f)).border(0.8.dp, TS.Gold.copy(alpha = 0.35f), shape)) {
        val seg = maxWidth / labels.size
        val x by animateDpAsState(seg * selected, spring(dampingRatio = 0.75f, stiffness = 380f), label = "pill")
        Box(Modifier.offset(x = x).width(seg).fillMaxHeight().padding(4.dp).clip(shape).background(Brush.horizontalGradient(listOf(Color(0xFFE9CF98), TS.Gold))))
        Row(Modifier.fillMaxSize()) {
            labels.forEachIndexed { i, l ->
                Box(Modifier.weight(1f).fillMaxHeight().clip(shape).clickable { onSelect(i) }, contentAlignment = Alignment.Center) {
                    Text(l, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold), color = if (i == selected) TS.Black else TS.Ivory.copy(alpha = 0.8f))
                }
            }
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
