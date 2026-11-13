import { api } from "../api.js";
import { clear, fmtDate, h, money, put, statusBadge, STATUS_LABEL } from "../ui.js";

export async function renderOrders(root, ctx, args) {
  if (args[0]) return renderDetail(root, args[0]);
  let status = ""; let page = 1;
  const box = h("div", {});
  const sel = h("select", { "aria-label": "Filter by status", style: "max-width:220px", onchange: () => { status = sel.value; page = 1; load(); } },
    h("option", { value: "" }, "All orders"), Object.entries(STATUS_LABEL).map(([k, t]) => h("option", { value: k }, t)));
  async function load() {
    const r = await api(`/seller/orders?page=${page}&limit=20${status ? `&status=${status}` : ""}`);
    ctx.setBadge?.(0);
    clear(box).append(r.items.length ? h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ["Order", "Date", "Customer", "Items", "Your total", "Status"].map((t) => h("th", {}, t)))),
      h("tbody", {}, r.items.map((o) => h("tr", { class: "click", tabindex: 0, onclick: () => { location.hash = `#/orders/${o.id}`; }, onkeydown: (e) => { if (e.key === "Enter") location.hash = `#/orders/${o.id}`; } },
        h("td", {}, h("b", {}, o.orderNumber)), h("td", {}, fmtDate(o.createdAt)), h("td", {}, o.customer.name), h("td", {}, o.itemCount), h("td", {}, money(o.subtotal)), h("td", {}, statusBadge(o.status))))))) : h("div", { class: "empty" }, h("h2", {}, "No orders yet"), h("p", {}, "When a customer buys from your page, the order shows up here and you get a notification.")),
      h("div", { class: "row between", style: "margin-top:14px" }, h("button", { class: "btn sm", disabled: page < 2, onclick: () => { page--; load(); } }, "← Newer"), h("span", { class: "hint" }, `${r.total} order${r.total === 1 ? "" : "s"}`), h("button", { class: "btn sm", disabled: page * 20 >= r.total, onclick: () => { page++; load(); } }, "Older →")));
  }
  put(root, h("div", { class: "row between" }, h("h1", {}, "Orders"), sel), box); await load();
}

async function renderDetail(root, id) {
  const o = await api(`/seller/orders/${id}`); const a = o.address || {};
  put(root, h("a", { href: "#/orders" }, "← All orders"), h("div", { class: "row between", style: "margin-top:8px" }, h("h1", {}, o.orderNumber), statusBadge(o.status)),
    h("p", { class: "hint" }, `${fmtDate(o.createdAt)} · ${o.paymentMethod === "cod" ? "Cash on delivery" : o.paymentMethod} · ${o.paymentStatus}`),
    h("div", { class: "card" }, h("h2", {}, "Items to pack"), o.items.map((i) => h("div", { class: "oitem" }, i.imageUrl ? h("img", { src: i.imageUrl, alt: "" }) : h("span", { style: "width:52px" }),
      h("div", { class: "grow" }, h("b", {}, i.name), h("div", { class: "hint" }, [i.size, i.color, i.sku].filter(Boolean).join(" · "))), h("div", {}, `${i.qty} × ${money(i.unitPrice)}`))),
      h("div", { class: "row end", style: "margin-top:10px" }, h("b", {}, `Your total: ${money(o.subtotal)}`))),
    h("div", { class: "card" }, h("h2", {}, "Deliver to"), h("p", { style: "margin:0;line-height:1.6" }, h("b", {}, o.customer.name), h("br"), o.customer.phone, h("br"), [a.line1, a.line2, a.city, a.province, a.postalCode].filter(Boolean).join(", ")),
      o.notes ? h("p", { class: "hint" }, "Note from customer: " + o.notes) : null),
    h("p", { class: "hint" }, "The store updates the order status and handles payment collection. Contact the store if something is wrong with this order."));
}
