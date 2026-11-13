package com.talhastudio.app.push

private val LINK = Regex("^talhastudio://(order|product)/([A-Za-z0-9-]{8,64})$")
private val BRAND_LINK = Regex("^talhastudio://brand/([a-z0-9-]{1,60})$")

/** Maps a server deep link (talhastudio://order/<id> or product/<id>) to an in-app navigation route; anything else is ignored. */
fun routeFor(link: String?): String? {
    if (link?.trim() == "talhastudio://chat") return "chat"          // store replied in the chat
    if (link?.trim() == "talhastudio://seller") return "seller"      // a seller account update or a new order for a seller
    BRAND_LINK.matchEntire(link?.trim().orEmpty())?.let { return "brand/${it.groupValues[1]}" }
    val m = LINK.matchEntire(link?.trim().orEmpty()) ?: return null
    return "${m.groupValues[1]}/${m.groupValues[2]}"
}

/** A notification tapped while the app is closed carries the link as an intent extra, not as intent data. Make it a proper VIEW intent. */
fun normalizeDeepLink(i: android.content.Intent) {
    if (i.data != null) return
    val link = i.getStringExtra("deepLink") ?: return
    if (routeFor(link) != null) { i.action = android.content.Intent.ACTION_VIEW; i.data = android.net.Uri.parse(link) }
}
