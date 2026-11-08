import { api, session } from "../api.js";
import { clear, confirmDialog, debounce, h, put, toast } from "../ui.js";

/** Owner-made home sections: a title + hand-picked products. They appear on the app home after New Arrivals, Featured and On Sale. */
export async function renderSections(view) {
  const write = session.canWrite();
  const body = h("div", {});
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Home sections"),
    h("p", { class: "muted" }, "Make your own sections for the app home screen (for example Eid Collection). Pick the products; \"View all\" in the app shows exactly those products. New Arrivals, Featured and On Sale are built in."))), body);
  await load();

  async function load() {
    const { items } = await api("/admin/sections");
    put(clear(body), write ? h("div", { class: "card" }, h("h2", {}, "New section"), newForm()) : null,
      items.length ? items.map(card) : h("div", { class: "empty" }, h("h2", {}, "No sections of your own yet"), h("p", {}, "Add one above, then choose its products.")));
  }

  function newForm() {
    const title = h("input", { maxlength: 40, placeholder: "e.g. Eid Collection", "aria-label": "Section name" });
    return h("form", { novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); if (title.value.trim().length < 2) return toast("Write a section name.", "error");
      try { await api("/admin/sections", { method: "POST", body: { title: title.value.trim(), sortOrder: 0, isActive: true } }); toast("Section added. Now add its products."); await load(); }
      catch (ex) { toast(ex.message, "error"); }
    } }, h("div", { class: "field" }, h("label", {}, "Section name"), title), h("button", { class: "btn gold", type: "submit" }, "Add section"));
  }

  function card(s) {
    let ids = [...s.productIds]; const names = new Map();
    const chosen = h("div", { style: "display:flex;gap:6px;flex-wrap:wrap;margin:8px 0" });
    const results = h("div", {});
    const search = h("input", { placeholder: "Search a product to add", maxlength: 60, "aria-label": "Search products" });
    const title = h("input", { maxlength: 40, value: s.title, "aria-label": "Section name" });
    const order = h("input", { type: "number", min: 0, max: 9999, value: s.sortOrder, "aria-label": "Order" });
    const active = h("input", { type: "checkbox", checked: s.isActive });

    async function paint() {
      if (ids.length) { const r = await api(`/admin/products?ids=${ids.join(",")}&limit=50`); r.items.forEach((p) => names.set(p.id, p.name)); }
      chosen.replaceChildren(...(ids.length
        ? ids.map((id) => h("span", { class: "badge" }, names.get(id) ?? "Product", write ? h("button", { class: "btn ghost sm", type: "button", "aria-label": "Remove from this section", onclick: async () => { ids = ids.filter((x) => x !== id); await save(); } }, "x") : null))
        : [h("span", { class: "muted" }, "No products yet. Search below and add some.")]));
    }
    async function save() {
      try { const r = await api(`/admin/sections/${s.id}/products`, { method: "PUT", body: { productIds: ids } }); ids = r.productIds; await paint(); }
      catch (ex) { toast(ex.message, "error"); }
    }
    search.oninput = debounce(async () => {
      const q = search.value.trim(); if (q.length < 2) { results.replaceChildren(); return; }
      try {
        const r = await api(`/admin/products?q=${encodeURIComponent(q)}&limit=8`);
        results.replaceChildren(...r.items.filter((p) => !ids.includes(p.id)).map((p) => h("div", { style: "display:flex;gap:8px;align-items:center;margin:4px 0" }, h("span", {}, p.name),
          h("button", { class: "btn gold sm", type: "button", onclick: async () => { ids = [...ids, p.id]; names.set(p.id, p.name); results.replaceChildren(); search.value = ""; await save(); } }, "Add"))));
      } catch (ex) { toast(ex.message, "error"); }
    }, 300);
    paint();

    return h("details", { class: "card", open: false },
      h("summary", {}, h("b", {}, s.title), " ", h("span", { class: `badge ${s.isActive ? "ok" : ""}` }, s.isActive ? "Visible" : "Hidden"), h("span", { class: "hint" }, `  ${s.productIds.length} products`)),
      h("p", { class: "hint" }, "Shown on the home screen after Featured and On Sale (a section with no products is not shown)."),
      chosen, write ? h("div", { class: "field" }, h("label", {}, "Add products"), search, results) : null,
      write ? h("div", { class: "grid2" }, h("div", { class: "field" }, h("label", {}, "Section name"), title), h("div", { class: "field" }, h("label", {}, "Order (0 = first)"), order)) : null,
      write ? h("label", { class: "check" }, active, "Visible in the app") : null,
      write ? h("div", { class: "row" },
        h("button", { class: "btn gold sm", type: "button", onclick: async () => {
          try { await api(`/admin/sections/${s.id}`, { method: "PUT", body: { title: title.value.trim(), sortOrder: Number(order.value) || 0, isActive: active.checked } }); toast("Section saved"); await load(); }
          catch (ex) { toast(ex.message, "error"); }
        } }, "Save section"),
        h("button", { class: "btn danger sm", type: "button", onclick: async () => {
          if (!(await confirmDialog(`Delete "${s.title}"?`, "The section is removed from the app. The products stay in your catalogue."))) return;
          try { await api(`/admin/sections/${s.id}`, { method: "DELETE" }); toast("Section deleted"); await load(); } catch (ex) { toast(ex.message, "error"); }
        } }, "Delete section")) : null);
  }
}
