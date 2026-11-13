package com.talhastudio.app

import com.talhastudio.app.data.*
import com.talhastudio.app.push.routeFor
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class BrandsTest {
    private val prod = """{"id":"p1","name":"Dupatta","description":"","category":{"id":"c","slug":"women","name":"Women"},"price":1800,"salePrice":null,"fabric":null,"images":[],"variants":[],"inStock":false}"""

    @Test fun productWithoutBrandHasNoBrand() = assertNull(parseProduct(JSONObject(prod)).brand)

    @Test fun productCarriesSoldByBrand() {
        val p = parseProduct(JSONObject(prod).put("brand", JSONObject("""{"id":"b1","slug":"noor-atelier","name":"Noor Atelier","logoUrl":null}""")))
        assertEquals("noor-atelier", p.brand?.slug); assertEquals("Noor Atelier", p.brand?.name); assertNull(p.brand?.logoUrl)
    }

    @Test fun parsesBrandPage() {
        val o = JSONObject("""{"brand":{"id":"b1","slug":"noor","name":"Noor","tagline":"Lawn","style":"gold","accent":"#C9A24B","logoUrl":"https://m/l.webp","coverUrl":null,
            "about":"About us","highlights":["Handmade","Since 2010"],"instagram":"noor.pk","website":null,"productCount":1},
            "collections":[{"id":"c1","title":"Summer","products":[$prod]}],"products":[$prod]}""")
        val b = parseBrandPage(o)
        assertEquals("Noor", b.card.name); assertEquals("gold", b.card.style); assertNull(b.card.coverUrl)
        assertEquals(listOf("Handmade", "Since 2010"), b.highlights); assertNull(b.website)
        assertEquals(1, b.collections.size); assertEquals("p1", b.collections[0].products[0].id); assertEquals(1, b.products.size)
    }

    @Test fun parsesSellerState() {
        assertNull(parseSellerState(JSONObject("""{"brand":null,"user":{}}""")).status)
        val s = parseSellerState(JSONObject("""{"brand":{"status":"rejected","statusNote":"Add a phone number","pageStatus":"draft","draft":{"name":"Noor"}}}"""))
        assertEquals("rejected", s.status); assertEquals("Add a phone number", s.statusNote); assertEquals("Noor", s.brandName)
    }

    @Test fun hexColourFallsBackToGold() {
        assertEquals(0xFFC9A24BL, parseHexColor("#C9A24B")); assertEquals(0xFFB99A62L, parseHexColor("red")); assertEquals(0xFFB99A62L, parseHexColor(null))
    }

    @Test fun brandAndSellerLinksMapToRoutes() {
        assertEquals("brand/noor-atelier", routeFor("talhastudio://brand/noor-atelier")); assertEquals("seller", routeFor("talhastudio://seller"))
        assertNull(routeFor("talhastudio://brand/../x")); assertNull(routeFor("talhastudio://brand/UPPER")); assertNull(routeFor("talhastudio://seller/x"))
    }

    private val sellerProduct = """{"id":"p1","name":"Dupatta","description":"d","category":{"id":"c1","slug":"women","name":"Women"},"price":1800,"salePrice":null,"fabric":null,
        "images":[{"id":"i1","url":"https://m/a.webp","thumbUrl":"https://m/a-t.webp"}],"variants":[{"id":"v1","size":"M","color":null,"stock":3}],"state":"rejected","note":"Add a clearer photo","isPublished":false}"""

    @Test fun parsesSellerProductWithImageIds() {
        val p = parseSellerProduct(JSONObject(sellerProduct))
        assertEquals("c1", p.categoryId); assertEquals("i1", p.images[0].id); assertNull(p.salePrice); assertNull(p.variants[0].color)
        assertEquals("rejected", p.state); assertEquals("Add a clearer photo", p.note); assertFalse(p.isPublished)
    }

    @Test fun productFormBodyOmitsIdForNewVariantsAndSendsNulls() {
        val j = ProductForm("Dupatta", "d", "c1", 1800, null, null, listOf(SellerVariant(null, "M", null, 3), SellerVariant("v1", null, "Red", 0))).toJson()
        assertTrue(j.isNull("salePrice")); assertTrue(j.isNull("fabric"))
        val v = j.getJSONArray("variants"); assertFalse(v.getJSONObject(0).has("id")); assertTrue(v.getJSONObject(0).isNull("color"))
        assertEquals("v1", v.getJSONObject(1).getString("id")); assertEquals(0, v.getJSONObject(1).getInt("stock"))
    }

    @Test fun parsesSellerBrandAndBuildsPreview() {
        val c = """{"name":"Noor","tagline":"","about":"","style":"ivory","accent":"#8E1B2D","logoUrl":null,"coverUrl":null,"highlights":["Handmade"],"instagram":null,"website":null,
            "collections":[{"id":"c-1","title":"Summer","productIds":["p1","gone"]}]}"""
        val b = parseSellerBrand(JSONObject("""{"id":"b1","slug":"noor","status":"active","statusNote":null,"pageStatus":"draft","pageNote":null,"draft":$c,"live":null}"""))
        assertEquals("active", b.status); assertNull(b.live); assertEquals("ivory", b.draft.style)
        val page = b.previewPage(listOf(parseSellerProduct(JSONObject(sellerProduct))))
        assertEquals(1, page.products.size); assertTrue(page.products[0].inStock)
        assertEquals(listOf("p1"), page.collections[0].products.map { it.id })       // unknown product ids are dropped
        val back = b.draft.toJson(); assertEquals("c-1", back.getJSONArray("collections").getJSONObject(0).getString("id")); assertTrue(back.isNull("instagram"))
    }

    @Test fun parsesSellerOrderWithoutEmail() {
        val o = parseSellerOrder(JSONObject("""{"id":"o1","orderNumber":"TS-1","status":"pending","createdAt":"2026-11-01T10:00:00Z","paymentMethod":"cod","paymentStatus":"unpaid",
            "customer":{"name":"Ali","phone":"0300"},"address":"Street 1, Lahore","notes":null,"trackingUrl":null,
            "items":[{"name":"Dupatta","sku":"X","size":"M","color":null,"unitPrice":1800,"qty":2,"imageUrl":null}],"itemCount":2,"subtotal":3600}"""))
        assertEquals("Ali", o.customerName); assertEquals(3600, o.subtotal); assertEquals(2, o.items[0].qty); assertNull(o.notes)
    }
}
