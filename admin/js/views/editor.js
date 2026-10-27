import { api, session, uploadImage } from "../api.js";
import { clear, confirmDialog, h, money, showFieldErrors, toast, put } from "../ui.js";

const MAX_BYTES = 8 * 1024 * 1024;
const EXT = /\.(jpe?g|png|webp)$/i;   // Android pickers often give an empty/odd file.type, so check the name too. The server validates by decoding anyway.

export async function renderEditor(view, idArg) {
  const isNew = idArg === "new";
  const write = session.canWrite();
  const [cats, product] = await Promise.all([api("/admin/categories"), isNew ? null : api(`/admin/products/${idArg}`)]);
  if (!cats.items.length) {
    put(clear(view), h("div", { class: "empty" }, h("h2", {}, "Add a category first"), h("p", {}, "Every product belongs to a category."), h("a", { class: "btn gold", href: "#/categories" }, "Go to categories")));
    return;
  }
  let p = product;
  const variants = (p?.variants ?? [{ sku: "", size: "", color: "", stock: 0 }]).map((v) => ({ sku: v.sku ?? "", size: v.size ?? "", color: v.color ?? "", stock: v.stock ?? 0 }));

  const f = {
    name: h("input", { id: "name", required: true, maxlength: 160, value: p?.name ?? "" }),
    sku: h("input", { id: "sku", required: true, maxlength: 40, value: p?.sku ?? "", placeholder: "TS-1001" }),
    category: h("select", { id: "category" }, cats.items.map((c) => h("option", { value: c.id, selected: p?.category.id === c.id }, c.name))),
    price: h("input", { id: "price", type: "number", inputmode: "numeric", min: 1, step: 1, required: true, value: p?.price ?? "" }),
    sale: h("input", { id: "sale", type: "number", inputmode: "numeric", min: 1, step: 1, value: p?.salePrice ?? "" }),
    fabric: h("input", { id: "fabric", maxlength: 60, value: p?.fabric ?? "", placeholder: "Lawn, Linen, Wash & Wear..." }),
    desc: h("textarea", { id: "desc", maxlength: 5000 }, p?.description ?? ""),
    featured: h("input", { id: "featured", type: "checkbox", checked: p?.isFeatured }),
  };
  if (!write) Object.values(f).forEach((x) => (x.disabled = true));

  const varBox = h("div", {});
  function drawVariants() {
    clear(varBox);
    variants.forEach((v, i) => {
      const bind = (key, label, attrs = {}) => {
        const inp = h("input", { value: v[key], "aria-label": `${label} ${i + 1}`, disabled: !write, oninput: (e) => { v[key] = e.target.value; }, ...attrs });
        return h("div", { class: "field" }, inp, h("div", { class: "err", "data-err": `variants.${i}.${key}` }));
      };
      varBox.append(h("div", { class: "vrow" },
        bind("sku", "Variant SKU", { placeholder: "TS-1001-M-BLK", maxlength: 50 }), bind("size", "Size", { placeholder: "M", maxlength: 20 }),
        bind("color", "Color", { placeholder: "Black", maxlength: 30 }), bind("stock", "Stock", { type: "number", min: 0, step: 1, inputmode: "numeric" }),
        write ? h("button", { class: "btn ghost sm rm", type: "button", "aria-label": `Remove variant ${i + 1}`, onclick: () => { variants.splice(i, 1); drawVariants(); } }, "Remove") : null));
    });
    if (!variants.length) varBox.append(h("p", { class: "hint" }, "No variants yet. A product needs at least one before it can be published."));
  }
  drawVariants();

  const status = h("span", { class: `badge ${p?.isPublished ? "ok" : ""}` }, p?.isPublished ? "Published" : "Draft");
  const saveBtn = h("button", { class: "btn gold", type: "submit" }, isNew ? "Create product" : "Save changes");

  const form = h("form", { novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const num = (x) => (x.value === "" ? null : Number(x.value));
    const body = {
      sku: f.sku.value.trim(), name: f.name.value.trim(), description: f.desc.value, categoryId: f.category.value,
      price: num(f.price), salePrice: num(f.sale), fabric: f.fabric.value.trim() || null, isFeatured: f.featured.checked,
      isPublished: p?.isPublished ?? false,
      variants: variants.map((v) => ({ sku: v.sku.trim(), size: v.size.trim() || null, color: v.color.trim() || null, stock: Number(v.stock) })),
    };
    saveBtn.disabled = true;
    try {
      const saved = isNew ? await api("/admin/products", { method: "POST", body }) : await api(`/admin/products/${p.id}`, { method: "PUT", body });
      toast(isNew ? "Product created. Add photos next." : "Changes saved");
      if (isNew) { location.hash = `#/products/${saved.id}`; return; }
      p = saved; showFieldErrors(form, {});
    } catch (ex) { showFieldErrors(form, ex.fields); toast(ex.message, "error"); } finally { saveBtn.disabled = false; }
  } },
    h("div", { class: "card" }, h("h2", {}, "Details"), 
      h("div", { class: "grid2" },
        h("div", { class: "field" }, h("label", { for: "name" }, "Product name"), f.name, h("div", { class: "err", "data-err": "name" })),
        h("div", { class: "field" }, h("label", { for: "sku" }, "SKU"), f.sku, h("div", { class: "err", "data-err": "sku" })),
        h("div", { class: "field" }, h("label", { for: "category" }, "Category"), f.category, h("div", { class: "err", "data-err": "categoryId" })),
        h("div", { class: "field" }, h("label", { for: "fabric" }, "Fabric"), f.fabric, h("div", { class: "err", "data-err": "fabric" })),
        h("div", { class: "field" }, h("label", { for: "price" }, "Price (Rs.)"), f.price, h("div", { class: "err", "data-err": "price" })),
        h("div", { class: "field" }, h("label", { for: "sale" }, "Sale price (Rs.)"), f.sale, h("div", { class: "err", "data-err": "salePrice" }), h("div", { class: "hint" }, "Optional. Must be lower than the price."))),
      h("div", { class: "field" }, h("label", { for: "desc" }, "Description"), f.desc, h("div", { class: "err", "data-err": "description" })),
      h("label", { class: "check", for: "featured" }, f.featured, "Feature on the home screen")),
    h("div", { class: "card" }, h("h2", {}, "Sizes, colors and stock"), h("p", { class: "hint" }, "One row per size and color. Stock is deducted automatically when orders are placed."), varBox,
      write ? h("button", { class: "btn ghost sm", type: "button", onclick: () => { variants.push({ sku: "", size: "", color: "", stock: 0 }); drawVariants(); } }, "Add variant") : null),
    write ? h("div", { class: "row" }, saveBtn, h("a", { class: "btn ghost", href: "#/products" }, "Back to products")) : h("a", { class: "btn ghost", href: "#/products" }, "Back to products"));

  const header = h("div", { class: "pagehead" },
    h("div", {}, h("h1", {}, isNew ? "New product" : p.name), h("p", { class: "muted" }, isNew ? "Save the details, then add photos and publish." : [status, p.salePrice ? `  ${money(p.salePrice)} (was ${money(p.price)})` : `  ${money(p.price)}`])));
  const readOnly = write ? null : h("div", { class: "card" }, "You have view-only access. Ask an admin or the owner to change products.");

  const imageCard = h("div", { class: "card" });
  put(clear(view), header, readOnly, form, imageCard);
  if (isNew) { imageCard.append(h("h2", {}, "Photos"), h("p", { class: "hint" }, "Create the product first, then you can upload photos here.")); return; }
  drawImages();
  if (write) drawActions();

  function drawImages() {
    const grid = h("div", { class: "imgs" });
    p.images.forEach((im, i) => grid.append(h("div", { class: "img" },
      h("img", { src: im.thumbUrl, alt: `${p.name} photo ${i + 1}`, loading: "lazy" }),
      h("div", { class: "bar" }, i === 0 ? h("span", { class: "first" }, "Main photo") : h("span", {}),
        write ? h("span", { class: "row" },
          h("button", { class: "btn ghost sm", type: "button", disabled: i === 0, "aria-label": "Move earlier", onclick: () => move(i, -1) }, "Up"),
          h("button", { class: "btn ghost sm", type: "button", disabled: i === p.images.length - 1, "aria-label": "Move later", onclick: () => move(i, 1) }, "Down"),
          h("button", { class: "btn danger sm", type: "button", "aria-label": "Delete photo", onclick: () => del(im) }, "Delete")) : null))));
    const picker = h("input", { type: "file", id: "pick", accept: "image/*", multiple: true, class: "sr", onchange: (e) => { const files = [...e.target.files]; errors.length = 0; addFiles(files); } });
    const queue = h("div", { "aria-live": "polite" });
    put(clear(imageCard), h("h2", {}, `Photos (${p.images.length}/10)`),
      h("p", { class: "hint" }, "JPG, PNG or WebP, up to 8 MB each. Photos are resized and compressed automatically. The first photo is the main one."),
      write ? h("div", { class: "drop" }, picker, h("label", { class: "btn gold", for: "pick" }, "Choose photos")) : null, queue, p.images.length ? grid : h("p", { class: "muted" }, "No photos yet."));

    async function addFiles(files) {
      if (!files.length) return;
      for (const file of files) {
        const label = file.name || "photo";
        const okType = /^image\/(jpeg|jpg|png|webp)$/i.test(file.type) || (!/^image\//i.test(file.type) && EXT.test(file.name || "")) || (file.type === "" && !file.name);
        if (!okType) { fail(label, "only JPG, PNG or WebP photos are allowed (HEIC/other formats are not supported)."); continue; }
        if (file.size > MAX_BYTES) { fail(label, "is larger than 8 MB."); continue; }
        if (p.images.length >= 10) { fail(label, "not added: a product can have at most 10 photos."); break; }
        const bar = h("i", {}); const row = h("div", {}, h("span", { class: "hint" }, `Uploading ${label}...`), h("div", { class: "prog" }, bar)); queue.append(row);
        try { await uploadImage(p.id, file, (pc) => { bar.style.width = pc + "%"; }); p = await api(`/admin/products/${p.id}`); toast("Photo added"); }
        catch (ex) { fail(label, ex.message); }
        row.remove();
      }
      drawImages(); drawActions?.();
      if (errors.length) { const box = h("div", { class: "card uperr", role: "alert" }, h("b", {}, "Some photos were not added:"), ...errors.map((m) => h("div", { class: "hint" }, m))); imageCard.append(box); }
    }
    const errors = [];
    function fail(name, msg) { const m = `${name}: ${msg}`; errors.push(m); toast(m, "error"); }
    async function move(i, d) {
      const ids = p.images.map((x) => x.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
      try { p = await api(`/admin/products/${p.id}/images/order`, { method: "PATCH", body: { imageIds: ids } }); drawImages(); } catch (ex) { toast(ex.message, "error"); }
    }
    async function del(im) {
      if (!(await confirmDialog("Delete this photo?", "The file is removed permanently."))) return;
      try { await api(`/admin/products/${p.id}/images/${im.id}`, { method: "DELETE" }); p = await api(`/admin/products/${p.id}`); drawImages(); toast("Photo deleted"); } catch (ex) { toast(ex.message, "error"); }
    }
  }

  function drawActions() {
    document.getElementById("pubcard")?.remove();
    const pubBtn = h("button", { class: p.isPublished ? "btn ghost" : "btn gold", type: "button", onclick: async () => {
      try {
        p = await api(`/admin/products/${p.id}/publish`, { method: "PATCH", body: { isPublished: !p.isPublished } });
        toast(p.isPublished ? "Published. It is now live in the app." : "Unpublished. Customers can no longer see it.");
        status.textContent = p.isPublished ? "Published" : "Draft"; status.className = `badge ${p.isPublished ? "ok" : ""}`; drawActions();
      } catch (ex) { toast(ex.message, "error"); }
    } }, p.isPublished ? "Unpublish" : "Publish to app");
    const delBtn = h("button", { class: "btn danger", type: "button", onclick: async () => {
      if (!(await confirmDialog(`Delete ${p.name}?`, "The product and all its photos are removed permanently. Past orders keep their own record of it."))) return;
      try { await api(`/admin/products/${p.id}`, { method: "DELETE" }); toast("Product deleted"); location.hash = "#/products"; } catch (ex) { toast(ex.message, "error"); }
    } }, "Delete product");
    view.append(h("div", { class: "card", id: "pubcard" }, h("h2", {}, "Visibility"),
      h("p", { class: "hint" }, p.isPublished ? "Customers can see and buy this product." : "Draft products are hidden from customers. Publishing needs at least one photo and one variant."),
      h("div", { class: "row" }, pubBtn, delBtn)));
  }
}
