import { api, session } from "../api.js";
import { clear, confirmDialog, h, showFieldErrors, toast, put } from "../ui.js";

export async function renderCategories(view) {
  const write = session.canWrite();
  const body = h("div", {});
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Categories"), h("p", { class: "muted" }, "These appear as the shopping categories in the app."))), body);
  await load();

  function form(existing) {
    const f = {
      name: h("input", { id: "cname", required: true, maxlength: 60, value: existing?.name ?? "", disabled: !write }),
      slug: h("input", { id: "cslug", maxlength: 60, value: existing?.slug ?? "", placeholder: "auto from name", disabled: !write }),
      sort: h("input", { id: "csort", type: "number", min: 0, max: 9999, value: existing?.sortOrder ?? 0, disabled: !write }),
      active: h("input", { id: "cact", type: "checkbox", checked: existing ? existing.isActive : true, disabled: !write }),
    };
    const el = h("form", { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const payload = { name: f.name.value.trim(), sortOrder: Number(f.sort.value) || 0, isActive: f.active.checked };
      if (f.slug.value.trim()) payload.slug = f.slug.value.trim().toLowerCase();
      try {
        if (existing) await api(`/admin/categories/${existing.id}`, { method: "PUT", body: payload }); else await api("/admin/categories", { method: "POST", body: payload });
        toast(existing ? "Category saved" : "Category added"); await load();
      } catch (ex) { showFieldErrors(el, ex.fields); toast(ex.message, "error"); }
    } },
      h("div", { class: "grid2" },
        h("div", { class: "field" }, h("label", { for: "cname" }, "Name"), f.name, h("div", { class: "err", "data-err": "name" })),
        h("div", { class: "field" }, h("label", { for: "cslug" }, "URL name"), f.slug, h("div", { class: "err", "data-err": "slug" }), h("div", { class: "hint" }, "Lowercase letters, numbers and dashes.")),
        h("div", { class: "field" }, h("label", { for: "csort" }, "Display order"), f.sort, h("div", { class: "err", "data-err": "sortOrder" }))),
      h("label", { class: "check", for: "cact" }, f.active, "Show in the app"),
      write ? h("div", { class: "row" }, h("button", { class: "btn gold", type: "submit" }, existing ? "Save category" : "Add category")) : null);
    return el;
  }

  async function load() {
    const { items } = await api("/admin/categories");
    put(clear(body), 
      write ? h("div", { class: "card" }, h("h2", {}, "New category"), form(null)) : null,
      items.length ? items.map((c) => {
        const det = h("details", { class: "card" },
          h("summary", {}, h("b", {}, c.name), " ", h("span", { class: `badge ${c.isActive ? "ok" : ""}` }, c.isActive ? "Visible" : "Hidden"), " ", h("span", { class: "hint" }, c.slug)),
          h("div", {}, form(c)),
          write ? h("div", { class: "row end" }, h("button", { class: "btn danger sm", onclick: async () => {
            if (!(await confirmDialog(`Delete ${c.name}?`, "This cannot be undone. Categories that still contain products cannot be deleted."))) return;
            try { await api(`/admin/categories/${c.id}`, { method: "DELETE" }); toast("Category deleted"); await load(); } catch (ex) { toast(ex.message, "error"); }
          } }, "Delete category")) : null);
        return det;
      }) : h("div", { class: "empty" }, h("h2", {}, "No categories yet"), h("p", {}, "Add Ladies, Gents, Unstitched and so on before creating products.")));
  }
}
