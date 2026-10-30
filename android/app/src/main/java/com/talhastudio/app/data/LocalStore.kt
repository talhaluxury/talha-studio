package com.talhastudio.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Cart, wishlist and recently-viewed survive app restarts. Nothing sensitive is stored here. */
class LocalStore(ctx: Context) {
    private val sp = ctx.getSharedPreferences("talha_local", Context.MODE_PRIVATE)

    fun onboarded() = sp.getBoolean("onboarded", false)
    fun setOnboarded() = sp.edit().putBoolean("onboarded", true).apply()

    fun askedNotifications() = sp.getBoolean("asked_notif", false)
    fun setAskedNotifications() = sp.edit().putBoolean("asked_notif", true).apply()
    /** Last home feed, so the shop shows instantly on open while fresh data loads. */
    fun homeJson(): String? = sp.getString("home_json", null)
    fun saveHomeJson(s: String) = sp.edit().putString("home_json", s).apply()

    /** Last onboarding slides from the server, so the pictures show instantly on the next first-run (e.g. after reinstall + offline). */
    fun onboardingJson(): String? = sp.getString("onboarding_json", null)
    fun saveOnboardingJson(s: String) = sp.edit().putString("onboarding_json", s).apply()
    /** Status pictures this phone has already watched (drives the gold ring / dot). Only the latest 80 ids are kept. */
    fun seenStatuses(): Set<String> = readIds("seen_status").toSet()
    fun addSeenStatus(id: String) = sp.edit().putString("seen_status", JSONArray((readIds("seen_status") + id).distinct().takeLast(80)).toString()).apply()

    fun wishlist(): List<String> = readIds("wishlist")
    fun saveWishlist(ids: List<String>) = sp.edit().putString("wishlist", JSONArray(ids).toString()).apply()
    fun recent(): List<String> = readIds("recent")
    fun saveRecent(ids: List<String>) = sp.edit().putString("recent", JSONArray(ids.take(12)).toString()).apply()

    fun cart(): List<CartLine> = runCatching {
        val a = JSONArray(sp.getString("cart", "[]"))
        (0 until a.length()).map { val o = a.getJSONObject(it)
            CartLine(o.getString("v"), o.getString("p"), o.getString("n"), o.optString("i").ifBlank { null },
                o.optString("s").ifBlank { null }, o.optString("c").ifBlank { null }, o.getInt("u"), o.getInt("q"), o.getInt("m")) }
    }.getOrDefault(emptyList())
    fun saveCart(lines: List<CartLine>) {
        val a = JSONArray(); lines.forEach { a.put(JSONObject().put("v", it.variantId).put("p", it.productId).put("n", it.name).put("i", it.imageUrl ?: "")
            .put("s", it.size ?: "").put("c", it.color ?: "").put("u", it.unitPrice).put("q", it.qty).put("m", it.maxStock)) }
        sp.edit().putString("cart", a.toString()).apply()
    }
    private fun readIds(k: String) = runCatching { JSONArray(sp.getString(k, "[]")).let { a -> (0 until a.length()).map(a::getString) } }.getOrDefault(emptyList())
}
