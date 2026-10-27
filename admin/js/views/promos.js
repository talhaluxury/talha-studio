import { api, uploadTo } from "../api.js";
import { clear, confirmDialog, fmtDate, fromLocalInput, h, money, put, showFieldErrors, toast, toLocalInput } from "../ui.js";

const MAX_BYTES = 8 * 1024 * 1024;
/** Keeps a card open across reloads (e.g. after uploading a picture). */
const keepOpen = (set, id) => ({ open: set.has(id), ontoggle: (e) => (e.target.open ? set.add(id) : set.delete(id)) });

/* ---------------- Banners ---------------- */
export async function renderBanners(view) {
  const body = h("div", {}); const opened = new Set();
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Home banners"), h("p", { class: "muted" }, "Shown at the top of the app home screen. Changes appear without an app update."))), body);
  const products = (await api("/admin/products?limit=50")).items.filter((p) => p.isPublished);
  await load();

  function form(b) {
    const f = {
      title: h("input", { id: `t${b?.id ?? "n"}`, maxlength: 60, value: b?.title ?? "" }), subtitle: h("input", { maxlength: 120, value: b?.subtitle ?? "" }),
      cta: h("input", { maxlength: 30, value: b?.ctaLabel ?? "", placeholder: "Shop now" }),
      link: h("select", {}, h("option", { value: "" }, "Opens the app home"), products.map((p) => h("option", { value: `talhastudio://product/${p.id}`, selected: b?.ctaLink === `talhastudio://product/${p.id}` }, `Product: ${p.name}`))),
      order: h("input", { type: "number", min: 0, max: 9999, value: b?.sortOrder ?? 0 }), active: h("input", { type: "checkbox", checked: b ? b.isActive : true }),
      from: h("input", { type: "datetime-local", value: toLocalInput(b?.startsAt) }), to: h("input", { type: "datetime-local", value: toLocalInput(b?.endsAt) }),
    };
    const el = h("form", { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const payload = { title: f.title.value.trim(), subtitle: f.subtitle.value.trim() || null, ctaLabel: f.cta.value.trim() || null, ctaLink: f.link.value || null,
        sortOrder: Number(f.order.value) || 0, isActive: f.active.checked, startsAt: fromLocalInput(f.from.value), endsAt: fromLocalInput(f.to.value) };
      try { b ? await api(`/admin/banners/${b.id}`, { method: "PUT", body: payload }) : await api("/admin/banners", { method: "POST", body: payload }); toast(b ? "Banner saved" : "Banner added. Now add its picture."); await load(); }
      catch (ex) { showFieldErrors(el, ex.fields); toast(ex.message, "error"); }
    } },
      h("div", { class: "grid2" },
        h("div", { class: "field" }, h("label", {}, "Headline"), f.title, h("div", { class: "err", "data-err": "title" })),
        h("div", { class: "field" }, h("label", {}, "Subtitle"), f.subtitle, h("div", { class: "err", "data-err": "subtitle" })),
        h("div", { class: "field" }, h("label", {}, "Button text"), f.cta, h("div", { class: "err", "data-err": "ctaLabel" })),
        h("div", { class: "field" }, h("label", {}, "Button opens"), f.link, h("div", { class: "err", "data-err": "ctaLink" })),
        h("div", { class: "field" }, h("label", {}, "Show from (optional)"), f.from), h("div", { class: "field" }, h("label", {}, "Show until (optional)"), f.to, h("div", { class: "err", "data-err": "endsAt" })),
        h("div", { class: "field" }, h("label", {}, "Order (0 = first)"), f.order)),
      h("label", { class: "check" }, f.active, "Visible in the app"), h("div", { class: "row" }, h("button", { class: "btn gold", type: "submit" }, b ? "Save banner" : "Add banner")));
    return el;
  }

  async function load() {
    const { items } = await api("/admin/banners");
    put(clear(body), h("div", { class: "card" }, h("h2", {}, "New banner"), form(null)), items.length ? items.map((b) => {
      const pick = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "sr", id: `f${b.id}`, onchange: async (e) => {
        const file = e.target.files[0]; e.target.value = ""; if (!file) return;
        if (file.size > MAX_BYTES) return toast("Image is larger than 8 MB.", "error");
        try { await uploadTo(`/admin/banners/${b.id}/image`, file); toast("Picture updated"); await load(); } catch (ex) { toast(ex.message, "error"); } } });
      return h("details", { class: "card", ...keepOpen(opened, b.id) },
        h("summary", {}, h("b", {}, b.title), " ", h("span", { class: `badge ${b.isActive ? "ok" : ""}` }, b.isActive ? "Visible" : "Hidden"), b.startsAt || b.endsAt ? h("span", { class: "hint" }, `  ${b.startsAt ? "from " + fmtDate(b.startsAt) : ""} ${b.endsAt ? "until " + fmtDate(b.endsAt) : ""}`) : null),
        h("div", { class: "row" }, b.imageUrl ? h("img", { src: b.imageUrl, alt: "", class: "bannerimg" }) : h("div", { class: "empty" }, "No picture yet"),
          h("div", {}, h("label", { class: "btn ghost sm", for: `f${b.id}` }, b.imageUrl ? "Replace picture" : "Upload picture"), pick, h("p", { class: "hint" }, "Wide image (e.g. 1600x900). It is resized automatically."))),
        form(b), h("div", { class: "row end" }, h("button", { class: "btn danger sm", onclick: async () => {
          if (!(await confirmDialog(`Delete "${b.title}"?`, "The banner and its picture are removed from the app."))) return;
          try { await api(`/admin/banners/${b.id}`, { method: "DELETE" }); toast("Banner deleted"); await load(); } catch (ex) { toast(ex.message, "error"); } } }, "Delete banner")));
    }) : h("div", { class: "empty" }, h("h2", {}, "No banners yet"), h("p", {}, "Until you add one, the app shows the Talha Studio brand banner.")));
  }
}

/* ---------------- Coupons ---------------- */
const describe = (c) => (c.type === "percent" ? `${c.value}% off` : `${money(c.value)} off`);

export async function renderCoupons(view) {
  const body = h("div", {}); const opened = new Set();
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Coupons"), h("p", { class: "muted" }, "Discount codes customers enter in the cart. Prices are always checked on the server."))), body);
  await load();

  function form(c) {
    const f = {
      code: h("input", { maxlength: 20, value: c?.code ?? "", placeholder: "EID10", autocapitalize: "characters" }),
      type: h("select", {}, h("option", { value: "percent", selected: c?.type !== "fixed" }, "Percent off"), h("option", { value: "fixed", selected: c?.type === "fixed" }, "Fixed amount off (Rs.)")),
      value: h("input", { type: "number", min: 1, step: 1, value: c?.value ?? "" }), min: h("input", { type: "number", min: 0, step: 1, value: c?.minSubtotal ?? 0 }),
      max: h("input", { type: "number", min: 1, step: 1, value: c?.maxUses ?? "", placeholder: "Unlimited" }),
      from: h("input", { type: "datetime-local", value: toLocalInput(c?.startsAt) }), to: h("input", { type: "datetime-local", value: toLocalInput(c?.endsAt) }), active: h("input", { type: "checkbox", checked: c ? c.isActive : true }),
    };
    const el = h("form", { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const payload = { code: f.code.value.trim(), type: f.type.value, value: Number(f.value.value), minSubtotal: Number(f.min.value) || 0, maxUses: f.max.value ? Number(f.max.value) : null,
        startsAt: fromLocalInput(f.from.value), endsAt: fromLocalInput(f.to.value), isActive: f.active.checked };
      try { c ? await api(`/admin/coupons/${c.id}`, { method: "PUT", body: payload }) : await api("/admin/coupons", { method: "POST", body: payload }); toast(c ? "Coupon saved" : "Coupon created"); await load(); }
      catch (ex) { showFieldErrors(el, ex.fields); toast(ex.message, "error"); }
    } },
      h("div", { class: "grid2" },
        h("div", { class: "field" }, h("label", {}, "Code"), f.code, h("div", { class: "err", "data-err": "code" })), h("div", { class: "field" }, h("label", {}, "Type"), f.type),
        h("div", { class: "field" }, h("label", {}, "Value"), f.value, h("div", { class: "err", "data-err": "value" })), h("div", { class: "field" }, h("label", {}, "Minimum order (Rs.)"), f.min, h("div", { class: "err", "data-err": "minSubtotal" })),
        h("div", { class: "field" }, h("label", {}, "Total uses allowed"), f.max, h("div", { class: "err", "data-err": "maxUses" })),
        h("div", { class: "field" }, h("label", {}, "Valid from (optional)"), f.from), h("div", { class: "field" }, h("label", {}, "Valid until (optional)"), f.to, h("div", { class: "err", "data-err": "endsAt" }))),
      h("label", { class: "check" }, f.active, "Active"), h("div", { class: "row" }, h("button", { class: "btn gold", type: "submit" }, c ? "Save coupon" : "Create coupon")));
    return el;
  }

  async function load() {
    const { items } = await api("/admin/coupons?limit=100");
    put(clear(body), h("div", { class: "card" }, h("h2", {}, "New coupon"), form(null)), items.length ? items.map((c) => h("details", { class: "card", ...keepOpen(opened, c.id) },
      h("summary", {}, h("b", {}, c.code), "  ", describe(c), c.minSubtotal ? ` · min ${money(c.minSubtotal)}` : "", "  ", h("span", { class: `badge ${c.isActive ? "ok" : ""}` }, c.isActive ? "Active" : "Off"),
        h("span", { class: "hint" }, `  used ${c.usedCount}${c.maxUses ? ` of ${c.maxUses}` : ""}`)),
      form(c), h("div", { class: "row end" }, h("button", { class: "btn danger sm", onclick: async () => {
        if (!(await confirmDialog(`Delete ${c.code}?`, "Past orders keep their discount. The code stops working immediately."))) return;
        try { await api(`/admin/coupons/${c.id}`, { method: "DELETE" }); toast("Coupon deleted"); await load(); } catch (ex) { toast(ex.message, "error"); } } }, "Delete coupon"))))
      : h("div", { class: "empty" }, h("h2", {}, "No coupons yet"), h("p", {}, "Create a code like EID10 to offer a discount.")));
  }
}
