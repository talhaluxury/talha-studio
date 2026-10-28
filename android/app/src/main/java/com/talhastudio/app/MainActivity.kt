package com.talhastudio.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
        Session.init(applicationContext); PushTokens.init(applicationContext); Channels.create(applicationContext); com.talhastudio.app.data.Repo.initCache(applicationContext)
        com.talhastudio.app.push.InboxSync.schedule(applicationContext)
        normalizeDeepLink(intent)
        enableEdgeToEdge()
        val fromLink = intent?.data != null
        setContent { TalhaTheme { TalhaNavHost(startOnMain = fromLink) } }
    }

    override fun onNewIntent(intent: Intent) {
        normalizeDeepLink(intent)
        super.onNewIntent(intent)          // listeners registered by the nav host (addOnNewIntentListener) run from here
        setIntent(intent)
    }
}
