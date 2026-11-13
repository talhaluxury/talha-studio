import { api, upload } from "../api.js";
import { renderBrandPage } from "../preview.js";
import { clear, debounce, h, put, showFieldErrors, toast } from "../ui.js";

const STYLES = [["noir", "Noir", "linear-gradient(135deg,#0b0b0c,#2a2a2b)"], ["ivory", "Ivory", "linear-gradient(135deg,#f6f1e7,#e2d9c6)"], ["gold", "Gold", "linear-gradient(135deg,#3a2a0d,#b99a62)"]];
const uid = () => (crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2)).slice(0, 36);

export async function renderBuilder(root, ctx) {
  const me = await ctx.reload(); const b = me.brand;
  const { items: products } = await api("/seller/products");
  const d = structuredClone(b.draft); d.collections ||= []; d.highlights ||= [];
  let dirty = false; let pageStatus = b.pageStatus;
  const phone = h("div", { class: "phone" });
  const drawPreview = () => { const keep = phone.scrollTop; clear(phone).append(renderBrandPage(d, products, { scroller: phone })); phone.scrollTop = keep; };
  const redraw = debounce(drawPreview, 120);
  const bar = h("span", { class: "hint" });
  const markDirty = () => { dirty = true; bar.textContent = "Unsaved changes"; redraw(); };

  const text = (key, label, attrs = {}, tag = "input", hint) => {
    const el = h(tag, { id: "f-" + key, value: d[key] ?? "", ...attrs });
    el.addEventListener("input", () => { d[key] = el.value; markDirty(); });
    return h("div", { class: "field" }, h("label", { for: "f-" + key }, label), el, hint ? h("div", { class: "hint" }, hint) : null, h("div", { class: "err", "data-err": key }));
  };
  const imageBox = (kind, label, wide) => {
    const pic = h("div", { class: "pic" + (wide ? " wide" : "") }); const key = kind + "Url";
    const show = () => { clear(pic); if (d[key]) pic.append(h("img", { src: d[key], alt: label })); else pic.append(label); };
    const input = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", hidden: true, onchange: async () => {
      const f = input.files[0]; if (!f) return; btn.disabled = true; btn.textContent = "Uploading…";
      try { const r = await upload(`/seller/brand/${kind}`, f); d[key] = r.url; show(); drawPreview(); toast(label + " updated"); } catch (e) { toast(e.message, "error"); }
      btn.disabled = false; btn.textContent = d[key] ? "Change" : "Upload"; input.value = "";
    } });
    const btn = h("button", { class: "btn sm", type: "button", onclick: () => input.click() }, d[key] ? "Change" : "Upload");
    const rm = h("button", { class: "btn sm ghost", type: "button", onclick: async () => { try { await api(`/seller/brand/${kind}`, { method: "DELETE" }); d[key] = null; show(); drawPreview(); btn.textContent = "Upload"; } catch (e) { toast(e.message, "error"); } } }, "Remove");
    show(); return h("div", { class: "field" }, h("span", { class: "lbl" }, label), h("div", { class: "imgbox" }, pic, btn, rm, input));
  };

  const styleSeg = h("div", { class: "seg", role: "radiogroup", "aria-label": "Page style" }, STYLES.map(([k, t, bg]) => {
    const r = h("input", { type: "radio", name: "style", value: k, checked: d.style === k, onchange: () => { d.style = k; markDirty(); } });
    return h("label", {}, r, h("span", { class: "sw", style: `background:${bg}` }), t);
  }));
  const accent = h("input", { type: "color", id: "f-accent", value: d.accent, "aria-label": "Accent colour", style: "width:64px;height:42px;padding:2px", oninput: (e) => { d.accent = e.target.value.toUpperCase(); markDirty(); } });

  const hl = h("div", {});
  const drawHl = () => { clear(hl); d.highlights.forEach((x, i) => hl.append(h("div", { class: "row", style: "margin-bottom:8px;flex-wrap:nowrap" },
    h("input", { type: "text", maxlength: 50, value: x, "aria-label": `Highlight ${i + 1}`, oninput: (e) => { d.highlights[i] = e.target.value; markDirty(); } }),
    h("button", { class: "btn sm ghost", type: "button", "aria-label": "Remove highlight", onclick: () => { d.highlights.splice(i, 1); drawHl(); markDirty(); } }, "✕")))); if (d.highlights.length < 4) hl.append(h("button", { class: "btn sm", type: "button", onclick: () => { d.highlights.push(""); drawHl(); markDirty(); } }, "+ Add highlight")); };
  drawHl();

  const cols = h("div", {});
  const drawCols = () => {
    clear(cols);
    d.collections.forEach((c, i) => cols.append(h("div", { class: "col-item" },
      h("div", { class: "row", style: "flex-wrap:nowrap" }, h("input", { type: "text", maxlength: 40, value: c.title, placeholder: "e.g. Summer lawn", "aria-label": "Collection name", oninput: (e) => { c.title = e.target.value; markDirty(); } }),
        h("button", { class: "btn sm ghost", type: "button", onclick: () => { d.collections.splice(i, 1); drawCols(); markDirty(); } }, "Remove")),
      products.length ? h("div", { class: "picks" }, products.map((p) => h("label", {}, h("input", { type: "checkbox", checked: c.productIds.includes(p.id), onchange: (e) => { c.productIds = e.target.checked ? [...c.productIds, p.id] : c.productIds.filter((x) => x !== p.id); markDirty(); } }), p.name))) : h("p", { class: "hint" }, "Add products first, then put them in collections."))));
    if (d.collections.length < 8) cols.append(h("button", { class: "btn sm", type: "button", onclick: () => { d.collections.push({ id: uid(), title: "", productIds: [] }); drawCols(); markDirty(); } }, "+ Add collection"));
  };
  drawCols();

  const payload = () => ({ name: d.name, tagline: d.tagline ?? "", about: d.about ?? "", style: d.style, accent: d.accent,
    highlights: d.highlights.map((x) => x.trim()).filter(Boolean), instagram: d.instagram || null, website: d.website || null,
    collections: d.collections.filter((c) => c.title.trim()).map((c) => ({ id: c.id, title: c.title.trim(), productIds: c.productIds })) });
  const form = h("div", {});
  async function save() {
    try { const r = await api("/seller/brand", { method: "PUT", body: payload() }); Object.assign(d, structuredClone(r.draft)); dirty = false; bar.textContent = "Saved"; showFieldErrors(form, {}); return true; }
    catch (e) { showFieldErrors(form, Object.fromEntries(Object.entries(e.fields || {}).map(([k, v]) => [k.split(".")[0], v]))); toast(e.message === "Request failed" ? "Please fix the highlighted fields" : e.message, "error"); return false; }
  }
  const saveBtn = h("button", { class: "btn dark", type: "button", onclick: async () => { saveBtn.disabled = true; if (await save()) toast("Draft saved"); saveBtn.disabled = false; } }, "Save draft");
  const submitBtn = h("button", { class: "btn gold", type: "button", onclick: async () => {
    submitBtn.disabled = true;
    try { if (dirty && !(await save())) return; const r = await api("/seller/brand/submit", { method: "POST" }); pageStatus = r.pageStatus; toast("Sent for review. We will notify you."); await renderBuilder(clear(root), ctx); }
    catch (e) { toast(e.message, "error"); } finally { submitBtn.disabled = false; }
  } }, pageStatus === "submitted" ? "Waiting for review…" : "Send for review");
  if (pageStatus === "submitted") submitBtn.disabled = true;

  put(form,
    h("div", { class: "card" }, h("h2", {}, "Brand"), text("name", "Brand name", { type: "text", maxlength: 60 }), text("tagline", "Tagline", { type: "text", maxlength: 90, placeholder: "One short line under your name" }),
      imageBox("logo", "Logo", false), imageBox("cover", "Cover picture", true)),
    h("div", { class: "card" }, h("h2", {}, "Look"), h("span", { class: "lbl" }, "Page style"), styleSeg, h("div", { style: "height:14px" }), h("div", { class: "row" }, h("label", { class: "lbl", for: "f-accent" }, "Accent colour"), accent)),
    h("div", { class: "card" }, h("h2", {}, "Story"), text("about", "About your brand", { maxlength: 2000, rows: 5, placeholder: "Who you are, what makes your clothes special…" }, "textarea"), h("span", { class: "lbl" }, "Highlights (up to 4)"), hl),
    h("div", { class: "card" }, h("h2", {}, "Links"), text("instagram", "Instagram username", { type: "text", maxlength: 31, placeholder: "yourbrand" }), text("website", "Website (optional)", { type: "url", maxlength: 200, placeholder: "https://…" })),
    h("div", { class: "card" }, h("h2", {}, "Collections"), h("p", { class: "hint" }, "Your own categories on your page, for example Summer, Bridal or Kids."), cols));

  const note = pageStatus === "rejected" ? h("div", { class: "banner bad" }, h("b", {}, "Changes needed: "), b.pageNote || "") : pageStatus === "submitted" ? h("div", { class: "banner" }, "Your page is waiting for review. You can keep editing; send it again afterwards.") : pageStatus === "approved" ? h("div", { class: "banner ok" }, "Your page is live. Edits you make here stay private until you send them for review.") : null;
  const left = h("div", {}, h("div", { class: "row between" }, h("h1", {}, "Brand page"), bar), note, form, h("div", { class: "sticky-bar" }, saveBtn, submitBtn, h("span", { class: "hint" }, "Products are sent for review together with the page.")));
  put(root, h("div", { class: "builder" }, left, h("div", { class: "preview-col" }, h("p", { class: "hint", style: "text-align:center" }, "Live preview. Move your mouse (or finger) over the logo and products."), phone)));
  drawPreview();
  window.onbeforeunload = () => (dirty ? "You have unsaved changes" : undefined);
  const leave = () => { if (!location.hash.startsWith("#/page")) { window.onbeforeunload = null; window.removeEventListener("hashchange", leave); } };
  window.addEventListener("hashchange", leave);
}
