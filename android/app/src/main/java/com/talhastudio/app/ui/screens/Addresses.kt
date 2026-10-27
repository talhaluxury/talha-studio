package com.talhastudio.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.talhastudio.app.data.*
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddressesScreen(onBack: () -> Unit) {
    var attempt by remember { mutableIntStateOf(0) }
    val load = rememberLoad(attempt) { Repo.addresses() }
    var adding by remember { mutableStateOf(false) }
    val snack = remember { SnackbarHostState() }; val scope = rememberCoroutineScope()
    Scaffold(snackbarHost = { SnackbarHost(snack) }, topBar = { TopAppBar(title = { Text("My Addresses") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } }) }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (val s = load.state) {
                is Load.Loading -> ProductGridSkeleton()
                is Load.Error -> ErrorState(s.message, s.offline, load.retry)
                is Load.Ready -> LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (s.data.isEmpty()) item { EmptyState("No saved addresses", "Add one to speed up checkout.") }
                    items(s.data, key = { it.id }) { a ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surface).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(a.recipient + if (a.isDefault) "  (default)" else "", style = MaterialTheme.typography.titleMedium)
                                Text(a.phone, style = MaterialTheme.typography.bodyMedium, color = TS.Gray)
                                Text(listOfNotNull(a.line1, a.line2, a.city, a.province, a.postalCode).joinToString(", "), style = MaterialTheme.typography.bodyMedium)
                            }
                            IconButton({ scope.launch { try { Repo.deleteAddress(a.id); attempt++ } catch (e: ApiException) { snack.showSnackbar(e.message ?: "Could not delete") } } }) { Icon(Icons.Outlined.Delete, "Delete address", tint = TS.Gray) }
                        }
                    }
                    item { TsButton("Add new address", { adding = true }, style = TsButtonStyle.Black) }
                }
            }
        }
    }
    if (adding) {
        var f by remember { mutableStateOf(CheckoutForm(Session.user?.fullName.orEmpty(), "", Session.user?.phone.orEmpty(), "", "", "", "", "", "")) }
        var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }; var busy by remember { mutableStateOf(false) }
        AlertDialog({ if (!busy) adding = false }, title = { Text("New address") },
            text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Field("Full name", f.name, { f = f.copy(name = it) }, errors["name"]); Field("Phone", f.phone, { f = f.copy(phone = it.take(16)) }, errors["phone"], KeyboardType.Phone)
                Field("Street address", f.line1, { f = f.copy(line1 = it) }, errors["line1"]); Field("Apartment, landmark", f.line2, { f = f.copy(line2 = it) })
                Field("City", f.city, { f = f.copy(city = it) }, errors["city"]); Field("Province", f.province, { f = f.copy(province = it) }); Field("Postal code", f.postalCode, { f = f.copy(postalCode = it.take(12)) }, type = KeyboardType.Number)
            } },
            confirmButton = { TextButton({
                errors = validateCheckout(f.copy(email = "x@x.co")); if (errors.isNotEmpty()) return@TextButton
                busy = true; scope.launch { try { Repo.saveAddress(f, isDefault = false); adding = false; attempt++ } catch (e: ApiException) { snack.showSnackbar(e.message ?: "Could not save") } finally { busy = false } }
            }, enabled = !busy) { Text("Save", color = TS.Gold) } },
            dismissButton = { TextButton({ adding = false }, enabled = !busy) { Text("Cancel") } })
    }
}
