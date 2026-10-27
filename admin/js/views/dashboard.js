import { api } from "../api.js";
import { clear, fmtDate, h, money, put, statusBadge, svg } from "../ui.js";

function barChart(series) {
  const W = 720, H = 220, pad = { l: 8, r: 8, t: 12, b: 26 };
  const max = Math.max(1, ...series.map((d) => d.sales));
  const bw = (W - pad.l - pad.r) / series.length;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": `Daily sales for the last ${series.length} days` });
  series.forEach((d, i) => {
    const bh = Math.round(((H - pad.t - pad.b) * d.sales) / max);
    const x = pad.l + i * bw + bw * 0.15;
    const r = svg("rect", { class: "bar", x, y: H - pad.b - bh, width: Math.max(2, bw * 0.7), height: Math.max(bh, d.sales ? 2 : 0), rx: 3 });
    r.append(svg("title", {}, `${d.date}: ${money(d.sales)} · ${d.orders} order${d.orders === 1 ? "" : "s"}`));
    root.append(r);
    if (series.length <= 10 || i % Math.ceil(series.length / 8) === 0) root.append(svg("text", { x: x + bw * 0.35, y: H - 8, "text-anchor": "middle" }, d.date.slice(5)));
  });
  root.append(svg("line", { x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b, stroke: "#e6dfd3" }));
  return root;
}

export async function renderDashboard(view) {
  let days = 30;
  const body = h("div", {});
  put(clear(view),
    h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, "Dashboard"), h("p", { class: "muted" }, "Sales and orders at a glance.")),
      h("a", { class: "btn gold", href: "#/products/new" }, "Add product")), body);
  await load();

  async function load() {
    put(clear(body), h("p", { class: "muted" }, "Loading..."));
    const [a, s] = await Promise.all([api(`/admin/analytics?days=${days}`), api("/admin/stats")]);
    const stat = (v, label, attn) => h("div", { class: `stat${attn && v > 0 ? " attn" : ""}` }, h("b", {}, v), h("span", { class: "muted" }, label));
    const rows = a.recent.map((o) => h("tr", {},
      h("td", { "data-label": "Order" }, h("a", { href: `#/orders/${o.id}` }, h("b", {}, o.orderNumber))),
      h("td", { "data-label": "Customer" }, o.customerName), h("td", { "data-label": "Total" }, money(o.total)),
      h("td", { "data-label": "Status" }, statusBadge(o.status)), h("td", { "data-label": "Placed" }, fmtDate(o.createdAt))));
    put(clear(body),
      h("div", { class: "tabs", role: "group", "aria-label": "Period" }, [7, 30, 90].map((d) =>
        h("button", { class: "tab", "aria-pressed": String(d === days), onclick: () => { days = d; load(); } }, `Last ${d} days`))),
      h("div", { class: "stats" }, stat(money(a.sales), `Sales (${a.days} days, excl. cancelled)`), stat(a.orders, `Orders (${a.days} days)`), stat(a.pending, "Pending orders", true), stat(a.customers, "Customers")),
      h("div", { class: "card" }, h("h2", {}, "Sales"), barChart(a.series)),
      h("div", { class: "cols" },
        h("div", {}, h("h2", { class: "sr" }, "Recent orders"), h("div", { class: "pagehead" }, h("h2", {}, "Recent orders"), h("a", { href: "#/orders" }, "View all")),
          a.recent.length ? h("table", {}, h("thead", {}, h("tr", {}, ["Order", "Customer", "Total", "Status", "Placed"].map((t) => h("th", { scope: "col" }, t)))), h("tbody", {}, rows))
            : h("div", { class: "empty" }, h("h2", {}, "No orders yet"), h("p", {}, "New orders from the app will appear here."))),
        h("div", { class: "card" }, h("h2", {}, "Best sellers"), a.topProducts?.length ? h("table", {}, h("thead", {}, h("tr", {}, ["Product", "Sold", "Revenue"].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", {}, a.topProducts.map((t) => h("tr", {}, h("td", { "data-label": "Product" }, t.name), h("td", { "data-label": "Sold" }, t.qty), h("td", { "data-label": "Revenue" }, money(t.revenue))))))
          : h("p", { class: "muted" }, "Best sellers appear once orders come in.")),
        h("div", { class: "card" }, h("h2", {}, "Catalogue"),
          h("dl", { class: "kv" }, h("dt", {}, "Products"), h("dd", {}, s.products), h("dt", {}, "Published"), h("dd", {}, s.published),
            h("dt", {}, "Low stock"), h("dd", {}, s.lowStock), h("dt", {}, "Out of stock"), h("dd", {}, s.outOfStock), h("dt", {}, "Categories"), h("dd", {}, s.categories)))));
  }
}
