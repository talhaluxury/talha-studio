import { api, ApiError, session, signInWithGoogle, signInWithPassword, signOut } from "./api.js";
import { GOOGLE_CLIENT_ID } from "./config.js";
import { clear, h, put, showFieldErrors, toast } from "./ui.js";
import { renderOverview } from "./views/overview.js";
import { renderBuilder } from "./views/builder.js";
import { renderProducts } from "./views/products.js";
import { renderOrders } from "./views/orders.js";

const app = document.getElementById("app");
const logoImg = () => h("img", { class: "logo", src: "icons/logo-64.png", alt: "Talha Studio" });
const msg = (e) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

function loadGoogle() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = h("script", { src: "https://accounts.google.com/gsi/client", async: true, defer: true });
    s.onload = resolve; s.onerror = () => reject(new Error("Google sign-in could not load"));
    document.head.append(s);
  });
}

function renderLogin() {
  const err = h("div", { class: "err", role: "alert" });
  const gbtn = h("div", { id: "gbtn", style: "display:flex;justify-content:center;min-height:44px" });
  const login = h("input", { id: "login", type: "text", autocomplete: "username", placeholder: "Email or phone number", required: true });
  const pw = h("input", { id: "pw", type: "password", autocomplete: "current-password", placeholder: "Password", required: true });
  const form = h("form", { hidden: true, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = "";
    try { await signInWithPassword(login.value.trim(), pw.value); boot(); } catch (ex) { err.textContent = msg(ex); }
  } }, h("div", { class: "field" }, login), h("div", { class: "field" }, pw), h("button", { class: "btn dark", style: "width:100%", type: "submit" }, "Sign in"));
  clear(app).append(h("div", { class: "center" }, h("div", { class: "panel" },
    logoImg(), h("h1", {}, "Sell on Talha Studio"),
    h("p", {}, "Open your own brand page inside our app. Customers find your logo in the Brands section, open your page and buy from you."),
    h("ol", { class: "steps" }, h("li", {}, "Sign in with Google and tell us about your brand"), h("li", {}, "We approve your seller account"), h("li", {}, "Build your page: logo, cover, story, products"), h("li", {}, "We review it, then it goes live in the app")),
    gbtn, err,
    h("div", { class: "or" }, "or"),
    h("button", { class: "btn ghost", style: "width:100%", type: "button", onclick: () => { form.hidden = !form.hidden; } }, "Use email or phone and password"), h("div", { style: "height:12px" }), form)));
  if (!GOOGLE_CLIENT_ID) { gbtn.replaceChildren(h("p", { class: "hint" }, "Google sign-in is not set up yet (GOOGLE_CLIENT_ID in js/config.js).")); return; }
  loadGoogle().then(() => {
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: async (r) => { try { await signInWithGoogle(r.credential); boot(); } catch (ex) { err.textContent = msg(ex); } } });
    google.accounts.id.renderButton(gbtn, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: 300 });
  }).catch((ex) => { err.textContent = ex.message; });
}

function renderApply(me) {
  const err = h("div", { class: "err", role: "alert" });
  const f = (id, label, attrs = {}, tag = "input") => h("div", { class: "field" }, h("label", { for: id }, label), h(tag, { id, ...attrs }), h("div", { class: "err", "data-err": id }));
  const form = h("form", { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ""; const v = (id) => form.querySelector("#" + id).value.trim();
    try { await api("/seller/apply", { method: "POST", body: { name: v("name"), contactPhone: v("contactPhone"), city: v("city"), businessNote: v("businessNote") } }); toast("Application sent"); boot(); }
    catch (ex) { showFieldErrors(form, ex.fields); err.textContent = ex.fields && Object.keys(ex.fields).length ? "" : msg(ex); }
  } },
    f("name", "Brand name", { type: "text", maxlength: 60, placeholder: "e.g. Noor Atelier" }),
    f("contactPhone", "Phone / WhatsApp", { type: "tel", placeholder: "+92 3xx xxxxxxx" }),
    f("city", "City", { type: "text", maxlength: 60 }),
    f("businessNote", "What do you sell? (optional)", { maxlength: 500, rows: 3 }, "textarea"),
    err, h("button", { class: "btn gold", type: "submit", style: "width:100%" }, "Apply to become a seller"));
  shellless(me, h("div", {}, h("h1", {}, "Become a seller"), h("p", {}, `Signed in as ${me.user.fullName}. Tell us about your brand and we will review it.`), form));
}

function renderStatus(me) {
  const b = me.brand; const rows = [];
  if (b.status === "pending") rows.push(h("h1", {}, "Application received"), h("p", {}, `We are reviewing ${b.draft.name}. You will get a notification in the Talha Studio app as soon as it is approved.`), h("span", { class: "badge warn" }, "Waiting for approval"));
  if (b.status === "rejected") rows.push(h("h1", {}, "Application not approved"), h("div", { class: "banner bad" }, b.statusNote || "Please contact the store."),
    h("button", { class: "btn gold", onclick: async () => { try { await api("/seller/reapply", { method: "POST" }); boot(); } catch (e) { toast(msg(e), "error"); } } }, "Ask for another review"));
  if (b.status === "suspended") rows.push(h("h1", {}, "Account suspended"), h("div", { class: "banner bad" }, b.statusNote || "Please contact the store."), h("p", {}, "Your page is hidden from customers. You can still see your orders."),
    h("button", { class: "btn dark", onclick: () => { location.hash = "#/orders"; renderShell(me, true); } }, "View my orders"));
  shellless(me, h("div", {}, rows));
}

function shellless(me, body) {
  clear(app).append(h("div", { class: "center" }, h("div", { class: "panel" }, logoImg(), body,
    h("p", { class: "hint", style: "margin-top:18px" }, h("a", { href: "#", onclick: async (e) => { e.preventDefault(); await signOut(); boot(); } }, "Sign out")))));
}

const ROUTES = { overview: renderOverview, page: renderBuilder, products: renderProducts, orders: renderOrders };
let pollTimer = null; let lastPending = null;

function renderShell(me) {
  const view = h("main", { id: "view" }); const nav = h("nav", { class: "nav", "aria-label": "Seller menu" });
  const badge = h("span", { class: "dot", hidden: true });
  const ordersLink = h("a", { href: "#/orders" }, "Orders", badge);
  const links = [["overview", "Overview"], ["page", "Brand page"], ["products", "Products"]].map(([k, t]) => h("a", { href: `#/${k}`, "data-k": k }, t));
  ordersLink.dataset.k = "orders"; links.push(ordersLink); nav.append(...links);
  const brandName = me.brand.live?.name || me.brand.draft.name;
  clear(app).append(h("header", { class: "top" }, h("div", { class: "top-in" }, h("img", { src: "icons/logo-64.png", alt: "" }), h("span", { class: "name" }, brandName), nav,
    h("button", { class: "btn sm ghost", style: "color:#d8d0bd;border-color:#444", onclick: async () => { await signOut(); boot(); } }, "Sign out"))), view);
  const ctx = { me, reload: async () => { const m = await api("/seller/me"); ctx.me = m; return m; }, setBadge(n) { badge.hidden = !n; badge.textContent = String(n); } };
  const draw = async () => {
    const key = (location.hash.replace(/^#\//, "").split("/")[0]) || "overview";
    const render = ROUTES[key] || renderOverview;
    nav.querySelectorAll("a").forEach((a) => { if (a.dataset.k === key) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    clear(view).append(h("p", { class: "hint" }, "Loading…"));
    try { await render(clear(view), ctx, location.hash.replace(/^#\//, "").split("/").slice(1)); }
    catch (e) { if (e.status === 401) { session.clear(); return boot(); } clear(view).append(h("div", { class: "empty" }, h("p", {}, msg(e)), h("button", { class: "btn", onclick: draw }, "Try again"))); }
    window.scrollTo(0, 0);
  };
  window.onhashchange = draw; draw();
  // New orders: check every minute while the page is open and tell the seller.
  clearInterval(pollTimer);
  const poll = async () => {
    try {
      const r = await api("/seller/orders?status=pending&limit=1"); ctx.setBadge(r.total);
      if (lastPending != null && r.total > lastPending) { toast("🛍️ New order received!"); document.title = `(${r.total}) Talha Studio Seller`; }
      lastPending = r.total;
    } catch { /* offline: try again next time */ }
  };
  poll(); pollTimer = setInterval(poll, 60000);
}

export async function boot() {
  clearInterval(pollTimer); lastPending = null; window.onhashchange = null;
  if (!session.signedIn()) return renderLogin();
  clear(app).append(h("div", { class: "center" }, h("p", { style: "color:#ddd" }, "Loading…")));
  let me;
  try { me = await api("/seller/me"); }
  catch (e) { if (e.status === 401) { session.clear(); return renderLogin(); } clear(app).append(h("div", { class: "center" }, h("div", { class: "panel" }, h("p", {}, msg(e)), h("button", { class: "btn", onclick: boot }, "Try again")))); return; }
  if (!me.brand) return renderApply(me);
  if (me.brand.status !== "active") return renderStatus(me);
  renderShell(me);
}
boot();
