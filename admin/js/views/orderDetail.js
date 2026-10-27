import { api } from "../api.js";
import { clear, confirmDialog, fmtDate, h, money, put, showFieldErrors, STATUS_LABEL, statusBadge, toast } from "../ui.js";

export async function renderOrderDetail(view, id) {
  let o = await api(`/admin/orders/${id}`);
  const root = h("div", {});
  put(clear(view), root);
  draw();

  function draw() {
    const a = o.address;
    const status = h("select", { id: "newstatus", "aria-label": "New status" }, h("option", { value: "" }, "Choose next status"), o.allowedNext.map((s) => h("option", { value: s }, STATUS_LABEL[s])));
    const note = h("input", { id: "note", maxlength: 300, placeholder: "Optional note (kept in history)" });
    const track = h("input", { id: "track", type: "url", maxlength: 300, placeholder: "https://tracking-link (optional)" });
    const trackField = h("div", { class: "field", hidden: true }, h("label", { for: "track" }, "Tracking link"), track, h("div", { class: "err", "data-err": "trackingUrl" }));
    status.addEventListener("change", () => { trackField.hidden = status.value !== "shipped"; });
    const save = h("button", { class: "btn gold", type: "button", onclick: async () => {
      if (!status.value) { toast("Choose the next status first.", "error"); return; }
      if (status.value === "cancelled" && !(await confirmDialog("Cancel this order?", "Reserved stock goes back on sale. The customer is notified.", "Cancel order"))) return;
      save.disabled = true;
      try {
        o = await api(`/admin/orders/${o.id}/status`, { method: "PATCH", body: { status: status.value, note: note.value.trim() || null, trackingUrl: track.value.trim() || null } });
        toast(`Order marked ${STATUS_LABEL[o.status]}`); draw();
      } catch (e) { showFieldErrors(root, e.fields); toast(e.message, "error"); save.disabled = false; }
    } }, "Update status");

    put(clear(root),
      h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, o.orderNumber), h("p", { class: "muted" }, [statusBadge(o.status), `  Placed ${fmtDate(o.createdAt)}`])),
        h("a", { class: "btn ghost", href: "#/orders" }, "Back to orders")),
      h("div", { class: "cols" },
        h("div", { class: "card" }, h("h2", {}, "Customer"),
          h("dl", { class: "kv" }, h("dt", {}, "Name"), h("dd", {}, o.customer.name), h("dt", {}, "Phone"), h("dd", {}, o.customer.phone), h("dt", {}, "Email"), h("dd", {}, o.customer.email))),
        h("div", { class: "card" }, h("h2", {}, "Delivery address"),
          h("dl", { class: "kv" }, h("dt", {}, "Address"), h("dd", {}, [a.line1, a.line2].filter(Boolean).join(", ")), h("dt", {}, "City"), h("dd", {}, [a.city, a.province, a.postalCode].filter(Boolean).join(", ")),
            o.notes ? [h("dt", {}, "Customer note"), h("dd", {}, o.notes)] : null, o.trackingUrl ? [h("dt", {}, "Tracking"), h("dd", {}, o.trackingUrl)] : null))),
      h("div", { class: "card" }, h("h2", {}, "Items"),
        h("table", {}, h("thead", {}, h("tr", {}, ["", "Product", "Options", "Price", "Qty", "Line total"].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", {}, o.items.map((i) => h("tr", {},
            h("td", {}, i.imageUrl ? h("img", { src: i.imageUrl, alt: "", loading: "lazy" }) : h("div", { class: "thumb", "aria-hidden": "true" }, i.name[0])),
            h("td", { "data-label": "Product" }, h("b", {}, i.name), h("div", { class: "hint" }, i.sku)), h("td", { "data-label": "Options" }, [i.color, i.size].filter(Boolean).join(" / ") || "-"),
            h("td", { "data-label": "Price" }, money(i.unitPrice)), h("td", { "data-label": "Qty" }, i.qty), h("td", { "data-label": "Line total" }, money(i.unitPrice * i.qty)))))),
        h("div", { class: "sum" }, h("div", {}, h("span", {}, "Subtotal"), h("span", {}, money(o.subtotal))),
          o.discount ? h("div", {}, h("span", {}, "Discount"), h("span", {}, "- " + money(o.discount))) : null,
          h("div", {}, h("span", {}, "Shipping"), h("span", {}, o.shipping ? money(o.shipping) : "Free")),
          h("div", { class: "tot" }, h("span", {}, "Total"), h("span", {}, money(o.total))),
          h("div", { class: "hint" }, h("span", {}, `Payment: ${o.paymentMethod.toUpperCase()}`), h("span", {}, o.paymentStatus)))),
      h("div", { class: "cols" },
        h("div", { class: "card" }, h("h2", {}, "Update status"),
          o.allowedNext.length ? [h("div", { class: "field" }, h("label", { for: "newstatus" }, "Next status"), status), h("div", { class: "field" }, h("label", { for: "note" }, "Note"), note), trackField, save]
            : h("p", { class: "muted" }, "This order is in a final state. No further changes are possible.")),
        h("div", { class: "card" }, h("h2", {}, "History"),
          h("ul", { class: "tl" }, [...o.history].reverse().map((x) => h("li", {}, h("b", {}, STATUS_LABEL[x.status]), h("div", { class: "hint" }, fmtDate(x.at)), x.note ? h("div", {}, x.note) : null))))));
  }
}
