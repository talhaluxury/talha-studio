package com.talhastudio.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** The four-colour Google "G", drawn with arcs so no image file is needed. */
@Composable
fun GoogleLogo(size: Dp = 22.dp, modifier: Modifier = Modifier) {
    Canvas(modifier.size(size)) {
        val s = this.size.minDimension
        val w = s * 0.21f
        val box = Size(s - w, s - w); val tl = Offset(w / 2f, w / 2f)
        val blue = Color(0xFF4285F4); val red = Color(0xFFEA4335); val yellow = Color(0xFFFBBC05); val green = Color(0xFF34A853)
        fun arc(c: Color, start: Float, sweep: Float) = drawArc(c, start, sweep, false, tl, box, style = Stroke(width = w, cap = StrokeCap.Butt))
        arc(red, -140f, 100f)       // top
        arc(yellow, 140f, 80f)      // left
        arc(green, 50f, 90f)        // bottom
        arc(blue, 0f, 50f)          // lower right
        drawLine(blue, Offset(s * 0.5f, s * 0.5f), Offset(s - w / 2f + w * 0.5f, s * 0.5f), strokeWidth = w, cap = StrokeCap.Butt)   // the bar of the G
    }
}
