package com.talhastudio.app.data

/** Mirrors docs/API_CONTRACT.md. Money is integer PKR end-to-end. */
data class ImageRef(val url: String, val thumbUrl: String)
data class Variant(val id: String, val size: String?, val color: String?, val stock: Int)

data class Product(
    val id: String, val name: String, val description: String,
    val categorySlug: String, val categoryName: String,
    val price: Int, val salePrice: Int?, val fabric: String?,
    val images: List<ImageRef>, val variants: List<Variant>, val inStock: Boolean,
    val related: List<Product> = emptyList(),
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

data class Category(val id: String, val slug: String, val name: String)
data class HomeCollection(val slug: String, val title: String, val products: List<Product>)
data class Banner(val id: String, val title: String, val subtitle: String?, val ctaLabel: String?, val ctaLink: String?, val imageUrl: String?)
data class HomeData(val categories: List<Category>, val collections: List<HomeCollection>, val banners: List<Banner> = emptyList(), val announcement: String? = null)
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

data class StoreInfo(val name: String, val supportEmail: String?, val supportPhone: String?, val address: String?, val estimatedDelivery: String?, val shipping: Pair<Int, Int>, val returnWindowDays: Int, val pages: List<Pair<String, String>>)
data class PageDoc(val slug: String, val title: String, val body: String, val contact: List<String>)

sealed interface PageBlock { data class Heading(val text: String) : PageBlock; data class Para(val text: String) : PageBlock }
/** Server pages are plain text: "# " starts a heading, blank lines separate paragraphs. Parsed here, never rendered as HTML. */
fun parsePageBody(text: String): List<PageBlock> = text.split(Regex("\\n{2,}")).flatMap { block ->
    block.trim().lines().filter { it.isNotBlank() }.map { l -> if (l.startsWith("# ")) PageBlock.Heading(l.removePrefix("# ").trim()) else PageBlock.Para(l.trim()) }
}
