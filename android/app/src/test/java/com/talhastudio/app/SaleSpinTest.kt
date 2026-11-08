package com.talhastudio.app

import com.talhastudio.app.data.parseSale
import com.talhastudio.app.data.parseSpinResult
import com.talhastudio.app.data.parseSpinStatus
import com.talhastudio.app.ui.components.formatCountdown
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SaleSpinTest {
    private fun feed(endsAt: String, serverNow: String = "2026-11-08T10:00:00.000Z") =
        JSONObject("""{"sale":{"label":"Eid sale ends in","endsAt":"$endsAt"},"serverNow":"$serverNow"}""")

    @Test fun saleCountsFromTheServerClockNotThePhoneClock() {
        val s = parseSale(feed("2026-11-08T12:30:00.000Z"), now = 5_000L)!!
        assertEquals("Eid sale ends in", s.label)
        assertEquals(5_000L + 2.5 * 3600_000, s.endsAtElapsed.toDouble(), 0.5)
        assertEquals(2.5 * 3600_000, s.remainingMs(5_000L).toDouble(), 0.5)
        assertEquals(0L, s.remainingMs(s.endsAtElapsed + 10_000))           // never negative
    }

    @Test fun noSaleWhenMissingOverOrUnreadable() {
        assertNull(parseSale(JSONObject("""{"sale":null,"serverNow":"2026-11-08T10:00:00.000Z"}"""), 0L))
        assertNull(parseSale(JSONObject("""{"serverNow":"2026-11-08T10:00:00.000Z"}"""), 0L))
        assertNull(parseSale(feed("2026-11-08T09:00:00.000Z"), 0L))
        assertNull(parseSale(feed("not a date"), 0L))
    }

    @Test fun countdownText() {
        assertEquals("00:00:00", formatCountdown(0)); assertEquals("00:00:00", formatCountdown(-5))
        assertEquals("00:01:05", formatCountdown(65_000)); assertEquals("02:03:04", formatCountdown((2 * 3600 + 3 * 60 + 4) * 1000L))
        assertEquals("1d 01:00:00", formatCountdown((25 * 3600) * 1000L))
    }

    @Test fun spinParsing() {
        val st = parseSpinStatus(JSONObject("""{"active":true,"percents":[5,10,15],"canSpin":false,"nextAt":"2026-11-09T10:00:00.000Z"}"""))
        assertTrue(st.active); assertEquals(listOf(5, 10, 15), st.percents); assertFalse(st.canSpin); assertEquals("2026-11-09T10:00:00.000Z", st.nextAt)
        assertNull(parseSpinStatus(JSONObject("""{"active":false,"percents":[],"canSpin":false,"nextAt":null}""")).nextAt)
        val r = parseSpinResult(JSONObject("""{"index":2,"percent":15,"code":"SPINABC234","expiresAt":"2026-11-11T10:00:00.000Z"}"""))
        assertEquals(2, r.index); assertEquals(15, r.percent); assertEquals("SPINABC234", r.code)
    }
}
