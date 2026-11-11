package com.talhastudio.app.data

/** Mirrors docs/API_CONTRACT.md. Money is integer PKR end-to-end. */
data class ImageRef(val url: String, val thumbUrl: String)
data class Variant(val id: String, val size: String?, val color: String?, val stock: Int)

data class Product(
    val id: String, val name: String, val description: String,
    val categorySlug: String, val categoryName: String,
    val price: Int, val salePrice: Int?, val fabric: String?,
    val images: List<ImageRef>, val variants: List<Variant>, val inStock: Boolean,
    val related: List<Product> = emptyList(), val videoUrl: String? = null,
) {
    val effectivePrice get() = salePrice ?: price
    val discountPercent: Int? get() = salePrice?.takeIf { price > 0 }?.let { ((price - it) * 100f / price).toInt() }
    val imageUrl get() = images.firstOrNull()?.url
    val thumbUrl get() = images.firstOrNull()?.thumbUrl
    val sizes get() = variants.mapNotNull { it.size }.distinct()
    val colors get() = variants.mapNotNull { it.color }.distinct()
    val totalStock get() = variants.sumOf { it.stock }

    /** Variant for a size/color choice; a null choice matches products that have no such option. */
    fun variantFor(size: String?, color: String?): Variant? =
        variants.firstOrNull { it.size == size && it.color == color }
}

data class Category(val id: String, val slug: String, val name: String, val imageUrl: String? = null, val parentId: String? = null)
data class HomeCollection(val slug: String, val title: String, val products: List<Product>, val banners: List<Banner> = emptyList())
data class Banner(val id: String, val title: String, val subtitle: String?, val ctaLabel: String?, val ctaLink: String?, val imageUrl: String?, val videoUrl: String? = null)
data class HomeData(val categories: List<Category>, val collections: List<HomeCollection>, val banners: List<Banner> = emptyList(), val announcement: String? = null, val spin: Boolean = false, val reels: List<Reel> = emptyList(), val accessories: Accessories? = null)
/** The home "Accessories" showcase: the accessories category, its sub-categories as tiles and its newest products. */
data class Accessories(val slug: String, val title: String, val tiles: List<Category>, val products: List<Product>, val imageUrl: String? = null)
/** "Watch & Shop" video card. [browse] is what Home passes to onBrowse (a category slug or "@section|Title"); null opens the shop. */
data class Reel(val id: String, val title: String, val browse: String?, val videoUrl: String)
/** Sale countdown. [endsAtElapsed] is in SystemClock.elapsedRealtime() time, worked out from the server clock so a wrong phone clock does not matter. */
data class Sale(val label: String, val endsAtElapsed: Long) { fun remainingMs(nowElapsed: Long) = (endsAtElapsed - nowElapsed).coerceAtLeast(0) }
/** Lucky wheel: [percents] are the slices, [canSpin] false when today's spin is used (next one at [nextAt]). */
data class SpinStatus(val active: Boolean, val percents: List<Int>, val canSpin: Boolean, val nextAt: String?)
/** [index] is the winning slice, [code] the single-use coupon the customer can paste at checkout. */
data class SpinResult(val index: Int, val percent: Int, val code: String, val expiresAt: String)
data class PageOf<T>(val items: List<T>, val page: Int, val total: Int) { val hasMore get() = page * 20 < total }

/** A cart row. Name/price/image are a snapshot for display; the server re-prices via /cart/quote. */
data class CartLine(
    val variantId: String, val productId: String, val name: String, val imageUrl: String?,
    val size: String?, val color: String?, val unitPrice: Int, val qty: Int, val maxStock: Int,
)

data class QuoteIssue(val variantId: String, val code: String, val message: String, val available: Int?)
data class QuoteItem(val variantId: String, val unitPrice: Int, val qty: Int)
data class Quote(val items: List<QuoteItem>, val issues: List<QuoteIssue>, val subtotal: Int, val discount: Int, val shipping: Int, val total: Int, val couponCode: String? = null) {
    val couponIssue get() = issues.firstOrNull { it.variantId == "coupon" }
    val lineIssues get() = issues.filter { it.variantId != "coupon" }
}

enum class Sort(val api: String, val label: String) {
    New("new", "Newest"), PriceAsc("price_asc", "Price: low to high"), PriceDesc("price_desc", "Price: high to low")
}
data class Filter(
    val category: String? = null, val query: String = "", val sort: Sort = Sort.New,
    val inStockOnly: Boolean = false, val minPrice: Int? = null, val maxPrice: Int? = null,
    val section: String? = null, val sectionTitle: String? = null,      // "View all" of a home section (New Arrivals, Featured, On Sale, or a section made in the admin app)
) { val activeCount get() = listOf(inStockOnly, minPrice != null || maxPrice != null, sort != Sort.New).count { it } }

data class User(val id: String, val email: String, val fullName: String, val phone: String?, val role: String)
data class Address(
    val id: String, val label: String?, val recipient: String, val phone: String, val line1: String, val line2: String?,
    val city: String, val province: String?, val postalCode: String?, val isDefault: Boolean,
)
data class OrderItem(val name: String, val sku: String, val size: String?, val color: String?, val unitPrice: Int, val qty: Int, val imageUrl: String?)
data class StatusEntry(val status: String, val note: String?, val at: String)
data class OrderSummary(val id: String, val orderNumber: String, val status: String, val total: Int, val createdAt: String, val itemCount: Int, val firstItemName: String?, val imageUrl: String?)
data class Order(
    val id: String, val orderNumber: String, val status: String, val paymentMethod: String, val paymentStatus: String,
    val subtotal: Int, val discount: Int, val shipping: Int, val total: Int,
    val customerName: String, val customerEmail: String, val customerPhone: String,
    val address: String, val notes: String?, val trackingUrl: String?, val items: List<OrderItem>, val history: List<StatusEntry>, val createdAt: String,
) {
    val canCancel get() = status == "pending" || status == "confirmed"
    val canReturn get() = status == "delivered"
}
val statusLabels = mapOf("pending" to "Pending", "confirmed" to "Confirmed", "processing" to "Processing", "shipped" to "Shipped",
    "delivered" to "Delivered", "cancelled" to "Cancelled", "refund_requested" to "Refund Requested", "refunded" to "Refunded")
fun statusLabel(s: String) = statusLabels[s] ?: s
/** Customer-facing steps for the progress bar (cancelled/refund states are shown as text instead). */
val trackingSteps = listOf("pending", "confirmed", "processing", "shipped", "delivered")

data class CheckoutForm(
    val name: String, val email: String, val phone: String, val line1: String, val line2: String,
    val city: String, val province: String, val postalCode: String, val notes: String,
)

data class AppNotification(val id: String, val title: String, val body: String, val deepLink: String?, val kind: String, val read: Boolean, val createdAt: String)
data class NotificationsPage(val items: List<AppNotification>, val total: Int, val unread: Int)
data class NotifPrefs(val orderUpdates: Boolean, val promotions: Boolean)

data class PayMethod(val id: String, val label: String, val details: String)
fun payLabel(id: String) = when (id) { "cod" -> "Cash on Delivery"; "jazzcash" -> "JazzCash"; "easypaisa" -> "Easypaisa"; "bank" -> "Bank transfer"; else -> id }
data class StoreInfo(val name: String, val supportEmail: String?, val supportPhone: String?, val address: String?, val estimatedDelivery: String?, val shipping: Pair<Int, Int>, val returnWindowDays: Int, val pages: List<Pair<String, String>>, val paymentMethods: List<PayMethod> = emptyList())
data class PageDoc(val slug: String, val title: String, val body: String, val contact: List<String>)

sealed interface PageBlock { data class Heading(val text: String) : PageBlock; data class Para(val text: String) : PageBlock }
/** Server pages are plain text: "# " starts a heading, blank lines separate paragraphs. Parsed here, never rendered as HTML. */
fun parsePageBody(text: String): List<PageBlock> = text.split(Regex("\\n{2,}")).flatMap { block ->
    block.trim().lines().filter { it.isNotBlank() }.map { l -> if (l.startsWith("# ")) PageBlock.Heading(l.removePrefix("# ").trim()) else PageBlock.Para(l.trim()) }
}

/** Onboarding screen managed from the admin panel (picture + heading + one line). */
data class Slide(val id: String, val title: String, val body: String, val imageUrl: String?)
/** One chat message. [fromStore] true = sent by Talha Studio. [seq] is the server cursor used for polling. */
data class ChatMessage(val seq: Long, val id: String, val fromStore: Boolean, val body: String, val imageUrl: String?, val createdAt: String, val read: Boolean)
/** A daily picture posted by the store (visible for 24 hours). */
data class StatusItem(val id: String, val imageUrl: String, val caption: String?, val createdAt: String)
/** Phone sign-ups get a generated, never-deliverable email; show the number instead of it. */
val User.isPhoneAccount get() = email.endsWith(".invalid")
val User.contactLine get() = if (isPhoneAccount) phone.orEmpty() else email

/** One-tap shortcut the AI assistant can offer under a reply: type is product | cart | orders | chat. */
data class AssistantAction(val type: String, val id: String?, val label: String)
data class AssistantReply(val text: String, val actions: List<AssistantAction>)

/** The Home screen opens browse with "@<section slug>|<section title>" for a "View all"; anything else is a category slug. */
fun parseBrowse(arg: String?): Filter =
    if (arg != null && arg.startsWith("@")) arg.drop(1).let { Filter(section = it.substringBefore("|"), sectionTitle = it.substringAfter("|", "")) } else Filter(category = arg)
