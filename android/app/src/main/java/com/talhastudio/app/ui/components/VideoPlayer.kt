package com.talhastudio.app.ui.components

import android.net.Uri
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

/** A plain MP4 player (the system VideoView). Banners play it muted on a loop; the product page shows play controls. */
@Composable
fun VideoPlayer(url: String, modifier: Modifier = Modifier, autoplay: Boolean = false, muted: Boolean = false, loop: Boolean = false, controls: Boolean = true) {
    var view by remember { mutableStateOf<VideoView?>(null) }
    DisposableEffect(url) { onDispose { view?.stopPlayback() } }
    AndroidView(modifier = modifier, factory = { ctx ->
        VideoView(ctx).also { v ->
            if (controls) { val mc = MediaController(ctx); mc.setAnchorView(v); v.setMediaController(mc) }
            v.setOnPreparedListener { mp -> mp.isLooping = loop; if (muted) mp.setVolume(0f, 0f); if (autoplay) v.start() }
            v.setVideoURI(Uri.parse(url))
            view = v
        }
    })
}
