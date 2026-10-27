package com.talhastudio.app.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.talhastudio.app.data.Repo
import com.talhastudio.app.data.Session
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class TalhaMessagingService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** FCM rotated this phone's token: tell the server so pushes keep arriving. */
    override fun onNewToken(token: String) {
        Session.init(applicationContext)
        if (Session.signedIn) scope.launch { runCatching { Repo.registerDevice(token) } }
    }

    /** Called when the message arrives while the app is in the foreground. */
    override fun onMessageReceived(m: RemoteMessage) {
        val n = m.notification ?: return
        showNotification(applicationContext, n.title.orEmpty(), n.body.orEmpty(), m.data["deepLink"], m.data["kind"] ?: "promo", (m.data["notificationId"] ?: m.messageId ?: "0").hashCode())
    }
}
