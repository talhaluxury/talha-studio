package com.talhastudio.app.ui.screens

import android.content.Intent
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CardGiftcard
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.talhastudio.app.BuildConfig
import com.talhastudio.app.data.*
import com.talhastudio.app.ui.components.*
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch

/**
 * Shown once, after the welcome slides, to people who are not signed in: "sign up and get Rs. X".
 * It skips itself when the owner has switched both offers off. Google sign-in only (a new account gets the bonus on the server).
 */
@Composable
fun BonusScreen(onDone: () -> Unit) {
    val offers = rememberLoad("offers") { runCatching { Repo.offers() }.getOrDefault(Offers(0, 0)) }
    val o = (offers.state as? Load.Ready)?.data
    val canGoogle = BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank()
    LaunchedEffect(o) { if (o != null && ((o.signupBonus <= 0 && o.referralBonus <= 0) || !canGoogle)) onDone() }
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF1B1408), Color(0xFF0A0A0A), Color(0xFF0A0A0A))))) {
        if (o == null || (o.signupBonus <= 0 && o.referralBonus <= 0)) { Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator(color = TS.Gold) }; return@Box }
        BonusContent(o, onDone)
    }
}

@Composable
private fun BonusContent(o: Offers, onDone: () -> Unit) {
    val ctx = LocalContext.current; val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }; var error by remember { mutableStateOf<String?>(null) }
    var code by remember { mutableStateOf("") }; var showCode by remember { mutableStateOf(false) }
    val pulse by rememberInfiniteTransition(label = "coin").animateFloat(1f, 1.07f, infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "s")
    val amount = if (o.signupBonus > 0) o.signupBonus else o.referralBonus
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().imePadding().padding(horizontal = 28.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Spacer(Modifier.height(20.dp))
        Box(contentAlignment = Alignment.Center) {
            Box(Modifier.size(210.dp).scale(pulse).background(Brush.radialGradient(listOf(Color(0x55E0B65A), Color.Transparent)), CircleShape))
            CoinIcon(132.dp, Modifier.scale(pulse))
        }
        Text(if (o.signupBonus > 0) "Your welcome gift is waiting" else "Join with a friend's code", style = MaterialTheme.typography.headlineMedium, fontFamily = DisplayFont, textAlign = TextAlign.Center)
        Text("Rs. ${"%,d".format(amount)}", fontSize = 46.sp, fontWeight = FontWeight.Black, color = TS.Gold, fontFamily = DisplayFont)
        Text(if (o.signupBonus > 0) "Sign up with Google and this amount lands in your wallet straight away. It is taken off your first order, so your favourite outfit costs less."
             else "Sign up with a friend's referral code and the bonus lands in your wallet straight away.", color = TS.Gray, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyLarge)
        if (o.referralBonus > 0) Surface(shape = RoundedCornerShape(16.dp), color = Color(0x1AB99A62), border = BorderStroke(1.dp, Color(0x55B99A62))) {
            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(Icons.Outlined.CardGiftcard, null, tint = TS.Gold)
                Text("Invite a friend: when they join, you both get Rs. ${"%,d".format(o.referralBonus)} more.", style = MaterialTheme.typography.bodyMedium)
            }
        }
        Spacer(Modifier.height(4.dp))
        TsIconButton(if (busy) "Please wait..." else "Continue with Google", icon = { GoogleLogo(22.dp) }, enabled = !busy, style = TsButtonStyle.Black, onClick = {
            scope.launch {
                busy = true; error = null
                try {
                    val token = try { googleIdToken(ctx) } catch (e: GetCredentialCancellationException) { throw ApiException(false, "Google sign-in was cancelled") }
                        catch (e: GetCredentialException) { throw ApiException(false, "Google sign-in is not available on this device right now") }
                    Repo.googleLogin(token ?: throw ApiException(false, "Google sign-in failed"), code.ifBlank { null })
                    onDone()
                } catch (e: ApiException) { error = e.message } finally { busy = false }
            }
        })
        error?.let { Text(it, color = TS.Danger, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium) }
        if (o.referralBonus > 0) {
            if (!showCode) TextButton({ showCode = true }) { Text("Have a referral code?", color = TS.Gold) }
            else OutlinedTextField(code, { code = it.uppercase().filter { c -> c.isLetterOrDigit() }.take(12) }, Modifier.fillMaxWidth(), label = { Text("Referral code") }, singleLine = true)
        }
        TextButton(onDone, enabled = !busy) { Text("Maybe later", color = TS.Gray) }
    }
}

/** The wallet row on the profile screen: coin + balance, opens the wallet. */
@Composable
fun WalletTile(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val w = rememberLoad("wallet-tile") { runCatching { Repo.wallet() }.getOrNull() }
    val bal = ((w.state as? Load.Ready)?.data)?.balance
    Surface(modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).clickable(onClick = onClick), shape = RoundedCornerShape(20.dp), color = Color(0xFF17130B), border = BorderStroke(1.dp, Color(0x55B99A62))) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            CoinIcon(40.dp)
            Column(Modifier.weight(1f)) { Text("My Wallet", style = MaterialTheme.typography.labelLarge, color = TS.Gray); Text(if (bal == null) "..." else pkr(bal), style = MaterialTheme.typography.titleLarge, color = TS.Gold) }
            Text("Invite & earn  ›", color = TS.Gold, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalletScreen(onBack: () -> Unit) {
    val load = rememberLoad("wallet") { Repo.wallet() }
    val clip = LocalClipboardManager.current; val ctx = LocalContext.current
    var copied by remember { mutableStateOf(false) }
    Scaffold(topBar = { TopAppBar(title = { Text("My Wallet") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Back") } }) }) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (val s = load.state) {
                is Load.Loading -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator(color = TS.Gold) }
                is Load.Error -> ErrorState(s.message, s.offline, load.retry)
                is Load.Ready -> {
                    val w = s.data
                    LazyColumn(contentPadding = PaddingValues(20.dp, 8.dp, 20.dp, 40.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        item {
                            Surface(shape = RoundedCornerShape(26.dp), color = Color.Transparent) {
                                Column(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Color(0xFF3A2B0F), Color(0xFF14100A)))).padding(24.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) { CoinIcon(46.dp); Text("Wallet balance", color = TS.Gray) }
                                    Text(pkr(w.balance), fontSize = 40.sp, fontWeight = FontWeight.Black, color = TS.Gold, fontFamily = DisplayFont)
                                    Text("Taken off your next order automatically, on the price of the items (not delivery).", style = MaterialTheme.typography.bodyMedium, color = TS.Gray)
                                }
                            }
                        }
                        item {
                            Surface(shape = RoundedCornerShape(22.dp), color = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, Color(0x33B99A62))) {
                                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text("Invite friends", style = MaterialTheme.typography.titleMedium)
                                    Text(if (w.referralBonus > 0) "Share your code. When a friend joins with it, you both get ${pkr(w.referralBonus)}." else "Referral rewards are paused right now.", color = TS.Gray, style = MaterialTheme.typography.bodyMedium)
                                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0x1AB99A62)).padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Text(w.referralCode, Modifier.weight(1f), fontSize = 22.sp, fontWeight = FontWeight.Bold, letterSpacing = 3.sp, color = TS.Gold)
                                        IconButton({ clip.setText(AnnotatedString(w.referralCode)); copied = true }) { Icon(Icons.Outlined.ContentCopy, "Copy code", tint = TS.Gold) }
                                    }
                                    if (copied) Text("Code copied", color = TS.Success, style = MaterialTheme.typography.labelMedium)
                                    TsButton("Share with a friend", onClick = {
                                        val msg = "Join Talha Studio with my code ${w.referralCode} and get a bonus in your wallet. Download the app and enter the code when you sign up with Google."
                                        ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, msg) }, "Share your code"))
                                    })
                                    if (w.friends > 0) Text("${w.friends} friend${if (w.friends == 1) "" else "s"} joined · you earned ${pkr(w.earnedFromReferrals)}", color = TS.Gray, style = MaterialTheme.typography.labelLarge)
                                }
                            }
                        }
                        item { Text("History", style = MaterialTheme.typography.titleMedium) }
                        if (w.items.isEmpty()) item { Text("Nothing yet.", color = TS.Gray) }
                        items(w.items, key = { it.id }) { t ->
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) { Text(t.note.ifBlank { t.kind }, style = MaterialTheme.typography.bodyMedium); Text(prettyDate(t.createdAt), color = TS.Gray, style = MaterialTheme.typography.labelSmall) }
                                Text((if (t.amount > 0) "+ " else "- ") + pkr(kotlin.math.abs(t.amount)), color = if (t.amount > 0) TS.Success else MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.SemiBold)
                            }
                            HorizontalDivider(color = Color(0x22FFFFFF))
                        }
                    }
                }
            }
        }
    }
}
