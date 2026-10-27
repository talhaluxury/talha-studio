package com.talhastudio.app.ui.screens

import android.content.Intent
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.talhastudio.app.ShopViewModel
import com.talhastudio.app.data.*
import com.talhastudio.app.push.PushTokens
import com.talhastudio.app.push.notificationsAllowed
import com.talhastudio.app.push.routeFor
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch

/** Asks for the Android 13+ notification permission, with a path to system settings if it was refused. */
@Composable
fun EnableNotificationsCard(modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    var allowed by remember { mutableStateOf(notificationsAllowed(ctx)) }
    var denied by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> allowed = ok; denied = !ok }
    if (allowed) return
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(TS.Neutral.copy(0.6f)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Get delivery updates", style = MaterialTheme.typography.titleMedium)
        Text("Allow notifications to hear when your order is confirmed, shipped and delivered.", style = MaterialTheme.typography.bodyMedium)
        if (denied) {
            Text("Notifications are turned off for this app. You can enable them in system settings.", style = MaterialTheme.typography.labelSmall, color = TS.Gray)
            OutlinedButton({ ctx.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }) { Text("Open settings") }
        } else TsButton("Allow notifications", { if (android.os.Build.VERSION.SDK_INT >= 33) launcher.launch(android.Manifest.permission.POST_NOTIFICATIONS) else allowed = true }, style = TsButtonStyle.Black)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(shop: ShopViewModel, onBack: () -> Unit, onNavigate: (String) -> Unit) {
    var attempt by remember { mutableIntStateOf(0) }
    val load = rememberLoad(attempt) { Repo.notifications(1) }
    val prefsLoad = rememberLoad("prefs") { Repo.notifPrefs() }
    var prefs by remember { mutableStateOf<NotifPrefs?>(null) }
    val scope = rememberCoroutineScope(); val snack = remember { SnackbarHostState() }
    LaunchedEffect(prefsLoad.state) { (prefsLoad.state as? Load.Ready)?.let { if (prefs == null) prefs = it.data } }
    LaunchedEffect(Unit) { PushTokens.sync() }

    fun setPref(o: Boolean? = null, p: Boolean? = null) { scope.launch {
        val before = prefs
        prefs = prefs?.let { NotifPrefs(o ?: it.orderUpdates, p ?: it.promotions) }
        try { prefs = Repo.setNotifPrefs(o, p) } catch (e: ApiException) { prefs = before; snack.showSnackbar(e.message ?: "Could not save") }
    } }

    Scaffold(snackbarHost = { SnackbarHost(snack) }, topBar = {
        TopAppBar(title = { Text("Notifications") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } },
            actions = { TextButton({ scope.launch { try { Repo.markAllNotificationsRead(); shop.refreshUnread(); attempt++ } catch (e: ApiException) { snack.showSnackbar(e.message ?: "Failed") } } }) { Text("Mark all read", color = TS.Gold) } })
    }) { pad ->
        LazyColumn(Modifier.padding(pad), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { EnableNotificationsCard() }
            item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surface).padding(horizontal = 16.dp, vertical = 8.dp)) {
                    val p = prefs
                    PrefRow("Order updates", "Confirmed, shipped, delivered, cancelled", p?.orderUpdates ?: true, p != null) { setPref(o = it) }
                    HorizontalDivider()
                    PrefRow("Offers and news", "New collections and special offers", p?.promotions ?: true, p != null) { setPref(p = it) }
                }
            }
            when (val s = load.state) {
                is Load.Loading -> item { SkeletonBox(Modifier.fillMaxWidth().height(90.dp)) }
                is Load.Error -> item { ErrorState(s.message, s.offline, load.retry) }
                is Load.Ready -> {
                    if (s.data.items.isEmpty()) item { EmptyState("No notifications yet", "Order updates and offers will appear here.") }
                    items(s.data.items, key = { it.id }) { n ->
                        var read by remember(n.id) { mutableStateOf(n.read) }
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surface)
                            .clickable { scope.launch {
                                if (!read) { read = true; runCatching { Repo.markNotificationRead(n.id); shop.refreshUnread() } }
                                routeFor(n.deepLink)?.let(onNavigate)
                            } }.padding(14.dp), verticalAlignment = Alignment.Top) {
                            Box(Modifier.padding(top = 6.dp).size(9.dp).clip(CircleShape).background(if (read) TS.Neutral else TS.Gold))
                            Column(Modifier.padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(n.title, style = MaterialTheme.typography.titleMedium)
                                Text(n.body, style = MaterialTheme.typography.bodyMedium)
                                Text(prettyDate(n.createdAt), style = MaterialTheme.typography.labelSmall, color = TS.Gray)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PrefRow(title: String, sub: String, checked: Boolean, enabled: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.bodyLarge); Text(sub, style = MaterialTheme.typography.labelSmall, color = TS.Gray) }
        Switch(checked, onChange, enabled = enabled)
    }
}
