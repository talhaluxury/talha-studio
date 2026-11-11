package com.talhastudio.admin

import android.annotation.SuppressLint
import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.webkit.*
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.FragmentActivity
import androidx.webkit.WebViewAssetLoader

/**
 * Talha Studio Admin: hosts the bundled admin web app (../admin) in a locked-down WebView.
 * Pages are served from https://appassets.androidplatform.net/assets/ so ES modules, sessionStorage and CORS behave like a real site.
 * The backend's ADMIN_ORIGIN must include https://appassets.androidplatform.net.
 */
class MainActivity : FragmentActivity() {
    private lateinit var web: WebView
    private var chooser: ValueCallback<Array<Uri>>? = null
    private var pageReady = false
    private var pendingRoute: String? = null          // order to open once the page has loaded (from a tapped notification)

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    /** admin://orders/<id> (from a notification) becomes #/orders/<id> in the admin page. */
    private fun routeFrom(i: Intent?): String? {
        val link = i?.getStringExtra("deepLink") ?: return null
        val id = link.removePrefix("admin://orders/").takeIf { link.startsWith("admin://orders/") } ?: return null
        return if (Regex("^[0-9a-fA-F-]{36}$").matches(id)) "#/orders/$id" else null
    }
    private fun openRoute(r: String?) {
        if (r == null) return
        if (pageReady) web.evaluateJavascript("location.hash='$r'", null) else pendingRoute = r
    }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); openRoute(routeFrom(intent)) }

    private val picker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        var uris = WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data)
        if (uris == null && r.resultCode == RESULT_OK) {
            // Some gallery apps return the picked photo in a shape parseResult misses; read it ourselves.
            val list = mutableListOf<Uri>()
            r.data?.clipData?.let { c -> for (i in 0 until c.itemCount) list += c.getItemAt(i).uri }
            if (list.isEmpty()) r.data?.data?.let { list += it }
            if (list.isNotEmpty()) uris = list.toTypedArray()
        }
        chooser?.onReceiveValue(uris)
        chooser = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Customer data is shown here: block screenshots and the recent-apps thumbnail.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this).also { setContentView(it) }
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            userAgentString = "$userAgentString TalhaAdminApp"
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        // Fingerprint login: the page can only reach it because it only ever loads our own bundled files.
        web.addJavascriptInterface(BiometricVault(this, web), "TalhaNative")
        // One-click WhatsApp for orders (opens the customer's chat with message + product photo ready).
        web.addJavascriptInterface(WhatsAppBridge(this), "TalhaWA")

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) = loader.shouldInterceptRequest(request.url)
            // Never navigate away from the bundled admin app.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != "appassets.androidplatform.net"
            override fun onPageFinished(view: WebView, url: String?) { pageReady = true; pendingRoute?.let { r -> pendingRoute = null; view.evaluateJavascript("location.hash='$r'", null) } }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(w: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                chooser?.onReceiveValue(null)
                chooser = cb
                return try { picker.launch(params.createIntent()); true }
                catch (e: ActivityNotFoundException) { chooser = null; Toast.makeText(this@MainActivity, "No file picker available", Toast.LENGTH_SHORT).show(); false }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else finish() }
        })

        // New-order alerts: channel, permission (Android 13+), and this phone's Firebase token for the page to register.
        OrderAlerts.ensureChannel(this); OrderAlerts.fetchToken(this)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        pendingRoute = routeFrom(intent)

        if (savedInstanceState == null) web.loadUrl("https://appassets.androidplatform.net/assets/index.html")
        else web.restoreState(savedInstanceState)
    }

    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); web.saveState(outState) }
    override fun onDestroy() { web.destroy(); super.onDestroy() }
}
