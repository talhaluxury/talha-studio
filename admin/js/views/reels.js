import { api } from "../api.js";
import { videoBox } from "../videoBox.js";
import { clear, confirmDialog, h, put, showFieldErrors, toast } from "../ui.js";

const keepOpen = (set, id) => ({ open: set.has(id), ontoggle: (e) => (e.target.open ? set.add(id) : set.delete(id)) });

/** "Watch & Shop": short videos shown under On Sale in the app. They play by themselves; a tap opens the category or section chosen here. */
export async function renderReels(view) {
  const body = h("div", {}); const opened = new Set();
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Video cards"), h("p", { class: "muted" }, "Short videos in a row under On Sale on the app home screen. Each plays by itself, and a tap opens the category or section you pick. Changes appear without an app update."))), body);
  const cats = (await api("/admin/categories")).items;
  const sections = (await api("/admin/sections")).items;
  const TARGETS = [["", "Opens the shop (all products)"], ...cats.map((c) => [`cat:${c.slug}`, `Category: ${c.name}`]),
    ["sec:sale", "Section: On Sale"], ["sec:new-arrivals", "Section: New Arrivals"], ["sec:featured", "Section: Featured"], ...sections.map((s) => [`sec:${s.slug}`, `Section: ${s.title}`])];
  await load();

  function form(r) {
    const f = {
      title: h("input", { maxlength: 60, value: r?.title ?? "", placeholder: "e.g. Winter collection" }),
      target: h("select", {}, TARGETS.map(([v, label]) => h("option", { value: v, selected: (r?.target ?? "") === v }, label))),
      order: h("input", { type: "number", min: 0, max: 9999, value: r?.sortOrder ?? 0 }), active: h("input", { type: "checkbox", checked: r ? r.isActive : true }),
    };
    const el = h("form", { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const payload = { title: f.title.value.trim(), target: f.target.value || null, sortOrder: Number(f.order.value) || 0, isActive: f.active.checked };
      try { r ? await api(`/admin/reels/${r.id}`, { method: "PUT", body: payload }) : await api("/admin/reels", { method: "POST", body: payload }); toast(r ? "Saved" : "Added. Now choose its video."); await load(); }
      catch (ex) { showFieldErrors(el, ex.fields); toast(ex.message, "error"); }
    } },
      h("div", { class: "grid2" },
        h("div", { class: "field" }, h("label", {}, "Title (shown on the card)"), f.title, h("div", { class: "err", "data-err": "title" })),
        h("div", { class: "field" }, h("label", {}, "When a customer taps it"), f.target, h("div", { class: "err", "data-err": "target" })),
        h("div", { class: "field" }, h("label", {}, "Order (0 = first)"), f.order)),
      h("label", { class: "check" }, f.active, "Visible in the app"), h("div", { class: "row" }, h("button", { class: "btn gold", type: "submit" }, r ? "Save" : "Add video card")));
    return el;
  }

  async function load() {
    const { items } = await api("/admin/reels");
    put(clear(body), h("div", { class: "card" }, h("h2", {}, "New video card"), form(null)),
      items.length ? items.map((r) => h("details", { class: "card", ...keepOpen(opened, r.id) },
        h("summary", {}, h("b", {}, r.title), " ", h("span", { class: `badge ${r.isActive ? "ok" : ""}` }, r.isActive ? "Visible" : "Hidden"), r.videoUrl ? null : h("span", { class: "badge warn" }, " No video yet")),
        h("div", {}, h("b", {}, "Video"), h("p", { class: "hint" }, "A short MP4 (up to 25 MB), best in portrait. A card appears in the app only after it has a video."),
          videoBox({ url: r.videoUrl, uploadPath: `/admin/reels/${r.id}/video`, deletePath: `/admin/reels/${r.id}/video`, onChange: () => load() })),
        form(r), h("div", { class: "row end" }, h("button", { class: "btn danger sm", onclick: async () => {
          if (!(await confirmDialog(`Delete "${r.title}"?`, "The card and its video are removed from the app."))) return;
          try { await api(`/admin/reels/${r.id}`, { method: "DELETE" }); toast("Deleted"); await load(); } catch (ex) { toast(ex.message, "error"); } } }, "Delete"))))
        : h("div", { class: "empty" }, h("h2", {}, "No video cards yet"), h("p", {}, "Add one, choose its video, and it shows under On Sale in the app.")));
  }
}
