package com.talhastudio.app.ui.screens

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.talhastudio.app.BuildConfig
import com.talhastudio.app.data.ApiException
import com.talhastudio.app.data.Repo
import com.talhastudio.app.ui.components.TsButton
import com.talhastudio.app.ui.components.TsButtonStyle
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch

private suspend fun googleIdToken(ctx: Context): String? {
    val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).build()
    val res = CredentialManager.create(ctx).getCredential(ctx, GetCredentialRequest.Builder().addCredentialOption(option).build())
    val c = res.credential
    return if (c is CustomCredential && c.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) GoogleIdTokenCredential.createFrom(c.data).idToken else null
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuthScreen(onBack: () -> Unit, onDone: () -> Unit) {
    var creating by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }; var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }; var password by remember { mutableStateOf("") }
    var show by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var fieldErrors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    val scope = rememberCoroutineScope(); val ctx = LocalContext.current

    fun validate(): Boolean {
        val e = mutableMapOf<String, String>()
        if (creating && name.trim().length < 2) e["fullName"] = "Enter your full name"
        if (!Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$").matches(email.trim())) e["email"] = "Enter a valid email"
        if (creating && password.length < 8) e["password"] = "At least 8 characters"
        if (!creating && password.isEmpty()) e["password"] = "Enter your password"
        fieldErrors = e; return e.isEmpty()
    }
    fun submit(block: suspend () -> Unit) { scope.launch {
        busy = true; error = null
        try { block(); onDone() } catch (e: ApiException) { error = e.message; fieldErrors = e.fields } finally { busy = false }
    } }

    Scaffold(topBar = { TopAppBar(title = {}, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } }) }) { pad ->
        Column(Modifier.padding(pad).verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).imePadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(if (creating) "Create your account" else "Welcome back", style = MaterialTheme.typography.headlineMedium)
            Text(if (creating) "Track orders and save your delivery details." else "Sign in to place and track your orders.", color = TS.Gray, style = MaterialTheme.typography.bodyMedium)
            if (creating) Field("Full name", name, { name = it }, fieldErrors["fullName"])
            Field("Email", email, { email = it }, fieldErrors["email"], KeyboardType.Email)
            if (creating) Field("Phone (optional)", phone, { phone = it.take(16) }, fieldErrors["phone"], KeyboardType.Phone)
            OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Password") }, singleLine = true, isError = fieldErrors["password"] != null,
                supportingText = fieldErrors["password"]?.let { { Text(it) } }, visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), trailingIcon = { TextButton({ show = !show }) { Text(if (show) "Hide" else "Show", color = TS.Gold) } })
            error?.let { Text(it, color = TS.Danger, style = MaterialTheme.typography.bodyMedium) }
            TsButton(if (busy) "Please wait..." else if (creating) "Create account" else "Sign in", enabled = !busy, style = TsButtonStyle.Black, onClick = {
                if (validate()) submit { if (creating) Repo.register(name.trim(), email.trim().lowercase(), password, phone.ifBlank { null }) else Repo.login(email.trim().lowercase(), password) }
            })
            if (BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank()) TsButton("Continue with Google", enabled = !busy, style = TsButtonStyle.Outline, onClick = {
                submit {
                    val token = try { googleIdToken(ctx) } catch (e: GetCredentialCancellationException) { throw ApiException(false, "Google sign-in was cancelled") }
                        catch (e: GetCredentialException) { throw ApiException(false, "Google sign-in is not available on this device right now") }
                    Repo.googleLogin(token ?: throw ApiException(false, "Google sign-in failed"))
                }
            })
            TextButton({ creating = !creating; error = null; fieldErrors = emptyMap() }, Modifier.align(androidx.compose.ui.Alignment.CenterHorizontally)) {
                Text(if (creating) "I already have an account" else "New here? Create an account", color = TS.Gold)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
fun Field(label: String, value: String, onChange: (String) -> Unit, error: String? = null, type: KeyboardType = KeyboardType.Text, modifier: Modifier = Modifier, minLines: Int = 1) {
    OutlinedTextField(value, onChange, modifier.fillMaxWidth(), label = { Text(label) }, singleLine = minLines == 1, minLines = minLines, isError = error != null,
        supportingText = error?.let { { Text(it) } }, keyboardOptions = KeyboardOptions(keyboardType = type))
}
