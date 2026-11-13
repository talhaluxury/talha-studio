package com.talhastudio.app.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForwardIos
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material.icons.outlined.SupportAgent
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.talhastudio.app.R
import com.talhastudio.app.data.Session
import com.talhastudio.app.data.contactLine
import com.talhastudio.app.ui.components.TsButton
import com.talhastudio.app.ui.components.staggerIn
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS

private val GoldLight = Color(0xFFE9CF98)
private val CardEdge = TS.Gold.copy(alpha = 0.30f)

@Composable
fun ProfileScreen(onSignIn: () -> Unit, onOrders: () -> Unit, onAddresses: () -> Unit, onNotifications: () -> Unit, onSupport: () -> Unit, onSettings: () -> Unit, onOpenPage: (String) -> Unit, onSeller: () -> Unit = {}) {
    val user = Session.user
    LazyColumn(contentPadding = PaddingValues(20.dp, 12.dp, 20.dp, 130.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { Text("My Account", style = MaterialTheme.typography.headlineMedium, fontFamily = DisplayFont, modifier = Modifier.staggerIn(0)) }
        item {
            Box(Modifier.staggerIn(1)) {
                if (user == null) GuestCard(onSignIn)
                else MemberCard(user.fullName, user.contactLine)
            }
        }
        if (user != null) item {
            Row(Modifier.staggerIn(2), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                QuickTile("Orders", Icons.Outlined.Inventory2, onOrders, Modifier.weight(1f))
                QuickTile("Addresses", Icons.Outlined.LocationOn, onAddresses, Modifier.weight(1f))
                QuickTile("Alerts", Icons.Outlined.Notifications, onNotifications, Modifier.weight(1f))
            }
        }
        item {
            Column(Modifier.staggerIn(3), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                GroupLabel("SELL")
                MenuGroup(listOf(MenuItem("Seller account", Icons.Outlined.Storefront, onSeller)))
                GroupLabel("HELP")
                MenuGroup(listOf(
                    MenuItem("Help & Support", Icons.Outlined.SupportAgent, onSupport),
                    MenuItem("Shipping & Returns", Icons.Outlined.LocalShipping) { onOpenPage("returns") },
                ))
            }
        }
        item {
            Column(Modifier.staggerIn(4), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                GroupLabel("ABOUT")
                MenuGroup(listOf(
                    MenuItem("Privacy Policy", Icons.Outlined.PrivacyTip) { onOpenPage("privacy") },
                    MenuItem("About Talha Studio", Icons.Outlined.Info) { onOpenPage("about") },
                    MenuItem("Settings", Icons.Outlined.Settings, onSettings),
                ))
            }
        }
        item {
            Text("TALHA STUDIO", Modifier.fillMaxWidth().staggerIn(5), textAlign = TextAlign.Center, color = TS.Gold, fontFamily = DisplayFont, letterSpacing = 4.sp, style = MaterialTheme.typography.labelLarge)
            Text("Elegance in every thread", Modifier.fillMaxWidth(), textAlign = TextAlign.Center, color = TS.Gray, style = MaterialTheme.typography.labelSmall)
        }
    }
}

/** Signed-in header: dark card with a soft gold glow, a gold-ringed avatar with the customer's initials, name and contact. */
@Composable
private fun MemberCard(name: String, contact: String) {
    val shape = RoundedCornerShape(24.dp)
    val initials = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2).joinToString("") { it.first().uppercase() }.ifEmpty { "T" }
    Box(Modifier.fillMaxWidth().clip(shape).background(Brush.linearGradient(listOf(Color(0xFF1E1B16), Color(0xFF0E0E0E)))).border(1.dp, CardEdge, shape)) {
        Box(Modifier.align(Alignment.TopEnd).size(150.dp).background(Brush.radialGradient(listOf(TS.Gold.copy(alpha = 0.22f), Color.Transparent))))
        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(68.dp).border(2.dp, Brush.sweepGradient(listOf(GoldLight, TS.Gold, Color(0xFF8A6A32), GoldLight)), CircleShape).padding(5.dp).clip(CircleShape).background(Color(0xFF181818)), contentAlignment = Alignment.Center) {
                Text(initials, fontFamily = DisplayFont, color = TS.Gold, style = MaterialTheme.typography.titleLarge)
            }
            Column(Modifier.padding(start = 16.dp)) {
                Text(name, style = MaterialTheme.typography.titleLarge, color = TS.Ivory, maxLines = 1)
                if (contact.isNotBlank()) Text(contact, style = MaterialTheme.typography.bodyMedium, color = TS.Ivory.copy(alpha = 0.6f), maxLines = 1)
            }
        }
    }
}

/** Signed-out header: a welcome card that says why signing in is worth it. */
@Composable
private fun GuestCard(onSignIn: () -> Unit) {
    val shape = RoundedCornerShape(24.dp)
    Column(Modifier.fillMaxWidth().clip(shape).background(Brush.linearGradient(listOf(Color(0xFF1E1B16), Color(0xFF0E0E0E)))).border(1.dp, CardEdge, shape).padding(22.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Image(painterResource(R.drawable.talha_logo), "Talha Studio", Modifier.size(64.dp).clip(RoundedCornerShape(16.dp)))
        Text("Welcome to Talha Studio", style = MaterialTheme.typography.titleLarge, fontFamily = DisplayFont, color = TS.Ivory)
        Text("Sign in to place orders, track them live and save your delivery addresses.", style = MaterialTheme.typography.bodyMedium, color = TS.Ivory.copy(alpha = 0.65f), textAlign = TextAlign.Center)
        Spacer(Modifier.height(4.dp))
        TsButton("Sign In / Create Account", onSignIn)
    }
}

@Composable
private fun QuickTile(label: String, icon: ImageVector, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(20.dp)
    Column(modifier.clip(shape).background(MaterialTheme.colorScheme.surface).border(0.8.dp, CardEdge, shape).clickable(onClick = onClick).padding(vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        IconBadge(icon)
        Text(label, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun IconBadge(icon: ImageVector) {
    Box(Modifier.size(42.dp).clip(CircleShape).background(Brush.linearGradient(listOf(TS.Gold.copy(alpha = 0.28f), TS.Gold.copy(alpha = 0.10f)))).border(0.8.dp, TS.Gold.copy(alpha = 0.5f), CircleShape), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = TS.Gold, modifier = Modifier.size(22.dp))
    }
}

@Composable
private fun GroupLabel(text: String) = Text(text, style = MaterialTheme.typography.labelSmall, color = TS.Gold, letterSpacing = 2.sp, modifier = Modifier.padding(start = 6.dp))

private class MenuItem(val title: String, val icon: ImageVector, val onClick: () -> Unit)

@Composable
private fun MenuGroup(items: List<MenuItem>) {
    val shape = RoundedCornerShape(20.dp)
    Column(Modifier.fillMaxWidth().clip(shape).background(MaterialTheme.colorScheme.surface).border(0.8.dp, CardEdge, shape)) {
        items.forEachIndexed { i, m ->
            Row(Modifier.fillMaxWidth().clickable(onClick = m.onClick).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                IconBadge(m.icon)
                Text(m.title, Modifier.weight(1f).padding(start = 14.dp), style = MaterialTheme.typography.bodyLarge)
                Icon(Icons.AutoMirrored.Outlined.ArrowForwardIos, null, Modifier.size(14.dp), tint = TS.Gray)
            }
            if (i < items.lastIndex) HorizontalDivider(Modifier.padding(start = 72.dp), color = MaterialTheme.colorScheme.outline)
        }
    }
}
