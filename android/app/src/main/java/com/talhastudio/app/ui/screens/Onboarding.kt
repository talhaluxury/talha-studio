package com.talhastudio.app.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.talhastudio.app.R
import com.talhastudio.app.data.Repo
import com.talhastudio.app.data.Slide
import com.talhastudio.app.ui.components.TsButton
import com.talhastudio.app.ui.components.TsButtonStyle
import com.talhastudio.app.ui.theme.DisplayFont
import com.talhastudio.app.ui.theme.TS
import kotlinx.coroutines.launch
import kotlin.math.abs

/** Shown until the admin adds slides (or while the first fetch is still running / offline). */
private val defaultSlides = listOf(
    Slide("d1", "Premium Fashion\nFor Modern Life", "Discover exclusive collections for men, women and kids.", null),
    Slide("d2", "Unstitched to\nReady-to-Wear", "Fabrics, suits and stitched pieces, curated by Talha Studio.", null),
    Slide("d3", "Track Every\nOrder", "Cash on Delivery, live order status and instant notifications.", null),
)

@Composable
fun OnboardingScreen(onStart: () -> Unit) {
    // Cached slides from the last visit show instantly; fresh ones from the admin panel replace them when they arrive.
    var slides by remember { mutableStateOf(Repo.cachedOnboarding().ifEmpty { defaultSlides }) }
    LaunchedEffect(Unit) { runCatching { Repo.onboarding() }.getOrNull()?.takeIf { it.isNotEmpty() }?.let { slides = it } }

    val pager = rememberPagerState { slides.size }
    val scope = rememberCoroutineScope()
    val last = pager.currentPage >= slides.lastIndex

    Box(Modifier.fillMaxSize().background(TS.Black)) {
        HorizontalPager(pager, Modifier.fillMaxSize()) { i ->
            // Distance of this page from the centre: 0 = in front, +-1 = fully swiped away. Drives the 3D turn below.
            val offset = (pager.currentPage - i) + pager.currentPageOffsetFraction
            SlidePage(slides[i], offset)
        }
        Column(Modifier.fillMaxSize().systemBarsPadding().padding(28.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                if (!last) TextButton(onStart) { Text("Skip", color = TS.Ivory.copy(0.8f)) }
            }
            Spacer(Modifier.weight(1f))
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
}

@Composable
private fun SlidePage(slide: Slide, offset: Float) {
    val far = abs(offset).coerceIn(0f, 1f)
    Box(Modifier.fillMaxSize()) {
        // The picture card turns like a page in 3D as you swipe, and floats above a soft gold shadow.
        Box(
            Modifier.align(Alignment.TopCenter).fillMaxWidth().fillMaxHeight(0.64f).padding(start = 22.dp, end = 22.dp, top = 76.dp)
                .graphicsLayer {
                    cameraDistance = 14f * density
                    rotationY = offset * -28f
                    scaleX = 1f - far * 0.12f; scaleY = 1f - far * 0.12f
                    alpha = 1f - far * 0.55f
                }
                .shadow(26.dp, RoundedCornerShape(32.dp), ambientColor = TS.Gold, spotColor = TS.Gold)
                .clip(RoundedCornerShape(32.dp)).background(Color(0xFF141414)),
            contentAlignment = Alignment.Center,
        ) {
            if (slide.imageUrl != null) AsyncImage(slide.imageUrl, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            else Box(Modifier.fillMaxSize().background(Brush.radialGradient(listOf(TS.Gold.copy(0.35f), Color.Transparent))), contentAlignment = Alignment.Center) {
                Image(painterResource(R.drawable.talha_logo), null, Modifier.size(132.dp).clip(RoundedCornerShape(28.dp)))
            }
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.55f to Color.Transparent, 1f to TS.Black.copy(0.55f))))
        }
        // Heading and text slide a little faster than the picture, which gives the parallax depth.
        Column(
            Modifier.fillMaxSize().padding(horizontal = 28.dp).padding(bottom = 188.dp)
                .graphicsLayer { translationX = offset * 160f; alpha = 1f - far },
            verticalArrangement = Arrangement.Bottom,
        ) {
            Text(slide.title, style = MaterialTheme.typography.displayLarge, fontFamily = DisplayFont, color = TS.Ivory)
            if (slide.body.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                Text(slide.body, style = MaterialTheme.typography.bodyLarge, color = TS.Ivory.copy(0.75f), textAlign = TextAlign.Start)
            }
        }
    }
}
