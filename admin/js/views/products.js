import { api, session } from "../api.js";
import { clear, debounce, h, money, put } from "../ui.js";

const LIMIT = 15;
export async function renderProducts(view) {
  const state = { q: "", category: "", page: 1 };
  const cats = (await api("/admin/categories")).items;
  const list = h("div", {});
  const q = h("input", { type: "search", placeholder: "Search by name or SKU", "aria-label": "Search products", oninput: debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }) });
  const cat = h("select", { "aria-label": "Filter by category", onchange: (e) => { state.category = e.target.value; state.page = 1; load(); } },
    h("option", { value: "" }, "All categories"), cats.map((c) => h("option", { value: c.slug }, c.name)));

  put(clear(view), 
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Products"), h("p", { class: "muted" }, "Everything you sell, published or draft.")),
      session.canWrite() ? h("a", { class: "btn gold", href: "#/products/new" }, "Add product") : null),
    h("div", { class: "filters" }, h("div", { class: "field" }, q), h("div", { class: "field" }, cat)),
    list);
  await load();

  async function load() {
    const params = new URLSearchParams({ page: state.page, limit: LIMIT });
    if (state.q) params.set("q", state.q); if (state.category) params.set("category", state.category);
    let r;
    try { r = await api(`/admin/products?${params}`); } catch (e) { put(clear(list), h("div", { class: "empty" }, h("h2", {}, "Could not load products"), h("p", {}, e.message))); return; }
    if (!r.items.length) {
      put(clear(list), h("div", { class: "empty" }, h("h2", {}, state.q || state.category ? "No matching products" : "No products yet"),
        h("p", {}, state.q || state.category ? "Try a different search or category." : "Add your first product, upload photos, then publish it to the app.")));
      return;
    }
    const rows = r.items.map((p) => {
      const stock = p.variants.reduce((a, v) => a + v.stock, 0);
      const img = p.images[0];
      return h("tr", {},
        h("td", {}, img ? h("img", { src: img.thumbUrl, alt: "", loading: "lazy" }) : h("div", { class: "thumb", "aria-hidden": "true" }, p.name[0])),
        h("td", { "data-label": "Product" }, h("a", { href: `#/products/${p.id}` }, h("b", {}, p.name)), h("div", { class: "hint" }, p.sku)),
        h("td", { "data-label": "Category" }, p.category.name),
        h("td", { "data-label": "Price" }, p.salePrice ? h("span", {}, h("b", {}, money(p.salePrice)), " ", h("s", { class: "muted" }, money(p.price))) : money(p.price)),
        h("td", { "data-label": "Stock" }, h("span", { class: `badge ${stock === 0 ? "bad" : stock <= 5 ? "warn" : ""}` }, stock === 0 ? "Out of stock" : String(stock))),
        h("td", { "data-label": "Status" }, h("span", { class: `badge ${p.isPublished ? "ok" : ""}` }, p.isPublished ? "Published" : "Draft")),
        h("td", {}, h("a", { class: "btn ghost sm", href: `#/products/${p.id}` }, session.canWrite() ? "Edit" : "View")));
    });
    const pages = Math.max(1, Math.ceil(r.total / LIMIT));
    put(clear(list), 
      h("table", {}, h("thead", {}, h("tr", {}, ["Image", "Product", "Category", "Price", "Stock", "Status", ""].map((t) => h("th", { scope: "col" }, t)))), h("tbody", {}, rows)),
      h("div", { class: "pager" }, h("span", { class: "muted" }, `${r.total} product${r.total === 1 ? "" : "s"} · page ${state.page} of ${pages}`),
        h("div", { class: "row" },
          h("button", { class: "btn ghost sm", disabled: state.page <= 1, onclick: () => { state.page--; load(); } }, "Previous"),
          h("button", { class: "btn ghost sm", disabled: state.page >= pages, onclick: () => { state.page++; load(); } }, "Next"))));
  }
}
