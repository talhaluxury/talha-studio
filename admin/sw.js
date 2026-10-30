// Caches the app shell only. API and media requests (cross-origin) are never touched, so data is always live.
const V = "ts-admin-v9";
const SHELL = ["./", "index.html", "css/app.css", "js/app.js", "js/api.js", "js/ui.js", "js/config.js", "js/views/login.js", "js/views/dashboard.js", "js/views/products.js", "js/views/editor.js", "js/views/categories.js", "js/views/orders.js", "js/views/email.js", "js/views/campaigns.js", "js/views/promos.js", "js/views/storeSettings.js", "js/views/people.js", "js/views/chat.js", "js/views/status.js", "js/views/whatsapp.js", "js/views/welcome.js", "js/views/orderDetail.js", "icons/icon-192.png", "icons/logo-64.png"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
