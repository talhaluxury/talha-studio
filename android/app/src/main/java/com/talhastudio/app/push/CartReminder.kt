package com.talhastudio.app.push

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.talhastudio.app.data.LocalStore

/**
 * "Your cart is waiting" reminder. It is a local alarm (no server, nothing to configure): every cart change restarts a 24 hour timer,
 * an empty cart or a placed order cancels it. When it fires and the cart still has items, one notification is shown.
 */
object CartReminder {
    private const val REQ = 7421
    private const val DELAY_MS = 24L * 60 * 60 * 1000

    private fun pending(ctx: Context) = PendingIntent.getBroadcast(ctx, REQ, Intent(ctx, CartReminderReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    fun sync(ctx: Context, hasItems: Boolean) = runCatching {
        val am = ctx.applicationContext.getSystemService(AlarmManager::class.java) ?: return@runCatching
        val pi = pending(ctx.applicationContext)
        if (hasItems) am.set(AlarmManager.RTC, System.currentTimeMillis() + DELAY_MS, pi) else am.cancel(pi)      // same PendingIntent: setting again replaces the old alarm
    }.let { }
}

class CartReminderReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val cart = runCatching { LocalStore(ctx.applicationContext).cart() }.getOrDefault(emptyList())
        val first = cart.firstOrNull() ?: return
        Channels.create(ctx)
        val more = cart.size - 1
        val body = "${first.name}${if (more > 0) " and $more more item${if (more == 1) "" else "s"}" else ""} ${if (more > 0) "are" else "is"} still in your cart. Order before ${if (more > 0) "they sell" else "it sells"} out!"
        showNotification(ctx, "Your cart is waiting", body, "talhastudio://product/${first.productId}", "promo", 7421, first.imageUrl)
    }
}
