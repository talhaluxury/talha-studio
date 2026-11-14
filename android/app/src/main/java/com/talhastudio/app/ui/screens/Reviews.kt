package com.talhastudio.app.ui.screens

import androidx.compose.foundation.background
import com.talhastudio.app.ui.components.tr
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.talhastudio.app.data.ApiException
import com.talhastudio.app.data.Repo
import com.talhastudio.app.data.ReviewsData
import com.talhastudio.app.data.Session
import com.talhastudio.app.ui.components.TsButton
import com.talhastudio.app.ui.components.TsButtonStyle
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** Five small stars, `rating` of them filled. */
@Composable
fun Stars(rating: Int, size: Int = 16) {
    Text("\u2605".repeat(rating.coerceIn(0, 5)) + "\u2606".repeat(5 - rating.coerceIn(0, 5)), color = TS.Gold, fontSize = size.sp, letterSpacing = 1.sp)
}

/** Ratings summary and the latest reviews of a product. Customers who received the product can write (or change) their own review. */
@Composable
fun ReviewsSection(productId: String, onSignIn: () -> Unit, say: (String) -> Unit) {
    var refresh by remember { mutableIntStateOf(0) }
    var data by remember(productId) { mutableStateOf<ReviewsData?>(null) }
    var writing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(productId, refresh) { data = try { Repo.reviews(productId) } catch (e: CancellationException) { throw e } catch (e: Exception) { data } }
    val d = data ?: return
    if (d.count == 0 && !d.canReview) return          // nothing to show and nothing to do: keep the page clean

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(tr("Ratings & reviews"), style = MaterialTheme.typography.titleMedium)
        if (d.count > 0) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(String.format("%.1f", d.avg), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Column { Stars(Math.round(d.avg).toInt(), 20); Text("${d.count} review${if (d.count == 1) "" else "s"}", style = MaterialTheme.typography.labelSmall, color = TS.Gray) }
        } else Text(tr("No reviews yet. Be the first to rate it."), color = TS.Gray, style = MaterialTheme.typography.bodyMedium)
        d.items.take(5).forEach { r ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) { Stars(r.rating, 14); Spacer(Modifier.width(8.dp)); Text(r.author, style = MaterialTheme.typography.labelLarge, color = TS.Gray) }
                if (r.body.isNotBlank()) Text(r.body, style = MaterialTheme.typography.bodyMedium)
            }
        }
        if (d.canReview) TsButton(if (d.mine != null) "Change my review" else "Write a review", onClick = { writing = true }, style = TsButtonStyle.Outline, modifier = Modifier.fillMaxWidth())
    }

    if (writing) {
        var stars by remember { mutableIntStateOf(d.mine?.rating ?: 5) }
        var text by remember { mutableStateOf(d.mine?.body ?: "") }
        var busy by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { if (!busy) writing = false },
            title = { Text(tr("Rate this product")) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        (1..5).forEach { i -> Text(if (i <= stars) "\u2605" else "\u2606", color = TS.Gold, fontSize = 34.sp, modifier = Modifier.clickable { stars = i }) }
                    }
                    OutlinedTextField(text, { if (it.length <= 600) text = it }, Modifier.fillMaxWidth(), placeholder = { Text(tr("Tell others about the fit, fabric and quality (optional)")) }, minLines = 3, maxLines = 5)
                }
            },
            confirmButton = {
                TextButton(enabled = !busy, onClick = {
                    busy = true
                    scope.launch {
                        try { Repo.postReview(productId, stars, text.trim()); writing = false; refresh++; say("Thank you for your review!") }
                        catch (e: ApiException) { say(e.message ?: "Could not save your review") }
                        busy = false
                    }
                }) { Text(tr("Submit"), color = TS.Gold) }
            },
            dismissButton = { TextButton({ writing = false }, enabled = !busy) { Text(tr("Cancel")) } },
        )
    }
}

/** Shown instead of Add to Cart while a product is sold out: the customer asks to be told when it is back. */
@Composable
fun StockAlertButton(productId: String, onSignIn: () -> Unit, say: (String) -> Unit) {
    var on by remember(productId) { mutableStateOf<Boolean?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val signed = Session.signedIn
    LaunchedEffect(productId, signed) { on = if (signed) runCatching { Repo.stockAlert(productId) }.getOrNull() ?: false else false }
    TsButton(if (on == true) "We will notify you when it is back" else "Notify me when available", style = if (on == true) TsButtonStyle.Outline else TsButtonStyle.Gold, enabled = !busy && on != null, onClick = {
        if (!Session.signedIn) { onSignIn(); return@TsButton }
        busy = true
        scope.launch {
            try {
                val want = on != true
                Repo.setStockAlert(productId, want); on = want
                say(if (want) "We will send you a notification when it is back in stock." else "Alert removed.")
            } catch (e: ApiException) { say(e.message ?: "Something went wrong") }
            busy = false
        }
    })
}
