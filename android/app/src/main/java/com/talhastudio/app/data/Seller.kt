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
data class SellerCollection(val id: String?, val title: String, val productIds: List<String>)
data class SellerContent(
    val name: String, val tagline: String, val about: String, val style: String, val accent: String,
    val logoUrl: String?, val coverUrl: String?, val highlights: List<String>, val instagram: String?, val website: String?,
    val collections: List<SellerCollection>,
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

fun parseSellerContent(o: JSONObject) = SellerContent(
    name = o.optString("name"), tagline = o.optString("tagline"), about = o.optString("about"), style = o.optString("style", "noir"), accent = o.optString("accent", "#B99A62"),
    logoUrl = o.sStr("logoUrl"), coverUrl = o.sStr("coverUrl"),
    highlights = o.optJSONArray("highlights")?.let { a -> (0 until a.length()).map(a::getString) } ?: emptyList(),
    instagram = o.sStr("instagram"), website = o.sStr("website"),
    collections = o.optJSONArray("collections").sMap { c ->
        SellerCollection(c.sStr("id"), c.optString("title"), c.optJSONArray("productIds")?.let { a -> (0 until a.length()).map(a::getString) } ?: emptyList())
    },
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
fun SellerContent.toJson(): JSONObject = JSONObject()
    .put("name", name).put("tagline", tagline).put("about", about).put("style", style).put("accent", accent)
    .put("highlights", JSONArray(highlights)).put("instagram", instagram ?: JSONObject.NULL).put("website", website ?: JSONObject.NULL)
    .put("collections", JSONArray(collections.map { c ->
        JSONObject().apply { if (c.id != null) put("id", c.id); put("title", c.title); put("productIds", JSONArray(c.productIds)) }
    }))

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
    return BrandPage(
        card = BrandCard(id, slug, draft.name, draft.tagline, draft.style, draft.accent, draft.logoUrl, draft.coverUrl),
        about = draft.about, highlights = draft.highlights, instagram = draft.instagram, website = draft.website, productCount = shop.size,
        collections = draft.collections.map { c -> BrandCollection(c.id ?: c.title, c.title, c.productIds.mapNotNull { byId[it] }) }.filter { it.products.isNotEmpty() },
        products = shop,
    )
}
