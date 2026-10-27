package com.talhastudio.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForwardIos
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.talhastudio.app.data.ApiException
import com.talhastudio.app.data.Repo
import com.talhastudio.app.data.Session
import com.talhastudio.app.ui.components.TsButton
import com.talhastudio.app.ui.components.TsButtonStyle
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch

@Composable
fun ProfileScreen(onSignIn: () -> Unit, onOrders: () -> Unit, onAddresses: () -> Unit, onNotifications: () -> Unit, onSupport: () -> Unit, onSettings: () -> Unit, onOpenPage: (String) -> Unit) {
    val user = Session.user
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    Box(Modifier.fillMaxSize()) {
        LazyColumn(contentPadding = PaddingValues(20.dp, 8.dp, 20.dp, 120.dp)) {
            item {
                Text("Profile", style = MaterialTheme.typography.headlineMedium); Spacer(Modifier.height(8.dp))
                if (user == null) {
                    Text("Sign in to place orders, track them and save your addresses.", style = MaterialTheme.typography.bodyMedium, color = TS.Gray)
                    Spacer(Modifier.height(16.dp)); TsButton("Sign In / Create Account", onSignIn)
                } else {
                    Text(user.fullName, style = MaterialTheme.typography.titleLarge); Text(user.email, style = MaterialTheme.typography.bodyMedium, color = TS.Gray)
                }
                Spacer(Modifier.height(12.dp))
            }
            if (user != null) {
                item { MenuRow("My Orders", onOrders) }; item { MenuRow("My Addresses", onAddresses) }
                item { MenuRow("Notifications", onNotifications) }
            }
            item { MenuRow("Help & Support", onSupport) }
            item { MenuRow("Shipping & Returns") { onOpenPage("returns") } }
            item { MenuRow("Privacy Policy") { onOpenPage("privacy") } }
            item { MenuRow("About Talha Studio") { onOpenPage("about") } }
            item { MenuRow("Settings", onSettings) }
        }
        SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).padding(bottom = 110.dp))
    }
}

@Composable
private fun MenuRow(title: String, onClick: () -> Unit) {
    androidx.compose.foundation.layout.Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        Icon(Icons.AutoMirrored.Outlined.ArrowForwardIos, null, Modifier.size(14.dp), tint = TS.Gray)
    }
    HorizontalDivider()
}
