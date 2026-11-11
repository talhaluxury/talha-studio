package com.talhastudio.admin

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/** New-order alerts: the notification channel, the phone's Firebase token and local notifications. Everything is a no-op when Firebase is not set up. */
object OrderAlerts {
    const val CHANNEL = "orders"
    private const val PREFS = "alerts"

    fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val ch = NotificationChannel(CHANNEL, "New orders", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "A sound and a pop-up every time a customer places an order"
            enableVibration(true)
        }
        ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
    }

    fun saveToken(ctx: Context, token: String) { ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("fcm", token).apply() }
    fun token(ctx: Context): String = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("fcm", "") ?: ""

    /** Asks Firebase for this phone's token (saved for the page to send to the server). Silently does nothing without google-services.json. */
    fun fetchToken(ctx: Context) {
        try { com.google.firebase.messaging.FirebaseMessaging.getInstance().token.addOnSuccessListener { if (!it.isNullOrBlank()) saveToken(ctx, it) } }
        catch (e: Throwable) { /* Firebase is not configured for this build */ }
    }

    /** A notification that opens the order when tapped. [deepLink] looks like admin://orders/<id>. */
    fun notify(ctx: Context, title: String, body: String, deepLink: String?) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        ensureChannel(ctx)
        val open = Intent(ctx, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP; if (deepLink != null) putExtra("deepLink", deepLink) }
        val pi = PendingIntent.getActivity(ctx, (System.currentTimeMillis() % 100000).toInt(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title.take(80)).setContentText(body.take(200))
            .setStyle(NotificationCompat.BigTextStyle().bigText(body.take(300))).setPriority(NotificationCompat.PRIORITY_HIGH).setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true).setContentIntent(pi).build()
        try { NotificationManagerCompat.from(ctx).notify((System.currentTimeMillis() % 1_000_000).toInt(), n) } catch (e: SecurityException) { /* permission refused */ }
    }
}
