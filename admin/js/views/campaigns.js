import { api, session } from "../api.js";
import { clear, confirmDialog, fmtDate, h, put, showFieldErrors, toast } from "../ui.js";

export async function renderCampaigns(view) {
  const canSend = session.canWrite();
  const root = h("div", {});
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Notifications"),
    h("p", { class: "muted" }, "Send announcements to customers. Order updates (confirmed, shipped, delivered, cancelled) are sent automatically."))), root);
  let page = 1; const box = h("div", {}); const banner = h("div", {});
  const [first, products] = await Promise.all([api("/admin/campaigns?limit=10"), canSend ? api("/admin/products?limit=50") : null]);
  put(root, banner, canSend ? composer(first, products.items) : null, h("div", { class: "card" }, h("h2", {}, "Sent campaigns"), box));
  draw(first);

  function draw(r) {
    put(clear(banner), r.pushConfigured ? null : h("div", { class: "card", role: "status" }, h("h2", {}, "Push delivery is not switched on"),
      h("p", { class: "muted" }, "Messages still reach every customer's in-app notification inbox. To also send phone alerts, add the Firebase service account on the server (see docs/PUSH_SETUP.md).")));
    const pages = Math.max(1, Math.ceil(r.total / r.limit));
    put(clear(box), r.items.length ? h("table", {}, h("thead", {}, h("tr", {}, ["Message", "Opens", "Customers", "Push failures", "Sent"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", {}, r.items.map((c) => h("tr", {}, h("td", { "data-label": "Message" }, h("b", {}, c.title), h("div", { class: "hint" }, c.body)),
        h("td", { "data-label": "Opens" }, c.deepLink ? c.deepLink.replace("talhastudio://", "").split("/")[0] : "App home"), h("td", { "data-label": "Customers" }, c.recipients ?? "sending..."),
        h("td", { "data-label": "Push failures" }, c.sentAt ? c.failed : "-"), h("td", { "data-label": "Sent" }, fmtDate(c.sentAt ?? c.createdAt))))))
      : h("div", { class: "empty" }, h("h2", {}, "No campaigns yet"), h("p", {}, "Your first announcement will be listed here.")),
      h("div", { class: "pager" }, h("span", { class: "muted" }, `${r.total} campaign${r.total === 1 ? "" : "s"} · page ${page} of ${pages}`),
        h("div", { class: "row" }, h("button", { class: "btn ghost sm", disabled: page <= 1, onclick: () => { page--; load(); } }, "Previous"), h("button", { class: "btn ghost sm", disabled: page >= pages, onclick: () => { page++; load(); } }, "Next"))));
  }
  async function load() { try { draw(await api(`/admin/campaigns?limit=10&page=${page}`)); } catch (e) { toast(e.message, "error"); } }

  function composer(r, products) {
    const title = h("input", { id: "ctitle", maxlength: 65, placeholder: "Eid Sale is live" });
    const body = h("textarea", { id: "cbody", maxlength: 240, placeholder: "Up to 50% off on selected items." });
    const target = h("select", { id: "ctarget", "aria-label": "Where the notification opens" }, h("option", { value: "" }, "App home"), products.filter((p) => p.isPublished).map((p) => h("option", { value: `talhastudio://product/${p.id}` }, `Product: ${p.name}`)));
    const counter = h("span", { class: "hint" }, "0 / 240");
    body.addEventListener("input", () => { counter.textContent = `${body.value.length} / 240`; });
    const send = h("button", { class: "btn gold", type: "submit" }, "Send to customers");
    const form = h("form", { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const payload = { title: title.value.trim(), body: body.value.trim(), deepLink: target.value || null };
      if (payload.title.length < 2 || payload.body.length < 2) { showFieldErrors(form, { title: payload.title.length < 2 ? "Enter a title" : "", body: payload.body.length < 2 ? "Enter a message" : "" }); return; }
      const a = r.audience;
      if (!(await confirmDialog("Send this notification?", `It goes to ${a.users} customer${a.users === 1 ? "" : "s"} who allow promotions${r.pushConfigured ? ` (${a.devices} phone${a.devices === 1 ? "" : "s"})` : " (in-app inbox only, push is off)"}. It cannot be recalled.`, "Send now"))) return;
      send.disabled = true;
      try {
        const res = await api("/admin/campaigns", { method: "POST", body: payload });
        toast(`Sent to ${res.recipients} customer${res.recipients === 1 ? "" : "s"}`); title.value = ""; body.value = ""; counter.textContent = "0 / 240"; page = 1; setTimeout(load, 1200);
      } catch (ex) { showFieldErrors(form, ex.fields); toast(ex.message, "error"); } finally { send.disabled = false; }
    } },
      h("h2", {}, "New announcement"),
      h("div", { class: "field" }, h("label", { for: "ctitle" }, "Title"), title, h("div", { class: "err", "data-err": "title" })),
      h("div", { class: "field" }, h("label", { for: "cbody" }, "Message"), body, counter, h("div", { class: "err", "data-err": "body" })),
      h("div", { class: "field" }, h("label", { for: "ctarget" }, "When tapped, open"), target, h("div", { class: "err", "data-err": "deepLink" })),
      h("p", { class: "hint" }, `Audience: ${r.audience.users} customer${r.audience.users === 1 ? "" : "s"} who allow promotions, ${r.audience.devices} registered phone${r.audience.devices === 1 ? "" : "s"}.`),
      h("div", { class: "row" }, send));
    return h("div", { class: "card" }, form);
  }
}
