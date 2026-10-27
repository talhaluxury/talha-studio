package com.talhastudio.app.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.talhastudio.app.ui.theme.TS

data class NavItem(val label: String, val icon: ImageVector)

/**
 * Floating "liquid" bar: a translucent black pill with a gold blob that springs between tabs
 * (overshoot gives the liquid feel). Badge shows live counts (cart).
 */
@Composable
fun LiquidBottomBar(
    items: List<NavItem>, selected: Int, badges: Map<Int, Int> = emptyMap(),
    onSelect: (Int) -> Unit, modifier: Modifier = Modifier,
) {
    val pos by animateFloatAsState(
        targetValue = selected.toFloat(),
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "blob",
    )
    Surface(
        modifier = modifier.padding(horizontal = 16.dp, vertical = 10.dp).navigationBarsPadding().height(68.dp),
        shape = RoundedCornerShape(34.dp),
        color = TS.Black.copy(alpha = 0.88f),
        border = BorderStroke(0.8.dp, Color.White.copy(alpha = 0.14f)),
        shadowElevation = 14.dp,
    ) {
        BoxWithConstraints(Modifier.fillMaxSize().padding(horizontal = 6.dp, vertical = 6.dp)) {
            val slot = maxWidth / items.size
            // Gold blob, slides + stretches slightly while moving.
            val stretch = 1f + kotlin.math.abs(pos - pos.let { kotlin.math.round(it) }) * 0.5f
            Box(
                Modifier.offset(x = slot * pos).width(slot).fillMaxHeight().padding(horizontal = 4.dp)
                    .graphicsLayer { scaleX = stretch }
                    .clip(CircleShape).background(TS.Gold.copy(alpha = 0.95f))
            )
            Row(Modifier.fillMaxSize()) {
                items.forEachIndexed { i, item ->
                    val active = i == selected
                    Box(
                        Modifier.weight(1f).fillMaxHeight()
                            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Tab) { onSelect(i) }
                            .semantics { contentDescription = item.label },
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            BadgedBox(badge = {
                                val n = badges[i] ?: 0
                                if (n > 0) Badge(containerColor = TS.Danger, contentColor = Color.White) { Text(n.toString()) }
                            }) {
                                Icon(item.icon, null, tint = if (active) TS.Black else Color.White.copy(0.75f), modifier = Modifier.size(22.dp))
                            }
                            Text(item.label, style = MaterialTheme.typography.labelSmall, color = if (active) TS.Black else Color.White.copy(0.75f))
                        }
                    }
                }
            }
        }
    }
}
