import { api, uploadTo } from "../api.js";
import { clear, confirmDialog, h, put, showFieldErrors, toast } from "../ui.js";

const MAX_BYTES = 8 * 1024 * 1024;
const keepOpen = (set, id) => ({ open: set.has(id), ontoggle: (e) => (e.target.open ? set.add(id) : set.delete(id)) });

/* The screens a customer sees the first time the app opens (picture + big heading + one line of text). */
export async function renderWelcome(view) {
  const body = h("div", {}); const opened = new Set();
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Welcome screens"),
    h("p", { class: "muted" }, "The first screens people see when they open the app. Add a picture to each one; changes show up without an app update."))), body);
  await load();

  function form(s) {
    const f = {
      title: h("textarea", { rows: 2, maxlength: 60, placeholder: "Premium Fashion\nFor Modern Life" }, s?.title ?? ""),
      text: h("input", { maxlength: 160, value: s?.body ?? "", placeholder: "Discover exclusive collections for men, women and kids." }),
      order: h("input", { type: "number", min: 0, max: 9999, value: s?.sortOrder ?? 0 }), active: h("input", { type: "checkbox", checked: s ? s.isActive : true }),
    };
    f.title.value = s?.title ?? "";
    const el = h("form", { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const payload = { title: f.title.value.replace(/\r/g, "").trim(), body: f.text.value.trim(), sortOrder: Number(f.order.value) || 0, isActive: f.active.checked };
      try { s ? await api(`/admin/onboarding/${s.id}`, { method: "PUT", body: payload }) : await api("/admin/onboarding", { method: "POST", body: payload }); toast(s ? "Screen saved" : "Screen added. Now add its picture."); await load(); }
      catch (ex) { showFieldErrors(el, ex.fields); toast(ex.message, "error"); }
    } },
      h("div", { class: "grid2" },
        h("div", { class: "field" }, h("label", {}, "Heading (Enter = new line)"), f.title, h("div", { class: "err", "data-err": "title" })),
        h("div", { class: "field" }, h("label", {}, "Text under the heading"), f.text, h("div", { class: "err", "data-err": "body" })),
        h("div", { class: "field" }, h("label", {}, "Order (0 = first)"), f.order)),
      h("label", { class: "check" }, f.active, "Visible in the app"), h("div", { class: "row" }, h("button", { class: "btn gold", type: "submit" }, s ? "Save screen" : "Add screen")));
    return el;
  }

  async function load() {
    const { items } = await api("/admin/onboarding");
    put(clear(body), h("div", { class: "card" }, h("h2", {}, "New screen"), form(null)), items.length ? items.map((s) => {
      const pick = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "sr", id: `w${s.id}`, onchange: async (e) => {
        const file = e.target.files[0]; e.target.value = ""; if (!file) return;
        if (file.size > MAX_BYTES) return toast("Image is larger than 8 MB.", "error");
        try { await uploadTo(`/admin/onboarding/${s.id}/image`, file); toast("Picture updated"); await load(); } catch (ex) { toast(ex.message, "error"); } } });
      return h("details", { class: "card", ...keepOpen(opened, s.id) },
        h("summary", {}, h("b", {}, s.title.replace(/\n/g, " ")), " ", h("span", { class: `badge ${s.isActive ? "ok" : ""}` }, s.isActive ? "Visible" : "Hidden"), h("span", { class: "hint" }, `  order ${s.sortOrder}`)),
        h("div", { class: "row" }, s.imageUrl ? h("img", { src: s.imageUrl, alt: "", class: "slideimg" }) : h("div", { class: "empty slideimg" }, "No picture yet"),
          h("div", {}, h("label", { class: "btn ghost sm", for: `w${s.id}` }, s.imageUrl ? "Replace picture" : "Upload picture"), pick,
            s.imageUrl ? h("button", { class: "btn ghost sm", type: "button", onclick: async () => { try { await api(`/admin/onboarding/${s.id}/image`, { method: "DELETE" }); toast("Picture removed"); await load(); } catch (ex) { toast(ex.message, "error"); } } }, "Remove picture") : null,
            h("p", { class: "hint" }, "Tall phone-shaped picture works best (e.g. 1080 x 1920). It is resized automatically."))),
        form(s), h("div", { class: "row end" }, h("button", { class: "btn danger sm", onclick: async () => {
          if (!(await confirmDialog(`Delete "${s.title.replace(/\n/g, " ")}"?`, "The screen and its picture are removed from the app."))) return;
          try { await api(`/admin/onboarding/${s.id}`, { method: "DELETE" }); toast("Screen deleted"); await load(); } catch (ex) { toast(ex.message, "error"); } } }, "Delete screen")));
    }) : h("div", { class: "empty" }, h("h2", {}, "No screens yet"), h("p", {}, "Until you add one, the app shows its three built-in text screens.")));
  }
}
