package com.talhastudio.app

import com.talhastudio.app.data.CheckoutForm
import com.talhastudio.app.ui.screens.validateCheckout
import org.junit.Assert.*
import org.junit.Test

class CheckoutValidationTest {
    private val ok = CheckoutForm("Ali Khan", "ali@example.com", "+92 300 1234567", "House 123, Street 1", "", "Lahore", "", "", "")
    @Test fun validFormPasses() = assertTrue(validateCheckout(ok).isEmpty())
    @Test fun flagsEveryBadField() {
        val e = validateCheckout(CheckoutForm("A", "nope", "abc", "x", "", "L", "", "", ""))
        assertEquals(setOf("name", "email", "phone", "line1", "city"), e.keys)
    }
    @Test fun phoneAcceptsLocalFormats() { assertTrue(validateCheckout(ok.copy(phone = "0300-1234567")).isEmpty()); assertTrue(validateCheckout(ok.copy(phone = "03001234567")).isEmpty()) }
}
