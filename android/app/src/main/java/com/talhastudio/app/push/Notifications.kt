package com.talhastudio.app.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ActivityCompat
import androidx.core.app.PendingIntentCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.talhastudio.app.MainActivity
import com.talhastudio.app.R
import com.talhastudio.app.data.Repo
import com.talhastudio.app.data.Session
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

object Channels {
    const val ORDERS = "orders"; const val PROMOTIONS = "promotions_hi"   // "promotions" was low-key (no pop-up); a channel's importance cannot change, so it got a new id
    fun create(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.deleteNotificationChannel("promotions")
        nm.createNotificationChannel(NotificationChannel(ORDERS, "Order updates", NotificationManager.IMPORTANCE_HIGH).apply { description = "Order confirmed, shipped, delivered or cancelled" })
        nm.createNotificationChannel(NotificationChannel(PROMOTIONS, "Offers and news", NotificationManager.IMPORTANCE_HIGH).apply { description = "New collections and special offers" })
    }
}

/** Android 13+ needs a runtime permission before notifications can be shown. */
fun notificationsAllowed(ctx: Context) = Build.VERSION.SDK_INT < 33 || ActivityCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

object PushTokens {
    private var app: Context? = null
    fun init(ctx: Context) { app = ctx.applicationContext }
    /** Push only works in builds that include google-services.json; otherwise everything here is a quiet no-op. */
    fun available(): Boolean = app?.let { FirebaseApp.getApps(it).isNotEmpty() } == true

    private suspend fun token(): String? = suspendCancellableCoroutine { c ->
        FirebaseMessaging.getInstance().token.addOnCompleteListener { t -> c.resume(if (t.isSuccessful) t.result else null) }
    }
    /** Registers this phone for the signed-in customer (also refreshes last-seen). Safe to call often. */
    suspend fun sync() { if (!available() || !Session.signedIn) return; token()?.let { runCatching { Repo.registerDevice(it) } } }
    /** Human-readable push diagnosis for the Notifications screen. */
    suspend fun status(): String {
        if (!available()) return "Push OFF: this APK was built without Firebase (google-services.json missing or not applied). Install the newest build."
        if (!Session.signedIn) return "Push: sign in first."
        val t = token() ?: return "Push OFF: Firebase could not give this phone a token (check Google Play services, internet, and that package ${app?.packageName} is registered in Firebase)."
        return try { Repo.registerDevice(t); "Push READY: this phone is registered. If nothing shows in the status bar, check phone settings (Autostart, battery, app notifications)." }
        catch (e: Exception) { "Push token OK but server registration failed: ${e.message}" }
    }
    /** Called on sign-out/delete: stop pushes for this account and discard the token. */
    suspend fun unregister() {
        if (!available()) return
        token()?.let { if (Session.signedIn) runCatching { Repo.unregisterDevice(it) } }
        runCatching { suspendCancellableCoroutine<Unit> { c -> FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener { c.resume(Unit) } } }
    }
}

/** Shows a notification while the app is open (when closed, FCM shows it by itself). Tapping opens the deep link. */
fun showNotification(ctx: Context, title: String, body: String, deepLink: String?, kind: String, id: Int) {
    if (!notificationsAllowed(ctx)) return
    val open = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink?.takeIf { routeFor(it) != null } ?: "talhastudio://order/none"), ctx, MainActivity::class.java)
        .apply { if (routeFor(deepLink) == null) { data = null; action = Intent.ACTION_MAIN; addCategory(Intent.CATEGORY_LAUNCHER) }; flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP }
    val pi = PendingIntentCompat.getActivity(ctx, id, open, 0, false)
    val n = NotificationCompat.Builder(ctx, if (kind == "order") Channels.ORDERS else Channels.PROMOTIONS)
        .setSmallIcon(R.drawable.ic_stat_talha).setColor(0xFFB99A62.toInt()).setContentTitle(title).setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body)).setAutoCancel(true).setContentIntent(pi)
        .setPriority(NotificationCompat.PRIORITY_HIGH).build()
    runCatching { NotificationManagerCompat.from(ctx).notify(id, n) }
}
