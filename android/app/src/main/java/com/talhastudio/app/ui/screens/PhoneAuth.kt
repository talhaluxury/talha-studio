package com.talhastudio.app.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.talhastudio.app.R
import com.talhastudio.app.data.ApiException
import com.talhastudio.app.data.Repo
import com.talhastudio.app.ui.components.TsButton
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch

@Composable
private fun darkFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = TS.Ivory, unfocusedTextColor = TS.Ivory, cursorColor = TS.Gold,
    focusedBorderColor = TS.Gold, unfocusedBorderColor = TS.Ivory.copy(0.25f),
    focusedLabelColor = TS.Gold, unfocusedLabelColor = TS.Ivory.copy(0.6f),
    errorBorderColor = TS.Danger, errorLabelColor = TS.Danger, errorTextColor = TS.Ivory,
    focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent,
)

/** Sign in or sign up with a mobile number + password, then [onDone] opens the chat. */
@Composable
fun PhoneAuthScreen(onBack: () -> Unit, onDone: () -> Unit) {
    var creating by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }; var phone by remember { mutableStateOf("") }; var password by remember { mutableStateOf("") }
    var show by remember { mutableStateOf(false) }; var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }; var fieldErrors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    val scope = rememberCoroutineScope()

    fun validate(): Boolean {
        val e = mutableMapOf<String, String>()
        if (creating && name.trim().length < 2) e["fullName"] = "Enter your name"
        if (phone.count { it.isDigit() } < 10) e["phone"] = "Enter your mobile number, e.g. 0300 1234567"
        if (creating && password.length < 6) e["password"] = "At least 6 characters"
        if (!creating && password.isEmpty()) e["password"] = "Enter your password"
        fieldErrors = e; return e.isEmpty()
    }
    fun submit() { if (!validate()) return; scope.launch {
        busy = true; error = null
        try { if (creating) Repo.phoneRegister(name.trim(), phone.trim(), password) else Repo.phoneLogin(phone.trim(), password); onDone() }
        catch (e: ApiException) { error = e.message; fieldErrors = e.fields } finally { busy = false }
    } }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF1A1610), TS.Black)))) {
        Column(Modifier.fillMaxSize().systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp)) {
            IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back", tint = TS.Ivory) }
            Spacer(Modifier.height(8.dp))
            Image(painterResource(R.drawable.talha_logo), null, Modifier.size(84.dp).align(Alignment.CenterHorizontally)
                .shadow(24.dp, RoundedCornerShape(22.dp), ambientColor = TS.Gold, spotColor = TS.Gold).clip(RoundedCornerShape(22.dp)))
            Spacer(Modifier.height(20.dp))
            Text(if (creating) "Join with your number" else "Sign in with your number", fontFamily = DisplayFont, style = MaterialTheme.typography.headlineMedium, color = TS.Ivory,
                modifier = Modifier.align(Alignment.CenterHorizontally))
            Text("Chat with Talha Studio and see our daily updates.", color = TS.Ivory.copy(0.65f), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 6.dp, bottom = 24.dp))
            Column(Modifier.fillMaxWidth().shadow(18.dp, RoundedCornerShape(24.dp), ambientColor = TS.Gold.copy(0.4f), spotColor = TS.Gold.copy(0.4f))
                .clip(RoundedCornerShape(24.dp)).background(Color(0xFF151515)).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (creating) OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Your name") }, singleLine = true, colors = darkFieldColors(),
                    isError = fieldErrors["fullName"] != null, supportingText = fieldErrors["fullName"]?.let { { Text(it) } })
                OutlinedTextField(phone, { phone = it.take(18) }, Modifier.fillMaxWidth(), label = { Text("Mobile number") }, placeholder = { Text("0300 1234567") }, singleLine = true, colors = darkFieldColors(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), isError = fieldErrors["phone"] != null, supportingText = fieldErrors["phone"]?.let { { Text(it) } })
                OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Password") }, singleLine = true, colors = darkFieldColors(),
                    visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    isError = fieldErrors["password"] != null, supportingText = fieldErrors["password"]?.let { { Text(it) } },
                    trailingIcon = { TextButton({ show = !show }) { Text(if (show) "Hide" else "Show", color = TS.Gold) } })
                error?.let { Text(it, color = Color(0xFFFFB4AB), style = MaterialTheme.typography.bodyMedium) }
                TsButton(if (busy) "Please wait..." else if (creating) "Create account & open chat" else "Sign in & open chat", { submit() }, enabled = !busy)
            }
            if (creating) Text("By creating an account you agree to receive WhatsApp messages about your account and orders from Talha Studio.", color = TS.Ivory.copy(0.5f),
                style = MaterialTheme.typography.labelSmall, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 12.dp, start = 8.dp, end = 8.dp))
            TextButton({ creating = !creating; error = null; fieldErrors = emptyMap() }, Modifier.align(Alignment.CenterHorizontally).padding(top = 8.dp)) {
                Text(if (creating) "I already have an account" else "New here? Create an account", color = TS.Gold)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
