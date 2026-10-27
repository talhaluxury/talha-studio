package com.talhastudio.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Cart, wishlist and recently-viewed survive app restarts. Nothing sensitive is stored here. */
class LocalStore(ctx: Context) {
    private val sp = ctx.getSharedPreferences("talha_local", Context.MODE_PRIVATE)

    fun onboarded() = sp.getBoolean("onboarded", false)
    fun setOnboarded() = sp.edit().putBoolean("onboarded", true).apply()

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
