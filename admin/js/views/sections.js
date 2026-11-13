import { api, session, uploadImage } from "../api.js";
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
    const lay = (await api("/admin/home-layouts")).layouts;
    put(clear(body), layoutCard(items, lay), write ? h("div", { class: "card" }, h("h2", {}, "New section"), newForm()) : null,
      items.length ? items.map(card) : h("div", { class: "empty" }, h("h2", {}, "No sections of your own yet"), h("p", {}, "Add one above, then choose its products.")));
  }

  /** Per section: "Slider" (swipes sideways) or "Grid" (two columns, scrolls down with the page). */
  function layoutCard(items, lay) {
    const rows = [{ slug: "new-arrivals", title: "New Arrivals" }, { slug: "featured", title: "Featured" }, { slug: "sale", title: "On Sale" }, ...items.map((s) => ({ slug: s.slug, title: s.title }))];
    const sel = {}; rows.forEach((r) => { sel[r.slug] = h("select", { "aria-label": `Layout of ${r.title}`, disabled: !write }, h("option", { value: "slider", selected: lay[r.slug] !== "grid" }, "Slider (swipe sideways)"), h("option", { value: "grid", selected: lay[r.slug] === "grid" }, "Grid (scrolls down)")); });
    return h("div", { class: "card" }, h("h2", {}, "How each section looks in the app"), h("p", { class: "muted" }, "Choose a sideways slider or a grid that scrolls down with the page, for every section."),
      rows.map((r) => h("div", { class: "field" }, h("label", {}, r.title), sel[r.slug])),
      write ? h("button", { class: "btn gold", type: "button", onclick: async () => {
        try { const layouts = {}; rows.forEach((r) => { if (sel[r.slug].value === "grid") layouts[r.slug] = "grid"; }); await api("/admin/home-layouts", { method: "PUT", body: { layouts } }); toast("Saved. The app shows it on the next refresh."); }
        catch (ex) { toast(ex.message, "error"); }
      } }, "Save layouts") : null);
  }

  function newForm() {
    const title = h("input", { maxlength: 40, placeholder: "e.g. Eid Collection", "aria-label": "Section name" });
    return h("form", { novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); if (title.value.trim().length < 2) return toast("Write a section name.", "error");
      try { await api("/admin/sections", { method: "POST", body: { title: title.value.trim(), sortOrder: 0, isActive: true } }); toast("Section added. Now add its products."); await load(); }
      catch (ex) { toast(ex.message, "error"); }
    } }, h("div", { class: "field" }, h("label", {}, "Section name"), title), h("button", { class: "btn gold", type: "submit" }, "Add section"));
  }

  function tile(p, extra) {
    const img = p.images?.[0];
    return h("div", { style: "width:104px;text-align:center;position:relative" },
      img ? h("img", { src: img.thumbUrl, alt: "", loading: "lazy", style: "width:104px;height:132px;object-fit:cover;border-radius:10px;display:block;background:#eee" })
        : h("div", { class: "thumb", style: "width:104px;height:132px;border-radius:10px", "aria-hidden": "true" }, p.name[0]),
      h("div", { class: "hint", style: "margin-top:4px;line-height:1.25;max-height:2.5em;overflow:hidden" }, p.name), extra);
  }

  function card(s) {
    let ids = [...s.productIds]; const known = new Map();       // product id -> product (for its picture and name)
    const chosen = h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin:8px 0" });
    const picker = h("div", { class: "card", style: "display:none" });
    const title = h("input", { maxlength: 40, value: s.title, "aria-label": "Section name" });
    const order = h("input", { type: "number", min: 0, max: 9999, value: s.sortOrder, "aria-label": "Order" });
    const active = h("input", { type: "checkbox", checked: s.isActive });

    async function paint() {
      const missing = ids.filter((id) => !known.has(id));
      if (missing.length) { const r = await api(`/admin/products?ids=${missing.join(",")}&limit=50`); r.items.forEach((p) => known.set(p.id, p)); }
      chosen.replaceChildren(...(ids.length
        ? ids.map((id) => { const p = known.get(id) ?? { id, name: "Product", images: [] };
            return tile(p, write ? h("button", { class: "btn ghost sm", type: "button", "aria-label": `Remove ${p.name} from this section`, style: "position:absolute;top:4px;right:4px;background:#fffd", onclick: async () => { ids = ids.filter((x) => x !== id); await save(); } }, "x") : null); })
        : [h("span", { class: "muted" }, "No products yet. Press \"Choose products\" and tap the pictures you want.")]));
    }
    async function save() {
      try { const r = await api(`/admin/sections/${s.id}/products`, { method: "PUT", body: { productIds: ids } }); ids = r.productIds; await paint(); }
      catch (ex) { toast(ex.message, "error"); }
    }

    // Picture picker: every product with its photo, search + category filter, tap to tick, one button adds all ticked.
    async function openPicker() {
      const st = { q: "", category: "", page: 1 }; const ticked = new Set(); const grid = h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin:8px 0" }); const pager = h("div", { class: "row" });
      const cats = (await api("/admin/categories")).items;
      const q = h("input", { type: "search", placeholder: "Search by name", "aria-label": "Search products", oninput: debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(); }, 300) });
      const cat = h("select", { "aria-label": "Category", onchange: (e) => { st.category = e.target.value; st.page = 1; load(); } }, h("option", { value: "" }, "All categories"), cats.map((c) => h("option", { value: c.slug }, c.name)));
      const add = h("button", { class: "btn gold sm", type: "button", onclick: async () => { if (!ticked.size) return toast("Tap the pictures you want to add", "error"); ids = [...ids, ...[...ticked].filter((id) => !ids.includes(id))]; picker.style.display = "none"; await save(); toast("Products added"); } }, "Add ticked products");
      const close = h("button", { class: "btn ghost sm", type: "button", onclick: () => { picker.style.display = "none"; } }, "Cancel");
      async function load() {
        const params = new URLSearchParams({ page: st.page, limit: 24 }); if (st.q) params.set("q", st.q); if (st.category) params.set("category", st.category);
        const r = await api(`/admin/products?${params}`); r.items.forEach((p) => known.set(p.id, p));
        grid.replaceChildren(...(r.items.length ? r.items.map((p) => {
          const already = ids.includes(p.id);
          const t = tile(p, h("div", { class: "badge " + (already ? "ok" : "") , style: "margin-top:2px" }, already ? "Added" : ticked.has(p.id) ? "Ticked" : "Tap to add"));
          if (!already) { t.style.cursor = "pointer"; t.setAttribute("role", "button"); t.tabIndex = 0;
            const flip = () => { ticked.has(p.id) ? ticked.delete(p.id) : ticked.add(p.id); t.style.outline = ticked.has(p.id) ? "3px solid #b99a62" : "none"; t.style.borderRadius = "12px"; t.lastChild.textContent = ticked.has(p.id) ? "Ticked" : "Tap to add"; add.textContent = ticked.size ? `Add ${ticked.size} ticked product${ticked.size === 1 ? "" : "s"}` : "Add ticked products"; };
            t.onclick = flip; t.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } };
            if (ticked.has(p.id)) { t.style.outline = "3px solid #b99a62"; t.style.borderRadius = "12px"; t.lastChild.textContent = "Ticked"; } }
          return t; }) : [h("span", { class: "muted" }, "No products found.")]));
        const pages = Math.max(1, Math.ceil(r.total / 24));
        put(clear(pager), h("span", { class: "muted" }, `${r.total} product${r.total === 1 ? "" : "s"} · page ${st.page} of ${pages}`),
          h("button", { class: "btn ghost sm", type: "button", disabled: st.page <= 1, onclick: () => { st.page--; load(); } }, "Previous"), h("button", { class: "btn ghost sm", type: "button", disabled: st.page >= pages, onclick: () => { st.page++; load(); } }, "Next"));
      }
      put(clear(picker), h("div", { class: "filters" }, h("div", { class: "field" }, q), h("div", { class: "field" }, cat)), grid, pager, h("div", { class: "row" }, add, close));
      picker.style.display = ""; await load();
    }

    // Make a brand-new product right here (photos + details); it is published and put into this section in one go.
    async function openNewProduct() {
      const cats = (await api("/admin/categories")).items;
      if (!cats.length) return toast("Add a category first (Categories page): every product needs one.", "error");
      const files = []; const thumbs = h("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin:6px 0" });
      const draw = () => put(clear(thumbs), files.map((f, i) => h("div", {}, h("img", { src: URL.createObjectURL(f), alt: "", style: "width:72px;height:90px;object-fit:cover;border-radius:8px;display:block" }),
        h("button", { class: "btn ghost sm", type: "button", onclick: () => { files.splice(i, 1); draw(); } }, "Remove"))));
      const pick = h("input", { type: "file", accept: "image/*", multiple: true, "aria-label": "Product photos", onchange: (e) => { files.push(...[...e.target.files].slice(0, 10 - files.length)); e.target.value = ""; draw(); } });
      const f = {
        name: h("input", { maxlength: 160, placeholder: "Product name" }), price: h("input", { type: "number", min: 1, placeholder: "Price (Rs.)" }), sale: h("input", { type: "number", min: 1, placeholder: "Sale price (optional)" }),
        fabric: h("input", { maxlength: 60, placeholder: "Fabric (optional)" }), sizes: h("input", { maxlength: 120, placeholder: "Sizes: S, M, L (empty = one size)" }), stock: h("input", { type: "number", min: 0, value: 5, "aria-label": "Stock for each size" }),
        cat: h("select", { "aria-label": "Category" }, cats.map((c) => h("option", { value: c.id }, c.name))), desc: h("textarea", { rows: 3, maxlength: 5000, placeholder: "Description", style: "width:100%" }),
      };
      const status = h("p", { class: "muted", role: "status" });
      const go = h("button", { class: "btn gold sm", type: "button", onclick: async () => {
        const name = f.name.value.trim(), price = Number(f.price.value), sale = f.sale.value ? Number(f.sale.value) : null;
        if (name.length < 2) return toast("Write the product name", "error");
        if (!(price >= 1)) return toast("Write the price", "error");
        if (sale !== null && !(sale >= 1 && sale < price)) return toast("The sale price must be lower than the price", "error");
        if (!files.length) return toast("Add at least one photo", "error");
        go.disabled = true; status.textContent = "Creating product...";
        try {
          const made = await api("/admin/products/bulk", { method: "POST", body: { categoryId: f.cat.value, products: [{ name, price, salePrice: sale, description: f.desc.value.trim(), fabric: f.fabric.value.trim() || null,
            sizes: f.sizes.value.split(",").map((x) => x.trim()).filter(Boolean), stock: Number(f.stock.value) || 0, isNew: false, isFeatured: false }] } });
          const id = made.items[0]?.id; if (!id) throw new Error(made.failed[0]?.message || "Could not create the product");
          let ok = 0; for (const [i, file] of files.entries()) { status.textContent = `Uploading photo ${i + 1} of ${files.length}...`; try { await uploadImage(id, file); ok++; } catch { /* reported below */ } }
          if (!ok) { toast("No photo could be uploaded. The product was saved as a draft: open it in Products to add photos.", "error"); status.textContent = ""; go.disabled = false; return; }
          status.textContent = "Publishing...";
          await api("/admin/products/bulk-update", { method: "POST", body: { ids: [id], set: { isPublished: true } } });
          ids = [...ids, id]; picker.style.display = "none"; await save();
          toast(ok < files.length ? `Product added to this section (${files.length - ok} photo${files.length - ok === 1 ? "" : "s"} could not be uploaded)` : "Product added to this section", ok < files.length ? "error" : "ok");
        } catch (ex) { status.textContent = ""; toast(ex.message, "error"); go.disabled = false; }
      } }, "Add product to this section");
      put(clear(picker), h("h3", {}, "New product for this section"), h("p", { class: "hint" }, "Photos first (up to 10). The product is published right away and shown in this section. It is also a normal product, so it appears in the shop under the category you choose."),
        pick, thumbs, h("div", { class: "grid2" }, f.name, f.price, f.sale, f.fabric, f.sizes, f.stock), h("div", { class: "field" }, h("label", {}, "Category"), f.cat),
        h("div", { class: "field" }, f.desc), h("div", { class: "row" }, go, h("button", { class: "btn ghost sm", type: "button", onclick: () => { picker.style.display = "none"; } }, "Cancel")), status);
      picker.style.display = "";
    }
    paint();

    return h("details", { class: "card", open: false },
      h("summary", {}, h("b", {}, s.title), " ", h("span", { class: `badge ${s.isActive ? "ok" : ""}` }, s.isActive ? "Visible" : "Hidden"), h("span", { class: "hint" }, `  ${s.productIds.length} products`)),
      h("p", { class: "hint" }, "Shown on the home screen after Featured and On Sale (a section with no products is not shown)."),
      chosen, write ? h("div", { class: "row" }, h("button", { class: "btn gold sm", type: "button", onclick: openNewProduct }, "Add a new product here"), h("button", { class: "btn ghost sm", type: "button", onclick: openPicker }, "Choose existing products")) : null, picker,
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
