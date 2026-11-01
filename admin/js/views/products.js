import { api, session } from "../api.js";
import { clear, confirmDialog, debounce, h, money, put, toast } from "../ui.js";

const LIMIT = 15;
const ACTIONS = {
  new_on: "Add to New Arrivals", new_off: "Remove from New Arrivals", feat_on: "Add to Featured", feat_off: "Remove from Featured",
  sale: "Put on sale (discount %)", sale_off: "Remove sale", pub: "Publish", unpub: "Unpublish", cat: "Move to category", del: "Delete",
};
const SECTIONS = { "": "All sections", newArrival: "New Arrivals", featured: "Featured", onSale: "On Sale" };

export async function renderProducts(view) {
  const write = session.canWrite();
  const state = { q: "", category: "", section: "", page: 1 };
  const selected = new Set();                      // product ids ticked in the list (kept while paging)
  const cats = (await api("/admin/categories")).items;
  const list = h("div", {});
  const bar = h("div", { class: "card", style: "display:none;position:sticky;top:0;z-index:5" });
  const q = h("input", { type: "search", placeholder: "Search by name or SKU", "aria-label": "Search products", oninput: debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }) });
  const cat = h("select", { "aria-label": "Filter by category", onchange: (e) => { state.category = e.target.value; state.page = 1; load(); } },
    h("option", { value: "" }, "All categories"), cats.map((c) => h("option", { value: c.slug }, c.name)));
  const sec = h("select", { "aria-label": "Filter by section", onchange: (e) => { state.section = e.target.value; state.page = 1; load(); } },
    Object.entries(SECTIONS).map(([v, t]) => h("option", { value: v }, t)));

  put(clear(view),
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Products"), h("p", { class: "muted" }, "Everything you sell, published or draft. Tick products to change many at once.")),
      write ? h("div", { class: "row" }, h("a", { class: "btn", href: "#/products/bulk" }, "Add many products"), h("a", { class: "btn gold", href: "#/products/new" }, "Add product")) : null),
    h("div", { class: "filters" }, h("div", { class: "field" }, q), h("div", { class: "field" }, cat), h("div", { class: "field" }, sec)),
    bar, list);
  await load();

  function drawBar() {
    bar.style.display = write && selected.size ? "" : "none"; if (!selected.size) return;
    const action = h("select", { "aria-label": "What to do" }, Object.entries(ACTIONS).map(([v, t]) => h("option", { value: v }, t)));
    const pct = h("input", { type: "number", min: 1, max: 90, value: 20, "aria-label": "Discount percent", style: "width:90px;display:none" });
    const to = h("select", { "aria-label": "Category", style: "display:none" }, cats.map((c) => h("option", { value: c.id }, c.name)));
    action.onchange = () => { pct.style.display = action.value === "sale" ? "" : "none"; to.style.display = action.value === "cat" ? "" : "none"; };
    const go = h("button", { class: "btn gold", onclick: async () => {
      const ids = [...selected]; const a = action.value; let url = "/admin/products/bulk-update"; let body;
      if (a === "del") {
        if (!(await confirmDialog(`Delete ${ids.length} product${ids.length === 1 ? "" : "s"}?`, "They disappear from the app and cannot be brought back.", "Delete"))) return;
        url = "/admin/products/bulk-delete"; body = { ids };
      } else {
        const set = { new_on: { isNew: true }, new_off: { isNew: false }, feat_on: { isFeatured: true }, feat_off: { isFeatured: false }, sale: { discountPercent: Number(pct.value) || 0 },
          sale_off: { discountPercent: 0 }, pub: { isPublished: true }, unpub: { isPublished: false }, cat: { categoryId: to.value } }[a];
        if (a === "sale" && !(set.discountPercent >= 1 && set.discountPercent <= 90)) { toast("Discount must be between 1 and 90", "error"); return; }
        body = { ids, set };
      }
      try {
        const r = await api(url, { method: "POST", body });
        const skipped = r.skipped ?? [];
        toast(r.deleted !== undefined ? `${r.deleted} deleted` : `${r.updated} updated${skipped.length ? `, ${skipped.length} skipped: ${skipped.slice(0, 2).map((s) => `${s.name || "product"} (${s.reason})`).join("; ")}` : ""}`, skipped.length ? "error" : "ok");
        selected.clear(); await load();
      } catch (e) { toast(e.message, "error"); }
    } }, "Apply");
    put(clear(bar), h("div", { class: "row", style: "flex-wrap:wrap;gap:8px;align-items:center" }, h("b", {}, `${selected.size} selected`), action, pct, to, go,
      h("button", { class: "btn ghost sm", onclick: () => { selected.clear(); drawBar(); load(); } }, "Clear")));
  }

  async function load() {
    const params = new URLSearchParams({ page: state.page, limit: LIMIT });
    if (state.q) params.set("q", state.q); if (state.category) params.set("category", state.category); if (state.section) params.set(state.section, "true");
    let r;
    try { r = await api(`/admin/products?${params}`); } catch (e) { put(clear(list), h("div", { class: "empty" }, h("h2", {}, "Could not load products"), h("p", {}, e.message))); return; }
    drawBar();
    if (!r.items.length) {
      put(clear(list), h("div", { class: "empty" }, h("h2", {}, state.q || state.category || state.section ? "No matching products" : "No products yet"),
        h("p", {}, state.q || state.category || state.section ? "Try a different search, category or section." : "Add your first product, upload photos, then publish it to the app.")));
      return;
    }
    const tick = (p) => { const cb = h("input", { type: "checkbox", "aria-label": `Select ${p.name}` }); cb.checked = selected.has(p.id); cb.onchange = () => { cb.checked ? selected.add(p.id) : selected.delete(p.id); drawBar(); }; return cb; };
    const all = h("input", { type: "checkbox", "aria-label": "Select all on this page" });
    all.checked = r.items.every((p) => selected.has(p.id));
    all.onchange = () => { r.items.forEach((p) => (all.checked ? selected.add(p.id) : selected.delete(p.id))); drawBar(); load(); };
    const rows = r.items.map((p) => {
      const stock = p.variants.reduce((a, v) => a + v.stock, 0);
      const img = p.images[0];
      return h("tr", {},
        write ? h("td", {}, tick(p)) : null,
        h("td", {}, img ? h("img", { src: img.thumbUrl, alt: "", loading: "lazy" }) : h("div", { class: "thumb", "aria-hidden": "true" }, p.name[0])),
        h("td", { "data-label": "Product" }, h("a", { href: `#/products/${p.id}` }, h("b", {}, p.name)), h("div", { class: "hint" }, p.sku, " ",
          p.isNew ? h("span", { class: "badge ok" }, "New") : null, " ", p.isFeatured ? h("span", { class: "badge ok" }, "Featured") : null, " ", p.salePrice ? h("span", { class: "badge warn" }, "Sale") : null)),
        h("td", { "data-label": "Category" }, p.category.name),
        h("td", { "data-label": "Price" }, p.salePrice ? h("span", {}, h("b", {}, money(p.salePrice)), " ", h("s", { class: "muted" }, money(p.price))) : money(p.price)),
        h("td", { "data-label": "Stock" }, h("span", { class: `badge ${stock === 0 ? "bad" : stock <= 5 ? "warn" : ""}` }, stock === 0 ? "Out of stock" : String(stock))),
        h("td", { "data-label": "Status" }, h("span", { class: `badge ${p.isPublished ? "ok" : ""}` }, p.isPublished ? "Published" : "Draft")),
        h("td", {}, h("a", { class: "btn ghost sm", href: `#/products/${p.id}` }, write ? "Edit" : "View")));
    });
    const pages = Math.max(1, Math.ceil(r.total / LIMIT));
    put(clear(list),
      h("table", {}, h("thead", {}, h("tr", {}, write ? h("th", { scope: "col" }, all) : null, ...["Image", "Product", "Category", "Price", "Stock", "Status", ""].map((t) => h("th", { scope: "col" }, t)))), h("tbody", {}, rows)),
      h("div", { class: "pager" }, h("span", { class: "muted" }, `${r.total} product${r.total === 1 ? "" : "s"} · page ${state.page} of ${pages}`),
        h("div", { class: "row" },
          h("button", { class: "btn ghost sm", disabled: state.page <= 1, onclick: () => { state.page--; load(); } }, "Previous"),
          h("button", { class: "btn ghost sm", disabled: state.page >= pages, onclick: () => { state.page++; load(); } }, "Next"))));
  }
}
