import { api, session } from "./api.js";
import { clear, h, put } from "./ui.js";
import { renderCategories } from "./views/categories.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderEditor } from "./views/editor.js";
import { renderLogin } from "./views/login.js";
import { renderProducts } from "./views/products.js";
import { renderOrderDetail } from "./views/orderDetail.js";
import { renderOrders } from "./views/orders.js";
import { renderEmail } from "./views/email.js";
import { renderCampaigns } from "./views/campaigns.js";
import { renderBanners, renderCoupons } from "./views/promos.js";
import { renderStoreSettings } from "./views/storeSettings.js";
import { renderActivity, renderCustomers } from "./views/people.js";

const root = document.getElementById("app");
const NAV = [["#/dashboard", "Dashboard"], ["#/orders", "Orders"], ["#/products", "Products"], ["#/categories", "Categories"]];
/** Menu by role: staff fulfil orders; admins also run promotions; the owner also sees settings and the audit trail. */
const navFor = (role) => {
  if (role !== "admin" && role !== "owner") return NAV;
  const more = [["#/banners", "Banners"], ["#/coupons", "Coupons"], ["#/customers", "Customers"], ["#/campaigns", "Notifications"]];
  return role === "owner" ? [...NAV, ...more, ["#/store", "Store settings"], ["#/email", "Email & settings"], ["#/activity", "Activity log"]] : [...NAV, ...more, ["#/email", "Email log"]];
};

function shell(active, content) {
  const s = session.get();
  const side = h("aside", { class: "side", id: "side" },
    h("div", { class: "brand" }, h("img", { src: "icons/logo-64.png", alt: "Talha Studio", width: 44, height: 44 }), h("div", {}, h("b", {}, "TALHA"), h("small", {}, "STUDIO ADMIN"))),
    h("nav", { class: "nav", "aria-label": "Main" }, navFor(s.user.role).map(([href, label]) => h("a", { href, "aria-current": active === href ? "page" : null }, label))),
    h("div", { class: "who" }, h("div", {}, s.user.fullName), h("div", {}, `Role: ${s.user.role}`),
      h("button", { class: "btn ghost sm", onclick: logout }, "Sign out")));
  const scrim = h("div", { class: "scrim", hidden: true, onclick: () => toggle(false) });
  const toggle = (open) => { side.classList.toggle("open", open); scrim.hidden = !open; };
  side.addEventListener("click", (e) => e.target.closest("a") && toggle(false));
  const top = h("header", { class: "top" }, h("div", { class: "brand" }, h("img", { src: "icons/logo-64.png", alt: "", width: 36, height: 36 }), h("b", {}, "TALHA STUDIO")),
    h("button", { class: "btn ghost sm", "aria-label": "Open menu", onclick: () => toggle(true) }, "Menu"));
  return h("div", { class: "shell" }, top, side, scrim, h("main", { class: "main", id: "main", tabindex: "-1" }, content));
}
function logout() { session.clear(); location.hash = "#/login"; }

let token = 0;
async function route() {
  const mine = ++token;
  const hash = location.hash || "#/dashboard";
  const s = session.get();
  if (!s) { if (hash !== "#/login") { location.hash = "#/login"; return; } put(clear(root), renderLogin(() => { location.hash = "#/dashboard"; })); return; }
  if (hash === "#/login") { location.hash = "#/dashboard"; return; }
  const [, section, arg] = hash.split("/");
  const view = h("div", {});
  const active = `#/${section}`;
  put(clear(root), shell(active, view));
  document.title = `${section[0].toUpperCase() + section.slice(1)} · Talha Studio Admin`;
  try {
    if (section === "dashboard") await renderDashboard(view);
    else if (section === "products" && arg) await renderEditor(view, arg);
    else if (section === "products") await renderProducts(view);
    else if (section === "orders" && arg) await renderOrderDetail(view, arg);
    else if (section === "orders") await renderOrders(view);
    else if (section === "campaigns") await renderCampaigns(view);
    else if (section === "banners") await renderBanners(view);
    else if (section === "coupons") await renderCoupons(view);
    else if (section === "store") await renderStoreSettings(view);
    else if (section === "customers") await renderCustomers(view);
    else if (section === "activity") await renderActivity(view);
    else if (section === "email") await renderEmail(view);
    else if (section === "categories") await renderCategories(view);
    else location.hash = "#/dashboard";
  } catch (e) {
    if (mine !== token) return;
    put(clear(view), h("div", { class: "empty" }, h("h2", {}, "Something went wrong"), h("p", {}, e.message), h("button", { class: "btn", onclick: route }, "Try again")));
  }
}
addEventListener("hashchange", route);
// The Android admin app bundles its own files, so the service worker is only for the browser/PWA version.
if ("serviceWorker" in navigator && !navigator.userAgent.includes("TalhaAdminApp")) navigator.serviceWorker.register("sw.js").catch(() => {});
route();
export { api };
