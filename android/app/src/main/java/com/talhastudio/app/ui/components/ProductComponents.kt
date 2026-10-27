package com.talhastudio.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.talhastudio.app.data.Product
import com.talhastudio.app.ui.theme.TS

fun pkr(v: Int) = "Rs. " + "%,d".format(v)

/** Image, or a neutral placeholder tile when there is no photo (never a fake photo). */
@Composable
fun ImageTile(url: String?, label: String, modifier: Modifier = Modifier, fit: ContentScale = ContentScale.Crop) {
    Box(modifier.background(TS.Neutral), contentAlignment = Alignment.Center) {
        if (url != null) AsyncImage(
            model = coil.request.ImageRequest.Builder(androidx.compose.ui.platform.LocalContext.current).data(url).crossfade(250).build(),
            contentDescription = label, modifier = Modifier.fillMaxSize(), contentScale = fit)
        else Text(label.take(1), style = MaterialTheme.typography.displayLarge, color = TS.Gold)
    }
}
@Composable
fun ProductImage(p: Product, modifier: Modifier = Modifier) = ImageTile(p.thumbUrl, p.name, modifier)

@Composable
fun PriceText(p: Product) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(pkr(p.effectivePrice), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
        if (p.salePrice != null) Text(pkr(p.price), style = MaterialTheme.typography.bodyMedium.copy(textDecoration = TextDecoration.LineThrough), color = TS.Gray)
    }
}

@Composable
fun ProductCard(
    p: Product, wished: Boolean, onClick: () -> Unit, onToggleWish: () -> Unit, modifier: Modifier = Modifier,
) {
    Column(modifier.clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surface).clickable(onClick = onClick)) {
        Box {
            ProductImage(p, Modifier.fillMaxWidth().aspectRatio(0.78f))
            p.discountPercent?.let {
                Text("$it% OFF", style = MaterialTheme.typography.labelSmall, color = TS.Black,
                    modifier = Modifier.padding(8.dp).clip(RoundedCornerShape(50)).background(TS.Gold).padding(horizontal = 8.dp, vertical = 3.dp))
            }
            IconButton(onToggleWish, Modifier.align(Alignment.TopEnd).padding(4.dp).size(40.dp)) {
                Icon(if (wished) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder,
                    if (wished) "Remove from wishlist" else "Add to wishlist", tint = if (wished) TS.Danger else TS.Black)
            }
            if (!p.inStock) Text("Out of stock", style = MaterialTheme.typography.labelSmall, color = TS.Ivory,
                modifier = Modifier.align(Alignment.BottomStart).padding(8.dp).clip(CircleShape).background(TS.Black.copy(0.8f)).padding(horizontal = 8.dp, vertical = 3.dp))
        }
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(p.name, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
            PriceText(p)
        }
    }
}
