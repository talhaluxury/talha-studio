package com.talhastudio.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.talhastudio.app.ui.components.TsButton
import com.talhastudio.app.ui.components.TsButtonStyle
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch

private data class Slide(val title: String, val body: String)
private val slides = listOf(
    Slide("Premium Fashion\nFor Modern Life", "Discover exclusive collections for men, women and kids."),
    Slide("Unstitched to\nReady-to-Wear", "Fabrics, suits and stitched pieces, curated by Talha Studio."),
    Slide("Track Every\nOrder", "Cash on Delivery, live order status and instant notifications."),
)

@Composable
fun OnboardingScreen(onStart: () -> Unit) {
    val pager = rememberPagerState { slides.size }
    val scope = rememberCoroutineScope()
    val last = pager.currentPage == slides.lastIndex
    Column(Modifier.fillMaxSize().background(TS.Black).systemBarsPadding().padding(28.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            if (!last) TextButton(onStart) { Text("Skip", color = TS.Ivory.copy(0.7f)) }
        }
        HorizontalPager(pager, Modifier.weight(1f)) { i ->
            Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Bottom) {
                Text(slides[i].title, style = MaterialTheme.typography.displayLarge, fontFamily = DisplayFont, color = TS.Ivory)
                Spacer(Modifier.height(14.dp))
                Text(slides[i].body, style = MaterialTheme.typography.bodyLarge, color = TS.Ivory.copy(0.7f), textAlign = TextAlign.Start)
                Spacer(Modifier.height(28.dp))
            }
        }
        Row(Modifier.fillMaxWidth().padding(bottom = 20.dp), horizontalArrangement = Arrangement.Center) {
            repeat(slides.size) { i ->
                Box(Modifier.padding(4.dp).size(if (i == pager.currentPage) 22.dp else 7.dp, 7.dp).clip(CircleShape)
                    .background(if (i == pager.currentPage) TS.Gold else TS.Ivory.copy(0.3f)))
            }
        }
        TsButton(if (last) "Get Started" else "Next", onClick = {
            if (last) onStart() else scope.launch { pager.animateScrollToPage(pager.currentPage + 1) }
        }, style = TsButtonStyle.Gold)
    }
}
