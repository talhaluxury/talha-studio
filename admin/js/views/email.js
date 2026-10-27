import { api, session } from "../api.js";
import { clear, fmtDate, h, put, showFieldErrors, toast } from "../ui.js";

const KIND = { order_confirmation: "Order confirmation (customer)", owner_new_order: "New order (owner)", status_update: "Status update (customer)", owner_status_alert: "Order alert (owner)" };
const TEMPLATES = [
  ["order_confirmation", "Customer: order confirmation", "Sent right after an order is placed."],
  ["owner_new_order", "Owner: new order alert", "Sent to the owner email above."],
  ["status_update", "Customer: status update", "Sent when an order is shipped, delivered, cancelled or refunded."],
];

function deliveryBadge(l, tracking) {
  const map = { delivered: ["ok", "Delivered (confirmed)"], bounced: ["bad", "Bounced"], complained: ["bad", "Marked as spam"], failed: ["bad", "Failed"], queued: ["warn", "Waiting to send"],
    accepted_by_provider: ["gold", tracking ? "Sent, awaiting delivery" : "Accepted by provider"] };
  const [tone, text] = map[l.delivery] ?? ["", l.delivery];
  return h("span", { class: `badge ${tone}` }, text);
}

export async function renderEmail(view) {
  const isOwner = session.get().user.role === "owner";
  const root = h("div", {});
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, isOwner ? "Email & settings" : "Email log"),
    h("p", { class: "muted" }, "Order emails are queued safely: an email problem never loses an order."))), root);
  const state = { status: "", page: 1 };
  const logBox = h("div", {}); const banner = h("div", {});
  const [first, settings] = await Promise.all([api("/admin/email-logs?limit=25"), isOwner ? api("/admin/settings") : null]);
  drawBanner(first.email); put(root, banner);
  if (isOwner) put(root, settingsForm(settings.settings));
  put(root, h("div", { class: "card" }, h("h2", {}, "Email log"), logBox));
  drawLog(first);

  function drawBanner(e) {
    put(clear(banner), !e.configured
      ? h("div", { class: "card", role: "status" }, h("h2", {}, "Email is not switched on yet"), h("p", { class: "muted" }, `${e.queued} email${e.queued === 1 ? " is" : "s are"} waiting. Nothing is lost: they will be sent as soon as the server's EMAIL_DRIVER is configured (see the setup guide).`))
      : h("div", { class: "card" }, h("p", {}, [h("b", {}, `Provider: ${e.provider}`), ` · From: ${e.from || "not set"} · `, `${e.queued} waiting · ${e.failed} failed`]),
          h("p", { class: "hint" }, e.deliveryTracking ? "Delivery confirmations from the provider are being recorded." : "\"Accepted\" means the provider took the email; it does not confirm the inbox received it. Add the provider webhook to track delivery.")));
  }

  async function loadLog() {
    const p = new URLSearchParams({ page: state.page, limit: 25 }); if (state.status) p.set("status", state.status);
    try { const r = await api(`/admin/email-logs?${p}`); drawBanner(r.email); drawLog(r); } catch (e) { put(clear(logBox), h("p", { class: "muted" }, e.message)); }
  }
  function drawLog(r) {
    const tabs = h("div", { class: "tabs", role: "group", "aria-label": "Filter" }, [["", "All"], ["queued", "Waiting"], ["sent", "Sent"], ["failed", "Failed"]].map(([v, l]) =>
      h("button", { class: "tab", "aria-pressed": String(state.status === v), onclick: () => { state.status = v; state.page = 1; loadLog(); } }, l)));
    const pages = Math.max(1, Math.ceil(r.total / r.limit));
    put(clear(logBox), tabs, r.items.length ? h("table", {}, h("thead", {}, h("tr", {}, ["Email", "To", "State", "Tries", "Details", "Time", ""].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", {}, r.items.map((l) => h("tr", {},
        h("td", { "data-label": "Email" }, KIND[l.kind] ?? l.kind, l.orderId ? h("div", {}, h("a", { href: `#/orders/${l.orderId}` }, "Open order")) : null),
        h("td", { "data-label": "To" }, l.to || "-"), h("td", { "data-label": "State" }, deliveryBadge(l, r.email.deliveryTracking)),
        h("td", { "data-label": "Tries" }, l.attempts), h("td", { "data-label": "Details" }, l.lastError ?? l.subject ?? ""),
        h("td", { "data-label": "Time" }, fmtDate(l.sentAt ?? l.createdAt)),
        h("td", {}, l.status === "failed" ? h("button", { class: "btn ghost sm", onclick: async () => {
          try { const x = await api(`/admin/email-logs/${l.id}/retry`, { method: "POST", body: {} }); toast(x.message); setTimeout(loadLog, 800); } catch (e) { toast(e.message, "error"); } } }, "Retry") : null)))))
      : h("div", { class: "empty" }, h("h2", {}, "No emails yet"), h("p", {}, "Order emails will be listed here.")),
      h("div", { class: "pager" }, h("span", { class: "muted" }, `${r.total} email${r.total === 1 ? "" : "s"} · page ${state.page} of ${pages}`),
        h("div", { class: "row" }, h("button", { class: "btn ghost sm", disabled: state.page <= 1, onclick: () => { state.page--; loadLog(); } }, "Previous"),
          h("button", { class: "btn ghost sm", disabled: state.page >= pages, onclick: () => { state.page++; loadLog(); } }, "Next"))));
  }

  function settingsForm(s) {
    const f = {
      ownerEmail: h("input", { id: "owner", type: "email", value: s.ownerEmail, placeholder: "you@yourstore.com", maxlength: 254 }),
      name: h("input", { id: "sname", value: s.store.name, maxlength: 80 }),
      supportEmail: h("input", { id: "semail", type: "email", value: s.store.supportEmail, maxlength: 254 }),
      supportPhone: h("input", { id: "sphone", value: s.store.supportPhone, maxlength: 30 }),
      address: h("input", { id: "saddr", value: s.store.address, maxlength: 200 }),
      est: h("input", { id: "est", value: s.estimatedDelivery, maxlength: 120, placeholder: "e.g. 3-5 working days (leave empty to hide)" }),
    };
    const tpl = Object.fromEntries(TEMPLATES.map(([k]) => [k, { subject: h("input", { id: `${k}-s`, value: s.templates[k].subject, maxlength: 200 }),
      intro: h("textarea", { id: `${k}-i`, maxlength: 1000 }, s.templates[k].intro), footer: h("textarea", { id: `${k}-f`, maxlength: 500 }, s.templates[k].footer) }]));
    const testOut = h("div", { "aria-live": "polite" });
    const save = h("button", { class: "btn gold", type: "submit" }, "Save settings");
    const form = h("form", { novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); save.disabled = true;
      const body = { ownerEmail: f.ownerEmail.value.trim(), store: { name: f.name.value.trim(), supportEmail: f.supportEmail.value.trim(), supportPhone: f.supportPhone.value.trim(), address: f.address.value.trim() },
        estimatedDelivery: f.est.value.trim(), templates: Object.fromEntries(TEMPLATES.map(([k]) => [k, { subject: tpl[k].subject.value.trim(), intro: tpl[k].intro.value.trim(), footer: tpl[k].footer.value.trim() }])) };
      try { const r = await api("/admin/settings", { method: "PUT", body }); drawBanner(r.email); showFieldErrors(form, {}); toast("Settings saved"); }
      catch (ex) { showFieldErrors(form, flat(ex.fields)); toast(ex.message, "error"); } finally { save.disabled = false; }
    } },
      h("div", { class: "card" }, h("h2", {}, "Store & contact"),
        h("div", { class: "grid2" },
          h("div", { class: "field" }, h("label", { for: "owner" }, "Owner email (receives new-order alerts)"), f.ownerEmail, h("div", { class: "err", "data-err": "ownerEmail" })),
          h("div", { class: "field" }, h("label", { for: "sname" }, "Store name"), f.name, h("div", { class: "err", "data-err": "store.name" })),
          h("div", { class: "field" }, h("label", { for: "semail" }, "Support email (shown to customers, used for replies)"), f.supportEmail, h("div", { class: "err", "data-err": "store.supportEmail" })),
          h("div", { class: "field" }, h("label", { for: "sphone" }, "Support phone"), f.supportPhone, h("div", { class: "err", "data-err": "store.supportPhone" })),
          h("div", { class: "field" }, h("label", { for: "saddr" }, "Store address"), f.address, h("div", { class: "err", "data-err": "store.address" })),
          h("div", { class: "field" }, h("label", { for: "est" }, "Estimated delivery"), f.est, h("div", { class: "hint" }, "Shown in customer emails only when filled in."), h("div", { class: "err", "data-err": "estimatedDelivery" })))),
      h("div", { class: "card" }, h("h2", {}, "Email wording"),
        h("p", { class: "hint" }, "You can use {{orderNumber}}, {{customerName}}, {{status}} and {{total}}. Order details, address and branding are added automatically."),
        TEMPLATES.map(([k, title, note]) => h("details", {}, h("summary", {}, h("b", {}, title), " ", h("span", { class: "hint" }, note)),
          h("div", { class: "field" }, h("label", { for: `${k}-s` }, "Subject"), tpl[k].subject, h("div", { class: "err", "data-err": `templates.${k}.subject` })),
          h("div", { class: "field" }, h("label", { for: `${k}-i` }, "Opening message"), tpl[k].intro, h("div", { class: "err", "data-err": `templates.${k}.intro` })),
          h("div", { class: "field" }, h("label", { for: `${k}-f` }, "Closing message"), tpl[k].footer, h("div", { class: "err", "data-err": `templates.${k}.footer` }))))),
      h("div", { class: "row" }, save, h("button", { class: "btn ghost", type: "button", onclick: async () => {
        testOut.textContent = "Sending..."; try { const r = await api("/admin/email/test", { method: "POST", body: {} }); put(clear(testOut), h("p", { class: r.ok ? "" : "err" }, r.message)); } catch (e) { testOut.textContent = e.message; } } }, "Send test email to owner")),
      testOut);
    return form;
  }
}
const flat = (f) => f;
