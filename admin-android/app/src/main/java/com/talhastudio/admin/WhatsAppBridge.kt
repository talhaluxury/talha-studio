package com.talhastudio.admin

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * One-click WhatsApp for orders. Exposed to the bundled admin page as window.TalhaWA (see admin/js/waOrder.js).
 * It only opens WhatsApp with the customer's chat, the message and (optionally) the product photo ready;
 * the admin still presses Send, so nothing leaves the phone without a human tap.
 */
class WhatsAppBridge(private val activity: Activity) {
    private val packages = listOf("com.whatsapp", "com.whatsapp.w4b")

    @JavascriptInterface
    fun available(): Boolean = true

    /** Opens the customer's chat with the text prefilled. */
    @JavascriptInterface
    fun open(phone: String, text: String) {
        val p = clean(phone) ?: return toast("Invalid phone number")
        activity.runOnUiThread { openChat(p, text.take(4000)) }
    }

    /** Downloads the product photo, then opens the customer's chat with photo + text (caption). Falls back to text + link. */
    @JavascriptInterface
    fun sharePhoto(phone: String, text: String, imageUrl: String) {
        val p = clean(phone) ?: return toast("Invalid phone number")
        val caption = text.take(1000)
        Thread {
            val got = try { download(imageUrl) } catch (e: Exception) { null }
            activity.runOnUiThread {
                if (got == null) openChat(p, (text + "\n\n" + imageUrl).take(4000))
                else shareImage(p, caption, got.first, got.second)
            }
        }.start()
    }

    private fun clean(phone: String): String? = phone.filter { it.isDigit() }.takeIf { it.length in 10..15 }

    private fun toast(msg: String) = activity.runOnUiThread { Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show() }

    private fun openChat(phone: String, text: String) {
        val uri = Uri.parse("https://api.whatsapp.com/send?phone=$phone&text=${Uri.encode(text)}")
        for (pkg in packages + listOf<String?>(null)) {
            try { activity.startActivity(Intent(Intent.ACTION_VIEW, uri).apply { if (pkg != null) setPackage(pkg) }); return }
            catch (e: ActivityNotFoundException) { /* try the next one */ }
        }
        toast("WhatsApp is not installed")
    }

    private fun shareImage(phone: String, caption: String, uri: Uri, mime: String) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, caption)
            putExtra("jid", "$phone@s.whatsapp.net") // jumps straight to this customer's chat; if WhatsApp ignores it, the contact picker shows
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        for (pkg in packages) {
            try { send.setPackage(pkg); activity.startActivity(send); return }
            catch (e: ActivityNotFoundException) { /* try the next one */ }
        }
        toast("WhatsApp is not installed")
    }

    /** Saves the picture to the app's private cache (https only, images only, max 10 MB) and returns a content:// uri + mime type. */
    private fun download(imageUrl: String): Pair<Uri, String>? {
        if (!imageUrl.startsWith("https://")) return null
        val c = URL(imageUrl).openConnection() as HttpURLConnection
        c.connectTimeout = 15000; c.readTimeout = 20000; c.instanceFollowRedirects = true
        try {
            if (c.responseCode != 200) return null
            val mime = (c.contentType ?: "image/jpeg").substringBefore(';').trim().lowercase()
            if (!mime.startsWith("image/")) return null
            val dir = File(activity.cacheDir, "wa").apply { mkdirs() }
            dir.listFiles()?.forEach { it.delete() }
            val file = File(dir, "order-" + System.currentTimeMillis() + "." + (mime.substringAfter('/').substringBefore('+').ifBlank { "jpg" }))
            var total = 0L
            c.inputStream.use { input -> file.outputStream().use { out ->
                val buf = ByteArray(16 * 1024)
                while (true) {
                    val n = input.read(buf); if (n < 0) break
                    total += n; if (total > 10L * 1024 * 1024) { file.delete(); return null }
                    out.write(buf, 0, n)
                }
            } }
            return FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file) to mime
        } finally { c.disconnect() }
    }
}
