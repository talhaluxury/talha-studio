package com.talhastudio.app.push

import android.content.Context
import androidx.work.*
import com.talhastudio.app.data.Repo
import com.talhastudio.app.data.Session
import java.util.concurrent.TimeUnit

/**
 * Background fallback for phone notifications: every ~15 min (Android's minimum) it checks the in-app inbox and shows
 * a normal phone notification for new unread items. It only acts when Firebase push is NOT available in this build,
 * so phones with working FCM never get duplicates.
 */
class InboxSyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        Session.init(ctx); PushTokens.init(ctx)
        if (PushTokens.available() || !Session.signedIn || !notificationsAllowed(ctx)) return Result.success()
        Channels.create(ctx)
        val page = try { Repo.notifications(1) } catch (e: Exception) { return Result.retry() }
        val prefs = ctx.getSharedPreferences("inbox_sync", Context.MODE_PRIVATE)
        val seen = prefs.getStringSet("seen", emptySet()).orEmpty().toMutableSet()
        val firstRun = !prefs.getBoolean("baselined", false)   // don't spam old messages the first time
        for (n in page.items.filter { !it.read && it.id !in seen }.reversed()) {
            if (!firstRun) showNotification(ctx, n.title, n.body, n.deepLink, n.kind, n.id.hashCode())
            seen += n.id
        }
        prefs.edit().putStringSet("seen", seen.toList().takeLast(200).toSet()).putBoolean("baselined", true).apply()
        return Result.success()
    }
}

object InboxSync {
    fun schedule(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<InboxSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("inbox-sync", ExistingPeriodicWorkPolicy.KEEP, req)
    }
}
