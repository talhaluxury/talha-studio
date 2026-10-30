package com.talhastudio.app

import android.app.Application
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.talhastudio.app.data.*
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

sealed interface QuoteState {
    data object Idle : QuoteState
    data object Loading : QuoteState
    data class Ready(val quote: Quote) : QuoteState
    data class Failed(val message: String) : QuoteState
}

/** Cart, wishlist and recently viewed live on the device; prices and stock are always confirmed by the server. */
class ShopViewModel(app: Application) : AndroidViewModel(app) {
    private val local = LocalStore(app)
    val wishlist = mutableStateListOf<String>().also { it.addAll(local.wishlist()) }
    val cart = mutableStateListOf<CartLine>().also { it.addAll(local.cart()) }
    val recent = mutableStateListOf<String>().also { it.addAll(local.recent()) }

    val cartCount by derivedStateOf { cart.sumOf { it.qty } }
    /** Unread notification count for the bell badge (0 when signed out or offline). */
    var unread by mutableStateOf(0)
        private set
    fun refreshUnread() { viewModelScope.launch { unread = if (Session.signedIn) runCatching { Repo.unreadCount() }.getOrDefault(unread) else 0 } }

    /** Unread store replies + "new status" dot for the Updates icon (both 0/false when signed out or offline). */
    var chatUnread by mutableStateOf(0)
        private set
    var newStatus by mutableStateOf(false)
        private set
    /** Set by the assistant ("open cart") and consumed by MainShell, because the tabs live inside it. */
    var requestedTab by mutableStateOf<Int?>(null)
    private var knownStatusIds: List<String> = emptyList()
    fun refreshUpdates() { viewModelScope.launch {
        if (!Session.signedIn) { chatUnread = 0; newStatus = false; return@launch }
        chatUnread = runCatching { Repo.chatUnread() }.getOrDefault(chatUnread)
        runCatching { Repo.statuses() }.onSuccess { list -> knownStatusIds = list.map { it.id }; newStatus = knownStatusIds.any { it !in local.seenStatuses() } }
    } }
    fun seenStatuses(): Set<String> = local.seenStatuses()
    fun markStatusSeen(id: String) { local.addSeenStatus(id); newStatus = knownStatusIds.any { it !in local.seenStatuses() } }
    /** The chat screen marks replies as read; reflect that on the icon right away. */
    fun clearChatBadge() { chatUnread = 0 }

    /** Coupon the customer typed; the server decides whether it is valid (see Quote.couponIssue). */
    var couponCode by mutableStateOf<String?>(null)
        private set
    fun applyCoupon(code: String) { couponCode = code.trim().uppercase().ifBlank { null }; refreshQuote() }
    fun clearCoupon() { couponCode = null; refreshQuote() }

    var quote by mutableStateOf<QuoteState>(QuoteState.Idle)
        private set
    private var quoteJob: Job? = null

    fun isWished(id: String) = id in wishlist
    fun toggleWishlist(id: String) { if (!wishlist.remove(id)) wishlist.add(0, id); local.saveWishlist(wishlist) }
    fun markViewed(id: String) { recent.remove(id); recent.add(0, id); while (recent.size > 12) recent.removeAt(recent.lastIndex); local.saveRecent(recent) }

    /** Returns false when the requested quantity is not available. */
    fun addToCart(p: Product, v: Variant, qty: Int = 1): Boolean {
        if (v.stock <= 0) return false
        val i = cart.indexOfFirst { it.variantId == v.id }
        val have = if (i >= 0) cart[i].qty else 0
        val newQty = (have + qty).coerceAtMost(v.stock)
        val line = CartLine(v.id, p.id, p.name, p.thumbUrl, v.size, v.color, p.effectivePrice, newQty, v.stock)
        if (i >= 0) cart[i] = line else cart.add(line)
        cartChanged(); return have + qty <= v.stock
    }
    fun changeQty(variantId: String, delta: Int) {
        val i = cart.indexOfFirst { it.variantId == variantId }; if (i < 0) return
        val q = cart[i].qty + delta
        if (q <= 0) cart.removeAt(i) else if (q <= cart[i].maxStock) cart[i] = cart[i].copy(qty = q) else return
        cartChanged()
    }
    fun remove(variantId: String) { cart.removeAll { it.variantId == variantId }; cartChanged() }

    fun clearCart() { cart.clear(); local.saveCart(cart); couponCode = null; quoteJob?.cancel(); quote = QuoteState.Idle }

    private fun cartChanged() { local.saveCart(cart); refreshQuote() }

    /** Re-prices the cart on the server (debounced). Safe to call whenever the cart screen opens. */
    fun refreshQuote() {
        quoteJob?.cancel()
        if (cart.isEmpty()) { quote = QuoteState.Idle; return }
        quote = QuoteState.Loading
        quoteJob = viewModelScope.launch {
            delay(250)
            quote = try { QuoteState.Ready(Repo.quote(cart.toList(), couponCode)) } catch (e: ApiException) { QuoteState.Failed(e.message ?: "Could not update prices") }
        }
    }
}
