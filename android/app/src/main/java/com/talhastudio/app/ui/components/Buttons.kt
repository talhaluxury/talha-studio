package com.talhastudio.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.talhastudio.app.ui.theme.TS

enum class TsButtonStyle { Gold, Black, Outline }

@Composable
fun TsButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    style: TsButtonStyle = TsButtonStyle.Gold, enabled: Boolean = true,
) {
    val (bg, fg) = when (style) {
        TsButtonStyle.Gold -> TS.Gold to TS.Black
        TsButtonStyle.Black -> TS.Black to TS.Ivory
        TsButtonStyle.Outline -> Color.Transparent to TS.Gold
    }
    Button(
        onClick = onClick, enabled = enabled,
        modifier = modifier.heightIn(min = 52.dp).fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = ButtonDefaults.buttonColors(containerColor = bg, contentColor = fg, disabledContainerColor = TS.Neutral, disabledContentColor = TS.Gray),
        border = if (style == TsButtonStyle.Outline) BorderStroke(1.dp, TS.Gold) else null,
    ) { Text(text, style = MaterialTheme.typography.labelLarge) }
}
