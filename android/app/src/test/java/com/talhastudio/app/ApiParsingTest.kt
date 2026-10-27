package com.talhastudio.app

import com.talhastudio.app.data.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ApiParsingTest {
    private val productJson = """
      {"id":"p1","name":"Lawn Suit","description":"d","category":{"id":"c1","slug":"women","name":"Women"},
       "price":6999,"salePrice":4999,"fabric":null,
       "images":[{"id":"i1","url":"https://m/a.webp","thumbUrl":"https://m/a-t.webp"}],
       "variants":[{"id":"v1","size":"M","color":"Black","stock":3},{"id":"v2","size":"L","color":"Black","stock":0}],
       "inStock":true,
       "related":[{"id":"p2","name":"Other","description":"","category":{"id":"c1","slug":"women","name":"Women"},"price":100,"salePrice":null,"fabric":"Lawn","images":[],"variants":[],"inStock":false}]}
    """.trimIndent()

    @Test fun parsesProductWithNullsAndRelated() {
        val p = parseProduct(JSONObject(productJson))
        assertEquals(4999, p.effectivePrice); assertEquals(28, p.discountPercent)
        assertNull(p.fabric); assertEquals("https://m/a-t.webp", p.thumbUrl)
        assertEquals(listOf("M", "L"), p.sizes); assertEquals(3, p.totalStock)
        assertEquals(1, p.related.size); assertNull(p.related[0].salePrice); assertEquals("Lawn", p.related[0].fabric)
    }
    @Test fun variantLookupMatchesSizeAndColor() {
        val p = parseProduct(JSONObject(productJson))
        assertEquals("v1", p.variantFor("M", "Black")?.id); assertNull(p.variantFor("XL", "Black"))
    }
    @Test fun noSaleMeansNoDiscount() = assertNull(parseProduct(JSONObject(productJson).put("salePrice", JSONObject.NULL)).discountPercent)
    @Test fun parsesQuoteWithIssues() {
        val q = parseQuote(JSONObject("""{"items":[{"variantId":"v1","unitPrice":4999,"qty":2}],"issues":[{"variantId":"v2","code":"INSUFFICIENT_STOCK","message":"Only 1 left","available":1},{"variantId":"v3","code":"UNAVAILABLE","message":"Gone"}],"subtotal":9998,"discount":0,"shipping":299,"total":10297}"""))
        assertEquals(10297, q.total); assertEquals(1, q.items.size); assertEquals(1, q.issues[0].available); assertNull(q.issues[1].available)
    }
    @Test fun filterBadgeCountsActiveFilters() {
        assertEquals(0, Filter().activeCount)
        assertEquals(3, Filter(sort = Sort.PriceAsc, inStockOnly = true, minPrice = 100).activeCount)
    }
}

class OrderParsingTest {
    private val orderJson = """
      {"id":"o1","orderNumber":"TS-100245","status":"pending","paymentMethod":"cod","paymentStatus":"unpaid","subtotal":9998,"discount":0,"shipping":299,"total":10297,
       "couponCode":null,"customer":{"name":"Ali Khan","email":"ali@example.com","phone":"+92 300 1234567"},
       "address":{"line1":"House 123","line2":null,"city":"Lahore","province":"Punjab","postalCode":null},"notes":null,"trackingUrl":null,
       "items":[{"productId":"p","variantId":"v","name":"Lawn Suit","sku":"TS-1","size":"M","color":"Black","unitPrice":4999,"qty":2,"imageUrl":null}],
       "history":[{"status":"pending","note":null,"at":"2026-10-24T10:30:00.000Z"}],"createdAt":"2026-10-24T10:30:00.000Z","updatedAt":"2026-10-24T10:30:00.000Z"}
    """.trimIndent()

    @Test fun parsesOrderAndBuildsAddress() {
        val o = parseOrder(JSONObject(orderJson))
        assertEquals("TS-100245", o.orderNumber); assertEquals(10297, o.total); assertEquals("House 123, Lahore, Punjab", o.address)
        assertEquals(2, o.items[0].qty); assertNull(o.notes); assertNull(o.trackingUrl)
    }
    @Test fun customerActionsFollowStatus() {
        val o = parseOrder(JSONObject(orderJson))
        assertTrue(o.canCancel); assertFalse(o.canReturn)
        assertFalse(o.copy(status = "shipped").canCancel); assertTrue(o.copy(status = "delivered").canReturn)
    }
    @Test fun statusLabelsAreHumanReadable() { assertEquals("Refund Requested", statusLabel("refund_requested")); assertEquals("weird", statusLabel("weird")) }
    @Test fun parsesApiErrorWithFieldsAndCartIssues() {
        val e = parseError(409, """{"error":{"code":"CART_ISSUES","message":"Some items changed","details":{"issues":[{"variantId":"v1","code":"OUT_OF_STOCK","message":"Out of stock","available":0}]}}}""")
        assertEquals("CART_ISSUES", e.code); assertEquals(409, e.status); assertEquals("OUT_OF_STOCK", e.issues[0].code)
        val v = parseError(400, """{"error":{"code":"VALIDATION_FAILED","message":"Invalid input","fields":{"customer.phone":"Enter a valid phone number"}}}""")
        assertEquals("Enter a valid phone number", v.fields["customer.phone"])
        assertEquals("Something went wrong (500)", parseError(500, "<html>").message)
    }
}
