import { api, uploadImage } from "../api.js";
import { clear, h, put, toast } from "../ui.js";

const MAX = 15;          // products per go
const MAX_PHOTOS = 10;   // photos per product

/** Add up to 15 products at once: pick photos, fill name and price, press one button. Photos are uploaded and the products published for you. */
export async function renderBulkAdd(view) {
  const cats = (await api("/admin/categories")).items;
  const rows = []; const list = h("div", {}); const status = h("p", { class: "muted", role: "status" }); const count = h("span", { class: "muted" }, "");
  const check = (label, on) => { const input = h("input", { type: "checkbox" }); input.checked = on; return { input, el: h("label", { class: "check" }, input, label) }; };

  const cat = h("select", { id: "bcat", "aria-label": "Category" }, cats.length ? cats.map((c) => h("option", { value: c.id }, c.name)) : h("option", { value: "" }, "Add a category first"));
  const sizes = h("input", { id: "bsizes", placeholder: "S, M, L (leave empty for one size)", maxlength: 120 });
  const stock = h("input", { id: "bstock", type: "number", min: 0, value: 5 });
  const common = {
    fabric: h("input", { id: "bfabric", maxlength: 60, placeholder: "e.g. Lawn (used when a product has none of its own)" }),
    price: h("input", { id: "bprice", type: "number", min: 1, placeholder: "Price for every product that has none" }),
    sale: h("input", { id: "bsale", type: "number", min: 1, placeholder: "Sale price (optional)" }),
    desc: h("textarea", { id: "bdesc", rows: 3, maxlength: 5000, placeholder: "Description shown for every product that has none of its own", style: "width:100%" }),
  };
  const isNew = check("Show in New Arrivals", true), feat = check("Feature on the home screen", false), publish = check("Publish right away (needs at least one photo)", true);

  const pick = h("input", { type: "file", accept: "image/*", multiple: true, "aria-label": "Choose photos" });
  pick.onchange = () => { for (const f of [...pick.files]) addRow([f]); pick.value = ""; };

  function addRow(files = []) {
    if (rows.length >= MAX) { toast(`You can add at most ${MAX} products at a time`, "error"); return; }
    const row = { files: [...files], name: h("input", { placeholder: "Product name", maxlength: 160, "aria-label": "Name" }),
      price: h("input", { type: "number", min: 1, placeholder: "Price (Rs.)", "aria-label": "Price" }), sale: h("input", { type: "number", min: 1, placeholder: "Sale price (optional)", "aria-label": "Sale price" }),
      fabric: h("input", { maxlength: 60, placeholder: "Fabric (optional)", "aria-label": "Fabric" }), desc: h("textarea", { rows: 3, maxlength: 5000, placeholder: "Description (optional)", "aria-label": "Description", style: "width:100%" }) };
    const thumbs = h("div", { class: "row", style: "gap:8px;flex-wrap:wrap;margin-bottom:8px" });
    const more = h("input", { type: "file", accept: "image/*", multiple: true, "aria-label": "Add more photos to this product" });
    const draw = () => put(clear(thumbs), row.files.map((f, i) => h("div", {}, h("img", { src: URL.createObjectURL(f), alt: "", style: "width:72px;height:72px;object-fit:cover;border-radius:8px;display:block" }),
      h("button", { class: "btn ghost sm", type: "button", "aria-label": "Remove photo", onclick: () => { row.files.splice(i, 1); draw(); } }, "Remove"))));
    more.onchange = () => { row.files.push(...[...more.files].slice(0, MAX_PHOTOS - row.files.length)); more.value = ""; draw(); };
    row.el = h("div", { class: "card" }, thumbs, h("div", { class: "hint" }, `Add more photos of this product (up to ${MAX_PHOTOS})`), more,
      h("div", { class: "grid2", style: "margin-top:8px" }, row.name, row.price, row.sale, row.fabric),
      h("div", { class: "field", style: "margin-top:8px" }, row.desc),
      h("button", { class: "btn danger sm", type: "button", onclick: () => { rows.splice(rows.indexOf(row), 1); row.el.remove(); count.textContent = ` ${rows.length} of ${MAX}`; } }, "Remove this product"));
    rows.push(row); list.append(row.el); draw(); count.textContent = ` ${rows.length} of ${MAX}`;
  }

  const copyFirst = h("button", { class: "btn ghost", type: "button", onclick: () => {
    const [a, ...rest] = rows; if (!a || !rest.length) { toast("Add at least two products first", "error"); return; }
    for (const r of rest) { r.price.value = a.price.value; r.sale.value = a.sale.value; r.fabric.value = a.fabric.value; r.desc.value = a.desc.value; }
    toast(`Price, sale price, fabric and description of the first product copied to ${rest.length} other${rest.length === 1 ? "" : "s"}`);
  } }, "Copy first product's details to all");
  const go = h("button", { class: "btn gold", onclick: submit }, "Add all products");
  async function submit() {
    if (!rows.length) { toast("Choose photos or add a row first", "error"); return; }
    if (!cat.value) { toast("Choose a category first", "error"); return; }
    const sizeList = sizes.value.split(",").map((s) => s.trim()).filter(Boolean);
    const products = [];
    for (const [i, r] of rows.entries()) {
      const name = r.name.value.trim(); const price = Number(r.price.value || common.price.value); const sale = (r.sale.value || (r.price.value ? "" : common.sale.value)) ? Number(r.sale.value || common.sale.value) : null;
      if (name.length < 2) { toast(`Product ${i + 1}: write a name`, "error"); return; }
      if (!(price >= 1)) { toast(`Product ${i + 1}: write the price`, "error"); return; }
      if (sale !== null && !(sale >= 1 && sale < price)) { toast(`Product ${i + 1}: the sale price must be lower than the price`, "error"); return; }
      products.push({ name, price, salePrice: sale, description: r.desc.value.trim() || common.desc.value.trim(), fabric: r.fabric.value.trim() || common.fabric.value.trim() || null, sizes: sizeList, stock: Number(stock.value) || 0, isNew: isNew.input.checked, isFeatured: feat.input.checked });
    }
    go.disabled = true; status.textContent = "Creating products...";
    try {
      const made = await api("/admin/products/bulk", { method: "POST", body: { categoryId: cat.value, products } });
      const total = made.items.reduce((n, it) => n + (rows[it.index]?.files.length ?? 0), 0); let done = 0, lost = 0; const withPhotos = [];
      for (const it of made.items) {
        let ok = 0;
        for (const f of rows[it.index]?.files ?? []) {
          try { await uploadImage(it.id, f); ok++; } catch { lost++; }
          done++; status.textContent = `Uploading photos ${done} of ${total}...`;
        }
        if (ok) withPhotos.push(it.id);
      }
      let published = 0;
      if (publish.input.checked && withPhotos.length) { status.textContent = "Publishing..."; published = (await api("/admin/products/bulk-update", { method: "POST", body: { ids: withPhotos, set: { isPublished: true } } })).updated; }
      const note = `${made.items.length} product${made.items.length === 1 ? "" : "s"} added${published ? `, ${published} published` : ""}${lost ? `, ${lost} photo${lost === 1 ? "" : "s"} could not be uploaded` : ""}${made.failed.length ? `, ${made.failed.length} could not be created` : ""}.`;
      status.textContent = note; toast(note, lost || made.failed.length ? "error" : "ok");
      rows.length = 0; clear(list); count.textContent = ` 0 of ${MAX}`;
    } catch (e) { status.textContent = ""; toast(e.message, "error"); }
    finally { go.disabled = false; }
  }

  put(clear(view),
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Add many products"), h("p", { class: "muted" }, "Choose up to 15 photos and write each name. Price, fabric, description, sizes and stock can be filled once for all, or per product. Then press one button."))),
    h("a", { class: "btn ghost sm", href: "#/products" }, "Back to products"),
    h("div", { class: "card" }, h("h2", {}, "Same for all"),
      h("div", { class: "grid2" }, h("div", { class: "field" }, h("label", { for: "bcat" }, "Category"), cat),
        h("div", { class: "field" }, h("label", { for: "bsizes" }, "Sizes"), sizes), h("div", { class: "field" }, h("label", { for: "bstock" }, "Stock for each size"), stock)),
      h("div", { class: "grid2" }, h("div", { class: "field" }, h("label", { for: "bprice" }, "Price (Rs.)"), common.price), h("div", { class: "field" }, h("label", { for: "bsale" }, "Sale price (Rs.)"), common.sale),
        h("div", { class: "field" }, h("label", { for: "bfabric" }, "Fabric"), common.fabric)),
      h("div", { class: "field" }, h("label", { for: "bdesc" }, "Description"), common.desc),
      h("p", { class: "hint" }, "Fill these once and they apply to every product below. Anything you write inside one product overrides it for that product only."),
      isNew.el, feat.el, publish.el),
    h("div", { class: "card" }, h("h2", {}, "Products"), count, h("p", { class: "hint" }, "Choose photos: each photo becomes one product. You can add more photos to any product afterwards."), pick),
    list, h("div", { class: "row", style: "flex-wrap:wrap;gap:8px" }, h("button", { class: "btn", type: "button", onclick: () => addRow() }, "Add an empty row"), copyFirst, go), status);
  count.textContent = ` 0 of ${MAX}`;
}
