import { api, upload } from "../api.js";
import { clear, confirmDialog, h, money, put, showFieldErrors, toast } from "../ui.js";

const STATE = { draft: ["Draft", ""], pending: ["In review", "warn"], approved: ["Live", "ok"], rejected: ["Rejected", "bad"] };

export async function renderProducts(root, ctx, args) {
  if (args[0] === "new") return renderForm(root, ctx, null);
  if (args[0]) { const p = await api(`/seller/products/${args[0]}`); return renderForm(root, ctx, p); }
  const { items } = await api("/seller/products");
  put(root, h("div", { class: "row between" }, h("h1", {}, "Products"), h("a", { class: "btn gold", href: "#/products/new", style: "text-decoration:none" }, "+ Add product")),
    h("p", { class: "hint" }, "New products are reviewed together with your page before customers can see them."),
    items.length ? h("div", { class: "pgrid" }, items.map((p) => {
      const [t, tone] = STATE[p.state] ?? [p.state, ""]; const img = p.images[0];
      return h("article", { class: "pcard" }, h("div", { class: "im" }, img ? h("img", { src: img.thumbUrl, alt: p.name }) : "No photo"),
        h("div", { class: "bd" }, h("b", {}, p.name), h("div", {}, p.salePrice ? `${money(p.salePrice)} ` : money(p.price), p.salePrice ? h("s", { class: "hint" }, money(p.price)) : null),
          h("div", {}, h("span", { class: `badge ${tone}` }, t), " ", h("span", { class: "hint" }, `${p.variants.reduce((n, v) => n + v.stock, 0)} in stock`)),
          p.state === "rejected" && p.note ? h("div", { class: "err" }, p.note) : null,
          h("a", { class: "btn sm", href: `#/products/${p.id}`, style: "text-decoration:none;text-align:center" }, "Edit")));
    })) : h("div", { class: "empty" }, h("h2", {}, "No products yet"), h("p", {}, "Add your first product to fill your brand page.")));
}

async function renderForm(root, ctx, p) {
  const { items: cats } = await api("/seller/categories");
  const v = p ? structuredClone(p) : { name: "", description: "", categoryId: cats[0]?.id ?? "", price: "", salePrice: null, fabric: "", images: [], variants: [{ size: "", color: "", stock: 1 }] };
  const err = h("div", { class: "err", role: "alert" }); const form = h("form", { novalidate: true });
  const field = (key, label, el, hint) => h("div", { class: "field" }, h("label", { for: "p-" + key }, label), el, hint ? h("div", { class: "hint" }, hint) : null, h("div", { class: "err", "data-err": key }));
  const inp = (key, attrs = {}, tag = "input") => { const el = h(tag, { id: "p-" + key, value: v[key] ?? "", ...attrs }); el.addEventListener("input", () => { v[key] = el.value; }); return el; };
  const catSel = h("select", { id: "p-categoryId", onchange: (e) => { v.categoryId = e.target.value; } }, cats.map((c) => h("option", { value: c.id, selected: c.id === v.categoryId }, c.name)));
  const vbox = h("div", {});
  const drawV = () => { clear(vbox); v.variants.forEach((x, i) => vbox.append(h("div", { class: "vrow" },
    h("input", { type: "text", placeholder: "Size (M, 32…)", value: x.size ?? "", maxlength: 20, "aria-label": "Size", oninput: (e) => { x.size = e.target.value; } }),
    h("input", { type: "text", placeholder: "Colour", value: x.color ?? "", maxlength: 30, "aria-label": "Colour", oninput: (e) => { x.color = e.target.value; } }),
    h("input", { type: "number", min: 0, value: x.stock, "aria-label": "Stock", oninput: (e) => { x.stock = e.target.value; } }),
    h("button", { class: "btn sm ghost", type: "button", "aria-label": "Remove", disabled: v.variants.length < 2, onclick: () => { v.variants.splice(i, 1); drawV(); } }, "✕"))));
    vbox.append(h("button", { class: "btn sm", type: "button", onclick: () => { v.variants.push({ size: "", color: "", stock: 1 }); drawV(); } }, "+ Add size / colour"), h("div", { class: "err", "data-err": "variants" })); };
  drawV();
  const body = () => ({ name: v.name.trim(), description: (v.description || "").trim(), categoryId: v.categoryId, price: Number(v.price), salePrice: v.salePrice === "" || v.salePrice == null ? null : Number(v.salePrice),
    fabric: (v.fabric || "").trim() || null, variants: v.variants.map((x) => ({ ...(x.id ? { id: x.id } : {}), size: (x.size || "").trim() || null, color: (x.color || "").trim() || null, stock: Number(x.stock) || 0 })) });
  const saveBtn = h("button", { class: "btn gold", type: "submit" }, p ? "Save changes" : "Create product");
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); err.textContent = ""; saveBtn.disabled = true;
    try {
      const r = p ? await api(`/seller/products/${p.id}`, { method: "PUT", body: body() }) : await api("/seller/products", { method: "POST", body: body() });
      toast(p ? "Product saved" : "Product created. Now add photos."); location.hash = `#/products/${r.id}`;
      if (p) { const fresh = await api(`/seller/products/${p.id}`); await renderForm(clear(root), ctx, fresh); }
    } catch (ex) { showFieldErrors(form, Object.fromEntries(Object.entries(ex.fields || {}).map(([k, m]) => [k.startsWith("variants") ? "variants" : k, m]))); err.textContent = Object.keys(ex.fields || {}).length ? "Please fix the highlighted fields." : ex.message; }
    saveBtn.disabled = false;
  });
  put(form,
    field("name", "Product name", inp("name", { type: "text", maxlength: 160 })), field("categoryId", "Category", catSel),
    h("div", { class: "row" }, h("div", { class: "grow" }, field("price", "Price (Rs.)", inp("price", { type: "number", min: 1, step: 1 }))), h("div", { class: "grow" }, field("salePrice", "Sale price (optional)", inp("salePrice", { type: "number", min: 1, step: 1 })))),
    field("fabric", "Fabric (optional)", inp("fabric", { type: "text", maxlength: 60 })), field("description", "Description", inp("description", { maxlength: 5000, rows: 5 }, "textarea")),
    h("div", { class: "field" }, h("span", { class: "lbl" }, "Sizes, colours and stock"), vbox), err, h("div", { class: "row" }, saveBtn, h("a", { class: "btn ghost", href: "#/products", style: "text-decoration:none" }, "Back")));

  const photos = h("div", { class: "card" }, h("h2", {}, "Photos"));
  if (!p) photos.append(h("p", { class: "hint" }, "Create the product first, then add up to 10 photos. The first photo is the cover."));
  else {
    const th = h("div", { class: "thumbs" });
    const drawP = () => { clear(th); p.images.forEach((im) => th.append(h("figure", {}, h("img", { src: im.thumbUrl, alt: "" }), h("button", { type: "button", "aria-label": "Delete photo", onclick: async () => { try { await api(`/seller/products/${p.id}/images/${im.id}`, { method: "DELETE" }); p.images = p.images.filter((x) => x.id !== im.id); drawP(); } catch (e) { toast(e.message, "error"); } } }, "✕")))); };
    const file = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, hidden: true, onchange: async () => {
      const files = [...file.files]; file.value = ""; add.disabled = true;
      for (const f of files) { try { add.textContent = "Uploading…"; const r = await upload(`/seller/products/${p.id}/images`, f); p.images.push({ id: r.id, url: r.url, thumbUrl: r.thumbUrl }); drawP(); } catch (e) { toast(e.message, "error"); break; } }
      add.disabled = false; add.textContent = "+ Add photos";
    } });
    const add = h("button", { class: "btn", type: "button", onclick: () => file.click() }, "+ Add photos");
    drawP(); photos.append(th, h("div", { style: "height:12px" }), add, file);
  }
  const state = p ? h("span", { class: `badge ${(STATE[p.state] ?? [])[1] ?? ""}` }, (STATE[p.state] ?? [p.state])[0]) : null;
  put(root, h("div", { class: "row between" }, h("h1", {}, p ? "Edit product" : "New product"), state), p?.state === "rejected" && p.note ? h("div", { class: "banner bad" }, p.note) : null,
    h("div", { class: "builder", style: "grid-template-columns:minmax(0,1fr)" }, h("div", { class: "card" }, form), photos,
      p ? h("div", { class: "row end" }, h("button", { class: "btn ghost danger", type: "button", style: "color:var(--danger)", onclick: async () => {
        if (!(await confirmDialog("Remove this product?", "It will disappear from your page. Past orders are kept.", "Remove"))) return;
        try { await api(`/seller/products/${p.id}`, { method: "DELETE" }); toast("Product removed"); location.hash = "#/products"; } catch (e) { toast(e.message, "error"); } } }, "Remove product")) : null));
}
