package com.talhastudio.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import android.graphics.Color
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import com.talhastudio.app.data.Session
import com.talhastudio.app.push.Channels
import com.talhastudio.app.push.PushTokens
import com.talhastudio.app.push.normalizeDeepLink
import com.talhastudio.app.ui.nav.TalhaNavHost
import com.talhastudio.app.ui.theme.TalhaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Session.init(applicationContext); PushTokens.init(applicationContext); Channels.create(applicationContext); com.talhastudio.app.data.Repo.initCache(applicationContext); com.talhastudio.app.ui.components.Lang.init(applicationContext)
        com.talhastudio.app.push.InboxSync.schedule(applicationContext)
        normalizeDeepLink(intent)
        // The app is always dark, so keep the status/navigation bar icons light even when the phone itself is in light mode.
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT), navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT))
        val fromLink = intent?.data != null
        setContent { TalhaTheme { TalhaNavHost(startOnMain = fromLink) } }
    }

    override fun onNewIntent(intent: Intent) {
        normalizeDeepLink(intent)
        super.onNewIntent(intent)          // listeners registered by the nav host (addOnNewIntentListener) run from here
        setIntent(intent)
    }
}
