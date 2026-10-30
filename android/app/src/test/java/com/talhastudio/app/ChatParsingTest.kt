package com.talhastudio.app

import com.talhastudio.app.data.*
import com.talhastudio.app.push.routeFor
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ChatParsingTest {
    @Test fun parsesStoreAndCustomerMessages() {
        val a = parseChatMessage(JSONObject("""{"seq":7,"id":"m1","sender":"store","body":"Salam!","imageUrl":null,"createdAt":"2026-10-29T10:00:00.000Z","read":false}"""))
        assertTrue(a.fromStore); assertEquals(7L, a.seq); assertNull(a.imageUrl)
        val b = parseChatMessage(JSONObject("""{"seq":8,"id":"m2","sender":"customer","body":"","imageUrl":"https://m/c.webp","createdAt":"2026-10-29T10:01:00.000Z","read":true}"""))
        assertFalse(b.fromStore); assertEquals("https://m/c.webp", b.imageUrl); assertTrue(b.read)
    }
    @Test fun parsesStatusAndSlides() {
        val s = parseStatus(JSONObject("""{"id":"s1","imageUrl":"https://m/s.webp","caption":null,"createdAt":"2026-10-29T09:00:00.000Z","expiresAt":"2026-10-30T09:00:00.000Z"}"""))
        assertNull(s.caption); assertEquals("https://m/s.webp", s.imageUrl)
        val slides = parseSlides(JSONObject("""{"slides":[{"id":"a","title":"Premium Fashion\nFor Modern Life","body":"Discover.","imageUrl":"https://m/o.webp"},{"id":"b","title":"Track","body":"","imageUrl":null}]}"""))
        assertEquals(2, slides.size); assertEquals("Premium Fashion\nFor Modern Life", slides[0].title); assertNull(slides[1].imageUrl)
    }
    @Test fun chatLinkOpensChatAndNothingElseSneaksIn() {
        assertEquals("chat", routeFor("talhastudio://chat"))
        assertNull(routeFor("talhastudio://chat/../x")); assertNull(routeFor("talhastudio://chats"))
    }
    @Test fun phoneAccountsShowTheNumberNotTheGeneratedEmail() {
        val u = User("u1", "p923001234567@phone.talha.invalid", "Ali", "+923001234567", "customer")
        assertTrue(u.isPhoneAccount); assertEquals("+923001234567", u.contactLine)
        val e = User("u2", "a@b.com", "Sara", null, "customer"); assertFalse(e.isPhoneAccount); assertEquals("a@b.com", e.contactLine)
    }

    @Test fun parsesAssistantReplyWithActions() {
        val r = parseAssistant(JSONObject("""{"reply":"Yeh dekhein.","actions":[{"type":"product","id":"p1","label":"Black Waistcoat"},{"type":"cart","label":"Open cart"}]}"""))
        assertEquals("Yeh dekhein.", r.text); assertEquals(2, r.actions.size); assertEquals("p1", r.actions[0].id); assertNull(r.actions[1].id)
    }
}
