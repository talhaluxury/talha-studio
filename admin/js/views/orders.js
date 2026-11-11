import { api, fetchText, session } from "../api.js";
import { quickWhatsApp } from "../waOrder.js";
import { getSeenAt, markOrdersSeen, refreshAlerts } from "../alerts.js";
import { clear, confirmDialog, debounce, fmtDate, h, money, put, STATUS_LABEL, statusBadge, toast } from "../ui.js";

const LIMIT = 20;
const IN_APP = navigator.userAgent.includes("TalhaAdminApp");

export async function renderOrders(view) {
  const state = { status: "", q: "", from: "", to: "", page: 1 };
  const write = session.canWrite();
  const seenAt = getSeenAt(); markOrdersSeen(); setTimeout(refreshAlerts, 500);      // orders newer than the last visit get a NEW tag
  const selected = new Set();                                                       // ticked orders (kept while paging)
  const bar = h("div", { class: "card orderbar", hidden: true });
  const drawBar = () => {
    bar.hidden = !write || !selected.size; if (bar.hidden) return;
    put(clear(bar), h("div", { class: "row", style: "align-items:center;gap:8px;flex-wrap:wrap" }, h("b", {}, `${selected.size} selected`),
      h("button", { class: "btn danger", type: "button", onclick: deleteSelected }, "Delete selected"), h("button", { class: "btn ghost sm", type: "button", onclick: () => { selected.clear(); drawBar(); load(); } }, "Clear")));
  };
  async function deleteSelected() {
    const ids = [...selected];
    if (!(await confirmDialog(`Delete ${ids.length} order${ids.length === 1 ? "" : "s"}?`, "They are removed for good. Open orders are cancelled first so their stock goes back on sale. The customer is not notified.", "Delete"))) return;
    try { const r = await api("/admin/orders/bulk-delete", { method: "POST", body: { ids } }); toast(`${r.deleted} order${r.deleted === 1 ? "" : "s"} deleted`); selected.clear(); drawBar(); await load(); refreshAlerts(); }
    catch (e) { toast(e.message, "error"); }
  }
  async function deleteOne(o) {
    if (!(await confirmDialog(`Delete order ${o.orderNumber}?`, "It is removed for good. If it is still open it is cancelled first so its stock goes back on sale. The customer is not notified.", "Delete"))) return;
    try { await api(`/admin/orders/${o.id}`, { method: "DELETE" }); toast(`Order ${o.orderNumber} deleted`); selected.delete(o.id); drawBar(); await load(); refreshAlerts(); }
    catch (e) { toast(e.message, "error"); }
  }
  const list = h("div", {});
  const tabs = h("div", { class: "tabs", role: "group", "aria-label": "Filter by status" });
  const drawTabs = () => put(clear(tabs), [["", "All"], ...Object.entries(STATUS_LABEL)].map(([v, l]) =>
    h("button", { class: "tab", "aria-pressed": String(state.status === v), onclick: () => { state.status = v; state.page = 1; drawTabs(); load(); } }, l)));
  drawTabs();
  const reload = () => { state.page = 1; load(); };
  const q = h("input", { type: "search", placeholder: "Order number, name, phone or email", "aria-label": "Search orders", oninput: debounce((e) => { state.q = e.target.value.trim(); reload(); }) });
  const from = h("input", { type: "date", "aria-label": "From date", onchange: (e) => { state.from = e.target.value; reload(); } });
  const to = h("input", { type: "date", "aria-label": "To date", onchange: (e) => { state.to = e.target.value; reload(); } });
  const qs = (extra = {}) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...state, ...extra })) if (v !== "" && v != null) p.set(k, v); return p; };

  async function exportCsv() {
    try {
      const p = qs(); p.delete("page");
      const text = await fetchText(`/admin/orders/export.csv?${p}`);
      if (IN_APP) { // WebView cannot save files: show the CSV so it can be copied
        const box = h("textarea", { class: "csvbox", readonly: true }, text);
        const dlg = h("dialog", { class: "dialog" }, h("h2", {}, "Orders CSV"), h("p", {}, "Copy this and paste into Sheets or Excel."), box,
          h("div", { class: "row end" }, h("button", { class: "btn ghost", onclick: () => dlg.close() }, "Close"),
            h("button", { class: "btn gold", onclick: async () => { box.select(); try { await navigator.clipboard.writeText(text); toast("Copied"); } catch { document.execCommand("copy"); toast("Copied"); } } }, "Copy")));
        dlg.addEventListener("close", () => dlg.remove()); document.body.append(dlg); dlg.showModal(); return;
      }
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      const a = h("a", { href: url, download: `talha-orders-${new Date().toISOString().slice(0, 10)}.csv` }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { toast(e.message, "error"); }
  }

  put(clear(view),
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Orders"), h("p", { class: "muted" }, "Newest first. Open an order to update its status.")),
      session.canWrite() ? h("button", { class: "btn ghost", onclick: exportCsv }, "Export CSV") : null),
    tabs, h("div", { class: "filters" }, h("div", { class: "field" }, q), h("div", { class: "field" }, from), h("div", { class: "field" }, to)), bar, list);
  await load();

  async function load() {
    let r;
    try { r = await api(`/admin/orders?${qs({ limit: LIMIT })}`); } catch (e) { put(clear(list), h("div", { class: "empty" }, h("h2", {}, "Could not load orders"), h("p", {}, e.message))); return; }
    if (!r.items.length) { put(clear(list), h("div", { class: "empty" }, h("h2", {}, "No orders found"), h("p", {}, "Orders placed in the app appear here instantly."))); return; }
    const pages = Math.max(1, Math.ceil(r.total / LIMIT));
    const tick = (o) => { const cb = h("input", { type: "checkbox", "aria-label": `Select order ${o.orderNumber}` }); cb.checked = selected.has(o.id); cb.onchange = () => { cb.checked ? selected.add(o.id) : selected.delete(o.id); drawBar(); }; return cb; };
    const all = h("input", { type: "checkbox", "aria-label": "Select all orders on this page" }); all.checked = r.items.every((o) => selected.has(o.id));
    all.onchange = () => { r.items.forEach((o) => (all.checked ? selected.add(o.id) : selected.delete(o.id))); drawBar(); load(); };
    const isFresh = (o) => o.status === "pending" && new Date(o.createdAt).getTime() > seenAt;
    drawBar();
    put(clear(list),
      h("table", {}, h("thead", {}, h("tr", {}, write ? h("th", { scope: "col" }, all) : null, ["Order", "Customer", "Items", "Total", "Status", "Placed", ""].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", {}, r.items.map((o) => h("tr", { class: isFresh(o) ? "freshorder" : "" },
          write ? h("td", {}, tick(o)) : null,
          h("td", { "data-label": "Order" }, h("a", { href: `#/orders/${o.id}` }, h("b", {}, o.orderNumber)), isFresh(o) ? h("span", { class: "newtag" }, "NEW") : null),
          h("td", { "data-label": "Customer" }, o.customerName, h("div", { class: "hint" }, o.customerPhone)),
          h("td", { "data-label": "Items" }, `${o.itemCount}${o.firstItemName ? " · " + o.firstItemName : ""}`),
          h("td", { "data-label": "Total" }, money(o.total)), h("td", { "data-label": "Status" }, statusBadge(o.status)),
          h("td", { "data-label": "Placed" }, fmtDate(o.createdAt)),
          h("td", {}, h("div", { class: "row acts" },
            h("button", { class: "btn wabtn sm", type: "button", "aria-label": `WhatsApp ${o.customerName}`, onclick: (e) => quickWhatsApp(o.id, e.currentTarget) }, "Send WhatsApp"),
            h("a", { class: "btn ghost sm", href: `#/orders/${o.id}` }, "Open"),
            write ? h("button", { class: "btn danger sm", type: "button", "aria-label": `Delete order ${o.orderNumber}`, onclick: () => deleteOne(o) }, "Delete") : null))))),
      h("div", { class: "pager" }, h("span", { class: "muted" }, `${r.total} order${r.total === 1 ? "" : "s"} · page ${state.page} of ${pages}`),
        h("div", { class: "row" }, h("button", { class: "btn ghost sm", disabled: state.page <= 1, onclick: () => { state.page--; load(); } }, "Previous"),
          h("button", { class: "btn ghost sm", disabled: state.page >= pages, onclick: () => { state.page++; load(); } }, "Next"))));
  }
}
