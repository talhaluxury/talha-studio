package com.talhastudio.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForwardIos
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.talhastudio.app.data.*
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch

/** Policy / About pages are written by the store owner in the admin panel and loaded live. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InfoPageScreen(slug: String, onBack: () -> Unit) {
    val load = rememberLoad(slug) { Repo.page(slug) }
    Scaffold(topBar = { TopAppBar(title = { Text((load.state as? Load.Ready)?.data?.title ?: "") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } }) }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (val s = load.state) {
                is Load.Loading -> Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { SkeletonBox(Modifier.fillMaxWidth().height(26.dp)); SkeletonBox(Modifier.fillMaxWidth().height(90.dp)); SkeletonBox(Modifier.fillMaxWidth().height(90.dp)) }
                is Load.Error -> ErrorState(s.message, s.offline, load.retry)
                is Load.Ready -> Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    parsePageBody(s.data.body).forEach { b -> when (b) {
                        is PageBlock.Heading -> Text(b.text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 10.dp))
                        is PageBlock.Para -> Text(b.text, style = MaterialTheme.typography.bodyLarge)
                    } }
                    if (s.data.contact.isNotEmpty()) { HorizontalDivider(Modifier.padding(vertical = 8.dp)); s.data.contact.forEach { Text(it, style = MaterialTheme.typography.bodyMedium, color = TS.Gray) } }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupportScreen(onBack: () -> Unit, onOpenPage: (String) -> Unit) {
    val load = rememberLoad("store-info") { Repo.storeInfo() }
    val ctx = LocalContext.current
    Scaffold(topBar = { TopAppBar(title = { Text("Help & Support") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } }) }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (val s = load.state) {
                is Load.Loading -> Column(Modifier.padding(20.dp)) { SkeletonBox(Modifier.fillMaxWidth().height(120.dp)) }
                is Load.Error -> ErrorState(s.message, s.offline, load.retry)
                is Load.Ready -> { val i = s.data
                    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        item { Text("We are happy to help with orders, sizing and returns.", style = MaterialTheme.typography.bodyLarge) }
                        if (i.supportEmail != null) item { TsButton("Email ${i.supportEmail}", { runCatching { ctx.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:${i.supportEmail}")).putExtra(Intent.EXTRA_SUBJECT, "Question about my order")) } }, style = TsButtonStyle.Black) }
                        if (i.supportPhone != null) item { TsButton("Call ${i.supportPhone}", { runCatching { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + i.supportPhone.filter { c -> c.isDigit() || c == '+' }))) } }, style = TsButtonStyle.Outline) }
                        if (i.supportEmail == null && i.supportPhone == null) item { Text("Contact details have not been added yet. Please check back soon.", color = TS.Gray) }
                        i.address?.let { a -> item { Text(a, style = MaterialTheme.typography.bodyMedium, color = TS.Gray) } }
                        i.estimatedDelivery?.let { d -> item { Text("Estimated delivery: $d", style = MaterialTheme.typography.bodyMedium) } }
                        item { Text("Good to know", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
                        item { Text("Delivery fee: ${if (i.shipping.first == 0) "free" else pkr(i.shipping.first)}${if (i.shipping.second > 0) ", free over ${pkr(i.shipping.second)}" else ""}. Returns accepted within ${i.returnWindowDays} days of delivery. Payment: Cash on Delivery.", style = MaterialTheme.typography.bodyMedium) }
                        items(i.pages.size) { n -> val (slug, title) = i.pages[n]; LinkRow(title) { onOpenPage(slug) } }
                    } }
            }
        }
    }
}

@Composable
fun LinkRow(title: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge); Icon(Icons.AutoMirrored.Outlined.ArrowForwardIos, null, Modifier.size(14.dp), tint = TS.Gray)
    }
    HorizontalDivider()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onBack: () -> Unit, onNotifications: () -> Unit, onOpenPage: (String) -> Unit, onSignedOut: () -> Unit) {
    val user = Session.user; val ctx = LocalContext.current; val scope = rememberCoroutineScope(); val snack = remember { SnackbarHostState() }
    var exporting by remember { mutableStateOf(false) }; var exported by remember { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf(false) }; var pw by remember { mutableStateOf("") }; var busy by remember { mutableStateOf(false) }
    Scaffold(snackbarHost = { SnackbarHost(snack) }, topBar = { TopAppBar(title = { Text("Settings") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } }) }) { pad ->
        Column(Modifier.padding(pad).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)) {
            if (user != null) {
                Text("Account", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)); Text("${user.fullName} · ${user.email}", color = TS.Gray, style = MaterialTheme.typography.bodyMedium)
                LinkRow("Notifications", onNotifications)
                LinkRow(if (exporting) "Preparing your data..." else "Download my data") { if (!exporting) { exporting = true; scope.launch {
                    try { exported = Repo.exportMyData() } catch (e: ApiException) { snack.showSnackbar(e.message ?: "Could not prepare your data") } finally { exporting = false } } } }
            }
            Text("Legal", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
            LinkRow("Privacy Policy") { onOpenPage("privacy") }; LinkRow("Terms of Service") { onOpenPage("terms") }
            Text("Talha Studio ${com.talhastudio.app.BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.labelSmall, color = TS.Gray, modifier = Modifier.padding(top = 16.dp))
            if (user != null) {
                Spacer(Modifier.height(20.dp))
                TsButton("Sign out", { scope.launch { Repo.logout(); onSignedOut() } }, style = TsButtonStyle.Outline)
                TextButton({ deleting = true }, Modifier.fillMaxWidth()) { Text("Delete my account", color = TS.Danger) }
            }
            Spacer(Modifier.height(32.dp))
        }
    }
    exported?.let { text -> AlertDialog({ exported = null }, title = { Text("Your data") },
        text = { Text("A copy of your profile, addresses and orders is ready. Share or save it somewhere safe; it contains personal details.", style = MaterialTheme.typography.bodyMedium) },
        confirmButton = { TextButton({ ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, "My Talha Studio data").putExtra(Intent.EXTRA_TEXT, text), "Share my data")); exported = null }) { Text("Share", color = TS.Gold) } },
        dismissButton = { TextButton({ exported = null }) { Text("Close") } }) }
    if (deleting) AlertDialog({ if (!busy) deleting = false }, title = { Text("Delete your account?") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Your profile, saved addresses and notification devices are erased. Past orders are kept by the store for accounting. This cannot be undone.", style = MaterialTheme.typography.bodyMedium)
            OutlinedTextField(pw, { pw = it }, Modifier.fillMaxWidth(), label = { Text("Password (leave empty if you use Google)") }, singleLine = true, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation()) } },
        confirmButton = { TextButton({ busy = true; scope.launch { try { Repo.deleteAccount(pw.ifBlank { null }); deleting = false; onSignedOut() } catch (e: ApiException) { snack.showSnackbar(e.message ?: "Could not delete account") } finally { busy = false } } }, enabled = !busy) { Text("Delete", color = TS.Danger) } },
        dismissButton = { TextButton({ deleting = false }, enabled = !busy) { Text("Cancel") } })
}
