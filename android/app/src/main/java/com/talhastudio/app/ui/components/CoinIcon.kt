package com.talhastudio.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** A shiny gold coin (drawn, no image file) used for the wallet. */
@Composable
fun CoinIcon(size: Dp = 28.dp, modifier: Modifier = Modifier) {
    val gold = Brush.linearGradient(listOf(Color(0xFFFFE9A8), Color(0xFFE0B65A), Color(0xFF9C6F1E)))
    Box(modifier.size(size).shadow(size / 6, CircleShape).clip(CircleShape).background(gold).border(size / 14, Color(0xFF8A5F14), CircleShape), contentAlignment = Alignment.Center) {
        Box(Modifier.size(size * 0.72f).border(size / 28, Color(0x99FFF4CF), CircleShape), contentAlignment = Alignment.Center) {
            Text("S", color = Color(0xFF6B4708), fontWeight = FontWeight.Black, fontSize = (size.value * 0.4f).sp)
        }
    }
}
