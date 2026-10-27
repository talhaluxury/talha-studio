package com.talhastudio.app

import com.talhastudio.app.data.*
import com.talhastudio.app.push.routeFor
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PushTest {
    @Test fun mapsServerLinksToRoutes() {
        assertEquals("order/3f2a9c1e-1111-4222-8333-444455556666", routeFor("talhastudio://order/3f2a9c1e-1111-4222-8333-444455556666"))
        assertEquals("product/abcdef12-0000-4000-8000-000000000000", routeFor("talhastudio://product/abcdef12-0000-4000-8000-000000000000"))
    }
    @Test fun rejectsAnythingElse() {
        assertNull(routeFor(null)); assertNull(routeFor("")); assertNull(routeFor("https://evil.example.com/order/abcdef12"))
        assertNull(routeFor("talhastudio://settings/abcdef12")); assertNull(routeFor("talhastudio://order/../../etc")); assertNull(routeFor("talhastudio://order/x"))
    }
    @Test fun parsesInboxAndPrefs() {
        val n = parseNotification(JSONObject("""{"id":"n1","title":"Order shipped","body":"TS-1","deepLink":null,"kind":"order","read":false,"createdAt":"2026-10-25T10:00:00.000Z"}"""))
        assertEquals("order", n.kind); assertNull(n.deepLink); assertFalse(n.read)
        assertEquals(NotifPrefs(false, true), parsePrefs(JSONObject("""{"orderUpdates":false,"promotions":true}""")))
    }
}

class Phase8Test {
    @Test fun parsesHomeExtras() {
        val b = parseBanner(JSONObject("""{"id":"b1","title":"Winter","subtitle":null,"ctaLabel":"Shop now","ctaLink":"talhastudio://product/abcdef12-0000-4000-8000-000000000000","imageUrl":null}"""))
        assertEquals("Winter", b.title); assertNull(b.subtitle); assertNull(b.imageUrl); assertEquals("product/abcdef12-0000-4000-8000-000000000000", routeFor(b.ctaLink))
    }
    @Test fun quoteSeparatesCouponAndLineIssues() {
        val q = parseQuote(JSONObject("""{"items":[],"issues":[{"variantId":"coupon","code":"COUPON_INVALID","message":"This code has expired"},{"variantId":"v1","code":"OUT_OF_STOCK","message":"Out of stock"}],"subtotal":0,"discount":0,"shipping":0,"total":0,"couponCode":null}"""))
        assertEquals("This code has expired", q.couponIssue?.message); assertEquals(1, q.lineIssues.size); assertNull(q.couponCode)
        assertEquals("EID10", parseQuote(JSONObject("""{"items":[],"issues":[],"subtotal":5000,"discount":500,"shipping":299,"total":4799,"couponCode":"EID10"}""")).couponCode)
    }
    @Test fun parsesStoreInfoAndPages() {
        val i = parseStoreInfo(JSONObject("""{"name":"Talha Studio","supportEmail":"help@x.com","supportPhone":null,"address":null,"estimatedDelivery":"3-5 days","shipping":{"flat":299,"freeOver":5000},"returnWindowDays":7,"pages":[{"slug":"privacy","title":"Privacy Policy"}]}"""))
        assertEquals(299 to 5000, i.shipping); assertNull(i.supportPhone); assertEquals("privacy" to "Privacy Policy", i.pages[0])
        assertEquals("Privacy Policy", parsePage(JSONObject("""{"slug":"privacy","title":"Privacy Policy","body":"x","contact":["a","b"]}""")).title)
    }
    @Test fun pageBodyBecomesHeadingsAndParagraphs() {
        val blocks = parsePageBody("# What we collect\nYour name.\n\n# Choices\nDelete any time.\n\nSecond paragraph.")
        assertEquals(listOf(PageBlock.Heading("What we collect"), PageBlock.Para("Your name."), PageBlock.Heading("Choices"), PageBlock.Para("Delete any time."), PageBlock.Para("Second paragraph.")), blocks)
        assertTrue(parsePageBody("   \n\n  ").isEmpty())
    }
}
