package com.talhastudio.app.data

import org.json.JSONArray
import org.json.JSONObject

// ---- Seller side of the marketplace: the signed-in customer's own brand, products and orders ----

data class SellerImage(val id: String, val url: String, val thumbUrl: String)
data class SellerVariant(val id: String?, val size: String?, val color: String?, val stock: Int)
data class SellerProduct(
    val id: String, val name: String, val description: String, val categoryId: String, val categoryName: String,
    val price: Int, val salePrice: Int?, val fabric: String?, val images: List<SellerImage>, val variants: List<SellerVariant>,
    /** draft | pending | approved | rejected */ val state: String, val note: String?, val isPublished: Boolean,
)
data class SellerCategory(val id: String, val name: String, val parentId: String?)
/** An uploaded picture or video: [key] is what gets saved on the page, [url] is only for showing it. */
data class SMedia(val key: String, val url: String)
data class SSlide(val image: SMedia, val title: String = "", val subtitle: String = "", val buttonLabel: String = "", val productId: String? = null)
/**
 * One editable block of the page. [type] is banner | video | text | products | gallery | features | spacer; only the fields of that type are used:
 * text = [title] (heading), [body], [centered]; video = [video], [title], [body] (caption), [autoplay]; products = [title], [layout], [productIds] (empty = all products);
 * gallery = [title], [images]; features = [title], [items]; banner = [slides]; spacer = [size].
 */
data class SSection(
    val id: String, val type: String, val hidden: Boolean = false,
    val title: String = "", val body: String = "", val centered: Boolean = false, val autoplay: Boolean = true,
    val layout: String = "grid", val size: String = "medium",
    val slides: List<SSlide> = emptyList(), val video: SMedia? = null, val images: List<SMedia> = emptyList(),
    val items: List<String> = emptyList(), val productIds: List<String> = emptyList(),
)
data class SellerContent(
    val name: String, val tagline: String, val logoUrl: String?, val coverUrl: String?, val instagram: String?, val website: String?,
    val sections: List<SSection>,
)
data class SellerBrand(
    val id: String, val slug: String,
    /** pending | active | rejected | suspended */ val status: String, val statusNote: String?,
    /** draft | submitted | approved | rejected */ val pageStatus: String, val pageNote: String?,
    val draft: SellerContent, val live: SellerContent?,
)
data class SellerOrderItem(val name: String, val size: String?, val color: String?, val unitPrice: Int, val qty: Int, val imageUrl: String?)
data class SellerOrder(
    val id: String, val orderNumber: String, val status: String, val createdAt: String, val paymentMethod: String, val paymentStatus: String,
    val customerName: String, val customerPhone: String, val address: String, val notes: String?, val items: List<SellerOrderItem>, val itemCount: Int, val subtotal: Int,
)

private fun JSONObject.sStr(k: String): String? = if (isNull(k)) null else optString(k).ifBlank { null }
private fun <T> JSONArray?.sMap(f: (JSONObject) -> T): List<T> = if (this == null) emptyList() else (0 until length()).map { f(getJSONObject(it)) }

private fun JSONObject.sMedia(k: String): SMedia? = optJSONObject(k)?.let { SMedia(it.getString("key"), it.getString("url")) }
private fun JSONArray?.sStrings(): List<String> = if (this == null) emptyList() else (0 until length()).map { getString(it) }
fun parseSSection(o: JSONObject): SSection? {
    val id = o.getString("id"); val type = o.getString("type"); val hidden = o.optBoolean("hidden", false)
    return when (type) {
        "banner" -> SSection(id, type, hidden, slides = o.optJSONArray("slides").sMap { sl -> SSlide(sl.sMedia("image")!!, sl.optString("title"), sl.optString("subtitle"), sl.optString("buttonLabel"), sl.sStr("productId")) })
        "video" -> SSection(id, type, hidden, title = o.optString("title"), body = o.optString("caption"), autoplay = o.optBoolean("autoplay", true), video = o.sMedia("video"))
        "text" -> SSection(id, type, hidden, title = o.optString("heading"), body = o.optString("body"), centered = o.optString("align") == "center")
        "products" -> SSection(id, type, hidden, title = o.optString("title"), layout = o.optString("layout", "grid"), productIds = o.optJSONArray("productIds").sStrings())
        "gallery" -> SSection(id, type, hidden, title = o.optString("title"), images = o.optJSONArray("images").sMap { SMedia(it.getString("key"), it.getString("url")) })
        "features" -> SSection(id, type, hidden, title = o.optString("title"), items = o.optJSONArray("items").sStrings())
        "spacer" -> SSection(id, type, hidden, size = o.optString("size", "medium"))
        else -> null
    }
}
fun parseSellerContent(o: JSONObject) = SellerContent(
    name = o.optString("name"), tagline = o.optString("tagline"), logoUrl = o.sStr("logoUrl"), coverUrl = o.sStr("coverUrl"),
    instagram = o.sStr("instagram"), website = o.sStr("website"),
    sections = o.optJSONArray("sections").sMap { parseSSection(it) }.filterNotNull(),
)
fun parseSellerBrand(o: JSONObject) = SellerBrand(
    id = o.getString("id"), slug = o.getString("slug"), status = o.getString("status"), statusNote = o.sStr("statusNote"),
    pageStatus = o.optString("pageStatus", "draft"), pageNote = o.sStr("pageNote"),
    draft = parseSellerContent(o.getJSONObject("draft")), live = o.optJSONObject("live")?.let { parseSellerContent(it) },
)
fun parseSellerProduct(o: JSONObject): SellerProduct {
    val cat = o.getJSONObject("category")
    return SellerProduct(
        id = o.getString("id"), name = o.getString("name"), description = o.optString("description"), categoryId = cat.getString("id"), categoryName = cat.optString("name"),
        price = o.getInt("price"), salePrice = if (o.isNull("salePrice")) null else o.getInt("salePrice"), fabric = o.sStr("fabric"),
        images = o.optJSONArray("images").sMap { SellerImage(it.getString("id"), it.getString("url"), it.getString("thumbUrl")) },
        variants = o.optJSONArray("variants").sMap { SellerVariant(it.getString("id"), it.sStr("size"), it.sStr("color"), it.getInt("stock")) },
        state = o.optString("state", "draft"), note = o.sStr("note"), isPublished = o.optBoolean("isPublished", false),
    )
}
fun parseSellerOrder(o: JSONObject): SellerOrder {
    val c = o.optJSONObject("customer")
    return SellerOrder(
        id = o.getString("id"), orderNumber = o.getString("orderNumber"), status = o.getString("status"), createdAt = o.optString("createdAt"),
        paymentMethod = o.optString("paymentMethod"), paymentStatus = o.optString("paymentStatus"),
        customerName = c?.optString("name").orEmpty(), customerPhone = c?.optString("phone").orEmpty(), address = o.optString("address"), notes = o.sStr("notes"),
        items = o.optJSONArray("items").sMap { SellerOrderItem(it.optString("name"), it.sStr("size"), it.sStr("color"), it.optInt("unitPrice"), it.optInt("qty"), it.sStr("imageUrl")) },
        itemCount = o.optInt("itemCount"), subtotal = o.optInt("subtotal"),
    )
}

// ---- request bodies ----
fun SSection.toJson(): JSONObject {
    val j = JSONObject().put("id", id).put("type", type).put("hidden", hidden)
    when (type) {
        "banner" -> j.put("slides", JSONArray(slides.map { JSONObject().put("imageKey", it.image.key).put("title", it.title).put("subtitle", it.subtitle).put("buttonLabel", it.buttonLabel).put("productId", it.productId ?: JSONObject.NULL) }))
        "video" -> j.put("videoKey", video?.key ?: "").put("title", title).put("caption", body).put("autoplay", autoplay)
        "text" -> j.put("heading", title).put("body", body).put("align", if (centered) "center" else "start")
        "products" -> j.put("title", title).put("layout", layout).put("productIds", JSONArray(productIds))
        "gallery" -> j.put("title", title).put("imageKeys", JSONArray(images.map { it.key }))
        "features" -> j.put("title", title).put("items", JSONArray(items))
        "spacer" -> j.put("size", size)
    }
    return j
}
fun SellerContent.toJson(): JSONObject = JSONObject()
    .put("name", name).put("tagline", tagline).put("instagram", instagram ?: JSONObject.NULL).put("website", website ?: JSONObject.NULL)
    .put("sections", JSONArray(sections.map { it.toJson() }))

/** What the product form edits. [id] is null while the product has not been saved yet. */
data class ProductForm(
    val name: String, val description: String, val categoryId: String, val price: Int, val salePrice: Int?, val fabric: String?, val variants: List<SellerVariant>,
)
fun ProductForm.toJson(): JSONObject = JSONObject()
    .put("name", name).put("description", description).put("categoryId", categoryId).put("price", price)
    .put("salePrice", salePrice ?: JSONObject.NULL).put("fabric", fabric ?: JSONObject.NULL)
    .put("variants", JSONArray(variants.map { v ->
        JSONObject().apply { if (v.id != null) put("id", v.id); put("size", v.size ?: JSONObject.NULL); put("color", v.color ?: JSONObject.NULL); put("stock", v.stock) }
    }))

// ---- calls ----
/** The customer's brand, or null when they never applied. */
suspend fun Repo.sellerMe(): SellerBrand? = Http.request("GET", "/seller/me", auth = true).optJSONObject("brand")?.let { parseSellerBrand(it) }
suspend fun Repo.sellerApply(name: String, phone: String, city: String, note: String, again: Boolean) =
    parseSellerBrand(Http.request("POST", if (again) "/seller/reapply" else "/seller/apply",
        JSONObject().put("name", name).put("contactPhone", phone).put("city", city).put("businessNote", note), auth = true))
suspend fun Repo.sellerSaveBrand(c: SellerContent) = parseSellerBrand(Http.request("PUT", "/seller/brand", c.toJson(), auth = true))
suspend fun Repo.sellerUploadBrandImage(kind: String, bytes: ByteArray) { Http.upload("/seller/brand/$kind", bytes) }
/** Uploads a section picture ("image") or a short MP4 ("video"). The file is kept once a saved page uses it. */
suspend fun Repo.sellerUploadMedia(type: String, bytes: ByteArray): SMedia {
    val o = if (type == "video") Http.upload("/seller/brand/media?type=video", bytes, "video/mp4", "video.mp4") else Http.upload("/seller/brand/media?type=image", bytes)
    return SMedia(o.getString("key"), o.getString("url"))
}
suspend fun Repo.sellerDeleteBrandImage(kind: String) { Http.request("DELETE", "/seller/brand/$kind", auth = true) }
suspend fun Repo.sellerSubmit() = parseSellerBrand(Http.request("POST", "/seller/brand/submit", JSONObject(), auth = true))
suspend fun Repo.sellerCategories(): List<SellerCategory> =
    Http.request("GET", "/seller/categories", auth = true).optJSONArray("items").sMap { SellerCategory(it.getString("id"), it.optString("name"), it.sStr("parentId")) }
suspend fun Repo.sellerProducts(): List<SellerProduct> = Http.request("GET", "/seller/products", auth = true).optJSONArray("items").sMap { parseSellerProduct(it) }
suspend fun Repo.sellerProduct(id: String) = parseSellerProduct(Http.request("GET", "/seller/products/$id", auth = true))
suspend fun Repo.sellerSaveProduct(id: String?, f: ProductForm) =
    parseSellerProduct(if (id == null) Http.request("POST", "/seller/products", f.toJson(), auth = true) else Http.request("PUT", "/seller/products/$id", f.toJson(), auth = true))
suspend fun Repo.sellerDeleteProduct(id: String) { Http.request("DELETE", "/seller/products/$id", auth = true) }
suspend fun Repo.sellerAddProductImage(id: String, bytes: ByteArray) { Http.upload("/seller/products/$id/images", bytes) }
suspend fun Repo.sellerDeleteProductImage(id: String, imageId: String) { Http.request("DELETE", "/seller/products/$id/images/$imageId", auth = true) }
suspend fun Repo.sellerOrders(page: Int): PageOf<SellerOrder> {
    val o = Http.request("GET", "/seller/orders?page=$page&limit=20", auth = true)
    return PageOf(o.optJSONArray("items").sMap { parseSellerOrder(it) }, o.optInt("page", page), o.optInt("total"))
}
suspend fun Repo.sellerOrder(id: String) = parseSellerOrder(Http.request("GET", "/seller/orders/$id", auth = true))

// ---- preview: the same page the customers will see, built from the seller's saved draft ----
fun SellerProduct.asShopProduct() = Product(
    id = id, name = name, description = description, categorySlug = "", categoryName = categoryName, price = price, salePrice = salePrice, fabric = fabric,
    images = images.map { ImageRef(it.url, it.thumbUrl) }, variants = variants.map { Variant(it.id ?: it.size.orEmpty(), it.size, it.color, it.stock) },
    inStock = variants.sumOf { it.stock } > 0,
)
fun SellerBrand.previewPage(products: List<SellerProduct>): BrandPage {
    val shop = products.map { it.asShopProduct() }; val byId = shop.associateBy { it.id }
    val sections = draft.sections.filter { !it.hidden }.mapNotNull { s ->
        when (s.type) {
            "banner" -> BannerSection(s.id, s.slides.map { BannerSlide(it.image.url, it.title, it.subtitle, it.buttonLabel, it.productId?.takeIf { id -> id in byId }) })
            "video" -> s.video?.let { VideoSection(s.id, it.url, s.title, s.body, s.autoplay) }
            "text" -> TextSection(s.id, s.title, s.body, s.centered)
            "products" -> (if (s.productIds.isEmpty()) shop.take(12) else s.productIds.mapNotNull { byId[it] }).takeIf { it.isNotEmpty() }?.let { ProductsSection(s.id, s.title, s.layout, it) }
            "gallery" -> GallerySection(s.id, s.title, s.images.map { it.url })
            "features" -> FeaturesSection(s.id, s.title, s.items)
            "spacer" -> SpacerSection(s.id, s.size)
            else -> null
        }
    }
    return BrandPage(
        card = BrandCard(id, slug, draft.name, draft.tagline, draft.logoUrl, draft.coverUrl),
        instagram = draft.instagram, website = draft.website, productCount = shop.size, sections = sections, products = shop,
    )
}
