package com.talhastudio.app.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import com.talhastudio.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class ApiException(
    val offline: Boolean, message: String, val status: Int = 0,
    val code: String? = null, val fields: Map<String, String> = emptyMap(), val issues: List<QuoteIssue> = emptyList(),
) : Exception(message)

private fun JSONObject.str(k: String): String? = if (isNull(k)) null else optString(k)
private fun JSONObject.intOrNull(k: String): Int? = if (isNull(k) || !has(k)) null else optInt(k)
private inline fun <T> JSONArray?.mapObjects(f: (JSONObject) -> T): List<T> =
    if (this == null) emptyList() else (0 until length()).map { f(getJSONObject(it)) }

// ---- parsing (pure; unit tested) ----
fun parseProduct(o: JSONObject): Product {
    val cat = o.getJSONObject("category")
    return Product(
        id = o.getString("id"), name = o.getString("name"), description = o.optString("description", ""),
        categorySlug = cat.getString("slug"), categoryName = cat.getString("name"),
        price = o.getInt("price"), salePrice = o.intOrNull("salePrice"), fabric = o.str("fabric"),
        images = o.optJSONArray("images").mapObjects { ImageRef(it.getString("url"), it.getString("thumbUrl")) },
        variants = o.optJSONArray("variants").mapObjects { Variant(it.getString("id"), it.str("size"), it.str("color"), it.getInt("stock")) },
        inStock = o.optBoolean("inStock", false),
        related = o.optJSONArray("related").mapObjects { parseProduct(it) },
    )
}
fun parseQuote(o: JSONObject) = Quote(
    items = o.optJSONArray("items").mapObjects { QuoteItem(it.getString("variantId"), it.getInt("unitPrice"), it.getInt("qty")) },
    issues = o.optJSONArray("issues").mapObjects { QuoteIssue(it.getString("variantId"), it.getString("code"), it.getString("message"), it.intOrNull("available")) },
    subtotal = o.getInt("subtotal"), discount = o.optInt("discount", 0), shipping = o.getInt("shipping"), total = o.getInt("total"), couponCode = o.str("couponCode"),
)
fun parseUser(o: JSONObject) = User(o.getString("id"), o.getString("email"), o.getString("fullName"), o.str("phone"), o.optString("role", "customer"))
fun parseAddress(o: JSONObject) = Address(o.getString("id"), o.str("label"), o.getString("recipient"), o.getString("phone"), o.getString("line1"), o.str("line2"),
    o.getString("city"), o.str("province"), o.str("postalCode"), o.optBoolean("isDefault", false))
fun parseOrder(o: JSONObject): Order {
    val c = o.getJSONObject("customer"); val a = o.getJSONObject("address")
    return Order(
        id = o.getString("id"), orderNumber = o.getString("orderNumber"), status = o.getString("status"), paymentMethod = o.getString("paymentMethod"), paymentStatus = o.getString("paymentStatus"),
        subtotal = o.getInt("subtotal"), discount = o.optInt("discount", 0), shipping = o.getInt("shipping"), total = o.getInt("total"),
        customerName = c.getString("name"), customerEmail = c.getString("email"), customerPhone = c.getString("phone"),
        address = listOfNotNull(a.str("line1"), a.str("line2"), a.str("city"), a.str("province"), a.str("postalCode")).filter { it.isNotBlank() }.joinToString(", "),
        notes = o.str("notes"), trackingUrl = o.str("trackingUrl"),
        items = o.optJSONArray("items").mapObjects { OrderItem(it.getString("name"), it.getString("sku"), it.str("size"), it.str("color"), it.getInt("unitPrice"), it.getInt("qty"), it.str("imageUrl")) },
        history = o.optJSONArray("history").mapObjects { StatusEntry(it.getString("status"), it.str("note"), it.getString("at")) },
        createdAt = o.getString("createdAt"),
    )
}
fun parseOrderSummary(o: JSONObject) = OrderSummary(o.getString("id"), o.getString("orderNumber"), o.getString("status"), o.getInt("total"), o.getString("createdAt"),
    o.optInt("itemCount", 0), o.str("firstItemName"), o.str("imageUrl"))
/** Parses the API's standard error body into an ApiException (field errors + cart issues included). */
fun parseError(status: Int, text: String): ApiException {
    val err = runCatching { JSONObject(text).getJSONObject("error") }.getOrNull()
        ?: return ApiException(false, "Something went wrong ($status)", status)
    val fields = err.optJSONObject("fields")?.let { f -> f.keys().asSequence().associateWith { f.getString(it) } } ?: emptyMap()
    val issues = err.optJSONObject("details")?.optJSONArray("issues").mapObjects { QuoteIssue(it.getString("variantId"), it.getString("code"), it.getString("message"), it.intOrNull("available")) }
    return ApiException(false, err.optString("message", "Something went wrong"), status, err.str("code"), fields, issues)
}
fun parseNotification(o: JSONObject) = AppNotification(o.getString("id"), o.getString("title"), o.getString("body"), o.str("deepLink"), o.optString("kind", "order"), o.optBoolean("read", false), o.getString("createdAt"))
fun parsePrefs(o: JSONObject) = NotifPrefs(o.optBoolean("orderUpdates", true), o.optBoolean("promotions", true))
fun parseBanner(o: JSONObject) = Banner(o.getString("id"), o.getString("title"), o.str("subtitle"), o.str("ctaLabel"), o.str("ctaLink"), o.str("imageUrl"))
fun parseStoreInfo(o: JSONObject) = StoreInfo(o.getString("name"), o.str("supportEmail"), o.str("supportPhone"), o.str("address"), o.str("estimatedDelivery"), o.getJSONObject("shipping").let { it.getInt("flat") to it.getInt("freeOver") }, o.optInt("returnWindowDays", 7),
    o.optJSONArray("pages").mapObjects { it.getString("slug") to it.getString("title") })
fun parsePage(o: JSONObject) = PageDoc(o.getString("slug"), o.getString("title"), o.getString("body"), o.optJSONArray("contact")?.let { a -> (0 until a.length()).map(a::getString) } ?: emptyList())
fun parseSlides(o: JSONObject) = o.optJSONArray("slides").mapObjects { Slide(it.getString("id"), it.getString("title"), it.optString("body", ""), it.str("imageUrl")) }
fun parseChatMessage(o: JSONObject) = ChatMessage(o.getLong("seq"), o.getString("id"), o.getString("sender") == "store", o.optString("body", ""), o.str("imageUrl"), o.getString("createdAt"), o.optBoolean("read", false))
fun parseStatus(o: JSONObject) = StatusItem(o.getString("id"), o.getString("imageUrl"), o.str("caption"), o.getString("createdAt"))
fun parseAssistant(o: JSONObject) = AssistantReply(o.optString("reply", ""), o.optJSONArray("actions").mapObjects { AssistantAction(it.getString("type"), it.str("id"), it.getString("label")) })
fun parseCategories(a: JSONArray?) = a.mapObjects { Category(it.getString("id"), it.getString("slug"), it.getString("name")) }

/** Login state. Tokens live in app-private storage (backups are disabled in the manifest). */
object Session {
    private var sp: android.content.SharedPreferences? = null
    var access: String? = null
        private set
    var refresh: String? = null
        private set
    var user by androidx.compose.runtime.mutableStateOf<User?>(null)
        private set
    val signedIn get() = user != null

    fun init(ctx: android.content.Context) {
        if (sp != null) return
        sp = ctx.getSharedPreferences("talha_session", android.content.Context.MODE_PRIVATE)
        access = sp!!.getString("a", null); refresh = sp!!.getString("r", null)
        user = sp!!.getString("u", null)?.let { runCatching { parseUser(JSONObject(it)) }.getOrNull() }
        if (refresh == null) user = null
    }
    fun save(a: String?, r: String, u: User) {
        access = a; refresh = r; user = u
        sp?.edit()?.putString("a", a)?.putString("r", r)?.putString("u", JSONObject().put("id", u.id).put("email", u.email).put("fullName", u.fullName).put("phone", u.phone ?: JSONObject.NULL).put("role", u.role).toString())?.apply()
    }
    fun updateUser(u: User) { user = u; sp?.edit()?.putString("u", JSONObject().put("id", u.id).put("email", u.email).put("fullName", u.fullName).put("phone", u.phone ?: JSONObject.NULL).put("role", u.role).toString())?.apply() }
    fun setAccess(a: String, r: String) { access = a; refresh = r; sp?.edit()?.putString("a", a)?.putString("r", r)?.apply() }
    fun clear() { access = null; refresh = null; user = null; sp?.edit()?.clear()?.apply() }
}

object Http {
    private val refreshLock = Mutex()

    /** Free API hosts sleep when idle, so reads wait up to 60 s before giving up. With auth=true the access token is attached and refreshed once on 401. */
    suspend fun request(method: String, path: String, body: JSONObject? = null, auth: Boolean = false): JSONObject {
        val used = if (auth) Session.access else null
        try { return raw(method, path, body, used) }
        catch (e: ApiException) {
            if (!auth || e.status != 401 || Session.refresh == null) throw e
            refreshTokens(used)
            return raw(method, path, body, Session.access)
        }
    }

    /** Only one refresh at a time; if another request already rotated the token we reuse it (reusing a rotated refresh token would sign everyone out). */
    private suspend fun refreshTokens(usedAccess: String?) = refreshLock.withLock {
        if (Session.access != null && Session.access != usedAccess) return@withLock
        val r = Session.refresh ?: throw ApiException(false, "Please sign in again", 401)
        try {
            val o = raw("POST", "/auth/refresh", JSONObject().put("refreshToken", r), null)
            Session.save(o.getString("accessToken"), o.getString("refreshToken"), parseUser(o.getJSONObject("user")))
        } catch (e: ApiException) {
            if (e.status == 401) Session.clear()
            throw if (e.status == 401) ApiException(false, "Your session expired. Please sign in again.", 401) else e
        }
    }

    private suspend fun raw(method: String, path: String, body: JSONObject?, token: String?): JSONObject = withContext(Dispatchers.IO) {
        val c = (URL(BuildConfig.API_BASE_URL.trimEnd('/') + path).openConnection() as HttpURLConnection)
        try {
            c.requestMethod = method; c.connectTimeout = 20_000; c.readTimeout = 60_000
            c.setRequestProperty("Accept", "application/json")
            if (token != null) c.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) { c.doOutput = true; c.setRequestProperty("Content-Type", "application/json"); c.outputStream.use { it.write(body.toString().toByteArray()) } }
            val code = c.responseCode
            val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code >= 400) throw parseError(code, text)
            if (text.isBlank()) JSONObject() else JSONObject(text)
        } catch (e: IOException) {
            throw ApiException(true, "Can't reach the store. Check your connection and try again.")
        } finally { c.disconnect() }
    }
    /** Uploads one picture as multipart/form-data (field "file"), refreshing the session once on 401 like request(). */
    suspend fun upload(path: String, bytes: ByteArray, mime: String = "image/jpeg", filename: String = "photo.jpg"): JSONObject {
        suspend fun once(token: String?): JSONObject = withContext(Dispatchers.IO) {
            val boundary = "----ts" + java.util.UUID.randomUUID().toString().replace("-", "")
            val c = (URL(BuildConfig.API_BASE_URL.trimEnd('/') + path).openConnection() as HttpURLConnection)
            try {
                c.requestMethod = "POST"; c.connectTimeout = 20_000; c.readTimeout = 90_000; c.doOutput = true; c.setChunkedStreamingMode(0)
                c.setRequestProperty("Accept", "application/json"); c.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                if (token != null) c.setRequestProperty("Authorization", "Bearer $token")
                c.outputStream.use { o ->
                    o.write("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"$filename\"\r\nContent-Type: $mime\r\n\r\n".toByteArray())
                    o.write(bytes); o.write("\r\n--$boundary--\r\n".toByteArray())
                }
                val code = c.responseCode
                val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                if (code >= 400) throw parseError(code, text)
                JSONObject(text.ifBlank { "{}" })
            } catch (e: IOException) { throw ApiException(true, "Can't reach the store. Check your connection and try again.") }
            finally { c.disconnect() }
        }
        val used = Session.access
        return try { once(used) } catch (e: ApiException) {
            if (e.status != 401 || Session.refresh == null) throw e
            refreshTokens(used); once(Session.access)
        }
    }

    /** For extra request headers (order creation needs Idempotency-Key). */
    suspend fun post(path: String, body: JSONObject, idempotencyKey: String): JSONObject = withContext(Dispatchers.IO) {
        suspend fun once(token: String?): JSONObject = withContext(Dispatchers.IO) {
            val c = (URL(BuildConfig.API_BASE_URL.trimEnd('/') + path).openConnection() as HttpURLConnection)
            try {
                c.requestMethod = "POST"; c.connectTimeout = 20_000; c.readTimeout = 60_000; c.doOutput = true
                c.setRequestProperty("Accept", "application/json"); c.setRequestProperty("Content-Type", "application/json")
                c.setRequestProperty("Idempotency-Key", idempotencyKey)
                if (token != null) c.setRequestProperty("Authorization", "Bearer $token")
                c.outputStream.use { it.write(body.toString().toByteArray()) }
                val code = c.responseCode
                val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                if (code >= 400) throw parseError(code, text)
                JSONObject(text.ifBlank { "{}" })
            } catch (e: IOException) { throw ApiException(true, "Can't reach the store. Your order was not confirmed yet. Tap Place Order again; it will not be duplicated.") }
            finally { c.disconnect() }
        }
        val used = Session.access
        try { once(used) } catch (e: ApiException) {
            if (e.status != 401 || Session.refresh == null) throw e
            refreshTokens(used); once(Session.access)
        }
    }
}

object Repo {
    const val PAGE_SIZE = 20
    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    private var cache: LocalStore? = null
    fun initCache(ctx: android.content.Context) { cache = LocalStore(ctx.applicationContext) }
    /** Last home feed from the previous visit (null on first ever launch). */
    fun cachedHome(): HomeData? = runCatching { cache?.homeJson()?.let { parseHome(JSONObject(it)) } }.getOrNull()
    suspend fun home(): HomeData {
        val o = Http.request("GET", "/home")
        runCatching { cache?.saveHomeJson(o.toString()) }
        return parseHome(o)
    }
    private fun parseHome(o: JSONObject): HomeData {
        return HomeData(parseCategories(o.optJSONArray("categories")),
            o.optJSONArray("collections").mapObjects { c -> HomeCollection(c.getString("slug"), c.getString("title"), c.optJSONArray("products").mapObjects { parseProduct(it) }) },
            o.optJSONArray("banners").mapObjects { parseBanner(it) }, o.str("announcement"))
    }
    suspend fun categories() = parseCategories(Http.request("GET", "/categories").optJSONArray("items"))

    suspend fun products(f: Filter, page: Int): PageOf<Product> {
        val q = buildList {
            add("page=$page"); add("limit=$PAGE_SIZE"); add("sort=${f.sort.api}")
            f.category?.let { add("category=${enc(it)}") }
            if (f.query.isNotBlank()) add("q=${enc(f.query.trim())}")
            if (f.inStockOnly) add("inStock=true")
            f.minPrice?.let { add("minPrice=$it") }; f.maxPrice?.let { add("maxPrice=$it") }
        }.joinToString("&")
        val o = Http.request("GET", "/products?$q")
        return PageOf(o.optJSONArray("items").mapObjects { parseProduct(it) }, o.getInt("page"), o.getInt("total"))
    }
    suspend fun product(id: String) = parseProduct(Http.request("GET", "/products/$id"))

    /** Wishlist / recently viewed / cart refresh. Unpublished or deleted products simply do not come back. */
    suspend fun byIds(ids: List<String>): List<Product> {
        if (ids.isEmpty()) return emptyList()
        val o = Http.request("GET", "/products?limit=50&ids=${ids.take(50).joinToString(",")}")
        val map = o.optJSONArray("items").mapObjects { parseProduct(it) }.associateBy { it.id }
        return ids.mapNotNull { map[it] }
    }
    suspend fun quote(lines: List<CartLine>, coupon: String? = null): Quote {
        val items = JSONArray().also { a -> lines.forEach { a.put(JSONObject().put("variantId", it.variantId).put("qty", it.qty)) } }
        return parseQuote(Http.request("POST", "/cart/quote", JSONObject().put("items", items).apply { if (!coupon.isNullOrBlank()) put("couponCode", coupon) }))
    }

    // ---- accounts ----
    private fun JSONObject.session(): User {
        val u = parseUser(getJSONObject("user")); Session.save(getString("accessToken"), getString("refreshToken"), u); return u
    }
    suspend fun register(name: String, email: String, password: String, phone: String?) =
        Http.request("POST", "/auth/register", JSONObject().put("fullName", name).put("email", email).put("password", password).apply { if (!phone.isNullOrBlank()) put("phone", phone) }).session()
    suspend fun login(email: String, password: String) = Http.request("POST", "/auth/login", JSONObject().put("email", email).put("password", password)).session()
    /** Mobile-number accounts (used by the chat). The number is not verified by SMS. */
    suspend fun phoneRegister(name: String, phone: String, password: String) =
        Http.request("POST", "/auth/phone/register", JSONObject().put("fullName", name).put("phone", phone).put("password", password)).session()
    suspend fun phoneLogin(phone: String, password: String) = Http.request("POST", "/auth/phone/login", JSONObject().put("phone", phone).put("password", password)).session()
    suspend fun googleLogin(idToken: String) = Http.request("POST", "/auth/google", JSONObject().put("idToken", idToken)).session()
    suspend fun logout() {
        com.talhastudio.app.push.PushTokens.unregister()      // while still signed in, so the server stops pushing to this phone
        val r = Session.refresh
        Session.clear()
        if (r != null) runCatching { Http.request("POST", "/auth/logout", JSONObject().put("refreshToken", r)) }
    }
    suspend fun deleteAccount(password: String?) {
        Http.request("POST", "/me/delete", JSONObject().apply { if (!password.isNullOrBlank()) put("password", password) }, auth = true)
        runCatching { com.talhastudio.app.push.PushTokens.unregister() }; Session.clear()
    }
    suspend fun addresses() = Http.request("GET", "/me/addresses", auth = true).optJSONArray("items").mapObjects { parseAddress(it) }
    suspend fun saveAddress(f: CheckoutForm, isDefault: Boolean): Address = parseAddress(Http.request("POST", "/me/addresses", JSONObject()
        .put("recipient", f.name).put("phone", f.phone).put("line1", f.line1).put("city", f.city).put("isDefault", isDefault)
        .apply { if (f.line2.isNotBlank()) put("line2", f.line2); if (f.province.isNotBlank()) put("province", f.province); if (f.postalCode.isNotBlank()) put("postalCode", f.postalCode) }, auth = true))
    suspend fun deleteAddress(id: String) { Http.request("DELETE", "/me/addresses/$id", auth = true) }

    // ---- orders ----
    suspend fun placeOrder(lines: List<CartLine>, f: CheckoutForm, idempotencyKey: String, coupon: String? = null): Order {
        val items = JSONArray().also { a -> lines.forEach { a.put(JSONObject().put("variantId", it.variantId).put("qty", it.qty)) } }
        val body = JSONObject().put("items", items).put("paymentMethod", "cod")
            .put("customer", JSONObject().put("name", f.name.trim()).put("email", f.email.trim()).put("phone", f.phone.trim()))
            .put("address", JSONObject().put("line1", f.line1.trim()).put("city", f.city.trim())
                .apply { if (f.line2.isNotBlank()) put("line2", f.line2.trim()); if (f.province.isNotBlank()) put("province", f.province.trim()); if (f.postalCode.isNotBlank()) put("postalCode", f.postalCode.trim()) })
            .apply { if (f.notes.isNotBlank()) put("notes", f.notes.trim()); if (!coupon.isNullOrBlank()) put("couponCode", coupon) }
        return parseOrder(Http.post("/orders", body, idempotencyKey))
    }
    suspend fun orders(page: Int): PageOf<OrderSummary> {
        val o = Http.request("GET", "/me/orders?page=$page&limit=$PAGE_SIZE", auth = true)
        return PageOf(o.optJSONArray("items").mapObjects { parseOrderSummary(it) }, o.getInt("page"), o.getInt("total"))
    }
    suspend fun order(id: String) = parseOrder(Http.request("GET", "/me/orders/$id", auth = true))
    suspend fun cancelOrder(id: String) = parseOrder(Http.request("POST", "/me/orders/$id/cancel", JSONObject(), auth = true))
    suspend fun requestReturn(id: String, reason: String) = parseOrder(Http.request("POST", "/me/orders/$id/return", JSONObject().put("reason", reason), auth = true))

    // ---- notifications ----
    suspend fun registerDevice(token: String) { Http.request("POST", "/me/devices", JSONObject().put("fcmToken", token).put("platform", "android"), auth = true) }
    suspend fun unregisterDevice(token: String) { Http.request("POST", "/me/devices/unregister", JSONObject().put("fcmToken", token), auth = true) }
    suspend fun notifications(page: Int): NotificationsPage {
        val o = Http.request("GET", "/me/notifications?page=$page&limit=$PAGE_SIZE", auth = true)
        return NotificationsPage(o.optJSONArray("items").mapObjects { parseNotification(it) }, o.getInt("total"), o.getInt("unread"))
    }
    suspend fun unreadCount() = Http.request("GET", "/me/notifications/unread-count", auth = true).optInt("unread", 0)
    suspend fun markNotificationRead(id: String) { Http.request("POST", "/me/notifications/$id/read", JSONObject(), auth = true) }
    suspend fun markAllNotificationsRead() { Http.request("POST", "/me/notifications/read-all", JSONObject(), auth = true) }
    suspend fun notifPrefs() = parsePrefs(Http.request("GET", "/me/notification-preferences", auth = true))
    suspend fun setNotifPrefs(orderUpdates: Boolean? = null, promotions: Boolean? = null) = parsePrefs(Http.request("POST", "/me/notification-preferences",
        JSONObject().apply { orderUpdates?.let { put("orderUpdates", it) }; promotions?.let { put("promotions", it) } }, auth = true))

    // ---- store info, policy pages, privacy ----
    suspend fun storeInfo() = parseStoreInfo(Http.request("GET", "/store-info"))
    suspend fun page(slug: String) = parsePage(Http.request("GET", "/pages/$slug"))
    /** Everything the store holds about the signed-in customer, as pretty JSON text (GDPR-style export). */
    suspend fun exportMyData(): String = Http.request("GET", "/me/export", auth = true).toString(2)

    // ---- onboarding, chat and status ----
    /** Slides from the previous successful fetch (empty before the first one). */
    fun cachedOnboarding(): List<Slide> = runCatching { cache?.onboardingJson()?.let { parseSlides(JSONObject(it)) } }.getOrNull().orEmpty()
    suspend fun onboarding(): List<Slide> {
        val o = Http.request("GET", "/onboarding")
        runCatching { cache?.saveOnboardingJson(o.toString()) }
        return parseSlides(o)
    }
    /** afterSeq = null loads the latest messages; otherwise only newer ones (used for polling). */
    suspend fun chat(afterSeq: Long?): List<ChatMessage> =
        Http.request("GET", "/me/chat" + (afterSeq?.let { "?after=$it" } ?: ""), auth = true).optJSONArray("items").mapObjects { parseChatMessage(it) }
    suspend fun sendChat(text: String) = parseChatMessage(Http.request("POST", "/me/chat", JSONObject().put("body", text), auth = true))
    suspend fun sendChatImage(bytes: ByteArray) = parseChatMessage(Http.upload("/me/chat/image", bytes))
    suspend fun chatMarkRead() { Http.request("POST", "/me/chat/read", JSONObject(), auth = true) }
    suspend fun chatUnread() = Http.request("GET", "/me/chat/unread", auth = true).optInt("unread", 0)
    suspend fun statuses(): List<StatusItem> = Http.request("GET", "/me/status", auth = true).optJSONArray("items").mapObjects { parseStatus(it) }
    suspend fun viewStatus(id: String) { Http.request("POST", "/me/status/$id/view", JSONObject(), auth = true) }

    // ---- AI assistant ----
    /** False when the server has no API key: the floating assistant is then not shown at all. */
    suspend fun assistantEnabled(): Boolean = runCatching { Http.request("GET", "/assistant/enabled").optBoolean("enabled", false) }.getOrDefault(false)
    /** [turns] = (role "user"|"assistant", text), oldest first, ending with the customer's question. */
    suspend fun assistant(turns: List<Pair<String, String>>): AssistantReply {
        val arr = JSONArray(); turns.forEach { arr.put(JSONObject().put("role", it.first).put("content", it.second.take(1000))) }
        return parseAssistant(Http.request("POST", "/assistant", JSONObject().put("messages", arr), auth = Session.signedIn))
    }
}
