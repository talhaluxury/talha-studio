import { api, uploadTo } from "./api.js";
import { confirmDialog, h, toast } from "./ui.js";

export const MAX_VIDEO = 25 * 1024 * 1024;

/** Upload / preview / delete box for the single short video of a product or a banner. */
export function videoBox({ url, uploadPath, deletePath, canEdit = true, onChange = () => {} }) {
  let cur = url || null;
  const id = "vid" + Math.random().toString(36).slice(2, 8);
  const holder = h("div", {});
  const info = h("span", { class: "hint" });
  const del = h("button", { class: "btn ghost sm", type: "button", onclick: async () => {
    if (!(await confirmDialog("Delete this video?", "The video file is removed permanently."))) return;
    try { await api(deletePath, { method: "DELETE" }); cur = null; paint(); toast("Video deleted"); onChange(null); } catch (ex) { toast(ex.message, "error"); }
  } }, "Delete video");
  const pick = h("input", { type: "file", accept: "video/mp4,video/*", class: "sr", id, onchange: async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > MAX_VIDEO) return toast("The video is larger than 25 MB. Use a shorter or compressed MP4.", "error");
    try { const r = await uploadTo(uploadPath, f, (p) => { info.textContent = `Uploading ${p}%`; }); cur = r.videoUrl; info.textContent = ""; paint(); toast("Video saved"); onChange(cur); }
    catch (ex) { info.textContent = ""; toast(ex.message, "error"); }
  } });
  function paint() {
    holder.replaceChildren(cur
      ? h("video", { src: cur, controls: true, playsinline: true, preload: "metadata", style: "width:100%;max-width:320px;border-radius:12px;background:#000" })
      : h("p", { class: "muted" }, "No video yet."));
    del.hidden = !cur;
  }
  paint();
  return h("div", {}, holder, canEdit ? h("div", { class: "row", style: "gap:8px;align-items:center;margin-top:8px" }, pick, h("label", { class: "btn gold sm", for: id }, cur ? "Replace video" : "Choose video"), del, info) : null);
}
