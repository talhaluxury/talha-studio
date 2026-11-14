package com.talhastudio.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.talhastudio.app.data.LocalStore
import com.talhastudio.app.ui.theme.TS

/** App language: English (default) or Urdu. Changing it updates every screen at once, no restart needed. */
object Lang {
    var urdu by mutableStateOf(false)
        private set
    fun init(ctx: android.content.Context) { urdu = LocalStore(ctx.applicationContext).language() == "ur" }
    fun set(ctx: android.content.Context, ur: Boolean) { urdu = ur; LocalStore(ctx.applicationContext).setLanguage(if (ur) "ur" else "en") }
}

/** Urdu for a known English label; anything not in the list stays in English. Reading this in a screen makes it update on a language change. */
fun tr(s: String): String = if (Lang.urdu) URDU[s] ?: s else s

/** Two choices: English and Urdu. */
@Composable
fun LanguageDialog(onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Language / زبان") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(false to "English", true to "اردو").forEach { (ur, label) ->
                    Row(Modifier.fillMaxWidth().clickable { Lang.set(ctx, ur); onDismiss() }.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = Lang.urdu == ur, onClick = { Lang.set(ctx, ur); onDismiss() }, colors = RadioButtonDefaults.colors(selectedColor = TS.Gold))
                        Text(label, style = MaterialTheme.typography.titleMedium)
                    }
                }
            }
        },
        confirmButton = { TextButton(onDismiss) { Text("OK / ٹھیک ہے", color = TS.Gold) } },
    )
}

private val URDU: Map<String, String> = mapOf(
    "Home" to "ہوم",
    "Categories" to "کیٹیگریز",
    "Wishlist" to "پسندیدہ",
    "Cart" to "کارٹ",
    "Profile" to "پروفائل",
    "Add to Cart" to "کارٹ میں ڈالیں",
    "All" to "سب",
    "Apply" to "لگائیں",
    "Cancel order" to "آرڈر منسوخ کریں",
    "Cancel this order?" to "یہ آرڈر منسوخ کریں؟",
    "Cancel" to "منسوخ",
    "Checkout" to "چیک آؤٹ",
    "Clear" to "صاف کریں",
    "Close" to "بند کریں",
    "Color" to "رنگ",
    "Confirming prices..." to "قیمتیں تصدیق ہو رہی ہیں...",
    "Continue shopping" to "خریداری جاری رکھیں",
    "Copy" to "کاپی",
    "Courier" to "کوریئر",
    "Customer service" to "کسٹمر سروس",
    "Delivery details" to "ڈلیوری کی تفصیل",
    "Description" to "تفصیل",
    "Discount code" to "ڈسکاؤنٹ کوڈ",
    "Discount" to "رعایت",
    "Elegance in every thread" to "ہر دھاگے میں نفاست",
    "Enter code" to "کوڈ لکھیں",
    "Filter & sort" to "فلٹر اور ترتیب",
    "Hide sold-out items" to "ختم شدہ اشیا چھپائیں",
    "In stock only" to "صرف دستیاب",
    "In stock" to "دستیاب ہے",
    "Keep order" to "آرڈر رکھیں",
    "Load more" to "مزید دیکھیں",
    "My Account" to "میرا اکاؤنٹ",
    "My Cart" to "میری کارٹ",
    "My Orders" to "میرے آرڈرز",
    "New collection coming soon" to "نیا کلیکشن جلد آ رہا ہے",
    "No orders yet" to "ابھی کوئی آرڈر نہیں",
    "No products found" to "کوئی پروڈکٹ نہیں ملی",
    "No reviews yet. Be the first to rate it." to "ابھی کوئی ریویو نہیں۔ سب سے پہلے آپ رائے دیں۔",
    "Order details" to "آرڈر کی تفصیل",
    "Order summary" to "آرڈر کا خلاصہ",
    "Out of stock" to "اسٹاک ختم",
    "Payment: choose at checkout (Cash on Delivery or online transfer)" to "ادائیگی: چیک آؤٹ پر چنیں (کیش آن ڈلیوری یا آن لائن ٹرانسفر)",
    "Payment" to "ادائیگی",
    "Price Details" to "قیمت کی تفصیل",
    "Proceed to Checkout" to "چیک آؤٹ کریں",
    "Product not found" to "پروڈکٹ نہیں ملی",
    "Quantity" to "تعداد",
    "Rate this product" to "اس پروڈکٹ کو ریٹ کریں",
    "Ratings & reviews" to "ریٹنگ اور ریویوز",
    "Recent searches" to "حالیہ تلاش",
    "Remove" to "ہٹائیں",
    "Request a return" to "واپسی کی درخواست",
    "Reset all" to "سب ری سیٹ",
    "Returns accepted within 7 days of delivery for unused items." to "استعمال نہ کی گئی اشیا ڈلیوری کے 7 دن کے اندر واپس ہو سکتی ہیں۔",
    "Save this address for next time" to "یہ پتہ اگلی بار کے لیے محفوظ کریں",
    "Saved addresses" to "محفوظ پتے",
    "Saved items are no longer available" to "محفوظ کی گئی اشیا اب دستیاب نہیں",
    "Search products..." to "پروڈکٹ تلاش کریں...",
    "Search suits, fabrics, brands" to "سوٹ، کپڑا، برانڈ تلاش کریں",
    "Search with a photo" to "تصویر سے تلاش کریں",
    "Send the total amount to:" to "کل رقم یہاں بھیجیں:",
    "Shipping" to "ڈلیوری چارجز",
    "Shop Now" to "ابھی خریدیں",
    "Show results" to "نتائج دکھائیں",
    "Show us a dress, suit or fabric you like and we will find similar products." to "اپنا پسندیدہ جوڑا یا کپڑا دکھائیں، ہم ملتی جلتی پروڈکٹس ڈھونڈ دیں گے۔",
    "Sign In / Create Account" to "سائن اِن / اکاؤنٹ بنائیں",
    "Sign in to place orders, track them live and save your delivery addresses." to "آرڈر دینے، ٹریک کرنے اور پتے محفوظ کرنے کے لیے سائن اِن کریں۔",
    "Similar to your photo" to "آپ کی تصویر سے ملتی جلتی",
    "Size" to "سائز",
    "Submit" to "جمع کرائیں",
    "Subtotal" to "ذیلی کل",
    "Tap to zoom" to "بڑا کرنے کے لیے دبائیں",
    "Tell others about the fit, fabric and quality (optional)" to "فٹنگ، کپڑے اور کوالٹی کے بارے میں بتائیں (اختیاری)",
    "Thank you!" to "شکریہ!",
    "Then type the transaction ID from your payment below. The store confirms it on WhatsApp." to "پھر ادائیگی کی ٹرانزیکشن آئی ڈی نیچے لکھیں۔ اسٹور واٹس ایپ پر تصدیق کرے گا۔",
    "This combination is out of stock" to "یہ سائز/رنگ ختم ہے",
    "Total" to "کل",
    "Track your parcel" to "اپنا پارسل ٹریک کریں",
    "Tracking no." to "ٹریکنگ نمبر",
    "Try again" to "دوبارہ کوشش کریں",
    "View order" to "آرڈر دیکھیں",
    "Wallet bonus used" to "استعمال شدہ والٹ بونس",
    "Wallet bonus" to "والٹ بونس",
    "Watch & Shop" to "دیکھیں اور خریدیں",
    "We will confirm your order on WhatsApp on the phone number above." to "ہم اوپر دیے گئے نمبر پر واٹس ایپ میں آپ کے آرڈر کی تصدیق کریں گے۔",
    "Welcome to Talha Studio" to "طلحہ اسٹوڈیو میں خوش آمدید",
    "You may also like" to "آپ کو یہ بھی پسند آ سکتا ہے",
    "Your cart is empty" to "آپ کی کارٹ خالی ہے",
    "Your wishlist is empty" to "آپ کی پسندیدہ فہرست خالی ہے",
    "Your order has been placed." to "آپ کا آرڈر مکمل ہو گیا ہے۔",
    "Your items go back on sale and you will not be charged." to "اشیا دوبارہ فروخت کے لیے لگ جائیں گی اور آپ سے رقم نہیں لی جائے گی۔",
    "Orders" to "آرڈرز",
    "Addresses" to "پتے",
    "Alerts" to "اطلاعات",
    "SELL" to "بیچیں",
    "HELP" to "مدد",
    "ABOUT" to "ہمارے بارے میں",
    "Seller account" to "سیلر اکاؤنٹ",
    "Help & Support" to "مدد اور سپورٹ",
    "Shipping & Returns" to "ڈلیوری اور واپسی",
    "Privacy Policy" to "پرائیویسی پالیسی",
    "About Talha Studio" to "طلحہ اسٹوڈیو کے بارے میں",
    "Settings" to "سیٹنگز",
    "Terms of Service" to "شرائطِ استعمال",
    "Notifications" to "نوٹیفکیشنز",
    "Account" to "اکاؤنٹ",
    "Legal" to "قانونی",
    "Wallet" to "والٹ",
    "My Wallet" to "میرا والٹ",
    "Lucky wheel" to "لکی وھیل",
    "Spin & win" to "گھمائیں اور جیتیں",
    "Popular right now" to "ابھی مقبول",
    "Related products" to "ملتی جلتی پروڈکٹس",
    "Write a review" to "ریویو لکھیں",
    "Change my review" to "میرا ریویو بدلیں",
    "Notify me when available" to "دستیاب ہونے پر بتائیں",
    "We will notify you when it is back" to "واپس آنے پر ہم آپ کو بتائیں گے",
    "Take a photo" to "تصویر کھینچیں",
    "Choose from gallery" to "گیلری سے چنیں",
    "Language" to "زبان",
    "Back in stock" to "دوبارہ دستیاب",
    "Parcel tracking" to "پارسل ٹریکنگ",
    "Download my data" to "میرا ڈیٹا ڈاؤن لوڈ کریں",
    "Sign out" to "سائن آؤٹ",
    "Delete my account" to "میرا اکاؤنٹ حذف کریں",
    "Brands" to "برانڈز",
    "See all" to "سب دیکھیں",
    "Search" to "تلاش",
    "Hello" to "السلام علیکم",
    "Offers" to "آفرز",
    "New Arrivals" to "نئی آمد",
    "Featured" to "نمایاں",
    "On Sale" to "سیل پر",
    "Place Order" to "آرڈر دیں",
    "Full name" to "پورا نام",
    "Phone" to "فون",
    "City" to "شہر"
)
