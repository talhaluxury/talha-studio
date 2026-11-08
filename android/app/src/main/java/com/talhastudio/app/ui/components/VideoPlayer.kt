package com.talhastudio.app.ui.components

import android.graphics.Matrix
import android.view.TextureView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.VolumeOff
import androidx.compose.material.icons.outlined.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.exoplayer.ExoPlayer
import com.talhastudio.app.ui.theme.TS

/**
 * MP4 player (ExoPlayer drawn on a TextureView, so it clips, scrolls and pages like any other Compose content).
 * Banners: autoplay + muted + loop, no controls, picture fills the box (cropped). Product page: autoplay, loop, tap to pause, speaker button, whole picture visible.
 * [play] lets a pager start the video only while its page is showing. It always pauses when the app goes to the background.
 */
@Composable
fun VideoPlayer(
    url: String, modifier: Modifier = Modifier, autoplay: Boolean = false, muted: Boolean = false, loop: Boolean = false,
    controls: Boolean = true, fit: Boolean = false, play: Boolean = true,
) {
    key(url) {
        val ctx = LocalContext.current
        val player = remember {
            ExoPlayer.Builder(ctx.applicationContext).build().apply {
                setMediaItem(MediaItem.fromUri(url))
                repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
                volume = if (muted) 0f else 1f
                prepare()
            }
        }
        var isMuted by remember { mutableStateOf(muted) }
        var playing by remember { mutableStateOf(false) }
        var failed by remember { mutableStateOf(false) }
        var videoSize by remember { mutableStateOf<VideoSize?>(null) }
        val sizeNow = rememberUpdatedState(videoSize)
        val wantPlay = rememberUpdatedState(autoplay && play)
        var pausedByUser by remember { mutableStateOf(false) }

        DisposableEffect(player) {
            val l = object : Player.Listener {
                override fun onPlayerError(error: PlaybackException) { failed = true }
                override fun onIsPlayingChanged(isPlaying: Boolean) { playing = isPlaying }
                override fun onVideoSizeChanged(size: VideoSize) { videoSize = size }
            }
            player.addListener(l)
            onDispose { player.removeListener(l); player.release() }
        }
        // Stops when the app is in the background, continues when it returns.
        val lifecycle = LocalLifecycleOwner.current.lifecycle
        DisposableEffect(player, lifecycle) {
            val o = LifecycleEventObserver { _, e ->
                if (e == Lifecycle.Event.ON_PAUSE) player.pause()
                else if (e == Lifecycle.Event.ON_RESUME && wantPlay.value && !pausedByUser) player.play()
            }
            lifecycle.addObserver(o); onDispose { lifecycle.removeObserver(o) }
        }
        LaunchedEffect(player, autoplay, play) { if (autoplay && play && !pausedByUser) player.play() else player.pause() }
        LaunchedEffect(player, isMuted) { player.volume = if (isMuted) 0f else 1f }

        Box(modifier.background(Color.Black)) {
            AndroidView(Modifier.fillMaxSize(), factory = { c ->
                TextureView(c).also { tv ->
                    player.setVideoTextureView(tv)
                    tv.addOnLayoutChangeListener { v, _, _, _, _, _, _, _, _ -> fitVideo(v as TextureView, sizeNow.value, fit) }
                }
            }, update = { tv -> fitVideo(tv, videoSize, fit) }, onRelease = { tv -> player.clearVideoTextureView(tv) })

            if (failed) Text("Video unavailable", color = Color.White.copy(0.7f), modifier = Modifier.align(Alignment.Center))
            if (controls && !failed) {
                Box(Modifier.fillMaxSize().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                    if (player.isPlaying) { pausedByUser = true; player.pause() } else { pausedByUser = false; player.play() }
                })
                if (!playing) Icon(Icons.Outlined.PlayArrow, "Play", tint = Color.White, modifier = Modifier.align(Alignment.Center).size(64.dp).clip(CircleShape).background(TS.Black.copy(0.55f)).padding(10.dp))
                IconButton({ isMuted = !isMuted }, Modifier.align(Alignment.BottomStart).padding(8.dp).size(40.dp).clip(CircleShape).background(TS.Black.copy(0.6f))) {
                    Icon(if (isMuted) Icons.Outlined.VolumeOff else Icons.Outlined.VolumeUp, if (isMuted) "Turn sound on" else "Turn sound off", tint = Color.White)
                }
            }
        }
    }
}

/** A TextureView stretches the video to its own size; this matrix puts the true shape back (fit = whole picture, else fill and crop). */
private fun fitVideo(tv: TextureView, vs: VideoSize?, fit: Boolean) {
    if (vs == null || vs.width <= 0 || vs.height <= 0 || tv.width <= 0 || tv.height <= 0) return
    val videoAspect = vs.width * vs.pixelWidthHeightRatio / vs.height
    val viewAspect = tv.width.toFloat() / tv.height
    val wide = videoAspect > viewAspect
    val xStretch = videoAspect / viewAspect          // above 1 when the video is wider than the box
    val yStretch = viewAspect / videoAspect
    // fit: the long side fills the box and the other side gets bars. fill: the short side fills the box and the rest is cropped.
    val sx = if (wide) (if (fit) 1f else xStretch) else (if (fit) xStretch else 1f)
    val sy = if (wide) (if (fit) yStretch else 1f) else (if (fit) 1f else yStretch)
    tv.setTransform(Matrix().apply { setScale(sx, sy, tv.width / 2f, tv.height / 2f) })
}
