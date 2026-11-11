package com.talhastudio.admin

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Receives Firebase events. In the background Android shows the order notification by itself; here we keep the token fresh and show it when the app is open. */
class AdminFcmService : FirebaseMessagingService() {
    override fun onNewToken(token: String) { OrderAlerts.saveToken(this, token) }
    override fun onMessageReceived(message: RemoteMessage) {
        val n = message.notification ?: return
        OrderAlerts.notify(this, n.title ?: "New order", n.body ?: "", message.data["deepLink"])
    }
}
