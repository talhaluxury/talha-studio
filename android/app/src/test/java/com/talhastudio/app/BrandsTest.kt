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

    @Test fun parsesBrandPageSectionsAndSkipsUnknownOnes() {
        val o = JSONObject("""{"brand":{"id":"b1","slug":"noor","name":"Noor","tagline":"Lawn","logoUrl":"https://m/l.webp","coverUrl":null,"instagram":"noor.pk","website":null,"productCount":1},
            "sections":[
              {"id":"s1","type":"banner","slides":[{"imageUrl":"https://m/b.webp","title":"New","subtitle":"","buttonLabel":"Shop","productId":"p1"},{"imageUrl":"https://m/c.webp","title":"","subtitle":"","buttonLabel":"","productId":null}]},
              {"id":"s2","type":"video","videoUrl":"https://m/v.mp4","title":"Behind","caption":"","autoplay":false},
              {"id":"s3","type":"text","heading":"Story","body":"Hello","align":"center"},
              {"id":"s4","type":"products","title":"Best","layout":"carousel","products":[$prod]},
              {"id":"s5","type":"gallery","title":"","images":[{"url":"https://m/g1.webp"}]},
              {"id":"s6","type":"features","title":"Why","items":["Pure cotton"]},
              {"id":"s7","type":"spacer","size":"large"},
              {"id":"s8","type":"hologram"}],
            "products":[$prod]}""")
        val b = parseBrandPage(o)
        assertEquals("Noor", b.card.name); assertNull(b.card.coverUrl); assertNull(b.website); assertEquals("noor.pk", b.instagram)
        assertEquals(7, b.sections.size)   // unknown section type is skipped
        val banner = b.sections[0] as BannerSection; assertEquals(2, banner.slides.size); assertEquals("p1", banner.slides[0].productId); assertNull(banner.slides[1].productId)
        assertFalse((b.sections[1] as VideoSection).autoplay); assertTrue((b.sections[2] as TextSection).centered)
        val ps = b.sections[3] as ProductsSection; assertEquals("carousel", ps.layout); assertEquals("p1", ps.products[0].id)
        assertEquals(listOf("https://m/g1.webp"), (b.sections[4] as GallerySection).images); assertEquals(listOf("Pure cotton"), (b.sections[5] as FeaturesSection).items)
        assertEquals("large", (b.sections[6] as SpacerSection).size); assertEquals(1, b.products.size)
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
        val c = """{"name":"Noor","tagline":"","logoUrl":null,"coverUrl":null,"instagram":null,"website":null,"sections":[
            {"id":"a","type":"banner","hidden":false,"slides":[{"image":{"key":"brands/b/m/1.webp","url":"https://m/1.webp"},"title":"Hi","subtitle":"","buttonLabel":"Go","productId":"p1"},
                                                              {"image":{"key":"brands/b/m/2.webp","url":"https://m/2.webp"},"title":"","subtitle":"","buttonLabel":"","productId":"gone"}]},
            {"id":"b","type":"video","hidden":false,"video":{"key":"brands/b/m/v.mp4","url":"https://m/v.mp4"},"title":"T","caption":"C","autoplay":true},
            {"id":"c","type":"products","hidden":false,"title":"All","layout":"big","productIds":[]},
            {"id":"d","type":"products","hidden":false,"title":"Some","layout":"grid","productIds":["p1","gone"]},
            {"id":"e","type":"text","hidden":true,"heading":"Secret","body":"x","align":"start"}]}"""
        val b = parseSellerBrand(JSONObject("""{"id":"b1","slug":"noor","status":"active","statusNote":null,"pageStatus":"draft","pageNote":null,"draft":$c,"live":null}"""))
        assertEquals("active", b.status); assertNull(b.live); assertEquals(5, b.draft.sections.size)
        val page = b.previewPage(listOf(parseSellerProduct(JSONObject(sellerProduct))))
        assertEquals(4, page.sections.size)   // hidden section is not previewed
        val banner = page.sections[0] as BannerSection; assertEquals("p1", banner.slides[0].productId); assertNull(banner.slides[1].productId)
        assertEquals("https://m/v.mp4", (page.sections[1] as VideoSection).videoUrl)
        assertEquals(1, (page.sections[2] as ProductsSection).products.size)               // empty list = all products
        assertEquals(listOf("p1"), (page.sections[3] as ProductsSection).products.map { it.id })   // unknown ids are dropped
        val back = b.draft.toJson(); val sec = back.getJSONArray("sections")
        assertEquals("brands/b/m/1.webp", sec.getJSONObject(0).getJSONArray("slides").getJSONObject(0).getString("imageKey"))
        assertTrue(sec.getJSONObject(0).getJSONArray("slides").getJSONObject(1).has("productId")); assertEquals("brands/b/m/v.mp4", sec.getJSONObject(1).getString("videoKey"))
        assertEquals("C", sec.getJSONObject(1).getString("caption")); assertTrue(sec.getJSONObject(4).getBoolean("hidden")); assertTrue(back.isNull("instagram"))
    }

    @Test fun parsesSellerOrderWithoutEmail() {
        val o = parseSellerOrder(JSONObject("""{"id":"o1","orderNumber":"TS-1","status":"pending","createdAt":"2026-11-01T10:00:00Z","paymentMethod":"cod","paymentStatus":"unpaid",
            "customer":{"name":"Ali","phone":"0300"},"address":"Street 1, Lahore","notes":null,"trackingUrl":null,
            "items":[{"name":"Dupatta","sku":"X","size":"M","color":null,"unitPrice":1800,"qty":2,"imageUrl":null}],"itemCount":2,"subtotal":3600}"""))
        assertEquals("Ali", o.customerName); assertEquals(3600, o.subtotal); assertEquals(2, o.items[0].qty); assertNull(o.notes)
    }

    @Test fun orderReadsWalletUsed() {
        val j = JSONObject("""{"id":"o1","orderNumber":"TS-1","status":"pending","paymentMethod":"cod","paymentStatus":"unpaid","subtotal":1000,"discount":0,"walletUsed":500,"shipping":250,"total":750,
            "customer":{"name":"A","email":"a@x.pk","phone":"+923001234567"},"address":{"line1":"x","city":"Lahore"},"items":[],"history":[],"createdAt":"2026-11-01T10:00:00Z"}""")
        assertEquals(500, parseOrder(j).walletUsed); assertEquals(750, parseOrder(j).total)
    }
}
