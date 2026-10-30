import { api, uploadTo } from "../api.js";
import { clear, confirmDialog, fmtDate, h, put, toast } from "../ui.js";

const MAX_BYTES = 8 * 1024 * 1024;

/* Daily pictures ("status"): visible to signed-in customers for 24 hours, then removed automatically. */
export async function renderStatus(view) {
  const list = h("div", {});
  let file = null;
  const caption = h("input", { maxlength: 300, placeholder: "Caption (optional): New Eid collection is live" });
  const preview = h("img", { class: "slideimg", alt: "", hidden: true });
  const pick = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "sr", id: "stfile", onchange: (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > MAX_BYTES) return toast("Image is larger than 8 MB.", "error");
    file = f; preview.src = URL.createObjectURL(f); preview.hidden = false; post.disabled = false;
  } });
  const bar = h("div", { class: "prog", hidden: true }, h("i", {}));
  const post = h("button", { class: "btn gold", disabled: true, onclick: async () => {
    if (!file) return; post.disabled = true; bar.hidden = false;
    try {
      await uploadTo("/admin/status", file, (p) => { bar.firstChild.style.width = `${p}%`; }, { caption: caption.value.trim() });
      toast("Status posted. Customers can see it for 24 hours."); file = null; caption.value = ""; preview.hidden = true; await load();
    } catch (ex) { toast(ex.message, "error"); post.disabled = false; } finally { bar.hidden = true; bar.firstChild.style.width = "0"; }
  } }, "Post status");

  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Status"), h("p", { class: "muted" }, "Post a picture every day. It is shown at the top of the app's chat screen and disappears after 24 hours."))),
    h("div", { class: "card" }, h("h2", {}, "New status"),
      h("div", { class: "row" }, preview, h("div", {}, h("label", { class: "btn ghost sm", for: "stfile" }, "Choose picture"), pick)),
      h("div", { class: "field", style: "margin-top:14px" }, h("label", {}, "Caption"), caption), bar, h("div", { class: "row" }, post)),
    list);
  await load();

  async function load() {
    const { items } = await api("/admin/status");
    put(clear(list), items.length ? h("div", { class: "statusgrid" }, items.map((s) => h("div", { class: "card statuscard" },
      h("img", { src: s.imageUrl, alt: "", class: "slideimg" }),
      s.caption ? h("p", {}, s.caption) : h("p", { class: "muted" }, "No caption"),
      h("p", { class: "hint" }, `Posted ${fmtDate(s.createdAt)}`, h("br"), `Disappears ${fmtDate(s.expiresAt)}`, h("br"), `Seen by ${s.views} ${s.views === 1 ? "person" : "people"}`),
      h("button", { class: "btn danger sm", onclick: async () => {
        if (!(await confirmDialog("Delete this status?", "Customers will no longer see it."))) return;
        try { await api(`/admin/status/${s.id}`, { method: "DELETE" }); toast("Status deleted"); await load(); } catch (ex) { toast(ex.message, "error"); } } }, "Delete"))))
      : h("div", { class: "empty" }, h("h2", {}, "Nothing posted right now"), h("p", {}, "Statuses older than 24 hours are removed automatically.")));
  }
}
