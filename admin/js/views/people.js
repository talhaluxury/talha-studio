import { api } from "../api.js";
import { clear, debounce, fmtDate, h, money, put } from "../ui.js";

const LIMIT = 25;
export async function renderCustomers(view) {
  const st = { q: "", page: 1 }; const box = h("div", {});
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Customers"), h("p", { class: "muted" }, "Registered customers and what they have ordered (cancelled and refunded orders excluded)."))),
    h("div", { class: "filters" }, h("div", { class: "field" }, h("input", { type: "search", placeholder: "Search name or email", "aria-label": "Search customers", oninput: debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(); }) }))), box);
  await load();
  async function load() {
    const p = new URLSearchParams({ page: st.page, limit: LIMIT }); if (st.q) p.set("q", st.q);
    const r = await api(`/admin/customers?${p}`); const pages = Math.max(1, Math.ceil(r.total / LIMIT));
    put(clear(box), r.items.length ? h("table", {}, h("thead", {}, h("tr", {}, ["Name", "Email", "Phone", "Orders", "Spent", "Joined"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", {}, r.items.map((c) => h("tr", {}, h("td", { "data-label": "Name" }, h("b", {}, c.fullName)), h("td", { "data-label": "Email" }, c.email), h("td", { "data-label": "Phone" }, c.phone ?? "-"),
        h("td", { "data-label": "Orders" }, c.orders), h("td", { "data-label": "Spent" }, money(c.spent)), h("td", { "data-label": "Joined" }, fmtDate(c.createdAt))))))
      : h("div", { class: "empty" }, h("h2", {}, "No customers found"), h("p", {}, "Customers appear after they create an account in the app.")),
      h("div", { class: "pager" }, h("span", { class: "muted" }, `${r.total} customer${r.total === 1 ? "" : "s"} · page ${st.page} of ${pages}`),
        h("div", { class: "row" }, h("button", { class: "btn ghost sm", disabled: st.page <= 1, onclick: () => { st.page--; load(); } }, "Previous"), h("button", { class: "btn ghost sm", disabled: st.page >= pages, onclick: () => { st.page++; load(); } }, "Next"))));
  }
}

export async function renderActivity(view) {
  const st = { action: "", page: 1 }; const box = h("div", {});
  const groups = [["", "Everything"], ["order", "Orders"], ["product", "Products"], ["coupon", "Coupons"], ["banner", "Banners"], ["settings", "Settings"], ["user", "Team"], ["admin.login", "Sign-ins"]];
  put(clear(view), h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Activity log"), h("p", { class: "muted" }, "Who changed what, newest first. Owner only."))),
    h("div", { class: "field" }, h("select", { "aria-label": "Filter", onchange: (e) => { st.action = e.target.value; st.page = 1; load(); } }, groups.map(([v, l]) => h("option", { value: v }, l)))), box);
  await load();
  async function load() {
    const p = new URLSearchParams({ page: st.page, limit: LIMIT }); if (st.action) p.set("action", st.action);
    const r = await api(`/admin/activity-logs?${p}`); const pages = Math.max(1, Math.ceil(r.total / LIMIT));
    put(clear(box), r.items.length ? h("table", {}, h("thead", {}, h("tr", {}, ["When", "Who", "Action", "Details", "IP"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", {}, r.items.map((a) => h("tr", {}, h("td", { "data-label": "When" }, fmtDate(a.createdAt)), h("td", { "data-label": "Who" }, a.adminName ?? "-", h("div", { class: "hint" }, a.adminEmail ?? "")),
        h("td", { "data-label": "Action" }, h("b", {}, a.action)), h("td", { "data-label": "Details" }, a.meta ? JSON.stringify(a.meta).slice(0, 140) : (a.entity ?? "")), h("td", { "data-label": "IP" }, a.ip ?? "-")))))
      : h("div", { class: "empty" }, h("h2", {}, "Nothing logged yet")),
      h("div", { class: "pager" }, h("span", { class: "muted" }, `${r.total} entries · page ${st.page} of ${pages}`),
        h("div", { class: "row" }, h("button", { class: "btn ghost sm", disabled: st.page <= 1, onclick: () => { st.page--; load(); } }, "Previous"), h("button", { class: "btn ghost sm", disabled: st.page >= pages, onclick: () => { st.page++; load(); } }, "Next"))));
  }
}
