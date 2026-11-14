package com.talhastudio.app.ui.screens

import android.content.Intent
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.graphicsLayer
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
 * It skips itself when the owner has switched both offers off. Google sign-in only. The bonus is added on the server.
 */
@Composable
fun BonusScreen(onDone: () -> Unit, onOther: () -> Unit, onBack: () -> Unit) {
    val offers = rememberLoad("offers") { runCatching { Repo.offers() }.getOrDefault(Offers(0, 0)) }
    val o = (offers.state as? Load.Ready)?.data
    val canGoogle = BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank()
    LaunchedEffect(o) { if (o != null && ((o.signupBonus <= 0 && o.referralBonus <= 0) || !canGoogle)) onOther() }   // offers off: straight to the normal sign-in
    // Own colours on purpose: this screen is a bright, colourful moment, so every colour is set here and nothing depends on the app theme.
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF1D0B45), Color(0xFF4B1D8F), Color(0xFFB02A7E), Color(0xFFFF7A45))))) {
        Sparkles()
        if (o == null || (o.signupBonus <= 0 && o.referralBonus <= 0)) { Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator(color = Color.White) }; return@Box }
        BonusContent(o, onDone, onOther, onBack)
    }
}

/** Slowly drifting sparkles behind the content. */
@Composable
private fun Sparkles() {
    val t by rememberInfiniteTransition(label = "sp").animateFloat(0f, 1f, infiniteRepeatable(tween(9000, easing = LinearEasing)), label = "t")
    val dots = remember { List(26) { Triple((it * 37 % 100) / 100f, (it * 53 % 100) / 100f, 2f + (it % 4) * 1.6f) } }
    androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
        dots.forEachIndexed { i, (x, y, r) ->
            val yy = ((y - t * (0.15f + (i % 3) * 0.08f)) % 1f + 1f) % 1f
            drawCircle(Color.White.copy(alpha = 0.18f + (i % 4) * 0.09f), r.dp.toPx(), androidx.compose.ui.geometry.Offset(x * size.width, yy * size.height))
        }
    }
}

@Composable
private fun BonusContent(o: Offers, onDone: () -> Unit, onOther: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current; val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }; var error by remember { mutableStateOf<String?>(null) }
    var code by remember { mutableStateOf("") }; var showCode by remember { mutableStateOf(false) }
    val pulse by rememberInfiniteTransition(label = "coin").animateFloat(1f, 1.08f, infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "s")
    val amount = if (o.signupBonus > 0) o.signupBonus else o.referralBonus
    val white = Color.White; val soft = Color(0xFFFFE9F3)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().imePadding().padding(horizontal = 24.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Spacer(Modifier.height(8.dp))
        Box(contentAlignment = Alignment.Center) {
            Box(Modifier.size(230.dp).scale(pulse).background(Brush.radialGradient(listOf(Color(0x66FFD36B), Color.Transparent)), CircleShape))
            CoinIcon(128.dp, Modifier.scale(pulse))
        }
        Text(if (o.signupBonus > 0) "Sign up & get" else "Join with a friend's code & get", color = soft, fontSize = 20.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
        Text("Rs. ${"%,d".format(amount)}", color = white, fontSize = 56.sp, fontWeight = FontWeight.Black, fontFamily = DisplayFont, lineHeight = 60.sp)
        Text(if (o.signupBonus > 0) "free in your wallet" else "free in your wallet", color = Color(0xFFFFD36B), fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Text(if (o.signupBonus > 0) "Create your account with Google in one tap. The bonus is added instantly and comes off your first order." else "Create your account with Google in one tap. The bonus is added instantly.",
            color = soft, textAlign = TextAlign.Center, fontSize = 15.sp, lineHeight = 22.sp)
        Spacer(Modifier.height(2.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Perk("Instant", "in your wallet", Modifier.weight(1f))
            Perk("1st order", "price drops", Modifier.weight(1f))
            if (o.referralBonus > 0) Perk("Rs. ${"%,d".format(o.referralBonus)}", "per friend", Modifier.weight(1f))
        }
        Spacer(Modifier.height(4.dp))
        Button(onClick = {
            scope.launch {
                busy = true; error = null
                try {
                    val token = try { googleIdToken(ctx) } catch (e: GetCredentialCancellationException) { throw ApiException(false, "Google sign-in was cancelled") }
                        catch (e: GetCredentialException) { throw ApiException(false, "Google sign-in is not available on this device right now") }
                    Repo.googleLogin(token ?: throw ApiException(false, "Google sign-in failed"), code.ifBlank { null })
                    onDone()
                } catch (e: ApiException) { error = e.message } finally { busy = false }
            }
        }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(56.dp), shape = RoundedCornerShape(28.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color(0xFF1F1F1F), disabledContainerColor = Color(0xCCFFFFFF), disabledContentColor = Color(0xFF555555))) {
            if (busy) CircularProgressIndicator(Modifier.size(22.dp), color = Color(0xFF4B1D8F), strokeWidth = 2.5.dp) else GoogleLogo(22.dp)
            Spacer(Modifier.width(12.dp)); Text(if (busy) "Please wait..." else "Continue with Google", fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        }
        error?.let { Text(it, color = Color(0xFFFFE066), textAlign = TextAlign.Center, fontSize = 14.sp, fontWeight = FontWeight.Medium) }
        if (o.referralBonus > 0) {
            if (!showCode) TextButton({ showCode = true }) { Text("Have a referral code?", color = white, fontWeight = FontWeight.SemiBold, fontSize = 15.sp) }
            else OutlinedTextField(code, { code = it.uppercase().filter { c -> c.isLetterOrDigit() }.take(12) }, Modifier.fillMaxWidth(), singleLine = true,
                label = { Text("Referral code") }, shape = RoundedCornerShape(16.dp),
                colors = OutlinedTextFieldDefaults.colors(focusedTextColor = white, unfocusedTextColor = white, focusedBorderColor = white, unfocusedBorderColor = Color(0x99FFFFFF),
                    focusedLabelColor = white, unfocusedLabelColor = soft, cursorColor = white))
        }
        TextButton(onOther, enabled = !busy) { Text("Other sign-in options (email or phone)", color = white, fontWeight = FontWeight.SemiBold, fontSize = 14.sp) }
        TextButton(onBack, enabled = !busy) { Text("Maybe later", color = soft, fontSize = 15.sp) }
    }
}

@Composable
private fun Perk(title: String, sub: String, modifier: Modifier = Modifier) {
    Column(modifier.clip(RoundedCornerShape(18.dp)).background(Color(0x26FFFFFF)).border(1.dp, Color(0x40FFFFFF), RoundedCornerShape(18.dp)).padding(vertical = 14.dp, horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp, textAlign = TextAlign.Center)
        Text(sub, color = Color(0xFFFFE9F3), fontSize = 12.sp, textAlign = TextAlign.Center)
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

/** Home screen card. Signed in: coin + live balance that counts up. Guest: "sign up and get Rs. X" (only while the offer is on). */
@Composable
fun HomeWalletCard(onWallet: () -> Unit, onSignIn: () -> Unit, modifier: Modifier = Modifier) {
    val uid = Session.user?.id
    val wallet = rememberLoad("home-wallet-$uid") { if (uid == null) null else runCatching { Repo.wallet() }.getOrNull() }
    val offers = rememberLoad("home-offers-$uid") { if (uid != null) null else runCatching { Repo.offers() }.getOrNull() }
    val w = (wallet.state as? Load.Ready)?.data; val o = (offers.state as? Load.Ready)?.data
    if (uid != null && w == null) return
    if (uid == null && (o == null || o.signupBonus <= 0)) return
    val balance by animateIntAsState(if (uid != null) w!!.balance else o!!.signupBonus, tween(1400, easing = FastOutSlowInEasing), label = "bal")
    val t = rememberInfiniteTransition(label = "card")
    val sweep by t.animateFloat(-0.4f, 1.4f, infiniteRepeatable(tween(3200, easing = LinearEasing)), label = "sweep")
    val flip by t.animateFloat(0f, 360f, infiniteRepeatable(tween(5200, easing = FastOutSlowInEasing)), label = "flip")
    Box(modifier.padding(horizontal = 20.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).clickable { if (uid != null) onWallet() else onSignIn() }
        .background(Brush.linearGradient(listOf(Color(0xFF2A1260), Color(0xFF7A2A9E), Color(0xFFE0457B))))
        .border(1.dp, Color(0x55FFFFFF), RoundedCornerShape(22.dp))) {
        // light streak that glides across the card
        Box(Modifier.matchParentSize().drawWithContent {
            drawContent()
            val x = size.width * sweep
            drawRect(Brush.horizontalGradient(listOf(Color.Transparent, Color(0x33FFFFFF), Color.Transparent), startX = x - 120f, endX = x + 120f))
        })
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            CoinIcon(54.dp, Modifier.graphicsLayer { rotationY = flip; cameraDistance = 14f * density })
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(if (uid != null) "My Wallet" else "Welcome gift", color = Color(0xFFFFE9F3), fontSize = 13.sp, fontWeight = FontWeight.Medium)
                Text("Rs. ${"%,d".format(balance)}", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Black, fontFamily = DisplayFont)
                Text(if (uid != null) (if (w!!.balance > 0) "Comes off your next order" else "Invite friends & earn") else "Sign up with Google to claim", color = Color(0xFFFFD36B), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
            Icon(androidx.compose.material.icons.Icons.AutoMirrored.Outlined.ArrowBack, null, tint = Color.White, modifier = Modifier.graphicsLayer { rotationZ = 180f })
        }
    }
}

/** The celebration popup (the home screen decides when to show it, because the coins then fly into the wallet icon). */
@Composable
fun BonusCelebrationDialog(amount: Int, onClose: () -> Unit, onWallet: () -> Unit) {
    androidx.compose.ui.window.Dialog(onDismissRequest = onClose) { BonusCelebrationCard(amount, onClose = onClose, onWallet = onWallet) }
}

/** Small coin button for the home header: the coin with the balance on a gold badge. It bounces when `pulse` changes. */
@Composable
fun WalletCoinButton(balance: Int?, pulse: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val bump = remember { Animatable(1f) }
    LaunchedEffect(pulse) { if (pulse > 0) { bump.animateTo(1.45f, tween(160)); bump.animateTo(1f, spring(0.35f, 300f)) } }
    val shown by animateIntAsState(balance ?: 0, tween(1200, easing = FastOutSlowInEasing), label = "badge")
    Box(modifier.size(46.dp).clip(CircleShape).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        CoinIcon(30.dp, Modifier.scale(bump.value))
        if (balance != null) Text("$shown", color = Color(0xFF3A2704), fontSize = 9.sp, fontWeight = FontWeight.Black, maxLines = 1,
            modifier = Modifier.align(Alignment.BottomCenter).clip(RoundedCornerShape(50)).background(Brush.horizontalGradient(listOf(Color(0xFFFFE9A8), Color(0xFFE0B65A)))).padding(horizontal = 5.dp, vertical = 1.dp))
    }
}

/** Several coins spin in 3D and fly from `from` to `to` (both inside this box), then `onDone`. */
@Composable
fun CoinFlight(from: androidx.compose.ui.geometry.Offset, to: androidx.compose.ui.geometry.Offset, onDone: () -> Unit) {
    val n = 7
    val prog = remember { List(n) { Animatable(0f) } }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.coroutineScope { prog.forEachIndexed { i, a -> launch { kotlinx.coroutines.delay(i * 120L); a.animateTo(1f, tween(950, easing = FastOutSlowInEasing)) } } }
        onDone()
    }
    Box(Modifier.fillMaxSize()) {
        prog.forEachIndexed { i, a ->
            val p = a.value
            if (p > 0f && p < 1f) {
                val side = ((i % 3) - 1) * 70f                                   // spread the start so it looks like a handful of coins
                val x = (from.x + side) + (to.x - from.x - side) * p
                val y = from.y + (to.y - from.y) * p - kotlin.math.sin(p * Math.PI).toFloat() * 180f   // arc upwards
                val s = 2.6f - 2.0f * p
                CoinIcon(40.dp, Modifier.graphicsLayer {
                    translationX = x - size.width / 2f; translationY = y - size.height / 2f
                    scaleX = s; scaleY = s; rotationY = p * 1080f + i * 40f; rotationX = 25f * kotlin.math.sin(p * Math.PI).toFloat(); cameraDistance = 12f * density
                    alpha = if (p > 0.9f) (1f - p) * 10f else 1f
                })
            }
        }
    }
}

@Composable
private fun BonusCelebrationCard(amount: Int, onClose: () -> Unit, onWallet: () -> Unit) {
    val scale = remember { Animatable(0f) }; val shown = remember { Animatable(0f) }
    LaunchedEffect(Unit) { launch { scale.animateTo(1f, spring(0.45f, 120f)) }; launch { shown.animateTo(amount.toFloat(), tween(1500, 250, FastOutSlowInEasing)) } }
    val fall by rememberInfiniteTransition(label = "conf").animateFloat(0f, 1f, infiniteRepeatable(tween(3800, easing = LinearEasing)), label = "f")
    val palette = remember { listOf(Color(0xFFFFD36B), Color(0xFFFF7A45), Color(0xFFFFFFFF), Color(0xFF7DF9C2), Color(0xFFFF6FB5)) }
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(Brush.verticalGradient(listOf(Color(0xFF2A1260), Color(0xFF8A2A9E), Color(0xFFE0457B))))) {
        androidx.compose.foundation.Canvas(Modifier.matchParentSize()) {
            repeat(34) { i ->
                val x = ((i * 47) % 100) / 100f * size.width; val y = (((i * 29) % 100) / 100f + fall * (0.6f + (i % 4) * 0.25f)) % 1f * size.height
                drawCircle(palette[i % palette.size].copy(alpha = 0.9f), (3 + i % 3).dp.toPx(), androidx.compose.ui.geometry.Offset(x, y))
            }
        }
        Column(Modifier.padding(26.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Box(Modifier.size(170.dp).scale(scale.value).background(Brush.radialGradient(listOf(Color(0x77FFD36B), Color.Transparent)), CircleShape))
                CoinIcon(104.dp, Modifier.scale(scale.value).graphicsLayer { rotationY = (1f - scale.value) * 540f; cameraDistance = 14f * density })
            }
            Text("Congratulations!", color = Color(0xFFFFE9F3), fontSize = 18.sp, fontWeight = FontWeight.Medium)
            Text("Rs. ${"%,d".format(shown.value.toInt())}", color = Color.White, fontSize = 48.sp, fontWeight = FontWeight.Black, fontFamily = DisplayFont)
            Text("added to your wallet", color = Color(0xFFFFD36B), fontSize = 19.sp, fontWeight = FontWeight.Bold)
            Text("It comes off your first order automatically. Invite friends and earn even more.", color = Color(0xFFFFE9F3), textAlign = TextAlign.Center, fontSize = 14.sp, lineHeight = 20.sp)
            Spacer(Modifier.height(6.dp))
            Button(onClick = onClose, Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp), colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color(0xFF2A1260))) {
                Text("Start shopping", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
            TextButton(onWallet) { Text("View my wallet", color = Color.White, fontWeight = FontWeight.SemiBold) }
        }
    }
}
