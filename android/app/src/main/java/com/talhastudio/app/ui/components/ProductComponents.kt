package com.talhastudio.app.ui.components

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
fun ImageTile(url: String?, label: String, modifier: Modifier = Modifier, fit: ContentScale = ContentScale.Crop, onRatio: ((Float) -> Unit)? = null, alignment: Alignment = Alignment.Center) {
    Box(modifier.background(TS.Neutral), contentAlignment = Alignment.Center) {
        if (url != null) AsyncImage(
            model = coil.request.ImageRequest.Builder(androidx.compose.ui.platform.LocalContext.current).data(url).crossfade(250).build(),
            contentDescription = label, modifier = Modifier.fillMaxSize(), contentScale = fit, alignment = alignment,
            onSuccess = { st -> val sz = st.painter.intrinsicSize; if (sz.width > 0f && sz.height > 0f) onRatio?.invoke(sz.width / sz.height) })
        else Text(label.take(1), style = MaterialTheme.typography.displayLarge, color = TS.Gold)
    }
}
@Composable
fun ProductImage(p: Product, modifier: Modifier = Modifier) {
    // The tile takes the photo's own shape, so the whole photo shows (never cut) and there are no empty bars at the sides.
    var ratio by remember(p.thumbUrl) { mutableStateOf(0.67f) }
    ImageTile(p.thumbUrl, p.name, modifier.aspectRatio(ratio), ContentScale.Fit, onRatio = { ratio = it.coerceIn(0.6f, 0.8f) })
}

@Composable
fun PriceText(p: Product) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(pkr(p.effectivePrice), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
        if (p.salePrice != null) Text(pkr(p.price), style = MaterialTheme.typography.bodyMedium.copy(textDecoration = TextDecoration.LineThrough), color = TS.Gray)
    }
}

/** Every card has exactly the same size: the photo always fills a 3:4 frame (cropped from the top, so faces and necklines stay in view) and the name always takes two lines. */
@Composable
fun ProductCard(
    p: Product, wished: Boolean, onClick: () -> Unit, onToggleWish: () -> Unit, modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(18.dp)
    val press = remember { MutableInteractionSource() }
    Column(modifier.pressScale(press).clip(shape).background(MaterialTheme.colorScheme.surface).border(0.7.dp, TS.Gold.copy(alpha = 0.28f), shape)
        .clickable(interactionSource = press, indication = LocalIndication.current, onClick = onClick)) {
        Box {
            ImageTile(p.thumbUrl, p.name, Modifier.fillMaxWidth().aspectRatio(0.75f), ContentScale.Crop, alignment = Alignment.TopCenter)
            p.discountPercent?.let { SaleBadge(it, Modifier.padding(8.dp)) }
            IconButton(onToggleWish, Modifier.align(Alignment.TopEnd).padding(4.dp).size(40.dp)) {
                Icon(if (wished) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder,
                    if (wished) "Remove from wishlist" else "Add to wishlist", tint = if (wished) TS.Danger else TS.Black)
            }
            if (!p.inStock) Text(tr("Out of stock"), style = MaterialTheme.typography.labelSmall, color = TS.Ivory,
                modifier = Modifier.align(Alignment.BottomStart).padding(8.dp).clip(CircleShape).background(TS.Black.copy(0.8f)).padding(horizontal = 8.dp, vertical = 3.dp))
        }
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(p.name, style = MaterialTheme.typography.bodyLarge, maxLines = 2, minLines = 2, overflow = TextOverflow.Ellipsis)
            PriceText(p)
        }
    }
}
